/**
 * 极简 RESP 客户端编解码（零依赖）。
 *
 * ## 为什么自写而不是装 `ioredis`
 *
 * ① 规矩：**引擎驱动一律可选、本包 `dependencies` 里一个驱动都没有**（见 `docs/devdata-plan.md`
 *   §2.4）；② RESP 本身很小（本文件就是全部），值不上一个依赖；
 * ③ 这套件要的不是一个完整客户端，而是「**发一条已裁决过的命令、把回复解析出来**」。
 *
 * ## 这里真正难的地方（也是本文件为什么值得单测）
 *
 * - **回复必须按字节解析**：bulk 的长度是**字节数**，而多字节字符可能跨 TCP 分块——先 `toString('utf8')`
 *   再切会把字符切坏；
 * - **一次 read 不等于一条回复**：可能半条，也可能两条；
 * - **`null` 与空串不是一回事**：`$-1\r\n`（键不存在）与 `$0\r\n\r\n`（空值）语义不同，
 *   合成一个会让上层没法区分「没有这个键」和「值就是空」；
 * - **错误是回复不是异常**：`-ERR ...` 要原样交回上层（它决定怎么报给 agent），不要在这里抛。
 *
 * 本文件**不连任何东西**（纯函数 + 一个增量解析器），所以能在没有 Redis 的情况下被完整测试。
 */

/** 一条 RESP 回复。 */
export type RespReply =
  | { kind: 'simple'; value: string }
  /** Redis 返回的错误（**是回复，不是异常**）。 */
  | { kind: 'error'; value: string }
  | { kind: 'integer'; value: number }
  /** `null` = 键不存在（`$-1`）；空串 = 值就是空（`$0`）。**两者不能合并**。 */
  | { kind: 'bulk'; value: string | null }
  | { kind: 'array'; value: RespReply[] | null }

/** 把一条命令编成 RESP 数组（客户端发命令的标准形态，不用 inline 以免转义问题）。 */
export function encodeCommand(parts: readonly string[]): Buffer {
  const chunks: Buffer[] = [Buffer.from(`*${String(parts.length)}\r\n`, 'utf8')]
  for (const part of parts) {
    const bytes = Buffer.from(part, 'utf8')
    chunks.push(Buffer.from(`$${String(bytes.length)}\r\n`, 'utf8'), bytes, Buffer.from('\r\n', 'utf8'))
  }
  return Buffer.concat(chunks)
}

/** 解析中的异常（**只用于「这个缓冲区不是合法 RESP」**，不用 Redis 自己的错误回复）。 */
export class RespProtocolError extends Error {}

export interface ReplyParser {
  /** 喂一块数据，返回这次能凑齐的完整回复（可能是 0 条、也可能多条）。 */
  feed(chunk: Buffer): RespReply[]
  /** 缓冲区里还没解析完的字节数（用来报「回复不完整」与做上限判断）。 */
  readonly pendingBytes: number
  /** 缓冲区内容（排障用；**不要**拿去当数据）。 */
  readonly pending: Buffer
}

export interface ReplyParserOptions {
  /**
   * 缓冲区上限（字节）。**必须有**：对面可以是共享环境里的任何东西，
   * 一条不回头的巨型回复会把内存吃光——那不是「慢」，是打挂自己。
   */
  maxBytes?: number
}

const DEFAULT_MAX_BYTES = 8 * 1024 * 1024

/** 找一个以 `\r\n` 结尾的行：返回行内容与下一位置；没找到返回 `null`（= 还没收全）。 */
function readLine(buf: Buffer, from: number): { line: string; next: number } | null {
  const end = buf.indexOf('\r\n', from, 'utf8')
  if (end < 0) return null
  return { line: buf.subarray(from, end).toString('utf8'), next: end + 2 }
}

/**
 * 从 `offset` 处解析一条回复。
 *
 * 返回 `null` = **数据还不够**（半条），调用方应该继续等——**不要**把它当成错误。
 */
