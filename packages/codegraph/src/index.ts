/**
 * @hyzyn/dsh-codegraph — DSH Web GUI 的 Codegraph 集成插件（宿主半体）。
 *
 * 机制：本插件在宿主进程里调用 `codegraph` CLI，把索引状态、符号搜索、
 * 调用链、影响面等能力暴露成 /api/dsh-codegraph/* 路由；浏览器半体
 * （./client）把这些路由渲染成设置 → 插件 里的「Codegraph」卡片。
 *
 * 与 MCP 的关系：MCP 让模型直接调用 codegraph_explore / codegraph_node；
 * 本插件补上 Web GUI、人工操作（sync/index）和 systemPrompt 自动提示。
 * 此外本插件托管 codegraph MCP 服务器行（~/.dsh/cordis.patch.yml）：把
 * `codegraph serve --mcp` 子进程的 cwd 与默认项目路径对齐——dsh-mcp-client
 * 不声明 MCP roots 能力，服务器只能从 cwd 向上找 .codegraph/，宿主从家
 * 目录启动时所有工具都会拿到 "No CodeGraph project is loaded"。默认项目
 * 路径变化（卡片一键切换 / 配置修改）即同步重写该行，watchUserPatches
 * 热加载后 MCP 服务器自动挂载到新项目。
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { definePlugin } from '@hyzyn/dsh-kit'
import { execFile } from 'node:child_process'
import { chmodSync, existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import yaml from 'js-yaml'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface Config {
  /** 关闭整个插件（不注册路由、不发布提示）。默认开。 */
  enabled?: boolean
  /** 是否向 agent 注入插件能力公告。默认开。 */
  announceToAgent?: boolean
  /** 是否向 systemPrompt 注入 CodeGraph 使用指引（CODEGRAPH_START 区块）。默认开。 */
  usageGuidance?: boolean
  /** codegraph CLI 命令，默认 `codegraph`。 */
  command?: string
  /** 默认项目路径，默认 `process.cwd()`。 */
  defaultPath?: string
  /**
   * 是否托管 codegraph MCP 服务器行（cwd 对齐默认项目路径，变更即热切换）。
   * 默认开。关闭时撤销本插件写入的托管行，不碰 MCP 卡片的托管区块。
   */
  mcpIntegration?: boolean
}

/* ------------------------------------------------------------------ *
 * settings 命名空间（让「设置 → 插件 → 插件配置」派发本插件卡片）
 * ------------------------------------------------------------------ */

const CODEGRAPH_SETTINGS_SCHEMA = z.object({
  enabled: z.boolean(),
  announceToAgent: z.boolean(),
  usageGuidance: z.boolean(),
  command: z.string(),
  defaultPath: z.string(),
  mcpIntegration: z.boolean(),
})

/* ------------------------------------------------------------------ *
 * 常量与类型
 * ------------------------------------------------------------------ */

const MAX_JSON_BODY_BYTES = 512 * 1024
const MAX_BUFFER = 20 * 1024 * 1024

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

/* ------------------------------------------------------------------ *
 * MCP 服务器行托管（~/.dsh/cordis.patch.yml）
 *
 * 行形状与 @hyzyn/dsh-mcp 写出的托管区块一致（loader 侧都是
 * @deepseek-ai/dsh-mcp-client 插件实例）。优先复用 dsh-mcp 托管区块里
 * 用户自己加的 codegraph 行（只补 cwd），没有才写本插件自己的区块，
 * 避免 serverName 重名导致第二个实例加载失败。写在区块外的手工行只
 * 检测不碰。目标路径没有 .codegraph/ 时绝不改写现有 cwd（不把好配置
 * 改坏），也不凭空建行。
 * ------------------------------------------------------------------ */

const MCP_CLIENT_PACKAGE = '@deepseek-ai/dsh-mcp-client'
const MCP_ROW_ID = 'mcp-codegraph-managed'
const MCP_SERVER_NAME = 'codegraph'
const OWN_BLOCK_START = '# --- dsh-codegraph mcp managed (auto-generated; do not edit) ---'
const OWN_BLOCK_END = '# --- end dsh-codegraph mcp managed ---'
/** @hyzyn/dsh-mcp 托管区块的识别子串（与其源码的 findIndex 逻辑一致）。 */
const DSH_MCP_BLOCK_KEY = 'dsh-mcp-config managed'
const DSH_MCP_BLOCK_END_KEY = 'end dsh-mcp-config managed'

