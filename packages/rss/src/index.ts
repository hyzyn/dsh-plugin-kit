/**
 * @hyzyn/dsh-rss — DSH 的 RSS / 新闻聚合插件（宿主半体）。
 *
 * 能力：
 * - 订阅多个 RSS / Atom 源（默认内置几个中文科技 / 新闻源，也可通过 Config.sources 覆盖）；
 * - 每次抓取后按来源去重、截断，生成 Markdown 格式的「今日值得读」；
 * - 每天在可配置时间（默认 08:00）自动生成当天 digest；插件启动时若当天 digest
 *   尚未生成也会自动补生成；
 * - 把当天 digest 注入 systemPrompt，模型在用户问“今日值得读”时可以直接引用；
 * - 生成的 Markdown 存放在 ~/.dsh/rss-digest/YYYY-MM-DD.md（可用 DSH_RSS_DIGEST_DIR
 *   或 Config.digestDir 覆盖），并同时写一份 latest.json 便于外部读取。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { definePlugin } from '@hyzyn/dsh-kit'
import { getCatalogCategories, searchCatalog } from './catalog.js'

export const name = 'rss-digest'
export const inject: string[] = []

/* ------------------------------------------------------------------ *
 * 配置与类型
 * ------------------------------------------------------------------ */

export interface Source {
  /** 订阅源显示名，例如「阮一峰的网络日志」。 */
  name: string
  /** RSS / Atom 地址。 */
  url: string
  /** 可选分类，会显示在 digest 条目里。 */
  category?: string
  /** 该源最多取多少条，默认取 Config.maxItemsPerSource。 */
  limit?: number
  /** 内置渠道 key；存在时以内置渠道库的配置为准（分类可用 store 里的覆盖）。 */
  builtin?: string
}

/** 内置渠道：经过验证的订阅地址 + 官网 + 默认分类。 */
export interface BuiltinChannel {
  key: string
  name: string
  url: string
  category: string
  site?: string
  note?: string
}

const BUILTIN_CHANNELS: BuiltinChannel[] = [
  { key: 'ruanyifeng', name: '阮一峰的网络日志', url: 'https://www.ruanyifeng.com/blog/atom.xml', category: '技术', site: 'http://www.ruanyifeng.com/blog/' },
  { key: 'sspai', name: '少数派', url: 'https://sspai.com/feed', category: '效率', site: 'https://sspai.com/' },
  { key: 'solidot', name: 'Solidot', url: 'https://www.solidot.org/index.rss', category: '科技', site: 'https://www.solidot.org/' },
  { key: 'hackernews', name: 'Hacker News', url: 'https://news.ycombinator.com/rss', category: '科技', site: 'https://news.ycombinator.com/' },
  { key: 'juejin', name: '掘金', url: 'https://juejin.cn/rss', category: '技术', site: 'https://juejin.cn/' },
  { key: 'ithome', name: 'IT之家', url: 'https://www.ithome.com/rss/', category: '科技', site: 'https://www.ithome.com/' },
  { key: '36kr', name: '36氪', url: 'https://rsshub.rssforever.com/36kr/newsflashes', category: '商业', site: 'https://36kr.com/', note: '官方 feed 被反爬拦截，此处为第三方 RSSHub 镜像，可能不稳定' },
]

const BUILTIN_BY_KEY = new Map(BUILTIN_CHANNELS.map((channel) => [channel.key, channel]))

export interface FeedItem {
  id: string
  title: string
  link: string
  summary?: string
  /** ISO 8601 字符串，可能为空。 */
  date?: string
  source: string
  category?: string
}

export interface DigestSourceMeta {
  name: string
  url: string
  category?: string
  /** 来源官网地址（从 feed 头部解析，失败时退回 feed URL 的 origin）。 */
  site?: string
}

export interface DigestResult {
  date: string
  file: string
  items: FeedItem[]
  errors: Array<{ source: string; error: string }>
  generatedAt: string
  /** 参与本次抓取的订阅源元信息（含官网地址），供 Web GUI「查看更多」使用。 */
  sources?: DigestSourceMeta[]
}

export interface Config {
  /** 关闭整个插件（不调度、不注入 systemPrompt）。默认开。 */
  enabled?: boolean
  /** 是否向 agent 注入插件能力与当天 digest 公告。默认开。 */
  announceToAgent?: boolean
  /** 是否提供 awesome-rsshub-routes 精选订阅源目录（/api/dsh-rss/catalog，供 GUI 浏览搜索添加）。默认开。 */
  includeCatalog?: boolean
  /** 订阅源列表；不传时使用内置默认源。 */
  sources?: Source[]
  /** 可选的新闻分类列表，用于 UI 里维护分类。 */
  categories?: string[]
  /** 每个源最多取多少条。默认 5。 */
  maxItemsPerSource?: number
  /** 每天 digest 最多汇总多少条。默认 30。 */
  maxTotalItems?: number
  /** 每天自动生成时间（HH:mm，24 小时制）。默认 "08:00"。 */
  dailyTime?: string
  /** 启动时若当天 digest 不存在是否自动生成。默认开。 */
  autoGenerateOnMount?: boolean
  /** 自定义 digest 输出目录。默认 ~/.dsh/rss-digest。 */
  digestDir?: string
  /** 单次请求超时毫秒数。默认 10000。 */
  requestTimeoutMs?: number
  /** 抓取时使用的 User-Agent。 */
  userAgent?: string
}

