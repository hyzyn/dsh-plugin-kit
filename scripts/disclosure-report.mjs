/**
 * **披露面**测量报告（**只读**，一条命令摊开三件事：公告长度 / MCP 工具面 / 档位分类表规模）。
 *
 * ## 为什么需要它
 *
 * 「把提示词成本降下来」这件事在本仓被拆成了三块，各有各的闸门或脚本，但**没有一处能一眼看完**：
 *
 *   1. **公告**（`*_GUIDANCE`）：8 段注入 systemPrompt 的常量，每轮都在上下文里。断言在
 *      `scripts/test/announcement-budget.test.ts`（预算 250 字符/段），只有红了才知道；
 *   2. **MCP 工具面**：`mcp__<server>__<tool>` 每个都进注册表，成本报告在
 *      `scripts/mcp-tool-budget.mjs`（`pnpm mcp-budget`，要对正在跑的宿主发 GET）；
 *   3. **档位分类表**：`DOCKER_TIER_CLASS` / `TTY_TIER_CLASS` / `LOGLENS_TIER_CLASS` 决定
 *      受限档能看见什么，真实注册面要 `pnpm --filter @hyzyn/dsh-kit run tier-smoke` 才能验。
 *
 * 这份报告把前两层的**数字**和第三层的**表规模**拼在一屏里，回答「这一轮披露面到底多大、哪一块
 * 在涨」。它**不是闸门**：只有「公告超预算」会拿到退出码 1（那本来就是守卫的判据，报告只是顺手
 * 把它摆出来）；宿主不可达、预构建产物没生成之类的情况一律打印 `SKIP` 并继续——报告挂了不该
 * 拦住任何人。
 *
 * ## 数字从哪来（不自己重算，避免第二份真相）
 *
 *   - **公告**：`measureAnnouncements()` 来自 `scripts/announcement-budget.mjs`（与守卫同一份
 *     抽取实现，不复制解析器）；
 *   - **MCP**：`summarizeServers()` / `overBudget()` 来自 `scripts/mcp-tool-budget.mjs`
 *     （与 `pnpm mcp-budget` 同一个 DTO、同一个口径；那边算的是**全局基线**）；
 *   - **档位**：直接 `import()` 各包 `lib/` 里现成的 `*_TIER_CLASS` 表——**不另抄一份名单**。
 *     注意 `LOGLENS_TIER_CLASS` 只在 `packages/loglens/lib/tools.js` 里导出（`lib/index.js`
 *     没有再导出它），所以那份表带 `from` 列写明取自哪个文件。
 *
 * ## 用法
 *
 * ```sh
 * node scripts/disclosure-report.mjs                  # = pnpm disclosure-report
 * node scripts/disclosure-report.mjs --url http://127.0.0.1:59060   # 默认 127.0.0.1:3082（与 mcp-budget 同一口径）
 * node scripts/disclosure-report.mjs --no-mcp         # 不碰网络（离线 / 不想等 5s 超时）
 * node scripts/disclosure-report.mjs --json           # 机器可读（四个键：announcements / mcp / tiers / conclusion）
 * ```
 *
 * 退出码：`0` 报告完成且无公告超预算 / `1` 有公告超预算 / `2` 报告本身跑不动
 * （读不到 `packages/`，扫描面为空）——**宿主不可达不是 2**，它只让第二节变 `SKIP`。
 *
 * 本文件**只读**：不落盘、不建目录、不改配置。测试见 `scripts/test/disclosure-report.test.ts`
 * （覆盖格式化函数 + 「源码里没有任何落盘调用」）。
 *
 * 不写 shebang：本文件会被 `.ts` 用例 import，而本仓 CI 实测过
 * 「被 import 的 .mjs 带 shebang + CRLF → 整份套件加载失败」。
 */
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  ANNOUNCEMENT_BUDGET,
  ANNOUNCEMENT_NAMES,
  ANNOUNCEMENT_PACKAGES,
  measureAnnouncements,
} from './announcement-budget.mjs'
import { DEFAULT_URL, overBudget, summarizeServers } from './mcp-tool-budget.mjs'

