/**
 * @hyzyn/dsh-rss — DSH 的 RSS / 新闻聚合插件（宿主半体）。
 *
 * 能力：
 * - 订阅多个 RSS / Atom 源（默认内置几个中文科技 / 新闻源，也可通过 Config.sources 覆盖）；
 * - 每次抓取后按来源去重、截断，生成 Markdown 格式的「今日值得读」；
 * - 每天在可配置时间（默认 08:00）自动生成当天 digest；插件启动时若当天 digest
 *   尚未生成也会自动补生成；
 * - 把当天 digest 注入 systemPrompt，模型在用户问“今日值得读”时可以直接引用；
 * - 可选 AI 摘要：调用宿主 llm 服务为每条资讯生成一句话中文摘要（配置在设置卡片的
 *   「AI 摘要」区块，写 ~/.dsh/rss.json 的 ai 字段；失败时逐条回落到原文摘要）；
 * - 生成的 Markdown 存放在 ~/.dsh/rss-digest/YYYY-MM-DD.md（可用 DSH_RSS_DIGEST_DIR
 *   或 Config.digestDir 覆盖），并同时写一份 latest.json 便于外部读取。
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { definePlugin, getService, writeFileAtomic } from '@hyzyn/dsh-kit'
import {
  BUILTIN_CATALOG_NAME,
  getBuiltinCatalogEntries,
  getCatalogCategories,
  getCatalogSourceNames,
  getMergedCatalogEntries,
  searchCatalogEntries,
  catalogStatus,
  type CatalogSource,
} from './catalog.js'

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
  /** AI 生成的一句话中文摘要；未启用 / 失败 / 超出上限的条目不出现。 */
  aiSummary?: string
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

/** 本次 AI 摘要的执行情况，供 Markdown / latest.json / 客户端展示。 */
export interface AiSummaryInfo {
  /** 本次是否启用了 AI 摘要。 */
  enabled: boolean
  /** 实际使用的模型路由，形如 provider/model。 */
  route?: string
  /** 成功拿到摘要的条数（含缓存命中）。 */
  summarized: number
  /** 失败并回落到原文摘要的条数。 */
  failed: number
  /** 整体不可用（路由 / llm 服务缺失）或全部失败时的原因文案。 */
  reason?: string
  /**
   * 失败原因分布（按出现次数降序，最多 `AI_FAILURE_REASON_LIMIT` 类）。
   *
   * 为什么要有它：原先部分失败只留一个计数（「N 条失败，已回落到原文摘要」），
   * 既看不出是超时、限流还是 provider 报错，也没法判断是不是插件自己的问题 ——
   * 实测「20 条里 6 条成功」这种情况只能靠猜。
   */
  failures?: Array<{ error: string; count: number }>
}

/** `AiSummaryInfo.failures` 最多保留几类原因。 */
const AI_FAILURE_REASON_LIMIT = 3

export interface DigestResult {
  date: string
  file: string
  items: FeedItem[]
  errors: Array<{ source: string; error: string }>
  generatedAt: string
  /** 参与本次抓取的订阅源元信息（含官网地址），供 Web GUI「查看更多」使用。 */
  sources?: DigestSourceMeta[]
  /** 本次 AI 摘要的执行情况；store 里未启用 ai 时不出现。 */
  aiSummary?: AiSummaryInfo
}

export interface Config {
  /** composition 层开关：false 时插件不挂载（重启保持）。运行期开关在设置卡片（写 store，热生效）。默认开。 */
  enabled?: boolean
  /** 是否向 agent 注入插件能力与当天 digest 公告。默认开。 */
  announceToAgent?: boolean
  /** 是否提供精选订阅源目录（/api/dsh-rss/catalog，供 GUI 浏览搜索添加）。默认开。 */
  includeCatalog?: boolean
  /** 附加的 OPML 目录来源（可选多个），与内置 awesome-rsshub-routes 目录合并展示。 */
  catalogs?: CatalogSource[]
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

/**
 * AI 摘要配置（只走可编辑 store ~/.dsh/rss.json 的 ai 字段，Config 层不新增字段）。
 * provider / model 必须成对出现：都留空则跟随宿主默认模型。
 */
export interface AiStoreConfig {
  /** 是否启用 AI 摘要；默认 false。 */
  enabled: boolean
  /** 模型路由 provider；与 model 成对。 */
  provider?: string
  /** 模型路由 model；与 provider 成对。 */
  model?: string
  /** 单次 digest 最多摘要条数，默认 20，夹紧 1..50。 */
  maxItems?: number
  /** 并发请求数，默认 3，夹紧 1..6。 */
  concurrency?: number
  /** 单条请求超时毫秒数，默认 20000，夹紧 5000..60000。 */
  timeoutMs?: number
}

/** 解析后的模型路由。 */
export interface AiRoute {
  provider: string
  model: string
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
  type?: string
  text?: string
  /** finish 块的权威字段：判别式 `kind`（以及 `kind==='error'` 时的 `failure`）都在这里。 */
  reason?: {
    kind?: string
    failure?: { message?: string; code?: string }
  }
  [key: string]: unknown
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
    provider: string
    model: string
    system?: string
    messages: Array<{ role: 'user'; content: Array<{ type: 'text'; text: string }> }>
    maxTokens?: number
    temperature?: number
    signal?: AbortSignal
  }): AsyncIterable<LlmStreamChunk>
}

