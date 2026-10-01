/**
 * 文档路由守卫的用例 —— `scripts/docs-index.mjs`。
 *
 * ## 这份用例守两件事
 *
 * 1. **真实仓库必须绿**（`docs/` 每一份都被知识归属表登记 + 文件名里没有版本后缀 +
 *    `ROADMAP.md` 的 ✅ 与落点成对、`§ 已完成` 序号递增、✅ 不混态 + **包内** `ROADMAP.md` 的
 *    落地记录节都排在 `## 已完成` 之后 + **workspace 包集合与 `architecture.md § 2` 包清单一一对应**）；
 * 2. **守卫必须会红**——本仓刚发生过一道「命中 0 个文件、恒绿、拦不住任何东西」的闸门，
 *    所以任何新守卫都要自证会红。反例**全部用 fixture 造**（在真实文本上做一次字符串替换，
 *    并断言替换真的生效），**不修改任何受版本控制的文件**；`docs` 清单类判据直接传合成清单。
 * 3. **事实报告只报告、不判红**——`README 事实报告`（行数 + 档位）不是闸门：它没有阈值、
 *    不产出差异、不影响退出码。它只加一条「报告存在且不含判定结论」的正向用例，
 *    **刻意不加反例**（给它造反例就等于承认它是一个判据，而复杂档本来就没有行数上界）。
 *
 * 反例里用的**就是本轮实际漂过的那几处**：两份方案文档没登记、`✅（一次性 token 未做）`
 * 的混态、`§ 已完成` 的 1/2/4/3 乱序——所以这组用例同时是「守卫能不能拦住这次漂移」的证明。
 * 反例 4 同理，用的是**这次真实失焦的那份文件**（tty/ROADMAP.md：591 行里约 545 行是落地记录，
 * 而文件头写着「本文只放还没做的事」）；它另外断言「扫到了几处」——只会在 0 命中时绿的闸门，
 * 本仓真实发生过一次，所以「命中不是 0」本身也要能被证伪。
 * 反例 5 是 L0 待办第 7 条那条**没有守卫的规矩**（新包要进 § 2 包清单）：两边都现算，
 * 所以「删一行」「加一行假包」「节被改名」三种漂法各钉一条。
 *
 * 反向禁止（与 `docs/conventions.md` 硬规矩一致）：守卫报红时只改文档侧；
 * 绝不为让它变绿去删文件、去改文件名（改名要维护者批准）。
 */
import { describe, expect, it } from 'vitest'
import {
  ATTRIBUTION_HEADING,
  LANDED_HEADING,
  VERSION_SUFFIX_ALLOWLIST,
  checkDocFilenames,
  checkDocsRegistration,
  checkPackageManifest,
  checkPackageRoadmapLanded,
  checkRoadmapStatus,
  checkRepo,
  formatReadmeReport,
  parseAttributedDocs,
  parseManifestPackages,
  parsePackageLandedSections,
  readDocsInputs,
  readReadmeFacts,
  sectionOf,
} from '../docs-index.mjs'

/** 真实仓库的三份输入（只读；反例都在它的副本上改）。 */
const real = readDocsInputs()

/** 在真实文本上做一次替换造 fixture；**替换没生效就抛**（否则反例会变成空测试）。 */
function mutate(text, from, to) {
  if (!text.includes(from)) throw new Error(`fixture 替换没匹配上：${from.slice(0, 60)}`)
  const mutated = text.replace(from, to)
  expect(mutated, 'fixture 必须真的改动文本').not.toBe(text)
  return mutated
}

/** 只把 `§ 已完成` 那一节换掉（两节里同号条目的标题一样，整段替换才不会打错地方）。 */
function withLanded(mutator) {
  const landed = sectionOf(real.roadmap, LANDED_HEADING)
  expect(landed, 'ROADMAP 应有 § 已完成 小节').toBeDefined()
  return real.roadmap.replace(landed, mutator(landed))
}

const kinds = (diffs) => diffs.map((diff) => diff.kind)

