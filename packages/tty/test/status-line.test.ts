/**
 * @hyzyn/dsh-tty — 面板「状态胶囊」归属的回归测试。
 *
 * 实测踩过的 bug（用户报「窗口关了，错误迟迟不消失」）：胶囊是一个全局槽位，`ready` /
 * `exit` / `error` 三个 WS 帧都无条件往它写，而切标签 / 关标签没有任何一处重算。
 * 于是那台 SSH 握手超时的主机把红字写进去之后，关掉它的标签、切到已连上的标签，
 * 红字都还挂在头上——只能等下一次 ready/exit/error 把它覆盖掉。
 *
 * 修法：胶囊记下自己「讲的是哪个标签」，切/关标签后归属 ≠ 活动标签就用活动标签自己
 * 记下的状态重算。下面两条分别钉住「重算判定」与「按标签状态取值」。
 */
import { describe, expect, it } from 'vitest'
import { eventOwnsStatus, needsStatusResync, statusForTab } from '../client-src/status-line.js'

describe('eventOwnsStatus', () => {
  it('【本 bug】后台标签的失败不占胶囊（否则它在别的主机上顶掉你正看着的状态）', () => {
    // 实测：先在 lab-a 点连接，再开 lab-b 并连上，lab-a 的握手超时才失败
    expect(eventOwnsStatus('sess-bg', 'sess-active')).toBe(false)
  })

  it('活动标签自己的事件照常占胶囊', () => {
    expect(eventOwnsStatus('sess-active', 'sess-active')).toBe(true)
  })

  it('宿主级 / 面板级事件（无 sid）任何情况下都占胶囊', () => {
    // 会话数上限、宿主级报错、WebSocket 连接中/断开重连：它们讲的是整块面板
    expect(eventOwnsStatus(undefined, 'sess-active')).toBe(true)
    expect(eventOwnsStatus(null, 'sess-active')).toBe(true)
    expect(eventOwnsStatus('', 'sess-active')).toBe(true)
    expect(eventOwnsStatus('', null)).toBe(true)
  })
})

describe('needsStatusResync', () => {
  it('【本 bug】胶囊还挂在刚被关掉的那个失败标签上 → 必须重算', () => {
    // 例：关掉 192.0.2.10 那个连不上的标签后，活动标签是已连上的那台
    expect(needsStatusResync('sess-failed', 'sess-live')).toBe(true)
  })

  it('切到另一个标签 → 必须重算', () => {
    expect(needsStatusResync('sess-b', 'sess-a')).toBe(true)
  })

  it('胶囊讲的就是活动标签 → 不动（别盖掉刚写进去的瞬时消息）', () => {
    expect(needsStatusResync('sess-a', 'sess-a')).toBe(false)
    // 面板级 / 宿主级消息（null）与「没有活动标签」（null）一致：不动
    expect(needsStatusResync(null, null)).toBe(false)
  })

  it('宿主级消息（null）不被切标签抹掉：它讲的是整块面板（连接断开等）', () => {
    expect(needsStatusResync(null, 'sess-a')).toBe(false)
  })

  it('最后一个标签被关掉（活动标签变 null）→ 要重算成空', () => {
    expect(needsStatusResync('sess-a', null)).toBe(true)
  })
})

describe('statusForTab', () => {
  it('【本 bug】已连上的标签回的是它自己的「已连接」，不是上一个标签的错误', () => {
    // 关键：错误文本记在失败标签自己身上（statusText），活动标签有自己的那条
    const failed = { sid: 'sess-failed', errored: true, statusText: '错误：SSH 连接失败（hsadmin@192.0.2.10）：Timed out while waiting for handshake', statusState: 'error' }
    const live = { sid: 'sess-live', live: true, statusText: 'SSH root@192.0.2.161 已连接', statusState: 'connected' }
    expect(statusForTab(failed)).toEqual({ text: failed.statusText, state: 'error' })
    expect(statusForTab(live)).toEqual({ text: 'SSH root@192.0.2.161 已连接', state: 'connected' })
  })

  it('没有活动标签（标签全关了）→ 清空', () => {
    expect(statusForTab(undefined)).toEqual({ text: '', state: '' })
    expect(statusForTab(null)).toEqual({ text: '', state: '' })
  })

  it('连上过又退出：退出不需要再报警', () => {
    expect(statusForTab({ exited: true, live: false })).toEqual({ text: '会话已退出', state: '' })
    expect(statusForTab({ exited: true, live: false, statusText: '已退出 code=0', statusState: '' })).toEqual({ text: '已退出 code=0', state: '' })
  })

  it('还没连上：连接中（没记过状态时的兜底文案）', () => {
    expect(statusForTab({ sid: 's' })).toEqual({ text: '连接中…', state: '' })
    expect(statusForTab({ sid: 's', live: true })).toEqual({ text: '已连接', state: 'connected' })
    expect(statusForTab({ sid: 's', errored: true })).toEqual({ text: '连接出错', state: 'error' })
  })
})
