/**
 * 缺陷台账（DEFECTS.md）的自洽性守卫。
 *
 * 为什么值得一条用例：「现状」行那个数字是**手写的**，而它恰恰是所有人判断
 * 「还有没有活要干」的唯一入口。实测已经错过一次——P0 那轮加了 1 条缺陷（CG46）却把
 * 「已修」从 42 写成 44（多算 1），并且这个错误**持续了一整个提交没人发现**：
 * 42(已修) + 3(关闭) = 45 比表内编号数 46 少 1，只有把四个数字摆在一起算才看得出来。
 *
 * 判据定成「从表格**现算**」而不是「再写死一个期望值」：期望值写死的话，下次加缺陷时
 * 改错的人只需要同时改两处数字就又能骗过用例；而从表格推导，加一条自动 +1、关闭一条
 * 自动 −1，**唯一能通过的方式就是数字真的对**。
 *
 * 三个坑（都在这条用例里显式处理了，否则守卫本身会误报）：
 *   1. 表格行数 ≠ 编号数——`CG15 追记` 是同一编号的补充记录（表格里有行、编号要合并）；
 *   2. 编号在表里是补零写法（`CG01`），与「现状」行里的范围写法（`CG01–CG29`）不是一回事；
 *   3. 已关闭的 CG32–CG34 **仍在表格里**（带着关闭理由），所以必须减掉，不能算成已修。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const DEFECTS = readFileSync(new URL('../DEFECTS.md', import.meta.url), 'utf8')

/** 表格里的主行编号（补零写法，含追记行——追记与主行同号）。 */
const rowIds = [...DEFECTS.matchAll(/^\| CG(\d+)\s*(?:追记)?\s*\|/gm)].map((m) => Number(m[1]))

/** 去重后的编号（追记并入同号）。 */
const distinctIds = [...new Set(rowIds)].sort((a, b) => a - b)

/** 已关闭（不是已修）的编号：CG32–CG34 原文从未随附，关闭而非修复。 */
const CLOSED = [32, 33, 34]

/** 「现状」行里手写的三个数字。 */
const stated = (() => {
  const m = /已修 (\d+) \/ 已关闭 (\d+) \/ 待修 (\d+)/.exec(DEFECTS)
  expect(m, 'DEFECTS.md 里找不到「已修 N / 已关闭 M / 待修 K」现状行').not.toBeNull()
  return { fixed: Number(m[1]), closed: Number(m[2]), pending: Number(m[3]) }
})()

describe('DEFECTS.md：现状行必须与表格现算一致', () => {
  it('表格能被解析出编号（守卫自身的前置条件）', () => {
    expect(distinctIds.length).toBeGreaterThan(0)
    expect(rowIds.length).toBeGreaterThanOrEqual(distinctIds.length)
  })

  it('已修 = 去重编号数 − 已关闭数（当前数字写对了）', () => {
    const computed = distinctIds.length - CLOSED.length
    expect(
      stated.fixed,
      `文档写「已修 ${String(stated.fixed)}」，但表内有 ${String(distinctIds.length)} 个编号、`
      + `其中 ${String(CLOSED.length)} 个是关闭（CG32–CG34）→ 应为 ${String(computed)}。`
      + '（改过表格后请同步这一行。）',
    ).toBe(computed)
  })

  it('已关闭数就是台账里显式关闭的那几个', () => {
    expect(stated.closed).toBe(CLOSED.length)
  })

  it('编号连续无缺口（新增按最大号 +1，不复用已关闭的号）', () => {
    const gaps = []
    for (let n = distinctIds[0]; n <= distinctIds[distinctIds.length - 1]; n++) {
      if (!distinctIds.includes(n)) gaps.push(n)
    }
    expect(gaps, `编号缺 ${gaps.map((n) => 'CG' + String(n).padStart(2, '0')).join(', ')}`).toEqual([])
  })

  it('已关闭的编号仍在台账里（关闭 ≠ 删除：要能看到关闭理由）', () => {
    for (const n of CLOSED) {
      expect(distinctIds, `CG${String(n)} 被删掉了——关闭的条目要留着并写明理由`).toContain(n)
    }
  })

  it('每条主行都有一句话的修复/关闭说明（不留空壳行）', () => {
    const empties = []
    for (const line of DEFECTS.split('\n')) {
      const m = /^\| CG(\d+)\s*(?:追记)?\s*\|/.exec(line)
      if (m === null) continue
      const cells = line.split('|').map((c) => c.trim())
      // cells: ['', 'CGxx', 级别, 现象, 修复, '']
      const fix = cells[4] ?? ''
      // 已关闭的三条以「**关闭**」开头，同样算有说明
      if (fix.length < 10) empties.push(`CG${m[1]}`)
    }
    expect(empties, `以下条目缺修复说明：${empties.join(', ')}`).toEqual([])
  })
})
