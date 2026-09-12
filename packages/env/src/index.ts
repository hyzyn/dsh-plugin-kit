/**
 * @hyzyn/dsh-env — DSH Web GUI 的环境变量 / 密钥管理插件（宿主半体）。
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
 *   - key: STORED_TOKEN    # 密钥值已存入官方凭据存储，文件只留清单不带值
 *     secret: true
 *
 * 值支持普通字符串与 js: 前缀的 !!js 表达式（与 dsh 补丁文件方言一致）。
 * 密钥条目的明文值默认存入官方凭据存储（~/.dsh/.credentials.yaml 的 refs，
 * 经 ctx.credentials seam 读写）；env 文件承载清单与 js: 引用，不再落明文密钥。
 * 保存后若开启 applyToProcessEnv，会把解析后的值写入当前进程的 process.env，
 * 供宿主和后续启动的子进程使用。
 *
 * 浏览器半体（./client）通过 /api/dsh-env/* 路由读写配置；路由带
 * loopback-only 信任围栏，密钥条目不下发明文（write-only）。
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
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
  /** 密钥值是否存入官方凭据存储（.credentials.yaml refs）。默认开；关闭则全部留在 env 文件。 */
  secretsInCredentials?: boolean
}

/* ------------------------------------------------------------------ *
 * settings 命名空间（让「设置 → 插件 → 插件配置」派发本插件卡片）
 * ------------------------------------------------------------------ */

/** 与 ~/.dsh/env.yml 托管区块的条目形状对齐。 */
const ENV_SETTINGS_SCHEMA = z.object({
  entries: z.array(z.object({
    key: z.string(),
    value: z.union([z.string(), z.object({ __jsExpr: z.string() })]),
    secret: z.boolean(),
  })).default([]),
})

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
  /** undefined = 密钥值已存入官方凭据存储，文件只留清单；'' 与表达式均为文件托管。 */
  value: string | JsExpr | undefined
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

/** 序列化条目列表给浏览器：密钥条目一律不下发明文（value 为 null），storage 标明值的存放处。 */
function toDtoEntries(entries: EnvEntry[]): Array<{ key: string; value: string | null; secret: boolean; storage: 'refs' | 'file' }> {
  return entries.map((entry) => ({
    key: entry.key,
    value: entry.secret ? null : entry.value === undefined ? '' : dtoValue(entry.value),
    secret: entry.secret,
    storage: entry.secret && entry.value === undefined ? 'refs' : 'file',
  }))
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
  // 标记必须整行精确匹配（trimEnd 仅容忍 \r 与尾部空格）：值经 yaml literal block
  // 缩进渲染，子串匹配会把值内的标记文本误判为区块边界，导致条目被截断丢失。
  const start = lines.findIndex((line) => line.trimEnd() === MARK_START)
  const result: ManagedRead = { entries: [], file }
  if (start === -1) return result
  const end = lines.findIndex((line, index) => index > start && line.trimEnd() === MARK_END)
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
      const secret = entry.secret === true
      result.entries.push({
        key: entry.key,
        // 密钥条目缺 value 字段 = 值在官方凭据存储；其余缺值沿用空串语义。
        value: entry.value === undefined || entry.value === null ? (secret ? undefined : '') : (entry.value as string | JsExpr),
        secret,
      })
    }
  } catch (error) {
    result.fileError = '托管区块解析失败: ' + (error instanceof Error ? error.message : String(error))
  }
  return result
}

/** 生成托管区块文本（不含首尾标记行）；undefined 值的键整体省略（ref 托管清单形态）。 */
function renderManagedBlock(entries: EnvEntry[]): string {
  const rows = entries.map((entry) => ({
    key: entry.key,
    ...(entry.value === undefined ? {} : { value: entry.value }),
    secret: entry.secret === true,
  }))
  return yaml.dump(rows, { schema: YAML_SCHEMA, lineWidth: -1, noRefs: true })
}

