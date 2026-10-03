/**
 * 引擎驱动**可选**守卫（跨包）——2026-10-02 定，正文见
 * [docs/devdata-plan.md §2.4](../../docs/devdata-plan.md)。
 *
 * ## 为什么有这条规矩
 *
 * 实测：为 SQL Server 引 `tedious` 会带进 **131 个包 / 65 MB**，其中 **42 MB（约 65%）是
 * `@azure/*`**（Azure AD 认证）——走 SQL 账号认证时**一行都用不到**。让所有装这套件的人都背上它、
 * 只为少数人要验 SQL Server，代价与收益不成比例。**所以驱动由要用的人自己装。**
 *
 * ## 守卫判三条
 *
 * 1. **跨包**：任何包的 `dependencies` / `optionalDependencies` 里都不得出现已知引擎驱动
 *    （`optionalDependencies` 也**不行**——npm 默认会装它，「可选」名存实亡）；
 * 2. **`devdata` 专属**：它的 `dependencies` 是**允许清单**，加任何运行时依赖都要改这条守卫
 *    —— 也就是一次刻意动作，不是顺手；
 * 3. **源码**：`src/**` 里不得有对已知驱动的**静态** import —— 静态 import 会把「缺驱动」
 *    变成**加载期崩溃**，而且会诱导人把它写进 `dependencies`。
 *    **`import type` 与 `await import()` 是允许的**：类型可以待在 `devDependencies`，
 *    动态 import 才是可选依赖的正确用法（见 `src/engine-driver.ts` 的 `loadOptionalDriver`）。
 *
 * ## 反例是必需的
 *
 * 没有反例的守卫会在下一次重构里悄悄失效。本文件末尾三条反例各自证明：改坏一种形态 → 报出来。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { KNOWN_ENGINE_DRIVERS } from '../src/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..', '..')
const packagesDir = join(root, 'packages')

/**
 * `devdata` 的运行时依赖允许清单——加一项就要改这里（= 一次刻意动作）。
 *
 * 2026-10-02 加 `@deepseek-ai/schemastery`：接宿主半体要有配置 schema，而它是本仓**每一个**带配置的
 * 插件都在用的那一份（docker / tty / devfront 同款，宿主自己也提供它）。它不是引擎驱动，
 * 也不改变下面的判据 1/3 想挡的东西——「不许把 mysql2 / pg / redis / tedious 写进依赖树」照旧。
 */
export const DEVDATA_ALLOWED_RUNTIME_DEPS: readonly string[] = [
  '@deepseek-ai/schemastery',
  '@hyzyn/dsh-kit',
  'js-yaml',
]

/** 去掉注释：**只在注释里提一句「不要引 mysql2」不算引了**（反过来也一样，注释不该被误报）。 */
export function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
}

/** 一个包里**会被装进依赖树**的那些依赖名（`dependencies` + `optionalDependencies`）。 */
export function installedDeps(pkg: Record<string, unknown>): string[] {
  const out: string[] = []
  for (const field of ['dependencies', 'optionalDependencies']) {
    const block = pkg[field]
    if (typeof block !== 'object' || block === null) continue
    out.push(...Object.keys(block))
  }
  return out
}

/**
 * 源码里**静态** import / require 的裸模块名。
 *
 * 三条刻意的取舍：
 *   - **跳过 `import type`**：类型在运行期被抹掉，类型包待 `devDependencies` 不违背这条规矩；
 *   - **跳过相对/绝对路径**（`./redis-command.js` 这种本地模块——按名字匹配会把它们误报，
 *     本包的 `redis-command.ts` 正是一个例子）；
 *   - **不看动态 `import()`**：那正是允许的用法。
 */
export function staticBareImports(source: string): string[] {
  const body = stripComments(source)
  const found: string[] = []
  for (const m of body.matchAll(/^[ \t]*import\s+(?!type\s)[^\n]*?['"]([^'"]+)['"]/gm)) found.push(m[1] ?? '')
  for (const m of body.matchAll(/(?:^|[^.\w])require\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) found.push(m[1] ?? '')
  return [...new Set(found.filter((spec) => spec !== '' && !spec.startsWith('.') && !spec.startsWith('/')))]
}

/** 某包 `src/` 下所有 `.ts` 源码拼起来（守卫只需要「整包里出现过什么」）。 */
function readPackageSource(pkg: string): string {
  const out: string[] = []
  const walk = (dir: string): void => {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (entry.endsWith('.ts')) out.push(readFileSync(full, 'utf8'))
    }
  }
  walk(join(packagesDir, pkg, 'src'))
  return out.join('\n')
}

