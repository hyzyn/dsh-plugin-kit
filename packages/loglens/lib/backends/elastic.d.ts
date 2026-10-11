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
/** PIT 的保活时长（每次查询都会续）。 */
export declare const ES_PIT_KEEP_ALIVE = "2m";
/** 时间字段：ES 里日志索引的惯例。换索引形态时改这里（日后进配置）。 */
export declare const ES_TIME_FIELD = "@timestamp";
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
}
/** 索引表达式：取地址的路径部分；没写就用通配（ES 8 没有 `_all` 了）。 */
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
/** 一行文档 → LogLine。**时间解析不出来的行直接跳过**（它没法被 loglens_context 重查回来）。 */
export declare function lineFromHit(hit: EsHit): LogLine | undefined;
/** 这是不是「这台 ES 不认识 _shard_doc」。 */
export declare function looksLikeMissingShardDoc(failure: {
    status: number;
    text: string;
    body: unknown;
}): boolean;
export declare function createElasticBackend(options: ElasticOptions): LogBackend;
/** 进程内共用的两个实例（无状态，配置都在调用参数里）。 */
export declare const elasticsearchBackend: LogBackend;
export declare const opensearchBackend: LogBackend;
export {};
