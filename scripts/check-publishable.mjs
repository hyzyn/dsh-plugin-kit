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
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { targets } from './publish-targets.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']

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

if (offenders.length === 0) {
  console.log(`✔ 可发布包依赖检查通过：${targets.length} 个包，无 workspace: 协议残留`)
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
