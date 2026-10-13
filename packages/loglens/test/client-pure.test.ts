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
  windowOptions,
  windowRange,
  dockerFlagOf,
  dockerLogLines,
  dockerProblem,
  dockerLogTextOf,
  dockerSince,
  dockerTargetChoices,
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

  it('新草稿是「最近 1 小时 / 100 条」', () => {
    expect(emptyQuery()).toEqual({ target: '', q: '', preset: '1h', limit: 100 })
  })

  it('必填项：多来源时必须选一个；条数必须是正整数', () => {
    expect(queryProblem({ target: 'a', limit: 10 }, 3)).toBe('')
    expect(queryProblem({ target: '', limit: 10 }, 3)).toBe('needTarget')
    expect(queryProblem({ target: '', limit: 10 }, 1)).toBe('')      // 只有一个来源时回落
    expect(queryProblem({ target: 'a', limit: 0 }, 1)).toBe('badLimit')
    expect(queryProblem({ target: 'a', limit: 1.5 }, 1)).toBe('badLimit')
    expect(queryProblem({ target: 'a', limit: 'many' }, 1)).toBe('badLimit')
  })

  it('载荷：只有一个来源时补上它的 id；查询串原样传（不 trim 掉用户想查的空格语义）', () => {
    const targets = [{ id: 'loki' }]
    const payload = queryPayload({ target: '', q: ' level:error ', preset: '15m', limit: 20 }, targets, 1000)
    expect(payload).toEqual({ target: 'loki', q: ' level:error ', from: 1000 - 15 * 60 * 1000, to: 1000, limit: 20 })
    const chosen = queryPayload({ target: ' es ', q: '', preset: '1h', limit: 20 }, targets, 1000)
    expect(chosen.target).toBe('es')
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
