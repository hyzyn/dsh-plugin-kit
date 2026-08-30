#!/usr/bin/env node
/**
 * 从 templates/hello 模板复制生成一个新插件包，并自动重跑聚合脚本。
 * 用法：node scripts/create-plugin.mjs <name> [id]
 *   <name>  包名后缀（小写字母/数字/连字符）→ @hyzyn/dsh-<name>、packages/<name>
 *   [id]    cordis 插件 id（默认与 <name> 相同）
 * 等价快捷方式：pnpm create-plugin <name> [id]
 */
import { cpSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packagesDir = join(root, 'packages')

const name = process.argv[2] ?? ''
const id = process.argv[3] ?? name
const slugRe = /^[a-z0-9][a-z0-9-]*$/

if (!slugRe.test(name) || !slugRe.test(id)) {
  console.error('用法：node scripts/create-plugin.mjs <name> [id]')
  console.error('  name/id 仅允许小写字母、数字、连字符，且以字母或数字开头')
  process.exit(1)
}

const srcDir = join(root, 'templates', 'hello')
const destDir = join(packagesDir, name)
if (!existsSync(join(srcDir, 'package.json'))) {
  console.error('模板 templates/hello 不存在')
  process.exit(1)
}
if (existsSync(destDir)) {
  console.error(`目标 packages/${name} 已存在`)
  process.exit(1)
}

cpSync(srcDir, destDir, { recursive: true })

const TEXT_EXTS = new Set(['.json', '.yml', '.yaml', '.ts', '.md'])
function rewrite(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      rewrite(full)
      continue
    }
    const ext = full.slice(full.lastIndexOf('.'))
    if (!TEXT_EXTS.has(ext)) continue
    const text = readFileSync(full, 'utf8')
      .replaceAll('@hyzyn/dsh-hello', `@hyzyn/dsh-${name}`)
      .replaceAll('id: hello', `id: ${id}`)
      .replaceAll("'hello'", `'${id}'`)
      .replaceAll('dsh-plugin-kit/hello', `dsh-plugin-kit/${name}`)
      .replaceAll('packages/hello', `packages/${name}`)
      .replace(/\bhello\b/g, id)
    writeFileSync(full, text)
  }
}
rewrite(destDir)

console.log(`[create-plugin] packages/${name} 已生成（包 @hyzyn/dsh-${name}，插件 id ${id}）`)

const agg = spawnSync(process.execPath, [join(root, 'scripts', 'aggregate.mjs')], { stdio: 'inherit' })
if (agg.status !== 0) {
  console.error('[create-plugin] 聚合清单生成失败，请手动运行 pnpm aggregate')
  process.exit(1)
}
