/**
 * **keyspace 树的纯逻辑**（`keyspace.ts`）测试。
 *
 * 这一层的失败方式与别处一样安静：命令拼错一个参数、回复解析错一层嵌套，界面**照样渲染**，
 * 只是内容不对。所以用例盯的是三件：
 *
 *   1. **可寻址性**：含空白 / 控制字符的 key 与模式必须在**拼命令之前**被拒——命令原文按空白切分，
 *      一个叫 `x COUNT 1` 的「key」会让 `SCAN 0 MATCH x COUNT 1` 多出两个参数（**注入**），
 *      而那正是「界面按 A 判、执行按 B 跑」这类最难查的错位；
 *   2. **每一种预览都是有界的**：命令里必须带得见上限（`GETRANGE 0 199` / `LRANGE 0 99` /
 *      `HSCAN … COUNT 50`），不能出现裸 `GET` / `HGETALL`；
 *   3. **截断判据分三处**（list/zset 看元素数、hash/set 看 SCAN 游标、string 看字节数），
 *      别让界面自己去猜「有没有被截断」。
 */

import { describe, expect, it } from 'vitest'

import {
  KEY_MAX_LENGTH,
  MAX_DB_INDEX,
  PATTERN_MAX_LENGTH,
  PREVIEW_TEXT_MAX,
  STRING_PREVIEW_LIMIT,
  canBrowseDb,
  checkAddressable,
  defaultDb,
  isDbIndex,
  kindOf,
  normalizeDbs,
  parseInfoKeyspace,
  parseScanReply,
  previewPlan,
  previewText,
  scanCommand,
  shapeKeyView,
} from '../src/index.js'

describe('checkAddressable：解析层表达不出来的输入，在读任何东西之前就拒', () => {
  it('正常的 key 放行；含空白 / 控制字符的一律拒（并说清是**能力边界**不是写错）', () => {
    expect(checkAddressable('user:1', { what: 'key', maxLength: KEY_MAX_LENGTH })).toEqual({ ok: true, value: 'user:1' })

    for (const bad of ['a b', 'a\tb', 'a\nb', 'a\rb', 'x COUNT 1', 'a\u0000b']) {
      const refused = checkAddressable(bad, { what: 'key', maxLength: KEY_MAX_LENGTH })
      expect(refused.ok, `${JSON.stringify(bad)} 应该被拒`).toBe(false)
      if (!refused.ok) {
        expect(refused.code).toBe('BAD_KEY')
        // 文案要能让人知道下一步：这不是「你写错了」，而是切分只按空白。
        expect(refused.error).toContain('只按空白')
      }
    }
  })

  it('空串与超长各自有判据（超长挡的是「拿一整条命令当 key」）', () => {
    expect(checkAddressable('', { what: 'key', maxLength: KEY_MAX_LENGTH }).ok).toBe(false)
    expect(checkAddressable('k'.repeat(KEY_MAX_LENGTH + 1), { what: 'key', maxLength: KEY_MAX_LENGTH }).ok).toBe(false)
    expect(checkAddressable('k'.repeat(KEY_MAX_LENGTH), { what: 'key', maxLength: KEY_MAX_LENGTH }).ok).toBe(true)
    expect(checkAddressable('a b', { what: '匹配模式', maxLength: PATTERN_MAX_LENGTH }).ok).toBe(false)
  })
})

