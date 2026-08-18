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
  /** 是否向 agent 注入插件能力公告。默认开。 */
  announceToAgent?: boolean
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

const MAX_SCAN_SESSIONS = 200
let warnedSearchFallback = false

async function searchSessions(ctx: Context, rawQuery: string, limit: number, signal?: AbortSignal): Promise<SessionHit[]> {
  const query = rawQuery.trim()
  if (query === '') return []
  const sessionQuery = getService(ctx, 'sessionQuery') as SessionQueryLike | undefined
  if (sessionQuery === undefined) return []
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
      return await filterVisibleSessionHits(ctx, hits, signal)
    } catch (error) {
      // openAt: "never" 等场景会禁用全文索引；退化为逐会话扫描原始事件。
      // 这样即使 session search 被禁用，Prompt / MCP 搜索也不会被拖垮。
      if (!warnedSearchFallback) {
        warnedSearchFallback = true
        console.info('[dsh-global-search] session full-text search is disabled (openAt: "never"); falling back to per-session scan.')
      }
    }
  }
  hits = await searchSessionsByScan(sessionQuery, query, limit, signal)
  return await filterVisibleSessionHits(ctx, hits, signal)
}

async function searchSessionsByScan(sessionQuery: SessionQueryLike, query: string, limit: number, signal?: AbortSignal): Promise<SessionHit[]> {
  if (typeof sessionQuery.listSessions !== 'function' || typeof sessionQuery.filterEvents !== 'function') return []
  let records: Array<{ header: { id: string } }> = []
  try {
    records = await sessionQuery.listSessions(signal)
  } catch (error) {
    console.warn('[dsh-global-search] session list unavailable for fallback scan:', error instanceof Error ? error.message : String(error))
    return []
  }
  const hits: SessionHit[] = []
  let scanned = 0
  for (const record of records) {
    if (hits.length >= limit) break
    if (scanned >= MAX_SCAN_SESSIONS) break
    scanned += 1
    try {
      const docs = await sessionQuery.filterEvents(record.header.id, [
        { kind: 'text', text: query },
      ])
      const doc = docs.find((item) =>
        item.surface === 'current' && (item.type === 'user/message' || item.type === 'assistant/message'),
      ) ?? docs[0]
      if (doc === undefined) continue
      hits.push({
        id: record.header.id,
        snippet: makeSnippet(doc.text, query),
        time: doc.time,
      })
    } catch {
      // 单个会话读取失败不阻塞其它会话
    }
  }
  return hits
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
          writeJson(res, 200, { ok: true, query: '', sessions: [], prompts: [], tools: [] })
          return
        }
        try {
          const [sessions, prompts, tools] = await Promise.all([
            config.includeSessions !== false ? searchSessions(ctx, q, maxResults) : Promise.resolve([]),
            config.includePrompts !== false ? Promise.resolve(searchPrompts(q, maxResults)) : Promise.resolve([]),
            config.includeMcpTools !== false ? Promise.resolve(searchMcpTools(ctx, q, maxResults)) : Promise.resolve([]),
          ])
          writeJson(res, 200, { ok: true, query: q, sessions, prompts, tools })
        } catch (error) {
          writeJson(res, 500, { error: '搜索失败: ' + (error instanceof Error ? error.message : String(error)) })
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
