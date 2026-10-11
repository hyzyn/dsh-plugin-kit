#!/usr/bin/env node
/**
 * 从 templates/hello 模板复制生成一个新插件包，并自动重跑聚合脚本。
 * 用法：node scripts/create-plugin.mjs <name> [id]
 *   <name>  包名后缀（小写字母/数字/连字符）→ @hyzyn/dsh-<name>、packages/<name>
 *   [id]    cordis 插件 id（默认与 <name> 相同）
 * 等价快捷方式：pnpm create-plugin <name> [id]
 */
import { cpSync, existsSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

import { applyKitPin, readKitVersion } from './create-plugin-manifest.mjs'

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

// 模板测试文件名带 hello 字样；上面的文本替换只改内容不改文件名，这里同步改名，
// 否则 packages/<name>/test/hello.test.ts 会一直叫 hello。
const templateTest = join(destDir, 'test', 'hello.test.ts')
if (existsSync(templateTest)) renameSync(templateTest, join(destDir, 'test', `${name}.test.ts`))

// kit 钉子**现算**：模板里的字面值不是运行期事实（理由见 create-plugin-manifest.mjs 的文件头）。
// 失败要在这里就停——静默产出一个带着旧钉子（或没有钉子）的包，正是这道改动要消灭的形态。
const manifestPath = join(destDir, 'package.json')
try {
  const kitVersion = readKitVersion(root)
  writeFileSync(manifestPath, applyKitPin(readFileSync(manifestPath, 'utf8'), kitVersion))
  console.log(`[create-plugin] packages/${name} 已生成（包 @hyzyn/dsh-${name}，插件 id ${id}，kit 钉子 ${kitVersion}）`)
} catch (error) {
  console.error(`[create-plugin] kit 钉子写入失败：${error.message}`)
  console.error(`[create-plugin] packages/${name} 只生成了一半，删掉它再重试`)
  process.exit(1)
}

const agg = spawnSync(process.execPath, [join(root, 'scripts', 'aggregate.mjs')], { stdio: 'inherit' })
if (agg.status !== 0) {
  console.error('[create-plugin] 聚合清单生成失败，请手动运行 pnpm aggregate')
  process.exit(1)
}
