/**
 * @hyzyn/dsh-docker — 远程 / 本地一次性命令执行层。
 *
 * 与 dsh-tty 的关系：**数据级复用，代码级不耦合**。连接簿条目与主机指纹
 * 分别来自 / 存放在各自插件（tty 经 ctx.settings.get('tty') 只读取得连接簿；
 * 本插件自持一份 hostKeys 记录），因此 dsh-docker 可以单独安装，tty 无需
 * 任何改动，也不会因为 tty 升级而连带失效。指纹策略与 tty/src/ssh.ts 一致
 * （TOFU：首次记录、之后必须匹配，不匹配拒绝连接）。
 *
 * 与 tty 的差别：这里只开**非 PTY 的 exec channel**（RFC 4254 §6.5），
 * 每条命令一条 channel，收完 stdout/stderr 就关闭，不做交互式 shell。
 * 一次性命令走 run()/runLocal()（超时 + 输出上限）；`docker logs --follow`
 * 这类长流走 stream()/runLocalStream()（无总超时、无上限，靠 AbortSignal 停止）。
 */
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Duplex } from 'node:stream'
import { StringDecoder } from 'node:string_decoder'
import { Client } from 'ssh2'
import type { ClientChannel, ConnectConfig } from 'ssh2'

/* ------------------------------------------------------------------ *
 * 类型
 * ------------------------------------------------------------------ */

/**
 * TOFU 主机指纹记录（与 tty 0.19.0 同形状：同一 host:port 一组指纹）。
 *
 * 为什么要是一个集合：同一台主机往往同时有 rsa + ed25519 两把主机密钥，
 * ssh2 握手时用哪把取决于算法协商——单指纹记录会在算法切换时把健康连接
 * 误判成「指纹变更」（tty 修 D12 时引入多指纹，这里对齐）。
 */
export interface HostKeyRecord {
  host: string
  port: number
  /** hostVerifier 收到的原样 sha256 十六进制指纹集合。 */
  fingerprints: string[]
}

/** 主机指纹钉扎存储（宿主半体实现为配置状态 + settings 持久化）。 */
export interface HostKeyStore {
  /** 已记录的指纹集合（同一 host:port 的全部主机密钥）；未记录返回 undefined / 空数组。 */
  get(host: string, port: number): string[] | undefined
  /** 首次连接握手时记录一条指纹；该主机已有其他算法的指纹时并入集合。 */
  record(host: string, port: number, fingerprint: string): void
}

/** 内联 SSH 连接规格（连接簿条目共用同一形状）。 */
export interface SshSpec {
  host: string
  port?: number
  username: string
  auth?: 'agent' | 'key' | 'password'
  keyPath?: string
  passphrase?: string
  password?: string
  agentForward?: boolean
  /** 经跳板机连接（ProxyJump 语义，**单跳**）；缺省 = 直连。与 tty 的 `SshSpec.jump` 同形。 */
  jump?: SshJumpSpec
  /**
   * 代理命令（ProxyCommand 语义，与 tty 的 `SshSpec.proxyCommand` 同形）：本机执行的命令，
   * stdin/stdout 当 SSH 传输。本包同样**只从 tty 连接簿读**（docker 侧不做界面）。
   *
   * **闸门只有一处**：tty settings 的 `allowProxyCommand`（本包通过 `readTtyBooks` 的 settings
   * 句柄同读）。关着时携带它的目标**明确失败**，不退回直连——理由见 tty `src/ssh.ts`。
   */
  proxyCommand?: string
}

/**
 * 跳板机规格（与 tty `src/ssh.ts` 的 `SshJumpSpec` **逐字同形**，两包各持一份类型）。
 *
 * 本包只从 tty 的连接簿读它（`readTtyBooks`）——docker 侧**不做跳板机界面**：目标是
 * 「一处配置、两处生效」。`username` / `auth` / `keyPath` / `passphrase` / `password`
 * 缺省时**继承目标那一跳**（见 `jumpSpecOf`）。
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

/**
 * 清洗一份跳板机输入（`readTtyBooks` 用）。返回 `undefined` = 没配跳板机——不给下游留
 * `host: ''` 的半个对象（那会让拨号去连空主机名）。
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

/** 跳板机展示串（`user@host:port`）；没配时返回空串。**凭据不进这里**。 */
export function jumpTargetLabel(spec: SshSpec): string {
  const jump = spec.jump
  if (jump === undefined || jump.host.trim() === '') return ''
  const port = jump.port ?? 22
  return `${jump.username ?? spec.username}@${jump.host.trim()}${port === 22 ? '' : ':' + String(port)}`
}

/** 目标那一跳的展示串 + 跳板机 / 代理命令后缀（错误文案用；理由见 tty `src/ssh.ts` 的同名注释）。 */
export function targetWithJump(spec: SshSpec): string {
  const label = jumpTargetLabel(spec)
  if (label !== '') return `${sshTarget(spec)}（经跳板机 ${label}）`
  if (sanitizeProxyCommand(spec.proxyCommand) !== undefined) return `${sshTarget(spec)}（经代理命令）`
  return sshTarget(spec)
}

/** 跳板机那一跳的连接规格：显式给的优先，其余继承目标。 */
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

/** 一条命令的执行结果。 */
export interface ExecResult {
  /** 退出码；进程被信号杀死或 channel 异常时为 null。 */
  code: number | null
  stdout: string
  stderr: string
  /** 超时被强制中断。 */
  timedOut: boolean
  /** 输出超过上限被截断（keepTail=true 时保留尾部，否则保留头部）。 */
  truncated: boolean
  /** 实际耗时（毫秒）。 */
  durationMs: number
}

export interface ExecOptions {
  /** 超时（毫秒），超时后中断 channel / 杀死进程。 */
  timeoutMs?: number
  /** stdout + stderr 各自的字节上限（超出截断并标记 truncated）。 */
  maxBytes?: number
  /** 追加到 stdin 的内容（如 `docker exec -i` 需要喂 stdin 时）。 */
  input?: string
  /**
   * 截断时保留**尾部**（默认保留头部）。logs 的最新行、pull 的 digest、
   * prune 的总计都在输出末尾——这类命令超出上限时该丢的是头部（D14）。
   */
  keepTail?: boolean
  /**
   * 截断后**对齐到行边界**：`keepTail` 是按**字节**保留尾部，切口落在行中间时窗口开头
   * 剩下一个半行（没有时间戳、内容从中途开始）。打开这一项就把那个半行丢掉，于是
   * 「返回的每一行都是完整的行」；切口正好落在换行上时这一刀只丢掉那个换行、整行保住。
   *
   * 只对 `keepTail` 有意义（保留头部时开头永远是行首）。刻意做成**开关**而不是
   * `keepTail` 本身的行为：`keepTail` 的契约就是「按字节保留尾部」（D14/D123，用例
   * 逐字断言 `xxxxTAIL`），改它会连带改掉 prune 的总计、pull 的 digest 与面板日志尾部
   * ——那些调用方要的正是原始的尾部字节。
   */
  lineAlign?: boolean
  /**
   * 外部取消信号（D161）：聚合总览的单目标预算到点后，必须能**真的停掉**这条命令。
   *
   * 不传 = 老行为（只有 timeoutMs 一个截止）。abort 与 timeout 走**同一套收尾**：
   * 本地子进程 SIGKILL + 收敛期，SSH channel `signal('KILL')` + `close()` + 直接 settle。
   * 只 reject 外层 `Promise.race` 而不 abort 底层，命令会继续占着远端 session 槽
   *（sshd 在子进程活着时不释放槽位，见 D150）——后续短命令就会被远端拒绝。
   */
  signal?: AbortSignal
}

export interface ExecLogger {
  info(msg: string): void
  warn(msg: string): void
}

/** 长流（docker logs --follow）的分片回调；chunk 已按 utf8 解码，跨包的
 *  多字节序列由 StringDecoder 兜住，调用方拿到的一定是完整文本。 */
export interface StreamHandlers {
  onStdout(chunk: string): void
  onStderr(chunk: string): void
}

/** 长流结束结果：自然退出给退出码，被中止（signal）时为 null。 */
export interface StreamResult {
  code: number | null
}

/* ------------------------------------------------------------------ *
 * 通用工具
 * ------------------------------------------------------------------ */

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
 * 顺序：官方凭据 provider 优先（它自己会叠 `file` / `env` / `project-env` / `user-env` 各层，
 * 而且"每次操作重新解析"——改完下一个操作即生效，不必重启宿主）；服务不在、或它没有这个引用
 * 时，再退回 `process.env`。
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
  if (provider !== null && provider !== undefined && typeof provider.resolve === 'function') {
    try {
      const resolved = await provider.resolve(name)
      if (resolved !== null && resolved !== undefined && typeof resolved.value === 'string' && resolved.value !== '') {
        return resolved.value
      }
    } catch (error) {
      providerError = error instanceof Error ? error.message : String(error)
    }
  }
  const fromEnv = process.env[name]
  if (fromEnv !== undefined && fromEnv !== '') return fromEnv
  const detail = providerError === null ? '' : `（凭据服务报错：${providerError}）`
  const missing = provider === null ? '凭据服务不可用，' : ''
  throw new Error(`凭据未设置：${name}${detail} —— ${missing}环境变量里也没有`)
}

/** 生产路径：用当前注入的 provider。 */
export async function resolveSecret(value: string | undefined): Promise<string | undefined> {
  return resolveSecretVia(credentialsProvider, value)
}

export function expandHome(path: string): string {
  if (path === '~') return homedir()
  if (path.startsWith('~/')) return join(homedir(), path.slice(2))
  // `~user/...` 一律明确报错（D30）：原样返回会变成 readFileSync 的 ENOENT，路径还带着
  // ~，用户容易误判成「文件真的不存在」。Windows 变量（%USERPROFILE%）不在展开范围。
  if (path.startsWith('~')) {
    throw new Error(`keyPath 仅支持 ~ 与 ~/ 展开（不支持 ${path.split(/[\\/]/)[0]}）；请写绝对路径或 ~/ 相对路径`)
  }
  return path
}

