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
import { adjudicate, rejectionHint } from './adjudicate.js';
import { envFacts, normalizeEnv } from './env.js';
import { allManagedActions, isNeverOperation, matrixFor, RAW_COMMAND_TOOL, entryShapeFor, } from './operations.js';
import { guardPlan } from './plan-guard.js';
import { actionOf, commandArgs, parseRedisCommand } from './redis-command.js';
import { REJECTION_CODES, rejection } from './rejection.js';
/** 哪些动作要过计划护栏（只有真正执行 SQL 的那一个）。 */
function guardPlanFor(engine, action) {
    if (action !== 'query')
        return false;
    return engine === 'mysql' || engine === 'postgres' || engine === 'sqlserver' || engine === 'dm';
}
/**
 * 域前缀：本包所有 agent 工具的名字都长这样。
 *
 * 这不是审美问题：仓库级守卫（`scripts/test/tool-names.test.ts`）要求工具名是 `<域>_<动作>`，
 * 因为工具名是**模型选工具时唯一看到的标识**——撞族会让模型在同族名字里误选（devfront 的
 * `web_*` 撞上宿主的 `web_search` 就是这么发生的）。本包与 docker / tty / site 并列，用 `devdata_`。
 */
export const TOOL_PREFIX = 'devdata_';
/** 动作名 → 工具名（**唯一**的拼法，宿主半体与注册表都从这里取）。 */
export function toolNameFor(action) {
    return `${TOOL_PREFIX}${action}`;
}
/** 造一条注册项（工具名统一加域前缀，避免手写时漏掉几个）。 */
function toolSpec(action, group, params) {
    return { name: toolNameFor(action), action, group, params };
}
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
export const TOOL_SPECS = [
    // 发现
    toolSpec('list_targets', 'discovery', ['cwd']),
    toolSpec('search', 'discovery', ['target', 'pattern']),
    toolSpec('list_topics', 'discovery', ['target']),
    toolSpec('list_groups', 'discovery', ['target']),
    // 理解
    toolSpec('schema', 'understanding', ['target', 'table?']),
    toolSpec('describe', 'understanding', ['target', 'table']),
    toolSpec('sample', 'understanding', ['target', 'table', 'limit?']),
    toolSpec('info', 'understanding', ['target']),
    toolSpec('lag', 'understanding', ['target', 'group?', 'topic?']),
    toolSpec('dlq_stats', 'understanding', ['target', 'topic?']),
    // 查询 / 取值
    toolSpec('query', 'query', ['target', 'sql', 'limit?']),
    toolSpec('explain', 'query', ['target', 'sql']),
    toolSpec('get', 'query', ['target', 'key']),
    toolSpec('trace', 'query', ['target', 'key']),
    // 命令原文入口（**唯一一个动作由解析层算出的入口**：`action` 登记的是它归属的动作族，见 §17.12）
    toolSpec(RAW_COMMAND_TOOL, 'query', ['target', 'command', 'confirmed?']),
    // 危险读（默认不露入口）
    toolSpec('keys', 'query', ['target', 'pattern', 'limit?']),
    toolSpec('monitor', 'query', ['target', 'seconds']),
    // 受限写（默认不露入口）
    toolSpec('set', 'query', ['target', 'key', 'value']),
    toolSpec('del', 'query', ['target', 'key']),
    toolSpec('expire', 'query', ['target', 'key', 'ttl']),
    toolSpec('send', 'query', ['target', 'topic', 'body']),
    toolSpec('create_topic', 'query', ['target', 'topic']),
    toolSpec('delete_topic', 'query', ['target', 'topic', 'confirmed?']),
    // 自证 / 恢复
    toolSpec('doctor', 'diagnosis', ['target']),
    toolSpec('capabilities', 'diagnosis', ['target']),
];
/**
 * `list_targets` / `doctor` / `capabilities` 是引擎无关的，任何目标上都可用。
 *
 * **导出**是给 `entries.ts` 用的：入口面要把这三条从「引擎入口」里摘出来——它们不经过执行器
 * （全是本地判定），所以「这个引擎还没有执行器」时它们仍然该在工具面上。
 */
export const AGNOSTIC_ACTIONS = ['list_targets', 'doctor', 'capabilities'];
/** 与 `AGNOSTIC_ACTIONS` 一一对应的**工具名**（入口面按工具名过滤）。 */
export const AGNOSTIC_TOOL_NAMES = AGNOSTIC_ACTIONS.map((action) => toolNameFor(action));
const ENGINE_AGNOSTIC = new Set(AGNOSTIC_TOOL_NAMES);
/**
 * 命令原文入口的**工具名**（带域前缀）。
 *
 * 两个名字要分清：`RAW_COMMAND_TOOL`（`operations.ts`）是这条入口登记的**动作族名**，用于口径判断
 * （「这个引擎的入口形态是命令原文还是结构化」）；而 agent 看到、调用的名字是这一个。
 */
