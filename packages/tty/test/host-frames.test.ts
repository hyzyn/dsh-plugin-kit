/**
 * @hyzyn/dsh-tty — 帧协议与 SessionManager 单元测试（DEFECTS D38 第 3 刀）。
 *
 * TtyServer 用假 WS 连接 + 假 subprocess（spawnTerminal 产出可编程的假 PTY）
 * 驱动**真实**的消息处理路径（onConnection → handleMessage），表覆盖：
 *   - 帧校验：非法 sid、未知帧静默、input 长度上限、resize 尺寸 clamp（D14）；
 *   - kill 的孤儿前提（D09）：活跃会话不被任意连接凭 sid 杀；
 *   - 绑定与孤儿：断连转孤儿（grace）、attach 回放、exit 广播（D06/D07 语义面）；
 *   - SessionManager 直测：上限、reapOrphans 的 grace=0 立即回收与按龄回收（D08）。
 * 不追求覆盖率：只钉「修复过的行为 + 边界」。
 */
// DSH_HOME 隔离（D69）：读不到开发机上的真实授权文件
import './isolated-home.js'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EXITED_RETAIN_MS, MAX_EXITED_SESSIONS, SessionManager, TtyServer, killLocalShellTerminal, newScreenHeartbeat, wrapLocalPty } from '../src/index.js'
import type { TermHandle } from '../src/ssh.js'

/* ----------------------------- 假件 ----------------------------- */

type Frame = Record<string, unknown>

/** 假 WS：send 记录帧，readyState 恒 OPEN，事件用 EventEmitter 注入。 */
class FakeWs extends EventEmitter {
  readyState = 1 // WebSocket.OPEN
  bufferedAmount = 0
  frames: Frame[] = []
  closed = false
  send(data: string, cb?: (error?: Error) => void): void {
    this.frames.push(JSON.parse(data) as Frame)
    cb?.()
  }
  close(): void {
    this.closed = true
  }
  sent(t: string): Frame[] {
    return this.frames.filter((frame) => frame.t === t)
  }
  /** 等到某类型的帧出现（处理是 async 的，直接断言会抢跑）。 */
  async waitFor(t: string, timeoutMs = 2000): Promise<Frame> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const hit = this.sent(t).at(-1)
      if (hit !== undefined) return hit
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error(`等待 ${t} 帧超时；已收: ${JSON.stringify(this.frames.map((f) => f.t))}`)
  }
}

interface FakePty extends TermHandle {
  resizeCalls: Array<[number, number]>
  writes: string[]
  killCalls: string[]
  settle: (outcome: { exitCode: number | null; signal: string | null }) => void
  /** terminate 时是否兑现 done（false 模拟「forceKill 后 done 迟迟不兑现」的后端）。 */
  settleOnTerminate: boolean
}

function makePty(): FakePty {
  let settleDone!: (outcome: { exitCode: number | null; signal: string | null }) => void
  const done = new Promise<{ exitCode: number | null; signal: string | null }>((resolve) => {
    settleDone = resolve
  })
  const pty = {
    resizeCalls: [] as Array<[number, number]>,
    killCalls: [] as string[],
  }
  const fake: FakePty = {
    kind: 'local',
    pid: 4242,
    output: new PassThrough(),
    done,
    write: async (data: string) => {
      fake.writes.push(data)
    },
    // wrapLocalPty 把 resize/kill 透传给 node-pty 内部结构（terminal 子对象）
    terminal: {
      resize: (cols: number, rows: number) => {
        pty.resizeCalls.push([cols, rows])
      },
      kill: (signal: string) => {
        pty.killCalls.push(signal)
      },
    },
    terminate: async () => {
      if (fake.settleOnTerminate) settleDone({ exitCode: 0, signal: null })
      return true
    },
    forceKill: () => {
      pty.killCalls.push('SIGKILL')
    },
    resizeCalls: pty.resizeCalls,
    writes: [],
    killCalls: pty.killCalls,
    settle: (outcome) => settleDone(outcome),
    settleOnTerminate: true,
  }
  return fake
}

interface Harness {
  server: TtyServer
  sessions: SessionManager
  ptys: FakePty[]
  /** 宿主 logger.warn 的内容（淘汰留痕这类「事后可查」的证据靠它断言）。 */
  warns: string[]
  connect(): FakeWs
}

function makeHarness(overrides: Partial<{ graceSec: number; maxSessions: number; assistEnabled: boolean }> = {}): Harness {
  const ptys: FakePty[] = []
  const warns: string[] = []
  const ctx = {
    logger: { info: () => {}, warn: (message: string) => { warns.push(message) } },
    get(name: string): unknown {
      if (name === 'subprocess') {
        return {
          spawnTerminal: async () => {
            const pty = makePty()
            ptys.push(pty)
            return pty
          },
        }
      }
      return undefined
    },
  }
  const sessions = new SessionManager(overrides.maxSessions ?? 4)
  const options = {
    shell: '/bin/zsh',
    term: 'xterm-256color',
    colorTerm: 'truecolor',
    cwd: tmpdir(),
    reconnectGraceMs: (overrides.graceSec ?? 60) * 1000,
    sshHosts: [],
    hostKeys: [],
    shellIntegration: false,
    tunnels: [],
    persistence: 'off' as const,
    endOnPageClose: false,
    statsEnabled: true,
    // AI 辅助：默认关（用例按需打开，见文件末尾的「失败徽标」一节）
    assistEnabled: overrides.assistEnabled === true,
    assistProvider: '',
    assistModel: '',
    persistSessions: [],
    findSshHost: () => undefined,
  }
  const server = new TtyServer(
    ctx as never,
    sessions,
    options as never,
    { get: () => undefined, record: () => {} },
    () => {},
  )
  return {
    server,
    sessions,
    ptys,
    warns,
    connect: () => {
      const ws = new FakeWs()
      // onConnection 是 private：测试经类型断言走真实入口（含 cleanupAll 接线）
      ;(server as unknown as { onConnection(ws: FakeWs): void }).onConnection(ws)
      return ws
    },
  }
}

async function spawnLocal(ws: FakeWs, sid: string): Promise<void> {
  ws.emit('message', Buffer.from(JSON.stringify({ t: 'spawn', sid, cwd: tmpdir() })))
  await ws.waitFor('ready')
}

/* ----------------------------- 帧校验（D14） ----------------------------- */

