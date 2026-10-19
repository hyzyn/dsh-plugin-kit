/**
 * @hyzyn/dsh-loglens — Elasticsearch / OpenSearch 适配器的 wire 级用例（P4）。
 *
 * 假 ES 是一个真的 node:http 服务：适配器走真 fetch、真请求体、真响应体。锁四件事：
 *   1. **请求长什么样**：PIT 怎么开（索引表达式走地址路径）、`_search` 为什么不带索引路径
 *      （带 PIT 时两者互斥）、range 用 ISO、sort 两个键、`track_total_hits` 显式打开；
 *   2. **映射**：文档 → LogLine（时间解析不出来的行跳过、labels 有上限、id 取 `_id`）；
 *   3. **游标**：满页给 `nextCursor`（PIT + search_after）、续页复用同一个 PIT、最后一次关 PIT；
 *   4. **过期**：PIT 没了时报 `cursor_expired` 而**不偷偷重开**（重开会换掉快照语义）。
 */
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ES_DEFAULT_INDEX,
  HIGHLIGHT_POST,
  HIGHLIGHT_PRE,
  createElasticBackend,
  highlightRanges,
  lineFromHit,
  looksLikeExpiredCursor,
  shardFailureReasons,
  targetAccess,
  targetIndex,
} from '../src/backends/elastic.js'
import type { LogBackend } from '../src/backends/types.js'
import type { LoglensTarget } from '../src/config.js'
import { decodeSearchAfterCursor } from '../src/cursor.js'
import { normalizeQuery } from '../src/query.js'
import type { QueryInput } from '../src/query.js'

/*
 * `_shards.failures[].reason` 怎么读（2026-10-18）。
 *
 * 判据来自真机：`level:(ERROR`（少一个右括号）时 ES 回 **HTTP 200** + `_shards.failed > 0`，
 * 原文在 `failures[].reason.reason` 里。上一版只数 `failed`、翻成「部分分片失败」，
 * 于是「查询串写错了」与「分片真坏了」在界面上长得一模一样——而这两件事的处理者不是同一个人。
 */
describe('分片失败原因（把宿主的原话读出来）', () => {
  it('ES 的 `reason` 是对象：取给人看的那句 `reason`，不取机器类名', () => {
    expect(shardFailureReasons({
      failed: 2,
      failures: [{
        index: 'logs-000001',
        reason: { type: 'query_shard_exception', reason: 'Failed to parse query [level:(ERROR]' },
      }],
    })).toEqual(['Failed to parse query [level:(ERROR]'])
  })

  it('同一条错误在每个分片上各报一次：去重（否则刷屏）', () => {
    const one = { reason: { type: 'x', reason: 'same failure' } }
    expect(shardFailureReasons({ failed: 3, failures: [one, one, one] })).toEqual(['same failure'])
  })

  it('最多报几条（默认 3），且保持 ES 给的顺序', () => {
    const failures = [1, 2, 3, 4, 5].map((n) => ({ reason: { reason: 'boom ' + String(n) } }))
    expect(shardFailureReasons({ failures })).toEqual(['boom 1', 'boom 2', 'boom 3'])
    expect(shardFailureReasons({ failures }, 2)).toEqual(['boom 1', 'boom 2'])
  })

  it('形状认不出就原样给一小段（看到原话比看到分类词有用）', () => {
    expect(shardFailureReasons({ failures: [{ reason: 'plain string reason' }] })).toEqual(['plain string reason'])
    expect(shardFailureReasons({ failures: [{ reason: { type: 'only_type' } }] })).toEqual(['only_type'])
    const odd = shardFailureReasons({ failures: [{ something: 'else' }] })
    expect(odd.length).toBe(1)
    expect(odd[0].includes('something')).toBe(true)
  })

  it('没有 failures / 形状不对 → 空数组（不造一句假原因）', () => {
    expect(shardFailureReasons(undefined)).toEqual([])
    expect(shardFailureReasons({ failed: 0 })).toEqual([])
    expect(shardFailureReasons({ failures: 'nope' })).toEqual([])
    expect(shardFailureReasons({ failures: [null, 3, { reason: '' }] })).toEqual([])
  })
})

const NOW = 1_760_000_000_000
const FROM = NOW - 60_000
const INDEX = 'logs-*'

interface FakeDoc {
  id: string
  source: Record<string, unknown>
}

interface Recorded {
  method: string
  path: string
  query: URLSearchParams
  body: Record<string, unknown> | undefined
  authorization: string | undefined
}

interface Outcome {
  status?: number
  body?: unknown
  raw?: string
  never?: boolean
}

interface FakeEs {
  url: string
  target: LoglensTarget
  requests: Recorded[]
  pits: { opened: number; closed: number; valid: Set<string> }
}

const servers: Server[] = []
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections()
    await new Promise<void>((resolve) => { server.close(() => { resolve() }) })
  }
})

/** 文档列表按时间**新的在前**（backward 的顺序），sort 的第二项用位置做 tiebreak。 */
function docsOf(entries: Array<{ id: string; iso: string; message: string; level?: string }>): FakeDoc[] {
  return entries.map((entry) => ({
    id: entry.id,
    source: {
      '@timestamp': entry.iso,
      message: entry.message,
      ...(entry.level === undefined ? {} : { level: entry.level }),
      app: 'demo',
      host: 'h1',
    },
  }))
}

