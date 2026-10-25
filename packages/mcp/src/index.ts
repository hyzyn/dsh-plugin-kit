/**
 * @hyzyn/dsh-mcp — DSH Web GUI 的 MCP 服务器配置插件（宿主半体）。
 *
 * 机制：MCP 服务器在 DSH 里是 @deepseek-ai/dsh-mcp-client 的插件实例。
 * 本插件在 ~/.dsh/cordis.patch.yml（home 补丁层，对所有 profile 生效）
 * 里维护一段带标记的托管区块，每条服务器是一行 insert patch。DSH 启动
 * 时对 home 补丁层注册了 HMR 监听（watchUserPatches），文件变化即热加载：
 * 新增/修改/删除/禁用服务器无需重启宿主进程。
 *
 * 浏览器半体（./client）通过 /api/dsh-mcp/* 路由读写配置；路由带
 * loopback-only 信任围栏。
 */
import {
  attachTierRestrict,
  createOutputDecoder,
  dshHome,
  hasSameOriginProof,
  isLoopbackRequestStrict,
  originProofHint,
  readManagedBlock,
  registerLiteralSection,
  spliceManagedBlock as spliceManagedBlockKit,
  spawnPortable,
  stripEmptyFlowSequenceRoot,
  terminateChild,
} from '@hyzyn/dsh-kit'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { chmodSync, existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import yaml from 'js-yaml'
import { attachAgentSurface } from './agent-surface.js'
import type { AgentSurfaceControl } from './agent-surface.js'

export const name = 'mcp-config'
export const inject: string[] = []

export interface Config {
  /** 关闭整个插件（不注册路由、不发布提示）。默认开。 */
  enabled?: boolean
  /** 是否向 agent 注入插件能力公告。默认开。 */
  announceToAgent?: boolean
  /**
   * MCP 工具面怎么进 agent 的工具表。默认 `'eager'`（= 今天的行为：全部一次给出）。
   *
   * `'on-demand'` 时**工具仍由宿主注册**，但本插件给每个 agent 装一条限制把全部 `mcp__*`
   * 摘掉，只留 `mcp_servers`（看有哪些 server）与 `mcp_load`（按需装载）——请求体里不再有那
   * 几十 KB 的 MCP 工具定义，模型需要时自己装载。实现与判据见 `src/agent-surface.ts`。
   */
  agentToolLoading?: 'eager' | 'on-demand'
}

/* ------------------------------------------------------------------ *
 * 常量与类型
 * ------------------------------------------------------------------ */

const MCP_CLIENT_PACKAGE = '@deepseek-ai/dsh-mcp-client'
const MARK_START = '# --- dsh-mcp-config managed (auto-generated; do not edit) ---'
const MARK_END = '# --- end dsh-mcp-config managed ---'
/** 交给 kit 的托管区块读写：标记必须**整行相等**才认（见 readManagedRows 的注释）。 */
const MCP_BLOCK_MARKERS = { beginMarker: MARK_START, endMarker: MARK_END } as const
const SERVER_NAME_RE = /^[A-Za-z0-9_-]{1,32}$/
const ROW_ID_RE = /^mcp-[a-z0-9-]{1,64}$/
const MAX_TIMER_DELAY_MS = 2 ** 31 - 1
const PROBE_TIMEOUT_MS = 25_000
const MAX_JSON_BODY_BYTES = 512 * 1024
const MAX_TOOLS_REPORTED = 200

/**
 * MCP 工具面的**成本阈值**（个）：卡片据此在「合计超过多少」时给一行提示。
 *
 * 为什么这个数在**宿主侧**而不是浏览器半体：它是「成本可见性」这条产品判据的取值，卡片只是
 * 渲染器。放客户端等于同一件事两份真相（README 引用哪个都对不上另一个），而且换阈值要同时改
 * 两个文件、漏一个就静默漂移。所以 DTO 带 `toolBudget`，客户端只负责比较。
 *
 * 也**刻意 `export`**：README 里写「超过 N 个（`AGENT_TOOL_BUDGET`）」时，`scripts/check-readme-facts.mjs`
 * 只收集 `src/` 下的导出常量——私有常量会让这处引用恒绿（文档与代码一起漂也没人发现）。
 */
export const AGENT_TOOL_BUDGET = 80

/**
 * `reconnect` 的默认值——**具名常量而不是散在 validateReconnect 里的字面量**。
 *
 * 为什么单独提出来：这三个数在 README 的排障表里是**判据的一部分**（「`maxAttempts`
 * 用完就放弃、必须重启」正是最常见的误判点），而 README 里的数字由
 * `scripts/check-readme-facts.mjs` 现算校验。
 *
 * **必须 `export`**：那个闸门只收集 `export const`（`collectConstants` 的判据是
 * 「非导出常量不是对外承诺的一部分」）。第一版写成模块内私有常量，抽不到 →
 * 比对不到 → 闸门恒绿，改错数字也不会红（实测：把 10 改成 99 仍然「通过」）。
 */
export const RECONNECT_DEFAULT_INITIAL_DELAY_MS = 500
export const RECONNECT_DEFAULT_MAX_DELAY_MS = 30_000
export const RECONNECT_DEFAULT_MAX_ATTEMPTS = 10

/* ------------------------------------------------------------------ *
 * 公开工具名：核心 mcp-client 的命名规则（用于数「这行到底连上没有」）
 * ------------------------------------------------------------------ */

/**
 * 与 `@deepseek-ai/dsh-mcp-client` 的 `publicName()` 对齐：把非法字符换成 `_`。
 *
 * 注意 `-` 是**合法**的（`/[^A-Za-z0-9_-]/`），而 serverName 本身被约束在
 * `[A-Za-z0-9_-]{1,32}` 内 —— 所以**前缀部分永远不会被改**，只有 rawName 那截会。
 */
const INVALID_TOOL_NAME_CHARS = /[^A-Za-z0-9_-]/g
/**
 * 公开名长度上限与 hash 长度（核心里的 `MAX_PUBLIC_NAME_LENGTH` / `HASH_LENGTH`）。
 *
 * 超长时核心保留 `64 - 12 - 1 = 51` 个字符再接 `_<12 位 hash>`，而本插件允许的
 * serverName ≤ 32 ⇒ 前缀最长 `3 + 32 + 2 = 37` ≤ 51 —— **截断永远切不到前缀**，
 * 所以按下面前缀做 `startsWith` 归因是可靠的（这是它能当判据用的前提）。
 */
const MAX_PUBLIC_NAME_LENGTH = 64
const NAME_HASH_LENGTH = 12
/** 前缀在被截断前还能保住的长度。 */
const MAX_PREFIX_LENGTH = MAX_PUBLIC_NAME_LENGTH - NAME_HASH_LENGTH - 1

const homePatchPath = () => join(dshHome(), 'cordis.patch.yml')

interface JsExpr {
  __jsExpr: string
}

interface ReconnectConfig {
  enabled?: boolean
  initialDelayMs?: number
  maxDelayMs?: number
  maxAttempts?: number
}

/** 与 @deepseek-ai/dsh-mcp-client 的 Config 对齐（env/headers 值可为 !!js 表达式）。 */
interface McpServerConfig {
  serverName: string
  transport: 'stdio' | 'streamable-http'
  command?: string
  args?: string[]
  env?: Record<string, string | JsExpr>
  cwd?: string
  url?: string
  headers?: Record<string, string | JsExpr>
  toolCallTimeoutMs?: number
  failOnStartupError?: boolean
  reconnect?: ReconnectConfig
}

interface McpRow {
  id: string
  config: McpServerConfig
  disabled?: boolean
}

/* ------------------------------------------------------------------ *
 * js-yaml 方言：与 dsh-app-boot 相同的 !!js 表达式类型
 * ------------------------------------------------------------------ */

const JsExprType = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  resolve: (data: unknown) => typeof data === 'string',
  construct: (data: string) => ({ __jsExpr: data }) as JsExpr,
  predicate: (value: unknown): value is JsExpr =>
    typeof value === 'object' && value !== null && typeof (value as JsExpr).__jsExpr === 'string',
  represent: (value: JsExpr) => value.__jsExpr,
})
const YAML_SCHEMA = yaml.JSON_SCHEMA.extend(JsExprType)

const isJsExpr = (value: unknown): value is JsExpr =>
  typeof value === 'object' && value !== null && typeof (value as JsExpr).__jsExpr === 'string'

/** 序列化给浏览器的值：!!js 表达式写成 "js:<expr>" 前缀，其余转字符串。 */
function dtoValue(value: unknown): string {
  if (isJsExpr(value)) return 'js:' + value.__jsExpr
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

/** 浏览器回传的反序列化：js: 前缀还原为 !!js 表达式节点。 */
function fromDtoValue(value: unknown): string | JsExpr {
  if (typeof value === 'string' && value.startsWith('js:')) return { __jsExpr: value.slice(3) }
  return String(value)
}

function dtoMap(map: Record<string, string | JsExpr> | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(map ?? {})) out[key] = dtoValue(value)
  return out
}

function fromDtoMap(map: Record<string, unknown> | undefined): Record<string, string | JsExpr> {
  const out: Record<string, string | JsExpr> = {}
  for (const [key, value] of Object.entries(map ?? {})) out[key] = fromDtoValue(value)
  return out
}

/* ------------------------------------------------------------------ *
 * 托管区块读写（~/.dsh/cordis.patch.yml）
 * ------------------------------------------------------------------ */

interface ManagedRead {
  rows: McpRow[]
  fileError?: string
  patchFile: string
}

