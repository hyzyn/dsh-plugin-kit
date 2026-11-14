/**
 * **侧栏入口「折叠 rail」覆盖的门控**判据（供 scripts/test/sidebar-entry-rail.test.ts 用）。
 *
 * ## 为什么单独一条
 *
 * 2026-11-14 用户在桌面端报的现场：点「收起」时，kit 的四个入口和官方的「插件 / 插件市场 /
 * 更多」**效果不一样**——官方行还保持宽态在淡出，kit 的入口已经只剩图标、并且被居中推到了
 * 冻结宽度的一半（看起来像四个图标悬在半空）。
 *
 * 机制（真机实测，DSH `0.2.2-rc.3`）：外壳点下收起的那一刻就给**框架**打
 * `data-sidebar-collapsed`，但**布局要到 settle（`COLLAPSE_SETTLE_MS` = 150ms）之后**才落到
 * rail——先把冻结在展开宽度的内容淡出，settle 时才卸载宽内容、换成 36×36。入口原先直接
 * 拿框架属性当门控，于是**第一帧就切**；而宿主自己那批行要等 React 把 wide 内容换成 rail。
 * 两边因此不在同一拍上。
 *
 * ## 判据
 *
 * 宿主 README 明确留了给集成方的**稳定标记**：`data-sidebar-scrollport`——「展开时视口带有
 * data-sidebar-scrollport，这是供测试和集成方定位的稳定标记」。它只在**宽态**存在，settle 后
 * 与宽内容一起消失。所以 rail 覆盖一律要写成：
 *
 *     [data-sidebar-collapsed] <入口类>:not([data-sidebar-scrollport] *)
 *
 * 本判据只钉一件事：**四个入口包的客户端样式里，每一条以 `[data-sidebar-collapsed]` 开头的
 * 选择器都必须带这层门控**。没带 = 收起动画期间入口先于宿主切 rail（就是这次报的那个形态）。
 *
 * ## 边界
 *
 * - 只看客户端样式来源（有 `client-src/` 扫它，否则扫裸 `client.js`）——文件发现与
 *   `sidebar-entry-icons.mjs` 同一份实现，避免第二份「哪些文件算客户端半体」的口径。
 * - `[data-sidebar-collapsed]` 出现在**注释里**不算（`parseCssRules` 先剥注释）。
 * - 不判 `:not()` 里写什么别的（复杂度判不了），只判「有没有这层门控」。
 * - 老宿主根本没有该标记时 `:not()` 恒真，等于退回「点了就切」——那是刻意的降级，
 *   不是违规；本判据不区分宿主版本。
 */
import { parseCssRules } from './client-design-tokens.mjs'
import { listEntryIconFiles as listClientStyleFiles } from './sidebar-entry-icons.mjs'

/** 外壳在「点下收起」时给**框架**打的属性（早于布局落到 rail）。 */
export const COLLAPSED_ATTR = '[data-sidebar-collapsed]'

/** 宿主 README 承诺给集成方的稳定标记：**只在展开（宽态）时**挂在滚动视口上。 */
export const EXPANDED_MARKER = 'data-sidebar-scrollport'

/** 与宿主同时切 rail 的那层门控：入口不在带展开标记的视口里。 */
export const RAIL_GATE = ':not([' + EXPANDED_MARKER + '] *)'

/** 命中时要贴给使用者的正确写法。 */
export const RAIL_GATE_HINT = '折叠 rail 覆盖必须带门控 ' + RAIL_GATE + '：外壳点下收起就给框架打 '
  + 'data-sidebar-collapsed，但布局要到 settle（150ms）之后才落到 rail。没这层门控，入口会在收起'
  + '动画的第一帧就只剩图标、被居中推到冻结宽度的一半，与同栏官方面板行不在同一拍上。'
  + '判据与实测见 packages/kit/README.md § 侧栏入口的落位与规格（折叠切 rail 的时机跟着宿主）。'

/**
 * 一个包要扫的客户端样式文件。
 *
 * @param pkgDir 包目录（`packages/<name>`）。
 * @returns 该包要扫的绝对路径列表；没有客户端半体时返回空数组。
 */
export function listRailFiles(pkgDir) {
  return listClientStyleFiles(pkgDir)
}

/**
 * 收集所有以 `[data-sidebar-collapsed]` 开头的选择器（逗号分段后逐条），并标注有没有门控。
 *
 * @param files `[{ file, source }]`（`file` 只用于报告）。
 * @returns `[{ file, line, selector, gated }]`，按 `file` + `line` 排序。
 */
export function collectRailRules(files) {
  const found = []
  for (const { file, source } of files) {
    for (const rule of parseCssRules(source)) {
      for (const part of String(rule.selector).split(',')) {
        const text = part.trim()
        if (!text.startsWith(COLLAPSED_ATTR)) continue
        found.push({ file, line: rule.line, selector: text, gated: text.includes(RAIL_GATE) })
      }
    }
  }
  return found.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)))
}

/**
 * 从一批「文件 → 源码」里找出**没带门控**的 rail 覆盖。
 *
 * @param files `[{ file, source }]`（`file` 只用于报告）。
 * @returns `[{ file, line, selector, code, detail }]`；`code` 固定为 `ungated`。
 */
export function railGateFindings(files) {
  return collectRailRules(files)
    .filter((rule) => !rule.gated)
    .map((rule) => ({
      file: rule.file,
      line: rule.line,
      selector: rule.selector,
      code: 'ungated',
      detail: '这条折叠 rail 覆盖没带 ' + RAIL_GATE + '：收起动画期间它会先于宿主切 rail',
    }))
}
