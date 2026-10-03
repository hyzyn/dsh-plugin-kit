/**
 * flake 车道（`pnpm flake:check`；由 `.github/workflows/nightly.yml` 的 flake job 调用）。
 *
 * ## 为什么是「并发跑 N 份」而不是「顺序跑 N 遍」
 *
 * 本仓 2026-10-03 根治的三条间歇红（tty **D95** / **D57**、codegraph **CG65**）有同一个形状：
 * **测试在赌墙钟**。它们的复现条件实测是「多份全量套件并发挤压 CPU」——单跑永不复现，
 * 复现方法与三个方法坑见 [scripts/repro-flake.mjs](./repro-flake.mjs) 的文件头。
 *
 * 所以这条车道**刻意不照抄** dsh-web 的同名车道（它顺序把全量套件跑三遍）。顺序三遍能抓的是
 * **顺序 / 状态污染**型 flake——那是真实存在的一类，但**不是本仓发生过的那一类**：实测顺序
 * 跑三遍对本仓已知的三条从来全绿。同一个「跑三遍」的意图，形状换一下才对本仓有意义：
 *
 * | 形状 | 抓得到 | 成本（本机实测） |
 * |---|---|---|
 * | 顺序 3 遍 | 顺序 / 状态污染型 | ~42s |
 * | **并发 3 份** | **争用 / 墙钟型（本仓的三条）**，也仍会撞上顺序型 | ~28s |
 *
 * 并发还**更便宜**：CPU 总时间相近，墙钟更短。
 *
 * ## 为什么轮数可调
 *
 * 并发越猛越灵敏，也越容易抓到「在 4 核 runner 上本来就慢」的用例。那**正是我们要的信号**
 * （它说明用例依赖机器快慢），但噪声也要可控——`--runs` / `FLAKE_RUNS` 可调，默认 **3**
 * （与 dsh-web 同数量、不同形状）。复现已知 flake 需要更猛的负载时用 `repro-flake.mjs`
 * （它专门干这个，且刻意不进 CI）。
 *
 * ## 刻意不做的
 *
 * - **不加 CPU 忙循环**：`repro-flake.mjs` 加 `--spinners` 是因为它要**稳定复现**某一条；
 *   而车道是常设闸门，在 4 核 runner 上并发几份套件本身就足以吃满 CPU，再塞忙循环只是烧电。
 * - **不自动重跑**：重跑到绿正是要避免的事（那会把真 flake 洗成绿）。红了就是红了，
 *   报告里点名哪一份红、红在哪条用例，交给定位。
 *
 * 不写 shebang：本文件要被 `scripts/test/flake-lane.test.ts` import。
 */
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * 从一份 vitest 输出里抠出「哪条用例 / 哪个文件红了」。
 *
 * 车道存在的意义是**让人能去定位**，所以报告不能只说「有一份红了」——那等于把「跑一遍」
 * 的活留给下一个人。dot reporter 的失败行是 ` ❯ path (N tests | M failed)`，别的 reporter
 * 用 `FAIL`；两种都收。
 *
 * @param output - 一份运行的 stdout + stderr
 * @returns 去重后的失败行（顺序按出现位置）
 */
export function extractFailures(output) {
  const hits = []
  for (const line of String(output).split('\n')) {
    const trimmed = line.trim()
    if (/^❯ .*failed/.test(trimmed) || /^FAIL\b/.test(trimmed)) {
      if (!hits.includes(trimmed)) hits.push(trimmed)
    }
  }
  return hits
}

/**
 * 纯判定：把 N 份运行结果收敛成「红没红 + 一份可读的报告」。
 *
 * 反例由 `scripts/test/flake-lane.test.ts` 用 fixture 造（不真的跑套件）。
 *
 * @param input - `{ runs: { index, code, output }[] }`；`code` 非 0 即该份失败
 * @returns `{ failed, report, ok }`：失败的份号（1 起）、多行报告、是否全绿
 */
