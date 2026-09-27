#!/usr/bin/env node
/**
 * 面板端 i18n 的静态闸门（项目级 ROADMAP 第 3 项；方案见 docs/i18n.md）。
 *
 * 为什么需要它：目录是**双份**的（zh + en），而「两份必然漂」正是本仓反复出现的反模式
 * （见 docker DEFECTS 的「通用反模式」行）。人会漏掉的是三件事，恰好都是机器能查的：
 *   1. 键集不一致——英文目录少一条，界面在该语言下露出键名 `card.name`；
 *   2. 占位符不一致——`{count}` 只写在一边，文案静默少一个数；
 *   3. **用法与目录对不上**——`t('btn.save')` 写错一个字母，界面露出键名，而没有测试会红。
 * 第 3 条是本闸门存在的主要理由：它把「界面文案」变成有静态检查的资产。
 *
 * 规范的承载者只有一处：**宿主自己的 `@deepseek-ai/dsh-client-locale`**（`ctx.locale`）。
 * 本仓不引共享浏览器模块、不建新包（理由见 docs/i18n.md「为什么不建共享模块」），
 * 所以每个包的安装代码是同一段规范片段**照抄**——本闸门顺带检查它没有被抄歪。
 *
 * 用法：
 *   node scripts/check-i18n.mjs               # 全仓检查（CI / pre-commit）
 *   node scripts/check-i18n.mjs --self-test   # 自检纯逻辑（CI 用）
 *
 * 静态闸门**不是**替代品：它保证键集与用法一致，不保证译文质量，也看不见运行期
 * （例如宿主没有 locale 服务时 `t` 是否真的退回了中文兜底——那由每包的单测与真机验收）。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/* ------------------------------------------------------------------ *
 * 纯逻辑（导出仅供 scripts/test/i18n.test.ts）
 * ------------------------------------------------------------------ */

/**
 * 解析层刻意走 **TypeScript 的 AST**（`ts.createSourceFile(..., ScriptKind.JS)`，与
 * `scripts/client-host-url.mjs` 同一套），不是正则：
 *
 * 第一版用「去注释 + 正则扫字面量」写得又快又短，但它在**正则字面量**上必错——
 * 客户端半体里就有 `String(value).replace(/[&<>"']/g, …)`，那个 `'` 会被当成字符串起点，
 * 之后整段文件的「是否在字符串里」状态翻转，后果是**静默的**：注释里的 `t('…')` 被算成用法、
 * 真用法被漏掉。而本闸门的全部价值就在这两件事上。
 *
 * 解析器看得见语法结构，于是：目录键（含重复键）从对象字面量直接读、`t('…')` 从
 * `CallExpression` 直接读、中文字面量从 `StringLiteral` 节点直接数——都不受注释与正则影响。
 */

/** 深度优先遍历（`forEachChild` 覆盖所有节点类型）。 */
function walk(node, visit) {
  visit(node)
  node.forEachChild((child) => walk(child, visit))
}

/** 把一段源码解析成 AST（客户端半体是 JS，无一例 JSX 语法，与本仓另一道静态闸门同口径）。 */
function parseSource(fileName, text) {
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
}

/** 字面量节点的文本（字符串 / 无插值模板）；不是字面量返回 undefined。 */
function literalText(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  return undefined
}

/** 从对象字面量读出 `{ 键: 值 }`；`raw` 含重复键（JS 后写覆盖前写，但闸门要能看见）。 */
function readDict(initializer) {
  if (initializer === undefined || !ts.isObjectLiteralExpression(initializer)) return undefined
  const dict = {}
  const raw = []
  for (const property of initializer.properties) {
    if (!ts.isPropertyAssignment(property)) continue
    const name = ts.isStringLiteral(property.name) || ts.isIdentifier(property.name) ? property.name.text : undefined
    if (name === undefined) continue
    raw.push(name)
    const value = literalText(property.initializer)
    if (value !== undefined) dict[name] = value
  }
  return { dict, raw }
}

