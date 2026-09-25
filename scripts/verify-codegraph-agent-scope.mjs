/**
 * `@hyzyn/dsh-codegraph` P0（per-agent scoped MCP 挂载）的**运行时机制**验证。
 *
 * 为什么需要它（与 `verify-codegraph-host-contract.mjs` 的分工）：
 *   - 宿主契约脚本验的是**本插件在真宿主里的行为**（路由面、托管行、模式开关）；
 *   - 本脚本验的是**本插件依赖的运行时机制**是否成立——建一个最小 Cordis 根，
 *     按 `dsh-agent-loop` 的做法用 `createScope` 造两个「agent」作用域，各自挂一份
 *     `dsh-mcp-client`，然后实测隔离性。
 *
 * 这层必须单独验，因为它是**整个 P0 方案的承重墙**，而单测覆盖不到：
 *   1. `agent.ctx` 是 scope —— `scopeOf(agent.ctx) === agent`（键是 **agent 对象本身**，
 *      不是 `agent.ctx`；传错会静默解析成空层而不是报错）；
 *   2. scope 里的 `tools.register()` 只落在该 scope 的层（全局层干净）；
 *   3. 不同 scope 里**同名 serverName 不冲突**；同一 scope 里冲突必须报错；
 *   4. 整包 namespace 对象能当插件传给 `ctx.plugin`（不能传 `.apply`：async 函数没有
 *      `prototype`、且裸 apply 不带 `inject`）；
 *   5. 释放一个 scope 只回收它自己的 MCP 子进程，另一个照常工作。
 *
 * 反例价值：这几条只要有一条不成立，P0 就得改成完全不同的设计（比如按 session 挂
 * 而不是按 agent）。所以本脚本刻意断言**机制本身**，不测插件代码。
 *
 * 隔离：全程只读用户配置——自己造两个带 `.codegraph/` 的临时项目，不碰 `~/.dsh`，
 * 不碰任何真实仓库，结束前回收自己的全部子进程。
 *
 * 用法：
 *   node scripts/verify-codegraph-agent-scope.mjs [--report out.json]
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
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
 * 运行时包的解析位置（本脚本在仓库根，根 node_modules 里没有 @deepseek-ai 运行时包）。
 *
 * 解析策略刻意是「先找到 `dsh-mcp-client`，再从**它所在的那一层**解析其余全部」：
 *
 *   1. `@deepseek-ai/dsh-mcp-client` 是本包**声明过的**可选 peer，所以从
 *      `packages/codegraph/package.json` 一定能解析到（它的 node_modules 由
 *      `scripts/link-dsh-runtime.mjs` 链到宿主那一份）；
 *   2. `dsh-tools` / `dsh-scope` / `cordis` 本包没声明（P0 不需要它们），不能直接从本包解；
 *   3. **但必须与 mcp-client 解析到同一份 `dsh-scope`**：`kScope` 是模块内局部
 *      Symbol（`dsh-scope/lib/index.js:229`），第二份副本会让所有 `scopeOf()` 返回
 *      undefined，隔离**静默失效**——正是本脚本第 3/4 条在探测的失效模式。
 *      从 mcp-client 所在目录解析，天然保证同源。
 */
const codegraphPkg = join(repoRoot, 'packages', 'codegraph', 'package.json')
const mcpClientPath = createRequire(codegraphPkg).resolve('@deepseek-ai/dsh-mcp-client')
// .../@deepseek-ai/dsh-mcp-client/lib/index.js → 上溯三层到 .../@deepseek-ai
const runtimeScopeDir = dirname(dirname(dirname(mcpClientPath)))
const runtimeRequire = createRequire(join(runtimeScopeDir, 'anchor.cjs'))
const loadRuntime = (specifier) => import(pathToFileURL(runtimeRequire.resolve(specifier)).href)

