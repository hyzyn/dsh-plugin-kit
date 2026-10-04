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

import type { PageObservation } from './web-verify.js'
import type { LoginPlan, LoginStep } from './login.js'
import type { WebActionRequest, WebAuditSink, WebOutcome } from './page.js'

/** 轮询间隔（毫秒）：`waitFor` 每轮问一次页面，直到元素出现或超时。 */
export const LOGIN_POLL_MS = 250

/** 一步的结局。`failed` = 这一步没执行完（被拒 / 驱动报错 / 等待超时）；见文件头的三态表。 */
export type LoginStepStatus = 'done' | 'failed' | 'skipped'

/** 一步的账。 */
export interface LoginStepReport {
  /** 1 起（给人看的号；`steps[0]` 是第一行）。 */
  index: number
  action: LoginStep['action']
  /** 这一步作用的对象：`goto` 的 URL，其余是选择器。**永远不含填进去的值**。 */
  subject: string
  status: LoginStepStatus
  /** 被拒 / 执行失败时的码（`page.ts` 的 `WEB_REJECTION_CODES`，**原样**带出）。 */
  code?: string
  message: string
  /** 恢复路径（判定层给的 `hint`）——与消息分列，渲染时另起一行。 */
  hint?: string
  /** `fill` 用引用时记引用名（**不是值**）。 */
  credentialRef?: string
  elapsedMs: number
}

/** 成功判据的账。 */
export interface LoginSuccessReport {
  selector: string
  verdict: 'met' | 'unmet' | 'unknown'
  /** 实际看到了什么（失败时带上当前页面——那是复核的起点）。 */
  got: string
  message: string
}

/** 一次登录的结果。 */
export interface LoginRunResult {
  targetId: string
  status: 'ok' | 'fail' | 'unknown'
  steps: LoginStepReport[]
  success: LoginSuccessReport
  /** 一句话结论（渲染时摆在第一行）。 */
  message: string
  elapsedMs: number
  /** 调用方取消了这次登录：剩下的步骤没有执行。 */
  cancelled: boolean
}

/**
 * 一步要发给判定层的请求（`fill` 的值 / 引用二选一，由解析保证）。
 *
 * `waitFor` **刻意不在**这里：它不是页面动作，只观察（读类本来就不需要「动手前的源」判据），
 * 走的是 `observe` 而不是 `invoke`——放进来等于给它一条假的判定链。
 */
function requestOf(step: Exclude<LoginStep, { action: 'waitFor' }>, base: { target: WebActionRequest['target']; cwd: string }): WebActionRequest {
  switch (step.action) {
    case 'goto':
      return { ...base, action: 'open', url: step.url }
    case 'click':
      return { ...base, action: 'click', selector: step.selector }
    case 'fill':
      return {
        ...base,
        action: 'fill',
        selector: step.selector,
        ...(step.credentialRef === undefined ? { value: step.value ?? '' } : { credentialRef: step.credentialRef }),
      }
  }
}

/** 一步的「对象」：`goto` 是 URL，其余是选择器。**不含值**。 */
function subjectOf(step: LoginStep): string {
  return step.action === 'goto' ? step.url : step.selector
}

/** 从驱动回显里读一个可选字符串字段（`fill` 的保护强度那几个；读不到就当没有）。 */
function stringField(value: unknown, key: string): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const found = (value as Record<string, unknown>)[key]
  return typeof found === 'string' && found !== '' ? found : undefined
}

