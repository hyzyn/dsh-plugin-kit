/**
 * 跑批执行器（`web-run.ts`，工具 `site_verify` 的执行体）的用例。
 *
 * ## 这一层为什么必须单独测
 *
 * 它坐在两样东西中间：**清单**（`web-verify.ts` 的断言）与**驱动**（`page.ts` 的 `WebDriver`）。
 * 两头都有各自的用例，但「N 条断言怎么变成一次观察、一次拒绝怎么只砸到一页」这段接线**只有这里**能
 * 验——而它错了的症状很隐蔽：报告照样出来，只是「验不了」与「验出问题」被混成一句，
 * 或者同一个页面被读成两个不同的瞬间（SPA 下就是两条断言互相矛盾）。
 *
 * 不连浏览器：驱动是注入的，这里用假驱动把「开过哪些 URL、观察了几次、带没带对的选择器」记下来。
 */

import { describe, expect, it } from 'vitest'

import type { ConsoleMessage } from '../src/console.js'
import type { WebAuditEntry, WebDriver, WebTarget } from '../src/page.js'
import { runWebVerify } from '../src/web-run.js'
import { validateWebManifest, type PageObservation, type WebAssertion } from '../src/web-verify.js'

const CWD = '/work/app'
const SITE = 'https://app.test/'
const OTHER = 'https://other.test/'

const TARGET: WebTarget = { id: 'app', label: '应用', url: SITE, scopeDirs: [CWD] }

/** 一条本站资源的 console 错误（判 `consoleClean` 的失败信号）。 */
const SITE_ERROR: ConsoleMessage = { level: 'error', text: '渲染失败', sourceUrl: `${SITE}app.js`, pageUrl: SITE }

/**
 * 把夹具过一遍**真正的**清单校验器。
 *
 * 不手搓 `WebAssertion` 对象：校验器就是「什么算一条断言」的判据，手搓的夹具会让用例在
 * 校验器收紧之后仍然绿——那种绿是假的。
 */
function assertions(raw: readonly Record<string, unknown>[]): WebAssertion[] {
  const validated = validateWebManifest('app', { version: 1, project: 'app', assertions: raw })
  if (!validated.ok) throw new Error(`夹具不成立：${JSON.stringify(validated.errors)}`)
  return [...validated.manifest.assertions]
}

interface FakeDriver {
  driver: WebDriver
  /** 开过的 URL（按顺序）。 */
  opens: string[]
  /** 每次观察带上来的选择器。 */
  observedSelectors: string[][]
}

/**
 * 假驱动：`pages` 里给了哪个 URL，观察就返回那份事实；`throwsOnObserve` 里的 URL 观察时抛错。
 *
 * `open` 只记账（判定层已经决定它能不能开），观察时才真的「读页面」。
 */
function makeDriver(
  pages: Readonly<Record<string, PageObservation>>,
  options: { throwsOnObserve?: readonly string[] } = {},
): FakeDriver {
  const calls: FakeDriver = {
    opens: [],
    observedSelectors: [],
    driver: {
      open: async ({ url }) => {
        calls.opens.push(url)
        return { url, title: '页面' }
      },
      screenshot: async () => ({ path: '/tmp/shot.png' }),
      click: async () => {},
      fill: async () => {},
      text: async () => '',
      console: async () => [],
      observe: async ({ selectors }) => {
        const current = calls.opens[calls.opens.length - 1] ?? ''
        calls.observedSelectors.push([...selectors])
        if (options.throwsOnObserve?.includes(current) === true) throw new Error('页面正在导航')
        const observation = pages[current]
        if (observation === undefined) throw new Error(`夹具里没有 ${current} 的观察结果`)
        return observation
      },
      currentUrl: async () => SITE,
    },
  }
  return calls
}

/** 一份「页面都在、内容都对」的观察。 */
function goodPage(url: string, extra: Partial<PageObservation> = {}): PageObservation {
  return { url, text: '订单列表 订单编号 CDQ-2026-001', elements: {}, console: [], ...extra }
}

/** 收审计行（跑批自身 + 每一页的 open）。 */
function collector(): { entries: WebAuditEntry[]; sink: { record(entry: WebAuditEntry): void } } {
  const entries: WebAuditEntry[] = []
  return { entries, sink: { record: (entry) => entries.push(entry) } }
}