describe('docs-index：现算（唯一真值来源）', () => {
  it('真实仓库：11 份 markdown 全部被归属表登记', () => {
    expect(real.docs.length, 'docs/ 的 markdown 份数').toBe(11)
    const registered = parseAttributedDocs(real.conventions)
    expect(registered.size, '登记份数应等于 docs/ 的实际份数').toBe(real.docs.length)
    for (const file of real.docs) expect(registered.has(file), `${file} 应被登记`).toBe(true)
  })

  it('真实仓库：全部判据通过（守卫必须绿）', () => {
    const diffs = checkRepo()
    expect(diffs.map((diff) => diff.message).join('\n')).toBe('')
    expect(diffs).toEqual([])
  })

  it('真实仓库：workspace 包与 `architecture.md § 2` 包清单一一对应（命中不是 0）', () => {
    /*
     * 两边都**现算**（左边读 `pnpm-workspace.yaml` 的通配，右边读清单节里的 README 链接），
     * 所以这里先钉「两边都真的扫到了东西」——只会在 0 命中时绿的闸门，本仓真实发生过一次。
     */
    expect(real.workspacePackages.length, 'workspace 包数').toBeGreaterThanOrEqual(12)
    const listed = parseManifestPackages(real.architecture)
    expect(listed, '§ 2 包清单节应存在').toBeDefined()
    expect(listed?.size, '清单行数应等于 workspace 包数').toBe(real.workspacePackages.length)
    expect(real.workspacePackages, '两边应是同一批包名').toEqual([...(listed ?? [])].sort())
    expect(checkPackageManifest(real)).toEqual([])
  })

  it('方案文档登记在案：一份权威（就是这个文件名）、v1 只剩冻结指针', () => {
    const table = sectionOf(real.conventions, ATTRIBUTION_HEADING)
    expect(table).toContain('./capability-elevation-plan.md')
    // v1 已删除：归属表那一行不再指向文件，而是指向可检索的 sha
    expect(table).toContain('git show 79ca434e:docs/capability-elevation-plan.md')
    expect(table).toMatch(/能力开关「就地提权」方案的 v1（已删除，仅历史）/)
    expect(table, '旧名不该还留在归属表里').not.toContain('capability-elevation-plan.v2')
  })

  it('命名规矩还在，例外清单已清空（机制不许跟着拆）', () => {
    expect(VERSION_SUFFIX_ALLOWLIST.length, '改名后例外应当已被清掉').toBe(0)
    expect(real.conventions, '命名规范里要写「同一主题只允许一份活文档」').toMatch(/同一主题只允许一份活文档/)
  })

  it('CRLF 输入照样判对（Windows 检出 / core.autocrlf 不该让守卫假红）', () => {
    /*
     * 2026-09-27 CI 实测：windows-latest 上的 docs-index 套件报「fixture 替换没匹配上：
     * \n## 待办\n」——因为那边的工作区是 CRLF，而 fixture 是按 `\n` 写字面量的。
     * 两道防线：仓库根 `.gitattributes` 强制 LF（检出侧），`readDocsInputs` 再做一次归一（代码侧）。
     * 这条用例钉的是**判据本身对 CRLF 免疫**：直接把 CRLF 文本喂给两个 checker，必须全绿。
     */
    const crlf = (text) => text.replace(/\n/g, '\r\n')
    expect(checkDocsRegistration({ docs: real.docs, conventions: crlf(real.conventions) })).toEqual([])
    expect(checkRoadmapStatus({ roadmap: crlf(real.roadmap) })).toEqual([])
  })

  it('真实仓库：包内 ROADMAP 的落地记录节都排在「已完成」之后（命中不是 0）', () => {
    const tty = real.packageRoadmaps.find((file) => file.pkg === 'tty')
    expect(tty, 'packages/tty/ROADMAP.md 应在输入里').toBeDefined()
    const parsed = parsePackageLandedSections(tty.text)
    expect(parsed.anchorLine, 'tty/ROADMAP.md 应有 `## 已完成（落点 + 门槛）`').toBeGreaterThan(0)
    expect(parsed.landed.length, 'tty 的落地记录节（### ✅ / ## 日期）').toBeGreaterThan(0)
    for (const item of parsed.landed) expect(item.line, `「${item.heading}」应在锚点之后`).toBeGreaterThan(parsed.anchorLine)

    // 跨包命中：codegraph 的锚点叫 `## 已完成（0.4.2 之后的工作树）`（按前缀认），记录是 `### … ✅`
    const codegraph = real.packageRoadmaps.find((file) => file.pkg === 'codegraph')
    expect(parsePackageLandedSections(codegraph.text).landed.length, 'codegraph 也应被扫到').toBeGreaterThan(0)

    expect(checkPackageRoadmapLanded(real)).toEqual([])
  })

  it('README 事实报告存在，且不含判定结论（只报告、不判红，不是闸门）', () => {
    const facts = readReadmeFacts()
    const report = formatReadmeReport(facts)
    // 每个有 package.json 的包都摊开一行；docker 是长 README 的样本
    expect(facts.length).toBeGreaterThan(0)
    expect(facts.map((fact) => fact.pkg)).toContain('docker')
    for (const fact of facts) {
      expect(report, `${fact.pkg} 应出现在报告里`).toContain(fact.pkg)
      expect(['复杂', '中等', '简单', '未定档'], `${fact.pkg} 的档位`).toContain(fact.tier)
    }
    expect(report, '报告要给出真实行数').toMatch(/README\.md \d+ 行/)
    for (const verdict of ['✘', '失败', '不通过', '超标', '应裁', '不得超过']) {
      expect(report, `事实报告不许带判定结论：${verdict}`).not.toContain(verdict)
    }
  })
})

