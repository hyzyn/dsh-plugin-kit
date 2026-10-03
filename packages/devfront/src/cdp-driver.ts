/**
 * CDP 驱动的 `WebDriver` 实现（`docs/devdata-plan.md` §15.2）。
 *
 * ## 这一层的职责边界
 *
 * `page.ts` 管判定（能不能做），本模块管**怎么在浏览器里做**。它不做任何安全判定——
 * 那是上游的事，而且这样分工才让判定层能在没有浏览器的情况下被完整测试。
 *
 * ## 三处实现要点（都是踩过的地方）
 *
 * 1. **console 收集必须在导航之前订阅**。`Runtime.consoleAPICalled` 与
 *    `Log.entryAdded` 是**事件**：页面加载期间产生的错误在订阅之前就发出去了，事后再开订阅
 *    什么都收不到——而发布验活最关心的恰恰是首屏那几秒的错误。
 * 2. **`sourceUrl` 要专门取**。分类的主判据是来源：`ConsoleMessage.sourceUrl` 为空时
 *    一律只能算「告警」（见 `console.ts`）。所以这里要尽力从 `stackTrace` / `Log` 的
 *    `url` 字段里把它捞出来，而不是只留一句文本。
 * 3. **`text` 取的是可见文本**，不是 `outerHTML`：断言里的 `toContain` 是给人写的
 *    （「订单编号」），拿 HTML 去比会把标签也带上，于是「明明页面上有」却匹配不上。
 *
 * 依据：`docs/devdata-plan.md` §15.2 / §15.3。
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Chrome, DEFAULT_CHROME, type CdpParams } from '@hyzyn/dsh-kit'

import type { ConsoleLevel, ConsoleMessage } from './console.js'
import type { ShotResult, WebDriver, WebTarget } from './page.js'

/** `CdpWebDriver` 的选项。 */
export interface CdpWebDriverOptions {
  /** Chrome 可执行文件路径（缺省 `CHROME_PATH`，再缺省 macOS 默认位置）。 */
  chromePath?: string
  /** 截图默认输出目录（缺省系统临时目录）。 */
  shotDir?: string
  /** 每次导航后等多久（毫秒），给首屏渲染留时间。缺省 800。 */
  settleMs?: number
  /** 导航超时（毫秒）。缺省 30 秒（与 `Chrome.send` 的 CDP 超时一致）。 */
  navigationTimeoutMs?: number
  /**
   * **默认**视口（`WebTarget.viewport` 没写时用它）。加它的原因见 `ensurePage`：
   * 按站点的视口优先，这一项只是没配站点时的兜底。
   */
  viewport?: { width: number; height: number }
  /**
   * 关掉 Chrome 的沙箱（`--no-sandbox`）。
   *
   * **默认关**（`false`）。受限环境里 Chrome 的沙箱初始化会失败、进程带 `SIGTRAP` 退出，
   * 表现为「端点起来了 1 秒就没了」。那种环境必须显式打开——代价是关掉浏览器进程隔离，
   * 而验活会打开内网站点，所以不该是默认值（见 `@hyzyn/dsh-kit` 的 `ChromeLaunchOptions.noSandbox`）。
   */
  noSandbox?: boolean
  /** 额外传给 Chrome 的参数（透传给 `Chrome.launch`）。 */
  chromeArgs?: string[]
}

/** 收集 console 的**订阅状态**（一次驱动一个实例）。 */
interface ConsoleCollector {
  messages: ConsoleMessage[]
}

/** 把 CDP 的 console type 归一成本模块的级别。 */
export function normalizeLevel(type: string | undefined): ConsoleLevel {
  switch (type) {
    case 'error':
    case 'assert':
      return 'error'
    case 'warning':
    case 'warn':
      return 'warning'
    case 'info':
      return 'info'
    case 'debug':
    case 'verbose':
      return 'debug'
    case 'log':
      return 'log'
    default:
      return 'other'
  }
}

/**
 * 从资源失败的正文明文里取 HTTP 状态码。
 *
 * CDP 的资源失败事件只有一句人话（`Failed to load resource: the server responded with a
 * status of 404 (Not Found)`），没有结构化的状态字段。取不到就返回 `undefined`——
 * **不猜**：给一个错的状态码会让按状态分档的规则反向生效。
 */
export function extractStatus(text: string): number | undefined {
  const match = /\bstatus(?:\s+code)?\s+of\s+(\d{3})\b/i.exec(text) ?? /\b(4\d{2}|5\d{2})\b/.exec(text)
  if (match === null) return undefined
  const code = Number.parseInt(match[1] as string, 10)
  return Number.isFinite(code) ? code : undefined
}

