/**
 * @hyzyn/dsh-prompt — prompts.yml 托管区块读写的回归测试。
 *
 * 用 DSH_PROMPT_FILE 指到临时目录做真实读写：store 往返、新文件 0600 与原子写、
 * 区块外内容保留、缺结束标记 / 损坏 YAML 的容错，以及 readManagedStore 对不完整
 * prompt（缺 ab / versions）的默认化。这些函数此前是模块私有，本次仅加 export。
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readManagedStore, renderManagedBlock, writeManagedStore } from '../src/index.js'

const MARK_START = '# --- dsh-prompt-manager managed (auto-generated; do not edit) ---'
const MARK_END = '# --- end dsh-prompt-manager managed ---'

const STORE = {
  activePromptId: 'p-1',
  prompts: [
    {
      id: 'p-1',
      name: '示例',
      description: '演示',
      versions: [{ id: 'v-1', label: 'v1', content: '正文', createdAt: '2024-01-01T00:00:00.000Z' }],
      activeVersionId: 'v-1',
      ab: { enabled: true, aVersionId: 'v-1', bVersionId: 'v-1', aWeight: 70 },
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
  ],
}

let dir: string
let file: string
const original = process.env.DSH_PROMPT_FILE

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dsh-prompt-test-'))
  file = join(dir, 'prompts.yml')
  process.env.DSH_PROMPT_FILE = file
})

afterEach(() => {
  if (original === undefined) delete process.env.DSH_PROMPT_FILE
  else process.env.DSH_PROMPT_FILE = original
  rmSync(dir, { recursive: true, force: true })
})

describe('renderManagedBlock', () => {
  it('渲染 store 的 YAML 文本（不含标记行）', () => {
    const text = renderManagedBlock(STORE)
    expect(text).toContain('activePromptId: p-1')
    expect(text).toContain('prompts:')
    expect(text).toContain('  - id: p-1')
    expect(text).toContain('    content: 正文')
    expect(text).not.toContain(MARK_START)
  })

  it('空 store 渲染为合法 YAML', () => {
    const text = renderManagedBlock({ activePromptId: null, prompts: [] })
    expect(text).toContain('activePromptId: null')
    expect(text).toContain('prompts: []')
  })
})

describe('writeManagedStore + readManagedStore 往返', () => {
  it('新建文件：托管区块 + 0600 权限 + 无临时文件残留', () => {
    writeManagedStore(STORE)
    const text = readFileSync(file, 'utf8')
    expect(text.startsWith('# dsh prompt manager file\n\n' + MARK_START)).toBe(true)
    expect(text.endsWith(MARK_END + '\n')).toBe(true)
    // POSIX 权限位只在 POSIX 上存在：Windows 的 writeFileSync mode 是 no-op，
    // statSync().mode 恒为 0o666。断言放进平台分支，其余检查照常跑。
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(readdirSync(dir)).toEqual(['prompts.yml'])

    const read = readManagedStore()
    expect(read.fileError).toBeUndefined()
    expect(read.file).toBe(file)
    expect(read.store).toStrictEqual(STORE)
  })

  it('保留区块外用户内容；重复写入幂等且不重复区块', () => {
    writeManagedStore(STORE)
    const withNote = readFileSync(file, 'utf8').replace(/^# dsh prompt manager file/, '# 用户说明')
    writeFileSync(file, withNote)
    writeManagedStore({ activePromptId: null, prompts: [] })
    const text = readFileSync(file, 'utf8')
    expect(text).toContain('# 用户说明')
    expect(text.split(MARK_START)).toHaveLength(2)
    expect(readManagedStore().store).toStrictEqual({ activePromptId: null, prompts: [] })
    // 重写已有区块会在文件尾多留一个空行（块字符串拼接的既有行为），但区块
    // 只有一份、store 语义不变。
    writeManagedStore({ activePromptId: null, prompts: [] })
    expect(readManagedStore().store).toStrictEqual({ activePromptId: null, prompts: [] })
    expect(readFileSync(file, 'utf8').split(MARK_START)).toHaveLength(2)
  })
})

describe('readManagedStore 容错与默认化', () => {
  it('文件不存在：空 store 且无错误', () => {
    const read = readManagedStore()
    expect(read.store).toStrictEqual({ activePromptId: null, prompts: [] })
    expect(read.fileError).toBeUndefined()
  })

  it('缺结束标记：报错并返回空 store', () => {
    writeFileSync(file, `${MARK_START}\nactivePromptId: null\nprompts: []\n`)
    const read = readManagedStore()
    expect(read.store).toStrictEqual({ activePromptId: null, prompts: [] })
    expect(read.fileError).toContain('缺少结束标记')
  })

  it('损坏 YAML：报解析失败', () => {
    writeFileSync(file, `${MARK_START}\nprompts: [unclosed\n${MARK_END}\n`)
    expect(readManagedStore().fileError).toContain('解析失败')
  })

  it('区块是标量：报「不是 YAML 对象」；是数组：按空 store 处理（现状）', () => {
    writeFileSync(file, `${MARK_START}\njust a string\n${MARK_END}\n`)
    expect(readManagedStore().fileError).toBe('托管区块不是 YAML 对象')
    writeFileSync(file, `${MARK_START}\n- just\n- a\n- list\n${MARK_END}\n`)
    const array = readManagedStore()
    expect(array.fileError).toBeUndefined()
    expect(array.store).toStrictEqual({ activePromptId: null, prompts: [] })
  })

  it('不完整 prompt：versions / ab / activeVersionId 按默认值补齐', () => {
    writeFileSync(file, [MARK_START, 'activePromptId: unknown', 'prompts:', '  - id: p-2', '    name: 裸条目', MARK_END, ''].join('\n'))
    const read = readManagedStore()
    expect(read.fileError).toBeUndefined()
    expect(read.store.activePromptId).toBe('unknown')
    expect(read.store.prompts).toHaveLength(1)
    expect(read.store.prompts[0]).toMatchObject({
      id: 'p-2',
      name: '裸条目',
      versions: [],
      activeVersionId: null,
      ab: { enabled: false, aVersionId: '', bVersionId: '', aWeight: 50 },
    })
  })

  it('只有标记的空区块视为空 store（不是损坏）', () => {
    writeFileSync(file, `${MARK_START}\n\n${MARK_END}\n`)
    const read = readManagedStore()
    expect(read.store).toStrictEqual({ activePromptId: null, prompts: [] })
    expect(read.fileError).toBeUndefined()
  })
})
