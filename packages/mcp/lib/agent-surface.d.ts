/**
 * MCP 工具面的**按需加载**（`agentToolLoading: 'on-demand'`，2026-10-25）。
 *
 * ## 为什么不是「不注册」
 *
 * 本机的 `mcp__*` 工具在真实会话里占工具表的**一半**（单次实测：149 个工具 130,439 B，
 * 其中 MCP 70 个 66,362 B ≈948 B/个，≈1.7 万 token/请求；取真实会话的 `request/header`
 * 快照，量级而非承诺值，README 的同名小节记了口径）。但 MCP 工具必须由宿主
 * `dsh-mcp-client` 注册（进程模型、patch 行格式都不该被本插件改），所以本层的做法是：
 * **注册照旧，用 `tools.restrict` 把它们从 agent 的模型视图里摘掉**——请求体里不再有那 66KB，
 * 与「不注册」等价；模型只看到 `mcp_servers` / `mcp_load` 两个索引工具，需要时自己装载。
 *
 * 判据：`tools.restrict` 的投影就是模型请求拿到的工具表（受限档 19→10 那条链已验证，
 * 见 `scripts/verify-tier-restrict.mjs`）。
 *
 * ## 与 `attachTierRestrict`（`@hyzyn/dsh-kit`）的分工
 *
 * 两层**互不干扰**、判据正交：
 *   - 档位那条（kit）：受限档下 write / exec 类工具**永远**不可见，`mcp_load` 也装载不回来；
 *   - 本层：按「已装载的 server」裁 `mcp__*`，与档位无关。
 * 两条限制在宿主的 scope 层里**取交集**（`restrict` 可叠加），所以「受限档 + 已装载 jenkins」
 * 的结果仍是零 `mcp__*`——安全边界没有被这条新路径放宽，模型只是多了一个「先声明要什么」的回合。
 *
 * ## 为什么名单必须现算（与 kit 同一个坑）
 *
 * `restrict()` 对**任何一个**不在全局注册集里的名字整体抛错（`unknown global tool …`），
 * 所以 deny 只能由 `schemas()` 投影出的真实名字现算：注册了才裁，没注册不点名。也正因为如此，
 * `tools/change`（server 后连上 / 插件热重载）必须按**新注册集**重算——否则新连上的 server
 * 会带着全套工具露在模型面前。
 *
 * ## 只裁「我们管的」（`managed`）
 *
 * `mcp__*` 不是本插件专属前缀：用户手写、或别的插件托管的 mcp-client 行，注册出来的工具长得
 * 一模一样。而 `mcp_load` 的白名单只来自本插件的托管行——把外部行一起裁掉，等于把它们**永久
 * 隐藏且装不回来**（模型连它们的存在都看不到）。所以 {@link planSurfaceDeny} 只点名
 * 「属于托管行且未装载」的那些，外部行与解析不出归属的名字一律不碰（与 `eager` 时一致）。
 * 这是本仓「不碰非本插件的工具」那条在按需加载这一层的落点。
 *
 * ## 生命周期
 *
 * `agent/created` 挂、`agent/disposed` 撤、`tools/change` 合并重算、插件卸载全撤（返回的
 * disposer）。**全程不抛**：`agent/created` 是 serial 派发，在这里抛会让会话起不来，而本层
 * 只影响「模型看得见什么」，没有资格让会话失败。
 */
import type { Context } from '@deepseek-ai/cordis';
/** `schemas()` 投影里本模块只用到的字段（`name` 是唯一的键）。 */
interface ToolSchemaLike {
    name?: unknown;
}
/**
 * `tools` 服务在本模块用到的两个方法（结构化声明——本包不依赖宿主包的类型）。
 *
 * `schemas` 是公开方法，**不传 scope = 全局视图**；`restrict` 只能从 **agent 自己的 ctx** 上取到
 * 带 scope 的那一份（见 {@link toolsOf}）。
 */
