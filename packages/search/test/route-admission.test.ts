/**
 * @hyzyn/dsh-search — 路由准入的**真 cordis** 回归测试。
 *
 * 为什么不能用冒烟里的假 ctx：真 cordis 的插件 ctx 上，读一个**没有 `inject` 的
 * 服务名**（`ctx.connection` 这种属性读）会抛 `cannot get property "connection"
 * without inject`。假 ctx 没有这条语义，于是「旧宿主没有 connection 服务 → 回落到
 * loopback 围栏」这条分支会**看着通过、在真宿主上每条请求都抛**——PR #21 的第一版
 * 就是这样：`getService()` 里 `ctx.get()` 拿到 undefined 后回落到属性读，旧宿主上
 * 每条 `/api/dsh-search/*` 直接炸。
 *
 * 这里把三条判据钉在真 cordis 上：
 *   1. 本机回环：维持 loopback + 同源口径，**不惊动**宿主鉴权（真机脚本 / curl 靠它）；
 *   2. 非本机 + 宿主有 `requestRejection`：放行 / 401 / 403 原样透传；
 *   3. 宿主没有 connection，或服务上没有 `requestRejection`：回落旧围栏 403，**不抛**。
 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { apply, inject, name } from '../src/index.js'

type Route = {
  kind: string
  path: string
  handler: (req: unknown, res: unknown) => Promise<void>
}

const QUERY_PATH = '/api/dsh-search/query'
const CATALOG_PATH = '/api/dsh-search/catalog'

/** 记录 writeHead / end 的假响应。 */
function makeRes(): { status: number; body: unknown; writeHead: (status: number) => void; end: (text?: string) => void } {
  const res = {
    status: 0,
    body: undefined as unknown,
    writeHead(status: number) {
      res.status = status
    },
    end(text?: string) {
      try {
        res.body = text === undefined ? undefined : JSON.parse(text)
      } catch {
        res.body = text
      }
    },
  }
  return res
}

/** 默认：回环来源、Host 本机、无 Origin（裸 curl / 真机脚本的形态）。 */
function makeReq(overrides: {
  headers?: Record<string, string>
  remoteAddress?: string
  method?: string
  path?: string
} = {}): unknown {
  return {
    method: overrides.method ?? 'GET',
    url: (overrides.path ?? QUERY_PATH) + '?q=',
    headers: { host: '127.0.0.1:3080', ...(overrides.headers ?? {}) },
    socket: { remoteAddress: overrides.remoteAddress ?? '127.0.0.1' },
    // 空 q 会在鉴权之后短路，这里用不到 close 监听；两个方法给出最小形状
    once() {},
    removeListener() {},
  }
}

/** 真 WebServer 服务的最小替身：路由注册进来，连接信息按本机 http 给。 */
function makeWebServer(routes: Route[]): unknown {
  return {
    host: '127.0.0.1',
    protocol: 'http:',
    register(route: Route) {
      routes.push(route)
      return () => {}
    },
    on() {},
    waterfall() {},
  }
}

const mounted: Array<{ stop?: () => unknown }> = []

/**
 * 用真 cordis 把插件挂起来（与 loader 相同：`ctx.plugin()` 建独立 fiber）。
 * @param connection - 传了就 `provide('connection', …)`；不传则该服务整个不存在（旧宿主）。
 */
async function mount(connection?: unknown): Promise<{
  routes: Route[]
  call: (request: unknown, path?: string) => Promise<{ status: number; body: unknown }>
}> {
  const routes: Route[] = []
  const ctx = new Context()
  ctx.provide('webServer', makeWebServer(routes) as never)
  if (connection !== undefined) ctx.provide('connection', connection as never)
  await ctx.plugin({ name, inject, apply })
  mounted.push(ctx)

  const call = async (request: unknown, path = QUERY_PATH) => {
    const route = routes.find((item) => item.path === path)
    if (route === undefined) throw new Error(`路由未注册：${path}（已注册 ${routes.map((r) => r.path).join(', ')}）`)
    const res = makeRes()
    await route.handler(request, res)
    return res
  }
  return { routes, call }
}