/* ------------------------------------------------------------------ *
 * settings 命名空间（让「设置 → 插件 → 插件配置」派发本插件卡片）
 * ------------------------------------------------------------------ */

/** 与 ~/.dsh/rss.json 的可编辑 store 形状对齐。 */
const RSS_SETTINGS_SCHEMA = z.object({
  enabled: z.boolean(),
  sources: z.array(z.object({
    name: z.string(),
    url: z.string(),
    category: z.string(),
    limit: z.natural(),
    builtin: z.string(),
  })).default([]),
  categories: z.array(z.string()).default([]),
  catalogs: z.array(z.object({
    name: z.string(),
    url: z.string(),
  })).default([]),
  maxItemsPerSource: z.natural(),
  maxTotalItems: z.natural(),
  dailyTime: z.string(),
  autoGenerateOnMount: z.boolean(),
  announceToAgent: z.boolean(),
  ai: z.object({
    enabled: z.boolean(),
    provider: z.string(),
    model: z.string(),
    maxItems: z.natural(),
    concurrency: z.natural(),
    timeoutMs: z.natural(),
  }),
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

const DEFAULT_AI_MAX_ITEMS = 20
const AI_MAX_ITEMS_MIN = 1
const AI_MAX_ITEMS_MAX = 50
const DEFAULT_AI_CONCURRENCY = 3
const AI_CONCURRENCY_MIN = 1
const AI_CONCURRENCY_MAX = 6
const DEFAULT_AI_TIMEOUT_MS = 20_000
const AI_TIMEOUT_MIN_MS = 5_000
const AI_TIMEOUT_MAX_MS = 60_000
/** 单条摘要请求的输入正文上限（字符）。 */
const AI_INPUT_TEXT_LIMIT = 1200
/**
 * 摘要请求的 maxTokens。
 *
 * 原先按「一句 60 字中文」估算成 200 —— 对**非推理模型**够用，对**推理模型**不够：
 * 推理 token 与最终答案**共享**这个预算，模型往往还没写出正文就把预算耗在推理上，
 * 于是 finish 是 `max-tokens`、本条摘要判失败。
 *
 * 真机实测（provider 路由 commandcode/deepseek/deepseek-v4.1-flash，20 条 / 并发 3 /
 * 超时 20s，每次先清空 ai-cache.json）：
 *
 *   maxTokens=200   →  7 条成功 / 13 条失败（全是 max-tokens）
 *   maxTokens=1024  → 12 条成功 /  8 条失败（仍全是 max-tokens）
 *   maxTokens=4096  → 20 条成功 /  0 条失败（整轮 48s，单条约 7s，仍在超时内）
 *
 * 所以 4096 是这个模型的实测拐点：既容得下推理开销，又不会把整轮拖过超时。
 * 换用更重的推理模型时若再出现 max-tokens，失败原因里会直接带上当前上限。
 */
const AI_SUMMARY_MAX_TOKENS = 4096
/** AI 缓存条目有效期：30 天。 */
const AI_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000
/** AI 缓存条目上限：超出按写入时间淘汰最旧。 */
const AI_CACHE_MAX_ENTRIES = 500
/** systemPrompt 里单条 AI 摘要的截断长度。 */
const AI_PROMPT_SUMMARY_LIMIT = 100

/** 宿主默认模型服务的 settings 命名空间（settings 兜底读取用）。 */
const AGENT_DEFAULT_MODEL_NAMESPACE = 'agent-default-model'

/** agentDefaultModel 服务的最小结构；source 是运行时私有字段，需判空后再调。 */
interface AgentDefaultModelLike {
  source?: () => unknown
  currentSelection?: () => unknown
}

/** settings 服务的最小结构。 */
interface SettingsLike {
  get?: (ns: string) => unknown
}

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

/** 可编辑 store（~/.dsh/rss.json）的形状；GET/POST /config 交换的就是它。 */
export interface RssStore {
  /** 插件启用开关（设置卡片可改，写回 store；关闭即热生效）。默认开。 */
  enabled?: boolean
  sources: Source[]
  categories: string[]
  catalogs: CatalogSource[]
  maxItemsPerSource?: number
  maxTotalItems?: number
  dailyTime?: string
  autoGenerateOnMount?: boolean
  announceToAgent?: boolean
  /** AI 摘要配置；缺省表示未配置（默认关闭）。 */
  ai?: AiStoreConfig
  updatedAt?: string
}

function rssConfigPath(): string {
  return process.env.DSH_RSS_CONFIG_FILE?.trim() || join(dshHome(), 'rss.json')
}

/** 夹紧整数配置：非有限数字返回 undefined（交给默认值），否则四舍五入后夹到 [min, max]。 */
function clampAiInt(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.min(max, Math.max(min, Math.round(value)))
}

/**
 * 归一化 store 里的 ai 配置：provider / model 必须成对出现（都空 = 跟随宿主默认
 * 模型），只填一个则整体忽略并给出告警；maxItems / concurrency / timeoutMs 缺省
 * 填默认值、越界夹紧。readRssStore 与 validateRssStoreInput 共用，保证两条读路径一致。
 */
export function sanitizeAiConfig(raw: unknown): { ai?: AiStoreConfig; warning?: string } {
  if (raw === undefined || raw === null) return {}
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { warning: 'ai 必须是对象，已忽略 AI 摘要配置' }
  }
  const input = raw as Record<string, unknown>
  const provider = typeof input.provider === 'string' ? input.provider.trim() : ''
  const model = typeof input.model === 'string' ? input.model.trim() : ''
  if ((provider === '') !== (model === '')) {
    return { warning: 'ai.provider 与 ai.model 需要成对填写（都留空则跟随宿主默认模型），已忽略 AI 摘要配置' }
  }
  const warnings: string[] = []
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') {
    warnings.push('ai.enabled 必须是布尔值，已按 false 处理')
  }
  const ai: AiStoreConfig = {
    enabled: input.enabled === true,
    ...(provider !== '' ? { provider, model } : {}),
    maxItems: clampAiInt(input.maxItems, AI_MAX_ITEMS_MIN, AI_MAX_ITEMS_MAX) ?? DEFAULT_AI_MAX_ITEMS,
    concurrency: clampAiInt(input.concurrency, AI_CONCURRENCY_MIN, AI_CONCURRENCY_MAX) ?? DEFAULT_AI_CONCURRENCY,
    timeoutMs: clampAiInt(input.timeoutMs, AI_TIMEOUT_MIN_MS, AI_TIMEOUT_MAX_MS) ?? DEFAULT_AI_TIMEOUT_MS,
  }
  return { ai, ...(warnings.length > 0 ? { warning: warnings.join('；') } : {}) }
}

