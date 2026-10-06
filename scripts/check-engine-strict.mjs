/**
 * 环境下限「真的会拦」的一致性守卫（`pnpm engines:check`）。
 *
 * ## 它守的是一件容易静默失效的事
 *
 * 根 `package.json` 的 `engines` 本身**只是声明**：pnpm 默认对不满足的 Node 只发 `WARN`、
 * 装完照样跑（问题在别处冒出来且难归因）。真正让它生效的是 `.npmrc` 的 `engine-strict=true`
 * ——**少这一行，`engines.node` 就等于一句注释**。而这四处的声明分散在四个文件里，任何一处
 * 单独改动都不会被发现：这正是本仓反复在防的**「没有守卫的规矩会在下一次改动里漂掉」**。
 *
 * ## 实测（2026-10-06，pnpm 10.30.3 逐条跑过，不是转述）
 *
 * | 场景 | 无 `engine-strict` | 有 `engine-strict=true` |
 * |---|---|---|
 * | 本项目 `engines.node` 不满足 | `WARN`，**退出码 0**，装完照跑 | `ERR_PNPM_UNSUPPORTED_ENGINE`，退出码 1 |
 * | 依赖的 `engines.node` 不满足 | 照装，退出码 0 | **也拦**，退出码 1 |
 * | 本项目 `engines.pnpm` 不满足 | **拒装**，退出码 1（这一条不需要 `.npmrc`） | 拒装，退出码 1 |
 * | 依赖的 `engines.pnpm` 不满足 | 放行 | **放行**（pnpm 不查依赖的 pnpm 字段） |
 *
 * 两条**不对称**值得记住，写文档时最容易写错：
 *
 *   - `engines.pnpm` 与 `engines.node` 不同——**前者不加 `.npmrc` 也强制**（pnpm 自己管自己）；
 *   - `engine-strict` **会**连依赖一起查（node 那半边），所以开启前必须确认依赖里没有冲突：
 *     本仓 2026-10-06 用 semver 逐条比对 564 个依赖，node / pnpm **均 0 冲突**。
 *
 * 而 `.npmrc` **不随包发布**（`files` 字段里没有它），所以这一行只作用于**克隆本仓开发的人**，
 * 不改变任何 npm 用户的行为——这也是它敢开的前提。
 *
 * ## 判据（四处必须自洽）
 *
 * | # | 判据 |
 * |---|---|
 * | ① | `.npmrc` 里有 `engine-strict=true`（没它 `engines.node` 只是一句注释） |
 * | ② | 根 `package.json` 的顶层 `engines` 同时钉住 Node 与 pnpm 的下限 |
 * | ③ | 两处入口文档（`README.md` / `README.en.md`）都写明了这两条下限 |
 * | ④ | `AGENTS.md` 的前置也写明这两条下限（入口文档不能与 README 分叉） |
 *
 * **刻意不做**：不比对本仓依赖的 engines（那需要 semver，而本仓根部解析不到它——
 * 与 `check-toolchain-pins.mjs` 同一处教训）。依赖冲突这件事是**开 `.npmrc` 那一刻**的
 * 一次性核查，记在 `.npmrc` 注释里；它不适合当常驻闸门（依赖升级会立刻让它变红，
 * 而那时该做的是处理冲突，不是改闸门）。
 *
 * 本文件**不写 shebang**（要被 vitest import，见 `scripts/check-kit-pins.mjs` 的同款注释）。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** 两处下限的**唯一权威**写法（README / AGENTS.md 必须与根 engines 说同一件事）。 */
export const NODE_FLOOR = '22.19'
export const PNPM_FLOOR = '10'

/**
 * 一次判据（**纯函数**，喂 fixture 就能造反例）。
 *
 * @param files - `{ npmrc, packageJson, readme, readmeEn, agents }` 五份文本。
 * @returns 违规描述数组（空数组 = 绿）。
 */
export function engineStrictProblems(files) {
  const problems = []

  if (!/^\s*engine-strict\s*=\s*true\s*$/m.test(files.npmrc)) {
    problems.push('.npmrc 里没有 `engine-strict=true`：`engines.node` 会退化成一句注释（pnpm 默认只 WARN、装完照样跑）')
  }

  let engines = {}
  try {
    engines = JSON.parse(files.packageJson).engines ?? {}
  } catch {
    problems.push('根 package.json 读不动（JSON 解析失败）')
  }
  if (typeof engines.node !== 'string' || !engines.node.includes(NODE_FLOOR)) {
    problems.push(`根 package.json 的 engines.node 没钉住 ${NODE_FLOOR}（现在是 ${JSON.stringify(engines.node)}）`)
  }
  if (typeof engines.pnpm !== 'string' || !engines.pnpm.includes(PNPM_FLOOR)) {
    problems.push(`根 package.json 的 engines.pnpm 没钉住 ${PNPM_FLOOR}（现在是 ${JSON.stringify(engines.pnpm)}）`)
  }
  /*
   * 顶层 engines.dsh 是**别人**的地盘：check-dsh-peers.mjs 明令它不许存在（统一写进
   * dsh.engines.dsh）。这里只做一句提醒——它不是本判据的违规，但根包同时受那道守卫管，
   * 两处都读到同一条错会让定位绕路。
   */
  if (engines.dsh !== undefined) {
    problems.push('根 package.json 顶层出现了 engines.dsh：它归 check-dsh-peers.mjs 管（该写进 dsh.engines.dsh），这里不该有')
  }

  for (const [label, text] of [['README.md', files.readme], ['README.en.md', files.readmeEn]]) {
    if (!text.includes(NODE_FLOOR)) problems.push(`${label} 没写 Node 下限 ${NODE_FLOOR}`)
    if (!new RegExp(`pnpm ${PNPM_FLOOR}\\b`).test(text)) problems.push(`${label} 没写 pnpm 下限 ${PNPM_FLOOR}`)
  }

  if (!files.agents.includes(NODE_FLOOR)) problems.push(`AGENTS.md 的「前置」没写 Node 下限 ${NODE_FLOOR}`)
  if (!new RegExp(`pnpm ${PNPM_FLOOR}\\b`).test(files.agents)) problems.push(`AGENTS.md 的「前置」没写 pnpm 下限 ${PNPM_FLOOR}`)

  return problems
}

