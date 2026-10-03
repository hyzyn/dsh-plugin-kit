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
 * **根级扩展（2026-10-03）**：同一套「不许漂」延伸到根 `scripts/` 的发布不变量闸
 * （check-*.mjs 九道 + release-publish），workflow 里改成裸调用 `pnpm <条目>`：
 *
 *   6. **根级写死路径不许出现**（`node scripts/<file>.mjs` → `ci.rootHardcodedPath`）——
 *      与第 1 条同罪：条目才是真相源；
 *   7. **每个裸调用 `pnpm <条目>` 都必须存在于根 package.json**（`ci.rootEntry.missing`；
 *      pnpm 内建命令如 install / run 不算条目）。根级入口同样受第 3 / 4 条约束
 *      （键带 `root#` 前缀进同一张命令表）；`release:publish` 在白名单里——发布动作本身
 *      天然只出现在发布闸，不该反过来逼着 CI 每次推送都跑一遍 publish。
 *
 * ## 只读
 *
 * 不写文件、不调 git、不联网：输入是 workflow 文本 + 各包 `package.json`，所以单测可以喂 fixture
 * 造反例，而不必碰 `.github/`。**也不碰真机脚本的口径**：真机脚本（要真机 / 真宿主 / 真浏览器）
 * 大多不进 CI，这里只查被引用的那批——唯一例外是 `live-host-smoke` 的挂载车道，它进 CI 之后
 * 同样受这套判据约束（见 [docs/conventions.md § 挂载车道](../docs/conventions.md#真机脚本与-ci-接线)）。
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

/** 根级写死路径：`node scripts/<file>.mjs`（2026-10-03 起与包内写死同罪）。 */
const ROOT_HARDCODED_SCRIPT_RE = /node\s+(scripts\/[A-Za-z0-9._-]+\.mjs)/g
/**
 * 根级条目引用：行内裸调用 `pnpm <条目>`。首段以 `-` 开头的是 pnpm 自己的旗标
 * （`pnpm -r build` / `pnpm --filter …` / `pnpm --silent …`），不是条目，不在此抓。
 * 抓到后再对照 ROOT_PNPM_BUILTINS 排除内建命令（install / run 等不是 package.json 条目）。
 */
const ROOT_ENTRY_RE = /pnpm\s+([A-Za-z0-9][A-Za-z0-9:._-]*)/g
/** pnpm 内建命令：不是条目，解析时跳过（不进根级一致性检查）。 */
const ROOT_PNPM_BUILTINS = new Set([
  'install', 'i', 'add', 'update', 'up', 'remove', 'rm', 'uninstall',
  'publish', 'pack', 'run', 'exec', 'dlx', 'create', 'init',
  'link', 'unlink', 'prune', 'rebuild', 'approve-builds',
  'store', 'env', 'setup', 'workspace', 'recursive', 'r',
])
/** 根级条目里「天然只属于发布闸」的白名单（第 4 条对它们豁免）。 */
const ROOT_RELEASE_ONLY_ALLOW = new Set(['release:publish'])

/** match 所在行是否是注释行（YAML `#` 或 run: | 块里的 `#` 行）——注释里提到的命令不算引用。 */
function isCommentLine(text, index) {
  const lineStart = text.lastIndexOf('\n', index) + 1
  return text.slice(lineStart, index).trimStart().startsWith('#')
}

/**
 * 从一份 workflow 文本里抓出四类引用（纯函数）。
 *
 * @param text - workflow 全文（YAML 原样；这里按行抓命令，不做 YAML 解析——引用只出现在 `run:` 里，
 *   而 YAML 解析会把多行 `|` 块拼成整段，反而更容易误伤）。注释行里的命令一律不算引用。
 * @returns `{ hardcoded, entries, rootHardcoded, rootEntries, commands }`：包内写死路径、
 *   `pnpm --filter` 引用、根级写死路径、裸调用 `pnpm <条目>`，以及命令形态表——包内键为
 *   `pkgName#entry`，根级键为 `root#entry`（同一张表，第 3 / 4 条判据对两类一视同仁）。
 */
export function parseWorkflowRefs(text) {
  const hardcoded = [...text.matchAll(HARDCODED_SCRIPT_RE)].map((match) => match[1])
  const rootHardcoded = [...text.matchAll(ROOT_HARDCODED_SCRIPT_RE)]
    .filter((match) => !isCommentLine(text, match.index))
    .map((match) => match[1])
  const entries = []
  const rootEntries = []
  const commands = new Map()
  for (const match of text.matchAll(ENTRY_REF_RE)) {
    if (isCommentLine(text, match.index)) continue
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
    entries.push({ pkgName: match[1], entry: match[2], raw: match[0], line, command })
    const key = `${match[1]}#${match[2]}`
    if (!commands.has(key)) commands.set(key, command)
  }
  for (const match of text.matchAll(ROOT_ENTRY_RE)) {
    if (isCommentLine(text, match.index)) continue
    const entry = match[1]
    if (ROOT_PNPM_BUILTINS.has(entry)) continue
    const start = text.lastIndexOf('\n', match.index) + 1
    const end = text.indexOf('\n', match.index)
    const line = text.slice(start, end === -1 ? text.length : end).trim()
    const command = line.replace(/^-\s*/, '').replace(/^run:\s*/, '').replace(/\s+/g, ' ').trim()
    rootEntries.push({ entry, line, command })
    const key = `root#${entry}`
    if (!commands.has(key)) commands.set(key, command)
  }
  return { hardcoded, entries, rootHardcoded, rootEntries, commands }
}

/** 读真实仓库的输入：两个 workflow 的文本 + workspace 各包的 `{ dir, name, scripts }` + 根 `package.json` 的条目。 */
export function readCiScriptInputs(repoRoot = REPO_ROOT) {
  const workflows = WORKFLOW_FILES.map((file) => ({
    file,
    text: readFileSync(join(repoRoot, WORKFLOWS_DIR, file), 'utf8').replace(/\r\n/g, '\n'),
  }))
  const rootManifest = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
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
  return { workflows, packages, rootScripts: rootManifest.scripts ?? {} }
}

/**
 * 判据：CI 与包内条目不许漂（七条，见文件头）。
 *
 * @param input - `{ workflows, packages, rootScripts }`（由 `readCiScriptInputs` 读；单测可传合成清单）。
 *   `rootScripts` 是根 `package.json` 的 `scripts`——根级裸调用要拿它解析（缺省 = 空对象，
 *   此时任何根级引用都会按「条目不存在」报出来，不会静默放过）。
 */
export function checkCiScriptTruth({ workflows, packages, rootScripts = {} }) {
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
      // 发布动作天然只属于发布闸（白名单）：不该反过来逼着每次推送都跑一遍 publish。
      if (ROOT_RELEASE_ONLY_ALLOW.has(key.slice('root#'.length))) continue
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

  // 6. 根级写死路径回归（`node scripts/<file>.mjs`）
  for (const workflow of parsed) {
    for (const path of workflow.rootHardcoded) {
      diffs.push({
        kind: 'ci.rootHardcodedPath',
        file: workflow.file,
        message: `${workflow.file} 里又出现了根级写死路径 \`node ${path}\`：这会让根 package.json 的对应条目悄悄腐烂（CI 不再跑它，手动入口也没人验）。改成 \`pnpm <条目>\`——条目与对应关系见 docs/ci-scripts-plan.md § 10`,
      })
    }
  }

  // 7. 每个根级裸调用都要能在根 package.json 里解析
  for (const workflow of parsed) {
    for (const ref of workflow.rootEntries) {
      if (ref.entry in rootScripts) continue
      diffs.push({
        kind: 'ci.rootEntry.missing',
        file: workflow.file,
        message: `${workflow.file} 跑了 \`pnpm ${ref.entry}\`，但根 package.json 没有这个条目：` +
          `要么是条目改名没同步（两个真相源漂了），要么是 pnpm 内建命令漏进了 ROOT_PNPM_BUILTINS 白名单`,
      })
    }
  }
  return diffs
}

/* CLI（人工核对用；测试走 checkCiScriptTruth） */
if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  const inputs = readCiScriptInputs()
  const diffs = checkCiScriptTruth(inputs)
  for (const workflow of inputs.workflows) {
    const { hardcoded, entries, rootHardcoded, rootEntries } = parseWorkflowRefs(workflow.text)
    console.log(
      `[ci-script-truth] ${workflow.file}：包内条目引用 ${String(entries.length)} 条；` +
        `写死路径 ${String(hardcoded.length)} 处；根级条目 ${String(rootEntries.length)} 条；` +
        `根级写死路径 ${String(rootHardcoded.length)} 处`,
    )
  }
  for (const diff of diffs) console.log(`  ✘ ${diff.kind}  ${diff.message}`)
  if (diffs.length === 0) console.log('[ci-script-truth] 通过')
  process.exit(diffs.length === 0 ? 0 : 1)
}
