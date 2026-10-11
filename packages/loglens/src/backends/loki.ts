/**
 * @hyzyn/dsh-loglens — Loki 适配器（P2）。
 *
 * 一个薄层：把归一化查询翻译成 `/loki/api/v1/query_range` 的请求、把 `streams[].values` 摊平成
 * 行、把 stats 搬进计数、把「同 ts 多行」的边界交给 src/cursor.ts。所有夹取与校验都在
 * src/query.ts（适配器**不再夹一遍**——两处夹取就是两份会漂的口径）。
 *
 * 本机暂无 Loki 环境，所以这一版只到「代码 + 假 Loki 的 wire 级用例」；真机验收（P2 的活）要
 * 另起容器，届时**单独测同 ts 多行的顺序稳定性**。在此之前分页能力按设计 §3.3 的保守退路声明为
 * 'none'：只回「命中可能不完整，请缩小时间窗」，不给会丢行的游标——见 LOKI_PAGINATION。
 */
import type { LoglensTarget } from '../config.js'
import { decodeCursor, encodeCursor, lineFromLoki, slicePage } from '../cursor.js'
import type { LokiCursor } from '../cursor.js'
import { countsOf, truncationOf } from '../query.js'
import type {
  BackendCaps,
  BackendHealth,
  FieldInfo,
  LogBackend,
  LogLine,
  LogQueryResult,
  NormalizedQuery,
  PaginationKind,
} from './types.js'

/** Loki 单页上限的默认声明（Loki 自己的默认是 100，这里放宽；再大要动服务端 max_entries_limit）。 */
export const LOKI_DEFAULT_MAX_PAGE_SIZE = 1000
/** 时间窗上限的默认声明（7 天）：Loki 不限制，但一次拉 30 天只会得到一句谎话般的「就是全部」。 */
export const LOKI_DEFAULT_MAX_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
/** 单次请求超时（真机里卡住比报错更糟：面板会一直转圈）。 */
export const LOKI_TIMEOUT_MS = 15_000

/**
 * 分页能力的**当前声明**。
 *
 * 游标那套玩法的预设是「同一 stream、同一 ts 内多行的返回顺序稳定」，而这个前提**还没在真机上
 * 测过**（P2 的活）。测出来之前不对外给游标：只把 `hit_limit` 报出去，让调用方说「命中可能不
 * 完整，请缩小时间窗」。**诚实报不完整，好过给一个会丢行的游标。**
 *
 * 实现与用例都已就位（`pagination: 'cursor'` 的用例覆盖了「同 ts 三行 / limit=2 不丢第三行」与
 * 「同 ts 同内容两行 / limit=1 不吞第二行」两条），真机测出稳定序后改这一个常量即可。
 */
export const LOKI_PAGINATION: PaginationKind = 'none'

export interface LokiOptions {
  pagination?: PaginationKind
  maxPageSize?: number
  maxWindowMs?: number
  timeoutMs?: number
  /** 注入点：默认全局 fetch；用例起一个监听本机端口的假 Loki，走真 HTTP。 */
  fetchImpl?: typeof fetch
}

/** Loki 的 query_range 返回体（只列我们用到的字段；多出来的原样忽略）。 */
interface LokiRangeBody {
  status?: string
  data?: {
    resultType?: string
    result?: Array<{ stream?: Record<string, string>; values?: Array<[string, string]> }>
    stats?: { summary?: Record<string, unknown> }
  }
  error?: string
}

interface LokiRow {
  tsNs: string
  streamIdx: number
  line: string
  labels: Record<string, string>
  /** 同 ts 同流里的第几行（从 0 起）：LogLine.id 靠它，**跨页也稳定**。 */
  ordinalInGroup: number
}

/** 拼路径：只在中间补斜杠，不碰 base 里已有的前缀（Loki 常挂在网关的子路径下）。 */
function joinUrl(base: string, path: string): string {
  let trimmed = base
  while (trimmed.endsWith('/')) trimmed = trimmed.slice(0, -1)
  return trimmed + path
}

