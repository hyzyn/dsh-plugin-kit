/**
 * 验活断言**求值与差异**测试（`docs/devdata-plan.md` §3.9 约束 3）。
 *
 * 这一层的失败方式最隐蔽：把「验不了」写成 `pass` 就是**用没验过冒充验过**，
 * 把「验不了」写成 `fail` 则会让核对充满假警报（下次就没人看了）。
 * 所以用例的重点是 `unknown` 这一档的边界，尤其是**截断**下的 `rowCount` 语义。
 */

import { describe, expect, it } from 'vitest'

import {
  evaluateAssertion,
  summarizeResults,
  type Severity,
  type ShapedResult,
  type VerifyAssertion,
  type VerifyResult,
} from '../src/index.js'

/** 造一个整形后的结果集。 */
function shaped(
  rows: Array<Record<string, unknown>>,
  options: { columns?: string[]; truncated?: boolean; limit?: number } = {},
): ShapedResult {
  const columns = options.columns ?? Object.keys(rows[0] ?? {})
  return {
    columns,
    rows,
    rowCount: rows.length,
    truncated: options.truncated ?? false,
    limit: options.limit ?? 100,
  }
}

/** 造一条断言。 */
function assertion(overrides: Partial<VerifyAssertion> = {}): VerifyAssertion {
  return {
    id: 'a1',
    project: 'cdqas',
    appliesTo: 'backend',
    target: 't-mysql',
    statement: 'SELECT COUNT(*) FROM orders',
    expect: { gte: 1 },
    severity: 'fail',
    ...overrides,
  }
}

/** 跑一条断言。 */
function run(result: ShapedResult, overrides: Partial<VerifyAssertion> = {}, ceiling?: number): VerifyResult {
  return evaluateAssertion({
    assertion: assertion(overrides),
    result,
    latencyMs: 3,
    ...(ceiling === undefined ? {} : { ceiling }),
  })
}

describe('取值：选哪个列', () => {
  it('缺省取第 1 列', () => {
    const result = run(shaped([{ total: 7, other: 99 }]), { expect: { eq: 7 } })
    expect(result.status).toBe('pass')
  })

  it('给了 column 就取它', () => {
    const result = run(shaped([{ total: 7, other: 99 }]), { expect: { eq: 99, column: 'other' } })
    expect(result.status).toBe('pass')
  })

  it('**列不存在 → unknown**，不是 fail（清单与语句不匹配，不是数据不对）', () => {
    // 失败意味着：把「列名写错」报成「数据不对」，agent 会去查库。
    const result = run(shaped([{ total: 7 }]), { expect: { eq: 7, column: 'nope' } })
    expect(result.status).toBe('unknown')
    expect(result.message).toContain('nope')
    expect(result.message).toContain('total')
  })

  it('空结果集 + 取值算子 → unknown，且提示改用 rowCount', () => {
    const result = run(shaped([], { columns: ['total'] }), { expect: { eq: 0 } })
    expect(result.status).toBe('unknown')
    expect(result.message).toContain('rowCount')
  })
})

describe('算子：eq', () => {
  it('相等通过、不等失败，且差异并排', () => {
    expect(run(shaped([{ v: 1 }]), { expect: { eq: 1 } }).status).toBe('pass')
    const failed = run(shaped([{ v: 2 }]), { expect: { eq: 1 } })
    expect(failed.status).toBe('fail')
    expect(failed.diff[0]).toMatchObject({ op: 'eq', expected: 1, got: 2, verdict: 'fail' })
  })

  it('用严格相等：`1` 与 `"1"` 不相等（不做隐式转换）', () => {
    expect(run(shaped([{ v: '1' }]), { expect: { eq: 1 } }).status).toBe('fail')
    expect(run(shaped([{ v: '1' }]), { expect: { eq: '1' } }).status).toBe('pass')
  })

  it('截断时不能判等式 → unknown（实际可能还有更多行）', () => {
    const result = run(shaped([{ v: 1 }], { truncated: true, limit: 10 }), { expect: { eq: 1 } })
    expect(result.status).toBe('unknown')
  })
})

