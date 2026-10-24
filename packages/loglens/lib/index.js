import z from '@deepseek-ai/schemastery';
import { attachTierGate, definePlugin, hasSameOriginProof, isLoopbackRequestStrict, originProofHint, plainConfig, readJsonBody, registerLiteralSection, settingsEntryScope, writeJson, } from '@hyzyn/dsh-kit';
import { MAX_TARGETS, addTarget, normalizeConfig, publicConfig, removeTarget, updateTarget } from './config.js';
import { backendFor } from './backends/registry.js';
import { runFacets, runFields, runSearch } from './execute.js';
import { dockerPluginLoaded } from './plugins.js';
import { LOGLENS_TIER_CLASS, LOGLENS_TIER_PREFIXES, registerLoglensTools } from './tools.js';
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
 * 面向模型的公告（渐进披露 T5，2026-10-24）。
 *
 * 五个工具此前只靠各自 description 自我介绍，「何时用哪个、没配来源先去哪」没有任何文本面。
 * 这里补一段具名 section（`plugin:dsh-loglens`，order 151），只写**顺序与门禁**：
 * 查日志的推荐链路、facets 的能力门（只有 ES / OpenSearch 来源有）、零来源时先去配置。
 * 不写：参数清单、内部 API 名、配置文件路径、仓内文档编号（那是 schema 与 README 的事）。
 */
export const LOGLENS_GUIDANCE = '本机已安装 dsh-loglens 插件（日志查询）：用户在问某个服务 / 容器的日志、报错或时间分布时，'
    + '先用 loglens_sources 拿到来源 target，再用 loglens_search 查行、loglens_context 看某行前后的上下文、'
    + 'loglens_facets 看分组与时间分布（仅 Elasticsearch / OpenSearch 来源支持聚合）。'
    + '一个来源都还没配时，先引导用户到「设置 → 插件配置 → 日志查询」添加，不要调用其余 loglens 工具。';
/**
 * 注册面按当前配置收窄（渐进披露 T2/T7）。返回 undefined = 五个全注册（既有行为）。
 *
 *  - **零来源**：只放行 `loglens_sources`——它是「去设置里配来源」的唯一入口，其余四个此刻调用
 *    必然在 resolveTarget 的空清单文案上抛错，注册它们等于给模型四个必然报错的工具。
 *  - **没有任何一个来源支持聚合**（Loki 声明 aggregations:false、Docker 没有适配器）：跳过
 *    `loglens_facets`——它对所有现役来源都只会抛 facetsHint。
 *
 * 名单随配置走：面板增删来源走 /config → persist → refreshTools 重建，重建时按新清单现算；
 * 设置侧的热更新（scope.onChanged）也跟着重建。对账守卫（test/tier-gate.test.ts）按
 * tools.ts 的 add() 字面量现算**全量名单**做分类对账，不受这里收窄的影响。
 */
function includeFor(config) {
    if (config.targets.length === 0)
        return (name) => name === 'loglens_sources';
    const aggregatable = config.targets.some((target) => backendFor(target.kind)?.capabilities().aggregations === true);
    if (!aggregatable)
        return (name) => name !== 'loglens_facets';
    return undefined;
}
/**
 * 查询响应里带上这条来源的**能力**：面板据此决定画不画「时间分布」（直方图）。
 *
 * **为什么不放 `/config`**：能力是**运行期事实**（来自适配器的 `capabilities()`），不是设置项；
 * 而且它跟着**这一次查询**回来，正好是画分布所需要的时机（分布本来也只对这一次的窗口有意义）。
 *
 * **为什么不让面板按 `kind` 自己判**：那等于把「谁能聚合」抄成第二份判据——Loki 接上 LogQL
 * 指标查询的那天，抄的那份会**静默过期**，而这一位正是「不给一个永远报错的入口」所依赖的东西。
 * 所以只由宿主算、随响应下发。
 */