/** 展示用目标串：user@host（非默认端口时带 :port）。 */
export function sshTarget(spec: SshSpec): string {
  const port = spec.port ?? 22
  return `${spec.username}@${spec.host}${port === 22 ? '' : ':' + String(port)}`
}

/**
 * 把 argv 拼成远程 shell 可执行的单行命令（POSIX 单引号转义）。
 * exec channel 的 command 由远端 shell 解析，因此**必须**转义——本插件所有
 * 命令都以 argv 数组构造，禁止把用户输入拼进字符串。
 */
export function shJoin(argv: readonly string[]): string {
  return argv.map((arg) => "'" + arg.replaceAll("'", "'\\''") + "'").join(' ')
}

/**
 * 连接池键：同一主机同一账号复用一条 SSH 连接。
 *
 * host 要 trim + 小写（D111）：否则 `NAS.example` 与 `nas.example` 各建一条连接，而
 * `MAX_STREAMS_PER_TARGET` 与 `shouldRecycleConn` 都是**按连接**计的 → 同一台主机的
 * 长流额度被悄悄翻倍（恰好掩盖 D07 想暴露的 MaxSessions 问题）。口径与 TOFU 的
 * hostVerifier（D03）保持一致：那里也用 `trim().toLowerCase()` 分组指纹。
 */
/**
 * 池键。**跳板机 / 代理命令身份必须并进来**：不同 bastion（或不同代理命令）到同一目标
 * 绝不是同一条连接——只按 `user@host:port` 记的话，第二个 bastion 会静默复用第一条连接、
 * 走错跳板机。这与 tty 的 SFTP 池不同（那边键是 `JSON.stringify(spec)`，天然带上 jump）。
 *
 * 代理命令**只并入它的哈希**，不并入原文：原文可能含凭据（`-i /path/key`、甚至嵌 token），
 * 而池键会进日志/错误文案附近的诊断路径——摘要足够区分且不泄露。
 */
export function poolKey(spec: SshSpec): string {
  const basis = `${spec.username}@${spec.host.trim().toLowerCase()}:${String(spec.port ?? 22)}`
  const label = jumpTargetLabel(spec)
  if (label !== '') return `${basis}|jump:${label.toLowerCase()}`
  const proxyCommand = sanitizeProxyCommand(spec.proxyCommand)
  if (proxyCommand !== undefined) {
    return `${basis}|cmd:${createHash('sha256').update(proxyCommand).digest('hex').slice(0, 12)}`
  }
  return basis
}

/** 跳板机通道打开兜底（与 tty 同参数：对端不回 forwardOut 回调时不能让 await 挂着）。 */
const JUMP_CHANNEL_TIMEOUT_MS = 15_000

/**
 * 拨跳板机并借一条 forwardOut 通道（ProxyJump 单跳）。与 tty `src/ssh.ts` 的 dialJump 同序。
 * **导出仅供单测**（`test/ssh-jump.test.ts` 用假 ssh2 验「先拨跳板机、再把通道当 sock」）。
 */
export async function dialJump(options: {
  spec: SshSpec
  store?: HostKeyStore | undefined
  logger?: ExecLogger | undefined
}): Promise<{ bastion: Client; sock: ClientChannel }> {
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
    throw new Error(`跳板机连接失败（${label}）：${error instanceof Error ? error.message : String(error)}`)
  }
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
      fail(new Error(policy.mismatchMessage() ?? `跳板机连接失败（${label}）：${error.message}`))
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
  options.logger?.info(`[dsh-docker] ssh ${destination} 经跳板机 ${label} 已建立转发通道（ProxyJump）`)
  return { bastion, sock }
}

/* ------------------------------------------------------------------ *
 * ProxyCommand：与 tty 同一档信任级（默认关闭 + 显式开关 + 导入永不自动带入）
 * ------------------------------------------------------------------ */

/** 代理命令长度上限（与 tty 同值：它是一条命令行）。 */
export const PROXY_COMMAND_MAX = 2000
const PROXY_STDERR_KEEP = 2048
const PROXY_STDERR_SHOWN = 300
const PROXY_KILL_GRACE_MS = 2000
/** `%h` / `%r` 等展开值允许的字符集（与 tty 同口径：白名单而非转义，理由见 tty 同名常量）。 */
const PROXY_VALUE_SAFE = /^[A-Za-z0-9._@:\[\]-]+$/

/**
 * 闸门关着时报什么错。**与 tty 是同一个开关**（tty settings 的 `allowProxyCommand`）——
 * 连接簿只有一处，开关也只能有一处，否则「连接簿配了、docker 不认」会很难解释。
 */
export const PROXY_COMMAND_DISABLED =
  '代理命令（ProxyCommand）未启用：本机命令执行默认关闭，请到 插件配置 → 终端面板 打开「允许 ProxyCommand」后重试。'
  + '未启用时携带代理命令的目标不会退回直连——直连多半也连不上，还会把配置问题伪装成网络问题。'

/**
 * 清洗一份代理命令输入（`readTtyBooks` 用）。返回 `undefined` = 没配。
 * 只做形状校验（非空 / 单行 / 长度）；命令内容不解释——「能不能执行」由闸门决定。
 */
export function sanitizeProxyCommand(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined
  const trimmed = input.trim()
  if (trimmed === '' || trimmed.length > PROXY_COMMAND_MAX) return undefined
  if (/[\r\n\0]/.test(trimmed)) return undefined
  return trimmed
}

/**
 * 展开 `%h` / `%p` / `%r` / `%n` / `%%`（与 OpenSSH 同义，与 tty 逐字同口径：
 * 代入值必须过白名单，否则拒绝执行——理由见 tty `expandProxyCommand`）。
 */
export function expandProxyCommand(command: string, spec: SshSpec): string {
  const values: Record<string, string> = {
    h: spec.host,
    n: spec.host,
    p: String(spec.port ?? 22),
    r: spec.username,
  }
  return command.replace(/%(.)/g, (whole: string, key: string) => {
    if (key === '%') return '%'
    const value = values[key]
    if (value === undefined) return whole
    if (!PROXY_VALUE_SAFE.test(value)) {
      throw new Error(`代理命令里的 %${key} 无法代入：目标主机名 / 用户名含 shell 特殊字符（只允许字母数字与 . _ @ : [ ] -）`)
    }
    return value
  })
}

/** 代理命令传输（与 tty `ProxyCommandDial` 同形）。 */
export interface ProxyCommandDial {
  child: ChildProcess
  sock: Duplex
  failure(): Error | null
  /**
   * 已经攒到的 stderr 摘要（`；代理命令 stderr: …` 或空串）——**错误路径的兜底**。
   *
   * 与 tty 同因（真机验收暴露的竞态）：ssh2 一看到流断了就报错，而「子进程退出 / 传输关闭」
   * 比它晚 1~2ms，那一刻 `failure()` 还是 null，最有用的那句就被丢掉。
   */
  stderrHint(): string
  dispose(): void
}

/** 杀代理命令（含它拉起的子孙进程）：与 tty `killProxyChild` 同策略（POSIX 杀进程组）。 */
function killProxyChild(child: ChildProcess): void {
  const pid = child.pid
  const kill = (signal: NodeJS.Signals): void => {
    try {
      if (pid !== undefined && process.platform !== 'win32') process.kill(-pid, signal)
      else child.kill(signal)
    } catch {
      try {
        child.kill(signal)
      } catch {
        /* 已退出 */
      }
    }
  }
  kill('SIGTERM')
  const timer = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) kill('SIGKILL')
  }, PROXY_KILL_GRACE_MS)
  timer.unref?.()
}

/**
 * 启动代理命令（ProxyCommand）并把它的 stdio 当作目标连接的传输。
 *
 * 与 tty `src/ssh.ts` 的 dialProxyCommand **逐句同序**（两包不互相 import，只能各写一份；
 * 语义口径由这份注释与单测钉住）：闸门 → 展开 → spawn → 提前退出拖垮传输 → stderr 常驻排空。
 * **导出仅供单测**。
 */
