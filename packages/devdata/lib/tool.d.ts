/**
 * 工具注册表：agent 的工具面（`docs/devdata-plan.md` §3.6.1）。
 *
 * ## 为什么注册要过矩阵，而不是各写一份清单
 *
 * 「工具清单」与「操作矩阵」是同一件事的两个视角：矩阵说**允不允许**，注册表说**有没有入口**。
 * 两处各写一份必然漂——漂的方向最危险的那种是「矩阵里是 `never`，但工具面里有入口」。
 * 所以本模块的工具全部**声明式**（只写引擎 + 动作 + 参数），由矩阵与目标状态算出可见面：
 *
 * ```
 * 可见工具 = 注册表 ∩ 矩阵受管动作 ∩ (目标允许的档位) − 矩阵 never
 *            ∪ 引擎无关的自证项（list_targets / doctor / capabilities）
 *            ∪ 命令原文入口（仅以命令原文为入口形态的引擎，见下）
 * ```
 *
 * ## 两道不对称的规则（刻意如此）
 *
 * - **`never` 的动作：不注册**（不是「注册了再拒」）。有入口的白名单在 `FLUSHALL` / `EVAL`
 *   这类命令面前是装饰——入口本身就是暴露面。
 * - **写 / 危险读：默认不注册，未授权就不出现**。理由同上，且它还解决一个体验问题：
 *   agent 看不到的工具不会去试，省掉一轮「撞墙 → 读错误 → 改」。
 *   未接入闸门（`CAPABILITY_NOT_DECLARED`）**不算**可见，防止「配了一半」的目标把入口露出去。
 *
 * ## 例外：命令原文形态的引擎（今天只有 Redis）
 *
 * 上面第二条的前提是「同一个动作有另一条只读入口」。Redis **没有**——`GET` 与 `SET` 从同一个
 * 入口进来，藏掉它就等于把只读也一起藏掉。所以那类引擎的可见面是：
 * **一个 `redis_command`（命令原文）+ 引擎无关的自证项**，而结构化动作（`get` / `set` / `keys`…）
 * **不进工具面**（它们在矩阵里照旧登记着，因为解析层算出的动作名要靠它们分档）。
 * 于是「工具名」与「动作名」在那类引擎上不是一一对应的——`preflight` 因此把
 * **入口（可见性）**与**动作（裁决）**分成两个参数（**D03**）。写 / 危险读的闸门全部落在判据层：
 * 可见性挡不住它们，`adjudicate` 挡得住。理由与代价见 `docs/devdata-plan.md` §17.12 / §17.14。
 *
 * 反面规则：**读类始终注册**，即使环境是 `unknown`——可见性与可执行性是两件事，
 * 执行时仍会过 `adjudicate`（§17.2 记过这个顺序教训）。
 */
import { type DevDataTarget } from './adjudicate.js';
import { type Engine, type OperationSpec } from './operations.js';
import { type PlanThresholds } from './plan-guard.js';
import { type RedisParseRejection } from './redis-command.js';
/** 工具分组——就是 agent 的推进顺序：发现 → 理解 → 查询 → 自证。 */
export type ToolGroup = 'discovery' | 'understanding' | 'query' | 'diagnosis';
/** 执行器要求返回的形状（与 `sql.ts` 的 `ShapedResult` 结构兼容）。 */
export interface ExecOutcome {
    ok: boolean;
    /** 成功时的结果（引擎实现负责整形与限行）。 */
    result?: unknown;
    /** 失败时的原因。 */
    message?: string;
}
/**
 * 引擎执行器接口。
 *
 * 内核只依赖这个接口，**不依赖任何驱动**：真实实现（`mysql2` / `forwardOut` / `sqlcmd`）与测试里的
 * 假实现都实现它。这也是为什么本模块与 `tool.ts` 能在没有真机的情况下被完整测试。
 */
