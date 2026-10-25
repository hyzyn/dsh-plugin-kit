/**
 * `pnpm disclosure-report`（[scripts/disclosure-report.mjs](../disclosure-report.mjs)）的用例。
 *
 * 只测**汇总与格式化的纯函数**——CLI 只负责「拼装 + 打印 + 退出码」，逻辑留在 CLI 里就等于
 * 没有测试入口（`vitest.config.ts` 文件头记的同类教训）。真机部分（对宿主发 GET、`import()`
 * 各包 `lib/` 的分类表）要环境，归 `pnpm disclosure-report` 手动跑的口径，这里不覆盖。
 *
 * 钉住三件「报告会说谎」的形状：
 *
 *   1. **逐条带上名字与字符数**：少一行就等于少一条披露面（与公告守卫的「命中不是 0」同一思路）；
 *   2. **合计等于逐条之和**：合计是几张表的对账口径，手抄或累加错了就整份报告失真；
 *   3. **超预算必须打 ✘ 并在结尾汇总**：否则「真的没超」与「没量出来」在输出上分不清。
 *
 * 另有一条**源码级**断言：报告不许落盘（`scripts/` 下这两个模块里没有任何落盘调用）。
 * 这不是风格偏好——`pnpm disclosure-report` 会在真仓里被随手跑，一次「顺手生成个文件」
 * 就把它从只读报告变成了有副作用的工具。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  buildReport,
  formatAnnouncementTable,
  formatConclusion,
  formatMcpSection,
  formatReport,
  formatTierSection,
  summarizeAnnouncements,
  summarizeConclusion,
  summarizeTierClasses,
} from '../disclosure-report.mjs'
import { summarizeServers } from '../mcp-tool-budget.mjs'

/** 两条公告的最小 fixture：一条有余量、一条超预算（判据就是 250）。 */
const FIXTURE = [
  { name: 'A_GUIDANCE', pkg: 'a', file: 'packages/a/src/index.ts', line: 1, length: 200 },
  { name: 'B_GUIDANCE', pkg: 'b', file: 'packages/b/src/index.ts', line: 3, length: 260 },
]

const fixtureSummary = summarizeAnnouncements(FIXTURE, ['A_GUIDANCE', 'B_GUIDANCE'])

/** 三张分类表的最小 fixture（`loglens` 那条故意带 `from: tools.js`，对齐真实的取表位置）。 */
const fixtureTiers = summarizeTierClasses([
  {
    pkg: 'docker',
    constant: 'DOCKER_TIER_CLASS',
    classes: { a: 'read', b: 'read', c: 'write', d: 'exec' },
  },
  {
    pkg: 'loglens',
    constant: 'LOGLENS_TIER_CLASS',
    from: 'packages/loglens/lib/tools.js',
    classes: { e: 'read' },
  },
])

describe('第一节 · 公告长度表', () => {
  it('逐条带上名字与字符数，合计等于逐条之和', () => {
    const lines = formatAnnouncementTable(fixtureSummary)
    const text = lines.join('\n')
    for (const row of FIXTURE) {
      expect(text, `表格少了 ${row.name}`).toContain(row.name)
      expect(text, `表格里没有 ${row.name} 的字符数`).toContain(String(row.length))
    }
    // 合计是「实测的逐条之和」，不是手抄的常数
    expect(fixtureSummary.total).toBe(200 + 260)
    const totalLine = lines.find((line) => line.startsWith('合计'))
    expect(totalLine, '末行必须是合计').toBeDefined()
    expect(totalLine).toContain(String(fixtureSummary.total))
    expect(totalLine).toContain('实测 2 段')
  })

  it('超预算的条目打 ✘ 并在结尾汇总；没超的行不打', () => {
    const lines = formatAnnouncementTable(fixtureSummary)
    const overLine = lines.find((line) => line.includes('B_GUIDANCE'))
    const okLine = lines.find((line) => line.includes('A_GUIDANCE'))
    expect(overLine, '超预算的行不见了').toBeDefined()
    expect(okLine, '正常行不见了').toBeDefined()
    expect(overLine).toMatch(/^✘\s*B_GUIDANCE/u)
    expect(okLine).not.toContain('✘')
    expect(lines.join('\n')).toContain('1 段超预算')
  })

  it('弃权（?）与没抽到（—）都不进合计，且各自标出来', () => {
    const summary = summarizeAnnouncements(
      [
        { name: 'A_GUIDANCE', pkg: 'a', file: 'packages/a/src/index.ts', line: 1, length: 100 },
        { name: 'B_GUIDANCE', pkg: 'b', file: 'packages/b/src/index.ts', line: 2, length: null },
      ],
      ['A_GUIDANCE', 'B_GUIDANCE', 'C_GUIDANCE'],
    )
    expect(summary.total).toBe(100)
    expect(summary.measured).toBe(1)
    expect(summary.abstained).toBe(1)
    expect(summary.missing).toBe(1)
    const text = formatAnnouncementTable(summary).join('\n')
    expect(text).toContain('C_GUIDANCE')
    expect(text).toContain('? = 抽到了但右值不是')
    expect(text).toContain('— = 名单里有、源码里没抽到')
  })
})

