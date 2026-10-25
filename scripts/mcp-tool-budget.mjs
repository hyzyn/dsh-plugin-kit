/**
 * MCP 工具面**成本报告**（对正在跑的宿主，**只读**：只发一个 GET）。
 *
 * ## 为什么需要它
 *
 * MCP 工具是本仓唯一「不由本仓决定数量」的工具面：每配一行 server，core 的
 * `dsh-mcp-client` 就把该 server `tools/list` 的**每一个**工具以
 * `mcp__<serverName>__<tool>` 注册进来，本仓没有预算、没有上限、也没有提示。
 * 2026-10 的工具面审计实测：一台开发机上 MCP 工具 89 个，而原生插件（docker 18 + tty 19）
 * 只有 37 个 —— **约 70% 的工具面在 MCP 这边，且一个都没被披露整改覆盖**。
 *
 * 加一个 server 之前先跑这个脚本，就知道要多付多少常驻成本。
 *
 * ## 数字从哪来（不自己重算，避免第二份真相）
 *
 * 直接读 `GET /api/dsh-mcp/servers` 的 DTO。该 DTO 的 `toolCount` 由插件侧的
 * `registeredToolCounts()` 现算：它取 `tools.schemas()` 的**全局视图**，按
 * `mcp__<serverName>__` 前缀逐 server 计数（`packages/mcp/src/index.ts`）。
 * 所以这里数出来的就是**注册表里真实存在的**工具数，不是配置里的期望值。
 *
 * 两个必须说清的语义：
 *
 *   1. **这是全局基线**，与档位无关。受限档（只读 / 工作区内修改）下这些工具会从模型的
 *      工具表里被裁掉（由 mcp 包按 `mcp__` 前缀接进 `attachTierRestrict`），但注册表里仍在。
 *      所以本报告的数是「放开到完全权限时会看见多少」。
 *   2. **`toolCount` 缺失 ≠ 0**：缺失表示「读不到注册表」（宿主太旧 / tools 服务未组合），
 *      兼容「该行没连上」（一个工具都没注册）。两种都单独计数，不混进合计。
 *   3. **只数全局层**：`schemas()` 不传参 = 全局视图，所以**按 agent 作用域挂载的 server
 *      不计入**（例如把 `mcpScope` 设为 per-agent 的 codegraph，或任何用
 *      `agent.ctx.plugin(mcpClient, …)` 挂的 server）。这类 server 的工具只在对应 agent 的
 *      视图里出现，本报告会显示 `0` —— 那是「不在全局层」而**不是**「没有工具」。
 *      实测例：`artdevops` 行报 0，而某会话的工具表里它有 14 个（该行按 agent 挂载）。
 *
 * ## 用法
 *
 * ```sh
 * node scripts/mcp-tool-budget.mjs                    # 打表 + 合计
 * node scripts/mcp-tool-budget.mjs --budget 60        # 超过 60 个工具则退出码 1（可接 CI）
 * node scripts/mcp-tool-budget.mjs --url http://127.0.0.1:59060
 * node scripts/mcp-tool-budget.mjs --json             # 机器可读
 * ```
 *
 * 退出码：`0` 通过 / `1` 超预算 / `2` 宿主不可达或响应异常。
 *
 * 不写 shebang：本文件会被 `scripts/test/mcp-tool-budget.test.ts` import，
 * 而本仓 CI 实测过「被 import 的 .mjs 带 shebang + CRLF → 整份套件加载失败」。
 */

/** 宿主默认地址：与 `check-codegraph-per-agent.mjs` 同一口径（可用 `--url` 覆盖）。 */
export const DEFAULT_URL = 'http://127.0.0.1:3082'

/** 默认预算（工具数）。超了只警告；给 `--budget` 才变成退出码。 */
export const DEFAULT_BUDGET = 80

/**
 * 汇总一次 `/api/dsh-mcp/servers` 响应（**纯函数**，不碰网络，便于单测）。
 *
 * @param servers - DTO 里的 `servers` 数组（元素形状见 `buildServersDto`）
 * @returns 逐 server 的行 + 三个合计：已注册工具数、读不到数的行数、已停用的行数
 */
