/**
 * @hyzyn/dsh-prompt — DSH Web GUI 的 Prompt 管理插件（宿主半体）。
 *
 * 能力：
 * - 可视化编辑 systemPrompt：在插件配置的「Prompt 管理」卡片中维护多个
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
import { dirname, join } from 'node:path'
import { dshHome, readManagedBlock, registerLiteralSection, spliceManagedBlock } from '@hyzyn/dsh-kit'
import type { PromptSectionApi } from '@hyzyn/dsh-kit'
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
/** 交给 kit 的托管区块读写：标记必须**整行相等**才认（见下面 readManagedStore 的注释）。 */
const BLOCK_MARKERS = { beginMarker: MARK_START, endMarker: MARK_END } as const
const PROMPT_ID_RE = /^p-[A-Za-z0-9-]{1,64}$/
const VERSION_ID_RE = /^v-[A-Za-z0-9-]{1,64}$/
const MAX_NAME_LENGTH = 80
const MAX_CONTENT_LENGTH = 500_000
/**
 * 每轮注入 systemPrompt 的正文上限——**这是每轮请求成本的保护，不是保存限制**：
 * 保存防呆是上面的 MAX_CONTENT_LENGTH（超限拒存），这里超限只截断本轮注入的内容，
 * 文件里始终是完整正文。取 8000 而不是 kit 的 DEFAULT_SECTION_MAX_CHARS（4000），
 * 是因为用户 Prompt 正文通常比插件公告长，4000 会误伤正常用法；8000 仍远低于保存上限。
 */
export const PROMPT_BODY_MAX_CHARS = 8_000
const MAX_JSON_BODY_BYTES = 2 * 1024 * 1024
const EXPORT_SCHEMA = 'dsh-prompt'
const EXPORT_VERSION = 1

// codegraph CG35：DSH_HOME 推导统一走 @hyzyn/dsh-kit（~ 展开 + resolve），别再手抄一份 raw 副本
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

