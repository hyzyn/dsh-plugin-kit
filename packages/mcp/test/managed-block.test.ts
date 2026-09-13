/**
 * @hyzyn/dsh-mcp — 托管区块拼接（~/.dsh/cordis.patch.yml）的回归测试。
 *
 * spliceManagedBlock 是纯函数：只动标记之间的区块，区块外内容必须逐字节保留。
 * 断言固定当前行为，包括两个容易误踩的边界：
 *   - 空文本首次写入会带一个前导空行（实际写入路径传的是 '# dsh home patch
 *     layer\n'，不会命中；这里如实钉住）；
 *   - 起始标记在、结束标记丢（悬空）时只重写起始标记行，旧区块体保留——
 *     旧行为会连带吞掉其后的全部内容。
 */
import { describe, expect, it } from 'vitest'
import { spliceManagedBlock } from '../src/index.js'

const MARK_START = '# --- dsh-mcp-config managed (auto-generated; do not edit) ---'
const MARK_END = '# --- end dsh-mcp-config managed ---'

const row = { id: 'mcp-a', config: { serverName: 'a', transport: 'stdio', command: 'npx' } }

/** 单行区块的期望文本（yaml.dump 的缩进与引号形态）。 */
const EXPECTED_BLOCK = [
  MARK_START,
  '- insert:',
  '    - id: mcp-a',
  "      name: '@deepseek-ai/dsh-mcp-client'",
  '      config:',
  '        serverName: a',
  '        transport: stdio',
  '        command: npx',
  MARK_END,
  '',
].join('\n')

describe('spliceManagedBlock', () => {
  it('无区块：追加到文件末尾，非空内容前留一个空行', () => {
    expect(spliceManagedBlock('foo\n', [row])).toBe('foo\n\n' + EXPECTED_BLOCK)
    expect(spliceManagedBlock('# dsh home patch layer\n', [row])).toBe('# dsh home patch layer\n\n' + EXPECTED_BLOCK)
  })

  it('空文本：首个字符是换行（钉住现状；实际写路径从不传空文本）', () => {
    const result = spliceManagedBlock('', [row])
    expect(result.startsWith('\n' + MARK_START)).toBe(true)
    expect(result).toBe('\n' + EXPECTED_BLOCK)
  })

  it('rows 为空时写合法的空 insert patch（不是裸 []）', () => {
    expect(spliceManagedBlock('foo\n', [])).toBe('foo\n\n' + MARK_START + '\n- insert: []\n' + MARK_END + '\n')
  })

  it('已有区块整体替换：新区块生效、旧内容消失、区块外内容保留', () => {
    const text = ['before: 1', MARK_START, '- insert: []', MARK_END, 'after: 2', ''].join('\n')
    const next = spliceManagedBlock(text, [row])
    expect(next.startsWith('before: 1\n' + MARK_START)).toBe(true)
    expect(next).toContain("      name: '@deepseek-ai/dsh-mcp-client'")
    expect(next).not.toContain('- insert: []')
    expect(next.endsWith(MARK_END + '\n\nafter: 2\n')).toBe(true)
  })

  it('重写已有区块：只在文件尾部多留一个空行（mcp 拼接式的既有行为，如实钉住）', () => {
    // 实现把整块渲染成字符串再 split('\n')，块尾自带的换行会在替换已有区块时
    // 落到原文件末尾换行之后——每次重写多一个空行。调用方只在保存时重写，
    // 不影响解析；这里固定现状，改动需显式。
    const once = spliceManagedBlock('foo\n', [row])
    const twice = spliceManagedBlock(once, [row])
    expect(twice).toBe(once + '\n')
    expect(twice.startsWith('foo\n\n' + MARK_START)).toBe(true)
  })

  it('disabled 行省略 config 字段并写 disabled: true', () => {
    const disabled = spliceManagedBlock('foo\n', [{ id: 'mcp-d', config: {}, disabled: true }])
    expect(disabled).toContain('    - id: mcp-d')
    expect(disabled).toContain('      disabled: true')
    expect(disabled).not.toContain('config:')
  })

  it('悬空起始标记（缺结束标记）：只重写标记行，其后的旧内容保留', () => {
    const text = ['head: 1', MARK_START, '- insert: []', ''].join('\n')
    const next = spliceManagedBlock(text, [row])
    expect(next.startsWith('head: 1\n' + MARK_START)).toBe(true)
    expect(next).toContain('        command: npx')
    expect(next).toContain('- insert: []') // 旧区块体未被吞掉
  })

  it('多行 rows 逐条渲染', () => {
    const next = spliceManagedBlock('', [
      { id: 'mcp-a', config: { serverName: 'a' } },
      { id: 'mcp-b', config: { serverName: 'b' }, disabled: true },
    ])
    expect(next).toContain('    - id: mcp-a')
    expect(next).toContain('    - id: mcp-b')
    expect(next.indexOf('mcp-a')).toBeLessThan(next.indexOf('mcp-b'))
  })
})
