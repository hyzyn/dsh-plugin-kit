/**
 * 前端验证工具面测试（`docs/devdata-plan.md` §15.2 / §15.3）。
 *
 * 这一组用例守两件事：
 *   1. **白名单**——未登记的动作一律拒，且「不做定时 / 爬虫 / 批量」这条边界靠**动作不存在**来守，
 *      不靠纪律（纪律没有守卫，会在下一次改动里漂掉）；
 *   2. **站点范围**——`open` 只能落在目标声明的站点之内。给一个 URL 就能打开，
 *      是最容易被顺手扩成爬虫的地方。
 */

import { describe, expect, it } from 'vitest'

import {
  WEB_ACTIONS,
  WEB_REJECTION_CODES,
  adjudicateWebAction,
  allowedActionOrigins,
  invokeWebAction,
  isWebAction,
  pageOriginAllowed,
  urlAllowed,
  type ConsoleMessage,
  type WebAction,
  type WebAuditEntry,
  type WebDriver,
  type WebTarget,
} from '../src/index.js'

const CWD = '/work/cdqas'
const SITE = 'https://cdqas.example.com/'

/** 造一个站点目标。 */
function target(overrides: Partial<WebTarget> = {}): WebTarget {
  return { id: 'w-cdqas', label: '海关前端', url: SITE, scopeDirs: [CWD], ...overrides }
}

/** 造一次请求。 */
function request(overrides: Partial<Parameters<typeof adjudicateWebAction>[0]> = {}) {
  return { target: target(), action: 'open' as WebAction, cwd: CWD, ...overrides }
}

describe('§15.3 边界：不做定时 / 爬虫 / 批量', () => {
  it('动作清单里**根本没有**这些动作（靠不存在来守，不靠纪律）', () => {
    const forbidden = ['batch', 'crawl', 'spider', 'schedule', 'cron', 'loop', 'repeat', 'queue', 'download']
    for (const name of forbidden) {
      expect(WEB_ACTIONS as readonly string[], `${name} 不该是前端验证的动作`).not.toContain(name)
    }
  })

  it('动作清单就是那六个（加动作要显式决定，不会顺手多出来）', () => {
    expect([...WEB_ACTIONS].sort()).toEqual(['click', 'console', 'fill', 'open', 'shot', 'text'])
  })

  it('未登记的动作一律拒，且提示里说清「这是验证工具不是自动化工具」', () => {
    const decision = adjudicateWebAction(request({ action: 'crawl' as WebAction }))
    expect(decision.allowed).toBe(false)
    expect(decision.allowed === false && decision.code).toBe(WEB_REJECTION_CODES.UNKNOWN_ACTION)
    expect(decision.allowed === false && decision.hint).toContain('验证')
  })

  it('isWebAction 只认登记过的', () => {
    for (const action of WEB_ACTIONS) expect(isWebAction(action)).toBe(true)
    for (const bad of ['crawl', 'OPEN', 'open ', '']) expect(isWebAction(bad)).toBe(false)
  })
})

describe('目录作用域（与数据面共用同一份实现）', () => {
  it('作用域外拒，且提示说清「缺省拒绝」', () => {
    const decision = adjudicateWebAction(request({ cwd: '/work/other' }))
    expect(decision.allowed === false && decision.code).toBe(WEB_REJECTION_CODES.OUT_OF_SCOPE)
    expect(decision.allowed === false && decision.hint).toContain('scopeDirs')
  })

  it('**没声明作用域 = 处处拒绝**', () => {
    const decision = adjudicateWebAction(request({ target: target({ scopeDirs: undefined }) }))
    expect(decision.allowed === false && decision.code).toBe(WEB_REJECTION_CODES.OUT_OF_SCOPE)
  })

  it('空数组与全空串也算没声明', () => {
    for (const scopeDirs of [[], ['  ']]) {
      expect(adjudicateWebAction(request({ target: target({ scopeDirs }) })).allowed, JSON.stringify(scopeDirs)).toBe(false)
    }
  })

  it('子目录在作用域内；兄弟目录不在（`/work/cdqas2` 不算 `/work/cdqas`）', () => {
    // 注意带上 URL：`open` 缺 URL 会先在**参数**判据上被拒，那样就测不到作用域这一道了。
    expect(adjudicateWebAction(request({ cwd: '/work/cdqas/sub', url: SITE })).allowed).toBe(true)
    expect(adjudicateWebAction(request({ cwd: '/work/cdqas2', url: SITE })).allowed).toBe(false)
  })
})

