/**
 * console 分类测试（`docs/devdata-plan.md` §15.2）。
 *
 * 这一层的失败方式与别处不同：分类**错的方向是静默的**——
 * 把噪声算成故障，会让报告里全是红，人就不看了；把真故障算成噪声，就是漏报。
 * 所以用例的重点是**那些容易当成故障的噪声**，以及「来源不明时不判失败」这条。
 */

import { describe, expect, it } from 'vitest'

import {
  NOISE_RULES,
  classifyConsole,
  classifyConsoleMessages,
  sameOrigin,
  summarizeConsole,
  type ConsoleMessage,
} from '../src/index.js'

const PAGE = 'https://cdqas.example.com/order/list'

/** 造一条 console 消息。 */
function msg(overrides: Partial<ConsoleMessage> = {}): ConsoleMessage {
  return { level: 'error', text: 'boom', ...overrides }
}

describe('噪声：真实站点里常驻的那几类', () => {
  /*
   * 2026-10-02 真机审计（`dev.example.com:82/bpaoss_njtj`，单浏览器双读：原始消息 vs 三档分类）
   * 抓到的**真实两条**，就是下面这两类：一条 `[debug] Config loaded`（规则 `page-log`）、
   * 一条**同源** `favicon.ico` 的 404（规则 `favicon-404`）。两条都正确落噪声档——
   * 尤其第二条：按「本站错误」判就会报「本站错误 1」，而缺个 favicon 不是页面坏了。
   */
  it('**同源** favicon 404 也算噪声（真实样本：`…/favicon.ico` 与页面同源）', () => {
    const real = msg({
      level: 'error',
      text: 'Failed to load resource: the server responded with a status of 404 (Not Found)',
      sourceUrl: 'http://dev.example.com:82/favicon.ico',
      pageUrl: 'http://dev.example.com:82/bpaoss_njtj/login/',
      status: 404,
    })
    expect(classifyConsole(real).class).toBe('noise')
    expect(classifyConsole(real).noiseRule).toBe('favicon-404')
  })

  it('favicon 404 算噪声（浏览器自动请求，站点没放该文件时必然出现）', () => {
    const finding = classifyConsole(msg({ level: 'error', text: 'Failed to load resource: favicon.ico', status: 404 }))
    expect(finding.class).toBe('noise')
    expect(finding.noiseRule).toBe('favicon-404')
    expect(finding.reason).toContain('favicon')
  })

  it('**CDP 的真实形状**里 favicon 只在 URL 上，不在正文里 —— 同样算噪声', () => {
    // 这一条是 2026-10-01 真机冒烟抓到的 bug 的回归钉子：
    // 原先的规则要求**正文**含 favicon，而 CDP 给的正文是
    // `Failed to load resource: the server responded with a status of 404 (Not Found)`——
    // 里面没有 favicon，于是规则在真机上**从不命中**，favicon 404 每次都被算成「本站错误」。
    // （原来的用例之所以是绿的，是因为它的 fixture 把 favicon 写进了正文——fixture 比现实"友好"。）
    const real: ConsoleMessage = {
      level: 'error',
      text: 'Failed to load resource: the server responded with a status of 404 (Not Found)',
      sourceUrl: 'http://127.0.0.1:1234/favicon.ico',
      pageUrl: 'http://127.0.0.1:1234/',
    }
    expect(classifyConsole(real).class).toBe('noise')
    expect(classifyConsole(real).noiseRule).toBe('favicon-404')
  })

  it('**不带 favicon 的资源 404 不算噪声**（那可能是真的坏了）', () => {
    // 这条守的是"别把规则放宽成『任何 404 都是噪声』"——那会静默吞掉一整类真故障。
    const finding = classifyConsole(
      msg({
        level: 'error',
        text: 'Failed to load resource: the server responded with a status of 404 (Not Found)',
        sourceUrl: 'http://127.0.0.1:1234/static/order-list.js',
        pageUrl: 'http://127.0.0.1:1234/',
      }),
    )
    expect(finding.class).toBe('error')
  })

  it('本站的未捕获异常不会被 favicon 规则误吞（两条规则互不干扰）', () => {
    const finding = classifyConsole(
      msg({
        level: 'error',
        text: 'Error: 未捕获：渲染订单行失败',
        sourceUrl: 'http://127.0.0.1:1234/',
        pageUrl: 'http://127.0.0.1:1234/',
      }),
    )
    expect(finding.class).toBe('error')
    expect(finding.noiseRule).toBeUndefined()
  })

  it('浏览器扩展报的错算噪声（不同人装的扩展不同）', () => {
    const finding = classifyConsole(
      msg({ text: 'Uncaught TypeError: ext is not a function', sourceUrl: 'chrome-extension://abcdef/inject.js' }),
    )
    expect(finding.class).toBe('noise')
    expect(finding.noiseRule).toBe('extension-inject')
  })

  /*
   * 2026-10-02 真机审计带出的一条**可达性**事实：本工具用 `Chrome.launch` 起的是**全新临时
   * profile、不带任何扩展**，所以上面那条 `extension-inject` 与 `third-party-blocked`
   * **实际永不命中**（公告里已写明可达性）。下面这条守的是**不要为了「让规则命中」把判据放宽**：
   * 没有扩展时第三方脚本不可达产生的是 `ERR_NAME_NOT_RESOLVED`，它必须仍然是**告警**
   * （需要人看一眼）——放宽成「凡是第三方域名都算噪声」会把真实的第三方故障一起吞掉，那是假阴性。
   */
  it('第三方脚本**不可达**（无扩展 → `ERR_NAME_NOT_RESOLVED`）→ 告警，**不进噪声档**', () => {
    const finding = classifyConsole(
      msg({
        level: 'error',
        text: 'Failed to load resource: net::ERR_NAME_NOT_RESOLVED',
        sourceUrl: 'https://hm.baidu.com/hm.js?abc',
        pageUrl: PAGE,
      }),
    )
    expect(finding.class).toBe('warning')
    expect(finding.noiseRule).toBeUndefined()
  })

  it('浏览器内部页面的错算噪声', () => {
    expect(classifyConsole(msg({ sourceUrl: 'devtools://devtools/bundled/x.js' })).class).toBe('noise')
    expect(classifyConsole(msg({ sourceUrl: 'about:blank' })).class).toBe('noise')
  })

  it('ResizeObserver 的已知告警算噪声（Chromium 长期存在）', () => {
    const finding = classifyConsole(msg({ text: 'ResizeObserver loop limit exceeded', level: 'warning' }))
    expect(finding.class).toBe('noise')
    expect(finding.noiseRule).toBe('resizeobserver-loop')
  })

  it('被客户端拦截的第三方埋点算噪声', () => {
    const finding = classifyConsole(
      msg({ text: 'GET https://www.google-analytics.com/collect net::ERR_BLOCKED_BY_CLIENT' }),
    )
    expect(finding.class).toBe('noise')
    expect(finding.noiseRule).toBe('third-party-blocked')
  })

  it('**噪声不丢弃**：分类结果里仍带着原消息与理由（判据本身会被改）', () => {
    const finding = classifyConsole(msg({ text: 'favicon.ico 404', status: 404 }))
    expect(finding.message.text).toContain('favicon')
    expect(finding.reason.length).toBeGreaterThan(0)
  })

  it('每条噪声规则都写得出理由（写不出理由的规则不该在这里）', () => {
    // 一条说不出「为什么它算噪声」的规则，代价是把一类真故障静默划走。
    for (const rule of NOISE_RULES) {
      expect(rule.name.trim(), 'rule.name 不能空').not.toBe('')
      expect(rule.why.length, `${rule.name} 没写 why`).toBeGreaterThan(10)
    }
  })

  it('噪声规则**刻意保持短**（每加一条都是一次把某类消息划走的决定）', () => {
    expect(NOISE_RULES.length).toBeLessThanOrEqual(8)
  })
})

