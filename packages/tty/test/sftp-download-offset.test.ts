/**
 * SFTP 下载的 **offset 续传**在路由层的回归（tty 0.25.0）。
 *
 * ## 为什么要这门测试
 *
 * 宿主侧 `SftpManager.openDownload(spec, path, { offset })` 从 0.19.0 起就支持从任意字节
 * 起读（agent 的 `sftp_read` 分页一直在用），但 `/api/dsh-tty/sftp/download` **没接**——
 * 面板下载一旦断线只能整份重来。这是 ROADMAP 点名的「能力已有、只差接线」那一档。
 *
 * 接线的错法都不是崩溃、而是**悄悄给错东西**，所以必须钉死：
 *   - offset 没透传 → 用户以为在续传，实际从 0 开始（拼出来的文件对，进度条却从 0 跳）；
 *   - 206 的 `content-length` 仍报**整文件长度** → 客户端读到一半就 timeout；
 *   - offset ≥ 文件大小仍回 200 空体 → 客户端把「要的东西已经在本地了」当成「文件是空的」，
 *     静默产出 0 字节文件（比报错严重得多）。
 *
 * 覆盖：offset 透传到 `createReadStream({start})`、200/206 状态行、content-length 与
 * content-range 的口径、越界 416。
 */
import { Readable, Writable } from 'node:stream'
import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply } from '../src/index.js'

const h = vi.hoisted(() => ({ factory: null as null | (() => unknown) }))
vi.mock('ssh2', () => ({
  Client: class {
    constructor() {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return h.factory!()
    }
  },
}))

/** 假 SFTP：只有路由这条链路要用的那几件事（stat / createReadStream / realpath）。 */
class FakeSftp extends EventEmitter {
  nodes = new Map<string, { kind: 'file' | 'dir'; size: number }>()
  readStreams: Array<{ path: string; opts: Record<string, unknown> | undefined; stream: Readable }> = []
  /** stat 的延迟兑现开关（造「stat 挂起」用不着，这里留作将来）。 */
  stat(path: string, cb: (error: Error | null, stats?: unknown) => void): void {
    const node = this.nodes.get(path)
    if (node === undefined) {
      cb(Object.assign(new Error('No such file'), { code: 2 }))
      return
    }
    cb(null, {
      isDirectory: () => node.kind === 'dir',
      isFile: () => node.kind === 'file',
      isSymbolicLink: () => false,
      size: node.size,
    })
  }
  createReadStream(path: string, opts?: Record<string, unknown>): Readable {
    const stream = Readable.from([Buffer.from('hello')])
    this.readStreams.push({ path, opts, stream })
    return stream
  }
  realpath(path: string, cb: (error: Error | null, resolved?: string) => void): void {
    cb(null, path)
  }
}

class FakeClient extends EventEmitter {
  ended = false
  sftpImpl: FakeSftp | null = null
  /**
   * 拨号即「就绪」：SftpManager.acquire 在 `prepareSshConnect` 之后才注册 'ready' 处理器，
   * 所以 `connect()` 里**必须异步**补一次 emit——同步 emit 会落在注册之前，acquire 就
   * 永远等不到 ready（那正是第一版 harness 的表现：整个用例挂到超时）。
   */
  connect(): void {
    setTimeout(() => this.emit('ready'), 0)
  }
  end(): void {
    this.ended = true
  }
  sftp(cb: (error: Error | null, sftp?: FakeSftp) => void): void {
    cb(null, this.sftpImpl ?? new FakeSftp())
  }
}

interface FakeRoute {
  kind: string
  path: string
  handler: (req: unknown, res: unknown) => Promise<void>
}

/**
 * 假响应 = **真的 Writable** + 状态行/头记录。
 *
 * 为什么不能只做几个鸭子方法：下载路由走 `stream.pipe(res)`，而 `pipe` 需要
 * `dest.on` / `once` / `emit` / `write` / `end` 齐全——只给 `on()` 会报
 * `dest.once is not a function`，被路由的 catch 兜成 500（第一版 harness 的现场，
 * 表现为「所有下载都 500」，很容易误读成路由坏了）。
 */
