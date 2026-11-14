/**
 * [`scripts/sidebar-entry-icons.mjs`](../sidebar-entry-icons.mjs) 的单元测试 ——
 * 「侧栏入口图标必须显式声明笔画、且取宿主面板图标的 1px」这条判据。
 *
 * ## 为什么有这份测试
 *
 * 这条判据守的是 2026-11-14 真机漏掉的那一维：四个 kit 入口与宿主面板行并排时，字号 / 字色 /
 * 圆角 / 内边距 / 图标**盒子尺寸**全对上了，只有笔画是 1.5~1.7px（宿主 1.0px）——肉眼一眼就看
 * 出来「我们的图标更粗」，而 client-lint 的十二道检查与截图全绿。
 *
 * 这类判据的三种漂法（与 `client-design-tokens.test.ts` 同源）都会让防线白给：
 *
 *   ① **漏报**：解析写松（把入口图标规则当成普通规则、只认 `.X svg` 不认 `.X`、`1px` 认不出）
 *      → 下一个入口照样带着 1.7 上线，而且**没人会再量一次**；
 *   ② **误报**：把带祖先前缀的状态规则（`[data-sidebar-collapsed] .X`）当成基准几何、或把
 *      填充字形当违规 → 对合法代码报错，最后一定被人削弱或加豁免；
 *   ③ **恒绿**：类名一改，`collectEntryIcons` 的命中数掉到 0，findings 自然是空数组——绿得毫无
 *      意义。所以用例**先断言收集到的集合**，再断言没有 finding（发现面也算判据，本仓明令
 *      「0 命中 = 恒绿闸门，比没有还坏」）。
 *
 * 反例一律用**真实形态的 CSS 片段**（与仓库里 rss / search / tty / docker 的写法同构），
 * 并同时钉住正例不误报。
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  HOST_ICON_STROKE,
  collectEntryIcons,
  entryIconStrokeFindings,
  listEntryIconFiles,
} from '../sidebar-entry-icons.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** 被测包：四个带侧栏入口的 kit 插件。 */
const ENTRY_PACKAGES = ['rss', 'search', 'tty', 'docker']

/**
 * 入口图标的**已知集合**（`类名 → 画笔声明值`）。
 *
 * 这个集合是判据的一部分：新增一个带侧栏入口的插件时必须在这里加一行，否则用例会因为
 * 「收集到的集合对不上」而红——那是提醒，不是噪音（没有这一步，类名一改就恒绿了）。
 */
const EXPECTED_ICONS = {
  dk_entryIcon: '1',
  rss_sidebarEntryIcon: '1',
  gs_sidebarEntryIcon: '1',
  tt_sidebarEntryIcon: '1',
}

/** 扫一遍真实仓库里的四个入口包。 */
function scanRepo() {
  const files = []
  for (const pkg of ENTRY_PACKAGES) {
    for (const file of listEntryIconFiles(join(repoRoot, 'packages', pkg))) {
      files.push({ file, source: readFileSync(file, 'utf8') })
    }
  }
  return files
}

describe('入口图标的发现面', () => {
  it('真实仓库里四个入口图标都被收集到（类名一改就红，而不是恒绿）', () => {
    const icons = collectEntryIcons(scanRepo())
    const names = icons.map((icon) => icon.cls).sort()
    expect(names).toEqual(Object.keys(EXPECTED_ICONS).sort())
    for (const icon of icons) {
      expect(icon.filled, icon.cls + ' 不该是填充字形').toBe(false)
      expect(icon.stroke, icon.cls + ' 的笔画').toBe(EXPECTED_ICONS[icon.cls])
    }
    // 扫到的文件数也要有下限：一个都扫不到时上面那条不可能通过，但这条把原因说得更直白
    expect(scanRepo().length).toBeGreaterThan(3)
  })

  it('真实仓库里没有一条入口图标违规', () => {
    expect(entryIconStrokeFindings(scanRepo())).toEqual([])
  })
})