describe('算子：regex', () => {
  it('匹配 / 不匹配', () => {
    expect(run(shaped([{ v: 'ORD-2026-001' }]), { expect: { regex: '^ORD-\\d{4}-' } }).status).toBe('pass')
    expect(run(shaped([{ v: 'X' }]), { expect: { regex: '^ORD-' } }).status).toBe('fail')
  })

  it('数字也按字符串匹配（日志里数字与文本常混在一起）', () => {
    expect(run(shaped([{ v: 12345 }]), { expect: { regex: '^123' } }).status).toBe('pass')
  })

  it('**拿到非标量 → unknown**（不是 fail）', () => {
    const result = run(shaped([{ v: { nested: 1 } }]), { expect: { regex: 'a' } })
    expect(result.status).toBe('unknown')
    expect(result.message).toContain('不是标量')
  })
})

describe('算子：gte / lte', () => {
  it('界内通过、界外失败', () => {
    expect(run(shaped([{ v: 10 }]), { expect: { gte: 10 } }).status).toBe('pass')
    expect(run(shaped([{ v: 9 }]), { expect: { gte: 10 } }).status).toBe('fail')
    expect(run(shaped([{ v: 10 }]), { expect: { lte: 10 } }).status).toBe('pass')
    expect(run(shaped([{ v: 11 }]), { expect: { lte: 10 } }).status).toBe('fail')
  })

  it('**非数字 → unknown**（字符串比大小是另一回事，不做隐式转换）', () => {
    expect(run(shaped([{ v: '10' }]), { expect: { gte: 10 } }).status).toBe('unknown')
  })

  it('截断时 `gte` 仍可判（已返回 N 行 ⇒ 不少于 N 行）', () => {
    const result = run(shaped([{ v: 10 }], { truncated: true, limit: 10 }), { expect: { gte: 5 } })
    expect(result.status).toBe('pass')
  })

  it('截断时 `lte` 不可判 → unknown（可能还有更大的值）', () => {
    const result = run(shaped([{ v: 5 }], { truncated: true, limit: 10 }), { expect: { lte: 10 } })
    expect(result.status).toBe('unknown')
    expect(result.message).toContain('截断')
  })

  it('截断时 `lte` **已经违反** → 仍判 fail（现有证据已经足够否证）', () => {
    // 关键：截断只会让值**更大**，不会让一个已经超界的值回到界内。
    // 所以「已违反」这一步必须先判——若先判截断，这条明确的否证会被降级成 unknown。
    const result = run(shaped([{ v: 99 }], { truncated: true, limit: 10 }), { expect: { lte: 10 } })
    expect(result.status).toBe('fail')
    expect(result.diff[0]).toMatchObject({ op: 'lte', expected: 10, got: 99, verdict: 'fail' })
  })
})

describe('算子：rowCount 与截断语义（最容易错的一处）', () => {
  it('未截断时精确比较', () => {
    expect(run(shaped([{ v: 1 }, { v: 2 }]), { expect: { rowCount: 2 } }).status).toBe('pass')
    expect(run(shaped([{ v: 1 }]), { expect: { rowCount: 2 } }).status).toBe('fail')
  })

  it('**截断时等式不可判** → unknown', () => {
    // 失败意味着：真值可能是 10 行中的任意一个，却按「等于 10」报通过。
    const result = run(shaped([{ v: 1 }], { truncated: true, limit: 1 }), { expect: { rowCount: 10 } })
    expect(result.status).toBe('unknown')
    expect(result.message).toContain('截断')
  })

  it('截断时 `rowCount` 的 got 仍是「已返回的行数」（并排在报告里可见）', () => {
    const result = run(shaped([{ v: 1 }], { truncated: true, limit: 1 }), { expect: { rowCount: 10 } })
    expect(result.diff[0]).toMatchObject({ op: 'rowCount', expected: 10, got: 1, verdict: 'unknown' })
  })

  it('rowCount 与取值算子可以同时用（前者看行数，后者看值）', () => {
    const result = run(shaped([{ v: 5 }]), { expect: { rowCount: 1, gte: 5 } })
    expect(result.status).toBe('pass')
    expect(result.diff.map((line) => line.op)).toEqual(['gte', 'rowCount'])
  })
})