describe('本站资源的 error 才是失败信号', () => {
  it('同源 error → error 档', () => {
    const finding = classifyConsole(msg({ sourceUrl: 'https://cdqas.example.com/app.js', pageUrl: PAGE }))
    expect(finding.class).toBe('error')
    expect(finding.reason).toContain('本站')
  })

  it('异源 error → warning（可能与本站无关，需要人看一眼）', () => {
    const finding = classifyConsole(msg({ sourceUrl: 'https://cdn.other.com/lib.js', pageUrl: PAGE }))
    expect(finding.class).toBe('warning')
    expect(finding.reason).toContain('异源')
  })

  it('**来源未知 → warning，不判失败**（宁可漏报也不误报）', () => {
    // 失败意味着：一条拿不到来源的错就能让整次验活红掉，而方向恰好反了。
    const finding = classifyConsole(msg({ text: 'boom' }))
    expect(finding.class).toBe('warning')
    expect(finding.reason).toContain('拿不到来源')
  })

  it('**判据是来源而不是措辞**（业务文案会改，来源不会）', () => {
    const same = classifyConsole(msg({ text: '业务文案改了呢', sourceUrl: 'https://cdqas.example.com/a.js', pageUrl: PAGE }))
    const other = classifyConsole(msg({ text: '业务文案改了呢', sourceUrl: 'https://x.com/a.js', pageUrl: PAGE }))
    expect(same.class).toBe('error')
    expect(other.class).toBe('warning')
  })
})

