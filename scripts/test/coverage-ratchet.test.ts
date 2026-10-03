/**
 * `scripts/coverage-ratchet.mjs` 的用例 —— 覆盖率棘轮的判定规则。
 *
 * 反例走纯函数（`compareCoverage`）用 fixture 造，不真的跑插桩套件（那要 16s 一次）。
 *
 * 这组用例守三种漂法（都在文件头写了为什么）：
 *
 * 1. **把棘轮拧死**（容差设成 0）→ 同一棵树连跑两次都可能红，人会开始无视它；
 * 2. **把牙齿拔掉**（容差大到什么都放行）→ 变成一条恒绿的装饰；
 * 3. **形态漂了照绿**（vitest 改了 `json-summary` 的字段）→ 最坏的一侧：闸门从此不工作，
 *    但没人会知道。这一条在 `compareCoverage` 里是硬红，必须钉住。
 *
 * 容差本身的依据（实测抖动）见 `coverage-ratchet.mjs` 文件头与
 * [docs/conventions.md](../docs/conventions.md) 的覆盖率一节。
 */
import { describe, expect, it } from 'vitest'

import { compareCoverage, TOLERANCE_PCT } from '../coverage-ratchet.mjs'

/** 造一份 summary 的 total 形态（其余字段判定用不到）。 */
const summary = (lines, branches = 76.9, functions = 73.8) => ({
  lines: { pct: lines },
  branches: { pct: branches },
  functions: { pct: functions },
})

describe('compareCoverage：只判 lines，且容差是刻意的', () => {
  it('容差取 0.3 个百分点（实测抖动 ≤0.01，留足余量；改小会开始误红）', () => {
    expect(TOLERANCE_PCT).toBe(0.3)
  })

  it('完全持平 → 绿', () => {
    expect(compareCoverage({ baseline: summary(66.52), current: summary(66.52) }).ok).toBe(true)
  })

  it('上升 → 绿（棘轮收紧是好事）', () => {
    expect(compareCoverage({ baseline: summary(66.5), current: summary(70) }).ok).toBe(true)
  })

  it('小幅下降但在容差内 → 绿（同树重跑的实测抖动就落在这里）', () => {
    expect(compareCoverage({ baseline: summary(66.52), current: summary(66.3) }).ok).toBe(true)
  })

  it('**下降超过容差 → 红**，并报出前后数值', () => {
    const { ok, drops } = compareCoverage({ baseline: summary(66.52), current: summary(66.1) })
    expect(ok).toBe(false)
    expect(drops).toHaveLength(1)
    expect(drops[0].key).toBe('lines')
    // 真机校准：新增 122 行无人使用的源码 → 66.52 → 66.13（−0.39），正是这条判据抓住的形状
    expect(drops[0].delta).toBeCloseTo(-0.42, 2)
  })

  it('恰好在容差边界上 → 绿（用 `-TOLERANCE` 比较，边界不制造浮点意外）', () => {
    expect(compareCoverage({ baseline: summary(66.52), current: summary(66.52 - TOLERANCE_PCT) }).ok).toBe(true)
  })

  it('branch / functions 只记录不判（本仓与 lines 同向，判四条只会让失败更难解释）', () => {
    const { ok, report } = compareCoverage({
      baseline: summary(66.52, 76.9, 73.8),
      current: summary(66.52, 50, 50),
    })
    expect(ok).toBe(true)
    expect(report).toContain('仅记录，不判')
  })

  it('**字段缺失 → 硬红**（json-summary 形态变了必须炸，不许当成「没变化」）', () => {
    const broken = { lines: {}, branches: { pct: 76.9 }, functions: { pct: 73.8 } }
    const { ok, report } = compareCoverage({ baseline: summary(66.52), current: broken })
    expect(ok).toBe(false)
    expect(report).toContain('json-summary 的形态变了')
  })

  it('baseline 自己缺字段也红（基线文件被改坏时不允许静默通过）', () => {
    const brokenBaseline = { branches: { pct: 76.9 }, functions: { pct: 73.8 } }
    expect(compareCoverage({ baseline: brokenBaseline, current: summary(66.52) }).ok).toBe(false)
  })
})
