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
 * ## 检查清单（共十六条）
 *
 * 每条规则的**判据、成因与实测代价**都写在对应模块的文件头里，本文件只负责调度与汇总。
 * 各检查的实现位置：
 *
 *   一 名字解析 ─────────── 本文件（`tsc --checkJs`）
 *   二 宿主地址来源 ─────── client-host-url.mjs
 *   三 点击委托作用域 ───── client-click-scope.mjs
 *   四 主题令牌名 ───────── client-theme-tokens.mjs
 *   五 私有属性定义位 ┐
 *   六 胶囊 corner-shape ┤─ client-design-tokens.mjs
 *   七 ~ 十六 样式取值 ──── client-style-spec.mjs（发丝线 / elevation 配对 / 圆角档位 /
 *                          悬空声明 / 危险按钮 / 按钮族 / 排版角色 / 选中色 / 输入档 / 颜色来源）
 *
 * 下面是前两道的展开说明（其余各条见各自模块的文件头）。
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
import {
  ELEVATION_RULE_HINT,
  HAIRLINE_RULE_HINT,
  DANGLING_DECL_RULE_HINT,
  DANGER_BUTTON_RULE_HINT,
  BUTTON_RECIPE_RULE_HINT,
  TYPOGRAPHY_RULE_HINT,
  ACCENT_COLOR_RULE_HINT,
  INPUT_RECIPE_RULE_HINT,
  COLOR_SOURCE_RULE_HINT,
  RADIUS_SCALE_RULE_HINT,
  describeBorderWithElevation,
  describeButtonRecipe,
  describeDangerButton,
  describeTypographyRole,
  describeAccentColor,
  describeInputRecipe,
  describeColorSource,
  describeNonHairlineBorder,
  describeOffScaleRadius,
  describeDanglingDeclaration,
  scanBorderWithElevation,
  scanButtonClasses,
  scanButtonRecipes,
  scanDangerButtonRecipes,
  scanFontSizeSites,
  scanTypographyRoles,
  scanAccentColors,
  scanAccentColorSites,
  scanInputRecipes,
  scanInputSites,
  scanColorLiterals,
  scanThemeTokenRefs,
  scanDanglingDeclarations,
  scanNonHairlineBorders,
  scanOffScaleRadii,
  scanStyleSpecTotals,
} from './client-style-spec.mjs'
import {
  CAPSULE_CORNER_RULE_HINT,
  describeCapsuleCorner,
  describeVarUse,
  scanCapsuleCorners,
  scanCapsuleSites,
  scanUndefinedVars,
  scanVarUses,
  UNDEFINED_VAR_RULE_HINT,
} from './client-design-tokens.mjs'

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
 * 检查五 / 六：设计令牌（规则与成因见 client-design-tokens.mjs）
 * ------------------------------------------------------------------ */

/*
 * 与检查四同源的两条，吃的也是同一批文件（`listThemeScanFiles` 的 `.js` + `.css` 口径），
 * 所以在这里一次读盘、两条规则共用。
 *
 * **检查五**：非宿主前缀的自定义属性必须在本包里有定义位。2026-10-06 实测三处仍在 main 上：
 * tty 的 `--tt-label-1`（**无 fallback** → 那条 `color` 整条作废）与 `--tt-bg-2`、docker 的
 * `--dk-bg-2`（有 fallback → 静默降级）。检查四看不见它们（那不是 `--dsw-*`），tsc 不查 CSS
 * 变量名，preview 用自己造的假主题，冒烟只断言文案与控件值——与检查四同一张「四层防线全漏」的表。
 *
 * **检查六**：胶囊/正圆必须配对 `corner-shape: round`。宿主 `corner-shape.css` 在
 * `@supports (corner-shape:superellipse(1.5))` 里给**所有元素**设了全局超椭圆（本机
 * Chrome 154 实测生效），不配对就会把胶囊与正圆拉变形；宿主自己的 Pill / Tag / Switch /
 * StateDot 都成对写，而本仓此前**一处都没有**（实测 53 处）。
 *
 * 两条都先扫全量、再报 findings，并把命中数打进通过行（同检查四的理由：0 命中 = 恒绿闸门）。
 */
const clientSources = listThemeScanFiles(root).map((file) => ({
  file: relative(root, file).replaceAll('\\', '/'),
  source: readFileSync(file, 'utf8'),
}))
const undefinedVarFindings = scanUndefinedVars(clientSources)
const capsuleSites = scanCapsuleSites(clientSources)
const capsuleFindings = scanCapsuleCorners(clientSources)
const varUseTotal = clientSources.reduce((sum, file) => sum + scanVarUses(file.source).length, 0)

