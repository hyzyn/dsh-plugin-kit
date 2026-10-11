/**
 * @hyzyn/dsh-loglens — 归一化与夹取的用例（P1）。
 *
 * 每条规则都配一条反例：能夹的夹（limit）、会改变语义的**报错**（时间窗超上限、时间戳
 * 写成秒）；计数不许把「不知道」写成「知道」；截断理由的集合与顺序是确定的。
 */
import { describe, expect, it } from 'vitest'
import type { BackendCaps } from '../src/backends/types.js'
import {
  DEFAULT_LIMIT,
  TRUNCATION_ORDER,
  countsOf,
  normalizeQuery,
  truncationOf,
} from '../src/query.js'

/** 固定「当前时刻」：默认时间窗的断言才不依赖跑用例的那一天。 */
const NOW = 1_760_000_000_000
const SIX_HOURS = 6 * 60 * 60 * 1000

function caps(patch: Partial<BackendCaps> = {}): BackendCaps {
  return {
    queryLanguage: 'logql',
    follow: true,
    aggregations: true,
    requiresTimeRange: false,
    fields: 'discovered',
    pagination: 'cursor',
    maxPageSize: 500,
    maxWindowMs: SIX_HOURS,
    ...patch,
  }
}

function expectOk(result: ReturnType<typeof normalizeQuery>) {
  if (!result.ok) throw new Error('期望通过，实际报错：' + result.error)
  return result
}

function expectError(result: ReturnType<typeof normalizeQuery>): string {
  if (result.ok) throw new Error('期望报错，实际通过了')
  return result.error
}

describe('normalizeQuery：时间窗', () => {
  it('targetId 必填（v1 一次只查一个来源）', () => {
    expect(expectError(normalizeQuery({ from: NOW - 1000, to: NOW }, caps()))).toContain('targetId 必填')
    expect(expectError(normalizeQuery({ targetId: '  ' }, caps()))).toContain('targetId 必填')
  })

  it('不给时间窗时取「最近 min(24h, maxWindowMs)」，并明说兜底了', () => {
    const result = expectOk(normalizeQuery({ targetId: 'loki' }, caps(), { now: NOW }))
    expect(result.query.to).toBe(NOW)
    expect(result.query.from).toBe(NOW - SIX_HOURS)
    expect(result.warnings.join()).toContain('360 分钟')
  })

  it('maxWindowMs 比 24h 大时兜底仍取 24h', () => {
    const result = expectOk(normalizeQuery({ targetId: 'loki' }, caps({ maxWindowMs: 7 * 24 * 60 * 60 * 1000 }), { now: NOW }))
    expect(result.query.to - result.query.from).toBe(24 * 60 * 60 * 1000)
  })

  it('requiresTimeRange 的来源缺窗口是错误，不是兜底', () => {
    const message = expectError(normalizeQuery({ targetId: 'es' }, caps({ requiresTimeRange: true }), { now: NOW }))
    expect(message).toContain('from / to 缺一不可')
    expect(expectError(normalizeQuery({ targetId: 'es', to: NOW }, caps({ requiresTimeRange: true })))).toContain('缺 from')
  })

  it('只给一侧时另一侧兜底（并带警告）', () => {
    const onlyTo = expectOk(normalizeQuery({ targetId: 'loki', to: NOW }, caps(), { now: NOW }))
    expect(onlyTo.query.from).toBe(NOW - SIX_HOURS)
    const onlyFrom = expectOk(normalizeQuery({ targetId: 'loki', from: NOW - 1000 }, caps(), { now: NOW }))
    expect(onlyFrom.query.to).toBe(NOW)
    expect(onlyFrom.warnings.join()).toContain('未给 to')
  })

  it('时间戳写成秒会被拦下（否则查的是 1970 年）', () => {
    const message = expectError(normalizeQuery({ targetId: 'loki', from: 1_700_000_000, to: NOW }, caps()))
    expect(message).toContain('看起来是**秒**')
  })

  it('非整数 / NaN 都不是时间戳', () => {
    expect(expectError(normalizeQuery({ targetId: 'loki', from: 1.5, to: NOW }, caps()))).toContain('必须是整数')
    expect(expectError(normalizeQuery({ targetId: 'loki', from: Number.NaN, to: NOW }, caps()))).toContain('必须是整数')
    expect(expectError(normalizeQuery({ targetId: 'loki', from: '1700000000000', to: NOW }, caps()))).toContain('必须是整数')
  })

  it('空窗口 / 倒过来的窗口都拒', () => {
    expect(expectError(normalizeQuery({ targetId: 'loki', from: NOW, to: NOW }, caps()))).toContain('to 必须晚于 from')
    expect(expectError(normalizeQuery({ targetId: 'loki', from: NOW, to: NOW - 1 }, caps()))).toContain('to 必须晚于 from')
  })

  it('超过来源的时间窗上限是错误（静默截短会把「这就是全部」变成谎话）', () => {
    const message = expectError(normalizeQuery({ targetId: 'loki', from: NOW - 14 * 60 * 60 * 1000, to: NOW }, caps()))
    expect(message).toContain('360 分钟')
    expect(message).toContain('缩小时间窗')
  })
})

