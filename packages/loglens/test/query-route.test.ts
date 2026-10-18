/**
 * @hyzyn/dsh-loglens — 面板查询路由的用例（P6 的宿主侧那一刀）。
 *
 * **端到端**：路由 → src/execute.ts（与 agent 工具共用的那一层）→ 真的 Loki 适配器 → 假 Loki 的
 * 真 HTTP 服务。锁的是三件事：围栏（/query 与 /fields 要同源证明、禁用时只留 /config）、
 * 参数与错误的原话（校验失败要把「下一步」带出来）、以及返回值形状与 agent 工具一致。
 */
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { createLokiBackend } from '../src/backends/loki.js'
import type { BackendCaps, LogBackend } from '../src/backends/types.js'
import type { LoglensConfig, SourceKind } from '../src/config.js'
import { runFacets, runFields, runSearch } from '../src/execute.js'
import { ROUTE_PREFIX, makeRoutes } from '../src/index.js'

const servers: Server[] = []
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections()
    await new Promise<void>((resolve) => { server.close(() => { resolve() }) })
  }
})

interface Recorded { path: string; params: URLSearchParams }

async function startFakeLoki(options: { status?: number; body?: unknown } = {}): Promise<{ url: string; requests: Recorded[] }> {
  const requests: Recorded[] = []
  const server = createServer((req, res) => {
    const parsed = new URL(req.url === undefined ? '/' : req.url, 'http://127.0.0.1')
    requests.push({ path: parsed.pathname, params: parsed.searchParams })
    if (parsed.pathname === '/loki/api/v1/query_range') {
      const body = options.body === undefined
        ? {
            status: 'success',
            data: {
              resultType: 'streams',
              result: [{ stream: { app: 'demo' }, values: [['1700000000000000001', 'hello'], ['1700000000000000000', 'older']] }],
              stats: { summary: { totalLinesProcessed: 12, totalBytesProcessed: 512 } },
            },
          }
        : options.body
      res.writeHead(options.status === undefined ? 200 : options.status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
      return
    }
    if (parsed.pathname === '/loki/api/v1/labels') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ status: 'success', data: ['app', 'level'] }))
      return
    }
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ status: 'error', error: 'no handler' }))
  })
  servers.push(server)
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', () => { resolve() }) })
  const port = (server.address() as AddressInfo).port
  return { url: 'http://127.0.0.1:' + String(port), requests }
}

interface FakeRoute {
  path: string
  handler: (req: never, res: never) => unknown
}

function harness(config: LoglensConfig, override?: (kind: SourceKind) => LogBackend | undefined) {
  let live = config
  const backendFor = override ?? ((kind: SourceKind): LogBackend | undefined => (kind === 'loki' ? createLokiBackend() : undefined))
  const route = makeRoutes({
    read: () => live,
    write: async (next) => {
      live = next
      return undefined
    },
    runQuery: (input) => runSearch({ config: () => live, backendFor }, input),
    runFields: (input) => runFields({ config: () => live, backendFor }, input),
    runFacets: (input) => runFacets({ config: () => live, backendFor }, input),
    dockerLoaded: () => false,
    backendFor,
  })[0] as unknown as FakeRoute

  return {
    state: () => live,
    async request(init: { method?: string; sub?: string; body?: unknown; rawBody?: string; origin?: string; cookie?: string; remoteAddress?: string }) {
      const text = init.rawBody !== undefined ? init.rawBody : (init.body === undefined ? '' : JSON.stringify(init.body))
      const headers: Record<string, string> = { host: '127.0.0.1:3085' }
      if (init.origin !== undefined) headers.origin = init.origin
      if (init.cookie !== undefined) headers.cookie = init.cookie
      const req = {
        method: init.method ?? 'POST',
        url: ROUTE_PREFIX + (init.sub ?? '/query'),
        headers,
        socket: { remoteAddress: init.remoteAddress ?? '127.0.0.1' },
        [Symbol.asyncIterator]: async function * iterate() {
          if (text !== '') yield Buffer.from(text, 'utf8')
        },
      }
      let status = 0
      let payload = ''
      const res = {
        writeHead(code: number) { status = code },
        end(body?: string) { payload = body ?? '' },
      }
      await route.handler(req as never, res as never)
      return { status, body: payload === '' ? undefined : JSON.parse(payload) as Record<string, unknown> }
    },
  }
}

const PROOF = { origin: 'http://127.0.0.1:3085' }

function configWith(url: string, enabled = true): LoglensConfig {
  return { enabled, targets: [{ id: 'loki', kind: 'loki', label: '假 Loki', url }] }
}

