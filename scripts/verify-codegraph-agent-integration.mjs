/**
 * `@hyzyn/dsh-codegraph` P0 的**集成层**验证：真插件 + 真 agent 生命周期。
 *
 * 为什么需要第三个脚本（前两个各覆盖一层，都够不到这一层）：
 *
 *   | 脚本 | 覆盖 | 够不到的地方 |
 *   | --- | --- | --- |
 *   | `verify-codegraph-agent-scope.mjs` | **机制**：scope 能挂、同名不冲突、释放回收 | 用的是假 agent 与假插件形状，没跑真 `apply()` |
 *   | `verify-codegraph-host-contract.mjs` | **路由/开关**：25 条路由、模式切换、托管行挂起恢复 | 起的是真宿主，但那个宿主里**没有 agent 被创建**（每轮 `/agents` 都是 `mounted=0`） |
 *   | **本脚本** | **集成**：真插件挂载后，宿主真的创建 agent 时，`agent/created` → 挂 MCP → 该 agent 拿到工具 | —— |
 *
 * 这个缺口是实打实的：前两个脚本全绿，也**证明不了**「用户开会话时 MCP 真的挂上了」——
 * 因为两者都不触发 `agent/created`。而 P0 的全部价值就在那条路径上。
 *
 * 做法：建一个最小但**真实**的 Cordis 宿主（真 `dsh-tools` / `dsh-system-prompt` /
 * `dsh-agent` 的 `AgentRegistry`），挂**真插件**（`packages/codegraph/lib/index.js`），
 * 然后用 `agents.enter()` + `agents.announce()` 驱动一次真正的 `agent/created` 派发
 * （与 `dsh-agent-loop:1718-1721` 同一条路径），再断言工具落到了**那个 agent** 的
 * 视图里、且全局层干净。
 *
 * 隔离（codegraph CG45 的教训，这里是必须的）：`apply()` 会写 `$DSH_HOME/cordis.patch.yml`。
 * 本脚本把 `DSH_HOME` 指向临时目录——**第一版没做，插件当场去写真实
 * `~/.dsh/cordis.patch.yml`**（被文件沙箱的 EPERM 拦下才发现）。收尾同样断言真实补丁
 * 逐字节未变。
 *
 * ⚠️ 那条「逐字节未变」断言的**强度取决于环境**（变异验证时实测到的）：在**受限沙箱**里
 * 去掉本脚本的隔离，真实补丁仍然「未变」——因为写盘先被沙箱的 EPERM 挡掉了，而不是隔离
 * 起作用。所以沙箱里这条断言是**弱**的（只证了「没变」，证不了「是隔离让它没变」）。
 * 在普通终端（无 EPERM）里它才是真守卫：去掉隔离就会看到真实补丁被改写、断言变红。
 * 正向的隔离证据由 `verify-codegraph-host-contract.mjs` 提供（它断言托管行写进了
 * **隔离** home 的补丁）——那个脚本跑在 managed 模式下，插件确实会写行。
 *
 * 用法：
 *   node scripts/verify-codegraph-agent-integration.mjs [--report out.json]
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const argv = process.argv.slice(2)
const flag = (name) => {
  const index = argv.indexOf(name)
  return index === -1 ? undefined : argv[index + 1]
}
const reportPath = flag('--report')
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * 隔离的 DSH_HOME（**必须在 import 插件之前设好**）。
 *
 * `homePatchPath()` 是模块级 `dshHome()` 的调用，而 `dshHome()` 读 `process.env.DSH_HOME`。
 * 插件在 `apply()` 里就会写补丁，所以这个赋值不能晚于挂载。
 */
const workDir = mkdtempSync(join(tmpdir(), 'cg-agent-integration-'))
const isolatedHome = join(workDir, 'dsh-home')
mkdirSync(join(isolatedHome, 'profiles'), { recursive: true })
const realDshHome = process.env.DSH_HOME?.trim() || join(process.env.HOME ?? '', '.dsh')
const realPatchPath = join(realDshHome, 'cordis.patch.yml')
const realPatchBefore = existsSync(realPatchPath) ? readFileSync(realPatchPath, 'utf8') : undefined
process.env.DSH_HOME = isolatedHome

/**
 * 运行时包一律从 `dsh-mcp-client` 所在那一层解析。
 *
 * 这是**正确性要求**而不是便利：`dsh-scope` 的 `kScope` 是模块内局部 Symbol，解析到
 * 第二份副本会让所有 `scopeOf()` 返回 undefined，隔离**静默失效**（本脚本第 3 条
 * 断言正好能测出这种失效）。
 */
const mcpClientPath = createRequire(join(repoRoot, 'packages', 'codegraph', 'package.json'))
  .resolve('@deepseek-ai/dsh-mcp-client')
const runtimeScopeDir = dirname(dirname(dirname(mcpClientPath)))
const loadRuntime = (specifier) => import(pathToFileURL(createRequire(join(runtimeScopeDir, 'anchor.cjs')).resolve(specifier)).href)