async function startFakeEs(options: {
  docs?: FakeDoc[]
  version?: string
  distribution?: string
  failSearch?: Outcome
  /** `_field_caps` 回的字段表（缺省给一份最小的：@timestamp / message / app）。 */
  fieldCaps?: Record<string, unknown>
  /** 聚合响应里 `hits.total.relation`（模拟 track_total_hits 给的是下界那种情形）。 */
  aggsTotalRelation?: 'eq' | 'gte'
}): Promise<FakeEs> {
  const requests: Recorded[] = []
  const pits = { opened: 0, closed: 0, valid: new Set<string>() }
  const docs = options.docs === undefined ? [] : options.docs
  const sortOf = (doc: FakeDoc, at: number): unknown[] => [doc.source['@timestamp'], at]

  const server = createServer((req, res) => {
    let raw = ''
    req.on('data', (chunk) => { raw += String(chunk) })
    req.on('end', () => {
      const parsed = new URL(req.url === undefined ? '/' : req.url, 'http://127.0.0.1')
      let body: Record<string, unknown> | undefined
      try {
        const decoded: unknown = JSON.parse(raw)
        body = typeof decoded === 'object' && decoded !== null ? (decoded as Record<string, unknown>) : undefined
      } catch {
        body = undefined
      }
      const authorization = req.headers.authorization
      requests.push({
        method: req.method === undefined ? '' : req.method,
        path: parsed.pathname,
        query: parsed.searchParams,
        body,
        authorization: typeof authorization === 'string' ? authorization : undefined,
      })
      const send = (outcome: Outcome): void => {
        if (outcome.never === true) return
        const payload = outcome.raw === undefined ? JSON.stringify(outcome.body === undefined ? {} : outcome.body) : outcome.raw
        res.writeHead(outcome.status === undefined ? 200 : outcome.status, { 'content-type': 'application/json' })
        res.end(payload)
      }

      if (req.method === 'GET' && parsed.pathname === '/') {
        send({ body: { version: { number: options.version === undefined ? '8.13.4' : options.version, ...(options.distribution === undefined ? {} : { distribution: options.distribution }) } } })
        return
      }
      if (req.method === 'GET' && parsed.pathname.endsWith('/_field_caps')) {
        send({ body: { fields: options.fieldCaps ?? { '@timestamp': { date: {} }, message: { text: {} }, app: { keyword: {} } } } })
        return
      }
      if (req.method === 'POST' && parsed.pathname.endsWith('/_pit')) {
        pits.opened += 1
        const id = 'pit-' + String(pits.opened)
        pits.valid.add(id)
        send({ body: { id } })
        return
      }
      if (req.method === 'DELETE' && parsed.pathname === '/_pit') {
        pits.closed += 1
        const id = typeof body?.id === 'string' ? body.id : ''
        pits.valid.delete(id)
        send({ body: { succeeded: true } })
        return
      }
      /*
       * `/_search` 有两种形态，都要接住（loglens D08）：
       *   - 裸 `/_search`：**带 PIT** 的翻页搜索（PIT 已绑定索引集，路径上不该再带索引）；
       *   - `/<索引表达式>/_search`：**聚合**（facets 不开 PIT，必须自己带范围，否则是全集群通配）。
       * 断言「哪个请求是哪种形态」落在各用例里，这里只负责两种都路由到同一段逻辑。
       */
      if (req.method === 'POST' && parsed.pathname.endsWith('/_search')) {
        if (options.failSearch !== undefined) {
          send(options.failSearch)
          return
        }
        /*
         * 聚合请求不带 PIT（聚合不需要快照，也不需要把行拉回来）：先按「有没有 aggs」分流，
         * 回一份固定的聚合响应——buckets / over_time / sum_other_doc_count 三个信号都要能测到。
         */
        if (body?.aggs !== undefined) {
          const aggs = body.aggs as Record<string, unknown>
          const aggregations: Record<string, unknown> = {}
          if (aggs.by !== undefined) {
            aggregations.by = {
              buckets: [{ key: 'api', doc_count: 2 }, { key: 'web', doc_count: 1 }],
              sum_other_doc_count: 7,
              doc_count_error_upper_bound: 2,
            }
          }
          if (aggs.over_time !== undefined) {
            aggregations.over_time = { buckets: [{ key: NOW - 300_000, doc_count: 2 }, { key: NOW, doc_count: 1 }] }
          }
          send({ body: { timed_out: false, _shards: { failed: 0 }, hits: { total: { value: 10, relation: options.aggsTotalRelation === undefined ? 'eq' : options.aggsTotalRelation }, hits: [] }, aggregations } })
          return
        }
        const pitId = typeof body?.pit === 'object' && body.pit !== null ? (body.pit as { id?: unknown }).id : undefined
        if (typeof pitId !== 'string' || !pits.valid.has(pitId)) {
          send({ status: 404, body: { error: { type: 'search_context_missing_exception', reason: 'No search context found for id [' + String(pitId) + ']', root_cause: [] }, status: 404 } })
          return
        }
        const after = Array.isArray(body?.search_after) ? body.search_after : undefined
        let start = 0
        if (after !== undefined) {
          const at = docs.findIndex((doc, index) => sortOf(doc, index)[1] === after[1])
          start = at === -1 ? 0 : at + 1
        }
        const size = typeof body?.size === 'number' ? body.size : 10
        const slice = docs.slice(start, start + size)
        send({
          body: {
            timed_out: false,
            _shards: { failed: 0 },
            hits: {
              total: { value: docs.length, relation: 'eq' },
              hits: slice.map((doc, offset) => ({
                _id: doc.id,
                _index: 'logs-2026.10.11',
                _source: doc.source,
                sort: sortOf(doc, start + offset),
              })),
            },
          },
        })
        return
      }
      send({ status: 400, body: { error: { type: 'unknown_route', reason: 'no handler for ' + parsed.pathname } } })
    })
  })
  servers.push(server)
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', () => { resolve() }) })
  const port = (server.address() as AddressInfo).port
  const url = 'http://127.0.0.1:' + String(port)
  return { url, target: { id: 'es', kind: 'elasticsearch', label: '假 ES', url: url + '/' + INDEX }, requests, pits }
}

function normalized(backend: LogBackend, input: QueryInput) {
  const result = normalizeQuery(input, backend.capabilities(), { now: NOW })
  if (!result.ok) throw new Error('用例前提错误：' + result.error)
  return result.query
}

const THREE_DOCS = [
  { id: 'd1', iso: '2026-10-11T10:00:00.003Z', message: 'c' },
  { id: 'd2', iso: '2026-10-11T10:00:00.002Z', message: 'b' },
  { id: 'd3', iso: '2026-10-11T10:00:00.001Z', message: 'a' },
]