export async function dialProxyCommand(options: {
  spec: SshSpec
  /** 闸门求值（缺省 = 关）：本包从 tty settings 读，按**每次拨号**求值——开关一关立刻生效。 */
  allowed?: () => boolean
  logger?: ExecLogger | undefined
}): Promise<ProxyCommandDial> {
  const raw = sanitizeProxyCommand(options.spec.proxyCommand)
  if (raw === undefined) throw new Error('代理命令为空（proxyCommand 需要一条非空的单行命令）')
  if ((options.allowed?.() ?? false) !== true) throw new Error(PROXY_COMMAND_DISABLED)
  const destination = sshTarget(options.spec)
  const command = expandProxyCommand(raw, options.spec)
  const child = spawn(command, {
    shell: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    detached: process.platform !== 'win32',
  })
  const stdout = child.stdout
  const stdin = child.stdin
  const stderr = child.stderr
  if (stdout === null || stdin === null || stderr === null) {
    killProxyChild(child)
    throw new Error('代理命令启动失败：stdio 管道未建立')
  }
  const sock = Duplex.from({ readable: stdout, writable: stdin })
  let failure: Error | null = null
  let disposed = false
  /**
   * 传输是否已经关掉（子进程输出结束）。与 tty 同因：子进程**先结束输出、后触发 `exit`**，
   * 而 ssh2 一看到流断了就立刻报「Connection lost before handshake」——那一刻 `exit` 还没到。
   * 只认 `exit` 的话，最需要解释的失败（命令一开始就挂）反而没有任何解释。
   */
  let transportClosed = false
  const chunks: Buffer[] = []
  let kept = 0
  /** 已攒到的 stderr 摘要（单行、截断；没有则空串）。 */
  const stderrExcerpt = (): string => {
    if (chunks.length === 0) return ''
    const text = Buffer.concat(chunks).toString('utf8').replace(/[\r\n\0]+/g, ' ').replace(/\s+/g, ' ').trim()
    return text.slice(0, PROXY_STDERR_SHOWN)
  }
  const stderrTail = (): string => {
    const text = stderrExcerpt()
    return text === '' ? '' : `；stderr: ${text}`
  }
  stderr.on('data', (chunk: Buffer) => {
    if (kept >= PROXY_STDERR_KEEP) return
    kept += chunk.length
    chunks.push(chunk)
  })
  const recordFailure = (error: Error): void => {
    // **覆盖**而不是只记第一个：传输关闭先触发的往往语焉不详，随后 exit 带来的（退出码 +
    // stderr）严格更有信息量
    failure = error
    try {
      sock.destroy()
    } catch {
      /* 已销毁 */
    }
  }
  child.on('error', (error: Error) => {
    recordFailure(new Error(`代理命令出错：${error.message}`))
  })
  child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
    if (disposed) return
    const how = signal !== null ? `被信号 ${signal} 终止` : `退出码 ${String(code)}`
    recordFailure(new Error(`代理命令已退出（${how}）${stderrTail()}`))
  })
  await new Promise<void>((resolve, reject) => {
    let settled = false
    child.once('spawn', () => {
      if (settled) return
      settled = true
      resolve()
    })
    child.once('error', (error: Error) => {
      if (settled) return
      settled = true
      reject(new Error(`代理命令启动失败：${error.message}`))
    })
  })
  options.logger?.info(`[dsh-docker] ssh ${destination} 已启动代理命令（ProxyCommand）作为传输`)
  const dispose = (): void => {
    if (disposed) return
    disposed = true
    try {
      sock.destroy()
    } catch {
      /* 已销毁 */
    }
    killProxyChild(child)
  }
  /*
   * **readable 侧 end** 是关键时点：ssh2 就是看到它才判定「握手前连接中断」并发错，
   * 而子进程的 `exit` 还在后面（实测差 1~2ms）。所以在这里就认定「传输已关」，
   * 错误路径才能带上已经攒到的 stderr。
   */
  sock.once('end', () => {
    transportClosed = true
  })
  sock.once('close', () => {
    transportClosed = true
    // 不置 disposed：那是「我们主动收尾」的标记；子进程该杀，但它随后带来的 exit 事实要记下来
    if (!disposed) killProxyChild(child)
  })
  /*
   * 必须挂这个监听器：`Duplex.from({readable, writable})` 销毁时会把 **AbortError** 抛给底层流，
   * 没人接就是进程级「未捕获异常」（与 tty 同因，实测 dispose() 即可触发）。
   */
  sock.on('error', (error: Error) => {
    if (disposed) return
    /*
     * **AbortError 直接忽略**：它不是一个诊断，而是我们自己 destroy 这条传输时 Duplex 抛给
     * 底层流的副产品（"The operation was aborted"）。把它记成失败原因，用户看到的就会是这句
     * 毫无信息量的话，而不是「命令退出了、stderr 说了什么」。
     */
    if (error.name === 'AbortError' || (error as { code?: string }).code === 'ABORT_ERR') return
    recordFailure(new Error(`代理命令传输出错：${error.message}`))
  })
  return {
    child,
    sock,
    failure: () => {
      if (failure !== null) return failure
      if (disposed || !transportClosed) return null
      const tail = stderrTail()
      return new Error(`代理命令传输已关闭${tail === '' ? '（命令已结束）' : tail}`)
    },
    stderrHint: () => {
      // 主动收尾之后不再提示（那是正常结束，不是线索）；没有 stderr 也不提示
      if (disposed) return ''
      const text = stderrExcerpt()
      return text === '' ? '' : `；代理命令 stderr: ${text}`
    },
    dispose,
  }
}

/** 代理命令失败的事实 → 错误文案后缀（空串 = 没失败），与 tty 同口径。 */
export function proxyFailureSuffix(proxy: ProxyCommandDial | null): string {
  if (proxy === null) return ''
  const failure = proxy.failure()
  if (failure !== null) return `；${failure.message}`
  // 与 tty 同因的兜底：错误已经在报，手里有 stderr 就交出去（真机实测 1~2ms 的竞态）
  return proxy.stderrHint()
}

/**
 * 有界输出收集器（短命令路径的 stdout / stderr 各持一个）。
 *
 * 为什么按字节收集、最后统一解码：逐 chunk `toString('utf8')` 会在 TCP 分片
 * 正好落在多字节字符中间时产出 U+FFFD（D08）；长流路径早已用 StringDecoder，
 * 这里把同样的解码方式带给一次性命令。
 *
 * 截断方向（D14）：`keepTail=false` 保留**头部**（JSONL 列表的前缀行可解析）；
 * `keepTail=true` 保留**尾部**——logs 的最新行、pull 的 digest、prune 的总计
 * 都在输出末尾，该丢的是头部。
 */
class ByteSink {
  private chunks: Buffer[] = []
  private bytes = 0
  truncated = false

  constructor(private readonly maxBytes: number, private readonly keepTail: boolean, private readonly lineAlign = false) {}

  push(chunk: Buffer): void {
    this.chunks.push(chunk)
    this.bytes += chunk.length
    if (this.bytes <= this.maxBytes) return
    this.truncated = true
    if (this.keepTail) {
      let excess = this.bytes - this.maxBytes
      while (excess > 0 && this.chunks.length > 0) {
        const head = this.chunks[0] as Buffer
        if (head.length <= excess) {
          excess -= head.length
          this.chunks.shift()
        } else {
          this.chunks[0] = head.subarray(excess)
          excess = 0
        }
      }
    } else {
      let room = this.maxBytes
      const kept: Buffer[] = []
      for (const item of this.chunks) {
        if (room <= 0) break
        kept.push(room >= item.length ? item : item.subarray(0, room))
        room -= item.length
      }
      this.chunks = kept
    }
    this.bytes = this.maxBytes
  }

  /** 统一解码（调用方持有 decoder：跨 chunk 的多字节序列不会碎成 U+FFFD）。 */
  decode(decoder: StringDecoder): string {
    let text = ''
    for (const chunk of this.chunks) text += decoder.write(chunk)
    text += decoder.end()
    /*
     * 行边界对齐（只对 keepTail 截断有意义，见 ExecOptions.lineAlign）：保留尾部是按
     * **字节**切的，切口落在行中间时窗口开头是一个半行。丢掉它，返回的每一行才是完整的；
     * 切口正好落在 `\n` 上时这一刀只丢掉那个换行，整行保住（不丢内容）。
     * 窗口里连一个 `\n` 都没有 ⇒ 整个窗口都是同一行的碎片，只能全丢——留下它就不是
     * 「每一行都完整」了。
     */
    if (this.lineAlign && this.keepTail && this.truncated) {
      const nl = text.indexOf('\n')
      return nl === -1 ? '' : text.slice(nl + 1)
    }
    return text
  }
}

/* ------------------------------------------------------------------ *
 * 远程执行（池化 SSH exec channel）
 * ------------------------------------------------------------------ */

interface RuntimeConn {
  client: Client
  /** 最近一次使用时间（空闲回收依据；长流结束时刷新）。 */
  lastUsed: number
  /** 连接建立中的 promise（并发首个请求去重）。 */
  ready: Promise<Client>
  /** 正在推送的长流数量；>0 时 sweeper 不得回收（长流期间 lastUsed 不刷新）。 */
  busy: number
  /** 在途的一次性 channel 数（run() 进入 / 结束配对增减）；>0 时 sweeper 同样不得回收。 */
  inflight: number
  /**
   * 被 disposeAll()（插件卸载）摘掉的占位条目（D94）。
   *
   * 为什么需要：建连是异步的，而 `disposeAll()` 可以在「条目已进池、`ready` 尚未
   * resolve」这段窗口里把它摘掉并 `end()`。此后 `ready` 若照常 resolve，调用方就拿到
   * 一条不在池里的活连接——回收不到、disposeAll 再关不掉、keepalive 一直养着，
   * `run()` 的 inflight 保护也随之失效（D02 的同形症状）。
   */
  disposed: boolean
  /**
   * 跳板机连接（ProxyJump）：它拥有目标借用的 channel，**必须与目标成对关闭**——
   * ssh2 的 `end()`/`destroy()` 只关借来的通道，不关跳板机传输。
   */
  jump: Client | null
  /**
   * 代理命令（ProxyCommand）：同样拥有目标借用的传输（stdio），**必须与目标成对收尾**——
   * ssh2 更不会去杀子进程，漏了就变常驻孤儿。
   */
  proxy: ProxyCommandDial | null
}

const IDLE_MS = 120_000
const SWEEP_MS = 30_000
const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_BYTES = 512 * 1024

/**
 * 超时后「杀了直接子进程再等管道收敛」的宽限（D159）。
 *
 * SIGKILL 只作用于直接子进程；`dockerBin` 是包装脚本时孙进程仍握着 stdout/stderr，
 * 'close' 便不来。给 500ms 让正常情况下的 close 先到（保持原有的 `code` 语义），
 * 仍不到就自行收尾——超时路径上，「按时返回」优先于「拿到退出码」（本来就是 null）。
 */
const KILL_GRACE_MS = 500

/**
 * SSH 建连超时（默认 20s）。
 *
 * `DSH_DOCKER_CONNECT_TIMEOUT_MS` 可覆盖，**只为测试与排障**：20s 这条路径没法在单测里等，
 * 而「不可达目标（防火墙 DROP）」在真实网络里比 ECONNREFUSED 常见得多，D122 之前它在
 * 脚本与单测里都没有回归。`acquire` 的兜底定时器与 `buildConnectConfig` 的 `readyTimeout`
 * 共用它，避免两处漂移。
 */
function connectTimeoutMs(): number {
  const raw = Number(process.env.DSH_DOCKER_CONNECT_TIMEOUT_MS)
  return Number.isFinite(raw) && raw > 0 ? raw : 20_000
}

