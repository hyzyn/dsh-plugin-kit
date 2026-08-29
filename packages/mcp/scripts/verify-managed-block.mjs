/**
 * spliceManagedBlock 行为验证（托管区块拼装的快照用例）。
 * 运行：node packages/mcp/scripts/verify-managed-block.mjs（构建后）
 */
import { spliceManagedBlock } from '../lib/index.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmp = mkdtempSync(join(tmpdir(), 'mcp-splice-'))
let failed = 0
function check(name, cond, detail) {
  if (cond) console.log('PASS', name)
  else { failed++; console.log('FAIL', name, detail ?? '') }
}

const ROWS = [
  {
    id: 'mcp-201e5cee86',
    config: { serverName: 'codegraph', transport: 'stdio', command: 'codegraph', args: ['serve', '--mcp'], cwd: '/tmp/proj' },
  },
]

// ---- 用例 1：无区块 → 追加到末尾，原内容保留 ----
const file1 = `# dsh home patch layer
- insert:
    - id: some-plugin
      name: '@hyzyn/dsh-env'
`
const out1 = spliceManagedBlock(file1, ROWS)
check('1a appends block', out1.includes('# --- dsh-mcp-config managed (auto-generated; do not edit) ---'))
check('1b keeps existing rows', out1.includes("id: some-plugin") && out1.includes("@hyzyn/dsh-env"))
check('1c empty rows body is no-op insert', spliceManagedBlock(file1, []).includes('- insert: []'))

// ---- 用例 2：已有区块 → 原位替换，区块前后内容保留 ----
const file2 = `# head
# --- dsh-mcp-config managed (auto-generated; do not edit) ---
- insert: []
# --- end dsh-mcp-config managed ---
# tail
`
const out2 = spliceManagedBlock(file2, ROWS)
check('2a replaces in place', out2.includes('cwd: /tmp/proj'))
check('2b keeps head/tail', out2.startsWith('# head\n') && out2.trimEnd().endsWith('# tail'))
check('2c markers exactly once', (out2.match(/dsh-mcp-config managed/g) || []).length === 2)

// ---- 用例 3：悬空起始标记（收尾标记丢失）→ 保留区块后的内容 ----
const file3 = `# head
# --- dsh-mcp-config managed (auto-generated; do not edit) ---
- insert:
    - id: orphan-row
      name: '@hyzyn/dsh-env'
- insert:
    - id: tail-row
      name: '@hyzyn/dsh-tty'
`
const out3 = spliceManagedBlock(file3, ROWS)
check('3a keeps rows after the broken block', out3.includes('id: tail-row'), out3)
check('3b restores end marker', out3.includes('# --- end dsh-mcp-config managed ---'))
check('3c fresh block written', out3.includes('cwd: /tmp/proj'))

// ---- 用例 4：js 表达式行往返无损 ----
const file4 = `# dsh home patch layer
# --- dsh-mcp-config managed (auto-generated; do not edit) ---
- insert: []
# --- end dsh-mcp-config managed ---
`
const out4 = spliceManagedBlock(file4, [
  {
    id: 'mcp-with-js',
    config: { serverName: 'gh', transport: 'stdio', command: 'npx', env: { TOKEN: { __jsExpr: 'process.env.GITHUB_TOKEN' } } },
  },
])
check('4 js-expr preserved', out4.includes('!!js process.env.GITHUB_TOKEN'), out4)

// ---- 用例 5：空文件 ----
const out5 = spliceManagedBlock('', ROWS)
check('5 bootstraps from empty text', out5.includes('serverName: codegraph') && out5.includes('cwd: /tmp/proj'))

rmSync(tmp, { recursive: true, force: true })
process.exit(failed === 0 ? 0 : 1)
