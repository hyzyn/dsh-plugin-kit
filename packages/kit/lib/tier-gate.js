/**
 * 档位的用户可见名。取自部署客户端的 i18n（`preset.readOnly` / `preset.workspaceWrite` /
 * `preset.fullAccess`，见方案 §1），只进 ask / deny 文案，不参与判定。
 */
const MODE_LABEL = {
    'read-only': '仅可查看',
    'workspace-write': '工作区内修改',
    'danger-full-access': '完全权限',
};
/**
 * 读一次会话的有效档位。**每次调用都要重新读**：档位是会话级旋钮（会话事件折叠），用户切档后
 * 下一个调用就要按新档走，没有任何缓存的位置。快照里的服务引用由 `attachTierGate` 在宿主
 * 组合期捕获一次，引用本身不换——会话状态在服务内部，拿引用读到的就是实时值。
 *
 * @param snapshot - 捕获的宿主服务；缺谁 `services` 里就报谁（`sandbox` 缺 = 整闸不生效）。
 * @param session - 调用方 agent 的会话（`exec.agent.session`）。`undefined`（agentless）取**严侧**：
 *   无会话即无审批通道（宿主 `serviceAsk` 对 agentless 一律拒绝），policy 视作 `never`。
 */
export function resolveSessionTier(snapshot, session) {
    const { sandbox, approval, presets } = snapshot;
    const services = { sandboxPolicy: sandbox !== undefined, approval: approval !== undefined };
    let mode = 'read-only';
    if (sandbox !== undefined && typeof sandbox.resolve === 'function') {
        const resolved = sandbox.resolve(session === undefined ? {} : { session });
        if (resolved?.mode === 'read-only' ||
            resolved?.mode === 'workspace-write' ||
            resolved?.mode === 'danger-full-access') {
            mode = resolved.mode;
        }
        // 解析出词汇表之外的值 = 宿主方言我们不认识：按最严档处理（宁严勿松——比宿主严永远合法，
        // 比宿主松违反本层的存在理由）。
    }
    let policy;
    if (session === undefined) {
        policy = 'never';
    }
    else {
        let override;
        if (approval !== undefined && typeof approval.overrideOf === 'function') {
            try {
                override = approval.overrideOf(session);
            }
            catch {
                override = undefined;
            }
        }
        const configured = approval?.config?.policy;
        const raw = override ?? configured;
        policy = raw === 'never' ? 'never' : 'ask';
        // 词汇表之外的策略值按 'ask' 落：ask 在宿主侧永远 fail-closed，不会比宿主松。
    }
    let auto = false;
    if (session !== undefined && presets !== undefined && typeof presets.current === 'function') {
        try {
            auto = presets.current(session) === 'auto';
        }
        catch {
            auto = false;
        }
    }
    return { mode, policy, auto, services };
}
/**
 * 决策矩阵本体（方案 §2.2，纯函数）。唯一判定处——行为上的任何改动都只应该发生在这里。
 */
export function decideTierCall(tier, cls, tool) {
    if (!tier.services.sandboxPolicy)
        return { action: 'allow' };
    if (tier.auto)
        return { action: 'allow' };
    if (tier.mode === 'danger-full-access')
        return { action: 'allow' };
    if (cls === 'read')
        return { action: 'allow' };
    if (tier.policy === 'ask') {
        return { action: 'ask', reason: tierAskReason({ tool, mode: tier.mode }) };
    }
    return { action: 'deny', reason: tierDenialReason({ tool, mode: tier.mode, policy: tier.policy, cls }) };
}
/** ask 的 reason（给人看的一句话；工具调用的参数已由宿主挂在弹窗上，这里不重复）。 */
export function tierAskReason(input) {
    return `${input.tool}：当前会话权限档位为「${MODE_LABEL[input.mode]}」，执行前需要你确认（只允许这一次）。`;
}
/** deny 的 reason（档位拒绝那一支；审批拒绝的措辞归宿主）。 */
export function tierDenialReason(input) {
    const head = `当前会话权限档位为「${MODE_LABEL[input.mode]}」` +
        (input.policy === 'never' ? '且无人值守（审批策略 never）' : '') +
        `：${input.tool} 被拒绝。`;
    const tail = `要执行这类操作，请用户调整会话权限档位。`;
    const bash = input.cls === 'exec' ? '若是纯非交互命令，可改用 bash 工具（受沙箱约束的执行通道）。' : '';
    return `${head}${tail}${bash}`;
}
/** 启动审计行：服务组合是宿主装配期事实，attach 与每次捕获到新服务时各打一行。 */
export function tierGateStartupLine(services) {
    if (services.sandboxPolicy && services.approval)
        return 'tier-gate: active';
    return (`tier-gate: services absent (sandboxPolicy=${services.sandboxPolicy} approval=${services.approval}), ` +
        'per-call gate disabled');
}
/**
 * 在插件作用域上挂 `tools/pre-execute` 监听并返回注销函数。**与工具注册同生命周期**：
 * 插件禁用热生效时随工具一起撤下（tty 进 `activeDisposers`、docker 进 `toolDisposers`）。
 *
 * 服务读取走 **`ctx.inject(['<名>'], cb)`**（可选服务的宿主合法通道，'tools' / 'credentials'
 * 先例）：服务存在时回调把实例捕获进快照、缺失时回调不触发——闸随捕获进度自动从「不闸」
 * 切到「生效」，每次状态变化打一行审计。为什么不用 `ctx.get`：cordis 对插件作用域读未声明
 * inject 的已注册服务直接抛（`without inject`，2026-10-07 真机实测），详见
 * `TierServicesSnapshot` 的注释。
 *
 * `ctx.on` 对插件作用域可达的先例是 codegraph 的 `session/event` 收集器；若宿主某代不可达，
 * 打一行审计后返回空注销函数——退化成现状，不抛错。attach 本身**全程不抛**，插件 apply
 * 不能被闸门带下去。
 */
