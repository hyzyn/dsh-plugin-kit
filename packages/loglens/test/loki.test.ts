/**
 * @hyzyn/dsh-loglens — Loki 适配器的 wire 级用例（P2 的代码半体）。
 *
 * 不起真 Loki：用例自己起一个监听本机端口的 node:http 服务当假 Loki，适配器走**真的** fetch →
 * 真的 HTTP → 真的参数与响应体。这样锁住的是三件最容易漂的事：请求长什么样（路径 / 纳秒
 * start,end / limit / direction）、响应怎么摊平成行（跨流的全局顺序与同 ts 的序号）、错误与超时
 * 怎么报。真机验收（同 ts 多行的顺序稳定性）另算，见 ROADMAP 的 P2。
 */
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { createLokiBackend, rowsFromRange, toNanoString } from '../src/backends/loki.js'
import type { LogBackend } from '../src/backends/types.js'
import type { LoglensTarget } from '../src/config.js'
import { decodeCursor } from '../src/cursor.js'
import { normalizeQuery } from '../src/query.js'
import type { QueryInput } from '../src/query.js'

const NOW = 1_760_000_000_000
const FROM = NOW - 60_000

interface Outcome {
  status?: number
  body?: unknown
  raw?: string
  delayMs?: number
  never?: boolean
}

interface FakeLoki {
  url: string
  requests: Array<{ path: string; params: URLSearchParams }>
  target: LoglensTarget
}

const servers: Server[] = []

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections()
    await new Promise<void>((resolve) => { server.close(() => { resolve() }) })
  }
})

async function startFakeLoki(handler: (path: string, params: URLSearchParams) => Outcome): Promise<FakeLoki> {
  const requests: Array<{ path: string; params: URLSearchParams }> = []
  const server = createServer((req, res) => {
    const parsed = new URL(req.url === undefined ? '/' : req.url, 'http://127.0.0.1')
    requests.push({ path: parsed.pathname, params: parsed.searchParams })
    const outcome = handler(parsed.pathname, parsed.searchParams)
    const send = (): void => {
      if (outcome.never === true) return
      const payload = outcome.raw === undefined ? JSON.stringify(outcome.body === undefined ? {} : outcome.body) : outcome.raw
      res.writeHead(outcome.status === undefined ? 200 : outcome.status, { 'content-type': 'application/json' })
      res.end(payload)
    }
    if (outcome.delayMs === undefined) send()
    else setTimeout(send, outcome.delayMs)
  })
  servers.push(server)
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', () => { resolve() }) })
  const port = (server.address() as AddressInfo).port
  const url = 'http://127.0.0.1:' + String(port)
  return { url, requests, target: { id: 'loki', kind: 'loki', label: '假 Loki', url } }
}

function rangeBody(
  streams: Array<{ labels: Record<string, string>; values: Array<[string, string]> }>,
  summary?: Record<string, unknown>,
): unknown {
  return {
    status: 'success',
    data: {
      resultType: 'streams',
      result: streams.map((stream) => ({ stream: stream.labels, values: stream.values })),
      stats: { summary: summary === undefined ? {} : summary },
    },
  }
}

function normalized(backend: LogBackend, input: QueryInput) {
  const result = normalizeQuery(input, backend.capabilities(), { now: NOW })
  if (!result.ok) throw new Error('用例前提错误：' + result.error)
  return result.query
}

const THREE_SAME_TS = rangeBody([
  { labels: { app: 'demo' }, values: [['1700000000000000001', 'a'], ['1700000000000000001', 'b'], ['1700000000000000001', 'c']] },
])

describe('请求形态', () => {
  it('打 GET /loki/api/v1/query_range，时间戳是纳秒，limit 与 direction 原样', async () => {
    const fake = await startFakeLoki(() => ({ body: rangeBody([]) }))
    const backend = createLokiBackend()
    await backend.query(normalized(backend, { targetId: 'loki', from: FROM, to: NOW, limit: 7, direction: 'forward' }), fake.target)

    expect(fake.requests).toHaveLength(1)
    const request = fake.requests[0]
    expect(request.path).toBe('/loki/api/v1/query_range')
    expect(request.params.get('start')).toBe(toNanoString(FROM))
    expect(request.params.get('end')).toBe(toNanoString(NOW))
    expect(request.params.get('limit')).toBe('7')
    expect(request.params.get('direction')).toBe('forward')
  })

  it('空查询串发成 {}（Loki 要的是合法的 LogQL）', async () => {
    const fake = await startFakeLoki(() => ({ body: rangeBody([]) }))
    const backend = createLokiBackend()
    await backend.query(normalized(backend, { targetId: 'loki', from: FROM, to: NOW }), fake.target)
    expect(fake.requests[0].params.get('query')).toBe('{}')
  })

  it('base 带尾斜杠或子路径前缀都不丢', async () => {
    const fake = await startFakeLoki(() => ({ body: rangeBody([]) }))
    const backend = createLokiBackend()
    const prefixed = { ...fake.target, url: fake.url + '/loki/' }
    await backend.query(normalized(backend, { targetId: 'loki', from: FROM, to: NOW }), prefixed)
    expect(fake.requests[0].path).toBe('/loki/loki/api/v1/query_range')
  })

  it('结构化 filters 直接报错：不静默忽略（用户以为筛了、其实拿的是全量）', async () => {
    const fake = await startFakeLoki(() => ({ body: rangeBody([]) }))
    const backend = createLokiBackend()
    await expect(
      backend.query(normalized(backend, { targetId: 'loki', from: FROM, to: NOW, filters: { level: 'error' } }), fake.target),
    ).rejects.toThrow('暂不支持结构化 filters')
    expect(fake.requests).toHaveLength(0)
  })
})

