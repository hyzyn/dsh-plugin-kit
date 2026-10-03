/**
 * console 消息的**分类**（`docs/devdata-plan.md` §15.2 的 `site_console`）。
 *
 * ## 为什么这一层是必要的，而不是「把 console 里的 error 都列出来」
 *
 * §15.2 说 console 错误是**发布后最常见的前端故障信号**——这句话对，但直接列出全部 error
 * 会把信号淹掉：任何真实站点的 console 里都有常驻噪声（favicon 404、浏览器扩展注入、
 * 第三方埋点被拦截、`ResizeObserver` 的已知告警）。噪声与故障混在一张表里，
 * 结果就是**没人再看这张表**——和第 3.9 节 `unknown` 档要解决的问题是同一类。
 *
 * 所以分类要给的是**措辞以外的证据**：谁报的（来源 URL）、是不是我们自己的资源、
 * 是不是已知噪声形态。三档：
 *
 * | 档位 | 含义 | 该做什么 |
 * |---|---|---|
 * | `error` | 来自**本站资源**的错误 | 发布验活的失败信号 |
 * | `warning` | 来自本站的告警 / 无法判断来源的错 | 记下来，不单独判失败 |
 * | `noise` | 明确的第三方 / 浏览器 / 已知噪声 | 忽略（但**留在报告里**，见下） |
 *
 * **噪声不丢弃**：报告里保留它、并标注为什么算噪声。理由是这条判据本身会被改——
 * 把噪声整个藏掉，等到判据错了（某个真故障被误判成噪声）时就查不出来源了。
 *
 * 依据：`docs/devdata-plan.md` §15.2 / §15.3、`jenkins-release` 技能 §4 的噪声口径。
 */

/** console 消息级别（CDP `Runtime.consoleAPICalled` 的 `type`）。 */
export type ConsoleLevel = 'error' | 'warning' | 'info' | 'log' | 'debug' | 'other'

/** 分类档位。 */
export type ConsoleClass = 'error' | 'warning' | 'noise'

/** 一条 console 消息（从 CDP 事件抽出来后的事实）。 */
export interface ConsoleMessage {
  /** 消息本身的级别。 */
  level: ConsoleLevel
  /** 拼接后的正文。 */
  text: string
  /**
   * 来源 URL（CDP 的 `stackTrace.callFrames[0].url` 或 `source`）。
   *
   * **这是分类的主判据**：判断「是不是我们自己的资源」靠它，而不是靠正文措辞——
   * 正文措辞会被业务文案改掉，来源不会。
   */
  sourceUrl?: string
  /** 页面 URL（用于判断来源是不是同源）。 */
  pageUrl?: string
  /** 资源加载失败时的 HTTP 状态码。 */
  status?: number
  /** 时间戳（毫秒）。 */
  at?: number
}

/** 分类结果。 */
export interface ConsoleFinding {
  message: ConsoleMessage
  class: ConsoleClass
  /** 为什么是这个档位（给人看；噪声档尤其要说清）。 */
  reason: string
  /** 命中的噪声规则名（`noise` 时）。 */
  noiseRule?: string
}

/**
 * 已知噪声规则。
 *
 * 每条都要能说清「为什么它是噪声」——写不出理由的规则不该在这里，
 * 因为它的代价是把一类真故障静默地划走。
 */
export interface NoiseRule {
  name: string
  /** 匹配正文。 */
  test: (message: ConsoleMessage) => boolean
  /** 为什么算噪声。 */
  why: string
}

/** 浏览器扩展 / 注入脚本的来源特征（它们报的错与我们无关）。 */
const EXTENSION_SOURCE = /^(?:chrome|moz|safari|ms-browser)-extension:\/\//i
/** 浏览器自身的内部页面。 */
const BROWSER_INTERNAL_SOURCE = /^(?:devtools|chrome|about):/i

/**
 * 内置噪声规则。
 *
 * **刻意保持短**：每加一条都是一次「把某类消息划走」的决定，而划错的代价是真故障被忽略。
 * 只有**确实与本仓前端无关**的几类才进来；业务相关的判断交给「来源是不是本站」这条主判据。
 */