describe('跑批执行器：一次取全', () => {
  it('同一个 URL 上的多条断言只开一次、只观察一次；报告仍按清单顺序', async () => {
    const list = assertions([
      { id: 'a1', url: `${SITE}order`, target: 'app', severity: 'fail', expect: { toContain: '订单编号' } },
      { id: 'a2', url: `${SITE}detail`, target: 'app', severity: 'fail', expect: { toContain: '订单编号' } },
      { id: 'a3', url: `${SITE}order`, target: 'app', severity: 'fail', expect: { toContain: '合计' } },
    ])
    const { driver, opens, observedSelectors } = makeDriver({
      [`${SITE}order`]: goodPage(`${SITE}order`),
      [`${SITE}detail`]: goodPage(`${SITE}detail`),
    })

    const result = await runWebVerify({ target: TARGET, cwd: CWD, project: 'app', assertions: list, driver })

    expect(opens).toEqual([`${SITE}order`, `${SITE}detail`])
    expect(observedSelectors).toHaveLength(2)
    expect(result.pages).toEqual([`${SITE}order`, `${SITE}detail`])
    expect(result.pagesObserved).toBe(2)
    // 3 条断言 / 2 次观察 —— 这就是「N 条断言一次取全」的账。
    expect(result.results.map((item) => item.id)).toEqual(['a1', 'a2', 'a3'])
    expect(result.summary.total).toBe(3)
  })

  it('观察时带着**这一页**需要的全部选择器（不是逐条问一遍，也不带别页的）', async () => {
    const list = assertions([
      {
        id: 'a1',
        url: `${SITE}order`,
        target: 'app',
        severity: 'fail',
        expect: { elementExists: '#total', elementText: { selector: '#status', toContain: '已发货' } },
      },
      { id: 'a2', url: `${SITE}order`, target: 'app', severity: 'fail', expect: { elementExists: '#go' } },
      { id: 'a3', url: `${SITE}detail`, target: 'app', severity: 'fail', expect: { elementExists: '#other' } },
    ])
    const { driver, observedSelectors } = makeDriver({
      [`${SITE}order`]: goodPage(`${SITE}order`, {
        elements: {
          '#total': { count: 1, text: '合计 1,234.00' },
          '#status': { count: 1, text: '状态：已发货' },
          '#go': { count: 1, text: '查询' },
        },
      }),
      [`${SITE}detail`]: goodPage(`${SITE}detail`, { elements: { '#other': { count: 1 } } }),
    })

    const result = await runWebVerify({ target: TARGET, cwd: CWD, project: 'app', assertions: list, driver })

    expect(observedSelectors[0]?.sort()).toEqual(['#go', '#status', '#total'])
    expect(observedSelectors[1]).toEqual(['#other'])
    expect(result.summary.overall).toBe('pass')
  })
})

describe('跑批执行器：三态都要能出', () => {
  it('通过 / 失败 / 验不了 各自按依据分开（不是一句「失败了」）', async () => {
    const list = assertions([
      { id: 'pass', url: `${SITE}order`, target: 'app', severity: 'fail', expect: { toContain: '订单编号' } },
      { id: 'fail', url: `${SITE}order`, target: 'app', severity: 'fail', expect: { toContain: '不存在的字' } },
      { id: 'unknown', url: `${SITE}order`, target: 'app', severity: 'fail', expect: { elementExists: '#nope' } },
      { id: 'warn', url: `${SITE}order`, target: 'app', severity: 'warn', expect: { toContain: '不存在的字' } },
    ])
    const { driver } = makeDriver({ [`${SITE}order`]: goodPage(`${SITE}order`, { elements: {} }) })

    const result = await runWebVerify({ target: TARGET, cwd: CWD, project: 'app', assertions: list, driver })

    const byId = new Map(result.results.map((item) => [item.id, item]))
    expect(byId.get('pass')?.status).toBe('pass')
    expect(byId.get('fail')?.status).toBe('fail')
    expect(byId.get('unknown')?.status).toBe('unknown')
    expect(byId.get('warn')?.status).toBe('fail')
    expect(result.summary).toMatchObject({ total: 4, passed: 1, failed: 1, warned: 1, unknown: 1, overall: 'fail' })
    // 依据（期望 vs 实际）要带在结果里——只有「失败了」三个字等于把复核推回给调用方。
    expect(byId.get('fail')?.diff.some((line) => line.op === 'toContain' && line.verdict === 'fail')).toBe(true)
  })

  it('consoleClean：本站错误判失败，页面自己的 log 不算', async () => {
    const list = assertions([
      { id: 'a1', url: `${SITE}order`, target: 'app', severity: 'fail', expect: { consoleClean: true } },
    ])
    const bad = makeDriver({ [`${SITE}order`]: goodPage(`${SITE}order`, { console: [SITE_ERROR] }) })
    const clean = makeDriver({
      [`${SITE}order`]: goodPage(`${SITE}order`, {
        console: [{ level: 'log', text: '页面已渲染', sourceUrl: `${SITE}app.js`, pageUrl: SITE }],
      }),
    })

    const failed = await runWebVerify({ target: TARGET, cwd: CWD, project: 'app', assertions: list, driver: bad.driver })
    const passed = await runWebVerify({ target: TARGET, cwd: CWD, project: 'app', assertions: list, driver: clean.driver })

    expect(failed.results[0]?.status).toBe('fail')
    expect(passed.results[0]?.status).toBe('pass')
  })

  it('选择器不合法 → `unknown`（不是「元素不存在」），且带得出浏览器的报错', async () => {
    const list = assertions([
      { id: 'a1', url: `${SITE}order`, target: 'app', severity: 'fail', expect: { elementExists: 'div[' } },
    ])
    const { driver } = makeDriver({
      [`${SITE}order`]: goodPage(`${SITE}order`, { elements: { 'div[': { count: 0, error: 'is not a valid selector' } } }),
    })

    const result = await runWebVerify({ target: TARGET, cwd: CWD, project: 'app', assertions: list, driver })

    expect(result.results[0]?.status).toBe('unknown')
    expect(result.results[0]?.message).toContain('选择器不合法')
    // 浏览器那句话要**原样带出来**（在证据里）：只报「不合法」而不给原因，等于让人去猜为什么。
    expect(result.results[0]?.diff.some((line) => String(line.got).includes('is not a valid selector'))).toBe(true)
  })
})

