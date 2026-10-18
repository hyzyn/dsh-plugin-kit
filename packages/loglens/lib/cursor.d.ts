/**
 * @hyzyn/dsh-loglens — 游标（P1 地基，Loki 形态 + ES 形态）。
 *
 * 为什么不能像别处那样「下一页从最旧那条再往前一格」：**同一 stream 同一纳秒多行是合法的**
 * （Loki 的时间戳精度是 ns，同一批写入会共用一个 ts）。若下一页用
 * `end = 最旧 ts − 1ns`，切在**同值批中间**的那几行就**永久丢了**——不是「少几条」，
 * 是再也查不回来（设计 §3.3）。
 *
 * **P1 的第一版设计（靠「同 ts 第几行」续页）在真机上被证伪**（loglens D03，2026-10-12）：
 * 它假定「同一 stream、同一 ts 内多行的返回顺序稳定」，而真 Loki 上：
 *   ① 流在响应里的**次序**会随查询窗口变化；
 *   ② `limit` 切在同纳秒组中间时，Loki 交回的那几行**跨查询会变**。
 * 于是「第几行」根本不是稳定坐标：续页要么原地重复第一页（真机实测 41 页 280 行、只有 7 行唯一），
 * 要么丢行。
 *
 * **现行设计：按「完整 ts 组」翻页**。不再用组内位置当坐标，只用 ts 本身：
 * 每页照常按 limit 取，若取满则说明**末组可能被切开**，就把那一组的整组单独补齐，
 * 然后下一页从「该组之后」开始（forward 用 `ts+1ns` 当闭区间左端；backward 用 `ts` 当开区间右端）。
 * 真机验证：limit 取 1 / 3 / 7 / 11 / 13 / 25 × forward / backward 共 12 组全部不丢不重
 * （见 ROADMAP 的 P2 真机验收一节；2026-10-18 对这行做了对账，此前写的是 3/7/11/13/40）。
 *
 * 组内次序由**内容**定（标签 + 正文），不看响应位置——这样同一个 ts 组无论 Loki 怎么排，
 * 本层看到的次序都一样，`LogLine.id` 才跨页稳定。
 */
import type { LogLine } from './backends/types.js';
/** 游标版本：形态变了就升版本，解不开的老游标按 invalid 处理（不猜）。 */
export declare const CURSOR_VERSION = 1;
export interface LokiCursor {
    v: number;
    /**
     * 下一页的窗口边界（纳秒字符串，Loki 原生就是字符串，避免 Number 精度问题）。
     *
     * **语义按方向分**（loglens D02/D03）：forward 时下一页的 `start` 取 `boundaryNs + 1ns`
     * ——因为这一组已经**完整**交付过，跨过它才叫前进（Loki 的 start 是闭区间，直接传 boundaryNs
     * 会把整组再取一遍，而那一遍会把 limit 全吃掉，于是续页永远原地踏步：真机实测 page1 = 0 行）；
     * backward 时下一页的 `end` 取 `boundaryNs`（Loki 的 end 本就是开区间，天然跨过该组）。
     */
    boundaryNs: string;
    /** 方向：游标只在同方向续页时有意义，换了方向必须重新发起查询。 */
    direction: 'forward' | 'backward';
}
/**
 * 后端返回的一行。
 *
 * `groupKey` 是**内容键**（标签 + 正文）：同一个 ts 组内用它定序，而不是用响应位置。
 * D03 之后位置不再被当作坐标。
 */
export interface OrderedRow {
    tsNs: string;
    groupKey: string;
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
/**
 * 一个 ts 组的**内容指纹**：`ts` + 组内每行的内容键（排序后拼起来）。
 *
 * 用途是**用例与排查**：证明「同一个组无论组内次序怎么变，指纹都一样」。
 * 分页本身靠 `boundaryNs + 1ns` 前进，不再依赖指纹去重（那版设计在真机上原地踏步）。
 */
export declare function groupFingerprint(tsNs: string, groupKeys: readonly string[]): string;
/**
 * 按「完整 ts 组」切页（loglens D03 之后的新坐标）。
 *
 * 输入是后端这次返回的行（已按 ts + 内容键定序）。规则：
 *   - 取一页；
 *   - **末组补全**：组是切不开的——半组交付会让续页丢行，所以末组整组一起交付
 *     （页因此可以略超 limit，这是刻意取舍）；
 *   - 末组在本次返回里完整时才产出游标；边界是末组的 ts，
 *     由调用方按方向解释（forward → `ts + 1ns` 当 start；backward → `ts` 当 end）。
 */
export declare function slicePage<T extends OrderedRow>(rows: T[], cursor: LokiCursor | undefined, limit: number, direction: 'forward' | 'backward'): SliceResult<T>;
export interface SliceResult<T extends OrderedRow> {
    /** 这一页要展示的行（已丢掉边界上重复的那几行）。 */
    page: T[];
    /** 下一页的游标（页非空、且末组完整时给）。 */
    next?: LokiCursor;
    /** 达到 limit：**可能还有**（照 docker 的 `limited` 口径，不是「确定还有」）。 */
    limited: boolean;
    /** 因为游标丢掉了多少行（用例与真机排查都靠它）。 */
    skipped: number;
}
/**
 * 把 Loki 返回的 `[tsNs, line]` 对转成 LogLine。
 *
 * **`id` 与 `source` 不再含流序号**（loglens D03）：流序号来自响应次序，而那个次序跨查询会变，
 * 拿它拼 id 会让同一个 ts 组在续页时算出不同的 id（去重失效、重复行）。现在用
 * 「ts + 组内内容序」——内容序由 `rowsFromRange` 按内容定，跨页稳定。
 *
 * 级别：Loki 3.x 会带 `detected_level` 标签，有的部署把 `level` 放在流标签里——**有就用它**；
 * 都没有才从正文推断，并标出 levelInferred（真机反馈第 7 条）。
 */
export declare function lineFromLoki(row: {
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
