#!/usr/bin/env node
/**
 * `DSH_HOME` 卫生闸（`pnpm dsh-home:check`），两条判据：
 *
 * ## 判据 1：推导只允许有一份（codegraph CG35 / kit D04）
 *
 * `DSH_HOME` 的推导（含 `~` 展开与 resolve）在**整个仓库只允许有一份**，
 * 即 `@hyzyn/dsh-kit` 的 `dshHome()`（packages/kit/src/services.ts）。
 *
 * 为什么要有它：kit 0.4.1 给 `dshHome()` 加了归一化（`~` 展开 + resolve，与 DSH
 * 运行时 loader 同口径），而全仓还有 8 处插件各自手抄的 raw 副本——归一化只落在一处
 * 时，`DSH_HOME=~/x` 会让 codegraph 写 `<home>/x/cordis.patch.yml`、dsh-mcp 写
 * `~/x/cordis.patch.yml`：改动之前双方至少写同一个（错误的）路径，改动之后反而各写
 * 各的。2026-09 的修复波已把 8 处副本全部统一到 kit，本闸保证它不再回潮。
 *
 * 判据刻意只匹配「自己推导回退值」的形状（`DSH_HOME?.trim() || …`）——插件里直接
 * 读 `process.env.DSH_HOME` 做别的用途（注释、透传、展示）不受影响。
 *
 * ## 判据 2：跑完整套测试后，那份 home 必须还是空的（codegraph CG68）
 *
 * 把整套 `pnpm test` 的 `DSH_HOME` 指向一个**空的临时目录**跑一遍，跑完断言那个目录里
 * **一个文件都不许出现**。出现了就说明有用例真的往 home 写东西——它没隔离 `DSH_HOME`，
 * 而没设这个环境变量的开发者跑 `pnpm test` 时，写的就是他**真实**的 `~/.dsh/`。
 *
 * 为什么需要它（判据 1 挡不住这个）：`codegraph CG68` 那轮给踩到的用例补了文件级
 * `beforeAll` 隔离（`adoption.test.ts` 与同病的 `projects.test.ts` / `auto-reindex.test.ts`），
 * 但**没有任何东西保证下一个用例还记得补**——这道隔离全靠人肉记忆，漏掉时没有任何闸门会红。
 * 写用例的人看不见污染：它要等宿主下次启动才炸，而且炸在别人的机器上（`codegraph CG68`
 * 那条缺陷本身就是靠真机验收时「真实配置逐字节未变」的收尾对账报红才顺藤摸到的）。
 *
 * 为什么是**行为式**而不是文本式判据：实测（2026-10-17，本机）36 个「从包 `src` import 了
 * `apply`」的测试文件里，只有 15 个写了 `process.env.DSH_HOME =`，另外 21 个一个字都没出现——
 * 但把它们逐个放进空哨兵目录跑，**21 个全部写出 0 文件**（它们压根不碰 home）。
 * 于是「调用 `apply()` 就必须出现 `DSH_HOME` 字样」这条文本判据会一次造出 21 个假阳性，
 * 而那 21 条豁免会立刻腐烂。行为式判据反过来：用例从**任何**入口写 home（`apply()`、
 * `writeManagedEntries`、直接用 kit 的授权存储）都抓得到，且不需要豁免清单。
 *
 * 代价：多跑一整轮套件（`vitest run` 全量）。本机多次实测落在 25–41s（同一台机器、同一批
 * 用例，随 vitest 缓存冷热与机器负载波动；未逐一归因）。挂 CI 的 ubuntu 腿；
 * 只有**有用例真的写 home** 时才会红，绿的时候不改变任何判定面。
 *
 * ## `--self-test` 与测试入口
 *
 * 反例夹具在 `scripts/test/check-dsh-home.test.ts`（被 vitest 收集，`pnpm test` 与 CI 都跑），
 * 所以这里**不**接 `--self-test`：判据 2 要跑整轮套件，没法塞进 self-test 里自检。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** vitest 的真实 JS 入口（绕开 `.cmd` shim，同 `check-test-collection.mjs` 的教训）。 */
const VITEST_ENTRY = join(root, 'node_modules', 'vitest', 'vitest.mjs')

const RAW_DERIVATION = /DSH_HOME\?\.trim\(\)\s*\|\|/

/**
 * 判据 1：扫出绕过 kit 自己推导 `DSH_HOME` 的位置（kit 自身除外）。
 *
 * @param repoRoot - 仓库根
 * @returns `string[]` 违规位置（`packages/<pkg>/src/<file>:<行号>: <行内容>`）
 */
export function findRawDerivations(repoRoot = root) {
  const offenders = []
  for (const name of readdirSync(join(repoRoot, 'packages'))) {
    const srcDir = join(repoRoot, 'packages', name, 'src')
    try {
      if (!statSync(srcDir).isDirectory()) continue
    } catch {
      continue
    }
    if (name === 'kit') continue
    for (const file of readdirSync(srcDir)) {
      if (!/\.(ts|mts|cts|js|mjs)$/.test(file)) continue
      const text = readFileSync(join(srcDir, file), 'utf8')
      for (const [index, line] of text.split('\n').entries()) {
        if (RAW_DERIVATION.test(line)) offenders.push(`packages/${name}/src/${file}:${index + 1}: ${line.trim()}`)
      }
    }
  }
  return offenders
}

