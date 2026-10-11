/**
 * @hyzyn/dsh-loglens — ES **7.10 兼容**的用例（2026-10-11 在一台真实的 7.10.2 上实测出来的两处差异）。
 *
 * 现场：用户拿一台 Elasticsearch 7.10.2 当来源，第一次查询直接报
 * 「[elasticsearch] 打开 PIT 没拿到 id（这一版的分页依赖 PIT）」。逐条打那台机器后确认：
 *
 *   1. **PIT 的响应键 7.10 是 `pit_id`**（7.12+ 才改叫 `id`）——适配器只读 `id`，于是「拿不到 id」；
 *   2. **7.10 没有 `_shard_doc`**（7.12 才有的特殊排序字段）：带上它会回
 *      「No mapping found for [_shard_doc] in order to sort on」，而 `_id` 可用（同一台机器实测）。
 *
 * 这条用例用一个「装成 7.10」的假 ES 把两件事都钉住：默认用 `_shard_doc`，被拒一次后自动退到
 * `_id` 重试，并把这台 ES 的选择**记住**（第二次查询不再白试一次）。
 */
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { createElasticBackend } from '../src/backends/elastic.js'
import type { LogBackend } from '../src/backends/types.js'
import type { LoglensTarget } from '../src/config.js'
import { normalizeQuery } from '../src/query.js'
import type { QueryInput } from '../src/query.js'

const NOW = 1_760_000_000_000
const FROM = NOW - 60_000
const INDEX = 'app-logs-*'

interface Recorded {
  method: string
  path: string
  body: Record<string, unknown> | undefined
}

const servers: Server[] = []
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections()
    await new Promise<void>((resolve) => { server.close(() => { resolve() }) })
  }
})

/** 一个「装成 ES 7.10」的假服务：PIT 回 pit_id，且把 _shard_doc 当普通字段拒绝。 */
async function startFakeEs710(style: '400' | '200-partial' = '400'): Promise<{ target: LoglensTarget; requests: Recorded[] }> {
  const requests: Recorded[] = []
  const pits = new Set<string>()
  let opened = 0
  const docs = [
    { id: 'd1', iso: '2026-10-11T10:00:00.003Z', message: 'c' },
    { id: 'd2', iso: '2026-10-11T10:00:00.002Z', message: 'b' },
    { id: 'd3', iso: '2026-10-11T10:00:00.001Z', message: 'a' },
  ]
  const sortOf = (doc: { iso: string }, at: number): unknown[] => [doc.iso, at]

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
      requests.push({ method: req.method === undefined ? '' : req.method, path: parsed.pathname, body })
      const send = (status: number, payload: unknown): void => {
        res.writeHead(status, { 'content-type': 'application/json' })
        res.end(JSON.stringify(payload))
      }

      if (req.method === 'POST' && parsed.pathname.endsWith('/_pit')) {
        opened += 1
        const id = 'pit-' + String(opened)
        pits.add(id)
        // 7.10 的键名：pit_id（不是 id）
        send(200, { pit_id: id })
        return
      }
      if (req.method === 'DELETE' && parsed.pathname === '/_pit') {
        send(200, { succeeded: true })
        return
      }
      if (req.method === 'POST' && parsed.pathname === '/_search') {
        const sort = JSON.stringify(body === undefined || body.sort === undefined ? [] : body.sort)
        if (sort.includes('_shard_doc')) {
          const reason = { type: 'query_shard_exception', reason: 'No mapping found for [_shard_doc] in order to sort on', index: 'app-logs-000124' }
          if (style === '200-partial') {
            // 真机（7.10.2）的实际表现：**200 + _shards.failed + 空 hits**，不是 4xx
            send(200, {
              _shards: { failed: 1, failures: [{ index: 'app-logs-000124', reason }] },
              timed_out: false,
              hits: { total: { value: 0, relation: 'eq' }, hits: [] },
            })
          } else {
            send(400, {
              error: { root_cause: [reason], type: 'search_phase_execution_exception', reason: 'all shards failed' },
              status: 400,
            })
          }
          return
        }
        const pitId = typeof body?.pit === 'object' && body.pit !== null ? (body.pit as { id?: unknown }).id : undefined
        if (typeof pitId !== 'string' || !pits.has(pitId)) {
          send(404, { error: { type: 'search_context_missing_exception', reason: 'No search context found' }, status: 404 })
          return
        }
        const size = typeof body?.size === 'number' ? body.size : 10
        const slice = docs.slice(0, size)
        send(200, {
          _shards: { failed: 0 },
          timed_out: false,
          hits: {
            total: { value: docs.length, relation: 'eq' },
            hits: slice.map((doc, at) => ({
              _id: doc.id,
              _index: 'app-logs-000124',
              _source: { '@timestamp': doc.iso, message: doc.message },
              sort: sortOf(doc, at),
            })),
          },
        })
        return
      }
      send(400, { error: { type: 'unknown_route', reason: parsed.pathname } })
    })
  })
  servers.push(server)
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', () => { resolve() }) })
  const port = (server.address() as AddressInfo).port
  const url = 'http://127.0.0.1:' + String(port)
  return { target: { id: 'es', kind: 'elasticsearch', label: '假 7.10', url: url + '/' + INDEX }, requests }
}

