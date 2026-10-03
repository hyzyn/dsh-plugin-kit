/**
 * 报告渲染（`env_status` / `env_wait` 的输出）。
 *
 * ## 为什么单独一层纯函数
 *
 * 一份**有误导性的**报告比一句报错更糟：它长得像结论，agent 与人都据此决定下一步。这一层要保
 * 三件事，而三件都能在没有真机的情况下逐条断言：
 *
 * 1. **状态三态各有一个不会被看错的记号**（`✓` / `!` / `✗`），而且 `refuted` 必须**显式**说出
 *    「别再等了」——它与 `unready` 的处置相反，混在一起就会让容器崩了还等满超时；
 * 2. **证据与结论并列**（`met` / `missing` / `refuted` 都进报告）：只给一句「未就绪」等于让人
 *    自己再查一圈，而那正是这张表要省掉的事；
 * 3. **快照要说清是哪一刻的**：观测是某一刻的样子，报告不写时刻的话，一份过期快照会被当成现状。
 *
 * 另外两件容易漏的：**没取到观测的服务要点名**（否则「一个都没观测到」会被读成「都就绪了」），
 * 以及**通道失败要原样出镜**（它**不是**「容器没起」——那是两件处置完全相反的事）。
 */
import type { ReadyEvaluation, ServiceObservation } from './env-ready-eval.js';
import { type MutationOutcome, type MutationPlan } from './mutate.js';
/** 判定图标（与 `devdata` 的 doctor 同一套：三个记号各占一档）。 */
export declare const VERDICT_ICON: Record<string, string>;
/** 毫秒 → 人能读的时长（报告里用，别让人去数）。 */
export declare function formatMs(ms: number): string;
/** 渲染输入。 */
export interface RenderInput {
    /** 目标 id。 */
    targetId: string;
    /** 目标展示名。 */
    targetLabel: string;
    project: string;
    evaluation: ReadyEvaluation;
    observations: readonly ServiceObservation[];
    /** 停止等待的原因（`env_status` 不传：它本来就不等）。 */
    stoppedBecause?: string;
}
/**
 * 渲染一份判定。
 *
 * 输出格式刻意是**逐服务一块**（而不是一张宽表）：agent 读的是文本，块状文本里「哪个服务缺什么」
 * 一眼能看到，而宽表在窄屏/换行后会把缺的证据与别的服务对错行。
 */
export declare function renderEvaluation(input: RenderInput): string;
/** 写动作的报告输入。 */
export interface RenderMutationInput {
    targetId: string;
    targetLabel: string;
    project: string;
    plan: MutationPlan;
    outcomes: readonly MutationOutcome[];
    /** 观测时刻（快照说明；写之前的判定就基于它）。 */
    observedAt?: string;
}
/**
 * 渲染一次写动作的结果。
 *
 * **四档都要出现**（动了的 / 本来就那样的 / 目标上没有的 / 失败的），哪怕是空档：这份报告是
 * 「我刚才到底碰了什么」的唯一凭据，少一档就会让人以为漏做（或更糟：以为动过）。
 */
export declare function renderMutation(input: RenderMutationInput): string;