/** 读四处输入（只读；文件缺失会抛——缺了就是闸门停摆，不静默跳过）。 */
export function readEngineInputs(repoRoot = REPO_ROOT) {
  const read = (rel) => readFileSync(join(repoRoot, rel), 'utf8')
  return {
    npmrc: read('.npmrc'),
    packageJson: read('package.json'),
    readme: read('README.md'),
    readmeEn: read('README.en.md'),
    agents: read('AGENTS.md'),
  }
}

/** 对真实仓库跑判据（返回违规数组；空数组 = 绿）。 */
export function checkRepo(repoRoot = REPO_ROOT) {
  return engineStrictProblems(readEngineInputs(repoRoot))
}

/**
 * 自检：把判据钉死在夹具上（CI 跑，防止闸门自己被改坏）。
 *
 * 与本仓其余闸门同款理由（见 `check-toolchain-pins.mjs` 的 `selfTest`）：**判据被改坏
 * 比没有闸门更糟**——它会在报告里继续声称「通过」。这里不复用单测（CI 侧那道 gate 是
 * 独立进程），所以自带一组最小夹具：不含真实仓库、纯喂对象。
 */
function selfTest() {
  const good = {
    npmrc: 'link-workspace-packages=true\nengine-strict=true\n',
    packageJson: JSON.stringify({ engines: { node: '>=22.19.0', pnpm: '>=10' } }),
    readme: '需要 Node.js >= 22.19 与 pnpm 10。',
    readmeEn: 'requires Node.js >= 22.19 and pnpm 10.',
    agents: '**前置**：Node ≥ 22.19 与 pnpm 10',
  }
  const cases = [
    ['四处一致', good, []],
    ['抽掉 .npmrc 开关（最隐蔽的漂法）', { ...good, npmrc: 'link-workspace-packages=true\n' }, ['退化成一句注释']],
    ['engines 缺 pnpm 半边', { ...good, packageJson: JSON.stringify({ engines: { node: '>=22.19.0' } }) }, ['engines.pnpm']],
    ['engines 整块缺失', { ...good, packageJson: JSON.stringify({ name: 'x' }) }, ['engines.node', 'engines.pnpm']],
    ['README.en.md 掉下限', { ...good, readmeEn: 'requires pnpm' }, ['README.en.md']],
    ['AGENTS.md 与 README 分叉', { ...good, agents: '**前置**：Node ≥ 22.19' }, ['AGENTS.md']],
    ['顶层混进 engines.dsh', { ...good, packageJson: JSON.stringify({ engines: { node: '>=22.19.0', pnpm: '>=10', dsh: '>=0.1.7-rc.2' } }) }, ['check-dsh-peers']],
  ]
  let failed = 0
  for (const [label, files, expected] of cases) {
    const problems = engineStrictProblems(files).join('\n')
    const ok = expected.every((needle) => problems.includes(needle))
      && (expected.length > 0 || problems === '')
    if (!ok) {
      failed += 1
      console.error(`  ✘ 自检失败：${label} → 期望含 ${JSON.stringify(expected)}，实得 ${JSON.stringify(problems)}`)
    }
  }
  if (failed > 0) {
    console.error(`[check-engine-strict] 自检未通过：${String(failed)}/${String(cases.length)} 组夹具不符合预期`)
    process.exit(1)
  }
  console.log(`[check-engine-strict] 自检通过：${String(cases.length)} 组夹具（判据没被改坏）`)
}

/* CLI（人工核对用；测试走 checkRepo / engineStrictProblems） */
if (process.argv.includes('--self-test')) selfTest()

if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  const problems = checkRepo()
  for (const problem of problems) console.error(`  ✘ ${problem}`)
  if (problems.length > 0) {
    console.error(`[check-engine-strict] 未通过：${String(problems.length)} 处不一致`)
    console.error('四处（.npmrc 开关 / 根 engines / README 中英 / AGENTS.md）必须说同一件事：')
    console.error(`  低于 Node ${NODE_FLOOR} 或 pnpm ${PNPM_FLOOR} 的环境在 \`pnpm install\` 时直接失败。`)
    process.exit(1)
  }
  console.log(`[check-engine-strict] 通过：.npmrc 开关 ↔ 根 engines ↔ README(中/英) ↔ AGENTS.md 四处一致（Node ${NODE_FLOOR} / pnpm ${PNPM_FLOOR}）`)
}
