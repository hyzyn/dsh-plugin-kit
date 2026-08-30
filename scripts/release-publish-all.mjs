// 按依赖顺序发布全部包（用 node scripts/release-publish-all.mjs [6位OTP] [only=]dir|pkg,... 执行）
// OTP 可选：使用 bypass-2FA 的 granular token 时不需要；经典 token 需传动态码。
// 包过滤参数支持 only= 前缀，也可直接写裸包名（node scripts/release-publish-all.mjs packages/tty）。
// 任一失败立即停止，后续可用剩余包名重跑。
// ⚠️ 「全部完成 ✔」不代表真的发上去了，发完必须查 registry 核实（见 docs/PUBLISHING.md）。
import { execSync } from 'node:child_process'

const arg2 = process.argv[2]
const arg3 = process.argv[3]
const otp = /^\d{6}$/.test(arg2 ?? '') ? arg2 : undefined
if (arg3 && !otp) {
  // 第二个附加参数仅在第一个参数是 OTP 时才有意义
  console.error('用法: node scripts/release-publish-all.mjs [6位OTP] [only=]dir|pkg,...')
  process.exit(1)
}
let only = (otp ? arg3 : arg2)?.split(',') ?? null
if (only !== null) only = only.map((item) => item.trim().replace(/^only=/, '')).filter((item) => item !== '')

// 可通过参数指定只发部分包（用于 OTP 过期后续发）: node scripts/release-publish-all.mjs <otp> packages/tty,.
const targets = [
  ['packages/kit', '@hyzyn/dsh-kit'],
  ['packages/codegraph', '@hyzyn/dsh-codegraph'],
  ['packages/env', '@hyzyn/dsh-env'],
  ['packages/mcp', '@hyzyn/dsh-mcp'],
  ['packages/profile', '@hyzyn/dsh-profile'],
  ['packages/prompt', '@hyzyn/dsh-prompt'],
  ['packages/rss', '@hyzyn/dsh-rss'],
  ['packages/search', '@hyzyn/dsh-search'],
  ['packages/tty', '@hyzyn/dsh-tty'],
  ['packages/all', '@hyzyn/dsh-all'],
  ['.', '@hyzyn/dsh-plugin-kit'],
]

const env = { ...process.env }
for (const [dir, name] of targets) {
  if (only && !only.includes(dir) && !only.includes(name)) continue
  console.log(`\n===== publish ${name} (${dir}) =====`)
  try {
    execSync(`pnpm publish --no-git-checks${otp ? ` --otp=${otp}` : ''}`, {
      cwd: dir,
      env,
      stdio: ['ignore', 'pipe', 'inherit'],
    })
    console.log(`✔ ${name} 已发布`)
  } catch {
    console.error(`✘ ${name} 发布失败，已停止（后续包未发布）`)
    process.exit(1)
  }
}
console.log('\n全部完成 ✔')
