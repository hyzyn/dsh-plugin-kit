/**
 * 档位闸（docker 侧）——两层测试，形态与 packages/tty/test/tier-gate.test.ts 同构：
 *
 * 1. **对账守卫**：分类表（`DOCKER_TIER_CLASS`）必须与 refreshTools 里 `add()` 注册的工集
 *    一一对应。名单从 **`add()` 调用处**现算（它是注册的唯一漏斗，字面量工具名），两向对账：
 *    注册了没分类 → 红；分类了没注册 → 红。
 * 2. **行为**：走真的 `attachTierGate` + 真的分类表，按矩阵断言代表格；并验一层 docker 特有的
 *    语义——**静态开关与档位闸互不越位**：`allowMutations` 未授权时破坏档工具根本不注册
 *    （那层语义归既有用例），档位闸只对「已注册的调用」生效，这里验证已注册工具在不同档位下的
 *    放行 / 询问 / 拒绝。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { attachTierGate } from '@hyzyn/dsh-kit'
import { DOCKER_TIER_CLASS, DOCKER_TIER_PREFIXES } from '../src/index.js'

const SOURCE = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')

/** 从 add() 调用处现算工具名单（refreshTools 里注册的唯一漏斗）。 */
function registeredToolNames(): string[] {
  const names: string[] = []
  for (const match of SOURCE.matchAll(/\badd\('([a-z_]+)'/g)) names.push(match[1])
  return names
}

describe('对账守卫：分类表 ↔ add() 注册处', () => {
  it('注册的每个工具都有分类（漏分类 = 档位闸静默放行，不许发生）', () => {
    const unclassified = registeredToolNames().filter((name) => !(name in DOCKER_TIER_CLASS))
    expect(unclassified, `这些工具没有进 DOCKER_TIER_CLASS：${unclassified.join('、')}`).toEqual([])
  })

  it('分类表里没有幽灵条目（分类了却没注册 = 表与实现脱节）', () => {
    const registered = new Set(registeredToolNames())
    const ghosts = Object.keys(DOCKER_TIER_CLASS).filter((name) => !registered.has(name))
    expect(ghosts, `这些分类条目没有对应的注册工具：${ghosts.join('、')}`).toEqual([])
  })

  it('前缀口径：所有注册工具都落在 DOCKER_TIER_PREFIXES 里', () => {
    for (const name of registeredToolNames()) {
      expect(
        DOCKER_TIER_PREFIXES.some((prefix) => name.startsWith(prefix)),
        `工具 ${name} 不在档位闸前缀里`,
      ).toBe(true)
    }
  })

  it('静态开关的组别与档位类对得上：write 类工具都注册在 allowMutations 组内、exec 类在 allowExec 组内', () => {
    // allowMutations / allowExec 的注册块是 `if (live.<开关>) { add('docker_x', …) }`；
    // 用行号现算每个 add 落在哪个 if 块内，与分类表的类两向对账——防的是「新工具加错了组」。
    const lines = SOURCE.split('\n')
    const blockOf = (lineIndex: number): 'always' | 'allowMutations' | 'allowExec' => {
      let depthMutations = 0
      let depthExec = 0
      for (let i = 0; i < lineIndex; i++) {
        const line = lines[i]
        if (/if \(live\.allowMutations\) \{/.test(line)) depthMutations++
        if (/if \(live\.allowExec\) \{/.test(line)) depthExec++
      }
      // 两个块是平级的 if（不是嵌套）：先命中的算——exec 块在 mutations 块之后出现且不重叠
      if (depthExec > 0 && depthExec >= depthMutations) return 'allowExec'
      if (depthMutations > 0) return 'allowMutations'
      return 'always'
    }
    for (const match of SOURCE.matchAll(/\badd\('([a-z_]+)'/g)) {
      const block = blockOf(match.index !== undefined ? SOURCE.slice(0, match.index).split('\n').length - 1 : 0)
      const cls = DOCKER_TIER_CLASS[match[1]]
      if (cls === 'write') expect(block, `${match[1]} 是 write 类，应注册在 allowMutations 组`).toBe('allowMutations')
      if (cls === 'exec') expect(block, `${match[1]} 是 exec 类，应注册在 allowExec 组`).toBe('allowExec')
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
      pkg: 'docker',
      prefixes: DOCKER_TIER_PREFIXES,
      classify: (tool) => DOCKER_TIER_CLASS[tool],
      log: (m) => logs.push(m),
    })
    return { listener: harness.listener(), logs }
  }

  it('仅可查看 + never：write / exec 类 deny，read 类放行', () => {
    const gate = attach('read-only', 'never')
    const nextCalls: string[] = []
    expect(drive(gate.listener, 'docker_action', nextCalls)).toMatchObject({ kind: 'deny' })
    expect(drive(gate.listener, 'docker_image_prune', nextCalls)).toMatchObject({ kind: 'deny' })
    expect(drive(gate.listener, 'docker_exec', nextCalls)).toMatchObject({ kind: 'deny' })
    expect(drive(gate.listener, 'docker_ps', nextCalls)).toBe('delegated')
    expect(drive(gate.listener, 'docker_logs', nextCalls)).toBe('delegated')
    expect(nextCalls).toEqual(['docker_ps', 'docker_logs'])
  })

  it('工作区内修改 + ask：write / exec 类 ask（文案带工具名），read 类放行', () => {
    const gate = attach('workspace-write', 'ask')
    const nextCalls: string[] = []
    const ask = drive(gate.listener, 'docker_action', nextCalls) as { kind: string; reason: string }
    expect(ask.kind).toBe('ask')
    expect(ask.reason).toContain('docker_action')
    expect(ask.reason).toContain('工作区内修改')
    expect(drive(gate.listener, 'docker_exec', nextCalls)).toMatchObject({ kind: 'ask' })
    expect(drive(gate.listener, 'docker_inspect', nextCalls)).toBe('delegated')
  })

  it('完全权限档零询问（该档审批策略是 never，ask 会被宿主确定性拒绝）', () => {
    const gate = attach('danger-full-access', 'never')
    const nextCalls: string[] = []
    for (const name of ['docker_action', 'docker_image_remove', 'docker_exec', 'docker_ps']) {
      expect(drive(gate.listener, name, nextCalls)).toBe('delegated')
    }
    expect(nextCalls).toHaveLength(4)
  })

  it('服务未组合 = 现状（不闸）+ 启动审计写明 disabled', () => {
    const gate = attach(undefined, undefined)
    const nextCalls: string[] = []
    expect(drive(gate.listener, 'docker_action', nextCalls)).toBe('delegated')
    expect(gate.logs[0]).toContain('per-call gate disabled')
  })

  it('bash / tty 工具零介入（前缀过滤）', () => {
    const gate = attach('read-only', 'never')
    const nextCalls: string[] = []
    expect(drive(gate.listener, 'bash', nextCalls)).toBe('delegated')
    expect(drive(gate.listener, 'tty_run', nextCalls)).toBe('delegated')
    expect(nextCalls).toEqual(['bash', 'tty_run'])
  })
})