/** 非本机来源 + trusted host + 同源 Origin（反代后面的浏览器）。 */
const proxied = { remoteAddress: '172.25.0.9', headers: { host: 'dsh.example.com', origin: 'https://dsh.example.com' } }

describe('路由准入（真 cordis）', () => {
  afterEach(async () => {
    for (const ctx of mounted.splice(0)) await ctx.stop?.()
  })

  it('本机回环：放行且不惊动宿主鉴权（真机脚本 / 裸 curl 靠这条）', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const seen: unknown[] = []
      const { call } = await mount({ requestRejection: (req: unknown) => (seen.push(req), undefined) })
      const res = await call(makeReq())
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ok: true, query: '', sessions: [], prompts: [], tools: [], panels: [] })
      expect(seen).toHaveLength(0)
    } finally {
      spy.mockRestore()
    }
  })

  it('非本机 + 宿主 requestRejection：放行 / 401 / 403 原样透传', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const seen: Array<{ headers: Record<string, string> }> = []
      const connection = {
        requestRejection: (req: { headers: Record<string, string> }) => {
          seen.push(req)
          if (req.headers.host !== 'dsh.example.com') return 403
          return req.headers.cookie === 'dsh-auth=ok' ? undefined : 401
        },
      }
      const { call } = await mount(connection)

      const admitted = await call(makeReq({ ...proxied, headers: { ...proxied.headers, cookie: 'dsh-auth=ok' } }))
      expect(admitted.status).toBe(200)
      // 请求对象原样转交（宿主自己读 headers 判 Host/Origin/cookie）
      expect(seen.at(-1)?.headers.host).toBe('dsh.example.com')

      const noSession = await call(makeReq(proxied))
      expect(noSession.status).toBe(401)
      expect(noSession.body).toEqual({ error: 'unauthorized' })

      const hostile = await call(makeReq({ headers: { host: 'evil.example', cookie: 'dsh-auth=ok' }, remoteAddress: '172.25.0.9' }))
      expect(hostile.status).toBe(403)
      expect(hostile.body).toEqual({ error: 'forbidden' })
    } finally {
      spy.mockRestore()
    }
  })

  it('宿主没有 connection 服务（旧宿主）：非本机回落 403 loopback-only，**不抛**', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const { call } = await mount()
      const remote = await call(makeReq(proxied))
      expect(remote.status).toBe(403)
      expect(remote.body).toEqual({ error: 'forbidden: loopback-only' })
      expect((await call(makeReq())).status).toBe(200)
    } finally {
      spy.mockRestore()
    }
  })

  it('宿主有 connection 但没有 requestRejection（旧方法集）：同样回落、不抛', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const { call } = await mount({})
      const remote = await call(makeReq(proxied))
      expect(remote.status).toBe(403)
      expect(remote.body).toEqual({ error: 'forbidden: loopback-only' })
    } finally {
      spy.mockRestore()
    }
  })

  it('鉴权通过后方法非 GET → 405；目录路由走同一条准入', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const connection = { requestRejection: (req: { headers: Record<string, string> }) => (req.headers.cookie === 'dsh-auth=ok' ? undefined : 401) }
      const { call } = await mount(connection)
      const session = { ...proxied, headers: { ...proxied.headers, cookie: 'dsh-auth=ok' } }
      expect((await call(makeReq({ ...session, method: 'POST' }))).status).toBe(405)
      expect((await call(makeReq({ ...proxied, path: CATALOG_PATH }))).status).toBe(401)
      expect((await call(makeReq({ ...session, path: CATALOG_PATH }))).status).toBe(200)
    } finally {
      spy.mockRestore()
    }
  })
})
