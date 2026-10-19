/**
 * @hyzyn/dsh-loglens — facets 对「空壳字段」给信号（loglens D07）。
 *
 * 症状（维护者真机试用）：按 `log.level` 分组得到 0 桶 0 条，界面上没有任何解释；调用方只能靠
 * 「loglens_search 的行首带不带 `?`」反推级别是从正文推断的、log.level 整列为空——白烧一轮试错。
 *
 * 0 桶有两种成因，**处置完全相反**：
 *   - 窗口里有日志、但这个字段一条有值的都没有（空壳）→ 换字段 / 承认级别得从正文推断；
 *   - 窗口里压根没日志 → 放大时间窗 / 放宽 filters。
 * 唯一判据是「窗口内命中数」（适配器的 `FacetsResult.totalHits`，ES 侧靠 `track_total_hits`）。
 * 这个用例锁五件事：两种措辞各自说清判据、**有桶时一句都不多说**（防噪声）、
 * 判据字段**绝不进返回值**（facets 的输出 schema 是 additionalProperties: false，多一个键就是崩溃）、
 * 拿不到判据时不冒充原因，以及**判据的边界**——`totalHits > 0` 只证明窗口里有日志，
 * 证明不了「这个字段有值」（字段名拼错同样是 0 桶），所以那种情形必须两种可能都摆出来（F8）。
 */
import { describe, expect, it } from 'vitest'
import type { BackendCaps, FacetsResult, LogBackend } from '../src/backends/types.js'
import type { LoglensConfig, SourceKind } from '../src/config.js'
import { runFacets } from '../src/execute.js'

const FROM = 1_700_000_000_000
const TO = FROM + 60_000

const CAPS: BackendCaps = {
  queryLanguage: 'lucene',
  follow: false,
  aggregations: true,
  requiresTimeRange: true,
  fields: 'indexed',
  pagination: 'cursor',
  maxPageSize: 500,
  maxWindowMs: 24 * 60 * 60 * 1000,
}

const TARGET = { id: 'es', kind: 'elasticsearch' as const, label: '假 ES', url: 'http://127.0.0.1:9200/logs-*' }

function configWith(target: typeof TARGET): LoglensConfig {
  return { enabled: true, targets: [target] }
}

/** 假后端：facets 的返回值由用例给定（`spec` 收下来，用来断言执行层有没有把 by 传下去）。 */
function fakeBackend(result: FacetsResult): { backend: LogBackend, specs: Array<Record<string, unknown>> } {
  const specs: Array<Record<string, unknown>> = []
  const backend: LogBackend = {
    id: 'fake',
    capabilities: () => CAPS,
    fields: async () => ({ fields: [], total: 0, truncated: false }),
    query: async () => ({ lines: [], counts: { returned: 0, totalKnown: false }, truncation: { truncated: false, reasons: [] } }),
    facets: async (_query, _target, spec) => {
      specs.push({ ...spec })
      return result
    },
    health: async () => ({ ok: true }),
  }
  return { backend, specs }
}

async function facetsOf(result: FacetsResult, input: Record<string, unknown> = {}): Promise<{
  value: Record<string, unknown>
  warnings: string[]
  specs: Array<Record<string, unknown>>
}> {
  const { backend, specs } = fakeBackend(result)
  const backendFor = (_kind: SourceKind): LogBackend | undefined => backend
  const value = await runFacets({ config: () => configWith(TARGET), backendFor }, { by: 'log.level', from: FROM, to: TO, ...input }) as unknown as Record<string, unknown>
  return { value, warnings: value.warnings as string[], specs }
}

