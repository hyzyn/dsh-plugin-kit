#!/usr/bin/env node
/**
 * 防回归：仓库里（**文件内容与提交信息**）不得出现真实的内部标识。
 *
 * ## 为什么还要一道闸（已经有一道 `check-no-public-ip`）
 *
 * 那道闸拦的是**公网 IP**——因为公网地址进历史要重写全部历史才能清。但实测下来泄露的
 * 从来不是公网地址：是内网**服务名**、**项目代号**、**账号**、**私网主机号**。这一类没有
 * 任何守卫，于是同一个坑反复出现：
 *
 *   - `92f01eaf6`（2026-10-12）清过一轮 loglens 的服务名 / 主机名 / 项目代号；
 *   - 一周后的 `768b7720b` 又把同类的名字写回了测试夹具与 ROADMAP。
 *
 * 靠「记得脱敏」是不成立的——**没有守卫的规矩会在下一次改动里漂掉**。所以这道闸的判据
 * 不是「像不像敏感」，而是「是不是那批已知的真名」：清单短、判定确定、零假阳性。
 *
 * ## 清单为什么是**哈希**而不是明文
 *
 * 这道闸本身也入库。把真名写在闸里 = 换个地方泄露（而且是永久留在文件里、连注释都发光）。
 * 所以词表只存 `sha256(小写去空格)`：闸能判「这段文本是不是那批名字之一」，但读它的人
 * 拿不到名字。维护者要确认某个词在不在表里，用 `--hash`（见用法）——**不要**为了好读
 * 把明文加回来。
 *
 * ## 加词的门槛
 *
 * 新加一条 = 承认「这个词一旦入库就是泄露」。所以只加**确属内部资产**的名字：
 *   - 内网服务名 / 容器名（如那批业务服务）
 *   - 项目代号（内部叫法，不是产品名）
 *   - 登录账号、内网主机名、内网主机号
 *
 * **不加**：公开产品名与技术名词（`Parallels` / `nginx` / `prometheus` 这类）——它们会
 * 在文档里合法出现几十次，加进来等于把闸变成噪声，而一道总在报假警的闸最后一定被绕过。
 * 同理不加泛化的账号词（`root` / `ubuntu` / `deploy`），它们在本仓都是占位夹具。
 *
 * 用法：
 *   node scripts/check-internal-identifiers.mjs                  # 全仓已跟踪文件（CI 用）
 *   node scripts/check-internal-identifiers.mjs --staged         # 只查暂存内容（pre-commit 用）
 *   node scripts/check-internal-identifiers.mjs --message-file X # 查提交信息（commit-msg 用）
 *   node scripts/check-internal-identifiers.mjs --self-test      # 自检分类器（CI 用）
 *   node scripts/check-internal-identifiers.mjs --hash <文本>    # 算一个候选词的哈希（维护用）
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/* ------------------------------------------------------------------ *
 * 词表：只存哈希。加词之前先读文件头「加词的门槛」。
 * ------------------------------------------------------------------ */

/**
 * 禁词哈希表（`sha256(小写)`）。**按组维护**，组名说明这一批是什么性质——组名本身也要中性，
 * 不能反过来把名字泄出来。
 */
