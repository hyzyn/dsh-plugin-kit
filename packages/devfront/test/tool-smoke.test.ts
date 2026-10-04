/**
 * 工具面**端到端冒烟**（`docs/devdata-plan.md` §17.13）。
 *
 * ## 为什么有这个文件
 *
 * 2026-10-02 的四轮真机验收里，**每一次抓到真缺陷的都是「把六个工具全跑一遍」这件事**，
 * 而它当时是一个躺在 `/tmp` 里的一次性脚本。四轮里它抓到的：
 *
 *   - `site_click` / `site_fill` 回显 `{clicked}`/`{filled}`、工具声明的却是 `{selector}`
 *     → **动作生效但工具报 `invalid output`**（v1 只跑了 open/text/console/shot，漏了这两个动作）；
 *   - 异源页上 **click / fill 无差别放行**（origin 判据只写在 `if (action === 'open')` 里）；
 *   - `site_text` 的 `truncated`/`length` 声明了却永远交付不到；
 *   - `site_console` 的噪声只给计数、不可核对。
 *
 * 单测抓不到前两条：第一条要**真的把工具跑起来**（fake 驱动测不出「声明 vs 产出」之外的接线），
 * 第二条要**真的有一个页面跳出去**。所以这份冒烟的价值不在「它覆盖得多全」，
 * 而在**它是唯一一个会把整条链路真的跑起来的东西**。
 *
 * ## 跑法
 *
 * 门控在「本机有 Chrome」上（`describe.skipIf`），没装 Chrome 的环境**跳过而不是红掉**——
 * 与 `cdp-driver.test.ts` / `packages/tty/test/stats.test.ts` 的 `CAN_PROBE_*` 同口径。
 * 沙箱默认关掉（本仓开发机的 Chrome 起不了沙箱），用 `DEVFRONT_NO_SANDBOX=0` 可强制打开。
 *
 * 夹具是**代码内 HTML + 两个临时端口**（站点 + 一个真正的异源），不起外部依赖：
 * 异源那个端口是全部跨源判据的实验台——`localhost` 与 `127.0.0.1` 那种「同端口异 host」
 * 也能算异源，但**端口不同**更不容易被 DNS/hosts 之类的环境因素干扰。
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apply } from '../src/plugin.js'

const DEFAULT_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
/** Chrome 可执行文件的路径（可用 `CHROME_PATH` 覆盖），与 `cdp-driver.test.ts` 同口径。 */
const CHROME_PATH = process.env.CHROME_PATH ?? DEFAULT_CHROME
/** 本机有没有可用的 Chrome——本文件全部用例的前置条件。 */
const CAN_DRIVE_CHROME = existsSync(CHROME_PATH)
/** 关沙箱是安全相关的默认值，由环境变量显式控制（见 `ChromeLaunchOptions.noSandbox`）。 */
const NO_SANDBOX = process.env.DEVFRONT_NO_SANDBOX !== '0'

const CWD = process.cwd()

/* ------------------------------------------------------------------ *
 * 夹具页面
 * ------------------------------------------------------------------ */

/** 站点首页：一个干净的页面（只 `console.log` 过一行），带输入框、按钮与一个真链接。 */
const INDEX = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>订单列表</title><link rel="icon" href="/favicon.ico"></head>
<body>
  <h1>订单列表</h1>
  <p>订单编号 CDQ-2026-001</p>
  <div id="total">合计 1,234.00</div>
  <input id="kw" placeholder="搜索订单">
  <button id="go">查询</button>
  <div id="out">（尚未查询）</div>
  <a id="detail" href="/detail.html">查看详情</a>
  <script>
    console.log('页面已渲染')
    document.getElementById('go').addEventListener('click', function () {
      document.getElementById('out').textContent = '已按「' + document.getElementById('kw').value + '」查询到 1 条'
    })
  </script>
</body></html>`

const DETAIL = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>订单详情</title><link rel="icon" href="/favicon.ico"></head>
<body><h1>订单详情</h1><p>订单编号 CDQ-2026-001</p><p id="status">状态：已发货</p></body></html>`

