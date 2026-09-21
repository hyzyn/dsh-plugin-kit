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
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SessionManager, TtyServer, killLocalShellTerminal } from '../src/index.js'
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
      settleDone({ exitCode: 0, signal: null })
      return true
    },
    forceKill: () => {
      pty.killCalls.push('SIGKILL')
    },
    resizeCalls: pty.resizeCalls,
    writes: [],
    killCalls: pty.killCalls,
    settle: (outcome) => settleDone(outcome),
  }
  return fake
}

interface Harness {
  server: TtyServer
  sessions: SessionManager
  ptys: FakePty[]
  connect(): FakeWs
}

function makeHarness(overrides: Partial<{ graceSec: number; maxSessions: number }> = {}): Harness {
  const ptys: FakePty[] = []
  const ctx = {
    logger: { info: () => {}, warn: () => {} },
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
    // 进程退出 → exit 广播到当前绑定的 B
    h.ptys[0].settle({ exitCode: 3, signal: null })
    const exit = await wsB.waitFor('exit')
    expect(exit).toMatchObject({ t: 'exit', sid: 'sess1', code: 3 })
    expect(h.sessions.count).toBe(0)
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
  function makeSession(id: string, overrides: { orphanedAt?: number | null; tmuxName?: string | null } = {}): any {
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
      paused: false,
      cwd: '',
      kind: 'local',
      target: '',
      startedAt: Date.now(),
      lastOutputAt: Date.now(),
      lastInputAt: Date.now(),
      buffer: '',
      decoder: new (require('node:string_decoder').StringDecoder)('utf8'),
      screen: null,
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
