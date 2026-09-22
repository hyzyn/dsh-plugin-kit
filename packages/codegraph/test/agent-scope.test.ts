/**
 * P0：per-agent scoped MCP 挂载的回归测试。
 *
 * 覆盖三层：
 *   1. **纯决策**（`resolveScopeMode` / `agentMountDecision`）——前提不成立时不许静默降级；
 *   2. **挂载器**（`createAgentMounter`）——幂等、失败降级、无索引不挂、回收；
 *   3. **托管行互斥**（`syncManagedMcpRow` 的 `suspendGlobal`）——挂起/恢复必须可逆，
 *      且**只**恢复本插件挂起的行，不能把用户自己停用的服务器偷偷打开。
 *
 * 全部不碰磁盘：临时目录真实构造索引态，补丁文本按行数组直接喂给纯函数。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { syncManagedMcpRow } from '../src/index.js'
import type { McpSyncDecision } from '../src/index.js'
import {
  DEFAULT_MCP_SCOPE,
  agentMountDecision,
  createAgentMounter,
  normalizeMcpScope,
  resolveScopeMode,
} from '../src/scope.js'
import type { AgentLike, AgentMounterDeps } from '../src/scope.js'

const indexedDir = mkdtempSync(join(tmpdir(), 'dsh-cg-p0-indexed-'))
mkdirSync(join(indexedDir, '.codegraph'))
writeFileSync(join(indexedDir, '.codegraph', 'codegraph.db'), '')
const plainDir = mkdtempSync(join(tmpdir(), 'dsh-cg-p0-plain-'))
/** 第二个已索引目录：用于验证「恢复后 cwd 对齐照常工作」（未索引目标本来就不对齐，见既有语义）。 */
const indexedDir2 = mkdtempSync(join(tmpdir(), 'dsh-cg-p0-indexed2-'))
mkdirSync(join(indexedDir2, '.codegraph'))
writeFileSync(join(indexedDir2, '.codegraph', 'codegraph.db'), '')

afterAll(() => {
  rmSync(indexedDir, { recursive: true, force: true })
  rmSync(plainDir, { recursive: true, force: true })
  rmSync(indexedDir2, { recursive: true, force: true })
})

const MCP_MARK_START = '# --- dsh-mcp-config managed (auto-generated; do not edit) ---'
const MCP_MARK_END = '# --- end dsh-mcp-config managed ---'

/** 一条托管在 dsh-mcp 卡片区块里的 codegraph 行（用户可见的那种形状）。 */
const mcpBlock = (extra: string[] = []): string[] => [
  MCP_MARK_START,
  '- insert:',
  '    - id: mcp-codegraph-managed',
  "      name: '@deepseek-ai/dsh-mcp-client'",
  '      config:',
  '        serverName: codegraph',
  '        transport: stdio',
  '        command: codegraph',
  '        cwd: /tmp/some-project',
  ...extra,
  MCP_MARK_END,
  '',
]

const decision = (targetCwd: string, over: Partial<McpSyncDecision> = {}): McpSyncDecision => ({
  serverName: 'codegraph',
  command: 'codegraph',
  targetCwd,
  manageEnabled: true,
  ...over,
})

/* ------------------------------------------------------------------ *
 * 1. 纯决策：模式
 * ------------------------------------------------------------------ */

describe('P0：模式解析（resolveScopeMode）', () => {
  const base = { manageEnabled: true, agentEvents: true, externalRow: false }

  it('默认是 managed —— 这是行为变更，不许悄悄切成 per-agent', () => {
    expect(DEFAULT_MCP_SCOPE).toBe('managed')
    const d = resolveScopeMode({ ...base })
    expect(d.mode).toBe('managed')
    expect(d.reason).toContain('默认')
  })

  it('显式 per-agent 且前提齐备 → per-agent', () => {
    expect(resolveScopeMode({ ...base, config: 'per-agent' }).mode).toBe('per-agent')
    expect(resolveScopeMode({ ...base, stored: 'per-agent' }).mode).toBe('per-agent')
  })

  it('settings 存过的值优先于插件配置', () => {
    expect(resolveScopeMode({ ...base, config: 'per-agent', stored: 'managed' }).mode).toBe('managed')
    expect(resolveScopeMode({ ...base, config: 'managed', stored: 'per-agent' }).mode).toBe('per-agent')
  })

  it('宿主要 per-agent 但没有 agent 事件面 → 退回 managed 且说明原因', () => {
    const d = resolveScopeMode({ ...base, config: 'per-agent', agentEvents: false })
    expect(d.mode).toBe('managed')
    expect(d.reason).toContain('agent/created')
  })

  it('区块外有手工 codegraph 行 → 退回 managed（不顶掉用户的显式配置）', () => {
    const d = resolveScopeMode({ ...base, config: 'per-agent', externalRow: true })
    expect(d.mode).toBe('managed')
    expect(d.reason).toContain('区块外')
  })

  it('MCP 集成总开关关掉 → 两种模式都不挂', () => {
    const d = resolveScopeMode({ ...base, config: 'per-agent', manageEnabled: false })
    expect(d.mode).toBe('managed')
    expect(d.reason).toContain('总开关')
  })

  it('非法值一律回落 managed（配置面不让插件起不来）', () => {
    expect(normalizeMcpScope('nonsense')).toBe('managed')
    expect(normalizeMcpScope(undefined)).toBe('managed')
    expect(normalizeMcpScope(42)).toBe('managed')
    expect(normalizeMcpScope('per-agent')).toBe('per-agent')
    expect(resolveScopeMode({ ...base, config: 'nonsense' }).mode).toBe('managed')
  })
})

