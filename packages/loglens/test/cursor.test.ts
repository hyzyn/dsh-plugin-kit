/**
 * @hyzyn/dsh-loglens — 游标的用例（P1）。
 *
 * 两条点名要有的反例在 §「同 ts 多行」那组里：**同 ts 三行 / limit=2 不丢第三行**、
 * **同 ts 同内容两行 / limit=1 不吞第二行**；外加一条把「按最旧 ts − 1ns 续页」写出来
 * 当反面教材——那是本插件刻意不走的那条路。
 */
import { describe, expect, it } from 'vitest'
import type { LokiCursor } from '../src/cursor.js'
import { CURSOR_VERSION, decodeCursor, encodeCursor, lineFromLoki, slicePage } from '../src/cursor.js'

const TS = '1700000000000000001'
const TS2 = '1700000000000000002'

function row(tsNs: string, streamIdx: number, line = 'x') {
  return { tsNs, streamIdx, line }
}

describe('encodeCursor / decodeCursor', () => {
  const cursor: LokiCursor = { v: CURSOR_VERSION, endNs: TS, streamIdx: 2, ordinalAtTs: 3 }

  it('往返一致', () => {
    expect(decodeCursor(encodeCursor(cursor))).toEqual({ kind: 'ok', cursor })
  })

  it('没给游标就是「没有」（不是错误）', () => {
    expect(decodeCursor(undefined)).toEqual({ kind: 'none' })
    expect(decodeCursor('')).toEqual({ kind: 'none' })
  })

  it('解不开就说解不开，不回落成「当作没有游标」', () => {
    expect(decodeCursor('@@@不是 base64@@@').kind).toBe('invalid')
    expect(decodeCursor(123).kind).toBe('invalid')
    expect(decodeCursor(Buffer.from('null', 'utf8').toString('base64url')).kind).toBe('invalid')
    const wrongVersion = encodeCursor({ ...cursor, v: 99 })
    expect(decodeCursor(wrongVersion)).toEqual({ kind: 'invalid', reason: '游标版本不认识：99' })
  })

  it('缺字段 / 字段类型不对都报 invalid 并说清缺哪个', () => {
    const missing = (patch: Record<string, unknown>) => decodeCursor(Buffer.from(JSON.stringify(patch), 'utf8').toString('base64url'))
    expect(missing({ v: 1, streamIdx: 0, ordinalAtTs: 0 })).toEqual({ kind: 'invalid', reason: '游标缺 endNs' })
    expect(missing({ v: 1, endNs: TS, ordinalAtTs: 0 })).toEqual({ kind: 'invalid', reason: '游标缺 streamIdx' })
    expect(missing({ v: 1, endNs: TS, streamIdx: 0 })).toEqual({ kind: 'invalid', reason: '游标缺 ordinalAtTs' })
    expect(missing({ v: 1, endNs: TS, streamIdx: -1, ordinalAtTs: 0 }).kind).toBe('invalid')
  })
})

describe('slicePage：同 ts 多行', () => {
  it('同 ts 三行 / limit=2：第三行不丢，而且只丢边界上已返回的两行', () => {
    const rows = [row(TS, 0, 'a'), row(TS, 0, 'b'), row(TS, 0, 'c')]
    const first = slicePage(rows, undefined, 2)
    expect(first.page.map((item) => item.line)).toEqual(['a', 'b'])
    expect(first.limited).toBe(true)
    expect(first.skipped).toBe(0)
    expect(first.next).toEqual({ v: CURSOR_VERSION, endNs: TS, streamIdx: 0, ordinalAtTs: 2 })

    const second = slicePage(rows, first.next, 2)
    expect(second.page.map((item) => item.line)).toEqual(['c'])
    expect(second.limited).toBe(false)
    expect(second.skipped).toBe(2)
    expect(second.next?.ordinalAtTs).toBe(3)
  })

  it('同 ts 同内容两行 / limit=1：第二行照样拿得到（同内容也要按序号区分）', () => {
    const rows = [row(TS2, 0, 'same'), row(TS2, 0, 'same')]
    const first = slicePage(rows, undefined, 1)
    expect(first.page).toHaveLength(1)
    expect(first.next).toEqual({ v: CURSOR_VERSION, endNs: TS2, streamIdx: 0, ordinalAtTs: 1 })

    const second = slicePage(rows, first.next, 1)
    expect(second.page).toHaveLength(1)
    expect(second.skipped).toBe(1)
    expect(second.page[0].line).toBe('same')
  })

  it('反例：按「最旧 ts − 1ns」续页会把整个同值批丢掉', () => {
    // 反面教材：本插件刻意不用这种游标——同 ts 的其余行**不在**下一次的窗口里
    const cut = BigInt(TS) - 1n
    const rows = [row(TS, 0, 'a'), row(TS, 0, 'b'), row(TS, 0, 'c')]
    const visible = rows.filter((item) => BigInt(item.tsNs) <= cut)
    expect(visible).toEqual([])
  })

  it('游标只丢「同 ts 同流」的行：别的流不受影响', () => {
    const rows = [row(TS, 0, 'a'), row(TS, 1, 'b'), row(TS, 0, 'c')]
    const first = slicePage(rows, undefined, 1)
    expect(first.page.map((item) => item.line)).toEqual(['a'])
    const second = slicePage(rows, first.next, 2)
    expect(second.page.map((item) => item.line)).toEqual(['b', 'c'])
    expect(second.skipped).toBe(1)
    expect(second.next?.ordinalAtTs).toBe(2)
  })

  it('游标指向的行已经不在本次返回里时，不硬丢（跳过 0 行）', () => {
    const rows = [row(TS2, 0, 'a')]
    const stale: LokiCursor = { v: CURSOR_VERSION, endNs: TS, streamIdx: 0, ordinalAtTs: 5 }
    const result = slicePage(rows, stale, 2)
    expect(result.page.map((item) => item.line)).toEqual(['a'])
    expect(result.skipped).toBe(0)
  })

  it('空返回 / limit 为 0 时不产出游标', () => {
    expect(slicePage([], undefined, 10)).toEqual({ page: [], limited: false, skipped: 0 })
    expect(slicePage([row(TS, 0)], undefined, 0).next).toBeUndefined()
  })
})

describe('lineFromLoki', () => {
  it('纳秒转毫秒（向下取整），id 与 source 稳定可重查', () => {
    const line = lineFromLoki({ tsNs: '1700000000123456789', streamIdx: 3, line: 'hello', labels: { app: 'x' } }, 1)
    expect(line.ts).toBe(1_700_000_000_123)
    expect(line.message).toBe('hello')
    expect(line.labels).toEqual({ app: 'x' })
    expect(line.source).toBe('3@1700000000123456789')
    expect(line.id).toBe('3:1700000000123456789:1')
  })

  it('同 ts 同流但序号不同 → 两行不同 id（去重不会把它们合并）', () => {
    const a = lineFromLoki({ tsNs: TS, streamIdx: 0, line: 'same' }, 0)
    const b = lineFromLoki({ tsNs: TS, streamIdx: 0, line: 'same' }, 1)
    expect(a.id).not.toBe(b.id)
  })
});