/** 宿主默认地址：**照 `mcp-tool-budget.mjs` 的口径**（同一个 `DEFAULT_URL`，不另起一个默认值）。 */
export { DEFAULT_URL }

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 档位分类表在哪（`lib/` 是入库的预构建产物；先找再导出它的入口，找不到再退到声明它的模块）。 */
export const TIER_SOURCES = [
  { pkg: 'docker', constant: 'DOCKER_TIER_CLASS', candidates: ['packages/docker/lib/index.js'] },
  { pkg: 'tty', constant: 'TTY_TIER_CLASS', candidates: ['packages/tty/lib/index.js'] },
  { pkg: 'loglens', constant: 'LOGLENS_TIER_CLASS', candidates: ['packages/loglens/lib/index.js', 'packages/loglens/lib/tools.js'] },
]

/** 「相关入口」——报告的下一步总是这三条之一（顺序即推荐顺序）。 */
export const ENTRY_POINTS = [
  'pnpm verify:list',
  'pnpm --filter @hyzyn/dsh-kit run tier-smoke',
  'pnpm mcp-budget',
]

/* ------------------------------------------------------------------ *
 * 一、公告长度表
 * ------------------------------------------------------------------ */

/**
 * 把测量记录整理成表格行（**纯函数**：输入是 `measureAnnouncements()` 的输出或等价 fixture）。
 *
 * 顺序按**名单**（`roster`）走，不按扫描顺序：报告要和人脑里的那份名单对得上；名单外多出来的
 * 测量（例如仓里另有同名常量）排在后面，不被吞掉。
 *
 * 三种 `state`：
 *   - `measured`：量到了（`chars` 是数字）；
 *   - `abstained`：抽到了但右值不是「字面量 + 链」，静态量不出来（与守卫的弃权同义）；
 *   - `missing`：名单里有、源码里没抽到（守卫会把这条判红，报告只负责照出来）。
 *
 * @param {readonly object[]} measurements - `{ name, pkg, file, line, length }` 数组
 * @param {readonly string[]} [roster] - 名单（缺省 `ANNOUNCEMENT_NAMES`）
 * @param {number} [budget] - 每段预算（缺省 `ANNOUNCEMENT_BUDGET`）
 * @returns {{ rows: object[], total: number, budget: number, measured: number, abstained: number, missing: number, over: object[] }}
 */
export function summarizeAnnouncements(measurements, roster = ANNOUNCEMENT_NAMES, budget = ANNOUNCEMENT_BUDGET) {
  const list = Array.isArray(measurements) ? measurements.filter((entry) => entry != null) : []
  const rows = []
  const used = new Set()

  const push = (measurement) => {
    const length = typeof measurement.length === 'number' && Number.isFinite(measurement.length) ? measurement.length : null
    const chars = length
    const margin = chars === null ? null : budget - chars
    rows.push({
      name: typeof measurement.name === 'string' ? measurement.name : '(unknown)',
      pkg: typeof measurement.pkg === 'string' ? measurement.pkg : '(unknown)',
      file: typeof measurement.file === 'string' ? measurement.file : null,
      line: typeof measurement.line === 'number' ? measurement.line : null,
      chars,
      budget,
      margin,
      over: chars !== null && chars > budget,
      state: chars === null ? 'abstained' : 'measured',
    })
  }

  for (const name of roster) {
    const hits = list.filter((entry) => entry.name === name)
    if (hits.length === 0) {
      rows.push({
        name,
        pkg: ANNOUNCEMENT_PACKAGES[name] ?? '(unknown)',
        file: null,
        line: null,
        chars: null,
        budget,
        margin: null,
        over: false,
        state: 'missing',
      })
      continue
    }
    for (const hit of hits) {
      used.add(hit)
      push(hit)
    }
  }
  for (const hit of list) if (!used.has(hit)) push(hit)

  const measuredRows = rows.filter((row) => row.state === 'measured')
  const total = measuredRows.reduce((sum, row) => sum + row.chars, 0)
  return {
    rows,
    total,
    budget,
    measured: measuredRows.length,
    abstained: rows.filter((row) => row.state === 'abstained').length,
    missing: rows.filter((row) => row.state === 'missing').length,
    over: rows.filter((row) => row.over),
  }
}