describe('帧校验', () => {
  let h: Harness
  beforeEach(() => {
    h = makeHarness()
  })
  afterEach(async () => {
    await h.sessions.disposeAll()
  })

  it('spawn 非法 sid → error 帧，不建会话', async () => {
    const ws = h.connect()
    ws.emit('message', Buffer.from(JSON.stringify({ t: 'spawn', sid: 'bad sid!' })))
    const frame = await ws.waitFor('error')
    expect(frame.m).toBe('非法 sid')
    expect(h.sessions.count).toBe(0)
  })

  it('spawn 正常 → ready 帧带 pid，会话入表', async () => {
    const ws = h.connect()
    await spawnLocal(ws, 'abc123')
    const ready = ws.sent('ready').at(-1)
    expect(ready).toMatchObject({ t: 'ready', sid: 'abc123', pid: 4242 })
    expect(h.sessions.count).toBe(1)
  })

  it('未知帧类型 → 静默（不崩、不回帧）', async () => {
    const ws = h.connect()
    ws.emit('message', Buffer.from(JSON.stringify({ t: 'bogus-frame' })))
    await new Promise((r) => setTimeout(r, 50))
    expect(ws.frames).toEqual([])
  })

  it('input 超过 128KB → 拒绝；正常 input 透传到 PTY（D14）', async () => {
    const ws = h.connect()
    await spawnLocal(ws, 'abc123')
    ws.emit('message', Buffer.from(JSON.stringify({ t: 'input', sid: 'abc123', d: 'x'.repeat(128 * 1024 + 1) })))
    const frame = await ws.waitFor('error')
    expect(frame.m).toContain('input 帧过大')
    ws.emit('message', Buffer.from(JSON.stringify({ t: 'input', sid: 'abc123', d: 'ls\n' })))
    await new Promise((r) => setTimeout(r, 50))
    expect(h.ptys[0].writes).toEqual(['ls\n'])
  })

  it.each([
    [1e9, 2e9, [500, 200]],
    [-5, -1, [2, 2]],
    [1.5, 2.5, [2, 3]],
    [undefined, undefined, [80, 24]],
  ])('resize 尺寸 clamp：%s×%s → %j（D14）', async (cols, rows, expected) => {
    const ws = h.connect()
    await spawnLocal(ws, 'abc123')
    ws.emit('message', Buffer.from(JSON.stringify({ t: 'resize', sid: 'abc123', cols, rows })))
    await new Promise((r) => setTimeout(r, 50))
    expect(h.ptys[0].resizeCalls.at(-1)).toEqual(expected)
  })

  it('resize 收到 null（客户端把 NaN 序列化的结果）→ 回落 80×24，不夹成 2×2（D79）', async () => {
    const ws = h.connect()
    await spawnLocal(ws, 'abc123')
    // 现场：agent 开的标签不在前台 ⇒ proposeDimensions 给 NaN ⇒ JSON.stringify 写成 null；
    // `Number(null)` = 0 是有限数，老 clampInt 于是把它夹到下限 2 ⇒ PTY 被压成 2×2。
    ws.emit('message', Buffer.from(JSON.stringify({ t: 'resize', sid: 'abc123', cols: null, rows: null })))
    await new Promise((r) => setTimeout(r, 50))
    const applied = h.ptys[0].resizeCalls.at(-1)
    expect(applied).toEqual([80, 24])
    expect(applied).not.toEqual([2, 2])
  })

  it.each([
    ['空字符串', ''],
    ['布尔', true],
    ['对象', { cols: 10 }],
  ])('resize 的非数值输入（%s）按非法处理 → 80×24（D79）', async (_label, cols) => {
    const ws = h.connect()
    await spawnLocal(ws, 'abc123')
    ws.emit('message', Buffer.from(JSON.stringify({ t: 'resize', sid: 'abc123', cols, rows: cols })))
    await new Promise((r) => setTimeout(r, 50))
    expect(h.ptys[0].resizeCalls.at(-1)).toEqual([80, 24])
  })

  it('数字字符串仍然照数字处理（老配置 / 手工帧的兼容面不被 D79 误伤）', async () => {
    const ws = h.connect()
    await spawnLocal(ws, 'abc123')
    ws.emit('message', Buffer.from(JSON.stringify({ t: 'resize', sid: 'abc123', cols: '120', rows: '30' })))
    await new Promise((r) => setTimeout(r, 50))
    expect(h.ptys[0].resizeCalls.at(-1)).toEqual([120, 30])
  })

  it('窄但合法的尺寸照原样透传（门槛在客户端，宿主不擅自拒绝小终端）', async () => {
    const ws = h.connect()
    await spawnLocal(ws, 'abc123')
    ws.emit('message', Buffer.from(JSON.stringify({ t: 'resize', sid: 'abc123', cols: 40, rows: 10 })))
    await new Promise((r) => setTimeout(r, 50))
    expect(h.ptys[0].resizeCalls.at(-1)).toEqual([40, 10])
  })

  it('多会话不指定 sid → 提示指定；单会话可省略', async () => {
    const ws = h.connect()
    await spawnLocal(ws, 's1')
    ws.emit('message', Buffer.from(JSON.stringify({ t: 'input', d: 'x' })))
    await new Promise((r) => setTimeout(r, 30))
    expect(h.ptys[0].writes).toEqual(['x'])
    await spawnLocal(ws, 's2')
    ws.emit('message', Buffer.from(JSON.stringify({ t: 'input', d: 'y' })))
    const frame = await ws.waitFor('error')
    expect(frame.m).toContain('请指定 sid')
  })
})

describe('会话上限（SessionManager）', () => {
  it('达到上限的 spawn 被拒，错误帧带上限值', async () => {
    const h = makeHarness({ maxSessions: 1 })
    const ws = h.connect()
    await spawnLocal(ws, 'first')
    ws.emit('message', Buffer.from(JSON.stringify({ t: 'spawn', sid: 'second', cwd: tmpdir() })))
    const frame = await ws.waitFor('error')
    expect(String(frame.m)).toContain('会话数已达上限（1）')
    expect(h.sessions.count).toBe(1)
    await h.sessions.disposeAll()
  })
})

