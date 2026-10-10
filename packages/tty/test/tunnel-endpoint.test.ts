/**
 * @hyzyn/dsh-tty — 端口转发「主机:端口」端点组的样式契约（用户截图上报，原话「输入框的样式优化一下」）。
 *
 * ## 现场（两张截图各拍到一个症状）
 * 一张是宽卡片里的整行：`[ 127.0.0.1 : 本机端口 ←—— 一大片空白 ——→ ] → [ 服务器侧主机 ←—— 大空档 ——→ : 端口 ]`；
 * 另一张是**聚焦态**：冒号旁边多出来一道竖线，读起来像多了一道分隔线（而不是聚焦提示）。
 *
 * ## 根因（两处，都在 `.tt_tunnelEndpoint` 这一族规则上）
 * 1. **组被行宽抻开**：`.tt_tunnelEndpoint { flex: 1 1 190px }`。左组三个孩子（静态地址 / 冒号 /
 *    端口框）都不增长 ⇒ 端口框后面留一片**组内死区**（preview 实测 **463px**）；右组的
 *    `.tt_tunnelHost { flex: 1 1 auto }` 自己吃掉全部余量 ⇒ 冒号 + 端口被顶到卡片右缘，离
 *    「服务器侧主机」占位符几百像素。修法：组 `flex: 0 1 auto` **贴合内容**，host 给确定的
 *    basis（窄容器里靠 `min-width` 兜住，不许缩到看不见）。
 * 2. **聚焦环被自己的 `overflow: hidden` 裁掉**：本包输入框的聚焦态是 `border-color` +
 *    `box-shadow: var(--tt-ring)`（2px 外扩），而这一组是 `overflow: hidden` ⇒ 环只剩输入框
 *    两侧各一条竖线。修法：内层输入**不自己画环**，改由组在 `:focus-within` 上画一条
 *    （同一套 `--tt-ring`；环画在组自己身上，不会被自己的 overflow 裁）。
 *
 * ## 为什么「聚焦环」这半在**源码**上判、不在 preview 里判
 * headless 夹具里 `document.hasFocus()` 为 false，此时 `:focus` **压根不匹配**
 * （实测 `el.matches(':focus') === false`，而祖先的 `:focus-within` 照常匹配）——于是
 * 「内层输入有没有自己画环」那一项在夹具里**恒为 none**：拿它当断言就是一条恒绿，
 * 比没有更坏（旧写法也能"通过"）。所以几何那半留在 preview 的 `tunnel-edit` 场景量
 * （组宽 − 孩子宽之和 > 2.5px 即红），聚焦环这半在这里按 CSS 的**成对关系**钉。
 *
 * ## 判据（都是"性质"，不是像素）
 * 1. 组**不增长**（`flex` 的首值是 `0`）——「不跟着行宽抻开」的直接判据；
 * 2. host 有**确定的宽度基准**（`px`）与 `min-width`——组才可能贴合内容、窄容器又不塌；
 * 3. 内层 `:focus` / `:focus-visible` 上 `box-shadow: none` **且** 组 `:focus-within` 上有环：
 *    两条**成对**（只有前者 = 聚焦看不见；只有后者 = 两道环），且组的环读的是同一个令牌。
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
 * 规则扫描与取值走**仓库级共享实现**（`scripts/client-design-tokens.mjs`）：client-lint 的
 * 检查四~十六也读同一份文本形状，自己再写一份 `parseRules` 一定会漂。
 */
const rules = parseCssRules(css) as Rule[]
const selectorList = (rule: Rule): string[] => rule.selector.split(',').map((part) => part.trim())
const withSelector = (selector: string): Rule[] =>
  rules.filter((rule) => selectorList(rule).includes(selector))

/** `flex` 的简写首值（增长系数）；只写了 `flex-grow` 时退回它。 */
function flexGrow(rule: Rule): string | undefined {
  const shorthand = declValue(rule.decls, 'flex')
  if (shorthand === undefined) return declValue(rule.decls, 'flex-grow')
  return shorthand.trim().split(/\s+/)[0]
}