function normalized(backend: LogBackend, input: QueryInput) {
  const result = normalizeQuery(input, backend.capabilities(), { now: NOW })
  if (!result.ok) throw new Error('用例前提错误：' + result.error)
  return result.query
}

describe('ES 7.10 兼容', () => {
  it('PIT 的键是 pit_id 也认（7.10 的写法），查询照常出数据', async () => {
    const fake = await startFakeEs710()
    const backend = createElasticBackend({ flavor: 'es' })
    const result = await backend.query(normalized(backend, { targetId: 'es', from: FROM, to: NOW, limit: 2 }), fake.target)
    expect(result.lines.map((line) => line.message)).toEqual(['c', 'b'])
    expect(result.counts).toEqual({ returned: 2, matched: 3, totalKnown: true })
    expect(result.nextCursor).toBeDefined()
  })

  it('不认识 _shard_doc：自动退到 _id 重试一次，并把选择记住', async () => {
    const fake = await startFakeEs710()
    const backend = createElasticBackend({ flavor: 'es' })
    const first = await backend.query(normalized(backend, { targetId: 'es', from: FROM, to: NOW, limit: 2 }), fake.target)
    expect(first.lines.map((line) => line.message)).toEqual(['c', 'b'])

    const searches = fake.requests.filter((request) => request.path === '/_search')
    expect(searches).toHaveLength(2)
    expect(JSON.stringify(searches[0].body === undefined ? {} : searches[0].body.sort)).toContain('_shard_doc')
    expect(JSON.stringify(searches[1].body === undefined ? {} : searches[1].body.sort)).toContain('_id')

    await backend.query(normalized(backend, { targetId: 'es', from: FROM, to: NOW, limit: 2 }), fake.target)
    const after = fake.requests.filter((request) => request.path === '/_search')
    expect(after).toHaveLength(3)
    const lastSort = JSON.stringify(after[2].body === undefined ? {} : after[2].body.sort)
    expect(lastSort).toContain('_id')
    expect(lastSort).not.toContain('_shard_doc')
  })
})

describe('7.10 的另一种表现：200 + 分片失败（真机实测的形态）', () => {
  it('响应体里点着 _shard_doc 也要退到 _id（不能把那次空结果当答案）', async () => {
    const fake = await startFakeEs710('200-partial')
    const backend = createElasticBackend({ flavor: 'es' })
    const result = await backend.query(normalized(backend, { targetId: 'es', from: FROM, to: NOW, limit: 2 }), fake.target)
    expect(result.lines.map((line) => line.message)).toEqual(['c', 'b'])
    expect(result.counts.matched).toBe(3)
    expect(result.truncation.reasons).not.toContain('partial_shards')
    const searches = fake.requests.filter((request) => request.path === '/_search')
    expect(searches).toHaveLength(2)
    expect(JSON.stringify(searches[0].body === undefined ? {} : searches[0].body.sort)).toContain('_shard_doc')
    expect(JSON.stringify(searches[1].body === undefined ? {} : searches[1].body.sort)).toContain('_id')
  })
})