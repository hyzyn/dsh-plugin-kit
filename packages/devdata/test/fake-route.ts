/**
 * **HTTP 路由夹具**（`/api/dsh-devdata/*` 那几条路由的假 req / res）。
 *
 * 从 `config-route.test.ts` 里搬出来的：面板那三条路由（`/config` / `/query` / `/keys` / `/key`）
 * 各写一份「极简 req / res」必然漂——它们连**同一个** `webServer.register` 契约，夹具也该只有一份。
 */

export interface FakeRouteRes {
  status: number
  headers: Record<string, string>
  body: string | undefined
  writeHead(status: number, headers?: Record<string, string>): void
  end(body?: string): void
}

export function makeRes(): FakeRouteRes {
  const res: FakeRouteRes = {
    status: 0,
    headers: {},
    body: undefined,
    writeHead(status, headers) {
      res.status = status
      res.headers = headers ?? {}
    },
    end(body) {
      if (body !== undefined) res.body = body
    },
  }
  return res
}

export interface RequestOptions {
  method?: string
  body?: unknown
  raw?: string
  remoteAddress?: string
  host?: string
  headers?: Record<string, string>
  path?: string
}

/** 一个请求（缺省是「浏览器同源、回环」那种，即围栏应放行的那一族）。 */
export function makeReq(options: RequestOptions = {}): unknown {
  const payload = options.raw ?? (options.body === undefined ? '' : JSON.stringify(options.body))
  const chunks = payload === '' ? [] : [Buffer.from(payload)]
  return {
    method: options.method ?? 'GET',
    url: options.path ?? '/api/dsh-devdata/config',
    headers: {
      host: options.host ?? '127.0.0.1:3080',
      'sec-fetch-site': 'same-origin',
      ...(options.headers ?? {}),
    },
    socket: { remoteAddress: options.remoteAddress ?? '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  }
}

/** 假宿主的 `routes`（只要能按路径取到处理函数就够了）。 */
export type RouteHostLike = { routes: Map<string, { handler: (req: never, res: never) => Promise<void> }> }

export interface CallResult {
  status: number
  json: Record<string, unknown> | undefined
}

export async function callRoute(host: RouteHostLike, path: string, options: RequestOptions = {}): Promise<CallResult> {
  const route = host.routes.get(path)
  if (route === undefined) throw new Error(`未注册 ${path} 路由`)
  const res = makeRes()
  await route.handler(makeReq({ ...options, path }) as never, res as never)
  return { status: res.status, json: res.body === undefined ? undefined : (JSON.parse(res.body) as Record<string, unknown>) }
}