/**
 * 每个 SSH 连接上**短命令**（{@link RemoteExec.run}）的并发通道上限（D150）。
 *
 * 为什么需要：`MaxSessions` 的 10 个槽是**按连接**算的，而一个目标只维持一条连接；
 * {@link MAX_STREAMS_PER_TARGET} 留出的那两条余量只够**串行**的短命令用。真实面板一次
 * 点击就会并发发出不止两条（详情页的「概览 inspect」+「日志快照」+ 统计快照），agent 侧
 * 也会并发调 `docker_logs` / `docker_inspect`。超出余量的那条通道被远端**直接拒绝**
 * （sshd 侧 `error: no more sessions` → ssh2 `Channel open failure: open failed`），
 * 症状是「日志读不出来」，不是「慢一点」。
 *
 * 所以短命令在这里**排队**而不是硬闯：最多 2 条并发，其余等前一条收尾。与
 * {@link connectTimeoutMs} 同样的口径，可用环境变量覆盖——**只为测试与排障**。
 */
function shortChannelLimit(): number {
  const raw = Number(process.env.DSH_DOCKER_SHORT_CHANNELS)
  return Number.isInteger(raw) && raw > 0 ? raw : 2
}

/**
 * 每个 SSH 目标上同时可持有的**长流**上限。
 *
 * 为什么需要它：一个目标只维持**一条** TCP 连接，所有 exec / stream 共用这条连接上的
 * 通道，而 OpenSSH 的 `MaxSessions` 默认只有 10。长流（`docker logs -f` / `stats` /
 * `events`）会一直占到用户关掉面板为止，聚合日志还能一次占 8 条——加上统计流与事件流
 * 正好 10 条，于是紧接着一次 `docker ps`（刷新列表，短命令）就被远端拒绝。实测报的是
 * `(SSH) Channel open failure: open failed`，而这条原始文案对用户没有任何指向性。
 *
 * 8 = 10 − 2：给「刷新列表 / inspect / exec」这类短命令留两条余量。上限只施加在 SSH
 * 通道上——本地目标走子进程，没有这个约束（见 runLocalStream）。
 */
const MAX_STREAMS_PER_TARGET = 8

/**
 * 长流配额判定（纯函数，便于回归）：`busy` 是连接上正在推送的长流数。
 * @param target - 目标标签，只用于文案。
 * @param busy - 当前长流数。
 * @param max - 上限，默认 {@link MAX_STREAMS_PER_TARGET}。
 * @returns null 表示可以开；否则返回拒绝原因（调用方直接拿它当错误文案）。
 */
export function streamBudgetError(target: string, busy: number, max: number = MAX_STREAMS_PER_TARGET): string | null {
  if (busy < max) return null
  return `${target} 实时流已达上限（${String(busy)}/${String(max)}）：`
    + `关掉一些日志跟随、或减少聚合容器数后重试`
}

/**
 * 把 ssh2 的通道级错误翻成可操作的提示。
 *
 * `(SSH) Channel open failure: open failed` 实测出现过（成因见 {@link MAX_STREAMS_PER_TARGET}
 * 的注释），偏偏出现在「刷新列表」这种日常操作上，而原始文案对用户没有任何指向性。
 * @param message - ssh2 给出的原始错误文案。
 * @returns 补了指向性说明的文案；不认识的原样返回。
 */
/**
 * SSH 超时文案里的**跳板机提示**（项目级 ROADMAP 第 2 项）。
 *
 * 为什么值得单独一句话：本插件经数据级复用读得到 tty 的连接簿，但**不读 `~/.ssh/config`**，
 * 所以「配了跳板机的目标连不上」在 docker 侧只能表现为一句通用超时。企业内网主机几乎都
 * 要过 bastion，用户需要的是「可能是什么原因、以及这个版本到底支不支持」——而不是 20 秒后
 * 一句放之四海皆准的「主机无响应」。
 */
export const SSH_TIMEOUT_HINT =
  '若该主机只能经跳板机访问，请在目标引用的那条 tty 连接簿条目里配置跳板机'
  + '（连接簿的 `~/.ssh/config` 导入会自动带上 ProxyJump）；'
  + '代理命令（ProxyCommand）同一处手动填写后，还需在 插件配置 → 终端面板 打开「允许 ProxyCommand」'

export function describeExecError(message: string): string {
  if (/Timed out|ETIMEDOUT/i.test(message)) return `${message}：${SSH_TIMEOUT_HINT}`
  if (!isChannelExhaustedError(message)) return message
  return `${message}（远端 sshd 通道已满：关掉一些日志跟随、或减少聚合容器数后重试；`
    + `插件已自动重建连接重试过一次）`
}

/**
 * 这条错误是不是**通道额度被远端占满**（D150）。
 *
 * sshd 侧的原话是 `error: no more sessions`（`session_new()` 在
 * `sessions_nalloc >= options.max_sessions` 时返回 NULL），ssh2 把它翻译成
 * `(SSH) Channel open failure: open failed` —— 两个形态都要认。
 *
 * 与 {@link isTransportError} 分开判定的理由：它**曾经**被当成「连接健康、别重连」的一类
 * （D07），但线上实证（2026-09-29，248）表明被占满的连接会**一直是满的**：
 * ① 客户端中止长流时发的 `signal('KILL')` 在部分 sshd 上被直接拒绝
 *   （`error: session_signal_req: session signalling requires privilege separation`）；
 * ② sshd 在子进程仍活着时**延迟释放** session 槽（session.c：`delay detach of session`）。
 * 两条叠加后，插件侧 `busy` 归零而远端槽位仍未归还，于是「重试」永远打在一条满连接上。
 * 重建连接是唯一能让额度立刻归零的动作，所以这一类改判为「丢连接 + 重建一次」。
 */
export function isChannelExhaustedError(message: string): boolean {
  return /Channel open failure|no more sessions|open failed/i.test(message)
}

/**
 * 这条 ssh2 错误是不是**传输层 / 连接层**的（而不是命令自己失败）。
 *
 * 为什么要分类：池里的连接可能已经死了（远端 sshd 重启、网络抖动、sshd 踢掉空闲连接），
 * 而 `acquire()` 复用 memoized 的 `ready`、不会每次探活。这种时候唯一正确的动作是丢掉
 * 这条连接、重连一次再试；反过来，「命令返回非零」「镜像不存在」这类业务失败**绝不能**
 * 触发重连——那会把一次普通错误变成两条命令。
 *
 * 「Channel open failure / open failed」**不在**这份名单里（D07 的取舍仍然成立：它是远端拒绝
 * 开新通道，连接本身未必是死的，而且把它当传输错误会让 `describeExecError` 补的可操作文案
 * 被一次成功的重连藏掉）。但 D150（2026-09-29 线上实证）补了一条**独立分支**：识别为
 * {@link isChannelExhaustedError} 时也丢连接重建，**并且**在日志里留一行 warn——
 * 因为被占满的连接不会自己恢复（见 {@link isChannelExhaustedError} 的注释），
 * 不重建就永远是那句「重试也没用」。
 */
export function isTransportError(message: string): boolean {
  // 前两条是我们自己的包装文案：回调迟迟不来 = 这条连接已经不响应了
  if (/打开 channel 超时|SSH 连接超时/.test(message)) return true
  return /Not connected|connection lost|ECONNRESET|EPIPE|ETIMEDOUT|keepalive|No response from server/i.test(message)
}

/**
 * 空闲回收判定：busy>0 的连接上挂着长流（docker logs --follow 可以几小时不结束），
 * inflight>0 的连接上有一次性命令在跑（docker pull 默认 600s，期间没有任何请求
 * 刷新 lastUsed）——两类都必须让空闲回收让路，否则在途命令会被 sweeper 掐断在半路
 * （D01）。抽成纯函数便于回归（sweeper 本体依赖定时器，难以直接驱动）。
 */
export function shouldRecycleConn(conn: { lastUsed: number; busy: number; inflight?: number }, now: number, idleMs: number = IDLE_MS): boolean {
  if (conn.busy > 0 || (conn.inflight ?? 0) > 0) return false
  return now - conn.lastUsed >= idleMs
}

/**
 * 每条连接上的短命令闸门（FIFO，D150）。`acquire()` 返回释放函数；超出上限的调用排队。
 *
 * 名额是**转交**而不是「先减后加」：释放时若队列里有人，直接把名额交给它、`active` 不减，
 * 否则同一 tick 里新来的 `acquire()` 会看到一个空位、与刚被唤醒的等待者**同时**拿到名额
 * （并发数超限，而这正是闸门要防的事）。
 *
 * `dispose()` 放行全部等待者（插件卸载时不能让排队中的命令永远挂着）；此时 `active` 与真实
 * 占用的对应关系不再有意义，所以减法一律 `Math.max(0, …)`。
 */
export class ShortChannelGate {
  private active = 0
  private readonly waiters: (() => void)[] = []

  constructor(private readonly limit: number = shortChannelLimit()) {}

  async acquire(): Promise<() => void> {
    if (this.active < this.limit) {
      this.active += 1
      return this.releaseFn()
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve))
    // 名额由释放方转交，这里不再自增
    return this.releaseFn()
  }

  /** 占用中的并发数（测试缝）。 */
  get inUse(): number {
    return this.active
  }

  /** 排队中的调用数（测试缝）。 */
  get queued(): number {
    return this.waiters.length
  }

  /** 放行全部等待者（卸载路径；幂等）。 */
  dispose(): void {
    const pending = this.waiters.splice(0)
    for (const resolve of pending) resolve()
  }

  private releaseFn(): () => void {
    let released = false
    return () => {
      if (released) return
      released = true
      const next = this.waiters.shift()
      if (next !== undefined) {
        next()
        return
      }
      this.active = Math.max(0, this.active - 1)
    }
  }
}

/** 远程一次性命令执行器：懒连接池 + TOFU 指纹 + 输出上限。 */
export class RemoteExec {
  private readonly conns = new Map<string, RuntimeConn>()
  /** 每个池键一条短命令闸门（D150）；与连接同寿命，连接被重建也不重置配额。 */
  private readonly gates = new Map<string, ShortChannelGate>()
  private sweeper: NodeJS.Timeout | null = null

  constructor(
    private readonly logger: ExecLogger,
    private readonly store: HostKeyStore,
    /**
     * ProxyCommand 闸门求值器（缺省 = 恒关）。
     *
     * 为什么是**回调**而不是构造时读一次的布尔值：开关归 tty settings，本包的 settings 句柄是
     * 运行时才就绪的，而且用户随时可能关掉它——关掉之后必须**立刻**对下一次拨号生效
     * （留着旧值意味着「关了还能用」，那正是这一档最不能出的错）。求值只读内存，无 IO。
     */
    private readonly options: { proxyCommandAllowed?: () => boolean } = {},
  ) {}

