/**
 * @hyzyn/dsh-kit — HTTP 路由辅助的回归测试。
 *
 * isLoopbackRequest 是所有插件数据路由的唯一闸门，断言覆盖 9 份旧副本共同
 * 表达的语义：来源地址、Host（防 DNS rebinding）、sec-fetch-site、Origin 同源。
 * readJsonBody / writeJson 覆盖各包实现取齐后的行为（含失败一律 undefined）。
 *
 * 加固档（isLoopbackRequestStrict / hasSameOriginProof / originProofHint，来自
 * docker D31/D32/D80/D110/D139）单列一节：它现在是 docker · tty · dsh-mcp 三个包
 * 共用的那一道闸，所以「拒绝分支」的负例逐条钉在这里，而不是各包各测一份。
 */
import { describe, expect, it, vi } from 'vitest'

/**
 * `node:dns` 必须是假的：加固档只对**主机名 / 别名**才走 DNS，那条分支要能确定性地
 * 验「解析到环回 → 放行」「解析到公网 → 拒绝」「解析失败 → 拒绝（fail closed）」，
 * 真解析会随 CI 网络漂。
 */
const dnsLookup = vi.hoisted(() => vi.fn())
vi.mock('node:dns', () => ({ promises: { lookup: dnsLookup } }))

import {
  hasSameOriginProof,
  isLoopbackAddress,
  isLoopbackRequest,
  isLoopbackRequestStrict,
  originProofHint,
  readJsonBody,
  writeJson,
} from '../src/index.js'
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

describe('isLoopbackAddress（docker D31）', () => {
  it('127/8 全段与 IPv6 等价形式都算环回', () => {
    for (const address of ['127.0.0.1', '127.0.0.2', '127.255.255.254', '::1', '::ffff:127.0.0.1', '::FFFF:127.0.0.1']) {
      expect(isLoopbackAddress(address), address).toBe(true)
    }
  })

  it('非环回与畸形输入一律否', () => {
    // 10.127.0.1 是「127 出现在中间」的反例（私有网段，不用公网字面量当夹具）
    for (const address of [undefined, '', '10.0.0.1', '192.168.1.5', '10.127.0.1', '1270.0.0.1', '::2', 'localhost']) {
      expect(isLoopbackAddress(address), String(address)).toBe(false)
    }
  })
})

describe('isLoopbackRequestStrict（docker D31/D80/D110）', () => {
  it('字面量环回同步判定（保持「第一拍就建流」的时序）', () => {
    const verdict = isLoopbackRequestStrict(makeReq())
    expect(typeof verdict).toBe('boolean')
    expect(verdict).toBe(true)
  })

  it('127/8 全段来源与 Host 都放行（D31：别名 / 非 127.0.0.1 环回不再整面板 403）', () => {
    expect(isLoopbackRequestStrict(makeReq({ socket: { remoteAddress: '127.0.0.2' } }))).toBe(true)
    expect(isLoopbackRequestStrict(makeReq({ headers: { host: '127.0.0.2:3080' } }))).toBe(true)
    expect(isLoopbackRequestStrict(makeReq({ headers: { host: 'localhost:3080' } }))).toBe(true)
    expect(isLoopbackRequestStrict(makeReq({ headers: { host: 'dev.localhost:3080' } }))).toBe(true)
    expect(isLoopbackRequestStrict(makeReq({ headers: { host: 'localhost.:3080' } }))).toBe(true)
  })

  it('非回环来源 / 缺 Host / 外部 Host / 畸形 Host 一律拒', () => {
    expect(isLoopbackRequestStrict(makeReq({ socket: { remoteAddress: '10.1.2.3' } }))).toBe(false)
    expect(isLoopbackRequestStrict(makeReq({ socket: { remoteAddress: undefined } }))).toBe(false)
    expect(isLoopbackRequestStrict(makeReq({ headers: {} }))).toBe(false)
    expect(isLoopbackRequestStrict(makeReq({ headers: { host: 'not a host' } }))).toBe(false)
    // 外部域名要走 DNS，假 DNS 一律回公网 → 拒绝（真解析也应是这个结论）
    dnsLookup.mockResolvedValue([{ address: '203.0.113.9', family: 4 }])
    return Promise.resolve(isLoopbackRequestStrict(makeReq({ headers: { host: 'evil.example.test' } }))).then((verdict) => {
      expect(verdict).toBe(false)
    })
  })

  it('【D80】来源检查排在 DNS 之前：别名 Host + cross-site 必须**同步**拒、一次 DNS 都不打', () => {
    dnsLookup.mockClear()
    const verdict = isLoopbackRequestStrict(makeReq({ headers: { host: '127.0.0.1.nip.io:3080', 'sec-fetch-site': 'cross-site' } }))
    expect(verdict).toBe(false)
    expect(dnsLookup).not.toHaveBeenCalled()
  })

  it('【D80】Origin 不同源同样在 DNS 之前拒', () => {
    dnsLookup.mockClear()
    const verdict = isLoopbackRequestStrict(makeReq({ headers: { host: '127.0.0.1.nip.io:3080', origin: 'http://evil.test' } }))
    expect(verdict).toBe(false)
    expect(dnsLookup).not.toHaveBeenCalled()
  })

  it('别名主机名解析到环回 → 放行（返回 Promise 那一支）', async () => {
    dnsLookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }])
    const verdict = isLoopbackRequestStrict(makeReq({ headers: { host: 'alias-a.test:3080' } }))
    expect(verdict).toBeInstanceOf(Promise)
    await expect(verdict).resolves.toBe(true)
  })

  it('别名主机名解析到公网 → 拒绝；解析失败 / 超时 → 也拒绝（fail closed）', async () => {
    dnsLookup.mockResolvedValue([{ address: '203.0.113.9', family: 4 }])
    await expect(isLoopbackRequestStrict(makeReq({ headers: { host: 'alias-public.test:3080' } }))).resolves.toBe(false)
    dnsLookup.mockRejectedValue(new Error('DNS 解析超时（>500ms）'))
    await expect(isLoopbackRequestStrict(makeReq({ headers: { host: 'alias-broken.test:3080' } }))).resolves.toBe(false)
  })

  it('同步档与加固档并存：同步档仍是老口径（127.0.0.2 拒），加固档放行', () => {
    const req = makeReq({ headers: { host: '127.0.0.2:3080' } })
    expect(isLoopbackRequest(req)).toBe(false)
    expect(isLoopbackRequestStrict(req)).toBe(true)
  })
})

