/**
 * 发布内容一致性预检（`pnpm release:preflight`；`release:publish` 在真正 publish 前自动跑）。
 *
 * ## 它防的是什么（2026-10-17 的真实事故，外部 issue #12）
 *
 * npm 的「包名@版本」是**不可变的内容身份**：同一个版本号只能对应一份内容。而本仓的发布流
 * 过去的跳过判据只有「registry 上有没有这个版本」——版本在就跳过。于是「内容改了但没 bump
 * 版本」这条路径**完全静默**：
 *
 *   1. 2026-10-17 的 CG67 修复往 `@hyzyn/dsh-kit` 里加了 `stripEmptyFlowSequenceRoot` /
 *      `…RootLines` 两个导出，并让 codegraph / mcp / env / prompt 直接消费；
 *   2. kit 的版本仍停在 0.5.2（10-07 发的那份），`lib/` 却已重建入库——**仓库里的 0.5.2
 *      与 npm 上的 0.5.2 不是同一份代码**；
 *   3. 发版提交只 bump 了消费者，发布流对 kit@0.5.2 打印「已在 registry，跳过」，4 个消费者
 *      带着新 import 发了出去；
 *   4. 用户装 codegraph@0.6.9 + kit@0.5.2 → ESM 链接期报
 *      `does not provide an export named 'stripEmptyFlowSequenceRootLines'`，整条 entry 不激活。
 *
 * 既有闸门为什么全绿：kit 钉子闸只比**版本号**是否一致（本地 kit 的版本就是 0.5.2，自洽）；
 * 开发 / 测试走 workspace link，永远解析到本地新 kit；`artifacts:check` 只比「入库产物 vs
 * 重新构建」；`package-contents:check` 只比「声明的入口在不在 tarball 里」。**没有一道闸门
 * 问过「npm 上这个版本里的代码，和本仓此刻这份代码是不是同一份」。** 本模块就是那一问。
 *
 * ## 判据
 *
 * 对每个**已在 registry** 的目标：下载它的 tarball，把发布过的运行时文件与本仓同名文件
 * 逐字节比对；只要有一个不同（或一边有一边没有）就判红。所有目标在**任何包真正 publish 之前**
 * 先整体预检——避免「前面的包已经发出去、后面才发现 kit 漂了」的半截状态。
 *
 * **比什么**：`lib/**`（跳过 `*.map`）、`client.js`、`cordis.patch.yml`——用户真正加载的代码。
 * README / `scripts/`（tty、docker 随包发的端到端脚本）/ 类型声明之外的杂项不参与，避免
 * 「改个文档就得 bump 版本」把这道闸逼成噪音，最后被人 `--no-verify` 掉。
 *
 * **恒绿纪律**：一个运行时文件都没比到时按**失败**处理。本仓明令禁止「匹配不到就算过」
 * （见 docs/conventions.md 的守卫纪律）——读空实现恒绿比没有闸门更坏。
 *
 * ## 为什么不是「本地打一次包比 integrity」
 *
 * registry 上的 integrity 由发布时的 npm/pnpm 版本算出，本地换个 pnpm 版本就可能字节不同，
 * 那会把「工具版本不同」误报成「内容漂移」。下载 tarball 解包后逐文件比**内容**，与打包工具、
 * 平台都无关（比对不含 `.map`，避免 sourcemap 里的构建路径差异）。
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'

/** 顶层参与比对的运行时文件（存在才比）。 */
export const RUNTIME_TOP_LEVEL_FILES = ['client.js', 'cordis.patch.yml']

/** 不参与比对的扩展名：sourcemap 含构建期路径，跨平台不保证字节一致，且不影响运行。 */
const IGNORED_SUFFIXES = ['.map']

/**
 * 某个相对路径是否属于「运行时内容」。
 *
 * @param {string} relPath 包根下的相对路径（POSIX 或 Windows 分隔符都接受）
 * @returns {boolean}
 */
export function isRuntimeEntry(relPath) {
  const rel = relPath.split(sep).join('/')
  if (IGNORED_SUFFIXES.some((suffix) => rel.endsWith(suffix))) return false
  if (RUNTIME_TOP_LEVEL_FILES.includes(rel)) return true
  return rel.startsWith('lib/')
}

