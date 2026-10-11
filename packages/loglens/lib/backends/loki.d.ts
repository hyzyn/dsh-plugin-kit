import type { LogBackend, PaginationKind } from './types.js';
/** Loki 单页上限的默认声明（Loki 自己的默认是 100，这里放宽；再大要动服务端 max_entries_limit）。 */
export declare const LOKI_DEFAULT_MAX_PAGE_SIZE = 1000;
/** 时间窗上限的默认声明（7 天）：Loki 不限制，但一次拉 30 天只会得到一句谎话般的「就是全部」。 */
export declare const LOKI_DEFAULT_MAX_WINDOW_MS: number;
/** 单次请求超时（真机里卡住比报错更糟：面板会一直转圈）。 */
export declare const LOKI_TIMEOUT_MS = 15000;
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
export declare const LOKI_PAGINATION: PaginationKind;
export interface LokiOptions {
    pagination?: PaginationKind;
    maxPageSize?: number;
    maxWindowMs?: number;
    timeoutMs?: number;
    /** 注入点：默认全局 fetch；用例起一个监听本机端口的假 Loki，走真 HTTP。 */
    fetchImpl?: typeof fetch;
}
/** Loki 的 query_range 返回体（只列我们用到的字段；多出来的原样忽略）。 */
interface LokiRangeBody {
    status?: string;
    data?: {
        resultType?: string;
        result?: Array<{
            stream?: Record<string, string>;
            values?: Array<[string, string]>;
        }>;
        stats?: {
            summary?: Record<string, unknown>;
        };
    };
    error?: string;
}
interface LokiRow {
    tsNs: string;
    streamIdx: number;
    line: string;
    labels: Record<string, string>;
    /** 同 ts 同流里的第几行（从 0 起）：LogLine.id 靠它，**跨页也稳定**。 */
    ordinalInGroup: number;
}
/** epoch 毫秒 → 纳秒字符串（BigInt 走一遍，别用浮点乘）。 */
export declare function toNanoString(ms: number): string;
/** 取两个纳秒字符串里较早的那个（不能先换成 ms：亚毫秒边界会被磨掉，而边界正是「含它」的那条线）。 */
export declare function minNanoString(left: string, right: string): string;
/** 把 query_range 的返回体摊平成行，并给出**全局有序**（同 ts 内按流序号、流内按出现次序）。 */
export declare function rowsFromRange(body: LokiRangeBody, direction: 'forward' | 'backward'): LokiRow[];
/** 建一个 Loki 后端。`options` 只为用例与日后的配置留口子，默认值就是线上口径。 */
export declare function createLokiBackend(options?: LokiOptions): LogBackend;
/** 进程内共用的那一个实例（无状态，配置都在调用参数里）。 */
export declare const lokiBackend: LogBackend;
export {};
