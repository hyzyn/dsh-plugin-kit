/**
 * 真机脚本「借宿主的配置验一条链路」时的**写回快照**：把 `/api/dsh-mcp/servers` 的 DTO
 * 还原成保存接口的输入形状，并在写回后判定「逐条同形」。
 *
 * ## 为什么单独成模块
 *
 * 这段逻辑有个**已经踩过的坑**（2026-11-18 真机验收）：`/servers/save` 是**整表替换**，
 * 而 DTO 里 `disabled` 挂在**行上**、不在 `config` 里。旧版写回只挑 `{ id, config }`，
 * 于是宿主上那行「已停用」的 MCP 服务器在收尾后**被重新启用**了：
 *
 * - 表面上没有任何报错，条数也没变——当时的 M4 只断言「条数相同」，照旧 PASS；
 * - 是「真实配置逐字节未变」的自证抓到的：`~/.dsh/cordis.patch.yml` 少了正好 21 字节，
 *   就是一行 `      disabled: true`。
 *
 * 所以判据必须是**逐条同形**（`id` / `serverName` / `disabled` 三项），而不是条数。
 * 抽成模块是为了让用例能直接喂 DTO 夹具——脚本本体是 top-level await，import 就会跑。
 */

/**
 * DTO 行 → 保存接口的输入行。
 *
 * 只取三项：`id` 与 `config` 是接口的输入形状，`disabled` 是**行的状态**；其余字段
 * （`status` / `conflict` / `toolCount` / `loaded` …）是运行时状态，写回去会被拒。
 *
 * @param rows - `/api/dsh-mcp/servers` 返回的 `servers`（形状不保证，按防御性解析）。
 * @returns 可直接 POST 给 `/api/dsh-mcp/servers/save` 的 `servers`。
 */
export function restoreRowsFromDto(rows) {
  if (!Array.isArray(rows)) return []
  const out = []
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue
    if (typeof row.id !== 'string' || row.config === undefined || row.config === null) continue
    out.push({
      id: row.id,
      config: row.config,
      ...(row.disabled === true ? { disabled: true } : {}),
    })
  }
  return out
}

/** 一行的「形态」：写回是否原样，只看这三项（参数顺序即输出顺序，便于排错时肉眼比）。 */
export function rowShape(row) {
  const serverName = row.config?.serverName
  return `${String(row.id)}|${String(serverName)}|${String(row.disabled === true)}`
}

/**
 * 写回后的 DTO 是否与快照**逐条同形**。
 *
 * 顺序不重要（载入次序不是语义），数量与每条的 `id` / `serverName` / `disabled` 必须一致。
 *
 * @param snapshot - 写回时提交的 `servers`（{@link restoreRowsFromDto} 的产物）。
 * @param current - 写回后重新 `GET` 到的 DTO `servers`。
 */
export function sameRowShape(snapshot, current) {
  const before = (Array.isArray(snapshot) ? snapshot : []).map(rowShape).sort()
  const after = (Array.isArray(current) ? current : []).map(rowShape).sort()
  return before.length === after.length && before.every((item, index) => item === after[index])
}
