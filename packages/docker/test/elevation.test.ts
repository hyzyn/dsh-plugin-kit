/**
 * @hyzyn/dsh-docker — 就地提权「逐能力 pending + 合并复制」的回归测试。
 *
 * 现场（2026-09-26 设置卡片截图实测）：`elevation` 原是**单槽** state，面板开着时再点另一个
 * 开关会把前一个能力的面板替换掉、它的命令从界面消失（宿主侧 challenge 仍在 pending）——
 * 用户必须在宿主终端**粘贴两次**，两次授权时刻差 14 秒。修复=逐能力记录 + 一个合并复制按钮。
 *
 * 为什么逻辑必须住在一个纯模块里：离线冒烟的 React 桩把 `useState` 冻在初值上、不执行函数组件体
 * （本仓硬规矩 ②，ROADMAP 记过这条教训——逻辑留在组件闭包里等于没有测试入口）。本文件钉
 * 「取哪几条命令 / 什么顺序 / 怎么连接」，冒烟钉「界面真的渲染了什么、按钮交下去什么字节」。
 */
import { describe, expect, it } from 'vitest'
import {
  buildMergedElevationText,
  hasElevationCommand,
  joinElevationCommands,
  markElevationGranted,
  mergeElevationCommands,
  pruneElevationRecords,
  removeElevationRecord,
  shouldOfferMerge,
  upsertElevationRecord,
} from '../client-src/elevation.js'

const NOW = 1_700_000_000_000
const TTL = 300_000
/** 拿两条真实形状的 pending 记录（命令就是宿主给的那条 touch，路径含单引号）。 */
const A = { capability: 'allowMutations', command: "touch '/home/u/.dsh/dsh-kit/grant-confirm/aaa'", expiresAt: NOW + TTL }
const B = { capability: 'allowExec', command: "touch '/home/u/.dsh/dsh-kit/grant-confirm/bbb'", expiresAt: NOW + TTL }

describe('upsertElevationRecord：增改一个能力，不动别的 pending', () => {
  it('【本 bug 的根】点第二个开关不再替换第一个能力的面板', () => {
    const one = upsertElevationRecord([], 'allowMutations', A)
    const two = upsertElevationRecord(one, 'allowExec', B)
    expect(two).toHaveLength(2)
    expect(two[0]).toEqual(A)
    expect(two[1]).toEqual(B)
  })

  it('同一能力再次 begin（重新生成）原地替换，**不重排**（面板不许在用户眼皮底下跳走）', () => {
    const two = [A, B]
    const again = upsertElevationRecord(two, 'allowMutations', { ...A, command: "touch '/tmp/new'", expiresAt: NOW + TTL * 2 })
    expect(again.map((record) => record.capability)).toEqual(['allowMutations', 'allowExec'])
    expect(again[0].command).toBe("touch '/tmp/new'")
    expect(again[1]).toEqual(B)
  })

  it('只改传进去的字段（in-flight 记录补上 command 时不丢 capability）', () => {
    const flight = upsertElevationRecord([], 'allowExec', { capability: 'allowExec' })
    const done = upsertElevationRecord(flight, 'allowExec', { command: B.command, expiresAt: B.expiresAt })
    expect(done[0]).toEqual(B)
  })

  it('原数组不被就地改动（React state 必须换引用）', () => {
    const before = [A]
    const after = upsertElevationRecord(before, 'allowExec', B)
    expect(before).toHaveLength(1)
    expect(after).not.toBe(before)
  })
})

describe('removeElevationRecord / pruneElevationRecords：✕ 只关一个', () => {
  it('只摘掉被点的那一个能力', () => {
    expect(removeElevationRecord([A, B], 'allowMutations')).toEqual([B])
  })

  it('收掉最后一个 pending 时，已授权的留痕一起清掉（否则下一轮会出现一条孤零零的留痕）', () => {
    const granted = markElevationGranted([A, B], 'allowMutations')
    const onlyOne = removeElevationRecord(granted, 'allowExec')
    expect(pruneElevationRecords(onlyOne)).toEqual([])
  })

  it('还有别的 pending 时留痕留着（合并按钮要靠它计数）', () => {
    const granted = markElevationGranted([A, B], 'allowMutations')
    expect(pruneElevationRecords(granted)).toEqual(granted)
  })
})

describe('markElevationGranted：解锁一个能力之后的留痕', () => {
  it('清掉命令、标上已授权，记录位置不变（面板据此消失）', () => {
    const next = markElevationGranted([A, B], 'allowMutations')
    expect(next[0]).toEqual({ capability: 'allowMutations', command: undefined, expiresAt: undefined, error: undefined, granted: true })
    expect(next[1]).toEqual(B)
  })

  it('这个能力不在记录里时一个字段都不动（返回原数组，不凭空造留痕）', () => {
    const before = [A]
    expect(markElevationGranted(before, 'allowExec')).toBe(before)
  })

  it('两条都解锁 → 整组清空（含留痕）：没有 pending 就没有面板组', () => {
    const once = markElevationGranted([A, B], 'allowMutations')
    expect(markElevationGranted(once, 'allowExec')).toEqual([])
  })
})