describe('跑批执行器：一页出问题不许把整批带下去', () => {
  it('越界的 URL 只把**那一页**判「验不了」，并进 problems；别的页面照跑', async () => {
    const list = assertions([
      { id: 'bad', url: `${OTHER}x`, target: 'app', severity: 'fail', expect: { toContain: '订单编号' } },
      { id: 'good', url: `${SITE}order`, target: 'app', severity: 'fail', expect: { toContain: '订单编号' } },
    ])
    const { driver, opens } = makeDriver({ [`${SITE}order`]: goodPage(`${SITE}order`) })

    const result = await runWebVerify({ target: TARGET, cwd: CWD, project: 'app', assertions: list, driver })

    const byId = new Map(result.results.map((item) => [item.id, item]))
    expect(byId.get('bad')?.status).toBe('unknown')
    // 拒绝话术要带码：`[SITE_NOT_ALLOWED]` 是 agent 唯一能据以行动的东西。
    expect(byId.get('bad')?.message).toContain('SITE_NOT_ALLOWED')
    expect(byId.get('good')?.status).toBe('pass')
    expect(result.problems).toHaveLength(1)
    expect(result.problems[0]?.url).toBe(`${OTHER}x`)
    expect(result.problems[0]?.code).toBe('SITE_NOT_ALLOWED')
    // 越界的那个 URL **不该**被驱动打开。
    expect(opens).toEqual([`${SITE}order`])
    expect(result.pagesObserved).toBe(1)
  })

  it('作用域为空 = 处处拒绝：每一页都判「验不了」，且一次都没开', async () => {
    const list = assertions([
      { id: 'a1', url: `${SITE}order`, target: 'app', severity: 'fail', expect: { toContain: '订单编号' } },
    ])
    const { driver, opens, observedSelectors } = makeDriver({})

    const result = await runWebVerify({
      target: { ...TARGET, scopeDirs: [] },
      cwd: CWD,
      project: 'app',
      assertions: list,
      driver,
    })

    expect(result.results[0]?.status).toBe('unknown')
    expect(result.results[0]?.message).toContain('OUT_OF_SCOPE')
    expect(opens).toEqual([])
    expect(observedSelectors).toEqual([])
    expect(result.summary.overall).toBe('unknown')
  })

  it('观察失败（页面正在导航）也只是一页的账', async () => {
    const list = assertions([
      { id: 'a1', url: `${SITE}order`, target: 'app', severity: 'fail', expect: { toContain: '订单编号' } },
      { id: 'a2', url: `${SITE}detail`, target: 'app', severity: 'fail', expect: { toContain: '订单编号' } },
    ])
    const { driver } = makeDriver({ [`${SITE}detail`]: goodPage(`${SITE}detail`) }, { throwsOnObserve: [`${SITE}order`] })

    const result = await runWebVerify({ target: TARGET, cwd: CWD, project: 'app', assertions: list, driver })

    const byId = new Map(result.results.map((item) => [item.id, item]))
    expect(byId.get('a1')?.status).toBe('unknown')
    expect(byId.get('a1')?.message).toContain('页面正在导航')
    expect(byId.get('a2')?.status).toBe('pass')
    expect(result.problems[0]?.code).toBeUndefined()
    expect(result.pagesObserved).toBe(1)
  })
})