/**
 * 收集一个包目录下的全部运行时文件：`lib/**`（跳过 `.map`）+ 顶层 `client.js` / `cordis.patch.yml`。
 *
 * 返回 Map（相对路径 → 绝对路径）。用 Map 而不是数组：比对要按路径对齐，且「只有一边有」
 * 本身就是判据之一。
 *
 * @param {string} root 包根（本仓目录，或解包后的 `package/`）
 * @returns {Map<string, string>}
 */
export function collectRuntimeFiles(root) {
  const out = new Map()
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = `${prefix}/${entry.name}`
      const abs = join(dir, entry.name)
      if (entry.isDirectory()) walk(abs, rel)
      else if (entry.isFile() && isRuntimeEntry(rel)) out.set(rel, abs)
    }
  }
  const libDir = join(root, 'lib')
  if (existsSync(libDir)) walk(libDir, 'lib')
  for (const name of RUNTIME_TOP_LEVEL_FILES) {
    const abs = join(root, name)
    if (existsSync(abs)) out.set(name, abs)
  }
  return out
}

/** sha256（十六进制）。 */
function sha256File(absPath) {
  return createHash('sha256').update(readFileSync(absPath)).digest('hex')
}

/**
 * 比对两棵树里的运行时文件（纯函数，不联网、不碰受版本控制的文件——单测直接喂 fixture）。
 *
 * 三种差异都算漂移，因为三种都意味着「用户装到的代码不是本仓这份」：
 *   - `content`：两边都有、内容不同；
 *   - `missing-published`：本仓有、registry 上没有（本版本发布后又加了文件）；
 *   - `missing-local`：registry 上有、本仓没有（本版本发布后又删了文件）。
 *
 * @param {string} localDir 本仓包根
 * @param {string} publishedDir 解包后的发布树根（内含 `package/`，也可直接传 `package/`）
 * @returns {{ compared: number, differences: Array<{ path: string, kind: 'content'|'missing-published'|'missing-local' }> }}
 */
export function compareRuntimeTrees(localDir, publishedDir) {
  const packageDir = existsSync(join(publishedDir, 'package'))
    ? join(publishedDir, 'package')
    : publishedDir
  const local = collectRuntimeFiles(localDir)
  const published = collectRuntimeFiles(packageDir)
  const paths = [...new Set([...local.keys(), ...published.keys()])].sort()
  const differences = []
  let compared = 0
  for (const rel of paths) {
    const localFile = local.get(rel)
    const publishedFile = published.get(rel)
    if (localFile !== undefined && publishedFile !== undefined) {
      compared += 1
      if (sha256File(localFile) !== sha256File(publishedFile)) differences.push({ path: rel, kind: 'content' })
      continue
    }
    differences.push({
      path: rel,
      kind: localFile === undefined ? 'missing-local' : 'missing-published',
    })
  }
  return { compared, differences }
}

/**
 * 一包的非运行时时文件差异的中文说明（一条一行，供发布脚本打日志）。
 *
 * @param {Array<{ path: string, kind: string }>} differences
 * @param {number} [limit=10]
 * @returns {string[]}
 */
export function formatDifferences(differences, limit = 10) {
  const labels = {
    content: '内容不同',
    'missing-published': '本仓有、registry 上没有',
    'missing-local': 'registry 上有、本仓没有',
  }
  const lines = differences.slice(0, limit).map((d) => `${labels[d.kind] ?? d.kind}：${d.path}`)
  if (differences.length > limit) lines.push(`……另有 ${differences.length - limit} 个文件不同`)
  return lines
}

/**
 * 校验一个**已发布**版本的内容是否与本仓一致：下载 tarball → 解包 → 逐文件比。
 *
 * 联网 + 依赖系统 `curl` / `tar`（CI 的 ubuntu 与本机 macOS 都有）。解包目录用完即删。
 *
 * @param {object} input
 * @param {string} input.dir 本仓包根
 * @param {string} input.name 包名（只用于报错）
 * @param {string} input.version 版本号（只用于报错）
 * @param {{ dist?: { tarball?: string } }} input.manifest registry 上该版本的 manifest
 * @returns {{ ok: boolean, compared: number, differences: Array<{ path: string, kind: string }> }}
 */