/* ------------------------------------------------------------------ *
 * 2. 纯决策：单个 agent
 * ------------------------------------------------------------------ */

describe('P0：单 agent 挂载决策（agentMountDecision）', () => {
  it('会话目录有有效索引 → 挂在索引根上', () => {
    const d = agentMountDecision({ sessionCwd: indexedDir, root: indexedDir, indexed: true })
    expect(d.mount).toBe(true)
    expect(d.root).toBe(indexedDir)
  })

  it('没有有效索引 → 不挂，且**不回落**到默认项目', () => {
    const d = agentMountDecision({ sessionCwd: plainDir, root: undefined, indexed: false })
    expect(d.mount).toBe(false)
    expect(d.root).toBeUndefined()
    expect(d.reason).toContain('不回落')
  })

  it('会话没有工作目录 → 不挂', () => {
    expect(agentMountDecision({}).mount).toBe(false)
    expect(agentMountDecision({ sessionCwd: '   ' }).mount).toBe(false)
  })

  it('CLI 明确不可用 → 不挂；探测未落地（undefined）→ 照常按索引判定（CG41 同款教训）', () => {
    expect(agentMountDecision({ sessionCwd: indexedDir, root: indexedDir, indexed: true, cliAvailable: false }).mount).toBe(false)
    expect(agentMountDecision({ sessionCwd: indexedDir, root: indexedDir, indexed: true, cliAvailable: undefined }).mount).toBe(true)
  })

  it('indexed=true 但根缺失 → 不挂（两种信号不一致时保守）', () => {
    expect(agentMountDecision({ sessionCwd: indexedDir, indexed: true }).mount).toBe(false)
  })
})

/* ------------------------------------------------------------------ *
 * 3. 挂载器
 * ------------------------------------------------------------------ */

/** 假 client 插件对象（有 apply 就够——cordis 的 isApplicable 就是这么判的）。 */
const fakeClient = { apply: () => {} }

const makeAgent = (id: string, cwd: string, plugin?: unknown): AgentLike => ({
  id,
  session: { id, header: { cwd } },
  ctx: {
    plugin: plugin ?? (() => ({ dispose: () => {} })),
  },
})

const makeDeps = (over: Partial<AgentMounterDeps> = {}): AgentMounterDeps => ({
  loadClient: async () => fakeClient,
  serverName: 'codegraph',
  command: 'codegraph',
  cliAvailable: () => true,
  resolveRoot: (cwd) => (cwd === indexedDir ? indexedDir : undefined),
  isIndexed: (cwd) => cwd === indexedDir,
  logger: { log: () => {}, warn: () => {} },
  ...over,
})

/** 等微任务队列（loadClient 是异步的，attach 刻意不 await）。 */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

