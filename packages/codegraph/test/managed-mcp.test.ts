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
import yaml from 'js-yaml'
import { indexState, locateIndex, syncManagedMcpRow } from '../src/index.js'
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
const OWN_MARK_START = '# --- dsh-codegraph mcp managed (auto-generated; do not edit) ---'
const OWN_MARK_END = '# --- end dsh-codegraph mcp managed ---'

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

describe('dryRun（只读快照，不推测下次写入）', () => {
  it('没有托管行 + 目标已索引：dryRun 报 none，而不是「已自动托管」', () => {
    const input = ['# dsh home patch layer', '']
    const outcome = syncManagedMcpRow(input, { ...decision(indexedDir), dryRun: true })
    expect(outcome.changed).toBe(false)
    expect(outcome.lines).toBe(input)
    expect(outcome.status.mode).toBe('none')
    expect(outcome.status.indexed).toBe(true)
    expect(outcome.status.note).toContain('还没有托管行')
  })

  it('已有托管行时 dryRun 与真实状态一致（该对齐 cwd 时不改盘）', () => {
    const first = syncManagedMcpRow([''], decision(indexedDir))
    const other = mkdtempSync(join(tmpdir(), 'dsh-cg-dry-'))
    mkdirSync(join(other, '.codegraph'))
    writeFileSync(join(other, '.codegraph', 'codegraph.db'), '')
    try {
      const snapshot = syncManagedMcpRow(first.lines, { ...decision(other), dryRun: true })
      expect(snapshot.changed).toBe(false)
      expect(snapshot.status).toMatchObject({ mode: 'own', cwd: indexedDir, indexed: true })
    } finally {
      rmSync(other, { recursive: true, force: true })
    }
  })
})

/** 造一个「本目录或祖先带 .codegraph 索引 + .git 根」的仓库形状。 */
function makeRepo(name: string, options: { git?: boolean; indexAtRoot?: boolean } = {}): { root: string; sub: string } {
  const root = mkdtempSync(join(tmpdir(), name))
  const sub = join(root, 'packages', 'app')
  mkdirSync(sub, { recursive: true })
  if (options.indexAtRoot !== false) {
    mkdirSync(join(root, '.codegraph'), { recursive: true })
    writeFileSync(join(root, '.codegraph', 'codegraph.db'), '')
  }
  if (options.git !== false) mkdirSync(join(root, '.git'), { recursive: true })
  return { root, sub }
}

describe('CG02：索引判定与 CLI 同口径（向上找，到 git 根为止）', () => {
  it('子目录命中祖先的索引，projectPath 是仓库根', () => {
    const repo = makeRepo('dsh-cg-repo-')
    try {
      expect(locateIndex(repo.sub)).toEqual({ state: 'indexed', projectPath: repo.root })
      // 旧导出保持同结论
      expect(indexState(repo.sub)).toBe('indexed')
    } finally {
      rmSync(repo.root, { recursive: true, force: true })
    }
  })

  it('git 根是边界：根之上的索引不被本目录认领', () => {
    const outer = mkdtempSync(join(tmpdir(), 'dsh-cg-boundary-'))
    // 索引在 outer（git 根**之上**）；repo 是 git 根、自身没有索引；sub 在 repo 里
    mkdirSync(join(outer, '.codegraph'), { recursive: true })
    writeFileSync(join(outer, '.codegraph', 'codegraph.db'), '')
    const repo = join(outer, 'repo')
    const sub = join(repo, 'packages', 'app')
    mkdirSync(sub, { recursive: true })
    mkdirSync(join(repo, '.git'), { recursive: true })
    try {
      expect(locateIndex(sub)).toEqual({ state: 'missing' })
    } finally {
      rmSync(outer, { recursive: true, force: true })
    }
  })

  it('路上的第一个 .codegraph/ 是 CLI 的停止点：没索引库就是 not-a-project', () => {
    const repo = makeRepo('dsh-cg-broken-', { indexAtRoot: false, git: false })
    // 子目录里放一个「家目录形状」的 .codegraph（只有安装目录、没有库）
    mkdirSync(join(repo.sub, '.codegraph', 'versions', 'v1.6.0'), { recursive: true })
    writeFileSync(join(repo.sub, '.codegraph', 'codegraph.lock'), '')
    try {
      // 即使祖先有真索引，CLI 也会停在这个坏目录上——保持同口径
      expect(locateIndex(repo.sub)).toEqual({ state: 'not-a-project' })
    } finally {
      rmSync(repo.root, { recursive: true, force: true })
    }
  })
})

