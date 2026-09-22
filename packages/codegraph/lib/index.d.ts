/**
 * @hyzyn/dsh-codegraph — DSH Web GUI 的 Codegraph 集成插件（宿主半体）。
 *
 * 机制：本插件在宿主进程里调用 `codegraph` CLI，把索引状态、符号搜索、
 * 调用链、影响面等能力暴露成 /api/dsh-codegraph/* 路由；浏览器半体
 * （./client）把这些路由渲染成插件配置里的「Codegraph」卡片。
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
     * `0` 表示不限时（CG23：以前 0 会被静默回落成 60s）；负数 / NaN 仍回落默认值。
     */
    cliTimeoutMs?: number;
    /**
     * 索引类命令（sync / index）的超时毫秒数，默认 600000（10 分钟）。
     * 单独一档是因为 `codegraph index` 全量重建在大仓库上必然超过查询档的 60s。
     * `0` 表示不限时；超时后进程整树被收（SIGTERM，3s 后升级 SIGKILL，CG05）。
     */
    indexTimeoutMs?: number;
    /**
     * 是否给 `codegraph index` 追加 `--force`。默认关。
     * CLI 拒绝把家目录 / 文件系统根当项目索引，显式 `--force` 才继续。
     */
    indexForce?: boolean;
    /**
     * 是否在检测到索引过期（CLI 的 `reindexRecommended` 等信号）时**自动重建**。
     * 默认**关**——重建在大仓库上是分钟级操作，不经用户同意就起进程不合适。
     *
     * 注意语义是「重建」而不是「增量同步」：实测（codegraph 1.6.0）
     * `codegraph sync` 对「提取器版本落后」这种过期**返回 "Already up to date" 且不清除
     * 信号**——`sync` 只处理文件改动，版本/提取器不匹配只有 `index` 能修。
     * 详见 ADOPTION-AUDIT.md 同一轮的实测记录。
     */
    autoReindex?: boolean;
}
/** 一次 tool/call 的归类结果：codegraph / 文件探索 / 其它（不计入分母）。 */
export type ToolCallBucket = 'codegraph' | 'file' | 'other';
/**
 * 纯函数：把一次工具调用归类。
 *
 * 判定顺序（每一步都有理由）：
 *   1. codegraph 优先——万一某个自定义工具名两头都沾，宁可记成 codegraph
 *      （少算分母＝对既有实现更保守）；
 *   2. 媒体 / web 类直接判 other，不参与分母；
 *   3. 其余按文件探索模式匹配。
 */
export declare function bucketToolCall(name: unknown): ToolCallBucket;
/** 一个项目的采纳率计数：codegraph 调用数 / 文件探索调用数。 */
export interface AdoptionCounts {
    codegraph: number;
    /** 宽口径分母：所有文件探索类调用（含 `read`）。 */
    file: number;
    /**
     * 窄口径分母：**发现类**调用（grep / glob / search / find / list）。
     *
     * 为什么要单独记：`read` 在真实历史里占绝对的多数（实测 1956 次 vs grep 100 次），
     * 而它多半是「打开我已经知道要改的那个文件」——codegraph 替代的是**找东西**，
     * 不是读一个已知路径。把 read 算进分母等于要求它替代一个它本就不该替代的场景，
     * 采纳率会被永久压到个位数（实测宽口径 2.2% vs 窄口径 28.8%）。
     */
    discovery: number;
    /** 其它工具调用（不计入采纳率，但能说明「这个会话到底在干什么」）。 */
    other: number;
}
/** 按项目（会话 cwd 解析出的索引根）聚合的表。 */
export type AdoptionTable = Map<string, AdoptionCounts>;
export declare const emptyCounts: () => AdoptionCounts;
/**
 * 纯函数：把一次工具调用折进表里，返回新的计数（不修改入参）。
 *
 * 为什么按键为「项目根」而不是会话 id：采纳率要回答的是「**这个仓库**里模型用不用
 * codegraph」，而同一个仓库可以有很多会话（换会话、开子 agent、重启宿主）。按会话
 * 分会把数据打散成一堆都不到 10 次的小样本，没有统计意义。项目根的解析口径与
 * 托管行 cwd、注入门禁完全一致（`resolveIndexedRoot` 命中祖先索引），所以
 * 「仪表说这个项目已索引」与「提示词确实注入了」永远同步。
 */
