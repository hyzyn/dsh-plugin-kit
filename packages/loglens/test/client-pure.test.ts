/**
 * @hyzyn/dsh-loglens — 客户端纯逻辑的用例（构建型包：源在 client-src/，产物是 client.js）。
 */
import { describe, expect, it } from 'vitest'
import {
  allRowLabels,
  appendLines,
  columnPickState,
  columnToggle,
  columnValue,
  fieldSections,
  fieldFilterTerms,
  fieldMatches,
  fieldLeaf,
  fieldParent,
  groupFieldsByParent,
  pageFieldUsage,
  panelPlacement,
  fieldPanelHeight,
  fieldNameBreaks,
  fieldValuesKey,
  fieldValuesPayload,
  valueBars,
  valueChoices,
  filterFieldChoices,
  filterBoxBack,
  choiceMove,
  FIELD_VALUES_SIZE,
  FIELD_PANEL_CEILING,
  FIELD_PANEL_WIDTH,
  rawPreview,
  resultColumnsTemplate,
  countsParts,
  draftFromTarget,
  draftPayload,
  draftProblem,
  emptyDraft,
  emptyQuery,
  fieldChoices,
  fieldFetchNeeded,
  filterAdd,
  filterHas,
  filterOf,
  filterProblem,
  filterRemove,
  filtersOf,
  pickMove,
  groupBars,
  groupPayload,
  groupProblem,
  histogramBars,
  histogramAxis,
  histogramBucketClock,
  histogramPeakTs,
  histogramScale,
  formatTickTime,
  histogramInterval,
  histogramPayload,
  kindOptions,
  queryPayload,
  queryProblem,
  querySignature,
  queryStale,
  supportsAggregation,
  windowChoices,
  windowOptions,
  windowProblem,
  windowRange,
  zoomToBar,
  dockerFlagOf,
  dockerLogLines,
  dockerProblem,
  dockerLogTextOf,
  dockerSince,
  dockerTargetChoices,
  containersKey,
  containerSlotState,
  levelChoices,
  levelFiltered,
  levelFilterOf,
  levelTone,
  lineTitle,
  ROW_LABEL_MAX,
  ROW_LABEL_VALUE_MAX,
  RESULT_COLUMN_MAX,
  FIELD_LIST_MAX,
  RAW_PREVIEW_MAX,
  rowFilterProblem,
  rowLabelOverflow,
  rowLabels,
  sortKeyOf,
  sortKeys,
  sortLines,
  unzoomQuery,
} from '../client-src/pure.js'

describe('draft 形状', () => {
  it('kindOptions 是副本：改动不会污染模块内部', () => {
    const options = kindOptions()
    options.push('splunk')
    expect(kindOptions()).toEqual(['loki', 'elasticsearch', 'opensearch', 'docker'])
  })

  it('emptyDraft 是「还没落盘」的新行', () => {
    expect(emptyDraft()).toEqual({ id: '', kind: 'loki', label: '', url: '', dockerTarget: '', index: '' })
  })

  it('index 只在 ES / OpenSearch 的载荷里出现（其余类型带上它宿主会 400）', () => {
    const es = draftPayload({ kind: 'elasticsearch', url: 'http://h:9200', index: '  app-logs-*  ' })
    expect(es.index).toBe('app-logs-*')
    expect(draftPayload({ kind: 'opensearch', url: 'http://h:9200' }).index).toBe('')
    expect('index' in draftPayload({ kind: 'loki', url: 'http://h:3100' })).toBe(false)
    expect('index' in draftPayload({ kind: 'docker' })).toBe(false)
    expect(draftFromTarget({ kind: 'elasticsearch', index: 'logs-*' }).index).toBe('logs-*')
    expect(draftFromTarget({ kind: 'elasticsearch' }).index).toBe('')
  })

  it('draftFromTarget 缺字段补空串、未知类型回落 loki', () => {
    expect(draftFromTarget(undefined)).toEqual({ id: '', kind: 'loki', label: '', url: '', dockerTarget: '', index: '' })
    expect(draftFromTarget({ id: 'es', kind: 'elasticsearch', label: 'ES', url: 'http://127.0.0.1:9200' }))
      .toEqual({ id: 'es', kind: 'elasticsearch', label: 'ES', url: 'http://127.0.0.1:9200', dockerTarget: '', index: '' })
    expect(draftFromTarget({ kind: 'splunk', id: 7 }).kind).toBe('loki')
    expect(draftFromTarget({ kind: 'splunk', id: 7 }).id).toBe('')
  })
})

describe('draftProblem', () => {
  it('地址齐了的 loki 可以提交', () => {
    expect(draftProblem({ id: '', kind: 'loki', label: 'loki', url: 'http://127.0.0.1:3100' })).toBe('')
  })

  it('缺地址 / 不合法地址分别回报 needUrl 与 badUrl', () => {
    expect(draftProblem({ kind: 'loki', url: '' })).toBe('needUrl')
    expect(draftProblem({ kind: 'loki', url: '   ' })).toBe('needUrl')
    expect(draftProblem({ kind: 'loki', url: '127.0.0.1:3100' })).toBe('badUrl')
    expect(draftProblem({ kind: 'elasticsearch', url: 'ftp://127.0.0.1' })).toBe('badUrl')
  })

  it('docker 是采集来源：地址留空也能提交', () => {
    expect(draftProblem({ kind: 'docker', url: '' })).toBe('')
  })

  it('类型不认识时报 badKind', () => {
    expect(draftProblem({ kind: 'splunk', url: 'http://127.0.0.1:3100' })).toBe('badKind')
  })

  it('链路本地地址刻意不在这层拦：宿主 400 会带原因（判据只有宿主一份）', () => {
    expect(draftProblem({ kind: 'loki', url: 'http://169.254.169.254/loki' })).toBe('')
  })
})

describe('draftPayload', () => {
  it('只发三列并去掉首尾空白（id 不进载荷）', () => {
    expect(draftPayload({ id: 'loki', kind: 'loki', label: '  本地 Loki  ', url: '  http://127.0.0.1:3100  ' }))
      .toEqual({ kind: 'loki', label: '本地 Loki', url: 'http://127.0.0.1:3100' })
  })

  it('缺字段不产出 undefined（宿主拿到的是字符串）', () => {
    expect(draftPayload({ kind: 'docker' })).toEqual({ kind: 'docker', label: '', dockerTarget: '', url: '' })
  })

  it('docker 分支不带 index（采集来源没有索引这回事，宿主会 400）', () => {
    expect('index' in draftPayload({ kind: 'docker', index: 'x' })).toBe(false)
  })
})

describe('查询表单（P6 面板侧）', () => {
  it('时间窗预设：由近到远，认不出的回落 1 小时', () => {
    expect(windowOptions()).toEqual(['15m', '1h', '6h', '24h'])
    expect(windowRange('15m', 2_000_000)).toEqual({ from: 2_000_000 - 15 * 60 * 1000, to: 2_000_000 })
    expect(windowRange('nonsense', 2_000_000)).toEqual({ from: 2_000_000 - 60 * 60 * 1000, to: 2_000_000 })
    expect(windowRange('1h', Number.NaN).to).toBeGreaterThan(0)   // now 不合法就取当前时刻
  })

  it('新草稿是「最近 1 小时 / 100 条」，且没有筛选', () => {
    expect(emptyQuery()).toEqual({ target: '', q: '', preset: '1h', limit: 100, filters: [], level: '' })
  })

  it('必填项：多来源时必须选一个；条数必须是正整数', () => {
    expect(queryProblem({ target: 'a', limit: 10 }, 3)).toBe('')
    expect(queryProblem({ target: '', limit: 10 }, 3)).toBe('needTarget')
    expect(queryProblem({ target: '', limit: 10 }, 1)).toBe('')      // 只有一个来源时回落
    expect(queryProblem({ target: 'a', limit: 0 }, 1)).toBe('badLimit')
    expect(queryProblem({ target: 'a', limit: 1.5 }, 1)).toBe('badLimit')
    expect(queryProblem({ target: 'a', limit: 'many' }, 1)).toBe('badLimit')
  })

  it('custom 档必须带一段能用的窗口：缺了它不静默落回预设（那会让「说的窗口」与「查的窗口」变成两件事）', () => {
    const ok = { target: 'a', limit: 10, preset: 'custom', window: { from: 100, to: 200 } }
    expect(queryProblem(ok, 1)).toBe('')
    // 缺 window / 形状不对 / 空窗 / 反向窗：四种都在这里挡下，由界面说清（error.badWindow）
    for (const broken of [undefined, null, {}, { from: 1 }, { from: 'a', to: 'b' }, { from: 200, to: 100 }, { from: 5, to: 5 }]) {
      expect(queryProblem({ target: 'a', limit: 10, preset: 'custom', window: broken }, 1), JSON.stringify(broken)).toBe('badWindow')
    }
    // 非 custom 档不看窗口：预设档本来就没有这一段（空 window 不该把它打回）
    expect(queryProblem({ target: 'a', limit: 10, preset: '1h' }, 1)).toBe('')
    expect(queryProblem({ target: 'a', limit: 10, preset: '1h', window: undefined }, 1)).toBe('')
  })

  it('下拉里实际要摆的档：预设四档；custom **只在自己被选中时**补进去', () => {
    expect(windowChoices('1h')).toEqual(['15m', '1h', '6h', '24h'])
    expect(windowChoices(undefined)).toEqual(['15m', '1h', '6h', '24h'])
    // 少了它浏览器会回落显示第一项（下拉写着「最近 15 分钟」而查的是自定义段）——loglens D04 那个坑
    expect(windowChoices('custom')).toEqual(['15m', '1h', '6h', '24h', 'custom'])
  })

  it('点柱放大：窗口**落进草稿**（preset=custom + window），筛选与查询串原样不动', () => {
    const draft = { target: 'es', q: 'level:error', preset: '1h', limit: 50, filters: [{ field: 'a', value: 'b' }] }
    const zoomed = zoomToBar(draft, 1_000_000, 60_000)
    expect(zoomed.clamped).toBe(false)
    expect(zoomed.query).toEqual({
      target: 'es',
      q: 'level:error',
      limit: 50,
      filters: [{ field: 'a', value: 'b' }],
      preset: 'custom',
      window: { from: 1_000_000, to: 1_060_000 },
    })
    // 原草稿不被改（纯函数；界面靠新对象触发重渲染）
    expect(draft.preset).toBe('1h')
    expect('window' in draft).toBe(false)
  })

  it('点柱放大：比下限还窄的档夹到 1 分钟，并**如实说 clamped**（不许静默收窄）', () => {
    // 10 秒档（HISTOGRAM_STEPS 最细那一档）：点它夹出来的窗只有 10 秒
    const zoomed = zoomToBar({ target: 'es', q: '', preset: '15m', limit: 100, filters: [] }, 5_000_000, 10_000)
    expect(zoomed.clamped).toBe(true)
    expect(zoomed.query.window).toEqual({ from: 5_000_000 - (60_000 - 10_000), to: 5_010_000 })
    expect(zoomed.query.window.to - zoomed.query.window.from).toBe(60_000)
    // 恰好 1 分钟不算被夹（边界不是「小于等于」）
    expect(zoomToBar({ target: 'es', q: '', preset: '1h', limit: 1, filters: [] }, 0, 60_000).clamped).toBe(false)
  })

  it('点柱放大：垃圾入参回 null（界面据此不发请求），别造一段畸形的窗口', () => {
    const draft = { target: 'es', q: '', preset: '1h', limit: 100, filters: [] }
    // 草稿本身缺席（还没进卡片就点到了柱子）：这一支回 null
    for (const bad of [undefined, null]) expect(zoomToBar(bad, 0, 1000)).toBeNull()
    // 柱子的坐标 / 宽度不是数、宽度非正：一律不发请求
    expect(zoomToBar(draft, Number.NaN, 1000)).toBeNull()
    expect(zoomToBar(draft, 0, 0)).toBeNull()
    expect(zoomToBar(draft, 0, -5)).toBeNull()
    expect(zoomToBar(draft, 0, Number.NaN)).toBeNull()
  })

  it('载荷：custom 档用**草稿自带的那一段**，不是从「现在」倒推的预设窗', () => {
    const targets = [{ id: 'es' }]
    const draft = { target: 'es', q: '', preset: 'custom', limit: 20, window: { from: 1_000, to: 2_000 } }
    // nowMs 给一个完全不相干的值：它只对预设档有意义（这段窗口是绝对的）
    expect(queryPayload(draft, targets, 9_999_999)).toEqual({ target: 'es', q: '', from: 1_000, to: 2_000, limit: 20 })
  })

  it('载荷：custom 但窗口不合法时回落预设档——那是**兜底**（正常路径上 queryProblem 已经挡下）', () => {
    const targets = [{ id: 'es' }]
    for (const broken of [undefined, {}, { from: 200, to: 100 }]) {
      const payload = queryPayload({ target: 'es', q: '', preset: 'custom', limit: 20, window: broken }, targets, 1000)
      expect(payload).toEqual({ target: 'es', q: '', from: 1000 - 60 * 60 * 1000, to: 1000, limit: 20 })
    }
  })

  it('载荷：只有一个来源时补上它的 id；查询串原样传（不 trim 掉用户想查的空格语义）', () => {
    const targets = [{ id: 'loki' }]
    const payload = queryPayload({ target: '', q: ' level:error ', preset: '15m', limit: 20 }, targets, 1000)
    expect(payload).toEqual({ target: 'loki', q: ' level:error ', from: 1000 - 15 * 60 * 1000, to: 1000, limit: 20 })
    const chosen = queryPayload({ target: ' es ', q: '', preset: '1h', limit: 20 }, targets, 1000)
    expect(chosen.target).toBe('es')
    // 没有筛选就**不带这个键**：线上形状与加筛选之前逐字节一致
    expect('filters' in payload).toBe(false)
  })

  it('翻页：按 id 去重，脏输入不炸', () => {
    const first = [{ id: 'a' }, { id: 'b' }]
    expect(appendLines(first, [{ id: 'b' }, { id: 'c' }]).map((line) => line.id)).toEqual(['a', 'b', 'c'])
    expect(appendLines(undefined, undefined)).toEqual([])
    expect(appendLines(first, [null]).map((line) => line.id)).toEqual(['a', 'b'])
  })

  it('计数：matched 是下界时用另一个键（界面据此写「至少」）', () => {
    expect(countsParts({ returned: 5 })).toEqual([{ key: 'returned', value: 5 }])
    expect(countsParts({ returned: 5, matched: 5, totalKnown: true, scannedRows: 90 })).toEqual([
      { key: 'returned', value: 5 },
      { key: 'matched', value: 5 },
      { key: 'scannedRows', value: 90 },
    ])
    expect(countsParts({ returned: 5, matched: 10000, totalKnown: false, scannedBytes: 2048 })).toEqual([
      { key: 'returned', value: 5 },
      { key: 'matchedAtLeast', value: 10000 },
      { key: 'scannedBytes', value: 2048 },
    ])
  })
})