describe('反例 1：文档没被登记 → 必须报出来', () => {
  it('把方案文档那一行的链接目标改掉 → doc.unregistered（就是本轮真实漂过的那一份）', () => {
    const fixture = mutate(real.conventions, '](./capability-elevation-plan.md)', '](./capability-elevation-plan-vX.md)')
    const diffs = checkDocsRegistration({ docs: real.docs, conventions: fixture })
    expect(kinds(diffs)).toContain('doc.unregistered')
    const diff = diffs.find((item) => item.kind === 'doc.unregistered')
    expect(diff?.file).toBe('capability-elevation-plan.md')
    expect(diff?.message).toContain('没有被知识归属表登记')
  })

  it('新加一份文档却不登记 → 报的就是它', () => {
    const diffs = checkDocsRegistration({ docs: [...real.docs, 'brand-new-plan.md'], conventions: real.conventions })
    expect(diffs).toHaveLength(1)
    expect(diffs[0].file).toBe('brand-new-plan.md')
  })

  it('归属表整节被改名/删掉 → **报缺失**，不是静默跳过', () => {
    const fixture = mutate(real.conventions, ATTRIBUTION_HEADING, '### 知识归属（fixture 改名：表头不再命中）')
    const diffs = checkDocsRegistration({ docs: real.docs, conventions: fixture })
    expect(kinds(diffs)).toContain('attribution.table.absent')
    expect(diffs.find((item) => item.kind === 'attribution.table.absent')?.message).toContain('报缺失')
  })

  it('conventions 文本拿不到（空串）→ 同样报缺失', () => {
    expect(kinds(checkDocsRegistration({ docs: real.docs, conventions: '' }))).toContain('attribution.table.absent')
  })
})