export declare function foldToolCall(table: AdoptionTable, name: unknown, projectKey: string): AdoptionTable;
/** 一个项目的采纳率摘要（给卡片与 `/metrics` 用）。 */
export interface AdoptionSummary {
    /** 项目键（已索引仓库根；拿不到索引时是会话 cwd）。 */
    project: string;
    /** 该项目是否真是有效索引——决定这个项目的数字有没有意义。 */
    indexed: boolean;
    codegraph: number;
    file: number;
    discovery: number;
    other: number;
    /** 宽口径分母（codegraph + 所有文件探索调用）。 */
    exploratory: number;
    /** 窄口径分母（codegraph + 发现类调用）——**这个才是该看的数**。 */
    discoveryTotal: number;
    /**
     * 宽口径采纳率：codegraph / exploratory。分母为 0 时 undefined，**不是 0**
     * （「一次都没探索」与「探索了但全用 grep」是两回事）。
     *
     * 注意它通常很低（实测 2.2%），因为 `read` 占了分母的绝大多数——**不要**用它
     * 下结论，用 `discoveryRate`。
     */
    rate?: number;
    /** 窄口径采纳率：codegraph / discoveryTotal。实测 28.8%，这才是有效指标。 */
    discoveryRate?: number;
}
export declare function summarizeAdoption(project: string, counts: AdoptionCounts, indexed: boolean): AdoptionSummary;
/** 把采纳率拍成一句人话（卡片与诊断包共用，避免两处文案漂移）。 */
export declare function describeAdoption(summary: AdoptionSummary): string;
/**
 * 目标目录的索引状态：
 *   - `indexed`：本目录或某个祖先（到 git 根为止）有带索引库的 `.codegraph/`；
 *   - `missing`：一路上（到 git 根 / 文件系统根为止）连 `.codegraph/` 都没有；
 *   - `not-a-project`：路上第一个 `.codegraph/` 存在却没有索引库——最典型的就是
 *     **家目录**（`~/.codegraph` 是 codegraph CLI 的安装目录）。
 */
export type IndexState = 'indexed' | 'missing' | 'not-a-project';
/** locateIndex 的结果：状态 + 命中的项目根（只有 indexed 才有）。 */
export interface IndexLookup {
    state: IndexState;
    /** 持有 .codegraph/ 索引库的目录（可能是 path 本身，也可能是祖先）。 */
    projectPath?: string;
}
/**
 * 判定项目索引，并把命中根一起带出来（CG02）。
 *
 * 两件事都不能只看「本目录有没有 `.codegraph/`」：
 *
 * 1. **向上解析**：CLI 自己从 `--path` 向上找 `.codegraph/`（`codegraph status --json
 *    -- packages/codegraph` 实测返回 `projectPath=<仓库根>`、`initialized:true`）。旧的
 *    只看本目录实现让 monorepo 子目录里的会话永远判定「未索引」：followSession 永久回落、
 *    「设为默认项目」回 400 还诱导用户在子目录里再 init 一份嵌套索引、卡片同一屏先说
 *    「已索引」又说「不是有效索引」。现在与 CLI 同口径：从 path 向上走到**git 根为止**
 *    （没有 .git 就走到文件系统根），命中第一个带索引库的 `.codegraph/` 即 indexed，
 *    根就是那个目录。monorepo 里托管行的 cwd 因此钉在**仓库根**上——CLI 从那里向上
 *    找得到，从子目录向上也找得到，两边等价，但根才是「项目」。
 * 2. **不能把家目录算成项目**：codegraph CLI 的安装目录就是 `~/.codegraph`（`current ->
 *    versions/<v>`、`bundles/`、`codegraph.lock`，没有任何 .db）。按目录存在判会把
 *    MCP 的 cwd 钉在家目录上并报告一切正常，而 `codegraph status --json -- ~` 实际
 *    返回 `initialized:false`。所以一路向上遇到第一个 `.codegraph/`（不管有没有库）
 *    就停——它是 CLI 的停止点：有库 → indexed；没库 → not-a-project。
 *
 * 读目录失败（权限等）按「此处没有」处理继续向上——宁可不动现有 cwd，也不把好配置改坏。
 */
