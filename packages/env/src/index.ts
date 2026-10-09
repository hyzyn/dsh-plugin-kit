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
 * **启动期时序不变式**：apply() 返回时，ref 托管的密钥必须已经在 process.env 里。
 * 凭据 seam 的 resolve() 是异步的，而其它插件条目（mcp 的认证头就是 `!!js process.env.X`）
 * 在同一次组装里**同步**求值——异步注入必然输掉这场竞态。所以启动注入走**同步**的
 * readStoreRefs()（直接读 .credentials.yaml 的 refs），不依赖 seam；seam 那条路继续
 * 负责迁移与对账。判据与代价见 applyStoreRefsToProcessEnv 的注释。
 *
 * 浏览器半体（./client）通过 /api/dsh-env/* 路由读写配置；路由带
 * loopback-only 信任围栏，密钥条目不下发明文（write-only）。
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { dshHome } from '@hyzyn/dsh-kit'
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
  /** 密钥值是否存入官方凭据存储（.credentials.yaml refs）。默认开；关闭则全部留在 env 文件。 */
  secretsInCredentials?: boolean
}

/* ------------------------------------------------------------------ *
 * 常量与类型
 * ------------------------------------------------------------------ */

const MARK_START = '# --- dsh-env-manager managed (auto-generated; do not edit) ---'
const MARK_END = '# --- end dsh-env-manager managed ---'
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/
const MAX_JSON_BODY_BYTES = 512 * 1024

// codegraph CG35：DSH_HOME 推导统一走 @hyzyn/dsh-kit（~ 展开 + resolve），别再手抄一份 raw 副本
const envFilePath = () => process.env.DSH_ENV_FILE?.trim() || join(dshHome(), 'env.yml')

/**
 * 官方凭据文档（.credentials.yaml）的路径。默认落点必须与上游
 * `@deepseek-ai/dsh-credentials-local` 的 `resolveSpec()` 一致：
 * `resolve(config.path ?? join(resolveDshHome(config.dshHome), ".credentials.yaml"))`
 * ——即 `<DSH_HOME>/.credentials.yaml`。上游若被配了显式 `path`（插件配置里改了落点），
 * 本插件看不到那份配置，只能靠 DSH_ENV_CREDENTIALS_FILE 覆盖（与 DSH_ENV_FILE 同族）。
 */
const credentialsFilePath = () => process.env.DSH_ENV_CREDENTIALS_FILE?.trim() || join(dshHome(), '.credentials.yaml')

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

export function readManagedEntries(): ManagedRead {
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
        // 密钥条目的「没有内联值」有两种写法：**缺 value 字段**，或**写了空串**。
        // 两者必须同义，否则值是「取不到」而不是「为空」：
        //   - `applyToProcessEnv` 把空串当权威空值 → `delete process.env[key]`；
        //   - `applyStoreEntriesToProcessEnv` 只处理 `value === undefined` → 跳过存储解析。
        // 两边一夹，官方凭据存储里明明有值，`process.env[key]` 却恒为 undefined。
        // 实测（2026-10-08）：mcp 托管行的 `js:process.env.JENKINS_AUTH` 因此求值成
        // undefined → `Authorization: Basic base64("<user>:undefined")` → 服务端 401 →
        // 卡片显示 active 而 toolCount 0（该服务器上的工具一个都没注册）。
        // 普通条目的空串仍表示「删除该变量」，语义不变。
        value: entry.value === undefined || entry.value === null || (secret && entry.value === '')
          ? (secret ? undefined : '')
          : (entry.value as string | JsExpr),
        secret,
      })
    }
  } catch (error) {
    result.fileError = '托管区块解析失败: ' + (error instanceof Error ? error.message : String(error))
  }
  return result
}

/** 生成托管区块文本（不含首尾标记行）；undefined 值的键整体省略（ref 托管清单形态）。 */
export function renderManagedBlock(entries: EnvEntry[]): string {
  const rows = entries.map((entry) => ({
    key: entry.key,
    ...(entry.value === undefined ? {} : { value: entry.value }),
    secret: entry.secret === true,
  }))
  return yaml.dump(rows, { schema: YAML_SCHEMA, lineWidth: -1, noRefs: true })
}

