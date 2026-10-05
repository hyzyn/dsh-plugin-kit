/**
 * RESP 编解码测试。
 *
 * **夹具的来源**：下面标 `真实` 的那几条，是 2026-10-02 从 `192.0.2.248:6379`（Redis 4.0.14；RFC 5737 占位地址）
 * 实际抓回来的**原始字节**——不是照文档编的。这类协议解析的坑（多字节长度、`null` 与空串、
 * 分块边界）只有真实字节能覆盖。
 *
 * 用例重点在**反面**：分块要能跨任意边界、`$-1` 不许被当成空串、不知名的类型必须报错而不是猜。
 */

import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'vitest'

import { RespProtocolError, createReplyParser, encodeCommand, type RespReply } from '../src/index.js'

const b = (s: string): Buffer => Buffer.from(s, 'utf8')

/*
 * 拼 RESP 的夹具。**长度一律现算**——这次写用例时手写长度错了三处
 * （把 `DICT-TABLE:CodeDistrict-DICT` 数成 29、其实 28；`$478` 只给了 100 字节），
 * 而解析器会**耐心地等宣告的字节数**、于是一条都吐不出来。手数必然出错，所以让它算。
 */
const bulk = (s: string): string => `$${String(Buffer.byteLength(s))}\r\n${s}\r\n`
const arr = (...items: string[]): string => `*${String(items.length)}\r\n${items.join('')}`

/** 一条回复走完整流程（单次 feed）。 */
function parseOne(text: string): RespReply {
  const replies = createReplyParser().feed(b(text))
  expect(replies).toHaveLength(1)
  return replies[0] as RespReply
}

describe('编码', () => {
  it('编成 RESP 数组（长度按**字节**，不是字符）', () => {
    expect(encodeCommand(['GET', 'k']).toString('utf8')).toBe('*2\r\n$3\r\nGET\r\n$1\r\nk\r\n')
  })

  it('多字节参数按字节计长（这条错了对端会读串位）', () => {
    const encoded = encodeCommand(['SET', '键', '值'])
    // 「键」「值」在 UTF-8 里各 3 字节；按字符数写 1 就会读串位。
    expect(encoded.toString('utf8')).toBe('*3\r\n$3\r\nSET\r\n$3\r\n键\r\n$3\r\n值\r\n')
  })
})

describe('解析：五种类型', () => {
  it('简单串 / 整数', () => {
    expect(parseOne('+PONG\r\n')).toEqual({ kind: 'simple', value: 'PONG' }) // 真实
    expect(parseOne(':59\r\n')).toEqual({ kind: 'integer', value: 59 }) // 真实（DBSIZE）
  })

  it.each(['3.5', '9garbage', '1e2', '', ' 9', '9007199254740993', '-9007199254740993'])('非法整数回复 %j 不得截断或丢失精度后放行', (value) => {
    expect(() => createReplyParser().feed(b(`:${value}\r\n`))).toThrow(RespProtocolError)
  })

  it('零、负整数、显式正号与安全整数边界保留原协议值', () => {
    for (const value of ['0', '-1', '+9', '9007199254740991', '-9007199254740991']) {
      expect(parseOne(`:${value}\r\n`)).toEqual({ kind: 'integer', value: Number(value) })
    }
  })

  it('错误是**回复**不是异常（上层决定怎么报给 agent）', () => {
    // 真实：ACL WHOAMI 在 4.0.14 上的回复
    expect(parseOne('-ERR unknown command `ACL`, with args beginning with: `WHOAMI`,  \r\n')).toEqual({
      kind: 'error',
      value: 'ERR unknown command `ACL`, with args beginning with: `WHOAMI`,  ',
    })
  })

  it('bulk：**`null` 与空串不能合并**（「键不存在」与「值就是空」是两件事）', () => {
    expect(parseOne('$-1\r\n')).toEqual({ kind: 'bulk', value: null })
    expect(parseOne('$0\r\n\r\n')).toEqual({ kind: 'bulk', value: '' })
    expect(parseOne('$-1\r\n')).not.toEqual(parseOne('$0\r\n\r\n'))
  })

  it('bulk 长度按字节切（在字节维度上切，多字节字符不会被切坏）', () => {
    expect(parseOne('$3\r\n键\r\n')).toEqual({ kind: 'bulk', value: '键' })
  })

  it('数组与嵌套数组；`*-1` 是 null 数组', () => {
    expect(parseOne('*0\r\n')).toEqual({ kind: 'array', value: [] })
    expect(parseOne('*-1\r\n')).toEqual({ kind: 'array', value: null })
    expect(parseOne('*2\r\n:1\r\n$2\r\nab\r\n')).toEqual({
      kind: 'array',
      value: [
        { kind: 'integer', value: 1 },
        { kind: 'bulk', value: 'ab' },
      ],
    })
    expect(parseOne('*1\r\n*1\r\n:7\r\n')).toEqual({
      kind: 'array',
      value: [{ kind: 'array', value: [{ kind: 'integer', value: 7 }] }],
    })
  })
})