export const RAW_COMMAND_TOOL_NAME = toolNameFor(RAW_COMMAND_TOOL);
/**
 * 引擎专属的**受管**工具名（非引擎无关的那些）。
 *
 * **从矩阵现算，不手写**：原先这里是手写的一份清单，而 RocketMQ 的矩阵是后加的——清单没跟着长，
 * 于是 `lag` / `list_topics` / `send` 在工具面上永远不可见（还没有一条用例发现；当时的断言方向反了，
 * 见 **D01**）。教训与修法见 `operations.ts` 的 `allManagedActions`。
 */
const ENGINE_SPECIFIC = new Set(allManagedActions().filter((action) => !AGNOSTIC_ACTIONS.includes(action)));
/** 判断某引擎是否有这个入口（引擎无关的自证项按真处理）。 */
function engineManages(engine, tool) {
    if (ENGINE_AGNOSTIC.has(tool.name))
        return true;
    /*
     * 命令原文入口**没有矩阵登记项**（动作由解析层按命令算出，见 §17.12），所以它不能走下面
     * 那句 `operations[action] !== undefined`——那样它会在所有引擎上都不可见，命令原文入口等于没有。
     * 判据下沉到引擎的入口形态：今天只有 Redis 是 `raw-command`。
     */
    if (tool.action === RAW_COMMAND_TOOL)
        return entryShapeFor(engine) === 'raw-command';
    if (!ENGINE_SPECIFIC.has(tool.action))
        return false;
    return matrixFor(engine).operations[tool.action] !== undefined;
}
/**
 * 算出一个目标上**可见**的工具面。
 *
 * 纯函数：只看目标状态与矩阵，不读 `cwd`、不连任何东西、不读环境变量
 * （写类的能力判定在这里**不查授权**——授权是执行时的事，见 `invokeTool`；
 * 这里只判断「这一档在原则上可不可能」）。
 */