/** 可被 abort 唤醒的睡眠（注入的 `sleep` 让用例不必真等）。 */
async function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve) => {
    if (signal?.aborted === true) {
      resolve()
      return
    }
    const timer = setTimeout(finish, ms)
    function finish(): void {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }
    function onAbort(): void {
      finish()
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** 一次等待一个元素出现的结果。 */
type WaitOutcome =
  | { kind: 'found' }
  | { kind: 'timeout'; note: string }
  | { kind: 'invalid'; error: string }
  | { kind: 'missing'; note: string }
  | { kind: 'error'; message: string }
  | { kind: 'cancelled' }

/**
 * 跑一次登录。
 *
 * @param input.invoke - 发一个页面动作（真实实现是 `invokeWebAction`，含判定、审计、凭据解析）。
 * @param input.observe - 一次取全（等元素用；与 `site_verify` 同一份驱动能力）。
 * @param input.currentUrl - 实时问当前页面（失败证据里要有它）。
 * @param input.audit - 审计出口：每一步各自一行（由 `invoke` 记），本执行器再补一行**整体**的。
 */
export async function runLogin(input: {
  target: WebActionRequest['target']
  plan: LoginPlan
  cwd: string
  invoke: (request: WebActionRequest) => Promise<WebOutcome>
  observe: (selectors: readonly string[]) => Promise<PageObservation>
  currentUrl: () => Promise<string | undefined>
  audit?: WebAuditSink
  operationId?: string
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
  now?: () => number
  signal?: AbortSignal
}): Promise<LoginRunResult> {
  const { target, plan, cwd, invoke, observe, currentUrl, audit, operationId, signal } = input
  const sleep = input.sleep ?? abortableSleep
  const now = input.now ?? (() => Date.now())
  const startedAt = now()
  const budgetEndsAt = startedAt + plan.budgetMs

  const steps: LoginStepReport[] = []
  let cancelled = false
  /**
   * 为什么后面的步骤不再执行（`undefined` = 还在走）。
   *
   * 分开记是因为**三种原因的下一步动作不同**：`failed` 去看那一步为什么没成、`budget` 去看
   * 是不是声明写得太长、`cancelled` 是调用方不等了。只留一个布尔量的话，被预算或取消打断的步骤
   * 会被写成「前面的步骤没走成」——那句话在这两种情形下是错的。
   */
  let halt: 'failed' | 'budget' | 'cancelled' | undefined

  const remaining = (): number => budgetEndsAt - now()
  /** 没执行的步骤那句话（按 `halt` 分）。 */
  const skippedMessage = (): string => {
    if (halt === 'cancelled') return '被调用方取消：没执行（取消不是超时，也不是这一步有问题）'
    if (halt === 'budget') return `总预算 ${String(plan.budgetMs)}ms 用尽（预算**不可声明**，见 login.ts）——这一步没执行`
    return '前面的步骤没走成，这一步没执行'
  }

  for (const [index, step] of plan.steps.entries()) {
    const at = index + 1
    const subject = subjectOf(step)
    if (halt !== undefined) {
      steps.push({ index: at, action: step.action, subject, status: 'skipped', message: skippedMessage(), elapsedMs: 0 })
      continue
    }
    if (signal?.aborted === true) {
      cancelled = true
      halt = 'cancelled'
      steps.push({ index: at, action: step.action, subject, status: 'skipped', message: skippedMessage(), elapsedMs: 0 })
      continue
    }
    if (remaining() <= 0) {
      halt = 'budget'
      steps.push({ index: at, action: step.action, subject, status: 'skipped', message: skippedMessage(), elapsedMs: 0 })
      continue
    }

    const stepStartedAt = now()

    if (step.action === 'waitFor') {
      const waited = await waitForElement({
        selector: step.selector,
        // 等待受**剩余预算**夹取：一份把每步都写到 15s 的声明不该跑得比总预算还久。
        timeoutMs: Math.min(step.timeoutMs, Math.max(0, remaining())),
        observe,
        currentUrl,
        sleep,
        now,
        ...(signal === undefined ? {} : { signal }),
      })
      if (waited.kind === 'found') {
        steps.push({
          index: at,
          action: step.action,
          subject,
          status: 'done',
          message: `元素已出现：${step.selector}`,
          elapsedMs: now() - stepStartedAt,
        })
        continue
      }
      if (waited.kind === 'cancelled') {
        cancelled = true
        halt = 'cancelled'
        steps.push({
          index: at,
          action: step.action,
          subject,
          status: 'skipped',
          message: '被调用方取消：这一步没等完（取消不是超时，也不是元素没出现）',
          elapsedMs: now() - stepStartedAt,
        })
        continue
      }
      halt = 'failed'
      steps.push({
        index: at,
        action: step.action,
        subject,
        status: 'failed',
        message:
          waited.kind === 'error'
            ? `观察页面失败：${waited.message}`
            : waited.kind === 'invalid'
              ? `这一步没走成：选择器不合法（${waited.error}）——先修声明里的这个选择器，它与「元素没出现」是两件事`
              : `这一步没走成：${waited.note}`,
        ...(waited.kind === 'invalid' ? { code: 'INVALID_SELECTOR' } : {}),
        elapsedMs: now() - stepStartedAt,
      })
      continue
    }

    const outcome = await invoke(requestOf(step, { target, cwd }))
    if (!outcome.ok) {
      halt = 'failed'
      steps.push({
        index: at,
        action: step.action,
        subject,
        status: 'failed',
        code: outcome.code,
        message: outcome.message,
        ...(outcome.hint === undefined ? {} : { hint: outcome.hint }),
        ...(step.action === 'fill' && step.credentialRef !== undefined ? { credentialRef: step.credentialRef } : {}),
        elapsedMs: now() - stepStartedAt,
      })
      continue
    }

    steps.push({
      index: at,
      action: step.action,
      subject,
      status: 'done',
      message: doneMessage(step, outcome.result),
      ...(step.action === 'fill' && step.credentialRef !== undefined ? { credentialRef: step.credentialRef } : {}),
      elapsedMs: now() - stepStartedAt,
    })
  }

  const allDone = steps.length === plan.steps.length && steps.every((step) => step.status === 'done')
  const success: LoginSuccessReport = allDone
    ? await evaluateSuccess({ selector: plan.success.selector, observe, currentUrl })
    : {
        selector: plan.success.selector,
        verdict: 'unknown',
        got: '（没有求值：流程没走完）',
        message: cancelled ? '被调用方取消，成功判据没有求值' : '流程没走到判据那一步，因此**没有**结论',
      }

  const status: LoginRunResult['status'] = allDone ? (success.verdict === 'met' ? 'ok' : success.verdict === 'unmet' ? 'fail' : 'unknown') : 'unknown'

  /*
   * 整体也进审计（与 `runWebVerify` 的 `action: 'verify'` 同一口径：**动作发生了**这件事要留痕）。
   * `allowed` 说的是「这次动作被允许了吗」——到这一步一定是被允许的（整体性问题在开工前就抛了）；
   * 被拒的**步骤**各自另有一行。判定（成没成）在工具输出里，不塞进审计行。
   */
  audit?.record({
    at: now(),
    targetId: target.id,
    action: 'login',
    allowed: true,
    subject: target.id,
    ...(operationId === undefined ? {} : { operationId }),
  })

  return {
    targetId: target.id,
    status,
    steps,
    success,
    message: overallMessage({ status, cancelled, plan, steps, success }),
    elapsedMs: now() - startedAt,
    cancelled,
  }
}

/** 一步执行成功时那句话（`fill` 用引用时把保护强度一起说清——**不许**把方便说成防护）。 */
function doneMessage(step: LoginStep, result: unknown): string {
  switch (step.action) {
    case 'goto':
      return `已打开 ${step.url}`
    case 'click':
      return `已点击 ${step.selector}`
    case 'waitFor':
      return `元素已出现：${step.selector}`
    case 'fill': {
      if (step.credentialRef === undefined) return `已填值到 ${step.selector}`
      const level = stringField(result, 'protection')
      const note = stringField(result, 'protectionNote')
      const strength = level === undefined ? '' : `；保护强度 ${level}${note === undefined ? '' : `：${note}`}`
      return `已填值到 ${step.selector}（来自凭据引用 ${step.credentialRef}${strength}）`
    }
  }
}

/** 等一个元素出现（轮询；睡眠可被 abort 唤醒）。 */
async function waitForElement(input: {
  selector: string
  timeoutMs: number
  observe: (selectors: readonly string[]) => Promise<PageObservation>
  currentUrl: () => Promise<string | undefined>
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>
  now: () => number
  signal?: AbortSignal
}): Promise<WaitOutcome> {
  const { selector, timeoutMs, observe, currentUrl, sleep, now, signal } = input
  const deadline = now() + timeoutMs
  for (;;) {
    if (signal?.aborted === true) return { kind: 'cancelled' }
    let observation: PageObservation
    try {
      observation = await observe([selector])
    } catch (error) {
      return { kind: 'error', message: error instanceof Error ? error.message : String(error) }
    }
    const found = observation.elements?.[selector]
    if (found === undefined) {
      return { kind: 'missing', note: `这次观察没带 ${selector} 的结果（观察层应当把声明过的选择器都取一遍）` }
    }
    if (found.error !== undefined) return { kind: 'invalid', error: found.error }
    if (found.count > 0) return { kind: 'found' }

    const left = deadline - now()
    if (left <= 0) {
      const url = await currentUrl().catch(() => undefined)
      return {
        kind: 'timeout',
        note: `等了 ${String(timeoutMs)}ms，${selector} 还没出现（当前页面 ${url ?? '（问不到）'}）`,
      }
    }
    await sleep(Math.min(LOGIN_POLL_MS, left), signal)
  }
}

/** 求一次成功判据（只在所有步骤都执行完时才调）。 */
async function evaluateSuccess(input: {
  selector: string
  observe: (selectors: readonly string[]) => Promise<PageObservation>
  currentUrl: () => Promise<string | undefined>
}): Promise<LoginSuccessReport> {
  const { selector, observe, currentUrl } = input
  const url = await currentUrl().catch(() => undefined)
  const page = url ?? '（问不到当前页面）'
  let observation: PageObservation
  try {
    observation = await observe([selector])
  } catch (error) {
    return {
      selector,
      verdict: 'unknown',
      got: `观察失败（${error instanceof Error ? error.message : String(error)}）`,
      message: `成功判据求不出来（观察这个页面失败）——**没验成**，不是「登录没成」`,
    }
  }
  const found = observation.elements?.[selector]
  if (found === undefined) {
    return {
      selector,
      verdict: 'unknown',
      got: '（这次观察没带它的结果）',
      message: `成功判据求不出来：观察层没给 ${selector} 的结果`,
    }
  }
  if (found.error !== undefined) {
    return {
      selector,
      verdict: 'unknown',
      got: `选择器不合法（${found.error}）`,
      message: `成功判据的选择器不合法（${found.error}）——先修声明里的这个选择器，它与「元素没出现」是两件事`,
    }
  }
  if (found.count > 0) {
    return { selector, verdict: 'met', got: `命中 ${String(found.count)} 个 @ ${page}`, message: `成功判据 ${selector} 命中` }
  }
  return {
    selector,
    verdict: 'unmet',
    got: `命中 0 个 @ ${page}`,
    message: `成功判据 ${selector} 没命中——步骤都执行完了，但没有到「已登录」那个状态`,
  }
}

/** 一句话结论。 */
function overallMessage(input: {
  status: LoginRunResult['status']
  cancelled: boolean
  plan: LoginPlan
  steps: LoginStepReport[]
  success: LoginSuccessReport
}): string {
  const { status, cancelled, plan, steps, success } = input
  const done = steps.filter((step) => step.status === 'done').length
  const total = plan.steps.length
  if (cancelled) {
    return `被调用方取消：走完 ${String(done)}/${String(total)} 步，剩下的没执行——**没有结论**。已执行的动作没有回滚，浏览器与页面还在原处（后续调用可以直接接着用）`
  }
  if (status === 'ok') return `登录成功：${String(total)} 步都执行完，成功判据 ${success.selector} 命中`
  if (status === 'fail') {
    return `登录**没成**：${String(total)} 步都执行完了，但成功判据 ${success.selector} 没命中——**不要**把这次会话当成已登录（后续断言会拿到登录页）`
  }
  const failed = steps.find((step) => step.status === 'failed')
  const where = failed === undefined ? '' : `第 ${String(failed.index)} 步（${failed.action} ${failed.subject}）没走成`
  return `没有结论：${where === '' ? '流程没走完' : where}——走完 ${String(done)}/${String(total)} 步（**没验成**，不是「验出问题」）`
}