describe('摊平成行', () => {
  it('跨流没有全局顺序：本层补一个确定的合并顺序（backward 按 ts 倒序）', () => {
    const rows = rowsFromRange(
      {
        data: {
          result: [
            { stream: { app: 'a' }, values: [['100', 'a1'], ['300', 'a3']] },
            { stream: { app: 'b' }, values: [['200', 'b2'], ['300', 'b3']] },
          ],
        },
      },
      'backward',
    )
    // 同一个 ts 上的 tie-break 是流序号升序：先 a 流再 b 流
    expect(rows.map((row) => row.line)).toEqual(['a3', 'b3', 'b2', 'a1'])
    expect(rows.map((row) => row.streamIdx)).toEqual([0, 1, 1, 0])
  })

  it('同 ts 同流多行按出现次序编号（LogLine.id 靠它，跨页也稳定）', () => {
    const rows = rowsFromRange(
      { data: { result: [{ stream: { app: 'a' }, values: [['100', 'x'], ['100', 'y'], ['100', 'z']] }] } },
      'backward',
    )
    expect(rows.map((row) => row.ordinalInGroup)).toEqual([0, 1, 2])
  })

  it('残缺的 value 对跳过，不炸整次查询', () => {
    const rows = rowsFromRange(
      { data: { result: [{ stream: {}, values: [['100', 'ok'], [''] as [string, string], ['101', 'ok2']] }] } },
      'forward',
    )
    expect(rows.map((row) => row.line)).toEqual(['ok', 'ok2'])
  })
})

describe('查询结果：计数与截断', () => {
  it('stats 搬进 scannedRows / scannedBytes；Loki 不给精确总数，所以 totalKnown 为假', async () => {
    const fake = await startFakeLoki(() => ({
      body: rangeBody([{ labels: { app: 'demo' }, values: [['1700000000000000001', 'a']] }], {
        totalLinesProcessed: 900,
        totalBytesProcessed: 4096,
      }),
    }))
    const backend = createLokiBackend()
    const result = await backend.query(normalized(backend, { targetId: 'loki', from: FROM, to: NOW }), fake.target)
    expect(result.counts).toEqual({ returned: 1, scannedRows: 900, scannedBytes: 4096, totalKnown: false })
    expect(result.counts.matched).toBeUndefined()
  })

  it('没有 stats 就不编造扫描量', async () => {
    const fake = await startFakeLoki(() => ({ body: { status: 'success', data: { result: [] } } }))
    const backend = createLokiBackend()
    const result = await backend.query(normalized(backend, { targetId: 'loki', from: FROM, to: NOW }), fake.target)
    expect(result.counts).toEqual({ returned: 0, totalKnown: false })
    expect(result.truncation).toEqual({ truncated: false, reasons: [] })
  })

  it('默认声明 pagination=none：满页只报 hit_limit，且不给会丢行的游标', async () => {
    const fake = await startFakeLoki(() => ({ body: THREE_SAME_TS }))
    const backend = createLokiBackend()
    expect(backend.capabilities().pagination).toBe('none')
    const result = await backend.query(normalized(backend, { targetId: 'loki', from: FROM, to: NOW, limit: 2 }), fake.target)
    expect(result.lines).toHaveLength(2)
    expect(result.truncation).toEqual({ truncated: true, reasons: ['hit_limit'] })
    expect(result.nextCursor).toBeUndefined()
  })
})

