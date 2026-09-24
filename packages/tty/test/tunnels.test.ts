/**
 * @hyzyn/dsh-tty — TunnelManager 单元测试（DEFECTS D38 第 1 刀 / D15 的行为护栏）。
 *
 * ssh2 的 `Client` 被 vi.mock 成假件（connect 只登记、事件由测试注入）；本地
 * 监听一侧是**真实** net server（随机空闲端口），因为 D15 的 live 集合清理与
 * 连接计数本就发生在真实 socket 上。覆盖：
 *   - reconcile 收敛：新增 / 规格变更重建 / disabled 不建连；
 *   - 连接簿缺失 → fatal（不再重试循环）；
 *   - live 集合：forwardOut 成功计数 +1、收尾 -1、失败分支不虚高、
 *     stopTunnel 销毁在途转发（D15 ②③）。
 * 不追求覆盖率：只钉「修复过的行为 + 边界」。
 */
import net from 'node:net'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import type { PassThrough } from 'node:stream'
import type { AddressInfo } from 'node:net'
import { TunnelManager } from '../src/tunnels.js'
import { setCredentialResolver } from '../src/ssh.js'
import type { TunnelSpec, TunnelStatus } from '../src/tunnels.js'
import type { SshHostEntry } from '../src/ssh.js'

/** 测试注入点：被 mock 的 ssh2.Client 构造时回调这里产出假连接。 */
const h = vi.hoisted(() => ({ factory: null as null | (() => unknown) }))
vi.mock('ssh2', () => ({
  Client: class {
    constructor() {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return h.factory!()
    }
  },
}))

/** 假 ssh2 Client：EventEmitter 打底，connect/end/forwardOut 可观察、可编程。 */
class FakeClient extends EventEmitter {
  ended = false
  connectConfig: unknown = null
  forwardOutImpl: ((cb: (error: Error | null, stream?: unknown) => void) => void) | null = null
  connect(config: unknown): void {
    this.connectConfig = config
  }
  end(): void {
    this.ended = true
  }
  forwardOut(_srcIP: string, _srcPort: number, _dstIP: string, _dstPort: number, cb: (error: Error | null, stream?: unknown) => void): void {
    this.forwardOutImpl?.(cb)
  }
  trigger(event: string, ...args: unknown[]): void {
    this.emit(event, ...args)
  }
}

/** 假转发 channel：PassThrough 就是 duplex，pipe/end/destroy/close 全有。 */
function makeChannel(): PassThrough {
  return new PassThrough()
}

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as AddressInfo).port
      srv.close(() => resolve(port))
    })
  })
}

const BOOK: SshHostEntry = { name: 'web', host: '203.0.113.9', port: 22, username: 'u', auth: 'password', password: 'pw' }

function specOf(overrides: Partial<TunnelSpec> = {}): TunnelSpec {
  return { name: 't1', bookName: 'web', direction: 'local', enabled: true, ...overrides }
}

interface Harness {
  manager: TunnelManager
  clients: FakeClient[]
  log: string[]
  status(name?: string): TunnelStatus | undefined
}

function makeHarness(resolveBook: (name: string) => SshHostEntry | undefined = () => BOOK): Harness {
  const clients: FakeClient[] = []
  h.factory = () => {
    const c = new FakeClient()
    clients.push(c)
    return c
  }
  const log: string[] = []
  const manager = new TunnelManager(
    { info: (m) => log.push(m), warn: (m) => log.push(m) },
    { get: () => undefined, record: () => {} },
    resolveBook,
  )
  return {
    manager,
    clients,
    log,
    status: (name = 't1') => manager.list().find((t) => t.name === name),
  }
}

/** connectTunnel 是 async（buildConnectConfig 要过凭据解析）：轮到假件被构造为止。 */
async function until(cond: () => boolean, ms = 2000): Promise<void> {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('测试等待超时')
    await new Promise((r) => setTimeout(r, 10))
  }
}

