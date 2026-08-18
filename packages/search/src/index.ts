/**
 * @hyzyn/dsh-search — DSH Web GUI 的全局搜索插件（宿主半体）。
 *
 * 能力：
 * - 在 GUI 侧边栏提供「全局搜索」入口，弹窗内搜索历史会话、Prompt、MCP 工具。
 * - 历史会话走 @deepseek-ai/dsh-session-query 的 full-text search；
 *   Prompt 读取 ~/.dsh/prompts.yml 托管区块；MCP 工具从 ctx.tools.schemas()
 *   枚举 mcp__ 前缀工具。
 *
 * 浏览器半体（./client）通过 /api/dsh-search/query 查询；路由带 loopback-only
 * 信任围栏。
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { definePlugin } from '@hyzyn/dsh-kit'
import yaml from 'js-yaml'

export interface Config {
  /** 关闭整个插件（不注册路由、不注入 GUI）。默认开。 */
  enabled?: boolean
  /** 单类结果最大条数。默认 8。 */
  maxResults?: number
  /** 是否搜索历史会话。默认 true。 */
  includeSessions?: boolean
  /** 是否搜索 Prompt。默认 true。 */
  includePrompts?: boolean
  /** 是否搜索 MCP 工具。默认 true。 */
  includeMcpTools?: boolean
  /** 是否搜索设置面板（设置 → 插件 → 插件配置）。默认 true。 */
  includePanels?: boolean
  /** 是否向 agent 注入插件能力公告。默认开。 */
  announceToAgent?: boolean
  /** 会话回退扫描的最大会话数（宿主 FTS 不可用时的保护上限）。默认 80。 */
  maxScanSessions?: number
}

const dshHome = () => process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
const promptFilePath = () => process.env.DSH_PROMPT_FILE?.trim() || join(dshHome(), 'prompts.yml')

/* ------------------------------------------------------------------ *
 * Prompt 读取（与 dsh-prompt 共用同一托管文件，只读不改）
 * ------------------------------------------------------------------ */

interface PromptVersion {
  id: string
  label?: string
  note?: string
  content: string
  createdAt: string
}

interface Prompt {
  id: string
  name: string
  description?: string
  versions: PromptVersion[]
  activeVersionId: string | null
  ab: { enabled: boolean; aVersionId: string; bVersionId: string; aWeight: number }
  updatedAt: string
}

interface PromptStore {
  activePromptId: string | null
  prompts: Prompt[]
}

interface ManagedRead {
  store: PromptStore
  fileError?: string
  file: string
}

function emptyStore(): PromptStore {
  return { activePromptId: null, prompts: [] }
}

function readPromptStore(): ManagedRead {
  const file = promptFilePath()
  const existed = existsSync(file)
  const text = existed ? readFileSync(file, 'utf8') : ''
  const lines = text.split('\n')
  const start = lines.findIndex((line) => line.includes('dsh-prompt-manager managed'))
  const result: ManagedRead = { store: emptyStore(), file }
  if (start === -1) return result
  const end = lines.findIndex((line, index) => index > start && line.includes('end dsh-prompt-manager managed'))
  if (end === -1) {
    result.fileError = '托管区块缺少结束标记（# --- end dsh-prompt-manager managed ---）'
    return result
  }
  const block = lines.slice(start + 1, end).join('\n')
  if (block.trim() === '' || block.split('\n').every((line) => line.trim() === '' || line.trim().startsWith('#'))) return result
  try {
    const parsed = yaml.load(block) as Partial<PromptStore> | null
    if (typeof parsed !== 'object' || parsed === null) {
      result.fileError = '托管区块不是 YAML 对象'
      return result
    }
    const prompts = (Array.isArray(parsed.prompts) ? parsed.prompts : []).flatMap((item) => {
      if (typeof item !== 'object' || item === null) return []
      const raw = item as Partial<Prompt>
      const versions = Array.isArray(raw.versions) ? (raw.versions as PromptVersion[]) : []
      const rawAb = raw.ab as Partial<Prompt['ab']> | undefined
      return [{
        ...raw,
        versions,
        activeVersionId: typeof raw.activeVersionId === 'string' ? raw.activeVersionId : null,
        ab: {
          enabled: rawAb?.enabled === true,
          aVersionId: typeof rawAb?.aVersionId === 'string' ? rawAb.aVersionId : (versions[0]?.id ?? ''),
          bVersionId: typeof rawAb?.bVersionId === 'string' ? rawAb.bVersionId : (versions[versions.length - 1]?.id ?? ''),
          aWeight: typeof rawAb?.aWeight === 'number' ? rawAb.aWeight : 50,
        },
      } as Prompt]
    })
    result.store = {
      activePromptId: typeof parsed.activePromptId === 'string' ? parsed.activePromptId : null,
      prompts,
    }
  } catch (error) {
    result.fileError = '托管区块解析失败: ' + (error instanceof Error ? error.message : String(error))
  }
  return result
}

