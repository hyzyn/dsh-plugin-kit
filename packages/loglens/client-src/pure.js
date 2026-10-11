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
  return { id: '', kind: DEFAULT_KIND, label: '', url: '', dockerTarget: '' }
}

/** 把宿主返回的一条来源还原成草稿（缺字段一律补成空串，界面里不出现 undefined）。 */
export function draftFromTarget(target) {
  const row = target == null ? {} : target
  return {
    id: typeof row.id === 'string' ? row.id : '',
    kind: KIND_OPTIONS.indexOf(row.kind) === -1 ? DEFAULT_KIND : row.kind,
    label: typeof row.label === 'string' ? row.label : '',
    url: typeof row.url === 'string' ? row.url : '',
    dockerTarget: typeof row.dockerTarget === 'string' ? row.dockerTarget : '',
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

/**
 * 提交载荷：新建时 id 由宿主生成、改判时 id 走请求的 id 字段。
 *
 * **docker 来源的「地址」那一格是 Docker 面板里的目标名**（dockerTarget）：那条日志视图走的是 Docker
 * 插件自己的路由，它按自己的目标名找主机——两个插件各有各的目标清单，名字不会自动对上，所以显式存
 * 一个。docker 来源本来就没有 URL，这一格正好拿来用。
 */
export function draftPayload(draft) {
  const kind = draft.kind
  if (kind === 'docker') {
    return {
      kind,
      label: String(draft.label == null ? '' : draft.label).trim(),
      dockerTarget: String(draft.dockerTarget == null ? '' : draft.dockerTarget).trim(),
      url: '',
    }
  }
  return {
    kind,
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

/* ============================ Docker 目标（P6 面板半格，选项 0） ============================ */

/** Docker 面板那条路径的 since 取值：直接复用时间窗预设（docker --since 认 15m / 1h 这类写法）。 */
export function dockerSince(preset) {
  const keys = WINDOW_PRESETS.map((item) => item.key)
  return keys.indexOf(preset) === -1 ? '1h' : preset
}

/** 看容器日志前必须选一个容器（这条路径没有「全量」的说法）。 */
export function dockerProblem(draft) {
  const chosen = String(draft.container == null ? '' : draft.container).trim()
  return chosen === '' ? 'needContainer' : ''
}

/** 日志正文 → 一行一条（去掉末尾那个空行；空串就是空列表，不要凭空造一行）。 */
export function dockerLogLines(text) {
  if (typeof text !== 'string' || text === '') return []
  const rows = text.split(String.fromCharCode(10))
  if (rows.length > 0 && rows[rows.length - 1] === '') rows.pop()
  return rows
}

/**
 * Docker 那半格的开关怎么更新：**只有响应里真的带了 plugins 才覆盖**。
 *
 * 现场（2026-10-11）：保存一次来源后，docker 区就变成「没检测到 Docker 面板插件」、按钮全灰——
 * 因为保存走的是 POST /config，而那个响应**不带 plugins**；无条件覆盖就把「宿主说装了」
 * 冲成了「不知道」。**不知道 ≠ 没装**：缺字段时保留上一次的判断。
 */
export function dockerFlagOf(previous, payload) {
  if (payload === undefined || payload === null) return previous
  const plugins = payload.plugins
  if (plugins === undefined || plugins === null || typeof plugins !== 'object') return previous
  return plugins.docker === true
}

/**
 * Docker 目标名下拉：把 Docker 插件自己的目标清单变成选项。
 *
 * 现场（2026-10-11）：用户手填了主机名 `hostma-test-161`，而 Docker 面板里的目标名是 `目标2`
 * ——两个插件各有各的目标清单，名字不会自动对上。这个函数负责：清单里有的照原样给，**当前值不在
 * 清单里也要给出来并标出「不在清单里」**（让人一眼看见不一致，而不是等按下按钮才报错）。
 *
 * @param entries Docker 插件 /config 响应里的 config.targets（形如 { name, label }）
 * @param current 当前草稿里的 dockerTarget 值
 * @returns [{ value, label, known }]（不含「留空」那一项，它由界面自己加）
 */
export function dockerTargetChoices(entries, current) {
  const list = Array.isArray(entries) ? entries : []
  const rows = []
  for (const entry of list) {
    if (entry == null || typeof entry.name !== 'string' || entry.name === '') continue
    const label = typeof entry.label === 'string' && entry.label !== '' ? entry.label : entry.name
    rows.push({ value: entry.name, label, known: true })
  }
  const chosen = String(current == null ? '' : current).trim()
  if (chosen !== '' && !rows.some((row) => row.value === chosen)) {
    rows.push({ value: chosen, label: chosen, known: false })
  }
  return rows
}

/**
 * 取 Docker /logs 响应里的正文。
 *
 * 现场（2026-10-11）：Docker 插件的这条路由回的是 `{ ok, logs: { id, text } }`——**logs 是对象不是
 * 字符串**。我第一版只认字符串，于是「取不到正文」被当成「没有日志」，界面上什么都不画：用户点了
 * 「看日志」看起来毫无反应。两种形状都认，认不出就回空串（由界面显示「没有日志」，而不是静默）。
 */
export function dockerLogTextOf(payload) {
  if (payload === undefined || payload === null) return ''
  const logs = payload.logs
  if (typeof logs === 'string') return logs
  if (logs !== null && typeof logs === 'object' && typeof logs.text === 'string') return logs.text
  return ''
}
