/**
 * @hyzyn/dsh-tty — 端口转发「新增 / 编辑」的纯逻辑。
 *
 * 为什么单独成文件：这段判断（名字怎么派生、哪些字段必填、改了端口算不算与别人撞名）
 * 原先只活在 `client-src/index.js` 的组件闭包里，**没有单测**——而它恰好是最容易漂的
 * 一类代码：新增与编辑两条路径各写一份校验就必然走偏（"新增能过、编辑过不了"）。
 * 抽成纯函数后可直接单测（`test/tunnel-edit.test.ts`），与 `status-line.js` /
 * `stats-bar.js` / `credential-ref.js` 同款；esbuild 打包时按普通本地模块内联。
 *
 * 三条规则（都写在这里，别在组件里再抄一遍）：
 *   1. **名字由规则派生**：`<bookName>-L<localPort>`（本地转发）/ `<bookName>-R<remotePort>`
 *      （远程转发）。所以「改端口」= 「换名字」，编辑时**必须按原始名字定位**；
 *   2. **撞名报错而不是自动加后缀**（见下 `tunnelNameClash`）：静默加 `-2` 会凭空多出一条
 *      同名不同尾的隧道，用户以为在改同一条、实际得到两条；
 *   3. **编辑不改变启用状态**：只改规格，不顺手把停用的隧道启用（`keepEnabled`）。
 */

/** 端口合法区间（与宿主 `validateTunnels` 一致）。 */
const MIN_PORT = 1
const MAX_PORT = 65535

/** 表单端口输入 → 合法端口号；非法返回 0（调用方据此报必填/范围错）。 */
export function parsePort(value) {
  const n = Number(value)
  return Number.isInteger(n) && n >= MIN_PORT && n <= MAX_PORT ? n : 0
}

/** 由规则派生隧道名（`<bookName>-L<port>` / `<bookName>-R<port>`）。 */
export function deriveTunnelName(bookName, direction, port) {
  return `${bookName}-${direction === 'remote' ? 'R' : 'L'}${String(port)}`
}

/**
 * 从表单草稿拼出一条隧道规格（新增与编辑**共用**）。
 *
 * 返回判别式联合（`ok: true/false`）而不是 `{tunnel} | {error}`：后者在没有类型标注的
 * JS 里无法被 TS 收窄，调用方每次访问 `.tunnel` / `.error` 都会多一条 TS2339 噪音
 * （实测 +14 条，把 client-lint 的已知噪音从 24 推到 38）。JSDoc 的**字面量**类型能让
 * `if (!built.ok)` 正常收窄，噪音归零。
 *
 * @param {{ direction?: string, bookName?: string, localPort?: unknown, remoteHost?: unknown, remotePort?: unknown, localTargetPort?: unknown }} draft
 * @param {string[]} [books] 可用连接簿条目名（`bookName` 为空时回落第一个；与旧行为一致）
 * @returns {{ ok: true, tunnel: object } | { ok: false, error: string }}
 */
export function buildTunnelFromDraft(draft, books = []) {
  const d = draft ?? {}
  const bookName = String(d.bookName ?? '') || String(books[0] ?? '') || ''
  if (bookName === '') return { ok: false, error: '请先在连接簿里添加 SSH 条目' }

  if (d.direction === 'remote') {
    const remotePort = parsePort(d.remotePort)
    const localTargetPort = parsePort(d.localTargetPort)
    if (remotePort < MIN_PORT || localTargetPort < MIN_PORT) {
      return { ok: false, error: '远程监听端口与本地目标端口必填（1~65535）' }
    }
    return {
      ok: true,
      tunnel: {
        name: deriveTunnelName(bookName, 'remote', remotePort),
        bookName,
        direction: 'remote',
        remotePort,
        localTargetHost: '',
        localTargetPort,
        enabled: true,
      },
    }
  }

  const localPort = parsePort(d.localPort)
  const remoteHost = String(d.remoteHost ?? '').trim()
  const remotePort = parsePort(d.remotePort)
  if (localPort < MIN_PORT || remoteHost === '' || remotePort < MIN_PORT) {
    return { ok: false, error: '本地端口、远程主机、远程端口必填' }
  }
  return {
    ok: true,
    tunnel: {
      name: deriveTunnelName(bookName, 'local', localPort),
      bookName,
      direction: 'local',
      localPort,
      remoteHost,
      remotePort,
      enabled: true,
    },
  }
}

/** 新增前查重：撞名返回那条同名隧道（无冲突返回 undefined）。 */
export function tunnelNameClash(tunnels, name) {
  return (Array.isArray(tunnels) ? tunnels : []).find((t) => String(t?.name ?? '') === String(name))
}

/**
 * 编辑前查重：只关心**除自己以外**的条目（改了端口/条目后新名字撞别人）。
 * @param originalName 进编辑时那条的**原始**名字（用新名字找不到它）
 */
export function tunnelEditClash(tunnels, originalName, nextName) {
  return (Array.isArray(tunnels) ? tunnels : []).find(
    (t) => String(t?.name ?? '') !== String(originalName) && String(t?.name ?? '') === String(nextName),
  )
}

/**
 * 把编辑结果合并回列表：按**原始名字**定位替换。
 *
 * 定位必须用原始名字——名字由规则派生，「改端口」就等于换名字，用新名字在列表里找不到自己。
 * `enabled` 保留原值：编辑规格不该顺手把停用的隧道启用。
 *
 * 同样用判别式（`ok`）以便调用方收窄（理由见 `buildTunnelFromDraft`）。
 *
 * @param {object[]} tunnels
 * @param {string} originalName 进编辑时那条的**原始**名字
 * @param {{ name: string }} nextTunnel
 * @returns {{ ok: true, tunnels: object[] } | { ok: false, error: string }}
 */
export function applyTunnelEdit(tunnels, originalName, nextTunnel) {
  const list = Array.isArray(tunnels) ? tunnels : []
  const original = list.find((t) => String(t?.name ?? '') === String(originalName))
  if (original === undefined) {
    return { ok: false, error: `隧道「${String(originalName)}」已不存在（可能被另一个窗口删除）` }
  }
  const clash = tunnelEditClash(list, originalName, nextTunnel.name)
  if (clash !== undefined) {
    return { ok: false, error: `已存在同名隧道「${String(nextTunnel.name)}」——请先处理那条同名的。` }
  }
  const merged = { ...nextTunnel, enabled: original.enabled !== false }
  return { ok: true, tunnels: list.map((t) => (String(t?.name ?? '') === String(originalName) ? merged : t)) }
}
