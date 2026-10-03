/**
 * 入库产物一致性闸（`pnpm artifacts:check`；原 ci.yml 内联命令的脚本化，
 * 见 docs/ci-scripts-plan.md § 10）：重建全部包的产物，再对已跟踪的浏览器半体
 * （各包 `client.js`）与宿主半体（各包 `lib/` 下的文件）做 diff——
 * diff 非空 = 提交里的产物落后于源码（修过的修复在浏览器侧完全无效的那类事故）。
 *
 * pathspec 的两个坑（实测，原 ci.yml 注释里的教训，搬进来继续有效）：
 *   1. lib 那半边必须用 `:(glob)` + 双星通配：默认 pathspec 下只写到 `lib` 这一级
 *      不递归目录内容（`git diff` 匹配 0 个文件、闸门恒绿）；
 *   2. 也不要图省事把 `*` 写成会跨 `/` 的形态：默认 pathspec 下 `*` 会跨 `/`，
 *      会多匹配 packages/tty/scripts/lib/test-sshd.mjs。
 * argv 直传 git（不经 shell），`:(glob)` magic 原样到达 git，跨平台引号问题不存在。
 */
import { execFileSync } from 'node:child_process'

/** 浏览器半体：各包入库的 client.js（单星即可——它是文件，不需要递归）。 */
const CLIENT_SPEC = 'packages/*/client.js'
/** 宿主半体：各包 lib/ 下的**全部**内容（glob magic + 双星，见文件头第 1 / 2 条）。 */
const LIB_SPEC = ':(glob)packages/*/lib/**'

execFileSync('pnpm', ['-r', 'build'], { stdio: 'inherit' })

try {
  execFileSync('git', ['diff', '--exit-code', '--', CLIENT_SPEC, LIB_SPEC], { stdio: 'inherit' })
} catch {
  console.error('::error::构建产物落后于源码：在本地跑 pnpm -r build 后重新提交')
  process.exit(1)
}
