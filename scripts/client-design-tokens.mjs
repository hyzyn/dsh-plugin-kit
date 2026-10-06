/**
 * 客户端半体的**设计令牌**规则（纯逻辑，供 `scripts/client-lint.mjs` 的检查五 / 检查六调用）。
 *
 * 两条规则，与检查四（`client-theme-tokens.mjs`，`--dsw-*` 名字必须在宿主主题里存在）同源：
 * 检查四管「宿主主题里有没有这个名字」，本模块管「**本包自己的**名字有没有定义」与
 * 「**几何**有没有跟宿主的设计系统对齐」。
 *
 * ## 检查五：非宿主前缀的自定义属性，必须先在本包客户端半体里定义
 *
 * 2026-10-06 实测到三处（本分支修复前仍在）：
 *
 *   - `packages/tty/client-src/tty.css` 的 `.tt_segmentedBtn:hover` 引用 `--tt-label-1`
 *     ——**无 fallback**，而 `--tt-label-1` 从未定义（同族的真名是 `--tt-label` /
 *     `--tt-label-2` / `--tt-label-3`）；
 *   - 同文件 `.dshkit_badge` 引用 `--tt-bg-2`——有 fallback，**静默降级**成 `--dsw-alias-bg-layer-2`；
 *   - `packages/docker/client-src/docker.css` 的 `.dshkit_badge` 引用 `--dk-bg-2`——同上。
 *
 * 后果与检查四**完全同源**（这也是它并入 ④ 的口径而不是单开一条的理由）：CSS 变量在计算值
 * 阶段无效时，若该声明是 shorthand，其所有 longhand 一起回落 `unset`。本机 headless Chrome
 * 154 实测（见 `scripts/test/client-design-tokens.test.ts` 的对照断言）：
 *
 *   无 fallback 的 `color: var(--tt-label-1)`      → 计算值 `rgb(0, 0, 0)`（声明整条作废）
 *   有 fallback 的 `background: var(--dk-bg-2, X)` → 静默取 X（更隐蔽：看起来「有颜色」）
 *
 * 而「三处都在 `client-src/*.css` 里」正是它躲过所有既有防线的机制——检查四扫的是 `--dsw-*`
 * 名字（这三处不是），tsc 不查 CSS 变量名，preview 夹具用的是自己造的假主题，冒烟只断言文案
 * 与控件值。**改名前先看这一条**：`--dk-pad-cardHead` 是真名（docker.css 自己定义），首轮粗扫
 * 用前缀截断把它误报成 `--dk-pad-card`——所以本模块按 `var(...)` 的**配对括号**取全名，不按前缀切。
 *
 * ## 检查六：胶囊 / 正圆必须配对 `corner-shape: round`
 *
 * 宿主 `ui-theme` 的 `corner-shape.css` 在 `@supports (corner-shape:superellipse(1.5))` 里对
 * **所有元素**设 `corner-shape: var(--dsw-corner-shape)`（= `superellipse(1.5)`）。本机
 * Chrome 154 实测该 at-rule **生效**，于是**没配对的胶囊与正圆会被超椭圆拉变形**：
 *
 *   `border-radius:999px`（无 corner-shape）→ 计算值 `superellipse(1.5)`  ← 胶囊变形
 *   `border-radius:50%`  （无 corner-shape）→ 计算值 `superellipse(1.5)`  ← 正圆变形
 *   `border-radius:999px` + `corner-shape:round` → 计算值 `superellipse(1)` ← 圆回来了
 *
 * 宿主自己的 `Pill` / `Tag` / `Switch` / `StateDot` / `ImageLightbox` 都**成对写**
 * `border-radius: 999px` + `corner-shape: round`（`ui-primitives` 里 7 处，无一例外）。
 * 而本仓 10 个客户端半体此前**一处都没有**。
 *
 * **刻意跳过 `::-webkit-scrollbar*` 伪元素**：宿主 `scrollbar.css` 已经给
 * `::-webkit-scrollbar-thumb` 写了 `corner-shape: round`，插件再写一遍是重复；而插件里那些
 * `::-webkit-scrollbar-thumb` 规则正是「覆盖宿主皮肤」用的，配对与否由宿主那条兜底。
 *
 * 本文件**不写 shebang**（要被 vitest import，见 `scripts/check-kit-pins.mjs` 的同款注释）。
 */

