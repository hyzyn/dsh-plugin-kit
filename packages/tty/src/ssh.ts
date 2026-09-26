/**
 * @hyzyn/dsh-tty — SSH 会话封装（方案 C：ssh2 原生集成）。
 *
 * 不经过本地 ssh 进程 / node-pty，直接用 ssh2 建立连接并开 shell channel，
 * 包装成与本地 PTY 完全一致的 TermHandle 形状，TtyServer 无差别调度：
 * input/resize/kill 上行，data/exit 下行，背压、环形缓冲、agent 工具全复用。
 *
 * 认证优先级由 spec.auth 决定：
 *   agent    —— ssh-agent（SSH_AUTH_SOCK），最推荐，凭证不落盘
 *   key      —— keyPath 私钥文件（~ 可省略 home），passphrase 可选
 *   password —— 密码认证，同时挂 keyboard-interactive（很多服务端只开这个）
 * password / passphrase 支持 `env:VAR` 前缀从进程环境变量取值（配合
 * dsh-env-manager 插件托管密钥，避免明文写入 settings 文件）。
 *
 * 主机密钥策略：known_hosts TOFU（trust-on-first-use）钉扎——hostVerifier 里
 * 首次连接记录 sha256 指纹（经 HostKeyStore 持久化），之后每次连接校验：
 * 指纹一致放行；指纹变更拒绝连接（防中间人冒充），用户确认安全后可在
 * 设置卡片删除该主机记录重连。未提供 hostKeyStore 时退化为 accept-and-log
 * （旧行为，测试路径用）。
 */
import { Client } from 'ssh2'
import type { ClientChannel, ConnectConfig, ShellOptions } from 'ssh2'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { StringDecoder } from 'node:string_decoder'
import { TMUX_SOCKET } from './tmux.js'
import { shSingleQuote } from './shell-integration.js'
import { StatsLineBuffer } from './stats.js'

/* ------------------------------------------------------------------ *
 * 统一会话句柄：本地 PTY 与 SSH channel 共用同一形状
 * ------------------------------------------------------------------ */

export interface TermExit {
  exitCode: number | null
  signal: string | null
}

export interface TermHandle {
  readonly kind: 'local' | 'ssh'
  /** SSH 会话没有本地 pid，为 null。 */
  readonly pid: number | null
  /** 输出流（flowing 模式消费；pause/resume 用于下行背压）。 */
  readonly output: PassThrough
  /** 退出事实，恰好 resolve 一次。 */
  readonly done: Promise<TermExit>
  write(data: string): Promise<unknown>
  resize(cols: number, rows: number): void
  terminate(): Promise<unknown>
  /** terminate 失败后的最后手段（本地 PTY：对顶层 shell 直接 SIGKILL）。 */
  forceKill?(): void
  /**
   * tmux 背书会话（0.10.0 持久化）的关闭收尾：kill-session 让 pane 真正结束，
   * 而不是只杀客户端把会话留在 tmux server 上。kill 帧路径在 forceKill 前调用。
   */
  tmuxTeardown?(): Promise<void>
  /**
   * 强制 tmux 重画该会话的全部客户端（0.10.1 跨窗口共享：新绑定连接的
   * xterm 需要一份可见屏重画）。本地实现走本机 tmux CLI（src/tmux.ts），
   * SSH 实现在远程连接内 exec（本机 tmux 看不到远程会话）。
   */
  tmuxRefresh?(): Promise<void>
  /**
   * 服务器状态条（0.17.0）：在同一条 SSH 连接上另开一条**非 PTY 的 exec
   * channel**（RFC 4254 §6.5）跑常驻采集脚本，按行回调 stdout。返回句柄的
   * stop() 关闭 channel（远端循环随之结束）。任何失败（对端拒绝 exec、
   * MaxSessions 超限、连接断开、采集进程自己退出）只回调 onError——采集是
   * 附加能力，调用方静默停表，绝不写 PTY、绝不弹错。
   * 只有 SSH 实现提供：本地会话由宿主自己采（见 stats.ts 的本地采样器）。
   */
  statsExec?(command: string, onLine: (line: string) => void, onError: () => void): { stop(): void }
  /** spawn 后注入终端的灰字提示（如远程无 tmux 降级为普通会话）。 */
  startupNotice?: string
}

/* ------------------------------------------------------------------ *
 * 规格与工具
 * ------------------------------------------------------------------ */

/**
 * TOFU 主机指纹记录（0.19.0 起一机多指纹）：known_hosts 里同一 host:port 常
 * 同时有 ssh-rsa 与 ssh-ed25519 两行，而 ssh2 优先协商 ed25519——只留一条
 * 指纹时，RSA 行在前的老机器导入后必然「指纹不符 → 假 MITM 告警」。集合任一
 * 命中即放行；同机指纹总量有上限（防止无界增长），上限内不做算法识别。
 */
export interface HostKeyRecord {
  host: string
  port: number
  /** hostVerifier 收到的原样 sha256 十六进制指纹（多把钥匙 = 多个）。 */
  fingerprints: string[]
}

/** 内联 SSH 连接规格（ws 帧或连接簿条目共用）。 */
export interface SshSpec {
  host: string
  port?: number
  username: string
  auth?: 'agent' | 'key' | 'password'
  keyPath?: string
  passphrase?: string
  password?: string
  /** OpenSSH agent forwarding：远程可用本地 ssh-agent 的钥匙（git clone 等）。 */
  agentForward?: boolean
  /** 经跳板机连接（ProxyJump 语义，**单跳**）；缺省 = 直连。 */
  jump?: SshJumpSpec
}