describe('mergeElevationCommands：取哪几条、什么顺序', () => {
  it('按**发起顺序**（数组顺序）取，不是按能力名字典序', () => {
    // 字典序是 allowExec < allowMutations，与发起顺序相反——这条用例专治「顺手 sort 一下」
    expect(mergeElevationCommands([A, B], NOW)).toEqual([A.command, B.command])
    expect(mergeElevationCommands([B, A], NOW)).toEqual([B.command, A.command])
  })

  it('已授权的留痕不进合并（它的命令已经用过了）', () => {
    const granted = markElevationGranted([A, B], 'allowMutations')
    expect(mergeElevationCommands(granted, NOW)).toEqual([B.command])
  })

  it('过期的不进合并（复制过去只会让宿主落一个过期后才出现的文件）', () => {
    const expired = { ...A, expiresAt: NOW - 1 }
    expect(mergeElevationCommands([expired, B], NOW)).toEqual([B.command])
  })

  it('expiresAt 恰好等于 now 算过期（边界不留给「差一毫秒」）', () => {
    expect(mergeElevationCommands([{ ...A, expiresAt: NOW }], NOW)).toEqual([])
    expect(mergeElevationCommands([{ ...A, expiresAt: NOW + 1 }], NOW)).toEqual([A.command])
  })

  it('没拿到命令的（报错 / 在途）不进合并', () => {
    expect(mergeElevationCommands([{ capability: 'allowMutations', error: 'HTTP 429' }], NOW)).toEqual([])
    expect(mergeElevationCommands([{ capability: 'allowExec' }], NOW)).toEqual([])
  })

  it('输入不是数组时返回空表，不抛错（渲染路径不该被脏数据打死）', () => {
    for (const bad of [undefined, null, 'x', 42, {}]) {
      expect(mergeElevationCommands(bad, NOW)).toEqual([])
    }
  })
})

describe('joinElevationCommands / buildMergedElevationText：怎么连接', () => {
  it('【本 bug 的验收】两条命令 = 两条命令的**换行**连接，逐字节相等', () => {
    const text = buildMergedElevationText([A, B], NOW)
    expect(text).toBe(A.command + '\n' + B.command)
    expect(Buffer.from(text, 'utf8').equals(Buffer.from(A.command + '\n' + B.command, 'utf8'))).toBe(true)
    expect(text.split('\n')).toHaveLength(2)
  })

  it('刻意**不**用 && / ; 连接（PS 5.1 不认 &&、cmd 不认 ;，而换行四处都逐行执行）', () => {
    const text = buildMergedElevationText([A, B], NOW)
    expect(text).not.toContain('&&')
    expect(text).not.toContain(';')
    // 每条命令自己含单引号（路径是宿主给的），连接不得把它们吃掉或转义
    expect(text).toContain("'")
  })

  it('只有一条时就是它自己（没有多余的前后换行）；一条都没有时是空串', () => {
    expect(buildMergedElevationText([A], NOW)).toBe(A.command)
    expect(buildMergedElevationText([], NOW)).toBe('')
    expect(buildMergedElevationText([{ capability: 'allowExec' }], NOW)).toBe('')
  })

  it('join 跳过空指令（免得连出一个 `cmd\\n\\ncmd`，粘贴时多敲一次回车）', () => {
    expect(joinElevationCommands(['a', '', undefined, null, 'b'])).toBe('a\nb')
    expect(joinElevationCommands(undefined)).toBe('')
  })
})

describe('shouldOfferMerge：合并按钮出不出的唯一判定', () => {
  it('两个 pending → 出', () => {
    expect(shouldOfferMerge([A, B], NOW)).toBe(true)
  })

  it('单个 pending → 不出（那条命令就在它自己的面板里）', () => {
    expect(shouldOfferMerge([A], NOW)).toBe(false)
    expect(shouldOfferMerge([], NOW)).toBe(false)
    expect(shouldOfferMerge(undefined, NOW)).toBe(false)
  })

  it('一个 granted 之后仍出（剩下那条还要让用户一次粘贴拿到手）', () => {
    expect(shouldOfferMerge(markElevationGranted([A, B], 'allowMutations'), NOW)).toBe(true)
  })

  it('两个都 granted → 不出（没有可复制的了，按钮必须自己消失）', () => {
    const both = markElevationGranted(markElevationGranted([A, B], 'allowMutations'), 'allowExec')
    expect(shouldOfferMerge(both, NOW)).toBe(false)
  })

  it('两条都过期 → 不出（不再承诺一个不可能发生的解锁）', () => {
    expect(shouldOfferMerge([{ ...A, expiresAt: NOW - 1 }, { ...B, expiresAt: NOW - 1 }], NOW)).toBe(false)
  })

  it('参与计数的是「拿到过命令」的能力，不是「点了几个开关」', () => {
    // 一个报错 + 一个 pending：只有一个能粘贴，出「复制全部（1 条）」没有意义
    expect(shouldOfferMerge([{ capability: 'allowMutations', error: 'HTTP 429' }, B], NOW)).toBe(false)
    // 一个 granted（算参与过）+ 一个在途（没命令）：没有可复制的，也不出
    const granted = markElevationGranted([A], 'allowMutations')
    expect(shouldOfferMerge([...granted, { capability: 'allowExec' }], NOW)).toBe(false)
  })
})

describe('hasElevationCommand：参与计数的口径', () => {
  it('拿到过命令（含已授权的留痕）算参与；报错 / 在途不算', () => {
    expect(hasElevationCommand(A)).toBe(true)
    expect(hasElevationCommand({ capability: 'allowMutations', granted: true })).toBe(true)
    expect(hasElevationCommand({ capability: 'allowMutations', error: 'x' })).toBe(false)
    expect(hasElevationCommand({ capability: 'allowMutations' })).toBe(false)
    expect(hasElevationCommand(null)).toBe(false)
    expect(hasElevationCommand(undefined)).toBe(false)
  })
})
