/**
 * systemPrompt 段落闸（`pnpm prompt-sections:check`）。
 *
 * ## 为什么需要它
 *
 * 宿主的 `systemPrompt.section()` **缺省 `interpolate: true`**：段落正文里的 `{{name}}`
 * 会被当成变量引用，未知变量 / 不合规写法 / 没有值**一律 throw**——而这个 throw 发生在
 * **每一步请求的组装期**。它不会让某个按钮失败，它让整个会话发不出请求
 * （`dsh headless` exit 1，模型收到 0 次请求）。
 *
 * 2026-10-19 的外部测评（issue #14 第 1 条 / issue #13 第 3 条同源）就是现场：prompt 插件
 * 把用户编辑的正文原样注入，正文里有 `{{language}}` 与 `<span>{{ msg }}</span>`，
 * 于是每一步都抛 `unknown prompt variable` / `malformed prompt variable reference`。
 * 而插件的 `/save`、`/list`、`/active` 全部 200、`fileError` 为空，卡片上看不出任何原因。
 *
 * 本仓**每一个**段落的正文都含外部内容（用户编辑的 Prompt、第三方订阅源标题、命令输出、
 * 日志行），所以判据是「一律不插值」。这条规矩此前没有任何闸门守着，也没有任何用例会红
 * ——两个月没人发现，正是因为它是**静默**的。
 *
 * ## 四条判据
 *
 * 1. **`packages/*​/src/**` 里不允许出现裸 `systemPrompt.section(...)` 调用**——必须走
 *    kit 的 `registerLiteralSection(api, options)`（它固定 `interpolate: false`）。
 *    这条把「忘了传」变成「根本传不了」。
 * 2. **kit 的 `registerLiteralSection` 必须真的传 `interpolate: false`**——闸门认的那个
 *    逃生口本身被改坏时，判据 1 会变成一道恒绿的假闸门（比没有更坏）。
 * 3. **命中不是 0**——至少要有一个包在用 `registerLiteralSection`（`checkAdoption`）。
 * 4. **静态段落正文 ≤ `SECTION_LITERAL_BUDGET`（2000 字符）**——段落正文拼的是外部内容，
 *    长度由对方决定，静态部分能在 CI 里量出来就别等运行时告警。2000 是**审查线**，低于
 *    kit 运行时的兜底上限（`DEFAULT_SECTION_MAX_CHARS` = 4000）：超审查线在 CI 红、要求
 *    有人看一眼；超运行时上限才被截断 + `console.warn` 一次。解析不到的形态（import 进来
 *    的、函数形态、变量传入）**跳过**，那部分由 kit 的运行时预算兜底。
 *
 * ## 为什么是静态判据而不是跑一遍宿主
 *
 * 起真宿主渲染一次 prompt 的成本远高于静态扫（且需要 LLM 配置）。而这条判据的形态很稳：
 * 「谁调了 section」是纯文本事实。代价是**绕过写法**拦不住（`const s = api.section; s(...)`），
 * 但那种写法在本仓不会自然出现——它是刻意的规避，而不是疏忽；这道闸挡的是疏忽。
 *
 * 不写 shebang：本文件要被 `scripts/test/check-prompt-sections.test.ts` import，
 * 而本仓 CI 实测过「被 import 的 `.mjs` 带 shebang + CRLF → 整份套件加载失败」。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** 裸 section 调用的形态：`<something>.section(`（`registerLiteralSection` 不含 `.section(`）。 */
