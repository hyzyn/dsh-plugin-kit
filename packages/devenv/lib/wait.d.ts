/**
 * `env_wait` 的**等待循环**：轮询、判定、取消，以及「等待过程」的记账。
 *
 * ## 为什么抽成模块，而不是留在 `plugin.ts` 的 `while` 里
 *
 * 这条循环里有三件事，而它们都必须在**没有宿主、没有 docker** 的情况下可测：
 *
 * 1. **取消**：`ToolRunContext.signal` 是调用方的取消通道，SDK 的契约写得很直白——
 *    「Async work must observe or forward `exec.signal` and settle only after its owned work
 *    reaches quiescence」。而循环里每一轮都可能是一次 SSH/docker 往返（秒级），所以**取消之后
 *    不许再探一轮**，等待中的 `sleep` 也必须能被唤醒（否则「取消」要拖到下一次轮询才生效）。
 *    这一条此前**根本没做**：`env_wait` 的 `execute` 连第二个参数都没接，取消一个 15 分钟的等待
 *    等于没取消（调用方已经走了，工具还在那边每 3 秒打一次 SSH）。
 * 2. **记账**：`env_wait` 只返回**一个**结果——这一版工具面没有给工具用的进度通道（`presentCall`
 *    只拿得到 `args`，拿不到运行中的事实）。所以「等的时候都看到了什么」只能由最终报告回答，
 *    而那份账就是这里的 `ticks`：每一次观测的耗时、结论，以及和上一次比有没有变。
 * 3. **停止原因**：就绪 / 明确否证 / 超时 / 被取消是**四种不同的处置**。这一层只回**数据**
 *    （`WaitStop`），话术归渲染层（`render.ts` 的 `describeStop`）——与 `env-ready-eval` /
 *    `render.ts` 的分工一致。
 *
 * ## 一处刻意的取舍：已经取消时**仍然观测一次**
 *
 * 一次都没观测就返回的话，报告里没有任何事实可说（「取消了，而且我不知道那边什么样」）。
 * 调用方要的是「你取消的时候环境到哪一步了」，所以第一轮照常观测；取消只保证**之后不再探**。
 */
import type { ReadyEvaluation, ServiceObservation } from './env-ready-eval.js';
/** 一次观测的账。 */
export interface WaitTick {
    /** 从开始等到这一次观测的耗时（毫秒）。 */
    atMs: number;
    verdict: 'ready' | 'unready' | 'refuted';
    /** 一句话：判定层给的 `summary`。 */
    summary: string;
}
/** 停止等待的原因——**数据**，不是话术（话术见 `render.ts` 的 `describeStop`）。 */
export interface WaitStop {
    kind: 'ready' | 'refuted' | 'timeout' | 'cancelled';
    /** 停止时的总耗时。 */
    elapsedMs: number;
    /** 本次等待的上限（给「等满 X」那句话用）。 */
    timeoutMs: number;
    /** `kind: 'refuted'` 时点名**第一个**被否证的服务。 */
    refuted?: string;
}
/** 一次等待的完整结果。 */
export interface WaitOutcome {
    /** 停止那一刻的判定（报告里那块逐服务的结论就是它）。 */
    evaluation: ReadyEvaluation;
    observations: readonly ServiceObservation[];
    ticks: WaitTick[];
    stop: WaitStop;
}
/** 一次探测：判定 + 观测（由调用方把通道与清单喂进来）。 */
export type WaitProbe = () => Promise<{
    evaluation: ReadyEvaluation;
    observations: readonly ServiceObservation[];
}>;
/** 等待参数。 */
export interface WaitOptions {
    probe: WaitProbe;
    pollIntervalMs: number;
    timeoutMs: number;
    /** 调用方的取消信号（`ToolRunContext.signal`）。不给 = 不可取消（只在测试里这么用）。 */
    signal?: AbortSignal;
    /** 取当前时刻（测试里用假时钟：真实等待太慢）。 */
    now?: () => number;
    /** 睡一会儿（测试里用假实现直接推进假时钟）。 */
    sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}
/**
 * 可被取消唤醒的等待。
 *
 * **这里是「取消立刻生效」与「取消要等下一轮」的分界**：`setTimeout` 睡着的 3 秒里取消，
 * 唤醒它才能立刻返回；否则调用方要等到这一轮睡完，而 `env_wait` 的上限是 15 分钟。
 */
export declare function abortableSleep(ms: number, signal?: AbortSignal): Promise<void>;
/**
 * 等一批服务就绪、等到明确没戏、等到超时，或等到调用方取消。
 *
 * 顺序是契约：**每一轮都先观测**（取消也不例外，理由见文件头），再判就绪 / 否证 / 超时，
 * 最后才是「睡一会儿、醒来先看有没有被取消」。
 */
export declare function waitForReady(options: WaitOptions): Promise<WaitOutcome>;
/** 连续且结论相同的一段。 */
export interface WaitPhase extends WaitTick {
    /** 这一段连续重复了几次（1 = 只出现一次）。 */
    repeat: number;
}
/**
 * 把逐次观测压成**段**：结论与那句话都没变的连续几次并成一段。
 *
 * 为什么不是原样列出来：一次 150 秒的冷启动按 3 秒轮询就是 50 条，原样列等于把「有没有变过」
 * 埋进 50 行里——而那个问题（是一直卡着，还是在往前走）恰好是等待报告唯一要回答的。
 */
export declare function collapseTicks(ticks: readonly WaitTick[]): WaitPhase[];
