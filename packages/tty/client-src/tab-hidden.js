/**
 * @hyzyn/dsh-tty — 「对 agent 不可见」标签的判据（纯模块，0.30.0）。
 *
 * ## 为什么单独一个文件
 *
 * 判据（哪个标签能隐藏、切换后规格长什么样、菜单该显示哪一句）写在 `client-src/index.js`
 * 里就没有测试入口（那是浏览器 IIFE、不导出，同 `tab-bulk.js` / `session-live.js` 的理由）。
 * 抽出来用 vitest 钉住，esbuild 打包时按普通本地模块内联，产物形态不变。
 *
 * ## 边界：客户端这处不是安全边界
 *
 * 真正的拦截在宿主（`TtySession.hiddenFromAgent` + `listForAgent` + `agentView`）——只让
 * 客户端不过滤显示是假安全，知道 sid 就能绕过。这里管的是**用户看得见的那一半**：
 * 菜单给不给这一项、标签上有没有标记、切换后本地规格存成什么。
 *
 * - **只有用户自己的标签能隐藏**：agent 用 `tty_open` 开的（`agentOwned`）与嵌入终端
 *   （`embedded`）都不给这一项。隐藏是用户对「我的标签」的处置；agent 若能把自己的会话
 *   藏起来，等于把它的行为从用户眼前抹掉（D06「隐形会话」的反面）。宿主侧
 *   `setHiddenFromAgent` 有同一判据，两处都拦：这里管「菜单不出现」，那里才是拒绝。
 * - **写规格时永不改入参**：规格对象被 `tabs` / sessionStorage / 复用键共用，
 *   就地改会让「取消隐藏」把同一份对象上的历史状态一起改掉。返回新对象。
 * - **取消隐藏 = 删除字段**（不是写 `false`）：`specReuseKey` 与持久化都按「有没有这个
 *   字段」判，留一个 `hidden: false` 会让两个本该相同的规格算出不同的键。
 */

/** 规格是否标了「对 agent 不可见」（缺字段 / 非法规格一律 false）。 */
export function isHiddenFromAgentSpec(spec) {
  return spec !== null && typeof spec === 'object' && spec.hidden === true
}

/**
 * 这个标签能不能被设为「对 agent 不可见」。
 *
 * @param tab - 标签对象（读 `agentOwned` / `embedded`；缺省按用户标签处理）。
 */
export function canHideFromAgent(tab) {
  if (tab === null || typeof tab !== 'object') return false
  if (tab.agentOwned === true) return false
  if (tab.embedded === true) return false
  return true
}

/**
 * 切换后的标签规格（新对象）。`hidden` 为假时**删掉该字段**（见文件头）。
 *
 * @param spec - 原规格（`tab.spawnSpec`；非法时按空对象处理）。
 * @param hidden - 目标状态。
 */
export function withHiddenFromAgent(spec, hidden) {
  const base = spec !== null && typeof spec === 'object' ? { ...spec } : {}
  if (hidden === true) {
    base.hidden = true
    return base
  }
  delete base.hidden
  return base
}

/** 右键菜单该显示哪一句（隐藏中就显示「取消隐藏」）。 */
export function hiddenMenuKey(hidden) {
  return hidden === true ? 'btn.showToAgent' : 'btn.hideFromAgent'
}
