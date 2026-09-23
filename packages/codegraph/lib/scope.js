/**
 * ROADMAP P0：per-agent scoped MCP 挂载。
 *
 * 现状（'managed'）是**一行托管**：本插件在 `~/.dsh/cordis.patch.yml` 里维护
 * `@deepseek-ai/dsh-mcp-client` 的 codegraph 行，一台 MCP 服务器同一时刻只服务一个
 * 项目（行里的 `cwd`），多项目靠 `projectPath` 入参 + `followSession` 重写 cwd 后
 * 热加载重建连接。代价：时分复用、每次会话切换都写盘、多实例并发写同一文件、
 * 且「工具名相同而语义随全局 cwd 漂移」。
 *
 * 本模块实现方案里的另一半：**把 dsh-mcp-client 挂进每个 agent 自己的 scope**。
 *
 * 机制（逐条读过运行时实现，不是推测）：
 *
 *   1. `agent.ctx` **本身就是**一个 scope——`dsh-agent-loop/lib/index.js:759-760`
 *      `this.scope = createScope(loopCtx, this); this.ctx = this.scope.ctx`。所以
 *      「per-agent 挂载」不需要自己 `createScope`，直接用 `agent.ctx` 即可。这也正是
 *      `dsh-tools` 那条报错信息的指引（「register through that agent's `agent.ctx`
 *      instead」）。
 *   2. `ToolRuntime.register()` 走 `this.layers.effect(this.ctx, …)`，而 `ScopedLayers.effect`
 *      按 `scopeOf(ctx)` 分桶（`dsh-scope`）。宿主服务被 `createTraceable` /
 *      `createShadowMethod` 包过，**方法调用时 `this` 会被重绑成调用方那个 context**
 *      （`cordis/lib/index.js:111-121`）——所以 `agentCtx.tools.register(...)` 落在
 *      **该 agent 的分层**里。
 *   3. `ToolRuntime.view(scope)`（`dsh-tools/lib/index.js:2957-2975`）先铺全局层、再按
 *      scope 链覆盖，scope 自己的层最后写入即最终生效。模型看到的工具表就是
 *      `schemas(exec.agent)` 算出来的（`:1402`）。
 *   4. `dsh-mcp-client` 的 serverName 占用按 `scopeOf(ctx) ?? ctx.root` 记
 *      （`lib/index.js:812-818`）：**不同 scope 的同名不冲突**，同一 scope 内才冲突。
 *   5. agent 销毁时 `machine.scope.dispose()`（`dsh-agent-loop:1659`）会连同 scope 里
 *      挂的子 fiber 一起释放（`Fiber` 构造里 `this.dispose = parent.fiber.effect(...)`），
 *      所以 per-agent 的 MCP 子进程**随 agent 回收**，不需要我们额外兜底。
 *
 * 因此本模块的**核心正确性判据**是：会话目录没有可用索引时**不挂载**，而不是回落到
 * 默认项目。回落正是「没有索引的 agent 却拿到别的项目的上下文」那个 bug 的成因。
 *
 * 本文件刻意**不 import 任何 dsh 运行时包**：纯决策函数能直接进 vitest（与
 * `foldToolCall` / `syncManagedMcpRow` 同样的理由），真机契约另由
 * `scripts/verify-codegraph-host-contract.mjs` 验证。
 */
/** 两种模式的规范值（卡片与配置校验共用，避免两处字面量漂移）。 */
export const MCP_SCOPE_MODES = ['managed', 'per-agent'];
/** 默认模式：**保持现状**。per-agent 是行为变更，由用户显式开启（见 P0-PLAN 第五节）。 */
export const DEFAULT_MCP_SCOPE = 'managed';
/** 把任意输入规范化成模式；非法值回落 fallback（不抛：配置面永远不该让插件起不来）。 */
export function normalizeMcpScope(value, fallback = DEFAULT_MCP_SCOPE) {
    return value === 'per-agent' || value === 'managed' ? value : fallback;
}
/**
 * 纯函数：解析**生效**的 MCP 挂载模式。
 *
 * 用户要 per-agent 但前提不成立时**不静默降级**：一律退回 managed 并给出具体原因，
 * 让卡片能说清「你以为开了、实际没开」。四条前提缺一不可（总开关开着 / 有 agent 事件面 /
 * 无区块外手工行 / 模式值合法），其中外部手工行那条见
 * {@link ScopeModeInput.externalRow} 的注释。
 */
