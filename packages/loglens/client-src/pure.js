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
 * 下拉里**实际**要摆的那几档：预设几档，外加当前选中的 `custom`（点柱放大）那一档。
 *
 * 为什么非要这一支（loglens D04，同一判据在「来源」下拉上栽过）：`<select value={x}>` 在没有任何
 * 选项的 value 等于 `x` 时，浏览器会**回落显示第一项**——于是下拉写着「最近 15 分钟」，而真正
 * 发出去的是一段自定义窗口。那是源码里看不见的谎。所以选中的档必须真的在选项里。
 *
 * `custom` 只在自己**正被选中**时补进去：它不是用户能挑的一档（没有「自定义」这个预设，
 * 只有「点某根柱放大到那一段」这个动作），凭空摆一个空的自定义项等于给一个点了没反应的入口。
 */
export function windowChoices(preset) {
  const keys = windowOptions()
  return String(preset == null ? '' : preset) === 'custom' ? [...keys, 'custom'] : keys
}

/**
 * 直方图放大（点一根柱）的最小窗口：1 分钟。
 *
 * 一档分桶最细是 10 秒（见 HISTOGRAM_STEPS），点它夹出来的窗只有 10 秒——那种窗在日志里
 * 通常空手而归，而界面上只看见「没有命中」，看不出「是你把窗缩得太小了」。
 */
const ZOOM_MIN_MS = 60 * 1000

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
 * 新查询的草稿：默认「最近 1 小时 / 100 条」，没有筛选、没有自定义窗口、不限级别。
 *
 * 筛选、**自定义窗口**与**级别**都放在草稿里（而不是组件另起一份 state）：它们决定的是「这一次
 * 查的是哪一段、哪个子集」，与 `q` / 条数是同一件事——放一处，行、时间分布、分组榜才不可能查成
 * 三个不同的子集（`queryPayload` 与 `facetsEnvelope` 读的都是这一份）。
 *
 * `level: ''` = 不限（等于「没给」）：载荷里**不带这个键**，线上形状与加它之前逐字节一致
 * （与 `filters` 空数组同一条判据）。
 */
export function emptyQuery() {
  return { target: '', q: '', preset: '1h', limit: 100, filters: [], level: '' }
}

/* ============================ 级别筛选（宿主既有入参，P6 第六刀） ============================ */

/*
 * 级别是**宿主早就有**的入参（`loglens_search` 的 `level`，语义 warn = warn 及以上），面板只是
 * 没暴露。零契约改动——但**页内筛**这件事必须一路带到底（见 `levelFiltered` 与界面那句提示）：
 * 宿主在返回的这一页上过滤，`counts` / `truncation` 仍是**未筛的整页**，所以「只看 error」得到的是
 * 「这一页里的 error」，不是「窗口里一共多少 error」。不写出来就是另一种「说的和做的不一样」。
 */

/**
 * 级别下拉的选项：空串（不限）+ 归一化的六档。
 *
 * 顺序从轻到重，与 `src/line.ts` 的 `CANONICAL_LEVELS` 逐字一致。**为什么不从宿主 import**：
 * 浏览器半体不许引宿主模块（`src/line.ts` 进不了 client.js），所以这里是一份**对偶**——
 * 与纯模块文件头写的那条同一条规矩（类型清单的对偶，漂了在真机里露出来）。
 */
const LEVEL_OPTIONS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal']

/** 级别下拉要摆的键（含表示「不限」的空串）。 */
export function levelChoices() {
  return [''].concat(LEVEL_OPTIONS)
}

/**
 * 把草稿里的级别收成「能下发的那一个」：空串 / 不认识的一律当**不限**。
 *
 * 为什么要收一道（而不是直接把草稿值塞进载荷）：`level` 是**枚举**，宿主收到认不出的值会**报错**
 * （`readLevel` 的原话：「level 只能是 trace / debug / …」）。界面上的值只有下拉能改，但草稿也可能
 * 从别处来（会话记忆、将来的 UI），所以这里当**边界**：宁可不下发，也不发一个会被打回、把整次查询
 * 变成错误的枚举值。「不认识 = 不限」在下拉里也说得通（所选值不在选项里时原生 `<select>` 会回落显示
 * 第一项，而第一项就是「不限」）。
 */