describe('请求形态', () => {
  it('先开 PIT（索引表达式取自地址路径），再 POST /_search —— 带 PIT 时搜索路径上不带索引', async () => {
    const fake = await startFakeEs({ docs: docsOf(THREE_DOCS) })
    const backend = createElasticBackend({ flavor: 'es' })
    await backend.query(normalized(backend, { targetId: 'es', from: FROM, to: NOW, limit: 2 }), fake.target)

    expect(fake.requests[0].method).toBe('POST')
    expect(fake.requests[0].path).toBe('/' + INDEX + '/_pit')
    expect(fake.requests[0].query.get('keep_alive')).toBe('2m')
    expect(fake.requests[1].path).toBe('/_search')

    const body = fake.requests[1].body as Record<string, unknown>
    expect(body.size).toBe(2)
    expect(body.track_total_hits).toBe(true)
    expect(body.pit).toEqual({ id: 'pit-1', keep_alive: '2m' })
    expect(body.sort).toEqual([{ '@timestamp': { order: 'desc', unmapped_type: 'date' } }, { _shard_doc: 'desc' }])
    const query = body.query as { bool: { must: unknown[]; filter: Array<{ range: Record<string, { gte: string; lte: string }> }> } }
    expect(query.bool.must).toEqual([{ match_all: {} }])
    expect(query.bool.filter[0].range['@timestamp']).toEqual({
      gte: new Date(FROM).toISOString(),
      lte: new Date(NOW).toISOString(),
    })
  })

  it('有查询串就走 query_string；地址里没写路径就用 *,-.*（排除点号索引）', async () => {
    const fake = await startFakeEs({ docs: [] })
    const backend = createElasticBackend({ flavor: 'es' })
    await backend.query(normalized(backend, { targetId: 'es', q: 'level:error', from: FROM, to: NOW }), { ...fake.target, url: fake.url })
    expect(fake.requests[0].path).toBe('/*,-.*/_pit')
    const body = fake.requests[1].body as { query: { bool: { must: unknown[] } } }
    expect(body.query.bool.must).toEqual([{ query_string: { query: 'level:error' } }])
  })

  it('地址里的 user:pass 变成 Basic 头，请求 URL 里不留凭据', async () => {
    const fake = await startFakeEs({ docs: [] })
    const withCredentials = fake.target.url.replace('://', '://user:pass@')
    const backend = createElasticBackend({ flavor: 'es' })
    await backend.query(normalized(backend, { targetId: 'es', from: FROM, to: NOW }), { ...fake.target, url: withCredentials })
    expect(fake.requests[0].authorization).toBe('Basic ' + Buffer.from('user:pass', 'utf8').toString('base64'))
    expect(fake.requests[0].path).not.toContain('user')
  })

  it('结构化 filters：keyword 字段打 term，text 且无子字段退回 match_phrase（真机反馈第 2 条）', async () => {
    const fake = await startFakeEs({ docs: docsOf(THREE_DOCS) })
    const backend = createElasticBackend({ flavor: 'es' })
    await backend.query(
      normalized(backend, { targetId: 'es', q: '', from: FROM, to: NOW, filters: { app: 'demo', level: 'error' } }),
      fake.target,
    )
    // 每个字段先问一次 _field_caps 决定怎么打（.keyword 这件事不该让调用方猜）
    const caps = fake.requests.filter((request) => request.path.endsWith('/_field_caps'))
    expect(caps.length).toBeGreaterThanOrEqual(1)
    const search = fake.requests.find((request) => request.path.endsWith('/_search'))
    expect(search).toBeDefined()
    const filter = (search?.body as { query: { bool: { filter: unknown[] } } }).query.bool.filter
    // app 在假 ES 的 _field_caps 里是 keyword → term 直接打
    expect(filter).toContainEqual({ term: { app: 'demo' } })
    // level 不在那些字段里（假 ES 没说它是 keyword）→ 保守退回 match_phrase，而不是静默打不中的 term
    expect(filter).toContainEqual({ match_phrase: { level: 'error' } })
  })

  it('聚合：terms 分组 + date_histogram 分桶，并把「没列出来的桶」如实回报', async () => {
    const fake = await startFakeEs({ docs: docsOf(THREE_DOCS) })
    const backend = createElasticBackend({ flavor: 'es' })
    const result = await backend.facets(
      normalized(backend, { targetId: 'es', q: '', from: FROM, to: NOW }),
      fake.target,
      { by: 'app', interval: '5m', size: 3 },
    )
    const search = fake.requests.find((request) => request.path.endsWith('/_search'))
    /*
     * 聚合必须**带上索引表达式**（loglens D08）：facets 不开 PIT，裸打 `/_search` 等于全集群通配，
     * `.kibana_*` 与别的应用索引会被一起聚合进来——于是同一张卡片里榜与行来自不同的数据集。
     * 这条断言钉的是「请求真的落在来源声明的范围内」，不是「有没有发出去」。
     */
    expect(search?.path).toBe('/' + INDEX + '/_search')
    const body = search?.body as { size: number, aggs: Record<string, unknown>, track_total_hits?: unknown }
    expect(body.size).toBe(0)   // 聚合不该顺带把行拉回来
    /*
     * 传了 by 就要**精确**的窗口命中数（loglens D07）：0 桶的两种成因只能靠它区分。
     * 只按时间分桶时不该付这笔钱——见下一条用例。
     */
    expect(body.track_total_hits).toBe(true)
    expect(body.aggs.by).toEqual({ terms: { field: 'app', size: 3 } })
    expect(body.aggs.over_time).toEqual({ date_histogram: { field: '@timestamp', fixed_interval: '5m', min_doc_count: 1 } })
    expect(result.buckets).toEqual([{ key: 'api', count: 2 }, { key: 'web', count: 1 }])
    expect(result.overTime).toEqual([{ ts: NOW - 300_000, count: 2 }, { ts: NOW, count: 1 }])
    expect(result.otherCount).toBe(7)                 // terms 只列 3 个桶时还剩多少条
    expect(result.countErrorUpperBound).toBe(2)       // 多分片下的近似性
    // totalHits 是**执行层的判据**（供 runFacets 说清 0 桶），不是给调用方看的字段
    expect(result.totalHits).toEqual({ value: 10, relation: 'eq', basis: 'exact' })
  })

  it('聚合：只按时间分桶时不开 track_total_hits（那个判据这里用不上）', async () => {
    const fake = await startFakeEs({ docs: docsOf(THREE_DOCS) })
    const backend = createElasticBackend({ flavor: 'es' })
    const result = await backend.facets(
      normalized(backend, { targetId: 'es', q: '', from: FROM, to: NOW }),
      fake.target,
      { interval: '5m' },
    )
    const search = fake.requests.find((request) => request.path.endsWith('/_search'))
    expect((search?.body as { track_total_hits?: unknown }).track_total_hits).toBe(false)
    expect(result.overTime).toEqual([{ ts: NOW - 300_000, count: 2 }, { ts: NOW, count: 1 }])
    /*
     * 时间分桶**不需要**那个判据：`over_time` 自己就说明了窗口里有没有日志（min_doc_count: 1 只发有数据的桶）。
     * 这里读回来的 totalHits 是**请求里带的精度**——没开 track_total_hits 时 ES 给的默认值（10000 + 'gte'）
     * 只是个下界提示；执行层只在传了 by 时用它（见新增用例：没给 by 就不谈字段）。
     */
    expect(result.totalHits?.relation).toBe('eq')
  })

  it('聚合：`relation: gte` 时把总数标成下界（不把近似值说成精确值）', async () => {
    const fake = await startFakeEs({ docs: docsOf(THREE_DOCS), aggsTotalRelation: 'gte' })
    const backend = createElasticBackend({ flavor: 'es' })
    const result = await backend.facets(
      normalized(backend, { targetId: 'es', q: '', from: FROM, to: NOW }),
      fake.target,
      { by: 'app' },
    )
    expect(result.totalHits).toEqual({ value: 10, relation: 'gte', basis: 'lower_bound' })
  })

  it('聚合：text 且无 .keyword 的字段明确报错（不猜、不静默空桶）', async () => {
    const fake = await startFakeEs({ docs: docsOf(THREE_DOCS) })
    const backend = createElasticBackend({ flavor: 'es' })
    await expect(
      backend.facets(normalized(backend, { targetId: 'es', q: '', from: FROM, to: NOW }), fake.target, { by: 'message' }),
    ).rejects.toThrow('没有 .keyword 子字段')
  })

  it('聚合：既没给 by 也没给 interval 就报错', async () => {
    const fake = await startFakeEs({ docs: [] })
    const backend = createElasticBackend({ flavor: 'es' })
    await expect(
      backend.facets(normalized(backend, { targetId: 'es', q: '', from: FROM, to: NOW }), fake.target, {}),
    ).rejects.toThrow('至少要给 by')
  })
})

