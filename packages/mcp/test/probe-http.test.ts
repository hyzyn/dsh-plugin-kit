/**
 * @hyzyn/dsh-mcp — 连接测试的两条「别再谎报」判据（2026-10-22 真机复核）。
 *
 * 现场（真机、Jenkins MCP）：桌面版 profile 里 `JENKINS_USER` / `JENKINS_AUTH` 没有注入，
 * 认证头被拼成 `Basic base64("undefined:undefined")`；服务器回 **401**，而探针把 401 当成
 * 「POST 没直接给响应」，转去开 GET SSE 流。Jenkins 对那条 GET 同样回 401（空 body），
 * 于是探针最后报 **「SSE 流已结束」**——真实原因是认证失败，报出来的却是一句与认证无关的
 * 传输层噪声。同一次复核还发现：404/500 也走同一条兜底，报的是同一句谎。
 *
 * 本文件钉两件事：
 *   1. 401/403 当场定性为认证失败（带状态码），其它 4xx/5xx 也带状态码报出来；
 *      任何一条都**不允许**再出现「SSE 流已结束」；
 *   2. 求值后漏出 undefined 的凭据头要在**发请求之前**就点名缺哪个环境变量——
 *      判据必须能抓住 base64 藏起来的那种形态（复核实测：`includes('undefined')` 抓不到），
 *      同时不能误伤 `process.env.X ?? 'fallback'` 这类合法兜底。
 *
 * 用例用**真 HTTP 服务器**（node:http）而不是 fetch 桩：谎报恰恰来自「401 之后继续发 GET」
 * 这一串真实交互，桩掉 fetch 就把要验的东西桩没了。
 */
import { createServer, type Server, type ServerResponse } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { testServer } from '../src/index.js'

interface Fixture {
  url: string
  close: () => Promise<void>
  /** 收到的请求（断言「根本没发请求」用）。 */
  requests: Array<{ method: string | undefined }>
}

const open: Fixture[] = []

afterEach(async () => {
  while (open.length > 0) await open.pop()!.close()
})

/** 起一个一次性 HTTP 服务器；`handler` 拿到 (req, res, body)。 */
async function startFixture(handler: (method: string | undefined, res: ServerResponse, body: string) => void): Promise<Fixture> {
  const requests: Fixture['requests'] = []
  const server: Server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      requests.push({ method: req.method })
      handler(req.method, res, body)
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  const fixture: Fixture = {
    url: 'http://127.0.0.1:' + String(port) + '/mcp',
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  }
  open.push(fixture)
  return fixture
}

/** JSON-RPC 应答（initialize / tools/list），与核心 mcp-client 的期望一致。 */
function jsonRpcReply(message: { method?: string; id?: unknown }): Record<string, unknown> | undefined {
  if (message.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'probe-fixture', version: '1.0.0' },
      },
    }
  }
  if (message.method === 'tools/list') {
    return { jsonrpc: '2.0', id: message.id, result: { tools: [{ name: 'probe_echo', description: '回显' }] } }
  }
  return message.id === undefined ? undefined : { jsonrpc: '2.0', id: message.id, result: {} }
}

/** 直接回 JSON 的合规服务器（正常路径不回归）。 */
function startJsonServer(headers: Record<string, string> = {}): Promise<Fixture> {
  return startFixture((method, res, body) => {
    if (method !== 'POST') {
      res.writeHead(405, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'GET not supported' }))
      return
    }
    const reply = jsonRpcReply(JSON.parse(body) as { method?: string; id?: unknown })
    for (const [key, value] of Object.entries(headers)) res.setHeader(key, value)
    if (reply === undefined) {
      res.writeHead(202)
      res.end()
      return
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(reply))
  })
}

/** 202 + GET SSE 的服务器：POST 只收消息，响应经 GET 流下发（probeHttp 的兜底路径）。 */
function startSseServer(): Promise<Fixture> {
  const pending: string[] = []
  let stream: ServerResponse | undefined
  const flush = () => {
    if (stream === undefined) return
    while (pending.length > 0) stream.write('data: ' + pending.shift()! + '\n\n')
  }
  return startFixture((method, res, body) => {
    if (method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'mcp-session-id': 'fixture-session' })
      stream = res
      flush()
      return
    }
    const reply = jsonRpcReply(JSON.parse(body) as { method?: string; id?: unknown })
    if (reply !== undefined) {
      pending.push(JSON.stringify(reply))
      flush()
    }
    res.writeHead(202)
    res.end()
  })
}

const httpConfig = (url: string, headers?: Record<string, string>) => ({
  serverName: 'fixture',
  transport: 'streamable-http' as const,
  url,
  ...(headers === undefined ? {} : { headers }),
})