class FakeRes extends Writable {
  status = 0
  headers: Record<string, string> = {}
  chunks: Buffer[] = []
  text: string | undefined

  constructor() {
    super()
    // 收集 pipe 进来的字节（Writable 的 _write）
    this.on('finish', () => {
      this.text = Buffer.concat(this.chunks).toString()
    })
  }

  writeHead(status: number, headers?: Record<string, string>): void {
    this.status = status
    if (headers !== undefined) this.headers = headers
  }

  override _write(chunk: Buffer, _enc: BufferEncoding, cb: (error?: Error | null) => void): void {
    this.chunks.push(Buffer.from(chunk))
    cb()
  }

  /** 路由对 416/400 走 `res.end(string)`——string 不进 _write，单独记下。 */
  override end(body?: string | Buffer | (() => void), enc?: BufferEncoding, cb?: () => void): this {
    if (typeof body === 'string') this.text = body
    else if (typeof body === 'function') return super.end(body)
    return super.end(body as Buffer | undefined, enc, cb)
  }
}

function makeRes(): FakeRes {
  return new FakeRes()
}

/** 挂载插件并取出 SFTP 前缀路由（只给这条路要用的假件）。 */
function mountSftpRoute(): (req: unknown, res: FakeRes) => Promise<void> {
  const routes: FakeRoute[] = []
  const sftp = new FakeSftp()
  const makeChild = (names: string[]): Record<string, unknown> => {
    const child: Record<string, unknown> = {
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
      effect: (callback: () => unknown) => {
        callback()
        return () => {}
      },
      inject: (childNames: string[], cb: (ctx: unknown) => void) => {
        cb(makeChild(childNames))
        return () => {}
      },
      on: () => () => {},
      events: { on: () => () => {} },
      get: () => undefined,
    }
    if (names.includes('webServer')) {
      child.webServer = {
        register: (route: FakeRoute) => {
          routes.push(route)
          return () => {}
        },
        registerUpgrade: () => () => {},
      }
    }
    if (names.includes('settings')) child.settings = { describe: () => [], update: async () => {}, configure: () => () => {} }
    if (names.includes('systemPrompt')) child.systemPrompt = { section: () => () => {}, context: () => () => {} }
    if (names.includes('credentials')) child.credentials = { resolve: async () => ({ value: undefined }) }
    return child
  }
  const root = makeChild([])
  root.inject = (names: string[], cb: (ctx: unknown) => void) => {
    cb(makeChild(names))
    return () => {}
  }
  h.factory = () => {
    const client = new FakeClient()
    client.sftpImpl = sftp
    return client
  }
  ;(apply as unknown as (ctx: unknown, config: unknown) => void)(root, {})
  const route = routes.find((item) => item.path === '/api/dsh-tty/sftp')
  if (route === undefined) throw new Error('未注册 /api/dsh-tty/sftp 路由')
  // 把假 SFTP 暴露给用例（设置文件大小等）
  ;(route.handler as unknown as { __sftp?: FakeSftp }).__sftp = sftp
  return route.handler
}

function makeReq(body: unknown, url = '/api/dsh-tty/sftp/download'): unknown {
  const payload = JSON.stringify(body)
  return {
    method: 'POST',
    url,
    headers: { host: '127.0.0.1:3080', 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' },
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(payload)
    },
  }
}

/** 收集 pipe 出去的字节（响应对象是假的，直接等流结束）。 */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 30))
}

