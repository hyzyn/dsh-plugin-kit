/**
 * 发包内容守卫（`pnpm package-contents:check`）：**真的打一次包**，断言声明的入口都在 tarball 里。
 *
 * ## 为什么需要它（2026-10-03 实测出的洞）
 *
 * 每个可发布包的 `files` 字段是**手工清单**，而清单漏一项不会有任何东西红。实测反证：
 * 把 `packages/tty/package.json` 的 `files` 里 `"client.js"` 删掉后——
 *
 *   publishable:check ✔ · dsh-peers:check ✔ · kit-pins:check ✔ · aggregate:check ✔
 *   全量 vitest 109 文件 / 1698 用例 ✔
 *
 * 十三道闸门加一千多条用例**全绿**，而 `pnpm pack` 出的 tarball 里真的没有 `client.js`
 * ——用户装上就是浏览器半体 404（界面整块不出现），只在用户侧暴露。
 *
 * 为什么既有闸门全都看不见它：
 *
 *   - `artifacts:check` 只比「入库产物 vs 重新构建」，它不知道 `files` 字段；
 *   - `publishable:check` 只管 `workspace:` 协议残留；
 *   - **挂载车道走的是 `link:`（直接链到本仓目录），绕过 `files` 字段**——所以连「真挂进
 *     真 DSH 并渲染」那条最强的车道也验不到它（dsh-web 那条车道用 `pnpm pack` + `file:`，
 *     天然覆盖；这是两条车道形态不同带来的一个真实缺口，见 docs/conventions.md § 挂载车道）。
 *
 * 同一类「手工清单漏一行 → 静默跳过」在本仓已经有过一次：v0.1.20 的 `dsh-docker` 漏进
 * `publish-targets.mjs`，workflow 全绿而 registry 上根本没这个包（`check-publishable.mjs`
 * 的覆盖度判据就是为它加的）。本闸是那条教训在**打包内容**上的同一形状。
 *
 * ## 判据（都不许「匹配不到就算过」）
 *
 * 1. **入口必须真的在 tarball 里**：`main` / `types` / `exports` 的每个值 /
 *    `dsh.bundle.patch` / 声明了 `dsh.client` 时的 `client.js`——**全部从 manifest 现算**，
 *    不写死清单（写死清单就是同一个 bug 换了个位置）；
 * 2. **`files` 里的字面路径必须存在于磁盘**：pnpm 对不存在的路径**静默忽略**（实测：
 *    `files` 加一个不存在的 `DOES-NOT-EXIST.md`，`pnpm pack` 退出码 0、只是不包含它），
 *    于是改名/删除后残留的死路径会一直躺在那儿骗人；
 * 3. **命中不是 0**：一个包都没打包、或一个必需条目都没解析出来时报警（恒绿闸门比没有更坏，
 *    本仓真实发生过）。
 *
 * ## 为什么不查「多余的东西」
 *
 * tarball 里多带文件（`scripts/`、`client-src/`）是**有意的**（tty / docker 把端到端脚本
 * 随包发给用户，见各自 README），不是本闸要管的事。本闸只回答一个问题：**声明的东西在不在**。
 *
 * ## 运行成本
 *
 * `pnpm pack --dry-run` 是纯本地操作、**不落 tarball**、不联网，13 个目标实测各约 0.14s。
 *
 * 不写 shebang：本文件要被 `scripts/test/package-contents.test.ts` import。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { targets } from './publish-targets.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** `files` 里指向目录的条目（`lib` / `scripts`）——只需路径本身存在，不需要展开成文件。 */
const FILES_PATH_OK = (root, rel) => existsSync(join(root, rel))

