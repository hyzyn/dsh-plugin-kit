/**
 * 验活断言的**求值与结构化差异**（`docs/devdata-plan.md` §3.9 约束 1、3）。
 *
 * ## 三种状态，不是两种
 *
 * | 状态 | 含义 | 谁的问题 |
 * |---|---|---|
 * | `pass` | 数据满足全部判据 | — |
 * | `fail` | 数据**明确**不满足 | 业务 / 数据 |
 * | `unknown` | **验不了**：结果被截断、列不存在、值不可比较 | 断言或环境配置 |
 *
 * `unknown` 不是「fail 轻一点」，也不是「pass 的委婉说法」：
 * 把验不了的当 fail 会让核对充满假警报（下次就没人看了），当 pass 就是**用没验过冒充验过**。
 * 它必须自成一档，并带上「为什么验不了」。
 *
 * ## 截断的语义（这里最容易错）
 *
 * 一条判据要么**在截断下仍可判**，要么必须退成 `unknown`。判据是**方向**：
 * 截断只会让实际行数 / 值**更大**，所以
 *
 * - **已经越界**的判据**仍可判 `fail`**——更大的值不会让它回到界内（截断不能用来「否证否证」）；
 * - **判定通过**的判据是在「可能更大的真值」上得出的，所以**必须退成 `unknown`**。
 *
 * | 断言 | 截断且与真值方向相反（已越界） | 截断且方向相同（看起来通过） |
 * |---|---|---|
 * | `rowCount: N` | `fail`（已返回 > N ⇒ 真值更 > N） | `unknown`（真值可能等于也可能大于 N） |
 * | `gte: N` | `fail`（最小值都不够） | **`pass`**（真值只会更大，更大只会更满足下界） |
 * | `lte: N` | `fail`（已有值已超界） | `unknown`（真值可能超过上限） |
 * | `eq: V` | `fail`（已取得的行不相等） | `unknown`（可能还有一行恰好相等） |
 *
 * 注意 `gte` 与 `lte` 在这一列上**相反**——截断让真值变大的方向，对下界是帮忙、对上界是拆台。
 * 统一处理会错一边：都报 `pass` 会夸大 `lte` 的证据，都报 `unknown` 会浪费 `gte` 上确凿的结论。
 *
 * 实现上「先判 fail、再判截断、最后 pass」——顺序反了会让明确的否证被降级成 `unknown`，
 * 等于用「不确定」盖住「已否证」。
 *
 * ## 结构化差异（约束 3）
 *
 * `diff` 里 got / expected 并排，**每个算子一行**。理由是 agent 的失败模式是**循环重试**：
 * 一句「断言失败」不产生新信息，它只能原样再试；并排的 got/expected 才让它一轮定位。
 *
 * 依据：`docs/devdata-plan.md` §3.9、§3.6.1 实现要求 2（被拒的错误必须带恢复提示）。
 */

import type { ShapedResult } from './sql.js'
import type { Severity, VerifyAssertion, VerifyExpect } from './verify.js'

/** 一次断言求值的状态。 */
export type VerifyStatus = 'pass' | 'fail' | 'unknown'

/** 一个算子的判定结果。 */
export type OperatorVerdict = 'pass' | 'fail' | 'unknown'

/** got / expected 并排的一行。 */
export interface DiffLine {
  /** 算子名（`eq` / `regex` / `gte` / `lte` / `rowCount`）。 */
  op: string
  expected: unknown
  got: unknown
  verdict: OperatorVerdict
  /** 为什么是这个判定（尤其 `unknown` 必须说清）。 */
  note?: string
}

/** 一条断言的求值结果。 */
export interface VerifyResult {
  id: string
  /** 数据层面的判定。`severity` 决定 `fail` 要不要让整批失败，与这里无关。 */
  status: VerifyStatus
  severity: Severity
  /** 一句话结论（给人看）。 */
  message: string
  /** 逐算子的 got / expected。**空了才需要担心**——有 `expect` 就一定有 diff。 */
  diff: DiffLine[]
  latencyMs: number
}

/** 跑一批断言的汇总。 */
export interface VerifySummary {
  total: number
  passed: number
  failed: number
  warned: number
  unknown: number
  /** 整批的判定：`fail` > `warn` > `unknown` > `pass`。 */
  overall: 'pass' | 'fail' | 'warn' | 'unknown'
}

/** 取一个算子的期望值（按算子名从 `expect` 里取，缺省即「这个算子没给」）。 */
function expectedOf(expect: VerifyExpect, op: string): unknown {
  return (expect as unknown as Record<string, unknown>)[op]
}

/** 全部给出的算子，按固定顺序（报告顺序稳定，便于 diff）。 */
function operatorsOf(expect: VerifyExpect): string[] {
  return ['eq', 'regex', 'gte', 'lte', 'rowCount'].filter((op) => expectedOf(expect, op) !== undefined)
}

