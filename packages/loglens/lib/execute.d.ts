/**
 * @hyzyn/dsh-loglens — 查询执行层（agent 工具与浏览器面板**共用**的那一段）。
 *
 * 为什么单独一层：同一份查询要从两条入口发起——agent 工具（`loglens_search`）与面板的
 * `POST /api/dsh-loglens/query`。两处各写一遍「怎么找来源 / 怎么夹取 / 怎么拼返回形状」就是两份
 * 会漂的真相源；这一层是唯一实现，工具与路由各自只加一层自己的东西（工具加渲染、路由加围栏）。
 */
import type { LoglensConfig, LoglensTarget, SourceKind } from './config.js';
import type { BackendCaps, LogBackend, LogCounts, LogLine, Truncation } from './backends/types.js';
import type { CanonicalLevel } from './line.js';
export interface ExecuteDeps {
    /** 当前生效的配置（宿主侧那一份，volatile 更新后跟着变）。 */
    config: () => LoglensConfig;
    backendFor: (kind: SourceKind) => LogBackend | undefined;
}
/** 没有适配器时的指路文案：说清「怎么绕」，而不是一句「不支持」。 */
export declare function adapterHint(kind: SourceKind): string;
/** 按 id 或名称找来源；省略时只在「恰好一个来源」时回落。 */
export declare function resolveTarget(config: LoglensConfig, wanted: unknown): {
    ok: true;
    target: LoglensTarget;
} | {
    ok: false;
    error: string;
};
/** 目标的自述（工具返回值与路由响应里统一用这一形状）。 */
export declare function describeTarget(target: LoglensTarget): {
    id: string;
    kind: string;
    label: string;
};
/**
 * 一条来源的指路文案（P5 的 agent 侧交付物，P6 的面板也照用）。
 *
 * 三条都不是「说明文」，是**会出现在返回值里的判据**：
 *   - docker：选项 0 的替代路径（现成的 docker_logs / docker_logs_grep），本插件不包一层；
 *   - 声明了 pagination:'none' 的来源：被 limit 截断时只会报 hit_limit，得缩小时间窗
 *     （**当前没有来源走这条**——Loki 已在 2026-10-12 真机验收后翻成 'cursor'）；
 *   - ES / OpenSearch：分页走 PIT，游标有寿命，过期后要重新发起带时间窗的查询。
 *
 * **刻意不做**「探测 docker 插件在不在」：设计 §5 的「装了没装」判据是给**面板**用的（浏览器侧 registry
 * 存在性 + health），而宿主侧的工具注册表**没有公开的列举 API**（实测 @deepseek-ai/dsh-tools 0.1.2-rc.1
 * 的 ctx.tools 只有 register / restrict / guard）——猜一个私有字段去读，比不读更糟。
 */
export interface HintOptions {
    /** Docker 容器面板（@hyzyn/dsh-docker）装没装：判据见 src/plugins.ts（cordis 的 plugin registry）。 */
    dockerLoaded?: boolean;
}
export declare function hintFor(kind: SourceKind, caps: BackendCaps | undefined, options?: HintOptions): string | undefined;
/**
 * 一次查询的结果形状（工具与路由共用；路由直接把它序列化成 JSON）。
 *
 * 刻意写成 **type alias 而不是 interface**：接口没有隐式索引签名，赋给 Record<string, unknown>
 * （路由那边的签名）会被 TS 拒掉——这是本仓已经踩过一次的坑。
 */
export type SearchOutcome = {
    target: {
        id: string;
        kind: string;
        label: string;
    };
    window: {
        from: number;
        to: number;
    };
    returned: number;
    counts: LogCounts;
    truncation: Truncation;
    lines: LogLine[];
    nextCursor?: string;
    warnings: string[];
    hint?: string;
    /** 生效的 level 过滤（只回显，便于调用方知道这一页被筛过；语义见 runSearch 的注释）。 */
    level?: string;
};
/**
 * level 参数：归一化成 CanonicalLevel；认不出来就报错（**不猜**）。
 *
 * 语义是「**及以上**」：level=warn 得到 warn + error + fatal（日志查看器的通行口径）。
 * 行上没有级别**不算命中**——不能把「不知道」当成「是 error」。
 */
