/**
 * `scripts/check-i18n.mjs` 的单元测试 —— 面板端 i18n 的静态闸门（项目级 ROADMAP 第 3 项）。
 *
 * 为什么有这份测试：这门闸门守的正是「**两份目录必然漂**」那类问题，而它自己也会漂——
 * 闸门失效是**只会失败、平时不出声**的（全仓接入时全绿），于是：
 *   ① 判据改松（键集比对漏掉一条分支 / 用法扫描写错）→ 界面开始露键名而没人发现；
 *   ② 判据改紧或误报（把注释里的 `t('…')` 当代码扫）→ 对着正确代码报错，最后一定被削弱。
 * 所以每个判据都配一个**反例**（负例），最后一组还拿**真实语料**跑一遍——既证明「上线即绿」，
 * 也拦住以后有人把某个包的目录改歪。
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  checkCatalog,
  checkClientHalf,
  checkCoverage,
  checkInstaller,
  listClientHalves,
  parseCatalogBlock,
  placeholders,
  rawCatalogKeys,
  scanUsage,
  stripComments,
} from '../check-i18n.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** 一份最小可用的目录块（含标记，与 docs/i18n.md 的规范片段一致）。 */
const catalog = (overrides = {}) => {
  const zh = overrides.zh ?? { 'a.b': '甲 {n}', 'a.c': '丙' }
  const en = overrides.en ?? { 'a.b': 'A {n}', 'a.c': 'C' }
  const ns = overrides.ns ?? 'demo'
  const render = (dict) => Object.entries(dict).map(([key, value]) => `  '${key}': ${JSON.stringify(value)},`).join('\n')
  return [
    '/* ==== dsh-i18n:begin ==== */',
    `const I18N_NS = ${JSON.stringify(ns)}`,
    `const I18N_ZH = {\n${render(zh)}\n}`,
    `const I18N_EN = {\n${render(en)}\n}`,
    '/* ==== dsh-i18n:end ==== */',
    'function installI18n(ctx) { ctx.inject([\'locale\'] , (c) => { c.locale.register(I18N_NS, \'zh\', I18N_ZH); c.locale.register(I18N_NS, \'en\', I18N_EN) }) }',
    'let t = i18nFallback',
    'installI18n(ctx)',
  ].join('\n')
}

/** 取纯函数要的类型（源码是 .mjs，测试里只断言行为，不做类型体操）。 */
const parse = (text) => parseCatalogBlock(text)

describe('parseCatalogBlock · 目录块的解析与求值', () => {
  it('取回命名空间与两份目录', () => {
    const parsed = parse(catalog())
    expect(parsed).toBeDefined()
    expect(parsed.error).toBeUndefined()
    expect(parsed.ns).toBe('demo')
    expect(Object.keys(parsed.zh)).toEqual(['a.b', 'a.c'])
    expect(parsed.en['a.b']).toBe('A {n}')
  })

  it('目录里出现引号 / 反斜杠 / 花括号也能求值（不靠手写解析）', () => {
    const parsed = parse(catalog({ zh: { 'q.quote': '他说“好” {x}', 'q.brace': '字面 { 不是参数', 'q.slash': '反斜杠 \\ 与 \\{x\\}' }, en: { 'q.quote': 'He said “ok” {x}', 'q.brace': 'literal { is not a param', 'q.slash': 'backslash \\ and \\{x\\}' } }))
    expect(parsed.error).toBeUndefined()
    expect(parsed.zh['q.brace']).toBe('字面 { 不是参数')
  })

  it('没有标记 → undefined（= 该包还没接入，不算错）', () => {
    expect(parse('const a = 1')).toBeUndefined()
    expect(parse('/* dsh-i18n:begin */')).toBeUndefined()
  })

  it('标记不在注释里 / 块求值失败 → 明确报错，而不是静默当没接入', () => {
    expect(parse('dsh-i18n:begin\ndsh-i18n:end').error).toContain('标记不完整')
    expect(parse('/* ==== dsh-i18n:begin ==== */\nconst I18N_ZH = {\n/* ==== dsh-i18n:end ==== */').error).toContain('求值失败')
  })

  it('I18N_NS 不是字符串 → 报错', () => {
    expect(parse('/* ==== dsh-i18n:begin ==== */\nconst I18N_NS = 1\nconst I18N_ZH = {}\nconst I18N_EN = {}\n/* ==== dsh-i18n:end ==== */').error).toContain('I18N_NS')
  })
})

