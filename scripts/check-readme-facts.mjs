#!/usr/bin/env node
/**
 * 防回归：**README 里写了数字，就必须把权威常量名写在旁边**；写了常量名，数字就要对得上。
 *
 * ## 为什么要有这道闸
 *
 * 2026-10-13 ~ 10-18，`loglens` 连做三十余刀，README **几乎没回头改过**：`c58a42ced` 一次清出
 * **20 处过期陈述**（L0 三处还写着「查询未实现」）。查 git 历史，近 80 条提交里**改包代码的
 * 59 条，其中 19 条（32%）没改对应 README**——不是某个包的问题，是系统性的。
 *
 * 根因不是谁偷懒：`scripts/docs-index.mjs` 只管包清单对账与 ROADMAP 落地记录的位置，**不读
 * README 正文**（它文件头明说「地图是读者视图」，刻意不管）。于是 README 里的数字是否还成立，
 * 全靠写代码的人记得回头改。而**没有守卫的规矩会在下一次改动里漂掉**——这句是本仓自己的判据。
 *
 * ## 判据（两条，都只认能静态算的数）
 *
 * 1. **数量对得上**：README 里写成 `` `CONST`（N） `` / `` `CONST` = N `` / `` `CONST` N  `` 的，
 *    `N` 必须等于源码里 `CONST` 的值（支持纯数字与 `a * b` 这类能静态求值的乘式）。
 * 2. **漂了要说话**：常量值改了而 README 还写着旧值 → 报「旧值」；README 写了数却没写常量名 →
 *    不算违规（散文里描述「最多 4 列」是正常的），但**一旦写了常量名，数字就必须对**。
 *
 * 刻意**不**做的（取舍，不是漏）：
 *   · 不检查「该写而没写」——那需要判断哪句话是「技术事实」，机器判不准，硬判只会制造误报。
 *     这一条靠 [docs/conventions.md § 提交](../docs/conventions.md#提交) 的提交规矩 + 评审兜。
 *   · 不解析 TS 表达式（`Number.POSITIVE_INFINITY` / 数组 / 字符串）——那些没有「一个数字」可说。
 *   · 不查散文语气、章节顺序。
 *
 * ## 用法
 *
 *   node scripts/check-readme-facts.mjs                # 全仓（CI 用）
 *   node scripts/check-readme-facts.mjs --staged       # 只查暂存（pre-commit 用）
 *   node scripts/check-readme-facts.mjs --self-test    # 自检分类器（反例必须变红）
 *
 * ## 只读
 *
 * 本模块不写文件、不联网；`--staged` 只读 `git diff --cached` 的文件清单。输入是**文本**，
 * 所以单测能喂 fixture 造反例，不必改动受版本控制的文件。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 包源码目录：常量只从这两处找（`lib/` 是产物，`test/` 是夹具）。 */
export const SOURCE_DIRS = ['src', 'client-src']

/**
 * README 里「常量名 + 数值」的三种写法，按出现顺序匹配。
 *
 * 为什么认这三种：它们是写文档时自然会用的形态，而不是为了过闸门发明的语法——
 * 要求写得别扭的判据，最后一定被人绕过去。
 */
