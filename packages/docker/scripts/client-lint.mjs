#!/usr/bin/env node
/**
 * @hyzyn/dsh-docker — 客户端源码的**定点**静态检查。
 *
 * 为什么需要：`client-src/*.js` 是纯 JS，不参与 `tsc -p tsconfig.json`（那份只覆盖 src）。
 * 于是「引用了不存在的名字」这一类错误**编译不报**，冒烟也未必抓得到——只有真正渲染到那条
 * 分支（或者跑到那个 effect）才炸。本会话实测踩过三次，三次都是同一个根因：
 *
 *   1. 一个 effect 的 deps 引用了几百行之后才声明的 const → TDZ，整块面板被 React 卸载成空白；
 *   2. 清理"没用到"的图标常量时按「切到下一个空行」删，而图标定义之间没有空行 → 连带删掉
 *      后面 12 个图标常量，它们只剩引用没有定义，列表一有卡片就 ReferenceError；
 *   3. 状态写进了另一个组件（`levelMin` 这个锚点在两个视图里都有）→ 聚合日志视图取不到 `tail`。
 *
 * 做法：用仓库**已有**的 tsc 对客户端跑 `--checkJs`，然后**只把"真 bug"那几个诊断码当失败**：
 *
 *   TS2304 找不到名字          TS2552 找不到名字（"是否想用 X"）
 *   TS2448 块级变量先用后声明   TS2454 变量未赋值就使用
 *
 * 其余诊断（`--checkJs` 下没有类型声明就来的模块解析、DOM 事件类型收窄等）在本项目的打包
 * 方式下是**噪音**：不判失败，但照样打印出来，免得它们悄悄积累成一片看不见的红。
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = join(root, '..', '..')

/** 只把这几类当失败：见文件头的说明。 */
const FATAL_CODES = new Set(['TS2304', 'TS2552', 'TS2448', 'TS2454'])

const tsc = join(repoRoot, 'node_modules', '.bin', 'tsc')
if (!existsSync(tsc)) {
  console.error('[dsh-docker] 找不到 tsc（' + tsc + '）——先在仓库根 pnpm install')
  process.exit(1)
}

const result = spawnSync(tsc, [
  '--noEmit',
  '--allowJs',
  '--checkJs',
  '--target', 'esnext',
  '--module', 'esnext',
  '--moduleResolution', 'bundler',
  '--lib', 'esnext,dom,dom.iterable',
  '--skipLibCheck',
  'client-src/index.js',
], { cwd: root, encoding: 'utf8' })

const output = (result.stdout ?? '') + (result.stderr ?? '')
const found = [...output.matchAll(/client-src\/[^(]+\((\d+),(\d+)\): error (TS\d+): (.*)/g)]
  .map((match) => ({ line: Number(match[1]), col: Number(match[2]), code: match[3], text: match[4].trim() }))

const fatal = found.filter((item) => FATAL_CODES.has(item.code))
const noise = found.filter((item) => !FATAL_CODES.has(item.code))

for (const item of fatal) {
  console.error('[dsh-docker] client-src/index.js:' + String(item.line) + ':' + String(item.col) + ' ' + item.code + ' ' + item.text)
}

if (fatal.length > 0) {
  console.error('\n[dsh-docker] 客户端静态检查失败：' + String(fatal.length) + ' 处"引用了不存在的名字 / 先用后声明"。'
    + '这类错误编译不报、冒烟也未必抓到，只有真渲染到那条分支才炸——请修掉，别只是让它过。')
  process.exit(1)
}

if (noise.length > 0) {
  const byCode = new Map()
  for (const item of noise) byCode.set(item.code, (byCode.get(item.code) ?? 0) + 1)
  const summary = [...byCode.entries()].map(([code, count]) => code + '×' + String(count)).join(' ')
  console.log('[dsh-docker] 客户端静态检查通过（忽略 ' + String(noise.length) + ' 条已知噪音：' + summary + '）')
} else {
  console.log('[dsh-docker] 客户端静态检查通过（无诊断）')
}
