/**
 * 插件公告长度守卫 —— `packages/<pkg>/src` 里那 7 段会被注入 systemPrompt 的公告常量。
 *
 * ## 一、守什么
 *
 * 7 段公告（`TTY_GUIDANCE` / `ENV_GUIDANCE` / `MCP_GUIDANCE` / `PROMPT_GUIDANCE` /
 * `PROFILE_GUIDANCE` / `CODEGRAPH_GUIDANCE` / `LOGLENS_GUIDANCE`）每一段都由
 * `registerLiteralSection(...)` 注入 systemPrompt，**每一轮请求都在上下文里**。所以它们的
 * 长度不是「代码风格」，而是**每轮都要付一次的上下文成本**：历史上 tty 那段涨到过 579 字符，
 * 其余四段 421 / 340 / 306 / 268——五段加起来是一段不产生任何新能力的固定开销。
 *
 * 本文件钉两条：
 *
 * 1. **长度**：每段公告的静态拼接长度 ≤ `ANNOUNCEMENT_BUDGET`（250 字符）；
 * 2. **命中**：7 段必须**真的都被抽到**（数量 + 名字集合都断言）。少了这条，一个「扫描面为空
 *    的实现」会恒绿——本仓把「恒绿闸门」明确列在事故形状里（见 `docs/conventions.md` 的守卫
 *    纪律，以及 `scripts/check-test-collection.mjs` 文件头记的那次实测）。
 *
 * 表里是 **7 个**名字（不是 6 个）：任务书写「6 个」但列了 7 个名字，以名单为准。
 *
 * ## 二、为什么这么判（静态抽取，而不是跑一遍宿主）
 *
 * 思路与 `scripts/check-prompt-sections.mjs` 的判据 4（`checkSectionBudgets` /
 * `findBudgetViolationsInFile` / `collectSameFileConsts` / `resolveChainLength`）一致：
 *
 *   - 在 `packages/<pkg>/src` 下**递归**找源码，定位 `(export )?const <NAME>_GUIDANCE =`；
 *   - 右值按「`+` 链」解析：单引号 / 双引号 / 无插值模板字面量、跨行、夹注释都拼起来量；
 *   - 字面量长度按 JS 语义还原（`\n` 计 1、`\u{1F600}` 计 2——`.length` 的 UTF-16 口径）；
 *   - 遇到 `+` 链之外的东西（函数调用、标识符引用、import 进来的值、变量传入、`${}` 插值）
 *     就**跳过该条目**（弃权，不报错、也不猜长度）：那部分量不准，猜出来的数字比不量更坏。
 *
 * 为什么静态：起真宿主渲染一次 prompt 要 LLM 配置与几秒，而「这段常量有多长」是纯文本事实；
 * 代价是**绕过写法**拦不住（`const s = build();` 之类）——那种写法在本仓不会自然出现，它挡的
 * 是疏忽。
 *
 * 为什么是 250：这是「能力索引」的长度——能力名 + 卡片入口 + 何时别用，足够；再长就该进
 * 包 README / 设置卡片（模型动不了的东西写进每轮上下文只是白花钱）。**预算固定 250，不放宽**：
 * 实测 `LOGLENS_GUIDANCE` 是 247 字符（只剩 3 字符余量），`CODEGRAPH_GUIDANCE` 是 66 字符
 * ——余量小恰恰说明这条线是活的，不是摆设。
 *
 * ## 三、反例长什么样（没有反例的守卫会在下一次改动里漂掉）
 *
 * 反例一律用 `mkdtempSync(join(tmpdir(), ...))` 造**最小 fixture 仓库树**
 * （`packages/<pkg>/src/index.ts`），**不修改任何受版本控制的文件**，`afterEach` 里
 * `rmSync(..., { recursive: true, force: true })` 清掉：
 *
 *   - 300 字符的 `FOO_GUIDANCE` → 判红（点名、长度、预算、`file:line`）；
 *   - 恰好 250 字符 → 绿（预算是 `≤`，边界要能过）；
 *   - 多行 `+` 链（每段 150、总和 300）→ 红（**拼接后**再量）；
 *   - 无插值模板字面量 300 字符 → 红；
 *   - 函数调用 / 标识符引用 / import 值 / 插值模板 → 弃权（不误报）；
 *   - 扫描面为空（没有 `packages/`）→ 红（不是恒绿）。
 *
 * ⚠️ 反例里的 300 字符必须是**写进源码的字面量**（下面 `longLiteral(300)` 生成 300 个 `x`），
 * 不能写成 `'x'.repeat(300)`：`.repeat(...)` 是**函数调用形态**，按上面的判据它属于「弃权」，
 * 判红的是「长度超预算」而不是「弃权」。任务书里写的 `'x'.repeat(300)` 形态指的是「300 字符的
 * 常量」，参考写法见 `scripts/test/check-prompt-sections.test.ts` 的 `longLiteral`。
 *
 * ## 四、边界（刻意不做的）
 *
 *   - **名单固定 7 个**：仓里还有 `DOCKER_GUIDANCE`、`SEARCH_GUIDANCE` 等同类常量，但它们不在
 *     本守卫的名单里；抽取按名字过滤，所以加一个新公告要**先往表里加名字**（这也是一道闸：
 *     新公告不会被悄悄带进来）。
 *   - **只扫 `src`**：`packages/<pkg>/lib` 是入库的预构建产物，同一段常量在那儿还有一份，扫了
 *     会把命中数算成两倍。
 *   - **不做运行时验证**：公告真的被注入、注入后是否截断，属于宿主与 kit 的运行时时序，由
 *     `packages/*​/test/` 的用例与真机脚本负责；这里只回答「源码里这段有多长」。
 *   - **抽取逻辑放在本文件里**（而不是 `scripts/announcement-budget.mjs`）是因为本次改动的写
 *     范围只有这一个文件；但函数都 `export` 了、且都接受 `repoRoot`，将来要挂进 CI 可以直接
 *     import 过去，不必复制。
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, afterEach } from 'vitest'

/** 公告长度预算（字符）。固定值——「涨了就把预算调大」等于没有这条守卫。 */
export const ANNOUNCEMENT_BUDGET = 250

