/**
 * @hyzyn/dsh-tty — 「一下关掉一批标签」的选择与确认判据（纯模块，0.29.0）。
 *
 * ## 为什么单独一个文件
 *
 * 判据（哪些标签算「其他」/「右侧」、这一下要不要先问一句）如果写在 `client-src/index.js`
 * 里就**没有测试入口**（那是浏览器 IIFE、不导出，同 `session-live.js` / `close-guard.js`
 * 的理由）。抽出来用 vitest 钉住，esbuild 打包时按普通本地模块内联，产物形态不变。
 *
 * ## 判据
 *
 * - **嵌入终端一律不算**：dsh-docker 那些经 `ttyTerminal.mount` / `ttPanel.mountPane`
 *   挂进来的会话（`embedded: true`）不在标签栏上，关它们等于替别的插件做决定。过滤就写在
 *   这里（而不是「调用方记得先滤掉」）——判据只留一处，漏滤也杀不到别人。
 * - **顺序 = 标签栏顺序**（`tabs` 这个 Map 的插入序，也就是 `renderTabbar` 的遍历序）：
 *   只有这样「左侧 / 右侧」才有定义（同一处切片，取两个方向）。参照标签不在列表里时
 *   （活动标签刚好被关掉）→ `left` / `right` 都为空，`others` 仍是全部。
 *   两者都**不含参照自己**：「关闭左侧」不该顺手把参照关掉。
 * - **确认只在「一下要结束 ≥2 条活会话」时弹**：只关一条活会话与点它自己的 ✕ 等价
 *   （✕ 不问），问一句是纯噪音；一次收掉好几条正在跑的会话才值得拦一下。
 *   已退出（D77 的只读保留）的标签不算活会话：清掉它们不丢任何东西（与 D98 同一口径）。
 */
const EMPTY_GROUP = Object.freeze({ sids: [], live: 0, agentLive: 0, confirm: false })

/**
 * 把调用方的标签快照归一成判据认识的形状，并**在这里**滤掉嵌入终端与没有 sid 的条目。
 *
 * @param list - 任意可迭代的条目（`[{ sid, embedded, exited, agentOwned }]`）；传
 *   `tabs.values()` 之类缺 sid 的东西等于没有标签。
 * @returns {{ sid: string, exited: boolean, agentOwned: boolean }[]} 标签栏顺序的非嵌入标签
 */
function normalize(list) {
  const out = []
  if (list === null || list === undefined || typeof list[Symbol.iterator] !== 'function') return out
  for (const item of list) {
    if (item === null || typeof item !== 'object') continue
    if (item.embedded === true) continue
    const sid = item.sid
    if (typeof sid !== 'string' || sid === '') continue
    out.push({ sid, exited: item.exited === true, agentOwned: item.agentOwned === true })
  }
  return out
}

/**
 * 标签栏上真正有几个标签（嵌入终端不算）。「⋯」的显隐判据用它：只剩嵌入会话时那个入口
 * 是纯噪音，而 `tabs.size` 会把别人的终端算进来。
 *
 * @param list - 同 {@link bulkClosePlan}。
 * @returns {number}
 */
export function panelTabCount(list) {
  return normalize(list).length
}

/** 一组待关标签的摘要：条数 / 其中活会话与 AI 开的条数 / 要不要先问一句。 */
function summarize(items) {
  const sids = items.map((item) => item.sid)
  const live = items.filter((item) => item.exited !== true)
  return {
    sids,
    live: live.length,
    agentLive: live.filter((item) => item.agentOwned === true).length,
    confirm: live.length >= 2,
  }
}

/**
 * 「关闭其他 / 关闭左侧 / 关闭右侧 / 清理已退出」四组目标（右键菜单与「⋯」列表共用同一份
 * 判据，只有参照标签不同：右键是那一个标签，列表是当前活动标签）。
 *
 * `others` = `left` ∪ `right`（同一份切片的两半，所以三行必然自洽）。
 *
 * @param list - 标签快照（标签栏顺序）；嵌入终端与无 sid 的条目由本函数滤掉。
 * @param refSid - 参照标签的 sid；空 / 不在列表里时 `left` / `right` 都为空、`others` 为全部。
 * @returns {{ others: object, left: object, right: object, exited: object }} 每组形如
 *   `{ sids: string[], live: number, agentLive: number, confirm: boolean }`。
 *   `left` / `right` 都**不含**参照标签自己（方向性关闭不该把参照关掉）；`exited` 与参照
 *   无关，是全局的只读保留清理（它 `live` 恒为 0、`confirm` 恒为 false）。
 */
export function bulkClosePlan(list, refSid) {
  const items = normalize(list)
  if (items.length === 0) return { others: EMPTY_GROUP, left: EMPTY_GROUP, right: EMPTY_GROUP, exited: EMPTY_GROUP }
  const ref = typeof refSid === 'string' ? refSid : ''
  const at = items.findIndex((item) => item.sid === ref)
  return {
    others: summarize(at < 0 ? items : items.filter((item) => item.sid !== ref)),
    left: summarize(at < 0 ? [] : items.slice(0, at)),
    right: summarize(at < 0 ? [] : items.slice(at + 1)),
    exited: summarize(items.filter((item) => item.exited === true)),
  }
}