/**
 * 从客户端半体源码里取出目录块。
 *
 * 约定（docs/i18n.md）：`/* ==== dsh-i18n:begin ==== *\/` 与 `...end...` 之间是一段
 * 声明 `I18N_NS` / `I18N_ZH` / `I18N_EN` 三个常量的脚本。
 * @param {string} text 客户端半体源码
 * @returns {{ ns: string, zh: Record<string, string>, en: Record<string, string>, raw: { zh: string[], en: string[] }, body: string } | { error: string } | undefined}
 */
export function parseCatalogBlock(text) {
  const beginAt = text.indexOf('dsh-i18n:begin')
  const endAt = text.indexOf('dsh-i18n:end')
  if (beginAt === -1 || endAt === -1 || endAt < beginAt) return undefined
  const bodyStart = text.indexOf('*/', beginAt)
  const bodyEnd = text.lastIndexOf('/*', endAt)
  if (bodyStart === -1 || bodyEnd === -1 || bodyEnd < bodyStart) return { error: '目录标记不完整（begin/end 不在注释里）' }
  const body = text.slice(bodyStart + 2, bodyEnd)
  const declarations = new Map()
  for (const statement of parseSource('dsh-i18n.js', body).statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) declarations.set(declaration.name.text, declaration.initializer)
    }
  }
  const nsInit = declarations.get('I18N_NS')
  if (nsInit === undefined || !ts.isStringLiteral(nsInit) || nsInit.text.trim() === '') {
    return { error: 'I18N_NS 必须是非空字符串字面量（= 插件 id）' }
  }
  const zh = readDict(declarations.get('I18N_ZH'))
  const en = readDict(declarations.get('I18N_EN'))
  if (zh === undefined) return { error: 'I18N_ZH 必须是对象字面量' }
  if (en === undefined) return { error: 'I18N_EN 必须是对象字面量' }
  return { ns: nsInit.text, zh: zh.dict, en: en.dict, raw: { zh: zh.raw, en: en.raw }, body }
}

/**
 * 对象字面量里**写字面量按键**的次数（含重复）。
 *
 * 为什么要单独数一遍：JS 允许重复键、后写覆盖前写，`{'a':'甲','a':'乙'}` 是完全合法的
 * 代码而求值后只剩一条——闸门必须能看见「有人抄目录时把同一键写了两遍」。
 * @param {string} body 目录块正文
 * @param {string} name 常量名（I18N_ZH / I18N_EN）
 * @returns {string[]} 出现的键（按出现顺序，含重复）
 */
export function rawCatalogKeys(body, name) {
  const declarations = new Map()
  for (const statement of parseSource('dsh-i18n.js', body).statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) declarations.set(declaration.name.text, declaration.initializer)
    }
  }
  return readDict(declarations.get(name))?.raw ?? []
}

/** 一条文案里的 `{name}` 参数名（去重排序）。 */
export function placeholders(text) {
  const names = []
  const re = /\{(\w+)\}/g
  let match
  while ((match = re.exec(String(text))) !== null) names.push(match[1])
  return [...new Set(names)].sort()
}

