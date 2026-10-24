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
        if (!shouldRestrictForTier(tier)) {
            // 档位放开了（或服务没组合）：把之前那层撤掉，工具面回到宿主全局集。
            lift(agent);
            if (!tier.services.sandboxPolicy && !serviceMissingLogged) {
                serviceMissingLogged = true;
                log('tier-restrict: sandboxPolicy 未组合，按现状不裁剪');
            }
            return;
        }
        const id = agentIdOf(agent);
        // **必须**从 agent 自己的 ctx 调（见文件头）：插件 ctx 上没有 scope，restrict 会直接抛。
        const target = toolsOf(agent.ctx);
        if (target === undefined || typeof target.restrict !== 'function') {
            log(`tier-restrict: agent ${id} 没有可用的 scoped tools（宿主太旧或缺 restrict），跳过工具裁剪`);
            return;
        }
        const names = globalToolNames(host);
        const relevant = options.prefixes.length === 0 ? names : names.filter((name) => options.prefixes.some((prefix) => name.startsWith(prefix)));
        const deny = tierRestrictedNames(names, options.classify, options.prefixes);
        if (deny.length === 0) {
            lift(agent);
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
            log(`tier-restrict: agent ${id} mode=${tier.mode} → ${options.pkg} 工具 ${String(relevant.length)} → ` +
                `${String(relevant.length - deny.length)}（裁掉 ${String(deny.length)} 个 write/exec：${deny.join(', ')}）`);
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
    /**
     * 工具集变了就按**新注册集**重算：各插件的工具都是条件注册的（tty 配置加了连接簿 →
     * `sftp_*` 才出现；docker 能力开关打开后 5 个写 / 执行工具才出现），
     * 而 `restrict` 是静态名字集合——不重算的话「会话建立后才注册的 write 工具」会一直露着。
     *
     * 重入是必然的：`restrict()` 自己也会发 `tools/change`。互斥标志挡住那一层嵌套（名单没变时
     * `applyTo` 本来就只做一次集合比较），而「先登记再下发」保证嵌套进来时看到的是新名单。
     */
    /** 工具集变了就按**新注册集**重算（见 {@link scheduleResync} 的合并说明）。 */
    const resync = () => {
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
                resync();
            }
            catch (error) {
                log(`tier-restrict: tools/change 处理失败（${messageOf(error)}）`);
            }
        });
    };
    subscribe('tools/change', () => {
        scheduleResync();
    });
    return () => {
        closed = true;
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