/**
 * @hyzyn/dsh-loglens — 后端契约（P1 地基）。
 *
 * 这里只放**形状**，不放实现：适配器（Loki / ES / OpenSearch / Docker）各自实现 LogBackend，
 * 归一化与夹取在 src/query.ts，游标在 src/cursor.ts。契约正文与判据在 docs/design.md §3，
 * 别在这份文件里另写一份口径（复制即造第二份真相源）。
 */
import type { LoglensTarget } from '../config.js';
/** 查询方言：只用于**标注**，不做互译（LogQL 与 Lucene 不可互译，设计 §1 非目标）。 */
export type QueryLanguage = 'logql' | 'lucene' | 'ppl' | 'none';
/** 分页形态。'none' = 只回「命中可能不完整，请缩小时间窗」，不给会丢行的游标。 */
export type PaginationKind = 'cursor' | 'offset' | 'none';
/** 字段来源：索引里的 / 探测出来的 / 固定的（Docker 是这一档）。 */
export type FieldKind = 'indexed' | 'discovered' | 'fixed';
/** 排序方向：默认 backward（新的在前，人看日志的顺序）。 */
export type Direction = 'forward' | 'backward';
/** 一个后端 / 来源的自述能力。适配器声明什么，本层就按什么夹取——两处各夹一遍必然漂。 */
export interface BackendCaps {
    queryLanguage: QueryLanguage;
    /** 方言分流用（ES 8.11+ 的 ES|QL、OpenSearch 的 PPL 等），没有就是 undefined。 */
    flavor?: string;
    follow: boolean;
    aggregations: boolean;
    requiresTimeRange: boolean;
    fields: FieldKind;
    pagination: PaginationKind;
    maxPageSize: number;
    maxWindowMs: number;
}
/** 归一化后的查询：时间**统一 epoch 毫秒**，cursor 是后端私有编码（本层只透传）。 */
export interface NormalizedQuery {
    targetId: string;
    q: string;
    from: number;
    to: number;
    limit: number;
    direction: Direction;
    cursor?: string;
    filters?: Record<string, string>;
}
/**
 * 一行日志。`source` + `ts` 必须**可重查**——三个后端都没有原生的「某行前后 N 行」，
 * `loglens_context` 只能靠这两项回到源头再取一遍（设计 §3.1）。
 */