/**
 * 跳板机规格（ProxyJump 语义，**单跳**）。
 *
 * 与 `SshSpec` 同形但**不再嵌套**——不支持「跳板机的跳板机」；`username` / `auth` /
 * `keyPath` / `passphrase` / `password` 任一缺省都会**继承目标那一跳**（企业内网里两者
 * 通常共用同一把钥匙或同一个 agent），这也正是 v1 的界面只需要一个输入框的原因。
 *
 * 为什么不像 OpenSSH 那样只存 `user@host:port` 字符串：字符串装不下「与目标不同的凭据」，
 * 而本仓所有认证都要走 `resolveSecret`（`env:VAR` 引用 / 凭据存储层）。界面与导入可以把
 * 简写解析成这个结构。
 *
 * 凭据永不进日志与错误文案：展示串只由 `jumpTargetLabel()` 生成（`user@host:port`）。
 */
export interface SshJumpSpec {
  host: string
  port?: number
  username?: string
  auth?: 'agent' | 'key' | 'password'
  keyPath?: string
  passphrase?: string
  password?: string
}

/** 连接簿条目（带名字，存 settings）。 */
export interface SshHostEntry extends SshSpec {
  name: string
  /** 该条目的 SSH 标签默认以 tmux 持久会话打开（仅宿主 persistence=tmux 时生效）。 */
  persist?: boolean
}

export interface SshSpawnOptions {
  term: string
  cols: number
  rows: number
  logger?: { info(msg: string): void; warn(msg: string): void }
  /**
   * known_hosts TOFU 钉扎存储：首次连接 record() 记录指纹，之后 get() 校验。
   * 缺省时退化为 accept-and-log（仅记录指纹，无条件放行）。
   */
  hostKeyStore?: HostKeyStore
  /**
   * tmux 会话持久化（0.10.0）：远程以 `exec tmux new-session -A -s <name>` 开
   * pty channel（专用 socket dsh-tty），会话托管在远程 tmux server 上，断线/
   * 宿主重启后按同名接回。远程无 tmux 时降级普通 shell channel，
   * startupNotice 带提示。name 须已过 sanitizePersistName（安全字符集）。
   */
  persist?: { name: string }
  /**
   * 自定义远程命令（0.14.0）：给「开一个标签直接跑某条命令」用（如
   * `docker exec -it <容器> sh`）。设置后走 `conn.exec(command, {pty})`，
   * 不建登录 shell、也不做 tmux 持久化（命令的生命周期本就短）。
   * 命令由宿主侧插件提供，单行（由帧解析保证）。
   */
  command?: string
}

/**
 * 主机指纹钉扎存储（宿主半体实现为 LiveConfig + settings 持久化）。
 * get 返回 undefined 表示该 host:port 从未记录；返回数组（≥1 条）时任一命中放行。
 */
export interface HostKeyStore {
  /** 已记录的指纹集合（hostVerifier 收到的原样十六进制串）；未记录返回 undefined。 */
  get(host: string, port: number): string[] | undefined
  /** 握手时记录指纹（已存在该 host:port 的记录则并入集合）。 */
  record(host: string, port: number, fingerprint: string): void
}

/**
 * 官方凭据服务的**最小结构面**（结构类型，不把这个包加成本插件依赖）。
 *
 * 契约见 `@deepseek-ai/dsh-credentials`：`resolve(ref)` **每次操作重新解析、不得跨操作缓存**，
 * 返回 `{ value, source }` 或 undefined。这里只声明用到的那一个方法——既不必引依赖，也能在
 * 服务缺失时静态看出"没有它"。
 */
export interface CredentialResolver {
  resolve(ref: string): Promise<{ value: string } | undefined>
}

let credentialsProvider: CredentialResolver | null = null

/** 由 index.ts 在可选注入里挂上（服务缺失即为 null，退回 process.env）。 */
export function setCredentialResolver(resolver: CredentialResolver | null): void {
  credentialsProvider = resolver
}

/**
 * 解析密钥引用（`env:NAME`）——**纯核心**，provider 由调用方给，便于离线断言。
 *
 * 顺序：官方凭据 provider **优先**（它自己叠 `file`（`$DSH_HOME/.credentials.yaml`）/ `env` /
 * `project-env` / `user-env` 各层，而且"每次操作重新解析"——改完下一个操作即生效，不必重启
 * 宿主）；服务不在、或它没有这个引用时，再退回 `process.env`。
 *
 * 为什么必须走 provider：凭据存储里的值**永远不会被 materialize 进环境**（provider README 原话：
 * "a store the harness owns and never materializes into the environment"），所以只读
 * `process.env` 等于"存进凭据存储的值连接时根本读不到" ✗ —— 这正是「存入凭据存储」这条链此前
 * 断掉的地方（客户端那半切好了、宿主这半没切）。
 *
 * provider 抛错**不吞**：记下来，若环境变量也没有就把两个来源一起写进错误里。否则"凭据服务
 * 坏了"会伪装成"你没配"，而那是最难查的一类。
 */
export async function resolveSecretVia(
  provider: CredentialResolver | null,
  value: string | undefined,
): Promise<string | undefined> {
  if (value === undefined) return undefined
  if (!value.startsWith('env:')) return value
  const name = value.slice(4)
  let providerError: string | null = null
  /** provider 明确找到了该引用（哪怕值是空串）——与「引用不存在」分开报 */
  let providerFound = false
  if (provider !== null && provider !== undefined && typeof provider.resolve === 'function') {
    try {
      const resolved = await provider.resolve(name)
      if (resolved !== null && resolved !== undefined) {
        providerFound = true
        if (typeof resolved.value === 'string' && resolved.value !== '') {
          return resolved.value
        }
      }
    } catch (error) {
      providerError = error instanceof Error ? error.message : String(error)
    }
  }
  const fromEnv = process.env[name]
  if (fromEnv !== undefined && fromEnv !== '') return fromEnv
  // 「存在但值为空」单独报：报成「未设置」会把用户引去新建同名引用——那只会再失败一次
  if (providerFound || fromEnv === '') {
    const detail = providerError === null ? '' : `（凭据服务报错：${providerError}）`
    throw new Error(`凭据 ${name} 的值是空串${detail}——请在凭据存储或环境变量里补上实际值，新建同名引用解决不了`)
  }
  const detail = providerError === null ? '' : `（凭据服务报错：${providerError}）`
  const missing = provider === null ? '凭据服务不可用，' : ''
  throw new Error(`凭据未设置：${name}${detail} —— ${missing}环境变量里也没有`)
}

