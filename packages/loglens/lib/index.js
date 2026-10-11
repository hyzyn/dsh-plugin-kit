import z from '@deepseek-ai/schemastery';
import { definePlugin, hasSameOriginProof, isLoopbackRequestStrict, originProofHint, plainConfig, readJsonBody, settingsEntryScope, writeJson, } from '@hyzyn/dsh-kit';
import { MAX_TARGETS, addTarget, normalizeConfig, removeTarget, updateTarget } from './config.js';
/** 本插件的路由前缀（一个 prefix 路由内部按子路径分发，与 docker / tty 同款）。 */
export const ROUTE_PREFIX = '/api/dsh-loglens';
/** 配置面能做的动作白名单：不认识的动作一律 400，绝不「照单全收」后静默丢掉。 */
export const CONFIG_ACTIONS = ['enabled', 'targets.add', 'targets.update', 'targets.remove'];
/**
 * 运行时 Config schema——DSH ≥0.1.7 起它同时就是本插件的 settings 存储。
 *
 * 全部字段标 volatile：它们是卡片可改项，而 settings.update(entryId, patch) 只接受
 * volatile 路径；loader 对 volatile-only 变更原地更新配置引用并发 loader 的配置变更
 * 事件，**不重挂插件**，插件订阅后自己重读（见 kit 的 settings 适配层）。
 */
export const Config = z.object({
    enabled: z.boolean().default(true).volatile(),
    announce: z.boolean().default(true).volatile(),
    targets: z.array(z.object({
        id: z.string().default(''),
        kind: z.string().default('loki'),
        label: z.string().default(''),
        url: z.string().default(''),
    })).default([]).volatile(),
});
/**
 * 构造 /config 的读写路由。
 *
 * read 取当前生效配置、write 落盘（并更新内存里的那一份）。两者都由 apply 注入，
 * 于是路由本身没有状态，用例可以直接喂假实现——回环围栏 / 动作白名单 / 同源证明
 * 三条判据都能在不起宿主的前提下验（见 test/loglens.test.ts）。
 */
export function makeRoutes(state) {
    return [
        {
            kind: 'prefix',
            path: ROUTE_PREFIX,
            handler: async (req, res) => {
                // 加固档围栏：字面量回环同步判定（保住「第一拍就写响应」的时序），别名主机名才等 DNS。
                const loopback = isLoopbackRequestStrict(req);
                const allowed = loopback instanceof Promise ? await loopback : loopback;
                if (!allowed) {
                    writeJson(res, 403, { error: '仅允许本机回环访问' });
                    return;
                }
                const sub = new URL(req.url ?? '/', 'http://loopback').pathname.slice(ROUTE_PREFIX.length);
                if (sub !== '/config') {
                    writeJson(res, 404, { error: '未知路由：' + sub });
                    return;
                }
                if (req.method === 'GET') {
                    writeJson(res, 200, { ok: true, config: state.read() });
                    return;
                }
                if (req.method !== 'POST') {
                    writeJson(res, 405, { error: '只支持 GET / POST，收到 ' + String(req.method) });
                    return;
                }
                const body = await readJsonBody(req);
                if (body === undefined) {
                    // 空 body / 非法 JSON / 顶层不是对象：一律 400（与 kit 的 readJsonBody 口径一致）
                    writeJson(res, 400, { error: '请求体不是合法的 JSON 对象' });
                    return;
                }
                const action = typeof body.action === 'string' ? body.action : '';
                if (!CONFIG_ACTIONS.includes(action)) {
                    writeJson(res, 400, { error: '未知动作：' + JSON.stringify(action) + '（支持 ' + CONFIG_ACTIONS.join(' / ') + '）' });
                    return;
                }
                // 按动作豁免：enabled 是「禁用后唯一的恢复入口」，其余动作要有同源证明。
                if (action !== 'enabled' && !hasSameOriginProof(req)) {
                    writeJson(res, 403, { error: '缺少同源证明（' + originProofHint(req) + '）' });
                    return;
                }
                const current = state.read();
                let next;
                if (action === 'enabled') {
                    if (typeof body.enabled !== 'boolean') {
                        writeJson(res, 400, { error: 'enabled 必须是布尔值' });
                        return;
                    }
                    next = { ...current, enabled: body.enabled };
                }
                else if (action === 'targets.add') {
                    const outcome = addTarget(current, body.target);
                    if (!outcome.ok) {
                        writeJson(res, 400, { error: outcome.error });
                        return;
                    }
                    next = outcome.config;
                }
                else if (action === 'targets.update') {
                    const outcome = updateTarget(current, body.id, body.patch);
                    if (!outcome.ok) {
                        writeJson(res, 400, { error: outcome.error });
                        return;
                    }
                    next = outcome.config;
                }
                else {
                    const outcome = removeTarget(current, body.id);
                    if (!outcome.ok) {
                        writeJson(res, 400, { error: outcome.error });
                        return;
                    }
                    next = outcome.config;
                }
                const warning = await state.write(next);
                writeJson(res, 200, { ok: true, config: next, ...(warning === undefined ? {} : { warning }) });
            },
        },
    ];
}
const plugin = definePlugin({
    name: 'loglens',
    inject: [],
    apply(ctx, rawConfig) {
        // volatile 字段解析后是取值的冻结引用，先还原成纯数据（见 @hyzyn/dsh-kit 的 plainConfig）。
        const config = plainConfig((rawConfig ?? {}));
        let live = normalizeConfig(config).config;
        const scope = settingsEntryScope(ctx, 'loglens');
        /*
         * 卡片写的就是 volatile 字段：loader 原地更新配置引用并发一条配置变更事件，
         * 这里重读一次即可——插件不重挂，所以「内存里的那一份」必须自己跟上。
         */
        if (scope !== undefined) {
            ctx.effect(() => scope.onChanged(() => {
                live = normalizeConfig(scope.get()).config;
            }), 'dsh-loglens: settings sync');
        }
        /** 落盘并把内存那一份换掉；没有 settings 服务时如实回报「只在本次进程内有效」。 */
        async function persist(next) {
            live = next;
            if (scope === undefined)
                return '宿主没有 settings 服务，改动只在本次进程内有效';
            try {
                await scope.update({ enabled: next.enabled, targets: next.targets });
                return undefined;
            }
            catch (error) {
                return '写入 profile 配置失败：' + (error instanceof Error ? error.message : String(error));
            }
        }
        ctx.inject(['webServer'], (webCtx) => {
            webCtx.effect(() => {
                const server = webCtx.webServer;
                const disposers = makeRoutes({ read: () => live, write: persist }).map((route) => server.register(route));
                return () => {
                    for (const dispose of disposers) {
                        try {
                            dispose();
                        }
                        catch {
                            /* 释放失败不阻塞 */
                        }
                    }
                };
            }, 'dsh-loglens: routes');
        });
        if (config.announce !== false) {
            console.log('[dsh-loglens] mounted（来源 ' + String(live.targets.length) + ' / ' + String(MAX_TARGETS) + '，查询能力尚未实现）');
        }
    },
});
export const { name, inject, apply } = plugin;
//# sourceMappingURL=index.js.map