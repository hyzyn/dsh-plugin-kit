/**
 * 登录执行器（`login-run.ts`）：逐步的账、三态、等待、预算与取消。
 *
 * ## 这些用例守的是什么
 *
 * 执行器把「照声明走一遍」变成**可以读的报告**。最容易读错的两件事都在这儿钉着：
 *
 *   1. **「没走成」不许报成「没登录成」**——被闸门拒 / 选择器不合法 / 等待超时 / 预算用尽 / 被取消
 *      一律是 `unknown`（没验成），只有「步骤都执行完了、成功判据给了否」才是 `fail`。
 *      两者的下一步动作正好相反（改声明 vs 改口令/查页面）。
 *   2. **值不进报告**——逐步的账里只有选择器与凭据**引用名**；连明文 `value` 也不回显。
 *
 * 依赖全注入（`invoke` / `observe` / `currentUrl` / `sleep` / `now`）：**不连浏览器、不真等**。
 * 真实判据链（同源 / 目录作用域 / 动手前核页面源 / 凭据解析）在 `page.ts` 与 `tools.test.ts` 那一层。
 */

import { describe, expect, it } from 'vitest'

import { parseLogin, type LoginPlan } from '../src/login.js'
import { runLogin, type LoginRunResult } from '../src/login-run.js'
import type { WebActionRequest, WebAuditEntry, WebOutcome, WebTarget } from '../src/page.js'
import type { PageElementObservation, PageObservation } from '../src/web-verify.js'

const SITE = 'https://cdqas.example.com/'

const TARGET: WebTarget = {
  id: 'w-cdqas',
  label: '海关前端',
  url: SITE,
  scopeDirs: ['/work/cdqas'],
  credentialRef: 'env:CDQAS_APP_PWD',
}

const DECLARATION = {
  steps: [
    { action: 'goto', url: '/login' },
    { action: 'fill', selector: '#user', value: 'admin' },
    { action: 'fill', selector: '#pwd', credentialRef: 'env:CDQAS_APP_PWD' },
    { action: 'click', selector: '#submit' },
  ],
  success: { selector: '#app' },
}

function planOf(raw: unknown = DECLARATION): LoginPlan {
  const parsed = parseLogin(raw, TARGET)
  if (!parsed.ok) throw new Error(`夹具声明不成立：${JSON.stringify(parsed.errors)}`)
  return parsed.plan
}

/** 一次 run 里收到的动作请求（断言「执行器交给判定层的是什么」）。 */
interface Harness {
  requests: WebActionRequest[]
  audits: WebAuditEntry[]
  sleeps: number[]
  result: LoginRunResult
}

/**
 * 跑一次登录，依赖全假。
 *
 * **虚拟时钟**：`now()` 读它、`sleep()` 推进它——于是「轮询几次」「等了多久」「预算还剩多少」
 * 完全确定，用例**不真等**（真实睡眠那条单独有用例）。
 *
 * @param options.elements - 选择器 + 第几次轮询 → 观察结果；返回 `undefined` = 这次观察**没带**它。
 * @param options.deny - 让某个动作被拒（`code` 由调用方给）。
 * @param options.onObserve - 每次观察时调一下（用例用它制造「取消」「第几次才出现」）。
 */
