#!/usr/bin/env node
/**
 * 负载敏感型 flake 的**复现器**（2026-10-03 新增，起因见下）。
 *
 * ## 为什么需要它
 *
 * 本仓有几条用例**只在重负载下**才红（D95 / D57 / CG65 三条于 2026-10-03 根治）：单跑
 * `npx vitest run <那一个文件>` 永远绿，只有「全量套件并发挤压 CPU」时才复现。排查它们必须先能
 * **稳定复现**，而当时的做法是手敲一长串 bash——踩了两个坑，各浪费近一小时：
 *
 *   1. **`wait` 无参数会等全部后台任务**，包括用来造负载的忙循环。于是「测试 3 分钟跑完、
 *      命令却挂满 15 分钟」——真正的测量早结束了，人还在等一个空转的 `while` 循环。
 *      正确顺序是 `kill <负载 pid>; wait`（先杀负载再等），而不是 `wait; kill …`。
 *   2. **负载时长与测量时长不匹配**：忙循环设 15 分钟，而每轮只需要几十秒的 CPU 争用。
 *
 * 所以把复现逻辑收进脚本，由它**自己管负载的生死**：起 N 份全量套件 + M 个忙循环，
 * 在测量窗口内保持负载，测完**立即**收干净（连异常/中断路径也收）。
 *
 * ## 用法
 *
 *   node scripts/repro-flake.mjs <测试文件> [--rounds 10] [--suites 6] [--spinners 2] [--warmup 5]
 *
 *   # 例：复现 D57 那条（历史上 6 份套件并发下会红）
 *   node scripts/repro-flake.mjs packages/tty/test/screen-crash.test.ts --rounds 10
 *
 * 退出码：全部轮次通过 → 0；任一红 → 1（并把失败用例名打出来）。
 *
 * ## 刻意不做的
 *
 * - **不进 CI**：它起 8 个进程挤压 CPU，是**排查工具**不是闸门。CI 上偶发的红应该去定位根因
 *   （本轮三条都是「测试在赌墙钟」），而不是靠反复重跑来「压绿」。
 * - **不改 CPU 亲和性 / 不设 nice**：那要特权，且会把「负载敏感」变成平台相关的另一堆坑。
 * - **不用 `--spinners 0`**：只靠并发套件通常压不出最紧的那些时序（实测 6 份套件单独跑
 *   D95 那条仍有约 54% 成功率，加 2 个忙循环后才稳定复现）。
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const argv = process.argv.slice(2)
const value = (name, fallback) => {
  const i = argv.indexOf(name)
  return i === -1 || argv[i + 1] === undefined ? fallback : Number(argv[i + 1])
}
const target = argv.find((a) => !a.startsWith('--') && !/^\d+$/.test(a))
if (target === undefined) {
  console.error('用法：node scripts/repro-flake.mjs <测试文件> [--rounds 10] [--suites 6] [--spinners 2] [--warmup 5]')
  process.exit(2)
}
const rounds = value('--rounds', 10)
const suites = value('--suites', 6)
const spinners = value('--spinners', 2)
/** 套件铺开后的等待秒数（等它们真的开始争 CPU，再开始测量）。 */
const warmupSec = value('--warmup', 5)

if (!existsSync(resolve(REPO_ROOT, target))) {
  console.error(`找不到测试文件：${target}（路径要相对仓库根，例如 packages/tty/test/xxx.test.ts）`)
  process.exit(2)
}

/** 现场所有子进程——收尾只按这张表杀，不按名字扫（免得误杀用户自己的进程）。 */
const children = []
const track = (child) => {
  children.push(child)
  return child
}

/**
 * 收干净：**先杀再等**（顺序不能反，否则各等一轮自然结束——那正是每轮空转十几分钟的原因）。
 *
 * 杀的是**进程组**（`detached` + `process.kill(-pid)`）：`pnpm test` 会再派一层 vitest +
 * worker 树，只杀直接子进程会把 worker 留成孤儿（2026-10-03 实测到过）。Windows 没有负 pid
 * 语义，退回单独 kill（`taskkill /T` 不在本脚本的职责内——它不进 CI，只在类 POSIX 环境用）。
 */
function cleanup() {
  for (const child of children) {
    const pid = child.pid
    try {
      if (pid !== undefined && process.platform !== 'win32') process.kill(-pid, 'SIGKILL')
      else child.kill('SIGKILL')
    } catch {
      try {
        child.kill('SIGKILL')
      } catch {
        /* 已退出 */
      }
    }
  }
  children.length = 0
}