const dshHome = () => process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
const homePatchPath = () => join(dshHome(), 'cordis.patch.yml')
const isIndexedProject = (path: string) => existsSync(join(path, '.codegraph'))

/** js-yaml 方言：与 dsh-app-boot / @hyzyn/dsh-mcp 相同的 !!js 表达式类型（保证含表达式的行无损往返）。 */
const JsExprType = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  resolve: (data: unknown) => typeof data === 'string',
  construct: (data: string) => ({ __jsExpr: data }),
  predicate: (value: unknown): boolean =>
    typeof value === 'object' && value !== null && typeof (value as { __jsExpr?: unknown }).__jsExpr === 'string',
  represent: (value: { __jsExpr: string }) => value.__jsExpr,
})
const YAML_SCHEMA = yaml.JSON_SCHEMA.extend(JsExprType)

/** 托管区块里的一行（保留整行原始字段，只按需改 config.cwd）。 */
interface McpPatchRow {
  id?: string
  name?: string
  config?: { serverName?: string; cwd?: string; [key: string]: unknown }
  disabled?: boolean
  [key: string]: unknown
}

export interface McpSyncDecision {
  /** 期望的 MCP 服务器名（固定 codegraph）。 */
  serverName: string
  /** 托管行使用的 CLI 命令。 */
  command: string
  /** 期望的工作目录（= 默认项目路径）。 */
  targetCwd: string
  /** 联动开关：false 时撤销本插件自己的托管行。 */
  manageEnabled: boolean
}

export interface McpSyncStatus {
  /** own=本插件区块托管；dsh-mcp=复用 MCP 卡片区块的行；external=区块外有手工行，跳过；none=无托管行。 */
  mode: 'own' | 'dsh-mcp' | 'external' | 'none'
  id?: string
  cwd?: string
  disabled?: boolean
  /** 目标路径是否已有 .codegraph/ 索引。 */
  indexed: boolean
  note?: string
}

export interface McpSyncOutcome {
  lines: string[]
  changed: boolean
  status: McpSyncStatus
}

/** 区块行区间：[start, end)，两端都含标记行本身。 */
interface BlockRange {
  start: number
  end: number
  markerStart: string
  markerEnd: string
}

function findBlock(lines: string[], startKey: string, endKey: string): BlockRange | null {
  const start = lines.findIndex((line) => line.includes(startKey))
  if (start === -1) return null
  const end = lines.findIndex((line, index) => index > start && line.includes(endKey))
  return {
    start,
    end: end === -1 ? start + 1 : end + 1,
    markerStart: lines[start],
    markerEnd: end === -1 ? '' : lines[end],
  }
}

function parseBlockRows(lines: string[], range: BlockRange): McpPatchRow[] {
  const bodyEnd = range.end === range.start + 1 && range.markerEnd === '' ? range.start + 1 : range.end - 1
  const block = lines.slice(range.start + 1, bodyEnd).join('\n')
  if (block.trim() === '' || block.split('\n').every((line) => line.trim() === '' || line.trim().startsWith('#'))) return []
  try {
    const parsed: unknown = yaml.load(block, { schema: YAML_SCHEMA })
    if (!Array.isArray(parsed)) return []
    const rows: McpPatchRow[] = []
    for (const entry of parsed) {
      if (typeof entry !== 'object' || entry === null) continue
      const inserted = (entry as { insert?: unknown }).insert
      if (!Array.isArray(inserted)) continue
      for (const row of inserted) {
        if (typeof row === 'object' && row !== null && !Array.isArray(row)) rows.push(row as McpPatchRow)
      }
    }
    return rows
  } catch {
    return []
  }
}

function renderBlockBody(rows: McpPatchRow[]): string {
  if (rows.length === 0) return '- insert: []\n'
  const patches = rows.map((row) => ({ insert: [row] }))
  return yaml.dump(patches, { schema: YAML_SCHEMA, lineWidth: -1, noRefs: true })
}

