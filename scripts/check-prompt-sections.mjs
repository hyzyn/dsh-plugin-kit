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
 * ## 两条判据
 *
 * 1. **`packages/*​/src/**` 里不允许出现裸 `systemPrompt.section(...)` 调用**——必须走
 *    kit 的 `registerLiteralSection(api, options)`（它固定 `interpolate: false`）。
 *    这条把「忘了传」变成「根本传不了」。
 * 2. **kit 的 `registerLiteralSection` 必须真的传 `interpolate: false`**——闸门认的那个
 *    逃生口本身被改坏时，判据 1 会变成一道恒绿的假闸门（比没有更坏）。
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

/* CLI（人工与 CI 走这条；纯判定函数由 scripts/test/ 覆盖） */
if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  const offenders = findSectionOffenders()
  const implViolations = checkLiteralSectionImplementation()
  const adoptionViolations = checkAdoption()
  const failures = [
    ...offenders.map((line) => `裸调 systemPrompt.section()（应改用 kit 的 registerLiteralSection）：${line}`),
    ...implViolations,
    ...adoptionViolations,
  ]
  if (failures.length > 0) {
    for (const failure of failures) console.error('[check-prompt-sections] ' + failure)
    console.error('')
    console.error('为什么：宿主 section() 缺省 interpolate:true，正文里的 {{name}} 会被当成变量引用，')
    console.error('未知变量在**每一步请求**上 throw——整个会话发不出请求（外部测评 issue #14 第 1 条）。')
    console.error('本仓段落的正文都含外部内容（用户 Prompt / 订阅源标题 / 命令输出），所以一律不插值。')
    process.exit(1)
  }
  console.log('[check-prompt-sections] 通过：没有裸调 section()，且 registerLiteralSection 固定 interpolate:false')
}