/** 入表名单（7 个，顺序即任务书里「依次在 packages/<pkg>/src/index.ts」的顺序）。 */
export const ANNOUNCEMENT_NAMES = [
  'TTY_GUIDANCE',
  'ENV_GUIDANCE',
  'MCP_GUIDANCE',
  'PROMPT_GUIDANCE',
  'PROFILE_GUIDANCE',
  'CODEGRAPH_GUIDANCE',
  'LOGLENS_GUIDANCE',
] as const

export type AnnouncementName = (typeof ANNOUNCEMENT_NAMES)[number]

/** 每段公告归属的包（把「抽到了」从「仓里某处有同名文本」收紧成「就是这个包的公告」）。 */
const ANNOUNCEMENT_PACKAGES: Readonly<Record<AnnouncementName, string>> = {
  TTY_GUIDANCE: 'tty',
  ENV_GUIDANCE: 'env',
  MCP_GUIDANCE: 'mcp',
  PROMPT_GUIDANCE: 'prompt',
  PROFILE_GUIDANCE: 'profile',
  CODEGRAPH_GUIDANCE: 'codegraph',
  LOGLENS_GUIDANCE: 'loglens',
}

/** 一条测量记录（`length: null` = 弃权：右值不是纯「字面量 + 链」，静态量不出来）。 */
export interface AnnouncementMeasurement {
  /** 常量名（`TTY_GUIDANCE` …；fixture 里可以是任意 `<NAME>_GUIDANCE`）。 */
  readonly name: string
  /** 所在包目录名（`packages/<pkg>/src` 的 `<pkg>`）。 */
  readonly pkg: string
  /** 仓库相对路径（posix 分隔符，如 `packages/tty/src/index.ts`）。 */
  readonly file: string
  /** 声明所在行（1-based，只用于把报错指到人能看到的位置）。 */
  readonly line: number
  /** `+` 链拼接后的字符数；`null` = 弃权。 */
  readonly length: number | null
}