describe('facets 的 0 桶：把判据说出来，别让调用方猜', () => {
  it('窗口里有日志 + 0 桶：点明判据，并给出「字段空壳 / 级别来自正文」这条主路', async () => {
    const { value, warnings } = await facetsOf({
      buckets: [],
      totalHits: { value: 26264, relation: 'eq', basis: 'exact' },
    })
    expect(value.buckets).toEqual([])
    const text = warnings.join('\n')
    expect(text).toContain('26264 条日志')          // 判据本身要摆出来
    expect(text).toContain('log.level')
    expect(text).toContain('空壳')
    expect(text).toContain('一条有值的都没有')
    expect(text).toContain('正文')                  // 级别其实长在正文里
    expect(text).toContain('?')                     // loglens_search 那个推断标记（形如 error?）
    expect(text).toContain('loglens_fields')
    expect(text).not.toContain('下界')              // 精确值就不该带「下界」那半句
    expect(text).not.toContain('没有任何命中')      // 没说成「窗口里没日志」
  })

  /*
   * F8（第二轮对抗复核证伪）：`totalHits > 0` 只证明「窗口里有日志」，**证明不了这个字段有值**——
   * 字段名拼错 / 索引里没这个字段，同样一个桶都没有。而 runFacets 从没拿 by 跟字段清单对过，
   * 所以它没资格在两种成因里挑一个说。这条用例把「拼错」这个输入钉住。
   */
  it('F8：by 拼错（字段名可能压根不存在）时**不许只断言空壳**——两种可能都要摆出来', async () => {
    const { warnings } = await facetsOf(
      { buckets: [], totalHits: { value: 5, relation: 'eq', basis: 'exact' } },
      { by: 'log.levl' },   // 少一个 e：索引里很可能没有这个字段
    )
    const text = warnings.join('\n')
    expect(text).toContain('5 条日志')              // 判据照旧要说出来
    expect(text).toContain('log.levl')              // 说的是调用方给的那个字段
    // 两种可能都在：字段名不存在（拼错）与字段存在但没值（空壳）
    expect(text).toContain('要么')
    expect(text).toContain('不存在')
    expect(text).toContain('拼错')
    expect(text).toContain('一条有值的都没有')
    expect(text).toContain('空壳')
    // 承认「这次没校验过」——不许把没验过的事说成结论
    expect(text).toContain('没校验过')
    expect(text).toContain('都排除不掉')
    // 两条**调用方能自己验**的下一步：一条验拼写，一条验值是不是长在正文里
    expect(text).toContain('loglens_fields')
    expect(text).toContain('loglens_search')
  })

  it('所有桶都是 0 条时与「一个桶都没有」同判（判定看桶里的条数，不看桶在不在）', async () => {
    const { warnings } = await facetsOf({
      buckets: [{ key: 'error', count: 0 }, { key: 'info', count: 0 }],
      totalHits: { value: 5, relation: 'eq', basis: 'exact' },
    })
    expect(warnings.join('\n')).toContain('空壳')
  })

  it('窗口里压根没命中：明说**不是字段的问题**，把下一步指向时间窗与查询串', async () => {
    const { value, warnings } = await facetsOf({
      buckets: [],
      totalHits: { value: 0, relation: 'eq', basis: 'exact' },
    })
    expect(value.buckets).toEqual([])
    const text = warnings.join('\n')
    expect(text).toContain('0 条')                  // 判据
    expect(text).toContain('没有任何命中')
    expect(text).toContain('不是这个字段的问题')
    expect(text).toContain('时间窗')
    expect(text).toContain('filters')
    expect(text).not.toContain('空壳')              // 没把窗口没日志说成字段空壳
  })

  it('relation 是下界时如实标出来（>0 已足够证明窗口里有日志，但不谎报成精确值）', async () => {
    const { warnings } = await facetsOf({
      buckets: [],
      totalHits: { value: 10_000, relation: 'gte', basis: 'lower_bound' },
    })
    const text = warnings.join('\n')
    expect(text).toContain('下界')
    expect(text).toContain('空壳')
  })

  it('适配器拿不到判据时不冒充原因：给一句可自验的指路，不指认字段也不指认窗口', async () => {
    const { warnings } = await facetsOf({ buckets: [] })
    const text = warnings.join('\n')
    expect(text).toContain('没能拿到')
    expect(text).toContain('loglens_search')
    expect(text).toContain('loglens_fields')        // 同一类诚实口径：两条自验路都留着
    expect(text).toContain('字段名压根不存在')
    expect(text).not.toContain('空壳')
    expect(text).not.toContain('不是这个字段的问题')
  })

  it('有桶时**一句都不多说**（聚合自己已经说清楚了）', async () => {
    const { value, warnings, specs } = await facetsOf({
      buckets: [{ key: 'api', count: 2 }],
      totalHits: { value: 2, relation: 'eq', basis: 'exact' },
    })
    expect(value.buckets).toEqual([{ key: 'api', count: 2 }])
    expect(warnings).toEqual([])
    expect(specs).toEqual([{ by: 'log.level', size: 10 }])   // by 原样传下去（判据靠它才存在）
  })

  it('只按时间分桶（没给 by）时不谈字段：没有字段可谈', async () => {
    const { warnings } = await facetsOf({ overTime: [], totalHits: { value: 0, relation: 'eq', basis: 'exact' } }, { by: undefined, interval: '5m' })
    expect(warnings).toEqual([])
  })
})

describe('判据字段绝不进返回值（输出 schema 是 additionalProperties: false）', () => {
  it('totalHits 只做内部判读：它换成 warnings 的措辞，不出现在结果的键里', async () => {
    const { value } = await facetsOf({
      buckets: [],
      totalHits: { value: 12, relation: 'eq', basis: 'exact' },
    })
    expect(Object.keys(value).sort()).toEqual(['buckets', 'by', 'target', 'warnings', 'window'])
    expect('totalHits' in value).toBe(false)
    expect(JSON.stringify(value)).not.toContain('totalHits')
    expect(JSON.stringify(value)).not.toContain('lower_bound')
  })
})