export function summarizeServers(servers) {
  const rows = (Array.isArray(servers) ? servers : []).map((entry) => {
    const raw = entry ?? {}
    const count = typeof raw.toolCount === 'number' && Number.isFinite(raw.toolCount) ? raw.toolCount : undefined
    return {
      serverName: typeof raw.serverName === 'string' ? raw.serverName : '(unknown)',
      transport: typeof raw.transport === 'string' ? raw.transport : '(unknown)',
      disabled: raw.disabled === true,
      toolCount: count,
    }
  })
  let live = 0
  let unknown = 0
  let disabled = 0
  for (const row of rows) {
    if (row.disabled) {
      disabled += 1
      continue
    }
    if (row.toolCount === undefined) {
      unknown += 1
      continue
    }
    live += row.toolCount
  }
  return { rows, live, unknown, disabled }
}

/** 报告是否超预算。`unknown > 0` **不算**超：不知道的数不能被当成 0，也不能被当成超标。 */
export function overBudget(summary, budget) {
  return typeof budget === 'number' && Number.isFinite(budget) && summary.live > budget
}

/** 该前缀对应的工具名判定（`mcp__<serverName>__<tool>`）；与 core 的命名规则同源。 */
export function isMcpToolName(name) {
  return typeof name === 'string' && name.startsWith('mcp__')
}

/* CLI（人工与后续 CI 走这条；纯判定函数由 scripts/test/ 覆盖） */
if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2)
  const flag = (name) => {
    const index = argv.indexOf(name)
    return index === -1 ? undefined : argv[index + 1]
  }
  const url = flag('--url') ?? process.env.DSH_HOST_URL ?? DEFAULT_URL
  const budgetRaw = flag('--budget')
  const budget = budgetRaw === undefined ? undefined : Number(budgetRaw)
  const asJson = argv.includes('--json')

  if (argv.includes('--help') || argv.includes('-h')) {
    console.log('用法：node scripts/mcp-tool-budget.mjs [--url <host>] [--budget <n>] [--json]')
    process.exit(0)
  }
  if (budget !== undefined && (!Number.isInteger(budget) || budget < 0)) {
    console.error(`[mcp-budget] --budget 必须是非负整数，收到 ${String(budgetRaw)}`)
    process.exit(2)
  }

  let payload
  try {
    const response = await fetch(`${url}/api/dsh-mcp/servers`, { signal: AbortSignal.timeout(5000) })
    if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
    payload = await response.json()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[mcp-budget] 取 ${url}/api/dsh-mcp/servers 失败：${message}`)
    console.error('[mcp-budget] 宿主没在跑？用 --url 指定实际地址（GUI 的地址栏里那个 http://127.0.0.1:<port>）。')
    process.exit(2)
  }

  const summary = summarizeServers(payload?.servers)
  if (asJson) {
    console.log(JSON.stringify({ url, patchFile: payload?.patchFile, ...summary }, null, 2))
  } else {
    console.log(`# MCP 工具面成本（${url}）`)
    console.log(`# patch：${String(payload?.patchFile ?? '(unknown)')}`)
    console.log('')
    const head = ['server', 'transport', 'state', 'tools']
    const body = summary.rows.map((row) => [
      row.serverName,
      row.transport,
      row.disabled ? 'disabled' : 'enabled',
      row.toolCount === undefined ? '?' : String(row.toolCount),
    ])
    const widths = head.map((cell, i) => Math.max(cell.length, ...body.map((line) => line[i].length)))
    const render = (line) => line.map((cell, i) => cell.padEnd(widths[i])).join('  ')
    console.log(render(head))
    console.log(render(widths.map((width) => '-'.repeat(width))))
    for (const line of body) console.log(render(line))
    console.log('')
    console.log(`合计：${String(summary.live)} 个工具（已启用的行）`)
    if (summary.unknown > 0) {
      console.log(`另有 ${String(summary.unknown)} 行没有 toolCount：读不到注册表或该 server 没连上（**不当作 0**）`)
    }
    if (summary.disabled > 0) console.log(`另有 ${String(summary.disabled)} 行已停用（不注册工具）`)
    if (budget !== undefined) {
      console.log(`预算：${String(budget)} —— ${overBudget(summary, budget) ? '超出' : '通过'}`)
    }
    console.log('')
    console.log('说明：这是**全局基线**（完全权限档能看见的量）；受限档下 mcp__* 会被裁掉。')
  }

  process.exit(overBudget(summary, budget) ? 1 : 0)
}
