/**
 * @hyzyn/dsh-loglens — 来源清单的纯逻辑层。
 *
 * 本模块不 import cordis / 网络 / 文件系统：路由层（src/index.ts）与用例直接调它，
 * 「什么样的来源算合法」「id 怎么生成」「坏行丢掉还是整份丢掉」三类判据只有一处归宿。
 * 契约与安全口径见 docs/design.md 的 §3（归一化行模型）与 §4（安全与凭据）。
 */

/** 支持的后端 / 来源类型（设计 §2 后端分层）。 */
export type SourceKind = 'loki' | 'elasticsearch' | 'opensearch' | 'docker'

export const SOURCE_KINDS: readonly SourceKind[] = ['loki', 'elasticsearch', 'opensearch', 'docker']

/** 一个日志来源。id 是稳定标识：浏览器侧只传它，查询面永不传 URL。 */
export interface LoglensTarget {
  id: string
  kind: SourceKind
  /** 展示名；留空则回落 id。 */
  label: string
  /** 地址；docker 是采集来源，允许留空（设计 §5 选项 0）。 */
  url: string
}

export interface LoglensConfig {
  enabled: boolean
  targets: LoglensTarget[]
}

/** 来源条数上限：够用，且挡住「一次注入几千条」的配置面。 */
export const MAX_TARGETS = 32

/** id 形态：小写字母数字与连字符，首字符不能是连字符。 */
const ID_SHAPE = /^[a-z0-9][a-z0-9-]*$/u
/** id 总长上限；留 4 个字符给 -2 / -3 这类去重后缀。 */
const ID_MAX = 48
const ID_BASE_MAX = ID_MAX - 4
/** IPv4 字面量判据；别名 / 十进制形态要靠 P4 的 net.ts 在解析之后判。 */
const IPV4 = /^([0-9]{1,3})[.]([0-9]{1,3})[.]([0-9]{1,3})[.]([0-9]{1,3})$/u

export function emptyConfig(): LoglensConfig {
  return { enabled: true, targets: [] }
}

export function isSourceKind(value: unknown): value is SourceKind {
  return typeof value === 'string' && (SOURCE_KINDS as readonly string[]).includes(value)
}

/** docker 是采集来源而不是查询后端：它的地址可以留空（设计 §5 选项 0）。 */
export function urlRequired(kind: SourceKind): boolean {
  return kind !== 'docker'
}

/**
 * 链路本地 / 云元数据地址：设计 §1 明列的非目标，添加动作直接拒。
 *
 * 全面出站围栏（重定向 / DNS rebinding / 体积 / 超时）是 P4 的 net.ts；本层只挡
 * 「用户按字面量填进来的那几种形态」，解析后的 IP 判定必须在那一层做。
 */
export function isLinkLocalHost(hostname: string): boolean {
  let host = hostname.trim().toLowerCase()
  if (host.startsWith('[')) host = host.slice(1)
  if (host.endsWith(']')) host = host.slice(0, -1)
  if (host === 'metadata.google.internal' || host === 'metadata') return true
  const v4 = IPV4.exec(host)
  if (v4 !== null) return v4[1] === '169' && v4[2] === '254'
  return host.startsWith('fe80:')
}

/**
 * 地址校验：只收 http / https 的绝对地址，并把链路本地 / 云元数据拒在门外。
 *
 * **私网是允许面**（10/8、172.16/12、192.168/16）——否则这个插件没有用法；这条产品
 * 语义在设计 §4.1 里写明，别在后端适配器里再收紧一遍。
 */
export function normalizeUrl(raw: unknown): { ok: true; url: string } | { ok: false; error: string } {
  if (typeof raw !== 'string') return { ok: false, error: '地址必须是字符串' }
  const trimmed = raw.trim()
  if (trimmed === '') return { ok: false, error: '地址不能为空' }
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return { ok: false, error: '地址不是合法 URL（要带 http:// 或 https://）：' + trimmed }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: '地址只支持 http / https：' + trimmed }
  }
  if (isLinkLocalHost(parsed.hostname)) {
    return { ok: false, error: '链路本地 / 云元数据地址不允许：' + parsed.hostname }
  }
  return { ok: true, url: trimmed }
}

/** 由名称 / 地址推一个 id 基底；都不成词时回落 target（中文名会整段被过滤掉）。 */
export function slugId(...sources: string[]): string {
  for (const source of sources) {
    const slug = source
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^-+/u, '')
      .replace(/-+$/u, '')
      .slice(0, ID_BASE_MAX)
    if (slug !== '') return slug
  }
  return 'target'
}

/** 在已有 id 集合里取一个不冲突的 id（-2 / -3 …）。 */
export function uniqueId(base: string, taken: readonly string[]): string {
  if (!taken.includes(base)) return base
  for (let index = 2; index <= taken.length + 2; index += 1) {
    const candidate = base + '-' + String(index)
    if (!taken.includes(candidate)) return candidate
  }
  return base + '-' + String(taken.length + 2)
}

export type TargetValidation = { ok: true; target: LoglensTarget } | { ok: false; error: string }

