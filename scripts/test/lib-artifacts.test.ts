/**
 * 入库产物（`packages/<pkg>/lib/**`）与源码（`packages/<pkg>/src/**`）必须**双向**对得上。
 *
 * ## 为什么有这一份（2026-10-03 的由来）
 *
 * `tsc` **只写不删**：源码搬走或删掉之后，`outDir` 里那份旧产物会原样留着。实测那天：
 * `devdata` 的就绪判据随建包迁去了 `devenv`，而 `packages/devdata/lib/env-ready*.{js,map,d.ts}`
 * 六个文件留了下来，一路跟着提交入库。
 *
 * 这条缺口**没有任何现成闸门能发现**：
 *
 *   - `pre-commit` 与 CI 的产物闸门都是「重建后 `git diff` 干净」——**没人会重建一个已经没有源码的
 *     文件**，它也就不会出现在 diff 里；
 *   - 大家之所以以为产物这一面守住了，是因为反方向（源码改了没重建）确实会被那道闸门抓住。
 *     「守住了 A ⇒ 以为 B 也守住了」正是这条债活了两个月没红的原因。
 *
 * ## 判据（两条，方向相反）
 *
 * 1. **产物有源**：`lib/` 里每个 `.js` / `.js.map` / `.d.ts` 都要解析得出一份 `src/` 里的源文件
 *    （`lib/x.js` → `src/x.ts`；`lib/x.d.ts` → `src/x.ts` 或 `src/x.d.ts`）。命不中就报
 *    **陈旧产物**——它的存在证明这里**曾经**有过源码。
 * 2. **源有产物**：`src/**` 里除 `.d.ts` 外的每个文件都要有 `lib/<同名>.js` 与 `lib/<同名>.d.ts`。
 *    这条补的是产物闸门对**未跟踪新文件**的盲区：`git diff --exit-code` 不报 untracked，于是
 *    「提交了源码、忘了提交产物」在 CI 上是**绿**的（CI 里那次重建只会新造出未跟踪文件）。
 *    `.d.ts` 不参与：手写的环境声明（如 `src/js-yaml.d.ts`）`tsc` **不会**拷进 `outDir`，
 *    要求它有产物只会造成误报。
 *
 * 只判这三种扩展名：`lib/` 里其它文件（夹具、静态资源）不归这条判据管——证据是现算的
 * （2026-10-03：249 个 lib 文件全部落在这三种里），而不是「匹配不到就跳过」。
 *
 * ## 规矩的归宿
 *
 * [conventions.md § 提交](../docs/conventions.md#提交) 里「产物与源码必须双向对得上」那一条。
 *
 * ## 夹具自己建的临时资源自己删
 *
 * 反例都在 `mkdtempSync` 的临时树里造，`afterAll` 里删（纪律与实例见
 * [testing.md](../docs/testing.md) § 夹具自己建的临时资源，自己删）。
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))

/** 一个包的产物审计结果（路径都相对**包目录**，报错时再拼包名）。 */
export interface LibAudit {
  /** `lib/` 里找不到源码的旧产物。 */
  stale: { path: string; expected: string[] }[]
  /** `src/` 里有、`lib/` 里缺的产物。 */
  missing: { path: string; expected: string[] }[]
  /** 扫到的 `lib/` 文件数：用来断言「闸门真的扫到了东西」（恒绿的闸门比没有更坏）。 */
  scanned: number
}

/**
 * `lib/` 里的一份产物应当对应 `src/` 里的哪些文件（相对路径）。
 *
 * @returns 候选源文件清单；`undefined` = 这份产物不归本判据管（非 `.js` / `.js.map` / `.d.ts`）。
 */
export function expectedSourcesFor(libRel: string): string[] | undefined {
  if (libRel.endsWith('.js.map')) return [`${libRel.slice(0, -'.js.map'.length)}.ts`]
  // 声明文件两种来源：`tsc` 从 `x.ts` 生成的 `x.d.ts`，或手写的 `x.d.ts` 原样拷进去
  if (libRel.endsWith('.d.ts')) return [`${libRel.slice(0, -'.d.ts'.length)}.ts`, libRel]
  if (libRel.endsWith('.js')) return [`${libRel.slice(0, -'.js'.length)}.ts`]
  return undefined
}