describe('游标路径（pagination=cursor：真机测出稳定序后才会启用）', () => {
  it('同 ts 三行 / limit=2：下一页拿到第三行，且续页的 end 是含边界的那个 ts', async () => {
    const fake = await startFakeLoki(() => ({ body: THREE_SAME_TS }))
    const backend = createLokiBackend({ pagination: 'cursor' })
    const first = await backend.query(normalized(backend, { targetId: 'loki', from: FROM, to: NOW, limit: 2 }), fake.target)
    expect(first.lines.map((line) => line.message)).toEqual(['a', 'b'])
    expect(first.nextCursor).toBeDefined()

    const state = decodeCursor(first.nextCursor)
    if (state.kind !== 'ok') throw new Error('游标应当可解')
    const second = await backend.query(
      normalized(backend, { targetId: 'loki', from: FROM, to: NOW, limit: 2, cursor: first.nextCursor }),
      fake.target,
    )
    expect(second.lines.map((line) => line.message)).toEqual(['c'])
    expect(fake.requests[1].params.get('end')).toBe(state.cursor.endNs)
    expect(second.lines[0].id).not.toBe(first.lines[0].id)
    expect(second.lines[0].id).not.toBe(first.lines[1].id)
  })

  it('同 ts 同内容两行 / limit=1：第二行照样拿得到，两行 id 不同', async () => {
    const sameBody = rangeBody([{ labels: { app: 'demo' }, values: [['1700000000000000002', 'same'], ['1700000000000000002', 'same']] }])
    const fake = await startFakeLoki(() => ({ body: sameBody }))
    const backend = createLokiBackend({ pagination: 'cursor' })
    const first = await backend.query(normalized(backend, { targetId: 'loki', from: FROM, to: NOW, limit: 1 }), fake.target)
    const second = await backend.query(
      normalized(backend, { targetId: 'loki', from: FROM, to: NOW, limit: 1, cursor: first.nextCursor }),
      fake.target,
    )
    expect(first.lines).toHaveLength(1)
    expect(second.lines).toHaveLength(1)
    expect(second.lines[0].message).toBe('same')
    expect(second.lines[0].id).not.toBe(first.lines[0].id)
  })

  it('游标解不开就报错，不装作从头开始（那会变成重复行）', async () => {
    const fake = await startFakeLoki(() => ({ body: rangeBody([]) }))
    const backend = createLokiBackend({ pagination: 'cursor' })
    await expect(
      backend.query(normalized(backend, { targetId: 'loki', from: FROM, to: NOW, cursor: '不是游标' }), fake.target),
    ).rejects.toThrow('游标解不开')
    expect(fake.requests).toHaveLength(0)
  })
})

describe('错误与超时', () => {
  it('非 2xx 把状态码与 Loki 的 error 文案一起报出来', async () => {
    const fake = await startFakeLoki(() => ({ status: 500, body: { error: 'boom' } }))
    const backend = createLokiBackend()
    await expect(backend.query(normalized(backend, { targetId: 'loki', from: FROM, to: NOW }), fake.target))
      .rejects.toThrow('[loki] HTTP 500：boom')
  })

  it('响应不是 JSON 时说清楚', async () => {
    const fake = await startFakeLoki(() => ({ raw: '<html>gateway</html>' }))
    const backend = createLokiBackend()
    await expect(backend.query(normalized(backend, { targetId: 'loki', from: FROM, to: NOW }), fake.target))
      .rejects.toThrow('返回的不是 JSON')
  })

  it('body 里 status=error 也算失败（Loki 会 200 回错误）', async () => {
    const fake = await startFakeLoki(() => ({ body: { status: 'error', error: 'parse error' } }))
    const backend = createLokiBackend()
    await expect(backend.query(normalized(backend, { targetId: 'loki', from: FROM, to: NOW }), fake.target))
      .rejects.toThrow('查询失败')
  })

  it('服务端不应答时超时报错，而不是挂住', async () => {
    const fake = await startFakeLoki(() => ({ never: true }))
    const backend = createLokiBackend({ timeoutMs: 120 })
    await expect(backend.query(normalized(backend, { targetId: 'loki', from: FROM, to: NOW }), fake.target))
      .rejects.toThrow('请求超时')
  })
})

describe('fields 与 health', () => {
  it('字段走 /loki/api/v1/labels，空串与非字符串被丢掉', async () => {
    const fake = await startFakeLoki((path) => {
      expect(path).toBe('/loki/api/v1/labels')
      return { body: { status: 'success', data: ['app', '', 42, 'level'] } }
    })
    const backend = createLokiBackend()
    expect(await backend.fields(fake.target)).toEqual([
      { name: 'app', kind: 'discovered' },
      { name: 'level', kind: 'discovered' },
    ])
  })

  it('/ready 200 是就绪，503 带原因', async () => {
    const healthy = await startFakeLoki(() => ({ raw: 'ready' }))
    const backend = createLokiBackend()
    expect(await backend.health(healthy.target)).toEqual({ ok: true, detail: 'ready' })

    const broken = await startFakeLoki(() => ({ status: 503, raw: 'not ready' }))
    const report = await backend.health(broken.target)
    expect(report.ok).toBe(false)
    expect(report.detail).toContain('503')
  })

  it('连不上时 health 如实回报（不是抛错）', async () => {
    const fake = await startFakeLoki(() => ({ body: {} }))
    const backend = createLokiBackend()
    const url = fake.url
    for (const server of servers.splice(0)) {
      server.closeAllConnections()
      await new Promise<void>((resolve) => { server.close(() => { resolve() }) })
    }
    const report = await backend.health({ ...fake.target, url })
    expect(report.ok).toBe(false)
    expect(typeof report.detail).toBe('string')
  })
})
