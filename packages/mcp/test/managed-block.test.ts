/**
 * @hyzyn/dsh-mcp — 托管区块拼接（~/.dsh/cordis.patch.yml）的回归测试。
 *
 * spliceManagedBlock 是纯函数：只动标记之间的区块，区块外内容必须逐字节保留。
 *
 * **2026-10-19 起实现换成了 kit 的 `spliceManagedBlock`**（外部测评 issue #13 第 3 条：
 * 原先用 `line.includes('… managed')` 找标记，值里的多行文本含标记名就会被静默截断）。
 * 随之固定下来的两条**有意改变**，都是 kit 版更稳的地方：
 *   - 空文本首次写入**不再带前导空行**（旧行为是 `'\n' + 块`）；
 *   - 重复写入**不再每次多一个尾部空行**（旧行为是整块当字符串拼接的副产物，逐字节不稳定）。
 * 标记的边界判定改为**整行相等**，所以「值里含标记文本」的往返必须完整——
 * 那是这条缺陷的直接反例，见本文件最后一组用例。
 */
import { describe, expect, it } from 'vitest'
import { spliceManagedBlock } from '../src/index.js'
import yaml from 'js-yaml'

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

  it('空文本：首个字符就是标记行（不再有前导空行——kit 版的显式差异）', () => {
    const result = spliceManagedBlock('', [row])
    expect(result.startsWith(MARK_START)).toBe(true)
    expect(result).toBe(EXPECTED_BLOCK)
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
    /*
     * 区块后紧跟 `after: 2`、**没有**多出来的空行。
     *
     * 旧实现把整块渲染成字符串再拼接，块尾自带的换行会在替换已有区块时多留一个空行；
     * kit 版按行替换，原文件区块后是什么就还是什么（这里是紧邻）。这条是**有意的行为
     * 改变**：逐字节稳定比「保留一个多出来的空行」重要——重复写入会累积空行，而那个
     * 空行既不影响解析也没人需要。
     */
    expect(next.endsWith(MARK_END + '\nafter: 2\n')).toBe(true)
  })

  it('重复写入逐字节稳定（旧实现每次多一个尾部空行，kit 版不再有）', () => {
    const once = spliceManagedBlock('foo\n', [row])
    const twice = spliceManagedBlock(once, [row])
    expect(twice).toBe(once)
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

  // CG67 同源（codegraph）：`[]` 是**完整**的 YAML 文档（flow 序列根），往它后面追加
  // 块序列会让整份 cordis.patch.yml 非法——宿主 `parsePatchList` 直接抛，插件整层起不来。
  describe('空 flow 序列根（`[]`）不得被当成可追加的前缀', () => {
    const parseHost = (text: string): unknown => yaml.load(text)

    it('只有 `[]`：结果是合法的单一列表，不是 `[]` + 块', () => {
      const next = spliceManagedBlock('[]', [row])
      expect(parseHost(next)).toHaveLength(1)
      expect(next).not.toMatch(/^\[\]/m)
    })

    it('宿主模板（注释 + `[]`）：注释保留、根被替换', () => {
      const next = spliceManagedBlock('# Your patch layer\n# an array\n[]\n', [row])
      expect(next.startsWith('# Your patch layer\n# an array\n')).toBe(true)
      expect(parseHost(next)).toHaveLength(1)
    })

    it('已经写出坏文件的旧版本现场（`[]` + 区块）：下一次写入自愈', () => {
      const broken = '[]\n\n' + MARK_START + '\n- insert: []\n' + MARK_END + '\n'
      const next = spliceManagedBlock(broken, [row])
      expect(parseHost(next)).toHaveLength(1)
    })

    it('正常 patch 列表不受影响（不误摘用户行）', () => {
      expect(spliceManagedBlock('- id: keep\n', [row])).toBe('- id: keep\n\n' + EXPECTED_BLOCK)
    })
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

  /*
   * 2026-10-19 外部测评 issue #13 第 3 条的直接反例。
   *
   * 旧实现用 `line.includes('end dsh-mcp-config managed')` 找结束标记。只要某个
   * **值**里有一行含那段文字（多行 args / env / headers 都会经 yaml 渲染成缩进块），
   * 它就被当成区块边界：区块被截断，再保存一次文件里会出现**两个** end 标记，
   * 逐步走形成非法 YAML。kit 版按整行相等匹配，这些值必须能**完整往返**。
   */
  describe('值里含标记文本（子串匹配会截断）', () => {
    it('args 里有一行含结束标记文本：往返后内容完整、只有一个结束标记', () => {
      const tricky = {
        id: 'mcp-tricky',
        config: {
          serverName: 'tricky',
          transport: 'stdio',
          command: 'sh',
          // 这一行**恰好**含结束标记的文本（不是整行等于标记）
          args: ['-c', 'echo hi # --- end dsh-mcp-config managed ---'],
        },
      }
      const once = spliceManagedBlock('', [tricky])
      // 内容完整保留
      expect(once).toContain('echo hi # --- end dsh-mcp-config managed ---')
      // 且文件里只有一个真正的结束标记行（整行相等的那一个）
      const endLines = once.split('\n').filter((line) => line.trimEnd() === MARK_END)
      expect(endLines).toHaveLength(1)

      // 再写一次必须逐字节稳定（旧实现每次都会多出一个 end 标记）
      const twice = spliceManagedBlock(once, [tricky])
      expect(twice).toBe(once)
      expect(twice.split('\n').filter((line) => line.trimEnd() === MARK_END)).toHaveLength(1)

      // 且整份文件仍是合法 YAML（旧实现走到第二次就解析不了）
      expect(() => yaml.load(twice)).not.toThrow()
    })

    it('区块外注释含标记名：不会被当成区块边界（用户内容不被吞）', () => {
      // 注释里提到标记名是常见的手写习惯（「下面这段由 dsh-mcp-config managed 维护」）
      const text = '# 说明：下面由 dsh-mcp-config managed 自动生成\n' + MARK_START + '\n- insert: []\n' + MARK_END + '\n'
      const next = spliceManagedBlock(text, [row])
      // 用户那行注释原样保留
      expect(next).toContain('# 说明：下面由 dsh-mcp-config managed 自动生成')
      expect(next).toContain('    - id: mcp-a')
    })
  })
})