describe('scanCommand：`SCAN <游标> [MATCH p] [COUNT n]`', () => {
  it('缺省游标是 0；MATCH / COUNT 按给到的顺序拼在后面', () => {
    expect(scanCommand({})).toEqual({ ok: true, command: 'SCAN 0' })
    expect(scanCommand({ cursor: '17' })).toEqual({ ok: true, command: 'SCAN 17' })
    expect(scanCommand({ match: 'user:*' })).toEqual({ ok: true, command: 'SCAN 0 MATCH user:*' })
    expect(scanCommand({ cursor: '0', match: 'user:*', count: 50 })).toEqual({ ok: true, command: 'SCAN 0 MATCH user:* COUNT 50' })
  })

  it('★ 反例：模式里带空白 → **拒**，而且拼不出任何命令（注入在这里被挡掉）', () => {
    const injected = scanCommand({ match: 'x COUNT 1' })
    expect(injected.ok).toBe(false)
    if (!injected.ok) expect(injected.code).toBe('BAD_PATTERN')
  })

  it('游标必须是非负整数（`0 COUNT 1` 这种走私写法也拦）、COUNT 必须是正整数', () => {
    for (const cursor of ['x', '-1', '0 COUNT 1', '1.5', '']) {
      // 空串按「没给」处理（缺省 0），其余一律拒
      const got = scanCommand({ cursor })
      if (cursor === '') expect(got).toEqual({ ok: true, command: 'SCAN 0' })
      else expect(got.ok, `游标 ${JSON.stringify(cursor)} 应该被拒`).toBe(false)
    }
    expect(scanCommand({ count: 0 }).ok).toBe(false)
    expect(scanCommand({ count: -3 }).ok).toBe(false)
    expect(scanCommand({ count: 'abc' }).ok).toBe(false)
  })
})

describe('parseScanReply：认不出来就拒，不猜', () => {
  it('`[游标, [key…]]` 正常解析（游标是数字也接受，Redis 客户端各有各的形状）', () => {
    expect(parseScanReply(['7', ['a', 'b']])).toEqual({ ok: true, cursor: '7', keys: ['a', 'b'] })
    expect(parseScanReply([7, ['a']])).toEqual({ ok: true, cursor: '7', keys: ['a'] })
    expect(parseScanReply(['0', []])).toEqual({ ok: true, cursor: '0', keys: [] })
  })

  it('不是两元数组 / 游标不是字符串 / 第二个元素不是数组 → `UNEXPECTED_REPLY`', () => {
    for (const bad of ['PONG', null, [], ['0'], [{}, []], ['0', 'abc']]) {
      const got = parseScanReply(bad)
      expect(got.ok, `${JSON.stringify(bad)} 应该被拒`).toBe(false)
      if (!got.ok) expect(got.code).toBe('UNEXPECTED_REPLY')
    }
  })
})

describe('previewPlan：每种类型的预览都**自带上限**', () => {
  it('五种类型各给两条命令，上限看得见（string 用 GETRANGE 而不是 GET）', () => {
    expect(previewPlan('string', 'k').commands).toEqual(['STRLEN k', `GETRANGE k 0 ${String(STRING_PREVIEW_LIMIT - 1)}`])
    expect(previewPlan('list', 'k').commands).toEqual(['LLEN k', 'LRANGE k 0 99'])
    expect(previewPlan('hash', 'k').commands).toEqual(['HLEN k', 'HSCAN k 0 COUNT 50'])
    expect(previewPlan('set', 'k').commands).toEqual(['SCARD k', 'SSCAN k 0 COUNT 50'])
    expect(previewPlan('zset', 'k').commands).toEqual(['ZCARD k', 'ZRANGE k 0 99 WITHSCORES'])
    // 没做预览的类型 / 不存在的 key：**没有命令**，不是错误——界面上如实说一句。
    expect(previewPlan('none', 'k').commands).toEqual([])
    expect(previewPlan('ReJSON-RL', 'k').commands).toEqual([])
  })

  it('`kindOf` 把模块类型归到 `other`（不猜它的内容）', () => {
    expect(kindOf('string')).toBe('string')
    expect(kindOf('zset')).toBe('zset')
    expect(kindOf('none')).toBe('none')
    expect(kindOf('stream')).toBe('other')
    expect(kindOf('unknown')).toBe('other')
  })
})

