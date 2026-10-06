/**
 * [`scripts/client-design-tokens.mjs`](../client-design-tokens.mjs) 的单元测试 —— 客户端半体
 * 「自定义属性必须有定义」与「胶囊/正圆必须配对 corner-shape」两条规则。
 *
 * ## 为什么有这份测试
 *
 * 与 `client-theme-tokens.test.ts` 同一条理由：这两条规则**只在有人写错时才出声**（上线时清完
 * 3 处 + 53 处后全仓 0 违规），所以它自己漂了没人会发现——三种漂法都会让防线白给：
 *
 *   ① **漏报**：解析写松（把 `var()` 引用当成定义位、按前缀截断变量名、把已配对的算成未配对）
 *      → 下一个「写错名字的声明整条作废」照样溜进真机；
 *   ② **误报**：把定义位 / 宿主拥有的前缀 / `::-webkit-scrollbar` 伪元素当成违规 → 对着合法
 *      代码报错，最后一定会被人削弱或加豁免；
 *   ③ **口径分叉**：`scanCapsuleCorners` 与 `scanCapsuleSites` 各扫一遍 → 「总数」与「findings」
 *      对不上，通过行里打印的自证数字就成了假的。
 *
 * 反例一律**拿真实源码做字符串替换**并先断言替换生效——本仓刚发生过「命中 0 个文件、恒绿、
 * 拦不住任何东西」的闸门。
 *
 * 三组断言各有分工：纯函数语义（该报的必须报、不该报的不许报）、**对全部真实客户端半体做一次
 * 全量断言**（既是「规则上线即绿」的证据，也是「以后有人写回去」的拦截网）、以及
 * **本轮三处真实坏名 + 一处真实胶囊的反例拦截证明**。
 */
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  declValue,
  describeCapsuleCorner,
  describeVarUse,
  isCapsuleRadius,
  isHostOwnedVar,
  maskComments,
  normalizePrelude,
  parseCssRules,
  parseVarDefinitions,
  pillTokensOf,
  scanCapsuleCorners,
  scanCapsuleSites,
  scanUndefinedVars,
  scanVarUses,
  selectorList,
} from '../client-design-tokens.mjs'
import { listThemeScanFiles } from '../client-theme-tokens.mjs'
import {
  ACCENT_COLOR_RULE_HINT,
  BUTTON_RECIPE_RULE_HINT,
  DANGER_BUTTON_RULE_HINT,
  RADIUS_SCALE,
  TYPOGRAPHY_RULE_HINT,
  INPUT_RECIPE_RULE_HINT,
  COLOR_SOURCE_RULE_HINT,
  scanAccentColorSites,
  scanColorLiterals,
  scanThemeTokenRefs,
  scanAccentColors,
  scanCheckboxMarkup,
  scanInputRecipes,
  scanInputSites,
  scanFontSizeSites,
  scanTypographyRoles,
  scanBorderWithElevation,
  scanButtonClasses,
  scanButtonRecipes,
  scanDangerButtonRecipes,
  scanDanglingDeclarations,
  scanNonHairlineBorders,
  scanOffScaleRadii,
  scanStyleSpecTotals,
} from '../client-style-spec.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (rel) => readFileSync(join(repoRoot, rel), 'utf8')

/** 读一个包的全部受管客户端半体（与 `client-lint` 同一份枚举口径）。 */
function clientFiles(pkg) {
  return listThemeScanFiles(join(repoRoot, 'packages', pkg))
    .map((file) => ({ file: file.slice(repoRoot.length + 1), source: readFileSync(file, 'utf8') }))
}

/** 全部有客户端半体的包（**不写死**：名单现算，少一个多一个都在这里现形）。 */
const PACKAGES = readdirSync(join(repoRoot, 'packages'))
  .filter((name) => listThemeScanFiles(join(repoRoot, 'packages', name)).length > 0)
  .sort()

describe('maskComments / normalizePrelude · 解析的两个前提', () => {
  it('注释被等长空白覆盖（行号列号仍按原文算）', () => {
    const masked = maskComments('a{/* x */color:red}')
    expect(masked.length).toBe('a{/* x */color:red}'.length)
    expect(masked).not.toContain('x')
    expect(masked.split('\n').length).toBe(1)
  })

  it('块注释跨行时换行保留（否则后续行号全错）', () => {
    expect(maskComments('a{\n/* one\ntwo */\ncolor:red}').split('\n').length).toBe(4)
  })

  it('前导归一：剥掉 JS 字符串/数组标点（否则每个真实站点会多报一个 `\'` 选择器）', () => {
    expect(normalizePrelude("',\n      '")).toBe('')
    expect(normalizePrelude("'." + 'x{y')).toBe('.x{y')
    expect(normalizePrelude('  .a, .b  ')).toBe('.a, .b')
  })

  it('**不剥 `[`**：属性选择器以它开头，剥了会把选择器截断', () => {
    expect(normalizePrelude('[data-level="WARN"]')).toBe('[data-level="WARN"]')
  })

  it('从最后一个 `}` 之后取起（那才是本规则的前导）', () => {
    expect(normalizePrelude('.prev{} .next')).toBe('.next')
  })
})

describe('parseCssRules · 规则扫描', () => {
  it('普通规则收成 { selector, decls, line }', () => {
    const rules = parseCssRules('.a{color:red}\n.b{color:blue}')
    expect(rules.map((r) => [r.selector, r.decls.trim(), r.line])).toEqual([
      ['.a', 'color:red', 1],
      ['.b', 'color:blue', 2],
    ])
  })

  it('@media / @keyframes 往里递归（嵌套里的规则也要被看见）', () => {
    const rules = parseCssRules('@media (min-width:1px){.a{color:red}}')
    expect(rules.map((r) => r.selector)).toEqual(['.a'])
  })

  it('注释里的规则不算（否则注释里的示例会被当成真站点）', () => {
    expect(parseCssRules('/* .a{border-radius:999px} */').length).toBe(0)
  })

  it('bodyStart / bodyEnd 指向原文里的声明块（改写的调用方按它定位）', () => {
    const text = '.a{color:red}'
    const [rule] = parseCssRules(text)
    expect(text.slice(rule.bodyStart, rule.bodyEnd)).toBe('color:red')
  })

  it('内联在 JS 字符串里的 CSS 也能解析，且不产出假选择器', () => {
    const rules = parseCssRules("const CSS = [\n  '.a{border-radius:999px}',\n  '.b{color:red}',\n]")
    expect(rules.map((r) => r.selector)).toEqual(['.a', '.b'])
  })
})

describe('declValue / selectorList · 取值口径', () => {
  it('同一属性出现多次取最后一条（CSS 的就近覆盖语义）', () => {
    expect(declValue('color:red;color:blue', 'color')).toBe('blue')
  })

  it('去 !important；没有该声明返回 undefined', () => {
    expect(declValue('color:red !important', 'color')).toBe('red')
    expect(declValue('color:red', 'background')).toBeUndefined()
  })

  it('选择器列表按项拆开去空白', () => {
    expect(selectorList('.a, .b ,\n .c')).toEqual(['.a', '.b', '.c'])
  })
})