/**
 * 目录自检：键集、占位符、空值、重复键、命名空间。
 * @param {{ ns: string, zh: Record<string, string>, en: Record<string, string>, body: string }} catalog
 * @param {string} expectedNs 该包应有的命名空间（目录名）
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function checkCatalog(catalog, expectedNs) {
  const errors = []
  const warnings = []
  if (catalog.ns !== expectedNs) errors.push(`I18N_NS='${catalog.ns}' 与包名不一致（应为 '${expectedNs}'，见 conventions § 命名）`)

  for (const [name, dict] of [['I18N_ZH', catalog.zh], ['I18N_EN', catalog.en]]) {
    const raw = (name === 'I18N_ZH' ? catalog.raw?.zh : catalog.raw?.en) ?? rawCatalogKeys(catalog.body, name)
    const unique = [...new Set(raw)]
    if (raw.length !== unique.length) {
      const dup = raw.filter((key, index) => raw.indexOf(key) !== index)
      errors.push(`${name} 有重复键（后写覆盖前写，会被静默吞掉）：${[...new Set(dup)].join('、')}`)
    }
    const missing = unique.filter((key) => Object.keys(dict).indexOf(key) === -1)
    if (missing.length > 0) errors.push(`${name} 的字面量键未被求值出来（值不是字符串？）：${missing.join('、')}`)
    for (const [key, value] of Object.entries(dict)) {
      if (typeof value !== 'string' || value.trim() === '') errors.push(`${name}['${key}'] 是空值或非字符串`)
    }
  }

  const zhKeys = Object.keys(catalog.zh)
  const enKeys = Object.keys(catalog.en)
  const missingEn = zhKeys.filter((key) => enKeys.indexOf(key) === -1)
  const missingZh = enKeys.filter((key) => zhKeys.indexOf(key) === -1)
  if (missingEn.length > 0) errors.push(`英文目录缺 ${missingEn.length} 条键：${missingEn.join('、')}（该语言下会露出键名）`)
  if (missingZh.length > 0) errors.push(`中文目录缺 ${missingZh.length} 条键：${missingZh.join('、')}`)

  for (const key of zhKeys) {
    if (enKeys.indexOf(key) === -1) continue
    const zhParams = placeholders(catalog.zh[key]).join(',')
    const enParams = placeholders(catalog.en[key]).join(',')
    if (zhParams !== enParams) errors.push(`占位符不一致 ['${key}']：zh(${zhParams || '无'}) ≠ en(${enParams || '无'})`)
  }

  for (const key of zhKeys) {
    const domain = key.split('.')[0]
    if (!key.includes('.')) errors.push(`键名 '${key}' 没有域前缀（规范是 \`域.名\`，见 docs/i18n.md § 键名规范）`)
    else if (!KEY_DOMAINS.has(domain)) errors.push(`键名 '${key}' 的域 '${domain}' 不在白名单里（要在 docs/i18n.md § 键名规范 里先加一行，别各自发明）`)
  }

  if (zhKeys.length === 0) warnings.push('目录是空的')
  return { errors, warnings }
}

/** 键名域白名单（docs/i18n.md § 键名规范）：域只有一个词，`域.名` 用点分层。 */
export const KEY_DOMAINS = new Set([
  // 界面骨架
  'card', 'panel', 'list', 'btn', 'msg', 'error', 'placeholder',
  // 设置卡片 / 表单
  'field', 'option', 'check', 'editor', 'section',
  // 列表项上的徽标与状态
  'badge', 'status',
  // 面板内的说明与元信息
  'hint', 'banner', 'meta', 'elev',
  // 具体动作的提示与确认
  'prompt', 'confirm',
  // 包内特有的分组
  'version', 'ab',
])

/**
 * 中文判定：**汉字 + 全角标点**。
 *
 * 只认 `[\u4e00-\u9fff]` 会漏掉一整类没翻的文案：`web（base + web-app）` 的括号是全角
 * （U+FF08/U+FF09），里面没有一个汉字——闸门打出「0 条」而界面在英文下仍然露着中文标点。
 * 所以范围取汉区 + CJK 标点（U+3000–U+303F）+ 全角形式（U+FF01–U+FF5E）。
 * 代价是 `.join('、')` 这类**代码里的分隔符**也会被数进来——它是度量不是判据，人来判断即可。
 */
const CJK = /[\u4e00-\u9fff\u3000-\u303f\uff01-\uff5e]/

/**
 * 客户端半体里**还剩多少条含中文的字符串字面量**。
 *
 * 这是**迁移进度**的度量，不是成败判据：品牌词（`Kit`）、语法示例（`js:process.env.XXX`）、
 * 宿主返回的错误正文都不该被翻，所以它只会作为一个数字打在成功行上供人复核
 * （闸门读不懂语义，判断「这条该不该翻」是人的事）。
 *
 * 走 AST：只有真的字符串 / 模板字面量才算，注释与正则字面量里的中文不算
 * （`/[&<>"']/` 这种正则曾把第一版的手写扫描器带偏）。
 * @param {string} text 源码
 * @returns {number}
 */
