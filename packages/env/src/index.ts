/**
 * @dsh-kit/env — DSH Web GUI 的环境变量 / 密钥管理插件（宿主半体）。
 *
 * 机制：本插件在 ~/.dsh/env.yml（可用 DSH_ENV_FILE 覆盖）里维护一段带标记的
 * 托管区块，每条环境变量是一个 YAML 条目：
 *
 *   - key: FOO
 *     value: bar
 *     secret: false
 *   - key: API_KEY
 *     value: js:process.env.API_KEY
 *     secret: true
 *
 * 值支持普通字符串与 js: 前缀的 !!js 表达式（与 dsh 补丁文件方言一致）。
 * 保存后若开启 applyToProcessEnv，会把解析后的值写入当前进程的 process.env，
 * 供宿主和后续启动的子进程使用。
 *
 * 浏览器半体（./client）通过 /api/dsh-env/* 路由读写配置；路由带
 * loopback-only 信任围栏。
 */
import { chmodSync, existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import yaml from 'js-yaml'

export const name = 'env-manager'
export const inject: string[] = []

export interface Config {
  /** 关闭整个插件（不注册路由、不发布提示）。默认开。 */
  enabled?: boolean
  /** 是否向 agent 注入插件能力公告。默认开。 */
  announceToAgent?: boolean
  /** 保存/启动时是否把解析后的值写入 process.env。默认开。 */
  applyToProcessEnv?: boolean
}

/* ------------------------------------------------------------------ *
 * 常量与类型
 * ------------------------------------------------------------------ */

const MARK_START = '# --- dsh-env-manager managed (auto-generated; do not edit) ---'
const MARK_END = '# --- end dsh-env-manager managed ---'
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/
const MAX_JSON_BODY_BYTES = 512 * 1024

const dshHome = () => process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
const envFilePath = () => process.env.DSH_ENV_FILE?.trim() || join(dshHome(), 'env.yml')

interface JsExpr {
  __jsExpr: string
}

interface EnvEntry {
  key: string
  value: string | JsExpr
  secret: boolean
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

/** 评估 !!js 表达式（与 loader 相同的信任模型：表达式来自用户自己的配置）。 */
function evalValue(value: string | JsExpr): string {
  if (!isJsExpr(value)) return value
  const fn = new Function('process', 'return (' + value.__jsExpr + ')')
  const result = fn(process)
  return typeof result === 'string' ? result : String(result ?? '')
}

/* ------------------------------------------------------------------ *
 * 托管区块读写（~/.dsh/env.yml）
 * ------------------------------------------------------------------ */

interface ManagedRead {
  entries: EnvEntry[]
  fileError?: string
  file: string
}

function readManagedEntries(): ManagedRead {
  const file = envFilePath()
  const existed = existsSync(file)
  const text = existed ? readFileSync(file, 'utf8') : ''
  const lines = text.split('\n')
  const start = lines.findIndex((line) => line.includes('dsh-env-manager managed'))
  const result: ManagedRead = { entries: [], file }
  if (start === -1) return result
  const end = lines.findIndex((line, index) => index > start && line.includes('end dsh-env-manager managed'))
  if (end === -1) {
    result.fileError = '托管区块缺少结束标记（# --- end dsh-env-manager managed ---）'
    return result
  }
  const block = lines.slice(start + 1, end).join('\n')
  if (block.trim() === '' || block.split('\n').every((line) => line.trim() === '' || line.trim().startsWith('#'))) return result
  try {
    const parsed = yaml.load(block, { schema: YAML_SCHEMA })
    if (!Array.isArray(parsed)) {
      result.fileError = '托管区块不是 YAML 数组'
      return result
    }
    for (const raw of parsed) {
      if (typeof raw !== 'object' || raw === null) continue
      const entry = raw as { key?: unknown; value?: unknown; secret?: unknown }
      if (typeof entry.key !== 'string' || entry.key.length === 0) continue
      result.entries.push({
        key: entry.key,
        value: entry.value === undefined ? '' : (entry.value as string | JsExpr),
        secret: entry.secret === true,
      })
    }
  } catch (error) {
    result.fileError = '托管区块解析失败: ' + (error instanceof Error ? error.message : String(error))
  }
  return result
}

/** 生成托管区块文本（不含首尾标记行）。 */
function renderManagedBlock(entries: EnvEntry[]): string {
  const rows = entries.map((entry) => ({
    key: entry.key,
    value: entry.value,
    secret: entry.secret === true,
  }))
  return yaml.dump(rows, { schema: YAML_SCHEMA, lineWidth: -1, noRefs: true })
}

/** 把托管区块写回 env 文件（原子替换，保留文件其它内容与权限）。 */
function writeManagedEntries(entries: EnvEntry[]): void {
  const file = envFilePath()
  const existed = existsSync(file)
  const mode = existed ? (statSync(file).mode & 0o777) : 0o600
  const text = existed ? readFileSync(file, 'utf8') : '# dsh env managed file\n'
  const lines = text.split('\n')
  const start = lines.findIndex((line) => line.includes('dsh-env-manager managed'))
  const end = start === -1 ? -1 : lines.findIndex((line, index) => index > start && line.includes('end dsh-env-manager managed'))
  const block = MARK_START + '\n' + renderManagedBlock(entries) + MARK_END + '\n'
  let next: string
  if (start === -1) {
    next = text.replace(/\s*$/, '') + (text.trim() === '' ? '' : '\n') + '\n' + block
  } else if (end === -1) {
    next = lines.slice(0, start).join('\n') + '\n' + block
  } else {
    next = [...lines.slice(0, start), ...block.split('\n'), ...lines.slice(end + 1)].join('\n')
  }
  const tmp = join(dirname(file), '.env.yml.' + process.pid + '.tmp')
  writeFileSync(tmp, next, { mode })
  renameSync(tmp, file)
  if (!existed || (mode & 0o077) !== 0) chmodSync(file, mode)
}

/* ------------------------------------------------------------------ *
 * 校验
 * ------------------------------------------------------------------ */

function validateEntries(rawEntries: unknown): { entries?: EnvEntry[]; error?: string } {
  if (!Array.isArray(rawEntries)) return { error: 'entries 必须是数组' }
  const entries: EnvEntry[] = []
  const seen = new Set<string>()
  for (const raw of rawEntries) {
    if (typeof raw !== 'object' || raw === null) return { error: '每条环境变量必须是对象' }
    const input = raw as Record<string, unknown>
    const key = typeof input.key === 'string' ? input.key.trim() : ''
    if (!KEY_RE.test(key)) return { error: '非法键名: ' + JSON.stringify(key) }
    if (seen.has(key)) return { error: '重复的键名: ' + key }
    seen.add(key)
    entries.push({
      key,
      value: fromDtoValue(input.value ?? ''),
      secret: input.secret === true,
    })
  }
  return { entries }
}

/* ------------------------------------------------------------------ *
 * process.env 应用
 * ------------------------------------------------------------------ */

function applyToProcessEnv(entries: EnvEntry[]): void {
  for (const entry of entries) {
    const resolved = evalValue(entry.value)
    if (resolved === '') {
      delete process.env[entry.key]
    } else {
      process.env[entry.key] = resolved
    }
  }
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

function makeRoutes(ctx: Context, applyToProcessEnvOnSave: boolean): Array<{ kind: 'exact'; path: string; handler: RouteHandler }> {
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
      path: '/api/dsh-env/list',
      handler: async (req, res) => {
        if (!guard(req, res, 'GET')) return
        const managed = readManagedEntries()
        writeJson(res, 200, {
          ok: true,
          ...(managed.fileError !== undefined ? { fileError: managed.fileError } : {}),
          entries: managed.entries.map((entry) => ({
            key: entry.key,
            value: dtoValue(entry.value),
            secret: entry.secret,
          })),
          file: managed.file,
        })
      },
    },
    {
      kind: 'exact',
      path: '/api/dsh-env/save',
      handler: async (req, res) => {
        if (!guard(req, res, 'POST')) return
        const body = await readJsonBody(req)
        if (body === undefined) {
          writeJson(res, 400, { error: 'invalid JSON body' })
          return
        }
        const validated = validateEntries(body.entries)
        if (validated.error !== undefined) {
          writeJson(res, 400, { error: validated.error })
          return
        }
        const entries = validated.entries as EnvEntry[]
        try {
          writeManagedEntries(entries)
        } catch (error) {
          writeJson(res, 500, { error: '写入 env 文件失败: ' + (error instanceof Error ? error.message : String(error)) })
          return
        }
        if (applyToProcessEnvOnSave) {
          try {
            applyToProcessEnv(entries)
          } catch (error) {
            writeJson(res, 200, { ok: true, applied: false, warning: '已写入文件，但应用 process.env 失败: ' + (error instanceof Error ? error.message : String(error)) })
            return
          }
        }
        const managed = readManagedEntries()
        writeJson(res, 200, {
          ok: true,
          applied: applyToProcessEnvOnSave,
          ...(managed.fileError !== undefined ? { fileError: managed.fileError } : {}),
          entries: managed.entries.map((entry) => ({
            key: entry.key,
            value: dtoValue(entry.value),
            secret: entry.secret,
          })),
          file: managed.file,
        })
      },
    },
  ]
}

/* ------------------------------------------------------------------ *
 * 插件本体
 * ------------------------------------------------------------------ */

const ENV_GUIDANCE = '本机已安装 dsh-env-manager 插件（环境变量 / 密钥管理）：Web GUI 的 设置 → 插件 里有「环境变量 / 密钥管理」卡片，提供图形化管理。配置保存在 ~/.dsh/env.yml 的托管区块（auto-generated，勿手改），支持普通值与 js: 前缀表达式（如 js:process.env.XXX）；保存后默认写入当前进程的 process.env，供宿主和后续启动的子进程使用。用户提到「环境变量 / 密钥 / env / secret」时即指本插件，请引导用户打开设置里的环境变量卡片操作，而不是直接修改配置文件。'

export function apply(ctx: Context, config?: Config): void {
  if (config?.enabled === false) return
  const applyOnSave = config?.applyToProcessEnv !== false
  const routes = makeRoutes(ctx, applyOnSave)
  const announce = config?.announceToAgent !== false

  // 启动时也把已有条目应用一次，保证宿主进程内立即可用。
  if (applyOnSave) {
    try {
      applyToProcessEnv(readManagedEntries().entries)
    } catch {
      /* 启动时应用失败不阻塞插件 */
    }
  }

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
    }, 'dsh-env-manager: routes')
  })

  if (announce) {
    ctx.inject(['systemPrompt'], (promptCtx: Context) => {
      promptCtx.effect(() => {
        const systemPrompt = (promptCtx as unknown as { systemPrompt: { section(options: { name: string; order?: number; text: string }): () => void } }).systemPrompt
        return systemPrompt.section({ name: 'plugin:dsh-env-manager', order: 150, text: ENV_GUIDANCE })
      }, 'dsh-env-manager: announcement')
    })
  }

  console.log('[dsh-env-manager] mounted, env file: ' + envFilePath())
}
