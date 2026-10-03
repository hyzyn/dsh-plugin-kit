/**
 * CDP 驱动测试（`docs/devdata-plan.md` §15.2）。
 *
 * 分两段：
 *   - **纯函数**（`normalizeLevel` / `textOfArgs` / `sourceOfStack`）——不碰浏览器，必跑；
 *   - **集成**（真的起 Chrome）——`describe.skipIf` 门控在「本机有 Chrome 可执行文件」上，
 *     没装 Chrome 的环境跳过而不是红掉（与 `packages/tty/test/stats.test.ts` 的 `CAN_PROBE_*` 同口径）。
 *
 * 集成那段的重点不是「能不能截图」，而是**三处容易悄悄错的地方**：
 *   console 事件必须在导航之前订阅、`sourceUrl` 必须真的捞得到、`text` 必须是可见文本。
 * 这三条错了都不会报错，只会让验活结论变成假的。
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CdpWebDriver, extractStatus, normalizeLevel, sourceOfStack, textOfArgs, type WebTarget } from '../src/index.js'

const DEFAULT_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

/** Chrome 可执行文件的路径（可用 `CHROME_PATH` 覆盖）。 */
const CHROME_PATH = process.env.CHROME_PATH ?? DEFAULT_CHROME

/** 本机有没有可用的 Chrome——集成用例的前置条件。 */
const CAN_DRIVE_CHROME = existsSync(CHROME_PATH)

/**
 * 要不要关掉 Chrome 的沙箱。
 *
 * 本仓的开发环境（受限的 macOS 沙箱）里 Chrome 的沙箱初始化会失败、进程带 `SIGTRAP` 退出：
 * 表现为「CDP 端点起来了 1 秒就没了」。这种情况必须 `--no-sandbox`。
 * 用环境变量显式控制，而不是无条件关掉——**关沙箱是安全相关的默认值**，
 * 不该由测试替所有环境决定（见 `ChromeLaunchOptions.noSandbox` 的注释）。
 */
const NO_SANDBOX = process.env.DEVFRONT_NO_SANDBOX !== '0'

describe('纯函数：从资源失败正文里取状态码', () => {
  it('认得 CDP 的真实措辞（`status of 404`）', () => {
    expect(extractStatus('Failed to load resource: the server responded with a status of 404 (Not Found)')).toBe(404)
    expect(extractStatus('Failed to load resource: the server responded with a status of 500')).toBe(500)
    expect(extractStatus('status code of 403')).toBe(403)
  })

  it('取不到就返回 undefined（**不猜**）', () => {
    // 猜一个状态码会让按状态分档的规则反向生效。
    expect(extractStatus('Error: 未捕获：渲染订单行失败')).toBeUndefined()
    expect(extractStatus('')).toBeUndefined()
    expect(extractStatus('something happened')).toBeUndefined()
  })
})

describe('纯函数：CDP 事实归一', () => {
  it('console type → 级别（`assert` 算错误、`warn` 与 `warning` 都算告警）', () => {
    expect(normalizeLevel('error')).toBe('error')
    expect(normalizeLevel('assert')).toBe('error')
    expect(normalizeLevel('warning')).toBe('warning')
    expect(normalizeLevel('warn')).toBe('warning')
    expect(normalizeLevel('log')).toBe('log')
    expect(normalizeLevel('info')).toBe('info')
    expect(normalizeLevel('debug')).toBe('debug')
    expect(normalizeLevel('verbose')).toBe('debug')
    expect(normalizeLevel(undefined)).toBe('other')
    expect(normalizeLevel('weird')).toBe('other')
  })

  it('参数拼成一行：字符串直取、对象 JSON、RemoteObject 用 description 兜底', () => {
    expect(textOfArgs([{ value: 'boom' }, { value: 42 }])).toBe('boom 42')
    expect(textOfArgs([{ value: { a: 1 } }])).toBe('{"a":1}')
    expect(textOfArgs([{ description: 'TypeError: x is not a function' }])).toBe('TypeError: x is not a function')
    expect(textOfArgs([{ type: 'undefined' }])).toBe('undefined')
    expect(textOfArgs([])).toBe('')
    expect(textOfArgs(undefined)).toBe('')
  })

  it('**来源必须从 stackTrace 捞出来**（分类的主判据靠它）', () => {
    // 失败意味着：真实故障被降级成「告警（来源不明）」——噪声淹掉信号的另一种形态。
    const stack = { callFrames: [{ url: '' }, { url: 'https://cdqas.example.com/app.js' }] }
    expect(sourceOfStack(stack)).toBe('https://cdqas.example.com/app.js')
  })

  it('stackTrace 缺失 / 空 / 帧没有 URL → undefined（不编一个来源出来）', () => {
    expect(sourceOfStack(undefined)).toBeUndefined()
    expect(sourceOfStack({})).toBeUndefined()
    expect(sourceOfStack({ callFrames: [] })).toBeUndefined()
    expect(sourceOfStack({ callFrames: [{ url: '' }] })).toBeUndefined()
    expect(sourceOfStack({ callFrames: [{ functionName: 'x' }] })).toBeUndefined()
    expect(sourceOfStack({ callFrames: 'not-an-array' })).toBeUndefined()
  })
})

