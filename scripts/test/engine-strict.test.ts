/**
 * [`scripts/check-engine-strict.mjs`](../check-engine-strict.mjs) 的用例 ——
 * 「环境下限真的会拦」的四判据一致性。
 *
 * ## 这份用例守两件事
 *
 * 1. **真实仓库必须绿**（.npmrc 开关 ↔ 根 engines ↔ README 中/英 ↔ AGENTS.md 四处一致）；
 * 2. **守卫必须会红**——每一条判据都配一个反例，且反例**先在真实文本上做替换并断言替换生效**
 *    （否则反例会退化成空测试）。本仓的教训是「没有守卫的规矩会在下一次改动里漂掉」，
 *    而这条规矩的漂法尤其隐蔽：**抽掉 `.npmrc` 那一行不会有任何东西报错**，
 *    `engines.node` 只是悄悄退回成一句注释。
 *
 * 反例里用的就是**这块配置真实会漂的几种形态**：`.npmrc` 被抽掉、engines 少了 pnpm 半边、
 * 入口文档与 README 分叉、顶层混进 `engines.dsh`（那是 `check-dsh-peers.mjs` 的地盘）。
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { NODE_FLOOR, PNPM_FLOOR, checkRepo, engineStrictProblems, readEngineInputs } from '../check-engine-strict.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (rel) => readFileSync(join(repoRoot, rel), 'utf8')

/** 真实四处输入（只读；反例都在它的副本上改）。 */
const real = readEngineInputs(repoRoot)

/** 在真实文本上做一次替换造 fixture；**替换没生效就抛**（否则反例会变成空测试）。 */
function mutate(text, from, to) {
  if (!text.includes(from)) throw new Error(`fixture 替换没匹配上：${from.slice(0, 60)}`)
  const mutated = text.replace(from, to)
  expect(mutated, 'fixture 必须真的改动文本').not.toBe(text)
  return mutated
}

describe('环境下限一致性：真实仓库', () => {
  it('四处一致（守卫必须绿）', () => {
    expect(checkRepo(repoRoot)).toEqual([])
  })

  it('命中不是 0：四处都真的扫到了东西（否则判据恒绿）', () => {
    /*
     * 本仓明令「只会在 0 命中时绿的检查等于没有检查」。这里逐处钉一下：
     * 断言每一处**读到了内容且含下限**，而不是「没报错就算过」。
     */
    expect(real.npmrc, '.npmrc 应读到').toContain('engine-strict=true')
    const engines = JSON.parse(real.packageJson).engines ?? {}
    expect(engines.node, '根 engines.node').toContain(NODE_FLOOR)
    expect(engines.pnpm, '根 engines.pnpm').toContain(PNPM_FLOOR)
    expect(real.readme, 'README.md').toContain(NODE_FLOOR)
    expect(real.readmeEn, 'README.en.md').toContain(NODE_FLOOR)
    expect(real.agents, 'AGENTS.md').toContain(NODE_FLOOR)
  })

  it('根 package.json 里没有顶层 engines.dsh（那是 check-dsh-peers 的地盘）', () => {
    const engines = JSON.parse(real.packageJson).engines ?? {}
    expect(engines.dsh, '顶层 engines.dsh 该写进 dsh.engines.dsh').toBeUndefined()
    expect(engines.node, 'node 半边在').toBeDefined()
    expect(engines.pnpm, 'pnpm 半边在').toBeDefined()
  })
})

describe('反例①：`.npmrc` 的开关被抽掉 → 必须报出来（这是最隐蔽的漂法）', () => {
  it('注释掉 engine-strict=true → 报「退化成一句注释」', () => {
    const problems = engineStrictProblems({
      ...real,
      npmrc: mutate(real.npmrc, 'engine-strict=true', '# engine-strict=true'),
    })
    expect(problems.join('\n')).toContain('退化成一句注释')
  })

  it('整行删掉 → 同样报出来', () => {
    const problems = engineStrictProblems({
      ...real,
      npmrc: real.npmrc.replace(/^engine-strict=true$/m, ''),
    })
    expect(problems.join('\n')).toContain('engine-strict')
  })
})

