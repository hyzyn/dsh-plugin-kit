/**
 * @hyzyn/dsh-loglens — 客户端纯逻辑的用例（构建型包：源在 client-src/，产物是 client.js）。
 */
import { describe, expect, it } from 'vitest'
import {
  appendLines,
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
  histogramInterval,
  histogramPayload,
  kindOptions,
  queryPayload,
  queryProblem,
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
  lineTitle,
  ROW_LABEL_MAX,
  ROW_LABEL_VALUE_MAX,
  rowFilterProblem,
  rowLabelOverflow,
  rowLabels,
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
