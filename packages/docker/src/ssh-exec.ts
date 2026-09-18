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
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import { Client } from 'ssh2'
import type { ClientChannel, ConnectConfig } from 'ssh2'

/* ------------------------------------------------------------------ *
 * 类型
 * ------------------------------------------------------------------ */

/** TOFU 主机指纹记录（与 tty 同形状，便于人工比对）。 */
export interface HostKeyRecord {
  host: string
  port: number
  /** hostVerifier 收到的原样 sha256 十六进制指纹。 */
  fingerprint: string
}

/** 主机指纹钉扎存储（宿主半体实现为配置状态 + settings 持久化）。 */
export interface HostKeyStore {
  /** 已记录的指纹；未记录返回 undefined。 */
  get(host: string, port: number): string | undefined
  /** 首次连接握手时记录指纹。 */
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
}

/** 一条命令的执行结果。 */
export interface ExecResult {
  /** 退出码；进程被信号杀死或 channel 异常时为 null。 */
  code: number | null
  stdout: string
  stderr: string
  /** 超时被强制中断。 */
  timedOut: boolean
  /** 输出超过上限被截断。 */
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

/** 连接池键：同一主机同一账号复用一条 SSH 连接。 */
function poolKey(spec: SshSpec): string {
  return `${spec.username}@${spec.host}:${String(spec.port ?? 22)}`
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
}

const IDLE_MS = 120_000
const SWEEP_MS = 30_000
const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_BYTES = 512 * 1024

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
  return `${target} 上已有 ${String(busy)} 条实时流（上限 ${String(max)}）：同一连接上的通道额度`
    + `（OpenSSH MaxSessions 默认 10）被长流占满后，连「刷新列表」这类短命令都会被远端拒绝。`
    + `请关掉部分实时跟随、把聚合容器数减到 6 个以内，或稍后重试。`
}

/**
 * 把 ssh2 的通道级错误翻成可操作的提示。
 *
 * `(SSH) Channel open failure: open failed` 实测出现过（成因见 {@link MAX_STREAMS_PER_TARGET}
 * 的注释），偏偏出现在「刷新列表」这种日常操作上，而原始文案对用户没有任何指向性。
 * @param message - ssh2 给出的原始错误文案。
 * @returns 补了指向性说明的文案；不认识的原样返回。
 */
export function describeExecError(message: string): string {
  if (!/Channel open failure|open failed/i.test(message)) return message
  return `${message}（远端 sshd 拒绝了新通道：同一连接上的通道额度可能已被实时流占满——`
    + `OpenSSH MaxSessions 默认 10；关掉部分实时跟随 / 减少聚合容器数后重试）`
}

/**
 * 这条 ssh2 错误是不是**传输层 / 连接层**的（而不是命令自己失败）。
 *
 * 为什么要分类：池里的连接可能已经死了（远端 sshd 重启、网络抖动、sshd 踢掉空闲连接），
 * 而 `acquire()` 复用 memoized 的 `ready`、不会每次探活。这种时候唯一正确的动作是丢掉
 * 这条连接、重连一次再试；反过来，「命令返回非零」「镜像不存在」这类业务失败**绝不能**
 * 触发重连——那会把一次普通错误变成两条命令。
 */
export function isTransportError(message: string): boolean {
  // 前两条是我们自己的包装文案：回调迟迟不来 = 这条连接已经不响应了
  if (/打开 channel 超时|SSH 连接超时/.test(message)) return true
  return /Channel open failure|open failed|Not connected|connection lost|ECONNRESET|EPIPE|ETIMEDOUT|keepalive|No response from server/i.test(message)
}

/**
 * 空闲回收判定：busy>0 的连接上挂着长流（docker logs --follow 可以几小时不结束），
 * 期间 lastUsed 不会刷新——若只看 idle 就会把正在推送的流掐断，必须先看 busy。
 * 抽成纯函数便于回归（sweeper 本体依赖定时器，难以直接驱动）。
 */
export function shouldRecycleConn(conn: { lastUsed: number; busy: number }, now: number, idleMs: number = IDLE_MS): boolean {
  if (conn.busy > 0) return false
  return now - conn.lastUsed >= idleMs
}