function readManagedRows(): ManagedRead {
  const patchFile = homePatchPath()
  const existed = existsSync(patchFile)
  const text = existed ? readFileSync(patchFile, 'utf8') : ''
  const result: ManagedRead = { rows: [], patchFile }
  /*
   * 标记按**整行相等**匹配（kit 的 readManagedBlock，只容忍行尾空白 / CR）。
   *
   * 为什么不能再用 `line.includes('dsh-mcp-config managed')`（2026-10-19 外部测评 issue #13 第 3 条）：
   * 区块正文是 js-yaml 渲染的，`args` / `env` / `headers` 里的**多行值**会写成缩进块；
   * 只要其中一行恰好含 `end dsh-mcp-config managed`，子串匹配就把它当成结束标记——
   * 配置被**静默截断**，下一次热加载拿到的是错误参数。更糟的是再保存一次：新块按
   * 「已截断的边界」重写，文件逐步走形，最终成为非法 YAML（宿主启动抛
   * `failed to parse patches`）。同理，区块**外**的用户注释里只要出现标记名，也会被
   * 误判成区块边界，把用户内容吞掉。
   */
  const block = readManagedBlock(text, MCP_BLOCK_MARKERS)
  if (block === undefined) {
    // 起始标记在、结束标记丢 → 报错（不能拿半截内容当合法结果）
    if (text.split('\n').some((line) => line.trimEnd() === MARK_START)) {
      result.fileError = '托管区块缺少结束标记（# --- end dsh-mcp-config managed ---）'
    }
    return result
  }
  if (block.body.trim() === '' || block.body.split('\n').every((line) => line.trim() === '' || line.trim().startsWith('#'))) return result
  try {
    const parsed = yaml.load(block.body, { schema: YAML_SCHEMA })
    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        if (typeof entry !== 'object' || entry === null) continue
        const rows = (entry as { insert?: unknown }).insert
        if (!Array.isArray(rows) || rows.length === 0) continue
        const row = rows[0]
        if (typeof row !== 'object' || row === null) continue
        const candidate = row as { id?: unknown; config?: unknown; disabled?: unknown }
        if (typeof candidate.id !== 'string' || typeof candidate.config !== 'object' || candidate.config === null) continue
        result.rows.push({
          id: candidate.id,
          config: candidate.config as McpServerConfig,
          ...(candidate.disabled === true ? { disabled: true } : {}),
        })
      }
    } else {
      result.fileError = '托管区块不是 YAML 数组'
    }
  } catch (error) {
    result.fileError = '托管区块解析失败: ' + (error instanceof Error ? error.message : String(error))
  }
  return result
}

/** 生成托管区块文本（不含首尾标记行）。
 * 注意：区块嵌在 home 补丁文件的顶层 YAML 数组里，空列表不能写裸的 `[]`
 * （会破坏文档结构导致 HMR 解析失败）；写成空的 insert patch
 * （`- insert: []`，对条目树是 no-op）既合法又兼容各版本的读取器。 */
function renderManagedBlock(rows: McpRow[]): string {
  if (rows.length === 0) return '- insert: []\n'
  const patches = rows.map((row) => ({
    insert: [
      {
        id: row.id,
        name: MCP_CLIENT_PACKAGE,
        ...(Object.keys(row.config).length > 0 ? { config: row.config } : {}),
        ...(row.disabled ? { disabled: true } : {}),
      },
    ],
  }))
  return yaml.dump(patches, { schema: YAML_SCHEMA, lineWidth: -1, noRefs: true })
}

/**
 * 纯函数：把托管区块（含首尾标记行）拼进 home 补丁文本，保留区块外的所有内容。
 *
 * 实现已收进 kit 的 `spliceManagedBlock`（2026-10-19 外部测评 issue #13 第 3 条）：
 * 标记**整行相等**才算边界（值里的多行文本含标记名时不会被误判），根位置上的裸 `[]`
 * 会被换掉而不是追加（CG67 同源），悬空起始标记只重写标记行。这三条此前在本包各写了
 * 一遍、且是子串匹配版本——同一份判据只有 kit 一份实现。
 *
 * 本函数保留原签名（`(text, rows) => string`）是为了不惊动本包已有的用例与调用方。
 */
export function spliceManagedBlock(text: string, rows: McpRow[]): string {
  return spliceManagedBlockKit(text, { ...MCP_BLOCK_MARKERS, body: renderManagedBlock(rows) })
}

/**
 * 保存前的「清空防护」判定：返回拒绝文案，放行则返回 undefined。
 *
 * 为什么需要：`/servers/save` 是**整表替换**语义——请求体里的 servers 就是全部内容，
 * 空数组等于把托管区块清空。卡片若因启动竞态、陈旧快照或任何自动化拿到空列表，
 * 一次保存就会把已配置的服务器全部抹掉，而文件里不会留下任何痕迹（实测踩过）。
 *
 * 因此空列表必须由调用方显式确认（`clearAll: true`）；卡片只在用户明确删光时才带。
 * 区块本来就是空的（existing === 0）不构成破坏，放行——免得把「保存一张空卡片」
 * 变成一个没必要的报错。
 */
export function emptyServersRejection(incoming: number, existing: number, clearAll: unknown): string | undefined {
  if (incoming > 0 || clearAll === true || existing === 0) return undefined
  return `这次保存会把 ${String(existing)} 条 MCP 服务器全部清空；若确认要清空，请带 clearAll: true 重发（卡片删除最后一条时会自动带上）。`
}

/**
 * 提交前的「外部重名」检测：serverName 被**本插件之外**的 mcp-client 实例占用时拒绝。
 *
 * 为什么必须拦：mcp-client 的工具按 serverName 命名（`mcp__<serverName>__<tool>`），
 * 同名两个实例抢同一套工具名，其中一个必然加载失败——而在文件里看不出谁失败了，
 * 用户只会看到「加进去了但不生效」。外部实例（例如 Codegraph 插件自管的 codegraph）
 * 不在本插件的托管区块里，本插件也不该把别人的行挪进自己的区块，所以正确动作是拒绝。
 *
 * **只拦「新引入」的重复**：某条已保存的行如果本来就带着这个外部同名实例（历史遗留），
 * 放行——否则用户连别的字段都改不了，编辑另一行也会被这条历史问题挡住。用户真要清理，
 * 应当删除或改名那条行本身。
 *
 * @param incoming 本次提交的行（id + serverName）。
 * @param existing 当前文件里已保存的行（用于识别「本来就存在」的重复）。
 * @param external 本插件之外的 mcp-client 实例（`externalMcpEntries` 的结果）。
 */
export function externalNameRejection(
  incoming: Array<{ id: string; serverName: string }>,
  existing: Array<{ id: string; serverName: string }>,
  external: Array<{ id: string; serverName: string }>,
): string | undefined {
  const alreadySaved = new Map(existing.map((row) => [row.id, row.serverName]))
  for (const row of incoming) {
    const hit = external.find((entry) => entry.serverName === row.serverName)
    if (hit === undefined) continue
    if (alreadySaved.get(row.id) === row.serverName) continue
    return `serverName「${row.serverName}」已被本插件之外的 mcp-client 实例占用（条目标识 ${hit.id}）：两个实例会抢同一套工具名 mcp__${row.serverName}__*，其中一个必然加载失败。这一行由别的插件托管（例如 codegraph 由 Codegraph 插件自管），请到对应插件的设置里修改，不要在这里重复添加。`
  }
  return undefined
}

/** 把托管区块写回 home 补丁文件（原子替换，保留文件其它内容与权限）。 */
function writeManagedRows(rows: McpRow[]): void {
  const patchFile = homePatchPath()
  for (let attempt = 0; ; attempt++) {
    const existed = existsSync(patchFile)
    const stat = existed ? statSync(patchFile) : undefined
    const mode = stat ? (stat.mode & 0o777) : 0o600
    // 写前复核：dsh-codegraph 等插件也会写这个文件。盖章（mtime+size）→ 读 →
    // 渲染 → 复核，期间被别人写过就重读重做，避免用旧快照覆盖掉它的改动。
    const stamp = stat ? stat.mtimeMs + ':' + stat.size : 'absent'
    const text = stat ? readFileSync(patchFile, 'utf8') : '# dsh home patch layer\n'
    const next = spliceManagedBlock(text, rows)
    const statNow = existsSync(patchFile) ? statSync(patchFile) : undefined
    const stampNow = statNow ? statNow.mtimeMs + ':' + statNow.size : 'absent'
    if (stat !== undefined && stampNow !== stamp && attempt < 3) continue
    const tmp = join(dirname(patchFile), '.cordis.patch.yml.' + process.pid + '.tmp')
    writeFileSync(tmp, next, { mode })
    renameSync(tmp, patchFile)
    if (stat === undefined || (mode & 0o077) !== 0) chmodSync(patchFile, mode)
    return
  }
}

/* ------------------------------------------------------------------ *
 * 配置校验（对齐 dsh-mcp-client 的 Config 约束）
 * ------------------------------------------------------------------ */

function asString(value: unknown, label: string, errors: string[]): string | undefined {
  if (typeof value !== 'string' || value.length === 0) {
    errors.push(label + ' 必须是非空字符串')
    return undefined
  }
  return value
}

function asStringArray(value: unknown, label: string, errors: string[]): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    errors.push(label + ' 必须是字符串数组')
    return undefined
  }
  return value as string[]
}

function asNumber(value: unknown, label: string, errors: string[]): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) {
    errors.push(label + ' 必须是数字')
    return undefined
  }
  return num
}

function validateReconnect(value: unknown, errors: string[]): ReconnectConfig | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'object' || Array.isArray(value)) {
    errors.push('reconnect 必须是对象')
    return undefined
  }
  const raw = value as Record<string, unknown>
  const known = new Set(['enabled', 'initialDelayMs', 'maxDelayMs', 'maxAttempts'])
  for (const key of Object.keys(raw)) if (!known.has(key)) errors.push('reconnect.' + key + ' 不是有效选项')
  const enabled = raw.enabled === undefined ? true : raw.enabled
  if (typeof enabled !== 'boolean') errors.push('reconnect.enabled 必须是布尔值')
  const initialDelayMs = raw.initialDelayMs === undefined ? RECONNECT_DEFAULT_INITIAL_DELAY_MS : Number(raw.initialDelayMs)
  const maxDelayMs = raw.maxDelayMs === undefined ? RECONNECT_DEFAULT_MAX_DELAY_MS : Number(raw.maxDelayMs)
  const maxAttempts = raw.maxAttempts === undefined ? RECONNECT_DEFAULT_MAX_ATTEMPTS : Number(raw.maxAttempts)
  if (!Number.isFinite(initialDelayMs) || initialDelayMs <= 0 || initialDelayMs > MAX_TIMER_DELAY_MS) errors.push('reconnect.initialDelayMs 必须是 1~' + MAX_TIMER_DELAY_MS + ' 的正数')
  if (!Number.isFinite(maxDelayMs) || maxDelayMs <= 0 || maxDelayMs > MAX_TIMER_DELAY_MS) errors.push('reconnect.maxDelayMs 必须是 1~' + MAX_TIMER_DELAY_MS + ' 的正数')
  if (Number.isFinite(initialDelayMs) && Number.isFinite(maxDelayMs) && initialDelayMs > maxDelayMs) errors.push('reconnect.initialDelayMs 不能大于 maxDelayMs')
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) errors.push('reconnect.maxAttempts 必须是正整数')
  if (errors.some((item) => item.startsWith('reconnect.'))) return undefined
  return { enabled: enabled as boolean, initialDelayMs, maxDelayMs, maxAttempts }
}

