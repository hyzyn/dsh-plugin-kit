/**
 * 假 Redis 服务（测试夹具）：`node:net` + **独立的**极简请求解析。
 *
 * ## 为什么单独一个文件
 *
 * 它有两个消费者（执行器用例、宿主半体的端到端用例），而两份复制会让「假服务到底怎么理解 RESP」
 * 出现两个版本——被测代码改了帧格式时，两边可能一起错着通过。夹具也必须只有一份。
 *
 * ## 为什么解析要独立写一遍
 *
 * 故意**不借被测代码**的 `createReplyParser`：借了的话，「请求被切错」与「回复被解析错」会同时发生
 * 且互相掩盖。这里的解析器只服务测试（够用就行），但它是**独立实现**。
 *
 * `.ts` 而不是 `.test.ts`：vitest 只把后者当用例文件，前者当普通模块导入。
 */

import { createServer, type Server } from 'node:net'

/** 独立地把客户端发来的 RESP 数组帧切开。 */
export function parseClientFrames(buf: string): { frames: string[][]; rest: string } {
  const frames: string[][] = []
  let cursor = 0
  for (;;) {
    if (buf[cursor] !== '*') break
    const headEnd = buf.indexOf('\r\n', cursor)
    if (headEnd < 0) break
    const count = Number.parseInt(buf.slice(cursor + 1, headEnd), 10)
    let pos = headEnd + 2
    const argv: string[] = []
    let complete = true
    for (let i = 0; i < count; i += 1) {
      if (buf[pos] !== '$') {
        complete = false
        break
      }
      const lenEnd = buf.indexOf('\r\n', pos)
      if (lenEnd < 0) {
        complete = false
        break
      }
      const len = Number.parseInt(buf.slice(pos + 1, lenEnd), 10)
      const start = lenEnd + 2
      if (buf.length < start + len + 2) {
        complete = false
        break
      }
      argv.push(buf.slice(start, start + len))
      pos = start + len + 2
    }
    if (!complete) break
    frames.push(argv)
    cursor = pos
  }
  return { frames, rest: buf.slice(cursor) }
}

export interface FakeRedisServer {
  port: number
  /** 收到过的命令（按到达顺序）。 */
  requests: string[][]
  close: () => Promise<void>
}

/** `respond` 返回字符串就回它；返回 `null` 就**不回**（用来造超时）。 */
export async function startFakeRedis(respond: (argv: string[]) => string | null): Promise<FakeRedisServer> {
  const requests: string[][] = []
  const server: Server = createServer()
  server.on('connection', (socket) => {
    let buf = ''
    socket.on('data', (chunk) => {
      buf += chunk.toString('utf8')
      const { frames, rest } = parseClientFrames(buf)
      buf = rest
      for (const argv of frames) {
        requests.push(argv)
        const reply = respond(argv)
        if (reply !== null) socket.write(reply)
      }
    })
  })
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  return {
    port,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve()
        })
      }),
  }
}

/** 一个够用的小回复集：`PING` → `+PONG`，其他一律 `$5 hello`。 */
export const simpleReplies = (argv: string[]): string => (argv[0] === 'PING' ? '+PONG\r\n' : '$5\r\nhello\r\n')
