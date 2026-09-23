#!/usr/bin/env node
/**
 * 防回归：可安装为 DSH 插件的包必须用 `peerDependencies` 声明与当前仓
 * cohort 一致的 DSH 兼容范围。
 *
 * 两个字段各管一件事，本脚本同时守：
 *  - **强制**：`peerDependencies` 里名为 `@deepseek-ai/dsh` 或以 `@deepseek-ai/dsh-`
 *    开头的项。DSH 在**安装前**（plugin-manager）与**启动时**（app-boot 的
 *    compatibility preflight）都用
 *    `semver.satisfies(runtimeVersion, range, { includePrerelease: true })` 判定；
 *    预发布参与范围匹配（这一点与 npm 默认语义不同）。
 *  - **展示**：`dsh.engines.dsh`。rc.1 的宿主代码里**没有任何读取方**（app-boot
 *    README 原文：这些检查使用 peer 声明，而不是 engines.dsh），但插件市场 / 社区
 *    条目那类外部消费方仍按它展示「兼容 / 不兼容」。保留它只为市场口径，值必须与
 *    peer 下限一致——否则就是一条与事实不符的声明，比不声明更糟。
 *  - 被拒的插件启动时整行 `disabled`（bundle 整体跳过），安装时抛
 *    `incompatible-version`；豁免要写进 profile 自己的 `compatibility.json`。
 *
 * 覆盖范围：`scripts/publish-targets.mjs` 里声明了 `dsh.bundle.patch` 的包
 * （= 能被 `dsh plugin` 挂载的插件，含 packages/all 与根 bundle）+ `templates/hello`
 * 模板。纯库包（如 `@hyzyn/dsh-kit`）不参与挂载，不加这些字段。
 *
 * 用法：
 *   node scripts/check-dsh-peers.mjs
 *   node scripts/check-dsh-peers.mjs --app-boot /path/to/@deepseek-ai/dsh-app-boot
 *     # 可选：额外用 DSH 自己的判定器逐包核对（需要一份该 cohort 的 app-boot）
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { targets } from './publish-targets.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 本仓统一适配的 DSH cohort；升级 cohort 时改这一处 + 各包 peer 范围。 */
const DSH_COHORT = '0.1.7-rc.1'
/** 唯一支持的 peer 下限写法：`^<cohort>`（预发布参与匹配，见文件头）。 */
const EXPECTED_RANGE = `^${DSH_COHORT}`
/**
 * 市场展示位的下限写法。市场解析器只认 `>=X.Y.Z[-预发布]` 一种形式，所以这里不能
 * 用 `^`；两边下限都必须是 DSH_COHORT。
 */
const EXPECTED_ENGINES = `>=${DSH_COHORT}`

/** 从 `^0.1.7-rc.1` / `>=0.1.7-rc.1` / `~0.1.7-rc.1` 取出版本号；其它形式返回 undefined。 */
function floorOf(range) {
  const match = /^(?:\^|~|>=)\s*(\S+)$/.exec(range.trim())
  return match === null ? undefined : match[1]
}

/** `--app-boot` 指向一份 `@deepseek-ai/dsh-app-boot` 包目录时做真判定器核对。 */
const argv = process.argv.slice(2)
const appBootIndex = argv.indexOf('--app-boot')
const appBootDir = appBootIndex === -1 ? undefined : argv[appBootIndex + 1]

/** 新插件模板也必须合规，否则每个新包都带着同一个缺口出厂。 */
const TEMPLATE = 'templates/hello/package.json'

function readJson(rel) {
  return JSON.parse(readFileSync(join(root, rel), 'utf8'))
}

const problems = []
const ranges = new Map()

