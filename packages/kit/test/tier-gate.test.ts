/**
 * @hyzyn/dsh-kit — 会话权限档位闸（tier-gate）。
 *
 * 测的重点是**矩阵本身与退化方向**：决策矩阵是这一层的全部行为（§2.2），逐格断言；
 * 服务缺位 / 解析抛错必须退化成「现状放行」而不是砖掉工具面；agentless 取严侧；
 * 监听器对名单外的工具零介入、allow 永远走 `next()` 透传（插件不是放行人）。
 */
import { describe, expect, it } from 'vitest'
import {
  attachTierGate,
  decideTierCall,
  resolveSessionTier,
  tierDenialReason,
  tierGateStartupLine,
} from '../src/index.js'
import type { TierClass, TierContext, TierDecision, TierMode, TierPolicy, TierServices, TierServicesSnapshot } from '../src/index.js'

/**
 * 造一个最小插件 ctx：`on` 记下监听器供直接驱动；`inject` 模拟宿主的**可选服务注入**——
 * 服务存在时立刻以「以服务名为属性的上下文」触发回调（宿主对缺失服务不触发回调）。
 */
function fakeCtx(services: {
  sandboxPolicy?: { mode: TierMode }
  approval?: { override?: TierPolicy; configured?: TierPolicy }
  presetsCurrent?: string
  breakResolve?: boolean
}): { ctx: unknown; on: (name: string, listener: unknown) => () => void; listener: () => unknown } {
  let captured: unknown
  const sandboxService =
    services.sandboxPolicy === undefined
      ? undefined
      : {
          resolve: () => {
            if (services.breakResolve) throw new Error('resolve exploded')
            return { mode: services.sandboxPolicy!.mode, workspaceRoot: '/ws' }
          },
        }
  const approvalService =
    services.approval === undefined
      ? undefined
      : { overrideOf: () => services.approval!.override, config: { policy: services.approval!.configured } }
  const presetsService = services.presetsCurrent === undefined ? undefined : { current: () => services.presetsCurrent }
  const serviceByName: Record<string, unknown> = {
    ...(sandboxService === undefined ? {} : { sandboxPolicy: sandboxService }),
    ...(approvalService === undefined ? {} : { approval: approvalService }),
    ...(presetsService === undefined ? {} : { permissionPresets: presetsService }),
  }
  const ctx = {
    // 宿主守卫的实证：插件作用域对未 inject 的服务 ctx.get 直接抛（without inject）。
    get(name: string): unknown {
      throw new Error(`cannot get property "${name}" without inject`)
    },
    inject(names: readonly string[], callback: (serviceCtx: unknown) => void): () => void {
      for (const name of names) {
        if (serviceByName[name] !== undefined) callback({ [name]: serviceByName[name] })
      }
      return () => {}
    },
    on(name: string, listener: unknown): (() => void) {
      expect(name).toBe('tools/pre-execute')
      captured = listener
      return () => {}
    },
  }
  return { ctx, on: ctx.on, listener: () => captured }
}

/** 驱动一次监听器：exec 带名字与（可选）会话，`next` 记录是否被透传。 */
function drive(
  listener: unknown,
  input: { name: string; args?: unknown; session?: unknown },
  nextCalls: string[],
): unknown {
  const next = (): string => {
    nextCalls.push(input.name)
    return 'delegated'
  }
  const exec = {
    name: input.name,
    args: input.args,
    ...(input.session === undefined ? {} : { agent: { session: input.session } }),
  }
  return (listener as (exec: unknown, next: () => unknown) => unknown)(exec, next)
}