describe('探针不谎报：HTTP 错误状态必须带状态码报出来', () => {
  it('POST 401（Jenkins 形态的 JSON body）→ 认证失败(HTTP 401)，且不再出现「SSE 流已结束」', async () => {
    const fixture = await startFixture((method, res) => {
      res.writeHead(401, { 'content-type': 'application/json', 'www-authenticate': 'Basic realm="Jenkins"' })
      res.end(method === 'POST' ? JSON.stringify({ servlet: 'Stapler', message: 'Unauthorized', status: '401' }) : '')
    })
    const result = await testServer(httpConfig(fixture.url))
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/认证失败\(HTTP 401\)/)
    expect(result.error).toContain('Basic realm="Jenkins"')
    expect(result.error).not.toContain('SSE 流已结束')
    // 401 在 POST 就收口：不允许再补一条 GET（旧实现正是靠那条 GET 把 401 变成「流已结束」）。
    expect(fixture.requests.map((entry) => entry.method)).toStrictEqual(['POST'])
  })

  it('POST 403 → 认证失败(HTTP 403)', async () => {
    const fixture = await startFixture((method, res) => {
      res.writeHead(403, { 'content-type': 'text/plain' })
      res.end(method === 'POST' ? 'forbidden' : '')
    })
    const result = await testServer(httpConfig(fixture.url))
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/认证失败\(HTTP 403\)/)
    expect(result.error).not.toContain('SSE 流已结束')
  })

  it('POST 404 → 报 HTTP 404（不复核前是「SSE 流已结束」）', async () => {
    const fixture = await startFixture((method, res) => {
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end(method === 'POST' ? JSON.stringify({ servlet: 'Stapler', message: 'Not Found' }) : '')
    })
    const result = await testServer(httpConfig(fixture.url))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('HTTP 404')
    expect(result.error).not.toContain('SSE 流已结束')
  })

  it('POST 202 之后 GET 返 500 → 报「未提供 SSE 流（GET HTTP 500）」', async () => {
    const fixture = await startFixture((method, res) => {
      if (method === 'GET') {
        res.writeHead(500, { 'content-type': 'text/plain' })
        res.end('boom')
        return
      }
      res.writeHead(202)
      res.end()
    })
    const result = await testServer(httpConfig(fixture.url))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('GET HTTP 500')
  })
})

describe('凭据未注入的一眼定位', () => {
  it('base64 藏起来的 undefined 也能点名（复核实测：includes("undefined") 抓不到这种）', async () => {
    delete process.env.DSH_PROBE_MISSING_USER
    delete process.env.DSH_PROBE_MISSING_AUTH
    const fixture = await startJsonServer()
    const expression =
      "'Basic ' + Buffer.from(process.env.DSH_PROBE_MISSING_USER + ':' + process.env.DSH_PROBE_MISSING_AUTH).toString('base64')"
    const result = await testServer(httpConfig(fixture.url, { Authorization: 'js:' + expression }))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('DSH_PROBE_MISSING_USER')
    expect(result.error).toContain('DSH_PROBE_MISSING_AUTH')
    expect(result.error).toContain('未注入')
    // 发请求之前就判定：不该白白打一次服务端。
    expect(fixture.requests).toStrictEqual([])
    // 密文本身不进错误文案（那是凭据）。
    expect(result.error).not.toContain('dW5kZWZpbmVk')
  })

  it('未编码拼接的 undefined 同样点名', async () => {
    delete process.env.DSH_PROBE_MISSING_TOKEN
    const fixture = await startJsonServer()
    const result = await testServer(
      httpConfig(fixture.url, { 'X-Token': "js:'Bearer ' + process.env.DSH_PROBE_MISSING_TOKEN" }),
    )
    expect(result.ok).toBe(false)
    expect(result.error).toContain('DSH_PROBE_MISSING_TOKEN')
    expect(fixture.requests).toStrictEqual([])
  })

  it('反例：合法的兜底写法不误伤（process.env.X ?? "fallback"）', async () => {
    delete process.env.DSH_PROBE_MISSING_OPTIONAL
    const fixture = await startJsonServer()
    const result = await testServer(
      httpConfig(fixture.url, { 'X-Optional': "js:process.env.DSH_PROBE_MISSING_OPTIONAL ?? 'fallback'" }),
    )
    expect(result.ok).toBe(true)
    expect(result.toolsCount).toBe(1)
  })

  it('反例：引用都已注入时不拦（裸引用取到值就走正常流程）', async () => {
    process.env.DSH_PROBE_PRESENT_KEY = 'present-value'
    try {
      const fixture = await startJsonServer()
      const result = await testServer(httpConfig(fixture.url, { 'X-Present': 'js:process.env.DSH_PROBE_PRESENT_KEY' }))
      expect(result.ok).toBe(true)
    } finally {
      delete process.env.DSH_PROBE_PRESENT_KEY
    }
  })

  it('stdio 的 env 求值自检返回 ok:false 的**结果**而不是抛异常（复核修掉的 TDZ）', async () => {
    delete process.env.DSH_PROBE_MISSING_ENV
    // 旧实现把这个自检放在 Promise executor 里、且在 timer 声明之前调 finish()，
    // 会 ReferenceError → Promise reject → 路由 500。这里断言它是 resolved 的结果。
    const result = await testServer({
      serverName: 'fixture',
      transport: 'stdio',
      command: 'node',
      args: ['-e', 'process.exit(0)'],
      env: { TOKEN: "js:'prefix-' + process.env.DSH_PROBE_MISSING_ENV" },
    })
    expect(result.ok).toBe(false)
    expect(result.transport).toBe('stdio')
    expect(result.error).toContain('DSH_PROBE_MISSING_ENV')
  })
})

describe('正常路径不回归', () => {
  it('POST 直接回 JSON：initialize + tools/list 都拿到', async () => {
    const fixture = await startJsonServer()
    const result = await testServer(httpConfig(fixture.url))
    expect(result.ok).toBe(true)
    expect(result.protocolVersion).toBe('2025-03-26')
    expect(result.toolsCount).toBe(1)
    expect(result.tools?.[0]?.name).toBe('probe_echo')
  })

  it('202 + GET SSE 兜底路径照旧可用（新状态码判据不得误伤它）', async () => {
    const fixture = await startSseServer()
    const result = await testServer(httpConfig(fixture.url))
    expect(result.ok).toBe(true)
    expect(result.toolsCount).toBe(1)
  })
})