/** 校验一个「可挂载插件」包的 peer 声明。 */
function checkPlugin(rel, name) {
  let pkg
  try {
    pkg = readJson(rel)
  } catch (err) {
    problems.push({ name, rel, kind: '读取失败', detail: err.message })
    return undefined
  }
  if (pkg.dsh?.bundle?.patch === undefined) return undefined
  if (pkg.dsh?.manifestVersion !== 1) {
    problems.push({
      name,
      rel,
      kind: '缺少 dsh.manifestVersion',
      detail: '公开 manifest 格式版本应显式声明为 1',
    })
  }
  // 市场展示位：必须存在，且下限与 peer 一致（两条一起升 cohort，别各自漂移）。
  const enginesDsh = pkg.dsh?.engines?.dsh
  if (enginesDsh === undefined) {
    problems.push({
      name,
      rel,
      kind: '缺少 dsh.engines.dsh',
      detail: `市场侧兼容性展示读它；应为 ${JSON.stringify(EXPECTED_ENGINES)}`,
    })
  } else if (floorOf(enginesDsh) !== DSH_COHORT) {
    problems.push({
      name,
      rel,
      kind: 'dsh.engines.dsh 与 cohort 不一致',
      detail: `${JSON.stringify(enginesDsh)} —— 应为 ${JSON.stringify(EXPECTED_ENGINES)}`,
    })
  }
  // 顶层 engines.dsh 是插件管理器兼容读取的旧备用位，统一写进 dsh.engines.dsh。
  if (pkg.engines?.dsh !== undefined) {
    problems.push({
      name,
      rel,
      kind: '顶层 engines.dsh 残留',
      detail: `${JSON.stringify(pkg.engines.dsh)} —— 统一写进 dsh.engines.dsh，删掉顶层这个备用位`,
    })
  }
  const peers = pkg.peerDependencies ?? {}
  const dshPeers = Object.entries(peers).filter(
    ([key]) => key === '@deepseek-ai/dsh' || key.startsWith('@deepseek-ai/dsh-'),
  )
  if (!Object.hasOwn(peers, '@deepseek-ai/dsh')) {
    problems.push({
      name,
      rel,
      kind: '缺少 @deepseek-ai/dsh peer',
      detail: 'DSH 只在声明了 peer 时才施加版本约束；不声明等于把兼容性留成「未知」',
    })
  }
  for (const [key, range] of dshPeers) {
    if (floorOf(range) !== DSH_COHORT) {
      problems.push({
        name,
        rel,
        kind: 'peer 范围与本仓 cohort 不一致',
        detail: `${key}: ${JSON.stringify(range)} —— 下限应为 ${DSH_COHORT}（推荐 ${JSON.stringify(EXPECTED_RANGE)}）`,
      })
    } else {
      ranges.set(name, EXPECTED_RANGE)
    }
  }
  return EXPECTED_RANGE
}

for (const [dir, name] of targets) {
  const rel = dir === '.' ? 'package.json' : `${dir}/package.json`
  checkPlugin(rel, name)
}

// 模板不在发布清单里，单独查
checkPlugin(TEMPLATE, '@hyzyn/dsh-hello（模板）')

if (problems.length > 0) {
  console.error(`✘ dsh peer 兼容性检查未通过：${String(problems.length)} 处问题\n`)
  for (const p of problems) {
    console.error(`  ${p.name}  (${p.rel})`)
    console.error(`    ${p.kind}：${p.detail}`)
  }
  console.error(
    '\n修复：在可安装插件的 package.json 里写\n' +
      '  "dsh": {\n' +
      `    "manifestVersion": 1,\n` +
      '    "bundle": { "patch": "./cordis.patch.yml" },\n' +
      `    "engines": { "dsh": "${EXPECTED_ENGINES}" }\n` +
      '  },\n' +
      '  "peerDependencies": {\n' +
      `    "@deepseek-ai/dsh": "${EXPECTED_RANGE}"\n` +
      '  },\n' +
      '  "peerDependenciesMeta": {\n' +
      '    "@deepseek-ai/dsh": { "optional": true }\n' +
      '  }\n' +
      '（optional 只影响 pnpm 的 unmet-peer 噪音；DSH 判定器不看它，照旧强制。）\n' +
      'dsh.engines.dsh 是市场展示位，rc.1 宿主不读它；两边下限必须一致。\n' +
      '下限跟随当前适配的 DSH cohort，cohort 升级时同步提升全部包与脚本里的 DSH_COHORT。\n',
  )
  process.exit(1)
}

console.log(`✔ dsh peer 兼容性检查通过：${String(ranges.size)} 个可安装插件的 DSH peer 都钉在 ${EXPECTED_RANGE}`)

if (appBootDir !== undefined) {
  const entry = join(resolve(appBootDir), 'lib', 'index.js')
  const { evaluatePluginCompatibility } = await import(pathToFileURL(entry).href)
  const incompatible = []
  for (const [dir, name] of targets) {
    const rel = dir === '.' ? 'package.json' : `${dir}/package.json`
    const pkg = readJson(rel)
    if (pkg.dsh?.bundle?.patch === undefined) continue
    const issue = evaluatePluginCompatibility(pkg, {}, DSH_COHORT)
    if (issue !== undefined) incompatible.push({ name, issue })
  }
  const tpl = readJson(TEMPLATE)
  const tplIssue = evaluatePluginCompatibility(tpl, {}, DSH_COHORT)
  if (tplIssue !== undefined) incompatible.push({ name: '@hyzyn/dsh-hello（模板）', issue: tplIssue })
  if (incompatible.length > 0) {
    console.error(`✘ DSH 判定器核对未通过：${String(incompatible.length)} 个包不兼容 ${DSH_COHORT}`)
    for (const { name, issue } of incompatible) console.error(`  ${name}: peers=${JSON.stringify(issue.peers)}`)
    process.exit(1)
  }
  console.log(`✔ DSH ${DSH_COHORT} 官方判定器核对通过：全部可安装包无 incompatible peer`)
}
