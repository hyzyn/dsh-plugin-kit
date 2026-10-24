#!/usr/bin/env node
/**
 * 防回归：有 `README.en.md` 的包，中英两版的**章节结构必须一致**。
 *
 * ## 为什么有这一份
 *
 * [docs/conventions.md](../docs/conventions.md) § 文档分档 纪律 2 写着「中英同结构
 * （不要求逐字对应）」，但此前**没有任何守卫读它**：
 *   · `scripts/check-i18n.mjs` 管的是**客户端目录**的键集，不读 README；
 *   · `scripts/check-readme-facts.mjs` 明确写了「不查散文语气、章节顺序」；
 *   · `scripts/docs-index.mjs` 只报 README 行数与档位，而且明说「只报告、不判红」。
 * 于是真正会漂的形状无人拦：中文版加了一节、英文版没加（或反过来），英文读者
 * 找不到那一节——这不会让任何一道闸门红。loglens 建包那轮清出的 20 处过期陈述
 * 与本轮的 i18n 对账都说明：**文档漂移是系统性的，不是某个人偷懒**。
 *
 * ## 判据（三条）
 *
 * 1. **层级序列逐项相等**：每对 `packages/<pkg>/README.md` + `README.en.md`，把标题
 *    （ATX `#` ~ `######`）按出现顺序抽成层级序列，两版必须逐项相同。同一层级多了 /
 *    少了 / 换序都报。**只比层级、不比文字**——翻译本来就不逐字对应，比文字只会误报。
 * 2. **围栏内不算标题**：``` / ~~~ 代码块里的 `# 注释` 不是标题；4 空格缩进的行也不是
 *    （那是缩进代码块）。判据只认行首 ≤3 空格的 ATX 标题，HTML 注释里的 `#` 也不算。
 * 3. **命中不是 0**：一对双语 README 都没扫到、或所有对加起来一个标题都没有时报警
 *    ——「命中 0 个文件、恒绿」的闸门本仓真实发生过，比没有更坏。
 *
 * ## 刻意不做
 *
 * · **不比标题文字**：没有翻译映射，硬比只会误报（「包索引」对「Packages」是正常的）。
 * · **不比行数 / 段落 / 表格**：那是内容不是结构；复杂档本来就不设行数上界。
 * · **不查「该有英文版而没有」**：那是 conventions § 文档分档 纪律 2 登记着的债；
 *   把它做成红线等于让一道已知的债永远红着（清单以那一节为准，这里不抄第二份）。
 * · **不管仓根 `README` 那对**：规矩原文只约束「包」，仓根不在其内（当前两版一致；
 *   要纳入得先改 conventions 的规矩，再改本文件取「对」的地方）。
 *
 * ## 只读
 *
 * 本模块不写文件、不调 git、不联网：输入是 README 文本，所以单测可以喂 fixture
 * 造反例，不必修改任何受版本控制的文件。
 *
 * 用法（人工核对用；CI 侧由 `scripts/test/check-readme-structure.test.ts` 调 `checkRepo()`）：
 *   node scripts/check-readme-structure.mjs
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 包目录、两版 README 的文件名（判据只认这两个名字）。 */
export const PACKAGES_DIR = 'packages'
export const README_FILE = 'README.md'
export const README_EN_FILE = 'README.en.md'

/** 行尾归一：Windows 检出（或 `core.autocrlf`）会给 CRLF，不归一的话标题解析会假红。 */
function normalize(text) {
  return text.replace(/\r\n/g, '\n')
}

/**
 * 把 HTML 注释替换成等长空格（**保留换行**）。
 *
 * 注释里的 `#` 不是标题；换成等长空白而不是删掉，是为了不改变后面的行号——
 * 报差异时行号要还能对得上文件。
 */
function blankHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, (match) => match.replace(/[^\n]/g, ' '))
}

/**
 * 拆出「不在围栏代码块里」的行（保留 1-based 行号）。
 *
 * 围栏按 CommonMark 的常用形态认：行首 ≤3 空格的 ``` 或 ~~~（≥3 个），闭合围栏
 * 必须是同一种字符且不短于开启围栏；围栏里的内容（包括 `# 注释`）一律不是标题。
 */
export function linesOutsideFences(text) {
  const lines = normalize(text).split('\n')
  const out = []
  let fence = null
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(line)
    if (fenceMatch !== null) {
      const marker = fenceMatch[1]
      if (fence === null) fence = { char: marker[0], length: marker.length }
      else if (marker[0] === fence.char && marker.length >= fence.length) fence = null
      continue
    }
    if (fence !== null) continue
    out.push({ lineNumber: index + 1, text: line })
  }
  return out
}

/**
 * 抽出 ATX 标题（围栏与 HTML 注释之外），按出现顺序返回 `{ level, text, lineNumber }`。
 *
 * 闭合式 ATX（`## 标题 ##`）的尾部井号不属于标题文字，剥掉——两版写法不同不该判成漂。
 */