/** 参与扫描的源码后缀（与 `check-prompt-sections.mjs` 的预算扫描面一致）。 */
const SOURCE_FILE = /\.(ts|mts|cts|js|mjs)$/u

/**
 * 常量声明：`const NAME =`（允许 `export` 前缀与单行 `: Type` 注记）。
 *
 * `let` / `var` 不算——可变声明的值会跑，量了不可信（与参考实现同一取舍）。
 */
const CONST_DECL = /(?:^|\n)[ \t]*(?:export[ \t]+)?const[ \t]+([A-Za-z_$][\w$]*)[ \t]*(?::[^=\n]*)?=/gu

/** 越界读取返回 `undefined`（TS 下标类型不含 undefined，直接 `text[i] === undefined` 过不了类型检查）。 */
function charAt(text: string, index: number): string | undefined {
  return index >= 0 && index < text.length ? text[index] : undefined
}

/**
 * 收一个文件里所有 `const NAME =` 的右值起点（`=` 之后的位置），供 `+` 链解析器回查。
 *
 * 同名后者覆盖前者——重复声明本身就是坏代码，值得由「命中数」那条断言单独报红
 * （`checkAnnouncementRoster`），不在这里做对错判定。
 */
function collectSameFileConsts(text: string): Map<string, number> {
  const consts = new Map<string, number>()
  for (const match of text.matchAll(CONST_DECL)) {
    consts.set(match[1], match.index + match[0].length)
  }
  return consts
}

/** 从 `start` 读到的一个引号字面量（含首尾引号）；模板里出现 `${` 标记 `dynamic`。 */
interface QuotedLiteral {
  readonly raw: string
  readonly dynamic: boolean
  readonly end: number
}

/**
 * 从 `start` 读一个引号字面量（含首尾引号）。
 *
 * 模板里出现 `${` 就标记 `dynamic`：插值后的长度不是静态事实，解析器对它弃权。
 */
function readQuotedLiteral(text: string, start: number): QuotedLiteral | null {
  const quote = charAt(text, start)
  if (quote !== '\'' && quote !== '"' && quote !== '`') return null
  let i = start + 1
  while (i < text.length) {
    const ch = charAt(text, i)
    if (ch === '\\') {
      i += 2
      continue
    }
    if (ch === quote) return { raw: text.slice(start, i + 1), dynamic: false, end: i + 1 }
    if (quote === '`' && ch === '$' && charAt(text, i + 1) === '{') return { raw: '', dynamic: true, end: i }
    i += 1
  }
  return null
}

/**
 * 引号字面量（含引号）按 JS 语义还原后的字符数——`.length` 口径（UTF-16 code unit）。
 *
 * 拿不准的转义返回 `null`（整个条目弃权），绝不猜：这条判据宁可漏报（运行时兜底）
 * 不能误报（CI 红得没有道理就没人信它）。
 */
