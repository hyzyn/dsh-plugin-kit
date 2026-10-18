/**
 * @hyzyn/dsh-loglens — Loki 适配器（P2）。
 *
 * 一个薄层：把归一化查询翻译成 `/loki/api/v1/query_range` 的请求、把 `streams[].values` 摊平成
 * 行、把 stats 搬进计数、把「同 ts 多行」的边界交给 src/cursor.ts。所有夹取与校验都在
 * src/query.ts（适配器**不再夹一遍**——两处夹取就是两份会漂的口径）。
 *
 * **真机验收已跑（2026-10-12，Loki 3.7.8，隔离环境）**，抓到两条与窗口/坐标有关的缺陷
 * （loglens D02 / D03，见 DEFECTS.md），分页能力随之从保守的 `'none'` 翻成 `'cursor'`。
 * 两条真语义现在是本文件所有窗口计算的判据：
 *
 *   1. **`start` 是闭区间、`end` 是开区间**（真机逐纳秒实测：`end = ts` 命中 0 行）；
 *   2. **`limit` 会切在同纳秒组中间**，而组内次序跨查询不稳定 → 组必须整组交付。
 */
import type { LoglensTarget } from '../config.js'
import { decodeCursor, encodeCursor, lineFromLoki, slicePage } from '../cursor.js'
import { withLevel } from '../line.js'
import { requestJson as fetchJson } from '../net.js'
import type { LookupFn } from '../net.js'
import type { LokiCursor } from '../cursor.js'
import { countsOf, truncationOf } from '../query.js'
import type {
  BackendCaps,
  BackendHealth,
  FieldsOptions,
  FieldsResult,
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
 * 补齐一个 ts 组时单次请求的上限（loglens D03）。
 *
 * 为什么要有上限：同一个纳秒理论上可以写任意多行。取 5000 是个**诚实的边界**——
 * 真超过它就不再假装这一组完整，而是让 `slicePage` 不产出游标（宁可报「命中可能不完整」，
 * 也不给一个会丢行的游标）。
 */
export const LOKI_GROUP_MAX = 5000

/**
 * 分页能力的**当前声明**。
 *
 * **2026-10-12 翻成 `'cursor'`**：P2 的真机验收跑完了（真 Loki 3.7.8，本机隔离目录），
 * 逐条证据见 ROADMAP 的「P2 真机验收」一节。这一位之所以能翻，靠的不是「顺序稳定」
 * （真机证明它**不**稳定），而是把坐标从「同 ts 第几行」换成了「完整 ts 组」——见
 * src/cursor.ts 的文件头与 loglens D02 / D03。
 *
 * 真机对账：同一份 120 行（3 流 × 8 个时间点 × 每点同纳秒 5 行），limit 取 3 / 7 / 11 / 13 / 40
 * 全部**不丢不重**；改之前的实现是 41 页 280 行、只有 7 行唯一。
 */
export const LOKI_PAGINATION: PaginationKind = 'cursor'

export interface LokiOptions {
  pagination?: PaginationKind
  maxPageSize?: number
  maxWindowMs?: number
  timeoutMs?: number
  /** 注入点：默认全局 fetch；用例起一个监听本机端口的假 Loki，走真 HTTP。 */
  fetchImpl?: typeof fetch
  /** 解析器注入点（出站围栏用）：用例喂假解析结果，验证「域名解析到链路本地」这类判据。 */
  lookupImpl?: LookupFn
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
  /** 同 ts 组里按**内容定序**之后的第几行（从 0 起）：LogLine.id 靠它，**跨页也稳定**。 */
  ordinalInGroup: number
  /** 内容键（标签 + 正文）：同 ts 组内的定序依据，也是「整组是否已交付」的指纹成分。 */
  groupKey: string
}

/**
 * 一行的内容键：稳定的流标签（去掉 Loki 自己加的那几个）+ 正文。
 *
 * 刻意**不含 ts**（同组共用一个 ts，放进去只是噪音）也**不含流序号**（序号随响应次序变）。
 */
function contentKey(labels: Record<string, string>, line: string): string {
  const stable = Object.keys(labels)
    .filter((key) => key !== 'detected_level' && key !== 'service_name')
    .sort()
    .map((key) => key + '=' + labels[key])
    .join(',')
  return stable + '\u0000' + line
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

/** 取两个纳秒字符串里较晚的那个（forward 续页把 start 推到游标边界时用）。 */
export function maxNanoString(left: string, right: string): string {
  return BigInt(left) >= BigInt(right) ? left : right
}

/**
 * 纳秒字符串 +1ns。
 *
 * **为什么必须有这个函数**（loglens D02，2026-10-12 真机验收抓到）：Loki 的 `query_range`
 * **`start` 是闭区间、`end` 是开区间**——真机上逐纳秒扫过：`start = ts` 命中、`end = ts` 命中 0 行、
 * `end = ts + 1ns` 才命中。于是「窗口右端收到游标那个 ts」等于**把那一批同 ts 的行整批切掉**：
 * 第一页拿到同 ts 的前 N 行之后，第二页 `end = ts` 直接回 0 行，同 ts 剩下的行与**其后所有数据**
 * 一起永久丢失（真机实测：80 行只取回 7 行）。
 *
 * 修法是把续页的右端写成 `cursor.endNs + 1ns`（既包含游标那个 ts，又把它之后的数据挡在外面），
 * 与 `slicePage` 里「丢掉同 ts 前 ordinalAtTs 行」的语义正好配套。
 */
export function plusOneNanoString(ns: string): string {
  return String(BigInt(ns) + 1n)
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

/**
 * 比较两个纳秒字符串（字符串长度可能不同，必须按 BigInt 比）。
 */
function compareNano(left: string, right: string): number {
  const a = BigInt(left)
  const b = BigInt(right)
  return a === b ? 0 : a > b ? 1 : -1
}

/** 行序比较器：ts → 内容键 → 流序号（与 rowsFromRange 同一口径，供补齐末组后重排用）。 */
function compareRows(direction: 'forward' | 'backward') {
  return (left: LokiRow, right: LokiRow): number => {
    const byTime = compareNano(left.tsNs, right.tsNs)
    if (byTime !== 0) return direction === 'forward' ? byTime : -byTime
    if (left.groupKey !== right.groupKey) return left.groupKey < right.groupKey ? -1 : 1
    return left.streamIdx - right.streamIdx
  }
}

/** 重编每个 ts 组内的序号（定序变了就得重编，否则 LogLine.id 会错位）。 */
function renumberGroups(rows: LokiRow[]): void {
  const seenAtTs = new Map<string, number>()
  for (const row of rows) {
    const ordinal = seenAtTs.get(row.tsNs) ?? 0
    row.ordinalInGroup = ordinal
    seenAtTs.set(row.tsNs, ordinal + 1)
  }
}

/**
 * 把 query_range 的返回体摊平成行，并给出**全局有序**。
 *
 * **组内按内容定序，不按响应位置**（loglens D03，2026-10-12 真机验收抓到）：Loki 返回的
 * 流次序与组内次序会随查询窗口变化，拿位置当坐标的续页必然丢行或重复。这里改成
 * 「ts → 内容键（标签 + 正文）」的定序，同一个 ts 组无论 Loki 怎么排，本层看到的次序都一样。
 */
export function rowsFromRange(body: LokiRangeBody, direction: 'forward' | 'backward'): LokiRow[] {
  const streams = body.data?.result
  if (!Array.isArray(streams)) return []
  const rows: LokiRow[] = []
  for (let streamIdx = 0; streamIdx < streams.length; streamIdx += 1) {
    const stream = streams[streamIdx]
    const labels = stream.stream === undefined ? {} : stream.stream
    const values = Array.isArray(stream.values) ? stream.values : []
    for (const pair of values) {
      if (!Array.isArray(pair) || pair.length < 2) continue
      const tsNs = pair[0]
      const line = pair[1]
      if (typeof tsNs !== 'string' || typeof line !== 'string') continue
      rows.push({ tsNs, streamIdx, line, labels, ordinalInGroup: 0, groupKey: contentKey(labels, line) })
    }
  }
  rows.sort((left, right) => {
    const byTime = compareNano(left.tsNs, right.tsNs)
    if (byTime !== 0) return direction === 'forward' ? byTime : -byTime
    // 同 ts：先按内容键（稳定、与响应位置无关），再按流序号兜底（内容完全相同的两行）
    if (left.groupKey !== right.groupKey) return left.groupKey < right.groupKey ? -1 : 1
    return left.streamIdx - right.streamIdx
  })
  // 序号在**定序之后**编：LogLine.id 靠它，所以它必须与内容绑定、跨页稳定。
  renumberGroups(rows)
  return rows
}

/** 建一个 Loki 后端。`options` 只为用例与日后的配置留口子，默认值就是线上口径。 */
export function createLokiBackend(options: LokiOptions = {}): LogBackend {
  const pagination = options.pagination === undefined ? LOKI_PAGINATION : options.pagination
  const maxPageSize = options.maxPageSize === undefined ? LOKI_DEFAULT_MAX_PAGE_SIZE : options.maxPageSize
  const maxWindowMs = options.maxWindowMs === undefined ? LOKI_DEFAULT_MAX_WINDOW_MS : options.maxWindowMs
  const timeoutMs = options.timeoutMs === undefined ? LOKI_TIMEOUT_MS : options.timeoutMs
  const fetchImpl = options.fetchImpl === undefined ? fetch : options.fetchImpl
  const label = '[loki]'

  /**
   * 一次 Loki 请求：出站围栏（src/net.ts：解析后的 IP 判定 / 不跟随重定向 / 体积与超时）+ 本层的
   * 「非 2xx 与不是 JSON 都算失败」。
   */
  async function callJson(target: LoglensTarget, url: string, init: RequestInit): Promise<unknown> {
    const response = await fetchJson({
      fetchImpl,
      label,
      url,
      init,
      timeoutMs,
      ...(options.lookupImpl === undefined ? {} : { lookupImpl: options.lookupImpl }),
    })
    if (!response.ok) {
      throw new Error(label + ' HTTP ' + String(response.status) + '：' + detailOf(response.body, response.text))
    }
    if (response.body === undefined) {
      const trimmed = response.text.trim()
      throw new Error(label + ' 返回的不是 JSON：' + (trimmed.length > 120 ? trimmed.slice(0, 120) + '…' : trimmed))
    }
    return response.body
  }

  /**
   * 打一次 query_range 并摊平成行（补齐末组时复用，免得把 URL 拼装抄第二遍）。
   * 窗口语义与主查询一致：start 闭、end 开（loglens D02）。
   */
  async function rangeRows(
    target: LoglensTarget,
    q: string,
    startNs: string,
    endNs: string,
    limit: number,
    direction: 'forward' | 'backward',
  ): Promise<LokiRow[]> {
    const params = new URLSearchParams()
    params.set('query', q === '' ? '{}' : q)
    params.set('start', startNs)
    params.set('end', endNs)
    params.set('limit', String(limit))
    params.set('direction', direction)
    const url = joinUrl(target.url, '/loki/api/v1/query_range') + '?' + params.toString()
    const body = (await callJson(target, url, { method: 'GET' })) as LokiRangeBody
    if (body.status !== undefined && body.status !== 'success') {
      throw new Error(label + ' 查询失败：' + detailOf(body, 'status=' + String(body.status)))
    }
    return rowsFromRange(body, direction)
  }

  return {
    id: 'loki',

    capabilities(): BackendCaps {
      return {
        queryLanguage: 'logql',
        /*
         * **跟随声明为 false**（2026-10-12 改）：`stream()` 还没实现（Loki 的 tail 是 **WebSocket**
         * `/loki/api/v1/tail`，要 `ws`），而这一位是给调用方看的「能不能持续跟随」——声明成 true
         * 等于撒谎，而且这一位**会被 `loglens_sources` 原样回给 agent**，它照着一个不存在的入口去挂，
         * 只会拿到「没实现」。
         *
         * 与下面 `aggregations` 同一条判据：**实现那天再改回来，并补用例**。守卫见
         * `test/capabilities.test.ts`——声明了 follow 就必须真的有 `stream()`（这一位原先是在
         * 还没写 `stream()` 时就声明成 true 的，属于「说了没做」）。路线图位置：P6 的 `tail`
         * （见 docs/design.md §6）。
         */
        follow: false,
        /*
         * **聚合声明为 false**（2026-10-11 改）：本适配器没有实现 facets（聚合要 LogQL 的指标查询，
         * 是另一件活），而这一位是给调用方看的「能不能按它分组统计」——声明成 true 等于撒谎，
         * 调用方会照着文案去试一个永远报错的入口。实现那天再改回来，并补用例。
         */
        aggregations: false,
        requiresTimeRange: true,
        fields: 'discovered',
        pagination,
        maxPageSize,
        maxWindowMs,
      }
    },

    /**
     * Loki 的标签清单本来就短（它是索引里的流标签，不是文档字段），所以这里不排序——
     * 形状与 ES 那侧统一：不传 `limit` 就是全列（ES 侧 2026-10-14 起同样如此），只在显式给了 limit 时才截。
     */
    async fields(target: LoglensTarget, options: FieldsOptions = {}): Promise<FieldsResult> {
      const body = await callJson(target, joinUrl(target.url, '/loki/api/v1/labels'), { method: 'GET' })
      const data = (body as { data?: unknown }).data
      if (!Array.isArray(data)) return { fields: [], total: 0, truncated: false }
      const names = data.filter((name): name is string => typeof name === 'string' && name !== '')
      const shown = options.limit === undefined ? names : names.slice(0, options.limit)
      return {
        fields: shown.map((name) => ({ name, kind: 'discovered' as const })),
        total: names.length,
        truncated: options.limit !== undefined && names.length > options.limit,
      }
    },

    async health(target: LoglensTarget): Promise<BackendHealth> {
      try {
        // 探测也走围栏：/ready 是本次查询真正要打的那个地址，绕开它等于留一条不打判据的出口
        const response = await fetchJson({
          fetchImpl,
          label,
          url: joinUrl(target.url, '/ready'),
          init: { method: 'GET' },
          timeoutMs,
          ...(options.lookupImpl === undefined ? {} : { lookupImpl: options.lookupImpl }),
        })
        const text = response.text.trim()
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
      // 窗口按方向给：游标只用于**同方向续页**（loglens D03）。
      // forward：从 boundaryNs 起（闭区间，靠内容指纹去重）；backward：到 boundaryNs 止（开区间）。
      if (skip !== undefined && skip.direction !== query.direction) {
        throw new Error(label + ' 游标方向与本次查询不一致（游标是 ' + skip.direction + '，查询是 ' + query.direction + '）：请重新发起查询')
      }
      const startNs = skip !== undefined && skip.direction === 'forward'
        // forward：跨过已完整交付的那一组（start 是闭区间，+1ns 才叫前进；直接传边界会原地踏步）
        ? maxNanoString(toNanoString(query.from), plusOneNanoString(skip.boundaryNs))
        : toNanoString(query.from)
      const endNs = skip !== undefined && skip.direction === 'backward'
        // backward：end 本就是开区间，传边界即天然跨过该组
        ? minNanoString(toNanoString(query.to), skip.boundaryNs)
        : toNanoString(query.to)
      params.set('start', startNs)
      params.set('end', endNs)
      params.set('limit', String(query.limit))
      params.set('direction', query.direction)
      const url = joinUrl(target.url, '/loki/api/v1/query_range') + '?' + params.toString()

      const body = (await callJson(target, url, { method: 'GET' })) as LokiRangeBody
      if (body.status !== undefined && body.status !== 'success') {
        throw new Error(label + ' 查询失败：' + detailOf(body, 'status=' + String(body.status)))
      }
      let rows = rowsFromRange(body, query.direction)
      let scannedRows = numberOrUndefined(body.data?.stats?.summary?.totalLinesProcessed)
      let scannedBytes = numberOrUndefined(body.data?.stats?.summary?.totalBytesProcessed)

      /*
       * **补齐末组**（loglens D03）：limit 可能正好切在一个同 ts 组中间，而组内次序在 Loki 上
       * 不稳定，所以「半组」不能当作一个完整的页交付。这里把末组整组单独再取一次，
       * 用整组替换掉那半组；下一页靠内容指纹把这一组整组丢掉。
       *
       * 只多打一次请求，且只在「末组可能被切开」时才打（返回行数达到 limit）。
       * 组大于 LOKI_GROUP_MAX 时**不假装完整**：照样交付，但下面不给游标（宁可报不完整）。
       */
      let groupCapped = false
      const lastRow = rows[rows.length - 1]
      if (pagination === 'cursor' && lastRow !== undefined && rows.length >= query.limit) {
        const groupRows = await rangeRows(target, query.q, lastRow.tsNs, plusOneNanoString(lastRow.tsNs), LOKI_GROUP_MAX, 'forward')
        if (groupRows.length > 0) {
          groupCapped = groupRows.length >= LOKI_GROUP_MAX
          rows = rows
            .filter((row) => row.tsNs !== lastRow.tsNs)
            .concat(groupRows)
            .sort(compareRows(query.direction))
          renumberGroups(rows)
          scannedRows = scannedRows === undefined ? undefined : scannedRows + groupRows.length
          scannedBytes = scannedBytes === undefined ? undefined : scannedBytes + groupRows.reduce((n, row) => n + row.line.length, 0)
        }
      }

      const slice = slicePage(rows, skip, query.limit, query.direction)

      const counts = countsOf({
        returned: slice.page.length,
        scannedRows,
        scannedBytes,
      })
      const lines: LogLine[] = slice.page.map((row) => lineFromLoki(row, row.ordinalInGroup))
      const result: LogQueryResult = {
        lines,
        counts,
        /*
         * Loki 这一路**没有精确总数**（`/query_range` 不报 total），所以 `slice.limited` 的含义
         * 本来就只是「到了 limit，可能还有」——归到 `maybeLimited` 那一档（第三十六刀）。
         *
         * `groupCapped` 是另一回事：末组大到补不齐，这一页**确定不完整**。它不是「可能还有更多」，
         * 而是「这一页自己有缺口」，所以留 `limited`（确定的那一档）——措辞上也不能混。
         */
        truncation: truncationOf({ limited: groupCapped, maybeLimited: slice.limited }),
      }
      // groupCapped：末组大到补不齐 → 不产出游标（宁可报「可能不完整」，也不给会丢行的游标）。
      if (pagination === 'cursor' && slice.next !== undefined && !groupCapped) {
        result.nextCursor = encodeCursor(slice.next)
      }
      return result
    },
  }
}

/** 进程内共用的那一个实例（无状态，配置都在调用参数里）。 */
export const lokiBackend: LogBackend = createLokiBackend()