/** 生产路径：用当前注入的 provider（`index.ts` 注入；没注入就是 null）。 */
export async function resolveSecret(value: string | undefined): Promise<string | undefined> {
  return resolveSecretVia(credentialsProvider, value)
}

function expandHome(path: string): string {
  if (path === '~') return homedir()
  if (path.startsWith('~/')) return join(homedir(), path.slice(2))
  return path
}

/** 供 ~/.ssh/config 导入路由使用（~ 与 ~/ 前缀展开 home）。 */
export { expandHome }

/** 展示用目标串：user@host（非默认端口时带 :port）。 */
export function sshTarget(spec: SshSpec): string {
  const port = spec.port ?? 22
  return `${spec.username}@${spec.host}${port === 22 ? '' : ':' + String(port)}`
}

/**
 * 把 ssh2 的底层错误消息分类为人类可读诊断（0.19.0 自 probe.ts 上移至此统一
 * 导出——终端 / 隧道 / 探测三条路径共用同一套文案，不再透传原始英文）。
 * 分类串本身已含关键字段；无法识别时原样返回。
 */
export function classifyError(message: string): string {
  if (message === 'Host key verification failed') {
    return '主机密钥校验失败（TOFU 不匹配，见 hostkey 指引）'
  }
  if (message.includes('All configured authentication methods failed')) {
    return '认证被拒绝：所有认证方式均失败（用户名/密码/密钥是否正确，或服务端是否允许该认证方式）'
  }
  if (message.includes('Timed out')) {
    // 跳板机提示（项目级 ROADMAP 第 2 项）：企业内网主机几乎都要过 bastion，而本版本
    // 不支持——「20s 后一句通用超时」正是原文点名的症状。导入侧已改为跳过并明说，
    // 这里补上手工填地址那条路。
    return '超时：主机无响应或认证协商超时（检查地址 / 端口 / 防火墙 / 网络。'
      + '若该主机只能经跳板机访问（~/.ssh/config 里的 ProxyJump / ProxyCommand），本版本尚不支持，'
      + '见项目级 ROADMAP 第 2 项）'
  }
  const lower = message.toLowerCase()
  if (lower.includes('econnrefused')) return '连接被拒绝（ECONNREFUSED）：端口未监听或服务未启动'
  if (lower.includes('enetunreach')) return '网络不可达（ENETUNREACH）：路由不通或主机离线'
  if (lower.includes('ehostunreach')) return '主机不可达（EHOSTUNREACH）'
  if (lower.includes('eai_again') || lower.includes('eai_noname') || lower.includes('enotfound')) return 'DNS 解析失败：主机名无法解析'
  if (lower.includes('getaddrinfo')) return 'DNS 解析失败：主机名无法解析'
  if (lower.includes('unable to exchange encryption keys') || lower.includes('encryption') || lower.includes('kex')) {
    return '密钥交换失败：服务端可能不是 SSH 服务，或加密算法不兼容'
  }
  if (lower.includes('keepalive')) return '连接保活超时（keepalive）'
  if (lower.includes('protocol')) return '协议错误：' + message
  return message
}

/* ------------------------------------------------------------------ *
 * 连接与 channel 包装
 * ------------------------------------------------------------------ */

/**
 * 构造连接配置（认证三态 + keepalive + hostHash）；spawnSsh / probeSsh / SFTP / 隧道共用。
 *
 * **async**：`env:NAME` 引用要经官方凭据 provider 解析（每操作重解析，不可缓存），见
 * resolveSecretVia —— 这是"存入凭据存储"的值能被连接真正用到的唯一通路。
 */
export async function buildConnectConfig(spec: SshSpec): Promise<ConnectConfig> {  const auth = spec.auth ?? 'agent'
  const base: ConnectConfig = {
    host: spec.host,
    port: spec.port ?? 22,
    username: spec.username,
    readyTimeout: 20000,
    keepaliveInterval: 10000,
    keepaliveCountMax: 3,
    // hostVerifier 依赖 hostHash 计算指纹；放行与否由 spawnSsh 里的
    // TOFU 策略（HostKeyStore）决定，见文件头策略说明
    hostHash: 'sha256',
  }
  if (auth === 'agent') {
    // 预检（0.19.0）：缺 SSH_AUTH_SOCK 时 ssh2 只会报「All configured
    // authentication methods failed」，用户根本想不到是 agent 没跑
    if (process.env.SSH_AUTH_SOCK === undefined || process.env.SSH_AUTH_SOCK === '') {
      throw new Error('auth=agent 需要 SSH_AUTH_SOCK（本机未运行 ssh-agent 或变量未设置）；在终端面板宿主环境起 agent，或改用 key / password 认证')
    }
    base.agent = process.env.SSH_AUTH_SOCK
  } else if (auth === 'key') {
    if (typeof spec.keyPath !== 'string' || spec.keyPath.trim() === '') {
      throw new Error('auth=key 需要 keyPath（私钥路径）')
    }
    base.privateKey = readFileSync(expandHome(spec.keyPath.trim()))
    const passphrase = await resolveSecret(spec.passphrase)
    if (passphrase !== undefined) base.passphrase = passphrase
  } else {
    const password = await resolveSecret(spec.password)
    if (password === undefined) throw new Error('auth=password 需要 password（或 env:VAR 引用）')
    base.password = password
    // 大量服务端（如部分路由器/堡垒机）只开 keyboard-interactive
    base.tryKeyboard = true
  }
  // agent forwarding 需要 agent 通道：key/password 认证时也把 SSH_AUTH_SOCK
  // 挂上（只用于转发，不参与认证）。@types/ssh2 的 ConnectConfig.agentForward
  // 在缺 agent 时会直接 throw，故这里仅在 SOCK 存在时设置
  if (spec.agentForward === true && process.env.SSH_AUTH_SOCK !== undefined && process.env.SSH_AUTH_SOCK !== '') {
    base.agent = base.agent ?? process.env.SSH_AUTH_SOCK
  }
  return base
}

