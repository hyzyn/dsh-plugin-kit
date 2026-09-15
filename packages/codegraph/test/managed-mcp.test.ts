/**
 * @hyzyn/dsh-codegraph — MCP 托管行同步（syncManagedMcpRow）与索引判定的回归测试。
 *
 * 纯函数、不碰磁盘：决策矩阵覆盖「无托管行 / 本插件区块 / 复用 MCP 卡片区块 /
 * 区块外手工行 / 联动关闭」五种走向。indexed 由 targetCwd 下是否有**真索引库**
 * 决定，用临时目录真实构造三种目标路径：
 *   - 已索引（.codegraph/codegraph.db）；
 *   - 完全没有 .codegraph/；
 *   - 有 .codegraph/ 但没有索引库 —— 家目录形状（~/.codegraph 是 codegraph CLI 自己的
 *     安装目录），旧实现只看目录存在，把家目录当成已索引项目（P0 假阳性）。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { indexState, syncManagedMcpRow } from '../src/index.js'
import type { McpSyncDecision } from '../src/index.js'

/** 已索引目录（.codegraph/ 里有索引库）。 */
const indexedDir = mkdtempSync(join(tmpdir(), 'dsh-cg-indexed-'))
mkdirSync(join(indexedDir, '.codegraph'))
writeFileSync(join(indexedDir, '.codegraph', 'codegraph.db'), '')
/** 完全没有索引目录的项目。 */
const plainDir = mkdtempSync(join(tmpdir(), 'dsh-cg-plain-'))
/** 家目录形状：.codegraph/ 是 codegraph CLI 的安装目录，没有索引库。 */
const cliHomeDir = mkdtempSync(join(tmpdir(), 'dsh-cg-home-'))
mkdirSync(join(cliHomeDir, '.codegraph', 'versions', 'v1.5.0'), { recursive: true })
mkdirSync(join(cliHomeDir, '.codegraph', 'bundles'))
writeFileSync(join(cliHomeDir, '.codegraph', 'codegraph.lock'), '')
writeFileSync(join(cliHomeDir, '.codegraph', 'daemon.pid'), '')

afterAll(() => {
  rmSync(indexedDir, { recursive: true, force: true })
  rmSync(plainDir, { recursive: true, force: true })
  rmSync(cliHomeDir, { recursive: true, force: true })
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
    expect(outcome.status.note).toContain('没有 .codegraph/ 索引')
    expect(outcome.status.indexState).toBe('missing')
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
    writeFileSync(join(other, '.codegraph', 'codegraph.db'), '')
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
    expect(outcome.status.indexState).toBe('missing')
    expect(outcome.status.note).toContain('没有 .codegraph/ 索引')
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
    expect(notIndexed.status.indexState).toBe('missing')
    expect(notIndexed.status.note).toContain('没有 .codegraph/ 索引')
  })

  it('索引判定：索引库 / 无目录 / 只有安装目录三种形态', () => {
    expect(indexState(indexedDir)).toBe('indexed')
    expect(indexState(plainDir)).toBe('missing')
    expect(indexState(cliHomeDir)).toBe('not-a-project')
  })

  it('家目录形状 + 无托管行：不建行，且提示点名「不是 codegraph 项目」', () => {
    const input = ['# dsh home patch layer', '']
    const outcome = syncManagedMcpRow(input, decision(cliHomeDir))
    expect(outcome.changed).toBe(false)
    expect(outcome.lines).toBe(input)
    expect(outcome.status.mode).toBe('none')
    expect(outcome.status.indexed).toBe(false)
    expect(outcome.status.indexState).toBe('not-a-project')
    expect(outcome.status.note).toContain('不是 codegraph 项目')
    expect(outcome.status.note).toContain('~/.codegraph')
  })

  it('家目录形状 + 复用 MCP 区块：不把 cwd 改成没有索引库的目录', () => {
    const outcome = syncManagedMcpRow(mcpBlock('/old/path'), decision(cliHomeDir))
    expect(outcome.changed).toBe(false)
    expect(outcome.status).toMatchObject({ mode: 'dsh-mcp', cwd: '/old/path', indexed: false, indexState: 'not-a-project' })
    expect(outcome.status.note).toContain('不是 codegraph 项目')
    expect(outcome.lines.join('\n')).toContain('cwd: /old/path')
  })

  it('家目录形状 + 已有本插件托管行：保持原 cwd 不发新行', () => {
    const first = syncManagedMcpRow([''], decision(indexedDir))
    const outcome = syncManagedMcpRow(first.lines, decision(cliHomeDir))
    expect(outcome.changed).toBe(false)
    expect(outcome.lines).toBe(first.lines)
    expect(outcome.status).toMatchObject({ mode: 'own', cwd: indexedDir, indexed: false, indexState: 'not-a-project' })
  })
})

describe('行尾（Windows CRLF 补丁文件）', () => {
  /** 一份 CRLF 的补丁文本（Windows 编辑器写过的 cordis.patch.yml）。 */
  const crlfBlock = (cwd: string) => [
    '# dsh home patch layer',
    MCP_MARK_START,
    '- insert:',
    '    - id: mcp-cg',
    "      name: '@deepseek-ai/dsh-mcp-client'",
    '      config:',
    '        serverName: codegraph',
    `        cwd: ${cwd}`,
    MCP_MARK_END,
    '',
  ].join('\r\n')

  it('CRLF 文件重写后不产生混合行尾（标记行 / 块体 / 结束标记一致）', () => {
    const outcome = syncManagedMcpRow(crlfBlock('/old/path').split('\n'), decision(indexedDir))
    expect(outcome.changed).toBe(true)
    // 不出现 LF-only 的内容行：非空行一律带 \r（结尾的空串是文件末尾换行占位）
    for (const line of outcome.lines) {
      if (line !== '') expect(line.endsWith('\r')).toBe(true)
    }
    // 重写已有区块不改变文件行数（旧实现恒定补结尾空行，会多出一行）
    expect(outcome.lines.length).toBe(crlfBlock('/old/path').split('\n').length)
    // 不能写出 \r\r（标记行原样回填 + 补行尾时会双写）
    expect(outcome.lines.some((line) => line.includes('\r\r'))).toBe(false)
    expect(outcome.lines.join('\n')).toContain(`cwd: ${indexedDir}\r`)
  })

  it('CRLF 文件二次同步幂等', () => {
    const first = syncManagedMcpRow(crlfBlock('/old/path').split('\n'), decision(indexedDir))
    const second = syncManagedMcpRow(first.lines, decision(indexedDir))
    expect(second.changed).toBe(false)
    expect(second.lines).toBe(first.lines)
  })

  it('LF 文件不引入 \r（既有行为不变）', () => {
    const lines = ['# dsh home patch layer', MCP_MARK_START, '- insert: []', MCP_MARK_END, '']
    const outcome = syncManagedMcpRow(lines, decision(indexedDir))
    expect(outcome.changed).toBe(true)
    expect(outcome.lines.some((line) => line.includes('\r'))).toBe(false)
  })

  it('CRLF + 缺结束标记的损坏区块：自愈后不出现孤立 \r 行', () => {
    const broken = ['# dsh home patch layer', MCP_MARK_START, '- insert: []', ''].join('\r\n')
    const outcome = syncManagedMcpRow(broken.split('\n'), decision(indexedDir))
    expect(outcome.changed).toBe(true)
    expect(outcome.lines.join('\n')).toContain('# --- end dsh-codegraph mcp managed ---\r')
    // 缺结束标记时 markerEnd 为空串，不能被补成一个只含 \r 的行
    expect(outcome.lines.some((line) => line === '\r')).toBe(false)
  })
})