describe('kill 的孤儿前提（D09）', () => {
  it('活跃会话不被其它连接凭 sid 杀；本连接可以', async () => {
    const h = makeHarness()
    const wsA = h.connect()
    await spawnLocal(wsA, 'sess1')
    const wsB = h.connect()
    wsB.emit('message', Buffer.from(JSON.stringify({ t: 'kill', sid: 'sess1' })))
    const frame = await wsB.waitFor('error')
    expect(String(frame.m)).toContain('正连接在其它窗口')
    expect(h.sessions.count).toBe(1) // 活着
    expect(wsA.sent('exit')).toHaveLength(0)
    // 本连接 kill → 会话结束 + exit 帧
    wsA.emit('message', Buffer.from(JSON.stringify({ t: 'kill', sid: 'sess1' })))
    await wsA.waitFor('exit')
    expect(h.sessions.count).toBe(0)
    await h.sessions.disposeAll()
  })

  it('PTY 句柄的 done 不兑现时，显式 kill 仍按 SIGKILL 兜底结案并发 exit 帧', async () => {
    // 背景（CI 实测）：rc.1 的 dsh-subprocess-local 在 Linux 上 forceKill 之后
    // handle.done 迟迟不 resolve，exit 帧就永远发不出去（前端契约是「kill 必回 exit」）。
    // 这里把 terminate 设成不兑现 done，钉住 2s 兜底结案。
    const h = makeHarness()
    const ws = h.connect()
    await spawnLocal(ws, 'stuck')
    h.ptys[0].settleOnTerminate = false
    ws.emit('message', Buffer.from(JSON.stringify({ t: 'kill', sid: 'stuck' })))
    const exit = await ws.waitFor('exit', 6000)
    expect(exit.signal).toBe('SIGKILL')
    expect(exit.code).toBeNull()
    expect(h.sessions.count).toBe(0)
    await h.sessions.disposeAll()
  })

  it('无人绑定的孤儿仍允许跨连接 kill（关面板杀得掉孤儿）', async () => {
    const h = makeHarness()
    const wsA = h.connect()
    await spawnLocal(wsA, 'sess1')
    wsA.emit('close') // A 断开 → 转孤儿
    const wsB = h.connect()
    wsB.emit('message', Buffer.from(JSON.stringify({ t: 'kill', sid: 'sess1' })))
    await until(() => h.sessions.count === 0)
    await h.sessions.disposeAll()
  })
})

describe('断连孤儿 / attach 回放（D06/D07 语义面）', () => {
  it('断连转孤儿 → attach 接回并回放缓冲 → exit 广播到新连接', async () => {
    const h = makeHarness()
    const wsA = h.connect()
    await spawnLocal(wsA, 'sess1')
    h.ptys[0].output.write('hello-replay\r\n')
    await wsA.waitFor('data')
    wsA.emit('close') // 断开 → grace>0 → 转孤儿
    await until(() => h.sessions.listForAttach()[0]?.attachable === true)
    const wsB = h.connect()
    wsB.emit('message', Buffer.from(JSON.stringify({ t: 'attach', sid: 'sess1' })))
    const ready = await wsB.waitFor('ready')
    expect(ready).toMatchObject({ t: 'ready', sid: 'sess1', reattached: true })
    // 环形缓冲回放
    const replay = wsB.sent('data').map((f) => String(f.d ?? '')).join('')
    expect(replay).toContain('hello-replay')
    // 进程退出 → exit 广播到当前绑定的 B；D77 起会话转**只读保留**（不再立刻出表，
    // 由 tty_capture/tty_screen 继续可读，直到显式关闭或宿主重启）
    h.ptys[0].settle({ exitCode: 3, signal: null })
    const exit = await wsB.waitFor('exit')
    expect(exit).toMatchObject({ t: 'exit', sid: 'sess1', code: 3 })
    expect(h.sessions.get('sess1')?.exited).toMatchObject({ code: 3 })
    await h.sessions.disposeAll()
  })
})

/* ---------------- 终局尾巴：退出前最后一批输出必须发出（D76） ---------------- */

describe('终局尾巴（D76）', () => {
  it('写入后**立刻**退出：尾巴仍发给面板，且 data 帧在 exit 帧之前', async () => {
    const h = makeHarness()
    const ws = h.connect()
    await spawnLocal(ws, 'tail1')
    // 合并窗口是 12ms：输出落在窗口内、紧接着 done 兑现——旧实现里这一批被
    // flushPendingOutput 首行的 `closed` 守卫整批吞掉（面板只收到 ready + exit）
    h.ptys[0].output.write('TAIL-LINE\r\n')
    await new Promise((r) => setImmediate(r))
    h.ptys[0].settle({ exitCode: 0, signal: null })
    await ws.waitFor('exit')
    const types = ws.frames.map((f) => f.t)
    expect(types).toContain('data')
    expect(types.indexOf('data')).toBeLessThan(types.indexOf('exit'))
    expect(ws.sent('data').map((f) => String(f.d ?? '')).join('')).toContain('TAIL-LINE')
    await h.sessions.disposeAll()
  })

  it('终局之后到达的输出不再成帧（force 只补尾巴，不复活已 closed 的会话）', async () => {
    const h = makeHarness()
    const ws = h.connect()
    await spawnLocal(ws, 'tail2')
    h.ptys[0].settle({ exitCode: 0, signal: null })
    await ws.waitFor('exit')
    h.ptys[0].output.write('AFTER-EXIT\r\n')
    await new Promise((r) => setTimeout(r, 60))
    expect(ws.sent('data')).toHaveLength(0)
    await h.sessions.disposeAll()
  })
})

async function until(cond: () => boolean, ms = 2000): Promise<void> {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('测试等待超时')
    await new Promise((r) => setTimeout(r, 10))
  }
}

/* ----------------------------- SessionManager 直测（D08） ----------------------------- */

