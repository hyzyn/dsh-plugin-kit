/**
 * @hyzyn/dsh-loglens — 出站围栏（src/net.ts）的用例。
 *
 * 围栏这种东西**必须有反例**：光测「内网能通」等于没测。这里锁的是四类：
 *   1. **解析之后的 IP 才是判据**：同一个地址的别名 / 十六进制 / IPv4-mapped 写法都要落进同一档
 *      （localhost、::ffff:a9fe:a9fe、0x7f.0.0.1 都是实测过的绕过形态）；
 *   2. **重定向不跟随**：来源回 302 时请求**不能**打到 Location 上（用例直接数那台服务器的请求数）；
 *   3. **公网默认拒、按来源可开**：allowPublic 是来源级开关，开了才放行；
 *   4. **体积与超时**：对面给多少读多少是会出事的，两条都要有上限。
 *
 * 假服务器只监听 127.0.0.1（回环是允许面），域名解析一律走注入的 lookupImpl——
 * 用例不该依赖真 DNS，也不该在别人机器上解析出别的结果。
 */
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import {
  LoglensNetError,
  NET_MAX_RESPONSE_BYTES,
  assertReachable,
  classifyAddress,
  isHardBlockedTier,
  isIpLiteral,
  requestJson,
  resolveHost,
  sanitizeUrl,
} from '../src/net.js'
import type { LookupFn } from '../src/net.js'
import { createElasticBackend } from '../src/backends/elastic.js'
import { createLokiBackend } from '../src/backends/loki.js'
import type { LogBackend, NormalizedQuery } from '../src/backends/types.js'
import type { LoglensTarget } from '../src/config.js'
import { normalizeQuery } from '../src/query.js'
import type { QueryInput } from '../src/query.js'

const servers: Server[] = []

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections()
    await new Promise<void>((resolve) => { server.close(() => { resolve() }) })
  }
})

interface Outcome {
  status?: number
  headers?: Record<string, string>
  raw?: string
  body?: unknown
  /** 声明一个 content-length（测「不必真读完就提前拒」那一支）。 */
  declaredLength?: number
  never?: boolean
}

interface Fake {
  url: string
  port: number
  requests: string[]
}

async function startFake(handler: (path: string) => Outcome): Promise<Fake> {
  const requests: string[] = []
  const server = createServer((req, res) => {
    requests.push(req.url === undefined ? '/' : req.url)
    const outcome = handler(req.url === undefined ? '/' : req.url)
    if (outcome.never === true) return
    const headers: Record<string, string> = { 'content-type': 'application/json', ...(outcome.headers ?? {}) }
    if (outcome.declaredLength !== undefined) headers['content-length'] = String(outcome.declaredLength)
    res.writeHead(outcome.status === undefined ? 200 : outcome.status, headers)
    res.end(outcome.raw === undefined ? JSON.stringify(outcome.body === undefined ? {} : outcome.body) : outcome.raw)
  })
  servers.push(server)
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', () => { resolve() }) })
  const port = (server.address() as AddressInfo).port
  return { url: 'http://127.0.0.1:' + String(port), port, requests }
}

/** 拿一个「刚关掉、没人监听」的端口：连不上是确定的，不会碰运气。 */
async function closedPortUrl(): Promise<string> {
  const fake = await startFake(() => ({ body: {} }))
  const port = fake.port
  const server = servers.pop()
  if (server === undefined) throw new Error('假服务器没了')
  await new Promise<void>((resolve) => { server.close(() => { resolve() }) })
  return 'http://127.0.0.1:' + String(port)
}

/** 注入一个「这个域名解析到这些地址」的解析器，并记下它被问过几次。 */
function lookupOf(table: Record<string, string[]>): { impl: LookupFn; asked: string[] } {
  const asked: string[] = []
  const impl: LookupFn = async (host: string): Promise<string[]> => {
    asked.push(host)
    const addresses = table[host]
    if (addresses === undefined) throw new Error('no such host')
    return addresses
  }
  return { impl, asked }
}

const LABEL = '[test]'

async function codeOf(url: string, options: { allowPublic?: boolean; lookupImpl?: LookupFn; lookupTimeoutMs?: number } = {}): Promise<string> {
  try {
    await assertReachable(url, { label: LABEL, ...options })
    return 'ok'
  } catch (error) {
    return error instanceof LoglensNetError ? error.code : 'not-a-fence-error'
  }
}