/** 全部格子过一遍的期望表（mode × policy × class → action）。 */
const MATRIX: Array<[TierMode, TierPolicy, TierClass, TierDecision['action']]> = [
  ['danger-full-access', 'ask', 'read', 'allow'],
  ['danger-full-access', 'ask', 'write', 'allow'],
  ['danger-full-access', 'ask', 'exec', 'allow'],
  ['danger-full-access', 'never', 'write', 'allow'],
  ['danger-full-access', 'never', 'exec', 'allow'],
  ['read-only', 'ask', 'read', 'allow'],
  ['read-only', 'ask', 'write', 'ask'],
  ['read-only', 'ask', 'exec', 'ask'],
  ['read-only', 'never', 'read', 'allow'],
  ['read-only', 'never', 'write', 'deny'],
  ['read-only', 'never', 'exec', 'deny'],
  ['workspace-write', 'ask', 'read', 'allow'],
  ['workspace-write', 'ask', 'write', 'ask'],
  ['workspace-write', 'ask', 'exec', 'ask'],
  ['workspace-write', 'never', 'read', 'allow'],
  ['workspace-write', 'never', 'write', 'deny'],
  ['workspace-write', 'never', 'exec', 'deny'],
]

function tierOf(mode: TierMode, policy: TierPolicy, overrides?: Partial<TierContext>): TierContext {
  const services: TierServices = { sandboxPolicy: true, approval: true }
  return { mode, policy, auto: false, services, ...overrides }
}

describe('decideTierCall：决策矩阵逐格', () => {
  for (const [mode, policy, cls, action] of MATRIX) {
    it(`${mode} × ${policy} × ${cls} → ${action}`, () => {
      const decision = decideTierCall(tierOf(mode, policy), cls, 'tty_run')
      expect(decision.action).toBe(action)
    })
  }

  it('auto 档让位：预审已在管，等同 allow（即使 mode 是受限档）', () => {
    const decision = decideTierCall(tierOf('workspace-write', 'ask', { auto: true }), 'exec', 'tty_run')
    expect(decision.action).toBe('allow')
  })

  it('服务缺位 = 现状（不闸），受限档也不拦', () => {
    const tier = tierOf('read-only', 'never', { services: { sandboxPolicy: false, approval: false } })
    expect(decideTierCall(tier, 'exec', 'tty_run').action).toBe('allow')
  })
})

describe('resolveSessionTier：服务读取与退化', () => {
  it('三个服务齐全：mode 走 resolve（带 session），policy 取会话覆盖优先于配置缺省', () => {
    const seen: Array<unknown> = []
    const tier = resolveSessionTier(
      {
        sandbox: {
          resolve: (request?: { session?: unknown }) => {
            seen.push(request)
            return { mode: 'workspace-write', workspaceRoot: '/ws' }
          },
        },
        approval: { overrideOf: () => 'never', config: { policy: 'ask' } },
        presets: { current: () => 'workspaceWrite' },
      },
      { id: 's1' },
    )
    expect(tier.mode).toBe('workspace-write')
    expect(tier.policy).toBe('never')
    expect(tier.auto).toBe(false)
    expect(tier.services).toEqual({ sandboxPolicy: true, approval: true })
    expect(seen).toEqual([{ session: { id: 's1' } }])
  })

  it('policy：无会话覆盖时用服务配置缺省；缺省也没有 → ask（ask 在宿主侧永远 fail-closed）', () => {
    expect(resolveSessionTier({ sandbox: { resolve: () => ({ mode: 'read-only' }) }, approval: { config: { policy: 'never' } } }, {}).policy).toBe('never')
    expect(resolveSessionTier({ sandbox: { resolve: () => ({ mode: 'read-only' }) }, approval: {} }, {}).policy).toBe('ask')
  })

  it('agentless 取严侧：policy 视作 never，resolve 用空请求（宿主 bash 同款）', () => {
    const seen: Array<unknown> = []
    const tier = resolveSessionTier(
      {
        sandbox: {
          resolve: (request?: { session?: unknown }) => {
            seen.push(request)
            return { mode: 'workspace-write' }
          },
        },
        approval: { config: { policy: 'ask' } },
      },
      undefined,
    )
    expect(tier.policy).toBe('never')
    expect(tier.mode).toBe('workspace-write')
    expect(tier.auto).toBe(false)
    expect(seen).toEqual([{}])
  })

  it('服务缺位：services 如实上报，mode/policy 落到最严缺省但不影响「不闸」判定', () => {
    const tier = resolveSessionTier({}, {})
    expect(tier.services).toEqual({ sandboxPolicy: false, approval: false })
    expect(tier.mode).toBe('read-only')
    expect(tier.policy).toBe('ask')
  })

  it('auto 检测：presets.current 返回 auto 才算；缺或抛错都不算', () => {
    expect(resolveSessionTier({ sandbox: { resolve: () => ({ mode: 'danger-full-access' }) }, presets: { current: () => 'auto' } }, {}).auto).toBe(true)
    expect(resolveSessionTier({ sandbox: { resolve: () => ({ mode: 'danger-full-access' }) }, presets: { current: () => 'readOnly' } }, {}).auto).toBe(false)
    expect(resolveSessionTier({ sandbox: { resolve: () => ({ mode: 'danger-full-access' }) } }, {}).auto).toBe(false)
  })

  it('resolve 返回词汇表之外的 mode → 按最严 read-only 落（宁严勿松）', () => {
    const tier = resolveSessionTier({ sandbox: { resolve: () => ({ mode: 'quantum' }) } }, {})
    expect(tier.mode).toBe('read-only')
  })
})

