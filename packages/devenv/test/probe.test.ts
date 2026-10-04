/**
 * HTTP 探针测试（`docs/devdata-plan.md` §13.2 的 `httpProbe`）。
 *
 * 这一层用**真** HTTP 服务（`listen(0)` 拿临时端口）而不是打桩 `node:http`：探针的全部价值就在
 * 「真的连一次」——连接被拒、超时、4xx / 5xx 这几档只靠 mock 是验不出来的，而它们恰好是
 * 判定层分 `unready` / `refuted` 的依据。
 */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'

import { httpProbe, probeFailureDetail } from '../src/probe.js'

const servers: Server[] = []

/** 起一个只回答固定状态码的临时服务，返回它的端口。 */
async function serve(status: number, body = 'ok'): Promise<number> {
  const server = createServer((_req, res) => {
    res.writeHead(status, { 'content-type': 'text/plain' })
    res.end(body)
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return (server.address() as AddressInfo).port
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(async (server) => await new Promise<void>((resolve) => server.close(() => resolve()))))
})

describe('httpProbe：状态码怎么算「通过」', () => {
  it('200 → 通过', async () => {
    const port = await serve(200)
    expect(await httpProbe({ host: '127.0.0.1', port, path: '/actuator/health', timeoutMs: 3000 })).toEqual({ ok: true, status: 200 })
  })

  it('3xx → 通过（服务器在应答；重定向不等于没起来）', async () => {
    const port = await serve(302)
    expect(await httpProbe({ host: '127.0.0.1', port, path: '/', timeoutMs: 3000 })).toEqual({ ok: true, status: 302 })
  })

  it('404 → **不通过**但带状态码（路径写错可等、且报告里要能一眼看出是清单的问题）', async () => {
    expect(await httpProbe({ host: '127.0.0.1', port: await serve(404), path: '/nope', timeoutMs: 3000 }))
      .toEqual({ ok: false, status: 404, detail: 'HTTP 404' })
  })

  it('503 → 不通过且带状态码（判定层据此判 `refuted`：服务起来了但自己报错）', async () => {
    expect(await httpProbe({ host: '127.0.0.1', port: await serve(503), path: '/', timeoutMs: 3000 }))
      .toEqual({ ok: false, status: 503, detail: 'HTTP 503' })
  })
})

describe('httpProbe：连不上与超时的文案要分开', () => {
  it('端口没人听 → 「连接被拒（端口还没起来）」', async () => {
    // 先起一个再关掉，拿一个确定没人听的端口（比硬编码端口可靠）。
    const server = createServer()
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as AddressInfo).port
    await new Promise<void>((resolve) => server.close(() => resolve()))
    const result = await httpProbe({ host: '127.0.0.1', port, path: '/', timeoutMs: 3000 })
    expect(result.ok).toBe(false)
    expect(result.detail).toBe('连接被拒（端口还没起来）')
  })

  it('主机名解析不了 → 文案点名主机（不是一句「连接被拒」）', async () => {
    // 真解析器那条路只留这一条集成用例：`.invalid` 是保留后缀（RFC 2606），必然解析不了。
    // 超时给得比「解析失败的耗时」宽得多——首解析可能要几秒，贴着超时会让这条用例偶发红。
    const result = await httpProbe({ host: 'no-such-host.invalid', port: 80, path: '/', timeoutMs: 10_000 })
    expect(result.ok).toBe(false)
    expect(result.detail).toBe('主机名解析不了：no-such-host.invalid')
  })

  it('失败分支的映射逐条钉住（不起真服务、不等真解析器）', () => {
    const refused = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })
    expect(probeFailureDetail(refused, 'h', 1000)).toBe('连接被拒（端口还没起来）')
    const notFound = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })
    expect(probeFailureDetail(notFound, 'nas.example', 1000)).toBe('主机名解析不了：nas.example')
    const again = Object.assign(new Error('getaddrinfo EAI_AGAIN'), { code: 'EAI_AGAIN' })
    expect(probeFailureDetail(again, 'nas.example', 1000)).toBe('主机名解析不了：nas.example')
    expect(probeFailureDetail(new Error('timeout'), 'h', 1234)).toBe('1234ms 内没有响应')
    /*
     * ★ 2026-10-04 真机加的一条：`ECONNRESET` 在 Docker Desktop 上是「端口已发布、容器里还没有
     * 进程监听」那个状态（转发器先收下连接再空回），也就是每次冷启动里**最长**的一段——它是一等
     * 状态，不是「其它」（真机档 `real-coldstart-local.test.ts` 实测：连续 5 次观测都是它）。
     */
    const reset = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })
    expect(probeFailureDetail(reset, 'h', 1000)).toBe('连接被重置（多半是端口上还没有能应答的东西）')
    // 判据认的是 **code**：没有 code 的同名错误照旧原样带出去（这一档原来的契约不变）
    expect(probeFailureDetail(new Error('socket hang up'), 'h', 1000)).toBe('socket hang up')
    // 其它错误原样带出去：编一句更好听的话会盖掉真正的原因。
    const unknown = Object.assign(new Error('EAI_FAIL：解析器内部错'), { code: 'EAI_FAIL' })
    expect(probeFailureDetail(unknown, 'h', 1000)).toBe('EAI_FAIL：解析器内部错')
  })

  it('服务器不回响应 → 超时文案带配置的毫秒数', async () => {
    // 一个只接受连接、永不回包的服务器：这就是「端口开着但应用还没就绪」的形态。
    const server = createServer(() => { /* 故意不回 */ })
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as AddressInfo).port
    const result = await httpProbe({ host: '127.0.0.1', port, path: '/', timeoutMs: 120 })
    expect(result.ok).toBe(false)
    expect(result.detail).toContain('120ms')
  })
})
