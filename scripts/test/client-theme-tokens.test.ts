/**
 * [`scripts/client-theme-tokens.mjs`](../client-theme-tokens.mjs) 的单元测试 ——
 * 客户端半体「样式变量必须真的存在」规则。
 *
 * ## 为什么有这份测试
 *
 * 这条规则**只在有人写错名字时才出声**（上线时清完 5 处后全仓 0 命中），所以它自己漂了
 * 没人会发现——两种漂法都会让防线白给：
 *
 *   ① **漏报**：解析/比对写松（把 `var()` 引用当成定义、或拿一份空快照比对）→ 下一个
 *      「写错名字的框直接消失」照样溜进真机；
 *   ② **误报**：把定义位、fallback 当违规 → 对着合法代码报错，最后一定会被人削弱或加豁免。
 *
 * 三组断言各有分工：纯函数语义（该报的必须报、不该报的不许报）、快照的形状（空表 / 病名
 * 回到表里都算这道闸门失效）、**对全部真实客户端半体做一次全量断言**（既是「规则上线即绿」
 * 的证据，也是「以后有人写回去」的拦截网）。反例一律**拿真实源码做字符串替换**并先断言
 * 替换生效——本仓刚发生过「命中 0 个文件、恒绿、拦不住任何东西」的闸门。
 *
 * 2026-10-04 的真实回归写在第三组里：卡片引用了不存在的 `--dsw-alias-border-secondary` /
 * `--dsw-alias-bg-primary`（宿主主题 403 个 token 里一个都没有）——输入框、按钮、目标行
 * **全部没有框**（shorthand 的 longhand 回落 `unset`）。2026-10-06 实测同一类错**仍在 main 上
 * 活着**（codegraph 的 `state-warning-primary`、mcp 的 `separator-primary`），所以第三组的
 * 反例直接用它们，而不是造一个假想的名字。
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  diffThemeTokens,
  listThemeScanFiles,
  loadThemeTokenSnapshot,
  parseThemeTokenDefinitions,
  scanThemeTokenUses,
  THEME_TOKEN_SNAPSHOT,
} from '../client-theme-tokens.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (rel) => readFileSync(join(repoRoot, rel), 'utf8')

/* 快照缺失 / 空表都会在这里抛——那正是「闸门停摆」该有的表现，所以放在模块作用域。 */
const { tokens: knownTokens, meta } = loadThemeTokenSnapshot(repoRoot)

/**
 * 全部有客户端半体的包（`pnpm -r typecheck` 里 client-lint 逐个跑的就是这些）。
 *
 * **不写死**：名单从 `packages/` 现算（只收真的有客户端半体的包），少一个多一个都会在这里现形
 * ——写死名单的代价是每加一个包就要来改一次，而漏改的后果是那个包**不被本规则管辖**。
 * （与 `scripts/docs-index.mjs` 判据 5 同款理由：清单一旦靠人记，就会漂。）
 */
const PACKAGES = readdirSync(join(repoRoot, 'packages'))
  .filter((name) => listThemeScanFiles(join(repoRoot, 'packages', name)).length > 0)
  .sort()

/** 真实语料里引用的未知名字（判据与 client-lint 检查 ③ 完全一致）。 */
const unknownIn = (text) => scanThemeTokenUses(text).filter((use) => !knownTokens.has(use.token))

describe('parseThemeTokenDefinitions · 只认「定义位」', () => {
  const source = [
    'body { --dsw-alias-bg-base: #fff; --dsw-alias-border-l1: #0000000a; }',
    'body[data-ds-dark-theme] { --dsw-alias-bg-base: #000; --dsw-alias-border-l2: #fff2; }',
    '.x { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-1) }',
  ].join('\n')

  it('明暗两档取并集、去重、排序', () => {
    expect(parseThemeTokenDefinitions(source)).toEqual([
      '--dsw-alias-bg-base',
      '--dsw-alias-border-l1',
      '--dsw-alias-border-l2',
    ])
  })

  it('var(...) 里的引用**不算**定义——否则判据自己就失效了', () => {
    const names = parseThemeTokenDefinitions(source)
    expect(names).not.toContain('--dsw-alias-label-primary')
    expect(names).not.toContain('--dsw-alias-bg-layer-1')
  })

  it('没有 token 的源码给空数组（不是 undefined、不是报错）', () => {
    expect(parseThemeTokenDefinitions('body{color:red}')).toEqual([])
  })
})