export declare function readLevel(value: unknown): {
    ok: true;
    level?: CanonicalLevel;
} | {
    ok: false;
    error: string;
};
/** 查一次（抛错即失败，调用方把 message 回给对面：工具抛出去、路由回 400）。 */
export declare function runSearch(deps: ExecuteDeps, input: Record<string, unknown>): Promise<SearchOutcome>;
/** 桶数上限（工具面默认 10、硬上限 100）——与适配器那边各有一份默认值，硬上限取小的那个。 */
export declare const FACETS_DEFAULT_SIZE = 10;
export declare const FACETS_MAX_SIZE = 100;
/** 没有聚合适配器时的指路文案（说清「怎么绕」，不是一句「不支持」）。 */
export declare function facetsHint(kind: SourceKind): string;
/** 聚合的结果形状（type alias，理由同 SearchOutcome）。 */
export type FacetsOutcome = {
    target: {
        id: string;
        kind: string;
        label: string;
    };
    window: {
        from: number;
        to: number;
    };
    by?: string;
    interval?: string;
    buckets?: Array<{
        key: string;
        count: number;
    }>;
    overTime?: Array<{
        ts: number;
        count: number;
    }>;
    /** 没列出来的桶里还有多少条（terms 的 sum_other_doc_count）：**截断信号**。 */
    otherCount?: number;
    /** 桶计数的误差上界（terms 的近似性）：>0 时桶里的数字是近似值。 */
    countErrorUpperBound?: number;
    warnings: string[];
    hint?: string;
};
export declare function runFacets(deps: ExecuteDeps, input: Record<string, unknown>): Promise<FacetsOutcome>;
/** 列字段的结果形状（同样用 type alias，理由见上）。截断信号跟着结果走（真机反馈第 4 条）。 */
export type FieldsOutcome = {
    target: {
        id: string;
        kind: string;
        label: string;
    };
    fields: Array<{
        name: string;
        kind: string;
        label?: string;
        preferred?: boolean;
    }>;
    /** 来源里一共有多少字段（截断前）。 */
    total: number;
    truncated: boolean;
    warnings: string[];
};
/**
 * 字段的默认上限（渐进披露 T1，2026-10-24）。
 *
 * 上一版口径是「不传 limit = 全列」（2026-10-14 对齐 Kibana）——真机上一台通配全集群的来源
 * 确实回过 45KB 的字段表，那次的问题（**看不出被截断**）由 total / truncated 解决了，但
 * 「不传就全量」仍把决定权默认交给了最坏情况：agent 只想确认某几个字段在不在，却吃下
 * 几十 KB。现在默认收在 200：超出时 truncated: true + total 照报全量，warning 给下一步
 * （分段传 limit / 先用 facets 看哪些字段真有数据）；显式传了 limit 仍按调用方说的算。
 */
export declare const FIELDS_DEFAULT_LIMIT = 200;
/**
 * 列字段的**长度处理**（2026-10-24 起默认截到 {@link FIELDS_DEFAULT_LIMIT}）。
 *
 * 历史：原来「默认 80 + 硬上限 200」→ 2026-10-14 改「不传 limit 就全列」（对齐 Kibana 的
 * `_field_caps` 从不 slice）→ 现在改回「默认 200、无硬顶」。两刀的方向相反，但理由同源：
 * **截断必须看得见**（total / truncated / warning 都在），差别只在「默认替调用方挡多少」。
 * 全列的代价（45KB 那份）实测由 agent 侧承担，所以默认值替它挡；面板那一侧有「共 N 个字段」
 * 与搜索框，收到 200 仍是可用的清单。
 */
export declare function runFields(deps: ExecuteDeps, input: Record<string, unknown>): Promise<FieldsOutcome>;