/**
 * 坏页：同时制造一条 `console.error` 与一条**未捕获异常**。
 *
 * 后者不走 console API（要 `Runtime.exceptionThrown`），所以这一页是「异常通路真的接上了吗」
 * 的唯一判据——只订阅 `Runtime.consoleAPICalled` 的实现会在这里少一条。
 */
const ERR = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>订单详情（坏页）</title><link rel="icon" href="/favicon.ico"></head>
<body><h1>订单详情</h1>
  <script>
    console.error('订单行渲染失败：字段 total 缺失')
    setTimeout(function () { throw new Error('未捕获异常：订单行渲染失败') }, 0)
  </script>
</body></html>`

/** 只监听事件名的页面：用来验 `site_fill` 到底派发了哪些事件（不能靠「结果出现了」反推）。 */
const EVENTS = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>事件探测</title><link rel="icon" href="/favicon.ico"></head>
<body><h1>事件探测</h1><input id="probe" placeholder="填我"><div id="fired">（还没触发）</div>
  <script>
    var fired = []
    var el = document.getElementById('probe')
    ;['input', 'change'].forEach(function (name) {
      el.addEventListener(name, function () {
        fired.push(name)
        document.getElementById('fired').textContent = '已触发：' + fired.join(', ')
      })
    })
  </script>
</body></html>`

/**
 * 可见文本**确定超过** `SITE_TEXT_MAX` 的页面（验截断信号）。
 *
 * 首行那个 `#truth` 是**独立真值**：由页面自己把 `document.body.innerText.length` 写进去。
 * 占位符与结果**等宽**（各 6 字符），所以写完之后 `body.innerText` 的长度不变——
 * 于是它等于浏览器算出来的真实长度，与 `site_text` 的截断/记账逻辑**完全无关**。
 * 这一行在最前面，一定落在 4000 字符的截断之内，所以断言拿得到它。
 *
 * 为什么不用「另开一条 CDP 通路去问」：那要多起一个 Chrome 进程，把整套测试的负载抬到
 * 踩红 `tty probe` 那条**已知负载敏感**用例的程度（tty D95）。真值由页面自己算，
 * 既独立又不起第二个进程。
 */
const LONG = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>长文本页</title></head>
<body><div id="truth">______</div><h1>长文本页</h1>
${Array.from({ length: 160 }, (_, i) => `<p>第 ${String(i + 1).padStart(3, '0')} 行：这是一段用于测试截断的填充文本，它没有任何业务含义。</p>`).join('\n')}
<script>
  var el = document.getElementById('truth')
  el.textContent = String(document.body.innerText.length).padStart(6, '0')
</script>
</body></html>`

/* ------------------------------------------------------------------ *
 * 假宿主：把工具定义收下来（工具内部用的是真 Chrome 驱动）
 * ------------------------------------------------------------------ */

interface ToolDef {
  name: string
  execute: (args: unknown) => Promise<unknown>
  output: { render: (args: unknown, value: unknown) => Array<{ type: string; text: string }> }
}

/** 工具调用的结果：**被拒不是异常**（本文件里有大量预期拒绝）。 */
interface CallResult {
  ok: boolean
  /** 渲染后的文本（成功）或错误消息（被拒）。 */
  text: string
  value: unknown
}

const tools = new Map<string, ToolDef>()
let dispose: () => void = () => {}

/** 用给定的 targets 挂一次插件，把注册进来的工具定义收下来。 */
function mount(targets: Array<Record<string, unknown>>): void {
  const noop = (): void => {}
  const ctx = {
    logger: { info: noop, warn: noop },
    inject: (deps: string[], cb: (child: unknown) => void): void => {
      if (deps.includes('tools')) {
        cb({
          tools: {
            register: (def: ToolDef) => {
              tools.set(def.name, def)
              return noop
            },
          },
        })
      }
      if (deps.includes('systemPrompt')) cb({ systemPrompt: { section: () => noop } })
    },
    effect: (fn: () => () => void) => {
      dispose = fn()
    },
  }
  ;(apply as unknown as (ctx: unknown, config: unknown) => void)(ctx, {
    targets,
    settleMs: 300,
    noSandbox: NO_SANDBOX,
    chromePath: CHROME_PATH,
  })
}

/** 调一个工具：把「被拒」变成返回值而不是抛出去。 */
async function call(name: string, target: string, args: Record<string, unknown> = {}): Promise<CallResult> {
  const def = tools.get(name)
  if (def === undefined) throw new Error(`${name} 没注册上`)
  const input = { target, cwd: CWD, ...args }
  try {
    const value = await def.execute(input)
    return { ok: true, value, text: def.output.render(input, value).map((part) => part.text).join('\n') }
  } catch (error) {
    return { ok: false, value: undefined, text: error instanceof Error ? error.message : String(error) }
  }
}

/** 打开站点下的一个路径（用声明过的站点根，避免每条用例都写一遍）。 */
const openPath = (target: string, path: string): Promise<CallResult> =>
  call('site_open', target, { url: `${siteOrigin}${path}` })

/* ------------------------------------------------------------------ *
 * 起夹具：站点 + 一个真正的异源
 * ------------------------------------------------------------------ */

let site: Server | undefined
let foreign: Server | undefined
let siteOrigin = ''
let foreignOrigin = ''
/** 验活清单所在的项目目录（`site_verify` 按调用的 `cwd` 去找 `web/smoke.yaml`）。 */
let verifyProject = ''

const FOREIGN_PAGE = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>异源页</title></head>
<body><h1>FOREIGN ORIGIN PAGE</h1><input id="foreign-input" placeholder="异源输入框">
<div id="foreign-out">（异源页还没被动过）</div>
<script>
  document.getElementById('foreign-input').addEventListener('input', function () {
    document.getElementById('foreign-out').textContent = '异源页的 input 被触发了'
  })
</script></body></html>`