describe('围栏：/query 与 /fields 要同源证明', () => {
  it('/facets 同样要同源证明（它是替请求方打内网的入口之一）', async () => {
    const fake = await startFakeLoki()
    const harnessed = harness(configWith(fake.url))
    const blocked = await harnessed.request({ sub: '/facets', body: { by: 'app' } })
    expect(blocked.status).toBe(403)
    expect(fake.requests).toHaveLength(0)
    // 有证明就放行到执行层（Loki 没有聚合适配器 → 400 + 指路文案，而不是 404 未知路由）
    const allowed = await harnessed.request({ sub: '/facets', body: { by: 'app' }, ...PROOF })
    expect(allowed.status).toBe(400)
    expect(String(allowed.body?.error)).toContain('没有聚合适配器')
  })

  it('没有同源证明的 /query 403，而且**根本没打后端**', async () => {
    const fake = await startFakeLoki()
    const harnessed = harness(configWith(fake.url))
    const response = await harnessed.request({ body: { target: 'loki' } })
    expect(response.status).toBe(403)
    expect(String(response.body?.error)).toContain('缺少同源证明')
    expect(fake.requests).toHaveLength(0)
  })

  it('带同源证明就查到底：返回值形状与 agent 工具一致', async () => {
    const fake = await startFakeLoki()
    const harnessed = harness(configWith(fake.url))
    const response = await harnessed.request({ ...PROOF, body: { target: 'loki', q: '{}', from: 1_700_000_000_000, to: 1_700_000_060_000, limit: 5 } })
    expect(response.status).toBe(200)
    expect(response.body?.ok).toBe(true)
    expect(response.body?.returned).toBe(2)
    expect((response.body?.lines as Array<{ message: string }>).map((line) => line.message)).toEqual(['hello', 'older'])
    expect(response.body?.counts).toEqual({ returned: 2, scannedRows: 12, scannedBytes: 512, totalKnown: false })
    expect(response.body?.truncation).toEqual({ truncated: false, reasons: [] })
    expect(response.body?.window).toEqual({ from: 1_700_000_000_000, to: 1_700_000_060_000 })
    expect(response.body?.warnings).toEqual([])
    // 假 Loki 收到的是真的纳秒时间窗
    expect(fake.requests[0].params.get('start')).toBe('1700000000000000000')
    expect(fake.requests[0].params.get('limit')).toBe('5')
  })

  /*
   * 适配器自己说的话（`warnings`）必须到得了面板与 agent 工具（2026-10-18）。
   *
   * 真机那条路：ES 对分片级错误回 HTTP 200，原文（`Failed to parse query [...]`）只有适配器读得到。
   * 这一层要是把 `result.warnings` 吞了，界面上就只剩「已截断：部分分片失败」——
   * 「查询串写错了」与「分片真坏了」长得一模一样，而这两件事该找的人不同。
   */
  it('适配器的 warnings 会出现在 /query 的响应里（而且排在参数类 warning 前面）', async () => {
    const fake = await startFakeLoki()
    const config = configWith(fake.url)
    // 假后端：只说一句「分片原话」，其余照常
    const shardBackend: LogBackend = {
      id: 'loki',
      capabilities: () => ({ queryLanguage: 'logql', pagination: 'cursor', follow: false, aggregations: false } as BackendCaps),
      async query() {
        return {
          lines: [],
          counts: { returned: 0, totalKnown: false },
          truncation: { truncated: true, reasons: ['partial_shards'] as const },
          warnings: ['[分片] Failed to parse query [level:(ERROR]'],
        }
      },
    }
    const harnessed = harness(config, () => shardBackend)
    const response = await harnessed.request({ ...PROOF, body: { target: 'loki', q: '{}', from: 1_700_000_000_000, to: 1_700_000_060_000, limit: 5 } })
    expect(response.status).toBe(200)
    const warnings = response.body?.warnings as string[]
    expect(warnings).toContain('[分片] Failed to parse query [level:(ERROR]')
    // 截断理由照旧（原话是补充，不是替代）
    expect(response.body?.truncation).toEqual({ truncated: true, reasons: ['partial_shards'] })
  })

  it('GET /query 405；未知子路由 404；非法 JSON 400', async () => {
    const fake = await startFakeLoki()
    const harnessed = harness(configWith(fake.url))
    expect((await harnessed.request({ method: 'GET' })).status).toBe(405)
    expect((await harnessed.request({ sub: '/other', body: {} })).status).toBe(404)
    expect((await harnessed.request({ ...PROOF, rawBody: 'not json' })).status).toBe(400)
  })

  it('插件禁用时 /query 403（给出设置入口），/config 仍可读', async () => {
    const fake = await startFakeLoki()
    const harnessed = harness(configWith(fake.url, false))
    const blocked = await harnessed.request({ ...PROOF, body: { target: 'loki' } })
    expect(blocked.status).toBe(403)
    expect(String(blocked.body?.error)).toContain('插件已禁用')
    expect(fake.requests).toHaveLength(0)
    const config = await harnessed.request({ method: 'GET', sub: '/config' })
    expect(config.status).toBe(200)
    expect((config.body?.config as { enabled: boolean }).enabled).toBe(false)
  })

  it('非回环来源一律 403', async () => {
    const fake = await startFakeLoki()
    const harnessed = harness(configWith(fake.url))
    expect((await harnessed.request({ ...PROOF, remoteAddress: '10.0.0.5', body: {} })).status).toBe(403)
  })
})

