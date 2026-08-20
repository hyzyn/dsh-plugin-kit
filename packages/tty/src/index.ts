/**
 * @hyzyn/dsh-tty — DSH Web GUI 的终端面板插件（宿主半体）。
 *
 * 机制：浏览器半体打开「终端」大弹窗后，经 WebSocket 连接
 * /api/dsh-tty/ws（webServer.registerUpgrade 注册的 upgrade 路由），
 * spawn 帧创建真实 PTY 会话（ctx.subprocess.spawnTerminal，node-pty），
 * 之后双向透传：input/resize/kill 上行，data/exit/error 下行。
 *
 * 帧协议 v2（JSON 文本帧；sid 维度支持单连接多会话/标签页）：
 *   C→S  {t:'spawn', sid?, cols?, rows?, cwd?}  创建会话；sid 缺省时宿主生成
 *   C→S  {t:'input', sid?, d}                  按键/粘贴数据
 *   C→S  {t:'resize', sid?, cols, rows}        xterm fit 触发
 *   C→S  {t:'kill', sid?}                      关闭会话
 *   S→C  {t:'ready', sid, pid}                 会话就绪
 *   S→C  {t:'data', sid, d}                    终端输出（utf8 文本）
 *   S→C  {t:'exit', sid, code, signal}         PTY 退出事实（恰好一次）
 *   S→C  {t:'error', sid?, m}                  错误
 * 省略 sid 时按「该连接唯一会话」路由；连接上存在 0 或多个会话时省略 sid 报错。
 * 旧脚本（spawn 不带 sid）自动兼容：宿主生成 sid，响应帧多带 sid 字段。
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
import WebSocket, { WebSocketServer } from 'ws'
import { definePlugin } from '@hyzyn/dsh-kit'

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
}

/** 与「设置 → 插件 → 终端面板」卡片表单对齐的 schema。 */
const TTY_SETTINGS_SCHEMA = z.object({
  enabled: z.boolean().default(true),
  announceToAgent: z.boolean().default(true),
  maxSessions: z.natural().max(16).default(4),
  shell: z.string().default(''),
  term: z.string().default('xterm-256color'),
  colorTerm: z.string().default('truecolor'),
  cwd: z.string().default(''),
})

/* ------------------------------------------------------------------ *
 * 常量
 * ------------------------------------------------------------------ */

const WS_PATH = '/api/dsh-tty/ws'
const DEFAULT_MAX_SESSIONS = 4
/** 下行背压阈值（ws.bufferedAmount 字节）。 */
const BACKPRESSURE_HIGH = 512 * 1024
const BACKPRESSURE_LOW = 128 * 1024
const SID_RE = /^[A-Za-z0-9_-]{1,64}$/

const TTY_GUIDANCE =
  '本机已安装 dsh-tty 插件（终端面板）：Web GUI 侧边栏的「终端」入口可打开交互终端（xterm.js + PTY），可运行任意命令与 TUI 程序（vim/htop 等），支持多标签页；新标签默认在当前会话工作目录打开，工作目录可随当前会话切换。长驻进程（dev server、watch、交互式程序）应引导用户到终端面板里运行，不要在 bash 工具里挂起等待；用户提到「开个终端 / 在终端里跑」时引导其打开该面板。'

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
  terminal: {
    resize(cols: number, rows: number): void
    kill(signal: string): void
  }
}

interface TtySession {
  id: string
  handle: PtyHandle
  ws: WebSocket
  closed: boolean
  paused: boolean
  /** exit 帧只发一次（kill 主动关闭与 shell 自然退出共用同一回调）。 */
  exitSent?: boolean
}

interface ReqLike {
  headers: Record<string, string | string[] | undefined>
  socket: { remoteAddress?: string }
}

interface SocketLike {
  destroy(): void
}

type WsMessage = Record<string, unknown>

/** 可热更新的运行时配置（settings/updated 动态应用）。 */
class LiveConfig {
  shell: string
  term: string
  colorTerm: string
  cwd: string

  constructor(init: { shell: string; term: string; colorTerm: string; cwd: string }) {
    this.shell = init.shell
    this.term = init.term
    this.colorTerm = init.colorTerm
    this.cwd = init.cwd
  }

  /** 合并部分更新；空字符串/undefined 保持原值。 */
  apply(partial: Partial<{ shell: string; term: string; colorTerm: string; cwd: string }>): void {
    if (typeof partial.shell === 'string' && partial.shell.trim() !== '') this.shell = partial.shell.trim()
    if (typeof partial.term === 'string' && partial.term.trim() !== '') this.term = partial.term.trim()
    if (typeof partial.colorTerm === 'string' && partial.colorTerm.trim() !== '') this.colorTerm = partial.colorTerm.trim()
    if (typeof partial.cwd === 'string' && partial.cwd.trim() !== '') this.cwd = partial.cwd.trim()
  }
}

/* ------------------------------------------------------------------ *
 * 工具
 * ------------------------------------------------------------------ */