describe('parseVarDefinitions / scanVarUses · 定义位与引用位对称', () => {
  it('定义位不算引用——否则判据自己就失效了', () => {
    expect(parseVarDefinitions('.a{--tt-x:1px}')).toEqual(['--tt-x'])
    expect(scanVarUses('.a{--tt-x:1px}')).toEqual([])
  })

  it('var() 引用被抓到，带行号列号，并能分辨有没有 fallback', () => {
    // col 指向**名字本身**的第一个字符（与 client-theme-tokens 的 scanThemeTokenUses 同一口径）
    const uses = scanVarUses('.a{color:var(--tt-a)}\n.b{color:var(--tt-b, red)}')
    expect(uses).toEqual([
      { token: '--tt-a', line: 1, col: 14, hasFallback: false },
      { token: '--tt-b', line: 2, col: 14, hasFallback: true },
    ])
  })

  it('列号口径与既有扫描器一致（同一份写法两处都算 25 列）', () => {
    const text = '.a{border:1px solid var(--dsw-alias-border-l4)}'
    expect(scanVarUses(text)[0]!.col).toBe(text.indexOf('--dsw-alias-border-l4') + 1)
  })

  it('**按配对括号取全名**，不按前缀截断（--dk-pad-cardHead 那次误报的根因）', () => {
    expect(scanVarUses('.a{padding:var(--dk-pad-cardHead)}').map((u) => u.token)).toEqual(['--dk-pad-cardHead'])
  })

  it('嵌套的 fallback 不会把内层引用算成外层的一部分', () => {
    const uses = scanVarUses('.a{background:var(--dk-bg-2, var(--dsw-alias-bg-layer-2))}')
    expect(uses.map((u) => u.token)).toEqual(['--dk-bg-2', '--dsw-alias-bg-layer-2'])
    expect(uses[0]!.hasFallback).toBe(true)
    expect(uses[1]!.hasFallback).toBe(false)
  })

  it('注释里的引用不算', () => {
    expect(scanVarUses('/* var(--tt-nope) */')).toEqual([])
  })
})

describe('scanUndefinedVars · 检查五', () => {
  it('引用了本包没定义的名字 → 报', () => {
    const files = [{ file: 'a.css', source: '.a{color:var(--tt-label-1)}' }]
    expect(scanUndefinedVars(files)).toEqual([
      { file: 'a.css', token: '--tt-label-1', line: 1, col: 14, hasFallback: false },
    ])
  })

  it('本包定义过 → 不报（跨文件也算：同一个包的多个文件是一份作用域）', () => {
    const files = [
      { file: 'tokens.css', source: ':root{--tt-label:red}' },
      { file: 'a.css', source: '.a{color:var(--tt-label)}' },
    ]
    expect(scanUndefinedVars(files)).toEqual([])
  })

  it('`--dsw-*` 归检查四管 → 本函数跳过（两处都报就是重复计数）', () => {
    expect(scanUndefinedVars([{ file: 'a.css', source: '.a{color:var(--dsw-not-a-real-name)}' }])).toEqual([])
  })

  it('宿主拥有的前缀不受约束（--dsh- / --ds- / --dsl-）', () => {
    for (const token of ['--dsh-scrollbar-thumb', '--ds-font-family-code', '--dsl-x']) {
      expect(isHostOwnedVar(token), token).toBe(true)
      expect(scanUndefinedVars([{ file: 'a.css', source: `.a{color:var(${token})}` }]), token).toEqual([])
    }
  })

  it('**不是**宿主前缀的其它前缀一律要求本包定义（不放宽成「有连字符就算数」）', () => {
    expect(isHostOwnedVar('--tt-label')).toBe(false)
    expect(isHostOwnedVar('--anything-goes')).toBe(false)
  })

  it('文案分两档（有 fallback = 静默降级，无 fallback = 整条作废）', () => {
    expect(describeVarUse({ hasFallback: false, token: '--a' })).toContain('整条作废')
    expect(describeVarUse({ hasFallback: true, token: '--a' })).toContain('静默降级')
  })
})

describe('isCapsuleRadius / pillTokensOf · 胶囊判定', () => {
  it('字面 999px 与 50% 都算', () => {
    expect(isCapsuleRadius('999px', new Set())).toBe(true)
    expect(isCapsuleRadius('50%', new Set())).toBe(true)
  })

  it('值为 999px 的私有令牌也算（--tt-r-pill / --dk-r-pill 那 20 处靠这条）', () => {
    const pill = pillTokensOf([{ source: ':root{--tt-r-pill: 999px}' }])
    expect([...pill]).toEqual(['--tt-r-pill'])
    expect(isCapsuleRadius('var(--tt-r-pill)', pill)).toBe(true)
  })

  it('普通圆角不算（不误报方角）', () => {
    for (const value of ['8px', 'var(--dsw-radius-xl)', '12px 12px 0 0', '0']) {
      expect(isCapsuleRadius(value, new Set()), value).toBe(false)
    }
  })
})

describe('scanCapsuleCorners / scanCapsuleSites · 检查六', () => {
  it('胶囊缺 corner-shape → 报', () => {
    const files = [{ file: 'a.css', source: '.a{border-radius:999px}' }]
    expect(scanCapsuleCorners(files).map((f) => f.selector)).toEqual(['.a'])
  })

  it('成对写了 → 不报', () => {
    const files = [{ file: 'a.css', source: '.a{border-radius:999px;corner-shape:round}' }]
    expect(scanCapsuleCorners(files)).toEqual([])
  })

  it('**拆成两条规则写也算配对**（按选择器配对，不按单条规则）', () => {
    const files = [{ file: 'a.css', source: '.a{border-radius:999px}\n.a{corner-shape:round}' }]
    expect(scanCapsuleCorners(files)).toEqual([])
  })

  it('**跳过 ::-webkit-scrollbar 伪元素**（宿主 scrollbar.css 已负责，重复写是多余）', () => {
    const files = [{ file: 'a.css', source: '.a::-webkit-scrollbar-thumb{border-radius:999px}' }]
    expect(scanCapsuleCorners(files)).toEqual([])
  })

  it('选择器列表里的每一项各自判定（.a 配了不等于 .b 也配了）', () => {
    const files = [{ file: 'a.css', source: '.a,.b{border-radius:999px}\n.a{corner-shape:round}' }]
    expect(scanCapsuleCorners(files).map((f) => f.selector)).toEqual(['.b'])
  })

  it('**总数与 findings 同源**：scanCapsuleSites 的 paired 项数 + findings = 总数', () => {
    const files = [{ file: 'a.css', source: '.a{border-radius:999px;corner-shape:round}\n.b{border-radius:50%}' }]
    const sites = scanCapsuleSites(files)
    const findings = scanCapsuleCorners(files)
    expect(sites.length).toBe(2)
    expect(sites.filter((s) => s.paired).length + findings.length).toBe(sites.length)
    expect(findings.map((f) => f.selector)).toEqual(['.b'])
  })

  it('文案点出选择器与那个值（定位信息是给人看的）', () => {
    expect(describeCapsuleCorner({ selector: '.a', value: '50%' })).toContain('.a')
    expect(describeCapsuleCorner({ selector: '.a', value: '50%' })).toContain('50%')
  })
})

describe('真实语料：全部客户端半体都干净', () => {
  it('有客户端半体的包都能被找到（0 个 = 名单现算失效，闸门会恒绿）', () => {
    expect(PACKAGES.length, '有客户端半体的包至少应有一个').toBeGreaterThan(0)
  })

  for (const name of PACKAGES) {
    it(`${name} 无未定义自定义属性、胶囊均已配对`, () => {
      const files = clientFiles(name)
      expect(scanUndefinedVars(files).map((f) => f.file + ' ' + f.token)).toEqual([])
      expect(scanCapsuleCorners(files).map((f) => f.file + ' ' + f.selector)).toEqual([])
    })
  }

  it('全部客户端半体合起来至少引用了 100 处自定义属性（0 命中说明这道检查没在扫东西）', () => {
    const total = PACKAGES.flatMap((name) => clientFiles(name))
      .reduce((sum, file) => sum + scanVarUses(file.source).length, 0)
    expect(total).toBeGreaterThan(100)
  })

  it('**胶囊站点不是 0**：全仓至少 40 处（否则「均已配对」是一句空话）', () => {
    /*
     * 本仓明令「只会在 0 命中时绿的检查等于没有检查」。这条把「扫描面真的覆盖了那些胶囊」
     * 钉住：把 `isCapsuleRadius` 收窄（例如只认字面 999px、不认 --tt-r-pill）时，tty/docker
     * 的 20 处会整批消失，总数掉到 30 以下 → 这里红。
     */
    const sites = PACKAGES.flatMap((name) => scanCapsuleSites(clientFiles(name)))
    expect(sites.length).toBeGreaterThan(40)
  })

  it('独立 `.css` 也在扫描面内（docker / tty 的样式住在那里）', () => {
    const css = listThemeScanFiles(join(repoRoot, 'packages', 'docker')).filter((f) => f.endsWith('.css'))
    expect(css.length, 'docker 应有 client-src/docker.css').toBeGreaterThan(0)
    expect(scanVarUses(readFileSync(css[0]!, 'utf8')).length).toBeGreaterThan(0)
  })
})

