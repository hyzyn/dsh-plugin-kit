/**
 * @hyzyn/dsh-tty — 「宿主里这条会话还算活着吗」的判据（D85）。
 *
 * 事故（0.22.2，用户截图）：终端面板里**一条标签都没有**（agent 开的会话都跑完/关掉了），
 * 点「+」却弹「会话数已达上限（共 6 个 / 上限 4：本窗口 0 个 + 其他窗口 6 个）——关闭不用的
 * 窗口/标签」。面板里没有标签可关，终端从此开不出来，只能等宿主重启。
 *
 * 现场对得上的三个数字：`本窗口 0 个`（本地确实没有活标签）、`共 6 个`（宿主表里 6 条）、
 * `上限 4`（默认 `maxSessions`）——那 6 条全是 D77 的**只读保留态**（进程已退出、
 * `exited: true`，agent 每跑一条一次性命令留一条，最多留 16 条）。宿主的名额判据数的是
 * 活会话（`SessionManager.canSpawn` → `liveCount`），客户端预检却直接拿 `list.length`
 * 当并发数 ⇒ 保留态被算成活会话 ⇒ agent 跑满 4 条之后用户的「+」被自己的客户端拦死，
 * 而宿主其实会放行。
 *
 * 本文件钉住契约：**「宿主表里有这一条」≠「这一条还活着」**——
 * 能不能 attach 用 `attachable`，还活着 / 占不占名额用 `exited !== true`。
 */
import { describe, expect, it } from 'vitest'
import { countLiveSessions, isLiveSessionEntry, liveSessionSids } from '../client-src/session-live.js'

/** 活会话快照：宿主的 `exited` 字段缺席（只有保留态才带 true）。 */
const live = (sid, extra = {}) => ({ sid, kind: 'local', target: '', ...extra })
/** 只读保留态：进程已退出，快照带 `exited: true`。 */
const retained = (sid, extra = {}) => ({ sid, kind: 'local', target: '', exited: true, exitCode: 0, ...extra })

describe('isLiveSessionEntry', () => {
  it('exited 字段缺席 / 显式 false 都算活着', () => {
    expect(isLiveSessionEntry(live('a'))).toBe(true)
    expect(isLiveSessionEntry(live('a', { exited: false }))).toBe(true)
  })

  it('exited:true（只读保留）不算活着', () => {
    expect(isLiveSessionEntry(retained('a'))).toBe(false)
  })

  it('非对象一律不算', () => {
    expect(isLiveSessionEntry(null)).toBe(false)
    expect(isLiveSessionEntry(undefined)).toBe(false)
    expect(isLiveSessionEntry('sid-1')).toBe(false)
    expect(isLiveSessionEntry(7)).toBe(false)
  })
})

describe('countLiveSessions（并发上限预检的口径）', () => {
  it('事故现场：6 条保留态 + 本窗口 0 条活会话 ⇒ 数出来是 0，不是 6', () => {
    const list = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'].map((sid) => retained(sid, { owner: 'agent' }))
    expect(countLiveSessions(list)).toBe(0)
  })

  it('活会话与保留态混在一条列表里时只数活的', () => {
    expect(countLiveSessions([live('a'), retained('b'), live('c'), retained('d'), retained('e')])).toBe(2)
  })

  it('attachable:false 的活会话照样占名额（别的窗口正开着，单 PTY 多客户端扇出）', () => {
    // 这条是「不能用 attachable 当活着」的护栏：拿它当判据会漏数，
    // 客户端放行 → 宿主拒绝 → 用户看到的是另一条文案完全不同的错误。
    expect(countLiveSessions([live('a', { attachable: false }), retained('b', { attachable: false })])).toBe(1)
  })

  it('列表形态不对时返回 0（宁可少数，交给宿主兜底）', () => {
    expect(countLiveSessions(undefined)).toBe(0)
    expect(countLiveSessions(null)).toBe(0)
    expect(countLiveSessions({})).toBe(0)
    expect(countLiveSessions('sessions')).toBe(0)
  })

  it('列表里的垃圾条目不计入', () => {
    expect(countLiveSessions([null, 'x', 3, live('a')])).toBe(1)
  })
})

describe('liveSessionSids（判「这个 sid 还活着 / 还能 attach」）', () => {
  it('保留态的 sid 不进集合（宿主对它的 attach 明确拒绝）', () => {
    const sids = liveSessionSids([retained('gone'), live('alive')])
    expect(sids.has('gone')).toBe(false)
    expect(sids.has('alive')).toBe(true)
    expect([...sids]).toEqual(['alive'])
  })

  it('attachable:false 的活会话仍在集合里（它只是被别人接着，不是没了）', () => {
    expect([...liveSessionSids([live('shared', { attachable: false })])]).toEqual(['shared'])
  })

  it('sid 不是非空字符串的条目丢弃', () => {
    expect([...liveSessionSids([{ kind: 'local' }, live(''), live('ok'), live(42)])]).toEqual(['ok'])
  })

  it('列表形态不对时返回空集合', () => {
    expect(liveSessionSids(undefined).size).toBe(0)
    expect(liveSessionSids(null).size).toBe(0)
    expect(liveSessionSids({ list: [] }).size).toBe(0)
  })
})