/**
 * 宿主**拥有**的非 `--dsw-` 前缀：这些是宿主契约变量（主题 README 明确列出可被消费方重绑），
 * 插件引用它们不算「未定义」。
 *
 * 为什么用**显式清单**而不是正则碰运气：本仓的判据是「该有的东西找不到就报缺失」，放宽范围
 * 会让真正的病名溜过去。清单只收宿主文档点过名的三个前缀，其余一律要求本包自己定义。
 * 实测（2026-10-06）：本仓 10 个客户端半体对这三个前缀的引用数为 **0**，所以这份清单目前
 * 不豁免任何一处——它是给未来用的，不是给现在开的口子。
 */
export const HOST_OWNED_VAR_PREFIXES = ['--dsh-', '--ds-', '--dsl-']

/** 命中检查五时要贴给使用者的正确写法（`client-lint` 直接打印它）。 */
export const UNDEFINED_VAR_RULE_HINT = '非宿主前缀的自定义属性，必须先在本包客户端半体里定义：'
  + '每个 `var(--X)` 里的 X 要么是宿主主题的 `--dsw-*`（那份名字表见 '
  + 'scripts/fixtures/dsh-theme-tokens.json），要么在本包的 client-src/** 或 client.js 里'
  + '有 `--X: <值>` 的定义位。写错/漏定义的后果与检查四同源：**无 fallback 时那条声明整条作废**'
  + '（shorthand 的所有 longhand 回落 unset），有 fallback 时静默降级成另一个值。'
  + '宿主自己拥有的前缀（' + HOST_OWNED_VAR_PREFIXES.join(' / ') + '）不受这条约束。'

/** 命中检查六时要贴给使用者的正确写法。 */
export const CAPSULE_CORNER_RULE_HINT = '胶囊（`border-radius: 999px`）与正圆（`border-radius: 50%`）'
  + '必须与 `corner-shape: round` 成对声明——宿主 `corner-shape.css` 在 '
  + '`@supports (corner-shape: superellipse(1.5))` 里给所有元素设了全局超椭圆，'
  + '**不配对就会把胶囊和正圆拉变形**。范例（宿主 ui-primitives 的 Pill / Tag / Switch 都这么写）：'
  + '`border-radius: 999px; corner-shape: round;`。'
  + '值为 999px 的本包私有令牌（如 --tt-r-pill / --dk-r-pill）同样算胶囊。'

/** 一个自定义属性名的全形（`--` 开头，字母数字与连字符）。 */
const VAR_NAME = '--[A-Za-z0-9-]+'

/**
 * 剥掉注释，其余字节**保持原位**（换行保留）——这样行号列号仍按原文计算，而注释里的示例
 * 代码不会骗到扫描。与 `client-click-scope.mjs` 的 `maskComments` 同一套做法。
 *
 * @param source - 源码文本。
 * @returns 与 `source` 等长、注释被空格覆盖的文本。
 */
export function maskComments(source) {
  const text = String(source)
  let out = ''
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    const next = text[i + 1]
    if (ch === '/' && next === '*') {
      const close = text.indexOf('*/', i + 2)
      const end = close === -1 ? text.length : close + 2
      out += text.slice(i, end).replace(/[^\n]/g, ' ')
      i = end - 1
      continue
    }
    if (ch === '/' && next === '/') {
      const nl = text.indexOf('\n', i)
      const end = nl === -1 ? text.length : nl
      out += ' '.repeat(end - i)
      i = end - 1
      continue
    }
    out += ch
  }
  return out
}

/**
 * 把一条规则的「前导文本」归一成选择器。
 *
 * 为什么要这一步：本仓的 CSS 有两种住法——独立的 `.css` 文件（docker / tty），以及**内联在
 * JS 字符串字面量里**（其余手写包）。后者的前导文本会带上数组语法与字符串引号，例如
 * `const CSS = [\n      '` + `.dshkit_badge`（第一条规则）或 `',\n      '` + `.rss_badge`
 * （后续规则）。2026-10-06 首版没做归一，于是每个真实站点都会额外产出一个选择器为 `'` 的
 * 假规则（实测把 38 处真站点报成 76 处），且**每条规则的第一条**还会带上整段 JS 前缀。
 *
 * 归一三步：
 *   1. 从最后一个 `}` 之后取起（那才是本规则的前导）；
 *   2. 若剩下的文本带 JS 包装（以 `const` / 引号 / 逗号开头），从**最后一个引号**之后取起
 *      ——引号里才是 CSS。判据刻意用「开头长什么样」而不是「哪里有引号」：CSS 属性选择器
 *      `[data-level="WARN"]` 里也有引号，按后者切会把选择器截断；
 *   3. 剥掉残余的空白与数组标点（`,` `]`）。
 *
 * **刻意不剥 `[`**：属性选择器以它开头，剥了会把选择器截断成 `]`。
 *
 * @param prelude - `{` 之前的原始文本。
 * @returns 归一后的选择器（可能为空串——空串调用方应跳过）。
 */
