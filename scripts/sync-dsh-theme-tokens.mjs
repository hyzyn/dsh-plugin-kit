#!/usr/bin/env node
/**
 * 从**真宿主**生成/核对宿主主题的 token 名字快照
 * （[`scripts/fixtures/dsh-theme-tokens.json`](./fixtures/dsh-theme-tokens.json)）。
 *
 * ## 这份快照是给谁用的
 *
 * [`scripts/client-lint.mjs`](./client-lint.mjs) 的**检查 ③**：客户端半体里引用的每个
 * `--dsw-*` 都必须在宿主主题里真实存在。判据与四条防线为什么都拦不住那类错，写在
 * [`scripts/client-theme-tokens.mjs`](./client-theme-tokens.mjs) 的文件头。
 *
 * 快照必须**跑起来**才能拿到（宿主主题是一片 `body{…}` CSS 文本，没有 `.css` 产物），
 * 所以规则本身在静态层比对快照、快照由本脚本保鲜：CI 里没有宿主，这一档跑不了，于是
 * 它是**真机档**——与 `check-dsh-peers.mjs --app-boot` 同一档。
 *
 * ## 用法与退出码
 *
 * ```sh
 * node scripts/sync-dsh-theme-tokens.mjs            # 重新生成快照（需要本机装着 dsh）
 * node scripts/sync-dsh-theme-tokens.mjs --check    # 拿真宿主比对快照：0 = 一致，1 = 有差异
 * node scripts/sync-dsh-theme-tokens.mjs --print    # 只打印宿主里的名字（不写文件）
 * node scripts/sync-dsh-theme-tokens.mjs --theme <dsh-client-ui-theme/lib/client.js>
 * ```
 *
 * 退出码：`0` 成功 / `1` 有差异（`--check`）或生成失败 / `2` **找不到宿主**
 * （「这一档没跑」，与「跑出来有差异」分开——后者才是真的红）。
 *
 * 宿主位置由 [`scripts/lib/dsh-runtime-store.mjs`](./lib/dsh-runtime-store.mjs) 定位
 * （与 `link-dsh-runtime.mjs` 共用同一份候选列表）。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  diffThemeTokens,
  parseThemeTokenDefinitions,
  THEME_TOKEN_SNAPSHOT,
} from './client-theme-tokens.mjs'
import { dshStoreCandidates, dshVersionFromStore, findDshRuntimeStore, themeClientPath } from './lib/dsh-runtime-store.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const flag = (name) => {
  const index = argv.indexOf(name)
  return index === -1 ? undefined : argv[index + 1]
}
const checkOnly = argv.includes('--check')
const printOnly = argv.includes('--print')
const explicitTheme = flag('--theme')
const explicitStore = flag('--store')

/**
 * 定位主题客户端半体。
 *
 * @returns `{ file, store }`，或 `null`（本机没装宿主）。
 */
function locateTheme() {
  if (explicitTheme !== undefined) {
    return { file: resolve(explicitTheme), store: null }
  }
  const store = findDshRuntimeStore({ explicit: explicitStore })
  if (store === null) return null
  return { file: themeClientPath(store), store }
}

const located = locateTheme()
if (located === null) {
  console.error('[sync-dsh-theme-tokens] 找不到宿主 runtime（试过：')
  for (const candidate of dshStoreCandidates()) console.error('  ' + candidate)
  console.error('  ）——这一档需要本机装着 dsh；也可以用 --theme <路径> 直接指定主题文件。')
  process.exit(2)
}

let source
try {
  source = readFileSync(located.file, 'utf8')
} catch {
  console.error('[sync-dsh-theme-tokens] 读不到主题文件：' + located.file)
  console.error('  （宿主装了但这一版没有 dsh-client-ui-theme？可以先 --store 指定另一份 runtime store）')
  process.exit(2)
}

const tokens = parseThemeTokenDefinitions(source)
if (tokens.length === 0) {
  console.error('[sync-dsh-theme-tokens] 主题文件里一个 --dsw-* 定义都没解析到：' + located.file)
  console.error('  多半是宿主的主题布局换了（不再是 body{…} / body[data-ds-dark-theme]{…} 两段 CSS 文本）——')
  console.error('  先把 scripts/client-theme-tokens.mjs 的 parseThemeTokenDefinitions 跟到新形态，别生成空快照。')
  process.exit(1)
}

const dshVersion = located.store === null ? null : dshVersionFromStore(located.store)
const header = '[sync-dsh-theme-tokens] ' + String(tokens.length) + ' 个 token'
  + (dshVersion === null ? '' : '（dsh ' + dshVersion + '）')
  + ' ← ' + located.file

if (printOnly) {
  console.log(header)
  for (const token of tokens) console.log('  ' + token)
  process.exit(0)
}

const snapshotFile = join(repoRoot, THEME_TOKEN_SNAPSHOT)

if (checkOnly) {
  let known
  try {
    known = JSON.parse(readFileSync(snapshotFile, 'utf8')).tokens
  } catch {
    console.error('[sync-dsh-theme-tokens] 读不到快照 ' + THEME_TOKEN_SNAPSHOT + '——先不带 --check 跑一次生成。')
    process.exit(1)
  }
  const { missing, added } = diffThemeTokens(known, tokens)
  console.log(header)
  if (missing.length === 0 && added.length === 0) {
    console.log('[sync-dsh-theme-tokens] ✅ 快照与宿主逐字一致（' + String(known.length) + ' 个）')
    process.exit(0)
  }
  console.error('[sync-dsh-theme-tokens] ❌ 快照与宿主有差异：')
  if (missing.length > 0) {
    console.error('  快照有、宿主没有（' + String(missing.length) + ' 个）——我们可能在用已经不存在的名字：')
    for (const token of missing) console.error('    - ' + token)
  }
  if (added.length > 0) {
    console.error('  宿主有、快照没有（' + String(added.length) + ' 个）——宿主新增，快照过期：')
    for (const token of added) console.error('    + ' + token)
  }
  console.error('  处理：跑 `node scripts/sync-dsh-theme-tokens.mjs` 重新生成快照，')
  console.error('  并把命中 missing 的那些名字在客户端半体里一并改掉（client-lint 会告诉你改哪里）。')
  process.exit(1)
}

const payload = {
  $comment: '宿主主题（--dsw-*）名字快照：生成物，别手改；重新生成见 scripts/sync-dsh-theme-tokens.mjs。'
    + 'client-lint 的检查 ③ 用它拦「引用了宿主主题里不存在的样式变量」。',
  source: '@deepseek-ai/dsh-client-ui-theme/lib/client.js',
  dshVersion,
  generatedAt: new Date().toISOString(),
  generator: 'scripts/sync-dsh-theme-tokens.mjs',
  count: tokens.length,
  tokens,
}
writeFileSync(snapshotFile, JSON.stringify(payload, null, 2) + '\n')
console.log(header)
console.log('[sync-dsh-theme-tokens] 已写入 ' + THEME_TOKEN_SNAPSHOT)
