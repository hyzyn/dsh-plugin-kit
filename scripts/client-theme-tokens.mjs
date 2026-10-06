/**
 * **宿主主题变量规则**（供 `scripts/client-lint.mjs` 的检查四用）：
 * 客户端半体里引用的每个 `--dsw-*` 名字，都必须在宿主主题里**真实存在**。
 *
 * ## 为什么这是一条正确性判据，而不是整洁度
 *
 * CSS 变量被 `var()` 引用而**该变量未定义**时，声明在**计算值阶段**无效；若那条声明是
 * `border` 这类 **shorthand**，它的**所有** longhand 一起回落到 `unset`——`border-style`
 * 的初始值就是 `none`。于是「写错一个变量名」的后果不是「退回默认边框颜色」，而是
 * **整条边框消失**；`background:var(--…)` 同理变成透明。
 *
 * 2026-10-06 在本分支实测到两处**当时仍在**的实例（修复见同日的 `fix(client)` 提交）：
 *
 *   - `packages/codegraph/client-src/index.js` 的 `.cg_badgeWarn` / `.cg_warn` 引用了
 *     `--dsw-alias-state-warning-primary`——真名是 `state-warn-primary`，**只差一个 `ing`**；
 *   - `packages/mcp/client.js` 的 `.mX_toolItem` 引用 `--dsw-alias-separator-primary`
 *     ——`separator` 这一族在宿主 403 个 token 里**一个都没有**（真名 `--dsw-alias-border-l2`）。
 *
 * 后者是 `border-bottom` 简写的一部分：**分隔线整条消失**，而布局类声明（`display` / `gap` /
 * `max-width` / 字号）不含变量、照常生效——于是现场看起来是「排版是对的，就是什么都没有」，
 * 最容易被当成「样式没加载」往错方向查。
 *
 * ## 为什么四种防线都没拦住（这才是要静态检查的理由）
 *
 *   - `tsc` 不查 CSS 变量名（它在**字符串字面量**里）；
 *   - `check-i18n` / `client-lint` 原先只查名字解析与宿主地址来源，**零信号**；
 *   - 各包的 preview harness 用的是**自己造的假主题**——`packages/codegraph/scripts/preview-card.mjs`
 *     里就写着 `--dsw-alias-state-warning-primary`，**预览因此一直是"对的"、只有真机是错的**；
 *   - 真机冒烟（CDP）只断言**文案与控件值**，一个没有边框的输入框照样满足断言。
 *
 * 所以这条判据必须在**静态层**：拿一份宿主主题的名字快照（
 * [`scripts/fixtures/dsh-theme-tokens.json`](./fixtures/dsh-theme-tokens.json)，由
 * [`scripts/sync-dsh-theme-tokens.mjs`](./sync-dsh-theme-tokens.mjs) 从真宿主生成）比对。
 *
 * ## 快照的保鲜
 *
 * 快照是**生成物**：宿主换版本、宿主自己改名 token 时它不会自己变。
 * `node scripts/sync-dsh-theme-tokens.mjs --check` 在有宿主时逐字比对快照与宿主并报差异
 * （真机档，不进 CI——与 `check-dsh-peers.mjs --app-boot` 同一档）。**不改手上的快照**：
 * 要改就跑那个脚本重新生成，连带把客户端半体里还在用旧名字的地方一起改掉。
 *
 * 本文件**不写 shebang**（要被 vitest import，见 `scripts/check-kit-pins.mjs` 的同款注释）。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** 快照相对仓根的位置（生成物；改动走 `scripts/sync-dsh-theme-tokens.mjs`）。 */
export const THEME_TOKEN_SNAPSHOT = 'scripts/fixtures/dsh-theme-tokens.json'

/** 命中时要贴给使用者的正确写法（`client-lint` 直接打印它）。 */
export const THEME_TOKEN_RULE_HINT = '样式变量只能用宿主主题里**真实存在**的名字：'
  + '边框 --dsw-alias-border-l1..l4、面 --dsw-alias-bg-base / --dsw-alias-bg-layer-1..3、'
  + '输入框底色 --dsw-specific-input-major、文字 --dsw-alias-label-primary / -secondary / -tertiary。'
  + '写错一个名字的后果不是「退回默认样式」，而是那条 border/background 声明**整条作废**'
  + '（shorthand 的所有 longhand 回落 unset）——框会直接消失。'
  + '完整名字表：scripts/fixtures/dsh-theme-tokens.json（由 node scripts/sync-dsh-theme-tokens.mjs 生成）。'

const TOKEN = '--dsw-[a-z0-9-]+'

/**
 * 本规则要扫的客户端文件：`client-src/**` 下的 `.js` **与 `.css`**，没有 `client-src/` 就退回
 * 裸 `client.js`。**与 `client-host-url.mjs` 的 `listClientSourceFiles` 刻意不同**：
 *
 *   - 那条走 AST 查地址来源，只能吃 JS，收 `.css` 没有意义；
 *   - 这条查的是**字符串里的名字**，而样式可以住在独立 `.css` 里——docker 与 tty 就是这么
 *     组织的（`client-src/docker.css` 24 处、`client-src/tty.css` 37 处）。
 *
 * 2026-10-06 实测到的形状：只查 `.js` 时 docker 报「样式变量 **0** 处」——而本仓明令
 * **「0 命中 = 恒绿闸门，比没有还坏」**。那份 `.css` 里的名字当时**一个都没被检查过**，
 * 也就是说 docker 的样式这道防线是空的（实测那 24 处恰好都是真名，但这是运气不是保证）。
 */