describe('跑批执行器：审计', () => {
  it('每一次开页进审计（含被拒的那一次），跑批自身也留一行', async () => {
    const list = assertions([
      { id: 'a1', url: `${SITE}order`, target: 'app', severity: 'fail', expect: { toContain: '订单编号' } },
      { id: 'a2', url: `${OTHER}x`, target: 'app', severity: 'fail', expect: { toContain: '订单编号' } },
    ])
    const { driver } = makeDriver({ [`${SITE}order`]: goodPage(`${SITE}order`) })
    const { entries, sink } = collector()

    await runWebVerify({ target: TARGET, cwd: CWD, project: 'app', assertions: list, driver, audit: sink })

    const opens = entries.filter((entry) => entry.action === 'open')
    expect(opens.map((entry) => [entry.subject, entry.allowed])).toEqual([
      [`${SITE}order`, true],
      [`${OTHER}x`, false],
    ])
    // 跑批自身一行：谁在什么时候验了哪个项目。
    const runs = entries.filter((entry) => entry.action === 'verify')
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({ targetId: 'app', allowed: true, subject: 'app' })
  })

  it('审计写不进去时抛（fail-closed），而不是悄悄跑完', async () => {
    const list = assertions([
      { id: 'a1', url: `${SITE}order`, target: 'app', severity: 'fail', expect: { toContain: '订单编号' } },
    ])
    const { driver } = makeDriver({ [`${SITE}order`]: goodPage(`${SITE}order`) })

    await expect(
      runWebVerify({
        target: TARGET,
        cwd: CWD,
        project: 'app',
        assertions: list,
        driver,
        audit: {
          record: () => {
            throw new Error('审计文件写不进去')
          },
        },
      }),
    ).rejects.toThrow('审计文件写不进去')
  })
})

describe('跑批执行器：调用方取消（根 ROADMAP 待办第 12 项）', () => {
  it('★ 取消之后不再开新页面：已验的照旧有结论，没跑到的判「验不了」而不是「失败」', async () => {
    const list = assertions([
      { id: 'a1', url: `${SITE}one`, target: 'app', severity: 'fail', expect: { toContain: '订单编号' } },
      { id: 'a2', url: `${SITE}two`, target: 'app', severity: 'fail', expect: { toContain: '订单编号' } },
      { id: 'a3', url: `${SITE}three`, target: 'app', severity: 'fail', expect: { toContain: '订单编号' } },
    ])
    const controller = new AbortController()
    // 第一页验完就取消：后面两页不该被打开。
    const opened: string[] = []
    const rig = makeDriver({
      [`${SITE}one`]: goodPage(`${SITE}one`),
      [`${SITE}two`]: goodPage(`${SITE}two`),
      [`${SITE}three`]: goodPage(`${SITE}three`),
    })
    // 包一层：既记账，又**转调**假驱动的 open（它的观察依赖自己那份「当前页」账）。
    const base = rig.driver
    const driver: WebDriver = {
      ...base,
      open: async (input) => {
        opened.push(input.url)
        // 第一页刚打开就取消：后面两页不该再被打开。
        if (opened.length === 1) controller.abort()
        return base.open(input)
      },
    }

    const result = await runWebVerify({
      target: TARGET,
      cwd: CWD,
      project: 'app',
      assertions: list,
      driver,
      signal: controller.signal,
    })

    expect(opened).toEqual([`${SITE}one`])
    expect(result.cancelled).toBe(true)
    expect(result.pagesObserved).toBe(1)
    const byId = new Map(result.results.map((item) => [item.id, item]))
    expect(byId.get('a1')?.status).toBe('pass')
    expect(byId.get('a2')?.status).toBe('unknown')
    expect(byId.get('a3')?.status).toBe('unknown')
    expect(byId.get('a2')?.message).toContain('被调用方取消')
    // 没跑到 ≠ 失败：报 fail 会让 agent 去查页面，而实际只是没人等了。
    expect(result.summary.failed).toBe(0)
    expect(result.summary.unknown).toBe(2)
  })

  it('已经取消的信号 → 一个页面都不开（但每条断言都有结论）', async () => {
    const list = assertions([
      { id: 'a1', url: `${SITE}one`, target: 'app', severity: 'fail', expect: { toContain: '订单编号' } },
    ])
    const controller = new AbortController()
    controller.abort()
    const { driver, opens } = makeDriver({ [`${SITE}one`]: goodPage(`${SITE}one`) })

    const result = await runWebVerify({
      target: TARGET,
      cwd: CWD,
      project: 'app',
      assertions: list,
      driver,
      signal: controller.signal,
    })

    expect(opens).toEqual([])
    expect(result.cancelled).toBe(true)
    expect(result.results).toHaveLength(1)
    expect(result.results[0]?.status).toBe('unknown')
  })

  it('没取消时 `cancelled` 是 false（这条字段不是常真）', async () => {
    const list = assertions([
      { id: 'a1', url: `${SITE}one`, target: 'app', severity: 'fail', expect: { toContain: '订单编号' } },
    ])
    const { driver } = makeDriver({ [`${SITE}one`]: goodPage(`${SITE}one`) })
    const result = await runWebVerify({ target: TARGET, cwd: CWD, project: 'app', assertions: list, driver })
    expect(result.cancelled).toBe(false)
  })
})