/** 归一成 tarball 里的相对路径形态：去掉 `./` 前缀与首尾空白。 */
function normalizePath(value) {
  return String(value).trim().replace(/^\.\//, '').replace(/\/+$/, '')
}

/**
 * 递归收集 `exports` 一个值里的全部文件路径（值可以是字符串、或 `{types, default}` 这类条件对象）。
 *
 * 只收**看起来是相对路径**的（`./` 开头或没有协议头）——`exports` 里也可能出现 `node:` 这类
 * 非文件值，把它们当路径会让闸门自己误报。
 */
export function collectExportPaths(value, out = []) {
  if (typeof value === 'string') {
    if (value.startsWith('./')) out.push(value)
    return out
  }
  if (value === null || typeof value !== 'object') return out
  for (const nested of Object.values(value)) collectExportPaths(nested, out)
  return out
}

/**
 * 从 manifest **现算**必需进 tarball 的条目（不写死清单）。
 *
 * @param manifest - 该包的 `package.json` 内容
 * @returns `{ path, why }[]`：路径 + 它为什么是必需的（报错信息里要能看出是哪条声明要求的）
 */
export function requiredEntries(manifest) {
  const found = new Map()
  const add = (raw, why) => {
    const path = normalizePath(raw)
    if (path === '') return
    // 同一个路径可能被多条声明要求（比如 exports["./client"] 与 dsh.client 都指 client.js）：
    // 合并理由，报错时能一次看全。
    const existing = found.get(path)
    if (existing === undefined) found.set(path, { path, why: [why] })
    else existing.why.push(why)
  }

  if (manifest.main !== undefined) add(manifest.main, 'main')
  if (manifest.types !== undefined) add(manifest.types, 'types')
  if (manifest.dsh?.bundle?.patch !== undefined) add(manifest.dsh.bundle.patch, 'dsh.bundle.patch')
  for (const [key, value] of Object.entries(manifest.exports ?? {})) {
    for (const path of collectExportPaths(value)) add(path, `exports["${key}"]`)
  }
  // 声明了浏览器半体 → 宿主按 /plugins/<id>/client.js 加载它（docs/architecture.md § 6），
  // 这个文件名是宿主约定、不写进 exports 也照样必须存在。
  if (manifest.dsh?.client !== undefined) add('client.js', 'dsh.client（宿主按 /client.js 加载浏览器半体）')

  return [...found.values()]
}

/**
 * 纯判定：只吃「各目标的 manifest + tarball 条目 + files 里的路径在不在」，不碰文件系统与子进程
 * （反例由测试用 fixture 造，不需要真的打包）。
 *
 * @param input - `{ targets: { dir, name, manifest, packed, filesExist }[] }`
 *   - `packed`：该包 tarball 里的**全部**条目路径（相对包根）
 *   - `filesExist`：`files` 里每条字面路径在磁盘上是否存在
 * @returns `{ violations, checkedEntries }`：违规描述 + 实际检查过的入口数（判据 3 用）
 */
export function checkPackageContents({ targets: list }) {
  const violations = []
  let checkedEntries = 0

  for (const target of list) {
    const packed = new Set(target.packed)
    const required = requiredEntries(target.manifest)
    for (const item of required) {
      checkedEntries += 1
      if (packed.has(item.path)) continue
      violations.push(
        `${target.dir}（${target.name}）：tarball 里没有 \`${item.path}\`——被 ${item.why.join(' / ')} 声明为入口，` +
          `但 \`files\` 字段没把它带进去。用户装到的包缺这个文件，只在用户侧暴露（改 \`package.json\` 的 \`files\` 补上）`,
      )
    }

    for (const entry of target.manifest.files ?? []) {
      if (target.filesExist[entry] === true) continue
      violations.push(
        `${target.dir}（${target.name}）：\`files\` 里的 \`${entry}\` 在磁盘上不存在——pnpm 对不存在的路径**静默忽略**，` +
          `这条死路径会一直躺着不报错（改名/删除后忘了同步 \`files\` 就是这种形状）`,
      )
    }
  }

  return { violations, checkedEntries }
}

/**
 * 打一次 dry-run 包，取出 tarball 条目清单。
 *
 * 两种输出形态都要接：pnpm 在**根包**上给对象、在**子包**上给数组（实测），这里统一成数组。
 *
 * ## Windows 必须经 shell（2026-10-03 CI 实测）
 *
 * 第一版直接 `execFileSync('pnpm', …)`，在 Windows 腿上 **26 条用例全炸**：
 * `spawnSync pnpm ENOENT`。原因是 Windows 上的 pnpm 是 `pnpm.cmd`，而 `execFileSync` 不带
 * `shell` 时**拒跑批处理**（本仓 `scripts/dsh-exec.mjs` 的文件头记过同一件事：`.cmd` 只能经
 * shell 启动）。所以这里按平台开 shell——**只在 Windows 上开**，POSIX 上保持不开，
 * 免得给一条本来没有 shell 语义的调用引入引号/通配的意外（我们的参数里没有需要转义的字符，
 * 但「不需要就别开」是更稳的默认）。
 *
 * @param dir - 包目录（绝对路径）
 * @returns `string[]` tarball 里的条目路径
 */
export function packDryRun(dir) {
  const out = execFileSync('pnpm', ['pack', '--dry-run', '--json'], {
    cwd: dir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    maxBuffer: 64 * 1024 * 1024,
  })
  const parsed = JSON.parse(out)
  const result = Array.isArray(parsed) ? parsed[0] : parsed
  return (result?.files ?? []).map((file) => normalizePath(file.path))
}

/** 读真实仓库的输入：对发布清单里的每个目标真的打一次包。 */
export function readPackageContentsInputs(root = REPO_ROOT) {
  return {
    targets: targets.map(([dir, name]) => {
      const abs = resolve(root, dir)
      const manifest = JSON.parse(readFileSync(join(abs, 'package.json'), 'utf8'))
      const filesExist = {}
      for (const entry of manifest.files ?? []) filesExist[entry] = FILES_PATH_OK(abs, entry)
      return { dir, name, manifest, packed: packDryRun(abs), filesExist }
    }),
  }
}

/* CLI（人工核对用；测试走 checkPackageContents + 各纯函数） */
if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  const inputs = readPackageContentsInputs()
  const { violations, checkedEntries } = checkPackageContents(inputs)
  console.log(
    `[check-package-contents] 打了 ${String(inputs.targets.length)} 个包，检查 ${String(checkedEntries)} 个声明入口`,
  )
  for (const target of inputs.targets) {
    console.log(`  ${target.dir.padEnd(22)} ${String(target.packed.length).padStart(3)} 个文件  ${target.name}`)
  }
  // 判据 3：命中不是 0。数量阈值取「至少有目标、且真的解析出入口」——写死具体条数会在
  // 新增包时无谓地红，而 0 才是真正的「闸门没在工作」。
  if (inputs.targets.length === 0 || checkedEntries === 0) {
    console.error('[check-package-contents] 未通过：一个目标/入口都没解析出来，闸门恒绿（先确认 publish-targets.mjs 与 manifest 声明形态）')
    process.exit(1)
  }
  for (const violation of violations) console.error(`  ✘ ${violation}`)
  if (violations.length > 0) {
    console.error(`[check-package-contents] 未通过：${String(violations.length)} 处`)
    console.error('`files` 是手工清单，漏一行不会有别的闸门红（挂载车道走 link:，绕过它）。')
    process.exit(1)
  }
  console.log(`[check-package-contents] 通过：${String(checkedEntries)} 个声明入口都在 tarball 里`)
}