describe('反例②：根 engines 少了半边 → 必须报出来', () => {
  it('只钉 Node、没有 pnpm → 报 engines.pnpm', () => {
    const problems = engineStrictProblems({
      ...real,
      packageJson: JSON.stringify({ engines: { node: '>=22.19.0' } }),
    })
    expect(problems.join('\n')).toContain('engines.pnpm')
  })

  it('engines 整块没了 → Node 与 pnpm 两条都报', () => {
    const problems = engineStrictProblems({ ...real, packageJson: JSON.stringify({ name: 'x' }) })
    const joined = problems.join('\n')
    expect(joined).toContain('engines.node')
    expect(joined).toContain('engines.pnpm')
  })

  it('下限被放宽（22.19 → 22.0）→ 报出来', () => {
    const problems = engineStrictProblems({
      ...real,
      packageJson: JSON.stringify({ engines: { node: '>=22.0.0', pnpm: '>=10' } }),
    })
    expect(problems.join('\n')).toContain('engines.node')
  })

  it('顶层混进 engines.dsh → 点明它归 check-dsh-peers 管', () => {
    const problems = engineStrictProblems({
      ...real,
      packageJson: JSON.stringify({ engines: { node: '>=22.19.0', pnpm: '>=10', dsh: '>=0.1.7-rc.2' } }),
    })
    expect(problems.join('\n')).toContain('check-dsh-peers')
  })
})

describe('反例③：入口文档与配置分叉 → 必须报出来', () => {
  it('README.md 掉了 Node 下限 → 报它（另一份 README.en.md 照常绿）', () => {
    const problems = engineStrictProblems({ ...real, readme: real.readme.replaceAll(NODE_FLOOR, '22') })
    const joined = problems.join('\n')
    expect(joined).toContain('README.md')
    expect(joined).not.toContain('README.en.md')
  })

  it('README.en.md 掉了 pnpm 下限 → 报它', () => {
    const problems = engineStrictProblems({ ...real, readmeEn: mutate(real.readmeEn, `pnpm ${PNPM_FLOOR}`, 'pnpm') })
    const joined = problems.join('\n')
    expect(joined).toContain('README.en.md')
    expect(joined).not.toContain('README.md 没写')
  })

  it('AGENTS.md 与 README 分叉（只说 Node 不提 pnpm）→ 报 AGENTS.md', () => {
    const problems = engineStrictProblems({ ...real, agents: real.agents.replaceAll(`pnpm ${PNPM_FLOOR}`, 'pnpm') })
    const joined = problems.join('\n')
    expect(joined).toContain('AGENTS.md')
    expect(joined).not.toContain('README.md 没写')
  })
})

describe('反例④：多处同时坏 → 全都报，不许只报第一条', () => {
  it('开关抽掉 + engines 缺 pnpm + 两份 README 都掉下限 → 至少四条', () => {
    const problems = engineStrictProblems({
      npmrc: real.npmrc.replace(/^engine-strict=true$/m, ''),
      packageJson: JSON.stringify({ engines: { node: '>=22.19.0' } }),
      readme: real.readme.replaceAll(NODE_FLOOR, '22'),
      readmeEn: real.readmeEn.replaceAll(NODE_FLOOR, '22'),
      agents: real.agents,
    })
    expect(problems.length).toBeGreaterThanOrEqual(4)
  })
})

describe('判定是对 CRLF 免疫的（Windows 检出不该假红）', () => {
  it('五份输入全 CRLF 化 → 仍然绿', () => {
    const crlf = (text) => text.replace(/\n/g, '\r\n')
    expect(engineStrictProblems({
      npmrc: crlf(real.npmrc),
      packageJson: real.packageJson,
      readme: crlf(real.readme),
      readmeEn: crlf(real.readmeEn),
      agents: crlf(real.agents),
    })).toEqual([])
  })
})