  /** 插件卸载：关定时器与全部连接（幂等）。 */
  disposeAll(): void {
    if (this.sweeper !== null) {
      clearInterval(this.sweeper)
      this.sweeper = null
    }
    for (const rt of this.conns.values()) {
      // 先标记再关闭（D94）：建连途中的条目被 end() 后，它的 ready 仍会 resolve——
      // 标记让 acquire() 认出「这条已被卸载摘掉」，改为关闭并 reject，不外泄脱管连接。
      rt.disposed = true
      try {
        rt.client.end()
      } catch {
        /* 连接已断开 */
      }
      try {
        rt.jump?.end()
      } catch {
        /* 连接已断开 */
      }
      rt.jump = null
      // 代理命令是子进程：只 end() 目标 client 不会杀它（ssh2 不管子进程生死）
      rt.proxy?.dispose()
      rt.proxy = null
    }
    this.conns.clear()
    // 排队中的短命令一并放行（D150）：卸载后它们只会立刻失败，但不能挂在闸门上
    for (const gate of this.gates.values()) gate.dispose()
    this.gates.clear()
  }

  /**
   * 取这个池键对应的短命令闸门（懒建）。键与连接池同口径（{@link poolKey}）——闸门防的是
   * 「同一条连接上的通道额度」，所以必须与「同一条连接」同键。
   */
  private gateFor(key: string): ShortChannelGate {
    const existing = this.gates.get(key)
    if (existing !== undefined) return existing
    const gate = new ShortChannelGate()
    this.gates.set(key, gate)
    return gate
  }

  /** 在远程执行一条命令（argv 形式，内部做 shell 转义）。 */
  async run(spec: SshSpec, argv: readonly string[], options?: ExecOptions): Promise<ExecResult> {
    const command = shJoin(argv)
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES
    const started = Date.now()
    const key = poolKey(spec)
    /*
     * 短命令闸门（D150）：先排队再开通道，超出的调用等前一条收尾。
     * 「开门」也算在占用里——若在拿到名额与开门之间放走另一个调用，两条通道会同时落在同一条
     * 连接上，而额度只剩两条余量（长流上限 8 / MaxSessions 10），那正是要防的事。
     */
    const releaseSlot = await this.gateFor(key).acquire()
    try {
      /*
       * 已经 abort 了就别再开门（D161）：排队等名额期间外层预算到点时，这条命令
       * 一次都不该落到远端——否则刚拿到名额就去占一个 session 槽，正好是要防的事。
       */
      if (options?.signal?.aborted === true) {
        return { code: null, stdout: '', stderr: '', timedOut: false, truncated: false, durationMs: Date.now() - started }
      }
      const channel = await this.openChannel(spec, command, timeoutMs, 0)
      // 一次性命令也计入「在途」（D01）：docker pull 默认 600s，期间没有任何请求
      // 刷新 lastUsed， sweeper 若只认 busy 会把跑了一半的命令连人带输出掐断。
      // 取值放在开门**之后**：openChannel 可能已经重连换过条目（D150），要算在活条目头上。
      const rt = this.conns.get(key)
      if (rt !== undefined) rt.inflight += 1
      try {
        return await new Promise<ExecResult>((resolve, reject) => {
          const stdoutSink = new ByteSink(maxBytes, options?.keepTail === true, options?.lineAlign === true)
          const stderrSink = new ByteSink(maxBytes, options?.keepTail === true, options?.lineAlign === true)
          const stdoutDecoder = new StringDecoder('utf8')
          const stderrDecoder = new StringDecoder('utf8')
          let timedOut = false
          let settled = false
          /** 打断只做一次：abort 与 timeout 谁先到谁生效，另一个不许再把 `timedOut` 翻上去。 */
          let interrupted = false
          let timer: NodeJS.Timeout | null = null
          /** 摘掉 abort 监听（D161）：命令收尾后 signal 还活着，不摘就是一条悬着的闭包链。 */
          let cleanupAbort: () => void = () => {}

          const finish = (code: number | null): void => {
            if (settled) return
            settled = true
            if (timer !== null) clearTimeout(timer)
            cleanupAbort()
            const current = this.conns.get(key)
            if (current !== undefined) current.lastUsed = Date.now()
            resolve({
              code,
              stdout: stdoutSink.decode(stdoutDecoder),
              stderr: stderrSink.decode(stderrDecoder),
              timedOut,
              truncated: stdoutSink.truncated || stderrSink.truncated,
              durationMs: Date.now() - started,
            })
          }

          // 定时器放在 finish **之后**（D112）：超时除了打断远端命令，还要**直接 settle**。
          // 原先只 signal('KILL') + close()，若通道静默不响应（既不 emit 'close' 也不 emit
          // 'error'），promise 永不落定 → finally 里的 inflight 减不掉 → 该连接对
          // shouldRecycleConn 永远是「在途」，sweeper 再也回收不了它。
          // settled 守卫保证与随后的 'close' 事件不会重复 resolve（幂等）。
          /*
           * 收尾只有这一处（D161）：超时与外部 abort 共用同一段 `signal('KILL') + close() +
           * finish(null)`。**不要**给 abort 另写一条路径——D112 的教训正是「只 signal + close
           * 而不 settle」会让 promise 永不落定、inflight 减不掉、连接再也回收不了。
           */
          const interrupt = (why: 'timeout' | 'abort'): void => {
            if (settled || interrupted) return
            interrupted = true
            if (timer !== null) clearTimeout(timer)
            if (why === 'timeout') timedOut = true
            try {
              channel.signal('KILL')
            } catch {
              /* 远端可能已结束 */
            }
            channel.close()
            finish(null)
          }
          timer = setTimeout(() => {
            interrupt('timeout')
          }, timeoutMs)
          if (options?.signal !== undefined) {
            const onAbort = (): void => {
              interrupt('abort')
            }
            if (options.signal.aborted) onAbort()
            else options.signal.addEventListener('abort', onAbort, { once: true })
            // finish / reject 都要摘监听：聚合是**每个目标一个 signal**，不摘就是一条
            // 永不释放的闭包链（命令早已结束，监听器还挂在长命的 signal 上）
            cleanupAbort = () => {
              options.signal?.removeEventListener('abort', onAbort)
            }
          }

          channel.on('data', (chunk: Buffer) => {
            stdoutSink.push(chunk)
          })
          channel.stderr.on('data', (chunk: Buffer) => {
            stderrSink.push(chunk)
          })
          channel.on('close', (code: number | null) => {
            finish(typeof code === 'number' ? code : null)
          })
          channel.on('error', (error: Error) => {
            if (settled) return
            settled = true
            if (timer !== null) clearTimeout(timer)
            cleanupAbort()
            reject(new Error(`SSH exec channel 异常：${error.message}`))
          })
          if (options?.input !== undefined) channel.end(options.input)
        })
      } finally {
        if (rt !== undefined) rt.inflight = Math.max(0, rt.inflight - 1)
      }
    } finally {
      // 释放名额（异常路径也必须放）：闸门漏放 = 该目标后续所有短命令永久排队
      releaseSlot()
    }
  }