describe('tierGateStartupLine 与文案', () => {
  it('服务齐全 = active；缺谁点谁的名', () => {
    expect(tierGateStartupLine({ sandboxPolicy: true, approval: true })).toBe('tier-gate: active')
    expect(tierGateStartupLine({ sandboxPolicy: false, approval: true })).toContain('sandboxPolicy=false')
    expect(tierGateStartupLine({ sandboxPolicy: true, approval: false })).toContain('approval=false')
    expect(tierGateStartupLine({ sandboxPolicy: false, approval: false })).toContain('per-call gate disabled')
  })

  it('deny 文案：never 档点名「无人值守」，exec 类补 bash 指路，write 类不补', () => {
    const exec = tierDenialReason({ tool: 'tty_run', mode: 'workspace-write', policy: 'never', cls: 'exec' })
    expect(exec).toContain('工作区内修改')
    expect(exec).toContain('无人值守')
    expect(exec).toContain('bash')
    const write = tierDenialReason({ tool: 'sftp_write', mode: 'read-only', policy: 'never', cls: 'write' })
    expect(write).toContain('仅可查看')
    expect(write).not.toContain('bash')
  })

  it('ask 文案：带档位名与「只允许这一次」', () => {
    const decision = decideTierCall(tierOf('read-only', 'ask'), 'exec', 'tty_send')
    expect(decision.action).toBe('ask')
    expect(decision.action === 'ask' && decision.reason).toContain('仅可查看')
    expect(decision.action === 'ask' && decision.reason).toContain('只允许这一次')
  })
})

