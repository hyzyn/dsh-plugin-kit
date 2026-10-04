/**
 * 清单**跑批**测试（`verify-run.ts`）：四种处置一种都不许混。
 *
 * ## 它守的是什么
 *
 * 清单加载与求值都有各自的用例，缺的是中间那一跳：**把每条断言接到执行通道上**。这一跳最容易出的
 * 错不是崩溃，而是**把「没验成」写成「验出问题」**（或反过来）——两者的下一步动作相反：
 * 一个去修通路 / 补配置，一个去改数据。所以用例的重点在四种处置的**边界**：
 *
 *   ① 清单里的目标没配 → `unknown`，而且**通道一次都不许被调用**（发下去就等于拿一个不存在的目标
 *      去跑，报告还会看起来是绿的）；
 *   ② 引擎没接通（通道短路）→ `unknown`，原因原样带出；
 *   ③ 被作用域 / 闸门拒 → `unknown`，**码与正文一字不改**（拒绝码是 agent 决定下一步的稳定标识）；
 *   ④ 真跑了 → 交 `evaluateAssertion`（`pass` / `fail` / `unknown` 的唯一真源）。
 *
 * 通道是**注入**的，所以这一层不连网、不起宿主——四种回复各一个假通道就够了。
 *
 * ## 反例（不许恒绿）
 *
 * 「没验成」那几条都配了反例，形态是**把坏实现真的跑一遍**，让它露出与真实结果相反的答案：
 *   - ① 的坏实现是「把没配的目标也发下去」——假通道那条 `ok:true` 会被判成 `pass`（绿），
 *     与真实的 `unknown` 相反；
 *   - ② 的坏实现是「把引擎没接通写成 `fail`」——整批 `overall` 从 `unknown` 变成 `fail`，
 *     与真实的汇总相反。
 */

import { describe, expect, it } from 'vitest'

import {
  runManifestVerify,
  summarizeResults,
  type AssertionRun,
  type AssertionRunner,
  type ShapedResult,
  type VerifyAssertion,
  type VerifyTargetRef,
} from '../src/index.js'

/** 造一个整形后的结果集（与求值层用例同一形态）。 */
function shaped(
  rows: Array<Record<string, unknown>>,
  options: { columns?: string[]; truncated?: boolean; limit?: number } = {},
): ShapedResult {
  return {
    columns: options.columns ?? Object.keys(rows[0] ?? {}),
    rows,
    rowCount: rows.length,
    truncated: options.truncated ?? false,
    limit: options.limit ?? 100,
  }
}

/** 造一条断言（缺省是 redis 目标上一条能通过的 PING）。 */
function assertion(overrides: Partial<VerifyAssertion> = {}): VerifyAssertion {
  return {
    id: 'a1',
    project: 'cdqas',
    appliesTo: 'backend',
    target: 'redis-248',
    statement: 'PING',
    expect: { eq: 'PONG' },
    severity: 'fail',
    ...overrides,
  }
}

/** 记下通道被调用的断言 id（处置 ① 的判据是「**没发**通道」，所以调用表本身就是证据）。 */
function recorder(reply: (input: { assertion: VerifyAssertion; target: VerifyTargetRef }) => AssertionRun): {
  runner: AssertionRunner
  calls: string[]
} {
  const calls: string[] = []
  const runner: AssertionRunner = (input) => {
    calls.push(input.assertion.id)
    return Promise.resolve(reply(input))
  }
  return { runner, calls }
}

const REDIS: VerifyTargetRef = { id: 'redis-248', engine: 'redis' }

describe('清单跑批：真的跑了的那一条交给求值层', () => {
  it('按清单顺序逐条跑；汇总与「跑了 X/Y 条」都对得上', async () => {
    const { runner } = recorder(() => ({ ok: true, result: shaped([{ value: 'PONG' }]), latencyMs: 3 }))
    const run = await runManifestVerify({
      project: 'cdqas',
      cwd: '/w/cdqas',
      assertions: [assertion({ id: 'a' }), assertion({ id: 'b', expect: { rowCount: 1 } }), assertion({ id: 'c', expect: { eq: 'NOPE' } })],
      targets: [REDIS],
      runner,
    })

    // 报告顺序 = 清单顺序（不排序、不按目标分组：评审时两边要能逐行对得上）
    expect(run.results.map((result) => result.id)).toEqual(['a', 'b', 'c'])
    expect(run.ran).toBe(3)
    expect(run.problems).toEqual([])
    expect(run.summary).toEqual({ total: 3, passed: 2, failed: 1, warned: 0, unknown: 0, overall: 'fail' })
  })

  it('真跑了但判「验不了」时，`ran` 仍然算它跑过（这个数的是执行，不是判定）', async () => {
    const { runner } = recorder(() => ({ ok: true, result: shaped([]), latencyMs: 1 }))
    const run = await runManifestVerify({ project: 'cdqas', cwd: '/w/cdqas', assertions: [assertion()], targets: [REDIS], runner })

    expect(run.results[0]?.status).toBe('unknown')
    expect(run.results[0]?.message).toContain('验不了')
    expect(run.ran).toBe(1)
    // 它有结果集、只是没法比 → 不是跑批级问题（跑批级问题只收「一条都没跑成」的原因）
    expect(run.problems).toEqual([])
  })

  it('ceiling 透传给求值层：超过上限记「这条断言太宽」，与数据对不对无关', async () => {
    const { runner } = recorder(() => ({
      ok: true,
      result: shaped([{ value: 1 }, { value: 2 }, { value: 3 }]),
      latencyMs: 1,
    }))
    const run = await runManifestVerify({
      project: 'cdqas',
      cwd: '/w/cdqas',
      assertions: [assertion({ expect: { rowCount: 3 } })],
      targets: [REDIS],
      runner,
      ceiling: 2,
    })

    expect(run.results[0]?.status).toBe('unknown')
    expect(run.results[0]?.message).toContain('超过本批上限 2')
    expect(run.ran).toBe(1)
  })
})