function defaultRssStore(config?: Config): RssStore {
  return {
    enabled: config?.enabled,
    sources: Array.isArray(config?.sources) && config.sources.length > 0 ? config.sources : defaultSources(),
    categories: Array.isArray(config?.categories) ? config.categories.filter((item): item is string => typeof item === 'string' && item.trim() !== '') : [],
    catalogs: Array.isArray(config?.catalogs) ? config.catalogs.filter((item): item is CatalogSource => typeof item === 'object' && item !== null && typeof item.name === 'string' && item.name.trim() !== '' && typeof item.url === 'string' && item.url.trim() !== '') : [],
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
    // 非法 / 不成对的 ai 配置在这里静默丢弃，运行时按「未启用」处理
    const parsedAi = sanitizeAiConfig(parsed.ai).ai
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : base.enabled,
      sources: Array.isArray(parsed.sources) ? parsed.sources : base.sources,
      categories: Array.isArray(parsed.categories) ? parsed.categories : base.categories,
      catalogs: Array.isArray(parsed.catalogs)
        ? parsed.catalogs.filter((item): item is CatalogSource => typeof item === 'object' && item !== null && typeof item.name === 'string' && item.name.trim() !== '' && typeof item.url === 'string' && item.url.trim() !== '')
        : base.catalogs,
      maxItemsPerSource: typeof parsed.maxItemsPerSource === 'number' ? parsed.maxItemsPerSource : base.maxItemsPerSource,
      maxTotalItems: typeof parsed.maxTotalItems === 'number' ? parsed.maxTotalItems : base.maxTotalItems,
      dailyTime: typeof parsed.dailyTime === 'string' && parsed.dailyTime.trim() ? parsed.dailyTime : base.dailyTime,
      autoGenerateOnMount: typeof parsed.autoGenerateOnMount === 'boolean' ? parsed.autoGenerateOnMount : base.autoGenerateOnMount,
      announceToAgent: typeof parsed.announceToAgent === 'boolean' ? parsed.announceToAgent : base.announceToAgent,
      ...(parsedAi !== undefined ? { ai: parsedAi } : {}),
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

/**
 * 校验卡片提交的 store 输入（白名单）：返回归一化后的 RssStore 与告警列表。
 * error 会拒绝保存；warnings 不影响保存（例如 ai 不成对被整体忽略），仅回传说明。
 */
export function validateRssStoreInput(raw: unknown): { store?: RssStore; error?: string; warnings?: string[] } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { error: '配置必须是对象' }
  }
  const input = raw as Record<string, unknown>
  // 白名单外的 ai 字段在下面单独归一化；不成对 / 非法值时整体忽略并进入告警
  const warnings: string[] = []
  const sanitizedAi = input.ai !== undefined ? sanitizeAiConfig(input.ai) : {}
  if (sanitizedAi.warning !== undefined) warnings.push(sanitizedAi.warning)

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
  const enabled = typeof input.enabled === 'boolean' ? input.enabled : undefined

  let catalogs: CatalogSource[] | undefined
  if (input.catalogs !== undefined) {
    if (!Array.isArray(input.catalogs)) return { error: 'catalogs 必须是数组' }
    const result: CatalogSource[] = []
    for (const item of input.catalogs) {
      if (typeof item !== 'object' || item === null) return { error: '每个目录来源必须是对象' }
      const catalog = item as Record<string, unknown>
      const name = typeof catalog.name === 'string' ? catalog.name.trim() : ''
      const url = typeof catalog.url === 'string' ? catalog.url.trim() : ''
      if (!name) return { error: '目录来源名称不能为空' }
      if (!url) return { error: '目录来源 URL 不能为空' }
      try {
        new URL(url)
      } catch {
        return { error: '目录来源 URL 不合法: ' + url }
      }
      result.push({ name, url })
    }
    catalogs = result
  }

  return {
    store: {
      ...(enabled !== undefined ? { enabled } : {}),
      sources: sources ?? [],
      categories,
      catalogs: catalogs ?? [],
      ...(maxItemsPerSource !== undefined ? { maxItemsPerSource } : {}),
      ...(maxTotalItems !== undefined ? { maxTotalItems } : {}),
      ...(dailyTime !== undefined ? { dailyTime } : {}),
      ...(autoGenerateOnMount !== undefined ? { autoGenerateOnMount } : {}),
      ...(announceToAgent !== undefined ? { announceToAgent } : {}),
      ...(sanitizedAi.ai !== undefined ? { ai: sanitizedAi.ai } : {}),
    },
    ...(warnings.length > 0 ? { warnings } : {}),
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
 * AI 摘要（宿主 llm 服务 + digestDir/ai-cache.json 缓存）
 * ------------------------------------------------------------------ */

/** ai-cache.json 里的单条缓存：text 为清洗后的摘要，at 为写入时间戳（毫秒）。 */
export interface AiCacheEntry {
  text: string
  model: string
  at: number
}

interface AiCacheFile {
  version: 1
  entries: Record<string, AiCacheEntry>
}

/** AI 缓存文件路径：与 digest 同目录，随 digestDir 迁移。 */
export function aiCachePath(dir: string): string {
  return join(dir, 'ai-cache.json')
}

/** 缓存 key：与去重 key 同源（link || id || title，trim + 小写）的 sha1 十六进制。 */
export function aiCacheKey(item: Pick<FeedItem, 'link' | 'id' | 'title'>): string {
  const raw = (item.link || item.id || item.title || '').trim().toLowerCase()
  return createHash('sha1').update(raw).digest('hex')
}

/** 缓存条目是否在 30 天有效期内（结构与时间戳一并校验）。 */
export function isAiCacheEntryFresh(entry: AiCacheEntry | undefined, now = Date.now()): entry is AiCacheEntry {
  if (entry === undefined) return false
  if (typeof entry.text !== 'string' || entry.text.trim() === '') return false
  if (typeof entry.at !== 'number' || !Number.isFinite(entry.at)) return false
  return now - entry.at < AI_CACHE_TTL_MS
}

/** 淘汰过期条目，并在超过上限时按 at 保留最新的 max 条（LRU 淘汰最旧）。 */
export function pruneAiCacheEntries(
  entries: Record<string, AiCacheEntry>,
  now = Date.now(),
  max = AI_CACHE_MAX_ENTRIES,
): Record<string, AiCacheEntry> {
  const fresh = Object.entries(entries).filter(([, entry]) => isAiCacheEntryFresh(entry, now))
  if (fresh.length <= max) return Object.fromEntries(fresh)
  fresh.sort((a, b) => a[1].at - b[1].at)
  return Object.fromEntries(fresh.slice(fresh.length - max))
}

/** 读取 AI 缓存；文件缺失 / 损坏 / 版本不符时返回空表，过期条目顺手过滤。 */
export function readAiCache(dir: string, now = Date.now()): Record<string, AiCacheEntry> {
  const file = aiCachePath(dir)
  if (!existsSync(file)) return {}
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<AiCacheFile>
    if (parsed.version !== 1 || typeof parsed.entries !== 'object' || parsed.entries === null) return {}
    const entries: Record<string, AiCacheEntry> = {}
    for (const [key, value] of Object.entries(parsed.entries)) {
      if (typeof value !== 'object' || value === null) continue
      const entry = value as Partial<AiCacheEntry>
      if (typeof entry.text !== 'string' || typeof entry.at !== 'number') continue
      entries[key] = { text: entry.text, model: typeof entry.model === 'string' ? entry.model : '', at: entry.at }
    }
    return pruneAiCacheEntries(entries, now)
  } catch {
    return {}
  }
}

/** 原子写回 AI 缓存（先淘汰过期 / 超限条目）。写失败由调用方兜底，不影响 digest 生成。 */
export function writeAiCache(dir: string, entries: Record<string, AiCacheEntry>, now = Date.now()): void {
  const payload: AiCacheFile = { version: 1, entries: pruneAiCacheEntries(entries, now) }
  mkdirSync(dir, { recursive: true })
  writeFileAtomic(aiCachePath(dir), JSON.stringify(payload, null, 2))
}

const AI_SUMMARY_SYSTEM_PROMPT = [
  '你是资讯摘要助手。请用一句中文概括给定 JSON 中的资讯，供读者在聚合列表中快速浏览。',
  '要求：不超过 60 字；不复述标题；保留关键实体（人名、公司、产品）与数字；只输出摘要正文，使用纯文本，不要 Markdown、不要引号、不要前缀或解释。',
].join('\n')

/** 构造单条摘要请求：system 为固定指令，user 用 JSON 框架（正文截断 1200 字）避免破坏结构。 */
export function buildAiSummaryMessages(item: FeedItem): { system: string; user: string } {
  return {
    system: AI_SUMMARY_SYSTEM_PROMPT,
    user: JSON.stringify({
      title: item.title,
      source: item.source,
      category: item.category ?? '',
      text: (item.summary ?? '').slice(0, AI_INPUT_TEXT_LIMIT),
    }),
  }
}

/** 清洗模型输出：trim、去包裹引号、去 Markdown 加粗 / 列表前缀，换行压成空格；空串表示失败。 */
export function cleanAiSummary(raw: string): string {
  const lines = raw
    .split(/\r?\n/)
    .map((line) =>
      line
        .trim()
        .replace(/^["'“”‘’「」《》]+/, '')
        .replace(/^[-*+•]\s+/, '')
        .replace(/^\d+[.、)]\s*/, '')
        .replace(/^#+\s*/, '')
        .replace(/\*\*/g, '')
        .trim(),
    )
    .filter((line) => line !== '')
  const joined = lines.join(' ').replace(/\s+/g, ' ').trim()
  return joined.replace(/^["'“”‘’「」《》]+/, '').replace(/["'“”‘’「」《》]+$/, '').trim()
}

/** 从任意值里取 provider/model 对；不完整返回 null。 */
function pickRoute(value: unknown): AiRoute | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as { provider?: unknown; model?: unknown }
  const provider = typeof record.provider === 'string' ? record.provider.trim() : ''
  const model = typeof record.model === 'string' ? record.model.trim() : ''
  return provider !== '' && model !== '' ? { provider, model } : null
}

/**
 * 解析模型路由：显式配置对 > 宿主默认模型（agentDefaultModel.source()，
 * 兼容 currentSelection()）> settings 服务的 agent-default-model 命名空间；
 * 全拿不到返回 null（本次生成跳过 AI 摘要）。
 */
export function resolveAiRoute(ctx: Context | undefined, ai?: AiStoreConfig): AiRoute | null {
  const provider = ai?.provider?.trim()
  const model = ai?.model?.trim()
  if (provider && model) return { provider, model }
  if (ctx === undefined) return null

  try {
    const defaultModel = getService(ctx, 'agentDefaultModel') as AgentDefaultModelLike | undefined
    if (defaultModel !== undefined && defaultModel !== null) {
      const read = typeof defaultModel.source === 'function'
        ? defaultModel.source
        : typeof defaultModel.currentSelection === 'function'
          ? defaultModel.currentSelection
          : undefined
      if (read !== undefined) {
        const picked = pickRoute(read.call(defaultModel))
        if (picked !== null) return picked
      }
    }

    const settings = getService(ctx, 'settings') as SettingsLike | undefined
    if (settings !== undefined && settings !== null && typeof settings.get === 'function') {
      const picked = pickRoute(settings.get(AGENT_DEFAULT_MODEL_NAMESPACE))
      if (picked !== null) return picked
    }
  } catch {
    /* 服务异常 / 命名空间未注册（get 抛 TypeError）：当作解析不到，本次跳过 AI 摘要 */
  }
  return null
}

/**
 * 调用宿主 llm 服务生成一条摘要。
 * 一次性调用模式：流式收集 text-delta，直到 finish；超时用 AbortController + setTimeout。
 * finish.kind 不是 stop（error / aborted / max-tokens / tool-calls）、缺终止块、
 * 输出清洗后为空都算失败。
 */
export async function callAiSummary(
  llm: LlmRuntimeLike,
  route: AiRoute,
  item: FeedItem,
  timeoutMs: number,
): Promise<string> {
  const { system, user } = buildAiSummaryMessages(item)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let text = ''
  let finishKind: string | undefined
  let finishMessage: string | undefined
  try {
    for await (const chunk of llm.stream({
      provider: route.provider,
      model: route.model,
      system,
      // content 必须是 ContentBlock[]（字符串会在下游 .some(...) 上炸）
      messages: [{ role: 'user', content: [{ type: 'text', text: user }] }],
      maxTokens: AI_SUMMARY_MAX_TOKENS,
      temperature: 0.3,
      signal: controller.signal,
    })) {
      if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
        text += chunk.text
      } else if (chunk.type === 'finish') {
        // kind / failure 在 reason 里面（顶层没有这两个字段，读错了会把每次成功都判成 unknown）
        const reason = chunk.reason
        finishKind = typeof reason?.kind === 'string' ? reason.kind : 'unknown'
        finishMessage = reason?.failure?.message
      }
    }
  } catch (error) {
    // 主动 abort 视作超时；其余错误原样抛出
    if (controller.signal.aborted) throw new Error(`请求超时（${timeoutMs}ms）`)
    throw error instanceof Error ? error : new Error(String(error))
  } finally {
    clearTimeout(timer)
  }
  if (finishKind === undefined) throw new Error('模型未返回终止标记')
  if (finishKind !== 'stop') {
    // max-tokens 最容易被误读成「provider 有问题」：它的常见根因是预算被推理 token 吃掉，
    // 所以把「该调什么」直接写进原因里，而不是只丢一个词。
    if (finishKind === 'max-tokens') {
      throw new Error(`终止原因 max-tokens（输出被 maxTokens=${String(AI_SUMMARY_MAX_TOKENS)} 截断；推理模型会先消耗推理 token，可提高上限）`)
    }
    throw new Error(finishMessage !== undefined ? `${finishKind}: ${finishMessage}` : `终止原因 ${finishKind}`)
  }
  // （finishKind === 'unknown' 只可能来自「finish 块没带 reason.kind」——此时上面那条会抛出）
  const cleaned = cleanAiSummary(text)
  if (!cleaned) throw new Error('模型返回空摘要')
  return cleaned
}

/**
 * 对截断后的条目做 AI 摘要：
 * 1) 解析路由与 llm 服务，缺失则整体跳过并把原因记进 DigestResult；
 * 2) 读 ai-cache.json，命中且未过期直接用（不再请求）；
 * 3) 未命中的前 maxItems 条按 concurrency 并发请求，单条失败只回落该条；
 * 4) 新增缓存原子写回（LRU 上限 500）。
 */
async function summarizeItems(
  items: FeedItem[],
  ai: AiStoreConfig,
  ctx: Context | undefined,
  config?: Config,
): Promise<{ items: FeedItem[]; info: AiSummaryInfo }> {
  const route = resolveAiRoute(ctx, ai)
  if (route === null) {
    return {
      items,
      info: { enabled: true, summarized: 0, failed: 0, reason: '未解析到可用模型（可填写 provider/model，或先配置宿主默认模型）' },
    }
  }
  const routeText = `${route.provider}/${route.model}`
  const llm = ctx !== undefined ? (getService(ctx, 'llm') as LlmRuntimeLike | undefined) : undefined
  if (llm === undefined || llm === null || typeof llm.stream !== 'function') {
    return { items, info: { enabled: true, route: routeText, summarized: 0, failed: 0, reason: '宿主 llm 服务不可用' } }
  }

  const maxItems = clampAiInt(ai.maxItems, AI_MAX_ITEMS_MIN, AI_MAX_ITEMS_MAX) ?? DEFAULT_AI_MAX_ITEMS
  const concurrency = clampAiInt(ai.concurrency, AI_CONCURRENCY_MIN, AI_CONCURRENCY_MAX) ?? DEFAULT_AI_CONCURRENCY
  const timeoutMs = clampAiInt(ai.timeoutMs, AI_TIMEOUT_MIN_MS, AI_TIMEOUT_MAX_MS) ?? DEFAULT_AI_TIMEOUT_MS

  const dir = digestDir(config)
  const cache = readAiCache(dir)
  const result = items.map((item) => ({ ...item }))
  let summarized = 0
  const pending: Array<{ item: FeedItem; key: string }> = []
  for (const item of result.slice(0, maxItems)) {
    const key = aiCacheKey(item)
    const cached = cache[key]
    if (isAiCacheEntryFresh(cached)) {
      item.aiSummary = cached.text
      summarized += 1
      continue
    }
    pending.push({ item, key })
  }

  let failed = 0
  let firstError = ''
  const failureCounts = new Map<string, number>()
  const queue = pending.slice()
  const workerCount = Math.min(concurrency, queue.length)
  const workers = Array.from({ length: workerCount }, async () => {
    while (queue.length > 0) {
      const task = queue.shift()
      if (task === undefined) return
      try {
        const text = await callAiSummary(llm, route, task.item, timeoutMs)
        task.item.aiSummary = text
        cache[task.key] = { text, model: route.model, at: Date.now() }
        summarized += 1
      } catch (error) {
        failed += 1
        const message = error instanceof Error ? error.message : String(error)
        if (firstError === '') firstError = message
        failureCounts.set(message, (failureCounts.get(message) ?? 0) + 1)
      }
    }
  })
  await Promise.all(workers)

  if (pending.length > 0) {
    try {
      writeAiCache(dir, cache)
    } catch (error) {
      console.warn('[dsh-rss-digest] 写入 AI 摘要缓存失败: %s', error instanceof Error ? error.message : String(error))
    }
  }

  const info: AiSummaryInfo = { enabled: true, route: routeText, summarized, failed }
  if (failed > 0) {
    info.failures = [...failureCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, AI_FAILURE_REASON_LIMIT)
      .map(([error, count]) => ({ error, count }))
  }
  // 全部失败（无缓存命中、也无成功请求）时把首个错误原因带进 DigestResult
  if (failed > 0 && summarized === 0) info.reason = `全部 ${failed} 条失败：${firstError}`
  return { items: result, info }
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

export function renderDigestMarkdown(
  items: FeedItem[],
  date: string,
  errors: DigestResult['errors'],
  sourceCount: number,
  aiSummary?: AiSummaryInfo,
): string {
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
      // 有 AI 摘要优先用（本身已是一句话）；否则回落到原文摘要的 140 字截断
      if (item.aiSummary) {
        lines.push(`  ${item.aiSummary}`)
      } else if (item.summary) {
        const summary = item.summary.length > 140 ? `${item.summary.slice(0, 140)}…` : item.summary
        lines.push(`  ${summary}`)
      }
    }
    lines.push('')
  }

  // AI 摘要整体不可用或部分失败时，沿用「抓取失败」小节的列表格式补一行说明
  // 失败原因分布：部分失败时原先只有计数、原因全丢，用户与排查者都无从下手
  const aiFailureDetail = (aiSummary?.failures ?? []).map((row) => `${row.error}×${String(row.count)}`).join('；')
  const aiNote = aiSummary?.reason !== undefined
    ? `- AI 摘要: ${aiSummary.reason}${aiFailureDetail === '' ? '' : `（${aiFailureDetail}）`}`
    : aiSummary !== undefined && aiSummary.failed > 0
      ? `- AI 摘要: ${String(aiSummary.failed)} 条失败，已回落到原文摘要${aiFailureDetail === '' ? '' : `（原因：${aiFailureDetail}）`}`
      : undefined
  if (errors.length > 0 || aiNote !== undefined) {
    lines.push('## 抓取失败', '')
    for (const error of errors) {
      lines.push(`- ${error.source}: ${error.error}`)
    }
    if (aiNote !== undefined) lines.push(aiNote)
    lines.push('')
  }

  return lines.join('\n').trim() + '\n'
}

/** generateDigest 的运行时依赖：宿主 Context（AI 摘要用它解析 llm / 默认模型服务）。 */
export interface DigestRuntime {
  ctx?: Context
}

/**
 * 抓取所有订阅源并生成当天 digest。返回生成的摘要信息。
 * 即使部分源失败，也会把成功抓到的内容写成 digest。
 * store 启用 ai 时，在去重 / 排序 / 截断之后、渲染之前为条目补 AI 摘要。
 */
export async function generateDigest(config: Config = {}, runtime: DigestRuntime = {}): Promise<DigestResult> {
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

  const store = readRssStore(config)
  const maxTotal = store.maxTotalItems ?? DEFAULT_MAX_TOTAL_ITEMS
  const selected = unique.slice(0, maxTotal)

  // AI 摘要：只对最终入选的条目做，超出 maxItems 的部分保持原文摘要
  let outputItems = selected
  let aiSummary: AiSummaryInfo | undefined
  if (store.ai?.enabled === true && selected.length > 0) {
    const outcome = await summarizeItems(selected, store.ai, runtime.ctx, config)
    outputItems = outcome.items
    aiSummary = outcome.info
  }

  const date = todayKey()
  const file = digestPath(date, config)
  const generatedAt = new Date().toISOString()
  const markdown = renderDigestMarkdown(outputItems, date, errors, sources.length, aiSummary)

  mkdirSync(digestDir(config), { recursive: true })
  writeFileSync(file, markdown, 'utf8')
  writeFileSync(latestJsonPath(config), JSON.stringify({
    date,
    file,
    items: outputItems,
    errors,
    generatedAt,
    sources: sourcesMeta,
    ...(aiSummary !== undefined ? { aiSummary } : {}),
  }, null, 2), 'utf8')

  return { date, file, items: outputItems, errors, generatedAt, sources: sourcesMeta, ...(aiSummary !== undefined ? { aiSummary } : {}) }
}

/** 如果当天 digest 已存在则直接返回，否则重新抓取生成。 */
export async function ensureTodayDigest(config: Config = {}, runtime: DigestRuntime = {}): Promise<DigestResult> {
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
  return generateDigest(config, runtime)
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

function makeRoutes(
  config?: Config,
  onDigestChanged?: (digest: DigestResult) => void,
  /** 禁用闸门与配置保存回调：disabled 供数据路由短路（/config 例外），onStoreSaved 在保存成功后触发热应用。 */
  hooks?: { disabled: () => boolean; onStoreSaved: () => void },
  /** AI 摘要所需的宿主 Context（/refresh 触发的生成要用）。 */
  runtime: DigestRuntime = {},
): Array<{ kind: 'exact'; path: string; handler: RouteHandler }> {
  const disabledGuard = (res: ResLike): boolean => {
    if (hooks?.disabled() !== true) return false
    writeJson(res, 403, { error: '插件已禁用（设置 → 插件 → RSS / 新闻聚合 → 启用插件）' })
    return true
  }
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
        if (disabledGuard(res)) return
        writeJson(res, 200, { ok: true, ...digestPayload() })
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-rss/refresh',
      handler: async (req, res) => {
        if (!guard(req, res, 'POST')) return
        if (disabledGuard(res)) return
        try {
          const digest = await generateDigest(config, runtime)
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
        // 告警不影响保存（例如 ai 字段不成对被整体忽略），只在响应里回传并记日志
        if (validated.warnings !== undefined && validated.warnings.length > 0) {
          console.warn('[dsh-rss-digest] config warnings: %s', validated.warnings.join('；'))
        }
        // 自定义渠道保存前真实抓取一次（只校验新增的：存量渠道当初添加时已校验过，
        // 全量重验会让任一外部源抽风就卡死整个保存——包括启用开关本身）
        const previousStore = readRssStore(config)
        const customSources = validated.store.sources.filter((source) =>
          resolveBuiltin(source) === undefined && !previousStore.sources.some((existing) => existing.url === source.url))
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
        // 保存成功即热应用：enabled / announceToAgent 的开关变化立刻生效
        hooks?.onStoreSaved()
        writeJson(res, 200, {
          ok: true,
          config: readRssStore(config),
          builtins: BUILTIN_CHANNELS,
          file: rssConfigPath(),
          ...(validated.warnings !== undefined && validated.warnings.length > 0 ? { warnings: validated.warnings } : {}),
        })
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-rss/sources',
      handler: async (req, res) => {
        if (!guard(req, res, 'GET')) return
        if (disabledGuard(res)) return
        writeJson(res, 200, { ok: true, sources: normalizeSources(config), digestDir: digestDir(config) })
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-rss/catalog',
      handler: async (req, res) => {
        if (!guard(req, res, 'GET')) return
        if (disabledGuard(res)) return
        const includeCatalog = config?.includeCatalog !== false
        if (!includeCatalog) {
          writeJson(res, 200, { ok: true, total: 0, categories: [], sources: [], entries: [], catalogs: [], builtin: null, disabled: true })
          return
        }
        let query = ''
        let category: string | undefined
        let source: string | undefined
        try {
          const params = new URL('http://localhost' + (req.url ?? '/')).searchParams
          query = params.get('q') ?? ''
          const rawCategory = params.get('category')
          category = rawCategory !== null && rawCategory.trim() !== '' ? rawCategory.trim() : undefined
          const rawSource = params.get('source')
          source = rawSource !== null && rawSource.trim() !== '' ? rawSource.trim() : undefined
        } catch {
          writeJson(res, 400, { error: 'invalid query string' })
          return
        }
        const store = readRssStore(config)
        const catalogs = store.catalogs ?? []
        const merged = getMergedCatalogEntries(catalogs, true)
        const categories = getCatalogCategories(merged)
        const sourceNames = getCatalogSourceNames(merged)
        const entries = searchCatalogEntries(merged, query, 100, category, source)
        const statuses = catalogs.map((catalog) => catalogStatus(catalog))
        writeJson(res, 200, {
          ok: true,
          total: entries.length,
          categories,
          sources: sourceNames,
          entries,
          catalogs: statuses,
          builtin: {
            name: BUILTIN_CATALOG_NAME,
            entryCount: getBuiltinCatalogEntries().length,
            enabled: true,
          },
          disabled: false,
        })
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
      // 有 AI 摘要时附在条目行尾部（≤100 字符），让模型可以直接引用
      const ai = item.aiSummary
        ? ` —— ${item.aiSummary.length > AI_PROMPT_SUMMARY_LIMIT ? `${item.aiSummary.slice(0, AI_PROMPT_SUMMARY_LIMIT)}…` : item.aiSummary}`
        : ''
      lines.push(`- ${item.link ? `[${title}](${item.link})` : title}${source}${ai}`)
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
  const autoGenerateOnMount = store.autoGenerateOnMount !== false
  // enabled / announce 都是热状态：卡片保存（POST /config → onStoreSaved）即刻生效
  let enabled = store.enabled !== false
  let announce = store.announceToAgent !== false

  let latest: DigestResult | null = readLatestDigest(config)
  let systemPromptApi: { section(options: { name: string; order?: number; text: string }): () => void } | null = null
  let sectionDisposer: (() => void) | null = null
  // AI 摘要要经宿主 Context 解析 llm / 默认模型服务
  const runtime: DigestRuntime = { ctx }

  const updateSystemPrompt = () => {
    // 先撤旧 section 再按开关决定是否重挂：禁用或关闭公告时这里就是「撤下」路径
    if (sectionDisposer !== null) {
      try {
        sectionDisposer()
      } catch {
        /* 释放失败不阻塞 */
      }
      sectionDisposer = null
    }
    if (!enabled || !announce || systemPromptApi === null) return
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
      latest = force ? await generateDigest(config, runtime) : await ensureTodayDigest(config, runtime)
      updateSystemPrompt()
    } catch (error) {
      ctx.logger('rss-digest').warn('generate digest failed: %s', error instanceof Error ? error.message : String(error))
    }
  }

  const routes = makeRoutes(config, (digest) => {
    latest = digest
    updateSystemPrompt()
  }, {
    disabled: () => !enabled,
    onStoreSaved: () => {
      const saved = readRssStore(config)
      enabled = saved.enabled !== false
      announce = saved.announceToAgent !== false
      updateSystemPrompt()
      console.log(`[dsh-rss-digest] config applied (enabled=${String(enabled)}, announceToAgent=${String(announce)})`)
    },
  }, runtime)
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
      // 禁用态整个调度停摆：不生成、不抓取（store 保存即时翻转 enabled，无需重建定时器）
      if (!enabled) return
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

    if (autoGenerateOnMount && enabled) {
      void refresh(false)
    }

    return () => clearInterval(timer)
  }, 'dsh-rss-digest: scheduler')

  console.log(`[dsh-rss-digest] mounted (enabled=${String(enabled)}, announceToAgent=${String(announce)}, dailyTime=${store.dailyTime?.trim() || DEFAULT_DAILY_TIME}), digest dir: ${digestDir(config)}`)
}

const plugin = definePlugin<Config>({
  name,
  inject,
  apply,
})

export const { name: pluginName, inject: pluginInject, apply: pluginApply } = plugin
