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
import type { LoglensTarget } from '../config.js';
import type { LookupFn } from '../net.js';
import type { LogBackend, LogLine } from './types.js';
export type ElasticFlavor = 'es' | 'os';
/** 单页上限的默认声明（深分页靠 search_after，所以这只是「一页多少行」）。 */
export declare const ES_DEFAULT_MAX_PAGE_SIZE = 500;
/** 时间窗上限的默认声明（24 小时）：再宽就该分段查，否则只会得到一句「大概就这些」。 */
export declare const ES_DEFAULT_MAX_WINDOW_MS: number;
/** 单次请求超时。 */
export declare const ES_TIMEOUT_MS = 20000;
/** 聚合的桶数上限：默认 10、硬上限 100（桶是给人看的，不是把整份基数拉回来）。 */
export declare const ES_DEFAULT_FACET_SIZE = 10;
export declare const ES_MAX_FACET_SIZE = 100;
/** 探测窗口：probe 时报「最近这么多分钟有多少条」。 */
export declare const ES_PROBE_WINDOW_MS: number;
/** PIT 的保活时长（每次查询都会续）。 */
export declare const ES_PIT_KEEP_ALIVE = "2m";
/** 时间字段：ES 里日志索引的惯例。换索引形态时改这里（日后进配置）。 */
export declare const ES_TIME_FIELD = "@timestamp";
/**
 * 高亮的两个标记：正文里**不可能出现**的控制字符（U+0001 / U+0002）。
 *
 * 为什么不用 `<em>` / `<mark>`：日志正文里本来就可能有这些字（HTML、堆栈里的标签），
 * 撞上就分不清哪个是引擎标的。控制字符在 JSON 里被转义、在正文里不会自然出现。
 */
export declare const HIGHLIGHT_PRE = "\u0001";
export declare const HIGHLIGHT_POST = "\u0002";
/** 宽类型族；认不出来的一律 `unknown`。 */
export declare function esTypeFamily(esType: string): string;
/**
 * 是不是 `object` / `nested` 这类**容器行**：它们自己没有值（值在子字段里），拿来分组或筛值只会打空。
 * Kibana 收尾也把它们剔掉（`!['object', 'nested'].includes(field.type)`）；真机实测 `*,-.*` 的
 * `_field_caps?fields=*` 会回 10 个这种行（`container` / `host` / `log` / `agent` / `ecs` … 200 个名字里）。
 * 判据是「**所有**类型都是容器」——某个名字既当过容器又当过叶子，那是字段本身的问题，不能顺手藏掉。
 */
export declare function isContainerRow(esTypes: readonly string[]): boolean;
/**
 * 「常用筛选项」：这些字段排在最前面（名单与 src/line.ts 的标签优先键同源，加几个 ES 侧的常见项）。
 * 判据是**排查时真的会拿它筛**，不是「名字好听」。
 */
export declare const PREFERRED_FIELDS: readonly string[];
/** 字段排序：优先键按名单顺序在前，其余按字母（同一份清单在两次调用里顺序必须一样）。 */
export declare function sortFieldNames(names: readonly string[]): string[];
export interface ElasticOptions {
    flavor: ElasticFlavor;
    fetchImpl?: typeof fetch;
    /** 解析器注入点（出站围栏用）：用例喂假解析结果，验证「域名解析到链路本地 / 公网」这类判据。 */
    lookupImpl?: LookupFn;
    timeoutMs?: number;
    maxPageSize?: number;
    maxWindowMs?: number;
    keepAlive?: string;
}
interface EsHit {
    _id?: unknown;
    _index?: unknown;
    _source?: unknown;
    sort?: unknown;
    highlight?: unknown;
}
/**
 * 默认索引表达式：`*,-.*`（**排除点号索引**）。
 *
 * 为什么不是裸 `*`（2026-10-11 真机反馈第 3 条）：一条只写 `http://host:9200` 的来源原本等于
 * 全集群通配，把 `.kibana_1` / `.infini_*` 这些系统索引也算进来——查询更慢、命中更噪、
 * 字段表被污染。点号索引是系统索引，不是日志；真要查它就显式写 index。
 */
export declare const ES_DEFAULT_INDEX = "*,-.*";
/**
 * 索引表达式，按**显式优先**的顺序解析：target.index（配置里写的）→ 地址的路径 → ES_DEFAULT_INDEX。
 *
 * 「路径即索引」保留是为了兼容旧配置，但它是一条暗号——所以 loglens_sources 会把**解析结果回显**
 * （见 scope()），让 agent 不必猜自己正在打哪个范围。
 */
export declare function targetIndex(target: LoglensTarget): string;
/**
 * 基址与认证头：`http://user:pass@host:9200` 的凭据换成 Basic 头，URL 本身**去掉凭据**
 * （响应文案与错误里都不该出现密码）。
 */
/**
 * 基址取 **origin**（scheme + host + port），**不带路径**：索引表达式由 targetIndex 单独给，两者在请求里
 * 各归各位。搜索走 /_search 而不是 /<index>/_search 是必需的——**PIT 与路径上的索引互斥**（ES 直接报错），
 * 分页要的是同一个快照，索引在开 PIT 时就已经定死了。
 */
export declare function targetAccess(target: LoglensTarget): {
    url: string;
    headers: Record<string, string>;
};
/**
 * 这是不是「游标过期」。
 *
 * PIT 有寿命，过期后 ES 回 404 的 `search_context_missing_exception`（OpenSearch 的说法略有不同，
 * 所以按几个片段匹配）。**刻意不把它当普通错误抛**：契约里 `cursor_expired` 与 `hit_limit` 是两个
 * 理由，Agent 侧看到它就该重新发一次带时间窗的查询，而不是以为「查完了」。
 */
export declare function looksLikeExpiredCursor(failure: {
    status: number;
    text: string;
    body: unknown;
}): boolean;
/** ISO 时间（ES 的 range 查询用 ISO 字符串最稳，纳秒精度不是这一层的事）。 */
export declare function isoOf(ms: number): string;
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
export declare function highlightRanges(fragment: unknown, message: string): Array<[number, number]>;
/** 一行文档 → LogLine。**时间解析不出来的行直接跳过**（它没法被 loglens_context 重查回来）。 */
export declare function lineFromHit(hit: EsHit): LogLine | undefined;
/** 这是不是「这台 ES 不认识 _shard_doc」。 */
export declare function looksLikeMissingShardDoc(failure: {
    status: number;
    text: string;
    body: unknown;
}): boolean;
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
export declare function shardFailureReasons(shards: unknown, limit?: number): string[];
/**
 * 一个字段该怎么打。**这就是 agent 猜 `.keyword` 那件事的归宿**（真机反馈第 2 条）：
 * 由适配器查一次 _field_caps 决定，而不是让调用方去记约定。
 */
export type FieldShape = 'native' | 'keyword' | 'text';
export declare function decideFieldShape(caps: Record<string, Record<string, {
    type?: unknown;
}>>, field: string): FieldShape;
export declare function createElasticBackend(options: ElasticOptions): LogBackend;
/** 进程内共用的两个实例（无状态，配置都在调用参数里）。 */
export declare const elasticsearchBackend: LogBackend;
export declare const opensearchBackend: LogBackend;
export {};