function parseAt(buf: Buffer, offset: number): { reply: RespReply; next: number } | null {
  if (offset >= buf.length) return null
  const type = String.fromCharCode(buf[offset] as number)
  const afterType = offset + 1

  if (type === '+' || type === '-' || type === ':') {
    const line = readLine(buf, afterType)
    if (line === null) return null
    if (type === '+') return { reply: { kind: 'simple', value: line.line }, next: line.next }
    if (type === '-') return { reply: { kind: 'error', value: line.line }, next: line.next }
    // 不截断小数或尾随字符，也不把超出 JS 精度的值变成有效观察。
    if (!/^[+-]?\d+$/.test(line.line)) throw new RespProtocolError(`整数回复不是整数：${line.line}`)
    const value = Number(line.line)
    if (!Number.isSafeInteger(value)) throw new RespProtocolError(`整数回复超出安全整数范围：${line.line}`)
    return { reply: { kind: 'integer', value }, next: line.next }
  }

  if (type === '$') {
    const line = readLine(buf, afterType)
    if (line === null) return null
    const length = Number.parseInt(line.line, 10)
    if (!Number.isFinite(length)) throw new RespProtocolError(`bulk 长度不是整数：${line.line}`)
    if (length === -1) return { reply: { kind: 'bulk', value: null }, next: line.next }
    // 长度是**字节数**，所以按字节切片（多字节字符不会被切坏）。
    const end = line.next + length
    if (buf.length < end + 2) return null
    return { reply: { kind: 'bulk', value: buf.subarray(line.next, end).toString('utf8') }, next: end + 2 }
  }

  if (type === '*') {
    const line = readLine(buf, afterType)
    if (line === null) return null
    const count = Number.parseInt(line.line, 10)
    if (!Number.isFinite(count)) throw new RespProtocolError(`数组长度不是整数：${line.line}`)
    if (count === -1) return { reply: { kind: 'array', value: null }, next: line.next }
    const items: RespReply[] = []
    let cursor = line.next
    for (let i = 0; i < count; i += 1) {
      const item = parseAt(buf, cursor)
      if (item === null) return null // 数组还没收全
      items.push(item.reply)
      cursor = item.next
    }
    return { reply: { kind: 'array', value: items }, next: cursor }
  }

  throw new RespProtocolError(`认不出的回复类型：${JSON.stringify(type)}（首字节 0x${(buf[offset] as number).toString(16)}）`)
}

/**
 * 增量解析器：`feed()` 多少给多少，凑齐一条才吐一条。
 *
 * 用法：`feed(socket chunk)`；`pendingBytes > 0` 说明还有半条挂着。
 */
export function createReplyParser(options: ReplyParserOptions = {}): ReplyParser {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  // 显式标成 `Buffer`（= `Buffer<ArrayBufferLike>`）：`subarray` 返回的那个泛型与
  // `Buffer.alloc` 推出来的不是同一个，不标会在赋值处报类型不兼容。
  let buf: Buffer = Buffer.alloc(0)
  return {
    feed(chunk: Buffer): RespReply[] {
      buf = buf.length === 0 ? chunk : Buffer.concat([buf, chunk])
      if (buf.length > maxBytes) {
        buf = Buffer.alloc(0)
        throw new RespProtocolError(
          `回复超过上限 ${String(maxBytes)} 字节（共享环境里的一条巨型回复不该把内存吃光）：已丢弃缓冲，请缩小范围后重试`,
        )
      }
      const out: RespReply[] = []
      let cursor = 0
      for (;;) {
        const parsed = parseAt(buf, cursor)
        if (parsed === null) break
        out.push(parsed.reply)
        cursor = parsed.next
      }
      buf = buf.subarray(cursor)
      return out
    },
    get pendingBytes(): number {
      return buf.length
    },
    get pending(): Buffer {
      return buf
    },
  }
}