describe('地址分档：判据是解析之后的 IP', () => {
  it('回环 / 私网 / 链路本地 / 元数据 / 保留 / 公网六档各就各位', () => {
    expect(classifyAddress('127.0.0.1')).toBe('loopback')
    expect(classifyAddress('127.13.9.2')).toBe('loopback')
    expect(classifyAddress('::1')).toBe('loopback')
    expect(classifyAddress('10.1.2.3')).toBe('private')
    expect(classifyAddress('172.16.0.1')).toBe('private')
    expect(classifyAddress('172.31.255.255')).toBe('private')
    expect(classifyAddress('192.168.1.9')).toBe('private')
    expect(classifyAddress('100.64.0.1')).toBe('private')
    expect(classifyAddress('fc00::1')).toBe('private')
    expect(classifyAddress('169.254.1.1')).toBe('link-local')
    expect(classifyAddress('fe80::1')).toBe('link-local')
    expect(classifyAddress('169.254.169.254')).toBe('metadata')
    expect(classifyAddress('169.254.170.2')).toBe('metadata')
    expect(classifyAddress('fd00:ec2::254')).toBe('metadata')
    expect(classifyAddress('0.0.0.0')).toBe('other')
    expect(classifyAddress('224.0.0.1')).toBe('other')
    expect(classifyAddress('255.255.255.255')).toBe('other')
    expect(classifyAddress('ff02::1')).toBe('other')
    // 公网样本一律用 RFC 5737 文档段（本仓有 no-public-ip 闸门：真公网地址不得入库）
    expect(classifyAddress('198.51.100.7')).toBe('public')
    expect(classifyAddress('192.0.2.10')).toBe('public')
    expect(classifyAddress('2001:db8::1')).toBe('public')
  })

  it('IPv4-mapped IPv6 还原成 IPv4 再判（点分与十六进制两种写法都认）', () => {
    expect(classifyAddress('::ffff:127.0.0.1')).toBe('loopback')
    expect(classifyAddress('::ffff:169.254.169.254')).toBe('metadata')
    // URL 会把上面那种写法归一成下面这种（实测），所以只认点分是不够的
    expect(classifyAddress('::ffff:a9fe:a9fe')).toBe('metadata')
    expect(classifyAddress('::ffff:7f00:1')).toBe('loopback')
    expect(classifyAddress('[fe80::1]')).toBe('link-local')
  })

  it('硬拒档只有链路本地 / 元数据 / 保留三档（回环与私网是允许面）', () => {
    expect(isHardBlockedTier('link-local')).toBe(true)
    expect(isHardBlockedTier('metadata')).toBe(true)
    expect(isHardBlockedTier('other')).toBe(true)
    expect(isHardBlockedTier('loopback')).toBe(false)
    expect(isHardBlockedTier('private')).toBe(false)
    expect(isHardBlockedTier('public')).toBe(false)
  })

  it('怪写法的 IPv4 先被 URL 归一化，于是照样认得出来（0x7f / 十进制 / 少段）', () => {
    expect(new URL('http://0x7f.0.0.1:3100').hostname).toBe('127.0.0.1')
    expect(new URL('http://2130706433/').hostname).toBe('127.0.0.1')
    expect(new URL('http://127.1/').hostname).toBe('127.0.0.1')
    expect(isIpLiteral('127.0.0.1')).toBe(true)
    expect(isIpLiteral('::1')).toBe(true)
    expect(isIpLiteral('logs.internal')).toBe(false)
  })
})

