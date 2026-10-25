/**
 * 插件公告长度**测量与判定**——`packages/<pkg>/src` 里那些会被注入 systemPrompt 的公告常量。
 *
 * ## 为什么是独立模块（2026-10-25 从测试文件里抽出来的）
 *
 * 这套测量原先整段住在 `scripts/test/announcement-budget.test.ts` 里（当时只有守卫一个消费者）。
 * 2026-10-25 多了第二个消费者：`pnpm disclosure-report`
 * （`scripts/disclosure-report.mjs`）要在一条命令里把「披露面」摊开，第一件事就是同一份公告长度。
 * 测量留在测试里，报告就只能复制一份——那就是本仓明确定义的债（同一事实两份全文，
 * 见 `docs/conventions.md` § 文档分层）。所以把**测量与判定**搬到这里，
 * 反例 / fixture / 断言留在测试文件里：**测试的事归测试，测量的判据归模块**。
 *
 * 分工：本模块是纯函数集合，全部接受 `repoRoot`（fixture 树复用同一份逻辑，不写死仓根），
 * 不碰全局状态、不写任何东西。
 *
 * ## 一、守什么
 *
 * 8 段公告（`TTY_GUIDANCE` / `ENV_GUIDANCE` / `MCP_GUIDANCE` / `PROMPT_GUIDANCE` /
 * `PROFILE_GUIDANCE` / `CODEGRAPH_GUIDANCE` / `LOGLENS_GUIDANCE` / `DOCKER_GUIDANCE`）每一段都由
 * `registerLiteralSection(...)` 注入 systemPrompt，**每一轮请求都在上下文里**。所以它们的
 * 长度不是「代码风格」，而是**每轮都要付一次的上下文成本**：历史上 tty 那段涨到过 579 字符，
 * 其余四段 421 / 340 / 306 / 268——五段加起来是一段不产生任何新能力的固定开销。
 *
 * 这里钉两条判据（由 `scripts/test/announcement-budget.test.ts` 断言）：
 *
 * 1. **长度**：每段公告的静态拼接长度 ≤ `ANNOUNCEMENT_BUDGET`（250 字符）；
 * 2. **命中**：8 段必须**真的都被抽到**（数量 + 名字集合都断言）。少了这条，一个「扫描面为空
 *    的实现」会恒绿——本仓把「恒绿闸门」明确列在事故形状里（见 `docs/conventions.md` 的守卫
 *    纪律，以及 `scripts/check-test-collection.mjs` 文件头记的那次实测）。
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
 * ## 二点五、`DOCKER_GUIDANCE` 2026-10-25 才进名单
 *
 * 它此前 562 字符、**不在**本名单里（长度由 `packages/docker/test/announcement.test.ts` 自己
 * 用一个 600 的预算守着）。当天做了一次拆段：把「`target` 通配只在 ps / attention」「排障链」
 * 「网络/卷只在面板」三段删掉——前两段的落点是各工具自己的 `description`（`docker_ps` /
 * `docker_attention` / `docker_logs` 里已经写着），第三段本来就没有对应工具。删到 250 之后
 * 才进名单：**先减到线内，再入名单**，不是「入名单时把预算调大」。
 *
 * ## 三、边界（刻意不做的）
 *
 *   - **名单固定 8 个**：仓里还有 `SEARCH_GUIDANCE` 等同类常量，但它们不在本守卫的名单里；
 *     抽取按名字过滤，所以加一个新公告要**先往表里加名字**（这也是一道闸：新公告不会被悄悄带进来）。
 *     反过来说，**入名单前必须先减到线内**——`DOCKER_GUIDANCE` 就是这么进来的（见 §二点五）。
 *   - **只扫 `src`**：`packages/<pkg>/lib` 是入库的预构建产物，同一段常量在那儿还有一份，扫了
 *     会把命中数算成两倍。
 *   - **不做运行时验证**：公告真的被注入、注入后是否截断，属于宿主与 kit 的运行时时序，由
 *     `packages/*​/test/` 的用例与真机脚本负责；这里只回答「源码里这段有多长」。
 *   - **不写 shebang**：本模块会被 `.ts` 用例与 `scripts/disclosure-report.mjs` import，
 *     而本仓 CI 实测过「被 import 的 .mjs 带 shebang + CRLF → 整份套件加载失败」。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/** 公告长度预算（字符）。固定值——「涨了就把预算调大」等于没有这条守卫。 */