describe('映射与计数', () => {
  it('文档 → LogLine：时间、message、level、labels、id 取 _id、source 取 _index', async () => {
    const fake = await startFakeEs({ docs: docsOf([{ id: 'abc', iso: '2026-10-11T10:00:00.250Z', message: 'boom', level: 'error' }]) })
    const backend = createElasticBackend({ flavor: 'es' })
    const result = await backend.query(normalized(backend, { targetId: 'es', from: FROM, to: NOW }), fake.target)
    expect(result.lines).toHaveLength(1)
    const line = result.lines[0]
    expect(line.ts).toBe(Date.parse('2026-10-11T10:00:00.250Z'))
    expect(line.message).toBe('boom')
    expect(line.level).toBe('error')
    expect(line.id).toBe('abc')
    expect(line.source).toBe('logs-2026.10.11')
    expect(line.labels).toEqual({ app: 'demo', host: 'h1' })
    expect(line.raw).toContain('boom')
  })

  it('时间解析不出来的行被跳过，且计数只算留下的（它没法被 context 重查）', () => {
    expect(lineFromHit({ _id: 'x', _source: { message: 'no time' } })).toBeUndefined()
    expect(lineFromHit({ _id: 'x', _source: { '@timestamp': 'not a date', message: 'x' } })).toBeUndefined()
    expect(lineFromHit({ _id: 'x', _source: { timestamp: 1_700_000_000_000, message: 'x' } })?.ts).toBe(1_700_000_000_000)
  })

  it('嵌套的 filebeat 文档：container / host / log 要摊进 labels（真机反馈第 1 条）', () => {
    const line = lineFromHit({
      _id: 'x',
      _index: 'app-logs-2026.10.11',
      _source: {
        '@timestamp': '2026-10-11T14:00:00.000Z',
        message: '[ERROR] app service failed',
        container: { name: 'app-svc-1', image: { name: 'registry.internal/app-svc-1:1.2.3' } },
        host: { name: 'host-a.internal' },
        log: { file: { path: '/var/lib/docker/containers/abc/abc-json.log' } },
        stream: 'stdout',
      },
    })
    expect(line?.labels['container.name']).toBe('app-svc-1')
    expect(line?.labels['host.name']).toBe('host-a.internal')
    expect(line?.labels['log.file.path']).toBe('/var/lib/docker/containers/abc/abc-json.log')
    // 级别：文档里没有就按正文推断，并标出来（不许把推断写成「来源标的」）
    expect(line?.level).toBe('error')
    expect(line?.levelInferred).toBe(true)
  })

  it('文档里有 log.level 时用它，并且不标 levelInferred', () => {
    const line = lineFromHit({
      _id: 'x',
      _source: { '@timestamp': '2026-10-11T14:00:00.000Z', message: '[ERROR] boom', 'log.level': 'warning' },
    })
    expect(line?.level).toBe('warn')
    expect(line?.levelInferred).toBeUndefined()
  })

  it('labels 有上限（文档字段几十个时不该把返回值撑爆）', () => {
    const source: Record<string, unknown> = { '@timestamp': '2026-10-11T10:00:00.000Z', message: 'm' }
    for (let index = 0; index < 40; index += 1) source['k' + String(index)] = 'v'
    const line = lineFromHit({ _id: 'x', _source: source })
    expect(Object.keys(line?.labels ?? {})).toHaveLength(20)
  })

  it('hits.total 的 relation 决定 totalKnown（gte = 只是下界）', async () => {
    const body = {
      timed_out: false,
      _shards: { failed: 0 },
      hits: { total: { value: 10000, relation: 'gte' }, hits: [] },
    }
    const fake = await startFakeEs({ docs: [] })
    const backend = createElasticBackend({ flavor: 'es', fetchImpl: async (input, init) => {
      const url = String(input)
      if (url.includes('/_pit')) return new Response(JSON.stringify({ id: 'pit-1' }), { status: 200 })
      if (init?.method === 'DELETE') return new Response(JSON.stringify({ succeeded: true }), { status: 200 })
      return new Response(JSON.stringify(body), { status: 200 })
    } })
    const result = await backend.query(normalized(backend, { targetId: 'es', from: FROM, to: NOW }), fake.target)
    expect(result.counts).toEqual({ returned: 0, matched: 10000, totalKnown: false })
  })

  it('timed_out 与分片失败都进截断理由', async () => {
    const body = { timed_out: true, _shards: { failed: 2 }, hits: { total: { value: 0, relation: 'eq' }, hits: [] } }
    const backend = createElasticBackend({ flavor: 'es', fetchImpl: async (input, init) => {
      const url = String(input)
      if (url.includes('/_pit')) return new Response(JSON.stringify({ id: 'pit-1' }), { status: 200 })
      if (init?.method === 'DELETE') return new Response(JSON.stringify({ succeeded: true }), { status: 200 })
      return new Response(JSON.stringify(body), { status: 200 })
    } })
    const fake = await startFakeEs({ docs: [] })
    const result = await backend.query(normalized(backend, { targetId: 'es', from: FROM, to: NOW }), fake.target)
    expect(result.truncation).toEqual({ truncated: true, reasons: ['partial_shards', 'timed_out'] })
  })

  /*
   * **反例（本格的核心）**：分片失败时那句 ES 原话必须跟着结果走。
   *
   * 真机现场：`level:(ERROR`（少一个右括号）回 HTTP 200 + 0 条 + `_shards.failed > 0`，
   * 界面上只显示「已截断：部分分片失败」——用户去查索引和集群，而真正的原因是他自己写错了。
   * 这条用例钉的是「原话有没有被带出来」，不是「文案好不好看」。
   */
  it('分片失败时把 ES 的原话带成 warnings（否则「写错了」与「坏了」长得一样）', async () => {
    const body = {
      timed_out: false,
      _shards: {
        failed: 2,
        failures: [{
          index: 'logs-000001',
          reason: { type: 'query_shard_exception', reason: 'Failed to parse query [level:(ERROR]' },
        }],
      },
      hits: { total: { value: 0, relation: 'eq' }, hits: [] },
    }
    const backend = createElasticBackend({ flavor: 'es', fetchImpl: async (input, init) => {
      const url = String(input)
      if (url.includes('/_pit')) return new Response(JSON.stringify({ id: 'pit-1' }), { status: 200 })
      if (init?.method === 'DELETE') return new Response(JSON.stringify({ succeeded: true }), { status: 200 })
      return new Response(JSON.stringify(body), { status: 200 })
    } })
    const fake = await startFakeEs({ docs: [] })
    const result = await backend.query(normalized(backend, { targetId: 'es', from: FROM, to: NOW }), fake.target)
    expect(result.warnings).toEqual(['[分片] Failed to parse query [level:(ERROR]'])
    // 截断理由照旧：原话是**补充**，不是替代
    expect(result.truncation).toEqual({ truncated: true, reasons: ['partial_shards'] })
  })

  it('分片全好时不带 warnings（没有失败就没有话说）', async () => {
    const body = { timed_out: false, _shards: { failed: 0 }, hits: { total: { value: 0, relation: 'eq' }, hits: [] } }
    const backend = createElasticBackend({ flavor: 'es', fetchImpl: async (input, init) => {
      const url = String(input)
      if (url.includes('/_pit')) return new Response(JSON.stringify({ id: 'pit-1' }), { status: 200 })
      if (init?.method === 'DELETE') return new Response(JSON.stringify({ succeeded: true }), { status: 200 })
      return new Response(JSON.stringify(body), { status: 200 })
    } })
    const fake = await startFakeEs({ docs: [] })
    const result = await backend.query(normalized(backend, { targetId: 'es', from: FROM, to: NOW }), fake.target)
    expect(result.warnings).toBeUndefined()
  })

  it('分片失败但 ES 没给原因：不造一句假话（宁可不带）', async () => {
    const body = { timed_out: false, _shards: { failed: 1 }, hits: { total: { value: 0, relation: 'eq' }, hits: [] } }
    const backend = createElasticBackend({ flavor: 'es', fetchImpl: async (input, init) => {
      const url = String(input)
      if (url.includes('/_pit')) return new Response(JSON.stringify({ id: 'pit-1' }), { status: 200 })
      if (init?.method === 'DELETE') return new Response(JSON.stringify({ succeeded: true }), { status: 200 })
      return new Response(JSON.stringify(body), { status: 200 })
    } })
    const fake = await startFakeEs({ docs: [] })
    const result = await backend.query(normalized(backend, { targetId: 'es', from: FROM, to: NOW }), fake.target)
    expect(result.warnings).toBeUndefined()
    expect(result.truncation.reasons).toContain('partial_shards')
  })
})

