/**
 * 复现：`@xterm/headless` 在「`scrollback: 0`（= D57 修复前 dsh-tty 虚拟屏的构造参数）
 * + 输出与 resize 交错」下抛出未捕获 TypeError，**杀掉整个 Node 宿主进程**。
 *
 *   TypeError: Cannot set properties of undefined (setting 'isWrapped')
 *       at E.lineFeed (.../@xterm/headless/lib-headless/xterm-headless.js:1:28221)
 *       at c.parse … at n._action … at n._innerWrite … at Timeout._onTimeout
 *
 * 与线上 `~/.dsh/dsh-safe/last-failure-web.log` 里那次宿主崩溃的堆栈逐帧一致。
 *
 * 运行（`packages/tty` 下）：
 *   node scripts/screen-crash-repro.mjs                       # 用本包解析到的 @xterm/headless
 *   node scripts/screen-crash-repro.mjs <另一个 headless.js>   # 换版本对比（如 6.0.0，仍然崩）
 *
 * 期望输出：`exit=1` + 上面那段堆栈（进程被未捕获异常打死）。
 * 若打印 `no uncaught exception`，说明该版本已修 —— 这时该复核 SCREEN_SCROLLBACK 这条护栏。
 *
 * 这是**排查用**的一次性脚本；日常回归看 `test/screen-crash.test.ts`（D57）。
 */
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'

const require = createRequire(import.meta.url)
// 默认用本包依赖解析出来的 @xterm/headless（`packages/tty` 下运行即为本包版本）
const defaultXterm = require.resolve('@xterm/headless')
const xtermPath = process.argv[2] ?? defaultXterm
if (!existsSync(xtermPath)) {
  console.error('xterm headless 不存在：' + xtermPath)
  process.exit(2)
}

const { Terminal } = require(xtermPath)

// 刻意不装 uncaughtException 处理器 —— 与修复前的 dsh-tty / dsh 宿主现状一致，
// 异常在 setTimeout 回调里逃逸，Node 直接打死进程（正是线上那次的表现）。
const terminal = new Terminal({ cols: 60, rows: 3, scrollback: 0, allowProposedApi: true })
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

// D57 的 10 步最小复现序列：输出 → 设滚动区 → 反复 resize（触发 reflow）→ 末尾一个 '\n'
const ops = [
  ['write', 'A'.repeat(300)],
  ['write', '\x1b[3;9r'],
  ['write', '\r\n'],
  ['resize', 70, 40],
  ['write', '\r\n'],
  ['resize', 33, 5],
  ['resize', 118, 8],
  ['write', 'A'.repeat(300)],
  ['resize', 21, 11],
  ['write', '\n'], // ← 崩在这一步：lineFeed 里 lines.get() 返回 undefined
]

for (const op of ops) {
  if (op[0] === 'write') terminal.write(op[1])
  else terminal.resize(op[1], op[2])
  await tick()
}
for (let i = 0; i < 5; i++) await tick()

// 只有没崩才会走到这里
console.log('no uncaught exception')
process.exit(0)