/** 远程一次性命令执行器：懒连接池 + TOFU 指纹 + 输出上限。 */
export class RemoteExec {
  private readonly conns = new Map<string, RuntimeConn>()
  private sweeper: NodeJS.Timeout | null = null

  constructor(
    private readonly logger: ExecLogger,
    private readonly store: HostKeyStore,
  ) {}

  /** 插件卸载：关定时器与全部连接（幂等）。 */
  disposeAll(): void {
    if (this.sweeper !== null) {
      clearInterval(this.sweeper)
      this.sweeper = null
    }
    for (const rt of this.conns.values()) {
      try {
        rt.client.end()
      } catch {
        /* 连接已断开 */
      }
    }
    this.conns.clear()
  }

  /** 在远程执行一条命令（argv 形式，内部做 shell 转义）。 */
  async run(spec: SshSpec, argv: readonly string[], options?: ExecOptions): Promise<ExecResult> {
    const command = shJoin(argv)
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES
    const started = Date.now()

    const channel = await this.openChannel(spec, command, timeoutMs, 0)

    return await new Promise<ExecResult>((resolve, reject) => {
      let stdout = ''
      let stderr = ''
      let stdoutBytes = 0
      let stderrBytes = 0
      let truncated = false
      let timedOut = false
      let settled = false

      const cap = (text: string, current: number, chunk: Buffer): { text: string; bytes: number } => {
        const room = maxBytes - current
        if (room <= 0) {
          truncated = true
          return { text, bytes: current }
        }
        if (chunk.length > room) {
          truncated = true
          return { text: text + chunk.subarray(0, room).toString('utf8'), bytes: maxBytes }
        }
        return { text: text + chunk.toString('utf8'), bytes: current + chunk.length }
      }

      const timer = setTimeout(() => {
        timedOut = true
        try {
          channel.signal('KILL')
        } catch {
          /* 远端可能已结束 */
        }
        channel.close()
      }, timeoutMs)

      const finish = (code: number | null): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        const rt = this.conns.get(poolKey(spec))
        if (rt !== undefined) rt.lastUsed = Date.now()
        resolve({ code, stdout, stderr, timedOut, truncated, durationMs: Date.now() - started })
      }

      channel.on('data', (chunk: Buffer) => {
        const next = cap(stdout, stdoutBytes, chunk)
        stdout = next.text
        stdoutBytes = next.bytes
      })
      channel.stderr.on('data', (chunk: Buffer) => {
        const next = cap(stderr, stderrBytes, chunk)
        stderr = next.text
        stderrBytes = next.bytes
      })
      channel.on('close', (code: number | null) => {
        finish(typeof code === 'number' ? code : null)
      })
      channel.on('error', (error: Error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(new Error(`SSH exec channel 异常：${error.message}`))
      })
      if (options?.input !== undefined) channel.end(options.input)
    })
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
    const rt = this.conns.get(poolKey(spec))
    if (rt !== undefined) {
      // 配额判定放在自增**之前**：拒绝时没有自增，finally 里的 release 也就不会去减别人的计数
      const denied = streamBudgetError(sshTarget(spec), rt.busy)
      if (denied !== null) throw new Error(denied)
      rt.busy += 1
    }
    let released = false
    // try/finally 保证 busy 增减严格配对：异常路径也不能把连接永久标成 busy
    const release = (): void => {
      if (released) return
      released = true
      if (rt !== undefined) {
        rt.busy = Math.max(0, rt.busy - 1)
        rt.lastUsed = Date.now()
      }
    }
    try {
      if (signal?.aborted === true) return { code: null }
      const channel = await this.openChannel(spec, command, DEFAULT_TIMEOUT_MS, 0)

      return await new Promise<StreamResult>((resolve, reject) => {
        const stdoutDecoder = new StringDecoder('utf8')
        const stderrDecoder = new StringDecoder('utf8')
        let settled = false
        const onAbort = (): void => {
          if (settled) return
          try {
            channel.signal('KILL')
          } catch {
            /* 远端可能已结束 */
          }
          channel.close()
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
        channel.on('data', (chunk: Buffer) => {
          const text = stdoutDecoder.write(chunk)
          if (text !== '') handlers.onStdout(text)
        })
        channel.stderr.on('data', (chunk: Buffer) => {
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
      }
      if (this.conns.size === 0 && this.sweeper !== null) {
        clearInterval(this.sweeper)
        this.sweeper = null
      }
    }, SWEEP_MS)
    this.sweeper.unref?.()
  }

  /**
   * 开一条 exec channel；**传输层**错误时丢掉连接、重连一次（见 `isTransportError`）。
   *
   * 只重试一次：重连之后还报同样的错，多半不是连接的问题（远端 MaxSessions 真满了、
   * 或目标本身不可达），再试只是把失败拖长、还会多压一条命令过去。
   */
  private async openChannel(spec: SshSpec, command: string, timeoutMs: number, attempt: number): Promise<ClientChannel> {
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
      if (attempt === 0 && isTransportError(message)) {
        this.dropConn(poolKey(spec))
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
    const connectConfig = await buildConnectConfig(spec)
    const target = sshTarget(spec)
    const policy = applyHostKeyPolicy({ connectConfig, spec, store: this.store, logger: this.logger, target })
    const client = new Client()
    const ready = new Promise<Client>((resolve, reject) => {
      let settled = false
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        this.dropConn(key)
        try {
          client.end()
        } catch {
          /* 连接未建立 */
        }
        reject(new Error(`SSH 连接超时（${target}）`))
      }, 20_000)
      client.once('ready', () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(client)
      })
      client.once('error', (error: Error) => {
        this.dropConn(key)
        if (settled) return
        settled = true
        clearTimeout(timer)
        const mismatch = policy.mismatchMessage()
        reject(new Error(mismatch ?? `SSH 连接失败（${target}）：${error.message}`))
      })
      client.once('close', () => {
        this.dropConn(key)
      })
      client.connect(connectConfig)
    })
    // ready 被拒时不要留下未处理 rejection（调用方 await 时会拿到）
    ready.catch(() => {
      /* 由调用方处理 */
    })
    this.conns.set(key, { client, lastUsed: Date.now(), ready, busy: 0 })
    return ready
  }