const SPEC = { host: '203.0.113.9', port: 22, username: 'u', auth: 'password', password: 'pw' }

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /sftp/download 的 offset 续传（0.25.0）', () => {
  it('不带 offset → 200，content-length = 整个文件，读流不带 start', async () => {
    const handler = mountSftpRoute()
    const sftp = (handler as unknown as { __sftp: FakeSftp }).__sftp
    sftp.nodes.set('/f.bin', { kind: 'file', size: 4096 })
    const res = makeRes()
    await handler(makeReq({ ...SPEC, path: '/f.bin' }), res)
    expect(res.status).toBe(200)
    expect(res.headers['content-length']).toBe('4096')
    expect(res.headers['content-range']).toBeUndefined()
    expect(sftp.readStreams.at(-1)).toMatchObject({ path: '/f.bin', opts: undefined })
  })

  it('带 offset → 206 + content-range，读流从该字节起，content-length = 剩余长度', async () => {
    const handler = mountSftpRoute()
    const sftp = (handler as unknown as { __sftp: FakeSftp }).__sftp
    sftp.nodes.set('/f.bin', { kind: 'file', size: 4096 })
    const res = makeRes()
    await handler(makeReq({ ...SPEC, path: '/f.bin', offset: 1000 }), res)
    expect(res.status).toBe(206)
    expect(res.headers['content-range']).toBe('bytes 1000-4095/4096')
    // 关键：content-length 是**剩余**（3096），不是整文件（4096）——后者会让浏览器等满 4096 字节
    expect(res.headers['content-length']).toBe('3096')
    expect(sftp.readStreams.at(-1)).toMatchObject({ path: '/f.bin', opts: { start: 1000 } })
  })

  it('offset = 0 与不带等价（200 而不是 206——不是片段）', async () => {
    const handler = mountSftpRoute()
    const sftp = (handler as unknown as { __sftp: FakeSftp }).__sftp
    sftp.nodes.set('/f.bin', { kind: 'file', size: 100 })
    const res = makeRes()
    await handler(makeReq({ ...SPEC, path: '/f.bin', offset: 0 }), res)
    expect(res.status).toBe(200)
    expect(res.headers['content-range']).toBeUndefined()
  })

  it('offset ≥ 文件大小 → 416 且明确说明（不许回 0 字节的 200）', async () => {
    const handler = mountSftpRoute()
    const sftp = (handler as unknown as { __sftp: FakeSftp }).__sftp
    sftp.nodes.set('/f.bin', { kind: 'file', size: 100 })
    const res = makeRes()
    await handler(makeReq({ ...SPEC, path: '/f.bin', offset: 100 }), res)
    expect(res.status).toBe(416)
    expect(res.headers['content-range']).toBe('bytes */100')
    expect(String(res.text)).toContain('100')
    /*
     * 越界时 `openDownload` 已经开了读流（size 是它 stat 出来的，路由没法更早知道），
     * 所以这里钉的是**它被销毁了**——不销毁就会一直占着连接池的一条通道，
     * 而 416 之后没人再读它（泄漏而非崩溃，正是最难发现的那种）。
     */
    expect(sftp.readStreams).toHaveLength(1)
    expect(sftp.readStreams[0].stream.destroyed).toBe(true)
  })

  it('非法 offset（负数 / 小数 / 字符串）→ 400，不去读流', async () => {
    const handler = mountSftpRoute()
    const sftp = (handler as unknown as { __sftp: FakeSftp }).__sftp
    sftp.nodes.set('/f.bin', { kind: 'file', size: 100 })
    for (const offset of [-1, 1.5, 'abc']) {
      const res = makeRes()
      await handler(makeReq({ ...SPEC, path: '/f.bin', offset }), res)
      expect(res.status, `offset=${String(offset)}`).toBe(400)
      expect(String(res.text)).toContain('offset')
    }
    expect(sftp.readStreams).toHaveLength(0)
  })

  it('offset 越界与「路径不存在」分得开（416 vs 404）', async () => {
    const handler = mountSftpRoute()
    const sftp = (handler as unknown as { __sftp: FakeSftp }).__sftp
    sftp.nodes.set('/f.bin', { kind: 'file', size: 10 })
    const missing = makeRes()
    await handler(makeReq({ ...SPEC, path: '/nope.bin' }), missing)
    expect(missing.status).toBe(404)
  })

  it('响应体是文件字节（流真的 pipe 出去）', async () => {
    const handler = mountSftpRoute()
    const sftp = (handler as unknown as { __sftp: FakeSftp }).__sftp
    sftp.nodes.set('/f.bin', { kind: 'file', size: 5 })
    const res = makeRes()
    await handler(makeReq({ ...SPEC, path: '/f.bin' }), res)
    await settle()
    expect(Buffer.concat(res.chunks).toString()).toBe('hello')
  })
})