/** best-effort 终止：terminate() 抛「幸存者」竞态时降级为对顶层 shell 直接 SIGKILL。 */
async function forceKill(handle: PtyHandle): Promise<void> {
  try {
    await handle.terminate()
  } catch {
    try {
      handle.terminal.kill('SIGKILL')
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

function send(ws: WebSocket, msg: unknown): void {
  if (ws.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify(msg))
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

  async disposeAll(): Promise<void> {
    const all = [...this.sessions.values()]
    this.sessions.clear()
    await Promise.all(all.map((session) => forceKill(session.handle)))
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
        session.closed = true
        this.sessions.remove(session.id)
        await forceKill(session.handle)
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
        const handle = await subprocess.spawnTerminal({
          argv: shellArgv(this.options.shell, this.options.term, this.options.colorTerm),
          rows: Number(msg.rows) || 24,
          cols: Number(msg.cols) || 80,
          cwd,
          env: { TERM: this.options.term, COLORTERM: this.options.colorTerm },
          graceMs: 5000,
        })
        const next: TtySession = { id: sid, handle, ws, closed: false, paused: false }
        local.set(sid, next)
        this.sessions.add(next)
        send(ws, { t: 'ready', sid, pid: handle.pid })
        this.attachOutput(next)
        handle.done.then((outcome) => {
          // kill 主动关闭时会话可能已被移出 local，用 exitSent 保证 exit 帧恰好一次
          if (next.exitSent === true) return
          next.exitSent = true
          next.closed = true
          local.delete(sid)
          this.sessions.remove(sid)
          send(ws, { t: 'exit', sid, code: outcome.exitCode, signal: outcome.signal })
        }).catch(() => { /* spawn 级失败已在 try 中处理 */ })
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
          session.handle.terminal.resize(Number(msg.cols) || 80, Number(msg.rows) || 24)
        }
      } else if (msg.t === 'kill') {
        const resolved = this.resolveSid(ws, msg, local)
        if (resolved === undefined || 'unknown' in resolved) return
        const session = local.get(resolved.sid)
        if (session === undefined) return
        session.closed = true
        local.delete(resolved.sid)
        this.sessions.remove(resolved.sid)
        await forceKill(session.handle)
      }
    } catch (error) {
      send(ws, { t: 'error', m: error instanceof Error ? error.message : String(error) })
    }
  }

  /** 输出下行 + 基于 ws.bufferedAmount 的背压（暂停/恢复 PassThrough）。 */
  private attachOutput(session: TtySession): void {
    const output = session.handle.output
    const onData = (chunk: Buffer) => {
      if (session.closed) return
      const text = chunk.toString('utf8')
      const ws = session.ws
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

const plugin = definePlugin<Config>({
  name: 'tty',
  inject: [],
  apply(ctx: Context, config?: Config) {
    if (config?.enabled === false) return
    const live = new LiveConfig({
      shell: config?.shell?.trim() || process.env.SHELL || '/bin/zsh',
      term: config?.term?.trim() || 'xterm-256color',
      colorTerm: config?.colorTerm?.trim() || 'truecolor',
      cwd: config?.cwd?.trim() || process.cwd(),
    })
    const sessions = new SessionManager(config?.maxSessions ?? DEFAULT_MAX_SESSIONS)
    const server = new TtyServer(ctx, sessions, live)

    // upgrade 路由（/api/dsh-tty/ws）
    ctx.inject(['webServer'], (webCtx: Context) => {
      webCtx.effect(() => {
        const webServer = (webCtx as unknown as { webServer: { registerUpgrade(route: unknown): () => void } }).webServer
        const dispose = webServer.registerUpgrade({
          path: WS_PATH,
          handler: (req: ReqLike, socket: SocketLike, head: Buffer) => server.handleUpgrade(req, socket, head),
        })
        return () => {
          server.close()
          try {
            dispose()
          } catch {
            /* 路由已释放 */
          }
        }
      }, 'dsh-tty: upgrade route')
    })

    // settings 命名空间 + 配置热生效：settings/updated 事件（dsh-settings 提交事件，
    // 监听器签名 (ns, next, prev, source)）动态应用 shell/term/colorTerm/cwd/maxSessions
    ctx.inject(['settings'], (settingsCtx: Context) => {
      settingsCtx.effect(() => {
        const settings = (settingsCtx as unknown as { settings: { register(ns: string, schema: unknown): unknown } }).settings
        settings.register('tty', TTY_SETTINGS_SCHEMA)
        const events = settingsCtx as unknown as { events: { on(name: string, listener: (...args: unknown[]) => void): () => void } }
        const off = events.events.on('settings/updated', (ns: unknown, next: unknown) => {
          if (ns !== 'tty' || typeof next !== 'object' || next === null) return
          const section = next as Record<string, unknown>
          live.apply({
            shell: typeof section.shell === 'string' ? section.shell : undefined,
            term: typeof section.term === 'string' ? section.term : undefined,
            colorTerm: typeof section.colorTerm === 'string' ? section.colorTerm : undefined,
            cwd: typeof section.cwd === 'string' ? section.cwd : undefined,
          })
          if (typeof section.maxSessions === 'number' && Number.isInteger(section.maxSessions) && section.maxSessions >= 1) {
            sessions.setLimit(section.maxSessions)
          }
          console.log(`[dsh-tty] config hot-applied (shell=${live.shell}, term=${live.term}, cwd=${live.cwd}, maxSessions=${sessions.limitValue})`)
        })
        return () => {
          off()
        }
      }, 'dsh-tty: settings')
    })

    // 向 agent 公告终端面板能力
    if (config?.announceToAgent !== false) {
      ctx.inject(['systemPrompt'], (promptCtx: Context) => {
        promptCtx.effect(() => {
          const systemPrompt = (promptCtx as unknown as { systemPrompt: { section(options: { name: string; order?: number; text: string }): () => void } }).systemPrompt
          return systemPrompt.section({ name: 'plugin:dsh-tty', order: 150, text: TTY_GUIDANCE })
        }, 'dsh-tty: announcement')
      })
    }

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
