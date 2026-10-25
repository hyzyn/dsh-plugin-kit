/** 宿主给 MCP 工具的名字前缀（`mcp__<serverName>__<tool>`，由 `dsh-mcp-client` 决定）。 */
const MCP_TOOL_PREFIX = 'mcp__';
/**
 * 从 `mcp__<server>__<tool>` 里解析出 server 名；解析不出的返 `undefined`（= **不是我们的**）。
 *
 * 解析不出有两种：没有第二段分隔符（`mcp__lonely`）与空 server 段（`mcp____tool`）。两者都
 * 归不了属，于是按「不在托管行里」处理（{@link planSurfaceDeny} 会**留着它**）——隐藏一个我们
 * 既不认识、也没有装载入口的工具，等于让用户静默丢功能。
 *
 * 已知边界：`SERVER_NAME_RE` 允许 serverName 里出现 `__`，那种名字（如 `a__b`）从工具名
 * **无法反解**（`mcp__a__b__tool` 会被解析成 server `a`），于是它落进「不是我们的」那一侧
 * （保持可见、装不装都不由我们决定）。真实配置里没出现过这种名字，且宿主侧的公开名本身就有
 * 歧义；不为此加一条前缀猜测（那会让 `a` 与 `a__b` 互相污染）。要支持就得在 DTO 里带工具名
 * 前缀，而不是在名字上做字符串体操。
 */
function serverNameOf(name) {
    if (!name.startsWith(MCP_TOOL_PREFIX))
        return undefined;
    const rest = name.slice(MCP_TOOL_PREFIX.length);
    const separator = rest.indexOf('__');
    if (separator <= 0)
        return undefined;
    return rest.slice(0, separator);
}
/**
 * 需要裁掉的名字：**注册集里「属于托管行（`managed`）且未装载」的 `mcp__*`**（纯函数，顺序跟随
 * `registered`）。
 *
 * - `registered` 必须是 `schemas()` 拿到的**真实注册名**（`restrict()` 对未知名字整体抛错）；
 * - `managed` 是本插件托管区块里的 server 名（`listServers()` = `buildServersDto` 的同一份）；
 * - `loaded` 是 server 名（不是工具名），空数组 = 托管行全部卸掉；
 * - 解析不出 server 的名字（见 {@link serverNameOf}）**不裁**。
 *
 * ## 为什么必须按 `managed` 收口（只裁「我们的」）
 *
 * `mcp__*` 这个前缀**不是本插件专属的**：用户手写的 patch 行、别的插件托管的 mcp-client 实例，
 * 注册出来的工具长得一模一样。而 `mcp_load` 的装载白名单来自本插件的托管行——把不属于我们的
 * 工具也裁掉，等于把它们**永久隐藏且装不回来**（模型连「存在这么个 server」都看不到，`mcp_servers`
 * 也只报托管行）。那违反本仓「不碰非本插件的工具」那条（kit 的 `tier-restrict` 用 `prefixes`
 * 防的正是同一类误伤）。
 *
 * 代价是「外部行在 on-demand 下仍是常驻工具面」——这是**有意的**：我们既不认识它的语义，也没有
 * 装载入口，能做的只有不碰它。要收它，得先把它纳入托管（进 DTO 与 `listServers()`）。
 */