describe('站点范围：open 只能落在声明过的站点里', () => {
  it('同源且在同前缀内 → 放行', () => {
    const decision = adjudicateWebAction(request({ url: 'https://cdqas.example.com/order/list' }))
    expect(decision.allowed).toBe(true)
    expect(decision.allowed === true && decision.url).toBe('https://cdqas.example.com/order/list')
  })

  it('**异源 → 拒**（换域名不能让验活跑到别的站点上）', () => {
    const decision = adjudicateWebAction(request({ url: 'https://evil.example.com/' }))
    expect(decision.allowed === false && decision.code).toBe(WEB_REJECTION_CODES.SITE_NOT_ALLOWED)
  })

  it('**越出声明路径前缀 → 拒**（只判同源会让任意路径都能打开）', () => {
    const decision = adjudicateWebAction(request({ target: target({ url: 'https://cdqas.example.com/app/' }), url: 'https://cdqas.example.com/admin' }))
    expect(decision.allowed === false && decision.code).toBe(WEB_REJECTION_CODES.SITE_NOT_ALLOWED)
  })

  it('前缀按目录比：声明 `/app/` 时，`/app/x` 在范围内而 `/appx` 不在', () => {
    const site = 'https://a.com/app/'
    expect(urlAllowed('https://a.com/app/x', site)).toBe(true)
    expect(urlAllowed('https://a.com/app/x/y', site)).toBe(true)
    expect(urlAllowed('https://a.com/app/', site)).toBe(true)
    // 这两条是「按目录比」的要点：前缀比较会把它们误判成命中。
    expect(urlAllowed('https://a.com/appx', site)).toBe(false)
    expect(urlAllowed('https://a.com/appx/y', site)).toBe(false)
  })

  it('声明 `/app`（无尾斜杠）时 `/app` 本身与 `/app/x` 都在范围内', () => {
    const site = 'https://a.com/app'
    expect(urlAllowed('https://a.com/app', site)).toBe(true)
    expect(urlAllowed('https://a.com/app/x', site)).toBe(true)
    expect(urlAllowed('https://a.com/appx', site)).toBe(false)
  })

  it('协议与端口算在源里', () => {
    expect(urlAllowed('http://a.com/', 'https://a.com/')).toBe(false)
    expect(urlAllowed('https://a.com:8443/', 'https://a.com/')).toBe(false)
  })

  it('URL 不合法 → 无法判断 → 拒（不默认放行）', () => {
    expect(urlAllowed('not a url', SITE)).toBeUndefined()
    const decision = adjudicateWebAction(request({ url: 'not a url' }))
    expect(decision.allowed === false && decision.code).toBe(WEB_REJECTION_CODES.SITE_NOT_ALLOWED)
  })

  it('目标没声明站点（或声明得不是 http/https）→ 拒', () => {
    for (const url of [undefined, '', 'ftp://a.com/', 'not a url']) {
      const decision = adjudicateWebAction(request({ target: target({ url: url as string }) }))
      expect(decision.allowed === false && decision.code, String(url)).toBe(WEB_REJECTION_CODES.SITE_NOT_DECLARED)
    }
  })

  it('不给 URL → 打开**站点根**（最常见的一次调用，不该逼调用方抄一遍已声明的 URL）', () => {
    const decision = adjudicateWebAction(request({ url: undefined }))
    expect(decision.allowed).toBe(true)
    expect(decision.allowed === true && decision.url).toBe(SITE)
  })

  it('空串 / 全空白也算没给', () => {
    for (const url of ['', '   ']) {
      const decision = adjudicateWebAction(request({ url }))
      expect(decision.allowed, JSON.stringify(url)).toBe(true)
      expect(decision.allowed === true && decision.url).toBe(SITE)
    }
  })

  it('**站点范围只作用于 open**（其余动作作用于已打开的那个页面）', () => {
    // 这就是为什么 `click` 不该再要一个 URL 参数：多一个 URL 参数就是多一个爬虫入口。
    for (const action of ['shot', 'click', 'fill', 'text', 'console'] as const) {
      const extra = action === 'click' ? { selector: '#q' } : action === 'fill' ? { selector: '#q', value: 'x' } : {}
      const decision = adjudicateWebAction(request({ action, ...extra }))
      expect(decision.allowed, action).toBe(true)
    }
  })
})

