/**
 * 已发布产物里的**死链**守卫：**编译产物**不得含「仓内相对路径」链接。
 *
 * ## 为什么需要它（review C3，2026-10-07）
 *
 * `packages/kit` 的 `files` 只有 `["lib"]`——它发布的是**编译产物**。而 `src/*.ts` 的
 * 注释里写着 `[docs/os-consent-plan.md](../../../docs/os-consent-plan.md)` 这类**仓内相对
 * 链接**，`tsc` 会把注释原样搬进 `lib/*.d.ts` 与 `lib/*.js`。于是：
 *
 *   - 在本仓里点得开（相对路径按 `packages/kit/lib/` 往上三级正好到仓根）；
 *   - 一旦作为依赖装进 `node_modules/@hyzyn/dsh-kit/lib/`，`../../../docs/…` 指向的是
 *     **使用者项目的目录**，**必然落空**——而没有任何东西会红。
 *
 * **为什么现有闸门抓不到**：
 *   - `check-doc-links.mjs` 只扫文档、且把 `lib` 明确列在 `SKIP_DIRS` 里（它的判据是
 *     「仓内文档之间的链接」）；`artifacts:check` 只比「产物 vs 重新构建」；`package-contents`
 *     只查 `files` 里的路径在不在磁盘上。三者都不看**产物内容里的链接**。
 *
 * ## 范围：只查**编译产物**，不查 `README.md`（这条线要写清楚）
 *
 * 仓里 10 个包的 `files` 都发布 `README.md`，而它们的 `README.md` 普遍用
 * `../../docs/architecture.md` 这类链接——那是**跨包一致的既有约定**，且 npm / 各 registry
 * 会按 `package.json` 的 `repository` 字段把 README 的链接解析回上游仓库，所以它**不是死链**。
 * 本守卫因此只管 `lib/**` 与 `client.js`：那是**从源码注释机械搬过去**的文本，
 * 作者写它时想的是「仓内跳转」，而使用者那边根本没有仓。
 *
 * 这条线是刻意的：不区分的话，判据会一次性报出 10 个包的 README（全仓既有约定），
 * 变成一道「要么关掉、要么大改所有 README」的假警报。
 *
 * ## 判据
 *
 * 「markdown 链接语法（`](`）+ 路径里含 `../`」= 按**当前文件位置**解析 = 仓内跳转（违规）。
 * 绝对 URL 与**行内代码路径**（`` `docs/xxx.md` ``）不算——后者是有意的写法，
 * 本仓用它表达「这是仓内路径，随包发布后不保证可点」。
 *
 * ## 只读
 *
 * 纯读文件；不写、不调 git、不联网。反例在真实文本上做替换（不修改任何受版本控制的文件）。
 *
 * 反向禁止：守卫报红时改**源码注释**（把链接改成行内代码路径或绝对 URL），
 * 不要为了让守卫变绿去删判据、也不要把它扩到 README 上以求「更全」。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** 扫描时跳过的目录（依赖与缓存；**不跳 `lib`**——那正是本守卫要查的东西）。 */
const SKIP_DIRS = new Set(['node_modules', '.git', 'coverage', '.preview'])

/** 只扫这些扩展名（注释会进的产物形态 + 文档）。 */
const SCAN_EXT = ['.d.ts', '.js', '.mjs', '.cjs', '.ts', '.md']

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      walk(join(dir, entry.name), out)
      continue
    }
    if (SCAN_EXT.some((ext) => entry.name.endsWith(ext))) out.push(join(dir, entry.name))
  }
  return out
}

/**
 * 取一个包**会真正发布的编译产物**：只收 `lib/` 下的文件与根目录的 `client.js`。
 *
 * **刻意排除 `README*.md` / `cordis.patch.yml` / `scripts/`**：README 的相对链接是全仓既有
 * 约定（npm 按 `repository` 解析回上游），不是死链——判据范围的理由见文件头。
 */
function publishedArtifacts(packageDir: string): string[] {
  const manifestPath = join(packageDir, 'package.json')
  if (!existsSync(manifestPath)) return []
  let files: unknown
  try {
    files = (JSON.parse(readFileSync(manifestPath, 'utf8')) as { files?: unknown }).files
  } catch {
    return []
  }
  if (!Array.isArray(files)) return []
  const out: string[] = []
  for (const entry of files) {
    if (typeof entry !== 'string') continue
    const target = join(packageDir, entry)
    if (!existsSync(target)) continue
    if (statSync(target).isDirectory()) {
      // 只展开 lib（编译产物）；client-src / scripts 是源码或工具，不是本守卫的对象
      if (entry !== 'lib') continue
      for (const file of walk(target)) out.push(file)
      continue
    }
    // 根目录只有一个产物形态要管：client.js（多数包是源文件直接发布，一起查）
    if (entry === 'client.js') out.push(target)
  }
  return out
}