export function planSurfaceDeny(registered, loaded, managed) {
    const managedServers = new Set(managed);
    const loadedServers = new Set(loaded);
    const deny = [];
    for (const name of registered) {
        if (name === '' || !name.startsWith(MCP_TOOL_PREFIX))
            continue;
        const server = serverNameOf(name);
        // 解析不出 / 不在托管行 = **不是我们的**：不点名，保持可见（见上面的理由）。
        if (server === undefined || !managedServers.has(server))
            continue;
        if (loadedServers.has(server))
            continue;
        deny.push(name);
    }
    return deny;
}
/** 取一个 context 绑定的 `tools` 服务（取不到 = 环境不支持，调用方按「不裁剪」处理）。 */
function toolsOf(target) {
    if (target === null || typeof target !== 'object')
        return undefined;
    const usable = (candidate) => candidate !== null &&
        typeof candidate === 'object' &&
        typeof candidate.schemas === 'function';
    /*
     * ① `agent.ctx.tools`：宿主按调用方 context 重绑 `this` 的那一份（scope 就藏在它里面）。
     *    cordis 的 inject 守卫可能抛，所以整段包在 try 里；真宿主上这条路径是被
     *    `scripts/verify-tier-restrict.mjs` 实测过的取法（`attachTierRestrict` 用的就是它）。
     */
    try {
        const direct = target.tools;
        if (usable(direct))
            return direct;
    }
    catch {
        /* inject 守卫：读不到就走 `get`（同样是按调用方绑定的路径）。 */
    }
    // ② `ctx.get('tools')`：反射层的非严格取值（reflection 不要求 inject 声明）。
    try {
        const viaGet = target.get?.('tools');
        if (usable(viaGet))
            return viaGet;
    }
    catch {
        /* 同上 */
    }
    return undefined;
}
/** 从宿主 `schemas()` 的全局视图里取真实注册名（投影异常一律按空集处理，不炸调用方）。 */
function globalToolNames(host) {
    let schemas;
    try {
        schemas = host.schemas();
    }
    catch {
        return [];
    }
    const names = [];
    for (const schema of schemas ?? []) {
        const name = schema?.name;
        if (typeof name === 'string' && name !== '')
            names.push(name);
    }
    return names;
}
/** 两个名字集合是否等价（顺序无关；重算后用来判断「要不要重下限制」）。 */
function sameNames(left, right) {
    if (left.length !== right.length)
        return false;
    const sorted = [...left].sort();
    const other = [...right].sort();
    return sorted.every((name, index) => name === other[index]);
}
/** agent 的展示名（`agent.id` 与 `session.id` 同值；两条都缺时给一个占位，不抛）。 */
function agentIdOf(agent) {
    const session = agent.session;
    for (const candidate of [agent.id, session?.id]) {
        if (typeof candidate === 'string' && candidate !== '')
            return candidate;
    }
    return '(unnamed)';
}
/** 错误文案（日志用；`unknown` 收窄只做一次）。 */
function messageOf(error) {
    return error instanceof Error ? error.message : String(error);
}
/**
 * 在插件作用域上接管 `agent/created`：给每个 agent 的 scope 下一层「`mcp__*` 默认不可见」的
 * 限制，返回撤销函数（撤掉所有已下发的限制 + 退订）。**全程不抛**。
 *
 * 位置：与工具注册同一个 `ctx.effect`（插件禁用 / 卸载时一起撤）。**不要放进工具重注册那条
 * 路径**：热应用配置会重注册工具，而重注册不该把已有 agent 的限制一并撤掉（`agent/created`
 * 不会为老 agent 再发一次，撤了就再也装不回来）。
 *
 * `enabled: false`（`eager` 模式）时**直接返回空 disposer**：不订阅、不打日志、一次 `restrict()`
 * 都不额外发——默认档位的空行为就是「与今天完全一致」。
 */