function pageFor(path: string): string | undefined {
  const table: Record<string, string> = {
    '/': INDEX,
    '/index.html': INDEX,
    '/detail.html': DETAIL,
    '/err.html': ERR,
    '/events.html': EVENTS,
    '/long.html': LONG,
    // 页面自己跳到异源（`open` 时合法，因为 URL 在声明范围内）——跨源判据的实验台。
    '/redirect.html': `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>重定向页</title></head>
<body><h1>重定向页（本站）</h1><script>location.replace(${JSON.stringify(foreignOrigin)} + '/')</script></body></html>`,
    // **跨源** iframe：验「iframe 内容会不会进 site_text」。
    '/frame.html': `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>iframe 页</title><link rel="icon" href="/favicon.ico"></head>
<body><h1>iframe 页</h1><p>本站文字：只有这一句是本站的</p>
<iframe src="${foreignOrigin}/" width="400" height="200"></iframe></body></html>`,
    // **同源** iframe：验「iframe 里的元素能不能点到」。
    '/nested.html': `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>同源 iframe 页</title><link rel="icon" href="/favicon.ico"></head>
<body><h1>同源 iframe 页</h1><p>本站文字：顶层这一句</p>
<iframe src="/inner.html" width="400" height="200"></iframe></body></html>`,
    '/inner.html': `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>iframe 内部页</title></head>
<body><h1>iframe 内部页</h1><button id="inner-btn">iframe 里的按钮</button>
<div id="inner-out">（iframe 内还没被点过）</div>
<script>
  document.getElementById('inner-btn').addEventListener('click', function () {
    document.getElementById('inner-out').textContent = 'iframe 里的按钮被点了'
  })
</script></body></html>`,
  }
  return table[path]
}

const listen = async (handler: Parameters<typeof createServer>[0]): Promise<{ server: Server; origin: string }> => {
  const server = createServer(handler)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  return { server, origin: `http://127.0.0.1:${String(port)}` }
}