export const ANNOUNCEMENT_BUDGET = 250

/** 入表名单（8 个，顺序按包在仓内的既有排列；新公告要先减到 250 内再入表）。 */
export const ANNOUNCEMENT_NAMES = [
  'TTY_GUIDANCE',
  'ENV_GUIDANCE',
  'MCP_GUIDANCE',
  'PROMPT_GUIDANCE',
  'PROFILE_GUIDANCE',
  'CODEGRAPH_GUIDANCE',
  'LOGLENS_GUIDANCE',
  'DOCKER_GUIDANCE',
]

/**
 * 每段公告归属的包（把「抽到了」从「仓里某处有同名文本」收紧成「就是这个包的公告」）。
 *
 * @type {Readonly<Record<string, string>>}
 */
export const ANNOUNCEMENT_PACKAGES = {
  TTY_GUIDANCE: 'tty',
  ENV_GUIDANCE: 'env',
  MCP_GUIDANCE: 'mcp',
  PROMPT_GUIDANCE: 'prompt',
  PROFILE_GUIDANCE: 'profile',
  CODEGRAPH_GUIDANCE: 'codegraph',
  LOGLENS_GUIDANCE: 'loglens',
  DOCKER_GUIDANCE: 'docker',
}

/**
 * 一条测量记录（`length: null` = 弃权：右值不是纯「字面量 + 链」，静态量不出来）。
 *
 * @typedef {object} AnnouncementMeasurement
 * @property {string} name 常量名（`TTY_GUIDANCE` …；fixture 里可以是任意 `<NAME>_GUIDANCE`）。
 * @property {string} pkg 所在包目录名（`packages/<pkg>/src` 的 `<pkg>`）。
 * @property {string} file 仓库相对路径（posix 分隔符，如 `packages/tty/src/index.ts`）。
 * @property {number} line 声明所在行（1-based，只用于把报错指到人能看到的位置）。
 * @property {number|null} length `+` 链拼接后的字符数；`null` = 弃权。
 */

/** 参与扫描的源码后缀（与 `check-prompt-sections.mjs` 的预算扫描面一致）。 */
const SOURCE_FILE = /\.(ts|mts|cts|js|mjs)$/u

/**
 * 常量声明：`const NAME =`（允许 `export` 前缀与单行 `: Type` 注记）。
 *
 * `let` / `var` 不算——可变声明的值会跑，量了不可信（与参考实现同一取舍）。
 */
const CONST_DECL = /(?:^|\n)[ \t]*(?:export[ \t]+)?const[ \t]+([A-Za-z_$][\w$]*)[ \t]*(?::[^=\n]*)?=/gu

/** 越界读取返回 `undefined`（判据里到处用它做「到这儿就没有了」，所以单独收一个函数）。 */
function charAt(text, index) {
  return index >= 0 && index < text.length ? text[index] : undefined
}

/**
 * 收一个文件里所有 `const NAME =` 的右值起点（`=` 之后的位置），供 `+` 链解析器回查。
 *
 * 同名后者覆盖前者——重复声明本身就是坏代码，值得由「命中数」那条断言单独报红
 * （`checkAnnouncementRoster`），不在这里做对错判定。
 */
function collectSameFileConsts(text) {
  const consts = new Map()
  for (const match of text.matchAll(CONST_DECL)) {
    consts.set(match[1], match.index + match[0].length)
  }
  return consts
}

/**
 * 从 `start` 读到的一个引号字面量（含首尾引号）；模板里出现 `${` 标记 `dynamic`。
 *
 * @typedef {object} QuotedLiteral
 * @property {string} raw
 * @property {boolean} dynamic
 * @property {number} end
 */

/**
 * 从 `start` 读一个引号字面量（含首尾引号）。
 *
 * 模板里出现 `${` 就标记 `dynamic`：插值后的长度不是静态事实，解析器对它弃权。
 *
 * @returns {QuotedLiteral|null}
 */
