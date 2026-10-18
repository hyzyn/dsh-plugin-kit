// CI tag 发布流（.github/workflows/release.yml 调用）：无需 OTP，token 由 workflow 写入 ~/.npmrc。
// 与手动流（release-publish-all.mjs）的差异：
//   1. registry 上已存在的「包名@版本」自动跳过——monorepo 每次只 bump 受影响的包，
//      未 bump 的包不会因 cannot-publish-over 中断发布链。**但跳过不是白跳**：跳过前必须先
//      证明「registry 上那个版本的内容 == 本仓此刻要发的代码」（`preflightTargets`）。不比对
//      内容的版本级跳过就是 2026-10-17 那次事故的入口（kit 内容改了没 bump，消费者带着新
//      import 发出去、用户装到就整条 entry 不激活，见 scripts/lib/published-content.mjs 头注释）；
//   2. 版本号带 '-'（如 0.16.0-rc.1）的包以 --tag next 发布，不抢占 latest；
//   3. 发布后逐包回查 registry——「全部完成 ✔」不代表发上去了。回查只会在**有证据**
//      时才判红（判定规则见「核实 registry」一段）。
// 任一包发布失败立即停止；整体重跑安全（已成功的包自动跳过）。
// `--preflight`：只跑预检不发布（`pnpm release:preflight`，tag 前本地自查用）。
import { execSync } from 'node:child_process'
import { targets } from './publish-targets.mjs'
import { REGISTRY, fetchManifest, fetchPackument } from './lib/registry.mjs'
import {
  describeDrift,
  pkgVersion,
  preflightTargets,
  verifyPublishedContent,
} from './lib/published-content.mjs'
import { judgeAfterWindow } from './release-verify.mjs'

function lastErrorLine(error) {
  const raw = String(error.stderr ?? error.message ?? error)
  return raw.split('\n').filter((line) => line.trim() !== '').pop()?.trim() ?? 'unknown'
}

// ⚠️ 预检放在任何 publish 之前、整体跑完再决定：kit 排 targets 第一位，本仓的依赖方向保证
// 「kit 漂了 → 这里先红」，不会出现「消费者发出去一半才发现 kit 是旧内容」。
console.log('===== 预检：registry 上已存在的同版本内容必须与本仓一致 =====')
let preflight
try {
  preflight = preflightTargets({
    targets,
    pkgVersion,
    fetchManifest,
    verify: verifyPublishedContent,
  })
} catch (error) {
  // 预检自己读不到 / 解不开既有版本的 tarball 时**不许放行**：证明不了「跳过是安全的」，
  // 就按失败处理。这条分支正是「匹配不到就算过」的反面。
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
if (process.argv.includes('--preflight')) {
  console.log(`\n预检通过：${skipped.length} 个已发布版本内容一致、${toPublish.length} 个待发布（未真正发布）`)
  process.exit(0)
}

const published = []
for (const { dir, name, version } of toPublish) {
  const prerelease = version.includes('-')
  // 首发的包（registry 上包名本身都还不存在）传播最慢：npm 要先建包文档再上 CDN，
  // 实测 v0.1.20 的 @hyzyn/dsh-docker 超过 2 分钟才可读——回查窗口按此放宽（见下）
  let firstRelease = false
  try {
    fetchPackument(name)
  } catch {
    firstRelease = true
  }
  console.log(`\n===== publish ${name}@${version} (${dir})${prerelease ? ' [dist-tag next]' : ''}${firstRelease ? ' [首次发布]' : ''} =====`)
  // 权威复核要用「文档是不是在本轮发布之后刷新的」来判定新鲜度，起点取发布命令前一刻
  const startedMs = Date.now()
  try {
    execSync(`pnpm publish --no-git-checks${prerelease ? ' --tag next' : ''}`, {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'inherit'],
    })
  } catch {
    console.error(`✘ ${name}@${version} 发布失败，已停止（后续包未发布）；修复后重跑 workflow 即可续发`)
    process.exit(1)
  }
  published.push({ name, version, prerelease, firstRelease, startedMs })
}

if (published.length === 0) {
  console.log('\n没有新版本需要发布（全部已在 registry）✔')
  process.exit(0)
}

