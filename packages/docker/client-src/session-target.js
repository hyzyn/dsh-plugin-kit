/**
 * @hyzyn/dsh-docker — 「当前 SSH 会话 → 已配置 docker 目标」的匹配纯逻辑。
 *
 * 为什么单独成文件：`client-src/index.js` 是浏览器 IIFE 入口，没有导出，逻辑放在
 * 里面就只能靠真机点。这三个函数都是纯函数、不碰任何模块级缓存，抽出来可以直接
 * 用 vitest 钉住（esbuild 打包时按普通本地模块内联，产物形态不变）。
 */

/**
 * 解析 `user@host[:port]` 形态的目标文本。
 *
 * 两个来源共用它：宿主 `/targets` 里每个目标的 `label`，以及宿主在 ready 帧里
 * 回显、由 tty 挂在 `tab.target` 上的实际连接（`user@host[:port]`）。
 *
 * @param text 形如 `root@192.0.2.10` 或 `root@host:2222`；其它形态返回 undefined。
 */
export function parseUserHostPort(text) {
  const parsed = /^([^@]+)@(.+?)(?::(\d+))?$/.exec(typeof text === 'string' ? text : '')
  if (parsed === null) return undefined
  return { host: parsed[2], port: Number(parsed[3] ?? 22) }
}

/**
 * 会话实际的 host:port。
 *
 * 优先用 spec 自带的 host（内联规格 `{t:'ssh', host, port, username}`）；spec 没带时
 * 退回宿主回显的 `tab.target` —— **从连接簿打开的 SSH 标签，spec 里只有条目名**
 * （tty 侧构造：`{t:'ssh', name: bookName, command}`），host 是空串。没有这层兜底，
 * 按 host 的匹配整条失效：会话主机显示为空、面板判成「该主机尚未配置为 Docker 目标」，
 * 哪怕用户早就按同一个主机配了目标（只是连接簿条目名不同，如 `lab-a` vs
 * `192.0.2.10`）。
 *
 * @param spec tty 传过来的会话规格。
 * @param liveTarget 宿主回显的实际连接（tty 的 `tab.target`）。
 */
export function sessionHostPort(spec, liveTarget) {
  const host = typeof spec?.host === 'string' ? spec.host : ''
  const rawPort = Number(spec?.port)
  if (host !== '') return { host, port: Number.isInteger(rawPort) && rawPort > 0 ? rawPort : 22 }
  return parseUserHostPort(liveTarget)
}

/**
 * 在已配置目标里按 host:port 找出匹配的那个（`label` 形如 `user@host:port`）。
 *
 * **用户名不参与比较**：同一台主机常用不同账号配多条连接簿条目（root / hsadmin），
 * 只按账号比会漏配。端口按 22 缺省（label 省略端口时视为 22）。
 *
 * @param rows 宿主 `/targets` 返回的目标行。
 * @param session `sessionHostPort` 的结果；undefined 表示无从判断，直接不匹配。
 */
export function pickTargetByHost(rows, session) {
  if (session === undefined) return undefined
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row === null || typeof row !== 'object' || row.kind !== 'ssh') continue
    const parsed = parseUserHostPort(row.label)
    if (parsed === undefined) continue
    if (parsed.host === session.host && parsed.port === session.port) return row.name
  }
  return undefined
}