export const PAIR_PATTERNS = [
  // `CONST`（16） / `CONST`(16) —— 中文括号与英文括号都收
  /`([A-Z][A-Z0-9_]{2,})`\s*[（(]\s*([0-9][0-9,_.]*)\s*[）)]/gu,
  // `CONST` = 16 / `CONST`=16
  /`([A-Z][A-Z0-9_]{2,})`\s*=\s*([0-9][0-9,_.]*)/gu,
  // `CONST` 16（空格分隔，数字紧跟）
  /`([A-Z][A-Z0-9_]{2,})`\s+([0-9][0-9,_.]*)(?![0-9])/gu,
  /**
   * **数字在前、常量名在后的括号形态**：`最多 4 列（`RESULT_COLUMN_MAX`）`、
   * `340px 浮层（`FIELD_PANEL_WIDTH`）`、`超过 2 万字符（`RAW_PREVIEW_MAX`）`。
   *
   * 为什么必须收这一种：中文技术文档**天然**先给结论再给依据，这一形态是写「数字 + 出处」时
   * 最顺手的写法。第一版漏了它——而漏掉的后果是**静默的**：配对抽不到 → 没有比对 →
   * 闸门恒绿。实测：loglens 自己的 README 六处全是这个写法，第一版一条都没抽到。
   * 这正是「闸门命中数为 0 时比没有更坏」那条判据在本闸门上的实例。
   *
   * 数字与前缀之间允许少量非括号字符（单位 / 量词：`px`、`列`、`万字符`、`MiB`），
   * 上限 12 个字符：再长就不是「这个数说的就是它」了。
   */
  /([0-9][0-9,_.]*)\s*([^（(\n]{0,12})[（(]\s*`([A-Z][A-Z0-9_]{2,})`\s*[）)]/gu,
]

/** 把 `1_000` / `20,000` 这类写法读成数。 */
export function parseNumber(text) {
  const clean = String(text).replace(/[,_]/gu, '')
  if (!/^[0-9]+(?:\.[0-9]+)?$/u.test(clean)) return undefined
  const value = Number(clean)
  return Number.isFinite(value) ? value : undefined
}

/**
 * 把中文量级词并进数值：`2 万字符` → 20000、`1.5 万` → 15000。
 *
 * 为什么必须处理：中文技术文档写「2 万字符」比「20000 字符」自然得多，而闸门如果只认阿拉伯
 * 数字，就会把这条**误判成漂移**（实测：`RAW_PREVIEW_MAX` 被读成 2 而源码是 20000）。
 * 误报比漏报更糟——被误报几次之后，闸门一定被人削弱或关掉。
 *
 * 只在**数字紧跟量级词**时生效（词必须在 upTo 里），避免把「4 列」里的「列」当成量级。
 */
function applyMagnitude(value, between) {
  if (value === undefined) return undefined
  const text = String(between === undefined ? '' : between).replace(/\s+/gu, '')
  if (text.startsWith('万')) return value * 10_000
  if (text.startsWith('亿')) return value * 100_000_000
  if (text.startsWith('千')) return value * 1_000
  return value
}

/**
 * 静态求值一个常量表达式；求不出来返回 undefined。
 *
 * 只认**纯数字与四则运算**（乘式最常见：`8 * 1024 * 1024`、`24 * 60 * 60 * 1000`）。
 * 求不出来就是「这个常量没有单一数值可说」，不参与比对。
 */
export function evaluateConstant(expr) {
  const source = String(expr).trim().replace(/_/gu, '')
  if (source === '') return undefined
  if (!/^[0-9+\-*/ ().]+$/u.test(source)) return undefined
  try {
    // 只喂了上面白名单里的字符，且来自本仓源码——不是为了执行不可信输入
    const value = Function('"use strict";return (' + source + ')')()
    return Number.isFinite(value) ? value : undefined
  } catch {
    return undefined
  }
}

/**
 * 从一个包的源码里抽出「常量名 → 数值」。
 *
 * 只认 `export const NAME = <能静态算的表达式>`。非导出常量不算：它们不是对外承诺的一部分。
 *
 * @returns Map<string, { value: number, file: string, line: number }>
 */
export function collectConstants(readFile) {
  const found = new Map()
  for (const file of readFile.list()) {
    const text = readFile.read(file)
    let line = 0
    for (const raw of text.split('\n')) {
      line += 1
      const match = /^\s*export const ([A-Z][A-Z0-9_]*)\s*=\s*(.+?)\s*$/u.exec(raw)
      if (match === null) continue
      const value = evaluateConstant(match[2])
      if (value === undefined) continue
      if (found.has(match[1])) continue // 同名以第一次出现为准（`export const` 不会重复定义）
      found.set(match[1], { value, file, line })
    }
  }
  return found
}

/**
 * 从一份 README 文本里抽出「提到的常量名 + 它旁边的数」。
 *
 * @returns Array<{ name: string, value: number, raw: string }>
 */
export function extractReadmePairs(text) {
  const pairs = []
  for (const [index, pattern] of PAIR_PATTERNS.entries()) {
    // 每次用新的正则实例：带 `g` 的字面量有 lastIndex 状态，复用会漏匹配
    const re = new RegExp(pattern.source, pattern.flags)
    // 最后一条是「数字在前、常量名在后」，组号相反；其余都是「名字在前」
    const reversed = index === PAIR_PATTERNS.length - 1
    for (const match of String(text).matchAll(re)) {
      if (reversed) {
        // 组：1 = 数字，2 = 数字与括号之间的量词（可能是「万」这类量级词），3 = 常量名
        const value = applyMagnitude(parseNumber(match[1]), match[2])
        if (value === undefined) continue
        pairs.push({ name: match[3], value, raw: match[0] })
        continue
      }
      const value = parseNumber(match[2])
      if (value === undefined) continue
      pairs.push({ name: match[1], value, raw: match[0] })
    }
  }
  return pairs
}

/**
 * 核对一份 README 与它所属包的常量表。
 *
 * @returns 差异数组（空 = 通过）。每条都带文件名与「旧值 / 应为」，红的时候要能一眼改。
 */
export function checkReadmeFacts({ readmePath, packageName, text, constants }) {
  const diffs = []
  for (const pair of extractReadmePairs(text)) {
    const known = constants.get(pair.name)
    if (known === undefined) {
      // README 引用的常量名在本包源码里找不到——可能是别的包的常量（合法，不判），
      // 也可能是已经改名/删除的死引用（该判）。两种分不开，所以只在下一条 --strict 里管。
      continue
    }
    if (known.value !== pair.value) {
      diffs.push({
        kind: 'readme.fact.stale',
        packageName,
        readmePath,
        message:
          `${readmePath}：\`${pair.name}\` 写的是 ${String(pair.value)}，` +
          `而 ${relative(process.cwd(), known.file) || known.file}:${String(known.line)} 里它是 ${String(known.value)}——两处已经漂了`,
      })
    }
  }
  return diffs
}

/** 遍历仓库里所有包（有 package.json 的目录）。 */
export function listPackages(root = REPO_ROOT, readDir = readdirSync) {
  const base = join(root, 'packages')
  if (!existsSync(base)) return []
  return readDir(base)
    .filter((name) => existsSync(join(base, name, 'package.json')))
    .sort()
}

/** 读一个包的源码文件清单（只读 SOURCE_DIRS，跳过测试与产物）。 */
function sourceFileLister(pkgDir) {
  const files = []
  for (const dir of SOURCE_DIRS) {
    const abs = join(pkgDir, dir)
    if (!existsSync(abs)) continue
    walk(abs, files)
  }
  return files
}

function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'test' || entry.name === 'lib') continue
      walk(abs, out)
      continue
    }
    if (!/\.(ts|js|mjs|cjs)$/u.test(entry.name)) continue
    out.push(abs)
  }
}

