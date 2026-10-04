/**
 * 测试收集闸门（`pnpm test-collection:check`）：断言**磁盘上每个测试文件都真的会被 vitest 收集**。
 *
 * ## 为什么需要它（2026-10-04 实测出的洞）
 *
 * 本仓 `vitest.config.ts` 的 `include` 是**写死的两条 glob**：
 *
 *   - `packages/<pkg>/test/**\/*.test.ts`
 *   - `scripts/test/**\/*.test.ts`
 *
 * 于是「测试文件放错地方 / 扩展名写错」的后果是**静默**的：vitest 不收集它，
 * `pnpm test` 照旧全绿，其余十二道闸门也没有一道会红。实测反证（2026-10-04）：
 *
 *   把 `packages/tty/tests/zz-probe.spec.ts`（目录 `tests`、扩展名 `.spec.ts`）
 *   放进仓库，内容是一条必然失败的断言 `expect(1).toBe(999)`：
 *
 *     vitest 收集      → 0 个（`vitest list --filesOnly` 里没有它）
 *     pnpm test        → 113 passed / 1768 passed **全绿**
 *     十二道闸门        → **无一变红**
 *
 *   也就是说：**这个文件从未被执行过一次，而没有任何东西知道。**
 *
 * 这与本仓已记在案的两次事故是**同一形状**：
 *
 *   - **tty D61**：推导逻辑埋在 `client-src/index.js` 里 = 没有测试入口（见
 *     `vitest.config.ts` 文件头「打包后的 client.js 不在本层测」）；
 *   - **v0.1.20 的 dsh-docker 漏进 `publish-targets.mjs`**：workflow 全绿而 registry 上没有它
 *     （见 `check-publishable.mjs` 的覆盖度判据）。
 *
 * 三者的共同点：**「该有的东西找不到」不会报错**。本闸就是为这一层加的。
 *
 * ## 判据（都不许「匹配不到就算过」）
 *
 * 1. **磁盘上的测试文件必须全部被收集**：`git ls-files` 出「入库 + 未忽略的未入库」文件里，
 *    凡是测试命名形态的，减去 vitest 实际收集的，减去白名单 → **必须为空**；
 * 2. **收集结果不是 0**：一个文件都没收集到时报警（恒绿闸门比没有更坏，本仓真实发生过）；
 * 3. **白名单里的豁免仍然存在**：白名单条目指向的文件一旦被删/改名，这条豁免就该消失——
 *    否则它会在下一次误报时被当成「惯例」继续留着（白名单会腐烂）。
 *
 * ## 为什么用 `git ls-files` 而不是 `find`
 *
 * `find` 会扫进 `node_modules`、`.preview/`、各包的 `lib/`（`lib/` 是**入库的预构建产物**，
 * 见 `vitest.config.ts` 文件头），要么写一堆排除规则、要么把构建产物里的文件也算成「测试文件」。
 * `git ls-files --cached --others --exclude-standard` 正好就是**「git 眼里属于这棵树的文件」**
 * ——`--others` 让刚写好、还没 `git add` 的测试文件同样被抓住（那正是最容易漏掉的时刻）。
 *
 * ## 为什么盘面 glob 比 vitest 的 include **宽**
 *
 * 本闸要抓的是「写成了测试的样子、却没被收集」。所以盘面侧认全 `*.{test,spec}.{ts,tsx,js,jsx,
 * mjs,cjs,mts,cts}`（**含 `.spec.` 与 `.jsx` 等 vitest 默认认、而本仓 include 不认的形态**），
 * 而不是照抄 include——照抄的话「把 `.test.ts` 写成 `.spec.ts`」这个最常见的漏法就抓不到了。
 * 代价是**更宽的盘面会带来更多假阳性**，所以配了白名单（见下）。
 *
 * ## 白名单：为什么 `templates/hello/test/` 是**有意**不收集的
 *
 * `templates/hello/` 是 `create-plugin.mjs` 的脚手架模板：它被**复制**到 `packages/<name>/`
 * 之后才会被 `packages/*​/test/**` 这条 include 收到。模板自己待在 `templates/` 下，
 * **刻意不在收集范围内**（否则它会 import `../src/index.js` 而模板并没有装依赖，
 * 让 `pnpm test` 在仓库根直接炸）。这是设计，不是漏。
 *
 * ## 成本
 *
 * `vitest list --filesOnly` 实测 **0.32s**（本机三次 0.32 / 0.31 / 0.32），
 * 它只做收集、**不执行任何用例**。挂进 CI 的 ubuntu 腿可忽略。
 *
 * 不写 shebang：本文件要被 `scripts/test/check-test-collection.test.ts` import。
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** vitest 的真实 JS 入口（绕开 `.cmd` shim，见 `listCollectedTests` 的注释）。 */
const VITEST_ENTRY = join(REPO_ROOT, 'node_modules', 'vitest', 'vitest.mjs')

/**
 * 盘面侧认的测试命名形态——**比 `vitest.config.ts` 的 include 宽**（理由见文件头）。
 *
 * 刻意不写 `.*\.(test|spec)\..*` 这种更宽的正则：那会把 `client.test.helpers.ts` 这类
 * 「名字里恰好含 test」的非测试文件也算进来。只认**扩展名前紧邻 `.test` / `.spec`** 的形态。
 */
