/**
 * @hyzyn/dsh-tty — DSH Web GUI 的终端面板插件（宿主半体）。
 *
 * 机制：浏览器半体打开「终端」大弹窗后，经 WebSocket 连接
 * /api/dsh-tty/ws（webServer.registerUpgrade 注册的 upgrade 路由），
 * spawn 帧创建真实 PTY 会话（ctx.subprocess.spawnTerminal，node-pty），
 * 之后双向透传：input/resize/kill 上行，data/exit/error 下行。
 *
 * 帧协议 v3（JSON 文本帧；sid 维度支持单连接多会话/标签页 + 断线重连）：
 *   C→S  {t:'spawn', sid?, cols?, rows?, cwd?}  创建本地会话；sid 缺省时宿主生成
 *   C→S  {t:'ssh', sid?, cols?, rows?, name? | host, username, ...}
 *                                               创建 SSH 会话（ssh2 原生，见 ssh.ts）；
 *                                               name 引用连接簿条目，内联字段可覆盖
 *   C→S  {t:'input', sid?, d}                  按键/粘贴数据
 *   C→S  {t:'resize', sid?, cols, rows}        xterm fit 触发
 *   C→S  {t:'kill', sid?}                      关闭会话（孤儿会话也可跨连接 kill）
 *   C→S  {t:'sessions'}                        列出全局会话（attachable 标记可重连者）
 *   C→S  {t:'attach', sid}                     重连孤儿会话（断线保活窗口内）：
 *                                               ready 后紧跟一帧 data 回放输出缓冲
 *   S→C  {t:'ready', sid, pid, kind, target?}  会话就绪（ssh 时 pid=null，target=user@host）
 *   S→C  {t:'data', sid, d}                    终端输出（utf8 文本，StringDecoder 兜多字节分帧）
 *   S→C  {t:'exit', sid, code, signal}         PTY 退出事实（恰好一次）
 *   S→C  {t:'error', sid?, m}                  错误
 *   S→C  {t:'sessions', list}                  会话快照（attachable=true 表示前连接已断、可 attach）
 * 省略 sid 时按「该连接唯一会话」路由；连接上存在 0 或多个会话时省略 sid 报错。
 * 旧脚本（spawn 不带 sid）自动兼容：宿主生成 sid，响应帧多带 sid 字段。
 *
 * 断线保活：客户端正常关面板会先逐个 kill 再断开；因此「WS close 且仍有
 * 存活会话」判定为异常断开（刷新/网络抖动），会话转入孤儿状态保活
 * reconnectGraceSec（默认 120s，0 = 旧行为立即结束），等待新连接 attach
 * 并回放 256KB 环形缓冲；到点由回收器清理。
 *
 * M0 探针（scripts/probe.mjs）验证过的三个关键结论：
 *   1. TERM 必须用 `shell -c 'export TERM=...; exec "$shell"'` 包装层注入——
 *     DSH 的 spawnTerminal 硬编码 node-pty name:"dumb"，且 node-pty 里
 *     name 优先于 env.TERM，直接传 env 覆盖无效；
 *   2. resize 通过 (handle).terminal.resize(cols, rows) 透传 node-pty 原生
 *     API（DSH 的 terminal handle 未暴露 resize，属内部耦合，见 README）；
 *   3. terminate() 偶发「幸存者」竞态（SIGTERM→SIGKILL 升级后仍扫描到存活
 *     子进程），必须 best-effort：失败降级为对顶层 shell 直接 SIGKILL。
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { PassThrough } from 'node:stream'
import { StringDecoder } from 'node:string_decoder'
import WebSocket, { WebSocketServer } from 'ws'
// @xterm/headless 是 CJS 包：ESM 具名导入在 Node 运行时会炸（Named export not
// found），必须默认导入后取 Terminal；类型用 InstanceType 别名保持同名可用
import xtermHeadless from '@xterm/headless'
const HeadlessTerminal = xtermHeadless.Terminal
type HeadlessTerminal = InstanceType<typeof HeadlessTerminal>
import { definePlugin } from '@hyzyn/dsh-kit'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { spawnSsh, sshTarget } from './ssh.js'
import type { SshHostEntry, SshSpec, TermHandle } from './ssh.js'

export interface Config {
  /** 关闭整个插件。默认开。 */
  enabled?: boolean
  /** 是否向 agent 注入插件能力公告。默认开。 */
  announceToAgent?: boolean
  /** 并发 PTY 会话上限（1~16）。默认 4。 */
  maxSessions?: number
  /** shell 路径；缺省 $SHELL（macOS 上通常 /bin/zsh）。 */
  shell?: string
  /** TERM 值（经 -c 包装层注入）。默认 xterm-256color。 */
  term?: string
  /** COLORTERM 值。默认 truecolor。 */
  colorTerm?: string
  /** 会话工作目录（客户端 spawn 带 cwd 时优先）；缺省为宿主进程启动目录。 */
  cwd?: string
  /** SSH 连接簿（面板「+」菜单可选；密码/口令支持 env:VAR 引用）。 */
  sshHosts?: SshHostEntry[]
  /** 异常断开后会话保活秒数（0 = 立即结束；默认 120，最大 3600）。 */
  reconnectGraceSec?: number
  /** 已记录的 SSH 主机密钥指纹（TOFU 钉扎，按 host:port 唯一）。 */
  hostKeys?: HostKeyRecord[]
}

/** TOFU 主机指纹记录。 */
export interface HostKeyRecord {
  host: string
  port: number
  /** hostVerifier 收到的原样 sha256 十六进制指纹。 */
  fingerprint: string
}

const SSH_HOST_SCHEMA = z.object({
  name: z.string(),
  host: z.string(),
  port: z.natural().max(65535).default(22),
  username: z.string(),
  auth: z.union([z.const('agent'), z.const('key'), z.const('password')]).default('agent'),
  keyPath: z.string().default(''),
  passphrase: z.string().default(''),
  password: z.string().default(''),
})

const HOST_KEY_SCHEMA = z.object({
  host: z.string(),
  port: z.natural().max(65535).default(22),
  fingerprint: z.string(),
})

/** 与「设置 → 插件 → 终端面板」卡片表单对齐的 schema。 */
const TTY_SETTINGS_SCHEMA = z.object({
  enabled: z.boolean().default(true),
  announceToAgent: z.boolean().default(true),
  maxSessions: z.natural().max(16).default(4),
  shell: z.string().default(''),
  term: z.string().default('xterm-256color'),
  colorTerm: z.string().default('truecolor'),
  cwd: z.string().default(''),
  reconnectGraceSec: z.natural().max(3600).default(120),
  sshHosts: z.array(SSH_HOST_SCHEMA).default([]),
  hostKeys: z.array(HOST_KEY_SCHEMA).default([]),
})

/* ------------------------------------------------------------------ *
 * 常量
 * ------------------------------------------------------------------ */

const WS_PATH = '/api/dsh-tty/ws'
const DEFAULT_MAX_SESSIONS = 4
/** 断线保活默认秒数（reconnectGraceSec；0 = 旧行为，断开立即结束会话）。 */
const DEFAULT_RECONNECT_GRACE_SEC = 120
/** 下行背压阈值（ws.bufferedAmount 字节）。 */
const BACKPRESSURE_HIGH = 512 * 1024
const BACKPRESSURE_LOW = 128 * 1024
const SID_RE = /^[A-Za-z0-9_-]{1,64}$/
const BUFFER_CAP = 256 * 1024
/** TERM/COLORTERM 白名单：防止值里的引号破坏 -c 包装层命令（shellArgv 单引号包裹）。 */
const TERM_RE = /^[A-Za-z0-9_.+-]+$/
/** 孤儿会话回收器的扫描间隔。 */
const REAPER_INTERVAL_MS = 10_000