describe('反例拦截证明：本轮三处真实坏名 + 一处真实胶囊', () => {
  /** 拿真实源码做字符串替换，并**先断言替换生效**（否则「没报」可能只是没替换上）。 */
  function withReplacement(pkg: string, file: string, from: string, to: string) {
    const files = clientFiles(pkg)
    const target = files.find((f) => f.file.endsWith(file))
    if (target === undefined) throw new Error('找不到 ' + file)
    expect(target.source.includes(from), '替换源必须真的存在：' + from).toBe(true)
    target.source = target.source.replace(from, to)
    return files
  }

  it('tty `--tt-label-1`（无 fallback → 那条声明整条作废）', () => {
    const files = withReplacement('tty', 'tty.css', 'color: var(--tt-label);', 'color: var(--tt-label-1);')
    const found = scanUndefinedVars(files)
    expect(found.map((f) => f.token)).toContain('--tt-label-1')
    expect(found.find((f) => f.token === '--tt-label-1')!.hasFallback).toBe(false)
  })

  it('tty `--tt-bg-2`（有 fallback → 静默降级）', () => {
    const files = withReplacement('tty', 'tty.css', 'var(--tt-surface-2,', 'var(--tt-bg-2,')
    const found = scanUndefinedVars(files)
    expect(found.map((f) => f.token)).toContain('--tt-bg-2')
    expect(found.find((f) => f.token === '--tt-bg-2')!.hasFallback).toBe(true)
  })

  it('docker `--dk-bg-2`（有 fallback → 静默降级）', () => {
    const files = withReplacement('docker', 'docker.css', 'var(--dk-surface-2,', 'var(--dk-bg-2,')
    expect(scanUndefinedVars(files).map((f) => f.token)).toContain('--dk-bg-2')
  })

  it('**真名不许被误报**：--dk-pad-cardHead 是本包定义过的（首轮前缀截断误报过它）', () => {
    expect(scanUndefinedVars(clientFiles('docker')).map((f) => f.token)).not.toContain('--dk-pad-card')
  })

  it('拿掉某条胶囊的 corner-shape → 立刻红（用真实规则做反例）', () => {
    const files = withReplacement('tty', 'tty.css', 'border-radius: var(--tt-r-pill);\n  corner-shape: round;', 'border-radius: var(--tt-r-pill);')
    expect(scanCapsuleCorners(files).length).toBeGreaterThan(0)
  })

  it('把 docker 的 30% 描边改回 45% → 立刻红（检查十一的 border 判据）', () => {
    const files = withReplacement('docker', 'docker.css', '30%, transparent', '45%, transparent')
    const found = scanDangerButtonRecipes(files)
    expect(found.map((x) => x.code)).toContain('border')
    expect(found.map((x) => x.cls)).toContain('dk_btnDanger')
  })

  it('把某个包的危险按钮 hover 去掉 :not(:disabled) → 级联判据立刻红', () => {
    const files = withReplacement('env', 'client.js',
      '.env_btnDanger:hover:not(:disabled)', '.env_btnDanger:hover')
    expect(scanDangerButtonRecipes(files).map((x) => x.code)).toContain('cascade')
  })

  it('把危险按钮的 hover 整条删掉 → hover 判据立刻红（这是 prompt/profile 改动前的真实状态）', () => {
    const rule = "\n      '.env_btnDanger:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,transparent)}',"
    const files = withReplacement('env', 'client.js', rule, '')
    expect(scanDangerButtonRecipes(files).map((x) => x.code)).toContain('hover')
  })
})

describe('闸门自证：语料为空时不许静默', () => {
  it('没有客户端半体的目录给空清单（包名现算的前提）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-design-tokens-'))
    expect(listThemeScanFiles(dir)).toEqual([])
  })

  it('空输入给空结果（不是 undefined、不抛）', () => {
    expect(scanUndefinedVars([])).toEqual([])
    expect(scanCapsuleCorners([])).toEqual([])
    expect(parseCssRules('')).toEqual([])
  })

  it('同一份语料重复扫结果一致（纯函数，不受调用顺序影响）', () => {
    const files = clientFiles('tty')
    expect(scanUndefinedVars(files)).toEqual(scanUndefinedVars(files))
    expect(scanCapsuleSites(files).length).toBe(scanCapsuleSites(files).length)
  })
})

