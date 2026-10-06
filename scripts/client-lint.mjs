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
 * ## 三道检查
 *
 * **① 名字解析（tsc --checkJs）**：用仓库**已有**的 tsc 对目标跑 `--checkJs`，然后**只把
 * "真 bug"那几个诊断码当失败**：
 *
 *   TS2304 找不到名字          TS2552 找不到名字（"是否想用 X"）
 *   TS2448 块级变量先用后声明   TS2454 变量未赋值就使用
 *
 * 其余诊断（`--checkJs` 下没有类型声明就来的模块解析、DOM 事件类型收窄等）在本项目的打包
 * 方式下是**噪音**：不判失败，但照样打印出来，免得它们悄悄积累成一片看不见的红。
 *
 * **② 宿主地址来源（AST，规则与成因见 `scripts/client-host-url.mjs`）**：禁止从
 * `location` 读 `protocol` / `host` / `hostname` / `origin` / `port` 拼地址，禁止硬编码
 * `ws://` / `wss://` 字面量。桌面版的页面 origin 是 Electron 自定义协议 `dsh-app://app`，
 * 这么算出来的地址连不上宿主；而浏览器直连（`dsh web`）下**完全正常**——所以它同时躲过了
 * vitest（浏览器半体不在本层测）、第 ① 道检查（名字解析零信号）、CDP 冒烟（驱动的是
 * `http://127.0.0.1:3082`，那里 `location` 恰好就是对的）和各包的 preview harness
 * （mock 里是假 WebSocket）。实测代价见 `packages/tty/DEFECTS.md` **tty D61**。
 *
 * 正确写法：基址取 `globalThis.__DSH_TRANSPORT__?.streamBaseUrl ?? document.baseURI`，
 * 并且**凡是要跟宿主建连的地址都要抽成 `client-src/*.js` 纯模块 + vitest 覆盖
 * `dsh-app://app` 场景**（范例：`packages/tty/client-src/ws-url.js` +
 * `packages/tty/test/ws-url.test.ts`）。规矩比测试重要：它决定下一个人会不会再踩。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

import { describeHostUrlUse, HOST_URL_RULE_HINT, listClientSourceFiles, scanHostUrlUses } from './client-host-url.mjs'
import { CLICK_SCOPE_RULE_HINT, listClickScopeTargets, scanClickScopeUses } from './client-click-scope.mjs'
import { describeThemeTokenUse, listThemeScanFiles, loadThemeTokenSnapshot, scanThemeTokenUses, THEME_TOKEN_RULE_HINT } from './client-theme-tokens.mjs'

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

const packageName = (() => {
  try {
    return String(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name ?? 'this package')
  } catch {
    return 'this package'
  }
})()

/* ------------------------------------------------------------------ *
 * 检查一：宿主地址来源（AST）
 * ------------------------------------------------------------------ */

/*
 * 扫描集合（口径见 listClientSourceFiles 的说明）：有 client-src/ 就查**源码全量**
 * ——tsc 的 program 会经 import 拉进兄弟模块，规则检查也不能只看入口；裸 client.js
 * 的包查构建产物。收在模块里而不是写在这儿：CLI 与 scripts/test 的单测必须查同一批
 * 文件，两处各写一份迟早漂。
 */
const hostUrlFindings = listClientSourceFiles(root).flatMap((file) =>
  scanHostUrlUses(relative(root, file).replaceAll('\\', '/'), readFileSync(file, 'utf8')))

/* ------------------------------------------------------------------ *
 * 检查三：document 级点击委托的作用域（规则与成因见 client-click-scope.mjs）
 * ------------------------------------------------------------------ */

/*
 * 多张卡片的客户端半体同挂一个设置页，各自把 click 监听器绑在 document 上；不带作用域判定
 * 的处理器会接走**别张卡片**的按钮（2026-10-03 实测：点 profile 的「删除」弹出 prompt 的
 * `prompt 不存在: `）。与检查一同源：口径与真实语料名单收在模块里，CLI 与单测查同一批文件。
 */
const clickScopeFindings = listClickScopeTargets(root).flatMap(({ file, source }) =>
  scanClickScopeUses(relative(root, file).replaceAll('\\', '/'), source))

/* ------------------------------------------------------------------ *
 * 检查四：样式变量（快照比对；规则与成因见 client-theme-tokens.mjs）
 * ------------------------------------------------------------------ */

/*
 * 客户端半体引用的每个 `--dsw-*` 都必须在宿主主题里**真实存在**。写错一个名字的后果不是
 * 「退回默认样式」：`border` / `background` 这类**简写**含无效 var() 时整条声明作废
 * （longhand 一起回落 unset，`border-style` 的初始值就是 `none`）——**框会直接消失**，
 * 而布局类声明不含变量、照常生效，于是看起来「排版是对的，就是什么都没有」。
 * 2026-10-06 实测到的两处（修复见同日的 `fix(client)` 提交）：`packages/codegraph/client-src/index.js`
 * 的 `state-warning-primary`（真名 `state-warn-primary`，只差一个 `ing`）与 `packages/mcp/client.js`
 * 的 `separator-primary`（`separator` 这一族在宿主 403 个 token 里一个都没有，真名 `border-l2`）。
 * 四层防线（tsc / preview 假主题 / 冒烟 / 人眼）全都看不见它，所以必须在静态层拦。
 *
 * 先在**每个**受管文件上把引用扫全，再拿快照过滤：扫全的那个数量会打进通过行
 * （`样式变量 N 处`）——本仓的规矩是闸门必须自证「命中不是 0」，只会在 0 命中时绿的
 * 检查等于没有检查。快照读不到会在这里抛（不静默跳过，理由见 client-theme-tokens.mjs）。
 */