const TTY_GUIDANCE =
  '本机已安装 dsh-tty 插件（终端面板）：Web GUI 侧边栏的「终端」入口可打开交互终端（xterm.js + PTY），可运行任意命令与 TUI 程序（vim/htop 等），支持多标签页与断线自动重连（刷新页面/网络抖动后会话保活并恢复现场）；新标签默认在当前会话工作目录打开，工作目录可随当前会话切换。标签栏「+」菜单还能开 SSH 标签页（ssh2 原生连接，连接簿在设置卡片维护，主机指纹 TOFU 钉扎），像本地终端一样操作远程主机。长驻进程（dev server、watch、交互式程序）应引导用户到终端面板里运行，不要在 bash 工具里挂起等待；用户提到「开个终端 / 在终端里跑 / SSH 到某台机器」时引导其打开该面板。agent 侧也有配套工具：tty_list 列出活跃终端会话（含 SSH 会话的 target），tty_capture 读取会话近期输出（默认已清洗 ANSI 转义序列，适合读 dev server/NPM 日志），tty_screen 读取当前可见屏幕的渲染结果（可读懂 vim/htop 等 TUI 画面），tty_send 向会话发送按键——操作会实时显示在用户终端里。'

/* ------------------------------------------------------------------ *
 * 类型
 * ------------------------------------------------------------------ */

/** DSH spawnTerminal 返回 handle 的最小形状（含内部耦合的 terminal 字段）。 */
interface PtyHandle {
  pid: number
  output: PassThrough
  write(data: string): Promise<unknown>
  terminate(): Promise<unknown>
  done: Promise<{ exitCode: number | null; signal: string | null }>
  /** 内部耦合：DSH 的 LocalTerminalHandle 未暴露 resize/kill，直接透传 node-pty。 */
  terminal?: {
    resize?(cols: number, rows: number): void
    kill?(signal: string): void
  }
}

/** 本地 PTY 包装成 TermHandle（resize/kill 仍是透传 node-pty 的内部耦合；防御性降级）。 */
function wrapLocalPty(handle: PtyHandle): TermHandle {
  let resizeWarned = false
  return {
    kind: 'local',
    pid: handle.pid,
    output: handle.output,
    done: handle.done,
    write: (data) => handle.write(data),
    resize: (cols, rows) => {
      try {
        handle.terminal?.resize?.(cols, rows)
      } catch (error) {
        // DSH 升级若改内部结构，降级为固定尺寸而不是每帧抛错
        if (!resizeWarned) {
          resizeWarned = true
          console.warn('[dsh-tty] resize 透传失败（DSH 内部结构可能已变化，退化为固定尺寸）: ' + String((error as Error | undefined)?.message ?? error))
        }
      }
    },
    terminate: () => handle.terminate(),
    forceKill: () => {
      try {
        handle.terminal?.kill?.('SIGKILL')
      } catch {
        /* 已退出 */
      }
    },
  }
}

interface TtySession {
  id: string
  handle: TermHandle
  /** 所属 WS 连接；null 表示孤儿状态（前连接异常断开，等待 attach 或回收）。 */
  ws: WebSocket | null
  closed: boolean
  paused: boolean
  /** exit 帧只发一次（kill 主动关闭与 shell 自然退出共用同一回调）。 */
  exitSent?: boolean
  /** agent 工具展示用的元数据。 */
  cwd: string
  kind: 'local' | 'ssh'
  /** SSH 会话的展示目标（user@host[:port]）；本地会话为空串。 */
  target: string
  startedAt: number
  lastOutputAt: number
  /** 输出环形缓冲（尾部 256KB，供 tty_capture 与断线重连回放）。 */
  buffer: string
  /** utf8 分帧兜底：跨 chunk 的多字节序列由 StringDecoder 缓存补齐。 */
  decoder: StringDecoder
  /** 虚拟屏（xterm-headless）：tty_screen 的数据源；创建失败为 null。 */
  screen: HeadlessTerminal | null
  /** 转入孤儿状态的时间戳；null 表示已连接（客户端在线）。 */
  orphanedAt: number | null
}

interface ReqLike {
  method?: string
  headers: Record<string, string | string[] | undefined>
  socket: { remoteAddress?: string }
}

interface SocketLike {
  destroy(): void
}

type WsMessage = Record<string, unknown>

/** TERM/COLORTERM 值白名单校验：不合法回退 fallback（防止破坏 -c 包装层）。 */
function sanitizeTermValue(value: string, fallback: string): string {
  const trimmed = value.trim()
  return TERM_RE.test(trimmed) ? trimmed : fallback
}

/** 可热更新的运行时配置（settings/updated 动态应用）。 */
class LiveConfig {
  shell: string
  term: string
  colorTerm: string
  cwd: string
  /** 异常断开后会话保活毫秒数（0 = 立即结束）。 */
  reconnectGraceMs: number
  sshHosts: SshHostEntry[]
  hostKeys: HostKeyRecord[]

  constructor(init: { shell: string; term: string; colorTerm: string; cwd: string; reconnectGraceSec: number; sshHosts?: SshHostEntry[]; hostKeys?: HostKeyRecord[] }) {
    this.shell = init.shell
    this.term = sanitizeTermValue(init.term, 'xterm-256color')
    this.colorTerm = sanitizeTermValue(init.colorTerm, 'truecolor')
    this.cwd = init.cwd
    this.reconnectGraceMs = Math.max(0, Math.min(3600, init.reconnectGraceSec)) * 1000
    this.sshHosts = init.sshHosts ?? []
    this.hostKeys = init.hostKeys ?? []
  }

  /** 合并部分更新；空字符串/undefined 保持原值；sshHosts/hostKeys 传数组即整体替换。 */
  apply(partial: Partial<{ shell: string; term: string; colorTerm: string; cwd: string; reconnectGraceSec: number; sshHosts: SshHostEntry[]; hostKeys: HostKeyRecord[] }>): void {
    if (typeof partial.shell === 'string' && partial.shell.trim() !== '') this.shell = partial.shell.trim()
    if (typeof partial.term === 'string' && partial.term.trim() !== '') this.term = sanitizeTermValue(partial.term, this.term)
    if (typeof partial.colorTerm === 'string' && partial.colorTerm.trim() !== '') this.colorTerm = sanitizeTermValue(partial.colorTerm, this.colorTerm)
    if (typeof partial.cwd === 'string' && partial.cwd.trim() !== '') this.cwd = partial.cwd.trim()
    if (typeof partial.reconnectGraceSec === 'number' && Number.isInteger(partial.reconnectGraceSec) && partial.reconnectGraceSec >= 0 && partial.reconnectGraceSec <= 3600) {
      this.reconnectGraceMs = partial.reconnectGraceSec * 1000
    }
    if (Array.isArray(partial.sshHosts)) this.sshHosts = partial.sshHosts
    if (Array.isArray(partial.hostKeys)) this.hostKeys = partial.hostKeys
  }

  findSshHost(name: string): SshHostEntry | undefined {
    return this.sshHosts.find((entry) => entry.name === name)
  }
}

/* ------------------------------------------------------------------ *
 * 工具
 * ------------------------------------------------------------------ */

/** best-effort 终止：terminate() 抛「幸存者」竞态时降级为 forceKill（本地 PTY：对顶层 shell 直接 SIGKILL）。 */
async function forceKill(handle: TermHandle): Promise<void> {
  try {
    await handle.terminate()
  } catch {
    try {
      handle.forceKill?.()
    } catch {
      /* 已退出 */
    }
  }
}

/**
 * shell argv。node-pty 的 name 优先于 env.TERM，而 DSH 硬编码 name:"dumb"，
 * 只能在 exec 真正的 shell 之前 export（M0 A2 实测结论）。
 */
function shellArgv(shell: string, term: string, colorTerm: string): string[] {
  return [shell, '-c', `export TERM='${term}'; export COLORTERM='${colorTerm}'; exec "${shell}"`]
}

function send(ws: WebSocket | null, msg: unknown): void {
  if (ws === null || ws.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify(msg))
}

