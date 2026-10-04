/**
 * 「去哪找 `@deepseek-ai/dsh-app-boot`」——一个可测的小模块，只干这一件事。
 *
 * ## 为什么要单独一个模块
 *
 * `check-dsh-peers.mjs --app-boot <dir>` 这条路径**早在 2026-09-29 就有了**（历史证据：
 * `packages/codegraph/README.md` 记着两轮发布前用它逐 cohort × 逐包核对过），但它**从来没进 CI**：
 * 每次都要人手把路径拼出来当参数传，于是它退化成「靠人记得跑」的步骤——正是
 * `docs/conventions.md` 那条「CI 与发布闸要成对」的反面。
 *
 * 要接进 CI 就得**自动定位**它。而定位这件事有两个平台分支（全局安装的布局、
 * Windows 的 `npm root -g`），正是本仓 `chrome-path.mjs` 处理过的那类问题：
 * 把「在哪找」与「找到了没有」做成可注入的，让 `scripts/test/dsh-app-boot.test.ts`
 * 在任何平台上都能把「Windows 的布局」「装了两份 dsh」这些分支跑一遍。
 *
 * ## 三种来源，优先级从高到低
 *
 * 1. **显式参数**（`--app-boot <dir>`）：给了就用，指错了**报错**而不是回落到搜索
 *    ——与 `findChrome` 的 `explicit` 同一条纪律：点了名却悄悄换了另一个，等于把
 *    「我验的是哪个判定器」变成运气；
 * 2. **环境变量 `DSH_APP_BOOT_DIR`**：CI 里想钉住某一份时用；
 * 3. **从 dsh 安装推导**：`dsh` 的真身是 `<globalRoot>/@deepseek-ai/dsh/lib/bin.js`，
 *    而 app-boot 在**它自己的 `node_modules`** 下（dsh 用 pnpm/npm 装依赖时嵌在包内）。
 *    从 bin 的 realpath 上溯两级拿到包目录，再拼 `node_modules/@deepseek-ai/dsh-app-boot`。
 *
 * ## 为什么从 `dsh` 的真身推导，而不是从 `npm root -g` 直接拼
 *
 * `npm root -g` 返回的是**当前 PATH 里那个 npm** 的全局根，而 `dsh` 可能是**另一个** node
 * 版本（nvm / volta / fnm 下很常见）装的。从 `which dsh` 的 realpath 上溯，拿到的是
 * **这个 dsh 自己**的包目录，两者必然一致。`npm root -g` 只作为**兜底**候选之一。
 *
 * ## 找不到时的行为
 *
 * 返回 `null` 并附上**试过哪些路径**（`describeAppBootSearch`）——调用方据此报错退出。
 * 刻意**不**静默跳过：这条路径是「用宿主真正会跑的那段代码复核声明」，跳过它等于
 * 把 CI 的结论降级成「我自己写的规则说没问题」。
 *
 * 不写 shebang：本文件要被 `scripts/test/dsh-app-boot.test.ts` import。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, realpathSync } from 'node:fs'
import * as nodePath from 'node:path'
import { dirname, join, resolve } from 'node:path'

/** 环境变量名（CI 里想钉住某一份判定器时用）。 */
export const APP_BOOT_ENV_VAR = 'DSH_APP_BOOT_DIR'

/**
 * 包目录相对 dsh 包根的路径（dsh 把自己的依赖嵌在 `node_modules` 下）。
 *
 * 存**段数组**而不是预先 join 好的字符串：`pathImpl` 可注入（测试传 `path.win32`），
 * 而预先 join 出的字符串是用**宿主平台**的分隔符算的。实测 `win.join(pkgRoot, 'a/b/c')`
 * 会把正斜杠归一掉、恰好也对，但那是巧合而非保证——存段数组则两种平台都按各自的
 * `join` 拼，没有依赖归一行为。
 */
const APP_BOOT_SEGMENTS = ['node_modules', '@deepseek-ai', 'dsh-app-boot']

/**
 * 判定一个目录是不是可用的 app-boot：必须有 `package.json` 与 `lib/index.js`。
 *
 * 只查目录存在是不够的——`lib/index.js` 是 `--app-boot` 真正要 import 的入口
 * （见 `check-dsh-peers.mjs` 的 `pathToFileURL(join(dir, 'lib', 'index.js'))`）。
 * 只判目录会让一个残缺的安装（解包中断）通过，然后在 import 时才炸。
 *
 * @param dir - 候选目录
 * @param options.exists - 注入「路径在不在」（测试用）
 * @param options.pathImpl - 注入路径模块（默认 `node:path`；测试传 `path.win32` **真的执行**
 *   Windows 分支，而不是在 macOS 上推演它——这条在 2026-10-04 被证明是必要的，
 *   见 `appBootCandidatesFromDshBin` 的注释）
 */