describe('CG03：复用 dsh-mcp 区块只动 codegraph 行的 cwd（不再有损往返）', () => {
  /** 一份「别的插件 + 别的服务器行 + override 条目 + 注释」俱全的 dsh-mcp 区块。 */
  const richBlock = (cwd: string) => [
    '# dsh home patch layer',
    '# 区块外的手写注释',
    MCP_MARK_START,
    '- insert:',
    '    - id: mcp-other',
    "      name: '@deepseek-ai/dsh-mcp-client'",
    '      config:',
    '        serverName: other-server',
    '        cwd: /other/path',
    '# 区块内的手写注释',
    '- insert:',
    '    - id: mcp-cg',
    "      name: '@deepseek-ai/dsh-mcp-client'",
    '      config:',
    '        serverName: codegraph',
    '        command: codegraph',
    `        cwd: ${cwd}`,
    '        toolCallTimeoutMs: 60000',
    '- id: override-entry',
    '  config:',
    '    nested: true',
    MCP_MARK_END,
    '',
  ]

  it('只替换 cwd 一行：注释 / 别的服务器行 / override 条目逐字节保留', () => {
    const outcome = syncManagedMcpRow(richBlock('/old/path'), decision(indexedDir))
    expect(outcome.changed).toBe(true)
    expect(outcome.status).toMatchObject({ mode: 'dsh-mcp', cwd: indexedDir })
    const text = outcome.lines.join('\n')
    expect(text).toContain('# 区块内的手写注释')
    expect(text).toContain('serverName: other-server')
    expect(text).toContain('cwd: /other/path')
    expect(text).toContain('- id: override-entry')
    expect(text).toContain('toolCallTimeoutMs: 60000')
    expect(text).toContain(`cwd: ${indexedDir}`)
    expect(text).not.toContain('/old/path')
  })

  it('定点编辑幂等：第二次同步零改动', () => {
    const first = syncManagedMcpRow(richBlock('/old/path'), decision(indexedDir))
    const second = syncManagedMcpRow(first.lines, decision(indexedDir))
    expect(second.changed).toBe(false)
    expect(second.lines).toBe(first.lines)
  })

  it('区块里没有 cwd 键时补一行（同层级），其余内容不动', () => {
    const noCwd = [
      MCP_MARK_START,
      '- insert:',
      '    - id: mcp-cg',
      "      name: '@deepseek-ai/dsh-mcp-client'",
      '      config:',
      '        serverName: codegraph',
      '        command: codegraph',
      MCP_MARK_END,
      '',
    ]
    const outcome = syncManagedMcpRow(noCwd, decision(indexedDir))
    expect(outcome.changed).toBe(true)
    const text = outcome.lines.join('\n')
    expect(text).toContain(`cwd: ${indexedDir}`)
    // 补的行必须还在 config 映射里（缩进与 serverName 同级）
    expect(text).toMatch(/        cwd:/)
  })
})

