/**
 * @hyzyn/dsh-codegraph — DSH Web GUI 的 Codegraph 集成插件（宿主半体）。
 *
 * 机制：本插件在宿主进程里调用 `codegraph` CLI，把索引状态、符号搜索、
 * 调用链、影响面等能力暴露成 /api/dsh-codegraph/* 路由；浏览器半体
 * （./client）把这些路由渲染成设置 → 插件 里的「Codegraph」卡片。
 *
 * 与 MCP 的关系：MCP 让模型直接调用 codegraph_explore / codegraph_node；
 * 本插件补上 Web GUI、人工操作（sync/index）和 systemPrompt 自动提示。
 * 此外本插件托管 codegraph MCP 服务器行（~/.dsh/cordis.patch.yml）：把
 * `codegraph serve --mcp` 子进程的 cwd 与默认项目路径对齐——dsh-mcp-client
 * 不声明 MCP roots 能力，服务器只能从 cwd 向上找 .codegraph/，宿主从家
 * 目录启动时所有工具都会拿到 "No CodeGraph project is loaded"。默认项目
 * 路径变化（卡片一键切换 / 配置修改）即同步重写该行，watchUserPatches
 * 热加载后 MCP 服务器自动挂载到新项目。
 */
import type { Context } from '@deepseek-ai/cordis';
export interface Config {
    /** 关闭整个插件（不注册路由、不发布提示）。默认开。 */
    enabled?: boolean;
    /** 是否向 agent 注入插件能力公告。默认开。 */
    announceToAgent?: boolean;
    /** 是否向 systemPrompt 注入 CodeGraph 使用指引（CODEGRAPH_START 区块）。默认开。 */
    usageGuidance?: boolean;
    /** codegraph CLI 命令，默认 `codegraph`。 */
    command?: string;
    /** 默认项目路径，默认 `process.cwd()`。 */
    defaultPath?: string;
    /**
     * 是否托管 codegraph MCP 服务器行（cwd 对齐默认项目路径，变更即热切换）。
     * 默认开。关闭时撤销本插件写入的托管行，不碰 MCP 卡片的托管区块。
     */
    mcpIntegration?: boolean;
    /**
     * 查询类命令（status/query/callers/callees/impact/node）的超时毫秒数。
     * 默认 60000。超大仓库上 `status` 的首次数也会变慢，可按需调大。
     */
    cliTimeoutMs?: number;
    /**
     * 索引类命令（sync / index）的超时毫秒数，默认 600000（10 分钟）。
     * 单独一档是因为 `codegraph index` 全量重建在大仓库上必然超过查询档的 60s。
     */
    indexTimeoutMs?: number;
    /**
     * 是否给 `codegraph index` 追加 `--force`。默认关。
     * CLI 拒绝把家目录 / 文件系统根当项目索引，显式 `--force` 才继续。
     */
    indexForce?: boolean;
}
export interface McpSyncDecision {
    /** 期望的 MCP 服务器名（固定 codegraph）。 */
    serverName: string;
    /** 托管行使用的 CLI 命令。 */
    command: string;
    /** 期望的工作目录（= 默认项目路径）。 */
    targetCwd: string;
    /** 联动开关：false 时撤销本插件自己的托管行。 */
    manageEnabled: boolean;
}
export interface McpSyncStatus {
    /** own=本插件区块托管；dsh-mcp=复用 MCP 卡片区块的行；external=区块外有手工行，跳过；none=无托管行。 */
    mode: 'own' | 'dsh-mcp' | 'external' | 'none';
    id?: string;
    cwd?: string;
    disabled?: boolean;
    /** 目标路径是否已有 .codegraph/ 索引。 */
    indexed: boolean;
    note?: string;
}
export interface McpSyncOutcome {
    lines: string[];
    changed: boolean;
    status: McpSyncStatus;
}
/**
 * 纯函数：在 home 补丁文本（按 \n 切成的行数组）上执行一次托管行同步。
 * 无变化时返回原数组引用（changed=false）。文件不存在时传入 ['']。
 */
export declare function syncManagedMcpRow(lines: string[], decision: McpSyncDecision): McpSyncOutcome;
/** 解析后的 CLI 旋钮：超时 / 命令 / index 的 --force。 */
export interface CliResolved {
    command: string;
    cliTimeoutMs: number;
    indexTimeoutMs: number;
    indexForce: boolean;
}
/**
 * 纯函数：把插件配置规范化成 CLI 调用参数。
 * `command` 去空白后为空则回落 `codegraph`；超时只认正有限数；`indexForce` 只认
 * 严格的 `true`（避免 `"false"` 之类的字符串被当成真）。
 */
export declare function resolveCliConfig(config?: Config): CliResolved;
/**
 * `codegraph sync` 参数。`--` 之后的路径位在 commander 里按位置参数解析，
 * 因此路径带 `-` 开头也安全。
 */
export declare function syncArgs(cwd: string): string[];
/**
 * `codegraph index` 参数。`--force` 必须排在 `--` 之前（`--` 之后一律按位置参数
 * 处理）；顶层 help 把它藏起来了，但 `codegraph index --help` 里在。
 */
export declare function indexArgs(cwd: string, force: boolean): string[];
/** 命令名按 cmd.exe 规则转义（空格也是元字符，所以带空格的路径由 `^ ` 保护）。 */
export declare function escapeCommand(command: string): string;
/**
 * 单个参数按 cmd.exe 规则转义成 `"..."`。算法同 cross-spawn，依据
 * <https://qntm.org/cmd>：先按 Windows argv 规则双写「紧邻双引号的反斜杠」
 * 与「结尾反斜杠」，再整体加引号，最后把包括这对引号在内的元字符逐个 `^`。
 * 两层的次序不能换：`^` 由 cmd.exe 吃掉，引号留给子进程的 argv 解析。
 */
export declare function escapeArgument(value: string): string;
/** 把一个 argv 拼成 `cmd.exe /d /s /c` 能直接执行的一整条命令行。 */
export declare function windowsCommandLine(command: string, args: string[]): string;
export declare const name: string, inject: string[] | undefined, apply: (ctx: Context, config?: Config | undefined) => void;
