/**
 * @hyzyn/dsh-tty — 「宿主里这条会话还算活着吗」的纯判据（D85）。
 *
 * 为什么单独成文件：`client-src/index.js` 是浏览器 IIFE 入口、没有导出，逻辑放在里面就
 * 只能靠真机点（同 `fit-size.js` / `dock-owner.js` / `stats-bar.js`）。这里的判据是纯的，
 * 抽出来可以直接用 vitest 钉住；esbuild 打包时按普通本地模块内联，产物形态不变。
 *
 * ## 事故（0.22.2，用户截图）
 *
 * 面板里一条标签都没有——agent 开的会话都跑完/关掉了——点「+」却弹：
 * 「会话数已达上限（共 6 个 / 上限 4：本窗口 0 个 + 其他窗口 6 个）——关闭不用的窗口/标签」。
 * 可面板里根本没有标签可关，终端从此开不出来，只能等宿主重启。
 *
 * 根因：宿主的 `sessions` 帧给的 list 是**全部会话快照**，而 D77 起其中还有
 * 「进程已经退出、只读保留着以便随时读输出」的会话（`exited: true`，agent 每跑一条
 * 一次性命令就留一条，最多留 16 条）。宿主自己的名额判据数的是活着的会话
 * （`SessionManager.canSpawn` → `liveCount`，**不含** exited），客户端的上限预检却直接拿
 * `list.length` 当并发数 ⇒ 保留态被算成了活会话；agent 跑几条一次性命令之后，
 * 用户的「+」就被自己的客户端拦死——此时宿主的 `spawn` 其实是会放行的。
 *
 * ## 契约
 *
 * **「宿主表里有这一条」≠「这一条还活着」。** 两张判据分开用，别互相替代：
 *
 * - **能不能 attach 回去**：用帧里的 `attachable`（宿主只对「活着且无客户端」的会话置
 *   true，保留态一律 false）；
 * - **还活着 / 占不占并发名额**：`exited !== true`（本文件）。
 *
 * 特别注意不能用 `attachable` 当「活着」：别的窗口正开着的会话 `attachable === false`
 * 但**确实活着、确实占名额**（单 PTY 多客户端扇出）。拿它当判据会漏数，反而让客户端
 * 放行、被宿主拒绝。
 *
 * 与宿主 `SessionManager.listForAttach()` 的口径一致：保留态不占名额。
 */

/** 「这条快照还是一条活着的会话」：`exited !== true`（字段缺席 = 活着；true = 只读保留）。 */
export function isLiveSessionEntry(entry) {
  return entry !== null && typeof entry === 'object' && entry.exited !== true
}

/**
 * 活会话条数（并发上限预检用的口径）。
 *
 * 非数组、`null`、字符串等垃圾条目一律不计——「数不清」时宁可少数（客户端预检只是
 * 提前提醒，真正兜底的是宿主的 `canSpawn`，少数最多是让宿主去拒绝）。
 */
export function countLiveSessions(list) {
  if (!Array.isArray(list)) return 0
  let live = 0
  for (const entry of list) if (isLiveSessionEntry(entry)) live += 1
  return live
}

/**
 * 活会话的 sid 集合（判「这个 sid 还在宿主里活着 / 还能 attach」）。
 *
 * 保留态的 sid **不进集合**：D77 起宿主对保留态的 `attach` 明确拒绝，把它当活的
 * 只会让标签卡在一个永远不出输出的「假在线」状态上；正确的后续是重新 spawn
 * （持久标签按 tmux 名接回、命令标签重跑一次）。
 */
export function liveSessionSids(list) {
  const sids = new Set()
  if (!Array.isArray(list)) return sids
  for (const entry of list) {
    if (!isLiveSessionEntry(entry)) continue
    if (typeof entry.sid === 'string' && entry.sid !== '') sids.add(entry.sid)
  }
  return sids
}