export function visibleTools(target) {
    const env = normalizeEnv(target.env);
    const facts = envFacts(env);
    const out = [];
    for (const tool of TOOL_SPECS) {
        if (!engineManages(target.engine, tool))
            continue;
        // ① never 的动作不注册。矩阵里若有人把 never 塞进 operations，这一条会把它挡掉；
        //    `adjudicate.test.ts` 另有一条用例断言两者不相交。
        if (isNeverOperation(target.engine, tool.action))
            continue;
        /*
         * ③ 命令原文入口：**这一条无法按档位藏**，如实说明（这是 §17.12 的必然代价）。
         *
         * 写类 / 危险读「默认不注册」的前提是「同一个动作有另一条只读入口」——而 Redis 只有这一条
         * 入口（`GET` 与 `SET` 从同一个工具进来），藏掉它等于把只读也一起藏掉。所以这里退化为：
         * 入口在，但**判据层照样拦**（`parseRedisCommand` 先算动作，再走可见性 → 裁决 → 能力闸门）。
         * 相应地，工具描述必须把「这个目标上哪些档已授权」写出来，把「撞墙 → 读错误 → 改」那一轮
         * 省掉——那是「不注册」本来要解决的问题。
         */
        if (tool.action === RAW_COMMAND_TOOL) {
            out.push({
                name: tool.name,
                action: tool.action,
                group: tool.group,
                params: tool.params,
                why: '命令原文入口：动作由解析层按命令算出（写 / 危险读仍需逐条授权，拒在判据层）',
            });
            continue;
        }
        /*
         * ④ 命令原文形态的引擎：**结构化动作**不进工具面（引擎无关的自证项照旧）。
         *
         * 它们在矩阵里照旧登记着（解析层算出 `SET` → 动作 `set`，`adjudicate` 要按它分档），
         * 但它们**没有工具入口**——执行器只收命令原文，注册一个「跑起来必失败」的入口就是本仓最忌讳的
         * 「配了没反应」。所以「动作」与「工具名」在这类引擎上不是一一对应的，见 §17.12 / §17.14。
         */
        if (entryShapeFor(target.engine) === 'raw-command' && ENGINE_SPECIFIC.has(tool.action))
            continue;
        const spec = matrixFor(target.engine).operations[tool.action];
        if (spec === undefined) {
            // 引擎无关的工具（list_targets / doctor / capabilities）。
            out.push({ name: tool.name, action: tool.action, group: tool.group, params: tool.params, why: '引擎无关的自证 / 发现问题' });
            continue;
        }
        if (spec.kind === 'read') {
            // ② 读类始终可见（可见 ≠ 可执行；执行时仍过 adjudicate，作用域与环境都会再判一次）。
            out.push({
                name: tool.name,
                action: tool.action,
                group: tool.group,
                params: tool.params,
                spec,
                why: env === 'unknown' ? '只读；环境未标注（读类照常）' : '只读',
            });
            continue;
        }
        // ③ 写 / 危险读：默认关，且**未接入闸门就不露入口**。
        //
        //    两个条件都是必需的：`enabled` 说这一档在原则上允许（如 `unknown` 环境不允许写），
        //    `cap !== undefined` 说闸门真的接进去了。少任何一个，都会出现「配了一半的目标把入口露出去」。
        const enabled = spec.kind === 'write-scoped' ? facts.allowsWrite : true;
        const cap = spec.kind === 'write-scoped' ? target.writeCapability : target.dangerousReadCapability;
        if (!enabled || cap === undefined)
            continue;
        out.push({
            name: tool.name,
            action: tool.action,
            group: tool.group,
            params: tool.params,
            spec,
            why: spec.kind === 'write-scoped' ? '写类：需宿主授权后才可执行' : '危险读：需单独授权后才可执行',
        });
    }
    return out;
}
/** 可见工具名的集合（给「工具面 ∩ never = ∅」这类断言用）。 */
export function visibleToolNames(target) {
    return visibleTools(target).map((tool) => tool.name);
}
/** 工具是否在目标上可见（调用方通常先问这个再 `invokeTool`）。 */
export function isToolVisible(target, toolName) {
    return visibleTools(target).some((tool) => tool.name === toolName);
}
/**
 * 把调用方给的**工具名或动作名**解析成一对：入口名（可见性判据）与动作名（裁决 / 执行器判据）。
 *
 * 为什么两种写法都收：`invokeTool` 的调用方有两类——宿主半体（用**工具名**，那是 agent 说的话）
 * 与测试 / 内部（习惯用**动作名**，那是矩阵的词汇）。两种都认，就不会出现「同一个入口有两个名字」
 * 的漂移；而 `visibleTools` 报出来的永远是规范的那个（工具名）。
 *
 * 认不出来时原样返回（两条判据都用它）：那时可见性会拒，而这正是我们要的——不认识的一律拒。
 */
export function resolveEntry(toolName) {
    const spec = TOOL_SPECS.find((tool) => tool.name === toolName || tool.action === toolName);
    return spec === undefined ? { entry: toolName, action: toolName } : { entry: spec.name, action: spec.action };
}
/**
 * 一个动作**不可见**时，把理由说准。
 *
 * 之前这一律报 `UNCLASSIFIED_OPERATION` + 「不在受管动作里」。那是**错的诊断**：写类在
 * `unknown` / `production` 环境下本来就被藏起来（而它在矩阵里登记得好好的），报「未登记」会
 * 让 agent 去改动作名——一个不可能有结果的方向。可见性本来就知道自己为什么藏，就该说出来。
 */