describe('TunnelManager.reconcile 收敛', () => {
  let t: Harness
  beforeEach(() => {
    t = makeHarness()
  })
  afterEach(() => {
    t.manager.disposeAll()
  })

  it('新增 enabled 隧道 → 建连（connecting），SSH ready → active', async () => {
    t.manager.reconcile([specOf()])
    await until(() => t.clients.length === 1)
    expect(t.status()?.state).toBe('connecting')
    t.clients[0].trigger('ready')
    expect(t.status()?.state).toBe('active')
    expect(t.status()?.connections).toBe(0)
  })

  it('disabled 隧道不建连，状态 stopped', () => {
    t.manager.reconcile([specOf({ enabled: false })])
    expect(t.clients).toHaveLength(0)
    expect(t.status()?.state).toBe('stopped')
  })

  it('规格变更 → 旧连接 end + 重建新连接', async () => {
    t.manager.reconcile([specOf()])
    await until(() => t.clients.length === 1)
    t.clients[0].trigger('ready')
    t.manager.reconcile([specOf({ remoteHost: 'db.internal' })])
    await until(() => t.clients.length === 2)
    expect(t.clients[0].ended).toBe(true) // 旧连接被停用
    expect((t.clients[1].connectConfig as { host: string }).host).toBe('203.0.113.9')
  })
})

describe('TunnelManager 连接簿缺失 → fatal（D15 ①）', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('条目不存在 → error 态 + 指引文案，且不再进入重试循环', async () => {
    const t = makeHarness(() => undefined)
    t.manager.reconcile([specOf({ bookName: 'gone' })])
    await until(() => t.status()?.state === 'error')
    expect(t.status()?.error).toContain('gone')
    expect(t.status()?.error).toContain('端口转发')
    expect(t.clients).toHaveLength(0) // 根本没建过 SSH 连接
    // 原重试首轮 1000ms：过点后仍无新连接、状态不被循环改写
    await new Promise((r) => setTimeout(r, 1300))
    expect(t.clients).toHaveLength(0)
    expect(t.status()?.state).toBe('error')
    t.manager.disposeAll()
  })
})

describe('本地监听失败必须粘住（D53）', () => {
  it('本地端口被占：不因 SSH 侧成功而谎报 active', async () => {
    const occupied = net.createServer()
    await new Promise<void>((resolve) => occupied.listen(0, '127.0.0.1', resolve))
    const takenPort = (occupied.address() as AddressInfo).port
    const t = makeHarness()
    try {
      t.manager.reconcile([specOf({ localPort: takenPort })])
      await until(() => t.status()?.state === 'error')
      expect(t.status()?.error).toContain('EADDRINUSE')
      // 文案要可行动（A 项）：多 profile 是最常见原因，并给出两条出路
      expect(t.status()?.error).toContain('另一个 DSH profile')
      expect(t.status()?.error).toContain('localPort')
      // 即便 SSH 侧随后 ready，也不能把「本地没监听成功」粉饰成 active
      for (const c of t.clients) c.trigger('ready')
      expect(t.status()?.state).toBe('error')
      expect(t.status()?.error).toContain('EADDRINUSE')
    } finally {
      t.manager.disposeAll()
      occupied.close()
    }
  })

  it('本地监听失败后，SSH 侧的失败/重连不得把它刷回 connecting（生产时序）', async () => {
    // 生产实测（SSH 目标不可达 + 本地端口被另一个 profile 的宿主占用）：
    //   listen EADDRINUSE → error → SSH error → scheduleRetry（把 fatal 清回 false）
    //   → 重试定时器 → connectTunnel → state='connecting' → 又挂 20s……
    // 结果是状态几乎永远停在 connecting，而 error 文字还挂着——用户看到「点着
    // 连接中、却明明有报错」。本地监听失败是 fatal，不该进这个循环。
    const occupied = net.createServer()
    await new Promise<void>((resolve) => occupied.listen(0, '127.0.0.1', resolve))
    const takenPort = (occupied.address() as AddressInfo).port
    const t = makeHarness()
    try {
      t.manager.reconcile([specOf({ localPort: takenPort })])
      await until(() => t.status()?.state === 'error')
      // SSH 侧失败（目标不可达的真实形态）
      for (const c of t.clients) c.trigger('error', new Error('connect ETIMEDOUT'))
      await until(() => t.clients.length >= 1)
      // 越过首轮重试窗口（1000ms）——旧实现在这里会被 connectTunnel 改成 connecting
      await new Promise((r) => setTimeout(r, 1300))
      expect(t.status()?.state).toBe('error')
      expect(t.status()?.error).toContain('EADDRINUSE')
    } finally {
      t.manager.disposeAll()
      occupied.close()
    }
  })

  it('反序时序：非 fatal 重试定时器先排、fatal 后到——不得被刷回 connecting（D58）', async () => {
    // 与上一条**相反**的顺序（这才是生产实测的顺序，见 D58）：
    //   ① 凭据解析失败（非 fatal）→ scheduleRetry 排下 1s 定时器
    //   ② 本地监听 EADDRINUSE（fatal）后到
    //   ③ ①的定时器到点 → connectTunnel → 旧实现在这里把 error 刷成 connecting，
    //      而之后的失败又都被 scheduleRetry 的 fatal 短路挡住 → 永久 connecting
    // 修前该用例必红（expected 'connecting' to be 'error'）；上一条覆盖的是反序，
    // 所以它绿着也抓不到这条。
    setCredentialResolver({ resolve: async () => undefined })
    const occupied = net.createServer()
    await new Promise<void>((resolve) => occupied.listen(0, '127.0.0.1', resolve))
    const takenPort = (occupied.address() as AddressInfo).port
    const t = makeHarness(() => ({ ...BOOK, password: 'env:MISSING_FOR_RACE_TEST' }))
    try {
      t.manager.reconcile([specOf({ localPort: takenPort })])
      await until(() => t.log.some((l) => l.includes('后重连')) && t.log.some((l) => l.includes('EADDRINUSE')))
      const retryAt = t.log.findIndex((l) => l.includes('后重连'))
      const fatalAt = t.log.findIndex((l) => l.includes('EADDRINUSE'))
      // 先钉住「反序」这个前提：否则本用例退化成上一条，抓不到东西
      expect(retryAt, '重试定时器未先排：日志=' + JSON.stringify(t.log)).toBeGreaterThanOrEqual(0)
      expect(fatalAt, '未出现 EADDRINUSE：日志=' + JSON.stringify(t.log)).toBeGreaterThan(retryAt)
      expect(t.status()?.state).toBe('error')
      expect(t.status()?.fatal).toBe(true)
      // 越过首轮重试窗口：早先排下的定时器到点会重入 connectTunnel
      await new Promise((r) => setTimeout(r, 1300))
      expect(t.status()?.state, 'fatal 被定时器重入覆写成了 connecting').toBe('error')
      expect(t.status()?.error).toContain('EADDRINUSE')
    } finally {
      t.manager.disposeAll()
      occupied.close()
      setCredentialResolver(null)
    }
  })
})