export interface ToolExecutor {
    run(request: {
        target: DevDataTarget;
        action: string;
        args: Readonly<Record<string, unknown>>;
        cwd: string;
    }): Promise<ExecOutcome>;
    /**
     * 可选：取查询计划（**执行前**的护栏入口）。
     *
     * 只在 `guardPlanFor` 有值的动作用得到——目前是 SQL 引擎的 `query`。
     * 实现方返回 `undefined` 表示「取不到计划」，内核会按 `PLAN_UNAVAILABLE` **拒跑**
     * （拿不到代价就放行等于没有护栏）。
     */
    explain?(request: {
        target: DevDataTarget;
        sql: string;
    }): Promise<string | undefined>;
}
/**
 * 宿主前置检查的拒绝形状（`preflight` 的原样透传，见 `beforeExecute`）。
 *
 * `code` 用 `REJECTION_CODES` 里的值（或宿主自己的码，如 `AUDIT_NOT_DURABLE`）——**码必须给**：
 * agent 按码决定下一步，而正文是给人读的中文。
 */
export interface PreExecuteBlock {
    code: string;
    message: string;
    hint?: string;
}
/** 一次工具调用的审计行（**含被拒绝的尝试**——那才是「agent 试过什么」的证据）。 */
export interface AuditEntry {
    at: number;
    targetId: string;
    /**
     * 这次调用打到的引擎。**可缺席**：`plugin.ts` 里配置卡片的变更（`config.targets` /
     * `config.scalars` / `config.save`）没有引擎——那不是一次引擎调用，给它编一个（比如恒填
     * `redis`）会让审计行撒谎。工具面那几条一定会填（引擎是它唯一的 subject）。
     */
    engine?: Engine;
    action: string;
    allowed: boolean;
    code?: string;
    /** 调用方给的相关性 id（可选；用于把一次操作串起来）。 */
    operationId?: string;
}
/** 审计出口。写不进去时**不返回结果**（fail closed），由调用方实现这条语义。 */
export interface AuditSink {
    record(entry: AuditEntry): void;
}
/**
 * 域前缀：本包所有 agent 工具的名字都长这样。
 *
 * 这不是审美问题：仓库级守卫（`scripts/test/tool-names.test.ts`）要求工具名是 `<域>_<动作>`，
 * 因为工具名是**模型选工具时唯一看到的标识**——撞族会让模型在同族名字里误选（devfront 的
 * `web_*` 撞上宿主的 `web_search` 就是这么发生的）。本包与 docker / tty / site 并列，用 `devdata_`。
 */
export declare const TOOL_PREFIX = "devdata_";
/** 注册项。 */
export interface ToolSpec {
    /** **工具名**（对 agent 可见的稳定标识，带域前缀）。 */
    name: string;
    /**
     * **矩阵动作名**（`operations.ts` 里的键）。
     *
     * 两个字段分开是必需的：工具名要带域前缀（仓库守卫），而矩阵的动作名是引擎的词汇
     * （`get` / `query` / `lag`），不该被包名污染。绝大多数情况下二者只差前缀；**例外**是命令原文
     * 入口——它的动作由解析层按命令算出，`action` 只是「这条入口归属哪个动作族」的登记。
     */
    action: string;
    /** 分组。 */
    group: ToolGroup;
    /** 参数名清单（描述共用矩阵里的 `summary`，避免两处文案各漂）。 */
    params: readonly string[];
}
/** 动作名 → 工具名（**唯一**的拼法，宿主半体与注册表都从这里取）。 */
export declare function toolNameFor(action: string): string;
/**
 * 全量注册表。
 *
 * 只列**入口**；可不可见由 `visibleTools` 按目标算出。带 `?` 的参数是可选的。
 *
 * 命名口径：**动作名**取矩阵里的动词（`get` / `keys` / `set` / `query` …），跨引擎同义的才用通用名
 * （`search` = SQL 的列名搜索 / Redis 的 `SCAN` / MQ 的消息查询；`sample` = 取样本）；**工具名** =
 * `devdata_` + 动作名（仓库守卫要求 `<域>_<动作>`，见 `TOOL_PREFIX`）。这样「工具 → 动作」一一对应，
 * 两套词汇的漂移会在这里就露出来。
 */
