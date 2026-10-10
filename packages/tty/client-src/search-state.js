/**
 * @hyzyn/dsh-tty — 面板头部搜索框开合态的纯判据。
 *
 * 为什么单独成文件：`client-src/index.js` 是浏览器 IIFE 入口、没有导出，逻辑放在里面就
 * 只能靠真机点（同 `fit-size.js` / `tab-bulk.js` / `close-guard.js`）。这里全是纯函数，
 * 抽出来可以直接用 vitest 钉住；esbuild 打包时按普通本地模块内联，产物形态不变。
 *
 * ## 钉住的那次事故（2026-10-10，D99）
 *
 * 头部放大镜与搜索框是同一件事的两个投影，但开合态此前**没有单一真相源**：
 *
 * 1. 「开」写的是**空字符串**（= 撤掉 inline 声明、回落到样式表），而读的判据把空串
 *    一并当成「关」——于是 `toggleSearch()` 点开之后**再也点不关**（第二次点击又判成
 *    「关着」，于是再「打开」一次），关框只剩 Esc 一条路；
 * 2. 按下态 `data-on`（亮起的放大镜）在初始化时被**无条件点亮**，而 Esc 只关框不带按钮、
 *    最小化也只藏框——于是面板一打开就是「框关着、放大镜亮着」，那个亮着的一直骗人
 *    （README 的截图里拍到的就是这一帧）。
 *
 * 契约：**开态必须是一个能读回来的确定值**（`block`），空串不再有任何特殊含义——
 * 写入与读取共用一个常量，才有「写进去什么就读出来什么」这条往返性质。
 */

/** 开态：显式 `block`（input 在 flex 行里本来就被块化，不改排版）。 */
export const SEARCH_OPEN_DISPLAY = 'block'
/** 关态：显式 `none`（面板创建时也用它写初始 inline 样式）。 */
export const SEARCH_CLOSED_DISPLAY = 'none'

/** 判「开着」只认那一个值：空串、`undefined`、别的 display 值一律算关。 */
export function isSearchOpenDisplay(display) {
  return display === SEARCH_OPEN_DISPLAY
}

/** 状态 → 要写进 `style.display` 的值。 */
export function searchDisplayFor(open) {
  return open === true ? SEARCH_OPEN_DISPLAY : SEARCH_CLOSED_DISPLAY
}

/**
 * 放大镜按下后的新状态：**纯取反**。
 *
 * 传进来的是读回来的 inline display（不是布尔），所以「点开能点关」由这一条钉住；
 * 遇到历史上写坏的空串（旧代码的开态）会自愈成「开」——下一次点击即回到确定值。
 */
export function nextSearchOpen(display) {
  return !isSearchOpenDisplay(display)
}