/* ------------------------------------------------------------------ *
 * 搜索逻辑
 * ------------------------------------------------------------------ */

function normalizeQuery(raw: string): string {
  return raw.trim().toLowerCase()
}

function includesText(haystack: string | undefined, query: string): boolean {
  if (!haystack) return false
  return haystack.toLowerCase().includes(query)
}

function makeSnippet(text: string, query: string, radius = 60): string {
  const lower = text.toLowerCase()
  const index = lower.indexOf(query)
  if (index === -1) return text.slice(0, radius * 2) + (text.length > radius * 2 ? '…' : '')
  const start = Math.max(0, index - radius)
  const end = Math.min(text.length, index + query.length + radius)
  return (start > 0 ? '…' : '') + text.slice(start, end).replace(/\s+/g, ' ').trim() + (end < text.length ? '…' : '')
}

interface PromptHit {
  id: string
  name: string
  description?: string
  snippet: string
  active: boolean
}

function searchPrompts(rawQuery: string, limit: number): PromptHit[] {
  const query = normalizeQuery(rawQuery)
  if (query === '') return []
  const managed = readPromptStore()
  const hits: PromptHit[] = []
  for (const prompt of managed.store.prompts) {
    if (hits.length >= limit) break
    const nameHit = includesText(prompt.name, query)
    const descriptionHit = includesText(prompt.description, query)
    const version = prompt.versions.find((item) =>
      includesText(item.content, query) || includesText(item.label, query) || includesText(item.note, query),
    )
    if (!nameHit && !descriptionHit && version === undefined) continue
    const snippet = version !== undefined
      ? makeSnippet(version.content, query)
      : (prompt.description ?? prompt.name)
    hits.push({
      id: prompt.id,
      name: prompt.name,
      ...(prompt.description !== undefined ? { description: prompt.description } : {}),
      snippet,
      active: prompt.id === managed.store.activePromptId,
    })
  }
  return hits
}

interface SessionHit {
  id: string
  snippet: string
  time: number
}

interface SessionQueryLike {
  searchSessions?(request: {
    query: string
    eventFilters?: unknown[]
    limit?: number
  }, exec?: { signal?: AbortSignal }): Promise<{ items?: Array<{ header?: { id?: string }; bestMatch?: { snippet?: string; time?: number } }> }>
  listSessions?(signal?: AbortSignal): Promise<Array<{ header: { id: string } }>>
  filterEvents?(sessionId: string, filters: unknown[]): Promise<Array<{ text: string; time: number; type?: string; surface?: string }>>
}

const MAX_SCAN_SESSIONS = 80
const SESSION_SCAN_CONCURRENCY = 4
const SCAN_TIMEOUT_MS = 5_000
const TEXT_CACHE_TTL_MS = 90_000
const TEXT_CACHE_MAX_BYTES = 192 * 1024 * 1024
const RESULT_CACHE_TTL_MS = 30_000
const RESULT_CACHE_MAX_ENTRIES = 64
let warnedSearchFallback = false

/* ------------------------------------------------------------------ *
 * 会话文档缓存（P0 优化：同一会话只解压一次，90s 内重复查询直接内存扫描）
 * ------------------------------------------------------------------ */

interface CachedSessionDocs {
  docs: Array<{ text: string; time: number; type?: string; surface?: string }>
  bytes: number
  at: number
}