describe('判据语义：该报的必须报', () => {
  it('声明缺失 → missing（图标常量按 18px 设计，1.5~1.7 会跟着进来）', () => {
    const findings = entryIconStrokeFindings([
      { file: 'a.css', source: '.x_entryIcon svg{width:16px;height:16px}' },
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0].code).toBe('missing')
    expect(findings[0].selector).toBe('.x_entryIcon')
  })

  it('声明了但对不上宿主（1.7 / 1.5 / 2）→ value，且报出真实值', () => {
    for (const bad of ['1.7', '1.5', '2']) {
      const findings = entryIconStrokeFindings([
        { file: 'a.css', source: '.x_entryIcon svg{width:16px;height:16px;stroke-width:' + bad + '}' },
      ])
      expect(findings, 'stroke-width:' + bad).toHaveLength(1)
      expect(findings[0].code).toBe('value')
      expect(findings[0].detail).toContain(bad)
    }
  })

  it('没有任何选择器命中时不报（此时靠「发现面」那条用例兜底，不靠这里）', () => {
    expect(entryIconStrokeFindings([{ file: 'a.css', source: '.unrelated{color:red}' }])).toEqual([])
  })
})

describe('判据语义：不该报的不许报', () => {
  it('声明成宿主的 1（`1` / `1px` / `1.0` 三种写法）都通过', () => {
    for (const good of ['1', '1px', '1.0']) {
      const findings = entryIconStrokeFindings([
        { file: 'a.css', source: '.x_entryIcon svg{width:16px;height:16px;stroke-width:' + good + '}' },
      ])
      expect(findings, 'stroke-width:' + good).toEqual([])
    }
  })

  it('写在 `.X` 上而不是 `.X svg` 上也认（两种写法都表达同一件事）', () => {
    expect(entryIconStrokeFindings([
      { file: 'a.css', source: '.x_entryIcon{width:16px;height:16px;stroke-width:1}' },
    ])).toEqual([])
  })

  it('显式声明为填充字形（fill:currentColor + stroke:none）时放行——但不能靠沉默', () => {
    expect(entryIconStrokeFindings([
      { file: 'a.css', source: '.x_entryIcon svg{width:16px;height:16px;fill:currentColor;stroke:none}' },
    ])).toEqual([])
    // 只写 fill 不写 stroke:none 不算「显式」——那是漏声明
    const half = entryIconStrokeFindings([
      { file: 'a.css', source: '.x_entryIcon svg{width:16px;height:16px;fill:currentColor}' },
    ])
    expect(half).toHaveLength(1)
    expect(half[0].code).toBe('missing')
  })

  it('带祖先前缀的状态覆盖（折叠态 / 悬停）不参与判定，也不误报', () => {
    const findings = entryIconStrokeFindings([
      {
        file: 'a.css',
        source: '.x_entryIcon svg{width:16px;height:16px;stroke-width:1}'
          + '[data-sidebar-collapsed] .x_entryIcon svg{width:18px;height:18px}',
      },
    ])
    expect(findings).toEqual([])
  })

  it('内联在 JS 字符串里的样式同样能扫到（rss / search 的住法）', () => {
    const source = "const CSS = [\n  '.x_entryIcon svg{width:16px;height:16px;stroke-width:1}',\n]"
    expect(collectEntryIcons([{ file: 'client.js', source }]).map((icon) => icon.cls)).toEqual(['x_entryIcon'])
    expect(entryIconStrokeFindings([{ file: 'client.js', source }])).toEqual([])
  })
})

describe('约定与判据不许分家', () => {
  it('kit README 里写着这条规格（删掉约定文字也要红）', () => {
    const readme = readFileSync(join(repoRoot, 'packages/kit/README.md'), 'utf8')
    expect(readme).toContain('stroke-width')
    expect(readme).toContain('侧栏入口的落位与规格')
  })

  it('宿主的笔画口径是 1（值变了就要重新量宿主，不能只改这个常数）', () => {
    expect(HOST_ICON_STROKE).toBe(1)
  })
})