describe('校验与错误：原话要能指导下一步', () => {
  it('找不到来源 / 没有适配器的错误原样回给面板', async () => {
    const fake = await startFakeLoki()
    const harnessed = harness(configWith(fake.url))
    const ghost = await harnessed.request({ ...PROOF, body: { target: 'ghost' } })
    expect(ghost.status).toBe(400)
    expect(String(ghost.body?.error)).toContain('找不到来源「ghost」')

    const docker = harness({ enabled: true, targets: [{ id: 'd', kind: 'docker', label: 'docker', url: '' }] })
    const hinted = await docker.request({ ...PROOF, body: { target: 'd' } })
    expect(hinted.status).toBe(400)
    expect(String(hinted.body?.error)).toContain('docker_logs_grep')
  })

  it('时间戳写成秒：400 且带原因（不是静默查 1970）', async () => {
    const fake = await startFakeLoki()
    const harnessed = harness(configWith(fake.url))
    const response = await harnessed.request({ ...PROOF, body: { target: 'loki', from: 1_700_000_000, to: 1_700_000_060_000 } })
    expect(response.status).toBe(400)
    expect(String(response.body?.error)).toContain('看起来是**秒**')
    expect(fake.requests).toHaveLength(0)
  })

  it('后端报错也走 400 + 原话（面板直接显示）', async () => {
    const fake = await startFakeLoki({ status: 500, body: { error: 'boom' } })
    const harnessed = harness(configWith(fake.url))
    const response = await harnessed.request({ ...PROOF, body: { target: 'loki', from: 1_700_000_000_000, to: 1_700_000_060_000 } })
    expect(response.status).toBe(400)
    expect(String(response.body?.error)).toContain('[loki] HTTP 500：boom')
  })

  it('/fields 同一条路：200 + 字段清单', async () => {
    const fake = await startFakeLoki()
    const harnessed = harness(configWith(fake.url))
    const response = await harnessed.request({ ...PROOF, sub: '/fields', body: { target: 'loki' } })
    expect(response.status).toBe(200)
    expect(response.body?.fields).toEqual([
      { name: 'app', kind: 'discovered' },
      { name: 'level', kind: 'discovered' },
    ])
    expect(fake.requests[0].path).toBe('/loki/api/v1/labels')
  })
})

/**
 * 面板画「时间分布」要靠宿主随 `/query` 下发的 `capabilities`（判定理由见 src/index.ts 的
 * capabilitiesOf）。这一节锁的是**那一格自述的来源**：它必须来自适配器，而不是面板按 kind 猜的
 * 第二份判据——猜的那份会在 Loki 接上指标查询那天静默过期，而它正是「不给一个永远报错的入口」
 * 所依赖的东西。
 */