/** 本文件与各连接点共用的最小日志面（结构上兼容宿主 logger）。 */
export interface SshLogger {
  info(msg: string): void
  warn(msg: string): void
}

/** @types/ssh2 的 ShellOptions 未声明 agentForward（运行时支持），最小补丁类型。 */
type ShellOptionsWithAgentForward = ShellOptions & { agentForward?: boolean }

/** TOFU 主机指纹策略（hostVerifier 接线）；返回的 mismatchMessage() 供连接错误路径取人类可读拒绝原因。 */
export function applyHostKeyPolicy(options: {
  connectConfig: ConnectConfig
  spec: SshSpec
  store?: HostKeyStore
  logger?: { info(msg: string): void; warn(msg: string): void }
  target: string
}): { mismatchMessage(): string | null } {
  const { connectConfig, spec, store, logger, target } = options
  const port = spec.port ?? 22
  let hostKeyMismatch: string | null = null
  connectConfig.hostVerifier = (hash: string) => {
    const known = store?.get(spec.host, port)
    if (known === undefined || known.length === 0) {
      store?.record(spec.host, port, hash)
      logger?.info(`[dsh-tty] ssh ${target} 首次连接，已记录 host key 指纹 sha256:${hash}（TOFU）`)
      return true
    }
    if (known.includes(hash)) {
      logger?.info(`[dsh-tty] ssh ${target} host key 指纹匹配（sha256:${hash}，该主机共记录 ${String(known.length)} 把钥匙）`)
      return true
    }
    const shown = known.slice(0, 3).map((f) => `sha256:${f}`).join(' / ')
    const more = known.length > 3 ? ` 等 ${String(known.length)} 把` : ''
    hostKeyMismatch =
      `SSH 主机密钥指纹变更：${target} 已记录 ${shown}${more}，本次为 sha256:${hash}。` +
      '可能是主机重装或换钥匙，也可能是中间人（MITM）冒充；确认安全后，到 插件配置 → 终端面板 → SSH 主机密钥记录 删除该主机再重连。'
    logger?.warn(`[dsh-tty] ${hostKeyMismatch}`)
    return false
  }
  return { mismatchMessage: () => hostKeyMismatch }
}

/** 跳板机展示串（`user@host:port`）；没有跳板机时返回空串。**凭据不进这里**。 */
export function jumpTargetLabel(spec: SshSpec): string {
  const jump = spec.jump
  if (jump === undefined || jump.host.trim() === '') return ''
  const port = jump.port ?? 22
  return `${jump.username ?? spec.username}@${jump.host.trim()}${port === 22 ? '' : ':' + String(port)}`
}

/**
 * 目标那一跳的展示串 + 跳板机后缀（**给用户看的错误文案**用）。
 *
 * 为什么错误文案必须带这一句：ssh2 在两跳上共用 `readyTimeout`，报的都是
 * `Timed out while waiting for handshake`——不点名的话「跳板机不可达」会伪装成
 * 「目标超时」，用户会去查对端主机而问题在跳板机上。
 */
function targetWithJump(spec: SshSpec): string {
  const label = jumpTargetLabel(spec)
  return label === '' ? sshTarget(spec) : `${sshTarget(spec)}（经跳板机 ${label}）`
}

/** 跳板机那一跳的连接规格：显式给的优先，其余**继承目标**。 */
function jumpSpecOf(spec: SshSpec): SshSpec {
  const jump = spec.jump as SshJumpSpec
  const username = typeof jump.username === 'string' && jump.username.trim() !== '' ? jump.username.trim() : spec.username
  return {
    host: jump.host.trim(),
    port: jump.port ?? 22,
    username,
    auth: jump.auth ?? spec.auth ?? 'agent',
    keyPath: jump.keyPath ?? spec.keyPath,
    passphrase: jump.passphrase ?? spec.passphrase,
    password: jump.password ?? spec.password,
  }
}

/**
 * 跳板机连接 + 借来的通道（目标那一跳把它当 `ConnectConfig.sock`）。
 *
 * 跳板机**自己的 TOFU 策略**在 `dialJump` 内部就接好了（指纹变更提示必须来自正确的那一跳，
 * 而握手期的错误也只有那一段能拿到），所以不往外传句柄。
 */
export interface JumpDial {
  /**
   * 跳板机连接：**它拥有通道**，目标 client 只是借用（ssh2 的 `end()`/`destroy()` 只关
   * 借来的通道，不关跳板机传输）——谁拨的号，谁就要在收尾时 `end()` 它。
   */
  bastion: Client
  sock: ClientChannel
}

/** 跳板机通道打开兜底（与 channel 打开兜底同思路：对端不回 `forwardOut` 回调时不能让 await 挂着）。 */
const JUMP_CHANNEL_TIMEOUT_MS = 15_000

/**
 * 拨跳板机并借一条 `forwardOut` 通道（ProxyJump 单跳）。
 *
 * 三件事刻意做在这里：
 *   1. **失败一律点名跳板机**（见 `targetWithJump` 的理由）；
 *   2. **指纹策略单独一份**：TOFU 的键是 `(host, port)`，跳板机与目标撞 host:port
 *      （NAT 后的 `127.0.0.1:22` 很常见）时不能共用句柄，否则会出现假「指纹变更」；
 *   3. **失败路径自己关连接**：抛出去之前 `end()` 掉，否则每次重试都会漏一条
 *      keepalive 一直养着的连接。
 */