describe('shapeKeyView：把四条回复整成一个视图', () => {
  it('string：字节数 + 一段值；字节数超过取回长度就是**被截断**', () => {
    const view = shapeKeyView({ key: 'k', type: 'string', ttl: 120, total: 5, preview: 'hello' })
    expect(view).toMatchObject({ kind: 'string', total: 5, totalKind: 'bytes', rows: [['hello']], truncated: false })
    const big = shapeKeyView({ key: 'k', type: 'string', ttl: -1, total: 10_000, preview: 'x'.repeat(200) })
    expect(big.truncated).toBe(true)
  })

  it('list：行号 + 值，元素数超过取回条数就截断', () => {
    const view = shapeKeyView({ key: 'k', type: 'list', ttl: -1, total: 2, preview: ['a', 'b'] })
    expect(view.rows).toEqual([['0', 'a'], ['1', 'b']])
    expect(view.totalKind).toBe('items')
    expect(view.truncated).toBe(false)
    expect(shapeKeyView({ key: 'k', type: 'list', ttl: -1, total: 1000, preview: ['a'] }).truncated).toBe(true)
  })

  it('hash / set：截断看 **SCAN 游标**（不是元素数——SCAN 一次不一定取完）', () => {
    const hash = shapeKeyView({ key: 'k', type: 'hash', ttl: -1, total: 2, preview: ['0', ['a', '1', 'b', '2']] })
    expect(hash.rows).toEqual([['a', '1'], ['b', '2']])
    expect(hash.totalKind).toBe('fields')
    expect(hash.truncated).toBe(false)
    expect(shapeKeyView({ key: 'k', type: 'hash', ttl: -1, total: 999, preview: ['9', ['a', '1']] }).truncated).toBe(true)

    const set = shapeKeyView({ key: 'k', type: 'set', ttl: -1, total: 2, preview: ['0', ['x', 'y']] })
    expect(set.rows).toEqual([['x'], ['y']])
    expect(set.totalKind).toBe('members')
    expect(shapeKeyView({ key: 'k', type: 'set', ttl: -1, total: 2, preview: ['3', ['x']] }).truncated).toBe(true)
  })

  it('zset：成员 + 分数成对；不存在的 key 与没做预览的类型都是 `rows: null`（不是空数组）', () => {
    const zset = shapeKeyView({ key: 'k', type: 'zset', ttl: -1, total: 2, preview: ['m1', '1', 'm2', '2'] })
    expect(zset.rows).toEqual([['m1', '1'], ['m2', '2']])

    const missing = shapeKeyView({ key: 'k', type: 'none', ttl: -2, total: null, preview: null })
    expect(missing).toMatchObject({ kind: 'none', ttl: -2, total: null, totalKind: 'none', rows: null, truncated: false })

    const other = shapeKeyView({ key: 'k', type: 'stream', ttl: -1, total: null, preview: null })
    expect(other).toMatchObject({ kind: 'other', rows: null })
  })

  it('`TYPE` 拿不到（不是字符串）时类型记 `unknown`，仍然不猜内容', () => {
    expect(shapeKeyView({ key: 'k', type: null, ttl: null, total: null, preview: null })).toMatchObject({ type: 'unknown', kind: 'other', rows: null })
  })
})

describe('parseInfoKeyspace：树里「库」那一层的真数字', () => {
  it('正常回复：每行一个库，按库号排序；缺的字段记 null（**不编 0**）', () => {
    const reply = ['# Keyspace', 'db1:keys=3,expires=1,avg_ttl=0', 'db0:keys=105,expires=0,avg_ttl=250'].join('\r\n')
    expect(parseInfoKeyspace(reply)).toEqual({
      ok: true,
      dbs: [
        { index: 0, keys: 105, expires: 0, avgTtl: 250 },
        { index: 1, keys: 3, expires: 1, avgTtl: 0 },
      ],
    })
    const sparse = parseInfoKeyspace('db4:keys=7')
    expect(sparse).toEqual({ ok: true, dbs: [{ index: 4, keys: 7, expires: null, avgTtl: null }] })
  })

  it('认不出的行跳过；一行都没有 → 空数组（**不是错误**：这台机器可能一个 key 都没有）', () => {
    expect(parseInfoKeyspace('# Keyspace\r\n')).toEqual({ ok: true, dbs: [] })
    expect(parseInfoKeyspace('# 服务器\r\nredis_version:4.0.14\r\n')).toEqual({ ok: true, dbs: [] })
  })

  it('回复不是字符串（比如 `INFO` 被当成错误 / 拿到数组）→ `UNEXPECTED_REPLY`，不猜', () => {
    for (const bad of [null, 42, ['db0:keys=1']]) {
      const got = parseInfoKeyspace(bad)
      expect(got.ok, JSON.stringify(bad)).toBe(false)
      if (!got.ok) expect(got.code).toBe('UNEXPECTED_REPLY')
    }
  })
})