describe('第二节 · MCP 工具面', () => {
  it('宿主不可达时只打 SKIP，不抛错（这是报告不是闸门）', () => {
    const text = formatMcpSection({ status: 'skip', url: 'http://127.0.0.1:1', reason: 'ECONNREFUSED' }).join('\n')
    expect(text).toContain('[SKIP]')
    expect(text).toContain('ECONNREFUSED')
    expect(text).toContain('不是闸门')
  })

  it('可达时复用 mcp-budget 的汇总口径（server / state / tools + 合计）', () => {
    const summary = summarizeServers([
      { serverName: 'alpha', transport: 'stdio', toolCount: 3 },
      { serverName: 'beta', transport: 'stdio', disabled: true, toolCount: 0 },
      { serverName: 'gamma', transport: 'streamable-http' },
    ])
    const text = formatMcpSection({ status: 'ok', url: 'http://127.0.0.1:1', summary }).join('\n')
    expect(text).toContain('alpha')
    expect(text).toContain('3 个工具')
    expect(text).toContain('另有 1 行没有 toolCount')
    expect(text).toContain('另有 1 行已停用')
  })
})

describe('第三节 · 档位分类表规模', () => {
  it('逐包统计 read / write / exec 与合计', () => {
    expect(fixtureTiers.read).toBe(3)
    expect(fixtureTiers.write).toBe(1)
    expect(fixtureTiers.exec).toBe(1)
    expect(fixtureTiers.total).toBe(5)
    const text = formatTierSection(fixtureTiers).join('\n')
    expect(text).toContain('DOCKER_TIER_CLASS')
    expect(text).toContain('LOGLENS_TIER_CLASS')
    expect(text.split('\n').some((line) => line.startsWith('合计'))).toBe(true)
  })

  it('写明这是「分类表规模」而不是真实注册面，并指出口径是 tier-smoke', () => {
    const text = formatTierSection(fixtureTiers).join('\n')
    expect(text).toContain('分类表规模')
    expect(text).toContain('不是各档真实注册面')
    expect(text).toContain('tier-smoke')
    expect(text).toContain('mcp__*')
  })

  it('取不到的表标成「读不到」，不当 0 算', () => {
    const summary = summarizeTierClasses([{ pkg: 'docker', constant: 'DOCKER_TIER_CLASS', error: '模块加载失败' }])
    expect(summary.total).toBe(0)
    expect(summary.readable).toBe(0)
    expect(formatTierSection(summary).join('\n')).toContain('读不到')
  })
})

describe('第四节 · 结论与 --json 契约', () => {
  it('一行结论带三个数，并列出三条相关入口', () => {
    const conclusion = summarizeConclusion({
      announcements: fixtureSummary,
      mcp: { status: 'skip', url: 'http://127.0.0.1:1', reason: 'ECONNREFUSED' },
      tiers: fixtureTiers,
    })
    expect(conclusion.announcementsOverBudget).toBe(1)
    expect(conclusion.mcpTools).toBeNull()
    expect(conclusion.tierEntries).toBe(5)
    const text = formatConclusion(conclusion).join('\n')
    expect(text).toContain('1 段超预算')
    expect(text).toContain('5 个条目')
    for (const entry of ['pnpm verify:list', 'tier-smoke', 'pnpm mcp-budget']) {
      expect(text, `结论里缺入口 ${entry}`).toContain(entry)
    }
  })

  it('--json 结构就是四个键（announcements / mcp / tiers / conclusion）', () => {
    const report = buildReport({
      announcements: fixtureSummary,
      mcp: { status: 'skip', url: 'http://127.0.0.1:1', reason: 'ECONNREFUSED' },
      tiers: fixtureTiers,
    })
    expect(Object.keys(report).sort()).toEqual(['announcements', 'conclusion', 'mcp', 'tiers'])
    // 序列化后仍是这四个键（机器契约，不是内存里的临时形状）
    const parsed = JSON.parse(JSON.stringify(report))
    expect(Object.keys(parsed).sort()).toEqual(['announcements', 'conclusion', 'mcp', 'tiers'])
    expect(parsed.announcements.total).toBe(fixtureSummary.total)
    expect(parsed.conclusion.next).toEqual([
      'pnpm verify:list',
      'pnpm --filter @hyzyn/dsh-kit run tier-smoke',
      'pnpm mcp-budget',
    ])
  })

  it('整份报告有四个小节标题（拼装别漏节）', () => {
    const text = formatReport(
      buildReport({
        announcements: fixtureSummary,
        mcp: { status: 'skip', url: 'http://127.0.0.1:1', reason: 'ECONNREFUSED' },
        tiers: fixtureTiers,
      }),
    ).join('\n')
    for (const heading of ['# 一、', '# 二、', '# 三、', '# 四、']) {
      expect(text, `缺小节 ${heading}`).toContain(heading)
    }
  })
})

describe('只读边界：报告与它的测量模块都不落盘', () => {
  const scriptsDir = fileURLToPath(new URL('..', import.meta.url))

  it('disclosure-report.mjs / announcement-budget.mjs 里没有任何落盘或建目录调用', () => {
    for (const name of ['disclosure-report.mjs', 'announcement-budget.mjs']) {
      const source = readFileSync(join(scriptsDir, name), 'utf8')
      expect(source, `${name} 不该有落盘调用`).not.toMatch(/writeFile/u)
      expect(source, `${name} 不该建目录`).not.toMatch(/mkdir/u)
    }
  })
})
