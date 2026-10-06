/**
 * @hyzyn/dsh-tty — 终端滚动条皮肤：别让面板的统一细滚动条吃掉视口自己的皮肤（D86）。
 *
 * ## 症状（用户截图上报）
 * 面板右缘再往里 12px（= `.tt_term` 的右内边距，正是视口的右边界）立着一根**近通高、
 * 白得发亮**的细条，而终端区是固定深色——看着像渲染残渣。用户反问「桌面里的终端是
 * 正常的」：其实那台只是**缓冲里没有可滚内容**（Chromium 只在真有可滚范围时才画），
 * 与浏览器/桌面版无关（两个 profile 装的 `@hyzyn/dsh-tty` 是同一份产物）。
 *
 * ## 根因：本包自己写的两条规则互相打架
 * 1. `tty.css` 顶部「统一细滚动条」：`.tt_modal *`（还有 `.tt_card *` 等）设了
 *    `scrollbar-width: thin; scrollbar-color: var(--dsw-alias-scrollbar-bg-l1, …)`；
 * 2. 同一个文件下半段 `.tt_term .xterm-viewport::-webkit-scrollbar*`：给视口画 4px
 *    淡白胶囊（`rgba(255,255,255,.16)` + 3px 透明边 + 胶囊圆角）。
 *
 * Chromium 的规则是：**滚动容器只要任一标准属性（`scrollbar-width` / `scrollbar-color`）
 * 是非 `auto`，就切到「标准滚动条」绘制路径，该元素上的 `::-webkit-scrollbar*` 样式整体
 * 失效**；而这两个属性又都是**继承属性**——`.tt_modal *` 直接命中 `.xterm-viewport`、
 * 祖先上的值也照样下来。于是终端视口拿到的是主题 token 色：亮色主题
 * `--dsw-alias-scrollbar-bg-l1` → `--dsw-static-neutral-200` = **#e5e5e5** 的不透明亮条
 * （用户截图里实测 (231,230,233)，与 #e5e5e5 加面板冷色渐变一致；本机 headless 复现为
 * (229,229,229) / 12 device px）。
 *
 * ## ⚠️ 修法的关键：**两个属性都要复位**
 * headless 实测（DPR=2、真实 CSS，三个盒子只差标准属性，都带这套 ::-webkit 皮肤）：
 *
 * | 盒子 | 标准属性 | 实测 |
 * |---|---|---|
 * | X | `scrollbar-color: auto` + 继承来的 `thin` | 22 device px，剖面 `232│250×4│193×12│250│237` —— 皮肤**没**回来，换成了主题外的 UA 默认亮条（轨道 + 默认滑块） |
 * | Y | `scrollbar-color: auto` + `scrollbar-width: auto` | 8 device px，剖面 `53×8` = `rgba(255,255,255,.16)` 叠 `#0b0e14` —— 皮肤回来了 |
 * | Z | 不受面板规则影响（对照） | 与 Y 一致 |
 *
 * 也就是说 `scrollbar-color: auto` **单独不够**：`thin` 还在，照样是标准路径。这一层关系
 * 就是本用例第 2 条要钉的（最初只写 color 的版本在此被判红）。
 *
 * ## 这条用例钉的是性质，不是像素
 * 像素与真实 DOM 走查归 `scripts/preview`（本层按 `vitest.config.ts` 只收纯逻辑/文本契约）。
 * 三条性质：
 * 1. **危险规则还在就得有复位**：面板后代的统一细滚动条规则一旦设非 `auto` 的标准属性，
 *    视口就必须自己声明 `scrollbar-color` 把它顶掉（`.tt_term .xterm-viewport` 是 0,2,0，
 *    胜过 `.tt_modal *` 的 0,1,0，不依赖书写顺序）；—— 反过来，若哪天那条规则不再命中
 *    视口，请连同复位与本用例一起删/改，别留一条没有前提的断言。
 * 2. **复位 `color: auto` ⇒ 必须同时复位 `width: auto`**（X/Y 那层，见上表）；
 *    并且这套 ::-webkit 皮肤必须还在——`auto` 的语义是「交回下面那套皮肤」，皮肤被删掉
 *    就等于把视口交给 UA 默认样式（终端区固定深色，结果不可控）。
 * 3. 复位写在**视口本体**上，而不是靠给 `.tt_modal *` 加 `:not()` 绕开：继承属性
 *    不认这套，祖先上的值照样会下来。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { declValue, parseCssRules } from '../../../scripts/client-design-tokens.mjs'

const css = readFileSync(new URL('../client-src/tty.css', import.meta.url), 'utf8')

interface Rule {
  /** 选择器列表（空白已归一，逗号分隔） */
  selector: string
  /** 声明块原文 */
  decls: string
}