/** 显示宽度（CJK / 全角按 2 计；只为了让表在等宽字体里对齐，不参与任何判据）。 */
function displayWidth(text) {
  let width = 0
  for (const char of String(text)) {
    const code = char.codePointAt(0) ?? 0
    width +=
      code >= 0x1100 &&
      (code <= 0x115f ||
        (code >= 0x2e80 && code <= 0xa4cf) ||
        (code >= 0xac00 && code <= 0xd7a3) ||
        (code >= 0xf900 && code <= 0xfaff) ||
        (code >= 0xfe30 && code <= 0xfe6f) ||
        (code >= 0xff00 && code <= 0xff60) ||
        (code >= 0xffe0 && code <= 0xffe6) ||
        (code >= 0x1f300 && code <= 0x1f64f) ||
        (code >= 0x1f900 && code <= 0x1f9ff))
        ? 2
        : 1
  }
  return width
}

/** 按显示宽度右侧补空格。 */
function padCell(text, width) {
  const value = String(text)
  return value + ' '.repeat(Math.max(0, width - displayWidth(value)))
}

/** 渲染成固定宽度的表（行内各列按同一组宽度对齐）。 */
function renderTable(head, body) {
  const widths = head.map((cell, index) =>
    Math.max(displayWidth(cell), ...body.map((line) => displayWidth(line[index] ?? ''))),
  )
  const render = (line) =>
    line
      .map((cell, index) => padCell(cell ?? '', widths[index]))
      .join('  ')
      .replace(/[ \t]+$/u, '')
  return [render(head), render(widths.map((width) => '-'.repeat(width))), ...body.map((line) => render(line))]
}

/**
 * 渲染第一节（公告长度表）。末行合计：**逐条之和**（实测段数 × 预算 = 合计预算）。
 *
 * @param {ReturnType<typeof summarizeAnnouncements>} summary
 * @returns {string[]}
 */
export function formatAnnouncementTable(summary) {
  const rows = summary.rows
  const body = rows.map((row) => {
    const marker = row.over ? '✘ ' : ''
    const chars = row.chars === null ? (row.state === 'missing' ? '—' : '?') : String(row.chars)
    const margin = row.margin === null ? (row.state === 'missing' ? '—' : '?') : String(row.margin)
    return [`${marker}${row.name}`, row.pkg, chars, String(summary.budget), margin]
  })
  const margins = rows.filter((row) => row.margin !== null)
  const totalMargin = margins.reduce((sum, row) => sum + row.margin, 0)
  body.push([
    `合计（实测 ${summary.measured} 段）`,
    '',
    String(summary.total),
    String(summary.budget * summary.measured),
    String(totalMargin),
  ])

  const lines = [
    `# 一、公告长度（预算 ${summary.budget} 字符/段；每段每一轮都在上下文里）`,
    ...renderTable(['名字', '包', '字符数', `预算 ${summary.budget}`, '余量'], body),
  ]
  if (summary.measured > 0) {
    lines.push(
      '',
      `合计余量 = 逐条余量之和；**单段超预算才算违规**（合计为负只说明这 ${summary.measured} 段用满了信封）。`,
    )
  }
  if (summary.abstained > 0) {
    lines.push(`? = 抽到了但右值不是「字面量 + 链」，静态量不出来（弃权，${summary.abstained} 段）`)
  }
  if (summary.missing > 0) {
    lines.push(`— = 名单里有、源码里没抽到（${summary.missing} 段；守卫会把这条判红）`)
  }
  if (summary.over.length > 0) {
    lines.push('')
    lines.push(
      `✘ ${summary.over.length} 段超预算：` +
        summary.over
          .map((row) => `${row.name}（${row.chars} 字符，超 ${row.chars - summary.budget}）`)
          .join('、'),
    )
  }
  return lines
}

/* ------------------------------------------------------------------ *
 * 二、MCP 工具面（可选；宿主不可达就 SKIP）
 * ------------------------------------------------------------------ */

/**
 * 对**正在跑的宿主**发一个只读 GET（`/api/dsh-mcp/servers`），失败一律折成 `status: 'skip'`。
 *
 * @param {string} url - 宿主地址
 * @returns {Promise<{status: 'ok'|'skip', url: string, patchFile?: string|null, summary?: object, reason?: string}>}
 */
