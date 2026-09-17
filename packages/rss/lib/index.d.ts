import type { Context } from '@deepseek-ai/cordis';
import { type CatalogSource } from './catalog.js';
export declare const name = "rss-digest";
export declare const inject: string[];
export interface Source {
    /** 订阅源显示名，例如「阮一峰的网络日志」。 */
    name: string;
    /** RSS / Atom 地址。 */
    url: string;
    /** 可选分类，会显示在 digest 条目里。 */
    category?: string;
    /** 该源最多取多少条，默认取 Config.maxItemsPerSource。 */
    limit?: number;
    /** 内置渠道 key；存在时以内置渠道库的配置为准（分类可用 store 里的覆盖）。 */
    builtin?: string;
}
/** 内置渠道：经过验证的订阅地址 + 官网 + 默认分类。 */
export interface BuiltinChannel {
    key: string;
    name: string;
    url: string;
    category: string;
    site?: string;
    note?: string;
}
export interface FeedItem {
    id: string;
    title: string;
    link: string;
    summary?: string;
    /** AI 生成的一句话中文摘要；未启用 / 失败 / 超出上限的条目不出现。 */
    aiSummary?: string;
    /** ISO 8601 字符串，可能为空。 */
    date?: string;
    source: string;
    category?: string;
}
export interface DigestSourceMeta {
    name: string;
    url: string;
    category?: string;
    /** 来源官网地址（从 feed 头部解析，失败时退回 feed URL 的 origin）。 */
    site?: string;
}
/** 本次 AI 摘要的执行情况，供 Markdown / latest.json / 客户端展示。 */
export interface AiSummaryInfo {
    /** 本次是否启用了 AI 摘要。 */
    enabled: boolean;
    /** 实际使用的模型路由，形如 provider/model。 */
    route?: string;
    /** 成功拿到摘要的条数（含缓存命中）。 */
    summarized: number;
    /** 失败并回落到原文摘要的条数。 */
    failed: number;
    /** 整体不可用（路由 / llm 服务缺失）或全部失败时的原因文案。 */
    reason?: string;
    /**
     * 失败原因分布（按出现次数降序，最多 `AI_FAILURE_REASON_LIMIT` 类）。
     *
     * 为什么要有它：原先部分失败只留一个计数（「N 条失败，已回落到原文摘要」），
     * 既看不出是超时、限流还是 provider 报错，也没法判断是不是插件自己的问题 ——
     * 实测「20 条里 6 条成功」这种情况只能靠猜。
     */
    failures?: Array<{
        error: string;
        count: number;
    }>;
}
export interface DigestResult {
    date: string;
    file: string;
    items: FeedItem[];
    errors: Array<{
        source: string;
        error: string;
    }>;
    generatedAt: string;
    /** 参与本次抓取的订阅源元信息（含官网地址），供 Web GUI「查看更多」使用。 */
    sources?: DigestSourceMeta[];
    /** 本次 AI 摘要的执行情况；store 里未启用 ai 时不出现。 */
    aiSummary?: AiSummaryInfo;
}
export interface Config {
    /** composition 层开关：false 时插件不挂载（重启保持）。运行期开关在设置卡片（写 store，热生效）。默认开。 */
    enabled?: boolean;
    /** 是否向 agent 注入插件能力与当天 digest 公告。默认开。 */
    announceToAgent?: boolean;
    /** 是否提供精选订阅源目录（/api/dsh-rss/catalog，供 GUI 浏览搜索添加）。默认开。 */
    includeCatalog?: boolean;
    /** 附加的 OPML 目录来源（可选多个），与内置 awesome-rsshub-routes 目录合并展示。 */
    catalogs?: CatalogSource[];
    /** 订阅源列表；不传时使用内置默认源。 */
    sources?: Source[];
    /** 可选的新闻分类列表，用于 UI 里维护分类。 */
    categories?: string[];
    /** 每个源最多取多少条。默认 5。 */
    maxItemsPerSource?: number;
    /** 每天 digest 最多汇总多少条。默认 30。 */
    maxTotalItems?: number;
    /** 每天自动生成时间（HH:mm，24 小时制）。默认 "08:00"。 */
    dailyTime?: string;
    /** 启动时若当天 digest 不存在是否自动生成。默认开。 */
    autoGenerateOnMount?: boolean;
    /** 自定义 digest 输出目录。默认 ~/.dsh/rss-digest。 */
    digestDir?: string;
    /** 单次请求超时毫秒数。默认 10000。 */
    requestTimeoutMs?: number;
    /** 抓取时使用的 User-Agent。 */
    userAgent?: string;
}
/**
 * AI 摘要配置（只走可编辑 store ~/.dsh/rss.json 的 ai 字段，Config 层不新增字段）。
 * provider / model 必须成对出现：都留空则跟随宿主默认模型。
 */
