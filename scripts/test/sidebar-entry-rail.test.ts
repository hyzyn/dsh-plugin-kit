/**
 * [`scripts/sidebar-entry-rail.mjs`](../sidebar-entry-rail.mjs) 的单元测试 ——
 * 「折叠 rail 覆盖必须带宿主展开标记（`data-sidebar-scrollport`）门控」这条判据。
 *
 * ## 为什么有这份测试
 *
 * 这条判据守的是 2026-11-14 桌面端报的那个现场：点「收起」时，kit 的四个入口已经只剩图标、
 * 还被居中推到冻结宽度的一半，而同栏的官方行还保持宽态在淡出——两边不在同一拍上。成因是
 * 入口拿**框架属性**（点下就变）当门控，而宿主的布局要到 settle（150ms）之后才落到 rail。
 *
 * 这类判据的三种漂法（与 `sidebar-entry-icons.test.ts` 同源）都会让防线白给：
 *
 *   ① **漏报**：解析写松（逗号选择器只查整条 prelude、注释里的字样被算进选择器）→ 下一个 rail
 *      覆盖照样不带门控上线，而且**没人会再点一次收起**；
 *   ② **误报**：把注释、把不带 `[data-sidebar-collapsed]` 的状态规则（`:hover` / `:focus-visible`）
 *      也当违规 → 对合法代码报错，最后一定被人削弱或加豁免；
 *   ③ **恒绿**：选择器前缀一改（或某个包改了写法），`collectRailRules` 的命中数掉到 0，findings
 *      自然是空数组——绿得毫无意义。所以用例**先断言四个包各自收集到的条数**，再断言没有 finding。
 *
 * 反例一律用**真实形态的样式片段**（与仓库里 rss / search / tty / docker 的写法同构），
 * 并同时钉住正例不误报。
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  COLLAPSED_ATTR,
  EXPANDED_MARKER,
  RAIL_GATE,
  collectRailRules,
  listRailFiles,
  railGateFindings,
} from '../sidebar-entry-rail.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** 被测包：四个带侧栏入口的 kit 插件。 */
const ENTRY_PACKAGES = ['rss', 'search', 'tty', 'docker']

/**
 * 每个包**至少**有多少条 rail 覆盖（下限，不是精确值：新增一条不必改这里）。
 *
 * 为什么要有下限：选择器前缀一改（`[data-sidebar-collapsed]` → 别的写法），收集结果会变成空
 * 数组、findings 也空——那时这套判据就是恒绿的。下限把「扫到的条数」也变成判据的一部分。
 */
const MIN_RAIL_RULES = { rss: 4, search: 4, tty: 7, docker: 5 }

/** 扫一遍真实仓库里的四个入口包。 */
function scanRepo() {
  const files = []
  for (const pkg of ENTRY_PACKAGES) {
    for (const file of listRailFiles(join(repoRoot, 'packages', pkg))) {
      files.push({ file, source: readFileSync(file, 'utf8') })
    }
  }
  return files
}

describe('rail 覆盖的发现面', () => {
  it('真实仓库里四个包都扫到了 rail 覆盖，条数不低于下限（前缀一改就红，而不是恒绿）', () => {
    const rules = collectRailRules(scanRepo())
    const perPackage = {}
    for (const rule of rules) {
      const pkg = rule.file.replace(/\\/gu, '/').split('/packages/')[1].split('/')[0]
      perPackage[pkg] = (perPackage[pkg] ?? 0) + 1
    }
    for (const pkg of ENTRY_PACKAGES) {
      expect(perPackage[pkg] ?? 0, pkg + ' 的 rail 覆盖条数').toBeGreaterThanOrEqual(MIN_RAIL_RULES[pkg])
    }
    // 扫到的文件数也要有下限：一个都扫不到时上面那条不可能通过，但这条把原因说得更直白
    expect(scanRepo().length).toBeGreaterThan(3)
  })

  it('真实仓库里没有一条 rail 覆盖缺门控', () => {
    expect(railGateFindings(scanRepo())).toEqual([])
  })
})

