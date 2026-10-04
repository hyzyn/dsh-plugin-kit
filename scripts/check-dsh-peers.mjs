#!/usr/bin/env node
/**
 * 防回归：可安装为 DSH 插件的包必须用 `peerDependencies` 声明与当前仓
 * cohort 列表一致的 DSH 兼容范围。
 *
 * 两个字段各管一件事，本脚本同时守：
 *  - **强制**：`peerDependencies` 里名为 `@deepseek-ai/dsh` 或以 `@deepseek-ai/dsh-`
 *    开头的项。DSH 在**安装前**（plugin-manager）与**启动时**（app-boot 的
 *    compatibility preflight）都用
 *    `semver.satisfies(runtimeVersion, range, { includePrerelease: true })` 判定；
 *    预发布参与范围匹配（这一点与 npm 默认语义不同）。范围必须**逐 cohort 写全**
 *    （`^<cohort>` 用 `||` 连起来）：只写一段就会把另一个仍在服役的 cohort 判死——
 *    0.2.0-rc.1 那轮就是这么暴露的（`^0.1.7-rc.2` 展开是 `>=0.1.7-rc.2 <0.2.0-0`，
 *    `0.2.0-rc.1` 差在 `-0` 上，连 `includePrerelease` 也救不回来）。
 *  - **展示**：`dsh.engines.dsh`。rc.1 的宿主代码里**没有任何读取方**（app-boot
 *    README 原文：这些检查使用 peer 声明，而不是 engines.dsh），但插件市场 / 社区
 *    条目那类外部消费方仍按它展示「兼容 / 不兼容」。保留它只为市场口径，值必须与
 *    peer 下限一致——否则就是一条与事实不符的声明，比不声明更糟。市场解析器只认
 *    单段 `>=X.Y.Z[-预发布]`，所以它写的是**最低档**，不跟随多段 peer。
 *  - 被拒的插件启动时整行 `disabled`（bundle 整体跳过），安装时抛
 *    `incompatible-version`；豁免要写进 profile 自己的 `compatibility.json`。
 *
 * 覆盖范围：`scripts/publish-targets.mjs` 里声明了 `dsh.bundle.patch` 的包
 * （= 能被 `dsh plugin` 挂载的插件，含 packages/all 与根 bundle）+ `templates/hello`
 * 模板 + `EXTRA_PLUGIN_DIRS` 里那些**私有、不发布但宿主可加载**的插件（目录不存在就跳过）。
 * 纯库包（如 `@hyzyn/dsh-kit`）不参与挂载，不加这些字段。
 *
 * 用法：
 *   node scripts/check-dsh-peers.mjs
 *   node scripts/check-dsh-peers.mjs --app-boot /path/to/@deepseek-ai/dsh-app-boot
 *     # 用 DSH 自己的判定器逐包 × 逐 cohort 核对（COHORTS 里每一档都要放行）
 *   node scripts/check-dsh-peers.mjs --with-app-boot
 *     # 同上，但**自动定位**那份判定器（`scripts/dsh-app-boot.mjs`：从 `which dsh` 的真身上溯，
 *     # 兜底 `npm root -g`）；定位不到就**报错退出**，不静默跳过。CI 用的是这条。
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { APP_BOOT_ENV_VAR, describeAppBootSearch, findAppBoot } from './dsh-app-boot.mjs'
import { targets } from './publish-targets.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * 本仓统一适配的 DSH cohort 列表，**旧 → 新**；新增/退役 cohort 时改这一处 + 各包 peer 范围。
 *
 * 每个可安装插件的 peer 必须**逐 cohort 覆盖**（`||` 连起来），宿主侧逐个判定，命中任一段
 * 即放行。相邻 cohort 的插件 API 面都逐文件比对过：
 *  - 0.2.0-rc.1 vs 0.1.7-rc.2：本仓 import 的 `dsh-tools` / `dsh-client-ui-slots` /
 *    `dsh-client-locale` / `dsh-host-webserver` / `dsh-subprocess-local` /
 *    `dsh-client-modules` / `dsh-package-manifest` 的 d.ts 逐字节相同；
 *  - 0.2.0-rc.2 vs 0.2.0-rc.1：本仓 import 的宿主包**零代码变化**（cli + web-app 的全部
 *    依赖包 166 个里只有 40 个有真实改动，与本仓相关的只有 `dsh-cordis-client-runner`
 *    的 slot 目录：97 → 98 条，**只增不减**，新增 `sidebar.right.tab.files.actions`，
 *    本仓注册的 4 个槽逐字节相同）。
 *  - 0.2.1-alpha.1 vs 0.2.0-rc.2：CLI 包 20 个文件里只有 package.json 变；本仓 import 的
 *    宿主包**零代码变化**；`dsh-tools` 只改 `run_code` 的参数顺序与文案、并删掉 `./invariant`
 *    子路径导出（本仓零引用，`index.d.ts` 逐字节相同），`evaluatePluginCompatibility` 语义
 *    等价；`dsh-cordis-client-runner` 的 slot 目录 98 → 100 条，**只增不减**
 *    （新增 `plugins.add.actions` / `shell.bottom`）。
 * `cordis` 4.0.4 与 `schemastery` 3.18.4 在前三档同版本；第四档的宿主带 4.0.5-alpha.1 与
 * 3.18.5-alpha.1，但两份 tarball 除 `package.json` 外**逐字节相同**，且 app-boot 用
 * `Symbol.for('schemastery')` 判定原生 schema（不是 `instanceof`），所以同一条范围同时声明
 * 多段是如实表述，而不是「先放宽再说」。
 */
