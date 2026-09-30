#!/usr/bin/env node
/**
 * 九个**真机验证脚本**的清单（**只列不跑**）。
 *
 * ## 为什么只列不跑
 *
 * [docs/conventions.md](../docs/conventions.md#真机脚本与-ci-接线) 写明「真机脚本进不了 CI」：
 * 它们要真实宿主、真实浏览器、真实 PTY。给它们补 CI 是错的方向——真正缺的是**可发现**：
 * 在 [`docs/agent-real-test.md`](../docs/agent-real-test.md) 之外，没人知道有哪几个脚本、
 * 各自要什么、入口叫什么。所以这里只做一件事：把 9 个脚本连同「所在包 / 需要什么 /
 * 是否进 CI / 一条可粘贴命令」摊开。
 *
 * **刻意不做 `pnpm verify` 全跑**：这些脚本会起真宿主、真 Chrome，半路失败会留下垃圾进程与
 * 临时目录，聚合执行的收益不抵风险。要跑就按清单里那一行粘一条。
 *
 * ## 三处事实都是**现算**的，不是手抄
 *
 *   - **是否进 CI**：扫 `.github/workflows/*.yml`（只读）；
 *   - **可粘贴命令**：从各包 `package.json` 的 `scripts` 里取——登记名没写对就报「未登记」，
 *     所以这份清单同时是「入口接线有没有漏」的现算核对（与 defects-table 的「现算 vs 手抄」
 *     同一套路）；
 *   - **需要什么**：来自 2026-09-30 那一轮逐脚本真跑分诊（结论与命令见该轮记录），
 *     每条都对应一次真实执行，不是读代码猜的。
 *
 * 用法：
 *   node scripts/verify-list.mjs      # = pnpm verify:list（同一份实现）
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * 清单的**唯一正文**（9 条，按「谁维护」分组排列）。
 *
 * - `entry`：各包 `package.json` 里的脚本名；`undefined` = 通用脚本（不属于任何包），
 *   命令直接写成 `node scripts/<file>` 形态。
 * - `needs`：跑它之前必须有什么（分诊实测结论）。
 * - `note`：分诊里发现的、必须跟着脚本一起被看见的事（没有就不写）。
 */
export const VERIFY_SCRIPTS = [
  {
    file: 'verify-codegraph-agent-scope.mjs',
    pkg: 'codegraph',
    entry: 'agent-scope-smoke',
    needs: '无需宿主 / 浏览器（起真 MCP 子进程，隔离临时目录）',
  },
  {
    file: 'verify-codegraph-agent-integration.mjs',
    pkg: 'codegraph',
    entry: 'agent-integration-smoke',
    needs: '无需宿主 / 浏览器（最小 Cordis 根 + 真插件）',
  },
  {
    file: 'verify-codegraph-indexforce.mjs',
    pkg: 'codegraph',
    entry: 'indexforce-smoke',
    needs: '真 DSH 宿主（自带假 CLI fixture，不索引真实目录）',
  },
  {
    file: 'verify-codegraph-host-contract.mjs',
    pkg: 'codegraph',
    entry: 'host-contract-smoke',
    needs: '真 DSH 宿主（可选 --dsh-bin / --runtime-store 换 cohort）',
  },
  {
    file: 'verify-codegraph-client-ui.mjs',
    pkg: 'codegraph',
    entry: 'client-ui-smoke',
    needs: '真 DSH 宿主 + 真 Chrome（自起隔离宿主，受限沙箱需 --no-sandbox）',
    note: '✅ 2026-09-30 已按当前宿主形状修好：18 PASS / 1 WARN / 0 FAIL（WARN 是沙箱 PTY 限制，见文件头）',
  },
  {
    file: 'verify-rss-opml.mjs',
    pkg: 'rss',
    entry: 'opml-smoke',
    needs: '正在跑的宿主 + token + 真 Chrome（见 --url / --token）；受限沙箱加 `--chrome-arg --no-sandbox`（默认关）',
    note: '✅ 2026-09-30 重跑：9/9 PASS（带 --chrome-arg --no-sandbox）',
  },
  {
    file: 'verify-mcp-http.mjs',
    pkg: 'mcp',
    entry: 'http-smoke',
    needs: '正在跑的宿主（装了 dsh-mcp）；只打 /api/dsh-mcp/test，不写配置',
  },
  {
    file: 'verify-mcp-tools.mjs',
    pkg: 'mcp',
    entry: 'tools-smoke',
    needs: '正在跑的宿主（装了 dsh-mcp / dsh-search）；会写宿主 MCP 配置并**逐条写回**',
  },
  {
    file: 'verify-client-ui.mjs',
    pkg: '（通用）',
    entry: undefined,
    needs: '正在跑的宿主 + token + 真 Chrome（受限沙箱加 `--chrome-arg --no-sandbox`）；`--mode boot` 6/6、`--mode full` 18 PASS / 1 WARN / 0 FAIL',
  },
]

