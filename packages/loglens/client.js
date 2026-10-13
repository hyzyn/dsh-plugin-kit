/* eslint-disable */
/**
 * @hyzyn/dsh-loglens — 浏览器半体：「日志查询」的来源清单设置卡片。
 *
 * 本包是**构建型**：源在 client-src/、产物是包根的 client.js（scripts/build-client.mjs 把
 * client-src/pure.js 内联进来，并在发现任何残留 import 时 exit(1)）。设置面的注册与样式
 * 取值逐条对齐宿主（见 docs/conventions.md 的客户端半体六条硬规矩）。
 *
 * 卡片里现在是五块：来源清单、查询区（时间窗 / 条数 / 结果列表 / 下一页）、**时间分布**（直方图）、
 * **按字段分组**（terms 榜，回答「哪个服务在报错」）、Docker 容器日志区（选项 0 的面板半格）；
 * 榜上的横条可以**点一下下钻**（加一条结构化筛选重查一次，再点一次取消）。
 * 两份聚合（分布 / 榜）都由宿主随 `/query` 响应下发的**能力自述**决定画不画——面板不按 kind 猜。
 * **跟随（tail）还没有**：来源的 `capabilities().follow` 因此声明为 `false`，卡片不画一个按下去会失败的入口。
 */

window.__ModuleLoader__.load({
  id: '@hyzyn/dsh-loglens',
  factory: (require) => {
    const exports = {}

    const React = require('react')
    const { jsx, jsxs } = require('react/jsx-runtime')

    /* ============ 纯逻辑（构建时由 scripts/build-client.mjs 内联） ============ */
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
    function kindOptions() {
      return KIND_OPTIONS.slice()
    }

    /** 新行的草稿：id 为空表示「还没落盘」，提交走 targets.add。 */
    function emptyDraft() {
      return { id: '', kind: DEFAULT_KIND, label: '', url: '', dockerTarget: '', index: '' }
    }

    /** index 只对 ES / OpenSearch 有意义（其余类型带上它宿主会 400）——判据与宿主 src/config.ts 对齐。 */
    const INDEX_KINDS = ['elasticsearch', 'opensearch']

    /** 把宿主返回的一条来源还原成草稿（缺字段一律补成空串，界面里不出现 undefined）。 */
    function draftFromTarget(target) {
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
    function draftProblem(draft) {
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
    function draftPayload(draft) {
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
    function windowOptions() {
      return WINDOW_PRESETS.map((item) => item.key)
    }

    /**
     * 预设 → 具体时间窗（epoch 毫秒）。认不出的预设回落 1 小时——界面上永远有一个选中项，
     * 不该因为传错一个字符串就查出一个空窗口（那就成了静默无操作）。
     */
    function windowRange(preset, nowMs) {
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
    function emptyQuery() {
      return { target: '', q: '', preset: '1h', limit: 100, filters: [] }
    }

    /**
     * 表单能不能提交：空串表示可以，否则是 i18n 键名后缀。
     *
     * 这里只校验**面板自己知道的事**（选没选来源、条数是不是正整数）；时间戳单位、窗口上限、
     * limit 夹取都由宿主判，并且会以原话回给面板显示——**不要在浏览器侧复制一套会漂的规则**。
     */
    function queryProblem(draft, targetCount) {
      const chosen = String(draft.target == null ? '' : draft.target).trim()
      if (chosen === '' && targetCount !== 1) return 'needTarget'
      const limit = Number(draft.limit)
      if (!Number.isInteger(limit) || limit < 1) return 'badLimit'
      return ''
    }

    /** 提交载荷：面板只传来源 id / 查询串 / 时间窗 / 条数（游标由「下一页」单独带）。 */
    function queryPayload(draft, targets, nowMs) {
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
    function filterProblem(field, value) {
      if (String(field == null ? '' : field).trim() === '') return 'needFilterField'
      if (String(value == null ? '' : value).trim() === '') return 'needFilterValue'
      return ''
    }

    /** 这个字段已经在筛的值（没在筛则 `undefined`）。 */
    function filterOf(list, field) {
      const wanted = String(field == null ? '' : field)
      for (const row of Array.isArray(list) ? list : []) {
        if (row != null && String(row.field) === wanted) return String(row.value)
      }
      return undefined
    }

    /** 这个「字段 = 值」在不在筛选里（与 `filterAdd` 的「已存在」判据**同源**，别各写一套）。 */
    function filterHas(list, field, value) {
      const current = filterOf(list, field)
      return current !== undefined && current === String(value == null ? '' : value)
    }

    /**
     * 加一条筛选，返回**新数组**。同一字段就地替换（位置不变——芯片跳位置会让人以为点了别的）；
     * 已经在筛同一个「字段 = 值」时**原样返回入参**（同一个引用：调用方可以据此判断「什么都没变」）。
     */
    function filterAdd(list, field, value) {
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
    function filterRemove(list, field) {
      const rows = Array.isArray(list) ? list : []
      const name = String(field == null ? '' : field)
      const next = rows.filter((row) => row == null || String(row.field) !== name)
      return next.length === rows.length ? rows : next
    }

    /**
     * 筛选列表 → 线上那份 `filters`。空表回 `undefined`（**不发空对象**）——「没有筛选」与
     * 「筛选了个空」在线上是两回事，虽然宿主两边都收，但形状该说实话。
     */
    function filtersOf(list) {
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
    function appendLines(previous, incoming) {
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
    function countsParts(counts) {
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
    function histogramInterval(windowMs) {
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
    function supportsAggregation(payload) {
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
    function histogramPayload(draft, outcome, intervalKey) {
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
    function histogramBars(overTime, from, to, intervalMs) {
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
    function groupProblem(field) {
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
    function fieldChoices(fields, typed) {
      const needle = String(typed == null ? '' : typed).trim().toLowerCase()
      const rows = []
      for (const item of Array.isArray(fields) ? fields : []) {
        if (item == null) continue
        const name = String(item.name == null ? '' : item.name)
        if (name === '') continue
        if (needle !== '' && name.toLowerCase().indexOf(needle) === -1) continue
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
    function pickMove(current, delta, length) {
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
    function fieldFetchNeeded(cachedTargetId, targetId) {
      const wanted = String(targetId == null ? '' : targetId)
      if (wanted === '') return false
      return String(cachedTargetId == null ? '' : cachedTargetId) !== wanted
    }

    /**
     * 分组的请求载荷（窗口同 `histogramPayload`，取响应回显的那一份）。
     * 字段为空、或回显不完整 → `null`：界面**不发这个请求**。
     */
    function groupPayload(draft, outcome, by) {
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
    function groupBars(buckets) {
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
    function dockerSince(preset) {
      const keys = WINDOW_PRESETS.map((item) => item.key)
      return keys.indexOf(preset) === -1 ? '1h' : preset
    }

    /** 看容器日志前必须选一个容器（这条路径没有「全量」的说法）。 */
    function dockerProblem(draft) {
      const chosen = String(draft.container == null ? '' : draft.container).trim()
      return chosen === '' ? 'needContainer' : ''
    }

    /** 日志正文 → 一行一条（去掉末尾那个空行；空串就是空列表，不要凭空造一行）。 */
    function dockerLogLines(text) {
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
    function dockerFlagOf(previous, payload) {
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
    function dockerTargetChoices(entries, current) {
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
    function dockerLogTextOf(payload) {
      if (payload === undefined || payload === null) return ''
      const logs = payload.logs
      if (typeof logs === 'string') return logs
      if (logs !== null && typeof logs === 'object' && typeof logs.text === 'string') return logs.text
      return ''
    }

    /* ================================ CSS ================================ */

    const CSS = [
      '.ll_pageHost{display:block}',
      '.ll_pluginCard{list-style:none;border:.5px solid var(--dsw-alias-settings-card-stroke);background:var(--dsw-alias-settings-card-fill);border-radius:var(--dsw-radius-xl);transition:border-color .16s,background .16s}',
      '.ll_pluginCard:hover{border-color:var(--dsw-alias-label-dimmed)}',
      '.ll_pluginCardOpen{background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-label-dimmed)}',
      '.ll_cardHeader{appearance:none;width:100%;color:inherit;font:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:var(--dsw-radius-xl);display:flex;align-items:center;gap:12px;padding:14px 16px}',
      '.ll_cardHeader:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}',
      '.ll_cardHeadText{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}',
      '.ll_cardName{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:500;line-height:22px}',
      '.dshkit_badge{flex:none;margin-left:auto;padding:1px 8px;border-radius:999px;corner-shape:round;font-size:11px;font-weight:600;line-height:16px;letter-spacing:.02em;color:var(--dsw-alias-label-dimmed);background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l1)}',
      '.ll_cardDescription{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}',
      '.ll_chevron{flex:none;color:var(--dsw-alias-label-tertiary);transition:transform .16s}',
      '.ll_pluginCardOpen .ll_chevron{transform:rotate(180deg)}',
      '.ll_cardBody{padding:2px 16px 16px}',
      '.ll_panel{display:flex;flex-direction:column;gap:12px;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);box-sizing:border-box}',
      '.ll_panelHeader{display:flex;align-items:center;gap:10px;flex:none}',
      '.ll_panelTitle{margin:0;font-size:15px;font-weight:500;line-height:22px;white-space:nowrap;flex:1}',
      '.ll_switch{display:inline-flex;align-items:center;gap:6px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap}',
      '.ll_switch input[type=checkbox]{width:16px;height:16px;margin:0;flex:none;cursor:pointer;accent-color:var(--dsw-alias-brand-primary)}',
      '.ll_switch input[type=checkbox]:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}',
      '.ll_hint{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
      '.ll_toolbar{display:flex;align-items:center;gap:8px;flex:none}',
      '.ll_toolbarSpacer{flex:1}',
      '.ll_btn{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:4px;height:28px;padding:0 10px;border:none;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground);font-family:inherit;font-size:12px;line-height:18px;white-space:nowrap;cursor:pointer}',
      '.ll_btn:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}',
      '.ll_btn:disabled{opacity:.4;cursor:not-allowed}',
      '.ll_btn:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary))}',
      '.ll_btnGhost{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:4px;height:28px;padding:0 10px;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12px;line-height:18px;white-space:nowrap;cursor:pointer}',
      '.ll_btnGhost:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
      '.ll_btnGhost:active:not(:disabled){background:var(--dsw-alias-interactive-bg-active)}',
      '.ll_btnGhost:disabled{opacity:.4;cursor:not-allowed}',
      '.ll_btnGhost:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary))}',
      '.ll_btnDanger{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 30%,transparent)}',
      '.ll_btnDanger:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,transparent)}',
      '.ll_list{display:flex;flex-direction:column;gap:8px;max-height:420px;overflow-y:auto}',
      '.ll_head{display:grid;grid-template-columns:minmax(120px,140px) minmax(140px,1.4fr) minmax(180px,2fr) auto auto;gap:8px;align-items:center;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;padding:0 10px}',
      // 行内四列 + 两个动作位。输入档对齐宿主 settings-form 的 .input（H34 / R12 / border-l4 /
      // bg-layer-3 / 13px）：显式 height 是关键——同一个类套到 <select> 上时 Chrome 不看继承的
      // line-height，没有它就会比同排的 <input> 矮 2px；圆角取 token 而非 8px 字面量。
      '.ll_row{display:grid;grid-template-columns:minmax(120px,140px) minmax(140px,1.4fr) minmax(180px,2fr) auto auto;gap:8px;align-items:center;background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);padding:8px 10px}',
      // URL 与索引表达式竖着放一格：横着再加一列会把这一行挤到看不清
      '.ll_stack{display:flex;flex-direction:column;gap:6px;min-width:0}',
      '.ll_input{box-sizing:border-box;width:100%;height:34px;padding:0 12px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3);border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);outline:none;font-family:inherit;font-size:13px;line-height:1.5}',
      '.ll_input:focus{border-color:var(--dsw-alias-state-business-primary)}',
      '.ll_input::placeholder{color:var(--dsw-alias-label-tertiary)}',
      '.ll_input:disabled{opacity:.5;cursor:not-allowed}',
      '.ll_empty,.ll_loading{text-align:center;color:var(--dsw-alias-label-tertiary);padding:24px 12px;font-size:12.5px;line-height:18px}',
      '.ll_error{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;margin:0;white-space:pre-wrap}',
      '.ll_ok{color:var(--dsw-alias-state-success-primary);font-size:12px;line-height:18px;margin:0}',
      '.ll_query{display:flex;flex-direction:column;gap:10px;border-top:.5px solid var(--dsw-alias-border-l1);padding-top:12px}',
      '.ll_queryGrid{display:grid;grid-template-columns:minmax(110px,130px) minmax(160px,2fr) minmax(96px,120px) minmax(64px,84px) auto;gap:8px;align-items:center}',
      // 分组那一行只有「字段 / 一个按钮 / 一句回话」（字段候选改成点开即拉之后，没有独立的按钮了）
      '.ll_groupGrid{display:grid;grid-template-columns:minmax(180px,2fr) auto minmax(0,1fr);gap:8px;align-items:center}',
      '.ll_queryMeta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
      '.ll_results{display:flex;flex-direction:column;gap:2px;max-height:420px;overflow-y:auto;font-family:var(--ds-font-family-code)}',
      '.ll_resultRow{display:grid;grid-template-columns:auto auto minmax(0,1fr);gap:8px;align-items:baseline;padding:3px 8px;border-radius:var(--dsw-radius-sm);font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary)}',
      '.ll_resultRow:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.ll_resultTime{color:var(--dsw-alias-label-tertiary);white-space:nowrap}',
      '.ll_resultLevel{color:var(--dsw-alias-state-warn-primary);white-space:nowrap}',
      '.ll_resultMsg{color:var(--dsw-alias-label-primary);white-space:pre-wrap;word-break:break-word}',
      '.ll_warn{color:var(--dsw-alias-state-warn-primary);font-size:12px;line-height:18px}',
      // 时间分布（直方图）。柱子高度是**内联** style（每根都不一样，写不进类里）；类只管外观。
      '.ll_hist{display:flex;flex-direction:column;gap:6px}',
      '.ll_histHead{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
      '.ll_histTitle{color:var(--dsw-alias-label-primary);font-weight:600}',
      '.ll_histBars{display:flex;align-items:flex-end;gap:1px;height:56px;padding:4px;background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm)}',
      '.ll_histBar{flex:1 1 0;min-width:1px;background:var(--dsw-alias-interactive-bg-hover);border-radius:1px}',
      // 空桶只留一条 2% 的底座（见 pure.js histogramBars：补 0 是为了让「那段时间一条都没有」看得见）
      '.ll_histBarEmpty{background:var(--dsw-alias-border-l1)}',
      // 按字段分组（terms 榜）。条的宽度是**内联** style（每条都不一样，写不进类里）；类只管外观。
      '.ll_groups{display:flex;flex-direction:column;gap:6px}',
      '.ll_groupHead{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
      '.ll_groupTitle{color:var(--dsw-alias-label-primary);font-weight:600}',
      '.ll_groupRows{display:flex;flex-direction:column;gap:4px;max-height:200px;overflow-y:auto;padding:6px 8px;background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm)}',
      // 键名一格会被长容器名撑开，所以要能省略；条数用等宽数字，纵向一列才对得齐
      '.ll_groupRow{display:grid;grid-template-columns:minmax(72px,1fr) auto minmax(48px,1fr);gap:8px;align-items:center;font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary)}',
      '.ll_groupKey{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.ll_groupKeyBlank{color:var(--dsw-alias-label-tertiary)}',
      '.ll_groupCount{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.ll_groupTrack{height:8px;background:var(--dsw-alias-bg-layer-3);border-radius:var(--dsw-radius-sm);overflow:hidden}',
      '.ll_groupFill{height:100%;background:var(--dsw-alias-interactive-bg-hover);border-radius:var(--dsw-radius-sm)}',
      // 榜上可点的那一行是个 <button>（键盘也能用），所以要把 UA 的按钮外观整条按掉，只留网格布局
      '.ll_groupRowBtn{cursor:pointer;font:inherit;text-align:left;color:inherit;background:none;border:0;padding:2px 4px;margin:-2px -4px;border-radius:var(--dsw-radius-sm)}',
      '.ll_groupRowBtn:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      // 正在按它下钻的那一条：横条换个色，让人看得出「这一屏是筛过的」
      '.ll_groupRowActive .ll_groupKey{font-weight:600}',
      '.ll_groupRowActive .ll_groupFill{background:var(--dsw-alias-state-business-primary)}',
      // 筛选芯片：查询区与结果列表之间那一行
      '.ll_filters{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.ll_filtersLabel{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
      '.ll_chip{display:inline-flex;align-items:center;gap:4px;max-width:100%;padding:2px 4px 2px 8px;background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);font-family:var(--ds-font-family-code);font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary)}',
      '.ll_chipText{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.ll_chipBtn{flex:none;width:18px;height:18px;padding:0;background:none;border:0;border-radius:var(--dsw-radius-sm);cursor:pointer;color:var(--dsw-alias-label-tertiary);font-size:14px;line-height:1}',
      '.ll_chipBtn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}',
      // 筛选那句说明自成一行（免得跟芯片挤在一起读不出哪是芯片哪是说明）
      '.ll_filtersHint{flex-basis:100%}',
      /*
       * 分组字段那一格：输入框 + 官方 chevron + **自画**的候选浮层（替掉浏览器画的原生 datalist）。
       * 浮层按**宿主自己的菜单配方**取值（读了宿主的构建产物 `dsh-web-frontend/dist/assets/*.css`
       * 里那份菜单模块）：panel = padding 4px + border:0 + 圆角 lg + 描边投影 + 行高 34px；
       * item = radius-md + 13px/20px + hover/聚焦都用 interactive-bg-hover；
       * `--dsw-elevation-stroke-color` 也照官方改成中性发丝线（那层描边在投影里，不是 border）。
       * 官方那条 list 规则自己没写背景（它的祖先给），这里按本卡片既有的层级用 bg-layer-2。
       */
      '.ll_pick{position:relative;min-width:0}',
      // 右侧留出箭头的位子（输入框的 padding 归 .ll_input，这里只补右内边距）
      '.ll_pickInput{padding-right:30px}',
      '.ll_pickChevron{position:absolute;right:10px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--dsw-alias-label-tertiary)}',
      '.ll_pickList{position:absolute;z-index:100;top:calc(100% + 4px);left:0;right:0;box-sizing:border-box;max-height:216px;overflow-y:auto;padding:4px;border:0;border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-2);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent)}',
      '.ll_pickItem{display:block;width:100%;min-height:34px;padding:6px 8px;border:0;border-radius:var(--dsw-radius-md);background:transparent;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13px;line-height:20px;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}',
      '.ll_pickItem:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      // 方向键停在那一行（与 hover 同一个底：两套输入说的是同一件事）
      '.ll_pickItemActive{background:var(--dsw-alias-interactive-bg-hover)}',
      '.ll_pickItem:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}',
      // 浮层里的「不是候选」的几行：加载中 / 取不到 / 这个来源没有字段名 —— 都排成一条文字行
      '.ll_pickState{padding:8px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}',
      // 页脚：宿主那句截断警告（照抄）+「刷新」；与候选之间用一条发丝线分开
      '.ll_pickFoot{display:flex;align-items:center;gap:8px;margin-top:4px;padding:4px 8px 2px;border-top:.5px solid var(--dsw-alias-border-l2)}',
      '.ll_pickFoot .ll_pickState{flex:1;min-width:0;padding:0}',
      '.ll_pickRefresh{flex:none;padding:2px 6px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:12px;line-height:18px;cursor:pointer}',
      '.ll_pickRefresh:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.ll_pickRefresh:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}',
    ].join('\n')

    let styleEl
    function ensureStyle() {
      if (document.getElementById('dsh-loglens-style')) return
      styleEl = document.createElement('style')
      styleEl.id = 'dsh-loglens-style'
      styleEl.textContent = CSS
      document.head.appendChild(styleEl)
    }

    /* ================================ 国际化 ================================ */

    /*
     * 界面文案走宿主 @deepseek-ai/dsh-client-locale 的目录（方案见 docs/i18n.md）。
     * 下面这一对目录由 scripts/check-i18n.mjs 静态校验：键集必须一一对应、{name} 占位符
     * 两边一致、代码里 t('…') 用到的键必须在这里有定义。本包是**构建型**，目录与样式一样
     * 内联在 client-src/index.js 里（client.js 是产物，别去改它）。
     */
    /* ==== dsh-i18n:begin ==== */
    const I18N_NS = 'loglens'
    const I18N_ZH = {
      'card.name': '日志查询',
      'card.desc': '把 Loki / Elasticsearch / OpenSearch 等日志后端归一化成一个查询面：来源清单、直连查询、时间分布与按字段分组。',
      'panel.title': '日志来源',
      'panel.histogram': '时间分布',
      'panel.groups': '按字段分组',
      'meta.histInterval': '每根柱子 {interval}',
      'meta.histPeak': '峰值 {count} 条',
      'meta.histTotal': '共 {count} 条',
      'meta.histBucket': '{time} · {count} 条',
      'meta.groupsCount': '{count} 条',
      'meta.groupsBlankKey': '（空值）',
      'hint.histogram': '这张图来自后端按时间分桶（不是数这一页——这一页被条数截断过，数它只会得到一个假的分布）。',
      'hint.histogramTruncated': '窗口比这张图长，只画了前一部分。',
      'hint.groups': '这张榜来自后端的 terms 聚合（不是数这一页——这一页被条数截断过，数它只会得到一个假的排名）。点一条即按它下钻（加一条筛选重查一次），再点一次取消。',
      'hint.groupsTruncated': '桶比这张榜长，只画了前一部分。',
      'hint.groupBlankNoDrill': '空值那一条不能下钻：筛选只能表达「字段 = 某值」，表达不了「字段缺失」。',
      'hint.groupDrillRow': '按 {field} = {value} 下钻（再点一次取消）',
      'field.filters': '筛选',
      'btn.filterRemove': '移除这条筛选',
      'error.needFilterField': '这条筛选没有字段名',
      'error.needFilterValue': '这条筛选没有值（空值那一桶筛不了：筛选只能表达「字段 = 某值」）',
      'hint.filters': '筛选按「字段 = 值」下发（走宿主的结构化 filters）：行、时间分布与分组榜都跟着收窄。一个字段只有一条。Loki 不支持结构化筛选——用它时把条件写进查询串。',
      'hint.aggregationUnsupported': '当前来源不支持聚合（Loki 的指标查询还没接），所以这里没有时间分布与分组榜。',
      'error.histogram': '时间分布取不到：{message}',
      'error.groups': '分组取不到：{message}',
      'error.needGroupBy': '先填要分组的字段（不知道有哪些字段就点「有哪些字段」）',
      'list.noBuckets': '这个窗口里没有可分组的数据',
      'hint.notImplemented': '下面可以直接查当前来源；「分组字段」那一格点开就是当前来源的字段名候选（点开即拉，同一个来源不重复拉，页脚有「刷新」）。整份字段清单与「某一行前后」的上下文仍在 agent 侧的两个工具里（loglens_fields / loglens_context）。',
      'field.kind': '类型',
      'field.label': '名称',
      'field.url': '地址',
      'field.groupBy': '分组字段',
      'placeholder.index': '索引表达式（如 app-logs-*；留空 = 用地址路径，再留空则 *,-.*）',
      'hint.index': 'ES / OpenSearch 的索引表达式：留空时用地址里的路径，地址里也没有就是 *,-.*（全部索引但排除点号系统索引）。',
      'option.loki': 'Loki',
      'option.elasticsearch': 'Elasticsearch',
      'option.opensearch': 'OpenSearch',
      'option.docker': 'Docker（采集来源）',
      'check.enabled': '启用插件',
      'btn.add': '+ 新增来源',
      'btn.save': '保存',
      'btn.saving': '保存中…',
      'btn.remove': '删除',
      'list.loading': '加载中…',
      'list.empty': '还没有日志来源，点「+ 新增来源」加一个。',
      'status.enabled': '已启用',
      'status.disabled': '已停用',
      'placeholder.label': '例如：本地 Loki',
      'placeholder.url': 'http://127.0.0.1:3100',
      'msg.saved': '已保存',
      'msg.memoryOnly': '宿主没有 settings 服务，改动只在本次进程内有效',
      'msg.fieldsEmpty': '这个来源没有返回字段名（可以直接手填，比如 container.name）',
      'error.fields': '字段清单取不到：{message}',
      'error.needUrl': '这个类型必须填地址',
      'error.badUrl': '地址必须是 http:// 或 https:// 开头的绝对地址',
      'error.badKind': '类型不认识（支持 Loki / Elasticsearch / OpenSearch / Docker）',
      'section.query': '查询',
      'hint.query': '面板直查当前来源：走的是与 agent 工具同一套执行层（同一份归一化与截断信号）。',
      'placeholder.query': '查询串（Loki 是 LogQL；留空即全量）',
      'placeholder.groupBy': 'container.name',
      'field.target': '来源',
      'field.window': '时间窗',
      'field.limit': '条数',
      'btn.query': '查询',
      'btn.querying': '查询中…',
      'btn.group': '分组',
      'btn.grouping': '分组中…',
      'btn.refreshFields': '刷新',
      'btn.nextPage': '下一页',
      'btn.clear': '清空结果',
      'option.15m': '最近 15 分钟',
      'option.1h': '最近 1 小时',
      'option.6h': '最近 6 小时',
      'option.24h': '最近 24 小时',
      'list.noHit': '没有命中（换个时间窗，或放宽查询串）',
      'meta.returned': '返回 {count} 行',
      'meta.matched': '命中 {count}',
      'meta.matchedAtLeast': '至少命中 {count}',
      'meta.scannedRows': '扫描 {count} 行',
      'meta.scannedBytes': '扫描 {count} 字节',
      'meta.truncated': '已截断：{reasons}',
      'status.hit_limit': '达到条数上限',
      'status.max_result_window': '超出结果窗口上限',
      'status.partial_shards': '部分分片失败',
      'status.timed_out': '查询超时',
      'status.scan_cap': '扫描量到顶',
      'status.byte_cap': '字节量到顶',
      'status.cursor_expired': '游标已过期',
      'error.needTarget': '先选一个来源',
      'error.badLimit': '条数得是正整数',
      'field.dockerTarget': 'Docker 目标名',
      'field.container': '容器',
      'field.tail': '行数',
      'btn.containers': '拉取容器',
      'btn.logs': '看日志',
      'hint.docker': '容器日志走的是 Docker 面板插件自己的 /api/dsh-docker/logs：这条路没有 until、行数有上限、没有 grep——要精确检索请让 agent 用 docker_logs_grep。',
      'hint.dockerMissing': '这条路径要「Docker 容器面板」插件（当前没检测到它）：装上并启用后，这里可以直接看容器日志。',
      'error.needContainer': '先选一个容器',
      'option.pickTarget': '（先选一个来源）',
      'option.dockerAuto': '（让 Docker 面板自己回落）',
      'btn.logsLoading': '加载中…',
      'list.noLogs': '没有日志（换个大点的时间窗或行数再试）',
      'hint.dockerTargetUnknown': '（不在 Docker 面板的目标里）',
    }
    const I18N_EN = {
      'card.name': 'Log query',
      'card.desc': 'Normalizes log backends such as Loki / Elasticsearch / OpenSearch into one query surface: source list, direct query, volume over time and grouping by field.',
      'panel.title': 'Log sources',
      'panel.histogram': 'Volume over time',
      'panel.groups': 'Grouped by field',
      'meta.histInterval': 'each bar = {interval}',
      'meta.histPeak': 'peak {count}',
      'meta.histTotal': '{count} total',
      'meta.histBucket': '{time} · {count}',
      'meta.groupsCount': '{count}',
      'meta.groupsBlankKey': '(empty value)',
      'hint.histogram': 'This chart comes from the backend time-bucketing (not from counting this page — the page is capped by the limit, so counting it would only give you a fake distribution).',
      'hint.histogramTruncated': 'The window is longer than this chart; only the first part is drawn.',
      'hint.groups': 'This ranking comes from the backend terms aggregation (not from counting this page — the page is capped by the limit, so counting it would only give you a fake ranking). Click a row to drill into it (adds one filter and re-runs the query); click it again to undo.',
      'hint.groupsTruncated': 'There are more buckets than this ranking; only the first part is drawn.',
      'hint.groupBlankNoDrill': 'The empty-value row cannot be drilled into: a filter can only say “field = some value”, not “the field is missing”.',
      'hint.groupDrillRow': 'Drill into {field} = {value} (click again to undo)',
      'field.filters': 'Filters',
      'btn.filterRemove': 'Remove this filter',
      'error.needFilterField': 'This filter has no field name',
      'error.needFilterValue': 'This filter has no value (the empty-value bucket cannot be filtered: a filter can only say “field = some value”)',
      'hint.filters': 'Filters go out as “field = value” (the host’s structured filters): the rows, the volume chart and the ranking all narrow with them. One filter per field. Loki does not support structured filters — put the condition into the query string there.',
      'hint.aggregationUnsupported': 'This source cannot aggregate (Loki metric queries are not wired yet), so there is no volume chart or group ranking here.',
      'error.histogram': 'Could not load the volume chart: {message}',
      'error.groups': 'Could not group by field: {message}',
      'error.needGroupBy': 'Fill in a field to group by first (click “List fields” if you do not know them)',
      'list.noBuckets': 'No data to group by in this window',
      'hint.notImplemented': 'You can query the selected source right below; clicking the “Group by field” box opens the field names of the current source as candidates (fetched on open; the same source is not re-fetched, and the footer has “Refresh”). The full field list and per-line context still live in the agent tools (loglens_fields / loglens_context).',
      'field.kind': 'Kind',
      'field.label': 'Name',
      'field.url': 'URL',
      'field.groupBy': 'Group by field',
      'placeholder.index': 'Index expression (e.g. app-logs-*; empty = the path in the URL, else *,-.*)',
      'hint.index': 'Index expression for ES / OpenSearch: empty means the path in the URL, and if that is empty too it becomes *,-.* (all indices except dot-prefixed system indices).',
      'option.loki': 'Loki',
      'option.elasticsearch': 'Elasticsearch',
      'option.opensearch': 'OpenSearch',
      'option.docker': 'Docker (collector)',
      'check.enabled': 'Enable plugin',
      'btn.add': '+ Add source',
      'btn.save': 'Save',
      'btn.saving': 'Saving…',
      'btn.remove': 'Remove',
      'list.loading': 'Loading…',
      'list.empty': 'No log source yet — click “+ Add source”.',
      'status.enabled': 'Enabled',
      'status.disabled': 'Disabled',
      'placeholder.label': 'e.g. local Loki',
      'placeholder.url': 'http://127.0.0.1:3100',
      'msg.saved': 'Saved',
      'msg.memoryOnly': 'The host has no settings service; changes last only in this process',
      'msg.fieldsEmpty': 'This source returned no field names (you can type one, e.g. container.name)',
      'error.fields': 'Could not load the field list: {message}',
      'error.needUrl': 'This kind needs a URL',
      'error.badUrl': 'The URL must be an absolute http:// or https:// address',
      'error.badKind': 'Unknown kind (Loki / Elasticsearch / OpenSearch / Docker)',
      'section.query': 'Query',
      'hint.query': 'Queries the selected source through the same execution layer the agent tools use (identical normalization and truncation signals).',
      'placeholder.query': 'Query string (LogQL for Loki; empty means everything)',
      'placeholder.groupBy': 'container.name',
      'field.target': 'Source',
      'field.window': 'Time window',
      'field.limit': 'Limit',
      'btn.query': 'Run',
      'btn.querying': 'Running…',
      'btn.group': 'Group',
      'btn.grouping': 'Grouping…',
      'btn.refreshFields': 'Refresh',
      'btn.nextPage': 'Next page',
      'btn.clear': 'Clear',
      'option.15m': 'Last 15 minutes',
      'option.1h': 'Last hour',
      'option.6h': 'Last 6 hours',
      'option.24h': 'Last 24 hours',
      'list.noHit': 'No hits (widen the window or loosen the query)',
      'meta.returned': '{count} rows',
      'meta.matched': '{count} matched',
      'meta.matchedAtLeast': 'at least {count} matched',
      'meta.scannedRows': 'scanned {count} rows',
      'meta.scannedBytes': 'scanned {count} bytes',
      'meta.truncated': 'Truncated: {reasons}',
      'status.hit_limit': 'hit the row limit',
      'status.max_result_window': 'beyond the result window',
      'status.partial_shards': 'partial shards failed',
      'status.timed_out': 'query timed out',
      'status.scan_cap': 'scan cap reached',
      'status.byte_cap': 'byte cap reached',
      'status.cursor_expired': 'cursor expired',
      'error.needTarget': 'Pick a source first',
      'error.badLimit': 'The limit must be a positive integer',
      'field.dockerTarget': 'Docker target name',
      'field.container': 'Container',
      'field.tail': 'Lines',
      'btn.containers': 'Load containers',
      'btn.logs': 'Show logs',
      'hint.docker': 'Container logs come from the Docker panel plugin own /api/dsh-docker/logs: no until, a capped tail, and no grep — ask the agent for docker_logs_grep when you need real search.',
      'hint.dockerMissing': 'This path needs the Docker container panel plugin (not detected): install and enable it to read container logs here.',
      'error.needContainer': 'Pick a container first',
      'option.pickTarget': '(pick a source)',
      'option.dockerAuto': '(let the Docker panel pick)',
      'btn.logsLoading': 'Loading…',
      'list.noLogs': 'No logs (try a wider time window or a larger tail)',
      'hint.dockerTargetUnknown': ' (not a target in the Docker panel)',
    }
    /* ==== dsh-i18n:end ==== */

    /** 占位符替换：{name} 取 params.name（缺参留空，不抛错——文案不该打死界面）。 */
    function i18nFormat(text, params) {
      if (params === undefined) return text
      return String(text).replace(/\{(\w+)\}/g, (_match, name) => (params[name] === undefined ? '' : String(params[name])))
    }

    /** 中文兜底：老宿主（DSH ≤0.1.5）没有 locale 服务时，界面不能变成一串键名。 */
    function i18nFallback(key, params) {
      return i18nFormat(I18N_ZH[key] !== undefined ? I18N_ZH[key] : key, params)
    }

    let t = i18nFallback

    /**
     * 注册目录并绑定翻译函数。**动态 inject**：老宿主上回调永不触发、t 保持中文兜底；
     * 写成静态 inject: ['locale'] 会让整张卡片在老宿主上根本不挂。
     */
    function installI18n(ctx) {
      ctx.inject(['locale'], (i18nCtx) => {
        const disposeZh = i18nCtx.locale.register(I18N_NS, 'zh', I18N_ZH)
        const disposeEn = i18nCtx.locale.register(I18N_NS, 'en', I18N_EN)
        t = i18nCtx.locale.bind(I18N_NS)
        return () => {
          disposeEn()
          disposeZh()
          t = i18nFallback
        }
      })
    }

    /* ================================ API ================================ */

    /** 同源相对路径：本插件的路由就在宿主自己的 origin 上，不拼任何绝对地址。 */
    async function api(path, options) {
      const response = await fetch(path, options)
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || ('HTTP ' + String(response.status)))
      }
      return data
    }

    /** 类型下拉的文案：逐条列字面量，别用 'option.' + kind 拼（静态闸门扫不到动态键）。 */
    function kindLabel(kind) {
      if (kind === 'loki') return t('option.loki')
      if (kind === 'elasticsearch') return t('option.elasticsearch')
      if (kind === 'opensearch') return t('option.opensearch')
      if (kind === 'docker') return t('option.docker')
      return kind
    }

    /* ================================ 设置卡片 ================================ */

    /**
     * 官方 chevron（`IconChevronDownOutlineRegular`）——**描边**图标，不是填色图标。
     *
     * 取自宿主自己的前端产物（`dsh-web-frontend/dist/assets/index-*.js` 里
     * `IconChevronDownOutlineRegular`）：`viewBox="0 0 16 16"`、14×14、`stroke-width:1`、
     * `fill="none"` + `stroke="currentColor"`，路径逐字如下（**不补 linecap / linejoin**：
     * 官方没写，补了就不是那一颗）。
     *
     * 本卡片原来用的是一条**填色** chevron（`fill="currentColor"`、`viewBox 0 0 14 14`）——
     * 那是另一套图标的形状，与宿主自己的展开箭头不是同一颗（维护者 2026-10-13 看图后提的
     * 「图标要和官方的一致」）。现在卡头折叠箭头与字段候选框的箭头**共用这一颗**。
     */
    const CHEVRON_VIEWBOX = '0 0 16 16'
    const CHEVRON_STROKE = '1'
    const CHEVRON_PATH = 'M4 6L7.29289 9.29289C7.68342 9.68342 8.31658 9.68342 8.70711 9.29289L12 6'

    function LoglensSettingsCard(props) {
      // DSH ≥0.1.6 的插件配置页把同一条目按 view 渲染两次：summary 一句话摘要、page 完整表单。
      const view = props && props.view
      const pageView = view === 'page'
      const [open, setOpen] = React.useState(pageView)
      const [enabled, setEnabled] = React.useState(true)
      const [drafts, setDrafts] = React.useState([])
      const [error, setError] = React.useState('')
      const [ok, setOk] = React.useState('')
      const [loading, setLoading] = React.useState(false)
      const [saving, setSaving] = React.useState(false)
      const [query, setQuery] = React.useState(emptyQuery)
      const [outcome, setOutcome] = React.useState(undefined)
      const [lines, setLines] = React.useState([])
      const [cursor, setCursor] = React.useState(undefined)
      const [histogram, setHistogram] = React.useState(undefined)
      const [groups, setGroups] = React.useState(undefined)
      const [groupBy, setGroupBy] = React.useState('')
      const [grouping, setGrouping] = React.useState(false)
      const [fields, setFields] = React.useState([])
      const [fieldsBusy, setFieldsBusy] = React.useState(false)
      // 这份字段清单属于哪个来源（缓存键：同一个来源再点开就不重拉，见 pure.js fieldFetchNeeded）
      const [fieldsSource, setFieldsSource] = React.useState('')
      // 拉字段失败时宿主那句话（只落在浮层里，不动卡片顶部那条错误行）
      // 字段候选面板开着没有（自画的那个浮层；原生 datalist 的替身，见下面 fieldChoices 那一段）
      const [pickOpen, setPickOpen] = React.useState(false)
      // 浮层里「当前那一行」（方向键挪它、回车取它；打字时回到第一条）
      const [pickIndex, setPickIndex] = React.useState(0)
      // 此刻要摆的候选（纯判据在 pure.js 的 fieldChoices：子串过滤 / 保持宿主顺序 / 命中 0 个回空）
      const choices = pickOpen ? fieldChoices(fields, groupBy) : []
      const [fieldsNote, setFieldsNote] = React.useState('')
      const [fieldsError, setFieldsError] = React.useState('')
      // 在途闩：同一来源正在拉的途中不要再来一枪（一次点击会先 focus 再 click，见 loadFields）
      const fieldsFlightRef = React.useRef('')
      const [querying, setQuerying] = React.useState(false)
      const [docker, setDocker] = React.useState(false)
      const [containers, setContainers] = React.useState([])
      const [container, setContainer] = React.useState('')
      const [dockerLogs, setDockerLogs] = React.useState('')
      const [dockerOpened, setDockerOpened] = React.useState(false)
      const [dockerTail, setDockerTail] = React.useState(200)
      const [dockerBusy, setDockerBusy] = React.useState(false)
      const [dockerTargets, setDockerTargets] = React.useState([])

      /** 宿主回什么就照什么渲染：一切状态以服务端那份为准，不在本地做乐观合并。 */
      const applyConfig = React.useCallback((payload) => {
        const next = payload && payload.config ? payload.config : { enabled: true, targets: [] }
        setEnabled(next.enabled !== false)
        setDrafts((Array.isArray(next.targets) ? next.targets : []).map(draftFromTarget))
        loadDockerTargets()
        // 只有响应真的带 plugins 才覆盖：保存走的 POST /config 也可能不带（缺字段 = 不知道，不是没装）
        setDocker((current) => dockerFlagOf(current, payload))
      }, [])

      const load = React.useCallback(async () => {
        setLoading(true)
        setError('')
        setOk('')
        try {
          applyConfig(await api('/api/dsh-loglens/config'))
        } catch (err) {
          setError(err.message)
        } finally {
          setLoading(false)
        }
      }, [applyConfig])

      React.useEffect(() => {
        if (open || pageView) load()
      }, [open, pageView, load])

      /** 所有写操作走同一个入口：一次请求一个动作，失败把宿主的原话显示出来。 */
      const mutate = async (body) => {
        setSaving(true)
        setError('')
        setOk('')
        try {
          const data = await api('/api/dsh-loglens/config', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          })
          applyConfig(data)
          setOk(data && typeof data.warning === 'string' ? t('msg.memoryOnly') : t('msg.saved'))
        } catch (err) {
          setError(err.message)
        } finally {
          setSaving(false)
        }
      }

      function problemText(problem) {
        if (problem === 'needUrl') return t('error.needUrl')
        if (problem === 'badUrl') return t('error.badUrl')
        if (problem === 'badKind') return t('error.badKind')
        return ''
      }

      const updateDraft = (index, patch) => {
        setDrafts((current) => current.map((draft, at) => (at === index ? { ...draft, ...patch } : draft)))
      }

      const addDraft = () => {
        setDrafts((current) => [...current, emptyDraft()])
      }

      const saveDraft = async (index) => {
        const draft = drafts[index]
        const problem = draftProblem(draft)
        if (problem !== '') {
          setError(problemText(problem))
          return
        }
        const payload = draftPayload(draft)
        if (draft.id === '') await mutate({ action: 'targets.add', target: payload })
        else await mutate({ action: 'targets.update', id: draft.id, patch: payload })
      }

      const removeDraft = async (index) => {
        const draft = drafts[index]
        // 还没落盘的新行只从界面上撤掉，不必打一次服务端（也就不会留下 400 的回声）。
        if (draft.id === '') {
          setDrafts((current) => current.filter((_item, at) => at !== index))
          return
        }
        await mutate({ action: 'targets.remove', id: draft.id })
      }

      /* ---- 查询区（P6 面板侧）：走宿主那条 /query，与 agent 工具同一个执行层 ---- */

      /** 一次展示用的时间格式：本地时间到毫秒（日志排查里毫秒常常就是线索）。 */
      function formatTime(ms) {
        const date = new Date(ms)
        const pad = (value, width) => String(value).padStart(width, '0')
        return pad(date.getHours(), 2) + ':' + pad(date.getMinutes(), 2) + ':' + pad(date.getSeconds(), 2) + '.' + pad(date.getMilliseconds(), 3)
      }

      /** 时间窗预设的文案：逐条列字面量，别用 'option.' + key 拼（静态闸门扫不到动态键）。 */
      function windowLabel(key) {
        if (key === '15m') return t('option.15m')
        if (key === '1h') return t('option.1h')
        if (key === '6h') return t('option.6h')
        if (key === '24h') return t('option.24h')
        return key
      }

      /** 截断理由 → 文案（同样逐条列字面量）。 */
      function reasonText(reason) {
        if (reason === 'hit_limit') return t('status.hit_limit')
        if (reason === 'max_result_window') return t('status.max_result_window')
        if (reason === 'partial_shards') return t('status.partial_shards')
        if (reason === 'timed_out') return t('status.timed_out')
        if (reason === 'scan_cap') return t('status.scan_cap')
        if (reason === 'byte_cap') return t('status.byte_cap')
        if (reason === 'cursor_expired') return t('status.cursor_expired')
        return reason
      }

      /** 计数的一段 → 文案（matched 是下界时写「至少」，不把「不知道」说成「知道」）。 */
      function countText(part) {
        if (part.key === 'returned') return t('meta.returned', { count: part.value })
        if (part.key === 'matched') return t('meta.matched', { count: part.value })
        if (part.key === 'matchedAtLeast') return t('meta.matchedAtLeast', { count: part.value })
        if (part.key === 'scannedRows') return t('meta.scannedRows', { count: part.value })
        if (part.key === 'scannedBytes') return t('meta.scannedBytes', { count: part.value })
        return String(part.value)
      }

      /**
       * 拉「时间分布」：**只在来源支持聚合时才发**（能力由宿主随 /query 响应下发，见 src/index.ts 的
       * capabilitiesOf——面板不自己按 kind 猜，那是第二份会漂的判据）。
       *
       * 三类诚实的收尾：
       * - **不支持**（Loki）：不发请求，画一句「这个来源没有时间分布」而不是一个永远失败的按钮；
       * - **拿不到**（后端报错）：只把这句话显示出来，**不动已经拿到的结果列表**——分布是附加信息，
       *   它的失败不该把查询本身也变成失败；
       * - **翻下一页**：窗口与查询串都没变，分布也不会变，所以**不重拉**（省一次打后端的请求）。
       */
      const loadHistogram = async (data, append, draft = query) => {
        if (append) return
        // `!== true` 连同「不知道」（缺 capabilities）一起挡住：不知道就不发请求、也不画。
        if (supportsAggregation(data) !== true) {
          setHistogram(undefined)
          return
        }
        const step = histogramInterval(data.window === undefined || data.window === null ? 0 : data.window.to - data.window.from)
        const payload = histogramPayload(draft, data, step.key)
        // 回显不完整（拿不到窗口）：不发畸形的请求（见 pure.js histogramPayload）
        if (payload === null) {
          setHistogram(undefined)
          return
        }
        try {
          const parsed = await api('/api/dsh-loglens/facets', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          })
          const bars = histogramBars(parsed.overTime, payload.from, payload.to, step.ms)
          setHistogram(bars.bars.length === 0 ? undefined : { ...bars, interval: step.key })
        } catch (err) {
          setHistogram({ error: err.message })
        }
      }

      /**
       * 拉「按字段分组」榜。三类收尾与直方图**逐条相同**（不支持就不发、拿不到只说那一句、
       * 翻页不重拉），另加一条：**没填分组字段就不发**——面板没有默认字段（各家索引的字段名
       * 不一样，猜一个「container.name」在这里等于替用户伪造一个范围）。
       *
       * 榜是「哪个服务在报错」这个问题的直接答案（真机反馈第 2 条），所以它与直方图一样，
       * **只信后端聚合**：`terms` 的分组与计数都在 ES 那边算，面板只负责画。
       */
      const loadGroups = async (data, append, draft = query) => {
        if (append) return
        if (supportsAggregation(data) !== true) {
          setGroups(undefined)
          return
        }
        if (groupProblem(groupBy) !== '') {
          setGroups(undefined)
          return
        }
        const payload = groupPayload(draft, data, groupBy)
        // 回显不完整（拿不到窗口）：不发畸形的请求（见 pure.js facetsEnvelope）
        if (payload === null) {
          setGroups(undefined)
          return
        }
        setGrouping(true)
        try {
          const parsed = await api('/api/dsh-loglens/facets', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          })
          // 回显**这一次真正用的字段**（payload.by），不是输入框里此刻的字——用户改了输入框
          // 还没点「分组」时，榜上的标题不能跟着改（那就成了「说的和画的不一样」）。
          setGroups({
            ...groupBars(parsed.buckets),
            by: payload.by,
            warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
          })
        } catch (err) {
          setGroups({ error: err.message })
        } finally {
          setGrouping(false)
        }
      }

      /**
       * 查一次。`override` 是「这一次要用哪份草稿」：默认用当前渲染的那一份，下钻 / 去掉筛选时
       * 传**刚算出来的那一份**——`setQuery` 要到下一次渲染才生效，这里若还读闭包里的 `query`，
       * 就会带着**旧的筛选**再查一遍（行收窄了、分布没收窄，或者干脆筛了个空气）。
       */
      const runQuery = async (append, override) => {
        const draft = override === undefined ? query : override
        // 来源用**回落之后**的那一项（render 里的 chosenTarget），与下拉显示的那个逐字相同：
        // 于是「选中的来源被删掉」时，这里回的是「先选一个来源」，而不是打一个已经不存在的 id。
        const effective = { ...draft, target: chosenTarget }
        const problem = queryProblem(effective, drafts.length)
        if (problem !== '') {
          setError(problem === 'needTarget' ? t('error.needTarget') : t('error.badLimit'))
          return
        }
        setQuerying(true)
        setError('')
        setOk('')
        try {
          const payload = queryPayload(effective, drafts, Date.now())
          if (append && cursor !== undefined) payload.cursor = cursor
          const data = await api('/api/dsh-loglens/query', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          })
          setOutcome(data)
          setLines((current) => (append ? appendLines(current, data.lines) : data.lines))
          setCursor(typeof data.nextCursor === 'string' ? data.nextCursor : undefined)
          // 两份聚合并行（互不依赖）：分布与榜都是附加信息，谁拿不到都不该拖住结果列表
          await Promise.all([loadHistogram(data, append, effective), loadGroups(data, append, effective)])
        } catch (err) {
          setError(err.message)
        } finally {
          setQuerying(false)
        }
      }

      /**
       * 点榜上的一行 = 按它下钻：把这个桶加成一条筛选（已经在筛同一个值 → 再点就是取消），
       * 然后**带着新筛选立刻重查一遍**——行、时间分布、榜三处一起收窄。
       *
       * 为什么不「用已经拿到的行在本地过一遍」：那一页是被 `limit` 截断过的，数它只会得到一个
       * 假的分布与假的排名（判据见 pure.js 的 histogramBars）。下钻只有真的重查一次才是诚实的。
       */
      const drillDown = async (field, key) => {
        if (querying) return
        // 兜底一道：榜上那一行**本来就不给点**（空值键，见渲染），但这条路上再来一道判据——
        // 将来的改动不该能悄悄下发一条 `{字段: ""}`（那筛的是「等于空串」，不是「字段缺失」）。
        const problem = filterProblem(field, key)
        if (problem !== '') {
          setError(problem === 'needFilterField' ? t('error.needFilterField') : t('error.needFilterValue'))
          return
        }
        const current = Array.isArray(query.filters) ? query.filters : []
        const next = {
          ...query,
          filters: filterHas(current, field, key) ? filterRemove(current, field) : filterAdd(current, field, key),
        }
        setQuery(next)
        await runQuery(false, next)
      }

      /** 芯片上的 ×：去掉这条筛选，同样立刻重查（留下的那些照旧下发）。 */
      const removeFilter = async (field) => {
        if (querying) return
        const current = Array.isArray(query.filters) ? query.filters : []
        const next = { ...query, filters: filterRemove(current, field) }
        setQuery(next)
        await runQuery(false, next)
      }

      /**
       * 「分组」按钮：窗口与查询串沿用**上一次查询回显的那一份**（不重新查一遍行）。
       * 三条即时反馈：还没查过 / 没填字段 / 来源明确不支持——都不发请求，界面直接说为什么。
       */
      const runGroups = async () => {
        if (outcome === undefined) return
        if (groupProblem(groupBy) !== '') {
          setError(t('error.needGroupBy'))
          return
        }
        if (supportsAggregation(outcome) !== true) return
        setError('')
        await loadGroups(outcome, false)
      }

      /**
       * 拉字段清单（分组字段那一格的候选）。**由「点开」触发**（`openPick`），不是另设一个按钮：
       * 原生 `<datalist>` 就是点开就有，「先按按钮、再点输入框」是两步做一件事。
       *
       * `targetId` 由调用方给（当前选中的来源），不在这里读闭包：这样「拉回来的这份属于谁」是显式的，
       * 缓存按它判（`fieldFetchNeeded`）。`limit` 不传——用宿主自己的默认值与它那句截断警告。
       */
      const loadFields = async (targetId) => {
        /*
         * 在途闩（用 ref，不是 state）：**一次鼠标点击会先 focus 再 click**，两条路都走到 `openPick`，
         * 而 `fieldsSource` / `fieldsBusy` 在这一轮渲染里都还是旧值——不闩就白打两枪同一份清单
         * （真机上就是这么抓到的：第一次点开 `/fields` 打了 2 次）。
         */
        if (fieldsFlightRef.current === targetId) return
        fieldsFlightRef.current = targetId
        setFieldsBusy(true)
        setFieldsError('')
        setFieldsNote('')
        try {
          const parsed = await api('/api/dsh-loglens/fields', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ target: targetId }),
          })
          const list = Array.isArray(parsed.fields) ? parsed.fields : []
          setFields(list)
          // 记下「这份属于哪个来源」：同一个来源再点开就不重拉了（见 fieldFetchNeeded）
          setFieldsSource(targetId)
          const warnings = Array.isArray(parsed.warnings) ? parsed.warnings : []
          if (warnings.length > 0) setFieldsNote(warnings.join(' '))
        } catch (err) {
          /*
           * 拉失败就**落在浮层里**（用户正看着那儿），不动卡片顶部那条错误行、也不动结果列表：
           * 字段候选是附加信息，它失败不该把已经查到的日志也变成失败（与分布 / 榜同一条）。
           * 失败时**不写缓存**（`fieldsSource` 不动），所以下一次点开会重试。
           */
          setFields([])
          setFieldsError(err.message)
        } finally {
          // 在途闩放开（失败也一样放开，好让下一次点开能重试）
          fieldsFlightRef.current = ''
          setFieldsBusy(false)
        }
      }

      /**
       * 点开候选浮层：**先开、再按需拉**——开是立刻的（浮层里已经有「加载中…」这一格），
       * 拉是异步的，不会出现「点了没反应」。同一个来源已经拉过就不重拉。
       */
      const openPick = () => {
        if (selectedDraft === undefined) {
          setError(t('error.needTarget'))
          return
        }
        setPickOpen(true)
        if (fieldFetchNeeded(fieldsSource, selectedDraft.id)) loadFields(selectedDraft.id)
      }

      /** 拉 Docker 面板自己的目标清单（拿不到就退回手填，不把整张卡片带下去）。 */
      const loadDockerTargets = async () => {
        try {
          const parsed = await api('/api/dsh-docker/config')
          const config = parsed.config === undefined || parsed.config === null ? {} : parsed.config
          setDockerTargets(Array.isArray(config.targets) ? config.targets : [])
        } catch {
          /* Docker 面板没装 / 未启用：保持手填 */
        }
      }

      const loadContainers = async () => {
        if (!docker || selectedDraft === undefined) return
        setDockerBusy(true)
        setError('')
        try {
          const parsed = await api('/api/dsh-docker/containers', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(selectedDraft.dockerTarget === '' ? { all: false } : { target: selectedDraft.dockerTarget, all: false }),
          })
          const list = Array.isArray(parsed.containers) ? parsed.containers : []
          setContainers(list)
          setContainer((current) => (current === '' && list.length > 0 ? list[0].id : current))
        } catch (err) {
          setError(err.message)
        } finally {
          setDockerBusy(false)
        }
      }

      const openDockerLogs = async () => {
        if (selectedDraft === undefined) return
        if (dockerProblem({ container }) !== '') {
          setError(t('error.needContainer'))
          return
        }
        setDockerBusy(true)
        setError('')
        try {
          const common = { id: container, tail: dockerTail, since: dockerSince(query.preset) }
          const parsed = await api('/api/dsh-docker/logs', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(selectedDraft.dockerTarget === '' ? common : { target: selectedDraft.dockerTarget, ...common }),
          })
          setDockerLogs(dockerLogTextOf(parsed))
          setDockerOpened(true)
        } catch (err) {
          setError(err.message)
        } finally {
          setDockerBusy(false)
        }
      }

      const clearResults = () => {
        setOutcome(undefined)
        setLines([])
        setCursor(undefined)
        setHistogram(undefined)
        setGroups(undefined)
        setError('')
        setOk('')
      }

      if (view === 'summary') {
        return t('card.desc')
      }

      const selectedDraft = drafts.find((draft) => draft.id === query.target) === undefined
        ? (drafts.length === 1 ? drafts[0] : undefined)
        : drafts.find((draft) => draft.id === query.target)
      const isDocker = selectedDraft !== undefined && selectedDraft.kind === 'docker'
      /*
       * 「来源」下拉显示的那一项 = 这次查询**真正会用的**那一项（同一个判据，不是第二份）。
       *
       * `query.target` 在刚进卡片时是空串，而 `<select value="">` 没有一个 value 为空串的选项时，
       * 浏览器会**回落显示第一项**——于是下拉写着「161（Docker）」，面板其余部分却按「没选来源」走：
       * `isDocker` 为假（该画容器日志区却画了普通查询行）、分组那两个按钮是灰的、点「查询」回一句
       * 「先选一个来源」。三处症状一个根因：**显示的那一项与实际用的那一项不是同一个判断**
       * （loglens D04，见 DEFECTS.md：说的和画的不一样）。所以加一个空 value 的占位项，并让下拉跟着它走。
       *
       * 顺带兜住同源的另一个边：**选中的来源被删掉之后**，`query.target` 还留着那个已经不存在的 id。
       * `selectedDraft` 会回落（只有一个来源就回落它，否则没有），下拉与请求必须一起回落——否则会出现
       * 「下拉写着没选、请求却打一个已经不存在的 id」。
       */
      const chosenTarget = selectedDraft === undefined ? '' : selectedDraft.id
      // 当前生效的筛选（芯片那一行、榜上「正在按它下钻」的高亮都用它）
      const activeFilters = Array.isArray(query.filters) ? query.filters : []

      const rows = drafts.map((draft, index) => jsxs('div', {
        className: 'll_row',
        key: 'loglens-row-' + String(index),
        children: [
          jsx('select', {
            className: 'll_input',
            value: draft.kind,
            disabled: saving,
            onChange: (event) => { updateDraft(index, { kind: event.target.value }) },
            children: kindOptions().map((kind) => jsx('option', { value: kind, children: kindLabel(kind) }, kind)),
          }),
          jsx('input', {
            className: 'll_input',
            placeholder: t('placeholder.label'),
            value: draft.label,
            disabled: saving,
            onChange: (event) => { updateDraft(index, { label: event.target.value }) },
          }),
          draft.kind === 'docker' ? jsx('select', {
            className: 'll_input',
            title: t('field.dockerTarget'),
            value: draft.dockerTarget,
            disabled: saving,
            onChange: (event) => { updateDraft(index, { dockerTarget: event.target.value }) },
            children: [
              jsx('option', { value: '', children: t('option.dockerAuto') }, 'll-docker-auto'),
              ...dockerTargetChoices(dockerTargets, draft.dockerTarget).map((choice) => jsx('option', {
                value: choice.value,
                children: choice.known
                  ? (choice.label === choice.value ? choice.value : choice.value + '（' + choice.label + '）')
                  : choice.value + t('hint.dockerTargetUnknown'),
              }, 'll-docker-' + choice.value)),
            ],
          }) : (draft.kind === 'elasticsearch' || draft.kind === 'opensearch') ? jsxs('div', {
            // ES / OpenSearch 多一行「索引表达式」：原先它是从地址路径悄悄推出来的（没写路径就成
            // 全集群通配），agent 与人都猜不到自己要打哪个范围——真机反馈第 3 条。
            className: 'll_stack',
            children: [
              jsx('input', {
                className: 'll_input',
                title: t('field.url'),
                placeholder: t('placeholder.url'),
                value: draft.url,
                disabled: saving,
                onChange: (event) => { updateDraft(index, { url: event.target.value }) },
              }),
              jsx('input', {
                className: 'll_input',
                title: t('hint.index'),
                placeholder: t('placeholder.index'),
                value: draft.index,
                disabled: saving,
                onChange: (event) => { updateDraft(index, { index: event.target.value }) },
              }),
            ],
          }) : jsx('input', {
            className: 'll_input',
            title: t('field.url'),
            placeholder: t('placeholder.url'),
            value: draft.url,
            disabled: saving,
            onChange: (event) => { updateDraft(index, { url: event.target.value }) },
          }),
          jsx('button', {
            type: 'button',
            className: 'll_btn',
            disabled: saving,
            onClick: () => { saveDraft(index) },
            children: saving ? t('btn.saving') : t('btn.save'),
          }),
          jsx('button', {
            type: 'button',
            className: 'll_btnGhost ll_btnDanger',
            disabled: saving,
            onClick: () => { removeDraft(index) },
            children: t('btn.remove'),
          }),
        ],
      }, 'loglens-row-' + String(index)))

      return jsxs(pageView ? 'div' : 'li', {
        className: pageView ? 'll_pageHost' : (open ? 'll_pluginCard ll_pluginCardOpen' : 'll_pluginCard'),
        children: [
          pageView ? null : jsxs('button', {
            type: 'button',
            className: 'll_cardHeader',
            'aria-expanded': open,
            onClick: () => setOpen((current) => !current),
            children: [
              jsxs('span', {
                className: 'll_cardHeadText',
                children: [
                  jsx('span', { className: 'll_cardName', children: t('card.name') }),
                  jsx('span', { className: 'll_cardDescription', children: t('card.desc') }),
                ],
              }),
              jsx('span', { className: 'dshkit_badge', children: enabled ? t('status.enabled') : t('status.disabled') }),
              jsx('svg', {
                width: '14',
                height: '14',
                viewBox: CHEVRON_VIEWBOX,
                fill: 'none',
                strokeWidth: CHEVRON_STROKE,
                xmlns: 'http://www.w3.org/2000/svg',
                'aria-hidden': 'true',
                className: 'll_chevron',
                children: jsx('path', { d: CHEVRON_PATH, stroke: 'currentColor' }),
              }),
            ],
          }),
          (pageView || open) ? jsx('div', {
            className: 'll_cardBody',
            children: jsxs('div', {
              className: 'll_panel',
              children: [
                jsxs('div', {
                  className: 'll_panelHeader',
                  children: [
                    jsx('span', { className: 'll_panelTitle', children: t('panel.title') }),
                    jsxs('label', {
                      className: 'll_switch',
                      children: [
                        jsx('input', {
                          type: 'checkbox',
                          checked: enabled,
                          disabled: saving,
                          onChange: (event) => { mutate({ action: 'enabled', enabled: event.target.checked }) },
                        }),
                        t('check.enabled'),
                      ],
                    }),
                  ],
                }),
                jsx('p', { className: 'll_hint', children: t('hint.notImplemented') }),
                jsxs('div', {
                  className: 'll_toolbar',
                  children: [
                    jsx('button', {
                      type: 'button',
                      className: 'll_btnGhost',
                      disabled: saving,
                      onClick: addDraft,
                      children: t('btn.add'),
                    }),
                    jsx('div', { className: 'll_toolbarSpacer' }),
                    error ? jsx('p', { className: 'll_error', children: error }) : (ok ? jsx('p', { className: 'll_ok', children: ok }) : null),
                  ],
                }),
                loading ? jsx('div', { className: 'll_loading', children: t('list.loading') }) : null,
                !loading && drafts.length === 0 ? jsx('div', { className: 'll_empty', children: t('list.empty') }) : null,
                drafts.length > 0 ? jsx('div', {
                  className: 'll_list',
                  children: [
                    jsxs('div', {
                      className: 'll_head',
                      children: [
                        jsx('span', { children: t('field.kind') }),
                        jsx('span', { children: t('field.label') }),
                        jsx('span', { children: t('field.url') }),
                        jsx('span', {}),
                        jsx('span', {}),
                      ],
                    }),
                    ...rows,
                  ],
                }) : null,
                drafts.length > 0 ? jsxs('div', {
                  className: 'll_query',
                  children: [
                    jsx('span', { className: 'll_panelTitle', children: t('section.query') }),
                    jsxs('div', {
                      className: 'll_queryGrid',
                      children: [
                        jsx('select', {
                          className: 'll_input',
                          title: t('field.target'),
                          // 显示的那一项 = 真正会用的那一项（见 render 里的 chosenTarget）：
                          // 都没选时 value 是空串，由下面那个占位项把它显示成「（先选一个来源）」
                          value: chosenTarget,
                          disabled: saving || querying || dockerBusy,
                          onChange: (event) => { setQuery((current) => ({ ...current, target: event.target.value })) },
                          children: [
                            // 占位项：value 空、且不可选——它就是「还没选」这句话本身（loglens D04）。
                            // 少了它，浏览器会把第一项画成已选（一个源码里看不见的谎）。
                            jsx('option', { value: '', disabled: true, children: t('option.pickTarget') }, 'll-target-none'),
                            ...drafts.map((draft) => jsx('option', { value: draft.id, children: draft.label === '' ? draft.id : draft.label }, draft.id)),
                          ],
                        }),
                        isDocker ? null : jsx('input', {
                          className: 'll_input',
                          placeholder: t('placeholder.query'),
                          value: query.q,
                          disabled: saving || querying,
                          onChange: (event) => { setQuery((current) => ({ ...current, q: event.target.value })) },
                        }),
                        isDocker ? null : jsx('select', {
                          className: 'll_input',
                          title: t('field.window'),
                          value: query.preset,
                          disabled: saving || querying,
                          onChange: (event) => { setQuery((current) => ({ ...current, preset: event.target.value })) },
                          children: windowOptions().map((key) => jsx('option', { value: key, children: windowLabel(key) }, key)),
                        }),
                        isDocker ? null : jsx('input', {
                          className: 'll_input',
                          title: t('field.limit'),
                          type: 'number',
                          min: '1',
                          value: String(query.limit),
                          disabled: saving || querying,
                          onChange: (event) => { setQuery((current) => ({ ...current, limit: Number(event.target.value) })) },
                        }),
                        isDocker ? null : jsx('button', {
                          type: 'button',
                          className: 'll_btn',
                          disabled: saving || querying,
                          onClick: () => { runQuery(false) },
                          children: querying ? t('btn.querying') : t('btn.query'),
                        }),
                      ],
                    }),
                    // 分组那一行：字段名 + 「有哪些字段」（候选）+ 「分组」（沿用上一次查询的窗口）。
                    // 「分组」只在来源**明确说**能聚合时可用——不知道（旧版宿主）按直方图同款处理，
                    // 不替对方说一句没依据的话，也不发一个可能永远失败的请求。
                    isDocker ? null : jsxs('div', {
                      className: 'll_groupGrid',
                      children: [
                        /*
                         * 分组字段那一格 = 输入框 + 官方 chevron + **自画的候选浮层**。
                         *
                         * 原来是 `<input list>` + `<datalist>`：那个浮层是浏览器画的，**CSS 改不动**
                         * （字体、行高、圆角、投影、滚动条全是平台的），和宿主自己的下拉放在一屏里
                         * 一眼能看出是两个东西（维护者 2026-10-13 看图后提的「这个样式优化一下」）。
                         * 现在候选盒按宿主自己的菜单配方画：`border:0` + 描边投影 + 4px 内边距 +
                         * 每行 34px / `radius-md` / hover 用 `interactive-bg-hover`。
                         *
                         * 顺带去掉一个隐患：datalist 要靠一个全局唯一的 id 关联，同一页挂两张卡时
                         * 得给每张卡生成一个（原来的 `fieldsListSeq`）。自画的浮层没有 id，也就没有这回事。
                         */
                        jsxs('div', {
                          className: 'll_pick',
                          onBlur: (event) => {
                            // 焦点离开这一格就收起来。判据用 relatedTarget（下一个焦点落在哪里），
                            // 而不是「一 blur 就关」——点浮层里的行不该把它关掉（那些行自己 preventDefault 保住焦点）。
                            const next = event.relatedTarget
                            const inside = next !== null && next !== undefined && typeof event.currentTarget.contains === 'function'
                              ? event.currentTarget.contains(next)
                              : false
                            if (!inside) setPickOpen(false)
                          },
                          children: [
                            jsx('input', {
                              className: 'll_input ll_pickInput',
                              title: t('field.groupBy'),
                              placeholder: t('placeholder.groupBy'),
                              value: groupBy,
                              disabled: saving || querying || grouping,
                              onChange: (event) => {
                                setGroupBy(event.target.value)
                                setPickIndex(0)
                              },
                              // 点开就拉（一个手势；原生 datalist 也是点开就有）
                              onFocus: () => { openPick() },
                              onClick: () => { openPick() },
                              onKeyDown: (event) => {
                                // 方向键是原来那套原生浮层**自带**的能力：换成自画的就得自己接回来，
                                // 否则是悄悄降级（鼠标能用、键盘只能一路 Tab）
                                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                                  event.preventDefault()
                                  openPick()
                                  setPickIndex((current) => pickMove(current, event.key === 'ArrowDown' ? 1 : -1, choices.length))
                                  return
                                }
                                if (event.key === 'Escape') setPickOpen(false)
                                // 回车取**当前那一行**（没挪过就是第一条）
                                if (event.key === 'Enter' && pickOpen && choices.length > 0) {
                                  setGroupBy(choices[pickMove(pickIndex, 0, choices.length)].name)
                                  setPickOpen(false)
                                }
                              },
                            }),
                            // 箭头用的是**官方那颗描边 chevron**（与卡头折叠箭头同一颗，见 CHEVRON_* 常量）
                            jsx('svg', {
                              width: '14',
                              height: '14',
                              viewBox: CHEVRON_VIEWBOX,
                              fill: 'none',
                              strokeWidth: CHEVRON_STROKE,
                              xmlns: 'http://www.w3.org/2000/svg',
                              'aria-hidden': 'true',
                              className: 'll_pickChevron',
                              children: jsx('path', { d: CHEVRON_PATH, stroke: 'currentColor' }),
                            }),
                            /*
                             * 浮层里的四种状态，各有各的一句话——**不许出现一个空盒子**：
                             *   在途 → 「加载中…」；失败 → 宿主原话（只落这里）；空清单 → 「这个来源没有返回字段名…」；
                             *   有候选但被输入的字筛成 0 个 → 不画（那是用户自己在收窄，原生浮层也是空列表）。
                             */
                            !pickOpen ? null : (fieldsBusy ? jsx('div', {
                              className: 'll_pickList',
                              children: jsx('div', { className: 'll_pickState', children: t('list.loading') }),
                            }) : fieldsError !== '' ? jsx('div', {
                              className: 'll_pickList',
                              children: jsx('div', { className: 'll_pickState ll_warn', children: t('error.fields', { message: fieldsError }) }),
                            }) : fields.length === 0 ? jsx('div', {
                              className: 'll_pickList',
                              children: jsx('div', { className: 'll_pickState', children: t('msg.fieldsEmpty') }),
                            }) : choices.length === 0 ? null : jsx('div', {
                              className: 'll_pickList',
                              children: [
                                ...choices.map((item, at) => jsx('button', {
                                  type: 'button',
                                  // 当前那一行要高亮出来：方向键挪的是它，回车取的是它（不然键盘用户看不见自己停在哪）
                                  className: at === pickIndex ? 'll_pickItem ll_pickItemActive' : 'll_pickItem',
                                  title: item.name,
                                  // 保住输入框的焦点：一失焦那一格就收起来了，点击会先 blur 再 click
                                  onMouseDown: (event) => { event.preventDefault() },
                                  // 鼠标划到哪一行，方向键就从哪一行接着走（两套输入共用同一个「当前行」）
                                  onMouseEnter: () => { setPickIndex(at) },
                                  onClick: () => {
                                    setGroupBy(item.name)
                                    setPickOpen(false)
                                  },
                                  children: item.name,
                                }, 'll-field-' + item.name)),
                                // 页脚：宿主的截断警告（照抄）+ 一个「刷新」——缓存的出口
                                // （同一个来源不再每次都拉，但字段是会随新数据长的，得留个手动口子）
                                jsxs('div', {
                                  className: 'll_pickFoot',
                                  children: [
                                    jsx('span', { className: fieldsNote === '' ? 'll_pickState' : 'll_pickState ll_warn', children: fieldsNote }),
                                    jsx('button', {
                                      type: 'button',
                                      className: 'll_pickRefresh',
                                      disabled: fieldsBusy,
                                      onMouseDown: (event) => { event.preventDefault() },
                                      onClick: () => { if (selectedDraft !== undefined) loadFields(selectedDraft.id) },
                                      children: t('btn.refreshFields'),
                                    }),
                                  ],
                                }),
                              ],
                            })),
                          ],
                        }),
                        jsx('button', {
                          type: 'button',
                          className: 'll_btnGhost',
                          disabled: saving || querying || grouping || outcome === undefined || supportsAggregation(outcome) !== true,
                          onClick: () => { runGroups() },
                          children: grouping ? t('btn.grouping') : t('btn.group'),
                        }),
                      ],
                    }),
                    // 生效中的筛选：一行芯片（每条一个 ×）。只在有筛选时出现——没有筛选时这一行
                    // 不占位、也不说一句话（说「当前没有筛选」等于往界面上加噪音）。
                    isDocker || activeFilters.length === 0 ? null : jsxs('div', {
                      className: 'll_filters',
                      children: [
                        jsx('span', { className: 'll_filtersLabel', children: t('field.filters') }),
                        ...activeFilters.map((chip) => jsxs('span', {
                          className: 'll_chip',
                          children: [
                            // 值**原样**显示（与下发的那一份逐字相同：键名里的空格是内容的一部分）
                            jsx('span', { className: 'll_chipText', title: chip.field + ' = ' + chip.value, children: chip.field + ' = ' + chip.value }),
                            jsx('button', {
                              type: 'button',
                              className: 'll_chipBtn',
                              title: t('btn.filterRemove'),
                              disabled: saving || querying,
                              onClick: () => { removeFilter(chip.field) },
                              children: '×',
                            }),
                          ],
                        }, 'll-filter-' + chip.field)),
                        jsx('span', { className: 'll_hint ll_filtersHint', children: t('hint.filters') }),
                      ],
                    }),
                    isDocker ? jsxs('div', {
                      className: 'll_queryGrid',
                      children: [
                        jsx('button', {
                          type: 'button',
                          className: 'll_btnGhost',
                          disabled: dockerBusy || !docker,
                          onClick: () => { loadContainers() },
                          children: t('btn.containers'),
                        }),
                        jsx('select', {
                          className: 'll_input',
                          title: t('field.container'),
                          value: container,
                          disabled: dockerBusy || !docker,
                          onChange: (event) => { setContainer(event.target.value) },
                          children: [
                            jsx('option', { value: '', children: t('field.container') }, 'll-container-none'),
                            ...containers.map((item) => jsx('option', { value: item.id, children: item.name === undefined || item.name === '' ? item.id : item.name }, item.id)),
                          ],
                        }),
                        jsx('select', {
                          className: 'll_input',
                          title: t('field.window'),
                          value: query.preset,
                          disabled: dockerBusy || !docker,
                          onChange: (event) => { setQuery((current) => ({ ...current, preset: event.target.value })) },
                          children: windowOptions().map((key) => jsx('option', { value: key, children: windowLabel(key) }, 'll-dw-' + key)),
                        }),
                        jsx('select', {
                          className: 'll_input',
                          title: t('field.tail'),
                          value: String(dockerTail),
                          disabled: dockerBusy || !docker,
                          onChange: (event) => { setDockerTail(Number(event.target.value)) },
                          children: [50, 100, 200, 500].map((value) => jsx('option', { value: String(value), children: String(value) }, 'll-tail-' + String(value))),
                        }),
                        jsx('button', {
                          type: 'button',
                          className: 'll_btn',
                          disabled: dockerBusy || !docker,
                          onClick: () => { openDockerLogs() },
                          children: dockerBusy ? t('btn.logsLoading') : t('btn.logs'),
                        }),
                      ],
                    }) : null,
                    isDocker
                      ? jsx('p', { className: 'll_hint', children: docker ? t('hint.docker') : t('hint.dockerMissing') })
                      : jsx('p', { className: 'll_hint', children: t('hint.query') }),
                    isDocker && dockerOpened && dockerLogLines(dockerLogs).length > 0 ? jsx('div', {
                      className: 'll_results',
                      children: dockerLogLines(dockerLogs).map((text, at) => jsx('div', {
                        className: 'll_resultRow',
                        children: jsx('span', { className: 'll_resultMsg', children: text }),
                      }, 'll-docker-' + String(at))),
                    }) : null,
                    isDocker && dockerOpened && dockerLogLines(dockerLogs).length === 0 ? jsx('div', {
                      className: 'll_empty',
                      children: t('list.noLogs'),
                    }) : null,
                    outcome === undefined || isDocker ? null : jsxs('div', {
                      className: 'll_queryMeta',
                      children: [
                        countsParts(outcome.counts === undefined ? { returned: 0 } : outcome.counts).map((part) => jsx('span', { children: countText(part) }, 'll-count-' + part.key)),
                        outcome.truncation !== undefined && outcome.truncation.truncated === true
                          ? jsx('span', { className: 'll_warn', children: t('meta.truncated', { reasons: (outcome.truncation.reasons === undefined ? [] : outcome.truncation.reasons).map((reason) => reasonText(reason)).join(' / ') }) })
                          : null,
                        outcome.hint === undefined ? null : jsx('span', { className: 'll_warn', children: outcome.hint }),
                        // warnings 是宿主对这次查询做过什么调整（夹了 limit、兜了时间窗）——**不许吞掉**：
                        // agent 工具看得到的东西，面板也得看得到
                        ...(outcome.warnings === undefined ? [] : outcome.warnings.map((text, at) => jsx('span', { className: 'll_warn', children: text }, 'll-warn-' + String(at)))),
                        jsx('button', { type: 'button', className: 'll_btnGhost', disabled: querying, onClick: clearResults, children: t('btn.clear') }),
                      ],
                    }),
                    lines.length > 0 && !isDocker ? jsx('div', {
                      className: 'll_results',
                      children: lines.map((line) => jsxs('div', {
                        className: 'll_resultRow',
                        children: [
                          jsx('span', { className: 'll_resultTime', children: formatTime(line.ts) }),
                          jsx('span', { className: 'll_resultLevel', children: line.level === undefined ? '' : line.level }),
                          jsx('span', { className: 'll_resultMsg', children: line.message }),
                        ],
                      }, 'll-line-' + line.id)),
                    }) : null,
                    // 时间分布：拿不到就把那句话说出来（不动结果列表），**不支持**就说清不支持，
                    // **不知道**（宿主没给 capabilities）什么都不说——「不知道 ≠ 不支持」。
                    // 两句聚合（分布 / 榜）共用这一句「不支持」：它们是同一个能力，说两遍只是噪音。
                    isDocker || outcome === undefined ? null : histogram === undefined
                      ? (supportsAggregation(outcome) === false
                        ? jsx('p', { className: 'll_hint', children: t('hint.aggregationUnsupported') })
                        : null)
                      : (histogram.error === undefined ? jsxs('div', {
                        className: 'll_hist',
                        children: [
                          jsxs('div', {
                            className: 'll_histHead',
                            children: [
                              jsx('span', { className: 'll_histTitle', children: t('panel.histogram') }),
                              jsx('span', { children: t('meta.histInterval', { interval: histogram.interval }) }),
                              jsx('span', { children: t('meta.histPeak', { count: histogram.max }) }),
                              // 合计只在没截断时才敢写：截断了它就是少算的（**不写一个自己知道是错的数**）
                              histogram.truncated ? null : jsx('span', { children: t('meta.histTotal', { count: histogram.total }) }),
                              histogram.truncated ? jsx('span', { className: 'll_warn', children: t('hint.histogramTruncated') }) : null,
                            ],
                          }),
                          jsx('div', {
                            className: 'll_histBars',
                            children: histogram.bars.map((bar) => jsx('div', {
                              className: bar.count === 0 ? 'll_histBar ll_histBarEmpty' : 'll_histBar',
                              // 空桶给 2% 的底座：否则「那段时间一条都没有」与「这一段没画」看起来一样
                              style: { height: String(Math.max(bar.ratio * 100, 2)) + '%' },
                              title: t('meta.histBucket', { time: formatTime(bar.ts), count: bar.count }),
                            }, 'll-hist-' + String(bar.ts))),
                          }),
                          jsx('p', { className: 'll_hint', children: t('hint.histogram') }),
                        ],
                      }) : jsx('p', { className: 'll_warn', children: t('error.histogram', { message: histogram.error }) })),
                    // 按字段分组（terms 榜）：与直方图同一片地方、同一套诚实收尾（见 loadGroups）。
                    // 标题回显 **groups.by**（这一次真正用的字段），不是输入框里的此刻值。
                    isDocker || outcome === undefined || groups === undefined ? null : (groups.error === undefined ? jsxs('div', {
                      className: 'll_groups',
                      children: [
                        jsxs('div', {
                          className: 'll_groupHead',
                          children: [
                            jsx('span', { className: 'll_groupTitle', children: t('panel.groups') }),
                            jsx('span', { children: groups.by }),
                            groups.truncated ? jsx('span', { className: 'll_warn', children: t('hint.groupsTruncated') }) : null,
                            // warnings 是宿主对这次聚合的说明（「还有 N 条落在没列出来的桶里」「计数是近似值」）
                            // ——**照抄**：agent 工具看得到的东西，面板也得看得到
                            ...groups.warnings.map((text, at) => jsx('span', { className: 'll_warn', children: text }, 'll-group-warn-' + String(at))),
                          ],
                        }),
                        groups.bars.length === 0 ? jsx('div', { className: 'll_empty', children: t('list.noBuckets') }) : jsx('div', {
                          className: 'll_groupRows',
                          // 每条横条**点一下就是按它下钻**（加一条筛选重查一次，再点一次取消）。
                          // 空值那一桶例外：它是一行死文字，因为筛选表达不了「字段缺失」
                          // （判据在 pure.js 的 filterProblem）——给个点得动、筛的却是别的东西的入口更坏。
                          children: groups.bars.map((bar, at) => {
                            const cells = [
                              jsx('span', {
                                className: bar.blank ? 'll_groupKey ll_groupKeyBlank' : 'll_groupKey',
                                children: bar.blank ? t('meta.groupsBlankKey') : bar.key,
                              }),
                              jsx('span', { className: 'll_groupCount', children: t('meta.groupsCount', { count: bar.count }) }),
                              // 条的宽度是**内联** style（每条都不一样，写不进类里）；空值键也给一条 2% 的底座
                              jsx('div', {
                                className: 'll_groupTrack',
                                children: jsx('div', {
                                  className: 'll_groupFill',
                                  style: { width: String(Math.max(bar.ratio * 100, 2)) + '%' },
                                }),
                              }),
                            ]
                            if (bar.blank) {
                              return jsx('div', { className: 'll_groupRow', title: t('hint.groupBlankNoDrill'), children: cells }, 'll-group-' + String(at))
                            }
                            const active = filterHas(activeFilters, groups.by, bar.key)
                            return jsx('button', {
                              type: 'button',
                              className: active ? 'll_groupRow ll_groupRowBtn ll_groupRowActive' : 'll_groupRow ll_groupRowBtn',
                              title: t('hint.groupDrillRow', { field: groups.by, value: bar.key }),
                              disabled: querying,
                              onClick: () => { drillDown(groups.by, bar.key) },
                              children: cells,
                            }, 'll-group-' + String(at))
                          }),
                        }),
                        jsx('p', { className: 'll_hint', children: t('hint.groups') }),
                      ],
                    }) : jsx('p', { className: 'll_warn', children: t('error.groups', { message: groups.error }) })),
                    outcome !== undefined && lines.length === 0 && !isDocker ? jsx('div', { className: 'll_empty', children: t('list.noHit') }) : null,
                    cursor === undefined || isDocker ? null : jsx('button', {
                      type: 'button',
                      className: 'll_btnGhost',
                      disabled: querying,
                      onClick: () => { runQuery(true) },
                      children: t('btn.nextPage'),
                    }),
                  ],
                }) : null,
              ],
            }),
          }) : null,
        ],
      })
    }

    /* ================================ 插件入口 ================================ */

    exports.inject = ['slots']

    /**
     * DSH ≥0.1.6-alpha.2 的行配置 key：<bundle 包名>#<行 id>，行 id 取自 bundle 的
     * cordis.patch.yml。独立安装时 bundle 是本包，装全家桶时是 @hyzyn/dsh-all —— 两个都
     * 注册，未命中的那个只是躺在 ledger 里，不会渲染。
     */
    const ROW_CONFIG_KEYS = [
      '@hyzyn/dsh-loglens#loglens',
      '@hyzyn/dsh-all#loglens',
    ]

    exports.apply = (ctx) => {
      installI18n(ctx)
      ctx.effect(() => {
        ensureStyle()
        return () => {
          styleEl?.remove()
          styleEl = undefined
        }
      })
      /*
       * 设置面：0.2.0-rc.1 起挂 `plugins.bundle.config`——key 是 **bundle 包名**，管理器的插件
       * 详情页把它渲染在「说明」正下方；`plugins.row.config` 是 per-row 的「>」子页。
       *
       * 两条硬约束（第一条踩过坑，见下）：
       *   ① `plugins.bundle.config` 的 key 是**共享命名空间**：同一个 key 只能有一个注册者，
       *      重复注册**直接抛错**（`keyed slot ... already has an entry`），而客户端 `apply`
       *      抛错 = 整个插件起不来（实测：把 `@hyzyn/dsh-all` 也挂上时，八个插件抢同一个 key，
       *      启动页直接变「Failed to load plugins」）（D158）。聚合包 `@hyzyn/dsh-all` 是所有插件共用的
       *      bundle，**不能**挂 bundle.config —— 它没有内联位，设置面走它自己的 row 入口。
       *   ② 内联位可用时，**本包自己的** bundle 不再注册 row 槽（同一份表单两个入口会让人以为
       *      有两套设置）；聚合包那份 row 入口**保留**（那是它在聚合安装下的唯一入口）。旧宿主
       *      （bundle 槽不存在，0.1.6 线）回退注册全部 row 槽，功能一点不减。
       * 就绪顺序不敏感：任一侧先到都收敛到「内联优先」（后到的本包 row 注册会被撤掉）。
       */
      const AGGREGATE_BUNDLE = '@hyzyn/dsh-all'
      const BUNDLE_NAMES = [...new Set(ROW_CONFIG_KEYS.map((key) => key.split('#')[0]))]
      const OWN_BUNDLE = BUNDLE_NAMES.find((name) => name !== AGGREGATE_BUNDLE)
      let bundleConfigLive = false
      const disposeOwnRowConfigs = []
      if (OWN_BUNDLE !== undefined) {
        ctx.slots.inject('plugins.bundle.config', () => {
          bundleConfigLive = true
          while (disposeOwnRowConfigs.length > 0) {
            const disposeRow = disposeOwnRowConfigs.pop()
            if (typeof disposeRow === 'function') disposeRow()
          }
          return ctx.slots.register({
            name: 'plugins.bundle.config',
            key: OWN_BUNDLE,
          }, LoglensSettingsCard)
        })
      }
      for (const key of ROW_CONFIG_KEYS) {
        ctx.slots.inject('plugins.row.config', () => {
          const own = key.split('#')[0] === OWN_BUNDLE
          if (own && bundleConfigLive) return undefined
          const disposeRow = ctx.slots.register({
            name: 'plugins.row.config',
            key,
          }, LoglensSettingsCard)
          if (own) disposeOwnRowConfigs.push(disposeRow)
          return disposeRow
        })
      }
      // DSH ≥0.1.6：设置里与「通用设置」平级的「插件配置」页（子 slot 由
      // @hyzyn/dsh-kit-settings 声明）。不传 view，卡片走各自原有的可折叠形态。
      ctx.slots.inject('settings.kit.item', () => ctx.slots.register({
        name: 'settings.kit.item',
        id: 'loglens',
        order: 12,
        label: () => t('card.name'),
      }, LoglensSettingsCard))
      // DSH ≤0.1.5：设置 → 插件 的「插件配置」标签页，keyed 插槽按 settings 命名空间派发。
      ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
        name: 'settings.plugin.item',
        key: 'loglens',
        order: 99,
      }, LoglensSettingsCard))
    }

    return exports
  },
})
