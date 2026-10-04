/**
 * 前端验活的**跑批执行器**：把一份项目清单里的断言跑成一份结果（`docs/devdata-plan.md` §15.2 的
 * `site_verify`，ROADMAP 待办 A2 / D8）。
 *
 * ## 为什么要有它，而不是让 agent 自己把六个工具串一遍
 *
 * 串一遍的问题不是麻烦，是**不可复审、不可积累**：这次验过了，下次换个人（或换个 agent）又从头
 * 编一遍操作序列，而且没人能说清「它到底验了什么」。所以验活必须**声明化**——断言写进项目仓库
 * （`web/<项目>.yaml`），随代码一起评审；本模块负责**照单执行**。
 *
 * ## 边界：这不是「批量开页面」
 *
 * §15.3 写着本套件「不做定时任务、不做爬虫、不做批量操作」。跑批断言与那条边界不冲突，区别在
 * **集合是谁给的**：
 *
 * | | 由谁给出要访问哪些页面 | 判定 |
 * |---|---|---|
 * | 爬虫 / 批量开页面 | **工具自己发现**（跟随链接、按规则猜 URL） | 不做 |
 * | 本模块 | **项目清单里的断言逐条写死** | 做 |
 *
 * 落到实现上：本文件里**没有任何发现逻辑**——URL 只能来自 `assertions[].url`，而且每一个都要
 * 先过 `invokeWebAction` 那条既有的站点范围判据（同源 + 声明路径前缀 + 目录作用域）。它也不会点
 * 击、不会填值、不会跟随链接：**只有 `open` 与一次观察**。要交互仍然走那六个动作工具。
 *
 * ## 一次取全（这一条是性能，也是正确性）
 *
 * 同一个 URL 上的 N 条断言**共用一次观察**（`pagesObserved` 就是这件事的账）。除了省往返，更
 * 要紧的是：SPA 一秒变三回，逐个取会让同一次验活里两条断言看到的不是同一个瞬间。
 *
 * ## 拒绝不是崩溃
 *
 * 一页打不开（越界 / 异源 / 驱动报错）只把**这一页**的断言判 `unknown` 并列进 `problems`，
 * 其余页面照跑——一次越界不该让另外 19 条断言失去结论。而「清单读不到 / 这个目标一条断言都没有」
 * 这类**整体性**问题不在这里处理：那是调用方（宿主工具）在开工前要说清的事。
 */

import { denialMessage, invokeWebAction, type WebAuditSink, type WebDriver, type WebTarget } from './page.js'
import {
  evaluateWebAssertion,
  selectorsNeeded,
  summarizeWebResults,
  type PageObservation,
  type WebAssertion,
  type WebAssertionResult,
  type WebAssertionSummary,
} from './web-verify.js'

/** 一次验活里「这一页打不开 / 观察不了」的账。 */
export interface WebVerifyProblem {
  url: string
  /** 判定层的拒绝码（打不开时才有）；观察失败没有码。 */
  code?: string
  message: string
}

/** 跑批结果。 */
export interface WebVerifyRunResult {
  project: string
  targetId: string
  summary: WebAssertionSummary
  /** 逐条结果，**按清单里的顺序**（分组观察不改变报告的顺序）。 */
  results: WebAssertionResult[]
  /** 页级问题（打不开 / 观察失败）——**没验成**与**验出问题**是两件事，分开报。 */
  problems: WebVerifyProblem[]
  /** 真的去开的 URL（去重后，按清单里的首次出现顺序）。 */
  pages: string[]
  /** 实际观察了几次页面：等于 `pages.length - problems.length`，也是「一次取全」的账。 */
  pagesObserved: number
}

/** 一页出问题时的逐条结果：判 `unknown`（**没验成**，不是「验出问题」）。 */
function unknownResult(assertion: WebAssertion, note: string): WebAssertionResult {
  return {
    id: assertion.id,
    url: assertion.url,
    status: 'unknown',
    severity: assertion.severity,
    message: `验不了：${note}`,
    diff: [{ op: 'open', expected: assertion.url, got: undefined, verdict: 'unknown', note }],
  }
}

/**
 * 跑一批断言。
 *
 * @param input.assertions - 已经筛好的断言（调用方负责「这份清单是哪个目标的」这类整体判据）。
 *   每条的 `id` 唯一——清单校验器（`validateWebManifest`）已经保证，报告按它点名。
 */
export async function runWebVerify(input: {
  target: WebTarget
  cwd: string
  project: string
  assertions: readonly WebAssertion[]
  driver: WebDriver
  audit?: WebAuditSink
  operationId?: string
}): Promise<WebVerifyRunResult> {
  const { target, cwd, project, assertions, driver, audit, operationId } = input

  // 分组：同一个 URL 的断言共用一次观察。键的顺序就是清单里首次出现的顺序。
  const groups = new Map<string, WebAssertion[]>()
  for (const assertion of assertions) {
    const group = groups.get(assertion.url)
    if (group === undefined) groups.set(assertion.url, [assertion])
    else group.push(assertion)
  }

  const byId = new Map<string, WebAssertionResult>()
  const problems: WebVerifyProblem[] = []
  let pagesObserved = 0

  for (const [url, group] of groups) {
    // 每一个 URL 都要过**既有**的判定链（目录作用域 + 站点范围），并且**进审计**——
    // 跑批执行的仍然是同一个动作（`open`），没有第二条旁路。
    const opened = await invokeWebAction({
      request: { target, action: 'open', cwd, url },
      driver,
      ...(audit === undefined ? {} : { audit }),
      ...(operationId === undefined ? {} : { operationId }),
    })
    if (!opened.ok) {
      const message = denialMessage(opened)
      problems.push({ url, code: opened.code, message })
      for (const assertion of group) byId.set(assertion.id, unknownResult(assertion, `这个页面打不开（${message}）`))
      continue
    }

    let observation: PageObservation
    try {
      observation = await driver.observe({ target, selectors: selectorsNeeded(group) })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      problems.push({ url, message })
      for (const assertion of group) byId.set(assertion.id, unknownResult(assertion, `观察这个页面失败：${message}`))
      continue
    }
    pagesObserved += 1
    for (const assertion of group) {
      byId.set(assertion.id, evaluateWebAssertion({ assertion, observation }))
    }
  }

  // 报告按**清单顺序**给（分组只影响「观察几次」，不该影响「报告怎么读」）。
  const results: WebAssertionResult[] = []
  for (const assertion of assertions) {
    const result = byId.get(assertion.id)
    if (result !== undefined) results.push(result)
  }

  /*
   * 跑批**自身**也进审计：一行「谁在什么时候验了哪个项目」。
   * `allowed` 说的是「这次动作被允许了吗」——到这一步它一定是被允许的（整体性问题在调用方
   * 开工前就抛了）；被拒的**页面**各自另有一行 `allowed: false`。
   */
  audit?.record({
    at: Date.now(),
    targetId: target.id,
    action: 'verify',
    allowed: true,
    subject: project,
    ...(operationId === undefined ? {} : { operationId }),
  })

  return {
    project,
    targetId: target.id,
    summary: summarizeWebResults(results),
    results,
    problems,
    pages: [...groups.keys()],
    pagesObserved,
  }
}