async function drive(options: {
  plan?: LoginPlan
  elements?: (selector: string, poll: number) => PageElementObservation | undefined
  observeThrows?: string
  deny?: (request: WebActionRequest) => WebOutcome | undefined
  onObserve?: (selector: string, poll: number) => void
  signal?: AbortSignal
} = {}): Promise<Harness> {
  const requests: WebActionRequest[] = []
  const audits: WebAuditEntry[] = []
  const sleeps: number[] = []
  const polls = new Map<string, number>()
  const plan = options.plan ?? planOf()
  let clock = 0

  const result = await runLogin({
    target: TARGET,
    plan,
    cwd: '/work/cdqas',
    invoke: async (request) => {
      requests.push(request)
      const denied = options.deny?.(request)
      if (denied !== undefined) return denied
      switch (request.action) {
        case 'open':
          return { ok: true, action: 'open', result: { url: request.url } }
        case 'click':
          return { ok: true, action: 'click', result: { selector: request.selector } }
        case 'fill':
          return {
            ok: true,
            action: 'fill',
            result: {
              selector: request.selector,
              ...(request.credentialRef === undefined
                ? {}
                : { credentialRef: request.credentialRef, protection: 'none', protectionNote: '继承来的环境变量：agent 与用户同 uid，读得到——方便，不是防护' }),
            },
          }
        default:
          throw new Error(`执行器发了不该发的动作：${request.action}`)
      }
    },
    observe: async (selectors) => {
      const elements: Record<string, PageElementObservation> = {}
      for (const wanted of selectors) {
        const poll = polls.get(wanted) ?? 0
        polls.set(wanted, poll + 1)
        options.onObserve?.(wanted, poll)
        if (options.observeThrows !== undefined) throw new Error(options.observeThrows)
        const found = options.elements === undefined ? { count: 1 } : options.elements(wanted, poll)
        if (found !== undefined) elements[wanted] = found
      }
      return { url: `${SITE}login`, elements } as PageObservation
    },
    currentUrl: async () => `${SITE}login`,
    audit: { record: (entry) => audits.push(entry) },
    operationId: 'login',
    sleep: async (ms) => {
      sleeps.push(ms)
      clock += ms
    },
    now: () => clock,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  })
  return { requests, audits, sleeps, result }
}

describe('登录执行器：走通 / 没成 / 没走完，三态分明', () => {
  it('★ 每一步都执行完 + 成功判据命中 → `ok`，且逐步的账齐全', async () => {
    const { requests, audits, result } = await drive()

    expect(result.status).toBe('ok')
    expect(result.message).toContain('登录成功')
    expect(result.steps.map((step) => [step.index, step.action, step.status])).toEqual([
      [1, 'goto', 'done'],
      [2, 'fill', 'done'],
      [3, 'fill', 'done'],
      [4, 'click', 'done'],
    ])
    expect(result.success).toEqual({
      selector: '#app',
      verdict: 'met',
      got: `命中 1 个 @ ${SITE}login`,
      message: '成功判据 #app 命中',
    })
    expect(result.cancelled).toBe(false)

    // 交给判定层的请求：`goto` 是解析好的绝对 URL；口令那一步只有**引用**，没有值。
    expect(requests).toEqual([
      { target: TARGET, action: 'open', cwd: '/work/cdqas', url: `${SITE}login` },
      { target: TARGET, action: 'fill', cwd: '/work/cdqas', selector: '#user', value: 'admin' },
      { target: TARGET, action: 'fill', cwd: '/work/cdqas', selector: '#pwd', credentialRef: 'env:CDQAS_APP_PWD' },
      { target: TARGET, action: 'click', cwd: '/work/cdqas', selector: '#submit' },
    ])
    // 整体那一行审计（逐步的由 `invokeWebAction` 记，见 `page.test.ts`）。
    expect(audits).toEqual([{ at: 0, targetId: TARGET.id, action: 'login', allowed: true, subject: TARGET.id, operationId: 'login' }])
  })

  it('★★ 值不进报告：连明文 `value` 也不回显，只给选择器与引用名', async () => {
    const { result } = await drive()
    const text = JSON.stringify(result)
    expect(text).not.toContain('admin')
    expect(text).toContain('env:CDQAS_APP_PWD')
    // 保护强度如实带出（不许把「方便」说成「防护」）。
    expect(result.steps[2]?.message).toContain('保护强度 none')
    expect(result.steps[2]?.credentialRef).toBe('env:CDQAS_APP_PWD')
  })

  it('★ 步骤都执行完但成功判据没命中 → `fail`（登录没成，别当作已登录）', async () => {
    const { result } = await drive({ elements: (selector) => (selector === '#app' ? { count: 0 } : { count: 1 }) })
    expect(result.status).toBe('fail')
    expect(result.success.verdict).toBe('unmet')
    expect(result.success.got).toBe(`命中 0 个 @ ${SITE}login`)
    expect(result.message).toContain('登录**没成**')
    expect(result.message).toContain('不要')
  })

  it('★ 有步骤被拒 → `unknown`：剩下的步骤不再执行，成功判据**不求值**', async () => {
    const observed: string[] = []
    const { result } = await drive({
      deny: (request) =>
        request.action === 'fill' && request.credentialRef !== undefined
          ? {
              ok: false,
              action: 'fill',
              code: 'CREDENTIAL_UNRESOLVED',
              message: '凭据引用 env:CDQAS_APP_PWD 解析不了：没配',
              hint: '按这条错误去补凭据；值本身不会出现在任何输出与日志里',
            }
          : undefined,
      onObserve: (selector) => observed.push(selector),
    })

    expect(result.status).toBe('unknown')
    expect(result.steps[2]).toMatchObject({
      index: 3,
      action: 'fill',
      subject: '#pwd',
      status: 'failed',
      code: 'CREDENTIAL_UNRESOLVED',
      credentialRef: 'env:CDQAS_APP_PWD',
    })
    expect(result.steps[2]?.hint).toContain('去补凭据')
    expect(result.steps[3]).toMatchObject({ status: 'skipped', message: '前面的步骤没走成，这一步没执行' })
    // 判据没求值——不能拿「没走到」去当「登录没成」。
    expect(result.success.verdict).toBe('unknown')
    expect(result.success.got).toContain('没有求值')
    expect(observed).toEqual([])
    expect(result.message).toContain('没有结论')
    expect(result.message).toContain('没验成')
  })
})

