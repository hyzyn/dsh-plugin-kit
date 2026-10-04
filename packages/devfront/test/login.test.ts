/**
 * 登录声明的**判定**（`login.ts`）：形态、上限、以及每一条「写错」的反例。
 *
 * ## 为什么这一组用例是这件事的主证据
 *
 * 登录编排天然朝着「通用浏览器自动化」滑，唯一挡住它的东西就是这份声明形态：固定词汇、步数与预算
 * 上限、每步过同一道判据。而形态是**判据**，判据必须有反例——不然下一次「顺手放宽一点」没人拦得住。
 * 所以下面的用例分两半：**能收下的**（默认值真的填好了、相对 URL 真的解析对了）与**必须拒的**
 * （未知字段、越界 URL、目标没声明过的凭据引用、`success.url`……），后者每条都对着一个具体的写错方式。
 */

import { describe, expect, it } from 'vitest'

import {
  LOGIN_BUDGET_MS,
  LOGIN_WAIT_DEFAULT_MS,
  LOGIN_WAIT_MAX_MS,
  MAX_LOGIN_STEPS,
  describeLoginErrors,
  parseLogin,
} from '../src/login.js'
import type { WebTarget } from '../src/page.js'

const SITE = 'https://cdqas.example.com/'

const TARGET: WebTarget = {
  id: 'w-cdqas',
  label: '海关前端',
  url: SITE,
  scopeDirs: ['/work/cdqas'],
  credentialRef: 'env:CDQAS_APP_PWD',
}

/** 解析并断言成功，返回计划。 */
function planOf(raw: unknown, target: WebTarget = TARGET) {
  const parsed = parseLogin(raw, target)
  if (!parsed.ok) throw new Error(`本该成立，却报了：${describeLoginErrors(parsed.errors)}`)
  return parsed.plan
}

/** 解析并断言失败，返回 `path：message` 那一行（便于 `toContain` 断言）。 */
function errorOf(raw: unknown, target: WebTarget = TARGET): string {
  const parsed = parseLogin(raw, target)
  if (parsed.ok) throw new Error('本该被拒，却通过了')
  return describeLoginErrors(parsed.errors)
}

/** 一份最小的合法声明。 */
const MINIMAL = {
  steps: [
    { action: 'goto', url: '/login' },
    { action: 'fill', selector: '#user', value: 'admin' },
    { action: 'fill', selector: '#pwd', credentialRef: 'env:CDQAS_APP_PWD' },
    { action: 'click', selector: '#submit' },
  ],
  success: { selector: '#app' },
}

describe('登录声明：能收下的那一种', () => {
  it('四步 + 一条成功判据 → 计划里 URL 已解析、预算已填', () => {
    const plan = planOf(MINIMAL)
    expect(plan.steps).toEqual([
      { action: 'goto', url: `${SITE}login` },
      { action: 'fill', selector: '#user', value: 'admin' },
      { action: 'fill', selector: '#pwd', credentialRef: 'env:CDQAS_APP_PWD' },
      { action: 'click', selector: '#submit' },
    ])
    expect(plan.success).toEqual({ selector: '#app' })
    // 预算**不可声明**：它只能是那个常量（一份写长的声明不该把上限换走）。
    expect(plan.budgetMs).toBe(LOGIN_BUDGET_MS)
  })

  it('相对 URL 按**站点根**解析（`/login` 与 `login` 落在同一处，绝对 URL 原样收下）', () => {
    expect(planOf({ ...MINIMAL, steps: [{ action: 'goto', url: 'login' }, ...MINIMAL.steps.slice(1)] }).steps[0]).toEqual({
      action: 'goto',
      url: `${SITE}login`,
    })
    expect(planOf({ ...MINIMAL, steps: [{ action: 'goto', url: `${SITE}login` }, ...MINIMAL.steps.slice(1)] }).steps[0]).toEqual({
      action: 'goto',
      url: `${SITE}login`,
    })
  })

  it('`waitFor` 的缺省与显式超时（合法范围）', () => {
    const steps = [{ action: 'goto', url: '/' }, { action: 'waitFor', selector: '#form' }]
    expect(planOf({ ...MINIMAL, steps }).steps[1]).toEqual({
      action: 'waitFor',
      selector: '#form',
      timeoutMs: LOGIN_WAIT_DEFAULT_MS,
    })
    expect(planOf({ ...MINIMAL, steps: [...steps.slice(0, 1), { action: 'waitFor', selector: '#form', timeoutMs: 1234 }] }).steps[1]).toEqual({
      action: 'waitFor',
      selector: '#form',
      timeoutMs: 1234,
    })
  })

  it('`fill` 的明文值允许是空串（清空输入框是合法动作）', () => {
    expect(planOf({ ...MINIMAL, steps: [{ action: 'goto', url: '/' }, { action: 'fill', selector: '#kw', value: '' }] }).steps[1]).toEqual({
      action: 'fill',
      selector: '#kw',
      value: '',
    })
  })

  it('目标没声明 `credentialRef` 时，纯明文的那份声明照收（不是所有登录都要凭据）', () => {
    const bare: WebTarget = { id: 'w-bare', label: 'b', url: SITE, scopeDirs: ['/work/cdqas'] }
    const plan = planOf({ ...MINIMAL, steps: MINIMAL.steps.slice(0, 2) }, bare)
    expect(plan.steps).toHaveLength(2)
  })
})

