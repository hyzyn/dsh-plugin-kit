/**
 * @hyzyn/dsh-loglens — Elasticsearch / OpenSearch 适配器（P4）。
 *
 * 两家的差异只在**方言与版本号**，查询面是同一条 `_search`，所以是一个适配器 + `flavor` 分流
 * （设计 §2）。这里同样是薄层：夹取与校验在 src/query.ts、游标形态在 src/cursor.ts。
 *
 * 三条要点：
 *   1. **分页走 PIT + search_after**：分的是**同一个快照**。PIT 有寿命，过期时报 `cursor_expired`
 *      并**不静默重开**（重开会悄悄换掉快照语义）——见设计 §3.3。
 *   2. **`track_total_hits` 由适配器显式打开**：本工具要报精确命中数，代价（跨分片精确计数）由这
 *      一层承担；响应里的 `relation` 仍然是 'gte' 时，countsOf 会如实把 totalKnown 置假（设计 §3.2）。
 *   3. **索引表达式取自来源地址的路径**（如 `http://127.0.0.1:9200/logs-*`），没写路径就用 `*`。
 *      地址里的 user:pass 换成 Basic 认证头，**不进 URL**（别把凭据写进日志与错误文案）。
 */
import type { LoglensTarget } from '../config.js'
import { decodeSearchAfterCursor, encodeSearchAfterCursor } from '../cursor.js'
import type { SearchAfterCursor } from '../cursor.js'
import { flattenLabels, withLevel } from '../line.js'
import { requestJson as fetchJson } from '../net.js'
import type { LookupFn } from '../net.js'
import { countsOf, truncationOf } from '../query.js'
import type {
  BackendCaps,
  BackendHealth,
  FieldInfo,
  FieldsOptions,
  FieldsResult,
  LogBackend,
  LogLine,
  LogQueryResult,
  NormalizedQuery,
} from './types.js'

export type ElasticFlavor = 'es' | 'os'

/** 单页上限的默认声明（深分页靠 search_after，所以这只是「一页多少行」）。 */
export const ES_DEFAULT_MAX_PAGE_SIZE = 500
/** 时间窗上限的默认声明（24 小时）：再宽就该分段查，否则只会得到一句「大概就这些」。 */
export const ES_DEFAULT_MAX_WINDOW_MS = 24 * 60 * 60 * 1000
/** 单次请求超时。 */
export const ES_TIMEOUT_MS = 20_000
/** PIT 的保活时长（每次查询都会续）。 */
export const ES_PIT_KEEP_ALIVE = '2m'
/** 时间字段：ES 里日志索引的惯例。换索引形态时改这里（日后进配置）。 */
export const ES_TIME_FIELD = '@timestamp'
/** labels 的条数上限：日志文档的字段可能几十个，全塞进每行会把工具返回值撑爆。 */
const LABEL_LIMIT = 20
/** 列字段的默认上限（真机反馈：45KB 的字段表等于没给）。 */
export const ES_DEFAULT_FIELD_LIMIT = 80
/** 列字段的硬上限：工具面再要也不能越过它（一次返回值撑爆上下文比少列几个字段糟得多）。 */
export const ES_MAX_FIELD_LIMIT = 200

/**
 * 「常用筛选项」：这些字段排在最前面（名单与 src/line.ts 的标签优先键同源，加几个 ES 侧的常见项）。
 * 判据是**排查时真的会拿它筛**，不是「名字好听」。
 */
export const PREFERRED_FIELDS: readonly string[] = [
  'container.name', 'kubernetes.container.name', 'kubernetes.pod.name',
  'host.name', 'service.name', 'log.file.path', 'log.logger', 'stream',
  'kubernetes.namespace', 'container.image.name', 'kubernetes.node.name',
  'log.level', 'level', 'message', '@timestamp',
  'container.name.keyword', 'host.name.keyword', 'service.name.keyword',
]

/** 字段排序：优先键按名单顺序在前，其余按字母（同一份清单在两次调用里顺序必须一样）。 */
export function sortFieldNames(names: readonly string[]): string[] {
  const rest = names.filter((name) => !PREFERRED_FIELDS.includes(name)).sort()
  return [...PREFERRED_FIELDS.filter((name) => names.includes(name)), ...rest]
}