const sessionDocCache = new Map<string, CachedSessionDocs>()
let sessionDocBytes = 0

function getCachedDocs(sessionId: string): CachedSessionDocs | undefined {
  const entry = sessionDocCache.get(sessionId)
  if (entry === undefined) return undefined
  if (Date.now() - entry.at > TEXT_CACHE_TTL_MS) {
    sessionDocCache.delete(sessionId)
    sessionDocBytes -= entry.bytes
    return undefined
  }
  return entry
}

function setCachedDocs(sessionId: string, entry: CachedSessionDocs): void {
  const previous = sessionDocCache.get(sessionId)
  if (previous !== undefined) sessionDocBytes -= previous.bytes
  sessionDocCache.set(sessionId, entry)
  sessionDocBytes += entry.bytes
  // LRU 淘汰：超出字节预算时从最旧条目起淘汰
  while (sessionDocBytes > TEXT_CACHE_MAX_BYTES && sessionDocCache.size > 1) {
    const oldestKey = sessionDocCache.keys().next().value as string | undefined
    if (oldestKey === undefined || oldestKey === sessionId) break
    const oldest = sessionDocCache.get(oldestKey)
    sessionDocCache.delete(oldestKey)
    if (oldest !== undefined) sessionDocBytes -= oldest.bytes
  }
}

/* ------------------------------------------------------------------ *
 * 结果缓存（P0 优化：相同查询串 30s 内直接复用）
 * ------------------------------------------------------------------ */

interface CachedSearchResult {
  hits: SessionHit[]
  at: number
}

const resultCache = new Map<string, CachedSearchResult>()

function getCachedResult(key: string): SessionHit[] | undefined {
  const entry = resultCache.get(key)
  if (entry === undefined) return undefined
  if (Date.now() - entry.at > RESULT_CACHE_TTL_MS) {
    resultCache.delete(key)
    return undefined
  }
  return entry.hits
}

function setCachedResult(key: string, hits: SessionHit[]): void {
  if (resultCache.size >= RESULT_CACHE_MAX_ENTRIES) {
    const oldestKey = resultCache.keys().next().value
    if (oldestKey !== undefined) resultCache.delete(oldestKey)
  }
  resultCache.set(key, { hits, at: Date.now() })
}

/**
 * 生成本地扫描的文本过滤器，语义与宿主 compileSessionTextFilter 对齐：
 * 大小写不敏感、空白弹性、正则元字符转义。
 */
