import type { Context } from '@deepseek-ai/cordis';
export declare const name = "mcp-config";
export declare const inject: string[];
export interface Config {
    /** 关闭整个插件（不注册路由、不发布提示）。默认开。 */
    enabled?: boolean;
    /** 是否向 agent 注入插件能力公告。默认开。 */
    announceToAgent?: boolean;
}
interface JsExpr {
    __jsExpr: string;
}
interface ReconnectConfig {
    enabled?: boolean;
    initialDelayMs?: number;
    maxDelayMs?: number;
    maxAttempts?: number;
}
/** 与 @deepseek-ai/dsh-mcp-client 的 Config 对齐（env/headers 值可为 !!js 表达式）。 */
interface McpServerConfig {
    serverName: string;
    transport: 'stdio' | 'streamable-http';
    command?: string;
    args?: string[];
    env?: Record<string, string | JsExpr>;
    cwd?: string;
    url?: string;
    headers?: Record<string, string | JsExpr>;
    toolCallTimeoutMs?: number;
    failOnStartupError?: boolean;
    reconnect?: ReconnectConfig;
}
interface McpRow {
    id: string;
    config: McpServerConfig;
    disabled?: boolean;
}
/** 纯函数：把托管区块（含首尾标记行）拼进 home 补丁文本，保留区块外的所有内容。 */
export declare function spliceManagedBlock(text: string, rows: McpRow[]): string;
/**
 * 保存前的「清空防护」判定：返回拒绝文案，放行则返回 undefined。
 *
 * 为什么需要：`/servers/save` 是**整表替换**语义——请求体里的 servers 就是全部内容，
 * 空数组等于把托管区块清空。卡片若因启动竞态、陈旧快照或任何自动化拿到空列表，
 * 一次保存就会把已配置的服务器全部抹掉，而文件里不会留下任何痕迹（实测踩过）。
 *
 * 因此空列表必须由调用方显式确认（`clearAll: true`）；卡片只在用户明确删光时才带。
 * 区块本来就是空的（existing === 0）不构成破坏，放行——免得把「保存一张空卡片」
 * 变成一个没必要的报错。
 */
export declare function emptyServersRejection(incoming: number, existing: number, clearAll: unknown): string | undefined;
/**
 * 提交前的「外部重名」检测：serverName 被**本插件之外**的 mcp-client 实例占用时拒绝。
 *
 * 为什么必须拦：mcp-client 的工具按 serverName 命名（`mcp__<serverName>__<tool>`），
 * 同名两个实例抢同一套工具名，其中一个必然加载失败——而在文件里看不出谁失败了，
 * 用户只会看到「加进去了但不生效」。外部实例（例如 Codegraph 插件自管的 codegraph）
 * 不在本插件的托管区块里，本插件也不该把别人的行挪进自己的区块，所以正确动作是拒绝。
 *
 * **只拦「新引入」的重复**：某条已保存的行如果本来就带着这个外部同名实例（历史遗留），
 * 放行——否则用户连别的字段都改不了，编辑另一行也会被这条历史问题挡住。用户真要清理，
 * 应当删除或改名那条行本身。
 *
 * @param incoming 本次提交的行（id + serverName）。
 * @param existing 当前文件里已保存的行（用于识别「本来就存在」的重复）。
 * @param external 本插件之外的 mcp-client 实例（`externalMcpEntries` 的结果）。
 */
export declare function externalNameRejection(incoming: Array<{
    id: string;
    serverName: string;
}>, existing: Array<{
    id: string;
    serverName: string;
}>, external: Array<{
    id: string;
    serverName: string;
}>): string | undefined;
export declare function apply(ctx: Context, config?: Config): void;
export {};
