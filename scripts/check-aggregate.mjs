/**
 * 聚合层一致性闸（`pnpm aggregate:check`；原 ci.yml / release.yml 内联命令的脚本化，
 * 见 docs/ci-scripts-plan.md § 10）：重新生成聚合层（根 `cordis.patch.yml` / `package.json`
 * 与 `packages/all`），再对工作区做 diff——有 diff 说明提交时忘了 `pnpm aggregate`。
 *
 * 为什么做成脚本而不是把这条长命令塞进 package.json：`|| { …; }` 组命令在 Windows 的
 * cmd 下不成立（pnpm run 在 Windows 走 cmd），而闸门条目应当在三平台都可作为粘贴入口；
 * git pathspec 用 argv 直传（不经 shell），引号 / glob 语义跨平台一致。
 *
 * 只读仓外无依赖：跑 `pnpm aggregate`（确定性：CI 每轮都跑它然后 `git diff --exit-code` 必须无 diff）
 * + `git diff`，不写文件、不联网。
 */
import { execFileSync } from 'node:child_process'

/** 聚合层的四个落点（与 aggregate.mjs 的产出一致；这里只做「重新生成后无 diff」断言）。 */
const AGGREGATE_FILES = [
  'cordis.patch.yml',
  'package.json',
  'packages/all/cordis.patch.yml',
  'packages/all/package.json',
]

execFileSync('pnpm', ['aggregate'], { stdio: 'inherit' })

try {
  execFileSync('git', ['diff', '--exit-code', '--', ...AGGREGATE_FILES], { stdio: 'inherit' })
} catch {
  console.error('::error::聚合层过期：在本地跑 pnpm aggregate 后重新提交')
  process.exit(1)
}
