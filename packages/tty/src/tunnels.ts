/**
 * @hyzyn/dsh-tty — SSH 端口转发隧道管理（0.5.0）。
 *
 * 隧道是宿主自持的一等对象：不依赖终端标签，settings 即真相源，reconcile()
 * 按配置增/删/改启停；SSH 断开自动指数退避重连（1s→15s 封顶）；连接簿条目
 * 在每次（重）连接时实时解析——改密码后隧道重连自动用新凭证。
 *
 * 两个方向：
 *   - local（-L，forwardOut）：本地 127.0.0.1:localPort 监听常驻（SSH 掉线
 *     不释放端口，未就绪的入站连接直接 destroy）；每条入站连接
 *     forwardOut 到服务端侧 remoteHost:remotePort，Channel 双工 pipe。
 *   - remote（-R，forwardIn）：SSH ready 后 forwardIn 让服务端监听
 *     remoteHost:remotePort（缺省 127.0.0.1），'tcp connection' 到来时拨号
 *     本地 localTargetHost:localTargetPort 双向 pipe；断线后远程监听失效，
 *     **每次重连 ready 都要重新 forwardIn**；停止时随连接断开自动解绑。
 *
 * TOFU：与终端会话共用同一 HostKeyStore——指纹变更同样拒绝，错误文案一致。
 * 端口转发不计入 maxSessions（不占终端会话名额）。
 */
import net from 'node:net'
import { Client } from 'ssh2'
import type { ConnectConfig } from 'ssh2'
import { applyHostKeyPolicy, buildConnectConfig } from './ssh.js'
import type { HostKeyStore, SshHostEntry, SshSpec } from './ssh.js'

/** 隧道规格（settings 存储；bookName 引用连接簿条目提供主机与认证）。 */
export interface TunnelSpec {
  name: string
  bookName: string
  /** local = -L（本地监听 → 服务端侧拨号）；remote = -R（服务端监听 → 本地拨号） */
  direction: 'local' | 'remote'
  /** local：本地监听端口 */
  localPort?: number
  /** local：服务端侧拨号目标主机；remote：服务端监听地址（缺省 127.0.0.1） */
  remoteHost?: string
  /** local：服务端侧目标端口；remote：服务端监听端口 */
  remotePort?: number
  /** remote：本地拨号目标主机（缺省 127.0.0.1） */
  localTargetHost?: string
  /** remote：本地拨号目标端口 */
  localTargetPort?: number
  enabled: boolean
}

export type TunnelState = 'connecting' | 'active' | 'error' | 'stopped'

export interface TunnelStatus {
  name: string
  bookName: string
  direction: 'local' | 'remote'
  enabled: boolean
  state: TunnelState
  error: string | null
  /** 规则的人类可读形式：`本机:5432 → db:5432` / `远程:8080 → 本机:3000` */
  rule: string
  /** 当前活跃连接数 */
  connections: number
  totalConnections: number
  /** 最近一次 forwardOut/转发失败原因（隧道本身 active 但目标拨号失败时可见） */
  lastForwardError: string | null
}

export interface TunnelLogger {
  info(msg: string): void
  warn(msg: string): void
}

interface RuntimeTunnel {
  spec: TunnelSpec
  signature: string
  state: TunnelState
  error: string | null
  conn: Client | null
  /** SSH 认证就绪（可 forwardOut/已 forwardIn） */
  ready: boolean
  server: net.Server | null
  connections: number
  totalConnections: number
  lastForwardError: string | null
  retryTimer: NodeJS.Timeout | null
  retryAttempt: number
  /** dispose/停止后置位：所有异步回调据此短路 */
  dead: boolean
  /** 人工介入级故障（如监听端口 EACCES/被占）：SSH ready 不覆盖该错误态 */
  fatal: boolean
}

const MAX_RETRY_DELAY_MS = 15_000

function signatureOf(spec: TunnelSpec): string {
  return JSON.stringify(spec)
}

function ruleOf(spec: TunnelSpec): string {
  if (spec.direction === 'local') {
    return `本机:${String(spec.localPort ?? 0)} → ${spec.remoteHost ?? '?'}:${String(spec.remotePort ?? 0)}`
  }
  return `远程:${spec.remoteHost?.trim() || '127.0.0.1'}:${String(spec.remotePort ?? 0)} → 本机:${String(spec.localTargetPort ?? 0)}`
}

export class TunnelManager {
  private readonly tunnels = new Map<string, RuntimeTunnel>()

  constructor(
    private readonly logger: TunnelLogger,
    private readonly store: HostKeyStore,
    /** 按名字解析连接簿条目（实时读取，重连自动用最新凭证） */
    private readonly resolveBook: (bookName: string) => SshHostEntry | undefined,
  ) {}

