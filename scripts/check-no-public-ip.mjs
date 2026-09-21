#!/usr/bin/env node
/**
 * 防回归：仓库里（**文件内容与提交信息**）不得出现公网 IP 地址。
 *
 * 为什么要有这道闸：公网地址一旦进入提交信息或文件内容，清理就得重写全部历史——
 * 所有 sha 变化、文档引用失效、远端须 force push，公开仓库还不保证真能清干净。
 * 代价远高于在入口拦一次，所以**必须在入口拦**。

 *
 * 允许的地址（不是"公网"),按用途分类：
 *   - 私网 / 回环 / 链路本地 / CGN / 未指定 / 组播保留：本来就该在内网与测试里用；
 *   - RFC 5737 文档网段（192.0.2.0/24、198.51.100.0/24、203.0.113.0/24）与 RFC 2544
 *     基准网段（198.18.0.0/15）：文档与夹具**应该**用这些，而不是真地址；
 *   - 显式占位符白名单（见 PLACEHOLDERS）：极短、且注明"新加要谨慎"。
 * 其余一律判违规——**要放行只能在白名单里显式加**，那是一次有意识的决定，而不是顺手写个真实
 * 地址进来。
 *
 * 用法：
 *   node scripts/check-no-public-ip.mjs                 # 全仓已跟踪文件（CI 用）
 *   node scripts/check-no-public-ip.mjs --staged        # 只查暂存内容（pre-commit 用）
 *   node scripts/check-no-public-ip.mjs --message-file X # 查提交信息（commit-msg 用）
 *   node scripts/check-no-public-ip.mjs --self-test     # 自检分类器（CI 用）
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/* ------------------------------ 分类 ------------------------------ */

/** 显式放行的占位符：极短清单，新加要谨慎（它等于给一类地址开洞）。 */
const PLACEHOLDERS = new Set([
  '1.2.3.4',       // 经典示例地址（文档/夹具惯用）
  '255.255.255.255', // 广播
])

/**
 * 允许包含"看起来像公网 IP"字样的文件：闸门自己的自检夹具。
 *
 * 这个文件必须列出公网样例（`9.9.9.9` 是本次事故的那个、`8.8.8.8` 是公共 DNS……）
 * 才能证明分类器真的在拦——否则闸门只能靠人肉确认。所以只豁免它自己，**别往里加别的文件**。
 */
const SELF_EXEMPT = new Set(['scripts/check-no-public-ip.mjs'])

/** 判断一个 IPv4 是否属于"允许出现的地址族"。 */
function ipv4Allowed(ip) {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false
  const [a, b, c] = parts
  if (PLACEHOLDERS.has(ip)) return true
  if (a === 0) return true                              // 0.0.0.0/8 未指定
  if (a === 10) return true                             // 10/8 私网
  if (a === 127) return true                            // 127/8 回环
  if (a === 169 && b === 254) return true               // 169.254/16 链路本地
  if (a === 172 && b >= 16 && b <= 31) return true      // 172.16/12 私网
  if (a === 192 && b === 168) return true               // 192.168/16 私网
  if (a === 100 && b >= 64 && b <= 127) return true     // 100.64/10 CGN
  if (a === 192 && b === 0 && c === 2) return true      // 192.0.2/24 RFC 5737
  if (a === 198 && (b === 51 || b === 18) && c === 100) return true // 198.51.100/24 RFC 5737
  if (a === 203 && b === 0 && c === 113) return true    // 203.0.113/24 RFC 5737
  if (a === 198 && (b === 18 || b === 19)) return true  // 198.18/15 RFC 2544 基准
  if (a >= 224) return true                             // 224/4 组播 + 240/4 保留
  return false
}

/**
 * IPv4 的扫描正则。
 *
 * 边界刻意收紧：**前后不能是数字、点或连字符**。否则压缩后的 JS/SVG 里那种坐标串会被误判
 * ——实测 `<path d="…-7.3-2.4.5.5-2.4z">` 里的 `2.4.5.5` 是 SVG 路径数据，不是 IP。
 */
const IPV4_RE = /(?<![\d.-])((?:\d{1,3}\.){3}\d{1,3})(?![\d.-])/g

/**
 * IPv6：**刻意严格但覆盖压缩写法**。
 *
 * 为什么不能宽松：这类文本里 `16:11:22`（时间戳）、`a4:83:e7:11:22:33`（MAC）、
 * `02:42:ac:14:00:03`（Docker 的 MAC）跟 IPv6 长得一样，宽松匹配会刷出几十条假阳性——
 * 一道总在报假警的闸门，最后一定会被人关掉或用 `--no-verify` 绕过，等于没闸。
 *
 * 正则匹配"十六进制组 + 可选 :: 压缩"的骨架（:: 可出现在任意位置），真正的判据在
 * `looksLikeIpv6()`：要求**至少一个组长 >2 位**（时间戳/MAC 每组 ≤2 位），非压缩形式
 * 还要求 ≥6 组。回环 / 链路本地 / ULA / 文档段另有白名单（见 ipv6Allowed）。
 */