const results = []
const record = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '\n      ' + detail : ''}`)
}

/** 条件轮询：等 `check()` 为真或超时（codegraph CG43：不要用固定 sleep 等异步链）。 */
async function waitFor(check, timeoutMs, stepMs = 200) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (check()) return true
    if (Date.now() > deadline) return false
    await new Promise((resolve) => setTimeout(resolve, stepMs))
  }
}

/** 造一个带 `.codegraph/` 的临时项目（不跑 codegraph init，也不碰任何真实仓库）。 */
const makeProject = (root, name) => {
  const dir = join(root, name)
  mkdirSync(join(dir, '.codegraph'), { recursive: true })
  writeFileSync(join(dir, '.codegraph', 'codegraph.db'), '')
  return dir
}

/** `codegraph serve --mcp` 子进程（按 cwd，排除 CLI 自己的常驻 daemon）。 */
function mcpPidsFor(cwd) {
  const want = realpathSync(cwd)
  let daemonPid
  try {
    const parsed = JSON.parse(readFileSync(join(cwd, '.codegraph', 'daemon.pid'), 'utf8'))
    daemonPid = typeof parsed?.pid === 'number' ? String(parsed.pid) : undefined
  } catch { /* 没有 daemon 登记 */ }
  try {
    const pids = execFileSync('pgrep', ['-f', 'serve.*--mcp'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
    return pids.filter((pid) => {
      if (pid === daemonPid) return false
      try {
        const line = execFileSync('lsof', ['-a', '-p', pid, '-d', 'cwd', '-Fn'], { encoding: 'utf8' })
          .split('\n').find((l) => l.startsWith('n'))
        return line !== undefined && line.slice(1) === want
      } catch {
        return false
      }
    })
  } catch {
    return []
  }
}

const projectIndexed = makeProject(workDir, 'indexed-project')
const projectBare = makeProject(workDir, 'bare-project')
// 让「没有有效索引」这一档成立：bare 项目没有 .codegraph/
rmSync(join(projectBare, '.codegraph'), { recursive: true, force: true })

const agentTools = (ctx, agent) => ctx.tools.schemas(agent).filter((s) => s.name.startsWith('mcp__codegraph__'))

let root
try {
  const { Context } = await loadRuntime('@deepseek-ai/cordis')
  const AgentPkg = await loadRuntime('@deepseek-ai/dsh-agent')
  const Tools = await loadRuntime('@deepseek-ai/dsh-tools')
  const SystemPrompt = await loadRuntime('@deepseek-ai/dsh-system-prompt')
  const { createScope } = await loadRuntime('@deepseek-ai/dsh-scope')
  const plugin = await import(pathToFileURL(join(repoRoot, 'packages', 'codegraph', 'lib', 'index.js')).href)

  root = new Context()
  await root.plugin(SystemPrompt.SystemPrompt ?? SystemPrompt.default)
  await root.plugin(Tools.ToolRuntime ?? Tools.default, { mode: 'native' })
  await root.plugin(AgentPkg.AgentRegistry)

  // 真插件（per-agent 模式），默认项目 = 已索引临时项目
  await root.plugin(
    { name: 'codegraph', inject: plugin.inject, apply: plugin.apply, Config: plugin.Config },
    { mcpScope: 'per-agent', defaultPath: projectIndexed },
  )

  record('真插件在最小真实宿主里挂载成功', root.tools !== undefined && root.agents !== undefined,
    `tools=${typeof root.tools} agents=${typeof root.agents}`)

  /** 造一个「真」agent：id === session.id，ctx 是它自己的 scope（与 dsh-agent-loop 同形）。 */
  const makeAgent = (id, cwd) => {
    const session = { id, header: { cwd } }
    const agent = { id, session }
    agent.ctx = createScope(root, agent).ctx
    return agent
  }

  // ---------- 1. 已索引项目：agent/created → 真的挂上 ----------
  const agentOk = makeAgent('integ-indexed', projectIndexed)
  const detachOk = root.agents.enter(agentOk, undefined)
  await root.agents.announce(agentOk, 'startup')
  const mounted = await waitFor(() => agentTools(root, agentOk).length > 0, 15_000)
  record('真 agent 创建后拿到 codegraph MCP 工具（agent/created → 挂载）',
    mounted,
    mounted ? `tools=${agentTools(root, agentOk).map((s) => s.name).join(',')}` : '等了 15s 仍没有工具')

  record('该 agent 真的有一个 MCP 子进程（cwd = 它的索引根）',
    mcpPidsFor(projectIndexed).length > 0,
    `pids=${mcpPidsFor(projectIndexed).join(',') || '(无)'}`)

  // ---------- 2. 全局层干净：没索引的 agent 不能继承到别人的工具 ----------
  const globalNames = root.tools.schemas(undefined).map((s) => s.name)
  record('全局层没有 mcp 工具（无索引的 agent 不会继承）',
    !globalNames.some((n) => n.startsWith('mcp__')),
    `schemas(global)=[${globalNames.join(',')}]`)

  // ---------- 3. 无有效索引的 agent：不挂（**不回落**到默认项目）----------
  const agentBare = makeAgent('integ-bare', projectBare)
  const detachBare = root.agents.enter(agentBare, undefined)
  await root.agents.announce(agentBare, 'startup')
  // 给它足够时间「若有 bug 就会挂上」，再断言它没有工具
  await new Promise((resolve) => setTimeout(resolve, 3_000))
  record('无有效索引的 agent 不挂载（不回落，避免拿到别的项目上下文）',
    agentTools(root, agentBare).length === 0 && mcpPidsFor(projectBare).length === 0,
    `tools=[${agentTools(root, agentBare).map((s) => s.name).join(',')}] pids=${mcpPidsFor(projectBare).join(',') || '(无)'}`)

  // ---------- 4. 两个 agent 各绑各的 ----------
  const agentOk2 = makeAgent('integ-indexed-2', projectIndexed)
  const detachOk2 = root.agents.enter(agentOk2, undefined)
  await root.agents.announce(agentOk2, 'startup')
  await waitFor(() => agentTools(root, agentOk2).length > 0, 15_000)
  const mountsA = agentTools(root, agentOk).length
  const mountsB = agentTools(root, agentOk2).length
  record('多 agent 在同一项目各自挂上（按时分复用之外的路径）',
    mountsA > 0 && mountsB > 0,
    `agent1=${String(mountsA)} agent2=${String(mountsB)}`)

  // ---------- 5. agent 销毁 → 回收 ----------
  detachOk2()
  const reclaimed = await waitFor(() => agentTools(root, agentOk2).length === 0, 10_000)
  record('agent/disposed 后该 agent 的工具消失（挂载随 agent 回收）',
    reclaimed,
    `剩余 tools=[${agentTools(root, agentOk2).map((s) => s.name).join(',')}]`)

  // 收尾：宁可留着也别让临时项目的进程变孤儿
  detachOk()
  detachBare()
  await new Promise((resolve) => setTimeout(resolve, 1_500))
} catch (error) {
  record('整体执行', false, error instanceof Error ? `${error.message}\n${error.stack ?? ''}`.slice(0, 600) : String(error))
} finally {
  for (const project of [projectIndexed, projectBare]) {
    try {
      for (const pid of mcpPidsFor(project)) {
        try { process.kill(Number(pid), 'SIGTERM') } catch { /* 已退 */ }
      }
    } catch { /* 目录已被删 */ }
  }
  // 收尾自证：真实补丁必须逐字节未变（与另两个真机脚本同款）
  const realPatchAfter = existsSync(realPatchPath) ? readFileSync(realPatchPath, 'utf8') : undefined
  const untouched = realPatchAfter === realPatchBefore
  record('真实 DSH_HOME 的 cordis.patch.yml 未被改动', untouched,
    untouched
      ? `${realPatchPath}（${realPatchAfter === undefined ? '不存在→仍不存在' : String(realPatchAfter.length) + ' 字节，逐字节一致'}）`
      : `❌ 被改动了！before=${realPatchBefore === undefined ? '(不存在)' : String(realPatchBefore.length) + 'B'} after=${realPatchAfter === undefined ? '(不存在)' : String(realPatchAfter.length) + 'B'}`)
  /*
   * 隔离生效的**正向**证据：插件 home 级写入必须落在隔离目录里。
   *
   * 注意不能断言「隔离 home 里有 cordis.patch.yml」——per-agent 模式下插件**没有托管行**
   * （它只会撤销自己那一行，从不新建），所以这个文件本来就不该存在。断言错方向会让
   * 一条正确的行为被判红（第一版就是这样）。
   *
   * 真正要证的是「写没写**真实** ~/.dsh」——那由上面那条逐字节断言负责；这里补一条
   * 反向哨兵：隔离 home 里若有补丁，内容里不能出现真实 home 的路径。
   */
  const isolatedPatch = join(isolatedHome, 'cordis.patch.yml')
  const isolatedText = existsSync(isolatedPatch) ? readFileSync(isolatedPatch, 'utf8') : ''
  record('per-agent 模式下不产生托管行（只撤销、不新建）',
    !isolatedText.includes('mcp-codegraph-managed'),
    isolatedText === '' ? '隔离 home 无补丁（符合预期：per-agent 不建行）' : `隔离补丁 ${String(isolatedText.length)} 字节，含托管行=${String(isolatedText.includes('mcp-codegraph-managed'))}`)
  rmSync(workDir, { recursive: true, force: true })
}

const failed = results.filter((r) => !r.ok)
console.log(`\n# 结果：${String(results.length - failed.length)}/${String(results.length)} 通过`)
if (reportPath !== undefined) {
  writeFileSync(reportPath, `${JSON.stringify({ results }, null, 2)}\n`)
  console.log(`# 报告：${reportPath}`)
}
if (failed.length > 0) {
  console.error(`\n# 失败项：\n${failed.map((f) => `- ${f.name}: ${f.detail ?? ''}`).join('\n')}`)
  process.exit(1)
}
