/**
 * **环境下限「真的会拦」** 的一致性守卫（L0）。
 *
 * ## 它守的是一件容易静默失效的事
 *
 * 根 `package.json` 的 `engines` 本身**只是声明**：pnpm 默认只发警告，装完照样能跑，问题在别处冒出来
 * 且难归因。真正让它生效的是 `.npmrc` 的 `engine-strict=true`——**少这一行，`engines` 就等于一句
 * 注释**。而这三处（`.npmrc` 的开关、根 `package.json` 的下限、README/AGENTS 两条入口文档里的说法）
 * 分散在四个文件里，任何一处单独改动都不会被发现：这正是「没有守卫的规矩会在下一次改动里漂掉」。
 *
 * ## 实测（2026-10-03，写这条守卫时当场跑过）
 *
 * ```sh
 * d=$(mktemp -d); cd $d
 * printf '{"name":"x","version":"1.0.0","engines":{"node":">=99.0.0"}}\n' > package.json
 * printf 'engine-strict=true\n' > .npmrc
 * pnpm install        # → ERR_PNPM_UNSUPPORTED_ENGINE  Unsupported environment (bad pnpm and/or Node.js version)
 * ```
 *
 * 所以 README 里那句「直接失败而不是静默装完」是**可复现**的，不是转述。
 *
 * ## 判据
 *
 * | # | 判据 |
 * |---|---|
 * | ① | `.npmrc` 里有 `engine-strict=true`（没它 `engines` 只是一句注释） |
 * | ② | 根 `package.json` 的 `engines` 同时钉住 Node 与 pnpm 的下限 |
 * | ③ | README § 系统要求 提到这两条下限 + 失败码（用户看到的就是它） |
 * | ④ | AGENTS.md 的「前置」提到这两条下限（入口文档不能与 README 分叉） |
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const read = (path: string): string => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

/** 一次判据（**纯函数**，喂 fixture 就能造反例）。 */
export function engineStrictProblems(files: {
  npmrc: string
  packageJson: string
  readme: string
  agents: string
}): string[] {
  const problems: string[] = []

  if (!/^\s*engine-strict\s*=\s*true\s*$/m.test(files.npmrc)) {
    problems.push('.npmrc 里没有 `engine-strict=true`：`engines` 会退化成一句注释（pnpm 默认只警告）')
  }

  let engines: { node?: unknown; pnpm?: unknown } = {}
  try {
    engines = (JSON.parse(files.packageJson) as { engines?: typeof engines }).engines ?? {}
  } catch {
    problems.push('根 package.json 读不动（JSON 解析失败）')
  }
  if (typeof engines.node !== 'string' || !engines.node.includes('22.19')) {
    problems.push(`根 package.json 的 engines.node 没钉住 22.19（现在是 ${JSON.stringify(engines.node)}）`)
  }
  if (typeof engines.pnpm !== 'string' || !engines.pnpm.includes('10')) {
    problems.push(`根 package.json 的 engines.pnpm 没钉住 10（现在是 ${JSON.stringify(engines.pnpm)}）`)
  }

  if (!files.readme.includes('22.19')) problems.push('README § 系统要求 没写 Node 下限 22.19')
  if (!/pnpm 10/.test(files.readme)) problems.push('README § 系统要求 没写 pnpm 下限 10')
  if (!files.readme.includes('ERR_PNPM_UNSUPPORTED_ENGINE')) {
    problems.push('README 没写失败长什么样（`ERR_PNPM_UNSUPPORTED_ENGINE`）——用户看到的就是它')
  }

  if (!files.agents.includes('22.19')) problems.push('AGENTS.md 的前置没写 Node 下限 22.19')
  if (!/pnpm 10/.test(files.agents)) problems.push('AGENTS.md 的前置没写 pnpm 下限 10')

  return problems
}

const REAL = {
  npmrc: read('.npmrc'),
  packageJson: read('package.json'),
  readme: read('README.md'),
  agents: read('AGENTS.md'),
}

describe('环境下限的一致性（.npmrc 开关 ↔ engines ↔ 入口文档）', () => {
  it('当前仓库四处一致', () => {
    expect(engineStrictProblems(REAL)).toEqual([])
  })

  it('反例①：抽掉 `.npmrc` 的开关 → 报出来（`engines` 变注释）', () => {
    const bad = { ...REAL, npmrc: REAL.npmrc.replace(/^engine-strict=true$/m, '# engine-strict=true') }
    expect(engineStrictProblems(bad).join('\n')).toContain('退化成一句注释')
  })

  it('反例②：engines 少了 pnpm（只钉 Node）→ 报出来', () => {
    const bad = { ...REAL, packageJson: JSON.stringify({ engines: { node: '>=22.19.0' } }) }
    expect(engineStrictProblems(bad).join('\n')).toContain('engines.pnpm')
  })

  it('反例③：README 不提失败码 → 报出来', () => {
    const bad = { ...REAL, readme: REAL.readme.replaceAll('ERR_PNPM_UNSUPPORTED_ENGINE', '某个错误') }
    expect(engineStrictProblems(bad).join('\n')).toContain('ERR_PNPM_UNSUPPORTED_ENGINE')
  })

  it('反例④：AGENTS.md 与 README 分叉（入口只说 Node）→ 报出来', () => {
    const bad = { ...REAL, agents: REAL.agents.replace(/pnpm 10/g, 'pnpm') }
    expect(engineStrictProblems(bad).join('\n')).toContain('AGENTS.md')
  })
})
