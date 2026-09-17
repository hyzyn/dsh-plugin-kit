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
     * 是否让托管行的 cwd 跟随当前活动会话的项目（默认开）。
     *
     * 开：会话切到某个**已索引**项目时，托管行 cwd 自动对齐它；会话目录没有索引时
     * 回落到 defaultPath。关：始终用 defaultPath（「设为默认项目」会把这一项关掉，
     * 因为那是一次显式指定）。
     */
    followSession?: boolean;
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
/**
 * 目标目录的索引状态：
 *   - `indexed`：`.codegraph/` 里有真索引库，可以当 MCP 服务器的工作目录；
 *   - `missing`：连 `.codegraph/` 都没有；
 *   - `not-a-project`：有 `.codegraph/` 却没有索引库——最典型的就是**家目录**，
 *     因为 codegraph CLI 把自己的安装数据放在 `~/.codegraph`（`current ->
 *     versions/<v>`、`bundles/`、`codegraph.lock`，没有任何 .db）。
 */
export type IndexState = 'indexed' | 'missing' | 'not-a-project';
/**
 * 判定项目索引。**不能只看 `.codegraph/` 目录是否存在**：codegraph CLI 的安装目录
 * 就是 `~/.codegraph`，于是家目录永远「已索引」——插件会把 MCP 的 cwd 钉在家目录上
 * 并报告一切正常，而 `codegraph status --json -- ~` 实际返回 `initialized:false`，
 * MCP 工具照旧拿 "No CodeGraph project is loaded"（模块头描述的失败模式）。
 *
 * 判据取「目录里存在 .db 文件」而不是写死 `codegraph.db`：索引库文件名可能跨 CLI
 * 版本变化，而安装目录里一个库文件都没有。读目录失败（权限等）按未索引处理——
 * 宁可不动现有 cwd，也不把好配置改坏。
 */
export declare function indexState(path: string): IndexState;
export interface McpSyncDecision {
    /** 期望的 MCP 服务器名（固定 codegraph）。 */
    serverName: string;
    /** 托管行使用的 CLI 命令。 */
    command: string;
    /** 期望的工作目录（= 默认项目路径）。 */
    targetCwd: string;
    /** 联动开关：false 时撤销本插件自己的托管行。 */
    manageEnabled: boolean;
    /**
     * 只读快照：不落盘、也不要「如果写会写成什么」的推测状态。
     *
     * 卡片的状态行问的是「盘上现在是什么」，不是「下次同步会变成什么」。带上这个标志
     * 后，本该新建托管行的分支返回 mode=none（文件里确实还没有行），避免出现「什么都没
     * 写，卡片却显示已自动托管」的幻影状态。
     */
    dryRun?: boolean;
}
export interface McpSyncStatus {
    /** own=本插件区块托管；dsh-mcp=复用 MCP 卡片区块的行；external=区块外有手工行，跳过；none=无托管行。 */
    mode: 'own' | 'dsh-mcp' | 'external' | 'none';
    id?: string;
    cwd?: string;
    disabled?: boolean;
    /** 目标路径是否已有真实索引库（等价于 indexState === 'indexed'）。 */
    indexed: boolean;
    /** 目标路径的索引状态（区分「没有 .codegraph/」与「有但不是项目索引」）。 */
    indexState: IndexState;
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
/**
 * `codegraph init` 参数——在项目里建 `.codegraph/` 并建好首次索引。
 *
 * **刻意不带 `-y`**：那个「Non-interactive: skip every prompt」旗标是 CLI **1.6.0 才有**的，
 * 1.5.0（README 的实测基线，也是不少用户装着的版本）会直接
 * `error: unknown option '-y'` ——无条件带上它，等于把 init 按钮在旧版 CLI 上做废。
 *
 * 而不带它**也不会挂起**：我们的运行器永远是管道、没有 TTY，两个版本实测都自己取默认值跑完：
 *   - 1.5.0（macOS，`codegraph init -- <tmp>`）→ `Done`，建出 `.codegraph/{codegraph.db,.gitignore}`；
 *   - 1.6.0（Windows，`init -- <tmp>`，stdin 开着但不喂任何东西）→ `exited-ok`，同样建好索引。
 * 万一将来某版在无 TTY 下也坚持提问，失败形状是**超时并点名 `indexTimeoutMs`**——看得见，
 * 不会静默卡死。
 *
 * **也不带 `-f`**：CLI 用它兜住「家目录 / 文件系统根」这类误伤，插件不该替用户绕过——
 * 真要强制是用户自己在终端里的事。
 *
 * 与 `index` 的关系（真机实测，别被 help 文案误导）：`index --help` 写着「same result as a
 * fresh init」，但那说的是「全量重建的结果等同于刚 init 完」，**不是**「index 会替你初始化」：
 * 对没有 `.codegraph/` 的目录，`codegraph index` 直接报
 * `CodeGraph not initialized in <path>` + `Run "codegraph init" first`。所以「建立索引」在
 * 未初始化项目上必须走 init，这也是本插件此前唯一还得让用户回终端的一步。
 */
export declare function initArgs(cwd: string): string[];
export { escapeArgument, escapeCommand, taskkillArgs, windowsCommandLine } from '@hyzyn/dsh-kit';
/** 一次调用的结局：成功带 stdout，失败带错误。 */
export type CliRunOutcome = {
    ok: true;
    stdout: string;
} | {
    ok: false;
    error: Error;
};
/**
 * 收尾判定（纯函数，便于在非 Windows 上覆盖「超时与 close 竞态」）。
 *
 * 为什么必须显式带 `timedOut`：超时时我们是先 `taskkill` 再抛错，而被杀的子进程会先
 * 触发 `close`——不认这个标志的话，close 分支会抢先以「Command failed: …」结案，
 * `cliErrorMessage` 就认不出超时，卡片报的错也不会点名 `cliTimeoutMs` /
 * `indexTimeoutMs`（Windows CI 上实测到的就是这个）。
 */
export declare function settleCliRun(input: {
    command: string;
    args: string[];
    timeoutMs: number;
    timedOut: boolean;
    code: number | null;
    stdout: string;
    stderr: string;
}): CliRunOutcome;
/** CLI 探测结果：只判真假的实现会丢掉 ENOENT / 非零退出 / 超时的区别，卡片只能猜原因。 */
export interface CliProbeResult {
    ok: boolean;
    /** 失败原因原文（已截断）；ok 时为 undefined。 */
    error?: string;
    /** 本次探测的时刻（epoch ms）：卡片据此显示「上次探测」，也让「重新探测」有可见反馈。 */
    at: number;
}
/**
 * 路由侧对探测状态的访问口。
 *
 * 为什么是「可重跑的探测」而不是一个 `() => boolean`：探测结果原先在插件挂载时锁存，
 * 于是卡片上「刷新本卡片重试」这句指引**在服务端不可能生效**——刷新只是再读一次同一个
 * 缓存，用户会一直刷到怀疑人生。显式给一个 reprobe 入口，语义比在 GET 里偷偷重探清楚
 * （GET 不该有副作用：重探会顺带增删 systemPrompt section）。
 */
export interface CliProbeAccess {
    /** 当前结果：available 为 undefined 表示还没探测完（JSON 里会整个字段消失）。 */
    get(): {
        available: boolean | undefined;
        error: string | undefined;
        at: number | undefined;
    };
    /** 立刻重跑一次探测，并把结果同步给 systemPrompt 门禁。 */
    reprobe(): Promise<CliProbeResult>;
}
export declare const name: string, inject: string[] | undefined, apply: (ctx: Context, config?: Config | undefined) => void;