const TEST_FILE_RE = /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/

/**
 * 豁免清单：**有意**不被 vitest 收集的测试文件（相对仓库根，正斜杠）。
 *
 * 每一条都必须带理由，且判据 3 会断言这些文件**仍然存在**——白名单条目指向的文件被删掉后，
 * 这条豁免就该跟着消失，否则它会一直留着、把将来同位置的**真**漏检一起豁免掉。
 */
export const ALLOWED_UNCOLLECTED = [
  {
    path: 'templates/hello/test/hello.test.ts',
    why: 'create-plugin 的脚手架模板：复制到 packages/<name>/ 之后才被 include 收到；' +
      '模板自己待在 templates/ 下刻意不收集（否则它会 import 模板的 ../src/index.js 而模板没装依赖，仓库根 pnpm test 直接炸）',
  },
]

/**
 * 归一成仓库根相对路径、正斜杠形态（跨平台比较用）。
 *
 * vitest 在 Windows 上输出反斜杠、`git ls-files` 输出正斜杠，两侧不归一会**全量假阳性**。
 */
export function normalizeRepoPath(p, root = REPO_ROOT) {
  let out = String(p).trim().replace(/\\/g, '/')
  const abs = resolve(root).replace(/\\/g, '/')
  if (out.startsWith(`${abs}/`)) out = out.slice(abs.length + 1)
  return out.replace(/^\.\//, '')
}

/**
 * 纯判定：盘面 vs 收集结果。
 *
 * 反例由 `scripts/test/check-test-collection.test.ts` 用 fixture 造（不碰真实仓库）。
 *
 * @param input - `{ onDisk, collected, allowed, allowedExist }`
 *   - `onDisk`：git 眼里的全部测试命名文件（仓库根相对路径）
 *   - `collected`：vitest 实际收集到的文件（同形态）
 *   - `allowed`：豁免清单（`{ path, why }[]`）
 *   - `allowedExist`：`{ [path]: boolean }`——豁免文件在磁盘上是否还在（判据 3）
 * @returns `{ violations, uncollected, checked }`：违规描述、未收集的文件、盘面文件总数
 */
export function checkTestCollection({ onDisk, collected, allowed = [], allowedExist = {} }) {
  const violations = []
  const collectedSet = new Set(collected.map((p) => normalizeRepoPath(p)))
  const allowedSet = new Set(allowed.map((entry) => normalizeRepoPath(entry.path)))

  const uncollected = []
  for (const raw of onDisk) {
    const path = normalizeRepoPath(raw)
    if (collectedSet.has(path)) continue
    if (allowedSet.has(path)) continue
    uncollected.push(path)
  }

  for (const path of uncollected) {
    violations.push(
      `${path}：这个测试文件**不会被 vitest 收集**（\`pnpm test\` 里它一次都不会执行，而套件照旧全绿）。` +
        `两个原因之一：① 放在 include 覆盖不到的目录（只认 packages/<pkg>/test/ 与 scripts/test/）；` +
        `② 扩展名不是 .test.ts（include 只认这一种）。修法：挪到正确目录并改名，` +
        `或者（若是**有意**不收集的）加进 scripts/check-test-collection.mjs 的 ALLOWED_UNCOLLECTED 并写清理由`,
    )
  }

  // 判据 3：白名单不许腐烂——豁免的文件被删/改名后，这条豁免要跟着删
  for (const entry of allowed) {
    const path = normalizeRepoPath(entry.path)
    if (allowedExist[path] === true) continue
    violations.push(
      `ALLOWED_UNCOLLECTED 里的 \`${path}\` 在磁盘上不存在了：这条豁免该删掉——` +
        `白名单指向的文件消失后仍留着，会在将来同位置出现**真的**漏检时把它一起豁免掉（白名单会腐烂）`,
    )
  }

  return { violations, uncollected, checked: onDisk.length }
}

/**
 * 跑 `vitest list --filesOnly`，拿实际被收集的测试文件。
 *
 * ## 为什么用 `node <vitest 的 JS 入口>` 而不是 `npx vitest`
 *
 * 与 `flake-lane.mjs` / `check-package-contents.mjs` 同一条教训（2026-10-03 CI 实测）：
 * Windows 上 `npx` / `pnpm` 是 `.cmd`，`execFileSync` 不带 `shell` 时**拒跑批处理**
 * （`spawnSync pnpm ENOENT`）；而开 `shell: true` 又会让参数再过一遍命令行解析。
 * 直接跑 JS 入口两头都躲开。
 *
 * @returns `string[]` 仓库根相对路径
 */
export function listCollectedTests(root = REPO_ROOT) {
  const out = execFileSync(process.execPath, [VITEST_ENTRY, 'list', '--filesOnly'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  })
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => normalizeRepoPath(line, root))
}

