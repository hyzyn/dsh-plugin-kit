/**
 * @hyzyn/dsh-tty — 「关面板要不要先问一句」的纯判据（D98 / issue #8）。
 *
 * ## 事故（用户报告）
 *
 * 面板右上角的 ✕ 看着像「关窗口」，实际是**结束全部会话**（`closeModal` 对每个未退出的
 * 标签发 `kill`，tmux 持久标签连 `kill-session`）。报告人已经多次在 AI 正跑任务时误点，
 * 因为他把 ✕ 记成了「最小化」——而旁边那个真正的最小化是「—」，点弹窗外空白处也是。
 * 同一条破坏性路径还有最小化后悬浮条上的 ✕。
 *
 * ## 判据：按「会损失什么」而不是「开了几个标签」
 *
 * 报告人的建议是「存在多个标签页时确认」。那不划算：
 *
 * - 一个**正在跑命令**的标签，比五个停在提示符的空标签更需要拦；
 * - 只有一个空闲 shell（或只剩只读保留）时弹框，是纯噪音——确认弹多了会被点成习惯。
 *
 * 所以判据是「这一下会结束掉几条**活会话**」：`exited !== true`（与 D85 的活会话口径
 * 一致）且不是嵌入终端。空面板 / 只剩只读保留 → 不弹，直接关。
 *
 * 与 docker 面板同款先例（`confirm.endTerminal*`：有活动容器终端会话时关面板要确认），
 * 所以这不是给 tty 单开一套手感。
 *
 * ## 为什么单开一个文件
 *
 * `client-src/index.js` 是浏览器 IIFE 入口、没有导出，逻辑放在里面只能靠真机点
 * （同 `session-live.js` / `fit-size.js` / `dock-owner.js`）。这里的判据是纯的，
 * 抽出来可以用 vitest 钉住；esbuild 打包时按普通本地模块内联，产物形态不变。
 */

/**
 * 关面板的代价摘要。
 *
 * @param tabs - 可迭代的客户端标签对象（传 `tabs.values()`）；每条取
 *   `{ embedded, exited, agentOwned }` 三个字段的子集。
 * @returns {{ live: number, agentLive: number, confirm: boolean }}
 *   `live` = 会被结束的活会话条数；`agentLive` = 其中 AI（`tty_open` / `tty_run`）开的
 *   条数（用来把文案写准：那些是 AI 正在跑的活）；`confirm` = 要不要先问一句。
 */
export function closePanelSummary(tabs) {
  const empty = { live: 0, agentLive: 0, confirm: false }
  if (tabs === null || tabs === undefined || typeof tabs[Symbol.iterator] !== 'function') return empty
  let live = 0
  let agentLive = 0
  for (const tab of tabs) {
    if (tab === null || typeof tab !== 'object') continue
    // 嵌入终端挂在消费方（dsh-docker 抽屉）里：关 tty 面板不会结束它，别算进去
    if (tab.embedded === true) continue
    // 只读保留（D77）不是活会话：它既不占名额，也不是「正在跑」的东西
    if (tab.exited === true) continue
    live += 1
    if (tab.agentOwned === true) agentLive += 1
  }
  return { live, agentLive, confirm: live > 0 }
}