/** 把 CDP 的 `RemoteObject` 拼成人能读的一行（console 的消息正文可能不是字符串）。 */
export function textOfArgs(args: readonly CdpParams[] | undefined): string {
  if (args === undefined || args.length === 0) return ''
  return args
    .map((arg) => {
      if (typeof arg.value === 'string') return arg.value
      if (arg.value !== undefined) return JSON.stringify(arg.value)
      if (typeof arg.description === 'string') return arg.description
      return String(arg.type ?? '')
    })
    .join(' ')
}

/**
 * 从 `stackTrace` 里取第一帧的 URL。
 *
 * 为什么要专门做：分类的主判据是「来源是不是本站」——拿不到来源就只能算告警，
 * 而一个真实故障被降级成告警，正是「噪声淹掉信号」的另一种形态。
 */
export function sourceOfStack(stackTrace: CdpParams | undefined): string | undefined {
  const frames = stackTrace?.callFrames
  if (!Array.isArray(frames)) return undefined
  for (const frame of frames as CdpParams[]) {
    if (typeof frame.url === 'string' && frame.url !== '') return frame.url
  }
  return undefined
}

/**
 * 一个 headless Chrome 驱动的 `WebDriver`。
 *
 * **生命周期**：`open()` 会按需起浏览器并**保持**它（后续 `click` / `text` / `console`
 * 都作用于同一个页面）。`dispose()` 负责关掉——调用方必须调它，否则 Chrome 进程会留下来。
 * 这一点写在这里是因为它不是「可选清理」：忘了就是每验一次泄漏一个浏览器进程。
 */
export class CdpWebDriver implements WebDriver {
  private readonly options: CdpWebDriverOptions
  private chrome: Chrome | undefined
  private readonly collector: ConsoleCollector = { messages: [] }
  private shotDir: string | undefined
  private ownShotDir = false
  private lastUrl: string | undefined
  /**
   * 已经施加给当前页面的视口（`'390x844'` 或空串 = 浏览器默认）。
   *
   * 为什么要记账：**一个浏览器服务多个站点**，视口按站点配（`WebTarget.viewport`），
   * 所以每次动作前都要核一次；但核不等于发——CDP 调用是白花的开销，值没变就不该发。
   */
  private appliedViewport: string | undefined
  /** console 事件是否已订阅（**必须在导航之前**，见文件头）。 */
  private subscribed = false

  constructor(options: CdpWebDriverOptions = {}) {
    this.options = options
  }

  /** 起浏览器并订阅 console 事件（幂等）。 */
  private async ensureChrome(): Promise<Chrome> {
    if (this.chrome !== undefined) return this.chrome

    const path = this.options.chromePath ?? process.env.CHROME_PATH ?? DEFAULT_CHROME
    const chrome = await Chrome.launch({
      path,
      noSandbox: this.options.noSandbox ?? false,
      ...(this.options.chromeArgs === undefined ? {} : { extraArgs: this.options.chromeArgs }),
    })
    await chrome.attachToPage()

    chrome.send('Runtime.enable').catch(() => undefined)
    chrome.send('Log.enable').catch(() => undefined)
    chrome.send('Page.enable').catch(() => undefined)

    // ① 订阅要在任何导航之前完成（`ensureChrome` 在 `open` 里第一个被调用）。
    chrome.on('Runtime.consoleAPICalled', (params: CdpParams) => {
      this.collector.messages.push({
        level: normalizeLevel(typeof params.type === 'string' ? params.type : undefined),
        text: textOfArgs(params.args as CdpParams[] | undefined),
        ...(sourceOfStack(params.stackTrace as CdpParams | undefined) === undefined
          ? {}
          : { sourceUrl: sourceOfStack(params.stackTrace as CdpParams | undefined) as string }),
        ...(this.lastUrl === undefined ? {} : { pageUrl: this.lastUrl }),
        at: Date.now(),
      })
    })
    // ② `Log.entryAdded` 装的是**资源加载失败**这类不进 console API 的错（favicon 404、脚本 404）。
    //    发布验活最常见的信号之一就在这里，不订阅会漏掉一大类。
    chrome.on('Log.entryAdded', (params: CdpParams) => {
      const entry = (params.entry ?? {}) as CdpParams
      const text = typeof entry.text === 'string' ? entry.text : ''
      this.collector.messages.push({
        level: normalizeLevel(typeof entry.level === 'string' ? entry.level : undefined),
        text,
        ...(typeof entry.url === 'string' && entry.url !== '' ? { sourceUrl: entry.url } : {}),
        ...(this.lastUrl === undefined ? {} : { pageUrl: this.lastUrl }),
        // CDP 的 `Log.entryAdded` **不带 HTTP 状态码**（它没有那个字段），而状态码就写在正文里
        // （`… responded with a status of 404`）。从正文里取回来：`console.ts` 的噪声规则
        // 需要它，而「状态码缺失」会让那些规则**静默失效**——那正是 favicon 404 曾经被判成故障的原因。
        ...(extractStatus(text) === undefined ? {} : { status: extractStatus(text) as number }),
        at: typeof entry.timestamp === 'number' ? entry.timestamp : Date.now(),
      })
    })
    // ③ **未捕获的异常与 console API 是两回事**：`setTimeout` 里 `throw`、事件处理器里 `throw`、
    //    模块求值失败，这些走 `Runtime.exceptionThrown`，**不走 `consoleAPICalled`**。
    //    而「页面抛了个未捕获的异常」正是「页面坏了」最常见、最该被验活抓到的一类信号——
    //    只订阅 console API 会把整类漏掉，而且漏得**毫无症状**（报告里显示「console 干净」）。
    chrome.on('Runtime.exceptionThrown', (params: CdpParams) => {
      const details = (params.exceptionDetails ?? {}) as CdpParams
      const exception = (details.exception ?? {}) as CdpParams
      const description = typeof exception.description === 'string' ? exception.description : undefined
      const fromStack = sourceOfStack(details.stackTrace as CdpParams | undefined)
      const direct = typeof details.url === 'string' && details.url !== '' ? details.url : undefined
      const source = direct ?? fromStack
      this.collector.messages.push({
        level: 'error',
        // 优先用 `description`：它带 `Error: 消息` 与调用栈首行，报告里要能看出错在哪。
        text: description ?? (typeof details.text === 'string' ? details.text : '未捕获的异常'),
        ...(source === undefined ? {} : { sourceUrl: source }),
        ...(this.lastUrl === undefined ? {} : { pageUrl: this.lastUrl }),
        at: Date.now(),
      })
    })
    this.subscribed = true

    this.chrome = chrome
    return chrome
  }