describe('解析与判定：字面量、别名、注入的解析结果', () => {
  it('回环与私网放行（私网是允许面：内网日志就是这个插件的用法）', async () => {
    expect(await codeOf('http://127.0.0.1:3100/loki')).toBe('ok')
    expect(await codeOf('http://10.0.0.5:9200')).toBe('ok')
    expect(await codeOf('http://192.168.1.9:19200/app-logs-*')).toBe('ok')
    expect(await codeOf('http://172.16.5.9:19200/app-logs-*')).toBe('ok')
  })

  it('localhost 与 *.localhost 不打 DNS（RFC 6761 保留给回环）', async () => {
    const asked: string[] = []
    const impl: LookupFn = async (host: string): Promise<string[]> => { asked.push(host); throw new Error('不该问我') }
    expect(await codeOf('http://localhost:3100', { lookupImpl: impl })).toBe('ok')
    expect(await codeOf('http://logs.localhost:3100', { lookupImpl: impl })).toBe('ok')
    expect(asked).toEqual([])
  })

  it('字面量链路本地 / 元数据：直接拒，且文案点名地址', async () => {
    const error = await assertReachable('http://169.254.169.254/latest/meta-data/', { label: LABEL }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(LoglensNetError)
    expect((error as LoglensNetError).code).toBe('blocked_address')
    expect((error as LoglensNetError).message).toContain('169.254.169.254')
    expect(await codeOf('http://[fe80::1]:3100')).toBe('blocked_address')
  })

  it('域名解析到元数据地址会被挡下——这正是字面量校验看不到的那条路', async () => {
    const { impl, asked } = lookupOf({ 'logs.internal': ['169.254.169.254'] })
    expect(await codeOf('http://logs.internal:3100/loki', { lookupImpl: impl })).toBe('blocked_address')
    expect(asked).toEqual(['logs.internal'])
  })

  it('某个主机名只要解析出一个不能打的地址就整体拒（多地址时不能只看第一个）', async () => {
    const dual = lookupOf({ 'dual.internal': ['10.0.0.7', '203.0.113.9'] })
    expect(await codeOf('http://dual.internal:3100', { lookupImpl: dual.impl })).toBe('public_address')
    const mixed = lookupOf({ 'odd.internal': ['10.0.0.7', '169.254.169.254'] })
    expect(await codeOf('http://odd.internal:3100', { lookupImpl: mixed.impl })).toBe('blocked_address')
  })

  it('内网装在非 RFC 1918 网段（真机上就有这种环境）也按公网档拦——文案要同时给两种解释', async () => {
    /*
     * 现场（2026-10-11 真机）：用户的内网日志服务器是一台 172.172.x.x。
     * RFC 1918 只覆盖 172.16/12（也就是 172.16~172.31），**172.172 不在里面**——
     * 于是字面量看着像「内网」，判据却只能按公网档走。这不是纸面情形：中文企业内网
     * 用公网段不 NAT 的做法很常见。夹具按本仓规矩用 RFC 5737 文档段占位。
     */
    const error = await assertReachable('http://192.0.2.10:19200/app-logs-*', { label: LABEL })
      .catch((caught: unknown) => caught)
    expect((error as LoglensNetError).code).toBe('public_address')
    expect((error as LoglensNetError).message).toContain('192.0.2.10')
    expect((error as LoglensNetError).message).toContain('非 RFC 1918 网段')
    expect((error as LoglensNetError).message).toContain('allowPublic')
  })

  it('公网默认拒，这条来源显式打开 allowPublic 才放行', async () => {
    const { impl } = lookupOf({ 'logs.example.com': ['203.0.113.9'] })
    expect(await codeOf('https://logs.example.com:9200', { lookupImpl: impl })).toBe('public_address')
    const allowed = await assertReachable('https://logs.example.com:9200', { label: LABEL, lookupImpl: impl, allowPublic: true })
    expect(allowed.addresses).toEqual(['203.0.113.9'])
    // 开关只放宽公网这一档：链路本地仍然没有豁免
    const metadata = lookupOf({ 'sneaky.example.com': ['169.254.169.254'] })
    expect(await codeOf('https://sneaky.example.com', { lookupImpl: metadata.impl, allowPublic: true })).toBe('blocked_address')
  })

  it('解析失败 / 超时 / 没有记录都归 dns_failed（而不是放行）', async () => {
    const failing: LookupFn = async () => { throw new Error('ENOTFOUND') }
    expect(await codeOf('http://nowhere.internal:3100', { lookupImpl: failing })).toBe('dns_failed')
    const empty: LookupFn = async () => []
    expect(await codeOf('http://empty.internal:3100', { lookupImpl: empty })).toBe('dns_failed')
    const hanging: LookupFn = async () => new Promise<string[]>(() => {})
    expect(await codeOf('http://hang.internal:3100', { lookupImpl: hanging, lookupTimeoutMs: 20 })).toBe('dns_failed')
  })

  it('地址与协议不对也拒（不是合法 URL / 不是 http(s)）', async () => {
    expect(await codeOf('not-a-url')).toBe('transport')
    expect(await codeOf('file:///etc/passwd')).toBe('blocked_address')
    expect(await codeOf('ftp://internal:21')).toBe('blocked_address')
  })

  it('文案里不出现凭据（有密码的地址要先去凭据再报错）', async () => {
    const error = await assertReachable('http://user:secret@169.254.169.254/', { label: LABEL }).catch((caught: unknown) => caught)
    expect((error as LoglensNetError).message).not.toContain('secret')
    expect(sanitizeUrl('http://user:secret@10.0.0.1:9200/x')).toBe('http://10.0.0.1:9200/x')
    expect(sanitizeUrl('http://10.0.0.1:9200/x')).toBe('http://10.0.0.1:9200/x')
  })

  it('resolveHost 把结尾的点去掉（FQDN 写法不该绕开判据）', async () => {
    const { impl, asked } = lookupOf({ 'logs.internal': ['10.0.0.7'] })
    expect(await resolveHost('logs.internal.', { label: LABEL, lookupImpl: impl })).toEqual(['10.0.0.7'])
    expect(asked).toEqual(['logs.internal'])
  })
})

describe('一次请求：不跟随重定向 / 非 2xx 原样回 / 体积与超时', () => {
  it('正常 200：解析出 body', async () => {
    const fake = await startFake(() => ({ body: { ok: 1 } }))
    const response = await requestJson({ fetchImpl: fetch, label: LABEL, url: fake.url + '/x', timeoutMs: 5_000 })
    expect(response).toMatchObject({ ok: true, status: 200, body: { ok: 1 } })
  })

  it('302 不跟随：请求只打到原地址，错误里回显 Location', async () => {
    const decoy = await startFake(() => ({ body: { reached: true } }))
    const fake = await startFake((path) => (path === '/go'
      ? { status: 302, headers: { location: decoy.url + '/secret' } }
      : { body: {} }))
    const error = await requestJson({ fetchImpl: fetch, label: LABEL, url: fake.url + '/go', timeoutMs: 5_000 })
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(LoglensNetError)
    expect((error as LoglensNetError).code).toBe('redirect')
    expect((error as LoglensNetError).message).toContain('302')
    expect((error as LoglensNetError).message).toContain(decoy.url + '/secret')
    expect(fake.requests).toEqual(['/go'])
    // 一次 302 就能把请求带出白名单：这里直接证明**没**打到对面
    expect(decoy.requests).toEqual([])
  })

  it('非 2xx 不抛：status / text / body 原样交给适配器（ES 的游标过期判定要读它）', async () => {
    const fake = await startFake(() => ({ status: 404, body: { error: { type: 'search_context_missing_exception' } } }))
    const response = await requestJson({ fetchImpl: fetch, label: LABEL, url: fake.url + '/_search', timeoutMs: 5_000 })
    expect(response.ok).toBe(false)
    expect(response.status).toBe(404)
    expect(response.body).toEqual({ error: { type: 'search_context_missing_exception' } })
  })

  it('声明的 content-length 超限就提前拒（不必真把对面读完）', async () => {
    const fake = await startFake(() => ({ body: { big: true }, declaredLength: NET_MAX_RESPONSE_BYTES + 1 }))
    const error = await requestJson({ fetchImpl: fetch, label: LABEL, url: fake.url + '/x', timeoutMs: 5_000 })
      .catch((caught: unknown) => caught)
    expect((error as LoglensNetError).code).toBe('too_large')
  })

  it('边读边数：没声明长度也拦得住（超限即掐断，不静默留半份 JSON）', async () => {
    const fake = await startFake(() => ({ raw: 'x'.repeat(4_096) }))
    const error = await requestJson({ fetchImpl: fetch, label: LABEL, url: fake.url + '/x', timeoutMs: 5_000, maxBytes: 1_024 })
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(LoglensNetError)
    expect((error as LoglensNetError).code).toBe('too_large')
    expect((error as LoglensNetError).message).toContain('1024')
  })

  it('超时报 timeout（对面不答也不该把一次查询挂死）', async () => {
    const fake = await startFake(() => ({ never: true }))
    const error = await requestJson({ fetchImpl: fetch, label: LABEL, url: fake.url + '/x', timeoutMs: 50 })
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(LoglensNetError)
    expect((error as LoglensNetError).code).toBe('timeout')
  })

  it('连不上报 transport（端口没人监听）', async () => {
    const closed = await closedPortUrl()
    const error = await requestJson({ fetchImpl: fetch, label: LABEL, url: closed + '/x', timeoutMs: 5_000 })
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(LoglensNetError)
    expect((error as LoglensNetError).code).toBe('transport')
  })
})

describe('适配器确实走在围栏后面（不是一个没人用的模块）', () => {
  const NOW = 1_760_000_000_000
  const QUERY: QueryInput = { targetId: 'x', q: '', from: NOW - 60_000, to: NOW, limit: 10 }

  function normalizedFor(backend: LogBackend): NormalizedQuery {
    const outcome = normalizeQuery(QUERY, backend.capabilities())
    if (!outcome.ok) throw new Error(outcome.error)
    return outcome.query
  }

  function targetOf(url: string, kind: 'loki' | 'elasticsearch', extra: Partial<LoglensTarget> = {}): LoglensTarget {
    return { id: 'x', kind, label: 'x', url, ...extra }
  }

  const lokiBody = { status: 'success', data: { resultType: 'streams', result: [] } }
  const esBody = { timed_out: false, _shards: { failed: 0 }, hits: { total: { value: 0, relation: 'eq' }, hits: [] } }

  it('Loki 的查询与探测都被围栏挡住（域名解析到元数据地址）', async () => {
    const { impl } = lookupOf({ 'logs.internal': ['169.254.169.254'] })
    const backend = createLokiBackend({ lookupImpl: impl })
    const target = targetOf('http://logs.internal:3100', 'loki')
    await expect(backend.query(normalizedFor(backend), target)).rejects.toThrow('出站围栏')
    const health = await backend.health(target)
    expect(health.ok).toBe(false)
    expect(health.detail).toContain('出站围栏')
  })

  it('ES 的查询同样被挡住，文案是围栏的话（不是一句 fetch failed）', async () => {
    const { impl } = lookupOf({ 'es.internal': ['169.254.169.254'] })
    const backend = createElasticBackend({ flavor: 'es', lookupImpl: impl })
    const target = targetOf('http://es.internal:9200/logs-*', 'elasticsearch')
    await expect(backend.query(normalizedFor(backend), target)).rejects.toThrow('出站围栏')
    // PIT 也要过围栏：开 PIT 是查询的第一步，它被拦下时不该走到 _search
    const health = await backend.health(target)
    expect(health.ok).toBe(false)
    expect(health.detail).toContain('出站围栏')
  })

  it('公网来源：默认拒；这条来源打开 allowPublic 后请求才真的发出去', async () => {
    const { impl } = lookupOf({ 'logs.example.com': ['203.0.113.9'] })
    const calls: string[] = []
    const fetchImpl = async (input: string | URL | Request): Promise<Response> => {
      calls.push(String(input))
      return new Response(JSON.stringify(lokiBody), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    const backend = createLokiBackend({ lookupImpl: impl, fetchImpl: fetchImpl as typeof fetch })
    const url = 'https://logs.example.com:3100'

    await expect(backend.query(normalizedFor(backend), targetOf(url, 'loki'))).rejects.toThrow('allowPublic')
    expect(calls).toEqual([])

    const result = await backend.query(normalizedFor(backend), targetOf(url, 'loki', { allowPublic: true }))
    expect(result.counts.returned).toBe(0)
    expect(calls).toEqual([url + '/loki/api/v1/query_range?query=%7B%7D&start=' + String((NOW - 60_000) * 1_000_000) + '&end=' + String(NOW * 1_000_000) + '&limit=10&direction=backward'])
  })

  it('ES 来源打开 allowPublic 后同样能发出去（开关走的是一条来源，不是一个插件）', async () => {
    const { impl } = lookupOf({ 'es.example.com': ['203.0.113.9'] })
    const calls: string[] = []
    const fetchImpl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls.push(String(input))
      const body = String(input).includes('/_pit')
        ? { pit_id: 'pit-1' }
        : (init?.method === 'DELETE' ? { succeeded: true } : esBody)
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    const backend = createElasticBackend({ flavor: 'es', lookupImpl: impl, fetchImpl: fetchImpl as typeof fetch })
    const url = 'https://es.example.com:9200/logs-*'

    await expect(backend.query(normalizedFor(backend), targetOf(url, 'elasticsearch'))).rejects.toThrow('allowPublic')
    expect(calls).toEqual([])

    const result = await backend.query(normalizedFor(backend), targetOf(url, 'elasticsearch', { allowPublic: true }))
    expect(result.counts.returned).toBe(0)
    expect(calls.some((call) => call.includes('/_pit?keep_alive='))).toBe(true)
    expect(calls.some((call) => call.endsWith('/_search'))).toBe(true)
  })
})