describe('反例 2：版本号住进文件名 → 必须报出来', () => {
  it('`xxx-v3.md` / `xxx.v2.md` 两种写法都拦', () => {
    const diffs = checkDocFilenames({ docs: [...real.docs, 'some-plan-v3.md', 'other.plan.v2.md'] })
    expect(kinds(diffs).filter((kind) => kind === 'doc.versioned')).toHaveLength(2)
    expect(diffs.map((diff) => diff.file)).toEqual(['some-plan-v3.md', 'other.plan.v2.md'])
    expect(diffs[0].message).toContain('同一主题只允许一份活文档')
  })

  it('真实清单已清空：10 份文件名一个都不报', () => {
    expect(VERSION_SUFFIX_ALLOWLIST).toEqual([])
    expect(checkDocFilenames({ docs: real.docs })).toEqual([])
  })

  it('机制没跟着拆：注入一份合成例外 → 它不报、别的照报', () => {
    const allowlist = [{ file: 'kept-plan-v2.md', why: '合成例外：验证机制本身还在（真实清单当前为空）' }]
    const diffs = checkDocFilenames({ docs: [...real.docs, 'kept-plan-v2.md', 'other-plan-v2.md'], allowlist })
    expect(kinds(diffs)).toEqual(['doc.versioned'])
    expect(diffs[0].file).toBe('other-plan-v2.md')
  })

  it('例外清单过时（文件不在了）→ 要报——就是本轮改名后真实触发的那一条', () => {
    const stale = [{ file: 'capability-elevation-plan.v2.md', why: '改名前的例外（现已清理）' }]
    const diffs = checkDocFilenames({ docs: real.docs, allowlist: stale })
    expect(kinds(diffs)).toContain('doc.versioned.allowlist.stale')
    expect(diffs.find((item) => item.kind === 'doc.versioned.allowlist.stale')?.message).toContain('例外必须是真的')
  })

  it('普通文件名（含 `v` 但不成版本后缀）不许误报', () => {
    const diffs = checkDocFilenames({ docs: [...real.docs, 'proxyjump-plan.md', 'v2-threat-model.md', 'plan-v2-notes.md'] })
    expect(diffs).toEqual([])
  })
})

describe('反例 3：ROADMAP 的 ✅ 与落点脱钩 → 必须报出来', () => {
  it('✅ 却没有同号落点 → roadmap.landed.missing', () => {
    const roadmap = withLanded((landed) => mutate(landed, '### 5. ✅ 变更端点的信任模型：能力开关的宿主侧授权', ''))
    const diffs = checkRoadmapStatus({ roadmap })
    expect(kinds(diffs)).toContain('roadmap.landed.missing')
    expect(diffs.find((item) => item.kind === 'roadmap.landed.missing')?.n).toBe(5)
  })

  it('落点有、待办那条却没 ✅ → roadmap.marker.missing', () => {
    const roadmap = mutate(real.roadmap, '### 5. 变更端点的信任模型：能力开关的宿主侧授权 ✅', '### 5. 变更端点的信任模型：能力开关的宿主侧授权')
    expect(kinds(checkRoadmapStatus({ roadmap }))).toContain('roadmap.marker.missing')
  })

  it('§ 已完成 小节号乱序（1、2、4、3 的历史形态）→ roadmap.landed.order', () => {
    const roadmap = withLanded((landed) => mutate(landed, '### 3. ✅ 面板端 i18n', '### 2. ✅ 面板端 i18n'))
    const diffs = checkRoadmapStatus({ roadmap })
    expect(kinds(diffs)).toContain('roadmap.landed.order')
    expect(diffs.find((item) => item.kind === 'roadmap.landed.order')?.message).toContain('严格递增')
  })

  it('「✅（某事未做）」混态 → roadmap.marker.mixed', () => {
    const roadmap = mutate(
      real.roadmap,
      '### 5. 变更端点的信任模型：能力开关的宿主侧授权 ✅',
      '### 5. 变更端点的信任模型：能力开关的宿主侧授权 ✅（一次性 token 未做，见下）',
    )
    const diffs = checkRoadmapStatus({ roadmap })
    expect(kinds(diffs)).toContain('roadmap.marker.mixed')
    expect(diffs.find((item) => item.kind === 'roadmap.marker.mixed')?.message).toContain('混态')
  })

  it('一条标题里两个 ✅ → roadmap.marker.repeat', () => {
    const roadmap = mutate(
      real.roadmap,
      '### 5. 变更端点的信任模型：能力开关的宿主侧授权 ✅',
      '### 5. ✅ 变更端点的信任模型：能力开关的宿主侧授权 ✅',
    )
    expect(kinds(checkRoadmapStatus({ roadmap }))).toContain('roadmap.marker.repeat')
  })

  it('整节被改名/删掉 → **报缺失**（两节各报一次）', () => {
    /*
     * fixture 必须是**整行**替换：`## 待办` 这几个字在文件头的「怎么读」那句里也出现过
     * （`> **怎么读 \`## 待办\` 这一节**：…`），只替换这六个字符会改到那句话、而真正的标题还在
     * ——第一次写这条用例就是这么假绿的（守卫本身没问题，是 fixture 没生效）。
     */
    const noTodo = mutate(real.roadmap, '\n## 待办\n', '\n## 待办（fixture 改名）\n')
    expect(kinds(checkRoadmapStatus({ roadmap: noTodo }))).toContain('roadmap.section.absent')
    const noLanded = mutate(real.roadmap, '\n## 已完成（落点 + 门槛）\n', '\n## 已完成（fixture 改名）\n')
    expect(kinds(checkRoadmapStatus({ roadmap: noLanded }))).toContain('roadmap.section.absent')
  })

  it('非 ✅ 的条目不受成对判据影响（一次性 token / 已知限制这类「未做」条目就该不带 ✅）', () => {
    const diffs = checkRoadmapStatus({ roadmap: real.roadmap })
    expect(kinds(diffs)).not.toContain('roadmap.marker.missing')
  })
})