export const NOISE_RULES: readonly NoiseRule[] = [
  {
    name: 'favicon-404',
    /*
     * **判据要看 URL，不能只看文本**（2026-10-01 真机冒烟抓到的 bug）：
     * CDP 给这类资源失败的文本是 `Failed to load resource: the server responded with a status of 404`——
     * **里面没有 "favicon"**，那个名字只出现在 `sourceUrl` 里。原先只测 `text`，于是这条规则
     * 在真机上**从不命中**，favicon 404 每次都被算成「本站错误」（实测：一次干净的页面上
     * 报告的第一条永远是它）。这正是「噪声淹掉信号」本身。
     */
    test: (message) => {
      const haystack = `${message.text} ${message.sourceUrl ?? ''}`
      if (!/favicon/i.test(haystack)) return false
      // 名字对上了只是必要条件：再确认它确实是一次「取不到」而不是别的错。
      return message.status === 404 || /\b404\b/.test(message.text) || /favicon\.ico/i.test(haystack)
    },
    why: 'favicon 404：浏览器自动请求，站点没放该文件时必然出现，与页面功能无关',
  },
  {
    /*
     * ⚠️ **可达性**（2026-10-02 真机审计）：本工具用 `Chrome.launch` 起的是**全新临时 profile**，
     * 里面**没有任何扩展**——所以这条规则**实际永远不命中**。留着是给「将来允许复用带扩展的
     * 浏览器」留规则，不是为了今天。公告里已写明这一点，别把「没看到它」当成漏判。
     */
    name: 'extension-inject',
    test: (message) => message.sourceUrl !== undefined && EXTENSION_SOURCE.test(message.sourceUrl),
    why: '来源是浏览器扩展：不同人装的扩展不同，报的错也不该记到站点账上',
  },
  {
    name: 'browser-internal',
    test: (message) => message.sourceUrl !== undefined && BROWSER_INTERNAL_SOURCE.test(message.sourceUrl),
    why: '来源是浏览器内部页面（devtools / about:），不是站点资源',
  },
  {
    name: 'resizeobserver-loop',
    test: (message) => /ResizeObserver loop (?:limit exceeded|completed with undelivered notifications)/i.test(message.text),
    why: 'ResizeObserver 的已知浏览器告警，Chromium 长期存在，不表示页面有问题',
  },
  {
    /*
     * ⚠️ **可达性**（2026-10-02 真机审计）：这条**要求 `ERR_BLOCKED_BY_CLIENT`，而那个错误码是
     * 客户端扩展（广告拦截）产生的**——`why` 自己就写着「被客户端扩展拦截」。全新 profile 没扩展，
     * 所以它同样**实际不会命中**。没有扩展时，第三方脚本不可达产生的是 `ERR_NAME_NOT_RESOLVED` /
     * `ERR_CONNECTION_TIMED_OUT`，**不由这条规则管**：它们按主判据落到 warning（异源/来源不明），
     * 那是「需要人看一眼」而不是「噪声」——这是刻意的，别为「让它命中」把判据放宽成
     * 「凡是第三方域名都算噪声」：那会把真实的第三方故障也吞掉。
     */
    name: 'third-party-blocked',
    test: (message) =>
      /(?:net::ERR_BLOCKED_BY_CLIENT|ERR_BLOCKED_BY_RESPONSE)/.test(message.text) &&
      /(?:google|gstatic|doubleclick|baidu|hm\.baidu|cnzz|umeng|sentry\.io|clarity\.ms)/i.test(message.text),
    why: '第三方埋点 / 广告脚本被客户端扩展拦截：它被拦掉不影响站点功能',
  },
]

/**
 * 判断一条消息的来源是否**属于本页**。
 *
 * 口径：
 *   - 没给来源 → `undefined`（未知，不是「同源」也不是「异源」）；
 *   - 有页面 URL 且来源同源 → 本站；
 *   - 有页面 URL 且来源异源 → 不是本站（第三方 CDN / 埋点）；
 *   - 没有页面 URL → 无法判断（只有来源是扩展 / 浏览器内部时才敢说是噪声）。
 */
