/**
 * @hyzyn/dsh-loglens — 能力自述与实现的对账（守卫）。
 *
 * `capabilities()` 不是内部注释，它是**给调用方看的自述**——而且这一位会被 `loglens_sources`
 * 原样回给 agent。所以「声明 follow / aggregations = true，却没有那根接线」是**谎话**，不是待办：
 * 调用方会照着它去挂一个永远报错的入口。Loki 的 `follow` 就这样撒过一次谎（`stream()` 还没写的
 * 时候声明了 true，2026-10-12 才改正）。
 *
 * 锁两件事：注册表里**每个**适配器都过对账，以及**对账本身真的会报**（喂假后端当反例，
 * 免得守卫退化成永远绿——「永远绿的守卫」正是这条谎话当初活下来的原因）。
 */
import { describe, expect, it } from 'vitest'
import { ALL_BACKENDS, backendFor, capabilityGaps } from '../src/backends/registry.js'
import type { BackendCaps, LogBackend, LogQueryResult } from '../src/backends/types.js'
import type { SourceKind } from '../src/config.js'

/** 基准自述：各项都取「不声明额外能力」的那一档，用例只覆盖要点。 */
const BASE_CAPS: BackendCaps = {
  queryLanguage: 'logql',
  follow: false,
  aggregations: false,
  requiresTimeRange: true,
  fields: 'discovered',
  pagination: 'none',
  maxPageSize: 100,
  maxWindowMs: 60 * 60 * 1000,
}

const EMPTY_RESULT: LogQueryResult = {
  lines: [],
  counts: { returned: 0, totalKnown: false },
  truncation: { truncated: false, reasons: [] },
}

/**
 * 造一个**只声明、不一定实现**的适配器：`caps` 是它的自述，`methods` 是它真有哪几根接线。
 * 两者故意不联动——「不一致」正是被测的东西。
 */
function backend(id: string, caps: Partial<BackendCaps>, methods: Partial<LogBackend> = {}): LogBackend {
  return {
    id,
    capabilities: () => ({ ...BASE_CAPS, ...caps }),
    fields: async () => ({ fields: [], total: 0, truncated: false }),
    query: async () => EMPTY_RESULT,
    health: async () => ({ ok: true }),
    ...methods,
  }
}

/** 注册表里 kind → 适配器的那三档（Docker 刻意不进注册表，见 registry.ts 文件头）。 */
const REGISTERED_KINDS: SourceKind[] = ['loki', 'elasticsearch', 'opensearch']

describe('能力自述 ↔ 实现对账：注册表', () => {
  it('每个适配器都过对账（有 gap 就点名是谁、哪一位、缺什么）', () => {
    const gaps = ALL_BACKENDS.flatMap((item) => capabilityGaps(item))
    expect(gaps).toEqual([])
  })

  it('自述为真的能力，方法真的在（正面：逐个适配器单独断言，失败时能一眼看出是谁）', () => {
    for (const item of ALL_BACKENDS) {
      const caps = item.capabilities()
      if (caps.follow) expect(typeof item.stream, item.id).toBe('function')
      if (caps.aggregations) expect(typeof item.facets, item.id).toBe('function')
    }
  })

  it('Loki 现在**不**声明跟随（stream() 未实现）——这一条钉住那处已改正的谎话', () => {
    const loki = backendFor('loki')
    expect(loki).toBeDefined()
    expect(loki!.capabilities().follow).toBe(false)
    expect(loki!.stream).toBeUndefined()
  })

  it('ALL_BACKENDS 与 backendFor 的分支是同一份事实（新增适配器漏登记就会被抓到）', () => {
    // kind → 适配器 这一侧：每个 kind 取回来的那一个必须在 ALL_BACKENDS 里。
    for (const kind of REGISTERED_KINDS) {
      const item = backendFor(kind)
      expect(item, kind).toBeDefined()
      expect(ALL_BACKENDS, kind).toContain(item)
    }
    // 反方向：ALL_BACKENDS 里没有「谁都取不到」的孤儿（id 与 kind 同名是注册表的现行约定）。
    for (const item of ALL_BACKENDS) {
      expect(REGISTERED_KINDS, item.id).toContain(item.id as SourceKind)
      expect(backendFor(item.id as SourceKind)).toBe(item)
    }
    // 条数对得上：数量对不上说明有一侧多写了（漏登记或多登记）。
    expect(ALL_BACKENDS).toHaveLength(REGISTERED_KINDS.length)
  })
})

describe('对账本身真的会报（反例）', () => {
  it('声明 follow，却没有 stream() → 报一条，并点名缺的是 stream()', () => {
    expect(capabilityGaps(backend('fake', { follow: true }))).toEqual([
      { backend: 'fake', declared: 'follow', missing: 'stream()' },
    ])
  })

  it('声明 aggregations，却没有 facets() → 报一条', () => {
    expect(capabilityGaps(backend('fake', { aggregations: true }))).toEqual([
      { backend: 'fake', declared: 'aggregations', missing: 'facets()' },
    ])
  })

  it('两条都声明、两条都没有 → **两条都报**（不是只报第一条）', () => {
    expect(capabilityGaps(backend('fake', { follow: true, aggregations: true }))).toEqual([
      { backend: 'fake', declared: 'follow', missing: 'stream()' },
      { backend: 'fake', declared: 'aggregations', missing: 'facets()' },
    ])
  })

  it('对照组：声明 false 而方法真的没有 → **不报**（判据是「声明与实现一不一致」，不是「有没有方法」）', () => {
    expect(capabilityGaps(backend('fake', { follow: false, aggregations: false }))).toEqual([])
  })

  it('对照组：声明 true 且方法在场 → 不报', () => {
    const item = backend('fake', { follow: true, aggregations: true }, {
      stream: async () => () => {},
      facets: async () => ({ buckets: [] }),
    })
    expect(capabilityGaps(item)).toEqual([])
  })

  it('对照组：**方法在场但没声明** → 也不报（实现多于自述不是谎话，另外两条同向的能力各自管）', () => {
    const item = backend('fake', { follow: false, aggregations: false }, {
      stream: async () => () => {},
      facets: async () => ({ buckets: [] }),
    })
    expect(capabilityGaps(item)).toEqual([])
  })
})