const { Context } = await loadRuntime('@deepseek-ai/cordis')
const McpClient = await loadRuntime('@deepseek-ai/dsh-mcp-client')
const Tools = await loadRuntime('@deepseek-ai/dsh-tools')
// ToolRuntime 的构造函数里就调 `ctx.systemPrompt.tools(...)`，所以 systemPrompt 必须先挂。
const SystemPrompt = await loadRuntime('@deepseek-ai/dsh-system-prompt')
const { createScope, scopeOf } = await loadRuntime('@deepseek-ai/dsh-scope')

const results = []
const record = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '\n      ' + detail : ''}`)
}

/** 条件轮询：等 `check()` 为真或超时（返回是否等到）。 */
async function waitFor(check, timeoutMs, stepMs = 200) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (check()) return true
    if (Date.now() > deadline) return false
    await new Promise((resolve) => setTimeout(resolve, stepMs))
  }
}

/**
 * 造一个「像真项目」的临时目录：`.codegraph/` 里放一个空索引库文件。
 *
 * 够用即可：codegraph 服务器只要求「向上能找到 .codegraph/」，真正的索引内容由它自己
 * 在该目录里建；这里不跑 `codegraph init`（那会真花分钟级时间），也不碰任何真实仓库。
 */
const makeProject = (root, name) => {
  const dir = join(root, name)
  mkdirSync(join(dir, '.codegraph'), { recursive: true })
  writeFileSync(join(dir, '.codegraph', 'codegraph.db'), '')
  return dir
}

/**
 * 找出**本插件的 MCP 客户端子进程**（`codegraph serve --mcp`，按 cwd 过滤）。
 *
 * ⚠️ 一个 cwd 下会看到**两个** pid，绝不能把它们当成「两个我起的进程」：
 *   - `codegraph serve --mcp`（**我们 spawn 的**，dispose 时随之退出）；
 *   - codegraph CLI 自己拉起的**常驻 daemon**（注册在项目自己的 `.codegraph/daemon.pid`，
 *     socket 在 `.codegraph/daemon.sock`，**刻意 detach**，dispose 后继续存活）。
 *
 * 实测（`.probe/timing3.mjs`，2026-09-22）：dispose 返回后 3ms 内 serve 进程即消失，
 * 而 daemon 存活 >24s。第一版断言「cwd 下 pid 清空」因此假失败——被当成泄漏的其实是
 * 上游 CLI 的设计（跨会话复用索引）。所以这里**按 daemon.pid 排除**，只断言我们那一份。
 */
function mcpPidsFor(cwd) {
  /**
   * 比较必须用 realpath：macOS 上 `/var` 是指向 `/private/var` 的符号链接，而
   * `lsof` 报的是**解析后**的路径——直接比字符串会在临时目录下永远不相等
   * （第一版就是这么假的失败了一次，看起来像「进程没起来」）。
   */
  const want = realpathSync(cwd)
  const daemonPid = readDaemonPid(cwd)
  try {
    const pids = execFileSync('pgrep', ['-f', 'serve.*--mcp'], { encoding: 'utf8' })
      .trim().split('\n').filter(Boolean)
    const matched = []
    for (const pid of pids) {
      if (pid === daemonPid) continue
      try {
        const out = execFileSync('lsof', ['-a', '-p', pid, '-d', 'cwd', '-Fn'], { encoding: 'utf8' })
        const line = out.split('\n').find((l) => l.startsWith('n'))
        if (line !== undefined && line.slice(1) === want) matched.push(pid)
      } catch {
        /* 进程已退 / 无权限：跳过 */
      }
    }
    return matched
  } catch {
    return []
  }
}

/** 读项目自己记录的 codegraph daemon pid（不存在 / 读不动时返回 undefined）。 */
function readDaemonPid(cwd) {
  try {
    const parsed = JSON.parse(readFileSync(join(cwd, '.codegraph', 'daemon.pid'), 'utf8'))
    return typeof parsed?.pid === 'number' ? String(parsed.pid) : undefined
  } catch {
    return undefined
  }
}

const workDir = mkdtempSync(join(tmpdir(), 'dsh-cg-agent-scope-'))
const projectA = makeProject(workDir, 'project-a')
const projectB = makeProject(workDir, 'project-b')

const ToolRuntime = Tools.ToolRuntime ?? Tools.default
const agentA = { id: 'agent-A' }
const agentB = { id: 'agent-B' }
let scopeA
let scopeB

const cfgFor = (cwd) => ({
  serverName: 'codegraph',
  transport: 'stdio',
  command: 'codegraph',
  args: ['serve', '--mcp'],
  cwd,
  failOnStartupError: true,
})

try {
  const root = new Context()
  await root.plugin(SystemPrompt.SystemPrompt ?? SystemPrompt.default)
  await root.plugin(ToolRuntime, { mode: 'native' })
  scopeA = createScope(root, agentA)
  scopeB = createScope(root, agentB)

  // ---------- 1. scope 键就是 agent 对象本身 ----------
  record('agent.ctx 携带 scope 标签，且键是 agent 对象本身',
    scopeOf(scopeA.ctx) === agentA && scopeOf(scopeB.ctx) === agentB,
    `scopeOf(A.ctx)===agentA: ${String(scopeOf(scopeA.ctx) === agentA)} · scopeOf(B.ctx)===agentB: ${String(scopeOf(scopeB.ctx) === agentB)}`)

  // 反面：传 agent.ctx 当 scope 键会静默解析成**空层**（不报错）——这正是为什么
  // 本插件与 dsh-agent-loop 都必须用 agent 对象，而不是 agent.ctx。
  const wrongKeyEmpty = root.tools.schemas(scopeA.ctx).length === 0
  record('反面确认：拿 agent.ctx 当 scope 键会静默得到空视图（这是踩坑点，不是 bug）',
    wrongKeyEmpty,
    `schemas(agent.ctx).length = ${String(root.tools.schemas(scopeA.ctx).length)}`)

  // ---------- 2. 挂载：两个 scope 同名 serverName ----------
  await scopeA.ctx.plugin(McpClient, cfgFor(projectA))
  await scopeB.ctx.plugin(McpClient, cfgFor(projectB))
  const nameA = root.tools.schemas(agentA).map((s) => s.name)
  const nameB = root.tools.schemas(agentB).map((s) => s.name)
  const codegraphA = nameA.filter((n) => n.startsWith('mcp__codegraph__'))
  const codegraphB = nameB.filter((n) => n.startsWith('mcp__codegraph__'))
  record('两个 scope 挂同名 serverName 均成功，各自看到 codegraph 工具',
    codegraphA.length > 0 && codegraphB.length > 0,
    `A: ${codegraphA.join(',') || '(空)'} · B: ${codegraphB.join(',') || '(空)'}`)

  // 两个 scope 拿到的是**不同的 definition 对象**（同名不同绑定）
  const defA = root.tools.get('mcp__codegraph__codegraph_explore', agentA)
  const defB = root.tools.get('mcp__codegraph__codegraph_explore', agentB)
  record('同名工具在两个 scope 是不同的定义对象（各绑各的进程）',
    defA !== undefined && defB !== undefined && defA !== defB,
    `defA===defB: ${String(defA === defB)} · defA.execute===defB.execute: ${String(defA?.execute === defB?.execute)}`)

  // ---------- 3. 全局层干净（无索引的 agent 不该继承到任何 codegraph 工具） ----------
  const globalNames = root.tools.schemas(undefined).map((s) => s.name)
  record('全局层未被污染：没有 mcp__ 工具泄漏给未挂载的 agent',
    !globalNames.some((n) => n.startsWith('mcp__')),
    `schemas(global) = [${globalNames.join(',')}]`)

  // ---------- 4. 同一 scope 内同名必须报错（防「以为隔离了其实没有」） ----------
  let sameScopeError = ''
  try {
    await scopeA.ctx.plugin(McpClient, cfgFor(projectA))
  } catch (error) {
    sameScopeError = error instanceof Error ? error.message : String(error)
  }
  record('同一 scope 内重复同名被拒绝（隔离是按 scope 生效的实证）',
    sameScopeError.includes('already in use'),
    sameScopeError === '' ? '没有报错——隔离可能失效了！' : sameScopeError.slice(0, 140))

  // ---------- 5. 子进程隔离：每个 scope 各有自己的进程 ----------
  const pidsA = mcpPidsFor(projectA)
  const pidsB = mcpPidsFor(projectB)
  record('每个 scope 各自拉起自己的 MCP 子进程（按 cwd 区分）',
    pidsA.length > 0 && pidsB.length > 0,
    `cwd=${projectA}: pid ${pidsA.join(',') || '(无)'} · cwd=${projectB}: pid ${pidsB.join(',') || '(无)'}`)

  // ---------- 6. 释放 A 只回收 A ----------
  await scopeA.dispose()
  scopeA = undefined
  // 子进程退出是**异步**的：不能睡一个固定时长就断言（codegraph CG43 同款教训——固定等待在
  // 慢机器/并发环境下会假失败）。改成条件轮询：等 A 清空、且 B 稳定仍在。
  const gone = await waitFor(() => mcpPidsFor(projectA).length === 0, 8000)
  const afterA = mcpPidsFor(projectA)
  const afterB = mcpPidsFor(projectB)
  record('释放 scope A 后：A 的子进程已退出、B 的不受影响',
    gone && afterA.length === 0 && afterB.length > 0,
    `等待 ${String(gone)} · A 残留 pid: ${afterA.join(',') || '(无，已回收)'} · B 仍在: ${afterB.join(',') || '(无——不该为空！)'}`)

  record('释放 scope A 后：A 的工具视图消失，B 的仍在',
    root.tools.schemas(agentA).every((s) => !s.name.startsWith('mcp__codegraph__'))
      && root.tools.schemas(agentB).some((s) => s.name.startsWith('mcp__codegraph__')),
    `A: [${root.tools.schemas(agentA).map((s) => s.name).join(',')}] · B: [${root.tools.schemas(agentB).map((s) => s.name).join(',')}]`)

  // ---------- 7. 换项目必须换 scope（同 scope 不能重挂同名） ----------
  // 这条对应本插件挂载器里的「cwd 变了就 detach + 重新 attach」实现。
  // 注意 agentA2 必须是**同一个对象引用**：scope 键就是对象身份，写成两个字面量
  // 会得到两个不同的 scope（本文件第 2 条断言正是在说这件事）。
  const agentA2 = { id: 'agent-A2' }
  const fresh = createScope(root, agentA2)
  await fresh.ctx.plugin(McpClient, cfgFor(projectA))
  const freshOk = root.tools.schemas(agentA2).some((s) => s.name.startsWith('mcp__codegraph__'))
  record('换项目走「新 scope」是可行的（重挂同一 scope 会被同名拒绝）',
    freshOk,
    `新 scope 拿到工具: ${String(freshOk)}`)
  await fresh.dispose()
} catch (error) {
  record('整体执行', false, error instanceof Error ? error.message : String(error))
} finally {
  // 回收：自己造的 scope 全部释放，再兜底扫一次自己那两个临时项目下的残留进程
  try { await scopeA?.dispose() } catch { /* 已释放 */ }
  try { await scopeB?.dispose() } catch { /* 已释放 */ }
  await new Promise((resolve) => setTimeout(resolve, 1500))
  for (const project of [projectA, projectB]) {
    for (const pid of mcpPidsFor(project)) {
      try { process.kill(Number(pid), 'SIGTERM') } catch { /* 已退 */ }
    }
  }
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