export interface AiStoreConfig {
    /** 是否启用 AI 摘要；默认 false。 */
    enabled: boolean;
    /** 模型路由 provider；与 model 成对。 */
    provider?: string;
    /** 模型路由 model；与 provider 成对。 */
    model?: string;
    /** 单次 digest 最多摘要条数，默认 20，夹紧 1..50。 */
    maxItems?: number;
    /** 并发请求数，默认 3，夹紧 1..6。 */
    concurrency?: number;
    /** 单条请求超时毫秒数，默认 20000，夹紧 5000..60000。 */
    timeoutMs?: number;
}
/** 解析后的模型路由。 */
export interface AiRoute {
    provider: string;
    model: string;
}
/**
 * 宿主 llm 服务流式输出块：只声明本插件用到的字段，其余块忽略。
 * text-delta 携带正文增量；finish 的 kind 为 stop 之外（error / aborted /
 * max-tokens / tool-calls）都按失败处理。
 */
/**
 * 宿主 llm 流的一个块。
 *
 * ⚠️ **finish 块的权威形状是 `{ type:'finish', reason: FinishReason }`**，而 `FinishReason`
 * 是**以 `kind` 为判别式**的联合（`{kind:'stop'}` / `{kind:'tool-calls'}` /
 * `{kind:'max-tokens'}` / `{kind:'aborted'}` / `{kind:'error', failure}`）——
 * 也就是 **`kind` 与 `failure` 都在 `reason` 里面，不在块的顶层**（见 dsh-llm 的
 * `lib/types/types.d.ts`：`type: 'finish'; reason: FinishReason`）。
 *
 * 这里曾经把 `kind` / `failure` 声明在顶层，于是读取处永远拿到 `undefined`、
 * 把**每一次成功**都判成「终止原因 unknown」，AI 摘要 100% 失败；而单测的假 llm 又
 * 照着同一个错误形状造数据，所以测试一路全绿。真机上的 digest 里那句
 * 「AI 摘要：全部 20 条失败：终止原因 unknown」就是这么来的。
 */
export interface LlmStreamChunk {
    type?: string;
    text?: string;
    /** finish 块的权威字段：判别式 `kind`（以及 `kind==='error'` 时的 `failure`）都在这里。 */
    reason?: {
        kind?: string;
        failure?: {
            message?: string;
            code?: string;
        };
    };
    [key: string]: unknown;
}
/**
 * 宿主 llm 服务的最小结构（cordis Context 上的 llm 服务）。
 *
 * ⚠️ `messages[].content` 是 **`ContentBlock[]`**（`{ type:'text', text }` 这类块的数组），
 * 不是字符串 —— 见 dsh-llm 的 `lib/types/types.d.ts`：`UserMessage.content: ContentBlock[]`。
 * 这里曾经声明成 `string`，于是传进去的字符串会在下游 `contentHasImage(content)` 之类
 * 对 `content` 调用 `.some(...)` 的地方炸成
 * `content.some is not a function`（表现为 AI 摘要每条都失败）。
 */
export interface LlmRuntimeLike {
    stream(options: {
        provider: string;
        model: string;
        system?: string;
        messages: Array<{
            role: 'user';
            content: Array<{
                type: 'text';
                text: string;
            }>;
        }>;
        maxTokens?: number;
        temperature?: number;
        signal?: AbortSignal;
    }): AsyncIterable<LlmStreamChunk>;
}
export declare function digestDir(config?: Config): string;
/** 可编辑 store（~/.dsh/rss.json）的形状；GET/POST /config 交换的就是它。 */
export interface RssStore {
    /** 插件启用开关（设置卡片可改，写回 store；关闭即热生效）。默认开。 */
    enabled?: boolean;
    sources: Source[];
    categories: string[];
    catalogs: CatalogSource[];
    maxItemsPerSource?: number;
    maxTotalItems?: number;
    dailyTime?: string;
    autoGenerateOnMount?: boolean;
    announceToAgent?: boolean;
    /** AI 摘要配置；缺省表示未配置（默认关闭）。 */
    ai?: AiStoreConfig;
    updatedAt?: string;
}
/**
 * 归一化 store 里的 ai 配置：provider / model 必须成对出现（都空 = 跟随宿主默认
 * 模型），只填一个则整体忽略并给出告警；maxItems / concurrency / timeoutMs 缺省
 * 填默认值、越界夹紧。readRssStore 与 validateRssStoreInput 共用，保证两条读路径一致。
 */