  /**
   * 在远程开一条**长流**（docker logs --follow）：stdout/stderr 逐块回调，
   * channel 关闭时 resolve 退出码。
   *
   * 与 run() 的差别：无总超时、无输出上限；外部 AbortSignal 触发停止时
   * channel.signal('KILL') + channel.close()，**不 client.end()**——连接池里的
   * 连接要留给后续请求复用。流存续期间连接计 busy，sweeper 不得按空闲回收。
   */
  async stream(spec: SshSpec, argv: readonly string[], handlers: StreamHandlers, signal?: AbortSignal): Promise<StreamResult> {
    const command = shJoin(argv)
    // 先确保连接已建立：下面的 rt.busy 与配额判定都依赖连接已存在于池里
    await this.acquire(spec)
    const key = poolKey(spec)
    let holder = this.conns.get(key)
    if (holder === undefined) {
      // acquire 之后条目必在（acquire 先占坑，见 acquire 内注释）；真发生说明池状态
      // 被并发破坏——**fail-closed**（D26）：静默跳过配额判定会让长流绕开
      // MAX_STREAMS_PER_TARGET，直冲 OpenSSH MaxSessions=10
      throw new Error(`SSH 连接状态异常（${sshTarget(spec)}）：请重试；若持续出现请反馈`)
    }
    {
      // 配额判定放在自增**之前**：拒绝时没有自增，finally 里的 release 也就不会去减别人的计数
      const denied = streamBudgetError(sshTarget(spec), holder.busy)
      if (denied !== null) throw new Error(denied)
      holder.busy += 1
    }
    /**
     * 把计数从「开门之前那条条目」搬到「现在池里那条」（D88）。
     *
     * 为什么必须搬：openChannel 遇到传输错误会 dropConn + end() **另建一条**连接
     * （见 openChannel 的重试分支），于是开门前 `busy += 1` 记的那条已被摘掉——新连接
     * 的 busy 是 0 → ① 长流配额少算，MAX_STREAMS_PER_TARGET 的 fail-closed 保护在这条
     * 路径失效；② 用户正在看的 `docker logs -f` 在 120s 后被 sweeper 当空闲连接掐断
     * （sweeper 只看活条目的 busy/inflight），正是 D01 要消灭的症状。
     * 配额判定与自增仍留在 openChannel **之前**：否则被拒的流已经白开了一条通道。
     */
    const moveBusyToLive = (): void => {
      const live = this.conns.get(key)
      if (live !== undefined && live !== holder) {
        // holder 在下面的 undefined 守卫后必定有值；因为它在闭包里被重新赋值，
        // TS 的窄化不会跨赋值保留，这里用 `!` 明确（不是新契约）
        holder!.busy = Math.max(0, holder!.busy - 1)
        live.busy += 1
        holder = live
      }
    }
    let released = false
    // try/finally 保证 busy 增减严格配对：异常路径也不能把连接永久标成 busy
    //（一律作用于 holder：重连后计数已经搬过家，release 必须减现在这条）
    const release = (): void => {
      if (released) return
      released = true
      holder!.busy = Math.max(0, holder!.busy - 1)
      holder!.lastUsed = Date.now()
    }
    try {
      if (signal?.aborted === true) return { code: null }
      const channel = await this.openChannel(spec, command, DEFAULT_TIMEOUT_MS, 0)
      // 开门成功才可能发生「重连换条目」；开门抛错时条目仍是我占的那条，无需搬
      moveBusyToLive()

      return await new Promise<StreamResult>((resolve, reject) => {
        const stdoutDecoder = new StringDecoder('utf8')
        const stderrDecoder = new StringDecoder('utf8')
        let settled = false
        /*
         * 中止长流：先请远端 KILL，再关通道，**然后自己 settle**。
         *
         * 注意 `signal('KILL')` **不保证生效**（D150，2026-09-29 实测 248：sshd 记
         * `session_signal_req: session signalling requires privilege separation` 并拒绝），
         * 而 sshd 在子进程仍活着时会延迟释放 session 槽。
         *
         * **D164（所以这里必须有 `finish(null)`）**：远端**不确认**关通道时（上面那种拒绝，
         * 或通道静默——既不 `emit('close')` 也不 `emit('error')`），原先这个 Promise 永不
         * 落定 → `finally` 里的 `release()` 永不执行 → `busy` 永久 +1。累积到 8 之后，
         * 该目标的**每一条**长流都被 `streamBudgetError` 拒绝，而面板上只看到「事件流已断开」、
         * 点「重连」毫无反应（拒绝原因被客户端丢掉，见 D164 的另一半）。
         *
         * 这是 D112（`run()` 的超时）与 D161（`run()` 的 abort）已经踩过两次的同一个坑：
         * **只 `signal` + `close` 而不 settle，账就永远平不了**。两条路径已合并到一处
         * `interrupt()`，长流这条也照办。兜底仍保留：openChannel 的「额度满 → 重建连接」
         * （D150）管的是**远端**槽位，插件自己的 `busy` 必须当场归零。
         */
        const onAbort = (): void => {
          if (settled) return
          try {
            channel.signal('KILL')
          } catch {
            /* 远端可能已结束 */
          }
          channel.close()
          finish(null)
        }
        const finish = (code: number | null): void => {
          if (settled) return
          settled = true
          signal?.removeEventListener('abort', onAbort)
          const stdoutTail = stdoutDecoder.end()
          if (stdoutTail !== '') handlers.onStdout(stdoutTail)
          const stderrTail = stderrDecoder.end()
          if (stderrTail !== '') handlers.onStderr(stderrTail)
          resolve({ code })
        }
        if (signal !== undefined) {
          if (signal.aborted) onAbort()
          else signal.addEventListener('abort', onAbort, { once: true })
        }
        /*
         * D164：收尾之后一律不再回调。`onAbort` 现在会主动 settle，而远端**仍可能**在稍后
         * 推来几块数据 / 事件（它并不知道我们已经把这条流当结束了）；不做这个闸的话，
         * 调用方会收到「已经 resolve 之后还来的」分片，语义上是重复投递。
         */
        channel.on('data', (chunk: Buffer) => {
          if (settled) return
          const text = stdoutDecoder.write(chunk)
          if (text !== '') handlers.onStdout(text)
        })
        channel.stderr.on('data', (chunk: Buffer) => {
          if (settled) return
          const text = stderrDecoder.write(chunk)
          if (text !== '') handlers.onStderr(text)
        })
        channel.on('close', (code: number | null) => {
          finish(typeof code === 'number' ? code : null)
        })
        channel.on('error', (error: Error) => {
          if (settled) return
          settled = true
          signal?.removeEventListener('abort', onAbort)
          reject(new Error(`SSH exec channel 异常：${describeExecError(error.message)}`))
        })
      })
    } finally {
      release()
    }
  }

  /* -------------------------------------------------------------- */
  /* 连接池                                                          */
  /* -------------------------------------------------------------- */

  private ensureSweeper(): void {
    if (this.sweeper !== null) return
    this.sweeper = setInterval(() => {
      const now = Date.now()
      for (const [key, rt] of this.conns) {
        // busy>0 = 上面有长流在推：空闲回收必须让路（lastUsed 不会被流刷新）
        if (!shouldRecycleConn(rt, now)) continue
        this.conns.delete(key)
        try {
          rt.client.end()
        } catch {
          /* 连接已断开 */
        }
        // 空闲回收同样要成对：只关目标会留下一堆 keepalive 养着的跳板机连接
        try {
          rt.jump?.end()
        } catch {
          /* 连接已断开 */
        }
        rt.jump = null
        // 代理命令一并杀（空闲回收后它没有任何用了，留着就是常驻孤儿进程）
        rt.proxy?.dispose()
        rt.proxy = null
      }
      if (this.conns.size === 0 && this.sweeper !== null) {
        clearInterval(this.sweeper)
        this.sweeper = null
      }
    }, SWEEP_MS)
    this.sweeper.unref?.()
  }