/** 把托管区块写回 env 文件（原子替换，保留文件其它内容；权限一律收紧为 0600）。 */
function writeManagedEntries(entries: EnvEntry[]): void {
  const file = envFilePath()
  const existed = existsSync(file)
  const text = existed ? readFileSync(file, 'utf8') : '# dsh env managed file\n'
  const lines = text.split('\n')
  // 同 readManagedEntries：标记整行精确匹配（仅容忍尾部空白），值内的标记
  // 文本（缩进 literal block 渲染）不得被当作区块边界，否则托管区块被截断。
  const start = lines.findIndex((line) => line.trimEnd() === MARK_START)
  const end = start === -1 ? -1 : lines.findIndex((line, index) => index > start && line.trimEnd() === MARK_END)
  const block = MARK_START + '\n' + renderManagedBlock(entries) + MARK_END + '\n'
  let next: string
  if (start === -1) {
    next = text.replace(/\s*$/, '') + (text.trim() === '' ? '' : '\n') + '\n' + block
  } else if (end === -1) {
    next = lines.slice(0, start).join('\n') + '\n' + block
  } else {
    next = [...lines.slice(0, start), ...block.split('\n'), ...lines.slice(end + 1)].join('\n')
  }
  // 文件承载明文密钥，不继承既有宽松权限：writeFileSync 的 mode 只会被 umask
  // 进一步收紧、不会放宽，rename 后即为 0600。
  const tmp = join(dirname(file), '.env.yml.' + process.pid + '.tmp')
  writeFileSync(tmp, next, { mode: 0o600 })
  renameSync(tmp, file)
}

/* ------------------------------------------------------------------ *
 * 校验
 * ------------------------------------------------------------------ */

function validateEntries(rawEntries: unknown, previous: EnvEntry[]): { entries?: EnvEntry[]; inherited?: Set<string>; error?: string } {
  if (!Array.isArray(rawEntries)) return { error: 'entries 必须是数组' }
  const entries: EnvEntry[] = []
  const inherited = new Set<string>()
  const seen = new Set<string>()
  for (const raw of rawEntries) {
    if (typeof raw !== 'object' || raw === null) return { error: '每条环境变量必须是对象' }
    const input = raw as Record<string, unknown>
    const key = typeof input.key === 'string' ? input.key.trim() : ''
    if (!KEY_RE.test(key)) return { error: '非法键名: ' + JSON.stringify(key) }
    if (seen.has(key)) return { error: '重复的键名: ' + key }
    seen.add(key)
    if (input.value === undefined || input.value === null) {
      // value 缺省＝保留已存值：密钥条目不回明文，客户端留空保存即"不改"。
      const prior = previous.find((p) => p.key === key)
      if (prior !== undefined) inherited.add(key)
      entries.push({ key, value: prior !== undefined ? prior.value : '', secret: input.secret === true })
    } else {
      entries.push({ key, value: fromDtoValue(input.value), secret: input.secret === true })
    }
  }
  return { entries, inherited }
}

/* ------------------------------------------------------------------ *
 * process.env 应用
 * ------------------------------------------------------------------ */

function applyToProcessEnv(entries: EnvEntry[]): void {
  for (const entry of entries) {
    if (entry.value === undefined) continue // ref 托管：由 applyStoreEntriesToProcessEnv 经凭据存储解析
    const resolved = evalValue(entry.value)
    if (resolved === '') {
      delete process.env[entry.key]
    } else {
      process.env[entry.key] = resolved
    }
  }
}

/* ------------------------------------------------------------------ *
 * 官方凭据存储（.credentials.yaml refs，经 ctx.credentials seam）
 * ------------------------------------------------------------------ */

/**
 * 官方凭据 seam 的结构性子集。ref 与插件键名共用同一语法（官方 REF_PATTERN
 * 与 KEY_RE 一致，品牌是编译期的），键名字符串可直接作 ref 使用。
 */
interface CredentialSeam {
  describe(ref: string): Promise<{ configured: boolean; source?: string; writable?: boolean }>
  resolve(ref: string): Promise<{ value: string; source?: string } | undefined>
  set(ref: string, value: string): Promise<void>
  unset(ref: string): Promise<void>
}

/** 运行期凭据 seam 引用；null = 宿主未提供（inject 回调未触发）→ 全部走 env 文件单存储模式。 */
interface SeamHolder {
  current: CredentialSeam | null
}

const seamError = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/**
 * 启动迁移：把 env 文件里带明文值的密钥条目搬入官方凭据存储。幂等且非破坏——
 * 只有 set 成功的条目才从文件移除值；refs 已有同名键（用户经官方界面存过）
 * 跳过不覆盖；被启动环境遮蔽、空值、js: 引用一律留在文件，下次启动重试。
 */