describe('告警与信息类', () => {
  it('本站 warning → warning 档（不判失败）', () => {
    const finding = classifyConsole(
      msg({ level: 'warning', text: 'deprecated api', sourceUrl: 'https://cdqas.example.com/a.js', pageUrl: PAGE }),
    )
    expect(finding.class).toBe('warning')
    expect(finding.reason).toContain('本站')
  })

  it('info / log / debug 留在报告里但不构成错误、**也不构成告警**（归噪声档）', () => {
    for (const level of ['info', 'log', 'debug', 'other'] as const) {
      const finding = classifyConsole(msg({ level, text: 'hello' }))
      // 这条断言从前写的是 `'warning'`，而用例名写着「不构成告警」——**断言把 bug 一起抄了进去**：
      // 于是一个干净页面只要 `console.log` 过一行，摘要就报「告警 1」（2026-10-02 端到端发现）。
      expect(finding.class, level).toBe('noise')
      expect(finding.reason, level).toContain(level)
    }
  })

  it('顺序是契约：**先看噪声规则，再看级别**', () => {
    // 若先按级别筛，噪声里的 error 会被一律算成故障——那正是「表里全是噪声、没人看」的成因。
    const finding = classifyConsole(msg({ level: 'error', text: 'favicon.ico 404', status: 404 }))
    expect(finding.class).toBe('noise')
  })
})

describe('同源判定', () => {
  it('同源 / 异源 / 无法判断', () => {
    expect(sameOrigin('https://a.com/x.js', 'https://a.com/page')).toBe(true)
    expect(sameOrigin('https://b.com/x.js', 'https://a.com/page')).toBe(false)
    expect(sameOrigin(undefined, 'https://a.com/page')).toBeUndefined()
    expect(sameOrigin('https://a.com/x.js', undefined)).toBeUndefined()
    expect(sameOrigin('not a url', 'https://a.com')).toBeUndefined()
  })

  it('端口与协议算在源里', () => {
    expect(sameOrigin('https://a.com:8443/x.js', 'https://a.com/page')).toBe(false)
    expect(sameOrigin('http://a.com/x.js', 'https://a.com/page')).toBe(false)
  })
})

describe('汇总', () => {
  it('分三档计数，且 total 含噪声（报告里要能看出「一共多少条」）', () => {
    const messages: ConsoleMessage[] = [
      msg({ text: 'favicon.ico 404', status: 404 }),
      msg({ sourceUrl: 'https://cdqas.example.com/a.js', pageUrl: PAGE }),
      msg({ sourceUrl: 'https://cdn.other.com/a.js', pageUrl: PAGE }),
      msg({ level: 'log', text: 'hi' }),
    ]
    const summary = summarizeConsole(classifyConsoleMessages(messages))
    expect(summary.errors).toHaveLength(1)
    // 异源 error 才算告警；`log` 那条进噪声档（见上一组用例）
    expect(summary.warnings).toHaveLength(1)
    expect(summary.noise).toHaveLength(2)
    expect(summary.total).toBe(4)
  })

  it('空输入不炸', () => {
    expect(summarizeConsole([])).toMatchObject({ total: 0 })
  })
})