describe('SessionManager', () => {
  function sessionOf(id: string, overrides: Partial<Record<string, unknown>> = {}): never {
    throw new Error('helper placeholder')
  }
  function makeSession(id: string, overrides: { orphanedAt?: number | null; tmuxName?: string | null; exited?: { code: number | null; signal: string | null; at: number } | null; screen?: unknown } = {}): any {
    let settleDone!: (outcome: { exitCode: number | null; signal: string | null }) => void
    const done = new Promise<{ exitCode: number | null; signal: string | null }>((resolve) => {
      settleDone = resolve
    })
    const state = { terminated: false }
    return {
      id,
      handle: {
        kind: 'local',
        pid: 1,
        output: new PassThrough(),
        done,
        write: async () => {},
        resize: () => {},
        terminate: async () => {
          state.terminated = true
          settleDone({ exitCode: 0, signal: null })
          return true
        },
      },
      clients: new Map(),
      closed: false,
      exited: overrides.exited ?? null,
      paused: false,
      cwd: '',
      kind: 'local',
      target: '',
      startedAt: Date.now(),
      lastOutputAt: Date.now(),
      lastInputAt: Date.now(),
      buffer: '',
      decoder: new (require('node:string_decoder').StringDecoder)('utf8'),
      screen: overrides.screen ?? null,
      screenHeartbeat: newScreenHeartbeat(),
      screenDownReason: null,
      orphanedAt: overrides.orphanedAt ?? null,
      shellState: { carry: '', inCommand: false, cmdBuffer: '', pendingT: null, lastCommand: null },
      pendingOutput: '',
      flushTimer: null,
      tmuxName: overrides.tmuxName ?? null,
      statsSubs: new Set(),
      stats: null,
      statsFailed: false,
      _state: state,
    }
  }

  it('上限与 setLimit', () => {
    const sm = new SessionManager(2)
    expect(sm.canSpawn()).toBe(true)
    sm.add(makeSession('a'))
    sm.add(makeSession('b'))
    expect(sm.canSpawn()).toBe(false)
    expect(sm.limitValue).toBe(2)
    sm.setLimit(3)
    expect(sm.canSpawn()).toBe(true)
  })

  it('reapOrphans(0) 立即回收全部孤儿，不动在线会话（D08）', async () => {
    const sm = new SessionManager(4)
    const orphan = makeSession('o1', { orphanedAt: Date.now() })
    const online = makeSession('on1')
    sm.add(orphan)
    sm.add(online)
    await sm.reapOrphans(0)
    expect((orphan as { _state: { terminated: boolean } })._state.terminated).toBe(true)
    expect((online as { _state: { terminated: boolean } })._state.terminated).toBe(false)
    expect(sm.count).toBe(1)
  })

  it('reapOrphans(grace) 按龄回收：过期孤儿回收，新孤儿保留', async () => {
    const sm = new SessionManager(4)
    const stale = makeSession('stale', { orphanedAt: Date.now() - 5000 })
    const fresh = makeSession('fresh', { orphanedAt: Date.now() })
    sm.add(stale)
    sm.add(fresh)
    await sm.reapOrphans(2000)
    expect((stale as { _state: { terminated: boolean } })._state.terminated).toBe(true)
    expect((fresh as { _state: { terminated: boolean } })._state.terminated).toBe(false)
  })

  it('listForAttach：无绑定的未关闭会话可 attach；findByTmuxName 按名查找', () => {
    const sm = new SessionManager(4)
    const orphan = makeSession('o', { orphanedAt: Date.now(), tmuxName: 'dsh-x' })
    sm.add(orphan)
    expect(sm.listForAttach()[0]).toMatchObject({ sid: 'o', attachable: true })
    expect(sm.findByTmuxName('dsh-x')?.id).toBe('o')
    orphan.clients.set('c:1', { ws: new FakeWs(), sid: 'c1' })
    expect(sm.listForAttach()[0]?.attachable).toBe(false)
    expect(sm.findByTmuxName('dsh-missing')).toBeUndefined()
  })
})

describe('endOnPageClose × tmux 收尾（D45：孤儿回收策略）', () => {
  /** 带 tmux 会话的替身：只补 destroy/retire 会碰到的字段 + tmuxTeardown 计数器。 */
  function makeTmuxSession(tmuxName: string | null, spies: { tmux: number }): any {
    return {
      id: 'sid-' + String(tmuxName),
      handle: {
        kind: 'local',
        pid: 9,
        output: new PassThrough(),
        done: new Promise(() => {}),
        write: async () => {},
        resize: () => {},
        terminate: async () => true,
        tmuxTeardown: async () => {
          spies.tmux += 1
        },
      },
      clients: new Map(),
      closed: false,
      exited: null,
      paused: false,
      cwd: '',
      kind: 'local',
      target: '',
      startedAt: Date.now(),
      lastOutputAt: Date.now(),
      lastInputAt: Date.now(),
      buffer: '',
      decoder: null as never,
      screen: null,
      screenHeartbeat: newScreenHeartbeat(),
      screenDownReason: null,
      orphanedAt: Date.now() - 1000, // 已过保活期
      shellState: { carry: '', inCommand: false, cmdBuffer: '', pendingT: null, lastCommand: null },
      pendingOutput: '',
      flushTimer: null,
      tmuxName,
      statsSubs: new Set(),
      stats: null,
      statsFailed: false,
    }
  }

  it('endOnPageClose=true → 回收孤儿时连 tmux 会话一起结束（kill-session）', async () => {
    const spies = { tmux: 0 }
    const sm = new SessionManager(4, () => true)
    sm.add(makeTmuxSession('dsh-a', spies))
    await sm.reapOrphans(0)
    await until(() => spies.tmux === 1)
    expect(spies.tmux).toBe(1)
    expect(sm.count).toBe(0)
  })

  it('endOnPageClose=false（默认）→ 回收孤儿但 tmux 会话留存，可再 attach 回来', async () => {
    const spies = { tmux: 0 }
    const sm = new SessionManager(4, () => false)
    sm.add(makeTmuxSession('dsh-b', spies))
    await sm.reapOrphans(0)
    await until(() => sm.count === 0)
    expect(spies.tmux).toBe(0) // 持久会话留在远程：下次同名 new-session -A 接回现场
  })

  it('非持久会话（tmuxName=null）→ 任何策略都不碰 tmux 收尾', async () => {
    const spies = { tmux: 0 }
    const sm = new SessionManager(4, () => true)
    sm.add(makeTmuxSession(null, spies))
    await sm.reapOrphans(0)
    await until(() => sm.count === 0)
    expect(spies.tmux).toBe(0)
  })

  it('在线会话（未转孤儿）不被回收器碰，也不结束其 tmux 会话', async () => {
    const spies = { tmux: 0 }
    const sm = new SessionManager(4, () => true)
    const online = makeTmuxSession('dsh-c', spies)
    online.orphanedAt = null
    sm.add(online)
    await sm.reapOrphans(0)
    expect(sm.count).toBe(1)
    expect(spies.tmux).toBe(0)
  })
})