describe('checkCatalog · 键集 / 占位符 / 重复键 / 空值', () => {
  it('一致的目录零错误、零告警', () => {
    expect(checkCatalog(parse(catalog()), 'demo')).toEqual({ errors: [], warnings: [] })
  })

  it('英文缺一条键 → 报错并点名（否则该语言下露出键名）', () => {
    const result = checkCatalog(parse(catalog({ en: { 'a.b': 'A {n}' } })), 'demo')
    expect(result.errors.some((line) => line.includes('英文目录缺 1 条键') && line.includes('a.c'))).toBe(true)
  })

  it('中文缺一条键同样报（两侧都要一致）', () => {
    const result = checkCatalog(parse(catalog({ zh: { 'a.b': '甲 {n}' } })), 'demo')
    expect(result.errors.some((line) => line.includes('中文目录缺 1 条键'))).toBe(true)
  })

  it('占位符只写在一边 → 报错（文案会静默少一个数）', () => {
    const result = checkCatalog(parse(catalog({ en: { 'a.b': 'A', 'a.c': 'C' } })), 'demo')
    expect(result.errors.some((line) => line.includes('占位符不一致') && line.includes('a.b'))).toBe(true)
  })

  it('重复键 → 报错（JS 后写覆盖前写，求值后看不出来，必须数字面量）', () => {
    const text = '/* ==== dsh-i18n:begin ==== */\nconst I18N_NS = \'demo\'\nconst I18N_ZH = {\n  \'a.b\': \'甲\',\n  \'a.b\': \'乙\',\n}\nconst I18N_EN = {\n  \'a.b\': \'A\',\n}\n/* ==== dsh-i18n:end ==== */'
    const parsed = parse(text)
    expect(Object.keys(parsed.zh)).toEqual(['a.b'])
    expect(rawCatalogKeys(parsed.body, 'I18N_ZH')).toEqual(['a.b', 'a.b'])
    expect(checkCatalog(parsed, 'demo').errors.some((line) => line.includes('重复键'))).toBe(true)
  })

  it('空值 / 非字符串 → 报错', () => {
    const result = checkCatalog(parse(catalog({ zh: { 'a.b': '   ', 'a.c': 1 } })), 'demo')
    expect(result.errors.filter((line) => line.includes('空值或非字符串'))).toHaveLength(2)
  })

  it('命名空间必须等于包名（conventions § 命名）', () => {
    expect(checkCatalog(parse(catalog({ ns: 'other' })), 'demo').errors.some((line) => line.includes('与包名不一致'))).toBe(true)
  })

  it('placeholders 去重排序，字面花括号不算参数', () => {
    expect(placeholders('a {x} b {y} c {x}')).toEqual(['x', 'y'])
    expect(placeholders('字面 { 不是参数')).toEqual([])
  })
})

