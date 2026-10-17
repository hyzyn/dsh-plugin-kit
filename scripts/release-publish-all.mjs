// 按依赖顺序发布全部包（用 node scripts/release-publish-all.mjs [6位OTP] [only=]dir|pkg,... 执行）
// OTP 可选：使用 bypass-2FA 的 granular token 时不需要；经典 token 需传动态码。
// 包过滤参数支持 only= 前缀，也可直接写裸包名（node scripts/release-publish-all.mjs packages/tty）。
// 任一失败立即停止，后续可用剩余包名重跑。
//
// ⚠️ 发布前先做**内容预检**（与 CI 的 release-publish-tag.mjs 同一条判据）：registry 上已存在的
// 「包名@版本」，其运行时内容必须与本仓此刻的代码逐字节一致；不一致立即中止。版本号是内容身份，
// 内容改了却没 bump 就直接发，用户侧会拿到「版本对、内容旧」的包（2026-10-17 kit 那次事故的形态：
// codegraph 0.6.9 引用了 kit 0.5.2 上不存在的导出，整条 entry 加载失败）。判据与理由见
// scripts/lib/published-content.mjs 头注释；内容一致的已发布版本会被跳过（幂等）。
//
// ⚠️ 「全部完成 ✔」不代表真的发上去了，发完必须回查 registry 核实
// （npm view 有本地缓存，curl 直查最可靠：curl -s https://registry.npmjs.org/<包名>）。
import { execSync } from 'node:child_process'
import { targets } from './publish-targets.mjs'
import { fetchManifest } from './lib/registry.mjs'
import {
  describeDrift,
  pkgVersion,
  preflightTargets,
  verifyPublishedContent,
} from './lib/published-content.mjs'

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

const selected = targets.filter(([dir, name]) => !only || only.includes(dir) || only.includes(name))
if (selected.length === 0) {
  console.error(`✘ 过滤条件没命中任何发布目标：${(only ?? []).join(', ')}`)
  process.exit(1)
}

// 只在真正 publish 之前整体预检（与 CI 流分开跑，但判据是同一份实现）。
console.log('===== 预检：registry 上已存在的同版本内容必须与本仓一致 =====')
let preflight
try {
  preflight = preflightTargets({
    targets: selected,
    pkgVersion,
    fetchManifest,
    verify: verifyPublishedContent,
  })
} catch (error) {
  // 预检读不到 / 解不开既有版本的 tarball 时不许放行（证明不了「跳过安全」就按失败处理）。
  console.error(`✘ 预检无法完成：${error instanceof Error ? error.message : String(error)}`)
  console.error('   （既读不到 registry 上那个版本的内容，就无法证明跳过安全；按失败处理，不进入发布）')
  process.exit(1)
}
const { toPublish, skipped, drift } = preflight
for (const item of skipped) {
  console.log(`↷ ${item.name}@${item.version} 已在 registry 且内容与本仓一致，跳过`)
}
if (drift.length > 0) {
  console.error('\n✘ 以下「包名@版本」在 registry 上的内容与本仓此刻要发布的代码不一致：')
  for (const line of describeDrift(drift)) console.error(line)
  console.error('\n版本号是内容身份：内容变了就必须 bump，不能靠同一个版本号重发（npm 不可覆盖）。')
  console.error('修法：bump 受影响的包（kit 还要跟齐全仓消费者钉子）后重跑；')
  console.error('     历史与判据见 RELEASING.md「发布门槛」第 6 条与 scripts/lib/published-content.mjs 头注释。')
  process.exit(1)
}
if (toPublish.length === 0) {
  console.log('\n没有需要发布的包（全部已在 registry 且内容一致）✔')
  process.exit(0)
}

const env = { ...process.env }
for (const { dir, name } of toPublish) {
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
