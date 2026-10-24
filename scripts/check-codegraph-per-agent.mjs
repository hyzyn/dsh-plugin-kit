/**
 * `@hyzyn/dsh-codegraph` 的 **per-agent 是否真的生效** 检查器（对**正在跑的宿主**，只读）。
 *
 * 为什么要单独一个脚本：`per-agent` 的「生效」不是一个布尔值，而是五件事同时成立——
 * 模式解析、全局行互斥、每 agent 一进程、cwd 是各自的索引根、无索引不回落。
 * 卡片上只能看到其中一部分；`/agents` 只给记录、不给进程；进程层还埋着 codegraph CG46 那个坑
 * （CLI 自己的常驻 daemon 也匹配 `serve --mcp`，按名字数会数出双倍）。
 *
 * 五层判据（本脚本逐条查，每条都打印实际值与期望）：
 *
 *   ① 模式        `/default-path` 的 `effectiveMcpScope === 'per-agent'` 且**没有** fallback
 *   ② 挂载记录    `/agents` 的 `mounted`/`live` 与每条记录的 `cwd`（应为该会话的**索引根**）
 *   ③ 全局行互斥  补丁里**不存在启用状态的 codegraph MCP 行**
 *   ④ 进程        **宿主直接子进程**里的 codegraph 进程数 == `live`
 *   ⑤ 不回落      无索引的 agent 记录为 `mounted:false` 且 reason 说明「不回落」
 *
 * 关于 ③ 的一个易错点（我第一版判据说窄了）：互斥有**两种**实现，取决于那行归谁管——
 *
 *   - **dsh-mcp 卡片托管的区块**（`- id: mcp-codegraph-managed`）→ **挂起**：保留行，
 *     加 `disabled: true` 与 `# dsh-codegraph: suspended` 标记（那是用户可见、可能有注释的行，
 *     删掉就丢了用户的内容），切回 managed 时按标记还原；
 *   - **插件自己的区块**（`# --- dsh-codegraph mcp managed (auto-generated) ---`）→ **直接删掉**
 *     （自动生成、无用户内容可保；而且留一个 `disabled: true` 的自有行，万一标记被破坏，
 *     切回 managed 时全局 MCP 就再也不注册了——那种坑极难诊断）。
 *
 * 所以判据是「**文件里没有启用态的 codegraph 行**」，而**不是**「必须看到 disabled: true」。
 *
 * ③ 还有一个**版本事实**要记住：CG70 起本插件把托管行写进**本 profile 的层**
 * （`$DSH_HOME/profiles/<name>/cordis.patch.yml`），home 层只在拿不到 `profileContext`
 * 时才写。所以补丁位置按这个顺序解析，一个都读不到就**明确 SKIP 并说清原因**（不再像
 * 第一版那样在隔离 home 下静默跳过、把「没检查」读成「通过」）：
 *
 *   1. `--patch <path>`（显式指定，最准）；
 *   2. 宿主自己报的位置：`GET /diagnose` 报告里的「托管行（<path>）」那一行；
 *   3. `--profile <name>` 对应的 profile 层；
 *   4. `$DSH_HOME/cordis.patch.yml`（老版本 / 最小宿主）。
 *
 * 用法：
 *   node scripts/check-codegraph-per-agent.mjs [--url http://127.0.0.1:3082] [--expect per-agent]
 *   node scripts/check-codegraph-per-agent.mjs --profile test --expect managed
 *   node scripts/check-codegraph-per-agent.mjs --patch /tmp/x/cordis.patch.yml --expect managed
 *
 * `--expect managed` 可反过来断言「已切回 managed」。
 *
 * 本脚本**只读**：它不发任何写请求（切模式由调用方自己 POST /settings），也不写文件。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const argv = process.argv.slice(2)
const flag = (name) => {
  const index = argv.indexOf(name)
  return index === -1 ? undefined : argv[index + 1]
}
const baseUrl = (flag('--url') ?? 'http://127.0.0.1:3082').replace(/\/$/, '')
const expect = flag('--expect') ?? 'per-agent'

let failures = 0
const check = (ok, name, detail) => {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === undefined ? '' : `\n      ${detail}`}`)
}
const skip = (name, detail) => { console.log(`SKIP  ${name}\n      ${detail}`) }

const getJson = async (path) => {
  const response = await fetch(`${baseUrl}${path}`)
  if (!response.ok) throw new Error(`${path} → HTTP ${String(response.status)}`)
  return response.json()
}

console.log(`# dsh-codegraph per-agent 检查（期望状态：${expect}）`)
console.log(`# ${baseUrl}\n`)

let defaultPath
let agents
try {
  defaultPath = await getJson('/api/dsh-codegraph/default-path')
  agents = await getJson('/api/dsh-codegraph/agents')
} catch (error) {
  check(false, '宿主可达且插件路由在', `${String(error?.message ?? error)}（宿主没起？端口不对？）`)
  process.exit(1)
}

/* ── ① 模式解析 ─────────────────────────────────────────────────── */
const requested = defaultPath.mcpScope
const effective = defaultPath.effectiveMcpScope
const reason = defaultPath.mcpScopeReason
check(
  requested === expect && effective === expect,
  `① 模式：请求值 = 生效值 = ${expect}`,
  `mcpScope=${String(requested)} effectiveMcpScope=${String(effective)}\n      reason=${String(reason)}`,
)
if (requested === 'per-agent' && effective !== 'per-agent') {
  console.log('      提示：上面 reason 就是**退回 managed 的原因**（三种前提之一不成立，见 scope.ts resolveScopeMode）')
}

