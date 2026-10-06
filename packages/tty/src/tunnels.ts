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
import { classifyError, prepareSshConnect, proxyFailureSuffix } from './ssh.js'
import type { ProxyCommandDial } from './ssh.js'
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

/**
 * 一条 local 隧道的本地端口占用问题（tty D60 的前半：保存时就地探测，不等 listen 那一跳）。
 *
 * `kind` 是**机器可读**的判据（调用方按它决定文案，不做字符串匹配）：
 *   - `duplicate`：**这一次提交的配置里**有另一条 local 隧道用同一个 `localPort`；
 *     它必然失败（先立起来的那条占住端口，后一条 EADDRINUSE），但在配置层就能判死，
 *     连试探都不必——而且这条**不区分 enabled**：停用的那条随时会被启用，两条都留着
 *     就是一颗定时炸弹；
 *   - `in-use`：端口被**本进程之外**的东西占着（另一个 profile 的宿主、别的程序）。
 *     这一条**不拒绝保存**（见下 `probeTunnelPorts` 的取舍）。
 */
export interface TunnelPortIssue {
  kind: 'duplicate' | 'in-use'
  /** 涉及的两条隧道名（duplicate 用得上；in-use 只有一个） */
  names: string[]
  port: number
  message: string
}

/** 本地端口占用的中文文案（`duplicate` / `in-use` 各一条，措辞与 tunnels.ts 的 EADDRINUSE 说明同源）。 */
export function tunnelPortIssueMessage(kind: TunnelPortIssue['kind'], names: string[], port: number): string {
  if (kind === 'duplicate') {
    return `隧道「${names[1] ?? '?'}」与「${names[0] ?? '?'}」的本地端口都是 ${String(port)}——同一端口只能有一条本地转发（先起来的那条会占住它，后一条必定 EADDRINUSE）。改掉其中一条的 localPort。`
  }
  return `本地端口 ${String(port)}（隧道「${names[0] ?? '?'}」）已被占用：端口转发是机器级资源，最常见的原因是另一个 DSH profile 的宿主进程还在跑同一条隧道。这条隧道会停在 error 且不重试；换一个没被占用的 localPort，或在那个 profile 里关掉它。`
}

/**
 * **纯函数**：在待保存的隧道列表里找「同一个 localPort 被两条 local 隧道用」。
 *
 * 只判 local 方向——remote 方向的 `remotePort` 在**服务端**监听，不在本机资源里，
 * 本机探测对它没有意义（而且它由 forwardIn 的结果定论，能自愈）。
 * 返回按端口升序、每端口一条（文本渲染与测试都按这个顺序断言）。
 */
export function findDuplicateLocalPorts(specs: readonly TunnelSpec[]): TunnelPortIssue[] {
  const byPort = new Map<number, string[]>()
  for (const spec of specs) {
    if (spec.direction !== 'local') continue
    const port = Number(spec.localPort ?? 0)
    if (!Number.isInteger(port) || port < 1 || port > 65535) continue
    const names = byPort.get(port)
    if (names === undefined) byPort.set(port, [String(spec.name)])
    else if (!names.includes(String(spec.name))) names.push(String(spec.name))
  }
  const out: TunnelPortIssue[] = []
  for (const port of [...byPort.keys()].sort((a, b) => a - b)) {
    const names = byPort.get(port) as string[]
    if (names.length < 2) continue
    out.push({ kind: 'duplicate', names, port, message: tunnelPortIssueMessage('duplicate', names, port) })
  }
  return out
}

/**
 * 探测「这个本地端口现在能不能绑」。
 *
 * 语义是**独占探测**（`listen` 成功即立刻 `close`），不是「连一下看看」——后者对
 * 「端口空着但 DHCP/防火墙挡着」这类情形给不出结论，而我们要答的正是「bind 会不会
 * 失败」。探测窗口是微秒级，探完立即释放，不会与随后 reconcile 的真监听打架
 * （本机实测：同一 tick 内 `close()` 之后立刻 `listen` 同一端口可以成功）。
 *
 * `host` 固定 `127.0.0.1`——本地转发只绑回环（见 `startTunnel`），去探 `0.0.0.0`
 * 会把「别人绑在外部接口上」误报成冲突。
 */
