/**
 * CI ↔ 包内条目的一致性守卫（L0 待办第 6 项的**方案 B**）。
 *
 * ## 为什么有这一份
 *
 * 2026-10-01 之前，同一批 hermetic 脚本有**两个真相源**：workflow 里的**写死路径**
 * （现算 14 处：`ci.yml` 11 + `release.yml` 3）与包内 `package.json` 的**条目**（9 条）。
 * 后果是**改名只红一处**，另一处静默腐烂：
 *
 *   - 改脚本文件名 → workflow 红，而 `pnpm --filter … run <条目>` 那个**可粘贴入口**悄悄烂掉
 *     （CI 从不跑它，没人会红）；
 *   - 只改条目名 → workflow 全绿，只有手动跑的人受影响。
 *
 * **方案 A**（已执行，见 [docs/ci-scripts-plan.md](../docs/ci-scripts-plan.md)）把 workflow 改成调用
 * 包内条目，真相源收敛到 `package.json`。本模块是**方案 B**：让「收敛后的形态」不许再漂——
 * 它不改任何执行语义，只做静态断言：
 *
 *   1. **不许再出现写死路径**（`node packages/<pkg>/scripts/<file>.mjs`）——那正是 A 消灭的形态，
 *      一旦加回来，包内条目又开始腐烂；
 *   2. workflow 里每个 `pnpm --filter <包名> run <条目>` 都必须能解析：包名在 workspace 里、
 *      条目在该包 `package.json` 里存在（**条目改名忘改 workflow → 立刻红**）；
 *   3. 两个 workflow 引用**同一个**入口时，命令必须逐字一致（防某一侧被偷偷加参数 / 换形态）；
 *   4. `release.yml` 引用的入口必须也在 `ci.yml` 里出现——发布闸不许跑 CI 不认的入口
 *      （「只在 CI 补、发布路径绕过」是 docker D119；反过来「只在发布闸跑」同样会让那条入口平时无声）；
 *   5. **命中不是 0**：两个 workflow 的引用数都为 0 时报警（恒绿闸门比没有更坏，本仓真实发生过）。
 *
 * ## 只读
 *
 * 不写文件、不调 git、不联网：输入是 workflow 文本 + 各包 `package.json`，所以单测可以喂 fixture
 * 造反例，而不必碰 `.github/`。**也不碰真机脚本的口径**：真机脚本刻意不进 CI，这里只查被引用的那批。
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** workflow 目录与要查的文件（相对仓库根；顺序稳定，报错信息才可复现）。 */
export const WORKFLOWS_DIR = '.github/workflows'
export const WORKFLOW_FILES = ['ci.yml', 'release.yml']

/** 写死路径：`node packages/<pkg>/scripts/<file>.mjs`（方案 A 之后**不许再出现**）。 */
const HARDCODED_SCRIPT_RE = /node\s+(packages\/[A-Za-z0-9._-]+\/scripts\/[A-Za-z0-9._-]+\.mjs)/g
/** 包内条目引用：`pnpm --filter <包名> run <条目>`。 */
const ENTRY_REF_RE = /pnpm\s+--filter\s+(@?[A-Za-z0-9._@/-]+)\s+run\s+([A-Za-z0-9:._-]+)/g

/**
 * 从一份 workflow 文本里抓出两类引用（纯函数）。
 *
 * @param text - workflow 全文（YAML 原样；这里按行抓命令，不做 YAML 解析——引用只出现在 `run:` 里，
 *   而 YAML 解析会把多行 `|` 块拼成整段，反而更容易误伤）。
 * @returns `{ hardcoded, entries, commands }`：写死路径、`{ pkgName, entry, raw }` 引用、以及
 *   `pkgName#entry → raw` 的首次出现（用于跨 workflow 比对命令形态）。
 */
export function parseWorkflowRefs(text) {
  const hardcoded = [...text.matchAll(HARDCODED_SCRIPT_RE)].map((match) => match[1])
  const entries = []
  const commands = new Map()
  for (const match of text.matchAll(ENTRY_REF_RE)) {
    const [raw, pkgName, entry] = match
    /*
     * 取**整行**（而不是正则命中那一截）当命令形态：`… run smoke --silent` 这类尾巴必须算进差异——
     * 只比命中的话，两侧被加上参数也看不出来。
     */
    const start = text.lastIndexOf('\n', match.index) + 1
    const end = text.indexOf('\n', match.index)
    const line = text.slice(start, end === -1 ? text.length : end).trim()
    /*
     * 归一掉 YAML 的**步骤写法**（`run: <cmd>` 单行 vs `run: |` 块内一行、`- run:` 列表形态）：
     * 只有命令本身该被比较——同一件事用两种 YAML 写法不该判成「不一致」。
     */
    const command = line
      .replace(/^-\s*/, '')
      .replace(/^run:\s*/, '')
      .replace(/\s+/g, ' ')
      .trim()
    entries.push({ pkgName, entry, raw, line, command })
    const key = `${pkgName}#${entry}`
    if (!commands.has(key)) commands.set(key, command)
  }
  return { hardcoded, entries, commands }
}