function hiddenReason(target, entry, action) {
    if (isNeverOperation(target.engine, action)) {
        return {
            code: REJECTION_CODES.OPERATION_FORBIDDEN,
            message: `工具 ${entry} 被明确排除在设计之外，不提供入口`,
            hint: '该操作不可逆 / 影响他人，本套件不提供入口；要改数据请走各自的运维流程',
        };
    }
    const spec = matrixFor(target.engine).operations[action];
    const env = normalizeEnv(target.env);
    const facts = envFacts(env);
    /*
     * 命令原文形态的引擎：结构化动作**没有入口**，而不是「没接入闸门」。
     *
     * 这一条必须单独判：否则会落到下面的 `CAPABILITY_NOT_DECLARED` 分支，报「没有为该操作接入能力
     * 闸门」——而用户可能**已经配好了**那个能力。那是本仓最忌讳的一类错诊断：它让 agent 去配置里
     * 找一个已经在那儿的东西（`tool.ts` 文件头「例外」一节的代价，要在这里补齐）。
     */
    if (entryShapeFor(target.engine) === 'raw-command' && ENGINE_SPECIFIC.has(action)) {
        return {
            code: REJECTION_CODES.UNCLASSIFIED_OPERATION,
            message: `${target.engine} 的工具面只有命令原文入口 ${RAW_COMMAND_TOOL_NAME}；${entry} 不是这个引擎上的工具名`,
            hint: `改用 ${RAW_COMMAND_TOOL_NAME} 直接发命令原文（如 \`GET user:1\`）——动作名由解析层按命令算出，闸门照走`,
        };
    }
    if (spec !== undefined) {
        // 登记过、且这个环境下这一档本来就不该露面 → 理由就是环境。
        if (spec.kind === 'write-scoped' && !facts.allowsWrite) {
            return {
                code: REJECTION_CODES.ENV_NOT_WRITABLE,
                message: `工具 ${entry} 是写类操作，而目标 ${target.id} 的环境档位（${env}）不允许写`,
                hint: `在目标 ${target.id} 的配置里把它标注为 dev / test-isolated / test-shared；未标注或标为 production 的目标只允许读类操作`,
            };
        }
        // 登记过、环境也允许，那就是**没接入闸门**（「配了一半」不放行）。
        return {
            code: REJECTION_CODES.CAPABILITY_NOT_DECLARED,
            message: `工具 ${entry} 在目标 ${target.id} 上没有接入能力闸门，因此不露入口`,
            hint: '这是刻意的：未接入 = 不放行。在目标配置里声明对应的 writeCapability / dangerousReadCapability',
        };
    }
    return {
        code: REJECTION_CODES.UNCLASSIFIED_OPERATION,
        message: `工具 ${entry} 在目标 ${target.id} 上不可见（不在受管动作里）`,
        hint: '用 list_targets / capabilities 看这个目标上到底有哪些工具',
    };
}
/**
 * 执行前的公共流水线：**可见性 → 裁决 → 计划护栏**。
 *
 * 抽出来的原因不是省几行，而是要保证「命令原文入口」与「结构化参数入口」走的是**同一条**判据链。
 * 各写一遍必然漂——而漂的方向会是「原文入口少了一道闸门」，正是本模块要防的事。
 *
 * ## 为什么 `entry` 与 `action` 是两个参数
 *
 * 结构化入口下二者是同一个名字（工具名 = 矩阵动作名）。**命令原文入口下不是**：入口只有
 * `redis_command` 一个，而动作名由解析层按命令算出（`SET k v` → `set`）。两件事混成一个参数，
 * 就会逼出「可见性按动作名判」——而结构化动作在命令原文引擎上**没有入口**（见 `visibleTools`），
 * 那样每条 Redis 命令都会被自己的入口挡住。分开之后：
 * **可见性判入口，裁决判动作**，与 agent 实际说的话一一对应。
 */
