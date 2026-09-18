/**
 * @hyzyn/dsh-tty — 侧栏挂载位（.tt_dockPane）的「归属标签」纯逻辑。
 *
 * 为什么单独成文件：`client-src/index.js` 是浏览器 IIFE 入口、没有导出，逻辑放在里面
 * 就只能靠真机点。这两个函数是纯函数、不碰任何模块级状态，抽出来可以直接用 vitest
 * 钉住（esbuild 打包时按普通本地模块内联，产物形态不变）。
 *
 * 背景（0.18.4 修复）：挂载位解决的场景（SFTP 文件浏览、dsh-docker 的容器面板）都是
 * **连接级**的——凭证 / 目标来自打开它的那个标签。而挂载位本身此前不认标签：切了标签，
 * 面板还停在原处，于是标题写着 `SFTP · lab-b`、底下活动标签却是 192.0.2.10，
 * 面板里躺着**另一台主机**的文件列表（用户可读不可辨，最坏的情况是往错主机上传）。
 */

/**
 * 「没有标签的全局面板」的归属键。
 *
 * 什么时候会用到：面板开着但一个标签都没有（标签被关光了，或设置卡片 / 连接对话框那条路
 * 压根没建会话），此时面板不隶属任何标签，也就永远可见；消费方也可以显式传
 * `ownerSid: null` 声明「这块与标签无关，别跟着切」。
 *
 * 用 `\0` 前缀是为了不可能与真实 sid 撞车（sid 是宿主生成的十六进制串）。
 */
export const DOCK_OWNER_GLOBAL = '\u0000global'

/**
 * 解析一次挂载的归属键。
 *
 * @param rawOwner - 调用方显式传入的 `ownerSid`：`undefined` = 用当前活动标签；
 *   `null` = 显式声明「不隶属任何标签」（全局面板）；非空字符串 = 指定标签。
 * @param activeSid - 当前活动标签的 sid（无 = null / ''）。
 * @returns 归属键：具体 sid，或 `DOCK_OWNER_GLOBAL`。
 */
export function resolveDockOwner(rawOwner, activeSid) {
  if (rawOwner === null) return DOCK_OWNER_GLOBAL
  if (typeof rawOwner === 'string' && rawOwner !== '') return rawOwner
  return typeof activeSid === 'string' && activeSid !== '' ? activeSid : DOCK_OWNER_GLOBAL
}

/**
 * 归属键为 ownerKey 的面板，在当前活动标签下该不该显示。
 *
 * 「收起」而不是「关掉」是刻意的：摘掉再挂回来会把消费方的 React 树 / 在途传输
 * （SFTP 上传、双栏直传）一起打断——而用户只是切了个标签去看另一台机器。
 *
 * @param ownerKey - 面板的归属键（`resolveDockOwner` 的返回值）。
 * @param activeSid - 当前活动标签的 sid。
 */
export function dockPaneVisible(ownerKey, activeSid) {
  if (ownerKey === DOCK_OWNER_GLOBAL) return true
  return typeof activeSid === 'string' && activeSid !== '' && ownerKey === activeSid
}
