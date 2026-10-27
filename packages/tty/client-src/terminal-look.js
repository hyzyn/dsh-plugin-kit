/**
 * @hyzyn/dsh-tty — 终端外观（字体栈 / 字号 / 光标 / 行高）的纯逻辑（0.34.0，issue #17）。
 *
 * 为什么单独成文件（2026-10-27）：这几件事此前是 `createTerminal` 里的**硬编码值**
 * （`cursorStyle: 'bar'` / `fontSize: 13` / `lineHeight: 1.35` / 内置字体栈），用户改不了；
 * 做成配置项后，客户端要判对错的只有两条：
 *
 *   ① **字体栈怎么拼**：用户那串排在内置等宽栈**之前**，空串则只用内置栈。拼错的表现是
 *      「填了没用」——xterm 只认合法的 `font-family` 值，裸写的数字开头名字（`3270 Nerd
 *      Font`）会让整条声明失效，不是只丢那一个名字（所以宿主侧会逐个补双引号）。
 *   ② **配置轮询下来之后要不要重排**：每轮换一份新对象就 `applyTerminalLook()` 会让
 *      已开的终端**每次轮询闪一下**、视口被顶走。判据必须是「值真的变了」才重排。
 *
 * 这两条都属于「要判对错的客户端逻辑」——按 [docs/conventions.md 规则 ②](../../../docs/conventions.md#-要判对错的客户端逻辑抽成-client-srcjs-纯模块--vitest-用例)，
 * 逻辑留在 11k 行的组件闭包里就等于没有测试入口（`client-lint` 只查静态问题、不验行为）。
 * 所以抽出来配 `test/terminal-look.test.ts`，与 `fit-size.js` / `ws-url.js` / `status-line.js`
 * 同款；esbuild 打包时按普通本地模块内联，产物形态不变。
 *
 * 与宿主侧的**分工**：范围校验与字体名清洗（补引号、去引号/反斜杠/尖括号）都在宿主
 * （`src/index.ts` 的 `normalizePatch` / `sanitizeTerminalFontFamily`），这里只做**客户端
 * 能自证的那半边**——对拿到的值再挡一次非法/缺省（老宿主、字段还没到、配置轮询竞态），
 * 挡不住就保留上一份，绝不把 `undefined` 写进 xterm 的 options。
 */

/**
 * @typedef {'bar' | 'block' | 'underline'} TerminalCursorStyle xterm 认的三种光标形态
 */

/**
 * 一份完整的终端外观。
 * @typedef {object} TerminalLook
 * @property {string} fontFamily 用户在设置卡片里填的字体栈（宿主已清洗；空串 = 只用内置栈）
 * @property {number} fontSize 字号 px
 * @property {TerminalCursorStyle} cursorStyle 光标形态
 * @property {boolean} cursorBlink 光标是否闪烁
 * @property {number} lineHeight 行高倍数
 */

/**
 * 内置等宽字体栈（0.34.0 之前的硬编码值，逐字保留）。
 *
 * 用户没配字体时用它；配了就排在它的**前面**（CSS 按顺序回退，第一个装不上的名字被跳过）。
 */
export const TERMINAL_FONT_STACK = '"JetBrains Mono", "SF Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace'

/**
 * 外观默认值：**刻意逐项等于 0.34.0 之前的硬编码值**，不配这几项时行为与升级前完全一致。
 * @type {Readonly<TerminalLook>}
 */
export const TERMINAL_LOOK_DEFAULTS = Object.freeze({
  fontFamily: '',
  fontSize: 13,
  cursorStyle: 'bar',
  cursorBlink: true,
  lineHeight: 1.35,
})

/**
 * xterm 认可的三种光标形态（`cursorStyle` 只接受这三个值）。
 * @type {ReadonlyArray<TerminalCursorStyle>}
 */
export const TERMINAL_CURSOR_STYLES = Object.freeze(['bar', 'block', 'underline'])

/** 字号范围（px）与行高范围，与宿主 `Config` schema 的 min/max 一一对应。 */
export const TERMINAL_FONT_SIZE_MIN = 8
export const TERMINAL_FONT_SIZE_MAX = 32
export const TERMINAL_LINE_HEIGHT_MIN = 1
export const TERMINAL_LINE_HEIGHT_MAX = 2

/**
 * 由用户的字体栈拼出给 xterm 的 `fontFamily`。
 *
 * @param {unknown} fontFamily - 宿主下发的字体栈（已由宿主清洗并逐个补过双引号）；空串 / 非字符串 = 只用内置栈
 * @returns {string} 一个合法的 CSS `font-family` 值：用户栈在前，内置栈兜底
 */
export function terminalFontFamilyValue(fontFamily) {
  const custom = typeof fontFamily === 'string' ? fontFamily.trim() : ''
  return custom === '' ? TERMINAL_FONT_STACK : custom + ', ' + TERMINAL_FONT_STACK
}

/**
 * 字号是否可用（整数且落在范围内）。
 * @param {unknown} value
 * @returns {value is number}
 */
function usableFontSize(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= TERMINAL_FONT_SIZE_MIN && value <= TERMINAL_FONT_SIZE_MAX
}

/**
 * 行高是否可用（有限数且落在范围内）。
 * @param {unknown} value
 * @returns {value is number}
 */
function usableLineHeight(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= TERMINAL_LINE_HEIGHT_MIN && value <= TERMINAL_LINE_HEIGHT_MAX
}