export function levelFilterOf(draft) {
  const raw = draft === null || draft === undefined ? '' : draft.level
  const value = String(raw == null ? '' : raw).trim().toLowerCase()
  return LEVEL_OPTIONS.includes(value) ? value : ''
}

/**
 * 这一次查询的级别**是不是真的在页内筛过**：载荷里带了 `level` 才算。
 *
 * 界面拿它决定说不说那句「只筛了本页」——与 `outcome.level` 同真同假（宿主只在真筛时才回显它），
 * 但**不依赖回显**：查询还在途时（回显还没到）那句话就该在场，否则会出现「界面说没筛、其实筛了」
 * 的那几秒。判据只有一处，就是这里。
 */
export function levelFiltered(draft) {
  return levelFilterOf(draft) !== ''
}

/**
 * 一段明确的窗口能不能用：空串表示可以，否则是 i18n 键名后缀（badWindow）。
 *
 * 判据只有「两端都是有限数、且 to 晚于 from」——单位与上限由宿主判（别在浏览器侧复制一套
 * 会漂的规则），这里挡的是**形状不对**：那种窗口发出去要么被宿主打回，要么更坏——被当成
 * 「没给窗口」兜底成最近 15 分钟，于是界面写着「自定义」而查的是别的时段（D04 那一类）。
 */
export function windowProblem(window) {
  if (window === null || window === undefined || typeof window !== 'object') return 'badWindow'
  if (!Number.isFinite(window.from) || !Number.isFinite(window.to)) return 'badWindow'
  return window.to > window.from ? '' : 'badWindow'
}

/**
 * 点直方图某一根柱 → 这一步把时间窗夹到那一档，返回**新草稿**（窗口变了，筛选与查询串不动）。
 *
 * **为什么窗口住在草稿里（`draft.window`）而不是另存一份组件状态**（2026-10-15 修）：
 * 面板的查询一律经 `runQuery(append, override)` 发出去，`override` 是「这一次要用哪份草稿」
 * ——下钻、去筛选都靠它绕开「`setState` 要到下一次渲染才生效」。窗口若另存一份状态，点柱子
 * 那一枪读到的就还是**上一轮的窗口**（`preset` 已写成 `custom`，发出去的却是旧窗口），
 * 那正是 D04 那一类「说的和查的不是一件事」。放进草稿后，窗口与筛选、查询串一起被同一条
 * override 线带着走，**没有第二种传法**。
 *
 * 为什么还要一个「自定义」预设键（`custom`）：下拉显示的值必须与**真正会用的那一项**逐字相同。
 * 若沿用旧键（点 15 分钟里的一根柱，下拉还写着「最近 1 小时」），界面就在谎报。所以放大这一步
 * 显式落在 `custom` 上，而那一档的文案由界面按真实范围现算（见 index.js 的 `windowLabel`）。
 *
 * 下限（`ZOOM_MIN_MS`）是判据，不是装饰：一根柱 = 一个分桶档位（10 秒档就是 10 秒），
 * 点它夹出来的窗口可能只有 10 秒——宿主侧多数来源有窗口下限，而 10 秒窗在日志里
 * 通常一行都没有，界面上只会看到「没有命中」而看不出「你把窗缩得太小了」。
 * 夹到下限时如实说 `clamped: true`，界面要在那一行上讲出来（又是一处不许静默的收窄）。
 *
 * @param draft 当前草稿（只读它的 preset / filters / q，窗口由参数给）
 * @param barTs 这一根柱代表的桶起点（epoch 毫秒）
 * @param barStepMs 这一根柱的宽度（分桶档位，见 histogramInterval）
 * @returns `{ query, clamped }`；入参不对时回 `null`（界面不发请求）
 */