function quotedLength(raw: string): number | null {
  const body = raw.slice(1, -1)
  let length = 0
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i]
    if (ch !== '\\') {
      length += 1
      continue
    }
    const next = body[i + 1]
    if (next === undefined) return null
    i += 1
    if (next === 'x') {
      if (!/^[0-9a-fA-F]{2}/u.test(body.slice(i + 1, i + 3))) return null
      length += 1
      i += 2
    } else if (next === 'u') {
      if (body[i + 1] === '{') {
        const close = body.indexOf('}', i + 2)
        if (close === -1) return null
        const hex = body.slice(i + 2, close)
        if (!/^[0-9a-fA-F]{1,6}$/u.test(hex)) return null
        // `.length` 数的是 UTF-16 unit：astral 字面量（`\u{1F600}`）占 2。
        length += Number.parseInt(hex, 16) > 0xffff ? 2 : 1
        i = close
      } else if (/^[0-9a-fA-F]{4}$/u.test(body.slice(i + 1, i + 5))) {
        length += 1
        i += 4
      } else {
        length += 1 // `\u12x` 这类：JS 还原成 'u'，后续字符在后面的循环里逐个数
      }
    } else if (next === '\r' || next === '\n') {
      if (next === '\r' && body[i + 1] === '\n') i += 1 // 行延续：0 字符
    } else {
      length += 1 // n r t b f v 0 引号反斜杠，以及未知转义（JS 一律还原成一个字符）
    }
  }
  return length
}

/** 跳过空白与注释（行注释 / 块注释），返回下一个有效字符的位置。 */
function skipWhitespaceAndComments(text: string, start: number): number {
  let i = start
  for (;;) {
    const ch = charAt(text, i)
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1
      continue
    }
    if (ch === '/' && charAt(text, i + 1) === '/') {
      while (i < text.length && charAt(text, i) !== '\n') i += 1
      continue
    }
    if (ch === '/' && charAt(text, i + 1) === '*') {
      const end = text.indexOf('*/', i + 2)
      i = end === -1 ? text.length : end + 2
      continue
    }
    return i
  }
}

/** 一条 `+` 链量出来的长度与它结束的位置。 */
interface ChainLength {
  readonly length: number
  readonly end: number
}

/**
 * 解析一个「`+` 链」：字面量与同文件 const 标识符的拼接，返回 `{ length, end }`。
 *
 * 终止符只认语句收尾（EOF / 分号 / 逗号 / 闭括号 / 下一个标识符——最后一项是无分号风格里
 * 「下一条语句开始了」的形态）。`?` `.` `(` 等说明这不是纯 `+` 链（三元 / 成员访问 / 调用），
 * 返回 `null` 弃权——量错的长度比不量更糟。
 */
function resolveChainLength(
  text: string,
  start: number,
  consts: ReadonlyMap<string, number>,
  seen: Set<string> = new Set(),
): ChainLength | null {
  let i = start
  let total = 0
  for (;;) {
    i = skipWhitespaceAndComments(text, i)
    const ch = charAt(text, i)
    let termEnd: number
    if (ch === '\'' || ch === '"' || ch === '`') {
      const literal = readQuotedLiteral(text, i)
      if (literal === null || literal.dynamic) return null
      const length = quotedLength(literal.raw)
      if (length === null) return null
      total += length
      termEnd = literal.end
    } else {
      const match = /^[A-Za-z_$][\w$]*/u.exec(text.slice(i))
      if (match === null) return null
      const name = match[0]
      if (seen.has(name)) return null
      const rhsStart = consts.get(name)
      if (rhsStart === undefined) return null
      seen.add(name)
      const nested = resolveChainLength(text, rhsStart, consts, seen)
      seen.delete(name)
      if (nested === null) return null
      total += nested.length
      // 嵌套只贡献长度：外层链从**这个标识符 token 的结尾**继续（嵌套返回的 `end` 在常量
      // 自己的右值里，拿它续外层会把 `A + B` 量成只有 A——参考实现里用真仓探针抓到过）。
      termEnd = i + name.length
    }
    const next = skipWhitespaceAndComments(text, termEnd)
    const nextChar = charAt(text, next)
    if (nextChar === '+') {
      i = next + 1
      continue
    }
    if (
      nextChar === undefined || nextChar === '\n' || nextChar === '\r' ||
      nextChar === ';' || nextChar === ',' || nextChar === ')' || nextChar === '}' ||
      nextChar === ']' || /^[A-Za-z0-9_$]/u.test(nextChar ?? '')
    ) {
      return { length: total, end: next }
    }
    return null
  }
}

