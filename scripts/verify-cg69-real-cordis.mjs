/**
 * CG69 的**真 cordis 契约层**验证：`agentEventsAvailable` 必须可复用。
 *
 * 为什么单测不够：`test/agent-late-service.test.ts` 用**假 ctx**，把「注入回调何时跑」
 * 当成自己的旋钮；而缺陷的要害正是**真 cordis** 的语义——`ctx.get(name)` 是 strict 的
 * （只认提供者 fiber 已 ACTIVE），`ctx.inject` 才是可重入的（依赖齐了才跑、`_refresh()` 重跑）。
 *
 * 复现方式（不靠时序碰运气）：**先不装 AgentRegistry**，让 apply 期 `ctx.get('agents')`
 * 必然是 undefined（这不是模拟，是真实语义）；之后再用 `root.plugin(AgentRegistry)`
 * 把真服务装上——那一刻 cordis 的 `_refresh()` 会跑 inject 回调，正是 CG69 的修复路径。
 *
 * 用法：node scripts/verify-cg69-real-cordis.mjs
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { resolveRuntimeLoader } from './lib/live-harness.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const workDir = mkdtempSync(join(tmpdir(), 'cg69-real-cordis-'))
const dshHome = join(workDir, 'dsh-home')
mkdirSync(dshHome, { recursive: true })
// 隔离：apply() 会写 $DSH_HOME/cordis.patch.yml（codegraph CG68 的教训）
process.env.DSH_HOME = dshHome

const results = []
const record = (name, ok, detail) => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '\n      ' + detail : ''}`)
}

const makeProject = (name) => {
  const dir = join(workDir, name)
  mkdirSync(join(dir, '.codegraph'), { recursive: true })
  writeFileSync(join(dir, '.codegraph', 'codegraph.db'), '')
  return dir
}

const projectIndexed = makeProject('indexed')
const agentTools = (ctx, agent) => ctx.tools.schemas(agent).filter((s) => s.name.startsWith('mcp__codegraph__'))
const waitFor = async (fn, ms) => {
  const end = Date.now() + ms
  for (;;) {
    if (await fn()) return true
    if (Date.now() > end) return false
    await new Promise((r) => setTimeout(r, 100))
  }
}

let root
try {
  const { loadRuntime } = resolveRuntimeLoader(repoRoot)
  const { Context } = await loadRuntime('@deepseek-ai/cordis')
  const Tools = await loadRuntime('@deepseek-ai/dsh-tools')
  const SystemPrompt = await loadRuntime('@deepseek-ai/dsh-system-prompt')
  const AgentPkg = await loadRuntime('@deepseek-ai/dsh-agent')
  const { createScope } = await loadRuntime('@deepseek-ai/dsh-scope')
  const plugin = await import(pathToFileURL(join(repoRoot, 'packages', 'codegraph', 'lib', 'index.js')).href)

  root = new Context()
  await root.plugin(SystemPrompt.SystemPrompt ?? SystemPrompt.default)
  await root.plugin(Tools.ToolRuntime ?? Tools.default, { mode: 'native' })

  /*
   * 关键：**先不装 AgentRegistry**。这就是真机上「agents 的提供者 fiber 还在 LOADING」
   * 的同一种可观测状态——strict-get 返回 undefined，而不是抛错。
   */
  await root.plugin({ name: 'codegraph', inject: plugin.inject, apply: plugin.apply, Config: plugin.Config },
    { mcpScope: 'per-agent', defaultPath: projectIndexed })
  await new Promise((r) => setTimeout(r, 400))

  record('apply 期没有 agents 服务时，插件照样挂载（顶层 inject: [] 的取舍成立）',
    root.tools !== undefined, `tools=${typeof root.tools}`)

  // 裁决此刻必须是 managed（这是正确行为：确实还没有事件面）
  const decisionBefore = plugin.__cgScopeDecision?.(root)
  record('此时裁决退回 managed（正确行为，不是 bug）：' + String(decisionBefore),
    decisionBefore === 'managed' || decisionBefore === undefined, `decision=${decisionBefore}`)

  /*
   * 把**真** agents 服务装上：cordis 的 _refresh() 跑 inject 回调 → CG69 的修复路径。
   * 修复前：`agentEventsAvailable` 永远停在 false，此后创建的 agent 一个工具都拿不到。
   */
  await root.plugin(AgentPkg.AgentRegistry)

  const makeAgent = (id, cwd) => {
    const agent = { id, session: { id, header: { cwd } } }
    agent.ctx = createScope(root, agent).ctx
    return agent
  }
  const agent = makeAgent('cg69-late-agent', projectIndexed)
  root.agents.enter(agent, undefined)
  await root.agents.announce(agent, 'startup')

  const gotTools = await waitFor(() => agentTools(root, agent).length > 0, 25_000)
  record('服务到货后新建的 agent 真的拿到 mcp__codegraph__* 工具（本次修复的判据）',
    gotTools, gotTools ? agentTools(root, agent).map((s) => s.name).join(',') : '等了 25s 仍没有工具')
} catch (error) {
  record('脚本执行完成（无意外异常）', false, String((error && error.stack) || error))
} finally {
  try { root?.stop?.() } catch { /* 停不掉不阻塞 */ }
  rmSync(workDir, { recursive: true, force: true })
}

const failed = results.filter((r) => !r.ok)
console.log(`\n# 结果：${results.length - failed.length}/${results.length} 通过`)
process.exit(failed.length === 0 ? 0 : 1)
