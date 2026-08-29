/**
 * syncManagedMcpRow 行为验证（针对真实文件形状的快照用例）。
 * 运行：node packages/codegraph/scripts/verify-sync.mjs（构建后）
 */
import { syncManagedMcpRow } from '../lib/index.js'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 用临时目录模拟「已索引 / 未索引」目标路径
const tmp = mkdtempSync(join(tmpdir(), 'cg-sync-'))
const indexedTarget = join(tmp, 'proj')
mkdirSync(join(indexedTarget, '.codegraph'), { recursive: true })
const plainTarget = join(tmp, 'plain')
mkdirSync(plainTarget, { recursive: true })

let failed = 0
function check(name, cond, detail) {
  if (cond) console.log('PASS', name)
  else { failed++; console.log('FAIL', name, detail ?? '') }
}

const DECISION = { serverName: 'codegraph', command: 'codegraph', targetCwd: indexedTarget, manageEnabled: true }

// ---- 用例 1：dsh-mcp 区块里的 codegraph 行没有 cwd → 补上 ----
const file1 = `# dsh home patch layer
# --- dsh-mcp-config managed (auto-generated; do not edit) ---
- insert:
    - id: mcp-201e5cee86
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: codegraph
        transport: stdio
        command: codegraph
        args:
          - serve
          - '--mcp'
        env: {}
        toolCallTimeoutMs: 60000
        reconnect:
          enabled: true
          initialDelayMs: 500
          maxDelayMs: 30000
          maxAttempts: 10
# --- end dsh-mcp-config managed ---
`
const out1 = syncManagedMcpRow(file1.split('\n'), DECISION)
check('1a stamps cwd in dsh-mcp block', out1.changed && out1.status.mode === 'dsh-mcp' && out1.status.cwd === indexedTarget, JSON.stringify(out1.status))
const text1 = out1.lines.join('\n')
check('1b keeps dsh-mcp markers', text1.includes('# --- dsh-mcp-config managed (auto-generated; do not edit) ---') && text1.includes('# --- end dsh-mcp-config managed ---'))
check('1c keeps other config fields', text1.includes('toolCallTimeoutMs: 60000') && text1.includes("serverName: codegraph"))

// 用例 1 复跑：幂等
const out1b = syncManagedMcpRow(out1.lines, DECISION)
check('1d idempotent', !out1b.changed, JSON.stringify(out1b.status))

// ---- 用例 2：dsh-mcp 行 cwd 已对齐 + 无变化 ----
// （1d 已覆盖）

// ---- 用例 3：无任何区块 + 目标已索引 → 自动建 own 区块 ----
const file3 = `# dsh home patch layer
- insert:
    - id: some-other-plugin
      name: '@hyzyn/dsh-env'
`
const out3 = syncManagedMcpRow(file3.split('\n'), DECISION)
check('3a creates own block', out3.changed && out3.status.mode === 'own' && out3.status.cwd === indexedTarget, JSON.stringify(out3.status))
const text3 = out3.lines.join('\n')
check('3b own block markers present', text3.includes('# --- dsh-codegraph mcp managed (auto-generated; do not edit) ---') && text3.includes('# --- end dsh-codegraph mcp managed ---'))
check('3c row shape', text3.includes('id: mcp-codegraph-managed') && text3.includes("name: '@deepseek-ai/dsh-mcp-client'") && text3.includes('cwd: ' + indexedTarget))
// 幂等
check('3d idempotent', !syncManagedMcpRow(out3.lines, DECISION).changed)

// ---- 用例 4：目标未索引 → 不动现有行 ----
const out4 = syncManagedMcpRow(out1.lines, { ...DECISION, targetCwd: plainTarget })
check('4 no rewrite when target unindexed', !out4.changed && out4.status.mode === 'dsh-mcp' && out4.status.cwd === indexedTarget && out4.status.indexed === false, JSON.stringify(out4.status))

