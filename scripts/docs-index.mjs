/**
 * 文档路由守卫：`docs/*.md`（登记 + 命名）、L0 `ROADMAP.md`（✅ ↔ 落点）、**包内**
 * `packages/<pkg>/ROADMAP.md`（落地记录节必须排在 `## 已完成` 之后），以及
 * **workspace 包集合 ↔ `architecture.md § 2 包清单`**（判据 5）。
 *
 * ## 为什么有这一份
 *
 * `docs/` 当时是 11 份 markdown（本轮删掉归档的 v1 后为 10 份），而「这份文档归谁管、还作不作数」
 * 此前只靠 [docs/conventions.md](./conventions.md) 的知识归属表**手抄**——实测（2026-09-27）漏了两份：
 * `capability-elevation-plan.md`（v1，方案里那条「宿主终端确认码」通道**在代码里不存在**：
 * `packages/kit/src/grant-store.ts` 的 `CapabilityGrantVia` 只有一个值 `'file'`）与
 * `capability-elevation-plan.v2.md`。两份都写着「执行对象：AI 代理，按 PR 顺序执行」——
 * 也就是说，一份**描述不存在机制**的工单正躺在 L0 里等着被照着做，而没有任何东西会红。
 *
 * 同一轮还收了两条同类漂移：
 *
 *   1. **版本号住在文件名里**（`xxx.v2.md`）：同一主题由此可以有两份「活」文档，谁是最新
 *      只能靠人记住。规矩落到 [docs/conventions.md](./conventions.md) 的命名规范，这里负责拦；
 *   2. **`ROADMAP.md` 的 ✅ 与落点脱钩**：一个 ✅ 盖住四种状态（已落地 / 子项已落地 /
 *      某件事未做 / 三条边界刻意不修），而「已落地的落点在哪」要靠人翻；`§ 已完成` 的小节号
 *      还可以乱序（实测 1、2、4、3）。
 *
 * 2026-10-01 又收了一条**同一类**漂移（这次在 L1）：包内 `ROADMAP.md` 的文件头写着「本文只放
 * 还没做的事」，而落地记录（逐轮实测 / 落点 + 门槛 / 设计取舍）当时**没有归宿**——归属表里只有
 * 「包内待办」与「设计方案冻结记录」，都不接「工作记录」这一类，于是它们被顺手写在待办后面，
 * 一攒就是几百行（实测：tty 那份 591 行里约 545 行是落地记录，读者再也分不清哪条还没做）。
 * 归宿现定在包内 `## 已完成（落点 + 门槛）`（照 L0 同名节，见
 * [conventions § 知识归属表](./conventions.md#知识归属表唯一归宿)），本守卫守**位置**。
 *
 * 同一轮（2026-10-01，L0 待办第 7 条）还收了一条**没有守卫的规矩**：归属规范写着「任何档位的新包
 * 都要在 [architecture.md § 2 包清单](./architecture.md#2-包清单) 加一行」，现算 12/12 满足，
 * 但第 13 个包进来时**不会有人红**——判据 1–4 都管不到「workspace 包 ↔ 清单行」这一层。
 * 于是有了判据 5：两边都现算、多一个少一个都报。
 *
 * ## 每一类判据都不许「匹配失败就算过」
 *
 * 与 [defects-table.mjs](./defects-table.mjs) 同一套设计原则：**该有的东西找不到就报「缺失」**，
 * 而不是静默跳过；某类例外确实存在时，用**显式清单**声明（见 `VERSION_SUFFIX_ALLOWLIST`），
 * 不靠正则碰运气。
 *
 * ## 为什么不检查「README 的文档地图有没有列全」
 *
 * 地图是**读者视图**（按「你想知道什么」查），归属表才是**路由表**（每份文档归谁管）。
 * 把两者绑死会逼着给「已删除（冻结指针）」「对外投稿材料」这类条目再开一层白名单——
 * 那正是本轮想避免的东西。所以地图只保证「方案类文档有一行入口」，逐份登记交给本守卫。
 *
 * ## 只读
 *
 * 本模块不写文件、不调 git、不联网。输入是**文本**（`docs/` 的文件名清单 + conventions + ROADMAP，
 * 外加包内 `ROADMAP.md` 全文与 `packages/<pkg>/README*.md` 的行数），所以单测可以喂 fixture 造反例，而不必修改任何受版本控制的文件。
 *
 * ## 事实报告（**只报告，不判红**）
 *
 * 通过时额外打印各包 `README.md` / `README.en.md` 的**行数与档位**（判据见
 * [conventions § 文档分档](./conventions.md#文档分档)）。它是**事实报告**：复杂档没有行数上界
 * （`docs/conventions.md` § 文档分档 三条纪律第 1 条），所以这里**不许**拿任何数字去做判定
 * ——没有阈值、没有 ✘、不影响退出码；`--quiet` 一并抑制（CI 侧走单测，本来也不打印）。
 *
 * 用法（人工核对用；CI 侧由 `scripts/test/docs-index.test.ts` 调 `checkRepo()`）：
 *   node scripts/docs-index.mjs            # 事实报告 + 全部差异（有差异则退出 1）
 *   node scripts/docs-index.mjs --quiet    # 只打印差异
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
// 只借它的 YAML 解析能力读 `pnpm-workspace.yaml`（与 check-issue-forms.mjs 同一份依赖）。
import { parse as parseYaml } from 'yaml'
// 只借它的 `LEDGER_SPECS`（哪份台账是「转入台账」的权威声明）来判「有作为本包序列权威的 DEFECTS.md」。
import { LEDGER_SPECS } from './defects-table.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** `docs/`：被登记方（判据 1 / 判据 2 都只看这一层）。 */
export const DOCS_DIR = 'docs'
/** `docs/conventions.md`：知识归属表与命名规范都在这里。 */
export const CONVENTIONS_PATH = 'docs/conventions.md'
/** `ROADMAP.md`：✅ 与落点的成对关系。 */
export const ROADMAP_PATH = 'ROADMAP.md'
/** `packages/*`：事实报告扫这一层（判据 1–3 都不看它）。 */
export const PACKAGES_DIR = 'packages'