describe('游标：PIT + search_after', () => {
  it('满页给 nextCursor；续页复用同一个 PIT，且请求体里带 search_after', async () => {
    const fake = await startFakeEs({ docs: docsOf(THREE_DOCS) })
    const backend = createElasticBackend({ flavor: 'es' })
    const first = await backend.query(normalized(backend, { targetId: 'es', from: FROM, to: NOW, limit: 2 }), fake.target)
    expect(first.lines.map((line) => line.message)).toEqual(['c', 'b'])
    expect(first.nextCursor).toBeDefined()
    expect(first.truncation).toEqual({ truncated: true, reasons: ['hit_limit'] })

    const state = decodeSearchAfterCursor(first.nextCursor)
    if (state.kind !== 'ok') throw new Error('游标应当可解')
    expect(state.cursor.kind).toBe('es')
    expect(state.cursor.pitId).toBe('pit-1')

    const second = await backend.query(
      normalized(backend, { targetId: 'es', from: FROM, to: NOW, limit: 2, cursor: first.nextCursor }),
      fake.target,
    )
    expect(second.lines.map((line) => line.message)).toEqual(['a'])
    expect(fake.pits.opened).toBe(1)   // 复用，不重开
    // 只看 _search 那两条：最后一页会再补一次 DELETE /_pit
    const searches = fake.requests.filter((request) => request.path === '/_search')
    expect(searches).toHaveLength(2)
    const body = searches[1].body as Record<string, unknown>
    expect(body.search_after).toEqual(state.cursor.searchAfter)
    expect((body.pit as { id: string }).id).toBe('pit-1')
  })

  /*
   * 第三十六刀的边界（真机实测过，不是想出来的）：**命中数恰好等于条数上限**。
   *
   * 3 条文档、limit=3：旧判据 `lines.length >= limit` 成立 → 报「已截断」并给游标，
   * 可实际上一条都没漏，翻过去是 **0 行**（真机上点「下一页」就是这么空的）。
   * 现在靠精确总数区分：3 === 3 → 只是「可能还有」，既不说截断，也不给游标。
   */
  it('命中数**恰好等于**上限：报「可能还有」而不是截断，且**不给**游标（翻了必然空页）', async () => {
    const fake = await startFakeEs({ docs: docsOf(THREE_DOCS) })
    const backend = createElasticBackend({ flavor: 'es' })
    const result = await backend.query(normalized(backend, { targetId: 'es', from: FROM, to: NOW, limit: 3 }), fake.target)
    expect(result.lines).toHaveLength(3)
    expect(result.counts).toEqual({ returned: 3, matched: 3, totalKnown: true })
    expect(result.truncation).toEqual({ truncated: true, reasons: ['hit_limit_maybe'] })
    expect(result.nextCursor).toBeUndefined()
    // 没有下一页 → PIT 该关掉（别让它挂到过期）
    expect(fake.pits.closed).toBe(1)
  })

  it('命中数**多于**上限：确定截断，照常给游标', async () => {
    const fake = await startFakeEs({ docs: docsOf(THREE_DOCS) })
    const backend = createElasticBackend({ flavor: 'es' })
    const result = await backend.query(normalized(backend, { targetId: 'es', from: FROM, to: NOW, limit: 2 }), fake.target)
    expect(result.counts).toEqual({ returned: 2, matched: 3, totalKnown: true })
    expect(result.truncation).toEqual({ truncated: true, reasons: ['hit_limit'] })
    expect(result.nextCursor).toBeDefined()
  })

  it('命中数**少于**上限：不报任何截断，也不给游标', async () => {
    const fake = await startFakeEs({ docs: docsOf(THREE_DOCS) })
    const backend = createElasticBackend({ flavor: 'es' })
    const result = await backend.query(normalized(backend, { targetId: 'es', from: FROM, to: NOW, limit: 10 }), fake.target)
    expect(result.truncation).toEqual({ truncated: false, reasons: [] })
    expect(result.nextCursor).toBeUndefined()
  })

  it('总数只是下界（relation=gte）时退回「可能」：不硬断言还有更多', async () => {
    /*
     * 命中 2 行、上限 2、但 ES 说 total 是 `gte`（不知道真实总数）。
     * 行必须真的返回 2 条——没有行就不会触到「到了 limit」这条判据。
     */
    const body = {
      timed_out: false,
      _shards: { failed: 0 },
      hits: {
        total: { value: 2, relation: 'gte' },
        hits: docsOf(THREE_DOCS).slice(0, 2).map((doc, offset) => ({
          _id: doc.id,
          _index: 'logs-2026.10.11',
          _source: doc.source,
          sort: [Date.parse(String(doc.source['@timestamp'])), doc.id],
        })),
      },
    }
    const backend = createElasticBackend({ flavor: 'es', fetchImpl: async (input, init) => {
      const url = String(input)
      if (url.includes('/_pit')) return new Response(JSON.stringify({ id: 'pit-gte' }), { status: 200 })
      if (init?.method === 'DELETE') return new Response(JSON.stringify({ succeeded: true }), { status: 200 })
      return new Response(JSON.stringify(body), { status: 200 })
    } })
    const fake = await startFakeEs({ docs: [] })
    const result = await backend.query(normalized(backend, { targetId: 'es', from: FROM, to: NOW, limit: 2 }), fake.target)
    expect(result.counts.totalKnown).toBe(false)
    expect(result.truncation.reasons).toEqual(['hit_limit_maybe'])
    expect(result.nextCursor).toBeUndefined()
  })

  it('最后一页不产游标，并把 PIT 关掉（不带游标那次的收尾也一样）', async () => {
    const fake = await startFakeEs({ docs: docsOf(THREE_DOCS) })
    const backend = createElasticBackend({ flavor: 'es' })
    const result = await backend.query(normalized(backend, { targetId: 'es', from: FROM, to: NOW, limit: 10 }), fake.target)
    expect(result.nextCursor).toBeUndefined()
    expect(result.truncation.truncated).toBe(false)
    expect(fake.pits.closed).toBe(1)
  })

  it('PIT 过期：报 cursor_expired（不是 hit_limit），且**不偷偷重开** PIT', async () => {
    const fake = await startFakeEs({ docs: docsOf(THREE_DOCS) })
    const backend = createElasticBackend({ flavor: 'es' })
    // 先拿一个游标，再把服务器上的 PIT 作废（等价于它到期了）
    const first = await backend.query(normalized(backend, { targetId: 'es', from: FROM, to: NOW, limit: 1 }), fake.target)
    fake.pits.valid.clear()
    const opened = fake.pits.opened

    const expired = await backend.query(
      normalized(backend, { targetId: 'es', from: FROM, to: NOW, limit: 1, cursor: first.nextCursor }),
      fake.target,
    )
    expect(expired.lines).toEqual([])
    expect(expired.truncation).toEqual({ truncated: true, reasons: ['cursor_expired'] })
    expect(expired.counts).toEqual({ returned: 0, totalKnown: false })
    expect(fake.pits.opened).toBe(opened)   // 关键：没有重开
  })

  it('游标解不开 / 拿错适配器的游标都报错', async () => {
    const fake = await startFakeEs({ docs: [] })
    const backend = createElasticBackend({ flavor: 'es' })
    await expect(
      backend.query(normalized(backend, { targetId: 'es', from: FROM, to: NOW, cursor: '不是游标' }), fake.target),
    ).rejects.toThrow('游标解不开')
    // Loki 的游标（kind 不匹配）不许凑合着用
    const lokiCursor = Buffer.from(JSON.stringify({ v: 1, endNs: '1', streamIdx: 0, ordinalAtTs: 0 }), 'utf8').toString('base64url')
    await expect(
      backend.query(normalized(backend, { targetId: 'es', from: FROM, to: NOW, cursor: lokiCursor }), fake.target),
    ).rejects.toThrow('不是 ES / OpenSearch 的游标')
  })
})