describe('参数要求', () => {
  it('click / fill 需要选择器（不做「按坐标点击」——那没有可复审的选择依据）', () => {
    for (const action of ['click', 'fill'] as const) {
      const decision = adjudicateWebAction(request({ action }))
      expect(decision.allowed === false && decision.code, action).toBe(WEB_REJECTION_CODES.ARGUMENT_MISSING)
      expect(decision.allowed === false && decision.hint, action).toContain('CSS')
    }
  })

  it('选择器是空串 / 空白也算没给', () => {
    expect(adjudicateWebAction(request({ action: 'click', selector: '   ' })).allowed).toBe(false)
  })

  it('fill 需要值（空串是合法值——用户可能就是想清空输入框）', () => {
    expect(adjudicateWebAction(request({ action: 'fill', selector: '#q' })).allowed).toBe(false)
    expect(adjudicateWebAction(request({ action: 'fill', selector: '#q', value: '' })).allowed).toBe(true)
  })
})

/** 记录调用的假驱动。 */
function fakeDriver(overrides: Partial<WebDriver> = {}): { driver: WebDriver; calls: string[] } {
  const calls: string[] = []
  const driver: WebDriver = {
    open: (input) => {
      calls.push(`open:${input.url}`)
      return Promise.resolve({ url: input.url, title: '假页面' })
    },
    screenshot: () => {
      calls.push('screenshot')
      return Promise.resolve({ path: '/tmp/shot.png', width: 1440, height: 900 })
    },
    click: (input) => {
      calls.push(`click:${input.selector}`)
      return Promise.resolve()
    },
    fill: (input) => {
      calls.push(`fill:${input.selector}=${input.value}`)
      return Promise.resolve()
    },
    text: () => {
      calls.push('text')
      return Promise.resolve('订单编号 CDQ-2026-001')
    },
    console: () => {
      calls.push('console')
      const messages: ConsoleMessage[] = [{ level: 'error', text: 'boom', sourceUrl: 'https://cdqas.example.com/a.js', pageUrl: SITE }]
      return Promise.resolve(messages)
    },
    // 缺省「当前页面」就是声明站点本身——绝大多数用例要的是这个前提。
    // **刻意不进 `calls`**：它是每次动手前都要问的一次**探测**，不是动作；
    // 记进去会让所有既有的「驱动被调用了哪些动作」断言多出一串噪声。
    currentUrl: () => Promise.resolve(`${SITE}order`),
    ...overrides,
  }
  return { driver, calls }
}