/** 这一行是不是注释行（`//`、`/*`、` *`）——注释里提到 `const X = ...` 不算声明。 */
function isCommentLine(text: string, index: number): boolean {
  const lineStart = text.lastIndexOf('\n', index) + 1
  const head = text.slice(lineStart, lineStart + 2)
  return head === '//' || head === '/*' || text.slice(lineStart, lineStart + 1) === '*'
}

/**
 * 扫一个文件里名单内的 `(export )?const <NAME>_GUIDANCE =`，量右值的拼接长度。
 *
 * 只收名单里的名字（`wanted`）——仓里还有 `DOCKER_GUIDANCE` 之类的同类常量，它们不在本守卫的
 * 范围里；按名字过滤而不是「所有 `*_GUIDANCE`」，顺便让「新公告必须先入名单」成为一道闸。
 */
function measureFile(
  text: string,
  pkg: string,
  file: string,
  wanted: ReadonlySet<string>,
): AnnouncementMeasurement[] {
  const consts = collectSameFileConsts(text)
  const measurements: AnnouncementMeasurement[] = []
  for (const match of text.matchAll(CONST_DECL)) {
    const name = match[1]
    if (!wanted.has(name)) continue
    // `CONST_DECL` 可能从前一行的 `\n` 起算，声明本身从那个换行之后开始（行号别差一）。
    const declarationStart = match.index + (charAt(text, match.index) === '\n' ? 1 : 0)
    if (isCommentLine(text, declarationStart)) continue
    const resolved = resolveChainLength(text, match.index + match[0].length, consts)
    measurements.push({
      name,
      pkg,
      file,
      line: text.slice(0, declarationStart).split('\n').length,
      length: resolved === null ? null : resolved.length,
    })
  }
  return measurements
}

/** 递归列出一个目录下的源码文件（返回绝对路径）。读不到的目录返回空——由命中数断言负责报红。 */
function listSourceFiles(dir: string): string[] {
  const files: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return files
  }
  for (const name of entries) {
    const full = join(dir, name)
    let info: ReturnType<typeof statSync>
    try {
      info = statSync(full)
    } catch {
      continue
    }
    if (info.isDirectory()) files.push(...listSourceFiles(full))
    else if (SOURCE_FILE.test(name)) files.push(full)
  }
  return files
}

/** 列出仓库的包目录名（`packages/` 读不到时返回空）。 */
function listPackageDirs(repoRoot: string): string[] {
  try {
    return readdirSync(join(repoRoot, 'packages')).sort()
  } catch {
    return []
  }
}

/**
 * 抽取：在 `repoRoot` 的 `packages/<pkg>/src` 下递归量名单里的公告常量。
 *
 * @param repoRoot - 仓库根（fixture 树复用同一份逻辑，所以这里不写死仓根）
 * @param names - 要抽取的常量名；缺省即 `ANNOUNCEMENT_NAMES`（fixture 用自定义名字）
 * @returns 每条声明一条记录；`length: null` 表示弃权（量不出来）
 */
export function measureAnnouncements(
  repoRoot: string,
  names: readonly string[] = ANNOUNCEMENT_NAMES,
): AnnouncementMeasurement[] {
  const wanted = new Set(names)
  const measurements: AnnouncementMeasurement[] = []
  for (const pkg of listPackageDirs(repoRoot)) {
    const srcDir = join(repoRoot, 'packages', pkg, 'src')
    let isDirectory = false
    try {
      isDirectory = statSync(srcDir).isDirectory()
    } catch {
      isDirectory = false
    }
    if (!isDirectory) continue
    for (const full of listSourceFiles(srcDir)) {
      const file = relative(repoRoot, full).split(sep).join('/')
      measurements.push(...measureFile(readFileSync(full, 'utf8'), pkg, file, wanted))
    }
  }
  return measurements
}