describe('P0：挂载器（createAgentMounter）', () => {
  it('有索引的 agent → 挂载，cwd 是索引根', async () => {
    const calls: Array<{ config: Record<string, unknown> }> = []
    const deps = makeDeps({
      loadClient: async () => fakeClient,
    })
    const mounter = createAgentMounter(deps)
    const agent = makeAgent('a1', indexedDir, (_plugin: unknown, config: unknown) => {
      calls.push({ config: config as Record<string, unknown> })
      return { dispose: () => {} }
    })
    mounter.attach(agent, 'per-agent')
    await settle()
    expect(calls).toHaveLength(1)
    expect(calls[0].config.cwd).toBe(indexedDir)
    expect(calls[0].config.serverName).toBe('codegraph')
    expect(calls[0].config.failOnStartupError).toBe(true)
    expect(mounter.liveCount()).toBe(1)
  })

  it('没有索引的 agent → 不挂（不回落）', async () => {
    let called = 0
    const mounter = createAgentMounter(makeDeps())
    const agent = makeAgent('a2', plainDir, () => { called += 1; return { dispose: () => {} } })
    const record = mounter.attach(agent, 'per-agent')
    await settle()
    expect(called).toBe(0)
    expect(record.mounted).toBe(false)
    expect(mounter.liveCount()).toBe(0)
    expect(mounter.records()).toHaveLength(1)
    expect(mounter.records()[0].reason).toContain('不回落')
  })

  it('managed 模式下 attach 是空操作', async () => {
    let called = 0
    const mounter = createAgentMounter(makeDeps())
    const agent = makeAgent('a3', indexedDir, () => { called += 1; return {} })
    mounter.attach(agent, 'managed')
    await settle()
    expect(called).toBe(0)
    expect(mounter.liveCount()).toBe(0)
  })

  it('重复 attach 同一 agent → 只挂一次（幂等）', async () => {
    let called = 0
    const mounter = createAgentMounter(makeDeps())
    const agent = makeAgent('a4', indexedDir, () => { called += 1; return { dispose: () => {} } })
    mounter.attach(agent, 'per-agent')
    await settle()
    mounter.attach(agent, 'per-agent')
    await settle()
    expect(called).toBe(1)
    expect(mounter.liveCount()).toBe(1)
  })

  it('宿主没有 dsh-mcp-client（可选依赖）→ 记原因，不抛', async () => {
    const warn = vi.fn()
    const mounter = createAgentMounter(makeDeps({
      loadClient: async () => undefined,
      logger: { log: () => {}, warn },
    }))
    const record = mounter.attach(makeAgent('a5', indexedDir), 'per-agent')
    await settle()
    expect(record.mounted).toBe(false)
    expect(record.reason).toContain('dsh-mcp-client')
    expect(warn).toHaveBeenCalled()
  })

  it('挂载抛错 → 记进记录、不向调用方抛出（agent/created 是 serial，抛出会让会话创建失败）', async () => {
    const warn = vi.fn()
    const mounter = createAgentMounter(makeDeps({
      loadClient: async () => { throw new Error('boom') },
      logger: { log: () => {}, warn },
    }))
    const record = mounter.attach(makeAgent('a6', indexedDir), 'per-agent')
    expect(() => mounter.attach(makeAgent('a7', indexedDir), 'per-agent')).not.toThrow()
    await settle()
    expect(record.mounted).toBe(false)
    expect(record.error).toContain('boom')
    expect(warn).toHaveBeenCalled()
  })

  it('agent 没有可用的 scoped context → 不挂并说明原因', async () => {
    const mounter = createAgentMounter(makeDeps())
    const record = mounter.attach({ id: 'a8', session: { id: 'a8', header: { cwd: indexedDir } } }, 'per-agent')
    await settle()
    expect(record.mounted).toBe(false)
    expect(record.reason).toContain('scoped context')
  })

  it('会话目录变了 → 释放旧的再挂新的（同 scope 同名不能再挂，实测会被拒）', async () => {
    const seen: string[] = []
    let disposed = 0
    const deps = makeDeps({
      resolveRoot: (cwd) => (cwd === indexedDir || cwd === indexedDir2 ? cwd : undefined),
      isIndexed: (cwd) => cwd === indexedDir || cwd === indexedDir2,
    })
    const mounter = createAgentMounter(deps)
    const agent = (cwd: string): AgentLike => ({
      id: 'switch',
      session: { id: 'switch', header: { cwd } },
      ctx: {
        plugin: (_p: unknown, config: unknown) => {
          seen.push(String((config as { cwd?: string }).cwd))
          return { dispose: () => { disposed += 1 } }
        },
      },
    })
    mounter.attach(agent(indexedDir), 'per-agent')
    await settle()
    expect(seen).toEqual([indexedDir])

    // 同一个 agent（id 不变）换到另一个项目：必须回收旧 fiber，否则第二个同名实例
    // 会被 dsh-mcp-client 拒绝，agent 会一直用上一个项目的服务器。
    mounter.attach(agent(indexedDir2), 'per-agent')
    await settle()
    expect(disposed).toBe(1)
    expect(seen).toEqual([indexedDir, indexedDir2])
    expect(mounter.liveCount()).toBe(1)
    expect(mounter.records()[0].cwd).toBe(indexedDir2)
  })

  it('未挂载的记录不缓存：先没索引、之后有索引时能重新判定', async () => {
    let indexed = false
    const seen: string[] = []
    const deps = makeDeps({
      resolveRoot: (cwd) => (indexed ? cwd : undefined),
      isIndexed: () => indexed,
    })
    const mounter = createAgentMounter(deps)
    const agent = makeAgent('late', indexedDir, (_p: unknown, config: unknown) => {
      seen.push(String((config as { cwd?: string }).cwd))
      return { dispose: () => {} }
    })
    const first = mounter.attach(agent, 'per-agent')
    await settle()
    expect(first.mounted).toBe(false)

    // `codegraph init` 之后同一会话再来一次：应当挂上（缓存「不挂」会永久钉死）
    indexed = true
    mounter.attach(agent, 'per-agent')
    await settle()
    expect(seen).toEqual([indexedDir])
    expect(mounter.liveCount()).toBe(1)
  })

  it('detach 释放 fiber 并清掉记录；detachAll 清空全部', async () => {
    let disposed = 0
    const mounter = createAgentMounter(makeDeps())
    const mk = (id: string): AgentLike => makeAgent(id, indexedDir, () => ({ dispose: () => { disposed += 1 } }))
    mounter.attach(mk('b1'), 'per-agent')
    mounter.attach(mk('b2'), 'per-agent')
    await settle()
    expect(mounter.liveCount()).toBe(2)

    mounter.detach(mk('b1'))
    expect(disposed).toBe(1)
    expect(mounter.liveCount()).toBe(1)
    expect(mounter.records().map((r) => r.id)).toEqual(['b2'])

    mounter.detachAll()
    expect(disposed).toBe(2)
    expect(mounter.liveCount()).toBe(0)
    expect(mounter.records()).toHaveLength(0)
  })

  it('detach 未知 agent 是空操作（不抛）', () => {
    const mounter = createAgentMounter(makeDeps())
    expect(() => mounter.detach(makeAgent('nope', indexedDir))).not.toThrow()
    expect(() => mounter.detach({})).not.toThrow()
  })

  it('agent.ctx.plugin 的 fiber 是 thenable 时，启动失败降级但不阻塞', async () => {
    const warn = vi.fn()
    const mounter = createAgentMounter(makeDeps({ logger: { log: () => {}, warn } }))
    const failing = {
      then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
        reject(new Error('handshake failed'))
        return undefined as never
      },
    }
    const agent = makeAgent('c1', indexedDir, () => failing)
    mounter.attach(agent, 'per-agent')
    await settle()
    const record = mounter.records()[0]
    expect(record.mounted).toBe(false)
    expect(record.error).toContain('handshake failed')
    expect(warn).toHaveBeenCalled()
  })
})