describe('killLocalShellTerminal（D48：Windows 不能带 signal）', () => {
  it('win32 → 不带 signal 调 kill（带 signal 会同步 throw，还可能被 defer 到 socket 回调 → 宿主崩溃）', () => {
    const calls: Array<string | undefined> = []
    killLocalShellTerminal({ kill: (signal?: string) => calls.push(signal) }, 'win32')
    expect(calls).toEqual([undefined])
  })

  it('linux / darwin → 带 SIGKILL（terminate 失败后的升级强杀）', () => {
    for (const platform of ['linux', 'darwin'] as const) {
      const calls: Array<string | undefined> = []
      killLocalShellTerminal({ kill: (signal?: string) => calls.push(signal) }, platform)
      expect(calls).toEqual(['SIGKILL'])
    }
  })

  it('没有 terminal / 没有 kill → 安静返回（best-effort，不抛）', () => {
    expect(() => killLocalShellTerminal(undefined, 'win32')).not.toThrow()
    expect(() => killLocalShellTerminal({}, 'win32')).not.toThrow()
  })

  it('kill 自身抛错 → 被吞掉（会话可能已退出，不能把清理路径变成崩溃）', () => {
    expect(() => killLocalShellTerminal({ kill: () => { throw new Error('boom') } }, 'linux')).not.toThrow()
  })
})

/* ------------------- agent 侧会话（tty_open / tty_close / tty_stats，0.20.0） ------------------- */

describe('agent 开的终端会话（tty_open / tty_close）', () => {
  it('openAgentSession → 无客户端会话入表，且不被孤儿回收器收掉', async () => {
    const h = makeHarness()
    const { sid } = await h.server.openAgentSession({ cwd: tmpdir() })
    const snapshot = h.sessions.list().find((s) => s.sid === sid)
    expect(snapshot).toBeDefined()
    expect(snapshot?.owner).toBe('agent')
    // 关键：没有客户端绑定的 agent 会话，grace=0 的回收也不能杀它
    // （否则长驻任务刚起来就被秒收）
    await h.sessions.reapOrphans(0)
    expect(h.sessions.get(sid)).toBeDefined()
    expect(h.ptys[0].killCalls).toEqual([])
    await h.sessions.disposeAll()
  })

  it('用户开的会话 owner=user；孤儿（断连）仍按 grace 回收——豁免只给 agent', async () => {
    const h = makeHarness()
    const ws = h.connect()
    await spawnLocal(ws, 'user1')
    expect(h.sessions.list()[0]?.owner).toBe('user')
    ws.emit('close') // 断开 → 孤儿
    await until(() => h.sessions.listForAttach()[0]?.attachable === true)
    await h.sessions.reapOrphans(0)
    expect(h.sessions.get('user1')).toBeUndefined()
  })

  it('closeAgentSession 关得掉 agent 自己的会话', async () => {
    const h = makeHarness()
    const { sid } = await h.server.openAgentSession({ cwd: tmpdir() })
    await h.server.closeAgentSession(sid)
    expect(h.sessions.get(sid)).toBeUndefined()
  })

  it('closeAgentSession 拒绝关用户的会话（agent 不越权结束用户正在用的标签）', async () => {
    const h = makeHarness()
    const ws = h.connect()
    await spawnLocal(ws, 'user2')
    await expect(h.server.closeAgentSession('user2')).rejects.toThrow(/owner=user/)
    // 拒绝之后会话必须仍然活着
    expect(h.sessions.get('user2')).toBeDefined()
    expect(h.ptys[0].killCalls).toEqual([])
    await h.sessions.disposeAll()
  })

  it('超过会话上限时 tty_open 报错而不是静默失败', async () => {
    const h = makeHarness({ maxSessions: 1 })
    const ws = h.connect()
    await spawnLocal(ws, 'only')
    await expect(h.server.openAgentSession({ cwd: tmpdir() })).rejects.toThrow(/上限/)
    await h.sessions.disposeAll()
  })

  it('cwd 不存在 → 明确报错（不落到 node-pty 的难懂异常）', async () => {
    const h = makeHarness()
    await expect(h.server.openAgentSession({ cwd: '/definitely/not/here/xyz' })).rejects.toThrow(/cwd 不存在/)
  })

  it('agent 开的会话对面板可见（sessions 帧广播，带 owner=agent）', async () => {
    const h = makeHarness()
    const ws = h.connect() // 模拟已打开的面板
    const { sid } = await h.server.openAgentSession({ cwd: tmpdir() })
    const frame = await ws.waitFor('sessions')
    const list = frame.list as Array<{ sid: string; owner: string }>
    expect(list.some((s) => s.sid === sid && s.owner === 'agent')).toBe(true)
    await h.sessions.disposeAll()
  })
})

/* ------------------------- 虚拟屏退役接线（D57 跟进） ------------------------- */

/**
 * 兜底（`installXtermScreenCrashGuard`）只保证宿主不死；被吞掉异常的那块屏会**永久停摆**
 * （出错那批数据留在写队列、`_bufferOffset` 不前进），`tty_screen` 会一直返回冻结画面。
 * 这里走真实路径（onConnection → spawn → PTY 输出 → onData）验证接线：屏不可用时被退役，
 * 且**只摘屏、不动会话**（PTY 与前端照常）。
 *
 * 停摆的两种触发都在 screen-crash.test.ts 里单测；这里用「写就抛」的假屏走**同步抛出**
 * 那条，不必等 5s 窗口。
 */
/* ------------------- 退出后的只读保留（D77，issue #4 的正题） ------------------- */

