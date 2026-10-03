/**
 * 最小 Chrome DevTools Protocol 客户端（零依赖：Node 22 自带 `fetch` 与全局 `WebSocket`）。
 *
 * ## 为什么它在 `kit` 里
 *
 * 它原先住在仓根的 `scripts/chrome-cdp.mjs`。那是**跨包共用的实现**——消费者有
 * `scripts/verify-client-ui.mjs`、`scripts/verify-rss-opml.mjs`、
 * `packages/docker/scripts/log-perf.mjs`，以及 `packages/devfront` 的浏览器驱动。
 * 按本仓「`kit` 是唯一的库」的规矩（见 `docs/architecture.md`），这种实现该收在 `kit`：
 * 放在任何**插件包**里，根 `scripts/` 就得反向依赖一个插件——依赖方向是错的。
 *
 * ## 它做什么
 *
 * 起一个 headless Chrome，连上它的 CDP WebSocket，发命令、收事件、截图。刻意**不引入依赖**：
 * Node 22 自带 `fetch` 与全局 `WebSocket`，而这个客户端要用的只是五个 CDP 方法。
 *
 * 用法（真实消费者见 `packages/devfront/src/cdp-driver.ts`）：
 *
 * ```ts
 * const chrome = await Chrome.launch()
 * await chrome.attachToPage()
 * await chrome.send('Page.navigate', { url })
 * await chrome.screenshot('/tmp/shot.png')
 * chrome.close()
 * ```
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** 默认的 Chrome 可执行文件（macOS）。其它平台用 `path` 选项或 `CHROME_PATH` 覆盖。 */
export const DEFAULT_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

/** `Chrome.launch` 的选项。 */
export interface ChromeLaunchOptions {
  /** 可执行文件路径。 */
  path?: string
  /** 调试端口；`0` / 不给 = 让 Chrome 自己挑（从它的 stderr 读回来）。 */
  port?: number
  /** profile 目录；不给则用临时目录。 */
  userDataDir?: string
  /** 额外命令行参数。 */
  extraArgs?: string[]
  /**
   * 关掉 Chrome 的沙箱（加 `--no-sandbox`）。
   *
   * **默认关，只在必要时开**。受限环境（容器、CI、某些 macOS 沙箱）里 Chrome 的沙箱初始化
   * 会失败（stderr 里是 `Failed to initialize sandbox`），进程随后以 `SIGTRAP` 退出——
   * 表现为「端点起来了 1 秒就没了」，很难归因。这种情况必须显式打开本项。
   *
   * **代价要说清**：这是把浏览器的进程隔离关掉。验活会打开内网站点，所以它不该是默认值；
   * 换了环境（本机开发 vs 容器）应当由调用方决定，而不是由这个库替你决定。
   */
  noSandbox?: boolean
}

/**
 * 起浏览器**失败时的解释**。
 *
 * 为什么值得单独写一段：Chrome 起不来有好几种表现（端点没起来 / 起来了又断 / 进程带信号退出），
 * 而它们的修法完全不同。原先把这些统统归到「CDP 端点没起来」——一句不产生新信息的话，
 * 使用者只能猜。这里按 stderr 里的已知特征给出可执行的下一步。
 */
function explainLaunchFailure(stderr: string, signal: string | null): string {
  const hint = stderr.includes('Failed to initialize sandbox') || stderr.includes('sandbox initialization failed')
    ? '\n这是**沙箱初始化失败**：受限环境（容器 / CI / 受限的 macOS 沙箱）里需要显式关掉沙箱——' +
      '传 `noSandbox: true`（或 `extraArgs: ["--no-sandbox"]`）。代价是关掉浏览器进程隔离，只在必要环境这么做。'
    : ''
  const crashed = signal === null ? '' : `\nChrome 进程带信号退出：${signal}（SIGTRAP 常见于沙箱初始化失败或崩溃）`
  return `Chrome 的 CDP 端点没起来。${crashed}${hint}\nstderr=${stderr.slice(0, 600)}`
}

/** CDP 事件参数（形状由各方法自定，这里只做结构约束）。 */
export type CdpParams = Record<string, unknown>