async function migrateSecretsToStore(seam: CredentialSeam): Promise<{ migrated: number; conflicts: string[] }> {
  const managed = readManagedEntries()
  const moved = new Set<string>()
  const conflicts: string[] = []
  for (const entry of managed.entries) {
    if (entry.secret !== true || entry.value === undefined || isJsExpr(entry.value) || entry.value === '') continue
    const info = await seam.describe(entry.key).catch(() => null)
    if (info === null) break // seam 暂不可用：本轮放弃，下次启动重试
    if (info.configured) {
      conflicts.push(entry.key)
      continue
    }
    try {
      await seam.set(entry.key, entry.value)
    } catch {
      continue
    }
    moved.add(entry.key)
  }
  if (moved.size > 0) {
    writeManagedEntries(managed.entries.map((entry) => (moved.has(entry.key) ? { ...entry, value: undefined } : entry)))
  }
  return { migrated: moved.size, conflicts }
}

/** 把 ref 托管的密钥解析进 process.env——tty/docker 的 env:VAR 与 mcp 的 js:process.env 消费链依赖它。 */
async function applyStoreEntriesToProcessEnv(seam: CredentialSeam, entries: EnvEntry[]): Promise<void> {
  for (const entry of entries) {
    if (entry.secret !== true || entry.value !== undefined) continue
    try {
      const hit = await seam.resolve(entry.key)
      if (hit === undefined || hit.value === '') delete process.env[entry.key]
      else process.env[entry.key] = hit.value
    } catch {
      /* 单条失败不阻塞其余条目 */
    }
  }
}

/**
 * 保存时的密钥分流。显式输入的值是权威：能写入 refs 就写入（文件只留清单）；
 * 被启动环境遮蔽等失败留在文件并带警告，下次保存或下次启动迁移会重试。
 * 启动迁移不覆盖 refs 已有值，但用户在卡片里重新输入值属于明确改写，允许覆盖。
 */
async function routeSecretEntries(
  seam: CredentialSeam,
  entries: EnvEntry[],
  previous: EnvEntry[],
  inherited: Set<string>,
  warnings: string[],
): Promise<void> {
  const prevByKey = new Map(previous.map((entry) => [entry.key, entry]))
  const nextKeys = new Set(entries.map((entry) => entry.key))
  for (const prev of previous) {
    if (!nextKeys.has(prev.key) && prev.secret === true && prev.value === undefined) await seam.unset(prev.key).catch(() => {})
  }
  for (const entry of entries) {
    const prev = prevByKey.get(entry.key)
    if (entry.secret !== true) {
      // 取消密钥：ref 托管的值物化回 env 文件（保持可见），再清掉 refs
      if (prev !== undefined && prev.secret === true && prev.value === undefined) {
        if (entry.value === undefined) {
          const hit = await seam.resolve(entry.key).catch(() => undefined)
          entry.value = hit === undefined ? '' : hit.value
        }
        await seam.unset(entry.key).catch(() => {})
      }
      continue
    }
    if (entry.value === undefined) continue // 保留现状：ref 托管或文件值都不动
    if (isJsExpr(entry.value)) {
      // 改为 js: 引用：此前若 ref 托管，一并清理 refs
      if (prev !== undefined && prev.value === undefined) await seam.unset(entry.key).catch(() => {})
      continue
    }
    if (inherited.has(entry.key)) continue // 留空保存＝保持现状：不重试写入，避免覆盖 refs 既有值
    if (entry.value === '') continue // 空值：官方存储拒绝空串，按文件空值语义（删除变量）
    try {
      await seam.set(entry.key, entry.value)
      entry.value = undefined
    } catch (error) {
      warnings.push(entry.key + ' 未能写入凭据存储，值保留在 env 文件: ' + seamError(error))
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
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'referrer-policy': 'no-referrer', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
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

function makeRoutes(ctx: Context, applyOnSave: boolean, store: SeamHolder): Array<{ kind: 'exact'; path: string; handler: RouteHandler }> {
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
          entries: toDtoEntries(managed.entries),
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
        const current = readManagedEntries()
        const validated = validateEntries(body.entries, current.entries)
        if (validated.error !== undefined) {
          writeJson(res, 400, { error: validated.error })
          return
        }
        const entries = validated.entries as EnvEntry[]
        const warnings: string[] = []
        const seam = store.current
        if (seam !== null && validated.inherited !== undefined) {
          // 密钥分流：refs 可用则按存储策略落位，失败/缺失退回纯文件模式
          await routeSecretEntries(seam, entries, current.entries, validated.inherited, warnings).catch((error: unknown) => {
            warnings.push('凭据存储暂不可用，密钥值保留在 env 文件: ' + seamError(error))
          })
        }
        try {
          writeManagedEntries(entries)
        } catch (error) {
          writeJson(res, 500, { error: '写入 env 文件失败: ' + seamError(error) })
          return
        }
        if (applyOnSave) {
          try {
            applyToProcessEnv(entries)
          } catch (error) {
            warnings.push('已写入文件，但应用 process.env 失败: ' + seamError(error))
          }
          if (seam !== null) await applyStoreEntriesToProcessEnv(seam, entries).catch(() => {})
        }
        const managed = readManagedEntries()
        writeJson(res, 200, {
          ok: true,
          applied: applyOnSave,
          ...(warnings.length > 0 ? { warnings } : {}),
          ...(managed.fileError !== undefined ? { fileError: managed.fileError } : {}),
          entries: toDtoEntries(managed.entries),
          file: managed.file,
        })
      },
    },
  ]
}