describe('查询条件「变了没有」（陈旧结果与游标）', () => {
  const ran = { target: 'es', q: 'level:error', preset: '1h', limit: 100, filters: [{ field: 'container.name', value: 'app' }], level: 'warn' }

  it('同一份条件不算过期：七类字段逐项都不动', () => {
    expect(queryStale({ ...ran }, ran)).toBe(false)
    // 多一个界面上从来不会出现的键（window）也不该算改：预设档根本不看它
    expect(queryStale({ ...ran, window: { from: 1, to: 2 } }, ran)).toBe(false)
  })

  it('改任何一项影响请求的条件都算过期（查询串 / 来源 / 时间窗 / 级别 / 条数 / 筛选）', () => {
    expect(queryStale({ ...ran, q: 'level:error timeout' }, ran)).toBe(true)
    expect(queryStale({ ...ran, target: 'loki' }, ran)).toBe(true)
    expect(queryStale({ ...ran, preset: '15m' }, ran)).toBe(true)
    expect(queryStale({ ...ran, level: 'error' }, ran)).toBe(true)
    expect(queryStale({ ...ran, limit: 20 }, ran)).toBe(true)
    expect(queryStale({ ...ran, filters: [] }, ran)).toBe(true)
    expect(queryStale({ ...ran, filters: [{ field: 'container.name', value: 'other' }] }, ran)).toBe(true)
  })

  it('查询串**不 trim**：末尾多一个空格也是改过（载荷原样下发，判据必须同口径）', () => {
    expect(queryStale({ ...ran, q: 'level:error ' }, ran)).toBe(true)
  })

  it('预设档只比档名：绝对毫秒随「现在」走动，不该把时钟当成用户改动', () => {
    const before = { ...ran, preset: '15m', window: { from: 0, to: 1 } }
    const after = { ...ran, preset: '15m', window: { from: 999_000, to: 1_000_000 } }
    expect(queryStale(before, after)).toBe(false)
  })

  it('custom 档比真实窗口：点柱放大换了一段就是改了', () => {
    const zoomed = { ...ran, preset: 'custom', window: { from: 1_000, to: 2_000 } }
    const other = { ...ran, preset: 'custom', window: { from: 1_000, to: 3_000 } }
    expect(queryStale(other, zoomed)).toBe(true)
    expect(queryStale(zoomed, { ...zoomed })).toBe(false)
  })

  it('筛选只看「字段 = 值」，不看数组顺序（一个字段只有一条）', () => {
    const a = { ...ran, filters: [{ field: 'a', value: '1' }, { field: 'b', value: '2' }] }
    const b = { ...ran, filters: [{ field: 'b', value: '2' }, { field: 'a', value: '1' }] }
    expect(queryStale(a, b)).toBe(false)
  })

  it('级别与载荷同一条归一：认不出的值等于「不限」', () => {
    // 界面上下发时认不出的值会被收成「不限」（levelFilterOf）；比较也必须同口径，
    // 否则草稿里一个永远不会下发的垃圾值会让整屏结果被标成「过期」。
    expect(queryStale({ ...ran, level: 'nonsense' }, { ...ran, level: '' })).toBe(false)
    expect(queryStale({ ...ran, level: ' ERROR ' }, { ...ran, level: 'error' })).toBe(false)
  })

  it('还没查过（lastRun 缺席）不算过期；垃圾入参不抛', () => {
    expect(queryStale(ran, undefined)).toBe(false)
    expect(queryStale(ran, null)).toBe(false)
    expect(querySignature(undefined)).toBe(querySignature(null))
    expect(queryStale(undefined, undefined)).toBe(false)
    // 形状稳定的指纹（纯函数：同一份草稿两次得到同一个字符串）
    expect(querySignature(ran)).toBe(querySignature({ ...ran }))
  })
})

describe('Docker 目标的表单（P6 面板半格）', () => {
  it('since 复用时间窗预设，认不出的回落 1h', () => {
    expect(dockerSince('15m')).toBe('15m')
    expect(dockerSince('24h')).toBe('24h')
    expect(dockerSince('nonsense')).toBe('1h')
  })

  it('没选容器就不给看日志', () => {
    expect(dockerProblem({ container: 'abc' })).toBe('')
    expect(dockerProblem({ container: '' })).toBe('needContainer')
    expect(dockerProblem({})).toBe('needContainer')
  })

  it('日志正文切成行：去掉末尾空行，空串是空列表', () => {
    expect(dockerLogLines('a' + String.fromCharCode(10) + 'b' + String.fromCharCode(10))).toEqual(['a', 'b'])
    expect(dockerLogLines('')).toEqual([])
    expect(dockerLogLines(undefined)).toEqual([])
  })

  it('docker 来源的草稿把「地址」那一格当 Docker 目标名用（往返一致）', () => {
    const draft = draftFromTarget({ id: 'd', kind: 'docker', label: '本机 Docker', dockerTarget: 'local' })
    expect(draft.dockerTarget).toBe('local')
    expect(draftPayload(draft)).toEqual({ kind: 'docker', label: '本机 Docker', dockerTarget: 'local', url: '' })
  })
})

describe('dockerFlagOf：缺字段时保留上一次的判断', () => {
  it('带 plugins 就按它更新', () => {
    expect(dockerFlagOf(false, { plugins: { docker: true } })).toBe(true)
    expect(dockerFlagOf(true, { plugins: { docker: false } })).toBe(false)
  })

  it('不带 plugins（比如 POST /config 的响应）时**不覆盖**——不知道不等于没装', () => {
    expect(dockerFlagOf(true, { ok: true, config: {} })).toBe(true)
    expect(dockerFlagOf(false, undefined)).toBe(false)
    expect(dockerFlagOf(true, { plugins: 'nope' })).toBe(true)
  })
})

describe('containersKey：这份容器清单属于谁（自动拉的缓存键）', () => {
  it('来源 id + Docker 目标名；同一个目标两次算同一个键', () => {
    expect(containersKey({ id: 'target', kind: 'docker', dockerTarget: '目标2' })).toBe('target|目标2')
    expect(containersKey({ id: 'target', kind: 'docker', dockerTarget: '目标2' })).toBe(containersKey({ id: 'target', dockerTarget: '目标2' }))
  })

  it('换目标 / 换来源都是不同的键（容器清单跟着目标走，必须重拉）', () => {
    expect(containersKey({ id: 'target', dockerTarget: '目标2' })).not.toBe(containersKey({ id: 'target', dockerTarget: 'local' }))
    expect(containersKey({ id: 'target', dockerTarget: '目标2' })).not.toBe(containersKey({ id: 'other', dockerTarget: '目标2' }))
  })

  it('目标留空（让 Docker 面板自己回落）也算一个确定的键，空串与缺字段同形', () => {
    expect(containersKey({ id: 'target', dockerTarget: '' })).toBe('target|')
    expect(containersKey({ id: 'target' })).toBe('target|')
    expect(containersKey({ id: 'target', dockerTarget: null })).toBe('target|')
  })

  it('还没选来源就没有键（空键永远不算「已缓存」，也就不会发请求）', () => {
    expect(containersKey({ dockerTarget: '目标2' })).toBe('')
    expect(containersKey({ id: '' })).toBe('')
    expect(containersKey(undefined)).toBe('')
    expect(containersKey(null)).toBe('')
  })
})

describe('containerSlotState：容器下拉第一项此刻该说哪一种状态', () => {
  const base = { available: true, pending: true, busy: true, error: '', count: 0 }

  it('清单到手就回默认：显示哪一项交给 <select value>，占位项只在没选中时露出来', () => {
    expect(containerSlotState({ ...base, count: 2 })).toBe('default')
    // 有清单时**连错误都要让位**：上一次失败之后又拉成功了，眼前这份是好的（不许还写着「加载失败」）
    expect(containerSlotState({ ...base, count: 2, error: 'boom' })).toBe('default')
  })

  it('还没到手：失败 > 在途 > 空清单', () => {
    expect(containerSlotState(base)).toBe('loading')
    expect(containerSlotState({ ...base, busy: false })).toBe('loading')
    // pending 单独也够（effect 还没跑的那一帧就该是「在拉」，不许先闪一下「没有容器」）
    expect(containerSlotState({ available: true, pending: true, count: 0 })).toBe('loading')
    expect(containerSlotState({ available: true, pending: false, busy: false, count: 0 })).toBe('empty')
  })

  it('失败压在「在途」前面：失败不写缓存，pending 会一直为真——顺序反了就永远写着「加载中…」', () => {
    // 这就是 loadContainers 失败之后那一帧的真实入参：busy 已经落回 false，但缓存没写、pending 仍是真
    expect(containerSlotState({ available: true, pending: true, busy: false, error: '容器清单取不到：boom', count: 0 })).toBe('error')
  })

  it('Docker 面板插件不在时回默认：请求根本发不出去，写「加载中…」就是永远不落地的谎', () => {
    expect(containerSlotState({ ...base, available: false })).toBe('default')
    expect(containerSlotState({ available: false, pending: true, error: 'boom' })).toBe('default')
  })

  it('缺参数 / 垃圾入参不炸（这个函数每一帧都被调用）', () => {
    expect(containerSlotState(undefined)).toBe('default')
    expect(containerSlotState(null)).toBe('default')
    expect(containerSlotState({})).toBe('default')
    // count 不是有限数就当没有清单（`NaN` / 字符串都不算「有」）
    expect(containerSlotState({ available: true, pending: true, count: Number.NaN })).toBe('loading')
    expect(containerSlotState({ available: true, pending: true, count: '3' })).toBe('loading')
    expect(containerSlotState({ available: true, error: 5 })).toBe('empty')
  })
})

describe('dockerTargetChoices：把 Docker 面板的目标清单变成选项', () => {
  it('清单里的照原样给（label 缺省用 name）', () => {
    expect(dockerTargetChoices([{ name: 'local', label: '本机' }, { name: '目标2' }], '')).toEqual([
      { value: 'local', label: '本机', known: true },
      { value: '目标2', label: '目标2', known: true },
    ])
  })

  it('当前值不在清单里也要给出来，并标成「不在清单里」', () => {
    const rows = dockerTargetChoices([{ name: 'local' }], 'host-a.internal')
    expect(rows).toHaveLength(2)
    expect(rows[1]).toEqual({ value: 'host-a.internal', label: 'host-a.internal', known: false })
  })

  it('空清单 / 脏输入都不炸', () => {
    expect(dockerTargetChoices(undefined, '')).toEqual([])
    expect(dockerTargetChoices([null, { name: '' }, { name: 42 }], '')).toEqual([])
  })
})

describe('dockerLogTextOf：Docker /logs 的两种形状', () => {
  it('对象形状（真实响应）：取 logs.text', () => {
    expect(dockerLogTextOf({ ok: true, logs: { id: 'upms', text: 'line1' } })).toBe('line1')
  })

  it('字符串形状也认（旧版/别的实现）', () => {
    expect(dockerLogTextOf({ ok: true, logs: 'line1' })).toBe('line1')
  })

  it('认不出就回空串（由界面显示「没有日志」，不静默）', () => {
    expect(dockerLogTextOf(undefined)).toBe('')
    expect(dockerLogTextOf({ ok: true })).toBe('')
    expect(dockerLogTextOf({ ok: true, logs: { id: 'x' } })).toBe('')
    expect(dockerLogTextOf({ ok: true, logs: 42 })).toBe('')
  })
})