describe('官方样式规范三条「值」判据（检查七 / 八 / 九）', () => {
  /*
   * 规范出处：deepseek-ai/deepseek-harness 的 docs/web-styling.zh.md 与 docs/ui-radius.zh.md。
   * 官方没有 lint 命令，所以这三条是本仓自己钉的静态判据——它们守住的是
   * 「值对不对」，与既有检查（名字存不存在 / 有没有定义位 / 胶囊配没配 corner-shape）不重叠。
   */
  const one = (css) => [{ file: 't.css', source: css }]

  it('检查七：中性 1px solid 要报（规范要求 0.5px 发丝线）', () => {
    expect(scanNonHairlineBorders(one('.x{border:1px solid var(--dsw-alias-border-l2)}')).length).toBe(1)
  })

  it('检查七：0.5px / .5px 不报', () => {
    expect(scanNonHairlineBorders(one('.x{border:0.5px solid var(--dsw-alias-border-l2)}')).length).toBe(0)
    expect(scanNonHairlineBorders(one('.x{border:.5px solid var(--dsw-alias-border-l1)}')).length).toBe(0)
  })

  it('检查七：dashed 记号按规范豁免（规范：dashed 保持 1px）', () => {
    expect(scanNonHairlineBorders(one('.x{border:1px dashed var(--dsw-alias-border-l2)}')).length).toBe(0)
  })

  it('检查七：状态色边框按规范豁免（规范：语义色保持真 border）', () => {
    expect(scanNonHairlineBorders(one('.x{border:1px solid var(--dsw-alias-state-error-primary)}')).length).toBe(0)
  })

  it('检查七：spinner 圆环按规范豁免（画圆 + 顶边上色）', () => {
    const css = '.x{border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--A);border-radius:50%}'
    expect(scanNonHairlineBorders(one(css)).length).toBe(0)
  })

  it('检查七：本仓私有令牌层（--dk-border / --tt-border）同样算中性', () => {
    expect(scanNonHairlineBorders(one('.x{border:1px solid var(--dk-border-strong)}')).length).toBe(1)
    expect(scanNonHairlineBorders(one('.x{border:1px solid var(--tt-border)}')).length).toBe(1)
  })

  it('检查八：「中性 border + 投影」配对要报（规范 elevation spec 会拒绝）', () => {
    const css = '.x{border:1px solid var(--dsw-alias-border-l2);box-shadow:var(--dsw-elevation-panel)}'
    expect(scanBorderWithElevation(one(css)).length).toBe(1)
  })

  it('检查八：border:0 + 投影是正确写法，不报', () => {
    const css = '.x{border:0;box-shadow:var(--dsw-elevation-prominent)}'
    expect(scanBorderWithElevation(one(css)).length).toBe(0)
  })

  it('检查九：10px / 14px / 18px / 24px 要报（规范点名禁止的局部数值）', () => {
    for (const v of ['10px', '14px', '18px', '24px']) {
      expect(scanOffScaleRadii(one('.x{border-radius:' + v + '}')).length, v).toBe(1)
    }
  })

  it('检查九：官方尺度值与具名 token 不报', () => {
    for (const v of ['4px', '8px', '12px', '16px', '20px', '28px']) {
      expect(scanOffScaleRadii(one('.x{border-radius:' + v + '}')).length, v).toBe(0)
    }
    expect(scanOffScaleRadii(one('.x{border-radius:var(--dsw-radius-md)}')).length).toBe(0)
  })

  it('检查九：私有圆角令牌的**定义位**也要拦（--dk-r-sm: 6px 这种平行尺度）', () => {
    /*
     * 首版判据只扫 border-radius: 声明，于是 docker/tty 那套 6/8/10/12 的私有尺度
     * 一路躲过去——它让整包控件一起偏紧一格。这条把定义位也钉住。
     */
    expect(scanOffScaleRadii(one('.a{--dk-r-sm:6px}')).length).toBe(1)
    expect(scanOffScaleRadii(one('.a{--tt-r-xl:10px}')).length).toBe(1)
    expect(scanOffScaleRadii(one('.a{--dk-r-sm:8px}')).length).toBe(0)
  })

  it('检查九：不以 -r- 为独立分段的令牌不算圆角（--tt-statsbar-h 是高度）', () => {
    expect(scanOffScaleRadii(one('.a{--tt-statsbar-h:24px}')).length).toBe(0)
    expect(scanOffScaleRadii(one('.a{--dk-gap-lg:12px}')).length).toBe(0)
  })

  it('检查九：胶囊令牌 999px 不算违规（有意形状）', () => {
    expect(scanOffScaleRadii(one('.a{--tt-r-pill:999px}')).length).toBe(0)
  })

  it('检查十：悬空声明（没有选择器）要报——浏览器会静默丢弃它', () => {
    expect(scanDanglingDeclarations([{ file: 't.css', source: '.a{color:red}\n  background: blue;\n' }]).length).toBe(1)
  })

  it('检查十：正常规则与 @media 嵌套不误报', () => {
    expect(scanDanglingDeclarations([{ file: 't.css', source: '.a{color:red}' }]).length).toBe(0)
    expect(scanDanglingDeclarations([{ file: 't.css', source: '@media (a){.a{color:red}}' }]).length).toBe(0)
  })

  it('检查十：内联 CSS 的 .js 不在扫描面内（深度跟踪会误判）', () => {
    expect(scanDanglingDeclarations([{ file: 't.js', source: '.a{color:red}\n  background: blue;\n' }]).length).toBe(0)
  })

  it('RADIUS_SCALE 与官方六档逐字一致（改档位必须连判据一起改）', () => {
    expect(RADIUS_SCALE).toEqual({
      '4px': '--dsw-radius-xs',
      '8px': '--dsw-radius-sm',
      '12px': '--dsw-radius-md',
      '16px': '--dsw-radius-lg',
      '20px': '--dsw-radius-xl',
      '28px': '--dsw-radius-panel',
    })
  })
})

describe('检查十一：危险按钮必须用官方 danger 配方', () => {
  /*
   * 规范出处：宿主 `dsh-client-ui-plugin-manager` 的「卸载」按钮
   * （`Button variant="outline"` 叠 `.danger`）。官方 web-styling 文档没单列这条，
   * 但它是宿主唯一的危险动作样板，而同一个设置页上并列着插件的「删除」——2026-10-06
   * 用户拿两张截图比对，正是发现插件的删除长得像普通次要按钮（红字 + 中性灰框 + 灰 hover）。
   *
   * 这类偏差**四层防线全漏**：tsc 不查 CSS 值、preview 用假主题、冒烟只断言文案与控件值、
   * 人眼要两张图并排才看得出。所以钉成静态判据。
   */
  const one = (css) => [{ file: 't.css', source: css }]
  const DANGER = 'var(--dsw-alias-state-error-primary)'
  const official = '.env_btnGhost:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}'
    + '\n.env_btnDanger{color:' + DANGER + ';border-color:color-mix(in srgb,' + DANGER + ' 30%,transparent)}'
    + '\n.env_btnDanger:hover:not(:disabled){background:color-mix(in srgb,' + DANGER + ' 8%,transparent)}'

  it('官方配方（红字 + 30% 描边 + 8% 红 hover）不报', () => {
    expect(scanDangerButtonRecipes(one(official))).toEqual([])
  })

  it('只写红字、没有描边要报（本仓 4 个包此前的真实写法）', () => {
    const found = scanDangerButtonRecipes(one('.env_btnDanger{color:' + DANGER + '}'))
    expect(found.map((x) => x.code)).toContain('border')
  })

  it('描边浓度不是 30% 要报（45% / 40% / 12% 都是本仓出现过的写法）', () => {
    for (const pct of ['45%', '40%', '12%']) {
      const css = '.a_btnDanger{color:' + DANGER + ';border-color:color-mix(in srgb,' + DANGER + ' ' + pct + ',transparent)}'
        + '\n.a_btnDanger:hover:not(:disabled){background:color-mix(in srgb,' + DANGER + ' 8%,transparent)}'
      expect(scanDangerButtonRecipes(one(css)).map((x) => x.code), pct).toContain('border')
    }
  })

  it('hover 浓度不是 8% 要报', () => {
    const css = '.a_btnDanger{color:' + DANGER + ';border-color:color-mix(in srgb,' + DANGER + ' 30%,transparent)}'
      + '\n.a_btnDanger:hover{background:color-mix(in srgb,' + DANGER + ' 12%,transparent)}'
    expect(scanDangerButtonRecipes(one(css)).map((x) => x.code)).toContain('hover')
  })

  it('完全没有 hover 规则要报（悬停会吃到中性灰底）', () => {
    const css = '.a_btnDanger{color:' + DANGER + ';border-color:color-mix(in srgb,' + DANGER + ' 30%,transparent)}'
    expect(scanDangerButtonRecipes(one(css)).map((x) => x.code)).toContain('hover')
  })

  it('不透明底要报（用户截图里的主因：按钮从所在行里「浮」出来）', () => {
    const css = '.a_btnDanger{color:' + DANGER + ';background:var(--dsw-alias-bg-layer-2);border-color:color-mix(in srgb,' + DANGER + ' 30%,transparent)}'
      + '\n.a_btnDanger:hover:not(:disabled){background:color-mix(in srgb,' + DANGER + ' 8%,transparent)}'
    expect(scanDangerButtonRecipes(one(css)).map((x) => x.code)).toContain('fill')
  })

  it('border 简写用了 1px 要报（发丝线是 .5px，见检查七；状态色描边逃过检查七）', () => {
    const css = '.a_btnDanger{color:' + DANGER + ';border:1px solid color-mix(in srgb,' + DANGER + ' 30%,transparent)}'
      + '\n.a_btnDanger:hover:not(:disabled){background:color-mix(in srgb,' + DANGER + ' 8%,transparent)}'
    expect(scanDangerButtonRecipes(one(css)).map((x) => x.code)).toContain('hairline')
  })

  it('background:0 0 / transparent 是官方写法，不报 fill', () => {
    for (const fill of ['0 0', 'transparent', 'none']) {
      const css = '.a_btnDanger{color:' + DANGER + ';background:' + fill + ';border-color:color-mix(in srgb,' + DANGER + ' 30%,transparent)}'
        + '\n.a_btnDanger:hover:not(:disabled){background:color-mix(in srgb,' + DANGER + ' 8%,transparent)}'
      expect(scanDangerButtonRecipes(one(css)), fill).toEqual([])
    }
  })

  it('类名口径不误伤：图标按钮与链接式危险动作都不是描边危险按钮', () => {
    /* 官方只给描边危险按钮定义了配方；图标按钮只上色、链接红字即正确。 */
    expect(scanDangerButtonRecipes(one('.dk_iconBtnDanger{color:' + DANGER + '}'))).toEqual([])
    expect(scanDangerButtonRecipes(one('.mX_linkBtn[data-danger]{color:' + DANGER + '}'))).toEqual([])
  })

  it('危险色可以是包内的别名 token（docker 的 --dk-danger 就是它）', () => {
    const css = '.dk_btnDanger{background:var(--dsw-alias-bg-layer-2)}'
      + '\n.a{--dk-danger:var(--dsw-alias-state-error-primary,#d1242f)}'
      + '\n.dk_btnDanger{border-color:color-mix(in srgb,var(--dk-danger) 30%,transparent);color:var(--dk-danger)}'
      + '\n.dk_btnDanger:hover{background:color-mix(in srgb,var(--dk-danger) 8%,transparent)}'
    expect(scanDangerButtonRecipes(one(css))).toEqual([])
  })

  it('级联：ghost 的 hover 带 :not(:disabled) 时，本条的 hover 也必须带——否则红底被灰盖掉', () => {
    const base = '.a_btnGhost:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}'
      + '\n.a_btnDanger{color:' + DANGER + ';border-color:color-mix(in srgb,' + DANGER + ' 30%,transparent)}'
    const guarded = one(base + '\n.a_btnDanger:hover:not(:disabled){background:color-mix(in srgb,' + DANGER + ' 8%,transparent)}')
    expect(scanDangerButtonRecipes(guarded)).toEqual([])
    const unguarded = one(base + '\n.a_btnDanger:hover{background:color-mix(in srgb,' + DANGER + ' 8%,transparent)}')
    expect(scanDangerButtonRecipes(unguarded).map((x) => x.code)).toContain('cascade')
  })

  it('级联：hover 规则写在 ghost 的 hover **之前**要报（同权重靠源码顺序取胜）', () => {
    const css = '.a_btnDanger{color:' + DANGER + ';border-color:color-mix(in srgb,' + DANGER + ' 30%,transparent)}'
      + '\n.a_btnDanger:hover:not(:disabled){background:color-mix(in srgb,' + DANGER + ' 8%,transparent)}'
      + '\n.a_btnGhost:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}'
    expect(scanDangerButtonRecipes(one(css)).map((x) => x.code)).toContain('order')
  })

  it('没有配对的 ghost 类时不做级联判定（docker 的 .dk_btn 不叫 ghost）', () => {
    const css = '.dk_btnDanger{color:var(--dk-danger);border-color:color-mix(in srgb,var(--dk-danger) 30%,transparent)}'
      + '\n.a{--dk-danger:var(--dsw-alias-state-error-primary)}'
      + '\n.dk_btnDanger:hover{background:color-mix(in srgb,var(--dk-danger) 8%,transparent)}'
    expect(scanDangerButtonRecipes(one(css))).toEqual([])
  })

  it('只写在 :disabled 里的 color 不算基础规则（不能靠禁用态蒙混）', () => {
    const css = '.a_btnDanger:disabled{color:' + DANGER + '}'
      + '\n.a_btnDanger:hover:not(:disabled){background:color-mix(in srgb,' + DANGER + ' 8%,transparent)}'
    expect(scanDangerButtonRecipes(one(css)).map((x) => x.code)).toContain('missing-base')
  })

  it('规则文本里带「为什么」的中文说明（提示词不能是空话）', () => {
    expect(DANGER_BUTTON_RULE_HINT).toContain('30%')
    expect(DANGER_BUTTON_RULE_HINT).toContain('8%')
    expect(DANGER_BUTTON_RULE_HINT).toContain('dsh-client-ui-plugin-manager')
  })
})

