/**
 * @hyzyn/dsh-tty — 退出态不遮输出 + 顶部提示条（D96 / issue #7①②）。
 *
 * ## 现场（用户报告 + 截图）
 *
 * agent 跑的每条命令都会在面板里落一个标签；会话退出后标签上盖一层**铺满整个终端区**的
 * 遮罩（`inset:0` + `rgba(6,9,15,.58)` + `blur(1.5px)`），把命令结果压在下面——用户的
 * 绕过手段是打开 F12 把 `.tt_overlay` 设成隐藏。同一层还整块吃点击（`cursor:pointer`
 * 且点击 = 重新打开），于是**已退出的标签里连选中复制都做不到**。
 *
 * 这与 D77 的语义正好相反：只读保留态存在的理由就是「进程退出 ≠ 会话消失，输出还能读」,
 * 而面板这一层把它盖住了。
 *
 * ## 这一版改了什么
 *
 * - 面板标签的退出态**不再画遮罩**（`showTabOverlay` 里那条 `level === 'exited' &&
 *   tab.embedded !== true` 的守卫）；错误态与「重连中」的遮罩照旧——那两层的用处是
 *   解释「为什么这里没有输出」，撤掉会只剩一片空白；
 * - 退出态改由 `.tt_body` 顶部的**退出提示条**表达（`.tt_exitBar`）：一行状态 +
 *   最多一颗动作按钮，输出照常可读、可滚、可复制；
 * - 嵌入终端（dsh-docker 抽屉里那块）维持原样：它没有面板的顶部条，退出态只有遮罩能
 *   承载「点击重新执行」。
 *
 * ## 本用例钉的是性质，不是像素
 *
 * 像素走查归 `scripts/preview`（场景 `exited` / `exit-bar`）。这里按仓库惯例
 * （同 `scrollbar-skin.test.ts`）钉住四条**没有就会静默出错**的性质：
 *
 * 1. **不许再给面板标签画退出遮罩**——守卫必须在 `showTabOverlay` 里；
 * 2. **撤了遮罩就必须有那条条**——面板骨架里得有 `.tt_exitBar` 节点，否则退出态的标签
 *    既没有遮罩也没有提示（用户直接失去「重新打开」这个入口）；
 * 3. **条子必须让位**——`.tt_term` 的 top 要按 `--tt-exitbar-h` 下移，且与状态条同时
 *    出现时是两者之**和**，否则终端第一行被条子盖住（与状态条同款的老坑）；
 * 4. **退出帧要同时做这两件事**——清遮罩 + 刷新提示条；只做一半就是「有遮罩没条」
 *    或「有条不刷新」。
 *
 * 反向验证：删掉 CSS 的 `[data-stats][data-exited]` 那条 → 第 3 条红；删掉骨架里的
 * `.tt_exitBar` → 第 2 条红；把守卫的条件改成 `true`（面板标签也画遮罩）→ 第 1 条红。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { declValue, parseCssRules } from '../../../scripts/client-design-tokens.mjs'

const css = readFileSync(new URL('../client-src/tty.css', import.meta.url), 'utf8')
const src = readFileSync(new URL('../client-src/index.js', import.meta.url), 'utf8')

interface Rule {
  /** 选择器列表（空白已归一，逗号分隔） */
  selector: string
  /** 声明块原文 */
  decls: string
  /** 规则起始行（1-based） */
  line: number
}

const rules = parseCssRules(css) as Rule[]

/** 取某个选择器的规则（空白归一后逐字比较；多个同名规则返回第一个）。 */
function ruleFor(selector: string): Rule | undefined {
  const want = selector.replace(/\s+/g, ' ').trim()
  return rules.find((rule) => rule.selector.replace(/\s+/g, ' ').trim() === want)
}

/** `showTabOverlay` 的函数体（从函数头到下一个顶层 `function` 之前）。 */
function showTabOverlayBody(): string {
  const start = src.indexOf('function showTabOverlay(')
  expect(start, '源码里找不到 showTabOverlay').toBeGreaterThan(-1)
  const next = src.indexOf('\nfunction ', start + 1)
  return src.slice(start, next === -1 ? undefined : next)
}

describe('退出态不遮输出（issue #7①）', () => {
  it('守卫在 showTabOverlay 里：面板标签的 exited 态只清空遮罩', () => {
    const body = showTabOverlayBody()
    const guard = /if \(level === 'exited' && tab\.embedded !== true\) \{\s*el\.textContent = ''\s*return\s*\}/.exec(body)
    expect(guard, 'showTabOverlay 少了「面板标签不画退出遮罩」的守卫（或守卫被改成了别的形状）').not.toBeNull()
  })

  it('错误态 / 重连中的遮罩保留（那两层在解释「为什么没有输出」）', () => {
    const body = showTabOverlayBody()
    expect(body).toContain("level === 'error' ? ICON_STOP")
    expect(body).toContain("level === 'info' ? ICON_REFRESH")
  })
})

describe('顶部退出提示条（issue #7②）', () => {
  it('面板骨架里有那条条（撤了遮罩就必须有它，否则退出态没有任何入口）', () => {
    expect(src).toContain('<div class="tt_exitBar" hidden></div>')
    // 初始化：每个面板一枚节点，随面板作废
    expect(src).toContain("exitBarEl = modalEl.querySelector('.tt_exitBar')")
    expect(src).toContain('exitBarEl = null')
  })

  it('条高是令牌，且 .tt_term 按它让位（含与状态条叠加的情形）', () => {
    const token = ruleFor(':where(html, body)')
    expect(token, '找不到令牌声明块 :where(html, body)').toBeDefined()
    expect(declValue(token!.decls, '--tt-exitbar-h')).toBe('32px')

    const single = ruleFor('.tt_body[data-exited] .tt_term')
    expect(single, '少了「退出提示条出现时终端下移」的规则').toBeDefined()
    expect(declValue(single!.decls, 'top')).toBe('var(--tt-exitbar-h)')

    // 两条同时出现时是两者之和：写成其中一条的值会让终端第一行被另一条盖住
    const both = ruleFor('.tt_body[data-stats][data-exited] .tt_term')
    expect(both, '少了「状态条 + 退出条同时出现」的叠加规则').toBeDefined()
    expect(declValue(both!.decls, 'top')).toBe('calc(var(--tt-statsbar-h) + var(--tt-exitbar-h))')

    // 退出条自己也要跟着状态条下移，否则两条压在同一行
    const barShift = ruleFor('.tt_body[data-stats] .tt_exitBar')
    expect(barShift, '少了「状态条在场时退出条下移」的规则').toBeDefined()
    expect(declValue(barShift!.decls, 'top')).toBe('var(--tt-statsbar-h)')
  })

  it('退出帧里两件事一起做：清遮罩 + 刷新提示条', () => {
    const start = src.indexOf("msg.t === 'exit'")
    expect(start, '源码里找不到 exit 帧处理分支').toBeGreaterThan(-1)
    const end = src.indexOf("} else if (msg.t === 'stats')", start)
    expect(end, '找不到 exit 分支的结束位置').toBeGreaterThan(start)
    const branch = src.slice(start, end)
    expect(branch, 'exit 帧没清遮罩：面板标签会留着上一次的遮罩').toContain("showTabOverlay(tab, '')")
    expect(branch, 'exit 帧没刷新退出提示条：条子不会出现').toContain('applyExitBar()')
  })
})