export function probeLocalPort(port: number, timeoutMs = 500): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()
    let settled = false
    const done = (free: boolean): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      server.removeAllListeners()
      try {
        server.close()
      } catch {
        /* 未监听成功时 close 会抛，忽略 */
      }
      resolve(free)
    }
    const timer = setTimeout(() => { done(true) }, timeoutMs)
    timer.unref?.()
    server.once('error', () => { done(false) })
    // 'listening' 是唯一算「空着」的信号：error 之外还有 close 等路径，不能靠它们推定
    server.once('listening', () => { done(true) })
    try {
      server.listen(port, '127.0.0.1')
    } catch {
      done(false)
    }
  })
}

/**
 * 保存隧道配置时的**保存前探测**（tty D60 前半）。
 *
 * ## 为什么只警告、不拒绝保存
 *
 * `duplicate` 能判死，但**不能**用它拒绝整个 POST：设置卡片的保存是**整表提交**
 * （`toPayload` 把所有字段一起发上来），一旦配置里已经躺着一条重名端口的隧道
 * （老配置 / 另一个窗口写的），硬拒就等于把用户锁死在「任何一项都存不下去」上——
 * 而修它恰恰需要先能保存。所以这里把它降成**响应里的 warnings**，由客户端点名通报。
 *
 * `in-use` 更进一步：端口可能属于**用户故意**在跑的东西，探测本身也有极小的误报面
 * （IPv6-only 的占用、探测期间的竞态），拿它拦保存是越权。它的价值在「不等那条
 * 红色 error 出现就先说一声」。
 *
 * 每条隧道最多一条 in-use 警告；duplicate 优先（它更确定、且不必探端口）。
 */
export async function probeTunnelPorts(
  specs: readonly TunnelSpec[],
  probe: (port: number) => Promise<boolean> = probeLocalPort,
  heldByUs: ReadonlySet<number> = new Set(),
): Promise<string[]> {
  const warnings: string[] = []
  const seen = new Set<number>()
  for (const issue of findDuplicateLocalPorts(specs)) {
    warnings.push(issue.message)
    seen.add(issue.port)
  }
  for (const spec of specs) {
    if (spec.direction !== 'local') continue
    const port = Number(spec.localPort ?? 0)
    if (!Number.isInteger(port) || port < 1 || port > 65535) continue
    if (seen.has(port)) continue
    /*
     * **本进程自己正占着的端口不探**：改一条正在跑的隧道的其它字段（换个 remoteHost）
     * 时端口当然是被自己占着的——那不是冲突，reconcile 会先 stop 再 start，端口在
     * 同一拍里就还回来了（本机实测：同 tick `close()` 后立刻 `listen` 可以成功）。
     * 不豁免这一条的话，每次编辑都会得到一条假警告，警告立刻会退化成没人看的东西。
     * 同理，「删掉 A 再在同端口加 B」也不该报——A 会先被停掉。
     */
    if (heldByUs.has(port)) continue
    seen.add(port)
    /*
     * 探测失败（注入的实现抛错 / 极端情况下的同步异常）一律按「没探到」处理：
     * 这是一条**提示**，为它把整个保存打挂是本末倒置——用户会看到「保存失败」，
     * 却完全不知道是哪来的（端口探测的失败原因与配置的正确性无关）。
     */
    let free = true
    try {
      free = await probe(port)
    } catch {
      free = true
    }
    if (!free) warnings.push(tunnelPortIssueMessage('in-use', [String(spec.name)], port))
  }
  return warnings
}