function capabilitiesOf(state, outcome) {
    const target = outcome.target;
    const kind = target !== null && typeof target === 'object' ? target.kind : undefined;
    if (typeof kind !== 'string')
        return undefined;
    const backend = state.backendFor(kind);
    if (backend === undefined)
        return undefined;
    const caps = backend.capabilities();
    return {
        queryLanguage: caps.queryLanguage,
        pagination: caps.pagination,
        follow: caps.follow,
        aggregations: caps.aggregations,
    };
}
/**
 * 构造面板用的四条路由：`/config`（读写）、`/query`（查）、`/fields`（列字段）、`/facets`（分组 / 分桶）。
 *
 * 围栏（设计 §4）：整条路由走**加固档** `isLoopbackRequestStrict`；`/config` 按**动作**豁免——
 * 只有 `enabled` 免同源证明（禁用后设置卡片是唯一的恢复入口）。**`/query` 与 `/fields` 要同源证明**：
 * 它们虽然只读，却会**替请求方打到已配置的内网目标**并把结果带回来——跨站页面能借它读内网
 * （设计 §4.3 那句「再从配置侧加一个指向内网的 target，用读面打它」的「读面」正是这里）。
 * 插件禁用时四条路由里**只留 `/config`**（设置卡片靠它渲染，也是唯一的恢复入口）。
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
                if (sub !== '/config' && sub !== '/query' && sub !== '/fields' && sub !== '/facets') {
                    writeJson(res, 404, { error: '未知路由：' + sub });
                    return;
                }
                const config = state.read();
                if (req.method === 'GET') {
                    if (sub !== '/config') {
                        writeJson(res, 405, { error: '只支持 POST，收到 ' + String(req.method) });
                        return;
                    }
                    // 回显脱敏：地址里的 user:pass 永不回传浏览器（loglens 外部测评 issue #13 第 9 条）
                    writeJson(res, 200, { ok: true, config: publicConfig(config), plugins: { docker: state.dockerLoaded() } });
                    return;
                }
                if (req.method !== 'POST') {
                    writeJson(res, 405, { error: '只支持 GET / POST，收到 ' + String(req.method) });
                    return;
                }
                if (!config.enabled && sub !== '/config') {
                    writeJson(res, 403, { error: '插件已禁用（设置 → 插件配置 → 日志查询 → 启用插件）' });
                    return;
                }
                if (sub === '/query' || sub === '/fields' || sub === '/facets') {
                    // 只读但会替请求方打到内网目标：要同源证明（见函数头）
                    if (!hasSameOriginProof(req)) {
                        writeJson(res, 403, { error: '缺少同源证明（' + originProofHint(req) + '）' });
                        return;
                    }
                    const payload = await readJsonBody(req);
                    if (payload === undefined) {
                        writeJson(res, 400, { error: '请求体不是合法的 JSON 对象' });
                        return;
                    }
                    try {
                        const outcome = sub === '/query'
                            ? await state.runQuery(payload)
                            : sub === '/fields' ? await state.runFields(payload) : await state.runFacets(payload);
                        // 只有 /query 带能力自述：面板拿它决定画不画「时间分布」（见 capabilitiesOf 的注释）。
                        const caps = sub === '/query' ? capabilitiesOf(state, outcome) : undefined;
                        writeJson(res, 200, { ok: true, ...outcome, ...(caps === undefined ? {} : { capabilities: caps }) });
                    }
                    catch (error) {
                        // 校验失败与后端报错都回 400 + 原话（面板要把「下一步怎么做」显示出来）
                        writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
                    }
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
                writeJson(res, 200, { ok: true, config: publicConfig(next), plugins: { docker: state.dockerLoaded() }, ...(warning === undefined ? {} : { warning }) });
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
                // 注册面（零来源只放 sources / 无聚合来源跳过 facets）跟着配置走：清单变了就重建一次。
                // refreshTools 还是 noop 的窗口（tools 服务尚未注入）里这次重建自然落空，下一次 write 会补上。
                refreshTools();
            }), 'dsh-loglens: settings sync');
        }
        /** 落盘并把内存那一份换掉；没有 settings 服务时如实回报「只在本次进程内有效」。 */
        async function persist(next) {
            live = next;
            // 启用 / 停用的热生效：工具与档位闸跟着走（禁用时一个工具都不注册）
            refreshTools();
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
        /*
         * agent 工具（P3）：只在插件启用时注册，禁用热生效时随 effect 一起撤下。工具读配置走闭包里的
         * live，所以改来源清单不必重注册；只有 enabled 翻转才需要 rebuild（persist 会调 refreshTools）。
         * 档位闸与工具**同生命周期**（方案见 docs/permission-tier-plan.md 的 loglens 表）。
         */
        let refreshTools = () => { };
        ctx.inject(['tools'], (toolsCtx) => {
            toolsCtx.effect(() => {
                let dispose;
                const rebuild = () => {
                    if (dispose !== undefined) {
                        try {
                            dispose();
                        }
                        catch {
                            /* 工具已注销 */
                        }
                        dispose = undefined;
                    }
                    if (!live.enabled)
                        return;
                    const tools = toolsCtx.tools;
                    const disposers = [];
                    const failures = [];
                    registerLoglensTools({
                        config: () => live,
                        backendFor,
                        dockerLoaded: () => dockerPluginLoaded(ctx),
                        // 注册面收窄（渐进披露 T2/T7）：零来源只放 sources；没有任何可聚合来源时跳过 facets
                        include: includeFor(live),
                        add: (name, definition) => {
                            try {
                                disposers.push(tools.register(definition));
                            }
                            catch (error) {
                                failures.push(name + '：' + (error instanceof Error ? error.message : String(error)));
                            }
                        },
                    });
                    disposers.push(attachTierGate(ctx, {
                        pkg: 'loglens',
                        prefixes: LOGLENS_TIER_PREFIXES,
                        classify: (tool) => LOGLENS_TIER_CLASS[tool],
                    }));
                    if (failures.length > 0) {
                        console.warn('[dsh-loglens] ' + String(failures.length) + ' 个 agent 工具注册失败：' + failures.join('；'));
                    }
                    dispose = () => {
                        for (const item of disposers) {
                            try {
                                item();
                            }
                            catch {
                                /* 释放失败不阻塞 */
                            }
                        }
                    };
                };
                rebuild();
                refreshTools = rebuild;
                return () => {
                    refreshTools = () => { };
                    if (dispose !== undefined) {
                        try {
                            dispose();
                        }
                        catch {
                            /* 释放失败不阻塞 */
                        }
                    }
                };
            }, 'dsh-loglens: tools');
        });
        ctx.inject(['webServer'], (webCtx) => {
            webCtx.effect(() => {
                const server = webCtx.webServer;
                const executeDeps = { config: () => live, backendFor };
                const disposers = makeRoutes({
                    read: () => live,
                    write: persist,
                    runQuery: (input) => runSearch(executeDeps, input),
                    runFields: (input) => runFields(executeDeps, input),
                    runFacets: (input) => runFacets(executeDeps, input),
                    dockerLoaded: () => dockerPluginLoaded(ctx),
                    backendFor,
                }).map((route) => server.register(route));
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
        /*
         * 面向模型的公告（渐进披露 T5）：具名 section `plugin:dsh-loglens`（order 151），文本见
         * LOGLENS_GUIDANCE。开关复用 announce——它的语义从「启动日志」升级为「面向模型的公告」：
         * 关掉它等于本插件不向任何一面自报家门（下面那条启动日志与这段 section 一起静音）。
         * 两者都是挂载期定档（与 env / mcp 的公告同款）：announce / enabled 运行期翻转不撤下 section，
         * 工具面由 refreshTools 跟着 enabled 走；要 section 也跟热翻转得搬进 refresh，先不做。
         */
        if (config.announce !== false) {
            ctx.inject(['systemPrompt'], (promptCtx) => {
                promptCtx.effect(() => {
                    const systemPrompt = promptCtx.systemPrompt;
                    return registerLiteralSection(systemPrompt, { name: 'plugin:dsh-loglens', order: 151, text: LOGLENS_GUIDANCE });
                }, 'dsh-loglens: announcement');
            });
        }
        if (config.announce !== false) {
            // 这句要跟得上能力：原先写的是「查询能力尚未实现」——查询区、四条路由与 agent 工具早就有了。
            // 宿主日志是排查时第一眼看的东西，说少了同样误导（2026-10-13 真机验收时在启动日志里看到它）。
            console.log('[dsh-loglens] mounted（来源 ' + String(live.targets.length) + ' / ' + String(MAX_TARGETS)
                + '，路由 config / query / fields / facets，agent 工具 loglens_*）');
        }
    },
});
export const { name, inject, apply } = plugin;
//# sourceMappingURL=index.js.map