/* ------------------------------------------------------------------ *
 * settings 命名空间（让「设置 → 插件 → 插件配置」派发本插件卡片）
 * ------------------------------------------------------------------ */

/** 与 ~/.dsh/rss.json 的可编辑 store 形状对齐。 */
const RSS_SETTINGS_SCHEMA = z.object({
  sources: z.array(z.object({
    name: z.string(),
    url: z.string(),
    category: z.string(),
    limit: z.natural(),
    builtin: z.string(),
  })).default([]),
  categories: z.array(z.string()).default([]),
  maxItemsPerSource: z.natural(),
  maxTotalItems: z.natural(),
  dailyTime: z.string(),
  autoGenerateOnMount: z.boolean(),
  announceToAgent: z.boolean(),
  updatedAt: z.string(),
})

/* ------------------------------------------------------------------ *
 * 默认值 / 路径
 * ------------------------------------------------------------------ */

/** 默认启用全部内置渠道。 */
function defaultSources(): Source[] {
  return BUILTIN_CHANNELS.map((channel) => ({
    name: channel.name,
    url: channel.url,
    category: channel.category,
    builtin: channel.key,
  }))
}

/** 按 builtin 标记解析内置渠道；旧版 store 没有标记时按名称 / URL 匹配迁移。 */
function resolveBuiltin(source: Source): BuiltinChannel | undefined {
  if (source.builtin) return BUILTIN_BY_KEY.get(source.builtin)
  return BUILTIN_CHANNELS.find((channel) => channel.url === source.url || channel.name === source.name)
}

const DEFAULT_MAX_ITEMS_PER_SOURCE = 5
const DEFAULT_MAX_TOTAL_ITEMS = 30
const DEFAULT_DAILY_TIME = '08:00'
const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (compatible; dsh-rss-digest/0.1; +https://github.com/hyzyn/dsh-plugin-kit)'

function dshHome(): string {
  const home = process.env.DSH_HOME?.trim()
  return home ? expandHome(home) : join(homedir(), '.dsh')
}

function expandHome(input: string): string {
  const path = input.trim()
  if (path === '~') return homedir()
  if (path.startsWith('~/')) return join(homedir(), path.slice(2))
  return path
}

export function digestDir(config?: Config): string {
  const configured = config?.digestDir?.trim() || process.env.DSH_RSS_DIGEST_DIR?.trim()
  return configured ? expandHome(configured) : join(dshHome(), 'rss-digest')
}

function todayKey(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function digestPath(date: string, config?: Config): string {
  return join(digestDir(config), `${date}.md`)
}

function latestJsonPath(config?: Config): string {
  return join(digestDir(config), 'latest.json')
}

/* ------------------------------------------------------------------ *
 * 可编辑配置存储（~/.dsh/rss.json）
 * ------------------------------------------------------------------ */

interface RssStore {
  sources: Source[]
  categories: string[]
  maxItemsPerSource?: number
  maxTotalItems?: number
  dailyTime?: string
  autoGenerateOnMount?: boolean
  announceToAgent?: boolean
  updatedAt?: string
}

function rssConfigPath(): string {
  return process.env.DSH_RSS_CONFIG_FILE?.trim() || join(dshHome(), 'rss.json')
}

function defaultRssStore(config?: Config): RssStore {
  return {
    sources: Array.isArray(config?.sources) && config.sources.length > 0 ? config.sources : defaultSources(),
    categories: Array.isArray(config?.categories) ? config.categories.filter((item): item is string => typeof item === 'string' && item.trim() !== '') : [],
    maxItemsPerSource: config?.maxItemsPerSource,
    maxTotalItems: config?.maxTotalItems,
    dailyTime: config?.dailyTime?.trim() || DEFAULT_DAILY_TIME,
    autoGenerateOnMount: config?.autoGenerateOnMount,
    announceToAgent: config?.announceToAgent,
  }
}

export function readRssStore(config?: Config): RssStore {
  const file = rssConfigPath()
  const base = defaultRssStore(config)
  if (!existsSync(file)) return base
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<RssStore>
    return {
      sources: Array.isArray(parsed.sources) ? parsed.sources : base.sources,
      categories: Array.isArray(parsed.categories) ? parsed.categories : base.categories,
      maxItemsPerSource: typeof parsed.maxItemsPerSource === 'number' ? parsed.maxItemsPerSource : base.maxItemsPerSource,
      maxTotalItems: typeof parsed.maxTotalItems === 'number' ? parsed.maxTotalItems : base.maxTotalItems,
      dailyTime: typeof parsed.dailyTime === 'string' && parsed.dailyTime.trim() ? parsed.dailyTime : base.dailyTime,
      autoGenerateOnMount: typeof parsed.autoGenerateOnMount === 'boolean' ? parsed.autoGenerateOnMount : base.autoGenerateOnMount,
      announceToAgent: typeof parsed.announceToAgent === 'boolean' ? parsed.announceToAgent : base.announceToAgent,
      ...(typeof parsed.updatedAt === 'string' ? { updatedAt: parsed.updatedAt } : {}),
    }
  } catch {
    return base
  }
}

export function writeRssStore(store: RssStore): void {
  const file = rssConfigPath()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify({ ...store, updatedAt: new Date().toISOString() }, null, 2), { mode: 0o600 })
}