/**
 * 全仓核对。
 *
 * @param options.root 仓库根（测试可传 fixture 目录）
 * @param options.only 只查这些包（`--staged` 用）
 */
export function checkRepo({ root = REPO_ROOT, only } = {}) {
  const diffs = []
  const packages = listPackages(root)
  const wanted = only === undefined ? packages : packages.filter((name) => only.has(name))
  for (const name of wanted) {
    const pkgDir = join(root, 'packages', name)
    const files = sourceFileLister(pkgDir)
    const constants = collectConstants({
      list: () => files,
      read: (file) => readFileSync(file, 'utf8'),
    })
    if (constants.size === 0) continue
    for (const readme of ['README.md', 'README.en.md']) {
      const readmePath = join(pkgDir, readme)
      if (!existsSync(readmePath)) continue
      diffs.push(
        ...checkReadmeFacts({
          readmePath: relative(root, readmePath),
          packageName: name,
          text: readFileSync(readmePath, 'utf8'),
          constants,
        }),
      )
    }
  }
  return diffs
}

/**
 * 自检：一份**合成的**包里塞进每一类违规，断言分类器全部抓到。
 *
 * 为什么自带而不是全靠单测：pre-commit / CI 跑本脚本时**没有 vitest 环境**，
 * 自检必须能在裸 Node 下证明「我还能红」。
 */
