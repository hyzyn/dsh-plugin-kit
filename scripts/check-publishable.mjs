#!/usr/bin/env node
/**
 * 防回归：可发布包里不允许残留 workspace: 协议。
 *
 * workspace:* 只在 monorepo 内部有意义。pnpm publish 会把它替换成真实版本
 * （所以 npm 产物是对的），但从 git 子路径安装
 * （git+https://github.com/hyzyn/dsh-plugin-kit.git#main&path:packages/tty）
 * 时协议原样保留，消费者侧 pnpm 找不到同名 workspace 包就报
 * ERR_PNPM_WORKSPACE_PKG_NOT_FOUND —— 装不上，且报错指不到我们仓库。
 *
 * 检查范围：publish-targets.mjs 里全部待发布包（含 packages/all 与根 bundle）的
 * dependencies / devDependencies / peerDependencies / optionalDependencies。
 * devDependencies 通常不进产物，但 packages/all 这类聚合包会被 DSH 直接安装，
 * 一并拦住更省心。
 *
 * 用法：node scripts/check-publishable.mjs（CI 与 release workflow 均调用）
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { targets } from './publish-targets.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']

/*
 * 覆盖度检查：packages/* 下每个可发布包都必须出现在 publish-targets.mjs 里。
 * 清单是手工维护的，漏一行不会有任何报错——发布流程只是「静默跳过」它，用户永远
 * 装不到（v0.1.20 的 dsh-docker 就这么漏了一次：workflow 全绿，但 registry 上没有）。
 */
const uncovered = []
const listed = new Set(targets.map(([, name]) => name))
for (const entry of readdirSync(join(root, 'packages'), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const dir = 'packages/' + entry.name
  let pkg
  try {
    pkg = JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8'))
  } catch {
    continue // 没有 package.json 的目录不是工作区包
  }
  if (pkg.private === true || typeof pkg.name !== 'string' || pkg.name === '') continue
  if (!listed.has(pkg.name)) uncovered.push({ dir, name: pkg.name })
}

const offenders = []
for (const [dir, name] of targets) {
  let pkg
  try {
    pkg = JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8'))
  } catch (err) {
    offenders.push({ name, dir, field: '-', dep: '-', spec: `无法读取 package.json: ${err.message}` })
    continue
  }
  for (const field of DEP_FIELDS) {
    for (const [dep, spec] of Object.entries(pkg[field] ?? {})) {
      // workspace 协议形如 workspace:* / workspace:^ / workspace:~ / workspace:path
      if (/^workspace:/.test(String(spec))) {
        offenders.push({ name, dir, field, dep, spec: String(spec) })
      }
    }
  }
}

if (uncovered.length > 0) {
  console.error('✘ ' + uncovered.length + ' 个可发布包不在 scripts/publish-targets.mjs 里（发布流程会静默跳过它们）')
  console.error('')
  for (const u of uncovered) console.error('  ' + u.name + ' (' + u.dir + ')')
  console.error('')
  console.error('修复：在 scripts/publish-targets.mjs 的 targets 里按依赖序补一行（放在 packages/all 之前）。')
  process.exit(1)
}

if (offenders.length === 0) {
  console.log('✔ 可发布包检查通过：' + targets.length + ' 个包在发布清单内，无 workspace: 协议残留')
  process.exit(0)
}

console.error(`✘ ${offenders.length} 处 workspace: 协议残留（从 git 子路径安装会失败）\n`)
for (const o of offenders) {
  console.error(`  ${o.name} (${o.dir})`)
  console.error(`    ${o.field}.${o.dep} = ${o.spec}`)
}
console.error(
  '\n修复：把 workspace:* 换成真实版本（如 ^0.1.2）。packages/all 与根 package.json\n' +
    '的依赖由 scripts/aggregate.mjs 生成，改完别忘了确认它也不再写 workspace:*。',
)
process.exit(1)
