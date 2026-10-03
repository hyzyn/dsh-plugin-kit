/**
 * `scripts/flake-lane.mjs` 的用例 —— 并发 flake 车道的判定与报告。
 *
 * 反例走纯函数（`summarizeRuns` / `extractFailures`）用 fixture 造，不真的跑套件
 * （跑一份要 13s，五份并发就是一次 CI 的量级，不该进单测）。
 *
 * 这组用例守三件事：
 *
 * 1. **一份红 → 整体红**，且**点名是哪一份**（车道的用途是让人去定位，报告得能指向现场）；
 * 2. **失败用例名要被抠出来**（只说「有一份红了」等于把跑一遍的活留给下一个人）；
 * 3. **零份 = 红**——本仓真实发生过「命中 0、恒绿、拦不住任何东西」的闸门。
 *
 * 真机校准记录（2026-10-03，本机 10 核）：空载 `spawnSync(node -e 0)` p50=25ms / max=33ms；
 * 并发 3 份全量套件下 p50=39ms / p90=97ms / max=183ms。用这个分布造了一条「必须 <60ms」
 * 的临时用例做**端到端反证**：3 份里红 2 份、并点名了那条用例——证明这条车道抓得到
 * 「赌墙钟」型 flake（D95 / D57 / CG65 的同一形状）。反证用的临时文件已删除，故不在下列用例里。
 */
import { describe, expect, it } from 'vitest'

import { extractFailures, summarizeRuns, workersPerSuite } from '../flake-lane.mjs'

/** 造一份运行结果。 */
const run = (index, code, output = '') => ({ index, code, output })

describe('extractFailures：把「红在哪条用例」抠出来', () => {
  it('dot reporter 的 `❯ path (N tests | M failed)` 形态', () => {
    const output = ' ❯ scripts/test/x.test.ts (5 tests | 1 failed) 120ms\n'
    expect(extractFailures(output)).toEqual(['❯ scripts/test/x.test.ts (5 tests | 1 failed) 120ms'])
  })

  it('`FAIL` 形态（default / verbose reporter）', () => {
    expect(extractFailures(' FAIL  packages/tty/test/a.test.ts > 组 > 用例\n')).toEqual([
      'FAIL  packages/tty/test/a.test.ts > 组 > 用例',
    ])
  })

  it('同一行重复出现只报一次（dot reporter 会在汇总里再打一遍）', () => {
    const line = ' ❯ a.test.ts (2 tests | 1 failed)'
    expect(extractFailures(`${line}\n...\n${line}\n`)).toHaveLength(1)
  })

  it('全绿输出抠不出东西（不许把「通过」误当失败）', () => {
    expect(extractFailures(' Test Files  110 passed (110)\n      Tests  1714 passed (1714)\n')).toEqual([])
  })
})

describe('summarizeRuns：收敛成「红没红 + 可读报告」', () => {
  it('全部通过 → ok', () => {
    const { ok, failed } = summarizeRuns({ runs: [run(1, 0), run(2, 0), run(3, 0)] })
    expect(ok).toBe(true)
    expect(failed).toEqual([])
  })

  it('一份红 → 整体红，且 failed 点名是第几份', () => {
    const { ok, failed } = summarizeRuns({
      runs: [run(1, 0), run(2, 1, ' ❯ x.test.ts (1 test | 1 failed)\n'), run(3, 0)],
    })
    expect(ok).toBe(false)
    expect(failed).toEqual([2])
  })

  it('多份红 → 全部点名', () => {
    const { failed } = summarizeRuns({ runs: [run(1, 1, ''), run(2, 0), run(3, 1, '')] })
    expect(failed).toEqual([1, 3])
  })

  it('报告里带失败用例名（这才是能拿去定位的东西）', () => {
    const { report } = summarizeRuns({
      runs: [run(1, 1, ' ❯ packages/tty/test/screen-crash.test.ts (12 tests | 1 failed)\n')],
    })
    expect(report).toContain('packages/tty/test/screen-crash.test.ts')
    expect(report).toContain('第 1 份')
  })

  it('红但抠不出用例名时，把输出尾部附上（加载/编译失败才是这种形状）', () => {
    const { report } = summarizeRuns({ runs: [run(1, 1, 'Cannot find module x\nsome other line\n')] })
    expect(report).toContain('Cannot find module x')
    expect(report).toContain('没有失败用例行')
  })

  it('**零份 = 红**：一份都没跑成就不许算绿（恒绿警戒）', () => {
    const { ok, report } = summarizeRuns({ runs: [] })
    expect(ok).toBe(false)
    expect(report).toContain('恒绿')
  })

  it('报告的份号按 index 排序（并发完成顺序不该影响可读性）', () => {
    const { report } = summarizeRuns({ runs: [run(3, 0), run(1, 0), run(2, 0)] })
    expect(report.indexOf('第 1 份')).toBeLessThan(report.indexOf('第 2 份'))
    expect(report.indexOf('第 2 份')).toBeLessThan(report.indexOf('第 3 份'))
  })
})

describe('workersPerSuite：把「争用强度」钉住，而不是「每份几个 worker」', () => {
  /*
   * 2026-10-03 加。不加 --maxWorkers 时 vitest 自己取 `核数 - 1`，于是同一个「并发 3 份」
   * 在本机（10 核 → 每份 9 个 = 27 抢 10 核 = 2.7x）与 CI runner（4 核 → 每份 3 个 = 9 抢 4 核
   * = 2.25x）的争用强度不同，车道的灵敏度就不可比——本机绿不代表 CI 绿，而那正是它要回答的问题。
   */
  it('本机（10 核）与 CI runner（4 核）压出来的超订倍数接近', () => {
    const mac = (workersPerSuite(3, 10) * 3) / 10
    const ci = (workersPerSuite(3, 4) * 3) / 4
    expect(mac).toBeGreaterThan(1.5)
    expect(ci).toBeGreaterThan(1.5)
    expect(Math.abs(mac - ci)).toBeLessThan(0.5)
  })

  it('份数越多、每份 worker 越少（总超订不随份数爆炸）', () => {
    expect(workersPerSuite(6, 10)).toBeLessThan(workersPerSuite(3, 10))
  })

  it('下限是 1：极小机器 / 极多份数也不会算出 0（--maxWorkers=0 是非法值）', () => {
    expect(workersPerSuite(3, 1)).toBe(1)
    expect(workersPerSuite(64, 2)).toBe(1)
  })
})
