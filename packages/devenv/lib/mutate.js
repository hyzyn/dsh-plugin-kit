/** 全部动作（注册面与判定用同一份）。 */
export const MUTATION_ACTIONS = ['up', 'down'];
/** 动作的中文短语（报告与拒绝文案共用，免得两处各写一份）。 */
export function actionLabel(action) {
    return action === 'up' ? '启动' : '停止';
}
/** `docker start <name>`。 */
export function startArgv(name) {
    return ['docker', 'start', name];
}
/** `docker stop --time <秒> <name>`（给容器一个体面的收尾时间；SIGKILL 是别人的决定，不是默认）。 */
export function stopArgv(name, timeoutSec) {
    return ['docker', 'stop', '--time', String(timeoutSec), name];
}
/**
 * 由一份观测算出要做什么。
 *
 * **纯函数**：观测由调用方取（`observeServices`），所以这一段能脱离真机逐条断言。
 */
export function planMutation(input) {
    const byName = new Map(input.observations.map((observation) => [observation.name, observation]));
    const plan = { action: input.action, services: [], unchanged: [], missing: [] };
    for (const service of input.services) {
        const observation = byName.get(service.name);
        if (observation === undefined || !observation.found) {
            plan.missing.push(service.name);
            continue;
        }
        const running = observation.status === 'running';
        if (input.action === 'up') {
            if (running)
                plan.unchanged.push(service.name);
            else
                plan.services.push(service.name);
        }
        else {
            if (running)
                plan.services.push(service.name);
            else
                plan.unchanged.push(service.name);
        }
    }
    return plan;
}
/**
 * 逐条执行（**串行**：这是一台共享机器，并发下令只是让失败更难读）。
 *
 * 单条失败**不中断**后面的：停三个容器时第一个失败，另外两个该不该停是调用方的决定——
 * 都试一遍并把每条的结果报出来，比「第一个失败就停手、剩下的没动」更容易看懂（后者看起来像
 * 「只停了两个」，而实际是「停了两个、第三个失败」）。
 */
export async function runMutation(plan, runner, options) {
    const outcomes = [];
    for (const name of plan.services) {
        const argv = plan.action === 'up' ? startArgv(name) : stopArgv(name, options.timeoutSec);
        let result;
        try {
            result = await runner.run(argv, options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs });
        }
        catch (error) {
            outcomes.push({ name, code: null, error: error instanceof Error ? error.message : String(error) });
            continue;
        }
        if (result.timedOut === true) {
            outcomes.push({ name, code: null, error: '命令超时（目标机没在超时前答复）' });
            continue;
        }
        if (result.code === 0) {
            outcomes.push({ name, code: 0 });
            continue;
        }
        const detail = (result.stderr.trim() !== '' ? result.stderr : result.stdout).trim().split('\n')[0] ?? '';
        outcomes.push({ name, code: result.code, error: detail === '' ? '没有输出' : detail });
    }
    return outcomes;
}
//# sourceMappingURL=mutate.js.map