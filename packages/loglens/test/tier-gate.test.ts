/**
 * @hyzyn/dsh-loglens — 档位闸（P3）——两层，形态与 docker / tty 的同名用例同构：
 *
 * 1. **对账守卫**：分类表（LOGLENS_TIER_CLASS）必须与 registerLoglensTools 里 `add('loglens_x', …)`
 *    注册的工集一一对应。名单从 **add() 调用处**现算（它是注册的唯一漏斗），两向对账。
 * 2. **行为**：走真的 attachTierGate + 真的分类表。本包四个工具全归 read（查日志不写任何东西），
 *    所以矩阵上只剩「read 类在各档位都放行」与「前缀外零介入」两件事可断言——真正拦人的是那四条
 *    分类条目本身，而它们由第一层守。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { attachTierGate } from '@hyzyn/dsh-kit'
import { LOGLENS_TIER_CLASS, LOGLENS_TIER_PREFIXES } from '../src/tools.js'

const SOURCE = readFileSync(new URL('../src/tools.ts', import.meta.url), 'utf8')

/** 从 add() 调用处现算工具名单（注册的唯一漏斗，字面量工具名）。 */
function registeredToolNames(): string[] {
  const names: string[] = []
  for (const match of SOURCE.matchAll(/\badd\('([a-z_]+)'/g)) names.push(match[1])
  return names
}

describe('对账守卫：分类表 ↔ add() 注册处', () => {
  it('注册的每个工具都有分类（漏分类 = 档位闸只告警放行，不许发生）', () => {
    const unclassified = registeredToolNames().filter((name) => !(name in LOGLENS_TIER_CLASS))
    expect(unclassified, '这些工具没有进 LOGLENS_TIER_CLASS：' + unclassified.join('、')).toEqual([])
  })

  it('分类表里没有幽灵条目', () => {
    const registered = new Set(registeredToolNames())
    const ghosts = Object.keys(LOGLENS_TIER_CLASS).filter((name) => !registered.has(name))
    expect(ghosts, '这些分类条目没有对应的注册工具：' + ghosts.join('、')).toEqual([])
  })

  it('四个工具**全是 read**：查日志不在任何目标机上执行命令，也不改本地状态', () => {
    expect(registeredToolNames().sort()).toEqual(['loglens_context', 'loglens_fields', 'loglens_search', 'loglens_sources'])
    for (const name of registeredToolNames()) expect(LOGLENS_TIER_CLASS[name]).toBe('read')
  })

  it('前缀口径：所有注册工具都落在 LOGLENS_TIER_PREFIXES 里', () => {
    for (const name of registeredToolNames()) {
      expect(LOGLENS_TIER_PREFIXES.some((prefix) => name.startsWith(prefix)), '工具 ' + name + ' 不在档位闸前缀里').toBe(true)
    }
  })
})

/** 造最小假 ctx：inject 模拟宿主的可选服务注入（服务存在即以名为属性的上下文触发回调）。 */
function fakeCtx(services: {
  mode?: 'read-only' | 'workspace-write' | 'danger-full-access'
  policy?: 'ask' | 'never'
}): { ctx: unknown; listener: () => unknown } {
  let captured: unknown
  const serviceByName: Record<string, unknown> = {
    ...(services.mode === undefined ? {} : { sandboxPolicy: { resolve: () => ({ mode: services.mode, workspaceRoot: '/ws' }) } }),
    ...(services.policy === undefined ? {} : { approval: { overrideOf: () => undefined, config: { policy: services.policy } } }),
  }
  const ctx = {
    inject(names: readonly string[], callback: (serviceCtx: unknown) => void): () => void {
      for (const name of names) {
        if (serviceByName[name] !== undefined) callback({ [name]: serviceByName[name] })
      }
      return () => {}
    },
    on(name: string, listener: unknown): () => void {
      expect(name).toBe('tools/pre-execute')
      captured = listener
      return () => {}
    },
  }
  return { ctx, listener: () => captured }
}

function drive(listener: unknown, name: string, nextCalls: string[]): unknown {
  return (listener as (exec: unknown, next: () => unknown) => unknown)(
    { name, args: {}, agent: { session: {} } },
    () => {
      nextCalls.push(name)
      return 'delegated'
    },
  )
}

describe('行为：分类表接上 kit 的闸', () => {
  function attach(mode?: 'read-only' | 'workspace-write' | 'danger-full-access', policy?: 'ask' | 'never') {
    const logs: string[] = []
    const harness = fakeCtx({ mode, policy })
    attachTierGate(harness.ctx as never, {
      pkg: 'loglens',
      prefixes: LOGLENS_TIER_PREFIXES,
      classify: (tool) => LOGLENS_TIER_CLASS[tool],
      log: (message) => logs.push(message),
    })
    return { listener: harness.listener(), logs }
  }

  it('仅可查看 + 无人值守：四个只读工具全部放行（查日志不该被档位挡住）', () => {
    const gate = attach('read-only', 'never')
    const nextCalls: string[] = []
    for (const name of ['loglens_sources', 'loglens_search', 'loglens_fields', 'loglens_context']) {
      expect(drive(gate.listener, name, nextCalls)).toBe('delegated')
    }
    expect(nextCalls).toHaveLength(4)
  })

  it('前缀外一个都不碰（bash / docker_* / tty_* 照原样放行）', () => {
    const gate = attach('read-only', 'never')
    const nextCalls: string[] = []
    for (const name of ['bash', 'docker_ps', 'tty_run', 'loglen_search']) {
      expect(drive(gate.listener, name, nextCalls)).toBe('delegated')
    }
    expect(nextCalls).toHaveLength(4)
    expect(gate.logs.filter((line) => line.includes('不在分类表里'))).toEqual([])
  })

  it('未分类的前缀内工具：放行 + 一条告警（运行期不许因漏分类拦死工具，兜底是对账守卫）', () => {
    const gate = attach('read-only', 'never')
    const nextCalls: string[] = []
    expect(drive(gate.listener, 'loglens_newtool', nextCalls)).toBe('delegated')
    expect(gate.logs.some((line) => line.includes('不在分类表里'))).toBe(true)
  })

  it('档位服务未组合 = 现状（不闸），启动审计写明 disabled', () => {
    const gate = attach(undefined, undefined)
    const nextCalls: string[] = []
    expect(drive(gate.listener, 'loglens_search', nextCalls)).toBe('delegated')
    expect(gate.logs[0]).toContain('per-call gate disabled')
  })
})
