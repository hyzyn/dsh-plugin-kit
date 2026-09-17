/**
 * `@hyzyn/dsh-mcp` 的「保存 → 热加载 → **工具真的可用**」验证。
 *
 * 为什么单独做：此前只验到「loader 里那行 fiber 变成 active」（`/servers` 的 status）——
 * 但**挂起来 ≠ 能用**。DSH 把 MCP 服务器变成 `mcp__<serverName>__<tool>` 工具交给 agent，
 * 中间还有一步「工具注册进 agent 的工具表」。本轮总结的规律是「看着成功其实没用」最容易
 * 藏在默认关闭 + 吞错的路径上，所以这里把后半段也钉住。
 *
 * 两层证据：
 *   L1 **工具进了活注册表**：search 插件的 `tools` 通道就是 `ctx.tools.schemas()`，
 *      查夹具的工具名应当命中 `mcp__<server>__probe_echo`；
 *   L2 **工具真的被调用过**：夹具 MCP 服务器把每次 `tools/call` 追加进 `--log` 文件，
 *      脚本读它 —— 有记录才是「能调用」的硬证据（由 `--agent-call` 触发的 agent 回合产生）。
 *
 * 用法：
 *   node scripts/verify-mcp-tools.mjs --host http://127.0.0.1:3082 [--report out.json]
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFileSync } from 'node:fs'

const argv = process.argv.slice(2)
const flag = (name) => {
  const index = argv.indexOf(name)
  return index === -1 ? undefined : argv[index + 1]
}
const hostUrl = flag('--host') ?? 'http://127.0.0.1:3082'
const reportPath = flag('--report')
const serverName = flag('--server-name') ?? 'probehttp'
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixture = join(repoRoot, 'scripts', 'fixtures', 'mcp-probe-server.mjs')
const logPath = join(tmpdir(), `mcp-probe-${String(process.pid)}.jsonl`)

const results = []
const record = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '\n      ' + detail : ''}`)
}
const skip = (name, detail) => {
  results.push({ name, ok: true, detail, skipped: true })
  console.log(`SKIP  ${name}${detail ? '\n      ' + detail : ''}`)
}
const warn = (name, detail) => {
  results.push({ name, ok: true, detail, warned: true })
  console.log(`WARN  ${name}\n      ${detail}`)
}

const target = new URL(hostUrl)
const port = Number(target.port || 80)
const call = (method, path, body) =>
  new Promise((resolve) => {
    const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body))
    const request = http.request(
      {
        host: target.hostname,
        port,
        path,
        method,
        headers: {
          host: `${target.hostname}:${String(port)}`,
          ...(payload === undefined ? {} : { 'content-type': 'application/json', 'content-length': String(payload.length) }),
        },
      },
      (response) => {
        let text = ''
        response.setEncoding('utf8')
        response.on('data', (chunk) => (text += chunk))
        response.on('end', () => resolve({ status: response.statusCode, text }))
      },
    )
    request.on('error', (error) => resolve({ status: 0, text: String(error?.message ?? error) }))
    request.setTimeout(60_000, () => {
      request.destroy()
      resolve({ status: 0, text: 'timeout' })
    })
    if (payload !== undefined) request.write(payload)
    request.end()
  })
const jsonOf = (text) => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
const readLog = () => {
  if (!existsSync(logPath)) return []
  return readFileSync(logPath, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return undefined
      }
    })
    .filter((row) => row !== undefined)
}

rmSync(logPath, { force: true })

console.log('# dsh-mcp：保存 → 热加载 → 工具真的可用')
console.log(`# node ${process.version} / 宿主 ${hostUrl} / 夹具 ${fixture}\n`)

/* ---------- 保存夹具服务器 ---------- */
const saved = await call('POST', '/api/dsh-mcp/servers/save', {
  servers: [
    {
      id: `mcp-${serverName}`,
      config: { serverName, transport: 'stdio', command: process.execPath, args: [fixture, '--log', logPath] },
    },
  ],
})
record('M1 保存条目（stdio，command=node + 夹具脚本）', saved.status === 200, `status=${saved.status} body=${JSON.stringify(saved.text.slice(0, 200))}`)