  private dropConn(key: string): void {
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
    readyTimeout: 20_000,
    keepaliveInterval: 10_000,
    keepaliveCountMax: 3,
    // hostVerifier 依赖 hostHash 计算指纹；放行与否由 TOFU 策略决定
    hostHash: 'sha256',
  }
  if (auth === 'agent') {
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
    const known = store?.get(spec.host, port)
    if (known === undefined) {
      store?.record(spec.host, port, hash)
      logger?.info(`[dsh-docker] ssh ${target} 首次连接，已记录 host key 指纹 sha256:${hash}（TOFU）`)
      return true
    }
    if (known === hash) return true
    hostKeyMismatch =
      `SSH 主机密钥指纹变更：${target} 已记录 sha256:${known}，本次为 sha256:${hash}。` +
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

  return await new Promise<ExecResult>((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    let stdoutBytes = 0
    let stderrBytes = 0
    let truncated = false
    let timedOut = false
    let settled = false

    const child = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'], env: process.env })
    const cap = (text: string, current: number, chunk: Buffer): { text: string; bytes: number } => {
      const room = maxBytes - current
      if (room <= 0) {
        truncated = true
        return { text, bytes: current }
      }
      if (chunk.length > room) {
        truncated = true
        return { text: text + chunk.subarray(0, room).toString('utf8'), bytes: maxBytes }
      }
      return { text: text + chunk.toString('utf8'), bytes: current + chunk.length }
    }

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)

    child.stdout.on('data', (chunk: Buffer) => {
      const next = cap(stdout, stdoutBytes, chunk)
      stdout = next.text
      stdoutBytes = next.bytes
    })
    child.stderr.on('data', (chunk: Buffer) => {
      const next = cap(stderr, stderrBytes, chunk)
      stderr = next.text
      stderrBytes = next.bytes
    })
    child.once('error', (error: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      // ENOENT 是最常见的失败：docker CLI 不在 PATH 里
      reject(new Error(`无法执行 ${bin}：${error.message}`))
    })
    child.once('close', (code: number | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code, stdout, stderr, timedOut, truncated, durationMs: Date.now() - started })
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