describe('flavor / fields / health', () => {
  it('os 实例自报 opensearch；health 读 distributions 并指出与声明不一致', async () => {
    const fake = await startFakeEs({ docs: [], version: '2.13.0', distribution: 'opensearch' })
    const esBackend = createElasticBackend({ flavor: 'es' })
    const osBackend = createElasticBackend({ flavor: 'os' })
    expect(esBackend.id).toBe('elasticsearch')
    expect(osBackend.id).toBe('opensearch')
    expect(osBackend.capabilities().flavor).toBe('os')
    const esReport = await esBackend.health(fake.target)
    expect(esReport.ok).toBe(true)
    expect(String(esReport.detail)).toContain('opensearch')
    expect(String(esReport.detail)).toContain('不一致')
    const osReport = await osBackend.health(fake.target)
    expect(String(osReport.detail)).toBe('2.13.0（opensearch）')
  })

  it('字段走 _field_caps：优先键排前面、ES 内部字段去掉、带上截断信号', async () => {
    const fake = await startFakeEs({ docs: [] })
    const backend = createElasticBackend({ flavor: 'es' })
    const result = await backend.fields(fake.target)
    expect(result.truncated).toBe(false)
    expect(result.total).toBe(3)
    // 'app' 不在优先键名单里，所以排在名单里的 @timestamp / message 之后
    // 优先键名单里的顺序：message 与 @timestamp 都在名单里，app 不在 → app 落到最后
    expect(result.fields.map((field) => field.name)).toEqual(['message', '@timestamp', 'app'])
    expect(result.fields[0].preferred).toBe(true)
    expect(result.fields[2].preferred).toBeUndefined()
    expect(fake.requests[0].path).toBe('/' + INDEX + '/_field_caps')
  })

  it('字段表里不列 X.keyword 子字段行（调用方不该写 .keyword，适配器自己解析）', async () => {
    const fake = await startFakeEs({
      docs: [],
      fieldCaps: {
        'container.name': { text: { type: 'text' } },
        'container.name.keyword': { keyword: { type: 'keyword' } },
        'host.name': { keyword: { type: 'keyword' } },
      },
    })
    const result = await createElasticBackend({ flavor: 'es' }).fields(fake.target)
    expect(result.fields.map((field) => field.name)).toEqual(['container.name', 'host.name'])
    expect(result.total).toBe(2)
  })

  it('字段表被上限截断时如实回报（真机反馈第 4 条：看不出截断等于没给）', async () => {
    const fake = await startFakeEs({ docs: [] })
    const backend = createElasticBackend({ flavor: 'es' })
    const result = await backend.fields(fake.target, { limit: 2 })
    expect(result.fields).toHaveLength(2)
    expect(result.total).toBe(3)
    expect(result.truncated).toBe(true)
  })

  it('**不传 limit 就是不截断**：120 个字段全列（2026-10-14 对齐 Kibana，不许再退回「默认砍到 80」）', async () => {
    // 这条用例的判据只有一个：**默认那条路上没有任何 slice**——字段数超过任何可能的默认上限（80 / 200）
    // 也照样全给。谁要是把默认上限加回来（或让 ES 侧继续走 ES_DEFAULT_FIELD_LIMIT），这条立刻红。
    const many: Record<string, unknown> = {}
    for (let index = 0; index < 120; index += 1) many['f' + String(index).padStart(3, '0')] = { keyword: {} }
    const fake = await startFakeEs({ docs: [], fieldCaps: many })
    const result = await createElasticBackend({ flavor: 'es' }).fields(fake.target)
    expect(result.total).toBe(120)
    expect(result.fields).toHaveLength(120)
    expect(result.truncated).toBe(false)
    // 顺序照旧：优先键在名字前面，其余按字母——「不截断」不等于「不管顺序」
    expect(result.fields.every((field) => field.kind === 'indexed')).toBe(true)
  })

  it('同名在不同索引里类型不一致时标 conflict + esTypes + conflictDescriptions（Kibana 的 type: conflict）', async () => {
    // 真机实例（ES 11.1 那台、`*,-.*`）：`container.labels.org_label-schema_build-date` 在部分索引是
    // `date`、部分是 `text`——拿它分组只会覆盖一部分索引，所以必须标出来
    const fake = await startFakeEs({
      docs: [],
      fieldCaps: {
        '@timestamp': { date: { type: 'date', indices: ['app-1'] } },
        'container.labels.org_label-schema_build-date': {
          date: { type: 'date', indices: ['app-1'] },
          text: { type: 'text', indices: ['app-2'] },
        },
      },
    })
    const result = await createElasticBackend({ flavor: 'es' }).fields(fake.target)
    const conflicted = result.fields.find((field) => field.name === 'container.labels.org_label-schema_build-date')
    expect(conflicted?.conflict).toBe(true)
    expect(conflicted?.esTypes).toEqual(['date', 'text'])
    expect(conflicted?.conflictDescriptions).toEqual({ date: ['app-1'], text: ['app-2'] })
    // 单类型字段不带这一串：只在**有信息量**时才加（载荷与噪声两条都算）
    const plain = result.fields.find((field) => field.name === '@timestamp')
    expect(plain?.esTypes).toBeUndefined()
    expect(plain?.conflict).toBeUndefined()
    expect(plain?.conflictDescriptions).toBeUndefined()
  })

  it('同族的多类型**不算**冲突（text + keyword 都是字符串，Kibana 原话是 ignore the conflict）', async () => {
    const fake = await startFakeEs({
      docs: [],
      fieldCaps: {
        'app.name': {
          text: { type: 'text', indices: ['app-1'] },
          keyword: { type: 'keyword', indices: ['app-2'] },
        },
      },
    })
    const result = await createElasticBackend({ flavor: 'es' }).fields(fake.target)
    const field = result.fields.find((item) => item.name === 'app.name')
    // 类型摆出来（调用方看得见它是两栖的），但不打冲突标记——冲突的判据是**宽类型族**不同，不是「类型不止一个」
    expect(field?.esTypes).toEqual(['text', 'keyword'])
    expect(field?.conflict).toBeUndefined()
    expect(field?.conflictDescriptions).toBeUndefined()
  })

  it('object / nested 容器行不列（真机：`*,-.*` 的 200 个名字里有 10 个是容器行），total 也只数可列的', async () => {
    const fake = await startFakeEs({
      docs: [],
      fieldCaps: {
        container: { object: { type: 'object' } },
        'container.name': { keyword: { type: 'keyword' } },
        host: { object: { type: 'object' } },
        'host.name': { keyword: { type: 'keyword' } },
        'host.kids': { nested: { type: 'nested' } },
        // 「既当过容器又当过叶子」的名字**不剔**：判据是「所有类型都是容器」，不能顺手藏掉一个没定论的名字
        'container.mixed': { object: { type: 'object' }, keyword: { type: 'keyword', indices: ['app-1'] } },
      },
    })
    const result = await createElasticBackend({ flavor: 'es' }).fields(fake.target)
    expect(result.fields.map((field) => field.name)).toEqual(['container.name', 'host.name', 'container.mixed'])
    expect(result.total).toBe(3)   // 容器行不算进 total——「共 N 个字段」要与列出来的一致
    expect(result.fields.find((field) => field.name === 'container.mixed')?.conflict).toBe(true)
  })

  it('连不上时 health 如实回报（不是抛错）', async () => {
    const fake = await startFakeEs({ docs: [] })
    const url = fake.url
    for (const server of servers.splice(0)) {
      server.closeAllConnections()
      await new Promise<void>((resolve) => { server.close(() => { resolve() }) })
    }
    const report = await createElasticBackend({ flavor: 'es' }).health({ ...fake.target, url: url + '/' + INDEX })
    expect(report.ok).toBe(false)
  })
})

