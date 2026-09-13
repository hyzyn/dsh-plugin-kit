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
    /** 会话回退扫描的最大会话数：宿主 FTS 不可用时按会话最近优先截断到此数，上限 500。默认 80。 */
    maxScanSessions?: number;
}
export declare function makeSnippet(text: string, query: string, radius?: number): string;
/**
 * 生成本地扫描的文本过滤器，语义与宿主 compileSessionTextFilter 对齐：
 * 大小写不敏感、空白弹性、正则元字符转义。
 */
export declare function compileLocalTextFilter(query: string): RegExp;
/**
 * 防御式读取会话记录时间（ms）：依次尝试 header 与记录顶层上的
 * time / updatedAt / createdAt / startTime，number 直接用，string 用
 * Date.parse（NaN 视为缺失），取能解析到的最大值；全部缺失返回 undefined。
 */
export declare function readRecordTime(record: unknown): number | undefined;
/**
 * subagent 会话不能作为主会话打开（sessions.open 只接受主会话或已编目的
 * 子会话地址，直接 open 子会话 id 视图是空白），搜索结果里必须排除。
 */
export declare function isSubagentHeader(header: unknown): boolean;
/**
 * 记录按时间降序排列（最近优先）：没有时间的记录排在有时间记录之后并保持原有相对顺序，
 * 有时间记录之间用原索引做稳定 tie-break。
 */
export declare function sortRecordsByTimeDesc<T>(records: T[]): T[];
export declare const name: string, inject: string[] | undefined, apply: (ctx: Context, config?: Config | undefined) => void;
