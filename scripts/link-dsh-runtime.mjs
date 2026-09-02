import { appendFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const runtimeFlag = args.findIndex((a) => a === '--runtime')
const runtimeRoot = runtimeFlag >= 0
  ? resolve(args[runtimeFlag + 1])
  : undefined
const dryRun = args.includes('--dry-run')
const logFile = join(root, 'node_modules', '.dsh-links.log')

function findDshRuntime() {
  const candidates = [
    join(process.env.HOME, '.npm-global', 'lib', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai'),
    join(process.env.HOME, '.dsh', 'profiles', 'node_modules', '@deepseek-ai'),
  ]
  const prefix = execSync('npm prefix -g', { encoding: 'utf8' }).trim()
  candidates.unshift(join(prefix, 'lib', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai'))
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
    if (stat.isSymbolicLink() && readlinkSync(link) === target) continue
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
    symlinkSync(target, link)
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
    '',
  ].join('\n'))
  console.log(`relinked ${linked} @deepseek-ai entries`)
  console.log(`audit log appended: ${logFile}`)
} else {
  console.log('dry-run: no changes applied')
}
if (skipped.length) {
  console.warn('removed (absent in dsh runtime, expect load-time errors if still imported):')
  for (const s of skipped) console.warn(`  - ${s.pkg}/@deepseek-ai/${s.name}`)
}