export function resolveScopeMode(input) {
    const wanted = normalizeMcpScope(input.stored ?? input.config, DEFAULT_MCP_SCOPE);
    if (!input.manageEnabled) {
        return { mode: 'managed', reason: 'MCP 集成总开关已关闭，两种模式都不挂载' };
    }
    if (wanted === 'managed') {
        return {
            mode: 'managed',
            reason: input.stored ?? input.config
                ? 'managed（托管行 + 按会话热切换）'
                : 'managed（默认：托管行 + 按会话热切换）',
        };
    }
    if (!input.agentEvents) {
        return {
            mode: 'managed',
            reason: '要 per-agent 但宿主没有 agent 事件面（拿不到 agent/created），已退回 managed',
        };
    }
    if (input.externalRow) {
        return {
            mode: 'managed',
            reason: '要 per-agent 但检测到区块外手工配置的 codegraph MCP 行；插件无权顶掉用户的显式配置，已退回 managed',
        };
    }
    return { mode: 'per-agent', reason: 'per-agent（每个 agent 一个 scoped MCP 进程）' };
}
/**
 * 纯函数：一个 agent 该不该挂 MCP，以及挂在哪个目录。
 *
 * **没有有效索引就不挂**（不是回落到默认项目）：一个在别处（比如家目录）开的会话，
 * 拿到「某个别的项目」的探索工具只会给出误导性答案；没有工具时模型会按指引退回
 * grep/read，那才是正确的降级。
 *
 * cwd 取 **locateIndex 找到的根**（与 `effectiveProjectPath` 同口径，CG02）：会话目录在
 * monorepo 子目录时索引在仓库根。
 */
export function agentMountDecision(input) {
    if (input.cliAvailable === false) {
        return { mount: false, reason: 'codegraph CLI 不可用（探测失败），未挂载' };
    }
    const cwd = typeof input.sessionCwd === 'string' ? input.sessionCwd.trim() : '';
    if (cwd === '') {
        return { mount: false, reason: '会话没有工作目录，未挂载' };
    }
    if (input.indexed !== true || typeof input.root !== 'string' || input.root === '') {
        return { mount: false, reason: '会话目录没有可用的 .codegraph/ 索引，未挂载（不回落，避免拿到别的项目上下文）' };
    }
    return { mount: true, root: input.root, reason: '已按会话索引根挂载' };
}
/** 取 agent id：`agent.id` 与 `session.id` 是同值（dsh-agent 的 enter() 会校验）。 */
function agentIdOf(agent) {
    const id = agent.id ?? agent.session?.id;
    return typeof id === 'string' && id !== '' ? id : undefined;
}
/**
 * 创建 per-agent 挂载器。
 *
 * **失败模式是刻意的**：任何单个 agent 的挂载失败（模块缺失 / 连接失败 / scope 不可用）
 * 都只记日志 + 记进该 agent 的记录，**不抛给调用方**——agent/created 是 serial 派发，
 * 在那里抛出会让**会话创建失败**，而 codegraph 只是一个可选能力，它没有资格让会话起不来。
 */
