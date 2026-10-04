/**
 * GitHub Actions 的 **Job Summary** 写入器（`$GITHUB_STEP_SUMMARY`）——零依赖、零第三方 action。
 *
 * ## 为什么需要它
 *
 * nightly 那两条车道（并发 flake / coverage 棘轮）是**按天**跑的：早上打开 Actions 想一眼
 * 知道「昨晚绿没绿」，而现在结论埋在几千行日志里（`[flake] 并发 3 份全绿 / 墙钟 65.9s`
 * 这种），得点进去翻。Job Summary 会渲染在 job 页面**顶部**，一眼可见。
 *
 * ## 为什么不是第三方 reporter
 *
 * 你看到的「Vitest Test Report」那种逐 suite 摘要，来自 `sapphi-red/vitest-github-actions-reporter`
 * 之类的第三方 action / reporter。本仓刻意不引：
 *
 * 1. **vitest 内建的 `github-actions` reporter 做不到这件事**（实测）：它只在**失败**时往
 *    标准输出打 `::error file=…,title=…` 注解，**不写 Step Summary**（设了
 *    `GITHUB_STEP_SUMMARY` 也不生成文件）。要那个形态只能引第三方。
 * 2. 第三方是**新依赖 + 新权限面**，而本仓刚做完「最小权限」硬化；且它的核心价值
 *    （人多时在 PR 上汇总）对本仓（单人项目）不成立。
 * 3. 本仓**已经有全部数据源**——`summarizeRuns` / `compareCoverage` 早就把结论算成结构化
 *    结果了，缺的只是「把它渲染成 Markdown 并追加到那个文件」。那是几十行的事。
 *
 * ## 行为约定
 *
 * - **本地跑完全不受影响**：没设 `GITHUB_STEP_SUMMARY`（或指向不可写的路径）时什么都不做，
 *   不报错、不建文件——否则 `pnpm flake:check` 在开发机上会多出莫名其妙的文件。
 * - **追加而不是覆盖**：GitHub 允许一个 job 里多次追加；同 job 多步都写时不互相吃掉。
 * - **写失败不改变退出码**：摘要只是给人看的，写不进去不该让一条本来绿的闸门变红。
 */
import { appendFileSync } from 'node:fs'

/**
 * 往 `$GITHUB_STEP_SUMMARY` 追加一段 Markdown。
 *
 * @param markdown - 要追加的内容（不需要结尾换行；函数会补）
 * @param options.env - 注入环境变量（默认 `process.env`；测试用）
 * @param options.appendFile - 注入写文件函数（默认 `fs.appendFileSync`；测试用）
 * @param options.log - 注入日志函数（默认 `console.log`；测试用）。写成功/失败都留一行，见下方注释。
 * @returns 真的写了 → `true`；没设变量或写失败 → `false`（**不抛错**）
 */
export function writeStepSummary(markdown, options = {}) {
  const { env = process.env, appendFile = appendFileSync, log = console.log } = options
  const target = env.GITHUB_STEP_SUMMARY
  // 空串与未定义同档：本地没有这个变量是**正常状态**，不是错误
  if (typeof target !== 'string' || target === '') return false
  try {
    appendFile(target, markdown.endsWith('\n') ? markdown : markdown + '\n')
    /*
     * 写成功要**留一行日志**：`$GITHUB_STEP_SUMMARY` 的内容在 REST API 里读不到
     * （`jobs.output.summary` 是 check-run 的另一个字段），所以「到底写没写」只能靠
     * 日志自证。第一版是静默的，验证时无法区分「写成功了」与「悄悄没写」——
     * 一个不说话的写入器等于没法验收。
     */
    log(`[summary] 已写入 Job Summary（${String(markdown.split('\n')[0])} …）`)
    return true
  } catch (error) {
    // 摘要写不进去（权限 / 磁盘满 / 路径被占）不该影响闸门结论，但**要说出来**
    log(`[summary] Job Summary 写入失败（不影响闸门结论）：${String(error?.message ?? error)}`)
    return false
  }
}

/**
 * 把 flake 车道的结论渲染成 Job Summary 的 Markdown。
 *
 * 只放**一眼要看的**：几份绿/红、墙钟耗时、失败时点名到用例（失败时那一行才是重点，
 * 所以用 `###` 抬起来而不是埋在列表里）。
 *
 * @param input - `{ runs, ok, failed, report, elapsedSec }`
 * @returns Markdown 字符串
 */
export function renderFlakeSummary({ runs, ok, failed, elapsedSec }) {
  const lines = []
  lines.push('## Flake lane（并发全量套件）')
  lines.push('')
  lines.push(ok
    ? `✅ **并发 ${String(runs)} 份全绿** · 墙钟 ${String(elapsedSec)}s`
    : `❌ **并发 ${String(runs)} 份里 ${String(failed.length)} 份红**（第 ${failed.join('、')} 份）· 墙钟 ${String(elapsedSec)}s`)
  lines.push('')
  if (!ok) {
    lines.push('> 这正是这条车道的用途——**不要靠重跑到绿**。')
    lines.push('> 定位：`pnpm repro-flake <红掉的文件> --rounds 10`，方法见 docs/conventions.md § 负载敏感 flake。')
    lines.push('')
  }
  return lines.join('\n')
}

/**
 * 把 coverage 棘轮的结论渲染成 Job Summary 的 Markdown。
 *
 * @param input - `{ current, baseline, ok, drops }`
 * @returns Markdown 字符串
 */
export function renderCoverageSummary({ current, baseline, ok, drops }) {
  const pct = (n) => `${n.toFixed(2)}%`
  const delta = (after, before) => {
    const d = after - before
    return `${d >= 0 ? '+' : ''}${d.toFixed(2)}`
  }
  const lines = []
  lines.push('## Coverage ratchet（宿主半体）')
  lines.push('')
  lines.push(ok ? '✅ **未低于基线**' : `❌ **回退了**（${drops.map((d) => d.key).join('、')}）`)
  lines.push('')
  lines.push('| 指标 | 本轮 | 基线 | 差 |')
  lines.push('|---|---|---|---|')
  for (const key of ['lines', 'branches', 'functions']) {
    lines.push(`| ${key} | ${pct(current[key].pct)} | ${pct(baseline[key].pct)} | ${delta(current[key].pct, baseline[key].pct)} |`)
  }
  lines.push('')
  lines.push('> `branches` / `functions` 只记录不判——判据只有 `lines`。')
  if (!ok) {
    lines.push('>')
    lines.push('> 两条出路：给新代码补用例（首选），或 `pnpm coverage:write` 显式接受新基线。')
  }
  lines.push('')
  return lines.join('\n')
}