/** 递归收集目录下的文件（相对 `dir`；同名排序，报错信息才可复现）。 */
function walk(dir: string): string[] {
  const out: string[] = []
  const visit = (current: string, prefix: string): void => {
    const entries = readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      if (entry.isDirectory()) visit(join(current, entry.name), rel)
      else out.push(rel)
    }
  }
  visit(dir, '')
  return out
}

/** 审计一个包的 `lib/` ↔ `src/`。 */
export function auditPackage(pkgDir: string): LibAudit {
  const libDir = join(pkgDir, 'lib')
  const srcDir = join(pkgDir, 'src')
  const libFiles = existsSync(libDir) ? walk(libDir) : []
  const srcFiles = existsSync(srcDir) ? walk(srcDir) : []
  const srcSet = new Set(srcFiles)
  const libSet = new Set(libFiles)

  const stale: LibAudit['stale'] = []
  for (const rel of libFiles) {
    const expected = expectedSourcesFor(rel)
    if (expected === undefined) continue
    if (expected.some((source) => srcSet.has(source))) continue
    stale.push({ path: `lib/${rel}`, expected: expected.map((source) => `src/${source}`) })
  }

  const missing: LibAudit['missing'] = []
  for (const rel of srcFiles) {
    // 手写的 `.d.ts` 不产出任何东西（`tsc` 不把它拷进 `outDir`），所以不参与这一向
    if (!rel.endsWith('.ts') || rel.endsWith('.d.ts')) continue
    const base = rel.slice(0, -'.ts'.length)
    const absent = [`${base}.js`, `${base}.d.ts`].filter((wanted) => !libSet.has(wanted))
    if (absent.length > 0) missing.push({ path: `src/${rel}`, expected: absent.map((wanted) => `lib/${wanted}`) })
  }

  return { stale, missing, scanned: libFiles.length }
}

/** 审计 `packages/*` 里所有带 `src/` 的包，路径拼成仓库相对形态。 */
export function auditWorkspace(packagesDir: string): { audit: LibAudit; pkgs: string[] } {
  const pkgs = existsSync(packagesDir)
    ? readdirSync(packagesDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && existsSync(join(packagesDir, entry.name, 'src')))
        .map((entry) => entry.name)
        .sort()
    : []

  const audit: LibAudit = { stale: [], missing: [], scanned: 0 }
  for (const pkg of pkgs) {
    const one = auditPackage(join(packagesDir, pkg))
    for (const item of one.stale) audit.stale.push({ ...item, path: `packages/${pkg}/${item.path}` })
    for (const item of one.missing) audit.missing.push({ ...item, path: `packages/${pkg}/${item.path}` })
    audit.scanned += one.scanned
  }
  return { audit, pkgs }
}

/** 把差异渲染成一句句可读的行（断言失败时直接看到缺哪一份）。 */
function render(items: LibAudit['stale']): string[] {
  return items.map((item) => `${item.path}（应有 ${item.expected.join(' 或 ')}）`)
}

/* --------------------------- 真实仓库 --------------------------- */

describe('真实仓库：产物与源码双向对得上', () => {
  const { audit, pkgs } = auditWorkspace(join(REPO_ROOT, 'packages'))

  it('扫到的包与产物都不是 0（恒绿闸门比没有更坏）', () => {
    expect(pkgs.length, '一个包都没扫到：packages/* 的结构变了？').toBeGreaterThan(10)
    expect(audit.scanned, '一份 lib 产物都没扫到：outDir 变了？').toBeGreaterThan(100)
  })

  it('没有陈旧产物（`lib/` 里每个文件都找得到源码）', () => {
    expect(render(audit.stale)).toEqual([])
  })

  it('没有缺失产物（`src/` 里除 `.d.ts` 外每个文件都有 `.js` + `.d.ts`）', () => {
    expect(render(audit.missing)).toEqual([])
  })
})

/* --------------------------- 反例 --------------------------- */

const FIXTURE_ROOT = mkdtempSync(join(tmpdir(), 'dsh-lib-artifacts-'))

afterAll(() => {
  // 自己建的临时资源自己删（见文件头）；`force` 让「已经不在」也不报错
  rmSync(FIXTURE_ROOT, { recursive: true, force: true })
})

/** 在临时树里造一个包目录：`files` 是相对包目录的路径清单（内容无关紧要）。 */
function makePackage(name: string, files: string[]): string {
  const dir = join(FIXTURE_ROOT, name)
  for (const file of files) {
    const full = join(dir, file)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, '')
  }
  return dir
}