/**
 * 这个值是不是 xterm 认的光标形态。
 *
 * @param {unknown} value
 * @returns {value is TerminalCursorStyle}
 */
function isCursorStyle(value) {
  // 断言的是「这个值已经在表里」这件事本身，运行时判据仍由 includes 决定
  return typeof value === 'string' && TERMINAL_CURSOR_STYLES.includes(/** @type {TerminalCursorStyle} */ (value))
}

/**
 * 从一份配置快照里读出新的一份外观，**逐字段**挡非法值：挡不住的字段保留 `previous` 里的值。
 *
 * 为什么要逐字段而不是整份替换：配置轮询/热更新的响应可能缺项（老宿主、刚保存时字段
 * 还没回来），整份替换会把字号之类**抹回默认**——用户看到的就是「改完又弹回去了」。
 *
 * @param {Record<string, unknown> | null | undefined} config - `/api/dsh-tty/config` 的快照（或 volatile 更新里的 shape）
 * @param {TerminalLook} [previous] - 上一份外观（缺省用 `TERMINAL_LOOK_DEFAULTS`）
 * @returns {TerminalLook} 一份新的外观对象（不修改入参）
 */
export function readTerminalLook(config, previous = TERMINAL_LOOK_DEFAULTS) {
  const base = previous ?? TERMINAL_LOOK_DEFAULTS
  /** @type {Record<string, unknown>} */
  const source = config !== null && typeof config === 'object' ? /** @type {Record<string, unknown>} */ (config) : {}
  return {
    fontFamily: typeof source.terminalFontFamily === 'string' ? source.terminalFontFamily : base.fontFamily,
    fontSize: usableFontSize(source.terminalFontSize) ? source.terminalFontSize : base.fontSize,
    cursorStyle: isCursorStyle(source.terminalCursorStyle) ? source.terminalCursorStyle : base.cursorStyle,
    cursorBlink: typeof source.terminalCursorBlink === 'boolean' ? source.terminalCursorBlink : base.cursorBlink,
    lineHeight: usableLineHeight(source.terminalLineHeight) ? source.terminalLineHeight : base.lineHeight,
  }
}

/**
 * 两份外观之间有没有真的变化（任一字段不同即为变）。
 *
 * 判据存在的理由：配置是**轮询**下来的，没有变化时也每轮都到一份等价快照。若在这里
 * 恒返回 true，每次轮询都会 `applyTerminalLook()` 重排一遍，用户看到终端每隔几秒闪一次、
 * 翻在历史里也会被顶回底部。
 *
 * @param {TerminalLook | undefined} previous - 上一份外观
 * @param {TerminalLook | undefined} next - 新读出来的外观
 * @returns {boolean}
 */
export function terminalLookChanged(previous, next) {
  if (previous === null || previous === undefined) return next !== null && next !== undefined
  if (next === null || next === undefined) return true
  return previous.fontFamily !== next.fontFamily
    || previous.fontSize !== next.fontSize
    || previous.cursorStyle !== next.cursorStyle
    || previous.cursorBlink !== next.cursorBlink
    || previous.lineHeight !== next.lineHeight
}

/**
 * 程序把光标外观写掉之后，要写回哪些项（**空对象 = 不用动**）。
 *
 * 为什么需要这一层：xterm 里 `cursorBlink` 与 `cursorStyle` **各只有一个变量**，终端里的
 * 程序可以直接写它们 —— `CSI ? 12 h/l`（DECSET/DECRST 12）写 `cursorBlink`，
 * `CSI <n> SP q`（DECSCUSR）写 `cursorStyle`。而 **zsh 的 `zle` 每画一次提示符就写一遍**
 * （vi 插入模式 → 竖线，同时 `?12l` 关闪烁），于是配置项「只在创建/保存时写一次」的那个值
 * 活不过第一条提示符 —— 表现就是用户报的「勾了光标闪烁，开个新终端也不闪」。
 * 2026-10-27 在 test profile 实测：敲一条 `echo hi` 之后 600ms 的闪烁定时器被
 * `clearInterval` 了一次；在同一会话里发 `printf '\033[?12h'` 立刻恢复闪 —— 两个方向
 * 都指向「程序和配置在写同一个变量」。
 *
 * **备用屏幕让位**：vim / less / htop / fzf 这类全屏程序对自己的光标有真实语义
 * （`less` 靠光标驻留、`vim` 用它表达模式），抢过来等于破坏交互；只纠正普通缓冲区里
 * 「提示符顺手改掉」这一种。
 *
 * @param {{cursorStyle: TerminalCursorStyle, cursorBlink: boolean}} want - 配置里想要的
 * @param {{cursorStyle: unknown, cursorBlink: unknown}} current - 终端现在的
 * @param {string} bufferType - `term.buffer.active.type`（`normal` | `alternate`）
 * @returns {{cursorStyle?: TerminalCursorStyle, cursorBlink?: boolean}} 需要写回的项
 */
export function terminalLookDrift(want, current, bufferType) {
  /** @type {{cursorStyle?: TerminalCursorStyle, cursorBlink?: boolean}} */
  const patch = {}
  if (bufferType === 'alternate') return patch
  if (current.cursorStyle !== want.cursorStyle) patch.cursorStyle = want.cursorStyle
  if (current.cursorBlink !== want.cursorBlink) patch.cursorBlink = want.cursorBlink
  return patch
}