/* ── ② 挂载记录 ─────────────────────────────────────────────────── */
if (expect === 'per-agent') {
  check(agents.fallback === false, '② /agents 没有 fallback', `fallback=${String(agents.fallback)} mode=${String(agents.mode)}`)
  check(
    agents.live === agents.mounted,
    '② 挂载数自洽（live == mounted，没有未回收的 fiber 泄漏）',
    `mounted=${String(agents.mounted)} live=${String(agents.live)}`,
  )
  check(agents.mounted > 0, '② 至少一个 agent 真的挂上了', `mounted=${String(agents.mounted)} / agents=${String(agents.agents.length)}`)
  for (const agent of agents.agents) {
    const rootIsCwd = typeof agent.root === 'string' && agent.root !== '' && typeof agent.cwd === 'string'
    check(
      agent.mounted !== true || (rootIsCwd && agent.reason === '已挂载'),
      `② agent ${agent.id.slice(0, 30)}… 的挂载记录完整`,
      `cwd=${String(agent.cwd)}\n      root=${String(agent.root)}\n      mounted=${String(agent.mounted)} reason=${String(agent.reason)}`,
    )
  }
  const unmounted = agents.agents.filter((agent) => agent.mounted !== true)
  if (unmounted.length > 0) {
    console.log('      注意：以下 agent 未挂载——**这是设计**（不回落，避免拿到别的项目上下文）：')
    for (const agent of unmounted) console.log(`        ${agent.id.slice(0, 30)}…  ${String(agent.reason)}`)
  }
} else {
  check(agents.mode === 'managed', '② /agents 报 managed', `mode=${String(agents.mode)} mounted=${String(agents.mounted)}`)
}

/* ── ③ 全局行互斥 ───────────────────────────────────────────────── */
// DSH_HOME 若已设置，它**就是** ~/.dsh（不是它的父目录）——这里多拼一层会得到
// `~/.dsh/.dsh/cordis.patch.yml`，然后静默 SKIP 掉整个互斥检查（本脚本第一版就是这样）。
const dshHome = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
const homePatch = join(dshHome, 'cordis.patch.yml')
const profileFlag = flag('--profile')
const patchFlag = flag('--patch')

/**
 * 宿主**自己**报的托管行文件位置（CG70：它写的是本 profile 的层，不是 home 层）。
 * 用 /diagnose 而不是自己拼路径：那是「本实例真正写的那份」，profile 名 / 自定义层
 * 都不必在这里重算一遍。拿不到就返回 undefined（诊断包可能因为别的原因失败）。
 */
