/**
 * @hyzyn/dsh-mcp — 路由闸门的回归测试（项目级 ROADMAP 第 1 项：统一安全围栏）。
 *
 * 背景：本包此前的围栏是自己抄的一份**同步**副本，只认 `127.0.0.1` 一个字面量，且三条
 * 路由（GET `/servers`、POST `/servers/save`、POST `/test`）都没有「同源证明」——而后两条
 * 一条写 home 补丁文件、一条起子进程拨号。现在改为走 `@hyzyn/dsh-kit` 的加固档
 * （docker D31/D80/D110）并给 POST 补上证明（docker D32/D139）。
 *
 * 这里钉的是**拒绝分支**（安全闸门最该有负例）：无来源、跨站、桌面壳只带 Cookie、
 * 别名主机名。围栏本身的语义在 `packages/kit/test/http.test.ts` 有更细的用例。
 */
import { describe, expect, it } from 'vitest'
import { routeGate } from '../src/index.js'

interface FakeRes {
  status: number
  body: string | undefined
  writeHead(status: number): void
  end(body?: string): void
}

function makeRes(): FakeRes {
  const res: FakeRes = {
    status: 0,
    body: undefined,
    writeHead(status) {
      res.status = status
    },
    end(body) {
      if (body !== undefined) res.body = body
    },
  }
  return res
}

/** 默认：从回环发起、Host 为本机、浏览器同源请求（Sec-Fetch-Site: same-origin）。 */
function makeReq(method: string, headers: Record<string, string | undefined> = {}): {
  method: string
  url: string
  headers: Record<string, string | undefined>
  socket: { remoteAddress: string }
} {
  return {
    method,
    url: '/api/dsh-mcp/servers/save',
    headers: { host: '127.0.0.1:3080', 'sec-fetch-site': 'same-origin', ...headers },
    socket: { remoteAddress: '127.0.0.1' },
  }
}

describe('routeGate（回环围栏 + 方法闸门 + 写操作的同源证明）', () => {
  it('回环 + 同源 + 方法对得上 → 放行', async () => {
    const res = makeRes()
    await expect(routeGate(makeReq('POST'), res, 'POST')).resolves.toBe(true)
    expect(res.status).toBe(0)
  })

  it('非回环来源 / 外部 Host → 403 loopback-only', async () => {
    for (const req of [makeReq('POST', { host: 'evil.example.test' })]) {
      const res = makeRes()
      await expect(routeGate(req, res, 'POST')).resolves.toBe(false)
      expect(res.status).toBe(403)
      expect(res.body).toContain('loopback-only')
    }
    // 来源地址不是回环（Host 装得再像也没用）
    const remote = { ...makeReq('POST'), socket: { remoteAddress: '10.1.2.3' } }
    const res = makeRes()
    await expect(routeGate(remote, res, 'POST')).resolves.toBe(false)
    expect(res.status).toBe(403)
  })

  it('127/8 全段来源与别名 Host 都放行（D31：不再只有 127.0.0.1 一个字面量）', async () => {
    const res = makeRes()
    await expect(routeGate({ ...makeReq('POST'), socket: { remoteAddress: '127.0.0.2' } }, res, 'POST')).resolves.toBe(true)
    const res2 = makeRes()
    await expect(routeGate(makeReq('POST', { host: '127.0.0.2:3080' }), res2, 'POST')).resolves.toBe(true)
  })

  it('写路由缺同源证明 → 403 缺同源证明（裸 curl / 旧浏览器）', async () => {
    const res = makeRes()
    await expect(routeGate(makeReq('POST', { 'sec-fetch-site': undefined }), res, 'POST')).resolves.toBe(false)
    expect(res.status).toBe(403)
    expect(res.body).toContain('同源证明')
  })

  it('【桌面壳 D139】无 Origin / 无 Sec-Fetch-Site + 宿主 Cookie → 放行（否则桌面版保存与试连全断）', async () => {
    const headers = { origin: undefined, 'sec-fetch-site': undefined, cookie: 'dsh=host-session' }
    const res = makeRes()
    await expect(routeGate(makeReq('POST', headers), res, 'POST')).resolves.toBe(true)
    expect(res.status).toBe(0)
  })

  it('跨站即使带 Cookie 也在围栏这一层就拒（不给写操作留口子）', async () => {
    const headers = { origin: 'http://evil.test', 'sec-fetch-site': 'cross-site', cookie: 'dsh=host-session' }
    const res = makeRes()
    await expect(routeGate(makeReq('POST', headers), res, 'POST')).resolves.toBe(false)
    expect(res.status).toBe(403)
    expect(res.body).toContain('loopback-only')
  })

  it('只读路由（GET /servers）不要求同源证明：裸 curl 也能读', async () => {
    const res = makeRes()
    await expect(routeGate(makeReq('GET', { 'sec-fetch-site': undefined }), res, 'GET')).resolves.toBe(true)
  })

  it('方法对不上 → 405，且**先于**同源证明判定（跨站 GET 打到写路由不会被多透一条信息）', async () => {
    const res = makeRes()
    await expect(routeGate(makeReq('GET', { 'sec-fetch-site': undefined }), res, 'POST')).resolves.toBe(false)
    expect(res.status).toBe(405)
    expect(res.body).toContain('method not allowed')
  })

  it('拒绝时记一条成因日志；桌面壳例外（带 Cookie）则不记', async () => {
    const logged: string[] = []
    const res = makeRes()
    // 唯一可达的证明拒绝形态：无 Origin、无 Sec-Fetch-Site、也无 Cookie
    // （带上非空 Cookie 就构成 D139 的桌面壳例外 → 放行；Origin 不同源则由上面的围栏先拒）
    await routeGate(makeReq('POST', { origin: undefined, 'sec-fetch-site': undefined }), res, 'POST', {
      warn: (message: string) => { logged.push(message) },
    })
    expect(logged).toEqual([
      'dsh-mcp-config: 拒绝无同源证明的变更请求 /api/dsh-mcp/servers/save（origin=无 sec-fetch-site=无 cookie=无）',
    ])
    expect(res.status).toBe(403)

    // 桌面壳那条路放行，且**不**产生「拒绝」日志（它不是异常，是 D139 明确接受的形态）
    const accepted: string[] = []
    const desktopRes = makeRes()
    await routeGate(makeReq('POST', { origin: undefined, 'sec-fetch-site': undefined, cookie: 'dsh=host-session' }), desktopRes, 'POST', {
      warn: (message: string) => { accepted.push(message) },
    })
    expect(accepted).toEqual([])
    expect(desktopRes.status).toBe(0)
  })
})