/* ------------------------------------------------------------------ *
 * 插件本体
 * ------------------------------------------------------------------ */

const ENV_GUIDANCE = '本机已安装 dsh-env-manager 插件（环境变量 / 密钥管理）：Web GUI 的 设置 → 插件 里有「环境变量 / 密钥管理」卡片，提供图形化管理。配置保存在 ~/.dsh/env.yml 的托管区块（auto-generated，勿手改），支持普通值与 js: 前缀表达式（如 js:process.env.XXX）；密钥条目的明文值默认存入官方凭据存储（~/.dsh/.credentials.yaml），env 文件只保留清单不落密钥明文。保存后默认写入当前进程的 process.env，供宿主和后续启动的子进程使用。用户提到「环境变量 / 密钥 / env / secret」时即指本插件，请引导用户打开设置里的环境变量卡片操作，而不是直接修改配置文件。'

export function apply(ctx: Context, config?: Config): void {
  if (config?.enabled === false) return
  const applyOnSave = config?.applyToProcessEnv !== false
  const useStore = config?.secretsInCredentials !== false
  const store: SeamHolder = { current: null }
  const routes = makeRoutes(ctx, applyOnSave, store)
  const announce = config?.announceToAgent !== false

  // 启动时也把已有条目应用一次，保证宿主进程内立即可用（ref 托管条目由下方回调补齐）。
  if (applyOnSave) {
    try {
      applyToProcessEnv(readManagedEntries().entries)
    } catch {
      /* 启动时应用失败不阻塞插件 */
    }
  }

  if (useStore) {
    // 凭据 seam 由 base 组合提供（ctx.inject 动态回调与 webServer 同款模式）；
    // 服务缺失时回调不执行，插件整体退回 env 文件单存储的旧模式。
    ctx.inject(['credentials'], (credCtx: Context) => {
      const seam = (credCtx as unknown as { credentials: CredentialSeam }).credentials
      store.current = seam
      void (async () => {
        const { migrated, conflicts } = await migrateSecretsToStore(seam)
        if (migrated > 0) console.log('[dsh-env-manager] migrated ' + migrated + ' secret(s) into the credentials store')
        if (conflicts.length > 0) console.warn('[dsh-env-manager] credentials store already configured for: ' + conflicts.join(', ') + '（未覆盖，条目留在 env 文件）')
        if (applyOnSave) await applyStoreEntriesToProcessEnv(seam, readManagedEntries().entries)
      })().catch((error: unknown) => {
        console.warn('[dsh-env-manager] credentials migration failed: ' + seamError(error))
      })
    })
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

  // 注册 settings 命名空间：卡片 key 与命名空间同名，插件配置标签页才会派发它
  ctx.inject(['settings'], (settingsCtx: Context) => {
    const settings = (settingsCtx as unknown as { settings: { register(ns: string, schema: unknown): unknown } }).settings
    settings.register('env-manager', ENV_SETTINGS_SCHEMA)
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
