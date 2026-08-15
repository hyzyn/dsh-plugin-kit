/**
 * @dsh-kit/prompt — DSH Web GUI 的 Prompt 管理插件（宿主半体）。
 *
 * 能力：
 * - 可视化编辑 systemPrompt：在设置 → 插件 的「Prompt 管理」卡片中维护多个
 *   Prompt，每个 Prompt 包含多份版本内容。
 * - 版本管理：保存为新版本、回滚/切换激活版本、查看版本列表与说明。
 * - A/B 测试：为同一个 Prompt 配置 A/B 两个版本与流量比例；启用后宿主按比例
 *   随机选择一个版本注入 systemPrompt（当前命中版本可通过 /active 查看）。
 * - 导出/分享：导出 JSON / Markdown，支持 JSON 导入。
 *
 * 配置保存在 ~/.dsh/prompts.yml（可用 DSH_PROMPT_FILE 覆盖）的托管区块中。
 * 浏览器半体（./client）通过 /api/dsh-prompt/* 路由读写；路由带 loopback-only
 * 信任围栏。
 */
import { chmodSync, existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import yaml from 'js-yaml'

export const name = 'prompt-manager'
export const inject: string[] = []

export interface Config {
  /** 关闭整个插件（不注册路由、不发布提示）。默认开。 */
  enabled?: boolean
  /** 是否向 agent 注入插件能力公告。默认开。 */
  announceToAgent?: boolean
  /** 是否把启用的 Prompt 注入 systemPrompt。默认开。 */
  applyToSystemPrompt?: boolean
}

/* ------------------------------------------------------------------ *
 * 常量与类型
 * ------------------------------------------------------------------ */

const MARK_START = '# --- dsh-prompt-manager managed (auto-generated; do not edit) ---'
const MARK_END = '# --- end dsh-prompt-manager managed ---'
const PROMPT_ID_RE = /^p-[A-Za-z0-9-]{1,64}$/
const VERSION_ID_RE = /^v-[A-Za-z0-9-]{1,64}$/
const MAX_NAME_LENGTH = 80
const MAX_CONTENT_LENGTH = 500_000
const MAX_JSON_BODY_BYTES = 2 * 1024 * 1024
const EXPORT_SCHEMA = 'dsh-prompt'
const EXPORT_VERSION = 1

const dshHome = () => process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
const promptFilePath = () => process.env.DSH_PROMPT_FILE?.trim() || join(dshHome(), 'prompts.yml')

interface PromptVersion {
  id: string
  label?: string
  note?: string
  content: string
  createdAt: string
}

interface AbTest {
  enabled: boolean
  aVersionId: string
  bVersionId: string
  aWeight: number
}

interface Prompt {
  id: string
  name: string
  description?: string
  versions: PromptVersion[]
  activeVersionId: string | null
  ab: AbTest
  updatedAt: string
}

interface PromptStore {
  activePromptId: string | null
  prompts: Prompt[]
}

/* ------------------------------------------------------------------ *
 * ID / 时间
 * ------------------------------------------------------------------ */

function newId(prefix: 'p' | 'v'): string {
  return `${prefix}-${randomUUID().replace(/-/g, '').slice(0, 16)}`
}

function nowIso(): string {
  return new Date().toISOString()
}

/* ------------------------------------------------------------------ *
 * 托管区块读写（~/.dsh/prompts.yml）
 * ------------------------------------------------------------------ */

interface ManagedRead {
  store: PromptStore
  fileError?: string
  file: string
}

function emptyStore(): PromptStore {
  return { activePromptId: null, prompts: [] }
}

function readManagedStore(): ManagedRead {
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
      const rawAb = raw.ab as Partial<AbTest> | undefined
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

/** 生成托管区块文本（不含首尾标记行）。 */
function renderManagedBlock(store: PromptStore): string {
  return yaml.dump(store, { lineWidth: -1, noRefs: true, noArrayIndent: false })
}

/** 把托管区块写回 prompts 文件（原子替换，保留文件其它内容与权限）。 */
function writeManagedStore(store: PromptStore): void {
  const file = promptFilePath()
  const existed = existsSync(file)
  const mode = existed ? (statSync(file).mode & 0o777) : 0o600
  const text = existed ? readFileSync(file, 'utf8') : '# dsh prompt manager file\n'
  const lines = text.split('\n')
  const start = lines.findIndex((line) => line.includes('dsh-prompt-manager managed'))
  const end = start === -1 ? -1 : lines.findIndex((line, index) => index > start && line.includes('end dsh-prompt-manager managed'))
  const block = MARK_START + '\n' + renderManagedBlock(store) + MARK_END + '\n'
  let next: string
  if (start === -1) {
    next = text.replace(/\s*$/, '') + (text.trim() === '' ? '' : '\n') + '\n' + block
  } else if (end === -1) {
    next = lines.slice(0, start).join('\n') + '\n' + block
  } else {
    next = [...lines.slice(0, start), ...block.split('\n'), ...lines.slice(end + 1)].join('\n')
  }
  const tmp = join(dirname(file), '.prompts.yml.' + process.pid + '.tmp')
  writeFileSync(tmp, next, { mode })
  renameSync(tmp, file)
  if (!existed || (mode & 0o077) !== 0) chmodSync(file, mode)
}

/* ------------------------------------------------------------------ *
 * 校验
 * ------------------------------------------------------------------ */

interface ValidationResult {
  store?: PromptStore
  prompt?: Prompt
  error?: string
}

function validatePromptInput(raw: unknown, existing?: Prompt): { prompt?: Prompt; error?: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { error: 'prompt 必须是对象' }
  }
  const input = raw as Record<string, unknown>

  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (name === '') return { error: 'name 不能为空' }
  if (name.length > MAX_NAME_LENGTH) return { error: 'name 不能超过 ' + MAX_NAME_LENGTH + ' 字符' }
  const description = typeof input.description === 'string' && input.description.trim() !== '' ? input.description : undefined

  const rawVersions = Array.isArray(input.versions) ? input.versions : []
  if (rawVersions.length === 0) return { error: '至少需要一个版本' }
  const versions: PromptVersion[] = []
  const seenVersionIds = new Set<string>()
  for (const rawVersion of rawVersions) {
    if (typeof rawVersion !== 'object' || rawVersion === null) return { error: '每个版本必须是对象' }
    const versionInput = rawVersion as Record<string, unknown>
    let versionId = typeof versionInput.id === 'string' ? versionInput.id.trim() : ''
    if (versionId === '') versionId = newId('v')
    if (!VERSION_ID_RE.test(versionId)) return { error: '非法版本 id: ' + JSON.stringify(versionId) }
    if (seenVersionIds.has(versionId)) return { error: '重复的版本 id: ' + versionId }
    seenVersionIds.add(versionId)
    const content = typeof versionInput.content === 'string' ? versionInput.content : ''
    if (content.length > MAX_CONTENT_LENGTH) return { error: '版本内容不能超过 ' + MAX_CONTENT_LENGTH + ' 字符' }
    const label = typeof versionInput.label === 'string' && versionInput.label.trim() !== '' ? versionInput.label.trim() : undefined
    const note = typeof versionInput.note === 'string' && versionInput.note.trim() !== '' ? versionInput.note.trim() : undefined
    const createdAt = typeof versionInput.createdAt === 'string' && !Number.isNaN(Date.parse(versionInput.createdAt))
      ? versionInput.createdAt
      : nowIso()
    versions.push({
      id: versionId,
      content,
      ...(label !== undefined ? { label } : {}),
      ...(note !== undefined ? { note } : {}),
      createdAt,
    })
  }

  const activeVersionId = typeof input.activeVersionId === 'string' && input.activeVersionId !== ''
    ? input.activeVersionId
    : null
  if (activeVersionId !== null && !versions.some((version) => version.id === activeVersionId)) {
    return { error: 'activeVersionId 不存在: ' + activeVersionId }
  }

  let ab: AbTest
  if (input.ab === undefined || input.ab === null) {
    ab = { enabled: false, aVersionId: versions[0].id, bVersionId: versions[versions.length - 1].id, aWeight: 50 }
  } else {
    if (typeof input.ab !== 'object' || Array.isArray(input.ab)) return { error: 'ab 必须是对象' }
    const rawAb = input.ab as Record<string, unknown>
    const enabled = rawAb.enabled === true
    const aVersionId = typeof rawAb.aVersionId === 'string' && rawAb.aVersionId !== '' ? rawAb.aVersionId : versions[0].id
    const bVersionId = typeof rawAb.bVersionId === 'string' && rawAb.bVersionId !== '' ? rawAb.bVersionId : versions[versions.length - 1].id
    const aWeight = typeof rawAb.aWeight === 'number' ? Math.round(rawAb.aWeight) : 50
    if (!versions.some((version) => version.id === aVersionId)) return { error: 'A/B 的 A 版本不存在: ' + aVersionId }
    if (!versions.some((version) => version.id === bVersionId)) return { error: 'A/B 的 B 版本不存在: ' + bVersionId }
    if (enabled && aVersionId === bVersionId) return { error: 'A/B 两个版本不能相同' }
    if (!Number.isInteger(aWeight) || aWeight < 0 || aWeight > 100) return { error: 'aWeight 必须是 0~100 的整数' }
    ab = { enabled, aVersionId, bVersionId, aWeight }
  }

  let id = typeof input.id === 'string' ? input.id.trim() : ''
  if (id === '') id = existing?.id ?? newId('p')
  if (!PROMPT_ID_RE.test(id)) return { error: '非法 prompt id: ' + JSON.stringify(id) }
  if (existing !== undefined && existing.id !== id) return { error: '不能修改 prompt id' }

  return {
    prompt: {
      id,
      name,
      ...(description !== undefined ? { description } : {}),
      versions,
      activeVersionId,
      ab,
      updatedAt: nowIso(),
    },
  }
}

function validateImportPayload(raw: unknown): { store?: PromptStore; error?: string } {
  if (typeof raw !== 'object' || raw === null) return { error: '导入数据必须是对象' }
  const input = raw as Record<string, unknown>
  const rawPrompts = Array.isArray(input.prompts) ? input.prompts : Array.isArray(input.prompt) ? input.prompt : input.prompt !== undefined ? [input.prompt] : []
  if (rawPrompts.length === 0) return { error: '导入数据里没有 prompts' }
  const prompts: Prompt[] = []
  const seenIds = new Set<string>()
  for (const rawPrompt of rawPrompts) {
    const validated = validatePromptInput(rawPrompt)
    if (validated.error !== undefined || validated.prompt === undefined) {
      return { error: validated.error ?? '导入失败' }
    }
    if (seenIds.has(validated.prompt.id)) return { error: '导入数据里重复的 prompt id: ' + validated.prompt.id }
    seenIds.add(validated.prompt.id)
    prompts.push(validated.prompt)
  }
  const activePromptId = typeof input.activePromptId === 'string' && prompts.some((prompt) => prompt.id === input.activePromptId)
    ? input.activePromptId
    : null
  return { store: { activePromptId, prompts } }
}

/* ------------------------------------------------------------------ *
 * systemPrompt 注入
 * ------------------------------------------------------------------ */

interface ActiveText {
  promptId: string | null
  variantId: string | null
  text: string
  ab: { enabled: boolean; aVersionId: string; bVersionId: string; aWeight: number } | null
}

function resolveActiveText(store: PromptStore): ActiveText {
  const empty: ActiveText = { promptId: null, variantId: null, text: '', ab: null }
  const prompt = store.prompts.find((item) => item.id === store.activePromptId)
  if (prompt === undefined) return empty
  const versions = prompt.versions
  if (versions.length === 0) return empty
  if (prompt.ab.enabled) {
    const a = versions.find((version) => version.id === prompt.ab.aVersionId)
    const b = versions.find((version) => version.id === prompt.ab.bVersionId)
    if (a !== undefined && b !== undefined) {
      const weight = Math.max(0, Math.min(100, prompt.ab.aWeight))
      const chosen = Math.random() * 100 < weight ? a : b
      return {
        promptId: prompt.id,
        variantId: chosen.id,
        text: chosen.content,
        ab: { enabled: true, aVersionId: a.id, bVersionId: b.id, aWeight: weight },
      }
    }
  }
  const active = versions.find((version) => version.id === prompt.activeVersionId) ?? versions[0]
  return {
    promptId: prompt.id,
    variantId: active.id,
    text: active.content,
    ab: null,
  }
}

function buildSystemPromptText(store: PromptStore): string {
  return resolveActiveText(store).text
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

async function readJsonBody(req: ReqLike & AsyncIterable<Uint8Array>): Promise<Record<string, unknown> | undefined> {
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for await (const chunk of req) {
      size += chunk.length
      if (size > MAX_JSON_BODY_BYTES) return undefined
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

type RouteHandler = (req: ReqLike & AsyncIterable<Uint8Array>, res: ResLike) => Promise<void>


function makeRoutes(
  ctx: Context,
  onChanged: () => void,
): Array<{ kind: 'exact'; path: string; handler: RouteHandler }> {
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

  const storeDto = (store: PromptStore) => ({
    activePromptId: store.activePromptId,
    prompts: store.prompts,
    file: promptFilePath(),
  })

  return [
    {
      kind: 'exact',
      path: '/api/dsh-prompt/list',
      handler: async (req, res) => {
        if (!guard(req, res, 'GET')) return
        const managed = readManagedStore()
        writeJson(res, 200, {
          ok: true,
          ...(managed.fileError !== undefined ? { fileError: managed.fileError } : {}),
          ...storeDto(managed.store),
        })
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-prompt/save',
      handler: async (req, res) => {
        if (!guard(req, res, 'POST')) return
        const body = await readJsonBody(req)
        if (body === undefined) {
          writeJson(res, 400, { error: 'invalid JSON body' })
          return
        }
        const managed = readManagedStore()
        const existing = typeof body.prompt === 'object' && body.prompt !== null
          ? managed.store.prompts.find((prompt) => prompt.id === (body.prompt as Record<string, unknown>).id)
          : undefined
        const validated = validatePromptInput(body.prompt, existing)
        if (validated.error !== undefined || validated.prompt === undefined) {
          writeJson(res, 400, { error: validated.error ?? '校验失败' })
          return
        }
        const nextStore: PromptStore = {
          activePromptId: managed.store.activePromptId,
          prompts: managed.store.prompts.map((prompt) => prompt.id === validated.prompt!.id ? validated.prompt! : prompt),
        }
        if (!nextStore.prompts.some((prompt) => prompt.id === validated.prompt!.id)) {
          nextStore.prompts = [...nextStore.prompts, validated.prompt!]
          if (nextStore.activePromptId === null) nextStore.activePromptId = validated.prompt!.id
        }
        try {
          writeManagedStore(nextStore)
        } catch (error) {
          writeJson(res, 500, { error: '写入 prompts 文件失败: ' + (error instanceof Error ? error.message : String(error)) })
          return
        }
        onChanged()
        const after = readManagedStore()
        writeJson(res, 200, { ok: true, ...storeDto(after.store), ...(after.fileError !== undefined ? { fileError: after.fileError } : {}) })
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-prompt/activate',
      handler: async (req, res) => {
        if (!guard(req, res, 'POST')) return
        const body = await readJsonBody(req)
        if (body === undefined) {
          writeJson(res, 400, { error: 'invalid JSON body' })
          return
        }
        const promptId = typeof body.promptId === 'string' ? body.promptId : ''
        const versionId = typeof body.versionId === 'string' ? body.versionId : undefined
        const managed = readManagedStore()
        if (promptId === '') {
          const nextStore: PromptStore = { ...managed.store, activePromptId: null }
          try {
            writeManagedStore(nextStore)
          } catch (error) {
            writeJson(res, 500, { error: '写入 prompts 文件失败: ' + (error instanceof Error ? error.message : String(error)) })
            return
          }
          onChanged()
          const after = readManagedStore()
          writeJson(res, 200, { ok: true, ...storeDto(after.store), ...(after.fileError !== undefined ? { fileError: after.fileError } : {}) })
          return
        }
        const prompt = managed.store.prompts.find((item) => item.id === promptId)
        if (prompt === undefined) {
          writeJson(res, 400, { error: 'prompt 不存在: ' + promptId })
          return
        }
        const nextPrompt: Prompt = { ...prompt }
        if (versionId !== undefined) {
          if (!nextPrompt.versions.some((version) => version.id === versionId)) {
            writeJson(res, 400, { error: '版本不存在: ' + versionId })
            return
          }
          nextPrompt.activeVersionId = versionId
          nextPrompt.ab = { ...nextPrompt.ab, enabled: false }
        }
        nextPrompt.updatedAt = nowIso()
        const nextStore: PromptStore = {
          activePromptId: promptId,
          prompts: managed.store.prompts.map((item) => item.id === promptId ? nextPrompt : item),
        }
        try {
          writeManagedStore(nextStore)
        } catch (error) {
          writeJson(res, 500, { error: '写入 prompts 文件失败: ' + (error instanceof Error ? error.message : String(error)) })
          return
        }
        onChanged()
        const after = readManagedStore()
        writeJson(res, 200, { ok: true, ...storeDto(after.store), ...(after.fileError !== undefined ? { fileError: after.fileError } : {}) })
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-prompt/abtest',
      handler: async (req, res) => {
        if (!guard(req, res, 'POST')) return
        const body = await readJsonBody(req)
        if (body === undefined) {
          writeJson(res, 400, { error: 'invalid JSON body' })
          return
        }
        const promptId = typeof body.promptId === 'string' ? body.promptId : ''
        const managed = readManagedStore()
        const prompt = managed.store.prompts.find((item) => item.id === promptId)
        if (prompt === undefined) {
          writeJson(res, 400, { error: 'prompt 不存在: ' + promptId })
          return
        }
        const aVersionId = typeof body.aVersionId === 'string' ? body.aVersionId : ''
        const bVersionId = typeof body.bVersionId === 'string' ? body.bVersionId : ''
        if (!prompt.versions.some((version) => version.id === aVersionId)) {
          writeJson(res, 400, { error: 'A 版本不存在: ' + aVersionId })
          return
        }
        if (!prompt.versions.some((version) => version.id === bVersionId)) {
          writeJson(res, 400, { error: 'B 版本不存在: ' + bVersionId })
          return
        }
        if (body.enabled === true && aVersionId === bVersionId) {
          writeJson(res, 400, { error: 'A/B 两个版本不能相同' })
          return
        }
        const aWeight = typeof body.aWeight === 'number' ? Math.round(body.aWeight) : 50
        if (!Number.isInteger(aWeight) || aWeight < 0 || aWeight > 100) {
          writeJson(res, 400, { error: 'aWeight 必须是 0~100 的整数' })
          return
        }
        const enabled = body.enabled === true
        const nextPrompt: Prompt = {
          ...prompt,
          ab: { enabled, aVersionId, bVersionId, aWeight },
          updatedAt: nowIso(),
        }
        const nextStore: PromptStore = {
          activePromptId: enabled ? promptId : managed.store.activePromptId,
          prompts: managed.store.prompts.map((item) => item.id === promptId ? nextPrompt : item),
        }
        try {
          writeManagedStore(nextStore)
        } catch (error) {
          writeJson(res, 500, { error: '写入 prompts 文件失败: ' + (error instanceof Error ? error.message : String(error)) })
          return
        }
        onChanged()
        const after = readManagedStore()
        writeJson(res, 200, { ok: true, ...storeDto(after.store), ...(after.fileError !== undefined ? { fileError: after.fileError } : {}) })
      },
    },

    {
      kind: 'exact',
      path: '/api/dsh-prompt/delete',
      handler: async (req, res) => {
        if (!guard(req, res, 'POST')) return
        const body = await readJsonBody(req)
        if (body === undefined) {
          writeJson(res, 400, { error: 'invalid JSON body' })
          return
        }
        const promptId = typeof body.promptId === 'string' ? body.promptId : ''
        const managed = readManagedStore()
        if (!managed.store.prompts.some((prompt) => prompt.id === promptId)) {
          writeJson(res, 400, { error: 'prompt 不存在: ' + promptId })
          return
        }
        const nextStore: PromptStore = {
          activePromptId: managed.store.activePromptId === promptId ? null : managed.store.activePromptId,
          prompts: managed.store.prompts.filter((prompt) => prompt.id !== promptId),
        }
        try {
          writeManagedStore(nextStore)
        } catch (error) {
          writeJson(res, 500, { error: '写入 prompts 文件失败: ' + (error instanceof Error ? error.message : String(error)) })
          return
        }
        onChanged()
        const after = readManagedStore()
        writeJson(res, 200, { ok: true, ...storeDto(after.store), ...(after.fileError !== undefined ? { fileError: after.fileError } : {}) })
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-prompt/active',
      handler: async (req, res) => {
        if (!guard(req, res, 'GET')) return
        const managed = readManagedStore()
        const active = resolveActiveText(managed.store)
        writeJson(res, 200, { ok: true, ...active })
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-prompt/export',
      handler: async (req, res) => {
        if (!guard(req, res, 'GET')) return
        const managed = readManagedStore()
        const url = req.url ?? ''
        const query = new URL('http://localhost' + url).searchParams
        const promptId = query.get('promptId')
        const format = query.get('format') ?? 'json'
        let prompts = managed.store.prompts
        if (promptId !== null && promptId !== '') {
          prompts = prompts.filter((prompt) => prompt.id === promptId)
        }
        if (format === 'markdown') {
          const lines: string[] = []
          for (const prompt of prompts) {
            lines.push('# ' + prompt.name)
            if (prompt.description) lines.push('', prompt.description)
            lines.push('')
            for (const version of prompt.versions) {
              lines.push('## ' + (version.label ?? version.id) + (version.id === prompt.activeVersionId ? '（当前激活）' : ''))
              if (version.note) lines.push('', '> ' + version.note)
              lines.push('', version.content, '')
            }
          }
          const body = lines.join('\n')
          res.writeHead(200, { 'content-type': 'text/markdown; charset=utf-8', 'content-disposition': 'attachment; filename="dsh-prompts.md"' })
          res.end(body)
          return
        }
        const payload = {
          schema: EXPORT_SCHEMA,
          version: EXPORT_VERSION,
          exportedAt: nowIso(),
          activePromptId: managed.store.activePromptId,
          prompts,
        }
        writeJson(res, 200, { ok: true, data: payload })
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-prompt/import',
      handler: async (req, res) => {
        if (!guard(req, res, 'POST')) return
        const body = await readJsonBody(req)
        if (body === undefined) {
          writeJson(res, 400, { error: 'invalid JSON body' })
          return
        }
        const payload = body.data ?? body
        const validated = validateImportPayload(payload)
        if (validated.error !== undefined || validated.store === undefined) {
          writeJson(res, 400, { error: validated.error ?? '导入数据无效' })
          return
        }
        const managed = readManagedStore()
        const imported = validated.store
        const byId = new Map(managed.store.prompts.map((prompt) => [prompt.id, prompt]))
        for (const prompt of imported.prompts) byId.set(prompt.id, prompt)
        const nextStore: PromptStore = {
          activePromptId: imported.activePromptId ?? managed.store.activePromptId,
          prompts: [...byId.values()],
        }
        try {
          writeManagedStore(nextStore)
        } catch (error) {
          writeJson(res, 500, { error: '写入 prompts 文件失败: ' + (error instanceof Error ? error.message : String(error)) })
          return
        }
        onChanged()
        const after = readManagedStore()
        writeJson(res, 200, { ok: true, imported: imported.prompts.length, ...storeDto(after.store), ...(after.fileError !== undefined ? { fileError: after.fileError } : {}) })
      },
    },
  ]
}

/* ------------------------------------------------------------------ *
 * 插件本体
 * ------------------------------------------------------------------ */

const PROMPT_GUIDANCE = '本机已安装 dsh-prompt-manager 插件（Prompt 管理）：Web GUI 的 设置 → 插件 里有「Prompt 管理」卡片，提供 systemPrompt 的可视化编辑、版本管理、A/B 测试、导出/分享。配置保存在 ~/.dsh/prompts.yml 的托管区块（auto-generated，勿手改）。启用某个 Prompt 后，其内容会作为 systemPrompt section 注入；A/B 测试开启时按比例随机命中 A/B 版本。用户提到「Prompt / systemPrompt / 提示词」时即指本插件，请引导用户打开设置里的 Prompt 卡片操作，而不是直接修改配置文件。'

export function apply(ctx: Context, config?: Config): void {
  if (config?.enabled === false) return
  const announce = config?.announceToAgent !== false
  const applyToSystemPrompt = config?.applyToSystemPrompt !== false

  let systemPromptApi: { section(options: { name: string; order?: number; text: string }): () => void } | null = null
  let sectionDisposer: (() => void) | null = null
  let announcementDisposer: (() => void) | null = null

  const refreshSystemPrompt = () => {
    if (!applyToSystemPrompt || systemPromptApi === null) return
    if (sectionDisposer !== null) {
      try {
        sectionDisposer()
      } catch {
        /* 释放失败不阻塞 */
      }
      sectionDisposer = null
    }
    const text = buildSystemPromptText(readManagedStore().store)
    if (text === '') return
    try {
      sectionDisposer = systemPromptApi.section({ name: 'plugin:dsh-prompt-manager', order: 140, text })
    } catch {
      sectionDisposer = null
    }
  }

  const routes = makeRoutes(ctx, refreshSystemPrompt)

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
    }, 'dsh-prompt-manager: routes')
  })

  if (announce || applyToSystemPrompt) {
    ctx.inject(['systemPrompt'], (promptCtx: Context) => {
      promptCtx.effect(() => {
        const systemPrompt = (promptCtx as unknown as { systemPrompt: { section(options: { name: string; order?: number; text: string }): () => void } }).systemPrompt
        systemPromptApi = systemPrompt
        if (announce) {
          try {
            announcementDisposer = systemPrompt.section({ name: 'plugin:dsh-prompt-manager:announcement', order: 150, text: PROMPT_GUIDANCE })
          } catch {
            /* 公告失败不阻塞 */
          }
        }
        refreshSystemPrompt()
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
          if (announcementDisposer !== null) {
            try {
              announcementDisposer()
            } catch {
              /* 忽略 */
            }
            announcementDisposer = null
          }
        }
      }, 'dsh-prompt-manager: systemPrompt')
    })
  }

  console.log('[dsh-prompt-manager] mounted, prompts file: ' + promptFilePath())
}

