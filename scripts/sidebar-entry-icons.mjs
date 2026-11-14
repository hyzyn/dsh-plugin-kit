/**
 * **侧栏入口图标笔画**的守卫判据（供 `scripts/test/sidebar-entry-icons.test.ts` 用）。
 *
 * ## 为什么要单独一条
 *
 * 2026-11-14 实测漏掉的那一维：四个 kit 插件的侧栏入口并排站到宿主面板行旁边时，
 * 字号 / 字色 / 圆角 / 内边距 / 图标**盒子尺寸**全都对上了，只有**笔画**是 1.5~1.7px，
 * 而宿主是 1.0px——肉眼一眼就看出「我们的图标更粗」，静态检查与截图却全绿。
 *
 * 漏的机制值得写在这里，因为它会重演：
 *
 *   - 宿主的字号 / 颜色 / 圆角 / 内边距都写在**主题 CSS**里，`client-lint` 的检查四~十六
 *     覆盖的正是这些「CSS 里有的东西」；
 *   - 宿主的图标笔画**不在 CSS 里**——它是 sprite 图标定义里的属性
 *     （`<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1">`），
 *     渲染 16px 时实际笔画 1.0px。没有静态判据会去看它；
 *   - 于是「把入口图标塞进 16px 的盒子」被当成「图标对齐了」，而图标常量本身是按 18px
 *     设计的（笔画 1.5~1.7）。
 *
 * 所以这条判据只钉一件事：**侧栏入口图标必须显式声明自己的笔画**，值取宿主的 1
 * （或显式声明这是填充字形）。静默继承图标常量自带的 1.5~1.7 = 红。
 *
 * ## 判据怎么找目标
 *
 * 不按包登记（新插件会漏），而是**自动发现**：扫各包客户端半体里所有类选择器，
 * 类名小写后以 `entryicon` 结尾的（`rss_sidebarEntryIcon` / `tt_sidebarEntryIcon` /
 * `dk_entryIcon` / …）都是「入口图标」，必须有一条 `.X` 或 `.X svg` 的规则把笔画说清楚。
 *
 * ## 边界
 *
 * - 值只认**数值等于 {@link HOST_ICON_STROKE}**（`1` / `1px` / `1.0` 都算）；写 `1.5`
 *   这类——哪怕它是另一套设计的合理值——在这里是红，因为入口是**和宿主面板行并排**的。
 * - 填充字形（`fill: currentColor` + `stroke: none`）是**显式**的另一种口径，允许；
 *   但它必须写出来，不能靠「什么都没声明」蒙混。
 * - 本文件**不写 shebang**（要被 vitest import，与 `check-kit-pins.mjs` 同一套注释）。
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { declValue, parseCssRules } from './client-design-tokens.mjs'

/**
 * 宿主面板图标的实际笔画（px）。
 *
 * 出处：宿主图标定义 `{size: 16, svg: stroke-width: "…"}` 渲染在 16px 行里 → 1.0px。
 * 2026-11-14 在 `0.2.2-rc.3` 真机上量的 computed style：`插件 / 插件市场 / 自动化任务 / 更多`
 * 四枚都是 1.0（QQ 机器人是 24 viewBox 的 0.67，属它自己的设计）。
 */
export const HOST_ICON_STROKE = 1

/** 命中时要贴给使用者的正确写法。 */
export const ENTRY_ICON_STROKE_HINT = '侧栏入口是**和宿主面板行并排**的：'
  + '图标笔画取宿主的 ' + HOST_ICON_STROKE + 'px（`<svg viewBox="0 0 16 16" fill="none" '
  + 'stroke="currentColor" stroke-width="1">` 渲染 16px = 实心 1.0px）。'
  + '本仓图标常量多按 18px 设计（1.5~1.7），直接在入口内使用会比邻居粗 50~70%——'
  + '请在该入口的图标规则里显式覆盖 `stroke-width:1`（或显式声明这是填充字形：'
  + '`fill:currentColor;stroke:none`）。判据与实测见 docs 里的 kit 家族约定'
  + '（packages/kit/README.md § 侧栏入口的落位与规格）。'

/** 一个类选择器的「类名」部分（去掉 `.`）。 */
const CLASS_SELECTOR = /^\.([A-Za-z0-9_-]+)$/

/**
 * 一个包要扫的客户端半体文件：有 `client-src/` 就扫它下面的 `.js` / `.css`，
 * 没有就退回裸 `client.js`（与 `client-theme-tokens.mjs` 的 `listThemeScanFiles` 同一判据：
 * 样式既可以住在独立 `.css` 里，也可以内联在 JS 字符串里）。
 *
 * @param pkgDir 包目录（`packages/<name>`）。
 * @returns 该包要扫的绝对路径列表；没有客户端半体时返回空数组。
 */
export function listEntryIconFiles(pkgDir) {
  const sourceDir = join(pkgDir, 'client-src')
  if (existsSync(sourceDir)) {
    return readdirSync(sourceDir, { recursive: true })
      .map((entry) => join(sourceDir, String(entry)))
      .filter((file) => /\.(js|css)$/u.test(file) && statSync(file).isFile())
  }
  const bare = join(pkgDir, 'client.js')
  return existsSync(bare) ? [bare] : []
}

