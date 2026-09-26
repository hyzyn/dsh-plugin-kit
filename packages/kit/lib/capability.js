/**
 * 能力开关的**宿主侧授权**（跨包约定）。
 *
 * ## 这一层要解决的问题
 *
 * 本仓所有插件的变更路由只有两层防护：**回环围栏 + 同源证明**。两层都拦不住**本机盲发
 * 进程**——它能发 HTTP、读不到响应，也能自己填 `Sec-Fetch-Site: same-origin`（那是请求头，
 * 不是凭据）。于是「能力开关」本身成了攻击面：一次
 * `POST /config {allowMutations:true}` 就把危险能力打开（docker socket 等价目标主机 root）。
 *
 * 为什么不用一次性 token 覆盖它：危险的正是 `/config`——而它**必须**保持免证明，因为它是
 * 插件被禁用后唯一的恢复入口（token 化就等于把用户锁在外面）。详见项目级 ROADMAP 的
 * 「变更端点的信任模型」条目与 [docs/architecture.md § 能力开关](../../../docs/architecture.md)。
 *
 * ## 约定
 *
 * 1. **提权只认宿主侧来源**：环境变量（`DSH_DOCKER_ALLOW_MUTATIONS=1` 这类）。宿主进程的
 *    环境变量不是一次回环请求能改的东西。
 * 2. **只在进程内第一次查询时读一次**，之后固定（见 `capabilityGranted`）。为什么不是每次
 *    现读：`~/.dsh/env.yml` 那类托管文件**有 HTTP 写入路径**（环境变量卡片），现读等于把提权
 *    路径原样搬到另一个插件的路由上；固定成启动快照之后，HTTP 侧无论怎么组合都拿不到授权。
 * 3. **HTTP 仍然可以关掉它**（降权随时可用）：紧急刹车不能依赖重启。
 * 4. 配置里的 `true` **不算授权**：它与 HTTP 写进去的值存在**同一个** settings 存储里，分不出
 *    来源；只认环境变量才是能说清的规则（升级影响见各包 README）。
 *
 * ## 威胁模型边界（写清楚，免得把这一层当万能）
 *
 * 拦的是**凭空提权**（盲发进程 / 跨站页面 / 被拿下的 renderer）。能读写本机文件、能改宿主
 * 环境的**同用户全权进程不在模型内**：它本来就能读 `~/.dsh/.credentials.yaml`、能直接跑
 * `docker`。任何进程内机制都拦不住它。
 */
/** 环境变量取值的白名单（大小写不敏感）。**只有这些值算授权**，其余（含 `0` / `false` / 空）都算没授权。 */
const TRUTHY = new Set(['1', 'true', 'yes', 'on']);
/**
 * 每个能力名在**本进程内**第一次查询时采样一次的结果。
 *
 * 缓存而不是每次 `process.env` 现读，是这一层的核心（见文件头第 2 条）：`process.env` 是可以
 * 被别的插件在运行期改写的（环境变量卡片就会这么做，而那条路有 HTTP 入口）。采样点落在
 * 插件 `apply()` 期（此时 HTTP 还没开始服务），此后固定——HTTP 侧再怎么组合都拿不到授权。
 */
const grants = new Map();
/** 宿主侧是否授予了这条能力（**进程内采样一次**；缺省 = 未授权）。 */
export function capabilityGranted(spec) {
    const env = typeof spec === 'string' ? spec : spec.env;
    const cached = grants.get(env);
    if (cached !== undefined)
        return cached;
    const raw = process.env[env];
    const granted = typeof raw === 'string' && TRUTHY.has(raw.trim().toLowerCase());
    grants.set(env, granted);
    return granted;
}
/**
 * 「怎么授权」的一句话（给界面与错误文案共用）。
 *
 * 刻意把**两步**都说出来：设置环境变量 + 重启宿主。只说「去设置里打开」会让人在卡片上
 * 反复点一个点不动的开关——这正是本仓最忌讳的「配了没反应」。
 */
export function capabilityHowTo(spec) {
    return `在宿主侧设置环境变量 ${spec.env}=1（可用 设置 → 环境变量 卡片写入 ~/.dsh/env.yml）并重启宿主；HTTP 侧只能关闭它、不能打开`;
}
/** HTTP 尝试把未授权的能力打开时的 400 文案（插件路由直接用）。 */
export function capabilityDeniedMessage(spec) {
    return `「${spec.label}」未获宿主授权，HTTP 侧无法打开（这是刻意的：本机任意进程都能发回环请求，若配置路由能提权，这道闸门等于没有）。${capabilityHowTo(spec)}。`;
}
/**
 * 仅供单测：清掉进程内采样缓存，让下一次查询重新读环境变量。
 *
 * **生产代码不许调用**（调用它等于把「只在启动时采样」这条约定作废）。测试用它模拟
 * 「宿主启动时就带了这个环境变量」。
 */
export function __resetCapabilityGrantsForTest() {
    grants.clear();
}
//# sourceMappingURL=capability.js.map