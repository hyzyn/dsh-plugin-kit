/**
 * 验证用夹具：一个最小的 MCP **stdio** 服务器（JSON-RPC over stdin/stdout）。
 *
 * 用途：给 `@hyzyn/dsh-mcp` 的「保存 → 热加载 → 工具真的可用」这条链路当对端。
 * 与 `verify-mcp-http.mjs` 里的内联服务器同类，但这个是 stdio + 会把**每一次
 * `tools/call`** 追加到 `--log` 指定的文件 —— 于是「工具到底被调用过没有」有硬证据，
 * 而不是靠推断。
 *
 * 用法（由验证脚本拉起，一般不单独跑）：
 *   node scripts/fixtures/mcp-probe-server.mjs --log /tmp/xxx.jsonl
 */
import { appendFileSync } from 'node:fs'

const argv = process.argv.slice(2)
const flag = (name) => {
  const index = argv.indexOf(name)
  return index === -1 ? undefined : argv[index + 1]
}
const logPath = flag('--log')

const TOOLS = [
  {
    name: 'probe_echo',
    description: '把 text 原样回显，前缀 PROBE-ECHO。',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  },
  {
    name: 'probe_add',
    description: '返回 a 与 b 的和。',
    inputSchema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } }, required: ['a', 'b'] },
  },
]

const log = (entry) => {
  if (logPath === undefined) return
  try {
    appendFileSync(logPath, JSON.stringify({ at: Date.now(), ...entry }) + '\n')
  } catch {
    /* 日志写不进去不影响协议 */
  }
}

const send = (message) => {
  process.stdout.write(JSON.stringify(message) + '\n')
}

const handle = (message) => {
  const { id, method, params } = message
  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: typeof params?.protocolVersion === 'string' ? params.protocolVersion : '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'probe-server', version: '9.9.9' },
      },
    }
  }
  if (method === 'notifications/initialized' || id === undefined) return undefined
  if (method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: TOOLS } }
  if (method === 'tools/call') {
    const name = params?.name
    const args = params?.arguments ?? {}
    log({ type: 'tools/call', name, args })
    if (name === 'probe_echo') {
      return {
        jsonrpc: '2.0',
        id,
        result: { content: [{ type: 'text', text: `PROBE-ECHO:${String(args.text ?? '')}` }] },
      }
    }
    if (name === 'probe_add') {
      const sum = Number(args.a ?? 0) + Number(args.b ?? 0)
      return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `PROBE-SUM:${String(sum)}` }] } }
    }
    return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'unknown tool' }], isError: true } }
  }
  if (id === undefined) return undefined
  return { jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${String(method)}` } }
}

let buffer = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  for (;;) {
    const index = buffer.indexOf('\n')
    if (index === -1) break
    const line = buffer.slice(0, index).trim()
    buffer = buffer.slice(index + 1)
    if (line === '') continue
    let message
    try {
      message = JSON.parse(line)
    } catch {
      continue
    }
    log({ type: 'request', method: message.method ?? null, id: message.id ?? null })
    const response = handle(message)
    if (response !== undefined) send(response)
  }
})
process.stdin.on('end', () => process.exit(0))
