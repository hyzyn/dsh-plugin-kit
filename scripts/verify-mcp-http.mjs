/**
 * `@hyzyn/dsh-mcp` 的 streamable-http 传输验证：起一个**合规的最小 MCP HTTP 服务器**
 * （三种响应模式），再用插件自己的「连接测试」路由打它。
 *
 * 为什么单独做这件事：这个传输是**支持但从没被跑过**的一条路（默认用的是 stdio）。
 * 按「缺陷集中在默认关闭 + 自己吞错误」的规律，它是最可疑的一处 —— 而且它有自带的自测
 * 入口（`POST /api/dsh-mcp/test`），成本很低。
 *
 * 三种模式都取自 MCP 规范里真实存在的服务器行为：
 *   json       POST 直接回 `application/json` 的 JSON-RPC 响应，GET 回 405
 *   sse-post   POST 回 `text/event-stream`（响应体是 SSE），GET 回 405
 *   get-sse    POST 回 202 Accepted，响应经 GET 的 SSE 流下发（session id 关联）
 *
 * 用法（在跑着宿主的机器上）：
 *   node scripts/verify-mcp-http.mjs --host http://127.0.0.1:3082 [--report out.json]
 */
import { createServer } from 'node:http'
import { writeFileSync } from 'node:fs'

const argv = process.argv.slice(2)
const flag = (name) => {
  const index = argv.indexOf(name)
  return index === -1 ? undefined : argv[index + 1]
}
const hostUrl = flag('--host') ?? 'http://127.0.0.1:3082'
const reportPath = flag('--report')

const results = []
const record = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '\n      ' + detail : ''}`)
}

const SERVER_INFO = { name: 'probe-mcp', version: '9.9.9' }
const TOOLS = [
  { name: 'probe_echo', description: '回显文本', inputSchema: { type: 'object', properties: { text: { type: 'string' } } } },
  { name: 'probe_add', description: '两数相加', inputSchema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } } } },
]

/** 起一个最小 MCP streamable-http 服务器；返回 { port, close, seen }。 */
function startServer(mode) {
  const seen = { requests: [], sseGets: 0 }
  const sessionId = 'probe-session-1'
  /** get-sse 模式下挂在 GET 流上的响应队列。 */
  const pending = []
  const sseClients = []

  const jsonRpc = (message) => {
    const id = message.id
    if (message.method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: typeof message.params?.protocolVersion === 'string' ? message.params.protocolVersion : '2025-03-26',
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        },
      }
    }
    if (message.method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: TOOLS } }
    if (id === undefined) return undefined // 通知
    return { jsonrpc: '2.0', id, result: {} }
  }

  const server = createServer((req, res) => {
    if (req.method === 'GET') {
      if (mode !== 'get-sse') {
        seen.sseGets += 1
        res.writeHead(405, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'GET not supported' }))
        return
      }
      seen.sseGets += 1
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'mcp-session-id': sessionId })
      sseClients.push(res)
      // 建流时把已经排队的响应补发出去
      while (pending.length > 0) res.write(`data: ${JSON.stringify(pending.shift())}\n\n`)
      return
    }
    if (req.method !== 'POST') {
      res.writeHead(405)
      res.end()
      return
    }
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      let message = {}
      try {
        message = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch {
        /* 留空消息，下面按通知处理 */
      }
      seen.requests.push({ method: message.method ?? null, id: message.id ?? null })
      const response = jsonRpc(message)
      if (response === undefined) {
        res.writeHead(202, { 'mcp-session-id': sessionId })
        res.end()
        return
      }
      if (mode === 'json') {
        res.writeHead(200, { 'content-type': 'application/json', 'mcp-session-id': sessionId })
        res.end(JSON.stringify(response))
        return
      }
      if (mode === 'sse-post') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'mcp-session-id': sessionId })
        res.end(`event: message\ndata: ${JSON.stringify(response)}\n\n`)
        return
      }
      // get-sse：202 + 走 GET 流
      if (sseClients.length > 0) {
        sseClients[0].write(`data: ${JSON.stringify(response)}\n\n`)
      } else {
        pending.push(response)
      }
      res.writeHead(202, { 'mcp-session-id': sessionId })
      res.end()
    })
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        seen,
        close: () => {
          for (const client of sseClients) {
            try {
              client.end()
            } catch {
              /* 已关 */
            }
          }
          server.close()
        },
      })
    })
  })
}

const callTest = async (config) => {
  const response = await fetch(`${hostUrl}/api/dsh-mcp/test`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ config }),
  })
  const text = await response.text()
  try {
    return { status: response.status, body: JSON.parse(text) }
  } catch {
    return { status: response.status, body: undefined, text }
  }
}

console.log('# dsh-mcp 的 streamable-http 传输验证')
console.log(`# node ${process.version} / 宿主 ${hostUrl}\n`)

const MODES = [
  ['json', 'POST 直回 application/json（GET 不支持）'],
  ['sse-post', 'POST 回 text/event-stream（GET 不支持）'],
  ['get-sse', 'POST 回 202，响应经 GET 的 SSE 流下发'],
]

for (const [mode, label] of MODES) {
  const server = await startServer(mode)
  const url = `http://127.0.0.1:${String(server.port)}/mcp`
  const { status, body } = await callTest({ serverName: `probe-${mode}`, transport: 'streamable-http', url })
  const result = body?.result
  record(
    `H1 streamable-http（${mode}）：${label}`,
    status === 200 && result?.ok === true && (result?.toolsCount ?? 0) >= 1,
    `status=${status} ok=${String(result?.ok)} tools=${String(result?.toolsCount)} serverInfo=${JSON.stringify(result?.serverInfo ?? null)} 服务器收到的 JSON-RPC：${JSON.stringify(server.seen.requests)}${result?.error !== undefined ? ` error=${JSON.stringify(String(result.error).slice(0, 200))}` : ''}`,
  )
  // 服务器侧确实收到了 initialize + tools/list（排除「假成功」）
  const methods = server.seen.requests.map((row) => row.method)
  record(
    `H2 streamable-http（${mode}）：服务器真的收到了 initialize 与 tools/list`,
    methods.includes('initialize') && methods.includes('tools/list'),
    JSON.stringify(server.seen.requests),
  )
  server.close()
}

// 反向：一个「不支持 GET 且 POST 直回 JSON」的服务器不该被误判成失败（上面 json 模式已覆盖）；
// 这里补一个「URL 打不通」的失败路径，确认错误是可读的。
{
  const { status, body } = await callTest({ serverName: 'probe-dead', transport: 'streamable-http', url: 'http://127.0.0.1:18999/mcp' })
  const error = String(body?.result?.error ?? '')
  record(
    'H3 streamable-http：URL 打不通时给出可读失败（不是挂死）',
    status === 200 && body?.result?.ok === false && error.length > 0,
    `ok=${String(body?.result?.ok)} error=${JSON.stringify(error.slice(0, 200))}`,
  )
}

const failed = results.filter((item) => item.ok !== true)
console.log(`\n# 汇总：PASS ${results.filter((r) => r.ok === true).length} / FAIL ${failed.length}`)
if (failed.length > 0) {
  console.log('# 失败项：')
  for (const item of failed) console.log(`  - ${item.name}${item.detail ? `：${item.detail.split('\n')[0]}` : ''}`)
}
if (reportPath !== undefined) {
  writeFileSync(reportPath, `${JSON.stringify({ hostUrl, results }, null, 2)}\n`)
  console.log(`# 报告：${reportPath}`)
}
process.exit(failed.length === 0 ? 0 : 1)
