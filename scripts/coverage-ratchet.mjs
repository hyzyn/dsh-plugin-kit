/**
 * coverage 棘轮（`pnpm coverage:check`；由 `.github/workflows/nightly.yml` 的 coverage job 调用）。
 *
 * ## 它回答的问题与别的闸门不同
 *
 * 本仓其余闸门都是「某个具体事实对不对」（产物 = 源码、钉子一致、入口在不在 tarball 里）。
 * 这条回答的是**趋势**：这一轮改动之后，还有多少宿主半体代码**从没被任何用例执行过**。
 * 「新加一个文件、没有一条用例碰它」不会有任何闸门红——这就是它补的洞。
 *
 * ## 为什么只统计宿主半体（`packages/<pkg>/src`）
 *
 * 实测（2026-10-03，全量 110 文件 / 1714 用例）：
 *
 * | 统计范围 | lines |
 * |---|---|
 * | 宿主半体 `src` | **66.5%** |
 * | 加上浏览器半体 `client-src` | 35.9% |
 *
 * 差出 30 个百分点不是巧合：`vitest.config.ts` 明写「打包后的 `client.js` 不在本层测」，
 * 而浏览器半体的**纯逻辑**已经抽成 `client-src/*.js` 由单测覆盖了——剩下那部分是按定义
 * 跑在浏览器里的（DOM / React 渲染），在本层统计它等于**把没测的部分混进分母**，
 * 数字只会随「有没有加界面代码」抖动，对「该补哪条用例」没有任何指导。
 *
 * 所以棘轮卡的是**宿主半体**（`src/**`）——那里每一条未覆盖的行都是**真的可以补用例**的。
 * 浏览器半体另有一条车道（挂载车道真的把 `client.js` 加载进浏览器，见
 * [conventions.md § 挂载车道](../docs/conventions.md#真机脚本与-ci-接线)），各管一段。
 *
 * ## 为什么是棘轮（只许升不许降）而不是一个固定阈值
 *
 * 固定阈值（「必须 ≥ 70%」）有两个坏处：写低了没有约束力、写高了在**第一次**就得大幅补用例
 * 才能合入，于是要么没人敢动它、要么被随手调低。棘轮把基线**冻在文件里**（
 * `scripts/coverage-baseline.json`），只判「比基线低了没有」：
 *
 *   - 新代码没测 → 比率降 → 红，逼着补用例或显式 `--write` 接受并留下 diff 记录；
 *   - 老代码补测 → 比率升 → 绿，顺手 `--write` 把基线抬上去（棘轮收紧）。
 *
 * **容差**：实测同一棵树连跑三次的抖动是 66.52 / 66.53 / 66.53（lines）——v8 的插桩结果
 * 对同一输入是确定的，抖动只来自「极少数异步路径这一轮有没有跑到」。所以容差取 **0.3 个
 * 百分点**：够吸收这种抖动，又远小于「少测一个文件」的量级（最小文件也有 0.1 上下）。
 *
 * ## 刻意不做的
 *
 * - **不设 per-file 门槛**：本仓有几千行的大文件与几十行的小模块，一刀切会把注意力从
 *   「这块逻辑没人测」引到「怎么把数字凑够」；
 * - **不追 statements / functions / branches 四条线**：其余三条与 lines 在本仓几乎同向
 *   （76.9 / 73.8 / 66.5），判四条只会让报告更长、失败更难解释。**branch 单独记但不判**
 *   ——它是「补用例该往哪补」最有用的线索；
 * - **不进 CI 每次推送**：覆盖率插桩让全量套件从 13s 涨到 16s，看着不多，但它是**趋势闸**
 *   不是**正确性闸**——正确性已经由 CI 那十几道闸门与 1700 条用例守着。放 nightly 一天一次，
 *   红了第二天处理，不挡任何人。
 *
 * 不写 shebang：本文件要被 `scripts/test/coverage-ratchet.test.ts` import。
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 棘轮基线文件（入库；`--write` 时重写）。 */
export const BASELINE_FILE = join(REPO_ROOT, 'scripts', 'coverage-baseline.json')

/** vitest 的真实 JS 入口（绕开 npm/pnpm 的 `.cmd` shim，见 measureCoverage 的注释）。 */
const VITEST_ENTRY = join(REPO_ROOT, 'node_modules', 'vitest', 'vitest.mjs')

/** 统计范围：只算宿主半体源码，理由见文件头。 */
export const COVERAGE_INCLUDE = 'packages/*/src/**'

/** 允许的回退幅度（百分点）。实测同树抖动 ≤ 0.01，取 0.3 留足余量，理由见文件头。 */
export const TOLERANCE_PCT = 0.3

/**
 * 纯判定：拿本轮结果与基线比。
 *
 * 只判 `lines`（文件头写了为什么），`branches` 仅作为线索一并回报。
 *
 * @param input - `{ baseline, current }`，两者都是 vitest `json-summary` 的 `total` 形态
 *   （`{ lines: { pct }, branches: { pct }, ... }`）
 * @returns `{ ok, drops, report }`：是否通过、掉了几条、多行报告
 */