export declare const TOOL_SPECS: readonly ToolSpec[];
/**
 * `list_targets` / `doctor` / `capabilities` 是引擎无关的，任何目标上都可用。
 *
 * **导出**是给 `entries.ts` 用的：入口面要把这三条从「引擎入口」里摘出来——它们不经过执行器
 * （全是本地判定），所以「这个引擎还没有执行器」时它们仍然该在工具面上。
 */
export declare const AGNOSTIC_ACTIONS: readonly string[];
/** 与 `AGNOSTIC_ACTIONS` 一一对应的**工具名**（入口面按工具名过滤）。 */
export declare const AGNOSTIC_TOOL_NAMES: readonly string[];
/**
 * 命令原文入口的**工具名**（带域前缀）。
 *
 * 两个名字要分清：`RAW_COMMAND_TOOL`（`operations.ts`）是这条入口登记的**动作族名**，用于口径判断
 * （「这个引擎的入口形态是命令原文还是结构化」）；而 agent 看到、调用的名字是这一个。
 */
export declare const RAW_COMMAND_TOOL_NAME: string;
/** 可见性算出来的一个入口。 */
export interface VisibleTool {
    /** **工具名**（带域前缀；agent 实际调用的名字）。 */
    name: string;
    /** 这条入口对应的**矩阵动作名**（`adjudicate` 与执行器用的是它）。 */
    action: string;
    group: ToolGroup;
    params: readonly string[];
    /** 矩阵里这条动作的登记项（引擎相关项才有）。 */
    spec?: OperationSpec;
    /** 这一条可见性的理由（给 `capabilities` 工具与排障用）。 */
    why: string;
}
/**
 * 算出一个目标上**可见**的工具面。
 *
 * 纯函数：只看目标状态与矩阵，不读 `cwd`、不连任何东西、不读环境变量
 * （写类的能力判定在这里**不查授权**——授权是执行时的事，见 `invokeTool`；
 * 这里只判断「这一档在原则上可不可能」）。
 */
export declare function visibleTools(target: DevDataTarget): VisibleTool[];
/** 可见工具名的集合（给「工具面 ∩ never = ∅」这类断言用）。 */
export declare function visibleToolNames(target: DevDataTarget): string[];
/** 一次工具调用的结果。 */
export type ToolOutcome = {
    ok: true;
    action: string;
    result: unknown;
} | {
    ok: false;
    action: string;
    code: string;
    message: string;
    hint?: string;
};
/** 工具是否在目标上可见（调用方通常先问这个再 `invokeTool`）。 */
export declare function isToolVisible(target: DevDataTarget, toolName: string): boolean;
/**
 * 把调用方给的**工具名或动作名**解析成一对：入口名（可见性判据）与动作名（裁决 / 执行器判据）。
 *
 * 为什么两种写法都收：`invokeTool` 的调用方有两类——宿主半体（用**工具名**，那是 agent 说的话）
 * 与测试 / 内部（习惯用**动作名**，那是矩阵的词汇）。两种都认，就不会出现「同一个入口有两个名字」
 * 的漂移；而 `visibleTools` 报出来的永远是规范的那个（工具名）。
 *
 * 认不出来时原样返回（两条判据都用它）：那时可见性会拒，而这正是我们要的——不认识的一律拒。
 */
export declare function resolveEntry(toolName: string): {
    entry: string;
    action: string;
};
/**
 * 调一个工具：**先裁决，再执行**。
 *
 * 三件事的顺序是契约：
 * 1. 可见性（不可见的工具直接拒，且**不进入执行路径**）；
 * 2. `adjudicate`（环境 / 作用域 / 矩阵 / 能力）；
 * 3. 执行（经 `ToolExecutor`），然后**写审计**。
 *
 * 审计在**每次调用**都写（含被拒绝的与不可见的）——理由见 `AuditEntry` 的注释。
 * 审计写不进去时**不返回结果**：调用方若实现了 fail closed，结果是「拒绝」而不是「结果 + 未记录」。
 */