const DSH_COHORTS = ['0.1.7-rc.2', '0.2.0-rc.1', '0.2.0-rc.2', '0.2.1-alpha.1']
/** 成熟下限：最低支持的 cohort，市场展示位与它一致，也是本仓历史文档里的基线。 */
const DSH_COHORT = DSH_COHORTS[0]
/**
 * 唯一支持的 peer 写法：逐 cohort 的 `^<cohort>` 用 `||` 连起来（预发布参与匹配，见文件头）。
 * 单 cohort 时就是 `^0.1.7-rc.2` 这种老写法，多 cohort 时是
 * `^0.1.7-rc.2 || ^0.2.0-rc.1 || ^0.2.0-rc.2 || ^0.2.1-alpha.1`。
 */
const EXPECTED_RANGE = DSH_COHORTS.map((cohort) => `^${cohort}`).join(' || ')
/**
 * 市场展示位的下限写法。市场解析器只认 `>=X.Y.Z[-预发布]` 一种形式，所以这里不能
 * 用 `^`，也不能写 `||`（多段式区间会判成「无法验证」而 fail-closed，见
 * scripts/windows/README.md）；下限必须是 DSH_COHORT——也就是 peer 覆盖的最低档。
 */
const EXPECTED_ENGINES = `>=${DSH_COHORT}`

/** 从 `^0.1.7-rc.2` / `>=0.1.7-rc.2` / `~0.1.7-rc.2` 取出版本号；其它形式返回 undefined。 */
function floorOf(range) {
  const match = /^(?:\^|~|>=)\s*(\S+)$/.exec(range.trim())
  return match === null ? undefined : match[1]
}

/**
 * `--app-boot <dir>` 指向一份 `@deepseek-ai/dsh-app-boot` 包目录时做真判定器核对。
 *
 * `--with-app-boot`（2026-10-04 加，CI 用这条）**自动定位**那份判定器：这条路径此前
 * 存在但**从没进 CI**——每次都要人手拼路径当参数传，于是退化成「靠人记得跑」。
 * 自动定位的实现与理由见 `scripts/dsh-app-boot.mjs`；定位不到时**报错退出**，
 * 不静默跳过（跳过它等于把 CI 的结论降级成「我自己写的规则说没问题」）。
 */
const argv = process.argv.slice(2)
const appBootIndex = argv.indexOf('--app-boot')
const appBootExplicit = appBootIndex === -1 ? undefined : argv[appBootIndex + 1]
const wantAppBoot = argv.includes('--with-app-boot') || appBootExplicit !== undefined

/**
 * 定位失败时统一报错退出。
 *
 * `source` 说明是**哪一路**没成：`explicit` / `env` 是「你点了名但那儿没有」——
 * 这种必须报错（否则会静默换成另一份判定器，把「我验的是哪个判定器」变成运气）；
 * `undefined` 是自动搜索都没命中——报出试过的路径。
 */
function failAppBoot(found) {
  const byUser = found.source === 'explicit' || found.source === 'env'
  const what = found.source === 'explicit' ? '--app-boot 指定的目录' : `$${APP_BOOT_ENV_VAR} 指定的目录`
  console.error(
    (byUser
      ? `✘ ${what}不是一份可用的 @deepseek-ai/dsh-app-boot（要同时有 package.json 与 lib/index.js）。\n`
      : '✘ 没找到 @deepseek-ai/dsh-app-boot（DSH 的官方兼容性判定器）。\n') +
      '试过这些路径：\n' +
      describeAppBootSearch(found.tried) +
      '\n修法：装一份 dsh（`npm install -g @deepseek-ai/dsh@<pin>`），' +
      '或用 DSH_APP_BOOT_DIR=<dir> / --app-boot <dir> 显式指定。\n' +
      '**不要改成静默跳过**：这条路径是「用宿主真正会跑的那段代码复核声明」，' +
      '跳过它等于把结论降级成「我自己写的规则说没问题」。',
  )
  process.exit(1)
}