describe('TunnelManager live 集合与计数（D15 ②③）', () => {
  let t: Harness
  let port: number
  beforeEach(async () => {
    t = makeHarness()
    port = await freePort()
  })
  afterEach(() => {
    t.manager.disposeAll()
  })

  it('forwardOut 成功计数 +1，socket 收尾 -1', async () => {
    t.manager.reconcile([specOf({ localPort: port })])
    await until(() => t.clients.length === 1)
    t.clients[0].trigger('ready')
    t.clients[0].forwardOutImpl = (cb) => cb(null, makeChannel())
    const sock = net.connect(port, '127.0.0.1')
    await until(() => t.status()?.connections === 1)
    expect(t.status()?.totalConnections).toBe(1)
    sock.destroy()
    await until(() => t.status()?.connections === 0)
  })

  it('forwardOut 失败分支计数不虚高（0.19.0 修复点）', async () => {
    t.manager.reconcile([specOf({ localPort: port })])
    await until(() => t.clients.length === 1)
    t.clients[0].trigger('ready')
    t.clients[0].forwardOutImpl = (cb) => cb(new Error('no route to host'))
    const sock = net.connect(port, '127.0.0.1')
    await new Promise((resolve) => sock.on('close', resolve))
    expect(t.status()?.connections).toBe(0)
    expect(t.status()?.totalConnections).toBe(1) // 尝试过即计总数
    expect(t.status()?.lastForwardError).toContain('no route to host')
  })

  it('stopTunnel（reconcile 移除）销毁在途转发并 end 连接（0.19.0 修复点）', async () => {
    t.manager.reconcile([specOf({ localPort: port })])
    await until(() => t.clients.length === 1)
    t.clients[0].trigger('ready')
    t.clients[0].forwardOutImpl = (cb) => cb(null, makeChannel())
    const sock = net.connect(port, '127.0.0.1')
    await until(() => t.status()?.connections === 1)
    const closed = new Promise<void>((resolve) => sock.on('close', () => resolve()))
    t.manager.reconcile([]) // 移除 → stopTunnel → live 集合全销毁
    await Promise.race([closed, new Promise((r) => setTimeout(r, 2000))])
    expect(t.clients[0].ended).toBe(true)
    expect(t.status()).toBeUndefined() // 已从表中移除
    sock.destroy()
  })
})