const { tokens: knownThemeTokens } = loadThemeTokenSnapshot(repoRoot)
const themeTokenUses = listThemeScanFiles(root).flatMap((file) => {
  const fileRel = relative(root, file).replaceAll('\\', '/')
  return scanThemeTokenUses(readFileSync(file, 'utf8')).map((use) => ({ ...use, file: fileRel }))
})
const themeFindings = themeTokenUses.filter((use) => !knownThemeTokens.has(use.token))

/* ------------------------------------------------------------------ *
 * 检查二：名字解析（tsc --checkJs）
 * ------------------------------------------------------------------ */

const tsc = join(repoRoot, 'node_modules', '.bin', 'tsc')
if (!existsSync(tsc)) {
  console.error('[client-lint] 找不到 tsc（' + tsc + '）——先在仓库根 pnpm install')
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
  target,
], { cwd: root, encoding: 'utf8' })

const output = (result.stdout ?? '') + (result.stderr ?? '')
/*
 * 锚点（docker D74）：tsc 的 program 会经 import 拉进 client-src 的兄弟模块
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

/* ------------------------------------------------------------------ *
 * 汇总
 * ------------------------------------------------------------------ */

for (const item of fatal) {
  console.error('[client-lint] ' + item.file + ':' + String(item.line) + ':' + String(item.col) + ' ' + item.code + ' ' + item.text)
}

for (const item of hostUrlFindings) {
  console.error('[client-lint] ' + item.file + ':' + String(item.line) + ':' + String(item.col) + ' ' + describeHostUrlUse(item))
}

for (const item of clickScopeFindings) {
  console.error('[client-lint] ' + item.file + ':' + String(item.line) + ':' + String(item.col) + ' 点击委托缺少作用域判定（处理器 ' + item.handler + '）：' + item.detail)
}

for (const item of themeFindings) {
  console.error('[client-lint] ' + item.file + ':' + String(item.line) + ':' + String(item.col) + ' ' + describeThemeTokenUse(item))
}

if (clickScopeFindings.length > 0) {
  console.error('\n[' + packageName + '] document 级点击委托检查失败：' + String(clickScopeFindings.length) + ' 处。')
  console.error('  ' + CLICK_SCOPE_RULE_HINT)
  console.error('  为什么：同一个设置页上挂着多张插件的卡片，各自把 click 绑在 document 上；'
    + '没有作用域判定就会接走别张卡片的按钮（2026-10-03 实测：点 profile 的「删除」报 `prompt 不存在: `）。')
}

if (themeFindings.length > 0) {
  console.error('\n[' + packageName + '] 样式变量检查失败：' + String(themeFindings.length) + ' 处引用了宿主主题里不存在的样式变量。')
  console.error('  ' + THEME_TOKEN_RULE_HINT)
  console.error('  这类错**编译不报、preview 也报不出来**（preview 用的是自己造的假主题）、冒烟只断言文案与控件值'
    + '——一个没有边框的输入框照样满足断言。真机代价：写错名字的那条 border/background 会整条作废（框或分隔线直接消失）。')
}

if (hostUrlFindings.length > 0) {
  console.error('\n[' + packageName + '] 宿主地址来源检查失败：' + String(hostUrlFindings.length) + ' 处。')
  console.error('  ' + HOST_URL_RULE_HINT)
  console.error('  桌面版页面 origin 是 dsh-app://app（Electron 自定义协议）而不是 HTTP：这些写法在浏览器里'
    + '一切正常、只有桌面版暴露——所以别指望冒烟能替你发现（详见 packages/tty/DEFECTS.md 的 tty D61）。')
}

if (fatal.length > 0) {
  console.error('\n[' + packageName + '] 客户端静态检查失败：' + String(fatal.length) + ' 处"引用了不存在的名字 / 先用后声明"。'
    + '这类错误编译不报、冒烟也未必抓到，只有真渲染到那条分支才炸——请修掉，别只是让它过。')
  process.exit(1)
}

if (hostUrlFindings.length > 0) process.exit(1)

if (clickScopeFindings.length > 0) process.exit(1)

if (themeFindings.length > 0) process.exit(1)

const verdict = '宿主地址来源 0 处 · 样式变量 ' + String(themeTokenUses.length) + ' 处全部存在'
if (noise.length > 0) {
  const byCode = new Map()
  for (const item of noise) byCode.set(item.code, (byCode.get(item.code) ?? 0) + 1)
  const summary = [...byCode.entries()].map(([code, count]) => code + '×' + String(count)).join(' ')
  console.log('[client-lint] ' + target + ' 通过（' + verdict + '；忽略 ' + String(noise.length) + ' 条已知噪音：' + summary + '）')
} else {
  console.log('[client-lint] ' + target + ' 通过（' + verdict + '；无诊断）')
}