  /**
   * 起浏览器 **+ 按当前站点施加视口**（每个动作的第一个入口）。
   *
   * 视口为什么不能只在起浏览器时定一次：**同一个浏览器服务多个站点**，而视口是**按站点配**的
   * （`WebTarget.viewport`，2026-10-02 加：原先 `CdpWebDriverOptions.viewport` 存在、实现了、
   * 却**没有任何调用方**，于是六个工具永远用默认桌面视口——而本机要验的前端里 `hcckc-h5` /
   * `bpaimsm-v4` / `bpaossm-v3.1` 都是移动端 H5，看到的不是手机上的样子）。
   *
   * 优先级：站点的 `viewport` > 构造时的 `options.viewport`（默认视口）> 浏览器默认。
   * 值没变就不发 CDP（见 `appliedViewport` 的注释）。
   */
  private async ensurePage(target: WebTarget): Promise<Chrome> {
    const chrome = await this.ensureChrome()
    const want = target.viewport ?? this.options.viewport
    const key = want === undefined ? '' : `${String(want.width)}x${String(want.height)}`
    if (key === this.appliedViewport) return chrome
    this.appliedViewport = key
    if (want === undefined) await chrome.send('Emulation.clearDeviceMetricsOverride')
    else {
      await chrome.send('Emulation.setDeviceMetricsOverride', {
        width: want.width,
        height: want.height,
        // 刻意不模拟真设备（mobile / touch / DPR / UA 全不变）：这一层只解决「视口尺寸」，
        // 真设备模拟是另一件事，见 ROADMAP 记-17 的「仍然没验到」。
        deviceScaleFactor: 1,
        mobile: false,
      })
    }
    return chrome
  }

  async open(input: { target: WebTarget; url: string; cwd: string }): Promise<{ url: string; title?: string }> {
    const chrome = await this.ensurePage(input.target)
    // 换页前把上一页的 console 清掉：不清会让「新页面是干净的」这个判断虚假地失败。
    // （**只在换 URL 时清**，见 `page.ts`：同一次验活里 open 之后还要收同一个页面的 console。）
    if (this.lastUrl !== undefined && this.lastUrl !== input.url) this.collector.messages.length = 0

    await chrome.send('Page.navigate', { url: input.url })
    this.lastUrl = input.url
    await this.waitForLoad(input.url, this.options.navigationTimeoutMs ?? 30_000)
    await this.settle()

    const title = await chrome.evaluate('document.title').catch(() => undefined)
    return { url: input.url, ...(typeof title === 'string' ? { title } : {}) }
  }