describe('判据语义：该报的必须报', () => {
  it('不带门控的 rail 覆盖 → ungated，并指出是哪条选择器', () => {
    const findings = railGateFindings([
      { file: 'a.css', source: '[data-sidebar-collapsed] .x_entry{min-height:36px;padding:0}' },
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0].code).toBe('ungated')
    expect(findings[0].selector).toBe('[data-sidebar-collapsed] .x_entry')
    expect(findings[0].detail).toContain(EXPANDED_MARKER)
  })

  it('逗号选择器里只要有一段缺门控就报（`icon, icon svg` 这种真实写法）', () => {
    const findings = railGateFindings([
      {
        file: 'a.css',
        source: '[data-sidebar-collapsed] .x_entry:not([data-sidebar-scrollport] *) .x_icon,'
          + '[data-sidebar-collapsed] .x_icon svg{width:18px;height:18px}',
      },
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0].selector).toBe('[data-sidebar-collapsed] .x_icon svg')
  })

  it('迁移漏掉的第二种形态：门控加在图标上而入口本体没加', () => {
    const findings = railGateFindings([
      {
        file: 'client.js',
        source: "const CSS = [\n  '[data-sidebar-collapsed] .x_entry{padding:0}',\n"
          + "  '[data-sidebar-collapsed] .x_entry:not([data-sidebar-scrollport] *) .x_icon{width:18px}',\n]",
      },
    ])
    expect(findings.map((f) => f.selector)).toEqual(['[data-sidebar-collapsed] .x_entry'])
  })
})

describe('判据语义：不该报的不许报', () => {
  it('带门控的写法通过（入口本体与它的图标、标签都算）', () => {
    expect(railGateFindings([
      {
        file: 'a.css',
        source: '[data-sidebar-collapsed] .x_entry:not([data-sidebar-scrollport] *){padding:0}'
          + '[data-sidebar-collapsed] .x_entry:not([data-sidebar-scrollport] *) .x_label{display:none}',
      },
    ])).toEqual([])
  })

  it('注释里出现 data-sidebar-collapsed 不算（先剥注释再判）', () => {
    expect(railGateFindings([
      { file: 'a.css', source: '/* [data-sidebar-collapsed] .x_entry 是状态覆盖 */\n.x_entry{min-height:32px}' },
    ])).toEqual([])
  })

  it('不含该前缀的状态覆盖（悬停 / 焦点）不参与判定', () => {
    expect(railGateFindings([
      { file: 'a.css', source: '.x_entry:hover{background-color:red}.x_entry:focus-visible{outline:1px solid}' },
    ])).toEqual([])
  })

  it('内联在 JS 字符串里的样式同样能扫到（rss / search 的住法）', () => {
    const source = "const CSS = [\n  '[data-sidebar-collapsed] .x_entry:not([data-sidebar-scrollport] *){padding:0}',\n]"
    expect(collectRailRules([{ file: 'client.js', source }]).map((r) => r.gated)).toEqual([true])
    expect(railGateFindings([{ file: 'client.js', source }])).toEqual([])
  })
})

describe('约定与判据不许分家', () => {
  it('kit README 里写着这条判据（删掉约定文字也要红）', () => {
    const readme = readFileSync(join(repoRoot, 'packages/kit/README.md'), 'utf8')
    expect(readme).toContain(EXPANDED_MARKER)
    expect(readme).toContain('折叠切 rail 的时机跟着宿主')
  })

  it('门控用的宿主标记是文档化的那一个（换名字要先去宿主 README 找依据）', () => {
    expect(EXPANDED_MARKER).toBe('data-sidebar-scrollport')
    expect(COLLAPSED_ATTR).toBe('[data-sidebar-collapsed]')
    expect(RAIL_GATE).toBe(':not([data-sidebar-scrollport] *)')
  })
})
