/**
 * @hyzyn/dsh-docker — 「当前会话」的取值（跨 DSH 版本）。
 *
 * 为什么单独成文件：`client-src/index.js` 是浏览器 IIFE 入口，没有导出，逻辑放在
 * 里面就只能靠真机点。这里是纯函数、不碰模块级缓存，抽出来可以直接用 vitest 钉住
 * （esbuild 打包时按普通本地模块内联，产物形态不变）。
 *
 * 两个版本的事实来源（对着装好的宿主实测 + 官方源码）：
 *
 *   - **≤ DSH 0.1.5**：会话控制器自己持有视图选中项 —— `sessions.list` 的快照里带
 *     `current`（官方注释：「carries `current`, the persisted selection …）」。
 *   - **≥ DSH 0.1.6**：选中项搬出了会话域（会话控制器 0.1.6 的接口注释：「Host catalog
 *     and local reference allocator; **view selection remains outside the Controller**」），
 *     快照只剩 `ids / byId / phase / subagentsByParent / jobsBySession`。此时的权威标记
 *     是 **`retainedBy.mainView > 0`**：主视图正在展示的会话被视图持有者 retain 着，官方
 *     `dsh-client-ui-session` 与本地 codegraph 插件都这么取（见 codegraph 的
 *     `activeSessionCwd`）。
 *
 * 只认老字段的实测后果：宿主升到 0.1.6 后 `snapshot.current` 恒为 `undefined`，日志右键
 * 「问 Agent」被判成「当前没有打开的会话」——两个菜单项全灰，功能整体失效且不报错。
 */

/**
 * 主视图正在展示的会话 id。
 *
 * 判据 `retainedBy.mainView > 0`：视图持有者（ui-workspace）在切会话时 retain 新会话、
 * release 旧的，所以列表快照里同一时刻只有一行带这个计数。找不到返回 `undefined`。
 *
 * @param snapshot - `sessions.list.getSnapshot()` 的返回值（形状见 SessionListState）。
 */
export function mainViewSessionId(snapshot) {
  const byId = snapshot?.byId
  if (byId === null || typeof byId !== 'object') return undefined
  for (const id of Object.keys(byId)) {
    const retained = byId[id]?.retainedBy?.mainView ?? 0
    if (typeof retained === 'number' && retained > 0) return id
  }
  return undefined
}

/**
 * 当前会话 id（跨版本）：老版本的 `current` 优先（它在 ≤0.1.5 是权威字段），
 * 没有才看 0.1.6 的 `retainedBy.mainView` 标记。
 *
 * @param snapshot - `sessions.list.getSnapshot()` 的返回值。
 * @returns 会话 id；读不到（没有打开的会话 / 宿主形状不认识）时 `undefined`。
 */
export function currentSessionIdOf(snapshot) {
  const legacy = snapshot?.current
  if (typeof legacy === 'string' && legacy !== '') return legacy
  return mainViewSessionId(snapshot)
}