/**
 * 取要比的那个值。
 *
 * 返回 `{ known: false }` 表示取不到（没有行 / 列不存在），由调用方转成 `unknown`。
 */
function extractValue(result: ShapedResult, expect: VerifyExpect): { known: boolean; value?: unknown; reason?: string } {
  if (result.rows.length === 0) {
    return { known: false, reason: '结果集是空的，没有可比的值（空结果要判行数请用 rowCount）' }
  }
  const first = result.rows[0] as Record<string, unknown>

  if (expect.column !== undefined) {
    if (!Object.prototype.hasOwnProperty.call(first, expect.column)) {
      return {
        known: false,
        reason: `结果里没有列 ${JSON.stringify(expect.column)}（实际列：${result.columns.join(' / ') || '（无）'}）——清单与语句不匹配`,
      }
    }
    return { known: true, value: first[expect.column] }
  }

  const columns = result.columns.length > 0 ? result.columns : Object.keys(first)
  const column = columns[0]
  if (column === undefined) {
    return { known: false, reason: '结果没有列信息，取不到第 1 列的值' }
  }
  return { known: true, value: first[column] }
}

/** 值是不是可参与比较的标量（数字 / 字符串 / 布尔）。 */
function isScalar(value: unknown): value is number | string | boolean {
  return typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean'
}

/** 结构化地描述一个值（用于 note 里说清「拿到的到底是什么」）。 */
function describe(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return `数组（${String(value.length)} 项）`
  if (typeof value === 'object') return '映射'
  return JSON.stringify(value)
}

/**
 * 求一条断言。
 *
 * 顺序是刻意的：**先判 `zeroDanger`**，让「上限太宽」这件事在其它判据之前就说清楚——
 * 一条返回海量行的断言即使碰巧通过，它也不是一条能长期留在清单里的断言。
 */
export function evaluateAssertion(input: {
  assertion: VerifyAssertion
  result: ShapedResult
  latencyMs: number
  /** 结果行数超过它就报 `unknown`（提示断言太宽）。缺省不限。 */
  ceiling?: number
}): VerifyResult {
  const { assertion, result, latencyMs, ceiling } = input
  const { expect } = assertion
  const diff: DiffLine[] = []
  const unknowns: string[] = []

  const base = (status: VerifyStatus, message: string): VerifyResult => ({
    id: assertion.id,
    status,
    severity: assertion.severity,
    message,
    diff,
    latencyMs,
  })

  // ① 「上限太宽」不是数据问题，是**断言本身**的问题。
  if (ceiling !== undefined && result.rowCount > ceiling) {
    return base(
      'unknown',
      `返回 ${String(result.rowCount)} 行，超过本批上限 ${String(ceiling)}：这条断言太宽，请收窄语句（它即使碰巧通过也不该留在清单里）`,
    )
  }

  const ops = operatorsOf(expect)
  const needsValue = ops.some((op) => op !== 'rowCount')
  const extracted = needsValue ? extractValue(result, expect) : { known: true as const }

  // ② 值取不到时，凡是要值的算子都记 unknown（不是 fail：这是「验不了」）。
  if (needsValue && !extracted.known) {
    for (const op of ops) {
      if (op === 'rowCount') continue
      diff.push({ op, expected: expectedOf(expect, op), got: undefined, verdict: 'unknown', note: extracted.reason })
    }
    if (extracted.reason !== undefined) unknowns.push(extracted.reason)
  }

  for (const op of ops) {
    if (diff.some((line) => line.op === op)) continue
    const expected = expectedOf(expect, op)

    if (op === 'rowCount') {
      diff.push(rowCountLine(result, expected as number))
      const line = diff[diff.length - 1] as DiffLine
      if (line.verdict === 'unknown' && line.note !== undefined) unknowns.push(line.note)
      continue
    }

    const got = extracted.known ? extracted.value : undefined
    diff.push(valueLine(op, expected, got, result.truncated))
    const line = diff[diff.length - 1] as DiffLine
    if (line.verdict === 'unknown' && line.note !== undefined) unknowns.push(line.note)
  }

  const failed = diff.filter((line) => line.verdict === 'fail')
  if (failed.length > 0) {
    return base('fail', failed.map((line) => `${line.op}: ${renderLine(line)}`).join('；'))
  }

  if (diff.some((line) => line.verdict === 'unknown')) {
    return base('unknown', `验不了：${unknowns.join('；')}`)
  }

  return base('pass', `全部判据通过（${String(diff.length)} 项）`)
}

/** 把一行差异渲染成一句话（got / expected 并排）。 */
function renderLine(line: DiffLine): string {
  return `期望 ${describe(line.expected)}，实际 ${describe(line.got)}`
}

