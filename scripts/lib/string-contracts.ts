/**
 * 字符串契约守卫：**类型管不住的那些字符串**不许再当字面量写。
 *
 * ## 这条判据是什么（也是它在 `docs/conventions.md` 里的归宿）
 *
 * | 形态 | 谁保证不漂 | 要不要常量 |
 * |---|---|---|
 * | 类型联合的取值（`'read'` / `'write-scoped'`） | **TypeScript**——写错编译就报 | ❌ 不要 |
 * | 宿主服务名、启动环境层名 | **没人**——运行时字符串键 | ✅ 要，用 `kit` 的 `HOST_SERVICES` / `LAUNCH_ENV_LAYERS` |
 *
 * ## 为什么值得一条守卫
 *
 * 这些名字写错的症状是**静默降级**：`getService(ctx, 'setings')` 返回 `undefined`，
 * 于是卡片少一块、能力判定换一条路——**没有报错、没有测试会红**。
 * 而 `tsconfig` 是白名单式装载（`include`），这类名字根本不会进类型检查。
 *
 * `launchEnvironment` 尤其危险：它错了会**静默换掉能力闸门的判定源**
 * （回落到冻结的 `process.env` 拷贝）——安全相关，不是体验问题。
 *
 * ## 为什么用源码扫描而不是类型
 *
 * 因为要拦的正是「类型拦不住」的那一类。扫描是唯一能生效的机制；代价是它只认这一种写法
 * （`getService(ctx, '…')`），别种写法它看不见——所以判据同时写进 `conventions.md`，
 * 让人改代码前就知道该用常量。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { HOST_SERVICES, LAUNCH_ENV_LAYERS } from '../../packages/kit/src/index.js'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** 只扫 `src/`：`lib/` 是构建产物，`test/` 里的替身允许写字面量（那不是契约，是模拟）。 */
function sourceFiles(packagesDir: string): string[] {
  const out: string[] = []
  for (const pkg of readdirSync(packagesDir)) {
    const srcDir = join(packagesDir, pkg, 'src')
    let entries: string[]
    try {
      entries = readdirSync(srcDir, { recursive: true }) as string[]
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = join(srcDir, entry)
      if (!entry.endsWith('.ts')) continue
      try {
        if (statSync(full).isFile()) out.push(full)
      } catch {
        /* 目录或读不到，跳过 */
      }
    }
  }
  return out
}

/** 一条命中。 */
export interface LiteralHit {
  file: string
  line: number
  text: string
}

/** 一行是否是「注释行」（` * …` / `/* …` / `// …`）。 */
function isCommentLine(text: string): boolean {
  const trimmed = text.trimStart()
  return trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('//')
}

/**
 * 找出把**已登记的宿主服务名**当字面量传给 `getService` 的地方。
 *
 * **跳过注释行**：本仓的注释里会写「反面示例」（如 `getService(ctx, 'settings')` 一类），
 * 不跳过就会把文档判成违规——那是把守卫变成噪声，最后会被关掉。
 *
 * 只报「传进去的字面量恰好是登记过的服务名」——那说明它想拿的就是那个服务，
 * 但绕过了常量。传别的字符串（如测试里的假服务名）不报。
 */
export function findBareServiceNames(files: readonly string[]): LiteralHit[] {
  const registered = new Set<string>(Object.values(HOST_SERVICES))
  const hits: LiteralHit[] = []
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/)
    lines.forEach((text, index) => {
      if (isCommentLine(text)) return
      const match = /getService\s*\(\s*[A-Za-z0-9_.]+\s*,\s*'([^']+)'/.exec(text)
      if (match === null) return
      if (!registered.has(match[1] as string)) return
      hits.push({ file: file.slice(REPO_ROOT.length + 1), line: index + 1, text: text.trim() })
    })
  }
  return hits
}

/**
 * 找出把**启动环境层名**当字面量写的地方（只认 `getFrom(…, [...])` 里的数组元素）。
 *
 * 同样跳过注释行，理由同上。也只报登记过的层名——写错成别的字符串也拿不到数据，
 * 这里要拦的是「用常量表达意图」。
 */
export function findBareLaunchLayers(files: readonly string[]): LiteralHit[] {
  const registered = new Set<string>(Object.values(LAUNCH_ENV_LAYERS))
  const hits: LiteralHit[] = []
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/)
    lines.forEach((text, index) => {
      if (isCommentLine(text)) return
      const match = /getFrom\s*\([^)]*\[\s*'([^']+)'/.exec(text)
      if (match === null) return
      if (!registered.has(match[1] as string)) return
      hits.push({ file: file.slice(REPO_ROOT.length + 1), line: index + 1, text: text.trim() })
    })
  }
  return hits
}
