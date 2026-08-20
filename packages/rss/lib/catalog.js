/* ------------------------------------------------------------------ *
 * 订阅源目录（多来源）
 *
 * 目录不再只有单一固定来源：内置 awesome-rsshub-routes 快照 + 用户配置的
 * 若干 OPML 目录地址（Config.catalogs / rss.json store 的 catalogs 字段）。
 * 所有来源按 TTL 静默刷新（失败回退缓存或为空，目录读取永不因网络阻塞），
 * 每条目录记录都带 catalog 来源名，界面可标注「来自 xxx」并按来源筛选。
 *
 * 内置快照数据源: https://jackyst0.github.io/awesome-rsshub-routes/
 * 上游 OPML: JackyST0/awesome-rsshub-routes 的 feeds.opml
 * 快照见 ./routes-data.ts（由 scripts/sync-routes.mjs 生成）。
 * ------------------------------------------------------------------ */
import { ROUTES } from './routes-data.js';
export const BUILTIN_CATALOG_NAME = 'awesome-rsshub-routes';
export const BUILTIN_CATALOG_URL = 'https://raw.githubusercontent.com/JackyST0/awesome-rsshub-routes/main/feeds.opml';
const CATALOG_REFRESH_TTL_MS = 12 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
const cache = new Map();
const inflight = new Map();
const errors = new Map();
/** 内置目录的静态条目（带来源标注）。 */
export function getBuiltinCatalogEntries() {
    return ROUTES.map((record) => ({ ...record, catalog: BUILTIN_CATALOG_NAME }));
}
function decodeEntities(value) {
    return value
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => {
        const code = Number.parseInt(hex, 16);
        return Number.isNaN(code) ? match : String.fromCodePoint(code);
    })
        .replace(/&#(\d+);/g, (match, dec) => {
        const code = Number.parseInt(dec, 10);
        return Number.isNaN(code) ? match : String.fromCodePoint(code);
    });
}
function getAttr(tag, name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`\\b${escaped}\\s*=\\s*["']([^"']*)["']`).exec(tag);
    return match?.[1];
}
/** 解析上游 OPML：一级 outline 为分类，含 xmlUrl 的 outline 为订阅源。 */
export function parseOpml(xml) {
    const records = [];
    // 分类块：非 feed 的一级 outline（无 xmlUrl / type 属性）及其包裹内容。
    const categoryBlocks = xml.match(/<outline\b(?![^>]*\b(?:xmlUrl|type)\s*=)[^>]*>[\s\S]*?<\/outline>/gi) ?? [];
    for (const block of categoryBlocks) {
        const openEnd = block.indexOf('>');
        const openTag = block.slice(0, openEnd + 1);
        const category = decodeEntities(getAttr(openTag, 'text') ?? getAttr(openTag, 'title') ?? '未分类');
        const tags = block.match(/<outline\b[^>]*>/gi) ?? [];
        for (const tag of tags) {
            const url = getAttr(tag, 'xmlUrl');
            if (url === undefined || url === '')
                continue;
            const name = decodeEntities(getAttr(tag, 'text') ?? getAttr(tag, 'title') ?? '');
            if (name === '')
                continue;
            records.push({ name, category, url });
        }
    }
    return records;
}
async function fetchCatalogRemote(catalog) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(catalog.url, {
            signal: controller.signal,
            headers: {
                'user-agent': 'Mozilla/5.0 (compatible; dsh-rss-digest/0.1; +https://github.com/hyzyn/dsh-plugin-kit)',
                accept: 'application/xml, text/xml, text/plain, */*; q=0.8',
            },
            redirect: 'follow',
        });
        clearTimeout(timer);
        if (!response.ok)
            throw new Error(`HTTP ${response.status}`);
        const parsed = parseOpml(await response.text());
        if (parsed.length === 0)
            throw new Error('未解析到任何订阅条目');
        return parsed.map((record) => ({ ...record, catalog: catalog.name }));
    }
    finally {
        clearTimeout(timer);
    }
}
/** 读取单个目录来源：优先 TTL 内缓存，过期或缺失时静默触发刷新并回退旧缓存。 */
function cachedCatalogEntries(catalog) {
    const hit = cache.get(catalog.url);
    if (hit !== undefined && Date.now() - hit.at < CATALOG_REFRESH_TTL_MS)
        return hit.entries;
    if (!inflight.has(catalog.url)) {
        inflight.set(catalog.url, (async () => {
            try {
                const entries = await fetchCatalogRemote(catalog);
                cache.set(catalog.url, { entries, at: Date.now() });
                errors.delete(catalog.url);
            }
            catch (error) {
                errors.set(catalog.url, error instanceof Error ? error.message : String(error));
            }
            finally {
                inflight.delete(catalog.url);
            }
        })());
    }
    const prev = cache.get(catalog.url);
    return prev !== undefined ? prev.entries : [];
}
/** 目录来源当前状态（是否成功、条目数、最近错误），供 UI 展示。 */
export function catalogStatus(catalog) {
    const prev = cache.get(catalog.url);
    const error = errors.get(catalog.url);
    return {
        name: catalog.name,
        url: catalog.url,
        ok: error === undefined,
        entryCount: prev !== undefined ? prev.entries.length : 0,
        ...(error !== undefined ? { error } : {}),
    };
}
/** 合并全部目录来源（内置 + 自定义），附带 TTL 触发刷新副作用。 */
export function getMergedCatalogEntries(catalogs, includeBuiltin) {
    const entries = [];
    if (includeBuiltin)
        entries.push(...getBuiltinCatalogEntries());
    for (const catalog of catalogs)
        entries.push(...cachedCatalogEntries(catalog));
    return entries;
}
/** 全部分类（按来源顺序去重）。 */
export function getCatalogCategories(entries) {
    const seen = new Set();
    const categories = [];
    for (const record of entries) {
        if (seen.has(record.category))
            continue;
        seen.add(record.category);
        categories.push(record.category);
    }
    return categories;
}
/** 全部来源名（含内置，按出现顺序去重）。 */
export function getCatalogSourceNames(entries) {
    const seen = new Set();
    const names = [];
    for (const record of entries) {
        if (seen.has(record.catalog))
            continue;
        seen.add(record.catalog);
        names.push(record.catalog);
    }
    return names;
}
/**
 * 搜索目录条目：名称命中优先，其次分类 / URL 命中；保持来源与上游顺序。
 * category / catalog 非空时先按分类 / 来源过滤。
 */
export function searchCatalogEntries(entries, rawQuery, limit, category, catalog) {
    const query = rawQuery.trim().toLowerCase();
    const nameHits = [];
    const otherHits = [];
    for (const record of entries) {
        if (category !== undefined && category.trim() !== '' && record.category !== category)
            continue;
        if (catalog !== undefined && catalog.trim() !== '' && record.catalog !== catalog)
            continue;
        if (query === '') {
            nameHits.push(record);
            continue;
        }
        if (record.name.toLowerCase().includes(query)) {
            nameHits.push(record);
        }
        else if (record.category.toLowerCase().includes(query) || record.url.toLowerCase().includes(query)) {
            otherHits.push(record);
        }
    }
    return [...nameHits, ...otherHits].slice(0, limit);
}
//# sourceMappingURL=catalog.js.map