/** 区块整体（含标记行）切成行数组；结尾保留一个空串维持换行。 */
function renderBlockLines(range: BlockRange | null, rows: McpPatchRow[]): string[] {
  const markerStart = range?.markerStart ?? OWN_BLOCK_START
  const markerEnd = range?.markerEnd ?? OWN_BLOCK_END
  const bodyLines = renderBlockBody(rows).split('\n')
  if (bodyLines[bodyLines.length - 1] === '') bodyLines.pop()
  return [markerStart, ...bodyLines, markerEnd, '']
}

function isCodegraphServerRow(row: McpPatchRow): boolean {
  return row.name === MCP_CLIENT_PACKAGE && row.config?.serverName === MCP_SERVER_NAME
}

/**
 * 纯函数：在 home 补丁文本（按 \n 切成的行数组）上执行一次托管行同步。
 * 无变化时返回原数组引用（changed=false）。文件不存在时传入 ['']。
 */
export function syncManagedMcpRow(lines: string[], decision: McpSyncDecision): McpSyncOutcome {
  const indexed = isIndexedProject(decision.targetCwd)
  const ownRange = findBlock(lines, 'dsh-codegraph mcp managed', 'end dsh-codegraph mcp managed')
  const mcpRange = findBlock(lines, DSH_MCP_BLOCK_KEY, DSH_MCP_BLOCK_END_KEY)
  const ownRows = ownRange ? parseBlockRows(lines, ownRange) : []
  const mcpRows = mcpRange ? parseBlockRows(lines, mcpRange) : []

  // 区块外手工行：只检测不碰（再写托管行会与它 serverName 撞名，第二个实例必失败）。
  const outsideLines = lines.filter((_, index) => {
    const inOwn = ownRange !== null && index >= ownRange.start && index < ownRange.end
    const inMcp = mcpRange !== null && index >= mcpRange.start && index < mcpRange.end
    return !inOwn && !inMcp
  })
  try {
    const parsed: unknown = yaml.load(outsideLines.join('\n'), { schema: YAML_SCHEMA })
    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        if (typeof entry !== 'object' || entry === null) continue
        const inserted = (entry as { insert?: unknown }).insert
        if (!Array.isArray(inserted)) continue
        const handWritten = inserted.find((row) => typeof row === 'object' && row !== null && isCodegraphServerRow(row as McpPatchRow)) as McpPatchRow | undefined
        if (handWritten !== undefined) {
          return {
            lines,
            changed: false,
            status: {
              mode: 'external',
              id: typeof handWritten.id === 'string' ? handWritten.id : undefined,
              cwd: typeof handWritten.config?.cwd === 'string' ? handWritten.config.cwd : undefined,
              disabled: handWritten.disabled === true,
              indexed,
              note: '检测到区块外手工配置的 codegraph MCP 行，跳过托管（避免 serverName 冲突）',
            },
          }
        }
      }
    }
  } catch {
    /* 区块外内容解析失败（如含其它 patch 操作形状）：按无手工行处理 */
  }

  const replacements: Array<{ range: BlockRange; text: string[] }> = []
  let status: McpSyncStatus

  const mcpRow = mcpRows.find((row) => isCodegraphServerRow(row))
  if (mcpRow !== undefined) {
    // 复用 MCP 卡片区块里的行：只对齐 cwd，其余字段（含 disabled）保持用户配置。
    if (decision.manageEnabled && indexed && mcpRow.config?.cwd !== decision.targetCwd) {
      mcpRow.config = { ...mcpRow.config, cwd: decision.targetCwd }
      replacements.push({ range: mcpRange as BlockRange, text: renderBlockLines(mcpRange, mcpRows) })
    }
    // 本插件区块若还残留重复行则让位删除（防 serverName 冲突）。
    if (ownRange && ownRows.some((row) => isCodegraphServerRow(row))) {
      replacements.push({ range: ownRange, text: renderBlockLines(ownRange, ownRows.filter((row) => !isCodegraphServerRow(row))) })
    }
    status = {
      mode: 'dsh-mcp',
      id: typeof mcpRow.id === 'string' ? mcpRow.id : undefined,
      cwd: typeof mcpRow.config?.cwd === 'string' ? mcpRow.config.cwd : undefined,
      disabled: mcpRow.disabled === true,
      indexed,
      ...(decision.manageEnabled && indexed ? {} : { note: decision.manageEnabled ? '目标路径缺少 .codegraph/，保持现有配置' : 'MCP 联动已关闭，保持现有配置' }),
    }
  } else {
    const ownRowIndex = ownRows.findIndex((row) => isCodegraphServerRow(row))
    if (!decision.manageEnabled) {
      if (ownRowIndex !== -1 && ownRange) {
        replacements.push({ range: ownRange, text: renderBlockLines(ownRange, ownRows.filter((row) => !isCodegraphServerRow(row))) })
        status = { mode: 'none', indexed, note: 'MCP 联动已关闭，已撤销本插件托管行' }
      } else {
        status = { mode: 'none', indexed, note: 'MCP 联动已关闭' }
      }
    } else if (ownRowIndex !== -1 && ownRange) {
      const row = ownRows[ownRowIndex]
      if (indexed && row.config?.cwd !== decision.targetCwd) {
        row.config = { ...row.config, cwd: decision.targetCwd }
        replacements.push({ range: ownRange, text: renderBlockLines(ownRange, ownRows) })
      }
      status = {
        mode: 'own',
        id: typeof row.id === 'string' ? row.id : undefined,
        cwd: typeof row.config?.cwd === 'string' ? row.config.cwd : undefined,
        disabled: row.disabled === true,
        indexed,
        ...(indexed ? {} : { note: '目标路径缺少 .codegraph/，保持现有配置' }),
      }
    } else if (indexed) {
      const row: McpPatchRow = {
        id: MCP_ROW_ID,
        name: MCP_CLIENT_PACKAGE,
        config: {
          serverName: MCP_SERVER_NAME,
          transport: 'stdio',
          command: decision.command,
          args: ['serve', '--mcp'],
          cwd: decision.targetCwd,
        },
      }
      replacements.push({ range: { start: lines.length, end: lines.length, markerStart: OWN_BLOCK_START, markerEnd: OWN_BLOCK_END }, text: renderBlockLines(null, [row]) })
      status = { mode: 'own', id: MCP_ROW_ID, cwd: decision.targetCwd, indexed, note: '已自动托管 codegraph MCP 服务器' }
    } else {
      status = { mode: 'none', indexed, note: '默认路径缺少 .codegraph/，未托管；把默认项目切到已索引目录即可自动挂载' }
    }
  }

  if (replacements.length === 0) return { lines, changed: false, status }

  const next = [...lines]
  for (const { range, text } of [...replacements].sort((a, b) => b.range.start - a.range.start)) {
    next.splice(range.start, range.end - range.start, ...text)
  }
  return { lines: next, changed: true, status }
}

