// CI tag 发布流（.github/workflows/release.yml 调用）：无需 OTP，token 由 workflow 写入 ~/.npmrc。
// 与手动流（release-publish-all.mjs）的差异：
//   1. registry 上已存在的「包名@版本」自动跳过——monorepo 每次只 bump 受影响的包，
//      未 bump 的包不会因 cannot-publish-over 中断发布链；
//   2. 版本号带 '-'（如 0.16.0-rc.1）的包以 --tag next 发布，不抢占 latest；
//   3. 发布后逐包回查 registry——「全部完成 ✔」不代表发上去了。回查只会在**有证据**
//      时才判红（判定规则见「核实 registry」一段）。
// 任一包发布失败立即停止；整体重跑安全（已成功的包自动跳过）。
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { targets } from './publish-targets.mjs'
import { judgeAfterWindow } from './release-verify.mjs'

const REGISTRY = 'https://registry.npmjs.org'
let reqSeq = 0

// ⚠️ 轮询一律走「单版本小端点」，不要拉整份 packument：整份 packument 实测 144 KB
// （@hyzyn/dsh-docker，2026-09-25），按 6 秒间隔轮询 20 次等于把同一份文档反复拉 20
// 遍，极易被 CDN 缓存 / 限流；而 curl -sf 遇非 2xx 直接抛错、又被 catch 吞掉，于是
// 表现为「publish 其实成功、回查却说没读到」的假失败——v0.1.39 / v0.1.41 / v0.1.44
// 三次发布都因此误红，每次都要人工删 tag 重打一遍才收场。
// Cache-Control: no-cache 提示中间层回源；随机 ?cb= 让它无法命中缓存（registry 一侧
// 忽略未知查询参数，实测 /<pkg>/latest?cb=… 照常 200）。
function cacheBust() {
  reqSeq += 1
  return `cb=${Date.now()}-${reqSeq}`
}
function curlJson(path) {
  const out = execSync(
    `curl -sf --retry 3 -H 'Cache-Control: no-cache' '${REGISTRY}/${path}?${cacheBust()}'`,
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
  return JSON.parse(out)
}
// /<pkg>/<ref>：ref 可以是版本号，也可以是 dist-tag——registry 自动解析（实测
// @deepseek-ai/dsh/next → 0.1.7-rc.2 而 /latest → 0.1.5-rc.3，确实按 tag 取值），
// 只返回那一个 version 的 manifest，实测 3.1 KB，比整份 packument 小 46 倍。
function fetchManifest(name, ref) {
  return curlJson(`${encodeURIComponent(name)}/${encodeURIComponent(ref)}`)
}
// 整份 packument（144 KB）：只用在两处非轮询场景——探测包是否存在、窗口耗尽后的权威复核。
function fetchPackument(name) {
  return curlJson(encodeURIComponent(name))
}
function lastErrorLine(error) {
  const raw = String(error.stderr ?? error.message ?? error)
  return raw.split('\n').filter((line) => line.trim() !== '').pop()?.trim() ?? 'unknown'
}

// registry 上是否已有「包名@版本」：/<pkg>/<version> 返回 200 即为有、404 即为无
// （实测 0.0.0-nope → 404）。读不到时按「无」处理，让 pnpm publish 自己报
// cannot-publish-over —— 比静默跳过安全。
function registryHasVersion(name, version) {
  try {
    fetchManifest(name, version)
    return true
  } catch {
    return false
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