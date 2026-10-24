/**
 * 「等 env 的同步预注入就绪」的门（codegraph 侧）。
 *
 * ## 为什么需要它
 *
 * env 插件在 `apply()` 开头**同步**把值写进 `process.env`；而 per-agent 挂载会 spawn 一个
 * MCP 子进程，子进程的环境 = 宿主 `scrubbedParentEnv()` + `config.env`（**per-agent 不传
 * `config.env`**，见 `scope.ts` 里那份 config）。两者谁先 apply **不由配置行序保证**：
 * 加载器对同一组条目并发 create（`Promise.all` + 动态 `import()`），cordis 在依赖就绪时
 * 才执行 apply——env 晚到，子进程就少了它注入的那些变量。
 *
 * ## 射程（**别把这道门说大了**，2026-10-24 真机实测后的更正）
 *
 * - 它保的是「子进程**继承到的普通环境变量**」，不是认证头。per-agent 的 config 里没有
 *   `headers` 字段（走 stdio），也**没有 `!!js` 求值**这回事——那句「求值认证头」是早期
 *   误写的因果，实测不成立。
 * - **凭据形状的变量本来也进不去子进程**：宿主 `scrubbedParentEnv()` 会剔除命中
 *   `/KEY|PASSWORD|SECRET|TOKEN/i` 的名字，**与这道门无关**（门不开也漏不了）。
 * - 真宿主（`0.2.1-rc.2`，隔离 home、真 `agent/created`）上**没复现出这个窗口**：挂载自身有
 *   一次 `loadClient()` 动态 import + spawn 的异步跨度（实测 ~350ms），env 几乎总在这段里
 *   就装完了；把 env 的**模块装载**人为推迟 700ms / 6s / 15s 三档，带门与不带门两版都拿到了
 *   注入值。所以本模块目前是**防御性时序保险**，不是已证实的修复。
 *
 * ## 机制
 *
 * env 在注入完成后 `ctx.provide('dshEnvReady', …)`；cordis 的服务**在提供者 fiber active
 * 之后**才对依赖者可见，而 fiber active 发生在 `apply()` 返回之后——所以「等到这个服务」
 * 等价于「env 的同步注入已经做完」。本模块把它收成 `whenEnvReady(ctx, run)`：
 *
 *   1. 服务已在（`ctx.get`）→ 立即跑；
 *   2. 宿主没装 env（loader 的条目清单里找不到）→ 立即跑（没有可等的对象）；
 *   3. 装了但还没到 → `ctx.inject(['dshEnvReady'])`，服务出现时跑**一次**。
 *
 * 第 2 步是必需的：`ctx.inject` 在服务永不出现时**回调永不执行**，而 `desktop` 这类 profile
 * 根本没装 env——只写 inject 会把 per-agent 挂载永久挂起。条目清单取不到（非 loader 宿主 /
 * 宿主升级改了形状）时按「没装」处理，退化为改动前的行为，不会崩。
 *
 * ## 边界
 *
 * - 只保护**主动调用它**的路径；新插件在 apply 顶部直接读 `process.env` 仍然会被顺序影响。
 * - env 装了但它的模块 import/apply 抛错时，服务不会出现：本模块**不**设超时兜底，让
 *   per-agent 挂载停在「等待就绪」——env 的报错在启动日志里可见，比静默降级更符合本仓口径。
 * - env 热重载（fiber 重启）会先撤服务再 provide；`run` 有一次性闸，不会被重复执行。
 */
/** env 提供的就绪服务名（跨包契约，与 `packages/env/src/index.ts` 的导出同值）。 */
export const ENV_READY_SERVICE = 'dshEnvReady';
/** env 的包名/条目 id：用于在 loader 条目清单里判断「宿主装没装 env」。 */
export const ENV_PLUGIN_NAME = '@hyzyn/dsh-env';
export const ENV_ENTRY_ID = 'env-manager';
/**
 * 宿主是否**装了** env（loader 条目清单里是否有它的行）。
 *
 * 措辞是「装了」不是「就绪」：这里只回答「有没有可等的对象」。取不到 loader / 形状不符
 * 一律按「没装」处理——那正是改动前的行为。
 */
export function envPluginMounted(ctx) {
    try {
        const loader = ctx.get?.('loader');
        if (loader === undefined || typeof loader.entries !== 'function')
            return false;
        for (const entry of loader.entries()) {
            const options = entry?.options;
            if (options === undefined)
                continue;
            // loader 层显式禁用的行永远不会 apply（不会 provide），等它等于挂死。
            if (options.disabled === true)
                continue;
            if (options.name === ENV_PLUGIN_NAME || options.id === ENV_ENTRY_ID)
                return true;
        }
        return false;
    }
    catch {
        return false;
    }
}
/**
 * 在 env 的同步预注入就绪后执行 `run`（**恰好一次**）。
 *
 * 见文件头：已就绪 / 没装 env / 没 loader 都立即执行；装了但未就绪才等 inject。
 */
export function whenEnvReady(ctx, run) {
    let fired = false;
    const fire = () => {
        if (fired)
            return;
        fired = true;
        run();
    };
    try {
        if (ctx.get?.(ENV_READY_SERVICE) !== undefined) {
            fire();
            return;
        }
    }
    catch {
        // 读服务失败按未就绪处理，继续走下面的「装没装」判断
    }
    if (!envPluginMounted(ctx) || typeof ctx.inject !== 'function') {
        fire();
        return;
    }
    try {
        ctx.inject([ENV_READY_SERVICE], fire);
    }
    catch {
        // inject 失败（宿主形状不符 / fiber 已释放）：退化为立即执行，不把功能挂死
        fire();
    }
}
//# sourceMappingURL=env-gate.js.map