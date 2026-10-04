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
/**
 * 可被取消唤醒的等待。
 *
 * **这里是「取消立刻生效」与「取消要等下一轮」的分界**：`setTimeout` 睡着的 3 秒里取消，
 * 唤醒它才能立刻返回；否则调用方要等到这一轮睡完，而 `env_wait` 的上限是 15 分钟。
 */
export function abortableSleep(ms, signal) {
    if (ms <= 0)
        return Promise.resolve();
    if (signal === undefined)
        return new Promise((resolve) => setTimeout(resolve, ms));
    if (signal.aborted)
        return Promise.resolve();
    return new Promise((resolve) => {
        const done = () => {
            clearTimeout(timer);
            signal.removeEventListener('abort', done);
            resolve();
        };
        const timer = setTimeout(done, ms);
        signal.addEventListener('abort', done, { once: true });
    });
}
/** 判定这一轮的结论（`refuted` 优先于 `unready`：前者的处置是「别等了」）。 */
function verdictOf(evaluation) {
    if (evaluation.ready)
        return 'ready';
    return evaluation.anyRefuted ? 'refuted' : 'unready';
}
/** 第一个被明确否证的服务名（报告里点名用）。 */
function firstRefuted(evaluation) {
    return evaluation.services.find((service) => service.verdict === 'refuted')?.name;
}
/**
 * 等一批服务就绪、等到明确没戏、等到超时，或等到调用方取消。
 *
 * 顺序是契约：**每一轮都先观测**（取消也不例外，理由见文件头），再判就绪 / 否证 / 超时，
 * 最后才是「睡一会儿、醒来先看有没有被取消」。
 */
export async function waitForReady(options) {
    const now = options.now ?? Date.now;
    const sleep = options.sleep ?? abortableSleep;
    const startedAt = now();
    const ticks = [];
    let snapshot;
    let stop;
    for (;;) {
        snapshot = await options.probe();
        const atMs = now() - startedAt;
        const verdict = verdictOf(snapshot.evaluation);
        ticks.push({ atMs, verdict, summary: snapshot.evaluation.summary });
        if (verdict === 'ready') {
            stop = { kind: 'ready', elapsedMs: atMs, timeoutMs: options.timeoutMs };
            break;
        }
        if (verdict === 'refuted') {
            stop = {
                kind: 'refuted',
                elapsedMs: atMs,
                timeoutMs: options.timeoutMs,
                ...(firstRefuted(snapshot.evaluation) === undefined ? {} : { refuted: firstRefuted(snapshot.evaluation) }),
            };
            break;
        }
        const remaining = options.timeoutMs - (now() - startedAt);
        if (remaining <= 0) {
            stop = { kind: 'timeout', elapsedMs: now() - startedAt, timeoutMs: options.timeoutMs };
            break;
        }
        await sleep(Math.min(options.pollIntervalMs, remaining), options.signal);
        if (options.signal?.aborted === true) {
            // 醒来先看取消：不看的话，取消之后还会再探一轮（一次 SSH/docker 往返）。
            stop = { kind: 'cancelled', elapsedMs: now() - startedAt, timeoutMs: options.timeoutMs };
            break;
        }
    }
    // 循环至少跑过一轮（`snapshot` 一定有值）；这个断言只是给类型收窄。
    const last = snapshot;
    return { evaluation: last.evaluation, observations: last.observations, ticks, stop: stop };
}
/**
 * 把逐次观测压成**段**：结论与那句话都没变的连续几次并成一段。
 *
 * 为什么不是原样列出来：一次 150 秒的冷启动按 3 秒轮询就是 50 条，原样列等于把「有没有变过」
 * 埋进 50 行里——而那个问题（是一直卡着，还是在往前走）恰好是等待报告唯一要回答的。
 */
export function collapseTicks(ticks) {
    const phases = [];
    for (const tick of ticks) {
        const last = phases[phases.length - 1];
        if (last !== undefined && last.verdict === tick.verdict && last.summary === tick.summary) {
            last.repeat += 1;
            continue;
        }
        phases.push({ ...tick, repeat: 1 });
    }
    return phases;
}
//# sourceMappingURL=wait.js.map