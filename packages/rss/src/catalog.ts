/* ------------------------------------------------------------------ *
 * 订阅源目录（awesome-rsshub-routes）
 *
 * 数据源: https://jackyst0.github.io/awesome-rsshub-routes/
 * 上游 OPML: JackyST0/awesome-rsshub-routes 的 feeds.opml（一级 outline 为分类，
 * 含 xmlUrl 的 outline 为订阅源）。
 *
 * 快照见 ./routes-data.ts（由 scripts/sync-routes.mjs 生成）；运行时还会按 TTL
 * 从上游 OPML 静默刷新一次，刷新失败或离线时继续用快照，目录读取永不因网络阻塞。
 * ------------------------------------------------------------------ */

import { ROUTES } from './routes-data.js'
import type { RouteRecord } from './routes-data.js'

const OPML_URL = 'https://raw.githubusercontent.com/JackyST0/awesome-rsshub-routes/main/feeds.opml'
const REFRESH_TTL_MS = 12 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 5000

let liveRoutes: RouteRecord[] | null = null
let lastRefreshAt = 0
let refreshInFlight: Promise<void> | null = null

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#x([0-9a-fA-F]+);/g, (match, hex: string) => {
      const code = Number.parseInt(hex, 16)
      return Number.isNaN(code) ? match : String.fromCodePoint(code)
    })
    .replace(/&#(\d+);/g, (match, dec: string) => {
      const code = Number.parseInt(dec, 10)
      return Number.isNaN(code) ? match : String.fromCodePoint(code)
    })
}

function getAttr(tag: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`\\b${escaped}\\s*=\\s*["']([^"']*)["']`).exec(tag)
  return match?.[1]
}

/** 解析上游 OPML：一级 outline 为分类，含 xmlUrl 的 outline 为订阅源。 */
export function parseOpml(xml: string): RouteRecord[] {
  const records: RouteRecord[] = []
  // 分类块：非 feed 的一级 outline（无 xmlUrl / type 属性）及其包裹内容。
  const categoryBlocks = xml.match(/<outline\b(?![^>]*\b(?:xmlUrl|type)\s*=)[^>]*>[\s\S]*?<\/outline>/gi) ?? []
  for (const block of categoryBlocks) {
    const openEnd = block.indexOf('>')
    const openTag = block.slice(0, openEnd + 1)
    const category = decodeEntities(getAttr(openTag, 'text') ?? getAttr(openTag, 'title') ?? '未分类')
    const tags = block.match(/<outline\b[^>]*>/gi) ?? []
    for (const tag of tags) {
      const url = getAttr(tag, 'xmlUrl')
      if (url === undefined || url === '') continue
      const name = decodeEntities(getAttr(tag, 'text') ?? getAttr(tag, 'title') ?? '')
      if (name === '') continue
      records.push({ name, category, url })
    }
  }
  return records
}

/** 从上游 OPML 静默刷新内存数据；失败或超时保持现状（不抛错）。 */
export async function refreshCatalog(): Promise<void> {
  if (refreshInFlight !== null) return refreshInFlight
  refreshInFlight = (async () => {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
      const response = await fetch(OPML_URL, { signal: controller.signal })
      clearTimeout(timer)
      if (!response.ok) return
      const parsed = parseOpml(await response.text())
      if (parsed.length === 0) return
      liveRoutes = parsed
      lastRefreshAt = Date.now()
    } catch {
      // 静默失败：继续用快照
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

/** 当前目录数据：优先内存（刷新后），否则内置快照；顺带按 TTL 触发一次静默刷新。 */
export function getCatalogEntries(): RouteRecord[] {
  if (liveRoutes === null) liveRoutes = ROUTES
  const records = liveRoutes
  if (Date.now() - lastRefreshAt > REFRESH_TTL_MS && refreshInFlight === null) {
    void refreshCatalog()
  }
  return records
}

/** 目录全部分类（按上游策展顺序，去重）。 */
export function getCatalogCategories(): string[] {
  const seen = new Set<string>()
  const categories: string[] = []
  for (const record of getCatalogEntries()) {
    if (seen.has(record.category)) continue
    seen.add(record.category)
    categories.push(record.category)
  }
  return categories
}

/**
 * 搜索目录：名称命中优先，其次分类 / URL 命中；保持上游策展顺序。
 * 名称与分类带 emoji 前缀（如「🤖 AI 专题」），直接子串匹配即可覆盖。
 * category 非空时先按分类过滤。
 */
export function searchCatalog(rawQuery: string, limit: number, category?: string): RouteRecord[] {
  const query = rawQuery.trim().toLowerCase()
  const nameHits: RouteRecord[] = []
  const otherHits: RouteRecord[] = []
  for (const record of getCatalogEntries()) {
    if (category !== undefined && category.trim() !== '' && record.category !== category) continue
    if (query === '') {
      nameHits.push(record)
      continue
    }
    if (record.name.toLowerCase().includes(query)) {
      nameHits.push(record)
    } else if (record.category.toLowerCase().includes(query) || record.url.toLowerCase().includes(query)) {
      otherHits.push(record)
    }
  }
  return [...nameHits, ...otherHits].slice(0, limit)
}
