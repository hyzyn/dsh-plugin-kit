/**
 * 工具链钉子守卫（`pnpm toolchain:check`）：**两处版本声明必须自洽**。
 *
 * 两组判据是同一形状——「A 处声明的版本必须与 B 处一致」，而两处的脱节都**不会报错**。
 * 2026-10-04 逐条实测过脱节的后果，见下。
 *
 * ## 判据组 1：vitest 与 @vitest/coverage-v8 必须同版
 *
 * **症状（实测反证）**：把 `@vitest/coverage-v8` 从 `3.2.7` 改成 `3.2.0`、
 * `vitest` 从 `^3.2.7` 改成 `^3.9.9` 之后：
 *
 *     pnpm install        → 装成功（pnpm 10 默认不拦 peer 冲突，本仓 .npmrc 也没开
 *                            strict-peer-dependencies）
 *     dsh-peers:check     → 绿
 *     kit-pins:check      → 绿
 *     package-contents    → 绿
 *     artifacts:check     → 绿
 *     coverage:check      → 用 3.2.0 跑完、绿、报告数字正常
 *
 * 而 `@vitest/coverage-v8` 的 peer 是**精确** `vitest: "3.2.7"`，且**它源码里没有任何版本自检**
 * （grep 过 `dist/`：没有 version mismatch 之类的判定）。所以这是「覆盖率闸门被换了个引擎，
 * 而报告长得一模一样」——正是本仓反复在防的**绿条里的假成功**。
 *
 * **判据**：
 *   a. **实装版本必须相等**——`node_modules/vitest` 与 `node_modules/@vitest/coverage-v8`
 *      的 `version` 必须逐字相同。这条是**自维护**的：不写死 `3.2.7`，升版时自动跟随。
 *      （vitest 官方全家桶按 lockstep 发布，coverage 的 peer 也因此写成精确版本。）
 *   b. **coverage-v8 的 peer 必须被实装的 vitest 满足**——它自己声明的那条 peer 就是
 *      「什么版本配得上我」的权威说法；peer 是精确值时直接比字符串，是范围时**只做相等
 *      兜底**（见 `peerIsExact`：范围形态下本脚本不假装会做 semver 判定，见「刻意不做」）。
 *   c. **coverage-v8 的声明必须是精确版本**——写 `^3.2.7` 就等于允许解析出与 vitest 不同的
 *      那一份，判据 a 只在**安装后**才拦得住，声明期就该拦住（与 `check-kit-pins.mjs`
 *      的「必须精确」同一条理由：范围会让两个消费者解析到不同版本）。
 *
 * ## 判据组 2：workflow 里装的 dsh CLI 必须是受支持的 cohort
 *
 * **症状（实测反证）**：把 `ci.yml` 里的 `npm install -g @deepseek-ai/dsh@0.2.1-alpha.1`
 * 改成 `@0.1.6-alpha.2`（真实存在、但**不在** cohort 列表里）之后：
 *
 *     dsh-peers:check → 绿
 *     kit-pins:check  → 绿
 *
 * `DSH_COHORTS`（`check-dsh-peers.mjs`）是全仓 cohort 的唯一真源，但**没有任何闸门校验
 * `.github/workflows/*.yml` 里那两处安装 pin**。
 *
 * 诚实说：这条漂移**不会假绿**——`live-host-smoke --bootstrap` 会自证失败并把原因打出来
 * （ci.yml 该 step 的注释写了）。但**症状指向错的地方**：你会以为挂载车道坏了，而不是
 * 「pin 漂了」。闸门的价值在这里是**缩短定位路径**，不是「补一个假成功」。
 *
 * **判据**：
 *   a. **pin 必须出现在 peer 范围声明的 cohort 列表里**——pin 到列表外的版本，等于用
 *      「我们不声称支持的宿主」去验收；
 *   b. **pin 必须是最新 cohort**——peer 范围里声明了 4 档，而挂载车道只装其中一档。
 *      若 pin 落后于最新档，那么**最新那一档从来没被任何车道验过**（挂载车道是唯一会
 *      真的加载 `client.js` 的车道），而我们在 peer 里声称支持它。允许临时下调，但必须
 *      写进 `ALLOWED_OLDER_PINS` 并说明理由。
 *   c. **命中不是 0**——一个 pin 都没抓到说明正则与 workflow 写法脱节（恒绿闸门比没有更坏）。
 *
 * ## 数据源：为什么从**根 package.json 的 peer 范围**拆 cohort，而不是 import DSH_COHORTS
 *
 * `DSH_COHORTS` 在 `scripts/check-dsh-peers.mjs` 里，而那个文件是**纯 CLI**
 * （顶层直接跑 `for` 循环与 `process.exit`，没有 `import.meta.url` 守卫），import 它会当场执行。
 * 把它改成可 import 要动一个正在工作的闸门，收益不抵风险。
 *
 * 而根 `package.json` 的 peer 范围**就是** `DSH_COHORTS` 的权威投影：
 * `check-dsh-peers.mjs` 的 `EXPECTED_RANGE` 正是拿 `DSH_COHORTS` 拼出来的，且它会断言每个
 * 包的 peer 逐字等于那个范围。所以「从根 peer 范围拆」与「读 DSH_COHORTS」在**闸门绿的时候**
 * 恒等；一旦两者漂了，先红的是 `dsh-peers:check`。这条耦合写在测试里钉住。
 *
 * ## 刻意不做
 *
 *   - **不引 semver**：根上解析不到（pnpm 严格布局，实测 `require.resolve('semver')` 报
 *     MODULE_NOT_FOUND），而本仓对**预发布版本**的范围匹配恰好是最容易出错的地方
 *     （见 `check-dsh-peers.mjs` 文件头：`^0.1.7-rc.2` 展开后 `0.2.0-rc.1` 落在范围外，
 *     连 `includePrerelease` 都救不回来）。所以这里**只做精确比较**，不做范围求解——
 *     需要范围判定的地方（peer 是范围形态时）宁可报「无法静态判定」也不假装判过。
 *   - **不扫文档**：`docs/conventions.md` 里那个 `@<pin>` 是占位符、
 *     `scripts/windows/README.md` 里的 `@next` 是给人工操作写的（它旁边就注明了
 *     「@latest 会装到 0.1.5-rc.3」）。闸门只扫**会真的执行安装**的 workflow。
 *
 * 不写 shebang：本文件要被 `scripts/test/toolchain-pins.test.ts` import。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 要扫描的 workflow 目录（相对仓库根）。 */
