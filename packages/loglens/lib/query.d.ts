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
    /**
     * **确定还有更多**（`matched > limit`，或者 matched 只是下界但已达 limit）。
     *
     * 这个字段的语义在第三十六刀收紧过：它原来叫「可能还有」（照 docker 的五计数口径），
     * 而界面把「可能」渲染成了「已截断」——语气从推测变成了断言。现在两种情形分开：
     * 确定的走这里（`hit_limit`），只剩边界那种走下面的 `maybeLimited`。
     */
    limited?: boolean;
    /**
     * **可能还有**：返回行数刚好等于 limit，而总数恰好也是 limit（所以无从判断还有没有）。
     *
     * 为什么单列（真机实测的边界）：命中 53 条、条数上限也设 53 时，`lines.length >= limit`
     * 成立，旧判据就报「已截断：达到条数上限」——可实际一条没漏。更糟的是它会给出「下一页」，
     * 而翻过去必然是 **0 行**（真机验过），用户会以为系统坏了。
     *
     * 判据只能靠**精确总数**：`matched === limit` 时两边相等，分不出来。`totalKnown` 为假的来源
     * （Loki 没有总数）只能退回「可能」这一档——那正是它本来就该说的话。
     */
    maybeLimited?: boolean;
    maxResultWindow?: boolean;
    partialShards?: boolean;
    timedOut?: boolean;
    scanCap?: boolean;
    byteCap?: boolean;
    cursorExpired?: boolean;
}
/**
 * 「还有没有更多」的判据：把「确定还有」与「可能还有」分开（第三十六刀）。
 *
 * ## 为什么必须分开（真机实测的边界）
 *
 * 旧判据是 `lines.length >= limit` 一句话，于是**命中数恰好等于上限**时也报「已截断」：
 *
 *     limit=53, 命中 53 → returned 53, total 53 → 旧判据 limited=true  ← 一条都没漏
 *     limit=54, 命中 53 → returned 53, total 53 → limited=false          ← 正确
 *
 * 代价不止文案：那个判据同时决定**给不给「下一页」**（见 elastic.ts），而这一页之后真的没有了，
 * 翻过去是 **0 行**——用户会以为坏了。
 *
 * ## 判据
 *
 *   - 有**精确总数**（`totalKnown`，ES 显式 `track_total_hits: true` 才有）时：
 *     `matched > limit` → 确定还有；`matched === limit` → 可能还有；
 *     `matched < limit` → 确定没有了（这时 `returned` 也必然 < limit，除非后端自己吞了行）。
 *   - 没有精确总数（Loki、或 ES 回 `relation: gte`）时：只能说「到了 limit，可能还有」——
 *     这正是那一档存在的理由，别硬猜。
 *
 * 返回给 `truncationOf` 用的两个开关，界面据此说两种不同的句子。
 */
export declare function pageLimitFlags(input: {
    returned: number;
    limit: number;
    matched?: number;
    totalKnown?: boolean;
}): {
    limited: boolean;
    maybeLimited: boolean;
};
/** 归并截断信号：`truncated` 恒等于「至少有一条理由」，不给「有理由但 truncated=false」的态。 */
export declare function truncationOf(input: TruncationInput): Truncation;