/**
 * § 文档分档 的行数判据，**照抄** `docs/conventions.md` § 文档分档 的表，不是新阈值：
 * 复杂 = README > 250 行 **或** 有作为本包序列权威的台账 **或** 包内 `docs/` ≥ 2 篇；
 * 中等 = 100–250 行；简单 = ≤ 100 行。**复杂档没有上界**——报告只摊开现算值，不做判定。
 */
const COMPLEX_ABOVE = 250
const MEDIUM_FROM = 100

/** 知识归属表的小节标题——**判据只认这一节里的引用**，别处的链接不算「登记」。 */
export const ATTRIBUTION_HEADING = '### 知识归属表（唯一归宿）'
/** `ROADMAP.md` 的两节：待办（含 ✅ 的历史原文）与已完成（落点 + 门槛）。 */
export const TODO_HEADING = '## 待办'
export const LANDED_HEADING = '## 已完成（落点 + 门槛）'
/** 包内路线图的文件名（判据 4 只扫 `packages/<pkg>/ROADMAP.md`，L0 那份不归它管）。 */
export const PACKAGE_ROADMAP_FILE = 'ROADMAP.md'
/** `pnpm-workspace.yaml`：判据 5 的**左边**（workspace 到底有哪些包，现算）。 */
export const WORKSPACE_PATH = 'pnpm-workspace.yaml'
/** `docs/architecture.md`：判据 5 的**右边**（包清单那张表的唯一归宿）。 */
export const ARCHITECTURE_PATH = 'docs/architecture.md'
/** 包清单节的标题——判据 5 只认这一节里的 README 链接。 */
export const PACKAGE_MANIFEST_HEADING = '## 2. 包清单'

/**
 * 包内 ROADMAP 的「已完成」锚点。
 *
 * 目标形态与 L0 同名（`## 已完成（落点 + 门槛）`），但 codegraph 那节叫
 * `## 已完成（0.4.2 之后的工作树）`（先于本判据存在）——所以**按前缀认**：这条判据管的是
 * 「落地记录排在那节**之后**」，不是逼各包统一标题（改名要维护者批准，见 conventions § 命名）。
 */
const PKG_LANDED_ANCHOR_RE = /^## 已完成/

/**
 * 落地记录节的两种标题形态（归宿见 docs/conventions.md 知识归属表的那一行）：
 *
 *   ① 带 ✅ 的标题——`### ✅ tty_run：一条命令一次调用`、`## P0：… ✅`；
 *   ② 日期批次标题——`## 2026-10-01：agent 单会话闭环（三件已做，未发版）`。
 *
 * **刻意只认标题**：待办条目里的内联 ✅（`- **agent 侧没有 tty_open** —— ✅ **已做（0.20.0）**`）
 * 是文件头承诺保留的历史原文，允许留在待办里；被抓的只有「一整节落地记录住错了地方」。
 */