export interface LogLine {
    ts: number;
    /** 级别。**归一化过**（trace / debug / info / warn / error / fatal），见 src/line.ts。 */
    level?: string;
    /**
     * true = 这个级别是**从正文推断**的（文档 / 流标签里没有级别字段）。
     *
     * 为什么单列一位：level 是筛选项，而「文档说它是 error」与「我从正文看着像 error」是两种可信度。
     * 契约不许把后者写成前者——与 LogCounts.totalKnown 同一口径。
     */
    levelInferred?: boolean;
    message: string;
    /**
     * `message` 里**命中了查询串**的那几段（字符区间 `[start, end)`，按 start 升序、互不重叠）。
     *
     * 为什么由后端给而不是界面自己拿查询串去匹配：查询串是 Lucene，`stream:stderr` 里没有半个
     * 字出现在正文、`-failed` 是**排除**（命中的是「没有」）、`error*` / `~` / 短语的匹配规则
     * 也各不相同。前端照字面去标，标出来的位置有一半是错的——而**标错比不标更坏**：
     * 用户会以为那是引擎认出来的命中。
     *
     * 只有**后端明确报出**高亮时才带这个字段（ES 的 `highlight`）。拿不到就不带——
     * 界面据此不画高亮，而不是退回去自己猜。
     */
    highlights?: Array<[number, number]>;
    source: string;
    labels: Record<string, string>;
    raw: string;
    id: string;
}
/** 计数：语义不同的量不许挤进一个 number（设计 §3.2）。 */
export interface LogCounts {
    returned: number;
    /** 命中总数；`totalKnown` 为假时它只是**下界**。 */
    matched?: number;
    /** docker grep：宿主侧实际扫过的行数。 */
    scannedRows?: number;
    /** Loki stats：processedBytes 一类。 */
    scannedBytes?: number;
    totalKnown: boolean;
}
/** 截断理由。`cursor_expired` 与 `hit_limit` 刻意分开：过期≠还有更多，处置也不同。 */
export type TruncationReason = 'hit_limit' | 'hit_limit_maybe' | 'max_result_window' | 'partial_shards' | 'timed_out' | 'scan_cap' | 'byte_cap' | 'cursor_expired';
export interface Truncation {
    truncated: boolean;
    reasons: TruncationReason[];
}
export interface LogQueryResult {
    lines: LogLine[];
    counts: LogCounts;
    truncation: Truncation;
    nextCursor?: string;
    /**
     * 适配器自己要说的话（**宿主原文优先**，别在这里编文案）。
     *
     * 为什么要有这条通道（2026-10-18 真机抓到）：ES 对**分片级**错误回 `HTTP 200`，把原因放在
     * `_shards.failures[].reason` 里。上一版只读了 `_shards.failed` 的数量、把它记成
     * `partial_shards`，于是 `level:(ERROR`（少一个右括号）在界面上变成
     * 「已截断：部分分片失败」+ 0 条——用户会去怀疑索引和集群，而真正的原因是他自己写错了查询串。
     *
     * 判据与值下拉那条一致：**取不到就把宿主原话摆出来**，别让一句笼统的分类词替它说话。
     */
    warnings?: string[];
}
export interface FieldInfo {
    name: string;
    kind: FieldKind;
    label?: string;
    /** 这个字段是不是「常用筛选项」（优先键名单里的，排在前面）。 */
    preferred?: boolean;
    /**
     * **多类型才有**：同名在不同索引里出现过的原生 ES 类型（对应 Kibana `FieldDescriptor.esTypes`）。
     * 只有一个类型时不带它——那时候 `kind` 已经说完了，带上只是把载荷撑大。
     */
    esTypes?: string[];
    /**
     * **多类型且落到不同宽类型族时才有**：这个字段在不同索引里类型不一致（Kibana 的 `type: 'conflict'`）。
     * 拿它分组 / 筛值可能只覆盖一部分索引，调用方必须看得见这一点（真机实例：某字段在部分索引是 `date`、
     * 部分是 `text`）。
     */
    conflict?: boolean;
    /** 冲突时：每个原生类型各出现在哪些索引里（对应 Kibana `FieldDescriptor.conflictDescriptions`）。 */
    conflictDescriptions?: Record<string, string[]>;
}
/**
 * 列字段的结果。**为什么不是裸数组**（2026-10-11 真机反馈第 4 条）：agent 拿到的是一份
 * 被上限截断的清单，而它无从知道「还有多少没列出来」——于是把 45KB 的字段表当成了全部。
 * 截断信号必须跟着结果走（与行的 hit_limit 同一口径）。
 */
export interface FieldsResult {
    fields: FieldInfo[];
    /** 来源里一共有多少个字段（截断前）。 */
    total: number;
    /** true = fields 被上限截断了，还有 total - fields.length 个没列。 */
    truncated: boolean;
}
/** 列字段的选项：**不传 limit = 不截断**（来源有多少字段列多少，与 Kibana 的 `_field_caps` 同口径）；给了就只列前 limit 个。 */
export interface FieldsOptions {
    limit?: number;
}
/**
 * 聚合（facets）请求：**按字段分组**（terms）与**按时间分桶**（date_histogram）二选一或都要。
 *
 * 为什么要有它（2026-10-11 真机反馈第 2 条）：agent 真正要回答的是「考试服务健不健康」，
 * 靠的是「哪个 container 在报错、错误随时间的分布」——只有 terms / date_histogram 能给，
 * 而这两件事只有后端能做（拉一页行到本地数，等于把 1 万条日志读一遍，还是错的）。
 */
