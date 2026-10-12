/**
 * @hyzyn/dsh-loglens — 宿主半体。
 *
 * 落地范围：`/api/dsh-loglens/{config,query,fields,facets}` 四条子路由（一个 prefix 路由内部分发）
 * ——设置卡片增删改「日志来源」（Loki / Elasticsearch / OpenSearch / Docker）、查日志、列字段、
 * 按字段分组 / 按时间分桶。查询能力的实现与判据全在 src/execute.ts，**与 agent 工具共用同一份**
 * （见本包的 docs/design.md）；本文件只管路由、围栏与「能力自述」的接线。
 *
 * 档位（维护者 2026-10-11 拍板）：进**加固档** isLoopbackRequestStrict；/config 按
 * **动作**豁免——enabled 不要同源证明（插件禁用后设置卡片是唯一的恢复入口），targets
 * 的增 / 删 / 改要 hasSameOriginProof。理由：跨站页面能从配置侧加一个指向内网的
 * target，再用本插件的读面打它，围栏就被绕穿了。这处不对称同步记在 docs/architecture.md
 * 的「一条请求经过什么」那节。
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { ReqLike, ResLike } from '@hyzyn/dsh-kit';
import type { LoglensConfig, SourceKind } from './config.js';
import type { LogBackend } from './backends/types.js';
/** 本插件的路由前缀（一个 prefix 路由内部按子路径分发，与 docker / tty 同款）。 */
export declare const ROUTE_PREFIX = "/api/dsh-loglens";
/** 配置面能做的动作白名单：不认识的动作一律 400，绝不「照单全收」后静默丢掉。 */
export declare const CONFIG_ACTIONS: readonly string[];
/** 配置形状（apply 的入参；volatile 字段经 schema 解析后是取值的冻结引用）。 */
export interface Config {
    enabled?: boolean;
    announce?: boolean;
    targets?: unknown[];
}
/**
 * 运行时 Config schema——DSH ≥0.1.7 起它同时就是本插件的 settings 存储。
 *
 * 全部字段标 volatile：它们是卡片可改项，而 settings.update(entryId, patch) 只接受
 * volatile 路径；loader 对 volatile-only 变更原地更新配置引用并发 loader 的配置变更
 * 事件，**不重挂插件**，插件订阅后自己重读（见 kit 的 settings 适配层）。
 */
export declare const Config: z;
/** 一条路由：本插件只注册一个 prefix 路由，内部按子路径分发。 */
interface Route {
    kind: 'prefix';
    path: string;
    handler: (req: ReqLike & AsyncIterable<Uint8Array>, res: ResLike) => void | Promise<void>;
}
/**
 * 构造 /config 的读写路由。
 *
 * read 取当前生效配置、write 落盘（并更新内存里的那一份）。两者都由 apply 注入，
 * 于是路由本身没有状态，用例可以直接喂假实现——回环围栏 / 动作白名单 / 同源证明
 * 三条判据都能在不起宿主的前提下验（见 test/loglens.test.ts）。
 */
/** 面板那三条路由要用到的状态：读配置、落盘、执行一次查询 / 列字段（都由 apply 注入）。 */
export interface RouteState {
    read: () => LoglensConfig;
    write: (next: LoglensConfig) => Promise<string | undefined>;
    /** 执行一次查询（面板那条路）：与 agent 工具共用 src/execute.ts，不另写一份判据。 */
    runQuery: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    /** 列字段（面板的「有哪些字段」）。 */
    runFields: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    /**
     * 聚合（按字段分组 / 按时间分桶）。工具面是 `loglens_facets`；面板用它画「时间分布」直方图
     * （2026-10-12 接上，见 client-src 的 `loadHistogram`）——**同一份执行层**，不另写判据。
     */
    runFacets: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    /**
     * Docker 容器面板装没装（panel 用它决定给不给「容器日志」那半格）。
     * 判据是 cordis 的 plugin registry，见 src/plugins.ts——**不是** tools 服务（它没有列举 API）。
     */
    dockerLoaded: () => boolean;
    /**
     * kind → 适配器。**必须与执行层用的是同一个函数**（插件里传的就是 `executeDeps.backendFor`）：
     * 能力自述要描述**真正跑的那个后端**，否则面板会照着一个跟实际不一样的名单去画分布。
     */
    backendFor: (kind: SourceKind) => LogBackend | undefined;
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
export declare function makeRoutes(state: RouteState): Route[];
export declare const name: string, inject: string[] | undefined, apply: (ctx: Context, config?: Config | undefined) => void;
export {};
