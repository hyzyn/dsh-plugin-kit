/**
 * 验活断言的**求值与结构化差异**（`docs/devdata-plan.md` §3.9 约束 1、3）。
 *
 * ## 三种状态，不是两种
 *
 * | 状态 | 含义 | 谁的问题 |
 * |---|---|---|
 * | `pass` | 数据满足全部判据 | — |
 * | `fail` | 数据**明确**不满足 | 业务 / 数据 |
 * | `unknown` | **验不了**：结果被截断、列不存在、值不可比较 | 断言或环境配置 |
 *
 * `unknown` 不是「fail 轻一点」，也不是「pass 的委婉说法」：
 * 把验不了的当 fail 会让核对充满假警报（下次就没人看了），当 pass 就是**用没验过冒充验过**。
 * 它必须自成一档，并带上「为什么验不了」。
 *
 * ## 截断的语义（这里最容易错）
 *
 * 一条判据要么**在截断下仍可判**，要么必须退成 `unknown`。判据是**方向**：
 * 截断只会让实际行数 / 值**更大**，所以
 *
 * - **已经越界**的判据**仍可判 `fail`**——更大的值不会让它回到界内（截断不能用来「否证否证」）；
 * - **判定通过**的判据是在「可能更大的真值」上得出的，所以**必须退成 `unknown`**。
 *
 * | 断言 | 截断且与真值方向相反（已越界） | 截断且方向相同（看起来通过） |
 * |---|---|---|
 * | `rowCount: N` | `fail`（已返回 > N ⇒ 真值更 > N） | `unknown`（真值可能等于也可能大于 N） |
 * | `gte: N` | `fail`（最小值都不够） | **`pass`**（真值只会更大，更大只会更满足下界） |
 * | `lte: N` | `fail`（已有值已超界） | `unknown`（真值可能超过上限） |
 * | `eq: V` | `fail`（已取得的行不相等） | `unknown`（可能还有一行恰好相等） |
 *
 * 注意 `gte` 与 `lte` 在这一列上**相反**——截断让真值变大的方向，对下界是帮忙、对上界是拆台。
 * 统一处理会错一边：都报 `pass` 会夸大 `lte` 的证据，都报 `unknown` 会浪费 `gte` 上确凿的结论。
 *
 * 实现上「先判 fail、再判截断、最后 pass」——顺序反了会让明确的否证被降级成 `unknown`，
 * 等于用「不确定」盖住「已否证」。
 *
 * ## 结构化差异（约束 3）
 *
 * `diff` 里 got / expected 并排，**每个算子一行**。理由是 agent 的失败模式是**循环重试**：
 * 一句「断言失败」不产生新信息，它只能原样再试；并排的 got/expected 才让它一轮定位。
 *
 * 依据：`docs/devdata-plan.md` §3.9、§3.6.1 实现要求 2（被拒的错误必须带恢复提示）。
 */
import type { ShapedResult } from './sql.js';
import type { Severity, VerifyAssertion } from './verify.js';
/** 一次断言求值的状态。 */
export type VerifyStatus = 'pass' | 'fail' | 'unknown';
/** 一个算子的判定结果。 */
export type OperatorVerdict = 'pass' | 'fail' | 'unknown';
/** got / expected 并排的一行。 */
export interface DiffLine {
    /** 算子名（`eq` / `regex` / `gte` / `lte` / `rowCount`）。 */
    op: string;
    expected: unknown;
    got: unknown;
    verdict: OperatorVerdict;
    /** 为什么是这个判定（尤其 `unknown` 必须说清）。 */
    note?: string;
}
/** 一条断言的求值结果。 */
export interface VerifyResult {
    id: string;
    /** 数据层面的判定。`severity` 决定 `fail` 要不要让整批失败，与这里无关。 */
    status: VerifyStatus;
    severity: Severity;
    /** 一句话结论（给人看）。 */
    message: string;
    /** 逐算子的 got / expected。**空了才需要担心**——有 `expect` 就一定有 diff。 */
    diff: DiffLine[];
    latencyMs: number;
}
/** 跑一批断言的汇总。 */
export interface VerifySummary {
    total: number;
    passed: number;
    failed: number;
    warned: number;
    unknown: number;
    /** 整批的判定：`fail` > `warn` > `unknown` > `pass`。 */
    overall: 'pass' | 'fail' | 'warn' | 'unknown';
}
/**
 * 求一条断言。
 *
 * 顺序是刻意的：**先判 `zeroDanger`**，让「上限太宽」这件事在其它判据之前就说清楚——
 * 一条返回海量行的断言即使碰巧通过，它也不是一条能长期留在清单里的断言。
 */
export declare function evaluateAssertion(input: {
    assertion: VerifyAssertion;
    result: ShapedResult;
    latencyMs: number;
    /** 结果行数超过它就报 `unknown`（提示断言太宽）。缺省不限。 */
    ceiling?: number;
}): VerifyResult;
/**
 * 汇总一批断言。
 *
 * `overall` 的口径：**任一 `fail` 档断言实际失败 ⇒ `fail`**；否则任一 `warn` 档失败 ⇒ `warn`；
 * 否则任一 `unknown` ⇒ `unknown`；否则 `pass`。
 *
 * 为什么 `unknown` 排在 `pass` 之前：一批里有一条验不了，整批就不能报「核对通过」——
 * 那是用没验过冒充验过。
 */
export declare function summarizeResults(results: readonly VerifyResult[]): VerifySummary;