describe('检查十二：按钮族对齐宿主官方 Button', () => {
  /*
   * 权威依据：宿主 dsh-client-ui-primitives 的 Button.module.css（唯一的按钮原语），
   * 以及 docs/web-styling.zh.md「字体大小必须与行高配对」、docs/ui-radius.zh.md
   * 「填充、描边、ghost、加载中和禁用变体保持相同尺寸与圆角」「Button 的 sm 使用 H28/R8」。
   *
   * 为什么值得一条静态判据：按钮是卡片里出现频次最高的控件，四个维度（填充 token、
   * 尺寸档、字行配对、焦点/禁用态）任何一处漂了都不报错——只有把插件的按钮和宿主的按钮
   * 并排看才发现「不是一个系统的东西」。
   */
  const one = (css) => [{ file: 't.css', source: css }]
  const codes = (css) => scanButtonRecipes(one(css)).map((x) => x.code)

  it('填充变体用 info-fill（强调蓝）要报——官方是 button-primary-fill', () => {
    expect(codes('.a_btn{background:var(--dsw-alias-button-info-fill)}')).toContain('fill-token')
    expect(codes('.a_btn:hover{background:var(--dsw-alias-button-info-hover)}')).toContain('fill-token')
  })

  it('button-primary-fill / -hover 不报', () => {
    expect(codes('.a_btn{background:var(--dsw-alias-button-primary-fill)}')).toEqual([])
    expect(codes('.a_btn:hover{background:var(--dsw-alias-button-primary-hover)}')).toEqual([])
  })

  it('写了 font-size 却没配 line-height 要报（官方：字体大小必须与行高配对）', () => {
    expect(codes('.a_btn{font-size:13px;font-weight:600}')).toContain('line-height')
    expect(codes('.a_btn{font-size:12px;line-height:18px}')).toEqual([])
  })

  it('非按钮类不误伤（卡片 / 行也在写 font-size）', () => {
    expect(scanButtonRecipes(one('.a_card{font-size:13px}\n.a_row{font-size:12px}'))).toEqual([])
  })

  it('私有焦点环要报：outline:none 会顶掉宿主全局 :focus-visible', () => {
    expect(codes('.a_btn:focus-visible{outline:none;box-shadow:0 0 0 3px var(--dk-ring)}')).toContain('focus')
  })

  it('只写 box-shadow 私有环也要报（没有 outline:none 同样不是官方写法）', () => {
    expect(codes('.a_btn:focus-visible{box-shadow:0 0 0 3px var(--dk-ring)}')).toContain('focus')
  })

  it('官方焦点写法不报（宿主 51 处组件用的就是它，不带 outline-offset）', () => {
    const css = '.a_btn:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary))}'
    expect(codes(css)).toEqual([])
  })

  it('禁用态 opacity 必须是 .4（.45 / .5 都报；忙碌态写 1 放行）', () => {
    expect(codes('.a_btn:disabled{opacity:.45;cursor:not-allowed}')).toContain('disabled')
    expect(codes('.a_btn:disabled{opacity:.5;cursor:default}')).toContain('disabled')
    expect(codes('.a_btn:disabled{opacity:.4;cursor:not-allowed}')).toEqual([])
    expect(codes('.a_btn[data-busy="1"]:disabled{opacity:1;cursor:progress}')).toEqual([])
  })

  it('同族变体尺寸不一致要报（填充 6px 14px vs ghost 5px 12px 是本仓真实写法）', () => {
    const css = '.a_btn{padding:6px 14px;font-size:13px}'
      + '\n.a_btnGhost{padding:5px 12px;font-size:12px}'
    const found = scanButtonRecipes(one(css))
    expect(found.map((x) => x.code)).toContain('variant-geometry')
    expect(found.filter((x) => x.code === 'variant-geometry').length).toBe(2)
  })

  it('同族变体尺寸逐项一致就不报', () => {
    const css = '.a_btn{height:28px;padding:0 10px;font-size:12px;line-height:18px;border-radius:var(--dsw-radius-sm)}'
      + '\n.a_btnGhost{height:28px;padding:0 10px;font-size:12px;line-height:18px;border-radius:var(--dsw-radius-sm)}'
    expect(scanButtonRecipes(one(css))).toEqual([])
  })

  it('危险按钮只覆盖颜色，不参与几何比较（它本来就不重复写尺寸）', () => {
    const css = '.a_btn{height:28px;padding:0 10px;font-size:12px;line-height:18px}'
      + '\n.a_btnGhost{height:28px;padding:0 10px;font-size:12px;line-height:18px}'
      + '\n.a_btnDanger{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 30%,transparent)}'
    expect(scanButtonRecipes(one(css))).toEqual([])
  })

  it('图标按钮与按钮内的忙碌容器不在「同族几何」口径内（各有自己的尺寸）', () => {
    const css = '.a_btn{height:28px;padding:0 10px}'
      + '\n.a_btnIcon{width:28px;height:28px;padding:0}'
      + '\n.a_btnBusy{display:inline-flex;gap:4px}'
    expect(scanButtonRecipes(one(css))).toEqual([])
  })

  it('hover 里的局部覆盖不参与几何比较（否则每条 hover 都会误报）', () => {
    const css = '.a_btn{height:28px;padding:0 10px}'
      + '\n.a_btn:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover);padding:0 10px}'
    expect(scanButtonRecipes(one(css))).toEqual([])
  })

  it('自证：能扫到按钮类（口径被收窄时这条会红）', () => {
    expect(scanButtonClasses(one('.a_btn{color:red}\n.b_btnGhost{color:red}\n.c_iconBtn{color:red}')))
      .toEqual(['a_btn', 'b_btnGhost', 'c_iconBtn'])
  })

  it('提示词给出出处与关键数值（不能是空话）', () => {
    expect(BUTTON_RECIPE_RULE_HINT).toContain('button-primary-fill')
    expect(BUTTON_RECIPE_RULE_HINT).toContain('28px')
    expect(BUTTON_RECIPE_RULE_HINT).toContain('line-height')
    expect(BUTTON_RECIPE_RULE_HINT).toContain('dsw-focus-ring-width')
  })
})

