/**
 * @hyzyn/dsh-tty — 路由闸门的回归测试（项目级 ROADMAP 第 1 项：统一安全围栏）。
 *
 * 背景：本包此前的围栏是自己抄的一份**同步**副本，只认 `127.0.0.1` 一个字面量，且所有
 * 端点（含写远端文件、写本机文件、起传输任务、真拨号记指纹的 `/probe`）都不要求同源证明。
 * 现在改为走 `@hyzyn/dsh-kit` 的加固档（docker D31/D80/D110）并给变更端点补上证明
 * （docker D32/D139）。
 *
 * 这里钉两件本包独有的判据：
 *   1. **拒绝分支**（无来源 / 跨站 / 桌面壳只带 Cookie / 别名主机名）；
 *   2. **哪些动作算变更**——`/list` 与 `/download` 也是 POST（凭证走 body），但只是读，
 *      一刀切「POST 就要求证明」会把旧 Safari 与裸 curl 一起挡在门外。
 */
// DSH_HOME 隔离（D69）：读不到开发机上的真实授权文件
import './isolated-home.js'
import { describe, expect, it } from 'vitest'
import { gateRoute, isMutationSubroute } from '../src/index.js'

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

/** 默认：回环发起、Host 本机、浏览器同源（Sec-Fetch-Site: same-origin）。 */
function makeReq(headers: Record<string, string | undefined> = {}, remoteAddress = '127.0.0.1'): {
  method: string
  url: string
  headers: Record<string, string | undefined>
  socket: { remoteAddress: string }
} {
  return {
    method: 'POST',
    url: '/api/dsh-tty/sftp/remove',
    headers: { host: '127.0.0.1:3080', 'sec-fetch-site': 'same-origin', ...headers },
    socket: { remoteAddress },
  }
}

describe('gateRoute（回环围栏 + 可选的同源证明）', () => {
  it('回环 + 同源 → 放行；只读端点连证明都不要', async () => {
    const res = makeRes()
    await expect(gateRoute(makeReq(), res, { mutation: true })).resolves.toBe(true)
    const res2 = makeRes()
    await expect(gateRoute(makeReq({ 'sec-fetch-site': undefined }), res2)).resolves.toBe(true)
    expect(res2.status).toBe(0)
  })

  it('非回环来源 / 外部 Host → 403 loopback-only（变更与只读都拦）', async () => {
    for (const mutation of [true, false]) {
      const res = makeRes()
      await expect(gateRoute(makeReq({ host: 'evil.example.test' }), res, { mutation })).resolves.toBe(false)
      expect(res.status).toBe(403)
      expect(res.body).toContain('loopback-only')
    }
    const res = makeRes()
    await expect(gateRoute(makeReq({}, '10.1.2.3'), res, { mutation: true })).resolves.toBe(false)
    expect(res.status).toBe(403)
  })

  it('127/8 全段来源与别名 Host 都放行（D31：不再只有 127.0.0.1 一个字面量）', async () => {
    const res = makeRes()
    await expect(gateRoute(makeReq({}, '127.0.0.2'), res, { mutation: true })).resolves.toBe(true)
    const res2 = makeRes()
    await expect(gateRoute(makeReq({ host: '127.0.0.2:3080' }), res2, { mutation: true })).resolves.toBe(true)
  })

  it('变更端点缺同源证明 → 403 缺同源证明（裸 curl / 旧 Safari）', async () => {
    const res = makeRes()
    await expect(gateRoute(makeReq({ 'sec-fetch-site': undefined }), res, { mutation: true })).resolves.toBe(false)
    expect(res.status).toBe(403)
    expect(res.body).toContain('同源证明')
  })

  it('【桌面壳 D139】无 Origin / 无 Sec-Fetch-Site + 宿主 Cookie → 变更端点放行（否则桌面版存不了配置、传不了文件）', async () => {
    const headers = { origin: undefined, 'sec-fetch-site': undefined, cookie: 'dsh=host-session' }
    const res = makeRes()
    await expect(gateRoute(makeReq(headers), res, { mutation: true })).resolves.toBe(true)
    expect(res.status).toBe(0)
  })

  it('跨站即使带 Cookie 也在围栏这一层就拒', async () => {
    const headers = { origin: 'http://evil.test', 'sec-fetch-site': 'cross-site', cookie: 'dsh=host-session' }
    const res = makeRes()
    await expect(gateRoute(makeReq(headers), res, { mutation: true })).resolves.toBe(false)
    expect(res.status).toBe(403)
    expect(res.body).toContain('loopback-only')
  })
})

describe('isMutationSubroute（哪些动作要同源证明）', () => {
  it('写远端 / 写本机 / 起传输任务都算变更', () => {
    for (const sub of ['/mkdir', '/rename', '/remove', '/upload']) {
      expect(isMutationSubroute('/api/dsh-tty/sftp', sub), sub).toBe(true)
    }
    for (const sub of ['/mkdir', '/rename', '/remove', '/transfer']) {
      expect(isMutationSubroute('/api/dsh-tty/local-fs', sub), sub).toBe(true)
    }
  })

  it('只读动作不算变更（POST 只是因为凭证走 body）：/list 与 /download', () => {
    expect(isMutationSubroute('/api/dsh-tty/sftp', '/list')).toBe(false)
    expect(isMutationSubroute('/api/dsh-tty/sftp', '/download')).toBe(false)
    expect(isMutationSubroute('/api/dsh-tty/local-fs', '/list')).toBe(false)
  })

  it('没见过的子路径与未知前缀一律 false（几步之后就是 404，不给额外信息量）', () => {
    expect(isMutationSubroute('/api/dsh-tty/sftp', '/exec')).toBe(false)
    expect(isMutationSubroute('/api/dsh-tty/config', '/remove')).toBe(false)
    expect(isMutationSubroute('', '')).toBe(false)
  })
})