/**
 * tty_capture 的默认清洗：剥离 OSC/CSI/杂项转义序列，并把同行内 \r 覆盖
 * 收敛为最后一次覆盖结果（进度条不再刷屏）。逐行近似，不追求完整 VT 语义
 * （要完整画面用 tty_screen / xterm-headless 虚拟屏）。
 */
function cleanAnsiTail(raw: string): string {
  const withoutOsc = raw.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
  const withoutCsi = withoutOsc.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
  const withoutEsc = withoutCsi.replace(/\x1b[@-Z\\-_]/g, '')
  // 先把「行尾 \r\n」（zsh 行结束常为 \r\r\n）归一成 \n，再按同行覆盖处理
  // 剩余孤立的 \r —— 否则回显/输出行会被误判为覆盖而整行抹掉
  const normalized = withoutEsc.replace(/\r+\n/g, '\n')
  return normalized.split('\n').map((line) => {
    const idx = line.lastIndexOf('\r')
    return idx === -1 ? line : line.slice(idx + 1)
  }).join('\n')
}

/**
 * 宽松清洗一份 sshHosts 输入（settings 存储/热更新事件路径）：
 * 不合法条目直接丢弃；输入不是数组时返回 undefined（表示「未提供，保持原值」）。
 */
function sanitizeSshHosts(input: unknown): SshHostEntry[] | undefined {
  if (!Array.isArray(input)) return undefined
  const out: SshHostEntry[] = []
  for (const item of input) {
    if (typeof item !== 'object' || item === null) continue
    const raw = item as Record<string, unknown>
    if (typeof raw.name !== 'string' || raw.name.trim() === '') continue
    if (typeof raw.host !== 'string' || raw.host.trim() === '') continue
    if (typeof raw.username !== 'string' || raw.username.trim() === '') continue
    const port = Number(raw.port)
    out.push({
      name: raw.name.trim(),
      host: raw.host.trim(),
      port: Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 22,
      username: raw.username.trim(),
      auth: raw.auth === 'key' || raw.auth === 'password' ? raw.auth : 'agent',
      keyPath: typeof raw.keyPath === 'string' ? raw.keyPath : '',
      passphrase: typeof raw.passphrase === 'string' ? raw.passphrase : '',
      password: typeof raw.password === 'string' ? raw.password : '',
    })
  }
  return out
}

/** 严格校验一份 sshHosts 输入（HTTP POST 路径）；返回错误信息或清洗后的数组。 */
function validateSshHosts(input: unknown): { hosts?: SshHostEntry[]; error?: string } {
  if (!Array.isArray(input)) return { error: 'sshHosts 必须是数组' }
  const names = new Set<string>()
  for (const item of input) {
    if (typeof item !== 'object' || item === null) return { error: 'sshHosts 条目必须是对象' }
    const raw = item as Record<string, unknown>
    for (const key of ['name', 'host', 'username'] as const) {
      if (typeof raw[key] !== 'string' || (raw[key] as string).trim() === '') return { error: `sshHosts.${key} 必须是非空字符串` }
    }
    if (names.has((raw.name as string).trim())) return { error: `sshHosts.name 重复: ${String(raw.name)}` }
    names.add((raw.name as string).trim())
    if (raw.port !== undefined) {
      const port = Number(raw.port)
      if (!Number.isInteger(port) || port < 1 || port > 65535) return { error: 'sshHosts.port 必须是 1~65535 的整数' }
    }
    if (raw.auth !== undefined && raw.auth !== 'agent' && raw.auth !== 'key' && raw.auth !== 'password') {
      return { error: 'sshHosts.auth 必须是 agent / key / password' }
    }
    for (const key of ['keyPath', 'passphrase', 'password'] as const) {
      if (raw[key] !== undefined && typeof raw[key] !== 'string') return { error: `sshHosts.${key} 必须是字符串` }
    }
    if ((raw.auth === 'key') && (typeof raw.keyPath !== 'string' || raw.keyPath.trim() === '')) {
      return { error: `sshHosts「${String(raw.name)}」auth=key 需要 keyPath` }
    }
  }
  return { hosts: sanitizeSshHosts(input) }
}

/** 宽松清洗一份 hostKeys 输入；输入不是数组时返回 undefined（表示「未提供，保持原值」）。 */
function sanitizeHostKeys(input: unknown): HostKeyRecord[] | undefined {
  if (!Array.isArray(input)) return undefined
  const out: HostKeyRecord[] = []
  for (const item of input) {
    if (typeof item !== 'object' || item === null) continue
    const raw = item as Record<string, unknown>
    if (typeof raw.host !== 'string' || raw.host.trim() === '') continue
    if (typeof raw.fingerprint !== 'string' || raw.fingerprint.trim() === '' || raw.fingerprint.length > 256) continue
    const port = Number(raw.port)
    out.push({
      host: raw.host.trim().toLowerCase(),
      port: Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 22,
      fingerprint: raw.fingerprint.trim(),
    })
  }
  return out
}

/** 严格校验一份 hostKeys 输入（HTTP POST 路径）；返回错误信息或清洗后的数组。 */
function validateHostKeys(input: unknown): { keys?: HostKeyRecord[]; error?: string } {
  if (!Array.isArray(input)) return { error: 'hostKeys 必须是数组' }
  const seen = new Set<string>()
  for (const item of input) {
    if (typeof item !== 'object' || item === null) return { error: 'hostKeys 条目必须是对象' }
    const raw = item as Record<string, unknown>
    if (typeof raw.host !== 'string' || raw.host.trim() === '') return { error: 'hostKeys.host 必须是非空字符串' }
    if (typeof raw.fingerprint !== 'string' || raw.fingerprint.trim() === '') return { error: 'hostKeys.fingerprint 必须是非空字符串' }
    const port = Number(raw.port ?? 22)
    if (!Number.isInteger(port) || port < 1 || port > 65535) return { error: 'hostKeys.port 必须是 1~65535 的整数' }
    const key = `${raw.host.trim().toLowerCase()}:${port}`
    if (seen.has(key)) return { error: `hostKeys 主机重复: ${key}` }
    seen.add(key)
  }
  return { keys: sanitizeHostKeys(input) }
}

/**
 * TOFU 主机指纹存储：get/record 面向 spawnSsh 的 hostVerifier；
 * record 时经 persist 回调写入 settings（宿主重启后钉扎仍在）。
 */
class HostKeyStore {
  constructor(
    private readonly live: LiveConfig,
    private readonly persist: (records: HostKeyRecord[]) => void,
  ) {}

  private key(host: string, port: number): string {
    return `${host.trim().toLowerCase()}:${port}`
  }

  get(host: string, port: number): string | undefined {
    const key = this.key(host, port)
    return this.live.hostKeys.find((record) => `${record.host}:${record.port}` === key)?.fingerprint
  }

  record(host: string, port: number, fingerprint: string): void {
    const key = this.key(host, port)
    const next = this.live.hostKeys.filter((record) => `${record.host}:${record.port}` !== key)
    next.push({ host: host.trim().toLowerCase(), port, fingerprint })
    this.live.hostKeys = next
    this.persist(next)
  }
}