describe('检查十三：文字角色', () => {
  /*
   * 依据：docs/web-styling.zh.md「字体大小必须与行高配对」；角色值与字重取自宿主自家组件
   * （plugin-manager 的 cardTitle/rowName/fieldLabel、settings-models 的 fieldLabel 等）。
   * 这两条都是「不报错、只有并排看才发现的观感漂移」——与检查七~十二 同一个失效家族。
   */
  const one = (css) => [{ file: 't.css', source: css }]
  const codes = (css) => scanTypographyRoles(one(css)).map((x) => x.code)

  it('写了 font-size 却没配 line-height 要报', () => {
    expect(codes('.a_title{font-size:14px;font-weight:500}')).toContain('line-height')
  })

  it('配了行高就不报（官方成对值）', () => {
    for (const pair of ['12px:18px', '12.5px:18px', '13px:20px', '13.5px:20px', '14px:20px', '15px:22px', '20px:28px']) {
      const [size, height] = pair.split(':')
      expect(codes('.a{font-size:' + size + ';line-height:' + height + '}'), pair).toEqual([])
    }
  })

  it('font-weight:700 / bold 要报（宿主 UI 文本只用 400/500/600）', () => {
    expect(codes('.a_title{font-size:14px;line-height:20px;font-weight:700}')).toContain('weight')
    expect(codes('.a_title{font-size:14px;line-height:20px;font-weight:bold}')).toContain('weight')
  })

  it('400 / 500 / 600 都不报', () => {
    for (const w of ['400', '500', '600']) {
      expect(codes('.a{font-size:13px;line-height:20px;font-weight:' + w + '}'), w).toEqual([])
    }
  })

  it('没有 font-size 的规则不参与行高判定（颜色/边框规则不该被卷进来）', () => {
    expect(scanTypographyRoles(one('.a_btnGhost{border:.5px solid var(--dsw-alias-border-l3)}'))).toEqual([])
    expect(scanTypographyRoles(one('.a_card{color:var(--dsw-alias-label-primary)}'))).toEqual([])
  })

  it('自证：能数到 font-size 站点', () => {
    expect(scanFontSizeSites(one('.a{font-size:12px}\n.b{font-size:14px;line-height:20px}\n.c{color:red}'))).toBe(2)
  })

  it('提示词给出成对值与字重规则（不能是空话）', () => {
    expect(TYPOGRAPHY_RULE_HINT).toContain('12→18')
    expect(TYPOGRAPHY_RULE_HINT).toContain('400')
    expect(TYPOGRAPHY_RULE_HINT).toContain('700')
  })
})

describe('检查十四：控件选中态走宿主的中性 brand', () => {
  /*
   * 依据：宿主 dsh-client-ui-primitives/lib/Checkbox.module.css（16×16 +
   * accent-color: var(--dsw-alias-brand-primary)）与 Switch.module.css（开启态同 token）。
   * 强调蓝 --dsw-alias-state-business-primary（#4176e6）是宿主给状态与徽标用的。
   * 这条与检查十二的「填充 token」是同一个失效家族：把强调色当成了主色——颜色错了不报错、
   * 冒烟也断言不到，只有和宿主并排看才发现。
   */
  const one = (css) => [{ file: 't.css', source: css }]
  const codes = (css) => scanAccentColors(one(css)).map((x) => x.code)

  it('官方配方（16×16 + brand-primary）不报', () => {
    expect(scanAccentColors(one('.a_box input[type=checkbox]{width:16px;height:16px;accent-color:var(--dsw-alias-brand-primary)}'))).toEqual([])
  })

  it('强调蓝要报（含别名 token —— docker 的 --dk-accent 就是 business-primary）', () => {
    expect(codes('.a input[type=checkbox]{accent-color:var(--dsw-alias-state-business-primary)}')).toContain('accent')
    expect(codes('.a input[type=checkbox]{accent-color:var(--dk-accent)}')).toContain('accent')
  })

  it('复选框尺寸不是 16px 要报（15 / 14 / UA 默认都算漂移）', () => {
    expect(codes('.a input[type=checkbox]{width:15px;height:15px;accent-color:var(--dsw-alias-brand-primary)}')).toContain('size')
    expect(codes('.b_cardCheckbox{width:16px;height:14px;accent-color:var(--dsw-alias-brand-primary)}')).toContain('size')
  })

  it('文本框的宽高不参与判定（尺寸档不同，混进来会误报）', () => {
    expect(scanAccentColors(one('.a_input{width:100%;height:34px;border-radius:var(--dsw-radius-md)}'))).toEqual([])
  })

  it('自证：能数到 accent-color 站点', () => {
    expect(scanAccentColorSites(one('.a input[type=checkbox]{accent-color:var(--dsw-alias-brand-primary)}\n.b{color:red}'))).toBe(1)
  })

  it('提示词给出 token 与尺寸（不能是空话）', () => {
    expect(ACCENT_COLOR_RULE_HINT).toContain('accent-color: var(--dsw-alias-brand-primary)')
    expect(ACCENT_COLOR_RULE_HINT).toContain('Checkbox.module.css')
  })

  /*
   * 覆盖子句（③）：从**标记侧**出发。上面那条只能看见「已经写了 accent-color 的规则」，
   * 而 2026-10-06 用户截图里那个 #0275ff 的蓝勾（rss 的 .rss_checkRow）恰恰是**完全没被
   * 样式碰过**的——浏览器 UA 的默认色，任何只看 CSS 的判据都看不见它。
   */
  const corpus = (css, js) => [{ file: 't.css', source: css }, { file: 't.js', source: js }]
  const covered = '.a_itemTop input[type=checkbox]{accent-color:var(--dsw-alias-brand-primary)}'

  it('标记点被容器规则覆盖就不报', () => {
    const js = `parts.push('<div class="a_itemTop"><input type="checkbox" /></div>')`
    expect(scanAccentColors(corpus(covered, js))).toEqual([])
  })

  it('标记点所在的容器没有被覆盖就要报（uncovered）', () => {
    const js = `parts.push('<label class="a_checkRow"><input type="checkbox" /></label>')`
    expect(scanAccentColors(corpus(covered, js)).map((x) => x.code)).toContain('uncovered')
  })

  it('包内一条复选框规则都没有时，每个标记点都报', () => {
    const js = `parts.push('<input type="checkbox" />')`
    expect(scanAccentColors(corpus('.a_box{color:red}', js)).map((x) => x.code)).toContain('uncovered')
  })

  it('命令式 DOM 的类写在后一行也算覆盖（只往前看会误报）', () => {
    const js = [
      "const c = document.createElement('input')",
      "c.type = 'checkbox'",
      "c.className = 'a_itemTop'",
    ].join('\n')
    expect(scanAccentColors(corpus(covered, js))).toEqual([])
  })

  it('取不到候选类的站点判为「看不出来」而不是违规（假阳性会把闸门逼成噪声）', () => {
    const js = "jsx('input', { type: 'checkbox', checked: true })"
    expect(scanAccentColors(corpus(covered, js))).toEqual([])
  })

  it('CSS 规则行不算标记点（选择器里也有 type=checkbox）', () => {
    const css = covered + '\n.b_other input[type=checkbox]{width:16px}'
    expect(scanCheckboxMarkup([{ file: 't.css', source: css }])).toEqual([])
  })

  it('自证：能数到标记点', () => {
    const js = `parts.push('<label class="a_checkRow"><input type="checkbox" /></label>')\nparts.push('<input type="checkbox" />')`
    expect(scanCheckboxMarkup([{ file: 't.js', source: js }]).length).toBe(2)
  })
})