export function zoomToBar(draft, barTs, barStepMs) {
  if (draft === null || draft === undefined) return null
  const ts = Number(barTs)
  const step = Number(barStepMs)
  if (!Number.isFinite(ts) || !Number.isFinite(step) || step <= 0) return null
  const raw = { from: ts, to: ts + step }
  const clampedFrom = raw.to - raw.from < ZOOM_MIN_MS ? raw.to - ZOOM_MIN_MS : raw.from
  const window = { from: clampedFrom, to: raw.to }
  return {
    query: { ...draft, preset: 'custom', window },
    clamped: clampedFrom !== raw.from,
  }
}

/**
 * 取消放大：回到放大**之前**那一档（界面在放大时把当时的下拉值记在 `from`）。
 *
 * 为什么必须记住「从哪一档放大的」：窗口一旦被改成 `custom`，草稿里就没有任何地方能反推出
 * 原来选的是 15 分钟还是 24 小时了。若取消时随手回落到某个默认档（比如 1 小时），那就是
 * **替用户改窗口**——他点那一下的意思明明是「我不放大了」，不是「我要查最近 1 小时」。
 * 这与 `zoomToBar` 把「为什么要放大」写进 `clamped` 是同一条：**别替用户猜，也别说一套做一套**。
 *
 * `from` 必须是真预设（`windowOptions()` 里那几档）：认不出就回 `null`、由调用方**什么都不做**
 * ——退回 `custom` 但没有窗口会被 `queryProblem` 挡成 `badWindow`（点一下得到一句报错），
 * 而这里宁可让那一下没有反应（下拉还在，用户照样能自己选一档）。这条兜底在正常路径上不可达。
 *
 * 只动 `preset` 与 `window`：查询串 / 筛选 / 条数 / 级别都是用户自己的东西，取消放大不该碰
 * （与 `zoomToBar` 只加窗口是同一条）。
 *
 * @param draft 当前草稿（只读）
 * @param from 放大之前的那一档（预设键）
 * @returns 新草稿；`from` 不是真预设时回 `null`
 */
export function unzoomQuery(draft, from) {
  if (draft === null || draft === undefined || typeof draft !== 'object') return null
  const preset = String(from == null ? '' : from)
  if (!windowOptions().includes(preset)) return null
  const next = { ...draft, preset }
  // 窗口必须**撤掉**（不是留着）：留着它就成了「下拉写着 1 小时、草稿里还夹着自定义段」的第二份真相
  delete next.window
  return next
}

/**
 * 表单能不能提交：空串表示可以，否则是 i18n 键名后缀。
 *
 * 这里只校验**面板自己知道的事**（选没选来源、条数是不是正整数、自定义窗口的形状）；时间戳
 * 单位、窗口上限、limit 夹取都由宿主判，并且会以原话回给面板显示——**不要在浏览器侧复制一套
 * 会漂的规则**。
 *
 * `custom` 档**必须**带一段能用的窗口：缺了它不该静默落回 1 小时（那会让「说的窗口」与
 * 「查的窗口」变成两件事），所以在这里挡下、由界面说清（`error.badWindow`）。
 */
export function queryProblem(draft, targetCount) {
  const chosen = String(draft.target == null ? '' : draft.target).trim()
  if (chosen === '' && targetCount !== 1) return 'needTarget'
  const limit = Number(draft.limit)
  if (!Number.isInteger(limit) || limit < 1) return 'badLimit'
  if (String(draft.preset == null ? '' : draft.preset) === 'custom' && windowProblem(draft.window) !== '') return 'badWindow'
  return ''
}

/**
 * 提交载荷：面板只传来源 id / 查询串 / 时间窗 / 条数（游标由「下一页」单独带）。
 *
 * `custom` 档（直方图上点一根柱放大到那一档）不是「一个预设」而是**一段明确的时间范围**，
 * 它由草稿自带的 `window` 给（见 `zoomToBar`）；**不能塞回 `windowRange` 猜**。少了这一支，
 * 点柱子只会把下拉显示成「自定义」，真正发出去的却还是整个旧窗口——「说的与查的不是一件事」。
 *
 * 窗口不合法时**回落预设档**（而不是发一段畸形的）：这条回落是给「调用方绕过了
 * `queryProblem`」兜底的，正常路径上 `custom` 缺窗口会在那一层就被挡下。
 */
