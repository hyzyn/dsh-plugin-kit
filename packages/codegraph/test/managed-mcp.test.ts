/**
 * @hyzyn/dsh-codegraph — MCP 托管行同步（syncManagedMcpRow）的回归测试。
 *
 * 纯函数、不碰磁盘：决策矩阵覆盖「无托管行 / 本插件区块 / 复用 MCP 卡片区块 /
 * 区块外手工行 / 联动关闭」五种走向。indexed 由 targetCwd 下是否存在 .codegraph/
 * 决定，用临时目录真实构造两种目标路径。
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { syncManagedMcpRow } from '../src/index.js'
import type { McpSyncDecision } from '../src/index.js'

/** 已索引目录（存在 .codegraph/）。 */
const indexedDir = mkdtempSync(join(tmpdir(), 'dsh-cg-indexed-'))
mkdirSync(join(indexedDir, '.codegraph'))
/** 未索引目录。 */
const plainDir = mkdtempSync(join(tmpdir(), 'dsh-cg-plain-'))

afterAll(() => {
  rmSync(indexedDir, { recursive: true, force: true })
  rmSync(plainDir, { recursive: true, force: true })
})

function decision(targetCwd: string, manageEnabled = true): McpSyncDecision {
  return { serverName: 'codegraph', command: 'test-codegraph', targetCwd, manageEnabled }
}

const MCP_MARK_START = '# --- dsh-mcp-config managed (auto-generated; do not edit) ---'
const MCP_MARK_END = '# --- end dsh-mcp-config managed ---'

/** 一份「MCP 卡片托管区块里已有 codegraph 行」的补丁文本。 */
function mcpBlock(cwd: string): string[] {
  return [
    MCP_MARK_START,
    '- insert:',
    '    - id: mcp-cg',
    "      name: '@deepseek-ai/dsh-mcp-client'",
    '      config:',
    '        serverName: codegraph',
    `        cwd: ${cwd}`,
    MCP_MARK_END,
    '',
  ]
}

describe('syncManagedMcpRow', () => {
  it('无托管行 + 目标已索引：写入本插件区块并托管', () => {
    const outcome = syncManagedMcpRow([''], decision(indexedDir))
    expect(outcome.changed).toBe(true)
    expect(outcome.status).toMatchObject({ mode: 'own', id: 'mcp-codegraph-managed', cwd: indexedDir, indexed: true })
    const text = outcome.lines.join('\n')
    expect(text).toContain('# --- dsh-codegraph mcp managed (auto-generated; do not edit) ---')
    expect(text).toContain('        serverName: codegraph')
    expect(text).toContain('        command: test-codegraph')
    expect(text).toContain("          - '--mcp'")
    expect(text).toContain('# --- end dsh-codegraph mcp managed ---')
  })

  it('无托管行 + 目标未索引：不写行（changed=false，原数组引用返回）', () => {
    const input = ['# dsh home patch layer', '']
    const outcome = syncManagedMcpRow(input, decision(plainDir))
    expect(outcome.changed).toBe(false)
    expect(outcome.lines).toBe(input)
    expect(outcome.status.mode).toBe('none')
    expect(outcome.status.note).toContain('缺少 .codegraph/')
  })

  it('重复同步幂等：第二次 changed=false 且内容不变', () => {
    const first = syncManagedMcpRow([''], decision(indexedDir))
    const second = syncManagedMcpRow(first.lines, decision(indexedDir))
    expect(second.changed).toBe(false)
    expect(second.lines).toBe(first.lines)
    expect(second.status.mode).toBe('own')
  })

  it('已有本插件托管行：目标路径变化时只对齐 cwd，其余字段保持', () => {
    const first = syncManagedMcpRow([''], decision(indexedDir))
    const other = mkdtempSync(join(tmpdir(), 'dsh-cg-other-'))
    mkdirSync(join(other, '.codegraph'))
    try {
      const updated = syncManagedMcpRow(first.lines, decision(other))
      expect(updated.changed).toBe(true)
      expect(updated.status).toMatchObject({ mode: 'own', cwd: other, indexed: true })
      expect(updated.lines.some((line) => line.includes(`cwd: ${other}`))).toBe(true)
      expect(updated.lines.some((line) => line.includes(`cwd: ${indexedDir}`))).toBe(false)
    } finally {
      rmSync(other, { recursive: true, force: true })
    }
  })

  it('已有本插件托管行 + 目标未索引：保持现状不发新行', () => {
    const first = syncManagedMcpRow([''], decision(indexedDir))
    const outcome = syncManagedMcpRow(first.lines, decision(plainDir))
    expect(outcome.changed).toBe(false)
    expect(outcome.status.mode).toBe('own')
    expect(outcome.status.note).toContain('缺少 .codegraph/')
  })

  it('联动关闭：撤销本插件托管行，mode 归 none', () => {
    const first = syncManagedMcpRow([''], decision(indexedDir))
    const outcome = syncManagedMcpRow(first.lines, decision(indexedDir, false))
    expect(outcome.changed).toBe(true)
    expect(outcome.status.mode).toBe('none')
    expect(outcome.status.note).toContain('已撤销')
    expect(outcome.lines.join('\n')).not.toContain('serverName: codegraph')
  })

  it('联动关闭且本来没有托管行：不产生任何改动', () => {
    const input = ['# dsh home patch layer', '']
    const outcome = syncManagedMcpRow(input, decision(indexedDir, false))
    expect(outcome.changed).toBe(false)
    expect(outcome.lines).toBe(input)
    expect(outcome.status).toMatchObject({ mode: 'none', note: 'MCP 联动已关闭' })
  })

  it('区块外手工行：只检测不碰（mode=external，避免 serverName 冲突）', () => {
    const input = [
      '- insert:',
      '    - id: manual-cg',
      "      name: '@deepseek-ai/dsh-mcp-client'",
      '      config:',
      '        serverName: codegraph',
      '        cwd: /manual/path',
      '',
    ]
    const outcome = syncManagedMcpRow(input, decision(indexedDir))
    expect(outcome.changed).toBe(false)
    expect(outcome.lines).toBe(input)
    expect(outcome.status).toMatchObject({ mode: 'external', id: 'manual-cg', cwd: '/manual/path', indexed: true })
    expect(outcome.status.note).toContain('serverName 冲突')
  })

  it('复用 MCP 卡片区块里的 codegraph 行：只对齐 cwd，不新建本插件区块', () => {
    const outcome = syncManagedMcpRow(mcpBlock('/old/path'), decision(indexedDir))
    expect(outcome.changed).toBe(true)
    expect(outcome.status).toMatchObject({ mode: 'dsh-mcp', id: 'mcp-cg', cwd: indexedDir, indexed: true })
    const text = outcome.lines.join('\n')
    expect(text).not.toContain('dsh-codegraph mcp managed')
    expect(text).toContain(`        cwd: ${indexedDir}`)
    expect(text).not.toContain('/old/path')
  })

  it('复用 MCP 区块但联动关闭 / 未索引：保持用户配置不动', () => {
    const off = syncManagedMcpRow(mcpBlock('/old/path'), decision(indexedDir, false))
    expect(off.changed).toBe(false)
    expect(off.status.mode).toBe('dsh-mcp')
    expect(off.status.note).toBe('MCP 联动已关闭，保持现有配置')

    const notIndexed = syncManagedMcpRow(mcpBlock('/old/path'), decision(plainDir))
    expect(notIndexed.changed).toBe(false)
    expect(notIndexed.status.note).toContain('缺少 .codegraph/')
  })
})