function readQuotedLiteral(text, start) {
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
 *
 * @returns {number|null}
 */
function quotedLength(raw) {
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
function skipWhitespaceAndComments(text, start) {
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

/**
 * 一条 `+` 链量出来的长度与它结束的位置。
 *
 * @typedef {object} ChainLength
 * @property {number} length
 * @property {number} end
 */

/**
 * 解析一个「`+` 链」：字面量与同文件 const 标识符的拼接，返回 `{ length, end }`。
 *
 * 终止符只认语句收尾（EOF / 分号 / 逗号 / 闭括号 / 下一个标识符——最后一项是无分号风格里
 * 「下一条语句开始了」的形态）。`?` `.` `(` 等说明这不是纯 `+` 链（三元 / 成员访问 / 调用），
 * 返回 `null` 弃权——量错的长度比不量更糟。
 *
 * @param {string} text
 * @param {number} start
 * @param {ReadonlyMap<string, number>} consts
 * @param {Set<string>} [seen]
 * @returns {ChainLength|null}
 */
function resolveChainLength(text, start, consts, seen = new Set()) {
  let i = start
  let total = 0
  for (;;) {
    i = skipWhitespaceAndComments(text, i)
    const ch = charAt(text, i)
    let termEnd
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
function isCommentLine(text, index) {
  const lineStart = text.lastIndexOf('\n', index) + 1
  const head = text.slice(lineStart, lineStart + 2)
  return head === '//' || head === '/*' || text.slice(lineStart, lineStart + 1) === '*'
}

/**
 * 扫一个文件里名单内的 `(export )?const <NAME>_GUIDANCE =`，量右值的拼接长度。
 *
 * 只收名单里的名字（`wanted`）——仓里还有 `DOCKER_GUIDANCE` 之类的同类常量，它们不在本守卫的
 * 范围里；按名字过滤而不是「所有 `*_GUIDANCE`」，顺便让「新公告必须先入名单」成为一道闸。
 *
 * @returns {AnnouncementMeasurement[]}
 */
function measureFile(text, pkg, file, wanted) {
  const consts = collectSameFileConsts(text)
  const measurements = []
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
function listSourceFiles(dir) {
  const files = []
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return files
  }
  for (const name of entries) {
    const full = join(dir, name)
    let info
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
function listPackageDirs(repoRoot) {
  try {
    return readdirSync(join(repoRoot, 'packages')).sort()
  } catch {
    return []
  }
}

/**
 * 抽取：在 `repoRoot` 的 `packages/<pkg>/src` 下递归量名单里的公告常量。
 *
 * @param {string} repoRoot - 仓库根（fixture 树复用同一份逻辑，所以这里不写死仓根）
 * @param {readonly string[]} [names] - 要抽取的常量名；缺省即 `ANNOUNCEMENT_NAMES`（fixture 用自定义名字）
 * @returns {AnnouncementMeasurement[]} 每条声明一条记录；`length: null` 表示弃权（量不出来）
 */
export function measureAnnouncements(repoRoot, names = ANNOUNCEMENT_NAMES) {
  const wanted = new Set(names)
  const measurements = []
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
 * @param {string} repoRoot - 仓库根
 * @param {readonly string[]} [names] - 要判定的常量名；缺省即 `ANNOUNCEMENT_NAMES`
 * @returns {string[]} 违规描述数组（空 = 通过）；弃权的条目不出现在这里（见 `checkAnnouncementRoster`）
 */
export function findAnnouncementBudgetViolations(repoRoot, names = ANNOUNCEMENT_NAMES) {
  if (listPackageDirs(repoRoot).length === 0) {
    return ['读不到 packages/ 目录：公告扫描面为空，这道闸会恒绿（比没有这道闸更坏）']
  }
  return measureAnnouncements(repoRoot, names)
    .filter((measurement) => measurement.length !== null && measurement.length > ANNOUNCEMENT_BUDGET)
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
 * @param {string} repoRoot - 仓库根
 * @param {readonly string[]} [names] - 名单；缺省即 `ANNOUNCEMENT_NAMES`
 * @returns {string[]} 问题描述数组（空 = 通过）
 */
export function checkAnnouncementRoster(repoRoot, names = ANNOUNCEMENT_NAMES) {
  const byName = new Map()
  for (const measurement of measureAnnouncements(repoRoot, names)) {
    const bucket = byName.get(measurement.name)
    if (bucket === undefined) byName.set(measurement.name, [measurement])
    else bucket.push(measurement)
  }
  const problems = []
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
