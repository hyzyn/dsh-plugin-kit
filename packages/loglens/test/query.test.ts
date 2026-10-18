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
  FALLBACK_WINDOW_MS,
  TRUNCATION_ORDER,
  countsOf,
  normalizeQuery,
  pageLimitFlags,
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

  it('两端都不给：非强制来源取最近 15 分钟兜底，并明说兜底了', () => {
    const result = expectOk(normalizeQuery({ targetId: 'loki' }, caps(), { now: NOW }))
    expect(result.query.to).toBe(NOW)
    expect(result.query.from).toBe(NOW - FALLBACK_WINDOW_MS)
    expect(result.warnings.join()).toContain('15 分钟')
  })

  it('兜底窗口恒为 15 分钟，不随 maxWindowMs 放大（宽窗留给调用方说明）', () => {
    const result = expectOk(normalizeQuery({ targetId: 'loki' }, caps({ maxWindowMs: 7 * 24 * 60 * 60 * 1000 }), { now: NOW }))
    expect(result.query.to - result.query.from).toBe(FALLBACK_WINDOW_MS)
    // 来源自己的上限比 15 分钟还小时，兜底不许越过它
    const narrow = expectOk(normalizeQuery({ targetId: 'loki' }, caps({ maxWindowMs: 60_000 }), { now: NOW }))
    expect(narrow.query.to - narrow.query.from).toBe(60_000)
  })

  it('requiresTimeRange 的来源：两端都不给才报错，且文案点明「给 to 就够」', () => {
    const message = expectError(normalizeQuery({ targetId: 'es' }, caps({ requiresTimeRange: true }), { now: NOW }))
    expect(message).toContain('至少给 to')
    /*
     * 这条是 2026-10-11 真机反馈的正面判据：工具 schema 写着「to 缺省取当前时刻」，
     * 而实现曾经在只给 to 时报「缺 from」——照 schema 办事的 agent 被自己的插件打回。
     */
    const onlyTo = expectOk(normalizeQuery({ targetId: 'es', to: NOW }, caps({ requiresTimeRange: true }), { now: NOW }))
    expect(onlyTo.query.from).toBe(NOW - FALLBACK_WINDOW_MS)
    expect(onlyTo.query.to).toBe(NOW)
    expect(onlyTo.warnings.join()).toContain('未给 from')
  })

  it('只给一侧时另一侧兜底（并带警告），窗口随 window 回显', () => {
    const onlyTo = expectOk(normalizeQuery({ targetId: 'loki', to: NOW }, caps(), { now: NOW }))
    expect(onlyTo.query.from).toBe(NOW - FALLBACK_WINDOW_MS)
    const onlyFrom = expectOk(normalizeQuery({ targetId: 'loki', from: NOW - 1000 }, caps(), { now: NOW }))
    expect(onlyFrom.query.to).toBe(NOW)
    expect(onlyFrom.warnings.join()).toContain('未给 to')
  })

  it('时间戳写成秒会被拦下（否则查的是 1970 年）', () => {
    const message = expectError(normalizeQuery({ targetId: 'loki', from: 1_700_000_000, to: NOW }, caps()))
    expect(message).toContain('看起来是**秒**')
    expect(expectError(normalizeQuery({ targetId: 'loki', from: '1700000000', to: NOW }, caps()))).toContain('看起来是**秒**')
  })

  it('非法时间（小数 / NaN / 乱字符串）都拒，且文案列出可接受的三种写法', () => {
    for (const from of [1.5, Number.NaN, '昨晚', {}, true]) {
      const message = expectError(normalizeQuery({ targetId: 'loki', from, to: NOW }, caps()))
      expect(message).toContain('epoch 毫秒整数')
      expect(message).toContain('ISO 8601')
      expect(message).toContain('-30m')
    }
  })

  it('收 ISO 8601：带 Z / 带偏移的按它自己说的算', () => {
    const utc = expectOk(normalizeQuery({ targetId: 'loki', from: '2026-10-11T14:00:00Z', to: '2026-10-11T15:00:00Z' }, caps()))
    expect(utc.query.from).toBe(Date.parse('2026-10-11T14:00:00Z'))
    expect(utc.query.to).toBe(Date.parse('2026-10-11T15:00:00Z'))
    const offset = expectOk(normalizeQuery({ targetId: 'loki', from: '2026-10-11T22:00:00+08:00', to: '2026-10-11T22:30:00+08:00' }, caps()))
    expect(offset.query.from).toBe(Date.parse('2026-10-11T22:00:00+08:00'))
    const millis = expectOk(normalizeQuery({ targetId: 'loki', from: '2026-10-11T14:00:00.250Z', to: '2026-10-11T15:00:00Z' }, caps()))
    expect(millis.query.from).toBe(Date.parse('2026-10-11T14:00:00.250Z'))
  })

  it('收不带时区的写法，按**本机时区**解释（人写的就是本地那一下）', () => {
    const wide = caps({ maxWindowMs: 3 * 24 * 60 * 60 * 1000 })
    const datetime = expectOk(normalizeQuery({ targetId: 'loki', from: '2026-10-11 14:00', to: '2026-10-11T15:30:00' }, wide))
    expect(datetime.query.from).toBe(new Date(2026, 9, 11, 14, 0, 0, 0).getTime())
    expect(datetime.query.to).toBe(new Date(2026, 9, 11, 15, 30, 0, 0).getTime())
    const dateOnly = expectOk(normalizeQuery({ targetId: 'loki', from: '2026-10-11', to: '2026-10-12' }, wide))
    expect(dateOnly.query.from).toBe(new Date(2026, 9, 11).getTime())
  })

  it('收相对时间 -30m / -2h / -1d / now（相对注入的 now，不依赖跑用例的那一刻）', () => {
    const wide = caps({ maxWindowMs: 3 * 24 * 60 * 60 * 1000 })
    const half = expectOk(normalizeQuery({ targetId: 'loki', from: '-30m', to: 'now' }, wide, { now: NOW }))
    expect(half.query.from).toBe(NOW - 30 * 60 * 1000)
    expect(half.query.to).toBe(NOW)
    expect(expectOk(normalizeQuery({ targetId: 'loki', from: '-2h', to: NOW }, wide, { now: NOW })).query.from).toBe(NOW - 2 * 60 * 60 * 1000)
    expect(expectOk(normalizeQuery({ targetId: 'loki', from: '-1d', to: NOW }, wide, { now: NOW })).query.from).toBe(NOW - 24 * 60 * 60 * 1000)
    expect(expectOk(normalizeQuery({ targetId: 'loki', from: '-90s', to: NOW }, wide, { now: NOW })).query.from).toBe(NOW - 90 * 1000)
    // 相对时间照样受来源的窗口上限约束（便利不改判据）
    expect(expectError(normalizeQuery({ targetId: 'loki', from: '-1d', to: NOW }, caps(), { now: NOW }))).toContain('360 分钟')
    // 纯数字字符串也当 epoch 毫秒（模型常常算完再包成字符串）
    expect(expectOk(normalizeQuery({ targetId: 'loki', from: String(NOW - 60_000), to: NOW }, caps())).query.from).toBe(NOW - 60_000)
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
      'hit_limit_maybe',
      'max_result_window',
      'partial_shards',
      'timed_out',
      'scan_cap',
      'byte_cap',
      'cursor_expired',
    ])
  })
})