/*
 * ---------- 库号：**只能来自两个宿主侧的事实源**（2026-10-05 起库那一层能点着切） ----------
 *
 * 加这些用例的理由：面板上多了一个「浏览器传上来的库号」，而它必须**先过判据、再连**。
 * 判据本身很短（`isDbIndex` / `canBrowseDb`），但它守的是那条不变量——「浏览器能不能决定
 * `SELECT` 什么」；这条不变量一旦靠人工 review 守，下一次改动就漂了。
 */
describe('库号判据（`isDbIndex` / `normalizeDbs` / `canBrowseDb` / `defaultDb`）', () => {
  it('库号：非负整数且在上限内才是；小数 / 负数 / 超上限 / 别的类型一律不是', () => {
    expect(isDbIndex(0)).toBe(true)
    expect(isDbIndex(MAX_DB_INDEX)).toBe(true)
    for (const bad of [-1, 1.5, MAX_DB_INDEX + 1, '0', null, undefined, {}, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isDbIndex(bad), JSON.stringify(bad)).toBe(false)
    }
  })

  it('`normalizeDbs`：去重升序，坏值**原样交回**（由调用方按自己的文案报出来）', () => {
    expect(normalizeDbs([3, 1, 3])).toEqual({ dbs: [1, 3], bad: [] })
    expect(normalizeDbs(['2', -1, 4.5])).toEqual({ dbs: [], bad: ['2', -1, 4.5] })
    expect(normalizeDbs(undefined)).toEqual({ dbs: [], bad: [] })
    expect(normalizeDbs('0,1')).toEqual({ dbs: [], bad: [] })
  })

  it('`defaultDb`：没写就是 0（Redis 连接的默认库），写坏了也是 0——**不是猜**，是连接本身的语义', () => {
    expect(defaultDb(undefined)).toBe(0)
    expect(defaultDb(7)).toBe(7)
    expect(defaultDb(-1)).toBe(0)
  })

  it('★ `canBrowseDb`：声明的 ∪ 服务器当场报的；别的编号一律不许（那是「浏览器自己造库号」）', () => {
    expect(canBrowseDb(0, [0], [])).toBe(true)
    expect(canBrowseDb(3, [0, 1], [])).toBe(false)
    expect(canBrowseDb(3, [0, 1], [3])).toBe(true)
    // 服务器报的那个即使不在声明里也允许（宿主侧的另一个事实源），但**只限那一个编号**。
    expect(canBrowseDb(4, [0, 1], [3])).toBe(false)
    // 形状先判：`'3'` / `-1` 这类连想都别想。
    expect(canBrowseDb('3', [0, 1, 3], [3])).toBe(false)
    expect(canBrowseDb(-1, [-1], [])).toBe(false)
  })
})

describe('表格「值」那一列（`previewText`）', () => {
  it('哈希 / 有序集合压成 `field:value`，非字符串类型包一层 `[]`（一眼看出是几个元素）', () => {
    expect(previewText('hash', [['a', '1'], ['b', '2']], false)).toBe('[a:1, b:2]')
    expect(previewText('zset', [['m', '1.5']], false)).toBe('[m:1.5]')
    expect(previewText('list', [['x'], ['y']], false)).toBe('[x, y]')
  })

  it('字符串就是它自己，**不带**方括号', () => {
    expect(previewText('string', [['hello']], false)).toBe('hello')
  })

  it('★ `rows === null`（这个类型没做预览）→ `null`：界面画「—」，不猜内容', () => {
    expect(previewText('other', null, false)).toBeNull()
    expect(previewText('none', null, false)).toBeNull()
  })

  it('★ 截断照实说：`truncated` 或压完超长都要留下省略号（短的值不能看着像全部）', () => {
    expect(previewText('string', [['abc']], true)).toBe('abc…')
    expect(previewText('set', [['a'], ['b']], true)).toBe('[a, b, …]')
    const many = Array.from({ length: 40 }, (_item, index) => ['k' + String(index), 'v'])
    const text = previewText('hash', many, false)
    expect(text?.length).toBeLessThanOrEqual(PREVIEW_TEXT_MAX + 6)
    expect(text?.endsWith(', …]')).toBe(true)
  })
})