/*
 * 规则扫描与取值走**仓库级共享实现** `scripts/client-design-tokens.mjs`：本文件原本带着一份
 * 私有的 `parseRules` / `decl`，而 client-lint 的检查六要按同一份文本形状判「胶囊有没有配对
 * corner-shape」——两份实现一定会漂，漂了就是「一边改对了、另一边还按老形状判」。
 * 2026-10-06 合并时实测：两者在 tty.css 上给出**同一批 403 条规则、逐条声明零差异**。
 */
const rules = parseCssRules(css)
const decl = declValue
const selectorList = (rule: Rule): string[] => rule.selector.split(',').map((part) => part.trim())
const withSelector = (selector: string): Rule[] =>
  rules.filter((rule) => selectorList(rule).includes(selector))

/** 面板后代的统一细滚动条规则（`… *` 形态）里设了非 auto 标准属性的那些。 */
const hazards = rules.filter((rule) => {
  const hits = selectorList(rule).some((sel) => sel.endsWith(' *'))
  const color = decl(rule.decls, 'scrollbar-color')
  const width = decl(rule.decls, 'scrollbar-width')
  const nonAuto = (value: string | undefined): boolean => value !== undefined && value !== 'auto'
  return hits && (nonAuto(color) || nonAuto(width))
})

/** 视口本体上的标准属性声明（可能多处，后者覆盖前者：取最后一条有效值）。 */
function viewportDecl(name: string): string | undefined {
  const values = withSelector('.tt_term .xterm-viewport')
    .map((rule) => decl(rule.decls, name))
    .filter((value): value is string => value !== undefined)
  return values.at(-1)
}

const thumbSkins = withSelector('.tt_term .xterm-viewport::-webkit-scrollbar-thumb')

/** 域调色板（`--tt-*` 的定义位）里某个自定义属性的登记值。 */
const tokenValue = (name: string): string | undefined =>
  rules.map((rule) => decl(rule.decls, name)).filter((value): value is string => value !== undefined).at(-1)

describe('终端滚动条皮肤（D86）', () => {
  it('CSS 解析得到规则（自证：解析器坏了下面几条会假绿）', () => {
    expect(rules.length).toBeGreaterThan(100)
    expect(selectorList(hazards[0] ?? { selector: '', decls: '' })).toContain('.tt_modal *')
    expect(thumbSkins.length).toBeGreaterThan(0)
    /*
     * 皮肤色不再写死在规则体里：它是终端域调色板的一项（client-lint 检查十六要求规则体
     * 一律 var() 读、字面量只许登记在 --tt-* 的定义位）。两条一起钉：规则读的是哪个令牌，
     * 令牌登记的是哪个值。
     */
    expect(decl(thumbSkins[0]!.decls, 'background')).toBe('var(--tt-term-scrollbar)')
    expect(tokenValue('--tt-term-scrollbar')).toBe('rgba(255, 255, 255, .16)')
  })

  it('危险规则还在（面板后代设了非 auto 的标准属性）→ 视口必须自己复位', () => {
    expect(
      hazards.length,
      '面板后代的「统一细滚动条」规则没了/已改成 auto —— 若它确实不再命中终端视口，' +
        '请连同视口上的标准属性复位与本用例一起删或改（别留没有前提的断言）',
    ).toBeGreaterThan(0)
    expect(
      viewportDecl('scrollbar-color'),
      '.tt_term .xterm-viewport 没有自己声明 scrollbar-color：继承下来的主题 token 色会' +
        '让 Chromium 走标准滚动条路径，::-webkit 皮肤整体失效（亮色主题下就是一根 #e5e5e5 亮条）',
    ).toBe('auto')
  })

  it('复位 color: auto 之后必须同时复位 scrollbar-width: auto（否则 thin 仍把皮肤顶掉）', () => {
    if (viewportDecl('scrollbar-color') !== 'auto') return // 显式挑了别的颜色：另一条合法修法
    expect(
      viewportDecl('scrollbar-width'),
      '只复位 scrollbar-color 不够：scrollbar-width 只要还是非 auto（继承来的 thin 也算），' +
        'Chromium 就继续走标准滚动条路径 —— 实测那会画成 UA 默认亮条（轨道 + 默认滑块），' +
        '皮肤根本没回来。见本文件头 X/Y/Z 对照',
    ).toBe('auto')
  })

  it('皮肤本身必须还在（auto 的语义是「交回这套皮肤」），且复位写在视口本体上', () => {
    if (!thumbSkins.length) throw new Error('皮肤不见了：::-webkit-scrollbar-thumb 规则缺失')
    expect(decl(thumbSkins[0]!.decls, 'background-clip')).toBe('content-box')
    // 视口那条规则的选择器确实比「面板后代」那条更具体：类选择器多一个（0,2,0 > 0,1,0）
    const spec = (selector: string): number => (selector.match(/[.[]/gu) ?? []).length
    expect(spec('.tt_term .xterm-viewport')).toBeGreaterThan(spec('.tt_modal *'))
    expect(hazards.flatMap((rule) => selectorList(rule)).some((sel) => sel.includes(':not('))).toBe(false)
  })
})
