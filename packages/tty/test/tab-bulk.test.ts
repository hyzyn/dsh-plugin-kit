/**
 * @hyzyn/dsh-tty — 「一下关掉一批标签」的选择与确认判据（0.29.0）。
 *
 * 用户报告：「现在一个个关闭体验不是特别好」——面板里攒了几个标签只能一个个点 ✕。
 * 入口落在两处（标签右键菜单 / 「⋯」列表），但**判据只有这一份**：哪些标签算「其他」、
 * 算「左侧 / 右侧」，以及这一下要不要先问一句。
 *
 * 反向验证（本用例的存在理由）：
 *   - 把 `right` 写成「参照标签之后的**全部**（含参照自己）」→「关闭右侧」会把参照一起关掉，红；
 *   - 把 `left` 写成「参照之前的全部（含参照自己）」→「关闭左侧」同上，红；
 *   - 把嵌入终端也算进来 → 关一次标签会替 dsh-docker 结束它挂进来的终端，红；
 *   - 把确认退回「条数 > 1」→「只关一条活会话也弹框」（与 ✕ 手感不一致，纯噪音），红。
 */
import { describe, expect, it } from 'vitest'

import { bulkClosePlan, panelTabCount } from '../client-src/tab-bulk.js'

/** 用户自己开的活标签。 */
const live = (sid, extra = {}) => ({ sid, embedded: false, exited: false, agentOwned: false, ...extra })
/** 已退出（D77 只读保留）的标签。 */
const dead = (sid) => ({ sid, embedded: false, exited: true, agentOwned: false })
/** 别的插件挂进来的嵌入终端。 */
const embedded = (sid) => ({ sid, embedded: true, exited: false, agentOwned: false })

const sidsOf = (group) => group.sids

describe('bulkClosePlan', () => {
  it('参照标签在中间：其他 = 前后两条（保持标签栏顺序），左侧 / 右侧各是它一侧', () => {
    const plan = bulkClosePlan([live('a'), live('b'), live('c')], 'b')
    expect(sidsOf(plan.others)).toEqual(['a', 'c'])
    expect(sidsOf(plan.left)).toEqual(['a'])
    expect(sidsOf(plan.right)).toEqual(['c'])
  })

  it('「关闭左侧 / 关闭右侧」都不含参照标签自己，也不含另一侧那些', () => {
    const plan = bulkClosePlan([live('a'), live('b'), live('c'), live('d')], 'b')
    expect(sidsOf(plan.left)).toEqual(['a'])
    expect(sidsOf(plan.right)).toEqual(['c', 'd'])
    // 三条批量行必然自洽：others = left ∪ right（同一份切片的两半）
    expect([...sidsOf(plan.left), ...sidsOf(plan.right)]).toEqual(sidsOf(plan.others))
    expect(sidsOf(plan.left)).not.toContain('b')
    expect(sidsOf(plan.right)).not.toContain('b')
    expect(sidsOf(plan.others)).not.toContain('b')
  })

  it('参照在头上 → 「关闭左侧」空；在末尾 → 「关闭右侧」空（那一行都该消失）', () => {
    const first = bulkClosePlan([live('a'), live('b')], 'a')
    expect(sidsOf(first.left)).toEqual([])
    expect(first.left.confirm).toBe(false)
    expect(sidsOf(first.right)).toEqual(['b'])
    const last = bulkClosePlan([live('a'), live('b')], 'b')
    expect(sidsOf(last.right)).toEqual([])
    expect(last.right.confirm).toBe(false)
    expect(sidsOf(last.left)).toEqual(['a'])
    expect(sidsOf(last.others)).toEqual(['a'])
  })

  it('参照不在列表里（活动标签刚被关掉）→ 其他 = 全部，两侧都空；空列表全空', () => {
    const plan = bulkClosePlan([live('a'), live('b')], 'gone')
    expect(sidsOf(plan.others)).toEqual(['a', 'b'])
    expect(sidsOf(plan.left)).toEqual([])
    expect(sidsOf(plan.right)).toEqual([])
    const empty = bulkClosePlan([], 'a')
    expect(empty.others).toEqual({ sids: [], live: 0, agentLive: 0, confirm: false })
    expect(empty.left).toEqual({ sids: [], live: 0, agentLive: 0, confirm: false })
    expect(empty.exited.sids).toEqual([])
    expect(bulkClosePlan(null, 'a').others.sids).toEqual([])
  })

  it('嵌入终端不算：它是别的插件的终端，不进任何一组（左侧也照样跳过它）', () => {
    const plan = bulkClosePlan([live('a'), embedded('docker-1'), live('b')], 'b')
    expect(sidsOf(plan.left)).toEqual(['a'])
    expect(sidsOf(plan.others)).toEqual(['a'])
    expect(sidsOf(plan.right)).toEqual([])
    expect(sidsOf(plan.exited)).toEqual([])
    expect(panelTabCount([live('a'), embedded('docker-1'), live('b')])).toBe(2)
  })

  it('已退出的标签照样可关（「关闭其他」要能顺带收掉只读保留），但不计入活会话', () => {
    const plan = bulkClosePlan([live('a'), dead('r1'), dead('r2')], 'a')
    expect(sidsOf(plan.others)).toEqual(['r1', 'r2'])
    expect(plan.others.live).toBe(0)
    expect(sidsOf(plan.exited)).toEqual(['r1', 'r2'])
    expect(plan.exited.confirm).toBe(false)
  })

  it('确认口径：一下结束 ≥2 条活会话才问，只关一条与点 ✕ 同手感（不问）', () => {
    expect(bulkClosePlan([live('a'), live('b')], 'a').others).toEqual({ sids: ['b'], live: 1, agentLive: 0, confirm: false })
    const many = bulkClosePlan([live('a'), live('b'), live('c')], 'a')
    expect(many.others).toEqual({ sids: ['b', 'c'], live: 2, agentLive: 0, confirm: true })
    // 活 + 死混在一起：只数活的
    const mixed = bulkClosePlan([live('a'), dead('r1'), live('b')], 'a')
    expect(mixed.others).toEqual({ sids: ['r1', 'b'], live: 1, agentLive: 0, confirm: false })
    // 方向性关闭与「关闭其他」同一把尺子（同一处 summarize）
    expect(bulkClosePlan([live('a'), live('b'), live('c')], 'c').left).toEqual({ sids: ['a', 'b'], live: 2, agentLive: 0, confirm: true })
  })

  it('AI 开的活会话单独数出来（确认文案要说清「可能正在跑命令」）', () => {
    const plan = bulkClosePlan([
      live('a'),
      live('x', { agentOwned: true }),
      live('y', { agentOwned: true }),
      dead('z'),
    ], 'a')
    expect(plan.others).toEqual({ sids: ['x', 'y', 'z'], live: 2, agentLive: 2, confirm: true })
    // 已经退出的 AI 标签不算「AI 正在跑」
    const stale = bulkClosePlan([live('a'), { sid: 'x', exited: true, agentOwned: true }], 'a')
    expect(stale.others.agentLive).toBe(0)
  })
})