export const WORKFLOWS_DIR = '.github/workflows'

/** 精确版本（`3.2.7` / `0.2.1-alpha.1` 合格；`^3.2.7` / `~3.2.7` / `latest` 不合格）。 */
export const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?$/

/** dsh CLI 安装形态：`npm install -g @deepseek-ai/dsh@<version>`。 */
const DSH_INSTALL_RE = /npm\s+install\s+-g\s+@deepseek-ai\/dsh@([^\s"'`]+)/g

/**
 * match 所在行是否是注释行（YAML `#` 或 run: | 块里的 `#` 行）。
 *
 * **必须排除**：本闸门自己的 step 注释里就写着 `` `npm install -g @deepseek-ai/dsh@<pin>` ``
 * 作为示例，而 `<pin>` 不是版本号。第一版没排除注释，于是**闸门第一次跑就报了自己写的注释**
 * （2026-10-04 实测）。`scripts/ci-script-truth.mjs` 的 `isCommentLine` 是同一条教训的
 * 另一处实现（那边抓 `pnpm <条目>` 时也踩过）。
 */
function isCommentLine(text, index) {
  const lineStart = text.lastIndexOf('\n', index) + 1
  return text.slice(lineStart, index).trimStart().startsWith('#')
}

/**
 * 允许「pin 落后于最新 cohort」的显式豁免（目前为空）。
 *
 * 需要时每条写 `{ file, version, why }`：`why` 要说清为什么暂时不能跟到最新档
 * （例如最新档的 CLI 还没发出来）。豁免**不检查文件是否仍存在**——与
 * `check-test-collection.mjs` 的白名单不同，这里的条目指向的是「某个文件里的某个版本」，
 * 而不是一个独立文件；一旦 pin 跟上了，这条豁免会因为不再匹配而失效，但它本身不会腐烂成
 * 「悄悄豁免了别的版本」（匹配条件是 file + version 两个都相等）。
 */
export const ALLOWED_OLDER_PINS = []

/**
 * 从 peer 范围拆出 cohort 列表（纯函数）。
 *
 * 只接受本仓的唯一合法写法：逐 cohort 的 `^<version>` 用 `||` 连起来
 * （见 `check-dsh-peers.mjs` 的 `EXPECTED_RANGE`）。遇到别的形态返回 `undefined`
 * ——**不猜**，让调用方报「形态不认识」，而不是拆出一个空列表然后恒绿。
 *
 * @param range - peer 范围字符串
 * @returns `string[]`（旧 → 新，与声明顺序一致）；形态不认识时 `undefined`
 */
export function parseCohorts(range) {
  if (typeof range !== 'string' || range.trim() === '') return undefined
  const parts = range.split('||').map((part) => part.trim())
  const cohorts = []
  for (const part of parts) {
    const match = /^\^(\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?)$/.exec(part)
    if (match === null) return undefined
    cohorts.push(match[1])
  }
  return cohorts.length > 0 ? cohorts : undefined
}

/**
 * 判据组 1（纯判定）：vitest 与 coverage-v8 的版本配对。
 *
 * @param input - `{ installedVitest, installedCoverage, declaredCoverage, coveragePeerVitest }`
 *   - `installedVitest` / `installedCoverage`：`node_modules` 里实装的 `version`（未装则 `undefined`）
 *   - `declaredCoverage`：根 `package.json` 里 `@vitest/coverage-v8` 的声明值
 *   - `coveragePeerVitest`：coverage-v8 **自己**声明的 `peerDependencies.vitest`
 * @returns `string[]` 违规描述；空数组 = 绿
 */
export function checkVitestPairing({ installedVitest, installedCoverage, declaredCoverage, coveragePeerVitest }) {
  const violations = []

  if (installedVitest === undefined || installedCoverage === undefined) {
    const missing = [
      installedVitest === undefined ? 'vitest' : undefined,
      installedCoverage === undefined ? '@vitest/coverage-v8' : undefined,
    ].filter(Boolean)
    // 装不上就无从判定配对——这条必须报，否则「没装」会伪装成「配对正确」
    violations.push(`node_modules 里找不到 ${missing.join(' / ')}：无法判定配对（先 pnpm install）`)
    return violations
  }

  // a. 实装版本必须逐字相同（自维护：不写死版本号）
  if (installedVitest !== installedCoverage) {
    violations.push(
      `实装版本不同：vitest ${installedVitest} vs @vitest/coverage-v8 ${installedCoverage}。` +
        `vitest 官方全家桶按 lockstep 发布，coverage-v8 的 peer 写的是精确版本——` +
        `不同版就是「覆盖率引擎与测试引擎不配套」，而它**照样能跑出正常数字**（本仓实测过）`,
    )
  }

  // b. coverage-v8 自己声明的 peer 必须被实装的 vitest 满足
  if (coveragePeerVitest !== undefined) {
    if (EXACT_VERSION.test(coveragePeerVitest)) {
      if (coveragePeerVitest !== installedVitest) {
        violations.push(
          `@vitest/coverage-v8 声明的 peer \`vitest@${coveragePeerVitest}\` 与实际装的 ` +
            `vitest ${installedVitest} 不符：这一份 coverage-v8 不是给这个 vitest 用的`,
        )
      }
    } else if (coveragePeerVitest !== installedVitest) {
      /*
       * peer 是范围形态（例如将来 vitest 改成 `^3.2.7`）：**不假装会做范围求解**。
       * 只做相等兜底——范围能匹配时这里不会误报，匹配不上时也不会漏报，代价是
       * 范围形态下判据 b 基本退化成判据 a。要更强的判定得引 semver，而本仓对预发布
       * 范围的处理恰好是最容易出错的地方（见文件头「刻意不做」）。
       */
      violations.push(
        `@vitest/coverage-v8 的 peer \`vitest@${coveragePeerVitest}\` 是范围形态，` +
          `本脚本不做范围求解，只能确认它不等于实装的 ${installedVitest}——` +
          `请人工核对（范围判定的坑见 check-dsh-peers.mjs 文件头）`,
      )
    }
  }

  // c. 声明必须是精确版本（范围会让 coverage-v8 解析到与 vitest 不同的那一份）
  if (declaredCoverage !== undefined && !EXACT_VERSION.test(declaredCoverage)) {
    violations.push(
      `根 package.json 里 @vitest/coverage-v8 声明为 ${JSON.stringify(declaredCoverage)}——必须是精确版本。` +
        `写成范围就等于允许它解析出与 vitest 不同的一份（判据 a 只在安装后才拦得住，声明期就该拦住）`,
    )
  }

  return violations
}

/**
 * 判据组 2（纯判定）：workflow 里装的 dsh CLI 必须是受支持的 cohort，且不落后于最新档。
 *
 * @param input - `{ cohorts, pins, allowed }`
 *   - `cohorts`：peer 范围声明的 cohort 列表（旧 → 新）
 *   - `pins`：`{ file, version }[]`——从 workflow 里抓到的安装 pin
 *   - `allowed`：`{ file, version, why }[]`——允许落后的显式豁免
 * @returns `string[]` 违规描述；空数组 = 绿
 */
export function checkDshPins({ cohorts, pins, allowed = [] }) {
  const violations = []
  const known = new Set(cohorts)
  const newest = cohorts[cohorts.length - 1]
  const allowedKeys = new Set(allowed.map((entry) => `${entry.file}@${entry.version}`))

  for (const pin of pins) {
    if (!known.has(pin.version)) {
      violations.push(
        `${pin.file} 装的是 @deepseek-ai/dsh@${pin.version}，但它不在 peer 声明的 cohort 列表里` +
          `（${cohorts.join(' / ')}）：等于用「我们不声称支持的宿主」去验收。` +
          `挂载车道会自证失败，但症状指向「车道坏了」而不是「pin 漂了」`,
      )
      continue
    }
    if (pin.version === newest) continue
    if (allowedKeys.has(`${pin.file}@${pin.version}`)) continue
    violations.push(
      `${pin.file} 装的是 @deepseek-ai/dsh@${pin.version}，落后于最新 cohort ${newest}：` +
        `peer 里声称支持最新档，而挂载车道（唯一会真的加载 client.js 的车道）只装了这一档` +
        `——最新那一档从来没被任何车道验过。要临时下调就写进 ALLOWED_OLDER_PINS 并说明理由`,
    )
  }

  return violations
}

/** 读 `node_modules/<name>/package.json` 的 `version`；没装返回 `undefined`。 */
function installedVersion(root, name) {
  try {
    return JSON.parse(readFileSync(join(root, 'node_modules', name, 'package.json'), 'utf8')).version
  } catch {
    return undefined
  }
}

/** 读真实仓库里判据组 1 的输入。 */
export function readVitestPairingInputs(root = REPO_ROOT) {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  let coveragePeerVitest
  try {
    const coverage = JSON.parse(readFileSync(join(root, 'node_modules', '@vitest', 'coverage-v8', 'package.json'), 'utf8'))
    coveragePeerVitest = coverage.peerDependencies?.vitest
  } catch {
    coveragePeerVitest = undefined
  }
  return {
    installedVitest: installedVersion(root, 'vitest'),
    installedCoverage: installedVersion(root, '@vitest/coverage-v8'),
    declaredCoverage: manifest.devDependencies?.['@vitest/coverage-v8'],
    coveragePeerVitest,
  }
}

/** 读真实仓库里判据组 2 的输入：扫全部 workflow 里的 dsh CLI 安装 pin。 */
export function readDshPinInputs(root = REPO_ROOT) {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const cohorts = parseCohorts(manifest.peerDependencies?.['@deepseek-ai/dsh'])
  const dir = join(root, WORKFLOWS_DIR)
  const pins = []
  for (const name of readdirSync(dir).filter((n) => /\.ya?ml$/.test(n)).sort()) {
    const text = readFileSync(join(dir, name), 'utf8').replace(/\r\n/g, '\n')
    for (const match of text.matchAll(DSH_INSTALL_RE)) {
      // 注释里的示例（本闸门自己的 step 注释就有一条 `…dsh@<pin>`）不算安装 pin
      if (isCommentLine(text, match.index)) continue
      pins.push({ file: `${WORKFLOWS_DIR}/${name}`, version: match[1] })
    }
  }
  return { cohorts, pins, allowed: ALLOWED_OLDER_PINS }
}

/** 自检：把判据钉死在夹具上（CI 跑，防止闸门自己被改坏）。 */
function selfTest() {
  const good = { installedVitest: '3.2.7', installedCoverage: '3.2.7', declaredCoverage: '3.2.7', coveragePeerVitest: '3.2.7' }
  const cohorts = ['0.1.7-rc.2', '0.2.0-rc.1', '0.2.0-rc.2', '0.2.1-alpha.1']

  const pairingCases = [
    ['配对正确', good, []],
    ['实装版本不同（本仓实测过的那个洞）', { ...good, installedCoverage: '3.2.0', coveragePeerVitest: '3.2.0' }, ['实装版本不同']],
    ['coverage 的精确 peer 与实际 vitest 不符', { ...good, coveragePeerVitest: '3.2.0' }, ['peer']],
    ['声明写成范围', { ...good, declaredCoverage: '^3.2.7' }, ['必须是精确版本']],
    ['vitest 没装', { ...good, installedVitest: undefined }, ['找不到']],
    ['coverage 没装', { ...good, installedCoverage: undefined }, ['找不到']],
    ['peer 是范围形态 → 报「不做范围求解」', { ...good, coveragePeerVitest: '^3.2.7' }, ['范围形态']],
  ]

  const pinCases = [
    ['pin 就是最新档', { cohorts, pins: [{ file: 'a.yml', version: '0.2.1-alpha.1' }] }, []],
    ['pin 不在 cohort 列表里（实测过的那个洞）', { cohorts, pins: [{ file: 'a.yml', version: '0.1.6-alpha.2' }] }, ['不在 peer 声明的 cohort 列表里']],
    ['pin 落后于最新档', { cohorts, pins: [{ file: 'a.yml', version: '0.2.0-rc.2' }] }, ['落后于最新 cohort']],
    [
      '落后但已豁免',
      { cohorts, pins: [{ file: 'a.yml', version: '0.2.0-rc.2' }], allowed: [{ file: 'a.yml', version: '0.2.0-rc.2', why: '最新档 CLI 还没发出来' }] },
      [],
    ],
    [
      '豁免只对同一个 file+version 生效（别的文件同版本仍报）',
      { cohorts, pins: [{ file: 'b.yml', version: '0.2.0-rc.2' }], allowed: [{ file: 'a.yml', version: '0.2.0-rc.2', why: 'x' }] },
      ['落后于最新 cohort'],
    ],
  ]

  const cohortCases = [
    ['标准形态', '^0.1.7-rc.2 || ^0.2.0-rc.1 || ^0.2.0-rc.2 || ^0.2.1-alpha.1', ['0.1.7-rc.2', '0.2.0-rc.1', '0.2.0-rc.2', '0.2.1-alpha.1']],
    ['单 cohort', '^0.1.7-rc.2', ['0.1.7-rc.2']],
    ['无空格', '^0.1.7-rc.2||^0.2.0-rc.1', ['0.1.7-rc.2', '0.2.0-rc.1']],
    ['形态不认识（范围而非逐 cohort）', '>=0.1.7-rc.2 <0.3.0', undefined],
    ['形态不认识（含 ~）', '~0.1.7-rc.2', undefined],
    ['空串', '', undefined],
  ]

  let failed = 0
  const report = (label, want, got) => {
    failed += 1
    console.error(`  ✘ ${label}：期望 ${JSON.stringify(want)}，实得 ${JSON.stringify(got)}`)
  }

  for (const [label, input, expected] of pairingCases) {
    const got = checkVitestPairing(input)
    for (const want of expected) if (!got.some((v) => v.includes(want))) report(label, want, got)
    if (expected.length === 0 && got.length > 0) report(label, [], got)
  }
  for (const [label, input, expected] of pinCases) {
    const got = checkDshPins(input)
    for (const want of expected) if (!got.some((v) => v.includes(want))) report(label, want, got)
    if (expected.length === 0 && got.length > 0) report(label, [], got)
  }
  for (const [label, range, expected] of cohortCases) {
    const got = parseCohorts(range)
    if (JSON.stringify(got) !== JSON.stringify(expected)) report(label, expected, got)
  }

  const total = pairingCases.length + pinCases.length + cohortCases.length
  if (failed > 0) {
    console.error(`✘ [check-toolchain-pins] 自检失败 ${String(failed)} 项`)
    process.exit(1)
  }
  console.log(`✓ [check-toolchain-pins] 自检通过（${String(total)} 组夹具）`)
  process.exit(0)
}

/* CLI（人工核对用；测试走各 check* 与 parseCohorts 纯函数） */
if (process.argv.includes('--self-test')) selfTest()

if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  const pairing = readVitestPairingInputs()
  const dsh = readDshPinInputs()
  const violations = [
    ...checkVitestPairing(pairing).map((v) => `[vitest 配对] ${v}`),
    ...checkDshPins(dsh).map((v) => `[dsh CLI pin] ${v}`),
  ]

  console.log(
    `[check-toolchain-pins] vitest ${String(pairing.installedVitest)} / coverage-v8 ` +
      `${String(pairing.installedCoverage)}（peer ${String(pairing.coveragePeerVitest)}）；` +
      `dsh pin ${String(dsh.pins.length)} 处，cohort ${String(dsh.cohorts?.length ?? 0)} 档`,
  )

  // 判据 c：命中不是 0——一个 pin 都没抓到说明正则与 workflow 写法脱节（恒绿闸门比没有更坏）
  if (dsh.pins.length === 0) {
    console.error(
      '[check-toolchain-pins] 未通过：一个 dsh CLI 安装 pin 都没抓到，闸门恒绿——' +
        '先确认 .github/workflows/ 里还有 `npm install -g @deepseek-ai/dsh@<版本>` 这种写法',
    )
    process.exit(1)
  }
  if (dsh.cohorts === undefined) {
    console.error(
      '[check-toolchain-pins] 未通过：根 package.json 的 @deepseek-ai/dsh peer 范围形态不认识，' +
        '拆不出 cohort 列表（本仓只支持「逐 cohort 的 ^ 范围用 || 连起来」，见 check-dsh-peers.mjs）',
    )
    process.exit(1)
  }

  for (const violation of violations) console.error(`  ✘ ${violation}`)
  if (violations.length > 0) {
    console.error(`[check-toolchain-pins] 未通过：${String(violations.length)} 处`)
    console.error('两处脱节都不会报错：coverage 换引擎照样出正常数字，dsh pin 漂了只在挂载车道暴露。')
    process.exit(1)
  }
  console.log('[check-toolchain-pins] 通过：vitest 配对正确，dsh CLI pin 都在最新 cohort 上')
}