export function summarizeRuns({ runs }) {
  if (runs.length === 0) {
    // 恒绿警戒：一份都没跑成「全绿」是这道闸最坏的失败形态（本仓真实发生过这种闸门）
    return { failed: [], ok: false, report: '没有跑到任何一份套件——闸门恒绿，先确认调用方式' }
  }

  const failed = runs.filter((run) => run.code !== 0).map((run) => run.index)
  const sorted = [...runs].sort((a, b) => a.index - b.index)
  const lines = []
  for (const run of sorted) {
    lines.push(`  第 ${String(run.index)} 份：${run.code === 0 ? '✅ 通过' : `❌ 失败（退出码 ${String(run.code)}）`}`)
    if (run.code === 0) continue
    const failures = extractFailures(run.output)
    if (failures.length === 0) {
      // 没抠出用例名也是有效信息：说明它连用例都没跑到（安装/编译/超时），报错原文才是线索
      lines.push('    （输出里没有失败用例行——可能是加载/编译失败或整体超时，看下面的输出尾部）')
      const tail = String(run.output).split('\n').filter((line) => line.trim() !== '').slice(-15)
      for (const line of tail) lines.push(`    | ${line}`)
    } else {
      for (const failure of failures) lines.push(`    ${failure}`)
    }
  }

  const ok = failed.length === 0
  lines.push('')
  lines.push(ok ? `并发 ${String(runs.length)} 份全绿` : `并发 ${String(runs.length)} 份里 ${String(failed.length)} 份红（第 ${failed.join('、')} 份）`)

  return { failed, ok, report: lines.join('\n') }
}

/** 现场子进程：收尾只按这张表杀（不按名字扫，免得误杀用户自己的进程）。 */
const children = new Set()

/** 跑一份全量套件，把输出**收进内存**（不像 repro-flake 那样丢弃——报告要用它点名用例）。 */
function runSuite(index) {
  return new Promise((resolveDone) => {
    const child = spawn('npx', ['vitest', 'run', '--reporter=dot'], {
      cwd: REPO_ROOT,
      // CI=true 让 vitest 自己选非交互形态（无 TTY 时本该如此，显式写出来免得本地手动跑时行为不同）
      env: { ...process.env, CI: 'true' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    children.add(child)
    let output = ''
    /*
     * 必须**读**两个流：`pipe` 下没人读时，子进程写满管道缓冲会阻塞，那会把「测出真结果」
     * 变成「等到超时」（repro-flake 用 `stdio: 'ignore'` 避开同一件事，这里要报告所以改读）。
     */
    child.stdout.on('data', (chunk) => (output += chunk))
    child.stderr.on('data', (chunk) => (output += chunk))
    child.on('close', (code) => {
      children.delete(child)
      resolveDone({ index, code: code ?? 1, output })
    })
  })
}

/** 收尾：先杀在跑的，再等它们真的退出（顺序反了就会等满超时，见 repro-flake 文件头的坑 1）。 */
function cleanup() {
  for (const child of children) child.kill('SIGTERM')
}

/* CLI */
if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2)
  const runsArg = argv[argv.indexOf('--runs') + 1]
  const runs = Number(argv.includes('--runs') ? runsArg : (process.env.FLAKE_RUNS ?? 3))
  if (!Number.isInteger(runs) || runs < 1) {
    console.error('用法：node scripts/flake-lane.mjs [--runs N]（N 默认 3，也可用 FLAKE_RUNS）')
    process.exit(2)
  }

  let interrupted = false
  const onSignal = () => {
    interrupted = true
    cleanup()
  }
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)

  console.log(`[flake] 并发跑 ${String(runs)} 份全量套件（抓争用 / 墙钟型 flake；形状理由见文件头）…`)
  const started = Date.now()
  const results = await Promise.all(Array.from({ length: runs }, (_, i) => runSuite(i + 1)))
  const { ok, report } = summarizeRuns({ runs: results })
  console.log(report)
  console.log(`[flake] 墙钟耗时 ${String(((Date.now() - started) / 1000).toFixed(1))}s`)

  if (!ok) {
    console.error('[flake] 未通过：并发下有用例红了。')
    console.error('  这正是这条车道的用途——**不要靠重跑到绿**。定位方法：')
    console.error('  1. `pnpm repro-flake <红掉的文件> --rounds 10` 稳定复现；')
    console.error('  2. 看它是不是在赌墙钟（本仓三条都是），修法是换成确定性接缝而不是放宽超时；')
    console.error('  3. 方法坑与修法样例见 docs/conventions.md 的「负载敏感 flake」一节。')
    process.exit(interrupted ? 130 : 1)
  }
  process.exit(0)
}