/** 校验并清洗一条服务器配置；返回错误字符串或规范化配置。 */
function validateConfig(raw: unknown): { config?: McpServerConfig; error?: string } {
  const errors: string[] = []
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { error: '配置必须是对象' }
  const input = raw as Record<string, unknown>
  const known = new Set([
    'serverName', 'transport', 'command', 'args', 'env', 'cwd', 'url', 'headers',
    'toolCallTimeoutMs', 'failOnStartupError', 'reconnect',
  ])
  for (const key of Object.keys(input)) if (!known.has(key)) errors.push('未知配置项: ' + key)

  const serverName = asString(input.serverName, 'serverName', errors)
  if (serverName !== undefined && !SERVER_NAME_RE.test(serverName)) errors.push('serverName 只允许 [A-Za-z0-9_-]，1~32 字符')
  const transport = input.transport
  if (transport !== 'stdio' && transport !== 'streamable-http') errors.push('transport 必须是 stdio 或 streamable-http')

  const command = transport === 'stdio' ? asString(input.command, 'command', errors) : undefined
  const args = asStringArray(input.args, 'args', errors)
  const cwd = input.cwd === undefined || input.cwd === '' ? undefined : asString(input.cwd, 'cwd', errors)
  if (cwd !== undefined && !existsSync(cwd)) errors.push('cwd 不存在: ' + cwd)
  const url = transport === 'streamable-http' ? asString(input.url, 'url', errors) : undefined
  if (transport === 'streamable-http' && url !== undefined) {
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') errors.push('url 只支持 http/https')
    } catch {
      errors.push('url 不是合法地址')
    }
  }

  if (input.env !== undefined && (typeof input.env !== 'object' || Array.isArray(input.env))) errors.push('env 必须是对象')
  if (input.headers !== undefined && (typeof input.headers !== 'object' || Array.isArray(input.headers))) errors.push('headers 必须是对象')
  const env = input.env === undefined ? undefined : fromDtoMap(input.env as Record<string, unknown>)
  const headers = input.headers === undefined ? undefined : fromDtoMap(input.headers as Record<string, unknown>)

  const toolCallTimeoutMs = asNumber(input.toolCallTimeoutMs, 'toolCallTimeoutMs', errors)
  if (toolCallTimeoutMs !== undefined && (!Number.isInteger(toolCallTimeoutMs) || toolCallTimeoutMs <= 0)) errors.push('toolCallTimeoutMs 必须是正整数')

  const failOnStartupError = input.failOnStartupError === undefined ? false : input.failOnStartupError
  if (typeof failOnStartupError !== 'boolean') errors.push('failOnStartupError 必须是布尔值')

  const reconnect = validateReconnect(input.reconnect, errors)
  if (errors.length > 0) return { error: errors.join('；') }

  return {
    config: {
      serverName: serverName as string,
      transport: transport as 'stdio' | 'streamable-http',
      ...(command !== undefined ? { command } : {}),
      ...(args !== undefined ? { args } : {}),
      ...(env !== undefined ? { env } : {}),
      ...(cwd !== undefined ? { cwd } : {}),
      ...(url !== undefined ? { url } : {}),
      ...(headers !== undefined ? { headers } : {}),
      ...(toolCallTimeoutMs !== undefined ? { toolCallTimeoutMs } : {}),
      ...(failOnStartupError ? { failOnStartupError: true } : {}),
      ...(reconnect !== undefined ? { reconnect } : {}),
    },
  }
}

/* ------------------------------------------------------------------ *
 * 存活状态：从 loader 树读取托管行的 fiber 状态
 * ------------------------------------------------------------------ */

const FIBER_ACTIVE = 2
const FIBER_FAILED = 3

function liveStatus(ctx: Context, id: string): string {
  // 注意：insert patch 行挂载在根 include 的嵌套子树里，loader.resolve()（按
  // ":" 分隔的显式路径解析）看不到它们，必须用 entries() 遍历嵌套子树。
  const loader = (ctx as unknown as { loader?: { entries(): Iterable<unknown> } }).loader
  if (loader === undefined) return 'not-loaded'
  try {
    for (const raw of loader.entries()) {
      const entry = raw as { options?: { id?: string }; disabled?: boolean; fiber?: { state?: number } | null }
      if (entry.options?.id !== id) continue
      if (entry.disabled) return 'disabled'
      const fiber = entry.fiber
      if (fiber === undefined || fiber === null) return 'loading'
      if (fiber.state === FIBER_ACTIVE) return 'active'
      if (fiber.state === FIBER_FAILED) return 'error'
      return 'loading'
    }
  } catch {
    /* 遍历失败按未加载处理 */
  }
  return 'not-loaded'
}

/**
 * 查找本插件托管之外的 mcp-client 实例（外部实例**清单**，不是冲突列表）。
 *
 * ⚠️ 返回值与托管行**未必**有交集：本机 7 条 profile 层的外部实例、卡片里 2 条托管行，
 * 两边的 serverName 毫无重叠时这里照样返回 7 条。所以它只适合当「外部占用名单」用
 * （保存护栏比对、以及信息条展示）——**横幅上的「冲突」必须另算交集**，见
 * `externalNameClashes()`。事故背景见 issue #5（把清单原样当冲突渲染，导致不重名也报警）。
 */
function externalMcpEntries(ctx: Context, managedIds: Set<string>): Array<{ id: string; serverName: string }> {
  /*
   * 取 loader 必须**两条路都试、都不许外抛**：`ctx.loader` 是宿主 loader 服务的属性读取，在
   * 声明式 inject 缺失 / 最小宿主里会撞 cordis 的守卫直接抛，而这里的调用方（`buildServersDto`）
   * 一旦被抛穿，「外部实例清单」会连带整张 DTO 一起失败——按需加载那一层把它吞成「一个 server
   * 都没有」，于是 on-demand **静默退化**成「全都不给」。真机 harness 里就是这么撞上的
   * （见 `scripts/verify-mcp-on-demand.mjs` 的 `loader` 提供那段注释）。
   */
  let loader: { entries(): Iterable<unknown> } | undefined
  try {
    loader = (ctx as unknown as { loader?: { entries(): Iterable<unknown> } }).loader
  } catch {
    loader = undefined
  }
  if (loader === undefined) {
    // 反射层取法：未声明的服务在这里返回 undefined，而不是抛。
    try {
      loader = (ctx as unknown as { get?(name: string): unknown }).get?.('loader') as typeof loader
    } catch {
      loader = undefined
    }
  }
  if (loader === undefined) return []
  const out: Array<{ id: string; serverName: string }> = []
  try {
    for (const raw of loader.entries()) {
      const entry = raw as { options?: { id?: string; name?: string; config?: { serverName?: unknown } } }
      const options = entry.options
      if (options === undefined || options.name !== MCP_CLIENT_PACKAGE) continue
      if (options.id !== undefined && managedIds.has(options.id)) continue
      const serverName = options.config?.serverName
      if (typeof serverName === 'string') out.push({ id: options.id ?? '?', serverName })
    }
  } catch {
    /* 检查失败不阻塞列表 */
  }
  return out
}

/**
 * 纯函数：从托管行里挑出与本插件之外的 mcp-client 实例**真正重名**的那些行。
 *
 * 与 `externalMcpEntries()` 的分工（issue #5 的核心）：
 * - `externalMcpEntries()` = 「外部实例清单」，**不与托管行求交集**，供保存护栏 / 外部占用名单用；
 * - 本函数 = 上面这份清单与托管行的**交集**，即 DTO 里 `servers[].conflict === true` 的行，
 *   只有它才配叫「冲突」（同名两个实例抢同一套 `mcp__<serverName>__*` 工具名，其中一个必然加载失败）。
 *
 * 一条都不相交时返回空数组 ⇒ 界面不该出现任何冲突横幅（这正是它要修的行为）。
 */
export function externalNameClashes(
  rows: Array<{ id: string; serverName: string }>,
  external: Array<{ id: string; serverName: string }>,
): Array<{ id: string; serverName: string }> {
  const taken = new Set(external.map((entry) => entry.serverName))
  return rows.filter((row) => taken.has(row.serverName)).map((row) => ({ id: row.id, serverName: row.serverName }))
}

/* ------------------------------------------------------------------ *
 * 真实连接态：数工具注册表里属于某行的工具
 * ------------------------------------------------------------------ */

/** 某行在工具注册表里的公开名前缀（`mcp__<serverName>__`，按核心规则归一化）。 */
function toolNamespacePrefix(serverName: string): string {
  return ('mcp__' + serverName + '__').replace(INVALID_TOOL_NAME_CHARS, '_')
}

/** 把所有 `mcp__*` 工具归到「本插件接进档位裁剪」的同一族（见 apply 里的 attachTierRestrict）。 */
export const MCP_TIER_PREFIXES: readonly string[] = ['mcp__']

/**
 * 本插件自己注册的两个 agent 工具（`agentToolLoading: 'on-demand'` 才有）。
 *
 * **必须 `export`** 并单独成表：档位接线要把它们一起交给 `attachTierRestrict`（否则受限档下
 * 仍会露出它们——而 `mcp_load` 会改变工具面，等于把「只能看」的档位又开了一条装配通道）。
 * 它们是**前缀之外**的独立名字：`mcp_servers` / `mcp_load` 都不以 `mcp__` 开头，不会被那条
 * 宿主族前缀顺带覆盖，所以必须逐个列进 `prefixes`。
 */
export const MCP_OWN_TOOL_NAMES: readonly string[] = ['mcp_servers', 'mcp_load']


/**
 * 统计每个 serverName **当前**在工具注册表里注册了几个工具 —— 「连上没有」唯一零成本的证据。
 *
 * 为什么要它：`liveStatus()` 读的是 fiber 生命周期状态，而连不上时 mcp-client 的 apply
 * 照样 resolve（`failOnStartupError` 默认 false，不抛错），于是界面显示「运行中」而工具
 * 一个都没有——实测踩过：jenkins 不可达时卡片绿着，注册表里 `mcp__jenkins__*` 一个不存在。
 * 工具是连接成功 + `tools/list` 之后**唯一**会留下的产物，所以「active 且 0 个工具」就等于
 * 「没连上」，而且不需要任何网络探测（每次请求只是 O(工具数) 的内存遍历）。
 *
 * 读不到 `tools` 服务，或结构不符预期时返回 `undefined`：调用方据此**不下结论**——
 * 宁可什么都不说，也不能把「读不到」渲染成「未连接」。
 */