function compileLocalTextFilter(query: string): RegExp {
  const pattern = query.trim().split(/\s+/u).map((part) => part.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')).join('\\s+')
  return new RegExp(pattern, 'iu')
}

async function searchSessions(ctx: Context, rawQuery: string, limit: number, signal?: AbortSignal, maxScanSessions = MAX_SCAN_SESSIONS): Promise<SessionHit[]> {
  const query = rawQuery.trim()
  if (query === '') return []
  // 1 字符查询（含 CJK 单字）命中面极小却要付出全量扫描成本，直接不搜会话
  if ([...query].length < 2) return []
  const sessionQuery = getService(ctx, 'sessionQuery') as SessionQueryLike | undefined
  if (sessionQuery === undefined) return []
  const cacheKey = query + '|' + limit
  const cached = getCachedResult(cacheKey)
  if (cached !== undefined) return filterVisibleSessionHits(ctx, cached, signal)
  let hits: SessionHit[] = []
  if (typeof sessionQuery.searchSessions === 'function') {
    try {
      const page = await sessionQuery.searchSessions({
        query,
        eventFilters: [
          { kind: 'type', values: ['user/message', 'assistant/message'] },
          { kind: 'surface', values: ['current'] },
        ],
        limit,
      }, { signal })
      hits = (page.items ?? []).slice(0, limit).flatMap((hit) => {
        const id = hit.header?.id
        if (!id) return []
        return [{
          id,
          snippet: hit.bestMatch?.snippet ?? '',
          time: hit.bestMatch?.time ?? 0,
        }]
      })
      const visible = await filterVisibleSessionHits(ctx, hits, signal)
      setCachedResult(cacheKey, visible)
      return visible
    } catch (error) {
      // openAt: "never" 等场景会禁用全文索引；退化为逐会话扫描原始事件。
      // 这样即使 session search 被禁用，Prompt / MCP 搜索也不会被拖垮。
      if (!warnedSearchFallback) {
        warnedSearchFallback = true
        console.info('[dsh-global-search] session full-text search is disabled (openAt: "never"); falling back to per-session scan.')
      }
    }
  }
  hits = await searchSessionsByScan(sessionQuery, query, limit, signal, maxScanSessions)
  const visible = await filterVisibleSessionHits(ctx, hits, signal)
  setCachedResult(cacheKey, visible)
  return visible
}

async function searchSessionsByScan(
  sessionQuery: SessionQueryLike,
  query: string,
  limit: number,
  signal?: AbortSignal,
  maxScanSessions = MAX_SCAN_SESSIONS,
): Promise<SessionHit[]> {
  if (typeof sessionQuery.listSessions !== 'function' || typeof sessionQuery.filterEvents !== 'function') return []
  let records: Array<{ header: { id: string } }> = []
  try {
    records = await sessionQuery.listSessions(signal)
  } catch (error) {
    console.warn('[dsh-global-search] session list unavailable for fallback scan:', error instanceof Error ? error.message : String(error))
    return []
  }
  const filter = compileLocalTextFilter(query)
  const sessions = records.slice(0, maxScanSessions)
  const collected: SessionHit[] = []

  const scanPromise = (async () => {
    let next = 0
    const workers = Array.from({ length: Math.min(SESSION_SCAN_CONCURRENCY, sessions.length) }, async () => {
      while (next < sessions.length && collected.length < limit) {
        if (signal?.aborted) return
        const index = next
        next += 1
        const hit = await scanOneSession(sessionQuery, sessions[index].header.id, filter, query)
        if (hit !== undefined) collected.push(hit)
      }
    })
    await Promise.all(workers)
  })()

  // 整体超时：返回已收集的部分结果，避免最坏情况长时间无响应；
  // 即使被切走，后台任务仍在为下一个查询填充会话缓存。
  await Promise.race([
    scanPromise,
    new Promise<void>((resolve) => {
      setTimeout(resolve, SCAN_TIMEOUT_MS)
    }),
  ])
  return collected.slice(0, limit)
}

/** 单会话扫描：优先使用缓存文档；未缓存则一次拉取全部文档并缓存（消除重复解压）。 */
async function scanOneSession(
  sessionQuery: SessionQueryLike,
  sessionId: string,
  filter: RegExp,
  query: string,
): Promise<SessionHit | undefined> {
  try {
    if (typeof sessionQuery.filterEvents !== 'function') return undefined
    let cached = getCachedDocs(sessionId)
    if (cached === undefined) {
      const docs = await sessionQuery.filterEvents(sessionId, [])
      let bytes = 0
      const docsOut = docs.map((doc) => {
        if (typeof doc.text === 'string') bytes += doc.text.length
        return {
          text: doc.text,
          time: doc.time,
          ...(doc.type !== undefined ? { type: doc.type } : {}),
          ...(doc.surface !== undefined ? { surface: doc.surface } : {}),
        }
      })
      cached = { docs: docsOut, bytes, at: Date.now() }
      setCachedDocs(sessionId, cached)
    }
    const doc = cached.docs.find((item) =>
      filter.test(item.text) && item.surface === 'current' && (item.type === 'user/message' || item.type === 'assistant/message'),
    ) ?? cached.docs.find((item) => filter.test(item.text))
    if (doc === undefined) return undefined
    return {
      id: sessionId,
      snippet: makeSnippet(doc.text, query),
      time: doc.time,
    }
  } catch {
    // 单个会话读取失败不阻塞其它会话
    return undefined
  }
}

async function getVisibleSessionIds(ctx: Context, signal?: AbortSignal): Promise<Set<string>> {
  const ids = new Set<string>()
  const sessions = getService(ctx, 'sessions') as { list?: () => Array<{ id: string }> } | undefined
  try {
    for (const session of sessions?.list?.() ?? []) ids.add(session.id)
  } catch {
    /* 忽略 live 列表读取失败 */
  }
  const persistence = getService(ctx, 'sessionPersistence') as {
    list?(signal?: AbortSignal): Promise<Array<{ id: string; cwd?: string }>>
  } | undefined
  if (persistence?.list !== undefined) {
    try {
      const cold = await persistence.list(signal)
      for (const meta of cold) {
        if (meta.cwd !== undefined) ids.add(meta.id)
      }
    } catch {
      /* 忽略持久化列表读取失败 */
    }
  }
  return ids
}

async function filterVisibleSessionHits(ctx: Context, hits: SessionHit[], signal?: AbortSignal): Promise<SessionHit[]> {
  const visible = await getVisibleSessionIds(ctx, signal)
  // 拿不到可见会话列表时不再返回可能无法跳转的会话，避免“能搜到但点不开”。
  if (visible.size === 0) return []
  return hits.filter((hit) => visible.has(hit.id))
}

interface McpToolHit {
  name: string
  description: string
}

function searchMcpTools(ctx: Context, rawQuery: string, limit: number): McpToolHit[] {
  const query = normalizeQuery(rawQuery)
  if (query === '') return []
  const tools = getService(ctx, 'tools') as {
    schemas?(scope?: unknown): Array<{ name: string; description?: string }>
  } | undefined
  if (tools?.schemas === undefined) return []
  const schemas = tools.schemas()
  const hits: McpToolHit[] = []
  for (const schema of schemas) {
    if (hits.length >= limit) break
    if (!schema.name.startsWith('mcp__')) continue
    if (!includesText(schema.name, query) && !includesText(schema.description, query)) continue
    hits.push({ name: schema.name, description: schema.description ?? '' })
  }
  return hits
}

/* ------------------------------------------------------------------ *
 * 设置面板搜索（设置 → 插件 → 插件配置 里的可配置卡片）
 * ------------------------------------------------------------------ */

interface PanelDefinition {
  id: string
  /** section: 设置窗口一级大类（导航级）；card: 插件配置卡片 */
  kind: 'section' | 'card'
  /** 标题（中英，按 openSettingsSection/openSettingsCard 的 titleTexts 匹配顺序） */
  titles: string[]
  /** 额外可搜索关键词（含标题别名） */
  keywords: string[]
  description: string
  /** 宿主插件的 registry name；为 undefined 表示随 DSH 内置、恒可用（官方大类/卡片） */
  registryName?: string
}

/** 内置设置面板目录：设置一级大类 + 官方面板 + dsh-plugin-kit 各插件面板。 */
const PANEL_DIRECTORY: PanelDefinition[] = [
  // 设置窗口一级大类（导航级）
  {
    id: 's-general',
    kind: 'section',
    titles: ['通用设置', 'General'],
    keywords: ['general', '通用', '设置', '常规', '基础'],
    description: '设置 → 通用设置：界面与工具通用选项',
  },
  {
    id: 's-models',
    kind: 'section',
    titles: ['模型', 'Models'],
    keywords: ['model', 'models', '模型', '提供商', 'provider', '推理'],
    description: '设置 → 模型：模型提供商与模型列表管理',
  },
  {
    id: 's-plugins',
    kind: 'section',
    titles: ['插件', 'Plugins'],
    keywords: ['plugin', 'plugins', '插件', '扩展'],
    description: '设置 → 插件：插件配置与插件清单',
  },
  {
    id: 's-agent-presets',
    kind: 'section',
    titles: ['Agent 预设', 'Agent presets'],
    keywords: ['agent', 'preset', '预设', 'agent preset', 'agentpresets'],
    description: '设置 → Agent 预设：预设方案与角色模板',
  },
  {
    id: 's-market',
    kind: 'section',
    titles: ['插件市场', 'Plugin Market'],
    keywords: ['market', 'marketplace', '插件市场', '市场', '商店', 'plugin market'],
    description: '设置 → 插件市场：发现与安装社区插件',
  },
  // 插件配置卡片（随 DSH 内置）
  {
    id: 'terminal',
    kind: 'card',
    titles: ['终端', 'Shell'],
    keywords: ['terminal', 'bash', '终端', 'shell', '命令行'],
    description: '终端 / Shell 行为设置',
  },
  {
    id: 'agent-loop',
    kind: 'card',
    titles: ['Agent 循环', 'Agent loop'],
    keywords: ['agent', 'loop', '循环', 'agent loop', 'agentloop'],
    description: 'Agent 循环设置',
  },
  {
    id: 'web-search',
    kind: 'card',
    titles: ['网页搜索', 'Web search'],
    keywords: ['web', 'search', '网页', '搜索', 'websearch'],
    description: '网页搜索设置',
  },
  {
    id: 'mcp-config',
    kind: 'card',
    titles: ['MCP 服务器配置', 'MCP Server Configuration'],
    keywords: ['mcp', 'server', '服务器', '配置', '工具', '工具集'],
    description: 'MCP 服务器配置：stdio 本地进程或 streamable-http 远程服务',
    registryName: 'mcp-config',
  },
  {
    id: 'prompt-manager',
    kind: 'card',
    titles: ['Prompt 管理', 'Prompt Management'],
    keywords: ['prompt', 'systemprompt', '提示词', '提示', 'prompts', 'system prompt'],
    description: 'Prompt 管理：systemPrompt 可视化编辑、版本管理与 A/B 测试',
    registryName: 'prompt-manager',
  },
  {
    id: 'env-manager',
    kind: 'card',
    titles: ['环境变量 / 密钥管理', 'Environment Variables / Secrets'],
    keywords: ['env', 'environment', '环境变量', '密钥', 'secret', 'secrets', '环境'],
    description: '环境变量 / 密钥管理：配置进程环境变量与敏感信息',
    registryName: 'env-manager',
  },
  {
    id: 'profile-manager',
    kind: 'card',
    titles: ['Profile 管理', 'Profile Management'],
    keywords: ['profile', 'profiles', '环境', '配置', '多环境', 'profile 管理'],
    description: 'Profile 管理：DSH profile 的创建、复制、重命名与删除',
    registryName: 'profile-manager',
  },
  {
    id: 'rss-digest',
    kind: 'card',
    titles: ['RSS / 新闻聚合', 'RSS / News Aggregation'],
    keywords: ['rss', 'news', '新闻', '聚合', 'digest', '今日值得读'],
    description: 'RSS / 新闻聚合：多源订阅与每日「今日值得读」自动摘要',
    registryName: 'rss-digest',
  },
  {
    id: 'codegraph',
    kind: 'card',
    titles: ['Codegraph 集成', 'Codegraph Integration'],
    keywords: ['codegraph', '代码图谱', '图谱', '索引', '调用链', '影响面', 'code graph'],
    description: 'Codegraph 集成：代码图谱索引、符号搜索与调用链分析',
    registryName: 'codegraph',
  },
]

function getLoadedRegistryNames(ctx: Context): Set<string> {
  const names = new Set<string>()
  try {
    const registry = (ctx as unknown as { registry?: { values?(): Iterable<{ name?: string }> } }).registry
    if (registry?.values !== undefined) {
      for (const runtime of registry.values()) {
        if (typeof runtime.name === 'string' && runtime.name !== '') names.add(runtime.name)
      }
    }
  } catch {
    /* registry 枚举失败不阻塞 */
  }
  return names
}

interface PanelHit {
  id: string
  /** section: 设置一级大类；card: 插件配置卡片 */
  kind: 'section' | 'card'
  name: string
  /** 标题（中英），供客户端 openSettingsSection/openSettingsCard 匹配 */
  titles: string[]
  description: string
  snippet: string
}

function searchPanels(ctx: Context, rawQuery: string, limit: number): PanelHit[] {
  const query = normalizeQuery(rawQuery)
  if (query === '') return []
  const loaded = getLoadedRegistryNames(ctx)
  const hits: PanelHit[] = []
  for (const panel of PANEL_DIRECTORY) {
    if (hits.length >= limit) break
    // 非官方条目：宿主插件未加载时跳过，避免搜到未安装的卡片
    if (panel.registryName !== undefined && !loaded.has(panel.registryName)) continue
    const searchable = [...panel.titles, ...panel.keywords, panel.description].map(normalizeQuery)
    const matched = searchable.some((text) => text.includes(query))
    if (!matched) continue
    hits.push({
      id: panel.id,
      kind: panel.kind,
      name: panel.titles[0],
      titles: panel.titles,
      description: panel.description,
      snippet: makeSnippet([...panel.titles, panel.description].join('，'), query),
    })
  }
  return hits
}

function getService(ctx: Context, name: string): unknown {
  const withGet = ctx as unknown as { get?: (service: string) => unknown }
  if (typeof withGet.get === 'function') {
    const value = withGet.get(name)
    if (value !== undefined) return value
  }
  return (ctx as unknown as Record<string, unknown>)[name]
}

/* ------------------------------------------------------------------ *
 * HTTP 路由（loopback-only 围栏）
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

type RouteHandler = (req: ReqLike, res: ResLike) => Promise<void>

function makeRoutes(ctx: Context, config: Config): Array<{ kind: 'exact'; path: string; handler: RouteHandler }> {
  const maxResults = Math.max(1, Math.min(50, config.maxResults ?? 8))
  return [
    {
      kind: 'exact',
      path: '/api/dsh-search/query',
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) {
          writeJson(res, 403, { error: 'forbidden: loopback-only' })
          return
        }
        if (req.method !== 'GET') {
          writeJson(res, 405, { error: 'method not allowed: ' + String(req.method) })
          return
        }
        let query = ''
        try {
          query = new URL('http://localhost' + (req.url ?? '/')).searchParams.get('q') ?? ''
        } catch {
          writeJson(res, 400, { error: 'invalid query string' })
          return
        }
        const q = query.trim()
        if (q === '') {
          writeJson(res, 200, { ok: true, query: '', sessions: [], prompts: [], tools: [], panels: [] })
          return
        }
        const controller = new AbortController()
        const reqEvents = req as unknown as {
          once(event: string, listener: () => void): void
          removeListener(event: string, listener: () => void): void
        }
        const onClose = () => controller.abort()
        reqEvents.once('close', onClose)
        try {
          const [sessions, prompts, tools, panels] = await Promise.all([
            config.includeSessions !== false ? searchSessions(ctx, q, maxResults, controller.signal, config.maxScanSessions) : Promise.resolve([]),
            config.includePrompts !== false ? Promise.resolve(searchPrompts(q, maxResults)) : Promise.resolve([]),
            config.includeMcpTools !== false ? Promise.resolve(searchMcpTools(ctx, q, maxResults)) : Promise.resolve([]),
            config.includePanels !== false ? Promise.resolve(searchPanels(ctx, q, maxResults)) : Promise.resolve([]),
          ])
          writeJson(res, 200, { ok: true, query: q, sessions, prompts, tools, panels })
        } catch (error) {
          writeJson(res, 500, { error: '搜索失败: ' + (error instanceof Error ? error.message : String(error)) })
        } finally {
          reqEvents.removeListener('close', onClose)
        }
      },
    },
  ]
}

/* ------------------------------------------------------------------ *
 * 插件本体
 * ------------------------------------------------------------------ */

const SEARCH_GUIDANCE = '本机已安装 dsh-search 插件（全局搜索）：Web GUI 侧边栏有「全局搜索」入口，可全文搜索历史会话。'

const plugin = definePlugin<Config>({
  name: 'global-search',
  inject: [],
  apply(ctx: Context, config?: Config) {
    if (config?.enabled === false) return
    const routes = makeRoutes(ctx, config ?? {})

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
      }, 'dsh-global-search: routes')
    })

    if (config?.announceToAgent !== false) {
      ctx.inject(['systemPrompt'], (promptCtx: Context) => {
        promptCtx.effect(() => {
          const systemPrompt = (promptCtx as unknown as { systemPrompt: { section(options: { name: string; order?: number; text: string }): () => void } }).systemPrompt
          return systemPrompt.section({ name: 'plugin:dsh-global-search', order: 170, text: SEARCH_GUIDANCE })
        }, 'dsh-global-search: announcement')
      })
    }

    console.log('[dsh-global-search] mounted, prompt file: ' + promptFilePath())
  },
})

export const { name, inject, apply } = plugin