/*
 * 官方样式规范的十条「值」判据（规则与成因见 client-style-spec.mjs）：
 *   检查七 中性边框必须是 0.5px 发丝线；
 *   检查八 高层级表面不许「中性 border + 投影」配对；
 *   检查九 圆角只许官方六档（--dsw-radius-*）；
 *   检查十 不许有悬空声明（浏览器静默丢弃）；
 *   检查十一 危险按钮（删除/撤销）必须用宿主官方的 .danger 配方；
 *   检查十二 按钮族必须对齐宿主 ui-primitives 的 Button（填充 token / 尺寸 / 字行配对 /
 *           禁用态 / 键盘焦点）；
 *   检查十三 文字角色：font-size 必须配 line-height，字重只用 400 / 500 / 600；
 *   检查十四 原生控件的选中态走宿主的中性 brand（accent-color 必须是 brand-primary，复选框 16×16，
 *           且每个复选框标记点都要有规则管到）；
 *   检查十五 输入框 / 下拉要按宿主的输入档写（显式 height + token 圆角）；
 *   检查十六 颜色一律来自宿主主题（不许带颜色字面量兜底，规则体里不许出现字面量颜色）。
 * 与检查五/六吃同一批文件（listThemeScanFiles 的 .js + .css 口径），共用一次读盘。
 */
const nonHairlineFindings = scanNonHairlineBorders(clientSources)
const borderElevationFindings = scanBorderWithElevation(clientSources)
const offScaleRadiusFindings = scanOffScaleRadii(clientSources)
const danglingFindings = scanDanglingDeclarations(clientSources)
const dangerButtonFindings = scanDangerButtonRecipes(clientSources)
const buttonRecipeFindings = scanButtonRecipes(clientSources)
const buttonClasses = scanButtonClasses(clientSources)
const typographyFindings = scanTypographyRoles(clientSources)
const fontSizeSites = scanFontSizeSites(clientSources)
const accentColorFindings = scanAccentColors(clientSources)
const accentColorSites = scanAccentColorSites(clientSources)
const inputRecipeFindings = scanInputRecipes(clientSources)
const inputSites = scanInputSites(clientSources)
const colorSourceFindings = scanColorLiterals(clientSources)
const colorTokenRefs = scanThemeTokenRefs(clientSources)
const styleSpecTotals = scanStyleSpecTotals(clientSources)

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

for (const item of undefinedVarFindings) {
  console.error('[client-lint] ' + item.file + ':' + String(item.line) + ':' + String(item.col) + ' ' + describeVarUse(item))
}

for (const item of capsuleFindings) {
  console.error('[client-lint] ' + item.file + ':' + String(item.line) + ' ' + describeCapsuleCorner(item))
}

for (const item of nonHairlineFindings) {
  console.error('[client-lint] ' + item.file + ':' + String(item.line) + ' ' + describeNonHairlineBorder(item))
}

for (const item of borderElevationFindings) {
  console.error('[client-lint] ' + item.file + ':' + String(item.line) + ' ' + describeBorderWithElevation(item))
}

for (const item of offScaleRadiusFindings) {
  console.error('[client-lint] ' + item.file + ':' + String(item.line) + ' ' + describeOffScaleRadius(item))
}

for (const item of danglingFindings) {
  console.error('[client-lint] ' + item.file + ':' + String(item.line) + ' ' + describeDanglingDeclaration(item))
}

for (const item of dangerButtonFindings) {
  console.error('[client-lint] ' + item.file + ':' + String(item.line) + ' ' + describeDangerButton(item))
}

for (const item of buttonRecipeFindings) {
  console.error('[client-lint] ' + item.file + ':' + String(item.line) + ' ' + describeButtonRecipe(item))
}

for (const item of typographyFindings) {
  console.error('[client-lint] ' + item.file + ':' + String(item.line) + ' ' + describeTypographyRole(item))
}

for (const item of accentColorFindings) {
  console.error('[client-lint] ' + item.file + ':' + String(item.line) + ' ' + describeAccentColor(item))
}