const RAW_SECTION_CALL = /\.section\s*\(/u

/**
 * 唯一允许出现 `api.section(` 的文件：kit 自己那层封装。
 *
 * 它必须调用宿主的 `section()`——那正是它的职责。豁免它不会让判据变空：
 * `checkLiteralSectionImplementation()` 单独钉住「它真的传了 `interpolate: false`」，
 * 两条合起来才等于「全仓只有一处裸调，且那一处是对的」。
 */
const ALLOWED_FILE = 'packages/kit/src/prompt-section.ts'

/**
 * 扫一个 `src` 目录里的裸 `section()` 调用。
 *
 * @param srcDir - 要扫的目录（`packages/<pkg>/src`）
 * @param pkgName - 包名（报错文案里用）
 * @returns `string[]` 违规位置（`packages/<pkg>/src/<file>:<行号>: <行内容>`）
 */
export function findRawSectionCalls(srcDir, pkgName, prefix) {
  const offenders = []
  let entries
  try {
    entries = readdirSync(srcDir)
  } catch {
    return offenders
  }
  for (const name of entries) {
    const full = join(srcDir, name)
    let info
    try {
      info = statSync(full)
    } catch {
      continue
    }
    if (info.isDirectory()) {
      offenders.push(...findRawSectionCalls(full, pkgName, `${pkgName}/src/${name}`))
      continue
    }
    if (!/\.(ts|mts|cts|js|mjs)$/u.test(name)) continue
    const rel = `${prefix === undefined ? `packages/${pkgName}/src` : `packages/${prefix}`}/${name}`
    // kit 自己那层封装是唯一允许裸调 section() 的地方（判据 2 单独钉它）
    if (rel === ALLOWED_FILE) continue
    const text = readFileSync(full, 'utf8')
    const lines = text.split('\n')
    for (const [index, line] of lines.entries()) {
      // 注释里提到 `.section(` 是正常的（本仓大量注释在解释这件事），只看代码行
      const trimmed = line.trim()
      if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue
      if (!RAW_SECTION_CALL.test(line)) continue
      offenders.push(`${rel}:${index + 1}: ${trimmed}`)
    }
  }
  return offenders
}

/**
 * 判据 1：全仓扫描。
 *
 * @param repoRoot - 仓库根
 * @returns `string[]` 违规位置
 */
export function findSectionOffenders(repoRoot = REPO_ROOT) {
  const offenders = []
  let packages
  try {
    packages = readdirSync(join(repoRoot, 'packages'))
  } catch {
    return offenders
  }
  for (const pkg of packages.sort()) {
    const srcDir = join(repoRoot, 'packages', pkg, 'src')
    try {
      if (!statSync(srcDir).isDirectory()) continue
    } catch {
      continue
    }
    offenders.push(...findRawSectionCalls(srcDir, pkg))
  }
  return offenders
}

/**
 * 判据 2：kit 的 `registerLiteralSection` 必须真的传 `interpolate: false`。
 *
 * @param repoRoot - 仓库根
 * @returns 违规描述数组（空 = 通过）
 */
export function checkLiteralSectionImplementation(repoRoot = REPO_ROOT) {
  const file = join(repoRoot, 'packages', 'kit', 'src', 'prompt-section.ts')
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return [`找不到 ${file}：kit 的 prompt-section 模块是这条规矩的落点，它不见了这道闸就是恒绿的`]
  }
  const violations = []
  // 实现体里必须有 `interpolate: false`，且必须走 `api.section(...)`
  if (!/interpolate:\s*false/u.test(text)) {
    violations.push('packages/kit/src/prompt-section.ts 里没有 `interpolate: false`：registerLiteralSection 必须固定不插值')
  }
  if (!/api\.section\s*\(/u.test(text)) {
    violations.push('packages/kit/src/prompt-section.ts 里没有 `api.section(...)` 调用：registerLiteralSection 的实现形态变了')
  }
  return violations
}

/**
 * 判据 3：**命中不是 0**（恒绿闸门比没有更坏，本仓真实发生过）。
 *
 * 至少要有一个包用了 `registerLiteralSection`——否则说明「大家都还在裸调 section」
 * 或「扫描面空了」，两种情况都该红。
 *
 * @param repoRoot - 仓库根
 * @returns 违规描述数组
 */
export function checkAdoption(repoRoot = REPO_ROOT) {
  const hits = []
  let packages
  try {
    packages = readdirSync(join(repoRoot, 'packages'))
  } catch {
    return ['读不到 packages/ 目录：扫描面为空，这道闸会恒绿']
  }
  for (const pkg of packages) {
    const srcDir = join(repoRoot, 'packages', pkg, 'src')
    let entries
    try {
      entries = readdirSync(srcDir)
    } catch {
      continue
    }
    for (const name of entries) {
      if (!/\.(ts|mts|cts|js|mjs)$/u.test(name)) continue
      let text
      try {
        text = readFileSync(join(srcDir, name), 'utf8')
      } catch {
        continue
      }
      if (text.includes('registerLiteralSection')) hits.push(pkg)
    }
  }
  if (hits.length === 0) {
    return ['没有任何包使用 registerLiteralSection：要么大家都还在裸调 section()，要么扫描面空了']
  }
  return []
}

/**
 * 判据 4 的审查线：静态段落正文的字符预算。
 *
 * 故意**低于** kit 的运行时兜底上限（`DEFAULT_SECTION_MAX_CHARS` = 4000）：4000 是
 * 「没人看管时也不至于无限长」的安全网，2000 是「写这么长就该有人看一眼」——两个数
 * 各管一层，谁也不替代谁。
 */
export const SECTION_LITERAL_BUDGET = 2000

/** 参与预算扫描的源码后缀（与 `findRawSectionCalls` 的扫描面一致）。 */
const BUDGET_SOURCE_FILE = /\.(ts|mts|cts|js|mjs)$/u

/** 常量声明：`const NAME =`（允许 `export` 前缀与单行 `: Type` 注记；`let`/`var` 不算——可变，量了不可信）。 */
const CONST_DECL = /(?:^|\n)[ \t]*(?:export[ \t]+)?const[ \t]+([A-Za-z_$][\w$]*)[ \t]*(?::[^=\n]*)?=/gu

/** `registerLiteralSection` 的调用点。函数声明 / re-export 不带 `(`，天然不匹配。 */
const REGISTER_CALL = /\bregisterLiteralSection\s*\(/gu

/**
 * 收一个文件里所有 `const NAME =` 的 RHS 起点（`=` 之后的位置），供 + 链解析器回查。
 * 同名后者覆盖前者——重复声明本身就是坏代码，不值得为它做对错判定。
 */
function collectSameFileConsts(text) {
  const consts = new Map()
  for (const match of text.matchAll(CONST_DECL)) {
    consts.set(match[1], match.index + match[0].length)
  }
  return consts
}

/**
 * 从 `start` 读一个引号字面量（含首尾引号）。
 *
 * 模板里出现 `${` 就标记 `dynamic`：插值后的长度不是静态事实，解析器对它弃权。
 */
function readQuotedLiteral(text, start) {
  const quote = text[start]
  let i = start + 1
  while (i < text.length) {
    const ch = text[i]
    if (ch === '\\') { i += 2; continue }
    if (ch === quote) return { raw: text.slice(start, i + 1), dynamic: false, end: i + 1 }
    if (quote === '`' && ch === '$' && text[i + 1] === '{') return { raw: '', dynamic: true, end: i }
    i += 1
  }
  return null
}

/**
 * 引号字面量（含引号）按 JS 语义还原后的字符数——`.length` 口径（UTF-16 code unit）。
 *
 * 拿不准的转义返回 `null`（整个段落弃权），绝不猜：这条判据宁可漏报（运行时兜底）
 * 不能误报（CI 红得没有道理就没人信它）。
 */
function quotedLength(raw) {
  const body = raw.slice(1, -1)
  let length = 0
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i]
    if (ch !== '\\') { length += 1; continue }
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
        // `.length` 数的是 UTF-16 unit： astral 字面量（`\u{1F600}`）占 2。
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
function skipWhitespaceAndComments(text, i) {
  for (;;) {
    const ch = text[i]
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i += 1; continue }
    if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i += 1
      continue
    }
    if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      i = end === -1 ? text.length : end + 2
      continue
    }
    return i
  }
}