const BANNED_HASHES = new Set([
  /*
   * 自检锚点：`guard-anchor-7c1e` 是**人为造的假词**，不对应任何真实资产。
   *
   * 为什么词表里要留一条假词：自检必须能验证「**默认**词表这条路真的接上了」。
   * 只验「注入一张临时表能命中」是不够的——实测过一次：把默认参数改成空表，
   * 自检照样全绿、全仓扫描也照样「通过」，闸门静默失效。留一条已知锚点才能反证。
   */
  '99f104eb8ce2a897ef04d87b5fb9df4fae57da82c4356e28bee0fa66bd947a50',
  // —— 内网业务服务名（2026-10-12 与 2026-10-18 两轮清过的那批）——
  '5e53c9d0e5d82ef1c49e50bbe90d2cb96bce746af3375354c79f87d572eeacf7',
  '529a4e9a0b02bd556c705dbf431fc0d0b1e1a630bffda1566e16a6ac63cbdf9d',
  '649cd7abe126b2bd14f5c5dbe517bb1bb7025b5301ea597518a4c54d99c52e6d',
  '9de4eb6c69a4fad6eb3ce2654073a198a6d38a315086f1b162dbad733bd26fb5',
  '113be0b0303a7cf75aafec850e94a615b7831b2107eb179bccb100b7a27d10d8',
  '8053357c453db60530993c7af8b36be65369f412acaac2d0b4797259d777ab18',
  // —— 服务名带组织前缀的完整形态（脱敏前的原文，最容易在粘贴真机日志时回流）——
  '07f11d87831ad128d5b1e1e0418ae5c0fa0b55479f94d2613a4b817a2230908f',
  'fb287b81d70f0db824440b8aaaea1a4f4955b186787472e0e9dbca431c3162e3',
  '63fa3151977a84f2bb2bb644106be897bb3770f240a8639ff9b3319e2279313c',
  '41102d4281754fd7261e411325c4b62b07dee5a8d996f92c5c90c49989e29e3b',
  // —— 内网项目代号（不是产品名）——
  'dcdbca10b6fbfce2e5c6969e9cdce03e04df14b5e9297fcd349ba0f04b6ab4f9',
  '1173a4a8cf045eafa48eef51105aca6d39e8924d14f1af76497fd97b44ead867',
  '5ab93f91bddd0eced274e1ab9c5e29dda71107250e770d9d8edebfd4e421e99b',
  // —— 登录账号 / 本机用户名 ——
  '4c41c66ed20546e7a734cdacb37c1c7bad84082d6fa713e2b400eaaea91eea34',
  '259763fdfa320e7cbcc3eb97184170d7dd6c7804909fb8826d0c1c006c057248',
  // —— 内网主机名 ——
  'cd831b95a77ae7ddc872f36b9c0d86a46bd1df6190ec1f8a7bf025693027eb1a',
  'ff902d20dcb17bc818e5bbf6c8a91e5d63d032838871abffca0d8fb813924fa9',
  // —— 私网网段 / 主机号前缀（公网 IP 有另一道闸，这里补私网那半边）——
  '415c961f3b644fe4290c098642a37491577c0154cced6e5b9b55e84b0dd6819b',
  '76d7741eada2a369d93c67154453965088b2cd496016240302218daaf1158e8c',
])

/** 闸门自身的自检夹具与哈希工具必须豁免（夹具里会有故意构造的「禁词」）。 */
const SELF_EXEMPT = new Set(['scripts/check-internal-identifiers.mjs'])

/** 一个 token 最多这么多字符才参与切分（客户端产物是压缩过的，单 token 可能上万字符）。 */
const TOKEN_MAX = 64

/* ------------------------------------------------------------------ *
 * 纯逻辑（导出仅供 scripts/test/ 下的自检用例）
 * ------------------------------------------------------------------ */

/** 归一化 + 哈希（与词表同一口径）。 */
export function hashTerm(text) {
  return createHash('sha256').update(String(text).trim().toLowerCase()).digest('hex')
}

/**
 * 从一个 token 生成所有「连续片段」候选（按 `-` / `.` / `_` 切段，取原文子串）。
 *
 * 为什么取**原文子串**而不是「用 `-` 重新拼」：词表里有混用分隔符的形态（连字符与点混着写），
 * 用单一分隔符重拼会拼出**原文里不存在**的形式，那种词就永远匹配不到。
 *
 * 边界语义：短名被粘进更长的标识符时**不命中**（切段后是完整一段，不会退化成子串匹配）。
 * 这是有意的——宁可漏掉「粘连变体」，也不要让闸门在正常标识符上乱报。
 *
 * 长度预算按**片段**算而不是按 token 算：压缩产物里 token 可以上万字符（`a.b.c.…` 那种），
 * 但词表里的词全部 ≤ 20 字符。所以「整条 token 超长就跳过」会开一个盲区（长 token 里藏一个
 * 真名就漏了）；正确做法是从每个段起点出发、只延伸到预算内的位置。复杂度是 O(n × k)，
 * k = 64 字符内能装下的段数，与 token 总长无关。
 *
 * 注意：本函数的注释里也**不许**举真实例子——这个文件虽然豁免扫描（要放自检锚点），
 * 但它同样是公开仓库里的一份文本。
 */