/** 把托管区块写回 env 文件（原子替换，保留文件其它内容；权限一律收紧为 0600）。 */
export function writeManagedEntries(entries: EnvEntry[]): void {
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

export function validateEntries(rawEntries: unknown, previous: EnvEntry[]): { entries?: EnvEntry[]; inherited?: Set<string>; error?: string } {
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
      // 新建的密钥条目同样「没有内联值」：写 undefined（渲染时省略 value 字段），而不是空串。
      // 空串在密钥条目上正是那个让官方凭据存储里的值取不到的坑，见 readManagedEntries。
      const secret = input.secret === true
      entries.push({ key, value: prior !== undefined ? prior.value : (secret ? undefined : ''), secret })
    } else {
      entries.push({ key, value: fromDtoValue(input.value), secret: input.secret === true })
    }
  }
  return { entries, inherited }
}

/* ------------------------------------------------------------------ *
 * 官方凭据文档（.credentials.yaml）的**同步**读取
 * ------------------------------------------------------------------ */

/**
 * 同步读出凭据文档的 refs 段（`{ <KEY>: <value> }`）。
 *
 * 存在的理由只有一个：**时序**。凭据 seam 的 resolve() 是 Promise（要先等 seam 注入、
 * 再读文件），而别的插件条目在同一次组装里**同步**求值 `!!js process.env.X`
 * （mcp 的认证头就是它）——异步那条路必然输掉竞态，见 applyStoreRefsToProcessEnv。
 * 这个函数直接读文档本身，因此可以在 apply() 里同步走完。
 *
 * 容错是刻意的：文件不存在 / 读不动 / 解析失败 / 形状不对，一律返回 `{}`——
 * 读不到凭据只是「这次不预注入」，绝不能让插件启动失败（异步那条路仍会兜底）。
 * 只认 version 1 的 `refs:` 段（`records:` 与其它顶层键一概不看）；上游会把
 * 未带 version 的旧扁平布局在加载时迁成这个形状，本函数不重复那份迁移逻辑。
 * 值的形状照上游 parseRefs() 的口径——非字符串或空串都不是凭据文档里的合法值，
 * 跳过（上游对同样的输入是直接拒绝整个文档）。
 */
export function readStoreRefs(): Record<string, string> {
  const file = credentialsFilePath()
  let text: string
  try {
    if (!existsSync(file)) return {}
    text = readFileSync(file, 'utf8')
  } catch {
    return {}
  }
  try {
    const doc = yaml.load(text, { schema: YAML_SCHEMA })
    if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) return {}
    const refs = (doc as { refs?: unknown }).refs
    if (typeof refs !== 'object' || refs === null || Array.isArray(refs)) return {}
    const out: Record<string, string> = {}
    for (const [key, value] of Object.entries(refs as Record<string, unknown>)) {
      if (typeof value !== 'string' || value === '') continue
      out[key] = value
    }
    return out
  } catch {
    return {}
  }
}

/* ------------------------------------------------------------------ *
 * process.env 应用
 * ------------------------------------------------------------------ */

function applyToProcessEnv(entries: EnvEntry[]): void {
  for (const entry of entries) {
    // ref 托管：**启动期**由 applyStoreRefsToProcessEnv 同步预注入（apply() 返回前落地），
    // 异步的 applyStoreEntriesToProcessEnv 只负责迁移后的对账——它不是这条值的唯一来源。
    if (entry.value === undefined) continue
    const resolved = evalValue(entry.value)
    if (resolved === '') {
      delete process.env[entry.key]
    } else {
      process.env[entry.key] = resolved
    }
  }
}