export function normalizePrelude(prelude) {
  let text = String(prelude).slice(String(prelude).lastIndexOf('}') + 1)
  // JS 包装：数组字面量（`const CSS = [`）或字符串拼接（`',` + 换行 + `'`）。
  if (/^\s*(?:const|let|var)\b/.test(text) || /^\s*['"`]/.test(text) || /^\s*,/.test(text)) {
    const lastQuote = Math.max(text.lastIndexOf("'"), text.lastIndexOf('"'), text.lastIndexOf('`'))
    if (lastQuote !== -1) text = text.slice(lastQuote + 1)
  }
  return text.replace(/^[\s'",]+/u, '').replace(/\s+/g, ' ').trim()
}

/**
 * 极简 CSS 规则扫描：`@media` / `@keyframes` 这类带嵌套块的 at-rule 往里递归，普通规则收成
 * `{ selector, decls }`。
 *
 * **同一份实现只有这一处**：`packages/tty/test/scrollbar-skin.test.ts` 里原本有一份私有的
 * `parseRules`，2026-10-06 起改为 import 本函数——两份一定会漂，而那份用例的断言（D86 的
 * 滚动条皮肤）与这条规则吃的是同一个文本形状。
 *
 * 输入既可以是 `.css` 也可以是**内联 CSS 的 `.js`**：判据只找 `{`…`}` 配对，JS 的函数体
 * 会被当成「不含变量的规则」或递归进去，不会产生假阳性；前导文本由
 * {@link normalizePrelude} 归一成选择器。
 *
 * @param text - 源码文本（注释会被剥掉）。
 * @returns `{ selector, decls, line, bodyStart, bodyEnd }[]`，`line` 是 `{` 所在的 1-based 行号，
 *   `bodyStart` / `bodyEnd` 是声明块在**原文**里的偏移（用于需要按位置改写的调用方，如一次性
 *   补 `corner-shape` 的脚本；只读判据不需要它们）。
 */
export function parseCssRules(text) {
  const masked = maskComments(text)
  /** 行号：把偏移量换算成 1-based 行（选择器定位用）。 */
  const lineAt = (offset) => masked.slice(0, offset).split('\n').length
  const out = []
  const walk = (from, to) => {
    let i = from
    while (i < to) {
      const open = masked.indexOf('{', i)
      if (open === -1 || open >= to) return
      const prelude = normalizePrelude(masked.slice(i, open))
      let depth = 1
      let j = open + 1
      while (j < to && depth > 0) {
        if (masked[j] === '{') depth += 1
        else if (masked[j] === '}') depth -= 1
        j += 1
      }
      const bodyStart = open + 1
      const bodyEnd = j - 1
      const body = masked.slice(bodyStart, bodyEnd)
      if (body.includes('{')) walk(bodyStart, bodyEnd)
      else if (prelude !== '') {
        out.push({ selector: prelude, decls: body, line: lineAt(open), bodyStart, bodyEnd })
      }
      i = j
    }
  }
  walk(0, masked.length)
  return out
}

/**
 * 取某条声明的值（去 `!important`）；同一属性出现多次时取**最后一条**（CSS 的就近覆盖语义）。
 *
 * @param decls - 声明块原文。
 * @param name - 属性名（如 `border-radius`）。
 * @returns 声明值，或 `undefined`（没有该声明）。
 */
export function declValue(decls, name) {
  let found
  for (const part of String(decls).split(';')) {
    const colon = part.indexOf(':')
    if (colon === -1) continue
    if (part.slice(0, colon).trim() !== name) continue
    found = part.slice(colon + 1).replace(/!important/gu, '').trim()
  }
  return found
}

/**
 * 扫一段客户端半体源码里**定义过**哪些自定义属性（明暗两档取并集）。
 *
 * 只认「名字后面跟着冒号」的位置（`--x:`），所以同一份文件里 `var(--x)` 那类**引用**不会被
 * 当成定义——这正是它能当判据的原因（与 `parseThemeTokenDefinitions` 同一口径）。
 *
 * @param text - 源码文本（注释先剥掉，免得注释里的示例被当成定义）。
 * @returns 去重且排序的名字数组。
 */
export function parseVarDefinitions(text) {
  const found = new Set()
  for (const match of maskComments(text).matchAll(new RegExp('(' + VAR_NAME + ')\\s*:', 'g'))) {
    found.add(match[1])
  }
  return [...found].sort()
}

/**
 * 扫一段客户端半体源码里**引用**了哪些自定义属性，并给出定位。
 *
 * 与 {@link parseVarDefinitions} 对称：**定义位**（`--x:`）不算引用；`var(--x, fallback)` 仍算
 * ——它有 fallback，不会失踪，但会**静默降级**成另一个值，跑偏得更隐蔽（`--tt-bg-2` 就是这样）。
 *
 * 按 `var(` 的**配对括号**取全名，不按前缀切——这是 2026-10-06 首轮粗扫把真名
 * `--dk-pad-cardHead` 误报成 `--dk-pad-card` 的教训。
 *
 * @param text - 源码文本。
 * @returns `{ token, line, col, hasFallback }[]`（按出现顺序）。
 */
export function scanVarUses(text) {
  const masked = maskComments(text)
  const uses = []
  for (const match of masked.matchAll(new RegExp('var\\(\\s*(' + VAR_NAME + ')', 'g'))) {
    const token = match[1]
    // 定位到**名字本身**（不是 `var(` 的开头）——与 `client-theme-tokens.mjs` 的
    // `scanThemeTokenUses` 同一口径，两处的 file:line:col 才能互相照读。
    const at = match.index + match[0].length - token.length
    // `var(` 之后到该引用闭合的 `)`：只看**这一层**的参数，避免把嵌套的 fallback 串在一起。
    let depth = 1
    let i = match.index + 'var('.length
    let hasFallback = false
    for (; i < masked.length && depth > 0; i += 1) {
      const ch = masked[i]
      if (ch === '(') depth += 1
      else if (ch === ')') depth -= 1
      else if (ch === ',' && depth === 1) hasFallback = true
    }
    const before = masked.slice(0, at)
    const lastNl = before.lastIndexOf('\n')
    uses.push({
      token,
      line: before.split('\n').length,
      col: at - lastNl,
      hasFallback,
    })
  }
  return uses
}

/** 一行人类可读的定位串（`client-lint` 与用例共用同一份措辞）。 */
export function describeVarUse(use) {
  return (use.hasFallback
    ? '引用了一个本包没定义的自定义属性（有 fallback，会静默降级）'
    : '引用了一个本包没定义的自定义属性（无 fallback，那条声明会整条作废）')
    + ' ' + use.token
}

/**
 * 判定一个引用名算不算「宿主拥有的前缀」（见 {@link HOST_OWNED_VAR_PREFIXES}）。
 *
 * @param token - 自定义属性名。
 * @returns 是宿主契约变量时 `true`。
 */
export function isHostOwnedVar(token) {
  return HOST_OWNED_VAR_PREFIXES.some((prefix) => token.startsWith(prefix))
}

/**
 * 检查五的实现：给定**同一个包**的全部客户端半体文件，报出引用了未定义自定义属性的地方。
 *
 * 判据刻意分两层，与本仓既有的检查四同源：
 *
 *   1. `--dsw-*` 归检查四管（拿宿主快照比对），本函数**跳过**——两处都报就是重复计数；
 *   2. 其余名字必须在**本包**（而不是全仓）里定义过：一个包引用另一个包的私有令牌同样是 bug，
 *      而全仓并集会让它溜过去。
 *
 * @param files - `{ file, source }[]`，同一个包的客户端半体（`file` 是给人看的相对路径）。
 * @returns `{ file, token, line, col, hasFallback }[]`。
 */
export function scanUndefinedVars(files) {
  const defined = new Set()
  for (const { source } of files) {
    for (const name of parseVarDefinitions(source)) defined.add(name)
  }
  const findings = []
  for (const { file, source } of files) {
    for (const use of scanVarUses(source)) {
      if (use.token.startsWith('--dsw-')) continue // 检查四的辖区
      if (isHostOwnedVar(use.token)) continue
      if (defined.has(use.token)) continue
      findings.push({ file, ...use })
    }
  }
  return findings
}

/**
 * 一个规则的选择器列表（逗号拆开、去空白）——选择器列表里的每一项都要各自被 `corner-shape`
 * 覆盖，所以按项比对而不是按整串。
 *
 * @param selector - 规则的选择器原文。
 * @returns 归一化后的选择器数组。
 */
export function selectorList(selector) {
  return String(selector).split(',').map((part) => part.trim()).filter((part) => part !== '')
}

/**
 * 判定一条 `border-radius` 值是不是胶囊 / 正圆。
 *
 * 三种命中口径：
 *   1. 字面 `999px`（本仓绝大多数写法）；
 *   2. 字面 `50%`（圆点 / 头像 / 转圈）；
 *   3. 引用了**本包自己定义过且值为 `999px`** 的令牌（`--tt-r-pill` / `--dk-r-pill`）——
 *      令牌层是 docker / tty 的设计约定，漏掉它等于放过那 20 处。
 *
 * @param value - `border-radius` 的声明值。
 * @param pillTokens - 本包里值为 999px 的令牌名集合。
 * @returns 是胶囊 / 正圆时 `true`。
 */
export function isCapsuleRadius(value, pillTokens) {
  if (value === undefined) return false
  if (/(^|[\s/])999px($|[\s/])/.test(value)) return true
  if (/(^|[\s/])50%($|[\s/])/.test(value)) return true
  return [...pillTokens].some((token) => new RegExp('var\\(\\s*' + token + '\\s*[,)]').test(value))
}

/**
 * 找出一段源码里**值为 `999px`** 的私有令牌（`--tt-r-pill: 999px` 这类）。
 *
 * @param files - `{ source }[]`。
 * @returns 令牌名集合。
 */
export function pillTokensOf(files) {
  const found = new Set()
  for (const { source } of files) {
    for (const match of maskComments(source).matchAll(new RegExp('(' + VAR_NAME + ')\\s*:\\s*999px\\b', 'g'))) {
      found.add(match[1])
    }
  }
  return found
}

/** 伪元素滚动条选择器：宿主 `scrollbar.css` 已给 `::-webkit-scrollbar-thumb` 写了 corner-shape。 */
const SCROLLBAR_PSEUDO = /::-webkit-scrollbar|-moz-/

/**
 * 检查六的实现：报出「是胶囊/正圆但缺 `corner-shape: round`」的规则。
 *
 * 判据按**选择器**（不是按单条规则）配对：同一个选择器只要在任意一条规则里声明了
 * `corner-shape`，就算覆盖到了——这样把 `border-radius` 与 `corner-shape` 拆两条规则写的
 * 合法写法不会被误报。反向的漏报（A 选择器写 corner-shape、B 选择器漏）不存在，因为按选择器
 * 精确匹配。
 *
 * @param files - `{ file, source }[]`，同一个包的客户端半体。
 * @returns `{ file, selector, value, line }[]`。
 */
export function scanCapsuleCorners(files) {
  return scanCapsuleSites(files).filter((site) => !site.paired)
}

/**
 * 检查六的**全量**扫描：本包所有胶囊/正圆站点，每项带 `paired`（是否已有 `corner-shape`）。
 *
 * 单独导出它是为了**闸门自证**：通过行要打印「命中不是 0」（本仓明令：只会在 0 命中时绿的
 * 检查等于没有检查）。`scanCapsuleCorners` 只是它过滤掉已配对项的结果——两者共用一次扫描，
 * 不会出现「总数」与「findings」两套口径。
 *
 * @param files - `{ file, source }[]`。
 * @returns `{ file, selector, value, line, paired }[]`。
 */
export function scanCapsuleSites(files) {
  const pillTokens = pillTokensOf(files)
  const sites = []
  for (const { file, source } of files) {
    const rules = parseCssRules(source)
    const cornerCovered = new Set()
    for (const rule of rules) {
      if (declValue(rule.decls, 'corner-shape') === undefined) continue
      for (const sel of selectorList(rule.selector)) cornerCovered.add(sel)
    }
    for (const rule of rules) {
      const value = declValue(rule.decls, 'border-radius')
      if (!isCapsuleRadius(value, pillTokens)) continue
      for (const sel of selectorList(rule.selector)) {
        if (SCROLLBAR_PSEUDO.test(sel)) continue // 宿主 scrollbar.css 负责
        sites.push({ file, selector: sel, value, line: rule.line, paired: cornerCovered.has(sel) })
      }
    }
  }
  return sites
}

/** 命中检查六时要贴的一行人类可读定位串。 */
export function describeCapsuleCorner(finding) {
  return '胶囊/正圆缺少 corner-shape: round（' + finding.selector + ' 的 border-radius: ' + finding.value + '）'
}