let interrupted = false
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    interrupted = true
    console.log(`\n收到 ${signal}：正在收负载…`)
    cleanup()
    process.exit(130)
  })
}

/**
 * 起一个子进程并**让它自成进程组**（`detached: true`）。
 *
 * `detached` 是 `cleanup()` 能按 `-pid` 收整棵树的前提：没有它，`child.pid` 与调用方同组，
 * `process.kill(-pid)` 会打到**我们自己**头上。子进程用不到父进程的控制终端（`stdio: 'ignore'`），
 * 自成一组的副作用在这里正好是想要的。
 */
const run = (command, args, options = {}) =>
  new Promise((resolveDone) => {
    const child = track(
      spawn(command, args, { cwd: REPO_ROOT, detached: process.platform !== 'win32', ...options }),
    )
    child.on('exit', (code) => resolveDone(code ?? 1))
    child.on('error', () => resolveDone(1))
  })

console.log(`[repro] 目标 ${target}`)
console.log(`[repro] 负载：${String(suites)} 份全量套件 + ${String(spinners)} 个忙循环；测量 ${String(rounds)} 轮`)

// ---- 起负载 ----
/*
 * 忙循环设 10 分钟上限（远大于实际测量窗口）：它只是「保证负载不会先于测量结束」，而不是
 * 「跑满 10 分钟」——测量一完 `cleanup()` 立刻收掉。原先手敲命令时把它设成 15 分钟又用
 * 裸 `wait`，于是每轮都在等它自然结束（那正是被抱怨的「跑这么久」）。
 */
const busyLoop = 'const t=Date.now()+600000;while(Date.now()<t){Math.sqrt(Math.random())}'
for (let i = 0; i < spinners; i += 1) {
  track(
    spawn(process.execPath, ['-e', busyLoop], {
      cwd: REPO_ROOT,
      stdio: 'ignore',
      detached: process.platform !== 'win32', // 与 run() 同理：cleanup 靠 -pid 才收得到它
    }),
  )
}
/** 套件自己用完就退（测量期间不需要干预）；放进 `children` 是为了中断时一并收掉。 */
const suitePromises = []
for (let i = 0; i < suites; i += 1) {
  suitePromises.push(run('pnpm', ['test']))
}
console.log(`[repro] 等 ${String(warmupSec)}s 让负载铺开…`)
await new Promise((resolveDone) => setTimeout(resolveDone, warmupSec * 1000))

// ---- 测量 ----
let pass = 0
const failures = []
const started = Date.now()
for (let round = 1; round <= rounds; round += 1) {
  /*
   * 输出**丢弃**（`stdio: 'ignore'`）而不是 `pipe`：管道没人读时，子进程写满缓冲会**阻塞**，
   * 那会把「测出真结果」变成「等到超时」。要看失败详情时，用脚本打印的失败轮次 + 手动单跑
   * 那个文件去看——复现器只负责回答「红没红」。
   */
  const code = await run('npx', ['vitest', 'run', target])
  if (code === 0) {
    pass += 1
    process.stdout.write(`  轮 ${String(round)}: ✅\n`)
  } else {
    failures.push(round)
    process.stdout.write(`  轮 ${String(round)}: ❌\n`)
  }
}
/** 测量实际耗时——用来核对「负载时长是否与测量时长匹配」（本轮那 15 分钟空转就是这么发现的）。 */
const elapsedSec = ((Date.now() - started) / 1000).toFixed(1)

// ---- 收尾（**先杀负载再等套件**）----
cleanup()
await Promise.allSettled(suitePromises)

console.log(`\n[repro] 结果：通过 ${String(pass)} / 失败 ${String(failures.length)}（共 ${String(rounds)} 轮，测量耗时 ${elapsedSec}s）`)
console.log('[repro] 负载已收（先杀进程组、再等套件退出）；忙循环上限 600s 只是兜底，正常路径由 cleanup 立即收。')
if (failures.length > 0) {
  console.log(`[repro] 失败的轮次：${failures.join(', ')}`)
  console.log('[repro] 复现成功 → 用同一命令验证修法（改完再跑，应变成 0 失败）')
  process.exit(interrupted ? 130 : 1)
}
console.log('[repro] 全绿。若目标是「验证修法」，这个结果才算数；若想复现一个已知的 flake，')
console.log('        说明当前负载不够——加 --suites / --rounds，或确认它是否已被修掉。')
process.exit(0)
