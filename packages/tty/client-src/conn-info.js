/**
 * @hyzyn/dsh-tty — 连接栏「连接信息」的纯逻辑（**进 vitest**）。
 *
 * 连接栏左侧那枚 `user@host:port`、点开的详情弹层，以及「⋯」里的两个复制项，都要从
 * 会话的 `spawnSpec` 现算。抽成纯模块的理由与 `jump-field.js` / `stats-bar.js` 相同：
 * `client.js` 是构建产物、不在 vitest 层，逻辑留在组件闭包里等于没有测试入口；而这里
 * 的边界（端口 22 省略、IPv6 方括号、没配跳板机 / 代理命令、非 SSH 规格）恰好都是
 * 抄写连接信息时真实会遇到的。
 *
 * **不猜凭据**：密码 / 私钥路径 / passphrase 一律不进复制文本，也不进 ssh 命令行——
 * 那是「更方便地泄露」，不是「更方便地连接」。
 */

/** 只认 SSH 规格：本地标签的连接栏整栏隐藏，但函数本身要能安全接受任意输入。 */
export function isSshSpec(spec) {
  return spec !== null && typeof spec === 'object' && spec.t === 'ssh'
}

/** trim 后的字符串；非字符串一律当空串。 */
function textOf(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/** IPv6 主机名补方括号（与 jump-field.js 的 formatJumpShorthand 同一套，避免 `::1:22` 歧义）。 */
function hostShown(host) {
  return host.includes(':') && !host.startsWith('[') ? '[' + host + ']' : host
}

/** 端口 22 不写出来（与 OpenSSH 一致）；非法端口也不写。 */
function portSuffix(port) {
  const value = Number(port)
  return Number.isInteger(value) && value >= 1 && value <= 65535 && value !== 22 ? ':' + String(value) : ''
}

/** `[user@]host[:port]`：连接栏左侧、复制文本与 ssh 命令共用这一份。 */
export function targetOf(spec) {
  if (!isSshSpec(spec)) return ''
  const host = textOf(spec.host)
  if (host === '') return ''
  const user = textOf(spec.username)
  return (user === '' ? '' : user + '@') + hostShown(host) + portSuffix(spec.port)
}

/** 跳板机规格（`{ host, port, username? }`）→ `[user@]host[:port]`；没配返回空串。 */
export function jumpLabelOf(jump) {
  if (jump === null || typeof jump !== 'object') return ''
  const host = textOf(jump.host)
  if (host === '') return ''
  const user = textOf(jump.username)
  return (user === '' ? '' : user + '@') + hostShown(host) + portSuffix(jump.port)
}

/** 认证方式 → 文案键；未知返回空串（详情里不画一行「未知」）。 */
export function authLabelKey(auth) {
  const value = textOf(auth)
  if (value === 'key') return 'connDetail.authKey'
  if (value === 'password') return 'connDetail.authPassword'
  if (value === 'agent') return 'connDetail.authAgent'
  return ''
}

/**
 * 把一段参数包成 shell 里的单个词（代理命令里通常带空格）。
 *
 * 无空格 / 引号时原样返回；否则单引号包裹，`'` 用 `'\''` 转义（POSIX 语义）。
 */
export function quoteShellArg(value) {
  const text = typeof value === 'string' ? value : String(value ?? '')
  if (text === '') return "''"
  if (!/[\s'"\\]/.test(text)) return text
  return "'" + text.replace(/'/g, "'\\''") + "'"
}

/**
 * 一条可直接粘进终端的 ssh 命令：端口 / 跳板机 / 代理命令都按 OpenSSH 的写法带上。
 *
 * 刻意**不带凭据**：密码、私钥路径、passphrase 都不进命令行——要带它们就得知道认证
 * 方式，而那正是这条命令想避开的事（复制到聊天窗口时尤其要命）。
 */
export function sshCommandOf(spec) {
  if (!isSshSpec(spec)) return ''
  const host = textOf(spec.host)
  if (host === '') return ''
  const parts = ['ssh']
  if (portSuffix(spec.port) !== '') parts.push('-p', String(Number(spec.port)))
  const jump = jumpLabelOf(spec.jump)
  if (jump !== '') parts.push('-J', jump)
  const proxy = textOf(spec.proxyCommand)
  if (proxy !== '') parts.push('-o', 'ProxyCommand=' + quoteShellArg(proxy))
  const user = textOf(spec.username)
  parts.push((user === '' ? '' : user + '@') + hostShown(host))
  return parts.join(' ')
}

/**
 * 连接簿式标签的 spawnSpec 只有 `{ t:'ssh', name }`（主机 / 端口 / 认证全在宿主侧的连接簿里，
 * 见客户端 `addTab({ t:'ssh', name, ...persistSpec })`）——直接拿它算连接信息只能算出条目名。
 *
 * 这里按名字回填连接簿条目（客户端的 `sshHostsCache`），并**剥掉明文凭据**：展示与复制都用不到
 * 它们，而 `password` / `passphrase` 一旦进了返回值，未来某条路径就可能把它写进剪贴板。
 * 内存里的连接簿条目本来就有这些字段（设置卡片要用），所以剥在这一个出口上。
 *
 * 内联连接（`spec.host` 非空）原样返回；找不到条目也原样返回（此时只能显示条目名与宿主回来的
 * 实时地址，不猜）。
 *
 * @param {unknown} spec 会话的 spawnSpec
 * @param {unknown} books 连接簿条目数组（`/api/dsh-tty/config` 的 sshHosts）
 * @returns {unknown} 可继续交给 targetOf / jumpLabelOf / sshCommandOf 的规格
 */
export function resolveConnSpec(spec, books) {
  if (!isSshSpec(spec)) return spec
  if (textOf(spec.host) !== '') return spec
  const name = textOf(spec.name)
  if (name === '' || !Array.isArray(books)) return spec
  const entry = books.find((row) => row !== null && typeof row === 'object' && textOf(row.name) === name)
  if (entry === undefined) return spec
  const { password, passphrase, ...rest } = entry
  return {
    ...rest,
    t: 'ssh',
    name,
    // 持久化是**本次会话**的选择，不能被条目里的默认值改回去
    ...(spec.persist === true ? { persist: true } : {}),
  }
}

/**
 * 连接详情弹层的行：`{ id, value }`，标题由渲染方按 `connDetail.<id>` 取。
 *
 * `state` 来自标签（`{ targetText?, persistTmux?, persistRequested?, statusText? }`）——
 * `targetText` 是宿主 `ready` 帧回来的**实时** `user@host:port`（连接簿条目事后被改过时，
 * 真正连上的是它，所以优先于从规格推算的那个）；其余只影响「持久化」与「最近状态」两行。
 *
 * @param {unknown} spec 会话的 spawnSpec（连接簿式标签请先过 {@link resolveConnSpec}）
 * @param {unknown} state 标签的实时状态
 * @param {(key: string, vars?: Record<string, string>) => string} t 文案函数（测试里传恒等实现）
 * @returns {Array<{ id: string, value: string }>}
 */
export function connDetailRows(spec, state, t) {
  const rows = []
  const live = state !== null && typeof state === 'object' ? state : {}
  const liveTarget = textOf(live.targetText)
  const target = liveTarget !== '' ? liveTarget : targetOf(spec)
  if (target !== '') rows.push({ id: 'target', value: target })
  const book = textOf(spec === null || typeof spec !== 'object' ? undefined : spec.name)
  if (book !== '') rows.push({ id: 'book', value: book })
  const authKey = authLabelKey(spec !== null && typeof spec === 'object' ? spec.auth : undefined)
  if (authKey !== '') rows.push({ id: 'auth', value: t(authKey) })
  const jump = jumpLabelOf(spec !== null && typeof spec === 'object' ? spec.jump : undefined)
  if (jump !== '') rows.push({ id: 'jump', value: jump })
  const proxy = textOf(spec !== null && typeof spec === 'object' ? spec.proxyCommand : undefined)
  if (proxy !== '') rows.push({ id: 'proxy', value: proxy })
  if (live.persistTmux === true) rows.push({ id: 'persist', value: t('connDetail.persistTmux') })
  else if (live.persistRequested === true) rows.push({ id: 'persist', value: t('connDetail.persistPlain') })
  const status = textOf(live.statusText)
  if (status !== '') rows.push({ id: 'status', value: status })
  return rows
}

/**
 * 复制「连接信息」用的文本：只含连接参数（目标 / 条目 / 认证 / 跳板机 / 代理命令），
 * 每行 `标题: 值`。瞬时状态（持久化、最近状态）不进剪贴板——它们会过期。
 *
 * `state` 与 {@link connDetailRows} 同义（`targetText` 优先于从规格推算的目标）。
 */
export function connCopyText(spec, t, state) {
  return connDetailRows(spec, state, t)
    .filter((row) => row.id !== 'persist' && row.id !== 'status')
    .map((row) => t('connDetail.' + row.id) + ': ' + row.value)
    .join('\n')
}