export async function dialJump(options: {
  spec: SshSpec
  store?: HostKeyStore
  logger?: SshLogger
  /** 覆盖跳板机那一跳的握手超时（探针路径要短；缺省沿用 buildConnectConfig 的 20s）。 */
  readyTimeoutMs?: number
}): Promise<JumpDial> {
  const jumpSpec = jumpSpecOf(options.spec)
  const label = jumpTargetLabel(options.spec)
  const destination = sshTarget(options.spec)
  const bastion = new Client()
  const closeQuietly = (): void => {
    try {
      bastion.end()
    } catch {
      /* 已断开 */
    }
  }
  let connectConfig: ConnectConfig
  try {
    connectConfig = await buildConnectConfig(jumpSpec)
  } catch (error) {
    // 预检类错误（缺 SSH_AUTH_SOCK / keyPath 读不到 / 引用解析不到）也要点名跳板机
    throw new Error(`跳板机连接失败（${label}）：${error instanceof Error ? error.message : String(error)}`)
  }
  if (options.readyTimeoutMs !== undefined) connectConfig.readyTimeout = options.readyTimeoutMs
  const policy = applyHostKeyPolicy({ connectConfig, spec: jumpSpec, store: options.store, logger: options.logger, target: `跳板机 ${label}` })
  await new Promise<void>((resolve, reject) => {
    let settled = false
    const fail = (error: Error): void => {
      if (settled) return
      settled = true
      closeQuietly()
      reject(error)
    }
    bastion.once('ready', () => {
      if (settled) return
      settled = true
      resolve()
    })
    bastion.on('error', (error: Error) => {
      fail(new Error(policy.mismatchMessage() ?? `跳板机连接失败（${label}）：${classifyError(error.message)}`))
    })
    bastion.once('close', () => {
      fail(new Error(`跳板机连接已关闭（${label}）：目标连接尚未建立`))
    })
    if ((connectConfig as { tryKeyboard?: boolean }).tryKeyboard === true) {
      const password = (connectConfig as { password?: string }).password ?? ''
      bastion.on('keyboard-interactive', (_name, _instructions, _lang, _prompts, finishKb) => {
        finishKb([password])
      })
    }
    try {
      bastion.connect(connectConfig)
    } catch (error) {
      fail(new Error(`跳板机连接失败（${label}）：${error instanceof Error ? error.message : String(error)}`))
    }
  })
  const sock = await new Promise<ClientChannel>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      closeQuietly()
      reject(new Error(`跳板机通道打开超时（${label} → ${destination}，${String(JUMP_CHANNEL_TIMEOUT_MS / 1000)}s 无响应）：跳板机可能不允许转发或不响应`))
    }, JUMP_CHANNEL_TIMEOUT_MS)
    timer.unref?.()
    bastion.forwardOut('127.0.0.1', 0, options.spec.host, options.spec.port ?? 22, (error: Error | null | undefined, channel: ClientChannel) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error !== undefined && error !== null) {
        closeQuietly()
        reject(new Error(`跳板机通道打开失败（${label} → ${destination}）：${error.message}`))
        return
      }
      resolve(channel)
    })
  })
  options.logger?.info(`[dsh-tty] ssh ${destination} 经跳板机 ${label} 已建立转发通道（ProxyJump）`)
  return { bastion, sock }
}

/**
 * 清洗一份跳板机输入（settings schema / 宽松清洗 / 内联融合共用）。
 *
 * 返回 `undefined` = **没有可用的跳板机**（`host` 为空）——调用方据此把 `jump` 整个丢掉，
 * 而不是留下一个 `host: ''` 的半个对象（那会让 `dialJump` 去连空主机名）。
 * 缺省不填的字段**不写进结果**：它们要在拨号时「继承目标那一跳」（见 `jumpSpecOf`）。
 */
export function sanitizeJumpSpec(input: unknown): SshJumpSpec | undefined {
  if (typeof input !== 'object' || input === null) return undefined
  const raw = input as Record<string, unknown>
  const host = typeof raw.host === 'string' ? raw.host.trim() : ''
  if (host === '') return undefined
  const port = Number(raw.port)
  const jump: SshJumpSpec = { host, port: Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 22 }
  if (typeof raw.username === 'string' && raw.username.trim() !== '') jump.username = raw.username.trim()
  if (raw.auth === 'agent' || raw.auth === 'key' || raw.auth === 'password') jump.auth = raw.auth
  if (typeof raw.keyPath === 'string' && raw.keyPath !== '') jump.keyPath = raw.keyPath
  if (typeof raw.passphrase === 'string' && raw.passphrase !== '') jump.passphrase = raw.passphrase
  if (typeof raw.password === 'string' && raw.password !== '') jump.password = raw.password
  return jump
}

/** 严格校验一份跳板机输入（HTTP POST 路径）；返回错误信息或清洗结果。 */
export function validateJumpSpec(input: unknown): { jump?: SshJumpSpec; error?: string } {
  if (typeof input !== 'object' || input === null) return { error: 'jump 必须是对象' }
  const raw = input as Record<string, unknown>
  if (typeof raw.host !== 'string' || raw.host.trim() === '') return { error: 'jump.host 必须是非空字符串' }
  if (raw.port !== undefined && raw.port !== '') {
    const port = Number(raw.port)
    if (!Number.isInteger(port) || port < 1 || port > 65535) return { error: 'jump.port 必须是 1~65535 的整数' }
  }
  if (raw.username !== undefined && typeof raw.username !== 'string') return { error: 'jump.username 必须是字符串' }
  if (raw.auth !== undefined && raw.auth !== 'agent' && raw.auth !== 'key' && raw.auth !== 'password') {
    return { error: 'jump.auth 必须是 agent / key / password' }
  }
  for (const key of ['keyPath', 'passphrase', 'password'] as const) {
    if (raw[key] !== undefined && typeof raw[key] !== 'string') return { error: `jump.${key} 必须是字符串` }
  }
  if (raw.auth === 'key' && (typeof raw.keyPath !== 'string' || raw.keyPath.trim() === '')) {
    return { error: 'jump.auth=key 需要 jump.keyPath' }
  }
  return { jump: sanitizeJumpSpec(raw) }
}

