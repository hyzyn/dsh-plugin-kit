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
import {
  agentTabDisposition,
  countLiveSessions,
  isLiveSessionEntry,
  liveSessionSids,
  sessionFrameIndex,
} from '../client-src/session-live.js'

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

/**
 * D97（#7④）：agent 标签的处置。这三张表把「还在不在表里」与「还活着吗」分开——
 * 只读保留态**在表里、不活着**（标签留着可读），宿主显式退役之后**连表都不在**
 * （标签跟着关）。混成一件事就会出现两种错：把 `tty_run keep:true` 的可读现场收掉，
 * 或者让 agent 释放过的标签永远挂着。
 */
describe('sessionFrameIndex', () => {
  it('三张表各管一件事：present（在不在表里）/ retained（只读保留）/ live（活着）', () => {
    const index = sessionFrameIndex([live('alive'), retained('kept'), live('shared', { attachable: false })])
    expect([...index.present].sort()).toEqual(['alive', 'kept', 'shared'])
    expect([...index.retained]).toEqual(['kept'])
    expect([...index.live].sort()).toEqual(['alive', 'shared'])
  })

  it('退役的会话三张表里都没有（它不在帧里）', () => {
    const index = sessionFrameIndex([live('alive')])
    expect(index.present.has('released')).toBe(false)
    expect(index.retained.has('released')).toBe(false)
    expect(index.live.has('released')).toBe(false)
  })

  it('帧形态不对 / 垃圾条目：只收 sid 是非空字符串的对象', () => {
    expect(sessionFrameIndex(undefined).present.size).toBe(0)
    expect(sessionFrameIndex({ list: [] }).present.size).toBe(0)
    const index = sessionFrameIndex([null, 'sid', 7, { kind: 'local' }, live(''), live('ok')])
    expect([...index.present]).toEqual(['ok'])
  })

  it('exited 字段缺席按活着算（与 isLiveSessionEntry 同一口径）', () => {
    const index = sessionFrameIndex([{ sid: 'x', kind: 'local' }])
    expect(index.live.has('x')).toBe(true)
    expect(index.retained.has('x')).toBe(false)
  })
})

describe('agentTabDisposition', () => {
  const agent = (sid) => ({ sid, agentOwned: true, exited: false })

  it('宿主表里还有、活着 → 不动', () => {
    expect(agentTabDisposition(agent('a'), sessionFrameIndex([live('a')]))).toBe('keep')
  })

  it('仍在只读保留里 → 标已退出（标签留着，输出还能读）', () => {
    expect(agentTabDisposition(agent('a'), sessionFrameIndex([retained('a')]))).toBe('mark-exited')
  })

  it('宿主显式释放（连表都不在）→ 收标签', () => {
    expect(agentTabDisposition(agent('a'), sessionFrameIndex([live('other')]))).toBe('remove')
    expect(agentTabDisposition(agent('a'), sessionFrameIndex([]))).toBe('remove')
  })

  it('用户自己的标签不归这条规则管（agentOwned 不置 true）', () => {
    const user = { sid: 'u', exited: false }
    expect(agentTabDisposition(user, sessionFrameIndex([]))).toBe('keep')
    expect(agentTabDisposition({ sid: 'u', agentOwned: false }, sessionFrameIndex([]))).toBe('keep')
  })

  it('嵌入终端与坏输入一律 keep（别把别人的面板收掉）', () => {
    expect(agentTabDisposition({ sid: 'e', agentOwned: true, embedded: true }, sessionFrameIndex([]))).toBe('keep')
    expect(agentTabDisposition(null, sessionFrameIndex([]))).toBe('keep')
    expect(agentTabDisposition(agent(''), sessionFrameIndex([]))).toBe('keep')
    expect(agentTabDisposition(agent('a'), null)).toBe('keep')
  })
})
