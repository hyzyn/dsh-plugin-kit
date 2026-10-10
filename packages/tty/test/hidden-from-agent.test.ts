/**
 * @hyzyn/dsh-tty — 「对 agent 不可见」标签（0.30.0）。
 *
 * 这个功能的**安全性全在宿主侧**：只让客户端不显示是假安全（知道 sid 就能绕过），
 * 所以本文件钉的是宿主那条线——
 *   1. 会话记录 / 快照带 hidden；
 *   2. `listForAgent()` 把这类会话**整条**排除（连在不在、cwd、有没有命令在跑都不给），
 *      而面板用的 `listForAttach()` 照旧全给（那是用户自己的标签，必须看得见）；
 *   3. `agentView()` 对隐藏会话抛错（agent 按 sid 取内容的全部门都走它）；
 *   4. `hidden` 帧的切换语义 + 拒绝把 **agent 自己开的**会话设为隐藏。
 *
 * 反向验证：去掉 `listForAgent` 的 filter，第 2 组立刻红；把 `agentView` 换回
 * `sessions.get`，第 3 组与源码守卫同时红。
 */
// DSH_HOME 隔离（D69）：读不到开发机上的真实授权文件
import './isolated-home.js'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { PassThrough } from 'node:stream'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SessionManager, TtyServer, hiddenSessionsNote } from '../src/index.js'

/* ----------------------------- 假件 ----------------------------- */

type Frame = Record<string, unknown>