export function isUsableAppBoot(dir, options = {}) {
  const { exists = existsSync, pathImpl = nodePath } = options
  if (typeof dir !== 'string' || dir === '') return false
  return exists(pathImpl.join(dir, 'package.json')) && exists(pathImpl.join(dir, 'lib', 'index.js'))
}

/**
 * 从 `dsh` 可执行文件的路径推出 app-boot 的**候选目录**（纯函数，不碰文件系统）。
 *
 * 布局：`<globalRoot>/@deepseek-ai/dsh/lib/bin.js` → 上溯两级得
 * `<globalRoot>/@deepseek-ai/dsh`，然后**两种 npm 布局都作为候选**：
 *
 *   ① vendored：`<pkgRoot>/node_modules/@deepseek-ai/dsh-app-boot`（本机实测是这种）
 *   ② hoisted：`<globalRoot>/@deepseek-ai/dsh-app-boot`（npm 可能把依赖提升到全局根）
 *
 * 返回数组而不是单个路径：只认一种会在另一种布局上定位失败，而症状是「找不到判定器」
 * （看着像没装 dsh）。调用方按顺序试。
 *
 * @param dshBinPath - `which dsh` 的结果（可能是符号链接）
 * @param options.realpath - 注入「解析符号链接」（测试用）
 * @param options.pathImpl - 注入路径模块（测试传 `path.win32` 跑 Windows 分支）
 * @returns `string[]` 候选（可能为空）；形态不认识时返回 `[]`
 */
export function appBootCandidatesFromDshBin(dshBinPath, options = {}) {
  const { realpath = (p) => p, pathImpl = nodePath } = options
  const { dirname: dir, join: jn } = pathImpl
  if (typeof dshBinPath !== 'string' || dshBinPath === '') return []
  let real
  try {
    real = realpath(dshBinPath)
  } catch {
    return []
  }
  if (typeof real !== 'string' || real === '') return []
  // bin.js 的目录是 lib/，再上溯一级才是包根
  const libDir = dir(real)
  const pkgRoot = dir(libDir)
  if (pkgRoot === '' || pkgRoot === dir(pkgRoot)) return []
  // 包根是 `<globalRoot>/@deepseek-ai/dsh`，globalRoot 是它的上两级
  const scopeDir = dir(pkgRoot)
  const globalRoot = dir(scopeDir)
  return [
    jn(pkgRoot, ...APP_BOOT_SEGMENTS),
    ...(globalRoot === '' || globalRoot === dir(globalRoot)
      ? []
      : [jn(globalRoot, '@deepseek-ai', 'dsh-app-boot')]),
  ]
}

/**
 * 兼容旧名：返回**第一个**候选（vendored 布局）。新代码用
 * `appBootCandidatesFromDshBin`，它会同时给出 hoisted 候选。
 *
 * @deprecated 用 `appBootCandidatesFromDshBin`
 */
export function appBootFromDshBin(dshBinPath, options = {}) {
  const [first] = appBootCandidatesFromDshBin(dshBinPath, options)
  return first ?? null
}

/**
 * 列出一个 node_modules 根下**所有** `@deepseek-ai/dsh` 安装（nvm 等会装多份）。
 *
 * @param globalRoot - 全局 node_modules 目录
 * @param options.readdir - 注入「列目录」（测试用）
 * @returns `string[]`：各 dsh 包根
 */
export function dshPackageRootsUnder(globalRoot, options = {}) {
  const { readdir = readdirSync, pathImpl = nodePath } = options
  if (typeof globalRoot !== 'string' || globalRoot === '') return []
  const scoped = pathImpl.join(globalRoot, '@deepseek-ai')
  let names
  try {
    names = readdir(scoped)
  } catch {
    return []
  }
  return names
    .filter((name) => name === 'dsh' || name.startsWith('dsh-'))
    .map((name) => pathImpl.join(scoped, name))
}

/**
 * 定位 app-boot 目录。
 *
 * @param options.explicit - 显式指定的目录（`--app-boot`）。给了就**只**认它。
 * @param options.env - 注入环境变量（默认 `process.env`）
 * @param options.whichDsh - 返回 `dsh` 可执行文件路径的函数（默认用 `which` / `where`；
 *   测试注入）。返回 `null` 表示没找到。
 * @param options.npmRootG - 返回 `npm root -g` 的函数（兜底；测试注入）
 * @param options.exists - 注入「路径在不在」
 * @param options.realpath - 注入「解析符号链接」
 * @param options.readdir - 注入「列目录」
 * @param options.pathImpl - 注入路径模块（测试传 `path.win32` 跑 Windows 分支）
 * @returns `{ dir, source, tried }`：找到时 `dir` + 来源；找不到时 `dir: null` + 试过的路径
 */
