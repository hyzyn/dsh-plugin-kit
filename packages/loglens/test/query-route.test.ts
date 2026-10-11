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
import type { LogBackend } from '../src/backends/types.js'
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

function harness(config: LoglensConfig) {
  let live = config
  const backendFor = (kind: SourceKind): LogBackend | undefined => (kind === 'loki' ? createLokiBackend() : undefined)
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