describe('解析：真实回复（从 248 那台 Redis 抓的）', () => {
  it('`INFO server` 的头部（真实抓到的正文，长度现算）', () => {
    const info = parseOne(bulk('# Server\r\nredis_version:4.0.14\r\nredis_git_sha1:00000000\r\nredis_git_dirty:0\r\n'))
    expect(info.kind).toBe('bulk')
    if (info.kind !== 'bulk') return
    expect(info.value).toContain('redis_version:4.0.14')
  })

  it('`SCAN 0 COUNT 10` 的回复：游标 + 键数组（**嵌套**）', () => {
    const scan = parseOne(
      arr(bulk('52'), arr(bulk('sysMenu'), bulk('CMPE2026'), bulk('DICT-TABLE:CodeDistrict-DICT'))),
    )
    expect(scan.kind).toBe('array')
    if (scan.kind !== 'array' || scan.value === null) return
    const [cursor, keys] = scan.value
    expect(cursor).toEqual({ kind: 'bulk', value: '52' })
    expect(keys?.kind).toBe('array')
    if (keys?.kind !== 'array' || keys.value === null) return
    expect(keys.value.map((k) => (k.kind === 'bulk' ? k.value : null))).toEqual([
      'sysMenu',
      'CMPE2026',
      'DICT-TABLE:CodeDistrict-DICT',
    ])
  })

  it('`CONFIG GET requirepass` 的回复：第二条是**空 bulk**（= 没有密码）', () => {
    expect(parseOne(arr(bulk('requirepass'), bulk('')))).toEqual({
      kind: 'array',
      value: [
        { kind: 'bulk', value: 'requirepass' },
        { kind: 'bulk', value: '' },
      ],
    })
  })
})

describe('解析：分块与上限（TCP 上这两条最容易出错）', () => {
  const data = '*2\r\n$2\r\n52\r\n*2\r\n$7\r\nsysMenu\r\n$8\r\nCMPE2026\r\n'

  it('**逐字节喂**也能解析出同一条回复（一次 read ≠ 一条回复）', () => {
    const parser = createReplyParser()
    const got: RespReply[] = []
    for (const byte of b(data)) {
      got.push(...parser.feed(Buffer.from([byte])))
    }
    expect(got).toHaveLength(1)
    expect(parser.pendingBytes).toBe(0)
    expect(got[0]).toEqual(parseOne(data))
  })

  it('一次 feed 里有**两条**回复 → 都要吐出来', () => {
    const replies = createReplyParser().feed(b('+OK\r\n:1\r\n'))
    expect(replies).toEqual([
      { kind: 'simple', value: 'OK' },
      { kind: 'integer', value: 1 },
    ])
  })

  it('**多字节字符跨分块**也不会坏（所以解析必须逐字节做，不能先 decode 成字符串）', () => {
    const payload = encodeCommand(['ECHO', '中文测试'])
    // 这条命令的**回复**是一个 bulk；这里直接构造等价回复并从中切断
    const reply = b(`$12\r\n中文测试\r\n`)
    const parser = createReplyParser()
    const got: RespReply[] = []
    for (let i = 0; i < reply.length; i += 1) {
      // 故意在**每个字节**处切断，必然跨过「中」的三字节
      got.push(...parser.feed(reply.subarray(i, i + 1)))
    }
    expect(got).toEqual([{ kind: 'bulk', value: '中文测试' }])
    expect(payload.length).toBeGreaterThan(0)
  })

  it('半条回复挂着 → 什么都不吐，且 `pendingBytes` 不为 0', () => {
    const parser = createReplyParser()
    expect(parser.feed(b('*2\r\n$2\r\n52\r\n*2\r\n$7\r\nsys'))).toEqual([])
    expect(parser.pendingBytes).toBeGreaterThan(0)
  })

  it('超过上限 → 明确报错并丢掉缓冲（不是「慢」，是不能把内存吃光）', () => {
    const parser = createReplyParser({ maxBytes: 16 })
    expect(() => parser.feed(b(`$${String(100)}\r\n${'x'.repeat(100)}\r\n`))).toThrow(RespProtocolError)
    expect(parser.pendingBytes).toBe(0) // 丢了，而不是留着继续涨
  })

  it('认不出的类型 → 报错（**不猜**：猜一个解释会把协议错说成数据错）', () => {
    expect(() => createReplyParser().feed(b('%2\r\n'))).toThrow(RespProtocolError)
  })
})