describe('错误', () => {
  it('401 把状态码与 reason 一起报出来', async () => {
    const fake = await startFakeEs({ docs: [], failSearch: { status: 401, body: { error: { type: 'security_exception', reason: 'unable to authenticate' } } } })
    const backend = createElasticBackend({ flavor: 'es' })
    await expect(backend.query(normalized(backend, { targetId: 'es', from: FROM, to: NOW }), fake.target))
      .rejects.toThrow('[elasticsearch] HTTP 401：unable to authenticate')
  })

  it('非 JSON 响应说清楚；os 的前缀是 [opensearch]', async () => {
    const fake = await startFakeEs({ docs: [], failSearch: { status: 502, raw: '<html>bad gateway</html>' } })
    await expect(createElasticBackend({ flavor: 'es' }).query(normalized(createElasticBackend({ flavor: 'es' }), { targetId: 'es', from: FROM, to: NOW }), fake.target))
      .rejects.toThrow('HTTP 502')
    const os = createElasticBackend({ flavor: 'os' })
    await expect(os.query(normalized(os, { targetId: 'es', from: FROM, to: NOW }), fake.target))
      .rejects.toThrow('[opensearch]')
  })

  it('超时不挂住', async () => {
    const fake = await startFakeEs({ docs: [], failSearch: { never: true } })
    const backend = createElasticBackend({ flavor: 'es', timeoutMs: 120 })
    await expect(backend.query(normalized(backend, { targetId: 'es', from: FROM, to: NOW }), fake.target))
      .rejects.toThrow('请求超时')
  })

  it('索引表达式与凭据的解析是纯函数，单独钉住', () => {
    expect(targetIndex({ id: 'x', kind: 'elasticsearch', label: 'x', url: 'http://h:9200/logs-2026.*/_search' })).toBe('logs-2026.*/_search')
    // 没写路径 → *,-.*（排除点号索引：全集群通配会把 .kibana / .infini_* 也算进来，真机反馈第 3 条）
    expect(targetIndex({ id: 'x', kind: 'elasticsearch', label: 'x', url: 'http://h:9200/' })).toBe(ES_DEFAULT_INDEX)
    // 显式 index 最优先——「路径即索引」只是兼容旧配置的暗号
    expect(targetIndex({ id: 'x', kind: 'elasticsearch', label: 'x', url: 'http://h:9200/ignored-*', index: 'app-logs-*' })).toBe('app-logs-*')
    expect(ES_DEFAULT_INDEX).toBe('*,-.*')
    // 基址是 origin（不带路径）：索引表达式单独给，搜索路径上不带索引（PIT 与它互斥）
    expect(targetAccess({ id: 'x', kind: 'elasticsearch', label: 'x', url: 'http://u:p@h:9200/i' }).url).toBe('http://h:9200')
    expect(looksLikeExpiredCursor({ status: 404, text: 'no such pit', body: {} })).toBe(true)
    expect(looksLikeExpiredCursor({ status: 500, text: 'boom', body: {} })).toBe(false)
  })
})

