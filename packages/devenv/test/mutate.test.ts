/**
 * 写入口的纯逻辑测试（`src/mutate.ts`）。
 *
 * 这一层的两条硬判据只有在这里才验得干净：
 *
 * 1. **清单就是白名单**——`planMutation` 的输入里只有清单里的服务，任何不在清单里的容器名都不该
 *    出现在计划里（真机上那意味着「停掉同事正在联调的那一份」）；
 * 2. **幂等**——`up` 只列没在跑的、`down` 只列在跑的，其余进 `unchanged`（这样 agent 重试是安全的，
 *    而报告里也看得见「它本来就那样」）。
 */
import { describe, expect, it } from 'vitest'

import type { ServiceObservation } from '../src/env-ready-eval.js'
import type { ServiceRequirement } from '../src/env-ready.js'
import { actionLabel, planMutation, runMutation, startArgv, stopArgv } from '../src/mutate.js'
import type { DockerRunner, ObservedCommand } from '../src/observe.js'

/** 一条观测（默认：找到了、在跑）。 */
function obs(name: string, overrides: Partial<ServiceObservation> = {}): ServiceObservation {
  return { name, found: true, status: 'running', startedAt: '2026-10-01T12:00:00.000000000Z', ...overrides }
}

/** 清单里的服务。 */
function req(name: string): ServiceRequirement {
  return { name }
}

/** 一个按 argv 给答案的假 runner，并记下调用。 */
function fakeRunner(reply: (argv: readonly string[]) => ObservedCommand): DockerRunner & { calls: string[][] } {
  const calls: string[][] = []
  return {
    calls,
    run: async (argv) => {
      calls.push([...argv])
      return reply(argv)
    },
  }
}

describe('argv：两条命令的形状', () => {
  it('`docker start <name>`；`docker stop --time <秒> <name>`', () => {
    expect(startArgv('ems')).toEqual(['docker', 'start', 'ems'])
    expect(stopArgv('ems', 10)).toEqual(['docker', 'stop', '--time', '10', 'ems'])
  })

  it('动作短语只有一处（报告与拒绝文案共用）', () => {
    expect(actionLabel('up')).toBe('启动')
    expect(actionLabel('down')).toBe('停止')
  })
})

describe('planMutation：清单就是白名单 + 幂等', () => {
  it('up：只列没在跑的；在跑的进 unchanged；不存在的进 missing', () => {
    const plan = planMutation({
      action: 'up',
      services: [req('a'), req('b'), req('c'), req('d')],
      observations: [
        obs('a'),
        obs('b', { status: 'exited', exitCode: 143 }),
        obs('d', { found: false }),
      ],
    })
    // `c` 一条观测都没有 → 与「明确观测到不存在」（d）都进 missing：没观测到就**不动它**
    expect(plan).toEqual({ action: 'up', services: ['b'], unchanged: ['a'], missing: ['c', 'd'] })
  })

  it('down：只列在跑的；其余进 unchanged', () => {
    const plan = planMutation({
      action: 'down',
      services: [req('a'), req('b'), req('c')],
      observations: [obs('a'), obs('b', { status: 'exited' }), obs('c', { found: false })],
    })
    expect(plan).toEqual({ action: 'down', services: ['a'], unchanged: ['b'], missing: ['c'] })
  })

  it('`restarting` / `created` 都算「没在跑」（up 要启、down 不动）', () => {
    const services = [req('a'), req('b')]
    const observations = [obs('a', { status: 'restarting' }), obs('b', { status: 'created' })]
    expect(planMutation({ action: 'up', services, observations }).services).toEqual(['a', 'b'])
    expect(planMutation({ action: 'down', services, observations }).unchanged).toEqual(['a', 'b'])
  })

  it('「完全没观测到」也算 missing（不报出来就会变成「清单里写了却没动」而没人知道）', () => {
    const plan = planMutation({ action: 'up', services: [req('只写在清单里')], observations: [] })
    expect(plan.services).toEqual([])
    expect(plan.missing).toEqual(['只写在清单里'])
  })

  it('计划里只可能出现清单里的名字（白名单的判据）', () => {
    const plan = planMutation({
      action: 'down',
      services: [req('a')],
      // 观测里混进一个**不在清单里**的容器：它不该出现在任何一档
      observations: [obs('a'), obs('同事的容器')],
    })
    expect(JSON.stringify(plan)).not.toContain('同事的容器')
  })
})

describe('runMutation：单条失败不中断其余', () => {
  it('全成：逐条报 code 0，命令形状对', async () => {
    const runner = fakeRunner(() => ({ code: 0, stdout: 'ems', stderr: '' }))
    const outcomes = await runMutation({ action: 'down', services: ['a', 'b'], unchanged: [], missing: [] }, runner, { timeoutSec: 7 })
    expect(outcomes).toEqual([{ name: 'a', code: 0 }, { name: 'b', code: 0 }])
    expect(runner.calls).toEqual([
      ['docker', 'stop', '--time', '7', 'a'],
      ['docker', 'stop', '--time', '7', 'b'],
    ])
  })

  it('一条失败、后面照做（否则报告看起来像「只停了两个」，实际是「第二个失败」）', async () => {
    const runner = fakeRunner((argv) => (argv[argv.length - 1] === 'b'
      ? { code: 1, stdout: '', stderr: 'Error response from daemon: permission denied\n第二行' }
      : { code: 0, stdout: '', stderr: '' }))
    const outcomes = await runMutation({ action: 'up', services: ['a', 'b', 'c'], unchanged: [], missing: [] }, runner, { timeoutSec: 10 })
    expect(outcomes.map((outcome) => outcome.code)).toEqual([0, 1, 0])
    expect(outcomes[1]?.error).toBe('Error response from daemon: permission denied')
  })

  it('超时 / 抛错也算这一条的失败，不带崩整个批次', async () => {
    const runner: DockerRunner = {
      run: async (argv) => {
        const name = argv[argv.length - 1]
        if (name === 'a') return { code: null, stdout: '', stderr: '', timedOut: true }
        if (name === 'b') throw new Error('SSH 通道断了')
        return { code: 0, stdout: '', stderr: '' }
      },
    }
    const outcomes = await runMutation({ action: 'up', services: ['a', 'b', 'c'], unchanged: [], missing: [] }, runner, { timeoutSec: 10 })
    expect(outcomes[0]?.error).toContain('超时')
    expect(outcomes[1]?.error).toBe('SSH 通道断了')
    expect(outcomes[2]?.code).toBe(0)
  })

  it('没有输出时也给一句话（空字符串读起来像「成功了但没说话」）', async () => {
    const runner = fakeRunner(() => ({ code: 2, stdout: '', stderr: '' }))
    const outcomes = await runMutation({ action: 'up', services: ['a'], unchanged: [], missing: [] }, runner, { timeoutSec: 10 })
    expect(outcomes[0]?.error).toBe('没有输出')
  })
})