/**
 * 判定（判据 2）：名单里每条公告的静态长度 ≤ `ANNOUNCEMENT_BUDGET`。
 *
 * `packages/` 读不到时**判红而不是静默通过**：扫描面为空正是本仓记在案的「恒绿闸门」形态。
 *
 * @param repoRoot - 仓库根
 * @param names - 要判定的常量名；缺省即 `ANNOUNCEMENT_NAMES`
 * @returns 违规描述数组（空 = 通过）；弃权的条目不出现在这里（见 `checkAnnouncementRoster`）
 */
export function findAnnouncementBudgetViolations(
  repoRoot: string,
  names: readonly string[] = ANNOUNCEMENT_NAMES,
): string[] {
  if (listPackageDirs(repoRoot).length === 0) {
    return ['读不到 packages/ 目录：公告扫描面为空，这道闸会恒绿（比没有这道闸更坏）']
  }
  return measureAnnouncements(repoRoot, names)
    .filter(
      (measurement): measurement is AnnouncementMeasurement & { length: number } =>
        measurement.length !== null && measurement.length > ANNOUNCEMENT_BUDGET,
    )
    .map(
      (measurement) =>
        `${measurement.name}（${measurement.file}:${measurement.line}）：公告 ` +
        `${measurement.length} 字符，超过预算 ${ANNOUNCEMENT_BUDGET}` +
        '——每轮上下文都要付这份钱，压成「能力索引」长度（能力名 + 卡片入口 + 何时别用），' +
        '细节留在包 README / 设置卡片里',
    )
}

/**
 * 判定（判据 3）：名单里的每条公告必须**真的被抽到且量得出长度**。
 *
 * 这条专门防「扫描面为空 = 恒绿」：一个抽不到任何东西的实现，预算判据会永远返回空数组。
 * 弃权的条目同样算问题——抽到了却量不出来，等于这道闸对它恒绿。
 *
 * @param repoRoot - 仓库根
 * @param names - 名单；缺省即 `ANNOUNCEMENT_NAMES`
 * @returns 问题描述数组（空 = 通过）
 */
export function checkAnnouncementRoster(
  repoRoot: string,
  names: readonly string[] = ANNOUNCEMENT_NAMES,
): string[] {
  const byName = new Map<string, AnnouncementMeasurement[]>()
  for (const measurement of measureAnnouncements(repoRoot, names)) {
    const bucket = byName.get(measurement.name)
    if (bucket === undefined) byName.set(measurement.name, [measurement])
    else bucket.push(measurement)
  }
  const problems: string[] = []
  for (const name of names) {
    const hits = byName.get(name) ?? []
    if (hits.length === 0) {
      problems.push(`${name}：没抽到——扫描面为空 / 常量名写错 / 不在 packages/<pkg>/src 下`)
      continue
    }
    if (hits.length > 1) {
      problems.push(
        `${name}：抽到 ${hits.length} 处（${hits.map((hit) => `${hit.file}:${hit.line}`).join('、')}）` +
          '——一段公告只该有一个声明',
      )
    }
    for (const hit of hits) {
      if (hit.length === null) {
        problems.push(
          `${hit.name}（${hit.file}:${hit.line}）：抽到了但量不出长度（右值不是「字面量 + 链」）` +
            '——判据对它弃权，等于这道闸恒绿',
        )
      }
    }
  }
  return problems
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/* ------------------------------------------------------------------ *
 * fixture：最小仓库树（不碰任何受版本控制的文件）
 * ------------------------------------------------------------------ */

const fixtureRoots: string[] = []

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** 造一棵最小 fixture 仓库树：键是仓库相对路径，值是文件内容。 */
function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-announcement-budget-'))
  fixtureRoots.push(root)
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, content)
  }
  return root
}