/**
 * 一条规则的某个选择器是否指向「入口图标」本身（`.X`）或它的 `svg`（`.X svg`）。
 *
 * 带祖先前缀的规则（如 `[data-sidebar-collapsed] .X`）**不算**——那是状态覆盖，
 * 这里要的是「静态几何有没有把笔画说清楚」的那一条。
 *
 * @param selector 规则选择器（可能含逗号，逐个看）。
 * @param cls 目标类名（如 `dk_entryIcon`）。
 * @returns 命中时返回命中的那一段选择器，否则 undefined。
 */
function iconSelectorOf(selector, cls) {
  for (const part of String(selector).split(',')) {
    const text = part.trim()
    const exact = CLASS_SELECTOR.exec(text)
    if (exact !== null && exact[1] === cls) return text
    const nested = text.endsWith(' svg') ? CLASS_SELECTOR.exec(text.slice(0, -' svg'.length)) : null
    if (nested !== null && nested[1] === cls) return text
  }
  return undefined
}

/**
 * 是否显式声明了「这是填充字形」（`fill` 取当前色且 `stroke: none`）。
 *
 * @param decls 声明块原文。
 * @returns 是则 true。
 */
function declaresFilledGlyph(decls) {
  const fill = declValue(decls, 'fill')
  const stroke = declValue(decls, 'stroke')
  return fill !== undefined && /currentcolor/iu.test(fill) && stroke !== undefined && /^none$/iu.test(stroke)
}

/**
 * 从一批「文件 → 源码」里收集**所有被判定为入口图标**的类，并带上它在静态规则里
 * 声明的笔画（没声明就是 undefined）。
 *
 * 为什么要单独暴露「收集」这一步：判据是「0 命中 = 恒绿」的天敌。若某次改动让类名不再以
 * `entryicon` 结尾，`entryIconStrokeFindings` 会安静地返回空数组——绿得毫无意义。用例因此
 * 先断言**收集到的集合**，再断言它没有 finding。
 *
 * @param files `[{ file, source }]`（`file` 只用于报告）。
 * @returns `[{ file, line, cls, stroke, filled }]`，按 `file` + `cls` 排序。
 */
export function collectEntryIcons(files) {
  const found = []
  for (const { file, source } of files) {
    const rules = parseCssRules(source)
    const classes = new Set()
    for (const rule of rules) {
      for (const part of String(rule.selector).split(',')) {
        // 两种写法都算：`.X`（几何写在图标盒上）与 `.X svg`（写在里层 svg 上）。
        // 只认前者会漏掉「只有 svg 规则」的包——那时收集结果是空集合，findings 自然为空，
        // 闸门恒绿（本仓对「0 命中」的既有判据）。
        const text = part.trim()
        const nested = text.endsWith(' svg') ? text.slice(0, -' svg'.length) : text
        const match = CLASS_SELECTOR.exec(nested)
        if (match === null) continue
        if (!match[1].toLowerCase().endsWith('entryicon')) continue
        classes.add(match[1])
      }
    }
    for (const cls of classes) {
      const own = rules.filter((rule) => iconSelectorOf(rule.selector, cls) !== undefined)
      if (own.length === 0) continue
      let stroke
      let line = own[0].line
      for (const rule of own) {
        const value = declValue(rule.decls, 'stroke-width')
        if (value === undefined) continue
        stroke = value.trim()
        line = rule.line
      }
      found.push({
        file,
        line,
        cls,
        stroke,
        filled: own.some((rule) => declaresFilledGlyph(rule.decls)),
      })
    }
  }
  return found.sort((a, b) => (a.file + a.cls).localeCompare(b.file + b.cls))
}

/**
 * 从一批「文件 → 源码」里找出**没把笔画说清楚**的入口图标。
 *
 * @param files `[{ file, source }]`（`file` 只用于报告）。
 * @returns `[{ file, line, selector, code, detail }]`；`code` 是 `missing`（没声明，也没声明
 *   自己是填充字形）或 `value`（声明了但对不上宿主）。
 */
export function entryIconStrokeFindings(files) {
  const findings = []
  for (const icon of collectEntryIcons(files)) {
    if (icon.stroke === undefined) {
      if (icon.filled) continue
      findings.push({
        file: icon.file,
        line: icon.line,
        selector: '.' + icon.cls,
        code: 'missing',
        detail: '入口图标没有声明 stroke-width（宿主的图标是 1.0px，本仓图标常量多是 1.5~1.7）',
      })
      continue
    }
    const numeric = /^(-?\d+(?:\.\d+)?)(?:px)?$/u.exec(icon.stroke)
    const value = numeric === null ? Number.NaN : Number(numeric[1])
    if (Number.isFinite(value) && Math.abs(value - HOST_ICON_STROKE) <= 1e-9) continue
    findings.push({
      file: icon.file,
      line: icon.line,
      selector: '.' + icon.cls,
      code: 'value',
      detail: 'stroke-width:' + icon.stroke + ' 与宿主面板图标的 ' + HOST_ICON_STROKE + 'px 不一致',
    })
  }
  return findings
}