export function createAgentMounter(deps) {
    const mounted = new Map();
    const fibers = new Map();
    /**
     * CG57：正在挂载中的 agent id（`loadClient` 是异步的）。
     *
     * 为什么需要：`mounted` 里那条记录在挂载完成前是 `mounted: false`（"正在挂载…"），
     * 所以「已挂过就不再挂」那条判据（`mounted === true`）**看不到在途的那一份**——
     * 重复的 attach 会再开一份：第二个实例被 dsh-mcp-client 以「serverName 已占用」
     * 拒绝（白跑一次 spawn + 握手），而它的 fiber 会覆盖 `fibers` 里第一个的引用
     * （第一个只靠 scope 回收，本模块再也 release 不到它）。
     */
    const pending = new Set();
    /**
     * CG57：每个 agent 的挂载世代号。异步续体落地前先核对世代，不一致就放弃。
     *
     * 覆盖两种「挂载途中状态变了」：① 又来了一次 attach（会话 cwd 换了 → 该重挂）；
     * ② detach / detachAll（切回 managed、插件卸载、agent 销毁）。没有它的话，迟到的
     * 续体会把 MCP 进程挂到一个**已经被撤销**的 agent scope 上。
     */
    const generations = new Map();
    const bumpGeneration = (id) => {
        const next = (generations.get(id) ?? 0) + 1;
        generations.set(id, next);
        return next;
    };
    const attach = (agent, mode) => {
        const id = agentIdOf(agent) ?? '(anonymous)';
        const cwdRaw = agent.session?.header?.cwd;
        const cwd = typeof cwdRaw === 'string' ? cwdRaw : undefined;
        // 幂等：已经挂过就不再挂（重复的 agent/created 派发不该起第二个进程——同名同 scope
        // 的第二个实例会被 dsh-mcp-client 直接拒绝，白跑一次连接）。
        //
        // 但**会话目录变了**要重挂（实测：同一 scope 里再挂一个同名实例会被拒
        // 「serverName "codegraph" is already in use」，唯一的换项目路径是「释放旧 scope +
        // 建新 scope」，等价于 detach 后重新 attach）。不加这一条的话，resume / clear /
        // compaction 把 cwd 换掉之后，这个 agent 会一直用**上一个项目**的 MCP 服务器——
        // 正是本方案要消除的那种静默串台。
        const existing = mounted.get(id);
        if (existing?.mounted === true) {
            if (existing.cwd === cwd)
                return existing;
            detachById(id);
        }
        // CG57：in-flight 幂等。上面的判据只看 `mounted === true`，而挂载在途时记录是
        // `mounted: false`——重复的 attach 以前会再开一份（见 `pending` 的注释）。
        // cwd 变了则不复用：那种情况本来就该重挂（同上面那条注释）。
        if (existing !== undefined && pending.has(id) && existing.cwd === cwd)
            return existing;
        // 未挂载的记录**不**复用：`codegraph init` 之后再开同一会话时，判定结果会变，而
        // 判定本身很便宜（locateIndex 只是几次 stat）。缓存它会把这个 agent 永久钉在
        // 「不挂」上，且没有任何重试入口（agent/created 只在会话开始/恢复/清理时触发）。
        if (mode !== 'per-agent') {
            const record = { id, cwd, mounted: false, reason: '当前模式是 managed，不走 per-agent 挂载', at: Date.now() };
            mounted.set(id, record);
            return record;
        }
        const decision = agentMountDecision({
            sessionCwd: cwdRaw,
            root: cwd === undefined ? undefined : deps.resolveRoot(cwd),
            indexed: cwd === undefined ? false : deps.isIndexed(cwd),
            cliAvailable: deps.cliAvailable(),
        });
        if (!decision.mount) {
            const record = { id, cwd, mounted: false, reason: decision.reason, at: Date.now() };
            mounted.set(id, record);
            return record;
        }
        const scope = agent.ctx;
        const mountPlugin = scope?.plugin;
        if (typeof mountPlugin !== 'function') {
            const record = { id, cwd, root: decision.root, mounted: false, reason: '该 agent 没有可用的 scoped context（agent.ctx.plugin 不可用）', at: Date.now() };
            mounted.set(id, record);
            return record;
        }
        // 记录先落：loadClient 是异步的，期间重复的 attach 应当看到「已在处理」而不是再开一份
        const generation = bumpGeneration(id);
        const record = { id, cwd, root: decision.root, mounted: false, reason: '正在挂载…', at: Date.now() };
        mounted.set(id, record);
        pending.add(id);
        void deps.loadClient()
            .then((client) => {
            // CG57：世代不符 = 期间又 attach（换 cwd）或 detach 过 → 这次挂载作废
            if (generations.get(id) !== generation)
                return undefined;
            if (client === undefined) {
                record.reason = '宿主没有 @deepseek-ai/dsh-mcp-client（可选依赖未安装），未挂载';
                deps.logger.warn(`[dsh-codegraph] ${record.reason}`);
                return undefined;
            }
            // 整包 namespace 对象直接可用：cordis 的 Context.resolve 认「有 apply 的对象」
            // （`cordis/lib/index.js:1532-1537` isApplicable），所以不必挑 .apply 传。
            const config = {
                serverName: deps.serverName,
                transport: 'stdio',
                command: deps.command,
                args: ['serve', '--mcp'],
                cwd: decision.root,
                // 起不来时报错交给下面的 catch（而不是静默变成「这个 agent 没工具」）
                failOnStartupError: true,
            };
            const fiber = mountPlugin(client, config);
            fibers.set(id, fiber);
            record.mounted = true;
            record.reason = '已挂载';
            record.at = Date.now();
            deps.logger.log(`[dsh-codegraph] per-agent MCP 已挂载：agent=${id} cwd=${decision.root}`);
            // 不 await：agent/created 是 serial 派发，等一次 spawn+握手（实测 ~75ms）会拖慢
            // 会话创建，而连接失败也没必要让会话起不来。启动失败经 catch 记进记录。
            return Promise.resolve(fiber).catch((error) => {
                record.mounted = false;
                record.error = error instanceof Error ? error.message : String(error);
                record.reason = '启动失败：' + record.error;
                deps.logger.warn(`[dsh-codegraph] per-agent MCP 启动失败：agent=${id} — ${record.error}`);
            });
        })
            .catch((error) => {
            // CG57：已被取代的挂载失败不该记进记录、也不该刷日志（它不是「这个 agent 的
            // 挂载失败」，只是一次作废的尝试）
            if (generations.get(id) !== generation)
                return;
            record.mounted = false;
            record.error = error instanceof Error ? error.message : String(error);
            record.reason = '挂载失败：' + record.error;
            deps.logger.warn(`[dsh-codegraph] per-agent MCP 挂载失败：agent=${id} — ${record.error}`);
        })
            .finally(() => {
            // 只有「当前这一代」才有资格摘掉在途标记：更新的一代（换 cwd 重挂）正在途中，
            // 摘掉会让下一次 attach 又开一份
            if (generations.get(id) === generation)
                pending.delete(id);
        });
        return record;
    };
    /**
     * 回收一个 agent 的挂载（按 id）。换项目重挂与 agent 销毁共用这一条路径，
     * 避免「释放逻辑写两遍、只修好一处」。
     */
    const detachById = (id) => {
        const fiber = fibers.get(id);
        fibers.delete(id);
        mounted.delete(id);
        // CG57：让在途的挂载作废（并清掉 in-flight 标记）——否则它会在这个 agent 已经被
        // 撤销之后把 MCP 进程挂上去
        pending.delete(id);
        bumpGeneration(id);
        if (fiber === undefined)
            return;
        try {
            // 正常路径下 agent 销毁时 scope 会连子 fiber 一起释放（dsh-agent-loop:1659），
            // 所以这里是**幂等的显式兑现**：切回 managed / 插件卸载时需要立刻回收，
            // 不依赖 agent 自己的销毁时机。
            fiber.dispose?.();
        }
        catch (error) {
            deps.logger.warn(`[dsh-codegraph] per-agent MCP 释放失败：agent=${id} — ${error instanceof Error ? error.message : String(error)}`);
        }
    };
    const detach = (agent) => {
        const id = agentIdOf(agent);
        if (id === undefined)
            return;
        detachById(id);
    };
    return {
        attach,
        detach,
        detachAll() {
            // CG57：在途的挂载还没有 fiber，但同样要作废（detachById 会 bump 世代号），
            // 所以两边的 id 都要收——否则「切回 managed」之后，一个迟到的续体还会把
            // per-agent 进程挂出来
            for (const id of new Set([...fibers.keys(), ...pending]))
                detachById(id);
            // detachById 只在有 fiber 时才删记录；这里补上「没挂成的记录」也一并清掉。
            mounted.clear();
        },
        records: () => [...mounted.values()],
        liveCount: () => fibers.size,
    };
}
//# sourceMappingURL=scope.js.map