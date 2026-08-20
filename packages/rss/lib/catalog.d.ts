import type { RouteRecord } from './routes-data.js';
export interface CatalogSource {
    name: string;
    url: string;
}
/** 带来源标注的目录条目。 */
export interface CatalogEntry extends RouteRecord {
    catalog: string;
}
export interface CatalogStatus {
    name: string;
    url: string;
    ok: boolean;
    entryCount: number;
    error?: string;
}
export declare const BUILTIN_CATALOG_NAME = "awesome-rsshub-routes";
export declare const BUILTIN_CATALOG_URL = "https://raw.githubusercontent.com/JackyST0/awesome-rsshub-routes/main/feeds.opml";
/** 内置目录的静态条目（带来源标注）。 */
export declare function getBuiltinCatalogEntries(): CatalogEntry[];
/** 解析上游 OPML：一级 outline 为分类，含 xmlUrl 的 outline 为订阅源。 */
export declare function parseOpml(xml: string): RouteRecord[];
/** 目录来源当前状态（是否成功、条目数、最近错误），供 UI 展示。 */
export declare function catalogStatus(catalog: CatalogSource): CatalogStatus;
/** 合并全部目录来源（内置 + 自定义），附带 TTL 触发刷新副作用。 */
export declare function getMergedCatalogEntries(catalogs: CatalogSource[], includeBuiltin: boolean): CatalogEntry[];
/** 全部分类（按来源顺序去重）。 */
export declare function getCatalogCategories(entries: CatalogEntry[]): string[];
/** 全部来源名（含内置，按出现顺序去重）。 */
export declare function getCatalogSourceNames(entries: CatalogEntry[]): string[];
/**
 * 搜索目录条目：名称命中优先，其次分类 / URL 命中；保持来源与上游顺序。
 * category / catalog 非空时先按分类 / 来源过滤。
 */
export declare function searchCatalogEntries(entries: CatalogEntry[], rawQuery: string, limit: number, category?: string, catalog?: string): CatalogEntry[];
