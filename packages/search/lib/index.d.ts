import type { Context } from '@deepseek-ai/cordis';
export interface Config {
    /** 关闭整个插件（不注册路由、不注入 GUI）。默认开。 */
    enabled?: boolean;
    /** 单类结果最大条数。默认 8。 */
    maxResults?: number;
    /** 是否搜索历史会话。默认 true。 */
    includeSessions?: boolean;
    /** 是否搜索 Prompt。默认 true。 */
    includePrompts?: boolean;
    /** 是否搜索 MCP 工具。默认 true。 */
    includeMcpTools?: boolean;
    /** 是否搜索设置面板（设置 → 插件 → 插件配置）。默认 true。 */
    includePanels?: boolean;
    /** 是否向 agent 注入插件能力公告。默认开。 */
    announceToAgent?: boolean;
    /** 会话回退扫描的最大会话数（宿主 FTS 不可用时的保护上限）。默认 80。 */
    maxScanSessions?: number;
}
export declare const name: string, inject: string[] | undefined, apply: (ctx: Context, config?: Config | undefined) => void;