// 发布后核实：CDN 传播可达 1–2 分钟（v0.1.17 实测 15 秒窗口不够，误报失败），
// 首次发布的包更慢（npm 建包文档 + 传播，v0.1.20 的 dsh-docker 超 2 分钟），
// 所以分两档窗口：常规 20 次 × 6 秒 ≈ 2 分钟，首发 40 次 × 9 秒 ≈ 6 分钟。
// 窗口只在「迟迟读不到」时才消耗：读到即 break，正常发布第一次轮询就过了。
// 判据比原先更严一档：原判据只要求 dist-tag **存在**，这里要求它**指向目标版本**。
console.log('\n===== 核实 registry =====')
let verified = 0
const unconfirmed = []
for (const { name, version, prerelease, firstRelease, startedMs } of published) {
  const distTag = prerelease ? 'next' : 'latest'
  const maxAttempts = firstRelease ? 40 : 20
  const waitSec = firstRelease ? 9 : 6
  let ok = false
  let lastSeen = '（还没有一次成功读取）'
  for (let attempt = 1; attempt <= maxAttempts && !ok; attempt++) {
    try {
      const got = fetchManifest(name, distTag).version
      if (got === version) {
        console.log(`✔ ${name}@${version} 已上 registry（dist-tag ${distTag}）`)
        verified++
        ok = true
      } else {
        lastSeen = `dist-tag ${distTag} 仍指向 ${got}`
      }
    } catch (error) {
      lastSeen = `请求失败（${lastErrorLine(error)}）`
    }
    if (!ok && attempt < maxAttempts) execSync(`sleep ${waitSec}`)
  }
  if (ok) continue

  // 窗口内没读到 → 拿整份 packument 做一次权威复核，用 time[version] 与 time.modified
  // 区分「文档陈旧」和「发布真的没落地」，只在后者判红：
  //   · time[version] 有值 → 该版本确实已写入 registry，只是 tag 端点没跟上 → 通过；
  //   · 文档刷新时间晚于本次 publish 起点、却仍没有该版本 → 发布确实未落地 → 退出 1；
  //   · 文档读不到，或文档刷新时间早于发布起点（仍是陈旧副本）→ 无法判定，给 warning
  //     放行：publish 命令已退出 0，不能凭「读不到」把绿发布判红（那正是上面三次误红）。
  let doc
  try {
    doc = fetchPackument(name)
  } catch (error) {
    console.warn(`::warning::${name}@${version} 窗口内未核实（${lastSeen}），权威文档也读不到（${lastErrorLine(error)}），无法判定；请人工复核`)
    unconfirmed.push(`${name}@${version}`)
    continue
  }
  // 判定规则本身是纯函数，由 scripts/test/release-verify.test.ts 钉住三种出口的分界
  const { verdict } = judgeAfterWindow({ version, startedMs, doc })
  if (verdict === 'verified') {
    console.log(`✔ ${name}@${version} 已上 registry（tag 端点未及时更新，权威文档已确认）`)
    verified++
    continue
  }
  if (verdict === 'unconfirmed') {
    // 走到这里的 unconfirmed 只可能是「文档仍是陈旧副本」——读不到的情况在上面 catch 里已处理
    console.warn(`::warning::${name}@${version} 窗口内未核实（${lastSeen}），权威文档最后刷新于 ${doc.time?.modified ?? '未知'}（早于本次发布起点），仍是陈旧副本，无法判定；请人工复核`)
    unconfirmed.push(`${name}@${version}`)
    continue
  }
  console.error(`✘ ${name}@${version} 权威文档已刷新到 ${doc.time.modified} 却仍没有该版本——publish 未落地。`)
  console.error(`   （窗口内最后一次观测：${lastSeen}）`)
  console.error(`   复核：curl -s '${REGISTRY}/${encodeURIComponent(name)}/${encodeURIComponent(version)}'`)
  process.exit(1)
}

if (unconfirmed.length > 0) {
  console.warn(`\n::warning::以下包 publish 命令成功、但回查未能确认，需人工核实：${unconfirmed.join(', ')}`)
  console.warn('   （重跑 workflow 会自动跳过已发布的版本，是幂等的）')
}
console.log(`\n全部完成 ✔（发布 ${verified + unconfirmed.length} 个包：${verified} 个经 registry 核实，${unconfirmed.length} 个待人工核实）`)