/** 建连前准备的结果：目标 config（可能挂了跳板机通道）+ 目标那一跳的 TOFU 策略。 */
export interface PreparedSshConnect {
  connectConfig: ConnectConfig
  policy: { mismatchMessage(): string | null }
  /** 需要跳板机时非 null；**调用方必须在收尾时 `end()` 它**（目标只是借用它的通道）。 */
  bastion: Client | null
  /** 展示串：带「经跳板机 X」后缀，错误文案直接用。 */
  target: string
}

/**
 * 四个连接点（终端 / SFTP / 隧道 / 探针）**共用**的建连前准备。
 *
 * 为什么要有这个函数：跳板机不是「终端的特性」——SFTP、端口转发、探针各自都在建 SSH 连接
 * （`sftp.ts` / `tunnels.ts` / `probe.ts` 各有一处 `new Client()`）。把「构造 config →
 * 需要时拨跳板机 → 接上通道 → 装目标 TOFU 策略」收成一处，四条路才不会各写一份
 * （那正是这一项立项时点名的「三处各写一份必然漂」）。
 *
 * **调用方负责**：自己 `conn.connect(connectConfig)`、自己处理 ready/error/close，
 * 并在收尾（成功或失败）时对 `bastion` 调 `end()`。
 */
export async function prepareSshConnect(options: {
  spec: SshSpec
  store?: HostKeyStore
  logger?: SshLogger
  /** 覆盖两跳的握手超时（探针路径要短） */
  readyTimeoutMs?: number
}): Promise<PreparedSshConnect> {
  const { spec, store, logger } = options
  const target = targetWithJump(spec)
  const { connectConfig, bastion } = await attachJumpSock(options)
  const policy = applyHostKeyPolicy({ connectConfig, spec, store, logger, target })
  return { connectConfig, policy, bastion, target }
}

/**
 * 只做「构造目标 config（需要时拨跳板机并把通道接上）」这一半。
 *
 * 拆出来的唯一理由：**探针自己装 hostVerifier**（`makeHostKeyVerifier` 要收集
 * hostkey 结论，不用 `applyHostKeyPolicy`），但它同样需要跳板机。返回值里的
 * `bastion` 由调用方负责收尾。
 */
export async function attachJumpSock(options: {
  spec: SshSpec
  store?: HostKeyStore
  logger?: SshLogger
  readyTimeoutMs?: number
}): Promise<{ connectConfig: ConnectConfig; bastion: Client | null }> {
  const { spec, store, logger } = options
  const connectConfig = await buildConnectConfig(spec)
  if (options.readyTimeoutMs !== undefined) connectConfig.readyTimeout = options.readyTimeoutMs
  if (spec.jump === undefined) return { connectConfig, bastion: null }
  const dialed = await dialJump({ spec, store, logger, readyTimeoutMs: options.readyTimeoutMs })
  connectConfig.sock = dialed.sock
  return { connectConfig, bastion: dialed.bastion }
}

/**
 * 建立 SSH 连接并打开交互 shell channel，返回 TermHandle。
 * 失败（连接超时/认证被拒/host 不可达）时 reject 带人类可读信息。
 */