export function countCjkLiterals(text) {
  let count = 0
  walk(parseSource('client.js', text), (node) => {
    if (node.kind === ts.SyntaxKind.TemplateHead || node.kind === ts.SyntaxKind.TemplateMiddle) {
      if (CJK.test(node.text)) count += 1
      return
    }
    const literal = literalText(node)
    if (literal !== undefined && CJK.test(literal)) count += 1
  })
  return count
}

/**
 * 扫出代码里用到的键。
 *
 * 只认 `t('…')` / `t("…")` / 无插值模板这种**字面量实参**的调用；`foo.t(...)`、
 * `translate(...)` 都不算（AST 精确到 callee 是标识符 `t`）。实参是拼出来的
 * （`t('row.' + i)`）或带插值的模板（`` t(`row.${i}`) ``）时**单独回报**——无法静态校验，
 * 但**不静默忽略**（本仓「截断要有信号」那条规矩同样适用于闸门的覆盖能力）。
 * @param {string} text 源码
 * @returns {{ keys: string[], dynamic: string[] }}
 */
export function scanUsage(text) {
  const sourceFile = parseSource('client.js', text)
  const keys = []
  const dynamic = []
  walk(sourceFile, (node) => {
    if (!ts.isCallExpression(node)) return
    if (!ts.isIdentifier(node.expression) || node.expression.text !== 't' || node.arguments.length === 0) return
    const argument = node.arguments[0]
    const literal = literalText(argument)
    if (literal !== undefined) keys.push(literal)
    else dynamic.push(argument.getText(sourceFile).replace(/\s+/g, ' ').slice(0, 40))
  })
  return { keys: [...new Set(keys)], dynamic: [...new Set(dynamic)] }
}

/**
 * 用法 ↔ 目录 的对账。
 * @param {{ zh: Record<string, string> }} catalog
 * @param {{ keys: string[], dynamic: string[] }} usage
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function checkCoverage(catalog, usage) {
  const errors = []
  const warnings = []
  const missing = usage.keys.filter((key) => catalog.zh[key] === undefined)
  if (missing.length > 0) errors.push(`代码里用到的键在目录里没有定义（界面会露出键名）：${missing.join('、')}`)
  const unused = Object.keys(catalog.zh).filter((key) => usage.keys.indexOf(key) === -1)
  if (unused.length > 0) warnings.push(`目录里有 ${unused.length} 条没被静态扫到（可能是死键，也可能是动态拼接）：${unused.join('、')}`)
  if (usage.dynamic.length > 0) warnings.push(`有动态键无法静态校验（${usage.dynamic.length} 处）：${usage.dynamic.slice(0, 5).join('、')}`)
  return { errors, warnings }
}

/**
 * 安装代码是否照抄了规范片段（docs/i18n.md）。
 *
 * 为什么这条也要机器查：没有共享浏览器模块可用（插件之间不许互相 import、kit 没有
 * 浏览器面），每个包都是**照抄同一段**——抄歪了就会出现「有的包会随语言切、有的包永远
 * 中文」这类看起来像偶发的问题。
 * @param {string} text 客户端半体源码
 * @returns {string[]} 缺失项
 */
export function checkInstaller(text) {
  const required = [
    ["installI18n(ctx)", 'apply 里没有调用 installI18n(ctx)'],
    ["ctx.inject(['locale']", '没有动态 inject locale（静态 inject 会让老宿主整张卡片不挂）'],
    ["register(I18N_NS, 'zh'", "没有注册中文目录 c.locale.register(I18N_NS, 'zh', I18N_ZH)"],
    ["register(I18N_NS, 'en'", "没有注册英文目录 c.locale.register(I18N_NS, 'en', I18N_EN)"],
    ['i18nFallback', '没有中文兜底（没有 locale 服务的宿主上会露出键名）'],
  ]
  return required.filter(([needle]) => !text.includes(needle)).map(([, message]) => message)
}

