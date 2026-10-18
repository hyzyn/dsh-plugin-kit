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
 * 级别该染什么色（界面用三个色档，不按 severity 数字自己调色）：
 * error / fatal → 红；warn → 橙；info → 次要前景；debug / trace / 没有级别 → 灰。
 *
 * 为什么值得单独一条：`level` 是从正文推断出来的也照样显示（`levelInferred`），原来一律染
 * `state-warn-primary`——满屏 debug 看着像一片告警。颜色是「一眼扫过去先看哪行」的第一层信号，
 * 不能所有级别都同一个颜色。
 */
export function levelTone(level) {
  const value = typeof level === 'string' ? level.trim().toLowerCase() : ''
  if (value === 'error' || value === 'fatal') return 'error'
  if (value === 'warn') return 'warn'
  if (value === 'info') return 'info'
  // 没有级别 = 不知道，不染成告警色；debug / trace 也只是灰
  return 'muted'
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

/**
 * 结果列表「本页排序」（第十三刀）。
 *
 * 为什么是**本页**：宿主没有服务端排序（`NormalizedQuery.sort` 属于 P8-丁，要动契约，见
 * design.md §9.5）。而宿主给的顺序是**时间倒序**（`direction` 默认 backward，见 src/query.ts），
 * 于是「这一页里 error 在哪」只能靠眼睛从 100 行里翻——排序这一页解决的是**扫读**，不是
 * 「排序全部命中」；界面上的标题必须写明「本页」，不许让人读成后者（设计 §9.3 #8 的同一条边界）。
 *
 * 三档（`time` 是宿主原序，不重排）：
 * - `time`：原样（= 后端顺序，`appendLines` 追加的下一页也接着排）
 * - `level`：严重度**从重到轻**（fatal → error → warn → info → debug → trace → 无级别最后），
 *   同档内保持宿主原序（稳定排序：`Array.prototype.sort` 在 ES2019 起是稳定的，但这里**显式**
 *   用原下标兜底，免得将来换实现的运行时改变结果）
 * - `message`：按正文的 `localeCompare`，其余同上
 *
 * **为什么 `time` 要单列一档而不是「排序的一个方向」**：宿主原序不是「按 ts 排序」——同一纳秒的
 * 多行是**切不开的一组**（末组会略超 limit，见 README 的翻页取舍）。按 ts 重排会把那一组打散，
 * 于是一页之内的顺序与**翻页游标**描述的顺序不再一致。原序是唯一与游标同源的顺序，它必须留着。
 */
const LEVEL_RANK = { fatal: 0, error: 1, warn: 2, info: 3, debug: 4, trace: 5 }

/** 排序档位的键（下标就是界面上循环切换的顺序）。 */
export function sortKeys() {
  return ['time', 'level', 'message']
}

/** 把排序请求收成能用的那一档：不认识的一律回原序（`time`）。 */
export function sortKeyOf(key) {
  const value = String(key == null ? '' : key)
  return sortKeys().includes(value) ? value : 'time'
}

/**
 * 这一页按哪一档排（返回**新数组**，不改入参）。
 *
 * 空 / 单行原样返回：没有必要为一页 0 行造一个新数组（也不会在渲染里白白换一次引用）。
 */
export function sortLines(lines, key) {
  const rows = Array.isArray(lines) ? lines.slice() : []
  const mode = sortKeyOf(key)
  if (mode === 'time' || rows.length < 2) return rows
  const rank = (line) => {
    const level = line !== null && typeof line === 'object' && typeof line.level === 'string' ? line.level.trim().toLowerCase() : ''
    return LEVEL_RANK[level] === undefined ? 6 : LEVEL_RANK[level]
  }
  const text = (line) => (line !== null && typeof line === 'object' && line.message !== undefined ? String(line.message) : '')
  // 带原下标：同值时按「宿主给的顺序」排（显式稳定，不依赖运行时的 sort 实现）
  const indexed = rows.map((line, index) => ({ line, index }))
  indexed.sort((left, right) => {
    const delta = mode === 'level'
      ? rank(left.line) - rank(right.line)
      : text(left.line).localeCompare(text(right.line))
    return delta !== 0 ? delta : left.index - right.index
  })
  return indexed.map((item) => item.line)
}

/*
 * 档位的**文案**不在这里：本包的做法是「逐条列字面量、放在组件里」（见 index.js 的 kindLabel /
 * levelLabel / windowLabel / reasonText），静态 i18n 闸门才扫得到那些键。这里只留**判据**
 * （哪一档、收口到哪一档）——与 levelTone 只回色档、文案由界面拼是同一条分工。
 */

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

/**
 * 时间分布柱子的**画法**（第十六刀）：把「每段多少条」变成柱高。
 *
 * 为什么不是简单的 `count / max`：真机那张图上 61 根柱子里 **50 根落在 60~70% 这一档**
 * （常态 ~460 条、峰值 681），线性归一化之后整张图是一条平带——**图的意义是看差异**，
 * 而峰值把差异压平了。这不是数据的问题（日志量本来就在那个量级上很稳），是画法的问题。
 *
 * 三档做法，按数据自己挑（**不让人选**：多一个开关就多一个要解释的东西）：
 *
 * ① `linear`：全部柱子都用「零起点」的诚实比例。**只在数据本来就铺得开时用**（最大 / 最小 ≥ 3）——
 *    那种时候线性轴最容易读，也不需要解释；
 * ② `clipped`：数据挤在一起时，从 **`floor`** 起画（基线裁剪），把 [floor, max] 这一段的差异拉开。
 *    这是**统计图表的通行做法**，但它有一个必须付的代价：**柱高不再与条数成正比**。
 *    所以界面**必须明说**（见 `histogramScaleNote`），否则读到的是错的量级；
 * ③ `flat`：全是同一个值（或一条都没有）——怎么画都一样，老实画平带，也不写那句裁剪说明
 *    （说了反而让人以为被裁过）。
 *
 * `floor` 取 `min × 0.9` 再向下取整到「好读的台阶」：留 10% 余量是为了让**最小那根也看得见**
 * （贴着基线的那根柱子分不清「很少」与「没有」）。
 *
 * @returns `{ mode, floor, max, note }`：`mode` 是 `linear` / `clipped` / `flat`，
 *   `note` 是**界面上该说的那句话的键**（`linear`/`flat` 不需要说明，回空串）。
 */
export function histogramScale(bars) {
  const list = Array.isArray(bars) ? bars : []
  let max = 0
  let min = Number.POSITIVE_INFINITY
  let seen = 0
  for (const bar of list) {
    if (bar === null || typeof bar !== 'object') continue
    const count = Number.isFinite(bar.count) && bar.count > 0 ? bar.count : 0
    if (count <= 0) continue
    seen += 1
    if (count > max) max = count
    if (count < min) min = count
  }
  if (seen === 0 || max <= 0) return { mode: 'flat', floor: 0, max: 0, note: '' }
  // 全一样（或只有一个非零桶）：没有差异可放大，画平带
  // 只有一个非零桶、或非零桶的值全都一样：**没有差异可放大**，老实画平带
  if (seen < 2 || max === min) return { mode: 'flat', floor: 0, max: max, note: '' }
  /*
   * 挤在一起 → 基线裁剪。**这条判据是「最大 / 最小 < 3」**：真机那组是 681 / 278 ≈ 2.4，
   * 落在这一档里。而「差异本来就大」的数据（比如夜里 0 条、白天 900 条，比例几百倍）
   * 走 linear——那种图本来就一目了然，给它加一句「柱高不是从零起」纯属多话。
   */
  if (max / min < 3) {
    const floor = Math.max(1, Math.floor(min * 0.9))
    return { mode: 'clipped', floor: floor, max: max, note: 'hint.histogramClipped' }
  }
  return { mode: 'linear', floor: 0, max: max, note: '' }
}

/**
 * 峰值那根柱的起点 ts（第十六刀）；空输入 / 全是 0 返回 undefined。
 *
 * 为什么值得一个函数：标题上写着「峰值 681 条」，而真机那张图上**哪一根是 681 完全看不出来**
 * ——61 根柱子里最高的那根只比别人高一点点（681 vs 常态 ~460），肉眼根本挑不出来。图上必须
 * 给那根一个记号，否则那个数字只能靠挨个悬停去找。
 *
 * **并列时取第一根**（不是随便取）：两根一样高时说「峰值在左边那根」与「在右边那根」都对，
 * 取第一根至少是确定性的，且与「从左到右读图」的习惯一致。
 */
export function histogramPeakTs(bars) {
  const list = Array.isArray(bars) ? bars : []
  let best
  let bestCount = 0
  for (const bar of list) {
    if (bar === null || typeof bar !== 'object') continue
    const count = Number.isFinite(bar.count) ? bar.count : 0
    if (count <= 0) continue
    if (count > bestCount) {
      bestCount = count
      best = bar.ts
    }
  }
  return bestCount > 0 && Number.isFinite(best) ? best : undefined
}

/**
 * 一根柱在悬停 / 读屏里该念的那句话（第十六刀）。
 *
 * 改之前柱子的悬停是浏览器的原生 tooltip，里面写着 `18:28:00.000 · 429 条`：
 *   - **毫秒对 1 分钟一档的分桶是纯噪音**（每一根都这么长，读的人得先跳过它才看见条数）；
 *   - 原生 tooltip 还会**盖住横轴刻度**（真机截图里那个灰框正压在 18:27 上）；
 *   - 图上一个时间点都没有时，读者分不清 `18:28` 指的是「这一分钟的开始」还是「这一段」。
 *
 * 所以时刻按**分桶宽度**选精度（`bucketClock`），并在末尾带上「这一段」的范围说明。
 * 返回纯文本（不进 i18n：这是数据 + 数字，标签那半句由界面拼）。
 */
export function histogramBucketClock(ts, stepMs) {
  const value = Number.isFinite(ts) ? ts : 0
  const step = Number.isFinite(stepMs) && stepMs > 0 ? stepMs : 0
  const date = new Date(value)
  const pad = (number) => String(number).padStart(2, '0')
  const clock = pad(date.getHours()) + ':' + pad(date.getMinutes())
  // 分桶 ≥ 1 分钟：秒一定是 00（桶按整分对齐），写出来只是噪音
  if (step === 0 || step >= 60 * 1000) return clock
  return clock + ':' + pad(date.getSeconds())
}

/**
 * 时间分布横轴要标哪几个时刻（第十三刀）。
 *
 * 真机读数（2026-10-17，test-logs @ 3085，真 ES，1 小时窗 / 61 根柱）：图上除了「每根柱子 1m /
 * 峰值 / 合计」三句话，**一个时间点都没有**——那根最高的柱子是哪一分钟，只能靠数的：从左端
 * 往后数第 N 根再乘 1 分钟。横轴刻度把这件事变成一眼。判据四条：
 *
 * ① **首尾各标一个**（`to` 用窗口右端、不是最后一根柱的起点：柱子代表的是 [ts, ts+step) 那一段，
 *    把右端标成柱子起点会让「最后这一分钟的量」看起来落在窗口之外）；
 * ② 中间的刻度**按窗口等分**挑（1/3、2/3），再**吸附到柱子的网格上**（`ts` 取整到 step 的倍数）——
 *    等分保证间距均匀（第一版按「从整点起每 N 根柱」走，首格经常与左端那个刻度重叠，于是
 *    实际只剩一个中间刻度、右边空出一大段）；
 * ③ 刻度**位置由吸附后的 ts 算**（不是由等分点算）：标签上的时刻与它画在哪儿必须是同一件事，
 *    宁可位置偏半根柱，也不许「写着 17:48、画在 17:47 的位置」；
 * ④ **最多 4 个**：再密就糊成一条灰带，而轴上的字比柱子本身更抢眼。
 *
 * 认不出的输入回空数组：界面据此**不画轴**（画一条只有首尾两端的轴等于没标）。
 */
export function histogramAxis(bars, from, to, maxTicks) {
  const list = Array.isArray(bars) ? bars : []
  const start = Number.isFinite(from) ? from : 0
  const end = Number.isFinite(to) ? to : 0
  const limit = Number.isInteger(maxTicks) && maxTicks >= 2 ? maxTicks : 4
  if (list.length < 2 || !(end > start)) return []
  const step = Number.isFinite(list[1].ts) && Number.isFinite(list[0].ts) ? list[1].ts - list[0].ts : 0
  if (!(step > 0)) return []
  const span = end - start
  const ticks = [{ ts: start, at: 0 }]
  /*
   * 中间刻度：窗口的 1/(n+1) 等分点，各吸附到最近的柱子边界（`round` 而不是 `ceil`：吸附误差
   * 最多半根柱，取最近的才不会把 1/3 处的刻度系统性推到右边）。
   */
  const wanted = Math.max(limit - 2, 0)
  for (let index = 1; index <= wanted; index += 1) {
    const target = start + (span * index) / (wanted + 1)
    const ts = Math.round(target / step) * step
    if (!(ts > start) || !(ts < end)) continue
    // 位置按**窗口比例**给（刻度位置与标签上的时刻同源：同一个 ts 算出来的）。
    // 四舍五入到 0.1%：内联 style 里也该是一眼读得懂的数。
    ticks.push({ ts, at: Math.round(((ts - start) / span) * 1000) / 10 })
  }
  ticks.push({ ts: end, at: 100 })
  return ticks
}

/**
 * 横轴刻度上的时刻（本地时间，**不经过 locale**）。
 *
 * 为什么不复用界面里那个 `formatTime`：那个带毫秒、且只会在「跨天」时才补日期——刻度上需要的是
 * 另一套取舍（**按窗口跨度选精度**），而且它必须是**纯函数**才能进 vitest（刻度是坐标，
 * 错了整张图读出来的时刻全是错的）。
 *
 * 三档：
 * - 窗口 ≤ 2 分钟：`HH:mm:ss`（1 分钟档的分桶里，秒是有效信息）
 * - 窗口 < 12 小时：`HH:mm`
 * - 更长：`MM-DD HH:mm`（跨天时只写时分会读成同一天的两个时刻）
 */
export function formatTickTime(ts, spanMs) {
  const value = Number.isFinite(ts) ? ts : 0
  const span = Number.isFinite(spanMs) ? spanMs : 0
  const date = new Date(value)
  const pad = (number) => String(number).padStart(2, '0')
  const clock = pad(date.getHours()) + ':' + pad(date.getMinutes())
  if (span > 0 && span <= 2 * 60 * 1000) return clock + ':' + pad(date.getSeconds())
  if (span >= 12 * 60 * 60 * 1000) return pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + clock
  return clock
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

/* ============================ 字段侧栏与结果表列集（P8-乙） ============================ */

/**
 * 结果表能加的额外列上限。
 *
 * 为什么有上限：行是 flex（正文 `flex:1`），每加一列都在抢同一行宽度；四列之后窄卡片里正文会先被
 * 挤到看不清。宁可在「加不动」时明说一句，也不让人自己加到一个看不出东西的表。
 */
export const RESULT_COLUMN_MAX = 4

/** 侧栏一个分区最多渲染多少行（再多就靠子串过滤收窄；界面报「共 N 个」）。 */
export const FIELD_LIST_MAX = 200

/**
 * 这一页的标签字段使用情况：`[{ name, count }]`，count = 这一页里带这个字段的行数。
 *
 * 为什么只数**这一页**：行模型里只有 labels 随响应回来（其余字段没有逐行值），而这一页被
 * `limit` 截断过——界面上必须写「本页」，不能让人读成「全窗口」。排序：出现次数降序、同次数按
 * 名字（稳定顺序，不随对象键顺序漂）。
 */
export function pageFieldUsage(lines) {
  const counts = new Map()
  for (const line of Array.isArray(lines) ? lines : []) {
    const labels = line !== null && typeof line === 'object' && line.labels !== null && typeof line.labels === 'object' ? line.labels : {}
    for (const [name, value] of Object.entries(labels)) {
      const text = String(value == null ? '' : value)
      if (text === '') continue
      counts.set(name, (counts.get(name) || 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
}

function fieldNameOf(item) {
  return item !== null && typeof item === 'object' && typeof item.name === 'string' ? item.name : ''
}

/**
 * 字段名的**最后一段**（`container.labels.com_docker_compose_image` → `com_docker_compose_image`）。
 *
 * 为什么要它（第二十一刀）：真机上这台来源有 **92 个字段，其中 58 个是 `container.labels.*`**
 * ——一层平铺的列表把 `agent.name` 这种短名字和 `container.labels.com_docker_compose_project_environment_file`
 * 这种长名字混排在一起，长名字折成两三行、行高参差，扫起来全是噪音。
 * 分组之后行里只写末段，父路径由组头说——`container.labels` 组从 58 行折行文字变成 58 行短词。
 *
 * 没有点的名字（`stream`）就是它自己。
 */
export function fieldLeaf(name) {
  const text = String(name == null ? '' : name)
  const at = text.lastIndexOf('.')
  return at === -1 ? text : text.slice(at + 1)
}

/**
 * 字段名的**父路径**（`container.labels.foo` → `container.labels`）；没有点就是空串。
 *
 * 分组键。选「父路径」而不是「第一段」是因为真机数据：按第一段分，`container` 仍是 61 个的一坨
 * （其中 58 个是 labels）；按父路径分，那 58 个收成**一个可折叠的组**，而 `container` 组只剩 3 个
 * 直接子字段。组的名字就是「这批字段的共同父路径」，没有额外规则要记。
 */
export function fieldParent(name) {
  const text = String(name == null ? '' : name)
  const at = text.lastIndexOf('.')
  return at === -1 ? '' : text.slice(0, at)
}

/**
 * 过滤词拆成多个词（第二十一刀）：按空白切分、转小写、去重、丢空串。
 *
 * 为什么不是单个子串：真机上这个框是 92 个字段**唯一**的导航方式，而人打字是分词的
 * （「cont name」想找 container 那边带 name 的字段）。单串匹配要求用户记得确切连写形式，
 * 打 `container name` 会得到 0 个结果——那不是「没找到」，是「你打的方式这个框不认」。
 */
export function fieldFilterTerms(text) {
  const words = String(text == null ? '' : text).toLowerCase().split(/\s+/)
  return [...new Set(words.filter((word) => word !== ''))]
}

/** 一个字段名是否命中**全部**词（每个词都是一段子串；空词表 = 全命中）。 */
export function fieldMatches(name, terms) {
  const lower = String(name == null ? '' : name).toLowerCase()
  const list = Array.isArray(terms) ? terms : []
  return list.every((term) => lower.includes(term))
}

/**
 * 把一组字段按**父路径**分组（第二十一刀）。
 *
 * 返回 `[{ key, items }]`，`key` 是父路径（顶层字段是空串）。组按名字排、**顶层组永远排最前**
 * （`stream` / `message` 这类是通常最先要看的），组内保持入参顺序（调用方已经按
 * 「常用优先 / 出现次数」排好了，这里不重排——重排就是第二份判据）。
 *
 * 入参的每一项**原样保留**（不改形状）：叶子名由 `fieldLeaf` 现算，分组不往数据里塞字段，
 * 少一个会与 `name` 漂的第二份真相。
 */
export function groupFieldsByParent(items) {
  const groups = new Map()
  for (const item of Array.isArray(items) ? items : []) {
    const name = fieldNameOf(item)
    if (name === '') continue
    const key = fieldParent(name)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }
  return [...groups.entries()]
    .sort((left, right) => {
      const a = left[0]
      const b = right[0]
      if (a === b) return 0
      if (a === '') return -1
      if (b === '') return 1
      return a < b ? -1 : 1
    })
    .map(([key, groupItems]) => ({ key, items: groupItems }))
}

/**
 * 侧栏三分区（字段清单来自 `/fields`，使用情况来自 `pageFieldUsage`）：
 *   hit      = 这一页的行里真有值的字段（**只有这些能加列**——列的值来自行标签）
 *   conflict = `/fields` 标了 `conflict: true` 的字段（同名在不同索引里类型不一致）
 *   rest     = 其余可用字段（不能加列，但可以按值筛 / 填进分组框）
 *
 * `filterText` 是**多词过滤**（空白分词、每词都要命中、不区分大小写；空串不过滤，见
 * `fieldFilterTerms`）。三个分区**互斥**：hit 优先——哪怕它在
 * `/fields` 里也标了冲突，这一页的行确实带着值，列就能画。
 * `totals` 是过滤后各自的总数（界面拿它说「共 N 个」；渲染可以再截断到 `FIELD_LIST_MAX`）。
 *
 * 为什么「其余」也能筛但写着不能加列：筛选下发的是「字段 = 值」，不需要逐行值；列要逐行画，
 * 而行里没有它的值——给它一个能点、画出来全是 `—` 的入口，比不给更坏。
 */
export function fieldSections(fields, usage, filterText) {
  // 多词 AND（判据在 fieldFilterTerms / fieldMatches）：`cont name` → container.name
  const terms = fieldFilterTerms(filterText)
  const match = (name) => fieldMatches(name, terms)
  const byName = new Map()
  for (const field of Array.isArray(fields) ? fields : []) {
    const name = fieldNameOf(field)
    if (name === '' || byName.has(name)) continue
    byName.set(name, field)
  }
  const hitNames = new Set()
  const hit = []
  for (const item of Array.isArray(usage) ? usage : []) {
    const name = fieldNameOf(item)
    if (name === '' || hitNames.has(name) || !match(name)) continue
    hitNames.add(name)
    const field = byName.get(name)
    hit.push({
      name,
      count: Number.isFinite(item.count) ? item.count : 0,
      ...(field === undefined ? {} : {
        ...(typeof field.kind === 'string' ? { kind: field.kind } : {}),
        ...(field.preferred === true ? { preferred: true } : {}),
        ...(field.conflict === true ? { conflict: true } : {}),
        ...(Array.isArray(field.esTypes) ? { esTypes: field.esTypes.slice() } : {}),
      }),
    })
  }
  const rest = []
  const conflict = []
  for (const [name, field] of byName) {
    if (hitNames.has(name) || !match(name)) continue
    const item = {
      name,
      ...(typeof field.kind === 'string' ? { kind: field.kind } : {}),
      ...(field.preferred === true ? { preferred: true } : {}),
      // 冲突标记要**跟着这一行走**：侧栏在「类型冲突」分区里靠它画那个小标记
      ...(field.conflict === true ? { conflict: true } : {}),
      ...(Array.isArray(field.esTypes) ? { esTypes: field.esTypes.slice() } : {}),
    }
    if (field.conflict === true) conflict.push(item)
    else rest.push(item)
  }
  // 其余字段按「常用优先、再按名字」：宿主已经把优先键标成 preferred，别在这里重挑
  rest.sort((left, right) => (left.preferred === right.preferred ? 0 : left.preferred === true ? -1 : 1)
    || (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
  conflict.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
  return { hit, conflict, rest, totals: { hit: hit.length, conflict: conflict.length, rest: rest.length } }
}

/**
 * 点「列」：已在列集里 → 去掉；不在 → 加到最后。返回 `{ columns, problem }`，
 * problem 是 `badColumn` / `columnLimit`（满员的说法由界面翻成人话）。
 * 不可变：返回新数组（调用方 setState 才有意义）。
 */
export function columnToggle(columns, field) {
  const list = Array.isArray(columns) ? columns.slice() : []
  const name = String(field == null ? '' : field)
  if (name === '') return { columns: list, problem: 'badColumn' }
  const at = list.indexOf(name)
  if (at !== -1) {
    list.splice(at, 1)
    return { columns: list, problem: '' }
  }
  if (list.length >= RESULT_COLUMN_MAX) return { columns: list, problem: 'columnLimit' }
  list.push(name)
  return { columns: list, problem: '' }
}

/**
 * 结果表的列宽（有额外列时用 CSS grid，宽了由结果区**横向滚动**）：
 * 展开箭头 · 时间 · 级别 · 正文（min 198px，有富余时吃满）· 每个额外列 96px · 身份标签 250px。
 *
 * 为什么不是「让 flex 自己挤」：正文是唯一可伸缩的那一格，额外列一多它就归零
 * （真机上 4 列时正文 0px、一行 1176px 高）。这里给正文一个下限，宁可让表横向滚动，
 * 也不把日志正文压成一行一个字。0 列时返回空串（界面退回原来的 flex 行，行为一点不变）。
 */
const RESULT_COLUMN_TRACKS = {
  toggle: '14px',
  time: '90px',
  level: '36px',
  message: 'minmax(198px,1fr)',
  cell: '96px',
  tags: '250px',
}
export function resultColumnsTemplate(columns) {
  const list = Array.isArray(columns) ? columns.slice(0, RESULT_COLUMN_MAX) : []
  if (list.length === 0) return ''
  return [
    RESULT_COLUMN_TRACKS.toggle,
    RESULT_COLUMN_TRACKS.time,
    RESULT_COLUMN_TRACKS.level,
    RESULT_COLUMN_TRACKS.message,
    ...list.map(() => RESULT_COLUMN_TRACKS.cell),
    RESULT_COLUMN_TRACKS.tags,
  ].join(' ')
}

/**
 * 行里某一列的显示值：取行标签里的原值；没有（这一页这行没带）就是 undefined——
 * 界面画 `—` 并在悬停里说「这一行没有这个字段」，**不造一个假值**。
 */
export function columnValue(line, field) {
  const name = String(field == null ? '' : field)
  if (name === '') return undefined
  const labels = line !== null && typeof line === 'object' && line.labels !== null && typeof line.labels === 'object' ? line.labels : {}
  const value = labels[name]
  if (value === undefined || value === null) return undefined
  const text = String(value)
  return text === '' ? undefined : text
}

/**
 * 行详情里的原文：超长截断并**明说截断**（设计 §9.6「raw 超长截断 + 已截断」）。
 * 返回 `{ text, truncated, total }`；`total` 是原文字符数（界面用它在提示里报数）。
 */
export const RAW_PREVIEW_MAX = 20000
export function rawPreview(raw, max) {
  const text = String(raw == null ? '' : raw)
  const limit = Number.isFinite(max) && max > 0 ? Math.floor(max) : RAW_PREVIEW_MAX
  if (text.length <= limit) return { text, truncated: false, total: text.length }
  return { text: text.slice(0, limit), truncated: true, total: text.length }
}

/* ------------------------------------------------------------------ *
 * 浮层定位与开关（第二十二刀）
 * ------------------------------------------------------------------ */

/**
 * 浮层落在哪儿：给**触发它的那颗按钮**的视口坐标（`anchor`），算出浮层的视口坐标。
 *
 * 三条边界（浮层跑出屏幕、或者反过来盖住触发它的那颗按钮，都是这一类东西的通病）：
 *   ① 横向：`align: 'right'` 右缘对齐按钮右缘（元信息行那颗在整行右侧，左对齐要向左伸 300px）；
 *      `align: 'left'` 左缘对齐按钮左缘（筛选行那颗在左侧，右对齐会缩回最左边去）；
 *      两种都夹进视口（`margin` ~ `vw - width - margin`）。
 *   ② 纵向优先**往下开**（`bottom + gap`）：下面放得下 `height`（面板想要的高度）就一个像素都不动。
 *   ③ 下面放不下就**上翻**；两边都放不下（真机 816×782 上一抓就是——面板想要 520，上下各只剩
 *      300 多）就挑宽的那一边，把高度收进那一边的空间（`maxHeight`，面板自己滚）。**不许**为了
 *      「整块都留在屏幕里」把面板挪到屏幕中央：那会让它反过来盖住触发它的那颗按钮，而这个面板
 *      之所以存在，就是因为「能打开它的东西和它本身在同一处」（第二十刀）。
 *
 * `vw` / `vh` 拿不到（无浏览器 / 测试桩）时不做夹取、也不上翻：**能打开**比位置精确重要。
 * 坐标一律取整，免得半像素的发丝线落在小数上糊掉。
 */
export function panelPlacement(anchor, options) {
  if (anchor === null || anchor === undefined || typeof anchor !== 'object') return undefined
  const spec = options === null || options === undefined ? {} : options
  const width = Number.isFinite(spec.width) ? spec.width : 0
  const height = Number.isFinite(spec.height) ? spec.height : 0
  const margin = Number.isFinite(spec.margin) ? spec.margin : 8
  const gap = Number.isFinite(spec.gap) ? spec.gap : 4
  const vw = Number.isFinite(spec.vw) && spec.vw > 0 ? spec.vw : 0
  const vh = Number.isFinite(spec.vh) && spec.vh > 0 ? spec.vh : 0
  // 左对齐只有按钮左缘可用时才算数；拿不到就退回右对齐那一套（右缘也没有就贴左边距）
  const leftAligned = anchor.align === 'left' && Number.isFinite(anchor.left)
  const rawLeft = leftAligned
    ? anchor.left
    : (Number.isFinite(anchor.right) ? anchor.right - width : margin)
  const left = vw > 0
    ? Math.min(Math.max(margin, rawLeft), Math.max(margin, vw - width - margin))
    : Math.max(margin, rawLeft)
  let top = Number.isFinite(anchor.bottom) ? anchor.bottom + gap : margin
  let maxHeight
  if (vh > 0 && height > 0) {
    const below = vh - margin - top
    const above = Number.isFinite(anchor.top) ? anchor.top - gap - margin : Number.NaN
    if (below < height && above >= height) {
      // 上翻：面板底边停在按钮上沿之上
      top = anchor.top - gap - height
    } else if (below < height) {
      // 两边都放不下：挑宽的那一边，高度收进那边的空间（面板自己滚）
      const room = Number.isFinite(above) ? Math.max(below, above) : below
      if (room > 0) {
        maxHeight = Math.floor(room)
        if (Number.isFinite(above) && above > below) top = anchor.top - gap - maxHeight
      }
    }
  }
  const placed = { left: Math.round(left), top: Math.round(top) }
  if (maxHeight !== undefined) placed.maxHeight = maxHeight
  return placed
}

/**
 * 字段面板**想要**的高度：与 CSS 的 `.ll_fields{max-height:min(520px,70vh)}` 同一口径。
 *
 * 渲染由 CSS 管（它才是真正决定画多高的那个），这个数只用来判断「往下开放不放得下、要不要上翻」。
 * 两者漂开的最坏后果是面板早一步上翻或早一步收窄，不会把位置算错——所以它没有做成两处共享的
 * 常量（JS 读不到 CSS）。`client-smoke.mjs` 里有一条断言盯着 CSS 那一行，改一边会红。
 */
export const FIELD_PANEL_CEILING = 520
export function fieldPanelHeight(vh) {
  if (!Number.isFinite(vh) || vh <= 0) return FIELD_PANEL_CEILING
  return Math.min(FIELD_PANEL_CEILING, Math.round(vh * 0.7))
}

/**
 * 字段面板的宽度：与 CSS 的 `.ll_fields{width:…}` 同一口径。
 *
 * 为什么要一个常量：它有两处用处——CSS 决定画多宽，`panelPlacement` 用它算「右缘对齐」的左缘。
 * 两处各写一个数就会漂（漂了之后面板不是贴着按钮，而是差几十像素，看着像随机偏了一点）。
 * 340 而不是 300：真机上 `container.labels.*` 那一串末段（`com_docker_compose_service` 这类
 * 27 个字符）在 300px 里正好差一点点放不下，多出来的 40px 让它们一行读完。
 * `client-smoke.mjs` 有一条断言盯着 CSS 那一行，改一边会红。
 */
export const FIELD_PANEL_WIDTH = 340

/**
 * 一个字段名（末段）能在哪儿断行：在每个 `_` / `-` / `.` **之后**给一个断点。
 *
 * 为什么要这个：CSS 那边原来用 `overflow-wrap:anywhere`——浏览器会把一整行**填满**再断，
 * 于是 `com_docker_compose_config-hash` 被切成 `com_docker_compose_conf` / `ig-hash`
 * （真机截图里就是这样，一个词从中间裂开）。给不出断点时浏览器只能这么切；给出断点之后，
 * 它会在 `com_docker_compose_` 后面断，读起来是"两个词"而不是"半个词"。
 *
 * 返回**逐段保留分隔符**的数组（`['com_','docker_','compose_','config-','hash']`），
 * 拼回去逐字等于入参——这一点有用例钉着（错一个字符就会让行上显示的名字与真实字段名不符，
 * 而那正是「点错了字段」的来源）。
 */
export function fieldNameBreaks(name) {
  const text = String(name == null ? '' : name)
  if (text === '') return []
  const separators = new Set(['_', '-', '.'])
  const out = []
  let current = ''
  for (let at = 0; at < text.length; at += 1) {
    const ch = text[at]
    current += ch
    // 连续分隔符算**一处**断点：`a__b` 断成 `a__` / `b`，不是 `a_` / `_` / `b`
    const next = at + 1 < text.length ? text[at + 1] : ''
    if (separators.has(ch) && !separators.has(next)) {
      out.push(current)
      current = ''
    }
  }
  if (current !== '') out.push(current)
  return out
}

/* ------------------------------------------------------------------ *
 * 筛选组合框（第三十刀）
 * ------------------------------------------------------------------ */

/**
 * 筛选框右边那一格的候选：把一个字段的 top 值摊成「可选的候选行」。
 *
 * 与 `valueBars`（画横条的版本）**分开**：那个版本把比例与截断一起算好，是给「看长短」用的；
 * 筛选框的候选只需要「这个值能不能点、点了筛什么」——它没有条，也就不该带上一条用不上的比例。
 *
 * 三条判据：
 *   - **空白值不进来**：筛选只能表达「字段 = 某值」，表达不了「字段缺失」（与 `filterProblem`
 *     同一条，界面上那一桶本来也不给点）。把一个点了没反应的行摆出来，比不摆更坏。
 *   - **已经在筛的那个值打标记**（`active`）：它还在候选里（点一下是取消，与榜上同一条），
 *     只是要让人看得出「这一条已经生效了」。
 *   - **保持后端给的顺序**：按计数排序是后端的结论，再排一次等于把它盖掉（与 `groupBars` 同一条）。
 */
export function valueChoices(field, buckets, active, limit) {
  const name = String(field == null ? '' : field).trim()
  const cap = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : FIELD_VALUES_MAX
  if (name === '') return []
  const rows = []
  for (const bucket of Array.isArray(buckets) ? buckets : []) {
    if (rows.length >= cap) break
    if (bucket == null || typeof bucket.key !== 'string' || !Number.isFinite(bucket.count)) continue
    // 空白值：筛不了（见上），不占一格
    if (bucket.key.trim() === '') continue
    rows.push({
      value: bucket.key,
      count: bucket.count,
      active: active !== undefined && active !== null && String(active) === bucket.key,
    })
  }
  return rows
}

/**
 * 两段式筛选框的候选里「当前那一行」上下挪一格：**允许停在「没选」那一档**（−1）。
 *
 * 与 `pickMove` 的差别是判据，不是风格：分组框的输入框里**只有**候选那条路（打进的字就是
 * 结论），所以必须永远有一行被选中；筛选框的值那一格可以打任何东西（长尾值、带空格的、
 * 带引号的），「没选中任何候选」是一个**正常状态**——回车该取的是用户打的那串字。
 *
 * 所以这里能从 −1 往下走到第一行，也能从第一行往上退回 −1（再往上就停住）。
 */
export function choiceMove(current, delta, length) {
  const count = Number.isInteger(length) && length > 0 ? length : 0
  const step = Number.isFinite(delta) ? Math.trunc(delta) : 0
  if (count === 0) return -1
  const at = Number.isInteger(current) ? current : -1
  const next = at + step
  return Math.min(Math.max(next, -1), count - 1)
}

/**
 * 筛选框左边那一格的候选：**全部字段**按输入收窄，且「这一页命中」的排在前面。
 *
 * 与 `fieldChoices`（分组框的候选）分开：那个保持宿主顺序、不做分区；筛选框这里有一个
 * 实际差别——**这一页命中的字段是刚看过的那些**，它们才是此刻大概率要筛的。所以先排命中区、
 * 再排其余（三个分区内部都保持 `fieldSections` 已经算好的顺序，不重排）。
 *
 * 收窄规则**复用** `fieldFilterTerms` + `fieldMatches`（多词 AND，别在这儿另写一套）：同一个
 * 来源的两个相框——一个在侧栏里筛字段名、一个在筛选行里筛字段名——对 `cont name` 给出不同的
 * 答案，是那种「用着用着发现它时灵时不灵」的毛病。判据只有一个，两处共用。
 */
export function filterFieldChoices(sections, typed, limit) {
  const terms = fieldFilterTerms(typed)
  const cap = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : FIELD_LIST_MAX
  const out = []
  const take = (items, group) => {
    for (const item of Array.isArray(items) ? items : []) {
      if (out.length >= cap) return
      const name = String(item == null || item.name == null ? '' : item.name)
      if (name === '' || !fieldMatches(name, terms)) continue
      out.push({ name, group })
    }
  }
  take(sections == null ? undefined : sections.hit, 'hit')
  take(sections == null ? undefined : sections.rest, 'rest')
  take(sections == null ? undefined : sections.conflict, 'conflict')
  return out
}

/**
 * 两段式筛选框里「当前那一段」该退到哪儿（Backspace / 删除键的判据）。
 *
 * 三态：
 *   - 值那一格**有字**：退掉最后一个字（`'value'`，调用方把 value 去掉尾字）；
 *   - 值那一格**空了、字段已选**：退到字段那一格（`'field'`），字段名留着、值清空——
 *     这是「我要换个字段」最自然的手势，而不是逼人先点一下左边；
 *   - 字段也没选：什么都不做（`'none'`）。
 *
 * 为什么值优先：写值的时候按 Backspace 是指望删字，不是指望换字段。反过来会让人在打错一个
 * 字母时**把整条条件清掉**。
 */
export function filterBoxBack(field, value) {
  if (String(value == null ? '' : value) !== '') return 'value'
  if (String(field == null ? '' : field).trim() !== '') return 'field'
  return 'none'
}

/* ------------------------------------------------------------------ *
 * 字段的 top 值（第二十四刀）
 * ------------------------------------------------------------------ */

/**
 * 取某个字段 top 值时向聚合要几个值。
 *
 * 8 是**目视**算出来的：每个值一行 18px，8 行 = 144px —— 下拉里一眼扫得完，也不会把
 * 它下面的东西顶出屏幕。筛选框（第三十刀）与它的候选共用这个数：一处改了另一处跟着改。
 */
export const FIELD_VALUES_SIZE = 8
/** 画出来的上限（与请求数一致；后端要是多给了，多的不画）。 */
export const FIELD_VALUES_MAX = 8

/**
 * 取某个字段 top 值的请求体：与榜（`groupPayload`）**同一个信封**，只多一个 `size`。
 *
 * 信封相同不是巧合——它保证「值」与「行」「分布」画的是**同一个子集**（同一个窗口、同一个查询串、
 * 同一份筛选），见 `facetsEnvelope` 那段注释。窗口回显不全就返回 null，不发畸形请求。
 */
export function fieldValuesPayload(draft, outcome, field, size) {
  const name = String(field == null ? '' : field).trim()
  if (name === '') return null
  const envelope = facetsEnvelope(draft, outcome)
  if (envelope === null) return null
  const wanted = Number.isFinite(size) && size > 0 ? Math.floor(size) : FIELD_VALUES_SIZE
  /*
   * **这个字段自己的那条筛选要摘掉**（第三十一刀，真机抓到的洞）：
   *
   * 别的筛选照旧下发（值必须是「这一屏」的子集），但本字段的那一条不能带——带了的话聚合
   * 只在「字段 = 当前值」里算，答案永远只有它自己：
   *
   *     by=container.name, filters={container.name:"a"}  →  buckets=[{a}]
   *
   * 后果不是「少列几个值」，而是**换不了值**：想从 a 换成 b，下拉里根本没有 b，
   * 只能先去点芯片上的 × 删掉再重新选一遍。而那个只有一条的下拉还会被读成
   * 「这个字段只有一个值」。Kibana 的做法也是把本字段的 filter 从自己的候选请求里摘出去。
   *
   * 摘掉之后计数说的是「不受本字段约束的子集」，与页面上的命中数不再是同一个意思——
   * 这件事由界面上那一句注明（`hint.fieldValuesOwnFilter`），不能默默换口径。
   */
  const filters = envelope.filters === undefined ? undefined : Object.fromEntries(
    Object.entries(envelope.filters).filter(([key]) => key !== name),
  )
  const rest = filters === undefined || Object.keys(filters).length === 0 ? undefined : filters
  const { filters: _dropped, ...envelopeRest } = envelope
  return { ...envelopeRest, ...(rest === undefined ? {} : { filters: rest }), by: name, size: wanted }
}

/**
 * 值清单的缓存键：**同一份条件只能有一种答案**。
 *
 * 键里带字段名与整个信封（来源 + 窗口 + 查询串 + 筛选）：改了任何一个，这一格就必须重新问后端。
 * 少带一样都会给出「上一次条件下的一组值」——那比不展开更坏，因为它看起来是这一次的。
 * 拿不到信封时返回 null（调用方据此显示「不知道窗口，先查一次」那类话，而不是发一个畸形请求）。
 */
export function fieldValuesKey(draft, outcome, field) {
  const payload = fieldValuesPayload(draft, outcome, field)
  if (payload === null) return null
  const filters = payload.filters === undefined
    ? ''
    : Object.keys(payload.filters).sort().map((key) => key + '=' + payload.filters[key]).join('&')
  return [payload.by, payload.target, String(payload.from), String(payload.to), payload.q, filters].join('\u0000')
}

/**
 * top 值 → 可画的行（复用榜那套归一化，再按本格的条数截一刀）。
 *
 * `ratio` 用的是**整批**的最大值（不是截断之后的最大值）：截断只影响「画几行」，
 * 不该让头条忽然变成满格——那会让「8 条里最大的一条」看起来与「50 条里最大的一条」一样重。
 */
export function valueBars(buckets, limit) {
  const spec = groupBars(buckets)
  const cap = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : FIELD_VALUES_MAX
  const rows = spec.bars.slice(0, cap)
  return { rows, max: spec.max, truncated: spec.truncated || spec.bars.length > rows.length }
}

/**
 * 选列面板里**这一行此刻能不能点**（第二十六刀：把「列」按钮换成勾选）。
 *
 * 三种情形，判据一句话说得完：
 *   - 已选：**永远能点**（取消勾选不能被「满员」挡住——否则满员之后一个都去不掉，
 *     这正是「点不动却不说为什么」的另一种形态）；
 *   - 未选且**满员**：`limit`——界面据此画禁用态并说明「最多 4 列」；
 *   - 其余：`ok`。
 *
 * 与 `columnToggle` 分开是因为两者的读者不同：那个决定「改完之后是什么」，
 * 这个决定「画成什么样」。合成一个就得在渲染时先算一遍结果、再假装没算。
 */
export function columnPickState(columns, field) {
  const list = Array.isArray(columns) ? columns : []
  const name = String(field == null ? '' : field)
  if (name === '') return 'bad'
  if (list.indexOf(name) !== -1) return 'picked'
  if (list.length >= RESULT_COLUMN_MAX) return 'limit'
  return 'ok'
}