  /** 按配置对齐运行态：新增/删除/规格变更重建，启停切换资源。幂等。 */
  reconcile(specs: TunnelSpec[]): void {
    const wanted = new Map(specs.map((spec) => [spec.name, spec]))
    for (const [name, rt] of [...this.tunnels.entries()]) {
      const next = wanted.get(name)
      if (next === undefined || signatureOf(next) !== rt.signature) {
        this.stopTunnel(rt)
        this.tunnels.delete(name)
      }
    }
    for (const spec of wanted.values()) {
      if (this.tunnels.has(spec.name)) continue
      const rt: RuntimeTunnel = {
        spec,
        signature: signatureOf(spec),
        state: spec.enabled ? 'connecting' : 'stopped',
        error: null,
        conn: null,
        ready: false,
        server: null,
        connections: 0,
        totalConnections: 0,
        lastForwardError: null,
        retryTimer: null,
        retryAttempt: 0,
        dead: false,
        fatal: false,
      }
      this.tunnels.set(spec.name, rt)
      if (spec.enabled) this.startTunnel(rt)
    }
  }

  list(): TunnelStatus[] {
    return [...this.tunnels.values()].map((rt) => ({
      name: rt.spec.name,
      bookName: rt.spec.bookName,
      direction: rt.spec.direction,
      enabled: rt.spec.enabled,
      state: rt.state,
      error: rt.error,
      rule: ruleOf(rt.spec),
      connections: rt.connections,
      totalConnections: rt.totalConnections,
      lastForwardError: rt.lastForwardError,
    }))
  }

  disposeAll(): void {
    for (const rt of this.tunnels.values()) this.stopTunnel(rt)
    this.tunnels.clear()
  }

  /** ------------------------------------------------------------------ */

  private startTunnel(rt: RuntimeTunnel): void {
    rt.dead = false
    rt.retryAttempt = 0
    if (rt.spec.direction === 'local') {
      const server = net.createServer((socket) => this.onLocalConnection(rt, socket))
      server.on('error', (error) => {
        this.failTunnel(rt, `本地监听 127.0.0.1:${String(rt.spec.localPort ?? 0)} 失败: ${error.message}`)
      })
      server.listen(rt.spec.localPort ?? 0, '127.0.0.1', () => {
        this.logger.info(`[dsh-tty] 隧道 ${rt.spec.name} 监听 127.0.0.1:${String(rt.spec.localPort ?? 0)}`)
      })
      rt.server = server
    }
    this.connectTunnel(rt)
  }

  private stopTunnel(rt: RuntimeTunnel): void {
    rt.dead = true
    if (rt.retryTimer !== null) {
      clearTimeout(rt.retryTimer)
      rt.retryTimer = null
    }
    if (rt.server !== null) {
      try {
        rt.server.close()
      } catch {
        /* 已关闭 */
      }
      rt.server = null
    }
    try {
      rt.conn?.end()
    } catch {
      /* 已断开 */
    }
    rt.conn = null
    rt.ready = false
    rt.connections = 0
    rt.lastForwardError = null
    rt.state = 'stopped'
  }

  private connectTunnel(rt: RuntimeTunnel): void {
    const spec = rt.spec
    const book = this.resolveBook(spec.bookName)
    if (book === undefined) {
      this.scheduleRetry(rt, `连接簿中不存在条目: ${spec.bookName}`)
      return
    }
    const sshSpec: SshSpec = {
      host: book.host,
      port: book.port,
      username: book.username,
      auth: book.auth,
      keyPath: book.keyPath,
      passphrase: book.passphrase,
      password: book.password,
    }
    const target = `${book.username}@${book.host}:${String(book.port)}`
    rt.state = 'connecting'
    let conn: Client
    try {
      // 认证配置可能抛错（keyPath 读不到 / env:VAR 变量缺失）——走重试等待配置修复
      const connectConfig: ConnectConfig = buildConnectConfig(sshSpec)
      const policy = applyHostKeyPolicy({ connectConfig, spec: sshSpec, store: this.store, logger: this.logger, target })
      conn = new Client()
      rt.conn = conn
      rt.ready = false
      conn.on('ready', () => {
        if (rt.dead || rt.conn !== conn) return
        rt.ready = true
        // 人工介入级故障（如本地监听 EACCES）不因 SSH ready 而被掩盖
        if (!rt.fatal) {
          rt.state = 'active'
          rt.error = null
        }
        rt.retryAttempt = 0
        this.logger.info(`[dsh-tty] 隧道 ${spec.name} → ${target} 已连接`)
        if (spec.direction === 'remote') this.bindRemoteListen(rt, conn)
      })
      conn.on('tcp connection', (details, accept) => {
        if (rt.dead || rt.conn !== conn || !rt.ready || spec.direction !== 'remote') {
          try {
            accept().close()
          } catch {
            /* 忽略 */
          }
          return
        }
        this.onRemoteConnection(rt, accept)
      })
      conn.on('error', (error) => {
        if (rt.dead || rt.conn !== conn) return
        this.scheduleRetry(rt, policy.mismatchMessage() ?? `SSH 连接失败（${target}）: ${error.message}`)
      })
      conn.on('close', () => {
        if (rt.conn !== conn) return
        rt.conn = null
        rt.ready = false
        rt.connections = 0
        if (!rt.dead && rt.spec.enabled && rt.state !== 'error') {
          this.scheduleRetry(rt, 'SSH 连接断开')
        }
      })
      conn.connect(connectConfig)
    } catch (error) {
      this.scheduleRetry(rt, error instanceof Error ? error.message : String(error))
    }
  }