export interface TunnelStatus {
  name: string
  bookName: string
  direction: 'local' | 'remote'
  enabled: boolean
  state: TunnelState
  error: string | null
  /** 人工介入级故障（本地监听失败 / 连接簿缺失）：不会自动重试，改配置后重建（D58）。 */
  fatal: boolean
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

/**
 * 本地监听失败的文案（D58 补充）：`EADDRINUSE` 在多 profile 场景下**几乎总是**
 * 「另一个 profile 的宿主进程还占着这个端口」——端口转发是**机器级**资源，而配置是按
 * profile 各存一份（复制 profile 会把隧道一起拷走，见 Profile 管理）。原样回一句
 * `listen EADDRINUSE` 只会让人去翻 `lsof`，这里把原因与两条出路直接写出来。
 */
function localListenFailureMessage(port: number, error: NodeJS.ErrnoException): string {
  const head = `本地监听 127.0.0.1:${String(port)} 失败: ${error.message}`
  if (error.code === 'EADDRINUSE') {
    return `${head} —— 该端口已被占用。端口转发是机器级资源，最常见的原因是**另一个 DSH profile 的宿主进程**还在运行同一条隧道（每个 profile 的隧道配置各自独立，复制 profile 会一并拷走）。两条出路：在本 profile 关掉这条隧道，或把它换成一个没被占用的 localPort。`
  }
  if (error.code === 'EACCES') {
    return `${head} —— 1024 以下的端口需要特权；换一个 ≥1024 的 localPort。`
  }
  return head
}

interface RuntimeTunnel {
  spec: TunnelSpec
  signature: string
  state: TunnelState
  error: string | null
  conn: Client | null
  /** 跳板机连接（目标只是借用它的通道）：断开/重连时必须一起关，否则每次重试漏一条连接。 */
  bastion: Client | null
  /** 代理命令（目标只是借用它的 stdio）：同上，断开/重连时必须 dispose，否则漏一个常驻进程。 */
  proxy: ProxyCommandDial | null
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
  /**
   * 在途转发的 socket / channel（0.19.0）：stop 时统一销毁——此前 stopTunnel
   * 只 conn.end()，在途转发不可见也不可控；计数错乱（forwardOut 失败分支漏减）
   * 也被 stop 的归零掩盖。条目是 net.Socket 或 ssh2 ClientChannel（都是 duplex）。
   */
  live: Set<NodeJS.ReadWriteStream>
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
  /**
   * 配置回写回调（settings 就绪后由插件注入一次）。
   *
   * `setEnabled` 走「翻转 spec.enabled → 写回配置」这条路，所以必须能落盘；回调缺失
   * （settings 服务不可用的极早期 / 单测）时只改内存里的 spec 与运行态——行为退化成
   * 「本次进程内生效、重启丢失」，而不是静默什么都不做（返回的 status 一样会反映结果）。
   */
  private persist: ((specs: TunnelSpec[]) => void) | null = null

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
        bastion: null,
        proxy: null,
        ready: false,
        server: null,
        connections: 0,
        totalConnections: 0,
        lastForwardError: null,
        retryTimer: null,
        retryAttempt: 0,
        dead: false,
        fatal: false,
        live: new Set(),
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
      fatal: rt.fatal,
      rule: ruleOf(rt.spec),
      connections: rt.connections,
      totalConnections: rt.totalConnections,
      lastForwardError: rt.lastForwardError,
    }))
  }

  /** 一条隧道的当前状态（不存在返回 undefined）。 */
  status(name: string): TunnelStatus | undefined {
    return this.list().find((tunnel) => tunnel.name === name)
  }

  /**
   * **本进程此刻真的持有**的本地监听端口集合（`probeTunnelPorts` 的豁免依据）。
   *
   * 为什么不是「配置里所有 localPort」：那条判据会把「A 已停用、B 想用同一个端口」
   * （完全合法）误报成冲突。只有 `server.listening === true` 才算**真的绑上了**——
   * `rt.server !== null` 不够：`startTunnel` 先建 server 再 `listen`，监听失败
   * （EADDRINUSE）时句柄仍在表里，按它判会把「其实没占住」说成「我占着」，
   * 于是端口被**别人**占着的那条真冲突反被豁免掉。
   */
  localPortsInUse(): Set<number> {
    const out = new Set<number>()
    for (const rt of this.tunnels.values()) {
      if (rt.server?.listening !== true) continue
      const port = Number(rt.spec.localPort ?? 0)
      if (Number.isInteger(port) && port >= 1 && port <= 65535) out.add(port)
    }
    return out
  }

  /**
   * 启停一条隧道（agent 的 `tunnel_start` / `tunnel_stop`）——**改配置，不只改运行态**。
   *
   * 为什么不是「只改运行时开关」：`src/tunnels.ts` 的一等设计是「settings 即真相源，
   * `reconcile()` 按配置对齐运行态」（见文件头）。再加一层运行态覆盖，就同时存在两个
   * 真相源，而 `reconcile` 会在下一次 settings 热应用（哪怕只是改了个 Shell 路径）时
   * **静默把 agent 刚停掉的隧道重新拉起**——这种「停了又自己回来」正是最难查的一类。
   * 所以这里翻转的就是 `spec.enabled`，与用户在卡片上点那个勾**走同一条路**：
   * 写入 caller 给的持久化回调 → settings 热应用 → reconcile。结果一致、可预期。
   *
   * 返回值是写完配置后的状态快照。**注意 `state` 是异步收敛的**：回来时通常是
   * `connecting`（拨号还没完成），要拿最终结论就稍后 `tunnel_list`。
   */
  setEnabled(name: string, enabled: boolean): { ok: true; status: TunnelStatus } | { ok: false; error: string } {
    const rt = this.tunnels.get(name)
    if (rt === undefined) {
      const known = [...this.tunnels.keys()]
      return {
        ok: false,
        error: `没有名为「${name}」的隧道。${known.length === 0 ? '当前没有任何隧道（在 插件配置 → 终端面板 卡片添加）' : '现有：' + known.join('、')}`,
      }
    }
    /*
     * 幂等边界：已经处于目标状态就什么都不做。
     *
     * `active` / `connecting` 才算「开着」——`error` **不**算：那正是最该重试的情形
     * （本地监听失败这类 fatal 故障不会自愈，但用户可能刚把配置改对，此时 `tunnel_start`
     * 就该真的再拨一次）。反过来 `stopped` 才算「关着」。
     */
    const running = rt.state === 'active' || rt.state === 'connecting'
    if ((enabled && rt.spec.enabled && running) || (!enabled && !rt.spec.enabled && rt.state === 'stopped')) {
      return { ok: true, status: this.status(name) as TunnelStatus }
    }
    this.applyEnabled(rt, enabled)
    const status = this.status(name)
    /* istanbul ignore next —— 上面刚确认过它在表里；留作类型收窄 */
    if (status === undefined) return { ok: false, error: `隧道「${name}」状态读取失败` }
    return { ok: true, status }
  }

  /** 翻转一条隧道的 enabled 并就地收敛运行态（`setEnabled` 的落点）。 */
  private applyEnabled(rt: RuntimeTunnel, enabled: boolean): void {
    rt.spec = { ...rt.spec, enabled }
    rt.signature = signatureOf(rt.spec)
    if (enabled) {
      // fatal 恢复的前置条件是配置被改对；没改配置就重开会在同一条错误上再撞一次，
      // 但仍允许重开——用户可能刚在卡片上改好、热应用还没到，这里重开就是让它立刻生效
      if (rt.server !== null || rt.conn !== null) this.stopTunnel(rt)
      rt.fatal = false
      rt.error = null
      this.startTunnel(rt)
    } else {
      this.stopTunnel(rt)
    }
    // 写回配置（settings 热应用 → reconcile 会按新配置收敛，与卡片上点那个勾同一条路）。
    // 放在最后：配置写失败（回调抛错）不该让运行态停在一个与配置相反的状态上。
    this.persist?.([...this.tunnels.values()].map((entry) => entry.spec))
  }

  /** 持久化回调注入（settings 就绪后一次；`setEnabled` 靠它把意图写回配置）。 */
  setPersist(persist: (specs: TunnelSpec[]) => void): void {
    this.persist = persist
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
        this.failTunnel(rt, localListenFailureMessage(rt.spec.localPort ?? 0, error))
      })
      server.listen(rt.spec.localPort ?? 0, '127.0.0.1', () => {
        this.logger.info(`[dsh-tty] 隧道 ${rt.spec.name} 监听 127.0.0.1:${String(rt.spec.localPort ?? 0)}`)
      })
      rt.server = server
    }
    void this.connectTunnel(rt)
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
    try {
      rt.bastion?.end()
    } catch {
      /* 已断开 */
    }
    rt.bastion = null
    rt.proxy?.dispose()
    rt.proxy = null
    rt.ready = false
    // 在途转发一并销毁（0.19.0）：停用/改规格时的在途 socket 与 channel
    // 不再「不可见、不可控」。end/close/destroy 按对象类型择一可用。
    for (const entry of rt.live) {
      const anyEntry = entry as unknown as { end?(): void; close?(): void; destroy?(): void }
      try {
        anyEntry.end?.()
      } catch {
        /* 已关闭 */
      }
      try {
        anyEntry.close?.()
      } catch {
        /* 已关闭 */
      }
      try {
        anyEntry.destroy?.()
      } catch {
        /* 已关闭 */
      }
    }
    rt.live.clear()
    rt.connections = 0
    rt.lastForwardError = null
    rt.state = 'stopped'
  }

  /**
   * 建连（**async**：认证配置要走凭据 provider 解析 `env:NAME` 引用）。错误仍在本方法内
   * 收敛成 scheduleRetry / failTunnel，调用方不必关心返回的 Promise。
   */
  private async connectTunnel(rt: RuntimeTunnel): Promise<void> {
    /*
     * fatal 之后不得再进入（D58，补完 D53）：本地监听失败 / 连接簿缺失是人工介入级，
     * 重试一百次也是同一结果。真正把生产打穿的那条路径是**定时器重入**（见
     * scheduleRetry 的 timer 回调），入口这一道是纵深防御——挡住任何新增调用方把
     * error 态刷回 connecting（那会让面板与 agent 永远以为「还在连」）。
     * fatal 只在 reconcile 按新签名重建运行时归零，所以这里不会挡住「改配置后恢复」。
     */
    if (rt.dead || rt.fatal) return
    const spec = rt.spec
    const book = this.resolveBook(spec.bookName)
    if (book === undefined) {
      // 配置级 fatal（0.19.0）：条目被删/改名后只有配置本身能修复，走重试只会
      // 永远失败循环（每 ≤15s 建连一次）；failTunnel 后 reconcile 收到更新
      // （bookName 改回/条目恢复）会按新签名重建隧道
      this.failTunnel(rt, `连接簿中不存在条目: ${spec.bookName}（条目被删除或改名）——在 设置 → 插件 → 终端面板 → 端口转发 里更正 bookName 或恢复条目后保存`)
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
      // 跳板机也要跟着走：隧道与终端走的是两条不同的连接，漏了它就得到「隧道连不上、
      // 终端能连」这种半吊子状态（本项立项时点名的正是这种状态）
      ...(book.jump !== undefined ? { jump: book.jump } : {}),
      // 代理命令同理（一整档信任级；闸门在 ssh.ts 的 dialProxyCommand 里统一判）
      ...(book.proxyCommand !== undefined ? { proxyCommand: book.proxyCommand } : {}),
    }
    const target = `${book.username}@${book.host}:${String(book.port)}`
    rt.state = 'connecting'
    let conn: Client
    try {
      // 认证配置可能抛错（keyPath 读不到 / 引用解析不到）——走重试等待配置修复。
      // 与终端/SFTP/探针共用同一条准备路径：跳板机 / 代理命令（若有）在这里拨。
      const prepared = await prepareSshConnect({ spec: sshSpec, store: this.store, logger: this.logger })
      const connectConfig: ConnectConfig = prepared.connectConfig
      const policy = prepared.policy
      conn = new Client()
      rt.conn = conn
      rt.bastion = prepared.bastion
      rt.proxy = prepared.proxy
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
        // 代理命令死了的话，ssh2 只会报「握手前连接中断」——把退出码 / stderr 补在后面，
        // 否则用户会去查目标主机（那里没有任何问题）
        this.scheduleRetry(rt, policy.mismatchMessage() ?? `SSH 连接失败（${target}）: ${classifyError(error.message)}${proxyFailureSuffix(rt.proxy)}`)
      })
      conn.on('close', () => {
        if (rt.conn !== conn) return
        rt.conn = null
        // 跳板机是**另一条**连接：目标这条断了必须一起关，否则重连后旧的会一直养着
        try {
          rt.bastion?.end()
        } catch {
          /* 已断开 */
        }
        rt.bastion = null
        // 代理命令是**另一个进程**：同理，目标断了就杀，别让它靠 keepalive 一直挂着
        rt.proxy?.dispose()
        rt.proxy = null
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
    rt.live.add(stream)
    const local = net.connect(
      { host: spec.localTargetHost?.trim() || '127.0.0.1', port: spec.localTargetPort ?? 0 },
      () => {
        stream.pipe(local)
        local.pipe(stream)
      },
    )
    rt.live.add(local)
    // 计数恰好一次：stream 与 local 任何一侧结束都算这条转发完了
    let counted = true
    const finish = (): void => {
      if (!counted) return
      counted = false
      rt.connections = Math.max(0, rt.connections - 1)
      rt.live.delete(stream)
      rt.live.delete(local)
    }
    const kill = (): void => {
      finish()
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
    stream.on('close', finish)
    local.on('close', finish)
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
    rt.live.add(socket)
    let channel: import('ssh2').ClientChannel | null = null
    // 计数恰好一次：forwardOut 失败（原实现漏减、计数虚高）与正常收尾共用
    let counted = true
    const finish = (): void => {
      if (!counted) return
      counted = false
      rt.connections = Math.max(0, rt.connections - 1)
      rt.live.delete(socket)
      if (channel !== null) rt.live.delete(channel)
    }
    conn.forwardOut('127.0.0.1', 0, spec.remoteHost?.trim() ?? '', spec.remotePort ?? 0, (error, stream) => {
      if (error !== undefined && error !== null) {
        rt.lastForwardError = `目标 ${spec.remoteHost?.trim() ?? '?'}:${String(spec.remotePort ?? 0)} 拨号失败: ${error.message}`
        this.logger.warn(`[dsh-tty] 隧道 ${rt.spec.name} forwardOut 失败: ${error.message}`)
        finish()
        socket.destroy()
        return
      }
      channel = stream
      rt.live.add(stream)
      stream.on('close', finish)
      socket.on('close', finish)
      const kill = (): void => {
        finish()
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
      socket.pipe(stream)
      stream.pipe(socket)
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
    // fatal（本地监听失败 / 连接簿条目缺失）不走重试：这两类故障重试一百次也是
    // 同一个结果，而重试路径会 (a) 把 fatal 清回 false、(b) 经 connectTunnel 把
    // 状态刷成 connecting —— 于是「本地端口压根没监听成功」被粉饰成「正在连接」，
    // 且原来那条错误信息看起来像临时性的（D53）。保持 error 态与原因，等用户修配置
    // （reconcile 收到新规格会重建隧道）。
    if (rt.fatal) return
    rt.error = message
    rt.state = 'error'
    rt.fatal = false
    rt.conn = null
    try {
      rt.bastion?.end()
    } catch {
      /* 已断开 */
    }
    rt.bastion = null
    rt.proxy?.dispose()
    rt.proxy = null
    rt.ready = false
    rt.connections = 0
    if (rt.dead || rt.retryTimer !== null) return
    const delay = Math.min(MAX_RETRY_DELAY_MS, 1000 * 2 ** rt.retryAttempt)
    rt.retryAttempt += 1
    this.logger.warn(`[dsh-tty] 隧道 ${rt.spec.name} 将在 ${String(delay)}ms 后重连（第 ${String(rt.retryAttempt)} 次）：${message}`)
    const timer = setTimeout(() => {
      rt.retryTimer = null
      // fatal 必须一起挡（D58）：定时器可能在 fatal **之前**就排好了——凭据解析失败
      // 先发生（非 fatal，排 1s 定时器）、本地监听 EADDRINUSE 后到（fatal）。放它进来
      // 会把 error 覆写成 connecting，而随后的失败又都被本方法的 fatal 短路挡住，
      // 于是状态永久卡在 connecting、还挂着那条致命错误（生产实测的顺序）。
      if (!rt.dead && !rt.fatal && rt.spec.enabled) void this.connectTunnel(rt)
    }, delay)
    timer.unref?.()
    rt.retryTimer = timer
  }
}
