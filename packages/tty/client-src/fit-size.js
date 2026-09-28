/**
 * @hyzyn/dsh-tty — 「这次算出来的尺寸能不能发给 PTY」的纯判据（D79）。
 *
 * 为什么单独成文件：`client-src/index.js` 是浏览器 IIFE 入口、没有导出，逻辑放在里面就
 * 只能靠真机点（同 `dock-owner.js` / `jump-field.js` / `stats-bar.js`）。这里的判据是纯的，
 * 抽出来可以直接用 vitest 钉住；esbuild 打包时按普通本地模块内联，产物形态不变。
 *
 * ## 背景（0.22.1 修的那次事故）
 *
 * `FitAddon.proposeDimensions()` 只在「没有 parentElement」或「cell 尺寸为 0」时返回
 * `undefined`。而标签元素有三种状态都能绕过去：
 *
 * 1. **藏在别的标签后面**：`switchTab` 给非活动标签设 `display:none` ⇒ 容器 0 宽 0 高
 *    ⇒ FitAddon 把 `cols` 夹到 2、`rows` 夹到 1；
 * 2. **根本没进文档**：agent 开的标签刻意不 `switchTab`（不抢焦点）⇒ `term.open(termEl)`
 *    之后 `element.parentElement` 是**游离**的 `termEl`（truthy，骗过它那道守卫）⇒
 *    `parseInt('auto')` = NaN ⇒ 返回 `{cols: NaN, rows: NaN}`；
 * 3. **面板最小化**：modal 整体 `display:none`，同上。
 *
 * 发帧那一侧此前只看 `dims !== undefined`——**NaN 也算「有值」**，`JSON.stringify` 把 NaN
 * 写成 `null`，宿主 `clampInt(null, …)` 里 `Number(null)` = 0 **是有限数**，于是被夹到下限
 * （宿主对 rows 的下限也是 2）⇒ 后台标签的 PTY 一律变成 **2×2**：长任务输出按 2 列折行，
 * 而 xterm 不重排历史行 ⇒ 那段 scrollback 永久花屏，`tty_capture` / `tty_screen` 读出来
 * 也是竖排（正则匹配、人工判读一起报废）。
 *
 * 所以判据必须前置到这里：**要么给出可信尺寸，要么什么都不发**。
 */

/** 低于这个宽度基本只能是退化值（真实面板哪怕很窄也有几十列）。 */
export const MIN_FIT_COLS = 20
/** 同上，行数（FitAddon 的 rows 下限是 1、宿主 clampInt 的下限是 2，都不是「合理」。） */
export const MIN_FIT_ROWS = 3
/** 与宿主 `clampInt(cols, 80, 2, 500)` 的上限一致：这里先夹好，宿主拿到的就是最终值。 */
export const MAX_FIT_COLS = 500
/** 与宿主 `clampInt(rows, 24, 2, 200)` 的上限一致。 */
export const MAX_FIT_ROWS = 200
/** 容器不可用（不可见 / 未挂载）时的 spawn 回落，与宿主 clampInt 的缺省值一致。 */
export const FALLBACK_COLS = 80
export const FALLBACK_ROWS = 24

/** 宿主元素当前有没有真实盒子：隐藏标签（`display:none`）与未挂载元素都是 0。 */
export function boxUsable(width, height) {
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
}

/**
 * 把一次 `proposeDimensions()` 结果过滤成「可以发给 PTY 的尺寸」。
 *
 * @param dims - 探测结果：`undefined` 或 `{cols, rows}`（**可能是 NaN**，见文件头）。
 * @param box - 宿主元素盒子 `{width, height}`（`clientWidth` / `clientHeight`）；
 *   嵌入终端传自己的挂载容器，普通标签传 `termEl`。
 * @returns `{cols, rows}`（已取整并夹到协议范围），或 `undefined` = **这次别发**。
 */
export function usableFitSize(dims, box) {
  if (dims === null || dims === undefined) return undefined
  const cols = Math.floor(Number(dims.cols))
  const rows = Math.floor(Number(dims.rows))
  // NaN / Infinity / 非数字：FitAddon 对游离元素给的就是 NaN
  if (!Number.isFinite(cols) || !Number.isFinite(rows)) return undefined
  // 退化小值：2×1（隐藏标签）这类「合法但荒谬」的尺寸，正是事故的落点
  if (cols < MIN_FIT_COLS || rows < MIN_FIT_ROWS) return undefined
  // 容器不可见（切到别的标签 / 面板最小化 / 元素没进 DOM）：尺寸无意义
  if (box === null || box === undefined || !boxUsable(Number(box.width), Number(box.height))) return undefined
  return { cols: Math.min(MAX_FIT_COLS, cols), rows: Math.min(MAX_FIT_ROWS, rows) }
}