describe('attachTierGate：监听器行为', () => {
  const PREFIXES = ['tty_', 'sftp_', 'tunnel_']
  const CLASSIFY = (tool: string): TierClass | undefined => (tool === 'tty_run' ? 'exec' : undefined)

  function attach(services: Parameters<typeof fakeCtx>[0]) {
    const logs: string[] = []
    const harness = fakeCtx(services)
    const dispose = attachTierGate(harness.ctx as never, {
      pkg: 'tty',
      prefixes: PREFIXES,
      classify: CLASSIFY,
      log: (m) => logs.push(m),
    })
    return { ...harness, logs, dispose }
  }

  it('名单前缀命中：受限档 + never → deny 结构 + 一行日志，不走 next()', () => {
    const gate = attach({ sandboxPolicy: { mode: 'read-only' }, approval: { configured: 'never' } })
    const nextCalls: string[] = []
    const decision = drive(gate.listener(), { name: 'tty_run' }, nextCalls) as { kind: string; reason: string }
    expect(nextCalls).toEqual([])
    expect(decision.kind).toBe('deny')
    expect(decision.reason).toContain('tty_run')
    expect(gate.logs.some((m) => m.includes('deny tool=tty_run'))).toBe(true)
  })

  it('名单外的工具零介入：bash / 其它插件工具直接透传', () => {
    const gate = attach({ sandboxPolicy: { mode: 'read-only' }, approval: { configured: 'never' } })
    const nextCalls: string[] = []
    expect(drive(gate.listener(), { name: 'bash' }, nextCalls)).toBe('delegated')
    expect(drive(gate.listener(), { name: 'mcp__x__y' }, nextCalls)).toBe('delegated')
    expect(nextCalls).toEqual(['bash', 'mcp__x__y'])
  })

  it('allow 永远走 next() 透传（插件不是放行人），返回值是 next() 的结果', () => {
    const gate = attach({ sandboxPolicy: { mode: 'danger-full-access' }, approval: { configured: 'never' } })
    const nextCalls: string[] = []
    expect(drive(gate.listener(), { name: 'tty_run' }, nextCalls)).toBe('delegated')
    expect(nextCalls).toEqual(['tty_run'])
  })

  it('未分类的本前缀工具：放行 + 每工具名只告警一次', () => {
    const gate = attach({ sandboxPolicy: { mode: 'read-only' }, approval: { configured: 'never' } })
    const nextCalls: string[] = []
    drive(gate.listener(), { name: 'tty_newtool' }, nextCalls)
    drive(gate.listener(), { name: 'tty_newtool' }, nextCalls)
    expect(nextCalls).toEqual(['tty_newtool', 'tty_newtool'])
    const warns = gate.logs.filter((m) => m.includes('不在分类表里'))
    expect(warns).toHaveLength(1)
  })

  it('档位解析抛错：告警后按现状放行（不砖工具面）', () => {
    const gate = attach({
      sandboxPolicy: { mode: 'read-only' },
      approval: { configured: 'never' },
      breakResolve: true,
    })
    const nextCalls: string[] = []
    const result = drive(gate.listener(), { name: 'tty_run' }, nextCalls)
    expect(result).toBe('delegated')
    expect(nextCalls).toEqual(['tty_run'])
    expect(gate.logs.some((m) => m.includes('档位解析失败'))).toBe(true)
  })

  it('启动审计：attach 先报未捕获状态，inject 捕获到服务后升到 active', () => {
    const ok = attach({ sandboxPolicy: { mode: 'workspace-write' }, approval: { configured: 'ask' } })
    expect(ok.logs[0]).toContain('per-call gate disabled')
    expect(ok.logs.filter((m) => m.includes('composed'))).toHaveLength(2)
    expect(ok.logs).toContain('tier-gate: active')
    const off = attach({})
    expect(off.logs.filter((m) => m.includes('per-call gate disabled'))).toHaveLength(1)
    expect(off.logs.filter((m) => m.includes('composed'))).toHaveLength(0)
  })

  it('ctx.get 被宿主守卫挡住也不影响：闸只靠 inject 捕获的服务（真机教训的回归位）', () => {
    const gate = attach({ sandboxPolicy: { mode: 'read-only' }, approval: { configured: 'never' } })
    const nextCalls: string[] = []
    expect(drive(gate.listener(), { name: 'tty_run' }, nextCalls)).toMatchObject({ kind: 'deny' })
    expect(nextCalls).toEqual([])
  })

  it('注销函数：ctx.on 的返回值被透传（禁用热生效时随工具一起撤下）', () => {
    const gate = attach({ sandboxPolicy: { mode: 'read-only' }, approval: { configured: 'never' } })
    expect(typeof gate.dispose).toBe('function')
    expect(() => gate.dispose()).not.toThrow()
  })
})
