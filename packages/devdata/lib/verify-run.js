/**
 * 按项目清单**跑一批只读断言**（装配层，不是判据层）。
 *
 * ## 为什么单独一层
 *
 * `verify.ts`（加载 + 校验）与 `verify-eval.ts`（求值 + 汇总）都是**纯逻辑**：它们不认识目标、
 * 不认识网络。清单真要跑起来还差一跳——把每条断言的 `target` 接到宿主的执行通道上。这一跳在这里，
 * 通道用**注入**（`AssertionRunner`）：于是「四种处置各报什么」可以不连网地逐条断言，宿主那侧
 * （`plugin.ts`）只是往 `runner` 里塞一个真的执行器。
 *
 * ## 四种处置，一种都不许混
 *
 * | 处置 | 判据 | 报什么 |
 * |---|---|---|
 * | ① 没配这个目标 | 断言声明的 `target` 不在这次给的目标表里 | `unknown`（**没验成**）|
 * | ② 引擎没接通 | 通道回 `ok:false`，原因里说「这个引擎的执行通路还没接通」 | `unknown`（**没验成**）|
 * | ③ 被作用域 / 闸门拒 | 通道回 `ok:false`，原因里带**原样**的拒绝码与正文 | `unknown`（**没验成**）|
 * | ④ 真跑了 | 通道回 `ok:true` | 交 `evaluateAssertion` 判 |
 *
 * ① 由这一层判（目标表就是它的输入）；②③ 的**措辞由通道给**——它是唯一知道「为什么没跑成」的地方，
 * 这一层**不改写**它（码与正文原样带出去，agent 才能按那个码决定下一步）。② 与 ③ 的分界在
 * `plugin.ts`：**不在本宿主服务清单里的引擎，在碰执行器之前就短路**（②）；放行之后才可能撞上
 * 作用域 / 闸门的拒绝（③）。
 *
 * 前三种一律 `unknown` 而**不是** `fail`：「没验成」与「验出问题」的下一步动作相反（一个去修通路 /
 * 补配置，一个去改数据），把它们混成一个 `fail` 是本仓最忌讳的假结论。
 *
 * `problems` 是**跑批级**的原因（按出现顺序去重）：同一个目标上多条断言都没跑成时，逐条 `unknown`
 * 说「这条没验成」，这里说「为什么这一组都没验成」——报告里两块并存，所以它必须去重，否则同一个
 * 原因会被 N 条断言重复 N 遍。
 */
import { evaluateAssertion, summarizeResults } from './verify-eval.js';
/**
 * 跑一份清单**已经加载好的**断言（不做 I/O、不做发现：跑什么完全由调用方给的断言决定）。
 *
 * 顺序、汇总与「没验成」的措辞都钉在这里；报告怎么排版是 `plugin.ts` 的事（渲染与判据分开，
 * 于是这一层能纯逻辑地测）。
 */
export async function runManifestVerify(input) {
    const { project, cwd, assertions, targets, runner, ceiling } = input;
    const byId = new Map(targets.map((target) => [target.id, target]));
    const results = [];
    const problems = [];
    let ran = 0;
    /** 同一条原因只留一次（同一个目标上多条断言都没跑成时它会出现很多次）。 */
    const note = (problem) => {
        if (!problems.includes(problem))
            problems.push(problem);
    };
    /** 没跑成的一条：一律 `unknown`，`diff` 空（没有 got / expected 可比），延迟 0（真的没跑）。 */
    const notRun = (assertion, message) => ({
        id: assertion.id,
        status: 'unknown',
        severity: assertion.severity,
        message,
        diff: [],
        latencyMs: 0,
    });
    for (const assertion of assertions) {
        const target = byId.get(assertion.target);
        // ① 没配这个目标：**不发通道**——发下去等于拿一个不存在的目标去跑，而报告看起来还会是绿的。
        if (target === undefined) {
            note(`目标 ${assertion.target}：清单里有它，但这次的目标表里没有——这一组断言一条都没跑`);
            results.push(notRun(assertion, `没验成：目标 ${assertion.target} 没有配置（清单随项目跨机器，缺目标不是配置错误）`));
            continue;
        }
        const outcome = await runner({ assertion, target, cwd });
        // ②③ 通道说没跑成：原因**原样**带出去（里面可能有拒绝码）；不在这里猜是「引擎没接通」还是「被拒」。
        if (!outcome.ok) {
            note(`目标 ${target.id}（${target.engine}）：${outcome.reason}`);
            results.push(notRun(assertion, `没验成：${outcome.reason}`));
            continue;
        }
        // ④ 真跑了：判定交给求值层——它才是 `pass` / `fail` / `unknown` 的唯一真源。
        ran += 1;
        results.push(evaluateAssertion({
            assertion,
            result: outcome.result,
            latencyMs: outcome.latencyMs,
            ...(ceiling === undefined ? {} : { ceiling }),
        }));
    }
    return { project, results, summary: summarizeResults(results), problems, ran };
}
//# sourceMappingURL=verify-run.js.map