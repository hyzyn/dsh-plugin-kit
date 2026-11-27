/**
 * @hyzyn/dsh-tty — 「面板刚打开时开什么」的判据（纯模块，0.40.0，issue #29）。
 *
 * ## 为什么单独一个文件
 *
 * 判据（这次该不该弹菜单、该不该按连接簿条目直接连、配置值认不出来时怎么办）原先要写在
 * `client-src/index.js` 的 `afterSocketOpenInner()` 里，而那是浏览器 IIFE、没有测试入口
 * （同 `tab-hidden.js` / `session-live.js` 的理由）。抽出来用 vitest 钉住每个出口，
 * esbuild 打包时按普通本地模块内联，产物形态不变。
 *
 * ## 配置形态（宿主只存原值，解析全在这里）
 *
 * | 值 | 含义 |
 * | --- | --- |
 * | `local`（默认） | 没有可恢复标签时自动开一个本机终端 —— 与 0.39 及以前完全一致 |
 * | `ask` | 不创建任何会话，只弹面板自己的「+」菜单等用户选 |
 * | `book:<条目名>` | 直接按该连接簿条目开 SSH 标签 |
 * | `<条目名>`（裸名） | 同上（写起来短，卡片写的是带前缀的规范形态） |
 *
 * **为什么留 `book:` 前缀**：连接簿条目是用户数据，完全可以叫 `local` 或 `ask`——裸名在
 * 这两个词上必然有歧义，而前缀给了一条**永远可达**的写法（`book:local` 指那个条目，
 * `local` 指本机终端）。`book:` 后面的名字按原样、**区分大小写**匹配：条目名是用户自己
 * 起的，做大小写折叠反而会让「两个只差大小写的条目」变得不可达。
 *
 * ## 判据边界（三条，都是 issue 明确要求的不变量）
 *
 * 1. **只在「面板刚打开」那一拍**：`pending` 由 `openModal()` 置位、用一次即清。
 *    socket 抖动重连不再触发（否则菜单会在用户没做任何操作时自己冒出来），最小化再恢复
 *    也不触发（`openModal` 走的是 `restoreModal()` 那条早退分支）。
 * 2. **只看「面板自己的标签」**：`ttyTerminal.mount`（dsh-docker 等）的会话挂在**调用方
 *    自己的 DOM** 里、不占本面板的标签位，所以它不参与判据；`tty_open` / `tty_run` 这类
 *    显式创建路径根本不经过这里。判据与 issue #29 的原文一致：没有可恢复的标签才触发。
 * 3. **认不出就回落 `local`，但要说话**：条目被删 / 手改配置写错名字，一律回落成默认
 *    行为并弹 toast 点名——既不把用户留在空面板里，也不静默改掉他配的意图。
 */

/** 默认值：与 schema 的 `default('local')` 是同一个字面量。 */
export const STARTUP_DEFAULT = 'local'
/** 「每次询问」：弹「+」菜单。 */
export const STARTUP_ASK = 'ask'
/** 指定连接簿条目时的规范前缀（卡片写这个形态）。 */
export const STARTUP_BOOK_PREFIX = 'book:'

/**
 * 解析配置值 → 意图。
 *
 * 关键字（`local` / `ask` / `book:` 前缀）**不区分大小写**：手改 profile 时写 `Local`
 * 不该变成「一个叫 Local 的连接簿条目」。条目名本身区分大小写（见文件头）。
 *
 * @param {unknown} value 配置原值（可能来自老版本 / 手改 / 非字符串）
 * @returns {{ mode: 'local' } | { mode: 'ask' } | { mode: 'book', name: string }}
 */
export function parseStartupIntent(value) {
  if (typeof value !== 'string') return { mode: STARTUP_DEFAULT }
  const trimmed = value.trim()
  if (trimmed === '') return { mode: STARTUP_DEFAULT }
  const lower = trimmed.toLowerCase()
  if (lower === STARTUP_DEFAULT) return { mode: STARTUP_DEFAULT }
  if (lower === STARTUP_ASK) return { mode: STARTUP_ASK }
  if (lower.startsWith(STARTUP_BOOK_PREFIX)) {
    // 名字取**原值里的切片**，不是 lower——条目名区分大小写
    const name = trimmed.slice(STARTUP_BOOK_PREFIX.length).trim()
    // `book:` 后面什么都没有 = 没有意图（不是「一个叫空串的条目」）
    return name === '' ? { mode: STARTUP_DEFAULT } : { mode: 'book', name }
  }
  // 裸条目名：兼容手写配置；`local` / `ask` / `book:` 已在上面被关键字截走
  return { mode: 'book', name: trimmed }
}

