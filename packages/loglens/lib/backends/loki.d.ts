import type { LookupFn } from '../net.js';
import type { LogBackend, PaginationKind } from './types.js';
/** Loki 单页上限的默认声明（Loki 自己的默认是 100，这里放宽；再大要动服务端 max_entries_limit）。 */
export declare const LOKI_DEFAULT_MAX_PAGE_SIZE = 1000;
/** 时间窗上限的默认声明（7 天）：Loki 不限制，但一次拉 30 天只会得到一句谎话般的「就是全部」。 */
export declare const LOKI_DEFAULT_MAX_WINDOW_MS: number;
/** 单次请求超时（真机里卡住比报错更糟：面板会一直转圈）。 */
export declare const LOKI_TIMEOUT_MS = 15000;
/**
 * 补齐一个 ts 组时单次请求的上限（loglens D03）。
 *
 * 为什么要有上限：同一个纳秒理论上可以写任意多行。取 5000 是个**诚实的边界**——
 * 真超过它就不再假装这一组完整，而是让 `slicePage` 不产出游标（宁可报「命中可能不完整」，
 * 也不给一个会丢行的游标）。
 */
export declare const LOKI_GROUP_MAX = 5000;
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
export declare const LOKI_PAGINATION: PaginationKind;
export interface LokiOptions {
    pagination?: PaginationKind;
    maxPageSize?: number;
    maxWindowMs?: number;
    timeoutMs?: number;
    /** 注入点：默认全局 fetch；用例起一个监听本机端口的假 Loki，走真 HTTP。 */
    fetchImpl?: typeof fetch;
    /** 解析器注入点（出站围栏用）：用例喂假解析结果，验证「域名解析到链路本地」这类判据。 */
    lookupImpl?: LookupFn;
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
    /** 同 ts 组里按**内容定序**之后的第几行（从 0 起）：LogLine.id 靠它，**跨页也稳定**。 */
    ordinalInGroup: number;
    /** 内容键（标签 + 正文）：同 ts 组内的定序依据，也是「整组是否已交付」的指纹成分。 */
    groupKey: string;
}
/** epoch 毫秒 → 纳秒字符串（BigInt 走一遍，别用浮点乘）。 */
export declare function toNanoString(ms: number): string;
/** 取两个纳秒字符串里较早的那个（不能先换成 ms：亚毫秒边界会被磨掉，而边界正是「含它」的那条线）。 */
export declare function minNanoString(left: string, right: string): string;
/** 取两个纳秒字符串里较晚的那个（forward 续页把 start 推到游标边界时用）。 */
export declare function maxNanoString(left: string, right: string): string;
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
export declare function plusOneNanoString(ns: string): string;
/**
 * 把 query_range 的返回体摊平成行，并给出**全局有序**。
 *
 * **组内按内容定序，不按响应位置**（loglens D03，2026-10-12 真机验收抓到）：Loki 返回的
 * 流次序与组内次序会随查询窗口变化，拿位置当坐标的续页必然丢行或重复。这里改成
 * 「ts → 内容键（标签 + 正文）」的定序，同一个 ts 组无论 Loki 怎么排，本层看到的次序都一样。
 */
export declare function rowsFromRange(body: LokiRangeBody, direction: 'forward' | 'backward'): LokiRow[];
/** 建一个 Loki 后端。`options` 只为用例与日后的配置留口子，默认值就是线上口径。 */
export declare function createLokiBackend(options?: LokiOptions): LogBackend;
/** 进程内共用的那一个实例（无状态，配置都在调用参数里）。 */
export declare const lokiBackend: LogBackend;
export {};