interface SettingsScopeLike {
  get(): Record<string, unknown>
  update(patch: Record<string, unknown>): Promise<unknown>
}

interface RuntimeSync {
  scope?: SettingsScopeLike
  /** 当前生效解析值（sync 后更新），供路由读取。 */
  current: { defaultPath: string; manage: boolean }
  /** 应用一次（可带 settings 覆盖值），返回落盘后的默认路径与托管状态。 */
  sync(stored?: Record<string, unknown>): { defaultPath: string; status: McpSyncStatus }
}
let runtimeSyncRef: RuntimeSync | undefined

/** 读 home 补丁 → 纯函数同步 → 有变化才原子写回。 */
function syncMcpRowOnDisk(decision: McpSyncDecision): { changed: boolean; status: McpSyncStatus } {
  const patchFile = homePatchPath()
  const existed = existsSync(patchFile)
  const text = existed ? readFileSync(patchFile, 'utf8') : ''
  const outcome = syncManagedMcpRow(text.split('\n'), decision)
  if (outcome.changed) {
    const mode = existed ? (statSync(patchFile).mode & 0o777) : 0o600
    const tmp = join(dirname(patchFile), '.cordis.patch.yml.codegraph.' + process.pid + '.tmp')
    writeFileSync(tmp, outcome.lines.join('\n'), { mode })
    renameSync(tmp, patchFile)
    if (existed && (mode & 0o077) !== 0) chmodSync(patchFile, mode)
  }
  return { changed: outcome.changed, status: outcome.status }
}