export function compareCoverage({ baseline, current }) {
  const metrics = [
    ['lines', true],
    ['branches', false],
    ['functions', false],
  ]
  const drops = []
  const lines = []

  for (const [key, enforced] of metrics) {
    const before = baseline?.[key]?.pct
    const after = current?.[key]?.pct
    if (typeof before !== 'number' || typeof after !== 'number') {
      // 字段缺失（vitest 改了 json-summary 形态）时必须红，不能当成「没变化」
      return {
        ok: false,
        drops: [],
        report: `报告里缺少 ${key}.pct（baseline=${String(before)} current=${String(after)}）——` +
          'json-summary 的形态变了，先修这条闸再谈覆盖率（形态漂了照绿是最坏的一侧）',
      }
    }
    const delta = after - before
    const mark = delta < -TOLERANCE_PCT ? '❌' : delta > 0 ? '✅' : '➖'
    const suffix = enforced ? '' : '（仅记录，不判）'
    lines.push(
      `  ${mark} ${key.padEnd(10)} ${after.toFixed(2)}%  （基线 ${before.toFixed(2)}%，${delta >= 0 ? '+' : ''}${delta.toFixed(2)}）${suffix}`,
    )
    if (enforced && delta < -TOLERANCE_PCT) drops.push({ key, before, after, delta })
  }

  const ok = drops.length === 0
  lines.push('')
  if (ok) {
    lines.push(`通过：宿主半体覆盖率没有低于基线超过 ${String(TOLERANCE_PCT)} 个百分点`)
  } else {
    for (const drop of drops) {
      lines.push(
        `未通过：${drop.key} 从 ${drop.before.toFixed(2)}% 掉到 ${drop.after.toFixed(2)}%（${drop.delta.toFixed(2)}）`,
      )
    }
  }
  return { ok, drops, report: lines.join('\n') }
}

/**
 * 真的跑一次带插桩的全量套件，读回 summary。
 *
 * 报告写到**临时目录**（不是仓库里的 `coverage/`）：这个脚本不产出要入库的东西，
 * 往仓库丢派生数据只会让人以为它该被提交（`.gitignore` 里那条 `coverage/` 注释写了同一件事）。
 */
export function measureCoverage() {
  const outDir = mkdtempSync(join(tmpdir(), 'dsh-coverage-'))
  try {
    /*
     * 用 `node <vitest 的 JS 入口>` 而不是 `npx vitest`：Windows 上 npx 是 `npx.cmd`，
     * 不带 `shell` 起不来，而开 shell 又会让 `--coverage.reportsDirectory=<临时目录>`
     * 里的空格被拆开。直接跑 JS 入口两头都躲开（同 flake-lane）。
     */
    execFileSync(
      process.execPath,
      [VITEST_ENTRY, 'run', '--coverage', `--coverage.include=${COVERAGE_INCLUDE}`, '--coverage.reporter=json-summary',
        `--coverage.reportsDirectory=${outDir}`, '--reporter=dot'],
      { cwd: REPO_ROOT, stdio: ['ignore', 'inherit', 'inherit'] },
    )
    return JSON.parse(readFileSync(join(outDir, 'coverage-summary.json'), 'utf8')).total
  } finally {
    rmSync(outDir, { recursive: true, force: true })
  }
}

/* CLI */
if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  const write = process.argv.includes('--write')
  const current = measureCoverage()

  if (write) {
    // 写基线时**只存判据用得到的字段**：把 vitest 的整份 total 存进去会让文件随它加字段而漂
    const baseline = {
      lines: { pct: Number(current.lines.pct) },
      branches: { pct: Number(current.branches.pct) },
      functions: { pct: Number(current.functions.pct) },
    }
    writeFileSync(BASELINE_FILE, JSON.stringify(baseline, undefined, 2) + '\n')
    console.log(`[coverage] 基线已更新（${COVERAGE_INCLUDE}）：`)
    console.log(compareCoverage({ baseline, current }).report)
    process.exit(0)
  }

  const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'))
  const { ok, report } = compareCoverage({ baseline, current })
  console.log(`[coverage] 统计范围 ${COVERAGE_INCLUDE}（宿主半体；浏览器半体走挂载车道）`)
  console.log(report)
  if (!ok) {
    console.error('[coverage] 覆盖率回退了。两条出路：')
    console.error('  1. 给新代码补用例（首选）——`--reporter=html` 打开报告看哪些行是红的；')
    console.error('  2. 确实无法在单测层覆盖（要真机 / 真浏览器），把理由写进 commit 再 `pnpm coverage:write`')
    console.error('     接受新基线——**这条路的代价是 diff 里能看见你把棘轮放松了**，那正是它该有的代价。')
    process.exit(1)
  }
  process.exit(0)
}