async function preflight(input) {
    const { target, entry, action, cwd, confirmed, operationClass, sql, thresholds, executor, beforeExecute } = input;
    if (!isToolVisible(target, entry)) {
        return { ok: false, ...hiddenReason(target, entry, action) };
    }
    const decision = adjudicate({
        target,
        action,
        cwd,
        ...(confirmed === undefined ? {} : { confirmed }),
        ...(operationClass === undefined ? {} : { operationClass }),
    });
    if (!decision.allowed) {
        return { ok: false, code: decision.code, message: decision.message, ...(decision.hint === undefined ? {} : { hint: decision.hint }) };
    }
    // 宿主前置检查（判定已通过、还没执行）。见 `beforeExecute` 的注释。
    const blocked = beforeExecute?.({ target, action });
    if (blocked !== undefined)
        return { ok: false, ...blocked };
    /*
     * 需要二次确认的操作**在这里就拒**，不往下走。
     *
     * 2026-10-02 修（**D02**）：此前裁决只把 `requiresConfirm` 算出来**放进成功结果的载荷**，然后照样执行
     * ——于是「共享环境里的不可逆操作要逐次确认」这句话只在类型里成立。真实后果是：给 `248` 那种
     * 共享 Redis 授权写之后，第一次 `DEL` 就打出去了（`facts.requiresConfirm` 对 `test-shared`
     * 是 true，而它当时只是被回显）。
     *
     * 判据与不给确认时该做什么，`rejection.ts` 的 `CONFIRMATION_REQUIRED` 与 `hintFor` 早就写好了
     * ——这一改是让实现追上那份记录，不是新加一条规矩。
     */
    if (decision.requiresConfirm && confirmed !== true) {
        const base = rejection(REJECTION_CODES.CONFIRMATION_REQUIRED, rejectionHint(REJECTION_CODES.CONFIRMATION_REQUIRED, target, action, operationClass ?? 'write-scoped', cwd));
        return { ok: false, ...base };
    }
    // 执行前的计划护栏：只对 SQL 的 query 生效。**拒跑发生在执行之前**——这是它的全部意义。
    if (guardPlanFor(target.engine, action) && thresholds !== undefined) {
        const planText = sql === undefined || sql === '' || executor.explain === undefined
            ? undefined
            : await executor.explain({ target, sql });
        const guarded = guardPlan({ planText, thresholds, engine: target.engine });
        if (!guarded.allowed) {
            return { ok: false, code: guarded.code, message: guarded.message, ...(guarded.hint === undefined ? {} : { hint: guarded.hint }) };
        }
    }
    return { ok: true };
}
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
export async function invokeTool(input) {
    const { target, toolName, cwd, confirmed, operationId, executor, audit, thresholds, beforeExecute } = input;
    const args = input.args ?? {};
    // 工具名（可见性）与动作名（裁决 / 执行器）是两个东西，见 `resolveEntry`。
    const { entry, action } = resolveEntry(toolName);
    const denial = (code, message, hint) => {
        audit?.record({
            at: Date.now(),
            targetId: target.id,
            engine: target.engine,
            action,
            allowed: false,
            code,
            ...(operationId === undefined ? {} : { operationId }),
        });
        return hint === undefined ? { ok: false, action, code, message } : { ok: false, action, code, message, hint };
    };
    const pre = await preflight({
        target,
        entry,
        action,
        cwd,
        ...(confirmed === undefined ? {} : { confirmed }),
        ...(typeof args.sql === 'string' ? { sql: args.sql } : {}),
        ...(thresholds === undefined ? {} : { thresholds }),
        executor,
        ...(beforeExecute === undefined ? {} : { beforeExecute }),
    });
    if (!pre.ok)
        return denial(pre.code, pre.message, pre.hint);
    const outcome = await executor.run({ target, action, args, cwd });
    audit?.record({
        at: Date.now(),
        targetId: target.id,
        engine: target.engine,
        action,
        allowed: true,
        ...(operationId === undefined ? {} : { operationId }),
    });
    if (!outcome.ok) {
        return {
            ok: false,
            action: toolName,
            code: REJECTION_CODES.EXECUTION_FAILED,
            message: outcome.message ?? '执行失败',
        };
    }
    return { ok: true, action, result: outcome.result };
}
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
export function parseRejectionCode(reason) {
    return reason === 'FORBIDDEN_COMMAND' ? REJECTION_CODES.OPERATION_FORBIDDEN : REJECTION_CODES.UNCLASSIFIED_OPERATION;
}
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
export async function invokeRedisCommand(input) {
    const { target, commandText, cwd, maxScanCount, executor, audit, operationId, confirmed, beforeExecute } = input;
    const recordDenial = (action, code, message, hint) => {
        audit?.record({
            at: Date.now(),
            targetId: target.id,
            engine: target.engine,
            action,
            allowed: false,
            code,
            ...(operationId === undefined ? {} : { operationId }),
        });
        return hint === undefined ? { ok: false, action, code, message } : { ok: false, action, code, message, hint };
    };
    const parsed = parseRedisCommand(commandText, maxScanCount);
    if (!parsed.ok) {
        // 解析不过 = 这条命令没有可裁决的动作名。**不用原文兜底**：兜底就是把白名单关掉。
        return recordDenial(parsed.detail ?? '(未识别)', parseRejectionCode(parsed.reason), `Redis 命令被拒：${parsed.reason}`, parsed.hint);
    }
    const command = parsed.command;
    const action = actionOf(command);
    // 档位取自**解析层**（它按参数分档），矩阵那一侧由 `adjudicate` 取更严者。
    const operationClass = command.kind;
    const pre = await preflight({
        target,
        /*
         * 入口是 `redis_command`（可见性），动作是解析层算出来的那一个（裁决）。
         * 这一行就是 2026-10-02 那次接线里最主要的改动，理由见 `preflight` 的注释。
         */
        entry: RAW_COMMAND_TOOL_NAME,
        action,
        cwd,
        ...(confirmed === undefined ? {} : { confirmed }),
        operationClass,
        executor,
        ...(beforeExecute === undefined ? {} : { beforeExecute }),
    });
    if (!pre.ok)
        return recordDenial(action, pre.code, pre.message, pre.hint);
    const outcome = await executor.run({ target, action, args: commandArgs(command, commandText), cwd });
    audit?.record({
        at: Date.now(),
        targetId: target.id,
        engine: target.engine,
        action,
        allowed: true,
        ...(operationId === undefined ? {} : { operationId }),
    });
    if (!outcome.ok) {
        return {
            ok: false,
            action,
            code: REJECTION_CODES.EXECUTION_FAILED,
            message: outcome.message ?? '执行失败',
        };
    }
    return { ok: true, action, result: outcome.result };
}
//# sourceMappingURL=tool.js.map