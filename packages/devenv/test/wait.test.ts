/**
 * 等待循环（`src/wait.ts`）——`env_wait` 的取消、记账与停止原因。
 *
 * ## 为什么这一层值得单独测（而不是只靠 `plugin.test.ts` 那条端到端）
 *
 * 端到端那条用的是**真时钟**（`missing-then-ok` 要真等 500ms），所以它能验「会轮询」，验不了：
 *
 *   - **取消之后不再探**（真时钟下要等一次 SSH/docker 往返才看得出来，而那条路径正是「取消没生效」
 *     这个缺陷的现场）；
 *   - **睡觉期间取消要立刻醒**（`abortableSleep`）——否则「取消」要拖到下一次轮询，而上限是 15 分钟；
 *   - **超时那一刻的边界**（假时钟一推就到位，真时钟要等满）；
 *   - **等待过程的账怎么压段**（150 秒 = 50 条，原样列等于把「有没有变过」埋掉）。
 *
 * 假时钟 + 假探测把上面四件事都变成**确定性**的，几十毫秒跑完。
 */
import { describe, expect, it } from 'vitest'

import type { ReadyEvaluation, ServiceObservation } from '../src/env-ready-eval.js'
import { abortableSleep, collapseTicks, waitForReady, type WaitTick } from '../src/wait.js'

/** 造一份判定（缺省「还没就绪」，与真判定层的形状一致）。 */
function evaluation(overrides: Partial<ReadyEvaluation> = {}): ReadyEvaluation {
  return {
    services: [],
    ready: false,
    anyRefuted: false,
    summary: '还差 1 个服务：ems-service（容器还没起来）',
    ...overrides,
  }
}

/** 一份观测（内容无所谓，等待循环只看判定）。 */
const OBSERVATIONS: readonly ServiceObservation[] = [{ name: 'ems-service', found: false }]

/** 假时钟：`sleep` 直接把时间往前推，`now` 读它。 */
function clock(): { now: () => number; sleep: (ms: number) => Promise<void>; advance: (ms: number) => void } {
  let t = 0
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms
    },
    advance: (ms: number) => {
      t += ms
    },
  }
}

describe('等待循环：什么时候停', () => {
  it('第一轮就绪 → 一次观测、不睡', async () => {
    const time = clock()
    let slept = 0
    const outcome = await waitForReady({
      probe: async () => ({ evaluation: evaluation({ ready: true, summary: '全部 1 个服务就绪' }), observations: OBSERVATIONS }),
      pollIntervalMs: 500,
      timeoutMs: 10_000,
      now: time.now,
      sleep: async (ms) => {
        slept += 1
        time.advance(ms)
      },
    })
    expect(outcome.stop.kind).toBe('ready')
    expect(outcome.ticks).toHaveLength(1)
    expect(outcome.ticks[0]?.verdict).toBe('ready')
    expect(slept).toBe(0)
  })

  it('先不就绪、后起来 → 逐次记账，最后一条是就绪', async () => {
    const time = clock()
    let calls = 0
    const outcome = await waitForReady({
      probe: async () => {
        calls += 1
        return calls < 3
          ? { evaluation: evaluation(), observations: OBSERVATIONS }
          : { evaluation: evaluation({ ready: true, summary: '全部 1 个服务就绪' }), observations: OBSERVATIONS }
      },
      pollIntervalMs: 1000,
      timeoutMs: 10_000,
      now: time.now,
      sleep: time.sleep,
    })
    expect(calls).toBe(3)
    expect(outcome.ticks.map((tick) => tick.verdict)).toEqual(['unready', 'unready', 'ready'])
    // 耗时是**从开始等**算起（不是每次轮询的间隔），这样报告里读得出「等到第几秒才好」。
    expect(outcome.ticks.map((tick) => tick.atMs)).toEqual([0, 1000, 2000])
    expect(outcome.stop).toMatchObject({ kind: 'ready', elapsedMs: 2000 })
  })

  it('被明确否证 → 立刻停（不再睡、不再探），并点名那个服务', async () => {
    const time = clock()
    let calls = 0
    const outcome = await waitForReady({
      probe: async () => {
        calls += 1
        return {
          evaluation: evaluation({
            ready: false,
            anyRefuted: true,
            services: [{ name: 'ems-service', dimension: 'container', verdict: 'refuted', message: '容器退了', met: [], missing: [], refuted: '退出码 143' }],
            summary: '有服务被明确否证，别再等了：ems-service（退出码 143）',
          }),
          observations: OBSERVATIONS,
        }
      },
      pollIntervalMs: 1000,
      timeoutMs: 10_000,
      now: time.now,
      sleep: time.sleep,
    })
    expect(calls).toBe(1)
    expect(outcome.stop.kind).toBe('refuted')
    expect(outcome.stop.refuted).toBe('ems-service')
  })

  it('等满超时 → `timeout`，并带上等待上限', async () => {
    const time = clock()
    const outcome = await waitForReady({
      probe: async () => ({ evaluation: evaluation(), observations: OBSERVATIONS }),
      pollIntervalMs: 300,
      timeoutMs: 1000,
      now: time.now,
      sleep: time.sleep,
    })
    expect(outcome.stop.kind).toBe('timeout')
    expect(outcome.stop.timeoutMs).toBe(1000)
    expect(time.now()).toBeGreaterThanOrEqual(1000)
    // 最后一轮的耗时不该超过等待上限太多（睡的是 `min(轮询间隔, 剩余)`）。
    expect(outcome.ticks[outcome.ticks.length - 1]?.atMs).toBeLessThanOrEqual(1000)
  })
})