describe.skipIf(!CAN_DRIVE_CHROME)('集成：真的起 Chrome', () => {
  let server: Server
  let origin: string
  let driver: CdpWebDriver
  let shotDir: string

  /** 一个会：渲染可见文本 + 报一个本站错误 + 请求一个不存在的 favicon 的页面。 */
  const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>验活夹具</title>
<link rel="icon" href="/favicon.ico"></head>
<body><h1>订单编号 CDQ-2026-001</h1>
<div id="total">合计 1,234.00</div>
<button id="btn" onclick="document.getElementById('total').textContent='已点击'">点我</button>
<script>
  // 本站资源里的错误 → 分类应当判成 error（来源同源）
  setTimeout(() => { throw new Error('本站故意抛的错') }, 50)
  console.log('一条普通日志')
</script>
</body></html>`

  /** 一个不抛任何错的页面。 */
  const CLEAN_PAGE = '<!doctype html><html><head><meta charset="utf-8"><title>干净页</title></head><body><p>ok</p></body></html>'

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/favicon.ico') {
        res.writeHead(404).end('not found')
        return
      }
      // `/clean` 是一个**干净的**页面：不抛错。用它验「换页时清掉上一页的 console」——
      // 若两个 URL 返回同一份会抛错的页面，清没清都看不出来（新页面会再抛一次同样的错）。
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(req.url === '/clean' ? CLEAN_PAGE : PAGE)
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const port = typeof address === 'object' && address !== null ? address.port : 0
    origin = `http://127.0.0.1:${String(port)}`
    shotDir = mkdtempSync(join(tmpdir(), 'devfront-cdp-'))
    driver = new CdpWebDriver({ chromePath: CHROME_PATH, shotDir, settleMs: 400, noSandbox: NO_SANDBOX })
  }, 60_000)

  afterAll(async () => {
    driver?.dispose()
    await new Promise<void>((resolve) => server?.close(() => resolve()))
    rmSync(shotDir, { recursive: true, force: true })
  })

  const target: WebTarget = { id: 'w-fixture', label: '本地夹具', url: 'http://127.0.0.1/' }

  /**
   * 视口**按站点**施加（2026-10-02 加）。
   *
   * 为什么这是驱动层的测试而不是插件层的：**一个浏览器服务多个站点**，所以视口不能在起浏览器时
   * 定死一次——每次动作前要按当前 target 核一遍，变了才发 CDP。原先
   * `CdpWebDriverOptions.viewport` 存在、实现了、**零调用方**，于是六个工具永远用桌面视口，
   * 而本机要验的移动端 H5 在桌面视口下看到的不是手机上的样子。
   *
   * 可观测面用 `screenshot()`：它回的宽高读的是 `window.innerWidth / innerHeight`，
   * 正是「验活窗口」的真实尺寸。
   */
  it('视口按站点施加：换 target 就换视口，换回默认也要**撤销**上一个站点的视口', async () => {
    const mobile: WebTarget = { ...target, id: 'w-mobile', label: '移动端夹具', viewport: { width: 390, height: 844 } }
    await driver.open({ target: mobile, url: origin, cwd: process.cwd() })
    const phone = await driver.screenshot({ target: mobile })
    expect([phone.width, phone.height]).toEqual([390, 844])

    // 换回没写视口的 target：必须**撤销**覆盖，而不是把 390×844 留着继续用
    await driver.open({ target, url: origin, cwd: process.cwd() })
    const back = await driver.screenshot({ target })
    expect(back.width).not.toBe(390)
    expect(back.height).not.toBe(844)
  }, 60_000)

  it('open：导航并拿到标题', async () => {
    const result = await driver.open({ target, url: origin, cwd: process.cwd() })
    expect(result.url).toBe(origin)
    expect(result.title).toBe('验活夹具')
    expect(driver.consoleSubscribed).toBe(true)
  }, 60_000)

  it('currentUrl：问的是**浏览器里当前那个页面**，不是驱动记的 lastUrl', async () => {
    // 「实时」是这条判据的全部意义：驱动记的 URL 是「上次导航到哪」，
    // 而客户端跳转（location.replace / SPA 路由）不会更新它——那正是它要防的东西。
    await driver.open({ target, url: origin, cwd: process.cwd() })
    expect(await driver.currentUrl({ target })).toBe(`${origin}/`)
  }, 60_000)

  it('text：取到的是**可见文本**，不是 HTML', async () => {
    const text = await driver.text({ target })
    expect(text).toContain('订单编号 CDQ-2026-001')
    expect(text).toContain('合计 1,234.00')
    // 关键：可见文本里不该有标签——断言里的 toContain 是给人写的。
    expect(text).not.toContain('<div')
    expect(text).not.toContain('document.getElementById')
  }, 60_000)

  it('console：**导航期间**产生的错误也收得到（订阅在导航之前）', async () => {
    // 失败意味着：首屏那几秒的错误全丢——而发布验活最关心的恰恰是那几秒。
    const messages = await driver.console({ target })
    const texts = messages.map((message) => message.text).join('\n')
    expect(texts).toContain('本站故意抛的错')
    expect(texts).toContain('一条普通日志')
  }, 60_000)

  it('console：本站错误带得出 `sourceUrl`（分类才能判成 error 而不是告警）', async () => {
    const messages = await driver.console({ target })
    const own = messages.find((message) => message.text.includes('本站故意抛的错'))
    expect(own?.sourceUrl).toBeDefined()
    expect(own?.sourceUrl).toContain('127.0.0.1')
    expect(own?.pageUrl).toBe(origin)
  }, 60_000)

  it('console：`Log.entryAdded` 那一路也收得到（资源 404 不进 console API）', async () => {
    const messages = await driver.console({ target })
    // favicon 的 404 由 Log 域上报，`Runtime.consoleAPICalled` 收不到。
    expect(messages.some((message) => message.text.includes('favicon') || message.sourceUrl?.includes('favicon'))).toBe(true)
  }, 60_000)

  it('screenshot：落盘的是真 PNG（agent 能直接看）', async () => {
    const shot = await driver.screenshot({ target })
    expect(existsSync(shot.path)).toBe(true)
    const bytes = readFileSync(shot.path)
    // PNG magic number：真的是一张图，而不是空文件或文本。
    expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(bytes.length).toBeGreaterThan(1000)
    expect(shot.width).toBeGreaterThan(0)
  }, 60_000)

  it('click / fill：命中就生效，没命中就**报错**（不静默成功）', async () => {
    await driver.click({ target, selector: '#btn' })
    expect(await driver.text({ target })).toContain('已点击')

    await expect(driver.click({ target, selector: '#nope' })).rejects.toThrow('选择器没命中任何元素')
    await expect(driver.fill({ target, selector: '#nope', value: 'x' })).rejects.toThrow('选择器没命中任何元素')
  }, 60_000)

  it('换页面时清掉上一页的 console（否则「新页面是干净的」会虚假地失败）', async () => {
    // 先确认当前页确实收着那个错（否则下面的断言可能是因为根本没收到而假绿）。
    expect((await driver.console({ target })).some((m) => m.text.includes('本站故意抛的错'))).toBe(true)

    await driver.open({ target, url: `${origin}/clean`, cwd: process.cwd() })
    const messages = await driver.console({ target })
    expect(messages.some((message) => message.text.includes('本站故意抛的错'))).toBe(false)
    // 干净页确实加载了（不是「什么都没发生」那种假绿）。
    expect(await driver.text({ target })).toContain('ok')
  }, 60_000)
})

describe.skipIf(CAN_DRIVE_CHROME)('没有 Chrome 时的行为', () => {
  it('本机没有 Chrome 可执行文件 → 集成用例已跳过（这里只是把这件事说清楚）', () => {
    // 这条会在**有** Chrome 的环境里跳过，反之运行。它的作用不是断言，而是让
    // 「集成用例为什么没跑」在测试输出里可见——静默跳过会让人以为验过了。
    expect(CAN_DRIVE_CHROME).toBe(false)
    writeFileSync(join(tmpdir(), 'devfront-no-chrome.txt'), CHROME_PATH)
  })
})
