/**
 * `@hyzyn/dsh-mcp` 的**工具面按需加载**（`agentToolLoading: 'on-demand'`）的进程内真机验收。
 *
 * ## 为什么单开这一层（单测已经覆盖逻辑，这一层证明宿主接对了）
 *
 * | 层 | 覆盖 | 够不到的地方 |
 * | --- | --- | --- |
 * | `packages/mcp/test/agent-surface.test.ts` | **逻辑**：deny 求差、装载/卸载、`tools/change` 重算 | 用的是**假** `tools` 服务：`restrict()` 的投影是夹具自己算的 |
 * | **本脚本** | **宿主契约**：`tools.restrict()` 落在 agent scope 上时，模型视图里**真的**没有 `mcp__*`；装回来也**真的**能调 | —— |
 *
 * 这个缺口是实打实的：`restrict()` 的语义（只过滤继承层、名单必须来自全局视图）全在宿主那一侧，
 * 单测的夹具是我们照文档写的**可能性**，不是宿主的**事实**。接错时单测会全绿，而用户的
 * `on-demand` 会话照样看得见（或装载后照样调不动）`mcp__*`——正是本脚本要拦的形状。
 *
 * ## 断言什么（每一条都对应一次真实派发）
 *
 * 1. 前置：真 `dsh-mcp-client` 用真 stdio 拉起 `scripts/fixtures/mcp-probe-server.mjs`，
 *    全局层出现 `mcp__probe__probe_echo` / `probe_add`（后面几条的对象就是它们）；
 * 2. `on-demand`：agent A 的可见面**没有**任何 `mcp__probe__*`，而 `mcp_servers` / `mcp_load` 在
 *    ——装载前真调 `probe_echo` 会被宿主拒（反证「不是只藏了 schema」）；
 * 3. `mcp_servers` 真派发：报 `mode: 'on-demand'`、`probe` 这条 `tools: 2` / `loaded: false`
 *    （数据来自托管区块 + 工具注册表，不是脚本自己算的）；
 * 4. `mcp_load(['probe'])`：`loaded` 真的有 `probe`，A 的视图里出现两个工具，且**真调用**
 *    `probe_echo` 拿得到 `PROBE-ECHO:…`（装载不是只改了个字段）；
 * 5. **另一个 agent 不受影响**：B 的可见面在装载前后逐名一致，仍无 `mcp__probe__*`；
 * 6. `mcp_load([])` 全部卸掉；未知 server 进 `unknown`、不装也不抛；
 * 7. `eager`（默认档）**零副作用**：第二个真宿主上挂 `eager`，既不注册自有工具，也**不放**
 *    任何 `restrict()`（agent 照样看得见 `mcp__probe__*`）；
 * 8. 收尾自证：真实 `~/.dsh` 的补丁逐字节未变；隔离 home 里没有落到真实 home 的写入。
 *
 * ## 隔离（`docs/agent-real-test.md` 硬约束 ①）
 *
 * 本脚本**进程内**挂真插件模块（不 spawn 宿主），借
 * [`scripts/lib/live-harness.mjs`](./lib/live-harness.mjs) 的临时目录 + 隔离 `DSH_HOME` +
 * 补丁快照。`DSH_HOME` 必须在 **import 插件之前**设好：`dshHome()` 读的是 `process.env`，
 * 而插件在 `apply()` 里就会落盘。
 *
 * 隔离 home 里的 `cordis.patch.yml` 由**插件自己的** `spliceManagedBlock()` 生成（托管区块只
 * 有一份正文）——那是「`mcp_servers` 看到 server」的真实来源，不是夹具里另写一份 DTO。
 *
 * ## 用法
 *
 * ```sh
 * node scripts/verify-mcp-on-demand.mjs              # 需装好的 DSH 运行时（本仓 cohort）
 * node scripts/verify-mcp-on-demand.mjs --report out.json
 * ```
 *
 * 需要装好的 DSH 运行时（`pnpm link-dsh-runtime` 之后解析到宿主那一份）——与
 * `verify-tier-restrict.mjs` 同一条腿，**不进 CI**（理由见
 * [docs/conventions.md § 真机脚本与 CI 接线](../docs/conventions.md#真机脚本与-ci-接线)）。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
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

/**
 * 隔离的 `DSH_HOME`（**必须在 import 插件之前**）。
 *
 * 前缀 `mcp-ondemand-` 是「这个临时目录是谁的」的唯一线索，也由
 * `scripts/test/live-scripts-safety.test.ts` 静态钉住。
 */