export interface FacetsSpec {
    /** 按这个字段分组（terms）。字段写法与 filters 一致，.keyword 由适配器自己决定。 */
    by?: string;
    /** 时间分桶的间隔（如 '5m' / '1h'；date_histogram 的 fixed_interval）。 */
    interval?: string;
    /** 桶数上限（terms 的 size；默认 10，硬上限 100）。 */
    size?: number;
}
export interface FacetBucket {
    key: string;
    count: number;
}
export interface FacetsResult {
    /**
     * **仅供执行层判读，绝不进返回值**（loglens D07）：这个窗口里一共有多少条日志。
     *
     * 为什么需要它：0 桶有两种完全不同的成因——「字段一条有值的都没有（空壳）」与「这段时间压根没日志」，
     * 而区分它们的**唯一**判据就是「窗口内命中数」；没有这个数，facets 只能把 0 桶原样回报、把判断
     * 全推给调用方去试错。执行层拿它换算成 warnings 的措辞（见 runFacets），**不作为结果字段外传**：
     * facets 的输出 schema 是 `additionalProperties: false`（src/tools.ts），多一个键就是一次崩溃。
     *
     * 适配器**拿不到就不带**（不知道就不写，别拿 0 冒充「没有数据」——与 BackendHealth.recent 同口径）；
     * 给了就是给，近似值由 relation 决定，如实报（精确计数与「宿主给的默认上界」都能到这儿，
     * 所以 `basis` 要跟着值走，别替它打包票）。
     */
    totalHits?: {
        value: number;
        relation: 'eq' | 'gte';
        basis: 'exact' | 'lower_bound';
    };
    /** 按字段分组的桶（by 有值才有），按 count 降序。 */
    buckets?: FacetBucket[];
    /** 时间分桶（interval 有值才有），按时间升序。 */
    overTime?: Array<{
        ts: number;
        count: number;
    }>;
    /** 没列出来的桶里还有多少条（terms 的 sum_other_doc_count）：**这是截断信号，必须回**。 */
    otherCount?: number;
    /** count 的误差上界（terms 的 doc_count_error_upper_bound；>0 说明桶计数是近似值）。 */
    countErrorUpperBound?: number;
}
export interface BackendHealth {
    ok: boolean;
    detail?: string;
    /**
     * 探测窗口内大概有多少条（真机反馈第 3 条：probe 只看存活不看数据，等于没说它能查什么）。
     * 探测**失败或来源给不出**时留空——不知道就不写，别拿 0 冒充「没有数据」。
     */
    recent?: {
        windowMs: number;
        count: number;
    };
}
/** 一个日志后端。`target` 是来源清单里的那一条（地址只存在宿主侧，浏览器永不传 URL）。 */
export interface LogBackend {
    id: string;
    capabilities(): BackendCaps;
    /**
     * 这条来源覆盖的**范围**（人话，工具面回显）。
     *
     * ES / OpenSearch 回索引表达式（它可能来自配置、也可能来自地址路径或默认通配——正是那条
     * 「路径即索引」的暗号），Loki 这类没有隐式范围的来源不实现它。见真机反馈第 3 条。
     */
    scope?(target: LoglensTarget): string;
    fields(target: LoglensTarget, options?: FieldsOptions): Promise<FieldsResult>;
    query(query: NormalizedQuery, target: LoglensTarget): Promise<LogQueryResult>;
    /**
     * 聚合：按字段分组 / 按时间分桶。**没有实现的适配器不要声明它**（调用方按能力给指路文案，
     * 而不是给一个永远报错的入口）。
     */
    facets?(query: NormalizedQuery, target: LoglensTarget, spec: FacetsSpec): Promise<FacetsResult>;
    /** 跟随（长流）。Loki 是 WebSocket，ES 是 _search + 轮询——由适配器各自实现。 */
    stream?(query: NormalizedQuery, target: LoglensTarget, onLine: (line: LogLine) => void): Promise<() => void>;
    health(target: LoglensTarget): Promise<BackendHealth>;
}