let appBootDir = appBootExplicit
if (wantAppBoot) {
  const found = appBootExplicit === undefined ? findAppBoot() : findAppBoot({ explicit: appBootExplicit })
  if (found.dir === null) failAppBoot(found)
  appBootDir = found.dir
  // 报出**用的是哪一份**：自动定位之后，日志里必须能看出验的是哪个判定器，
  // 否则「定位到了另一份」也没人会发现（来源见 dsh-app-boot.mjs 的三级优先级）。
  console.log(`[check-dsh-peers] 判定器来源：${found.source} → ${found.dir}`)
}

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
    if (range.trim() !== EXPECTED_RANGE) {
      problems.push({
        name,
        rel,
        kind: 'peer 范围与本仓 cohort 不一致',
        detail: `${key}: ${JSON.stringify(range)} —— 应为 ${JSON.stringify(EXPECTED_RANGE)}（逐 cohort 的 ^ 范围用 || 连起来）`,
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

/**
 * 私有、不发布、但宿主**可加载**的插件：它们不在 `publish-targets.mjs` 里（那是发布清单，
 * 塞进去会去发布一个私有包），所以单独列在这里。目录不存在时跳过——`devfront` 目前只存在于
 * 开发套件分支上，main 上还没有它；一旦它随合并进来，peer 忘了跟齐这里就会红。
 */
const EXTRA_PLUGIN_DIRS = ['packages/devfront']

for (const dir of EXTRA_PLUGIN_DIRS) {
  if (!existsSync(join(root, dir, 'package.json'))) continue
  checkPlugin(`${dir}/package.json`, `${dir}（私有、不发布，但宿主可加载）`)
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
      'dsh.engines.dsh 是市场展示位，rc.1 宿主不读它；它写最低档，必须与 peer 覆盖的最低档一致。\n' +
      'peer 范围逐 cohort 写全（^<cohort> 用 || 连起来）；新增/退役 cohort 时同步改全部包与脚本里的 DSH_COHORTS。\n',
  )
  process.exit(1)
}

console.log(`✔ dsh peer 兼容性检查通过：${String(ranges.size)} 个可安装插件的 DSH peer 都钉在 ${EXPECTED_RANGE}`)

if (appBootDir !== undefined) {
  const entry = join(resolve(appBootDir), 'lib', 'index.js')
  const { evaluatePluginCompatibility, getDshRuntimeVersion } = await import(pathToFileURL(entry).href)
  /*
   * 报出**用的是哪一份判定器**：`--with-app-boot` 自动定位之后，日志里必须能看出
   * 「验的是哪个版本的官方判定器」——否则路径拼错了也不会有人发现（它会静默用另一份）。
   * `getDshRuntimeVersion()` 是判定器自己报的运行时版本，比读 package.json 更权威。
   */
  let evaluatorVersion = '(未知)'
  try {
    evaluatorVersion = getDshRuntimeVersion()
  } catch {
    /* 读不到就保持「未知」——不影响下面的核对 */
  }
  console.log(`[check-dsh-peers] 用官方判定器核对：${appBootDir}（自报运行时 ${evaluatorVersion}）`)
  // 逐个 cohort 都用 DSH 自己的判定器复核一遍：范围里写了几段，就得有几段真的放行。
  const incompatible = []
  for (const cohort of DSH_COHORTS) {
    for (const [dir, name] of targets) {
      const rel = dir === '.' ? 'package.json' : `${dir}/package.json`
      const pkg = readJson(rel)
      if (pkg.dsh?.bundle?.patch === undefined) continue
      const issue = evaluatePluginCompatibility(pkg, {}, cohort)
      if (issue !== undefined) incompatible.push({ name, cohort, issue })
    }
    const tpl = readJson(TEMPLATE)
    const tplIssue = evaluatePluginCompatibility(tpl, {}, cohort)
    if (tplIssue !== undefined) incompatible.push({ name: '@hyzyn/dsh-hello（模板）', cohort, issue: tplIssue })
  }
  if (incompatible.length > 0) {
    console.error(`✘ DSH 判定器核对未通过：${String(incompatible.length)} 处（包 × cohort）incompatible`)
    for (const { name, cohort, issue } of incompatible) {
      console.error(`  ${name} @ ${cohort}: peers=${JSON.stringify(issue.peers)}`)
    }
    process.exit(1)
  }
  console.log(`✔ DSH 官方判定器核对通过：全部可安装包在 ${DSH_COHORTS.join(' / ')} 上都没有 incompatible peer`)
}
