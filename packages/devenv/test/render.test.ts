/**
 * 报告渲染测试（`src/render.ts`）。
 *
 * 一份**有误导性的**报告比一句报错更糟：它长得像结论。所以这里逐条钉住三件事——三态各有不会被
 * 看错的记号、证据与结论并列、快照要说清是哪一刻的；另外两件容易漏的（没取到观测的服务要点名、
 * **通道失败与「容器没起」不是一件事**）也各有用例。
 */
import { describe, expect, it } from 'vitest'

import { evaluateProfile, type ServiceObservation } from '../src/env-ready-eval.js'
import type { ReadyProfile } from '../src/env-ready.js'
import { formatMs, renderEvaluation } from '../src/render.js'

const T0 = '2026-10-01T12:00:00.000000000Z'
const T1 = '2026-10-01T12:00:05.000000000Z'

/** 一份单服务清单（要哪个就绪维度由用例给）。 */
function profileWith(ready?: ReadyProfile['services'][number]['ready']): ReadyProfile {
  return {
    version: 1,
    project: 'ems',
    services: [ready === undefined ? { name: 'svc' } : { name: 'svc', ready }],
  }
}

/** 渲染一份判定。 */
function render(profile: ReadyProfile, observations: ServiceObservation[], extra: { stoppedBecause?: string } = {}): string {
  const evaluation = evaluateProfile({ profile, observations })
  return renderEvaluation({
    targetId: 'nas',
    targetLabel: 'NAS',
    project: 'ems',
    evaluation,
    observations,
    ...extra,
  })
}

describe('renderEvaluation：结论的可读形状', () => {
  it('就绪：✓ + 逐条证据 + 快照时刻 + 汇总', () => {
    const text = render(profileWith({ kind: 'logPattern', pattern: 'Started' }), [
      { name: 'svc', found: true, status: 'running', startedAt: T0, logLines: [`${T1} Started EmsApplication`], observedAt: T1 },
    ])
    expect(text).toContain('目标 nas（NAS）· 项目 ems · 清单 ready/ems.ready.yaml')
    expect(text).toContain(`观测时刻：${T1}`)
    expect(text).toContain('快照')
    expect(text).toContain('✓ svc（logPattern）')
    expect(text).toContain('    · 容器在跑')
    expect(text).toContain('    · 启动完成行晚于本次 StartedAt')
    expect(text).toContain('全部 1 个服务就绪')
    // `env_status` 不等待，所以不该有「停止等待的原因」这一行。
    expect(text).not.toContain('停止等待的原因')
  })

  it('未就绪：! +「还缺」逐条列出（让人不必再查一圈）', () => {
    const text = render(profileWith({ kind: 'logPattern', pattern: 'Started' }), [
      { name: 'svc', found: true, status: 'running', startedAt: T0, logLines: [`${T0} 别的行`], observedAt: T1 },
    ])
    expect(text).toContain('! svc（logPattern）')
    expect(text).toContain('    · 还缺：')
    expect(text).toContain('还差 1 个服务')
  })

  it('明确否证：✗ + 否证那一行（这一档的处置与 ! 相反，必须在报告里看得出来）', () => {
    const text = render(profileWith({ kind: 'healthcheck' }), [
      { name: 'svc', found: true, status: 'running', startedAt: T0, health: 'unhealthy', observedAt: T1 },
    ])
    expect(text).toContain('✗ svc（healthcheck）')
    expect(text).toContain('    · 否证：健康检查 unhealthy')
    expect(text).toContain('别再等了')
  })

  it('停止等待的原因进报告（`env_wait` 才有）', () => {
    const text = render(profileWith(), [{ name: 'svc', found: true, status: 'running', startedAt: T0, observedAt: T1 }], {
      stoppedBecause: '全部就绪',
    })
    expect(text).toContain('停止等待的原因：全部就绪')
  })

  it('没取到观测的服务要点名（否则「没观测到」会被读成「没问题」）', () => {
    const profile: ReadyProfile = {
      version: 1,
      project: 'ems',
      services: [{ name: 'a' }, { name: 'b' }],
    }
    const text = render(profile, [{ name: 'a', found: true, status: 'running', startedAt: T0, observedAt: T1 }])
    expect(text).toContain('这一轮没有取到观测的服务：b')
  })
})

describe('renderEvaluation：快照与噪声', () => {
  it('一条观测都没有时不编造时刻', () => {
    const text = render(profileWith(), [])
    expect(text).not.toContain('观测时刻')
    expect(text).toContain('（这一轮没有取到观测的服务：svc）')
  })

  it('已知噪声跟着服务走（照 `jenkins-release` 技能的口径写的那条）', () => {
    const profile: ReadyProfile = {
      version: 1,
      project: 'ems',
      services: [{ name: 'svc', note: '143 = SIGTERM，是这个环境的常见噪声' }],
    }
    const text = render(profile, [{ name: 'svc', found: true, status: 'exited', exitCode: 143, observedAt: T1 }])
    expect(text).toContain('已知噪声：143 = SIGTERM')
  })
})

describe('formatMs', () => {
  it('毫秒 / 秒 / 分三档，非法值给破折号', () => {
    expect(formatMs(0)).toBe('0ms')
    expect(formatMs(999)).toBe('999ms')
    expect(formatMs(1500)).toBe('1.5s')
    expect(formatMs(60_000)).toBe('1m0s')
    expect(formatMs(95_000)).toBe('1m35s')
    expect(formatMs(Number.NaN)).toBe('—')
    expect(formatMs(-1)).toBe('—')
  })
})