describe('登录声明：必须拒的那几种写法（每条对着一个真实的写错方式）', () => {
  it('整个声明不是映射', () => {
    expect(errorOf(['goto'])).toContain('必须是一个映射')
  })

  it('未知字段一律拒（`step` 写成单数这种）', () => {
    expect(errorOf({ ...MINIMAL, step: [] })).toContain('step：未知字段')
  })

  it('`steps` 不是数组 / 空 / 超过上限', () => {
    expect(errorOf({ ...MINIMAL, steps: 'goto' })).toContain('steps：必须是一个数组')
    expect(errorOf({ ...MINIMAL, steps: [] })).toContain('至少要有一步')
    const many = Array.from({ length: MAX_LOGIN_STEPS + 1 }, () => ({ action: 'goto', url: '/' }))
    expect(errorOf({ ...MINIMAL, steps: many })).toContain(`超过了上限 ${String(MAX_LOGIN_STEPS)} 步`)
  })

  it('★★ 第一步不是 `goto` → 拒（那份声明会依赖「浏览器恰好停在哪一页」）', () => {
    expect(
      errorOf({ ...MINIMAL, steps: [{ action: 'waitFor', selector: '#form' }, { action: 'goto', url: '/' }] }),
    ).toContain('第一步必须是 `goto`')
  })

  it('未登记的动作名（`evaluate` 这类「顺手加一步」）', () => {
    expect(errorOf({ ...MINIMAL, steps: [{ action: 'evaluate', script: 'x' }] })).toContain('action：必须是 goto / fill / click / waitFor 之一')
  })

  it('步骤里不认识的字段（`timeout` 少写 ms、`url` 写在 fill 上）', () => {
    expect(errorOf({ ...MINIMAL, steps: [{ action: 'goto', url: '/', timeout: 100 }] })).toContain('steps[0].timeout：')
    expect(errorOf({ ...MINIMAL, steps: [{ action: 'goto', url: '/', selector: '#x' }] })).toContain('`goto` 这一步没有这个字段')
  })

  it('★ `goto` 越出站点范围（异源 / 越出路径前缀）→ 在**碰浏览器之前**拒，并给跨源的正路', () => {
    const foreign = errorOf({ ...MINIMAL, steps: [{ action: 'goto', url: 'https://idp.example.com/login' }] })
    expect(foreign).toContain('不在目标 w-cdqas 声明的站点范围内')
    expect(foreign).toContain('allowedOrigins')

    // 站点声明带路径前缀时，同源但越出前缀也要拒（`open` 的门槛是**同源 + 前缀**，只判同源会漏）。
    const appOnly: WebTarget = { id: 'w-app', label: 'a', url: `${SITE}app/`, scopeDirs: ['/work/cdqas'] }
    expect(errorOf({ ...MINIMAL, steps: [{ action: 'goto', url: '/admin' }] }, appOnly)).toContain('不在目标 w-app 声明的站点范围内')
    expect(planOf({ ...MINIMAL, steps: [{ action: 'goto', url: '/app/login' }] }, appOnly).steps[0]).toEqual({
      action: 'goto',
      url: `${SITE}app/login`,
    })
  })

  it('站点 URL 本身不合法 → 报出来（这是配置问题，不是「登录页写错了」）', () => {
    const broken: WebTarget = { id: 'w-broken', label: 'b', url: 'not-a-url', scopeDirs: ['/work'] }
    expect(errorOf({ ...MINIMAL, steps: [{ action: 'goto', url: '/login' }] }, broken)).toContain('解析不了（站点 URL 是 "not-a-url"）')
  })

  it('`fill` 少了值 / 同时给两个', () => {
    expect(errorOf({ ...MINIMAL, steps: [{ action: 'goto', url: '/' }, { action: 'fill', selector: '#u' }] })).toContain('这一步没有值')
    expect(
      errorOf({
        ...MINIMAL,
        steps: [{ action: 'goto', url: '/' }, { action: 'fill', selector: '#u', value: 'x', credentialRef: 'env:CDQAS_APP_PWD' }],
      }),
    ).toContain('只能给一个')
  })

  it('★★ 口令写成明文引用形状：不是 `env:NAME` 一律拒', () => {
    expect(
      errorOf({ ...MINIMAL, steps: [{ action: 'goto', url: '/' }, { action: 'fill', selector: '#p', credentialRef: 'hunter2' }] }),
    ).toContain('必须是引用（env:NAME）')
  })

  it('★★ `credentialRef` 只认目标声明过的那一个（否则它就是「读任意环境变量」）', () => {
    expect(
      errorOf({ ...MINIMAL, steps: [{ action: 'goto', url: '/' }, { action: 'fill', selector: '#p', credentialRef: 'env:SOMEONE_ELSE' }] }),
    ).toContain('声明的是 env:CDQAS_APP_PWD，不是 env:SOMEONE_ELSE')

    const bare: WebTarget = { id: 'w-bare', label: 'b', url: SITE, scopeDirs: ['/work/cdqas'] }
    expect(
      errorOf({ ...MINIMAL, steps: [{ action: 'goto', url: '/' }, { action: 'fill', selector: '#p', credentialRef: 'env:X' }] }, bare),
    ).toContain('没有声明 credentialRef')
  })

  it('`click` / `waitFor` 缺选择器；`waitFor` 的超时越界', () => {
    expect(errorOf({ ...MINIMAL, steps: [{ action: 'goto', url: '/' }, { action: 'click', selector: '  ' }] })).toContain('selector：必须是非空 CSS 选择器')
    expect(
      errorOf({ ...MINIMAL, steps: [{ action: 'goto', url: '/' }, { action: 'waitFor', selector: '#x', timeoutMs: LOGIN_WAIT_MAX_MS + 1 }] }),
    ).toContain(`必须是 1~${String(LOGIN_WAIT_MAX_MS)} 的整数`)
    expect(errorOf({ ...MINIMAL, steps: [{ action: 'goto', url: '/' }, { action: 'waitFor', selector: '#x', timeoutMs: 1.5 }] })).toContain('整数')
  })

  it('★ `success` 必写、必须是映射、选择器非空', () => {
    expect(errorOf({ steps: MINIMAL.steps })).toContain('success：必写')
    expect(errorOf({ ...MINIMAL, success: '#app' })).toContain('success：必须是一个映射')
    expect(errorOf({ ...MINIMAL, success: { selector: '' } })).toContain('success.selector：必须是非空 CSS 选择器')
  })

  it('★★ `success.url` 刻意不做——并说清为什么（前缀判据可能恒真）', () => {
    const text = errorOf({ ...MINIMAL, success: { url: '/home' } })
    expect(text).toContain('success.url：判据刻意不做 URL')
    expect(text).toContain('恒真')
  })

  it('多条错误一次全给（不是报一个改一个）', () => {
    const text = errorOf({ steps: [{ action: 'bogus' }], success: { selector: '' }, extra: 1 })
    expect(text.split('\n').length).toBeGreaterThanOrEqual(3)
  })
})
