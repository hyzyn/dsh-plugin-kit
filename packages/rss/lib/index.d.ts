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
}
export interface Config {
    /** 关闭整个插件（不调度、不注入 systemPrompt）。默认开。 */
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
export declare function digestDir(config?: Config): string;
interface RssStore {
    sources: Source[];
    categories: string[];
    catalogs: CatalogSource[];
    maxItemsPerSource?: number;
    maxTotalItems?: number;
    dailyTime?: string;
    autoGenerateOnMount?: boolean;
    announceToAgent?: boolean;
    updatedAt?: string;
}
export declare function readRssStore(config?: Config): RssStore;
export declare function writeRssStore(store: RssStore): void;
export declare function parseFeed(xml: string, baseUrl: string): FeedItem[];
/**
 * 抓取所有订阅源并生成当天 digest。返回生成的摘要信息。
 * 即使部分源失败，也会把成功抓到的内容写成 digest。
 */
export declare function generateDigest(config?: Config): Promise<DigestResult>;
/** 如果当天 digest 已存在则直接返回，否则重新抓取生成。 */
export declare function ensureTodayDigest(config?: Config): Promise<DigestResult>;
/** 读取最近一次生成的 digest 元数据；没有则返回 null。 */
export declare function readLatestDigest(config?: Config): DigestResult | null;
export declare function apply(ctx: Context, config?: Config): void;
export declare const pluginName: string, pluginInject: string[] | undefined, pluginApply: (ctx: Context, config?: Config | undefined) => void;
export {};