describe('调用：先裁决再执行，每次都进审计', () => {
  it('被拒的动作**不进入执行路径**', async () => {
    const { driver, calls } = fakeDriver()
    const outcome = await invokeWebAction({ request: request({ action: 'crawl' as WebAction }), driver })
    expect(outcome.ok).toBe(false)
    expect(calls).toEqual([])
  })

  it('作用域外同样不执行', async () => {
    const { driver, calls } = fakeDriver()
    const outcome = await invokeWebAction({ request: request({ cwd: '/work/other' }), driver })
    expect(outcome.ok === false && outcome.code).toBe(WEB_REJECTION_CODES.OUT_OF_SCOPE)
    expect(calls).toEqual([])
  })

  it('放行后执行并对上驱动的调用', async () => {
    const { driver, calls } = fakeDriver()
    const outcome = await invokeWebAction({ request: request({ url: 'https://cdqas.example.com/order' }), driver })
    expect(outcome.ok).toBe(true)
    expect(calls).toEqual(['open:https://cdqas.example.com/order'])
  })

  it('console 动作返回**已分类**的结果与汇总', async () => {
    const { driver } = fakeDriver()
    const outcome = await invokeWebAction({ request: request({ action: 'console' }), driver })
    expect(outcome.ok).toBe(true)
    const result = outcome.ok ? (outcome.result as { summary: { errors: unknown[]; total: number } }) : undefined
    expect(result?.summary.total).toBe(1)
    expect(result?.summary.errors).toHaveLength(1)
  })

  it('驱动抛错 → EXECUTION_FAILED（与「被闸门拦下」分开）', async () => {
    // 两者的后续动作完全不同：一个是改配置，一个是查站点。
    const { driver } = fakeDriver({ open: () => Promise.reject(new Error('ECONNREFUSED')) })
    const outcome = await invokeWebAction({ request: request({ url: 'https://cdqas.example.com/' }), driver })
    expect(outcome.ok === false && outcome.code).toBe(WEB_REJECTION_CODES.EXECUTION_FAILED)
    expect(outcome.ok === false && outcome.message).toBe('ECONNREFUSED')
  })

  it('放行、拒绝两种都进审计（记的是「试过什么」）', async () => {
    const entries: WebAuditEntry[] = []
    const audit = { record: (entry: WebAuditEntry) => entries.push(entry) }
    const { driver } = fakeDriver()

    await invokeWebAction({ request: request({ url: SITE }), driver, audit })
    await invokeWebAction({ request: request({ url: 'https://evil.example.com/' }), driver, audit })
    await invokeWebAction({ request: request({ cwd: '/work/other' }), driver, audit })

    expect(entries).toHaveLength(3)
    expect(entries[0]?.allowed).toBe(true)
    expect(entries[1]?.allowed).toBe(false)
    expect(entries[1]?.code).toBe(WEB_REJECTION_CODES.SITE_NOT_ALLOWED)
    expect(entries[2]?.code).toBe(WEB_REJECTION_CODES.OUT_OF_SCOPE)
  })

  it('审计带上 operationId 与被操作对象（URL）', async () => {
    const entries: WebAuditEntry[] = []
    const audit = { record: (entry: WebAuditEntry) => entries.push(entry) }
    const { driver } = fakeDriver()
    await invokeWebAction({ request: request({ url: SITE }), driver, audit, operationId: 'op-1' })
    expect(entries[0]?.operationId).toBe('op-1')
    expect(entries[0]?.subject).toBe(SITE)
  })

  it('**审计 sink 抛错不吞掉**（调用方据此实现 fail closed）', async () => {
    const audit = {
      record: () => {
        throw new Error('审计盘不可写')
      },
    }
    const { driver } = fakeDriver()
    await expect(invokeWebAction({ request: request({ url: SITE }), driver, audit })).rejects.toThrow('审计盘不可写')
  })

  it('shot 把输出路径透传给驱动', async () => {
    const { driver, calls } = fakeDriver()
    const outcome = await invokeWebAction({ request: request({ action: 'shot', path: '/tmp/out.png' }), driver })
    expect(outcome.ok).toBe(true)
    expect(calls).toEqual(['screenshot'])
  })

  it('text / click / fill 的返回值与调用都对得上', async () => {
    const { driver, calls } = fakeDriver()
    expect((await invokeWebAction({ request: request({ action: 'text' }), driver })).ok).toBe(true)
    expect((await invokeWebAction({ request: request({ action: 'click', selector: '#q' }), driver })).ok).toBe(true)
    expect((await invokeWebAction({ request: request({ action: 'fill', selector: '#q', value: 'v' }), driver })).ok).toBe(true)
    expect(calls).toEqual(['text', 'click:#q', 'fill:#q=v'])
  })
})

/* ------------------------------------------------------------------ *
 * ★ 当前页面源判据（2026-10-02 验收实测出的绕过面）
 *
 * `open` 的站点范围判据只管**入口 URL**：页面自己 `location.replace` 到别的源是浏览器行为，
 * 驱动拦不住。少了这道，任何一个声明站点上的跳转（登录 / SSO / 第三方重定向 / 被投毒的页面）
 * 都能换来对**任意源**执行点击与填值的能力。实测过：修复前 click 与 fill 在异源页上都会成功。
 * ------------------------------------------------------------------ */

