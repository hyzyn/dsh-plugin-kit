#!/usr/bin/env node
/**
 * codegraph CG35 防回归：`DSH_HOME` 的推导（含 `~` 展开与 resolve）在**整个仓库只允许有一份**，
 * 即 `@hyzyn/dsh-kit` 的 `dshHome()`（packages/kit/src/services.ts）。
 *
 * 为什么要有这道闸：kit 0.4.1 给 `dshHome()` 加了归一化（`~` 展开 + resolve，与 DSH
 * 运行时 loader 同口径），而全仓还有 8 处插件各自手抄的 raw 副本——归一化只落在一处
 * 时，`DSH_HOME=~/x` 会让 codegraph 写 `<home>/x/cordis.patch.yml`、dsh-mcp 写
 * `~/x/cordis.patch.yml`：改动之前双方至少写同一个（错误的）路径，改动之后反而各写
 * 各的。2026-09 的修复波已把 8 处副本全部统一到 kit，本脚本保证它不再回潮。
 *
 * 判据刻意只匹配「自己推导回退值」的形状（`DSH_HOME?.trim() || …`）——插件里直接
 * 读 `process.env.DSH_HOME` 做别的用途（注释、透传、展示）不受影响。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const RAW_DERIVATION = /DSH_HOME\?\.trim\(\)\s*\|\|/

const offenders = []
for (const name of readdirSync(join(root, 'packages'))) {
  const srcDir = join(root, 'packages', name, 'src')
  try {
    if (!statSync(srcDir).isDirectory()) continue
  } catch {
    continue
  }
  if (name === 'kit') continue
  for (const file of readdirSync(srcDir)) {
    if (!/\.(ts|mts|cts|js|mjs)$/.test(file)) continue
    const text = readFileSync(join(srcDir, file), 'utf8')
    for (const [index, line] of text.split('\n').entries()) {
      if (RAW_DERIVATION.test(line)) offenders.push(`packages/${name}/src/${file}:${index + 1}: ${line.trim()}`)
    }
  }
}

if (offenders.length > 0) {
  console.error('[check-dsh-home] 发现绕过 kit 的 DSH_HOME 推导（应改用 `import { dshHome } from \'@hyzyn/dsh-kit\'`）：')
  for (const offender of offenders) console.error('  ' + offender)
  console.error('kit 的 dshHome() 带 ~ 展开 + resolve；各写各的副本会在 DSH_HOME 取 ~/x / 相对值时')
  console.error('让不同插件写/读不同的配置目录（codegraph DEFECTS CG35）。')
  process.exit(1)
}
console.log('[check-dsh-home] 通过：DSH_HOME 推导只存在于 @hyzyn/dsh-kit')