/** upgrade 路由的 loopback 信任围栏（与 dsh-mcp 的 HTTP 围栏同思路，socket 版）。 */
function isLoopbackUpgrade(req: ReqLike): boolean {
  const address = req.socket.remoteAddress
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false
  const host = req.headers.host
  if (typeof host !== 'string') return false
  let hostUrl: URL
  try {
    hostUrl = new URL('http://' + host)
  } catch {
    return false
  }
  if (hostUrl.hostname !== '127.0.0.1' && hostUrl.hostname !== 'localhost' && hostUrl.hostname !== '[::1]') return false
  if (req.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = req.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------ *
 * 会话管理
 * ------------------------------------------------------------------ */

class SessionManager {
  private readonly sessions = new Map<string, TtySession>()
  private limit: number

  constructor(maxSessions: number) {
    this.limit = maxSessions
  }

  get limitValue(): number {
    return this.limit
  }

  /** 配置热生效时调整上限（1~16）。 */
  setLimit(maxSessions: number): void {
    this.limit = Math.max(1, Math.min(16, maxSessions))
  }

  get count(): number {
    return this.sessions.size
  }

  canSpawn(): boolean {
    return this.sessions.size < this.limit
  }

  add(session: TtySession): void {
    this.sessions.set(session.id, session)
  }

  remove(id: string): void {
    this.sessions.delete(id)
  }

  get(id: string): TtySession | undefined {
    return this.sessions.get(id)
  }

  /** 会话的只读快照（SSH 会话无本地 pid，该字段省略）。 */
  private snapshotOf(session: TtySession): { sid: string; pid?: number; cwd: string; kind: 'local' | 'ssh'; target: string; startedAt: number; lastOutputAt: number } {
    const base = {
      sid: session.id,
      cwd: session.cwd,
      kind: session.kind,
      target: session.target,
      startedAt: session.startedAt,
      lastOutputAt: session.lastOutputAt,
    }
    return session.handle.pid === null ? base : { ...base, pid: session.handle.pid }
  }

  /** agent 工具用的只读快照。 */
  list(): Array<{ sid: string; pid?: number; cwd: string; kind: 'local' | 'ssh'; target: string; startedAt: number; lastOutputAt: number }> {
    return [...this.sessions.values()].map((session) => this.snapshotOf(session))
  }

  /** sessions 帧用：额外带 attachable（孤儿且未关闭的会话可被新连接 attach）。 */
  listForAttach(): Array<{ sid: string; pid?: number; cwd: string; kind: 'local' | 'ssh'; target: string; startedAt: number; lastOutputAt: number; attachable: boolean }> {
    return [...this.sessions.values()].map((session) => ({
      ...this.snapshotOf(session),
      attachable: session.ws === null && !session.closed,
    }))
  }

  /** 释放并销毁会话：kill PTY/channel + 释放虚拟屏（幂等）。 */
  async destroy(session: TtySession): Promise<void> {
    session.closed = true
    this.sessions.delete(session.id)
    try {
      session.screen?.dispose()
    } catch {
      /* 已释放 */
    }
    await forceKill(session.handle)
  }

  /** 回收超过保活期的孤儿会话（回收器定时调用；graceMs<=0 时不动作）。 */
  async reapOrphans(graceMs: number): Promise<void> {
    if (graceMs <= 0) return
    const now = Date.now()
    for (const session of [...this.sessions.values()]) {
      if (session.orphanedAt !== null && now - session.orphanedAt >= graceMs) {
        await this.destroy(session)
      }
    }
  }

  async disposeAll(): Promise<void> {
    const all = [...this.sessions.values()]
    this.sessions.clear()
    await Promise.all(all.map((session) => {
      session.closed = true
      try {
        session.screen?.dispose()
      } catch {
        /* 已释放 */
      }
      return forceKill(session.handle)
    }))
  }
}

/* ------------------------------------------------------------------ *
 * WebSocket 连接处理
 * ------------------------------------------------------------------ */

class TtyServer {
  private readonly wss = new WebSocketServer({ noServer: true })

  constructor(
    private readonly ctx: Context,
    private readonly sessions: SessionManager,
    private readonly options: LiveConfig,
    private readonly hostKeyStore: HostKeyStore,
  ) {
    this.wss.on('connection', (ws) => this.onConnection(ws))
  }

  /** registerUpgrade 的 handler（loopback 围栏 + ws 握手）。 */
  handleUpgrade(req: ReqLike, socket: SocketLike, head: Buffer): void {
    if (!isLoopbackUpgrade(req)) {
      socket.destroy()
      return
    }
    this.wss.handleUpgrade(req as never, socket as never, head, (ws) => {
      this.wss.emit('connection', ws, req)
    })
  }

  private onConnection(ws: WebSocket): void {
    /** 本连接上的会话表（sid → session）；单连接多会话（标签页）。 */
    const local = new Map<string, TtySession>()

    const cleanupAll = async (): Promise<void> => {
      const all = [...local.values()]
      local.clear()
      await Promise.all(all.map(async (session) => {
        if (session.closed) return
        if (this.options.reconnectGraceMs > 0) {
          // 客户端正常关面板会先逐个 kill（会话已移出 local），走到这里的都是
          // 「异常断开仍有存活会话」：转孤儿保活，等待新连接 attach，到点由回收器清理
          session.ws = null
          session.orphanedAt = Date.now()
          return
        }
        await this.sessions.destroy(session)
      }))
    }

    ws.on('message', (raw) => {
      let msg: WsMessage
      try {
        msg = JSON.parse(raw.toString()) as WsMessage
      } catch {
        return
      }
      void this.handleMessage(ws, msg, local, cleanupAll)
    })

    ws.on('close', () => {
      void cleanupAll()
    })
    ws.on('error', (error) => {
      this.ctx.logger.warn('[dsh-tty] ws error: ' + error.message)
    })
  }

  /**
   * 解析帧里的 sid。返回：
   *   { sid }        目标会话；
   *   { unknown }    显式 sid 但本连接无此会话（客户端竞态，如 resize 先于
   *                  spawn 就绪到达；调用方应静默忽略，而不是报错）；
   *   undefined      已发送错误帧（非法 sid / sid 缺省但无法唯一路由）。
   */
  private resolveSid(ws: WebSocket, msg: WsMessage, local: Map<string, TtySession>): { sid: string } | { unknown: true } | undefined {
    const raw = msg.sid
    if (typeof raw === 'string' && raw !== '') {
      if (!SID_RE.test(raw)) {
        send(ws, { t: 'error', m: '非法 sid' })
        return undefined
      }
      if (!local.has(raw)) return { unknown: true }
      return { sid: raw }
    }
    if (local.size === 1) return { sid: [...local.keys()][0] }
    send(ws, { t: 'error', m: local.size === 0 ? '没有可用会话（先发 spawn）' : '存在多个会话，请指定 sid' })
    return undefined
  }

  /** 每会话一块虚拟屏（xterm-headless）：tty_screen 的数据源；失败降级为 null。 */
  private createScreen(cols: number, rows: number): HeadlessTerminal | null {
    try {
      // buffer 命名空间在 xterm 5.x 是提案 API，必须开 allowProposedApi
      return new HeadlessTerminal({ cols, rows, scrollback: 0, allowProposedApi: true })
    } catch {
      return null
    }
  }

  private async handleMessage(
    ws: WebSocket,
    msg: WsMessage,
    local: Map<string, TtySession>,
    cleanupAll: () => Promise<void>,
  ): Promise<void> {
    try {
      if (msg.t === 'spawn') {
        const sid = typeof msg.sid === 'string' && msg.sid !== '' ? msg.sid : randomUUID()
        if (!SID_RE.test(sid)) {
          send(ws, { t: 'error', m: '非法 sid' })
          return
        }
        if (local.has(sid)) {
          send(ws, { t: 'error', sid, m: 'sid 已存在' })
          return
        }
        if (!this.sessions.canSpawn()) {
          send(ws, { t: 'error', sid, m: `会话数已达上限（${this.sessions.limitValue}）` })
          return
        }
        // 客户端（当前会话）cwd 优先；校验存在性，避免 node-pty 抛难懂错误
        const cwd = typeof msg.cwd === 'string' && msg.cwd.trim() !== '' ? msg.cwd.trim() : this.options.cwd
        if (!existsSync(cwd)) {
          send(ws, { t: 'error', sid, m: `cwd 不存在: ${cwd}` })
          return
        }
        const subprocess = (this.ctx as unknown as { get(name: string): { spawnTerminal(spec: unknown): Promise<PtyHandle> } | undefined }).get('subprocess')
        if (subprocess === undefined) {
          send(ws, { t: 'error', sid, m: 'subprocess 服务不可用' })
          return
        }
        const handle = wrapLocalPty(await subprocess.spawnTerminal({
          argv: shellArgv(this.options.shell, this.options.term, this.options.colorTerm),
          rows: Number(msg.rows) || 24,
          cols: Number(msg.cols) || 80,
          cwd,
          env: { TERM: this.options.term, COLORTERM: this.options.colorTerm },
          graceMs: 5000,
        }))
        const next: TtySession = {
          id: sid,
          handle,
          ws,
          closed: false,
          paused: false,
          cwd,
          kind: 'local',
          target: '',
          startedAt: Date.now(),
          lastOutputAt: Date.now(),
          buffer: '',
          decoder: new StringDecoder('utf8'),
          screen: this.createScreen(Number(msg.cols) || 80, Number(msg.rows) || 24),
          orphanedAt: null,
        }
        local.set(sid, next)
        this.sessions.add(next)
        send(ws, { t: 'ready', sid, pid: handle.pid, kind: 'local' })
        this.attachOutput(next)
        this.watchDone(next, local)
      } else if (msg.t === 'ssh') {
        const sid = typeof msg.sid === 'string' && msg.sid !== '' ? msg.sid : randomUUID()
        if (!SID_RE.test(sid)) {
          send(ws, { t: 'error', m: '非法 sid' })
          return
        }
        if (local.has(sid)) {
          send(ws, { t: 'error', sid, m: 'sid 已存在' })
          return
        }
        if (!this.sessions.canSpawn()) {
          send(ws, { t: 'error', sid, m: `会话数已达上限（${this.sessions.limitValue}）` })
          return
        }
        // name 引用连接簿条目作基底，内联字段可逐项覆盖
        const profile = typeof msg.name === 'string' && msg.name !== '' ? this.options.findSshHost(msg.name) : undefined
        if (typeof msg.name === 'string' && msg.name !== '' && profile === undefined) {
          send(ws, { t: 'error', sid, m: `连接簿中不存在: ${msg.name}` })
          return
        }
        const spec: SshSpec = {
          host: typeof msg.host === 'string' && msg.host.trim() !== '' ? msg.host.trim() : profile?.host ?? '',
          port: Number(msg.port) || profile?.port || 22,
          username: typeof msg.username === 'string' && msg.username.trim() !== '' ? msg.username.trim() : profile?.username ?? '',
          auth: msg.auth === 'key' || msg.auth === 'password' || msg.auth === 'agent' ? msg.auth : profile?.auth ?? 'agent',
          keyPath: typeof msg.keyPath === 'string' && msg.keyPath !== '' ? msg.keyPath : profile?.keyPath,
          passphrase: typeof msg.passphrase === 'string' && msg.passphrase !== '' ? msg.passphrase : profile?.passphrase,
          password: typeof msg.password === 'string' && msg.password !== '' ? msg.password : profile?.password,
        }
        if (spec.host === '' || spec.username === '') {
          send(ws, { t: 'error', sid, m: 'SSH 会话需要 host 与 username（或用 name 引用连接簿）' })
          return
        }
        const target = sshTarget(spec)
        send(ws, { t: 'data', sid, d: `\x1b[2mConnecting ${target} …\x1b[0m\r\n` })
        let handle: TermHandle
        try {
          handle = await spawnSsh(spec, {
            term: this.options.term,
            cols: Number(msg.cols) || 80,
            rows: Number(msg.rows) || 24,
            logger: { info: (m) => this.ctx.logger.info(m), warn: (m) => this.ctx.logger.warn(m) },
            hostKeyStore: this.hostKeyStore,
          })
        } catch (error) {
          send(ws, { t: 'error', sid, m: error instanceof Error ? error.message : String(error) })
          return
        }
        const next: TtySession = {
          id: sid,
          handle,
          ws,
          closed: false,
          paused: false,
          cwd: '',
          kind: 'ssh',
          target,
          startedAt: Date.now(),
          lastOutputAt: Date.now(),
          buffer: '',
          decoder: new StringDecoder('utf8'),
          screen: this.createScreen(Number(msg.cols) || 80, Number(msg.rows) || 24),
          orphanedAt: null,
        }
        local.set(sid, next)
        this.sessions.add(next)
        send(ws, { t: 'ready', sid, pid: null, kind: 'ssh', target })
        this.attachOutput(next)
        this.watchDone(next, local)
      } else if (msg.t === 'input') {
        const resolved = this.resolveSid(ws, msg, local)
        if (resolved === undefined || 'unknown' in resolved) return
        const session = local.get(resolved.sid)
        if (session !== undefined) await session.handle.write(String(msg.d ?? ''))
      } else if (msg.t === 'resize') {
        const resolved = this.resolveSid(ws, msg, local)
        if (resolved === undefined || 'unknown' in resolved) return
        const session = local.get(resolved.sid)
        if (session !== undefined) {
          const cols = Number(msg.cols) || 80
          const rows = Number(msg.rows) || 24
          session.handle.resize(cols, rows)
          try {
            session.screen?.resize(cols, rows)
          } catch {
            /* 非法尺寸或已释放 */
          }
        }
      } else if (msg.t === 'kill') {
        const resolved = this.resolveSid(ws, msg, local)
        if (resolved === undefined) return
        if ('unknown' in resolved) {
          // 本连接没有该 sid：若是孤儿会话（前连接已断）也允许 kill，
          // 避免「关闭面板杀不掉孤儿」泄漏到保活期结束
          const orphan = this.sessions.get(String(msg.sid ?? ''))
          if (orphan !== undefined && !orphan.closed) await this.sessions.destroy(orphan)
          return
        }
        const session = local.get(resolved.sid)
        if (session === undefined) return
        local.delete(resolved.sid)
        await this.sessions.destroy(session)
      } else if (msg.t === 'sessions') {
        send(ws, { t: 'sessions', list: this.sessions.listForAttach() })
      } else if (msg.t === 'attach') {
        const raw = msg.sid
        if (typeof raw !== 'string' || raw === '' || !SID_RE.test(raw)) {
          send(ws, { t: 'error', m: 'attach 需要合法 sid' })
          return
        }
        const session = this.sessions.get(raw)
        if (session === undefined || session.closed) {
          send(ws, { t: 'error', sid: raw, m: `会话不存在或已结束: ${raw}` })
          return
        }
        if (session.ws !== null) {
          send(ws, { t: 'error', sid: raw, m: '会话已连接到其它窗口' })
          return
        }
        // 重新绑定到本连接：解孤儿态，恢复被背压暂停的输出流
        session.ws = ws
        session.orphanedAt = null
        local.set(session.id, session)
        if (session.paused) {
          session.paused = false
          try {
            session.handle.output.resume()
          } catch {
            /* 已退出 */
          }
        }
        send(ws, { t: 'ready', sid: session.id, pid: session.handle.pid, kind: session.kind, target: session.target !== '' ? session.target : undefined, reattached: true })
        // 断线期间的输出经 256KB 环形缓冲回放（缓冲为空则跳过）
        if (session.buffer !== '') send(ws, { t: 'data', sid: session.id, d: session.buffer })
      }
    } catch (error) {
      send(ws, { t: 'error', m: error instanceof Error ? error.message : String(error) })
    }
  }

  /** 会话退出事实 → exit 帧（恰好一次；本地 PTY 与 SSH 共用）。 */
  private watchDone(session: TtySession, local: Map<string, TtySession>): void {
    session.handle.done.then((outcome) => {
      // kill 主动关闭时会话可能已被移出 local，用 exitSent 保证 exit 帧恰好一次；
      // 发送走 session.ws 动态取值——attach 换连接后 exit 也能跟着新连接走
      if (session.exitSent === true) return
      session.exitSent = true
      session.closed = true
      local.delete(session.id)
      this.sessions.remove(session.id)
      try {
        session.screen?.dispose()
      } catch {
        /* 已释放 */
      }
      send(session.ws, { t: 'exit', sid: session.id, code: outcome.exitCode, signal: outcome.signal })
    }).catch(() => { /* spawn 级失败已在分支内处理 */ })
  }

  /** 输出下行 + 基于 ws.bufferedAmount 的背压（暂停/恢复 PassThrough）。 */
  private attachOutput(session: TtySession): void {
    const output = session.handle.output
    const onData = (chunk: Buffer) => {
      if (session.closed) return
      // StringDecoder 兜跨 chunk 多字节序列，再喂虚拟屏与环形缓冲
      const text = session.decoder.write(chunk)
      session.lastOutputAt = Date.now()
      session.buffer = (session.buffer + text).slice(-BUFFER_CAP)
      try {
        session.screen?.write(text)
      } catch {
        /* 虚拟屏异常不阻断输出链路 */
      }
      const ws = session.ws
      if (ws === null) return // 孤儿会话：仅积累缓冲，等待重连 attach 回放
      const sid = session.id
      ws.send(JSON.stringify({ t: 'data', sid, d: text }), () => {
        if (session.paused && ws.bufferedAmount < BACKPRESSURE_LOW && output.readableFlowing === false) {
          output.resume()
        }
      })
      if (!session.paused && ws.bufferedAmount > BACKPRESSURE_HIGH) {
        session.paused = true
        output.pause()
      }
    }
    output.on('data', onData)
  }

  close(): void {
    for (const client of this.wss.clients) {
      try {
        client.close()
      } catch {
        /* 已关闭 */
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * 插件本体
 * ------------------------------------------------------------------ */

/** HTTP 路由的 loopback 信任围栏（与 dsh-mcp 同思路）。 */
function isLoopbackHttp(req: ReqLike): boolean {
  const address = req.socket.remoteAddress
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false
  const host = req.headers.host
  if (typeof host !== 'string') return false
  let hostUrl: URL
  try {
    hostUrl = new URL('http://' + host)
  } catch {
    return false
  }
  if (hostUrl.hostname !== '127.0.0.1' && hostUrl.hostname !== 'localhost' && hostUrl.hostname !== '[::1]') return false
  if (req.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = req.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

interface ResLike {
  writeHead(status: number, headers?: Record<string, string>): void
  end(body?: string): void
}

function writeJson(res: ResLike, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'referrer-policy': 'no-referrer' })
  res.end(JSON.stringify(body))
}

async function readJsonBody(req: ReqLike & AsyncIterable<Uint8Array>): Promise<Record<string, unknown> | undefined> {
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for await (const chunk of req) {
      size += chunk.length
      if (size > 512 * 1024) return undefined
      chunks.push(chunk)
    }
  } catch {
    return undefined
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

/** 设置卡片展示的当前有效配置快照。 */
interface ConfigSnapshot {
  enabled: boolean
  announceToAgent: boolean
  maxSessions: number
  shell: string
  term: string
  colorTerm: string
  cwd: string
  reconnectGraceSec: number
  sshHosts: SshHostEntry[]
  hostKeys: HostKeyRecord[]
  /** agent 工具（tty_list / tty_capture / tty_screen / tty_send）是否已注册到 harness。 */
  toolsRegistered: boolean
}

const plugin = definePlugin<Config>({
  name: 'tty',
  // 声明 inject：tools 服务只有声明式 inject 才能解析（动态 ctx.inject/ctx.get
  // 均拿不到，实测 mcp-client 同款模式），声明后 ctx.get('tools') 才能取到。
  inject: ['tools'],
  apply(ctx: Context, config?: Config) {
    if (config?.enabled === false) return
    const live = new LiveConfig({
      shell: config?.shell?.trim() || process.env.SHELL || '/bin/zsh',
      term: config?.term?.trim() || 'xterm-256color',
      colorTerm: config?.colorTerm?.trim() || 'truecolor',
      cwd: config?.cwd?.trim() || process.cwd(),
      reconnectGraceSec: typeof config?.reconnectGraceSec === 'number' && Number.isInteger(config.reconnectGraceSec) && config.reconnectGraceSec >= 0 ? config.reconnectGraceSec : DEFAULT_RECONNECT_GRACE_SEC,
      sshHosts: Array.isArray(config?.sshHosts) ? config.sshHosts : [],
      hostKeys: Array.isArray(config?.hostKeys) ? config.hostKeys : [],
    })
    const sessions = new SessionManager(config?.maxSessions ?? DEFAULT_MAX_SESSIONS)
    /** TOFU 指纹记录持久化：写入 settings 命名空间（合并语义），失败不影响连接。 */
    const persistHostKeys = (records: HostKeyRecord[]): void => {
      const scope = settingsScope
      if (scope === undefined) return
      void Promise.resolve(scope.update({ hostKeys: records })).catch((error: unknown) => {
        console.warn('[dsh-tty] 主机密钥记录持久化失败: ' + (error instanceof Error ? error.message : String(error)))
      })
    }
    const hostKeyStore = new HostKeyStore(live, persistHostKeys)
    const server = new TtyServer(ctx, sessions, live, hostKeyStore)
    const stateRef = { enabled: true, announceToAgent: config?.announceToAgent !== false, toolsRegistered: false }
    let settingsScope: { get(): Record<string, unknown>; update(patch: Record<string, unknown>): Promise<unknown> } | undefined

    const snapshot = (): ConfigSnapshot => ({
      enabled: stateRef.enabled,
      announceToAgent: stateRef.announceToAgent,
      maxSessions: sessions.limitValue,
      shell: live.shell,
      term: live.term,
      colorTerm: live.colorTerm,
      cwd: live.cwd,
      reconnectGraceSec: Math.round(live.reconnectGraceMs / 1000),
      sshHosts: live.sshHosts,
      hostKeys: live.hostKeys,
      toolsRegistered: stateRef.toolsRegistered,
    })

    /** 规范化并应用一份配置补丁（settings/updated 事件与 HTTP POST 共用；幂等）。 */
    const applyPatch = (section: Record<string, unknown>): void => {
      live.apply({
        shell: typeof section.shell === 'string' ? section.shell : undefined,
        term: typeof section.term === 'string' ? section.term : undefined,
        colorTerm: typeof section.colorTerm === 'string' ? section.colorTerm : undefined,
        cwd: typeof section.cwd === 'string' ? section.cwd : undefined,
        reconnectGraceSec: typeof section.reconnectGraceSec === 'number' ? section.reconnectGraceSec : undefined,
        sshHosts: sanitizeSshHosts(section.sshHosts),
        hostKeys: sanitizeHostKeys(section.hostKeys),
      })
      if (typeof section.maxSessions === 'number' && Number.isInteger(section.maxSessions) && section.maxSessions >= 1 && section.maxSessions <= 16) {
        sessions.setLimit(section.maxSessions)
      }
      if (typeof section.enabled === 'boolean') stateRef.enabled = section.enabled
      if (typeof section.announceToAgent === 'boolean') stateRef.announceToAgent = section.announceToAgent
      console.log(`[dsh-tty] config applied (shell=${live.shell}, term=${live.term}, cwd=${live.cwd}, maxSessions=${sessions.limitValue}, sshHosts=${live.sshHosts.length})`)
    }

    /** 校验 HTTP POST 的配置体；返回规范化补丁或错误信息。 */
    const normalizePatch = (input: Record<string, unknown>): { patch?: Record<string, unknown>; error?: string } => {
      const patch: Record<string, unknown> = {}
      const known = new Set(['enabled', 'announceToAgent', 'maxSessions', 'shell', 'term', 'colorTerm', 'cwd', 'reconnectGraceSec', 'sshHosts', 'hostKeys'])
      for (const key of Object.keys(input)) {
        if (!known.has(key)) return { error: '未知配置项: ' + key }
      }
      if (input.enabled !== undefined) {
        if (typeof input.enabled !== 'boolean') return { error: 'enabled 必须是布尔值' }
        patch.enabled = input.enabled
      }
      if (input.announceToAgent !== undefined) {
        if (typeof input.announceToAgent !== 'boolean') return { error: 'announceToAgent 必须是布尔值' }
        patch.announceToAgent = input.announceToAgent
      }
      if (input.maxSessions !== undefined) {
        const value = Number(input.maxSessions)
        if (!Number.isInteger(value) || value < 1 || value > 16) return { error: 'maxSessions 必须是 1~16 的整数' }
        patch.maxSessions = value
      }
      if (input.reconnectGraceSec !== undefined) {
        const value = Number(input.reconnectGraceSec)
        if (!Number.isInteger(value) || value < 0 || value > 3600) return { error: 'reconnectGraceSec 必须是 0~3600 的整数' }
        patch.reconnectGraceSec = value
      }
      for (const key of ['shell', 'term', 'colorTerm'] as const) {
        if (input[key] === undefined) continue
        if (typeof input[key] !== 'string') return { error: key + ' 必须是字符串' }
        if ((input[key] as string).trim() !== '') patch[key] = (input[key] as string).trim()
      }
      if (input.cwd !== undefined) {
        if (typeof input.cwd !== 'string') return { error: 'cwd 必须是字符串' }
        const cwd = input.cwd.trim()
        if (cwd !== '') {
          if (!existsSync(cwd)) return { error: 'cwd 不存在: ' + cwd }
          patch.cwd = cwd
        }
      }
      if (input.sshHosts !== undefined) {
        const validated = validateSshHosts(input.sshHosts)
        if (validated.error !== undefined) return { error: validated.error }
        patch.sshHosts = validated.hosts
      }
      if (input.hostKeys !== undefined) {
        const validated = validateHostKeys(input.hostKeys)
        if (validated.error !== undefined) return { error: validated.error }
        patch.hostKeys = validated.keys
      }
      return { patch }
    }

    // webServer：WS upgrade 路由 + 配置读写路由（/api/dsh-tty/config）
    ctx.inject(['webServer'], (webCtx: Context) => {
      webCtx.effect(() => {
        const webServer = (webCtx as unknown as {
          webServer: {
            registerUpgrade(route: unknown): () => void
            register(route: unknown): () => void
          }
        }).webServer
        const disposers: Array<() => void> = []
        disposers.push(webServer.registerUpgrade({
          path: WS_PATH,
          handler: (req: ReqLike, socket: SocketLike, head: Buffer) => server.handleUpgrade(req, socket, head),
        }))
        disposers.push(webServer.register({
          kind: 'exact',
          path: '/api/dsh-tty/config',
          handler: async (req: ReqLike & AsyncIterable<Uint8Array>, res: ResLike) => {
            if (!isLoopbackHttp(req)) {
              writeJson(res, 403, { error: 'forbidden: loopback-only' })
              return
            }
            if (req.method === 'GET') {
              writeJson(res, 200, { ok: true, config: snapshot() })
              return
            }
            if (req.method !== 'POST') {
              writeJson(res, 405, { error: 'method not allowed: ' + String(req.method) })
              return
            }
            const body = await readJsonBody(req)
            if (body === undefined) {
              writeJson(res, 400, { error: 'invalid JSON body' })
              return
            }
            const normalized = normalizePatch(body)
            if (normalized.error !== undefined) {
              writeJson(res, 400, { error: normalized.error })
              return
            }
            const patch = normalized.patch ?? {}
            const scope = settingsScope
            if (scope !== undefined) {
              try {
                // 官方持久化通道：写入 settings 命名空间（dsh-settings-file），
                // 成功后触发 settings/updated → applyPatch 热应用
                await scope.update(patch)
              } catch (error) {
                writeJson(res, 500, { error: '保存配置失败: ' + (error instanceof Error ? error.message : String(error)) })
                return
              }
            }
            // 无 settings 服务（或 stub）时直接应用；有服务时也再应用一次（幂等）
            applyPatch(patch)
            writeJson(res, 200, { ok: true, config: snapshot() })
          },
        }))
        return () => {
          server.close()
          for (const dispose of disposers) {
            try {
              dispose()
            } catch {
              /* 路由已释放 */
            }
          }
        }
      }, 'dsh-tty: web routes')
    })

    // settings 命名空间：注册 + 启动合并持久化值 + settings/updated 热应用
    ctx.inject(['settings'], (settingsCtx: Context) => {
      settingsCtx.effect(() => {
        const settings = (settingsCtx as unknown as {
          settings: { register(ns: string, schema: unknown): { get(): Record<string, unknown>; update(patch: Record<string, unknown>): Promise<unknown> } }
        }).settings
        const scope = settings.register('tty', TTY_SETTINGS_SCHEMA)
        settingsScope = scope
        // 启动合并：字符串字段非空才覆盖；maxSessions/布尔用「非默认值才覆盖」启发式
        //（schema 默认值会混入 resolved，无法区分「显式保存的 4」与「从未保存」）。
        const stored = scope.get()
        const startup: Record<string, unknown> = {}
        if (typeof stored.shell === 'string' && stored.shell.trim() !== '') startup.shell = stored.shell
        if (typeof stored.term === 'string' && stored.term.trim() !== '') startup.term = stored.term
        if (typeof stored.colorTerm === 'string' && stored.colorTerm.trim() !== '') startup.colorTerm = stored.colorTerm
        if (typeof stored.cwd === 'string' && stored.cwd.trim() !== '') startup.cwd = stored.cwd
        if (stored.maxSessions !== 4 && typeof stored.maxSessions === 'number') startup.maxSessions = stored.maxSessions
        if (stored.enabled === false) startup.enabled = false
        if (stored.announceToAgent === false) startup.announceToAgent = false
        if (stored.reconnectGraceSec !== 120 && typeof stored.reconnectGraceSec === 'number' && Number.isInteger(stored.reconnectGraceSec) && stored.reconnectGraceSec >= 0 && stored.reconnectGraceSec <= 3600) {
          startup.reconnectGraceSec = stored.reconnectGraceSec
        }
        const storedHosts = sanitizeSshHosts(stored.sshHosts)
        if (storedHosts !== undefined && storedHosts.length > 0) startup.sshHosts = storedHosts
        const storedKeys = sanitizeHostKeys(stored.hostKeys)
        if (storedKeys !== undefined && storedKeys.length > 0) startup.hostKeys = storedKeys
        if (Object.keys(startup).length > 0) applyPatch(startup)
        const events = settingsCtx as unknown as { events: { on(name: string, listener: (...args: unknown[]) => void): () => void } }
        const off = events.events.on('settings/updated', (ns: unknown, next: unknown) => {
          if (ns !== 'tty' || typeof next !== 'object' || next === null) return
          applyPatch(next as Record<string, unknown>)
        })
        return () => {
          off()
          settingsScope = undefined
        }
      }, 'dsh-tty: settings')
    })

    // agent 工具集（P1）：tty_list / tty_capture / tty_send。
    // 信任模型：与 bash 工具同权（agent 本就能执行任意命令），不额外加确认层；
    // agent 对终端的操作会实时出现在浏览器面板里（同一 PTY），天然可被用户观察。
    // inject: ['tools'] 声明后（见上方），ctx.get('tools') 才能解析到服务。
    const toolsHost = (ctx as unknown as { get(name: string): { register(definition: unknown): () => void } | undefined }).get('tools')
    if (toolsHost !== undefined) {
      ctx.effect(() => {
        const tools = toolsHost
        const tailLines = (session: TtySession, lines: number): string => {
          const parts = session.buffer.split('\n')
          return parts.slice(-(lines + 1)).join('\n').replace(/^\n+/, '')
        }
        const disposers: Array<() => void> = []
        disposers.push(tools.register(defineTool({
          name: 'tty_list',
          description: '列出当前活跃的终端面板会话（sid / kind(local|ssh) / target / pid / cwd / 创建与最后活动时间）。用户开了终端面板后，用 tty_capture 读取某个 sid 的终端输出，用 tty_send 向该终端发送按键。',
          parameters: {},
          output: {
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                sessions: {
                  type: 'array',
                  required: true,
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      sid: { type: 'string', required: true },
                      kind: { type: 'string', required: true },
                      target: { type: 'string', required: true },
                      pid: { type: 'number' },
                      cwd: { type: 'string', required: true },
                      startedAt: { type: 'number', required: true },
                      lastOutputAt: { type: 'number', required: true },
                    },
                  },
                },
              },
            },
            render: (_args: unknown, value: unknown) => {
              const sessions = (value as { sessions?: Array<{ sid: string; pid?: number; cwd: string; kind: 'local' | 'ssh'; target: string; startedAt: number; lastOutputAt: number }> })?.sessions ?? []
              const text = sessions.length === 0
                ? '当前没有活跃的终端面板会话（请引导用户先打开终端面板，或用户尚未打开）'
                : '终端面板会话：' + sessions.map((s) => {
                    const where = s.kind === 'ssh' ? `ssh ${s.target}` : `pid=${String(s.pid ?? '?')} cwd=${s.cwd}`
                    return `\n- sid=${s.sid} [${s.kind}] ${where} (启动于 ${new Date(s.startedAt).toLocaleString()})`
                  }).join('')
              return [{ type: 'text', text }]
            },
          },
          async execute(): Promise<{ sessions: ReturnType<SessionManager['list']> }> {
            return { sessions: sessions.list() }
          },
        })))
        disposers.push(tools.register(defineTool({
          name: 'tty_capture',
          description: '读取某个终端面板会话（tty_list 提供 sid）的近期输出（默认尾部 60 行，最多 500 行；默认已剥离 ANSI 转义序列并收敛同行覆盖，返回纯文本）。适合查看用户终端里正在运行的 dev server / watch / 构建输出；要看 TUI 程序的当前画面用 tty_screen。',
          parameters: {
            sid: { type: 'string', required: true, description: '会话 id（来自 tty_list）' },
            lines: { type: 'number', description: '读取尾部行数（1~500，默认 60）' },
            raw: { type: 'boolean', description: 'true 返回含 ANSI 转义序列的原始输出（默认 false 清洗为纯文本）' },
          },
          output: {
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                sid: { type: 'string', required: true },
                tail: { type: 'string', required: true },
              },
            },
            render: (_args: unknown, value: unknown) => {
              const v = value as { sid?: string; tail?: string }
              return [{ type: 'text', text: `终端会话 ${v.sid ?? '?'} 尾部输出：\n\n${v.tail ?? ''}` }]
            },
          },
          async execute(args: unknown): Promise<{ sid: string; tail: string }> {
            const input = args as { sid?: unknown; lines?: unknown; raw?: unknown }
            if (typeof input.sid !== 'string' || input.sid === '') throw new Error('sid 必须是非空字符串')
            const lines = Math.max(1, Math.min(500, typeof input.lines === 'number' && Number.isInteger(input.lines) && input.lines >= 1 ? input.lines : 60))
            const session = sessions.get(input.sid)
            if (session === undefined || session.closed) throw new Error(`会话不存在或已退出: ${input.sid}`)
            const rawTail = tailLines(session, lines)
            return { sid: input.sid, tail: input.raw === true ? rawTail : cleanAnsiTail(rawTail) }
          },
        })))
        disposers.push(tools.register(defineTool({
          name: 'tty_screen',
          description: '读取某个终端面板会话（tty_list 提供 sid）当前可见屏幕的渲染结果（纯文本，等价于用户此刻看到的画面）。适合查看全屏交互程序（vim / htop / 菜单选择）的当前界面状态；要历史滚动输出用 tty_capture。',
          parameters: {
            sid: { type: 'string', required: true, description: '会话 id（来自 tty_list）' },
          },
          output: {
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                sid: { type: 'string', required: true },
                cols: { type: 'number', required: true },
                rows: { type: 'number', required: true },
                text: { type: 'string', required: true },
              },
            },
            render: (_args: unknown, value: unknown) => {
              const v = value as { sid?: string; cols?: number; rows?: number; text?: string }
              return [{ type: 'text', text: `终端会话 ${v.sid ?? '?'} 当前屏幕（${String(v.cols ?? '?')}×${String(v.rows ?? '?')}）：\n\n${v.text ?? ''}` }]
            },
          },
          async execute(args: unknown): Promise<{ sid: string; cols: number; rows: number; text: string }> {
            const input = args as { sid?: unknown }
            if (typeof input.sid !== 'string' || input.sid === '') throw new Error('sid 必须是非空字符串')
            const session = sessions.get(input.sid)
            if (session === undefined || session.closed) throw new Error(`会话不存在或已退出: ${input.sid}`)
            const screen = session.screen
            if (screen === null) throw new Error(`虚拟屏不可用: ${input.sid}`)
            const buffer = screen.buffer.active
            const lines: string[] = []
            for (let row = 0; row < screen.rows; row++) {
              lines.push(buffer.getLine(row)?.translateToString(true) ?? '')
            }
            while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
            return { sid: input.sid, cols: screen.cols, rows: screen.rows, text: lines.join('\n').slice(0, 32 * 1024) }
          },
        })))
        disposers.push(tools.register(defineTool({
          name: 'tty_send',
          description: '向某个终端面板会话（tty_list 提供 sid）的 PTY 发送按键/文本（命令以 \\n 结尾）。适合给用户终端里运行的程序发交互输入（如 dev server 的 q 键、menu 选择、回答提示）。操作会实时显示在用户的终端面板里。',
          parameters: {
            sid: { type: 'string', required: true, description: '会话 id（来自 tty_list）' },
            data: { type: 'string', required: true, description: '要发送的文本（含换行则直接发送命令）' },
          },
          output: {
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                ok: { type: 'boolean', required: true },
                sent: { type: 'number', required: true },
              },
            },
            render: (_args: unknown, value: unknown) => {
              const v = value as { sent?: number }
              return [{ type: 'text', text: `已向终端会话发送 ${v.sent ?? 0} 个字符` }]
            },
          },
          async execute(args: unknown): Promise<{ ok: boolean; sent: number }> {
            const input = args as { sid?: unknown; data?: unknown }
            if (typeof input.sid !== 'string' || input.sid === '') throw new Error('sid 必须是非空字符串')
            if (typeof input.data !== 'string' || input.data === '') throw new Error('data 必须是非空字符串')
            const session = sessions.get(input.sid)
            if (session === undefined || session.closed) throw new Error(`会话不存在或已退出: ${input.sid}`)
            await session.handle.write(input.data)
            return { ok: true, sent: input.data.length }
          },
        })))
        stateRef.toolsRegistered = true
        console.log('[dsh-tty] agent tools registered (tty_list, tty_capture, tty_screen, tty_send)')
        return () => {
          stateRef.toolsRegistered = false
          for (const dispose of disposers) {
            try {
              dispose()
            } catch {
              /* 工具已注销 */
            }
          }
        }
      }, 'dsh-tty: agent tools')
    } else {
      console.log('[dsh-tty] tools service unavailable; agent tools skipped')
    }

    // 向 agent 公告终端面板能力
    if (config?.announceToAgent !== false) {
      ctx.inject(['systemPrompt'], (promptCtx: Context) => {
        promptCtx.effect(() => {
          const systemPrompt = (promptCtx as unknown as { systemPrompt: { section(options: { name: string; order?: number; text: string }): () => void } }).systemPrompt
          return systemPrompt.section({ name: 'plugin:dsh-tty', order: 150, text: TTY_GUIDANCE })
        }, 'dsh-tty: announcement')
      })
    }

    // 孤儿会话回收器：超过保活期的异常断开会话定期清理（grace=0 时为 no-op，
    // 断开时立即结束）；插件卸载时随 effect 一起停掉
    const reaperTimer = setInterval(() => {
      void sessions.reapOrphans(live.reconnectGraceMs)
    }, REAPER_INTERVAL_MS)
    reaperTimer.unref?.()
    ctx.effect(() => () => clearInterval(reaperTimer), 'dsh-tty: orphan reaper')

    // 插件卸载时回收全部会话
    ctx.effect(() => {
      return () => {
        void sessions.disposeAll()
      }
    }, 'dsh-tty: session cleanup')

    console.log(`[dsh-tty] mounted (shell=${live.shell}, term=${live.term}, cwd=${live.cwd}, maxSessions=${sessions.limitValue})`)
  },
})

export const { name, inject, apply } = plugin