/** 找一处文本里的「仓内相对链接」；返回违规描述（空数组 = 干净）。 */
export function relativeLinkViolations(text: string, filePath: string, repoRoot: string): string[] {
  const out: string[] = []
  /*
   * markdown 链接语法 `](path)` 或 `](path "title")`，path 里含 `../` 即「按当前文件位置解析」
   * = 仓内跳转。
   *
   * N5（2026-10-07 review）：原判据是 `/\]\(([^)\s]+)\)/`——它**放过带标题的链接**
   * （`](x "../docs/a.md" "标题")` 里的空格让整个括号内容匹配不上）。今天全仓 0 命中，
   * 所以无实害，但判据有个洞：只要有人写出带标题的相对链接，它就静默漏掉。
   * 修法：先取括号内容，再按 markdown 的 title 语法切出**路径**那一段
   * （尖括号形式 `](<path> "title")` 解一层，裸路径取首个空白前的部分）。
   */
  for (const match of text.matchAll(/\]\(([^)]*)\)/g)) {
    const raw = match[1]
    const angle = /^<([^>]*)>/.exec(raw)
    const target = angle !== null ? angle[1] : (raw.split(/\s+/)[0] ?? '')
    if (!target.includes('../')) continue
    // 绝对 URL 不可能含 ../（真含了也是外部地址，不归本守卫管）
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue
    out.push(`${relative(repoRoot, filePath)} 里有仓内相对链接：](${raw})`)
  }
  return out
}

/** 全仓扫一遍：返回违规清单。 */
export function scanPublishedFiles(repoRoot: string): string[] {
  const packagesDir = join(repoRoot, 'packages')
  if (!existsSync(packagesDir)) return []
  const out: string[] = []
  for (const pkg of readdirSync(packagesDir)) {
    if (SKIP_DIRS.has(pkg)) continue
    const packageDir = join(packagesDir, pkg)
    if (!existsSync(join(packageDir, 'package.json'))) continue
    for (const file of publishedArtifacts(packageDir)) {
      let text: string
      try {
        text = readFileSync(file, 'utf8')
      } catch {
        continue
      }
      out.push(...relativeLinkViolations(text, file, repoRoot))
    }
  }
  return out
}

describe('已发布产物里不得含仓内相对链接（C3）', () => {
  it('真实仓库通过', () => {
    expect(scanPublishedFiles(REPO)).toEqual([])
  })

  it('判据真的扫到了东西（不是恒绿的空转）', () => {
    // 至少扫到 kit 的产物（它是当前唯一有 d.ts 注释链接的包），且数量可观
    const kitFiles = publishedArtifacts(join(REPO, 'packages', 'kit'))
    expect(kitFiles.length, 'kit 的发布清单一个文件都没展开——判据无从谈起').toBeGreaterThan(5)
    expect(
      kitFiles.some((file) => file.endsWith('.d.ts')),
      'kit 的发布清单里没有 .d.ts——注释进不了产物，那本守卫就失去意义',
    ).toBe(true)
  })
})

describe('死链守卫：反例（必须红）', () => {
  it('把行内代码路径改回 markdown 相对链接 → 红', () => {
    const file = join(REPO, 'packages', 'kit', 'lib', 'capability.d.ts')
    const text = readFileSync(file, 'utf8')
    // 真实产物里现在写的是 `docs/os-consent-plan.md`（行内代码，不解析成链接）
    const mutated = text.replace('`docs/os-consent-plan.md`', '[docs/os-consent-plan.md](../../../docs/os-consent-plan.md)')
    expect(mutated, '反例没生效：产物里找不到那个行内代码路径').not.toBe(text)
    const violations = relativeLinkViolations(mutated, file, REPO)
    expect(violations.length, '仓内相对链接必须被抓住').toBeGreaterThan(0)
    expect(violations.join('\n')).toMatch(/capability\.d\.ts/)
  })

  it('绝对 URL 不算违规（守卫不能误伤正常的对外引用）', () => {
    expect(relativeLinkViolations('[x](https://example.com/a/b.md)', 'x.md', REPO)).toEqual([])
  })

  it('不含 ../ 的同目录链接不算违规', () => {
    expect(relativeLinkViolations('[x](./other.md)', 'x.md', REPO)).toEqual([])
  })

  /*
   * N5（2026-10-07 review）：原正则 `/\]\(([^)\s]+)\)/` **放过带标题的链接**——
   * `](path "title")` 里的空格让整个括号内容匹配不上。今天全仓 0 命中所以无实害，
   * 但判据有个洞，这里把三种语法都钉住。
   */
  it('带标题的链接也要抓住（N5：原判据在这里漏检）', () => {
    for (const text of [
      '[x](../docs/a.md "标题")',
      "[x](../docs/a.md '标题')",
      '[x](<../docs/a.md> "标题")',
    ]) {
      const violations = relativeLinkViolations(text, 'x.md', REPO)
      expect(violations.length, `带标题的相对链接漏检了：${text}`).toBeGreaterThan(0)
    }
  })

  it('带标题的**绝对 URL / 同目录**链接仍不算违规（修完不能误伤）', () => {
    expect(relativeLinkViolations('[x](https://a.example/b.md "标题")', 'x.md', REPO)).toEqual([])
    expect(relativeLinkViolations('[x](./a.md "标题")', 'x.md', REPO)).toEqual([])
  })
})
