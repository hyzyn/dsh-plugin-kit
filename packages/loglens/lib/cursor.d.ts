/**
 * @hyzyn/dsh-loglens — 游标（P1 地基，Loki 形态）。
 *
 * 为什么不能像别处那样「下一页从最旧那条再往前一格」：**同一 stream 同一纳秒多行是合法的**
 * （Loki 的时间戳精度是 ns，同一批写入会共用一个 ts）。若下一页用
 * `end = 最旧 ts − 1ns`，切在**同值批中间**的那几行就**永久丢了**——不是「少几条」，
 * 是再也查不回来（设计 §3.3）。
 *
 * 所以游标带三件事：`endNs`（下次查询的窗口右端，**含**边界）、`streamIdx`（哪个流）、
 * `ordinalAtTs`（该 ts 上该流的前几行已经返回过，重查时丢掉）。
 *
 * 保守退路：这套玩法预设「同一 stream、同一 ts 内多行的返回顺序稳定」。P2 会用真机单独测
 * 顺序稳定性；测不出来就把 Loki 的能力声明成 pagination: 'none'，只回「命中可能不完整」——
 * **诚实报不完整，好过给一个会丢行的游标**。
 */
import type { LogLine } from './backends/types.js';
/** 游标版本：形态变了就升版本，解不开的老游标按 invalid 处理（不猜）。 */
export declare const CURSOR_VERSION = 1;
export interface LokiCursor {
    v: number;
    /** 下次查询的窗口右端（纳秒字符串，Loki 原生就是字符串，避免 Number 精度问题）。 */
    endNs: string;
    /** 流序号：同一个 ts 上可能有多条流，序号来自后端这次的返回顺序。 */
    streamIdx: number;
    /** 该 ts 该流已经返回过的行数（重查时从头丢弃这么多行）。 */
    ordinalAtTs: number;
}
/** 后端返回的一行（`slicePage` 只认这三个字段，其余原样带出去）。 */
export interface OrderedRow {
    tsNs: string;
    streamIdx: number;
}
export declare function encodeCursor(cursor: LokiCursor): string;
export type CursorState = {
    kind: 'none';
} | {
    kind: 'ok';
    cursor: LokiCursor;
} | {
    kind: 'invalid';
    reason: string;
};
/**
 * 解析游标。**解不开就说解不开**（invalid 带原因），不回落成「当作没有游标」——
 * 那会让「续页」悄悄变成「重头再来」，用户看到的是重复行而不是一条错误。
 */
export declare function decodeCursor(text: unknown): CursorState;
export interface SliceResult<T extends OrderedRow> {
    /** 这一页要展示的行（已丢掉边界上重复的那几行）。 */
    page: T[];
    /** 下一页的游标（页非空时给；Loki 因此不需要「limit + 1」探针）。 */
    next?: LokiCursor;
    /** 达到 limit：**可能还有**（照 docker 的 `limited` 口径，不是「确定还有」）。 */
    limited: boolean;
    /** 因为游标丢掉了多少行（用例与真机排查都靠它）。 */
    skipped: number;
}
/**
 * 切页：喂「后端这次按序返回的全部行」+「上一页的游标」+ limit。
 *
 * 丢掉的规则刻意写成「同 ts、同流、前 ordinalAtTs 行」而不是「ts 小于等于某值」：
 * 后者会把同 ts 上**还没返回过**的行一起丢掉——那正是这套游标要避免的丢行。
 */
export declare function slicePage<T extends OrderedRow>(rows: T[], cursor: LokiCursor | undefined, limit: number): SliceResult<T>;
/** 把 Loki 返回的 `[tsNs, line]` 对转成 LogLine（`id` 稳定：同 ts 同流同序号只算一行）。 */
export declare function lineFromLoki(row: OrderedRow & {
    tsNs: string;
    line: string;
    labels?: Record<string, string>;
}, ordinalInGroup: number): LogLine;
/** ES / OpenSearch 的游标：PIT + search_after（`_shard_doc` 做 tiebreaker）。 */
export interface SearchAfterCursor {
    v: number;
    /** 标明这是哪一种游标：解错适配器的游标时不许「凑合着用」。 */
    kind: 'es';
    /** PIT（point in time）的 id：分页要的是**同一个快照**，不是「每次都重新开始」。 */
    pitId: string;
    /** 上一页最后一行的 sort 数组（原样回传）。 */
    searchAfter: unknown[];
}
export type SearchAfterCursorState = {
    kind: 'none';
} | {
    kind: 'ok';
    cursor: SearchAfterCursor;
} | {
    kind: 'invalid';
    reason: string;
};
export declare function encodeSearchAfterCursor(cursor: SearchAfterCursor): string;
/**
 * 解析 ES / OpenSearch 的游标。与 Loki 那份同款判据：**解不开就说解不开**，不回落成「当作没有游标」
 * ——那会把「续页」悄悄变成「重头再来」，用户看到的是重复行而不是一条错误。
 */
export declare function decodeSearchAfterCursor(text: unknown): SearchAfterCursorState;
/**
 * ES 游标与 Loki 游标共用一个版本号常量：两份形态各带 `kind`，拿错适配器的游标会在 decode 时被拒。
 * （放在这里而不是各写一个常量——版本号是「形态变更」的信号，两边各写一份迟早漂。）
 */