/* ------------------------------------------------------------------ *
 * 工具函数
 * ------------------------------------------------------------------ */

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

function queryString(url: string | undefined): URLSearchParams {
  try {
    return new URL(url ?? '/', 'http://localhost').searchParams
  } catch {
    return new URLSearchParams()
  }
}

/** 运行 codegraph CLI，返回 stdout；失败时抛错。 */
async function runCodegraph(command: string, args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync(command, args, {
    cwd,
    maxBuffer: MAX_BUFFER,
    timeout: 60_000,
  })
  return stdout
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/* ------------------------------------------------------------------ *
 * 路由
 * ------------------------------------------------------------------ */

function makeRoutes(command: string, defaultPath: string): Array<{ kind: 'exact'; path: string; handler: RouteHandler }> {
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

  const resolvePath = (params: URLSearchParams): string => {
    const fromQuery = params.get('path')?.trim()
    return fromQuery || defaultPath || process.cwd()
  }

  const run = async (args: string[], cwd: string): Promise<{ ok: true; output: string; data?: unknown }> => {
    const output = await runCodegraph(command, args, cwd)
    return { ok: true, output, data: tryParseJson(output) }
  }

  const runJson = async (args: string[], cwd: string): Promise<{ ok: true; output: string; data: unknown }> => {
    const output = await runCodegraph(command, args, cwd)
    const data = tryParseJson(output)
    if (data === undefined) {
      return { ok: true, output, data: { raw: output } }
    }
    return { ok: true, output, data }
  }

  return [
    {
      kind: 'exact',
      path: '/api/dsh-codegraph/status',
      handler: async (req, res) => {
        if (!guard(req, res, 'GET')) return
        const params = queryString(req.url)
        const cwd = resolvePath(params)
        try {
          const { output, data } = await runJson(['status', '--json', '--', cwd], cwd)
          writeJson(res, 200, { ok: true, path: cwd, status: data, raw: output })
        } catch (error) {
          writeJson(res, 500, { ok: false, error: (error instanceof Error ? error.message : String(error)), path: cwd })
        }
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-codegraph/query',
      handler: async (req, res) => {
        if (!guard(req, res, 'GET')) return
        const params = queryString(req.url)
        const cwd = resolvePath(params)
        const q = params.get('q')?.trim() ?? ''
        if (!q) {
          writeJson(res, 400, { error: '缺少 q 参数' })
          return
        }
        const limit = params.get('limit')?.trim() || '10'
        try {
          const { output, data } = await runJson(['query', '--json', '--path', cwd, '--limit', limit, q], cwd)
          writeJson(res, 200, { ok: true, path: cwd, results: data, raw: output })
        } catch (error) {
          writeJson(res, 500, { ok: false, error: (error instanceof Error ? error.message : String(error)), path: cwd })
        }
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-codegraph/callers',
      handler: async (req, res) => {
        if (!guard(req, res, 'GET')) return
        const params = queryString(req.url)
        const cwd = resolvePath(params)
        const symbol = params.get('symbol')?.trim() ?? ''
        if (!symbol) {
          writeJson(res, 400, { error: '缺少 symbol 参数' })
          return
        }
        try {
          const { output, data } = await runJson(['callers', '--json', '--path', cwd, symbol], cwd)
          writeJson(res, 200, { ok: true, path: cwd, symbol, callers: data, raw: output })
        } catch (error) {
          writeJson(res, 500, { ok: false, error: (error instanceof Error ? error.message : String(error)), path: cwd })
        }
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-codegraph/callees',
      handler: async (req, res) => {
        if (!guard(req, res, 'GET')) return
        const params = queryString(req.url)
        const cwd = resolvePath(params)
        const symbol = params.get('symbol')?.trim() ?? ''
        if (!symbol) {
          writeJson(res, 400, { error: '缺少 symbol 参数' })
          return
        }
        try {
          const { output, data } = await runJson(['callees', '--json', '--path', cwd, symbol], cwd)
          writeJson(res, 200, { ok: true, path: cwd, symbol, callees: data, raw: output })
        } catch (error) {
          writeJson(res, 500, { ok: false, error: (error instanceof Error ? error.message : String(error)), path: cwd })
        }
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-codegraph/impact',
      handler: async (req, res) => {
        if (!guard(req, res, 'GET')) return
        const params = queryString(req.url)
        const cwd = resolvePath(params)
        const symbol = params.get('symbol')?.trim() ?? ''
        if (!symbol) {
          writeJson(res, 400, { error: '缺少 symbol 参数' })
          return
        }
        const depth = params.get('depth')?.trim() || '2'
        try {
          const { output, data } = await runJson(['impact', '--json', '--path', cwd, '--depth', depth, symbol], cwd)
          writeJson(res, 200, { ok: true, path: cwd, symbol, impact: data, raw: output })
        } catch (error) {
          writeJson(res, 500, { ok: false, error: (error instanceof Error ? error.message : String(error)), path: cwd })
        }
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-codegraph/node',
      handler: async (req, res) => {
        if (!guard(req, res, 'GET')) return
        const params = queryString(req.url)
        const cwd = resolvePath(params)
        const name = params.get('name')?.trim() ?? ''
        if (!name) {
          writeJson(res, 400, { error: '缺少 name 参数' })
          return
        }
        const file = params.get('file')?.trim()
        const args = ['node', '--path', cwd]
        if (file) args.push('--file', file)
        args.push(name)
        try {
          const { output, data } = await run(args, cwd)
          writeJson(res, 200, { ok: true, path: cwd, name, node: data ?? output, raw: output })
        } catch (error) {
          writeJson(res, 500, { ok: false, error: (error instanceof Error ? error.message : String(error)), path: cwd, name })
        }
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-codegraph/sync',
      handler: async (req, res) => {
        if (!guard(req, res, 'POST')) return
        const body = await readJsonBody(req)
        const cwd = (typeof body?.path === 'string' && body.path.trim()) || defaultPath || process.cwd()
        try {
          const { output } = await run(['sync', '--', cwd], cwd)
          writeJson(res, 200, { ok: true, path: cwd, output })
        } catch (error) {
          writeJson(res, 500, { ok: false, error: (error instanceof Error ? error.message : String(error)), path: cwd })
        }
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-codegraph/index',
      handler: async (req, res) => {
        if (!guard(req, res, 'POST')) return
        const body = await readJsonBody(req)
        const cwd = (typeof body?.path === 'string' && body.path.trim()) || defaultPath || process.cwd()
        try {
          const { output } = await run(['index', '--', cwd], cwd)
          writeJson(res, 200, { ok: true, path: cwd, output })
        } catch (error) {
          writeJson(res, 500, { ok: false, error: (error instanceof Error ? error.message : String(error)), path: cwd })
        }
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-codegraph/default-path',
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) {
          writeJson(res, 403, { error: 'forbidden: loopback-only' })
          return
        }
        if (req.method === 'GET') {
          const current = runtimeSyncRef?.current ?? { defaultPath: defaultPath || process.cwd(), manage: true }
          writeJson(res, 200, {
            ok: true,
            defaultPath: current.defaultPath,
            manageEnabled: current.manage,
            indexed: isIndexedProject(current.defaultPath),
            mcp: snapshotMcpStatus(),
          })
          return
        }
        if (req.method !== 'POST') {
          writeJson(res, 405, { error: 'method not allowed: ' + String(req.method) })
          return
        }
        const body = await readJsonBody(req)
        const path = typeof body?.path === 'string' ? body.path.trim() : ''
        if (path === '') {
          writeJson(res, 400, { error: '缺少 path 参数' })
          return
        }
        try {
          if (!existsSync(path)) {
            writeJson(res, 400, { error: '路径不存在: ' + path })
            return
          }
          if (!statSync(path).isDirectory()) {
            writeJson(res, 400, { error: '路径不是目录: ' + path })
            return
          }
        } catch (error) {
          writeJson(res, 400, { error: '路径不可访问: ' + (error instanceof Error ? error.message : String(error)) })
          return
        }
        if (!isIndexedProject(path)) {
          writeJson(res, 400, { error: '该目录没有 .codegraph/ 索引，请先在其根目录运行 codegraph init' })
          return
        }
        // 官方持久化通道：写入 settings 命名空间 → settings/updated → 同步托管行。
        // settings 未就绪时只同步一次（不持久化，重启后回落）。
        const runtime = runtimeSyncRef
        if (runtime === undefined) {
          writeJson(res, 500, { error: '插件尚未完成挂载' })
          return
        }
        let persisted = false
        if (runtime.scope !== undefined) {
          try {
            await runtime.scope.update({ defaultPath: path })
            persisted = true
          } catch (error) {
            writeJson(res, 500, { error: '保存默认项目路径失败: ' + (error instanceof Error ? error.message : String(error)) })
            return
          }
        }
        const outcome = runtime.sync({ defaultPath: path })
        writeJson(res, 200, { ok: true, defaultPath: outcome.defaultPath, persisted, mcp: outcome.status })
      },
    },
  ]
}

/** 不落盘的快照：用当前生效配置在内存行副本上做一次同步（丢弃结果）。 */
function snapshotMcpStatus(): McpSyncStatus {
  const current = runtimeSyncRef?.current ?? { defaultPath: process.cwd(), manage: true }
  const patchFile = homePatchPath()
  const text = existsSync(patchFile) ? readFileSync(patchFile, 'utf8') : ''
  return syncManagedMcpRow(text.split('\n'), {
    serverName: MCP_SERVER_NAME,
    command: '',
    targetCwd: current.defaultPath,
    manageEnabled: current.manage,
  }).status
}

/* ------------------------------------------------------------------ *
 * 插件本体
 * ------------------------------------------------------------------ */

const CODEGRAPH_GUIDANCE = '本机已安装 dsh-codegraph 插件（Codegraph 集成）：Web GUI 的 设置 → 插件 里有「Codegraph」卡片，可查看索引状态、搜索符号、查看 callers/callees/impact，并手动 sync/index；卡片还能把当前项目一键设为默认项目。模型侧也可使用已配置的 codegraph MCP 工具（如 mcp__codegraph__codegraph_explore）直接查询代码，codegraph MCP 服务器的工作目录由本插件托管并跟随默认项目路径热切换。用户提到「Codegraph / 代码图谱 / 调用链 / 影响面 / 索引」时，可引导其打开 Codegraph 卡片或使用 MCP 工具。'

const CODEGRAPH_USAGE_GUIDANCE = `<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a \`.codegraph/\` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tool** (when available): \`mcp__codegraph__codegraph_explore\` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): \`codegraph explore "<symbol names or question>"\` prints the same output.
- If a codegraph_* tool replies "No CodeGraph project is loaded for this session", retry once with \`projectPath\` set to the current project's absolute path; if that project has no \`.codegraph/\` either, fall back to normal search tools and let the user decide about running \`codegraph init\` there.

If there is no \`.codegraph/\` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->`

const plugin = definePlugin<Config>({
  name: 'codegraph',
  inject: [],
  apply(ctx: Context, config?: Config) {
    if (config?.enabled === false) return
    const command = config?.command?.trim() || 'codegraph'
    const announce = config?.announceToAgent !== false
    const manageEnabled = config?.mcpIntegration !== false

    const routes = makeRoutes(command, config?.defaultPath?.trim() || process.cwd())
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
      }, 'dsh-codegraph: routes')
    })

    // settings 命名空间：卡片 key 与命名空间同名，插件配置标签页才会派发它。
    // 同时是默认项目路径的持久化通道：scope 里保存过的 defaultPath 优先于插件
    // 配置；变更经 settings/updated → 重写 MCP 托管行 → watchUserPatches 热切换。
    ctx.inject(['settings'], (settingsCtx: Context) => {
      settingsCtx.effect(() => {
        const settings = (settingsCtx as unknown as { settings: { register(ns: string, schema: unknown): SettingsScopeLike } }).settings
        const scope = settings.register('codegraph', CODEGRAPH_SETTINGS_SCHEMA)

        const resolveStored = (stored: Record<string, unknown> | undefined): { defaultPath: string; manage: boolean } => {
          const storedPath = typeof stored?.defaultPath === 'string' && stored.defaultPath.trim() !== '' ? stored.defaultPath.trim() : undefined
          const storedManage = typeof stored?.mcpIntegration === 'boolean' ? stored.mcpIntegration : undefined
          return {
            defaultPath: storedPath ?? (config?.defaultPath?.trim() || process.cwd()),
            manage: storedManage ?? manageEnabled,
          }
        }
        const logOutcome = (changed: boolean, status: McpSyncStatus) => {
          console.log(`[dsh-codegraph] mcp integration: mode=${status.mode}, cwd=${status.cwd ?? '(未托管)'}${changed ? ' (patch updated)' : ''}${status.note ? ' — ' + status.note : ''}`)
        }
        const sync = (stored?: Record<string, unknown>) => {
          const resolved = resolveStored(stored)
          const { changed, status } = syncMcpRowOnDisk({ serverName: MCP_SERVER_NAME, command, targetCwd: resolved.defaultPath, manageEnabled: resolved.manage })
          runtime.current = resolved
          logOutcome(changed, status)
          return { defaultPath: resolved.defaultPath, status }
        }
        const runtime: RuntimeSync = { scope, current: resolveStored(scope.get()), sync }
        runtimeSyncRef = runtime

        sync(scope.get())
        const events = settingsCtx as unknown as { events: { on(name: string, listener: (...args: unknown[]) => void): () => void } }
        const off = events.events.on('settings/updated', (ns: unknown, next: unknown) => {
          if (ns !== 'codegraph' || typeof next !== 'object' || next === null) return
          sync(next as Record<string, unknown>)
        })
        return () => {
          off()
          if (runtimeSyncRef !== undefined && runtimeSyncRef.scope === scope) runtimeSyncRef = undefined
        }
      }, 'dsh-codegraph: settings')
    })

    // settings 服务不可达时的兜底：仍按插件配置同步一次（无变化不写盘），
    // 保证「装了插件就得管住 cwd」的语义不依赖卡片。
    ctx.effect(() => {
      if (runtimeSyncRef !== undefined) return () => {}
      const resolved = { defaultPath: config?.defaultPath?.trim() || process.cwd(), manage: manageEnabled }
      const runtime: RuntimeSync = {
        current: resolved,
        sync: (stored) => {
          const next = {
            defaultPath: typeof stored?.defaultPath === 'string' && stored.defaultPath.trim() !== '' ? stored.defaultPath.trim() : resolved.defaultPath,
            manage: typeof stored?.mcpIntegration === 'boolean' ? stored.mcpIntegration : resolved.manage,
          }
          const result = syncMcpRowOnDisk({ serverName: MCP_SERVER_NAME, command, targetCwd: next.defaultPath, manageEnabled: next.manage })
          runtime.current = next
          return { defaultPath: next.defaultPath, status: result.status }
        },
      }
      runtimeSyncRef = runtime
      const { changed, status } = syncMcpRowOnDisk({ serverName: MCP_SERVER_NAME, command, targetCwd: resolved.defaultPath, manageEnabled: resolved.manage })
      console.log(`[dsh-codegraph] mcp integration (config fallback): mode=${status.mode}, cwd=${status.cwd ?? '(未托管)'}${changed ? ' (patch updated)' : ''}${status.note ? ' — ' + status.note : ''}`)
      return () => {
        if (runtimeSyncRef === runtime) runtimeSyncRef = undefined
      }
    }, 'dsh-codegraph: mcp fallback')

    if (announce) {
      ctx.inject(['systemPrompt'], (promptCtx: Context) => {
        promptCtx.effect(() => {
          const systemPrompt = (promptCtx as unknown as { systemPrompt: { section(options: { name: string; order?: number; text: string }): () => void } }).systemPrompt
          return systemPrompt.section({ name: 'plugin:dsh-codegraph', order: 150, text: CODEGRAPH_GUIDANCE })
        }, 'dsh-codegraph: announcement')
      })
    }

    if (config?.usageGuidance !== false) {
      ctx.inject(['systemPrompt'], (promptCtx: Context) => {
        promptCtx.effect(() => {
          const systemPrompt = (promptCtx as unknown as { systemPrompt: { section(options: { name: string; order?: number; text: string }): () => void } }).systemPrompt
          return systemPrompt.section({ name: 'plugin:dsh-codegraph:usage', order: 151, text: CODEGRAPH_USAGE_GUIDANCE })
        }, 'dsh-codegraph: usage guidance')
      })
    }

    console.log('[dsh-codegraph] mounted, command: ' + command)
  },
})

export const { name, inject, apply } = plugin