export async function fetchMcpSurface(url = DEFAULT_URL) {
  try {
    const response = await fetch(`${url}/api/dsh-mcp/servers`, { signal: AbortSignal.timeout(5000) })
    if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
    const payload = await response.json()
    return {
      status: 'ok',
      url,
      patchFile: typeof payload?.patchFile === 'string' ? payload.patchFile : null,
      summary: summarizeServers(payload?.servers),
    }
  } catch (error) {
    // Node 的 fetch 只给一句 `fetch failed`，真正的原因（ECONNREFUSED / 超时）在 cause 上
    const reason = error instanceof Error
      ? [error.message, error.cause instanceof Error ? error.cause.message : undefined].filter(Boolean).join('：')
      : String(error)
    return { status: 'skip', url, reason }
  }
}

/**
 * 渲染第二节。`skip` 时只打一行 SKIP —— **报告不因为宿主没在跑而失败**。
 *
 * @param {{status: 'ok'|'skip', url: string, patchFile?: string|null, summary?: object, reason?: string}} mcp
 * @param {number|undefined} [budget] - 给了才判「超预算」（本报告默认不给，退出码只看公告）
 * @returns {string[]}
 */
export function formatMcpSection(mcp, budget = undefined) {
  const lines = [`# 二、MCP 工具面（只读 GET ${mcp.url}/api/dsh-mcp/servers）`]
  if (mcp.status !== 'ok' || mcp.summary === undefined) {
    lines.push(`[SKIP] ${mcp.reason ?? '宿主不可达'}`)
    lines.push('[SKIP] 这是报告不是闸门：宿主没在跑就跳过这一节；要看数字请先起宿主，或用 --url 指到实际地址')
    return lines
  }
  const summary = mcp.summary
  const body = summary.rows.map((row) => [
    row.serverName,
    row.transport,
    row.disabled ? 'disabled' : 'enabled',
    row.toolCount === undefined ? '?' : String(row.toolCount),
  ])
  lines.push(...renderTable(['server', 'transport', 'state', 'tools'], body))
  lines.push('')
  lines.push(`合计：${summary.live} 个工具（已启用的行）`)
  if (summary.unknown > 0) {
    lines.push(`另有 ${summary.unknown} 行没有 toolCount：读不到注册表或该 server 没连上（**不当作 0**）`)
  }
  if (summary.disabled > 0) lines.push(`另有 ${summary.disabled} 行已停用（不注册工具）`)
  if (typeof budget === 'number') {
    lines.push(`预算 ${budget} —— ${overBudget(summary, budget) ? '超出' : '通过'}`)
  }
  lines.push('口径：这是**全局基线**（完全权限档能看见的量）；受限档下 `mcp__*` 会被裁掉。')
  return lines
}

/* ------------------------------------------------------------------ *
 * 三、档位分类表规模
 * ------------------------------------------------------------------ */

/**
 * 动态 `import()` 三张档位分类表（**只读**；`lib/` 是入库的预构建产物，读它就是读当前发布形态）。
 *
 * 每个来源按 `candidates` 顺序试：**先找再导出它的那个入口**，取不到再退到声明它的模块
 * （`loglens` 就是这种情况——`lib/index.js` 没有再导出 `LOGLENS_TIER_CLASS`）。
 * 全试完仍取不到时保留 `error` 文案（不抛：报告要继续）。
 *
 * @param {string} [repoRoot] - 仓库根
 * @returns {Promise<object[]>} 每项 `{ pkg, constant, candidates, classes?, from?, error? }`
 */
export async function loadTierClasses(repoRoot = REPO_ROOT) {
  const loaded = []
  for (const source of TIER_SOURCES) {
    let found
    let error
    for (const relativePath of source.candidates) {
      try {
        const module = await import(pathToFileURL(join(repoRoot, relativePath)).href)
        const table = module?.[source.constant]
        if (table === undefined || table === null || typeof table !== 'object') {
          error = `${relativePath} 没有导出 ${source.constant}`
          continue
        }
        found = { ...source, classes: table, from: relativePath }
        break
      } catch (cause) {
        error = `${relativePath}：${cause instanceof Error ? cause.message : String(cause)}`
      }
    }
    loaded.push(found ?? { ...source, error: error ?? '取不到分类表' })
  }
  return loaded
}