describe('反例 1：陈旧产物（源码搬走了，产物留在原地）', () => {
  it('三个扩展名一起报，且**同目录里仍有源码的那份不报**', () => {
    const dir = makePackage('stale', [
      'src/kept.ts',
      'lib/kept.js',
      'lib/kept.js.map',
      'lib/kept.d.ts',
      'lib/moved.js',
      'lib/moved.js.map',
      'lib/moved.d.ts',
    ])
    const { stale, missing } = auditPackage(dir)
    expect(render(stale)).toEqual([
      'lib/moved.d.ts（应有 src/moved.ts 或 src/moved.d.ts）',
      'lib/moved.js（应有 src/moved.ts）',
      'lib/moved.js.map（应有 src/moved.ts）',
    ])
    expect(missing).toEqual([])
  })

  it('这就是 2026-10-03 的现场：`env-ready` 迁去别包后，devdata 的 lib 里留下的正是这三份', () => {
    const dir = makePackage('env-ready-leftover', ['src/index.ts', 'lib/index.js', 'lib/index.d.ts', 'lib/env-ready.js', 'lib/env-ready.js.map', 'lib/env-ready.d.ts'])
    expect(render(auditPackage(dir).stale)).toEqual([
      'lib/env-ready.d.ts（应有 src/env-ready.ts 或 src/env-ready.d.ts）',
      'lib/env-ready.js（应有 src/env-ready.ts）',
      'lib/env-ready.js.map（应有 src/env-ready.ts）',
    ])
  })
})

describe('反例 2：缺失产物（提交了源码、忘了产物）', () => {
  it('缺 `.js` 与缺 `.d.ts` 各报一条对应的期望', () => {
    const dir = makePackage('missing', ['src/index.ts', 'lib/index.js'])
    expect(render(auditPackage(dir).missing)).toEqual(['src/index.ts（应有 lib/index.d.ts）'])
  })

  it('产物整批没提交 → 两条都报（这正是 CI 那道 `git diff` 看不见的形态）', () => {
    const dir = makePackage('missing-all', ['src/a.ts', 'src/b.ts'])
    expect(render(auditPackage(dir).missing)).toEqual([
      'src/a.ts（应有 lib/a.js 或 lib/a.d.ts）',
      'src/b.ts（应有 lib/b.js 或 lib/b.d.ts）',
    ])
  })
})

describe('反例 3：不许误报的三类', () => {
  it('手写的 `src/*.d.ts` 不参与右侧判据（`tsc` 不把它拷进 `outDir`）', () => {
    const dir = makePackage('handwritten', ['src/js-yaml.d.ts', 'src/index.ts', 'lib/index.js', 'lib/index.d.ts'])
    expect(auditPackage(dir)).toEqual({ stale: [], missing: [], scanned: 2 })
  })

  it('手写声明若确实被拷进了 `lib/`，左侧也认它（`lib/x.d.ts` ← `src/x.d.ts`）', () => {
    const dir = makePackage('copied-dts', ['src/types.d.ts', 'lib/types.d.ts'])
    expect(auditPackage(dir).stale).toEqual([])
  })

  it('嵌套目录按相对路径对齐；不归本判据管的扩展名既不报也不算陈旧', () => {
    const dir = makePackage('nested', ['src/a/b.ts', 'lib/a/b.js', 'lib/a/b.d.ts', 'lib/fixture.txt'])
    expect(auditPackage(dir)).toEqual({ stale: [], missing: [], scanned: 3 })
  })
})

describe('反例 4：多包工作区里的路径要带包名（否则不知道该去哪个包删）', () => {
  it('两个包各自的陈旧产物都带上 `packages/<pkg>/` 前缀', () => {
    makePackage('ws/one', ['src/index.ts', 'lib/index.js', 'lib/index.d.ts', 'lib/gone.js'])
    makePackage('ws/two', ['src/index.ts', 'lib/index.js', 'lib/index.d.ts', 'lib/gone2.js'])
    const { audit, pkgs } = auditWorkspace(join(FIXTURE_ROOT, 'ws'))
    expect(pkgs).toEqual(['one', 'two'])
    expect(render(audit.stale)).toEqual(['packages/one/lib/gone.js（应有 src/gone.ts）', 'packages/two/lib/gone2.js（应有 src/gone2.ts）'])
  })
})