class FakeWs extends EventEmitter {
  readyState = 1 // WebSocket.OPEN
  bufferedAmount = 0
  frames: Frame[] = []
  send(data: string): void {
    this.frames.push(JSON.parse(data) as Frame)
  }
  close(): void {}
  sent(t: string): Frame[] {
    return this.frames.filter((frame) => frame.t === t)
  }
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

/** 假 PTY：只用到 spawnTerminal 的返回值形状（本文件不驱动输出）。 */
function makePty(): Record<string, unknown> {
  return {
    kind: 'local',
    pid: 4242,
    output: new PassThrough(),
    done: new Promise(() => {}),
    write: async () => {},
    resize: () => {},
    terminal: { resize: () => {}, kill: () => {} },
    terminate: async () => true,
    forceKill: () => {},
  }
}

interface Harness {
  server: TtyServer
  sessions: SessionManager
  /** 宿主 logger.info 的内容（会话生命周期留痕）。 */
  infos: string[]
  connect(): FakeWs
}

function makeHarness(): Harness {
  const infos: string[] = []
  const ctx = {
    logger: {
      info: (message: string) => { infos.push(message) },
      warn: (message: string) => { infos.push(message) },
    },
    get(name: string): unknown {
      if (name === 'subprocess') return { spawnTerminal: async () => makePty() }
      return undefined
    },
  }
  const sessions = new SessionManager(4)
  const options = {
    shell: '/bin/zsh',
    term: 'xterm-256color',
    colorTerm: 'truecolor',
    cwd: tmpdir(),
    reconnectGraceMs: 60000,
    sshHosts: [],
    hostKeys: [],
    shellIntegration: false,
    tunnels: [],
    persistence: 'off' as const,
    endOnPageClose: false,
    statsEnabled: true,
    assistEnabled: false,
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
    infos,
    connect: () => {
      const ws = new FakeWs()
      ;(server as unknown as { onConnection(ws: FakeWs): void }).onConnection(ws)
      return ws
    },
  }
}

/** 走真实 spawn 帧建一条用户标签（hidden 可选）。 */
async function spawnUserTab(ws: FakeWs, sid: string, hidden?: boolean): Promise<void> {
  ws.emit('message', Buffer.from(JSON.stringify({ t: 'spawn', sid, cwd: tmpdir(), ...(hidden === true ? { hidden: true } : {}) })))
  await ws.waitFor('ready')
}

async function sendHiddenFrame(ws: FakeWs, sid: string, hidden: boolean): Promise<void> {
  const before = ws.sent('hidden').length
  ws.emit('message', Buffer.from(JSON.stringify({ t: 'hidden', sid, hidden })))
  const start = Date.now()
  while (Date.now() - start < 2000) {
    if (ws.sent('hidden').length > before) return
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error('等待 hidden 回帧超时')
}

/* ----------------------------- 1. 记录与快照 ----------------------------- */

describe('「对 agent 不可见」：记录与快照', () => {
  it('spawn 帧带 hidden 时：快照带 hidden、listForAgent 整条排除、listForAttach 照给、hiddenCount 计数', async () => {
    const h = makeHarness()
    const ws = h.connect()
    await spawnUserTab(ws, 'visible1')
    await spawnUserTab(ws, 'hidden1', true)

    const agentView = h.sessions.listForAgent()
    expect(agentView.map((s) => s.sid)).toEqual(['visible1'])
    expect(agentView.some((s) => s.hidden !== undefined)).toBe(false)

    // 面板那条路必须照旧给全部会话，且带 hidden 标记（客户端据此渲染标记）
    const forAttach = h.sessions.listForAttach()
    expect(forAttach.map((s) => s.sid).sort()).toEqual(['hidden1', 'visible1'])
    expect(forAttach.find((s) => s.sid === 'hidden1')?.hidden).toBe(true)
    expect(forAttach.find((s) => s.sid === 'visible1')?.hidden).toBeUndefined()

    expect(h.sessions.hiddenCount()).toBe(1)
  })

  it('不带 hidden 的标签照旧对 agent 可见（默认不变）', async () => {
    const h = makeHarness()
    const ws = h.connect()
    await spawnUserTab(ws, 'plain')
    expect(h.sessions.listForAgent().map((s) => s.sid)).toEqual(['plain'])
    expect(h.sessions.hiddenCount()).toBe(0)
  })
})

/* ----------------------------- 2. hidden 帧切换 ----------------------------- */

describe('「对 agent 不可见」：hidden 帧', () => {
  it('true → false 双向切换，并回帧确认', async () => {
    const h = makeHarness()
    const ws = h.connect()
    await spawnUserTab(ws, 'tab1')

    await sendHiddenFrame(ws, 'tab1', true)
    expect(ws.sent('hidden').at(-1)).toMatchObject({ sid: 'tab1', hidden: true })
    expect(h.sessions.listForAgent()).toHaveLength(0)
    expect(h.sessions.hiddenCount()).toBe(1)
    // 留痕：事后能查「这条标签什么时候被隐藏的」
    expect(h.infos.some((line) => line.includes('hiddenFromAgent=true'))).toBe(true)

    await sendHiddenFrame(ws, 'tab1', false)
    expect(ws.sent('hidden').at(-1)).toMatchObject({ sid: 'tab1', hidden: false })
    expect(h.sessions.listForAgent().map((s) => s.sid)).toEqual(['tab1'])
    expect(h.sessions.hiddenCount()).toBe(0)
  })

  it('只能切**本连接绑定**的标签：别人的/agent 的会话既不回帧也不改位', async () => {
    const h = makeHarness()
    const ws = h.connect()
    // agent 会话不属于这条连接（它没有客户端绑定）——这正是「用户在自己的窗口里
    // 处置的是自己的标签」那条边界，同时也兜住了「agent 把自己的会话藏起来」
    const opened = await h.server.openAgentSession({ cwd: tmpdir() })
    ws.emit('message', Buffer.from(JSON.stringify({ t: 'hidden', sid: opened.sid, hidden: true })))
    await new Promise((r) => setTimeout(r, 50))
    expect(ws.sent('hidden')).toHaveLength(0)
    expect(h.sessions.hiddenCount()).toBe(0)
    expect(h.sessions.listForAgent().map((s) => s.sid)).toEqual([opened.sid])
  })

  it('回帧回报的是**实际结果**而非请求（agent 会话在唯一写入口被拒）', async () => {
    const h = makeHarness()
    const ws = h.connect()
    await spawnUserTab(ws, 'own')
    // 用户标签：请求 true → 实际 true
    await sendHiddenFrame(ws, 'own', true)
    expect(ws.sent('hidden').at(-1)).toMatchObject({ sid: 'own', hidden: true })
    // 再来一次 true（幂等）：仍如实回 true，且不重复记日志
    const loggedBefore = h.infos.filter((line) => line.includes('hiddenFromAgent')).length
    await sendHiddenFrame(ws, 'own', true)
    expect(ws.sent('hidden').at(-1)).toMatchObject({ hidden: true })
    expect(h.infos.filter((line) => line.includes('hiddenFromAgent')).length).toBe(loggedBefore)
  })

  it('未指定 sid 且本连接只绑一条会话时可省略 sid（沿用 resolveSid 语义）', async () => {
    const h = makeHarness()
    const ws = h.connect()
    await spawnUserTab(ws, 'only')
    ws.emit('message', Buffer.from(JSON.stringify({ t: 'hidden', hidden: true })))
    const start = Date.now()
    while (Date.now() - start < 2000 && ws.sent('hidden').length === 0) await new Promise((r) => setTimeout(r, 10))
    expect(ws.sent('hidden').at(-1)).toMatchObject({ sid: 'only', hidden: true })
    expect(h.sessions.hiddenCount()).toBe(1)
  })
})

/* ----------------------------- 3. agentView 拒绝 ----------------------------- */

describe('「对 agent 不可见」：agent 侧按 sid 取内容一律拒绝', () => {
  it('隐藏会话抛错、可见会话照常、不存在的仍返回 undefined', async () => {
    const h = makeHarness()
    const ws = h.connect()
    await spawnUserTab(ws, 'hidden2', true)
    await spawnUserTab(ws, 'shown2')

    expect(() => h.sessions.agentView('hidden2')).toThrow(/对 agent 不可见/)
    // 拒绝文案必须让模型**停下来转告用户**，而不是换个 sid 继续试
    expect(() => h.sessions.agentView('hidden2')).toThrow(/不要用其它 sid 试探/)
    expect(h.sessions.agentView('shown2')?.id).toBe('shown2')
    expect(h.sessions.agentView('nope')).toBeUndefined()
  })

  it('取消隐藏后立刻可以取（拒绝不是粘性的）', async () => {
    const h = makeHarness()
    const ws = h.connect()
    await spawnUserTab(ws, 'tab3', true)
    expect(() => h.sessions.agentView('tab3')).toThrow()
    await sendHiddenFrame(ws, 'tab3', false)
    expect(h.sessions.agentView('tab3')?.id).toBe('tab3')
  })
})

/* ----------------------------- 4. 共用文案 ----------------------------- */

describe('「对 agent 不可见」：条数提示的共用文案', () => {
  it('0 / 负数不产生任何话（调用方直接拼接）', () => {
    expect(hiddenSessionsNote(0)).toBe('')
    expect(hiddenSessionsNote(-1)).toBe('')
  })

  it('有条数时带上数字，并说清「别用其它 sid 试」与「只能用户取消隐藏」', () => {
    const note = hiddenSessionsNote(3)
    expect(note).toContain('3 条')
    expect(note).toContain('不要拿其它 sid 去试')
    expect(note).toContain('取消隐藏')
  })
})

/* ----------------------------- 5. 工具接线守卫 ----------------------------- */

describe('「对 agent 不可见」：工具接线守卫', () => {
  /**
   * 这条守的是**将来**：本功能的拦截点在 `agentView`，而工具里原本写的是
   * `sessions.get(input.sid)`——新加一个「按 sid 取内容」的工具时很容易顺手用 `get`，
   * 那样它就成了绕过隐藏的后门（类型检查抓不到：两个方法都返回同样的类型）。
   *
   * 判据按源码对账，形如 tier-gate 的分类表守卫：名单是**穷尽**的，多一处 `get` 就红。
   */
  it('按 sid 取内容的 agent 工具一律走 agentView，不留 sessions.get 后门', () => {
    const source = readFileSync(fileURLToPath(new URL('../src/index.ts', import.meta.url)), 'utf8')
    const viaAgentView = source.match(/sessions\.agentView\(input\.sid\)/g) ?? []
    const viaPlainGet = source.match(/sessions\.get\(input\.sid\)/g) ?? []
    // 五个按 sid 取内容的工具：tty_stats / tty_capture / tty_screen / tty_expect / tty_send
    expect(viaAgentView).toHaveLength(5)
    expect(viaPlainGet).toHaveLength(0)
    // 列表那两条路（tty_list 工具 + 每轮 prompt 块）必须走 listForAgent
    expect(source.match(/sessions\.listForAgent\(\)/g) ?? []).toHaveLength(2)
    expect(source.match(/sessions\.list\(\)/g) ?? []).toHaveLength(0)
  })
})
