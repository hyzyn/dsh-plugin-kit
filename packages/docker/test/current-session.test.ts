/**
 * @hyzyn/dsh-docker — 「当前会话」取值的回归测试。
 *
 * 实测踩过的 bug：DSH 0.1.6 把「视图选中项」搬出了会话域（`sessions.list` 快照不再有
 * `current`），docker 的日志右键「问 Agent」仍只读老字段 → 恒为 undefined → 菜单被判成
 * 「当前没有打开的会话」，两个菜单项全灰（功能失效且不报错）。修好之后 0.1.6（mainView
 * 标记）与 ≤0.1.5（current）两种形状都要认。
 */
import { describe, expect, it } from 'vitest'
import { currentSessionIdOf, mainViewSessionId } from '../client-src/current-session.js'

/** DSH 0.1.6 的真实形状：没有 current，选中项靠 retainedBy.mainView 标记。 */
const SNAPSHOT_016 = {
  ids: ['sess-a', 'sess-b'],
  byId: {
    'sess-a': { id: 'sess-a', cwd: '/repo/a', running: false, retainedBy: { mainView: 1 } },
    'sess-b': { id: 'sess-b', cwd: '/repo/b', running: true, retainedBy: {} },
  },
  phase: 'ready',
  subagentsByParent: {},
  jobsBySession: {},
}

describe('currentSessionIdOf（0.1.6：retainedBy.mainView）', () => {
  it('取主视图保留的那一行，而不是列表第一行', () => {
    const flipped = {
      ...SNAPSHOT_016,
      byId: {
        'sess-a': { ...SNAPSHOT_016.byId['sess-a'], retainedBy: {} },
        'sess-b': { ...SNAPSHOT_016.byId['sess-b'], retainedBy: { mainView: 1 } },
      },
    }
    expect(currentSessionIdOf(SNAPSHOT_016)).toBe('sess-a')
    expect(currentSessionIdOf(flipped)).toBe('sess-b')
  })

  it('计数 > 0 才算（0 / 缺字段 / 别的来源都不算）', () => {
    expect(mainViewSessionId({ byId: { x: { retainedBy: { mainView: 0 } } } })).toBeUndefined()
    expect(mainViewSessionId({ byId: { x: { retainedBy: { sidebar: 2 } } } })).toBeUndefined()
    expect(mainViewSessionId({ byId: { x: {} } })).toBeUndefined()
  })

  it('没有打开的会话 → undefined（菜单据此置灰，而不是崩）', () => {
    expect(currentSessionIdOf({ ids: [], byId: {}, phase: 'empty' })).toBeUndefined()
  })

  it('空列表 / 缺字段 / null 快照都不炸', () => {
    expect(currentSessionIdOf(undefined)).toBeUndefined()
    expect(currentSessionIdOf(null)).toBeUndefined()
    expect(currentSessionIdOf({})).toBeUndefined()
    expect(currentSessionIdOf({ byId: null })).toBeUndefined()
    expect(mainViewSessionId({ byId: 'nonsense' })).toBeUndefined()
  })
})

describe('currentSessionIdOf（≤0.1.5：current 字段）', () => {
  it('老宿主仍然照旧（回归：别为了新版本把老版本读法删掉）', () => {
    expect(currentSessionIdOf({ current: 'sess-old', byId: { 'sess-old': {} } })).toBe('sess-old')
  })

  it('current 为空串 / 非字符串 → 退回 mainView 判据', () => {
    expect(currentSessionIdOf({ current: '', byId: { x: { retainedBy: { mainView: 1 } } } })).toBe('x')
    expect(currentSessionIdOf({ current: undefined, byId: { x: { retainedBy: { mainView: 1 } } } })).toBe('x')
  })

  it('两代字段同时存在时以 current 为准（它在老宿主上是权威）', () => {
    expect(currentSessionIdOf({ current: 'sess-old', byId: { x: { retainedBy: { mainView: 1 } } } })).toBe('sess-old')
  })
})