/**
 * 解析一个「+ 链」：字面量与同文件 const 标识符的拼接，返回 `{ length, end }`。
 *
 * 终止符只认语句收尾（换行 / 分号 / 逗号 / 闭括号 / EOF / 下一个标识符——最后一项
 * 是无分号风格里「下一条语句开始了」的形态）。`?` `.` `(` 等说明这不是纯 + 链
 * （三元 / 成员访问 / 调用），返回 `null` 弃权——量错的长度比不量更糟。
 */
function resolveChainLength(text, start, consts, seen = new Set()) {
  let i = start
  let total = 0
  for (;;) {
    i = skipWhitespaceAndComments(text, i)
    const ch = text[i]
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
      // 嵌套只贡献长度：外层链从**这个标识符 token 的结尾**继续（嵌套返回的 end 在
      // 常量自己的 RHS 里，拿它续外层会把 `A + B` 量成只有 A——真仓探针抓到过）。
      termEnd = i + name.length
    }
    const next = skipWhitespaceAndComments(text, termEnd)
    if (text[next] === '+') { i = next + 1; continue }
    if (
      text[next] === undefined || text[next] === '\n' || text[next] === '\r' ||
      text[next] === ';' || text[next] === ',' || text[next] === ')' || text[next] === '}' ||
      text[next] === ']' || /^[A-Za-z0-9_$]/u.test(text[next] ?? '')
    ) {
      return { length: total, end: next }
    }
    return null
  }
}