/** 读真实仓库的输入：两个 workflow 的文本 + workspace 各包的 `{ dir, name, scripts }`。 */
export function readCiScriptInputs(repoRoot = REPO_ROOT) {
  const workflows = WORKFLOW_FILES.map((file) => ({
    file,
    text: readFileSync(join(repoRoot, WORKFLOWS_DIR, file), 'utf8').replace(/\r\n/g, '\n'),
  }))
  const pkgRoot = join(repoRoot, 'packages')
  const packages = readdirSync(pkgRoot)
    .filter((dir) => {
      try {
        readFileSync(join(pkgRoot, dir, 'package.json'), 'utf8')
        return true
      } catch {
        return false
      }
    })
    .sort()
    .map((dir) => {
      const manifest = JSON.parse(readFileSync(join(pkgRoot, dir, 'package.json'), 'utf8'))
      return { dir, name: manifest.name, scripts: manifest.scripts ?? {} }
    })
  return { workflows, packages }
}

/**
 * 判据：CI 与包内条目不许漂（五条，见文件头）。
 *
 * @param input - `{ workflows, packages }`（由 `readCiScriptInputs` 读；单测可传合成清单）。
 */
export function checkCiScriptTruth({ workflows, packages }) {
  const diffs = []
  const byName = new Map(packages.map((pkg) => [pkg.name, pkg]))
  const parsed = workflows.map((workflow) => ({ file: workflow.file, ...parseWorkflowRefs(workflow.text) }))

  // 1. 写死路径回归
  for (const workflow of parsed) {
    for (const path of workflow.hardcoded) {
      diffs.push({
        kind: 'ci.hardcodedPath',
        file: workflow.file,
        message: `${workflow.file} 里又出现了写死路径 \`node ${path}\`：这会让对应包的条目悄悄腐烂（CI 不再跑它）。改成 \`pnpm --filter <包名> run <条目>\`——逐条对应关系见 docs/ci-scripts-plan.md`,
      })
    }
  }

  // 2. 每个条目引用都要能解析
  for (const workflow of parsed) {
    for (const ref of workflow.entries) {
      const pkg = byName.get(ref.pkgName)
      if (pkg === undefined) {
        diffs.push({
          kind: 'ci.entry.unknown',
          file: workflow.file,
          message: `${workflow.file} 引用了 \`${ref.pkgName}\`，但 workspace 里没有这个包（\`--filter\` 的包名要写 package.json 的 name）`,
        })
        continue
      }
      if (!(ref.entry in pkg.scripts)) {
        diffs.push({
          kind: 'ci.entry.missing',
          file: workflow.file,
          message: `${workflow.file} 引用了 \`${pkg.name}\` 的 \`run ${ref.entry}\`，但该包 package.json 没有这个条目：条目改名就得同步改 workflow（这正是两个真相源不许漂的一半）`,
        })
      }
    }
  }

  // 3. 同一入口在两个 workflow 里的命令形态必须一致
  const [first, ...rest] = parsed
  if (first !== undefined) {
    for (const workflow of rest) {
      for (const [key, raw] of workflow.commands) {
        const other = first.commands.get(key)
        if (other === undefined || other === raw) continue
        diffs.push({
          kind: 'ci.crossWorkflow.mismatch',
          file: workflow.file,
          message: `同一个入口 \`${key}\` 在 ${first.file} 与 ${workflow.file} 里的命令不一致（\`${other}\` vs \`${raw}\`）：两侧必须逐字一致，否则「CI 跑的那条」与「发布闸跑的那条」不是同一件事`,
        })
      }
    }
  }

  // 4. release 引用的入口必须也在 ci 里出现
  const ci = parsed.find((workflow) => workflow.file === 'ci.yml')
  const release = parsed.find((workflow) => workflow.file === 'release.yml')
  if (ci !== undefined && release !== undefined) {
    for (const [key, raw] of release.commands) {
      if (ci.commands.has(key)) continue
      diffs.push({
        kind: 'ci.releaseOnly',
        file: release.file,
        message: `${release.file} 跑了 \`${raw}\`（${key}），但 ci.yml 里没有它：发布闸不许跑 CI 不认的入口——那条入口平时无声，坏了也没人知道（docker D119 是反过来的那一半）`,
      })
    }
  }

  // 5. 命中不是 0
  const totalEntries = parsed.reduce((sum, workflow) => sum + workflow.entries.length, 0)
  if (totalEntries === 0) {
    diffs.push({
      kind: 'ci.empty',
      message: `两个 workflow 里一个 \`pnpm --filter … run …\` 引用都没抓到：闸门恒绿（本仓真实发生过这种闸门），先确认抓引用的正则与 workflow 实际写法还对得上`,
    })
  }
  return diffs
}

/* CLI（人工核对用；测试走 checkCiScriptTruth） */
if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  const inputs = readCiScriptInputs()
  const diffs = checkCiScriptTruth(inputs)
  for (const workflow of inputs.workflows) {
    const { hardcoded, entries } = parseWorkflowRefs(workflow.text)
    console.log(`[ci-script-truth] ${workflow.file}：包内条目引用 ${String(entries.length)} 条；写死路径 ${String(hardcoded.length)} 处`)
  }
  for (const diff of diffs) console.log(`  ✘ ${diff.kind}  ${diff.message}`)
  if (diffs.length === 0) console.log('[ci-script-truth] 通过')
  process.exit(diffs.length === 0 ? 0 : 1)
}