describe('退出后的只读保留（D77）', () => {
  /** 只读保留相关的纯替身（与上面 SessionManager 那组同构，但能预置 exited / screen）。 */
  function makeSession(id: string, overrides: { orphanedAt?: number | null; exited?: { code: number | null; signal: string | null; at: number } | null; screen?: unknown } = {}): any {
    return {
      id,
      handle: { kind: 'local', pid: 1, output: new PassThrough(), done: new Promise(() => {}), write: async () => {}, resize: () => {}, terminate: async () => true },
      clients: new Map(),
      closed: false,
      exited: overrides.exited ?? null,
      paused: false,
      cwd: '',
      kind: 'local',
      target: '',
      startedAt: Date.now(),
      lastOutputAt: Date.now(),
      lastInputAt: Date.now(),
      buffer: '',
      decoder: null as never,
      screen: overrides.screen ?? null,
      screenHeartbeat: newScreenHeartbeat(),
      screenDownReason: null,
      orphanedAt: overrides.orphanedAt ?? null,
      shellState: { carry: '', inCommand: false, cmdBuffer: '', pendingT: null, lastCommand: null },
      pendingOutput: '',
      flushTimer: null,
      tmuxName: null,
      statsSubs: new Set(),
      stats: null,
      statsFailed: false,
    }
  }

  it('进程退出 → 会话仍在表里：closed=false、exited 带 code/signal、屏与缓冲都还在', async () => {
    const h = makeHarness()
    const ws = h.connect()
    await spawnLocal(ws, 'keep1')
    h.ptys[0].output.write('BEFORE-EXIT\r\n')
    await ws.waitFor('data')
    h.ptys[0].settle({ exitCode: null, signal: 'SIGSEGV' })
    await ws.waitFor('exit')
    const session = h.sessions.get('keep1')
    expect(session, '「退出即退役」是 D77 要改掉的旧行为').toBeDefined()
    expect(session?.closed).toBe(false)
    expect(session?.exited).toMatchObject({ code: null, signal: 'SIGSEGV' })
    // 读侧的两条数据源都还在：环形缓冲（tty_capture）与虚拟屏（tty_screen）
    expect(session?.buffer).toContain('BEFORE-EXIT')
    expect(session?.screen).not.toBeNull()
    // 快照如实带保留态（tty_list / sessions 帧的数据源）
    expect(h.sessions.list()[0]).toMatchObject({ sid: 'keep1', exited: true, signal: 'SIGSEGV' })
    // 默认策略是 ∞（保留到显式关闭）：不报剩余时间——不能塞 Infinity（JSON → null），
    // 省略该字段才是「不按时间释放」
    expect(h.sessions.list()[0]?.retainMs).toBeUndefined()
    // 保留态不可 attach（没有活着的 PTY 可接回）
    expect(h.sessions.listForAttach()[0]?.attachable).toBe(false)
    await h.sessions.disposeAll()
  })

  it('attach 保留态被明确拒绝（不是含糊的「会话不存在」）', async () => {
    const h = makeHarness()
    const wsA = h.connect()
    await spawnLocal(wsA, 'keep2')
    h.ptys[0].settle({ exitCode: 3, signal: null })
    await wsA.waitFor('exit')
    const wsB = h.connect()
    wsB.emit('message', Buffer.from(JSON.stringify({ t: 'attach', sid: 'keep2' })))
    const err = await wsB.waitFor('error')
    expect(String(err.m)).toContain('只读保留')
    expect(String(err.m)).toContain('exitCode=3')
    await h.sessions.disposeAll()
  })

  it('kill（面板关标签）释放保留态：出表 + 释放屏', async () => {
    const h = makeHarness()
    const ws = h.connect()
    await spawnLocal(ws, 'keep3')
    h.ptys[0].settle({ exitCode: 0, signal: null })
    await ws.waitFor('exit')
    expect(h.sessions.get('keep3')?.closed).toBe(false)
    let disposed = false
    const session = h.sessions.get('keep3')
    if (session !== undefined) session.screen = { dispose: () => { disposed = true } } as never
    ws.emit('message', Buffer.from(JSON.stringify({ t: 'kill', sid: 'keep3' })))
    await until(() => h.sessions.get('keep3') === undefined)
    expect(disposed).toBe(true)
    // D77：保留态只退役、**不再碰句柄**——进程已经没了，对死 PTY 再戳一遍在
    // 个别后端（win-arm64 的 ConPTY）是纯风险，收益为零
    expect(h.ptys[0].killCalls).toEqual([])
    await h.sessions.disposeAll()
  })

  it('保留态不占名额：canSpawn 只数活着的会话', () => {
    const sm = new SessionManager(2)
    sm.add(makeSession('dead-1'))
    sm.add(makeSession('dead-2'))
    sm.add(makeSession('dead-3'))
    expect(sm.exitedCount).toBe(0)
    const one = sm.get('dead-1')
    const two = sm.get('dead-2')
    if (one !== undefined) one.exited = { code: 0, signal: null, at: Date.now() }
    if (two !== undefined) two.exited = { code: 0, signal: null, at: Date.now() }
    expect(sm.exitedCount).toBe(2)
    expect(sm.liveCount).toBe(1)
    expect(sm.canSpawn(), '两条尸体不该顶掉名额').toBe(true)
    sm.add(makeSession('live-2'))
    expect(sm.canSpawn()).toBe(false)
  })

  it('默认策略 ∞：reapExited(EXITED_RETAIN_MS) 不按时间淘汰任何保留态', () => {
    const sm = new SessionManager(4)
    sm.add(makeSession('ancient', { exited: { code: 0, signal: null, at: 0 } }))
    sm.reapExited(EXITED_RETAIN_MS)
    expect(sm.get('ancient'), '默认策略下「保留到显式关闭」，时间不淘汰').toBeDefined()
    expect(EXITED_RETAIN_MS).toBe(Number.POSITIVE_INFINITY)
  })

  it('reapExited 到点退役（出表 + 释放屏），未到点不动（把策略改成有限值时的行为）', () => {
    const sm = new SessionManager(4)
    let disposedStale = false
    let disposedFresh = false
    const retainMs = 60_000 // 显式给一个有限策略（默认是 ∞，测试要钉的是「有限值照常工作」）
    sm.add(makeSession('stale', { exited: { code: 0, signal: null, at: Date.now() - retainMs - 1000 }, screen: { dispose: () => { disposedStale = true } } }))
    sm.add(makeSession('fresh', { exited: { code: 0, signal: null, at: Date.now() - 1000 }, screen: { dispose: () => { disposedFresh = true } } }))
    sm.reapExited(retainMs)
    expect(sm.get('stale')).toBeUndefined()
    expect(disposedStale).toBe(true)
    expect(sm.get('fresh')).toBeDefined()
    expect(disposedFresh).toBe(false)
    sm.reapExited(0) // 保留期配成 0 = 立刻全清（热改语义）
    expect(sm.get('fresh')).toBeUndefined()
  })

  it('capExited 超过上限按最旧淘汰（agent 不主动 close 时的兜底）', () => {
    const sm = new SessionManager(4)
    sm.add(makeSession('oldest', { exited: { code: 0, signal: null, at: Date.now() - 3000 } }))
    sm.add(makeSession('mid', { exited: { code: 0, signal: null, at: Date.now() - 2000 } }))
    sm.add(makeSession('newest', { exited: { code: 0, signal: null, at: Date.now() - 1000 } }))
    const victims = sm.capExited(2)
    expect(victims.map((session) => session.id)).toEqual(['oldest'])
    expect(sm.get('oldest')).toBeUndefined()
    expect(sm.get('mid')).toBeDefined()
    expect(sm.get('newest')).toBeDefined()
    expect(MAX_EXITED_SESSIONS).toBeGreaterThan(0)
  })

  it('reapOrphans 不碰保留态（断线后才退出的孤儿也不能被它收掉）', async () => {
    const sm = new SessionManager(4)
    sm.add(makeSession('orphan-dead', { orphanedAt: Date.now() - 10 * 60_000, exited: { code: 0, signal: null, at: Date.now() - 1000 } }))
    sm.add(makeSession('orphan-live', { orphanedAt: Date.now() - 10 * 60_000 }))
    await sm.reapOrphans(0)
    expect(sm.get('orphan-dead'), '保留态归 reapExited 管').toBeDefined()
    expect(sm.get('orphan-live')).toBeUndefined()
  })

  it('保留超过上限：按最旧淘汰，且淘汰留痕（D77 补：上限 16 + logger.warn）', async () => {
    const h = makeHarness()
    const ws = h.connect()
    const total = MAX_EXITED_SESSIONS + 1
    for (let i = 0; i < total; i++) {
      const sid = `evict-${String(i)}`
      await spawnLocal(ws, sid)
      h.ptys[i].settle({ exitCode: 0, signal: null })
      await until(() => h.sessions.get(sid)?.exited !== null && h.sessions.get(sid)?.exited !== undefined)
    }
    expect(h.sessions.exitedCount).toBe(MAX_EXITED_SESSIONS)
    expect(h.sessions.get('evict-0'), '最旧那条应被淘汰').toBeUndefined()
    expect(h.sessions.get(`evict-${String(total - 1)}`)).toBeDefined()
    expect(h.warns.some((message) => message.includes('evict-0') && message.includes('只读保留已达上限'))).toBe(true)
    expect(MAX_EXITED_SESSIONS).toBe(16)
    await h.sessions.disposeAll()
  })

  it('别的连接用同 sid 新建会话时，旧保留态被摘掉（屏释放，不泄漏）', async () => {
    const h = makeHarness()
    const wsA = h.connect()
    await spawnLocal(wsA, 'same')
    h.ptys[0].settle({ exitCode: 0, signal: null })
    await wsA.waitFor('exit')
    const stale = h.sessions.get('same')
    expect(stale?.exited).not.toBeNull()
    let disposed = false
    if (stale !== undefined) stale.screen = { dispose: () => { disposed = true } } as never
    const wsB = h.connect()
    await spawnLocal(wsB, 'same')
    expect(disposed).toBe(true)
    expect(h.sessions.get('same')?.exited).toBeNull()
    expect(h.ptys).toHaveLength(2)
    await h.sessions.disposeAll()
  })
})