/**
 * 列出一个目录里的**所有文件**（递归，相对该目录）。目录不存在时返回空数组。
 *
 * 判据 2 用它回答的不是「配置变了吗」而是「凭空多出东西了吗」：哨兵目录开局是空的，
 * 所以任何出现在里面的文件都是某个用例写的——不需要预知会写哪些文件名，
 * 也不会因为宿主将来新增一个 home 下的落点而漏检。
 */
export function listFilesUnder(dir, base = dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    // `base` 一路传下去：相对路径要以**哨兵目录**为基准，不然 `tty/xxx` 会退化成 `xxx`，
    // 报错里就看不出是哪个落点被写了（判据 2 的消息全靠这个名字）。
    if (statSync(p).isDirectory()) out.push(...listFilesUnder(p, base))
    else out.push(relative(base, p))
  }
  return out
}

/**
 * 纯判定：哨兵 home 的观测结果 → 违规。
 *
 * 反例由 `scripts/test/check-dsh-home.test.ts` 用夹具造（不真跑套件）。
 *
 * @param input - `{ written, suiteFailed }`
 *   - `written`：跑完整轮套件后哨兵目录里出现的文件（相对哨兵目录）
 *   - `suiteFailed`：套件本身没跑完（非零退出）——此时「目录是空的」不代表通过
 * @returns `string[]` 违规描述
 */
export function evaluateHomeProbe({ written = [], suiteFailed = false }) {
  const violations = []
  if (suiteFailed) {
    violations.push(
      '套件没跑完（vitest 非零退出）：判据 2 无法评估——先看套件为什么失败，' +
        '不要把「哨兵目录恰好还是空的」当成通过（用例可能是在写出文件之前就挂了）',
    )
  }
  if (written.length > 0) {
    violations.push(
      `这轮测试往 DSH_HOME 指向的目录写出了 ${String(written.length)} 个文件：` +
        written.map((p) => `\`${p}\``).join('、') +
        '。有测试用例没隔离 `DSH_HOME`——没设该变量的开发者跑 `pnpm test` 时，写的是他**真实**的 ' +
        '`~/.dsh/`（真机上留下一份被测试改写的配置，且要等宿主下次启动才暴露）。' +
        '修法：照 `packages/codegraph/test/adoption.test.ts` 的文件级写法，在该测试文件 `beforeAll` ' +
        '里把 `process.env.DSH_HOME` 指到 `mkdtempSync` 的临时目录、`afterAll` 还原并删除（codegraph CG68）',
    )
  }
  return violations
}

/**
 * 判据 2 的执行侧：造空哨兵 home → 用它跑一整轮 `vitest run` → 看里面被写出了什么。
 *
 * @param repoRoot - 仓库根
 * @returns `{ written, suiteFailed, output }`
 */
export function runHomeProbe(repoRoot = root) {
  const home = mkdtempSync(join(tmpdir(), 'dsh-home-probe-'))
  let suiteFailed = false
  let output = ''
  let written = []
  try {
    // 刻意不继承外层 DSH_HOME：闸要测的就是「用例自己有没有兜住」，
    // 外层指哪都行，判据只看哨兵目录。
    output = execFileSync(process.execPath, [VITEST_ENTRY, 'run'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, DSH_HOME: home },
      maxBuffer: 256 * 1024 * 1024,
    })
  } catch (error) {
    suiteFailed = true
    output = [error.stdout, error.stderr].filter(Boolean).join('\n')
  } finally {
    // 观测**必须**发生在删目录之前：先 rm 再列，列到的是恒定的空数组，
    // 这道闸就变成「永远绿」——比没有闸门更坏。
    written = listFilesUnder(home)
    rmSync(home, { recursive: true, force: true })
  }
  return { written, suiteFailed, output }
}

/* CLI（人工与 CI 走这条；判据 1 的纯函数与判据 2 的夹具由 scripts/test/ 覆盖） */
if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  const offenders = findRawDerivations()
  if (offenders.length > 0) {
    console.error('[check-dsh-home] 发现绕过 kit 的 DSH_HOME 推导（应改用 `import { dshHome } from \'@hyzyn/dsh-kit\'`）：')
    for (const offender of offenders) console.error('  ' + offender)
    console.error('kit 的 dshHome() 带 ~ 展开 + resolve；各写各的副本会在 DSH_HOME 取 ~/x / 相对值时')
    console.error('让不同插件写/读不同的配置目录（codegraph DEFECTS CG35）。')
    process.exit(1)
  }
  console.log('[check-dsh-home] 判据 1 通过：DSH_HOME 推导只存在于 @hyzyn/dsh-kit')

  const { written, suiteFailed, output } = runHomeProbe()
  const violations = evaluateHomeProbe({ written, suiteFailed })
  if (violations.length > 0) {
    for (const violation of violations) console.error(`[check-dsh-home] 未通过（判据 2）：${violation}`)
    if (suiteFailed) console.error(output.split('\n').slice(-20).join('\n'))
    process.exit(1)
  }
  console.log('[check-dsh-home] 判据 2 通过：整轮测试跑完，哨兵 home 里一个文件都没出现')
}