export interface ToolsServiceLike {
    schemas(scope?: unknown): ReadonlyArray<ToolSchemaLike>;
    restrict?(filter: {
        allow?: readonly string[];
        deny?: readonly string[];
    }): () => void;
}
/** agent 事件里用到的最小形状（与 kit `attachTierRestrict` 同款：字段全可选，结构化不依赖 dsh-agent）。 */
export interface AgentLike {
    id?: unknown;
    session?: unknown;
    ctx?: unknown;
}
/** `mcp_load` 的结果（`mcp_load` 工具的返回值就是它，外加可选的 `note`）。 */
export interface SurfaceLoadResult {
    /** 真正装载（去重、只留认识的）的 server 名。 */
    loaded: string[];
    /** 请求里不认识、**没有装载**的 server 名。 */
    unknown: string[];
    /** 装载后该 agent 视图里真实的 `mcp__*` 名字（现算，顺序跟随注册集）。 */
    tools: string[];
}
/** 台账的读 / 写入口（`mcp_servers` / `mcp_load` 两个工具通过它拿状态与下装载动作）。 */
export interface AgentSurfaceControl {
    /** 该 agent 已装载的 server 名（没登记过 = 空数组）。 */
    loadedServers(agent: unknown): string[];
    /** 装载（**替换**语义）：把这些 server 的工具放进该 agent 的视图，空数组 = 全部卸掉。 */
    load(agent: unknown, servers: readonly string[]): SurfaceLoadResult;
    /** 该 agent 当前能看到的 `mcp__*` 名字（由注册集与台账现算，不依赖限制是否已落地）。 */
    visibleTools(agent: unknown): string[];
}
/**
 * `attachAgentSurface` 的选项。
 *
 * `onReady` 是**可选**的交接位：契约把返回值钉成纯 `() => void`（处理器只负责撤），而两个
 * 工具需要拿到台账才能下装载动作——加一个可选回调，既不破返回值也不破必填字段。
 */
export interface AgentSurfaceOptions {
    /** `false` = 完全 no-op（`eager` 模式：不订阅、不下发任何限制）。 */
    enabled: boolean;
    /** 日志出口（调用方负责加 `[dsh-mcp-config]` 前缀）。 */
    log(message: string): void;
    /** 可装载的 server 名（来自 `buildServersDto`，**不要**在这里另建一份读取逻辑）。 */
    listServers(): readonly string[];
    /** 挂载完成后交接台账入口（`mcp_servers` / `mcp_load` 用它）。 */
    onReady?(control: AgentSurfaceControl): void;
}
/**
 * 需要裁掉的名字：**注册集里「属于托管行（`managed`）且未装载」的 `mcp__*`**（纯函数，顺序跟随
 * `registered`）。
 *
 * - `registered` 必须是 `schemas()` 拿到的**真实注册名**（`restrict()` 对未知名字整体抛错）；
 * - `managed` 是本插件托管区块里的 server 名（`listServers()` = `buildServersDto` 的同一份）；
 * - `loaded` 是 server 名（不是工具名），空数组 = 托管行全部卸掉；
 * - 解析不出 server 的名字（见 {@link serverNameOf}）**不裁**。
 *
 * ## 为什么必须按 `managed` 收口（只裁「我们的」）
 *
 * `mcp__*` 这个前缀**不是本插件专属的**：用户手写的 patch 行、别的插件托管的 mcp-client 实例，
 * 注册出来的工具长得一模一样。而 `mcp_load` 的装载白名单来自本插件的托管行——把不属于我们的
 * 工具也裁掉，等于把它们**永久隐藏且装不回来**（模型连「存在这么个 server」都看不到，`mcp_servers`
 * 也只报托管行）。那违反本仓「不碰非本插件的工具」那条（kit 的 `tier-restrict` 用 `prefixes`
 * 防的正是同一类误伤）。
 *
 * 代价是「外部行在 on-demand 下仍是常驻工具面」——这是**有意的**：我们既不认识它的语义，也没有
 * 装载入口，能做的只有不碰它。要收它，得先把它纳入托管（进 DTO 与 `listServers()`）。
 */
export declare function planSurfaceDeny(registered: readonly string[], loaded: readonly string[], managed: readonly string[]): string[];
/**
 * 在插件作用域上接管 `agent/created`：给每个 agent 的 scope 下一层「`mcp__*` 默认不可见」的
 * 限制，返回撤销函数（撤掉所有已下发的限制 + 退订）。**全程不抛**。
 *
 * 位置：与工具注册同一个 `ctx.effect`（插件禁用 / 卸载时一起撤）。**不要放进工具重注册那条
 * 路径**：热应用配置会重注册工具，而重注册不该把已有 agent 的限制一并撤掉（`agent/created`
 * 不会为老 agent 再发一次，撤了就再也装不回来）。
 *
 * `enabled: false`（`eager` 模式）时**直接返回空 disposer**：不订阅、不打日志、一次 `restrict()`
 * 都不额外发——默认档位的空行为就是「与今天完全一致」。
 */
export declare function attachAgentSurface(toolsCtx: Context, options: AgentSurfaceOptions): () => void;
export {};