/**
 * 读真实仓库：`git ls-files` 出盘面文件 + 跑一次 vitest 收集 + 检查白名单文件是否还在。
 *
 * `--others --exclude-standard` 让**刚写好、还没 `git add`** 的测试文件同样被看见
 * ——那正是最容易漏掉的时刻（本地写完还没提交时跑一遍，就该报出来）。
 */
export function readTestCollectionInputs(root = REPO_ROOT) {
  const listed = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  const onDisk = listed
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => TEST_FILE_RE.test(line))
  const allowedExist = {}
  for (const entry of ALLOWED_UNCOLLECTED) {
    allowedExist[normalizeRepoPath(entry.path, root)] = existsSync(join(root, entry.path))
  }
  return { onDisk, collected: listCollectedTests(root), allowed: ALLOWED_UNCOLLECTED, allowedExist }
}

/** 自检：把判据钉死在夹具上（CI 跑，防止闸门自己被改坏）。 */
function selfTest() {
  const cases = [
    [
      '全部被收集',
      { onDisk: ['packages/a/test/x.test.ts', 'scripts/test/y.test.ts'], collected: ['packages/a/test/x.test.ts', 'scripts/test/y.test.ts'] },
      [],
    ],
    [
      '放错目录（tests/ 而非 test/）',
      { onDisk: ['packages/a/tests/x.test.ts'], collected: [] },
      ['packages/a/tests/x.test.ts'],
    ],
    [
      '扩展名写成 .spec.ts',
      { onDisk: ['packages/a/test/x.spec.ts'], collected: [] },
      ['packages/a/test/x.spec.ts'],
    ],
    [
      '扩展名写成 .test.jsx',
      { onDisk: ['scripts/test/x.test.jsx'], collected: [] },
      ['scripts/test/x.test.jsx'],
    ],
    [
      '白名单里的豁免不报',
      { onDisk: ['templates/hello/test/hello.test.ts'], collected: [], allowed: [{ path: 'templates/hello/test/hello.test.ts', why: '模板' }], allowedExist: { 'templates/hello/test/hello.test.ts': true } },
      [],
    ],
    [
      '白名单文件没了要报（白名单腐烂）',
      { onDisk: [], collected: ['packages/a/test/x.test.ts'], allowed: [{ path: 'templates/gone.test.ts', why: '模板' }], allowedExist: { 'templates/gone.test.ts': false } },
      ['ALLOWED_UNCOLLECTED'],
    ],
    [
      'Windows 反斜杠与正斜杠等价',
      { onDisk: ['packages\\a\\test\\x.test.ts'], collected: ['packages/a/test/x.test.ts'] },
      [],
    ],
    [
      '盘面前缀 ./ 与绝对路径都能归一',
      {
        onDisk: ['./packages/a/test/x.test.ts', join(REPO_ROOT, 'scripts/test/y.test.ts')],
        collected: ['packages/a/test/x.test.ts', 'scripts/test/y.test.ts'],
      },
      [],
    ],
  ]
  let failed = 0
  for (const [label, input, expected] of cases) {
    const { violations } = checkTestCollection(input)
    const kinds = violations.map((v) => v.split('：')[0])
    for (const want of expected) {
      if (!kinds.some((k) => k.includes(want))) {
        failed += 1
        console.error(`  ✘ ${label}：期望报「${want}」，实得 ${kinds.join(' / ') || '（无差异）'}`)
      }
    }
    if (expected.length === 0 && violations.length > 0) {
      failed += 1
      console.error(`  ✘ ${label}：期望无差异，实得 ${violations.join(' / ')}`)
    }
  }
  if (failed > 0) {
    console.error(`✘ [check-test-collection] 自检失败 ${String(failed)} 项`)
    process.exit(1)
  }
  console.log(`✓ [check-test-collection] 自检通过（${String(cases.length)} 组夹具）`)
  process.exit(0)
}

/* CLI（人工核对用；测试走 checkTestCollection + 各纯函数） */
if (process.argv.includes('--self-test')) selfTest()

if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  const inputs = readTestCollectionInputs()
  const { violations, checked } = checkTestCollection(inputs)
  console.log(
    `[check-test-collection] 盘面 ${String(checked)} 个测试文件；vitest 收集 ${String(inputs.collected.length)} 个；` +
      `豁免 ${String(ALLOWED_UNCOLLECTED.length)} 个`,
  )
  // 判据 2：命中不是 0——一个都没收集到说明闸门没在工作（恒绿闸门比没有更坏）
  if (inputs.collected.length === 0) {
    console.error(
      '[check-test-collection] 未通过：vitest 一个测试文件都没收集到，闸门恒绿——' +
        '先确认 vitest.config.ts 的 include 与 node_modules/vitest/vitest.mjs 还在',
    )
    process.exit(1)
  }
  for (const violation of violations) console.error(`  ✘ ${violation}`)
  if (violations.length > 0) {
    console.error(`[check-test-collection] 未通过：${String(violations.length)} 处`)
    console.error('「写了测试但从不运行」是静默的：pnpm test 照旧全绿，其余闸门也没有一道会红。')
    process.exit(1)
  }
  console.log('[check-test-collection] 通过：磁盘上的测试文件全部会被 vitest 收集')
}