function registeredToolCounts(ctx: Context, serverNames: string[]): Map<string, number> | undefined {
  // **必须走 `ctx.get('tools')`**：cordis 里「属性访问服务」是**严格**的——服务不在本 fiber 的
  // 解析链上时，`ctx.tools` 直接抛 `cannot get property "tools" without inject`（宿主实测：就是
  // 这一行把一个 GET 变成空 400 的，见下面的兜底 try/catch 与 docs/troubleshooting）。
  // `get()` 是反射层的非严格取值：取不到返回 undefined，不抛。
  //
  // 顺序**照抄** search 包的 `getService(ctx, name)`（先 get、后属性）：它这么写就是因为踩过同一个坑；
  // 我之前图省事反着写，于是在真机上报错、而在单测的假 ctx 上完全看不出来。
  let service: unknown
  const get = (ctx as unknown as { get?: (name: string) => unknown }).get
  if (typeof get === 'function') {
    try {
      service = get.call(ctx, 'tools')
    } catch {
      service = undefined
    }
  }
  if (service === undefined) {
    try {
      service = (ctx as unknown as { tools?: unknown }).tools
    } catch {
      return undefined
    }
  }
  const schemas = (service as { schemas?: () => unknown } | undefined)?.schemas
  if (typeof schemas !== 'function') return undefined

  let list: unknown
  try {
    list = schemas.call(service)
  } catch {
    /* 注册表不可读按「不知道」处理 */
    return undefined
  }
  if (!Array.isArray(list)) return undefined
  const names = list
    .map((item) => (typeof item === 'object' && item !== null ? (item as { name?: unknown }).name : undefined))
    .filter((name): name is string => typeof name === 'string')

  const counts = new Map<string, number>()
  for (const serverName of serverNames) {
    // 前缀长到会被截断时归因不可靠（正常配置不会发生，见 MAX_PREFIX_LENGTH 的推导）：不猜，跳过这条
    const prefix = toolNamespacePrefix(serverName)
    if (prefix.length > MAX_PREFIX_LENGTH) continue
    counts.set(serverName, names.filter((name) => name.startsWith(prefix)).length)
  }
  return counts
}

/* ------------------------------------------------------------------ *
 * 服务器列表 DTO
 * ------------------------------------------------------------------ */

export function buildServersDto(ctx: Context): {
  servers: Array<Record<string, unknown>>
  fileError?: string
  patchFile: string
  /** 托管行里**真正**与外部实例重名的那些行（横幅只该渲染这份）。 */
  conflicts: Array<{ id: string; serverName: string }>
  /** 本插件之外的 mcp-client 实例清单（保存护栏与「外部占用」信息条用；与 conflicts 不是一回事）。 */
  externalServers: Array<{ id: string; serverName: string }>
  /** 成本可见性的阈值（见 `AGENT_TOOL_BUDGET`）：卡片拿它跟已知工具数合计比较，自己不留第二份。 */
  toolBudget: number
} {
  const managed = readManagedRows()
  const managedIds = new Set(managed.rows.map((row) => row.id))
  const externalServers = externalMcpEntries(ctx, managedIds)
  const usedExternalNames = new Set(externalServers.map((entry) => entry.serverName))
  // 真实连接态的证据（见 registeredToolCounts）：某行一个工具都没注册 = 它没连上。
  // 「读不到注册表」时这里是 undefined，逐行也就没有 toolCount —— 卡片据此不报警。
  const toolCounts = registeredToolCounts(ctx, managed.rows.map((row) => row.config.serverName))
  const servers = managed.rows.map((row) => {
    const config = row.config
    return {
      id: row.id,
      serverName: config.serverName,
      transport: config.transport,
      disabled: row.disabled === true,
      status: liveStatus(ctx, row.id),
      conflict: usedExternalNames.has(config.serverName),
      ...(toolCounts?.has(config.serverName) === true ? { toolCount: toolCounts.get(config.serverName) } : {}),
      config: {
        serverName: config.serverName,
        transport: config.transport,
        ...(config.command !== undefined ? { command: config.command } : {}),
        ...(config.args !== undefined ? { args: config.args } : {}),
        ...(config.env !== undefined ? { env: dtoMap(config.env) } : {}),
        ...(config.cwd !== undefined ? { cwd: config.cwd } : {}),
        ...(config.url !== undefined ? { url: config.url } : {}),
        ...(config.headers !== undefined ? { headers: dtoMap(config.headers) } : {}),
        ...(config.toolCallTimeoutMs !== undefined ? { toolCallTimeoutMs: config.toolCallTimeoutMs } : {}),
        ...(config.failOnStartupError !== undefined ? { failOnStartupError: config.failOnStartupError } : {}),
        ...(config.reconnect !== undefined ? { reconnect: config.reconnect } : {}),
      },
    }
  })
  return {
    ...(managed.fileError !== undefined ? { fileError: managed.fileError } : {}),
    servers,
    patchFile: managed.patchFile,
    toolBudget: AGENT_TOOL_BUDGET,
    // conflicts 只放交集（逐行 conflict 的同一份判据），外部清单另走 externalServers——
    // 曾经这里塞的是 external 原样，于是「没有任何重名」也会常驻一条冲突横幅（issue #5）。
    conflicts: externalNameClashes(
      managed.rows.map((row) => ({ id: row.id, serverName: row.config.serverName })),
      externalServers,
    ),
    externalServers,
  }
}

/* ------------------------------------------------------------------ *
 * 连接测试（不依赖 MCP SDK：直接说 JSON-RPC）
 * ------------------------------------------------------------------ */

interface ProbeResult {
  ok: boolean
  transport: 'stdio' | 'streamable-http'
  durationMs: number
  protocolVersion?: string
  serverInfo?: { name?: string; version?: string }
  tools?: Array<{ name: string; description?: string }>
  toolsCount: number
  error?: string
}

/**
 * 本插件版本：MCP initialize 的 clientInfo.version 会原样报给服务器，写死会随包
 * 版本漂移（曾长期停在 0.1.0），所以从 package.json 读取；读不到时回落到 '0.0.0'
 * 而不是让插件挂载失败。
 */
function readOwnVersion(): string {
  try {
    const pkg = createRequire(import.meta.url)('../package.json') as { version?: unknown }
    return typeof pkg.version === 'string' && pkg.version !== '' ? pkg.version : '0.0.0'
  } catch {
    return '0.0.0'
  }
}

const MCP_CLIENT_INFO = { name: 'dsh-mcp-config', version: readOwnVersion() }

function initRequest(protocolVersion: string) {
  return {
    jsonrpc: '2.0',
    id: 0,
    method: 'initialize',
    params: {
      protocolVersion,
      capabilities: {},
      clientInfo: MCP_CLIENT_INFO,
    },
  }
}

const toolsListRequest = { jsonrpc: '2.0', id: 1, method: 'tools/list' }
const initializedNotification = { jsonrpc: '2.0', method: 'notifications/initialized' }

/** 评估 !!js 表达式（与 loader 相同的信任模型：表达式本就来自用户自己的补丁文件）。 */
function evalValue(value: string | JsExpr): string {
  if (!isJsExpr(value)) return value
  const fn = new Function('process', 'return (' + value.__jsExpr + ')')
  const result = fn(process)
  return typeof result === 'string' ? result : String(result ?? '')
}

/* ------------------------------------------------------------------ *
 * 求值结果的自检：别让「凭据没注入」伪装成别的错
 * ------------------------------------------------------------------ */

/**
 * `!!js` 表达式里的 `process.env` 引用（点式与 `["KEY"]` 两种写法都认），带「是否被兜底」。
 *
 * `guarded` 判的是**引用之后紧跟的运算符**：`process.env.X ?? 'x'` / `X || 'x'` /
 * `X ? a : b` / `X?.length` 都在缺失时给得出合法值，不该算故障；而
 * `'Basic ' + process.env.X` 会把 undefined 直接拼进结果，才是要抓的那一类。
 */
const ENV_REF_PATTERN = /process\.env\.([A-Za-z_][A-Za-z0-9_]*)|process\.env\[\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]\s*\]/g
/** 引用之后允许的兜底运算符（`?.` 与三元 `?` 都算）。 */
const FALLBACK_OPERATOR = /^(?:\|\||&&|\?\??)/

interface EnvRef {
  key: string
  guarded: boolean
}

function envRefsOf(expression: string): EnvRef[] {
  const refs: EnvRef[] = []
  for (const match of expression.matchAll(ENV_REF_PATTERN)) {
    const key = match[1] ?? match[2]
    if (key === undefined) continue
    const rest = expression.slice((match.index ?? 0) + match[0].length).trimStart()
    refs.push({ key, guarded: FALLBACK_OPERATOR.test(rest) })
  }
  return refs
}

/**
 * 值里有没有「undefined 漏进来了」的证据。
 *
 * **只查字面量是不够的**——真机上凭据头长这样：
 * `Basic ` + `Buffer.from('undefined' + ':' + 'undefined').toString('base64')`
 * = `Basic dW5kZWZpbmVkOnVuZGVmaW5lZA==`，`includes('undefined')` 是 **false**（复核实测）。
 * 所以对「方案 + base64」形态的 token 再解码看一次；裸引用求值成空串则由调用方按
 * header 的语义补一条（空认证头同样是废的）。
 */
function undefinedEvidence(value: string, kind: 'header' | 'env'): boolean {
  if (value.includes('undefined')) return true
  for (const token of value.split(/\s+/)) {
    if (!/^[A-Za-z0-9+/]{8,}={0,2}$/.test(token)) continue
    if (Buffer.from(token, 'base64').toString('utf8').includes('undefined')) return true
  }
  return kind === 'header' && value === ''
}