export function sameOrigin(sourceUrl: string | undefined, pageUrl: string | undefined): boolean | undefined {
  if (sourceUrl === undefined || pageUrl === undefined) return undefined
  try {
    return new URL(sourceUrl).origin === new URL(pageUrl).origin
  } catch {
    return undefined
  }
}

/**
 * 分类一条 console 消息。
 *
 * 顺序是契约：**先看噪声规则，再看级别与来源**。
 *
 * 为什么不先看级别：`error` 级别里混着大量噪声（favicon、扩展），先按级别筛就会把它们
 * 一律算成故障——而那正是「表里全是噪声、没人看」的成因。
 */
export function classifyConsole(message: ConsoleMessage): ConsoleFinding {
  for (const rule of NOISE_RULES) {
    if (rule.test(message)) {
      return { message, class: 'noise', reason: rule.why, noiseRule: rule.name }
    }
  }

  // 信息类：不是错误，也不构成告警 —— 与噪声同档（**留在报告里，但不计入信号**）。
  //
  // 这句注释原来就写着「不构成告警」，下一行却 `class: 'warning'`（2026-10-02 端到端发现）：
  // 于是一个干净页面只要 `console.log` 过一行，摘要就报「告警 1」。同档测试也把这个矛盾抄了进去
  // （用例名写「不构成告警」、断言写 `'warning'`）。判据：**告警档的定义是「需要人看一眼」**，
  // 而页面自己的日志不需要。
  if (message.level === 'info' || message.level === 'log' || message.level === 'debug' || message.level === 'other') {
    // 也带 `noiseRule`：**被排除的东西必须可拆开看**，否则「噪声 2」是个不可审的数字——
    // 规则一旦误伤真错误，它会静静地把它吞掉（2026-10-02 验收提出：只给计数，构成无从核对）。
    return {
      message,
      class: 'noise',
      reason: `级别是 ${message.level}：不是错误也不是告警，留在报告里备查`,
      noiseRule: 'page-log',
    }
  }

  const same = sameOrigin(message.sourceUrl, message.pageUrl)

  if (message.level === 'error') {
    if (same === true) {
      return { message, class: 'error', reason: '来自本站资源的 error' }
    }
    if (same === false) {
      return {
        message,
        class: 'warning',
        reason: 'error 来自异源（第三方 CDN / 埋点）：可能与本站点无关，需要人看一眼',
      }
    }
    // 来源未知时**不判失败**：判了就会因为一条拿不到来源的错而让整次验活红掉，
    // 而它的方向恰好是「宁可漏报也不误报」的反面。
    return { message, class: 'warning', reason: 'error 但拿不到来源（无法判断是不是本站资源）' }
  }

  if (message.level === 'warning') {
    return { message, class: 'warning', reason: same === true ? '来自本站资源的告警' : '告警（来源不明确或异源）' }
  }

  return { message, class: 'warning', reason: '未识别的级别，按告警处理' }
}

/** 把一批消息分类。 */
export function classifyConsoleMessages(messages: readonly ConsoleMessage[]): ConsoleFinding[] {
  return messages.map((message) => classifyConsole(message))
}

/** 一批消息的汇总。 */
export interface ConsoleSummary {
  /** 本站错误（**验活失败信号**）。 */
  errors: ConsoleFinding[]
  warnings: ConsoleFinding[]
  noise: ConsoleFinding[]
  /** 总条数（含噪声——报告里要能看出「一共多少条」）。 */
  total: number
}

/** 汇总一批分类结果。 */
export function summarizeConsole(findings: readonly ConsoleFinding[]): ConsoleSummary {
  return {
    errors: findings.filter((finding) => finding.class === 'error'),
    warnings: findings.filter((finding) => finding.class === 'warning'),
    noise: findings.filter((finding) => finding.class === 'noise'),
    total: findings.length,
  }
}