/** `Runtime.evaluate` 的返回（只取用到的字段）。 */
interface EvaluateResult {
  result?: { value?: unknown }
  exceptionDetails?: { exception?: { description?: string } }
}

/** `Page.captureScreenshot` 的返回。 */
interface ScreenshotResult {
  data: string
}

/** `/json/version` 的返回。 */
export interface CdpVersionInfo {
  Browser?: string
  'Protocol-Version'?: string
  webSocketDebuggerUrl?: string
}

/** 一个可附加的 target。 */
export interface CdpTarget {
  type?: string
  url?: string
  webSocketDebuggerUrl: string
}

/** CDP 事件监听器。 */
export type CdpListener = (params: CdpParams) => void

/** 本进程内已起过多少个 Chrome——只用来给默认 profile 目录去重。 */
let launchSeq = 0

/**
 * 默认的 Chrome 用户数据目录（**每次调用都必须唯一**）。
 *
 * 为什么必须唯一：`launch` 拿到目录后先 `rmSync` 再 `mkdirSync`。同一个进程里可以同时存在多个
 * Chrome（一个插件实例 + 一个测试里的探测客户端、或两个插件实例），目录名一旦撞上，
 * 第二次启动就会**去删一个正在跑的 Chrome 的 profile**——轻则
 * `ENOTEMPTY: directory not empty, rmdir …`，重则把在跑的那个弄坏。
 *
 * 从前这个名字是 `dsh-cdp-<pid>-<port>`，而 `port` 缺省是 `0` →
 * **同一进程里的第二个 Chrome 必然撞上**（2026-10-02 被
 * `packages/devfront/test/tool-smoke.test.ts` 那个「另开一条 CDP 通路独立测量」的用例打出来）。
 * 换成进程内自增序号：pid 区分进程、序号区分同进程内的多次启动。
 */
export function defaultUserDataDir(): string {
  launchSeq += 1
  return join(tmpdir(), `dsh-cdp-${String(process.pid)}-${String(launchSeq)}`)
}