/* ------------------------------------------------------------------ *
 * 4. 托管行互斥（suspendGlobal）
 * ------------------------------------------------------------------ */

describe('P0：per-agent 与全局托管行互斥（suspendGlobal）', () => {
  it('per-agent 生效 → dsh-mcp 区块里的行被挂起（disabled: true + 标记），而不是删除', () => {
    const before = mcpBlock()
    const out = syncManagedMcpRow(before, decision(indexedDir, { suspendGlobal: true }))
    expect(out.changed).toBe(true)
    const text = out.lines.join('\n')
    // 行还在（用户配置与注释都保留），只是被停用
    expect(text).toContain('serverName: codegraph')
    expect(text).toContain("cwd: /tmp/some-project")
    expect(text).toContain('disabled: true')
    expect(text).toContain('dsh-codegraph: suspended')
    // loader 认 disabled（cordis-plugin-loader:391 跳过 disabled 条目）
    expect(out.status.disabled).toBe(true)
  })

  it('挂起是幂等的：第二次同步无变化（不重复写盘）', () => {
    const first = syncManagedMcpRow(mcpBlock(), decision(indexedDir, { suspendGlobal: true }))
    const second = syncManagedMcpRow(first.lines, decision(indexedDir, { suspendGlobal: true }))
    expect(second.changed).toBe(false)
    expect((second.lines.join('\n').match(/disabled: true/g) ?? []).length).toBe(1)
  })

  it('切回 managed → 恢复（disabled: false），且能再次对齐 cwd', () => {
    const suspended = syncManagedMcpRow(mcpBlock(), decision(indexedDir, { suspendGlobal: true }))
    const restored = syncManagedMcpRow(suspended.lines, decision(indexedDir))
    expect(restored.changed).toBe(true)
    const text = restored.lines.join('\n')
    expect(text).toContain('disabled: false')
    expect(text).not.toContain('dsh-codegraph: suspended')
    // 恢复后 cwd 照常对齐到新的**已索引**目标（未索引目标本来就不对齐，是既有语义）
    const moved = syncManagedMcpRow(restored.lines, decision(indexedDir2))
    expect(moved.lines.join('\n')).toContain('cwd: ' + indexedDir2)
  })

  it('恢复**不碰**用户自己停用的行（没有本插件标记）', () => {
    // 用户用 MCP 卡片把服务器停用了：disabled: true 但没有我们的标记
    const userDisabled = mcpBlock(['        disabled: true'])
    const out = syncManagedMcpRow(userDisabled, decision(indexedDir))
    const text = out.lines.join('\n')
    expect(text).toContain('disabled: true')
    expect(text).not.toContain('disabled: false')
  })

  it('挂起已有用户 disabled 的行：不抢注释、不重复加键', () => {
    const userDisabled = mcpBlock(['        disabled: true'])
    const out = syncManagedMcpRow(userDisabled, decision(indexedDir, { suspendGlobal: true }))
    expect(out.changed).toBe(false)
    expect(out.lines.join('\n')).not.toContain('dsh-codegraph: suspended')
  })

  it('挂起期间不再对齐 cwd（那个字段此刻不生效，写它只是白改文件 + 触发热加载）', () => {
    const out = syncManagedMcpRow(mcpBlock(), decision(plainDir, { suspendGlobal: true }))
    expect(out.lines.join('\n')).toContain('cwd: /tmp/some-project')
  })

  it('per-agent 生效时本插件自己区块里的行被撤销（自动生成，无用户内容可保）', () => {
    const own = [
      '# --- dsh-codegraph mcp managed (auto-generated; do not edit) ---',
      '- insert:',
      '    - id: mcp-codegraph-managed',
      "      name: '@deepseek-ai/dsh-mcp-client'",
      '      config:',
      '        serverName: codegraph',
      '        cwd: /tmp/x',
      '# --- end dsh-codegraph mcp managed ---',
      '',
    ]
    const out = syncManagedMcpRow(own, decision(indexedDir, { suspendGlobal: true }))
    expect(out.changed).toBe(true)
    const text = out.lines.join('\n')
    expect(text).not.toContain('- id: mcp-codegraph-managed')
    expect(out.status.note).toContain('撤销')
    // 切回 managed 能重新托管
    const back = syncManagedMcpRow(out.lines, decision(indexedDir))
    expect(back.changed).toBe(true)
    expect(back.lines.join('\n')).toContain('serverName: codegraph')
  })

  it('dryRun 快照如实回报「已挂起」，不落盘', () => {
    const suspended = syncManagedMcpRow(mcpBlock(), decision(indexedDir, { suspendGlobal: true }))
    const snap = syncManagedMcpRow(suspended.lines, decision(indexedDir, { suspendGlobal: true, dryRun: true }))
    expect(snap.changed).toBe(false)
    expect(snap.status.disabled).toBe(true)
    expect(snap.status.note).toContain('挂起')
  })

  it('CRLF 文件里挂起不改变行尾', () => {
    const crlf = mcpBlock().map((line) => line + '\r')
    const out = syncManagedMcpRow(crlf, decision(indexedDir, { suspendGlobal: true }))
    for (const line of out.lines) {
      if (line.trim() === '') continue
      expect(line.endsWith('\r')).toBe(true)
    }
  })

  it('disabled 写在 serverName 之前也能定位（YAML 键序自由，CG31 同款）', () => {
    const reordered = [
      MCP_MARK_START,
      '- insert:',
      '    - id: mcp-codegraph-managed',
      '      config:',
      '        disabled: false',
      '        serverName: codegraph',
      '        cwd: /tmp/some-project',
      MCP_MARK_END,
      '',
    ]
    const out = syncManagedMcpRow(reordered, decision(indexedDir, { suspendGlobal: true }))
    const text = out.lines.join('\n')
    expect(text).toContain('disabled: true')
    // 关键：没有补出第二个 disabled 键（重复映射键会让 js-yaml 直接拒载整份文件）
    expect((text.match(/^\s*disabled:/gm) ?? []).length).toBe(1)
  })
})