/** 从 `openParenIndex` 读一对配平的括号（字符串与注释感知），返回 `{ start, end }`（内区间）。 */
function readBalancedParens(text, openParenIndex) {
  let depth = 0
  let i = openParenIndex
  while (i < text.length) {
    const ch = text[i]
    if (ch === '\'' || ch === '"' || ch === '`') {
      const literal = readQuotedLiteral(text, i)
      if (literal === null) return null
      i = literal.end
      continue
    }
    if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i += 1
      continue
    }
    if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      if (end === -1) return null
      i = end + 2
      continue
    }
    if (ch === '(') depth += 1
    else if (ch === ')') {
      depth -= 1
      if (depth === 0) return { start: openParenIndex + 1, end: i }
    }
    i += 1
  }
  return null
}

/**
 * 扫一个文件里的 `registerLiteralSection(` 调用点，量 `text` 的静态长度。
 *
 * 取值规则：`text:` 的值多数是同文件常量（`text: DOCKER_GUIDANCE`），所以按
 * 「+ 链」解析（字面量 + 同文件 const，允许跨行与注释）；解析不到（import 进来的、
 * 函数形态、变量传入、对象简写背后的非字面量）**跳过**——那部分由 kit 的运行时
 * 预算兜底（截断 + 告警一次），静态守卫只对能便宜量出来的部分负责。
 */