/**
 * N 个字符的单引号字面量**源码**（反例用；内容无所谓，长度才是判据）。
 *
 * 注意它是「写成 N 个 x 的字面量」，不是 `'x'.repeat(N)`——后者是函数调用形态，按判据会弃权。
 */
function longLiteral(chars: number): string {
  return `'${'x'.repeat(chars)}'`
}

/* ------------------------------------------------------------------ *
 * 真实仓库
 * ------------------------------------------------------------------ */

describe('真实仓库 · 7 段插件公告', () => {
  it('预算钉在 250 字符（放宽预算 = 拆掉这道闸）', () => {
    expect(ANNOUNCEMENT_BUDGET).toBe(250)
  })

  it('7 段公告全部被抽到（数量 + 名字集合都断言，防「扫描面为空 = 恒绿」）', () => {
    const measured = measureAnnouncements(REPO_ROOT)
    expect(measured).toHaveLength(ANNOUNCEMENT_NAMES.length)
    expect(measured.map((measurement) => measurement.name).sort()).toEqual([...ANNOUNCEMENT_NAMES].sort())
    // 抽到但量不出长度 = 判据弃权 = 对那段公告恒绿，同样要红
    expect(checkAnnouncementRoster(REPO_ROOT)).toEqual([])
  })

  it('每段公告都在它自己的包里（别处的同名文本不算数）', () => {
    const located = measureAnnouncements(REPO_ROOT).map((measurement) => `${measurement.name}@${measurement.pkg}`)
    const expected = ANNOUNCEMENT_NAMES.map((name) => `${name}@${ANNOUNCEMENT_PACKAGES[name]}`)
    expect(located.sort()).toEqual(expected.sort())
  })

  it('每段公告的静态长度都不超过预算', () => {
    // 失败时会逐条打印「名字（file:line）：N 字符，超过预算 250」——7 段全量可读
    expect(findAnnouncementBudgetViolations(REPO_ROOT)).toEqual([])
  })
})

/* ------------------------------------------------------------------ *
 * 反例：超预算必须判红
 * ------------------------------------------------------------------ */

describe('反例：公告涨回超预算必须判红（fixture 树）', () => {
  it('300 字符的公告常量 → 判红，并点名长度、预算与位置', () => {
    const root = fixture({
      'packages/x/src/index.ts': `export const FOO_GUIDANCE = ${longLiteral(300)}\n`,
    })
    const violations = findAnnouncementBudgetViolations(root, ['FOO_GUIDANCE'])
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('FOO_GUIDANCE')
    expect(violations[0]).toContain('300')
    expect(violations[0]).toContain(String(ANNOUNCEMENT_BUDGET))
    expect(violations[0]).toContain('packages/x/src/index.ts:1')
  })

  it('恰好 250 字符 → 绿（预算是 ≤，边界要能过）', () => {
    const root = fixture({
      'packages/x/src/index.ts': `const FOO_GUIDANCE = ${longLiteral(250)}\n`,
    })
    expect(findAnnouncementBudgetViolations(root, ['FOO_GUIDANCE'])).toEqual([])
    expect(measureAnnouncements(root, ['FOO_GUIDANCE'])[0].length).toBe(250)
  })

  it('多行 + 链要拼起来量：每段 150、总和 300 → 红（TTY 那段的真实形状）', () => {
    const root = fixture({
      'packages/x/src/index.ts': [
        'const FOO_GUIDANCE =',
        `  ${longLiteral(150)}`,
        `  + ${longLiteral(150)}`,
        '',
      ].join('\n'),
    })
    const violations = findAnnouncementBudgetViolations(root, ['FOO_GUIDANCE'])
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('300')
  })

  it('无插值的模板字面量同样量：300 字符 → 红', () => {
    const root = fixture({
      'packages/x/src/index.ts': 'const FOO_GUIDANCE = `' + 'x'.repeat(300) + '`\n',
    })
    expect(findAnnouncementBudgetViolations(root, ['FOO_GUIDANCE'])).toHaveLength(1)
  })

  it('src/ 子目录里也要扫到（递归）', () => {
    const root = fixture({
      'packages/x/src/nested/deep.ts': `const FOO_GUIDANCE = ${longLiteral(300)}\n`,
    })
    expect(findAnnouncementBudgetViolations(root, ['FOO_GUIDANCE'])).toHaveLength(1)
  })
})

