/**
 * 「宿主 runtime 的 `@deepseek-ai` 存储目录在哪」——**一件事实，两处消费**：
 *
 *   - [`scripts/link-dsh-runtime.mjs`](../link-dsh-runtime.mjs)：把运行时包链进各包的
 *     `node_modules`（开发环境第一步，见 [docs/link-dsh-runtime.md](../../docs/link-dsh-runtime.md)）；
 *   - [`scripts/sync-dsh-theme-tokens.mjs`](../sync-dsh-theme-tokens.mjs)：从宿主主题里取
 *     `--dsw-*` 名字快照，供 `client-lint` 的主题变量检查用。
 *
 * ## 为什么抽出来
 *
 * 这段候选列表**只该有一份**：两处各写一份时，下次换 npm prefix、换 profile 布局只会改一处，
 * 另一处静默失效——而它失效的表现恰好是「守卫找不到宿主 → 那一档没跑」，是**最不该静默**的
 * 那一种失效（与 `scripts/client-lint.mjs` 反复强调的「恒绿闸门」同一个道理）。
 *
 * 文件名与 [`live-harness.mjs`](./live-harness.mjs) 同族：`scripts/lib/` 是 L0 脚本的公共件。
 *
 * ## 候选列表里两个平台的真机教训（原样保留，别简化）
 *
 * - **HOME 在 Windows 上不存在**（那边是 `USERPROFILE`）：直接 `join(process.env.HOME, …)`
 *   会在**构造候选数组的那一刻**就抛 `ERR_INVALID_ARG_TYPE`，连先 push 进去的 npm prefix
 *   候选都没机会被检查，脚本第一步就死（Windows 真机实测）。`os.homedir()` 两个平台都对。
 * - **npm 全局前缀**：POSIX 在 `<prefix>/lib/node_modules`，Windows 直接在
 *   `<prefix>/node_modules`——两边都要进候选。
 *
 * ## 依赖注入
 *
 * `home` / `npmPrefix` 都可注入（`npmPrefix: null` = npm 不在 PATH），
 * 于是 [`scripts/test/dsh-runtime-store.test.ts`](../test/dsh-runtime-store.test.ts)
 * 在任何平台上都能把这两条分支跑一遍——不靠本机恰好装着什么。
 *
 * 本文件**不写 shebang**：它要被 vitest import（本仓实测过「被测试 import 的 `.mjs` 带
 * shebang + CRLF → 整份套件加载失败」，见 `scripts/check-kit-pins.mjs` 的同款注释）。
 */
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** `npm prefix -g`；npm 不在 PATH 时返回 `null`（不致命，还有 home 兜底）。 */
function readNpmPrefix() {
  try {
    const prefix = execSync('npm prefix -g', { encoding: 'utf8' }).trim()
    return prefix === '' ? null : prefix
  } catch {
    return null
  }
}

/**
 * 按「先 npm 全局、后 home 兜底」的顺序列出候选存储目录。
 *
 * @param options.home - 用户主目录（默认 `os.homedir()`）。
 * @param options.npmPrefix - npm 全局前缀；`undefined` = 现算，`null` = 当作没有。
 * @returns 候选路径数组（**不判断存在性**，顺序即优先级）。
 */
export function dshStoreCandidates({ home = homedir(), npmPrefix } = {}) {
  const prefix = npmPrefix === undefined ? readNpmPrefix() : npmPrefix
  const candidates = []
  if (prefix !== null && prefix !== '') {
    candidates.push(
      join(prefix, 'lib', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai'),
      join(prefix, 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai'),
    )
  }
  candidates.push(
    join(home, '.npm-global', 'lib', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai'),
    join(home, '.dsh', 'profiles', 'node_modules', '@deepseek-ai'),
  )
  return candidates
}

/**
 * 找出真实存在的宿主 runtime 存储目录。
 *
 * @param options.explicit - 直接指定的路径（给了就不再搜索；不存在返回 `null`）。
 * @param options.home - 见 {@link dshStoreCandidates}。
 * @param options.npmPrefix - 见 {@link dshStoreCandidates}。
 * @param options.exists - 存在性判定（默认 `fs.existsSync`，测试可注入）。
 * @returns 绝对路径，或 `null`（没装 / 找不到——**调用方决定这是致命还是跳过**）。
 */
export function findDshRuntimeStore({ explicit, home, npmPrefix, exists = existsSync } = {}) {
  if (explicit !== undefined) return exists(explicit) ? explicit : null
  return dshStoreCandidates({ home, npmPrefix }).find((candidate) => exists(candidate)) ?? null
}

/**
 * 宿主**主题客户端半体**在存储目录里的相对位置。
 *
 * 主题 token（`--dsw-*`）就是在这一份 `lib/client.js` 里以 `body{…}` / `body[data-ds-dark-theme]{…}`
 * 两段 CSS 文本定义的——没有单独的 `.css` 产物、也不在 `package.json` 里。
 */
export function themeClientPath(store) {
  return join(store, 'dsh-client-ui-theme', 'lib', 'client.js')
}

/**
 * 从存储目录反推宿主版本：`<store>/../../package.json` 就是 `@deepseek-ai/dsh` 自己的
 * `package.json`（`<store>` = `…/dsh/node_modules/@deepseek-ai`）。取不到时返回 `null`
 * ——`~/.dsh/profiles/node_modules/@deepseek-ai` 这个候选下没有这一层，属于正常情况。
 */
export function dshVersionFromStore(store) {
  try {
    return JSON.parse(readFileSync(join(store, '..', '..', 'package.json'), 'utf8')).version ?? null
  } catch {
    return null
  }
}
