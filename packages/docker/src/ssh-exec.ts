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
 */
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
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

/* ------------------------------------------------------------------ *
 * 通用工具
 * ------------------------------------------------------------------ */

/** `env:VAR` 前缀从 process.env 取值；否则原样返回。 */
export function resolveSecret(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  if (!value.startsWith('env:')) return value
  const name = value.slice(4)
  const resolved = process.env[name]
  if (resolved === undefined || resolved === '') throw new Error(`环境变量未设置: ${name}`)
  return resolved
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
  /** 最近一次使用时间（空闲回收依据）。 */
  lastUsed: number
  /** 连接建立中的 promise（并发首个请求去重）。 */
  ready: Promise<Client>
}

const IDLE_MS = 120_000
const SWEEP_MS = 30_000
const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_BYTES = 512 * 1024

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
    const client = await this.acquire(spec)
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES
    const started = Date.now()

    const channel = await new Promise<ClientChannel>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`SSH exec 打开 channel 超时（${String(timeoutMs)}ms）：${sshTarget(spec)}`))
      }, timeoutMs)
      client.exec(command, (error, ch) => {
        clearTimeout(timer)
        if (error !== undefined && error !== null) {
          reject(new Error(`SSH exec 失败：${error.message}`))
          return
        }
        resolve(ch)
      })
    })

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

  /* -------------------------------------------------------------- */
  /* 连接池                                                          */
  /* -------------------------------------------------------------- */

  private ensureSweeper(): void {
    if (this.sweeper !== null) return
    this.sweeper = setInterval(() => {
      const now = Date.now()
      for (const [key, rt] of this.conns) {
        if (now - rt.lastUsed < IDLE_MS) continue
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

  private acquire(spec: SshSpec): Promise<Client> {
    this.ensureSweeper()
    const key = poolKey(spec)
    const existing = this.conns.get(key)
    if (existing !== undefined) {
      existing.lastUsed = Date.now()
      return existing.ready
    }
    const connectConfig = buildConnectConfig(spec)
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
    this.conns.set(key, { client, lastUsed: Date.now(), ready })
    return ready
  }

  private dropConn(key: string): void {
    this.conns.delete(key)
  }
}

/** 构造连接配置（认证三态 + keepalive + hostHash）；与 tty 的 ssh.ts 同策略。 */
export function buildConnectConfig(spec: SshSpec): ConnectConfig {
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
    const passphrase = resolveSecret(spec.passphrase)
    if (passphrase !== undefined) base.passphrase = passphrase
  } else {
    const password = resolveSecret(spec.password)
    if (password === undefined) throw new Error('auth=password 需要 password（或 env:VAR 引用）')
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
      '可能是主机重装或换钥匙，也可能是中间人（MITM）冒充；确认安全后，到 设置 → 插件 → Docker 容器面板 → SSH 主机密钥记录 删除该主机再重连。'
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
