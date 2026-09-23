/**
 * @hyzyn/dsh-kit — 插件 settings 存储适配层（DSH ≥0.1.7 的 SettingsForms）。
 *
 * 为什么需要：DSH 0.1.7 线移除了旧 settings 服务的 `register(ns, schema)` /
 * `get(ns)`，改成 **每个 profile entry 自己的 Config** 作为设置存储：
 *
 *   - 读取：`settings.describe()` 返回各 entry 的 resolved 值（schema 默认值 ← 组合 base
 *     ← 用户层）；
 *   - 写入：`settings.update(entryId, patch)` 只接受 **volatile 字段路径**，写进当前
 *     profile 的 patch（用户层）；
 *   - 生效：loader 检出「只变了 volatile 字段」后**原地更新**配置引用并发
 *     `loader/volatile-update`，不重挂插件——插件必须自己订阅并重读。
 *
 * 因此插件要导出带 `.volatile()` 的运行时 `Config` schema，并把所有对 `config` 的读取
 * 先过 `plainConfig()`：volatile 字段被 schemastery 解析成**冻结引用** `{ get() }`
 * 而不是值本身，直接当普通值用会静默取错或抛 `is not a function`。
 *
 * 本模块只做鸭子类型适配，不依赖 `@deepseek-ai/dsh-settings`；服务缺失（最小宿主 /
 * 单测）时返回 `undefined`，调用方走原有 config 兜底。
 */
import type { Context } from '@deepseek-ai/cordis';
/**
 * 本插件在当前 profile 里的 entry id。
 *
 * loader 挂载时取自 `ctx.fiber.entry.options.id`（与 profile patch 里的 `id:` 一致，
 * 也等于旧 settings 命名空间名）；直接挂载 / 单测拿不到 entry 时回落 `fallbackNs`。
 */
export declare function settingsEntryId(ctx: Context, fallbackNs: string): string;
/**
 * 把一份经 schema 解析的 config 还原成纯数据：volatile 引用取 `.get()`，其余原样
 * （数组/对象递归，保持结构；遇到环也不死循环）。
 *
 * 插件在 `apply` 里拿到 config 后应立刻 `config = plainConfig(config)`，之后所有读取
 * 都按普通值处理；订阅 `loader/volatile-update` 后再对本插件 config 重新跑一次即可。
 */
export declare function plainConfig<T>(value: T): T;
/** 一份插件自己的 settings 读写口：resolved 值 + volatile-only 写 + 变更订阅。 */
export interface SettingsEntryScope {
    /** 本插件的 profile entry id（= 旧 settings 命名空间名）。 */
    readonly ns: string;
    /** resolved 值（默认值 ← 组合 base ← 用户层），纯数据；读取失败返回 `{}`。 */
    get(): Record<string, unknown>;
    /** 把 patch 合并进本 entry 的用户层（字段必须在本插件 Config schema 里标了 volatile）。 */
    update(patch: Record<string, unknown>): Promise<void>;
    /** 订阅本 entry 的 config 变化（含插件自己写和外部改 profile patch），返回退订函数。 */
    onChanged(listener: () => void): () => void;
}
/**
 * 打开本插件的 settings 读写口。宿主没有新版 settings 服务（缺 `describe`/`update`）
 * 时返回 `undefined`——调用方应保留 config-only 兜底，而不是把插件判成挂载失败。
 */
export declare function settingsEntryScope(ctx: Context, fallbackNs: string): SettingsEntryScope | undefined;
/**
 * 只读另一插件 entry 的 resolved 值（如 docker 读 tty 的连接簿）。
 *
 * 旧实现是 `settings.get('tty')`——该方法在 0.1.7 线已不存在。目标 entry 未挂载时
 * 返回 `undefined`，由调用方当「空表」处理。
 */
export declare function readSettingsEntry(ctx: Context, ns: string): Record<string, unknown> | undefined;
/**
 * 关闭 DSH 为本插件 entry 自动生成的配置页。
 *
 * 插件自带 `plugins.row.config` 卡片时用：`describe()` 仍会返回该 entry（写入不受影响），
 * 只是不再自动生成页面。返回 `configure` 给的退订函数；服务或该方法缺失时返回空函数。
 */
export declare function suppressAutoSettingsPage(settingsCtx: Context, owner: Context): () => void;
