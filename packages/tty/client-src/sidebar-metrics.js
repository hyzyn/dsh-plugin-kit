/**
 * @hyzyn/dsh-tty — 侧栏入口「与宿主行对齐」的几何推导（纯逻辑）。
 *
 * tty **D107**：「与宿主对齐」不是一组常数，是一条要持续成立的等式（详见 DEFECTS.md）。
 *
 * 为什么单独成文件：`client-src/index.js` 是浏览器 IIFE 入口、没有导出，几何计算放在里面
 * 就只能靠真机点。这里把「宿主行的 computed style → 本插件入口该用的 min-height / padding」
 * 抽成纯函数，vitest 直接钉住（esbuild 打包时按普通本地模块内联，产物形态不变）——与
 * `stats-bar.js` / `status-line.js` 同一套做法。
 *
 * ## 它要解决的问题
 *
 * 宿主侧栏行 `.panelRow` 的几何是**会变的**：`0.2.2-rc.1` 是 `min-height: 36px` /
 * `padding: 7px …`，`0.2.2-rc.2` 收紧成 `32px` / `5px`。本插件原先（0.34.0）把这两个值
 * **写死在 CSS** 里，于是升级后入口比同栏其它条目**高 4px**——只影响显式开了
 * `sidebarHostAlign` 的用户（默认关），所以一直没被注意到。
 *
 * ## 为什么不是把 36 改成 32
 *
 * 宿主**没有暴露行高类令牌**：`--dsh-sidebar-*` 只有 `inline-padding` / `label-gap` /
 * `paint-inset` / `row-padding`，没有高度；客户端半体也拿不到宿主版本号。写死新值会让
 * **rc.1 及更早档反向偏 4px**，等于把一个 bug 换到另一边。
 *
 * 所以改成「挂载时量一次宿主行、把结果写成 CSS 变量」：CSS 只留兜底值（量不到时仍按旧版
 * 几何，不会更差），JS 拿到什么就套什么。宿主再改版式，这里不需要再改代码。
 *
 * ## 边界
 *
 * 只认**能解析成有限非负数的 px**：`auto` / `normal` / `calc(…)` / 空串一律当「这一项没量到」，
 * 由 CSS 兜底——半截脏值比不写更糟（会把行压扁或撑高）。`0` 是**合法值**（宿主完全可以
 * 用 0 padding），不能当「没量到」丢掉。
 */

/** 把 computed style 里的长度解析成像素数；解析不出来（或负值）返回 undefined。 */
function px(value) {
  if (typeof value !== 'string') return undefined
  const match = /^(-?\d+(?:\.\d+)?)px$/.exec(value.trim())
  if (match === null) return undefined
  const parsed = Number(match[1])
  if (!Number.isFinite(parsed) || parsed < 0) return undefined
  return parsed
}

/**
 * 从一行宿主条目的 computed style 推出本插件入口该套用的几何。
 *
 * @param style 宿主行的 computed style（`getComputedStyle()` 的结果，或同形状的对象）。
 *   至少要能读到 `minHeight` / `paddingTop` / `paddingBottom` / `paddingLeft` / `paddingRight`。
 * @returns `{ minHeight, padTop, padRight, padBottom, padLeft }`，每一项是像素数或 undefined；
 *   **全都没量到时返回 undefined**（调用方据此完全不写变量，纯靠 CSS 兜底）。
 */
export function hostRowMetrics(style) {
  if (style === undefined || style === null) return undefined
  const metrics = {
    minHeight: px(style.minHeight),
    padTop: px(style.paddingTop),
    padRight: px(style.paddingRight),
    padBottom: px(style.paddingBottom),
    padLeft: px(style.paddingLeft),
  }
  const any = Object.values(metrics).some((value) => value !== undefined)
  return any ? metrics : undefined
}

/** 变量名 → metrics 字段。顺序固定，便于断言与排查。 */
const CSS_VAR_OF = {
  '--tt-host-min-height': 'minHeight',
  '--tt-host-pad-top': 'padTop',
  '--tt-host-pad-right': 'padRight',
  '--tt-host-pad-bottom': 'padBottom',
  '--tt-host-pad-left': 'padLeft',
}

/**
 * 把 {@link hostRowMetrics} 的结果变成要写到入口元素上的 CSS 变量。
 *
 * **只返回量到的项**：没量到的项不出现，CSS 里 `var(--x, <兜底>)` 才会走兜底分支。
 *
 * @param metrics `hostRowMetrics()` 的返回值。
 * @returns `[[变量名, 值], …]`；`metrics` 为 undefined 时返回空数组。
 */
export function hostRowCssVars(metrics) {
  if (metrics === undefined || metrics === null) return []
  const vars = []
  for (const [name, field] of Object.entries(CSS_VAR_OF)) {
    const value = metrics[field]
    if (value === undefined) continue
    vars.push([name, String(value) + 'px'])
  }
  return vars
}
