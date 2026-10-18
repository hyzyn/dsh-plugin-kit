/**
 * @hyzyn/dsh-loglens — Loki 适配器的 wire 级用例（P2 的代码半体）。
 *
 * 不起真 Loki：用例自己起一个监听本机端口的 node:http 服务当假 Loki，适配器走**真的** fetch →
 * 真的 HTTP → 真的参数与响应体。这样锁住的是三件最容易漂的事：请求长什么样（路径 / 纳秒
 * start,end / limit / direction）、响应怎么摊平成行（跨流的全局顺序与同 ts 的序号）、错误与超时
 * 怎么报。
 *
 * **2026-10-12 真机验收后的修正**（loglens D02/D03）：此前那个假 Loki 只是**回一份固定 body**，
 * 完全不看 `start` / `end` / `limit`——于是适配器把 end 当成闭区间、把「同 ts 第几行」当坐标，
 * 两条错都能在假服务器上「通过」。现在假 Loki 按真 Loki 的语义过滤（start 闭、end 开）
 * 与截断（limit 取前 N 行），D02/D03 的反例才拦得住人。
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

/**
 * 起一个**按真 Loki 语义**作答的假 Loki（loglens D02/D03 的反例靠它）。
 *
 * 两条真语义是这两个 bug 的判据，缺一条反例就拦不住：
 *   - `start` **闭区间**、`end` **开区间**（真机逐纳秒扫过：end=ts 命中 0 行）；
 *   - `limit` 截断到前 N 行（真 Loki 会把一个同 ts 组切一半给你）。
 *
 * 另外可以传 `streamOrder` 来**打乱流在响应里的次序**——D03 的根因就是「位置会变」，
 * 不打乱的话反例在假服务器上照样绿。
 */
async function startRealisticLoki(
  streams: Array<{ labels: Record<string, string>; values: Array<[string, string]> }>,
  options: { streamOrder?: number[] } = {},
): Promise<FakeLoki> {
  return startFakeLoki((_path, params) => {
    const start = params.get('start') ?? '0'
    const end = params.get('end') ?? '0'
    const limit = Number(params.get('limit') ?? '100')
    const direction = params.get('direction') ?? 'backward'
    const ordered = options.streamOrder === undefined
      ? streams
      : options.streamOrder.map((index) => streams[index]).filter((item) => item !== undefined)
    const result = ordered.map((stream) => {
      const values = stream.values
        // start 闭、end 开 —— 真 Loki 的边界语义
        .filter(([ts]) => BigInt(ts) >= BigInt(start) && BigInt(ts) < BigInt(end))
        .sort((left, right) => {
          const byTime = BigInt(left[0]) === BigInt(right[0]) ? 0 : BigInt(left[0]) < BigInt(right[0]) ? -1 : 1
          if (byTime !== 0) return direction === 'forward' ? byTime : -byTime
          // 同 ts：真 Loki 的组内次序不保证，这里按内容排（稳定），乱序由 streamOrder 负责
          return left[1] < right[1] ? -1 : left[1] > right[1] ? 1 : 0
        })
      return { stream: stream.labels, values }
    }).filter((stream) => stream.values.length > 0)
    // limit 是**全局**截断：把各流摊平后取前 N 行，再按流归组（真 Loki 就这么干）
    const flat: Array<{ stream: Record<string, string>; ts: string; line: string }> = []
    for (const stream of result) for (const [ts, line] of stream.values) flat.push({ stream: stream.stream, ts, line })
    const kept = flat.slice(0, limit)
    const grouped: Array<{ labels: Record<string, string>; values: Array<[string, string]> }> = []
    for (const item of kept) {
      const existing = grouped.find((group) => group.labels === item.stream)
      if (existing === undefined) grouped.push({ labels: item.stream, values: [[item.ts, item.line]] })
      else existing.values.push([item.ts, item.line])
    }
    return { body: rangeBody(grouped) }
  })
}

function normalized(backend: LogBackend, input: QueryInput) {
  const result = normalizeQuery(input, backend.capabilities(), { now: NOW })
  if (!result.ok) throw new Error('用例前提错误：' + result.error)
  return result.query
}