describe('清单跑批：三种「没验成」，措辞与码都不许改', () => {
  it('① 清单里的目标没配 → `unknown`，且**通道一次都没被调用**', async () => {
    const { runner, calls } = recorder(() => ({ ok: true, result: shaped([{ value: 'PONG' }]), latencyMs: 1 }))
    const run = await runManifestVerify({
      project: 'cdqas',
      cwd: '/w/cdqas',
      assertions: [assertion({ id: 'configured' }), assertion({ id: 'missing', target: 'db-x' })],
      targets: [REDIS],
      runner,
    })

    expect(calls).toEqual(['configured'])
    expect(run.results[1]?.status).toBe('unknown')
    expect(run.results[1]?.message).toContain('目标 db-x 没有配置')
    expect(run.ran).toBe(1)
    expect(run.problems.join('\n')).toContain('db-x')

    /*
     * 反例：坏实现（把没配的目标也发下去）会拿到通道那条 `ok:true`，于是这条断言的判定变成
     * `pass`——**用没验过冒充验过**。所以上面那条 `calls === ['configured']` 不是恒绿的。
     */
    const naive = await runner({ assertion: assertion({ id: 'missing', target: 'db-x' }), target: { id: 'db-x', engine: 'redis' }, cwd: '/w/cdqas' })
    expect(naive.ok).toBe(true)
  })

  it('② 引擎没接通（通道短路）→ `unknown`，原因原样带出；**不是** fail', async () => {
    const reason = '这个引擎的执行通路还没接通（sqlserver）：本宿主今天只接了 redis'
    const { runner } = recorder(() => ({ ok: false, reason, latencyMs: 0 }))
    const run = await runManifestVerify({
      project: 'cdqas',
      cwd: '/w/cdqas',
      assertions: [assertion({ id: 'sql-orders', target: 'sql-1' })],
      targets: [{ id: 'sql-1', engine: 'sqlserver' }],
      runner,
    })

    expect(run.results[0]?.status).toBe('unknown')
    expect(run.results[0]?.message).toBe(`没验成：${reason}`)
    expect(run.summary.overall).toBe('unknown')
    expect(run.problems).toEqual([`目标 sql-1（sqlserver）：${reason}`])

    /*
     * 反例：坏实现（把「引擎没接通」写回 `fail`）会让整批变成 `fail`——**假警报**。
     * 两种答案不同，说明上面那条 `overall === 'unknown'` 有牙齿。
     */
    const forged = run.results.map((result) => ({ ...result, status: 'fail' as const }))
    expect(summarizeResults(forged).overall).toBe('fail')
    expect(summarizeResults(run.results).overall).toBe('unknown')
  })

  it('③ 被作用域 / 闸门拒 → `unknown`，**码与正文一字不改**，且同因只记一次', async () => {
    const reason = 'OUT_OF_SCOPE：当前工作目录不在该目标允许的作用域内；恢复路径：/tmp/x 不在它的允许目录内'
    const { runner } = recorder(() => ({ ok: false, reason, latencyMs: 2 }))
    const run = await runManifestVerify({
      project: 'cdqas',
      cwd: '/w/cdqas',
      assertions: [assertion({ id: 'a' }), assertion({ id: 'b' })],
      targets: [REDIS],
      runner,
    })

    expect(run.results.map((result) => result.status)).toEqual(['unknown', 'unknown'])
    // 「原样」= 拒绝码 + 正文 + 恢复路径都还在（agent 按码决定下一步，恢复路径告诉它怎么改）
    expect(run.results[0]?.message).toBe(`没验成：${reason}`)
    expect(run.results[1]?.message).toBe(`没验成：${reason}`)
    // 两条断言同一个原因 → 跑批级只留一条（否则报告里同一句话出现 N 遍）
    expect(run.problems).toEqual([`目标 redis-248（redis）：${reason}`])
    expect(run.summary.overall).toBe('unknown')
  })
})