describe('CG06：区块损坏 / 空块不再被当成「没有区块」', () => {
  it('本插件区块 YAML 损坏：拒绝追加第二个区块，报解析失败', () => {
    const broken = [
      '# layer',
      OWN_MARK_START,
      '- insert: [broken',
      OWN_MARK_END,
      '',
    ]
    const outcome = syncManagedMcpRow(broken, decision(indexedDir))
    expect(outcome.changed).toBe(false)
    expect(outcome.lines).toBe(broken)
    expect(outcome.status.note).toContain('解析失败')
  })

  it('dsh-mcp 区块损坏时同样拒绝（可能藏着看不见的 codegraph 行）', () => {
    const broken = [
      MCP_MARK_START,
      '- insert: [broken',
      MCP_MARK_END,
      '',
    ]
    const outcome = syncManagedMcpRow(broken, decision(indexedDir))
    expect(outcome.changed).toBe(false)
    expect(outcome.status.note).toContain('解析失败')
  })

  it('本插件区块在但行被清空：写回**同一个**区块，绝不追加第二个', () => {
    const emptied = [OWN_MARK_START, '# 被清空过', OWN_MARK_END, '']
    const outcome = syncManagedMcpRow(emptied, decision(indexedDir))
    expect(outcome.changed).toBe(true)
    const text = outcome.lines.join('\n')
    expect((text.match(/# --- dsh-codegraph mcp managed \(auto-generated/g) ?? []).length).toBe(1)
    expect(text).toContain('serverName: codegraph')
    expect(text).toContain('# 被清空过')
  })
})

describe('CG31：cwd 写在 serverName 之前不再产生重复键', () => {
  const cwdFirst = (cwd: string) => [
    MCP_MARK_START,
    '- insert:',
    '    - id: mcp-cg',
    "      name: '@deepseek-ai/dsh-mcp-client'",
    '      config:',
    `        cwd: ${cwd}`,
    '        serverName: codegraph',
    '        command: codegraph',
    MCP_MARK_END,
    '',
  ]

  it('编辑的是上面那行 cwd，而不是在 serverName 后补第二行', () => {
    const outcome = syncManagedMcpRow(cwdFirst('/old/path'), decision(indexedDir))
    expect(outcome.status.mode).toBe('dsh-mcp')
    expect(outcome.status.cwd).toBe(indexedDir)
    const text = outcome.lines.join('\n')
    // 旧实现在 serverName 后面补第二行 cwd → js-yaml 抛 duplicated mapping key，整份文件拒载
    expect((text.match(/^\s*cwd:/gm) ?? []).length).toBe(1)
    expect(text).toContain(`cwd: ${indexedDir}`)
    expect(text).not.toContain('/old/path')
    expect(() => yaml.load(text)).not.toThrow()
  })

  it('重复同步幂等（向上扫描命中的就是同一行）', () => {
    const first = syncManagedMcpRow(cwdFirst('/old/path'), decision(indexedDir))
    const second = syncManagedMcpRow(first.lines, decision(indexedDir))
    expect(second.changed).toBe(false)
    expect(second.lines).toBe(first.lines)
  })
})

describe('CG18：冲突判定只按 serverName（不再要求 name 精确匹配）', () => {
  const forkRow = (cwd: string) => [
    MCP_MARK_START,
    '- insert:',
    '    - id: fork-cg',
    "      name: '@some-fork/dsh-mcp-client'",
    '      config:',
    '        serverName: codegraph',
    `        cwd: ${cwd}`,
    MCP_MARK_END,
    '',
  ]

  it('换了包名的 codegraph 行仍被识别为可复用的托管行', () => {
    const outcome = syncManagedMcpRow(forkRow('/old/path'), decision(indexedDir))
    expect(outcome.status.mode).toBe('dsh-mcp')
    expect(outcome.status.cwd).toBe(indexedDir)
    expect(outcome.changed).toBe(true)
  })

  it('区块外换名手工行仍触发 external 让位', () => {
    const outside = [
      '- insert:',
      '    - id: fork-cg',
      "      name: '@some-fork/dsh-mcp-client'",
      '      config:',
      '        serverName: codegraph',
      '        cwd: /manual/path',
      '',
    ]
    const outcome = syncManagedMcpRow(outside, decision(indexedDir))
    expect(outcome.status.mode).toBe('external')
    expect(outcome.status.note).toContain('serverName 冲突')
  })
})

describe('CG19：findBlock 不再把孤立结束标记当块头', () => {
  it('开始标记被删、只剩结束标记：走新建分支，且新块标记完整', () => {
    const orphan = ['# layer', OWN_MARK_END, '']
    const outcome = syncManagedMcpRow(orphan, decision(indexedDir))
    expect(outcome.changed).toBe(true)
    const text = outcome.lines.join('\n')
    expect((text.match(/# --- dsh-codegraph mcp managed \(auto-generated/g) ?? []).length).toBe(1)
    expect(text).toContain(OWN_MARK_END)
    // 二次同步幂等（孤立的旧结束标记不再干扰定位）
    const second = syncManagedMcpRow(outcome.lines, decision(indexedDir))
    expect(second.changed).toBe(false)
  })
})

describe('CG12：托管行现有 cwd 的健康度', () => {
  it('cwd 目录还在 → cwdExists=true；项目被删 → cwdExists=false', () => {
    const first = syncManagedMcpRow([''], decision(indexedDir))
    // 目标换成未索引目录：保留现有行（cwd = indexedDir，仍然存在）
    const kept = syncManagedMcpRow(first.lines, decision(plainDir))
    expect(kept.status.cwd).toBe(indexedDir)
    expect(kept.status.cwdExists).toBe(true)

    const stale = [
      MCP_MARK_START,
      '- insert:',
      '    - id: mcp-cg',
      "      name: '@deepseek-ai/dsh-mcp-client'",
      '      config:',
      '        serverName: codegraph',
      '        cwd: /no/such/dir-dsh-cg',
      MCP_MARK_END,
      '',
    ]
    const gone = syncManagedMcpRow(stale, decision(plainDir))
    expect(gone.status.cwd).toBe('/no/such/dir-dsh-cg')
    expect(gone.status.cwdExists).toBe(false)
  })
})