describe('登录执行器：`waitFor` 的三条出口', () => {
  const WAIT_PLAN = { steps: [{ action: 'goto', url: '/' }, { action: 'waitFor', selector: '#form', timeoutMs: 5000 }], success: { selector: '#app' } }

  it('轮询到元素出现就停（不是死等一个超时）', async () => {
    const { result, sleeps } = await drive({
      plan: planOf(WAIT_PLAN),
      elements: (selector, poll) => (selector === '#form' ? { count: poll >= 2 ? 1 : 0 } : { count: 1 }),
    })
    expect(result.steps[1]).toMatchObject({ status: 'done', subject: '#form' })
    expect(sleeps).toEqual([250, 250])
    expect(result.status).toBe('ok')
  })

  it('超时 → `failed`，且带上**当前页面**（复核的起点）', async () => {
    const { result } = await drive({
      plan: planOf(WAIT_PLAN),
      elements: (selector) => (selector === '#form' ? { count: 0 } : { count: 1 }),
    })
    expect(result.steps[1]?.status).toBe('failed')
    expect(result.steps[1]?.message).toContain(`等了 5000ms，${'#form'} 还没出现（当前页面 ${SITE}login）`)
    expect(result.steps[1]?.code).toBeUndefined()
    expect(result.status).toBe('unknown')
  })

  it('选择器本身不合法 → 与「元素没出现」分开（`INVALID_SELECTOR`）', async () => {
    const { result } = await drive({
      plan: planOf(WAIT_PLAN),
      elements: (selector) => (selector === '#form' ? { count: 0, error: 'not a valid selector' } : { count: 1 }),
    })
    expect(result.steps[1]).toMatchObject({ status: 'failed', code: 'INVALID_SELECTOR' })
    expect(result.steps[1]?.message).toContain('not a valid selector')
    expect(result.steps[1]?.message).toContain('与「元素没出现」是两件事')
  })

  it('观察层没给这个选择器的结果 / 观察直接抛 → 都能说出是哪一种', async () => {
    const missing = await drive({
      plan: planOf(WAIT_PLAN),
      elements: (selector) => (selector === '#form' ? undefined : { count: 1 }),
    })
    expect(missing.result.steps[1]?.message).toContain('没带 #form 的结果')

    const thrown = await drive({ plan: planOf(WAIT_PLAN), observeThrows: 'CDP 断了' })
    expect(thrown.result.steps[1]?.message).toContain('观察页面失败：CDP 断了')
    expect(thrown.result.status).toBe('unknown')
  })
})