describe('检查十五：输入框 / 下拉按宿主的输入档写', () => {
  /*
   * 依据：宿主 dsh-client-ui-primitives 的两种输入配方都写了显式高度（settings-form/.input 是
   * H34、Input/.wrap 是 H32）且圆角都取 --dsw-radius-md。本仓 5 个包共用过同一段抄来的
   * 「padding:6px 10px; border-radius:8px」，于是 <select> 复用同一个类时比同排 <input> 矮 2px。
   */
  const one = (css) => [{ file: 't.css', source: css }]
  const codes = (css) => scanInputRecipes(one(css)).map((x) => x.code)

  it('没有显式高度 + 字面量圆角都要报', () => {
    expect(codes('.a_input{padding:6px 10px;border:.5px solid var(--dsw-alias-border-l2);border-radius:8px}').sort())
      .toEqual(['height', 'radius'])
  })

  it('官方输入配方不报', () => {
    expect(scanInputRecipes(one('.a_input{height:34px;padding:0 12px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md)}'))).toEqual([])
  })

  it('下拉类同样受判（select 复用输入类就是它矮 2px 的原因）', () => {
    expect(codes('.a_select{padding:5px 8px;border:.5px solid var(--dsw-alias-border-l2);border-radius:8px}').sort())
      .toEqual(['height', 'radius'])
  })

  it('没有描边的行内输入不参与判定（搜索框那种）', () => {
    expect(scanInputRecipes(one('.a_input{border:none;background:0 0;font-size:15px}'))).toEqual([])
  })

  it('多行 textarea 用 height:auto + min-height 就过', () => {
    expect(scanInputRecipes(one('.a_input.a_textarea{height:auto;min-height:76px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md)}'))).toEqual([])
  })

  it('非输入类不参与判定', () => {
    expect(scanInputRecipes(one('.a_row{height:20px;border:.5px solid var(--dsw-alias-border-l2)}'))).toEqual([])
  })

  it('自证：能数到带描边的输入类', () => {
    expect(scanInputSites(one('.a_input{height:34px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md)}\n.b{color:red}'))).toBe(1)
  })

  it('提示词给出两条判据（不能是空话）', () => {
    expect(INPUT_RECIPE_RULE_HINT).toContain('height')
    expect(INPUT_RECIPE_RULE_HINT).toContain('dsw-radius-md')
    expect(INPUT_RECIPE_RULE_HINT).toContain('select')
  })
})

describe('真实语料：官方规范三条判据全仓干净', () => {
  for (const name of PACKAGES) {
    it(`${name} 发丝线 / 无 border+投影 / 圆角在尺度内 / 危险按钮合规`, () => {
      const files = clientFiles(name)
      expect(scanNonHairlineBorders(files).map((f) => f.file + ':' + f.line + ' ' + f.width)).toEqual([])
      expect(scanBorderWithElevation(files).map((f) => f.file + ':' + f.line + ' ' + f.selector)).toEqual([])
      expect(scanOffScaleRadii(files).map((f) => f.file + ':' + f.line + ' ' + f.value)).toEqual([])
      expect(scanDangerButtonRecipes(files).map((f) => f.file + ':' + f.line + ' ' + f.cls + ' ' + f.code)).toEqual([])
      expect(scanButtonRecipes(files).map((f) => f.file + ':' + f.line + ' ' + f.selector + ' ' + f.code)).toEqual([])
      expect(scanTypographyRoles(files).map((f) => f.file + ':' + f.line + ' ' + f.selector + ' ' + f.code)).toEqual([])
      expect(scanAccentColors(files).map((f) => f.file + ':' + f.line + ' ' + f.selector + ' ' + f.code)).toEqual([])
      expect(scanInputRecipes(files).map((f) => f.file + ':' + f.line + ' ' + f.selector + ' ' + f.code)).toEqual([])
      expect(scanColorLiterals(files).map((f) => f.file + ':' + f.line + ' ' + f.code + ' ' + f.detail)).toEqual([])
    })
  }

  it('**自证不是 0 命中**：全仓中性边框、尺度内圆角、危险按钮都要有量（否则闸门恒绿）', () => {
    const totals = PACKAGES.reduce(
      (acc, name) => {
        const t = scanStyleSpecTotals(clientFiles(name))
        return {
          borders: acc.borders + t.borders,
          tokenRadii: acc.tokenRadii + t.tokenRadii,
          dangerButtons: acc.dangerButtons + t.dangerButtons,
        }
      },
      { borders: 0, tokenRadii: 0, dangerButtons: 0 },
    )
    expect(totals.borders, '中性边框命中数应远大于 0').toBeGreaterThan(50)
    expect(totals.tokenRadii, '具名 token 圆角命中数应大于 0').toBeGreaterThan(10)
    /*
     * 危险按钮目前是 docker / codegraph / env / mcp / profile / prompt 各 1 个（tty 没有 btnDanger
     * 类，它的危险动作走 [data-danger]）。这条数字是检查十一**真的扫到了东西**的证据：类名口径
     * 一旦被收窄（例如正则退化成只认 `.btnDanger`），6 会掉到 0，而 0 违规照样是绿的。
     */
    expect(totals.dangerButtons, '危险按钮命中数应不少于 6').toBeGreaterThanOrEqual(6)
    /*
     * 按钮类的识别口径（类名含 btn/Btn）也要自证：一旦这个正则被收窄成 `.btn` 这类形式，
     * 命中会掉到个位数，「均已对齐」立刻变成一句空话。
     */
    expect(scanButtonClasses(PACKAGES.flatMap((name) => clientFiles(name))).length,
      '被检查十二扫到的按钮类应不少于 25 个').toBeGreaterThanOrEqual(25)
    /* 检查十三也要自证：全仓声明 font-size 的规则数（2026-10-06 实测 323 条）。 */
    expect(scanFontSizeSites(PACKAGES.flatMap((name) => clientFiles(name))),
      '被检查十三扫到的 font-size 站点应不少于 250 处').toBeGreaterThanOrEqual(250)
    /*
     * 检查十四同样要自证：全仓 accent-color 声明数（docker / tty / rss 各 1 条，都是共用的
     * 一条规则）。口径一旦被收窄——例如把选择器限定成 input[type=checkbox]——tty 的
     * .tt_cardCheckbox 就会掉出网外，而「0 违规」照样是绿的。
     */
    expect(scanAccentColorSites(PACKAGES.flatMap((name) => clientFiles(name))),
      '被检查十四扫到的 accent-color 站点应不少于 6 处').toBeGreaterThanOrEqual(6)
    /*
     * 检查十四 ③ 也要自证：标记点数（2026-10-06 实测全仓 30+ 个复选框标记点）。
     * 这条口径一旦被收窄——例如只认 HTML 字符串、漏掉 JSX 的 type: 'checkbox'——命中会掉到个位数，
     * 「每个标记点都有规则管」立刻变成空话。
     */
    expect(scanCheckboxMarkup(PACKAGES.flatMap((name) => clientFiles(name))).length,
      '被检查十四 ③ 扫到的复选框标记点应不少于 20 处').toBeGreaterThanOrEqual(20)
    /* 检查十五同样要自证：全仓带描边的输入类规则数（2026-10-06 实测 13 条）。 */
    expect(scanInputSites(PACKAGES.flatMap((name) => clientFiles(name))),
      '被检查十五扫到的输入类规则应不少于 8 条').toBeGreaterThanOrEqual(8)
    /*
     * 检查十六要自证：全仓「宿主令牌引用」处数（2026-10-06 实测 850+ 处）。这条口径一旦被
     * 收窄（例如只扫 .css 而漏掉内联在 client.js 里的样式），命中会掉到几百以下甚至 0，
     * 而「0 处自带颜色」照样是绿的。
     */
    expect(scanThemeTokenRefs(PACKAGES.flatMap((name) => clientFiles(name))),
      '被检查十六扫到的宿主令牌引用应不少于 500 处').toBeGreaterThanOrEqual(500)
  })
})