function findBudgetViolationsInFile(text, pkg, rel) {
  const violations = []
  const consts = collectSameFileConsts(text)
  for (const match of text.matchAll(REGISTER_CALL)) {
    const lineStart = text.lastIndexOf('\n', match.index) + 1
    const lineEnd = text.indexOf('\n', match.index)
    const lineHead = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trimStart()
    // 注释里提到这个调用是正常的（判据 1 的扫描同样豁免注释行）
    if (lineHead.startsWith('*') || lineHead.startsWith('//') || lineHead.startsWith('/*')) continue
    const args = readBalancedParens(text, match.index + match[0].length - 1)
    if (args === null) continue
    const region = text.slice(args.start, args.end)
    const nameMatch = /[{,]\s*name\s*:\s*(?:'([^']*)'|"([^"]*)"|`([^`]*)`)/u.exec(region)
    const sectionName = nameMatch === null ? '?' : (nameMatch[1] ?? nameMatch[2] ?? nameMatch[3])
    const line = text.slice(0, match.index).split('\n').length
    const where = `packages/${pkg}/src/${rel}:${line}`

    let resolved = null
    const explicit = /[{,]\s*text\s*:/u.exec(region)
    if (explicit !== null) {
      resolved = resolveChainLength(text, args.start + explicit.index + explicit[0].length, consts)
    } else {
      // 对象简写 `{ text }`：值是同名标识符，同样回查同文件 const
      const shorthand = /[{,]\s*text\s*[,}]/u.exec(region)
      if (shorthand !== null) {
        const rhsStart = consts.get('text')
        if (rhsStart !== undefined) resolved = resolveChainLength(text, rhsStart, consts)
      }
    }
    if (resolved === null) continue
    if (resolved.length > SECTION_LITERAL_BUDGET) {
      violations.push(
        `${where}：段落 ${sectionName} 静态正文 ${resolved.length} 字符，超过审查线 ${SECTION_LITERAL_BUDGET}` +
          '——给这段瘦身，或显式传 maxChars 并写明理由',
      )
    }
  }
  return violations
}

/**
 * 判据 4：静态段落正文超审查线 → CI 红。
 *
 * @param repoRoot - 仓库根
 * @returns 违规描述数组（空 = 通过）
 */
export function checkSectionBudgets(repoRoot = REPO_ROOT) {
  const violations = []
  let packages
  try {
    packages = readdirSync(join(repoRoot, 'packages'))
  } catch {
    return ['读不到 packages/ 目录：预算扫描面为空，这道闸会恒绿']
  }
  for (const pkg of packages.sort()) {
    const srcDir = join(repoRoot, 'packages', pkg, 'src')
    try {
      if (!statSync(srcDir).isDirectory()) continue
    } catch {
      continue
    }
    for (const full of listSourceFilesRecursive(srcDir)) {
      const rel = full.slice(srcDir.length + 1)
      violations.push(...findBudgetViolationsInFile(readFileSync(full, 'utf8'), pkg, rel))
    }
  }
  return violations
}

/** 递归列出一个目录下的源码文件（返回绝对路径）。 */
function listSourceFilesRecursive(dir) {
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
    if (info.isDirectory()) files.push(...listSourceFilesRecursive(full))
    else if (BUDGET_SOURCE_FILE.test(name)) files.push(full)
  }
  return files
}

/* CLI（人工与 CI 走这条；纯判定函数由 scripts/test/ 覆盖） */
if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  const offenders = findSectionOffenders()
  const implViolations = checkLiteralSectionImplementation()
  const adoptionViolations = checkAdoption()
  const budgetViolations = checkSectionBudgets()
  const failures = [
    ...offenders.map((line) => `裸调 systemPrompt.section()（应改用 kit 的 registerLiteralSection）：${line}`),
    ...implViolations,
    ...adoptionViolations,
    ...budgetViolations,
  ]
  if (failures.length > 0) {
    for (const failure of failures) console.error('[check-prompt-sections] ' + failure)
    console.error('')
    console.error('为什么：宿主 section() 缺省 interpolate:true，正文里的 {{name}} 会被当成变量引用，')
    console.error('未知变量在**每一步请求**上 throw——整个会话发不出请求（外部测评 issue #14 第 1 条）。')
    console.error('本仓段落的正文都含外部内容（用户 Prompt / 订阅源标题 / 命令输出），所以一律不插值；')
    console.error('正文长度同理——静态超审查线在 CI 红，超运行时上限（kit DEFAULT_SECTION_MAX_CHARS）才截断告警。')
    process.exit(1)
  }
  console.log('[check-prompt-sections] 通过：没有裸调 section()，registerLiteralSection 固定 interpolate:false，静态段落都在预算内')
}