const PKG_LANDED_HEADING_RES = [/^#{2,6} .*✅/, /^#{2,6} \d{4}-\d{2}-\d{2}[：:\s]/]

/**
 * 文件名带版本后缀的**显式例外**（当前为空：`capability-elevation-plan.v2.md` 已按命名规范改名成
 * `capability-elevation-plan.md`，例外随之过期——这条「例外必须是真的」由下面的
 * `doc.versioned.allowlist.stale` 当场报了出来）。
 *
 * **清单空了不等于机制可以拆**：它仍然是「确实需要保留一份带版本后缀的文件」的唯一合法出口
 * （加进来必须写明理由），而 `checkDocFilenames({ allowlist })` 可注入，单测因此仍能拿合成清单
 * 把「例外生效」与「例外过时」两条都钉住。
 */
export const VERSION_SUFFIX_ALLOWLIST = []

/** 版本后缀：`xxx.v2.md` 或 `xxx-v2.md`（`v0` 起都算）。 */
const DOT_VERSION_RE = /\.v[0-9]+\.md$/i
const DASH_VERSION_RE = /-v[0-9]+\.md$/i

/** ✅ + 「某事未做」的混态：`### 5. … ✅（一次性 token 未做，见下）` 这种标题拦下来。 */
const MIXED_MARKER_RE = /✅[^（(]*[（(][^）)]*未(?:做|落地|完成)/

/**
 * 取某个**整行标题**处起、到下一个同级或更高级标题止的正文。
 *
 * 用整行精确匹配（而不是宽松正则）：归属表的标题写错了就该报「缺失」，不该悄悄落到别的节上。
 */
export function sectionOf(text, heading) {
  const lines = text.split('\n')
  const start = lines.findIndex((line) => line.trim() === heading)
  if (start === -1) return undefined
  const level = (heading.match(/^#+/)?.[0] ?? '#').length
  const stop = new RegExp(`^#{1,${String(level)}} `)
  let end = lines.length
  for (let i = start + 1; i < lines.length; i += 1) {
    if (stop.test(lines[i])) {
      end = i
      break
    }
  }
  return lines.slice(start, end).join('\n')
}

/**
 * 归属表里引用到的 `docs/*.md` 文件名。
 *
 * 只认**同目录**的相对链接（`](./xxx.md)`，允许带同文件锚点 `./xxx.md#…`）：表里还有
 * `../README.md`、`../RELEASING.md`、`../packages/codegraph/docs/p0-plan.md`（L1 资产）与
 * `./community-submission.json`（投稿物），它们都不该被算成本层文档的登记项——所以按链接目标的
 * 形状取，而不是按关键词扫。
 */
export function parseAttributedDocs(conventions) {
  const table = sectionOf(conventions, ATTRIBUTION_HEADING)
  const names = new Set()
  if (table === undefined) return names
  // `.md` 之后允许 `#锚点`：`./conventions.md#真机脚本与-ci-接线` 也是一次登记
  for (const match of table.matchAll(/\]\(\.\/([A-Za-z0-9._-]+\.md)(?:#[^)]*)?\)/g)) names.add(match[1])
  return names
}

/**
 * 判据 1：`docs/*.md` 每一份都要被知识归属表登记。
 *
 * @param input - `{ docs, conventions }`；`docs` 是文件名清单（不含目录）。
 */
export function checkDocsRegistration({ docs, conventions }) {
  const diffs = []
  const table = sectionOf(conventions, ATTRIBUTION_HEADING)
  if (table === undefined || table.trim() === '') {
    diffs.push({
      kind: 'attribution.table.absent',
      message: `conventions 里找不到「${ATTRIBUTION_HEADING}」这一节：登记表没了，路由判据也就无从谈起（报缺失，不静默跳过）`,
    })
    return diffs
  }
  const registered = parseAttributedDocs(conventions)
  for (const file of docs) {
    if (registered.has(file)) continue
    diffs.push({
      kind: 'doc.unregistered',
      file,
      message: `docs/${file} 没有被知识归属表登记：去「${ATTRIBUTION_HEADING}」加一行指向它（已作废的文档也登记，写清「已作废（仅历史）」）`,
    })
  }
  return diffs
}

/**
 * 判据 2：文件名里不许住版本号。
 *
 * 同一主题只允许一份活文档；历史版本的去处是提交历史（`git show <sha>:<path>`）+
 * 该主题的台账 / 文档「冻结记录」指针。例外见 `VERSION_SUFFIX_ALLOWLIST`（当前为空，可注入）。
 *
 * @param input - `{ docs, allowlist? }`：`allowlist` 默认取模块常量，单测可传合成清单。
 */
export function checkDocFilenames({ docs, allowlist = VERSION_SUFFIX_ALLOWLIST }) {
  const diffs = []
  for (const file of docs) {
    if (!DOT_VERSION_RE.test(file) && !DASH_VERSION_RE.test(file)) continue
    if (allowlist.some((entry) => entry.file === file)) continue
    diffs.push({
      kind: 'doc.versioned',
      file,
      message: `docs/${file} 的文件名里带版本后缀（v2 / -v3 这类）：同一主题只允许一份活文档，历史版本进提交历史 + 台账「冻结记录」指针；确实需要保留就把它加进 VERSION_SUFFIX_ALLOWLIST 并写明理由`,
    })
  }
  for (const entry of allowlist) {
    if (docs.includes(entry.file)) continue
    diffs.push({
      kind: 'doc.versioned.allowlist.stale',
      file: entry.file,
      message: `例外清单里的 docs/${entry.file} 已经不在了：清理 VERSION_SUFFIX_ALLOWLIST（例外必须是真的）`,
    })
  }
  return diffs
}

/** 取一段正文里的 `### N. 标题`（`#### 5.1` 这类不会命中：`^### ` 后面必须是空格）。 */
export function parseNumberedItems(section) {
  const items = []
  for (const match of section.matchAll(/^### ([0-9]+)\.\s*(.*)$/gm)) {
    items.push({ n: Number(match[1]), title: match[2].trim() })
  }
  return items
}

/**
 * 判据 3：`ROADMAP.md` 的 ✅ 与落点成对、序号递增、✅ 不混态。
 *
 * 三条：
 *   a. **✅ ↔ 落点**：待办里带 ✅ 的 `### N.` 必须在 `§ 已完成` 有同号条目，**反之亦然**
 *      （抓「标了 ✅ 却没写落点」，也抓「写了落点却没人指向它」）；
 *   b. `§ 已完成` 的小节号必须**严格递增**（实测曾出现 1、2、4、3）；
 *   c. 一条标题里 ✅ 只允许出现一次，且**不许「✅（某事未做）」这种混态**——✅ 只表达整项落地，
 *      未做的部分要拆成不带 ✅ 的独立条目。
 *
 * @param input - `{ roadmap }`：`ROADMAP.md` 全文。
 */
export function checkRoadmapStatus({ roadmap }) {
  const diffs = []
  const todo = sectionOf(roadmap, TODO_HEADING)
  const landed = sectionOf(roadmap, LANDED_HEADING)
  if (todo === undefined) {
    diffs.push({ kind: 'roadmap.section.absent', message: `ROADMAP 里找不到「${TODO_HEADING}」这一节（报缺失，不静默跳过）` })
  }
  if (landed === undefined) {
    diffs.push({ kind: 'roadmap.section.absent', message: `ROADMAP 里找不到「${LANDED_HEADING}」这一节（报缺失，不静默跳过）` })
  }
  if (todo === undefined || landed === undefined) return diffs

  const todoItems = parseNumberedItems(todo)
  const landedItems = parseNumberedItems(landed)
  if (todoItems.length === 0) diffs.push({ kind: 'roadmap.items.absent', message: `${TODO_HEADING} 里一个 \`### N.\` 条目都没解析到` })
  if (landedItems.length === 0) diffs.push({ kind: 'roadmap.items.absent', message: `${LANDED_HEADING} 里一个 \`### N.\` 条目都没解析到` })

  const marked = new Set(todoItems.filter((item) => item.title.includes('✅')).map((item) => item.n))
  const recorded = new Set(landedItems.map((item) => item.n))

  // a. 双向成对
  for (const n of marked) {
    if (recorded.has(n)) continue
    diffs.push({
      kind: 'roadmap.landed.missing',
      n,
      message: `待办第 ${n} 项标了 ✅，但「${LANDED_HEADING}」里没有同号条目：标了 ✅ 就得写落点与门槛`,
    })
  }
  for (const n of recorded) {
    if (marked.has(n)) continue
    diffs.push({
      kind: 'roadmap.marker.missing',
      n,
      message: `「${LANDED_HEADING}」第 ${n} 项在待办里找不到带 ✅ 的同号条目：落点必须有一个已落地的条目指着它`,
    })
  }

  // b. 严格递增
  for (let i = 1; i < landedItems.length; i += 1) {
    const prev = landedItems[i - 1]
    const cur = landedItems[i]
    if (cur.n > prev.n) continue
    diffs.push({
      kind: 'roadmap.landed.order',
      n: cur.n,
      message: `「${LANDED_HEADING}」的小节号必须严格递增：第 ${prev.n} 项之后是第 ${cur.n} 项（追加新项时接在末尾，别插在中间）`,
    })
  }

  // c. 一个 ✅ + 不混态
  for (const item of [...todoItems, ...landedItems]) {
    const count = (item.title.match(/✅/g) ?? []).length
    if (count > 1) {
      diffs.push({
        kind: 'roadmap.marker.repeat',
        n: item.n,
        message: `第 ${item.n} 项的标题里 ✅ 出现了 ${count} 次：一个条目只用一个 ✅ 表达「整项落地」`,
      })
    }
    if (count > 0 && MIXED_MARKER_RE.test(item.title)) {
      diffs.push({
        kind: 'roadmap.marker.mixed',
        n: item.n,
        message: `第 ${item.n} 项的标题是「✅ + 某事未做」的混态（✅ 只表达整项落地）：把未做的部分拆成不带 ✅ 的独立条目`,
      })
    }
  }
  return diffs
}

/**
 * 解析一份包内 ROADMAP 里的「已完成」锚点与落地记录节。
 *
 * 导出给单测自证「命中不是 0」：一道只会在 0 命中时绿的闸门（本仓真实发生过）比没有还坏，
 * 所以「扫到了几处」本身也要能断言。
 *
 * @param roadmap - 包内 `ROADMAP.md` 全文。
 * @returns `{ anchorLine, landed }`：锚点行号（1 起，没有则 `undefined`）与落地记录节清单。
 */
export function parsePackageLandedSections(roadmap) {
  const lines = roadmap.split('\n')
  let anchorLine
  const landed = []
  lines.forEach((line, index) => {
    if (anchorLine === undefined && PKG_LANDED_ANCHOR_RE.test(line)) anchorLine = index + 1
    if (PKG_LANDED_HEADING_RES.some((re) => re.test(line))) landed.push({ line: index + 1, heading: line.trim() })
  })
  return { anchorLine, landed }
}

/**
 * 判据 4：**包内** `ROADMAP.md` 的落地记录节必须排在 `## 已完成（落点 + 门槛）` **之后**。
 *
 * 为什么需要它：包内 ROADMAP 的文件头写的是「本文只放**还没做的事**」，而落地记录（逐轮实测、
 * 落点 + 门槛、设计取舍）只有 DEFECTS 与 `docs/` 两处归宿、都不接「工作记录」这一类——
 * 于是它们被顺手写在待办后面，一攒就是几百行，读者再也分不清哪条还没做（2026-10-01 实测：
 * tty 那份 591 行里约 545 行是落地记录）。归宿定在 `## 已完成（落点 + 门槛）`（照 L0 同名节），
 * 这条判据守的就是**位置**：节本身可以只有标题 + 一段段记录，但记录不许再出现在它之前。
 *
 * 三条口径：
 *   a. **没有落地记录节的文件不受约束**（只有待办的包不必凭空造一节）；
 *   b. 有落地记录节却整份文件没有锚点 → 报缺失（不许散在待办里）；
 *   c. 锚点之前出现任何一处落地记录节 → 报位置（含锚点自己在最前、记录在后的半截搬迁）。
 *
 * @param input - `{ packageRoadmaps }`：`[{ pkg, path, text }]`（由 `readDocsInputs` 读，单测可传合成清单）。
 */
export function checkPackageRoadmapLanded({ packageRoadmaps }) {
  const diffs = []
  for (const file of packageRoadmaps) {
    const { anchorLine, landed } = parsePackageLandedSections(file.text)
    if (landed.length === 0) continue
    if (anchorLine === undefined) {
      diffs.push({
        kind: 'pkgRoadmap.landed.anchor.absent',
        pkg: file.pkg,
        message: `${file.path} 里有 ${String(landed.length)} 处落地记录节（第一处是第 ${String(landed[0].line)} 行「${landed[0].heading}」），但整份文件没有 \`${LANDED_HEADING}\` 节：落点要有明确归宿，不许散在待办里`,
      })
      continue
    }
    for (const item of landed) {
      if (item.line > anchorLine) continue
      diffs.push({
        kind: 'pkgRoadmap.landed.before',
        pkg: file.pkg,
        line: item.line,
        message: `${file.path} 第 ${String(item.line)} 行的落地记录节「${item.heading}」排在 \`${LANDED_HEADING}\`（第 ${String(anchorLine)} 行）之前：本文只放还没做的事，落地记录必须挪到那节之后`,
      })
    }
  }
  return diffs
}

/**
 * 判据 5：**workspace 包集合 ↔ `architecture.md § 2 包清单`** 一一对应。
 *
 * 为什么需要它：归属规矩写着「任何档位的新包都要在 [architecture.md § 2 包清单] 加一行」，
 * 而这条规矩此前**没有任何守卫**——第 13 个包进来时不会有人红（判据 1–4 都管不到
 * 「workspace 包 ↔ 清单行」这一层：判据 1 管的是 `docs/*.md` 的登记）。清单一旦漂，
 * 它就成了一份**历史**，而新人读到的第一份包关系图正是它。
 *
 * 两边都**现算**、不写死：左边从 `pnpm-workspace.yaml` 的通配解析出带 `package.json` 的目录，
 * 右边从那一节的 `<pkg>/README.md` 链接取包名——所以新包 / 删包都会在两侧各自现形。
 *
 * @param input - `{ workspacePackages, architecture }`（由 `readDocsInputs` 读；单测可传合成清单）。
 */
export function checkPackageManifest({ workspacePackages, architecture }) {
  const diffs = []
  const listed = parseManifestPackages(architecture)
  if (listed === undefined) {
    diffs.push({
      kind: 'manifest.section.absent',
      message: `architecture.md 里找不到「${PACKAGE_MANIFEST_HEADING}」这一节：包清单是这条判据的右边，报缺失、不静默跳过`,
    })
    return diffs
  }
  const inWorkspace = new Set(workspacePackages)
  for (const pkg of [...inWorkspace].sort()) {
    if (listed.has(pkg)) continue
    diffs.push({
      kind: 'manifest.missing',
      pkg,
      message: `packages/${pkg} 在 ${WORKSPACE_PATH} 里，但 architecture.md「${PACKAGE_MANIFEST_HEADING}」没有它的行：任何档位的新包都要在清单里加一行`,
    })
  }
  for (const pkg of [...listed].sort()) {
    if (inWorkspace.has(pkg)) continue
    diffs.push({
      kind: 'manifest.stale',
      pkg,
      message: `architecture.md「${PACKAGE_MANIFEST_HEADING}」给 packages/${pkg} 留了一行，但它已不在 ${WORKSPACE_PATH} 里：删包时清单要跟着删，否则清单成了历史`,
    })
  }
  return diffs
}

/**
 * 从 `architecture.md` 的包清单节取包名（= `../packages/<pkg>/README.md` 这类链接的目标）。
 *
 * 只认**这一节**里的链接：别处的 `../packages/...` 引用不算「登记」（与判据 1 认归属表同款口径）。
 * 节不在时返回 `undefined`（调用方据此**报缺失**，而不是当成空清单）。
 */
export function parseManifestPackages(architecture) {
  const section = sectionOf(architecture, PACKAGE_MANIFEST_HEADING)
  if (section === undefined) return undefined
  const names = new Set()
  for (const match of section.matchAll(/\]\(\.\.\/packages\/([A-Za-z0-9._-]+)\/README(?:\.en)?\.md(?:#[^)]*)?\)/g)) {
    names.add(match[1])
  }
  return names
}

/**
 * 从 `pnpm-workspace.yaml` 取通配清单（纯函数；`!` 开头的排除项按规矩不产出包）。
 *
 * 解析用真 YAML（`yaml` 包）：这条判据要的是**准**，而手写正则会在注释 / 引号 / 流式写法上
 * 悄悄错（错的方向恰好是「少数几个包」= 恒绿）。
 */
export function parseWorkspaceGlobs(workspaceText) {
  const doc = parseYaml(workspaceText)
  const entries = doc?.packages
  if (!Array.isArray(entries)) return []
  return entries
    .filter((entry) => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '' && !entry.startsWith('!'))
}

/**
 * 把通配解析成**包目录名**（判据 5 的左边）。
 *
 * 只支持本仓实际用的两种形态：`dir` 与 `dir/*`（单层通配）。出现别的形态就**抛错**——
 * 守卫宁可炸，也不许把一批包悄悄漏掉（漏 = 恒绿，本仓最忌讳的闸门形态）。
 */
function resolveWorkspacePackages(repoRoot) {
  const globs = parseWorkspaceGlobs(readFileSync(join(repoRoot, WORKSPACE_PATH), 'utf8'))
  const dirs = new Set()
  for (const glob of globs) {
    const star = glob.indexOf('*')
    if (star === -1) {
      if (existsSync(join(repoRoot, glob, 'package.json'))) dirs.add(basename(glob))
      continue
    }
    if (!glob.endsWith('/*') || glob.indexOf('*', star + 1) !== -1) {
      throw new Error(
        `[docs-index] ${WORKSPACE_PATH} 里的通配「${glob}」不在判据 5 支持的形态内（只支持 dir 与 dir/*）：` +
          '守卫宁可报错，也不许悄悄漏掉一批包',
      )
    }
    const base = glob.slice(0, -2)
    for (const name of readdirSync(join(repoRoot, base))) {
      if (existsSync(join(repoRoot, base, name, 'package.json'))) dirs.add(name)
    }
  }
  return [...dirs].sort()
}

/** 文件的行数（与 `wc -l` 同口径：数换行符；文件不在返回 `undefined`）。 */
function countLines(file) {
  if (!existsSync(file)) return undefined
  return readFileSync(file, 'utf8').split('\n').length - 1
}

/** 包内 `docs/*.md` 的篇数（目录不在 = 0）。 */
function countDocFiles(dir) {
  try {
    return readdirSync(dir).filter((name) => name.endsWith('.md')).length
  } catch {
    return 0
  }
}

/**
 * 事实报告：各包 `README.md` / `README.en.md` 的行数与档位。
 *
 * **只报告，不判红**：复杂档没有行数上界（§ 文档分档 三条纪律第 1 条），所以这里不设阈值、
 * 不产出差异、不影响退出码——`checkRepo()` 里没有它的位置，它只在 CLI 的非 `--quiet` 分支打印。
 *
 * 档位按 § 文档分档 的判据现算：「有作为本包序列权威的台账」用
 * [`LEDGER_SPECS`](./defects-table.mjs) 的 `mirror` 标志分流（`mirror: true` = 转入台账，
 * 按规矩**不计**）。
 *
 * @param repoRoot - 仓库根（默认本模块所在仓库）。
 * @returns 每包一条 `{ pkg, readmeLines, readmeEnLines, docsCount, tier, why }`。
 */
export function readReadmeFacts(repoRoot = REPO_ROOT) {
  const pkgRoot = join(repoRoot, PACKAGES_DIR)
  const authoritativeLedgers = new Set(
    LEDGER_SPECS.filter((spec) => !spec.mirror).map((spec) => spec.name),
  )
  return readdirSync(pkgRoot)
    .filter((pkg) => existsSync(join(pkgRoot, pkg, 'package.json')))
    .sort()
    .map((pkg) => {
      const readmeLines = countLines(join(pkgRoot, pkg, 'README.md'))
      const readmeEnLines = countLines(join(pkgRoot, pkg, 'README.en.md'))
      const docsCount = countDocFiles(join(pkgRoot, pkg, 'docs'))

      const complexReasons = []
      if (readmeLines !== undefined && readmeLines > COMPLEX_ABOVE) {
        complexReasons.push(`README > ${String(COMPLEX_ABOVE)} 行`)
      }
      if (authoritativeLedgers.has(pkg)) complexReasons.push('有权威 DEFECTS.md 台账')
      if (docsCount >= 2) complexReasons.push('包内 docs/ ≥ 2 篇')

      let tier = '复杂'
      let why = complexReasons
      if (complexReasons.length === 0 && readmeLines === undefined) {
        tier = '未定档'
        why = ['README.md 不在（判据无从算起）']
      } else if (complexReasons.length === 0 && readmeLines >= MEDIUM_FROM) {
        tier = '中等'
        why = [`README ${String(MEDIUM_FROM)}–${String(COMPLEX_ABOVE)} 行`]
      } else if (complexReasons.length === 0) {
        tier = '简单'
        why = [`README ≤ ${String(MEDIUM_FROM)} 行`]
      }
      return { pkg, readmeLines, readmeEnLines, docsCount, tier, why }
    })
}

/**
 * 把事实报告渲染成文本。**内容只有事实**：包名、行数、档位与判据来源——
 * 没有阈值判定、没有 ✘、没有「应改成…」。
 */
export function formatReadmeReport(facts) {
  const lines = [
    '[docs-index] README 事实报告（只报告，不判红；档位判据见 docs/conventions.md § 文档分档）：',
  ]
  for (const fact of facts) {
    const zh = fact.readmeLines === undefined ? 'README.md 不在' : `README.md ${String(fact.readmeLines)} 行`
    const en = fact.readmeEnLines === undefined ? 'README.en.md 不在' : `README.en.md ${String(fact.readmeEnLines)} 行`
    lines.push(
      `  ${fact.pkg.padEnd(12)} ${zh} / ${en} / 包内 docs/ ${String(fact.docsCount)} 篇 → ${fact.tier}（${fact.why.join('；')}）`,
    )
  }
  return lines.join('\n')
}

/** 读仓库里的输入（只读）：`docs/` 清单、conventions、L0 ROADMAP、包内 ROADMAP（判据 4），
 *  以及 workspace 包集合与 architecture（判据 5）。 */
export function readDocsInputs(repoRoot = REPO_ROOT) {
  const docs = readdirSync(join(repoRoot, DOCS_DIR))
    .filter((name) => name.endsWith('.md'))
    .sort()
  /*
   * 行尾归一：本守卫的判据与单测 fixture 都是**按行**写的（`\n## 待办\n` 这种字面替换最典型），
   * 而 Windows 检出（或 `core.autocrlf`）会给文件 CRLF——不归一的话，守卫在那种工作区里
   * 会因为「匹配不上」而假红（2026-09-27 CI 实测：docs-index 那条 fixture 就是这么红的）。
   * 仓库根另有 `.gitattributes`（`* text=auto eol=lf`）从检出侧堵住；这里是代码侧的第二道。
   */
  const readNormalized = (rel) => readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n')
  const pkgRoot = join(repoRoot, PACKAGES_DIR)
  const packageRoadmaps = readdirSync(pkgRoot)
    .filter((pkg) => existsSync(join(pkgRoot, pkg, PACKAGE_ROADMAP_FILE)))
    .sort()
    .map((pkg) => {
      const rel = `${PACKAGES_DIR}/${pkg}/${PACKAGE_ROADMAP_FILE}`
      return { pkg, path: rel, text: readNormalized(rel) }
    })
  return {
    docs,
    conventions: readNormalized(CONVENTIONS_PATH),
    roadmap: readNormalized(ROADMAP_PATH),
    packageRoadmaps,
    architecture: readNormalized(ARCHITECTURE_PATH),
    workspacePackages: resolveWorkspacePackages(repoRoot),
  }
}

/** 对真实仓库跑全部判据（返回差异数组；空数组 = 绿）。 */
export function checkRepo(repoRoot = REPO_ROOT) {
  const inputs = readDocsInputs(repoRoot)
  return [
    ...checkDocsRegistration(inputs),
    ...checkDocFilenames(inputs),
    ...checkRoadmapStatus(inputs),
    ...checkPackageRoadmapLanded(inputs),
    ...checkPackageManifest(inputs),
  ]
}

/* CLI（人工核对用；测试走 checkRepo / 各 check* 函数） */
if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  const quiet = process.argv.includes('--quiet')
  const inputs = readDocsInputs()
  const diffs = checkRepo()
  if (!quiet) {
    console.log(`[docs-index] docs/ 共 ${String(inputs.docs.length)} 份 markdown；已登记 ${String(parseAttributedDocs(inputs.conventions).size)} 份`)
    // 「扫到了几处」也要打印：只会在 0 命中时绿的闸门比没有还坏（本仓真实发生过）。
    const landedCount = inputs.packageRoadmaps.reduce(
      (sum, file) => sum + parsePackageLandedSections(file.text).landed.length,
      0,
    )
    console.log(`[docs-index] 包内 ROADMAP 共 ${String(inputs.packageRoadmaps.length)} 份；落地记录节 ${String(landedCount)} 处（判据 4 只管它们排在 \`## 已完成\` 之后）`)
    // 判据 5 的两边也打印出来：同样为了「命中不是 0」看得见。
    console.log(`[docs-index] workspace 包 ${String(inputs.workspacePackages.length)} 个；§ 2 包清单 ${String(parseManifestPackages(inputs.architecture)?.size ?? 0)} 行（判据 5 要求一一对应）`)
    // 事实报告（只报告，不判红）：`--quiet` 一并抑制，免得把 CI / 脚本输出搞脏。
    console.log(formatReadmeReport(readReadmeFacts()))
  }
  for (const diff of diffs) console.log(`  ✘ ${diff.kind}  ${diff.message}`)
  if (diffs.length === 0) console.log('[docs-index] 通过')
  process.exit(diffs.length === 0 ? 0 : 1)
}