interface PackageFacts {
  name: string
  pkg: Record<string, unknown>
  source: string
}

function allPackages(): PackageFacts[] {
  const out: PackageFacts[] = []
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    let pkg: Record<string, unknown>
    try {
      pkg = JSON.parse(readFileSync(join(packagesDir, entry.name, 'package.json'), 'utf8')) as Record<string, unknown>
    } catch {
      continue
    }
    out.push({ name: entry.name, pkg, source: readPackageSource(entry.name) })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** 判据 1：把「谁装了驱动」找出来（返回违规描述，空 = 通过）。 */
export function driverDepViolations(packages: readonly PackageFacts[]): string[] {
  const out: string[] = []
  for (const { name, pkg } of packages) {
    const bad = installedDeps(pkg).filter((dep) => KNOWN_ENGINE_DRIVERS.includes(dep))
    if (bad.length > 0) out.push(`${name} 的 dependencies/optionalDependencies 里有驱动：${bad.join(', ')}`)
  }
  return out
}

/** 判据 3：把「静态 import 了驱动」找出来。 */
export function staticDriverImportViolations(packages: readonly PackageFacts[]): string[] {
  const out: string[] = []
  for (const { name, source } of packages) {
    const bad = staticBareImports(source).filter((spec) => KNOWN_ENGINE_DRIVERS.includes(spec))
    if (bad.length > 0) out.push(`${name} 的 src/ 里静态 import 了驱动：${bad.join(', ')}`)
  }
  return out
}

describe('引擎驱动一律可选：守卫（跨包）', () => {
  const packages = allPackages()

  it('把包都读到了（读不到会让下面的判据静默全绿）', () => {
    expect(packages.length).toBeGreaterThanOrEqual(14)
    expect(packages.map((p) => p.name)).toContain('devdata')
  })

  it('**没有任何包**把引擎驱动写进 dependencies / optionalDependencies', () => {
    expect(driverDepViolations(packages)).toEqual([])
  })

  it('**没有任何包**在 src/ 里静态 import 驱动（动态 import() 与 import type 允许）', () => {
    expect(staticDriverImportViolations(packages)).toEqual([])
  })

  it('devdata 的运行时依赖就在允许清单里（加一项 = 一次刻意动作）', () => {
    const devdata = packages.find((p) => p.name === 'devdata')
    expect(devdata).toBeDefined()
    const declared = Object.keys((devdata?.pkg.dependencies as Record<string, unknown> | undefined) ?? {})
    expect([...declared].sort()).toEqual([...DEVDATA_ALLOWED_RUNTIME_DEPS].sort())
    // 允许清单本身不许悄悄长出驱动
    expect(DEVDATA_ALLOWED_RUNTIME_DEPS.filter((d) => KNOWN_ENGINE_DRIVERS.includes(d))).toEqual([])
  })
})

describe('反例：三种改法都必须被抓出来', () => {
  const fake = (pkg: Record<string, unknown>, source = ''): PackageFacts => ({ name: 'fake', pkg, source })

  it('① 把驱动写进 dependencies → 判据 1 报', () => {
    expect(driverDepViolations([fake({ dependencies: { mysql2: '^3' } })])).toHaveLength(1)
  })

  it('② 写进 optionalDependencies → 同样报（npm 默认会装它，「可选」名存实亡）', () => {
    expect(driverDepViolations([fake({ optionalDependencies: { tedious: '^20' } })])).toHaveLength(1)
  })

  it('③ 静态 import 驱动 → 判据 3 报；而 `import type` 与动态 import 都**不报**', () => {
    expect(staticDriverImportViolations([fake({}, "import { createPool } from 'mysql2'\n")])).toHaveLength(1)
    expect(staticDriverImportViolations([fake({}, "import type { Connection } from 'mysql2'\n")])).toEqual([])
    expect(staticDriverImportViolations([fake({}, "const m = await import('mysql2')\n")])).toEqual([])
    // 本地同名模块（本包的 `redis-command.ts` 就是这样）不许被误报
    expect(staticDriverImportViolations([fake({}, "import { x } from './redis-command.js'\n")])).toEqual([])
    // 注释里提一句也不算
    expect(staticDriverImportViolations([fake({}, "// 不要静态 import 'ioredis'\n")])).toEqual([])
  })
})
