/**
 * @hyzyn/dsh-tty — 「当前会话工作目录」取值的回归测试。
 *
 * 与 docker 的 current-session 同源：DSH 0.1.6 把视图选中项搬出了会话域，`sessions.list`
 * 快照不再有 `current`。旧实现 `byId[snapshot.current].cwd` 于是永远取不到 cwd —— 新开的
 * 本地终端不再落在当前会话的工作目录下（宿主回退到它自己的启动目录）。
 */
import { describe, expect, it } from 'vitest'
import { currentSessionCwd, currentSessionIdOf, mainViewSessionId } from '../client-src/current-session.js'

/** DSH 0.1.6 的真实形状：没有 current，选中项靠 retainedBy.mainView 标记。 */
const SNAPSHOT_016 = {
  ids: ['sess-a', 'sess-b'],
  byId: {
    'sess-a': { id: 'sess-a', cwd: '/repo/a', retainedBy: {} },
    'sess-b': { id: 'sess-b', cwd: '/repo/b', retainedBy: { mainView: 1 } },
  },
  phase: 'ready',
}

describe('currentSessionCwd', () => {
  it('0.1.6：跟随带 mainView 标记的那个会话', () => {
    expect(currentSessionCwd(SNAPSHOT_016)).toBe('/repo/b')
  })

  it('≤0.1.5：跟随 current（老宿主行为不变）', () => {
    const legacy = { current: 'sess-a', byId: SNAPSHOT_016.byId }
    expect(currentSessionIdOf(legacy)).toBe('sess-a')
    expect(currentSessionCwd(legacy)).toBe('/repo/a')
  })

  it('会话没有 cwd（新建空白会话）/ 没有当前会话 → undefined（宿主用默认目录）', () => {
    expect(currentSessionCwd({ byId: { x: { retainedBy: { mainView: 1 } } } })).toBeUndefined()
    expect(currentSessionCwd({ byId: { x: { cwd: '', retainedBy: { mainView: 1 } } } })).toBeUndefined()
    expect(currentSessionCwd({ ids: [], byId: {} })).toBeUndefined()
    expect(currentSessionCwd(undefined)).toBeUndefined()
  })

  it('id 对不上任何行时不猜（宁可回落宿主默认，也不给错目录）', () => {
    expect(currentSessionCwd({ current: 'gone', byId: { other: { cwd: '/repo/other' } } })).toBeUndefined()
  })

  it('mainView 计数 0 不算选中；坏形状不抛', () => {
    expect(mainViewSessionId({ byId: { x: { retainedBy: { mainView: 0 } } } })).toBeUndefined()
    expect(mainViewSessionId({ byId: null })).toBeUndefined()
    expect(currentSessionCwd({ byId: 'nonsense' })).toBeUndefined()
  })
})