export function readManagedStore(): ManagedRead {
  const file = promptFilePath()
  const existed = existsSync(file)
  const text = existed ? readFileSync(file, 'utf8') : ''
  const result: ManagedRead = { store: emptyStore(), file }
  /*
   * 标记按**整行相等**匹配（kit 的 readManagedBlock，只容忍行尾空白 / CR）。
   *
   * 为什么不能再用 `line.includes('… managed')`（2026-10-19 外部测评 issue #13 第 3 条）：
   * 区块正文是 js-yaml 渲染的，版本内容里的**多行文本**会写成缩进块；只要其中一行恰好
   * 含 `end dsh-prompt-manager managed`，子串匹配就会把它当成结束标记——区块被**静默
   * 截断**（注入的 systemPrompt 少掉后半截，界面没有任何提示），而多行值越界那种更糟：
   * 下一次写入会把截断后的形状当真，文件逐步走形。
   */
  const block = readManagedBlock(text, BLOCK_MARKERS)
  if (block === undefined) {
    // 区分「没有区块」与「起始标记在、结束标记丢」：前者是正常空配置，后者必须报错，
    // 否则用户会以为自己什么都没丢。
    const hasBegin = text.split('\n').some((line) => line.trimEnd() === MARK_START)
    if (hasBegin) result.fileError = '托管区块缺少结束标记（# --- end dsh-prompt-manager managed ---）'
    return result
  }
  if (block.body.trim() === '' || block.body.split('\n').every((line) => line.trim() === '' || line.trim().startsWith('#'))) return result
  try {
    const parsed = yaml.load(block.body) as Partial<PromptStore> | null
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
export function renderManagedBlock(store: PromptStore): string {
  return yaml.dump(store, { lineWidth: -1, noRefs: true, noArrayIndent: false })
}

/** 把托管区块写回 prompts 文件（原子替换，保留文件其它内容与权限）。 */
export function writeManagedStore(store: PromptStore): void {
  const file = promptFilePath()
  const existed = existsSync(file)
  const mode = existed ? (statSync(file).mode & 0o777) : 0o600
  const raw = existed ? readFileSync(file, 'utf8') : '# dsh prompt manager file\n'
  /*
   * 拼接走 kit 的 spliceManagedBlock（2026-10-19 外部测评 issue #13 第 3 条）：
   *   - 标记**整行相等**才算边界——版本正文里的多行值恰好含标记文本时不会被误判成边界；
   *   - 根位置上的裸 `[]`（flow 序列根）会被换掉而不是追加，不再写出非法 YAML（CG67 同源）；
   *   - 悬空起始标记只重写标记行、不吞掉其后内容；区块外内容逐字节保留。
   * 这三条此前在本包各写了一遍（且是子串匹配版本），现在只有 kit 一份实现。
   */
  const next = spliceManagedBlock(raw, { ...BLOCK_MARKERS, body: renderManagedBlock(store) })
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
 * 导入合并（2026-10-19 外部测评 issue #14 第 2 条）
 * ------------------------------------------------------------------ */

/** 一次导入对某个已有 Prompt 做了什么。 */
export interface ImportMergeEntry {
  /** Prompt id。 */
  id: string
  /** 新增的版本 id（本地没有的）。 */
  addedVersions: string[]
  /** 本地已有、导入里也有（同 id）因而**跳过**的版本 id——不覆盖，本地内容原样保留。 */
  keptVersions: string[]
}

/** 导入合并的结果摘要（直接回给卡片，用户能看到「新增 N / 合并 M」而不是只有 imported）。 */
export interface ImportMergeSummary {
  /** 新建的 Prompt id。 */
  created: string[]
  /** 合并进已有 Prompt 的条目。 */
  merged: ImportMergeEntry[]
  /** 导入后是否改了启用中的 Prompt（只有调用方显式要求时才可能为 true）。 */
  activeChanged: boolean
}

/**
 * 把导入的 store 合并进本地 store（纯函数，导出是为了直接测）。
 *
 * 三条语义，都是「**不丢用户数据**」这一条的展开（issue #14 第 2 条）：
 *
 * 1. **同 id 合并版本，不整条替换**：本地 p-x 有 [v1,v2]，导入的 p-x 有 [v1,v3]，
 *    结果是 [v1,v2,v3]。原先的 `byId.set(prompt.id, prompt)` 会把 v2 直接抹掉，
 *    而接口只回 `{ok:true, imported:1}`——用户看不到任何损失。
 * 2. **同 id 版本冲突时保留本地**：同 id 同内容的版本只算一次；同 id **不同内容**时
 *    以本地为准（本地是用户编辑过的），导入的那份不覆盖——要覆盖请用户自己删了再导。
 * 3. **默认不改 activePromptId**：导入是「把别人的东西拿进来」，不是「切换我当前的
 *    systemPrompt」。原先 `imported.activePromptId ?? local` 会让一次导入立刻改变
 *    每个会话注入的内容，而用户没有点过任何「启用」。
 *
 * @param local - 本地现有 store
 * @param imported - 校验过的导入 store
 * @param options.activate - 用户显式勾选「导入后启用这份 Prompt」时才为 true
 * @returns 合并后的 store 与摘要
 */
export function mergeImportedStore(
  local: PromptStore,
  imported: PromptStore,
  options: { activate?: boolean } = {},
): { store: PromptStore; summary: ImportMergeSummary } {
  const byId = new Map(local.prompts.map((prompt) => [prompt.id, prompt]))
  const created: string[] = []
  const merged: ImportMergeEntry[] = []
  for (const incoming of imported.prompts) {
    const existing = byId.get(incoming.id)
    if (existing === undefined) {
      // 本地没有：整条进来，但**版本 id 冲突不跨 Prompt 讨论**——同一条 Prompt 内
      // validateImportPayload 已经保证不重复。
      byId.set(incoming.id, incoming)
      created.push(incoming.id)
      continue
    }
    const localVersions = new Map(existing.versions.map((version) => [version.id, version]))
    const addedVersions: string[] = []
    const keptVersions: string[] = []
    for (const version of incoming.versions) {
      const same = localVersions.get(version.id)
      if (same === undefined) {
        localVersions.set(version.id, version)
        addedVersions.push(version.id)
      } else {
        // 同 id 版本：**保留本地**（见上面第 2 条）。记进摘要，卡片可以提示「M 个版本
        // 已存在、未覆盖」——沉默地跳过和不导入在界面上长得一样。
        keptVersions.push(version.id)
      }
    }
    const versions = [...localVersions.values()]
    // 本地的激活版本 / A/B 引用在合并后必须仍然存在（新增版本不会让它们失效，
    // 但导入方可能带来本地没有的引用——那种情况回落到第一个版本）。
    const activeVersionId = existing.activeVersionId !== null && localVersions.has(existing.activeVersionId)
      ? existing.activeVersionId
      : (versions[0]?.id ?? null)
    const abA = localVersions.has(existing.ab.aVersionId) ? existing.ab.aVersionId : versions[0].id
    const abB = localVersions.has(existing.ab.bVersionId) ? existing.ab.bVersionId : versions[versions.length - 1].id
    byId.set(existing.id, {
      ...existing,
      versions,
      activeVersionId,
      ab: { ...existing.ab, aVersionId: abA, bVersionId: abB },
    })
    merged.push({ id: existing.id, addedVersions, keptVersions })
  }

  let activePromptId = local.activePromptId
  let activeChanged = false
  if (options.activate === true && imported.activePromptId !== null && byId.has(imported.activePromptId)) {
    activePromptId = imported.activePromptId
    activeChanged = activePromptId !== local.activePromptId
  }
  return {
    store: { activePromptId, prompts: [...byId.values()] },
    summary: { created, merged, activeChanged },
  }
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

/** 注入段落的名字：注册名与超限告警的去重键共用它。 */
const PROMPT_SECTION_NAME = 'plugin:dsh-prompt-manager'

/** 已告警过正文超限的段落名：同名只告警一次（与 kit enforceBudget 的同名去重同一策略）。 */
const bodyBudgetWarned = new Set<string>()

/**
 * 把启用的 Prompt 正文变成要注册进 systemPrompt 的文本；超限就做**语义化截断**。
 *
 * 为什么不用 kit 的通用截断标记（`…（本段超过 N 字符上限，已截断）`）：这段是**用户内容**，
 * 模型需要知道的不止「以上不是全文」，还有「完整内容去哪提醒用户找」——通用标记只说得出前者。
 *
 * 截断说明计入预算**之内**：正文保留 `PROMPT_BODY_MAX_CHARS - 说明自身长度` 字符，最终文本
 * 总长恰好等于上限。调用点（registerActivePromptSection）给 kit 传的 `maxChars` 与这里是
 * **同一个常量**，kit 的长度安全网因此永远不会触发；两边一旦不相等（比如调用点传小了），
 * kit 就会二次截断、语义说明被顶掉——prompt-section.test.ts 的反例用例钉住了这个形状。
 */
export function buildSystemPromptText(store: PromptStore): string {
  const text = resolveActiveText(store).text
  if (text.length <= PROMPT_BODY_MAX_CHARS) return text
  if (!bodyBudgetWarned.has(PROMPT_SECTION_NAME)) {
    bodyBudgetWarned.add(PROMPT_SECTION_NAME)
    console.warn(
      `[dsh-prompt-manager] 启用的 Prompt 正文 ${text.length} 字符，超过每轮注入上限 ${PROMPT_BODY_MAX_CHARS} 字符，已截断注入；` +
        '这是每轮请求成本的保护，不是保存限制，完整正文仍保存在 prompts.yml 里',
    )
  }
  const notice =
    `\n\n> 正文超过 ${PROMPT_BODY_MAX_CHARS} 字符上限，以上为前 ${PROMPT_BODY_MAX_CHARS} 字符；` +
    '完整内容请在「设置 → 插件配置 → Prompt 管理」里查看。'
  return text.slice(0, PROMPT_BODY_MAX_CHARS - notice.length) + notice
}

/**
 * 注册「启用的 Prompt 正文」段落；正文为空时返回 null（什么都不注册）。
 *
 * `maxChars` 必须与 `buildSystemPromptText` 的截断阈值是**同一个常量**：语义截断已经把总长
 * 压到上限以内，这里传别的值只可能让 kit 二次截断（两份截断标记）或把安全网架空。
 * 导出仅为测试：生产路径只有 refreshSystemPrompt 一个调用点。
 */
export function registerActivePromptSection(api: PromptSectionApi, store: PromptStore): (() => void) | null {
  const text = buildSystemPromptText(store)
  if (text === '') return null
  return registerLiteralSection(api, {
    name: PROMPT_SECTION_NAME,
    order: 140,
    text,
    maxChars: PROMPT_BODY_MAX_CHARS,
  })
}

/**
 * 保存响应的正文预警：保存的 Prompt 里**会被注入**的版本若有超过每轮注入上限的，回一条
 * warning 让卡片提示「这份 Prompt 每轮只会注入前 8000 字符」。候选版本与 resolveActiveText
 * 的选择对齐——A/B 启用且两侧都存在时两侧都可能被注入；否则走「activeVersionId → 第一个
 * 版本」的回落链。不在注入链上的超限版本（比如存着备用的长稿）不触发，免得卡片误报。
 * 导出仅为测试。
 */
export function promptBodyWarning(prompt: Prompt): string | undefined {
  let candidates: string[]
  if (
    prompt.ab.enabled &&
    prompt.versions.some((version) => version.id === prompt.ab.aVersionId) &&
    prompt.versions.some((version) => version.id === prompt.ab.bVersionId)
  ) {
    candidates = [prompt.ab.aVersionId, prompt.ab.bVersionId]
  } else {
    const effective = prompt.versions.find((version) => version.id === prompt.activeVersionId) ?? prompt.versions[0]
    candidates = effective === undefined ? [] : [effective.id]
  }
  const over = prompt.versions.filter(
    (version) => candidates.includes(version.id) && version.content.length > PROMPT_BODY_MAX_CHARS,
  )
  if (over.length === 0) return undefined
  const ids = over.map((version) => version.id).join('、')
  return (
    `这份 Prompt 的版本 ${ids} 正文超过每轮注入上限 ${PROMPT_BODY_MAX_CHARS} 字符，` +
    `启用后每轮只会注入前 ${PROMPT_BODY_MAX_CHARS} 字符；完整内容仍保存在文件里，可随时在卡片查看`
  )
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


/** 导出仅为测试：生产路径只有 apply 里这一处调用。 */
export function makeRoutes(
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
        const saved = after.store.prompts.find((prompt) => prompt.id === validated.prompt!.id)
        const warning = saved === undefined ? undefined : promptBodyWarning(saved)
        writeJson(res, 200, {
          ok: true,
          ...storeDto(after.store),
          ...(after.fileError !== undefined ? { fileError: after.fileError } : {}),
          // 保存内容里有会被注入的超限版本时的卡片提示；只影响提示，不改保存语义（MAX_CONTENT_LENGTH 照旧）。
          ...(warning !== undefined ? { warning } : {}),
        })
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
          /*
           * 单条导出（带 promptId）**不带全库的 activePromptId**：那个字段描述的是
           * 「导出方本机当前启用的是谁」，与这条 Prompt 无关。带出去会让导入方误以为
           * 「同事启用的就是这条」，并在导入时改变自己启用的 Prompt（issue #14 第 2 条）。
           * 全库导出才带——那时它确实是有意义的上下文。
           */
          ...(promptId !== null && promptId !== '' ? {} : { activePromptId: managed.store.activePromptId }),
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
        /*
         * 导入 = **合并**，不是替换（2026-10-19 外部测评 issue #14 第 2 条）：
         * 同 id 的 Prompt 保留本地版本、只补进本地没有的版本；`activePromptId` 默认不动
         * （要切换请显式传 `activate: true`，那是用户点过「启用」才该发生的事）。
         * 原先的 `byId.set(prompt.id, prompt)` 会整条覆盖——同事分享的 JSON 带
         * `activePromptId` 时，导入方本地那份 Prompt 的版本**当场消失**，而且新的正文
         * 立刻热注入 system prompt，界面没有任何预览或确认。
         */
        const merged = mergeImportedStore(managed.store, imported, { activate: body.activate === true })
        try {
          writeManagedStore(merged.store)
        } catch (error) {
          writeJson(res, 500, { error: '写入 prompts 文件失败: ' + (error instanceof Error ? error.message : String(error)) })
          return
        }
        onChanged()
        const after = readManagedStore()
        writeJson(res, 200, {
          ok: true,
          imported: imported.prompts.length,
          importSummary: merged.summary,
          ...storeDto(after.store),
          ...(after.fileError !== undefined ? { fileError: after.fileError } : {}),
        })
      },
    },
  ]
}

/* ------------------------------------------------------------------ *
 * 插件本体
 * ------------------------------------------------------------------ */

const PROMPT_GUIDANCE = '本机装有 dsh-prompt-manager 插件（systemPrompt 编辑）：用户提到「Prompt / systemPrompt / 提示词」时，引导他打开 设置 → 插件配置 → Prompt 管理 卡片，别手改托管区块。'

export function apply(ctx: Context, config?: Config): void {
  if (config?.enabled === false) return
  const announce = config?.announceToAgent !== false
  const applyToSystemPrompt = config?.applyToSystemPrompt !== false

  /*
   * `systemPrompt.section()` 的形状走 kit 的 PromptSectionApi（`kit D15`）。
   *
   * 原来这里手写的是 `{ name; order?; text: string }`——**少了 `interpolate`**，
   * 于是「把用户编辑的 Prompt 正文原样注入」这件事在类型层面根本表达不出来。
   * 宿主缺省 `interpolate: true`：正文里只要出现 `{{language}}` / `<span>{{ msg }}</span>`
   * 这类文本，`renderPrompt()` 就会在**每一步请求**上抛 `unknown prompt variable` /
   * `malformed prompt variable reference`——`dsh headless` 直接 exit 1，模型收到 0 次请求，
   * 而插件的 /save、/list、/active 全部 200、`fileError` 为空，卡片上看不出任何原因
   * （2026-10-19 外部测评 issue #14 第 1 条）。
   */
  let systemPromptApi: PromptSectionApi | null = null
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
    try {
      // 正文为空 → null（不注册）；语义化截断与 kit 预算的对齐见 registerActivePromptSection
      // （正文是用户内容，kit 的注册口固定 interpolate: false，一律不插值）。
      sectionDisposer = registerActivePromptSection(systemPromptApi, readManagedStore().store)
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
        const systemPrompt = (promptCtx as unknown as { systemPrompt: PromptSectionApi }).systemPrompt
        systemPromptApi = systemPrompt
        if (announce) {
          try {
            // 公告正文是本仓自己的静态文案，同样不插值：文案里出现 `{{` 就该原样呈现，
            // 而不是变成一条「未知变量」把整个会话拖死。
            announcementDisposer = registerLiteralSection(systemPrompt, { name: 'plugin:dsh-prompt-manager:announcement', order: 150, text: PROMPT_GUIDANCE })
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