const IPV6_RE = /(?<![\w:.])([0-9a-fA-F]{0,4}(?::[0-9a-fA-F]{0,4}){2,7})(?![\w:.])/g
const IPV6_MAPPED_RE = /(?<![\w:.])((?:::ffff:|64:ff9b::|::)(?:\d{1,3}\.){3}\d{1,3})(?![\w:.])/g

function ipv6Allowed(addr) {
  const a = addr.toLowerCase()
  if (a === '::1' || a === '::') return true
  if (a.startsWith('fe80:') || a.startsWith('fc') || a.startsWith('fd')) return true // 链路本地 / ULA
  if (a.startsWith('2001:db8:')) return true // RFC 3849 文档段
  // 内嵌 IPv4 的映射/兼容形式：按**内嵌的 IPv4 部分**判定（::ffff:127.0.0.1 是回环）
  const tail = a.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (tail !== null) return ipv4Allowed(tail[1])
  return false
}

/** 该候选是否"像 IPv6 地址"（在宽正则上二次收敛，滤掉时间戳 / MAC / 代码片段）。 */
function looksLikeIpv6(candidate) {
  if (!candidate.includes(':')) return false
  const groups = candidate.split(':').filter((g) => g !== '')
  if (groups.length < 2) return false
  if (!groups.every((g) => /^[0-9a-fA-F]{1,4}$/.test(g))) return false
  // 关键判据：时间戳（16:11:22）与 MAC（a4:83:e7:11:22:33）**每组都 ≤2 位**。
  // 真实 IPv6 几乎总有一组是 3~4 位，要求"至少一组 >2 位"即可滤掉它们。
  if (!groups.some((g) => g.length > 2)) return false
  const compressed = candidate.includes('::')
  if (compressed) return candidate.length >= 10
  return groups.length >= 6
}

/** 在一段文本里找出违规地址。返回 [{ value, family }]。 */
export function findPublicIps(text) {
  const out = []
  for (const m of text.matchAll(IPV4_RE)) {
    if (!ipv4Allowed(m[1])) out.push({ value: m[1], family: 'ipv4' })
  }
  for (const re of [IPV6_RE, IPV6_MAPPED_RE]) {
    for (const m of text.matchAll(re)) {
      const v = m[1]
      // 映射/兼容形式（含内嵌 IPv4）：前缀很短，形状判据不适用，直接交给 ipv6Allowed
      if (!v.includes('.') && !looksLikeIpv6(v)) continue
      if (!ipv6Allowed(v)) out.push({ value: v, family: 'ipv6' })
    }
  }
  return out
}

/** 二进制与超大文件跳过（CI 上的图片等）。 */
function looksBinary(buf) {
  const sample = buf.subarray(0, 8192)
  return sample.includes(0)
}

/* ------------------------------ 取内容 ------------------------------ */

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 })
}

/** 全仓已跟踪文件（CI 模式）。 */
function trackedFiles() {
  return git(['ls-files', '-z']).split('\0').filter(Boolean)
}

/** 暂存内容（pre-commit 模式）：读 index 里的 blob，而不是工作区（部分暂存才准）。 */
function stagedFiles() {
  return git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']).split('\0').filter(Boolean)
}

