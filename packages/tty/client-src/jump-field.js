/**
 * @hyzyn/dsh-tty — 跳板机输入框 ⇄ 结构化 `jump` 规格（**纯逻辑**，进 vitest）。
 *
 * 界面只给一个输入框：`[用户@]主机[:端口]`——与 OpenSSH 的 `ProxyJump` 写法一致，
 * 用户从 `~/.ssh/config` 抄过来就能用；凭据默认**沿用目标那一跳**（勾掉「使用独立凭据」
 * 才展开覆盖字段），所以绝大多数情况只填这一行。
 *
 * 抽成纯模块的理由与 `ws-url.js` / `stats-bar.js` 相同：`client.js` 是构建产物、不在 vitest
 * 层测；留在对话框闭包里的解析逻辑等于没有测试入口，而这里的边界（IPv6 方括号、空段、
 * 非法端口、只有 `user@`）恰好都是抄写配置时真实会遇到的。
 */

/**
 * 解析输入框内容 → `{ host, port, username? }`；空串返回 undefined（= 没配跳板机）。
 *
 * 宽容规则（与宿主侧 `ssh-config.ts` 的 `ProxyJump` 解析**同一套**）：非法端口回落到 22
 * 而不是报错——用户抄的是「主机:端口」，端口写错时至少还能连上默认端口，而不是整条配置
 * 存不进去。`user@` 之后为空、或整体为空，都视为「没配」。
 * @param {unknown} text 输入框内容
 * @returns {{ host: string, port: number, username?: string } | undefined}
 */
export function parseJumpShorthand(text) {
  const raw = typeof text === 'string' ? text.trim() : ''
  if (raw === '') return undefined
  let rest = raw
  let username = ''
  const at = rest.lastIndexOf('@')
  if (at > 0) {
    username = rest.slice(0, at).trim()
    rest = rest.slice(at + 1).trim()
  }
  let host = rest
  let port = 22
  const match = /^\[([^\]]+)\](?::(\d+))?$/.exec(rest) ?? /^([^:]+):(\d+)$/.exec(rest)
  if (match !== null) {
    host = match[1]
    const parsed = Number(match[2])
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535) port = parsed
  }
  if (host === '') return undefined
  const jump = { host, port }
  if (username !== '') jump.username = username
  return jump
}

/**
 * 结构化 `jump` → 输入框内容（编辑已有条目时的回填）。
 *
 * 端口 22 不写出来（与 OpenSSH 一致）；IPv6 主机名补方括号，否则 `::1:22` 会被解析歧义。
 * @param {unknown} jump
 * @returns {string} 没配时返回空串
 */
export function formatJumpShorthand(jump) {
  if (jump === null || typeof jump !== 'object') return ''
  const record = /** @type {{ host?: unknown, port?: unknown, username?: unknown }} */ (jump)
  const host = typeof record.host === 'string' ? record.host.trim() : ''
  if (host === '') return ''
  const port = Number.isInteger(record.port) && Number(record.port) >= 1 && Number(record.port) <= 65535 ? Number(record.port) : 22
  const user = typeof record.username === 'string' && record.username.trim() !== '' ? record.username.trim() + '@' : ''
  const shown = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host
  return `${user}${shown}${port === 22 ? '' : ':' + String(port)}`
}