for (const item of inputRecipeFindings) {
  console.error('[client-lint] ' + item.file + ':' + String(item.line) + ' ' + describeInputRecipe(item))
}
for (const item of colorSourceFindings) {
  console.error('[client-lint] ' + item.file + ':' + String(item.line) + ' ' + describeColorSource(item))
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

if (undefinedVarFindings.length > 0) {
  console.error('\n[' + packageName + '] 自定义属性检查失败：' + String(undefinedVarFindings.length) + ' 处引用了本包没定义的自定义属性。')
  console.error('  ' + UNDEFINED_VAR_RULE_HINT)
  console.error('  这类错与「样式变量名写错」同一失效家族：**无 fallback 时那条声明整条作废**'
    + '（shorthand 的所有 longhand 回落 unset，`border-style` 的初始值就是 none——框直接消失），'
    + '有 fallback 时静默降级成另一个值。2026-10-06 实测的三处（tty `--tt-label-1` / `--tt-bg-2`、'
    + 'docker `--dk-bg-2`）此前躲过了全部四层防线。')
}

if (nonHairlineFindings.length > 0) {
  console.error('\n[' + packageName + '] 发丝线检查失败：' + String(nonHairlineFindings.length) + ' 处中性边框不是 0.5px。')
  console.error('  ' + HAIRLINE_RULE_HINT)
  console.error('  官方 web-styling 规范：中性 --dsw-alias-border-* 的平面边框与分割线共用发丝线粗细，'
    + 'Chromium 把它画成一个设备像素；1px 会让 kit 的卡片与输入框在真机上比宿主「重一圈」。')
}

if (borderElevationFindings.length > 0) {
  console.error('\n[' + packageName + '] 层级表面检查失败：' + String(borderElevationFindings.length) + ' 处「中性 border + 投影」配对。')
  console.error('  ' + ELEVATION_RULE_HINT)
  console.error('  投影里已含 0.5px 发丝描边，再叠一层中性 border 会画出双线；官方 elevation spec 明确拒绝这个组合。')
}

if (offScaleRadiusFindings.length > 0) {
  console.error('\n[' + packageName + '] 圆角尺度检查失败：' + String(offScaleRadiusFindings.length) + ' 处用了官方尺度外的字面量。')
  console.error('  ' + RADIUS_SCALE_RULE_HINT)
}

if (danglingFindings.length > 0) {
  console.error('\n[' + packageName + '] 悬空声明检查失败：' + String(danglingFindings.length) + ' 处没有选择器的声明。')
  console.error('  ' + DANGLING_DECL_RULE_HINT)
}

if (typographyFindings.length > 0) {
  console.error('\n[' + packageName + '] 排版角色检查失败：' + String(typographyFindings.length) + ' 处。')
  console.error('  ' + TYPOGRAPHY_RULE_HINT)
  console.error('  单行文本看不出问题，一旦换行就挤在一起；而 700 字重会让插件卡片的标题比整页标题都重——'
    + '两处都是「不报错、只有并排看才发现的观感漂移」。')
}

if (inputRecipeFindings.length > 0) {
  console.error('\n[' + packageName + '] 输入档检查失败：' + String(inputRecipeFindings.length) + ' 处。')
  console.error('  ' + INPUT_RECIPE_RULE_HINT)
  console.error('  与检查十四 ③ 同一个失效家族：**完全没被样式碰过**或只被抄来的那段样式碰过的控件，'
    + '在卡片里单看都正常，和宿主的设置页并排看才发现「更方、更矮一点」。')
}

if (accentColorFindings.length > 0) {
  console.error('\n[' + packageName + '] 控件选中态检查失败：' + String(accentColorFindings.length) + ' 处。')
  console.error('  ' + ACCENT_COLOR_RULE_HINT)
  console.error('  与「按钮填充误用 info-fill」是同一个根因：把强调蓝当成了主色。宿主 Checkbox 的'
    + ' accent-color 与 Switch 的开启态都是 brand-primary（浅色近黑），涂成 #4176e6 的蓝勾'
    + '与宿主并排看就是两种语言——而且它不报错，冒烟也断言不到颜色。')
}

if (colorSourceFindings.length > 0) {
  console.error('\n[' + packageName + '] 颜色来源检查失败：' + String(colorSourceFindings.length) + ' 处颜色没走宿主主题。')
  console.error('  ' + COLOR_SOURCE_RULE_HINT)
  console.error('  与检查四（引用了不存在的令牌）是同一件事的两半：检查四管**名字**对不对，'
    + '这条管**值**对不对。带字面量兜底时名字写错也不会红——面板会安静地换成兜底那个颜色，'
    + '而实测 docker / tty 的兜底蓝是 #4d6bfe、主题给的是 #4176e6；tty 的终端强调色更隐蔽：'
    + '它在 documentElement 上读挂在 body 的 alias 令牌，于是**每一次**都拿兜底值。')
}

if (buttonRecipeFindings.length > 0) {
  console.error('\n[' + packageName + '] 按钮配方检查失败：' + String(buttonRecipeFindings.length) + ' 处没对齐宿主官方 Button。')
  console.error('  ' + BUTTON_RECIPE_RULE_HINT)
}

if (dangerButtonFindings.length > 0) {
  console.error('\n[' + packageName + '] 危险按钮配方检查失败：' + String(dangerButtonFindings.length) + ' 处不符合官方 danger 配方。')
  console.error('  ' + DANGER_BUTTON_RULE_HINT)
  console.error('  官方没有把这条写进 web-styling 文档，但宿主 dsh-client-ui-plugin-manager 的'
    + '「卸载」按钮（Button variant="outline" 叠 .danger）是危险动作的唯一样板：'
    + '同一个设置页上并列着插件的「删除」与宿主的「卸载」，配方不一致就是肉眼可见的两种观感。')
}

if (capsuleFindings.length > 0) {
  console.error('\n[' + packageName + '] 胶囊圆角检查失败：' + String(capsuleFindings.length) + ' 处胶囊/正圆没有配对 corner-shape: round。')
  console.error('  ' + CAPSULE_CORNER_RULE_HINT)
  console.error('  宿主 corner-shape.css 在 @supports (corner-shape:superellipse(1.5)) 里给**所有元素**'
    + '设了全局超椭圆（本机 Chrome 154 实测生效）：不配对时 `border-radius:999px` 与 `50%` 的计算值'
    + '都是 superellipse(1.5)，胶囊与正圆会被拉变形；配上 `corner-shape:round` 才回到正圆。'
    + '宿主 ui-primitives 的 Pill / Tag / Switch / StateDot / ImageLightbox 都成对写。')
}

if (fatal.length > 0) {
  console.error('\n[' + packageName + '] 客户端静态检查失败：' + String(fatal.length) + ' 处"引用了不存在的名字 / 先用后声明"。'
    + '这类错误编译不报、冒烟也未必抓到，只有真渲染到那条分支才炸——请修掉，别只是让它过。')
  process.exit(1)
}

if (hostUrlFindings.length > 0) process.exit(1)

if (clickScopeFindings.length > 0) process.exit(1)

if (themeFindings.length > 0) process.exit(1)

if (undefinedVarFindings.length > 0) process.exit(1)

if (nonHairlineFindings.length > 0) process.exit(1)

if (borderElevationFindings.length > 0) process.exit(1)

if (offScaleRadiusFindings.length > 0) process.exit(1)

if (danglingFindings.length > 0) process.exit(1)

if (dangerButtonFindings.length > 0) process.exit(1)

if (buttonRecipeFindings.length > 0) process.exit(1)

if (typographyFindings.length > 0) process.exit(1)

if (accentColorFindings.length > 0) process.exit(1)

if (inputRecipeFindings.length > 0) process.exit(1)

if (colorSourceFindings.length > 0) process.exit(1)

if (capsuleFindings.length > 0) process.exit(1)

const verdict = '宿主地址来源 0 处 · 样式变量 ' + String(themeTokenUses.length) + ' 处全部存在'
  + ' · 自定义属性 ' + String(varUseTotal) + ' 处全部有定义'
  + ' · 胶囊/正圆 ' + String(capsuleSites.length) + ' 处均已配对 corner-shape'
  + ' · 中性边框 ' + String(styleSpecTotals.borders) + ' 处均为 0.5px 发丝线'
  + ' · 圆角 ' + String(styleSpecTotals.tokenRadii) + ' 处均为官方尺度 token'
  + ' · 危险按钮 ' + String(styleSpecTotals.dangerButtons) + ' 处均为官方 danger 配方'
  + ' · 按钮族 ' + String(buttonClasses.length) + ' 个类均对齐官方 Button'
  + ' · 排版 ' + String(fontSizeSites) + ' 处字号均已配对行高与官方字重'
  + ' · 控件选中色 ' + String(accentColorSites) + ' 处均为官方 brand'
  + ' · 输入档 ' + String(inputSites) + ' 处均为显式高度 + token 圆角'
  + ' · 颜色 ' + String(colorTokenRefs) + ' 处宿主令牌引用均无字面量兜底、规则体无字面量颜色'
if (noise.length > 0) {
  const byCode = new Map()
  for (const item of noise) byCode.set(item.code, (byCode.get(item.code) ?? 0) + 1)
  const summary = [...byCode.entries()].map(([code, count]) => code + '×' + String(count)).join(' ')
  console.log('[client-lint] ' + target + ' 通过（' + verdict + '；忽略 ' + String(noise.length) + ' 条已知噪音：' + summary + '）')
} else {
  console.log('[client-lint] ' + target + ' 通过（' + verdict + '；无诊断）')
}