describe('字段过滤与分组（第二十一刀）', () => {
  it('过滤词按空白分词、转小写、去重、丢空串（`cont name` 是两个词）', () => {
    expect(fieldFilterTerms('  CONTAINER   name ')).toEqual(['container', 'name'])
    expect(fieldFilterTerms('a a A b')).toEqual(['a', 'b'])
    expect(fieldFilterTerms('')).toEqual([])
    expect(fieldFilterTerms('   ')).toEqual([])
    expect(fieldFilterTerms(null)).toEqual([])
    expect(fieldFilterTerms(undefined)).toEqual([])
  })

  it('**反例（本格的核心）**：`container name`（中间有空格）必须命中 container.name', () => {
    // 改前是单串子串匹配：打得出来「container name」却得到 0 个结果——那不是「没找到」，
    // 是「你打的方式这个框不认」，而它是 92 个字段唯一的导航方式
    const terms = fieldFilterTerms('container name')
    expect(fieldMatches('container.name', terms)).toBe(true)
    expect(fieldMatches('container.image.name', terms)).toBe(true)
    expect(fieldMatches('container.labels.foo', terms)).toBe(false) // 缺 name
    expect(fieldMatches('host.name', terms)).toBe(false) // 缺 container
  })

  it('**接线**：fieldSections 真的用了多词过滤（不是只有 fieldMatches 认）', () => {
    // 这条盯的是「判据写对了、但没接上」——单测 fieldMatches 全绿、面板却还是单串匹配
    // 正是这种漏法（反例实测：把 fieldSections 退回单串，上面几条照样绿）
    const sections = fieldSections(
      [{ name: 'container.name' }, { name: 'host.name' }],
      [{ name: 'container.name', count: 2 }, { name: 'host.name', count: 1 }],
      'cont name',
    )
    expect(sections.hit.map((item) => item.name)).toEqual(['container.name'])
    expect(sections.totals).toEqual({ hit: 1, conflict: 0, rest: 0 })
  })

  it('每个词都要命中（AND，不是 OR）；空词表全命中', () => {
    expect(fieldMatches('host.name', fieldFilterTerms('host name'))).toBe(true)
    expect(fieldMatches('host.name', fieldFilterTerms('host zzz'))).toBe(false)
    expect(fieldMatches('anything', [])).toBe(true)
    expect(fieldMatches('', fieldFilterTerms('x'))).toBe(false)
  })

  it('大小写不敏感；坏输入不抛', () => {
    expect(fieldMatches('Container.Name', fieldFilterTerms('CONTAINER'))).toBe(true)
    expect(fieldMatches(null, [])).toBe(true)
    expect(fieldMatches(undefined, fieldFilterTerms('a'))).toBe(false)
  })

  it('fieldLeaf / fieldParent：最后一段与它前面的父路径；没有点就是自己 / 空串', () => {
    expect(fieldLeaf('container.labels.com_docker_compose_image')).toBe('com_docker_compose_image')
    expect(fieldParent('container.labels.com_docker_compose_image')).toBe('container.labels')
    expect(fieldLeaf('stream')).toBe('stream')
    expect(fieldParent('stream')).toBe('')
    expect(fieldLeaf('')).toBe('')
    expect(fieldParent(null)).toBe('')
  })

  it('按父路径分组：顶层组排最前，组按名字排，组内保持入参顺序', () => {
    const groups = groupFieldsByParent([
      { name: 'host.os.name' }, { name: 'stream' }, { name: 'container.name' },
      { name: 'host.name' }, { name: 'agent.name' }, { name: 'container.labels.a' },
      { name: 'message' },
    ])
    expect(groups.map((group) => group.key)).toEqual(['', 'agent', 'container', 'container.labels', 'host', 'host.os'])
    // 顶层组：两个都在，顺序按入参（调用方已经排好）
    expect(groups[0].items.map((item) => item.name)).toEqual(['stream', 'message'])
    // container 组只装直接子字段（labels 那一坨在自己的组里）
    expect(groups[2].items.map((item) => item.name)).toEqual(['container.name'])
    expect(groups[3].items.map((item) => item.name)).toEqual(['container.labels.a'])
    // 组内保持入参顺序（不重排：那是第二份判据）
    expect(groups[4].items.map((item) => item.name)).toEqual(['host.name'])
  })

  it('分组**不改项的形状**（叶子名由 fieldLeaf 现算，不往数据里塞第二份真相）', () => {
    const item = { name: 'container.name', count: 3, kind: 'indexed' }
    const groups = groupFieldsByParent([item])
    expect(groups[0].items[0]).toBe(item)
  })

  it('分组忽略没有名字的项；坏输入回空数组', () => {
    expect(groupFieldsByParent([undefined, null, { name: '' }, { name: 'a.b' }]).map((g) => g.key)).toEqual(['a'])
    expect(groupFieldsByParent(undefined)).toEqual([])
    expect(groupFieldsByParent(null)).toEqual([])
  })

  it('**真机那一份数据**：58 个 `container.labels.*` 收成一个可折叠的组', () => {
    // 2026-10-17 在 3085 上量到的真实分布（92 个字段）
    const labels = Array.from({ length: 58 }, (_, i) => ({ name: 'container.labels.k' + String(i) }))
    const items = [
      { name: 'container.name' }, { name: 'container.image.name' }, { name: 'container.id' },
      ...labels,
      { name: 'host.name' }, { name: 'host.os.name' }, { name: 'log.file.path' }, { name: 'stream' },
    ]
    const groups = groupFieldsByParent(items)
    const labelGroup = groups.find((group) => group.key === 'container.labels')
    expect(labelGroup.items).toHaveLength(58)
    // 关键成效：`container` 那一组从 61 个降到 **2 个**直接子字段
    // （`container.image.name` 的父路径是 `container.image`，它自成一组——父路径这条规则不认「第一段」）
    expect(groups.find((group) => group.key === 'container').items.map((i) => i.name)).toEqual(['container.name', 'container.id'])
    expect(groups.find((group) => group.key === 'container.image').items.map((i) => i.name)).toEqual(['container.image.name'])
    expect(groups.find((group) => group.key === 'host').items.map((i) => i.name)).toEqual(['host.name'])
  })
})

describe('时间分布：间隔怎么挑（P6 直方图）', () => {
  it('柱数落在看得清的区间里：15m→30s、1h→1m、6h→15m、24h→30m', () => {
    expect(histogramInterval(15 * 60 * 1000)).toEqual({ ms: 30 * 1000, key: '30s' })
    expect(histogramInterval(60 * 60 * 1000)).toEqual({ ms: 60 * 1000, key: '1m' })
    expect(histogramInterval(6 * 60 * 60 * 1000)).toEqual({ ms: 15 * 60 * 1000, key: '15m' })
    expect(histogramInterval(24 * 60 * 60 * 1000)).toEqual({ ms: 30 * 60 * 1000, key: '30m' })
  })

  it('挑的是「第一档不超上限」的那一档：柱数恒 ≤ 60（超长窗口除外，那档已到顶）', () => {
    for (const span of [10 * 1000, 15 * 60 * 1000, 60 * 60 * 1000, 6 * 60 * 60 * 1000, 24 * 60 * 60 * 1000]) {
      const step = histogramInterval(span)
      expect(span / step.ms, String(span)).toBeLessThanOrEqual(60)
    }
  })

  it('认不出的窗口回落 1 小时那一档（不抛、也不会查出一个空分布）', () => {
    const fallback = histogramInterval(60 * 60 * 1000)
    for (const bad of [NaN, 0, -1, undefined, null, '1h' /* 字符串不是数 */]) {
      expect(histogramInterval(bad), String(bad)).toEqual(fallback)
    }
  })

  it('比最大档还长的窗口取最大档（不缩成更细的桶去撞上限）', () => {
    expect(histogramInterval(365 * 24 * 60 * 60 * 1000)).toEqual({ ms: 24 * 60 * 60 * 1000, key: '1d' })
  })
})

describe('时间分布：柱子怎么铺（空档必须补 0）', () => {
  const STEP = 10 * 60 * 1000

  it('**反例（本格的核心）**：两个相邻桶中间的空档补 0，不许挨在一起', () => {
    // 适配器传的是 min_doc_count:1 —— 没数据的桶**不在响应里**。
    // 10:00 有 3 条、10:30 有 5 条，中间那半小时是空的，图上必须有那两根 0。
    const out = histogramBars([{ ts: 0, count: 3 }, { ts: 3 * STEP, count: 5 }], 0, 6 * STEP, STEP)
    expect(out.bars.map((bar) => bar.count)).toEqual([3, 0, 0, 5, 0, 0])
  })

  it('末尾的安静也要留着（不然看不出「半小时前就停了」）', () => {
    const out = histogramBars([{ ts: 0, count: 7 }], 0, 4 * STEP, STEP)
    expect(out.bars.map((bar) => bar.count)).toEqual([7, 0, 0, 0])
    expect(out.bars[out.bars.length - 1].count).toBe(0)
  })

  it('按峰值归一化，并给出峰值与合计', () => {
    const out = histogramBars([{ ts: 0, count: 3 }, { ts: STEP, count: 6 }], 0, 2 * STEP, STEP)
    expect(out.max).toBe(6)
    expect(out.total).toBe(9)
    expect(out.bars.map((bar) => bar.ratio)).toEqual([0.5, 1])
  })

  it('一条都没有：max / total 是 0，ratio 也是 0（**不除零**、不产生 NaN）', () => {
    const out = histogramBars([], 0, 3 * STEP, STEP)
    expect(out.max).toBe(0)
    expect(out.total).toBe(0)
    expect(out.bars.map((bar) => bar.count)).toEqual([0, 0, 0])
    expect(out.bars.every((bar) => bar.ratio === 0)).toBe(true)
  })

  it('同一 ts 出现多次 → 相加（不是让后一个盖掉前一个）', () => {
    const out = histogramBars([{ ts: 0, count: 2 }, { ts: 0, count: 3 }], 0, STEP, STEP)
    expect(out.bars[0].count).toBe(5)
    expect(out.max).toBe(5)
  })

  it('从窗口左端所在的**桶边界**起铺（date_histogram 按 epoch 整数倍对齐）', () => {
    // from=12345 不在 STEP 的整数倍上 → 第一个桶是 0，不是 12345
    const out = histogramBars([{ ts: 0, count: 1 }], 12345, 2 * STEP, STEP)
    expect(out.bars[0].ts).toBe(0)
    expect(out.bars[0].count).toBe(1)
  })

  it('坏输入不抛：间隔为 0 / 窗口反向 → 空结果', () => {
    for (const args of [[[], 0, 1000, 0], [[], 1000, 0, STEP], [[], NaN, NaN, STEP], [[], 0, 1000, -5]]) {
      const out = histogramBars(args[0], args[1], args[2], args[3])
      expect(out).toEqual({ bars: [], max: 0, total: 0, truncated: false })
    }
  })

  it('ts / count 不是数的桶被跳过（不把 NaN 带进 max 或柱高）', () => {
    const out = histogramBars(
      [{ ts: 0, count: 4 }, { ts: NaN, count: 9 }, { ts: STEP, count: NaN }, null, { count: 7 }],
      0, 2 * STEP, STEP,
    )
    expect(out.bars.map((bar) => bar.count)).toEqual([4, 0])
    expect(out.max).toBe(4)
  })

  it('窗口与间隔对不上时按上限兜底，并**如实标 truncated**（少画的就是少画的）', () => {
    // 窗口 200 步、上限 120 根 → 截断，且柱数正好是上限
    const out = histogramBars([], 0, 200 * STEP, STEP)
    expect(out.truncated).toBe(true)
    expect(out.bars).toHaveLength(120)
  })

  it('正常情况 truncated 为假（间隔是按窗口挑的，只有改了窗口没重查才会触发）', () => {
    expect(histogramBars([], 0, 60 * STEP, STEP).truncated).toBe(false)
  })
})

describe('时间分布：柱子怎么归一化（第十六刀）', () => {
  const bar = (ts, count) => ({ ts, count })

  it('**反例（本格的核心）**：数据挤成一条平带时改用基线裁剪，否则图上根本看不出差异', () => {
    // 真机读数：常态 ~460、峰值 681（比 1.47）——线性画法下 50/61 根落在 60~70% 这一档
    const bars = [bar(0, 681), ...Array.from({ length: 60 }, (_, i) => bar((i + 1) * 60_000, 440 + (i % 5) * 8))]
    const scale = histogramScale(bars)
    expect(scale.mode).toBe('clipped')
    // 裁剪之后：最低那根贴近底部、最高那根到顶 —— 差异被拉开
    const floor = scale.floor
    const low = (440 - floor) / (scale.max - floor)
    const high = (681 - floor) / (scale.max - floor)
    expect(high).toBe(1)
    expect(low).toBeGreaterThan(0)
    expect(low).toBeLessThan(0.6)
  })

  it('差异本来就大（最大 ≥ 最小 × 3）时走**线性**，不裁剪也不说那句废话', () => {
    const scale = histogramScale([bar(0, 900), bar(60_000, 20), bar(120_000, 300)])
    expect(scale.mode).toBe('linear')
    expect(scale.floor).toBe(0)
    expect(scale.note).toBe('')
  })

  it('裁剪时必须给出去说明的那个键（柱高不再与条数成正比，说了才不算骗）', () => {
    const scale = histogramScale([bar(0, 500), bar(60_000, 460)])
    expect(scale.mode).toBe('clipped')
    expect(scale.note).toBe('hint.histogramClipped')
  })

  it('全一样 / 只有一个非零桶 → flat，且**不写**裁剪说明（没发生的事不用解释）', () => {
    for (const input of [[bar(0, 300), bar(60_000, 300)], [bar(0, 300), bar(60_000, 0)], [bar(0, 5)]]) {
      const scale = histogramScale(input)
      expect(scale.mode).toBe('flat')
      expect(scale.note).toBe('')
    }
  })

  it('一条都没有 / 坏输入 → flat、max 0，不除零', () => {
    for (const input of [[], undefined, null, [bar(0, 0), bar(60_000, 0)], [null, bar(0, NaN)]]) {
      const scale = histogramScale(input)
      expect(scale.mode).toBe('flat')
      expect(scale.max).toBe(0)
      expect(Number.isFinite(scale.floor)).toBe(true)
    }
  })

  it('floor 留 10% 余量：**最小那根也要看得见**（贴着基线就分不清「很少」与「没有」）', () => {
    // 500 / 200 = 2.5 < 3 → 落在裁剪那一档（差得够开的数据不会走到这里）
    const scale = histogramScale([bar(0, 500), bar(60_000, 200)])
    expect(scale.mode).toBe('clipped')
    // 200 × 0.9 = 180 → 最小那根落在 180 之上，柱高还有一小截
    expect(scale.floor).toBe(180)
    expect(scale.floor).toBeLessThan(200)
  })

  it('floor 至少是 1（条数是整数，基线下限不能是 0.9 这种）', () => {
    const scale = histogramScale([bar(0, 1), bar(60_000, 1.5)])
    expect(Number.isInteger(scale.floor)).toBe(true)
    expect(scale.floor).toBeGreaterThanOrEqual(1)
  })
})

describe('时间分布：峰值记号与读数条的时刻（第十六刀）', () => {
  const STEP = 60 * 1000

  it('峰值那根回它的 ts；**并列取第一根**（确定性：同高时从左读到右）', () => {
    const bars = [{ ts: 0, count: 5 }, { ts: STEP, count: 9 }, { ts: 2 * STEP, count: 9 }, { ts: 3 * STEP, count: 2 }]
    expect(histogramPeakTs(bars)).toBe(STEP)
  })

  it('一条都没有 / 全是 0 / 坏输入 → undefined（界面据此**不画峰值记号**，不画一根假的）', () => {
    for (const input of [[], undefined, null, [{ ts: 0, count: 0 }, { ts: STEP, count: 0 }], [{ ts: NaN, count: 3 }], [{ ts: 0, count: NaN }]]) {
      expect(histogramPeakTs(input)).toBeUndefined()
    }
  })

  it('负计数不算峰值（畸形数据不配当「最忙的那一段」）', () => {
    expect(histogramPeakTs([{ ts: 0, count: -5 }, { ts: STEP, count: 3 }])).toBe(STEP)
  })

  it('读数条的时刻：桶 ≥ 1 分钟时**不写秒**（每一根都写 :00 只是噪音，真机上就这样）', () => {
    const ts = new Date(2026, 9, 17, 18, 28, 0, 0).getTime()
    expect(histogramBucketClock(ts, 60 * 1000)).toBe('18:28')
    expect(histogramBucketClock(ts, 5 * 60 * 1000)).toBe('18:28')
  })

  it('分桶窄于 1 分钟时才写秒（15s 一档里秒是有效信息）', () => {
    const ts = new Date(2026, 9, 17, 18, 28, 45, 0).getTime()
    expect(histogramBucketClock(ts, 15 * 1000)).toBe('18:28:45')
    expect(histogramBucketClock(ts, 1000)).toBe('18:28:45')
  })

  it('**反例（本格的核心）**：同一根柱，分桶宽度不同时读数条的写法可以不同，但**绝不能带毫秒**', () => {
    const ts = new Date(2026, 9, 17, 18, 28, 0, 123).getTime()
    for (const step of [1000, 15 * 1000, 60 * 1000, 60 * 60 * 1000]) {
      const text = histogramBucketClock(ts, step)
      expect(text).not.toContain('.')
      expect(text.split(':').length).toBeLessThanOrEqual(3)
    }
  })

  it('坏输入不抛：ts / step 不是数时按 0 / 整分兜底（**输出的是本地时刻**，别按 UTC 断言）', () => {
    expect(() => histogramBucketClock(NaN, NaN)).not.toThrow()
    // 「按 0 兜底」= epoch 0 的**本地**时刻；这个函数和 formatTime / formatTickTime 同一条口径
    // （界面上显示的是本机时间），所以断言只能拿同一个 Date 算，不能写死 '00:00'
    const epochLocal = new Date(0)
    const pad = (n) => String(n).padStart(2, '0')
    const expected = pad(epochLocal.getHours()) + ':' + pad(epochLocal.getMinutes())
    expect(histogramBucketClock(NaN, NaN)).toBe(expected)
    expect(histogramBucketClock(0, 0)).toBe(expected)
  })
})