/**
 * 「凭据没注入」的求值自检（否则返回 undefined）。
 *
 * 现场（2026-10-22，真机）：桌面版 profile 里 `JENKINS_USER` / `JENKINS_AUTH` 没有注入，
 * 拼接求值成 `Basic base64("undefined:undefined")`；服务器回 **401**，而探针当时把 401 当成
 * 「POST 没给响应 → 回去读 SSE」，最后报一句「SSE 流已结束」——查了四轮才定位。
 * 字符串拼接这种形态**不会抛错**，只会产出一个语法上合法的包头，所以必须在这里自检。
 *
 * 判据是「**未被兜底的缺失引用 + 结果里有 undefined 的证据**」两件同时成立：
 * 只看结果会漏掉 base64 那种，只看引用会误报 `process.env.X ?? 'default'` 这类合法写法。
 * 点名环境变量是刻意的：只报「值是 undefined」用户还得自己反推是哪几个 key。
 */
function unresolvedCredentialRejection(
  kind: 'header' | 'env',
  label: string,
  value: string,
  expression: string | undefined,
): string | undefined {
  // 非 !!js 的静态值：只有字面量 undefined 一种可能，属于配置笔误。
  if (expression === undefined) {
    return value.includes('undefined') ? label + ' 的值含字面量 undefined（请检查该字段的配置）' : undefined
  }

  const missing: string[] = []
  for (const ref of envRefsOf(expression)) {
    if (ref.guarded) continue
    const current = process.env[ref.key]
    if ((current === undefined || current === '') && !missing.includes(ref.key)) missing.push(ref.key)
  }
  // 证据的来源按「有没有缺失引用」分两档：有缺失才值得解 base64 / 把空串当证据
  // （真机那种 `Basic base64("undefined:undefined")` 只有这一档能抓到）；引用都有值时
  // 只认字面量，避免把随机 base64 令牌恰好解码出 `undefined` 的极小概率当成故障。
  const evidence = missing.length > 0 ? undefinedEvidence(value, kind) : value.includes('undefined')
  if (!evidence) return undefined

  if (missing.length > 0) {
    return (
      label + ' 引用的环境变量 ' + missing.join('、') + ' 在当前宿主进程里没有值（未注入）' +
      '——求值结果里因此出现了 undefined，服务器通常回 401。' +
      '请在「环境变量 / 密钥管理」里确认这些键已配置，并确认它们真的写进了本 profile 的宿主进程'
    )
  }
  return label + ' 的 !!js 表达式求值结果含 undefined（它引用的环境变量都有值，是表达式自身拼出来的；请检查表达式）'
}

/** 从累积缓冲区中切出完整 JSON-RPC 消息（支持换行分隔与 Content-Length 帧）。 */
function pullMessages(buffer: string): { messages: unknown[]; rest: string } {
  let rest = buffer
  const messages: unknown[] = []
  for (;;) {
    const framed = rest.match(/^Content-Length:\s*(\d+)\r?\n\r?\n/)
    if (framed !== null) {
      const length = Number(framed[1])
      const bodyStart = framed[0].length
      if (rest.length - bodyStart < length) break
      const body = rest.slice(bodyStart, bodyStart + length)
      rest = rest.slice(bodyStart + length)
      try {
        messages.push(JSON.parse(body))
      } catch {
        /* 非 JSON 帧忽略 */
      }
      continue
    }
    const newline = rest.indexOf('\n')
    if (newline === -1) break
    const line = rest.slice(0, newline).trim()
    rest = rest.slice(newline + 1)
    if (line === '') continue
    try {
      messages.push(JSON.parse(line))
    } catch {
      /* stderr 式日志行忽略 */
    }
  }
  return { messages, rest }
}

function probeStdio(config: McpServerConfig, timeoutMs: number): Promise<ProbeResult> {
  const startedAt = Date.now()
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(config.env ?? {})) env[key] = evalValue(value)
  // 求值自检必须放在**创建 Promise 之前**：`finish()` 会 `clearTimeout(timer)`，而 `timer`
  // 要到 spawn 之后才声明（`const`）。在 executor 里提前调 finish 会踩 TDZ——
  // 复核实测：`ReferenceError: Cannot access 'timer' before initialization`，
  // Promise 变成 reject（而不是 `{ ok: false }`），最后冒泡成路由 500。
  for (const [key, value] of Object.entries(env)) {
    const raw = config.env?.[key]
    const rejection = unresolvedCredentialRejection('env', 'env.' + key, value, isJsExpr(raw) ? raw.__jsExpr : undefined)
    if (rejection !== undefined) {
      return Promise.resolve({ ok: false, transport: 'stdio', durationMs: Date.now() - startedAt, toolsCount: 0, error: rejection })
    }
  }
  return new Promise((resolve) => {
    let settled = false
    let buffer = ''
    let stderrTail = ''
    // stderr 是给人看的诊断信息（Windows 上常来自 cmd.exe，按控制台代码页写），
    // 硬编码 UTF-8 会让「连接测试失败」的原因变成 `���`——而那是用户唯一的线索。
    // stdout 不走它：那边是 MCP 的 JSON-RPC 协议，被"容错"成别的编码就解析不了。
    const stderrDecoder = createOutputDecoder()
    let stderrFlushed = false
    /** 取 stderr 尾巴：先把解码器里残留的不完整字节吐出来，再截断。 */
    const readStderrTail = (): string => {
      if (!stderrFlushed) {
        stderrFlushed = true
        stderrTail = (stderrTail + stderrDecoder.flush()).slice(-2000)
      }
      return stderrTail
    }
    let retried = false
    let serverInfo: { name?: string; version?: string } | undefined
    let protocolVersion: string | undefined
    let child: ReturnType<typeof spawnPortable>
    const finish = (result: Omit<ProbeResult, 'transport' | 'durationMs'>) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      // 经 kit 收进程树：Windows 上直接子进程是 cmd.exe，真正的 MCP 服务器是它的孙进程，
      // 只 kill 直接子进程会把服务器留成孤儿（连接测试反复点就会攒一堆）。
      void terminateChild(child).catch(() => {})
      resolve({ ...result, transport: 'stdio', durationMs: Date.now() - startedAt })
    }
    // 不能裸 spawn：Windows 上 MCP 服务器常是 `.cmd` shim（codegraph 就是），裸 spawn 会
    // 直接 `spawn … EINVAL`（Node 对 .cmd 的加固），连接测试于是永远失败并误导用户。
    // 注意与**真正的**工具加载路径的区别：那条走 DSH 核心的
    // `@deepseek-ai/dsh-mcp-client` → 官方 SDK 的 StdioClientTransport（内部用 cross-spawn），
    // 本来就不受影响；这里修的只是本插件手写的这次探测。
    child = spawnPortable(config.command as string, config.args ?? [], {
      env: { ...process.env, ...env },
      cwd: config.cwd || undefined,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const timer = setTimeout(() => {
      finish({ ok: false, toolsCount: 0, error: '连接超时（' + timeoutMs + 'ms）' })
    }, timeoutMs)
    /*
     * stdin 必须挂 `error` 监听（2026-10-19 外部测评 issue #13 第 2 条）。
     *
     * 为什么：子进程启动即退出（服务器名写错、参数错、启动就崩）时，往它的 stdin 写数据
     * 会拿到 **EPIPE**——而 EPIPE 不是同步异常，是异步发到 `child.stdin` 上的 `'error'`
     * 事件。下面 `send()` 里的 try/catch 只接得住**同步**抛错，接不住它；`child` 上挂的
     * `error` / `exit` 监听也不管 stdin 的事件。于是它成了 uncaught exception，宿主的
     * `installFailLoud` 对 uncaught exception 一律 `exit(1)`：点一次「连接测试」，整个
     * DSH 进程退出，所有会话、Web 页面、其它插件一起中断。
     *
     * 而连接测试最常见的用途正是验证**还没调通**的配置，所以这不是边角路径。
     *
     * 实测（macOS，Node 22）：小报文在子进程退出后写多半只是返回 false（`stdin.destroyed`
     * 后 write 不抛），但**大报文**（≥64 KiB，例如超长的 args/env）与「子进程关掉 stdin
     * 但继续运行」两种形态都能稳定复现 uncaught EPIPE。所以这个监听是必需的，不是防御性冗余。
     *
     * 吞掉即可：进程已经没了，写失败是预期结果；真正的结论由 `exit` / 超时那条路径给。
     */
    child.stdin?.on('error', () => {
      /* 子进程已退出 / 关闭了 stdin：写失败是预期结果，不冒泡成 uncaught */
    })
    const send = (message: unknown) => {
      try {
        const stdin = child.stdin
        // 已 destroy 的流上 write 会同步抛 ERR_STREAM_DESTROYED；先判一下更干净，
        // 但**不能只靠这一判**——EPIPE 仍走上面的 'error' 事件。
        if (stdin === null || stdin.destroyed) return
        stdin.write(JSON.stringify(message) + '\n')
      } catch {
        /* 进程已退出 */
      }
    }
    const handleMessages = (messages: unknown[]) => {
      for (const raw of messages) {
        if (typeof raw !== 'object' || raw === null) continue
        const message = raw as {
          id?: unknown
          method?: unknown
          error?: unknown
          result?: { serverInfo?: unknown; protocolVersion?: unknown; tools?: unknown }
        }
        if (typeof message.method === 'string') continue
        if (message.id === 0) {
          if (message.error !== undefined && message.error !== null) {
            if (!retried) {
              retried = true
              send(initRequest('2024-11-05'))
              continue
            }
            finish({ ok: false, toolsCount: 0, error: 'initialize 失败: ' + JSON.stringify(message.error) })
            return
          }
          serverInfo = message.result?.serverInfo as { name?: string; version?: string } | undefined
          protocolVersion = typeof message.result?.protocolVersion === 'string' ? message.result.protocolVersion : undefined
          send(initializedNotification)
          send(toolsListRequest)
          continue
        }
        if (message.id === 1) {
          if (message.error !== undefined && message.error !== null) {
            finish({ ok: false, toolsCount: 0, error: 'tools/list 失败: ' + JSON.stringify(message.error) })
            return
          }
          const tools = Array.isArray(message.result?.tools)
            ? (message.result.tools as Array<{ name: string; description?: string }>)
            : []
          finish({ ok: true, serverInfo, protocolVersion, tools, toolsCount: tools.length })
          return
        }
      }
    }
    child.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8')
      const pulled = pullMessages(buffer)
      buffer = pulled.rest
      if (pulled.messages.length > 0) handleMessages(pulled.messages)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrTail = (stderrTail + stderrDecoder.decode(chunk)).slice(-2000)
    })
    child.on('error', (error: Error) => finish({ ok: false, toolsCount: 0, error: '启动失败: ' + error.message }))
    child.on('exit', (code: number | null) => {
      if (settled) return
      const tail = readStderrTail()
      finish({ ok: false, toolsCount: 0, error: '进程提前退出（code ' + String(code) + '）' + (tail ? '；stderr: ' + tail : '') })
    })
    send(initRequest('2025-03-26'))
  })
}