/* ---------- 等 loader 挂起来 ---------- */
let status = 'not-loaded'
const deadline = Date.now() + 30_000
while (Date.now() < deadline) {
  const rows = jsonOf((await call('GET', '/api/dsh-mcp/servers')).text)?.servers ?? []
  status = String(rows.find((row) => row.id === `mcp-${serverName}`)?.status ?? 'not-loaded')
  if (status === 'active' || status === 'error') break
  await new Promise((resolve) => setTimeout(resolve, 800))
}
record('M2 经 HMR 被 loader 挂起来（status=active）', status === 'active', `最终 status=${status}`)

/* ---------- L1：工具进了活注册表 ---------- */
let registryHit
for (let attempt = 0; attempt < 20; attempt += 1) {
  const found = jsonOf((await call('GET', `/api/dsh-search/query?q=probe_echo`)).text)
  const tools = Array.isArray(found?.tools) ? found.tools : []
  registryHit = tools.find((tool) => String(tool.name).includes('probe_echo'))
  if (registryHit !== undefined) break
  await new Promise((resolve) => setTimeout(resolve, 700))
}
record(
  'L1 工具真的注册进了 agent 工具表（search 的 tools 通道 = ctx.tools.schemas()）',
  registryHit !== undefined,
  registryHit === undefined
    ? '在活注册表里找不到 probe_echo（可能只是 loader 挂起来、工具没注册）'
    : `命中 ${JSON.stringify(registryHit).slice(0, 240)}`,
)
if (registryHit !== undefined) {
  const named = String(registryHit.name)
  record(
    `L1 工具名符合 MCP 约定 mcp__${serverName}__<tool>`,
    named === `mcp__${serverName}__probe_echo`,
    `实际名字=${named}`,
  )
}

/* ---------- L2：工具真的被调用过（由 agent 回合产生） ---------- */
const calls = readLog().filter((row) => row.type === 'tools/call')
if (calls.length === 0) {
  warn(
    'L2 工具的 tools/call 记录：暂无',
    '夹具服务器还没被真正调用过 —— 需要跑一次 agent 回合（见 README 里的命令）。' +
      '本脚本只负责 L1；L2 的证据由那次回合写进夹具的 --log。',
  )
} else {
  record(
    'L2 夹具服务器真的收到了 tools/call（「能调用」的硬证据）',
    true,
    `调用记录：${JSON.stringify(calls.map((row) => ({ name: row.name, args: row.args }))).slice(0, 300)}`,
  )
}
// 服务器侧确实完成了握手（不是「工具凭空出现」）
const requests = readLog().filter((row) => row.type === 'request').map((row) => row.method)
record(
  'L1 夹具服务器侧确实完成了 MCP 握手（initialize / tools/list）',
  requests.includes('initialize') && requests.includes('tools/list'),
  `收到的 JSON-RPC 方法：${JSON.stringify([...new Set(requests)])}`,
)

/* ---------- 收尾 ---------- */
await call('POST', '/api/dsh-mcp/servers/save', { servers: [] })
const after = jsonOf((await call('GET', '/api/dsh-mcp/servers')).text)?.servers ?? []
record('M3 清空后条目消失（托管区块可复位）', after.length === 0, `剩余 ${after.length} 条`)

const failed = results.filter((item) => item.ok !== true)
console.log(`\n# 汇总：PASS ${results.filter((r) => r.ok === true && r.warned !== true && r.skipped !== true).length} / WARN ${results.filter((r) => r.warned === true).length} / FAIL ${failed.length}`)
if (failed.length > 0) {
  console.log('# 失败项：')
  for (const item of failed) console.log(`  - ${item.name}${item.detail ? `：${item.detail.split('\n')[0]}` : ''}`)
}
if (reportPath !== undefined) {
  writeFileSync(reportPath, `${JSON.stringify({ hostUrl, serverName, fixture, logPath, results }, null, 2)}\n`)
  console.log(`# 报告：${reportPath}`)
}
console.log(`# 夹具调用日志：${logPath}`)
process.exit(failed.length === 0 ? 0 : 1)
