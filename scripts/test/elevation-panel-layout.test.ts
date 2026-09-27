/**
 * 提权面板（就地授权）的**布局不变量**守卫 —— 2026-09-27 真机报告那一处的防回归。
 *
 * ## 为什么要钉这几条
 *
 * 那份报告的核心证据是「整块读起来是散的」+「这两个按钮没有手型」。手型在已发布产物上
 * **实测复现不出来**（`.dk_btn` / `.tt_toolBtn` 从各自 0.1.0 起就写着 `cursor: pointer`，
 * CDP 实测 computed cursor 为 `pointer`、按钮中心命中自身；宿主 CSS 的 58 条 `cursor` 规则
 * 与全部 `html[data-platform=…]` 规则也压不掉它）。但同一份报告指出的**结构**问题是真的：
 * 命令与它的按钮被两行说明文字隔开、tty 那份把复制按钮塞在命令框里。
 *
 * 修完之后，下面这些性质一旦被改掉，症状会以「散乱 / 命令顶出卡片 / 手型没了」的形式回来，
 * 而它们**不会让任何构建或测试变红**——所以在这里钉住。
 *
 * ## 判据分两层（都不许「匹配不到就算过」）
 *
 * 1. **CSS 层**：手型；命令能整条读（docker = `white-space: pre` + 横向滚动，
 *    tty = `overflow-wrap: anywhere` 折行）；窄栏安全（`minmax(0, 1fr)` + `min-width: 0`，
 *    没有它时长命令会按 max-content 把整块面板顶出卡片右边界）；动作行是 flex 换行行。
 * 2. **结构层**：复制与重新生成两个按钮**在动作行里**，而不是散落在步骤容器里。
 *
 * 反例在真实文本上替换（并断言替换真的生效）。像素级复查走 CDP 脚本（本文件不管像素）。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (rel) => readFileSync(join(REPO, rel), 'utf8')

/** 抽一条 CSS 规则的声明块；**找不到就抛**（「该有的东西找不到」必须是失败，不是跳过）。 */
function cssRule(css, selector) {
  const start = css.indexOf(`${selector} {`)
  if (start === -1) throw new Error(`CSS 里找不到规则：${selector}`)
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  if (close === -1) throw new Error(`CSS 规则没有闭合：${selector}`)
  return css.slice(open + 1, close)
}

/** 抽一段 JSX 子元素列表（从 marker 到收尾的 `] }),`）；找不到就抛。 */
function jsxChildren(source, marker) {
  const start = source.indexOf(marker)
  if (start === -1) throw new Error(`源码里找不到标记：${marker}`)
  const end = source.indexOf('] }),', start)
  if (end === -1) throw new Error(`标记之后找不到子元素列表收尾：${marker}`)
  return source.slice(start, end)
}

/** 两个包各自的差异点（docker 用栅格 + pre 横滚，tty 用 flex + 折行）。 */
const PACKAGES = [
  {
    name: 'docker',
    css: 'packages/docker/client-src/docker.css',
    src: 'packages/docker/client-src/index.js',
    button: '.dk_btn',
    panel: '.dk_elevPanel',
    steps: '.dk_elevSteps',
    command: '.dk_elevCommand',
    actions: '.dk_elevActions',
    /** 命令「整条读得出来」的形态：不折行 + 框内横向滚动。 */
    commandRules: [['white-space', 'pre'], ['overflow-x', 'auto'], ['min-width', '0'], ['max-width', '100%']],
    actionsMarker: "className: 'dk_elevActions', children: [",
  },
  {
    name: 'tty',
    css: 'packages/tty/client-src/tty.css',
    src: 'packages/tty/client-src/index.js',
    button: '.tt_toolBtn',
    panel: '.tt_elevPanel',
    steps: '.tt_elevSteps',
    command: '.tt_elevCommand',
    actions: '.tt_elevActions',
    /** tty 那份刻意允许折行（长路径按任意位置断），但要能压窄。 */
    commandRules: [['min-width', '0']],
    commandChild: { selector: '.tt_elevCommand code', rules: [['overflow-wrap', 'anywhere'], ['min-width', '0']] },
    actionsMarker: "className: 'tt_elevActions', children: [",
  },
]

describe.each(PACKAGES)('$name · 提权面板的布局不变量', (pkg) => {
  const css = read(pkg.css)
  const src = read(pkg.src)

  it('按钮类带手型（用户两次反馈的都是这一类）', () => {
    expect(cssRule(css, pkg.button)).toMatch(/cursor:\s*pointer/)
  })

  it('命令块「整条读得出来」的形态没被改掉', () => {
    const rule = cssRule(css, pkg.command)
    for (const [prop, value] of pkg.commandRules) expect(rule).toMatch(new RegExp(`${prop}:\\s*${value}`))
    if (pkg.commandChild !== undefined) {
      const child = cssRule(css, pkg.commandChild.selector)
      for (const [prop, value] of pkg.commandChild.rules) expect(child).toMatch(new RegExp(`${prop}:\\s*${value}`))
    }
  })

  it('面板与步骤容器压得住：minmax(0, 1fr) + min-width: 0（没有它长命令会顶出卡片）', () => {
    for (const selector of [pkg.panel, pkg.steps]) {
      const rule = cssRule(css, selector)
      expect(rule, `${selector} 缺少 minmax(0, 1fr)`).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/)
      expect(rule, `${selector} 缺少 min-width: 0`).toMatch(/min-width:\s*0/)
    }
  })

  it('动作行是 flex 换行行（极窄宽度下按钮换行而不是挤出卡片）', () => {
    const rule = cssRule(css, pkg.actions)
    expect(rule).toMatch(/display:\s*flex/)
    expect(rule).toMatch(/flex-wrap:\s*wrap/)
    expect(rule).toMatch(/min-width:\s*0/)
  })

  it('复制与重新生成两个按钮在动作行里，而不是散落在步骤容器里', () => {
    const row = jsxChildren(src, pkg.actionsMarker)
    // 防「命中 0 行 = 恒绿」：先证明真的抽到了一段非空的动作行
    expect(row.length).toBeGreaterThan(80)
    expect(row).toMatch(/elev\.copy|elev\.copied/)
    expect(row).toMatch(/elev\.regenerate/)
    // 倒计时/过期提示也跟着动作行（它就是这两颗按钮的状态说明）
    expect(row).toMatch(/elev\.expiresIn|elev\.expired/)
    // 反向：这两个按钮的**使用点**在整份源码里各自只出现一次——若被搬回步骤容器，上面那条会先红，
    // 这条则拦住「动作行里留一份、外面又抄一份」的漂法（i18n 目录里的键定义不带 `t(`，不会被算进来）
    for (const key of ["t('elev.regenerate')"]) {
      expect(src.split(key).length - 1, `${key} 在源码里出现了多次`).toBe(1)
    }
  })
})