/** 从 SSE 文本中抽出所有 data: 载荷（SDK 每个事件一个 JSON）。 */
function extractSseData(text: string): string {
  let out = ''
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('data:')) out += line.slice(5).replace(/^ /, '') + '\n'
  }
  return out
}

function shiftSseMessage(buffer: { value: string }): unknown | undefined {
  const lines = buffer.value.split('\n')
  buffer.value = lines.slice(1).join('\n')
  const line = (lines[0] ?? '').trim()
  if (line === '') return undefined
  try {
    return JSON.parse(line)
  } catch {
    return undefined
  }
}

async function probeHttp(config: McpServerConfig, timeoutMs: number): Promise<ProbeResult> {
  const startedAt = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const finish = (result: Omit<ProbeResult, 'transport' | 'durationMs'>): ProbeResult => {
    clearTimeout(timer)
    return { ...result, transport: 'streamable-http', durationMs: Date.now() - startedAt }
  }
  let sessionId: string | undefined
  const sseBuffer = { value: '' }
  let sseReader: ReadableStreamDefaultReader<Uint8Array> | undefined
  try {
    const baseHeaders: Record<string, string> = {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
    }
    for (const [key, value] of Object.entries(config.headers ?? {})) {
      const evaluated = evalValue(value)
      // 与 probeStdio 的 env 同一道防呆：拼接出的 `Basic base64("undefined:undefined")`
      // 是**合法**字符串，服务器只会回 401，用户看不出是自己这边没注入。
      const undefinedInValue = unresolvedCredentialRejection('header', 'headers.' + key, evaluated, isJsExpr(value) ? value.__jsExpr : undefined)
      if (undefinedInValue !== undefined) return finish({ ok: false, toolsCount: 0, error: undefinedInValue })
      baseHeaders[key] = evaluated
    }
    const withSession = (extra: Record<string, string>) => ({
      ...extra,
      ...(sessionId !== undefined ? { 'mcp-session-id': sessionId } : {}),
    })
    /**
     * 401 / 403 是**权威结论**，必须当场报出来。
     *
     * 现场（2026-10-22，真机）：凭据没注入 → `Authorization: Basic base64("undefined:undefined")`
     * → Jenkins 回 401。旧代码把 401 当成「POST 没直接给响应」，转去开 GET SSE 流；
     * Jenkins 对那条 GET 同样回 401（空 body），于是 `ensureSse` 拿到一个立刻结束的流，
     * 最后抛出 **「SSE 流已结束」**——真实原因是认证失败，报出来的却是一句与认证无关的
     * 传输层噪声，查了四轮才定位。
     */
    const unauthorizedError = (response: Response): Error => {
      // 直接 return 会把这条响应挂在「未读」状态：探针本身是一次性的，但反复点
      // 「连接测试」时未消费的 body 会占着 undici 的连接，显式 cancel 掉。
      if (response.body !== null) void response.body.cancel().catch(() => {})
      const header = response.headers.get('www-authenticate')
      return new Error(
        '认证失败(HTTP ' + String(response.status) + ')' +
        (header === null ? '' : '：' + header) +
        '；请检查该服务器的认证头配置（如 Authorization）与环境变量是否已注入',
      )
    }
    const ensureSse = async () => {
      if (sseReader !== undefined) return
      const response = await fetch(config.url as string, {
        method: 'GET',
        headers: withSession({ accept: 'text/event-stream' }),
        signal: controller.signal,
      })
      const sid = response.headers.get('mcp-session-id')
      if (sid !== null) sessionId = sid
      // 同上：认证失败在 GET 这条路上同样要当场报，不能等流结束。
      if (response.status === 401 || response.status === 403) throw unauthorizedError(response)
      // GET 的 4xx/5xx 也不该被当成「流结束了」：405 在这里等价于「服务器不提供 SSE」，
      // 继续读只会读到一段错误 body 然后报「SSE 流已结束」。
      if (response.status >= 400) throw new Error('服务器未提供 SSE 流（GET HTTP ' + response.status + '）')
      if (response.body === null) throw new Error('服务器未返回 SSE 流')
      sseReader = response.body.getReader()
    }
    const readSseChunk = async () => {
      await ensureSse()
      const { value, done } = await sseReader!.read()
      if (done) throw new Error('SSE 流已结束')
      sseBuffer.value += extractSseData(new TextDecoder().decode(value))
    }
    /**
     * POST 一条 JSON-RPC 消息；响应可能直接在 POST body 里，也可能是
     * 202/204/405 后走 GET SSE 流。循环读取直到拿到匹配 expectId 的消息。
     */
    const expectResponse = async (body: unknown, expectId: number): Promise<Record<string, unknown> | undefined> => {
      const response = await fetch(config.url as string, {
        method: 'POST',
        headers: withSession(baseHeaders),
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      const sid = response.headers.get('mcp-session-id')
      if (sid !== null) sessionId = sid
      // 401/403 必须先于「读 body 再决定走不走 SSE」：否则这个响应会被当成
      // 「POST 没给响应」，一路兜底到 GET SSE，最后报一句与认证无关的「SSE 流已结束」。
      if (response.status === 401 || response.status === 403) throw unauthorizedError(response)
      const contentType = response.headers.get('content-type') ?? ''
      const text = await response.text()
      if (contentType.includes('text/event-stream')) {
        sseBuffer.value += extractSseData(text)
      } else if (text.trim() !== '' && response.status !== 405 && response.status !== 202 && response.status !== 204) {
        try {
          const parsed = JSON.parse(text) as Record<string, unknown>
          if (parsed.id === expectId || parsed.error !== undefined) return parsed
        } catch {
          /* 非 JSON body，走 SSE */
        }
      }
      // 仍然没拿到 JSON-RPC 响应、而状态是错误码：这是**服务器明确拒绝**，不是
      // 「POST 没给响应」。不在这里收口就会一路兜底到 GET SSE，最后报一句与真实原因
      // 无关的「SSE 流已结束」（404 / 500 都实测复现过，和 401 是同一个谎）。
      if (response.status >= 400 && response.status !== 405) {
        const detail = text.trim().replace(/\s+/g, ' ').slice(0, 160)
        throw new Error('服务器返回 HTTP ' + response.status + (detail === '' ? '' : '：' + detail))
      }
      for (;;) {
        const message = shiftSseMessage(sseBuffer)
        if (message !== undefined && typeof message === 'object' && message !== null) {
          const record = message as Record<string, unknown>
          if (record.id === expectId || record.error !== undefined) return record
        }
        await readSseChunk()
      }
    }
    let initRecord = await expectResponse(initRequest('2025-03-26'), 0)
    if (initRecord !== undefined && initRecord.error !== undefined) {
      initRecord = (await expectResponse(initRequest('2024-11-05'), 0)) ?? initRecord
      if (initRecord.error !== undefined) throw new Error('initialize 失败: ' + JSON.stringify(initRecord.error))
    }
    // notifications/initialized：不等待响应
    try {
      await fetch(config.url as string, {
        method: 'POST',
        headers: withSession(baseHeaders),
        body: JSON.stringify(initializedNotification),
        signal: controller.signal,
      })
    } catch {
      /* 通知发送失败不致命 */
    }
    const initResult = initRecord?.result as Record<string, unknown> | undefined
    const toolsRecord = await expectResponse(toolsListRequest, 1)
    if (toolsRecord === undefined || toolsRecord.error !== undefined) {
      throw new Error('tools/list 失败: ' + JSON.stringify(toolsRecord?.error ?? '(无响应)'))
    }
    const listResult = toolsRecord.result as { tools?: Array<{ name: string; description?: string }> } | undefined
    const tools = Array.isArray(listResult?.tools) ? listResult.tools : []
    return finish({
      ok: true,
      protocolVersion: typeof initResult?.protocolVersion === 'string' ? initResult.protocolVersion : undefined,
      serverInfo: initResult?.serverInfo as { name?: string; version?: string } | undefined,
      tools,
      toolsCount: tools.length,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return finish({ ok: false, toolsCount: 0, error: '连接超时（' + timeoutMs + 'ms）' })
    // fetch 在网络层失败时只给一句 "fetch failed"，真正的原因（ECONNREFUSED / DNS / TLS）
    // 在 error.cause 里 —— 不带上它，用户看到的就是一句无从下手的「fetch failed」。
    const cause = error instanceof Error && error.cause !== undefined
      ? (error.cause instanceof Error ? error.cause.message : String(error.cause))
      : undefined
    const base = error instanceof Error ? error.message : String(error)
    return finish({ ok: false, toolsCount: 0, error: cause === undefined || cause === '' || base.includes(cause) ? base : base + '：' + cause })
  }
}

/**
 * 连接测试入口（`POST /api/dsh-mcp/test` 走这里）。
 *
 * 导出只为单测：探测的两条关键判据（401/403 定性、凭据未注入自检）都在**网络之前**，
 * 用用例钉住比真机截图稳定。运行期它只被路由调用。
 */
export async function testServer(rawConfig: unknown): Promise<ProbeResult> {
  const validated = validateConfig(rawConfig)
  if (validated.error !== undefined) {
    const transport = (rawConfig as { transport?: 'stdio' | 'streamable-http' } | null)?.transport === 'streamable-http' ? 'streamable-http' : 'stdio'
    return { ok: false, transport, durationMs: 0, toolsCount: 0, error: validated.error }
  }
  const config = validated.config as McpServerConfig
  if (config.transport === 'stdio') return probeStdio(config, PROBE_TIMEOUT_MS)
  return probeHttp(config, PROBE_TIMEOUT_MS)
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

/** 拒绝日志的最小形状（宿主 logger 结构上兼容）。 */
interface RouteLogger {
  warn(message: string): void
}

/*
 * 回环围栏与同源证明：**实现已收敛到 `@hyzyn/dsh-kit`**（2026-09-25，项目级 ROADMAP 第 1
 * 项）。本包此前那份只认 `127.0.0.1` 一个字面量的同步围栏已删除，改走 kit 的加固档
 * （docker D31/D80/D110），并给写操作补上同源证明（docker D32/D139）——成因与桌面版例外
 * 的唯一归宿在 `packages/kit/src/http.ts`，这里只留指针。
 */

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

/**
 * 路由闸门（导出仅供单测，与 tty 的 `gateRoute` 同思路）：**回环围栏（加固档，docker D31）
 * + 方法闸门 + 写操作的同源证明（docker D32，含桌面壳例外 D139）**。三条路由共用它，
 * 所以「拒绝分支」只有一份，负例也只测这一份。
 *
 * 顺序与 docker 一致：先回环 → 再方法 → 最后同源证明。跨站 GET 打到写路由仍是 405
 * （方法不对就说方法不对），不会因为「没带证明」而多给一条信息。
 *
 * 本插件的 POST 只有两条：`/servers/save`（写 home 补丁文件）与 `/test`（起子进程探活），
 * 都是货真价实的变更端点；GET `/servers` 只读，维持 loopback-only。
 */
export async function routeGate(req: ReqLike, res: ResLike, method: string, logger?: RouteLogger): Promise<boolean> {
  if (!(await isLoopbackRequestStrict(req))) {
    writeJson(res, 403, { error: 'forbidden: loopback-only' })
    return false
  }
  if (req.method !== method) {
    writeJson(res, 405, { error: 'method not allowed: ' + String(req.method) })
    return false
  }
  if (method === 'POST' && !hasSameOriginProof(req)) {
    logger?.warn(`dsh-mcp-config: 拒绝无同源证明的变更请求 ${req.url ?? ''}（${originProofHint(req)}）`)
    writeJson(res, 403, { error: '缺少同源证明（需要 Origin 或 Sec-Fetch-Site: same-origin）：变更端点拒绝无来源请求' })
    return false
  }
  return true
}

function makeRoutes(ctx: Context): Array<{ kind: 'exact'; path: string; handler: RouteHandler }> {
  const logger = (ctx as unknown as { logger?: RouteLogger }).logger
  const guard = async (req: ReqLike, res: ResLike, method: string): Promise<boolean> => await routeGate(req, res, method, logger)
  return [
    {
      kind: 'exact',
      path: '/api/dsh-mcp/servers',
      handler: async (req, res) => {
        if (!(await guard(req, res, 'GET'))) return
        // 读 DTO 失败**不能**变成一个空 400：宿主 webserver 对 handler 抛错只回 400 + 空 body，
        // 界面上什么原因都看不到（只能去翻宿主 stderr）。围栏已经过了（loopback-only + 方法闸门），
        // 所以把原因原样交回去是安全的，也让下一次出问题时一眼可查。
        let dto: ReturnType<typeof buildServersDto>
        try {
          dto = buildServersDto(ctx)
        } catch (error) {
          const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
          logger?.warn(`dsh-mcp-config: 读取服务器列表失败 ${message}`)
          writeJson(res, 500, {
            ok: false,
            error: message,
            ...(error instanceof Error && error.stack !== undefined ? { stack: error.stack } : {}),
          })
          return
        }
        writeJson(res, 200, { ok: true, ...dto })
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-mcp/servers/save',
      handler: async (req, res) => {
        if (!(await guard(req, res, 'POST'))) return
        const body = await readJsonBody(req)
        if (body === undefined) {
          writeJson(res, 400, { error: 'invalid JSON body' })
          return
        }
        const rawServers = body.servers
        if (!Array.isArray(rawServers)) {
          writeJson(res, 400, { error: 'servers 必须是数组' })
          return
        }
        const rows: McpRow[] = []
        const seenIds = new Set<string>()
        const seenNames = new Set<string>()
        for (const rawRow of rawServers) {
          if (typeof rawRow !== 'object' || rawRow === null) {
            writeJson(res, 400, { error: '每条服务器必须是对象' })
            return
          }
          const input = rawRow as Record<string, unknown>
          const id = typeof input.id === 'string' ? input.id : ''
          if (!ROW_ID_RE.test(id)) {
            writeJson(res, 400, { error: '非法 id: ' + JSON.stringify(id) })
            return
          }
          if (seenIds.has(id)) {
            writeJson(res, 400, { error: '重复的 id: ' + id })
            return
          }
          seenIds.add(id)
          const validated = validateConfig(input.config)
          if (validated.error !== undefined) {
            writeJson(res, 400, { error: id + ': ' + validated.error })
            return
          }
          const config = validated.config as McpServerConfig
          if (seenNames.has(config.serverName)) {
            writeJson(res, 400, { error: 'serverName 重复: ' + config.serverName })
            return
          }
          seenNames.add(config.serverName)
          rows.push({ id, config, ...(input.disabled === true ? { disabled: true } : {}) })
        }
        const managed = readManagedRows()
        // 外部实例重名（别的插件托管的 mcp-client）——只拦新引入的重复，历史遗留放行
        const clash = externalNameRejection(
          rows.map((row) => ({ id: row.id, serverName: row.config.serverName })),
          managed.rows.map((row) => ({ id: row.id, serverName: row.config.serverName })),
          externalMcpEntries(ctx, new Set(managed.rows.map((row) => row.id))),
        )
        if (clash !== undefined) {
          writeJson(res, 400, { error: clash })
          return
        }
        // 空列表 = 清空全部：没有显式 clearAll 就拒绝，避免竞态 / 陈旧卡片静默抹掉配置。
        const rejection = emptyServersRejection(rows.length, managed.rows.length, body.clearAll)
        if (rejection !== undefined) {
          writeJson(res, 400, { error: rejection })
          return
        }
        try {
          writeManagedRows(rows)
        } catch (error) {
          writeJson(res, 500, { error: '写入补丁文件失败: ' + (error instanceof Error ? error.message : String(error)) })
          return
        }
        // DTO 必须在**保存之后**读：它要反映刚落地的行集与工具数。
        const dto = buildServersDto(ctx)
        writeJson(res, 200, { ok: true, applied: true, ...dto })
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-mcp/test',
      handler: async (req, res) => {
        if (!(await guard(req, res, 'POST'))) return
        const body = await readJsonBody(req)
        if (body === undefined) {
          writeJson(res, 400, { error: 'invalid JSON body' })
          return
        }
        const result = await testServer(body.config)
        writeJson(res, 200, { ok: true, result: { ...result, ...(result.tools !== undefined ? { tools: result.tools.slice(0, MAX_TOOLS_REPORTED) } : {}) } })
      },
    },
  ]
}

/* ------------------------------------------------------------------ *
 * 插件本体
 * ------------------------------------------------------------------ */

const MCP_GUIDANCE = '本机装有 dsh-mcp-config 插件（MCP 服务器配置）：用户提到「MCP 配置 / MCP 服务器」时，引导他打开 设置 → 插件配置 → MCP 服务器配置 卡片，别手改托管区块。'

/* ------------------------------------------------------------------ *
 * 按需加载：两个自有工具（`agentToolLoading: 'on-demand'`）
 * ------------------------------------------------------------------ */

/** `mcp_servers` 的一行（与 `defineTool` 的 `output.schema` 推断结果一致）。 */
interface ServersToolRow {
  server: string
  transport: string
  /** `disabled` = 托管行被停用（其工具本来也不会注册）。 */
  state: 'enabled' | 'disabled'
  /** `null` = 读不到工具注册表（**不是 0**）。 */
  tools: number | null
  loaded: boolean
}

/** `mcp_servers` 的返回值。 */
interface ServersToolResult {
  mode: 'eager' | 'on-demand'
  servers: ServersToolRow[]
  note?: string
}

/** `mcp_load` 的返回值。 */
interface LoadToolResult {
  loaded: string[]
  tools: string[]
  unknown: string[]
  note?: string
}

/** 空配置的提示（契约固定文案；模型据此把用户引到卡片）。 */
const SERVERS_EMPTY_NOTE = '本机还没有配置任何 MCP server。引导用户打开「设置 → 插件配置 → MCP 服务器配置」卡片添加'
/** 一个都没装载时的提示（on-demand 的默认态）。 */
const SERVERS_ON_DEMAND_NOTE = 'MCP 工具默认不加载：先用本工具看有哪些 server，再用 mcp_load({servers:[…]}) 装载需要的'

export function apply(ctx: Context, rawConfig?: Config): void {
  const config = (rawConfig ?? {}) as Config
  if (config.enabled === false) return
  const routes = makeRoutes(ctx)
  const announce = config.announceToAgent !== false

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
    }, 'dsh-mcp-config: routes')
  })

  /*
   * agent 工具面：**两层**，各自独立、互不干扰。
   *
   * ## ① 档位层（`attachTierRestrict`）：受限档裁掉全部 `mcp__*`
   *
   * 为什么 MCP 工具需要一个**本仓的**闸：宿主侧 `dsh-mcp-client` 用裸 `ctx.tools.register()` 注册
   * 它们，没有任何档位 / 审批 / sandbox 代码，三个插件闸也只认各自的前缀（判据与运行期实测见
   * docs/permission-tier-plan.md 的「`mcp__*`」条）——所以只读档下模型仍能直接调
   * `mcp__jenkins__triggerBuild`。本插件是这些 server 的配置方，按 `mcp__` 前缀把它们接进同一套
   * 档位裁剪；**读 / 写语义本仓判不了，一律按最坏的 `exec` 处理**（宁严勿松）。
   *
   * 本插件自己的两个工具也一起接进这张表（`MCP_OWN_TOOL_NAMES`）：`mcp_servers` 是只读的索引，
   * `mcp_load` 会**改变工具面**、按最坏类算 `exec` —— 受限档装不回来，安全边界因此不变。
   *
   * ## ② 按需加载层（`attachAgentSurface`，`agentToolLoading: 'on-demand'` 才有）
   *
   * 工具照旧注册，但给每个 agent 装一条限制把全部 `mcp__*` 摘掉，只留 `mcp_servers` / `mcp_load`；
   * 两条限制在宿主 scope 层里**取交集**，所以「受限档 + 已装载」仍是零 `mcp__*`。
   * `'eager'`（默认）时 `attachAgentSurface` 收到 `enabled: false`，不订阅、不注册工具、一次
   * `restrict()` 都不额外发——默认档位的行为与改动前逐字节一致。
   *
   * 位置：`ctx.inject(['tools'])` 的 effect 体里（本插件**没有**声明式 `inject: ['tools']`，
   * 在插件 ctx 上读 `tools` 会撞 cordis 的 inject 守卫）。传 `toolsCtx` 而不是插件 `ctx`：
   * 两条限制都要用 tools 的全局 `schemas()` 现算 deny 名单，拿不到会**静默退化**成不裁剪
   * （与 docker `src/index.ts` 同款写法，原因逐行记在那里）。
   *
   * 零 server 时这里是**纯 no-op**：`schemas()` 里没有 `mcp__*` ⇒ deny 为空 ⇒ 一次
   * `restrict()` 都不发生、一行日志都不打（订阅本身留着，否则「之后才加上的 server」要等重启）。
   */
  ctx.inject(['tools'], (toolsCtx: Context) => {
    toolsCtx.effect(() => {
      const mode: 'eager' | 'on-demand' = config.agentToolLoading === 'on-demand' ? 'on-demand' : 'eager'
      const disposers: Array<() => void> = []
      let surface: AgentSurfaceControl | undefined

      /**
       * 托管行（`buildServersDto` 是唯一读取逻辑：卡片、路由、两个工具与装载白名单共用它）。
       *
       * 传 `toolsCtx` 而不是插件 `ctx`：它读得到工具注册表，`toolCount`（真实连接态的证据）才
       * 有意义；插件 ctx 上读不到就只会一路 `null`。
       */
      const serverRows = (): Array<Record<string, unknown>> => {
        try {
          return buildServersDto(toolsCtx).servers
        } catch {
          return []
        }
      }
      /** 可装载的 server 名（顺序 = 托管行顺序）。 */
      const serverNames = (): string[] => {
        const names: string[] = []
        for (const row of serverRows()) {
          const name = row.serverName
          if (typeof name === 'string' && name !== '') names.push(name)
        }
        return names
      }

      /*
       * 先挂按需加载、再注册两个工具：限制层要在「第一个 agent 出现」之前就在监听
       * （`agent/created` 不会补发），而工具注册只是让模型有入口。
       */
      disposers.push(attachAgentSurface(toolsCtx, {
        enabled: mode === 'on-demand',
        log: (message: string) => console.log('[dsh-mcp-config] ' + message),
        listServers: serverNames,
        onReady: (control: AgentSurfaceControl) => {
          surface = control
        },
      }))

      const tools = (toolsCtx as unknown as { tools?: { register(definition: unknown): () => void } }).tools
      if (mode === 'on-demand' && tools !== undefined && typeof tools.register === 'function') {
        const definitions = [
          defineTool({
            name: 'mcp_servers',
            // 只读工具：与同轮其它工具并发执行（宿主默认把未声明的工具当独占）。
            isConcurrencySafe: () => true,
            description: '列出本机配置的 MCP server（名称 / 传输方式 / 启用状态 / 工具数 / 当前会话是否已装载）。MCP 工具默认不加载：先用本工具看有哪些 server，再用 mcp_load({servers:[…]}) 装载需要的。',
            parameters: {},
            output: {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  mode: { type: 'string', enum: ['eager', 'on-demand'], required: true },
                  servers: {
                    type: 'array',
                    required: true,
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      properties: {
                        server: { type: 'string', required: true },
                        transport: { type: 'string', required: true },
                        state: { type: 'string', enum: ['enabled', 'disabled'], required: true },
                        // null = 读不到工具注册表（不是 0）
                        tools: { oneOf: [{ type: 'number' }, { type: 'null' }], required: true },
                        loaded: { type: 'boolean', required: true },
                      },
                    },
                  },
                  note: { type: 'string' },
                },
              },
              render: (_args: unknown, value: unknown): Array<{ type: 'text'; text: string }> => {
                const result = value as ServersToolResult
                const lines = [`MCP server（${result.mode}）：${String(result.servers.length)} 个`]
                for (const row of result.servers) {
                  const count = row.tools === null ? '工具数未知' : `${String(row.tools)} 个工具`
                  lines.push(`- ${row.server}（${row.transport}，${row.state}，${count}，${row.loaded ? '已装载' : '未装载'}）`)
                }
                if (result.note !== undefined) lines.push(result.note)
                return [{ type: 'text', text: lines.join('\n') }]
              },
            },
            async execute(_args: unknown, exec: { agent?: unknown }): Promise<ServersToolResult> {
              let rows: Array<Record<string, unknown>> = []
              let fileError: string | undefined
              try {
                const dto = buildServersDto(toolsCtx)
                rows = dto.servers
                fileError = dto.fileError
              } catch {
                fileError = '读取托管区块失败'
              }
              const loaded = new Set(mode === 'on-demand' ? (surface?.loadedServers(exec?.agent) ?? []) : [])
              const servers: ServersToolRow[] = rows.map((row) => {
                const server = typeof row.serverName === 'string' ? row.serverName : ''
                return {
                  server,
                  transport: typeof row.transport === 'string' ? row.transport : '',
                  state: row.disabled === true ? 'disabled' : 'enabled',
                  tools: typeof row.toolCount === 'number' ? row.toolCount : null,
                  loaded: loaded.has(server),
                }
              })
              let note: string | undefined
              if (fileError !== undefined) note = `读不到托管区块：${fileError}`
              else if (servers.length === 0) note = SERVERS_EMPTY_NOTE
              else if (mode === 'on-demand' && servers.every((row) => !row.loaded)) note = SERVERS_ON_DEMAND_NOTE
              return { mode, servers, ...(note === undefined ? {} : { note }) }
            },
          }),
          defineTool({
            name: 'mcp_load',
            // 会改变当前会话的工具面（写操作）：不适合同轮并发，保持默认的独占调度。
            description: '装载（或卸载）MCP server 的工具到当前会话：参数是该 server 的 serverName 列表（来自 mcp_servers），传空数组 = 全部卸掉。只装载认识的 server，未知名字会被忽略并回报；返回装载后当前会话真正能调用的 MCP 工具名。',
            parameters: {
              servers: {
                type: 'array',
                required: true,
                items: { type: 'string' },
                description: '要装载的 serverName 列表；传空数组 = 全部卸掉',
              },
            },
            output: {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  loaded: { type: 'array', required: true, items: { type: 'string' } },
                  tools: { type: 'array', required: true, items: { type: 'string' } },
                  unknown: { type: 'array', required: true, items: { type: 'string' } },
                  note: { type: 'string' },
                },
              },
              render: (_args: unknown, value: unknown): Array<{ type: 'text'; text: string }> => {
                const result = value as LoadToolResult
                const lines: string[] = []
                if (result.loaded.length === 0) {
                  lines.push('当前会话没有装载任何 MCP server：工具表里没有任何 MCP 工具。')
                } else {
                  lines.push(`已装载：${result.loaded.join(', ')}（当前会话可见 ${String(result.tools.length)} 个 MCP 工具）`)
                }
                if (result.tools.length > 0) lines.push('可调用：' + result.tools.join(', '))
                if (result.note !== undefined) lines.push(result.note)
                return [{ type: 'text', text: lines.join('\n') }]
              },
            },
            async execute(args: unknown, exec: { agent?: unknown }): Promise<LoadToolResult> {
              const input = (args ?? {}) as { servers?: unknown }
              const requested = Array.isArray(input.servers)
                ? input.servers.filter((name): name is string => typeof name === 'string')
                : []
              const agent = exec?.agent
              if (agent === undefined || agent === null) {
                return { loaded: [], tools: [], unknown: [], note: '这个工具需要会话上下文' }
              }
              if (surface === undefined) {
                return { loaded: [], tools: [], unknown: [], note: '按需加载没有挂载（宿主缺少 tools 服务），MCP 工具保持原样' }
              }
              const result = surface.load(agent, requested)
              const note = result.unknown.length === 0
                ? undefined
                : `未知 server：${result.unknown.join(', ')}；可用：${serverNames().join(', ') || '(无)'}`
              return {
                loaded: result.loaded,
                tools: result.tools,
                unknown: result.unknown,
                ...(note === undefined ? {} : { note }),
              }
            },
          }),
        ]
        for (const definition of definitions) {
          try {
            disposers.push(tools.register(definition))
          } catch (error) {
            // 单个工具注册失败不该把整批带下去（与 docker 的 add 同一口径）。
            console.warn(`[dsh-mcp-config] agent 工具注册失败：${error instanceof Error ? error.message : String(error)}`)
          }
        }
        console.log('[dsh-mcp-config] agent tool loading: on-demand（' + MCP_OWN_TOOL_NAMES.join(', ') + '）')
      }

      return () => {
        // 先撤按需加载的限制、再撤工具（撤销走的是 agent scope 上的 disposer，工具还挂着时最干净）。
        for (const dispose of disposers.splice(0).reverse()) {
          try {
            dispose()
          } catch {
            /* 已注销 */
          }
        }
        surface = undefined
      }
    }, 'dsh-mcp-config: agent tool visibility')

    /*
     * 档位层：与上面同一个 effect 体，但**独立**于按需加载（eager 档也照旧生效）。
     *
     * 两处分工见函数头 `①`：档位裁的是「按当前档位不可能成功」的 write / exec 与全部 `mcp__*`；
     * 按需加载裁的是「这个会话还没说要」的 `mcp__*`。交集语义由宿主的 scope 层保证。
     */
    toolsCtx.effect(() => attachTierRestrict(toolsCtx, {
      pkg: 'mcp',
      // 「mcp__*」是宿主族（一律按最坏类 exec）；两个自有工具单独列名，`mcp_servers` 只读、
      // `mcp_load` 改工具面（exec）。前缀外的工具一个都不裁。
      prefixes: [...MCP_TIER_PREFIXES, ...MCP_OWN_TOOL_NAMES],
      classify: (tool: string) => (tool === 'mcp_servers' ? 'read' : 'exec'),
    }), 'dsh-mcp-config: agent tool visibility (tier)')
  })

  if (announce) {
    ctx.inject(['systemPrompt'], (promptCtx: Context) => {
      promptCtx.effect(() => {
        const systemPrompt = (promptCtx as unknown as { systemPrompt: { section(options: { name: string; order?: number; text: string }): () => void } }).systemPrompt
        return registerLiteralSection(systemPrompt, { name: 'plugin:dsh-mcp-config', order: 150, text: MCP_GUIDANCE })
      }, 'dsh-mcp-config: announcement')
    })
  }

  console.log('[dsh-mcp-config] mounted, patch file: ' + homePatchPath())
}