export declare function locateIndex(path: string): IndexLookup;
/** 只取状态的便捷形式（既有导出，保持签名不变）。 */
export declare function indexState(path: string): IndexState;
/**
 * 命中已索引时返回项目根（可能向上跳了几级），否则 undefined。
 * 「设为默认项目」与托管行 cwd 都用根：绑定子目录会把索引钉在半山腰（CG02）。
 */
export declare function resolveIndexedRoot(path: string): string | undefined;
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
    /**
     * 托管行现有 cwd 的目录是否还存在（没有 cwd 或检测失败时缺省）（CG12）。
     * 项目被删 / uninit 后坏行会一直留在文件里——没有 fs.watch，至少让卡片看得见。
     */
    cwdExists?: boolean;
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
 * `command` 去空白后为空则回落 `codegraph`；超时只认非负有限数（0 = 不限时）；
 * `indexForce` 只认严格的 `true`（避免 `"false"` 之类的字符串被当成真）。
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
 * `codegraph unlock` 参数：清掉挡住索引的陈旧锁文件。
 *
 * CLI 语义（1.6.0 实测）：没有锁时 exit 0 + "No stale lock files found"，有锁时删除
 * `codegraph.lock` 一类产物。**幂等**，所以卡片可以放心地把它当成一个普通按钮。
 */
export declare function unlockArgs(cwd: string): string[];
/**
 * 读 `status --json` 输出里的过期信号（宿主侧版本）。
 *
 * 为什么要在宿主侧也实现一遍：卡片那侧（`client-src/pure.js` 的 `staleReasons`）只负责
 * **显示**，而自动重建要在宿主里**决策**。两处必须同口径，否则会出现「卡片说还没过期、
 * 宿主偷偷重建」或者反过来。判定刻意保持极简：只看 CLI 自己给的字段。
 *
 * 实测（1.6.0）：`sync` 对「提取器版本落后」这类过期**返回 "Already up to date" 且
 * 不清除信号**——所以过期只能靠 `index` 重建修，不能靠 sync。这正是本函数存在的理由。
 */
export declare function staleReasonsFromStatus(status: unknown): string[];
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
 * 收尾判定（纯函数，便于覆盖「超时与 close 竞态」）。
 *
 * 为什么必须显式带 `timedOut`：超时时我们先置标志再收进程树，而被杀的子进程会先
 * 触发 `close`——不认这个标志的话，close 分支会抢先以「Command failed: …」结案，
 * `cliErrorMessage` 就认不出超时，卡片报的错也不会点名 `cliTimeoutMs` /
 * `indexTimeoutMs`（Windows CI 上实测到的就是这个）。反过来，**非**超时的信号死亡
 * （被用户 / OOM 杀掉）不会进这个分支，卡片也就不会谎报「超时」。
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
/** 登记表里的一项（给卡片用）。 */
export interface ProjectEntry {
    /** 索引所在的仓库根（不是会话 cwd——monorepo 子目录会归到根）。 */
    path: string;
    /** 已索引 / 未索引（后者也列，但标出来，因为「一键切换」对它是无效操作）。 */
    indexed: boolean;
    /** 多久之前见过它（毫秒）——列表按这个排序，「最近用过的」在最上面。 */
    seenAgoMs: number;
    /** 最近一次是**怎么**被看到的（排障用，也解释它为何在列表里）。 */
    via: string;
}
/** `/metrics` 访问口：路由只读快照。 */
export interface MetricsAccess {
    snapshot(): {
        projects: Record<string, AdoptionCounts>;
        summaries: AdoptionSummary[];
        /**
         * 按「是否有效索引」分组的合计（实测结论：必须分组——未索引项目里模型本来
         * 就不该用它，混进来会把整体采纳率拉低且毫无意义。见 ADOPTION-AUDIT.md）。
         */
        grouped: {
            indexed: AdoptionSummary;
            unindexed: AdoptionSummary;
        };
        since: number;
    };
}
export declare const name: string, inject: string[] | undefined, apply: (ctx: Context, config?: Config | undefined) => void;