describe('多算子：合取而不是取第一命中', () => {
  it('一个 fail 就整条 fail（不因另一个通过而被掩盖）', () => {
    const result = run(shaped([{ v: 5 }]), { expect: { gte: 1, lte: 3 } })
    expect(result.status).toBe('fail')
    expect(result.diff.find((line) => line.op === 'lte')?.verdict).toBe('fail')
    expect(result.diff.find((line) => line.op === 'gte')?.verdict).toBe('pass')
  })

  it('一个 unknown 而没有 fail → 整条 unknown（不是 pass）', () => {
    const result = run(shaped([{ v: 'x' }]), { expect: { gte: 1, regex: 'x' } })
    expect(result.status).toBe('unknown')
  })

  it('fail 优先于 unknown（有明确否证就不含糊）', () => {
    const result = run(shaped([{ v: 'x' }]), { expect: { gte: 1, eq: 'y' } })
    expect(result.status).toBe('fail')
  })
})

describe('上限：太宽的断言不是数据问题', () => {
  it('返回行数超过本批上限 → unknown，并点名「太宽」', () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ v: i }))
    const result = run(shaped(rows), { expect: { rowCount: 5 } }, 3)
    expect(result.status).toBe('unknown')
    expect(result.message).toContain('太宽')
  })

  it('不设上限时不判（缺省即无）', () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ v: i }))
    expect(run(shaped(rows), { expect: { rowCount: 5 } }).status).toBe('pass')
  })

  it('上限检查排在其它判据之前（否则一条碰巧通过的宽断言会留在清单里）', () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ v: i }))
    // 这条断言其实**通不过**（gte 100 是假的），但报的应该是「太宽」而不是 fail——
    // 因为「这条断言本身不该存在」是更强的事实。
    const result = run(shaped(rows), { expect: { gte: 100 } }, 3)
    expect(result.status).toBe('unknown')
    expect(result.message).toContain('太宽')
  })
})

describe('severity 与汇总', () => {
  it('severity 原样带在结果里（它决定 fail 要不要让整批失败，与 status 无关）', () => {
    expect(run(shaped([{ v: 1 }]), { expect: { eq: 2 } }).severity).toBe('fail')
    expect(run(shaped([{ v: 1 }]), { expect: { eq: 2 }, severity: 'warn' }).severity).toBe('warn')
  })

  it('汇总分桶：fail / warn / unknown 各自计数', () => {
    const summary = summarizeResults([
      { id: '1', status: 'pass', severity: 'fail', message: '', diff: [], latencyMs: 1 },
      { id: '2', status: 'fail', severity: 'fail', message: '', diff: [], latencyMs: 1 },
      { id: '3', status: 'fail', severity: 'warn', message: '', diff: [], latencyMs: 1 },
      { id: '4', status: 'unknown', severity: 'fail', message: '', diff: [], latencyMs: 1 },
    ])
    expect(summary).toMatchObject({ total: 4, passed: 1, failed: 1, warned: 1, unknown: 1, overall: 'fail' })
  })

  it('warn 档失败不让整批 fail', () => {
    const summary = summarizeResults([
      { id: '1', status: 'pass', severity: 'fail', message: '', diff: [], latencyMs: 1 },
      { id: '2', status: 'fail', severity: 'warn' as Severity, message: '', diff: [], latencyMs: 1 },
    ])
    expect(summary.overall).toBe('warn')
  })

  it('**有 unknown 就不报 pass**（用没验过冒充验过）', () => {
    const summary = summarizeResults([{ id: '1', status: 'unknown', severity: 'fail', message: '', diff: [], latencyMs: 1 }])
    expect(summary.overall).toBe('unknown')
  })

  it('全通过才 pass；空批次也算 pass（没有断言谈不上失败）', () => {
    expect(summarizeResults([{ id: '1', status: 'pass', severity: 'fail', message: '', diff: [], latencyMs: 1 }]).overall).toBe('pass')
    expect(summarizeResults([]).overall).toBe('pass')
  })
})
