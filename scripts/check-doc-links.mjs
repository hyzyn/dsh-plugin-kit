#!/usr/bin/env node
/**
 * 文档链接与锚点闸门：全仓 markdown 的**相对链接**必须命中真实文件，**锚点**必须命中真实标题
 * （跨文件与同文件都查）。
 *
 * 为什么要有它：2026-09 的三层文档改造里，这类问题**真实发生过三次**，而三次都不是任何测试
 * 发现的——仓库里唯一的文档耦合测试是 `packages/codegraph/test/defects-ledger.test.ts`，
 * 它只读 codegraph 自己的 DEFECTS.md / README.md：
 *
 *   1. `README.md` 指向 `docs/troubleshooting.md#兼容性校验`，而那一节当时并不存在（死锚点，
 *      等于文档在说谎）；该节是后来补的；
 *   2. 把 DEFECTS.md 的「待办」整节迁进 `ROADMAP.md` 后，节内那句「见 [ROADMAP.md](./ROADMAP.md)」
 *      从跨文件引用变成了**自指链接**；
 *   3. `packages/codegraph/docs/p0-plan.md` 搬进 `docs/` 后，`../../scripts/verify-…mjs`
 *      少了一级目录，指向了不存在的位置。
 *
 * 判据刻意只做「能不能解析」，不做外链可达性（那要联网，不适合放进闸门）。
 *
 * 用法：`node scripts/check-doc-links.mjs`     # 有问题时退出码 1
 *
 * 已知边界（是取舍，不是 bug）：
 *   · 锚点 slug 是 **GitHub 的近似实现**（去掉 `*` / 反引号与标点、转小写、空格转 `-`）。
 *     它不处理 GitHub 给同名标题加的 `-1` / `-2` 后缀——本仓目前没有同名标题，真出现时
 *     这里会误报，届时应改进 slug 而不是放宽判据。
 *   · 不查外链、不查 `mailto:`、不查纯 `http(s)` 图片（仓库的截图都是 jsDelivr 绝对 URL，
 *     刻意不动）。
 *   · 白名单见 ALLOWED_BROKEN：**精确到 file + target**，不整文件豁免——同一个文件里
 *     **新增**的坏链接仍会被拦下。
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** 遍历时跳过的目录：产物、依赖、缓存、以及未跟踪的预览桩。 */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.preview', 'lib'])

/**
 * 已知的「从本仓解析必然落空、但在目标上下文里正确」的链接，**精确白名单**。
 *
 * 这 3 条属于 `docs/pr-body-dsh-market.md`——它是**提给 DSH 插件仓库市场那个仓库**的 PR
 * 正文副本，其相对链接相对的是**目标仓库**（`CONTRIBUTING.md` / `AGENTS.md` / `docs/plugins.md`
 * 都在那边，本仓一个都没有；全仓也没有目标仓库的 URL，所以无法改成绝对地址）。
 * 该文件顶部有一段 HTML 注释说明同一件事。要真正消除这 3 条，需要目标仓库的 URL。
 */
const ALLOWED_BROKEN = [
  { file: 'docs/pr-body-dsh-market.md', target: '../CONTRIBUTING.md', why: '目标市场仓库的贡献指南' },
  { file: 'docs/pr-body-dsh-market.md', target: '../AGENTS.md', why: '目标市场仓库的 agent 说明' },
  { file: 'docs/pr-body-dsh-market.md', target: '../docs/plugins.md', why: '目标市场仓库的登记说明' },
]
const allowed = new Set(ALLOWED_BROKEN.map((e) => `${e.file}\u0000${e.target}`))

/** GitHub 标题锚点的近似实现（见文件头「已知边界」）。 */
function slug(heading) {
  return heading
    .replace(/[*`]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .replace(/ /g, '-')
}

/** 收集全仓 markdown。 */
function collectMarkdown(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      collectMarkdown(join(dir, entry.name), out)
    } else if (entry.name.endsWith('.md')) {
      out.push(join(dir, entry.name))
    }
  }
  return out
}

const files = collectMarkdown(root)
/** 每个 markdown 的标题锚点集合，用于跨文件锚点校验。 */
const anchorsOf = new Map()
for (const file of files) {
  const headings = readFileSync(file, 'utf8').matchAll(/^#{1,6} (.+)$/gm)
  anchorsOf.set(file, new Set([...headings].map((m) => slug(m[1]))))
}

const brokenFiles = []
const badAnchors = []
const whitelisted = []
let linkCount = 0
let sameFileAnchors = 0

for (const file of files) {
  const relFile = relative(root, file).split(sep).join('/')
  const lines = readFileSync(file, 'utf8').split('\n')

  for (const [index, line] of lines.entries()) {
    const where = `${relFile}:${index + 1}`

    // ① 相对链接（可带跨文件锚点）：](target) 或 ](target#anchor)
    for (const m of line.matchAll(/\]\(([^)#\s]+)(?:#([^)]*))?\)/g)) {
      const target = m[1].replace(/^<|>$/g, '')
      if (/^(https?:|mailto:|data:)/i.test(target)) continue
      linkCount++
      const abs = resolve(dirname(file), target)
      if (!existsSync(abs)) {
        if (allowed.has(`${relFile}\u0000${m[1]}`)) {
          whitelisted.push(`${where} -> ${m[1]}`)
        } else {
          brokenFiles.push(`${where} -> ${m[1]}`)
        }
        continue
      }
      // ② 跨文件锚点
      if (m[2] && abs.endsWith('.md') && anchorsOf.has(abs)) {
        if (!anchorsOf.get(abs).has(m[2])) {
          badAnchors.push(`${where} -> ${m[1]}#${m[2]}`)
        }
      }
    }

    // ③ 同文件锚点：](#anchor)
    for (const m of line.matchAll(/\]\(#([^)]+)\)/g)) {
      sameFileAnchors++
      if (!anchorsOf.get(file).has(m[1])) {
        badAnchors.push(`${where} -> #${m[1]}`)
      }
    }
  }
}

if (brokenFiles.length > 0 || badAnchors.length > 0) {
  console.error('[check-doc-links] 文档链接闸门未通过：')
  for (const item of brokenFiles) console.error('  BROKEN FILE  ' + item)
  for (const item of badAnchors) console.error('  BAD ANCHOR   ' + item)
  console.error('')
  console.error('相对链接要命中真实文件；锚点要命中真实标题（改了小节标题就得同步所有指向它的链接）。')
  console.error('确属「相对的是别的仓库」的已知误报，加进 scripts/check-doc-links.mjs 的')
  console.error('ALLOWED_BROKEN（精确到 file + target，不要整文件豁免）。')
  process.exit(1)
}

console.log(
  `[check-doc-links] 通过：${String(linkCount)} 条相对链接、` +
    `${String(sameFileAnchors)} 条同文件锚点全部解析` +
    (whitelisted.length > 0 ? `（另有 ${String(whitelisted.length)} 条已知跨仓相对链接在白名单里）` : ''),
)