  /**
   * 开一条 exec channel；**传输层**错误或**通道额度被占满**时丢掉连接、重连一次
   * （见 `isTransportError` / `isChannelExhaustedError`）。
   *
   * 只重试一次：重连之后还报同样的错，多半不是连接的问题（目标本身不可达 / 新连接也被
   * 别的东西占满），再试只是把失败拖长、还会多压一条命令过去。
   */
  private async openChannel(spec: SshSpec, command: string, timeoutMs: number, attempt: number): Promise<ClientChannel> {
    // acquire 放在 try **外面**（D27）：建连失败（目标不可达等）不该落在「传输错误
    // 重试」的范围内——否则每次命令都要干等两轮 20s 的 readyTimeout。
    const client = await this.acquire(spec)
    try {
      return await new Promise<ClientChannel>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`SSH exec 打开 channel 超时（${String(timeoutMs)}ms）：${sshTarget(spec)}`))
        }, timeoutMs)
        client.exec(command, (error, ch) => {
          clearTimeout(timer)
          if (error !== undefined && error !== null) {
            reject(new Error(`SSH exec 失败：${describeExecError(error.message)}`))
            return
          }
          resolve(ch)
        })
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      /*
       * 额度占满（D150）与传输错误走同一套「丢连接 + 关闭 + 重建一次」，但**留一行 warn**：
       * 与传输错误不同，连接本身是活的，用户看到的现象是「面板时好时坏、重试偶尔有用」——
       * 没有这行日志，事后没人能从宿主日志里看出「这条连接曾被打满、插件自己重建过一次」。
       * 关闭动作仍然要做：只摘出池不 end() 会让 keepalive 一直养着一条满连接（D07 的教训）。
       *
       * 代价（有意接受）：`end()` 会让这条连接上正在跟随的长流一起断，由面板的 SSE 自动
       * 重连接管（日志流按 D133 用 tail=0 续尾、统计与事件流由 EventSource 自己重连）。
       * 「几秒的流抖动 + 自动恢复」比「一条永远满的连接 + 重试永远失败」划算——这也是
       * {@link MAX_STREAMS_PER_TARGET} 说明里那条实测症状的唯一出口。
       */
      const exhausted = isChannelExhaustedError(message)
      if (attempt === 0 && (isTransportError(message) || exhausted)) {
        if (exhausted) {
          this.logger.warn(`[dsh-docker] ssh ${sshTarget(spec)} 远端拒绝了新通道（通道额度已满）：已重建连接重试`)
        }
        // 丢掉这条连接并**关闭它**（D07）：只摘出池不 end() 的话，keepalive 会一直
        // 养着一条死连接；dropConn 带身份校验，不会误摘同键上的新连接（D06）。
        const key = poolKey(spec)
        const stale = this.conns.get(key)
        if (stale !== undefined && stale.client === client) {
          // 跳板机 / 代理命令也一起收：重连会重新拨一条，旧的留着只会白养一条连接 / 一个进程
          try {
            stale.jump?.end()
          } catch {
            /* 连接已断开 */
          }
          stale.jump = null
          stale.proxy?.dispose()
          stale.proxy = null
        }
        this.dropConn(key, client)
        try {
          client.end()
        } catch {
          /* 连接已断开 */
        }
        return await this.openChannel(spec, command, timeoutMs, 1)
      }
      throw error
    }
  }

  private async acquire(spec: SshSpec): Promise<Client> {
    this.ensureSweeper()
    const key = poolKey(spec)
    const existing = this.conns.get(key)
    if (existing !== undefined) {
      existing.lastUsed = Date.now()
      return existing.ready
    }
    const target = sshTarget(spec)
    const client = new Client()
    let resolveReady!: (value: Client) => void
    let rejectReady!: (error: Error) => void
    const ready = new Promise<Client>((resolve, reject) => {
      resolveReady = resolve
      rejectReady = reject
    })
    // **先占坑再异步解析配置**（D02）：buildConnectConfig 会 await 凭据解析、让出事件
    // 循环——若此时池里还没有条目，并发第二个请求会各自建连，先建好的那条立即脱管
    //（回收不到、disposeAll 关不掉、配额记在别人头上），日后的 close/error 还会误摘
    // 同键的新连接（D06）。占位后并发请求拿到的就是同一条 ready。
    const entry: RuntimeConn = { client, lastUsed: Date.now(), ready, busy: 0, inflight: 0, disposed: false, jump: null, proxy: null }
    this.conns.set(key, entry)
    // ready 被拒时不要留下未处理 rejection（调用方 await 时会拿到）
    ready.catch(() => {
      /* 由调用方处理 */
    })
    let settled = false
    let timer: NodeJS.Timeout | null = null
    /**
     * 这条占位条目还是不是「我的」（D94）。
     *
     * 为什么要单独判：`disposeAll()`（插件卸载）与 sweeper 都能在**建连途中**把占位条目
     * 摘掉并 `end()`。只判 settled 的话，随后到来的 `ready` / `error` 仍会走完正常流程——
     * 前者 resolve 出一条不在池里的活连接（回收不到、disposeAll 再关不掉、keepalive 一直
     * 养着，`run()` 的 inflight 保护也一并失效），后者丢掉真实错误原因只报「连接超时」。
     * 归属口径 = 池里这个键仍指向这条条目，且它没有被 disposeAll 标记（先标记后 clear，
     * 所以标记能覆盖「已摘出但还没被 clear」的窗口）。
     */
    const ownsEntry = (): boolean => this.conns.get(key) === entry && !entry.disposed
    /** 兜底关闭：ssh2 Client 的 `end()` 对「尚未建连」的实例未必有用，`destroy()` 再补一刀。 */
    const forceClose = (): void => {
      try {
        client.end()
      } catch {
        /* 连接未建立 / 已断开 */
      }
      try {
        client.destroy()
      } catch {
        /* 同上 */
      }
    }
    /**
     * 关掉这条条目上的跳板机 / 代理命令（目标 client 只是借用它们的通道 / stdio，必须成对收）。
     *
     * 两者**都要**做（不是二选一）：拨号时按 ProxyJump 优先只起一条，但这里只关心「条目上
     * 挂了什么」，写成两行就不必再判一次谁生效——no-op 的代价远低于漏收尾。
     */
    const closeTransport = (): void => {
      const jump = entry.jump
      entry.jump = null
      if (jump !== null) {
        try {
          jump.end()
        } catch {
          /* 已断开 */
        }
      }
      const proxy = entry.proxy
      entry.proxy = null
      proxy?.dispose()
    }
    const settleError = (error: Error): void => {
      if (settled) return
      settled = true
      if (timer !== null) clearTimeout(timer)
      // 归属校验同样落在错误路径：条目已被摘掉（多为 disposeAll）时，真正该报的是
      // 「这条连接已被释放」，而不是此后某次 close 触发的「握手完成前关闭」或超时（D94）
      const finalError = ownsEntry() ? error : new Error(`SSH 连接已在建立期间被释放（${target}）：请重试`)
      this.dropConn(key, client)
      forceClose()
      closeTransport()
      rejectReady(finalError)
    }
    try {
      const connectConfig = await buildConnectConfig(spec)
      /*
       * 跳板机（ProxyJump 单跳）：先拨它、借一条 forwardOut 通道，再把目标连接跑在这条
       * 通道上（`ConnectConfig.sock`）。拨号失败/超时都在 dialJump 里点名跳板机并自我清理；
       * 成功后这条「跳板机连接」登记在池条目上，与目标成对关闭（见 closeRuntime）。
       */
      const proxyCommand = sanitizeProxyCommand(spec.proxyCommand)
      if (spec.jump !== undefined) {
        if (proxyCommand !== undefined) {
          // 两者同时配：按 OpenSSH 语义 ProxyJump 优先，但**不静默**（用户以为走的是代理命令最坏）
          this.logger.warn(`[dsh-docker] ssh ${sshTarget(spec)} 同时配了跳板机与代理命令：按 OpenSSH 语义走跳板机（ProxyJump 优先），代理命令被忽略`)
        }
        const dialed = await dialJump({ spec, store: this.store, logger: this.logger })
        entry.jump = dialed.bastion
        connectConfig.sock = dialed.sock
      } else if (proxyCommand !== undefined) {
        /*
         * 代理命令（ProxyCommand）：整档信任级，闸门由 tty settings 的 `allowProxyCommand`
         * 决定（回调按**每次拨号**求值，用户一关就立刻生效）。关着时 dialProxyCommand 直接抛
         * 明确的错——**不退回直连**，并由 settleError 收掉占位条目。
         */
        const dialed = await dialProxyCommand({ spec, allowed: this.options.proxyCommandAllowed, logger: this.logger })
        entry.proxy = dialed
        connectConfig.sock = dialed.sock
      }
      const policy = applyHostKeyPolicy({ connectConfig, spec, store: this.store, logger: this.logger, target })
      /**
       * 指纹变更优先于任何通用文案（含 D94 的「已释放」）：安全提示不能被噪音盖掉。
       * 握手超时则补上跳板机提示——那是「通用超时」最容易被误读的成因（ROADMAP 第 2 项）。
       */
      const describe = (error: Error, fallback: string): Error => {
        const mismatch = policy.mismatchMessage()
        if (mismatch !== null) return new Error(mismatch)
        const hint = /Timed out|ETIMEDOUT/i.test(error.message) ? `：${SSH_TIMEOUT_HINT}` : ''
        // 代理命令死了的话 ssh2 只会报「握手完成前关闭」——把退出码 / stderr 补在后面，
        // 否则用户会去查目标主机（那里没有任何问题）
        return new Error(`${fallback}：${error.message}${hint}${proxyFailureSuffix(entry.proxy)}`)
      }
      timer = setTimeout(() => {
        settleError(new Error(`SSH 连接超时（${targetWithJump(spec)}）：${SSH_TIMEOUT_HINT}`))
      }, connectTimeoutMs())
      client.once('ready', () => {
        if (settled) return
        settled = true
        if (timer !== null) clearTimeout(timer)
        if (!ownsEntry()) {
          // 建连途中被 disposeAll / sweeper 摘掉：这条 client 不属于任何人，
          // 交出去就是脱管连接——关掉再拒绝（D94）
          this.dropConn(key, client)
          forceClose()
          closeTransport()
          rejectReady(new Error(`SSH 连接已被释放（${target}）：请重试`))
          return
        }
        entry.lastUsed = Date.now()
        resolveReady(client)
      })
      /*
       * `on` 而不是 `once`（D145）：**同一次建连失败**里 ssh2 会 emit 不止一个 `error`——
       * socket 层报一次，client 层的「握手完成前关闭」再报一次。`once` 会在第一个 error 之后
       * 把监听摘掉，第二个就成了「没有监听者的 `error` 事件」，Node 按约定**直接抛成 uncaught
       * exception**：于是「目标不可达」这条最平常的路径会把整个进程带崩（本机实测：`pnpm test`
       * 22 条断言全过、退出码却是 1）。监听器常驻即可——`settleError` 自己按 `settled` 幂等，
       * 重复进来是 no-op（后到的那个 error 本来也没什么新信息可报）。
       */
      client.on('error', (error: Error) => {
        settleError(describe(error, `SSH 连接失败（${targetWithJump(spec)}）`))
      })
      // 同理常驻：重复的 close 是 no-op（条目已摘、跳板机与代理命令已收）
      client.on('close', () => {
        // 先取下代理命令的失败事实再收尾：closeTransport() 会把 entry.proxy 清掉，
        // 那时再取就永远是空串了（这正是「错误文案里少了最有用的那一句」的经典成因）
        const proxySuffix = proxyFailureSuffix(entry.proxy)
        this.dropConn(key, client)
        // 目标这条（无论握手期还是就绪后）断了：跳板机 / 代理命令也要一起收，
        // 否则前者带着 keepalive 一直挂着、后者变成没人管的常驻进程
        closeTransport()
        if (!settled) settleError(new Error(`SSH 连接失败（${targetWithJump(spec)}）：连接在握手完成前关闭${proxySuffix}`))
      })
      try {
        client.connect(connectConfig)
      } catch (error) {
        // connect() 的同步异常（如加密私钥缺 passphrase）必须先出池再拒绝（D05）：
        // 否则这条「永远假」的池条目会把同一句旧错误缓存到永远——改对配置也不恢复
        settleError(error instanceof Error ? error : new Error(String(error)))
      }
    } catch (error) {
      settleError(error instanceof Error ? error : new Error(String(error)))
    }
    return ready
  }

  /** 从池里摘掉一条连接。带 client 时做身份校验：只摘自己这条（D06）。 */
  private dropConn(key: string, client?: Client): void {
    if (client !== undefined && this.conns.get(key)?.client !== client) return
    this.conns.delete(key)
  }
}