function validateRssStoreInput(raw: unknown): { store?: RssStore; error?: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { error: '配置必须是对象' }
  }
  const input = raw as Record<string, unknown>

  let sources: Source[] | undefined
  if (input.sources !== undefined) {
    if (!Array.isArray(input.sources)) return { error: 'sources 必须是数组' }
    const result: Source[] = []
    for (const item of input.sources) {
      if (typeof item !== 'object' || item === null) return { error: '每个订阅源必须是对象' }
      const source = item as Record<string, unknown>
      const name = typeof source.name === 'string' ? source.name.trim() : ''
      const url = typeof source.url === 'string' ? source.url.trim() : ''
      if (!name) return { error: '订阅源名称不能为空' }
      if (!url) return { error: '订阅源 URL 不能为空' }
      try {
        new URL(url)
      } catch {
        return { error: '订阅源 URL 不合法: ' + url }
      }
      const category = typeof source.category === 'string' && source.category.trim() !== '' ? source.category.trim() : undefined
      const limit = typeof source.limit === 'number' && Number.isInteger(source.limit) && source.limit > 0 ? source.limit : undefined
      const builtin = typeof source.builtin === 'string' && BUILTIN_BY_KEY.has(source.builtin) ? source.builtin : undefined
      result.push({
        name,
        url,
        ...(category !== undefined ? { category } : {}),
        ...(limit !== undefined ? { limit } : {}),
        ...(builtin !== undefined ? { builtin } : {}),
      })
    }
    sources = result
  }

  let categories = Array.isArray(input.categories)
    ? input.categories.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map((item) => item.trim())
    : undefined
  // 自动把渠道使用到的分类合并进分类列表（去重、保持原顺序），让「新闻分类」始终反映实际分类
  if (categories === undefined) categories = []
  for (const source of sources ?? []) {
    if (source.category && !categories.includes(source.category)) categories.push(source.category)
  }
  const maxItemsPerSource = typeof input.maxItemsPerSource === 'number' && Number.isInteger(input.maxItemsPerSource) && input.maxItemsPerSource > 0
    ? input.maxItemsPerSource
    : undefined
  const maxTotalItems = typeof input.maxTotalItems === 'number' && Number.isInteger(input.maxTotalItems) && input.maxTotalItems > 0
    ? input.maxTotalItems
    : undefined
  const dailyTime = typeof input.dailyTime === 'string' && /^\d{1,2}:\d{2}$/.test(input.dailyTime.trim())
    ? input.dailyTime.trim()
    : undefined
  const autoGenerateOnMount = typeof input.autoGenerateOnMount === 'boolean' ? input.autoGenerateOnMount : undefined
  const announceToAgent = typeof input.announceToAgent === 'boolean' ? input.announceToAgent : undefined

  return {
    store: {
      sources: sources ?? [],
      categories,
      ...(maxItemsPerSource !== undefined ? { maxItemsPerSource } : {}),
      ...(maxTotalItems !== undefined ? { maxTotalItems } : {}),
      ...(dailyTime !== undefined ? { dailyTime } : {}),
      ...(autoGenerateOnMount !== undefined ? { autoGenerateOnMount } : {}),
      ...(announceToAgent !== undefined ? { announceToAgent } : {}),
    },
  }
}

/* ------------------------------------------------------------------ *
 * RSS / Atom 解析（零依赖）
 * ------------------------------------------------------------------ */

function decodeEntities(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => {
      try {
        return String.fromCodePoint(Number.parseInt(hex, 16))
      } catch {
        return ''
      }
    })
    .replace(/&#(\d+);/g, (_, code: string) => {
      try {
        return String.fromCodePoint(Number.parseInt(code, 10))
      } catch {
        return ''
      }
    })
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractTag(xml: string, tag: string): string | undefined {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`<(?:[A-Za-z0-9]+:)?${escaped}\\b[^>]*>([\\s\\S]*?)</(?:[A-Za-z0-9]+:)?${escaped}>`, 'i').exec(xml)
  return match?.[1]
}

