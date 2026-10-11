/**
 * @hyzyn/dsh-loglens — 客户端半体的纯逻辑。
 *
 * 这里只放「判对错」的部分：草稿的合法性判定与提交载荷。DOM / React / fetch 都不进来，
 * 于是它能被 vitest 锁住（conventions 的客户端半体规矩 ②：要判对错的逻辑留在组件闭包里
 * 等于没有测试入口）。插件之间不许互相 import，所以类型清单在这里有一份对偶——宿主侧
 * 那份在 src/config.ts，两边漂了会在真机验收里露出来。
 */

/** 支持的类型（与宿主 src/config.ts 的 SOURCE_KINDS 对齐）。 */
const KIND_OPTIONS = ['loki', 'elasticsearch', 'opensearch', 'docker']
const DEFAULT_KIND = 'loki'

/** 类型下拉的选项（返回副本：调用方改了它不该影响本模块）。 */
export function kindOptions() {
  return KIND_OPTIONS.slice()
}

/** 新行的草稿：id 为空表示「还没落盘」，提交走 targets.add。 */
export function emptyDraft() {
  return { id: '', kind: DEFAULT_KIND, label: '', url: '' }
}

/** 把宿主返回的一条来源还原成草稿（缺字段一律补成空串，界面里不出现 undefined）。 */
export function draftFromTarget(target) {
  const row = target == null ? {} : target
  return {
    id: typeof row.id === 'string' ? row.id : '',
    kind: KIND_OPTIONS.indexOf(row.kind) === -1 ? DEFAULT_KIND : row.kind,
    label: typeof row.label === 'string' ? row.label : '',
    url: typeof row.url === 'string' ? row.url : '',
  }
}

/**
 * 草稿能不能提交：空串表示可以，否则是 i18n 键名的后缀（badKind / needUrl / badUrl）。
 *
 * 判据与宿主 src/config.ts 对齐：地址要 http / https 的绝对地址；docker 是采集来源，
 * 地址可以留空。这里只做**即时反馈**，真正的判据与围栏都在宿主——所以链路本地地址
 * 刻意不在这层拦（宿主会带原因回 400，界面直接显示那句话）。
 */
export function draftProblem(draft) {
  if (KIND_OPTIONS.indexOf(draft.kind) === -1) return 'badKind'
  if (draft.kind === 'docker') return ''
  const url = String(draft.url == null ? '' : draft.url).trim()
  if (url === '') return 'needUrl'
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return 'badUrl'
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return 'badUrl'
  return ''
}

/** 提交载荷：只发这三列（新建时 id 由宿主生成；改判时 id 走请求的 id 字段）。 */
export function draftPayload(draft) {
  return {
    kind: draft.kind,
    label: String(draft.label == null ? '' : draft.label).trim(),
    url: String(draft.url == null ? '' : draft.url).trim(),
  }
}

/* ============================ 查询表单（P6 面板侧） ============================ */

/**
 * 时间窗预设：面板只给几档——用户不该被「epoch 毫秒」这种细节绊住，而宿主那边有窗口上限，
 * 手填一个 30 天的窗口只会得到一句「请缩小时间窗」。
 */
const WINDOW_PRESETS = [
  { key: '15m', ms: 15 * 60 * 1000 },
  { key: '1h', ms: 60 * 60 * 1000 },
  { key: '6h', ms: 6 * 60 * 60 * 1000 },
  { key: '24h', ms: 24 * 60 * 60 * 1000 },
]

/** 预设的键（下拉选项顺序就是由近到远）。 */
export function windowOptions() {
  return WINDOW_PRESETS.map((item) => item.key)
}

/**
 * 预设 → 具体时间窗（epoch 毫秒）。认不出的预设回落 1 小时——界面上永远有一个选中项，
 * 不该因为传错一个字符串就查出一个空窗口（那就成了静默无操作）。
 */
export function windowRange(preset, nowMs) {
  const found = WINDOW_PRESETS.find((item) => item.key === preset)
  const span = found === undefined ? 60 * 60 * 1000 : found.ms
  const now = typeof nowMs === 'number' && Number.isFinite(nowMs) ? nowMs : Date.now()
  return { from: now - span, to: now }
}

/** 新查询的草稿：默认「最近 1 小时 / 100 条」。 */
export function emptyQuery() {
  return { target: '', q: '', preset: '1h', limit: 100 }
}

/**
 * 表单能不能提交：空串表示可以，否则是 i18n 键名后缀。
 *
 * 这里只校验**面板自己知道的事**（选没选来源、条数是不是正整数）；时间戳单位、窗口上限、
 * limit 夹取都由宿主判，并且会以原话回给面板显示——**不要在浏览器侧复制一套会漂的规则**。
 */
export function queryProblem(draft, targetCount) {
  const chosen = String(draft.target == null ? '' : draft.target).trim()
  if (chosen === '' && targetCount !== 1) return 'needTarget'
  const limit = Number(draft.limit)
  if (!Number.isInteger(limit) || limit < 1) return 'badLimit'
  return ''
}

/** 提交载荷：面板只传来源 id / 查询串 / 时间窗 / 条数（游标由「下一页」单独带）。 */
export function queryPayload(draft, targets, nowMs) {
  const range = windowRange(draft.preset, nowMs)
  const chosen = String(draft.target == null ? '' : draft.target).trim()
  const fallback = Array.isArray(targets) && targets.length === 1 ? targets[0].id : ''
  return {
    target: chosen === '' ? fallback : chosen,
    q: String(draft.q == null ? '' : draft.q),
    from: range.from,
    to: range.to,
    limit: Number(draft.limit),
  }
}

/** 追加一页：按 id 去重（同一份快照翻页不该出现重复行；真出现也先挡住）。 */
export function appendLines(previous, incoming) {
  const rows = Array.isArray(previous) ? previous.slice() : []
  const seen = new Set(rows.map((line) => line.id))
  for (const line of Array.isArray(incoming) ? incoming : []) {
    if (line == null || seen.has(line.id)) continue
    seen.add(line.id)
    rows.push(line)
  }
  return rows
}

/**
 * 计数要显示哪几个数（把「哪些数值得说、哪些是下界」这件判据留在纯模块里）。
 * 返回 [{ key, value }]，key 由界面映射成文案——**不知道的不写**（matched 是下界时用另一个 key）。
 */
export function countsParts(counts) {
  const parts = [{ key: 'returned', value: counts.returned }]
  if (typeof counts.matched === 'number') {
    parts.push({ key: counts.totalKnown === true ? 'matched' : 'matchedAtLeast', value: counts.matched })
  }
  if (typeof counts.scannedRows === 'number') parts.push({ key: 'scannedRows', value: counts.scannedRows })
  if (typeof counts.scannedBytes === 'number') parts.push({ key: 'scannedBytes', value: counts.scannedBytes })
  return parts
}