/* ------------------------------------------------------------------ *
 * 仓库级检查
 * ------------------------------------------------------------------ */

/**
 * 找出所有客户端半体。
 *
 * - `file` / `path`：**主半体**（目录块住在这里）：有构建步骤的包是 `client-src/index.js`，
 *   否则是 `client.js`；
 * - `sources`：该包的**全部**客户端半体源码（`client-src/*.js`，或只有 `client.js`）。
 *   用法扫描与「剩余中文」度量都跑在全部源上——`tty` / `docker` 的 UI 文案散在
 *   `stats-bar.js` / `log-buffer.js` 这类兄弟模块里，只看主半体会漏。
 */
export function listClientHalves(packagesDir) {
  const found = []
  for (const name of readdirSync(packagesDir)) {
    if (name.startsWith('.')) continue
    const dir = join(packagesDir, name)
    try {
      if (!statSync(dir).isDirectory()) continue
    } catch {
      continue
    }
    const main = ['client-src/index.js', 'client.js'].find((relative) => {
      try {
        return statSync(join(dir, relative)).isFile()
      } catch {
        return false
      }
    })
    if (main === undefined) continue
    const sources = []
    if (main.startsWith('client-src/')) {
      for (const entry of readdirSync(join(dir, 'client-src'))) {
        if (!entry.endsWith('.js')) continue
        sources.push({ file: 'client-src/' + entry, path: join(dir, 'client-src', entry) })
      }
    }
    if (sources.length === 0) sources.push({ file: main, path: join(dir, main) })
    found.push({ package: name, file: main, path: join(dir, main), sources })
  }
  return found
}

/**
 * 检查一个客户端半体。
 * @param {{ package: string, file: string }} target
 * @param {string} text 主半体源码（目录块住这里）
 * @param {string[]} usageTexts 兄弟半体源码（用法扫描与中文度量都算上）
 * @returns {{ applied: boolean, errors: string[], warnings: string[], keys: number, cjk: number }}
 */
export function checkClientHalf(target, text, usageTexts = []) {
  const parsed = parseCatalogBlock(text)
  if (parsed === undefined) return { applied: false, errors: [], warnings: [], keys: 0, cjk: 0 }
  if ('error' in parsed) return { applied: true, errors: [parsed.error], warnings: [], keys: 0, cjk: 0 }
  const catalog = checkCatalog(parsed, target.package)
  const usage = scanUsage(text + '\n' + usageTexts.join('\n'))
  const coverage = checkCoverage(parsed, usage)
  const installer = checkInstaller(text)
  const cjk = countCjkLiterals(text.replace(parsed.body, '')) + usageTexts.reduce((sum, source) => sum + countCjkLiterals(source), 0)
  return {
    applied: true,
    keys: Object.keys(parsed.zh).length,
    cjk,
    errors: [...catalog.errors, ...coverage.errors, ...installer],
    warnings: [...catalog.warnings, ...coverage.warnings],
  }
}