describe('scanThemeTokenUses · 只认「引用位」、带定位、认得 fallback', () => {
  it('抓 var() 引用，行号列号准到 CLI 能直接打印 file:line:col', () => {
    const text = [
      '.a{border:1px solid var(--dsw-alias-border-l4)}',
      '.b{color:var(--dsw-alias-label-primary)}',
    ].join('\n')
    expect(scanThemeTokenUses(text)).toEqual([
      { token: '--dsw-alias-border-l4', line: 1, col: 25, hasFallback: false },
      { token: '--dsw-alias-label-primary', line: 2, col: 14, hasFallback: false },
    ])
  })

  it('客户端半体自己定义局部变量（`--dsw-x:`）不算引用', () => {
    expect(scanThemeTokenUses('.a{--dsw-alias-my-local:red;color:var(--dsw-alias-my-local)}')).toEqual([
      { token: '--dsw-alias-my-local', line: 1, col: 39, hasFallback: false },
    ])
  })

  it('带 fallback 的引用照抓，但标出来（它会静默降级成另一个颜色，更隐蔽）', () => {
    const found = scanThemeTokenUses('.a{color:var(--dsw-alias-state-warn-primary, var(--dsw-alias-state-error-primary))}')
    expect(found).toEqual([
      { token: '--dsw-alias-state-warn-primary', line: 1, col: 14, hasFallback: true },
      { token: '--dsw-alias-state-error-primary', line: 1, col: 50, hasFallback: false },
    ])
  })
})

describe('快照 · 形状与内容（空表 / 病名回到表里 = 这道闸门失效）', () => {
  it('是生成物，记着来源、宿主版本与条数', () => {
    expect(meta.generator).toBe('scripts/sync-dsh-theme-tokens.mjs')
    expect(String(meta.source)).toContain('dsh-client-ui-theme')
    expect(meta.count).toBe(meta.tokens.length)
    expect(meta.tokens.length).toBeGreaterThan(300)
  })

  it('含我们实际在用的那几族名字', () => {
    for (const token of [
      '--dsw-alias-border-l1',
      '--dsw-alias-border-l4',
      '--dsw-alias-bg-base',
      '--dsw-alias-bg-layer-1',
      '--dsw-specific-input-major',
      '--dsw-alias-label-primary',
      '--dsw-alias-state-warn-primary',
    ]) {
      expect(knownTokens.has(token), token + ' 应该在快照里').toBe(true)
    }
  })

  it('**病名不许回到表里**：它们回来就意味着闸门对那个错名失去作用', () => {
    for (const token of [
      '--dsw-alias-border-secondary',
      '--dsw-alias-bg-primary',
      '--dsw-alias-state-warning-primary',
      '--dsw-alias-separator-primary',
    ]) {
      expect(knownTokens.has(token), token + ' 不该出现在宿主主题里').toBe(false)
    }
  })
})

describe('真实语料：全部客户端半体引用的名字都真的存在', () => {
  it('有客户端半体的包都能被找到（0 个 = 名单现算失效，闸门会恒绿）', () => {
    expect(PACKAGES.length, '有客户端半体的包至少应有一个').toBeGreaterThan(0)
  })

  for (const name of PACKAGES) {
    it(`${name} 无未知样式变量`, () => {
      const files = listThemeScanFiles(join(repoRoot, 'packages', name))
      const found = files.flatMap((file) => unknownIn(readFileSync(file, 'utf8')))
      expect(found.map((use) => use.token)).toEqual([])
    })
  }

  it('全部客户端半体合起来至少引用了 100 处（0 命中说明这道检查根本没在扫东西）', () => {
    const total = PACKAGES.flatMap((name) => listThemeScanFiles(join(repoRoot, 'packages', name)))
      .reduce((sum, file) => sum + scanThemeTokenUses(readFileSync(file, 'utf8')).length, 0)
    expect(total).toBeGreaterThan(100)
  })

  it('独立 `.css` 也在扫描面内（2026-10-06 的盲区：只扫 .js 时 docker 报「0 处」）', () => {
    /*
     * 本仓明令「只会在 0 命中时绿的检查等于没有检查」。docker 的样式住在
     * `client-src/docker.css`（24 处）、tty 的在 `client-src/tty.css`（37 处）——只按 `.js`
     * 枚举时前者报「样式变量 **0** 处」、后者只看到 2 处，**那份 .css 里的名字一个都没被检查**。
     * 这条用例把「`listThemeScanFiles` 必须收 .css」钉住：改回只认 .js 就在这里红。
     */
    const docker = listThemeScanFiles(join(repoRoot, 'packages', 'docker'))
    const css = docker.filter((file) => file.endsWith('.css'))
    expect(css.length, 'docker 应有 client-src/docker.css').toBeGreaterThan(0)
    const cssUses = css.reduce((sum, file) => sum + scanThemeTokenUses(readFileSync(file, 'utf8')).length, 0)
    expect(cssUses, 'docker.css 里的引用必须真的被扫到').toBeGreaterThan(0)
  })
})