/** 构造连接配置（认证三态 + keepalive + hostHash）；与 tty 的 ssh.ts 同策略。 */
export async function buildConnectConfig(spec: SshSpec): Promise<ConnectConfig> {
  const auth = spec.auth ?? 'agent'
  const base: ConnectConfig = {
    host: spec.host,
    port: spec.port ?? 22,
    username: spec.username,
    readyTimeout: connectTimeoutMs(),
    keepaliveInterval: 10_000,
    keepaliveCountMax: 3,
    // hostVerifier 依赖 hostHash 计算指纹；放行与否由 TOFU 策略决定
    hostHash: 'sha256',
  }
  if (auth === 'agent') {
    // 缺 SSH_AUTH_SOCK 时没有预检的话，ssh2 会报「All configured authentication
    // methods failed」，把「agent 没跑」这个最可能的原因藏起来（D29；tty 同款已修）
    if (process.env.SSH_AUTH_SOCK === undefined || process.env.SSH_AUTH_SOCK === '') {
      throw new Error(`auth=agent 但 SSH_AUTH_SOCK 未设置（ssh-agent 没在跑？）：ssh-agent 是最可能的原因。可改用 auth=key / auth=password，或先启动 ssh-agent`)
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
    if (password === undefined) throw new Error('auth=password 需要 password（或 env:NAME 凭据引用）')
    base.password = password
    // 部分服务端（路由器 / 堡垒机）只开 keyboard-interactive
    base.tryKeyboard = true
  }
  if (spec.agentForward === true && process.env.SSH_AUTH_SOCK !== undefined && process.env.SSH_AUTH_SOCK !== '') {
    base.agent = base.agent ?? process.env.SSH_AUTH_SOCK
  }
  // agentForward 配置要真正生效（D28）：ssh2 只认 cfg.agentForward === true 才会发
  // auth-agent-req@openssh.com，只设 base.agent（认证用途）远端永远拿不到本地 agent。
  //
  // 但必须复用上面的「有没有 agent」判定（D81）：ssh2 在 connect() 里硬校验
  // `agentForward === true && agent === undefined` → **同步 throw**
  //「You must set a valid agent path to allow agent forwarding」。
  // auth=key / auth=password 时 base.agent 只在有 SSH_AUTH_SOCK 时才会被设上，
  // 于是「宿主无 sock（launchd/systemd/GUI 启动、Windows）+ 勾了转发」会把配置从
  // 「等于没配」变成「整个目标不可用」——同目标每一次操作全失败，文案还是裸英文。
  // README 承诺的是「SSH_AUTH_SOCK 存在时生效」，所以这里**静默降级**：agent 不可用
  // 就当作没勾转发，连接照常建立（D29 已为 auth=agent 单独给出可读的预检错误）。
  if (spec.agentForward === true && base.agent !== undefined) base.agentForward = true
  return base
}

/** TOFU 主机指纹策略（hostVerifier 接线）；mismatchMessage() 供错误路径取人类可读拒绝原因。 */
export function applyHostKeyPolicy(options: {
  connectConfig: ConnectConfig
  spec: SshSpec
  store?: HostKeyStore
  logger?: ExecLogger
  target: string
}): { mismatchMessage(): string | null } {
  const { connectConfig, spec, store, logger, target } = options
  const port = spec.port ?? 22
  let hostKeyMismatch: string | null = null
  connectConfig.hostVerifier = (hash: string) => {
    // host 键统一 trim + 小写（D03）：tty 落盘时把 host 小写化，比较口径必须一致
    const host = spec.host.trim().toLowerCase()
    const known = store?.get(host, port)
    if (known === undefined || known.length === 0) {
      store?.record(host, port, hash)
      logger?.info(`[dsh-docker] ssh ${target} 首次连接，已记录 host key 指纹 sha256:${hash}（TOFU）`)
      return true
    }
    // 命中集合内**任意**一条指纹即放行：同一主机的 rsa / ed25519 各记一条（D03）
    if (known.includes(hash)) return true
    hostKeyMismatch =
      `SSH 主机密钥指纹变更：${target} 已记录 sha256:${known.join(' / ')}，本次为 sha256:${hash}。` +
      '可能是主机重装或换钥匙，也可能是中间人（MITM）冒充；确认安全后，到 插件配置 → Docker 容器面板 → SSH 主机密钥记录 删除该主机再重连。'
    logger?.warn(`[dsh-docker] ${hostKeyMismatch}`)
    return false
  }
  return { mismatchMessage: () => hostKeyMismatch }
}

/* ------------------------------------------------------------------ *
 * 本机执行
 * ------------------------------------------------------------------ */

/**
 * 本机一次性命令执行器（argv 数组，不经 shell）。
 * 用于 kind=local 的目标：宿主所在机器的 docker CLI。
 */
export async function runLocal(argv: readonly string[], options?: ExecOptions): Promise<ExecResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES
  const started = Date.now()
  const [bin, ...args] = argv
  if (bin === undefined) throw new Error('runLocal 需要至少一个 argv 元素')
  /*
   * 已经 abort 了就别再 spawn（D161）：外层预算到点时不该再拉起一个注定被杀的进程，
   * 少一次 fork 就少一次「杀了还赖着不放管道」的机会。返回 null code 与「被中止」
   * 同义——调用方的 assertOk 会把它变成明确的失败，不会静默当成功。
   */
  if (options?.signal?.aborted === true) {
    return { code: null, stdout: '', stderr: '', timedOut: false, truncated: false, durationMs: 0 }
  }

  return await new Promise<ExecResult>((resolve, reject) => {
    const stdoutSink = new ByteSink(maxBytes, options?.keepTail === true, options?.lineAlign === true)
    const stderrSink = new ByteSink(maxBytes, options?.keepTail === true, options?.lineAlign === true)
    const stdoutDecoder = new StringDecoder('utf8')
    const stderrDecoder = new StringDecoder('utf8')
    let timedOut = false
    let settled = false
    /** 打断只做一次：abort 与 timeout 谁先到谁生效，另一个不许再把 `timedOut` 翻上去。 */
    let interrupted = false
    let reapTimer: NodeJS.Timeout | null = null
    /** 摘掉 abort 监听（D161）：命令收尾后 signal 还活着，不摘就是一条悬着的闭包链。 */
    let cleanupAbort: () => void = () => {}

    const child = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'], env: process.env })

    /** 到点收尾（正常 close 与「杀了还赖着不放管道」两条路径共用）。 */
    const finish = (code: number | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (reapTimer !== null) clearTimeout(reapTimer)
      cleanupAbort()
      resolve({
        code,
        stdout: stdoutSink.decode(stdoutDecoder),
        stderr: stderrSink.decode(stderrDecoder),
        timedOut,
        truncated: stdoutSink.truncated || stderrSink.truncated,
        durationMs: Date.now() - started,
      })
    }

    /**
     * 打断这条命令（D161）：**超时与外部 abort 共用这一条收尾**，不要写第二条。
     *
     * D159 那段「SIGKILL 只杀直接子进程、孙进程还握着管道」的 `reapTimer` 收敛期
     * 必须原样复用：abort 若只 `child.kill('SIGKILL')` 就等 'close'，包装脚本场景下
     * 3s 上限会拖成 60.3s（真机实测）——外层预算到点却收不回底层，正是这次要修的事。
     *
     * `why` 只影响 `timedOut` 这个**事实标记**：它说的是「按自己的截止时间超时」。
     * 被外层预算取消不是它的超时，调用方那边另有信号（见 ExecOptions.signal）。
     */
    const interrupt = (why: 'timeout' | 'abort'): void => {
      if (settled || interrupted) return
      interrupted = true
      if (timer !== null) clearTimeout(timer)
      if (why === 'timeout') timedOut = true
      try {
        child.kill('SIGKILL')
      } catch {
        /* 进程可能已退出 */
      }
      /*
       * SIGKILL 只杀**直接子进程**：`dockerBin` 指向包装脚本时，孙进程照样握着
       * stdout/stderr 管道，'close' 便迟迟不来——15s 超时会被拉成分钟级（真机实测
       * 3s 上限拖到 60s，D159）。所以到点先杀，再给一小段收敛期，仍不 close 就
       * 自行放掉管道收尾：探测要的是「能不能用」，不是「等它把管道交出来」。
       */
      if (reapTimer !== null) return
      reapTimer = setTimeout(() => {
        try {
          child.stdout?.destroy()
          child.stderr?.destroy()
        } catch {
          /* 管道可能已关 */
        }
        /*
         * 刻意**不** removeAllListeners：还挂着的 'error' 监听是安全网——事后子进程
         * 再 emit 'error' 时，没有监听者的 'error' 事件会直接把宿主进程抛崩。监听器
         * 自己按 settled 判掉重复收尾，留着它们没有副作用。
         */
        child.unref?.()
        finish(null)
      }, KILL_GRACE_MS)
      reapTimer.unref?.()
    }

    const timer = setTimeout(() => {
      interrupt('timeout')
    }, timeoutMs)
    if (options?.signal !== undefined) {
      const onAbort = (): void => {
        interrupt('abort')
      }
      if (options.signal.aborted) onAbort()
      else options.signal.addEventListener('abort', onAbort, { once: true })
      cleanupAbort = () => {
        options.signal?.removeEventListener('abort', onAbort)
      }
    }

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutSink.push(chunk)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderrSink.push(chunk)
    })
    child.once('error', (error: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (reapTimer !== null) clearTimeout(reapTimer)
      cleanupAbort()
      // ENOENT 是最常见的失败：docker CLI 不在 PATH 里
      reject(new Error(`无法执行 ${bin}：${error.message}`))
    })
    child.once('close', (code: number | null) => {
      finish(code)
    })
    if (options?.input !== undefined) child.stdin.end(options.input)
    else child.stdin.end()
  })
}

/**
 * 本机**长流**执行器（argv 数组，不经 shell）：stdout/stderr 逐块回调，
 * 用于 `docker logs --follow` 这类不设总超时、不设输出上限的命令。
 *
 * 停止由外部 AbortSignal 触发，走 SIGTERM → 2s 未退出再 SIGKILL 的阶梯；
 * child 'close' 时 resolve 退出码（被信号杀死时为 null）。
 */
export function runLocalStream(argv: readonly string[], handlers: StreamHandlers, signal?: AbortSignal): Promise<StreamResult> {
  const [bin, ...args] = argv
  if (bin === undefined) throw new Error('runLocalStream 需要至少一个 argv 元素')

  return new Promise<StreamResult>((resolve, reject) => {
    const stdoutDecoder = new StringDecoder('utf8')
    const stderrDecoder = new StringDecoder('utf8')
    let settled = false
    let killTimer: NodeJS.Timeout | null = null
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env })

    const onAbort = (): void => {
      if (settled) return
      try {
        child.kill('SIGTERM')
      } catch {
        /* 进程可能已退出 */
      }
      if (killTimer === null) {
        killTimer = setTimeout(() => {
          if (settled) return
          try {
            child.kill('SIGKILL')
          } catch {
            /* 同上 */
          }
        }, 2000)
        killTimer.unref?.()
      }
    }

    if (signal !== undefined) {
      if (signal.aborted) onAbort()
      else signal.addEventListener('abort', onAbort, { once: true })
    }

    child.stdout.on('data', (chunk: Buffer) => {
      const text = stdoutDecoder.write(chunk)
      if (text !== '') handlers.onStdout(text)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      const text = stderrDecoder.write(chunk)
      if (text !== '') handlers.onStderr(text)
    })
    child.once('error', (error: Error) => {
      if (settled) return
      settled = true
      if (killTimer !== null) clearTimeout(killTimer)
      signal?.removeEventListener('abort', onAbort)
      // ENOENT 是最常见的失败：docker CLI 不在 PATH 里
      reject(new Error(`无法执行 ${bin}：${error.message}`))
    })
    child.once('close', (code: number | null) => {
      if (settled) return
      settled = true
      if (killTimer !== null) clearTimeout(killTimer)
      signal?.removeEventListener('abort', onAbort)
      const stdoutTail = stdoutDecoder.end()
      if (stdoutTail !== '') handlers.onStdout(stdoutTail)
      const stderrTail = stderrDecoder.end()
      if (stderrTail !== '') handlers.onStderr(stderrTail)
      resolve({ code })
    })
  })
}
