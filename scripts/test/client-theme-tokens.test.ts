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
 * 2026-10-04 的真实回归就写在第三组里：`devdata` / `devenv` / `devfront` 三张卡片引用了
 * `--dsw-alias-border-secondary` / `--dsw-alias-bg-primary`，而宿主主题 403 个 token 里
 * 一个都没有——输入框、按钮、目标行**全部没有框**（shorthand 的 longhand 回落 `unset`）。
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { listClientSourceFiles } from '../client-host-url.mjs'
import {
  diffThemeTokens,
  loadThemeTokenSnapshot,
  parseThemeTokenDefinitions,
  scanThemeTokenUses,
  THEME_TOKEN_SNAPSHOT,
} from '../client-theme-tokens.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (rel) => readFileSync(join(repoRoot, rel), 'utf8')

/* 快照缺失 / 空表都会在这里抛——那正是「闸门停摆」该有的表现，所以放在模块作用域。 */
const { tokens: knownTokens, meta } = loadThemeTokenSnapshot(repoRoot)

/** 全部有客户端半体的包（`pnpm -r typecheck` 里 client-lint 逐个跑的就是这些）。 */
const PACKAGES = [
  'codegraph',
  'devdata',
  'devenv',
  'devfront',
  'docker',
  'env',
  'kit-settings',
  'mcp',
  'profile',
  'prompt',
  'rss',
  'search',
  'tty',
]

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
  it('13 个包都能被找到客户端半体（名单漂了要在这里发现）', () => {
    const missing = PACKAGES.filter((name) => listClientSourceFiles(join(repoRoot, 'packages', name)).length === 0)
    expect(missing).toEqual([])
  })

  for (const name of PACKAGES) {
    it(`${name} 无未知样式变量`, () => {
      const files = listClientSourceFiles(join(repoRoot, 'packages', name))
      const found = files.flatMap((file) => unknownIn(readFileSync(file, 'utf8')))
      expect(found.map((use) => use.token)).toEqual([])
    })
  }

  it('全部客户端半体合起来至少引用了 100 处（0 命中说明这道检查根本没在扫东西）', () => {
    const total = PACKAGES.flatMap((name) => listClientSourceFiles(join(repoRoot, 'packages', name)))
      .reduce((sum, file) => sum + scanThemeTokenUses(readFileSync(file, 'utf8')).length, 0)
    expect(total).toBeGreaterThan(100)
  })
})

describe('反例：把真名改成病名，规则必须报出来', () => {
  it('devdata 的 --dsw-alias-border-l4 → --dsw-alias-border-secondary 会被抓（2026-10-04 的真实回归）', () => {
    const real = read('packages/devdata/client.js')
    const mutated = real.replaceAll('--dsw-alias-border-l4', '--dsw-alias-border-secondary')
    expect(mutated).not.toBe(real) // 替换没生效的话，下面就是一条空测试

    const found = unknownIn(mutated)
    expect(found.length).toBeGreaterThan(0)
    expect([...new Set(found.map((use) => use.token))]).toEqual(['--dsw-alias-border-secondary'])
    // 位置要能定位到具体那一行（CLI 靠它告诉人去哪改）
    expect(found.every((use) => use.line > 0 && use.col > 0)).toBe(true)
  })

  it('devdata 的 --dsw-specific-input-major → --dsw-alias-bg-primary 也会被抓（**每一处**都要报）', () => {
    const real = read('packages/devdata/client.js')
    const mutated = real.replaceAll('--dsw-specific-input-major', '--dsw-alias-bg-primary')
    expect(mutated).not.toBe(real)
    /*
     * 条数**现算**，不写死：卡片改版会增删这个变量的用处（2026-10-04 版式重做就把 `.dd_save` 那处
     * 改成了 `--dsw-alias-bg-layer-1`，写死 `['…','…']` 的断言当成就红了——而红的是断言不是规则）。
     * 判据要守的性质是「**每一处**都报出来、顺序照原文」，与具体出现几次无关。
     */
    const expected = real.match(/--dsw-specific-input-major/g) ?? []
    expect(expected.length).toBeGreaterThan(0)
    expect(unknownIn(mutated).map((use) => use.token)).toEqual(expected.map(() => '--dsw-alias-bg-primary'))
  })
})

describe('preview 的假主题也不许发明名字（codegraph 那次就是这么把错藏住的）', () => {
  /*
   * 各包 preview harness 用的是**自己造的假主题**：名字写错时预览仍然是对的，只有真机是错的
   * ——`packages/codegraph/scripts/preview-card.mjs` 里原本写着 `--dsw-alias-state-warning-primary`
   * （真名 `state-warn-primary`）。所以假主题的定义位也在本规则的管辖内：它必须只定义真名字。
   */
  const previews = [
    'packages/codegraph/scripts/preview-card.mjs',
    'packages/devdata/scripts/preview-card.mjs',
    'packages/devenv/scripts/preview-card.mjs',
    'packages/devfront/scripts/preview-card.mjs',
  ]

  for (const rel of previews) {
    it(`${rel} 的假主题只用真名字`, () => {
      let source
      try {
        source = read(rel)
      } catch {
        return // 这个包还没建 preview 脚本：不是本用例要管的事
      }
      const defined = parseThemeTokenDefinitions(source)
      expect(defined.length).toBeGreaterThan(0)
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