describe('反例：把真名改成病名，规则必须报出来', () => {
  it('codegraph 的 --dsw-alias-state-warn-primary → --dsw-alias-state-warning-primary 会被抓（2026-10-04 的真实回归）', () => {
    /*
     * 这两个名字只差一个 `ing`，而代价是 wire 上的告警文本**整条没有颜色**：`color:` 那条声明
     * 含无效 var() → 计算值阶段整条作废。2026-10-06 实测它在 main 上**仍然存在**——那次修复
     * （7326b9ab）跟着被 reset 弃掉的分支线一起消失了，所以这条用例同时是「规则能不能拦住它」的证明。
     */
    const real = read('packages/codegraph/client.js')
    const mutated = real.replaceAll('--dsw-alias-state-warn-primary', '--dsw-alias-state-warning-primary')
    expect(mutated).not.toBe(real) // 替换没生效的话，下面就是一条空测试

    const found = unknownIn(mutated)
    expect(found.length).toBeGreaterThan(0)
    expect([...new Set(found.map((use) => use.token))]).toEqual(['--dsw-alias-state-warning-primary'])
    // 位置要能定位到具体那一行（CLI 靠它告诉人去哪改）
    expect(found.every((use) => use.line > 0 && use.col > 0)).toBe(true)
  })

  it('mcp 的 --dsw-alias-border-l2 → --dsw-alias-separator-primary（那个名字根本不存在）会被抓', () => {
    /*
     * `separator` 这一族在宿主 403 个 token 里**一个都没有**（实测 `--dsw-alias-separator-primary`
     * 未定义）。它是 `border-bottom` 简写的一部分，所以后果不是「分隔线颜色不对」，而是**分隔线整条消失**。
     * 条数**现算**、不写死：卡片改版会增删这个变量的用处，写死条数的断言会在改版时红——而红的是
     * 断言不是规则。判据要守的性质是「**每一处**都报出来、顺序照原文」，与具体出现几次无关。
     */
    const real = read('packages/mcp/client.js')
    const mutated = real.replaceAll('--dsw-alias-border-l2', '--dsw-alias-separator-primary')
    expect(mutated).not.toBe(real)
    const expected = real.match(/--dsw-alias-border-l2/g) ?? []
    expect(expected.length).toBeGreaterThan(0)
    expect(unknownIn(mutated).map((use) => use.token)).toEqual(expected.map(() => '--dsw-alias-separator-primary'))
  })
})

describe('preview 的假主题也不许发明名字（codegraph 那次就是这么把错藏住的）', () => {
  /*
   * 各包 preview harness 用的是**自己造的假主题**：名字写错时预览仍然是对的，只有真机是错的
   * ——`packages/codegraph/scripts/preview-card.mjs` 里原本写着 `--dsw-alias-state-warning-primary`
   * （真名 `state-warn-primary`）。所以假主题的定义位也在本规则的管辖内：它必须只定义真名字。
   *
   * 名单**现算**（不写死四个包）：新包加了 preview 脚本就自动纳入管辖，否则那道预览会继续
   * 用假名字把错藏住——而它本来就是「四层防线都看不见」里的一层。
   */
  const listPreviews = (name) => {
    try {
      return readdirSync(join(repoRoot, 'packages', name, 'scripts'))
        .filter((file) => /^preview.*\.mjs$/.test(file))
        .map((file) => `packages/${name}/scripts/${file}`)
    } catch {
      return [] // 这个包没有 scripts/ 目录
    }
  }
  const previews = readdirSync(join(repoRoot, 'packages')).flatMap(listPreviews).sort()

  it('扫到了 preview 脚本（0 个 = 这条用例在扫空气）', () => {
    expect(previews.length, '至少应有 codegraph 的 preview-card.mjs').toBeGreaterThan(0)
  })

  for (const rel of previews) {
    it(`${rel} 的假主题只用真名字`, () => {
      let source
      try {
        source = read(rel)
      } catch {
        return // 这个包还没建 preview 脚本：不是本用例要管的事
      }
      const defined = parseThemeTokenDefinitions(source)
      if (defined.length === 0) return // 这个脚本不造假主题（如 search/tty 的 harness 另放）
      expect(defined.filter((token) => !knownTokens.has(token))).toEqual([])
    })
  }
})

describe('loadThemeTokenSnapshot · 读不到 / 空表都不许静默跳过', () => {
  it('快照缺失 → 抛错，并告诉人怎么生成', () => {
    expect(() => loadThemeTokenSnapshot(join(tmpdir(), 'dsh-no-such-repo-xyz'))).toThrow(/sync-dsh-theme-tokens/)
  })

  it('空 tokens → 抛错（空快照会让这道闸门恒绿）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-theme-tokens-'))
    mkdirSync(join(dir, dirname(THEME_TOKEN_SNAPSHOT)), { recursive: true })
    writeFileSync(join(dir, THEME_TOKEN_SNAPSHOT), JSON.stringify({ tokens: [] }))
    expect(() => loadThemeTokenSnapshot(dir)).toThrow(/恒绿/)
  })
})

describe('diffThemeTokens · 分得清「快照有宿主没有」与「宿主有快照没有」', () => {
  it('两边各有独有项时分别报出来', () => {
    expect(diffThemeTokens(['a', 'b'], ['b', 'c'])).toEqual({ missing: ['a'], added: ['c'] })
  })

  it('完全一致时两项都空（--check 的通过条件）', () => {
    expect(diffThemeTokens(['a'], ['a'])).toEqual({ missing: [], added: [] })
  })
})