/**
 * 配置值 → 设置卡片下拉里的**规范值**（`local` / `ask` / `book:<条目名>`）。
 *
 * 裸条目名（手写 profile 的便利写法）也归一成 `book:<条目名>`：下拉里明明有那条连接，
 * 却因为值形态不同而显示成「已不存在」的话，用户只能猜。
 *
 * @param {unknown} value 配置原值
 * @returns {string} 下拉里能直接当 `value` 用的规范形态
 */
export function normalizeStartupValue(value) {
  const intent = parseStartupIntent(value)
  return intent.mode === 'book' ? STARTUP_BOOK_PREFIX + intent.name : intent.mode
}

/**
 * 设置卡片「打开面板时」下拉的候选。
 *
 * 纯数据（`{ value, kind, name? }`），**不含文案**——纯模块里不碰 `t()`，文案由卡片按
 * `kind` 组装。这样「候选里有没有这一条、失效值有没有被列出来」是能单测的判据，
 * 而不是只能靠截图看。
 *
 * `kind` 取值：
 *   - `local` / `ask`：两个固定项；
 *   - `book`：连接簿条目（`value` = `book:<条目名>`，`name` = 条目名）；
 *   - `stale`：认不出的现值（条目被删 / 手改配置写错名字）**原样**补一条，让用户看见它。
 *
 * @param {object} input
 * @param {unknown} input.startup 配置原值
 * @param {unknown} input.sshHosts 连接簿（`/api/dsh-tty/config` 的 sshHosts）
 * @returns {{ current: string, options: Array<{ value: string, kind: string, name?: string }> }}
 */
export function startupCardOptions(input) {
  const source = input !== null && typeof input === 'object' ? input : {}
  const current = normalizeStartupValue(source.startup)
  const options = [
    { value: STARTUP_DEFAULT, kind: STARTUP_DEFAULT },
    { value: STARTUP_ASK, kind: STARTUP_ASK },
  ]
  const hosts = Array.isArray(source.sshHosts) ? source.sshHosts : []
  for (const entry of hosts) {
    if (entry === null || typeof entry !== 'object') continue
    if (typeof entry.name !== 'string' || entry.name === '') continue
    const value = STARTUP_BOOK_PREFIX + entry.name
    // 同名条目只列一次（连接簿保存按同名覆盖，这里只是防御：条目不重名是该表自己的不变量）
    if (options.some((option) => option.value === value)) continue
    options.push({ value, kind: 'book', name: entry.name })
  }
  if (!options.some((option) => option.value === current)) {
    options.push({ value: current, kind: 'stale' })
  }
  return { current, options }
}

/**
 * 在连接簿里找条目（**只认名字完全相等**）。
 *
 * @param {unknown} sshHosts 客户端缓存的连接簿（`/api/dsh-tty/config` 的 sshHosts）
 * @param {string} name 条目名
 * @returns {object | null} 命中的原条目（原样返回，调用方拿它建会话）或 null
 */
export function findBookEntry(sshHosts, name) {
  if (!Array.isArray(sshHosts) || typeof name !== 'string' || name === '') return null
  for (const entry of sshHosts) {
    if (entry === null || typeof entry !== 'object') continue
    if (typeof entry.name !== 'string' || entry.name === '') continue
    if (entry.name === name) return entry
  }
  return null
}

/**
 * 面板刚打开、恢复流程走完之后，这一次到底做什么。
 *
 * @param {object} input
 * @param {unknown} input.startup 配置原值（`/api/dsh-tty/config` 的 startup）
 * @param {unknown} input.sshHosts 连接簿缓存
 * @param {boolean} input.hasOwnTabs 面板里是否已有自己的标签（含恢复出来的）
 * @param {boolean} input.pending 这次面板打开是否还欠一次启动决策
 * @returns {{ kind: 'none' }
 *   | { kind: 'local' }
 *   | { kind: 'ask' }
 *   | { kind: 'book', entry: object, name: string }
 *   | { kind: 'missing', name: string }}
 *
 * 五个出口逐个有单测（`test/startup-intent.test.ts`）——新增一个早退分支就必须补一格，
 * 否则「新分支的其它出口没人测」（见 references/fix-verification.md）。
 */
export function planStartup(input) {
  const source = input !== null && typeof input === 'object' ? input : {}
  // ① 不是「面板刚打开」那一拍（重连 / 最小化恢复）：一律不做事
  if (source.pending !== true) return { kind: 'none' }
  // ② 已经有自己的标签（恢复出来的持久标签、sessionStorage 里的标签…）
  if (source.hasOwnTabs === true) return { kind: 'none' }
  const intent = parseStartupIntent(source.startup)
  if (intent.mode === STARTUP_ASK) return { kind: 'ask' }
  if (intent.mode === STARTUP_DEFAULT) return { kind: 'local' }
  // ④ 指定条目：命中就开它；找不到交给调用方「回落 local + toast」
  const entry = findBookEntry(source.sshHosts, intent.name)
  if (entry === null) return { kind: 'missing', name: intent.name }
  return { kind: 'book', entry, name: intent.name }
}