function extractAttribute(xml: string, tag: string, attr: string): string | undefined {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const attrEscaped = attr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`<(?:[A-Za-z0-9]+:)?${escaped}\\b[^>]*\\s${attrEscaped}\\s*=\\s*["']([^"']*)["'][^>]*/?>`, 'i').exec(xml)
  return match?.[1]
}

function resolveUrl(link: string, base: string): string {
  if (!link) return ''
  try {
    return new URL(link, base).toString()
  } catch {
    return link
  }
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function parseRss(xml: string, baseUrl: string): FeedItem[] {
  const blocks = xml.match(/<(?:[A-Za-z0-9]+:)?item\b[\s\S]*?<\/(?:[A-Za-z0-9]+:)?item>/gi) ?? []
  return blocks.map((raw, index) => {
    const title = decodeEntities(extractTag(raw, 'title') ?? '')
    const link = decodeEntities(extractTag(raw, 'link') ?? extractAttribute(raw, 'link', 'href') ?? '')
    const guid = decodeEntities(extractTag(raw, 'guid') ?? extractTag(raw, 'id') ?? '')
    const description = decodeEntities(extractTag(raw, 'description') ?? extractTag(raw, 'summary') ?? '')
    const pubDate = decodeEntities(extractTag(raw, 'pubDate') ?? extractTag(raw, 'date') ?? '')
    const category = decodeEntities(extractTag(raw, 'category') ?? extractAttribute(raw, 'category', 'term') ?? '')
    const parsedDate = parseDate(pubDate)
    return {
      id: guid || link || `${baseUrl}#${index}`,
      title,
      link: resolveUrl(link, baseUrl),
      ...(description ? { summary: description } : {}),
      ...(parsedDate ? { date: parsedDate.toISOString() } : {}),
      source: '',
      ...(category ? { category } : {}),
    }
  })
}

function parseAtom(xml: string, baseUrl: string): FeedItem[] {
  const blocks = xml.match(/<(?:[A-Za-z0-9]+:)?entry\b[\s\S]*?<\/(?:[A-Za-z0-9]+:)?entry>/gi) ?? []
  return blocks.map((raw, index) => {
    const title = decodeEntities(extractTag(raw, 'title') ?? '')
    const link = decodeEntities(extractAttribute(raw, 'link', 'href') ?? extractTag(raw, 'link') ?? '')
    const id = decodeEntities(extractTag(raw, 'id') ?? '')
    const summary = decodeEntities(extractTag(raw, 'summary') ?? extractTag(raw, 'content') ?? '')
    const updated = decodeEntities(extractTag(raw, 'updated') ?? extractTag(raw, 'published') ?? '')
    const category = decodeEntities(extractAttribute(raw, 'category', 'term') ?? extractTag(raw, 'category') ?? '')
    const parsedDate = parseDate(updated)
    return {
      id: id || link || `${baseUrl}#${index}`,
      title,
      link: resolveUrl(link, baseUrl),
      ...(summary ? { summary } : {}),
      ...(parsedDate ? { date: parsedDate.toISOString() } : {}),
      source: '',
      ...(category ? { category } : {}),
    }
  })
}

export function parseFeed(xml: string, baseUrl: string): FeedItem[] {
  if (/<feed\b/i.test(xml)) return parseAtom(xml, baseUrl)
  return parseRss(xml, baseUrl)
}

/** 从 feed 头部解析来源官网地址：Atom 取 feed 级 alternate link，RSS 取 channel link。 */
function parseFeedSite(xml: string, baseUrl: string): string | undefined {
  let candidate: string | undefined
  if (/<feed\b/i.test(xml)) {
    const head = xml.split(/<(?:[A-Za-z0-9]+:)?entry\b/i)[0] ?? xml
    for (const match of head.matchAll(/<(?:[A-Za-z0-9]+:)?link\b([^>]*)>/gi)) {
      const attrs = match[1] ?? ''
      const rel = /\brel\s*=\s*["']?([^"'/>\s]+)/i.exec(attrs)?.[1] ?? 'alternate'
      const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1]
      if (!href || rel === 'self') continue
      candidate = href
      if (rel === 'alternate') break
    }
  } else {
    candidate = decodeEntities(extractTag(xml, 'link') ?? '')
  }
  if (!candidate) return undefined
  return resolveUrl(candidate, baseUrl)
}

/** 拿不到官网地址时退回 feed URL 的 origin。 */
function fallbackSite(feedUrl: string): string | undefined {
  try {
    return new URL(feedUrl).origin + '/'
  } catch {
    return undefined
  }
}

/** 为当前配置的每个渠道（内置渠道优先取官网）计算元信息，供「查看更多」兜底使用。 */
function sourcesMetaFromStore(config?: Config): DigestSourceMeta[] {
  const store = readRssStore(config)
  const list = store.sources.length > 0 ? store.sources : defaultSources()
  return list.map((source) => {
    const builtin = resolveBuiltin(source)
    const name = builtin?.name ?? source.name?.trim() ?? source.url
    const url = builtin?.url ?? source.url
    const category = builtin?.category ?? source.category?.trim() ?? undefined
    return {
      name,
      url,
      ...(category ? { category } : {}),
      site: builtin?.site ?? fallbackSite(url),
    }
  })
}

/* ------------------------------------------------------------------ *
 * 抓取
 * ------------------------------------------------------------------ */

function normalizeSources(config?: Config): Source[] {
  const store = readRssStore(config)
  const configured = store.sources.length > 0 ? store.sources : defaultSources()
  const fallbackLimit = store.maxItemsPerSource ?? DEFAULT_MAX_ITEMS_PER_SOURCE
  return configured.map((source) => {
    const builtin = resolveBuiltin(source)
    if (builtin) {
      return {
        name: builtin.name,
        url: builtin.url,
        category: source.category?.trim() || builtin.category,
        limit: fallbackLimit,
      }
    }
    return {
      name: source.name?.trim() || source.url,
      url: source.url.trim(),
      ...(source.category?.trim() ? { category: source.category.trim() } : {}),
      limit: typeof source.limit === 'number' && source.limit > 0 ? source.limit : fallbackLimit,
    }
  })
}

/** 保存前对自定义渠道做一次真实抓取校验；解析不到条目则抛错。 */
async function validateCustomSource(source: Source, config?: Config): Promise<void> {
  const result = await fetchFeed({ name: source.name, url: source.url, limit: 1 }, config)
  if (result.items.length === 0) {
    throw new Error('未解析到任何条目，可能不是合法的 RSS/Atom 订阅地址')
  }
}

interface FetchResult {
  items: FeedItem[]
  site?: string
}

async function fetchFeed(source: Source, config?: Config): Promise<FetchResult> {
  const timeout = config?.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(source.url, {
      headers: {
        'user-agent': config?.userAgent?.trim() || DEFAULT_USER_AGENT,
        accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml; q=0.9, */*; q=0.8',
      },
      signal: controller.signal,
      redirect: 'follow',
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}${response.statusText ? ' ' + response.statusText : ''}`)
    }
    const xml = await response.text()
    const store = readRssStore(config)
    const limit = source.limit ?? store.maxItemsPerSource ?? DEFAULT_MAX_ITEMS_PER_SOURCE
    const items = parseFeed(xml, source.url)
      .map((item) => ({ ...item, source: source.name, ...(source.category || item.category ? { category: source.category || item.category } : {}) }))
      .slice(0, limit)
    if (items.length === 0 && /<html[\s>]/i.test(xml)) {
      throw new Error('feed 返回的是 HTML 页面（疑似反爬拦截），请更换订阅地址')
    }
    return { items, site: parseFeedSite(xml, source.url) }
  } finally {
    clearTimeout(timer)
  }
}

/* ------------------------------------------------------------------ *
 * Digest 生成
 * ------------------------------------------------------------------ */

function formatShortDate(iso?: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function renderDigestMarkdown(items: FeedItem[], date: string, errors: DigestResult['errors'], sourceCount: number): string {
  const lines: string[] = [`# 今日值得读 · ${date}`, '']
  lines.push(`> 来自 ${sourceCount} 个订阅源，共 ${items.length} 条。`, '')

  const byCategory = new Map<string, FeedItem[]>()
  for (const item of items) {
    const key = item.category || '未分类'
    const list = byCategory.get(key) ?? []
    list.push(item)
    byCategory.set(key, list)
  }

  for (const [category, categoryItems] of byCategory) {
    lines.push(`## ${category}`, '')
    for (const item of categoryItems) {
      const title = item.title || '(无标题)'
      const link = item.link ? `[${title}](${item.link})` : title
      const meta: string[] = []
      if (item.source) meta.push(item.source)
      const shortDate = formatShortDate(item.date)
      if (shortDate) meta.push(shortDate)
      lines.push(`- ${link}${meta.length > 0 ? ` — ${meta.join(' / ')}` : ''}`)
      if (item.summary) {
        const summary = item.summary.length > 140 ? `${item.summary.slice(0, 140)}…` : item.summary
        lines.push(`  ${summary}`)
      }
    }
    lines.push('')
  }

  if (errors.length > 0) {
    lines.push('## 抓取失败', '')
    for (const error of errors) {
      lines.push(`- ${error.source}: ${error.error}`)
    }
    lines.push('')
  }

  return lines.join('\n').trim() + '\n'
}

/**
 * 抓取所有订阅源并生成当天 digest。返回生成的摘要信息。
 * 即使部分源失败，也会把成功抓到的内容写成 digest。
 */
export async function generateDigest(config: Config = {}): Promise<DigestResult> {
  const sources = normalizeSources(config)
  const settled = await Promise.allSettled(sources.map((source) => fetchFeed(source, config)))
  const items: FeedItem[] = []
  const errors: DigestResult['errors'] = []
  const sourcesMeta: DigestSourceMeta[] = []

  settled.forEach((result, index) => {
    const source = sources[index]
    if (result.status === 'fulfilled') {
      items.push(...result.value.items)
      const builtinMeta = resolveBuiltin(source)
      sourcesMeta.push({
        name: source.name,
        url: source.url,
        ...(source.category ? { category: source.category } : {}),
        site: builtinMeta?.site ?? result.value.site ?? fallbackSite(source.url),
      })
    } else {
      errors.push({
        source: source.name,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      })
      sourcesMeta.push({
        name: source.name,
        url: source.url,
        ...(source.category ? { category: source.category } : {}),
      })
    }
  })

  // 按链接 / id / 标题去重
  const seen = new Set<string>()
  const unique = items.filter((item) => {
    const key = (item.link || item.id || item.title).trim().toLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })

  // 新的在前；没有时间的排在后面
  unique.sort((a, b) => {
    if (a.date && b.date) return b.date.localeCompare(a.date)
    if (a.date) return -1
    if (b.date) return 1
    return 0
  })

  const maxTotal = readRssStore(config).maxTotalItems ?? DEFAULT_MAX_TOTAL_ITEMS
  const selected = unique.slice(0, maxTotal)
  const date = todayKey()
  const file = digestPath(date, config)
  const generatedAt = new Date().toISOString()
  const markdown = renderDigestMarkdown(selected, date, errors, sources.length)

  mkdirSync(digestDir(config), { recursive: true })
  writeFileSync(file, markdown, 'utf8')
  writeFileSync(latestJsonPath(config), JSON.stringify({
    date,
    file,
    items: selected,
    errors,
    generatedAt,
    sources: sourcesMeta,
  }, null, 2), 'utf8')

  return { date, file, items: selected, errors, generatedAt, sources: sourcesMeta }
}

/** 如果当天 digest 已存在则直接返回，否则重新抓取生成。 */
export async function ensureTodayDigest(config: Config = {}): Promise<DigestResult> {
  const date = todayKey()
  const file = digestPath(date, config)
  if (existsSync(file)) {
    const existing = readLatestDigest(config)
    if (existing && existing.date === date) return existing
    return {
      date,
      file,
      items: [],
      errors: [],
      generatedAt: new Date().toISOString(),
    }
  }
  return generateDigest(config)
}

/** 读取最近一次生成的 digest 元数据；没有则返回 null。 */
export function readLatestDigest(config?: Config): DigestResult | null {
  const file = latestJsonPath(config)
  if (!existsSync(file)) return null
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as DigestResult
    return parsed
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ *
 * HTTP 路由（loopback-only 围栏，供 Web GUI client 使用）
 * ------------------------------------------------------------------ */

interface ReqLike {
  method?: string
  url?: string
  headers: Record<string, string | string[] | undefined>
  socket: { remoteAddress?: string }
}

interface ResLike {
  writeHead(status: number, headers?: Record<string, string>): void
  end(body?: string): void
}

type RouteHandler = (req: ReqLike & AsyncIterable<Uint8Array>, res: ResLike) => Promise<void>

function isLoopbackRequest(request: ReqLike): boolean {
  const address = request.socket.remoteAddress
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false
  const host = request.headers.host
  if (typeof host !== 'string') return false
  let hostUrl: URL
  try {
    hostUrl = new URL('http://' + host)
  } catch {
    return false
  }
  if (hostUrl.hostname !== '127.0.0.1' && hostUrl.hostname !== 'localhost' && hostUrl.hostname !== '[::1]') return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

function writeJson(res: ResLike, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'referrer-policy': 'no-referrer' })
  res.end(JSON.stringify(body))
}

async function readJsonBody(req: ReqLike & AsyncIterable<Uint8Array>): Promise<Record<string, unknown> | undefined> {
  const chunks: Uint8Array[] = []
  let size = 0
  const MAX_BODY_BYTES = 1024 * 1024
  try {
    for await (const chunk of req) {
      size += chunk.length
      if (size > MAX_BODY_BYTES) return undefined
      chunks.push(chunk)
    }
  } catch {
    return undefined
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

function digestMarkdown(digest: DigestResult | null): string {
  if (!digest) return ''
  if (!existsSync(digest.file)) return ''
  try {
    return readFileSync(digest.file, 'utf8')
  } catch {
    return ''
  }
}

function makeRoutes(config?: Config, onDigestChanged?: (digest: DigestResult) => void): Array<{ kind: 'exact'; path: string; handler: RouteHandler }> {
  const guard = (req: ReqLike, res: ResLike, method: string): boolean => {
    if (!isLoopbackRequest(req)) {
      writeJson(res, 403, { error: 'forbidden: loopback-only' })
      return false
    }
    if (req.method !== method) {
      writeJson(res, 405, { error: 'method not allowed: ' + String(req.method) })
      return false
    }
    return true
  }

  const digestPayload = () => {
    const digest = readLatestDigest(config)
    // 旧版 digest 没有 sources 元信息时，用订阅源配置兜底推导官网地址，保证「查看更多」始终可用
    const sources = digest?.sources && digest.sources.length > 0
      ? digest.sources
      : sourcesMetaFromStore(config)
    return {
      ...(digest ?? {
        date: todayKey(),
        file: digestPath(todayKey(), config),
        items: [],
        errors: [],
        generatedAt: '',
      }),
      sources,
      markdown: digestMarkdown(digest),
      digestDir: digestDir(config),
    }
  }

  return [
    {
      kind: 'exact',
      path: '/api/dsh-rss/digest',
      handler: async (req, res) => {
        if (!guard(req, res, 'GET')) return
        writeJson(res, 200, { ok: true, ...digestPayload() })
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-rss/refresh',
      handler: async (req, res) => {
        if (!guard(req, res, 'POST')) return
        try {
          const digest = await generateDigest(config)
          onDigestChanged?.(digest)
          writeJson(res, 200, { ok: true, ...digest, markdown: digestMarkdown(digest), digestDir: digestDir(config) })
        } catch (error) {
          writeJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
        }
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-rss/config',
      handler: async (req, res) => {
        if (req.method === 'GET') {
          if (!guard(req, res, 'GET')) return
          writeJson(res, 200, { ok: true, config: readRssStore(config), builtins: BUILTIN_CHANNELS, file: rssConfigPath() })
          return
        }
        if (!guard(req, res, 'POST')) return
        const body = await readJsonBody(req)
        if (body === undefined) {
          writeJson(res, 400, { error: 'invalid JSON body' })
          return
        }
        const payload = body.config ?? body
        const validated = validateRssStoreInput(payload)
        if (validated.error !== undefined || validated.store === undefined) {
          writeJson(res, 400, { error: validated.error ?? '配置校验失败' })
          return
        }
        // 自定义渠道保存前真实抓取一次，地址抓不到内容就直接报错，不写入
        const customSources = validated.store.sources.filter((source) => resolveBuiltin(source) === undefined)
        if (customSources.length > 0) {
          const checks = await Promise.allSettled(customSources.map((source) => validateCustomSource(source, config)))
          const failures: string[] = []
          checks.forEach((result, index) => {
            if (result.status === 'rejected') {
              const source = customSources[index]
              failures.push(source.name + '：' + (result.reason instanceof Error ? result.reason.message : String(result.reason)))
            }
          })
          if (failures.length > 0) {
            writeJson(res, 400, { error: '自定义渠道校验失败，未保存：' + failures.join('；') })
            return
          }
        }
        try {
          writeRssStore(validated.store)
        } catch (error) {
          writeJson(res, 500, { error: '写入 RSS 配置失败: ' + (error instanceof Error ? error.message : String(error)) })
          return
        }
        writeJson(res, 200, { ok: true, config: readRssStore(config), builtins: BUILTIN_CHANNELS, file: rssConfigPath() })
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-rss/sources',
      handler: async (req, res) => {
        if (!guard(req, res, 'GET')) return
        writeJson(res, 200, { ok: true, sources: normalizeSources(config), digestDir: digestDir(config) })
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-rss/catalog',
      handler: async (req, res) => {
        if (!guard(req, res, 'GET')) return
        if (config?.includeCatalog === false) {
          writeJson(res, 200, { ok: true, total: 0, categories: [], entries: [], disabled: true })
          return
        }
        let query = ''
        let category: string | undefined
        try {
          const params = new URL('http://localhost' + (req.url ?? '/')).searchParams
          query = params.get('q') ?? ''
          const rawCategory = params.get('category')
          category = rawCategory !== null && rawCategory.trim() !== '' ? rawCategory.trim() : undefined
        } catch {
          writeJson(res, 400, { error: 'invalid query string' })
          return
        }
        const categories = getCatalogCategories()
        const entries = searchCatalog(query, 100, category)
        writeJson(res, 200, { ok: true, total: entries.length, categories, entries })
      },
    },
  ]
}

/* ------------------------------------------------------------------ *
 * systemPrompt 注入
 * ------------------------------------------------------------------ */

function buildSystemPromptText(digest: DigestResult | null): string {
  if (!digest) {
    return '本机已安装 rss-digest 插件（RSS / 新闻聚合）：每天自动抓取订阅源并生成「今日值得读」；内置 awesome-rsshub-routes 精选订阅源目录（官方 RSS 与 RSSHub 路由），可在 Web GUI 设置 → 插件 →「RSS / 新闻聚合」中浏览搜索并一键添加订阅。用户询问今日新闻 / 值得读时，可提示稍后刷新或等待生成。'
  }
  if (digest.items.length === 0) {
    return `本机已安装 rss-digest 插件（RSS / 新闻聚合）。${digest.date} 的「今日值得读」已生成，但暂无新条目。`
  }
  const lines = [
    '本机已安装 rss-digest 插件（RSS / 新闻聚合）。以下是今天的「今日值得读」，用户询问时可直接引用：',
    '',
    `# 今日值得读 · ${digest.date}`,
    '',
    `> 来自 ${digest.items.length} 条精选条目。`,
    '',
  ]
  const byCategory = new Map<string, FeedItem[]>()
  for (const item of digest.items) {
    const key = item.category || '未分类'
    const list = byCategory.get(key) ?? []
    list.push(item)
    byCategory.set(key, list)
  }
  for (const [category, categoryItems] of byCategory) {
    lines.push(`## ${category}`)
    for (const item of categoryItems) {
      const title = item.title || '(无标题)'
      const source = item.source ? `（${item.source}）` : ''
      lines.push(`- ${item.link ? `[${title}](${item.link})` : title}${source}`)
    }
    lines.push('')
  }
  return lines.join('\n').trim()
}

/* ------------------------------------------------------------------ *
 * 插件本体
 * ------------------------------------------------------------------ */

export function apply(ctx: Context, config?: Config): void {
  if (config?.enabled === false) return
  const store = readRssStore(config)
  const announce = store.announceToAgent !== false
  const autoGenerateOnMount = store.autoGenerateOnMount !== false

  let latest: DigestResult | null = readLatestDigest(config)
  let systemPromptApi: { section(options: { name: string; order?: number; text: string }): () => void } | null = null
  let sectionDisposer: (() => void) | null = null

  const updateSystemPrompt = () => {
    if (!announce || systemPromptApi === null) return
    if (sectionDisposer !== null) {
      try {
        sectionDisposer()
      } catch {
        /* 释放失败不阻塞 */
      }
      sectionDisposer = null
    }
    const text = buildSystemPromptText(latest)
    if (!text) return
    try {
      sectionDisposer = systemPromptApi.section({ name: 'plugin:dsh-rss-digest', order: 160, text })
    } catch {
      sectionDisposer = null
    }
  }

  const refresh = async (force: boolean) => {
    try {
      latest = force ? await generateDigest(config) : await ensureTodayDigest(config)
      updateSystemPrompt()
    } catch (error) {
      ctx.logger('rss-digest').warn('generate digest failed: %s', error instanceof Error ? error.message : String(error))
    }
  }

  const routes = makeRoutes(config, (digest) => {
    latest = digest
    updateSystemPrompt()
  })
  ctx.inject(['webServer'], (webCtx: Context) => {
    webCtx.effect(() => {
      const server = (webCtx as unknown as { webServer: { register(route: { kind: string; path: string; handler: RouteHandler }): () => void } }).webServer
      const disposers = routes.map((route) => server.register(route))
      return () => {
        for (const dispose of disposers) {
          try {
            dispose()
          } catch {
            /* 释放失败不阻塞 */
          }
        }
      }
    }, 'dsh-rss-digest: routes')
  })

  // 注册 settings 命名空间：卡片 key 与命名空间同名，插件配置标签页才会派发它
  ctx.inject(['settings'], (settingsCtx: Context) => {
    const settings = (settingsCtx as unknown as { settings: { register(ns: string, schema: unknown): unknown } }).settings
    settings.register('rss-digest', RSS_SETTINGS_SCHEMA)
  })

  if (announce) {
    ctx.inject(['systemPrompt'], (promptCtx: Context) => {
      promptCtx.effect(() => {
        const systemPrompt = (promptCtx as unknown as { systemPrompt: { section(options: { name: string; order?: number; text: string }): () => void } }).systemPrompt
        systemPromptApi = systemPrompt
        updateSystemPrompt()
        return () => {
          systemPromptApi = null
          if (sectionDisposer !== null) {
            try {
              sectionDisposer()
            } catch {
              /* 忽略 */
            }
            sectionDisposer = null
          }
        }
      }, 'dsh-rss-digest: systemPrompt')
    })
  }

  ctx.effect(() => {
    const timer = setInterval(() => {
      const now = new Date()
      const hh = String(now.getHours()).padStart(2, '0')
      const mm = String(now.getMinutes()).padStart(2, '0')
      const currentDailyTime = readRssStore(config).dailyTime?.trim() || DEFAULT_DAILY_TIME
      if (`${hh}:${mm}` === currentDailyTime) {
        const file = digestPath(todayKey(), config)
        if (!existsSync(file)) {
          void refresh(true)
        }
      }
    }, 30_000)

    if (autoGenerateOnMount) {
      void refresh(false)
    }

    return () => clearInterval(timer)
  }, 'dsh-rss-digest: scheduler')

  console.log(`[dsh-rss-digest] mounted, digest dir: ${digestDir(config)}`)
}

const plugin = definePlugin<Config>({
  name,
  inject,
  apply,
})

export const { name: pluginName, inject: pluginInject, apply: pluginApply } = plugin
