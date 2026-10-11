/**
 * @hyzyn/dsh-loglens — 后端契约（P1 地基）。
 *
 * 这里只放**形状**，不放实现：适配器（Loki / ES / OpenSearch / Docker）各自实现 LogBackend，
 * 归一化与夹取在 src/query.ts，游标在 src/cursor.ts。契约正文与判据在 docs/design.md §3，
 * 别在这份文件里另写一份口径（复制即造第二份真相源）。
 */
import type { LoglensTarget } from '../config.js'

/** 查询方言：只用于**标注**，不做互译（LogQL 与 Lucene 不可互译，设计 §1 非目标）。 */
export type QueryLanguage = 'logql' | 'lucene' | 'ppl' | 'none'
/** 分页形态。'none' = 只回「命中可能不完整，请缩小时间窗」，不给会丢行的游标。 */
export type PaginationKind = 'cursor' | 'offset' | 'none'
/** 字段来源：索引里的 / 探测出来的 / 固定的（Docker 是这一档）。 */
export type FieldKind = 'indexed' | 'discovered' | 'fixed'
/** 排序方向：默认 backward（新的在前，人看日志的顺序）。 */
export type Direction = 'forward' | 'backward'

/** 一个后端 / 来源的自述能力。适配器声明什么，本层就按什么夹取——两处各夹一遍必然漂。 */
export interface BackendCaps {
  queryLanguage: QueryLanguage
  /** 方言分流用（ES 8.11+ 的 ES|QL、OpenSearch 的 PPL 等），没有就是 undefined。 */
  flavor?: string
  follow: boolean
  aggregations: boolean
  requiresTimeRange: boolean
  fields: FieldKind
  pagination: PaginationKind
  maxPageSize: number
  maxWindowMs: number
}

/** 归一化后的查询：时间**统一 epoch 毫秒**，cursor 是后端私有编码（本层只透传）。 */
export interface NormalizedQuery {
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
 * 一行日志。`source` + `ts` 必须**可重查**——三个后端都没有原生的「某行前后 N 行」，
 * `loglens_context` 只能靠这两项回到源头再取一遍（设计 §3.1）。
 */
export interface LogLine {
  ts: number
  /** 级别。**归一化过**（trace / debug / info / warn / error / fatal），见 src/line.ts。 */
  level?: string
  /**
   * true = 这个级别是**从正文推断**的（文档 / 流标签里没有级别字段）。
   *
   * 为什么单列一位：level 是筛选项，而「文档说它是 error」与「我从正文看着像 error」是两种可信度。
   * 契约不许把后者写成前者——与 LogCounts.totalKnown 同一口径。
   */
  levelInferred?: boolean
  message: string
  source: string
  labels: Record<string, string>
  raw: string
  id: string
}

/** 计数：语义不同的量不许挤进一个 number（设计 §3.2）。 */
export interface LogCounts {
  returned: number
  /** 命中总数；`totalKnown` 为假时它只是**下界**。 */
  matched?: number
  /** docker grep：宿主侧实际扫过的行数。 */
  scannedRows?: number
  /** Loki stats：processedBytes 一类。 */
  scannedBytes?: number
  totalKnown: boolean
}

/** 截断理由。`cursor_expired` 与 `hit_limit` 刻意分开：过期≠还有更多，处置也不同。 */
export type TruncationReason =
  | 'hit_limit'
  | 'max_result_window'
  | 'partial_shards'
  | 'timed_out'
  | 'scan_cap'
  | 'byte_cap'
  | 'cursor_expired'

export interface Truncation {
  truncated: boolean
  reasons: TruncationReason[]
}

export interface LogQueryResult {
  lines: LogLine[]
  counts: LogCounts
  truncation: Truncation
  nextCursor?: string
}

export interface FieldInfo {
  name: string
  kind: FieldKind
  label?: string
  /** 这个字段是不是「常用筛选项」（优先键名单里的，排在前面）。 */
  preferred?: boolean
}

/**
 * 列字段的结果。**为什么不是裸数组**（2026-10-11 真机反馈第 4 条）：agent 拿到的是一份
 * 被上限截断的清单，而它无从知道「还有多少没列出来」——于是把 45KB 的字段表当成了全部。
 * 截断信号必须跟着结果走（与行的 hit_limit 同一口径）。
 */
export interface FieldsResult {
  fields: FieldInfo[]
  /** 来源里一共有多少个字段（截断前）。 */
  total: number
  /** true = fields 被上限截断了，还有 total - fields.length 个没列。 */
  truncated: boolean
}

/** 列字段的选项：上限由调用方给（工具面默认 80，硬上限 200）。 */
export interface FieldsOptions {
  limit?: number
}

export interface BackendHealth {
  ok: boolean
  detail?: string
}

/** 一个日志后端。`target` 是来源清单里的那一条（地址只存在宿主侧，浏览器永不传 URL）。 */
export interface LogBackend {
  id: string
  capabilities(): BackendCaps
  fields(target: LoglensTarget, options?: FieldsOptions): Promise<FieldsResult>
  query(query: NormalizedQuery, target: LoglensTarget): Promise<LogQueryResult>
  /** 跟随（长流）。Loki 是 WebSocket，ES 是 _search + 轮询——由适配器各自实现。 */
  stream?(query: NormalizedQuery, target: LoglensTarget, onLine: (line: LogLine) => void): Promise<() => void>
  health(target: LoglensTarget): Promise<BackendHealth>
}
