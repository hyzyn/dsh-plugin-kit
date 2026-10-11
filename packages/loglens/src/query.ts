/**
 * @hyzyn/dsh-loglens — 归一化与夹取（P1 地基）。
 *
 * 「把 Agent / 面板给的原始参数变成后端能执行的一份查询」的**唯一**判据处：时间戳单位、
 * 时间窗上限、limit 夹取、方向默认值、游标透传、计数与截断的归并。适配器不许再自己夹
 * 一遍——两处夹取就是两份会漂的口径。
 *
 * 三件事在 P1 定稿（设计 §3.2 / §3.3）：
 *   1. **track_total_hits 的归属**：由适配器在需要精确总数时显式打开、代价自担。不打开时
 *      ES 的 hits.total.value 恒定封顶 10000 且 relation === 'gte' ⇒ totalKnown: false；
 *      本层的 countsOf 只如实搬运，不猜。
 *   2. **cursor_expired 与 hit_limit 是两个理由**：过期不等于「还有更多」。适配器不许静默
 *      重开 PIT（那会悄悄换掉快照语义），Agent 侧应重新发一次带时间窗的查询。
 *   3. **Loki 的顺序稳定性**另有 P2 的真机测试；在那之前由适配器自己声明 pagination
 *      （测不出稳定序就声明 'none'，只回「命中可能不完整」），本层不做假设。
 */
import type { BackendCaps, Direction, LogCounts, Truncation, TruncationReason } from './backends/types.js'

/** 默认返回条数（面板与 agent 工具的默认值都取它）。 */
export const DEFAULT_LIMIT = 100
/** 不声明时间窗上限时的兜底（24 小时）。 */
export const DEFAULT_MAX_WINDOW_MS = 24 * 60 * 60 * 1000
/** epoch 毫秒的下限判据：小于它就当成「按秒填的」（1e11 ms ≈ 1973-03）。 */
const MS_FLOOR = 100_000_000_000

/** Agent / 面板给的原始参数（全部 unknown：校验在这一层做，调用方不用先判类型）。 */
export interface QueryInput {
  targetId?: unknown
  q?: unknown
  from?: unknown
  to?: unknown
  limit?: unknown
  direction?: unknown
  cursor?: unknown
  filters?: unknown
}

export interface NormalizeOptions {
  /** 当前时刻（毫秒）。注入是为了让「默认时间窗」的用例可确定地断言。 */
  now?: number
  defaultLimit?: number
}

export type NormalizeResult =
  | { ok: true; query: NormalizedQueryLike; warnings: string[] }
  | { ok: false; error: string }

/** 与契约里的 NormalizedQuery 同形（这里显式写出来，免得为了一个形状去 import 类型）。 */
export interface NormalizedQueryLike {
  targetId: string
  q: string
  from: number
  to: number
  limit: number
  direction: Direction
  cursor?: string
  filters?: Record<string, string>
}

function asTimestamp(value: unknown, field: string): { ok: true; value: number } | { ok: false; error: string } {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    return { ok: false, error: field + ' 必须是整数（epoch 毫秒）' }
  }
  if (value > 0 && value < MS_FLOOR) {
    return { ok: false, error: field + ' 看起来是**秒**：本插件统一用 epoch 毫秒（' + String(value) + '）' }
  }
  return { ok: true, value }
}

function asFilters(value: unknown): { ok: true; filters?: Record<string, string> } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'filters 必须是「字段名 → 值」的对象' }
  }
  const filters: Record<string, string> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item !== 'string') return { ok: false, error: 'filters 的值必须是字符串：' + key }
    filters[key] = item
  }
  return Object.keys(filters).length === 0 ? { ok: true } : { ok: true, filters }
}

/**
 * 归一化 + 夹取。**能夹的夹（limit），会改变语义的报错**（时间窗超上限、时间戳单位不对）——
 * 静默把时间窗截短会让「查到的就是全部」变成一句谎话。
 */
