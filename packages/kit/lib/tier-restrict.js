import { resolveSessionTier } from './tier-gate.js';
/**
 * 需要裁掉的名字：**注册集 ∩ 分类表里非 read 的那些**（纯函数，顺序跟随 `registered`）。
 *
 * 输入必须是 `schemas()` 拿到的**真实注册名**——分类表里那些「本会话没注册」的名字
 * （条件注册的 `sftp_*` / `tunnel_*`）一旦被点名，`restrict()` 会整体抛错，所以这里以
 * 「注册集」为外层循环、分类表只用来问类别。
 */
export function tierRestrictedNames(registered, classify, prefixes = []) {
    const denied = [];
    for (const name of registered) {
        if (name === '')
            continue;
        if (prefixes.length > 0 && !prefixes.some((prefix) => name.startsWith(prefix)))
            continue;
        let cls;
        try {
            cls = classify(name);
        }
        catch {
            // 分类函数抛错 = 表坏了：按「不裁」处理（宁可多留一个工具，不拿一次抛错炸掉整次裁剪）。
            cls = undefined;
        }
        if (cls === undefined || cls === 'read')
            continue;
        denied.push(name);
    }
    return denied;
}
/**
 * 这一档要不要裁剪。三条 `false` 与 `decideTierCall` 的 allow 硬分支**一一对应**
 * （服务未组合 / auto review / 完全权限）：那三支下工具本来就能用，藏起来是另一种行为。
 *
 */
