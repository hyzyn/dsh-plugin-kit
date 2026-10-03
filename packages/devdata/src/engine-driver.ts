/**
 * 引擎驱动**可选**这条规矩的机制面（2026-10-02 定，正文见
 * [docs/devdata-plan.md §2.4](../../../docs/devdata-plan.md)）。
 *
 * ## 规矩
 *
 * 本包**不把任何数据库 / 中间件驱动放进 `dependencies`**：驱动由真正的使用者按需安装。
 * 依据是一次实测——为 SQL Server 引 `tedious` 会带进 **131 个包 / 65 MB**，其中
 * **42 MB（约 65%）是 `@azure/*`**（Azure AD 认证），而走 SQL 账号认证时那部分**一行都用不到**。
 * 让所有装 `devdata` 的人都背上它、只为少数人要验 SQL Server，代价与收益不成比例。
 *
 * ## 所以「缺驱动」的失败要说人话
 *
 * 可选依赖的典型失败是 `Cannot find module 'mysql2'` 这种一句话：它既不说是**哪个引擎**要用它，
 * 也不说**怎么补**。本模块把那条错误换成可执行的恢复路径。
 *
 * ## 静态 `import` 与动态 `import()` 的分界（守卫按这条判）
 *
 * - `import { createPool } from 'mysql2'` —— **拒**：静态 import 会把「缺驱动」变成**加载期崩溃**，
 *   而且会诱导人顺手把它写进 `dependencies`（那样「可选」就名存实亡）；
 * - `import type { X } from 'mysql2'` —— **允许**：类型在运行期被抹掉，类型包可以待在
 *   `devDependencies` 里，不违背这条规矩；
 * - `await import('mysql2')` —— **允许**：这才是可选依赖的正确用法（用到才加载、缺了能兜）。
 *
 * 守卫见 `test/engine-deps.guard.test.ts`（含反例）。
 */

/**
 * 已知的引擎驱动包名。
 *
 * **不是白名单**——它只用于把错误与守卫报出来的话说准，迟早会有新的驱动（那时把它加进这里）。
 */
export const KNOWN_ENGINE_DRIVERS: readonly string[] = [
  'mysql2',
  'pg',
  'tedious',
  'mssql',
  'ioredis',
  'redis',
  'mongodb',
  'better-sqlite3',
  'oracledb',
]

/**
 * 缺驱动时给用户的那句话：**说清哪个引擎、装哪个包、以及本包为什么不预装它**。
 *
 * 为什么要把「为什么不预装」也写进去：不然下一个人看到这句会以为**是漏装了**，
 * 然后去把驱动加进 `dependencies`——正好把这条规矩拆掉。
 */
export function missingDriverMessage(input: { driver: string; engine: string }): string {
  return (
    `验 ${input.engine} 需要驱动 \`${input.driver}\`，而本包**刻意不预装**任何驱动` +
    `（预装 SQL Server 的驱动会带进 131 个包 / 65 MB，其中 42 MB 是 Azure AD 认证，走账号认证时用不到）。` +
    `恢复路径：在执行本套件的地方跑 \`npm install ${input.driver}\`（pnpm / yarn 用对应命令）后重试。`
  )
}

/**
 * 懒加载一个可选驱动。
 *
 * **只**把「模块找不到」这一类换成 `missingDriverMessage`；驱动自己在加载时抛的错**原样抛**——
 * 把真错误说成「没装」会让人去重装一个本来就装好的包，那是把排障带偏。
 */
export async function loadOptionalDriver(input: { driver: string; engine: string }): Promise<unknown> {
  try {
    return await import(input.driver)
  } catch (error) {
    const code = (error as { code?: unknown } | null | undefined)?.code
    const missing =
      code === 'ERR_MODULE_NOT_FOUND' ||
      code === 'MODULE_NOT_FOUND' ||
      (error instanceof Error && /Cannot find (?:module|package|module package)/i.test(error.message))
    if (missing) throw new Error(missingDriverMessage(input))
    throw error
  }
}