describe('scanUsage / stripComments · 用法扫描', () => {
  it('只认独立的 t(\'…\') 与 t("…")', () => {
    expect(scanUsage("t('a.b')\nt(\"a.c\")").keys).toEqual(['a.b', 'a.c'])
  })

  it('注释里的示例不算（本仓注释里就写着 t(\'…\')）', () => {
    expect(scanUsage(stripComments("// t('注释里')\n/* t('块注释里') */\nt('真调用')")).keys).toEqual(['真调用'])
  })

  it('字符串里的注释符不会把后面的代码吞掉', () => {
    const stripped = stripComments("const url = 'http://x//y'\nconst after = t('真调用')")
    expect(stripped).not.toContain('t(真调用)')
    expect(scanUsage(stripped).keys).toEqual(['真调用'])
  })

  it('translate( / .transform( / CSS 里的 translate( 都不误命中', () => {
    expect(scanUsage('translate("x")\nfoo.transform("y")\nconst css = "transform:translate(1px,2px)"').keys).toEqual([])
  })

  it('动态键单独回报（不静默忽略，也不冒充缺键）', () => {
    const usage = scanUsage("t('row.' + i)\nt(`row.${i}`)\nt('ok')")
    expect(usage.keys).toEqual(['ok'])
    expect(usage.dynamic).toHaveLength(2)
  })
})

describe('checkCoverage · 用法与目录对账', () => {
  it('全部命中 → 零错误', () => {
    const parsed = parse(catalog())
    expect(checkCoverage(parsed, scanUsage("t('a.b')\nt('a.c')")).errors).toEqual([])
  })

  it('用了没定义的键 → 报错并点名（这是这门闸门的主要理由）', () => {
    const parsed = parse(catalog())
    const result = checkCoverage(parsed, scanUsage("t('a.zzz')"))
    expect(result.errors.some((line) => line.includes('a.zzz') && line.includes('露出键名'))).toBe(true)
  })

  it('定义了没用 → 只告警（可能是死键，也可能是动态拼接）', () => {
    const parsed = parse(catalog())
    const result = checkCoverage(parsed, scanUsage("t('a.b')"))
    expect(result.errors).toEqual([])
    expect(result.warnings.some((line) => line.includes('a.c'))).toBe(true)
  })
})

describe('checkInstaller · 安装片段不许抄歪', () => {
  const full = "installI18n(ctx)\nctx.inject(['locale']\nregister(I18N_NS, 'zh'\nregister(I18N_NS, 'en'\nlet t = i18nFallback"

  it('照抄规范片段 → 零缺失', () => {
    expect(checkInstaller(full)).toEqual([])
  })

  it('每一处缺失都点名（静态 inject / 少注册一边 / 没有兜底）', () => {
    expect(checkInstaller('installI18n(ctx)')).toHaveLength(4)
    expect(checkInstaller(full.replace("register(I18N_NS, 'en'", ''))).toEqual([expect.stringContaining('英文目录')])
    expect(checkInstaller(full.replace('i18nFallback', ''))).toEqual([expect.stringContaining('中文兜底')])
  })
})

describe('真实语料 · 全仓已接入的客户端半体（上线即绿的证明）', () => {
  it('每个接入目录的包都通过（键集 / 占位符 / 用法 / 安装片段）', () => {
    const halves = listClientHalves(join(repoRoot, 'packages'))
    expect(halves.length).toBeGreaterThan(0)
    const applied = halves.filter((half) => checkClientHalf(half, readFileSync(half.path, 'utf8')).applied)
    // 迁移还没做完（见 ROADMAP 第 3 项与 docs/i18n.md 的进度表），但**已接入的必须全绿**
    expect(applied.length).toBeGreaterThan(0)
    for (const half of applied) {
      const result = checkClientHalf(half, readFileSync(half.path, 'utf8'))
      expect(result.errors, `${half.package}/${half.file}`).toEqual([])
    }
  })

  it('未接入的包只能是「还没搬」——接入过的包不允许退回未接入（防止目录被删着走）', () => {
    const halves = listClientHalves(join(repoRoot, 'packages'))
    const names = halves.map((half) => half.package)
    // 这两个是最小接入样本（docs/i18n.md 的种子）；删掉它们的目录必须红
    for (const seeded of ['env', 'kit-settings']) {
      expect(names).toContain(seeded)
      const half = halves.find((item) => item.package === seeded)
      expect(checkClientHalf(half, readFileSync(half.path, 'utf8')).applied, `${seeded} 的目录块不见了`).toBe(true)
    }
  })
})