/** epoch 毫秒 → 纳秒字符串（BigInt 走一遍，别用浮点乘）。 */
export function toNanoString(ms: number): string {
  return String(BigInt(Math.trunc(ms)) * 1_000_000n)
}

/** 取两个纳秒字符串里较早的那个（不能先换成 ms：亚毫秒边界会被磨掉，而边界正是「含它」的那条线）。 */
export function minNanoString(left: string, right: string): string {
  return BigInt(left) <= BigInt(right) ? left : right
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function detailOf(body: unknown, fallback: string): string {
  if (typeof body === 'object' && body !== null) {
    const error = (body as { error?: unknown }).error
    if (typeof error === 'string' && error !== '') return error
  }
  const text = fallback.trim()
  return text.length > 200 ? text.slice(0, 200) + '…' : text
}

/** 比较两个纳秒字符串（字符串长度可能不同，必须按 BigInt 比）。 */
function compareNano(left: string, right: string): number {
  const a = BigInt(left)
  const b = BigInt(right)
  return a === b ? 0 : a > b ? 1 : -1
}

async function requestJson(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort() }, timeoutMs)
  let response: Response
  let text: string
  try {
    response = await fetchImpl(url, { ...init, signal: controller.signal })
    text = await response.text()
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('[loki] 请求超时（>' + String(timeoutMs) + 'ms）：' + url)
    }
    throw new Error('[loki] 请求失败：' + (error instanceof Error ? error.message : String(error)))
  } finally {
    clearTimeout(timer)
  }
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    body = undefined
  }
  if (!response.ok) {
    throw new Error('[loki] HTTP ' + String(response.status) + '：' + detailOf(body, text))
  }
  if (body === undefined) {
    const trimmed = text.trim()
    throw new Error('[loki] 返回的不是 JSON：' + (trimmed.length > 120 ? trimmed.slice(0, 120) + '…' : trimmed))
  }
  return body
}

/** 把 query_range 的返回体摊平成行，并给出**全局有序**（同 ts 内按流序号、流内按出现次序）。 */
export function rowsFromRange(body: LokiRangeBody, direction: 'forward' | 'backward'): LokiRow[] {
  const streams = body.data?.result
  if (!Array.isArray(streams)) return []
  const rows: LokiRow[] = []
  for (let streamIdx = 0; streamIdx < streams.length; streamIdx += 1) {
    const stream = streams[streamIdx]
    const labels = stream.stream === undefined ? {} : stream.stream
    const values = Array.isArray(stream.values) ? stream.values : []
    const seenAtTs = new Map<string, number>()
    for (const pair of values) {
      if (!Array.isArray(pair) || pair.length < 2) continue
      const tsNs = pair[0]
      const line = pair[1]
      if (typeof tsNs !== 'string' || typeof line !== 'string') continue
      const ordinalInGroup = seenAtTs.get(tsNs) === undefined ? 0 : (seenAtTs.get(tsNs) as number) + 1
      seenAtTs.set(tsNs, ordinalInGroup)
      rows.push({ tsNs, streamIdx, line, labels, ordinalInGroup })
    }
  }
  // Loki 按**流**返回（每条流内部有序），跨流没有全局顺序：这里补一个确定的合并顺序。
  rows.sort((left, right) => {
    const byTime = compareNano(left.tsNs, right.tsNs)
    if (byTime !== 0) return direction === 'forward' ? byTime : -byTime
    if (left.streamIdx !== right.streamIdx) return left.streamIdx - right.streamIdx
    return left.ordinalInGroup - right.ordinalInGroup
  })
  return rows
}

