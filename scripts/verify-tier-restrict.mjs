/**
 * 档位裁剪的**集成层**真机验收：真 cordis 根 + 真 `tools` / `sessions` / `sandboxPolicy`
 * 服务 + 真 kit 模块 + **真分类表**，验「受限会话的 agent 到底看得见什么」。
 *
 * ## 为什么单开这一层（单测已经覆盖了逻辑，这一层证明宿主接对了）
 *
 * | 层 | 覆盖 | 够不到的地方 |
 * | --- | --- | --- |
 * | `packages/{kit,tty,docker,mcp}/test/tier-restrict.test.ts` | **逻辑**：求交、去重、退化、撤销、切档重算 | 用的是**假** `tools` 服务：`schemas(scope)` 的投影是夹具自己算的 |
 * | **本脚本** | **宿主契约**：`tools.restrict()` 落在 agent scope 上，宿主**真的**把工具从该 agent 的视图里去掉了吗 | —— |
 *
 * 这个缺口是实打实的：`restrict()` 的语义（只过滤**继承层**、名单必须来自全局视图、未知名字
 * 整体抛）全在宿主那一侧，单测的夹具是我们自己照文档写的**可能性**，不是宿主的**事实**。
 * 2026-10 的工具面整改（`tier-restrict` / 三个包接线）如果在这条路径上接错，单测会全绿而用户的
 * 受限会话照样看得见 `mcp__*` —— 正是本脚本要拦的形状。
 *
 * ## 断言什么（每一条都对应一次真实派发）
 *
 * 1. 只读档（部署默认）：`docker_*` / `tty_*` / `sftp_*` / `mcp__*` 里**没有任何 write / exec**；
 * 2. **升档**：会话日志里追加一条真 `sandbox/mode` = `danger-full-access` → 工具面回来；
 * 3. **降档**：再追加 `workspace-write` → 工具面重新被裁（**这是 2026-10-25 那次改动的验收**：
 *    改动前工具面只在 `agent/created` / `tools/change` 时才对上，中途切档纹丝不动）；
 * 4. 只切**一个**会话，另一个会话的工具面不受影响；
 * 5. **per-agent 挂载的工具不受前缀裁剪**（宿主只裁继承层）：这是 `mcp` README 记着的边界，
 *    此前只有散文、没有实测。顺带钉住它的**原因**——把这类名字写进 `deny` 会整体抛
 *    `unknown global tool`，所以「按需挂载」那条路的档位执行只能是**卸载**，不能是 restrict；
 * 6. 收尾自证：真实 `~/.dsh` 的补丁逐字节未变（隔离真的生效，而不是「恰好没写」）。
 *
 * ## 隔离（`docs/agent-real-test.md` 硬约束 ①）
 *
 * 本脚本**进程内**挂真插件模块（不 spawn 宿主），所以借
 * [`scripts/lib/live-harness.mjs`](./lib/live-harness.mjs) 的临时目录 + 隔离 `DSH_HOME` +
 * 补丁快照。`DSH_HOME` 必须在 **import 插件之前**设好：`dshHome()` 读的是 `process.env`，
 * 而插件在 `apply()` 里就会落盘。
 *
 * ## 用法
 *
 * ```sh
 * pnpm --filter @hyzyn/dsh-kit run tier-smoke        # = node scripts/verify-tier-restrict.mjs
 * node scripts/verify-tier-restrict.mjs --report out.json
 * ```
 *
 * 需要装好的 DSH 运行时（本仓 cohort，`pnpm link-dsh-runtime` 之后解析到宿主那一份）——与
 * `verify-codegraph-agent-integration.mjs` 同一条腿，**不进 CI**（理由见
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
 * 前缀 `tier-restrict-` 是「这个临时目录是谁的」的唯一线索，也由
 * `scripts/test/live-scripts-safety.test.ts` 静态钉住。
 */
const harness = createLiveHarness({ prefix: 'tier-restrict-' })
const { workDir, isolatedHome } = harness
process.env.DSH_HOME = isolatedHome

