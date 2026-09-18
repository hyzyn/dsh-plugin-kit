/**
 * @hyzyn/dsh-kit-settings — kit 插件配置入口（宿主半体）。
 *
 * 本包几乎全部工作都在浏览器半体（./client）：
 *
 *   DSH ≥0.1.6-alpha.2 把插件配置从「设置 → 插件 → 插件配置」搬到了侧边栏的
 *   「插件」页，设置里那一行只剩只读清单（`settings.plugin.item` 已退役）。
 *   设置大类这个扩展点（`settings.section`）官方仍然支持——官方的「通用设置 /
 *   模型 / 内置插件 / Agent 预设 / 已归档会话」五行都是这么注册的。
 *
 *   本包就注册额外的一行，把 dsh-plugin-kit 各插件的配置表单收在设置里：
 *   它声明 `settings.section`（id `kit`）与子 slot `settings.kit.item`，
 *   kit 各插件把自己的卡片注册进那个子 slot，由本页渲染成熟悉的可折叠卡片。
 *
 * 宿主半体只负责让这个包在 Loader 里成为一行（bundle patch 的 insert 行），
 * 不注册路由、不占用 settings 命名空间、不向 systemPrompt 注入任何东西。
 */
/** 稳定插件 id：等于 cordis.patch.yml 中 insert 行的 id。 */
export declare const name = "kit-settings";
/** 不依赖任何宿主服务。 */
export declare const inject: string[];
/** 挂载：只在宿主日志留一行，方便排查「设置里那一行为什么没出现」。 */
export declare function apply(): void;