describe('normalizeQuery：limit / 方向 / 游标 / 过滤', () => {
  it('limit 默认 DEFAULT_LIMIT', () => {
    expect(expectOk(normalizeQuery({ targetId: 'loki' }, caps(), { now: NOW })).query.limit).toBe(DEFAULT_LIMIT)
  })

  it('limit 超上限是夹取 + 警告，不是错误', () => {
    const result = expectOk(normalizeQuery({ targetId: 'loki', limit: 900 }, caps({ maxPageSize: 500 }), { now: NOW }))
    expect(result.query.limit).toBe(500)
    expect(result.warnings.join()).toContain('夹到 500')
  })

  it('limit 不是正整数就报错', () => {
    for (const limit of [0, -1, 1.5, '10']) {
      expect(expectError(normalizeQuery({ targetId: 'loki', limit }, caps()))).toContain('limit 必须是正整数')
    }
  })

  it('方向默认 backward，只认两个取值', () => {
    expect(expectOk(normalizeQuery({ targetId: 'loki' }, caps(), { now: NOW })).query.direction).toBe('backward')
    expect(expectOk(normalizeQuery({ targetId: 'loki', direction: 'forward' }, caps())).query.direction).toBe('forward')
    expect(expectError(normalizeQuery({ targetId: 'loki', direction: 'sideways' }, caps()))).toContain('direction')
  })

  it('游标只透传：本层不解析后端的私有编码', () => {
    const result = expectOk(normalizeQuery({ targetId: 'loki', cursor: '  abc  ' }, caps()))
    expect(result.query.cursor).toBe('abc')
    expect(expectOk(normalizeQuery({ targetId: 'loki', cursor: '' }, caps())).query.cursor).toBeUndefined()
  })

  it('filters 是「字段名 → 字符串」，非字符串值拒', () => {
    const result = expectOk(normalizeQuery({ targetId: 'loki', filters: { level: 'error' } }, caps()))
    expect(result.query.filters).toEqual({ level: 'error' })
    expect(expectOk(normalizeQuery({ targetId: 'loki', filters: {} }, caps())).query.filters).toBeUndefined()
    expect(expectError(normalizeQuery({ targetId: 'loki', filters: { level: 1 } }, caps()))).toContain('必须是字符串')
    expect(expectError(normalizeQuery({ targetId: 'loki', filters: ['level'] }, caps()))).toContain('字段名 → 值')
  })

  it('查询串留空是按来源全量查（不报错）', () => {
    expect(expectOk(normalizeQuery({ targetId: 'loki' }, caps())).query.q).toBe('')
    expect(expectOk(normalizeQuery({ targetId: 'loki', q: '  {app="x"}  ' }, caps())).query.q).toBe('{app="x"}')
  })
})

describe('countsOf：不知道就别写成知道', () => {
  it('没有 matched 时 totalKnown 为假', () => {
    expect(countsOf({ returned: 3 })).toEqual({ returned: 3, totalKnown: false })
  })

  it("ES 的 relation 'gte' 是下界（没开 track_total_hits 的常态）", () => {
    expect(countsOf({ returned: 10, matched: 10000, totalRelation: 'gte' }).totalKnown).toBe(false)
    expect(countsOf({ returned: 10, matched: 42, totalRelation: 'eq' }).totalKnown).toBe(true)
  })

  it('扫描量与命中量各占一格，不挤进同一个数', () => {
    const counts = countsOf({ returned: 5, matched: 5, totalRelation: 'eq', scannedRows: 900, scannedBytes: 4096 })
    expect(counts).toEqual({ returned: 5, matched: 5, scannedRows: 900, scannedBytes: 4096, totalKnown: true })
  })
})

describe('truncationOf：理由集合与顺序', () => {
  it('没有理由就不算截断（不存在「有理由但 truncated=false」的态）', () => {
    expect(truncationOf({})).toEqual({ truncated: false, reasons: [] })
    expect(truncationOf({ limited: false, cursorExpired: false })).toEqual({ truncated: false, reasons: [] })
  })

  it('limited 映射成 hit_limit（照 docker 的 limited = 可能还有）', () => {
    expect(truncationOf({ limited: true })).toEqual({ truncated: true, reasons: ['hit_limit'] })
  })

  it('cursor_expired 与 hit_limit 是两个理由：过期不等于还有更多', () => {
    expect(truncationOf({ cursorExpired: true })).toEqual({ truncated: true, reasons: ['cursor_expired'] })
    expect(truncationOf({ limited: true, cursorExpired: true }).reasons).toEqual(['hit_limit', 'cursor_expired'])
  })

  it('理由按固定顺序排列（同一个输入永远同一个数组）', () => {
    const result = truncationOf({ byteCap: true, timedOut: true, partialShards: true, limited: true })
    expect(result.reasons).toEqual(['hit_limit', 'partial_shards', 'timed_out', 'byte_cap'])
    expect(TRUNCATION_ORDER).toEqual([
      'hit_limit',
      'max_result_window',
      'partial_shards',
      'timed_out',
      'scan_cap',
      'byte_cap',
      'cursor_expired',
    ])
  })
})