export declare function sanitizeAiConfig(raw: unknown): {
    ai?: AiStoreConfig;
    warning?: string;
};
export declare function readRssStore(config?: Config): RssStore;
export declare function writeRssStore(store: RssStore): void;
/**
 * 校验卡片提交的 store 输入（白名单）：返回归一化后的 RssStore 与告警列表。
 * error 会拒绝保存；warnings 不影响保存（例如 ai 不成对被整体忽略），仅回传说明。
 */
export declare function validateRssStoreInput(raw: unknown): {
    store?: RssStore;
    error?: string;
    warnings?: string[];
};
export declare function parseFeed(xml: string, baseUrl: string): FeedItem[];
/** ai-cache.json 里的单条缓存：text 为清洗后的摘要，at 为写入时间戳（毫秒）。 */
export interface AiCacheEntry {
    text: string;
    model: string;
    at: number;
}
/** AI 缓存文件路径：与 digest 同目录，随 digestDir 迁移。 */
export declare function aiCachePath(dir: string): string;
/** 缓存 key：与去重 key 同源（link || id || title，trim + 小写）的 sha1 十六进制。 */
export declare function aiCacheKey(item: Pick<FeedItem, 'link' | 'id' | 'title'>): string;
/** 缓存条目是否在 30 天有效期内（结构与时间戳一并校验）。 */
export declare function isAiCacheEntryFresh(entry: AiCacheEntry | undefined, now?: number): entry is AiCacheEntry;
/** 淘汰过期条目，并在超过上限时按 at 保留最新的 max 条（LRU 淘汰最旧）。 */
export declare function pruneAiCacheEntries(entries: Record<string, AiCacheEntry>, now?: number, max?: number): Record<string, AiCacheEntry>;
/** 读取 AI 缓存；文件缺失 / 损坏 / 版本不符时返回空表，过期条目顺手过滤。 */
export declare function readAiCache(dir: string, now?: number): Record<string, AiCacheEntry>;
/** 原子写回 AI 缓存（先淘汰过期 / 超限条目）。写失败由调用方兜底，不影响 digest 生成。 */
export declare function writeAiCache(dir: string, entries: Record<string, AiCacheEntry>, now?: number): void;
/** 构造单条摘要请求：system 为固定指令，user 用 JSON 框架（正文截断 1200 字）避免破坏结构。 */
export declare function buildAiSummaryMessages(item: FeedItem): {
    system: string;
    user: string;
};
/** 清洗模型输出：trim、去包裹引号、去 Markdown 加粗 / 列表前缀，换行压成空格；空串表示失败。 */
export declare function cleanAiSummary(raw: string): string;
/**
 * 解析模型路由：显式配置对 > 宿主默认模型（agentDefaultModel.source()，
 * 兼容 currentSelection()）> settings 服务的 agent-default-model 命名空间；
 * 全拿不到返回 null（本次生成跳过 AI 摘要）。
 */
export declare function resolveAiRoute(ctx: Context | undefined, ai?: AiStoreConfig): AiRoute | null;
/**
 * 调用宿主 llm 服务生成一条摘要。
 * 一次性调用模式：流式收集 text-delta，直到 finish；超时用 AbortController + setTimeout。
 * finish.kind 不是 stop（error / aborted / max-tokens / tool-calls）、缺终止块、
 * 输出清洗后为空都算失败。
 */
export declare function callAiSummary(llm: LlmRuntimeLike, route: AiRoute, item: FeedItem, timeoutMs: number): Promise<string>;
export declare function renderDigestMarkdown(items: FeedItem[], date: string, errors: DigestResult['errors'], sourceCount: number, aiSummary?: AiSummaryInfo): string;
/** generateDigest 的运行时依赖：宿主 Context（AI 摘要用它解析 llm / 默认模型服务）。 */
export interface DigestRuntime {
    ctx?: Context;
}
/**
 * 抓取所有订阅源并生成当天 digest。返回生成的摘要信息。
 * 即使部分源失败，也会把成功抓到的内容写成 digest。
 * store 启用 ai 时，在去重 / 排序 / 截断之后、渲染之前为条目补 AI 摘要。
 */
export declare function generateDigest(config?: Config, runtime?: DigestRuntime): Promise<DigestResult>;
/** 如果当天 digest 已存在则直接返回，否则重新抓取生成。 */
export declare function ensureTodayDigest(config?: Config, runtime?: DigestRuntime): Promise<DigestResult>;
/** 读取最近一次生成的 digest 元数据；没有则返回 null。 */
export declare function readLatestDigest(config?: Config): DigestResult | null;
export declare function apply(ctx: Context, config?: Config): void;
export declare const pluginName: string, pluginInject: string[] | undefined, pluginApply: (ctx: Context, config?: Config | undefined) => void;