export function extractHeadings(text) {
  const headings = []
  const source = blankHtmlComments(normalize(text))
  for (const { lineNumber, text: line } of linesOutsideFences(source)) {
    const match = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/.exec(line)
    if (match === null) continue
    headings.push({
      level: match[1].length,
      text: (match[2] ?? '').replace(/[ \t]+#+[ \t]*$/, ''),
      lineNumber,
    })
  }
  return headings
}

/** 把层级序列渲染成可读的分布，例：`##×6 / ###×4`。 */
function levelHistogram(headings) {
  const counts = new Map()
  for (const heading of headings) counts.set(heading.level, (counts.get(heading.level) ?? 0) + 1)
  return [...counts.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([level, count]) => `${'#'.repeat(level)}×${String(count)}`)
    .join(' / ')
}

/**
 * 比较一对双语 README 的标题层级序列。
 *
 * @param pair - `{ pkg, zhPath, enPath, zhHeadings, enHeadings }`（标题由 `extractHeadings` 抽）。
 * @returns 差异数组；空数组 = 结构一致。**一对最多报一条**：首个差异定位到「第几个标题」，
 *   后面再多的差异都只是它的后果，逐条报会把一次漂移刷成几十行。
 */
export function compareHeadings(pair) {
  const { pkg, zhPath, enPath, zhHeadings, enHeadings } = pair
  const zhLevels = zhHeadings.map((heading) => heading.level)
  const enLevels = enHeadings.map((heading) => heading.level)
  const sameLength = zhLevels.length === enLevels.length
  if (sameLength && zhLevels.every((level, index) => level === enLevels[index])) return []

  const first = zhLevels.findIndex((level, index) => level !== enLevels[index])
  const index = first === -1 ? Math.min(zhLevels.length, enLevels.length) : first
  const describe = (levels) => (index < levels.length ? '#'.repeat(levels[index]) : '（没有这个标题）')
  return [
    {
      kind: 'readme.structure.mismatch',
      message:
        `${pkg}：中英 README 的章节结构不一致（${zhPath} ${String(zhLevels.length)} 个标题 ` +
        `[${levelHistogram(zhHeadings)}]，${enPath} ${String(enLevels.length)} 个 ` +
        `[${levelHistogram(enHeadings)}]）——首个差异在第 ${String(index + 1)} 个标题：` +
        `zh 是 ${describe(zhLevels)}，en 是 ${describe(enLevels)}。` +
        `改结构时两版要一起改（只比层级、不比文字）。`,
    },
  ]
}

/** 判决一组（已抽好标题的）双语对；单独导出是为了让用例能喂 0 对 / 0 标题的反例。 */
export function checkPairs(pairs) {
  if (pairs.length === 0) {
    return [
      {
        kind: 'readme.structure.no-pairs',
        message:
          '一对双语 README 都没扫到（`packages/<pkg>/README.md` + `README.en.md`）——' +
          '闸门会恒绿，比没有更坏。',
      },
    ]
  }
  const diffs = []
  let headingCount = 0
  for (const pair of pairs) {
    headingCount += pair.zhHeadings.length + pair.enHeadings.length
    diffs.push(...compareHeadings(pair))
  }
  if (headingCount === 0) {
    diffs.push({
      kind: 'readme.structure.no-headings',
      message: '扫到 0 个标题——解析面可能失效（标题必须是行首 ≤3 个 `#`，且不在代码围栏里）。',
    })
  }
  return diffs
}

/** 列出「同时有中英两版 README」的包名（有 `package.json` 才算包）。 */
export function bilingualPackages(root = REPO_ROOT) {
  const base = join(root, PACKAGES_DIR)
  if (!existsSync(base)) return []
  return readdirSync(base)
    .filter((name) => {
      const dir = join(base, name)
      return (
        existsSync(join(dir, 'package.json')) &&
        existsSync(join(dir, README_FILE)) &&
        existsSync(join(dir, README_EN_FILE))
      )
    })
    .sort()
}

/** 读出每对双语 README 的标题（供判据与用例共用；只读）。 */
export function readReadmePairs(root = REPO_ROOT) {
  return bilingualPackages(root).map((pkg) => {
    const zhPath = `${PACKAGES_DIR}/${pkg}/${README_FILE}`
    const enPath = `${PACKAGES_DIR}/${pkg}/${README_EN_FILE}`
    return {
      pkg,
      zhPath,
      enPath,
      zhHeadings: extractHeadings(readFileSync(join(root, zhPath), 'utf8')),
      enHeadings: extractHeadings(readFileSync(join(root, enPath), 'utf8')),
    }
  })
}

/** 对真实仓库跑一遍判据（返回差异数组；空数组 = 绿）。 */
export function checkRepo(root = REPO_ROOT) {
  return checkPairs(readReadmePairs(root))
}

/* CLI（人工核对用；测试走 checkRepo / compareHeadings） */
if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  const diffs = checkRepo()
  if (diffs.length > 0) {
    console.error('[check-readme-structure] 中英 README 的章节结构漂了：')
    for (const diff of diffs) console.error(`  ✘ ${diff.kind}  ${diff.message}`)
    console.error('')
    console.error('规矩见 docs/conventions.md § 文档分档 纪律 2（中英同结构，不要求逐字对应）。')
    process.exit(1)
  }
  const packages = bilingualPackages()
  console.log(
    `[check-readme-structure] 通过：${String(packages.length)} 对双语 README 的标题层级序列一致` +
      `（${packages.join(' / ')}）`,
  )
}