describe('时间分布：请求载荷', () => {
  const outcome = {
    target: { id: 't1', kind: 'elasticsearch', label: 'es' },
    window: { from: 1_700_000_000_000, to: 1_700_000_600_000 },
  }

  it('**窗口取响应回显的那一份**——不是面板请求的那一份', () => {
    // 面板请求的是「最近 1 小时」，宿主兜底/收窄后回显的是另一段：必须用回显的。
    const draft = { q: 'level:ERROR', preset: '1h', target: 't1', limit: 100 }
    expect(histogramPayload(draft, outcome, '1m')).toEqual({
      target: 't1',
      q: 'level:ERROR',
      from: 1_700_000_000_000,
      to: 1_700_000_600_000,
      interval: '1m',
    })
  })

  it('回显不完整就回 null——让界面**不发这个请求**，而不是发一个畸形的', () => {
    const draft = { q: '' }
    expect(histogramPayload(draft, undefined, '1m')).toBeNull()
    expect(histogramPayload(draft, {}, '1m')).toBeNull()
    expect(histogramPayload(draft, { target: { id: 't1' } }, '1m')).toBeNull()
    expect(histogramPayload(draft, { target: { id: 't1' }, window: { from: 1, to: 1 } }, '1m')).toBeNull()
    expect(histogramPayload(draft, { target: { id: 't1' }, window: { from: 2, to: 1 } }, '1m')).toBeNull()
    expect(histogramPayload(draft, { target: { id: '' }, window: { from: 1, to: 2 } }, '1m')).toBeNull()
  })

  it('q 缺省是空串（「查全部」是合法查询，不是缺参数）', () => {
    const payload = histogramPayload({}, outcome, '5m')
    expect(payload.q).toBe('')
    expect(payload.interval).toBe('5m')
  })
})

describe('时间分布：横轴刻度（第十三刀）', () => {
  /** 铺一段窗口的柱子（只关心 ts，count 随便给）。 */
  function barsOf(from, to, step) {
    const bars = []
    for (let ts = from; ts < to; ts += step) bars.push({ ts, count: 1 })
    return bars
  }

  it('首尾各一个刻度，中间按整点挑（不超过上限）', () => {
    const step = 60 * 1000
    const from = Date.UTC(2026, 9, 17, 2, 0, 0)
    const to = from + 60 * step
    const ticks = histogramAxis(barsOf(from, to, step), from, to, 4)
    expect(ticks.length).toBeGreaterThanOrEqual(2)
    expect(ticks.length).toBeLessThanOrEqual(4)
    // 首尾就是窗口两端：右端说的是**窗口右沿**（最后一根柱代表 [ts, ts+step)）
    expect(ticks[0]).toEqual({ ts: from, at: 0 })
    expect(ticks[ticks.length - 1]).toEqual({ ts: to, at: 100 })
    // 中间刻度都落在整点上（是 step 的整数倍），且严格在窗口内
    for (const tick of ticks.slice(1, -1)) {
      expect(tick.ts % step).toBe(0)
      expect(tick.ts).toBeGreaterThan(from)
      expect(tick.ts).toBeLessThan(to)
      expect(tick.at).toBeGreaterThan(0)
      expect(tick.at).toBeLessThan(100)
    }
  })

  it('**反例（本格的核心）**：同一个窗口连查两次，刻度必须逐字一致（刻度乱跳就再也找不到「刚才那根高的」）', () => {
    const step = 60 * 1000
    const from = Date.UTC(2026, 9, 17, 2, 0, 17)
    const to = from + 60 * step
    expect(histogramAxis(barsOf(from, to, step), from, to, 4))
      .toEqual(histogramAxis(barsOf(from, to, step), from, to, 4))
  })

  it('窗口越长刻度越稀（不是越多）：1h 与 24h 都不超上限', () => {
    for (const hours of [1, 6, 24]) {
      const step = hours === 1 ? 60 * 1000 : hours === 6 ? 15 * 60 * 1000 : 30 * 60 * 1000
      const from = Date.UTC(2026, 9, 17, 0, 0, 0)
      const to = from + hours * 60 * 60 * 1000
      const ticks = histogramAxis(barsOf(from, to, step), from, to, 4)
      expect(ticks.length).toBeLessThanOrEqual(4)
      expect(ticks[ticks.length - 1].ts).toBe(to)
    }
  })

  it('认不出的输入回空数组——界面据此**不画轴**（只有两端的轴等于没标）', () => {
    expect(histogramAxis([], 0, 1000, 4)).toEqual([])
    expect(histogramAxis([{ ts: 0, count: 1 }], 0, 1000, 4)).toEqual([])
    expect(histogramAxis(undefined, 0, 1000, 4)).toEqual([])
    expect(histogramAxis([{ ts: 10, count: 1 }, { ts: 10, count: 2 }], 0, 1000, 4)).toEqual([])
    expect(histogramAxis([{ ts: 0, count: 1 }, { ts: 10, count: 2 }], 100, 100, 4)).toEqual([])
  })

  it('上限给 1 / 0 / 非整数时按 4 处理（首尾两格是硬要求，上限管的是**中间**那几格）', () => {
    const step = 1000
    // 60 个柱宽、上限回落成 4 → 窗口等分点 20s / 40s 各吸附到柱网格，加首尾共 4 格
    const expected = [0, 20 * step, 40 * step, 60 * step]
    expect(histogramAxis(barsOf(0, 60 * step, step), 0, 60 * step, 1).map((tick) => tick.ts)).toEqual(expected)
    expect(histogramAxis(barsOf(0, 60 * step, step), 0, 60 * step, 0).map((tick) => tick.ts)).toEqual(expected)
    expect(histogramAxis(barsOf(0, 60 * step, step), 0, 60 * step, '4').map((tick) => tick.ts)).toEqual(expected)
  })

  it('中间刻度**间距均匀**且吸附在柱网格上（第一版按「从整点起走 N 根柱」，真机上剩下的第一格就贴着左端那个刻度）', () => {
    const step = 60 * 1000
    // 窗口不从整点开始（真机的 1 小时窗就是「现在往前推一小时」，几乎不可能整点）
    const from = Date.UTC(2026, 9, 17, 2, 13, 37)
    const to = from + 60 * step
    const ticks = histogramAxis(barsOf(Math.floor(from / step) * step, to, step), from, to, 4)
    expect(ticks.map((tick) => tick.ts)).toEqual([
      from,
      Math.round((from + 20 * step) / step) * step,
      Math.round((from + 40 * step) / step) * step,
      to,
    ])
    // 位置按吸附后的 ts 算：标签上的时刻与画在哪儿是同一件事
    for (const tick of ticks) expect(tick.at).toBeCloseTo(((tick.ts - from) / (to - from)) * 100, 1)
  })
})

describe('时间分布：刻度上的时刻（按窗口跨度选精度）', () => {
  const ts = new Date(2026, 9, 17, 18, 5, 42).getTime()

  it('三档：秒 / 时分 / 日期+时分', () => {
    expect(formatTickTime(ts, 90 * 1000)).toBe('18:05:42')
    expect(formatTickTime(ts, 60 * 60 * 1000)).toBe('18:05')
    expect(formatTickTime(ts, 24 * 60 * 60 * 1000)).toBe('10-17 18:05')
  })

  it('边界取「不晚于」：正好 2 分钟仍是秒档，正好 12 小时才带日期', () => {
    expect(formatTickTime(ts, 2 * 60 * 1000)).toBe('18:05:42')
    expect(formatTickTime(ts, 2 * 60 * 1000 + 1)).toBe('18:05')
    expect(formatTickTime(ts, 12 * 60 * 60 * 1000)).toBe('10-17 18:05')
  })

  it('畸形输入不抛错（刻度上是 NaN 也照样渲染出一个字符串）', () => {
    expect(typeof formatTickTime(Number.NaN, Number.NaN)).toBe('string')
    expect(typeof formatTickTime(0, 0)).toBe('string')
  })
})

