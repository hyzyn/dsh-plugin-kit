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
  return { id: '', kind: DEFAULT_KIND, label: '', url: '', dockerTarget: '', index: '' }
}

/** index 只对 ES / OpenSearch 有意义（其余类型带上它宿主会 400）——判据与宿主 src/config.ts 对齐。 */
const INDEX_KINDS = ['elasticsearch', 'opensearch']

/** 把宿主返回的一条来源还原成草稿（缺字段一律补成空串，界面里不出现 undefined）。 */
export function draftFromTarget(target) {
  const row = target == null ? {} : target
  return {
    id: typeof row.id === 'string' ? row.id : '',
    kind: KIND_OPTIONS.indexOf(row.kind) === -1 ? DEFAULT_KIND : row.kind,
    label: typeof row.label === 'string' ? row.label : '',
    url: typeof row.url === 'string' ? row.url : '',
    dockerTarget: typeof row.dockerTarget === 'string' ? row.dockerTarget : '',
    index: typeof row.index === 'string' ? row.index : '',
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
 *
 * **index 只对 ES / OpenSearch 带上**（其余类型带上它宿主会 400）；而且空也要发——
 * 「字段缺省」在宿主那边是「保持原值」，不发就等于清不掉。
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
  const payload = {
    kind,
    label: String(draft.label == null ? '' : draft.label).trim(),
    url: String(draft.url == null ? '' : draft.url).trim(),
  }
  // 索引表达式只对 ES / OpenSearch 发（其余类型带上它宿主会 400）。空串也发：清空要能真的清掉。
  if (INDEX_KINDS.indexOf(kind) !== -1) payload.index = String(draft.index == null ? '' : draft.index).trim()
  return payload
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

/**
 * 新查询的草稿：默认「最近 1 小时 / 100 条」，没有筛选。
 *
 * 筛选**放在草稿里**（而不是组件另起一份 state）：它决定的是「这一次查的是哪个子集」，
 * 与 `q` / 窗口 / 条数是同一件事——放一处，行、时间分布、分组榜才不可能查成三个不同的子集
 * （`queryPayload` 与 `facetsEnvelope` 读的都是这一份）。
 */
export function emptyQuery() {
  return { target: '', q: '', preset: '1h', limit: 100, filters: [] }
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
  const payload = {
    target: chosen === '' ? fallback : chosen,
    q: String(draft.q == null ? '' : draft.q),
    from: range.from,
    to: range.to,
    limit: Number(draft.limit),
  }
  // 没有筛选就**不带这个键**（不是带一个空对象）：线上形状与加筛选之前逐字节一致，
  // 别让一次「顺手加个字段」把已有调用方的请求体也改了。
  const filters = filtersOf(draft.filters)
  if (filters !== undefined) payload.filters = filters
  return payload
}

/* ============================ 结构化筛选（点桶下钻，P6 第三格） ============================ */

/*
 * 筛选状态是**有序的数组**（`[{ field, value }]`），界面上的那一串芯片就是它。
 *
 * 为什么线上是对象、这里却存数组：`filters` 在宿主那边是 `Record<字段, 值>`（src/query.ts 的
 * `asFilters`），**一个字段只能有一个值**——同一个字段加两次，后一条会静默盖掉前一条。
 * 数组只是为了芯片顺序稳定（对象键序在用户眼里是随机的），落成载荷时再折回对象（`filtersOf`）。
 * 所以「同一个字段」的语义在这里就已经定死：**就地替换**，不是并存。
 */

/**
 * 一条筛选能不能加：空串表示可以，否则是 i18n 键名后缀（needFilterField / needFilterValue）。
 *
 * **值不做 trim**（这条是判据，不是偷懒）：`log.level` 的值可能是 `"ERROR "`，键名里那个空格
 * 是内容的一部分——裁掉就筛不到东西了（静默地筛不到，比报错更难查）。空值判定用 `trim()`，
 * 但**进载荷的是原值**。
 *
 * 空值**表达不了**「字段缺失」：`filters` 只能说「这个字段 = 某个字符串」，而榜上「（空值）」
 * 那一桶是「文档里根本没有这个字段」。所以那个值在这里被挡（界面也不给点，见
 * client-src/index.js 的渲染）——给一个点得动、筛的却是别的东西的入口，比不给入口更坏。
 */
export function filterProblem(field, value) {
  if (String(field == null ? '' : field).trim() === '') return 'needFilterField'
  if (String(value == null ? '' : value).trim() === '') return 'needFilterValue'
  return ''
}

/** 这个字段已经在筛的值（没在筛则 `undefined`）。 */
export function filterOf(list, field) {
  const wanted = String(field == null ? '' : field)
  for (const row of Array.isArray(list) ? list : []) {
    if (row != null && String(row.field) === wanted) return String(row.value)
  }
  return undefined
}

/** 这个「字段 = 值」在不在筛选里（与 `filterAdd` 的「已存在」判据**同源**，别各写一套）。 */
export function filterHas(list, field, value) {
  const current = filterOf(list, field)
  return current !== undefined && current === String(value == null ? '' : value)
}

/**
 * 加一条筛选，返回**新数组**。同一字段就地替换（位置不变——芯片跳位置会让人以为点了别的）；
 * 已经在筛同一个「字段 = 值」时**原样返回入参**（同一个引用：调用方可以据此判断「什么都没变」）。
 */
export function filterAdd(list, field, value) {
  const rows = Array.isArray(list) ? list : []
  const name = String(field == null ? '' : field)
  const wanted = String(value == null ? '' : value)
  const at = rows.findIndex((row) => row != null && String(row.field) === name)
  if (at === -1) return rows.concat([{ field: name, value: wanted }])
  if (String(rows[at].value) === wanted) return rows
  const next = rows.slice()
  next[at] = { field: name, value: wanted }
  return next
}

/** 去掉一个字段的筛选（没在筛则原样返回入参：与 `filterAdd` 同一条「没变就同一个引用」）。 */
export function filterRemove(list, field) {
  const rows = Array.isArray(list) ? list : []
  const name = String(field == null ? '' : field)
  const next = rows.filter((row) => row == null || String(row.field) !== name)
  return next.length === rows.length ? rows : next
}

/**
 * 筛选列表 → 线上那份 `filters`。空表回 `undefined`（**不发空对象**）——「没有筛选」与
 * 「筛选了个空」在线上是两回事，虽然宿主两边都收，但形状该说实话。
 */
export function filtersOf(list) {
  const rows = Array.isArray(list) ? list : []
  if (rows.length === 0) return undefined
  const out = {}
  for (const row of rows) {
    if (row == null) continue
    out[String(row.field)] = String(row.value)
  }
  return Object.keys(out).length === 0 ? undefined : out
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

/* ============================ 时间分布（直方图，P6） ============================ */

/**
 * 这一格为什么**必须**走后端聚合，不能数页面上的行（这是本格的判据，不是实现细节）：
 *
 * 页面上的行是 `limit` 截断过的（默认 100），「数这一页的行」量到的是**这一页的分布**，
 * 不是命中的分布——`limit=100` 打在「最近 1 小时」上，它会画出一条「后 10 分钟占 100%」的
 * 假曲线。所以分布只能来自后端的 `date_histogram`（ES / OpenSearch 的 `facets`，
 * 见 src/backends/elastic.ts）。本层只负责**挑间隔**与**铺柱子**。
 */

/** 分桶档位（从小到大）：挑**第一档**让柱数不超上限的——细节最多，又不至于糊成一片。 */
const HISTOGRAM_STEPS = [
  { ms: 10 * 1000, key: '10s' },
  { ms: 30 * 1000, key: '30s' },
  { ms: 60 * 1000, key: '1m' },
  { ms: 5 * 60 * 1000, key: '5m' },
  { ms: 15 * 60 * 1000, key: '15m' },
  { ms: 30 * 60 * 1000, key: '30m' },
  { ms: 60 * 60 * 1000, key: '1h' },
  { ms: 6 * 60 * 60 * 1000, key: '6h' },
  { ms: 24 * 60 * 60 * 1000, key: '1d' },
]

/** 柱数上限：60 根在卡片宽度里还看得清一根一根，再多就只剩一条色带。 */
const HISTOGRAM_MAX_BARS = 60

/**
 * 按时间窗长度挑分桶档位，返回 `{ ms, key }`（key 是给 `/facets` 的 `interval`）。
 *
 * 认不出的窗口（NaN / 0 / 负数）回落 1 小时——与 `windowRange` 同一条态度：界面上永远有一个
 * 能用的值，不该因为传错一个数就查出一个空分布。
 */
export function histogramInterval(windowMs) {
  const span = typeof windowMs === 'number' && Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 60 * 60 * 1000
  for (const step of HISTOGRAM_STEPS) {
    if (span / step.ms <= HISTOGRAM_MAX_BARS) return step
  }
  return HISTOGRAM_STEPS[HISTOGRAM_STEPS.length - 1]
}

/**
 * 这次查询的来源**能不能**聚合：`true` / `false` / **`undefined` = 不知道**。
 *
 * **`undefined` 不许当成 `false`**：能力自述是宿主随响应下发的，缺字段只说明**我们不知道**
 * （旧版宿主、或这不是 `/query` 回来的东西）。这时在界面上写「当前来源不支持聚合」，是替对方
 * 说一句我们没依据的话——本仓同一条判据的先例是 `dockerFlagOf`（缺字段时保留上一次的判断，
 * 不把「不知道」当成「没装」）。不知道就**什么都不说**。
 */
export function supportsAggregation(payload) {
  const caps = payload === null || typeof payload !== 'object' ? undefined : payload.capabilities
  if (caps === null || typeof caps !== 'object') return undefined
  if (caps.aggregations === true) return true
  if (caps.aggregations === false) return false
  // 有 `capabilities` 对象但**没有这一位**（旧版宿主 / 自述不全）同样算不知道：
  // 「缺字段」与「明确说我不能」是两句话，只有后者才该显示在界面上。
  return undefined
}

/**
 * `/facets` 载荷的公共部分（**两份聚合载荷共用**，别各自再抄一遍窗口判据）。
 *
 * 窗口取**响应回显的那一份**，不是面板请求的那一份：宿主可能兜底过（只给一端时补 15 分钟）
 * 或按来源上限收窄过；用回显的才对得上「这次查询实际查的是什么」——否则聚合会画在一个跟
 * 结果列表不同的窗口上。回显不完整（不是数）时回 `null`：让界面**不发这个请求**，
 * 而不是发一个畸形的。
 */
function facetsEnvelope(draft, outcome) {
  const echoed = outcome !== null && typeof outcome === 'object' && outcome.window !== null && typeof outcome.window === 'object' ? outcome.window : {}
  const target = outcome !== null && typeof outcome === 'object' && outcome.target !== null && typeof outcome.target === 'object' ? outcome.target : {}
  if (typeof target.id !== 'string' || target.id === '') return null
  if (!Number.isFinite(echoed.from) || !Number.isFinite(echoed.to) || !(echoed.to > echoed.from)) return null
  const envelope = {
    target: target.id,
    q: String(draft == null || draft.q == null ? '' : draft.q),
    from: echoed.from,
    to: echoed.to,
  }
  /*
   * 筛选也要下发给聚合：聚合画的是**这一次查询的那个子集**。不带筛选的话，下钻之后
   * 分布与榜会画在整个窗口上，而行是筛过的——同一屏上三个数字说的不是一件事。
   * （直方图当年用「回显窗口」也是同一条判据，见上面那段。）
   */
  const filters = filtersOf(draft == null ? undefined : draft.filters)
  if (filters !== undefined) envelope.filters = filters
  return envelope
}

/** 时间分布的请求载荷（窗口 + 间隔）。 */
export function histogramPayload(draft, outcome, intervalKey) {
  const envelope = facetsEnvelope(draft, outcome)
  if (envelope === null) return null
  return { ...envelope, interval: intervalKey }
}

/**
 * 把后端的桶铺成一根根柱子：**整个窗口都铺满，空档补 0**，并按峰值归一化。
 *
 * **为什么必须补 0**（这格的诚实底线）：适配器给 `date_histogram` 传的是 `min_doc_count: 1`
 * （只发有数据的桶——这是对的，没数据的时间点不该在响应里占位）。于是「10:00 有 3 条、10:30
 * 有 5 条」在响应里就是两个**相邻**的桶，中间那半小时根本不在数据里。照数组直接画，半小时的
 * 空档会被压掉、两根柱子挨在一起——图上看起来「一直在刷日志」，而事实是**那段时间一条都没有**。
 * 同理，末尾那段安静也要留着（不然看不出「半小时前就停了」）。
 *
 * 柱数上限只作兜底：间隔本来是按窗口挑的，两处对不上时（改了窗口没重查）才可能触到，
 * 触发时 ``truncated: true``，界面要如实说出来——**少画的那部分是少画的**。
 */
export function histogramBars(overTime, from, to, intervalMs) {
  const step = typeof intervalMs === 'number' && Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 0
  const start = Number.isFinite(from) ? from : 0
  const end = Number.isFinite(to) ? to : 0
  if (step === 0 || !(end > start)) return { bars: [], max: 0, total: 0, truncated: false }
  // 同一 ts 出现多次就相加（不同分片 / 不同聚合键的同名桶），而不是让后一个盖掉前一个。
  const counts = new Map()
  for (const row of Array.isArray(overTime) ? overTime : []) {
    if (row == null || !Number.isFinite(row.ts) || !Number.isFinite(row.count)) continue
    counts.set(row.ts, (counts.get(row.ts) || 0) + row.count)
  }
  // 从窗口左端所在的那个**桶边界**起铺（date_histogram 的桶按 epoch 整数倍对齐）。
  const first = Math.floor(start / step) * step
  const wanted = Math.ceil((end - first) / step)
  const cap = HISTOGRAM_MAX_BARS * 2
  const drawn = Math.min(wanted, cap)
  const bars = []
  let max = 0
  let total = 0
  for (let index = 0; index < drawn; index += 1) {
    const ts = first + index * step
    const count = counts.get(ts) || 0
    if (count > max) max = count
    total += count
    bars.push({ ts, count: count })
  }
  for (const bar of bars) bar.ratio = max === 0 ? 0 : bar.count / max
  return { bars, max, total, truncated: wanted > cap }
}

/* ============================ 按字段分组（terms 榜，P6 第二格） ============================ */

/**
 * 榜与直方图是**同一件事的两种切法**（都只能来自后端聚合，不许数页面上的行——判据见上面
 * `histogramBars` 的函数头）。这一格补的是 agent 那句话里真正的问题：「**哪个服务在报错**」——
 * 光拉一页行答不出来，得先分组再排。
 *
 * 本层只做三件事：把字段名洗干净、按响应回显的窗口拼载荷、把后端的桶铺成横条。
 * **size 不由面板传**（用后端的默认值），所以这里也不写死「前十」这类数字——那是后端的事。
 */

/** 横条上限（纯兜底）：面板不传 size，桶数由后端默认值与宿主硬上限（100）管；畸形输入才可能触到。 */
const GROUP_MAX_BARS = 50

/** 分组字段能不能提交：空串表示可以，否则是 i18n 键名后缀（needGroupBy）。 */
export function groupProblem(field) {
  return String(field == null ? '' : field).trim() === '' ? 'needGroupBy' : ''
}

/**
 * 分组的请求载荷（窗口同 `histogramPayload`，取响应回显的那一份）。
 * 字段为空、或回显不完整 → `null`：界面**不发这个请求**。
 */
export function groupPayload(draft, outcome, by) {
  const field = String(by == null ? '' : by).trim()
  if (field === '') return null
  const envelope = facetsEnvelope(draft, outcome)
  if (envelope === null) return null
  return { ...envelope, by: field }
}

/**
 * 把后端的 terms 桶铺成一根根横条。
 *
 * 三条判据：
 *
 * - **保持后端给的顺序**（契约就是按 count 降序，见 src/backends/types.ts）：这里再排一次，
 *   等于把「后端顺序不对」这回事盖掉——榜的顺序就是结论本身，不该由前端悄悄改写。
 * - **不写合计**：列出来的桶加起来**不是**命中总数（没列出来的在 `otherCount` 里，由宿主用
 *   警告原话回报，面板照抄）。写一个「部分之和」会被读成「这个窗口一共这么多」。
 * - **空值键要标出来**：文档缺这个字段时 ES 给的 key 是空串——直接画出来是一条没有名字的横条，
 *   看起来像渲染丢了东西。标成空白键，由界面给一句「（空值）」。这一位同时是**「不给下钻」的判据**：
 *   筛选只能表达「字段 = 值」，表达不了「字段缺失」（见 `filterProblem`）。
 */
export function groupBars(buckets) {
  const rows = []
  let max = 0
  for (const bucket of Array.isArray(buckets) ? buckets : []) {
    if (bucket == null || typeof bucket.key !== 'string' || !Number.isFinite(bucket.count)) continue
    if (bucket.count > max) max = bucket.count
    rows.push({ key: bucket.key, count: bucket.count })
  }
  const truncated = rows.length > GROUP_MAX_BARS
  const kept = truncated ? rows.slice(0, GROUP_MAX_BARS) : rows
  for (const row of kept) {
    row.blank = row.key.trim() === ''
    row.ratio = max === 0 ? 0 : row.count / max
  }
  return { bars: kept, max, truncated }
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
 * 现场（2026-10-11）：用户手填了主机名 `host-a.internal`（真实主机名已脱敏），而 Docker 面板里的目标名是 `目标2`
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