describe('检查十六：颜色一律来自宿主主题', () => {
  /*
   * 依据：宿主主题包 README 的「the token sheets are the sole color authority」。判据不是
   * 「整洁」，而是**值**：引用令牌时带字面量兜底，等于在面板里放第二份颜色权威——宿主一旦
   * 改名 token（检查四正是为这件事设的），面板不会报错，只会安静地换成一个不同的颜色
   * （实测 docker / tty 的兜底蓝是 #4d6bfe，而主题给的是 #4176e6）。
   */
  const one = (css) => [{ file: 't.css', source: css }]
  const codes = (css) => scanColorLiterals(one(css)).map((x) => x.code)

  it('引用宿主令牌时带颜色字面量兜底 → fallback（令牌存在，兜底永远不会生效）', () => {
    expect(codes('.a{color:var(--dsw-alias-label-primary,#1a1a1a)}')).toEqual(['fallback'])
  })

  it('兜底本身是 var(…) 时不报（宿主 focus 配方就是这么写的）', () => {
    expect(scanColorLiterals(one('.a{outline-color:var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary))}')))
      .toEqual([])
  })

  it('cssVar 的字符串读法也要抓（tty 的真实形状）', () => {
    expect(codes("const accent = cssVar('--dsw-alias-state-business-primary', '#7c9cff')")).toEqual(['fallback'])
  })

  it('规则体里的字面量颜色 → literal（hex / rgb() / 具名色都算）', () => {
    expect(codes('.a{color:#ff6b6b}')).toEqual(['literal'])
    expect(codes('.a{background:rgba(0,0,0,.32)}')).toEqual(['literal'])
    expect(codes('.a{color:white}')).toEqual(['literal'])
  })

  it('自定义属性的定义位是域调色板的登记处 → 不报', () => {
    expect(scanColorLiterals(one(':where(html,body){--tt-term-bg:#0b0e14;--dk-log-info:#6ea8fe}'))).toEqual([])
  })

  it('mask-image 里的纯黑纯白是 alpha 通道 → 不报', () => {
    expect(scanColorLiterals(one('.a{-webkit-mask-image:linear-gradient(90deg,#000 calc(100% - 8px),transparent)}')))
      .toEqual([])
  })

  it('与令牌混色的纯黑纯白 → 不报；通篇没有 var() 的 color-mix 遮罩 → 报', () => {
    expect(scanColorLiterals(one('.a{background:linear-gradient(90deg,color-mix(in srgb,var(--tt-accent) 70%,#fff 6%),var(--tt-accent))}')))
      .toEqual([])
    expect(codes('.a{background:color-mix(in srgb,#000 42%,transparent)}')).toEqual(['literal'])
  })

  it('以 0 开头的值里还有颜色时不能整条豁免（COLOR_KEYWORD 必须配 $）', () => {
    expect(codes('.a{box-shadow:0 2px 10px rgba(0,0,0,.10)}')).toEqual(['literal'])
    expect(scanColorLiterals(one('.a{background:0 0;border:0}'))).toEqual([])
  })

  it('JS 里的对象字面量 / 内联 CSS / 裸语句都抓得到，且各报一次不重复', () => {
    const js = [{ file: 't.js', source: "const themes = {\n  background: '#0b0e14',\n}\nconst CSS = ['.a{color:#ff6b6b}']\nel.style.color = '#fff'" }]
    const found = scanColorLiterals(js)
    expect(found.map((x) => x.line).sort((a, b) => a - b)).toEqual([2, 4, 5])
    /* JS 对象与裸语句标成 js-literal（改法与 CSS 不同），内联 CSS 仍按 CSS 判据报。 */
    expect(found.filter((x) => x.code === 'js-literal').length).toBe(2)
    expect(found.filter((x) => x.code === 'literal').length).toBe(1)
  })

  it('注释里的颜色不算（说明文字里正写着主题色值）', () => {
    expect(scanColorLiterals(one('/* brand-primary 浅色是 #0f1115、强调蓝是 #4176e6 */\n.a{color:var(--dsw-alias-label-primary)}')))
      .toEqual([])
  })

  it('行号指向命中的那一行（定位信息是给人看的）', () => {
    expect(scanColorLiterals(one('\n.a{color:#fff}'))[0].line).toBe(2)
  })

  it('自证：能数到宿主令牌引用（定义位不算）', () => {
    expect(scanThemeTokenRefs(one('--x:var(--dsw-alias-bg-base);.a{color:red}'))).toBe(1)
    expect(scanThemeTokenRefs(one('--dsw-alias-bg-base:#fff'))).toBe(0)
  })

  it('提示词给出三条判据与出处（不能是空话）', () => {
    expect(COLOR_SOURCE_RULE_HINT).toContain('--dsw-*')
    expect(COLOR_SOURCE_RULE_HINT).toContain('documentElement')
    expect(COLOR_SOURCE_RULE_HINT).toContain('sole color authority')
  })

  it('JS 对象字面量的**键名**不算颜色字面量（误报会把闸门逼成噪声）', () => {
    /*
     * 对象字面量没有分号，整块被当成一条声明，于是第一个键之后的 red: / white: 会落进
     * 「值」里被当成 CSS 具名色。2026-10-06 tty 的 xterm theme 就是这么被报了两条不存在的
     * 颜色（当时只能改成逐属性赋值绕开）——键位现在会被掩掉，所以这一条必须绿。
     */
    const js = [{ file: 't.js', source: "const theme = {\n  black: cssVar('--tt-an-black'),\n  red: cssVar('--tt-an-red'),\n  white: cssVar('--tt-an-white'),\n}" }]
    expect(scanColorLiterals(js)).toEqual([])
  })

  it('JS 对象字面量里第 2 个键的值带字面量 → 报，且行号落在那一行', () => {
    const js = [{ file: 't.js', source: "const theme = {\n  black: cssVar('--tt-an-black'),\n  red: '#f07178',\n}" }]
    expect(scanColorLiterals(js).map((x) => x.code + '@' + x.line)).toEqual(['js-literal@3'])
  })
})
