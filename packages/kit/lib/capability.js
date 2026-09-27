/** 环境变量取值的白名单（大小写不敏感）。**只有这些值算授权**，其余（含 `0` / `false` / 空）都算没授权。 */
const TRUTHY = new Set(['1', 'true', 'yes', 'on']);
/**
 * 环境变量那一半的采样结果（每个能力名一次）。**授权存储那一半不在这里缓存**：撤销要立刻生效。
 */
const envGrantMemo = new Map();
/** 会话期环境变量的判定源（`undefined` = 还没绑定，退回与改造前一致的「现读 `process.env`」）。 */
let envSource;
/** 带外授权存储（由插件注入；不注入 = 只有启动环境通道）。 */
let grantsSource;
/**
 * 绑定本进程的授权来源：**各插件在自己的 `apply()` 第一行调用**（早于任何 `capabilityGranted`）。
 *
 * 为什么必须由插件显式绑定、而不是 kit 自己去读 `~/.dsh`：判定逻辑是跨包共享的纯函数，而「谁有权
 * 读哪个文件」是插件的事（它才知道 DSH 主目录，测试里也知道该指到哪个临时目录）。kit 自己去读
 * 用户真实主目录，会让任何一个用例都依赖开发机上 `capability-grants.json` 的内容。
 *
 * 重复调用 = 重新绑定（测试与脚本用它模拟「宿主这次是带着什么环境启动的」）。
 *
 * @param ctx - 插件上下文（只用到 `ctx.get('launchEnvironment')`）。
 * @param grants - 带外授权存储；不传表示本插件**没有**就地提权通道（当时只有启动环境那一条）。
 *   现在 docker 与 tty 都传了存储；不传这条分支留给还没接入的插件与纯环境变量用例。
 */
export function bindCapabilitySources(ctx, grants) {
    envSource = resolveEnvSource(ctx);
    envGrantMemo.clear();
    grantsSource = grants;
}
/** 宿主侧是否授予了这条能力（启动环境快照，或带外授权存储命中；缺省 = 未授权）。 */
export function capabilityGranted(spec) {
    return capabilityGrantVia(spec) !== undefined;
}
/**
 * 这条能力当前**由哪条通道**授权（都没命中 = `undefined`）。
 *
 * 给 `snapshot()` / 界面用：必须能区分「启动环境授权」与「就地确认授权」——后者可以在界面里撤销，
 * 前者只能去改启动环境，两者的提示语完全不同（写错会让用户点一个永远点不动的按钮）。
 *
 * 两条都命中时**报 `env`**：那时撤销存储里的授权并不能让能力真的关掉（环境变量还授权着），界面上
 * 给一个「撤销」按钮却什么都不改变，比不给更糟。报 `env` = 「这个开关由启动环境决定，界面撤不了」。
 */
export function capabilityGrantVia(spec) {
    const env = typeof spec === 'string' ? spec : spec.env;
    if (envGranted(env))
        return 'env';
    if (grantsSource?.has(env) === true)
        return grantsSource.source?.(env)?.via ?? 'file';
    return undefined;
}
/**
 * 这条能力**何时**获授（Unix 秒；环境变量通道或未授权 = `undefined`）。
 *
 * 只对 `file` 通道有值：环境变量通道没有「授权时刻」（它就是启动环境的一部分），给它显示一个假
 * 时间比不显示更糟。这是界面侧的落点——授权是**持久**的，用户至少该看得到它是什么时候来的（kit D09）。
 */
export function capabilityGrantAt(spec) {
    const env = typeof spec === 'string' ? spec : spec.env;
    if (capabilityGrantVia(env) !== 'file')
        return undefined;
    return grantsSource?.source?.(env)?.grantedAt;
}
/**
 * 「怎么授权」的一句话（给界面与错误文案共用）。
 *
 * 刻意把**通道**说清楚：只说「去设置里打开」会让人在卡片上反复点一个点不动的开关。并且必须点明
 * `.env` / `env.yml` **不算**——那两个文件有 HTTP 写入路径，拿它们当授权等于没闸门。
 */
export function capabilityHowTo(spec, options) {
    const inPlace = options?.inPlace === true ? '在设置卡片里点这个开关就地确认（免重启），或' : '';
    return `${inPlace}在「启动 dsh 的那个环境」里 export ${spec.env}=1 后重启宿主（授权只认启动时的继承环境与带外确认——启动之后再设、或写进别的配置文件都不算）`;
}
/** HTTP 尝试把未授权的能力打开时的 400 文案（插件路由直接用）。 */
export function capabilityDeniedMessage(spec, options) {
    return `「${spec.label}」未获宿主授权，HTTP 侧不能凭空打开它（这是刻意的：本机任意进程都能发回环请求，若配置路由能提权，这道闸门等于没有）。${capabilityHowTo(spec, options)}。`;
}
/** 环境变量那一半：采样一次后固定（见文件头第 2 条）。 */
function envGranted(env) {
    const memo = envGrantMemo.get(env);
    if (memo !== undefined)
        return memo;
    // 未绑定 = 改造前的语义（现读一次后固定）：兼容还没调用 bindCapabilitySources 的调用方
    const raw = envSource === undefined ? process.env[env] : envSource(env);
    const granted = typeof raw === 'string' && TRUTHY.has(raw.trim().toLowerCase());
    envGrantMemo.set(env, granted);
    return granted;
}
/** 把宿主上下文解析成「按变量名取值」的判定源。 */
function resolveEnvSource(ctx) {
    const slot = typeof ctx?.get === 'function' ? ctx.get('launchEnvironment') : undefined;
    const snapshot = typeof slot === 'object' && slot !== null ? slot : undefined;
    if (typeof snapshot?.getFrom === 'function') {
        /*
         * 只问 `process` 层（启动继承层）：`project-env`（<cwd>/.env）与 `user-env`（$DSH_HOME/.env）
         * 都在运行期可写（环境变量卡片），拿它们当授权等于把提权路径搬到那张卡片上。宿主自己也拒绝让
         * `.env` 设置 `DSH_*`（BOOTSTRAP_PREFIXES），这里是同一条道理的插件侧落点。
         */
        return (env) => {
            const entry = snapshot.getFrom(env, ['process']);
            return typeof entry?.value === 'string' ? entry.value : undefined;
        };
    }
    /*
     * 兜底（宿主没提供快照，比如老宿主或宿主外的测试环境）：冻结一份 `process.env` 的**拷贝**。
     * 冻结而不是现读，是为了保住改造前的语义——运行期被别的插件改写 `process.env` 不该提权。
     * 这条路分辨不出「启动继承」与「运行期注入」，所以只在拿不到快照时走。
     *
     * （kit D07：原来的判定源就是这一步的「现读 process.env」，于是 `~/.dsh/env.yml` 这类运行期
     * 可写的文件也能算成授权——而它并不在启动快照里，能否生效全看别的插件 apply 的先后。）
     */
    const frozen = new Map();
    for (const [name, value] of Object.entries(process.env))
        if (typeof value === 'string')
            frozen.set(name, value);
    return (env) => frozen.get(env);
}
//# sourceMappingURL=capability.js.map