describe('能力自述随 /query 下发', () => {
  const STUB_CAPS: BackendCaps = {
    queryLanguage: 'lucene',
    follow: false,
    aggregations: true,
    requiresTimeRange: true,
    fields: 'indexed',
    pagination: 'cursor',
    maxPageSize: 100,
    maxWindowMs: 60 * 60 * 1000,
  }

  function stubHarness(caps: Partial<BackendCaps>) {
    const stub: LogBackend = {
      id: 'stub',
      capabilities: () => ({ ...STUB_CAPS, ...caps }),
      fields: async () => ({ fields: [], total: 0, truncated: false }),
      query: async () => ({ lines: [], counts: { returned: 0, totalKnown: false }, truncation: { truncated: false, reasons: [] } }),
      health: async () => ({ ok: true }),
    }
    const config: LoglensConfig = { enabled: true, targets: [{ id: 'x1', kind: 'elasticsearch', label: 'stub', url: 'http://127.0.0.1:1' }] }
    return harness(config, () => stub)
  }

  it('带聚合能力的来源：响应里有 capabilities，聚合为真（面板据此去拉分布）', async () => {
    const response = await stubHarness({ aggregations: true, pagination: 'cursor' }).request({ ...PROOF, body: { target: 'x1', from: 1_700_000_000_000, to: 1_700_000_060_000 } })
    expect(response.status).toBe(200)
    expect(response.body?.capabilities).toEqual({ queryLanguage: 'lucene', pagination: 'cursor', follow: false, aggregations: true })
  })

  it('**值是适配器说了算**：同一个桩换成聚合为假，响应立刻跟着变（不是面板猜的）', async () => {
    const response = await stubHarness({ aggregations: false }).request({ ...PROOF, body: { target: 'x1', from: 1_700_000_000_000, to: 1_700_000_060_000 } })
    expect(response.status).toBe(200)
    expect(response.body?.capabilities).toEqual({ queryLanguage: 'lucene', pagination: 'cursor', follow: false, aggregations: false })
  })

  it('真实 Loki：聚合为假——面板据此**不画**分布、也不发那个请求', async () => {
    const fake = await startFakeLoki()
    const response = await harness(configWith(fake.url)).request({
      ...PROOF,
      body: { target: 'loki', from: 1_700_000_000_000, to: 1_700_000_060_000 },
    })
    expect(response.status).toBe(200)
    expect(response.body?.capabilities).toEqual({ queryLanguage: 'logql', pagination: 'cursor', follow: false, aggregations: false })
    // 只打了 query_range：没有「试一下聚合再说」那种白跑一趟的请求
    expect(fake.requests.map((item) => item.path)).toEqual(['/loki/api/v1/query_range'])
  })

  it('只有 /query 带这一位：/fields 与 /facets 的响应不带（它们没有消费者）', async () => {
    const fake = await startFakeLoki()
    const harnessed = harness(configWith(fake.url))
    const fields = await harnessed.request({ ...PROOF, sub: '/fields', body: { target: 'loki' } })
    expect(fields.status).toBe(200)
    expect('capabilities' in (fields.body ?? {})).toBe(false)
    const facets = await harnessed.request({ ...PROOF, sub: '/facets', body: { target: 'loki', by: 'app' } })
    expect(facets.status).toBe(400)
    expect('capabilities' in (facets.body ?? {})).toBe(false)
  })
})

/*
 * 结构化筛选的**接线**（2026-10-17 真机抓到的洞，第二十二刀）。
 *
 * 判据本身是对的：`normalizeQuery`、ES 适配器的 `filterClauses`、面板的芯片都按 filters 办事。
 * 漏掉的是中间那一层——`runSearch` 拼查询时没把它传下去，而 `runFacets` 传了。结果是
 * 「行」永远是全量：面板上条件芯片好好摆着、榜与分布也确实收窄了，只有最要紧的那份结果没收窄
 * （真机：`filters: {container.name: prometheus}` 发出去，回来的 100 行里躺着 6 个容器，
 * matched 也还是未筛的 26264）。
 *
 * 这类「判据写对了但没接上」的漏法，各层自己的单测一条都拦不住——只能从**真实入口**
 * （`/query` 路由）走一遍，看它到底有没有到适配器手里。所以这两条断言的是「到没到」，
 * 不是「拼得对不对」（后者已经有用例）。
 */
describe('结构化筛选：从 /query 路由进去，真能到适配器手里', () => {
  const CAPS: BackendCaps = {
    queryLanguage: 'lucene',
    follow: false,
    aggregations: true,
    requiresTimeRange: true,
    fields: 'indexed',
    pagination: 'cursor',
    maxPageSize: 100,
    maxWindowMs: 60 * 60 * 1000,
  }

  it('桩适配器收到了 filters（没有被某一层悄悄丢掉）', async () => {
    const seen: Array<Record<string, string> | undefined> = []
    const stub: LogBackend = {
      id: 'stub',
      capabilities: () => CAPS,
      fields: async () => ({ fields: [], total: 0, truncated: false }),
      query: async (query) => {
        seen.push(query.filters)
        return { lines: [], counts: { returned: 0, totalKnown: false }, truncation: { truncated: false, reasons: [] } }
      },
      health: async () => ({ ok: true }),
    }
    const config: LoglensConfig = { enabled: true, targets: [{ id: 'x1', kind: 'elasticsearch', label: 'stub', url: 'http://127.0.0.1:1' }] }
    const response = await harness(config, () => stub).request({
      ...PROOF,
      body: { target: 'x1', from: 1_700_000_000_000, to: 1_700_000_060_000, filters: { 'container.name': 'prometheus' } },
    })
    expect(response.status).toBe(200)
    expect(seen).toEqual([{ 'container.name': 'prometheus' }])
  })

  it('Loki 带着 filters 进来会**报错**，而不是静默给全量', async () => {
    const fake = await startFakeLoki()
    const response = await harness(configWith(fake.url)).request({
      ...PROOF,
      body: { target: 'loki', from: 1_700_000_000_000, to: 1_700_000_060_000, filters: { app: 'demo' } },
    })
    expect(response.status).toBe(400)
    expect(String(response.body?.error)).toContain('暂不支持结构化 filters')
    // 适配器是**在打请求之前**就拒的：一个字节都不该发到 Loki
    expect(fake.requests).toEqual([])
  })
})