export function candidateSpans(token) {
  const text = String(token)
  if (text.length === 0) return []
  // 段边界：每个分隔符之后的起始位置
  const starts = [0]
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '-' || text[i] === '.' || text[i] === '_') starts.push(i + 1)
  }
  const spans = []
  for (let a = 0; a < starts.length; a += 1) {
    for (let b = a; b < starts.length; b += 1) {
      const end = b + 1 < starts.length ? starts[b + 1] - 1 : text.length
      if (end <= starts[a]) continue
      // 片段超预算就停：再往后只会更长（禁词都远短于预算）
      if (end - starts[a] > TOKEN_MAX) break
      // 带回**在 token 里的偏移**：行号要按真实命中位置算，不能拿「首次出现」凑
      spans.push({ text: text.slice(starts[a], end), index: starts[a] })
    }
  }
  return spans
}

/**
 * 在一段文本里找禁词。返回 `[{ token, hash, index }]`（按哈希去重；`index` 是命中处在这段
 * 文本里的**字符偏移**，行号据它算——拿 `indexOf(token)` 会在同一个词出现多次时指错行）。
 *
 * `banned` 可注入，只为自检用真正的「运行期才知道」的假词。**默认表在函数体里取**
 * （而不是写成默认参数）：默认参数可以被悄悄改成空表而自检毫无反应——这种失效形态实测过，
 * 见词表里那条自检锚点的注释。
 */
export function findInternalIdentifiers(text, banned) {
  const table = banned ?? BANNED_HASHES
  const out = []
  const seen = new Set()
  // token 的字符集刻意与标识符一致：分隔符进不了 token，所以切段是可靠的
  for (const match of String(text).matchAll(/[A-Za-z0-9][A-Za-z0-9_.-]*/g)) {
    for (const span of candidateSpans(match[0])) {
      const hash = hashTerm(span.text)
      if (!table.has(hash) || seen.has(hash)) continue
      seen.add(hash)
      out.push({ token: span.text, hash, index: match.index + span.index })
    }
  }
  return out
}

/* ------------------------------ 取内容 ------------------------------ */

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 })
}

function trackedFiles() {
  return git(['ls-files', '-z']).split('\0').filter(Boolean)
}

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

function looksBinary(buf) {
  return buf.subarray(0, 8192).includes(0)
}

/* ------------------------------ 主流程 ------------------------------ */

/**
 * 主流程只在**直接执行**时跑（单测会 import 本模块来测 `candidateSpans` / `findInternalIdentifiers`）。
 * 不做这道判断的后果不是「输出难看」：扫描与自检都会 `process.exit()`，而它们是在 import 期间
 * 跑的——测试进程会被直接打死（与 `check-i18n.mjs` 同一处教训，那边写在 `invokedDirectly` 上）。
 */
const invokedDirectly = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (invokedDirectly) run()

