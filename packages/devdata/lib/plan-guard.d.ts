/**
 * 查询计划护栏：**在语句真正跑起来之前**拦掉全表扫描。
 *
 * ## 为什么这是 agent 场景里最值的一道护栏
 *
 * agent 的典型失败模式不是「写错」，而是**忘记加 `WHERE` 的 SELECT**——它不改变任何东西，
 * 所以只读护栏完全放行，代价却是把一个测试库扫穿（`161` 上是共享联调环境，同事也在用）。
 * 行数上限只限制**回来的**行数，不限制**扫描的**行数——两者不是一回事。
 *
 * ## 判据的诚实边界
 *
 * 这里做的是**按计划文本分类**，不是解析计划树。所以：
 *   - 不认识的行 → `unknown`。**NONE 计划一律拒**（「拿不到计划」等于「不知道代价」，
 *     而不知道代价就放行，等于没有护栏）；
 *   - 引擎不支持取计划（`explain` 不可用）→ **拒**，不是「跳过护栏」。理由同上；
 *   - 阈值是**上限**，不是目标：`rows` 与 `cost` 超阈值即拒，并把 plan 附在拒绝里
 *     （让 agent **一轮**就能修好，而不是靠它自己再猜一次）。
 *
 * 这一层与行数上限（`sql.ts` 的 `effectiveLimit`）是**两个不同的问题**：一个管扫描面，
 * 一个管返回面。缺任何一个都有真实的失败模式。
 */
import type { Engine } from './operations.js';
/** 代价估算结果。 */
export interface PlanEstimate {
    /** 估算扫描行数（取不到就是 `undefined`）。 */
    rows?: number;
    /** 估算代价（取不到就是 `undefined`）。 */
    cost?: number;
}
/** 计划分类。 */
export type PlanVerdict = {
    kind: 'full-scan';
    detail: string;
} | {
    kind: 'indexed';
} | {
    kind: 'constant';
} | {
    kind: 'unknown';
    detail: string;
};
/**
 * 阈值（策略值；**候选不得抬高**，与行数上限同一口径）。
 *
 * 三个字段都是**可选**的，且「未配置 ≠ 零容忍」：不配 `maxRows` 表示不做行数检查，
 * 配 `maxRows: 0` 才是「一行都不许」。两者语义不同，不能混成一个「非法值」。
 * 全表扫描与「认不出的计划」**不受阈值影响**——那两条无论怎么配都拒。
 */
export interface PlanThresholds {
    /** 允许的最大估算扫描行数；**不填 = 不做这一层检查**，填 0 = 一行都不许。 */
    maxRows?: number;
    /** 允许的最大估算代价；不填 / 非正数 = 不做这一层检查。 */
    maxCost?: number;
}
/** 一次护栏判定的结果。 */
export type PlanGuardDecision = {
    allowed: true;
    verdict: PlanVerdict;
    estimate: PlanEstimate;
} | {
    allowed: false;
    code: PlanRejectionCode;
    message: string;
    hint: string;
    verdict?: PlanVerdict;
    estimate?: PlanEstimate;
};
/** 拒绝码（本地枚举；与 `rejection.ts` 的全局码分开——那些是裁决层的，这些是执行前的）。 */
export type PlanRejectionCode = 'FULL_SCAN' | 'COST_TOO_HIGH' | 'PLAN_UNAVAILABLE' | 'PLAN_UNRECOGNIZED';
/**
 * 分类一份计划文本。`engine` 影响**少数几条**判据，见下。
 *
 * **逐行判**（而不是整份文本一次判）：计划里常常同时有「索引查一张小表」与「全扫一张大表」，
 * 整份一起判会把结论变得取决于哪一行先被匹配到。
 *
 * ## 顺序是契约：**先认全量，再认便宜**
 *
 * 反过来的话，一行里同时出现两种信号时结论会取决于哪张正则表先被查到——而 `Using index`
 * （MySQL 的覆盖索引）**既是「便宜」信号又是「不走全量」的排除条件**，顺序错了它就永远没机会生效。
 *
 * ## 为什么需要 `engine`：同一个词在不同引擎里代价相反
 *
 * `Index Scan` 在 **PostgreSQL** 里既用于「扫全表」也用于「走索引定位一行」——`EXPLAIN` 行结构相同，
 * **赢面不在操作名，在估算行数**。而 **SQL Server** 的 `Index Scan`（没有 seek）与 **MySQL** 的
 * `type: index`（没带 `Using index`）都是「扫全量」的可靠信号。
 *
 * 传 `undefined` 时只认那些在所有引擎里都成立的信号（`Seq Scan` / `Table Scan` / `type: ALL`）——
 * 按名字误判 PG 的正常查询，比漏放一条更接近「把工具用得不能要」。
 */
export declare function classifyPlan(planText: string, engine?: Engine): PlanVerdict;
/**
 * 从计划文本里抽估算行数与代价（尽力而为；抽不到就是 `undefined`）。
 *
 * 抽不到**不报错**——`classifyPlan` 的结论与阈值判定会各自处理缺失，
 * 而「抽不到就抛错」会让引擎输出格式的小差异变成整条路径不可用。
 */
export declare function estimateFromPlan(planText: string): PlanEstimate;
/**
 * 判定一份计划是否放行。
 *
 * 顺序是契约：**先看有没有计划**（拿不到就拒，不看阈值），再看扫描分类，最后看阈值。
 * 反过来的话，「拿不到计划」会被阈值分支的默认值放过去。
 */
export declare function guardPlan(input: {
    planText: string | undefined;
    thresholds: PlanThresholds;
    engine?: Engine;
}): PlanGuardDecision;
