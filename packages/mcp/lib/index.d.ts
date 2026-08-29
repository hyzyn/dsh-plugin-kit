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
export declare function apply(ctx: Context, config?: Config): void;
export {};