function runGate() {
  const halves = listClientHalves(join(root, 'packages'))
  const rows = []
  const missing = []
  for (const half of halves) {
    const text = readFileSync(half.path, 'utf8')
    const usageTexts = half.sources.filter((source) => source.path !== half.path).map((source) => readFileSync(source.path, 'utf8'))
    const result = checkClientHalf(half, text, usageTexts)
    if (!result.applied) { missing.push(half.package); continue }
    rows.push({ half, ...result })
  }

  let failed = false
  for (const row of rows) {
    const where = `${row.half.package}/${row.half.file}`
    if (row.errors.length > 0) {
      failed = true
      console.error(`[check-i18n] ${where}：${row.errors.length} 处问题`)
      for (const error of row.errors) console.error('  ✘ ' + error)
    } else {
      // 「剩余 CJK 字面量」是进度度量（品牌词 / 语法示例 / 宿主错误正文不该翻），供人复核
      console.log(`[check-i18n] ${where}：${row.keys} 条键，zh/en 一致，用法命中（剩余中文字面量 ${row.cjk} 条）`)
    }
    for (const warning of row.warnings) console.warn('  ⚠ ' + warning)
  }

  console.log(`[check-i18n] 已接入 ${rows.length}/${halves.length} 个客户端半体` + (missing.length > 0 ? `（未接入：${missing.join('、')}）` : ''))
  if (failed) {
    console.error('[check-i18n] 未通过。方案与规范片段见 docs/i18n.md；键集 / 占位符 / 用法三件事都必须一致。')
    process.exit(1)
  }
  console.log('[check-i18n] 通过')
}

/* ------------------------------------------------------------------ *
 * 自检（--self-test）：闸门自己的判据也要有反例
 * ------------------------------------------------------------------ */

