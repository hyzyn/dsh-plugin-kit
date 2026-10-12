/* eslint-disable */
/**
 * @hyzyn/dsh-loglens — 浏览器半体：「日志查询」的来源清单设置卡片。
 *
 * 本包是**构建型**：源在 client-src/、产物是包根的 client.js（scripts/build-client.mjs 把
 * client-src/pure.js 内联进来，并在发现任何残留 import 时 exit(1)）。设置面的注册与样式
 * 取值逐条对齐宿主（见 docs/conventions.md 的客户端半体六条硬规矩）。
 *
 * 卡片里现在是四块：来源清单、查询区（时间窗 / 条数 / 结果列表 / 下一页）、**时间分布**（直方图，
 * 只对有聚合能力的来源画——能力由宿主随 `/query` 响应下发）、Docker 容器日志区（选项 0 的面板半格）。
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

    /** 新查询的草稿：默认「最近 1 小时 / 100 条」。 */
    function emptyQuery() {
      return { target: '', q: '', preset: '1h', limit: 100 }
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
      return {
        target: chosen === '' ? fallback : chosen,
        q: String(draft.q == null ? '' : draft.q),
        from: range.from,
        to: range.to,
        limit: Number(draft.limit),
      }
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
     * 请求载荷：**窗口取响应回显的那一份**，不是面板请求的那一份。
     *
     * 宿主可能兜底过（只给一端时补 15 分钟）或按来源上限收窄过；用回显的那份才对得上
     * 「这次查询实际查的是什么」——否则分布会画在一个跟结果列表不同的窗口上。
     * 回显不完整（不是数）时回 `null`：让界面**不发这个请求**，而不是发一个畸形的。
     */
    function histogramPayload(draft, outcome, intervalKey) {
      const echoed = outcome !== null && typeof outcome === 'object' && outcome.window !== null && typeof outcome.window === 'object' ? outcome.window : {}
      const target = outcome !== null && typeof outcome === 'object' && outcome.target !== null && typeof outcome.target === 'object' ? outcome.target : {}
      if (typeof target.id !== 'string' || target.id === '') return null
      if (!Number.isFinite(echoed.from) || !Number.isFinite(echoed.to) || !(echoed.to > echoed.from)) return null
      return {
        target: target.id,
        q: String(draft == null || draft.q == null ? '' : draft.q),
        from: echoed.from,
        to: echoed.to,
        interval: intervalKey,
      }
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
      'card.desc': '把 Loki / Elasticsearch / OpenSearch 等日志后端归一化成一个查询面；当前只有来源清单与开关。',
      'panel.title': '日志来源',
      'panel.histogram': '时间分布',
      'meta.histInterval': '每根柱子 {interval}',
      'meta.histPeak': '峰值 {count} 条',
      'meta.histTotal': '共 {count} 条',
      'meta.histBucket': '{time} · {count} 条',
      'hint.histogram': '这张图来自后端按时间分桶（不是数这一页——这一页被条数截断过，数它只会得到一个假的分布）。',
      'hint.histogramTruncated': '窗口比这张图长，只画了前一部分。',
      'hint.histogramUnsupported': '当前来源不支持聚合（Loki 的指标查询还没接），所以这里没有时间分布。',
      'error.histogram': '时间分布取不到：{message}',
      'hint.notImplemented': '下面可以直接查当前来源；字段清单与「某一行前后」的上下文由 agent 侧的两个工具做（loglens_fields / loglens_context）——面板暂不画它们。',
      'field.kind': '类型',
      'field.label': '名称',
      'field.url': '地址',
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
      'error.needUrl': '这个类型必须填地址',
      'error.badUrl': '地址必须是 http:// 或 https:// 开头的绝对地址',
      'error.badKind': '类型不认识（支持 Loki / Elasticsearch / OpenSearch / Docker）',
      'section.query': '查询',
      'hint.query': '面板直查当前来源：走的是与 agent 工具同一套执行层（同一份归一化与截断信号）。',
      'placeholder.query': '查询串（Loki 是 LogQL；留空即全量）',
      'field.target': '来源',
      'field.window': '时间窗',
      'field.limit': '条数',
      'btn.query': '查询',
      'btn.querying': '查询中…',
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
      'option.dockerAuto': '（让 Docker 面板自己回落）',
      'btn.logsLoading': '加载中…',
      'list.noLogs': '没有日志（换个大点的时间窗或行数再试）',
      'hint.dockerTargetUnknown': '（不在 Docker 面板的目标里）',
    }
    const I18N_EN = {
      'card.name': 'Log query',
      'card.desc': 'Normalizes log backends such as Loki / Elasticsearch / OpenSearch into one query surface; for now only the source list and the switch.',
      'panel.title': 'Log sources',
      'panel.histogram': 'Volume over time',
      'meta.histInterval': 'each bar = {interval}',
      'meta.histPeak': 'peak {count}',
      'meta.histTotal': '{count} total',
      'meta.histBucket': '{time} · {count}',
      'hint.histogram': 'This chart comes from the backend time-bucketing (not from counting this page — the page is capped by the limit, so counting it would only give you a fake distribution).',
      'hint.histogramTruncated': 'The window is longer than this chart; only the first part is drawn.',
      'hint.histogramUnsupported': 'This source cannot aggregate (Loki metric queries are not wired yet), so there is no volume chart here.',
      'error.histogram': 'Could not load the volume chart: {message}',
      'hint.notImplemented': 'You can query the selected source right below; the field list and per-line context live in the agent tools (loglens_fields / loglens_context) — this panel does not draw them yet.',
      'field.kind': 'Kind',
      'field.label': 'Name',
      'field.url': 'URL',
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
      'error.needUrl': 'This kind needs a URL',
      'error.badUrl': 'The URL must be an absolute http:// or https:// address',
      'error.badKind': 'Unknown kind (Loki / Elasticsearch / OpenSearch / Docker)',
      'section.query': 'Query',
      'hint.query': 'Queries the selected source through the same execution layer the agent tools use (identical normalization and truncation signals).',
      'placeholder.query': 'Query string (LogQL for Loki; empty means everything)',
      'field.target': 'Source',
      'field.window': 'Time window',
      'field.limit': 'Limit',
      'btn.query': 'Run',
      'btn.querying': 'Running…',
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

    const CHEVRON_PATH = 'M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 9.13382 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z'

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
      const loadHistogram = async (data, append) => {
        if (append) return
        // `!== true` 连同「不知道」（缺 capabilities）一起挡住：不知道就不发请求、也不画。
        if (supportsAggregation(data) !== true) {
          setHistogram(undefined)
          return
        }
        const step = histogramInterval(data.window === undefined || data.window === null ? 0 : data.window.to - data.window.from)
        const payload = histogramPayload(query, data, step.key)
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

      const runQuery = async (append) => {
        const problem = queryProblem(query, drafts.length)
        if (problem !== '') {
          setError(problem === 'needTarget' ? t('error.needTarget') : t('error.badLimit'))
          return
        }
        setQuerying(true)
        setError('')
        setOk('')
        try {
          const payload = queryPayload(query, drafts, Date.now())
          if (append && cursor !== undefined) payload.cursor = cursor
          const data = await api('/api/dsh-loglens/query', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          })
          setOutcome(data)
          setLines((current) => (append ? appendLines(current, data.lines) : data.lines))
          setCursor(typeof data.nextCursor === 'string' ? data.nextCursor : undefined)
          await loadHistogram(data, append)
        } catch (err) {
          setError(err.message)
        } finally {
          setQuerying(false)
        }
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
                viewBox: '0 0 14 14',
                fill: 'none',
                xmlns: 'http://www.w3.org/2000/svg',
                className: 'll_chevron',
                children: jsx('path', { d: CHEVRON_PATH, fill: 'currentColor' }),
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
                          value: query.target,
                          disabled: saving || querying || dockerBusy,
                          onChange: (event) => { setQuery((current) => ({ ...current, target: event.target.value })) },
                          children: drafts.map((draft) => jsx('option', { value: draft.id, children: draft.label === '' ? draft.id : draft.label }, draft.id)),
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
                    isDocker || outcome === undefined ? null : histogram === undefined
                      ? (supportsAggregation(outcome) === false
                        ? jsx('p', { className: 'll_hint', children: t('hint.histogramUnsupported') })
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