const patchPathFromHost = async () => {
  try {
    const report = await getJson('/api/dsh-codegraph/diagnose')
    const line = String(report?.report ?? '').split('\n').find((row) => row.startsWith('--- 托管行（'))
    if (line === undefined) return undefined
    const match = line.match(/^--- 托管行（(.+)）---$/)
    return match?.[1]
  } catch {
    return undefined
  }
}

/** 按「显式 → 宿主自报 → profile 层 → home 层」解析要读的补丁文件。 */
const resolvePatchFile = async () => {
  const candidates = [
    patchFlag,
    await patchPathFromHost(),
    profileFlag === undefined ? undefined : join(dshHome, 'profiles', profileFlag, 'cordis.patch.yml'),
    homePatch,
  ].filter((item) => typeof item === 'string' && item !== '')
  return candidates.find((item) => existsSync(item))
}

const patchPath = await resolvePatchFile()
if (patchPath === undefined) {
  skip(
    '③ 全局行互斥',
    `找不到补丁文件（候选：--patch / 宿主 /diagnose 自报 / --profile <name> / ${homePatch}）——`
    + '隔离 DSH_HOME 或自定义 profile 时请用 --patch <path> 或 --profile <name> 指定',
  )
} else {
  console.log(`      ③ 读的补丁：${patchPath}`)
  const text = readFileSync(patchPath, 'utf8')
  const lines = text.split('\n')
  // 找所有 codegraph MCP 行，判断有没有「启用态」的（`serverName: codegraph` 且未被 disabled 罩住）
  const rows = []
  let current = undefined
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*-\s+id:/.test(line)) { current = { at: i, id: line.trim(), disabled: false, serverName: undefined }; rows.push(current) }
    if (current === undefined) continue
    if (/serverName:\s*codegraph\s*$/.test(line)) current.serverName = 'codegraph'
    if (/^\s*disabled:\s*['"]?true['"]?\s*$/.test(line)) current.disabled = true
    if (/^\s*-\s+id:/.test(line) && current.at !== i) { /* 新行已开 */ }
  }
  const codegraphRows = rows.filter((row) => row.serverName === 'codegraph')
  const enabled = codegraphRows.filter((row) => !row.disabled)
  const suspendedMarker = /dsh-codegraph:\s*suspended/.test(text)
  // 「自有区块已清空」= 区块体里**没有 codegraph 行**。空占位 `- insert: []` 也算清空
  // （它的语义就是「零行」）；旧正则要求「块内一片空白」，于是把挂起后留下的合法空占位
  // 报成 false（读起来像没清干净，实际是对的——2026-10-24 真机验对）。
  const ownBlockBody = (() => {
    const start = lines.findIndex((line) => line.includes('dsh-codegraph mcp managed') && !line.includes('end dsh-codegraph mcp managed'))
    if (start === -1) return undefined
    const end = lines.findIndex((line, index) => index > start && line.includes('end dsh-codegraph mcp managed'))
    return lines.slice(start + 1, end === -1 ? start + 1 : end)
  })()
  const ownBlockEmpty = ownBlockBody === undefined
    || !ownBlockBody.some((line) => /serverName:\s*codegraph|id:\s*mcp-codegraph-managed/.test(line))

  if (expect === 'per-agent') {
    check(
      enabled.length === 0,
      '③ 全局行互斥：补丁里没有**启用态**的 codegraph MCP 行',
      `codegraph 行 ${String(codegraphRows.length)} 条（其中启用 ${String(enabled.length)}）`
        + `\n      挂起标记 disabled+marker: ${String(suspendedMarker)}`
        + `\n      自有区块已清空: ${String(ownBlockEmpty)}`
        + '\n      （互斥有两种实现：dsh-mcp 托管块→挂起；插件自有块→删除。判据是「没有启用态的行」，不是「必须看到 disabled」）',
    )
  } else {
    check(
      enabled.length > 0,
      '③ 已切回 managed：补丁里重新有了启用态的 codegraph 行',
      `codegraph 行 ${String(codegraphRows.length)} 条（其中启用 ${String(enabled.length)}）`
        + `\n      残留挂起标记: ${String(suspendedMarker)}（应为 false——不残留 disabled 才算干净还原）`,
    )
    check(!suspendedMarker, '③ 切回 managed 后不残留挂起标记', `残留: ${String(suspendedMarker)}`)
  }
}