const harness = createLiveHarness({ prefix: 'mcp-ondemand-' })
const { workDir, isolatedHome } = harness
process.env.DSH_HOME = isolatedHome

const { loadRuntime } = resolveRuntimeLoader(repoRoot)

const PROBE_SERVER = join(repoRoot, 'scripts', 'fixtures', 'mcp-probe-server.mjs')
const PROBE_TOOLS = ['mcp__probe__probe_echo', 'mcp__probe__probe_add']

const results = []
const record = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '\n      ' + detail : ''}`)
}

/** 条件轮询：等 `check()` 为真或超时（CG43：不用固定 sleep 等异步链）。 */
async function waitFor(check, timeoutMs, stepMs = 50) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (check()) return true
    if (Date.now() > deadline) return false
    await new Promise((resolve) => setTimeout(resolve, stepMs))
  }
}

const pick = (mod, name) => mod[name] ?? mod.default

/**
 * 插件配置：`on-demand`。
 *
 * 字段名与契约一致（`agentToolLoading`）——写错的话 `mcp_servers` 会报 `mode: 'eager'`，
 * 第 3 条断言当场变红，不会静默跑成默认档。
 */
const ON_DEMAND = { agentToolLoading: 'on-demand' }

let isolatedPatchPath
let root
let eagerRoot
const fibers = []

try {
  const { Context } = await loadRuntime('@deepseek-ai/cordis')
  const Tools = await loadRuntime('@deepseek-ai/dsh-tools')
  const Scope = await loadRuntime('@deepseek-ai/dsh-scope')
  const Agent = await loadRuntime('@deepseek-ai/dsh-agent')
  const SystemPrompt = await loadRuntime('@deepseek-ai/dsh-system-prompt')
  const McpClient = await loadRuntime('@deepseek-ai/dsh-mcp-client')
  const plugin = await import(pathToFileURL(join(repoRoot, 'packages', 'mcp', 'lib', 'index.js')).href)
  const { createScope } = Scope

  /* ---------- 隔离 home 的托管区块：用插件自己的写入器生成（不手抄格式） ---------- */
  if (typeof plugin.spliceManagedBlock !== 'function') {
    throw new Error('插件没有导出 spliceManagedBlock()——托管区块的形状变了，本脚本需要跟着改（不要手写 YAML）')
  }
  const managedText = plugin.spliceManagedBlock('', [{
    id: 'mcp-probe',
    config: {
      serverName: 'probe',
      transport: 'stdio',
      command: process.execPath,
      args: [PROBE_SERVER],
      failOnStartupError: true,
    },
  }])
  isolatedPatchPath = join(isolatedHome, 'cordis.patch.yml')
  writeFileSync(isolatedPatchPath, managedText)

  /*
   * 最小但**真实**的宿主。顺序有依赖：`tools` 的静态 inject 是 `systemPrompt`
   * （`ToolRuntime` 要往 prompt 里挂工具段），所以 systemPrompt 在前。
   */
  root = new Context()
  /*
   * 真宿主里 `loader` 是 cordis-plugin-loader 提供的服务（托管行就是它的条目），而
   * `buildServersDto()` 会读 `ctx.loader` 找「本卡之外」的 mcp-client 实例。最小宿主**必须**
   * 显式提供它，理由不是「让测试过」：cordis 对未注册服务走严格守卫，`ctx.loader` 会抛，而
   * `serverRows()` 会把异常吞成「没有 server」——于是 on-demand 安静地退化成「什么都装不了」，
   * 测试会在一个**真宿主里不存在**的形状上判红。真宿主里这个服务一直在（卡片路由同一条路径
   * 今天就是靠它工作的），这里补的是同一份形状；`entries()` 返回空 = 本卡之外没有实例。
   */
  root.provide('loader', { entries: () => [] })
  await root.plugin(pick(SystemPrompt, 'SystemPrompt'))
  await root.plugin(pick(Tools, 'ToolRuntime'), { mode: 'native' })
  await root.plugin(pick(Agent, 'AgentRegistry'))

  /** agent 真正看得见的工具名（宿主按 scope 投影的那一份，不是我们自己算的）。 */
  const view = (ctx, agent) => ctx.tools.schemas(agent).map((schema) => schema.name)
  const globalView = (ctx) => ctx.tools.schemas().map((schema) => schema.name)

  /* ---------- 真 mcp-client（stdio，拉起真探针服务器） ---------- */
  const clientFiber = await root.plugin(McpClient, {
    serverName: 'probe',
    transport: 'stdio',
    command: process.execPath,
    args: [PROBE_SERVER],
    failOnStartupError: true,
  })
  fibers.push(clientFiber)

  const clientUp = await waitFor(() => PROBE_TOOLS.every((name) => globalView(root).includes(name)), 20_000)
  record('真 mcp-client 用 stdio 拉起探针服务器，两个工具进了全局层（后续断言的对象）',
    clientUp,
    clientUp ? `全局层 mcp 工具：${globalView(root).filter((n) => n.startsWith('mcp__')).join(',')}` : `等了 20s 仍没有：${globalView(root).join(',') || '(空)'}`)

  /* ---------- 真插件（on-demand） ---------- */
  const pluginFiber = await root.plugin(
    { name: plugin.name, inject: plugin.inject, apply: plugin.apply, ...(plugin.Config === undefined ? {} : { Config: plugin.Config }) },
    ON_DEMAND,
  )
  fibers.push(pluginFiber)

  const ownToolsUp = await waitFor(() => ['mcp_servers', 'mcp_load'].every((name) => globalView(root).includes(name)), 5_000)
  record('插件在最小真实宿主里挂成 on-demand，两个自有工具已注册',
    ownToolsUp,
    ownToolsUp ? `mcp_servers / mcp_load 在全局层` : `全局层：${globalView(root).join(',') || '(空)'}`)

  /* ---------- 造两个真 agent（真 `agent/created` 派发） ---------- */
  const makeAgent = (id) => {
    const agent = { id, session: { id, header: { cwd: workDir } } }
    agent.ctx = createScope(root, agent).ctx
    root.agents.enter(agent, undefined)
    return agent
  }
  const agentA = makeAgent('ondemand-a')
  const agentB = makeAgent('ondemand-b')
  await root.agents.announce(agentA, 'startup')
  await root.agents.announce(agentB, 'startup')

  /** 真派发一次工具调用（走宿主 pre/policy/execute/post 全链路，不是直接调 execute）。 */
  const sequence = { n: 0 }
  const callTool = (agent, name, args) => root.tools.execute({
    callId: `${name}-${String(++sequence.n)}`,
    name,
    arguments: args,
    agent,
    signal: new AbortController().signal,
  })

  /* ---------- 2. on-demand 初始：一个 mcp__* 都看不见 ---------- */
  const restricted = await waitFor(
    () => PROBE_TOOLS.every((name) => !view(root, agentA).includes(name)) && ['mcp_servers', 'mcp_load'].every((name) => view(root, agentA).includes(name)),
    5_000,
  )
  /*
   * 反证：装载前**真调** `probe_echo` 必须被宿主拒（`UNKNOWN_TOOL`）。只断言「视图里没有」
   * 时，一种实现把 schema 藏起来却仍能执行也是绿的——那才是最糟的形状。
   */
  let preLoadRejected = ''
  try {
    const denied = await callTool(agentA, PROBE_TOOLS[0], { text: 'before-load' })
    preLoadRejected = denied.isError ? String(denied.error?.message ?? denied.error ?? '') : ''
  } catch (error) {
    preLoadRejected = error instanceof Error ? error.message : String(error)
  }
  record('on-demand 初始：agent A 的视图里没有 mcp__probe__*，mcp_servers / mcp_load 在',
    restricted && preLoadRejected !== '',
    `A 视图：${view(root, agentA).join(',')}${preLoadRejected === '' ? '；⚠️ 装载前真调用居然成功/未被拒——工具只是从视图里藏起来了' : `；装载前真调用被拒：${preLoadRejected.slice(0, 120)}`}`)

  /* ---------- 3. mcp_servers（真派发） ---------- */
  const listed = await callTool(agentA, 'mcp_servers', {})
  const listedValue = await settleValue(listed, 'mcp_servers')
  const probeRow = listedValue.servers?.find((row) => row.server === 'probe')
  const listedOk = listedValue.mode === 'on-demand' && probeRow !== undefined && probeRow.tools === 2 && probeRow.loaded === false
  record('mcp_servers 真派发：mode=on-demand、probe 报 tools=2 / loaded=false（数据来自托管区块 + 注册表）',
    listedOk,
    `mode=${String(listedValue.mode)} · probe=${JSON.stringify(probeRow ?? null)} · note=${String(listedValue.note ?? '(无)')}`)

  /* ---------- 4. 装载：视图 + 真调用 ---------- */
  const loadedViewBAgain = view(root, agentB)
  const loadResult = await callTool(agentA, 'mcp_load', { servers: ['probe'] })
  const loadValue = await settleValue(loadResult, 'mcp_load')
  const visibleAfterLoad = await waitFor(() => PROBE_TOOLS.every((name) => view(root, agentA).includes(name)), 5_000)
  const echo = await callTool(agentA, PROBE_TOOLS[0], { text: 'on-demand' })
  const echoText = JSON.stringify(echo.value ?? echo.content ?? '')
  const echoOk = !echo.isError && echoText.includes('PROBE-ECHO:on-demand')
  record('mcp_load([probe]) 后：A 的视图出现两个工具，且**真调用** probe_echo 拿到回显',
    Array.isArray(loadValue.loaded) && loadValue.loaded.includes('probe') && visibleAfterLoad && echoOk,
    `loaded=${JSON.stringify(loadValue.loaded)} · 视图含 probe=${String(visibleAfterLoad)} · 返回值=${echoText.slice(0, 160)}`)

  /* ---------- 5. 另一个 agent 不受影响 ---------- */
  const viewBAfterLoad = view(root, agentB)
  const bUnchanged = sameView(loadedViewBAgain, viewBAfterLoad) && PROBE_TOOLS.every((name) => !viewBAfterLoad.includes(name))
  record('只装 A 的：另一个 agent B 的工具面逐名未变，仍看不到前缀 [mcp__] 的工具',
    bUnchanged,
    `B：${String(loadedViewBAgain.length)} → ${String(viewBAfterLoad.length)} 个；B 里可见的 mcp__probe__*=${PROBE_TOOLS.filter((name) => viewBAfterLoad.includes(name)).join(',') || '(无)'}`)

  /* ---------- 6. 卸载 + 未知 server ---------- */
  const unloadResult = await callTool(agentA, 'mcp_load', { servers: [] })
  const unloadValue = await settleValue(unloadResult, 'mcp_load')
  const unloaded = await waitFor(() => PROBE_TOOLS.every((name) => !view(root, agentA).includes(name)), 5_000)
  const unknownResult = await callTool(agentA, 'mcp_load', { servers: ['nope'] })
  const unknownValue = await settleValue(unknownResult, 'mcp_load')
  const unknownNotLoaded = Array.isArray(unknownValue.unknown) && unknownValue.unknown.includes('nope') && !view(root, agentA).includes(PROBE_TOOLS[0])
  record('mcp_load([]) 全部卸掉（A 又看不见）；未知 server 进 unknown、不装也不抛',
    unloaded && Array.isArray(unloadValue.loaded) && unloadValue.loaded.length === 0 && unknownNotLoaded,
    `卸后 A 视图含 probe=${String(PROBE_TOOLS.some((name) => view(root, agentA).includes(name)))} · unknown=${JSON.stringify(unknownValue.unknown)}`)

  /* ---------- 7. eager（默认档）零副作用：第二个真宿主 ---------- */
  eagerRoot = new Context()
  eagerRoot.provide('loader', { entries: () => [] })
  await eagerRoot.plugin(pick(SystemPrompt, 'SystemPrompt'))
  await eagerRoot.plugin(pick(Tools, 'ToolRuntime'), { mode: 'native' })
  await eagerRoot.plugin(pick(Agent, 'AgentRegistry'))
  // 先手工注册一个 mcp__* 探针工具（eager 下没人该把它摘掉；它同时是「restrict 没发」的证据）
  const probeDef = () => ({
    name: PROBE_TOOLS[0],
    description: 'on-demand 脚本的 eager 档探针（不会被调用）',
    parameters: {},
    output: { schema: { type: 'object', additionalProperties: false, properties: {} }, render: () => [] },
    execute: async () => ({}),
  })
  const disposeProbe = eagerRoot.tools.register(Tools.defineTool(probeDef()))
  const eagerFiber = await eagerRoot.plugin(
    { name: plugin.name, inject: plugin.inject, apply: plugin.apply, ...(plugin.Config === undefined ? {} : { Config: plugin.Config }) },
    { agentToolLoading: 'eager' },
  )
  fibers.push(eagerFiber)
  const eagerAgent = { id: 'eager-a', session: { id: 'eager-a', header: { cwd: workDir } } }
  eagerAgent.ctx = createScope(eagerRoot, eagerAgent).ctx
  eagerRoot.agents.enter(eagerAgent, undefined)
  await eagerRoot.agents.announce(eagerAgent, 'startup')
  const eagerNames = view(eagerRoot, eagerAgent)
  const eagerOk = eagerNames.includes(PROBE_TOOLS[0])
    && !eagerNames.includes('mcp_servers')
    && !eagerNames.includes('mcp_load')
  record('eager（默认档）零副作用：不注册自有工具，也没把 mcp__* 摘掉',
    eagerOk,
    `eager agent 视图：${eagerNames.join(',') || '(空)'}`)
  disposeProbe()
} catch (error) {
  record('整体执行', false, error instanceof Error ? `${error.message}\n${error.stack ?? ''}`.slice(0, 1200) : String(error))
} finally {
  // 先撤插件与 MCP 客户端（子进程随 fiber 回收），再删临时目录。
  /*
   * 每个 `root.plugin()` 的返回值都是一个 fiber，`dispose()` 是**唯一**的回收边界
   * （`Context` 自己没有 dispose）：MCP 客户端子进程随它退出，插件的订阅与工具注册随它撤销。
   */
  for (const fiber of fibers.splice(0)) {
    try { await fiber.dispose() } catch { /* 已释放 */ }
  }

  /* ---------- 收尾自证：真实配置逐字节未变 ---------- */
  const realPatchCheck = verifyRealPatchUnchanged(harness.patch)
  record('真实 DSH_HOME 的 cordis.patch.yml 逐字节未变', realPatchCheck.unchanged,
    realPatchCheck.unchanged
      ? `${realPatchCheck.path}（${realPatchCheck.bytes === undefined ? '不存在→仍不存在' : String(realPatchCheck.bytes) + ' 字节'}）`
      : `❌ 被改动了！before=${realPatchCheck.before === undefined ? '(不存在)' : String(realPatchCheck.before.length) + 'B'} after=${realPatchCheck.bytes === undefined ? '(不存在)' : String(realPatchCheck.bytes) + 'B'}`)

  /*
   * 隔离生效的**正向**证据：本脚本只往隔离 home 写托管区块（那是 `mcp_servers` 的数据源），
   * 所以隔离补丁**应当**存在；要证的是它没有落到真实 home 的路径上。
   * 断言错方向会把正确行为判红（`verify-codegraph-agent-integration.mjs` 第一版踩过）。
   */
  const isolatedText = isolatedPatchPath !== undefined && existsSync(isolatedPatchPath) ? readFileSync(isolatedPatchPath, 'utf8') : ''
  const leaked = harness.realDshHome !== '' && isolatedText.includes(harness.realDshHome)
  record('隔离 home 有托管区块（mcp_servers 的数据源），且不含真实 home 路径',
    isolatedText.includes('dsh-mcp-config managed') && !leaked,
    isolatedPatchPath === undefined
      ? '未走到收尾（见上一条失败）'
      : `${String(isolatedText.length)} 字节，含托管区块=${String(isolatedText.includes('dsh-mcp-config managed'))}，含真实 home 路径=${String(leaked)}`)

  harness.cleanup()
}

/**
 * 取一次真派发的结构化值；失败时抛出带 `error` 的消息（让 `record` 的 detail 能直接定位）。
 *
 * `tools.execute()` 把工具失败**归一化**成 `{ isError: true, error }`，不会 throw——
 * 直接读 `value` 会拿到 undefined，看起来像「返回了空对象」，那是本仓踩过的误判形状。
 */
async function settleValue(result, toolName) {
  if (result.isError === true) {
    throw new Error(`${toolName} 真派发失败：${JSON.stringify(result.error ?? result.content ?? {}).slice(0, 400)}`)
  }
  return result.value ?? {}
}

/** 两个视图是否逐名相同（顺序也一致——宿主投影顺序稳定，顺序变了也算变化）。 */
function sameView(before, after) {
  return before.length === after.length && before.every((name, index) => name === after[index])
}

const failed = results.filter((item) => !item.ok)
console.log(`\n# 结果：${String(results.length - failed.length)}/${String(results.length)} 通过`)
if (reportPath !== undefined) {
  writeFileSync(reportPath, `${JSON.stringify({ results }, null, 2)}\n`)
  console.log(`# 报告：${reportPath}`)
}
if (failed.length > 0) {
  console.error(`\n# 失败项：\n${failed.map((item) => `- ${item.name}: ${item.detail ?? ''}`).join('\n')}`)
  process.exit(1)
}