/* ------------------------------------------------------------------ *
 * 反例：量不出来的形态弃权（不误报）
 * ------------------------------------------------------------------ */

describe('反例：+ 链之外的形态弃权，不误报', () => {
  it('函数调用 / 标识符引用 / import 值 / 插值模板 → 弃权；纯字面量照量', () => {
    const root = fixture({
      'packages/x/src/index.ts': [
        `import { IMPORTED } from './guidance.js'`,
        `const CALL_GUIDANCE = build('x'.repeat(300))`,
        `const REPEAT_GUIDANCE = 'x'.repeat(300)`,
        `const IDENT_GUIDANCE = SOME_GUIDANCE`,
        `const TWICE_GUIDANCE = A_GUIDANCE + B_GUIDANCE`,
        'const TEMPLATE_GUIDANCE = `' + '${' + 'value}}' + '`',
        `const SHORT_GUIDANCE = 'ok'`,
        `const IMPORT_GUIDANCE = IMPORTED + 'x'`,
      ].join('\n'),
    })
    const names = [
      'CALL_GUIDANCE',
      'REPEAT_GUIDANCE',
      'IDENT_GUIDANCE',
      'TWICE_GUIDANCE',
      'TEMPLATE_GUIDANCE',
      'SHORT_GUIDANCE',
      'IMPORT_GUIDANCE',
    ]
    // 弃权 = 不进违规列表（它由 kit 的运行时兜底；静态这边不猜长度）
    expect(findAnnouncementBudgetViolations(root, names)).toEqual([])
    const lengths = new Map(measureAnnouncements(root, names).map((measurement) => [measurement.name, measurement.length]))
    // 名单里的每一条都**抽到了**（区别于「没抽到」），只是其中六条量不出来
    expect([...lengths.keys()].sort()).toEqual([...names].sort())
    for (const name of names.filter((candidate) => candidate !== 'SHORT_GUIDANCE')) {
      expect(lengths.get(name)).toBeNull()
    }
    expect(lengths.get('SHORT_GUIDANCE')).toBe(2)
  })
})

/* ------------------------------------------------------------------ *
 * 反例：扫描面为空 / 名单对不上时必须红
 * ------------------------------------------------------------------ */

describe('反例：命中为 0 时必须红（恒绿闸门）', () => {
  it('一个包都没有（连 packages/ 都不存在）→ 判红，不是静默通过', () => {
    const root = fixture({ 'README.md': '# 空仓\n' })
    expect(findAnnouncementBudgetViolations(root, ['FOO_GUIDANCE']).join('\n')).toContain('扫描面为空')
  })

  it('包在、但公告抽不到 → 名单判红（数量/名字集合就是为此存在）', () => {
    const root = fixture({ 'packages/x/src/index.ts': 'const UNRELATED = 1\n' })
    const problems = checkAnnouncementRoster(root, ['FOO_GUIDANCE'])
    expect(problems.join('\n')).toContain('FOO_GUIDANCE')
    expect(problems.join('\n')).toContain('没抽到')
  })

  it('同名声明两处 → 名单判红（一段公告只该有一个声明）', () => {
    const root = fixture({
      'packages/x/src/index.ts': [`const FOO_GUIDANCE = 'a'`, `const FOO_GUIDANCE = 'b'`].join('\n'),
    })
    expect(checkAnnouncementRoster(root, ['FOO_GUIDANCE']).join('\n')).toContain('抽到 2 处')
  })
})
