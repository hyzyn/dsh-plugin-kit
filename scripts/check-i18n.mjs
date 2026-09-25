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
import vm from 'node:vm'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/* ------------------------------------------------------------------ *
 * 纯逻辑（导出仅供 scripts/test/i18n.test.ts）
 * ------------------------------------------------------------------ */

/**
 * 从客户端半体源码里取出目录块。
 *
 * 约定（docs/i18n.md）：`/* ==== dsh-i18n:begin ==== *\/` 与 `...end...` 之间是一段
 * 可独立求值的脚本，声明 `I18N_NS` / `I18N_ZH` / `I18N_EN` 三个常量。用 `node:vm`
 * 求值而不是自己解析对象字面量：目录里会出现引号、反斜杠与 `}`，手写解析迟早漏一种。
 * @param {string} text 客户端半体源码
 * @returns {{ ns: string, zh: Record<string, string>, en: Record<string, string>, body: string } | { error: string } | undefined}
 */
export function parseCatalogBlock(text) {
  const beginAt = text.indexOf('dsh-i18n:begin')
  const endAt = text.indexOf('dsh-i18n:end')
  if (beginAt === -1 || endAt === -1 || endAt < beginAt) return undefined
  const bodyStart = text.indexOf('*/', beginAt)
  const bodyEnd = text.lastIndexOf('/*', endAt)
  if (bodyStart === -1 || bodyEnd === -1 || bodyEnd < bodyStart) return { error: '目录标记不完整（begin/end 不在注释里）' }
  const body = text.slice(bodyStart + 2, bodyEnd)
  let value
  try {
    value = vm.runInNewContext(`(function () {\n${body}\n;return { ns: I18N_NS, zh: I18N_ZH, en: I18N_EN } })()`, {})
  } catch (error) {
    return { error: '目录块求值失败：' + (error instanceof Error ? error.message : String(error)) }
  }
  const ns = value?.ns
  if (typeof ns !== 'string' || ns.trim() === '') return { error: 'I18N_NS 必须是命名空间字符串（= 插件 id）' }
  if (typeof value.zh !== 'object' || value.zh === null) return { error: 'I18N_ZH 必须是对象字面量' }
  if (typeof value.en !== 'object' || value.en === null) return { error: 'I18N_EN 必须是对象字面量' }
  return { ns, zh: value.zh, en: value.en, body }
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
  const start = body.indexOf(name)
  if (start === -1) return []
  const open = body.indexOf('{', start)
  if (open === -1) return []
  let depth = 0
  let quote = null
  let end = -1
  for (let i = open; i < body.length; i += 1) {
    const char = body[i]
    if (quote !== null) {
      if (char === '\\') { i += 1; continue }
      if (char === quote) quote = null
      continue
    }
    if (char === "'" || char === '"' || char === '`') { quote = char; continue }
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) { end = i; break }
    }
  }
  if (end === -1) return []
  const slice = body.slice(open + 1, end)
  const keys = []
  const re = /(^|\n)\s*'([^'\n]+)'\s*:/g
  let match
  while ((match = re.exec(slice)) !== null) keys.push(match[2])
  return keys
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
    const raw = rawCatalogKeys(catalog.body, name)
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

  if (zhKeys.length === 0) warnings.push('目录是空的')
  return { errors, warnings }
}

/**
 * 去掉注释（保留字符串字面量）——扫描用法前必须先做掉：本仓的注释里就写着
 * `t('…')` 这种示例，直接把注释当代码扫会凭空报一个「缺键 '…'」。
 * @param {string} text 源码
 * @returns {string} 去掉注释的等长替换（字符串内的注释符保持原样）
 */
export function stripComments(text) {
  let out = ''
  let quote = null
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quote !== null) {
      out += char
      if (char === '\\') { out += text[i + 1] ?? ''; i += 1; continue }
      if (char === quote) quote = null
      continue
    }
    if (char === "'" || char === '"' || char === '`') { quote = char; out += char; continue }
    if (char === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') { out += ' '; i += 1 }
      out += '\n'
      continue
    }
    if (char === '/' && text[i + 1] === '*') {
      out += '  '
      i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) { out += text[i] === '\n' ? '\n' : ' '; i += 1 }
      out += '  '
      i += 1
      continue
    }
    out += char
  }
  return out
}

/**
 * 扫出代码里用到的键。
 *
 * 只认「独立的 `t('…')` / `t("…")`」：前置字符不能是词字符 / `.` / `$`（这样
 * `translate(`、`element.transform(`、CSS 里的 `translate(` 都不会误命中）。
 * 模板串或拼出来的键（`t('row.' + i)`、`` t(`row.${i}`) ``）无法静态校验，单独回报
 * ——**不静默忽略**（本仓「截断要有信号」那条规矩同样适用于闸门的覆盖能力）。
 * @param {string} text 已去注释的源码
 * @returns {{ keys: string[], dynamic: string[] }}
 */