describe('虚拟屏退役接线（D57）', () => {
  it('虚拟屏写入被拒 → 只退役该屏（会话照旧活着），并记下原因', async () => {
    const h = makeHarness()
    const ws = h.connect()
    await spawnLocal(ws, 'sess-d57')
    const session = h.sessions.get('sess-d57')
    expect(session).toBeDefined()
    expect(session?.screen).not.toBeNull() // 生产参数建出来的屏（D57 后 scrollback=1）
    expect(session?.screenDownReason).toBeNull()

    // 注入一块「写就抛」的假屏：等价于写队列超限（5e7 字符）或屏已不可用
    session!.screen = {
      write() {
        throw new Error('write data discarded, use flow control to avoid losing data')
      },
    } as never

    h.ptys[0].output.write('hello\r\n')
    await until(() => session!.screen === null)

    expect(session?.screenDownReason).toContain('写入被拒')
    expect(session?.closed).toBe(false) // 只摘屏，不杀会话
    expect(h.sessions.count).toBe(1)
    await h.sessions.disposeAll()
  })

  it('健康屏不被误退役：正常输出后屏还在、原因仍为 null', async () => {
    const h = makeHarness()
    const ws = h.connect()
    await spawnLocal(ws, 'sess-ok')
    const session = h.sessions.get('sess-ok')
    h.ptys[0].output.write('正常输出\r\n')
    await ws.waitFor('data')
    await new Promise((r) => setTimeout(r, 50))
    expect(session?.screen).not.toBeNull()
    expect(session?.screenDownReason).toBeNull()
    await h.sessions.disposeAll()
  })
})

/* ------------------ 本地 PTY resize 透传的降级可观测性（D79） ------------------ */

describe('wrapLocalPty 的 resize 降级（D79）', () => {
  /** DSH spawnTerminal 返回的 handle 最小形状（terminal 是内部耦合字段）。 */
  function dshHandle(terminal: unknown): never {
    return {
      pid: 1,
      output: new PassThrough(),
      write: async () => {},
      terminate: async () => {},
      done: new Promise(() => {}),
      ...(terminal === undefined ? {} : { terminal }),
    } as never
  }

  it('terminal.resize 可用 → 原样透传（cols, rows）', () => {
    const calls: Array<[number, number]> = []
    const handle = wrapLocalPty(dshHandle({ resize: (cols: number, rows: number) => calls.push([cols, rows]) }))
    handle.resize(120, 30)
    expect(calls).toEqual([[120, 30]])
  })

  it('terminal 被 DSH 改名 / 移除（不再是函数）→ 不抛错，但**必须**记一条日志', () => {
    // 老写法 `handle.terminal?.resize?.(…)` 在这里既不 resize 也不警告：README 承诺的
    // 「改内部结构会警告一次并退化为固定尺寸」是空头支票，排查时毫无线索。
    const warned: string[] = []
    const spy = vi.spyOn(console, 'warn').mockImplementation((message: unknown) => {
      warned.push(String(message))
    })
    try {
      const handle = wrapLocalPty(dshHandle({}))
      expect(() => handle.resize(120, 30)).not.toThrow()
      expect(warned).toHaveLength(1)
      expect(warned[0]).toContain('resize 透传失败')
    } finally {
      spy.mockRestore()
    }
  })

  it('resize 抛错 → 记一条日志，且重复调用只记一次（不逐帧刷屏）', () => {
    const warned: string[] = []
    const spy = vi.spyOn(console, 'warn').mockImplementation((message: unknown) => {
      warned.push(String(message))
    })
    try {
      const handle = wrapLocalPty(
        dshHandle({
          resize: () => {
            throw new Error('ioctl failed')
          },
        }),
      )
      handle.resize(120, 30)
      handle.resize(121, 31)
      expect(warned).toHaveLength(1)
      expect(warned[0]).toContain('ioctl failed')
    } finally {
      spy.mockRestore()
    }
  })
})

