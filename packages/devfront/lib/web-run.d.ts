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
import { type WebAuditSink, type WebDriver, type WebTarget } from './page.js';
import { type WebAssertion, type WebAssertionResult, type WebAssertionSummary } from './web-verify.js';
/** 一次验活里「这一页打不开 / 观察不了」的账。 */
export interface WebVerifyProblem {
    url: string;
    /** 判定层的拒绝码（打不开时才有）；观察失败没有码。 */
    code?: string;
    message: string;
}
/** 跑批结果。 */
export interface WebVerifyRunResult {
    project: string;
    targetId: string;
    summary: WebAssertionSummary;
    /** 逐条结果，**按清单里的顺序**（分组观察不改变报告的顺序）。 */
    results: WebAssertionResult[];
    /** 页级问题（打不开 / 观察失败）——**没验成**与**验出问题**是两件事，分开报。 */
    problems: WebVerifyProblem[];
    /** 真的去开的 URL（去重后，按清单里的首次出现顺序）。 */
    pages: string[];
    /** 实际观察了几次页面：等于 `pages.length - problems.length`，也是「一次取全」的账。 */
    pagesObserved: number;
    /**
     * **调用方取消了这次跑批**（`ToolRunContext.signal`）：剩下的页面没有打开。
     *
     * 与「页面打不开」分开：那是环境的事实，这一条只是调用方不等了。没跑到的断言一律判 `unknown`
     * （**不许**因为没打开就报 `fail`——那是拿「没验」冒充「验出问题」）。
     */
    cancelled: boolean;
}
/**
 * 跑一批断言。
 *
 * @param input.assertions - 已经筛好的断言（调用方负责「这份清单是哪个目标的」这类整体判据）。
 *   每条的 `id` 唯一——清单校验器（`validateWebManifest`）已经保证，报告按它点名。
 */
export declare function runWebVerify(input: {
    target: WebTarget;
    cwd: string;
    project: string;
    assertions: readonly WebAssertion[];
    driver: WebDriver;
    audit?: WebAuditSink;
    operationId?: string;
    /** 调用方的取消信号：**每一页之前**看一次（一次跑批可能开好几个页面，每个都是秒级）。 */
    signal?: AbortSignal;
}): Promise<WebVerifyRunResult>;