export function listThemeScanFiles(root) {
  const sourceDir = join(root, 'client-src')
  if (existsSync(sourceDir)) {
    return readdirSync(sourceDir, { recursive: true })
      .map((entry) => join(sourceDir, entry))
      .filter((file) => /\.(js|css)$/.test(file) && statSync(file).isFile())
  }
  const bare = join(root, 'client.js')
  return existsSync(bare) ? [bare] : []
}

/**
 * 从宿主主题客户端半体的源码里抽出所有**定义过**的 token 名（明暗两档取并集）。
 *
 * 只认「名字后面跟着冒号」的位置（`--dsw-x:`），所以同一份文件里 `var(--dsw-x)` 那类**引用**
 * 不会被当成定义——这正是它能当判据的原因。
 *
 * @param source - 主题 `lib/client.js` 的文本。
 * @returns 去重且排序的 token 名数组。
 */
export function parseThemeTokenDefinitions(source) {
  const found = new Set()
  for (const match of String(source).matchAll(new RegExp('(' + TOKEN + ')\\s*:', 'g'))) {
    found.add(match[1])
  }
  return [...found].sort()
}

/**
 * 扫一段客户端半体源码里**引用**了哪些 `--dsw-*`，并给出定位。
 *
 * 与 {@link parseThemeTokenDefinitions} 对称：**定义位**（`--dsw-x:`，客户端半体里也可能
 * 自己定义局部变量）不算引用；`var(--dsw-x, fallback)` 仍算——它有 fallback，不会失踪，
 * 但会**静默降级**成另一个颜色，跑偏得更隐蔽（codegraph 那次就是这样）。
 *
 * @param text - 客户端半体源码（`client.js` 或 `client-src/*.js`）。
 * @returns `{ token, line, col, hasFallback }[]`（按出现顺序）。
 */
export function scanThemeTokenUses(text) {
  const uses = []
  const lines = String(text).split('\n')
  for (const [index, line] of lines.entries()) {
    for (const match of line.matchAll(new RegExp(TOKEN, 'g'))) {
      const token = match[0]
      const after = line.slice(match.index + token.length)
      if (/^\s*:/.test(after)) continue // 定义位，不是引用
      uses.push({
        token,
        line: index + 1,
        col: match.index + 1,
        hasFallback: /^\s*,/.test(after),
      })
    }
  }
  return uses
}

/** 一行人类可读的定位串（`client-lint` 与用例共用同一份措辞）。 */
export function describeThemeTokenUse(use) {
  return (use.hasFallback ? '引用了一个宿主主题里不存在的样式变量（有 fallback，会静默降级）' : '引用了一个宿主主题里不存在的样式变量')
    + ' ' + use.token
}

/**
 * 读快照。**读不到就抛**——快照缺失意味着这道闸门整体停摆，静默跳过是这里最糟的行为。
 *
 * @param repoRoot - 仓根（默认取本文件所在目录的上一级）。
 * @returns `{ tokens: Set<string>, meta: object }`。
 */
export function loadThemeTokenSnapshot(repoRoot = join(import.meta.dirname, '..')) {
  const file = join(repoRoot, THEME_TOKEN_SNAPSHOT)
  let raw
  try {
    raw = readFileSync(file, 'utf8')
  } catch {
    throw new Error('读不到宿主主题 token 快照 ' + THEME_TOKEN_SNAPSHOT
      + '：它是生成物，跑 `node scripts/sync-dsh-theme-tokens.mjs` 生成（需要本机装着 dsh）。')
  }
  const parsed = JSON.parse(raw)
  const tokens = Array.isArray(parsed.tokens) ? parsed.tokens : []
  if (tokens.length === 0) {
    throw new Error(THEME_TOKEN_SNAPSHOT + ' 里没有 tokens——空快照会让这道闸门恒绿，'
      + '跑 `node scripts/sync-dsh-theme-tokens.mjs` 重新生成。')
  }
  return { tokens: new Set(tokens), meta: parsed }
}

/**
 * 比对「手上的快照」与「刚从宿主读到的名字」，供 `sync-dsh-theme-tokens.mjs --check` 用。
 *
 * @param known - 快照里的名字。
 * @param fresh - 真宿主里的名字。
 * @returns `{ missing, added }`——`missing` = 快照有而宿主没有（**我们可能在用已经没了的名字**），
 *   `added` = 宿主有而快照没有（宿主新增，快照过期）。
 */
export function diffThemeTokens(known, fresh) {
  const knownSet = known instanceof Set ? known : new Set(known)
  const freshSet = fresh instanceof Set ? fresh : new Set(fresh)
  return {
    missing: [...knownSet].filter((token) => !freshSet.has(token)).sort(),
    added: [...freshSet].filter((token) => !knownSet.has(token)).sort(),
  }
}
