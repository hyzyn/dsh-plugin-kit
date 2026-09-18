/**
 * @hyzyn/dsh-tty — 「侧栏挂载位归属哪个标签」的回归测试。
 *
 * 实测踩过的 bug：在标签 A（连接簿 `lab-b`）打开 SFTP 文件浏览，切到标签 B
 * （`192.0.2.10`）后面板没跟着切——标题写着 `SFTP · lab-b`，底下活动标签
 * 是 192.0.2.10，面板里躺着**另一台主机**的文件列表；同一个 bug 也砸中 dsh-docker
 * 挂进来的容器面板（hint 里的目标与标签对不上）。修复=挂载位记归属标签，切换时收起
 * 不属于当前标签的那块（收起 ≠ 关掉：消费方的 React 树与在途传输都保活）。
 *
 * 另一个连带现象：在 A 开了 SFTP、切到 B 再点连接栏「SFTP」毫无反应——单例判据此前
 * 是全局的，A 收起的面板把 B 的入口堵死了。
 */
import { describe, expect, it } from 'vitest'
import { DOCK_OWNER_GLOBAL, dockPaneVisible, resolveDockOwner } from '../client-src/dock-owner.js'

describe('resolveDockOwner', () => {
  it('省略 ownerSid = 归属当前活动标签（连接栏 SFTP / 容器按钮的默认路径）', () => {
    expect(resolveDockOwner(undefined, 'tab-a')).toBe('tab-a')
  })

  it('显式给的 sid 优先于活动标签（为后台标签挂载也不串台）', () => {
    expect(resolveDockOwner('tab-b', 'tab-a')).toBe('tab-b')
  })

  it('ownerSid: null = 不隶属任何标签（按连接簿条目浏览的那条路）', () => {
    expect(resolveDockOwner(null, 'tab-a')).toBe(DOCK_OWNER_GLOBAL)
    // 面板开着但一个标签都没有，也要有落脚点
    expect(resolveDockOwner(undefined, null)).toBe(DOCK_OWNER_GLOBAL)
    expect(resolveDockOwner(undefined, '')).toBe(DOCK_OWNER_GLOBAL)
  })

  it('空串 / 非法值按「没传」处理，不会造出一个空归属键', () => {
    expect(resolveDockOwner('', 'tab-a')).toBe('tab-a')
    expect(resolveDockOwner(0, 'tab-a')).toBe('tab-a')
  })
})

describe('dockPaneVisible', () => {
  const sid = 'tab-0001'

  it('归属当前标签 → 显示', () => {
    expect(dockPaneVisible(sid, sid)).toBe(true)
  })

  it('归属别的标签 → 收起（这就是「切换页签、面板没切」的修复点）', () => {
    expect(dockPaneVisible('tab-0002', sid)).toBe(false)
  })

  it('不隶属任何标签 → 一直显示（与标签切换无关）', () => {
    expect(dockPaneVisible(DOCK_OWNER_GLOBAL, sid)).toBe(true)
    expect(dockPaneVisible(DOCK_OWNER_GLOBAL, null)).toBe(true)
  })

  it('活动标签为空（面板刚开、标签全关了）→ 只有全局面板可见', () => {
    expect(dockPaneVisible(sid, null)).toBe(false)
    expect(dockPaneVisible(sid, '')).toBe(false)
  })

  it('全局键用 \\0 前缀：不可能与真实 sid 撞车', () => {
    expect(DOCK_OWNER_GLOBAL.startsWith('\u0000')).toBe(true)
  })
})