export interface ElasticOptions {
  flavor: ElasticFlavor
  fetchImpl?: typeof fetch
  /** 解析器注入点（出站围栏用）：用例喂假解析结果，验证「域名解析到链路本地 / 公网」这类判据。 */
  lookupImpl?: LookupFn
  timeoutMs?: number
  maxPageSize?: number
  maxWindowMs?: number
  keepAlive?: string
}

interface EsHit {
  _id?: unknown
  _index?: unknown
  _source?: unknown
  sort?: unknown
}

interface HttpFailure {
  status: number
  text: string
  body: unknown
}

/** 请求失败的载体（带上 status 与 body：`cursor_expired` 的判定要看它们）。 */
class ElasticHttpError extends Error {
  readonly status: number
  readonly text: string
  readonly body: unknown
  constructor(message: string, failure: HttpFailure) {
    super(message)
    this.name = 'ElasticHttpError'
    this.status = failure.status
    this.text = failure.text
    this.body = failure.body
  }
}

function joinUrl(base: string, path: string): string {
  let trimmed = base
  while (trimmed.endsWith('/')) trimmed = trimmed.slice(0, -1)
  return trimmed + path
}

/** 索引表达式：取地址的路径部分；没写就用通配（ES 8 没有 `_all` 了）。 */
export function targetIndex(target: LoglensTarget): string {
  try {
    const parsed = new URL(target.url)
    let path = parsed.pathname
    while (path.startsWith('/')) path = path.slice(1)
    while (path.endsWith('/')) path = path.slice(0, -1)
    return path === '' ? '*' : path
  } catch {
    return '*'
  }
}

/**
 * 基址与认证头：`http://user:pass@host:9200` 的凭据换成 Basic 头，URL 本身**去掉凭据**
 * （响应文案与错误里都不该出现密码）。
 */
/**
 * 基址取 **origin**（scheme + host + port），**不带路径**：索引表达式由 targetIndex 单独给，两者在请求里
 * 各归各位。搜索走 /_search 而不是 /<index>/_search 是必需的——**PIT 与路径上的索引互斥**（ES 直接报错），
 * 分页要的是同一个快照，索引在开 PIT 时就已经定死了。
 */
export function targetAccess(target: LoglensTarget): { url: string; headers: Record<string, string> } {
  try {
    const parsed = new URL(target.url)
    const headers: Record<string, string> = {}
    if (parsed.username !== '') {
      const raw = decodeURIComponent(parsed.username) + ':' + decodeURIComponent(parsed.password)
      headers.authorization = 'Basic ' + Buffer.from(raw, 'utf8').toString('base64')
      parsed.username = ''
      parsed.password = ''
    }
    return { url: parsed.origin, headers }
  } catch {
    return { url: target.url, headers: {} }
  }
}

function detailOf(body: unknown, fallback: string): string {
  if (typeof body === 'object' && body !== null) {
    const record = body as Record<string, unknown>
    const reason = (() => {
      const error = record.error
      if (typeof error === 'string') return error
      if (typeof error === 'object' && error !== null) {
        const inner = error as Record<string, unknown>
        if (typeof inner.reason === 'string') {
          const caused = inner.caused_by
          if (typeof caused === 'object' && caused !== null && typeof (caused as Record<string, unknown>).reason === 'string') {
            return inner.reason + '（' + String((caused as Record<string, unknown>).reason) + '）'
          }
          return inner.reason
        }
        if (typeof inner.type === 'string') return inner.type
      }
      return undefined
    })()
    if (reason !== undefined) return reason
  }
  const text = fallback.trim()
  return text.length > 200 ? text.slice(0, 200) + '…' : text
}

/**
 * 这是不是「游标过期」。
 *
 * PIT 有寿命，过期后 ES 回 404 的 `search_context_missing_exception`（OpenSearch 的说法略有不同，
 * 所以按几个片段匹配）。**刻意不把它当普通错误抛**：契约里 `cursor_expired` 与 `hit_limit` 是两个
 * 理由，Agent 侧看到它就该重新发一次带时间窗的查询，而不是以为「查完了」。
 */
