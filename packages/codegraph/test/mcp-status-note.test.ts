/**
 * 托管空态自证（`withEmptyStateNote`）的回归测试。
 *
 * ## 钉的是什么
 *
 * `syncManagedMcpRow` 的 `status.note` 答的是「文件里是什么」；托管行为空的两种**已知空态**
 * 还需要一句「为什么空 / 下一步」，否则卡片上只有「未托管」，用户不知道该点哪个按钮：
 *
 *   1. 本插件区块渲染出来是空占位 `- insert: []` + 默认项目没有索引；
 *   2. per-agent 生效 → 全局托管行被挂起（工具按 agent 挂载）。
 *
 * 同时钉住**不制造噪声**的三条：真有行在托管时不写 note；联动关闭 / 区块解析失败时的
 * 具体诊断不被覆盖；已索引却还空着时不冒充「没有已索引的默认项目」。
 *
 * ## 为什么要一个「组合」而非只测这个纯函数
 *
 * `snapshotMcpStatus` 里的顺序是「先 `syncManagedMcpRow` 拿状态，再交给 `withEmptyStateNote`」。
 * 本文件用同一个组合（同样的 decision 字段、同样 dryRun:true）验收，断言的是**快照会给出
 * 什么**，而不是这个函数单独能算对什么。真出口（HTTP `/default-path`）是否接上了这条，
 * 由 `cli-route.test.ts` 的 T6 那组用例钉住。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { syncManagedMcpRow, withEmptyStateNote } from '../src/index.js'
import type { McpSyncDecision, McpSyncStatus } from '../src/index.js'

/** 已索引目录（`.codegraph/` 里有索引库）。 */
const indexedDir = mkdtempSync(join(tmpdir(), 'dsh-cg-note-indexed-'))
mkdirSync(join(indexedDir, '.codegraph'))
writeFileSync(join(indexedDir, '.codegraph', 'codegraph.db'), '')
/** 完全没有索引目录的项目。 */
const plainDir = mkdtempSync(join(tmpdir(), 'dsh-cg-note-plain-'))

afterAll(() => {
  rmSync(indexedDir, { recursive: true, force: true })
  rmSync(plainDir, { recursive: true, force: true })
})

const OWN_START = '# --- dsh-codegraph mcp managed (auto-generated; do not edit) ---'
const OWN_END = '# --- end dsh-codegraph mcp managed ---'

/** CG69 现场的形状：本插件区块在，区块体是空占位（一条可写的真行都没有）。 */
const emptyPlaceholder = ['# dsh home patch layer', OWN_START, '- insert: []', OWN_END, '']

interface SnapshotInput {
  targetCwd: string
  suspendGlobal?: boolean
  manageEnabled?: boolean
}

/**
 * 按 `snapshotMcpStatus` 的同一顺序组合出快照状态：dryRun 同步 → 空态自证。
 *
 * `perAgent` 与 `suspendGlobal` 在这里恒等（与 src 里 `rt.scopeDecision.mode === 'per-agent'`
 * 的用法一致），故意不给两个入口——那正是要防的漂移。
 */
function snapshot(lines: readonly string[], input: SnapshotInput): McpSyncStatus {
  const manageEnabled = input.manageEnabled ?? true
  const perAgent = input.suspendGlobal === true
  const decision: McpSyncDecision = {
    serverName: 'codegraph',
    command: 'test-codegraph',
    targetCwd: input.targetCwd,
    manageEnabled,
    ...(perAgent ? { suspendGlobal: true } : {}),
    dryRun: true,
  }
  const status = syncManagedMcpRow([...lines], decision).status
  return withEmptyStateNote(status, { perAgent, manageEnabled, lines })
}

/** 先真实托管一次，拿到「区块里有真行、cwd 已对齐」的文件内容。 */
function managedLines(targetCwd: string): string[] {
  return syncManagedMcpRow(['# dsh home patch layer', ''], {
    serverName: 'codegraph',
    command: 'test-codegraph',
    targetCwd,
    manageEnabled: true,
  }).lines
}

describe('空占位 + 默认项目未索引：note 说出「为什么空 / 下一步」', () => {
  it('验收①：note 非空且点名「设为默认项目」', () => {
    const status = snapshot(emptyPlaceholder, { targetCwd: plainDir })
    expect(status.mode).toBe('none')
    expect(status.indexed).toBe(false)
    expect(status.note, '空占位是已知空态，note 必须自证').toBeTruthy()
    expect(status.note).toContain('设为默认项目')
    // 成因也要说对：是「没有已索引的默认项目」，不是「坏文件」
    expect(status.note).toContain('没有已索引的默认项目')
  })

  it('空占位 + 已索引：不冒充「没有已索引的默认项目」，保留同步侧「下次同步会写入」', () => {
    const status = snapshot(emptyPlaceholder, { targetCwd: indexedDir })
    expect(status.mode).toBe('none')
    expect(status.note).toContain('下次同步会写入')
    expect(status.note).not.toContain('没有已索引的默认项目')
  })
})

describe('真有行在托管：不写 note（不制造噪声）', () => {
  it('验收②：own 行在、cwd 已对齐 → note 不出现', () => {
    const lines = managedLines(indexedDir)
    expect(lines.join('\n'), '前置：区块里必须真有行').toContain('serverName: codegraph')
    const status = snapshot(lines, { targetCwd: indexedDir })
    expect(status.mode).toBe('own')
    expect(status.note).toBeUndefined()
  })
})

describe('per-agent：托管行已挂起（工具按 agent 挂载）', () => {
  it('验收③：自有行被撤销的快照 → note 说明「已挂起」', () => {
    const status = snapshot(managedLines(indexedDir), { targetCwd: indexedDir, suspendGlobal: true })
    expect(status.mode).toBe('none')
    expect(String(status.note)).toContain('已挂起')
    expect(String(status.note)).toContain('per-agent')
  })

  it('验收③：空占位（上一轮挂起留下的形状）+ per-agent → 同样说「已挂起」', () => {
    const status = snapshot(emptyPlaceholder, { targetCwd: plainDir, suspendGlobal: true })
    expect(status.mode).toBe('none')
    expect(String(status.note)).toContain('已挂起')
    // per-agent 是成因，不该被解释成「默认项目没索引」
    expect(String(status.note)).not.toContain('设为默认项目')
  })
})

describe('具体诊断不被覆盖', () => {
  it('联动关闭：保留「联动关闭」，不改成「去设默认项目」', () => {
    const status = snapshot(emptyPlaceholder, { targetCwd: plainDir, manageEnabled: false })
    expect(status.note).toContain('联动已关闭')
    expect(status.note).not.toContain('设为默认项目')
  })

  it('区块 YAML 损坏：保留「解析失败」（那是坏文件，不是空态）', () => {
    const broken = ['# dsh home patch layer', OWN_START, '- insert: [broken', OWN_END, '']
    const status = snapshot(broken, { targetCwd: plainDir })
    expect(status.mode).toBe('none')
    expect(status.note).toContain('解析失败')
    expect(status.note).not.toContain('设为默认项目')
  })
})