export declare function invokeTool(input: {
    target: DevDataTarget;
    toolName: string;
    args?: Readonly<Record<string, unknown>>;
    cwd: string;
    confirmed?: boolean;
    operationId?: string;
    executor: ToolExecutor;
    audit?: AuditSink;
    /** 计划护栏的阈值；不给则**不过护栏**（缺省即无，与清单类配置同一口径）。 */
    thresholds?: PlanThresholds;
    /** 执行前的宿主检查（见 `preflight` 的 `beforeExecute`）。 */
    beforeExecute?: (input: {
        target: DevDataTarget;
        action: string;
    }) => PreExecuteBlock | undefined;
}): Promise<ToolOutcome>;
/**
 * 解析层的拒绝原因 → 工具层的拒绝码。
 *
 * 为什么要区分：**「被明确排除」与「不认识」是两件事**，agent 该做的事也不同——前者没有出路
 * （要走运维流程），后者是打错了字（换个命令就行）。把 `FORBIDDEN_COMMAND` 也报成
 * `UNCLASSIFIED_OPERATION`，会让 agent 一直在命令名上找问题。
 *
 * 其余原因（空输入 / 缺 key / 带壳）都是「这条命令没法裁决」，一律落 `UNCLASSIFIED_OPERATION`：
 * 它们都没有可查的动作名，回落到「执行原文」就等于把白名单关掉。
 */
export declare function parseRejectionCode(reason: RedisParseRejection): string;
/**
 * Redis **命令原文入口**：让 agent 直接发 `SET k v` / `GET k` / `SCAN 0 MATCH a:* COUNT 50`。
 *
 * ## 为什么必须有这条入口，而不是「让 agent 自己拆成结构化参数」
 *
 * 结构化参数把「是哪条命令」这件事交给了调用方——而解析层（`redis-command.ts`）才是那道白名单。
 * 只留结构化入口，等于**让 agent 从白名单旁边绕进执行器**：它可以直接构造 `{ action: 'del', key }`
 * 而解析层永远看不到那条命令。原文入口让「命令 → 动作 → 闸门」的映射由内核自己算，agent 说的
 * 和它实际要做的是同一句话。
 *
 * ## 与结构化入口的关系：**同一条判据链**
 *
 * 解析只决定「这是哪一族动作、动的是哪个 key」。之后的**可见性 → 裁决 → 计划护栏 → 执行 → 审计**
 * 与结构化入口共用同一段 `preflight`（不是「也走 `invokeTool`」——那样就得把原文塞进结构化参数里，
 * 两个入口的边界会变糊），所以：
 *
 * - `FLUSHALL` / `EVAL` / `CONFIG` 一类在**解析层**就被拒（连动作名都算不出来），
 *   报 `OPERATION_FORBIDDEN` 而不是「不认识」——**「被明确排除」与「打错字」要分得开**；
 * - `KEYS` 映射到动作 `keys`，于是它需要目标上真的配了危险读能力**且**已授权；
 * - `INFO ALL` 解析成危险读、动作名却是普通读的 `info`——档位按更严的判（`operationClass`），
 *   所以能力闸门照走。少了这一步，「按参数分档」就只是一句注释；
 * - 命令解析不出动作名（未登记 / 缺 key）一律拒，**不得**回落到「直接执行原文」。
 */
export declare function invokeRedisCommand(input: {
    target: DevDataTarget;
    /** 命令原文，如 `GET user:1`。 */
    commandText: string;
    cwd: string;
    /** `SCAN` 族 `COUNT` 的策略上限（候选只能请求更小）。 */
    maxScanCount: number;
    executor: ToolExecutor;
    confirmed?: boolean;
    operationId?: string;
    audit?: AuditSink;
    /** 执行前的宿主检查（见 `preflight` 的 `beforeExecute`）。动作名是**解析层**算出来的那个。 */
    beforeExecute?: (input: {
        target: DevDataTarget;
        action: string;
    }) => PreExecuteBlock | undefined;
}): Promise<ToolOutcome>;