describe('本页排序（第十三刀）', () => {
  const rows = [
    { id: 'a', ts: 3, level: 'debug', message: 'zebra' },
    { id: 'b', ts: 2, level: 'error', message: 'alpha' },
    { id: 'c', ts: 1, level: undefined, message: 'mike' },
    { id: 'd', ts: 0, level: 'warn', message: 'bravo' },
  ]

  it('time = 宿主原序（**不许**按 ts 重排：同纳秒的多行是切不开的一组，游标依赖原序）', () => {
    expect(sortLines(rows, 'time').map((row) => row.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(sortLines(rows, 'bogus').map((row) => row.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('level = 严重度从重到轻，无级别垫底；同档保持宿主原序', () => {
    expect(sortLines(rows, 'level').map((row) => row.id)).toEqual(['b', 'd', 'a', 'c'])
  })

  it('message = 按正文；同值时保持宿主原序（显式稳定，不赌运行时实现）', () => {
    const same = [{ id: 'x', message: 'dup' }, { id: 'y', message: 'dup' }, { id: 'z', message: 'aaa' }]
    expect(sortLines(same, 'message').map((row) => row.id)).toEqual(['z', 'x', 'y'])
  })

  it('排序改的是**摆的顺序**：回一个新数组，入参数组的内容与身份都不动（下一页还要接着追加）', () => {
    const input = rows.slice()
    const sorted = sortLines(input, 'level')
    expect(input.map((row) => row.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(sorted).not.toBe(input)
    expect(sorted.map((row) => row.id)).toEqual(['b', 'd', 'a', 'c'])
  })

  it('档位收口：不认识的回 time；空 / 单行原样回（不白造一个数组）', () => {
    expect(sortKeyOf('level')).toBe('level')
    expect(sortKeyOf('LEVEL')).toBe('time')
    expect(sortKeyOf(undefined)).toBe('time')
    expect(sortKeys()).toEqual(['time', 'level', 'message'])
    expect(sortLines([], 'level')).toEqual([])
    const one = [{ id: 'only', level: 'error' }]
    expect(sortLines(one, 'level')).toEqual(one)
  })

  it('档位是**判据**、文案在组件里：pure.js 不回键名（文案由 client-src/index.js 逐条列字面量）', () => {
    // 本包的分工与 levelTone 一致：纯模块只回答「哪一档」，键名交给组件——静态 i18n 闸门
    // 只扫得到字面量键（`'btn.sort' + key` 会被报成「域不在白名单里」的同类问题）。
    expect(sortKeys()).toEqual(['time', 'level', 'message'])
    for (const key of sortKeys()) expect(sortKeyOf(key)).toBe(key)
  })
})

describe('时间分布：能力自述的读法（三态）', () => {
  it('宿主说真 → true；说假 → false', () => {
    expect(supportsAggregation({ capabilities: { aggregations: true } })).toBe(true)
    expect(supportsAggregation({ capabilities: { aggregations: false } })).toBe(false)
  })

  it('**不知道就是不知道**（undefined），不许落成 false', () => {
    for (const payload of [undefined, null, {}, { capabilities: null }, { capabilities: {} }, { capabilities: { aggregations: 'true' } }]) {
      expect(supportsAggregation(payload), JSON.stringify(payload)).toBeUndefined()
    }
  })
})

/* ============================ 按字段分组（terms 榜） ============================ */

describe('按字段分组：请求载荷', () => {
  const outcome = {
    target: { id: 't1', kind: 'elasticsearch', label: 'es' },
    window: { from: 1_700_000_000_000, to: 1_700_000_600_000 },
  }

  it('窗口取响应回显的那一份，字段名洗干净（与直方图共用一份判据）', () => {
    expect(groupPayload({ q: 'level:ERROR' }, outcome, '  container.name  ')).toEqual({
      target: 't1',
      q: 'level:ERROR',
      from: 1_700_000_000_000,
      to: 1_700_000_600_000,
      by: 'container.name',
    })
  })

  it('字段为空就回 null——界面**不发**一个没头没脑的聚合请求', () => {
    expect(groupPayload({}, outcome, '')).toBeNull()
    expect(groupPayload({}, outcome, '   ')).toBeNull()
    expect(groupPayload({}, outcome, undefined)).toBeNull()
  })

  it('回显不完整同样回 null（与直方图同一份信封）', () => {
    expect(groupPayload({}, undefined, 'a')).toBeNull()
    expect(groupPayload({}, {}, 'a')).toBeNull()
    expect(groupPayload({}, { target: { id: 't1' } }, 'a')).toBeNull()
    expect(groupPayload({}, { target: { id: 't1' }, window: { from: 2, to: 1 } }, 'a')).toBeNull()
    expect(groupPayload({}, { window: { from: 1, to: 2 } }, 'a')).toBeNull()
  })

  it('q 缺省是空串，且**不带 size**——桶数上限是后端的事，面板不写死「前十」', () => {
    const payload = groupPayload({}, outcome, 'container.name')
    expect(payload.q).toBe('')
    expect('size' in payload).toBe(false)
  })
})

describe('按字段分组：榜单怎么铺', () => {
  it('保持后端给的顺序（契约就是按 count 降序），并按峰值归一化', () => {
    const out = groupBars([{ key: 'a', count: 8 }, { key: 'b', count: 4 }, { key: 'c', count: 2 }])
    expect(out.bars.map((bar) => bar.key)).toEqual(['a', 'b', 'c'])
    expect(out.bars.map((bar) => bar.ratio)).toEqual([1, 0.5, 0.25])
    expect(out.max).toBe(8)
    expect(out.truncated).toBe(false)
  })

  it('**不写合计**：列出来的桶加起来不是命中总数（没列出来的在宿主的警告里）', () => {
    const out = groupBars([{ key: 'a', count: 8 }, { key: 'b', count: 4 }])
    // 返回形状本身就是判据：多一个 total，它就会被读成「这个窗口一共这么多」
    expect(Object.keys(out).sort()).toEqual(['bars', 'max', 'truncated'])
  })

  it('空值键标出来（缺字段的文档在 ES 那边 key 是空串；直接画就是一条没名字的横条）', () => {
    const out = groupBars([{ key: '', count: 3 }, { key: 'ok', count: 1 }, { key: '   ', count: 1 }])
    expect(out.bars.map((bar) => bar.blank)).toEqual([true, false, true])
  })

  it('畸形的桶丢掉：不许把 NaN 画进条宽', () => {
    const out = groupBars([null, { count: 3 }, { key: 'a' }, { key: 'b', count: 'x' }, { key: 'c', count: 2 }, 'nope'])
    expect(out.bars).toEqual([{ key: 'c', count: 2, blank: false, ratio: 1 }])
    expect(out.max).toBe(2)
  })

  it('没有桶（或根本不是数组）就是空榜，不抛', () => {
    for (const input of [[], undefined, null, {}]) {
      expect(groupBars(input as never)).toEqual({ bars: [], max: 0, truncated: false })
    }
  })

  it('桶数超过兜底上限时只画前一部分，并如实标 truncated（峰值仍按整份算）', () => {
    const many = Array.from({ length: 60 }, (_item, index) => ({ key: 'k' + String(index), count: 60 - index }))
    const out = groupBars(many)
    expect(out.truncated).toBe(true)
    expect(out.bars).toHaveLength(50)
    expect(out.max).toBe(60)
  })
})

describe('按字段分组：字段名能不能提交', () => {
  it('空串 / 只有空白 / 缺值都是 needGroupBy；有值就放行', () => {
    expect(groupProblem('container.name')).toBe('')
    expect(groupProblem('')).toBe('needGroupBy')
    expect(groupProblem('   ')).toBe('needGroupBy')
    expect(groupProblem(undefined)).toBe('needGroupBy')
  })
})

describe('字段候选（分组字段那一格的浮层）', () => {
  const fields = [
    { name: 'container.name', kind: 'keyword', preferred: true },
    { name: 'host.name' },
    { name: 'log.file.path' },
  ]

  it('空输入给全部，且**保持宿主给的顺序**（顺聚得动的排在前面是适配器的判据，别在这儿再排一次）', () => {
    expect(fieldChoices(fields, '')).toEqual([{ name: 'container.name' }, { name: 'host.name' }, { name: 'log.file.path' }])
    expect(fieldChoices(fields, undefined)).toEqual([{ name: 'container.name' }, { name: 'host.name' }, { name: 'log.file.path' }])
  })

  it('按输入值做**子串**过滤，大小写不敏感，两端空白不算字（这就是原生 `<input list>` 的行为）', () => {
    expect(fieldChoices(fields, 'name')).toEqual([{ name: 'container.name' }, { name: 'host.name' }])
    expect(fieldChoices(fields, 'LOG.')).toEqual([{ name: 'log.file.path' }])
    expect(fieldChoices(fields, '  host  ')).toEqual([{ name: 'host.name' }])
  })

  it('命中 0 个就回空数组——界面据此**不画**那个浮层（空盒子比不画更像坏了）', () => {
    expect(fieldChoices(fields, 'nope')).toEqual([])
    expect(fieldChoices([], 'x')).toEqual([])
    expect(fieldChoices(undefined, '')).toEqual([])
  })

  it('畸形的条目跳过：不许把 undefined / 空名字画成一行', () => {
    expect(fieldChoices([null, { name: '' }, { name: 'ok' }, {}], '')).toEqual([{ name: 'ok' }])
  })

  it('冲突字段把冲突信息带到行上（宿主标了 conflict 的）；普通候选照旧只有 name', () => {
    // 宿主回的 conflict 是 ES 侧「同名在不同索引里类型不一致」的判据，行上要标出来——
    // 字段候选这一层是唯一能把这句话带到界面的地方（面板不自己去读 _field_caps）
    const mixed = [
      { name: 'host.name' },
      { name: 'container.labels.x', conflict: true, esTypes: ['date', 'text'] },
      { name: 'container.labels.y', conflict: true },
    ]
    expect(fieldChoices(mixed, '')).toEqual([
      { name: 'host.name' },
      { name: 'container.labels.x', conflict: true, esTypes: ['date', 'text'] },
      { name: 'container.labels.y', conflict: true, esTypes: [] },
    ])
    // 冲突标记不参与过滤：按名字筛，该命中还是命中
    expect(fieldChoices(mixed, 'labels')).toEqual([
      { name: 'container.labels.x', conflict: true, esTypes: ['date', 'text'] },
      { name: 'container.labels.y', conflict: true, esTypes: [] },
    ])
  })

  it('当前那一行上下挪：**到头就停**（不绕回），空列表明明说是 0', () => {
    expect(pickMove(0, 1, 3)).toBe(1)
    expect(pickMove(1, -1, 3)).toBe(0)
    expect(pickMove(2, 1, 3)).toBe(2)
    expect(pickMove(0, -1, 3)).toBe(0)
    // 打字把候选改短了、而「当前行」还留在旧位置上时，也要夹回合法范围
    expect(pickMove(5, 0, 3)).toBe(2)
    expect(pickMove(0, 1, 0)).toBe(0)
    expect(pickMove(undefined, 1, 2)).toBe(1)
    expect(pickMove(0, Number.NaN, 2)).toBe(0)
  })

  it('点开时要不要去拉：没拉过 / 换了来源要拉，同一个来源不重拉，空来源不拉', () => {
    expect(fieldFetchNeeded('', 'es')).toBe(true)
    expect(fieldFetchNeeded('es', 'es')).toBe(false)
    expect(fieldFetchNeeded('es', 'local')).toBe(true)
    // 还没选来源：那时候该说的是「先选一个来源」，不是去拉一份不知道属于谁的清单
    expect(fieldFetchNeeded('', '')).toBe(false)
    expect(fieldFetchNeeded('es', undefined)).toBe(false)
    expect(fieldFetchNeeded(undefined, 'es')).toBe(true)
  })
})

describe('结构化筛选（点桶下钻）', () => {
  it('字段与值都不能空：空值**表达不了「字段缺失」**，所以也在这里挡（界面根本不给点）', () => {
    expect(filterProblem('container.name', 'app-svc-1')).toBe('')
    expect(filterProblem('', 'x')).toBe('needFilterField')
    expect(filterProblem('   ', 'x')).toBe('needFilterField')
    expect(filterProblem(undefined, 'x')).toBe('needFilterField')
    expect(filterProblem('container.name', '')).toBe('needFilterValue')
    expect(filterProblem('container.name', '   ')).toBe('needFilterValue')
    expect(filterProblem('container.name', undefined)).toBe('needFilterValue')
  })

  it('值**不做 trim**：键名里的空格是内容的一部分，裁掉就静默筛不到东西（比报错更难查）', () => {
    const draft = { target: 'es', q: '', preset: '1h', limit: 20, filters: [{ field: 'log.level', value: 'ERROR ' }] }
    expect(queryPayload(draft, [{ id: 'es' }], 0).filters).toEqual({ 'log.level': 'ERROR ' })
  })

  it('同一个字段**就地替换**（线上是 Record，一个字段只有一个值；并存会静默盖掉一条）', () => {
    const one = filterAdd([], 'container.name', 'a')
    expect(one).toEqual([{ field: 'container.name', value: 'a' }])
    expect(filterAdd(one, 'container.name', 'b')).toEqual([{ field: 'container.name', value: 'b' }])
    expect(filterAdd(one, 'container.name', 'b').length).toBe(1)
    // 已有的那条**位置不变**：芯片跳位置会让人以为点了别的
    const mixed = filterAdd(one, 'host.name', 'h')
    expect(filterAdd(mixed, 'container.name', 'c')).toEqual([
      { field: 'container.name', value: 'c' },
      { field: 'host.name', value: 'h' },
    ])
  })

  it('「没变」时**原样返回同一个引用**（调用方据此知道什么都没变，不必白查一次）', () => {
    const list = [{ field: 'container.name', value: 'a' }]
    expect(filterAdd(list, 'container.name', 'a')).toBe(list)
    expect(filterRemove(list, 'host.name')).toBe(list)
    expect(filterRemove(list, 'container.name')).toEqual([])
  })

  it('filterHas 与 filterAdd 的「已存在」判据**同源**（点一下下钻、再点一下取消靠的就是它）', () => {
    const list = [{ field: 'container.name', value: 'a' }]
    expect(filterHas(list, 'container.name', 'a')).toBe(true)
    expect(filterHas(list, 'container.name', 'b')).toBe(false)
    expect(filterHas([], 'container.name', 'a')).toBe(false)
    expect(filterHas(undefined, 'container.name', 'a')).toBe(false)
    expect(filterOf(list, 'container.name')).toBe('a')
    expect(filterOf(list, 'host.name')).toBeUndefined()
    // 脏输入不炸
    expect(filterAdd(undefined, 'a', 'b')).toEqual([{ field: 'a', value: 'b' }])
    expect(filterRemove(undefined, 'a')).toEqual([])
  })

  it('载荷：有筛选才带 filters 这个键；空表回 undefined（不造一个空对象）', () => {
    const targets = [{ id: 'es' }]
    const none = queryPayload({ target: 'es', q: '', preset: '1h', limit: 20, filters: [] }, targets, 0)
    expect('filters' in none).toBe(false)
    const some = queryPayload(
      { target: 'es', q: '', preset: '1h', limit: 20, filters: [{ field: 'container.name', value: 'app-svc-1' }] },
      targets,
      0,
    )
    expect(some.filters).toEqual({ 'container.name': 'app-svc-1' })
    expect(filtersOf([])).toBeUndefined()
    expect(filtersOf(undefined)).toBeUndefined()
    expect(filtersOf([null, undefined])).toBeUndefined()
    expect(filtersOf([{ field: 'a', value: 1 }])).toEqual({ a: '1' })
  })

  it('聚合载荷也带筛选：下钻之后分布与榜必须画在**同一个子集**上（不然同一屏三个数字说的不是一件事）', () => {
    const outcome = { target: { id: 't1' }, window: { from: 10, to: 20 } }
    const draft = { q: '', filters: [{ field: 'container.name', value: 'app-svc-1' }] }
    expect(histogramPayload(draft, outcome, '1m')).toEqual({
      target: 't1',
      q: '',
      from: 10,
      to: 20,
      interval: '1m',
      filters: { 'container.name': 'app-svc-1' },
    })
    expect(groupPayload(draft, outcome, 'host.name')).toEqual({
      target: 't1',
      q: '',
      from: 10,
      to: 20,
      by: 'host.name',
      filters: { 'container.name': 'app-svc-1' },
    })
    // 没有筛选时聚合载荷跟从前一样**不带这个键**
    expect('filters' in histogramPayload({ q: '' }, outcome, '1m')).toBe(false)
  })
})

describe('级别筛选（宿主既有入参，页内筛）', () => {
  it('下拉是「不限 + 六档」，顺序与宿主的 CANONICAL_LEVELS 逐字一致', () => {
    // 对偶关系：src/line.ts 的 CANONICAL_LEVELS 是宿主的真相源，这里是浏览器侧那一份。
    // 两边漂了不会编译报错（浏览器半体引不了宿主模块），只会让某一档在界面上消失。
    expect(levelChoices()).toEqual(['', 'trace', 'debug', 'info', 'warn', 'error', 'fatal'])
  })

  it('levelFilterOf 只认那六档：空 / 不认识 / 大小写 / 垃圾一律当「不限」', () => {
    expect(levelFilterOf({ level: 'error' })).toBe('error')
    // 大小写与空白收进来（用户可见的值只有下拉能给，但草稿也可能从别处来）
    expect(levelFilterOf({ level: ' ERROR ' })).toBe('error')
    // **不认识 = 不限**：直接把草稿值塞进载荷会被宿主打回（level 是枚举），
    // 整次查询变成错误；「不下发」比「发一个必被打回的值」好
    expect(levelFilterOf({ level: 'critical' })).toBe('')
    expect(levelFilterOf({ level: 'info; DROP' })).toBe('')
    expect(levelFilterOf({ level: '' })).toBe('')
    expect(levelFilterOf({})).toBe('')
    expect(levelFilterOf(undefined)).toBe('')
    expect(levelFilterOf(null)).toBe('')
    expect(levelFilterOf({ level: 42 })).toBe('')
  })

  it('levelFiltered 与「载荷里带不带 level」同真同假（界面那句边界声明就靠它）', () => {
    expect(levelFiltered({ level: 'warn' })).toBe(true)
    expect(levelFiltered({ level: '' })).toBe(false)
    expect(levelFiltered({ level: 'critical' })).toBe(false)
    expect(levelFiltered({})).toBe(false)
  })

  it('载荷：不限级别时**不带这个键**（线上形状与加它之前逐字节一致）', () => {
    const targets = [{ id: 'es' }]
    const none = queryPayload({ target: 'es', q: '', preset: '1h', limit: 20, level: '' }, targets, 0)
    expect('level' in none).toBe(false)
    expect('level' in queryPayload({ target: 'es', q: '', preset: '1h', limit: 20 }, targets, 0)).toBe(false)
    // 垃圾值也不带（收成「不限」之后仍是空）
    expect('level' in queryPayload({ target: 'es', q: '', preset: '1h', limit: 20, level: 'nope' }, targets, 0)).toBe(false)
  })

  it('载荷：选了档就原样下发（宿主 readLevel 认这六档）', () => {
    const targets = [{ id: 'es' }]
    const payload = queryPayload({ target: 'es', q: 'x', preset: '15m', limit: 50, level: 'error' }, targets, 0)
    expect(payload.level).toBe('error')
    // 与筛选、窗口共存（三者都是「这一次查的是哪个子集」，一次请求一起发）
    const both = queryPayload({
      target: 'es', q: '', preset: '1h', limit: 20, level: 'fatal', filters: [{ field: 'a', value: 'b' }],
    }, targets, 0)
    expect(both.level).toBe('fatal')
    expect(both.filters).toEqual({ a: 'b' })
  })
})

describe('行上的标签（谁写的）', () => {
  const line = {
    ts: 1_700_000_000_000,
    level: 'error',
    levelInferred: true,
    message: 'boom',
    source: '0',
    labels: { 'container.name': 'app-1', 'host.name': 'node-7', 'log.file.path': '/var/log/app.log', 'stream': 'stderr', 'kubernetes.pod.name': 'app-1-abc' },
    raw: '{"message":"boom"}',
    id: '0:0',
  }

  it('按**宿主给的顺序**取前 3 个（顺序已是判据，不在这里重挑）', () => {
    expect(rowLabels(line, ROW_LABEL_MAX).map((row) => row.field)).toEqual([
      'container.name', 'host.name', 'log.file.path',
    ])
    // max 可调（界面上是常量，用例给 2 验它真的按参数走）
    expect(rowLabels(line, 2).map((row) => row.field)).toEqual(['container.name', 'host.name'])
  })

  it('空值不摆（没有值的标签占位，会把有值的挤掉）', () => {
    const sparse = { labels: { 'container.name': '', 'host.name': 'node-7', 'stream': 'stdout' } }
    expect(rowLabels(sparse, 3).map((row) => row.field)).toEqual(['host.name', 'stream'])
  })

  it('超长值截断并带省略号（后面的还有——原文永远在 raw / 悬停里）', () => {
    const long = 'x'.repeat(ROW_LABEL_VALUE_MAX + 50)
    const [row] = rowLabels({ labels: { 'stack.trace': long } }, 1)
    expect(row.display.length).toBe(ROW_LABEL_VALUE_MAX + 1)
    expect(row.display.endsWith('…')).toBe(true)
    // **值本身不截**：下发给筛选的必须是原值（截过的值筛不到东西——与 filterProblem 不 trim 同一条）
    expect(row.value).toBe(long)
    expect(rowFilterProblem(row)).toBe('')
  })

  it('垃圾入参不炸：没有 labels / labels 不是对象 / line 本身缺席', () => {
    expect(rowLabels(undefined, 3)).toEqual([])
    expect(rowLabels(null, 3)).toEqual([])
    expect(rowLabels({}, 3)).toEqual([])
    expect(rowLabels({ labels: 'nope' }, 3)).toEqual([])
    expect(rowLabels({ labels: null }, 3)).toEqual([])
    // max 垃圾时回默认 3（它每一行都被调用，不许抛）
    expect(rowLabels(line, 0).length).toBe(3)
    expect(rowLabels(line, Number.NaN).length).toBe(3)
  })

  it('rowLabelOverflow 报「还有几个没摆出来」（0 = 全摆下了）', () => {
    expect(rowLabelOverflow(line, 3)).toBe(2)
    expect(rowLabelOverflow(line, 5)).toBe(0)
    // 空值的那些不算「没摆出来」——它们本来就不该占位（否则悬停说「还有 2 个」而点开只有空值）
    expect(rowLabelOverflow({ labels: { a: '', b: '', c: 'v' } }, 3)).toBe(0)
    expect(rowLabelOverflow({}, 3)).toBe(0)
    expect(rowLabelOverflow(undefined, 3)).toBe(0)
  })

  it('allRowLabels：摆**全部**有值的标签（「＋N」浮层用），顺序与判据同 rowLabels', () => {
    // 顺序就是宿主装进 labels 的顺序（行上一格与浮层同一条，不在浮层里重排）
    expect(allRowLabels(line).map((row) => row.field)).toEqual([
      'container.name', 'host.name', 'log.file.path', 'stream', 'kubernetes.pod.name',
    ])
    // 与 rowLabels(line, N) 逐项同源：前 N 个就是它（display 截断 / value 不截）
    expect(allRowLabels(line).slice(0, 2)).toEqual(rowLabels(line, 2))
    const long = 'x'.repeat(ROW_LABEL_VALUE_MAX + 1)
    const [only] = allRowLabels({ labels: { long } })
    expect(only.display.endsWith('…')).toBe(true)
    expect(only.value).toBe(long)
    // 空值不摆；垃圾入参不炸
    expect(allRowLabels({ labels: { a: '', b: 'v' } })).toEqual([{ field: 'b', value: 'v', display: 'v' }])
    expect(allRowLabels(undefined)).toEqual([])
    expect(allRowLabels(null)).toEqual([])
    expect(allRowLabels({ labels: 'nope' })).toEqual([])
  })

  it('悬停文案：时间 + 级别（**推断出来的要标出来**）+ 全部标签 + 原文', () => {
    const title = lineTitle(line)
    expect(title).toContain('error（从正文推断）')
    expect(title).toContain('container.name = app-1')
    expect(title).toContain('kubernetes.pod.name = app-1-abc')   // 摆不下 3 个的那些也在悬停里
    expect(title).toContain('{"message":"boom"}')
    // 有级别但没推断 → 不标那句（两种可信度只有后者要写）
    expect(lineTitle({ ts: 0, level: 'warn', labels: {}, raw: '' })).not.toContain('推断')
    expect(lineTitle(undefined)).toBe('')
  })

  it('可点性判据就是 filterProblem 那条：空值不给入口（表达不了「字段缺失」）', () => {
    expect(rowFilterProblem({ field: 'host.name', value: 'node-7' })).toBe('')
    expect(rowFilterProblem({ field: 'host.name', value: '   ' })).toBe('needFilterValue')
    expect(rowFilterProblem({ field: '', value: 'x' })).toBe('needFilterField')
    expect(rowFilterProblem(undefined)).toBe('needFilterField')
  })

  it('**值不做 trim**（与芯片 / 下钻同一条）：空格是内容的一部分，裁掉就静默筛不到', () => {
    const row = { field: 'log.level', value: 'ERROR ' }
    expect(rowFilterProblem(row)).toBe('')
    expect(rowLabels({ labels: { 'log.level': 'ERROR ' } }, 1)[0].value).toBe('ERROR ')
    expect(rowLabels({ labels: { 'log.level': 'ERROR ' } }, 1)[0].display).toBe('ERROR ')
  })
})

describe('取消放大（再点一次那一档）', () => {
  it('回到放大**之前**那一档，并把自定义窗口撤掉（不留第二份真相）', () => {
    const zoomed = { target: 'es', q: 'x', preset: 'custom', window: { from: 1_000, to: 2_000 }, limit: 50, filters: [{ field: 'a', value: 'b' }], level: 'error' }
    const back = unzoomQuery(zoomed, '15m')
    expect(back.preset).toBe('15m')
    // 窗口必须**撤掉**（不是留着）：留着它 = 「下拉写着 15 分钟、草稿里还夹着自定义段」
    expect('window' in back).toBe(false)
    // 其余一律不动：取消放大不该顺手改用户的查询串 / 筛选 / 条数 / 级别
    expect(back.q).toBe('x')
    expect(back.limit).toBe(50)
    expect(back.filters).toEqual([{ field: 'a', value: 'b' }])
    expect(back.level).toBe('error')
    // 纯函数：入参不被改（界面靠新对象触发重渲染）
    expect(zoomed.preset).toBe('custom')
    expect(zoomed.window).toEqual({ from: 1_000, to: 2_000 })
  })

  it('`from` 必须是真预设：认不出就回 null（宁可那一下没反应，也不替用户挑一档）', () => {
    const zoomed = { target: 'es', preset: 'custom', window: { from: 1, to: 2 } }
    for (const bad of ['', 'custom', 'nonsense', undefined, null, 42, '1H']) {
      expect(unzoomQuery(zoomed, bad), JSON.stringify(bad)).toBeNull()
    }
    // 草稿本身缺席也回 null（界面据此不发请求）
    expect(unzoomQuery(undefined, '1h')).toBeNull()
    expect(unzoomQuery(null, '1h')).toBeNull()
    // 四档预设都认
    for (const key of ['15m', '1h', '6h', '24h']) expect(unzoomQuery(zoomed, key).preset).toBe(key)
  })

  it('与 zoomToBar 配成一对：放大 → 取消 回到原档，且往返不改窗口以外的任何东西', () => {
    const draft = { target: 'es', q: 'level:error', preset: '6h', limit: 30, filters: [] }
    const zoomed = zoomToBar(draft, 5_000_000, 60_000)
    expect(zoomed.query.preset).toBe('custom')
    const back = unzoomQuery(zoomed.query, draft.preset)
    expect(back).toEqual({ ...draft })
  })
})

describe('字段侧栏：这一页的字段使用情况', () => {
  it('按行数数，空值不算；同次数按名字排（顺序稳定，不随对象键漂）', () => {
    const usage = pageFieldUsage([
      { labels: { 'container.name': 'a', 'host.name': 'h1', 'log.file.path': '/a' } },
      { labels: { 'container.name': 'a', 'host.name': '' } },
      { labels: { 'container.name': 'b', 'host.name': 'h2', 'log.file.path': '' } },
    ])
    expect(usage).toEqual([
      { name: 'container.name', count: 3 },
      { name: 'host.name', count: 2 },
      // 第三行那个是空串（不占位），所以只算 1 行
      { name: 'log.file.path', count: 1 },
    ])
  })

  it('不认畸形的行 / labels：只数真带上来的（空串不占位）', () => {
    expect(pageFieldUsage(undefined)).toEqual([])
    expect(pageFieldUsage([undefined, null, 42, { labels: undefined }, { labels: 'x' }, { labels: {} }])).toEqual([])
    expect(pageFieldUsage([{ labels: { a: null, b: undefined, c: '' } }])).toEqual([])
    // 数字与布尔也照字符串算（与 flattenLabels 同一条：有值就算）
    expect(pageFieldUsage([{ labels: { n: 0, b: true } }])).toEqual([
      { name: 'b', count: 1 },
      { name: 'n', count: 1 },
    ])
  })
})

describe('字段侧栏：三分区（本页命中 / 其余可用 / 类型冲突）', () => {
  const fields = [
    { name: 'container.name', kind: 'indexed', preferred: true },
    { name: 'host.name', kind: 'indexed' },
    { name: 'service.name', kind: 'indexed', preferred: true },
    { name: 'bad.field', kind: 'indexed', conflict: true, esTypes: ['date', 'text'] },
    { name: 'zeta', kind: 'indexed' },
  ]
  const usage = [
    { name: 'container.name', count: 3 },
    { name: 'host.name', count: 1 },
  ]

  it('三分区互斥：命中优先（哪怕它也标了冲突）；冲突不进「其余」', () => {
    const sections = fieldSections(fields, usage, '')
    expect(sections.hit.map((item) => item.name)).toEqual(['container.name', 'host.name'])
    expect(sections.rest.map((item) => item.name)).toEqual(['service.name', 'zeta'])
    expect(sections.conflict.map((item) => item.name)).toEqual(['bad.field'])
    // 冲突标记要跟着这一行走（侧栏在冲突分区里靠它画小标记）
    expect(sections.conflict[0].conflict).toBe(true)
    expect(sections.conflict[0].esTypes).toEqual(['date', 'text'])
    expect(sections.totals).toEqual({ hit: 2, conflict: 1, rest: 2 })

    // 命中里带上 `/fields` 的类型信息（行上没有类型，侧栏要能悬停给人看）
    expect(sections.hit[0].kind).toBe('indexed')
    expect(sections.hit[0].preferred).toBe(true)
    // 冲突字段不会被重复摆到「其余」里
    expect(sections.rest.some((item) => item.name === 'bad.field')).toBe(false)
  })

  it('命中字段若在 /fields 里也标了冲突，仍然留在命中区并带上冲突标记（它这一页真能画列）', () => {
    const sections = fieldSections(
      [{ name: 'bad.field', kind: 'indexed', conflict: true, esTypes: ['date', 'text'] }],
      [{ name: 'bad.field', count: 2 }],
      '',
    )
    expect(sections.hit[0].conflict).toBe(true)
    expect(sections.hit[0].esTypes).toEqual(['date', 'text'])
    expect(sections.conflict).toEqual([])
  })

  it('子串过滤（不区分大小写）作用在三个分区上，totals 报的是过滤后的数', () => {
    const sections = fieldSections(fields, usage, 'NAME')
    expect(sections.hit.map((item) => item.name)).toEqual(['container.name', 'host.name'])
    expect(sections.rest.map((item) => item.name)).toEqual(['service.name'])
    expect(sections.totals).toEqual({ hit: 2, conflict: 0, rest: 1 })
    expect(fieldSections(fields, usage, '  nomatch  ').totals).toEqual({ hit: 0, conflict: 0, rest: 0 })
  })

  it('其余字段的排序：常用（preferred）优先，再按名字；列表外的垃圾字段被忽略', () => {
    const sections = fieldSections(
      [undefined, null, { name: '' }, { name: 'b' }, { name: 'a' }, { name: 'z', preferred: true }, { name: 'a' }],
      [],
      '',
    )
    expect(sections.rest.map((item) => item.name)).toEqual(['z', 'a', 'b'])
  })

  it('字段清单还没拉到（空）时，命中区仍然可用——它只靠这一页的 labels', () => {
    const sections = fieldSections(undefined, usage, '')
    expect(sections.hit.map((item) => item.name)).toEqual(['container.name', 'host.name'])
    expect(sections.hit[0].kind).toBeUndefined()
    expect(sections.rest).toEqual([])
    expect(sections.conflict).toEqual([])
  })
})

describe('字段侧栏：结果表列集', () => {
  it('加一列 / 再去掉同一列（同一个入口是全集的开关）', () => {
    const first = columnToggle([], 'container.name')
    expect(first).toEqual({ columns: ['container.name'], problem: '' })
    expect(columnToggle(first.columns, 'host.name').columns).toEqual(['container.name', 'host.name'])
    expect(columnToggle(['container.name', 'host.name'], 'container.name')).toEqual({
      columns: ['host.name'],
      problem: '',
    })
    // 纯函数：入参不被改（界面靠新数组触发重渲染）
    const original = ['a']
    columnToggle(original, 'b')
    expect(original).toEqual(['a'])
  })

  it('上限 4 列：到顶再加回 columnLimit，且列集不变（不是静默丢掉）', () => {
    let columns = []
    for (const name of ['a', 'b', 'c', 'd']) columns = columnToggle(columns, name).columns
    expect(columns).toHaveLength(RESULT_COLUMN_MAX)
    const full = columnToggle(columns, 'e')
    expect(full.problem).toBe('columnLimit')
    expect(full.columns).toEqual(columns)
    // 满员时仍能**去掉**已有的那一列（出口不能被上限堵住）
    expect(columnToggle(columns, 'c').columns).toEqual(['a', 'b', 'd'])
  })

  it('空字段名不给加（那是界面的 bug，不该变成一列空值）', () => {
    expect(columnToggle([], '').problem).toBe('badColumn')
    expect(columnToggle(undefined, null).problem).toBe('badColumn')
  })

  it('列值取行标签的原值；这一行没带就回 undefined（界面画 —，不造假值）', () => {
    const line = { labels: { 'container.name': 'app-1', 'log.level': '' } }
    expect(columnValue(line, 'container.name')).toBe('app-1')
    expect(columnValue(line, 'host.name')).toBeUndefined()
    expect(columnValue(line, 'log.level')).toBeUndefined()
    expect(columnValue(undefined, 'container.name')).toBeUndefined()
    expect(columnValue(line, '')).toBeUndefined()
  })
})

describe('行详情：原文截断（必须明说）', () => {
  it('没超长就原样给（truncated 为假）', () => {
    expect(rawPreview('hello')).toEqual({ text: 'hello', truncated: false, total: 5 })
    expect(rawPreview('', 10)).toEqual({ text: '', truncated: false, total: 0 })
  })

  it('超长截断并报原文长度（截断的信号跟着结果走，不静默）', () => {
    const raw = 'x'.repeat(RAW_PREVIEW_MAX + 5)
    const preview = rawPreview(raw)
    expect(preview.text).toHaveLength(RAW_PREVIEW_MAX)
    expect(preview.truncated).toBe(true)
    expect(preview.total).toBe(RAW_PREVIEW_MAX + 5)
    // 自定义上限（用例侧）：边界正好等于上限时不算截断
    expect(rawPreview('abcde', 5)).toEqual({ text: 'abcde', truncated: false, total: 5 })
    expect(rawPreview('abcdef', 5)).toEqual({ text: 'abcde', truncated: true, total: 6 })
  })

  it('缺席 / 畸形输入回空串，不抛错', () => {
    expect(rawPreview(undefined)).toEqual({ text: '', truncated: false, total: 0 })
    expect(rawPreview(null, 0)).toEqual({ text: '', truncated: false, total: 0 })
    expect(rawPreview(42, -1)).toEqual({ text: '42', truncated: false, total: 2 })
  })
})

describe('侧栏分区渲染上限（字段多的时候不把 DOM 撑爆）', () => {
  it('FIELD_LIST_MAX 是一个正整数上限（界面按它截断，并报出「共 N 个」）', () => {
    expect(Number.isInteger(FIELD_LIST_MAX)).toBe(true)
    expect(FIELD_LIST_MAX).toBeGreaterThan(0)
    // 分区本身不截断：界面按 totals 说数、按 FIELD_LIST_MAX 渲染——两件事各归各
    const fields = Array.from({ length: FIELD_LIST_MAX + 7 }, (_, at) => ({ name: 'f' + String(at) }))
    const sections = fieldSections(fields, [], '')
    expect(sections.totals.rest).toBe(FIELD_LIST_MAX + 7)
    expect(sections.rest).toHaveLength(FIELD_LIST_MAX + 7)
  })
})

describe('结果表列宽模板（有额外列时改用 grid + 横向滚动，正文不许被挤成 0 宽）', () => {
  it('0 列回空串（界面退回原来的 flex 行，行为一点不变）', () => {
    expect(resultColumnsTemplate([])).toBe('')
    expect(resultColumnsTemplate(undefined)).toBe('')
  })

  it('每个额外列一条 96px；正文有 198px 下限，身份标签固定 250px', () => {
    const one = resultColumnsTemplate(['container.name'])
    expect(one.split(' ')).toEqual(['14px', '90px', '36px', 'minmax(198px,1fr)', '96px', '250px'])
    const two = resultColumnsTemplate(['a', 'b'])
    expect(two.split(' ').filter((track) => track === '96px')).toHaveLength(2)
    // 正文下限**必须**在：没有它，4 列时正文会被挤成 0 宽（真机复现过）
    expect(resultColumnsTemplate(['a', 'b', 'c', 'd'])).toContain('minmax(198px,1fr)')
  })

  it('模板列数与列集对齐：最多 4 列（与 columnToggle 的上限同一条）', () => {
    for (let count = 1; count <= RESULT_COLUMN_MAX; count += 1) {
      const columns = Array.from({ length: count }, (_, at) => 'f' + String(at))
      // 2（箭头/时间/级别/正文/标签里的固定 4 个 + 标签）+ 额外列
      expect(resultColumnsTemplate(columns).split(' ')).toHaveLength(count + 5)
    }
    const over = Array.from({ length: RESULT_COLUMN_MAX + 2 }, (_, at) => 'f' + String(at))
    expect(resultColumnsTemplate(over).split(' ')).toHaveLength(RESULT_COLUMN_MAX + 5)
  })
})

describe('级别配色（一眼扫过去先看哪行）', () => {
  it('error / fatal 红、warn 橙、info 次要、debug / trace / 无级别灰', () => {
    expect(levelTone('error')).toBe('error')
    expect(levelTone('fatal')).toBe('error')
    expect(levelTone('warn')).toBe('warn')
    expect(levelTone('info')).toBe('info')
    expect(levelTone('debug')).toBe('muted')
    expect(levelTone('trace')).toBe('muted')
    // 没有级别 = 不知道，**不许**染成告警色
    expect(levelTone(undefined)).toBe('muted')
    expect(levelTone('')).toBe('muted')
    expect(levelTone('bogus')).toBe('muted')
    // 大小写 / 空格不影响判据
    expect(levelTone(' ERROR ')).toBe('error')
  })
})

/*
 * 第二十二刀：字段面板的定位与开关（两个入口）。
 *
 * 这一格原来只有「真机量出来的一个数」当判据（右缘对齐 600），而定位的三条边界——夹在视口内、
 * 下面放不下时上翻、拿不到视口尺寸时不夹——全靠手点和肉眼看。定位提成纯函数之后，边界能一条条
 * 钉住；这也是「两个入口」必须复用的那份判据（筛选行那颗要左对齐，元信息那颗要右对齐）。
 */
describe('浮层定位：对齐哪条边、夹进视口、放不下就上翻（第二十二刀）', () => {
  /** 元信息行的「字段」按钮：整行右侧，60×28。 */
  const metaAnchor = { align: 'right', left: 840, right: 900, top: 272, bottom: 300 }
  /** 筛选行的「＋ 筛选」：同一行的左侧。 */
  const rowAnchor = { align: 'left', left: 100, right: 160, top: 400, bottom: 422 }

  it('拿不到锚点就不给位置（CSS 兜底，而不是算一个 NaN 出去）', () => {
    expect(panelPlacement(undefined, { width: 300, vw: 816 })).toBeUndefined()
    expect(panelPlacement(null, { width: 300, vw: 816 })).toBeUndefined()
  })

  it('拿不到视口尺寸时不做夹取、也不上翻：位置按按钮算，顶边贴下沿 +4', () => {
    // 无浏览器 / 测试桩的那条路（真机外的用例走的就是它）
    expect(panelPlacement(metaAnchor, { width: 300 })).toEqual({ left: 600, top: 304 })
    expect(panelPlacement({ align: 'left', left: 20, right: 80, top: 10, bottom: 30 }, { width: 300 }))
      .toEqual({ left: 20, top: 34 })
  })

  it('元信息那颗按钮在整行右侧：右缘对齐（左对齐会向左伸出去 300px）', () => {
    expect(panelPlacement(metaAnchor, { width: 300, vw: 1200 })).toEqual({ left: 600, top: 304 })
    expect(panelPlacement(metaAnchor, { width: 300, vw: 816 })).toEqual({ left: 508, top: 304 })
  })

  it('筛选行那颗在左侧：左缘对齐（右对齐会缩回最左边，离按钮很远）', () => {
    expect(panelPlacement(rowAnchor, { width: 300, vw: 1200 })).toEqual({ left: 100, top: 426 })
    // 窗口很窄时按钮贴到右边缘：宁可夹回视口内，也不许伸出去
    expect(panelPlacement({ align: 'left', left: 700, right: 780, top: 10, bottom: 32 }, { width: 300, vw: 816 }))
      .toEqual({ left: 508, top: 36 })
    // 窗口窄到连左边距都放不下面板：左缘仍然从边距起（不许是负数）
    expect(panelPlacement(rowAnchor, { width: 300, vw: 240 })).toEqual({ left: 8, top: 426 })
  })

  it('下面放得下**想要的高度**：照旧往下开，一个像素都不动（高度交给 CSS）', () => {
    expect(panelPlacement({ align: 'left', left: 100, right: 160, top: 100, bottom: 128 }, { width: 300, height: 200, vw: 1200, vh: 800 }))
      .toEqual({ left: 100, top: 132 })
  })

  it('下面放不下、上面放得下：**上翻**（面板底边停在按钮上沿之上）', () => {
    // 元信息行在结果表下方，真机上它常常已经在视口底部
    expect(panelPlacement({ align: 'left', left: 100, right: 160, top: 672, bottom: 700 }, { width: 300, height: 200, vw: 1200, vh: 800 }))
      .toEqual({ left: 100, top: 468 })
  })

  it('两边都放不下：挑宽的那一边、把高度收进那边——**不许**挪到屏幕中央盖住按钮', () => {
    // 真机 816×782 的常见情形：面板想要 520（70vh），上下各只剩 300 多。
    // 收的是高度（面板自己滚），位置仍然贴住按钮：这才是「能打开它的东西和它本身在同一处」。
    expect(panelPlacement(metaAnchor, { width: 300, height: 520, margin: 8, vw: 816, vh: 782 }))
      .toEqual({ left: 508, top: 304, maxHeight: 470 })
    // 上面更宽：翻到上方，且高度正好贴到按钮上沿（400 - 4 - 388 = 8）
    expect(panelPlacement({ align: 'left', left: 16, right: 90, top: 400, bottom: 422 }, { width: 300, height: 520, margin: 8, vw: 816, vh: 782 }))
      .toEqual({ left: 16, top: 8, maxHeight: 388 })
  })

  it('锚点缺字段也不抛：缺 bottom 从边距起，缺 right 贴左边距，缺 top 就只往下开', () => {
    expect(panelPlacement({ align: 'right' }, { width: 300, margin: 8 })).toEqual({ left: 8, top: 8 })
    expect(panelPlacement({ align: 'left' }, { width: 300, margin: 8 })).toEqual({ left: 8, top: 8 })
    // 缺 top = 上翻无从判断：往下开；下面那点空间放不下想要的高度就收进去
    expect(panelPlacement({ align: 'left', left: 10, right: 70, bottom: 780 }, { width: 300, height: 520, margin: 8, vw: 1200, vh: 800 }))
      .toEqual({ left: 10, top: 784, maxHeight: 8 })
    expect(panelPlacement({ align: 'left', left: 10, right: 70, bottom: 200 }, { width: 300, height: 520, margin: 8, vw: 1200, vh: 800 }))
      .toEqual({ left: 10, top: 204 })
  })

  it('位置一律取整：半像素的发丝线落在小数坐标上会糊', () => {
    // 没有 `align` 时按**右对齐**算（历史行为：这个面板一直是从右侧那颗按钮长出来的）
    const placed = panelPlacement({ align: 'left', left: 100.4, right: 160.6, top: 400.5, bottom: 422.6 }, { width: 300, vw: 1200 })
    expect(placed).toEqual({ left: 100, top: 427 })
    expect(panelPlacement({ left: 100.4, right: 160.6, top: 400.5, bottom: 422.6 }, { width: 300, vw: 1200 }).left).toBe(8)
  })

  it('面板高度上限与 CSS 的 `max-height:min(520px,70vh)` 同一口径', () => {
    expect(fieldPanelHeight(0)).toBe(FIELD_PANEL_CEILING)
    expect(fieldPanelHeight(Number.NaN)).toBe(FIELD_PANEL_CEILING)
    // 782 是这台机器上真机验收用的视口高：70vh = 547 > 520，上限仍是 520
    expect(fieldPanelHeight(782)).toBe(520)
    // 矮窗口才轮到 70vh 生效
    expect(fieldPanelHeight(600)).toBe(420)
  })
})

/*
 * 第二十三刀：面板宽度与名字的断行点。
 *
 * 两件事都不大，但都有真机读数在后面：① 面板宽度同时决定 CSS 画多宽、以及「右缘对齐」算出的左缘
 * ——两处各写一个数就会漂；② 长末段（`com_docker_compose_config-hash`）原来被浏览器按
 * `overflow-wrap:anywhere` 从词中间切开，读起来像两个残词。
 */
describe('字段名断行点：只在分隔符之后断（第二十三刀）', () => {
  it('下划线 / 连字符 / 点都是断点，且**分隔符留在前一段**', () => {
    expect(fieldNameBreaks('com_docker_compose_config-hash'))
      .toEqual(['com_', 'docker_', 'compose_', 'config-', 'hash'])
    expect(fieldNameBreaks('log.level')).toEqual(['log.', 'level'])
    expect(fieldNameBreaks('stream')).toEqual(['stream'])
  })

  it('拼回去**逐字**等于入参：显示的名字不许与真实字段名差一个字符', () => {
    for (const name of [
      'com_docker_compose_config-hash',
      'com_docker_compose_project_environment_file',
      'log.level',
      'a__b',
      'ends_with_',
      '_starts',
      'host.os.version',
      'x',
      '',
      '中文也能断_吗',
    ]) {
      expect(fieldNameBreaks(name).join('')).toBe(name)
    }
  })

  it('不出空段、不丢尾部：连续分隔符与结尾分隔符都不生出一个空串', () => {
    // 连续分隔符算一处断点（`a__b` → `a__` / `b`），结尾的分隔符跟着最后一段走
    expect(fieldNameBreaks('a__b')).toEqual(['a__', 'b'])
    expect(fieldNameBreaks('ends_with_')).toEqual(['ends_', 'with_'])
    expect(fieldNameBreaks('_starts')).toEqual(['_', 'starts'])
    expect(fieldNameBreaks('')).toEqual([])
    expect(fieldNameBreaks(undefined)).toEqual([])
    expect(fieldNameBreaks(null)).toEqual([])
  })

  it('长末段确实被切成多段（这就是给浏览器的断点）', () => {
    const leaf = 'com_docker_compose_project_environment_file'
    expect(fieldNameBreaks(leaf).length).toBeGreaterThan(4)
    // 最长的一段要短到能在名字列里放下（真机名字列 ~200px、11px 等宽 ≈ 30 个字符）
    const longest = Math.max(...fieldNameBreaks(leaf).map((part) => part.length))
    expect(longest).toBeLessThanOrEqual(30)
  })

  it('面板宽度是**一个**常量：CSS 与「右缘对齐」都读它（漂了面板就不贴按钮了）', () => {
    expect(FIELD_PANEL_WIDTH).toBe(340)
    // 真机 816 宽的视口里，340 的面板右缘对齐左侧按钮时仍然整块放得下
    const placed = panelPlacement({ align: 'right', right: 900, top: 272, bottom: 300 }, { width: FIELD_PANEL_WIDTH, vw: 1200, vh: 782 })
    expect(placed.left).toBe(900 - FIELD_PANEL_WIDTH)
  })
})

/*
 * 第二十四刀：字段的 top 值（点字段 → 看值 → 点值直接筛）。
 *
 * 这一格要守的是**「值」与「行」是同一个子集**：请求体与榜共用同一个信封（窗口 / 查询串 / 筛选），
 * 少带一样就会给出「上一次条件下的一组值」——那比不展开更坏，因为它看起来是这一次的。
 */
describe('字段 top 值：请求体、缓存键、画出来的行（第二十四刀）', () => {
  const outcome = {
    ok: true,
    target: { id: 'es', kind: 'elasticsearch', label: '内网 ES' },
    window: { from: 1_700_000_000_000, to: 1_700_000_600_000 },
    counts: { returned: 0, totalKnown: false },
    truncation: { truncated: false, reasons: [] },
    lines: [],
    warnings: [],
  }

  it('请求体与「榜」同一个信封：只多一个 size', () => {
    const draft = { ...emptyQuery(), target: 'es', q: 'level:error' }
    expect(fieldValuesPayload(draft, outcome, 'container.name')).toEqual({
      target: 'es',
      q: 'level:error',
      from: 1_700_000_000_000,
      to: 1_700_000_600_000,
      by: 'container.name',
      size: FIELD_VALUES_SIZE,
    })
  })

  it('筛选也要带上（不然值的计数是整窗口的、行却是筛过的）', () => {
    const draft = { ...emptyQuery(), target: 'es', filters: [{ field: 'host.name', value: 'node-1' }] }
    expect(fieldValuesPayload(draft, outcome, 'container.name')?.filters).toEqual({ 'host.name': 'node-1' })
  })

  it('拿不到窗口就不发（返回 null），空字段名也不发', () => {
    expect(fieldValuesPayload({ ...emptyQuery(), q: '' }, undefined, 'a')).toBeNull()
    expect(fieldValuesPayload({ ...emptyQuery() }, { ...outcome, window: undefined }, 'a')).toBeNull()
    expect(fieldValuesPayload({ ...emptyQuery() }, outcome, '   ')).toBeNull()
    expect(fieldValuesKey({ ...emptyQuery() }, outcome, '  ')).toBeNull()
  })

  it('缓存键带上**全部**条件：改任何一样都得重新问', () => {
    const base = { ...emptyQuery(), target: 'es' }
    const key = fieldValuesKey(base, outcome, 'container.name')
    expect(key).not.toBeNull()
    expect(fieldValuesKey({ ...base, q: 'x' }, outcome, 'container.name')).not.toBe(key)
    expect(fieldValuesKey({ ...base, filters: [{ field: 'a', value: 'b' }] }, outcome, 'container.name')).not.toBe(key)
    expect(fieldValuesKey(base, outcome, 'container.id')).not.toBe(key)
    expect(fieldValuesKey(base, { ...outcome, window: { from: 0, to: 1 } }, 'container.name')).not.toBe(key)
    // 同一份条件：键稳定（否则缓存永远不命中，等于没缓存）
    expect(fieldValuesKey(base, outcome, 'container.name')).toBe(key)
  })

  it('筛选的顺序不影响键（同一份条件只有一种答案）', () => {
    const a = { ...emptyQuery(), target: 'es', filters: [{ field: 'a', value: '1' }, { field: 'b', value: '2' }] }
    const b = { ...emptyQuery(), target: 'es', filters: [{ field: 'b', value: '2' }, { field: 'a', value: '1' }] }
    expect(fieldValuesKey(a, outcome, 'x')).toBe(fieldValuesKey(b, outcome, 'x'))
  })

  it('画出来的行：按本格条数截断，但在场的那几条仍是**整批**的比例', () => {
    const buckets = [
      { key: 'a', count: 100 },
      { key: 'b', count: 50 },
      { key: 'c', count: 10 },
    ]
    const two = valueBars(buckets, 2)
    expect(two.rows.map((row) => row.key)).toEqual(['a', 'b'])
    expect(two.truncated).toBe(true)
    // 截断只影响「画几行」，不该让头条忽然变成满格（它本来就是最大的，这条是恒等）
    expect(two.rows[1].ratio).toBeCloseTo(0.5)
    expect(two.max).toBe(100)
  })

  it('空值行标出来（它不能点：筛选表达不了「字段缺失」）', () => {
    const bars = valueBars([{ key: '', count: 3 }, { key: 'a', count: 1 }], 8)
    expect(bars.rows[0].blank).toBe(true)
    expect(bars.rows[1].blank).toBe(false)
    expect(bars.truncated).toBe(false)
  })

  it('形状不对的桶跳过（不造 0 计数的假行）', () => {
    expect(valueBars([{ key: 'a', count: 1 }, null, { key: 'b' }, { count: 9 }, { key: 3, count: 2 }], 8).rows.map((row) => row.key))
      .toEqual(['a'])
  })
})

/*
 * 第三十一刀：值下拉**摘掉本字段自己的筛选**。
 *
 * 不摘的话聚合只在「字段 = 当前值」里算，答案永远只有它自己——换值换不动，而且画面看起来
 * 像「这个字段只有一个值」。Kibana 的做法也是把本字段的 filter 从自己的候选请求里摘出去。
 */
describe('值下拉摘掉本字段自己的筛选（第三十一刀）', () => {
  const outcome = { target: { id: 'es' }, window: { from: 0, to: 900_000 } }
  const draft = {
    ...emptyQuery(),
    target: 'es',
    filters: [{ field: 'container.name', value: 'grafana' }, { field: 'host.name', value: 'node-1' }],
  }

  it('本字段那条被摘掉，**别的**字段照旧下发（值仍要是这一屏的子集）', () => {
    const payload = fieldValuesPayload(draft, outcome, 'container.name')
    expect(payload?.filters).toEqual({ 'host.name': 'node-1' })
    expect(payload?.by).toBe('container.name')
  })

  it('看**别的**字段的值时，全部筛选都在（含 container.name 那条）', () => {
    const payload = fieldValuesPayload(draft, outcome, 'container.id')
    expect(payload?.filters).toEqual({ 'container.name': 'grafana', 'host.name': 'node-1' })
  })

  it('只有本字段那一条时，摘完就没有 filters 键了（不发空对象）', () => {
    const onlySelf = { ...draft, filters: [{ field: 'container.name', value: 'grafana' }] }
    const payload = fieldValuesPayload(onlySelf, outcome, 'container.name')
    expect(payload?.filters).toBeUndefined()
    expect('filters' in (payload ?? {})).toBe(false)
  })

  it('摘掉之后缓存键与「本来就没筛这个字段」时**相同**（同一份条件只有一种答案）', () => {
    const onlySelf = { ...draft, filters: [{ field: 'container.name', value: 'grafana' }] }
    const none = { ...draft, filters: [] }
    expect(fieldValuesKey(onlySelf, outcome, 'container.name')).toBe(fieldValuesKey(none, outcome, 'container.name'))
  })

  it('换值也有各自的键（grafana 与 prometheus 不是同一份条件）', () => {
    const a = { ...draft, filters: [{ field: 'container.name', value: 'grafana' }] }
    const b = { ...draft, filters: [{ field: 'container.name', value: 'prometheus' }] }
    // 摘掉之后两者都只剩「空 filters」，所以键相同——这正是缓存的意图：
    // 候选列表与「当前筛的是哪个值」无关，换值不必重新问后端
    expect(fieldValuesKey(a, outcome, 'container.name')).toBe(fieldValuesKey(b, outcome, 'container.name'))
  })
})

/*
 * 第三十刀：筛选行 = 两格输入框（左边字段、右边值）。
 *
 * 四个判据各自都能独立坏掉，所以分开钉：
 *   - 候选里**没有空值那一档**（筛不了「字段缺失」）；
 *   - 正在筛的那个值**有标记**（点一下是取消）；
 *   - 顺序**保持后端给的**（不按计数重排）；
 *   - 字段候选**这一页命中优先**，且收窄规则与侧栏过滤框**同一条**（多词 AND）。
 */
describe('筛选框候选：值那一格（第三十刀）', () => {
  it('空白值不进来：筛选只能表达「字段 = 某值」', () => {
    const rows = valueChoices('container.name', [
      { key: 'grafana', count: 42 },
      { key: '', count: 2 },
      { key: '   ', count: 1 },
      { key: 'prometheus', count: 8 },
    ], undefined, 8)
    expect(rows.map((row) => row.value)).toEqual(['grafana', 'prometheus'])
  })

  it('正在筛的那个值打上 active（它还在候选里：再点是取消）', () => {
    const rows = valueChoices('container.name', [{ key: 'grafana', count: 42 }, { key: 'prometheus', count: 8 }], 'grafana', 8)
    expect(rows.map((row) => row.active)).toEqual([true, false])
  })

  it('保持后端给的顺序（按计数排序是后端的结论，不再排一次）', () => {
    const rows = valueChoices('f', [{ key: 'b', count: 1 }, { key: 'a', count: 99 }], undefined, 8)
    expect(rows.map((row) => row.value)).toEqual(['b', 'a'])
  })

  it('按条数截断；字段名为空回空表', () => {
    const rows = valueChoices('f', [{ key: 'a', count: 3 }, { key: 'b', count: 2 }, { key: 'c', count: 1 }], undefined, 2)
    expect(rows.map((row) => row.value)).toEqual(['a', 'b'])
    expect(valueChoices('  ', [{ key: 'a', count: 1 }], undefined, 8)).toEqual([])
  })

  it('形状不对的桶跳过（不造 0 计数的假行）', () => {
    const rows = valueChoices('f', [{ key: 'a', count: 1 }, null, { key: 'b' }, { count: 9 }, { key: 3, count: 2 }], undefined, 8)
    expect(rows.map((row) => row.value)).toEqual(['a'])
  })
})

describe('筛选框候选：字段那一格（第三十刀）', () => {
  const sections = {
    hit: [{ name: 'container.name' }],
    rest: [{ name: 'service.name' }, { name: 'host.name' }],
    conflict: [{ name: 'mixed.type' }],
  }

  it('这一页命中的排在前面，其余按分区顺序跟上', () => {
    expect(filterFieldChoices(sections, '').map((row) => row.name))
      .toEqual(['container.name', 'service.name', 'host.name', 'mixed.type'])
    expect(filterFieldChoices(sections, '')[0].group).toBe('hit')
  })

  it('收窄规则与侧栏过滤框**同一条**：多词 AND、不分大小写、不分先后', () => {
    // 单看子串 `cont name` 是 0 个——所以这条钉的是「两处用的是同一个判据」
    expect(filterFieldChoices(sections, 'cont name').map((row) => row.name)).toEqual(['container.name'])
    expect(filterFieldChoices(sections, 'NAME cont').map((row) => row.name)).toEqual(['container.name'])
    expect(filterFieldChoices(sections, 'HOST').map((row) => row.name)).toEqual(['host.name'])
    expect(filterFieldChoices(sections, 'nomatch')).toEqual([])
  })
})

describe('Backspace 在两格之间退（第三十刀）', () => {
  it('值格有字 → 删字；值格空了 → 退回字段格；两格都空 → 什么都不做', () => {
    expect(filterBoxBack('container.name', 'graf')).toBe('value')
    expect(filterBoxBack('container.name', '')).toBe('field')
    expect(filterBoxBack('', '')).toBe('none')
    // 字段没选但值里有字：仍是删字（值优先——打错一个字母不该把整条条件清掉）
    expect(filterBoxBack('', 'abc')).toBe('value')
  })
})

describe('候选里「当前那一行」的落点（第三十刀）', () => {
  /*
   * 与 `pickMove` 的差别是判据不是风格：分组框的输入框里**只有**候选那条路（打进的字就是结论），
   * 所以永远有一行被选中；筛选框的值那一格允许打任何东西（长尾值 / 带空格 / 通配），
   * 「没选中任何候选」（−1）是一个正常状态——回车取的是用户打的字。
   */
  it('能从「没选中」（−1）往下走到第一行，也能退回来', () => {
    expect(choiceMove(-1, 1, 3)).toBe(0)
    expect(choiceMove(0, -1, 3)).toBe(-1)
  })

  it('到头就停（不绕回：绕回会让「按了一下」看起来像跳过了几行）', () => {
    expect(choiceMove(-1, -1, 3)).toBe(-1)
    expect(choiceMove(2, 1, 3)).toBe(2)
    expect(choiceMove(0, -5, 3)).toBe(-1)
  })

  it('空列表停在 −1（那种情况下界面不画下拉，也就无所谓哪一行）', () => {
    expect(choiceMove(0, 1, 0)).toBe(-1)
    expect(choiceMove(2, 1, 0)).toBe(-1)
  })
})

/*
 * 第二十六刀：选列面板的「列」按钮换成勾选。
 *
 * `columnPickState` 单独一条判据（而不是在渲染里现算）：它决定**画成什么样**，
 * 而 `columnToggle` 决定「改完之后是什么」。合成一个就得在渲染时先算一遍结果、再假装没算。
 */
describe('勾选态：已选永远可点，满员只挡未选（第二十六刀）', () => {
  it('空列集：都能选', () => {
    expect(columnPickState([], 'a')).toBe('ok')
  })

  it('已选的永远可点——满员也不行（否则满员之后一个都去不掉）', () => {
    expect(columnPickState(['a'], 'a')).toBe('picked')
    const full = ['a', 'b', 'c', 'd']
    expect(columnPickState(full, 'a')).toBe('picked')
    expect(columnPickState(full, 'd')).toBe('picked')
  })

  it('满员时**未选**的才是 limit', () => {
    const full = Array.from({ length: RESULT_COLUMN_MAX }, (_, at) => 'f' + String(at))
    expect(columnPickState(full, 'other')).toBe('limit')
    // 差一个才满：仍可选
    expect(columnPickState(full.slice(0, -1), 'other')).toBe('ok')
  })

  it('空字段名是 bad（不画一个点了会下发的勾选框）', () => {
    expect(columnPickState([], '')).toBe('bad')
    expect(columnPickState(['a'], undefined)).toBe('bad')
    expect(columnPickState(undefined, 'a')).toBe('ok')
  })
})