export async function spawnSsh(spec: SshSpec, options: SshSpawnOptions): Promise<TermHandle> {
  const target = sshTarget(spec)
  const logger = options.logger
  // agent forwarding 预检：缺 SSH_AUTH_SOCK 时 ssh2 只会静默不转发，这里显式报错
  if (spec.agentForward === true && (process.env.SSH_AUTH_SOCK === undefined || process.env.SSH_AUTH_SOCK === '')) {
    throw new Error('agent forwarding 需要 SSH_AUTH_SOCK（本机未运行 ssh-agent 或变量未设置）')
  }
  const conn = new Client()
  /** 跳板机连接（ProxyJump）：它拥有目标借用的通道，收尾时必须由本函数 end 掉。 */
  let bastion: Client | null = null
  const output = new PassThrough()

  let exitCode: number | null = null
  let exitSignal: string | null = null
  let settleDone!: (outcome: TermExit) => void
  const done = new Promise<TermExit>((resolve) => {
    settleDone = resolve
  })
  let finished = false
  const finish = (): void => {
    if (finished) return
    finished = true
    try {
      output.end()
    } catch {
      /* 已结束 */
    }
    try {
      conn.end()
    } catch {
      /* 已断开 */
    }
    // 跳板机**最后**关：顺序反了会在目标还活着时抽掉它借用的通道
    if (bastion !== null) {
      try {
        bastion.end()
      } catch {
        /* 已断开 */
      }
    }
    settleDone({ exitCode, signal: exitSignal })
  }

  // 认证配置可能抛错（keyPath 读不到 / 引用解析不到）——先构造再连
  /*
   * 建连前准备（含跳板机）：拨号失败/超时都在 dialJump 里点名跳板机并自我清理；
   * 成功之后跳板机的生死由本函数的 finish() 一并负责（目标先关、跳板机后关）。
   */
  const prepared = await prepareSshConnect({ spec, store: options.hostKeyStore, logger })
  const connectConfig = prepared.connectConfig
  const policy = prepared.policy
  bastion = prepared.bastion

  /** 持久会话：远程 tmux 探测/降级提示（spawn 后由调用方注入终端）。 */
  let startupNotice: string | undefined
  let tmuxUsed = false

  const channel = await new Promise<ClientChannel>((resolve, reject) => {
    let settled = false
    let watchdog: NodeJS.Timeout | null = null
    const clearWatchdog = (): void => {
      if (watchdog !== null) {
        clearTimeout(watchdog)
        watchdog = null
      }
    }
    // channel 打开兜底（0.19.0）：readyTimeout 只覆盖到认证成功；对端不响应
    // channel-open（堡垒机 / sshd 限制并发 channel）时 await 永不 settle——
    // 连接活着、keepalive 正常，用户端「Connecting …」常驻且拿不到 handle
    // 去取消。每个 channel 尝试挂 15s 计时（与 tmux 探测的 10s 同思路），
    // 超时断开连接并明确报错。
    const armWatchdog = (what: string): void => {
      clearWatchdog()
      watchdog = setTimeout(() => {
        if (settled) return
        settled = true
        try {
          conn.end()
        } catch {
          /* 已断开 */
        }
        reject(new Error(`SSH channel 打开超时（${what}15s 无响应）：对端可能限制了并发 channel 数或不响应，连接已断开`))
      }, 15_000)
      watchdog.unref?.()
    }
    const settleOk = (ch: ClientChannel): void => {
      if (settled) return
      settled = true
      clearWatchdog()
      resolve(ch)
    }
    const settleErr = (error: Error): void => {
      if (settled) return
      settled = true
      clearWatchdog()
      reject(error)
    }
    const openShell = (): void => {
      armWatchdog('shell channel ')
      // agentForward 走 per-channel 请求（@types/ssh2 的 ShellOptions 未声明，
      // 运行时支持；仅在本机 agent 存在时生效，见 buildConnectConfig）
      conn.shell(
        { term: options.term, cols: options.cols, rows: options.rows, agentForward: spec.agentForward === true } as ShellOptionsWithAgentForward,
        (error, ch) => {
          if (error !== undefined && error !== null) {
            conn.end()
            settleErr(new Error(`shell channel 打开失败: ${error.message}`))
            return
          }
          settleOk(ch)
        },
      )
    }
    /** 自定义命令（0.14.0）：`conn.exec(command, {pty})`，与 tmux 分支同形。 */
    const openCommand = (): void => {
      armWatchdog('命令 channel ')
      conn.exec(options.command ?? '', { pty: { term: options.term, cols: options.cols, rows: options.rows } }, (error, ch) => {
        if (error !== undefined && error !== null) {
          conn.end()
          settleErr(new Error(`远程命令启动失败: ${error.message}`))
          return
        }
        settleOk(ch)
      })
    }
    /** 持久会话：远程 `exec tmux new-session -A`（pty channel，语义与 shell 一致）。 */
    const openTmux = (): void => {
      // 链式 set-option 幂等重放（attach 已有 server 时也生效）；首 pane 在
      // 选项生效前创建，default-terminal 用 tmux 自身默认（README 已知限制）
      const cmd = [
        `exec tmux -L ${TMUX_SOCKET} -f /dev/null new-session -A -s ${shSingleQuote(options.persist?.name ?? '')}`,
        "';' set-option -g status off",
        "';' set-option -g history-limit 20000",
        "';' set-option -ga terminal-overrides ,*:RGB",
      ].join(' ')
      armWatchdog('tmux channel ')
      conn.exec(cmd, { pty: { term: options.term, cols: options.cols, rows: options.rows } }, (error, ch) => {
        if (error !== undefined && error !== null) {
          // tmux 启动失败（存在但异常）：连接已建立，降级普通 shell 优于直接报错
          logger?.warn(`[dsh-tty] ssh ${target} tmux 启动失败，降级普通 shell: ${error.message}`)
          startupNotice = 'tmux 启动失败，已降级为普通会话'
          openShell()
          return
        }
        tmuxUsed = true
        settleOk(ch)
      })
    }
    const openWithPersist = (): void => {
      // 先毫秒级探测远程是否有 tmux（不带 pty 的 exec）。决策依据：exit（大多
      // 数 sshd 立即回）→ close（兜底，个别实现无 exit）→ 10s 超时（实测某些
      // sshd 如 CentOS 9 只回 exit 不回 close，等 close 会永久卡死 spawn）。
      // error 与 close 可能先后到达，proceeded 防止降级路径开两条 channel
      let proceeded = false
      const fallback = (notice: string): void => {
        if (proceeded) return
        proceeded = true
        startupNotice = notice
        openShell()
      }
      const decide = (code: number | null): void => {
        if (proceeded) return
        proceeded = true
        if (code === 0) openTmux()
        else fallback('远程 tmux 不可用（未安装或探测超时），本次以普通会话连接；安装 tmux 后持久会话可跨断线/宿主重启恢复')
      }
      conn.exec('command -v tmux >/dev/null 2>&1', (error, stream) => {
        if (error !== undefined && error !== null) {
          fallback('远程 tmux 探测失败，已降级为普通会话')
          return
        }
        stream.on('exit', (c: number | null) => { decide(typeof c === 'number' ? c : 1) })
        stream.on('close', () => { decide(null) })
        stream.on('error', () => fallback('远程 tmux 探测失败，已降级为普通会话'))
        const timer = setTimeout(() => decide(null), 10_000)
        timer.unref?.()
      })
    }
    conn.on('ready', () => {
      // 命令标签（0.14.0）优先：不做 tmux 持久化（命令短命，attach 没意义）
      if (options.command !== undefined && options.command !== '') openCommand()
      else if (options.persist !== undefined) openWithPersist()
      else openShell()
    })
    conn.on('error', (error) => {
      if (!settled) {
        const mismatch = policy.mismatchMessage()
        if (mismatch !== null) settleErr(new Error(mismatch))
        else settleErr(new Error(`SSH 连接失败（${targetWithJump(spec)}）: ${classifyError(error.message)}`))
      } else {
        logger?.warn(`[dsh-tty] ssh ${target} 连接错误: ${error.message}`)
        finish()
      }
    })
    conn.on('close', () => {
      // channel 建立前连接就断了：不能让 await 悬挂（0.19.0 兜底）
      settleErr(new Error(`SSH 连接已关闭（${targetWithJump(spec)}，channel 未建立）`))
      finish()
    })
    if ((connectConfig as { tryKeyboard?: boolean }).tryKeyboard === true) {
      const password = (connectConfig as { password?: string }).password ?? ''
      conn.on('keyboard-interactive', (_name, _instructions, _lang, _prompts, finishKb) => {
        finishKb([password])
      })
    }
    try {
      conn.connect(connectConfig)
    } catch (error) {
      settleErr(error instanceof Error ? error : new Error(String(error)))
    }
  })

  channel.on('data', (chunk: Buffer) => {
    output.write(chunk)
  })
  channel.stderr.on('data', (chunk: Buffer) => {
    output.write(chunk)
  })
  channel.on('exit', (code: number | null, signal?: string | null) => {
    exitCode = typeof code === 'number' ? code : null
    exitSignal = typeof signal === 'string' ? signal : null
  })
  channel.on('close', () => {
    finish()
  })

  // 持久会话的重画（0.10.1 跨窗口共享）：远程 list-clients + 逐个
  // refresh-client 一条 exec 管道完成；resolve 时机 = 远程命令跑完
  const tmuxRefresh =
    tmuxUsed && options.persist !== undefined
      ? (): Promise<void> =>
          new Promise<void>((resolve) => {
            const cmd =
              `tmux -L ${TMUX_SOCKET} list-clients -t ${shSingleQuote(options.persist?.name ?? '')} -F '#{client_name}' | ` +
              `while IFS= read -r c; do tmux -L ${TMUX_SOCKET} refresh-client -t "$c"; done`
            try {
              conn.exec(cmd, (error, stream) => {
                if (error !== undefined && error !== null) {
                  resolve()
                  return
                }
                stream.on('close', () => resolve())
                stream.on('error', () => resolve())
              })
            } catch {
              resolve()
            }
          })
      : undefined

  // 持久会话的关闭收尾：kill-session 须在连接还活着时发出（连接随 channel
  // 关闭而断开）；resolve 时机 = 远程命令跑完（stream close），调用方另有
  // 2.5s 兜底 forceKill 防悬挂
  const tmuxTeardown =
    tmuxUsed && options.persist !== undefined
      ? (): Promise<void> =>
          new Promise<void>((resolve) => {
            try {
              conn.exec(`tmux -L ${TMUX_SOCKET} kill-session -t ${shSingleQuote(options.persist?.name ?? '')}`, (error, stream) => {
                if (error !== undefined && error !== null) {
                  resolve()
                  return
                }
                stream.on('close', () => resolve())
                stream.on('error', () => resolve())
              })
            } catch {
              resolve()
            }
          })
      : undefined

  // 背压透传：TtyServer 暂停 PassThrough 时一并暂停上游 channel，
  // 避免高速输出（cat 大文件）在 Node 侧无界堆积
  const nativePause = output.pause.bind(output)
  output.pause = () => {
    try {
      channel.pause()
    } catch {
      /* channel 已关闭 */
    }
    return nativePause()
  }
  const nativeResume = output.resume.bind(output)
  output.resume = () => {
    try {
      channel.resume()
    } catch {
      /* channel 已关闭 */
    }
    return nativeResume()
  }

  logger?.info(`[dsh-tty] ssh 会话就绪: ${target}${tmuxUsed ? '（tmux 持久）' : ''}`)
  /**
   * 服务器状态条（0.17.0）：同一条连接上的**独立** exec channel（不碰 PTY
   * 那条）。stderr 必须消费掉——未读的 channel 数据会把远端发送窗口堵住，
   * 采集脚本会卡在写 stdout 上；诊断内容不受我们控制，一律不进任何日志。
   */
  const statsExec = (command: string, onLine: (line: string) => void, onError: () => void): { stop(): void } => {
    let stopped = false
    let open: ClientChannel | null = null
    const lines = new StatsLineBuffer()
    const decoder = new StringDecoder('utf8')
    try {
      conn.exec(command, (error, ch) => {
        // stop() 可能在 channel 打开前就被调用（订阅瞬断）：开了就立刻关掉
        if (stopped) {
          try {
            ch.close()
          } catch {
            /* 已关闭 */
          }
          return
        }
        if (error !== null && error !== undefined) {
          onError()
          return
        }
        open = ch
        ch.on('data', (chunk: Buffer) => {
          for (const line of lines.push(decoder.write(chunk))) onLine(line)
        })
        ch.stderr.on('data', () => {
          /* 丢弃：远端脚本自身的报错不进任何日志（防凭证/路径意外落到日志里） */
        })
        ch.on('close', () => {
          // 主动 stop() 之外的关闭 = 采集进程自己结束（远端无 /proc、被 kill）
          if (!stopped) onError()
        })
        ch.on('error', () => {
          if (!stopped) onError()
        })
      })
    } catch {
      onError()
    }
    return {
      stop: () => {
        stopped = true
        try {
          open?.close()
        } catch {
          /* 已关闭 */
        }
      },
    }
  }

  return {
    kind: 'ssh',
    pid: null,
    output,
    done,
    write: (data: string) => {
      channel.write(data)
      return Promise.resolve(true)
    },
    resize: (cols: number, rows: number) => {
      try {
        channel.setWindow(rows, cols, 0, 0)
      } catch {
        /* channel 已关闭 */
      }
    },
    terminate: () => {
      try {
        channel.close()
      } catch {
        /* 已关闭 */
      }
      finish()
      return Promise.resolve(true)
    },
    statsExec,
    ...(tmuxTeardown !== undefined ? { tmuxTeardown } : {}),
    ...(tmuxRefresh !== undefined ? { tmuxRefresh } : {}),
    ...(startupNotice !== undefined ? { startupNotice } : {}),
  }
}