/*
 * 第三十五刀：正文的**命中高亮**（ES 原生 `highlight` → 字符区间）。
 *
 * 这一层的判据全部来自真机实测（ES 7.10.2），不是照着文档想当然——两处都和直觉不一样：
 *
 *   ① 片段与原文字符相等但**不是同一个串**：ES 会裁掉末尾空白（`"... to ERROR\n"` →
 *      `"... to \u0001ERROR"`）。所以「去掉标记后 === 原文」这种判据在真机上一条都过不了，
 *      第一版就是这么写的，结果是所有行都没有高亮，看起来像功能没生效。
 *   ② 命中落在正文末尾时**没有后标记**（`post_tags` 不回来）——而那恰好是最常见的一种命中
 *      （一行日志以 ERROR 收尾）。未闭合必须当成「到片段结尾」。
 */
describe('正文命中高亮：ES highlight → 字符区间（第三十五刀）', () => {
  const wrap = (inner: string): string => HIGHLIGHT_PRE + inner + HIGHLIGHT_POST

  it('把标记位置换算成原文下标（区间是左闭右开）', () => {
    expect(highlightRanges('to ' + wrap('ERROR'), 'to ERROR')).toEqual([[3, 8]])
  })

  it('片段比原文短（ES 裁掉末尾空白）**也要认**——这是真机最常见的形状', () => {
    // 真机：message 以 "\n" 收尾，fragment 没有那个换行
    expect(highlightRanges('to ' + wrap('ERROR'), 'to ERROR\n')).toEqual([[3, 8]])
  })

  it('命中在正文末尾、**没有后标记**：算到片段结尾，不能丢', () => {
    expect(highlightRanges('to ' + HIGHLIGHT_PRE + 'ERROR', 'to ERROR\n')).toEqual([[3, 8]])
  })

  it('多处命中按 start 升序返回', () => {
    expect(highlightRanges('a ' + wrap('err') + ' b ' + wrap('x'), 'a err b x\n')).toEqual([[2, 5], [8, 9]])
  })

  it('相邻/重叠的合并（同一个底色不必画两层）', () => {
    expect(highlightRanges(wrap('er') + wrap('ror'), 'error')).toEqual([[0, 5]])
  })

  it('**对不上就不标**：位置错比不标更坏（用户会以为那是引擎认出来的）', () => {
    expect(highlightRanges('mismatch ' + wrap('zzz'), 'mismatch abc')).toEqual([])
  })

  it('没有标记 / 空片段 / 非字符串 → 空区间（界面据此整段纯文本）', () => {
    expect(highlightRanges('plain text', 'plain text')).toEqual([])
    expect(highlightRanges('', 'abc')).toEqual([])
    expect(highlightRanges(undefined, 'abc')).toEqual([])
    expect(highlightRanges(['not', 'a', 'string'], 'abc')).toEqual([])
  })

  it('越界的标记一律丢掉（数组下标越界是渲染里最难查的一类错）', () => {
    expect(highlightRanges(HIGHLIGHT_PRE + 'abcdef' + HIGHLIGHT_POST, 'abc')).toEqual([])
  })

  it('lineFromHit 把 highlight 带成 highlights；没有就不带这个键', () => {
    const base = { '@timestamp': '2026-10-18T10:00:00.000Z', message: 'to ERROR\n' }
    const withMark = lineFromHit({
      _id: 'a',
      _source: base,
      highlight: { message: ['to ' + wrap('ERROR')] },
    })
    expect(withMark?.highlights).toEqual([[3, 8]])
    const plain = lineFromHit({ _id: 'b', _source: base })
    expect(plain === undefined ? 'missing' : Object.prototype.hasOwnProperty.call(plain, 'highlights')).toBe(false)
  })
})