export function looksLikeExpiredCursor(failure: { status: number; text: string; body: unknown }): boolean {
  const haystack = (failure.text + ' ' + JSON.stringify(failure.body === undefined ? {} : failure.body)).toLowerCase()
  if (haystack.includes('search_context_missing')) return true
  if (haystack.includes('search context is missing')) return true
  if (haystack.includes('no search context')) return true
  if (haystack.includes('no such pit')) return true
  if (haystack.includes('point in time') && haystack.includes('not found')) return true
  return failure.status === 404 && haystack.includes('search_phase_execution_exception')
}

/** ISO 时间（ES 的 range 查询用 ISO 字符串最稳，纳秒精度不是这一层的事）。 */
export function isoOf(ms: number): string {
  return new Date(ms).toISOString()
}

function numberField(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value !== '' && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

/** 一行文档 → LogLine。**时间解析不出来的行直接跳过**（它没法被 loglens_context 重查回来）。 */
export function lineFromHit(hit: EsHit): LogLine | undefined {
  const source = typeof hit._source === 'object' && hit._source !== null ? (hit._source as Record<string, unknown>) : {}
  const rawTime = source[ES_TIME_FIELD] === undefined ? source.timestamp : source[ES_TIME_FIELD]
  const ts = typeof rawTime === 'string' ? Date.parse(rawTime) : typeof rawTime === 'number' ? rawTime : Number.NaN
  if (!Number.isFinite(ts)) return undefined
  const message = typeof source.message === 'string' ? source.message : JSON.stringify(source)
  /*
   * labels 走**展平 + 优先键**（src/line.ts）：filebeat 的 container / host / agent / log 全是嵌套对象，
   * 早先那版只收标量，于是行上唯一的标签是 stream——看不出是哪台机器、哪个容器（真机反馈第 1 条）。
   * 级别同理：文档里有 log.level / level 就用它，没有才从正文推断，并标出是推断来的（第 7 条）。
   */
  const line: LogLine = {
    ts,
    message,
    source: typeof hit._index === 'string' ? hit._index : '',
    labels: flattenLabels(source, { limit: LABEL_LIMIT }),
    raw: JSON.stringify(source),
    id: typeof hit._id === 'string' ? hit._id : '',
  }
  return withLevel(line, [source.level, source['log.level'], source.severity])
}

/**
 * 分页的 tiebreaker。
 *
 * _shard_doc 是 **7.12 起**才有的特殊排序字段；7.10 / 7.11 上它会被当成普通字段，回
 * 「No mapping found for [_shard_doc]」（2026-10-11 在真实的 7.10.2 上实测）。那时候退到 _id：
 * 它是真字段、可排序（同一台机器上实测可用），能保证 search_after 有确定的全序。
 */
type Tiebreaker = '_shard_doc' | '_id'

/** 这是不是「这台 ES 不认识 _shard_doc」。 */
export function looksLikeMissingShardDoc(failure: { status: number; text: string; body: unknown }): boolean {
  const haystack = (failure.text + ' ' + JSON.stringify(failure.body === undefined ? {} : failure.body)).toLowerCase()
  return haystack.includes('_shard_doc') && haystack.includes('no mapping found')
}

export function createElasticBackend(options: ElasticOptions): LogBackend {
  const flavor = options.flavor
  /** 按目标记住这台 ES 的 tiebreaker 探测结果：第一次吃到「不认识 _shard_doc」就换 _id，之后不再白试。 */
  const tiebreakerByTarget = new Map<string, Tiebreaker>()
  const label = flavor === 'os' ? '[opensearch]' : '[elasticsearch]'
  const prefix = label + ' '
  const fetchImpl = options.fetchImpl === undefined ? fetch : options.fetchImpl
  const timeoutMs = options.timeoutMs === undefined ? ES_TIMEOUT_MS : options.timeoutMs
  const maxPageSize = options.maxPageSize === undefined ? ES_DEFAULT_MAX_PAGE_SIZE : options.maxPageSize
  const maxWindowMs = options.maxWindowMs === undefined ? ES_DEFAULT_MAX_WINDOW_MS : options.maxWindowMs
  const keepAlive = options.keepAlive === undefined ? ES_PIT_KEEP_ALIVE : options.keepAlive

  /**
   * 一次 ES / OS 请求：出站围栏（src/net.ts）在本层之下，allowPublic 跟着**这条来源**走。
   *
   * 与 Loki 那侧的区别只在失败形状：ES 的失败响应**要读 body**（游标过期的判定就在里面），
   * 所以这里把 status / text / body 原样包进 ElasticHttpError 交给上层分类。
   */
  async function callJson(target: LoglensTarget, url: string, init: RequestInit): Promise<unknown> {
    const response = await fetchJson({
      fetchImpl,
      label,
      url,
      init,
      timeoutMs,
      ...(options.lookupImpl === undefined ? {} : { lookupImpl: options.lookupImpl }),
      ...(target.allowPublic === true ? { allowPublic: true } : {}),
    })
    if (!response.ok) {
      throw new ElasticHttpError(prefix + 'HTTP ' + String(response.status) + '：' + detailOf(response.body, response.text), {
        status: response.status,
        text: response.text,
        body: response.body,
      })
    }
    if (response.body === undefined) {
      const trimmed = response.text.trim()
      throw new Error(prefix + '返回的不是 JSON：' + (trimmed.length > 120 ? trimmed.slice(0, 120) + '…' : trimmed))
    }
    return response.body
  }

  async function openPit(access: { url: string; headers: Record<string, string> }, index: string, target: LoglensTarget): Promise<string> {
    const url = joinUrl(access.url, '/' + index + '/_pit') + '?keep_alive=' + keepAlive
    const body = await callJson(target, url, { method: 'POST', headers: access.headers })
    /*
     * PIT 的响应键随版本改过名：**7.10 是 pit_id**，7.12+ 才是 id（2026-10-11 在一台真实的 7.10.2 上实测：
     * 打开 PIT 回的是 {"pit_id": "..."}，而我只读 id → 报「没拿到 id」）。两个都认，别按版本号分支——
     * 这条请求本来就把答案带着回来了。
     */
    const raw = body as { id?: unknown; pit_id?: unknown }
    const id = typeof raw.id === 'string' && raw.id !== '' ? raw.id : raw.pit_id
    if (typeof id !== 'string' || id === '') {
      throw new Error(prefix + '打开 PIT 没拿到 id（这一版的分页依赖 PIT；响应里既没有 id 也没有 pit_id）')
    }
    return id
  }

  async function closePit(access: { url: string; headers: Record<string, string> }, pitId: string, target: LoglensTarget): Promise<void> {
    // 尽力而为：关不掉不该把一次成功的查询变成失败（PIT 也会自己过期）
    try {
      await callJson(target, joinUrl(access.url, '/_pit'), {
        method: 'DELETE',
        headers: { ...access.headers, 'content-type': 'application/json' },
        body: JSON.stringify({ id: pitId }),
      })
    } catch {
      /* 忽略 */
    }
  }

  return {
    id: flavor === 'os' ? 'opensearch' : 'elasticsearch',

    capabilities(): BackendCaps {
      return {
        // 方言：两边都是 Lucene 的 query_string 家族；PPL（OS）/ ES|QL（ES 8.11+）还没做，别谎报
        queryLanguage: 'lucene',
        flavor,
        follow: false,
        aggregations: true,
        requiresTimeRange: true,
        fields: 'indexed',
        pagination: 'cursor',
        maxPageSize,
        maxWindowMs,
      }
    },

    /**
     * 列字段。**必须带上限与顺序**（真机反馈第 4 条）：这一版原来是裸的 _field_caps?fields=*，
     * 在一台全集群通配的来源上回了 45KB 的字段表（还混着 .kibana / .infini_* 的系统索引字段），
     * 而 agent 拿到的是一份**看不出被截断**的清单——等于没给。
     *
     * 现在：去掉 ES 内部字段（下划线开头）、优先键排前面、按上限截断，并把 total / truncated
     * 一起回给调用方（设计 §3.2 的诚实口径同样适用于字段表）。
     */
    async fields(target: LoglensTarget, options: FieldsOptions = {}): Promise<FieldsResult> {
      const access = targetAccess(target)
      const index = targetIndex(target)
      const limit = options.limit === undefined ? ES_DEFAULT_FIELD_LIMIT : options.limit
      const body = await callJson(target, joinUrl(access.url, '/' + index + '/_field_caps?fields=*'), {
        method: 'GET',
        headers: access.headers,
      })
      const fields = (body as { fields?: unknown }).fields
      if (typeof fields !== 'object' || fields === null) return { fields: [], total: 0, truncated: false }
      const names = Object.keys(fields as Record<string, unknown>).filter((name) => !name.startsWith('_'))
      const sorted = sortFieldNames(names)
      return {
        fields: sorted.slice(0, limit).map((name) => ({
          name,
          kind: 'indexed' as const,
          ...(PREFERRED_FIELDS.includes(name) ? { preferred: true } : {}),
        })),
        total: names.length,
        truncated: sorted.length > limit,
      }
    },

    async health(target: LoglensTarget): Promise<BackendHealth> {
      const access = targetAccess(target)
      try {
        // 探测也走围栏：绕开它等于留一条不打判据的出口
        const response = await fetchJson({
          fetchImpl,
          label,
          url: joinUrl(access.url, '/'),
          init: { method: 'GET', headers: access.headers },
          timeoutMs,
          ...(options.lookupImpl === undefined ? {} : { lookupImpl: options.lookupImpl }),
          ...(target.allowPublic === true ? { allowPublic: true } : {}),
        })
        if (!response.ok) return { ok: false, detail: 'HTTP ' + String(response.status) + '：' + response.text.slice(0, 120) }
        const body = response.body
        const version = (body as { version?: { number?: unknown; distribution?: unknown } } | undefined)?.version
        const number = typeof version?.number === 'string' ? version.number : '未知版本'
        const distribution = typeof version?.distribution === 'string' ? version.distribution : undefined
        const actual = distribution === undefined ? 'elasticsearch' : distribution
        const mismatch = actual !== (flavor === 'os' ? 'opensearch' : 'elasticsearch')
        // 版本读得到就算活着；distribution 与声明的 flavor 不一致要说出来（方言差异会咬人）
        return { ok: true, detail: number + '（' + actual + (mismatch ? '：与来源类型不一致，查询方言可能有差异' : '') + '）' }
      } catch (error) {
        return { ok: false, detail: error instanceof Error ? error.message : String(error) }
      }
    },

    async query(query: NormalizedQuery, target: LoglensTarget): Promise<LogQueryResult> {
      if (query.filters !== undefined && Object.keys(query.filters).length > 0) {
        throw new Error(prefix + '暂不支持结构化 filters：请把条件写进查询串')
      }
      const access = targetAccess(target)
      const order = query.direction === 'forward' ? 'asc' : 'desc'
      let cursor: SearchAfterCursor | undefined
      if (query.cursor !== undefined) {
        const state = decodeSearchAfterCursor(query.cursor)
        if (state.kind === 'invalid') throw new Error(prefix + '游标解不开（' + state.reason + '）：请重新发起查询')
        if (state.kind === 'ok') cursor = state.cursor
      }
      // 只有第一页才开 PIT：带游标时**复用**同一个快照，过期就报过期（绝不偷偷重开）
      const pitId = cursor === undefined ? await openPit(access, targetIndex(target), target) : cursor.pitId

      const conditions: Array<Record<string, unknown>> = [
        { range: { [ES_TIME_FIELD]: { gte: isoOf(query.from), lte: isoOf(query.to) } } },
      ]
      const tiebreaker: Tiebreaker = tiebreakerByTarget.get(target.url) === undefined
        ? '_shard_doc'
        : (tiebreakerByTarget.get(target.url) as Tiebreaker)
      const must = query.q === '' ? [{ match_all: {} }] : [{ query_string: { query: query.q } }]
      const body: Record<string, unknown> = {
        size: query.limit,
        // 显式打开：要报精确命中数就得付这个代价（设计 §3.2 的归属）
        track_total_hits: true,
        query: { bool: { must, filter: conditions } },
        sort: [{ [ES_TIME_FIELD]: { order, unmapped_type: 'date' } }, { [tiebreaker]: order }],
        pit: { id: pitId, keep_alive: keepAlive },
      }
      if (cursor !== undefined) body.search_after = cursor.searchAfter

      const runSearch = async (): Promise<unknown> => callJson(target, joinUrl(access.url, '/_search'), {
        method: 'POST',
        headers: { ...access.headers, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })

      let payload: unknown
      try {
        payload = await runSearch()
      } catch (error) {
        // 7.10 / 7.11 不认识 _shard_doc：换成 _id 再来一次，并把这台 ES 的选择记住
        if (error instanceof ElasticHttpError && tiebreaker === '_shard_doc' && looksLikeMissingShardDoc(error)) {
          tiebreakerByTarget.set(target.url, '_id')
          body.sort = [{ [ES_TIME_FIELD]: { order, unmapped_type: 'date' } }, { _id: order }]
          payload = await runSearch()
        } else if (error instanceof ElasticHttpError && looksLikeExpiredCursor(error)) {
          return {
            lines: [],
            counts: countsOf({ returned: 0 }),
            truncation: truncationOf({ cursorExpired: true }),
          }
        } else {
          throw error
        }
      }

      /*
       * 7.10 的 `_shard_doc` 失败**不是 4xx**：ES 回 200 + `_shards.failed` + 空 hits（默认
       * allow_partial_search_results）。所以除了上面那条 catch，这里还要看响应体：失败原因里点着
       * `_shard_doc` + `No mapping found` 就说明这台的 tiebreaker 该换 `_id`，重来一次并记住。
       * （2026-10-11 在真实的 7.10.2 上实测：第一次 200 但 hits 空、_shards.failed>0；换成 _id 后
       * 命中数、分片失败 0。）
       */
      if (tiebreaker === '_shard_doc') {
        const shards = (payload as { _shards?: unknown })._shards
        const failedShards = typeof shards === 'object' && shards !== null && typeof (shards as { failed?: unknown }).failed === 'number'
          ? (shards as { failed: number }).failed
          : 0
        if (failedShards > 0 && looksLikeMissingShardDoc({ status: 200, text: '', body: shards })) {
          tiebreakerByTarget.set(target.url, '_id')
          body.sort = [{ [ES_TIME_FIELD]: { order, unmapped_type: 'date' } }, { _id: order }]
          payload = await runSearch()
        }
      }

      const root = payload as { hits?: { hits?: unknown; total?: unknown }; timed_out?: unknown; _shards?: { failed?: unknown } }
      const rawHits = Array.isArray(root.hits?.hits) ? (root.hits.hits as EsHit[]) : []
      const lines: LogLine[] = []
      for (const hit of rawHits) {
        const line = lineFromHit(hit)
        if (line !== undefined) lines.push(line)
      }
      const total = root.hits?.total
      const matched = typeof total === 'number'
        ? total
        : typeof total === 'object' && total !== null && typeof (total as { value?: unknown }).value === 'number'
          ? ((total as { value: number }).value)
          : undefined
      const relation = typeof total === 'object' && total !== null && (total as { relation?: unknown }).relation === 'gte' ? 'gte' : 'eq'
      const failedShards = typeof root._shards?.failed === 'number' ? root._shards.failed : 0
      const limited = query.limit > 0 && lines.length >= query.limit
      const lastHit = rawHits[rawHits.length - 1]
      const lastSort = lastHit === undefined ? undefined : lastHit.sort

      const result: LogQueryResult = {
        lines,
        counts: countsOf({
          returned: lines.length,
          ...(matched === undefined ? {} : { matched }),
          totalRelation: relation,
        }),
        truncation: truncationOf({
          limited,
          timedOut: root.timed_out === true,
          partialShards: failedShards > 0,
        }),
      }
      if (limited && Array.isArray(lastSort)) {
        result.nextCursor = encodeSearchAfterCursor({ v: 1, kind: 'es', pitId, searchAfter: lastSort })
      } else {
        // 这一页就是最后了（不管它是不是带游标来的）：把 PIT 关掉，省得它挂到过期
        await closePit(access, pitId, target)
      }
      return result
    },
  }
}

/** 进程内共用的两个实例（无状态，配置都在调用参数里）。 */
export const elasticsearchBackend: LogBackend = createElasticBackend({ flavor: 'es' })
export const opensearchBackend: LogBackend = createElasticBackend({ flavor: 'os' })