/**
 * 校验并归一化一条来源。taken 用于 id 去重（新增与改判都走同一条路，避免两处判据）。
 * input.id 只在**新建**时起作用；改判时 id 由调用方钉住（id 不可改，见 updateTarget）。
 */
/** 由地址推一个 id 基底：取 host + path，别把协议与斜杠也变成连字符（那会得到 http-127-0-0-1-3100 这种）。 */
export function slugSourceForUrl(url: string): string {
  if (url === '') return ''
  try {
    const parsed = new URL(url)
    return parsed.host + (parsed.pathname === '/' ? '' : parsed.pathname)
  } catch {
    return url
  }
}

export function validateTargetInput(input: unknown, taken: readonly string[] = []): TargetValidation {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, error: '来源必须是对象' }
  }
  const raw = input as Record<string, unknown>
  if (!isSourceKind(raw.kind)) {
    return { ok: false, error: '类型必须是 ' + SOURCE_KINDS.join(' / ') + '：' + JSON.stringify(raw.kind) }
  }
  const kind = raw.kind
  let url = ''
  const rawUrl = typeof raw.url === 'string' ? raw.url.trim() : ''
  if (rawUrl !== '' || urlRequired(kind)) {
    const checked = normalizeUrl(rawUrl)
    if (!checked.ok) return checked
    url = checked.url
  }
  const label = typeof raw.label === 'string' ? raw.label.trim() : ''
  const requested = typeof raw.id === 'string' ? raw.id.trim().toLowerCase() : ''
  const base = requested === ''
    ? slugId(label, slugSourceForUrl(url))
    : (requested.replace(/[^a-z0-9]+/gu, '-').replace(/^-+/u, '').replace(/-+$/u, '').slice(0, ID_BASE_MAX) || 'target')
  const id = uniqueId(base, taken)
  if (!ID_SHAPE.test(id)) return { ok: false, error: 'id 形态不合法：' + id }
  return { ok: true, target: { id, kind, label: label === '' ? id : label, url } }
}

/**
 * 宽松读盘：坏行计入 dropped 后丢掉，**不整份作废**——一条脏数据不该让整张卡片空白
 * （与 docker 的 normalizeConfig 同一口径：能救回来的部分照常可用，丢掉的必须有信号）。
 */
export function normalizeConfig(input: unknown): { config: LoglensConfig; dropped: number } {
  const raw = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
  const list = Array.isArray(raw.targets) ? raw.targets : []
  const targets: LoglensTarget[] = []
  let dropped = 0
  for (const item of list) {
    if (targets.length >= MAX_TARGETS) {
      dropped += 1
      continue
    }
    const checked = validateTargetInput(item, targets.map((target) => target.id))
    if (!checked.ok) {
      dropped += 1
      continue
    }
    targets.push(checked.target)
  }
  return { config: { enabled: raw.enabled !== false, targets }, dropped }
}

export type ConfigUpdate = { ok: true; config: LoglensConfig } | { ok: false; error: string }

export function findTarget(config: LoglensConfig, id: unknown): LoglensTarget | undefined {
  if (typeof id !== 'string') return undefined
  const wanted = id.trim()
  return config.targets.find((target) => target.id === wanted)
}

export function addTarget(config: LoglensConfig, input: unknown): ConfigUpdate {
  if (config.targets.length >= MAX_TARGETS) {
    return { ok: false, error: '来源数量已达上限 ' + String(MAX_TARGETS) }
  }
  const checked = validateTargetInput(input, config.targets.map((target) => target.id))
  if (!checked.ok) return checked
  return { ok: true, config: { ...config, targets: [...config.targets, checked.target] } }
}

/** 改一条来源。**id 不可改**：它是浏览器侧唯一的引用方式，改 id 等于换了一条来源。 */
export function updateTarget(config: LoglensConfig, id: unknown, patch: unknown): ConfigUpdate {
  const current = findTarget(config, id)
  if (current === undefined) return { ok: false, error: '来源不存在：' + JSON.stringify(id) }
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
    return { ok: false, error: 'patch 必须是对象' }
  }
  const rawPatch = patch as Record<string, unknown>
  const merged: Record<string, unknown> = {
    id: current.id,
    kind: rawPatch.kind === undefined ? current.kind : rawPatch.kind,
    label: rawPatch.label === undefined ? current.label : rawPatch.label,
    url: rawPatch.url === undefined ? current.url : rawPatch.url,
  }
  const others = config.targets.filter((target) => target.id !== current.id).map((target) => target.id)
  const checked = validateTargetInput(merged, others)
  if (!checked.ok) return checked
  return {
    ok: true,
    config: { ...config, targets: config.targets.map((target) => (target.id === current.id ? checked.target : target)) },
  }
}

export function removeTarget(config: LoglensConfig, id: unknown): ConfigUpdate {
  const current = findTarget(config, id)
  if (current === undefined) return { ok: false, error: '来源不存在：' + JSON.stringify(id) }
  return { ok: true, config: { ...config, targets: config.targets.filter((target) => target.id !== current.id) } }
}