describe('SSH 采集失败：退避重挂而不是粘死（D83）', () => {
  /**
   * SSH 会话替身：只补 `startStats` 会碰到的字段 + 一个「一帧未读就结束」的 statsExec。
   * 真实故障就是这样：sshd MaxSessions 拒绝并发 channel、单通道 ECONNRESET——PTY 主通道
   * 健康，采集 channel 一帧未读就没了。修复前这会置一个**永不复位**的失败位。
   */
  function makeSshStatsSession(
    statsExec: (command: string, onLine: (line: string) => void, onExit: () => void) => { stop(): void },
  ): any {
    return {
      id: 'ssh-stats',
      kind: 'ssh',
      handle: { kind: 'ssh', pid: 7, done: new Promise(() => {}), statsExec },
      clients: new Map(),
      closed: false,
      exited: null,
      statsSubs: new Set(),
      stats: null,
      statsFailed: false,
      statsRetryAt: 0,
      statsFailures: 0,
    }
  }

  it('失败后按指数退避自动重挂：30s 一次、翻倍到 60s（不是粘死整个会话）', async () => {
    vi.useFakeTimers()
    try {
      const h = makeHarness()
      let attempts = 0
      const session = makeSshStatsSession((_command, _onLine, onExit) => {
        attempts += 1
        // 一帧未读就结束：POSIX 跳 → 换 PowerShell 再试一次 → 两跳都失败
        queueMicrotask(() => { onExit() })
        return { stop: () => {} }
      })
      const start = (h.server as unknown as { startStats(s: unknown): void }).startStats.bind(h.server)
      start(session)
      await vi.advanceTimersByTimeAsync(0)
      expect(attempts).toBe(2) // 双跳都试过
      expect(session.statsFailed).toBe(true)

      // 第一轮退避 base=30s：到点自动重挂（又两跳）
      await vi.advanceTimersByTimeAsync(30_000)
      expect(attempts).toBe(4)
      expect(session.statsFailed).toBe(true)

      // 第二轮退避翻倍成 60s：29s 时不该有任何动作
      await vi.advanceTimersByTimeAsync(29_000)
      expect(attempts).toBe(4)
      await vi.advanceTimersByTimeAsync(31_000)
      expect(attempts).toBe(6)
    } finally {
      vi.useRealTimers()
    }
  })

  it('重挂后出帧 → 失败位清除、退避计数归零（瞬态故障恢复即自愈）', async () => {
    vi.useFakeTimers()
    try {
      const h = makeHarness()
      let attempts = 0
      const session = makeSshStatsSession((_command, onLine, onExit) => {
        attempts += 1
        if (attempts <= 2) queueMicrotask(() => { onExit() }) // 前两跳（首轮）失败
        else queueMicrotask(() => { onLine('{"cpu":1}') }) // 重挂后出帧
        return { stop: () => {} }
      })
      const start = (h.server as unknown as { startStats(s: unknown): void }).startStats.bind(h.server)
      start(session)
      await vi.advanceTimersByTimeAsync(0)
      expect(session.statsFailed).toBe(true)
      expect(session.statsFailures).toBe(1)

      await vi.advanceTimersByTimeAsync(30_000)
      expect(attempts).toBe(3)
      // 出帧即归零：下次真失败会重新从 base 退避，而不是继承已翻倍的档位
      expect(session.statsFailures).toBe(0)
      expect(session.statsFailed).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})

/* ------------------------------------------------------------------ *
 * 失败徽标（hint 帧，0.24.0）
 *
 * 徽标是「失败即解释」的**入口**，它错了整个功能就没人用得上：不弹 = 功能不存在，
 * 乱弹（0 / Ctrl-C / 同一条命令反复弹）= 用户把它关掉。所以这一节钉的全是**时机**。
 * ------------------------------------------------------------------ */

describe('失败徽标（hint 帧）', () => {
  /** 喂一对 B..D 标记：这就是 shell 集成眼里「跑完一条命令」的样子（输出落在 B..D 之间）。 */
  function finishCommand(h: Harness, code: number, body = 'boom'): void {
    h.ptys[0].output.write('\x1b]133;B\x07' + body + '\x1b]133;D;' + String(code) + '\x07')
  }

  const settle = (ms = 60): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

  it('命令非零退出 → 一条 hint 帧，带退出码', async () => {
    const h = makeHarness({ assistEnabled: true })
    try {
      const ws = h.connect()
      await spawnLocal(ws, 'abc123')
      finishCommand(h, 2)
      expect(await ws.waitFor('hint')).toMatchObject({ t: 'hint', sid: 'abc123', kind: 'failure', exitCode: 2 })
    } finally {
      await h.sessions.disposeAll()
    }
  })

  it('开关关着时一个 hint 都不发（默认关 = 这个功能完全不外发）', async () => {
    const h = makeHarness()
    try {
      const ws = h.connect()
      await spawnLocal(ws, 'abc123')
      finishCommand(h, 2)
      await settle()
      expect(ws.sent('hint')).toEqual([])
    } finally {
      await h.sessions.disposeAll()
    }
  })

  it('0 / 130（Ctrl-C）/ 141（SIGPIPE）都不弹——这三个天天出现，误报会逼用户关掉功能', async () => {
    const h = makeHarness({ assistEnabled: true })
    try {
      const ws = h.connect()
      await spawnLocal(ws, 'abc123')
      for (const code of [0, 130, 141]) finishCommand(h, code)
      await settle()
      expect(ws.sent('hint')).toEqual([])
    } finally {
      await h.sessions.disposeAll()
    }
  })

  it('同一条命令只弹一次（否则用户关掉徽标后，终端再吐一个字节它就重新冒出来）', async () => {
    const h = makeHarness({ assistEnabled: true })
    try {
      const ws = h.connect()
      await spawnLocal(ws, 'abc123')
      finishCommand(h, 1)
      await ws.waitFor('hint')
      // 后续输出（回显、下一条命令的提示符）都会再走一遍判定，但 seq 没变
      h.ptys[0].output.write('后续输出\r\n')
      await settle()
      expect(ws.sent('hint')).toHaveLength(1)
      // 下一条**新的**失败命令：要能再弹（去重不能把后续失败一起吞掉）
      finishCommand(h, 3, 'second')
      await settle()
      const hints = ws.sent('hint')
      expect(hints).toHaveLength(2)
      expect(hints.at(-1)).toMatchObject({ exitCode: 3 })
    } finally {
      await h.sessions.disposeAll()
    }
  })
})
