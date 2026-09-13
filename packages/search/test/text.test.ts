/**
 * @hyzyn/dsh-global-search — 搜索纯逻辑的回归测试。
 *
 * 覆盖 makeSnippet（窗口 / 锚点 / 省略号）、compileLocalTextFilter（大小写、
 * 空白弹性、元字符转义）、readRecordTime（多字段容错取最大）、isSubagentHeader、
 * sortRecordsByTimeDesc（无时间记录沉底且稳定排序）。断言以现有实现为准。
 */
import { describe, expect, it } from 'vitest'
import { compileLocalTextFilter, isSubagentHeader, makeSnippet, readRecordTime, sortRecordsByTimeDesc } from '../src/index.js'

describe('makeSnippet', () => {
  it('单词全命中且窗口内：原样返回', () => {
    expect(makeSnippet('前缀-数据库-后缀', '数据库')).toBe('前缀-数据库-后缀')
  })

  it('空查询：返回前 120 字符（超出加省略号）', () => {
    expect(makeSnippet('hello', '')).toBe('hello')
    expect(makeSnippet('q'.repeat(130), '')).toBe('q'.repeat(120) + '…')
  })

  it('无命中：截断文本，不猜测锚点', () => {
    expect(makeSnippet('abcdef', 'zzz')).toBe('abcdef')
  })

  it('部分命中：以第一个命中的词为锚，两端各扩 radius（默认 60）', () => {
    const text = 'x'.repeat(100) + 'needle' + 'y'.repeat(100)
    expect(makeSnippet(text, 'needle zzz')).toBe('…' + 'x'.repeat(60) + 'needle' + 'y'.repeat(60) + '…')
  })

  it('全命中：窗口扩 40 字符并截到 240 总长，两端按需加省略号', () => {
    const text = 'x'.repeat(100) + 'needle' + 'y'.repeat(200)
    expect(makeSnippet(text, 'needle')).toBe('…' + 'x'.repeat(40) + 'needle' + 'y'.repeat(40) + '…')

    const spread = 'a'.repeat(30) + 'foo' + 'b'.repeat(200) + 'bar' + 'c'.repeat(30)
    expect(makeSnippet(spread, 'foo bar')).toBe('a'.repeat(30) + 'foo' + 'b'.repeat(200) + 'bar' + 'c'.repeat(4) + '…')
  })

  it('窗口内空白折叠为单空格并 trim', () => {
    expect(makeSnippet('a\n\nb foo bar', 'foo bar')).toBe('a b foo bar')
  })
})

describe('compileLocalTextFilter', () => {
  it('大小写不敏感 + 空白弹性（多词按 \\s+ 连接）', () => {
    const filter = compileLocalTextFilter('Foo  bar')
    expect(filter.flags).toContain('i')
    expect(filter.test('foo   BAR')).toBe(true)
    expect(filter.test('FOO\tBAR')).toBe(true)
    expect(filter.test('foobar')).toBe(false)
  })

  it('正则元字符转义为字面量', () => {
    const filter = compileLocalTextFilter('a.b(c)')
    expect(filter.test('a.b(c)')).toBe(true)
    expect(filter.test('axb(c)')).toBe(false)
  })

  it('空查询编译为空正则（匹配任意文本）', () => {
    expect(compileLocalTextFilter('   ').test('anything')).toBe(true)
  })
})

describe('readRecordTime', () => {
  it('从 header / 记录顶层的 time / updatedAt / createdAt / startTime 取值', () => {
    expect(readRecordTime({ header: { time: 1000 } })).toBe(1000)
    expect(readRecordTime({ time: 2000 })).toBe(2000)
    expect(readRecordTime({ header: { updatedAt: '2024-01-02T03:04:05.000Z' } })).toBe(Date.parse('2024-01-02T03:04:05.000Z'))
    expect(readRecordTime({ header: { startTime: 3 } })).toBe(3)
  })

  it('多个字段取能解析到的最大值，非法值忽略', () => {
    expect(readRecordTime({ header: { time: 1 }, time: 2 })).toBe(2)
    expect(readRecordTime({ header: { time: 'nope' }, time: 5 })).toBe(5)
  })

  it('非对象 / 全字段缺失返回 undefined', () => {
    expect(readRecordTime(null)).toBeUndefined()
    expect(readRecordTime(42)).toBeUndefined()
    expect(readRecordTime('2024-01-01')).toBeUndefined()
    expect(readRecordTime({})).toBeUndefined()
    expect(readRecordTime({ header: 'not-object', time: undefined })).toBeUndefined()
  })
})

describe('isSubagentHeader', () => {
  it('origin=subagent 或 delegationDepth>0 判为子会话', () => {
    expect(isSubagentHeader({ origin: 'subagent' })).toBe(true)
    expect(isSubagentHeader({ delegationDepth: 1 })).toBe(true)
    expect(isSubagentHeader({ origin: 'main', delegationDepth: 2 })).toBe(true)
  })

  it('其它形状返回 false（类型不符的 depth 不算）', () => {
    expect(isSubagentHeader(null)).toBe(false)
    expect(isSubagentHeader('subagent')).toBe(false)
    expect(isSubagentHeader({})).toBe(false)
    expect(isSubagentHeader({ origin: 'main' })).toBe(false)
    expect(isSubagentHeader({ delegationDepth: 0 })).toBe(false)
    expect(isSubagentHeader({ delegationDepth: '1' })).toBe(false)
  })
})

describe('sortRecordsByTimeDesc', () => {
  it('有时间记录按时间降序；时间相同按原索引稳定', () => {
    const records = [
      { id: 'a', time: 1 },
      { id: 'b', time: 3 },
      { id: 'c', time: 2 },
      { id: 'd', time: 2 },
    ]
    expect(sortRecordsByTimeDesc(records).map((record) => record.id)).toEqual(['b', 'c', 'd', 'a'])
  })

  it('无时间记录沉底并保持原有相对顺序', () => {
    const records = [{ id: 'u' }, { id: 't', time: 5 }, { id: 'v' }, { id: 's', time: 6 }]
    expect(sortRecordsByTimeDesc(records).map((record) => record.id)).toEqual(['s', 't', 'u', 'v'])
  })

  it('不修改入参数组，返回新数组', () => {
    const records = [{ id: 'a', time: 1 }, { id: 'b', time: 2 }]
    const sorted = sortRecordsByTimeDesc(records)
    expect(sorted).not.toBe(records)
    expect(records.map((record) => record.id)).toEqual(['a', 'b'])
  })

  it('时间可从 header 读取', () => {
    const records = [{ id: 'old', header: { time: 1 } }, { id: 'new', header: { time: 9 } }]
    expect(sortRecordsByTimeDesc(records).map((record) => record.id)).toEqual(['new', 'old'])
  })
})
