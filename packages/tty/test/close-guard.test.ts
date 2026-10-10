/**
 * @hyzyn/dsh-tty — 「关面板要不要先问一句」的判据（D98 / issue #8）。
 *
 * 报告人的建议是「存在多个标签页时二次确认」。本用例钉住的是**改过的口径**：判据是
 * 「这一下会结束掉几条活会话」，不是「开了几个标签」——一个在跑命令的标签比五个空标签
 * 更需要拦，而空面板/只剩只读保留时弹框纯属噪音（确认弹多了会被点成习惯）。
 *
 * 反向验证（本用例的存在理由）：把 `confirm` 改成「tabs.size > 1」，
 * 「只有一条活会话也要问」与「两条空壳标签不该问」两条会立刻红。
 */
import { describe, expect, it } from 'vitest'

import { closePanelSummary } from '../client-src/close-guard.js'

/** 用户自己开的活标签。 */
const liveTab = (extra = {}) => ({ sid: 'u1', agentOwned: false, exited: false, embedded: false, ...extra })
/** AI 开的活标签（`tty_open` / `tty_run` 建的就在标签栏里）。 */
const agentTab = (extra = {}) => ({ sid: 'a1', agentOwned: true, exited: false, embedded: false, ...extra })

describe('closePanelSummary', () => {
  it('一条活会话也要问（不按标签数判）', () => {
    expect(closePanelSummary([liveTab()])).toEqual({ live: 1, agentLive: 0, confirm: true })
  })

  it('多条活会话照常数出来，并分辨出 AI 开的那几条', () => {
    const summary = closePanelSummary([liveTab(), agentTab({ sid: 'a1' }), agentTab({ sid: 'a2' })])
    expect(summary).toEqual({ live: 3, agentLive: 2, confirm: true })
  })

  it('标签多但全是只读保留 / 全空 → 不问', () => {
    const retained = [liveTab({ sid: 'r1', exited: true }), liveTab({ sid: 'r2', exited: true })]
    expect(closePanelSummary(retained)).toEqual({ live: 0, agentLive: 0, confirm: false })
    expect(closePanelSummary([])).toEqual({ live: 0, agentLive: 0, confirm: false })
  })

  it('嵌入终端不算：关 tty 面板不会结束它', () => {
    expect(closePanelSummary([liveTab({ embedded: true })]).confirm).toBe(false)
    expect(closePanelSummary([liveTab({ embedded: true }), liveTab()])).toEqual({ live: 1, agentLive: 0, confirm: true })
  })

  it('exited 字段缺席按活会话算（口径与 session-live 的 exited !== true 一致）', () => {
    const { exited, ...withoutField } = liveTab()
    expect(exited).toBe(false)
    expect(closePanelSummary([withoutField])).toEqual({ live: 1, agentLive: 0, confirm: true })
  })

  it('垃圾输入不抛：非可迭代 / null 条目 / 非对象条目', () => {
    const empty = { live: 0, agentLive: 0, confirm: false }
    expect(closePanelSummary(undefined)).toEqual(empty)
    expect(closePanelSummary(null)).toEqual(empty)
    expect(closePanelSummary({ size: 3 })).toEqual(empty)
    expect(closePanelSummary([null, 'tab', 7, liveTab()])).toEqual({ live: 1, agentLive: 0, confirm: true })
  })

  it('传 Map.values() 也能用（调用点就是这么传的）', () => {
    const tabs = new Map([['u1', liveTab()], ['a1', agentTab()], ['r1', liveTab({ sid: 'r1', exited: true })]])
    expect(closePanelSummary(tabs.values())).toEqual({ live: 2, agentLive: 1, confirm: true })
  })
})
