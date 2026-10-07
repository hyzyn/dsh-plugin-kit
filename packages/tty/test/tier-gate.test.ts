/**
 * 档位闸（tty 侧）——两层测试：
 *
 * 1. **对账守卫**（本仓硬规矩「新增规则配守卫，没有守卫的规矩会在下一次改动里漂掉」）：
 *    分类表（`TTY_TIER_CLASS`）必须与 registerAll 注册的工具集一一对应。名单从**注册处的
 *    启动日志行**现算（那一行在注册成功后才打，维护者加工具时会顺手更新它），两向对账：
 *    注册了没分类 → 红；分类了没注册（或日志行漏更）→ 红。
 * 2. **行为**：走真的 `attachTierGate` + 真的分类表，按矩阵断言代表格——tty_run / tty_send
 *    被挡在受限档、只读工具全档放行、bash 工具零介入。矩阵全格的证明在 kit 的用例里，
 *    这里只测「tty 的表接上 kit 的闸」这段接线。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { attachTierGate } from '@hyzyn/dsh-kit'
import { TTY_TIER_CLASS, TTY_TIER_PREFIXES } from '../src/index.js'

const SOURCE = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')

/** 从注册处的启动日志行现算工具名单（与 src/index.ts 的 console.log 一字对一字）。 */
function registeredToolNames(): string[] {
  const match = SOURCE.match(/agent tools registered \(([^)]*)\)/)
  expect(match, 'src/index.ts 的启动日志行（agent tools registered）被改动或删除了——请同步本守卫的取数口径').not.toBeNull()
  return match![1].split(',').map((name) => name.trim()).filter((name) => name !== '')
}

describe('对账守卫：分类表 ↔ 注册处名单', () => {
  it('注册的每个工具都有分类（漏分类 = 档位闸静默放行，不许发生）', () => {
    const unclassified = registeredToolNames().filter((name) => !(name in TTY_TIER_CLASS))
    expect(unclassified, `这些工具没有进 TTY_TIER_CLASS：${unclassified.join('、')}`).toEqual([])
  })

  it('分类表里没有幽灵条目（分类了却没注册 = 表与实现脱节）', () => {
    const registered = new Set(registeredToolNames())
    const ghosts = Object.keys(TTY_TIER_CLASS).filter((name) => !registered.has(name))
    expect(ghosts, `这些分类条目没有对应的注册工具：${ghosts.join('、')}`).toEqual([])
  })

  it('前缀口径：所有注册工具都落在 TTY_TIER_PREFIXES 里（闸按前缀过滤，前缀漏了 = 工具不设防）', () => {
    for (const name of registeredToolNames()) {
      expect(
        TTY_TIER_PREFIXES.some((prefix) => name.startsWith(prefix)),
        `工具 ${name} 不在任何档位闸前缀里`,
      ).toBe(true)
    }
  })
})

/** 造最小假 ctx：`inject` 模拟宿主的可选服务注入（服务存在即以名为属性的上下文触发回调）。 */
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
      pkg: 'tty',
      prefixes: TTY_TIER_PREFIXES,
      classify: (tool) => TTY_TIER_CLASS[tool],
      log: (m) => logs.push(m),
    })
    return { listener: harness.listener(), logs }
  }

  it('仅可查看 + never：exec 类 deny、write 类 deny、read 类放行', () => {
    const gate = attach('read-only', 'never')
    const nextCalls: string[] = []
    expect(drive(gate.listener, 'tty_run', nextCalls)).toMatchObject({ kind: 'deny' })
    expect(drive(gate.listener, 'tty_send', nextCalls)).toMatchObject({ kind: 'deny' })
    expect(drive(gate.listener, 'sftp_write', nextCalls)).toMatchObject({ kind: 'deny' })
    expect(drive(gate.listener, 'tty_capture', nextCalls)).toBe('delegated')
    expect(drive(gate.listener, 'sftp_read', nextCalls)).toBe('delegated')
    expect(nextCalls).toEqual(['tty_capture', 'sftp_read'])
  })

  it('工作区内修改 + ask：exec / write 类 ask（文案带工具名），read 类放行', () => {
    const gate = attach('workspace-write', 'ask')
    const nextCalls: string[] = []
    const ask = drive(gate.listener, 'tty_run', nextCalls) as { kind: string; reason: string }
    expect(ask.kind).toBe('ask')
    expect(ask.reason).toContain('tty_run')
    expect(ask.reason).toContain('工作区内修改')
    expect(drive(gate.listener, 'sftp_remove', nextCalls)).toMatchObject({ kind: 'ask' })
    expect(drive(gate.listener, 'tty_list', nextCalls)).toBe('delegated')
  })

  it('完全权限档零询问（该档审批策略是 never，ask 会被宿主确定性拒绝）', () => {
    const gate = attach('danger-full-access', 'never')
    const nextCalls: string[] = []
    for (const name of ['tty_run', 'tty_send', 'tty_open', 'tunnel_start', 'sftp_remove', 'tty_list']) {
      expect(drive(gate.listener, name, nextCalls)).toBe('delegated')
    }
    expect(nextCalls).toHaveLength(6)
  })

  it('服务未组合 = 现状（不闸）+ 启动审计写明 disabled', () => {
    const gate = attach(undefined, undefined)
    const nextCalls: string[] = []
    expect(drive(gate.listener, 'tty_run', nextCalls)).toBe('delegated')
    expect(gate.logs[0]).toContain('per-call gate disabled')
  })

  it('bash 工具零介入（前缀过滤）', () => {
    const gate = attach('read-only', 'never')
    const nextCalls: string[] = []
    expect(drive(gate.listener, 'bash', nextCalls)).toBe('delegated')
    expect(nextCalls).toEqual(['bash'])
  })

  it('deny 有一行日志（deny tool=… mode=… policy=…）', () => {
    const gate = attach('read-only', 'never')
    drive(gate.listener, 'tty_run', [])
    expect(gate.logs.some((m) => m.includes('tier-gate: deny tool=tty_run') && m.includes('read-only'))).toBe(true)
  })
})