/**
 * `rowCount` 的判定。
 *
 * 与取值算子同一条顺序：**先判 fail，再判截断**。
 * 截断时「已返回 > N」是**明确否证**（真值只会更大），不能被降级成 `unknown`；
 * 其余情况真值不可知，退 `unknown`。
 */
function rowCountLine(result: ShapedResult, expected: number): DiffLine {
  const got = result.rowCount
  if (!result.truncated) {
    return got === expected
      ? { op: 'rowCount', expected, got, verdict: 'pass' }
      : { op: 'rowCount', expected, got, verdict: 'fail' }
  }
  if (got > expected) {
    return { op: 'rowCount', expected, got, verdict: 'fail' }
  }
  return {
    op: 'rowCount',
    expected,
    got,
    verdict: 'unknown',
    note: `结果被上限 ${String(result.limit)} 截断，精确行数不可知（已返回 ${String(got)} 行）`,
  }
}

/**
 * 一个取值算子的判定。
 *
 * `lte` / `eq` 在**截断**时也退化为 `unknown`：截断意味着「还有更多行」，
 * 而下限本身可能违反上限。但 `gte` 仍可判——截断只会让实际值**更大**。
 */
function valueLine(op: string, expected: unknown, got: unknown, truncated: boolean): DiffLine {
  if (op === 'eq') {
    if (truncated) {
      return { op, expected, got, verdict: 'unknown', note: `结果被截断，不能据此判等式（实际可能还有更多行）` }
    }
    return Object.is(got, expected)
      ? { op, expected, got, verdict: 'pass' }
      : { op, expected, got, verdict: 'fail' }
  }

  if (op === 'regex') {
    if (typeof got !== 'string' && typeof got !== 'number' && typeof got !== 'boolean') {
      return { op, expected, got, verdict: 'unknown', note: `拿到的值不是标量（${describe(got)}），无法做正则匹配` }
    }
    const pattern = new RegExp(String(expected))
    return pattern.test(String(got)) ? { op, expected, got, verdict: 'pass' } : { op, expected, got, verdict: 'fail' }
  }

  if (op === 'gte' || op === 'lte') {
    if (typeof got !== 'number' || typeof expected !== 'number') {
      return {
        op,
        expected,
        got,
        verdict: 'unknown',
        note: `拿到的值与期望值必须都是数字才能比较大小（实际 ${describe(got)}）`,
      }
    }
    const ok = op === 'gte' ? got >= expected : got <= expected
    // **先判 fail**：截断只会让实际值更大，不会让一个已经越界的值回到界内。
    // 若先判截断，这条明确的否证会被降级成 unknown——那等于用「不确定」盖住「已否证」。
    if (!ok) return { op, expected, got, verdict: 'fail' }
    // 已通过 + 结果被截断：真值**可能更大**。这个方向对两个算子的意义相反：
    //   - `gte`（下界）：真值更大只会更满足 → **仍可判 pass**；
    //   - `lte`（上界）：真值更大可能就越界了 → **只能 unknown**。
    if (truncated && op === 'lte') {
      return { op, expected, got, verdict: 'unknown', note: '结果被截断，实际值可能更大，不能据此判上限' }
    }
    return { op, expected, got, verdict: 'pass' }
  }

  // 走到这里说明清单里出现了未登记的算子——`validateManifest` 本该在加载时拦下。
  return { op, expected, got, verdict: 'unknown', note: `未登记的期望算子 ${JSON.stringify(op)}（清单校验本该拦下）` }
}

/**
 * 汇总一批断言。
 *
 * `overall` 的口径：**任一 `fail` 档断言实际失败 ⇒ `fail`**；否则任一 `warn` 档失败 ⇒ `warn`；
 * 否则任一 `unknown` ⇒ `unknown`；否则 `pass`。
 *
 * 为什么 `unknown` 排在 `pass` 之前：一批里有一条验不了，整批就不能报「核对通过」——
 * 那是用没验过冒充验过。
 */
export function summarizeResults(results: readonly VerifyResult[]): VerifySummary {
  const severityOf = (result: VerifyResult): 'pass' | 'fail' | 'warn' | 'unknown' => {
    if (result.status === 'unknown') return 'unknown'
    if (result.status === 'pass') return 'pass'
    return result.severity === 'warn' ? 'warn' : 'fail'
  }

  const buckets = results.map(severityOf)
  const overall: VerifySummary['overall'] = buckets.includes('fail')
    ? 'fail'
    : buckets.includes('warn')
      ? 'warn'
      : buckets.includes('unknown')
        ? 'unknown'
        : 'pass'

  return {
    total: results.length,
    passed: buckets.filter((bucket) => bucket === 'pass').length,
    failed: buckets.filter((bucket) => bucket === 'fail').length,
    warned: buckets.filter((bucket) => bucket === 'warn').length,
    unknown: buckets.filter((bucket) => bucket === 'unknown').length,
    overall,
  }
}