export function findAppBoot(options = {}) {
  const {
    explicit,
    env = process.env,
    whichDsh = defaultWhichDsh,
    npmRootG = defaultNpmRootG,
    exists = existsSync,
    realpath,
    readdir,
    pathImpl = nodePath,
  } = options

  const fsOptions = { exists, pathImpl }
  const tried = []

  /** 逐个候选试；命中即返回。 */
  const firstUsable = (candidates, source) => {
    for (const dir of candidates) {
      if (dir === null || dir === undefined || dir === '') continue
      tried.push(dir)
      if (isUsableAppBoot(dir, fsOptions)) return { dir, source, tried }
    }
    return null
  }

  // 1. 显式参数：给了就只认它（指错了要报错，不回落到搜索）
  if (explicit !== undefined && explicit !== '') {
    const abs = pathImpl.resolve(explicit)
    tried.push(abs)
    if (isUsableAppBoot(abs, fsOptions)) return { dir: abs, source: 'explicit', tried }
    return { dir: null, source: 'explicit', tried }
  }

  // 2. 环境变量：与显式参数同一条纪律——**点了名就只认它**，指错了直接失败，
  //    绝不回落到自动搜索。2026-10-04 实测过不这么做的后果：`DSH_APP_BOOT_DIR=/tmp/also-missing`
  //    被静默忽略、回落到自动定位并**成功**，于是「我钉住的那一份判定器」根本没被用上。
  const fromEnv = env[APP_BOOT_ENV_VAR]
  if (typeof fromEnv === 'string' && fromEnv !== '') {
    const abs = pathImpl.resolve(fromEnv)
    tried.push(abs)
    if (isUsableAppBoot(abs, fsOptions)) return { dir: abs, source: 'env', tried }
    return { dir: null, source: 'env', tried }
  }

  // 3. 从 dsh 真身推导（优先），再兜底 npm root -g
  const binPath = whichDsh()
  if (typeof binPath === 'string' && binPath !== '') {
    const candidates = appBootCandidatesFromDshBin(binPath, { realpath: realpath ?? defaultRealpath, pathImpl })
    const hit = firstUsable(candidates, 'dsh-bin')
    if (hit !== null) return hit
  }
  const globalRoot = npmRootG()
  if (typeof globalRoot === 'string' && globalRoot !== '') {
    /*
     * 两种 npm 布局都要试（2026-10-04 实测本机是第一种，但第二种在 CI 上完全可能）：
     *
     *   ① **vendored**（本机实测）：dsh 把全部依赖嵌在自己包内 ——
     *      `<root>/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-app-boot`
     *      （实测该目录下 193 个 node_modules 条目、290 个 `@deepseek-ai` 包）
     *   ② **hoisted**：npm 把 app-boot 提升到全局根 ——
     *      `<root>/@deepseek-ai/dsh-app-boot`
     *
     * 只认一种就会在另一种布局上定位失败，而症状是「找不到判定器」（看着像没装 dsh）。
     * 提升布局排在前面：它更浅、也更可能是 npm 的标准结果。
     */
    const candidates = [
      pathImpl.join(globalRoot, '@deepseek-ai', 'dsh-app-boot'),
      ...dshPackageRootsUnder(globalRoot, { readdir, pathImpl }).map((pkgRoot) =>
        pathImpl.join(pkgRoot, ...APP_BOOT_SEGMENTS)),
    ]
    const hit = firstUsable(candidates, 'npm-root-g')
    if (hit !== null) return hit
  }

  return { dir: null, source: undefined, tried }
}

/** 默认实现：`which dsh` / Windows 的 `where dsh`。找不到返回 `null`。 */
function defaultWhichDsh() {
  const cmd = process.platform === 'win32' ? 'where' : 'which'
  try {
    const out = execFileSync(cmd, ['dsh'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    const first = out.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== '')[0]
    return first ?? null
  } catch {
    return null
  }
}

/** 默认实现：`npm root -g`。失败返回 `null`。 */
function defaultNpmRootG() {
  try {
    const out = execFileSync('npm', ['root', '-g'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      // Windows 上 npm 是 .cmd，不带 shell 时 execFileSync 拒跑批处理
      shell: process.platform === 'win32',
    })
    return out.trim() === '' ? null : out.trim()
  } catch {
    return null
  }
}

/** 默认 realpath：解析符号链接；失败时原样返回（候选会因不可用被跳过）。 */
function defaultRealpath(p) {
  try {
    return realpathSync(p)
  } catch {
    return p
  }
}

/** 给人看的「我试过哪些路径」——找不到时调用方要打出来，否则没人知道该建什么。 */
export function describeAppBootSearch(tried) {
  if (!Array.isArray(tried) || tried.length === 0) return '（没有试过任何路径：dsh 与 npm 都没找到）'
  return tried.map((p) => `  - ${p}`).join('\n')
}