describe('取消：调用方 abort 之后不许再探一轮', () => {
  it('★ 观测期间被取消 → 那一次结算完就停，**不再探**', async () => {
    const time = clock()
    const controller = new AbortController()
    let calls = 0
    const outcome = await waitForReady({
      probe: async () => {
        calls += 1
        if (calls === 2) controller.abort()
        return { evaluation: evaluation(), observations: OBSERVATIONS }
      },
      pollIntervalMs: 500,
      timeoutMs: 60_000,
      signal: controller.signal,
      now: time.now,
      sleep: time.sleep,
    })
    expect(calls).toBe(2)
    expect(outcome.stop.kind).toBe('cancelled')
    // 取消时仍然给了一份观测（报告要有事实可说），并且**耗时**如实。
    expect(outcome.observations).toBe(OBSERVATIONS)
    expect(outcome.ticks).toHaveLength(2)
  })

  it('★ 睡觉期间被取消 → 醒来看一次信号就停（不等满那一轮）', async () => {
    const controller = new AbortController()
    let calls = 0
    const outcome = await waitForReady({
      probe: async () => {
        calls += 1
        return { evaluation: evaluation(), observations: OBSERVATIONS }
      },
      pollIntervalMs: 500,
      timeoutMs: 60_000,
      signal: controller.signal,
      sleep: async () => {
        // 模拟「睡到一半，调用方取消了」：唤醒后循环应当先查信号，而不是再探一轮。
        controller.abort()
      },
    })
    expect(calls).toBe(1)
    expect(outcome.stop.kind).toBe('cancelled')
  })
})

describe('abortableSleep：取消要立刻生效', () => {
  it('已经取消 → 立即返回（不睡）', async () => {
    const controller = new AbortController()
    controller.abort()
    const started = Date.now()
    await abortableSleep(5000, controller.signal)
    expect(Date.now() - started).toBeLessThan(200)
  })

  it('睡到一半取消 → 立刻醒（真时钟，验的是事件监听真的接上了）', async () => {
    const controller = new AbortController()
    const started = Date.now()
    setTimeout(() => controller.abort(), 30)
    await abortableSleep(5000, controller.signal)
    expect(Date.now() - started).toBeLessThan(1000)
  })

  it('没有信号时就是普通等待（老路径不受影响）', async () => {
    const started = Date.now()
    await abortableSleep(20)
    expect(Date.now() - started).toBeGreaterThanOrEqual(15)
  })
})

describe('等待过程的账：压成段', () => {
  const tick = (atMs: number, summary: string): WaitTick => ({ atMs, verdict: 'unready', summary })

  it('结论与那句话都没变的连续几次并成一段（并记账重复了几次）', () => {
    const phases = collapseTicks([tick(0, '一样'), tick(3, '一样'), tick(6, '一样')])
    expect(phases).toHaveLength(1)
    expect(phases[0]).toMatchObject({ atMs: 0, repeat: 3 })
  })

  it('那句话一变就切开（这就是「有没有变过」的证据）', () => {
    const phases = collapseTicks([tick(0, '一样'), tick(3, '变了'), tick(6, '变了')])
    expect(phases.map((phase) => [phase.atMs, phase.repeat])).toEqual([
      [0, 1],
      [3, 2],
    ])
  })

  it('结论相同但话不同也要切开（`unready` 的原因换了）', () => {
    const phases = collapseTicks([
      { atMs: 0, verdict: 'unready', summary: '容器还没起来' },
      { atMs: 3, verdict: 'unready', summary: '容器起来了，探针 502' },
    ])
    expect(phases).toHaveLength(2)
  })
})
