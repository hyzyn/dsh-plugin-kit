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
 *   3. **Loki 的顺序稳定性**已由 P2 的真机验收测过（2026-10-12，结论：不稳定）；
 *      游标的成立改由「完整 ts 组」这个坐标保证，而不是赌顺序——见 src/cursor.ts 与 loglens D03。
 *      本层依旧不做任何顺序假设。
 */
import type { BackendCaps, Direction, LogCounts, Truncation, TruncationReason } from './backends/types.js'

/** 默认返回条数（面板与 agent 工具的默认值都取它）。 */
export const DEFAULT_LIMIT = 100
/** 不声明时间窗上限时的兜底（24 小时）。 */
export const DEFAULT_MAX_WINDOW_MS = 24 * 60 * 60 * 1000
/** epoch 毫秒的下限判据：小于它就当成「按秒填的」（1e11 ms ≈ 1973-03）。 */
const MS_FLOOR = 100_000_000_000

/**
 * 「只给了一端」时的兜底窗口：15 分钟。
 *
 * 为什么是它而不是 maxWindowMs（24 小时）：最常见的问法是「给我看最新的日志」，而 24 小时的
 * 尾部在昂贵的集群上是几万行——兜底该给一个**能读完**的量，宽窗留给调用方自己说明。
 */
export const FALLBACK_WINDOW_MS = 15 * 60 * 1000

/** 相对时间的写法：-30m / -2h / -1d / -90s。 */
const RELATIVE_TIME = /^-(\d+)(s|m|h|d)$/u
/** 不带时区的日期 / 日期时间（按**本机时区**解释：人写「2026-10-11 14:00」指的就是本地那一下）。 */
const LOCAL_DATETIME = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.](\d{1,3}))?)?)?$/u

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

/**
 * 时间参数的**入口**解析：epoch 毫秒 / ISO 8601 / 相对时间（-30m）三种写法都收，
 * 出了这一层就只剩 epoch 毫秒（契约不变：设计 §3.1 的 NormalizedQuery 仍是 ms）。
 *
 * 为什么非收不可（2026-10-11 真机反馈）：让模型手算绝对毫秒是**真的会错**——用户那次
 * 算错了 4 个月，白跑一轮。而 `isoOf()` 内部本来就在用 ISO；把便利留在入口、把契约留在
 * 里层，比逼调用方做算术便宜得多。
 *
 * 取舍写清楚：**不带时区的写法按本机时区解释**（人写「2026-10-11 14:00」指的是本地那一下），
 * 带 `Z` 或 ±HH:MM 的按它自己说的算。
 */
function asTime(value: unknown, field: string, now: number): { ok: true; value: number } | { ok: false; error: string } {
  const shape = field + ' 收 epoch 毫秒整数（1760000000000）、ISO 8601（2026-10-11T14:00:00Z）或相对时间（-30m / -2h / -1d）'
  let ms: number
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) return { ok: false, error: shape }
    ms = value
  } else if (typeof value === 'string') {
    const text = value.trim()
    if (text === '') return { ok: false, error: shape }
    if (text === 'now') ms = now
    else if (/^\d+$/u.test(text)) ms = Number(text)
    else {
      const relative = RELATIVE_TIME.exec(text)
      if (relative !== null) {
        const amount = Number(relative[1])
        const unit = relative[2]
        const unitMs = unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000
        ms = now - amount * unitMs
      } else {
        const local = LOCAL_DATETIME.exec(text)
        if (local !== null) {
          ms = new Date(
            Number(local[1]), Number(local[2]) - 1, Number(local[3]),
            Number(local[4] === undefined ? '0' : local[4]),
            Number(local[5] === undefined ? '0' : local[5]),
            Number(local[6] === undefined ? '0' : local[6]),
            Number(local[7] === undefined ? '0' : local[7]),
          ).getTime()
        } else {
          ms = Date.parse(text)   // 带时区偏移的 ISO / RFC 3339
        }
      }
    }
    if (!Number.isFinite(ms)) return { ok: false, error: field + ' 解析不了：' + text + '（' + shape + '）' }
  } else {
    return { ok: false, error: shape }
  }
  if (ms > 0 && ms < MS_FLOOR) {
    return { ok: false, error: field + ' 看起来是**秒**（' + String(ms) + '）：本插件统一用 epoch 毫秒，或直接写 ISO / 相对时间' }
  }
  return { ok: true, value: ms }
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
  const rawFrom = input.from === undefined || input.from === null ? undefined : asTime(input.from, 'from', now)
  if (rawFrom !== undefined && !rawFrom.ok) return rawFrom
  const rawTo = input.to === undefined || input.to === null ? undefined : asTime(input.to, 'to', now)
  if (rawTo !== undefined && !rawTo.ok) return rawTo

  const fromValue = rawFrom !== undefined && rawFrom.ok ? rawFrom.value : undefined
  const toValue = rawTo !== undefined && rawTo.ok ? rawTo.value : undefined
  /*
   * 兜底口径（2026-10-11 修，来自真机反馈）：**只给一端时一律兜底 + 一条 warning**，
   * 不再因为 requiresTimeRange 把「只给 to」打回去——工具的文案一直写着「to 缺省取当前时刻」，
   * 而实现却在报「缺 from」：照着 schema 办事的 agent 会被自己的插件打回，而
   * 「给我看最新的日志」恰恰是最常见的问法。语义没被悄悄改：兜底窗口会随 window 一起回显，
   * 并且 warning 里写明它是兜底来的。
   *
   * 两端都不给时仍按来源的要求报错（requiresTimeRange 的来源不会凭空造一个时间窗），
   * 但文案点明「给 to 就够」。
   */
  const fallbackWindow = Math.max(1, Math.min(FALLBACK_WINDOW_MS, caps.maxWindowMs > 0 ? caps.maxWindowMs : FALLBACK_WINDOW_MS))
  let from: number
  let to: number
  if (fromValue === undefined && toValue === undefined) {
    if (caps.requiresTimeRange) {
      return {
        ok: false,
        error: '这个来源必须在时间窗内查询：至少给 to（只给 to 时按它前面 '
          + String(Math.round(fallbackWindow / 60000)) + ' 分钟兜底），或者直接给 from 与 to',
      }
    }
    to = now
    from = now - fallbackWindow
    warnings.push('未给时间窗，按最近 ' + String(Math.round(fallbackWindow / 60000)) + ' 分钟查')
  } else if (fromValue === undefined) {
    to = toValue === undefined ? now : toValue
    from = to - fallbackWindow
    warnings.push('未给 from，按 to 前面 ' + String(Math.round(fallbackWindow / 60000)) + ' 分钟兜底（window 里是实际生效的时间窗）')
  } else if (toValue === undefined) {
    from = fromValue
    to = now
    warnings.push('未给 to，按当前时刻兜底（window 里是实际生效的时间窗）')
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