/**
 * 逐包统计 `read` / `write` / `exec` 各几个（**纯函数**；`classes` 是分类表对象）。
 *
 * `other` 单列：分类表里出现三种之外的值是实现错，报告不能把它悄悄算进某一档。
 *
 * @param {readonly object[]} sources - `loadTierClasses()` 的输出（或等价 fixture）
 * @returns {{ rows: object[], read: number, write: number, exec: number, other: number, total: number, readable: number }}
 */
export function summarizeTierClasses(sources) {
  const rows = (Array.isArray(sources) ? sources : []).map((entry) => {
    const classes = entry?.classes && typeof entry.classes === 'object' ? entry.classes : null
    const counts = { read: 0, write: 0, exec: 0, other: 0 }
    if (classes !== null) {
      for (const value of Object.values(classes)) {
        if (value === 'read' || value === 'write' || value === 'exec') counts[value] += 1
        else counts.other += 1
      }
    }
    const total = counts.read + counts.write + counts.exec + counts.other
    return {
      pkg: typeof entry?.pkg === 'string' ? entry.pkg : '(unknown)',
      constant: typeof entry?.constant === 'string' ? entry.constant : '(unknown)',
      from: typeof entry?.from === 'string' ? entry.from : null,
      error: typeof entry?.error === 'string' ? entry.error : null,
      read: counts.read,
      write: counts.write,
      exec: counts.exec,
      other: counts.other,
      total,
    }
  })
  const sum = (key) => rows.reduce((total, row) => total + row[key], 0)
  return {
    rows,
    read: sum('read'),
    write: sum('write'),
    exec: sum('exec'),
    other: sum('other'),
    total: sum('total'),
    readable: rows.filter((row) => row.error === null).length,
  }
}

/**
 * 渲染第三节。
 *
 * ⚠️ 这一节报的是**分类表规模**（源码里那张 `*_TIER_CLASS` 有几条），**不是各档真实注册面**：
 * 真实注册面取决于运行时注册了哪些工具（`allowMutations` / `allowExec` 开关、per-agent 挂载、
 * 档位闸的裁剪），只有对着正在跑的宿主跑 `tier-smoke` 才算数。
 *
 * @param {ReturnType<typeof summarizeTierClasses>} summary
 * @returns {string[]}
 */
export function formatTierSection(summary) {
  const body = summary.rows.map((row) => {
    if (row.error !== null) return [row.pkg, row.constant, '—', '—', '—', '读不到']
    return [
      row.pkg,
      row.constant,
      String(row.read),
      String(row.write),
      String(row.exec),
      String(row.total),
    ]
  })
  body.push(['合计', '', String(summary.read), String(summary.write), String(summary.exec), String(summary.total)])

  const lines = [
    '# 三、档位分类表规模（各包 *_TIER_CLASS 的条目数）',
    ...renderTable(['包', '分类表', 'read', 'write', 'exec', '合计'], body),
  ]
  if (summary.other > 0) lines.push(`⚠️ 有 ${summary.other} 个条目的档位值不在 read/write/exec 里（分类表写错了）`)
  for (const row of summary.rows) {
    if (row.error !== null) lines.push(`[SKIP] ${row.pkg} 读不到 ${row.constant}：${row.error}`)
    else if (row.from !== null && row.from.endsWith('/tools.js')) {
      lines.push(`[口径] ${row.pkg} 的 ${row.constant} 取自 ${row.from}（lib/index.js 没有再导出它）`)
    }
  }
  lines.push(
    '',
    'mcp__*    本仓判不了读写，接线里一律 exec（mcp 包按 `mcp__` 前缀接进 attachTierRestrict）',
    '⚠️ 这是「分类表规模」，**不是各档真实注册面**——后者要正在跑的宿主，口径是：',
    '   pnpm --filter @hyzyn/dsh-kit run tier-smoke',
  )
  return lines
}

/* ------------------------------------------------------------------ *
 * 四、结论
 * ------------------------------------------------------------------ */

/**
 * 一行结论 + 「相关入口」（**纯函数**）。
 *
 * @param {{announcements: object, mcp: object, tiers: object}} input
 * @returns {object}
 */
