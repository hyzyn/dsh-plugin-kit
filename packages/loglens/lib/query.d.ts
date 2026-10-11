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
import type { BackendCaps, Direction, LogCounts, Truncation, TruncationReason } from './backends/types.js';
/** 默认返回条数（面板与 agent 工具的默认值都取它）。 */
export declare const DEFAULT_LIMIT = 100;
/** 不声明时间窗上限时的兜底（24 小时）。 */
export declare const DEFAULT_MAX_WINDOW_MS: number;
/**
 * 「只给了一端」时的兜底窗口：15 分钟。
 *
 * 为什么是它而不是 maxWindowMs（24 小时）：最常见的问法是「给我看最新的日志」，而 24 小时的
 * 尾部在昂贵的集群上是几万行——兜底该给一个**能读完**的量，宽窗留给调用方自己说明。
 */
export declare const FALLBACK_WINDOW_MS: number;
/** Agent / 面板给的原始参数（全部 unknown：校验在这一层做，调用方不用先判类型）。 */
export interface QueryInput {
    targetId?: unknown;
    q?: unknown;
    from?: unknown;
    to?: unknown;
    limit?: unknown;
    direction?: unknown;
    cursor?: unknown;
    filters?: unknown;
}
export interface NormalizeOptions {
    /** 当前时刻（毫秒）。注入是为了让「默认时间窗」的用例可确定地断言。 */
    now?: number;
    defaultLimit?: number;
}
export type NormalizeResult = {
    ok: true;
    query: NormalizedQueryLike;
    warnings: string[];
} | {
    ok: false;
    error: string;
};
/** 与契约里的 NormalizedQuery 同形（这里显式写出来，免得为了一个形状去 import 类型）。 */
export interface NormalizedQueryLike {
    targetId: string;
    q: string;
    from: number;
    to: number;
    limit: number;
    direction: Direction;
    cursor?: string;
    filters?: Record<string, string>;
}
/**
 * 归一化 + 夹取。**能夹的夹（limit），会改变语义的报错**（时间窗超上限、时间戳单位不对）——
 * 静默把时间窗截短会让「查到的就是全部」变成一句谎话。
 */
export declare function normalizeQuery(input: QueryInput, caps: BackendCaps, options?: NormalizeOptions): NormalizeResult;
/** ES 的命中总数关系：'gte' = 只是下界（没开 track_total_hits 时的常态）。 */
export type TotalRelation = 'eq' | 'gte';
export interface CountsInput {
    returned: number;
    matched?: number;
    scannedRows?: number;
    scannedBytes?: number;
    totalRelation?: TotalRelation;
}
/**
 * 归并计数。**totalKnown 只在真有精确总数时为真**：没有 matched、或 relation 是 'gte' 都算
 * 「matched 只是下界」。别把「不知道」写成「知道」——Agent 侧会拿它当分页与终止判据。
 */
export declare function countsOf(input: CountsInput): LogCounts;
/** 截断理由的**固定顺序**（同一个输入必须得到同一个数组，用例才好逐字断言）。 */
export declare const TRUNCATION_ORDER: readonly TruncationReason[];
export interface TruncationInput {
    /** 达到 limit（可能还有）——照 docker 的五计数口径，`limited` 就是「可能还有」。 */
    limited?: boolean;
    maxResultWindow?: boolean;
    partialShards?: boolean;
    timedOut?: boolean;
    scanCap?: boolean;
    byteCap?: boolean;
    cursorExpired?: boolean;
}
/** 归并截断信号：`truncated` 恒等于「至少有一条理由」，不给「有理由但 truncated=false」的态。 */
export declare function truncationOf(input: TruncationInput): Truncation;
