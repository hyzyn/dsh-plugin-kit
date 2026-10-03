/**
 * 作用域门：目标只能**从指定目录**访问，缺省拒绝。
 *
 * ## 为什么它在 `kit` 里
 *
 * 这条判据有**三个**互不相干的消费者：数据面（`devdata`）、前端验活（`devfront`）、
 * 以及将来的环境编排（`devenv`）。而且它同时是**运行时**判据——插件挂进 profile 后
 * 由宿主用**纯 Node** 加载，跨包 import 一份 `src/*.ts` 是走不通的（见 `devfront` 记-6）。
 * 所以它属于唯一的共享库，而不是任何一个插件包。
 *
 * ## 为什么是「缺省拒绝」而不是「缺省放行」
 *
 * 这条同时解决两件事：
 *
 * 1. **并行 agent 的隔离**（plan §3.8）。多个 worktree 各跑一个 agent 时，工作目录是唯一天然
 *    的区分依据；按目录收敛作用域，等于让「A 项目的 agent」看不到「B 项目的库」，**不需要**先有
 *    一份完整的隔离基础设施。
 * 2. **误连的护栏**。本套件的目标里混着共享联调环境（`161` 上 34 个容器），
 *    一个在别的项目目录里跑的 agent 不该顺手连上它。
 *
 * ## 与 nyetdb 的口径一致
 *
 * 它每个连接声明 `allowed_dirs`：**absent or empty means denied everywhere, fail closed**。
 * 本模块照抄这个语义——空数组不是「不限制」，是「处处拒绝」。
 */
/** 算作用域判定结果。 */
export interface ScopeDecision {
    allowed: boolean;
    /** 拒绝时的原因（给人看；`rejection.ts` 的码由调用方补）。 */
    reason?: string;
}
/**
 * 展开 `~` / `~\` 前缀。与 `kit` 的 `dshHome()` 同一语义（单独的 `~` = 家目录本身）。
 *
 * 语义与同包的 `expandHomePath`（`services.ts`）一致；两处都是纯字符串处理，
 * 这里独立实现是为了不给 `services.ts` 增加导出面。
 */
export declare function expandHome(value: string): string;
/** 归一化一个路径：展开 `~` + 转绝对 + 去掉尾部分隔符（`/a/b/` 与 `/a/b` 视为同一个）。 */
export declare function normalizeDir(value: string): string;
/**
 * `child` 是否在 `parent` 之内（含相等）。
 *
 * 用 `relative` 而不是字符串前缀比较：`/work/app2` 以 `/work/app` 为前缀，但**不是**它的子目录——
 * 前缀比较会把它误判为命中，那正好是「一个项目目录看到另一个项目的库」这类事故。
 * 也利用 `relative` 自带的分隔符归一（Windows 上 `\` 与 `/` 都认）。
 */
export declare function isWithin(parent: string, child: string): boolean;
/**
 * 判定工作目录是否在目标的允许作用域内。
 *
 * **空 / 缺失 / 全是空串 → 处处拒绝**（fail closed）。这不是保守过头：目标配置里的一份空列表
 * 与「没配过」在语义上无法区分，而两者都**不构成授权**。
 *
 * @param scopeDirs - 目标声明的允许目录（可为相对路径、`~` 开头）
 * @param cwd - 当前工作目录（调用方给；内核不读 `process.cwd()`，便于测试）
 */
export declare function decideScope(scopeDirs: readonly string[] | undefined, cwd: string): ScopeDecision;