describe('反例 4：包内 ROADMAP 的落地记录节住错了地方 → 必须报出来', () => {
  /** 真实 tty 那份的副本（判据只看文本，所以复用它造 fixture）。 */
  const ttyText = () => real.packageRoadmaps.find((file) => file.pkg === 'tty').text
  const asPkg = (text) => ({ packageRoadmaps: [{ pkg: 'tty', path: 'packages/tty/ROADMAP.md', text }] })

  it('锚点整行消失（落地记录散在待办后面 = 修复前的形态）→ pkgRoadmap.landed.anchor.absent', () => {
    const fixture = mutate(ttyText(), '## 已完成（落点 + 门槛）\n\n', '')
    const diffs = checkPackageRoadmapLanded(asPkg(fixture))
    expect(kinds(diffs)).toContain('pkgRoadmap.landed.anchor.absent')
    const diff = diffs.find((item) => item.kind === 'pkgRoadmap.landed.anchor.absent')
    expect(diff?.pkg).toBe('tty')
    expect(diff?.message).toContain('没有')
    expect(diff?.message, '要报出扫到几处——0 命中的闸门比没有还坏').toMatch(/处落地记录节/)
  })

  it('锚点被挪到文件末尾（记录全在它之前）→ pkgRoadmap.landed.before 逐处报出', () => {
    const fixture = `${mutate(ttyText(), '## 已完成（落点 + 门槛）\n\n', '')}\n## 已完成（落点 + 门槛）\n`
    const diffs = checkPackageRoadmapLanded(asPkg(fixture))
    const before = diffs.filter((item) => item.kind === 'pkgRoadmap.landed.before')
    expect(before.length, '每一处错位的记录节都要报').toBeGreaterThan(1)
    expect(before[0].message).toContain('本文只放还没做的事')
    expect(before[0].line).toBeGreaterThan(0)
  })

  it('待办条目里的内联 ✅ 不是「节」，不许误报（历史原文要留着）', () => {
    const tty = ttyText()
    expect(tty, '待办第 2 条带着内联 ✅').toContain('✅ **已做（0.20.0）**')
    const inlineLine = tty.split('\n').findIndex((line) => line.includes('✅ **已做（0.20.0）**')) + 1
    expect(parsePackageLandedSections(tty).landed.map((item) => item.line)).not.toContain(inlineLine)
  })

  it('只有待办、一处记录都没有的文件（docker）不受这条约束：不许逼它凭空造一节', () => {
    const docker = real.packageRoadmaps.find((file) => file.pkg === 'docker')
    expect(parsePackageLandedSections(docker.text).landed).toEqual([])
    expect(checkPackageRoadmapLanded({ packageRoadmaps: [docker] })).toEqual([])
  })

  it('闸门对 CRLF 免疫（Windows 检出不该假红）', () => {
    const crlf = (text) => text.replace(/\n/g, '\r\n')
    const roadmaps = real.packageRoadmaps.map((file) => ({ ...file, text: crlf(file.text) }))
    expect(checkPackageRoadmapLanded({ packageRoadmaps: roadmaps })).toEqual([])
  })
})

