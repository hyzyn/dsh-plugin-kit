/**
 * @hyzyn/dsh-env — env.yml 托管区块读写的回归测试。
 *
 * 用 DSH_ENV_FILE 把路径指到临时目录，做真实文件读写：区块格式、密钥值缺失的
 * ref 语义、!!js 往返、0600 权限、原子写无残留、缺结束标记 / 损坏 YAML 的容错。
 * 这些函数此前是模块私有，本次仅加 export 以便测试，逻辑未动。
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readManagedEntries, renderManagedBlock, writeManagedEntries } from '../src/index.js'

const MARK_START = '# --- dsh-env-manager managed (auto-generated; do not edit) ---'
const MARK_END = '# --- end dsh-env-manager managed ---'

let dir: string
let file: string
const original = process.env.DSH_ENV_FILE

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dsh-env-test-'))
  file = join(dir, 'env.yml')
  process.env.DSH_ENV_FILE = file
})

afterEach(() => {
  if (original === undefined) delete process.env.DSH_ENV_FILE
  else process.env.DSH_ENV_FILE = original
  rmSync(dir, { recursive: true, force: true })
})

describe('renderManagedBlock', () => {
  it('普通条目：key / value / secret 三字段 YAML', () => {
    expect(renderManagedBlock([{ key: 'FOO', value: 'bar', secret: false }])).toBe('- key: FOO\n  value: bar\n  secret: false\n')
  })

  it('密钥条目缺 value（值在官方凭据存储）时省略 value 字段', () => {
    expect(renderManagedBlock([{ key: 'TOKEN', value: undefined, secret: true }])).toBe('- key: TOKEN\n  secret: true\n')
  })

  it('!!js 表达式渲染为 !!js 标量，多行值走 literal block', () => {
    const expr = renderManagedBlock([{ key: 'E', value: { __jsExpr: 'process.env.X' }, secret: false }])
    expect(expr).toBe('- key: E\n  value: !!js process.env.X\n  secret: false\n')
    const multi = renderManagedBlock([{ key: 'M', value: 'a\nb', secret: false }])
    expect(multi).toContain('  value: |-\n    a\n    b\n')
  })

  it('空列表渲染为合法的空 YAML 数组', () => {
    expect(renderManagedBlock([])).toBe('[]\n')
  })
})

describe('writeManagedEntries + readManagedEntries 往返', () => {
  it('新建文件：带标记区块、0600 权限、无临时文件残留', () => {
    writeManagedEntries([
      { key: 'FOO', value: 'bar', secret: false },
      { key: 'TOKEN', value: undefined, secret: true },
      { key: 'EXPR', value: { __jsExpr: 'process.env.X' }, secret: false },
    ])
    const text = readFileSync(file, 'utf8')
    expect(text.startsWith('# dsh env managed file\n\n' + MARK_START)).toBe(true)
    expect(text.endsWith(MARK_END + '\n')).toBe(true)
    // POSIX 权限位只在 POSIX 上存在：Windows 的 writeFileSync mode 是 no-op，
    // statSync().mode 恒为 0o666。断言放进平台分支，其余检查照常跑。
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(readdirSync(dir)).toEqual(['env.yml'])

    const read = readManagedEntries()
    expect(read.fileError).toBeUndefined()
    expect(read.file).toBe(file)
    expect(read.entries).toStrictEqual([
      { key: 'FOO', value: 'bar', secret: false },
      { key: 'TOKEN', value: undefined, secret: true },
      { key: 'EXPR', value: { __jsExpr: 'process.env.X' }, secret: false },
    ])
  })

  it('保留区块外的用户内容；重复写入不产生重复区块', () => {
    writeManagedEntries([{ key: 'A', value: '1', secret: false }])
    const first = readFileSync(file, 'utf8').replace(/^# dsh env managed file/, '# 用户自己的说明')
    writeFileSync(file, first)
    writeManagedEntries([{ key: 'B', value: '2', secret: false }])
    const second = readFileSync(file, 'utf8')
    expect(second).toContain('# 用户自己的说明')
    expect(second).not.toContain('key: A')
    expect(second).toContain('key: B')
    expect(second.split(MARK_START)).toHaveLength(2)
    // 重写已有区块会在文件尾多留一个空行（块字符串拼接的既有行为），但区块
    // 仍只有一份，语义不受影响。
    writeManagedEntries([{ key: 'B', value: '2', secret: false }])
    expect(readManagedEntries().entries).toStrictEqual([{ key: 'B', value: '2', secret: false }])
  })

  it('文件中已有托管区块时整体替换，不产生重复区块', () => {
    writeManagedEntries([{ key: 'A', value: '1', secret: false }])
    writeManagedEntries([{ key: 'A', value: '2', secret: false }])
    const text = readFileSync(file, 'utf8')
    expect(text.split(MARK_START)).toHaveLength(2) // 只出现一次
    expect(readManagedEntries().entries).toStrictEqual([{ key: 'A', value: '2', secret: false }])
  })
})

describe('readManagedEntries 容错', () => {
  it('文件不存在：空条目且无错误', () => {
    const read = readManagedEntries()
    expect(read.entries).toEqual([])
    expect(read.fileError).toBeUndefined()
  })

  it('缺结束标记：报错并返回空条目', () => {
    writeFileSync(file, `${MARK_START}\n- key: A\n  value: '1'\n  secret: false\n`)
    const read = readManagedEntries()
    expect(read.entries).toEqual([])
    expect(read.fileError).toContain('缺少结束标记')
  })

  it('损坏 YAML：报解析失败', () => {
    writeFileSync(file, `${MARK_START}\n- key: [unclosed\n${MARK_END}\n`)
    expect(readManagedEntries().fileError).toContain('解析失败')
  })

  it('区块不是 YAML 数组：报类型错误', () => {
    writeFileSync(file, `${MARK_START}\nkey: A\n${MARK_END}\n`)
    expect(readManagedEntries().fileError).toBe('托管区块不是 YAML 数组')
  })

  it('缺 key 的行跳过；非密钥缺 value 记为默认空串，密钥缺 value 记为 ref（undefined）', () => {
    writeFileSync(
      file,
      [
        MARK_START,
        '- value: 1',
        "  secret: false",
        '- key: PLAIN',
        '  secret: false',
        '- key: SECRET',
        '  secret: true',
        MARK_END,
        '',
      ].join('\n'),
    )
    expect(readManagedEntries().entries).toStrictEqual([
      { key: 'PLAIN', value: '', secret: false },
      { key: 'SECRET', value: undefined, secret: true },
    ])
  })
})