export function queryPayload(draft, targets, nowMs) {
  const preset = String(draft == null || draft.preset == null ? '' : draft.preset)
  const custom = draft == null ? undefined : draft.window
  const range = preset === 'custom' && windowProblem(custom) === ''
    ? { from: custom.from, to: custom.to }
    : windowRange(preset, nowMs)
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
  // 同理：不限级别时**不带这个键**（收成枚举值之后仍为空 = 不限，见 levelFilterOf）
  const level = levelFilterOf(draft)
  if (level !== '') payload.level = level
  return payload
}

/* ============================ 查询条件「变了没有」（P6 第八刀） ============================ */

/**
 * 一次查询的**条件指纹**：只取会影响请求的那几个字段。
 *
 * 用途只有一个：判断屏幕上那份结果**还是不是当前条件的**。面板里查询串 / 时间窗 / 级别 /
 * 条数 / 筛选 / 来源都是草稿（改了不自动重查——一改就查会在连点时打出一串请求），于是结果
 * 列表与查询栏可能一直说的不是同一件事。ES / OpenSearch 尤其不能糊过去：「下一页」带的是
 * **上一次查询**的 PIT + search_after，拿它配新条件翻页，等于把旧快照里的位置当成新查询的
 * 下一页——少掉的行、错位的行都**看不出来**（ES 的 `_search` 不会因此报错）。
 *
 * 三条判据：
 * - **预设档只比档名**：`1h` 每次查都是「到此刻为止」，比绝对毫秒只会把时钟走动误判成
 *   「用户改了条件」；`custom` 档（点柱放大）比那一段真实的 from/to——换了一段就是改了。
 * - **筛选按字段排序后比**：界面上一个字段只有一条筛选，数组顺序没有语义（见 `filtersOf`）。
 * - **查询串不 trim**：`queryPayload` 原样下发，这里也必须原样比；否则「末尾多一个空格」
 *   这种改动会被判成没变。
 */
export function querySignature(draft) {
  const row = draft === null || draft === undefined || typeof draft !== 'object' ? {} : draft
  const preset = String(row.preset == null ? '' : row.preset)
  const filters = filtersOf(row.filters)
  return JSON.stringify({
    target: String(row.target == null ? '' : row.target),
    q: String(row.q == null ? '' : row.q),
    preset,
    // `window` 只对 custom 有意义：预设档的绝对毫秒随「现在」变，比它等于把时钟当改动
    window: preset === 'custom' ? [Number(row.window && row.window.from), Number(row.window && row.window.to)] : null,
    // 与载荷同一条归一（认不出的级别当「不限」，见 levelFilterOf）：界面怎么下发，就怎么比
    level: levelFilterOf(row),
    limit: Number(row.limit),
    filters: filters === undefined ? [] : Object.keys(filters).sort().map((key) => [key, filters[key]]),
  })
}

/**
 * 「屏幕上的那份结果还是不是当前条件的」：与**上一次真正跑成功的那份草稿**比。
 *
 * `lastRun` 缺席（还没查过、或刚清空结果）时**不算过期**——那时界面上根本没有结果，
 * 说一句「结果过期了」是凭空多出来的噪音。
 *
 * 它挡的是两件事，不是观感：
 * ① 「下一页」把旧游标（ES 的 PIT）配新条件用（见 querySignature 的函数头）；
 * ② 「分组」把当前查询串配上一次回显的窗口发出去——行、分布、榜三处说的不是同一件事。
 */
