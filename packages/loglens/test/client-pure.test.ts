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
  kindOptions,
  queryPayload,
  queryProblem,
  windowOptions,
  windowRange,
  dockerFlagOf,
  dockerLogLines,
  dockerProblem,
  dockerSince,
} from '../client-src/pure.js'

describe('draft 形状', () => {
  it('kindOptions 是副本：改动不会污染模块内部', () => {
    const options = kindOptions()
    options.push('splunk')
    expect(kindOptions()).toEqual(['loki', 'elasticsearch', 'opensearch', 'docker'])
  })

  it('emptyDraft 是「还没落盘」的新行', () => {
    expect(emptyDraft()).toEqual({ id: '', kind: 'loki', label: '', url: '', dockerTarget: '' })
  })

  it('draftFromTarget 缺字段补空串、未知类型回落 loki', () => {
    expect(draftFromTarget(undefined)).toEqual({ id: '', kind: 'loki', label: '', url: '', dockerTarget: '' })
    expect(draftFromTarget({ id: 'es', kind: 'elasticsearch', label: 'ES', url: 'http://127.0.0.1:9200' }))
      .toEqual({ id: 'es', kind: 'elasticsearch', label: 'ES', url: 'http://127.0.0.1:9200', dockerTarget: '' })
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
