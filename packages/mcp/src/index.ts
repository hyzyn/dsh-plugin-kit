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
import { spawn } from 'node:child_process'
import { chmodSync, existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import yaml from 'js-yaml'

export const name = 'mcp-config'
export const inject: string[] = []

export interface Config {
  /** 关闭整个插件（不注册路由、不发布提示）。默认开。 */
  enabled?: boolean
  /** 是否向 agent 注入插件能力公告。默认开。 */
  announceToAgent?: boolean
}

/* ------------------------------------------------------------------ *
 * 常量与类型
 * ------------------------------------------------------------------ */

const MCP_CLIENT_PACKAGE = '@deepseek-ai/dsh-mcp-client'
const MARK_START = '# --- dsh-mcp-config managed (auto-generated; do not edit) ---'
const MARK_END = '# --- end dsh-mcp-config managed ---'
const SERVER_NAME_RE = /^[A-Za-z0-9_-]{1,32}$/
const ROW_ID_RE = /^mcp-[a-z0-9-]{1,64}$/
const MAX_TIMER_DELAY_MS = 2 ** 31 - 1
const PROBE_TIMEOUT_MS = 25_000
const MAX_JSON_BODY_BYTES = 512 * 1024
const MAX_TOOLS_REPORTED = 200

const dshHome = () => process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
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
  const lines = text.split('\n')
  const start = lines.findIndex((line) => line.includes('dsh-mcp-config managed'))
  const result: ManagedRead = { rows: [], patchFile }
  if (start === -1) return result
  const end = lines.findIndex((line, index) => index > start && line.includes('end dsh-mcp-config managed'))
  if (end === -1) {
    result.fileError = '托管区块缺少结束标记（# --- end dsh-mcp-config managed ---）'
    return result
  }
  const block = lines.slice(start + 1, end).join('\n')
  if (block.trim() === '' || block.split('\n').every((line) => line.trim() === '' || line.trim().startsWith('#'))) return result
  try {
    const parsed = yaml.load(block, { schema: YAML_SCHEMA })
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

/** 把托管区块写回 home 补丁文件（原子替换，保留文件其它内容与权限）。 */
function writeManagedRows(rows: McpRow[]): void {
  const patchFile = homePatchPath()
  const existed = existsSync(patchFile)
  const mode = existed ? (statSync(patchFile).mode & 0o777) : 0o600
  const text = existed ? readFileSync(patchFile, 'utf8') : '# dsh home patch layer\n'
  const lines = text.split('\n')
  const start = lines.findIndex((line) => line.includes('dsh-mcp-config managed'))
  const end = start === -1 ? -1 : lines.findIndex((line, index) => index > start && line.includes('end dsh-mcp-config managed'))
  const block = MARK_START + '\n' + renderManagedBlock(rows) + MARK_END + '\n'
  let next: string
  if (start === -1) {
    next = text.replace(/\s*$/, '') + (text.trim() === '' ? '' : '\n') + '\n' + block
  } else if (end === -1) {
    next = lines.slice(0, start).join('\n') + '\n' + block
  } else {
    next = [...lines.slice(0, start), ...block.split('\n'), ...lines.slice(end + 1)].join('\n')
  }
  const tmp = join(dirname(patchFile), '.cordis.patch.yml.' + process.pid + '.tmp')
  writeFileSync(tmp, next, { mode })
  renameSync(tmp, patchFile)
  if (!existed || (mode & 0o077) !== 0) chmodSync(patchFile, mode)
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
  const initialDelayMs = raw.initialDelayMs === undefined ? 500 : Number(raw.initialDelayMs)
  const maxDelayMs = raw.maxDelayMs === undefined ? 30_000 : Number(raw.maxDelayMs)
  const maxAttempts = raw.maxAttempts === undefined ? 10 : Number(raw.maxAttempts)
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

/** 查找本插件托管之外的 mcp-client 实例（用于 serverName 冲突提示）。 */
function externalMcpEntries(ctx: Context, managedIds: Set<string>): Array<{ id: string; serverName: string }> {
  const loader = (ctx as unknown as { loader?: { entries(): Iterable<unknown> } }).loader
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

/* ------------------------------------------------------------------ *
 * 服务器列表 DTO
 * ------------------------------------------------------------------ */

function buildServersDto(ctx: Context): {
  servers: Array<Record<string, unknown>>
  fileError?: string
  patchFile: string
  conflicts: Array<{ id: string; serverName: string }>
} {
  const managed = readManagedRows()
  const managedIds = new Set(managed.rows.map((row) => row.id))
  const external = externalMcpEntries(ctx, managedIds)
  const usedExternalNames = new Set(external.map((entry) => entry.serverName))
  const servers = managed.rows.map((row) => {
    const config = row.config
    return {
      id: row.id,
      serverName: config.serverName,
      transport: config.transport,
      disabled: row.disabled === true,
      status: liveStatus(ctx, row.id),
      conflict: usedExternalNames.has(config.serverName),
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
    conflicts: external,
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

function initRequest(protocolVersion: string) {
  return {
    jsonrpc: '2.0',
    id: 0,
    method: 'initialize',
    params: {
      protocolVersion,
      capabilities: {},
      clientInfo: { name: 'dsh-mcp-config', version: '0.1.0' },
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
  return new Promise((resolve) => {
    const startedAt = Date.now()
    let settled = false
    let buffer = ''
    let stderrTail = ''
    let retried = false
    let serverInfo: { name?: string; version?: string } | undefined
    let protocolVersion: string | undefined
    let child: ReturnType<typeof spawn>
    const finish = (result: Omit<ProbeResult, 'transport' | 'durationMs'>) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        child.kill('SIGKILL')
      } catch {
        /* 已退出 */
      }
      resolve({ ...result, transport: 'stdio', durationMs: Date.now() - startedAt })
    }
    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(config.env ?? {})) env[key] = evalValue(value)
    child = spawn(config.command as string, config.args ?? [], {
      env: { ...process.env, ...env },
      cwd: config.cwd || undefined,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const timer = setTimeout(() => {
      finish({ ok: false, toolsCount: 0, error: '连接超时（' + timeoutMs + 'ms）' })
    }, timeoutMs)
    const send = (message: unknown) => {
      try {
        child.stdin?.write(JSON.stringify(message) + '\n')
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
      stderrTail = (stderrTail + chunk.toString('utf8')).slice(-2000)
    })
    child.on('error', (error) => finish({ ok: false, toolsCount: 0, error: '启动失败: ' + error.message }))
    child.on('exit', (code) => {
      if (settled) return
      finish({ ok: false, toolsCount: 0, error: '进程提前退出（code ' + String(code) + '）' + (stderrTail ? '；stderr: ' + stderrTail : '') })
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
    for (const [key, value] of Object.entries(config.headers ?? {})) baseHeaders[key] = evalValue(value)
    const withSession = (extra: Record<string, string>) => ({
      ...extra,
      ...(sessionId !== undefined ? { 'mcp-session-id': sessionId } : {}),
    })
    const ensureSse = async () => {
      if (sseReader !== undefined) return
      const response = await fetch(config.url as string, {
        method: 'GET',
        headers: withSession({ accept: 'text/event-stream' }),
        signal: controller.signal,
      })
      const sid = response.headers.get('mcp-session-id')
      if (sid !== null) sessionId = sid
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
    return finish({ ok: false, toolsCount: 0, error: error instanceof Error ? error.message : String(error) })
  }
}

async function testServer(rawConfig: unknown): Promise<ProbeResult> {
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

function makeRoutes(ctx: Context): Array<{ kind: 'exact'; path: string; handler: RouteHandler }> {
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
  return [
    {
      kind: 'exact',
      path: '/api/dsh-mcp/servers',
      handler: async (req, res) => {
        if (!guard(req, res, 'GET')) return
        const dto = buildServersDto(ctx)
        writeJson(res, 200, { ok: true, ...dto })
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-mcp/servers/save',
      handler: async (req, res) => {
        if (!guard(req, res, 'POST')) return
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
        try {
          writeManagedRows(rows)
        } catch (error) {
          writeJson(res, 500, { error: '写入补丁文件失败: ' + (error instanceof Error ? error.message : String(error)) })
          return
        }
        const dto = buildServersDto(ctx)
        writeJson(res, 200, { ok: true, applied: true, ...dto })
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-mcp/test',
      handler: async (req, res) => {
        if (!guard(req, res, 'POST')) return
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

const MCP_GUIDANCE = '本机已安装 dsh-mcp-config 插件（MCP 服务器配置中心）：Web GUI 的 设置 → 插件 里有「MCP 服务器配置」卡片，提供图形化管理。服务器配置保存在 ~/.dsh/cordis.patch.yml 的托管区块（auto-generated，勿手改），保存后经 HMR 热加载为 mcp__<serverName>__<tool> 工具，无需重启；支持 stdio（command/args/env/cwd）与 streamable-http（url/headers）传输、js: 前缀的环境变量/请求头表达式、连接测试、启用/停用与删除。用户提到「MCP 配置 / MCP 服务器」时即指本插件，请引导用户打开设置里的 MCP 卡片操作，而不是直接修改配置文件。'

export function apply(ctx: Context, config?: Config): void {
  if (config?.enabled === false) return
  const routes = makeRoutes(ctx)
  const announce = config?.announceToAgent !== false

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

  if (announce) {
    ctx.inject(['systemPrompt'], (promptCtx: Context) => {
      promptCtx.effect(() => {
        const systemPrompt = (promptCtx as unknown as { systemPrompt: { section(options: { name: string; order?: number; text: string }): () => void } }).systemPrompt
        return systemPrompt.section({ name: 'plugin:dsh-mcp-config', order: 150, text: MCP_GUIDANCE })
      }, 'dsh-mcp-config: announcement')
    })
  }

  console.log('[dsh-mcp-config] mounted, patch file: ' + homePatchPath())
}