/* ── ④ 进程层 ───────────────────────────────────────────────────── */
const port = new URL(baseUrl).port === '' ? '80' : new URL(baseUrl).port
const lsof = spawnSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' })
const hostPid = (lsof.stdout ?? '').trim().split('\n').filter((line) => line !== '')[0]
if (hostPid === undefined) {
  skip('④ 进程层', `拿不到监听 ${port} 的宿主 pid（lsof 不可用？）`)
} else {
  // **直接子进程**：CLI 自己的常驻 daemon（.codegraph/daemon.pid）不是宿主的直接子进程，
  // 这样查天然把它排除掉——按进程名全局 pgrep 会把它算进来（codegraph CG46）。
  const pgrep = spawnSync('pgrep', ['-P', hostPid, '-f', 'codegraph'], { encoding: 'utf8' })
  const pids = (pgrep.stdout ?? '').trim().split('\n').filter((line) => line !== '')
  const cwds = pids.map((pid) => {
    const info = spawnSync('lsof', ['-a', '-p', pid, '-d', 'cwd', '-Fn'], { encoding: 'utf8' })
    return ((info.stdout ?? '').split('\n').find((line) => line.startsWith('n')) ?? 'n?').slice(1)
  })
  const detail = `宿主 pid=${hostPid} 直接子进程 ${String(pids.length)} 个：\n`
    + pids.map((pid, index) => `        pid=${pid} cwd=${cwds[index]}`).join('\n')
  if (expect === 'per-agent') {
    check(pids.length === agents.live, '④ 进程数 == /agents 的 live 数', `${detail}\n      /agents live=${String(agents.live)}`)
    check(
      cwds.every((cwd) => agents.agents.some((agent) => agent.root === cwd)),
      '④ 每个挂载进程的 cwd 都等于某个 agent 的索引根',
      detail,
    )
  } else {
    // managed 生效时**全局那份 MCP 就是宿主的直接子进程**（loader 按托管行装载），所以
    // 「pids.length === 0」是错的判据——实测它会在「回滚完全正确」时判 FAIL（本脚本第一版
    // 就是这么写的）。要验的是「没有 per-agent 残留」：最多 1 个，且 cwd 等于托管行的 cwd。
    const row = (defaultPath.mcp ?? {})
    const rowLive = (row.mode === 'own' || row.mode === 'dsh-mcp' || row.mode === 'external') && row.disabled !== true
    check(
      pids.length <= 1,
      '④ managed 模式下没有 per-agent 残留（最多 1 个全局 MCP 子进程）',
      `${detail}\n      托管行 mode=${String(row.mode)} disabled=${String(row.disabled)} cwd=${String(row.cwd)}`,
    )
    check(
      pids.length === 0 || row.cwd === undefined || cwds[0] === row.cwd,
      '④ 全局 MCP 子进程的 cwd 等于托管行 cwd（不是别的项目）',
      `${detail}\n      托管行 cwd=${String(row.cwd)}`,
    )
    if (rowLive && pids.length === 0) {
      console.log('      提示：托管行是启用态但当下没有子进程——切换模式后 MCP 连接可能还在重建，稍等再跑一次。')
    }
  }
}

/* ── ⑤ 不回落语义（只提示怎么测，不自动判） ─────────────────────── */
console.log('INFO  ⑤「无索引不回落」怎么测：在 test profile 里新开一个会话，工作目录选一个**没有 '
  + '.codegraph/ 索引**的目录（例如 /tmp），再跑一次本脚本——那个 agent 应显示 '
  + '`mounted: false` + reason「会话目录没有可用的 .codegraph/ 索引，未挂载（不回落…）」，'
  + '且它拿不到 mcp__codegraph__* 工具。')

console.log(`\n# 汇总：FAIL ${String(failures)}`)
process.exit(failures === 0 ? 0 : 1)