function run() {
const argv = process.argv.slice(2)
const has = (flag) => argv.includes(flag)
const valueOf = (flag) => {
  const i = argv.indexOf(flag)
  return i >= 0 ? argv[i + 1] : undefined
}

/** 维护用：算一个候选词的哈希，方便判断它在不在表里（**不是**把明文加回去的入口）。 */
if (has('--hash')) {
  const text = valueOf('--hash')
  if (text === undefined) {
    console.error('✘ [check-internal-identifiers] --hash 需要一个文本参数')
    process.exit(2)
  }
  const hash = hashTerm(text)
  console.log(`${hash}  ${BANNED_HASHES.has(hash) ? '（**在**禁词表里）' : '（不在表里）'}`)
  process.exit(0)
}

/** 自检锚点的明文（对应词表里那条假词；**不是**任何真实资产）。 */
const ANCHOR_WORD = 'guard-anchor-7c1e'

/** 自检：把切段 / 边界 / 大小写 / 注入四件事钉死（CI 跑，防止闸门自己被改坏）。 */
function selfTest() {
  /*
   * 自检**不能**依赖真实禁词（那等于把明文写回来）。做法：在运行期造一个假词并哈希，
   * 注入成临时词表——机制被验到了，文件里一个真名都没有。
   */
  const fake = 'probe-internal-9f3a'
  const table = new Set([hashTerm(fake)])
  const cases = [
    // [文本, 期望命中数, 说明]
    [`常驻 ${fake} 服务`, 1, '整词命中'],
    [`常驻 ${fake.toUpperCase()} 服务`, 1, '大小写不敏感'],
    [`prefix-${fake}-suffix`, 1, '被连字符粘在长名字里也要认出来'],
    [`${fake}.example`, 1, '被点粘住也要认出来'],
    [`${fake}2`, 0, '粘成别的标识符就不算（边界语义：宁漏不误报）'],
    ['probe-internal', 0, '只命中前缀片段不算'],
    ['app-svc-1 / prometheus / nginx', 0, '中性名字一个字都不许报'],
    ['10.0.0.5 / 192.0.2.10 / example.test', 0, '占位地址不许报'],
    ['', 0, '空串不炸'],
    [`${'x'.repeat(200)}`, 0, '超长单段 token 不产出片段'],
  ]
  let failed = 0
  for (const [text, expected, label] of cases) {
    const got = findInternalIdentifiers(text, table).length
    if (got !== expected) {
      failed += 1
      console.error(`  ✘ ${label}: 期望 ${expected} 处，实得 ${got} —— ${JSON.stringify(text.slice(0, 60))}`)
    }
  }
  // 反例：默认词表**不是空的**（空表会让闸门静默变成装饰），且自检假词不在里面
  if (BANNED_HASHES.size < 10) {
    failed += 1
    console.error(`  ✘ 默认词表只有 ${BANNED_HASHES.size} 条——闸门等于装饰`)
  }
  if (BANNED_HASHES.has(hashTerm(fake))) {
    failed += 1
    console.error('  ✘ 自检假词混进了默认词表')
  }
  /*
   * 反例（这条是补的，起因见真事）：**默认词表这条路**必须真的接上。
   * 上面那些用例全都显式注入了临时表，所以「默认参数被改成空表」曾让自检全绿而闸门全失效。
   * 判据：不传第二参时，词表里那条自检锚点必须被认出来。
   */
  const anchor = findInternalIdentifiers(ANCHOR_WORD)
  if (anchor.length !== 1) {
    failed += 1
    console.error(`  ✘ 默认词表没接上：锚点词应命中 1 处，实得 ${String(anchor.length)} 处`)
  }
  if (failed > 0) {
    console.error(`✘ [check-internal-identifiers] 自检失败 ${failed} 项`)
    process.exit(1)
  }
  console.log(`✓ [check-internal-identifiers] 自检通过（${cases.length} 项 + 默认词表 ${BANNED_HASHES.size} 条）`)
  process.exit(0)
}

if (has('--self-test')) selfTest()

const violations = []

function scan(content, where, label) {
  if (content === null) return
  if (content.includes('\0')) return
  for (const hit of findInternalIdentifiers(content)) {
    // 行号按**命中点的真实偏移**算：同一个词出现多次时，拿 indexOf 会全部指到第一处
    const line = content.slice(0, hit.index).split('\n').length
    violations.push({ where: label ? `${where} (${label})` : `${where}:${line}`, hash: hit.hash.slice(0, 12), token: hit.token })
  }
}

function isExempt(path) {
  return SELF_EXEMPT.has(path.replace(/^\.\//, ''))
}

if (has('--message-file')) {
  const file = valueOf('--message-file')
  if (file === undefined) {
    console.error('✘ [check-internal-identifiers] --message-file 需要一个路径')
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
  console.error('[check-internal-identifiers] 发现真实内部标识（不得入库）：')
  for (const v of violations.slice(0, 40)) console.error(`  ${v.where}  →  ${v.token}（词表命中 ${v.hash}）`)
  if (violations.length > 40) console.error(`  …共 ${violations.length} 处`)
  console.error('')
  console.error('为什么拦：本仓是**公开仓库**，内网服务名 / 项目代号 / 账号 / 主机号一旦入库，')
  console.error('就等于把内网结构写进公开文档；而历史已公开，清理只能靠重写（本仓不做）。')
  console.error('怎么办：')
  console.error('  · 服务名 / 容器名 → `app-svc-N`、`batch-job-a`（与既有夹具同一套口径）')
  console.error('  · 主机名 → `host-a.internal`；内网地址 → RFC 5737 文档网段（192.0.2.0/24 等）')
  console.error('  · 账号 → `operator` / `deploy` 这类显然是占位的写法')
  console.error('  · 真机脚本里的目标地址**不留默认值**，没给就整档 SKIP（先例：commit a2150d347）')
  console.error('  · 确属必要的新词才加进 scripts/check-internal-identifiers.mjs 的词表；')
  console.error('    加的是 `--hash <那个词>` 算出来的哈希，**不是明文**')
  process.exit(1)
}

console.log('[check-internal-identifiers] 通过：未发现真实内部标识')
}