export function verifyPublishedContent({ dir, name, version, manifest }) {
  const tarball = manifest?.dist?.tarball
  if (typeof tarball !== 'string' || tarball === '') {
    throw new Error(`${name}@${version} 的 manifest 里没有 dist.tarball，无法比对内容`)
  }
  const work = mkdtempSync(join(tmpdir(), 'dsh-published-content-'))
  try {
    const tgz = join(work, 'package.tgz')
    try {
      execFileSync(
        'curl',
        ['-sfL', '--retry', '3', '--max-time', '120', '-o', tgz, tarball],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      )
    } catch (error) {
      const stderr = String(error.stderr ?? '').trim()
      throw new Error(`${name}@${version} 的 tarball 下载失败（${tarball}）${stderr === '' ? '' : `：${stderr}`}`)
    }
    const extract = join(work, 'extract')
    mkdirSync(extract, { recursive: true })
    try {
      execFileSync('tar', ['-xzf', tgz, '-C', extract], { stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (error) {
      const stderr = String(error.stderr ?? '').trim()
      throw new Error(`${name}@${version} 的 tarball 解包失败${stderr === '' ? '' : `：${stderr}`}`)
    }
    if (!existsSync(join(extract, 'package'))) {
      throw new Error(`${name}@${version} 的 tarball 里没有 package/ 目录（打包形态变了？）`)
    }
    const { compared, differences } = compareRuntimeTrees(dir, extract)
    // compared === 0 不许当通过：读空实现是恒绿闸门的经典形态
    return { ok: compared > 0 && differences.length === 0, compared, differences }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

/**
 * 预检全部目标：把「已在 registry 的」逐个验内容，「没发过的」放进待发布清单。
 *
 * 依赖注入（`fetchManifest` / `verify`）让单测能喂假 registry，不必联网。
 *
 * @param {object} input
 * @param {Array<[string, string]>} input.targets 发布目标（`[目录, 包名]`，顺序即发布顺序）
 * @param {(dir: string) => string} input.pkgVersion 读该目标的版本号
 * @param {(name: string, version: string) => any} input.fetchManifest 取该版本的 manifest（不存在则抛错）
 * @param {(input: { dir: string, name: string, version: string, manifest: any }) => { ok: boolean, compared: number, differences: Array<{ path: string, kind: string }> }} input.verify
 * @returns {{ toPublish: Array<{ dir: string, name: string, version: string }>, skipped: Array<{ dir: string, name: string, version: string }>, drift: Array<{ dir: string, name: string, version: string, compared: number, differences: Array<{ path: string, kind: string }> }> }}
 */
export function preflightTargets({ targets, pkgVersion, fetchManifest, verify }) {
  const toPublish = []
  const skipped = []
  const drift = []
  for (const [dir, name] of targets) {
    const version = pkgVersion(dir)
    let manifest
    try {
      manifest = fetchManifest(name, version)
    } catch {
      // 读不到该版本 = 还没发过（或 registry 暂时不可读）。与旧行为一致：交给 publish 自己报
      // cannot-publish-over，比静默跳过安全。
      toPublish.push({ dir, name, version })
      continue
    }
    const result = verify({ dir, name, version, manifest })
    if (result.ok) skipped.push({ dir, name, version })
    else drift.push({ dir, name, version, compared: result.compared, differences: result.differences })
  }
  return { toPublish, skipped, drift }
}

/**
 * 把一个「已发布版本内容漂移」的预检结果打成可操作的日志行。
 *
 * @param {Array<{ dir: string, name: string, version: string, compared: number, differences: Array<{ path: string, kind: string }> }>} drift
 * @returns {string[]}
 */
export function describeDrift(drift) {
  const lines = []
  for (const item of drift) {
    lines.push(`  ✘ ${item.name}@${item.version}（${item.dir}）`)
    if (item.compared === 0) {
      lines.push('    —— 一个运行时文件都没比到：包结构变了（或 tarball 里没有 lib/），本闸拒绝放行')
    }
    for (const line of formatDifferences(item.differences)) lines.push(`    ${line}`)
  }
  return lines
}

/**
 * 读一个包目录的版本号。
 *
 * @param {string} dir 包目录（相对仓库根或绝对路径）
 * @returns {string}
 */
export function pkgVersion(dir) {
  return JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf8')).version
}

/**
 * 相对路径归一（仅测试与日志用；避免 Windows 分隔符混进比对键）。
 *
 * @param {string} from
 * @param {string} to
 * @returns {string}
 */
export function toPosixRelative(from, to) {
  return relative(from, to).split(sep).join('/')
}