function readStaged(path) {
  try {
    return execFileSync('git', ['show', `:${path}`], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  } catch {
    return null
  }
}

/* ------------------------------ 主流程 ------------------------------ */

const argv = process.argv.slice(2)
const has = (flag) => argv.includes(flag)
const valueOf = (flag) => {
  const i = argv.indexOf(flag)
  return i >= 0 ? argv[i + 1] : undefined
}

/** 自检：把分类器和边界条件钉死（CI 跑，防止闸门自己被改坏）。 */
function selfTest() {
  const cases = [
    // [文本, 期望违规数, 说明]
    ['tcp4 0 0 192.168.0.1.52344 1.2.3.4.443 ESTABLISHED', 0, '私网 + 占位符'],
    ['hello 10.0.0.5 world', 0, '10/8'],
    ['host 172.16.3.9', 0, '172.16/12'],
    ['127.0.0.1', 0, '回环'],
    ['169.254.1.1', 0, '链路本地'],
    ['100.64.0.1', 0, 'CGN'],
    ['0.0.0.0', 0, '未指定'],
    ['192.0.2.10', 0, 'RFC5737 文档段'],
    ['203.0.113.9', 0, 'RFC5737 文档段'],
    ['198.51.100.7', 0, 'RFC5737 文档段'],
    ['<path d="M11.2 2.9l1.9 1.9-7.3 7.3-2.4.5.5-2.4z"/>', 0, 'SVG 坐标不得误判'],
    ['version 1.2.3.4.5', 0, '五段数字不是 IP'],
    ['1.2.3.4.5.6', 0, '多段数字不是 IP'],
    ['203.0.114.1', 1, '公网'],
    ['9.9.9.9', 1, '真实公网（本次事故的那个）'],
    ['8.8.8.8', 1, '公共 DNS'],
    ['1.1.1.1', 1, '公共 DNS'],
    ['2001:db8::1', 0, 'IPv6 文档段'],
    ['::1', 0, 'IPv6 回环'],
    ['fc00::1', 0, 'IPv6 ULA'],
    ['2606:4700::1111', 1, 'IPv6 公网'],
    // —— 假阳性回归（本闸门第一版就栽在这里；宽松的 IPv6 正则把时间戳/MAC 全刷成违规）——
    ['2026-09-09 16:11:22 +0800 CST', 0, '时间戳 HH:MM:SS'],
    ["16:11:34,150 |INFO in ...", 0, '时间戳 + 毫秒'],
    ['MacAddress: 02:42:ac:14:00:03', 0, 'Docker MAC'],
    ['a4:83:e7:11:22:33', 0, '网卡 MAC'],
    ['aa:bb:cc:dd:ee:ff', 0, '全同字符 MAC'],
    ['09:00:00', 0, '纯时间'],
    ['{"updatedAt":"13:38:54"}', 0, 'JSON 里的时间'],
  ]
  let failed = 0
  for (const [text, expected, label] of cases) {
    const got = findPublicIps(text).length
    if (got !== expected) {
      failed += 1
      console.error(`  ✘ ${label}: 期望 ${expected} 处违规，实得 ${got} —— ${JSON.stringify(text)}`)
    }
  }
  if (failed > 0) {
    console.error(`✘ [check-no-public-ip] 自检失败 ${failed} 项`)
    process.exit(1)
  }
  console.log(`✓ [check-no-public-ip] 自检通过（${cases.length} 项）`)
  process.exit(0)
}

if (has('--self-test')) selfTest()

const violations = []

/** 扫一段文本，记录违规。 */
function scan(content, where, label) {
  if (content === null) return
  // 二进制按 NUL 判（图片等）
  if (content.includes('\0')) return
  for (const hit of findPublicIps(content)) {
    // 行号（提交信息给 "msg"）
    const line = content.slice(0, content.indexOf(hit.value)).split('\n').length
    violations.push({ where: label ? `${where} (${label})` : `${where}:${line}`, value: hit.value })
  }
}

/** 该路径是否豁免（闸门自身的自检夹具）。 */
function isExempt(path) {
  return SELF_EXEMPT.has(path.replace(/^\.\//, ''))
}

if (has('--message-file')) {
  const file = valueOf('--message-file')
  if (file === undefined) {
    console.error('✘ [check-no-public-ip] --message-file 需要一个路径')
    process.exit(2)
  }
  // 提交信息允许以 # 开头的注释行——git 会剥掉它们，不必扫
  const text = readFileSync(file, 'utf8').split('\n').filter((l) => !l.startsWith('#')).join('\n')
  scan(text, file, '提交信息')
} else if (has('--staged')) {
  for (const path of stagedFiles()) {
    if (isExempt(path)) continue
    const content = readStaged(path)
    if (content === null || looksBinary(Buffer.from(content))) continue
    scan(content, path)
  }
} else {
  for (const path of trackedFiles()) {
    if (isExempt(path)) continue
    let content
    try {
      content = readFileSync(join(root, path), 'utf8')
    } catch {
      continue
    }
    if (looksBinary(Buffer.from(content))) continue
    scan(content, path)
  }
}

if (violations.length > 0) {
  console.error('[check-no-public-ip] 发现公网 IP 地址（不得入库）：')
  for (const v of violations.slice(0, 40)) console.error(`  ${v.where}  →  ${v.value}`)
  if (violations.length > 40) console.error(`  …共 ${violations.length} 处`)
  console.error('')
  console.error('为什么拦：这类地址一旦进了历史，清理要重写全部历史（所有 sha 变化、文档引用失效、')
  console.error('远端须 force push）——所以必须在入口拦。')
  console.error('怎么办：')
  console.error('  · 文档与测试夹具请用 RFC 5737 文档网段：192.0.2.0/24、198.51.100.0/24、203.0.113.0/24')
  console.error('  · 内网环境用私网段（10/8、172.16/12、192.168/16）')
  console.error('  · 确属必要的占位符，才在 scripts/check-no-public-ip.mjs 的 PLACEHOLDERS 里显式加')
  process.exit(1)
}

console.log('[check-no-public-ip] 通过：未发现公网 IP 地址')