/**
 * 启动期**同步**预注入：把 ref 托管的密钥从凭据文档 refs 写进 process.env。
 *
 * 这是本包唯一的时序不变式，也是它不能复用 seam 的全部理由：`!!js` 在**加载器组装
 * 该条目配置的那一刻**求值，而 seam 的 resolve() 要等异步。两条路的差距在真机上
 * 只有十几条组合树条目——desktop profile 实测 `env-manager (1795) → mcp-jenkins (1808)`，
 * 异步注入落地时 header 早就求值完了；web profile 相隔 600+ 条才侥幸来得及。
 * 求值成 undefined 的症状分两种：裸的 `process.env.X` 让 headers 变成 `{}`（core 的
 * config 校验拒绝整条，日志里是 ValidationError +「1 entry did not activate」），
 * 字符串拼接（`'Basic ' + …`）照常产出合法字符串、条目正常挂载，只是服务端 401
 * （卡片「未连接」、工具数 0）。同一个根因、两种现场。
 *
 * 只 set、不 delete，且只补空位：删除语义留给异步的 applyStoreEntriesToProcessEnv
 * 去对账，免得启动期误删「继承自启动环境」的值——seam 的 resolve 优先级是
 * inherited → stored → fallback，继承值本来就该赢。
 */
function applyStoreRefsToProcessEnv(entries: EnvEntry[]): void {
  const refs = readStoreRefs()
  for (const entry of entries) {
    if (entry.secret !== true || entry.value !== undefined) continue
    const stored = refs[entry.key]
    if (stored === undefined) continue
    const current = process.env[entry.key]
    if (current === undefined || current === '') process.env[entry.key] = stored
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

/**
 * 把 ref 托管的密钥解析进 process.env。**启动期不再是这条链的第一手**——值已由
 * applyStoreRefsToProcessEnv 同步放好（那才是 mcp 认证头赶得上的那一次），这里负责
 * resolve 之后的**对账**（含「存储里已删」→ 删除变量）与迁移后的收敛；正常路径下
 * 它对已是同值的键是幂等的 no-op。
 */
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

const ENV_GUIDANCE = '本机已安装 dsh-env-manager 插件（环境变量 / 密钥管理）：Web GUI 的 插件配置里有「环境变量 / 密钥管理」卡片，提供图形化管理。配置保存在 ~/.dsh/env.yml 的托管区块（auto-generated，勿手改），支持普通值与 js: 前缀表达式（如 js:process.env.XXX）；密钥条目的明文值默认存入官方凭据存储（~/.dsh/.credentials.yaml），env 文件只保留清单不落密钥明文。保存后默认写入当前进程的 process.env；启动时也会把凭据存储里的密钥**同步**预注入 process.env（早于其它插件条目的 !!js 求值），所以 MCP 认证头这类 js:process.env.XXX 引用在冷启动时就能取到值。用户提到「环境变量 / 密钥 / env / secret」时即指本插件，请引导用户打开设置里的环境变量卡片操作，而不是直接修改配置文件。'

export function apply(ctx: Context, config?: Config): void {
  if (config?.enabled === false) return
  const applyOnSave = config?.applyToProcessEnv !== false
  const useStore = config?.secretsInCredentials !== false
  const store: SeamHolder = { current: null }
  const routes = makeRoutes(ctx, applyOnSave, store)
  const announce = config?.announceToAgent !== false

  // 启动时也把已有条目应用一次，保证宿主进程内立即可用。
  if (applyOnSave) {
    try {
      const entries = readManagedEntries().entries
      applyToProcessEnv(entries)
      // ref 托管条目必须**同步**补齐：apply() 一旦返回，后面那些条目的 `!!js` 就可能已经
      // 求值完了（desktop profile 里只隔十几条）。见 applyStoreRefsToProcessEnv。
      // secretsInCredentials === false 时凭据存储不是真源，跳过。
      if (useStore) applyStoreRefsToProcessEnv(entries)
    } catch {
      /* 启动时应用失败不阻塞插件 */
    }
  }

  if (useStore) {
    // 凭据 seam 由 base 组合提供（ctx.inject 动态回调与 webServer 同款模式）；
    // 服务缺失时回调不执行，插件整体退回 env 文件单存储的旧模式。
    // 这条异步路径**不承担启动注入**（值已在 apply() 返回前同步放好）：它负责
    // migrateSecretsToStore() 迁移与随后的对账，正常路径下基本是幂等的 no-op。
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