/** `flex` 的第三值（宽度基准）；两值写法（`flex: 1 1`）或 `flex-basis` 退回后者。 */
function flexBasis(rule: Rule): string | undefined {
  const shorthand = declValue(rule.decls, 'flex')
  if (shorthand === undefined) return declValue(rule.decls, 'flex-basis')
  const parts = shorthand.trim().split(/\s+/)
  return parts[2] ?? declValue(rule.decls, 'flex-basis')
}

const ENDPOINT = '.tt_tunnelEndpoint'
const HOST = '.tt_tunnelEndpoint .tt_tunnelHost'
const INNER_FOCUS = '.tt_tunnelEndpoint .tt_cardInput:focus'
const INNER_FOCUS_VISIBLE = '.tt_tunnelEndpoint .tt_cardInput:focus-visible'
const GROUP_FOCUS = '.tt_tunnelEndpoint:focus-within'

const endpointRules = (): Rule[] => withSelector(ENDPOINT)
const last = (list: Rule[]): Rule | undefined => list.at(-1)

describe('端口转发的端点组样式（用户截图：输入框样式）', () => {
  it('CSS 解析得到规则与选择器（自证：解析器/选择器漂了下面几条会假绿）', () => {
    expect(rules.length).toBeGreaterThan(100)
    expect(endpointRules().length).toBeGreaterThan(0)
    expect(withSelector(HOST).length).toBeGreaterThan(0)
    expect(withSelector(GROUP_FOCUS).length).toBeGreaterThan(0)
    expect(withSelector(INNER_FOCUS).length).toBeGreaterThan(0)
  })

  it('端点组贴合内容：不增长（`flex-grow: 0`）', () => {
    const rule = last(endpointRules())
    expect(rule).toBeDefined()
    expect(
      flexGrow(rule!),
      '端点组又变成会随行宽增长（`flex: 1 1 …`）：左组的孩子都不增长，端口框后面会留下一片组内死区' +
        '（用户截图现场；preview 的 tunnel-edit 量到过 463px）',
    ).toBe('0')
  })

  it('主机格有确定的宽度基准 + min-width（组才贴合内容、窄容器又不塌）', () => {
    const rule = last(withSelector(HOST))
    expect(rule).toBeDefined()
    expect(
      flexBasis(rule!),
      '主机格没有确定的宽度基准（`auto` = 拿输入框的默认宽度，且宽容器里会被拉伸）：' +
        '组宽会跟着行宽走，冒号 + 端口被顶到卡片右缘（用户截图的右组现场）',
    ).toMatch(/^\d+px$/)
    expect(
      declValue(rule!.decls, 'min-width'),
      '主机格没有 min-width：窄容器里会被压到看不见',
    ).toMatch(/^\d+px$/)
  })

  it('聚焦环成对：内层不画 + 组上画（否则 2px 外扩的环会被 overflow 裁成一条竖线）', () => {
    for (const selector of [INNER_FOCUS, INNER_FOCUS_VISIBLE]) {
      const inner = last(withSelector(selector))
      expect(inner, '缺少选择器 ' + selector).toBeDefined()
      expect(
        declValue(inner!.decls, 'box-shadow'),
        selector + ' 上没有把内层输入的环压掉：`.tt_tunnelEndpoint` 是 overflow: hidden，' +
          '2px 外扩的 `--tt-ring` 会被裁成输入框两侧各一条竖线——用户截图里「冒号旁边多出来一道线」就是它',
      ).toBe('none')
    }
    const group = last(withSelector(GROUP_FOCUS))
    expect(group).toBeDefined()
    expect(
      declValue(group!.decls, 'box-shadow'),
      '组上没画聚焦环：内层被压掉之后焦点就完全看不见了（两条必须成对）',
    ).toBe('var(--tt-ring)')
  })

  it('反例自证：旧写法（`flex: 1 1 190px`）会被上面那条判据拦下', () => {
    // 这不是"测测试"：它证明「不增长」那条判据真的在区分两种写法（否则它可以恒绿）
    const old: Rule = { selector: ENDPOINT, decls: 'flex: 1 1 190px; min-width: 0;' }
    expect(flexGrow(old)).toBe('1')
    expect(flexGrow(old)).not.toBe('0')
  })
})