/** 建一个 Loki 后端。`options` 只为用例与日后的配置留口子，默认值就是线上口径。 */
export function createLokiBackend(options: LokiOptions = {}): LogBackend {
  const pagination = options.pagination === undefined ? LOKI_PAGINATION : options.pagination
  const maxPageSize = options.maxPageSize === undefined ? LOKI_DEFAULT_MAX_PAGE_SIZE : options.maxPageSize
  const maxWindowMs = options.maxWindowMs === undefined ? LOKI_DEFAULT_MAX_WINDOW_MS : options.maxWindowMs
  const timeoutMs = options.timeoutMs === undefined ? LOKI_TIMEOUT_MS : options.timeoutMs
  const fetchImpl = options.fetchImpl === undefined ? fetch : options.fetchImpl

  return {
    id: 'loki',

    capabilities(): BackendCaps {
      return {
        queryLanguage: 'logql',
        follow: true,
        aggregations: true,
        requiresTimeRange: true,
        fields: 'discovered',
        pagination,
        maxPageSize,
        maxWindowMs,
      }
    },

    async fields(target: LoglensTarget): Promise<FieldInfo[]> {
      const body = await requestJson(fetchImpl, joinUrl(target.url, '/loki/api/v1/labels'), { method: 'GET' }, timeoutMs)
      const data = (body as { data?: unknown }).data
      if (!Array.isArray(data)) return []
      return data
        .filter((name): name is string => typeof name === 'string' && name !== '')
        .map((name) => ({ name, kind: 'discovered' as const }))
    },

    async health(target: LoglensTarget): Promise<BackendHealth> {
      try {
        const response = await fetchImpl(joinUrl(target.url, '/ready'), { method: 'GET' })
        const text = (await response.text()).trim()
        return response.ok
          ? { ok: true, detail: text === '' ? 'ready' : text.slice(0, 120) }
          : { ok: false, detail: 'HTTP ' + String(response.status) + '：' + text.slice(0, 120) }
      } catch (error) {
        return { ok: false, detail: error instanceof Error ? error.message : String(error) }
      }
    },

    async query(query: NormalizedQuery, target: LoglensTarget): Promise<LogQueryResult> {
      if (query.filters !== undefined && Object.keys(query.filters).length > 0) {
        // 静默忽略过滤器比报错更糟：用户以为筛了，其实拿到的是全量。
        throw new Error('[loki] 暂不支持结构化 filters：请把条件写进 LogQL 查询串')
      }
      let skip: LokiCursor | undefined
      if (query.cursor !== undefined) {
        const state = decodeCursor(query.cursor)
        if (state.kind === 'invalid') throw new Error('[loki] 游标解不开（' + state.reason + '）：请重新发起查询')
        if (state.kind === 'ok') skip = state.cursor
      }

      const params = new URLSearchParams()
      params.set('query', query.q === '' ? '{}' : query.q)
      params.set('start', toNanoString(query.from))
      // 带游标时把窗口右端收到游标那个 ts：既省掉重读比它更新的数据，也保证「含边界」这条语义
      // 精确到纳秒（先换成 ms 再换回来会把亚毫秒边界磨掉，那一批行就再也取不回来）。
      params.set('end', skip === undefined ? toNanoString(query.to) : minNanoString(toNanoString(query.to), skip.endNs))
      params.set('limit', String(query.limit))
      params.set('direction', query.direction)
      const url = joinUrl(target.url, '/loki/api/v1/query_range') + '?' + params.toString()

      const body = (await requestJson(fetchImpl, url, { method: 'GET' }, timeoutMs)) as LokiRangeBody
      if (body.status !== undefined && body.status !== 'success') {
        throw new Error('[loki] 查询失败：' + detailOf(body, 'status=' + String(body.status)))
      }
      const rows = rowsFromRange(body, query.direction)
      const slice = slicePage(rows, skip, query.limit)

      const summary = body.data?.stats?.summary ?? {}
      const counts = countsOf({
        returned: slice.page.length,
        scannedRows: numberOrUndefined(summary.totalLinesProcessed),
        scannedBytes: numberOrUndefined(summary.totalBytesProcessed),
      })
      const lines: LogLine[] = slice.page.map((row) => lineFromLoki(row, row.ordinalInGroup))
      const result: LogQueryResult = {
        lines,
        counts,
        truncation: truncationOf({ limited: slice.limited }),
      }
      if (pagination === 'cursor' && slice.next !== undefined) {
        result.nextCursor = encodeCursor(slice.next)
      }
      return result
    },
  }
}

/** 进程内共用的那一个实例（无状态，配置都在调用参数里）。 */
export const lokiBackend: LogBackend = createLokiBackend()