export class Chrome {
  /** 起一个 headless Chrome 并等 CDP 端点可用。 */
  static async launch(options: ChromeLaunchOptions = {}): Promise<Chrome> {
    const { path = DEFAULT_CHROME, port, userDataDir, extraArgs = [], noSandbox = false } = options
    const dir = userDataDir ?? defaultUserDataDir()
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    const child = spawn(
      path,
      [
        '--headless=new',
        `--remote-debugging-port=${String(port ?? 0)}`,
        `--user-data-dir=${dir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-gpu',
        '--disable-extensions',
        '--window-size=1440,900',
        ...(noSandbox ? ['--no-sandbox'] : []),
        ...extraArgs,
        'about:blank',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer) => (stderr += String(chunk)))
    // 端口可能由 Chrome 自己挑（`--remote-debugging-port=0`）：那就从它的 stderr 里读回来。
    // 早先这里只会去轮询 9222，于是「不指定端口」直接失败。
    const deadline = Date.now() + 20_000
    let version: CdpVersionInfo | undefined
    let actualPort = port === undefined || port === 0 ? undefined : port
    while (Date.now() < deadline) {
      // **进程已经死了就别再等**：否则要等满 20 秒才拿到一句「端点没起来」，
      // 而真正的原因（沙箱初始化失败 / 崩溃）就在 stderr 里。
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(explainLaunchFailure(stderr, child.signalCode))
      }
      if (actualPort === undefined) {
        const match = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//.exec(stderr)
        if (match !== null) actualPort = Number(match[1])
      }
      if (actualPort !== undefined) {
        try {
          version = (await (await fetch(`http://127.0.0.1:${String(actualPort)}/json/version`)).json()) as CdpVersionInfo
          break
        } catch {
          /* 端点还没起来 */
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    if (version === undefined) {
      try {
        child.kill()
      } catch {
        /* 已退 */
      }
      throw new Error(explainLaunchFailure(stderr, child.signalCode))
    }
    return new Chrome(child, actualPort, version, dir)
  }

  /** 下一个命令 id。 */
  private nextId = 1
  /** 已发出但未收到回应的命令。 */
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  /** 事件监听器。 */
  private readonly listeners = new Map<string, CdpListener[]>()
  /** CDP WebSocket；未连接时为 `undefined`。 */
  private socket: WebSocket | undefined

  constructor(
    /** Chrome 子进程（`close()` 会 kill 它）。 */
    readonly child: ChildProcess,
    /** 实际使用的调试端口。 */
    readonly port: number | undefined,
    /** `/json/version` 的返回。 */
    readonly version: CdpVersionInfo,
    /** profile 目录（`close()` 会尝试清理）。 */
    readonly userDataDir: string,
  ) {}

  /** 附到第一个 page target 上并连上它的 CDP WebSocket。 */
  async attachToPage(): Promise<CdpTarget> {
    const list = (await (await fetch(`http://127.0.0.1:${String(this.port)}/json/list`)).json()) as CdpTarget[]
    const page = list.find((item) => item.type === 'page') ?? list[0]
    if (page === undefined) throw new Error('没有可附加的 target')
    await this.connect(page.webSocketDebuggerUrl)
    return page
  }

  /** 连一个 CDP WebSocket 端点。 */
  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url)
      this.socket = socket
      socket.addEventListener('open', () => resolve())
      socket.addEventListener('error', (event) => {
        const message = (event as { message?: string }).message
        reject(new Error(`CDP WS error: ${message ?? 'unknown'}`))
      })
      socket.addEventListener('message', (event) => {
        let message: { id?: number; method?: string; params?: CdpParams; result?: unknown; error?: unknown }
        try {
          message = JSON.parse(String(event.data)) as typeof message
        } catch {
          return
        }
        if (message.id !== undefined) {
          const pending = this.pending.get(message.id)
          if (pending === undefined) return
          this.pending.delete(message.id)
          if (message.error !== undefined) pending.reject(new Error(JSON.stringify(message.error)))
          else pending.resolve(message.result)
          return
        }
        if (message.method === undefined) return
        for (const listener of this.listeners.get(message.method) ?? []) listener(message.params ?? {})
      })
    })
  }

  /** 发一条 CDP 命令。 */
  send<T = unknown>(method: string, params: CdpParams = {}): Promise<T> {
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
      this.socket?.send(JSON.stringify({ id, method, params }))
      setTimeout(() => {
        if (!this.pending.has(id)) return
        this.pending.delete(id)
        reject(new Error(`CDP ${method} 超时`))
      }, 30_000)
    })
  }

  /** 订阅一个 CDP 事件。 */
  on(method: string, listener: CdpListener): void {
    const list = this.listeners.get(method) ?? []
    list.push(listener)
    this.listeners.set(method, list)
  }

  /** 在页面里求值（默认等 Promise）。 */
  async evaluate(expression: string, options: { awaitPromise?: boolean } = {}): Promise<unknown> {
    const { awaitPromise = true } = options
    const result = await this.send<EvaluateResult>('Runtime.evaluate', { expression, awaitPromise, returnByValue: true })
    if (result.exceptionDetails !== undefined) {
      const description = result.exceptionDetails.exception?.description
      throw new Error(`页面里抛错：${description ?? JSON.stringify(result.exceptionDetails)}`)
    }
    return result.result?.value
  }

  /** 截图到文件，返回路径。 */
  async screenshot(file: string): Promise<string> {
    const shot = await this.send<ScreenshotResult>('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    })
    writeFileSync(file, Buffer.from(shot.data, 'base64'))
    return file
  }

  /** 关连接、kill 子进程、清 profile。 */
  close(): void {
    try {
      this.socket?.close()
    } catch {
      /* 已关 */
    }
    try {
      this.child.kill()
    } catch {
      /* 已退 */
    }
    // Chrome 可能还在收尾写 profile：清理失败不该影响退出码
    try {
      rmSync(this.userDataDir, { recursive: true, force: true, maxRetries: 3 })
    } catch {
      /* 临时目录交给系统回收 */
    }
  }
}