describe('反例 5：workspace 包与包清单脱钩 → 必须报出来', () => {
  /** 按行删掉某一包在清单里的那一行（不硬编码行内容，换个包名照样能用）。 */
  const dropManifestRow = (pkg) => {
    const lines = real.architecture.split('\n')
    const index = lines.findIndex((line) => line.includes(`../packages/${pkg}/README.md`))
    expect(index, `§ 2 包清单里应有 packages/${pkg} 的行`).toBeGreaterThan(-1)
    const dropped = lines.filter((_, n) => n !== index).join('\n')
    expect(dropped, 'fixture 必须真的改动文本').not.toBe(real.architecture)
    return dropped
  }

  it('清单少一行（新包进了 workspace 却没登记）→ manifest.missing 点名它', () => {
    const diffs = checkPackageManifest({ workspacePackages: real.workspacePackages, architecture: dropManifestRow('docker') })
    expect(kinds(diffs)).toEqual(['manifest.missing'])
    expect(diffs[0].pkg).toBe('docker')
    expect(diffs[0].message).toContain('都要在清单里加一行')
  })

  it('清单多一行（包删了清单没删）→ manifest.stale 点名它', () => {
    const ghost = mutate(
      real.architecture,
      '| `@hyzyn/dsh-all` |',
      '| `@hyzyn/dsh-ghost` | 插件 | 已经删掉的包（fixture） | [README](../packages/ghost/README.md) |\n| `@hyzyn/dsh-all` |',
    )
    const diffs = checkPackageManifest({ workspacePackages: real.workspacePackages, architecture: ghost })
    expect(kinds(diffs)).toEqual(['manifest.stale'])
    expect(diffs[0].pkg).toBe('ghost')
    expect(diffs[0].message).toContain('清单成了历史')
  })

  it('清单节被改名/删掉 → **报缺失**，不是静默当成空清单', () => {
    const renamed = mutate(real.architecture, '## 2. 包清单', '## 2. 包清单（fixture 改名）')
    const diffs = checkPackageManifest({ workspacePackages: real.workspacePackages, architecture: renamed })
    expect(kinds(diffs)).toContain('manifest.section.absent')
    expect(diffs[0].message).toContain('报缺失')
  })

  it('别处的 `../packages/...` 链接不算登记（只认清单那一节）', () => {
    // 把整张表清空、但保留文档别处的包链接 → 仍必须报「少 12 行」，而不是被别处链接喂饱
    const tableGone = real.architecture.replace(/^\| `@hyzyn\/dsh-[a-z-]+` \|.*$/gm, '')
    const diffs = checkPackageManifest({ workspacePackages: real.workspacePackages, architecture: tableGone })
    expect(diffs.filter((diff) => diff.kind === 'manifest.missing').length).toBe(real.workspacePackages.length)
  })

  it('合成 workspace（少一个包）→ 按现算报 stale，不依赖真实目录', () => {
    const withoutDocker = real.workspacePackages.filter((pkg) => pkg !== 'docker')
    const diffs = checkPackageManifest({ workspacePackages: withoutDocker, architecture: real.architecture })
    expect(kinds(diffs)).toEqual(['manifest.stale'])
    expect(diffs[0].pkg).toBe('docker')
  })

  it('闸门对 CRLF 免疫（Windows 检出不该假红）', () => {
    const crlf = real.architecture.replace(/\n/g, '\r\n')
    expect(checkPackageManifest({ workspacePackages: real.workspacePackages, architecture: crlf })).toEqual([])
  })
})