export function summarizeConclusion({ announcements, mcp, tiers }) {
  const mcpOk = mcp?.status === 'ok' && mcp.summary !== undefined
  return {
    announcementsOverBudget: announcements.over.length,
    announcementCount: announcements.measured,
    announcementTotalChars: announcements.total,
    announcementBudget: announcements.budget,
    mcpStatus: mcp?.status ?? 'skip',
    mcpTools: mcpOk ? mcp.summary.live : null,
    mcpUnknownRows: mcpOk ? mcp.summary.unknown : null,
    tierEntries: tiers.total,
    tierRead: tiers.read,
    tierWrite: tiers.write,
    tierExec: tiers.exec,
    next: [...ENTRY_POINTS],
  }
}

/** 渲染第四节：一行总结 + 下一步建议 + 相关入口。 */
export function formatConclusion(conclusion) {
  const mcpText =
    conclusion.mcpStatus === 'ok'
      ? `${conclusion.mcpTools} 个工具`
      : '宿主不可达（SKIP）'
  const summary =
    `结论：公告 ${conclusion.announcementsOverBudget} 段超预算（实测 ${conclusion.announcementCount} 段，` +
    `合计 ${conclusion.announcementTotalChars} 字符）；MCP 工具面 ${mcpText}；` +
    `档位分类表 ${conclusion.tierEntries} 个条目（read ${conclusion.tierRead} / write ${conclusion.tierWrite} / exec ${conclusion.tierExec}）`
  const next =
    conclusion.announcementsOverBudget > 0
      ? '下一步：先把超预算的公告压回「能力索引」长度（能力名 + 卡片入口 + 何时别用），细节挪进包 README / 设置卡片。'
      : '下一步：改档位分类或工具面之前，先跑下面三条入口核对真机口径。'
  return [
    '# 四、结论',
    summary,
    next,
    `相关入口：${conclusion.next.join(' · ')}`,
  ]
}

/* ------------------------------------------------------------------ *
 * 组装（CLI 与用例共用）
 * ------------------------------------------------------------------ */

/**
 * 组装报告对象（`--json` 直接用这个；四个顶层键就是机器契约）。
 *
 * @param {{repoRoot?: string, announcements: object, mcp: object, tiers: object}} input
 * @returns {{announcements: object, mcp: object, tiers: object, conclusion: object}}
 */
export function buildReport({ announcements, mcp, tiers }) {
  return {
    announcements,
    mcp,
    tiers,
    conclusion: summarizeConclusion({ announcements, mcp, tiers }),
  }
}

/** 渲染整份报告（四个小节；CLI 只负责打印与退出码）。 */
export function formatReport(report) {
  return [
    ...formatAnnouncementTable(report.announcements),
    '',
    ...formatMcpSection(report.mcp),
    '',
    ...formatTierSection(report.tiers),
    '',
    ...formatConclusion(report.conclusion),
  ]
}

/* CLI（人工与后续接线走这条；格式化逻辑都在上面，用例覆盖） */
if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2)
  const flag = (name) => {
    const index = argv.indexOf(name)
    return index === -1 ? undefined : argv[index + 1]
  }
  const url = flag('--url') ?? process.env.DSH_HOST_URL ?? DEFAULT_URL
  const asJson = argv.includes('--json')
  const noMcp = argv.includes('--no-mcp')

  if (argv.includes('--help') || argv.includes('-h')) {
    console.log('用法：node scripts/disclosure-report.mjs [--url <host>] [--no-mcp] [--json]')
    process.exit(0)
  }

  const measurements = measureAnnouncements(REPO_ROOT)
  if (measurements.length === 0) {
    console.error(`[disclosure-report] 在 ${REPO_ROOT} 的 packages/*/src 里一段公告都没抽到：扫描面为空，报告没有意义`)
    console.error('[disclosure-report] 确认仓库根下有 packages/，或换一个工作目录重跑。')
    process.exit(2)
  }

  const announcements = summarizeAnnouncements(measurements)
  const mcp = noMcp
    ? { status: 'skip', url, reason: '--no-mcp：按需跳过（这一节本来就是可选的）' }
    : await fetchMcpSurface(url)
  const tiers = summarizeTierClasses(await loadTierClasses(REPO_ROOT))
  const report = buildReport({ announcements, mcp, tiers })

  if (asJson) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log(`# 披露面测量报告（${REPO_ROOT}）`)
    console.log('')
    console.log(formatReport(report).join('\n'))
  }

  process.exit(announcements.over.length === 0 ? 0 : 1)
}
