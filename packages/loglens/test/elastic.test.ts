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
  createElasticBackend,
  lineFromHit,
  looksLikeExpiredCursor,
  targetAccess,
  targetIndex,
} from '../src/backends/elastic.js'
import type { LogBackend } from '../src/backends/types.js'
import type { LoglensTarget } from '../src/config.js'
import { decodeSearchAfterCursor } from '../src/cursor.js'
import { normalizeQuery } from '../src/query.js'
import type { QueryInput } from '../src/query.js'

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
        send({ body: { fields: { '@timestamp': { date: {} }, message: { text: {} }, app: { keyword: {} } } } })
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
      if (req.method === 'POST' && parsed.pathname === '/_search') {
        if (options.failSearch !== undefined) {
          send(options.failSearch)
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

  it('结构化 filters 报错（不静默忽略）', async () => {
    const fake = await startFakeEs({ docs: [] })
    const backend = createElasticBackend({ flavor: 'es' })
    await expect(
      backend.query(normalized(backend, { targetId: 'es', from: FROM, to: NOW, filters: { level: 'error' } }), fake.target),
    ).rejects.toThrow('暂不支持结构化 filters')
    expect(fake.requests).toHaveLength(0)
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
        message: '[ERROR] exam service failed',
        container: { name: 'chendan-ems-service', image: { name: 'registry.internal/ems:1.2.3' } },
        host: { name: 'hostma-test-161' },
        log: { file: { path: '/var/lib/docker/containers/abc/abc-json.log' } },
        stream: 'stdout',
      },
    })
    expect(line?.labels['container.name']).toBe('chendan-ems-service')
    expect(line?.labels['host.name']).toBe('hostma-test-161')
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

  it('字段表被上限截断时如实回报（真机反馈第 4 条：看不出截断等于没给）', async () => {
    const fake = await startFakeEs({ docs: [] })
    const backend = createElasticBackend({ flavor: 'es' })
    const result = await backend.fields(fake.target, { limit: 2 })
    expect(result.fields).toHaveLength(2)
    expect(result.total).toBe(3)
    expect(result.truncated).toBe(true)
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