export function shouldRestrictForTier(tier) {
    if (!tier.services.sandboxPolicy)
        return false;
    if (tier.auto)
        return false;
    return tier.mode !== 'danger-full-access';
}
/** 取一个 context 绑定的 `tools` 服务（取不到 = 环境不支持，调用方按「不裁剪」处理）。 */
function toolsOf(target) {
    if (target === null || typeof target !== 'object')
        return undefined;
    const usable = (candidate) => candidate !== null &&
        typeof candidate === 'object' &&
        typeof candidate.schemas === 'function';
    // ① `agent.ctx.tools`：宿主按调用方 context 重绑 `this` 的那一份（scope 就藏在它里面）。
    try {
        const direct = target.tools;
        if (usable(direct))
            return direct;
    }
    catch {
        // cordis 的 inject 守卫：读不到就走 `get`（同样是按调用方绑定的路径）。
    }
    // ② `ctx.get('tools')`：插件**声明式** inject 过 tools 时的既有取法（tty 的 plugin 就是这么写的；
    //    没有声明式 inject 的插件（如 docker）只有 `ctx.inject(['tools'], cb)` 回调里那个 ctx 能读到）。
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
/** 两个名字集合是否等价（顺序无关；裁剪名单重算后用来判断「要不要重下限制」）。 */
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
/**
 * agent 的**会话** id —— 与 {@link agentIdOf} 刻意分开。
 *
 * 比对的对象是 `session/event` 带来的那个 session，所以这里只认 `agent.session.id`，不拿
 * `agent.id` 顶替：两者今天同值，但同值是**宿主实现**的约定，不是本模块的判据。顶替的坏处是
 * 某天它们分叉时，重算会静默落到**错误的会话**上（既不报错、也不裁错人，只是裁了别人）。
 */
function sessionIdOf(agent) {
    const session = agent.session;
    return typeof session?.id === 'string' && session.id !== '' ? session.id : undefined;
}
/**
 * 档位旋钮对应的**会话事件**类型（`permission/preset` 是 preset 自己，另外两个是它展开的旋钮）。
 *
 * 为什么三个都订：`shouldRestrictForTier` 同时看 `mode` 与 `auto`（`auto` 来自 preset），只订
 * `sandbox/mode` 会让「切到 / 切离 Auto review」不重算——而 Auto review 档是不裁的。
 */
const TIER_KNOB_EVENTS = new Set(['sandbox/mode', 'approval/policy', 'permission/preset']);
/** 错误文案（日志用；`unknown` 收窄只做一次）。 */
function messageOf(error) {
    return error instanceof Error ? error.message : String(error);
}
/**
 * 在插件作用域上接管 `agent/created`：按会话档位给每个 agent 的 scope 下一层工具限制，
 * 返回撤销函数（撤掉所有已下发的限制 + 退订）。**全程不抛**——`agent/created` 是 serial
 * 派发，在这里抛会让会话创建失败，而工具裁剪只是省一轮往返，没有资格让会话起不来。
 *
 * 生命周期：与工具注册同一个 `ctx.effect`（插件禁用 / 卸载时一起撤）。**不要放进
 * `registerAll`**：热应用配置会重注册工具，而重注册不该把已有 agent 的裁剪一并撤掉
 * （`agent/created` 不会为老 agent 再发一次，撤了就再也裁不回来）。
 *
 * 挂载时还会用 `ctx.inject(['agents'])` 把**在活的** agent 补进台账（`agents.list()`），
 * 并立刻应用一次。原因：插件热重载 / 升级时，旧实例的 disposer 已经把所有限制撤掉了，而
 * `agent/created` 不会为已存在的会话再发一次——不补这一步，升级后那些会话会一直看到全部
 * 工具（A 的裁剪也一起失效），直到会话重开。服务缺失（老宿主）时退化成只依赖 `agent/created`。
 */
export function attachTierRestrict(ctx, options) {
    const log = options.log ?? ((message) => {
        console.log(`[dsh-${options.pkg}] ${message}`);
    });
    /** 捕获的宿主服务（与 kit `attachTierGate` 同三条 inject；kit 的快照是私有的，这里自建一份）。 */
    const snapshot = {};
    const disposers = [];
    /** agent（对象身份 = 宿主 scope 键）→ 已落地的裁剪。 */
    const applied = new Map();
    /** 见过面的 agent（含当前没被裁的那些）：工具集一变就要拿新注册集重算。 */
    const seen = new Map();
    let resyncing = false;
    let pendingResync = false;
    /** 等着重算的**会话** id（一次切档最多三条旋钮事件，合并成一次重算）。 */
    const pendingSessions = new Set();
    let sessionResyncQueued = false;
    let closed = false;
    let serviceMissingLogged = false;
    let toolsMissingLogged = false;
    const injectable = ctx;
    if (typeof injectable.inject !== 'function') {
        log('tier-restrict: ctx.inject 不可用，档位服务无法捕获，裁剪关闭');
        return () => { };
    }
    const bindService = (service, key) => {
        try {
            const dispose = injectable.inject([service], (serviceCtx) => {
                const composed = serviceCtx?.[service];
                if (composed === undefined || composed === null)
                    return;
                snapshot[key] = composed;
            });
            if (typeof dispose === 'function')
                disposers.push(dispose);
        }
        catch (error) {
            log(`tier-restrict: inject ${service} 失败（${messageOf(error)}），按服务未组合处理`);
        }
    };
    bindService('sandboxPolicy', 'sandbox');
    bindService('approval', 'approval');
    bindService('permissionPresets', 'presets');
    /** 撤销某个 agent 的裁剪（重复调用安全：agent scope 回收后的 disposer 也要能跑）。 */
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
    const applyTo = (agent) => {
        if (agent === null || typeof agent !== 'object')
            return;
        // 记下来：工具集热变更（配置加了连接簿 / 隧道）时要拿新注册集给这批 agent 重算。
        seen.set(agent, agent);
        // 全局视图（`schemas()` 不传参）：名单口径必须是「宿主全局工具集」，不是这个 agent 的视图。
        const host = toolsOf(ctx);
        if (host === undefined) {
            if (!toolsMissingLogged) {
                toolsMissingLogged = true;
                log('tier-restrict: tools 服务不可用，跳过工具裁剪');
            }
            return;
        }
        let tier;
        try {
            tier = resolveSessionTier(snapshot, agent.session);
        }
        catch (error) {
            log(`tier-restrict: 档位解析失败（${messageOf(error)}），跳过工具裁剪`);
            return;
        }
        const restrictedByTier = shouldRestrictForTier(tier);
        if (!restrictedByTier && !tier.services.sandboxPolicy && !serviceMissingLogged) {
            serviceMissingLogged = true;
            log('tier-restrict: sandboxPolicy 未组合，按现状不裁剪');
        }
        const id = agentIdOf(agent);
        const names = globalToolNames(host);
        const relevant = options.prefixes.length === 0 ? names : names.filter((name) => options.prefixes.some((prefix) => name.startsWith(prefix)));
        const deny = restrictedByTier ? tierRestrictedNames(names, options.classify, options.prefixes) : [];
        // 名单为空才 `lift`：这一支承担「档位放开了，把之前那层撤掉」的语义——`lift` 撤的是上一次
        // 下发的限制，为空时正好回到宿主全局集。
        if (deny.length === 0) {
            lift(agent);
            return;
        }
        // **必须**从 agent 自己的 ctx 调（见文件头）：插件 ctx 上没有 scope，restrict 会直接抛。
        const target = toolsOf(agent.ctx);
        if (target === undefined || typeof target.restrict !== 'function') {
            log(`tier-restrict: agent ${id} 没有可用的 scoped tools（宿主太旧或缺 restrict），跳过工具裁剪`);
            return;
        }
        const current = applied.get(agent);
        if (current !== undefined && sameNames(current.deny, deny))
            return;
        lift(agent);
        // 先登记再下发：restrict 会同步触发 `tools/change`，重入的路径看到「已落地」才不会重复下发。
        const record = { id, deny, dispose: () => { } };
        applied.set(agent, record);
        try {
            record.dispose = target.restrict({ deny });
            // 数字口径：`kept` 只数**本插件前缀内**被留下的工具，别拿 `relevant.length - deny.length`
            // ——deny 名单只由注册集投影，两者本应一致；用 includes 再数一遍是防分类表与注册集漂移。
            const deniedInPrefixes = relevant.filter((name) => deny.includes(name)).length;
            log(`tier-restrict: agent ${id} mode=${tier.mode} → ${options.pkg} 工具 ${String(relevant.length)} → ` +
                `${String(relevant.length - deniedInPrefixes)}（裁掉 ${String(deny.length)} 个 write/exec：${deny.join(', ')}）`);
        }
        catch (error) {
            applied.delete(agent);
            log(`tier-restrict: agent ${id} 下发工具限制失败（${messageOf(error)}），保持原工具表`);
        }
    };
    const owner = ctx;
    if (typeof owner.on !== 'function') {
        log('tier-restrict: ctx.on 不可用，agent 事件订阅失败，裁剪关闭');
        return () => {
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
    const subscribe = (name, listener) => {
        try {
            const dispose = owner.on.call(ctx, name, listener);
            if (typeof dispose === 'function')
                disposers.push(dispose);
        }
        catch (error) {
            log(`tier-restrict: 订阅 ${name} 失败（${messageOf(error)}）`);
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
            // 兜底：宁可这个 agent 不裁剪，也不许把会话创建带下去。
            log(`tier-restrict: 裁剪 agent 失败（${messageOf(error)}），保持原工具表`);
        }
    });
    subscribe('agent/disposed', (...args) => {
        const agent = args[0]?.agent;
        if (agent === undefined)
            return;
        seen.delete(agent);
        lift(agent);
    });
    /*
     * 把**已经在活的** agent 补进台账并应用一次。
     *
     * 这是「插件重载 / 升级」那条路径的唯一兜底：旧实例卸载时 disposer 已经把限制全撤了，而
     * `agent/created` 不会为已存在的会话再发一次——不补的话，升级后那些会话一直看到全部工具
     * （A 的裁剪同样失效），直到会话重开。`agents` 服务缺失（老宿主）时静默退化，只依赖事件。
     */
    try {
        const dispose = injectable.inject(['agents'], (serviceCtx) => {
            const agents = serviceCtx?.agents;
            const list = agents?.list;
            if (typeof list !== 'function') {
                log('tier-restrict: agents 服务没有 list()，跳过在活 agent 的补算（只依赖 agent/created）');
                return;
            }
            let live;
            try {
                live = list.call(agents);
            }
            catch (error) {
                log(`tier-restrict: agents.list() 失败（${messageOf(error)}），只依赖 agent/created`);
                return;
            }
            if (!Array.isArray(live))
                return;
            let hydrated = 0;
            for (const agent of live) {
                try {
                    // 先记进 seen：这批 agent 之后没有 `agent/created`，工具集再变也还要重算。
                    applyTo(agent);
                    hydrated += 1;
                }
                catch (error) {
                    log(`tier-restrict: 补算在活 agent 失败（${messageOf(error)}），保持原工具表`);
                }
            }
            if (hydrated > 0)
                log(`tier-restrict: 挂载时补算 ${String(hydrated)} 个在活 agent 的工具面`);
        });
        if (typeof dispose === 'function')
            disposers.push(dispose);
    }
    catch (error) {
        log(`tier-restrict: inject agents 失败（${messageOf(error)}），只依赖 agent/created`);
    }
    /**
     * 按**当前注册集**重算：各插件的工具都是条件注册的（tty 配置加了连接簿 → `sftp_*` 才出现；
     * docker 能力开关打开后 5 个写 / 执行工具才出现），而 `restrict` 是静态名字集合——不重算的话
     * 「会话建立后才注册的 write 工具」会一直露着。
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
            log(`tier-restrict: 工具集变更后重算失败（${messageOf(error)}），保持当前限制`);
        }
        finally {
            resyncing = false;
        }
    };
    /**
     * 把一串同步的 `tools/change` 合并成**一次**重算：`registerAll` 先撤后挂，19 件工具会产生
     * 三十来条事件，逐条重算等于每次保存设置都重下发几轮限制（还会打一串日志）。
     *
     * 合并到 microtask 不影响正确性：工具是在**请求构建时**才被投影给模型的，而 microtask 一定
     * 跑在下一次模型调用之前。
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
                log(`tier-restrict: tools/change 处理失败（${messageOf(error)}）`);
            }
        });
    };
    subscribe('tools/change', () => {
        scheduleResync();
    });
    /**
     * 只重算**一个会话**的 agent：档位是会话级旋钮，别的会话的工具面不该被这一次切换碰一下。
     *
     * 名单仍然走 `applyTo` 里的 `schemas()` 现算（与 `agent/created` / `tools/change` 同一条路径、
     * 同一份判据），所以「切档之后才条件注册的工具」也一并落进这次重算，不另立一套。
     */
    const resyncSessions = (ids) => {
        const wanted = new Set(ids);
        for (const agent of [...seen.values()]) {
            const id = sessionIdOf(agent);
            if (id === undefined || !wanted.has(id))
                continue;
            applyTo(agent);
        }
    };
    /**
     * 把一串旋钮事件合并成**一次**重算（理由与 {@link scheduleResync} 同源：工具表在请求构建时
     * 才投影给模型，microtask 一定跑在下一次请求之前）。
     *
     * 为什么按会话 id 而不是直接重算全部：一次切档只影响一个会话，而每个 agent 的重算都要读一次
     * 全局 `schemas()` 并可能下发一次 `restrict()`；多会话宿主里那是白花的钱。
     */
    const scheduleSessionResync = (sessionId) => {
        if (closed)
            return;
        pendingSessions.add(sessionId);
        if (sessionResyncQueued)
            return;
        sessionResyncQueued = true;
        queueMicrotask(() => {
            sessionResyncQueued = false;
            const ids = [...pendingSessions];
            pendingSessions.clear();
            if (closed)
                return;
            try {
                resyncSessions(ids);
            }
            catch (error) {
                log(`tier-restrict: 档位切换后重算失败（${messageOf(error)}），保持当前限制`);
            }
        });
    };
    /*
     * 会话中途的档位切换：宿主把旋钮写成**会话事件**，派发时第一个参数就是 session（签名
     * `(session, event)`，见 `dsh-session` 的 `session/event`），所以「按 session 找回 agent」
     * 只是拿 `agent.session.id` 比一下，不需要反查机制。
     *
     * 两个方向都收：升档时 `deny` 变空 → `lift()` 把工具放回来；降档时重新算出一份非空名单 →
     * 重新下发。不订阅的话，升档会话的模型会一直面对旧工具面（看着像「授权没生效」），降档会话
     * 则会反复去试已经不可能成功的工具。
     */
    subscribe('session/event', (...args) => {
        /* 信封是 `{ type, seq, time, data }`——只看顶层 `type`，载荷一个字不读（见文件头第 3 条）。 */
        const event = args[1];
        if (typeof event?.type !== 'string' || !TIER_KNOB_EVENTS.has(event.type))
            return;
        const session = args[0];
        const id = typeof session?.id === 'string' ? session.id : undefined;
        if (id === undefined || id === '')
            return;
        scheduleSessionResync(id);
    });
    return () => {
        closed = true;
        pendingSessions.clear();
        for (const agent of [...applied.keys()])
            lift(agent);
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
//# sourceMappingURL=tier-restrict.js.map