function selfTest() {
  const cases = []
  const expect = (name, actual, wanted) => cases.push([name, JSON.stringify(actual) === JSON.stringify(wanted), actual, wanted])

  // 目录块：解析（AST）
  const good = `const x = 1\n/* ==== dsh-i18n:begin ==== */\nconst I18N_NS = 'demo'\nconst I18N_ZH = {\n  'card.b': '甲 {n}',\n  'card.c': '丙',\n}\nconst I18N_EN = {\n  'card.b': 'A {n}',\n  'card.c': 'C',\n}\n/* ==== dsh-i18n:end ==== */\n`
  const parsed = parseCatalogBlock(good)
  expect('解析目录块', parsed !== undefined && !('error' in parsed) && parsed.ns, 'demo')
  expect('无标记 → undefined', parseCatalogBlock('const a = 1'), undefined)
  expect('没有 end 标记 → undefined（= 未接入）', parseCatalogBlock('/* dsh-i18n:begin */'), undefined)
  expect('标记不在注释里 → error', typeof (parseCatalogBlock('dsh-i18n:begin\ndsh-i18n:end') ?? {}).error, 'string')
  expect('目录块残缺（缺 I18N_EN）→ error', typeof (parseCatalogBlock("/* dsh-i18n:begin */\nconst I18N_ZH = {\n/* dsh-i18n:end */") ?? {}).error, 'string')

  // 键集 / 占位符 / 重复键
  const parity = checkCatalog(parseCatalogBlock(good), 'demo')
  expect('一致的目录零错误', parity.errors, [])
  const missingEn = checkCatalog(parseCatalogBlock(good.replace("  'card.c': 'C',\n", '')), 'demo')
  expect('英文缺键 → 报错', missingEn.errors.some((line) => line.includes('英文目录缺 1 条键')), true)
  const badNs = checkCatalog(parseCatalogBlock(good), 'other')
  expect('命名空间不符 → 报错', badNs.errors.some((line) => line.includes('与包名不一致')), true)
  const paramMismatch = checkCatalog(parseCatalogBlock(good.replace("'card.b': 'A {n}'", "'card.b': 'A'")), 'demo')
  expect('占位符不一致 → 报错', paramMismatch.errors.some((line) => line.includes('占位符不一致')), true)
  const dup = parseCatalogBlock(good.replace("  'card.c': '丙',", "  'card.b': '重复',\n  'card.c': '丙',"))
  expect('重复键 → 报错', checkCatalog(dup, 'demo').errors.some((line) => line.includes('重复键')), true)
  expect('全角标点也算中文（只有汉字会漏）', countCjkLiterals("const a = 'web（base）'"), 1)
  const badDomain = checkCatalog(parseCatalogBlock(good.replace("'card.c': '丙'", "'oops.c': '丙'")), 'demo')
  expect('域不在白名单 → 报错', badDomain.errors.some((line) => line.includes("域 'oops' 不在白名单")), true)
  const bare = checkCatalog(parseCatalogBlock(good.replace("'card.c': '丙'", "'nodot': '丙'")), 'demo')
  expect('没有域前缀 → 报错', bare.errors.some((line) => line.includes('没有域前缀')), true)
  const empty = checkCatalog(parseCatalogBlock(good.replace("'card.c': '丙'", "'card.c': '   '")), 'demo')
  expect('空值 → 报错', empty.errors.some((line) => line.includes('空值')), true)

  // 用法扫描
  const usage = scanUsage("const a = t('card.b')\nconst b = t(\"card.c\")\nconst c = t('row.' + i)\nconst d = t(`row.${i}`)\n// t('注释里的示例')\nconst e = translate('x')\nconst f = el.transform('y')\nconst g = /[&<>\"']/g\n")
  expect('只扫独立的 t(…)', usage.keys, ['card.b', 'card.c'])
  expect('动态键单独回报', usage.dynamic.length, 2)
  expect('注释里的 t(…) 不算', usage.keys.includes('注释里的示例'), false)
  expect('translate( / .transform( 不误命中', scanUsage('translate("x")\nfoo.transform("y")').keys, [])
  expect('正则字面量不干扰（第一版手写扫描器就死在这）', scanUsage("const r = /[&<>\"']/g\nconst x = t('card.b')").keys, ['card.b'])

  // 覆盖
  const okCoverage = checkCoverage(parseCatalogBlock(good), scanUsage("t('card.b')\nt('card.c')"))
  expect('全部命中零错误', okCoverage.errors, [])
  const missingKey = checkCoverage(parseCatalogBlock(good), scanUsage("t('card.zzz')"))
  expect('用而未定义 → 报错', missingKey.errors.some((line) => line.includes('card.zzz')), true)
  const unusedKey = checkCoverage(parseCatalogBlock(good), scanUsage("t('card.b')"))
  expect('定义而未用 → 只告警', unusedKey.errors, [])
  expect('未用键进告警', unusedKey.warnings.some((line) => line.includes('card.c')), true)

  // 「剩余中文」度量（走 AST）
  expect('只有字符串字面量计数（注释不算）', countCjkLiterals("const a = '中文'\nconst b = 'ascii'\n// '注释里的中文'"), 1)
  expect('正则里的引号不干扰', countCjkLiterals("const r = /['\"]/g\nconst a = '中文'"), 1)
  expect('模板串也算', countCjkLiterals('const a = `中文 ${x}`'), 1)
  expect('纯 ASCII 为零', countCjkLiterals("const a = 'plain'"), 0)

  // 安装片段
  const installer = checkInstaller('installI18n(ctx)\nctx.inject([\'locale\']\nregister(I18N_NS, \'zh\'\nregister(I18N_NS, \'en\'\ni18nFallback')
  expect('规范片段齐全 → 零缺失', installer, [])
  expect('缺兜底 → 报一条', checkInstaller('installI18n(ctx)').length, 4)

  const failed = cases.filter(([, ok]) => !ok)
  for (const [name, ok, actual, wanted] of cases) {
    if (!ok) console.error(`[check-i18n --self-test] ✘ ${name}：实际 ${JSON.stringify(actual)}，期望 ${JSON.stringify(wanted)}`)
  }
  if (failed.length > 0) process.exit(1)
  console.log(`[check-i18n --self-test] 通过（${cases.length} 条）`)
}

/* ------------------------------------------------------------------ *
 * 入口
 * ------------------------------------------------------------------ */

/**
 * 只在**直接执行**时跑（vitest 会 import 本模块来测纯函数）。
 * 不做这道判断的后果不是「输出难看」：`runGate()` 遇错会 `process.exit(1)`，
 * 而它是在 import 期间跑的——一个包的目录写错会直接打死整跑测试的进程。
 */
const invokedDirectly = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  if (process.argv.slice(2).includes('--self-test')) selfTest()
  else runGate()
}