  /** remote 方向：让服务端监听端口（重连后必须重新调用，断线即失效）。 */
  private bindRemoteListen(rt: RuntimeTunnel, conn: Client): void {
    const spec = rt.spec
    conn.forwardIn(spec.remoteHost?.trim() || '127.0.0.1', spec.remotePort ?? 0, (error, realPort) => {
      if (rt.dead || rt.conn !== conn) return
      if (error !== undefined && error !== null) {
        this.failTunnel(rt, `远程监听失败（${spec.remoteHost?.trim() || '127.0.0.1'}:${String(spec.remotePort ?? 0)}）: ${error.message}`)
        return
      }
      this.logger.info(`[dsh-tty] 隧道 ${spec.name} 远程监听 ${spec.remoteHost?.trim() || '127.0.0.1'}:${String(realPort)} 就绪`)
    })
  }

  private onRemoteConnection(rt: RuntimeTunnel, accept: () => import('ssh2').ClientChannel): void {
    const spec = rt.spec
    rt.totalConnections += 1
    rt.connections += 1
    const stream = accept()
    const local = net.connect(
      { host: spec.localTargetHost?.trim() || '127.0.0.1', port: spec.localTargetPort ?? 0 },
      () => {
        stream.pipe(local)
        local.pipe(stream)
      },
    )
    const teardown = () => {
      rt.connections = Math.max(0, rt.connections - 1)
      try {
        stream.end()
      } catch {
        /* 已关闭 */
      }
      try {
        local.destroy()
      } catch {
        /* 已关闭 */
      }
    }
    stream.on('close', teardown)
    local.on('close', teardown)
    const kill = () => teardown()
    stream.on('error', kill)
    local.on('error', kill)
  }

  private onLocalConnection(rt: RuntimeTunnel, socket: net.Socket): void {
    const spec = rt.spec
    const conn = rt.conn
    // SSH 未就绪：端口保持占用但直接拒绝，应用层立刻收到连接重置
    if (rt.dead || conn === null || !rt.ready) {
      socket.destroy()
      return
    }
    rt.totalConnections += 1
    rt.connections += 1
    conn.forwardOut('127.0.0.1', 0, spec.remoteHost?.trim() ?? '', spec.remotePort ?? 0, (error, stream) => {
      if (error !== undefined && error !== null) {
        rt.lastForwardError = `目标 ${spec.remoteHost?.trim() ?? '?'}:${String(spec.remotePort ?? 0)} 拨号失败: ${error.message}`
        this.logger.warn(`[dsh-tty] 隧道 ${rt.spec.name} forwardOut 失败: ${error.message}`)
        socket.destroy()
        return
      }
      const teardown = () => {
        rt.connections = Math.max(0, rt.connections - 1)
      }
      stream.on('close', teardown)
      socket.pipe(stream)
      stream.pipe(socket)
      const kill = () => {
        try {
          socket.destroy()
        } catch {
          /* 已关闭 */
        }
        try {
          stream.end()
        } catch {
          /* 已关闭 */
        }
      }
      socket.on('error', kill)
      stream.on('error', kill)
    })
  }

  /** 失败且不再自动重试（需要人工介入：如远程端口被占、本地监听端口非法/无权限）。 */
  private failTunnel(rt: RuntimeTunnel, message: string): void {
    rt.error = message
    rt.state = 'error'
    rt.fatal = true
    this.logger.warn(`[dsh-tty] 隧道 ${rt.spec.name} 错误: ${message}`)
  }

  /** 失败后按指数退避重连（1s→15s 封顶）；重连期间保持 error 态供 UI 展示原因。 */
  private scheduleRetry(rt: RuntimeTunnel, message: string): void {
    rt.error = message
    rt.state = 'error'
    rt.fatal = false
    rt.conn = null
    rt.ready = false
    rt.connections = 0
    if (rt.dead || rt.retryTimer !== null) return
    const delay = Math.min(MAX_RETRY_DELAY_MS, 1000 * 2 ** rt.retryAttempt)
    rt.retryAttempt += 1
    this.logger.warn(`[dsh-tty] 隧道 ${rt.spec.name} 将在 ${String(delay)}ms 后重连（第 ${String(rt.retryAttempt)} 次）：${message}`)
    const timer = setTimeout(() => {
      rt.retryTimer = null
      if (!rt.dead && rt.spec.enabled) this.connectTunnel(rt)
    }, delay)
    timer.unref?.()
    rt.retryTimer = timer
  }
}