// ---- 用例 5：区块外手工行 → 跳过 ----
const file5 = `# dsh home patch layer
- insert:
    - id: mcp-handmade
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: codegraph
        transport: stdio
        command: codegraph
`
const out5 = syncManagedMcpRow(file5.split('\n'), DECISION)
check('5 external hand-written row skips', !out5.changed && out5.status.mode === 'external', JSON.stringify(out5.status))

// ---- 用例 6：own 区块 + mcp 区块同时有 codegraph 行 → 让位去重 ----
const file6 = text3
const file6WithMcp = file6.replace('# --- dsh-mcp-config managed (auto-generated; do not edit) ---\n', '') // noop guard
const combined = `# dsh home patch layer
# --- dsh-mcp-config managed (auto-generated; do not edit) ---
- insert:
    - id: mcp-card-row
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: codegraph
        transport: stdio
        command: codegraph
        args:
          - serve
          - '--mcp'
# --- end dsh-mcp-config managed ---
` + text3.split('\n').slice(1).join('\n')
const out6 = syncManagedMcpRow(combined.split('\n'), DECISION)
check('6a dedupes own row', out6.changed && out6.status.mode === 'dsh-mcp', JSON.stringify(out6.status))
const text6 = out6.lines.join('\n')
check('6b own block emptied', text6.includes('- insert: []'))
check('6c mcp row stamped', /id: mcp-card-row/.test(text6) && text6.includes('cwd: ' + indexedTarget))
check('6d idempotent', !syncManagedMcpRow(out6.lines, DECISION).changed)

// ---- 用例 7：manageEnabled=false → 撤销 own 行；不碰 dsh-mcp 区块 ----
const out7 = syncManagedMcpRow(out3.lines, { ...DECISION, manageEnabled: false })
check('7a removes own row', out7.changed && out7.status.mode === 'none' && out7.lines.join('\n').includes('- insert: []'), JSON.stringify(out7.status))
const out7b = syncManagedMcpRow(out1.lines, { ...DECISION, manageEnabled: false })
check('7b leaves dsh-mcp row untouched', !out7b.changed && out7b.status.mode === 'dsh-mcp', JSON.stringify(out7b.status))

// ---- 用例 8：js 表达式行无损往返 ----
const file8 = `# dsh home patch layer
# --- dsh-mcp-config managed (auto-generated; do not edit) ---
- insert:
    - id: mcp-with-js
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: other
        transport: stdio
        command: foo
        env:
          TOKEN: !!js process.env.GITHUB_TOKEN
- insert:
    - id: mcp-codegraph-row
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: codegraph
        transport: stdio
        command: codegraph
# --- end dsh-mcp-config managed ---
`
const out8 = syncManagedMcpRow(file8.split('\n'), DECISION)
const text8 = out8.lines.join('\n')
check('8a js-expr preserved', text8.includes('!!js process.env.GITHUB_TOKEN'), text8)
check('8b codegraph row stamped', out8.changed && text8.includes('cwd: ' + indexedTarget))
check('8c other row intact', text8.includes('serverName: other') && text8.includes('command: foo'))

// ---- 用例 9：空文件 → 建块 ----
const out9 = syncManagedMcpRow([''], DECISION)
check('9 bootstraps from empty file', out9.changed && out9.status.mode === 'own', JSON.stringify(out9.status))

// ---- 用例 10：损坏区块（缺结束标记）→ 自愈重写 ----
const file10 = `# dsh home patch layer
# --- dsh-codegraph mcp managed (auto-generated; do not edit) ---
- insert: []
`
const out10 = syncManagedMcpRow(file10.split('\n'), DECISION)
check('10 heals broken block', out10.changed && out10.status.mode === 'own' && out10.lines.join('\n').includes('# --- end dsh-codegraph mcp managed ---'), JSON.stringify(out10.status))

// 真实文件形状（当前机器的 ~/.dsh/cordis.patch.yml 内容形状已在用例 1 覆盖）
rmSync(tmp, { recursive: true, force: true })
process.exit(failed === 0 ? 0 : 1)