export function scanUsage(text) {
  const keys = []
  const dynamic = []
  const re = /(?<![\w$.])t\(\s*(['"])((?:[^'"\\\n]|\\.)*)\1/g
  let match
  while ((match = re.exec(text)) !== null) {
    const after = text.slice(re.lastIndex).match(/^\s*([+\]])?/)
    const key = match[2]
    if ((after !== null && after[1] === '+') || key.endsWith('.')) dynamic.push(key + '…')
    else keys.push(key)
  }
  const templateRe = /(?<![\w$.])t\(\s*`/g
  while (templateRe.exec(text) !== null) dynamic.push('`…`')
  return { keys: [...new Set(keys)], dynamic }
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

/** 找出所有客户端半体：client-src/index.js 优先（有构建步骤的包），否则 client.js。 */
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
    for (const relative of ['client-src/index.js', 'client.js']) {
      try {
        if (statSync(join(dir, relative)).isFile()) {
          found.push({ package: name, file: relative, path: join(dir, relative) })
          break
        }
      } catch {
        /* 不存在就试下一个 */
      }
    }
  }
  return found
}

/**
 * 检查一个客户端半体。
 * @param {{ package: string, file: string }} target
 * @param {string} text 源码
 * @returns {{ applied: boolean, errors: string[], warnings: string[] }}
 */
export function checkClientHalf(target, text) {
  const parsed = parseCatalogBlock(text)
  if (parsed === undefined) return { applied: false, errors: [], warnings: [] }
  if ('error' in parsed) return { applied: true, errors: [parsed.error], warnings: [] }
  const catalog = checkCatalog(parsed, target.package)
  const usage = scanUsage(stripComments(text))
  const coverage = checkCoverage(parsed, usage)
  const installer = checkInstaller(text)
  return {
    applied: true,
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
    const result = checkClientHalf(half, text)
    if (!result.applied) { missing.push(half.package); continue }
    const parsed = parseCatalogBlock(text)
    const keys = parsed !== undefined && !('error' in parsed) ? Object.keys(parsed.zh).length : 0
    rows.push({ half, keys, ...result })
  }

  let failed = false
  for (const row of rows) {
    const where = `${row.half.package}/${row.half.file}`
    if (row.errors.length > 0) {
      failed = true
      console.error(`[check-i18n] ${where}：${row.errors.length} 处问题`)
      for (const error of row.errors) console.error('  ✘ ' + error)
    } else {
      console.log(`[check-i18n] ${where}：${row.keys} 条键，zh/en 一致，用法命中`)
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

  // 目录块：解析 + 求值
  const good = `const x = 1\n/* ==== dsh-i18n:begin ==== */\nconst I18N_NS = 'demo'\nconst I18N_ZH = {\n  'a.b': '甲 {n}',\n  'a.c': '丙',\n}\nconst I18N_EN = {\n  'a.b': 'A {n}',\n  'a.c': 'C',\n}\n/* ==== dsh-i18n:end ==== */\n`
  const parsed = parseCatalogBlock(good)
  expect('解析目录块', parsed !== undefined && !('error' in parsed) && parsed.ns, 'demo')
  expect('无标记 → undefined', parseCatalogBlock('const a = 1'), undefined)
  expect('没有 end 标记 → undefined（= 未接入）', parseCatalogBlock('/* dsh-i18n:begin */'), undefined)
  expect('标记不在注释里 → error', typeof (parseCatalogBlock('dsh-i18n:begin\ndsh-i18n:end') ?? {}).error, 'string')

  // 键集 / 占位符 / 重复键
  const parity = checkCatalog(parseCatalogBlock(good), 'demo')
  expect('一致的目录零错误', parity.errors, [])
  const missingEn = checkCatalog(parseCatalogBlock(good.replace("  'a.c': 'C',\n", '')), 'demo')
  expect('英文缺键 → 报错', missingEn.errors.some((line) => line.includes('英文目录缺 1 条键')), true)
  const badNs = checkCatalog(parseCatalogBlock(good), 'other')
  expect('命名空间不符 → 报错', badNs.errors.some((line) => line.includes('与包名不一致')), true)
  const paramMismatch = checkCatalog(parseCatalogBlock(good.replace("'a.b': 'A {n}'", "'a.b': 'A'")), 'demo')
  expect('占位符不一致 → 报错', paramMismatch.errors.some((line) => line.includes('占位符不一致')), true)
  const dup = parseCatalogBlock(good.replace("  'a.c': '丙',", "  'a.b': '重复',\n  'a.c': '丙',"))
  expect('重复键 → 报错', checkCatalog(dup, 'demo').errors.some((line) => line.includes('重复键')), true)
  const empty = checkCatalog(parseCatalogBlock(good.replace("'a.c': '丙'", "'a.c': '   '")), 'demo')
  expect('空值 → 报错', empty.errors.some((line) => line.includes('空值')), true)

  // 用法扫描
  const usage = scanUsage(stripComments("const a = t('a.b')\nconst b = t(\"a.c\")\nconst c = t('row.' + i)\nconst d = t(`row.${i}`)\n// t('注释里的示例')\nconst e = translate('x')\nconst f = el.transform('y')\n"))
  expect('只扫独立的 t(…)', usage.keys, ['a.b', 'a.c'])
  expect('动态键单独回报', usage.dynamic.length, 2)
  expect('注释里的 t(…) 不算', usage.keys.includes('注释里的示例'), false)
  expect('translate( / .transform( 不误命中', scanUsage('translate("x")\nfoo.transform("y")').keys, [])

  // 覆盖
  const okCoverage = checkCoverage(parseCatalogBlock(good), scanUsage("t('a.b')\nt('a.c')"))
  expect('全部命中零错误', okCoverage.errors, [])
  const missingKey = checkCoverage(parseCatalogBlock(good), scanUsage("t('a.zzz')"))
  expect('用而未定义 → 报错', missingKey.errors.some((line) => line.includes('a.zzz')), true)
  const unusedKey = checkCoverage(parseCatalogBlock(good), scanUsage("t('a.b')"))
  expect('定义而未用 → 只告警', unusedKey.errors, [])
  expect('未用键进告警', unusedKey.warnings.some((line) => line.includes('a.c')), true)

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
