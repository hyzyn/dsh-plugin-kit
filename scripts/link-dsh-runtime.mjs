import { appendFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const runtimeFlag = args.findIndex((a) => a === '--runtime')
const runtimeRoot = runtimeFlag >= 0
  ? resolve(args[runtimeFlag + 1])
  : undefined
const dryRun = args.includes('--dry-run')
const logFile = join(root, 'node_modules', '.dsh-links.log')

/**
 * 目录链接：POSIX 用 symlink，Windows 用 **junction**。
 *
 * Windows 建**目录符号链接**要「开发者模式」或管理员（SeCreateSymbolicLinkPrivilege），
 * 普通用户直接 EPERM；而 junction 谁都能建。本仓的 Windows 真机流程
 * （scripts/windows/README.md）正是让普通用户跑这一步，用 symlink 会把整条链路卡在第一节。
 *
 * 代价：junction **只认绝对目标**，所以这里统一先 resolve；相应地「链接是否已指向目标」
 * 的判断也必须比较 resolve 后的路径（见 sameTarget），不能比字符串。
 */
const LINK_KIND = process.platform === 'win32' ? 'junction' : undefined

/** 建目录链接。target 可以是相对链接所在目录的路径（POSIX 下保持可搬迁的相对链接）。 */
function linkDirectory(target, link) {
  if (LINK_KIND === undefined) symlinkSync(target, link)
  else symlinkSync(resolve(dirname(link), target), link, LINK_KIND)
}

/** 链接（symlink 或 junction）当前是否已经指向 target。 */
function sameTarget(link, target) {
  try {
    if (!lstatSync(link).isSymbolicLink()) return false
    // junction 的 readlink 是绝对路径，且可能带 `\\?\` 扩展前缀
    const raw = readlinkSync(link).replace(/^\\\\\?\\/, '')
    return resolve(dirname(link), raw) === resolve(dirname(link), target)
  } catch {
    return false
  }
}

function findDshRuntime() {
  /*
   * HOME 在 Windows 上**不存在**（那边是 USERPROFILE），旧版直接 join(process.env.HOME, …)
   * 会在**构造候选数组的那一刻**就抛 ERR_INVALID_ARG_TYPE：连先 push 进去的 npm prefix
   * 候选都没机会被检查，脚本第一步就死（Windows 真机实测：就是这条）。
   * os.homedir() 两个平台都对。
   */
  const home = homedir()
  const candidates = []
  // npm 全局前缀：POSIX 在 <prefix>/lib/node_modules，Windows 直接在 <prefix>/node_modules
  try {
    const prefix = execSync('npm prefix -g', { encoding: 'utf8' }).trim()
    if (prefix !== '') {
      candidates.push(
        join(prefix, 'lib', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai'),
        join(prefix, 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai'),
      )
    }
  } catch {
    // npm 不在 PATH 时不致命：下面还有 home 兜底
  }
  candidates.push(
    join(home, '.npm-global', 'lib', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai'),
    join(home, '.dsh', 'profiles', 'node_modules', '@deepseek-ai'),
  )
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  throw new Error(`cannot locate dsh runtime @deepseek-ai store (tried: ${candidates.join(', ')})`)
}

const runtime = runtimeRoot ?? findDshRuntime()
const dshVersion = JSON.parse(readFileSync(join(runtime, '..', '..', 'package.json'))).version
console.log(`dsh runtime store: ${runtime}`)
console.log(`dsh version      : ${dshVersion}`)
if (dryRun) console.log('dry-run: printing changes without applying')

const changes = []
let linked = 0
let skipped = []

/**
 * @hyzyn/dsh-kit 一并链到本仓库 workspace 包（packages/kit）。registry 发布版
 * 的类型会经 .pnpm 解析出另一份 cordis（与插件侧 link 到 dsh 运行时的那份
 * 不同源），tsc 报 `Context` 互不兼容；workspace 版的 cordis 同样 link 到
 * 运行时，两边一致。pnpm install 会重建本链接，装完依赖后重跑本脚本即可。
 */
const kitDir = join(root, 'packages', 'kit')
const kitChanges = []
let kitLinked = 0
if (existsSync(kitDir)) {
  for (const pkg of readdirSync(join(root, 'packages'))) {
    if (pkg === 'kit') continue
    const pkgJsonPath = join(root, 'packages', pkg, 'package.json')
    if (!existsSync(pkgJsonPath)) continue
    let deps
    try {
      const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'))
      deps = { ...pkgJson.dependencies, ...pkgJson.devDependencies }
    } catch {
      continue
    }
    if (deps?.['@hyzyn/dsh-kit'] === undefined) continue
    const link = join(root, 'packages', pkg, 'node_modules', '@hyzyn', 'dsh-kit')
    const target = relative(dirname(link), kitDir)
    const label = `${pkg} node_modules/@hyzyn/dsh-kit`
    if (!existsSync(link)) {
      if (!dryRun) {
        mkdirSync(dirname(link), { recursive: true })
        linkDirectory(target, link)
        kitLinked++
        kitChanges.push({ pkg, before: '(missing)', after: target })
      }
      console.log(`- ${label}: (missing)  ->  ${target}`)
      continue
    }
    const stat = lstatSync(link)
    if (sameTarget(link, target)) continue
    const before = stat.isSymbolicLink()
      ? readlinkSync(link)
      : stat.isDirectory()
        ? '(real directory)'
        : '(real file)'
    if (dryRun) {
      console.log(`- ${label}:\n    before: ${before}\n    after : ${target}`)
      continue
    }
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      rmSync(link, { recursive: true, force: true })
    } else {
      rmSync(link, { force: true })
    }
    mkdirSync(dirname(link), { recursive: true })
    linkDirectory(target, link)
    kitLinked++
    console.log(`- ${label}:\n    before: ${before}\n    after : ${target}`)
    kitChanges.push({ pkg, before, after: target })
  }
}

for (const pkg of readdirSync(join(root, 'packages'))) {
  const scopeDir = join(root, 'packages', pkg, 'node_modules', '@deepseek-ai')
  if (!existsSync(scopeDir)) continue
  for (const name of readdirSync(scopeDir)) {
    const target = join(runtime, name)
    const link = join(scopeDir, name)
    const label = `${pkg} node_modules/@deepseek-ai/${name}`
    if (!existsSync(target)) {
      const entry = { pkg, name, before: readlinkSync(link), after: '(removed: absent in dsh runtime)' }
      skipped.push(entry)
      console.log(`- ${label}: ${entry.before}  ->  ${entry.after}`)
      if (!dryRun) rmSync(link, { recursive: true, force: true })
      continue
    }
    const stat = lstatSync(link)
    if (sameTarget(link, target)) continue
    const before = stat.isSymbolicLink()
      ? readlinkSync(link)
      : stat.isDirectory()
        ? '(real directory)'
        : '(real file)'
    if (dryRun) {
      console.log(`- ${label}:\n    before: ${before}\n    after : ${target}`)
      continue
    }
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      rmSync(link, { recursive: true, force: true })
    } else {
      rmSync(link, { force: true })
    }
    mkdirSync(dirname(link), { recursive: true })
    linkDirectory(target, link)
    linked++
    console.log(`- ${label}:\n    before: ${before}\n    after : ${target}`)
    changes.push({ pkg, name, before, after: target })
  }
}
if (!dryRun) {
  appendFileSync(logFile, [
    `[${new Date().toISOString()}] dsh ${dshVersion} runtime=${runtime}`,
    ...changes.map((c) => `  ${c.pkg} @deepseek-ai/${c.name}\n    before: ${c.before}\n    after : ${c.after}`),
    ...skipped.map((s) => `  ${s.pkg} @deepseek-ai/${s.name} REMOVED (absent in runtime, before: ${s.before})`),
    ...kitChanges.map((c) => `  ${c.pkg} @hyzyn/dsh-kit\n    before: ${c.before}\n    after : ${c.after}`),
    '',
  ].join('\n'))
  console.log(`relinked ${linked} @deepseek-ai entries`)
  if (kitLinked > 0) console.log(`relinked ${kitLinked} @hyzyn/dsh-kit entries (workspace packages/kit)`)
  console.log(`audit log appended: ${logFile}`)
} else {
  console.log('dry-run: no changes applied')
}
if (skipped.length) {
  console.warn('removed (absent in dsh runtime, expect load-time errors if still imported):')
  for (const s of skipped) console.warn(`  - ${s.pkg}/@deepseek-ai/${s.name}`)
}