describe.skipIf(!CAN_DRIVE_CHROME)('工具面端到端冒烟：七个工具 + 跨源闸门（真 Chrome）', () => {
  beforeAll(async () => {
    // 异源先起（站点页面里的 iframe / 重定向要引用它的地址）。
    const f = await listen((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(FOREIGN_PAGE)
    })
    foreign = f.server
    foreignOrigin = f.origin

    const s = await listen((req, res) => {
      const path = (req.url ?? '/').split('?')[0] ?? '/'
      if (path === '/favicon.ico') {
        // 故意 404：favicon 噪声规则要靠**真实报文**验（CDP 的正文里根本没有「favicon」这个词）。
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found')
        return
      }
      const page = pageFor(path)
      if (page === undefined) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404')
        return
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page)
    })
    site = s.server
    siteOrigin = s.origin

    /*
     * 验活清单：写进一个**项目目录**（`web/<项目>.yaml`），`site_verify` 按调用的 `cwd` 去找它。
     * 目录名就叫 `smoke`：`project` 参数不传，走「项目名 = cwd 的目录名」那条真实路径。
     * 断言刻意做成有公有私：3 个 URL / 6 条断言（含 1 条 warn、1 条注定失败），
     * 这样「一次取全的账」「三态」「告警不算失败」三件事在一条用例里都能看见。
     */
    const projectParent = mkdtempSync(join(tmpdir(), 'devfront-verify-'))
    verifyProject = join(projectParent, 'smoke')
    mkdirSync(join(verifyProject, 'web'), { recursive: true })
    writeFileSync(
      join(verifyProject, 'web', 'smoke.yaml'),
      JSON.stringify({
        version: 1,
        project: 'smoke',
        assertions: [
          { id: 'index-title', url: `${siteOrigin}/`, target: 'verify-fixture', expect: { toContain: '订单列表' }, severity: 'fail' },
          {
            id: 'index-total',
            url: `${siteOrigin}/`,
            target: 'verify-fixture',
            expect: { elementText: { selector: '#total', toContain: '合计' } },
            severity: 'fail',
          },
          { id: 'index-clean', url: `${siteOrigin}/`, target: 'verify-fixture', expect: { consoleClean: true }, severity: 'fail' },
          {
            id: 'index-warn',
            url: `${siteOrigin}/`,
            target: 'verify-fixture',
            expect: { toContain: '这一句页面上不可能有' },
            severity: 'warn',
          },
          {
            id: 'detail-status',
            url: `${siteOrigin}/detail.html`,
            target: 'verify-fixture',
            expect: { elementText: { selector: '#status', toContain: '已发货' } },
            severity: 'fail',
          },
          { id: 'err-clean', url: `${siteOrigin}/err.html`, target: 'verify-fixture', expect: { consoleClean: true }, severity: 'fail' },
        ],
      }),
    )

    mount([
      { id: 'local-fixture', label: '本地夹具', url: `${siteOrigin}/`, scopeDirs: [CWD] },
      {
        id: 'local-with-idp',
        label: '本地夹具（声明了异源源）',
        url: `${siteOrigin}/`,
        scopeDirs: [CWD],
        allowedOrigins: [foreignOrigin],
      },
      { id: 'foreign-fixture', label: '异源夹具', url: `${foreignOrigin}/`, scopeDirs: [CWD] },
      { id: 'verify-fixture', label: '验活清单夹具', url: `${siteOrigin}/`, scopeDirs: [verifyProject] },
      // 声明了一个凭据引用的站点：`site_fill` 的 `credentialRef` 只对它放行。
      {
        id: 'cred-fixture',
        label: '凭据引用夹具',
        url: `${siteOrigin}/`,
        scopeDirs: [CWD],
        credentialRef: 'env:DEVFRONT_SMOKE_PWD',
      },
    ])
  }, 60_000)

  afterAll(async () => {
    dispose()
    await new Promise<void>((resolve) => site?.close(() => resolve()) ?? resolve())
    await new Promise<void>((resolve) => foreign?.close(() => resolve()) ?? resolve())
    if (verifyProject !== '') rmSync(verifyProject, { recursive: true, force: true })
  })

  it('七个工具都注册上了（少一个，下面的用例会静默少守一条）', () => {
    expect([...tools.keys()].sort()).toEqual([
      'site_click',
      'site_console',
      'site_fill',
      'site_open',
      'site_shot',
      'site_text',
      'site_verify',
    ])
  })

  it('主流程：打开 → 可见文本 → 交互 → 截图，输出都按各自声明的契约', async () => {
    const opened = await call('site_open', 'local-fixture') // 不给 url = 站点根
    expect(opened.ok).toBe(true)
    expect(opened.text).toContain('标题：订单列表')

    const text = await call('site_text', 'local-fixture')
    expect(text.ok).toBe(true)
    expect(text.text).toContain('订单编号 CDQ-2026-001')
    // 末尾**始终**有全文长度：这个字段声明在 schema 里，就必须交付得到（曾经只在截断时出现）
    expect(text.text).toContain('（未截断）')

    // 干净页面：0 错误、0 告警。两条噪声是 favicon 404 与页面自己那行 `console.log`
    // ——**后者曾经被算成告警**，让干净页面凭空报「告警 1」。
    const consoleOut = await call('site_console', 'local-fixture')
    expect(consoleOut.text).toContain('本站错误 0、告警 0')
    expect(consoleOut.text).toContain('噪声构成：')
    expect(consoleOut.text).toMatch(/favicon-404 ×1/)
    expect(consoleOut.text).toMatch(/page-log ×1/)

    const filled = await call('site_fill', 'local-fixture', { selector: '#kw', value: 'CDQ' })
    // 回显键必须是 `selector`：曾经回 `{filled}`/`{clicked}`，与声明的 `additionalProperties: false`
    // 冲突 → **动作生效但工具报 invalid output**（agent 会去重试一个有副作用的动作）。
    expect(filled.ok).toBe(true)
    expect(filled.text).toContain('#kw')
    const clicked = await call('site_click', 'local-fixture', { selector: '#go' })
    expect(clicked.ok).toBe(true)
    expect(clicked.text).toContain('#go')
    expect((await call('site_text', 'local-fixture')).text).toContain('已按「CDQ」查询到 1 条')

    const shot = await call('site_shot', 'local-fixture')
    expect(shot.ok).toBe(true)
    expect((shot.value as { path?: string }).path).toMatch(/\.png$/)
  }, 60_000)

  it('`site_fill` 同时派发 input 与 change（不能靠「结果出现了」反推）', async () => {
    await openPath('local-fixture', '/events.html')
    await call('site_fill', 'local-fixture', { selector: '#probe', value: 'CDQ' })
    expect((await call('site_text', 'local-fixture')).text).toContain('已触发：input, change')
  }, 60_000)

  it('坏页：console.error 与**未捕获异常**两条通路都收得到', async () => {
    await openPath('local-fixture', '/err.html')
    const out = await call('site_console', 'local-fixture')
    expect(out.text).toContain('本站错误 2')
    // 告警/错误的**正文**必须给出去——只给计数等于「记下来了但不让人看」
    expect(out.text).toContain('订单行渲染失败：字段 total 缺失')
    expect(out.text).toContain('未捕获异常：订单行渲染失败')
  }, 60_000)

  it('长页：截断信号与全文长度都对，且与**页面自算的真值**一致', async () => {
    await openPath('local-fixture', '/long.html')
    const text = await call('site_text', 'local-fixture')
    const value = text.value as { text: string; truncated: boolean; length: number }
    expect(value.truncated).toBe(true)
    expect(value.text.length).toBe(4000)
    expect(value.length).toBeGreaterThan(4000)

    // 独立真值：页面自己写的 `document.body.innerText.length`（见 `LONG` 的注释）。
    // 与工具自报的数对不上，就说明截断逻辑或长度记账错了。
    const truth = /^(\d{6})/.exec(text.text)?.[1]
    expect(truth, '页面没把真值写在最前面').toBeDefined()
    expect(Number(truth)).toBe(value.length)
  }, 60_000)

  it('读放行：页面跳到异源之后，`site_text` / `site_shot` 仍然可用', async () => {
    // 登录 / SSO 会把页面带走，而「跳转后读页面、截图」是登录流程的必要部分。
    await openPath('local-fixture', '/redirect.html')
    expect((await call('site_text', 'local-fixture')).text).toContain('FOREIGN ORIGIN PAGE')
    expect((await call('site_shot', 'local-fixture')).ok).toBe(true)
  }, 60_000)

  it('★ 动手拒绝：异源页上 `site_click` / `site_fill` 一律拒，且页面**没被改动**', async () => {
    // 少了这道闸门，「审查入口」就退化成「审查入口，除非页面自己把你带出去」——
    // 任何一个声明站点上的跳转都能换来对任意源执行点击与填值的能力。
    await openPath('local-fixture', '/redirect.html')
    const clicked = await call('site_click', 'local-fixture', { selector: 'body' })
    expect(clicked.ok).toBe(false)
    expect(clicked.text.startsWith('[PAGE_ORIGIN_NOT_ALLOWED]')).toBe(true)
    expect(clicked.text).toContain(siteOrigin) // 「允许：<声明源>」要写清楚

    const filled = await call('site_fill', 'local-fixture', { selector: '#foreign-input', value: 'X' })
    expect(filled.ok).toBe(false)
    expect(filled.text.startsWith('[PAGE_ORIGIN_NOT_ALLOWED]')).toBe(true)

    // 反证：哨兵没被触发 = 异源页真的没被动过（「拒绝了」和「没生效」是两件事，都要验）
    expect((await call('site_text', 'local-fixture')).text).not.toContain('异源页的 input 被触发了')
  }, 60_000)

  it('★ 恢复路径：把那个源写进 `allowedOrigins` 之后动手真能生效（不是「放行但没做事」）', async () => {
    await openPath('local-fixture', '/redirect.html')
    const filled = await call('site_fill', 'local-with-idp', { selector: '#foreign-input', value: 'CDQ' })
    expect(filled.ok).toBe(true)
    // 光「返回成功」不算数：必须看到动作**落到页面上**。
    expect((await call('site_text', 'local-fixture')).text).toContain('异源页的 input 被触发了')
  }, 60_000)

  it('★ 多 target：授权按**调用里的 target** 查，两个 target 互不影响（页面状态是全局的）', async () => {
    await openPath('local-fixture', '/redirect.html')
    // 同一个页面（在异源上），只有 target 不同：
    expect((await call('site_click', 'local-fixture', { selector: 'body' })).ok).toBe(false)
    expect((await call('site_click', 'foreign-fixture', { selector: 'body' })).ok).toBe(true)
    // 反过来：B 声明了 8900，**不会**把 A 的授权一起放宽
    expect((await call('site_click', 'local-fixture', { selector: 'body' })).ok).toBe(false)
  }, 60_000)

  it('★ 二次导航：闸门每次按**当前页**重判，不留状态', async () => {
    await openPath('local-fixture', '/redirect.html')
    expect((await call('site_click', 'local-fixture', { selector: 'body' })).ok).toBe(false)
    // 回到本站（`open` 走的是入口判据，不受动作闸门影响——否则被跳走后就回不来了）
    await call('site_open', 'local-fixture')
    expect((await call('site_click', 'local-fixture', { selector: '#go' })).ok).toBe(true)
    // 再跳一次异源，又被拒（没有「放过一次就一直放过」的残留）
    await openPath('local-fixture', '/redirect.html')
    expect((await call('site_click', 'local-fixture', { selector: 'body' })).ok).toBe(false)
  }, 60_000)

  it('★ iframe：内部元素**结构性不可达**；点 iframe 元素本身按**顶层源**判', async () => {
    await openPath('local-fixture', '/nested.html')
    // `/nested.html` 里的 iframe 与顶层**同源**，仍然点不到——`querySelector` 不下钻子文档。
    // 所以「跨源 iframe 里的按钮被点，闸门核顶层源还是子框架源」这个问题不存在。
    const inner = await call('site_click', 'local-fixture', { selector: '#inner-btn' })
    expect(inner.ok).toBe(false)
    expect(inner.text).toContain('没命中')
    // 而 iframe **元素本身**在顶层文档里，点它判的是顶层源（本站 → 放行）
    expect((await call('site_click', 'local-fixture', { selector: 'iframe' })).ok).toBe(true)
    // iframe 内容既不进 `site_text`，也没被改动
    const text = await call('site_text', 'local-fixture')
    expect(text.text).toContain('顶层这一句')
    expect(text.text).not.toContain('iframe 里的按钮')
    expect(text.text).not.toContain('iframe 里的按钮被点了')
  }, 60_000)

  it('★ 跨源 iframe 的内容同样读不到（结构排除，不是靠规则挡）', async () => {
    await openPath('local-fixture', '/frame.html')
    const text = await call('site_text', 'local-fixture')
    expect(text.text).toContain('只有这一句是本站的')
    expect(text.text).not.toContain('FOREIGN ORIGIN PAGE')
  }, 60_000)

  it('入口闸门仍然有效：异源 `open` 与越界 `cwd` 都被拒，且带机器可判的码', async () => {
    const foreignOpen = await call('site_open', 'local-fixture', { url: `${foreignOrigin}/` })
    expect(foreignOpen.ok).toBe(false)
    expect(foreignOpen.text.startsWith('[SITE_NOT_ALLOWED]')).toBe(true)

    // 作用域闸门（与数据面共用 `scope.ts`）：空 = 处处拒绝
    const outOfScope = await call('site_open', 'local-fixture', { cwd: '/etc' })
    expect(outOfScope.ok).toBe(false)
    expect(outOfScope.text.startsWith('[OUT_OF_SCOPE]')).toBe(true)
  }, 60_000)

  it('★ site_verify：按项目清单跑一批断言（只开清单里的 URL，N 条断言一次取全）', async () => {
    const result = await call('site_verify', 'verify-fixture', { cwd: verifyProject })
    expect(result.ok, result.text).toBe(true)
    const value = result.value as {
      total: number
      passed: number
      failed: number
      warned: number
      unknown: number
      pages: number
      pagesObserved: number
      lines: Array<{ id: string; status: string; evidence: string[] }>
    }

    // 6 条断言落在 3 个 URL 上：打开 3 个页、观察 3 次——这就是「一次取全」的账。
    expect(value.total).toBe(6)
    expect(value.pages).toBe(3)
    expect(value.pagesObserved).toBe(3)

    const byId = new Map(value.lines.map((line) => [line.id, line.status]))
    expect(byId.get('index-title')).toBe('pass')
    expect(byId.get('index-total')).toBe('pass')
    // INDEX 只 console.log 过一行 + favicon 404（噪声）→ 干净。
    expect(byId.get('index-clean')).toBe('pass')
    expect(byId.get('index-warn')).toBe('fail')
    expect(value.warned).toBe(1)
    expect(byId.get('detail-status')).toBe('pass')
    // 坏页：console.error + 未捕获异常（后者不走 console API，是另一条通路）。
    expect(byId.get('err-clean')).toBe('fail')

    // 依据要看得到：坏页那条的证据里有 console 的正文，而不是只有「失败了」。
    const bad = value.lines.find((line) => line.id === 'err-clean')
    expect(bad?.evidence.some((line) => line.includes('订单行渲染失败'))).toBe(true)

    expect(result.text).toContain('本次只做了「打开 + 观察」')
    expect(result.text).not.toContain('undefined')
  }, 120_000)

  it('★ site_fill 用凭据引用填值：值真的进了页面，但**不进工具输出**', async () => {
    const SECRET = 's3cret-来自环境变量'
    process.env.DEVFRONT_SMOKE_PWD = SECRET
    try {
      await openPath('cred-fixture', '/index.html')
      const filled = await call('site_fill', 'cred-fixture', { selector: '#kw', credentialRef: 'env:DEVFRONT_SMOKE_PWD' })
      expect(filled.ok, filled.text).toBe(true)
      // 回显里有引用名与保护强度，**没有值**。
      expect(filled.text).toContain('env:DEVFRONT_SMOKE_PWD')
      expect(filled.text).toContain('方便，不是防护')
      expect(filled.text).not.toContain(SECRET)

      // 值确实到了页面：点一下查询，页面会把输入框里的值写进正文。
      await call('site_click', 'cred-fixture', { selector: '#go' })
      const text = await call('site_text', 'cred-fixture')
      expect(text.text).toContain(SECRET)
    } finally {
      delete process.env.DEVFRONT_SMOKE_PWD
    }
  }, 60_000)

  it('凭据引用：目标没声明的那个引用一律拒（真宿主也走同一条判据）', async () => {
    const rejected = await call('site_fill', 'cred-fixture', { selector: '#kw', credentialRef: 'env:SOMEONE_ELSE_PWD' })
    expect(rejected.ok).toBe(false)
    expect(rejected.text).toContain('CREDENTIAL_NOT_DECLARED')
  }, 60_000)
})