export function attachAgentSurface(toolsCtx, options) {
    if (!options.enabled)
        return () => { };
    const log = options.log;
    /** agent（对象身份 = 宿主 scope 键）→ 已落地的限制。 */
    const applied = new Map();
    /** 台账：agent → 已装载的 server 名（**唯一真相**；`mcp_servers` / `mcp_load` 都读它）。 */
    const loadedBy = new Map();
    /** 见过面的 agent（含当前没有限制的那些）：工具集一变就要拿新注册集重算。 */
    const seen = new Map();
    const disposers = [];
    let resyncing = false;
    let pendingResync = false;
    let closed = false;
    let toolsMissingLogged = false;
    let listMissingLogged = false;
    /** 撤销某个 agent 的限制（重复调用安全：agent scope 回收后的 disposer 也要能跑）。 */
    const lift = (agent) => {
        const entry = applied.get(agent);
        if (entry === undefined)
            return;
        applied.delete(agent);
        try {
            entry.dispose();
        }
        catch {
            /* 已随 agent scope 回收 */
        }
    };
    const loadedOf = (agent) => loadedBy.get(agent) ?? [];
    /**
     * 托管行里的 server 名（= 「我们管的」那一半，`planSurfaceDeny` 只对它收口）。
     *
     * 读不到时返回**空集**：连「谁是我们管的」都不知道时不裁任何东西（fail-open）。反向的选择
     * （读不到就全裁）会把外部 mcp-client 行的工具一起埋掉，正是本函数要防的那个洞。
     */
    const managedServers = () => {
        try {
            return options.listServers();
        }
        catch (error) {
            if (!listMissingLogged) {
                listMissingLogged = true;
                log(`agent-surface: 读 server 清单失败（${messageOf(error)}），本轮不裁任何 mcp__*`);
            }
            return [];
        }
    };
    /**
     * 该 agent 现在**应当**看不见的 `mcp__*` 名字（按真实注册集、托管行与台账现算）。
     *
     * 三个入参都是「现读」：注册集随 server 连上/掉线变、托管行随保存设置变、台账随 `mcp_load` 变。
     */
    const planFor = (agent, names) => planSurfaceDeny(names, loadedOf(agent), managedServers());
    const visibleTools = (agent) => {
        if (agent === null || typeof agent !== 'object')
            return [];
        const host = toolsOf(toolsCtx);
        if (host === undefined)
            return [];
        const names = globalToolNames(host);
        const deny = new Set(planFor(agent, names));
        return names.filter((name) => name.startsWith(MCP_TOOL_PREFIX) && !deny.has(name));
    };
    /**
     * 按**当前**注册集与台账给一个 agent 重算并下发。
     *
     * 「先登记再下发」是硬要求：`restrict()` 会同步触发 `tools/change`，重入的路径看到「已落地」
     * 才不会重复下发（名单没变时这一层只做一次集合比较）。
     */
    const applyTo = (agent) => {
        if (agent === null || typeof agent !== 'object')
            return;
        // 记下来：工具集热变更（新 server 连上 / 旧 server 掉线）时要给这批 agent 重算。
        seen.set(agent, agent);
        const host = toolsOf(toolsCtx);
        if (host === undefined) {
            if (!toolsMissingLogged) {
                toolsMissingLogged = true;
                log('agent-surface: tools 服务不可用，按需加载关闭（工具面保持宿主原样）');
            }
            return;
        }
        const id = agentIdOf(agent);
        const names = globalToolNames(host);
        const deny = planFor(agent, names);
        const current = applied.get(agent);
        if (current !== undefined && sameNames(current.deny, deny))
            return;
        // 名单为空才 `lift`：这一支承担「全部装载 → 把限制撤掉」的语义。
        if (deny.length === 0) {
            lift(agent);
            return;
        }
        // **必须**从 agent 自己的 ctx 取（见文件头与 `toolsOf`）：插件 ctx 上没有 scope，restrict 会直接抛。
        const target = toolsOf(agent.ctx);
        if (target === undefined || typeof target.restrict !== 'function') {
            log(`agent-surface: agent ${id} 没有可用的 scoped tools（宿主太旧或缺 restrict），跳过按需加载`);
            return;
        }
        lift(agent);
        const record = { deny, dispose: () => { } };
        // 先登记再下发（restrict 会同步触发 tools/change）。
        applied.set(agent, record);
        try {
            record.dispose = target.restrict({ deny });
            log(`agent-surface: agent ${id} → 隐藏 ${String(deny.length)} 个 mcp__* 工具` +
                `（已装载：${loadedOf(agent).join(', ') || '无'}）`);
        }
        catch (error) {
            applied.delete(agent);
            log(`agent-surface: agent ${id} 下发按需加载限制失败（${messageOf(error)}），保持原工具表`);
        }
    };
    /**
     * 装载（**替换**语义）：`servers: []` = 全部卸掉。只装认识的，未知名字进 `unknown` 不抛。
     *
     * 台账**先**写、再下发：即使下发失败（宿主太旧），`mcp_servers` 报的装载状态与
     * `mcp_load` 的返回也仍然自洽（模型不会看到一个「装了一半」的状态）。
     */
    const load = (agentLike, servers) => {
        // 白名单与裁名单**同一份**来源：只装托管行里的 server（外部行没有装载入口，见 planSurfaceDeny）。
        const known = new Set(managedServers());
        const unknown = [];
        const loaded = [];
        for (const raw of servers) {
            const name = typeof raw === 'string' ? raw.trim() : '';
            if (name === '')
                continue;
            if (!known.has(name)) {
                if (!unknown.includes(name))
                    unknown.push(name);
                continue;
            }
            if (!loaded.includes(name))
                loaded.push(name);
        }
        const agent = agentLike !== null && typeof agentLike === 'object' ? agentLike : undefined;
        if (agent === undefined)
            return { loaded: [], unknown, tools: [] };
        loadedBy.set(agent, loaded);
        try {
            applyTo(agent);
        }
        catch (error) {
            log(`agent-surface: 装载后下发失败（${messageOf(error)}），台账已更新、限制保持原样`);
        }
        return { loaded, unknown, tools: visibleTools(agent) };
    };
    const control = {
        loadedServers: (agent) => (agent !== null && typeof agent === 'object' ? [...loadedOf(agent)] : []),
        load,
        visibleTools,
    };
    const owner = toolsCtx;
    if (typeof owner.on !== 'function') {
        log('agent-surface: ctx.on 不可用，agent 事件订阅失败，按需加载关闭');
        try {
            options.onReady?.(control);
        }
        catch (error) {
            log(`agent-surface: onReady 回调抛错（${messageOf(error)}）`);
        }
        return () => { };
    }
    const subscribe = (name, listener) => {
        try {
            const dispose = owner.on.call(toolsCtx, name, listener);
            if (typeof dispose === 'function')
                disposers.push(dispose);
        }
        catch (error) {
            log(`agent-surface: 订阅 ${name} 失败（${messageOf(error)}）`);
        }
    };
    subscribe('agent/created', (...args) => {
        const agent = args[0]?.agent;
        if (agent === undefined)
            return;
        try {
            applyTo(agent);
        }
        catch (error) {
            // 兜底：宁可这个 agent 不按需加载，也不许把会话创建带下去。
            log(`agent-surface: 给 agent 下发按需加载失败（${messageOf(error)}），保持原工具表`);
        }
    });
    subscribe('agent/disposed', (...args) => {
        const agent = args[0]?.agent;
        if (agent === undefined)
            return;
        seen.delete(agent);
        loadedBy.delete(agent);
        lift(agent);
    });
    /**
     * 按**新注册集**重算：MCP server 是后连上的（`tools/change` 由 mcp-client 在 `tools/list`
     * 之后触发），不重算的话新 server 的全套工具会一直露着（模型不需要 `mcp_load` 就能用）。
     *
     * 重入是必然的：`restrict()` 自己也会发 `tools/change`。互斥标志挡住那一层嵌套（名单没变时
     * `applyTo` 本来就只做一次集合比较），而「先登记再下发」保证嵌套进来时看到的是新名单。
     */
    const resyncNow = () => {
        if (resyncing)
            return;
        resyncing = true;
        try {
            for (const agent of [...seen.values()])
                applyTo(agent);
        }
        catch (error) {
            log(`agent-surface: 工具集变更后重算失败（${messageOf(error)}），保持当前限制`);
        }
        finally {
            resyncing = false;
        }
    };
    /**
     * 把一串同步的 `tools/change` 合并成**一次**重算（一个 server 连上会逐条注册几十个工具，
     * 逐条重算等于几十轮 restrict）。合并到 microtask 不影响正确性：工具表是在**请求构建时**
     * 才投影给模型的，microtask 一定跑在下一次模型调用之前。
     */
    const scheduleResync = () => {
        if (pendingResync || closed)
            return;
        pendingResync = true;
        queueMicrotask(() => {
            pendingResync = false;
            if (closed)
                return;
            try {
                resyncNow();
            }
            catch (error) {
                log(`agent-surface: tools/change 处理失败（${messageOf(error)}）`);
            }
        });
    };
    subscribe('tools/change', () => {
        scheduleResync();
    });
    /*
     * 把**已经在活的** agent 补进台账并应用一次。
     *
     * 这是「插件热重载 / 升级」那条路径的唯一兜底：旧实例卸载时 disposer 已经把限制撤了，而
     * `agent/created` 不会为已存在的会话再发一次——不补的话，切到 on-demand 之后的那些会话会
     * 一直看到全部 `mcp__*`，直到会话重开。`agents` 服务缺失时静默退化，只依赖 `agent/created`。
     */
    const injectable = toolsCtx;
    try {
        const dispose = injectable.inject?.(['agents'], (serviceCtx) => {
            const agents = serviceCtx?.agents;
            const list = agents?.list;
            if (typeof list !== 'function')
                return;
            let live;
            try {
                live = list.call(agents);
            }
            catch (error) {
                log(`agent-surface: agents.list() 失败（${messageOf(error)}），只依赖 agent/created`);
                return;
            }
            if (!Array.isArray(live))
                return;
            let hydrated = 0;
            for (const agent of live) {
                try {
                    applyTo(agent);
                    hydrated += 1;
                }
                catch (error) {
                    log(`agent-surface: 补算在活 agent 失败（${messageOf(error)}），保持原工具表`);
                }
            }
            if (hydrated > 0)
                log(`agent-surface: 挂载时补算 ${String(hydrated)} 个在活 agent 的工具面`);
        });
        if (typeof dispose === 'function')
            disposers.push(dispose);
    }
    catch (error) {
        log(`agent-surface: inject agents 失败（${messageOf(error)}），只依赖 agent/created`);
    }
    try {
        options.onReady?.(control);
    }
    catch (error) {
        log(`agent-surface: onReady 回调抛错（${messageOf(error)}）`);
    }
    return () => {
        closed = true;
        for (const agent of [...applied.keys()])
            lift(agent);
        applied.clear();
        loadedBy.clear();
        seen.clear();
        for (const dispose of disposers.splice(0)) {
            try {
                dispose();
            }
            catch {
                /* 已注销 */
            }
        }
    };
}
//# sourceMappingURL=agent-surface.js.map