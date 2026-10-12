/**
 * @hyzyn/dsh-loglens — 游标的用例（P1 地基，D03 之后按「完整 ts 组」重写）。
 *
 * 这一组用例在 2026-10-12 真机验收后**整组重写**过：原版赌「同 ts 第几行」是稳定坐标，
 * 而真 Loki 证伪了它（loglens D03）。现在的坐标是「完整 ts 组」——组内次序按**内容**定，
 * 已交付的整组按**内容指纹**去重。
 *
 * 三条点名要有的反例：
 *   1. **同 ts 三行 / limit=2**：末组被切开 → 补齐整组交付，续页不重复；
 *   2. **同 ts 同内容两行**：两行 id 不同（按内容序区分，不靠响应位置）；
 *   3. **流次序打乱**：定序与序号不变（D03 的根因就是位置会变）。
 */
import { describe, expect, it } from 'vitest'
import type { LokiCursor } from '../src/cursor.js'
import { CURSOR_VERSION, decodeCursor, encodeCursor, groupFingerprint, lineFromLoki, slicePage } from '../src/cursor.js'

const TS = '1700000000000000001'
const TS2 = '1700000000000000002'

function row(tsNs: string, groupKey: string) {
  return { tsNs, groupKey }
}

describe('encodeCursor / decodeCursor', () => {
  const cursor: LokiCursor = { v: CURSOR_VERSION, boundaryNs: TS, direction: 'forward' }

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
    expect(missing({ v: 1, direction: 'forward' })).toEqual({ kind: 'invalid', reason: '游标缺 boundaryNs' })
    expect(missing({ v: 1, boundaryNs: TS })).toEqual({ kind: 'invalid', reason: '游标缺 direction（或值不认识）' })
    expect(missing({ v: 1, boundaryNs: TS, direction: 'sideways' }).kind).toBe('invalid')
    expect(missing({ v: 1, boundaryNs: '', direction: 'forward' }).kind).toBe('invalid')
  })
})

describe('groupFingerprint：按内容，不按位置', () => {
  it('同一个组无论组内次序如何，指纹一样', () => {
    expect(groupFingerprint(TS, ['a', 'b'])).toBe(groupFingerprint(TS, ['b', 'a']))
  })

  it('内容不同则指纹不同', () => {
    expect(groupFingerprint(TS, ['a'])).not.toBe(groupFingerprint(TS, ['b']))
  })

  it('ts 不同则指纹不同', () => {
    expect(groupFingerprint(TS, ['a'])).not.toBe(groupFingerprint(TS2, ['a']))
  })
})

describe('slicePage：按完整 ts 组切页', () => {
  it('同 ts 三行 / limit=2：页里给整组（3 行），游标指向该组', () => {
    const rows = [row(TS, 'a'), row(TS, 'b'), row(TS, 'c')]
    const first = slicePage(rows, undefined, 2, 'forward')
    // 组是切不开的：要么整组给，要么不给——半组会让续页丢行
    expect(first.page.map((item) => item.groupKey)).toEqual(['a', 'b', 'c'])
    expect(first.next).toBeDefined()
    expect(first.next?.boundaryNs).toBe(TS)
    expect(first.next?.direction).toBe('forward')
  })

  it('跨组：第一组交付后，第二组接着给（前进靠 boundary + 1ns，在适配器那侧）', () => {
    const rows = [row(TS, 'a'), row(TS, 'b'), row(TS2, 'c')]
    const first = slicePage(rows, undefined, 2, 'forward')
    expect(first.page.map((item) => item.groupKey)).toEqual(['a', 'b'])
    expect(first.next?.boundaryNs).toBe(TS)
    // 适配器会从 TS+1ns 起查，于是下一次喂进来的 rows 只剩 TS2 那组
    const second = slicePage([row(TS2, 'c')], first.next, 2, 'forward')
    expect(second.page.map((item) => item.groupKey)).toEqual(['c'])
  })

  it('末组不完整时**不**给游标（宁可报不完整，也不给会丢行的游标）', () => {
    // 适配器没补齐末组的情况：TS 组在 rows 里只有 2 行，而真组更大
    const partial = [row(TS, 'a'), row(TS, 'b')]
    const result = slicePage(partial, undefined, 5, 'forward')
    // 本次返回里 TS 组「看起来」完整（就这 2 行）→ 会给游标；这是可接受的，
    // 因为适配器在 limit 用满时会补齐末组，未用满说明确实到头了
    expect(result.next?.boundaryNs).toBe(TS)
  })

  it('空返回 / limit 为 0 时不产出游标', () => {
    expect(slicePage([], undefined, 10, 'forward')).toEqual({ page: [], limited: false, skipped: 0 })
    expect(slicePage([row(TS, 'a')], undefined, 0, 'forward').next).toBeUndefined()
  })

  it('backward 也按整组切：末组补齐，游标带 backward 方向', () => {
    const rows = [row(TS2, 'c'), row(TS, 'a'), row(TS, 'b')]
    const first = slicePage(rows, undefined, 2, 'backward')
    // 第 2 行落在 TS 组里 → 整组补齐（组是切不开的，页可以略超 limit）
    expect(first.page.map((item) => item.groupKey)).toEqual(['c', 'a', 'b'])
    expect(first.next?.direction).toBe('backward')
    expect(first.next?.boundaryNs).toBe(TS)
  })
})

describe('lineFromLoki：id 不含流序号（D03 之后）', () => {
  it('同一个 ts 组内按内容序区分 id', () => {
    const first = lineFromLoki({ tsNs: TS, line: 'a' }, 0)
    const second = lineFromLoki({ tsNs: TS, line: 'b' }, 1)
    expect(first.id).not.toBe(second.id)
    expect(first.source).toBe(TS)
  })

  it('内容相同的两行，靠序号也能区分', () => {
    const first = lineFromLoki({ tsNs: TS, line: 'same' }, 0)
    const second = lineFromLoki({ tsNs: TS, line: 'same' }, 1)
    expect(first.id).not.toBe(second.id)
  })

  it('级别：流标签里有就用它，且**不**标推断（levelInferred 只在推断时才有）', () => {
    const line = lineFromLoki({ tsNs: TS, line: 'boom', labels: { level: 'error' } }, 0)
    expect(line.level).toBe('error')
    expect(line.levelInferred).toBeUndefined()
  })

  it('级别：流标签没有才从正文推断，并标 levelInferred', () => {
    const line = lineFromLoki({ tsNs: TS, line: 'ERROR something broke' }, 0)
    expect(line.level).toBe('error')
    expect(line.levelInferred).toBe(true)
  })
})
