/**
 * @hyzyn/dsh-tty — 面板顶部「状态胶囊」跟着哪个标签（纯逻辑）。
 *
 * 为什么单独成文件：`client-src/index.js` 是浏览器 IIFE 入口，没有导出，逻辑放在里面
 * 就只能靠真机点。这两个函数是纯函数、不碰任何模块级状态，抽出来可以直接用 vitest
 * 钉住（esbuild 打包时按普通本地模块内联，产物形态不变）。
 *
 * 实测踩过的 bug（用户报「窗口关了，错误迟迟不消失」）：面板级状态胶囊是**一个**全局
 * 槽位，而 `ready` / `exit` / `error` 三个 WS 帧都无条件往它写；关闭标签 / 切换标签
 * 又没有任何一处重算。于是那台连不上的 SSH 主机握手超时后，红字一直挂在头上——
 * 关掉它的标签、切到已经连上的标签都不会消失，只能等下一次 ready/exit/error 覆盖。
 *
 * 语义定下来的规则：胶囊**属于某个标签**（宿主级消息除外），切/关标签后若归属不是新的
 * 活动标签，就用活动标签自己记下的状态重算。
 */

/**
 * 活动标签该在胶囊里显示什么。
 *
 * 优先用它自己记下的 `statusText` / `statusState`（ready / exit / error 帧写进来的
 * 原文，含 SSH 失败原因、退出码等细节），没记过才按会话状态给一句兜底文案。
 *
 * @param tab 活动标签对象（`tabs.get(activeSid)`）；没有活动标签时传 undefined。
 * @returns `{ text, state }`，交给 `setStatus`。
 */
export function statusForTab(tab) {
  if (tab === undefined || tab === null) return { text: '', state: '' }
  if (tab.exited === true) return { text: tab.statusText ?? '会话已退出', state: tab.statusState ?? '' }
  if (tab.live === true) return { text: tab.statusText ?? '已连接', state: tab.statusState ?? 'connected' }
  if (tab.errored === true) return { text: tab.statusText ?? '连接出错', state: tab.statusState ?? 'error' }
  return { text: tab.statusText ?? '连接中…', state: tab.statusState ?? '' }
}

/**
 * 这条会话事件该不该显示在胶囊里。
 *
 * 只有**活动标签**的会话事件、以及宿主级事件（`sid` 为空：会话数上限、宿主级报错）
 * 才该占用胶囊。后台标签的失败只落在它自己身上——标签栏状态点转红、终端区浮层带原文，
 * 而胶囊长在活动标签的连接栏旁边，写进去就是在说「你现在看的这个会话有问题」。
 *
 * 实测踩过（用户连报两次同一个现象）：先在 lab-a 上点连接、再开 lab-b 并连上，
 * 之后 lab-a 的握手超时才失败——那条后台错误顶掉了已连上标签的状态，红字就那么挂着，
 * 既没关标签可关（失败标签还留着）、也没切标签可切（早就切过来了）。
 *
 * @param sid 事件所属标签；宿主级事件传 undefined / ''。
 * @param activeSid 当前活动标签。
 */
export function eventOwnsStatus(sid, activeSid) {
  if (typeof sid !== 'string' || sid === '') return true
  return sid === activeSid
}

/**
 * 胶囊当前归属与活动标签不一致时要不要重算。
 *
 * 两种情况**不动**：
 *   - 归属就是活动标签 —— 那可能是刚写进去的瞬时消息（SFTP 传输进度、删除结果……），
 *     用标签状态把它盖掉反而是倒退；
 *   - 归属是 `null`（面板级 / 宿主级消息）—— 它讲的是整块面板（WebSocket 连接中、
 *     断开重连、宿主级报错），切标签不该把它抹掉；标签自己的状态已经从「连接断开」
 *     浮层里可见。
 *
 * @param statusSid 胶囊当前讲的标签 sid；null = 面板级 / 宿主级消息（不属于任何标签）。
 * @param activeSid 当前活动标签 sid；null = 没有活动标签（标签全关了）。
 */
export function needsStatusResync(statusSid, activeSid) {
  if (statusSid === null) return false
  return statusSid !== activeSid
}
