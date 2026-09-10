// CI tag 发布流（.github/workflows/release.yml 调用）：无需 OTP，token 由 workflow 写入 ~/.npmrc。
// 与手动流（release-publish-all.mjs）的差异：
//   1. registry 上已存在的「包名@版本」自动跳过——monorepo 每次只 bump 受影响的包，
//      未 bump 的包不会因 cannot-publish-over 中断发布链；
//   2. 版本号带 '-'（如 0.16.0-rc.1）的包以 --tag next 发布，不抢占 latest；
//   3. 发布后逐包回查 registry——「全部完成 ✔」不代表发上去了。
// 任一包发布失败立即停止；整体重跑安全（已成功的包自动跳过）。
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { targets } from './publish-targets.mjs'

// npm view 有本地缓存，直查 registry 最可靠
function fetchRegistry(name) {
  const out = execSync(`curl -sf --retry 3 https://registry.npmjs.org/${encodeURIComponent(name)}`, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  return JSON.parse(out)
}

function registryHasVersion(name, version) {
  try {
    return Boolean(fetchRegistry(name).versions?.[version])
  } catch {
    return false // 404 = 包还没发过
  }
}

function pkgVersion(dir) {
  return JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf8')).version
}

const published = []
for (const [dir, name] of targets) {
  const version = pkgVersion(dir)
  if (registryHasVersion(name, version)) {
    console.log(`↷ ${name}@${version} 已在 registry，跳过`)
    continue
  }
  const prerelease = version.includes('-')
  // 首发的包（registry 上包名本身都还不存在）传播最慢：npm 要先建包文档再上 CDN，
  // 实测 v0.1.20 的 @hyzyn/dsh-docker 超过 2 分钟才可读——回查窗口按此放宽（见下）
  let firstRelease = false
  try {
    fetchRegistry(name)
  } catch {
    firstRelease = true
  }
  console.log(`\n===== publish ${name}@${version} (${dir})${prerelease ? ' [dist-tag next]' : ''}${firstRelease ? ' [首次发布]' : ''} =====`)
  try {
    execSync(`pnpm publish --no-git-checks${prerelease ? ' --tag next' : ''}`, {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'inherit'],
    })
  } catch {
    console.error(`✘ ${name}@${version} 发布失败，已停止（后续包未发布）；修复后重跑 workflow 即可续发`)
    process.exit(1)
  }
  published.push([name, version, prerelease, firstRelease])
}

if (published.length === 0) {
  console.log('\n没有新版本需要发布（全部已在 registry）✔')
  process.exit(0)
}

// 发布后核实：CDN 传播可达 1–2 分钟（v0.1.17 实测 15 秒窗口不够，误报失败），
// 首次发布的包更慢（npm 建包文档 + 传播，v0.1.20 的 dsh-docker 超 2 分钟），
// 所以分两档窗口：常规 20 次 × 6 秒 ≈ 2 分钟，首发 40 次 × 9 秒 ≈ 6 分钟。
console.log('\n===== 核实 registry =====')
let verified = 0
for (const [name, version, prerelease, firstRelease] of published) {
  const distTag = prerelease ? 'next' : 'latest'
  const maxAttempts = firstRelease ? 40 : 20
  const waitSec = firstRelease ? 9 : 6
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const doc = fetchRegistry(name)
      if (doc.versions?.[version] && doc['dist-tags']?.[distTag]) {
        console.log(`✔ ${name}@${version} 已上 registry（dist-tag ${distTag}）`)
        verified++
        break
      }
    } catch {}
    if (attempt === maxAttempts) {
      // 注意：走到这里 **publish 本身是成功的**（失败会在上面立即退出），
      // 只是回查没读到——不要据此重发（会撞 cannot publish over），先人工核实 registry
      console.error(`✘ ${name}@${version} 发布后 ${attempt} 次回查（约 ${attempt * waitSec / 60} 分钟）未在 registry 读到。`)
      console.error('   publish 命令本身已成功，多半是 registry / CDN 传播延迟：请先直查')
      console.error(`   curl -s https://registry.npmjs.org/${encodeURIComponent(name)} 确认，再决定是否重跑（重跑会自动跳过已发布的版本）`)
      process.exit(1)
    }
    execSync(`sleep ${waitSec}`)
  }
}
console.log(`\n全部完成 ✔（发布 ${verified} 个包，均经 registry 核实）`)
