#!/usr/bin/env node
/**
 * 客户端半体的**定点**静态检查（仓库级：在包目录里跑）。
 *
 * 为什么需要：客户端半体是纯 JS，不参与 `tsc -p tsconfig.json`（那份只覆盖 src）。
 * 于是「引用了不存在的名字」这一类错误**编译不报**，冒烟也未必抓得到——只有真正渲染到那条
 * 分支（或者跑到那个 effect）才炸。实测踩过的几次都是同一个根因：
 *
 *   1. 一个 effect 的 deps 引用了几百行之后才声明的 const → TDZ，整块面板被 React 卸载成空白；
 *   2. 清理"没用到"的图标常量时按「切到下一个空行」删，而图标定义之间没有空行 → 连带删掉
 *      后面 12 个图标常量，它们只剩引用没有定义，列表一有卡片就 ReferenceError；
 *   3. 状态写进了另一个组件（`levelMin` 这个锚点在两个视图里都有）→ 聚合日志视图取不到 `tail`；
 *   4. **加了刷新过渡层，在渠道列表里调 `busyPillHtml(digest)` 却没绑定 `digest`**
 *      （同文件另一处是对的：`const digest = state.digest`）→ 打开 RSS 设置卡片时
 *      `slot entry crashed in 'settings.plugin.item': ReferenceError: digest is not defined`，
 *      整张卡片渲染失败。这条是浏览器（CDP）点开卡片才发现的。
 *
 * **覆盖面（第 4 条暴露的缺口）**：本脚本原先只查 `client-src/index.js`，而只有 docker / tty
 * 两个包有 `client-src/`；其余 7 个包（codegraph / env / mcp / profile / prompt / rss /
 * search）的客户端是**裸 `client.js`**，于是它们从来没被这道防线覆盖过 —— 第 4 条就落在里面。
 * 现在两者都查：有 `client-src/index.js` 就查源码，否则查 `client.js`。
 *
 * 做法：用仓库**已有**的 tsc 对目标跑 `--checkJs`，然后**只把"真 bug"那几个诊断码当失败**：
 *
 *   TS2304 找不到名字          TS2552 找不到名字（"是否想用 X"）
 *   TS2448 块级变量先用后声明   TS2454 变量未赋值就使用
 *
 * 其余诊断（`--checkJs` 下没有类型声明就来的模块解析、DOM 事件类型收窄等）在本项目的打包
 * 方式下是**噪音**：不判失败，但照样打印出来，免得它们悄悄积累成一片看不见的红。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// 在「包目录」里调用（`pnpm -r typecheck` 就是这样跑的）：tsc 输出的路径也相对它，
// 于是下面的解析与提示都是包内相对路径。
const root = process.cwd()
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

/** 只把这几类当失败：见文件头的说明。 */
const FATAL_CODES = new Set(['TS2304', 'TS2552', 'TS2448', 'TS2454'])

// 目标选择：优先源码，没有源码就查构建产物（7 个裸 client.js 的包走这条）
const target = ['client-src/index.js', 'client.js'].find((candidate) => existsSync(join(root, candidate)))
if (target === undefined) {
  console.log('[client-lint] 本包没有客户端半体（client-src/index.js 或 client.js）—— 跳过')
  process.exit(0)
}

const tsc = join(repoRoot, 'node_modules', '.bin', 'tsc')
if (!existsSync(tsc)) {
  console.error('[client-lint] 找不到 tsc（' + tsc + '）——先在仓库根 pnpm install')
  process.exit(1)
}

const packageName = (() => {
  try {
    return String(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name ?? 'this package')
  } catch {
    return 'this package'
  }
})()

const result = spawnSync(tsc, [
  '--noEmit',
  '--allowJs',
  '--checkJs',
  '--target', 'esnext',
  '--module', 'esnext',
  '--moduleResolution', 'bundler',
  '--lib', 'esnext,dom,dom.iterable',
  '--skipLibCheck',
  target,
], { cwd: root, encoding: 'utf8' })

const output = (result.stdout ?? '') + (result.stderr ?? '')
/*
 * 锚点（D74）：tsc 的 program 会经 import 拉进 client-src 的兄弟模块
 * （如 docker 包的 session-target.js / current-session.js），它们的诊断此前因锚点
 * 只认入口文件而被**静默丢弃**（合成诊断实测只命中 1/3）。源码模式下放宽到
 * program 内的全部 client-src/**；裸 client.js 的包没有兄弟源码，维持原锚点。
 */
const anchor = target.startsWith('client-src/')
  ? 'client-src/[^\\s()]+\\.js'
  : target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const found = [...output.matchAll(new RegExp('(' + anchor + ')\\((\\d+),(\\d+)\\): error (TS\\d+): (.*)', 'g'))]
  .map((match) => ({ file: match[1], line: Number(match[2]), col: Number(match[3]), code: match[4], text: match[5].trim() }))

const fatal = found.filter((item) => FATAL_CODES.has(item.code))
const noise = found.filter((item) => !FATAL_CODES.has(item.code))

for (const item of fatal) {
  console.error('[client-lint] ' + item.file + ':' + String(item.line) + ':' + String(item.col) + ' ' + item.code + ' ' + item.text)
}

if (fatal.length > 0) {
  console.error('\n[' + packageName + '] 客户端静态检查失败：' + String(fatal.length) + ' 处"引用了不存在的名字 / 先用后声明"。'
    + '这类错误编译不报、冒烟也未必抓到，只有真渲染到那条分支才炸——请修掉，别只是让它过。')
  process.exit(1)
}

if (noise.length > 0) {
  const byCode = new Map()
  for (const item of noise) byCode.set(item.code, (byCode.get(item.code) ?? 0) + 1)
  const summary = [...byCode.entries()].map(([code, count]) => code + '×' + String(count)).join(' ')
  console.log('[client-lint] ' + target + ' 通过（忽略 ' + String(noise.length) + ' 条已知噪音：' + summary + '）')
} else {
  console.log('[client-lint] ' + target + ' 通过（无诊断）')
}