export function attachTierGate(ctx, options) {
    const log = options.log ?? ((message) => {
        console.log(`[dsh-${options.pkg}] ${message}`);
    });
    const snapshot = {};
    const flags = () => ({ sandboxPolicy: snapshot.sandbox !== undefined, approval: snapshot.approval !== undefined });
    log(tierGateStartupLine(flags()));
    const disposers = [];
    const injectable = ctx;
    if (typeof injectable.inject === 'function') {
        const bind = (service, key) => {
            try {
                const dispose = injectable.inject([service], (serviceCtx) => {
                    const svc = serviceCtx[service];
                    if (svc === undefined || svc === null)
                        return;
                    snapshot[key] = svc;
                    log(`tier-gate: ${service} composed`);
                    log(tierGateStartupLine(flags()));
                });
                if (typeof dispose === 'function')
                    disposers.push(dispose);
            }
            catch (error) {
                log(`tier-gate: inject ${service} 失败（${error instanceof Error ? error.message : String(error)}），按服务未组合处理`);
            }
        };
        bind('sandboxPolicy', 'sandbox');
        bind('approval', 'approval');
        bind('permissionPresets', 'presets');
    }
    else {
        log('tier-gate: ctx.inject 不可用，档位服务无法捕获，per-call gate disabled');
    }
    const warnedUnclassified = new Set();
    const listener = (exec, next) => {
        const call = exec;
        const name = typeof call?.name === 'string' ? call.name : undefined;
        if (name === undefined || !options.prefixes.some((prefix) => name.startsWith(prefix)))
            return next();
        let cls;
        try {
            cls = options.classify(name, call?.args);
        }
        catch {
            cls = undefined;
        }
        if (cls === undefined) {
            if (!warnedUnclassified.has(name)) {
                warnedUnclassified.add(name);
                log(`tier-gate: 工具 ${name} 不在分类表里，按现状放行（分类表对账的守卫测试会红）`);
            }
            return next();
        }
        let tier;
        try {
            tier = resolveSessionTier(snapshot, call?.agent?.session);
        }
        catch (error) {
            log(`tier-gate: 档位解析失败（${error instanceof Error ? error.message : String(error)}），按现状放行`);
            return next();
        }
        const decision = decideTierCall(tier, cls, name);
        if (decision.action === 'allow')
            return next();
        if (decision.action === 'deny') {
            log(`tier-gate: deny tool=${name} mode=${tier.mode} policy=${tier.policy}`);
            return { kind: 'deny', reason: decision.reason };
        }
        return { kind: 'ask', reason: decision.reason };
    };
    const owner = ctx;
    if (typeof owner.on !== 'function') {
        log('tier-gate: ctx.on 不可用，逐调用闸未挂载');
        return () => { };
    }
    const dispose = owner.on('tools/pre-execute', listener);
    disposers.push(typeof dispose === 'function' ? dispose : () => { });
    return () => {
        for (const fn of disposers.splice(0)) {
            try {
                fn();
            }
            catch {
                /* 已注销 */
            }
        }
    };
}
//# sourceMappingURL=tier-gate.js.map