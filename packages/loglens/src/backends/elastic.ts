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
import { countsOf, pageLimitFlags, truncationOf } from '../query.js'
import type {
  BackendCaps,
  BackendHealth,
  FacetsResult,
  FacetsSpec,
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
/** 聚合的桶数上限：默认 10、硬上限 100（桶是给人看的，不是把整份基数拉回来）。 */
export const ES_DEFAULT_FACET_SIZE = 10
export const ES_MAX_FACET_SIZE = 100
/** 探测窗口：probe 时报「最近这么多分钟有多少条」。 */
export const ES_PROBE_WINDOW_MS = 15 * 60 * 1000
/** PIT 的保活时长（每次查询都会续）。 */
export const ES_PIT_KEEP_ALIVE = '2m'
/** 时间字段：ES 里日志索引的惯例。换索引形态时改这里（日后进配置）。 */
export const ES_TIME_FIELD = '@timestamp'
/**
 * 高亮的两个标记：正文里**不可能出现**的控制字符（U+0001 / U+0002）。
 *
 * 为什么不用 `<em>` / `<mark>`：日志正文里本来就可能有这些字（HTML、堆栈里的标签），
 * 撞上就分不清哪个是引擎标的。控制字符在 JSON 里被转义、在正文里不会自然出现。
 */
export const HIGHLIGHT_PRE = '\u0001'
export const HIGHLIGHT_POST = '\u0002'
/** labels 的条数上限：日志文档的字段可能几十个，全塞进每行会把工具返回值撑爆。 */
const LABEL_LIMIT = 20
/*
 * 列字段**没有默认上限、也没有硬上限**（2026-10-14 对齐 Kibana：`_field_caps` 拿全量，长度交给界面
 * 的搜索框 / 分区 / 虚拟滚动去消化）。只有调用方显式传了 `limit` 才 slice——“要更多”不再是需要申请的事，
 * “默认被砍”也不再发生。
 */

/**
 * ES 原生类型 → **宽类型族**（Kibana `castEsToKbnFieldTypeName` 的同一条判据，只取我们需要的粒度）。
 *
 * 为什么要有这一层：`_field_caps` 对同一个名字会回**多个类型**（不同索引映射不同），而多类型并不都算问题——
 * `text` 与 `keyword` 都是字符串，Kibana 的原话是「ignore the conflict and carry on」。真正要说的是
 * **落到不同族**那一类：真机实测有个 `container.labels.*` 字段在部分索引是 `date`、部分是 `text`
 * （`date` / `string`），拿它分组只会覆盖一部分索引。
 *
 * 认不出来的类型统一归到 `unknown`（与 Kibana 一致：两个都没见过的类型不算互相冲突）。
 */
const ES_TYPE_FAMILY: Record<string, string> = {
  keyword: 'string', text: 'string', wildcard: 'string', constant_keyword: 'string',
  match_only_text: 'string', search_as_you_type: 'string', version: 'string',
  long: 'number', integer: 'number', short: 'number', byte: 'number', double: 'number',
  float: 'number', half_float: 'number', scaled_float: 'number', unsigned_long: 'number',
  token_count: 'number', rank_feature: 'number', rank_features: 'number', histogram: 'number',
  boolean: 'boolean',
  date: 'date', date_nanos: 'date',
  ip: 'ip',
  geo_point: 'geo', geo_shape: 'geo', point: 'geo', shape: 'geo',
  binary: 'binary',
  object: 'object', flattened: 'object', nested: 'nested',
}

/** 宽类型族；认不出来的一律 `unknown`。 */
export function esTypeFamily(esType: string): string {
  const family = ES_TYPE_FAMILY[esType]
  return family === undefined ? 'unknown' : family
}

/**
 * 是不是 `object` / `nested` 这类**容器行**：它们自己没有值（值在子字段里），拿来分组或筛值只会打空。
 * Kibana 收尾也把它们剔掉（`!['object', 'nested'].includes(field.type)`）；真机实测 `*,-.*` 的
 * `_field_caps?fields=*` 会回 10 个这种行（`container` / `host` / `log` / `agent` / `ecs` … 200 个名字里）。
 * 判据是「**所有**类型都是容器」——某个名字既当过容器又当过叶子，那是字段本身的问题，不能顺手藏掉。
 */
export function isContainerRow(esTypes: readonly string[]): boolean {
  return esTypes.length > 0 && esTypes.every((type) => type === 'object' || type === 'nested')
}

/**
 * 「常用筛选项」：这些字段排在最前面（名单与 src/line.ts 的标签优先键同源，加几个 ES 侧的常见项）。
 * 判据是**排查时真的会拿它筛**，不是「名字好听」。
 */
export const PREFERRED_FIELDS: readonly string[] = [
  'container.name', 'kubernetes.container.name', 'kubernetes.pod.name',
  'host.name', 'service.name', 'log.file.path', 'log.logger', 'stream',
  'kubernetes.namespace', 'container.image.name', 'kubernetes.node.name',
  'log.level', 'level', 'message', '@timestamp',
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
  highlight?: unknown
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

/**
 * 默认索引表达式：`*,-.*`（**排除点号索引**）。
 *
 * 为什么不是裸 `*`（2026-10-11 真机反馈第 3 条）：一条只写 `http://host:9200` 的来源原本等于
 * 全集群通配，把 `.kibana_1` / `.infini_*` 这些系统索引也算进来——查询更慢、命中更噪、
 * 字段表被污染。点号索引是系统索引，不是日志；真要查它就显式写 index。
 */
export const ES_DEFAULT_INDEX = '*,-.*'

/**
 * 索引表达式，按**显式优先**的顺序解析：target.index（配置里写的）→ 地址的路径 → ES_DEFAULT_INDEX。
 *
 * 「路径即索引」保留是为了兼容旧配置，但它是一条暗号——所以 loglens_sources 会把**解析结果回显**
 * （见 scope()），让 agent 不必猜自己正在打哪个范围。
 */
export function targetIndex(target: LoglensTarget): string {
  const explicit = typeof target.index === 'string' ? target.index.trim() : ''
  if (explicit !== '') return explicit
  try {
    const parsed = new URL(target.url)
    let path = parsed.pathname
    while (path.startsWith('/')) path = path.slice(1)
    while (path.endsWith('/')) path = path.slice(0, -1)
    return path === '' ? ES_DEFAULT_INDEX : path
  } catch {
    return ES_DEFAULT_INDEX
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

/**
 * 把 ES 的 highlight 片段转成 `message` 里的字符区间。
 *
 * ES 回的是**带标记的整段文本**（`number_of_fragments: 0` 时是全文）。这里只做一件事：
 * 把标记的位置换算回原文下标，然后**丢掉标记本身**——界面拿到的是区间，不是一段要
 * `dangerouslySetInnerHTML` 的 HTML（那会把日志正文当 HTML 执行）。
 *
 * ## 真机上量出来的两条 ES 行为（决定了这里的判据，别想当然）
 *
 * 第一条：**片段与原文字符相等，但不是同一个串**。实测 ES 7.10.2：
 *
 *     message   "... to ERROR\n"     ← 正文末尾有换行
 *     fragment  "... to \u0001ERROR"  ← 无换行，且**只有前标记**
 *
 * 所以「去掉标记后必须 === message」这种判据在真机上**一条都通过不了**（第一版就是这么写的，
 * 结果是所有行都没有高亮，看起来像功能没生效）。真正的判据是：**逐字符比对，标记只是插入**——
 * 片段去掉标记之后的**字符序列**必须是原文的**前缀**（ES 会裁掉末尾空白）。
 *
 * 第二条：**命中落在正文末尾时没有后标记**。上面那个 `\u0001ERROR` 就是，`post_tags` 不会来。
 * 不能当成「这段不算」丢掉——那恰好是最常见的一种命中（一行日志以错误级别词收尾）。
 * 未闭合的标记一律算「到片段结尾为止」，并且用上面那条前缀判据校验它落在原文的什么位置。
 *
 * 对不上就回空数组：**宁可不标，也不标错位置**——标错比不标更坏，用户会以为那是引擎认出来的。
 */
export function highlightRanges(fragment: unknown, message: string): Array<[number, number]> {
  if (typeof fragment !== 'string' || fragment === '') return []
  const ranges: Array<[number, number]> = []
  /*
   * 一边扫片段、一边在原文上取下标：`plain` 只用来累计「已经确认对上的前缀长度」，
   * 每吃一个普通字符就与原文同一位置的字符比一次——不一致立刻放弃（回空）。
   */
  let plain = 0
  let at = 0
  const mismatch = () => {
    ranges.length = 0
    return ranges
  }
  while (at < fragment.length) {
    const ch = fragment[at]
    if (ch === HIGHLIGHT_PRE) {
      const close = fragment.indexOf(HIGHLIGHT_POST, at + 1)
      // 未闭合 = 命中延伸到片段末尾（见上面第二条 ES 行为）
      const body = close === -1 ? fragment.slice(at + 1) : fragment.slice(at + 1, close)
      const start = plain
      for (const inner of body) {
        if (message[plain] !== inner) return mismatch()
        plain += 1
      }
      if (plain > start) ranges.push([start, plain])
      at = close === -1 ? fragment.length : close + 1
      continue
    }
    if (message[plain] !== ch) return mismatch()
    plain += 1
    at += 1
  }
  // 片段必须是原文的前缀（ES 会裁掉末尾空白，所以只比前缀，不比长度）
  if (plain > message.length) return []
  const merged: Array<[number, number]> = []
  for (const [start, end] of ranges) {
    if (start < 0 || end > message.length || end <= start) continue
    const last = merged[merged.length - 1]
    if (last !== undefined && start <= last[1]) {
      last[1] = Math.max(last[1], end)
      continue
    }
    merged.push([start, end])
  }
  return merged
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
  /*
   * 高亮只取 `message` 那一条：行里画的是 message，标在别处没有落点。
   * `highlight` 缺席（没发请求 / 这个字段没命中）就不带 `highlights` —— 界面据此不画，
   * 而不是退回去自己按字面猜。
   */
  const highlightField = typeof hit.highlight === 'object' && hit.highlight !== null
    ? (hit.highlight as Record<string, unknown>).message
    : undefined
  const fragment = Array.isArray(highlightField) ? highlightField[0] : highlightField
  const highlights = highlightRanges(fragment, message)
  const line: LogLine = {
    ts,
    message,
    ...(highlights.length === 0 ? {} : { highlights }),
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

/**
 * 把 `_shards.failures[].reason` 读成人话（**照抄 ES 的说法**，不自己编）。
 *
 * 为什么需要它（2026-10-18 真机抓到）：ES 对**分片级**错误回 `HTTP 200`，原因放在
 * `_shards.failures[].reason` 里。上一版只数了 `_shards.failed`、把它翻成 `partial_shards`，
 * 于是 `level:(ERROR`（少一个右括号）在界面上显示成「已截断：部分分片失败」+ 0 条——
 * 用户会去查索引和集群，而真正的原因是他自己写错了查询串。
 *
 * 返回去重后的前几条（同一条错误会在每个分片上各报一次，全列出来只会刷屏）。
 * 认不出的形状就原样 `JSON.stringify` 一小段——**看到机器的原话，比看到一句编好的分类词有用**。
 */
export function shardFailureReasons(shards: unknown, limit = 3): string[] {
  if (typeof shards !== 'object' || shards === null) return []
  const failures = (shards as { failures?: unknown }).failures
  if (!Array.isArray(failures)) return []
  const out: string[] = []
  for (const failure of failures) {
    if (out.length >= limit) break
    if (typeof failure !== 'object' || failure === null) continue
    const reason = (failure as { reason?: unknown }).reason
    let text = ''
    if (typeof reason === 'string') text = reason
    else if (typeof reason === 'object' && reason !== null) {
      const type = (reason as { type?: unknown }).type
      const detail = (reason as { reason?: unknown }).reason
      // ES 的 `reason` 是个对象：`type` 是机器可读的类，`reason` 是给人看的那句
      if (typeof detail === 'string' && detail !== '') text = detail
      else if (typeof type === 'string' && type !== '') text = type
      else text = JSON.stringify(reason).slice(0, 200)
    } else {
      text = JSON.stringify(failure).slice(0, 200)
    }
    text = text.trim()
    if (text !== '' && out.indexOf(text) === -1) out.push(text)
  }
  return out
}

/**
 * 一个字段该怎么打。**这就是 agent 猜 `.keyword` 那件事的归宿**（真机反馈第 2 条）：
 * 由适配器查一次 _field_caps 决定，而不是让调用方去记约定。
 */
export type FieldShape = 'native' | 'keyword' | 'text'

/**
 * 按「这个字段该怎么打」解析：
 *   - `native`：本身就是 keyword / 数值 / 布尔 → term 直接打；
 *   - `keyword`：是 text 且有 `.keyword` 子字段 → 打 `.keyword`；
 *   - `text`：是 text 且没有子字段 → **不能**用 term（分词后打全串永远匹配不上，那是静默撒谎），
 *     退回 match_phrase（近似匹配，语义在返回值里说明）。
 */
const NATIVE_TYPES = ['keyword', 'long', 'integer', 'short', 'byte', 'double', 'float', 'boolean', 'ip', 'date', 'date_nanos']

export function decideFieldShape(caps: Record<string, Record<string, { type?: unknown }>>, field: string): FieldShape {
  const entry = caps[field]
  if (entry === undefined || entry === null) return 'text'
  /*
   * _field_caps 的响应是 fields.<字段>.<类型>.…：**内层键就是类型名**（同一个字段在不同索引里
   * 类型不同时会并列出现），值里通常也带一份 type。两处都收，别只认一处。
   */
  const types = new Set<string>()
  for (const [key, value] of Object.entries(entry)) {
    types.add(key)
    if (typeof value?.type === 'string') types.add(value.type)
  }
  if (NATIVE_TYPES.some((type) => types.has(type))) return 'native'
  if (types.has('text')) return caps[field + '.keyword'] === undefined ? 'text' : 'keyword'
  return 'text'
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
   * 一次 ES / OS 请求：出站围栏（src/net.ts）在本层之下。
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

  /**
   * 字段形态的缓存（按 target.url + 字段）：一次查询里可能要解析好几个字段，别每次都问 _field_caps。
   * 缓存是**按进程**的，字段映射变了要重启——映射变化是运维动作，代价可接受（与 tiebreaker 同一权衡）。
   */
  const fieldShapeByTarget = new Map<string, FieldShape>()

  /** 问一次 _field_caps 决定怎么打这个字段。解析失败按 text 处理（保守：宁可退回 match_phrase）。 */
  async function fieldShape(target: LoglensTarget, access: { url: string, headers: Record<string, string> }, field: string): Promise<FieldShape> {
    const cacheKey = target.url + '|' + field
    const cached = fieldShapeByTarget.get(cacheKey)
    if (cached !== undefined) return cached
    let shape: FieldShape = 'text'
    try {
      const body = await callJson(target, joinUrl(access.url, '/' + targetIndex(target)
        + '/_field_caps?fields=' + encodeURIComponent(field) + ',' + encodeURIComponent(field + '.keyword')), {
        method: 'GET',
        headers: access.headers,
      })
      const caps = (body as { fields?: Record<string, Record<string, { type?: unknown }>> }).fields
      if (caps !== undefined && caps !== null) shape = decideFieldShape(caps, field)
    } catch {
      shape = 'text'
    }
    fieldShapeByTarget.set(cacheKey, shape)
    return shape
  }

  /** 结构化过滤：字段 → 值。形状决定用 term（打 .keyword）还是 match_phrase。 */
  async function filterClauses(
    target: LoglensTarget,
    access: { url: string, headers: Record<string, string> },
    filters: Record<string, string>,
  ): Promise<Array<Record<string, unknown>>> {
    const clauses: Array<Record<string, unknown>> = []
    for (const [field, value] of Object.entries(filters)) {
      const shape = await fieldShape(target, access, field)
      if (shape === 'keyword') clauses.push({ term: { [field + '.keyword']: value } })
      else if (shape === 'native') clauses.push({ term: { [field]: value } })
      else clauses.push({ match_phrase: { [field]: value } })
    }
    return clauses
  }

  /** 探测窗口内的条数（_count + 时间范围）。失败就回 undefined——「不知道」不写成 0。 */
  async function recentCount(
    target: LoglensTarget,
    access: { url: string, headers: Record<string, string> },
  ): Promise<{ windowMs: number, count: number } | undefined> {
    try {
      const to = Date.now()
      const from = to - ES_PROBE_WINDOW_MS
      const body = await callJson(target, joinUrl(access.url, '/' + targetIndex(target) + '/_count'), {
        method: 'POST',
        headers: { ...access.headers, 'content-type': 'application/json' },
        body: JSON.stringify({ query: { range: { [ES_TIME_FIELD]: { gte: isoOf(from), lte: isoOf(to) } } } }),
      })
      const count = (body as { count?: unknown }).count
      return typeof count === 'number' ? { windowMs: ES_PROBE_WINDOW_MS, count } : undefined
    } catch {
      return undefined
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
     * 列字段。**顺序与「看得出被截断」是硬要求**（真机反馈第 4 条）：这一版原来是裸的
     * `_field_caps?fields=*`，在一台全集群通配的来源上回了 45KB 的字段表（还混着 `.kibana` /
     * `.infini_*` 的系统索引字段），而 agent 拿到的是一份**看不出被截断**的清单——等于没给。
     *
     * 2026-10-14 修订（对齐 Kibana）：那时候的结论被读成了「所以砍到 80」，其实那条反馈要的是
     * **看得出**，不是「一律砍」。现在这里**默认不截断**（`_field_caps` 回来多少列多少，与 Kibana 同），
     * 只在调用方显式给了 `limit` 时才 slice；`total` / `truncated` 形状不变（设计 §3.2 的诚实口径）。
     */
    async fields(target: LoglensTarget, options: FieldsOptions = {}): Promise<FieldsResult> {
      const access = targetAccess(target)
      const index = targetIndex(target)
      const limit = options.limit
      const body = await callJson(target, joinUrl(access.url, '/' + index + '/_field_caps?fields=*'), {
        method: 'GET',
        headers: access.headers,
      })
      const fields = (body as { fields?: unknown }).fields
      if (typeof fields !== 'object' || fields === null) return { fields: [], total: 0, truncated: false }
      const caps = fields as Record<string, Record<string, { indices?: unknown } | undefined>>
      const esTypesOf = (name: string): string[] => Object.keys(caps[name] ?? {})
      const all = Object.keys(caps).filter((name) => !name.startsWith('_'))
      /*
       * 去掉 `X.keyword` 这类子字段行：**调用方根本不该写 .keyword**（适配器自己按 _field_caps 解析，
       * 见 filterClauses / facets）。真机实测：不过滤的话 187 个字段里有一串 .keyword 重复行，
       * 正是「字段表被污染」那一类噪声。
       */
      const names = all
        .filter((name) => !(name.endsWith('.keyword') && all.includes(name.slice(0, -'.keyword'.length))))
        // 容器行（object / nested）也剔掉——它没有自己的值，见 isContainerRow
        .filter((name) => !isContainerRow(esTypesOf(name)))
      const sorted = sortFieldNames(names)
      // 不传 limit = 全列（Kibana 口径）；传了才截，且截了就说（total / truncated）
      const shown = limit === undefined ? sorted : sorted.slice(0, limit)
      return {
        fields: shown.map((name) => {
          const esTypes = esTypesOf(name)
          const preferred = PREFERRED_FIELDS.includes(name) ? { preferred: true } : {}
          /*
           * 单类型不带 `esTypes`：那时候 `kind` 已经说完了。多类型才把类型摆出来，
           * 并且只在**落到不同宽类型族**时打 `conflict`（Kibana 的 `type: 'conflict'`）；
           * 同族的多类型（`text` + `keyword`）照样按普通字段列——Kibana 也不把它们当冲突。
           */
          if (esTypes.length <= 1) return { name, kind: 'indexed' as const, ...preferred }
          const families = new Set(esTypes.map((type) => esTypeFamily(type)))
          if (families.size <= 1) return { name, kind: 'indexed' as const, esTypes, ...preferred }
          const conflictDescriptions: Record<string, string[]> = {}
          for (const type of esTypes) {
            const indices = caps[name][type]?.indices
            conflictDescriptions[type] = Array.isArray(indices) ? indices.map((item) => String(item)) : []
          }
          return { name, kind: 'indexed' as const, esTypes, conflict: true, conflictDescriptions, ...preferred }
        }),
        total: names.length,
        truncated: limit !== undefined && sorted.length > limit,
      }
    },

    /**
     * 聚合：按字段分组（terms）/ 按时间分桶（date_histogram）。
     *
     * 真机反馈第 2 条：agent 要回答「哪个服务在报错」只能出去 curl。这里把两件事做进来，并且
     * **把聚合的近似性也如实回传**：terms 的 `sum_other_doc_count`（没列出来的桶还有多少条）与
     * `doc_count_error_upper_bound`（计数误差上界）都是这层必须报的信号——不然又是一次「看起来是全部」。
     *
     * 另外回一个**只给执行层看**的 `totalHits`（loglens D07）：0 桶既可能是字段空壳、也可能是窗口里
     * 没日志，而这一层是唯一拿得到判据的地方；它不进 facets 的返回值（理由见 FacetsResult.totalHits）。
     */
    async facets(query: NormalizedQuery, target: LoglensTarget, spec: FacetsSpec): Promise<FacetsResult> {
      const access = targetAccess(target)
      const size = spec.size === undefined ? ES_DEFAULT_FACET_SIZE : Math.min(spec.size, ES_MAX_FACET_SIZE)
      const aggs: Record<string, unknown> = {}
      if (spec.by !== undefined && spec.by !== '') {
        const shape = await fieldShape(target, access, spec.by)
        if (shape === 'text') {
          throw new Error(prefix + '字段 ' + spec.by + ' 是 text 且没有 .keyword 子字段：terms 聚合没法按它分组'
            + '（换一个字段，或给索引加 keyword 子字段；也可以先用 filters 加 match_phrase 近似筛）')
        }
        aggs.by = { terms: { field: shape === 'keyword' ? spec.by + '.keyword' : spec.by, size } }
      }
      if (spec.interval !== undefined && spec.interval !== '') {
        // min_doc_count: 1 —— 没数据的桶不发出来（返回的是「有日志的那些时间点」，不是「日历」）
        aggs.over_time = { date_histogram: { field: ES_TIME_FIELD, fixed_interval: spec.interval, min_doc_count: 1 } }
      }
      if (Object.keys(aggs).length === 0) {
        throw new Error(prefix + 'facets 至少要给 by（按字段分组）或 interval（按时间分桶）之一')
      }
      const conditions: Array<Record<string, unknown>> = [
        { range: { [ES_TIME_FIELD]: { gte: isoOf(query.from), lte: isoOf(query.to) } } },
        ...(query.filters === undefined ? [] : await filterClauses(target, access, query.filters)),
      ]
      /*
       * `track_total_hits`（loglens D07）：**只在真需要那个判据时才开**。
       *
       * 为什么聚合请求原本写死 false：`size: 0` 的聚合只回桶，没人要总数；而精确计数要跨分片数一遍
       * 全部命中，在大索引上是有代价的——不为一个用不上的数字付这笔钱。
       *
       * 为什么 `by` 时就该付：0 桶有两种成因（这个字段一条有值的都没有 vs. 这段时间压根没日志），
       * 而区分它们的唯一判据就是「窗口内命中数」。没有它，执行层只能把 0 桶原样回报——调用方于是
       * 白烧一轮去猜「是字段空还是窗口空」。所以按需开：**传了 by 才要这个判据**，只按时间分桶
       * （interval）时聚合结果自己就说明了有没有日志，照旧 false。
       */
      const wantsTotal = spec.by !== undefined && spec.by !== ''
      const body = {
        size: 0,
        track_total_hits: wantsTotal,
        query: { bool: { must: query.q === '' ? [{ match_all: {} }] : [{ query_string: { query: query.q } }], filter: conditions } },
        aggs,
      }
      /*
       * 聚合**必须自己带上索引表达式**（loglens D08）：它与 query 路不一样——query 先开 PIT，之后
       * `search_after` 的搜索走裸 `/_search`（PIT 已经绑定了索引集，再带路径反而是错的）；而 facets
       * 不开 PIT，裸打 `/_search` 等于**全集群**通配，`.kibana_*` / 别的应用索引会一起被聚合进来。
       * 后果是同一张卡片里「榜 / 时间分布」与「行」来自不同的数据集，而界面上看不出来。
       */
      const payload = await callJson(target, joinUrl(access.url, '/' + targetIndex(target) + '/_search'), {
        method: 'POST',
        headers: { ...access.headers, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const root = payload as {
        hits?: { total?: { value?: unknown, relation?: unknown } },
        aggregations?: {
          by?: { buckets?: Array<{ key?: unknown, doc_count?: unknown }>, sum_other_doc_count?: unknown, doc_count_error_upper_bound?: unknown }
          over_time?: { buckets?: Array<{ key?: unknown, doc_count?: unknown }> }
        }
      }
      const result: FacetsResult = {}
      /*
       * 窗口内命中数（供执行层判「字段是空壳」还是「窗口里没日志」）：`relation` 的语义与 countsOf
       * 同一口径——'gte' 是下界（近似），所以带 `basis` 一起报，别把一个下界说成精确值。
       */
      const totalValue = root.hits?.total?.value
      if (typeof totalValue === 'number') {
        const lowerBound = root.hits?.total?.relation === 'gte'
        result.totalHits = { value: totalValue, relation: lowerBound ? 'gte' : 'eq', basis: lowerBound ? 'lower_bound' : 'exact' }
      }
      const byBuckets = root.aggregations?.by?.buckets
      if (Array.isArray(byBuckets)) {
        result.buckets = byBuckets.map((bucket) => ({
          key: bucket.key === undefined ? '' : String(bucket.key),
          count: typeof bucket.doc_count === 'number' ? bucket.doc_count : 0,
        }))
        const other = root.aggregations?.by?.sum_other_doc_count
        if (typeof other === 'number' && other > 0) result.otherCount = other
        const error = root.aggregations?.by?.doc_count_error_upper_bound
        if (typeof error === 'number' && error > 0) result.countErrorUpperBound = error
      }
      const timeBuckets = root.aggregations?.over_time?.buckets
      if (Array.isArray(timeBuckets)) {
        result.overTime = timeBuckets
          .filter((bucket) => typeof bucket.key === 'number')
          .map((bucket) => ({ ts: bucket.key as number, count: typeof bucket.doc_count === 'number' ? bucket.doc_count : 0 }))
      }
      return result
    },

    /** 这条来源覆盖的范围（工具面回显用：省得 agent 猜「路径即索引」这条暗号）。 */
    scope(target: LoglensTarget): string {
      return targetIndex(target)
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
        })
        if (!response.ok) return { ok: false, detail: 'HTTP ' + String(response.status) + '：' + response.text.slice(0, 120) }
        const body = response.body
        const version = (body as { version?: { number?: unknown; distribution?: unknown } } | undefined)?.version
        const number = typeof version?.number === 'string' ? version.number : '未知版本'
        const distribution = typeof version?.distribution === 'string' ? version.distribution : undefined
        const actual = distribution === undefined ? 'elasticsearch' : distribution
        const mismatch = actual !== (flavor === 'os' ? 'opensearch' : 'elasticsearch')
        // 版本读得到就算活着；distribution 与声明的 flavor 不一致要说出来（方言差异会咬人）
        const detail = number + '（' + actual + (mismatch ? '：与来源类型不一致，查询方言可能有差异' : '') + '）'
        /*
         * 顺带数一下「最近 15 分钟有多少条」：只回一句「活着」等于没回答「这条来源里有没有我要的数据」
         * （真机反馈第 3 条）。数不出来（没有权限 / 不是 count 能答的索引）就不写这一格。
         */
        const recent = await recentCount(target, access)
        return recent === undefined ? { ok: true, detail } : { ok: true, detail, recent }
      } catch (error) {
        return { ok: false, detail: error instanceof Error ? error.message : String(error) }
      }
    },

    async query(query: NormalizedQuery, target: LoglensTarget): Promise<LogQueryResult> {
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

      /*
       * 结构化过滤（真机反馈第 2 条）：通道早就在契约里（query.ts 的 filters），只是适配器当初直接抛
       * 「暂不支持」，而工具面又没暴露——于是 agent 只能手写 Lucene 的 字段.keyword:"值" 去猜约定。
       * 现在按 _field_caps 决定怎么打（term / .keyword / match_phrase），判据在 filterClauses。
       */
      const conditions: Array<Record<string, unknown>> = [
        { range: { [ES_TIME_FIELD]: { gte: isoOf(query.from), lte: isoOf(query.to) } } },
        ...(query.filters === undefined ? [] : await filterClauses(target, access, query.filters)),
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
      /*
       * 正文里的**命中位置**由 ES 自己标（2026-10-18 维护者看图后要的「类似于这样的高亮」）。
       *
       * 为什么不让前端拿查询串去匹配：查询串是 Lucene，`stream:stderr` 里没有半个字出现在正文、
       * `-failed` 是**排除**、`error*` / `~` / 短语各有各的匹配规则。前端照字面标，位置会错一半，
       * 而**标错比不标更坏**——用户会以为那是引擎认出来的命中。
       *
       * `number_of_fragments: 0` 要的是**整段正文**（默认只回一句片段，我们行里画的是全文）；
       * 标签用两个正文里不可能出现的控制字符，避免和日志自己的 `<em>` 之类撞上。
       */
      if (query.q !== '') {
        body.highlight = {
          fields: { message: { number_of_fragments: 0, pre_tags: [HIGHLIGHT_PRE], post_tags: [HIGHLIGHT_POST] } },
        }
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

      const root = payload as { hits?: { hits?: unknown; total?: unknown }; timed_out?: unknown; _shards?: { failed?: unknown; failures?: unknown } }
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
      /*
       * 「还有没有更多」走**共用判据**（src/query.ts 的 pageLimitFlags），不再是一句
       * `lines.length >= limit`：那个在「命中恰好等于上限」时会误报截断、还给出一个翻过去必然
       * 空页的「下一页」（真机实测，第三十六刀）。
       *
       * `totalKnown` 由 relation 决定：只有 `track_total_hits: true` 且 ES 回 `eq` 时 matched 才是
       * 精确的——`gte` 时它只是个下界，那时只能说「可能还有」。
       */
      const limitFlags = pageLimitFlags({
        returned: lines.length,
        limit: query.limit,
        ...(matched === undefined ? {} : { matched }),
        totalKnown: matched !== undefined && relation !== 'gte',
      })
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
          limited: limitFlags.limited,
          maybeLimited: limitFlags.maybeLimited,
          timedOut: root.timed_out === true,
          partialShards: failedShards > 0,
        }),
        /*
         * 分片失败时**把 ES 的原话带上**（2026-10-18 真机抓到的那条）：
         * 光说「部分分片失败」，`level:(ERROR` 这种少一个括号的查询串与真的分片故障长得一样，
         * 而后者用户该找运维、前者该改自己那行字。原话是唯一能分开这两件事的东西。
         */
        ...(failedShards > 0 ? (() => {
          const reasons = shardFailureReasons(root._shards)
          return reasons.length === 0
            ? {}
            : { warnings: reasons.map((reason) => '[分片] ' + reason) }
        })() : {}),
      }
      /*
       * 游标只在**确定还有**时才给（`limited`，不是 `maybeLimited`）。
       *
       * 「可能还有」那一档意味着「命中数恰好等于上限」，即这一页已经覆盖了全部命中——
       * 再给游标，用户点「下一页」得到的是空页（真机验过）。宁可不给，也不给一个必然为空的入口。
       */
      if (limitFlags.limited && Array.isArray(lastSort)) {
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