describe('hasSameOriginProof（docker D32/D139）', () => {
  const desktop = { origin: undefined, 'sec-fetch-site': undefined, cookie: 'dsh=host-session' }

  it('Sec-Fetch-Site: same-origin 或同源 Origin 任一成立即放行', () => {
    expect(hasSameOriginProof(makeReq({ headers: { host: '127.0.0.1:3080', 'sec-fetch-site': 'same-origin' } }))).toBe(true)
    expect(hasSameOriginProof(makeReq({ headers: { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080' } }))).toBe(true)
  })

  it('Origin 出现就一律以它为准：不同源 / 空串 / 畸形都拒，**不回落**到 Cookie', () => {
    for (const origin of ['http://127.0.0.1:4000', '', 'not a url', 'http://evil.test']) {
      const headers = { host: '127.0.0.1:3080', origin, cookie: 'dsh=host-session' }
      expect(hasSameOriginProof(makeReq({ headers })), JSON.stringify(origin)).toBe(false)
    }
    // Origin 在但 Host 缺失：无从比对 → 拒
    expect(hasSameOriginProof(makeReq({ headers: { origin: 'http://127.0.0.1:3080', cookie: 'dsh=x' } }))).toBe(false)
  })

  it('【D139】两条证明都缺省 + 宿主 Cookie（桌面壳转发链）放行', () => {
    expect(hasSameOriginProof(makeReq({ headers: { host: '127.0.0.1:3080', ...desktop } }))).toBe(true)
  })

  it('拒绝分支：都缺省且无 Cookie / Cookie 只有空白 → 拒', () => {
    expect(hasSameOriginProof(makeReq({ headers: { host: '127.0.0.1:3080', origin: undefined, 'sec-fetch-site': undefined } }))).toBe(false)
    expect(hasSameOriginProof(makeReq({ headers: { host: '127.0.0.1:3080', origin: undefined, 'sec-fetch-site': undefined, cookie: '   ' } }))).toBe(false)
  })

  it('cross-site 不由本函数拦（那是 loopback 围栏的活），但带上 Cookie 也就等于给了证明', () => {
    const headers = { host: '127.0.0.1:3080', 'sec-fetch-site': 'cross-site', cookie: 'dsh=x' }
    expect(hasSameOriginProof(makeReq({ headers }))).toBe(true)
    // 而围栏在前：同一个请求整体仍被拒
    expect(isLoopbackRequestStrict(makeReq({ headers }))).toBe(false)
  })
})

describe('originProofHint（docker D139）', () => {
  it('只报三个头的「有 / 无」，绝不落 Cookie 的值', () => {
    const hint = originProofHint(makeReq({ headers: { host: '127.0.0.1:3080', cookie: 'dsh=host-session' } }))
    expect(hint).toBe('origin=无 sec-fetch-site=无 cookie=有')
    expect(hint).not.toContain('host-session')
  })

  it('逐个头区分「有」与「空串」（空串等同于无）', () => {
    const headers = { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080', 'sec-fetch-site': '', cookie: '' }
    expect(originProofHint(makeReq({ headers }))).toBe('origin=有 sec-fetch-site=无 cookie=无')
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