describe('登录执行器：成功判据自身的两种「求不出来」', () => {
  it('判据的选择器不合法 → `unknown`（是声明写错，不是「登录没成」）', async () => {
    const { result } = await drive({ elements: (selector) => (selector === '#app' ? { count: 0, error: 'bad selector' } : { count: 1 }) })
    expect(result.status).toBe('unknown')
    expect(result.success.verdict).toBe('unknown')
    expect(result.success.message).toContain('选择器不合法')
  })

  it('观察成功判据时抛 → `unknown`，且明说「没验成」', async () => {
    const { result } = await drive({ observeThrows: 'CDP 断了' })
    // 等待步骤不存在，只有成功判据那一次观察会抛 → 步骤全 done，判据求不出来。
    expect(result.steps.every((step) => step.status === 'done')).toBe(true)
    expect(result.status).toBe('unknown')
    expect(result.success.verdict).toBe('unknown')
    expect(result.success.message).toContain('没验成')
  })
})

describe('登录执行器：预算与取消（长等待的规矩）', () => {
  it('★ 预算用尽 → 剩下的步骤 `skipped` 并说清是预算；等待被**剩余预算**夹取', async () => {
    const { result, sleeps } = await drive({
      // 预算 200ms：第二步的等待被夹到 200（不是声明里的 5000），它一走完预算就没了。
      plan: {
        ...planOf({ steps: [{ action: 'goto', url: '/' }, { action: 'waitFor', selector: '#form', timeoutMs: 5000 }, { action: 'click', selector: '#go' }], success: { selector: '#app' } }),
        budgetMs: 200,
      },
      elements: (selector, poll) => (selector === '#form' ? { count: poll >= 1 ? 1 : 0 } : { count: 1 }),
    })

    expect(sleeps).toEqual([200]) // 夹取的证据：它睡的是剩余预算，不是 250 的轮询间隔
    expect(result.steps[0]?.status).toBe('done')
    expect(result.steps[1]?.status).toBe('done')
    expect(result.steps[2]).toMatchObject({ status: 'skipped' })
    expect(result.steps[2]?.message).toContain('总预算 200ms 用尽')
    expect(result.status).toBe('unknown')
    expect(result.success.got).toContain('没有求值')
  })

  it('★ 取消自成一档：剩下的步骤没执行，报告说清「动作没回滚、页面还在」', async () => {
    const controller = new AbortController()
    const { result } = await drive({
      plan: planOf({ steps: [{ action: 'goto', url: '/' }, { action: 'waitFor', selector: '#form' }, { action: 'click', selector: '#go' }], success: { selector: '#app' } }),
      signal: controller.signal,
      // 第一次轮询就把调用方取消掉。
      onObserve: () => controller.abort(),
      elements: (selector) => (selector === '#form' ? { count: 0 } : { count: 1 }),
    })
    expect(result.cancelled).toBe(true)
    expect(result.status).toBe('unknown')
    expect(result.steps[1]).toMatchObject({ status: 'skipped' })
    expect(result.steps[1]?.message).toContain('没等完')
    expect(result.steps[2]?.message).toContain('被调用方取消：没执行')
    expect(result.message).toContain('被调用方取消')
    expect(result.message).toContain('没有回滚')
    expect(result.success.verdict).toBe('unknown')
  })

  it('睡眠是可被 abort 唤醒的（**真实**睡眠：abort 之后立刻返回，不等满超时）', async () => {
    const controller = new AbortController()
    const plan = planOf({ steps: [{ action: 'goto', url: '/' }, { action: 'waitFor', selector: '#form', timeoutMs: 5000 }], success: { selector: '#app' } })
    const startedAt = Date.now()
    const result = await runLogin({
      target: TARGET,
      plan,
      cwd: '/work/cdqas',
      invoke: async () => ({ ok: true, action: 'open', result: {} }),
      observe: async () => {
        // 30ms 后调用方不等了：这一轮正睡在 250ms 的轮询间隔里。
        setTimeout(() => controller.abort(), 30)
        return { url: SITE, elements: { '#form': { count: 0 } } }
      },
      currentUrl: async () => SITE,
      signal: controller.signal,
    })
    expect(result.cancelled).toBe(true)
    expect(result.status).toBe('unknown')
    // 断言「比自己的上限快一个数量级」：没接线时它会等到 5 秒（或测试超时）。
    expect(Date.now() - startedAt).toBeLessThan(1000)
  })
})