describe('★ 动作前核实时页面源：读放行，动手不放行', () => {
  const FOREIGN = 'https://evil.example.com/'
  /** 造一个「当前页面在异源」的驱动。 */
  const onForeignPage = (extraTarget: Partial<WebTarget> = {}) => {
    const { driver, calls } = fakeDriver({ currentUrl: () => Promise.resolve(`${FOREIGN}login`) })
    const foreignTarget = target(extraTarget)
    return { driver, calls, foreignTarget }
  }

  it('异源页上 click 被拒，且**驱动根本没被调用**（拦在动手之前）', async () => {
    const { driver, calls, foreignTarget } = onForeignPage()
    const outcome = await invokeWebAction({
      request: { target: foreignTarget, action: 'click', cwd: CWD, selector: '#q' },
      driver,
    })
    expect(outcome.ok).toBe(false)
    expect(outcome.ok === false && outcome.code).toBe(WEB_REJECTION_CODES.PAGE_ORIGIN_NOT_ALLOWED)
    expect(calls).toEqual([])
  })

  it('异源页上 fill 同样被拒（验收只测了 click，这里是补上的直接证据）', async () => {
    const { driver, calls, foreignTarget } = onForeignPage()
    const outcome = await invokeWebAction({
      request: { target: foreignTarget, action: 'fill', cwd: CWD, selector: '#q', value: 'v' },
      driver,
    })
    expect(outcome.ok).toBe(false)
    expect(outcome.ok === false && outcome.code).toBe(WEB_REJECTION_CODES.PAGE_ORIGIN_NOT_ALLOWED)
    expect(calls).toEqual([])
  })

  it('异源页上**读**仍然放行（登录跳转必须靠它）', async () => {
    const { driver, foreignTarget } = onForeignPage()
    for (const action of ['text', 'shot', 'console'] as const) {
      const outcome = await invokeWebAction({ request: { target: foreignTarget, action, cwd: CWD }, driver })
      expect(outcome.ok, action).toBe(true)
    }
  })

  it('把那个源写进 allowedOrigins 之后，动手才放行（授权是一次显式声明）', async () => {
    const { driver, calls, foreignTarget } = onForeignPage({ allowedOrigins: [FOREIGN] })
    const outcome = await invokeWebAction({
      request: { target: foreignTarget, action: 'click', cwd: CWD, selector: '#q' },
      driver,
    })
    expect(outcome.ok).toBe(true)
    expect(calls).toEqual(['click:#q'])
  })

  it('**读不到当前页面源 → 拒绝**（不知道在谁的页面上，就不动手）', async () => {
    const { driver, calls } = fakeDriver({ currentUrl: () => Promise.resolve(undefined) })
    const outcome = await invokeWebAction({
      request: { target: target(), action: 'click', cwd: CWD, selector: '#q' },
      driver,
    })
    expect(outcome.ok).toBe(false)
    expect(outcome.ok === false && outcome.code).toBe(WEB_REJECTION_CODES.PAGE_ORIGIN_NOT_ALLOWED)
    expect(calls).toEqual([])
  })

  it('open 走自己的入口判据，不受这道影响', async () => {
    // 就算「当前页面」在异源（比如刚被跳走），open 一个已声明的 URL 仍应放行——
    // 否则一旦被跳到异源，agent 连「回到声明站点」都做不到。
    const { driver } = fakeDriver({ currentUrl: () => Promise.resolve(`${FOREIGN}login`) })
    const outcome = await invokeWebAction({ request: { target: target(), action: 'open', cwd: CWD }, driver })
    expect(outcome.ok).toBe(true)
  })

  it('★ 授权按**调用里的 target** 查：两个 target 互不影响（页面状态是全局的）', async () => {
    // 同一只浏览器、同一个页面（异源），差别只在请求里带的 target：
    // 声明了那个源的放行，没声明的拒绝。A 的声明不会因为 B 声明了而放宽。
    const { driver } = fakeDriver({ currentUrl: () => Promise.resolve(`${FOREIGN}login`) })
    const strict = target()
    const permissive = target({ id: 'w-idp', allowedOrigins: [FOREIGN] })
    const denied = await invokeWebAction({
      request: { target: strict, action: 'click', cwd: CWD, selector: '#q' },
      driver,
    })
    const allowed = await invokeWebAction({
      request: { target: permissive, action: 'click', cwd: CWD, selector: '#q' },
      driver,
    })
    expect(denied.ok).toBe(false)
    expect(allowed.ok).toBe(true)
  })
})

describe('allowedActionOrigins：授权集合怎么算', () => {
  it('只有声明源时，集合里就那一个', () => {
    expect([...allowedActionOrigins(target())]).toEqual(['https://cdqas.example.com'])
  })

  it('额外源按 URL 规约成 origin（带路径 / 带尾斜杠都归一）', () => {
    const origins = allowedActionOrigins(
      target({ allowedOrigins: ['https://idp.example.com/login', 'http://127.0.0.1:8900/'] }),
    )
    expect([...origins].sort()).toEqual(['http://127.0.0.1:8900', 'https://cdqas.example.com', 'https://idp.example.com'])
  })

  it('解析不出来的条目**不授予任何权限**（一条写错的配置不该变成静默放行）', () => {
    const origins = allowedActionOrigins(target({ allowedOrigins: ['not a url', '', '   '] }))
    expect([...origins]).toEqual(['https://cdqas.example.com'])
  })

  it('pageOriginAllowed：同源放行、异源拒绝、读不到返回 undefined', () => {
    expect(pageOriginAllowed('https://cdqas.example.com/order', target())).toBe(true)
    expect(pageOriginAllowed('https://cdqas.example.com.evil.com/x', target())).toBe(false)
    expect(pageOriginAllowed('https://evil.example.com/', target())).toBe(false)
    expect(pageOriginAllowed('关于:空白', target())).toBeUndefined()
    expect(pageOriginAllowed(undefined, target())).toBeUndefined()
  })

  it('子域不算同源（`a.example.com` 与 `example.com` 是两个源）', () => {
    expect(pageOriginAllowed('https://order.cdqas.example.com/x', target())).toBe(false)
  })
})