/*
 * 第三十六刀：「确定还有」与「可能还有」分开。
 *
 * 这一组判据来自真机实测的边界（ES 7.10.2，命中数 53）：
 *
 *     limit=53 → returned 53, total 53 → 旧判据说「已截断」  ← 其实一条都没漏
 *     limit=54 → returned 53, total 53 → 旧判据说「没截断」  ← 正确
 *
 * 旧判据（`lines.length >= limit`）的代价不止文案：它同时决定**给不给「下一页」**，
 * 而那一页之后真的没有了，翻过去是 0 行（真机验过）——用户会以为系统坏了。
 *
 * 参考 Kibana 7.10 的做法：它比较的是「本页实际有的」与「ES 声称的总数」，
 * 所以「命中恰好等于上限」时两边相等、不会误报；文案也是 `Limited to N results` 而不是
 * 「已截断」，因为它的总数封顶 10000，说「还有多少」等于撒谎。
 * 我们显式 `track_total_hits: true`，总数是真的，所以能判断得比它更准。
 */
describe('pageLimitFlags：确定还有 / 可能还有（第三十六刀）', () => {
  it('命中**多于**上限：确定还有更多', () => {
    expect(pageLimitFlags({ returned: 100, limit: 100, matched: 15200, totalKnown: true }))
      .toEqual({ limited: true, maybeLimited: false })
  })

  it('命中**恰好等于**上限：只是「可能」，不报截断（原来误报的就是这一格）', () => {
    expect(pageLimitFlags({ returned: 53, limit: 53, matched: 53, totalKnown: true }))
      .toEqual({ limited: false, maybeLimited: true })
  })

  it('命中**少于**上限：确定没有了（返回行也该跟着少于上限）', () => {
    expect(pageLimitFlags({ returned: 53, limit: 100, matched: 53, totalKnown: true }))
      .toEqual({ limited: false, maybeLimited: false })
  })

  it('没有精确总数（Loki / ES 回 gte）：只能说「可能」，不硬猜', () => {
    expect(pageLimitFlags({ returned: 100, limit: 100, matched: 10000 }))
      .toEqual({ limited: false, maybeLimited: true })
    // 明确告知是下界时，哪怕 matched 远大于 limit 也不算「确定」
    expect(pageLimitFlags({ returned: 100, limit: 100, matched: 10000, totalKnown: false }))
      .toEqual({ limited: false, maybeLimited: true })
  })

  it('没到上限时，有没有总数都不影响（没到就是没到）', () => {
    expect(pageLimitFlags({ returned: 10, limit: 100, matched: 99999, totalKnown: true }))
      .toEqual({ limited: false, maybeLimited: false })
    expect(pageLimitFlags({ returned: 10, limit: 100 }))
      .toEqual({ limited: false, maybeLimited: false })
  })

  it('limit=0（不限制）不算截断', () => {
    expect(pageLimitFlags({ returned: 500, limit: 0, matched: 500, totalKnown: true }))
      .toEqual({ limited: false, maybeLimited: false })
  })

  it('两档在 truncationOf 里是不同的理由（界面据此说两种句子）', () => {
    expect(truncationOf({ limited: true }).reasons).toEqual(['hit_limit'])
    expect(truncationOf({ maybeLimited: true }).reasons).toEqual(['hit_limit_maybe'])
    // 同时出现时两句都要说（顺序固定：确定在前）
    expect(truncationOf({ limited: true, maybeLimited: true }).reasons)
      .toEqual(['hit_limit', 'hit_limit_maybe'])
  })
})
