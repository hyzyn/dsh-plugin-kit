/**
 * `devfront` 的**登录编排执行器**：照 `WebTarget.login` 解析出来的计划走一遍
 * （`site_login` 的执行体；声明形态与校验在 `login.ts`）。
 *
 * ## 两条不许违反的性质
 *
 * 1. **没有第二条旁路**。每一步都调**注入的** `invoke` —— 真实实现就是 `page.ts` 的
 *    `invokeWebAction`：同一道判定链（白名单 / 目录作用域 / 站点范围 / 动手前核当前页面源）、
 *    同一份审计出口、同一套凭据解析。执行器**不碰驱动**，也就不可能绕过任何一条闸门。
 * 2. **值不进报告**。步骤报告里只有 `subject`（`goto` 的 URL / 其余的选择器）与凭据**引用名**；
 *    `fill` 的值由 `invoke` 内部解析并直接交给驱动，本模块从头到尾看不到它。
 *
 * ## 三态：`ok` / `fail` / `unknown`（**「没验成」不许冒充「验出问题」**）
 *
 * | 结局 | 什么时候 | 下一步动作 |
 * |---|---|---|
 * | `ok` | 每一步都执行完，且成功判据命中 | 可以在这个会话上继续验 |
 * | `fail` | 每一步都执行完，但成功判据**没命中** | 登录**没成**（口令 / 页面 / 选择器漂了）：别把这次会话当作已登录 |
 * | `unknown` | 有步骤被拒 / 没跑成 / 被取消，或成功判据求不出来 | **没验成**：先看那一步为什么没走成 |
 *
 * `fail` 只在「照声明走完了、判据给了否」时出现——这条边界就是它的价值：把「没走到」说成「没成」
 * 会让人去改口令，而真正的问题可能是选择器漂了。
 *
 * ## 取消自成一档（conventions § 长等待的工具必须转发 `exec.signal`）
 *
 * 预算 120 秒 + 每步一次导航，量级远超 30 秒，所以本执行器必须：每步之前与每次轮询都看
 * `signal`、睡眠**可被 abort 唤醒**（不是「这一轮睡完再看」）、取消后的报告说清「会话还在哪、
 * 怎么接着用」。已经发出去的动作**不回滚**（浏览器没有事务）——报告里要写明这一点。
 */
import type { PageObservation } from './web-verify.js';
import type { LoginPlan, LoginStep } from './login.js';
import type { WebActionRequest, WebAuditSink, WebOutcome } from './page.js';
/** 轮询间隔（毫秒）：`waitFor` 每轮问一次页面，直到元素出现或超时。 */
export declare const LOGIN_POLL_MS = 250;
/** 一步的结局。`failed` = 这一步没执行完（被拒 / 驱动报错 / 等待超时）；见文件头的三态表。 */
export type LoginStepStatus = 'done' | 'failed' | 'skipped';
/** 一步的账。 */
export interface LoginStepReport {
    /** 1 起（给人看的号；`steps[0]` 是第一行）。 */
    index: number;
    action: LoginStep['action'];
    /** 这一步作用的对象：`goto` 的 URL，其余是选择器。**永远不含填进去的值**。 */
    subject: string;
    status: LoginStepStatus;
    /** 被拒 / 执行失败时的码（`page.ts` 的 `WEB_REJECTION_CODES`，**原样**带出）。 */
    code?: string;
    message: string;
    /** 恢复路径（判定层给的 `hint`）——与消息分列，渲染时另起一行。 */
    hint?: string;
    /** `fill` 用引用时记引用名（**不是值**）。 */
    credentialRef?: string;
    elapsedMs: number;
}
/** 成功判据的账。 */
export interface LoginSuccessReport {
    selector: string;
    verdict: 'met' | 'unmet' | 'unknown';
    /** 实际看到了什么（失败时带上当前页面——那是复核的起点）。 */
    got: string;
    message: string;
}
/** 一次登录的结果。 */
export interface LoginRunResult {
    targetId: string;
    status: 'ok' | 'fail' | 'unknown';
    steps: LoginStepReport[];
    success: LoginSuccessReport;
    /** 一句话结论（渲染时摆在第一行）。 */
    message: string;
    elapsedMs: number;
    /** 调用方取消了这次登录：剩下的步骤没有执行。 */
    cancelled: boolean;
}
/**
 * 跑一次登录。
 *
 * @param input.invoke - 发一个页面动作（真实实现是 `invokeWebAction`，含判定、审计、凭据解析）。
 * @param input.observe - 一次取全（等元素用；与 `site_verify` 同一份驱动能力）。
 * @param input.currentUrl - 实时问当前页面（失败证据里要有它）。
 * @param input.audit - 审计出口：每一步各自一行（由 `invoke` 记），本执行器再补一行**整体**的。
 */
export declare function runLogin(input: {
    target: WebActionRequest['target'];
    plan: LoginPlan;
    cwd: string;
    invoke: (request: WebActionRequest) => Promise<WebOutcome>;
    observe: (selectors: readonly string[]) => Promise<PageObservation>;
    currentUrl: () => Promise<string | undefined>;
    audit?: WebAuditSink;
    operationId?: string;
    sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
    now?: () => number;
    signal?: AbortSignal;
}): Promise<LoginRunResult>;
