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
     * 这一行**改过没有**：拿「当前草稿」与「它落盘时的那份」各算一次 `draftPayload`，逐键比。
     *
     * 为什么要有它（第四十一刀，用户截图里的观感问题）：保存按钮原来**恒亮**——没改过的行也摆着一颗
     * 实心按钮，于是：
     *   - 看不出哪一行有未保存的改动（多行时最要紧：改了三个来源，不知道哪个没存）；
     *   - 每行都有一颗高权重按钮，整块区域全是「动作」，扫不到内容；
     *   - 想「刷新一下」的人会去点它（它其实什么都不会发生）。
     *
     * 判据复用 `draftPayload` 而不是自己拼字段：那个函数**已经**做了两件对的事——trim 掉首尾空白，
     * 以及「只带这个类型真正下发的字段」（docker 不发 url、非索引类型不发 index）。拿它比，
     * 「改完又改回去」「只多了个空格」都不会被当成改动——那正是用户期待的行为。
     *
     * 新建行（`saved` 为 undefined / id 为空）**恒为脏**：它还没落盘，总得能保存。
     */
    function draftDirty(draft, saved) {
      if (draft === undefined || draft === null) return false
      if (saved === undefined || saved === null) return true
      if (String(draft.id == null ? '' : draft.id) === '') return true
      const now = draftPayload(draft)
      const then = draftPayload(saved)
      const keys = new Set([...Object.keys(now), ...Object.keys(then)])
      for (const key of keys) {
        if (String(now[key] == null ? '' : now[key]) !== String(then[key] == null ? '' : then[key])) return true
      }
      return false
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
     * 下拉里**实际**要摆的那几档：预设几档，外加当前选中的 `custom`（点柱放大）那一档。
     *
     * 为什么非要这一支（loglens D04，同一判据在「来源」下拉上栽过）：`<select value={x}>` 在没有任何
     * 选项的 value 等于 `x` 时，浏览器会**回落显示第一项**——于是下拉写着「最近 15 分钟」，而真正
     * 发出去的是一段自定义窗口。那是源码里看不见的谎。所以选中的档必须真的在选项里。
     *
     * `custom` 只在自己**正被选中**时补进去：它不是用户能挑的一档（没有「自定义」这个预设，
     * 只有「点某根柱放大到那一段」这个动作），凭空摆一个空的自定义项等于给一个点了没反应的入口。
     */
    function windowChoices(preset) {
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
    function windowRange(preset, nowMs) {
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
    function emptyQuery() {
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
    function levelChoices() {
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
    function levelFilterOf(draft) {
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
    function levelFiltered(draft) {
      return levelFilterOf(draft) !== ''
    }

    /**
     * 一段明确的窗口能不能用：空串表示可以，否则是 i18n 键名后缀（badWindow）。
     *
     * 判据只有「两端都是有限数、且 to 晚于 from」——单位与上限由宿主判（别在浏览器侧复制一套
     * 会漂的规则），这里挡的是**形状不对**：那种窗口发出去要么被宿主打回，要么更坏——被当成
     * 「没给窗口」兜底成最近 15 分钟，于是界面写着「自定义」而查的是别的时段（D04 那一类）。
     */
    function windowProblem(window) {
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
    function zoomToBar(draft, barTs, barStepMs) {
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
    function unzoomQuery(draft, from) {
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
    function queryProblem(draft, targetCount) {
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
    function queryPayload(draft, targets, nowMs) {
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
    function querySignature(draft) {
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
    function queryStale(draft, lastRun) {
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

    /* ============================ 行上的标签（P6 第六刀） ============================ */

    /*
     * 行的 `labels` / `raw` **早就随 `/query` 响应回来了**（`SearchOutcome.lines` 直接透传），面板却一行
     * 都没渲染——于是「这行是谁写的」（`container.name` / `host.name` / `log.file.path`）在卡片里根本
     * 看不到，想按它筛还得先去填「分组字段」再看榜，三步。这一节把「行上该摆哪几个标签、摆成什么样」
     * 的判据从组件闭包里拿出来（规矩 ②：要判对错的逻辑留在闭包里等于没有测试入口）。
     */

    /** 行上直接摆出来的标签最多几个（其余的点「＋N」在浮层里看）。 */
    const ROW_LABEL_MAX = 3

    /** 单个标签值在行上显示的长度上限（与 `src/line.ts` 的 `LABEL_VALUE_MAX` 同一口径，多留 40 给省略号）。 */
    const ROW_LABEL_VALUE_MAX = 160

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
    function rowLabels(line, max) {
      const limit = Number.isFinite(max) && max > 0 ? Math.floor(max) : ROW_LABEL_MAX
      return labelRows(line).slice(0, limit)
    }

    /**
     * 这一行的**全部**有值标签（「＋N」浮层用）——与 `rowLabels` 同一条判据，只是不设上限。
     */
    function allRowLabels(line) {
      return labelRows(line)
    }

    /**
     * 这一行还有几个标签没摆出来（「＋N」）。
     *
     * 数的口径与 `rowLabels` **同源**（两者都走 `labelRows`）：只数**有值的**。空值那些本来就不该
     * 占位——把它们算进来，行尾就会写「还有 2 个」，而点开浮层只有两行空值，那句话就成了假的。
     */
    function rowLabelOverflow(line, max) {
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
    function levelTone(level) {
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
    function lineTitle(line) {
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
    function rowFilterProblem(label) {
      if (label === null || label === undefined || typeof label !== 'object') return 'needFilterField'
      return filterProblem(label.field, label.value)
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
    function sortKeys() {
      return ['time', 'level', 'message']
    }

    /** 把排序请求收成能用的那一档：不认识的一律回原序（`time`）。 */
    function sortKeyOf(key) {
      const value = String(key == null ? '' : key)
      return sortKeys().includes(value) ? value : 'time'
    }

    /**
     * 这一页按哪一档排（返回**新数组**，不改入参）。
     *
     * 空 / 单行原样返回：没有必要为一页 0 行造一个新数组（也不会在渲染里白白换一次引用）。
     */
    function sortLines(lines, key) {
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
    function histogramScale(bars) {
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
    function histogramPeakTs(bars) {
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
    function histogramBucketClock(ts, stepMs) {
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
    function histogramAxis(bars, from, to, maxTicks) {
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
    function formatTickTime(ts, spanMs) {
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

    /* ============================ 查询串的示例（第三十三刀） ============================ */

    /**
     * 查询框旁边给哪些**可点的例子**。
     *
     * 为什么要有它（2026-10-18 用户原话）：「Lucene 查询串我不会写，你教我」。教一次不够——
     * 下次换个人还是不会。而查询串这块的真实门槛不是「语法难」，是**这支方言到底认什么**：
     * Kibana 的 Discover 默认是 KQL（`error and timeout`），我们这里是 Lucene
     * （`error AND timeout`）——同一件事两套写法，写错了不报错、只是数字不对。
     *
     * 所以这里只给**这一支方言真的认的**那几条，每条一个最小例子：
     *   - Lucene（ES / OpenSearch 的 `query_string`）：**大写** `AND` / `OR` / `NOT` 才是运算符
     *     （小写会被当成普通词）、空格分隔的词默认是「或」、`-词` 是排除、引号是短语、
     *     `字段:值` 是限定字段、`字段:*` 是「有值」。
     *   - LogQL（Loki）：`{标签="值"}` 选流、`|= "字"` 行内过滤。
     *   - 不认识的方言回空数组（别给一个点了会报错的例子）。
     *
     * **这一条曾经写错过，别再犯**（第三十四刀）：原来的「且」那条给的是 `error+timeout`，
     * 依据是一次**读错了的**实测——`error AND timeout` 回 0 条，就被当成「AND 不是运算符」。
     * 真相是那两个词在那一小时里根本**不共现**，0 是正确答案。`+` 粘在两个词中间其实只是个
     * 分隔符（与空格同义，也就是「或」），所以那条例子点下去得到的是**并集**，标签却写着「且」。
     *
     * 判据要靠**算术自洽**，不能靠单个数字：取 |A|、|B|、|A∪B| 反推交集 |A∩B| = |A|+|B|-|A∪B|，
     * 再看 `A AND B` 是不是等于它。2026-10-18 真机实测（同一窗口）：
     * 1016 + 1284 − 1789 = 511，而 `error AND failed` 回 511、`error+failed` 回 1789（= 并集）。
     *
     * 每条是 `{ id, sample }`：`id` 只用来做 React key 与 title 的 i18n 键（不翻示例本身——
     * **示例是代码不是文案**，翻成中文就没法点进去跑了）。
     */
    function querySamples(kind) {
      if (kind === 'elasticsearch' || kind === 'opensearch') {
        return [
          { id: 'term', sample: 'error' },
          { id: 'phrase', sample: '"Failed to"' },
          // 大写 AND；粘连的 `+` 不是「且」（见上面那段实测），别写回来
          { id: 'and', sample: 'error AND failed' },
          { id: 'field', sample: 'stream:stderr' },
        ]
      }
      if (kind === 'loki') {
        return [
          { id: 'stream', sample: '{job="app"}' },
          { id: 'filter', sample: '{job="app"} |= "error"' },
          { id: 'not', sample: '{job="app"} != "debug"' },
        ]
      }
      return []
    }

    /** 分组字段能不能提交：空串表示可以，否则是 i18n 键名后缀（needGroupBy）。 */
    function groupProblem(field) {
      return String(field == null ? '' : field).trim() === '' ? 'needGroupBy' : ''
    }

    /* ============================ 查询串里的字段名补全（第三十四刀） ============================ */

    /**
     * 查询串的哪一段**是字段名**（光标处正在打的那个词），以及它前面那句别的内容。
     *
     * 为什么要有它：面板里这个来源列出 **92 个字段**（真机 `/fields` 实测；`_field_caps` 打整个
     * 集群是 1657 条，去掉 `.keyword` 重复行与 object 行剩 1274——**但面板只列这个来源自己的索引**，
     * 所以候选是 92 条。这个数字别照抄全集群那份）。最长那个 108 字符：
     * `payload.elasticsearch.node_stats.indexing_pressure.memory.current.combined_coordinating_and_primary_in_bytes`。
     * 更要紧的是**打错一个下划线就是静默 0 条**——ES 对不存在的字段不报错，真机实测：
     *
     *     container_name:prometheus  → 0 条     ← Kibana 截图里那种写法
     *     container.name:prometheus  → 240 条   ← 这台集群的真实名字
     *
     * 所以补全不是「锦上添花」，它防的是一种**看得见结果、看不出错**的故障。
     *
     * 判据（Lucene 的 `字段:值` 形状，只认这一种，不做完整词法分析）：
     *
     *   - 从查询串**开头**一路扫到光标，取**最后一个还没合上的词**（空白 / `(` / `)` 分隔）；
     *     `AND` / `OR` / `NOT` 这些运算符也是词，但它们后面必然跟一个新词，所以它们自己
     *     不会被当成字段名（见下面 `FIELD_COMPLETION_MAX_PREFIX`）。
     *   - 那个词里**已经出现过 `:`** → 光标在**值**那一侧，不在本函数职责内，回 `null`
     *     （值候选要按字段拉聚合，是另一件事；这一刀只补字段名）。
     *   - 词尾是 `*` / `~` / `/`（通配、模糊、正则）或词里有引号 → 这是**值**的写法，回 `null`。
     *   - 剩下的是**字段名候选词**：`field` = 已有的那段前缀（用来查候选），`start` 是它在
     *     整个查询串里的起始下标——**界面据此替换这一段**，而不是把候选接到末尾
     *     （否则在句子中间补全会把后面的东西顶掉）。
     *
     * `start` / `end` 都按**光标前**算（`end` 恒等于光标位置）。光标之后的内容不动。
     * 拿不到光标位置（老浏览器 / 桩环境）时按「查询串末尾」算——那是**打字时**的常态。
     *
     * 回 `null` 表示「此刻不该给字段候选」（光标不在一个字段名上）。回空串 `field` 是
     * **合法的**：句首、或者刚打完 `AND ` 之后，这时候该把所有字段列出来。
     */
    function fieldCompletion(query, caret) {
      const text = String(query == null ? '' : query)
      const at = Number.isInteger(caret) && caret >= 0 && caret <= text.length ? caret : text.length
      const before = text.slice(0, at)
      // 光标前最后一个还没合上的词的起点：从光标往回找到空白或括号
      let start = before.length
      while (start > 0) {
        const ch = before.slice(start - 1, start)
        if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '(' || ch === ')') break
        start -= 1
      }
      const word = before.slice(start)
      // 已经是「字段:值」的形状：光标在值那一侧
      if (word.includes(':')) return null
      // 值的写法（通配 / 模糊 / 正则 / 引号）：这些不是字段名
      if (word.includes('"') || word.endsWith('*') || word.endsWith('~') || word.includes('/')) return null
      /*
       * 运算符本身不是字段名。判据是**大写**（小写 `and` 在 Lucene 里是普通词，是用户真在找的字，
       * 不能吞掉——真机实测 `error and failed` 回 4505 条，那是把 `and` 当词在搜）。
       */
      if (word === 'AND' || word === 'OR' || word === 'NOT') return null
      // 排除前缀 `-field`：`-` 是运算符，候选要替换的是它**后面**那段
      const lead = word.startsWith('-') ? 1 : 0
      return { field: word.slice(lead), start: start + lead, end: at }
    }

    /**
     * 把光标处那段字段名换成选中的字段（`replacement`），并给出**补完之后的光标位置**
     * （紧跟在那个 `:` 之后——选完字段的下一件事必然是打值，光标停在冒号前就等于让人再挪一次）。
     *
     * 原位替换：只换 `start..end` 这一段，前面的运算符、后面的值都不动。
     */
    function fieldCompletionApply(query, pick, replacement) {
      const text = String(query == null ? '' : query)
      const name = String(replacement == null ? '' : replacement)
      if (pick === null || pick === undefined || name === '') return { q: text, caret: text.length }
      const start = Number.isInteger(pick.start) ? pick.start : text.length
      const end = Number.isInteger(pick.end) ? pick.end : text.length
      const head = text.slice(0, start)
      const tail = text.slice(end)
      const inserted = name + ':'
      return { q: head + inserted + tail, caret: (head + inserted).length }
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
     * 补全的候选：**前缀优先、子串次之**，条目数有上限。
     *
     * 为什么不直接用 `fieldChoices`（真机上这就是差别）：它是**子串**匹配，那对「点一下看有哪些
     * 字段」是对的，但对补全是错的——光标前正打着 `cont`，`host.containerized` 也是一条子串命中，
     * 于是 92 个字段里有 **62 条**候选，第一条才是 `container.name`。补全这时候要的是「我正要打的
     * 那个名字」，前缀才说明这件事；子串命中留着（`name` → `host.name` 是真想要的），但排在后面。
     *
     * 三条判据：
     *   - **前缀命中的排在子串命中的前面**（两组内部都保持宿主给的顺序，不重排——顺序是结论）；
     *   - **大小写不敏感**（字段名本身大小写有意义，但人打字不该被它绊住）；
     *   - **有上限**（`limit`，默认 `FIELD_COMPLETION_MAX`）：浮层是打字时闪出来的东西，几十条候选
     *     既看不完也挡视线。上限之外直接不画，与「命中 0 个不画」同一条判据——不假装全给了。
     */
    const FIELD_COMPLETION_MAX = 20

    function fieldCompletionChoices(fields, typed, limit) {
      const needle = String(typed == null ? '' : typed).trim().toLowerCase()
      const cap = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : FIELD_COMPLETION_MAX
      const prefix = []
      const middle = []
      for (const item of Array.isArray(fields) ? fields : []) {
        if (item == null) continue
        const name = String(item.name == null ? '' : item.name)
        if (name === '') continue
        const lower = name.toLowerCase()
        if (needle === '') prefix.push({ name })
        else if (lower.startsWith(needle)) prefix.push({ name })
        else if (lower.includes(needle)) middle.push({ name })
        if (prefix.length >= cap) break
      }
      return [...prefix, ...middle].slice(0, cap)
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

    /**
     * 「这份容器清单属于谁」的缓存键：loglens 来源 id + Docker 目标名（空串 = 让 Docker 面板自己回落）。
     *
     * 为什么要有键（2026-10-14 面板改成**自动拉**容器，不再有点按钮那一步）：自动拉必须自己回答
     * 「现在这份清单还算不算数」——换来源、换 Docker 目标都要重拉（不同机器上的容器当然不一样），
     * 同一个目标不能每渲染一次就拉一次。缓存与在途判据都按它比（配合 `fieldFetchNeeded` 那条「不同才拉」）。
     * 拿不到 id（还没选来源）回空串：**空键永远不算「已缓存」**，也就不会有请求打出去。
     */
    function containersKey(draft) {
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
    function containerSlotState(options) {
      const source = options === undefined || options === null ? {} : options
      if (source.available !== true) return 'default'
      if (Number.isFinite(source.count) && source.count > 0) return 'default'
      if (typeof source.error === 'string' && source.error !== '') return 'error'
      if (source.busy === true || source.pending === true) return 'loading'
      return 'empty'
    }

    /** Docker 面板那条路径的 since 取值：直接复用时间窗预设（docker --since 认 15m / 1h 这类写法）。 */
    function dockerSince(preset) {
      const keys = WINDOW_PRESETS.map((item) => item.key)
      return keys.indexOf(preset) === -1 ? '1h' : preset
    }

    /**
     * 容器候选：按输入收窄（**前缀优先、子串次之**），保持清单原顺序。
     *
     * 为什么要有它（第三十九刀，用户截图）：容器下拉原来是原生 `<select>`，真机上有十几个容器
     * （`app-svc-1` / `app-svc-3` / `app-svc-8` / `worker` / `batch-job-a` / …）。
     * 原生弹层**高度不受控**（铺满整个面板）、**不能搜**、**不能改样式**——找 `batch-job-a`
     * 只能靠滚。
     *
     * 收窄规则与字段补全（`fieldCompletionChoices`）**同一条**：前缀命中的排前面，子串次之，
     * 大小写不敏感，保持入参顺序不重排。两处共用同一种「打字找人」的手感，用户不用学两套。
     *
     * 每一项回 `{ id, label }`：`label` 已经是**要显示的名字**（有 name 用 name，没有退回 id），
     * 判定留在这里而不是界面上——界面只负责画。
     */
    function containerChoices(containers, typed) {
      const needle = String(typed == null ? '' : typed).trim().toLowerCase()
      const prefix = []
      const middle = []
      for (const item of Array.isArray(containers) ? containers : []) {
        if (item == null) continue
        const id = String(item.id == null ? '' : item.id)
        if (id === '') continue
        const label = item.name === undefined || item.name === null || item.name === '' ? id : String(item.name)
        // 名字与 id 两边都能搜：真机上用户既可能记得 `app-svc-3`，也可能只记得短 id
        const haystack = (label + ' ' + id).toLowerCase()
        const row = { id, label }
        if (needle === '') prefix.push(row)
        else if (label.toLowerCase().startsWith(needle) || id.toLowerCase().startsWith(needle)) prefix.push(row)
        else if (haystack.includes(needle)) middle.push(row)
      }
      return [...prefix, ...middle]
    }

    /**
     * 一批 Docker 日志是「按什么条件」拉的：`容器|时间窗|行数`。
     *
     * 用在两处：拉的时候记下来，渲染时与当前条件比——不一致就说明屏幕上这份是**上一次**的。
     * 为什么要把三个条件拼成一个串而不是分别比：三者任何一个变了，那份日志就不再是当前条件的答案；
     * 而「是不是同一份」这件事只在一个地方用（判 stale），没必要拆成三个状态去同步。
     */
    function dockerRunKey(container, preset, tail) {
      const name = String(container == null ? '' : container)
      const window = String(preset == null ? '' : preset)
      const lines = String(tail == null ? '' : tail)
      return name + '|' + window + '|' + lines
    }

    /** 屏上那份 Docker 日志是不是**当前条件**的（条件改了它就是上一次的）。 */
    function dockerStale(runKey, container, preset, tail) {
      const ran = String(runKey == null ? '' : runKey)
      if (ran === '') return false
      return ran !== dockerRunKey(container, preset, tail)
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

    /* ============================ 字段侧栏与结果表列集（P8-乙） ============================ */

    /**
     * 结果表能加的额外列上限。
     *
     * 为什么有上限：行是 flex（正文 `flex:1`），每加一列都在抢同一行宽度；四列之后窄卡片里正文会先被
     * 挤到看不清。宁可在「加不动」时明说一句，也不让人自己加到一个看不出东西的表。
     */
    const RESULT_COLUMN_MAX = 4

    /** 侧栏一个分区最多渲染多少行（再多就靠子串过滤收窄；界面报「共 N 个」）。 */
    const FIELD_LIST_MAX = 200

    /**
     * 这一页的标签字段使用情况：`[{ name, count }]`，count = 这一页里带这个字段的行数。
     *
     * 为什么只数**这一页**：行模型里只有 labels 随响应回来（其余字段没有逐行值），而这一页被
     * `limit` 截断过——界面上必须写「本页」，不能让人读成「全窗口」。排序：出现次数降序、同次数按
     * 名字（稳定顺序，不随对象键顺序漂）。
     */
    function pageFieldUsage(lines) {
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
    function fieldLeaf(name) {
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
    function fieldParent(name) {
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
    function fieldFilterTerms(text) {
      const words = String(text == null ? '' : text).toLowerCase().split(/\s+/)
      return [...new Set(words.filter((word) => word !== ''))]
    }

    /** 一个字段名是否命中**全部**词（每个词都是一段子串；空词表 = 全命中）。 */
    function fieldMatches(name, terms) {
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
    function groupFieldsByParent(items) {
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
    function fieldSections(fields, usage, filterText) {
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
    function columnToggle(columns, field) {
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
    function resultColumnsTemplate(columns) {
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
    function columnValue(line, field) {
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
    const RAW_PREVIEW_MAX = 20000
    function rawPreview(raw, max) {
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
    function panelPlacement(anchor, options) {
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
    const FIELD_PANEL_CEILING = 520
    function fieldPanelHeight(vh) {
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
    const FIELD_PANEL_WIDTH = 340

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
    function fieldNameBreaks(name) {
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
    function valueChoices(field, buckets, active, limit) {
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
    function choiceMove(current, delta, length) {
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
    function filterFieldChoices(sections, typed, limit) {
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
    function filterBoxBack(field, value) {
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
    const FIELD_VALUES_SIZE = 8
    /** 画出来的上限（与请求数一致；后端要是多给了，多的不画）。 */
    const FIELD_VALUES_MAX = 8

    /**
     * 取某个字段 top 值的请求体：与榜（`groupPayload`）**同一个信封**，只多一个 `size`。
     *
     * 信封相同不是巧合——它保证「值」与「行」「分布」画的是**同一个子集**（同一个窗口、同一个查询串、
     * 同一份筛选），见 `facetsEnvelope` 那段注释。窗口回显不全就返回 null，不发畸形请求。
     */
    function fieldValuesPayload(draft, outcome, field, size) {
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
    function fieldValuesKey(draft, outcome, field) {
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
    function valueBars(buckets, limit) {
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
    function columnPickState(columns, field) {
      const list = Array.isArray(columns) ? columns : []
      const name = String(field == null ? '' : field)
      if (name === '') return 'bad'
      if (list.indexOf(name) !== -1) return 'picked'
      if (list.length >= RESULT_COLUMN_MAX) return 'limit'
      return 'ok'
    }

    /* ============================ 正文里的命中高亮（第三十五刀） ============================ */

    /**
     * 把「正文 + 命中区间」切成可以直接渲染的几段：`[{ text, hit }]`。
     *
     * 区间由**后端**给（ES 的 `highlight`，见 src/backends/elastic.ts 的 `highlightRanges`）——
     * 界面**不自己拿查询串去正文里找**。理由：查询串是 Lucene，`stream:stderr` 里没有半个字
     * 出现在正文、`-failed` 是排除、`error*` / `~` / 短语各有各的规则。照字面标会错一半，
     * 而**标错比不标更坏**（用户会以为那是引擎认出来的命中）。
     *
     * 这一层只做三件防御性的整理（后端已经保证升序、不重叠、不越界，但界面不该依赖那个）：
     *   - 越界 / 空区间丢掉；不升序就**整体放弃**（顺序错了画出来是乱的，宁可不标）；
     *   - 相邻/重叠的合并（`error` 与 `er` 命中同一段时不该画两层）；
     *   - 返回的段拼起来必须**正好等于原文**（否则回一段纯文本：不许因为高亮丢字）。
     *
     * 没有区间、区间畸形、空正文 → 返回 `[{ text: message, hit: false }]`（一个纯文本段）。
     */
    function messageSegments(message, ranges) {
      const text = String(message == null ? '' : message)
      const whole = [{ text, hit: false }]
      if (text === '') return whole
      const clean = []
      let previous = -1
      for (const item of Array.isArray(ranges) ? ranges : []) {
        if (!Array.isArray(item) || item.length < 2) return whole
        const start = Number(item[0])
        const end = Number(item[1])
        if (!Number.isInteger(start) || !Number.isInteger(end)) return whole
        if (start < 0 || end > text.length || end <= start) return whole
        // 必须严格升序（后一段的起点要大于等于前一段的终点）
        if (start < previous) return whole
        const last = clean[clean.length - 1]
        if (last !== undefined && start <= last[1]) {
          last[1] = Math.max(last[1], end)
        } else {
          clean.push([start, end])
        }
        previous = start
      }
      if (clean.length === 0) return whole
      const segments = []
      let at = 0
      for (const [start, end] of clean) {
        if (start > at) segments.push({ text: text.slice(at, start), hit: false })
        segments.push({ text: text.slice(start, end), hit: true })
        at = end
      }
      if (at < text.length) segments.push({ text: text.slice(at), hit: false })
      // 拼回去必须与原文一字不差（高亮不许吞字）
      return segments.map((segment) => segment.text).join('') === text ? segments : whole
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
      '.ll_panelTitle{margin:0;font-size:15px;font-weight:500;line-height:22px;white-space:nowrap;flex:none}',
      // 标题右侧那句「2 个来源 · 已启用」：收起来源列表之后，来源还剩几个是**唯一**要一直看得见的事
      '.ll_panelSummary{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
      /*
       * 「编辑来源」那颗展开/收起入口（第十五刀）。
       *
       * 为什么要有它：真机 816×782 量到面板总高 1055px，其中来源配置区（说明 + 新增 + 两行表单）
       * 占 ~300px（28%）——而查日志的时候那一片基本不动。收起之后整块只剩一行，查询与结果能进首屏。
       *
       * 类名刻意**不带 `btn`**（与 `ll_rowToggle` / `ll_fieldAct` 同一条：按钮族几何检查按 /btn/i
       * 抓类名，这是一颗行内的折叠把手，几何本来就不是按钮族那套 H28/R-sm）。
       */
      '.ll_sourcesToggle{box-sizing:border-box;display:flex;align-items:center;gap:6px;width:100%;height:26px;padding:0 4px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:12px;line-height:18px;text-align:left;cursor:pointer}',
      '.ll_sourcesToggle:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.ll_sourcesToggle:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}',
      // 收起时把整块压成一行：展开态才有的间距写在 .ll_sourcesBody 上，收起态一点不留
      '.ll_sourcesBody{display:flex;flex-direction:column;gap:12px}',
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
      /*
       * 列头与来源行**必须是同一套列宽**，否则表头对不上它下面那一列。
       *
       * 真机量到的问题：「地址」表头在 x=790、它下面的输入框在 x=753，差 **37px**。
       * 根因是两个**独立**的 grid（`.ll_head` 与每个 `.ll_row` 各算各的），动作位原来写 `auto`：
       * 行里那两个按钮有宽度（44 / 46），列头里那两个空格是 0 —— 于是前三列被推歪。
       *
       * 所以动作位改成**有下限的固定区间** `minmax(44px,72px)`：
       *   - 下限 44 = 中文「保存」的实测宽度，短文案不会被压到折行；
       *   - 上限 72 ≥ 英文 `Saving…` / `Remove` 的实测宽度（67），换语言也不会溢出；
       *   - 两处写同一个区间 → 两个 grid 算出同一套列宽，表头自然对齐。
       *
       * 第一列（类型）从 120~140 加宽到 150~168：真机量到最长的选项「Docker（采集来源）」
       * 文字就要 **121px**，加上左右内边距 24 与原生下拉箭头约 20 = **165px**，压在 140 里
       * 必然被切成 `Docker（采集...`（截图里就是这样）。别的选项都没这么长，但**列宽得照顾最长的那一个**。
       *
       * 这份清单在下面 `.ll_row` 里**再写一遍是有意的**：两处并排放着最容易看出它们该一致，
       * 改动时必须成对改（`scripts/client-smoke.mjs` 有一条用例量对齐）。
       */
      '.ll_head{display:grid;grid-template-columns:minmax(168px,180px) minmax(140px,1.4fr) minmax(180px,2fr) minmax(44px,72px) minmax(44px,72px);gap:8px;align-items:center;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;padding:0 10px}',
      // 行内四列 + 两个动作位。输入档对齐宿主 settings-form 的 .input（H34 / R12 / border-l4 /
      // bg-layer-3 / 13px）：显式 height 是关键——同一个类套到 <select> 上时 Chrome 不看继承的
      // line-height，没有它就会比同排的 <input> 矮 2px；圆角取 token 而非 8px 字面量。
      /*
       * 行：四列 + 两个动作位。
       *
       * 第三十七刀把 `align-items` 从 `center` 改成 `start`：ES / OpenSearch 行多一格
       * 「索引表达式」，那一格竖着放两个输入框，行因此比 Docker 行高一倍（真机量到 92px vs 52px）。
       * 居中会让**保存 / 删除悬在整行的半空中**，离它真正要操作的那一对输入框很远（真机截图里
       * 那两个按钮就漂在地址与索引之间）。改为顶部对齐之后，按钮与第一行输入框同一条基线；
       * 多出来的高度落在最后一格下面，是那一格自己的事。
       */
      '.ll_row{display:grid;grid-template-columns:minmax(168px,180px) minmax(140px,1.4fr) minmax(180px,2fr) minmax(44px,72px) minmax(44px,72px);gap:8px;align-items:start;background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);padding:8px 10px}',
      // 动作按钮在顶部对齐时也要与输入框（H34）同高对齐，否则它比输入框矮 6px、看着是「贴在上边」
      '.ll_row>.ll_btn,.ll_row>.ll_btnGhost{align-self:start;height:34px}',
      /*
       * URL 与索引表达式竖着放一格。
       *
       * **两个都是 H34 的输入框**，但原来它们同高同级、看不出主次：地址是必填的那一件，
       * 索引表达式是可留空的补充。现在索引那一格矮一档（H28），既省下行高，也让
       * 「上面那格才是主要的」一眼能看出来。
       *
       * **字号不动**：`.ll_input` 的 13px/1.5 是宿主的输入档，单独给这一格改字号会破坏那一档的
       * 配对（守卫当场就拦了）。高度的差本身已经足够说明主次。
       */
      '.ll_stack{display:flex;flex-direction:column;gap:6px;min-width:0}',
      /*
       * 索引那一行（第二行）：一个**行内小标签** + 输入框。
       *
       * 标签是必需的，不是装饰：空了有占位符撑语义，填上 `app-logs-*` 之后就没有任何东西
       * 说明这一格是什么了。地址那行有列头「地址」管着，而列头盖不住第二行。
       *
       * 输入框自己矮一档（H28）：地址是必填的主字段、索引是可留空的补充，
       * 高度差就是主次差（字号不动——`.ll_input` 的 13px/1.5 是宿主输入档，改了会破坏配对）。
       */
      '.ll_indexRow{display:flex;align-items:center;gap:6px;min-width:0}',
      '.ll_indexLabel{flex:none;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}',
      '.ll_indexRow>.ll_input{flex:1 1 auto;min-width:0;height:28px}',
      // text-overflow: 下拉/输入框都只有这么宽，装不下时**硬切**会切掉半个字（真机：占位项被原生
      // 箭头切了一半）——省略号至少说明「后面还有」。原生 `<select>` 也认这条（Chrome / Firefox）。
      '.ll_input{box-sizing:border-box;width:100%;height:34px;padding:0 12px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3);border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);outline:none;font-family:inherit;font-size:13px;line-height:1.5;text-overflow:ellipsis}',
      '.ll_input:focus{border-color:var(--dsw-alias-state-business-primary)}',
      '.ll_input::placeholder{color:var(--dsw-alias-label-tertiary)}',
      '.ll_input:disabled{opacity:.5;cursor:not-allowed}',
      '.ll_empty,.ll_loading{text-align:center;color:var(--dsw-alias-label-tertiary);padding:24px 12px;font-size:12.5px;line-height:18px}',
      '.ll_error{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;margin:0;white-space:pre-wrap}',
      '.ll_ok{color:var(--dsw-alias-state-success-primary);font-size:12px;line-height:18px;margin:0}',
      /*
       * `.ll_query` 是个**列向 flex**，它的子项默认 `align-items: stretch` —— 于是「下一页」那颗
       * `ll_btnGhost` 被拉成整行 928px（真机 2026-10-17 量到：一颗按钮横跨整个面板，比结果表还宽）。
       * 这里把默认对齐改成 `flex-start`：子项按自己的内容宽排；要占满整行的那些（grid 行、
       * 结果区、提示段）本来就写了 `width:100%` / 是 grid，不受影响。
       */
      '.ll_query{display:flex;flex-direction:column;align-items:flex-start;gap:10px;border-top:.5px solid var(--dsw-alias-border-l1);padding-top:12px}',
      '.ll_query>*{width:100%}',
      // 「下一页」是这一列里唯一一颗**不该**占满整行的按钮（它是结果列表的续页入口，不是一行内容）
      '.ll_query>.ll_btnGhost{align-self:center;width:auto}',
      /*
       * 查询区两行（第十五刀）：**主行**（来源 · 查询串 · 查询）与**选项行**（时间窗 · 级别 · 条数 · 分组字段 · 分组）。
       *
       * 改之前是一行五格 + 一行分组：真机 816×782 上量到查询串那格只有 **160px**（约 12 个汉字），
       * 而它是这个面板里唯一需要打长串的地方（Lucene 表达式）；同一行里还塞着三项不改也能查的参数。
       * 现在把「随时会改的那一格」独占剩余宽度（1fr），参数挪到第二行——两行加起来比原来两行
       * 还矮（原来分组行右半边 300px 是空的，见下面 .ll_groupGrid 的注释）。
       */
      '.ll_queryGrid{display:grid;grid-template-columns:minmax(110px,130px) minmax(160px,1fr) auto;gap:8px;align-items:center}',
      /*
       * 查询串的字段名补全浮层（第三十四刀）。
       *
       * 这一格**不复用** `.ll_pick`：那个类名在冒烟里是「分组候选那一格」的定位依据
       * （`hasClass(node, 'll_pick')` 恰好一处），复用它会让那条用例变成两个候选。
       * 需要的只有一条：`position:relative`，好让候选浮层贴着自己的边开。
       *
       * 浮层**和这一格同宽**：补全的候选就是这一格在填的内容，浮层比格子宽或窄都会看着像
       * 另一个东西。`z-index` 压过下面的选项行与结果区——它是一条**临时**浮层（打完字就消失），
       * 被底下的东西盖住等于没画；100 与分组框那个候选浮层同一个层级。
       */
      '.ll_qPick{position:relative;min-width:0}',
      '.ll_containerPick{min-width:0}',
      '.ll_qList{left:0;right:0}',
      /*
       * 查询串的可点例子（第三十三刀）：一行小胶囊，尺寸跟着**筛选芯片**那套走
       * （H22 / 12px 18px / radius-md）——它俩在视觉上是一类东西（「点一下就填进去的一段文本」），
       * 长得不一样只会让人以为它们做的事不一样。
       */
      '.ll_querySamples{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:-2px}',
      '.ll_querySamplesLabel{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}',
      '.ll_sampleChip{appearance:none;box-sizing:border-box;height:22px;padding:0 8px;border:.5px dashed var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:transparent;color:var(--dsw-alias-label-secondary);font-family:var(--ds-font-family-code);font-size:11px;line-height:16px;white-space:nowrap;cursor:pointer}',
      '.ll_sampleChip:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l4);color:var(--dsw-alias-label-primary)}',
      '.ll_sampleChip:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-1px}',
      '.ll_sampleChip:disabled{opacity:.4;cursor:not-allowed}',
      /*
       * 选项行 = 时间窗 · 级别 · 条数 · 分组字段 · 「分组」。
       *
       * 分组那一行原来是**独立的一行**，模板 `minmax(180px,2fr) auto minmax(0,1fr)`：第三列是留给
       * 「一句回话」的，而实际上没有任何东西放进去——真机量到那一片永远空着 ~300px（三列里最宽的一列
       * 是空的）。合并进这一行之后，分组字段拿 1fr，空列消失，还省掉一整行的行高。
       *
       * 时间窗那一列从 96px 起步是因为这里放的是「最近 1 小时」这种 5.5 个汉字宽的文案：
       * 96px 减去左右内边距与原生箭头只剩 ~52px 文字区，它会被切成「最近 1 小…」（真机读数）。
       */
      '.ll_groupGrid{display:grid;grid-template-columns:minmax(120px,136px) minmax(96px,120px) minmax(64px,84px) minmax(120px,1fr) auto;gap:8px;align-items:center}',
      // Docker 那一档自成一行（容器 · 时间窗 · 条数 · 刷新 · 看日志）：五格，别去套上面那两套模板
      /*
       * Docker 那一行（第三十八刀重排）。
       *
       * 原来两个动作位写 `auto`，于是在 872px 的卡片里：「刷新」被撑到 **248px**、「看日志」
       * 被撑到 **258px**——两个按钮吃掉整行 58% 的宽度，而真正要选的**容器只有 130px**
       * （容器名比按钮文字更需要宽度）。真机量到的就是这个。
       *
       * 现在：容器那一列给足（它装的是 `container.name`，最长的一种内容），时间窗/行数各自够用，
       * 两个动作位**按内容收缩**（`auto` 但放在 `1fr` 之后，让伸缩全落在空白上）。
       */
      '.ll_dockerGrid{display:grid;grid-template-columns:minmax(180px,1.6fr) minmax(110px,130px) minmax(76px,96px) auto auto;gap:8px;align-items:center}',
      /*
       * 元信息行拆两层（第十五刀）：
       *   ① `.ll_queryMeta` = **短句 + 动作**（计数 · 截断 · 提示 · 四颗按钮），一行放得下；
       *   ② `.ll_queryNote` = **长句**（宿主的级别/兜底 warning），一句一行各自排。
       *
       * 为什么拆：改之前它们同在一条 `flex-wrap` 行里，宿主那句 90 字的级别 warning 占了整行，
       * 四颗按钮被挤到第三行——真机量到这一行 **102px**（三行）。同样的字数，分成两层之后
       * 短句那层永远 28px、长句那层按自己的宽度换行，按钮不再被一段散文推走。
       */
      '.ll_queryMeta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
      // 短句（计数 / 截断）与动作（四颗按钮）之间的弹簧：宽度够时把按钮顶到右边，不够时整组一起换行
      '.ll_metaGap{flex:1 1 0;min-width:0}',
      // 长句那一层：一句一行（每句按自己的宽度换行），行距用 gap 而不是 margin，最后一句不留尾巴
      '.ll_queryNote{display:flex;flex-direction:column;gap:2px;font-size:12px;line-height:18px}',
      /*
       * 结果区高度（第十三刀，真机读数）：原来是死数 `max-height:420px`——在 1440×900 的窗口里，
       * 100 行结果只露出 **7 行**（平均行高 61px），而同一屏还要按下方的「字段 / 紧凑 / 清空结果」
       * 与时间分布。改成**视口相对**：窗口越高露得越多，行数不再由一个拍下来的像素数决定。
       *
       * 下限 240px 是「至少还看得见三四行」，上限 70vh 是「不许把下面的分布挤出屏幕」——
       * 两端都是为了让「日志区」与「图」同时在场。
       */
      '.ll_results{display:flex;flex-direction:column;gap:2px;max-height:min(720px,72vh);min-height:300px;overflow-y:auto;font-family:var(--ds-font-family-code)}',
      /*
       * 第十五刀：`min-height` 从 240px 提到 **300px**，上限改成 `min(720px, 72vh)`。
       *
       * 为什么敢抬高下限：这一版把上面三块压掉了一整屏的量级（来源配置收起 ~300px、
       * 元信息 102px→28px、查询行两行合一）。空出来的高度**归结果**——它是这个面板的主体，
       * 240px 只够 3~4 行（真机 11 行/屏时约 60px 一行）。
       *
       * 上限仍是视口相对（72vh）：窗口越高露得越多，但它不许把下面的分布与翻页挤出屏幕。
       */
      /*
       * 结果区：字段面板是**浮层**，结果表永远拿整行宽度（真机反馈两连：常驻占宽度 → 收起后
       * 内联展开还是把正文从 577px 挤到 389px）。浮层绝对定位在结果之上，点面板外 / 再点触发它那颗收起。
       */
      '.ll_workbench{position:relative}',
      /*
       * 浮层那一层（第二十二刀）：面板搬出结果区之后，它需要**一个不生成盒子的容器**。
       *
       * 面板与遮罩都是 `position:fixed`，本身不需要父盒；但这个容器不能白占一格——它的父级
       * `.ll_panel` 是 `gap:12px` 的纵向 flex，插一个零高度的 div 会多出一个 12px 空档。
       * `display:contents` 让这个 div 自己不生成盒子，两个 `fixed` 的孩子照旧贴在视口上。
       */
      '.ll_fieldLayer{display:contents}',
      /*
       * 遮罩（第二十刀）：面板改成 `fixed` 之后，遮罩也得跟着改成**全屏 fixed**。
       *
       * 原来它是 `absolute; inset:0`（铺满结果区那一格）——面板还在结果区里时两者对得上；
       * 现在面板浮到按钮下方、可能盖到元信息行与图上面去，只铺结果区的遮罩就漏了那几块：
       * 点面板上方那片空白不会收起，看着像「点外面没反应」。
       * 层级 99 < 面板 100，所以遮罩铺满整屏也不会挡住面板自己的点击。
       */
      '.ll_fieldScrim{position:fixed;inset:0;z-index:99}',
      '.ll_btnGhostOn{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}',
      /*
       * 带图标的那几颗动作按钮（第十八刀）。
       *
       * `padding` 收到 `0 8px`（原来的 10px 是为纯文字按钮留的呼吸量）：图标占掉一段视觉宽度后，
       * 同样的内边距会让整排变宽——而这一行本来就要与计数挤在同一条线上。
       * `gap` 从 4 加到 6：图标与字之间需要比「字与字」更大的间隔才不糊在一起。
       */
      '.ll_btnGhostIcon{gap:6px;padding:0 8px}',
      // 图标本身：垂直居中、不缩放、不吃鼠标事件（它是标签的一部分，点它应该点到按钮）
      '.ll_actionIcon{flex:none;display:block;pointer-events:none}',
      '.ll_main{display:flex;flex-direction:column;gap:6px;min-width:0}',
      // 有额外列：行改成 grid（列宽见 pure.js resultColumnsTemplate），宽了横向滚动——正文不会被挤没
      '.ll_resultsWide{overflow-x:auto}',
      '.ll_resultsWide .ll_resultTags{max-width:250px}',
      '.ll_columnsHint{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}',
      // 浮层取宿主菜单配方（border:0 + elevation 投影，中性 border 不许配投影）：与字段候选 / 标签浮层同一套
      /*
       * 字段面板（第二十刀重定位）：**从触发它的那颗按钮长出来**，不再是钉在结果区左端的一块。
       *
       * 改前是 `position:absolute;top:0;bottom:0;left:0`：面板贴结果区左边缘，而「字段」按钮在
       * 整行右侧——真机量到两者横向差 **123px**，中间隔着整块结果正文。按的是右边那颗，
       * 展开的东西出现在最左边，这与「读数条钉在左端、柱子在图中间」是同一条毛病（第十七刀）：
       * 能打开它的东西和它本身不在同一处。
       *
       * 现在 `position:fixed` + 由 `fieldsAnchor` 给的视口坐标（判据在 pure.js 的 `panelPlacement`）：
       * **横向对齐触发它的那颗按钮**——元信息行那颗在整行右侧，所以右缘对齐；筛选行那颗在左边，
       * 所以左缘对齐（右对齐会把面板缩回最左边去）。纵向优先贴按钮下沿 4px，下面放不下就上翻。
       * 与「＋N」全部标签浮层同一套路（那个也是 fixed：`.ll_results` 有 `overflow-y:auto`，
       * 画在里面的浮层会被裁掉）。
       *
       * 高度改成 `max-height` 而不是 `top/bottom` 撑满：它现在贴着按钮、不在结果区那一格里了，
       * 撑满会一路垂到屏幕底。
       */
      '.ll_fields{position:fixed;z-index:100;box-sizing:border-box;width:340px;max-width:calc(100vw - 16px);max-height:min(520px,70vh);min-height:200px;display:flex;flex-direction:column;gap:6px;padding:8px;border:0;border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-2);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent)}',
      // 浮层高度跟结果区走：头 / 过滤框 / 脚注**不许被压扁**（只有列表自己滚），否则 420px 里那行说明只剩 2px
      '.ll_fieldsHead{flex:none;display:flex;align-items:baseline;justify-content:space-between;gap:6px}',
      '.ll_fieldsTitle{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;font-weight:600}',
      '.ll_fieldsTotal{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}',
      /*
       * 过滤框那一行（第十九刀）：放大镜 · 输入框 · 清除。
       *
       * 放大镜是**装饰**（`pointer-events:none`），它只是把「这是搜索」这件事在静止状态说出来；
       * 输入框补了左内边距给图标让位。清除只在有内容时出现。
       */
      '.ll_fieldsFilterRow{position:relative;display:flex;align-items:center;flex:none}',
      '.ll_fieldsFilterIcon{position:absolute;left:8px;display:flex;color:var(--dsw-alias-label-tertiary);pointer-events:none}',
      // 有清除按钮时右侧也要让位（否则长字段名会钻到 × 底下）
      '.ll_fieldsFilter{flex:1 1 auto;min-width:0;height:28px;padding-left:28px;padding-right:26px;font-size:12px;line-height:18px}',
      '.ll_fieldsFilterClear{position:absolute;right:4px;display:flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-tertiary);font-family:inherit;font-size:13px;line-height:1;cursor:pointer}',
      '.ll_fieldsFilterClear:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.ll_fieldsFilterClear:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-1px}',
      /*
       * 滚动区（第十九刀）：`padding-right` 从 2px 提到 **4px**——
       * 字段行的右内边距也是 4px，两者不相等时动作列的右边缘会比过滤框**缩进 2px**
       * （真机量到 278 vs 284）：一列按钮看着比上面的输入框短一截。
       */
      '.ll_fieldsScroll{display:flex;flex-direction:column;gap:4px;min-height:0;overflow-y:auto;padding-right:4px}',
      '.ll_fields .ll_hint{flex:none;font-size:11px;line-height:16px}',
      '.ll_hintElide{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}',
      /*
       * 分区（第十九刀）：标题改成**吸附的一行小标头**——90 多个字段滚下去之后，
       * 「我现在看的是『本页命中』还是『其余可用』」原本只能靠回忆（标题早滚出去了）。
       * `position:sticky` 让它钉在滚动区顶部；上边一条发丝线把它与前一段分开。
       */
      /*
       * 分组（第二十一刀）：组头 + 组内的行。组头是**可折叠的按钮**（带 chevron 与计数），
       * 行缩进 12px——一眼看出「这些行属于上面那个父路径」。
       *
       * 类名刻意**不带 `btn`**（与 `.ll_fieldAct` 同一条：按钮族几何检查按 /btn/i 抓类名，
       * 这是行内的小折叠把手，几何本来就不是按钮族那套 H28/R-sm）。
       */
      '.ll_fieldGroup{display:flex;flex-direction:column;gap:1px}',
      '.ll_fieldGroupHead{appearance:none;display:flex;align-items:center;gap:4px;box-sizing:border-box;width:100%;min-height:22px;padding:1px 4px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:11px;line-height:14px;text-align:left;cursor:pointer}',
      '.ll_fieldGroupHead:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.ll_fieldGroupHead:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-1px}',
      // 官方的字号线（10→14）：`font-size` 必须配 `line-height`，漏了 client-lint 会红
      /*
       * 前导槽统一 16px（第二十七刀）：组头的箭头与行里的勾选框**占同一宽度**，
       * 两边才会落在同一条竖线上（真机量到箭头在 199、勾选框在 219，差 20px 就是这么来的：
       * 箭头 10px + gap 4、勾选框 16px + gap 6，缩进还各写各的）。
       */
      '.ll_fieldGroupChevron{flex:none;width:16px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:14px}',
      '.ll_fieldGroupName{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--ds-font-family-code);font-weight:500}',
      '.ll_fieldGroupHeadOpen .ll_fieldGroupName{color:var(--dsw-alias-label-primary)}',
      '.ll_fieldGroupCount{flex:none;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}',
      // 组内的行缩进，与组名对齐（视觉上属于上面那一组）
      /*
       * 组体**不再自己缩进**（第二十七刀）：组头与行都用「padding 4 + 前导槽 16 + gap 4」，
       * 两边自然落在同一条竖线上。原来这里是 padding-left:14px，而行的缩进由它自己再加 4px——
       * 两套数字各写各的，箭头与勾选框就差了 20px。判据是**同一条竖线**，不是「差不多齐」。
       */
      /*
       * 树的层次（第二十九刀）：用户说「展开没有 tree 那种层次效果」。
       *
       * 原来组头与组内的行挨在同一列上（组体只有 1px 的缝），展开与收起在视觉上只是
       * 「多了几行」——看不出谁属于谁。现在组体左侧有一条 **1px 的竖向导轨**（用 border 画，
       * 不占额外元素），并且整体缩进 8px：行相对组头往右退一格，一眼看得出层级。
       * 导轨用 `border-l1`（4% 黑）而不是边框色：它在浅色面板里刚好看得见、又不抢注意力。
       */
      '.ll_fieldGroupBody{display:flex;flex-direction:column;gap:1px;margin-left:8px;padding-left:8px;border-left:.5px solid var(--dsw-alias-border-l1)}',
      /*
       * 已选列（第二十一刀）：面板里那一格列芯片。与结果表上方的芯片同一套外观
       * （`.ll_columnChip` 复用），只是容器换了、多了个标签。
       */
      '.ll_fieldsPicked{flex:none;display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:0 4px;max-height:56px;overflow-y:auto}',
      '.ll_fieldsPickedLabel{flex:none;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}',
      '.ll_fieldSection{display:flex;flex-direction:column;gap:1px}',
      '.ll_fieldSectionTitle{position:sticky;top:0;z-index:1;padding:3px 4px;background:var(--dsw-alias-bg-layer-2);border-bottom:.5px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}',
      '.ll_fieldBlock{display:flex;flex-direction:column;gap:2px}',
      /*
       * 字段行（第十九刀重排）：**三列网格**，不是一条 flex 行。
       *
       * 改前是 `flex`：名字 `flex:1`、计数与两个动作各自 `flex:none`。后果是三个东西**互相对不齐**
       * ——真机量到计数那一列在 18px / 21px 之间跳（`100` / `73` / `72`），动作区 44px，
       * 而名字占掉 204px 里的绝大部分，剩下那点宽度里「列」「筛」被压成两个 21px 的窄条，
       * 扫一列字段时看起来像是名字的一部分，不像能点的东西。
       *
       * 现在：`名字(1fr) · 计数(右对齐定宽) · 动作(定宽)`。三列各就各位，整列读下来是一条直线；
       * 计数有了固定宽度（`minmax(34px,auto)` + 右对齐）就不会左右跳。
       */
      /*
       * 字段行两列（第二十八刀：动作区删了，第三列没东西可放）：名字(1fr) · 计数(右对齐定宽)。
       * 行高 26px 是 `min-height`；真机量到 28 是因为行内最高的是勾选框/动作桶——现在只剩 14px 的
       * 文本，26 就真的落地了。
       */
      '.ll_fieldRow{box-sizing:border-box;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;min-height:26px;padding:1px 4px;border-radius:var(--dsw-radius-sm)}',
      // 选列面板的行被外层 `<label>` 包着：hover / 圆角 / 内边距都归外层，内层让干净（避免双层底色）
      '.ll_fieldPick .ll_fieldRow{padding:0}',
      '.ll_fieldPick .ll_fieldRow:hover{background:transparent}',
      '.ll_fieldRow:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      /*
       * 名字这一格现在是个 <button>（第二十四刀：点它展开 top 值）。要按掉 UA 的按钮外观，
       * 只留文本排版——`font-family` / `font-size` 必须**显式写**（`font:inherit` 会把等宽字体冲掉，
       * 而字段名靠等宽对齐才读得出来）。caret 用文字三角，与 `.ll_rowToggle` 同一套。
       */
      '.ll_fieldNameCell{display:flex;align-items:flex-start;gap:4px;min-width:0}',
      '.ll_fieldName{appearance:none;line-height:14px;flex:1;min-width:0;display:-webkit-box;min-width:0;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow-wrap:break-word;padding:0;border:0;background:none;text-align:left;cursor:pointer;color:var(--dsw-alias-label-primary);font-family:var(--ds-font-family-code);font-size:11px;line-height:14px}',
      '.ll_fieldName:hover{color:var(--dsw-alias-brand-primary)}',
      '.ll_fieldName:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}',
      // 列模式下名字不是开关（面板的职责是选列，不是筛）：不画 hover、不换手型、不吃点击
      '.ll_fieldNameStatic{flex:1;min-width:0;cursor:default}',
      /*
       * 选列面板的一行（第二十六刀）：整行是 `<label>`，点哪儿都算选它。
       * 勾选框在第一格、与组头缩进对齐（12px）；hover 整行变色——清单里这是「可以点」的信号，
       * 而 `cursor:pointer` 只在可点时才给（满员禁用那几行回到默认箭头）。
       */
      '.ll_fieldPick{display:grid;grid-template-columns:16px minmax(0,1fr);gap:4px;align-items:center;min-height:26px;padding:1px 4px;border-radius:var(--dsw-radius-sm);cursor:pointer}',
      '.ll_fieldPick:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.ll_fieldPickOn{background:var(--dsw-alias-interactive-bg-hover)}',
      '.ll_fieldPick:has(.ll_fieldCheck:disabled){cursor:not-allowed;opacity:.5}',
      '.ll_fieldPick:has(.ll_fieldCheck:disabled):hover{background:transparent}',
      /*
       * 选择器必须写成 `input[type=checkbox].cls`（**不带引号**）：闸门的 CSS 解析器在属性选择器
       * 里遇到引号会断错选择器（实测只剩 `].ll_fieldCheck`），于是这条 accent-color 不被算作
       * 「覆盖到了这个复选框」，报 uncovered。不带引号是等价的合法写法，也是宿主自己用的那种。
       */
      'input[type=checkbox].ll_fieldCheck{width:16px;height:16px;margin:0;flex:none;cursor:pointer;accent-color:var(--dsw-alias-brand-primary)}',
      '.ll_fieldCheck:disabled{cursor:not-allowed}',
      '.ll_fieldCheck:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}',
      '.ll_fieldNameStatic:hover{color:var(--dsw-alias-label-primary)}',
      '.ll_fieldName{display:-webkit-box;min-width:0;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow-wrap:break-word;color:var(--dsw-alias-label-primary);font-family:var(--ds-font-family-code);font-size:11px;line-height:14px}',
      '.ll_fieldBadge{flex:none;padding:0 3px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:14px}',
      /*
       * 计数：**右对齐 + 等宽数字**。真机上这一列原来会左右跳（100 / 73 / 72 三种宽度），
       * 一列字段读下去像锯齿；`tabular-nums` 让每个数字占同样宽度，右对齐让个位对齐。
       */
      // 计数：右缘与组头计数**同一条竖线**（第二十八刀）。真机上原来是 429 对 461——
      // 差在一颗「筛」按钮的宽度；动作区删掉之后两处自然对齐，min-width 仍保 30px 防跳。
      '.ll_fieldCount{display:block;min-width:30px;color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:14px;text-align:right;font-variant-numeric:tabular-nums}',
      // 列芯片：说明多出来那几列是什么，× 就是去掉它的入口
      '.ll_columns{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:0 10px}',
      '.ll_columnsLabel{flex:none;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}',
      '.ll_columnChip{display:inline-flex;align-items:center;gap:2px;max-width:220px;padding:0 4px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-label-secondary);font-family:var(--ds-font-family-code);font-size:11px;line-height:16px}',
      '.ll_columnName{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.ll_colRemove{flex:none;width:16px;height:16px;padding:0;border:0;border-radius:var(--dsw-radius-sm);background:none;color:var(--dsw-alias-label-tertiary);font-family:inherit;font-size:12px;line-height:16px;cursor:pointer}',
      // 行首展开箭头（详情 = 全部标签 + 原文）
      '.ll_rowToggle{flex:none;width:14px;padding:0;border:0;background:none;color:var(--dsw-alias-label-tertiary);font-family:inherit;font-size:10px;line-height:16px;cursor:pointer}',
      '.ll_resultItem{display:flex;flex-direction:column;gap:2px}',
      // 额外列：固定基准宽、放不下就省略（不抢正文的 flex:1）
      '.ll_resultCell{flex:0 1 120px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary)}',
      '.ll_rowDetail{display:flex;flex-direction:column;gap:6px;margin:2px 0 6px;padding:8px 10px;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1)}',
      '.ll_detailGrid{display:grid;grid-template-columns:minmax(120px,220px) minmax(0,1fr);gap:2px 8px;font-family:var(--ds-font-family-code);font-size:11px;line-height:16px}',
      '.ll_detailKey{color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere}',
      '.ll_detailValue{color:var(--dsw-alias-label-primary);overflow-wrap:anywhere}',
      '.ll_detailLabel{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}',
      '.ll_detailMsg{max-height:240px;overflow:auto;white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-primary);font-family:var(--ds-font-family-code);font-size:11px;line-height:16px}',
      '.ll_rowRaw{margin:0;max-height:240px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--dsw-alias-label-primary);font-family:var(--ds-font-family-code);font-size:11px;line-height:16px}',
      /*
       * 行 = 时间 · 级别 · 正文 · 标签。**用 flex 不用 grid**：标签列若按 `auto` 量，
       * 它的 max-content（三个 220px 芯片 + 「另有 N 个」）会把正文那列 `minmax(0,1fr)` 挤成
       * **0 宽**——正文于是变成一字一行（真机 1470px 面板上复现）。flex 里正文 `flex:1`，
       * 标签最多拿 38% 且可换行，正文永远分得到剩余宽度；没标签的行（Docker 日志）正文直接占满。
       */
      '.ll_resultRow{display:flex;align-items:baseline;gap:8px;padding:3px 8px;border-radius:var(--dsw-radius-sm);font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary)}',
      '.ll_resultRow{cursor:pointer;border-bottom:.5px solid var(--dsw-alias-border-l1)}',
      '.ll_resultRow:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.ll_resultRowOpen{background:var(--dsw-alias-bg-layer-3)}',
      '.ll_resultTime{flex:none;color:var(--dsw-alias-label-tertiary);white-space:nowrap}',
      '.ll_resultLevel{flex:none;white-space:nowrap}',
      '.ll_resultLevelError{color:var(--dsw-alias-state-error-primary)}',
      '.ll_resultLevelWarn{color:var(--dsw-alias-state-warn-primary)}',
      '.ll_resultLevelInfo{color:var(--dsw-alias-label-secondary)}',
      '.ll_resultLevelMuted{color:var(--dsw-alias-label-tertiary)}',
      '.ll_resultMsg{flex:1 1 0;min-width:0;color:var(--dsw-alias-label-primary);white-space:pre-wrap;word-break:break-word}',
      // 紧凑模式才 clamp 3 行（默认完整：读日志时正文全展开，点行仍可看详情）
      '.ll_resultMsgCompact{display:-webkit-box;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:3}',
      /*
       * 正文里的**命中高亮**（第三十五刀）——对齐 Kibana Discover 那种「搜索词在正文里亮一块」。
       *
       * 底色用宿主的状态色，**不用纯黄**：Kibana 那块黄色是它自己的主题，搬到这里会跟级别标记
       * （error 红 / warn 黄）抢同一套语义，而且亮黄底配浅色正文对比度不够。
       * `state-warn-secondary` 是宿主给「需要留意但不致命」用的那一档，意思对得上。
       *
       * 不加内边距、也不给圆角：高亮是**文本属性**，盒子感会让一行字看着像被切成几块。
       * （圆角也过不了仓库那条守卫——只允许官方尺度 token，2px 这种局部数值本来就不该出现。）
       */
      '.ll_resultHit{background:var(--dsw-alias-state-warn-secondary);color:var(--dsw-alias-label-primary)}',
      /*
       * 行上的标签（「这行是谁写的」）。排版与榜上那些条同一族：等宽、小号、发丝描边。
       * **类名刻意不带 `btn`**（`scripts/client-style-spec.mjs` 的 BUTTON_CLASS = /btn/i 会把它们卷进
       * 「同族几何一致」——这些是行内的小标签，几何本来就和按钮不同族），与直方图柱子同一条做法。
       */
      // `flex:0 1 auto` + `max-width:38%`：标签按内容取宽（放得下就一行），最多占 38%，再长就在自己这格里换行。
      // 上限压在 38% 是为了让正文（flex:1）始终比标签宽——标签是「谁写的」的旁注，不是主角。
      '.ll_resultTags{flex:0 1 auto;min-width:0;max-width:38%;display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}',
      '.ll_resultTag{display:inline-flex;align-items:center;gap:4px;max-width:220px;padding:0 4px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-label-secondary);font-family:var(--ds-font-family-code);font-size:11px;line-height:16px}',
      // 可点的标签值：点一下就是「按它加一条筛选」（照 .ll_groupRowBtn 的配方：背景/边框归零 + hover 底）
      '.ll_resultTagHit{cursor:pointer;color:var(--dsw-alias-label-primary)}',
      '.ll_resultTagHit:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l4)}',
      '.ll_resultTagHit:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary))}',
      '.ll_resultTagKey{color:var(--dsw-alias-label-tertiary)}',
      '.ll_resultTagValue{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      // 「＋N」现在是个按钮（点开全部标签的浮层）：按掉 UA 外观，几何仍与标签同一族（小号等宽）
      '.ll_resultTagMore{flex:none;padding:0;border:0;background:none;color:var(--dsw-alias-label-tertiary);font-family:var(--ds-font-family-code);font-size:11px;line-height:16px;cursor:pointer}',
      '.ll_resultTagMore:hover:not(:disabled){color:var(--dsw-alias-label-primary)}',
      '.ll_resultTagMore:disabled{opacity:.4;cursor:not-allowed}',
      '.ll_resultTagMore:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary))}',
      /*
       * 全部标签浮层：**画在 .ll_results 外面**（fixed + 全屏透明底），否则会被列表的
       * `max-height:420px; overflow-y:auto` 裁掉。面板取宿主菜单配方（与字段候选同一套：
       * 4px 内边距、lg 圆角、描边投影），行高/圆角/hover 底照宿主列表项。
       */
      '.ll_labelLayer{position:fixed;inset:0;z-index:150}',
      '.ll_labelBackdrop{position:absolute;inset:0;background:transparent}',
      '.ll_labelPanel{position:absolute;box-sizing:border-box;width:320px;max-width:calc(100vw - 16px);max-height:300px;display:flex;flex-direction:column;padding:4px;border:0;border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-2);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent)}',
      '.ll_labelHead{flex:none;display:flex;align-items:center;gap:8px;padding:6px 8px 8px;border-bottom:.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
      '.ll_labelTitle{flex:1;min-width:0;color:var(--dsw-alias-label-primary);font-weight:600}',
      '.ll_labelScroll{min-height:0;overflow-y:auto;padding-top:4px}',
      '.ll_labelRow{display:flex;align-items:baseline;gap:8px;box-sizing:border-box;width:100%;min-height:30px;padding:4px 8px;border:0;border-radius:var(--dsw-radius-md);background:transparent;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12px;line-height:18px;text-align:left;cursor:pointer}',
      '.ll_labelRow:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.ll_labelRow:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}',
      // 空白值那一行不可点：与行上那颗不可点的标签同一条判据（筛不了「字段 = 空白」）
      '.ll_labelRowStatic{cursor:default}',
      '.ll_labelRowStatic:hover{background:transparent}',
      '.ll_labelKey{flex:none;max-width:45%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-family:var(--ds-font-family-code);font-size:11px;line-height:16px}',
      '.ll_labelValue{flex:1;min-width:0;color:var(--dsw-alias-label-primary);font-family:var(--ds-font-family-code);font-size:12px;line-height:18px;word-break:break-all;white-space:pre-wrap}',
      '.ll_warn{color:var(--dsw-alias-state-warn-primary);font-size:12px;line-height:18px}',
      // 时间分布（直方图）。柱子高度是**内联** style（每根都不一样，写不进类里）；类只管外观。
      '.ll_hist{display:flex;flex-direction:column;gap:6px}',
      '.ll_histHead{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
      '.ll_histTitle{color:var(--dsw-alias-label-primary);font-weight:600}',
      /*
       * 柱子容器（第十七刀）：`padding-top` 从 4px 加到 **22px**，给读数气泡让出位置。
       *
       * 气泡是 `bottom:100%`（浮在容器上方）——它**不占**容器内的空间，但会盖在
       * 「图的上方」那一片上。柱子有 56px 高，最高的那根顶到容器顶，气泡就在它正上方：
       * 于是气泡不会碰到柱顶，但也意味着它压住了 `.ll_histReadout` 之外的东西（图例 / 标题那一行）——
       * 留出来的这 22px 就是给它让的位（柱子本身仍按 56px 画，`box-sizing` 让 padding 不进高度）。
       */
      /*
       * 柱子容器（第十七刀）：`padding-top` 从 4px 加到 **24px**——上头那 20px 是给读数气泡让的位。
       *
       * 气泡**画在容器里面**（`bottom` 相对柱子顶端 + 容器顶部那段留白），不浮到容器外：
       * 浮到外面就会盖住上面那行图例（`时间分布 · 每根柱子 1m · 峰值…`），而那一行本身也是要读的。
       * 柱子仍按 56px 画（`box-sizing:border-box` 让 padding 算进高度里，柱子区就是 28px 了 —— 所以
       * 高度给到 **76px**，减掉 24 的 padding，剩下的 52px 正好还是原来柱子那一段）。
       */
      '.ll_histBars{position:relative;box-sizing:border-box;display:flex;align-items:flex-end;gap:1px;height:76px;padding:4px 4px 4px;padding-top:24px;background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm)}',
      /*
       * 读数条（第十六刀）：图上**常驻一行**，悬停哪一根就说哪一根，不悬停就说峰值那一段。
       *
       * 为什么不用原生 tooltip：那个灰框会**盖住横轴刻度**（真机截图里正压在 18:27 上），
       * 而且每移一根都要重开一次。读数条固定在图的上面一行，高度不变——鼠标进出时下面的横轴不跳。
       * 三格：时刻 · 条数 · 占全窗比例（时刻在前，因为「哪一段」是读图先问的）。
       */
      /*
       * 读数条是个**浮在柱子上方的气泡**（第十七刀），不是一行常驻文本。
       *
       * 位置：`left` 由柱中心给（内联 style），`translateX(-50%)` 让它以那根柱为中心；
       * 靠边的柱子会有一半落到容器外——`clamp` 到容器的两端（`--ll-clamp` 那两条规则做不到，
       * 所以用 `max/min` 组合：见下一条）。`bottom:100%` 把它抬到柱子上面，不挡柱顶。
       *
       * 它在 `.ll_histBars`（`position:relative`）里绝对定位，所以不占布局、不影响柱高，
       * 也不把横轴往下推——移进移出时整张图不跳。
       */
      '.ll_histReadout{position:absolute;top:2px;z-index:2;transform:translateX(-50%);display:flex;align-items:baseline;gap:8px;max-width:calc(100% - 8px);padding:2px 6px;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;font-variant-numeric:tabular-nums;white-space:nowrap;pointer-events:none}',
      '.ll_histReadoutTime{color:var(--dsw-alias-label-secondary);font-weight:500}',
      '.ll_histReadoutCount{color:var(--dsw-alias-label-primary)}',
      '.ll_histReadoutShare{color:var(--dsw-alias-label-tertiary)}',
      // 读数条末尾那句动作提示：占余下宽度、靠右，超长时省略号（它那句是附注，不许把读数条撑高）
      // 「点下去做什么」那句：气泡里靠右，与三格读数用分隔线隔开
      '.ll_histReadoutHint{padding-left:8px;border-left:.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary)}',
      /*
       * 柱子的颜色（第十三刀，真机读数驱动）：原来取 `--dsw-alias-interactive-bg-hover`
       * = `#2631480f`，也就是 **6% 透明度的近黑**——真机截图里整张图只剩几根鬼影，
       * 「这一段量多」根本看不出来。分布图是**数据可视化**，不是控件的选中态，所以取强调色的
       * 浅档（`state-business-tertiary` = #e4edfd），正在放大的那一档仍用主档。
       */
      '.ll_histBar{flex:1 1 0;min-width:1px;background:var(--dsw-alias-state-business-tertiary);border-radius:1px}',
      // 空桶只留一条 2% 的底座（见 pure.js histogramBars：补 0 是为了让「那段时间一条都没有」看得见）
      '.ll_histBarEmpty{background:var(--dsw-alias-border-l1)}',
      // 可点的柱子是个 <button>（键盘也能用），所以要把 UA 的按钮外观整条按掉，只留那根条本身
      // （类名刻意不带 `btn`：按钮族检查按 /btn/i 抓类名，柱子套上去会被「同族几何一致」卷进来）
      '.ll_histBarClick{appearance:none;padding:0;border:0;font:inherit;cursor:pointer}',
      '.ll_histBarClick:hover:not(:disabled){background:var(--dsw-alias-state-business-primary)}',
      '.ll_histBarClick:disabled{opacity:.4;cursor:not-allowed}',
      '.ll_histBarClick:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary))}',
      // 正在放大的那一档：与榜上「正在按它下钻」同一个高亮（让人看得出这一屏是收窄过的）
      '.ll_histBarActive,.ll_histBarActive:hover:not(:disabled){background:var(--dsw-alias-state-business-primary);outline:1.5px solid var(--dsw-alias-state-business-primary);outline-offset:1px}',
      /*
       * 峰值那一根（第十六刀）：比邻居深一档。
       *
       * 为什么只用**颜色**、不在图上浮一块「峰值」文字：那个字块会盖住自己那根柱子与它下面的
       * 横轴（第一版就写成了浮块，截图里立刻能看出遮挡）——而读者要看的恰恰是那根柱子的**高度**。
       * 「哪一根是峰值」靠最深的那条 + 读数条那句「峰值在 18:36」两处合起来指认，不靠一块遮罩。
       *
       * 写在 `.ll_histBarActive` **之后**是必须的：两者权重相同（都是单类），后写的才生效，
       * 否则峰值配色会被上面那条主档覆盖掉。
       */
      '.ll_histBarPeak{background:var(--dsw-alias-state-business-primary)}',
      /*
       * 横轴刻度（第十三刀）：柱子下面一行时刻。原来这张图**一个时间点都没有**——1 小时窗 61 根
       * 柱子，最高的那根是哪一分钟只能从左端数过去再乘 1 分钟。
       *
       * 中间刻度按比例定位并居中（`translateX(-50%)`）；首尾两格改成左 / 右对齐——居中的首尾刻度
       * 会有一半落在图外。高度固定，轴的文字不许把图撑高（它只是注释，不是内容）。
       */
      '.ll_histAxis{position:relative;height:16px;margin:0 4px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;font-variant-numeric:tabular-nums}',
      '.ll_histTick{position:absolute;top:0;white-space:nowrap;transform:translateX(-50%)}',
      '.ll_histTickStart{left:0;transform:none}',
      '.ll_histTickEnd{right:0;transform:none}',
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
      // 与值条同一条（第二十四刀实测）：`bg-layer-3` 在面板里就是白、`interactive-bg-hover` 只有 6% 黑——
      // 这两条一起换成「看得见的尺 + 实灰填充」
      '.ll_groupTrack{height:8px;background:var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm);overflow:hidden}',
      '.ll_groupFill{height:100%;background:var(--dsw-alias-label-tertiary);border-radius:var(--dsw-radius-sm)}',
      // 榜上可点的那一行是个 <button>（键盘也能用），所以要把 UA 的按钮外观整条按掉，只留网格布局
      '.ll_groupRowBtn{cursor:pointer;font:inherit;text-align:left;color:inherit;background:none;border:0;padding:2px 4px;margin:-2px -4px;border-radius:var(--dsw-radius-sm)}',
      '.ll_groupRowBtn:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      // 正在按它下钻的那一条：横条换个色，让人看得出「这一屏是筛过的」
      '.ll_groupRowActive .ll_groupKey{font-weight:600}',
      '.ll_groupRowActive .ll_groupFill{background:var(--dsw-alias-state-business-primary)}',
      // 筛选芯片：查询区与结果列表之间那一行（第三十刀起这一行的容器是 `.ll_fx`）
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
      /*
       * 浮层是个**两段式**盒子：上面一段滚动（候选），下面一段钉住不动（页脚：一共多少字段 + 刷新）。
       * 2026-10-14 对齐 Kibana 之后不再截断，候选可能有上百行——页脚要是跟着滚，就得先滚到底才看得见
       * 「共 102 个字段」，那等于没报。所以滚动只给候选那一层（`.ll_pickScroll`），页脚是它的兄弟。
       */
      '.ll_pickList{position:absolute;z-index:100;top:calc(100% + 4px);left:0;right:0;box-sizing:border-box;max-height:216px;display:flex;flex-direction:column;padding:4px;border:0;border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-2);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent)}',
      '.ll_pickScroll{min-height:0;overflow-y:auto}',
      '.ll_pickItem{display:block;width:100%;min-height:34px;padding:6px 8px;border:0;border-radius:var(--dsw-radius-md);background:transparent;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13px;line-height:20px;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}',
      '.ll_pickItem:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      // 方向键停在那一行（与 hover 同一个底：两套输入说的是同一件事）
      '.ll_pickItemActive{background:var(--dsw-alias-interactive-bg-hover)}',
      '.ll_pickItem:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}',
      // 冲突字段的行尾标记（同名在不同索引里类型不一致）：一行里只加一小截文字，不要做成胶囊/徽章
      '.ll_pickConflict{margin-left:6px;color:var(--dsw-alias-state-warn-primary);font-size:12px;line-height:18px}',
      /*
       * 候选里「当前选中的就是它」的那个勾（第三十九刀）。排在行尾（`margin-left:auto`）：
       * 十几个容器名长短不一，勾跟着文字尾巴跑就没法一眼扫出「哪个是当前的」。
       */
      '.ll_pickDone{margin-left:auto;padding-left:8px;color:var(--dsw-alias-state-business-primary);font-size:12px;line-height:18px}',
      // 浮层里的「不是候选」的几行：加载中 / 取不到 / 这个来源没有字段名 —— 都排成一条文字行
      '.ll_pickState{padding:8px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}',
      /*
       * 在途时的转圈（第四十二刀）。
       *
       * 为什么需要它：清单在拉的那几秒里，浮层原来只有一句静止的「加载中…」——看不出它是在动
       * 还是已经卡住了。一句话说的是「状态」，转圈说的是「还在动」，两件事不一样。
       *
       * 尺寸取 12px：与这一行的字号同档，不比文字更抢眼——它是个**旁证**，不是主角。
       * 颜色用当前的文字色（`currentColor`）：跟着 `ll_pickState` 走，不用再挑一个色。
       *
       * `prefers-reduced-motion` 那段是必须的：转圈是纯装饰，系统里关掉动效的人应当得到一个
       * **静止但仍在**的标记（不是消失——那会让人以为没在拉）。
       */
      '@keyframes ll-spin{to{transform:rotate(360deg)}}',
      '.ll_pickLoading{display:flex;align-items:center;gap:6px}',
      // 按钮里那一份不要外部内边距（`.ll_pickState` 的 8px 是给独立一行的）
      '.ll_pickRefresh .ll_pickLoading{gap:4px}',
      // `border-radius:50%` 必须配 `corner-shape:round`（宿主给所有元素设了 superellipse，
      // 不写这个就是苹果图标那种圆角方形，不是正圆——仓库守卫检查六会拦）
      '.ll_spinner{flex:none;width:12px;height:12px;box-sizing:border-box;border:1.5px solid var(--dsw-alias-border-l3);border-top-color:currentColor;border-radius:50%;corner-shape:round;animation:ll-spin .8s linear infinite}',
      '@media (prefers-reduced-motion: reduce){.ll_spinner{animation:none}}',
      /* 输入框里那个小转圈：贴在右端（chevron 左边一点），不占正文的位子 */
      '.ll_pickSpinner{position:absolute;right:26px;top:50%;margin-top:-6px;pointer-events:none}',
      // 页脚：宿主那句截断警告（照抄）+「刷新」；与候选之间用一条发丝线分开
      // `flex:none` 是钉住它的关键：滚动只发生在 `.ll_pickScroll`，页脚在它外面、永远看得见
      '.ll_pickFoot{flex:none;display:flex;align-items:center;gap:8px;margin-top:4px;padding:4px 8px 2px;border-top:.5px solid var(--dsw-alias-border-l2)}',
      '.ll_pickFoot .ll_pickState{flex:1;min-width:0;padding:0}',
      '.ll_pickRefresh{flex:none;padding:2px 6px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:12px;line-height:18px;cursor:pointer}',
      '.ll_pickRefresh:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.ll_pickRefresh:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}',
      /*
       * 两段式筛选框（第三十刀）：`[字段] = [值] [确定]`，一条条件就是一行。
       *
       * 几何跟着**芯片**走（H22 / 12px 18px）：它与芯片排在同一行同一条基线上，
       * 比芯片高或矮都会让这一行看着歪（与「＋ 筛选」那条同一条判据）。
       *
       * 两格共用**一条**发丝线围成的盒子（`.ll_fxBox`），中间那个 `=` 是分隔符也是说明：
       * 它把「字段 = 值」这条条件的形状直接写在界面上，不必再靠一句提示解释。
       * 焦点落在哪一格，那一格的边框换品牌色（不是两格各画一个输入框——那样中间会多出
       * 两条竖线，读起来像两个无关的控件）。
       *
       * 类名全部**不带** `input` / `select` 结尾：输入框族检查按那个后缀抓（`scanInputRecipes`），
       * 而这一格是行内的组合控件、几何由盒子统一管，不是宿主那种独立输入档（H32–40）。
       */
      '.ll_fx{position:relative;display:flex;align-items:center;gap:8px;flex-wrap:wrap;max-width:100%}',
      '.ll_fxBox{position:relative;display:flex;align-items:center;gap:0;box-sizing:border-box;height:24px;max-width:100%;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3)}',
      // 两格之间只画一条竖线（`=` 那颗就是分隔符本身）
      '.ll_fxFieldBox,.ll_fxValueBox{position:relative;display:flex;align-items:center;min-width:0;height:100%}',
      '.ll_fxFieldBox{flex:0 1 150px;border-right:.5px solid var(--dsw-alias-border-l2)}',
      '.ll_fxValueBox{flex:1 1 130px}',
      // 焦点在谁身上，那一格自己亮（整盒不换色：换整盒会让人以为两格是一件事）
      '.ll_fxFieldBox.ll_fxOpen,.ll_fxValueBox.ll_fxOpen{background:var(--dsw-alias-bg-layer-2)}',
      /*
       * 两格的 input 本体：**没有边框、没有背景**——描边归盒子。
       * `height:100%` + `box-sizing:border-box` 让它填满 24px 的盒子（没有显式高度的话
       * 两格会各按内容撑高，一高一矮）。
       */
      '.ll_fxField,.ll_fxValue{box-sizing:border-box;width:100%;min-width:0;height:100%;padding:0 18px 0 8px;border:0;outline:none;background:transparent;color:var(--dsw-alias-label-primary);font-family:var(--ds-font-family-code);font-size:12px;line-height:18px;text-overflow:ellipsis}',
      '.ll_fxField::placeholder,.ll_fxValue::placeholder{color:var(--dsw-alias-label-tertiary);font-family:inherit}',
      '.ll_fxValue:disabled{cursor:not-allowed;color:var(--dsw-alias-label-tertiary)}',
      // caret 是装饰：整格本来就点得开（与分组框那颗同一条）
      '.ll_fxChevron{position:absolute;right:5px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--dsw-alias-label-tertiary)}',
      '.ll_fxEq{padding:0 2px;color:var(--dsw-alias-label-tertiary);font-family:var(--ds-font-family-code);font-size:12px;line-height:18px}',
      /*
       * 提交那颗：只在两格都填了时出现（一颗永远灰着的按钮只是噪音）。
       * 几何与芯片同一套，用品牌色实心——它是这一行里唯一「按下就发生事情」的东西。
       */
      '.ll_fxGo{appearance:none;box-sizing:border-box;height:22px;padding:0 8px;border:0;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-bg-layer-2);font-family:inherit;font-size:12px;line-height:18px;white-space:nowrap;cursor:pointer}',
      '.ll_fxGo:hover:not(:disabled){opacity:.9}',
      '.ll_fxGo:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}',
      '.ll_fxGo:disabled{opacity:.4;cursor:not-allowed}',
      /*
       * 下拉：挂在**盒子**上（`.ll_fxBox` 是 `position:relative`）、贴在盒子下方 4px。
       *
       * 挂盒子而不是挂整行，是第三十刀第一版的真机读数定的：挂整行时下拉左缘在 105、
       * 而值那一格在 539——下拉离它要补的那一格 430px。挂盒子上之后，字段那张从盒子左缘长出、
       * 值那张从盒子**右缘**长出（两张各自贴着自己那一格）。
       *
       * `max-height:216px` 与分组候选同一个数（两处下拉长得一样，就不该有两个高度）。
       */
      '.ll_fxList{position:absolute;z-index:100;top:calc(100% + 4px);box-sizing:border-box;min-width:220px;max-width:340px;max-height:216px;overflow-y:auto;padding:4px;border:0;border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-2);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent)}',
      // 值那张贴**右缘**（它补的是右边那一格，从左边长出来会离得很远）；字段那张贴左缘。
      // 顺序有意义：两者同权重，后写的 `.ll_fxListField` 才能把右缘那条覆盖回去。
      '.ll_fxList{right:0}',
      '.ll_fxListField{left:0;right:auto;width:auto}',
      '.ll_fxItem{display:flex;align-items:center;gap:8px;width:100%;min-height:28px;padding:3px 8px;border:0;border-radius:var(--dsw-radius-md);background:transparent;color:var(--dsw-alias-label-primary);font-family:var(--ds-font-family-code);font-size:12px;line-height:18px;text-align:left;cursor:pointer}',
      '.ll_fxItem:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      // 方向键停在那一行（与 hover 同一个底：两套输入说的是同一件事）
      '.ll_fxItemOn{background:var(--dsw-alias-interactive-bg-hover)}',
      '.ll_fxItem:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}',
      '.ll_fxItemText{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      /*
       * 值行右缘的那条**相对长短**（第三十一刀，替换掉原来那位数字）：
       *
       * 数字的问题是口径——它与页面上那个「命中 N」是两个瞬间量的，真机上抓到过
       * 「值行 15242 / 同屏命中 15199」。一个值不可能多于总数，所以那个画面必然被读成算错了。
       * 条没有这个问题：它只表达「比旁边的长/短」，而这件事在两个瞬间之间不会翻转。
       * 具体条数仍在行的 title 里（要核对的人有出处）。
       */
      '.ll_fxItemBar{flex:none;width:44px;height:6px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-border-l1);overflow:hidden}',
      '.ll_fxItemFill{display:block;height:100%;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-label-tertiary)}',
      // 「本页」那一小截标记：说明这个字段在这一页的行里真有值（与分组头那套说法同一条）
      '.ll_fxItemTag{flex:none;padding:0 3px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-label-tertiary);font-family:var(--ds-font-family-code);font-size:10px;line-height:14px}',
      // 已经在筛的那一条：勾一下（再点是取消）
      '.ll_fxItemOn2{flex:none;color:var(--dsw-alias-state-business-primary);font-size:11px;line-height:16px}',
      // 下拉里「不是候选」的那几行：加载中 / 取不到 / 没有值 —— 都排成一条文字行
      '.ll_fxState{padding:8px;color:var(--dsw-alias-label-tertiary);font-family:inherit;font-size:12px;line-height:18px}',
      // 口径提示（「这些数不受本字段约束」）：与「不是候选」那几行分开——它是说明，不是状态
      '.ll_fxNote{padding:4px 8px 6px;border-bottom:.5px solid var(--dsw-alias-border-l1);font-size:11px;line-height:16px}',
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
      // 收起 / 展开来源配置区（第十五刀）。两句都写**动作**：按钮上说的事点下去就发生
      'btn.sourcesShow': '编辑来源',
      'btn.sourcesHide': '收起来源配置',
      'hint.sourcesExpand': '展开来源配置（新增 / 修改 / 删除日志来源）',
      'hint.sourcesCollapse': '收起来源配置（只留下一行摘要，查询与结果能多占一屏）',
      'panel.histogram': '时间分布',
      'panel.groups': '按字段分组',
      'panel.labels': '全部标签',
      'field.columns': '列',
      'placeholder.fieldFilter': '过滤字段名',
      // 字段侧栏过滤框的清除（第十九刀）：只在有过滤词时出现
      'hint.fieldFilterClear': '清空过滤词',
      'placeholder.filterValue': '值（不裁空格）',
      // 两段式筛选框（第三十刀）：左格是字段、右格是值
      'placeholder.filterField': '字段',
      'placeholder.filterFieldFirst': '先选字段',
      'hint.filterValueFirst': '先在左边选一个字段：值那一格要列的是「这个字段的值」',
      'btn.apply': '确定',
      'hint.columnAdd': '加成一列：{field}',
      'hint.columnRemove': '去掉这一列：{field}',
      'hint.columnNoValue': '这一行没有 {field} 的值',
      'hint.columnLimit': '最多同时加 {count} 列：再加正文会被挤到看不清',
      'hint.columnsScroll': '列多时可左右滚动',
      'hint.fieldCount': '这一页有 {count} 行带这个字段',
      // 脚注**一行**能读完的那句（第二十三刀）：真机上它原来 464px 而格子只有 284px，被省略号
      // 切在句子中间（「…其余字段…」）。完整那段搬进 title——想细看的人悬停就有。
      'hint.fieldsTooMany': '只列了前 {shown} 个（共 {count} 个）：用上面的过滤收窄',
      'hint.noFieldsMatch': '没有匹配的字段名',
      // 字段分组（第二十一刀）
      'field.topLevel': '顶层字段',
      'hint.fieldGroupToggle': '展开 / 收起「{name}」这一组（{count} 个字段）',
      'section.columnsPicked': '已选列（{count}）',
      // 过滤反馈：搜索时报「命中几个」比「一共多少个」有用
      'meta.fieldsMatched': '命中 {count} 个',
      'hint.expandRow': '展开这一行（全部标签与原文）',
      'hint.collapseRow': '收起这一行',
      'hint.noLabels': '这一行没有标签',
      'hint.noRaw': '这个来源没有原文',
      'hint.rawTruncated': '原文太长，只显示前 {shown} 个字符（共 {total} 个）',
      'panel.message': '消息',
      'panel.raw': '原文',
      'meta.histInterval': '每根柱子 {interval}',
      'meta.histPeak': '峰值 {count} 条',
      'meta.histTotal': '共 {count} 条',
      'meta.histBucket': '{time} · {count} 条',
      // 图的读数条（第十六刀）：悬停一根柱时它说这一段的量，不悬停时说峰值那一段。
      // 「占全窗」的分母是屏幕上这些柱子的和（不是宿主那个可能更小的合计，见 histPeakShare 的注释）
      'meta.histBucketCount': '{count} 条',
      'meta.histPeakShare': '占 {percent}%',
      'meta.groupsCount': '{count} 条',
      'meta.groupsBlankKey': '（空值）',
      'hint.histogram': '这张图来自后端按时间分桶（不是数这一页——这一页被条数截断过，数它只会得到一个假的分布）。',
      'hint.histogramTruncated': '窗口比这张图长，只画了前一部分。',
      // 基线裁剪的说明（第十六刀）：柱高不按零起点画时必须说出来，否则差异会被读成倍数
      // **不写 Markdown 的 `**`**：面板不把文案当 Markdown 渲染，界面上会原样露出星号
      // （与 src/execute.ts 里那条级别 warning 同一条教训，真机截图已抓到过一次）
      'hint.histogramClipped': '各段条数挨得近（最大值不到最小值的 3 倍），柱子从接近底部起画，好让差异看得出来——柱高只表示相对高低，不是与条数成正比。悬停任一根看它的实际条数。',
      'hint.zoomBar': '点一下放大到这一段（把时间窗夹到这一根柱）',
      // 读数条里的那一句（第十六刀）：原生 tooltip 拆掉之后「点下去做什么」搬到这里。
      // 短的这版给读数条用（它在一行里，与时刻 · 条数 · 占比并排）；长的 `hint.zoomBar` 仍在
      // aria-label 里给读屏用户说全。
      'hint.zoomBarShort': '点一下放大到这一段',
      'hint.zoomBarCancel': '再点一次取消放大（回到放大之前那一档）',
      'hint.zoomClamped': '已放大到最短 1 分钟（那一档分桶比这还窄，再窄就查不出东西了）。',
      'hint.groups': '这张榜来自后端的 terms 聚合（不是数这一页——这一页被条数截断过，数它只会得到一个假的排名）。点一条即按它下钻（加一条筛选重查一次），再点一次取消。',
      'hint.groupsTruncated': '桶比这张榜长，只画了前一部分。',
      'hint.groupBlankNoDrill': '空值那一条不能下钻：筛选只能表达「字段 = 某值」，表达不了「字段缺失」。',
      'hint.groupDrillRow': '按 {field} = {value} 下钻（再点一次取消）',
      'field.filters': '筛选',
      'panel.fieldsColumn': '选列',
      'hint.fieldsColumn': '列要有逐行值才能加；数字是本页行数。',
      'hint.fieldsColumnFull': '列只能从「本页命中」的字段加：列的值取自这一页每一行的标签，其余字段在这一页的行里没有值，加出来会全是 —。',
      'msg.noColumnableFields': '这一页没有可加列的字段（本页命中为空，或这一页的行都没带标签）',
      'section.columnsPickable': '可加列的字段（{count}）',
      'hint.valueDrill': '按 {field} = {value} 筛',
      'hint.valueActive': '{value} 正在筛（再点一次取消）',
      'msg.fieldValuesEmpty': '这个字段在这一页没有值（可能这一页的行都没带它）',
      'error.fieldValues': '取这个字段的值失败：{message}',
      'error.fieldValuesWindow': '还没有可用的时间窗：先查一次，再展开字段的值',
      'hint.addFilter': '加一条筛选：左边选字段、右边填值，回车生效',
      'badge.pageField': '本页',
      'hint.fieldCountBucket': '这个值 {count} 条',
      // 值下拉的计数口径（第三十一刀）：本字段自己的那条筛选被摘掉了，所以数不能与页面命中数并列对比
      'hint.fieldValuesOwnFilter': '这一格的数是「不受本字段约束」的子集：想切换这个字段的值，这里才列得出别的值。',
      'btn.filterRemove': '移除这条筛选',
      'error.needFilterField': '这条筛选没有字段名',
      'error.needFilterValue': '这条筛选没有值（空值那一桶筛不了：筛选只能表达「字段 = 某值」）',
      'hint.filters': '筛选按「字段 = 值」下发（走宿主的结构化 filters）：行、时间分布与分组榜都跟着收窄。一个字段只有一条。Loki 不支持结构化筛选——用它时把条件写进查询串。',
      'hint.aggregationUnsupported': '当前来源不支持聚合（Loki 的指标查询还没接），所以这里没有时间分布与分组榜。',
      'error.histogram': '时间分布取不到：{message}',
      'error.groups': '分组取不到：{message}',
      'error.needGroupBy': '先填要分组的字段（不知道有哪些字段就点「有哪些字段」）',
      'list.noBuckets': '这个窗口里没有可分组的数据',
      'hint.notImplemented': '下面可以直接查当前来源；结果出来后左边是字段栏（本页命中 / 其余可用 / 类型冲突，点名字就筛选），「分组字段」那一格点开也是当前来源的字段名候选。新增列与行详情的口径见上；「某一行前后」的上下文仍在 agent 侧的 loglens_context 里。',
      'field.kind': '类型',
      'field.label': '名称',
      'field.url': '地址',
      'field.index': '索引',
      'field.groupBy': '分组字段',
      // 这一格只有约 300px 宽（真机量过），原来那句 40+ 字被硬切成「…再留空…」——
      // 截图里看到的就是这个。现在占位符只说「填什么」，完整规则留在 title（悬停能看全）。
      // 现在有「索引」标签了（第四十一刀），占位符只留示例，不再重复「索引表达式」四个字
      'placeholder.index': '如 app-logs-*',
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
      // 收起态那一行摘要用的两句短话（第十五刀）：不写全句，那一格要与标题、开关并排
      'list.emptyShort': '没有来源',
      'meta.sourceCount': '{count} 个来源',
      'meta.sourceActive': '{count} 个来源 · 当前 {label}',
      'status.enabled': '已启用',
      'status.disabled': '已停用',
      'placeholder.label': '例如：本地 Loki',
      'placeholder.url': 'http://127.0.0.1:3100',
      'msg.saved': '已保存',
      'msg.memoryOnly': '宿主没有 settings 服务，改动只在本次进程内有效',
      'msg.fieldsEmpty': '这个来源没有返回字段名（可以直接手填，比如 container.name）',
      // 容器下拉那格占位项的两种「还没有选项」（第三种是「加载中…」，复用 list.loading）：
      // 都短到能放进最窄的那一列（见 scripts/client-smoke.mjs 的宽度预算）
      'msg.containersEmpty': '没有容器',
      'msg.containersFailed': '加载失败',
      'error.fields': '字段清单取不到：{message}',
      'error.containers': '容器清单取不到：{message}',
      'error.needUrl': '这个类型必须填地址',
      'error.badUrl': '地址必须是 http:// 或 https:// 开头的绝对地址',
      'error.badKind': '类型不认识（支持 Loki / Elasticsearch / OpenSearch / Docker）',
      'section.query': '查询',
      'hint.query': '面板直查当前来源：走的是与 agent 工具同一套执行层（同一份归一化与截断信号）。',
      // 占位提示按来源方言分三条：原来那条写死「Loki 是 LogQL」，对实际在用的 ES 是错的
      // （ES / OpenSearch 走 Lucene 的 query_string）。挑哪一条由 queryPlaceholder 逐条列字面量。
      'placeholder.query': '查询串（留空即全量）',
      'placeholder.queryLogql': '查询串（LogQL，如 {job="app"} |= "error"；留空即全量）',
      // 第三十四刀改对了这条：原来写「+ 是且」，那是**错的**（粘在两个词中间的 `+` 只是分隔符，
      // 与空格同义、也就是「或」；真机 `error+failed` 回 1789 = 并集，而 `error AND failed` 回 511 = 交集）。
      // 大写才是运算符、小写会被当成普通词——这正是要写在占位符里的那一句。
      'placeholder.queryLucene': '查询串（Lucene：AND / OR / NOT 要大写、空格是「或」、引号是短语；留空即全量）',
      // 查询串的可点例子（第三十三刀）：用户「我不会写」的落点
      'hint.querySamples': '例子：',
      'hint.querySample': '点一下填进查询串：{sample}',
      'placeholder.groupBy': 'container.name',
      'field.target': '来源',
      'field.window': '时间窗',
      'field.level': '级别',
      'field.limit': '条数',
      'btn.query': '查询',
      'btn.querying': '查询中…',
      'btn.group': '分组',
      'btn.grouping': '分组中…',
      'btn.refreshFields': '刷新',
      'hint.fieldsCount': '共 {count} 个字段',
      'badge.conflict': '类型冲突',
      'btn.nextPage': '下一页',
      'btn.clear': '清空结果',
      'btn.fields': '字段',
      'btn.densityCompact': '紧凑',
      'btn.densityFull': '完整',
      'hint.density': '紧凑：每条日志只显示 3 行（点行看全文）；完整：正文全展开。选择会记在本机浏览器里。',
      'hint.fieldsToggle': '打开 / 收起字段浮层（列与筛选的入口；浮在结果上，不占日志宽度）',
      // 排序（第十三刀）：宿主没有服务端排序，所以入口自己先把「只排这一页」说出来。
      // `hint.sort` 的 {order} 收的是**档位名**（时间 / 级别 / 正文），不是按钮上的整句
      // 「排序：时间」——拼进去会变成「排序：排序：时间」（第一版真机就这么画出来了）。
      'meta.sortTime': '时间',
      'meta.sortLevel': '级别',
      'meta.sortMessage': '正文',
      'hint.sort': '本页排序：{order}。再点一次换下一档（时间 / 级别 / 正文循环）。只重排**已返回的这一页**——后端没有服务端排序，翻页取到的仍是后端顺序。',
      'option.15m': '最近 15 分钟',
      'option.1h': '最近 1 小时',
      'option.6h': '最近 6 小时',
      'option.24h': '最近 24 小时',
      // 「自定义」那一档只在点柱放大之后才出现在下拉里；文案按**真实范围**现算（见 windowLabel）
      'option.custom': '{from} → {to}',
      'list.noHit': '没有命中（换个时间窗，或放宽查询串）',
      // 级别那一格：「不限」是空串那一项（原生 <select> 的回落项也就是它，见 pure.js levelFilterOf）
      //
      // 选中项写成 **`warn+`** 而不是「warn 及以上」（2026-10-17 维护者看图后提的）：这一格最窄只有
      // 96px，七项里五项都拖着「及以上」四个字，一列下拉全是重复的尾巴，反而把级别名挤成配角。
      // `+` 是日志查看器里通行的那一个记号（`warn+` = warn 及以上），语义不变——**边界说明那一句**
      // （hint.levelPaged，写着「及以上」的完整口径）仍然在场，所以缩短的是标签，不是判据。
      'option.levelAny': '不限',
      'option.levelTrace': 'trace+',
      'option.levelDebug': 'debug+',
      'option.levelInfo': 'info+',
      'option.levelWarn': 'warn+',
      'option.levelError': 'error+',
      'option.levelFatal': 'fatal',
      // 页内筛的**边界**必须说出来：宿主是在返回的这一页上过滤的，counts / truncation 仍是未筛的整页。
      // 后半句要带前提：分组榜能给出「按级别的全量」**只在后端真有级别字段时**成立——ES 上
      // `log.level` 常常整列是空的（级别是从正文推断的，见 src/line.ts），那时分组也是空桶，
      // 原句「要按级别看全量请用分组榜」就成了指一条走不通的路。
      // 边界少用 Markdown 强调符号：这句是**一句人话**，渲染出来会原样带 `**`（宿主不把文案当 Markdown）。
      // 头一句要**把下拉里那个 `+` 讲清**（`warn+` = warn 及以上）：标签 shortening 之后，
      // 这半句就是全屏唯一写着完整语义的地方——少了它，`+` 只能靠猜。
      'hint.levelPaged': '级别按「及以上」筛（下拉里的 warn+ 就是 warn 及以上），且是在「返回的这一页」上筛的（宿主口径）：计数与截断提示仍是未筛的整页。要按级别看全量只能靠后端真有级别字段——索引里没有时（ES 常从正文推断），分组榜也会是空的。',
      // 条件改了但结果没重查：屏幕上的行/计数属于**上一次**。必须说出来，尤其是 ES：
      // 「下一页」带的是旧 PIT 游标，配新条件翻页会静默少行。
      'hint.noChanges': '这一行没有改动',
      'hint.staleResults': '查询条件已经改过——下面这份结果还是上一次查询的。先点「查询」按新条件刷新；在那之前「分组」与「下一页」都收着（翻页的游标属于上一次查询）。',
      // 行上的标签：点值即按它加一条筛选（「这行是谁写的」→「看它写的其它行」）
      'hint.rowLabelFilter': '按 {field} = {value} 加一条筛选（再点榜上那条或芯片上的 × 可去掉）',
      // 行上只留 1 个身份标签；「＋N」点开**全部标签**浮层（每行仍可点筛）
      'hint.rowMoreLabels': '＋{count}',
      'hint.rowLabelPanel': '查看全部 {count} 个标签（点一个就按「字段 = 值」筛）',
      'btn.closeLabels': '关闭',
      'hint.rowSensitive': '行详情里可能有敏感字段（原文与标签原样来自日志后端）',
      'meta.returned': '返回 {count} 行',
      'meta.matched': '命中 {count}',
      'meta.matchedAtLeast': '至少命中 {count}',
      'meta.scannedRows': '扫描 {count} 行',
      'meta.scannedBytes': '扫描 {count} 字节',
      'meta.truncated': '已截断：{reasons}',
      /*
       * 「可能还有」那一档**不叫截断**（第三十六刀）。
       *
       * 判据见 src/query.ts 的 pageLimitFlags：命中数恰好等于条数上限时，两边相等、分不出来。
       * 这时说「已截断」是把推测写成了断言，而且会给一个翻过去必然空页的「下一页」。
       * 照 Kibana 的做法（`Limited to N results. Refine your search.`）：说清「显示了多少」，
       * 再给一个**能做的事**——把条数调大。不说「还有 N 条」，因为那个 N 本来就不知道。
       */
      'meta.maybeMore': '已显示前 {count} 行，可能有更多：把条数调大可以看得更全',
      'status.hit_limit': '达到条数上限',
      'status.hit_limit_maybe': '可能还有更多',
      'status.max_result_window': '超出结果窗口上限',
      'status.partial_shards': '部分分片失败',
      'status.timed_out': '查询超时',
      'status.scan_cap': '扫描量到顶',
      'status.byte_cap': '字节量到顶',
      'status.cursor_expired': '游标已过期',
      'error.needTarget': '先选一个来源',
      'error.badLimit': '条数得是正整数',
      'error.badWindow': '自定义时间窗不完整（点柱放大时会带上这一段；重新点一根柱，或改回预设档）',
      'field.dockerTarget': 'Docker 目标名',
      'field.container': '容器',
      'field.tail': '行数',
      'btn.refresh': '刷新',
      'btn.retry': '重试',
      'hint.refreshContainers': '重新拉一次容器清单（容器起停之后它才会变；这里刷新的不是下面那份日志）',
      'btn.logs': '看日志',
      'hint.docker': '容器日志走的是 Docker 面板插件自己的 /api/dsh-docker/logs：这条路没有 until、行数有上限、没有 grep——要精确检索请让 agent 用 docker_logs_grep。',
      // 换了容器/窗口/行数之后，屏上那份日志还是上一次的（第三十八刀）
      'hint.dockerStale': '下面这份日志是上一次拉取的，不是「{container}」现在的：改完条件要点「看日志」才会重新拉。',
      // 容器候选（第三十九刀）
      'placeholder.container': '搜索或选择容器',
      'hint.containersCount': '共 {count} 个容器',
      'hint.containersMatched': '命中 {count} 个 / 共 {total} 个',
      'hint.dockerMissing': '这条路径要「Docker 容器面板」插件（当前没检测到它）：装上并启用后，这里可以直接看容器日志。',
      // 清单**拉回来了、但是空的**：下拉那格写着「没有容器」，这句是它的解释（请求带的是 all:false）
      'hint.containersEmpty': '这个 Docker 目标上没有运行中的容器（这里只列运行中的）。',
      'error.needContainer': '先选一个容器',
      // 占位项要**短到放得进最窄一列**（旧文案「（先选一个来源）」9 字 117px，被原生箭头切掉一半）；
      // 「还要先做什么」由旁边那条错误行说（error.needTarget）。宽度预算的守卫在 client-smoke 里。
      'option.pickTarget': '选择来源',
      'option.dockerAuto': '（让 Docker 面板自己回落）',
      'btn.logsLoading': '加载中…',
      'list.noLogs': '没有日志（换个大点的时间窗或行数再试）',
      'hint.dockerTargetUnknown': '（不在 Docker 面板的目标里）',
    }
    const I18N_EN = {
      'card.name': 'Log query',
      'card.desc': 'Normalizes log backends such as Loki / Elasticsearch / OpenSearch into one query surface: source list, direct query, volume over time and grouping by field.',
      'panel.title': 'Log sources',
      'btn.sourcesShow': 'Edit sources',
      'btn.sourcesHide': 'Hide source settings',
      'hint.sourcesExpand': 'Expand the source settings (add, change or remove log sources)',
      'hint.sourcesCollapse': 'Collapse the source settings (leaves one summary line so the query and results get the screen)',
      'panel.histogram': 'Volume over time',
      'panel.groups': 'Grouped by field',
      'panel.labels': 'All labels',
      'field.columns': 'Columns',
      'placeholder.fieldFilter': 'Filter field names',
      'hint.fieldFilterClear': 'Clear the filter',
      'placeholder.filterValue': 'Value (spaces kept)',
      'placeholder.filterField': 'Field',
      'placeholder.filterFieldFirst': 'Pick a field first',
      'hint.filterValueFirst': 'Pick a field on the left first — this box lists that field’s values',
      'btn.apply': 'Apply',
      'hint.columnAdd': 'Add as a column: {field}',
      'hint.columnRemove': 'Remove this column: {field}',
      'hint.columnNoValue': 'This row has no value for {field}',
      'hint.columnLimit': 'At most {count} extra columns: more would squeeze the message out of sight',
      'hint.columnsScroll': 'Scrolls sideways when columns overflow',
      'hint.fieldCount': '{count} rows on this page carry this field',
      'hint.fieldsTooMany': 'Showing the first {shown} (of {count}): narrow it down with the filter above',
      'hint.noFieldsMatch': 'No field names match',
      'field.topLevel': 'Top-level',
      'hint.fieldGroupToggle': 'Expand or collapse the “{name}” group ({count} fields)',
      'section.columnsPicked': 'Columns ({count})',
      'meta.fieldsMatched': '{count} match',
      'hint.expandRow': 'Expand this row (all labels and the raw text)',
      'hint.collapseRow': 'Collapse this row',
      'hint.noLabels': 'This row has no labels',
      'hint.noRaw': 'This source has no raw text',
      'hint.rawTruncated': 'The raw text is too long; showing the first {shown} characters (of {total})',
      'panel.message': 'Message',
      'panel.raw': 'Raw',
      'meta.histInterval': 'each bar = {interval}',
      'meta.histPeak': 'peak {count}',
      'meta.histTotal': '{count} total',
      'meta.histBucket': '{time} · {count}',
      'meta.histBucketCount': '{count} lines',
      'meta.histPeakShare': '{percent}% of the window',
      'meta.groupsCount': '{count}',
      'meta.groupsBlankKey': '(empty value)',
      'hint.histogram': 'This chart comes from the backend time-bucketing (not from counting this page — the page is capped by the limit, so counting it would only give you a fake distribution).',
      'hint.histogramTruncated': 'The window is longer than this chart; only the first part is drawn.',
      'hint.histogramClipped': 'The buckets are close together (the max is less than 3× the min), so the bars start near the bottom to make the differences visible — bar height shows relative height only, not a count-proportional scale. Hover a bar for its exact count.',
      'hint.zoomBar': 'Click to zoom into this slice (narrows the time window to this bar)',
      'hint.zoomBarShort': 'Click to zoom in',
      'hint.zoomBarCancel': 'Click again to undo the zoom (back to the preset you zoomed from)',
      'hint.zoomClamped': 'Zoomed to the 1-minute minimum (that bucket is narrower than this; anything narrower finds nothing).',
      'hint.groups': 'This ranking comes from the backend terms aggregation (not from counting this page — the page is capped by the limit, so counting it would only give you a fake ranking). Click a row to drill into it (adds one filter and re-runs the query); click it again to undo.',
      'hint.groupsTruncated': 'There are more buckets than this ranking; only the first part is drawn.',
      'hint.groupBlankNoDrill': 'The empty-value row cannot be drilled into: a filter can only say “field = some value”, not “the field is missing”.',
      'hint.groupDrillRow': 'Drill into {field} = {value} (click again to undo)',
      'field.filters': 'Filters',
      'panel.fieldsColumn': 'Columns',
      'hint.fieldsColumn': 'A column needs per-row values; the number is this page’s row count.',
      'hint.fieldsColumnFull': 'Columns can only come from fields that appear on this page: a column shows each row’s label value, and other fields have no value on this page’s rows — the column would be all —.',
      'msg.noColumnableFields': 'No columnable field on this page (nothing matched, or this page’s rows carry no labels)',
      'section.columnsPickable': 'Columnable fields ({count})',
      'hint.valueDrill': 'Filter by {field} = {value}',
      'hint.valueActive': '{value} is being filtered on (click again to undo)',
      'msg.fieldValuesEmpty': 'This field has no value on this page (the rows here may not carry it)',
      'error.fieldValues': 'Could not read this field’s values: {message}',
      'error.fieldValuesWindow': 'No time window yet — run a query first, then expand the field’s values',
      'hint.addFilter': 'Add a filter: pick a field on the left, type a value on the right, press Enter',
      'badge.pageField': 'this page',
      'hint.fieldCountBucket': '{count} in this subset',
      'hint.fieldValuesOwnFilter': 'The numbers here come from a subset that ignores this field’s own filter — that is how the other values show up.',
      'btn.filterRemove': 'Remove this filter',
      'error.needFilterField': 'This filter has no field name',
      'error.needFilterValue': 'This filter has no value (the empty-value bucket cannot be filtered: a filter can only say “field = some value”)',
      'hint.filters': 'Filters go out as “field = value” (the host’s structured filters): the rows, the volume chart and the ranking all narrow with them. One filter per field. Loki does not support structured filters — put the condition into the query string there.',
      'hint.aggregationUnsupported': 'This source cannot aggregate (Loki metric queries are not wired yet), so there is no volume chart or group ranking here.',
      'error.histogram': 'Could not load the volume chart: {message}',
      'error.groups': 'Could not group by field: {message}',
      'error.needGroupBy': 'Fill in a field to group by first (click “List fields” if you do not know them)',
      'list.noBuckets': 'No data to group by in this window',
      'hint.notImplemented': 'You can query the selected source right below; once results exist, the left column is the field list (on this page / other available / type conflicts — click a name to filter), and the “Group by field” box opens the same candidates. New columns and row details are described above; per-line context still lives in the agent tool loglens_context.',
      'field.kind': 'Kind',
      'field.label': 'Name',
      'field.url': 'URL',
      'field.index': 'Index',
      'field.groupBy': 'Group by field',
      'placeholder.index': 'e.g. app-logs-*',
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
      'list.emptyShort': 'No sources',
      'meta.sourceCount': '{count} sources',
      'meta.sourceActive': '{count} sources · using {label}',
      'status.enabled': 'Enabled',
      'status.disabled': 'Disabled',
      'placeholder.label': 'e.g. local Loki',
      'placeholder.url': 'http://127.0.0.1:3100',
      'msg.saved': 'Saved',
      'msg.memoryOnly': 'The host has no settings service; changes last only in this process',
      'msg.fieldsEmpty': 'This source returned no field names (you can type one, e.g. container.name)',
      'msg.containersEmpty': 'No containers',
      'msg.containersFailed': 'Load failed',
      'error.fields': 'Could not load the field list: {message}',
      'error.containers': 'Could not load the container list: {message}',
      'error.needUrl': 'This kind needs a URL',
      'error.badUrl': 'The URL must be an absolute http:// or https:// address',
      'error.badKind': 'Unknown kind (Loki / Elasticsearch / OpenSearch / Docker)',
      'section.query': 'Query',
      'hint.query': 'Queries the selected source through the same execution layer the agent tools use (identical normalization and truncation signals).',
      'placeholder.query': 'Query string (empty means everything)',
      'placeholder.queryLogql': 'Query string (LogQL, e.g. {job="app"} |= "error"; empty means everything)',
      'placeholder.queryLucene': 'Query string (Lucene: AND / OR / NOT must be uppercase, space means OR, quotes mean phrase; empty = everything)',
      'hint.querySamples': 'Examples:',
      'hint.querySample': 'Click to fill it in: {sample}',
      'placeholder.groupBy': 'container.name',
      'field.target': 'Source',
      'field.window': 'Time window',
      'field.level': 'Level',
      'field.limit': 'Limit',
      'btn.query': 'Run',
      'btn.querying': 'Running…',
      'btn.group': 'Group',
      'btn.grouping': 'Grouping…',
      'btn.refreshFields': 'Refresh',
      'hint.fieldsCount': '{count} fields in total',
      'badge.conflict': 'type conflict',
      'btn.nextPage': 'Next page',
      'btn.clear': 'Clear',
      'btn.fields': 'Fields',
      'btn.densityCompact': 'Compact',
      'btn.densityFull': 'Full',
      'hint.density': 'Compact: each message shows 3 lines (click a row for the full text); Full: the whole message is expanded. The choice is remembered in this browser.',
      'hint.fieldsToggle': 'Show or hide the field panel (columns and filters; it floats over the results and never narrows the log)',
      'meta.sortTime': 'time',
      'meta.sortLevel': 'level',
      'meta.sortMessage': 'message',
      'hint.sort': 'Sort this page: {order}. Click again for the next mode (time / level / message). Only the rows already returned are reordered — the backend has no server-side sort, so paging still follows its own order.',
      'option.15m': 'Last 15 minutes',
      'option.1h': 'Last hour',
      'option.6h': 'Last 6 hours',
      'option.24h': 'Last 24 hours',
      // The "custom" entry only appears after a bar zoom; its copy is computed from the real range (see windowLabel)
      'option.custom': '{from} → {to}',
      'list.noHit': 'No hits (widen the window or loosen the query)',
      // Kept in step with zh: `warn+` instead of `warn and up` — the narrowest column is 96px and the
      // repeated "and up" tail buries the level names. The `+` convention is standard in log viewers,
      // and the full "and up" wording still lives in hint.levelPaged (the boundary sentence).
      'option.levelAny': 'Any',
      'option.levelTrace': 'trace+',
      'option.levelDebug': 'debug+',
      'option.levelInfo': 'info+',
      'option.levelWarn': 'warn+',
      'option.levelError': 'error+',
      'option.levelFatal': 'fatal',
      // The first clause spells out the `+` in the dropdown (warn+ = warn and up): after shortening the
      // labels, this is the only place on screen that still carries the full semantics.
      'hint.levelPaged': 'Levels filter as “and up” (warn+ in the dropdown means warn and up), and only on the returned page (the host’s own semantics): the counts and truncation signals still describe the unfiltered page. Per-level totals need a real level field in the backend — when the index has none (ES often infers the level from the message), the group ranking is empty too.',
      'hint.noChanges': 'No changes in this row',
      'hint.staleResults': 'The query conditions changed — the results below are still from the previous run. Run the query again first; until then “Group” and “Next page” stay off (the paging cursor belongs to the previous query).',
      'hint.rowLabelFilter': 'Add a filter {field} = {value} (remove it via the ranking row or the × on the chip)',
      'hint.rowMoreLabels': '+{count}',
      'hint.rowLabelPanel': 'Show all {count} labels (click one to filter by “field = value”)',
      'btn.closeLabels': 'Close',
      'hint.rowSensitive': 'Row details can contain sensitive fields (raw and labels come verbatim from the log backend)',
      'meta.returned': '{count} rows',
      'meta.matched': '{count} matched',
      'meta.matchedAtLeast': 'at least {count} matched',
      'meta.scannedRows': 'scanned {count} rows',
      'meta.scannedBytes': 'scanned {count} bytes',
      'meta.truncated': 'Truncated: {reasons}',
      'meta.maybeMore': 'Showing the first {count} rows — there may be more; raise the row limit to see further',
      'status.hit_limit': 'hit the row limit',
      'status.hit_limit_maybe': 'may be more',
      'status.max_result_window': 'beyond the result window',
      'status.partial_shards': 'partial shards failed',
      'status.timed_out': 'query timed out',
      'status.scan_cap': 'scan cap reached',
      'status.byte_cap': 'byte cap reached',
      'status.cursor_expired': 'cursor expired',
      'error.needTarget': 'Pick a source first',
      'error.badLimit': 'The limit must be a positive integer',
      'error.badWindow': 'The custom time window is incomplete (bar zoom carries that range; click a bar again, or go back to a preset)',
      'field.dockerTarget': 'Docker target name',
      'field.container': 'Container',
      'field.tail': 'Lines',
      'btn.refresh': 'Refresh',
      'btn.retry': 'Retry',
      'hint.refreshContainers': 'Re-fetches the container list (it changes as containers start and stop; this does not refresh the logs below)',
      'btn.logs': 'Show logs',
      'hint.docker': 'Container logs come from the Docker panel plugin own /api/dsh-docker/logs: no until, a capped tail, and no grep — ask the agent for docker_logs_grep when you need real search.',
      'hint.dockerStale': 'These logs are from the previous fetch, not the current “{container}” — click “View logs” again after changing the conditions.',
      'placeholder.container': 'Search or pick a container',
      'hint.containersCount': '{count} containers',
      'hint.containersMatched': '{count} of {total} matched',
      'hint.dockerMissing': 'This path needs the Docker container panel plugin (not detected): install and enable it to read container logs here.',
      'hint.containersEmpty': 'This Docker target has no running containers (this list only shows running ones).',
      'error.needContainer': 'Pick a container first',
      'option.pickTarget': 'Select source',
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

    /**
     * 查询串输入框的占位提示：**按来源的方言**说，别对所有来源都说 LogQL。
     *
     * 这句原来是写死的「Loki 是 LogQL」——维护者实际用的是 ES，占位符等于在告诉他一个错的
     * 语法名（ES / OpenSearch 走的是 Lucene 的 `query_string`，见 src/backends/elastic.ts 的
     * `capabilities().queryLanguage`）。逐条列字面量、不拼 `'placeholder.query' + kind`
     * ——静态闸门扫不到动态键（同 kindLabel / windowLabel 的注释）。
     *
     * 能力自述要等第一次查询才回来，而占位符在**打字之前**就得对；来源的 kind 是配置里已经
     * 有的东西，用它不制造第二份运行期判据（方言本身仍是宿主说的，这里只挑提示文案）。
     */
    function queryPlaceholder(kind) {
      if (kind === 'elasticsearch' || kind === 'opensearch') return t('placeholder.queryLucene')
      if (kind === 'loki') return t('placeholder.queryLogql')
      return t('placeholder.query')
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

    /*
     * 元信息行那几颗动作按钮的图标（第十八刀）。
     *
     * 为什么图标化：那四个动作（字段 / 紧凑 / 排序 / 清空）在真机上是并排的四块**纯文字**按钮
     * （`字段` `紧凑` `排序：正文` `清空结果`），四段不同长度的字挤在一行里，扫一眼分不出
     * 「哪些是开关、哪些是一次性动作」；而其中「排序」还要把档位名带在按钮上，越换越长。
     * 改成「图标 + 短标签」之后它们有了一眼可辨的形状，宽度也不再随文案浮动。
     *
     * 路径**逐字取自宿主自己的前端产物**（`dsh-web-frontend/dist/assets/index-*.js` 里的
     * `IconFlatListOutlineRegular` / `IconWrapLinesOutlineRegular` / `IconChevronsUpDownOutlineRegular` /
     * `IconTrashOutlineRegular`）。这不是「我画了四颗差不多意思的图标」，是**宿主那四颗**：
     *   - 字段列表 → `IconFlatListOutlineRegular`（行首圆点 + 三条横线，就是「一张清单」）
     *   - 显示密度 → `IconWrapLinesOutlineRegular`（长句折行：正是「完整 / 紧凑」这两档在讲的事）
     *   - 排序 → `IconChevronsUpDownOutlineRegular`（上下双箭头，排序的通用记号）
     *   - 清空 → `IconTrashOutlineRegular`（一次性动作，用宿主自己的删除图标）
     * 描边配方也照抄：`viewBox 0 0 16 16` / `fill:none` / `stroke:currentColor` / `strokeLinecap`
     * （`round` 那几颗有写，`butt` 的就不补——与 CHEVRON 那条注释同一条规矩：不补官方没写的）。
     * `strokeWidth` 一律 **1**（宿主 `…Regular` 那一档就是 1；`…Medium` 是另一档，本卡片不用）。
     */
    const ACTION_ICONS = {
      // IconFlatListOutlineRegular
      fields: {
        strokeLinecap: 'round',
        paths: ['M6 3.5h7.5M6 8h7.5M6 12.5h7.5', 'M2.6 3.5h.01M2.6 8h.01M2.6 12.5h.01'],
        circles: [],
      },
      // IconWrapLinesOutlineRegular（长句折行 → 「完整 / 紧凑」这一档显示密度）
      density: {
        strokeLinecap: undefined,
        paths: [
          'M2.3457 3.19299H13.6541',
          'M2.3457 7.46497H9.19332',
          'M2.3457 11.7369H6.4849',
          'M9.1936 7.46497H11.5183C12.6981 7.46497 13.6544 8.42132 13.6544 9.60103C13.6544 10.7808 12.6981 11.7371 11.5183 11.7371H9.1936',
          'M10.9505 9.7677L9.12262 11.5956C9.04452 11.6737 9.04452 11.8003 9.12262 11.8784L10.9505 13.7063',
        ],
        circles: [],
      },
      // IconChevronsUpDownOutlineRegular
      sort: {
        strokeLinecap: 'round',
        paths: ['m5.1 6 2.9-2.9L10.9 6', 'm5.1 10 2.9 2.9 2.9-2.9'],
        circles: [],
      },
      // IconSearchOutlineRegular（字段过滤框：这个面板唯一的导航方式）
      search: {
        strokeLinecap: undefined,
        paths: [
          'M6.58727 11.8586C9.55061 11.8586 11.9529 9.45637 11.9529 6.49304C11.9529 3.5297 9.55061 1.12744 6.58727 1.12744C3.62394 1.12744 1.22168 3.5297 1.22168 6.49304C1.22168 9.45637 3.62394 11.8586 6.58727 11.8586Z',
          'M10.2991 10.3933L14.7783 14.8725',
        ],
        circles: [],
      },
      // IconTrashOutlineRegular（「清空结果」是一次性动作，用宿主自己的删除图标）
      reset: {
        strokeLinecap: undefined,
        paths: [
          'M1.28149 3.88831H14.7187',
          'M5.41602 3.88833V2.47962C5.41602 2.29282 5.52492 2.11366 5.71876 1.98157C5.9126 1.84948 6.17551 1.77527 6.44964 1.77527H9.55053C9.82466 1.77527 10.0876 1.84948 10.2814 1.98157C10.4753 2.11366 10.5842 2.29282 10.5842 2.47962V3.88833',
          'M2.57349 3.88831L3.19366 13.2943C3.21937 13.5502 3.33952 13.7872 3.53065 13.9593C3.72178 14.1313 3.97016 14.2259 4.22729 14.2246H11.7728C12.0299 14.2259 12.2783 14.1313 12.4694 13.9593C12.6605 13.7872 12.7807 13.5502 12.8064 13.2943L13.4266 3.88831',
        ],
        circles: [],
      },
    }

    /**
     * 画一颗宿主图标（16×16、描边 1、`currentColor`）。
     *
     * `strokeLinejoin` 只在宿主写了的那几颗上出现（`Compact` 有、`FlatList` 没有）——
     * 与 CHEVRON 那条注释同一条规矩：**不补官方没写的**（补了形状就不完全一样）。
     */
    function actionIcon(name) {
      const icon = ACTION_ICONS[name]
      if (icon === undefined) return null
      const svg = {
        width: '14',
        height: '14',
        viewBox: '0 0 16 16',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: CHEVRON_STROKE,
        xmlns: 'http://www.w3.org/2000/svg',
        'aria-hidden': 'true',
        className: 'll_actionIcon',
      }
      if (icon.strokeLinecap !== undefined) svg.strokeLinecap = icon.strokeLinecap
      return jsx('svg', {
        ...svg,
        children: [
          ...icon.paths.map((d, at) => jsx('path', { d }, 'll-action-path-' + name + '-' + String(at))),
          ...icon.circles.map((circle, at) => jsx('circle', circle, 'll-action-circle-' + name + '-' + String(at))),
        ],
      })
    }

    function LoglensSettingsCard(props) {
      // DSH ≥0.1.6 的插件配置页把同一条目按 view 渲染两次：summary 一句话摘要、page 完整表单。
      const view = props && props.view
      const pageView = view === 'page'
      const [open, setOpen] = React.useState(pageView)
      /*
       * 「来源」那块配置区展开没有（第十五刀）。
       *
       * 默认值两份、按**这一页在干什么**分：
       *   - 设置卡（summary / 点开的那张卡）：配来源就是主任务 → **默认展开**；
       *   - 插件整页（`view === 'page'`）：主人是「查日志」→ **默认收起**，只留一行摘要。
       *
       * 为什么不在收起态把两行表单渲染成 `display:none`：那还是会占着 React 树，而这里更实际的
       * 理由是可读性——收起时**不画**，屏幕与无障碍树里就真的没有那两行（不是一个「看不见但在」的表单）。
       */
      const [sourcesOpen, setSourcesOpen] = React.useState(!pageView)
      const [enabled, setEnabled] = React.useState(true)
      const [drafts, setDrafts] = React.useState([])
      /*
       * 「上次落盘时每一行长什么样」（第四十一刀）：按 id 索引，用来判断某一行**改过没有**。
       *
       * 为什么不复用 `drafts` 自己比：编辑就地改的就是那一份，改完就没有「原来那份」了。
       * 快照只在 `applyConfig` 里跟着服务端那份一起刷新——那也是唯一真正落盘的时刻
       * （保存成功后会重新读一次配置），所以它天然与「已保存」对齐，不需要另写同步逻辑。
       */
      const [savedDrafts, setSavedDrafts] = React.useState({})
      const [error, setError] = React.useState('')
      const [ok, setOk] = React.useState('')
      const [loading, setLoading] = React.useState(false)
      const [saving, setSaving] = React.useState(false)
      const [query, setQuery] = React.useState(emptyQuery)
      /*
       * 直方图上「点一根柱放大」的结果：**正在放大在哪一档**（`{ from, to }`，用来把那一档
       * 高亮出来）与**它是不是被下限夹过**（界面要如实说一句，不许静默收窄）。
       *
       * 窗口本身**不在 state 里**——它在 `query.window`（草稿自带，见 pure.js 的 `zoomToBar`）。
       * 理由：查询一律经 `runQuery(append, override)` 发出去，`override` 是「这一次要用哪份
       * 草稿」；窗口若另存一份 state，点柱子那一枪读到的就还是上一轮的值（D04 那一类：
       * 说的和查的不是一件事）。这两项只是**给眼睛看的回显**，不参与请求。
       */
      const [zoomedBar, setZoomedBar] = React.useState(undefined)
      /*
       * 直方图上悬停 / 聚焦中的那一根（第十六刀）：存 **ts**（这个窗口里稳定的键），
       * 不存整根柱——柱子每次渲染都是新对象，存它等于让读数条显示一份可能过期的快照。
       */
      const [hoverBar, setHoverBar] = React.useState(undefined)
      const [zoomClamped, setZoomClamped] = React.useState(false)
      /*
       * 放大**之前**是哪一档（取消放大时回到它，见 pure.js 的 `unzoomQuery`）。
       *
       * 为什么不能从草稿反推：窗口一旦改成 `custom`，草稿里就没有任何地方能看出原来选的是
       * 15 分钟还是 24 小时了。随手回落一个默认档就是「替用户改窗口」——他点那一下的意思明明是
       * 「我不放大了」。这三项都是**界面的放大回显**，与请求无关（请求读的是草稿）。
       */
      const [zoomFrom, setZoomFrom] = React.useState('')
      const [outcome, setOutcome] = React.useState(undefined)
      /*
       * 屏幕上这份结果**是哪一份草稿跑出来的**（查询成功那一刻的有效草稿）。
       *
       * 只用来回答一个诚实问题：「查询条件改了，下面还是上一次的结果」。判据在
       * pure.js 的 `queryStale`——这里存的是**真正发出去的那一份**（含回落后的来源），
       * 不是点按钮那一刻的闭包值（下钻 / 放大都走 override，那才是真正查的那份）。
       * 它同时是「下一页」的闸：ES 的游标是 PIT + search_after，拿旧游标配新条件翻页
       * 不会报错，只会静默少行 / 错位。
       */
      const [lastRun, setLastRun] = React.useState(undefined)
      const [lines, setLines] = React.useState([])
      /*
       * 结果表的额外列（用户从左侧字段栏点「列」加上来的）。存**字段名**，不存值：
       * 值随每一行读 `line.labels[field]`（见 pure.js 的 columnValue）——存值就成了第二份会过期的东西。
       * 上限在 pure.js 的 columnToggle 里（4 列），这里不另写一条。
       */
      const [columns, setColumns] = React.useState([])
      /*
       * 行详情展开的是哪一行（`line.id`）。一次只开一行：日志是一条条往下扫的清单，
       * 同时展开多行会把列表撑得找不到下一行；换一行时上一行自己收起。
       */
      const [expandedId, setExpandedId] = React.useState(undefined)
      /*
       * 显示密度：**默认完整**（正文全展开，看日志不用一条条点开），切到紧凑才 clamp 3 行。
       *
       * 为什么默认完整：维护者原话「之前的模式看日志更方便」——对「读日志」这件事，少一次点击比
       * 一屏多看几行重要；紧凑是给「扫一眼找异常」的补充，不是替代。选择记在 localStorage 里，
       * 下次打开还是上次那一种（拿不到 localStorage 就每次默认完整，不报错）。
       */
      const [denseResults, setDenseResults] = React.useState(() => {
        try {
          return typeof localStorage === 'object' && localStorage !== null && localStorage.getItem('loglens.density') === 'compact'
        } catch {
          return false
        }
      })
      /*
       * 「本页排序」的档位（第十三刀）：`time` = 宿主原序（唯一与翻页游标同源的顺序，默认它）。
       *
       * 它是**纯展示**：不发请求、不改草稿，也不进入「条件改了」的判据（`queryStale` 只看草稿）——
       * 排序不改变查的是什么，只是把同一页按另一种看法摆出来。
       */
      const [sortBy, setSortBy] = React.useState(() => {
        try {
          return typeof localStorage === 'object' && localStorage !== null ? localStorage.getItem('loglens.sort') : 'time'
        } catch {
          return 'time'
        }
      })
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
      /*
       * 「＋N」点开的**全部标签**浮层：`{ id, top, left }` 或 `undefined`。
       *
       * 行上只摆 1 个身份标签之后，其余标签得有个看得见、点得动的去处——就是这里。
       * 存的是**视口坐标**：浮层用 `position:fixed` 画在 `.ll_results`（`overflow-y:auto`）
       * 外面，否则会被那个滚动容器裁掉（列表只有 420px 高）。
       * `id` 是行 id，浮层里显示的是**那一行**的全部标签（列表刷新后行没了就不画）。
       */
      const [labelPanel, setLabelPanel] = React.useState(undefined)
      // 浮层里「当前那一行」（方向键挪它、回车取它；打字时回到第一条）
      const [pickIndex, setPickIndex] = React.useState(0)
      // 此刻要摆的候选（纯判据在 pure.js 的 fieldChoices：子串过滤 / 保持宿主顺序 / 命中 0 个回空）
      const choices = pickOpen ? fieldChoices(fields, groupBy) : []
      const [fieldsNote, setFieldsNote] = React.useState('')
      // 这个来源一共有多少字段（宿主回的 total）：**面板不传 limit，所以列出来的就是全部**——
      // 页脚报这个数（Kibana 那边是把长度交给界面去消化，我们这里至少让「有多长」看得见）
      const [fieldsTotal, setFieldsTotal] = React.useState(0)
      const [fieldsError, setFieldsError] = React.useState('')
      // 在途闩：同一来源正在拉的途中不要再来一枪（一次点击会先 focus 再 click，见 loadFields）
      const fieldsFlightRef = React.useRef('')
      /*
       * 字段面板**默认收起、展开也是浮层**（维护者真机两轮反馈：「这个有点占地方，用着也不方便」
       * → 「这个挪走吧」）：它不该在布局里占宽度。要用「列 / 筛」时从元信息行点「字段」浮出来，
       * 点面板外那层遮罩或再点一次收起；看日志时宽度全归日志。
       */
      const [fieldsOpen, setFieldsOpen] = React.useState(false)
      /*
       * 触发面板那一颗按钮的**视口坐标**（第二十刀）：面板据此贴在它下方展开。
       *
       * 为什么要存而不是每次渲染现量：面板与按钮不在同一个定位上下文里（按钮在元信息行、
       * 面板是 fixed 浮层），现量要跨两个 ref 做坐标换算；而「展开位置」本来就该是
       * **点下去那一刻**的位置——窗口滚动后按钮挪了，面板跟着挪反而会飘。
       *
       * 第三十刀起只有一个入口了（筛选行那颗「＋ 筛选」连它的弹层一起退场），所以这里
       * 不再需要 `trigger` 与 `panelToggle` 那套「换一颗 = 换锚点」的判据——面板只属于「字段」。
       */
      const [fieldsAnchor, setFieldsAnchor] = React.useState(undefined)
      // 字段侧栏的过滤词（**多词 AND**，见 pure.js 的 fieldFilterTerms / fieldSections）
      const [fieldFilter, setFieldFilter] = React.useState('')
      /*
       * 字段分组的展开状态（第二十一刀）：键是 `分区::组`，值是用户点过的结果。
       *
       * 为什么要「用户点过的」而不是直接存全部状态：默认值**按情形算**（见 groupOpen），
       * 用户点过的那一组以他的选择为准——不点就每换一次过滤词都被重置回默认。
       */
      const [groupOverride, setGroupOverride] = React.useState({})
      /*
       * 查询串里**字段名补全**的三件状态（第三十四刀）。
       *
       * 为什么要有它：这台来源的面板列 **92 个字段**（`_cat` 口径下的全集群是 1657，面板只列
       * 这个来源自己的索引），而**打错一个下划线就是静默
       * 0 条**（`container_name:prometheus` → 0，`container.name:prometheus` → 240）。这不只是
       * 好不好用的问题，是一种「有结果、看不出错」的故障。
       *
       *   - `qOpen`：候选浮层开着没有。它**只在字段名那一侧**开（判据见 pure.js 的
       *     `fieldCompletion`：光标已经过了 `:` 就是值那一侧，这一刀不管值）。
       *   - `qIndex`：候选里「当前那一行」（方向键挪它、回车取它）。−1 = 没选中。
       *   - `qCaret`：**光标位置**。它有两个用处：算候选（光标前那个词才是要补的），
       *     以及补完之后把光标摆回冒号后面。受控 input 的 `value` 是 React 给的，
       *     光标不会自己留在原地——不记这一份，补全之后光标会跳到末尾。
       */
      const [qOpen, setQOpen] = React.useState(false)
      const [qIndex, setQIndex] = React.useState(-1)
      const [qCaret, setQCaret] = React.useState(0)
      // 查询串那一格的 DOM 句柄（补 / 挪光标要用；与 fxValueRef 同一条理由）
      const qInputRef = React.useRef(null)
      /*
       * 两段式筛选框（第三十刀）：`{ field, value }`。
       *
       * 左格是字段（可打可挑）、右格是值（可打可挑该字段的 top 值）。两个入口——「＋ 筛选」
       * 那颗按钮与它背后的整块字段弹层——都退场了：它们的职责（选字段 / 看 top 值 / 点值筛选 /
       * 手填一个值）**全部**落在这一格里。两个入口做同一件事的代价是判据漂两份（第二十五到
       * 第二十九刀一共在它们之间搬了三次家），这次收成一处。
       */
      const [fxField, setFxField] = React.useState('')
      const [fxValue, setFxValue] = React.useState('')
      /*
       * 此刻张着的是哪一格的下拉（`'field'` / `'value'` / `undefined`）。
       *
       * 两格**互斥**：同一时刻只有一个下拉在屏幕上。两格同时张开会让「方向键现在挪的是哪一张
       * 清单」变成一个猜谜（分组框那边没有这个问题——它只有一格）。
       */
      const [fxOpen, setFxOpen] = React.useState(undefined)
      // 下拉里「当前那一行」（−1 = 没选中：值那一格允许打任意串，见 pure.js 的 choiceMove）
      const [fxIndex, setFxIndex] = React.useState(-1)
      /*
       * 值那一格的 DOM 句柄（只用于**把焦点挪过去**）。
       *
       * 真机读数（第三十刀第二版）：从左格选中一个字段之后，焦点还留在左格——用户接着打字，
       * 字打到的是**字段名**而不是值。选字段的下一个动作必然是填值（这也是右格自动张开的原因），
       * 所以焦点要跟着一起过去。
       */
      const fxValueRef = React.useRef(null)
      /*
       * 值清单的缓存：键是 `fieldValuesKey`（字段 + 来源 + 窗口 + 查询串 + 筛选），值是那一格的状态。
       * 键里带全条件，所以「条件一变，旧的答案自动不会被读到」——不需要手动清缓存（清了反而要
       * 多写一条「什么时候清」，而那正是会忘的地方）。
       */
      const [valueCache, setValueCache] = React.useState({})
      const [querying, setQuerying] = React.useState(false)
      const [docker, setDocker] = React.useState(false)
      const [containers, setContainers] = React.useState([])
      const [container, setContainer] = React.useState('')
      /*
       * 容器那一格的自绘候选（第三十九刀）：开没开、当前光标在哪一行、输入框里打的字。
       *
       * 三个状态分开存，是因为它们回答的是三个不同的问题：`open` 是「现在要不要画这一层」，
       * `index` 是「方向键挪到哪了」（−1 之外的合法档位，见 pure.js 的 pickMove），
       * `query` 是「收窄用的字」——它**不等于**选中的容器（`container` 才是）：
       * 打完字没选就点别处，输入框要退回显示选中的那个，而不是留着一个没生效的搜索词。
       *
       * **`query` 是三态的：`null` / `''` / 非空串**（第四十三刀，用户报的「输入框无法清空」）。
       *
       *   - `null` = **没有在搜**，这一格显示选中的容器名；
       *   - `''`   = **在搜、且搜索词是空的**（用户把字全删了）——这时显示的就是空；
       *   - 其余   = 在搜，显示那一串。
       *
       * 为什么非要这个 `null`：原来只有「空串 / 非空」两态，显示值写成
       * `query !== '' ? query : containerLabel`——于是**把字删光的那一刻会被判成「没在搜」**，
       * 输入框立刻弹回选中的容器名。表现出来就是「最后一个字永远删不掉」：删到 1 个字时
       * 显示的还是那 1 个字，再按一次 Backspace，`query` 变成空串、显示值又变回 `app-svc-1`。
       * 受控输入回的 `value` 不由用户决定时，浏览器就会像卡住一样。
       */
      const [containerOpen, setContainerOpen] = React.useState(false)
      const [containerIndex, setContainerIndex] = React.useState(0)
      const [containerQuery, setContainerQuery] = React.useState(null)
      const [dockerLogs, setDockerLogs] = React.useState('')
      const [dockerOpened, setDockerOpened] = React.useState(false)
      /*
       * 这批日志是**按什么条件**拉回来的（`容器|时间窗|行数`）。
       *
       * 为什么要有它（第三十八刀，真机抓到的静默错误）：Docker 那一档的日志**不随条件自动刷新**
       * （它是一次「看日志」按下来的快照，见 openDockerLogs）。于是换个容器之后，屏幕上那份日志
       * 还是**上一个容器**的，而界面上没有任何一个字提示这件事——用户会拿着 A 容器的日志排查 B 容器。
       *
       * 与 ES 那边 `hint.staleResults` 是**同一条判据**（条件变了、结果还是上一次的，必须说出来），
       * 只是那边判的是查询串，这边判的是容器/窗口/行数这三个。
       */
      const [dockerRan, setDockerRan] = React.useState('')
      const [dockerTail, setDockerTail] = React.useState(200)
      const [dockerBusy, setDockerBusy] = React.useState(false)
      const [dockerTargets, setDockerTargets] = React.useState([])
      // 这份容器清单属于谁（缓存键：来源 id + Docker 目标名，见 pure.js 的 containersKey）
      const [containersSource, setContainersSource] = React.useState('')
      // 容器清单自己在途（与 dockerBusy 分开：那个是「看日志」的忙，两个转的圈不是一件事）
      const [containersBusy, setContainersBusy] = React.useState(false)
      // 拉容器清单失败时宿主那句话（只落在这一格，不动卡片顶部那条错误行）
      const [containersError, setContainersError] = React.useState('')
      // 在途闩：同一个键正在拉的途中不要再来一枪（换目标连着点两下时别打两枪同一份）
      const containersFlightRef = React.useRef('')

      /** 宿主回什么就照什么渲染：一切状态以服务端那份为准，不在本地做乐观合并。 */
      const applyConfig = React.useCallback((payload) => {
        const next = payload && payload.config ? payload.config : { enabled: true, targets: [] }
        setEnabled(next.enabled !== false)
        const list = (Array.isArray(next.targets) ? next.targets : []).map(draftFromTarget)
        setDrafts(list)
        // 快照与草稿**同源**：两者都来自这一份服务端配置，比较才有意义（各自算一份就会各漂各的）
        setSavedDrafts(Object.fromEntries(list.filter((draft) => draft.id !== '').map((draft) => [draft.id, draft])))
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

      /**
       * 一次展示用的时间格式：本地时间到毫秒（日志排查里毫秒常常就是线索）。
       *
       * `withDate` 给「自定义窗口」那一档用：放大出来的窗口可能跨天（点一根 6 小时档的柱子），
       * 只写 `HH:mm:ss` 会让人读成「今天那一段」——跨天时把日期一起写出来。
       */
      function formatTime(ms, withDate) {
        const date = new Date(ms)
        const pad = (value, width) => String(value).padStart(width, '0')
        const clock = pad(date.getHours(), 2) + ':' + pad(date.getMinutes(), 2) + ':' + pad(date.getSeconds(), 2) + '.' + pad(date.getMilliseconds(), 3)
        return withDate === true
          ? pad(date.getMonth() + 1, 2) + '-' + pad(date.getDate(), 2) + ' ' + clock
          : clock
      }

      /**
       * 时间窗预设的文案：逐条列字面量，别用 'option.' + key 拼（静态闸门扫不到动态键）。
       *
       * `custom` 档（点柱放大）**必须**在这里有分支：漏了它下拉就显示裸键名 `custom`
       * ——下拉说的那一项与真正用的那一项不是同一个判断（loglens D04）。文案按**真实范围**
       * 现算，所以这里读的是当前草稿里的那一段（`query.window`），不是另存的一份。
       */
      function windowLabel(key) {
        if (key === '15m') return t('option.15m')
        if (key === '1h') return t('option.1h')
        if (key === '6h') return t('option.6h')
        if (key === '24h') return t('option.24h')
        if (key === 'custom' && windowProblem(query.window) === '') {
          return t('option.custom', { from: formatTime(query.window.from, true), to: formatTime(query.window.to, true) })
        }
        return key
      }

      /**
       * 级别下拉的文案：逐条列字面量，别用 'option.level' + key 拼（静态闸门扫不到动态键）。
       * 空串 = 不限（不是「trace」——那两者差着整档）。
       */
      function levelLabel(key) {
        if (key === '') return t('option.levelAny')
        if (key === 'trace') return t('option.levelTrace')
        if (key === 'debug') return t('option.levelDebug')
        if (key === 'info') return t('option.levelInfo')
        if (key === 'warn') return t('option.levelWarn')
        if (key === 'error') return t('option.levelError')
        if (key === 'fatal') return t('option.levelFatal')
        return key
      }

      /**
       * 排序档位的名字（第十三刀；**第十八刀起它也是按钮上唯一的字**）。
       *
       * 历史：原先有两个出口——`sortLabel`（按钮上的整句「排序：时间」）与 `sortName`（档位名「时间」）。
       * 图标化之后按钮上只剩档位名（「这是排序」由图标说），`sortLabel` 与 `btn.sortTime|Level|Message`
       * 三个目录键一起退场——留着就是三个再也不会被显示的死字符串。
       *
       * `{order}` 收的必须是**档位名**（第一版塞了整句，真机画出来是「本页排序：排序：时间」）。
       * 逐条列字面量（与 kindLabel / levelLabel 同一条：动态拼 `'meta.sort' + key` 静态 i18n 闸门扫不到）。
       */
      function sortName(mode) {
        if (mode === 'level') return t('meta.sortLevel')
        if (mode === 'message') return t('meta.sortMessage')
        return t('meta.sortTime')
      }

      /** 截断理由 → 文案（同样逐条列字面量）。 */
      function reasonText(reason) {
        if (reason === 'hit_limit') return t('status.hit_limit')
        if (reason === 'hit_limit_maybe') return t('status.hit_limit_maybe')
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
          // `stepMs` 跟着柱子一起存：点柱放大要知道**这一根有多宽**（就是这一档分桶的宽度）。
          // 不另存一份 state——两处各算一次必然漂（窗口换了档位、点下去却按旧档位夹）。
          setHistogram(bars.bars.length === 0 ? undefined : { ...bars, interval: step.key, stepMs: step.ms })
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
          setError(problem === 'needTarget'
            ? t('error.needTarget')
            : problem === 'badWindow' ? t('error.badWindow') : t('error.badLimit'))
          return
        }
        setQuerying(true)
        setError('')
        setOk('')
        try {
          // 窗口随草稿走（`effective.window`，见 pure.js 的 zoomToBar）：这里**不再**读任何
          // 组件状态——那正是「点柱子第一枪查的还是旧窗口」那条老路。
          const payload = queryPayload(effective, drafts, Date.now())
          if (append && cursor !== undefined) payload.cursor = cursor
          const data = await api('/api/dsh-loglens/query', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          })
          setOutcome(data)
          // 记下**这一枪真正用的那份草稿**（含回落后的来源、以及 override 里刚算出的筛选 /
          // 窗口）：界面据此判断「下面这份结果还是不是当前条件的」。只在成功时记——失败时
          // 屏幕上留着的还是上一次那份。
          setLastRun(effective)
          setLines((current) => (append ? appendLines(current, data.lines) : data.lines))
          // 翻页是**追加**（已展开的行还在），重查是**换一整份**（旧行没了，展开态必须跟着收）
          if (!append) setExpandedId(undefined)
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
       * 查询栏里的输入框按回车 = 点「查询」（同一条路：都走 `runQuery(false)`）。
       *
       * 为什么值这一行：查一次是这一整格里最常做的事，而「打完字 → 手离开键盘 → 移到鼠标 →
       * 点按钮」每天要重复几十次。回车是最不需要解释的那一个键（浏览器里所有搜索框都是它）。
       *
       * 在途 / 保存中不重复发（与按钮的 `disabled` 同一条件）：按钮那一刻点不动，回车也该发不出去
       * ——否则出现「按钮灰着但还能打枪」这种两套说法。
       */
      const runOnEnter = (event) => {
        if (event.key !== 'Enter') return
        if (saving || querying) return
        runQuery(false)
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

      /** 在「完整 / 紧凑」之间切换，并把选择记在本机浏览器里（拿不到 localStorage 就只在本次生效）。 */
      const toggleDensity = () => {
        setDenseResults((current) => {
          const next = !current
          try {
            if (typeof localStorage === 'object' && localStorage !== null) {
              localStorage.setItem('loglens.density', next ? 'compact' : 'full')
            }
          } catch {
            /* 私隐模式 / 存储满：切换照常生效，只是不记住 */
          }
          return next
        })
      }

      /**
       * 「本页排序」（第十三刀）：在**时间倒序 / 严重度 / 正文**三档之间循环，并记在本机浏览器里
       * （与显示密度同一条：那是「这个人怎么看日志」的偏好，不是这台日志的来源配置）。
       *
       * 为什么是循环而不是三颗按钮：元信息行已经有「字段 / 紧凑 / 清空结果」三颗，再加两颗会把
       * 一行挤成两行；而这一个动作只有三档、顺序固定，循环点是最省的入口。当前档位写在按钮上
       * （「排序：严重度」），不靠图标让人猜。
       */
      const cycleSort = () => {
        const keys = sortKeys()
        setSortBy((current) => {
          const at = keys.indexOf(sortKeyOf(current))
          const next = keys[(at + 1) % keys.length]
          try {
            if (typeof localStorage === 'object' && localStorage !== null) {
              localStorage.setItem('loglens.sort', next)
            }
          } catch {
            /* 私隐模式 / 存储满：切换照常生效，只是不记住 */
          }
          return next
        })
      }

      /**
       * 字段侧栏点「列」：加一列 / 去掉同一列（同一个入口是全集的开与关）。
       * 满员时把 pure.js 那条判据翻成人话落在错误行上——点不动却不说为什么，比不给这个入口更坏。
       */
      const toggleColumn = (field) => {
        const result = columnToggle(columns, field)
        if (result.problem === 'columnLimit') {
          setError(t('hint.columnLimit', { count: RESULT_COLUMN_MAX }))
          return
        }
        if (result.problem !== '') return
        setColumns(result.columns)
        setError('')
      }

      /** 去掉某一列（列芯片上的 × 与侧栏的「列」是同一个开关）。 */
      const removeColumn = (field) => {
        setColumns(columnToggle(columns, field).columns)
      }

      /**
       * 字段面板的开关与锚点（第二十刀定位）。
       *
       * 点开时记下**按钮此刻在屏幕上的位置**：存视口坐标而不是相对父容器的偏移，因为面板是
       * `position:fixed`，与按钮不在同一个定位上下文里（换算相对坐标反而多一层错）。
       *
       * 第三十刀起只剩一个入口（筛选行那颗「＋ 筛选」与它的弹层一起退场），所以这里不再需要
       * 「哪一颗按的」——同一颗再点就是收起，横向永远右缘对齐（那颗按钮在整行右侧）。
       */
      const toggleFields = (event) => {
        if (fieldsOpen) {
          setFieldsOpen(false)
          return
        }
        const el = event === null || event === undefined ? undefined : event.currentTarget
        const rect = el !== undefined && el !== null && typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : undefined
        setFieldsAnchor(rect === undefined ? undefined : {
          align: 'right',
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          top: Math.round(rect.top),
          bottom: Math.round(rect.bottom),
        })
        setFieldsOpen(true)
      }

      /**
       * 拉某个字段的 top 值给筛选框的右格用（第三十刀：原来只服务侧栏的展开区）。
       *
       * 三条判据（原来那三条照旧）：
       *   - 这一格里**已经有同一份条件的答案**就不重问（缓存键带全条件，见 fieldValuesKey）；
       *   - 拿不到窗口（还没查过 / 回显不全）就不发请求，直接说「先查一次」——
       *     发一个没有窗口的聚合请求只会得到后端一句莫名其妙的报错；
       *   - 来源不支持聚合（Loki）就不发（调用方已经先说清为什么，见 openValueChoices）。
       */
      const loadFieldValues = async (field) => {
        const key = fieldValuesKey(query, outcome, field)
        if (key === null) {
          setValueCache((current) => ({ ...current, ['!no-window::' + field]: { state: 'error', error: t('error.fieldValuesWindow') } }))
          return
        }
        setValueCache((current) => ({ ...current, [key]: { state: 'loading' } }))
        const payload = fieldValuesPayload(query, outcome, field, FIELD_VALUES_SIZE)
        if (payload === null) {
          setValueCache((current) => ({ ...current, [key]: { state: 'error', error: t('error.fieldValuesWindow') } }))
          return
        }
        try {
          const parsed = await api('/api/dsh-loglens/facets', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          })
          setValueCache((current) => ({
            ...current,
            [key]: { state: 'ok', buckets: Array.isArray(parsed.buckets) ? parsed.buckets : [], warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [] },
          }))
        } catch (err) {
          setValueCache((current) => ({ ...current, [key]: { state: 'error', error: err.message } }))
        }
      }

      /** 某个字段此刻的 top 值那一格（没到 / 在途 / 失败 / 有值；键带全条件）。 */
      const valuesOf = (field) => {
        const key = fieldValuesKey(query, outcome, field)
        return key === null ? valueCache['!no-window::' + field] : valueCache[key]
      }

      /**
       * 打开**值**那一格的下拉：先把那一格张开，再按需拉一次 top 值。
       *
       * 「先开、再拉」与分组候选同一条（见 openPick）：开是立刻的，下拉里立刻有「加载中…」这
       * 一格，不会出现「点了没反应」。同一个字段同一份条件已经拉过就不重拉（键带全条件）。
       */
      const openValueChoices = (field) => {
        setFxOpen('value')
        setFxIndex(-1)
        const name = String(field == null ? '' : field).trim()
        if (name === '') return
        // 不支持聚合（Loki）：发了也只会回一句报错，直接说清为什么（与分布 / 榜同一条）
        if (supportsAggregation(outcome) !== true) return
        const key = fieldValuesKey(query, outcome, name)
        if (key !== null && valueCache[key] !== undefined) return
        void loadFieldValues(name)
      }

      /**
       * 点下拉里的一个字段：填进左格、**清空右格**、接着把右格打开——选字段的下一步必然是填值，
       * 让人再点一下右格是纯白给的一步（与「点开就拉」同一条判据）。
       *
       * **右格必须清空**（第三十一刀，真机抓到的静默错误）：原来这里刻意「不动用户打的字」，
       * 听着体贴，实际代价是把上一个字段的值安到新字段上，而且回车就能提交：
       *
       *     选 host.name → 右格打 node-1 → 改选 container.name → 回车
       *     → 芯片变成 container.name = node-1     ← 静默筛错，没人会发现
       *
       * 判据是**值属于字段**，不是属于这一格。换了字段，上一格的字就不再是「这个字段的值」，
       * 留着它只会变成一个看起来还能按的错条件。所以换字段 = 换一个要填的空。
       *
       * 同一个字段重复点选（`name` 没变）**不**清空：那是「重选同一个」，把用户刚打的字抹掉
       * 才是真的捣乱。
       */
      const pickFilterField = (name) => {
        if (String(name) !== fxField) setFxValue('')
        setFxField(name)
        setFxIndex(-1)
        openValueChoices(name)
        // 焦点跟着挪到右格（否则接着打的字会打进字段名里，见 fxValueRef 的注释）
        const el = fxValueRef.current
        if (el !== null && el !== undefined && typeof el.focus === 'function') el.focus()
      }

      /**
       * 提交两段式筛选框：走的是与行上标签 / 榜上下钻**同一个** `drillDown`（加一条结构化
       * 筛选并立刻重查）。空值不发——筛选表达不了「字段缺失」（filterProblem 那条）。
       *
       * 提交完把两格清空、收起下拉：这两格是**往里加**一条条件的入口，条件已经生效之后
       * 留着上一次的字，会让下一条条件的开头是上一笔的残留。
       */
      const submitFilter = async (field, value) => {
        const problem = filterProblem(field, value)
        if (problem !== '') {
          setError(problem === 'needFilterField' ? t('error.needFilterField') : t('error.needFilterValue'))
          return
        }
        setFxOpen(undefined)
        setFxIndex(-1)
        setFxField('')
        setFxValue('')
        await drillDown(field, value)
      }

      /**
       * 「＋N」→ 打开这一行的**全部标签**浮层；再点同一颗 = 收起。
       *
       * 位置锚在**点它的那颗按钮**上（视口坐标，`getBoundingClientRect`），并夹在视口内：
       * 行贴着列表底边时往下开会被裁掉——那种情况下往上收（`top` 取 `bottom + 4` 与
       * `vh - 300` 的较小值，配合浮层 `max-height` 不会完全跑出屏）。窗口尺寸拿不到
       * （无浏览器 / 测试桩）就退回一个固定位置：**能打开**比位置精确重要。
       */
      const openLabelPanel = (event, line) => {
        if (labelPanel !== undefined && labelPanel.id === line.id) {
          setLabelPanel(undefined)
          return
        }
        const el = event === null || event === undefined ? undefined : event.currentTarget
        const rect = el !== undefined && el !== null && typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : undefined
        const width = 320
        const margin = 8
        const vw = typeof window === 'object' && window !== null && Number.isFinite(window.innerWidth) ? window.innerWidth : 0
        const vh = typeof window === 'object' && window !== null && Number.isFinite(window.innerHeight) ? window.innerHeight : 0
        const rawLeft = rect === undefined ? 120 : rect.right - width
        const rawTop = rect === undefined ? 120 : rect.bottom + 4
        const left = vw > 0 ? Math.min(Math.max(margin, rawLeft), Math.max(margin, vw - width - margin)) : Math.max(margin, rawLeft)
        const top = vh > 0 ? Math.min(Math.max(margin, rawTop), Math.max(margin, vh - 300)) : rawTop
        setLabelPanel({ id: line.id, top: Math.round(top), left: Math.round(left) })
      }

      const closeLabelPanel = () => setLabelPanel(undefined)

      /** 浮层里的键盘出口：焦点在任何一行上按 Esc 都收起（点背景 / 关闭按钮也行）。 */
      const closeOnEscape = (event) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        closeLabelPanel()
      }

      /**
       * 点直方图上一根柱 = 把时间窗夹到那一档（放大）。与「点榜上一行」是同一个套路：
       * 改草稿 → **立刻重查一遍**（不拿本地行数糊一个结果）→ 行、分布、榜三处一起收窄。
       *
       * 三条判据：
       * ① 窗口由**草稿**带着走（`zoomed.query.window` + `preset: 'custom'`），经 `runQuery` 的
       *    override 参数进这一枪——**不许**另存一份 state 再在 `runQuery` 里读闭包（那样第一枪
       *    读到的还是旧窗口：`preset` 写成 `custom`，发出去的却是一小时）；
       * ② 一次查询期间连点多根柱：**后一次盖掉前一次**（`zoomedBar` 记的是当前放大在哪一档），
       *    所以看图就知道「现在是哪一档放大着」；
       * ③ 被下限夹过（`clamped`）时**说出来**——那一行写着「已放大到最短 1 分钟」，
       *    让人知道窗不是他点的那么宽；
       * ④ **再点一次取消**（照点榜下钻「再点一次取消」的既有交互）：点的是**正放大着的那一档**
       *    （就是高亮的那根）就回到放大之前那一档。判据与高亮**同一条**（`zoomedBar.from`）：
       *    高亮哪一根、点哪一根能撤销，说的是同一件事。
       */
      const zoomToBarAt = async (barTs, barStepMs) => {
        if (querying) return
        // 取消放大：只撤窗口与回显，查询串 / 筛选 / 条数 / 级别一律不动
        if (zoomedBar !== undefined && zoomedBar.from === barTs) {
          const back = unzoomQuery(query, zoomFrom)
          if (back === null) return
          setQuery(back)
          setZoomedBar(undefined)
          setZoomClamped(false)
          setZoomFrom('')
          await runQuery(false, back)
          return
        }
        const zoomed = zoomToBar(query, barTs, barStepMs)
        if (zoomed === null) return
        setQuery(zoomed.query)
        setZoomedBar(zoomed.query.window)
        setZoomClamped(zoomed.clamped)
        /*
         * 记下「从哪一档放大的」：已经是 `custom` 时**保留原有的那一档**——连点多根柱是
         * 「在同一次放大里挪窗口」，取消时该回到**最初**那一档，而不是回到上一个自定义段
         * （`custom` 不是用户能挑的一档，见 `windowChoices`）。
         */
        setZoomFrom(query.preset === 'custom' ? zoomFrom : query.preset)
        // 草稿原样带上（窗口与筛选都在里面），**不再**拼第三份东西
        await runQuery(false, zoomed.query)
      }

      /** 换预设（下拉）：把上一次的放大回显清掉——它属于上一次查询，不该跟着新窗口走。 */
      const changePreset = (preset) => {
        // 窗口也一并撤掉：留着它就成了「下拉写着 1 小时、草稿里还夹着自定义段」的第二份真相
        setQuery((current) => {
          const next = { ...current, preset }
          delete next.window
          return next
        })
        setZoomedBar(undefined)
        setZoomClamped(false)
        setZoomFrom('')
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
       * 缓存按它判（`fieldFetchNeeded`）。**`limit` 不传 = 要全部**（2026-10-14 对齐 Kibana：宿主的默认
       * 就是「不截断」，所以候选里摆的就是这个来源的全部字段；有多长由页脚的 total 报出来）。
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
          // total 是宿主的权威数字；缺了就退回这份清单的长度（面板不传 limit，两者本来就相等）
          setFieldsTotal(typeof parsed.total === 'number' ? parsed.total : list.length)
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
          setFieldsTotal(0)
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

      /**
       * 拉容器清单。**不需要点按钮**（2026-10-14 改成自动）：选中 Docker 来源、或换了 Docker 目标时，
       * effect 里按 `containersKey` 判一次「这份还算不算数」，不算就拉；页面上留一个「刷新」出口
       * （容器是会变的：起停一个容器之后清单就旧了）。
       *
       * `draft` 由调用方给（当前选中的那一条），不在这里读闭包：这样「拉回来的是哪个目标的」是显式的，
       * 缓存与在途闩都按它算出来的键比。
       */
      const loadContainers = async (draft) => {
        if (!docker || draft === undefined || draft === null) return
        const key = containersKey(draft)
        if (key === '') return
        // 在途闩用 ref（不是 state）：连着换两次目标时，两份请求会在同一轮渲染里都看到旧值
        if (containersFlightRef.current === key) return
        containersFlightRef.current = key
        setContainersBusy(true)
        setContainersError('')
        try {
          const parsed = await api('/api/dsh-docker/containers', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(draft.dockerTarget === '' ? { all: false } : { target: draft.dockerTarget, all: false }),
          })
          const list = Array.isArray(parsed.containers) ? parsed.containers : []
          setContainers(list)
          // 记下「这份属于哪个键」：同一份再渲染就不重拉了（见 containersKey / fieldFetchNeeded）
          setContainersSource(key)
          /*
           * 选中的容器要**跟着清单走**：换了目标之后，原来那个 id 多半不在新清单里——留着它，
           * 原生 `<select>` 会回落显示第一项，而面板状态里还是旧 id（loglens D04 那一类不一致）。
           * 所以：还在就留着，不在就换成新清单的第一条（新清单为空则清空）。
           */
          setContainer((current) => {
            if (list.some((item) => item.id === current)) return current
            return list.length > 0 ? list[0].id : ''
          })
          /*
           * 换到了一份**新清单**（换目标 / 首次拉到 / 手动重拉）→ 搜索词作废，回到 `null`
           * （= 没有在搜），于是这一格显示**选中的那个容器名**（第四十三刀）。
           *
           * 不清的话会留下尴尬态：`container` 已经是新清单的第一条（候选里带勾），
           * 而输入框因为是 `''`（在搜、词为空）画成一个**空盒子**——看起来像「什么都没选」。
           * 真机上就是这么发现的：切回 Docker 来源后框是空的、候选里却有勾。
           */
          // 用函数式更新：确保清的是**这一轮之后**的值，不被同批其它 setState 的旧值覆盖
          setContainerQuery(() => null)
        } catch (err) {
          /*
           * 拉失败就**落在这一格**（用户正看着那儿），不动卡片顶部那条错误行：容器清单是自动拉的，
           * 失败不该把整张卡片变成「出错了」。失败时**不写缓存**（`containersSource` 不动），
           * 所以下一次触发还会重试——同时把清单清掉，免得留着一份「哪个目标的都不知道」的旧选项。
           */
          setContainers([])
          setContainer('')
          setContainersError(err.message)
        } finally {
          containersFlightRef.current = ''
          setContainersBusy(false)
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
          // 记下「这批日志是按什么条件拉的」：条件一变，界面据此说明「这是上一次的」
          setDockerRan(dockerRunKey(container, query.preset, dockerTail))
        } catch (err) {
          setError(err.message)
        } finally {
          setDockerBusy(false)
        }
      }

      const clearResults = () => {
        setOutcome(undefined)
        // 结果都没了，「上一次跑的是哪份草稿」也一并撤掉：留着它只会让下一轮的空屏
        // 多算一次「过期」（判据是 outcome 在不在，但状态干净些没坏处）
        setLastRun(undefined)
        setLines([])
        setCursor(undefined)
        setHistogram(undefined)
        setGroups(undefined)
        // 行都没了，展开的那一行与正在填的筛值也一并撤掉（留着它们指向的是一份已经不存在的结果）
        setExpandedId(undefined)
        setFxOpen(undefined)
        setFxIndex(-1)
        setError('')
        setOk('')
      }

      /*
       * 选中的来源 = 这次查询**真正会用的**那一项（唯一的那个来源、或下拉值命中的那一项）。
       *
       * 这两行**必须在 `view === 'summary'` 那个提前返回之前**：下面挂着一个 `useEffect`
       * （容器清单自动拉），而 hooks 的调用顺序每次渲染都必须一样——放在提前返回之后就等于
       * 条件调用 hook（summary 视图那一轮少一个 hook，React 会直接报错）。
       */
      const selectedDraft = drafts.find((draft) => draft.id === query.target) === undefined
        ? (drafts.length === 1 ? drafts[0] : undefined)
        : drafts.find((draft) => draft.id === query.target)
      const isDocker = selectedDraft !== undefined && selectedDraft.kind === 'docker'
      /*
       * **容器清单自动拉**（2026-10-14，与字段候选「点开即拉」同一条判据：别把「做一件事」拆成两步）：
       * 选中 Docker 来源时拉一次；换了 Docker 目标（键变了）再拉一次；同一个键不重复拉。
       *
       * 依赖里放的是**键的三个来源**（id / kind / dockerTarget）而不是整个对象：对象每次渲染都是新的，
       * 用它当依赖会变成「渲染一次拉一次」。
       */
      React.useEffect(() => {
        if (!docker || selectedDraft === undefined || selectedDraft.kind !== 'docker') return
        if (fieldFetchNeeded(containersSource, containersKey(selectedDraft))) loadContainers(selectedDraft)
      }, [
        docker,
        selectedDraft === undefined ? '' : selectedDraft.id,
        selectedDraft === undefined ? '' : selectedDraft.kind,
        selectedDraft === undefined ? '' : selectedDraft.dockerTarget,
        containersSource,
      ])

      /*
       * 字段侧栏要用的字段清单：**查询成功之后按需拉一次**（同一个来源不重复拉，见 fieldFetchNeeded）。
       *
       * 为什么不是「每次查询都拉」：字段清单随索引长、不随一次查询变，缓存键是来源 id，换来源才重拉；
       * 为什么不是「另设一个按钮」：侧栏本身就是「这一页有哪些字段」的答案，点开卡片还要先按一下
       * 「拉字段」等于把一件事拆成两步（与分组候选「点开即拉」同一条判据）。
       * 拉不到只落在侧栏里（fieldsError），不影响已经查到的结果——它是附加信息。
       */
      React.useEffect(() => {
        // 收起时不拉字段清单：没人看那一栏，凭什么为它多打一枪（分组候选打开时仍会自己拉）
        if (!fieldsOpen || !open || outcome === undefined || isDocker || selectedDraft === undefined) return
        if (fieldFetchNeeded(fieldsSource, selectedDraft.id)) loadFields(selectedDraft.id)
      }, [fieldsOpen, open, outcome, isDocker, selectedDraft === undefined ? '' : selectedDraft.id, fieldsSource])

      /*
       * 页面一滚，「＋N」浮层锚定的那颗按钮就离开了原来的位置——直接收起，别让它漂在别处。
       *
       * 用 `capture:true` 捕**所有**滚动容器（settings 页自己会滚，`.ll_results` 也会滚；
       * scroll 不冒泡，只有捕获能一处收全）。测试桩没有 addEventListener：没有就跳过，
       * 别为了一个关闭手势让整张卡片在无浏览器的用例里崩掉。
       */
      React.useEffect(() => {
        if (labelPanel === undefined) return
        if (typeof window === 'undefined' || window === null || typeof window.addEventListener !== 'function') return
        const close = () => setLabelPanel(undefined)
        window.addEventListener('scroll', close, true)
        return () => {
          if (typeof window.removeEventListener === 'function') window.removeEventListener('scroll', close, true)
        }
      }, [labelPanel === undefined ? '' : labelPanel.id])

      /*
       * 容器下拉**第一项**（占位项）此刻该说哪一种状态：判据全在 pure.js 的 `containerSlotState`，
       * 这里只负责把状态名翻成人话（顺带让下面那条 hint 用同一份判断，不出现「下拉说没有、hint 说在拉」）。
       *
       * `pending` 得**自己算**：它在 `busy` 翻起来之前就已经为真（effect 还没跑、或响应还没回来的那一帧），
       * 靠它这一格从第一帧起就是「加载中…」，而不是先闪一下「没有容器」再改口。
       */
      const containersPending = isDocker && fieldFetchNeeded(containersSource, containersKey(selectedDraft))
      const containerSlot = containerSlotState({
        available: docker,
        pending: containersPending,
        busy: containersBusy,
        error: containersError,
        count: containers.length,
      })
      /**
       * 当前选中的容器**叫什么**（给「这份日志是上一次的」那句提示用）。
       *
       * 用清单里的 `name`（真机上是 `container.name` 那种可读名），拿不到就退回 id——
       * **绝不写「未命名」**：一个不存在的名字会让人以为选中的是别的东西。
       */
      const containerLabel = (() => {
        const hit = containers.find((item) => item.id === container)
        if (hit === undefined) return container
        return hit.name === undefined || hit.name === '' ? hit.id : hit.name
      })()

      /*
       * 容器候选（第三十九刀）：收窄判据在 pure.js 的 containerChoices，这里只接动作。
       */
      // `null`（没在搜）与 `''`（在搜、词已清空）对**收窄**是同一个意思：不收窄。
      // 但对「显示什么」不是一回事——那件事由 value 那行分开处理（见 containerQuery 的注释）。
      const containerRows = containerChoices(containers, containerQuery === null ? '' : containerQuery)
      /** 开候选：清单还没到时也开——里面那句「加载中…」就是此刻该说的话。 */
      const openContainerPick = () => {
        /*
         * `containersBusy` **不再是拦截条件**（第四十二刀）：
         * 清单在拉的那几秒里，用户最想知道的正是「它到底在干什么」——拦住不让点，
         * 那一格就像坏了。浮层里那一句「正在拉」带转圈，本来就该让人看得见。
         *
         * `dockerBusy`（看日志在跑）与「这条来源根本不是 Docker」仍然拦：那时按了没有意义。
         */
        if (dockerBusy || !docker) return
        setContainerOpen(true)
        setContainerIndex(0)
      }
      /**
       * 选中一个容器：写进 `container`、清掉搜索词、收起候选，并把输入框**长回**选中的名字
       * （它显示的是「已选的那个」，不是「正在搜的那串」——否则打完字没选就点别处，
       * 输入框会留着一个没生效的词，看起来像已经筛过了）。
       */
      const pickContainer = (id) => {
        setContainer(id)
        /*
         * 回到 `null`（= 没有在搜），不是 `''`（= 在搜、词为空）。
         *
         * 这两个状态在「显示什么」上不同：`null` 显示选中的名字，`''` 显示空白。选中之后
         * 该看到的是**那个容器的名字**——设成 `''` 会让输入框选中之后变空（第四十三刀把这两态
         * 分开时踩过一下，冒烟当场抓到）。
         */
        setContainerQuery(null)
        setContainerOpen(false)
        setContainerIndex(0)
      }

      /** 占位项那句：两条短文案（`msg.containers*`）就是为了放得进最窄那列，宽度预算有守卫。 */
      const containerSlotText = () => {
        if (containerSlot === 'loading') return t('list.loading')
        if (containerSlot === 'error') return t('msg.containersFailed')
        if (containerSlot === 'empty') return t('msg.containersEmpty')
        return t('field.container')
      }

      if (view === 'summary') {
        return t('card.desc')
      }

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
      /*
       * 标题右侧那句摘要（第十五刀）：收起来源列表之后，「现在有几条来源」必须仍然看得见
       * ——否则整块收成一行，屏幕上看不出「还查不查得动」。
       *
       * 三类状态各有各的话，**都说真话**：加载中就说加载中（不写一个还没到的 0）、
       * 空就说空、有就报个数并把当前来源带上（它就是「查询」那一下真正会打的那一条）。
       * 只在**有东西可说**时报，不为了填满这一格编一句话。
       */
      const sourcesSummary = () => {
        if (loading) return t('list.loading')
        if (drafts.length === 0) return t('list.emptyShort')
        const active = selectedDraft === undefined ? '' : (selectedDraft.label === '' ? selectedDraft.id : selectedDraft.label)
        return active === ''
          ? t('meta.sourceCount', { count: drafts.length })
          : t('meta.sourceActive', { count: drafts.length, label: active })
      }
      /*
       * 屏幕上那份结果是不是**已经不是当前条件的**（判据在 pure.js 的 queryStale）。
       *
       * 拿 `{ ...query, target: chosenTarget }` 去比，不是拿 `query` 比：`query.target` 在「只有
       * 一个来源」时是空串，而真正查的是回落后的那一项——不套这一步，一进卡片就会误报「过期」。
       * 其余字段原样带上（含 override 留给草稿的 filters / window）。
       */
      const stale = queryStale({ ...query, target: chosenTarget }, lastRun)
      // 当前生效的筛选（芯片那一行、榜上「正在按它下钻」的高亮都用它）
      const activeFilters = Array.isArray(query.filters) ? query.filters : []
      /*
       * 「＋N」浮层要显示的那一行：**按 id 现找**（不把整行塞进 state——行会随重查换掉，
       * 存旧对象等于让浮层显示一份可能已经不存在的快照）。行没了就不画（见渲染处）。
       */
      const labelLine = labelPanel === undefined ? undefined : lines.find((line) => line.id === labelPanel.id)
      const labelTags = labelLine === undefined ? [] : allRowLabels(labelLine)

      /*
       * 字段侧栏的三分区（判据在 pure.js 的 pageFieldUsage / fieldSections）：
       * 「这一页命中的」只数这一页（行模型里只有 labels 随响应回来），「其余可用字段」来自 /fields，
       * 「类型冲突」是 /fields 里 conflict: true 的那一小撮——三处同一份判据。
       */
      const pageUsage = pageFieldUsage(lines)
      const fieldGroups = fieldSections(fields, pageUsage, fieldFilter)
      /*
       * 有额外列时的行模板（pure.js 的 resultColumnsTemplate）：正文有 198px 下限，窗口不够就
       * 让结果区**横向滚动**——不许把正文压成一行一个字（真机：4 列时 flex 把正文挤到 0 宽）。
       */
      const columnsTemplate = resultColumnsTemplate(columns)
      /*
       * 这一页按哪一档摆（第十三刀）：**只影响渲染顺序**，不改 `lines` 本身——「字段面板的本页命中」
       * 与「下一页追加」读的都是宿主给的那一份，顺序才是它们要的东西。
       */
      const shownLines = sortLines(lines, sortBy)
      const sortMode = sortKeyOf(sortBy)
      /*
       * 时间分布横轴（第十三刀）：刻度的判据在 pure.js 的 `histogramAxis`（首尾各一个、中间按整点
       * 挑、最多 4 个），时间精度按窗口跨度由 `formatTickTime` 决定。
       *
       * 窗口取的是**柱子铺出来的那一段**（首桶起点 → 末桶起点 + 一格），不是请求参数：两张图之间
       * 可能差过一次缩放（`histogram.bars` 才是真正画出来的那一段）。刻度回空就不画轴——一条只有
       * 两端的轴等于没标，反而多一行字把图往下推。
       */
      const histTicks = histogram === undefined || histogram.error !== undefined || !Array.isArray(histogram.bars) || histogram.bars.length < 2
        ? []
        : histogramAxis(
          histogram.bars,
          histogram.bars[0].ts,
          histogram.bars[histogram.bars.length - 1].ts + histogram.stepMs,
          4,
        )
      const histSpan = histTicks.length === 0 ? 0 : histogram.bars[histogram.bars.length - 1].ts + histogram.stepMs - histogram.bars[0].ts
      /*
       * 峰值那一根（第十六刀）：标题写着「峰值 N 条」，图上必须能指出是哪一根——
       * 681 与常态 460 只差一截，61 根里肉眼挑不出来（判据在 pure.js 的 `histogramPeakTs`）。
       */
      const histPeakTs = histogram === undefined || histogram.error !== undefined || !Array.isArray(histogram.bars)
        ? undefined
        : histogramPeakTs(histogram.bars)
      /*
       * 柱子怎么画（第十六刀）：数据挤成一条平带时改用**基线裁剪**，把差异拉开。
       * 判据与代价在 pure.js 的 `histogramScale` 头注释里；这里只负责「把计算结果接上」。
       */
      const histScale = histogram === undefined || histogram.error !== undefined || !Array.isArray(histogram.bars)
        ? { mode: 'flat', floor: 0, max: 0, note: '' }
        : histogramScale(histogram.bars)
      /*
       * 这一根占**全窗**的比例（读数条常驻显示它）。
       *
       * 分母用**真的加起来**的和，不用 `histogram.total`：那个是宿主给的合计，截断时它可能小于
       * 图上这些柱子的和（少画的部分不在图上）。读数条讲的是「屏幕上这张图里的占比」，
       * 分母就得是屏幕上这些柱子加起来——两个数指着不同的东西时，读者会算出个对不上的百分比。
       *
       * 全窗为 0（一条日志都没有）时写 0，不除零。
       */
      const histSum = histogram === undefined || !Array.isArray(histogram.bars)
        ? 0
        : histogram.bars.reduce((sum, bar) => sum + (Number.isFinite(bar.count) ? bar.count : 0), 0)
      const histPeakShare = histSum <= 0 ? '0' : String(Math.round((histogram.max / histSum) * 100))
      /*
       * 悬停中的那一根（第十六刀）。存 **ts** 而不是整个柱对象：柱子每次渲染都是新的，
       * 存对象等于让读数条显示一份可能已经过期的快照；ts 在这份窗口里是稳定的键。
       *
       * 读数条要的三样东西都从当前 `histogram.bars` 里**现找**——不另存一份，也就不存在两份真相。
       */
      const hoverBarInfo = hoverBar === undefined || histogram === undefined || !Array.isArray(histogram.bars)
        ? undefined
        : histogram.bars.find((bar) => bar.ts === hoverBar)
      const hoverBarCount = hoverBarInfo === undefined ? 0 : hoverBarInfo.count
      const hoverBarShare = hoverBarInfo === undefined || histSum <= 0
        ? '0'
        : String(Math.round((hoverBarInfo.count / histSum) * 100))
      // 悬停的那一根是不是「正在放大」的那一档（读数条据此说「再点一次取消」还是「点一下放大」）
      const hoverBarIsActive = hoverBarInfo !== undefined && zoomedBar !== undefined && zoomedBar.from === hoverBarInfo.ts
      /*
       * 读数条摆在哪（第十七刀）：**跟着那根柱子走**，不再钉在最左边。
       *
       * 上一版的读数条是 `display:flex` 常驻左端的一行——真机上柱子在图中间、读数在最左，
       * 中间隔着大半个屏（维护者原话：「柱子和信息隔得太远了」）。读者的眼睛要横跨整张图
       * 才能把「我指着的那根」与「它多少条」对上，而这个动作每移一格都要做一次。
       *
       * 现在：悬停时读数条**贴在那一根的正上方**（`left` 按柱中心算，再用 `translateX(-50%)` 居中），
       * 柱子与它的数字在同一列里——一眼就是一件事。
       *
       * 三条边界：
       *   ① 不悬停时读数条**不画**（常驻那一行留着就还是「信息在别处」那个问题）；
       *      「峰值在哪一根」由读数条 + 峰值柱的强调色一起说，不靠一行常驻摘要；
       *   ② 靠边的柱子会让读数条一半落在图外——`left` 夹到 [0, 100]%，再用 CSS 的
       *      `max(0px, …)` 让它在两端自己靠边站（见 .ll_histReadout 的 translate 规则）；
       *   ③ 位置由**柱序号**算（`index + 0.5) / 总数`），不从 ts 算：
       *      柱宽是 `flex:1` 等分的，序号才是它在屏幕上的真实位置。
       */
      const hoverBarAt = (() => {
        if (hoverBarInfo === undefined || histogram === undefined || !Array.isArray(histogram.bars) || histogram.bars.length === 0) return undefined
        const at = histogram.bars.findIndex((bar) => bar.ts === hoverBar)
        if (at < 0) return undefined
        // 柱中心 = 这一根的**中点**（不是起点：柱子有宽度，指着柱子中间才是「这一根」）
        return Math.round(((at + 0.5) / histogram.bars.length) * 1000) / 10
      })()

      /**
       * 一个字段行（第三十刀：**只剩选列一种用途**）。
       *
       * 第二十五刀把这一行拆成「选列 / 筛选」两种用途时，筛选那半还是要的——它当时是这个来源
       * 唯一的加条件入口。第三十刀之后筛选有了自己的两段式输入框（选字段 · 填值都在那一格里），
       * 于是这一行剩下的职责只有一件事：**把这些字段选出来当列**。
       *
       * 所以 `mode` 这个参数整个去掉了：名字不可点（没有值清单可展开）、没有手填按钮、
       * 也没有第五刀那个「列 / 筛」动作桶。行就是一行名字 + 一个勾选框。
       */
      const renderFieldBlock = (item) => {
        const conflictNote = Array.isArray(item.esTypes) && item.esTypes.length > 0
          ? '（' + t('badge.conflict') + '：' + item.esTypes.join(' / ') + '）'
          : (item.conflict === true ? '（' + t('badge.conflict') + '）' : '')
        return jsxs('div', {
          className: 'll_fieldBlock',
          children: [
            jsxs('div', {
              className: 'll_fieldRow',
              children: [
                /*
                 * 名字是**纯文本**（第三十刀）：选列面板里点名字只该是「选它」，而那条路已经由
                 * 外层 `<label>` 与勾选框承担了（第二十六刀）。原来那个「点名字展开 top 值」的
                 * 按钮是筛选那半的入口，跟着筛选一起搬进了两段式输入框。
                 *
                 * 行上只写**末段**（第二十一刀）：父路径由组头说。`container.labels.*` 那 58 个
                 * 长名字因此从折行变短词——悬停里仍是完整名（复制 / 核对要用）。
                 */
                jsx('span', {
                  className: 'll_fieldNameCell',
                  children: jsx('span', {
                    className: 'll_fieldName ll_fieldNameStatic',
                    title: item.name + conflictNote,
                    children: fieldNameBreaks(fieldLeaf(item.name)).flatMap((part, at, all) => (at === all.length - 1
                      ? [part]
                      : [part, jsx('wbr', {}, 'll-wbr-' + item.name + '-' + String(at))])),
                  }),
                }),
                item.conflict === true ? jsx('span', { className: 'll_fieldBadge', children: t('badge.conflict') }) : null,
                typeof item.count === 'number' ? jsx('span', {
                  className: 'll_fieldCount',
                  title: t('hint.fieldCount', { count: item.count }),
                  children: String(item.count),
                }) : null,
              ],
            }),
          ],
        }, 'll-field-block-' + item.name)
      }

      /**
       * 一组字段展不展开（第二十一刀）。
       *
       * 默认值按**这一组是拿来干什么的**分，两条：
       *   - **有过滤词**：全展开。搜索的时候匹配上的本来就没几行，再让人点开就是多一步；
       *   - **没有过滤词**：命中区展开（那些是这个来源**真在用**的字段，多半就是你要的），
       *     其余与冲突折叠（那是「去里面找一条」的清单，组头带计数让人挑）。
       *
       * 判据是**目视长度**：真机 92 个字段里 58 个是 `container.labels.*`，全展开要滚 7 屏；
       * 折叠之后「其余可用字段」只剩 11 行组头。
       */
      const groupOpen = (sectionKey, groupKey) => {
        const override = groupOverride[sectionKey + '::' + groupKey]
        if (override !== undefined) return override
        if (fieldFilter.trim() !== '') return true
        return sectionKey === 'hit'
      }

      const toggleGroup = (sectionKey, groupKey) => {
        const at = sectionKey + '::' + groupKey
        setGroupOverride((current) => ({ ...current, [at]: !groupOpen(sectionKey, groupKey) }))
      }

      /**
       * 一行字段（第二十六刀：选列面板的「列」按钮换成**勾选**）。
       *
       * 「列」那个字是**操作名**，摆在一列字段名右边像是数字/单位的一部分；而这一栏做的事
       * 其实就是「把这些字段选出来」。所以列模式整行是一个 `<label>`：点名字、点数字、点勾选框
       * 都算选它（一颗 16px 的勾选框对鼠标太小，整行可点才是正常的清单交互）。
       *
       * 勾选框是**真的** `<input type=checkbox>`（不是自己画的方块）：键盘空格、读屏、
       * 「已选几项」这些都不用另写。`accent-color` 用宿主品牌色（与设置页那些开关同一套）。
       *
       * 满员时未选的行**禁用**并说明原因——但不能连「取消勾选」一起禁掉（那会让 4 列一个都去不掉）。
       */
      const renderFieldRow = (item) => {
        const state = columnPickState(columns, item.name)
        const disabled = querying || state === 'limit'
        return jsxs('label', {
          className: state === 'picked' ? 'll_fieldPick ll_fieldPickOn' : 'll_fieldPick',
          title: state === 'limit' ? t('hint.columnLimit', { count: RESULT_COLUMN_MAX }) : (state === 'picked' ? t('hint.columnRemove', { field: item.name }) : t('hint.columnAdd', { field: item.name })),
          children: [
            jsx('input', {
              type: 'checkbox',
              className: 'll_fieldCheck',
              checked: state === 'picked',
              disabled,
              'aria-label': t(state === 'picked' ? 'hint.columnRemove' : 'hint.columnAdd', { field: item.name }),
              onChange: () => { if (!disabled) toggleColumn(item.name) },
            }, 'll-column-act-' + item.name),
            renderFieldBlock(item),
          ],
        }, 'll-field-pick-' + item.name)
      }

      /** 一组字段（组头 + 组内的行）。组头永远画：它说的就是这批字段的共同父路径。 */
      const renderFieldGroup = (sectionKey, group) => {
        const open = groupOpen(sectionKey, group.key)
        const label = group.key === '' ? t('field.topLevel') : group.key
        return jsxs('div', {
          className: 'll_fieldGroup',
          children: [
            jsxs('button', {
              type: 'button',
              className: open ? 'll_fieldGroupHead ll_fieldGroupHeadOpen' : 'll_fieldGroupHead',
              'aria-expanded': open,
              title: t('hint.fieldGroupToggle', { name: label, count: group.items.length }),
              onClick: () => { toggleGroup(sectionKey, group.key) },
              children: [
                jsx('span', { className: 'll_fieldGroupChevron', 'aria-hidden': 'true', children: open ? '▾' : '▸' }),
                jsx('span', { className: 'll_fieldGroupName', children: label }),
                jsx('span', { className: 'll_fieldGroupCount', children: String(group.items.length) }),
              ],
            }, 'll-field-group-head-' + sectionKey + '-' + group.key),
            open ? jsx('div', {
              className: 'll_fieldGroupBody',
              // 组内的行**只显示末段**：父路径由组头说（真机那 58 个 labels 字段因此从折行变短词）
              children: group.items.map((item) => renderFieldRow(item)),
            }) : null,
          ],
        }, 'll-field-group-' + sectionKey + '-' + group.key)
      }

      /** 侧栏的一个分区；`titleKey` 的文案里带 {count}（过滤后的数）。 */
      const renderFieldSection = (key, titleKey, items) => {
        if (items.length === 0) return null
        return jsxs('div', {
          className: 'll_fieldSection',
          children: [
            jsx('span', { className: 'll_fieldSectionTitle', children: t(titleKey, { count: items.length }) }),
            // 分区内**按父路径分组**（第二十一刀）：组内保持这一分区原来的顺序，不重排
            ...groupFieldsByParent(items.slice(0, FIELD_LIST_MAX)).map((group) => renderFieldGroup(key, group)),
            items.length > FIELD_LIST_MAX ? jsx('p', {
              className: 'll_hint',
              children: t('hint.fieldsTooMany', { shown: FIELD_LIST_MAX, count: items.length }),
            }) : null,
          ],
        }, 'll-field-section-' + key)
      }

      /*
       * 字段浮层（浮在结果表左边那一块上的面板）。
       *
       * 三个分区互斥（见 pure.js fieldSections）：命中区只数**这一页**、只有它能加列；
       * 「其余可用」没有逐行值，所以只有「筛」一个动作。清单可能很长（全集群通配来源上百字段）：
       * 子串过滤 + 分区内滚动 + 「共 N 个」，不引虚拟滚动（与字段候选浮层同一条）。
       *
       * 它**不占布局**：高度跟结果区走（`top:0;bottom:0`），结果表始终是整行宽度；收起靠
       * 再点「字段」或点面板外那层遮罩。
       */
      /*
       * 面板落在哪儿（第二十刀定位）：由 `fieldsAnchor`（按下触发它的那一刻、那颗按钮的
       * 视口坐标）算出来，判据全在 pure.js 的 `panelPlacement`（有单测）：
       *
       *   ① **横向右缘对齐**按钮（它在整行右侧，左对齐要向左伸出去 300px），并夹在视口内；
       *   ② **纵向优先往下开**（按钮下沿 +4px，与「＋N」浮层同一个间距）；下面放不下就上翻——
       *      元信息行在结果表下方，真机上它经常已经在视口底部；
       *   ③ 高度用 `fieldPanelHeight`（与 `.ll_fields` 的 `max-height:min(520px,70vh)` 同口径），
       *      只用来判断会不会溢出。
       */
      /** 面板位置：由锚点（点下去那一刻的按钮坐标）+ 视口算出来（判据在 pure.js 的 panelPlacement）。 */
      const fieldPlacementOf = (anchor) => {
        if (anchor === undefined) return undefined
        const vw = typeof window === 'object' && window !== null && Number.isFinite(window.innerWidth) ? window.innerWidth : 0
        const vh = typeof window === 'object' && window !== null && Number.isFinite(window.innerHeight) ? window.innerHeight : 0
        return panelPlacement(anchor, { width: FIELD_PANEL_WIDTH, height: fieldPanelHeight(vh), margin: 8, vw, vh })
      }
      const fieldsPlacement = fieldPlacementOf(fieldsAnchor)

      /**
       * 字段面板的骨架（第三十刀：**只剩选列这一种用途**）。
       *
       * 它曾经是一个骨架两种用途（第二十五刀：选列 / 筛选）。第三十刀把筛选搬进两段式输入框
       * 之后，面板的职责收成一件：**本页命中的字段里挑几个当列**。于是：
       *   - 分区只剩一个（`可加列的字段`），「其余可用 / 类型冲突」两个分区跟着筛选一起退场；
       *   - 每行只剩一个勾选框（第二十六刀那条路），名字不再可点、没有值清单、没有手填按钮；
       *   - 脚注只说列的那件事。
       *
       * 搜索框、按父路径分组、折叠规则、滚动、已选列那一格**逐字照旧**——它们与筛选无关，
       * 是「92 个字段怎么在一张 340px 的浮层里看得完」这件事的答案。
       */
      const renderColumnAside = () => {
        const total = fieldGroups.totals.hit
        return jsxs('aside', {
          className: 'll_fields ll_fieldsColumn',
          'aria-label': t('panel.fieldsColumn'),
          // 位置由按钮的视口坐标算（见 fieldsPlacement）；拿不到坐标就不写 style
          style: fieldsPlacement === undefined ? undefined : fieldsPlacement,
          children: [
            jsxs('div', {
              className: 'll_fieldsHead',
              children: [
                jsx('span', { className: 'll_fieldsTitle', children: t('panel.fieldsColumn') }),
                /*
                 * 右上角那一格（第二十一刀）：不搜索时报「共 N 个字段」，搜索时报**命中几个**。
                 * 多一行就把列表又往下推 18px，而这个面板的高度本来就稀缺；搜索时最要紧的反馈
                 * 就是「还剩几个」。
                 */
                jsx('span', {
                  className: 'll_fieldsTotal',
                  children: fieldFilter.trim() === ''
                    ? (total > 0 ? t('hint.fieldsCount', { count: total }) : '')
                    : t('meta.fieldsMatched', { count: total }),
                }),
              ],
            }),
            /*
             * 过滤框（第十九刀）：放大镜 + 有内容才出现的清除按钮。
             *
             * 它是这个面板**唯一**的导航方式（真机 45 行可加列的字段），而它原来就是一个
             * 光秃秃的输入框，连「这是搜索」都要靠占位符猜。
             */
            jsxs('div', {
              className: 'll_fieldsFilterRow',
              children: [
                jsx('span', { className: 'll_fieldsFilterIcon', children: actionIcon('search') }),
                jsx('input', {
                  className: 'll_input ll_fieldsFilter',
                  'aria-label': t('placeholder.fieldFilter'),
                  placeholder: t('placeholder.fieldFilter'),
                  value: fieldFilter,
                  onChange: (event) => {
                    setFieldFilter(event.target.value)
                    // 换过滤词 = 换了一批要看的组：上一轮点开 / 收起的选择不跟过来
                    setGroupOverride({})
                  },
                }),
                fieldFilter === '' ? null : jsx('button', {
                  type: 'button',
                  className: 'll_fieldsFilterClear',
                  title: t('hint.fieldFilterClear'),
                  onClick: () => { setFieldFilter(''); setGroupOverride({}) },
                  children: '×',
                }),
              ],
            }),
            /*
             * 已选列（第二十一刀）：面板里就能看见 / 去掉当前加进来的列。
             *
             * 列芯片画在结果表上方那一行，而面板**浮在它上面**——从面板里点了「列」，芯片正好被
             * 挡住，看不见自己刚加的那一列。这一格把同一个列集摆在面板里，入口与出口在同一处。
             */
            columns.length === 0 ? null : jsxs('div', {
              className: 'll_fieldsPicked',
              children: [
                jsx('span', { className: 'll_fieldsPickedLabel', children: t('section.columnsPicked', { count: columns.length }) }),
                ...columns.map((name) => jsxs('span', {
                  className: 'll_columnChip',
                  children: [
                    jsx('span', { className: 'll_columnName', title: name, children: name }),
                    jsx('button', {
                      type: 'button',
                      className: 'll_colRemove',
                      title: t('hint.columnRemove', { field: name }),
                      onClick: () => { removeColumn(name) },
                      children: '×',
                    }),
                  ],
                }, 'll-picked-' + name)),
              ],
            }),
            jsxs('div', {
              className: 'll_fieldsScroll',
              children: [
                fieldsBusy ? jsx('p', { className: 'll_hint', children: t('list.loading') }) : null,
                fieldsError === '' ? null : jsx('p', { className: 'll_hint ll_warn', children: t('error.fields', { message: fieldsError }) }),
                // 清单、错误、命中区都没有东西时才说「这个来源没返回字段名」——有命中区就不该说这句
                !fieldsBusy && fieldsError === '' && fields.length === 0 && total === 0
                  ? jsx('p', { className: 'll_hint', children: t('msg.fieldsEmpty') })
                  : null,
                // 没有本页命中时**不是**「没找到」，而是「这一页没有可加列的字段」（两者空态不一样）
                total === 0 && fieldFilter.trim() === '' && !fieldsBusy && fieldsError === ''
                  ? jsx('p', { className: 'll_hint', children: t('msg.noColumnableFields') })
                  : null,
                renderFieldSection('hit', 'section.columnsPickable', fieldGroups.hit),
                total === 0 && fieldFilter.trim() !== ''
                  ? jsx('p', { className: 'll_hint', children: t('hint.noFieldsMatch') })
                  : null,
              ],
            }),
            jsx('p', {
              className: 'll_hint ll_hintElide',
              title: t('hint.fieldsColumnFull'),
              children: t('hint.fieldsColumn'),
            }),
          ],
        })
      }

      /*
       * 两段式筛选框（第三十刀）：左格选字段、右格填值 / 挑 top 值。
       *
       * 为什么是一格而不是「按钮 + 弹层」：真实机器上那条路是四步（点「＋ 筛选」→ 在 92 个字段里
       * 找一个 → 点字段看值 → 点值），而**这条路上每一步都在做同一个决定的两半**。写成一行两格
       * 之后，整个过程是：点左边挑字段（能打能搜）→ 右边自动张开该字段的 top 值（能打能挑）→ 回车。
       *
       * 三条判据值得单说：
       *
       *   ① **右边那一格跟着左边走**：选定字段就把它的 top 值拉出来（`openValueChoices`），
       *      不用再点第二下。这正是用户那句话「一边选字段，一边可输可选」——两格是**一个**
       *      输入框的两半，不是两个独立控件。
       *   ② **两边都能手打**：值那一格不要求从候选里选。长尾值、带空格/引号的值、`*` 通配
       *      都只有手打表达得了（候选只有 top 8）。所以「没选中任何候选」是一个正常状态，
       *      回车取的是**打的那串字**（判据在 pure.js 的 choiceMove：−1 是合法档位）。
       *   ③ **方向键与回车归下拉，Backspace 归两格之间**：Backspace 在值格有字时删字、值格空了
       *      退到字段格（判据在 pure.js 的 filterBoxBack）。
       */
      const filterChoices = filterFieldChoices(fieldGroups, fxField)
      const valueChoiceRows = (() => {
        const name = String(fxField == null ? '' : fxField).trim()
        if (name === '') return []
        const entry = valuesOf(name)
        if (entry === undefined || entry.state !== 'ok') return []
        const active = filterOf(activeFilters, name)
        return valueChoices(name, entry.buckets, active, FIELD_VALUES_SIZE)
      })()

      /** 那一刻能提交的「字段 = 值」：候选没选中就用用户打的字（见判据 ②）。 */
      const submitFilterBox = () => {
        const picked = fxOpen === 'value' && fxIndex >= 0 && fxIndex < valueChoiceRows.length
          ? valueChoiceRows[fxIndex].value
          : fxValue
        void submitFilter(fxField, picked)
      }

      const filterValueEntry = () => {
        const name = String(fxField == null ? '' : fxField).trim()
        if (name === '') return undefined
        return valuesOf(name)
      }

      /*
       * 查询串的**字段名补全**（第三十四刀，用户看了 Kibana 的补全弹层后说「要不要把这个抄过来」）。
       *
       * 抄的是**字段名那一半**，不抄 `and` / `or` 那个运算符菜单——那是 KQL 的运算符，抄进
       * Lucene 面板就成了教错（真机实测 `error and failed` 回 4505 条：`and` 被当普通词；
       * 而 `error AND failed` 回 511 条 = 交给算术算出来的交集）。这一条正是第三十三刀踩过的坑，
       * 别再往同一个坑里跳第二次。
       *
       * 为什么这半值得抄：这台来源的面板列 92 个字段，而**打错一个下划线就是静默 0 条**
       * （`container_name:prometheus` → 0 / `container.name:prometheus` → 240）。Kibana 那张截图
       * 里用户正在打的正是 `container_name` —— 一个在这台集群上回 0 条的名字。
       *
       * 只在**字段名那一侧**开：光标已经过了 `:` 就是值那一侧，值候选要按字段拉聚合，
       * 是另一件事（判据在 pure.js 的 fieldCompletion，含「小写 and 不吞」那一条）。
       */
      const completion = fieldCompletion(query.q, qCaret)
      /** 查询串这一格要不要给补全：方言必须真认「字段:值」（Loki 的 `{job="app"}` 不是这个形状）。 */
      const completionKind = selectedDraft === undefined ? '' : selectedDraft.kind
      const completionOn = completionKind === 'elasticsearch' || completionKind === 'opensearch'
      /*
       * 补全的候选（与分组框 / 筛选框同一份字段清单）。
       *
       * **第一次需要时自动拉，不需要用户先点别处**（2026-10-18 维护者看图后指出来的：
       * 「应该自动加载啊」）。这里原先摆的是一句话「先展开字段面板或点开分组候选」——
       * 那是把面板自己的懒加载细节摊给了用户，而且正好在最需要它的那一刻挡路。
       *
       * 自动拉**不会**变成「每敲一个字打一枪」：`loadFields` 自己有两道闸——
       *   ① 缓存：`fieldFetchNeeded(fieldsSource, targetId)` 只在「换了来源 / 没拉过」时为真；
       *   ② 在途闩（`fieldsFlightRef`）：同一来源的并发调用直接返回。
       * 所以一次会话里一个来源最多拉一次，与「点开分组候选」拉的是同一份。
       */
      const completionRows = completion === null || !qOpen ? [] : fieldCompletionChoices(fields, completion.field)
      /** 正在拉 / 拉失败：浮层要说的是这件事，而不是「没有匹配的字段」。 */
      const completionCold = completionOn && qOpen && completion !== null && fields.length === 0
      /*
       * 打开补全（或打字时判据为真）→ 按需拉一次。**放在渲染期之外**（effect）：
       * 渲染函数里发请求会在每次输入时重入，而且 StrictMode 下会打两枪。
       */
      React.useEffect(() => {
        if (!completionOn || !qOpen) return
        if (selectedDraft === undefined) return
        if (!fieldFetchNeeded(fieldsSource, selectedDraft.id)) return
        void loadFields(selectedDraft.id)
      }, [qOpen, completionOn, selectedDraft === undefined ? '' : selectedDraft.id, fieldsSource])

      /**
       * 选一条候选：**原位**替换光标前那段字段名（不是接到末尾），补成 `字段:` 并把光标摆到冒号后。
       *
       * 为什么要原位（判据在 pure.js 的 fieldCompletionApply）：在句子中间补全时，把候选接到
       * 末尾会把后面的内容顶掉。光标位置也一样——受控 input 换 value 之后光标会跳到末尾，
       * 不显式摆回来，用户下一笔就打在了句子末尾。
       */
      const pickCompletion = (name) => {
        const next = fieldCompletionApply(query.q, completion, name)
        setQuery((current) => ({ ...current, q: next.q }))
        setQCaret(next.caret)
        setQOpen(false)
        setQIndex(-1)
        /*
         * 焦点还在框里（候选是鼠标点的，但下一步必然是继续打字），光标摆到冒号后。
         *
         * **两个坑都要躲**（真机抓到的，第一次只躲了前半个）：
         *
         *   ① `focus()` 会同步触发输入框的 `onFocus`，那一刻 React 还没用新的 `query.q`
         *      重渲染——`onFocus` 读到的是补全**之前**的值，于是按旧光标判「该开」，
         *      把刚收起的浮层又打开了。
         *   ② 只把 `setSelectionRange` 挪到 `focus()` 之前**不够**：DOM 里那个 `<input>` 的
         *      `value` 这时还是旧的（`cont`，长度 4），`setSelectionRange(15, 15)` 会被夹到 4。
         *
         * 所以先把新值**直接写进 DOM**（`el.value = next.q`），再摆光标、再 focus。
         * 这不违反受控组件的口径：下一轮渲染 React 会用同一个值覆盖它（写的是同一个串），
         * 不会出现两边不一致的状态。
         */
        const el = qInputRef.current
        if (el !== null && el !== undefined) {
          el.value = next.q
          if (typeof el.setSelectionRange === 'function') el.setSelectionRange(next.caret, next.caret)
          if (typeof el.focus === 'function') el.focus()
        }
      }

      /**
       * 值那一格的下拉内容：四种状态各说一句话（与分组候选同一条：**不许出现一个空盒子**）。
       *
       * 与分组候选的差别：这里**没有**「命中 0 个就不画」那条——值那一格允许随便打，
       * 打了什么都没匹配上时下拉里那句「直接回车就按这个值筛」才是它该说的话。
       */
      const renderFilterValueList = () => {
        const entry = filterValueEntry()
        if (supportsAggregation(outcome) !== true) {
          return jsx('div', { className: 'll_fxState', children: t('hint.aggregationUnsupported') })
        }
        if (entry === undefined || entry.state === 'loading') {
          return jsx('div', { className: 'll_fxState', children: t('list.loading') })
        }
        if (entry.state === 'error') {
          return jsx('div', { className: 'll_fxState ll_warn', children: t('error.fieldValues', { message: entry.error }) })
        }
        if (valueChoiceRows.length === 0) {
          return jsx('div', { className: 'll_fxState', children: t('msg.fieldValuesEmpty') })
        }
        /*
         * 每行的数字**不进界面**，只进 title（第三十一刀，真机读数定下的）。
         *
         * 改前每行右缘摆着一条桶计数，而它与页面上那个「命中 N」是**两个不同瞬间**量的：
         * 真机上抓到一起「值行写 15242、同屏命中写 15199」——ES 是近实时索引，`/query` 算完之后
         * 又有几十条落进窗口，后跑的聚合就多看见了。两次请求的窗口与筛选逐字相同，数却不是同一个。
         *
         * 一个值不可能比它的总数还多，所以这个画面**必然**被读成「数算错了」。而这件事没有
         * 便宜的修法（要对齐就得每次聚合前重查一次命中，等于把一次点击变成两次查询）。
         * 所以这里的判据是：**并排摆两个不同口径的数，不如不摆**。行的相对长短仍由条说
         * （`barRatio`），悬停仍能读到这个桶的条数——想核对的人有出处，扫一眼的人不会被误导。
         */
        const maxCount = valueChoiceRows.reduce((top, row) => (row.count > top ? row.count : top), 0)
        return valueChoiceRows.map((row, at) => jsxs('button', {
          type: 'button',
          className: at === fxIndex ? 'll_fxItem ll_fxItemOn' : 'll_fxItem',
          title: (row.active ? t('hint.valueActive', { value: row.value }) : t('hint.valueDrill', { field: fxField, value: row.value }))
            + '（' + t('hint.fieldCountBucket', { count: row.count }) + '）',
          // 保住输入框的焦点：一失焦那一格就收起来了，点击会先 blur 再 click
          onMouseDown: (event) => { event.preventDefault() },
          onMouseEnter: () => { setFxIndex(at) },
          onClick: () => { void submitFilter(fxField, row.value) },
          children: [
            jsx('span', { className: 'll_fxItemText', title: row.value, children: row.value }),
            // 条：只表达**相对长短**（与值清单当初那条判据同源，见 valueTrack 的注释）
            jsx('span', {
              className: 'll_fxItemBar',
              children: jsx('span', {
                className: 'll_fxItemFill',
                style: { width: String(Math.max(maxCount === 0 ? 0 : (row.count / maxCount) * 100, 2)) + '%' },
              }),
            }),
            // 已经在筛的那一条：勾一下（再点是取消，与榜上同一条）
            row.active ? jsx('span', { className: 'll_fxItemOn2', children: '✓' }) : null,
          ],
        }, 'll-fx-value-' + row.value))
      }

      const renderFilterBox = () => {
        const busy = saving || querying
        const valueEntry = filterValueEntry()
        return jsxs('div', {
          className: 'll_fx',
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
                  disabled: busy,
                  onClick: () => { removeFilter(chip.field) },
                  children: '×',
                }),
              ],
            }, 'll-filter-' + chip.field)),
            jsxs('div', {
              // 焦点离开整格才收下拉：在**两格之间**挪不算离开（判据用 relatedTarget，与分组候选同一条）
              className: 'll_fxBox',
              onBlur: (event) => {
                const next = event.relatedTarget
                const inside = next !== null && next !== undefined && typeof event.currentTarget.contains === 'function'
                  ? event.currentTarget.contains(next)
                  : false
                if (!inside) setFxOpen(undefined)
              },
              children: [
                /*
                 * 左格：字段。类名**不带 `input` 结尾**（`ll_fxFieldBox` 而不是 `ll_fxInput`）——
                 * 输入框族检查按「类名以 input / select 结尾」抓，而这一格与右格是同一条发丝线
                 * 围起来的**一整格**，不是宿主那种独立输入档，几何由 `.ll_fxBox` 统一管。
                 */
                jsxs('div', {
                  className: fxOpen === 'field' ? 'll_fxFieldBox ll_fxOpen' : 'll_fxFieldBox',
                  children: [
                    jsx('input', {
                      className: 'll_fxField',
                      'aria-label': t('placeholder.filterField'),
                      placeholder: t('placeholder.filterField'),
                      value: fxField,
                      disabled: busy,
                      onFocus: () => { setFxOpen('field'); setFxIndex(-1) },
                      onClick: () => { setFxOpen('field'); setFxIndex(-1) },
                      onChange: (event) => {
                        /*
                         * 手打改字段名也算**换字段**（第三十一刀）。这条路径比点候选更常见：
                         * 用户想换字段时多半直接把左格的内容删掉重打，而不是等下拉里挑。
                         *
                         * 判据与 `pickFilterField` 同一条：值属于字段，换了字段之后上一格的
                         * 字就不再是「这个字段的值」——留着它回车就变成 `新字段 = 旧字段的值`。
                         * 不清空的话，真机上的录像就是：host.name 打 node-1 → 手打改成
                         * container.name → 回车 → 芯片 `container.name = node-1`，静默筛错。
                         *
                         * 判据放在**这里**而不是渲染时按「字段是否变过」推断：只有 onChange
                         * 知道「上一个字段是什么」，而那是这一次改动唯一需要的信息。
                         */
                        if (event.target.value !== fxField) setFxValue('')
                        setFxField(event.target.value)
                        setFxOpen('field')
                        setFxIndex(-1)
                      },
                      onKeyDown: (event) => {
                        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                          event.preventDefault()
                          setFxOpen('field')
                          setFxIndex((current) => choiceMove(current, event.key === 'ArrowDown' ? 1 : -1, filterChoices.length))
                          return
                        }
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          // 选中候选就取它，否则取**打的字**（打了半个名字就回车 = 按它筛）
                          if (fxOpen === 'field' && fxIndex >= 0 && fxIndex < filterChoices.length) pickFilterField(filterChoices[fxIndex].name)
                          else if (fxField.trim() !== '') pickFilterField(fxField.trim())
                          return
                        }
                        if (event.key === 'Escape') setFxOpen(undefined)
                        // 字段格是空的、按 Backspace：什么都不做（没有可退的上一格）
                        if (event.key === 'Backspace' && fxField === '' && fxOpen === 'field') setFxOpen(undefined)
                      },
                    }),
                    /*
                     * 右缘那颗小 caret 是**装饰**（与分组框那颗同一条，`pointer-events:none`）：
                     * 它说的是「这一格能拉开」，而整格本来就点得开。
                     */
                    jsx('svg', {
                      width: '12',
                      height: '12',
                      viewBox: CHEVRON_VIEWBOX,
                      fill: 'none',
                      strokeWidth: CHEVRON_STROKE,
                      xmlns: 'http://www.w3.org/2000/svg',
                      'aria-hidden': 'true',
                      className: 'll_fxChevron',
                      children: jsx('path', { d: CHEVRON_PATH, stroke: 'currentColor' }),
                    }),
                  ],
                }),
                // 两格之间的那个「=」：它就是这条条件的形状（字段 = 值）
                jsx('span', { className: 'll_fxEq', 'aria-hidden': 'true', children: '=' }),
                /*
                 * 右格：值。点开就把这个字段的 top 值列出来（`openValueChoices` 先开再按需拉）。
                 *
                 * 字段还空着时禁用：没有字段就没有「这个字段的值」可列，让人在一个空列表里打字
                 * 只会以为它坏了。禁用态在 hover 时说清楚（title）。
                 */
                jsxs('div', {
                  className: fxOpen === 'value' ? 'll_fxValueBox ll_fxOpen' : 'll_fxValueBox',
                  children: [
                    jsx('input', {
                      className: 'll_fxValue',
                      ref: fxValueRef,
                      'aria-label': t('placeholder.filterValue'),
                      placeholder: fxField.trim() === '' ? t('placeholder.filterFieldFirst') : t('placeholder.filterValue'),
                      value: fxValue,
                      disabled: busy || fxField.trim() === '',
                      title: fxField.trim() === '' ? t('hint.filterValueFirst') : undefined,
                      onFocus: () => { openValueChoices(fxField) },
                      onClick: () => { openValueChoices(fxField) },
                      onChange: (event) => {
                        setFxValue(event.target.value)
                        setFxOpen('value')
                        setFxIndex(-1)
                      },
                      onKeyDown: (event) => {
                        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                          event.preventDefault()
                          if (fxOpen !== 'value') openValueChoices(fxField)
                          setFxIndex((current) => choiceMove(current, event.key === 'ArrowDown' ? 1 : -1, valueChoiceRows.length))
                          return
                        }
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          submitFilterBox()
                          return
                        }
                        if (event.key === 'Escape') {
                          setFxOpen(undefined)
                          setFxIndex(-1)
                          return
                        }
                        // 值格空了再按 Backspace：退到字段格（判据在 pure.js 的 filterBoxBack）
                        if (event.key === 'Backspace' && filterBoxBack(fxField, fxValue) === 'field') {
                          event.preventDefault()
                          setFxValue('')
                          setFxOpen('field')
                          setFxIndex(-1)
                        }
                      },
                    }),
                    jsx('svg', {
                      width: '12',
                      height: '12',
                      viewBox: CHEVRON_VIEWBOX,
                      fill: 'none',
                      strokeWidth: CHEVRON_STROKE,
                      xmlns: 'http://www.w3.org/2000/svg',
                      'aria-hidden': 'true',
                      className: 'll_fxChevron',
                      children: jsx('path', { d: CHEVRON_PATH, stroke: 'currentColor' }),
                    }),
                  ],
                }),
                // 提交：**只在能提交时出现**（两格都非空）——一颗永远灰着的按钮只是噪音
                filterProblem(fxField, fxValue) === ''
                  ? jsx('button', {
                    type: 'button',
                    className: 'll_fxGo',
                    title: t('hint.addFilter'),
                    disabled: busy,
                    // 保住输入框焦点：点了之后下拉该收起，但焦点要回到打字的地方
                    onMouseDown: (event) => { event.preventDefault() },
                    onClick: () => { submitFilterBox() },
                    children: t('btn.apply'),
                  }, 'll-fx-go')
                  : null,
                /*
                 * 下拉（两格共用一层，一次只画一张）：挂在**盒子**上（`.ll_fxBox` 是相对定位），
                 * 不是挂在这一整行上。
                 *
                 * 真机读数（第三十刀第一版）：挂 `.ll_fx` 时下拉左缘在 105，而值那一格在 539——
                 * 下拉离它要补的那一格 430px，看着像是另一样东西的菜单。挂盒子上之后，字段那张
                 * 从盒子的左缘长出（贴着字段格），值那张从**右缘**长出（贴着值格）。
                 *
                 * absolute 够用：这一格的祖先里没有 `overflow:hidden` 的滚动容器（`.ll_cardBody`
                 * 只有 padding），与字段面板那套 `fixed` 不是一个场景。
                 */
                fxOpen === undefined ? null : jsx('div', {
                  className: fxOpen === 'field' ? 'll_fxList ll_fxListField' : 'll_fxList',
                  // 鼠标点下拉里的行不该先失焦收起（那些行自己 preventDefault 保住焦点）
                  children: fxOpen === 'field'
                    ? (filterChoices.length === 0
                      ? jsx('div', { className: 'll_fxState', children: t('hint.noFieldsMatch') })
                      : filterChoices.map((row, at) => jsxs('button', {
                        type: 'button',
                        className: at === fxIndex ? 'll_fxItem ll_fxItemOn' : 'll_fxItem',
                        title: row.name,
                        onMouseDown: (event) => { event.preventDefault() },
                        onMouseEnter: () => { setFxIndex(at) },
                        onClick: () => { pickFilterField(row.name) },
                        children: [
                          jsx('span', { className: 'll_fxItemText', children: row.name }),
                          // 这一页命中的字段给一小截标记：它们是刚看过的那些，通常就是要筛的
                          row.group === 'hit' ? jsx('span', { className: 'll_fxItemTag', children: t('badge.pageField') }) : null,
                        ],
                      }, 'll-fx-field-' + row.name)))
                    : [
                      /*
                       * 本字段正在筛时先说清口径（第三十一刀）：这一格列的是**别的值**
                       * （本字段自己的筛选被摘掉了），所以数与页面命中数不是一回事。
                       * 不说这句，用户会把「15242」读成「这个值命中 15242 条」。
                       */
                      filterOf(activeFilters, fxField) === undefined ? null : jsx('div', {
                        className: 'll_fxState ll_fxNote',
                        children: t('hint.fieldValuesOwnFilter'),
                      }),
                      renderFilterValueList(),
                    ],
                }),
              ],
            }),
            /*
             * 还没选字段时**不排**那句长说明（那是「条件是怎么下发的」的科普，没有条件时
             * 没有可解释的东西——与第二十二刀那条同一条判据）；有芯片时它自成一行。
             */
            activeFilters.length === 0 ? null : jsx('span', { className: 'll_hint ll_filtersHint', children: t('hint.filters') }),
          ],
        })
      }

      /** 结果表上面那排「列：… ×」：既说明多出来那几列是什么，也是去掉它们的入口。 */
      const renderColumnChips = () => columns.length === 0 ? null : jsxs('div', {
        className: 'll_columns',
        children: [
          jsx('span', { className: 'll_columnsLabel', children: t('field.columns') }),
          ...columns.map((name) => jsxs('span', {
            className: 'll_columnChip',
            children: [
              jsx('span', { className: 'll_columnName', title: name, children: name }),
              jsx('button', {
                type: 'button',
                className: 'll_colRemove',
                title: t('hint.columnRemove', { field: name }),
                onClick: () => { removeColumn(name) },
                children: '×',
              }),
            ],
          }, 'll-column-' + name)),
          columns.length > 1 ? jsx('span', { className: 'll_columnsHint', children: t('hint.columnsScroll') }) : null,
        ],
      })

      /**
       * 正文（**带命中高亮**，第三十五刀）。
       *
       * 区间来自后端（`line.highlights`，ES 的 `highlight` 换算出来的字符下标），界面**不拿
       * 查询串去正文里找**——`stream:stderr` 这种词正文里根本没有、`-failed` 是排除，
       * 照字面标会错一半。没有 `highlights`（后端没给 / 对不上）就整段纯文本，与以前一模一样。
       *
       * 渲染成 `<span>` 而不是拼 HTML 字符串：日志正文是不可信输入，走 DOM 文本节点永远不用
       * 担心它把正文里的 `<script>` 当标签执行（这也是为什么上面拒绝用 dangerouslySetInnerHTML
       * 那条路，见 elastic.ts 的 highlightRanges）。
       */
      const renderMessage = (line, compact) => {
        const segments = messageSegments(line.message, line.highlights)
        const className = compact ? 'll_resultMsg ll_resultMsgCompact' : 'll_resultMsg'
        // 没有高亮（最常见）就走原来的路径：一个文本节点，不多套一层
        if (segments.length === 1 && segments[0].hit !== true) return jsx('span', { className, children: line.message })
        return jsx('span', {
          className,
          children: segments.map((segment, at) => (segment.hit
            ? jsx('span', { className: 'll_resultHit', children: segment.text }, 'll-hit-' + line.id + '-' + String(at))
            : segment.text)),
        })
      }

      /**
       * 行详情：全部标签 + 原文。
       *
       * 原文的截断判据在 pure.js 的 rawPreview（超长截断并报原长）——详情里贴一段没有上限的
       * JSON 会把整页卡住，而「截了却不说」又会被当成完整原文。
       */
      const renderRowDetail = (line) => {
        const detailTags = allRowLabels(line)
        const raw = rawPreview(line.raw)
        return jsxs('div', {
          className: 'll_rowDetail',
          children: [
            // 行上只给 3 行，完整消息在这里看（长 SQL / 堆栈在行上展开会把一屏挤成两三行）
            jsx('span', { className: 'll_detailLabel', children: t('panel.message') }),
            jsx('div', { className: 'll_detailMsg', children: line.message }),
            detailTags.length === 0
              ? jsx('p', { className: 'll_hint', children: t('hint.noLabels') })
              : jsxs('div', {
                children: [
                  jsx('span', { className: 'll_detailLabel', children: t('panel.labels') }),
                  jsx('div', {
                    className: 'll_detailGrid',
                    children: detailTags.flatMap((tag) => [
                      jsx('span', { className: 'll_detailKey', title: tag.field, children: tag.field }, 'll-detail-key-' + line.id + '-' + tag.field),
                      jsx('span', { className: 'll_detailValue', title: tag.value, children: tag.display }, 'll-detail-value-' + line.id + '-' + tag.field),
                    ]),
                  }),
                ],
              }),
            jsx('span', { className: 'll_detailLabel', children: t('panel.raw') }),
            raw.text === ''
              ? jsx('p', { className: 'll_hint', children: t('hint.noRaw') })
              : jsx('pre', { className: 'll_rowRaw', children: raw.text }),
            raw.truncated
              ? jsx('p', { className: 'll_hint', children: t('hint.rawTruncated', { shown: raw.text.length, total: raw.total }) })
              : null,
            // 敏感字段这句只在**真的看到原文**的地方说（不再常驻在结果列表上方）
            jsx('p', { className: 'll_hint', children: t('hint.rowSensitive') }),
          ],
        })
      }

      const rows = drafts.map((draft, index) => {
        // 这一行改过没有（判据在 pure.js 的 draftDirty：与落盘快照逐键比，复用 draftPayload）
        const dirty = draftDirty(draft, savedDrafts[draft.id])
        return jsxs('div', {
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
              /*
               * 索引表达式那格**带一个行内标签**（第四十一刀）。
               *
               * 原来它只有占位符：空着时看得懂（「索引表达式，如 app-logs-*」），
               * **一旦填了 `app-logs-*` 就再也看不出这一格是什么**——截图里就是这样，
               * 它悬在地址框下面，像个没头没尾的输入框。地址那格有列头「地址」管着，
               * 而列头只盖得住第一行。
               */
              jsxs('div', {
                className: 'll_indexRow',
                children: [
                  jsx('span', { className: 'll_indexLabel', children: t('field.index') }),
                  jsx('input', {
                    className: 'll_input',
                    title: t('hint.index'),
                    placeholder: t('placeholder.index'),
                    value: draft.index,
                    disabled: saving,
                    onChange: (event) => { updateDraft(index, { index: event.target.value }) },
                  }),
                ],
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
          /*
           * 保存：**只有这一行真的改过时**才是实心按钮（第四十一刀）。
           *
           * 改之前它恒亮：多行时看不出哪行有未保存的改动；每行一颗高权重按钮，整块区域全是
           * 「动作」、扫不到内容；想「刷新一下」的人还会去点它（其实什么都不会发生）。
           *
           * 判据是 `draftDirty`（pure.js）：拿当前草稿与落盘快照各算一次 `draftPayload` 逐键比，
           * 所以「改完又改回去」「只多个空格」都不算改动。
           *
           * 没改动时**不只换样式，还要禁用**：一个按了不会有任何反应、也不该有反应的按钮，
           * 留着能按就是在骗人（与「满员时禁用加列」同一条）。
           */
          jsx('button', {
            type: 'button',
            className: dirty ? 'll_btn' : 'll_btnGhost',
            title: dirty ? undefined : t('hint.noChanges'),
            disabled: saving || !dirty,
            onClick: () => { saveDraft(index) },
            children: saving ? t('btn.saving') : t('btn.save'),
          }),
          /*
           * 删除是**危险**动作，但它在每一行上都常驻：做成实心红会因为太扎眼而让人误点，
           * 做成与「保存」同级又会和主操作抢注意力。保持官方的**描边危险**配方（红字红边、
           * 透明底、hover 才有 8% 红底），并按仓库那条守卫的要求用 `.ll_btnDanger` 类名。
           */
          jsx('button', {
            type: 'button',
            className: 'll_btnGhost ll_btnDanger',
            disabled: saving,
            onClick: () => { removeDraft(index) },
            children: t('btn.remove'),
          }),
        ],
        }, 'loglens-row-' + String(index))
      })

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
                /*
                 * 标题行 = 「来源」+ 一句摘要 + 启用开关 + 一颗「编辑来源」折叠把手（第十五刀）。
                 *
                 * 改之前这里是**标题 + 三行说明 + 新增按钮 + 表头 + 两行表单**：真机 816×782 上
                 * 量到 300px（占面板 28%），而查日志时这一块基本不动——结果区被挤到 240px，
                 * 一屏装不下「查询 + 结果 + 分布」三件事。
                 *
                 * 现在收起态只占一行（摘要），展开才铺开原来的整块。摘要里必须留着**来源还剩几个**：
                 * 收起之后那是唯一能看出「我配了几条 / 还查不查得动」的地方。
                 *
                 * 默认展开的判据在下面（`sourcesOpen` 的初值）：设置卡里「配来源」是主任务，
                 * 插件页里「查日志」才是——两边要的默认值不一样。
                 */
                jsxs('div', {
                  className: 'll_panelHeader',
                  children: [
                    jsx('span', { className: 'll_panelTitle', children: t('panel.title') }),
                    jsx('span', { className: 'll_panelSummary', children: sourcesSummary() }),
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
                jsx('button', {
                  type: 'button',
                  className: 'll_sourcesToggle',
                  'aria-expanded': sourcesOpen,
                  title: sourcesOpen ? t('hint.sourcesCollapse') : t('hint.sourcesExpand'),
                  onClick: () => { setSourcesOpen((current) => !current) },
                  children: [
                    jsx('span', { 'aria-hidden': 'true', children: sourcesOpen ? '▾' : '▸' }),
                    jsx('span', { children: sourcesOpen ? t('btn.sourcesHide') : t('btn.sourcesShow') }),
                  ],
                }),
                !sourcesOpen ? null : jsxs('div', {
                  className: 'll_sourcesBody',
                  children: [
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
                  ],
                }),
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
                          // 都没选时 value 是空串，由下面那个占位项把它显示成「选择来源」
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
                        isDocker ? null : jsxs('div', {
                          /*
                           * 查询串那一格（第三十四刀起带**字段名补全**）。
                           *
                           * 为什么包一层：候选浮层要贴着这一格的边开（`position:relative` 的容器，
                           * 与分组框 / 筛选框同一个套路）。浮层落在**这一格**里而不是整行里，
                           * 行宽变化时它跟着走，不用重算坐标。
                           *
                           * 焦点离开这一格就收起来——判据用 `relatedTarget`（下一个焦点落在哪里），
                           * 而不是「一 blur 就关」：点浮层里的行走自己 `preventDefault` 保住焦点，
                           * 但鼠标点空白处、Tab 到查询按钮都该收起（与分组框那条同一条判据）。
                           */
                          className: 'll_qPick',
                          onBlur: (event) => {
                            const next = event.relatedTarget
                            const inside = next !== null && next !== undefined && typeof event.currentTarget.contains === 'function'
                              ? event.currentTarget.contains(next)
                              : false
                            if (!inside) setQOpen(false)
                          },
                          children: [
                            jsx('input', {
                              className: 'll_input',
                              ref: qInputRef,
                              // 方言按**选中来源的 kind** 说（ES / OpenSearch 是 Lucene，不是 LogQL）
                              placeholder: queryPlaceholder(selectedDraft === undefined ? '' : selectedDraft.kind),
                              value: query.q,
                              disabled: saving || querying,
                              onChange: (event) => {
                                setQuery((current) => ({ ...current, q: event.target.value }))
                                /*
                                 * 光标位置从事件里取：真实 `<input>` 的 change 事件带着
                                 * `selectionStart`。桩环境没有它就按「末尾」算（打字时的常态）。
                                 */
                                const caret = typeof event.target.selectionStart === 'number'
                                  ? event.target.selectionStart
                                  : event.target.value.length
                                setQCaret(caret)
                                setQIndex(-1)
                                // 光标在字段名那一侧才开（判据在 pure.js 的 fieldCompletion）
                                setQOpen(completionOn && fieldCompletion(event.target.value, caret) !== null)
                              },
                              onFocus: (event) => {
                                const caret = typeof event.target.selectionStart === 'number'
                                  ? event.target.selectionStart
                                  : event.target.value.length
                                setQCaret(caret)
                                // 点进来不打字也给候选：光标停在哪儿就补哪儿（与筛选框「点开就拉」同一条）
                                setQOpen(completionOn && fieldCompletion(event.target.value, caret) !== null)
                              },
                              onClick: (event) => {
                                const caret = typeof event.target.selectionStart === 'number'
                                  ? event.target.selectionStart
                                  : event.target.value.length
                                setQCaret(caret)
                                setQOpen(completionOn && fieldCompletion(event.target.value, caret) !== null)
                              },
                              onKeyDown: (event) => {
                                const key = event.key
                                // 方向键归候选：挪「当前那一行」（浮层没开时先只挡上下键，不影响打字）
                                if (key === 'ArrowDown' || key === 'ArrowUp') {
                                  if (typeof event.preventDefault === 'function') event.preventDefault()
                                  if (!qOpen) {
                                    setQOpen(completionOn && completion !== null)
                                    setQIndex(0)
                                    return
                                  }
                                  setQIndex((current) => choiceMove(current, key === 'ArrowDown' ? 1 : -1, completionRows.length))
                                  return
                                }
                                // Esc 收起候选（**不**清查询串：那是另一件事，用户没要求）
                                if (key === 'Escape') {
                                  if (qOpen) {
                                    if (typeof event.preventDefault === 'function') event.preventDefault()
                                    setQOpen(false)
                                    setQIndex(-1)
                                    return
                                  }
                                  return
                                }
                                /*
                                 * 回车有两件事要抢：候选选中那一行 / 发起查询。
                                 *
                                 * 判据是**打字与选词是两条路**：浮层开着、并且用户用方向键挪到了某一行
                                 * （`qIndex >= 0`），回车就是选词；否则回车就是查询（`runOnEnter` 那条，
                                 * 也是这一格最常做的事）。不这么分的话，打完字想查一次反而会先把
                                 * 第一条候选补进去——查的东西就变了。
                                 */
                                if (key === 'Enter' && qOpen && qIndex >= 0 && qIndex < completionRows.length) {
                                  if (typeof event.preventDefault === 'function') event.preventDefault()
                                  pickCompletion(completionRows[qIndex].name)
                                  return
                                }
                                // 其余键（含回车查询）走原来那条路
                                runOnEnter(event)
                              },
                            }),
                            /*
                             * 候选浮层。三种状态各说一句话（与分组框同一条：**不许出现一个空盒子**）：
                             * 在途「加载中…」/ 拉失败「宿主原话」/ 有候选就画。
                             * 命中 0 个不画是刻意的：那说明用户正在打的这串字没有任何字段对得上，
                             * 一个空盒子比不画更像坏了。
                             *
                             * 这三句里**没有**「你先去点别处拉一下」那种话：清单在这一格第一次需要时
                             * 就自己拉了（见上面那个 effect）。让用户替面板补它的懒加载，是把这个
                             * 控件自己的细节摊给了人。
                             */
                            !qOpen ? null : (completionCold ? jsx('div', {
                              className: 'll_pickList ll_qList',
                              children: jsx('div', {
                                className: fieldsError === '' ? 'll_pickState' : 'll_pickState ll_warn',
                                children: fieldsError === ''
                                  ? t('list.loading')
                                  : t('error.fields', { message: fieldsError }),
                              }),
                            }) : completionRows.length === 0 ? null : jsx('div', {
                              className: 'll_pickList ll_qList',
                              children: jsx('div', {
                                className: 'll_pickScroll',
                                children: completionRows.map((item, at) => jsx('button', {
                                  type: 'button',
                                  className: at === qIndex ? 'll_pickItem ll_pickItemActive' : 'll_pickItem',
                                  title: item.name,
                                  // 保住输入框焦点：一失焦候选就收起来了，点击会先 blur 再 click
                                  onMouseDown: (event) => { event.preventDefault() },
                                  onMouseEnter: () => { setQIndex(at) },
                                  onClick: () => { pickCompletion(item.name) },
                                  children: item.name,
                                }, 'll-qfield-' + item.name)),
                              }),
                            })),
                          ],
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
                    /*
                     * 查询串的**可点例子**（第三十三刀，用户的「我不会写，你教我」）：
                     *
                     * 摆在这一行下面而不是塞进网格：这一行已经三格（来源 / 查询串 / 查询），
                     * 再挤一条提示会把查询串那格（真机上 473px，是这块最值钱的宽度）压回去。
                     *
                     * 点击=**填进查询串**，不自动查——用户得先看一眼自己点了什么、必要时改一改。
                     * 自动查会把「我只是想看看这个例子长什么样」变成一次误触的查询，
                     * 而每次查询都是真的打后端。
                     *
                     * 例子本身**不翻译**（它是代码，不是文案）：翻成中文就没法点进去跑了。
                     * 只有每条的 title 是文案。
                     */
                    isDocker || querySamples(selectedDraft === undefined ? '' : selectedDraft.kind).length === 0 ? null : jsxs('div', {
                      className: 'll_querySamples',
                      children: [
                        jsx('span', { className: 'll_querySamplesLabel', children: t('hint.querySamples') }),
                        ...querySamples(selectedDraft === undefined ? '' : selectedDraft.kind).map((item) => jsx('button', {
                          type: 'button',
                          className: 'll_sampleChip',
                          // 类名不带 btn：它是行内的小控件（按钮族几何检查按 /btn/i 抓类名）
                          title: t('hint.querySample', { sample: item.sample }),
                          disabled: saving || querying,
                          onClick: () => { setQuery((current) => ({ ...current, q: item.sample })) },
                          children: item.sample,
                        }, 'll-sample-' + item.id)),
                      ],
                    }),
                    /*
                     * 选项行：时间窗 · 级别 · 条数 · 分组字段 · 「分组」（第十五刀）。
                     *
                     * 这几格都是「设一次就不常动」的参数，不该跟查询串抢同一行的宽度。分组字段原来是
                     * 单独一行、右边还留着一列永远空着的「回话」位——并进这一行之后，那一列消失、
                     * 行高也省了一整行。
                     *
                     * 「分组」只在来源**明确说**能聚合时可用——不知道（旧版宿主）按直方图同款处理，
                     * 不替对方说一句没依据的话，也不发一个可能永远失败的请求。
                     */
                    isDocker ? null : jsxs('div', {
                      className: 'll_groupGrid',
                      children: [
                        jsx('select', {
                          className: 'll_input',
                          title: t('field.window'),
                          value: query.preset,
                          disabled: saving || querying,
                          onChange: (event) => { changePreset(event.target.value) },
                          children: windowChoices(query.preset).map((key) => jsx('option', { value: key, children: windowLabel(key) }, key)),
                        }),
                        jsx('select', {
                          className: 'll_input',
                          title: t('field.level'),
                          value: levelFilterOf(query),
                          disabled: saving || querying,
                          // 改了就记进草稿；**不自动重查**（与改查询串 / 时间窗同一条：都在草稿里，
                          // 由「查询」那一下一起发出去——一改就查会在打字 / 连点时打出一串请求）
                          onChange: (event) => { setQuery((current) => ({ ...current, level: event.target.value })) },
                          children: levelChoices().map((key) => jsx('option', { value: key, children: levelLabel(key) }, 'll-level-' + (key === '' ? 'any' : key))),
                        }),
                        jsx('input', {
                          className: 'll_input',
                          title: t('field.limit'),
                          type: 'number',
                          min: '1',
                          value: String(query.limit),
                          disabled: saving || querying,
                          onChange: (event) => { setQuery((current) => ({ ...current, limit: Number(event.target.value) })) },
                          // 条数也是这一行的输入框：回车即查与查询串同一口径（不然只有一半的框认回车）
                          onKeyDown: runOnEnter,
                        }),
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
                            }) : choices.length === 0 ? null : jsxs('div', {
                              className: 'll_pickList',
                              children: [
                                // 候选那一层自己滚（页脚在它外面，滚不动）
                                jsx('div', {
                                  className: 'll_pickScroll',
                                  children: choices.map((item, at) => jsx('button', {
                                    type: 'button',
                                    // 当前那一行要高亮出来：方向键挪的是它，回车取的是它（不然键盘用户看不见自己停在哪）
                                    className: at === pickIndex ? 'll_pickItem ll_pickItemActive' : 'll_pickItem',
                                    // 悬停说全：冲突字段把「哪几种类型」也写在 title 里（行上只放得下一小截标记）
                                    title: item.conflict === true
                                      ? item.name + '（' + t('badge.conflict') + (item.esTypes.length > 0 ? '：' + item.esTypes.join(' / ') : '') + '）'
                                      : item.name,
                                    // 保住输入框的焦点：一失焦那一格就收起来了，点击会先 blur 再 click
                                    onMouseDown: (event) => { event.preventDefault() },
                                    // 鼠标划到哪一行，方向键就从哪一行接着走（两套输入共用同一个「当前行」）
                                    onMouseEnter: () => { setPickIndex(at) },
                                    onClick: () => {
                                      setGroupBy(item.name)
                                      setPickOpen(false)
                                    },
                                    /*
                                     * 冲突字段**必须在行上看得出来**：拿它分组只会覆盖一部分索引，
                                     * 用户看到候选都一样长（真机上那一个名字长得跟别人没区别）就会照点。
                                     */
                                    children: item.conflict === true
                                      ? [item.name, jsx('span', { className: 'll_pickConflict', children: t('badge.conflict') })]
                                      : item.name,
                                  }, 'll-field-' + item.name)),
                                }),
                                // 页脚：**这个来源一共有多少字段**（不截断之后，长度就靠这个数看得见）
                                // + 一个「刷新」——缓存的出口（同一个来源不再每次都拉，但字段会随新数据长）
                                // 只有显式 limit 才可能被截断，那时这个位置换成宿主的原话警告（照抄，见 loadFields）
                                jsxs('div', {
                                  className: 'll_pickFoot',
                                  children: [
                                    jsx('span', {
                                      className: fieldsNote === '' ? 'll_pickState' : 'll_pickState ll_warn',
                                      children: fieldsNote === '' ? t('hint.fieldsCount', { count: fieldsTotal }) : fieldsNote,
                                    }),
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
                          /*
                           * `stale` 也算「现在不能分组」：榜的窗口取**上一次回显**的那一份，
                           * 查询串却取当前草稿（见 pure.js 的 facetsEnvelope）——条件改了还点，
                           * 榜画的会是「新查询串 + 旧窗口」，与屏幕上那排结果不是同一个子集。
                           * 先点「查询」把两者对齐，比默默画一张对不上的榜诚实。
                           */
                          disabled: saving || querying || grouping || stale || outcome === undefined || supportsAggregation(outcome) !== true,
                          onClick: () => { runGroups() },
                          children: grouping ? t('btn.grouping') : t('btn.group'),
                        }),
                      ],
                    }),
                    /*
                     * 筛选行（第三十刀）：**生效中的条件 + 一条能直接写的条件**，同一行。
                     *
                     * 这一行的来历值得记一笔，因为它是这六七刀里改得最多的一处：
                     *   - 第二十二刀把它从「有筛选才出现」改成常驻，并把「＋ 筛选」放在这儿
                     *     （条件显示在这儿，加条件的入口也得在这儿）；
                     *   - 第二十五刀把「＋ 筛选」接到一整块字段弹层上（选字段 / 看值 / 手填都在里面）；
                     *   - 第三十刀把弹层整个撤掉，换成一个**两格输入框**：左边选字段、右边填值。
                     *
                     * 撤掉弹层的理由不是「弹层不好」，而是**它做的是同一件事**：弹层要占一屏、
                     * 要滚、要在 92 个字段里找；而这条条件的形状本来就只是「字段 = 值」两个词。
                     * 两个词的形状用一行两格表达，比用一屏表达更贴。弹层里那些还成立的判据
                     * （top 值带计数、点值直接筛、手填长尾值、按父路径分组）一样进了这一格。
                     *
                     * 常驻的判据照旧：跑过一次查询就出现，空着时只有「筛选 + 两格」几截，
                     * 不说一句「当前没有筛选」（那是往界面上加噪音）。
                     */
                    isDocker || (activeFilters.length === 0 && outcome === undefined) ? null : renderFilterBox(),
                    isDocker ? jsxs('div', {
                      // Docker 那一档五格（容器 / 时间窗 / 条数 / 刷新 / 看日志）：它有自己的模板，
                      // 套普通查询那套三列会把「看日志」那一格挤到换行
                      className: 'll_dockerGrid',
                      children: [
                        /*
                         * 容器那一格（第三十九刀：原生 `<select>` → **可搜的自绘候选**）。
                         *
                         * 为什么换掉原生下拉（用户截图）：真机上有十几个容器，原生弹层
                         * **高度不受控**（铺满整个面板、盖住下面的东西）、**不能搜**、**样式改不动**。
                         * 找 `batch-job-a` 只能滚。
                         *
                         * 这根柱子与「分组字段」那一格、查询串的字段名补全**是同一套**：
                         * `position:relative` 的格子 + 自己画的候选 + 方向键/回车/Esc + 命中 0 个不画。
                         * 三处共用一个手感，用户不用学两套。
                         *
                         * 四态各有各的话（判据在 pure.js 的 containerSlotState）：加载中 / 失败 / 没有容器 /
                         * 有清单。清单没到时输入框**只读并显示那句状态**——它此刻不是一个可选的容器名。
                         *
                         * **第四十二刀：加载中也要能点开**（用户原话：「这个加载中应该改成可以展开但是有
                         * loading 效果」）。原来 `openContainerPick` 在 `containersBusy` 时直接 return，
                         * 那一格又只读——于是清单在拉的那几秒里，这个控件**整体像坏了一样**：
                         * 点不动、也没有任何在动的迹象。而它其实正是在做事。
                         *
                         * 现在：点得开（浮层里就是「正在拉」那一条，带转圈），框内也显示在动的标记。
                         * 「不可编辑」与「不可点击」是两件事——前者是必要的（那一刻没有可选的容器名），
                         * 后者是没必要的（点开看状态是无害的，而且是用户此刻最想知道的）。
                         */
                        jsxs('div', {
                          className: 'll_pick ll_containerPick',
                          onBlur: (event) => {
                            const next = event.relatedTarget
                            const inside = next !== null && next !== undefined && typeof event.currentTarget.contains === 'function'
                              ? event.currentTarget.contains(next)
                              : false
                            if (!inside) setContainerOpen(false)
                          },
                          children: [
                            jsx('input', {
                              className: 'll_input ll_pickInput',
                              title: t('field.container'),
                              placeholder: containerSlot === 'default' ? t('placeholder.container') : containerSlotText(),
                              /*
                               * 显示什么：过渡态显示那句状态；有清单时显示**选中的容器名**，
                               * 正在搜（有 query）则显示搜的那串。三者是同一个格子的不同时刻，
                               * 不能混着来——打完字没选就点别处，它要退回选中的名字（见 pickContainer）。
                               */
                              value: containerSlot === 'default'
                                ? (containerQuery === null ? containerLabel : containerQuery)
                                : containerSlotText(),
                              // 清单还没到 / 这条来源是 Docker 才可用：那一刻它不是一个可选的容器名
                              readOnly: containerSlot !== 'default',
                              disabled: dockerBusy || !docker,
                              onChange: (event) => {
                                setContainerQuery(event.target.value)
                                setContainerOpen(true)
                                setContainerIndex(0)
                              },
                              onFocus: () => { openContainerPick() },
                              onClick: () => { openContainerPick() },
                              onKeyDown: (event) => {
                                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                                  event.preventDefault()
                                  if (!containerOpen) { openContainerPick(); return }
                                  setContainerIndex((current) => pickMove(current, event.key === 'ArrowDown' ? 1 : -1, containerRows.length))
                                  return
                                }
                                if (event.key === 'Escape') {
                                  if (containerOpen) { event.preventDefault(); setContainerOpen(false) }
                                  return
                                }
                                if (event.key === 'Enter' && containerOpen && containerRows.length > 0) {
                                  event.preventDefault()
                                  pickContainer(containerRows[pickMove(containerIndex, 0, containerRows.length)].id)
                                  return
                                }
                                /*
                                 * 输入框清空之后仍要列全部候选（收窄是「打字时」的事）。
                                 * 第四十三刀之后空串是**合法状态**（在搜、词为空），所以这里只需
                                 * 保证候选开着——`containerChoices(…, '')` 本来就会回全部。
                                 */
                                if (event.key === 'Backspace' && containerQuery === '') {
                                  setContainerOpen(true)
                                }
                              },
                            }),
                            /*
                             * 在途时框内也转一个圈（第四十二刀）：这一格是用户正在看的地方，
                             * 「在动」的迹象不该只藏在点开之后才看得见的浮层里。
                             * 此刻 chevron 让位（它表示「点开」，而候选本来就开着）。
                             */
                            containerSlot === 'loading' ? jsx('span', {
                              className: 'll_spinner ll_pickSpinner',
                              'aria-hidden': 'true',
                            }) : jsx('svg', {
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
                             * 候选浮层。三种状态（加载中/失败/空）各一句话，**命中 0 个不画**
                             * （与分组框、字段补全同一条：一个空盒子比不画更像坏了）。
                             */
                            !containerOpen ? null : (containerSlot === 'loading' ? jsx('div', {
                              className: 'll_pickList',
                              /*
                               * 「正在拉」那一格：**一句 + 一个转圈**（第四十二刀）。
                               * 原来只有一句话，浮层里那几秒是静止的——看不出它在动还是卡住了。
                               * 转圈用 CSS 动画（`prefers-reduced-motion` 时不动，见样式那段）。
                               */
                              children: jsx('div', {
                                className: 'll_pickState ll_pickLoading',
                                children: [
                                  jsx('span', { className: 'll_spinner', 'aria-hidden': 'true' }),
                                  jsx('span', { children: t('list.loading') }),
                                ],
                              }),
                            }) : containerSlot === 'error' ? jsx('div', {
                              className: 'll_pickList',
                              /*
                               * 失败时**必须**给重试出口：主行那颗按钮撤掉之后，这里是唯一的重试入口
                               * （清单拉失败不写缓存，但得有个能按的东西——自动拉只在新键上触发）。
                               * 与下面「有清单」那格的页脚同一个结构：一句原话 + 一颗「刷新」。
                               */
                              children: [
                                jsx('div', { className: 'll_pickState ll_warn', children: t('error.containers', { message: containersError }) }),
                                jsx('div', {
                                  className: 'll_pickFoot',
                                  children: [
                                    jsx('span', { className: 'll_pickState', children: t('msg.containersFailed') }),
                                    jsx('button', {
                                      type: 'button',
                                      className: 'll_pickRefresh',
                                      title: t('hint.refreshContainers'),
                                      disabled: containersBusy,
                                      onMouseDown: (event) => { event.preventDefault() },
                                      onClick: () => { loadContainers(selectedDraft) },
                                      children: containersBusy ? t('list.loading') : t('btn.retry'),
                                    }),
                                  ],
                                }),
                              ],
                            }) : containerSlot === 'empty' ? jsx('div', {
                              className: 'll_pickList',
                              // 空清单也给「刷新」：容器刚起起来的时候，用户第一反应就是再拉一次
                              children: [
                                jsx('div', { className: 'll_pickState', children: t('hint.containersEmpty') }),
                                jsx('div', {
                                  className: 'll_pickFoot',
                                  children: [
                                    jsx('span', { className: 'll_pickState', children: t('msg.containersEmpty') }),
                                    jsx('button', {
                                      type: 'button',
                                      className: 'll_pickRefresh',
                                      title: t('hint.refreshContainers'),
                                      disabled: containersBusy,
                                      onMouseDown: (event) => { event.preventDefault() },
                                      onClick: () => { loadContainers(selectedDraft) },
                                      children: containersBusy ? t('list.loading') : t('btn.refresh'),
                                    }),
                                  ],
                                }),
                              ],
                            }) : containerRows.length === 0 ? null : jsx('div', {
                              className: 'll_pickList',
                              children: [
                                jsx('div', {
                                  className: 'll_pickScroll',
                                  children: containerRows.map((item, at) => jsx('button', {
                                    type: 'button',
                                    className: at === containerIndex ? 'll_pickItem ll_pickItemActive' : 'll_pickItem',
                                    title: item.label,
                                    // 保住输入框焦点：一失焦候选就收起来了（点击会先 blur 再 click）
                                    onMouseDown: (event) => { event.preventDefault() },
                                    onMouseEnter: () => { setContainerIndex(at) },
                                    onClick: () => { pickContainer(item.id) },
                                    children: [
                                      item.label,
                                      // 当前选中的那一条打勾：候选里十来个名字，得看得出哪个是当前的
                                      item.id === container ? jsx('span', { className: 'll_pickDone', children: '✓' }) : null,
                                    ],
                                  }, 'll-container-' + item.id)),
                                }),
                                /*
                                 * 页脚：**一共几个 / 命中几个** + **重拉清单**。
                                 *
                                 * 与字段候选的页脚（`.ll_pickFoot`：共 N 个字段 + 刷新）**逐字同一套**——
                                 * 同一个「重拉清单」的动作，在同一个位置、同一个样式。这条入口原来
                                 * 是主行上一颗实心按钮，与「看日志」并列，权重太高（见上面那段注释）。
                                 *
                                 * 为什么还要留它（而不是只靠自动拉）：容器会起停，清单不会自己变。
                                 * 没有它，新起的容器要等到换目标或重开卡片才看得见。
                                 */
                                jsx('div', {
                                  className: 'll_pickFoot',
                                  children: [
                                    jsx('span', {
                                      className: 'll_pickState',
                                      // `null`（没搜）与 `''`（搜了但词为空）都算「没有收窄」，报总数
                                      children: containerQuery === null || containerQuery === ''
                                        ? t('hint.containersCount', { count: containerRows.length })
                                        : t('hint.containersMatched', { count: containerRows.length, total: containers.length }),
                                    }),
                                    /*
                                     * 「刷新」在途时变成**转圈 + 加载中…**（第四十二刀）。
                                     *
                                     * 为什么要转圈：清单已经有一份时（`containerSlot` 仍是 default，
                                     * 因为旧清单还在），浮层走的是「有候选」那一支——那里原来只有
                                     * 一行静态的「加载中…」文字，看不出是在动还是卡住了。
                                     */
                                    jsx('button', {
                                      type: 'button',
                                      className: 'll_pickRefresh',
                                      title: t('hint.refreshContainers'),
                                      disabled: containersBusy,
                                      // 保住输入框焦点：否则一点它候选就收起、这一下白点
                                      onMouseDown: (event) => { event.preventDefault() },
                                      onClick: () => { loadContainers(selectedDraft) },
                                      children: containersBusy
                                        ? jsxs('span', {
                                          className: 'll_pickLoading',
                                          children: [
                                            jsx('span', { className: 'll_spinner', 'aria-hidden': 'true' }),
                                            jsx('span', { children: t('list.loading') }),
                                          ],
                                        })
                                        : t('btn.refresh'),
                                    }),
                                  ],
                                }),
                              ],
                            })),
                          ],
                        }),
                        jsx('select', {
                          className: 'll_input',
                          title: t('field.window'),
                          value: query.preset,
                          disabled: dockerBusy || !docker,
                          onChange: (event) => { changePreset(event.target.value) },
                          children: windowChoices(query.preset).map((key) => jsx('option', { value: key, children: windowLabel(key) }, 'll-dw-' + key)),
                        }),
                        jsx('select', {
                          className: 'll_input',
                          title: t('field.tail'),
                          value: String(dockerTail),
                          disabled: dockerBusy || !docker,
                          onChange: (event) => { setDockerTail(Number(event.target.value)) },
                          children: [50, 100, 200, 500].map((value) => jsx('option', { value: String(value), children: String(value) }, 'll-tail-' + String(value))),
                        }),
                        // 清单是自动拉的，但容器会变（起停一个就旧了）——留一个手动出口。
                        // 在途时它自己写「加载中…」：那时占位项还写着具体的容器（旧清单还在），
                        // 这一格是「你刚按的那件事正在做」的唯一落点（与旁边「看日志」同一个写法）
                        /*
                         * 这里**曾经有一颗「刷新容器清单」按钮**，第四十刀撤掉了。
                         *
                         * 撤掉的判据（用户指着它问「这按钮有存在的必要吗」）：
                         *
                         *   ① **权重不对**：同一个「重拉清单」的入口，在字段候选里只是浮层页脚里的
                         *      一个小链接（`.ll_pickRefresh`，12px 透明底）；而这里它是与「看日志」
                         *      并排的实心按钮——两颗同级，可只有一颗是该先按的。
                         *   ② **价值被自动拉覆盖了大半**：选中 Docker 来源自动拉、换目标自动拉、
                         *      同一个键不重拉。真正需要手动重拉的只剩「容器起停之后清单旧了」，
                         *      那是低频事件，不该常驻占一格的宽度。
                         *   ③ 第三十七刀给它改过名、加过 title——**改名解决不了「它不该在这儿」**。
                         *
                         * 现在它收进**容器候选浮层的页脚**（与字段候选的「共 N 个 + 刷新」逐字同一套），
                         * 主行从五格变四格，容器名多出这一格的宽度。功能一个不少。
                         */
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
                      ? jsx('p', {
                        /*
                         * 这一格与下拉读**同一份状态**（containerSlot），不另起一套判断：
                         *   失败 → 宿主原话（自动拉的那一步没人按按钮，不能把整张卡片染成出错）；
                         *   拉回来是空的 → 说清「只列运行中的」（否则「没有容器」会被读成这个目标上什么都没有）；
                         *   其余 → 那两句固定的解释。
                         */
                        className: containerSlot === 'error' ? 'll_hint ll_warn' : 'll_hint',
                        children: containerSlot === 'error'
                          ? t('error.containers', { message: containersError })
                          : containerSlot === 'empty'
                            ? t('hint.containersEmpty')
                            : (docker ? t('hint.docker') : t('hint.dockerMissing')),
                      })
                      : (outcome === undefined ? jsx('p', { className: 'll_hint', children: t('hint.query') }) : null),
                    /*
                     * 级别筛选那句**边界声明**：宿主是在返回的这一页上筛的，counts / truncation 仍是未筛的
                     * 整页。不说出来就会把「这一页里的 error」读成「窗口里一共多少 error」（同一屏上两个
                     * 数字说的不是一件事）。判据在 pure.js 的 `levelFiltered`——它只看**下发的载荷**，
                     * 不看回显：查询在途的那几秒也该在场。
                     */
                    isDocker || !levelFiltered(query) ? null : jsx('p', { className: 'll_hint', children: t('hint.levelPaged') }),
                    /*
                     * 换了容器 / 窗口 / 行数之后，屏上这份日志还是**上一次**的——必须说出来
                     * （第三十八刀，真机抓到的静默错误：换个容器，日志不动、界面一个字不提，
                     * 用户会拿 A 容器的日志查 B 容器的问题）。
                     *
                     * 提示摆在**日志上方**而不是下方：用户是往下读的，先说清「你看到的不是现在的」，
                     * 再读那些行；写在最后一行就成了「读完才知道读错了」。
                     */
                    isDocker && dockerStale(dockerRan, container, query.preset, dockerTail) ? jsx('p', {
                      className: 'll_hint ll_warn',
                      children: t('hint.dockerStale', { container: containerLabel }),
                    }) : null,
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
                    // 条件改了、结果还是上一次的：**必须说出来**。不说的话，下面这份行/计数会被
                    // 当成新条件的答案；而 ES 的「下一页」还会拿旧 PIT 游标配新条件翻页（静默少行）。
                    isDocker || outcome === undefined || !stale ? null : jsx('p', {
                      className: 'll_hint ll_warn',
                      children: t('hint.staleResults'),
                    }),
                    /*
                     * 元信息分两层（第十五刀）：**短句 + 动作**一行，**长句**另起一块。
                     *
                     * 改之前它们同在一个 `flex-wrap` 行里：宿主那句 90 字的级别 warning 独占一整行，
                     * 四颗按钮被推到第三行——真机 816×782 量到这一行 **102px**（三行）。现在短句那层
                     * 永远是 28px（按钮在右），长句各自成行、按自己的宽度换行，谁也不再推走谁。
                     */
                    outcome === undefined || isDocker ? null : jsxs('div', {
                      className: 'll_queryMeta',
                      children: [
                        countsParts(outcome.counts === undefined ? { returned: 0 } : outcome.counts).map((part) => jsx('span', { children: countText(part) }, 'll-count-' + part.key)),
                        /*
                         * 截断信号分两句说（第三十六刀）：
                         *
                         *   - 「可能还有」（命中数恰好等于条数上限）：**不说**「已截断」——那是把推测
                         *     写成断言。改成说清「显示了前 N 行」并给动作（把条数调大），与 Kibana 的
                         *     `Limited to N results. Refine your search.` 同一个意思。
                         *   - 其余理由（分片失败 / 超时 / 游标过期 / 确定到顶）：仍然如实说「已截断」，
                         *     那些是确定的信号，弱化它们才是错的。
                         *
                         * 两种同时出现时**两句都说**：先「可能」后「确定」读着通顺，也免得消掉一个。
                         */
                        outcome.truncation !== undefined && (outcome.truncation.reasons === undefined ? [] : outcome.truncation.reasons).includes('hit_limit_maybe')
                          ? jsx('span', {
                            className: 'll_warn',
                            children: t('meta.maybeMore', { count: outcome.counts === undefined ? 0 : outcome.counts.returned }),
                          }, 'll-count-maybe-more')
                          : null,
                        outcome.truncation !== undefined && outcome.truncation.truncated === true && (outcome.truncation.reasons === undefined ? [] : outcome.truncation.reasons).some((reason) => reason !== 'hit_limit_maybe')
                          ? jsx('span', { className: 'll_warn', children: t('meta.truncated', { reasons: (outcome.truncation.reasons === undefined ? [] : outcome.truncation.reasons).filter((reason) => reason !== 'hit_limit_maybe').map((reason) => reasonText(reason)).join(' / ') }) })
                          : null,
                        // 从这里开始是**动作**：与计数之间用 flex:1 的弹簧分开（窄屏换行时按钮仍成组靠右）
                        jsx('span', { className: 'll_metaGap' }),
                        // 字段面板开关：默认收起，展开是浮层（浮在结果上，结果表不跟着变窄）
                        jsx('button', {
                          type: 'button',
                          className: fieldsOpen ? 'll_btnGhost ll_btnGhostIcon ll_btnGhostOn' : 'll_btnGhost ll_btnGhostIcon',
                          title: t('hint.fieldsToggle'),
                          'aria-pressed': fieldsOpen,
                          /*
                           * 点开时**记住按钮此刻在屏幕上的位置**（第二十刀）。
                           *
                           * 面板原来钉在结果区左端（`left:0`），而按钮在整行右侧——真机量到两者
                           * 横向差 **123px**：按的是右边那颗，展开的东西出现在最左边，中间隔着整块图。
                           * 现在面板贴在按钮下方展开（与宿主自己的下拉菜单同一条：从触发它的那颗长出来）。
                           *
                           * 存的是**视口坐标**而不是相对父容器的偏移：面板与按钮不在同一个定位上下文里
                           * （面板是 `position:fixed` 的浮层，按钮在元信息行里），换算相对坐标反而多一层错。
                           */
                          onClick: (event) => { toggleFields(event, 'meta') },
                          children: [actionIcon('fields'), t('btn.fields')],
                        }),
                        // 显示密度：默认完整，点一下切紧凑（记住选择；看日志时少一次点击比多几行重要）
                        jsx('button', {
                          type: 'button',
                          className: 'll_btnGhost ll_btnGhostIcon',
                          title: t('hint.density'),
                          onClick: toggleDensity,
                          children: [actionIcon('density'), denseResults ? t('btn.densityFull') : t('btn.densityCompact')],
                        }),
                        /*
                         * 排序（第十三刀）：三档循环，按钮上写的是**当前档位**（不靠图标让人猜）。
                         *
                         * 档名一律带「本页」的前提说明（title）：宿主没有服务端排序，这里排的是
                         * **已返回的这一页**——把它读成「排序全部命中」是这一格唯一会出的事故，
                         * 所以入口自己先把话说清（设计 §9.3 #8 的边界）。
                         */
                        jsx('button', {
                          type: 'button',
                          className: sortMode === 'time' ? 'll_btnGhost ll_btnGhostIcon' : 'll_btnGhost ll_btnGhostIcon ll_btnGhostOn',
                          /*
                           * 图标化了（第十八刀）：按钮上只剩**档位名**（时间 / 级别 / 正文），
                           * 「这是排序」由图标说、「排的是哪一档」由字说。原来那句「排序：时间」
                           * 里「排序」两个字是**重复**的——它旁边的图标（上下双箭头）已经在说这件事，
                           * 而这一行还要塞下另外三颗按钮。
                           *
                           * 语义一个字没丢：完整句子仍在 `aria-label` 与 `title` 里（读屏与悬停都能读全），
                           * 那条「只排这一页」的边界说明也还在。
                           */
                          title: t('hint.sort', { order: sortName(sortMode) }),
                          'aria-label': t('hint.sort', { order: sortName(sortMode) }),
                          onClick: cycleSort,
                          children: [actionIcon('sort'), sortName(sortMode)],
                        }),
                        jsx('button', {
                          type: 'button',
                          className: 'll_btnGhost ll_btnGhostIcon',
                          disabled: querying,
                          onClick: clearResults,
                          children: [actionIcon('reset'), t('btn.clear')],
                        }),
                      ],
                    }),
                    /*
                     * 长句那一层：`outcome.hint`（游标过期 / 不支持翻页的走法）与 `outcome.warnings`
                     * （宿主对这次查询做过什么调整：夹了 limit、兜了时间窗、级别是页内筛）。
                     *
                     * **不许吞掉**——agent 工具看得到的东西，面板也得看得到。但也不必把它们塞进
                     * 按钮那一行：它们本来就长，各占一行反而读得清。
                     */
                    outcome === undefined || isDocker ? null : jsx('div', {
                      className: 'll_queryNote',
                      children: [
                        outcome.hint === undefined ? null : jsx('span', { className: 'll_warn', children: outcome.hint }),
                        ...(outcome.warnings === undefined ? [] : outcome.warnings.map((text, at) => jsx('span', { className: 'll_warn', children: text }, 'll-warn-' + String(at)))),
                      ],
                    }),
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
                          /*
                           * 图（第十六刀）：柱子 + **自画的悬停读数** + **峰值记号**。
                           *
                           * 三处改动都来自真机那张放大图：
                           *   ① 原生 tooltip 会**盖住横轴刻度**（灰框正压在 18:27 上），而且它写的是
                           *      `18:28:00.000`——1 分钟一档的桶标到毫秒，纯噪音。改成自画的读数条：
                           *      位置在图的**上方**固定一行（不跟着鼠标跑），时刻按分桶宽度选精度。
                           *   ② 标题写着「峰值 681 条」，可**图上哪一根是 681 完全看不出来**（681 与常态
                           *      460 只差一截，61 根里肉眼挑不出来）。给峰值那根加一道顶部记号 + 数值。
                           *   ③ 悬停时柱子只换个颜色，读者仍得去读 tooltip。现在读数条同时给出**时刻 ·
                           *      条数 · 占全窗的比例**，一眼就是这段量级。
                           *
                           * 读数条**常驻一行**（不悬停时显示当前视图的摘要，即「峰值那一段」）：
                           * 高度不变，鼠标移进移出时下面的横轴不会跳。
                           */
                          jsx('div', {
                            className: 'll_histBars',
                            children: [
                              ...histogram.bars.map((bar) => {
                              /*
                               * 一根柱 = 「这一段有多少条」。点它 = 把窗口夹到这一段重查一次
                               * （与点榜上一行同一条套路：改草稿 → 立刻重查，不拿本地行数糊一个结果）。
                               *
                               * **空桶不给点**：点进一个 0 条的时间段只会得到一个「没有命中」，
                               * 看不出「是你自己点了那根空的」——所以它是一根静态柱子（与榜上
                               * 「空值那一桶不给点」同一条判据：给个点得动、结果却是别的东西的入口更坏）。
                               *
                               * 类名刻意**不带 `btn`**：`scripts/client-style-spec.mjs` 的按钮族检查按
                               * `/btn/i` 抓类名，柱子套上去就会被「同族几何一致」卷进来（柱子的高度
                               * 是内联的、每条都不一样，本来就谈不上同族）。
                               */
                              const barClass = bar.count === 0 ? 'll_histBar ll_histBarEmpty' : 'll_histBar ll_histBarClick'
                              /*
                               * 柱高（第十六刀）：按 `histScale` 那一档算。
                               *
                               * - `linear`：诚实的「占峰值的比例」（从零起）；
                               * - `clipped`：从 `floor` 起画，把挤在顶部的那一大团拉开——
                               *   **柱高不再与条数成正比**，所以界面必须有那句说明（见下面的 note）；
                               * - `flat`：全一样，怎么画都一样。
                               *
                               * 空桶（count = 0）**永远**只是那条 2% 的底座，不参与裁剪：
                               * 「零」是一个真实的值，把它抬到 floor 之上就撒了谎。
                               */
                              const style = {
                                height: String(
                                  bar.count === 0
                                    ? 2
                                    : histScale.mode === 'clipped'
                                      ? Math.max(((bar.count - histScale.floor) / (histScale.max - histScale.floor)) * 100, 2)
                                      : Math.max(bar.ratio * 100, 2),
                                ) + '%',
                              }
                              // 峰值那一根：加一道记号（不然标题里的「峰值 N 条」在图上找不到落点）
                              const isPeak = histPeakTs !== undefined && bar.ts === histPeakTs
                              const peakClass = isPeak ? ' ll_histBarPeak' : ''
                              // 悬停里仍留一个原生 title 作为**兜底**（键盘聚焦也想看到数）：
                              // 但正文已经搬到读数条上，这里只留最短的一句，不再写毫秒
                              const label = t('meta.histBucket', { time: histogramBucketClock(bar.ts, histogram.stepMs), count: bar.count })
                              const hoverIn = () => { setHoverBar(bar.ts) }
                              const hoverOut = () => { setHoverBar(undefined) }
                              if (bar.count === 0) {
                                return jsx('div', {
                                  className: barClass + peakClass,
                                  style,
                                  // **不挂 title**：原生 tooltip 会盖住横轴刻度（真机截图里正压在 18:27 上），
                                  // 而它说的那件事读数条已经说了。空桶本来也点不动，没有动作要提示。
                                  onMouseEnter: hoverIn,
                                  onMouseLeave: hoverOut,
                                }, 'll-hist-' + String(bar.ts))
                              }
                              // 正在放大的那一档：与榜上「正在按它下钻」同一个高亮（看得出这一屏是收窄过的）
                              const active = zoomedBar !== undefined && zoomedBar.from === bar.ts
                              return jsx('button', {
                                type: 'button',
                                className: (active ? barClass + ' ll_histBarActive' : barClass) + peakClass,
                                style,
                                /*
                                 * **不挂 title**（第十六刀）：那是浏览器的原生 tooltip，它会
                                 *   - 停在鼠标旁边、**盖住横轴刻度**（真机截图里那道灰框正压在 18:27 上）；
                                 *   - 悬停约 1 秒才出来，而读数条是即时跟着鼠标走的；
                                 *   - 说的内容与读数条重复，等于同一个数在一屏上说两遍。
                                 * 读数条接管「这一段是多少」，「点下去做什么」也搬过去（悬停时显示）。
                                 *
                                 * aria-label 仍然给全：读屏用户没有读数条可看，这里是唯一的完整句子。
                                 */
                                'aria-label': label + '；' + (active ? t('hint.zoomBarCancel') : t('hint.zoomBar')),
                                disabled: querying,
                                onMouseEnter: hoverIn,
                                onMouseLeave: hoverOut,
                                // 键盘用户：聚焦等于悬停（读数条跟着走，不然 Tab 过来只有一圈焦点环）
                                onFocus: hoverIn,
                                onBlur: hoverOut,
                                onClick: () => { zoomToBarAt(bar.ts, histogram.stepMs) },
                              }, 'll-hist-' + String(bar.ts))
                              }),
                                                            /*
                           * 读数条（第十七刀）：**贴在悬停那根柱子的正上方**，不再是左端常驻的一行。
                           *
                           * 真机原话是「柱子和信息隔得太远了」——上一版读数条固定在容器左端，柱子在
                           * 图中间，两者之间隔着大半个屏，每移一格都要横跨一次。现在它就是那根柱子的
                           * 标签：柱子与它的时刻 · 条数 · 占比在同一列上。
                           *
                           * 不悬停时**不画**：一行常驻的「峰值在 …」还是「信息在别处」那个毛病。
                           * 峰值在哪一根由读数条（悬停峰值柱时）+ 峰值柱的强调色两处指认。
                           */
                          hoverBarAt === undefined ? null : jsx('div', {
                            className: 'll_histReadout',
                            // 位置由柱序号算（柱宽是 flex:1 等分，序号才是屏幕上的真实位置）
                            style: { left: String(hoverBarAt) + '%' },
                            // 读屏：读数变化要能听到（这是一个状态提示，不是装饰）
                            role: 'status',
                            children: [
                              jsx('span', { className: 'll_histReadoutTime', children: histogramBucketClock(hoverBar, histogram.stepMs) }),
                              jsx('span', {
                                className: 'll_histReadoutCount',
                                children: t('meta.histBucketCount', { count: hoverBarCount }),
                              }),
                              jsx('span', {
                                className: 'll_histReadoutShare',
                                children: t('meta.histPeakShare', { percent: hoverBarShare }),
                              }),
                              jsx('span', {
                                className: 'll_histReadoutHint',
                                children: hoverBarIsActive ? t('hint.zoomBarCancel') : t('hint.zoomBarShort'),
                              }),
                            ],
                          }),
                            ],
                          }),
                          /*
                           * 横轴（第十三刀）：柱子下面那行时刻。刻度在渲染前算好（见 `histTicks`），
                           * 回空就不画轴——**一条只有两端的轴等于没标**，反而多一行字把图往下推。
                           *
                           * 时刻精度按**窗口跨度**选（`formatTickTime`）：15 分钟的窗里写 `HH:mm` 就够，
                           * 1 分钟档的窗才需要秒，跨天的窗才需要日期。
                           */
                          histTicks.length === 0 ? null : jsx('div', {
                            className: 'll_histAxis',
                            children: histTicks.map((tick, at, all) => {
                              const edge = at === 0 ? ' ll_histTickStart' : (at === all.length - 1 ? ' ll_histTickEnd' : '')
                              return jsx('span', {
                                className: 'll_histTick' + edge,
                                // 首尾用 left / right 钉住，中间按比例摆（内联 style：每根刻度位置都不同）
                                style: at === 0 || at === all.length - 1 ? undefined : { left: String(tick.at) + '%' },
                                children: formatTickTime(tick.ts, histSpan),
                              }, 'll-tick-' + String(tick.ts))
                            }),
                          }),
                          // 被下限夹过要**说出来**（`clamped`）：窗不是他点的那么宽，静默收窄比报错更难查
                          zoomClamped ? jsx('p', { className: 'll_hint', children: t('hint.zoomClamped') }) : null,
                          /*
                           * 裁剪了就**必须说**（第十六刀）：`clipped` 那一档的柱高不与条数成正比，
                           * 不说的话「这根比那根高一倍」会被读成两倍的量——那正是这张图唯一的用处。
                           * 不裁剪（linear / flat）时不写这句：没发生的事不用解释。
                           */
                          histScale.note === '' ? null : jsx('p', { className: 'll_hint', children: t('hint.histogramClipped') }),
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
                    /*
                     * 字段面板那一层（P8-乙 / 第十二刀起，第二十二刀挪出结果区）。
                     *
                     * 它原来画在 `.ll_workbench` 里、而那个壳的判据是 `lines.length > 0`——于是
                     * **查询回来 0 行时，元信息行的「字段」按钮按下去什么都不会发生**（面板根本没画）。
                     * 浮层本来就是 `position:fixed` 的、不占结果区的布局，所以它不再需要挂在结果区里：
                     * 这一层用 `display:contents` 只是给两个绝对定位的孩子一个位置（自身不生成盒子，
                     * `.ll_panel` 那个 `gap:12px` 的纵向布局不会被多插一个空档）。
                     *
                     * 遮罩只在浮层打开时存在：点面板外任何地方都先收起（一次点击=一件事）。
                     */
                    !isDocker && fieldsOpen ? jsxs('div', {
                      className: 'll_fieldLayer',
                      children: [
                        jsx('div', {
                          className: 'll_fieldScrim',
                          onClick: () => { setFieldsOpen(false) },
                        }),
                        renderColumnAside(),
                      ],
                    }) : null,
                    /*
                     * 结果区 = 结果表（字段面板是上面那一层，不在这个壳里）。
                     *
                     * 它是**浮层**而不是布局里的一栏：真机两轮反馈（常驻「占地方」→ 改成开关后展开
                     * 仍把正文从 577px 挤到 389px）说的是同一件事——看日志的时候宽度全归日志。所以
                     * 面板绝对定位浮在结果上，`.ll_main` 永远是整行宽度；点面板外（遮罩）或再点
                     * 触发它那颗按钮收起。
                     */
                    lines.length > 0 && !isDocker ? jsxs('div', {
                      className: 'll_workbench',
                      children: [
                        jsxs('div', {
                          className: 'll_main',
                          children: [
                            renderColumnChips(),
                            jsx('div', {
                              // 有额外列时改成 grid 行 + 横向滚动（见 columnsTemplate）；0 列仍是原来的 flex 行
                              className: columnsTemplate === '' ? 'll_results' : 'll_results ll_resultsWide',
                              // 列表一滚，浮层锚的那个按钮就不在原来的位置了——直接收起，别让它漂在别处
                              onScroll: closeLabelPanel,
                              // 排序只改**摆的顺序**（判据在 pure.js 的 sortLines）；`lines` 本身不动
                              children: shownLines.map((line) => {
                                /*
                                 * 一行 = 展开箭头 · 时间 · 级别 · 正文 ·（额外列）· **谁写的**（1 个身份标签 + 「＋N」）。
                                 *
                                 * 为什么行上只摆 1 个（2026-10-17 第九刀）：真机 100 行里 `container.name`
                                 * 有 4 个值、`host.name` 只有 1 个（而且值是容器 ID 风格的 hostname）、
                                 * `log.file.path` 与 container.name 一一对应；3 个 chip + 「另有 N 个」会把
                                 * 行高撑到 4 行，而正文常常只有 1～2 行——标签成了主角。现在行上只留**宿主
                                 * 优先顺序的第一个**（通常是 container.name，仍是一键筛选入口），其余收进
                                 * 「＋N」浮层（`allRowLabels`）。
                                 *
                                 * 顺序仍是宿主给的（`LABEL_PRIORITY` 排的就是「排查时先问什么」），这里
                                 * 不重挑；悬停 title 里也仍然有**全部**标签与原文。
                                 *
                                 * 额外列的值取自 `line.labels[field]`（pure.js 的 columnValue）：这一行没带
                                 * 那个字段就画 `—`，悬停说明「这一行没有这个字段」——不造一个假值。
                                 */
                                const tags = rowLabels(line, 1)
                                const more = rowLabelOverflow(line, 1)
                                const panelOpen = labelPanel !== undefined && labelPanel.id === line.id
                                const expanded = expandedId === line.id
                                return jsxs('div', {
                                  className: 'll_resultItem',
                                  children: [
                                    jsxs('div', {
                                      // 展开的那一行淡淡地标出来（整行可点，箭头只是键盘/读屏的明确入口）
                                      className: expanded ? 'll_resultRow ll_resultRowOpen' : 'll_resultRow',
                                      // 有额外列：用固定的列宽模板（正文有下限），窗口不够就横向滚动
                                      style: columnsTemplate === ''
                                        ? undefined
                                        : { display: 'grid', boxSizing: 'border-box', width: '100%', gridTemplateColumns: columnsTemplate },
                                      title: lineTitle(line),
                                      /*
                                       * 整行点一下 = 展开/收起详情（日志大多很长，展开入口不能只有那颗 14px 的箭头）。
                                       * 行里的按钮（身份标签 / ＋N / 展开箭头）各自有动作：**命中 button 就不处理**，
                                       * 否则「点标签筛一次」会顺手把详情翻出来（一次点击干两件事）。
                                       */
                                      onClick: (event) => {
                                        const target = event === null || event === undefined ? undefined : event.target
                                        if (target !== undefined && target !== null && typeof target.closest === 'function' && target.closest('button') !== null) return
                                        setExpandedId(expanded ? undefined : line.id)
                                      },
                                      children: [
                                        // 展开这一行（全部标签 + 原文）：自带一个可见的箭头，整行点开
                                        // 会把「点标签筛」那些入口一起吃掉，所以只给这一颗
                                        jsx('button', {
                                          type: 'button',
                                          className: 'll_rowToggle',
                                          'aria-expanded': expanded,
                                          title: expanded ? t('hint.collapseRow') : t('hint.expandRow'),
                                          onClick: () => { setExpandedId(expanded ? undefined : line.id) },
                                          children: expanded ? '▾' : '▸',
                                        }, 'll-toggle-' + line.id),
                                        jsx('span', { className: 'll_resultTime', children: formatTime(line.ts) }),
                                        jsx('span', { className: 'll_resultLevel ll_resultLevel' + (levelTone(line.level) === 'error' ? 'Error' : levelTone(line.level) === 'warn' ? 'Warn' : levelTone(line.level) === 'info' ? 'Info' : 'Muted'), children: line.level === undefined ? '' : line.level }),
                                        renderMessage(line, denseResults),
                                        ...columns.map((name) => {
                                          const value = columnValue(line, name)
                                          return jsx('span', {
                                            className: 'll_resultCell',
                                            title: value === undefined ? t('hint.columnNoValue', { field: name }) : name + ' = ' + value,
                                            children: value === undefined ? '—' : value,
                                          }, 'll-cell-' + line.id + '-' + name)
                                        }),
                                        tags.length === 0 && more === 0 ? null : jsxs('span', {
                                          className: 'll_resultTags',
                                          children: [
                                            ...tags.map((tag) => (rowFilterProblem(tag) === '' ? jsxs('button', {
                                              type: 'button',
                                              // 类名不带 `btn`（按钮族几何检查按 /btn/i 抓类名）——与直方图柱子同一条
                                              className: 'll_resultTag ll_resultTagHit',
                                              title: t('hint.rowLabelFilter', { field: tag.field, value: tag.value }),
                                              disabled: querying,
                                              // 保住这一次点击：按钮在行里，行本身没有 onMouseDown 的约定，
                                              // 但焦点落到按钮上再重渲染会把 ::focus-visible 跳走，所以先不抢焦点
                                              onMouseDown: (event) => { event.preventDefault() },
                                              onClick: () => { drillDown(tag.field, tag.value) },
                                              // 行上只摆**值**：字段名在行悬停、＋N 浮层与左侧字段栏里都有；
                                              // 键名挤在这 220px 里只会把值切掉（真机：长服务名被切成 `app-svc-…`，后面看不见）
                                              children: jsx('span', { className: 'll_resultTagValue', children: tag.display }),
                                            }, 'll-tag-' + tag.field) : jsx('span', {
                                              // 不可点的标签（空值那类）：照旧摆出来，只是没有那个入口
                                              className: 'll_resultTag',
                                              children: jsx('span', { className: 'll_resultTagValue', children: tag.display }),
                                            }, 'll-tag-' + tag.field))),
                                            more > 0 ? jsx('button', {
                                              type: 'button',
                                              // 类名不带 `btn`：这是行内的小标记，几何本来就跟按钮族不同（与柱子同一条）
                                              className: 'll_resultTagMore',
                                              title: t('hint.rowLabelPanel', { count: more }),
                                              // 浮层开着时说明它属于哪一行（读屏与键盘都能听出来）
                                              'aria-expanded': panelOpen,
                                              'aria-haspopup': 'dialog',
                                              disabled: querying,
                                              onMouseDown: (event) => { event.preventDefault() },
                                              onClick: (event) => { openLabelPanel(event, line) },
                                              children: t('hint.rowMoreLabels', { count: more }),
                                            }, 'll-more-' + line.id) : null,
                                          ],
                                        }),
                                      ],
                                    }, 'll-line-' + line.id),
                                    // 行详情挂在行**下面**（列表本身是纵向 flex）：一次只开一行，换行时上一行收起
                                    expanded ? renderRowDetail(line) : null,
                                  ],
                                }, 'll-item-' + line.id)
                              }),
                            }),
                          ],
                        }),
                      ],
                    }) : null,
                    outcome !== undefined && lines.length === 0 && !isDocker ? jsx('div', { className: 'll_empty', children: t('list.noHit') }) : null,
                    /*
                     * 「下一页」只在**条件没被改过**时才给。
                     *
                     * 游标属于**上一次查询**：ES / OpenSearch 是 PIT + search_after，Loki 是查询串与
                     * 时间窗编码进去的那一份。条件改了还点，宿主不会报错——它会把旧快照里的位置当成
                     * 新条件的下一页，少行 / 错位都静默。收起来（`stale` 为真时不画）并把原因写在上
                     * 面那句提示里，比留一个点了会静默错的入口诚实。
                     */
                    cursor === undefined || isDocker || stale ? null : jsx('button', {
                      type: 'button',
                      className: 'll_btnGhost',
                      disabled: querying,
                      onClick: () => { runQuery(true) },
                      children: t('btn.nextPage'),
                    }),
                  ],
                }) : null,
                /*
                 * 「＋N」浮层：**画在结果列表外面**（`position:fixed`，见 .ll_labelLayer）。
                 * `.ll_results` 有 `max-height:420px; overflow-y:auto`——放在行里会被它裁掉，
                 * 所以是视口坐标 + 全屏一层透明底，点底或 × 收起；行没了（重查后）就不画。
                 */
                labelPanel === undefined || labelLine === undefined ? null : jsxs('div', {
                  className: 'll_labelLayer',
                  children: [
                    jsx('div', { className: 'll_labelBackdrop', onClick: closeLabelPanel }),
                    jsxs('div', {
                      className: 'll_labelPanel',
                      style: { top: String(labelPanel.top) + 'px', left: String(labelPanel.left) + 'px' },
                      tabIndex: -1,
                      onKeyDown: closeOnEscape,
                      children: [
                        jsxs('div', {
                          className: 'll_labelHead',
                          children: [
                            jsx('span', { className: 'll_labelTitle', children: t('panel.labels') }),
                            jsx('span', { children: formatTime(labelLine.ts, true) }),
                            jsx('button', {
                              type: 'button',
                              className: 'll_chipBtn',
                              title: t('btn.closeLabels'),
                              onClick: closeLabelPanel,
                              children: '×',
                            }),
                          ],
                        }),
                        jsx('div', {
                          className: 'll_labelScroll',
                          children: labelTags.map((tag) => (rowFilterProblem(tag) === ''
                            ? jsxs('button', {
                              type: 'button',
                              className: 'll_labelRow',
                              title: t('hint.rowLabelFilter', { field: tag.field, value: tag.value }),
                              onMouseDown: (event) => { event.preventDefault() },
                              onKeyDown: closeOnEscape,
                              onClick: () => {
                                closeLabelPanel()
                                drillDown(tag.field, tag.value)
                              },
                              children: [
                                jsx('span', { className: 'll_labelKey', children: tag.field }),
                                jsx('span', { className: 'll_labelValue', children: tag.display }),
                              ],
                            }, 'll-panel-tag-' + tag.field)
                            : jsxs('div', {
                              // 空白值表达不了「字段 = 值」：与行上那颗标签同一条判据，只是不可点
                              className: 'll_labelRow ll_labelRowStatic',
                              title: t('error.needFilterValue'),
                              children: [
                                jsx('span', { className: 'll_labelKey', children: tag.field }),
                                jsx('span', { className: 'll_labelValue', children: tag.display }),
                              ],
                            }, 'll-panel-tag-' + tag.field))),
                        }),
                      ],
                    }),
                  ],
                }),
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