export function normalizeQuery(input: QueryInput, caps: BackendCaps, options: NormalizeOptions = {}): NormalizeResult {
  const warnings: string[] = []
  if (typeof input.targetId !== 'string' || input.targetId.trim() === '') {
    return { ok: false, error: 'targetId 必填（v1 一次只查一个来源）' }
  }
  const targetId = input.targetId.trim()
  const q = typeof input.q === 'string' ? input.q.trim() : ''

  const now = typeof options.now === 'number' ? options.now : Date.now()
  const rawFrom = input.from === undefined || input.from === null ? undefined : asTimestamp(input.from, 'from')
  if (rawFrom !== undefined && !rawFrom.ok) return rawFrom
  const rawTo = input.to === undefined || input.to === null ? undefined : asTimestamp(input.to, 'to')
  if (rawTo !== undefined && !rawTo.ok) return rawTo

  const fromValue = rawFrom !== undefined && rawFrom.ok ? rawFrom.value : undefined
  const toValue = rawTo !== undefined && rawTo.ok ? rawTo.value : undefined
  const fallbackWindow = Math.min(DEFAULT_MAX_WINDOW_MS, caps.maxWindowMs)
  let from: number
  let to: number
  if (fromValue === undefined && toValue === undefined) {
    if (caps.requiresTimeRange) return { ok: false, error: '这个来源必须在时间窗内查询（from / to 缺一不可）' }
    to = now
    from = now - fallbackWindow
    warnings.push('未给时间窗，按最近 ' + String(Math.round(fallbackWindow / 60000)) + ' 分钟查')
  } else if (fromValue === undefined) {
    if (caps.requiresTimeRange) return { ok: false, error: '这个来源必须在时间窗内查询（缺 from）' }
    to = toValue === undefined ? now : toValue
    from = to - fallbackWindow
    warnings.push('未给 from，按 maxWindowMs 兜底')
  } else if (toValue === undefined) {
    from = fromValue
    to = now
    warnings.push('未给 to，按当前时刻兜底')
  } else {
    from = fromValue
    to = toValue
  }

  if (to <= from) return { ok: false, error: '时间窗是空的：to 必须晚于 from' }
  const maxWindowMs = caps.maxWindowMs > 0 ? caps.maxWindowMs : DEFAULT_MAX_WINDOW_MS
  if (to - from > maxWindowMs) {
    return {
      ok: false,
      error: '时间窗超过这个来源的上限（' + String(Math.round(maxWindowMs / 60000)) + ' 分钟）：请缩小时间窗或分段查',
    }
  }

  let limit = options.defaultLimit === undefined ? DEFAULT_LIMIT : options.defaultLimit
  if (input.limit !== undefined && input.limit !== null) {
    if (typeof input.limit !== 'number' || !Number.isInteger(input.limit) || input.limit < 1) {
      return { ok: false, error: 'limit 必须是正整数' }
    }
    limit = input.limit
  }
  if (caps.maxPageSize > 0 && limit > caps.maxPageSize) {
    warnings.push('limit ' + String(limit) + ' 超过这个来源的单页上限，已夹到 ' + String(caps.maxPageSize))
    limit = caps.maxPageSize
  }

  let direction: Direction = 'backward'
  if (input.direction !== undefined && input.direction !== null) {
    if (input.direction !== 'forward' && input.direction !== 'backward') {
      return { ok: false, error: "direction 只能是 'forward' 或 'backward'" }
    }
    direction = input.direction
  }

  const filters = asFilters(input.filters)
  if (!filters.ok) return filters

  const cursorRaw = typeof input.cursor === 'string' ? input.cursor.trim() : ''
  const query: NormalizedQueryLike = { targetId, q, from, to, limit, direction }
  if (cursorRaw !== '') query.cursor = cursorRaw
  if (filters.filters !== undefined) query.filters = filters.filters
  return { ok: true, query, warnings }
}

/** ES 的命中总数关系：'gte' = 只是下界（没开 track_total_hits 时的常态）。 */
export type TotalRelation = 'eq' | 'gte'

export interface CountsInput {
  returned: number
  matched?: number
  scannedRows?: number
  scannedBytes?: number
  totalRelation?: TotalRelation
}

/**
 * 归并计数。**totalKnown 只在真有精确总数时为真**：没有 matched、或 relation 是 'gte' 都算
 * 「matched 只是下界」。别把「不知道」写成「知道」——Agent 侧会拿它当分页与终止判据。
 */
export function countsOf(input: CountsInput): LogCounts {
  const counts: LogCounts = { returned: input.returned, totalKnown: false }
  if (input.matched !== undefined) counts.matched = input.matched
  if (input.scannedRows !== undefined) counts.scannedRows = input.scannedRows
  if (input.scannedBytes !== undefined) counts.scannedBytes = input.scannedBytes
  counts.totalKnown = input.matched !== undefined && input.totalRelation !== 'gte'
  return counts
}

/** 截断理由的**固定顺序**（同一个输入必须得到同一个数组，用例才好逐字断言）。 */
export const TRUNCATION_ORDER: readonly TruncationReason[] = [
  'hit_limit',
  'max_result_window',
  'partial_shards',
  'timed_out',
  'scan_cap',
  'byte_cap',
  'cursor_expired',
]

export interface TruncationInput {
  /** 达到 limit（可能还有）——照 docker 的五计数口径，`limited` 就是「可能还有」。 */
  limited?: boolean
  maxResultWindow?: boolean
  partialShards?: boolean
  timedOut?: boolean
  scanCap?: boolean
  byteCap?: boolean
  cursorExpired?: boolean
}

/** 归并截断信号：`truncated` 恒等于「至少有一条理由」，不给「有理由但 truncated=false」的态。 */
export function truncationOf(input: TruncationInput): Truncation {
  const flags: Record<TruncationReason, boolean | undefined> = {
    hit_limit: input.limited,
    max_result_window: input.maxResultWindow,
    partial_shards: input.partialShards,
    timed_out: input.timedOut,
    scan_cap: input.scanCap,
    byte_cap: input.byteCap,
    cursor_expired: input.cursorExpired,
  }
  const reasons = TRUNCATION_ORDER.filter((reason) => flags[reason] === true)
  return { truncated: reasons.length > 0, reasons }
}
