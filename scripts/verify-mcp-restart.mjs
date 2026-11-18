/**
 * `POST /api/dsh-mcp/restart` 的进程内真机验收：**重启后真的换了一代 mcp-client 实例**。
 *
 * ## 为什么单开这一层（单测已覆盖判据，这一层证明宿主接对了）
 *
 * `packages/mcp/test/restart-entry.test.ts` 用的是**假 fiber**：它证明「我们调了
 * `fiber.restart()` 并按状态码分类」，证明不了宿主那侧的语义——`fiber.restart()` 是否真的
 * dispose 旧 effect 再重跑 apply、mcp-client 是否真的重新拉起子进程并重新注册工具。
 * 接错时单测全绿，而用户点「重连」后工具一个都回不来。
 *
 * ## 断言什么（每条都对应一次真实派发）
 *
 * 1. 前置：真 `dsh-mcp-client` 用真 stdio 拉起探针服务器，全局层出现 `mcp__probe__*`；
 * 2. 重启前**真调用** `probe_echo` 有回显（给第 5 条的日志比对留基线）；
 * 3. 路由由真 `apply()` 挂在真 `webServer` 服务上（不是直接调纯函数）；
 * 4. 经该处理链 POST → 200 + `ok`；重启后工具**重新注册**回全局层；
 * 5. 重启后**真调用** `probe_echo` 仍有回显 —— 判据不是「注册表里有名字」，是「调用有结果」；
 * 6. 探针 `--log` 里重启前后各有一次真调用（硬证据，不是推断）；
 * 7. 同一处理链的拒绝分支：非法 id / 非托管行 → 400；
 * 8. 收尾自证：真实 `~/.dsh` 的补丁逐字节未变。
 *
 * ## 隔离（`docs/agent-real-test.md` 硬约束 ①）
 *
 * 进程内挂真插件模块（不 spawn 宿主），借 `scripts/lib/live-harness.mjs` 的临时目录 +
 * 隔离 `DSH_HOME`。`DSH_HOME` 必须在 import 插件**之前**设好。
 *
 * ## 用法
 *
 * ```sh
 * node scripts/verify-mcp-restart.mjs [--report out.json]
 * ```
 *
 * 需装好的 DSH 运行时（`pnpm link-dsh-runtime` 后解析到宿主那份）——**不进 CI**。
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { createLiveHarness, resolveRuntimeLoader, verifyRealPatchUnchanged } from './lib/live-harness.mjs'

const argv = process.argv.slice(2)
const flag = (name) => {
  const index = argv.indexOf(name)
  return index === -1 ? undefined : argv[index + 1]
}
const reportPath = flag('--report')
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

/** 隔离的 `DSH_HOME`（必须在 import 插件之前）。前缀由 live-scripts-safety.test.ts 静态钉住。 */
const harness = createLiveHarness({ prefix: 'mcp-restart-' })
const { workDir, isolatedHome, patch } = harness
process.env.DSH_HOME = isolatedHome

const { loadRuntime } = resolveRuntimeLoader(repoRoot)

const PROBE_SERVER = join(repoRoot, 'scripts', 'fixtures', 'mcp-probe-server.mjs')
const PROBE_TOOLS = ['mcp__probe__probe_echo', 'mcp__probe__probe_add']
const ROW_ID = 'mcp-probe'
const CALL_LOG = join(workDir, 'probe-calls.jsonl')