  /** 等页面真正停下（轮询 `document.readyState`，不依赖 CDP 的加载事件竞态）。 */
  private async waitForLoad(url: string, timeoutMs: number): Promise<void> {
    const chrome = this.chrome as Chrome
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const state = await chrome.evaluate('document.readyState').catch(() => undefined)
      if (state === 'complete' || state === 'interactive') return
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    // 超时不抛：页面可能一直有长连接（轮询 / SSE），那种情况下 `readyState` 停不到 complete，
    // 但页面已经可读了。**让断言去判内容**，而不是在这里一刀切失败。
    void url
  }

  /** 给 SPA 的首屏渲染留一点时间（不是启发式判据，只是避免必然失败的一读）。 */
  private async settle(): Promise<void> {
    const ms = this.options.settleMs ?? 800
    if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms))
  }

  async screenshot(input: { target: WebTarget; path?: string }): Promise<ShotResult> {
    const chrome = await this.ensurePage(input.target)
    const path = input.path ?? this.defaultShotPath()
    await chrome.screenshot(path)
    const size = await chrome
      .evaluate('JSON.stringify([window.innerWidth, window.innerHeight])')
      .catch(() => undefined)
    if (typeof size === 'string') {
      const parsed = JSON.parse(size) as [number, number]
      return { path, width: parsed[0], height: parsed[1] }
    }
    return { path }
  }

  /** 截图默认落盘位置（懒建临时目录；`dispose()` 负责清理自己建的那个）。 */
  private defaultShotPath(): string {
    if (this.shotDir === undefined) {
      const configured = this.options.shotDir
      if (configured === undefined) {
        this.shotDir = mkdtempSync(join(tmpdir(), 'devfront-shot-'))
        this.ownShotDir = true
      } else {
        this.shotDir = configured
      }
    }
    return join(this.shotDir, `shot-${String(Date.now())}.png`)
  }

  async click(input: { target: WebTarget; selector: string }): Promise<void> {
    const chrome = await this.ensurePage(input.target)
    const clicked = await chrome.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(input.selector)})
      if (el === null) return false
      el.click()
      return true
    })()`)
    // 「找不到元素」是**明确的否证**，要报出来而不是静默成功——静默成功会让后续断言
    // 在一个没有点击过的页面上跑，得到的失败与真实原因差了十万八千里。
    if (clicked !== true) throw new Error(`选择器没命中任何元素：${input.selector}`)
    await this.settle()
  }

  async fill(input: { target: WebTarget; selector: string; value: string }): Promise<void> {
    const chrome = await this.ensurePage(input.target)
    const filled = await chrome.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(input.selector)})
      if (el === null) return false
      el.value = ${JSON.stringify(input.value)}
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    })()`)
    if (filled !== true) throw new Error(`选择器没命中任何元素：${input.selector}`)
  }

  async text(input: { target: WebTarget }): Promise<string> {
    const chrome = await this.ensurePage(input.target)
    // 取**可见文本**而不是 `outerHTML`：断言里的 toContain 是给人写的（「订单编号」），
    // 拿 HTML 去比会把标签也带上，于是「明明页面上有」却匹配不上。
    const value = await chrome.evaluate('document.body === null ? "" : document.body.innerText')
    return typeof value === 'string' ? value : ''
  }

  async console(input: { target: WebTarget }): Promise<readonly ConsoleMessage[]> {
    await this.ensurePage(input.target)
    // 返回**累积**的消息（含导航期间产生的）。这与「一次拿全」的口径一致：
    // 调用方拿到的是这次会话到目前为止的全部事实，分类交给 `console.ts`。
    return [...this.collector.messages]
  }

  /**
   * 实时问浏览器：当前页面的 URL。
   *
   * **刻意不用 `this.lastUrl`**：那是驱动「上次导航到哪」的记账，客户端跳转
   * （`location.replace` / SPA 路由 / `<meta refresh>`）不会更新它——而这道判据要防的
   * 恰恰就是客户端跳转。只有问浏览器才拿得到真话。问不到就返回 `undefined`（调用方按拒绝处理）。
   */
  async currentUrl(input: { target: WebTarget }): Promise<string | undefined> {
    const chrome = await this.ensurePage(input.target)
    const href = await chrome.evaluate('location.href').catch(() => undefined)
    return typeof href === 'string' && href !== '' ? href : undefined
  }

  /** console 事件是否已订阅（给集成测试与排障用）。 */
  get consoleSubscribed(): boolean {
    return this.subscribed
  }

  /** 关浏览器并清理自己建的临时截图目录。 */
  dispose(): void {
    this.chrome?.close()
    this.chrome = undefined
    this.subscribed = false
    if (this.ownShotDir && this.shotDir !== undefined) {
      try {
        rmSync(this.shotDir, { recursive: true, force: true, maxRetries: 3 })
      } catch {
        /* 临时目录交给系统回收 */
      }
    }
    this.shotDir = undefined
    this.ownShotDir = false
  }
}