/** 读一个包的 `scripts`（读不到 = 空对象）。 */
function packageScripts(repoRoot, pkg) {
  const path = join(repoRoot, 'packages', pkg, 'package.json')
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, 'utf8')).scripts ?? {}
  } catch {
    return {}
  }
}

/** 包里 `package.json` 的 `name`（`pnpm --filter` 要用它）。 */
function packageName(repoRoot, pkg) {
  const path = join(repoRoot, 'packages', pkg, 'package.json')
  if (!existsSync(path)) return undefined
  try {
    return JSON.parse(readFileSync(path, 'utf8')).name
  } catch {
    return undefined
  }
}

/** 扫 CI workflow（**只读**）：这些脚本出现在里面就是「已进 CI」。 */
function ciText(repoRoot) {
  const dir = join(repoRoot, '.github', 'workflows')
  if (!existsSync(dir)) return ''
  return readdirSync(dir)
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .map((name) => readFileSync(join(dir, name), 'utf8'))
    .join('\n')
}

/**
 * 现算清单（供 CLI 与单测共用）。
 *
 * @param repoRoot - 仓库根。
 * @returns 每项 `{ file, pkg, entry, needs, note, exists, inCi, command, registered }`。
 */
export function collectVerifyList(repoRoot = REPO_ROOT) {
  const ci = ciText(repoRoot)
  const cache = new Map()
  return VERIFY_SCRIPTS.map((item) => {
    const scripts = cache.get(item.pkg) ?? packageScripts(repoRoot, item.pkg)
    cache.set(item.pkg, scripts)
    const name = packageName(repoRoot, item.pkg)
    const registered = item.entry !== undefined && scripts[item.entry] !== undefined
    const command =
      item.entry === undefined
        ? `node scripts/${item.file} --url <宿主> --token <token>`
        : registered
          ? `pnpm --filter ${String(name)} run ${item.entry}`
          : `node scripts/${item.file}   # ⚠️ 未登记：${String(item.pkg)} 的 package.json 里没有 ${String(item.entry)}`
    return {
      ...item,
      exists: existsSync(join(repoRoot, 'scripts', item.file)),
      inCi: ci.includes(item.file),
      command,
      registered,
    }
  })
}

/** 渲染成可粘贴的清单文本。 */
export function formatVerifyList(items) {
  const lines = [
    '[verify-list] 九个真机验证脚本（**只列不跑**；真机脚本进不了 CI，见 docs/conventions.md § 真机脚本与 CI 接线）',
    '',
  ]
  const w = (text, width) => String(text).padEnd(width, ' ')
  lines.push(
    `  ${w('脚本', 40)} ${w('所在包', 14)} ${w('进 CI', 6)} 需要什么 / 一条可粘贴命令`,
  )
  for (const item of items) {
    lines.push(`  ${w(item.file, 40)} ${w(item.pkg, 14)} ${w(item.inCi ? '是' : '否', 6)} ${item.needs}`)
    lines.push(`  ${' '.repeat(40)} ${' '.repeat(14)} ${' '.repeat(6)} → ${item.command}`)
    if (item.note !== undefined) lines.push(`  ${' '.repeat(40)} ${' '.repeat(14)} ${' '.repeat(6)}   注意：${item.note}`)
  }
  const unregistered = items.filter((item) => item.entry !== undefined && !item.registered)
  const missing = items.filter((item) => !item.exists)
  lines.push('')
  if (missing.length > 0) lines.push(`  ✘ 清单里有 ${String(missing.length)} 个脚本不存在：${missing.map((item) => item.file).join('、')}`)
  if (unregistered.length > 0) lines.push(`  ✘ ${String(unregistered.length)} 个入口未登记到包 package.json：${unregistered.map((item) => `${item.pkg}/${String(item.entry)}`).join('、')}`)
  lines.push('  # 可安全聚合的子集（**待批准，本轮刻意没接线**）：agent-scope-smoke + agent-integration-smoke')
  lines.push('  #   —— 这两个不起宿主、不碰 ~/.dsh，跑完即回收；其余 7 个会起真宿主 / 真 Chrome。')
  return lines.join('\n')
}

/* CLI（人工核对用；测试走 collectVerifyList / formatVerifyList） */
if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  const items = collectVerifyList()
  console.log(formatVerifyList(items))
  const broken = items.filter((item) => !item.exists || (item.entry !== undefined && !item.registered))
  process.exit(broken.length === 0 ? 0 : 1)
}