const { loadRuntime } = resolveRuntimeLoader(repoRoot)

const results = []
const record = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '\n      ' + detail : ''}`)
}

/** 等一个条件成立或超时（codegraph CG43：不用固定 sleep 等异步链）。 */
async function waitFor(check, timeoutMs, stepMs = 50) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (check()) return true
    if (Date.now() > deadline) return false
    await new Promise((resolve) => setTimeout(resolve, stepMs))
  }
}

const pick = (mod, name) => mod[name] ?? mod.default

/** 一个最小但真实的工具定义（真实名字、真实 schema 形状；`execute` 不会被调用）。 */
const makeTool = (name) => ({
  name,
  description: `tier-smoke probe tool ${name}`,
  parameters: { type: 'object', properties: {} },
  output: { schema: { type: 'object' }, render: () => [] },
  execute: async () => ({}),
})

/** 三个包的分档事实（**真表**，不是本脚本抄的一份）：名字集合与分类都从各包 lib 读。 */
function tierTables(docker, tty, mcp) {
  return [
    { pkg: 'docker', prefixes: docker.DOCKER_TIER_PREFIXES, class: docker.DOCKER_TIER_CLASS },
    { pkg: 'tty', prefixes: tty.TTY_TIER_PREFIXES, class: tty.TTY_TIER_CLASS },
    // mcp 的语义判不了（第三方 server 自己决定读还是写），接线里一律取最坏类 exec。
    { pkg: 'mcp', prefixes: mcp.MCP_TIER_PREFIXES, class: undefined },
  ]
}

const disposers = []
let isolatedPatchPath

try {
  const { Context } = await loadRuntime('@deepseek-ai/cordis')
  const Tools = await loadRuntime('@deepseek-ai/dsh-tools')
  const Scope = await loadRuntime('@deepseek-ai/dsh-scope')
  const Agent = await loadRuntime('@deepseek-ai/dsh-agent')
  const Session = await loadRuntime('@deepseek-ai/dsh-session')
  const Projections = await loadRuntime('@deepseek-ai/dsh-session-projection')
  const Sandbox = await loadRuntime('@deepseek-ai/dsh-sandbox-policy')
  const SystemPrompt = await loadRuntime('@deepseek-ai/dsh-system-prompt')
  const kit = await import(pathToFileURL(join(repoRoot, 'packages', 'kit', 'lib', 'index.js')).href)
  const docker = await import(pathToFileURL(join(repoRoot, 'packages', 'docker', 'lib', 'index.js')).href)
  const tty = await import(pathToFileURL(join(repoRoot, 'packages', 'tty', 'lib', 'index.js')).href)
  const mcp = await import(pathToFileURL(join(repoRoot, 'packages', 'mcp', 'lib', 'index.js')).href)

  /*
   * 最小但**真实**的宿主。顺序有依赖，不是随手排的：
   *   - `sessionProjections` 是 `sandboxPolicy` 的静态 inject，缺席时它整个服务不发布；
   *   - `tools` 的静态 inject 是 `systemPrompt`（`ToolRuntime` 要往 prompt 里挂工具段）。
   * 所以必须是 projections → sessions → systemPrompt → tools → sandboxPolicy → agents。
   */
  const root = new Context()
  await root.plugin(pick(Projections, 'SessionProjectionRegistry'))
  await root.plugin(pick(Session, 'SessionStore'))
  await root.plugin(pick(SystemPrompt, 'SystemPrompt'))
  await root.plugin(pick(Tools, 'ToolRuntime'), { mode: 'native' })
  await root.plugin(pick(Sandbox, 'SandboxPolicyService'), {})
  await root.plugin(pick(Agent, 'AgentRegistry'))

  const servicesUp = ['tools', 'sessions', 'sandboxPolicy', 'agents'].filter((name) => root[name] !== undefined)
  record('真宿主服务组合起来了（tools / sessions / sandboxPolicy / agents）', servicesUp.length === 4,
    `已发布=${servicesUp.join(',') || '(无)'}`)

  /* ---------- 注册面：三个包的真实工具名 ---------- */
  const tables = tierTables(docker, tty, mcp)
  const classified = tables.flatMap((table) => Object.keys(table.class ?? {}))
  /** mcp 的工具名不存在静态表里（server 自己决定），按核心命名规则造两个探针名。 */
  const mcpProbeNames = ['mcp__probe__echo', 'mcp__probe__write']
  const registered = [...classified, ...mcpProbeNames]
  for (const name of registered) disposers.push(root.tools.register(makeTool(name)))
  /*
   * 接线走**真插件形状**：每个包一个小 plugin fiber，带声明式 `inject: ['tools']`，
   * 在自己的 ctx 上调 `attachTierRestrict`——这正是 `packages/tty` 的写法（docker / mcp 用
   * 动态 `ctx.inject(['tools'], cb)` 的 `toolsCtx`，同一层作用域）。
   *
   * 为什么不能图省事直接 `kit.attachTierRestrict(root, …)`：那样订阅挂在**根** ctx 上，
   * 而 `session/event` 的派发是**按 scope 过滤**的（`this: Scoped<Session>`）。根 ctx 收得到
   * 事件，不代表插件 ctx 也收得到——而生产里就是插件 ctx。这一条是本脚本最该测对的对象
   * （判据要测对对象：夹具证明「根 ctx 能行」等于没证明用户的会话会重算）。
   */
  const restrictInstances = []
  for (const table of tables) {
    await root.plugin({
      name: `tier-smoke-${table.pkg}`,
      inject: ['tools'],
      apply(ctx) {
        restrictInstances.push(
          kit.attachTierRestrict(ctx, {
            pkg: table.pkg,
            prefixes: table.prefixes,
            // mcp：本仓判不了第三方工具语义，一律取最坏类（与 packages/mcp 的接线同一判据）。
            classify: table.class === undefined ? () => 'exec' : (tool) => table.class[tool],
          }),
        )
      },
    })
  }
  record('三个包的真实分档表接进同一个 agent 作用域',
    registered.length > 20 && restrictInstances.length === 3,
    `注册 ${String(registered.length)} 个工具（docker ${String(Object.keys(docker.DOCKER_TIER_CLASS).length)} / tty ${String(Object.keys(tty.TTY_TIER_CLASS).length)} / mcp 探针 ${String(mcpProbeNames.length)}）`)

  /* ---------- 造两个真会话 + 两个真 agent ---------- */
  const sessionA = root.sessions.create('tier-smoke-a', { meta: { cwd: workDir } })
  const sessionB = root.sessions.create('tier-smoke-b', { meta: { cwd: workDir } })

  const makeAgent = (id, session) => {
    const agent = { id, session }
    agent.ctx = Scope.createScope(root, agent).ctx
    root.agents.enter(agent, undefined)
    return agent
  }
  const agentA = makeAgent('tier-smoke-a', sessionA)
  const agentB = makeAgent('tier-smoke-b', sessionB)
  // 真 `agent/created` 派发（与 dsh-agent-loop 的创建事务同一条路径）。
  await root.agents.announce(agentA, 'startup')
  await root.agents.announce(agentB, 'startup')

  /** agent 真正看得见的工具名（宿主按 scope 投影的那一份，不是我们自己算的）。 */
  const view = (agent) => root.tools.schemas(agent).map((schema) => schema.name)
  /**
   * 这一档**不该**出现在模型面前的工具：从**分类表现算**（write / exec 两类），不在这里抄一份
   * 名字清单——抄一份就是第三份真相源，表一改它就开始说谎。mcp 的探针名单独加（它的语义判不了，
   * 接线里一律取最坏类 exec）。
   */
  const EXPECTED_RESTRICTED_ABSENT = [
    ...tables
      .filter((table) => table.class !== undefined)
      .map((table) => [
        table.prefixes[0],
        Object.entries(table.class)
          .filter(([, cls]) => cls !== 'read')
          .map(([name]) => name),
      ]),
    ['mcp__', mcpProbeNames],
  ]

  const missingAtStart = EXPECTED_RESTRICTED_ABSENT.flatMap(([, names]) => names).filter((name) => view(agentA).includes(name))
  record('受限档（部署默认 read-only）：agent 的视图里没有任何 write / exec 与 mcp__*',
    missingAtStart.length === 0,
    `仍可见=${missingAtStart.join(',') || '(无)'}；视图 ${String(view(agentA).length)} 个：${view(agentA).join(',')}`)

  /* ---------- 升档：真会话事件 → 真重算 ---------- */
  const fullTierBaseline = registered.length
  sessionA.append('sandbox/mode', { mode: 'danger-full-access' })
  const lifted = await waitFor(() => view(agentA).length === fullTierBaseline, 3000)
  record('升档（session 日志追加 sandbox/mode=danger-full-access）后工具面回来',
    lifted,
    lifted ? `视图 ${String(view(agentA).length)} 个（= 注册面）` : `等了 3s 仍是 ${String(view(agentA).length)} 个：${view(agentA).join(',')}`)

  /* ---------- 降档：同一会话再切回去 ---------- */
  /** 这一档不该出现在模型面前的工具（每次现算，`waitFor` 里要重新读视图）。 */
  const forbiddenVisible = (agent) =>
    EXPECTED_RESTRICTED_ABSENT.flatMap(([, names]) => names).filter((name) => view(agent).includes(name))

  sessionA.append('sandbox/mode', { mode: 'workspace-write' })
  const reRestricted = await waitFor(() => view(agentA).length < fullTierBaseline && forbiddenVisible(agentA).length === 0, 3000)
  /*
   * `lifted` 是这条的**前置条件**，不是冗余：没有它时，「本来就没放开过」的状态会让「降档之后
   * 仍是受限」恒真——第一版就是这么在「换回旧 lib」的变异里假绿的（升档 FAIL、降档 PASS）。
   */
  record('降档（workspace-write）后工具面重新被裁',
    lifted && reRestricted,
    `${String(view(agentA).length)} 个（注册面 ${String(fullTierBaseline)}，升档那步 ${lifted ? '成立' : '不成立'}）；仍可见的 exec=${forbiddenVisible(agentA).join(',') || '(无)'}`)

  /* ---------- 另一个会话不受影响（切 A 前后逐名比对 B 的视图） ---------- */
  const viewBBefore = view(agentB)
  sessionA.append('sandbox/mode', { mode: 'danger-full-access' })
  await waitFor(() => view(agentA).length === fullTierBaseline, 3000)
  const viewBAfter = view(agentB)
  const bUnchanged = viewBBefore.length === viewBAfter.length && viewBBefore.every((name, index) => name === viewBAfter[index])
  record('只切 A 的档位，B 的工具面一个名字都没变（B 始终是受限档）',
    bUnchanged && forbiddenVisible(agentB).length === 0,
    `B：${String(viewBBefore.length)} → ${String(viewBAfter.length)} 个；B 里可见的 exec=${forbiddenVisible(agentB).join(',') || '(无)'}`)

  /* ---------- per-agent 挂载：自己那一层不受 prefix 裁剪 ---------- */
  /*
   * 挂进 agent **自己**的层：与 codegraph 的 per-agent MCP 挂载同形
   * （`agent.ctx.plugin(mcpClient, …)` 里的注册最终都落在 agent 这一层）。
   *
   * 取法必须走 `agent.ctx.inject(['tools'], …)`：agent 的 ctx 没有声明式 `inject: ['tools']`，
   * 直接读 `agent.ctx.tools` 会撞 cordis 的 inject 守卫（实测报 "cannot get property ... without
   * inject"——docker 的接线注释里记过同一条）。`inject` 回调给的是**同一个 scope** 上带 tools 的
   * ctx，所以注册仍进 agent 自己的层。
   */
  const perAgentTool = 'mcp__peragent__query'
  const ownTools = await new Promise((resolve) => {
    agentA.ctx.inject(['tools'], (scoped) => resolve(scoped.tools))
  })
  const disposeOwnTool = ownTools.register(makeTool(perAgentTool))
  const ownVisible = await waitFor(() => view(agentA).includes(perAgentTool), 2000)
  const bSeesOwn = view(agentB).includes(perAgentTool)
  record('per-agent 挂载的工具在受限档**仍然可见**（宿主只裁继承层，own-layer 豁免）',
    ownVisible && !bSeesOwn,
    `A=${ownVisible ? '可见' : '不可见'} / B=${bSeesOwn ? '可见（不该）' : '不可见'}——这条是 mcp README 记着的边界，此处是实测`)

  /*
   * 它为什么不能被 `restrict` 摘掉：把 own-layer 的名字写进 deny，宿主整体抛
   * `unknown global tool`（`restrictableNames` 只含全局层）。所以「按需挂载」那条路的档位执行
   * 只能是**卸载**——这条把未来的实现方向钉死，不留「也许 restrict 能管到」的想象空间。
   */
  let ownLayerRejected = ''
  try {
    // 同一个 agent scope 上的 `restrict()`（`ownTools` 是上面 inject 拿到的那个 handle）。
    const dispose = ownTools.restrict?.({ deny: [perAgentTool] })
    dispose?.()
  } catch (error) {
    ownLayerRejected = error instanceof Error ? error.message : String(error)
  }
  record('把 per-agent 工具名写进 deny 会被宿主整体拒绝（⇒ 那条路只能靠卸载）',
    ownLayerRejected.includes('unknown global tool'),
    ownLayerRejected === '' ? '没抛——宿主行为变了，去核 dsh-tools 的 restrictableNames' : ownLayerRejected.slice(0, 160))
  disposeOwnTool()

  // 收尾：撤掉两处限制与工具注册（本进程内的隔离，跑完就走）。
  for (const dispose of restrictInstances) dispose()
  for (const dispose of disposers.splice(0)) dispose()
  isolatedPatchPath = join(isolatedHome, 'cordis.patch.yml')
} catch (error) {
  record('整体执行', false, error instanceof Error ? `${error.message}\n${error.stack ?? ''}`.slice(0, 800) : String(error))
} finally {
  /* ---------- 收尾自证：真实配置逐字节未变 ---------- */
  const realPatchCheck = verifyRealPatchUnchanged(harness.patch)
  record('真实 DSH_HOME 的 cordis.patch.yml 逐字节未变', realPatchCheck.unchanged,
    realPatchCheck.unchanged
      ? `${realPatchCheck.path}（${realPatchCheck.bytes === undefined ? '不存在→仍不存在' : String(realPatchCheck.bytes) + ' 字节'}）`
      : `❌ 被改动了！before=${realPatchCheck.before === undefined ? '(不存在)' : String(realPatchCheck.before.length) + 'B'} after=${realPatchCheck.bytes === undefined ? '(不存在)' : String(realPatchCheck.bytes) + 'B'}`)

  /*
   * 隔离生效的**正向**证据：本脚本只在进程内挂模块、不写 profile，所以隔离 home 里**不该**有补丁；
   * 真要有，内容里也不能出现真实 home 的路径（那条才是「写对了地方」的证据）。
   * 断言错方向会把正确行为判红——`verify-codegraph-agent-integration.mjs` 第一版就踩过。
   */
  const isolatedText = isolatedPatchPath !== undefined && existsSync(isolatedPatchPath) ? readFileSync(isolatedPatchPath, 'utf8') : ''
  const leaked = harness.realDshHome !== '' && isolatedText.includes(harness.realDshHome)
  record('隔离 home 里没有落到真实 home 的写入', !leaked,
    isolatedPatchPath === undefined
      ? '未走到收尾（见上一条失败）'
      : isolatedText === '' ? `${isolatedPatchPath} 不存在（本脚本不写 profile，符合预期）` : `${String(isolatedText.length)} 字节，含真实 home 路径=${String(leaked)}`)

  harness.cleanup()
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