export function selfTest() {
  const failures = []
  const check = (label, ok) => {
    if (!ok) failures.push(label)
  }

  // ① 正确配对 → 不报
  {
    const diffs = checkReadmeFacts({
      readmePath: 'x/README.md',
      packageName: 'x',
      text: '最多 `RESULT_COLUMN_MAX`（4）列。',
      constants: new Map([['RESULT_COLUMN_MAX', { value: 4, file: 'a.ts', line: 1 }]]),
    })
    check('正确配对不该报', diffs.length === 0)
  }
  // ② 旧值 → 报
  {
    const diffs = checkReadmeFacts({
      readmePath: 'x/README.md',
      packageName: 'x',
      text: '最多 `RESULT_COLUMN_MAX`（3）列。',
      constants: new Map([['RESULT_COLUMN_MAX', { value: 4, file: 'a.ts', line: 1 }]]),
    })
    check('旧值必须报', diffs.length === 1 && diffs[0].kind === 'readme.fact.stale')
  }
  // ③ 等号写法
  {
    const diffs = checkReadmeFacts({
      readmePath: 'x/README.md',
      packageName: 'x',
      text: '`FIELD_PANEL_WIDTH` = 340',
      constants: new Map([['FIELD_PANEL_WIDTH', { value: 340, file: 'a.ts', line: 1 }]]),
    })
    check('等号写法正确时不该报', diffs.length === 0)
  }
  // ④ 千分位与下划线写法
  {
    const diffs = checkReadmeFacts({
      readmePath: 'x/README.md',
      packageName: 'x',
      text: '原文超过 `RAW_PREVIEW_MAX`（20,000）字符',
      constants: new Map([['RAW_PREVIEW_MAX', { value: 20000, file: 'a.ts', line: 1 }]]),
    })
    check('千分位写法不该报', diffs.length === 0)
  }
  // ⑤ 源码里的乘式要能算出来
  {
    check('8*1024*1024 应算成 8388608', evaluateConstant('8 * 1024 * 1024') === 8388608)
    check('下划线数字应算成 20000', evaluateConstant('20_000') === 20000)
    check('不可算的表达式返回 undefined', evaluateConstant('Number.POSITIVE_INFINITY') === undefined)
  }
  // ⑥ 数字在前、常量名在后的括号形态（中文文档最常见的写法）
  {
    const pairs = extractReadmePairs('最多 4 列（`RESULT_COLUMN_MAX`）。')
    check('数字在前形态必须抽到', pairs.length === 1 && pairs[0].name === 'RESULT_COLUMN_MAX' && pairs[0].value === 4)
    const diffs = checkReadmeFacts({
      readmePath: 'x/README.md',
      packageName: 'x',
      text: '最多 3 列（`RESULT_COLUMN_MAX`）。',
      constants: new Map([['RESULT_COLUMN_MAX', { value: 4, file: 'a.ts', line: 1 }]]),
    })
    check('数字在前形态的旧值必须报', diffs.length === 1)
  }
  // ⑦ 没写常量名 → 不报（刻意不管）
  {
    const diffs = checkReadmeFacts({
      readmePath: 'x/README.md',
      packageName: 'x',
      text: '最多 4 列。',
      constants: new Map([['RESULT_COLUMN_MAX', { value: 4, file: 'a.ts', line: 1 }]]),
    })
    check('没写常量名不该报', diffs.length === 0)
  }
  return failures
}

/* ------------------------------ CLI ------------------------------ */

/** `--staged` 时从 git 拿暂存文件，推出涉及的包名。 */
function stagedPackages(root) {
  const out = execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: root, encoding: 'utf8' })
  const names = new Set()
  for (const line of out.split('\n')) {
    const match = /^packages\/([^/]+)\//u.exec(line)
    if (match !== null) names.add(match[1])
  }
  return names
}

if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--self-test')) {
    const failures = selfTest()
    if (failures.length > 0) {
      console.error('✘ [check-readme-facts] 自检失败：')
      for (const item of failures) console.error('  · ' + item)
      process.exit(1)
    }
    console.log('[check-readme-facts] 自检通过：正确配对不报、旧值报、乘式可算、无常量名不报')
    process.exit(0)
  }

  const staged = process.argv.includes('--staged')
  const only = staged ? stagedPackages(REPO_ROOT) : undefined
  const diffs = checkRepo({ only })
  if (diffs.length > 0) {
    console.error('[check-readme-facts] README 与源码常量已经漂了：')
    for (const diff of diffs) console.error('  ' + diff.message)
    console.error('')
    console.error('README 里写的数要和源码常量对得上；改常量时同一提交里改 README。')
    console.error('判据见 docs/conventions.md § 提交；本闸门文件头有完整口径。')
    process.exit(1)
  }
  console.log(
    staged
      ? `[check-readme-facts] 通过（暂存区涉及的 ${String(only.size)} 个包）`
      : '[check-readme-facts] 通过：README 里的常量数字与源码一致',
  )
}