const results = []
const record = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '\n      ' + detail : ''}`)
}
/** 条件轮询（CG43：不用固定 sleep 等异步链）。 */
async function waitFor(check, timeoutMs, stepMs = 50) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try { if (check()) return true } catch { /* 视图尚未就绪 */ }
    if (Date.now() > deadline) return false
    await new Promise((resolve) => setTimeout(resolve, stepMs))
  }
}
const pick = (mod, name) => mod[name] ?? mod.default

let root
/** 反证用的「连不上的行」的 loader entry（在 ⑧ 里赋值，早于它时 loader 只报一条）。 */
let entryDead
const fibers = []

try {
  rmSync(CALL_LOG, { force: true })

  const { Context } = await loadRuntime('@deepseek-ai/cordis')
  const Tools = await loadRuntime('@deepseek-ai/dsh-tools')
  const SystemPrompt = await loadRuntime('@deepseek-ai/dsh-system-prompt')
  const ExecutorNative = await loadRuntime('@deepseek-ai/dsh-tool-executor-native')
  const Scope = await loadRuntime('@deepseek-ai/dsh-scope')
  const Agent = await loadRuntime('@deepseek-ai/dsh-agent')
  const McpClient = await loadRuntime('@deepseek-ai/dsh-mcp-client')
  const plugin = await import(pathToFileURL(join(repoRoot, 'packages', 'mcp', 'lib', 'index.js')).href)
  const { createScope } = Scope

  if (typeof plugin.spliceManagedBlock !== 'function') {
    throw new Error('插件没有导出 spliceManagedBlock()——托管区块形状变了，本脚本要跟着改（不要手写 YAML）')
  }
  writeFileSync(join(isolatedHome, 'cordis.patch.yml'), plugin.spliceManagedBlock('', [{
    id: ROW_ID,
    config: {
      serverName: 'probe', transport: 'stdio', command: process.execPath,
      args: [PROBE_SERVER, '--log', CALL_LOG], failOnStartupError: true,
    },
  }]))

  /* ---------- 最小但真实的宿主（顺序有依赖：tools 静态 inject systemPrompt） ---------- */
  root = new Context()
  await root.plugin(pick(SystemPrompt, 'SystemPrompt'))
  await root.plugin(pick(Tools, 'ToolRuntime'), {})
  await root.plugin(ExecutorNative)
  const Projections = await loadRuntime('@deepseek-ai/dsh-session-projection')
  await root.plugin(pick(Projections, 'SessionProjectionRegistry'))
  await root.plugin(pick(Agent, 'AgentRegistry'))

  /* ---------- 真 mcp-client（stdio，拉起真探针服务器） ---------- */
  const clientFiber = await root.plugin(McpClient, {
    serverName: 'probe', transport: 'stdio', command: process.execPath,
    args: [PROBE_SERVER, '--log', CALL_LOG], failOnStartupError: true,
  })
  fibers.push(clientFiber)

  /*
   * loader 服务：托管行就是**带真 fiber 的 entry**——这条验收的全部意义就是「真 fiber.restart()」。
   * 真宿主里 loader 一直在（卡片路由同一条路径今天就是这么工作的），这里补的是同一份形状。
   */
  const entry = { options: { id: ROW_ID, name: '@deepseek-ai/dsh-mcp-client' }, fiber: clientFiber }
  root.provide('loader', { entries: () => [entry, ...(entryDead === undefined ? [] : [entryDead])] })

  /* ---------- webServer 服务：把 apply() 的路由真的接住 ---------- */
  const routes = []
  root.provide('webServer', { register: (route) => { routes.push(route); return () => {} } })

  const pluginFiber = await root.plugin(
    { name: plugin.name, inject: plugin.inject, apply: plugin.apply, ...(plugin.Config === undefined ? {} : { Config: plugin.Config }) },
    { announceToAgent: false },
  )
  fibers.push(pluginFiber)

  const globalView = () => root.tools.schemas().map((schema) => schema.name)

  /* ---------- 造一个真 agent 用于真调用 ---------- */
  const agent = { id: 'restart-verify', session: { id: 'restart-verify', header: { cwd: workDir } } }
  agent.ctx = createScope(root, agent).ctx
  root.agents.enter(agent, undefined)
  await root.agents.announce(agent, 'startup')

  const sequence = { n: 0 }
  const callTool = async (name, args) => {
    const batch = await root.tools.execute({
      calls: [{ type: 'tool-call', id: `${name}-${String(++sequence.n)}`, name, arguments: JSON.stringify(args) }],
      agent,
      signal: new AbortController().signal,
    })
    const result = batch.results[0]?.result
    if (result === undefined) throw new Error(`宿主没有为 ${name} 返回结果`)
    return result
  }

  const up = await waitFor(() => PROBE_TOOLS.every((name) => globalView().includes(name)), 20_000)
  record('前置：真 mcp-client 用 stdio 拉起探针服务器，两个工具进全局层', up,
    up ? globalView().filter((n) => n.startsWith('mcp__')).join(',') : `等了 20s 仍没有：${globalView().join(',') || '(空)'}`)

  /* ---------- 重启前真调一次（给后面的日志比对留基线） ---------- */
  let beforeEcho = ''
  try { beforeEcho = JSON.stringify(await callTool(PROBE_TOOLS[0], { text: 'before-restart' })) } catch (error) { beforeEcho = 'ERR: ' + (error instanceof Error ? error.message : String(error)) }
  record('重启前真调用 probe_echo 拿到回显', /PROBE-ECHO/.test(beforeEcho), beforeEcho.slice(0, 200))

  const restartRoute = routes.find((route) => route.path === '/api/dsh-mcp/restart')
  record('路由 /api/dsh-mcp/restart 由真 apply() 挂在 webServer 服务上', restartRoute !== undefined,
    `已挂路由：${routes.map((route) => route.path).join(', ') || '(空)'}`)
  if (restartRoute === undefined) throw new Error('没有挂出 /restart 路由，后续断言无从进行')

  const invoke = async (body) => {
    const res = { status: 0, body: undefined, writeHead(status) { res.status = status }, end(raw) { if (raw !== undefined) res.body = raw } }
    const req = {
      method: 'POST', url: '/api/dsh-mcp/restart',
      headers: { host: '127.0.0.1:3080', 'sec-fetch-site': 'same-origin' },
      socket: { remoteAddress: '127.0.0.1' },
      async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body), 'utf8') },
    }
    await restartRoute.handler(req, res)
    return { status: res.status, payload: res.body === undefined ? undefined : JSON.parse(String(res.body)) }
  }

  /* ---------- 走真处理链重启 ---------- */
  const restarted = await invoke({ id: ROW_ID })
  record('经真处理链 POST /restart → 200 + ok', restarted.status === 200 && restarted.payload?.ok === true,
    `status=${restarted.status} settled=${String(restarted.payload?.settled)} warning=${String(restarted.payload?.warning ?? '(无)')}`)

  /*
   * 这条是本轮真机事故的**判据**（2026-11-18）：`connection` 必须是**注册表算出来的**，
   * 不能是 `restart()` 返回值的代理。能连上的行必须报 `connected` 且 toolCount>0；
   * 若这里报 pending 而工具明明在，说明判据又退化成了「apply 返回了就算成功」。
   */
  const conn = restarted.payload?.connection
  record('response.connection 由注册表算出：能连上 → connected 且 toolCount>0',
    conn === 'connected' && Number(restarted.payload?.toolCount) > 0,
    `connection=${String(conn)} toolCount=${String(restarted.payload?.toolCount)}`)

  const backUp = await waitFor(() => PROBE_TOOLS.every((name) => globalView().includes(name)), 30_000)
  record('重启后工具重新注册回全局层', backUp, globalView().filter((n) => n.startsWith('mcp__')).join(',') || '(空)')

  let afterEcho = ''
  try { afterEcho = JSON.stringify(await callTool(PROBE_TOOLS[0], { text: 'after-restart' })) } catch (error) { afterEcho = 'ERR: ' + (error instanceof Error ? error.message : String(error)) }
  record('重启后真调用 probe_echo 仍有回显（不是只留了个名字）', /PROBE-ECHO/.test(afterEcho), afterEcho.slice(0, 200))

  const calls = existsSync(CALL_LOG)
    ? readFileSync(CALL_LOG, 'utf8').trim().split('\n').filter(Boolean)
      .map((line) => { try { return JSON.parse(line) } catch { return undefined } }).filter(Boolean)
    : []
  const before = calls.filter((call) => call.args?.text === 'before-restart').length
  const after = calls.filter((call) => call.args?.text === 'after-restart').length
  record('探针 --log 里重启前后各有一次真调用（硬证据）', before === 1 && after === 1,
    `before-restart=${before} after-restart=${after}，共 ${calls.length} 条`)

  /* ---------- ⑧ 反证：连不上的行**必须**报 pending，不能报 connected ---------- */
  /*
   * 2026-11-18 真机事故的完整形状：`restart()` 成功返回、`apply` 也 resolve 了，但上游
   * 根本不可达（真机现场就是 `TLS` 握手失败）。那时我们的判据只有 `settled`，
   * 于是卡片报「已重连，工具会重新注册」，而同一行显示「未连接 / 工具 0」。
   *
   * 这里用一个**必定连不上**的地址（保留域名的不可达端口）在同一处理链上重放：
   * 期望 200 + `connection: 'pending'` + `warning`，且 toolCount 为 0。
   */
  const deadRow = 'mcp-dead'
  writeFileSync(join(isolatedHome, 'cordis.patch.yml'), plugin.spliceManagedBlock('', [
    { id: ROW_ID, config: { serverName: 'probe', transport: 'stdio', command: process.execPath, args: [PROBE_SERVER, '--log', CALL_LOG], failOnStartupError: true } },
    { id: deadRow, config: { serverName: 'deadprobe', transport: 'streamable-http', url: 'http://127.0.0.1:9/mcp', toolCallTimeoutMs: 2000 } },
  ]))
  const deadFiber = await root.plugin(McpClient, { serverName: 'deadprobe', transport: 'streamable-http', url: 'http://127.0.0.1:9/mcp', toolCallTimeoutMs: 2000 })
  fibers.push(deadFiber)
  entryDead = { options: { id: deadRow, name: '@deepseek-ai/dsh-mcp-client' }, fiber: deadFiber }
  await new Promise((resolve) => setTimeout(resolve, 300))

  const deadRes = await invoke({ id: deadRow })
  record('反证：上游不可达的行经同一处理链 → connection=pending + warning（不谎报已重连）',
    deadRes.status === 200 && deadRes.payload?.connection === 'pending' && String(deadRes.payload?.warning ?? '').includes('仍未连上'),
    `status=${deadRes.status} connection=${String(deadRes.payload?.connection)} toolCount=${String(deadRes.payload?.toolCount)} warning=${String(deadRes.payload?.warning ?? '(无)')}`)

  /* ---------- 拒绝分支：同一处理链 ---------- */
  const badId = await invoke({ id: 'not-a-row' })
  record('非法 id 经同一处理链回 400', badId.status === 400, `status=${badId.status} ${JSON.stringify(badId.payload).slice(0, 140)}`)

  const unknown = await invoke({ id: 'mcp-nonexistent' })
  record('非托管行经同一处理链回 400', unknown.status === 400, `status=${unknown.status} ${JSON.stringify(unknown.payload).slice(0, 140)}`)
} finally {
  for (const fiber of fibers.reverse()) {
    try { await fiber.dispose?.() } catch { /* 收尾不阻塞 */ }
  }
  harness.cleanup()
  const realPatchCheck = verifyRealPatchUnchanged(patch)
  record('收尾自证：真实 ~/.dsh 的补丁逐字节未变', realPatchCheck.unchanged,
    `${realPatchCheck.path}（${realPatchCheck.bytes === undefined ? '不存在→仍不存在' : String(realPatchCheck.bytes) + ' 字节'}）`)
}

if (reportPath !== undefined) {
  writeFileSync(reportPath, `${JSON.stringify({ results }, null, 2)}\n`)
  console.log(`# 报告：${reportPath}`)
}

const failed = results.filter((result) => !result.ok)
console.log(`\n${failed.length === 0 ? '全部通过' : `${String(failed.length)} 条失败`}（${String(results.length)} 条）`)
process.exit(failed.length === 0 ? 0 : 1)
