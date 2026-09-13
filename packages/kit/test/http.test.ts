/**
 * @hyzyn/dsh-kit — HTTP 路由辅助的回归测试。
 *
 * isLoopbackRequest 是所有插件数据路由的唯一闸门，断言覆盖 9 份旧副本共同
 * 表达的语义：来源地址、Host（防 DNS rebinding）、sec-fetch-site、Origin 同源。
 * readJsonBody / writeJson 覆盖各包实现取齐后的行为（含失败一律 undefined）。
 */
import { describe, expect, it } from 'vitest'
import { isLoopbackRequest, readJsonBody, writeJson } from '../src/index.js'
import type { ReqLike, ResLike } from '../src/index.js'

/** 构造一份满足形状的请求（默认从回环发起、Host 为本机）。 */
function makeReq(overrides: Partial<ReqLike> = {}): ReqLike {
  return {
    method: 'POST',
    url: '/api/demo',
    headers: { host: '127.0.0.1:3000' },
    socket: { remoteAddress: '127.0.0.1' },
    ...overrides,
  }
}

/** 记录 writeHead / end 的假响应。 */
function makeRes(): ResLike & { status?: number; headers?: Record<string, string>; body?: string } {
  const res: ResLike & { status?: number; headers?: Record<string, string>; body?: string } = {
    writeHead(status, headers) {
      res.status = status
      res.headers = headers
    },
    end(body) {
      res.body = body
    },
  }
  return res
}

/** 把若干 Buffer 包装成 req 需要的异步可迭代流。 */
async function* stream(chunks: Uint8Array[]): AsyncGenerator<Uint8Array> {
  for (const chunk of chunks) yield chunk
}

describe('isLoopbackRequest', () => {
  it('回环地址 + 本机 Host 放行', () => {
    expect(isLoopbackRequest(makeReq())).toBe(true)
    expect(isLoopbackRequest(makeReq({ socket: { remoteAddress: '::1' } }))).toBe(true)
    expect(isLoopbackRequest(makeReq({ socket: { remoteAddress: '::ffff:127.0.0.1' } }))).toBe(true)
    expect(isLoopbackRequest(makeReq({ headers: { host: 'localhost:3000' } }))).toBe(true)
    expect(isLoopbackRequest(makeReq({ headers: { host: '[::1]:3000' } }))).toBe(true)
  })

  it('非回环来源、缺 Host、外部 Host 一律拒绝', () => {
    expect(isLoopbackRequest(makeReq({ socket: { remoteAddress: '192.168.1.5' } }))).toBe(false)
    expect(isLoopbackRequest(makeReq({ socket: { remoteAddress: undefined } }))).toBe(false)
    expect(isLoopbackRequest(makeReq({ headers: {} }))).toBe(false)
    expect(isLoopbackRequest(makeReq({ headers: { host: 'evil.example.com' } }))).toBe(false)
    expect(isLoopbackRequest(makeReq({ headers: { host: 'not a host' } }))).toBe(false)
  })

  it('sec-fetch-site: cross-site 直接拒绝', () => {
    expect(isLoopbackRequest(makeReq({ headers: { host: '127.0.0.1:3000', 'sec-fetch-site': 'cross-site' } }))).toBe(false)
    expect(isLoopbackRequest(makeReq({ headers: { host: '127.0.0.1:3000', 'sec-fetch-site': 'same-origin' } }))).toBe(true)
  })

  it('Origin 缺省（非浏览器客户端）放行；存在时必须与 Host 同源（含端口）', () => {
    expect(isLoopbackRequest(makeReq({ headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' } }))).toBe(true)
    expect(isLoopbackRequest(makeReq({ headers: { host: '127.0.0.1:3000', origin: 'http://localhost:3000' } }))).toBe(false)
    expect(isLoopbackRequest(makeReq({ headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:4000' } }))).toBe(false)
    expect(isLoopbackRequest(makeReq({ headers: { host: '127.0.0.1:3000', origin: 'not a url' } }))).toBe(false)
  })
})

describe('writeJson', () => {
  it('写入基线响应头并 JSON 序列化 body', () => {
    const res = makeRes()
    writeJson(res, 403, { error: 'forbidden: loopback-only' })
    expect(res.status).toBe(403)
    expect(res.headers).toMatchObject({
      'content-type': 'application/json; charset=utf-8',
      'referrer-policy': 'no-referrer',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    })
    expect(res.body).toBe('{"error":"forbidden: loopback-only"}')
  })

  it('headers 参数覆盖单条基线（其余保持）', () => {
    const res = makeRes()
    writeJson(res, 200, { ok: true }, { 'cache-control': 'no-cache' })
    expect(res.headers?.['cache-control']).toBe('no-cache')
    expect(res.headers?.['content-type']).toBe('application/json; charset=utf-8')
  })
})

describe('readJsonBody', () => {
  it('聚合分片并解析对象', async () => {
    const req = makeReq() as ReqLike & AsyncIterable<Uint8Array>
    req[Symbol.asyncIterator] = () => stream([Buffer.from('{"a"'), Buffer.from(':1}')])
    await expect(readJsonBody(req)).resolves.toEqual({ a: 1 })
  })

  it('空 body / 非法 JSON / 非对象结果一律 undefined', async () => {
    const cases = ['', 'not-json', '[]', '"str"', 'null', '42']
    for (const body of cases) {
      const req = makeReq() as ReqLike & AsyncIterable<Uint8Array>
      req[Symbol.asyncIterator] = () => stream([Buffer.from(body)])
      await expect(readJsonBody(req)).resolves.toBeUndefined()
    }
  })

  it('超过 maxBytes 立即放弃（含自定义上限）', async () => {
    const req = makeReq() as ReqLike & AsyncIterable<Uint8Array>
    req[Symbol.asyncIterator] = () => stream([Buffer.from('{"a":1}')])
    await expect(readJsonBody(req, 4)).resolves.toBeUndefined()
    await expect(readJsonBody(req, 64)).resolves.toEqual({ a: 1 })
  })

  it('流读取报错返回 undefined', async () => {
    const req = makeReq() as ReqLike & AsyncIterable<Uint8Array>
    async function* failing(): AsyncGenerator<Uint8Array> {
      throw new Error('socket reset')
    }
    req[Symbol.asyncIterator] = () => failing()
    await expect(readJsonBody(req)).resolves.toBeUndefined()
  })
})