const THREE_SAME_TS = rangeBody([
  { labels: { app: 'demo' }, values: [['1759999970000000000', 'a'], ['1759999970000000000', 'b'], ['1759999970000000000', 'c']] },
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
    // 同 ts 的 tie-break 是**内容键**升序（D03 之后不再用流序号——它会随响应次序变）
    expect(rows.map((row) => row.line)).toEqual(['a3', 'b3', 'b2', 'a1'])
    expect(rows.map((row) => row.tsNs)).toEqual(['300', '300', '200', '100'])
  })

  it('同 ts 多行按**内容**定序编号（LogLine.id 靠它，跨页稳定——不再赌响应位置）', () => {
    const rows = rowsFromRange(
      { data: { result: [{ stream: { app: 'a' }, values: [['100', 'x'], ['100', 'y'], ['100', 'z']] }] } },
      'backward',
    )
    expect(rows.map((row) => row.ordinalInGroup)).toEqual([0, 1, 2])
    expect(rows.map((row) => row.line)).toEqual(['x', 'y', 'z'])
  })

  it('D03 反例：同一份数据、流次序打乱，本层的定序与序号**不变**', () => {
    const body = {
      data: {
        result: [
          { stream: { app: 'b' }, values: [['100', 'b1'], ['100', 'b2']] },
          { stream: { app: 'a' }, values: [['100', 'a1'], ['100', 'a2']] },
        ],
      },
    }
    const shuffled = {
      data: {
        result: [
          { stream: { app: 'a' }, values: [['100', 'a1'], ['100', 'a2']] },
          { stream: { app: 'b' }, values: [['100', 'b1'], ['100', 'b2']] },
        ],
      },
    }
    // 旧实现按响应位置定序 → 两者不同；新实现按内容定序 → 两者一致
    expect(rowsFromRange(body, 'forward').map((row) => row.line))
      .toEqual(rowsFromRange(shuffled, 'forward').map((row) => row.line))
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
      body: rangeBody([{ labels: { app: 'demo' }, values: [['1759999970000000000', 'a']] }], {
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

  it('默认声明 pagination=cursor（2026-10-12 真机验收后启用）：满页给游标', async () => {
    const fake = await startRealisticLoki([
      { labels: { app: 'demo' }, values: [['1759999970000000000', 'a'], ['1759999970000000000', 'b'], ['1759999970000000000', 'c']] },
    ])
    const backend = createLokiBackend()
    expect(backend.capabilities().pagination).toBe('cursor')
    const result = await backend.query(normalized(backend, { targetId: 'loki', from: FROM, to: NOW, limit: 2 }), fake.target)
    // 末组被 limit 切开 → 补齐整组交付（3 行），所以页可以略超 limit；这是 D03 的刻意取舍
    expect(result.lines).toHaveLength(3)
    /*
     * 「可能还有」而不是「确定截断」（第三十六刀）：Loki 的 `/query_range` **不报总数**，
     * 所以「到了 limit」只能说明「可能还有」，不能断言「已截断」。
     * 游标照给——Loki 的游标是按时间戳与内容序算的，下一页真能拿到东西（这一页确实被切开了）。
     */
    expect(result.truncation).toEqual({ truncated: true, reasons: ['hit_limit_maybe'] })
    expect(result.nextCursor).toBeDefined()
  })
})

describe('游标路径（pagination=cursor）', () => {
  it('同 ts 三行 / limit=2：末组补齐后整组交付，续页拿到剩下的行（不丢不重）', async () => {
    const fake = await startRealisticLoki([
      { labels: { app: 'demo' }, values: [['1759999970000000000', 'a'], ['1759999970000000000', 'b'], ['1759999970000000000', 'c']] },
    ])
    const backend = createLokiBackend({ pagination: 'cursor' })
    const first = await backend.query(normalized(backend, { targetId: 'loki', from: FROM, to: NOW, limit: 2 }), fake.target)
    // 末组被 limit 切开 → 补齐整组（3 行都交付），并给游标
    expect(first.lines.map((line) => line.message)).toEqual(['a', 'b', 'c'])
    expect(first.nextCursor).toBeDefined()

    const state = decodeCursor(first.nextCursor)
    if (state.kind !== 'ok') throw new Error('游标应当可解')
    const second = await backend.query(
      normalized(backend, { targetId: 'loki', from: FROM, to: NOW, limit: 2, cursor: first.nextCursor }),
      fake.target,
    )
    // 续页不该把整组再来一遍（D03 的现场就是原地重复）
    expect(second.lines.map((line) => line.message)).toEqual([])
  })

  it('D02 反例：续页把窗口左端推到游标边界、右端保持 to（不是 end=边界——真 Loki 的 end 是开区间）', async () => {
    const fake = await startRealisticLoki([
      { labels: { app: 'demo' }, values: [['1759999970000000000', 'a'], ['1759999970000000000', 'b'], ['1759999970000000000', 'c']] },
    ])
    const backend = createLokiBackend({ pagination: 'cursor' })
    const first = await backend.query(normalized(backend, { targetId: 'loki', from: FROM, to: NOW, limit: 2, direction: 'forward' }), fake.target)
    const state = decodeCursor(first.nextCursor)
    if (state.kind !== 'ok') throw new Error('游标应当可解')
    const before = fake.requests.length
    await backend.query(
      normalized(backend, { targetId: 'loki', from: FROM, to: NOW, limit: 2, direction: 'forward', cursor: first.nextCursor }),
      fake.target,
    )
    // 续页那次**主查询**：起点跨过已交付的整组（boundary + 1ns），右端仍是 to
    const main = fake.requests[before]
    expect(main.params.get('start')).toBe(String(BigInt(state.cursor.boundaryNs) + 1n))
    expect(main.params.get('end')).toBe(toNanoString(NOW))
    // 而且绝不是「把 end 收成边界」那种写法（那会让整组落在开区间外）
    expect(main.params.get('end')).not.toBe(state.cursor.boundaryNs)
  })

  it('同 ts 同内容两行：两行 id 不同（按内容序区分，不靠响应位置）', async () => {
    const fake = await startRealisticLoki([
      { labels: { app: 'demo' }, values: [['1759999970000000000', 'same'], ['1759999970000000000', 'same']] },
    ])
    const backend = createLokiBackend({ pagination: 'cursor' })
    const result = await backend.query(normalized(backend, { targetId: 'loki', from: FROM, to: NOW, limit: 5 }), fake.target)
    expect(result.lines).toHaveLength(2)
    expect(result.lines[0].id).not.toBe(result.lines[1].id)
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
    expect(await backend.fields(fake.target)).toEqual({
      fields: [
        { name: 'app', kind: 'discovered' },
        { name: 'level', kind: 'discovered' },
      ],
      total: 2,
      truncated: false,
    })
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