export function queryStale(draft, lastRun) {
  if (lastRun === null || lastRun === undefined) return false
  return querySignature(draft) !== querySignature(lastRun)
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

/* ============================ 行上的标签（P6 第六刀） ============================ */

/*
 * 行的 `labels` / `raw` **早就随 `/query` 响应回来了**（`SearchOutcome.lines` 直接透传），面板却一行
 * 都没渲染——于是「这行是谁写的」（`container.name` / `host.name` / `log.file.path`）在卡片里根本
 * 看不到，想按它筛还得先去填「分组字段」再看榜，三步。这一节把「行上该摆哪几个标签、摆成什么样」
 * 的判据从组件闭包里拿出来（规矩 ②：要判对错的逻辑留在闭包里等于没有测试入口）。
 */

/** 行上直接摆出来的标签最多几个（其余的点「＋N」在浮层里看）。 */
export const ROW_LABEL_MAX = 3

/** 单个标签值在行上显示的长度上限（与 `src/line.ts` 的 `LABEL_VALUE_MAX` 同一口径，多留 40 给省略号）。 */
export const ROW_LABEL_VALUE_MAX = 160

/**
 * 一行的 labels → 「只有有值的那几个」标签行，**顺序就是宿主给的顺序**。
 *
 * 为什么顺序不在这里重挑（比如挑最短的、或挑「看起来像身份」的）：`src/line.ts` 的
 * `LABEL_PRIORITY` 已经把它排成「排查时先问什么」（容器 → 机器 → 服务 → 文件 → 流），
 * `flattenLabels` 就是按这个顺序装进 `labels` 的；再挑一次就是第二份会漂的判据。
 *
 * 空串不是「有值」：摆一个 `host.name=` 只是占位（与 `filterProblem` 挡空值是同一条）。
 * `display` 按 `ROW_LABEL_VALUE_MAX` 截断并带 `…`；`value` 永远是不截断的原值（点它下发的是原值）。
 *
 * **只此一份**：`rowLabels`（行上摆前 N 个）、`allRowLabels`（「＋N」浮层摆全部）与
 * `rowLabelOverflow`（「还有几个」）都走这里——三处口径想漂都漂不了。
 */
function labelRows(line) {
  const labels = line === null || line === undefined || typeof line !== 'object' ? undefined : line.labels
  if (labels === null || typeof labels !== 'object') return []
  const rows = []
  for (const [key, value] of Object.entries(labels)) {
    const text = String(value == null ? '' : value)
    if (text === '') continue
    rows.push({
      field: String(key),
      value: text,
      // 截断要**看得出来**（`…`）：行上只显示前面一段时必须说明后面还有
      display: text.length > ROW_LABEL_VALUE_MAX ? text.slice(0, ROW_LABEL_VALUE_MAX) + '…' : text,
    })
  }
  return rows
}

/**
 * 一行上直接摆哪几个标签：按宿主顺序取前 N 个。
 *
 * 摆不下的由 `rowLabelOverflow` 报数，点「＋N」在浮层里用 `allRowLabels` 看全部。
 */
export function rowLabels(line, max) {
  const limit = Number.isFinite(max) && max > 0 ? Math.floor(max) : ROW_LABEL_MAX
  return labelRows(line).slice(0, limit)
}

/**
 * 这一行的**全部**有值标签（「＋N」浮层用）——与 `rowLabels` 同一条判据，只是不设上限。
 */
export function allRowLabels(line) {
  return labelRows(line)
}

/**
 * 这一行还有几个标签没摆出来（「＋N」）。
 *
 * 数的口径与 `rowLabels` **同源**（两者都走 `labelRows`）：只数**有值的**。空值那些本来就不该
 * 占位——把它们算进来，行尾就会写「还有 2 个」，而点开浮层只有两行空值，那句话就成了假的。
 */
export function rowLabelOverflow(line, max) {
  return Math.max(labelRows(line).length - rowLabels(line, max).length, 0)
}

/**
 * 行的悬停文案：时间 + 级别（**推断出来的标出来**）+ 全部标签 + 原文。
 *
 * `levelInferred` 必须写出来：`level` 是筛选项，「文档说它是 error」与「我从正文看着像 error」是两种
 * 可信度（`src/backends/types.ts` 对这一位有专门的口径）。界面拿这个 level 筛之前有权知道是哪种。
 */
export function lineTitle(line) {
  if (line === null || line === undefined || typeof line !== 'object') return ''
  const parts = []
  const ts = Number(line.ts)
  parts.push(Number.isFinite(ts) ? new Date(ts).toLocaleString() : '')
  if (typeof line.level === 'string' && line.level !== '') {
    parts.push(line.level + (line.levelInferred === true ? '（从正文推断）' : ''))
  }
  const labels = line.labels === null || typeof line.labels !== 'object' || line.labels === undefined ? {} : line.labels
  for (const [key, value] of Object.entries(labels)) parts.push(key + ' = ' + String(value == null ? '' : value))
  const raw = String(line.raw == null ? '' : line.raw)
  if (raw !== '') parts.push('', raw)
  return parts.join('\n')
}

/**
 * 行上的标签值能不能直接变成一条筛选（不能则回 i18n 键名后缀，界面据此不给那个按钮）。
 *
 * 判据就是 `filterProblem` 那一条：**值不做 trim**（`log.level` 的值可能是 `"ERROR "`，键名里那个
 * 空格是内容的一部分——裁掉就静默筛不到东西），空值表达不了「字段缺失」。
 */
export function rowFilterProblem(label) {
  if (label === null || label === undefined || typeof label !== 'object') return 'needFilterField'
  return filterProblem(label.field, label.value)
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
 * 字段候选面板要摆哪些字段（「有哪些字段」拉回来的那一份）。
 *
 * 三条判据：
 *
 * - **按输入框里的字做子串过滤**（大小写不敏感）：这就是原来 `<input list>` 的原生行为——
 *   输入 `log.` 时只剩 `log.file.path` / `log.level` 这类。空输入 = 全都给（「点一下看有哪些字段」）。
 * - **保持宿主给的顺序**：适配器已经把「聚得动的」（`.keyword` / 原生类型）排在前面，
 *   再排一次等于把那条判据盖掉（与 `groupBars` 同一条：顺序是结论的一部分）。
 * - **命中 0 个就回空数组**：界面据此**不画**那个浮层——一个空浮层比不画更像坏了
 *   （同一判据的先例：`list.noBuckets` 是一句话，不是一条没有名字的横条）。
 */
export function fieldChoices(fields, typed) {
  const needle = String(typed == null ? '' : typed).trim().toLowerCase()
  const rows = []
  for (const item of Array.isArray(fields) ? fields : []) {
    if (item == null) continue
    const name = String(item.name == null ? '' : item.name)
    if (name === '') continue
    if (needle !== '' && name.toLowerCase().indexOf(needle) === -1) continue
    /*
     * **冲突信息要一路带到行上**（宿主标了 `conflict: true` 的那些字段：同名在不同索引里类型不一致，
     * 拿它分组可能只覆盖一部分索引）。只在真有信息时才加这两个键——普通候选照旧是 `{ name }`，
     * 免得每一行都挂一对空字段（也让「加了什么」这件事在用例里一眼看得出来）。
     */
    if (item.conflict === true) {
      rows.push({ name, conflict: true, esTypes: Array.isArray(item.esTypes) ? item.esTypes.map((type) => String(type)) : [] })
      continue
    }
    rows.push({ name })
  }
  return rows
}

/**
 * 候选里「当前那一行」上下挪一格：**到头就停**（不绕回）。
 *
 * 为什么不绕回：绕回会让「按了一下方向键」看起来像跳过了几行（候选只有两三条时尤其如此），
 * 而这里没有任何东西提示「你绕了一圈」。停住是可预期的，绕回不是。
 * 空列表回 0（那种情况下界面根本不画浮层，也就无所谓哪一行）。
 */
export function pickMove(current, delta, length) {
  const count = Number.isInteger(length) && length > 0 ? length : 0
  if (count === 0) return 0
  const at = Number.isInteger(current) ? current : 0
  const step = Number.isFinite(delta) ? delta : 0
  return Math.min(Math.max(at + step, 0), count - 1)
}

/**
 * 「点开候选」时要不要真的去拉一份字段清单。
 *
 * 判据只有两条：**还没拉过**，或者**换了来源**。同一个来源再点开就**不重拉**——`_field_caps` 虽小，
 * 但「每次点输入框都打一枪后端」是白花别人的机器；要手动重拉的出口在浮层页脚那个「刷新」上
 * （字段会随新数据长出来，所以必须留一个口子）。
 *
 * 空来源（还没选）不拉：那时候界面上该说的是「先选一个来源」（见 client-src/index.js 的 `openPick`）。
 * 失败时**不写缓存**——那是调用方的事（`loadFields` 只在成功分支记 `fieldsSource`），所以下次点开重试。
 */
export function fieldFetchNeeded(cachedTargetId, targetId) {
  const wanted = String(targetId == null ? '' : targetId)
  if (wanted === '') return false
  return String(cachedTargetId == null ? '' : cachedTargetId) !== wanted
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

/**
 * 「这份容器清单属于谁」的缓存键：loglens 来源 id + Docker 目标名（空串 = 让 Docker 面板自己回落）。
 *
 * 为什么要有键（2026-10-14 面板改成**自动拉**容器，不再有点按钮那一步）：自动拉必须自己回答
 * 「现在这份清单还算不算数」——换来源、换 Docker 目标都要重拉（不同机器上的容器当然不一样），
 * 同一个目标不能每渲染一次就拉一次。缓存与在途判据都按它比（配合 `fieldFetchNeeded` 那条「不同才拉」）。
 * 拿不到 id（还没选来源）回空串：**空键永远不算「已缓存」**，也就不会有请求打出去。
 */
export function containersKey(draft) {
  if (draft === null || draft === undefined) return ''
  const id = String(draft.id == null ? '' : draft.id)
  if (id === '') return ''
  return id + '|' + String(draft.dockerTarget == null ? '' : draft.dockerTarget)
}

/**
 * 容器下拉**第一项**（那个空 value 的占位项）现在该说哪一种状态。
 *
 * 真机（2026-10-14）：选中 Docker 来源之后要好几秒才拿到清单（走 SSH 的目标 7 秒），这段时间下拉里
 * 写的是「容器」——看起来就是一个没人碰过的空下拉，看不出**是在拉、还是拉空了、还是拉挂了**。
 * 三种「还没有选项」都得说清是哪一种，这就是这一格的全部职责。
 *
 * 优先级：**有清单 > 失败 > 在途 > 空清单**。
 *
 * - **有清单一律回默认**：那一刻显示哪一项由 `<select value>` 决定，占位项只在没选中时露出来。
 *   重拉（换目标 / 点「刷新」）时旧清单还摆在眼前，把占位项改成「加载中…」等于替用户扔掉看得见的东西。
 * - **失败要压在「在途」前面**：失败时**故意不写缓存**（见 `loadContainers` 的 catch），于是
 *   `pending` 在失败之后**一直为真**——它说的是「这笔账还欠着」，不是「请求已经在路上」。
 *   顺序放反，一次失败会让这一格永远写着「加载中…」。
 * - **`available`（Docker 面板插件在不在）压过一切**：插件不在时那个请求根本发不出去
 *   （`loadContainers` 一进门就 return），写「加载中…」就是一句永远不落地的谎；此刻这一格是灰的，
 *   下面那句 hint 才是解释的人。
 *
 * 返回的是**状态名**而不是文案：pure 层不认识 i18n（文案在 index.js 里查表），也就不存在
 * 「在没有 locale 的老宿主上漏出一串键名」这回事。
 *
 * @param {{available?: boolean, pending?: boolean, busy?: boolean, error?: string, count?: number}} options
 *   `pending` = 这个键还没拿到清单（用 `fieldFetchNeeded(containersSource, containersKey(draft))` 算）；
 *   它比 `busy` 早一帧为真——effect 还没跑的那一帧就已经是「在拉」了，靠它才不会先闪一下「没有容器」。
 * @returns {'default' | 'loading' | 'error' | 'empty'}
 */
export function containerSlotState(options) {
  const source = options === undefined || options === null ? {} : options
  if (source.available !== true) return 'default'
  if (Number.isFinite(source.count) && source.count > 0) return 'default'
  if (typeof source.error === 'string' && source.error !== '') return 'error'
  if (source.busy === true || source.pending === true) return 'loading'
  return 'empty'
}

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
