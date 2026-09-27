/**
 * @hyzyn/dsh-tty — 就地提权路由（`/elevate` 族）的回归测试。
 *
 * 与 docker 那一族同构（见 `packages/docker/test/elevate-route.test.ts` 的四条边界），但**不能
 * 照抄断言**：tty 的有效值折叠方式不同——它不在快照里折叠，而是把「授权」与「配置」分别交给
 * `setProxyCommandPolicy({ granted, enabled })` 这个**四条建连路径共用**的模块级闸门。所以这里
 * 除了快照字段，还要断言那条**策略**真的跟着动（授权到了就允许、撤销了就立刻拒绝）——只测快照
 * 会漏掉「界面显示已授权、命令却仍然被拒」的半个状态。
 *
 * 宿主用最小假 ctx（与 ssh-config-route.test.ts 同思路）；`DSH_HOME` 由 `isolated-home.ts` 指到
 * 临时目录，授权文件与确认目录都落在沙箱里，不会碰到开发机上的真实授权。
 */
import './isolated-home.js'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname } from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { __resetSharedGrantStoresForTest, capabilityPaths } from '@hyzyn/dsh-kit'
import { apply } from '../src/index.js'
import { bindCapabilitySources } from '@hyzyn/dsh-kit'
import { proxyCommandAllowedNow, proxyCommandGrantedNow, setProxyCommandPolicy } from '../src/ssh.js'

const ENV = 'DSH_TTY_ALLOW_PROXY_COMMAND'
const { grantsFile: grantFile, confirmDir } = capabilityPaths(process.env.DSH_HOME ?? tmpdir())

interface FakeRoute {
  kind: string
  path: string
  handler: (req: unknown, res: unknown) => Promise<void>
}

interface FakeRes {
  status: number
  endBody: string | undefined
  writeHead(status: number, headers?: Record<string, string>): void
  end(body?: string): void
}

function makeRes(): FakeRes {
  const res: FakeRes = {
    status: 0,
    endBody: undefined,
    writeHead(status) {
      res.status = status
    },
    end(body) {
      if (body !== undefined) res.endBody = body
    },
  }
  return res
}

/** 带同源证明的请求 = 浏览器里发出的那种；不带 = 跨站页面 / 盲发进程那种。 */
function makeReq(url: string, method: string, body?: unknown, options: { proof?: boolean } = {}): unknown {
  const payload = body === undefined ? '' : JSON.stringify(body)
  const chunks = payload === '' ? [] : [Buffer.from(payload)]
  const headers: Record<string, string> = { host: '127.0.0.1:3092', 'content-type': 'application/json' }
  if (options.proof !== false) headers['sec-fetch-site'] = 'same-origin'
  return {
    method,
    url,
    headers,
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  }
}

interface Harness {
  call(sub: string, method: string, body?: unknown, options?: { proof?: boolean }): Promise<{ status: number; json: Record<string, unknown> }>
  /** 宿主收到的 settings 写入（用来断言「没有发生任何 /config 写入」）。 */
  writes: Array<Record<string, unknown>>
  /** 宿主进程日志（审计行走这里）。 */
  logs: string[]
}

function mount(config: Record<string, unknown> = {}): Harness {
  const routes: FakeRoute[] = []
  const writes: Array<Record<string, unknown>> = []
  const logs: string[] = []
  const makeChild = (names: string[]): Record<string, unknown> => {
    const child: Record<string, unknown> = {
      logger: {
        info: (message: string) => logs.push(String(message)),
        warn: (message: string) => logs.push('WARN ' + String(message)),
        error: () => {},
        debug: () => {},
      },
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
    if (names.includes('settings')) {
      child.settings = {
        describe: () => [{ ns: 'tty', value: {} }],
        update: async (ns: string, patch: Record<string, unknown>) => {
          if (ns !== 'tty') throw new Error('未知的 entry: ' + ns)
          writes.push(patch)
        },
        configure: () => () => {},
      }
    }
    if (names.includes('systemPrompt')) child.systemPrompt = { section: () => () => {}, context: () => () => {} }
    if (names.includes('credentials')) child.credentials = { resolve: async () => ({ value: undefined }) }
    return child
  }
  const root = makeChild([])
  root.inject = (names: string[], cb: (ctx: unknown) => void) => {
    cb(makeChild(names))
    return () => {}
  }
  ;(apply as unknown as (ctx: unknown, config: unknown) => void)(root, { allowProxyCommand: true, ...config })
  const route = routes.find((item) => item.path === '/api/dsh-tty/elevate')
  if (route === undefined) throw new Error('未注册 /api/dsh-tty/elevate 路由')
  const callPath = async (path: string, method: string, body?: unknown, options?: { proof?: boolean }): Promise<{ status: number; json: Record<string, unknown> }> => {
    const exact = routes.find((item) => item.kind === 'exact' && item.path === path)
    const prefix = routes.find((item) => item.kind === 'prefix' && path.startsWith(item.path))
    const target = exact ?? prefix
    if (target === undefined) throw new Error('未注册路由: ' + path)
    const res = makeRes()
    await target.handler(makeReq(path, method, body, options), res)
    return { status: res.status, json: res.endBody === undefined ? {} : (JSON.parse(res.endBody) as Record<string, unknown>) }
  }
  return {
    writes,
    logs,
    callPath,
    async call(sub, method, body, options) {
      return callPath('/api/dsh-tty/elevate' + sub, method, body, options)
    },
  }
}

/** 轮询等条件成立（探测是 1s 定时器驱动的，测试里把间隔调小不了，只能等）。 */
async function until(check: () => Promise<boolean>, timeoutMs = 6_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (await check()) return
    if (Date.now() > deadline) throw new Error('等待超时')
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

/** 把确认命令里的路径抠出来（命令形如 `touch '<path>'`）。 */
function pathOf(command: string): string {
  return command.slice(command.indexOf("'") + 1, command.lastIndexOf("'"))
}

beforeEach(() => {
  delete process.env[ENV]
  setProxyCommandPolicy({ granted: false, enabled: false })
  bindCapabilitySources(undefined)
  rmSync(grantFile, { force: true })
  rmSync(confirmDir, { recursive: true, force: true })
  /*
   * 共享实例的记忆是**进程级**的（D11 要修的正是这个）：用例之间必须清掉，否则上一条的授权会
   * 漏给下一条（只删授权文件不够——内存里那份缓存还在）。
   */
  __resetSharedGrantStoresForTest()
})

afterAll(() => {
  setProxyCommandPolicy({ granted: false, enabled: false })
  bindCapabilitySources(undefined)
})

describe('/elevate：同源证明与白名单', () => {
  it('三条子路由**逐条**都要求同源证明（只列一条的话另外两条就是裸的）', async () => {
    const h = mount()
    for (const sub of ['', '/status', '/revoke']) {
      const denied = await h.call(sub, 'POST', { capability: ENV }, { proof: false })
      expect(denied.status, sub).toBe(403)
      // 文案必须点名「同源证明」：不然读日志的人会以为是插件坏了
      expect(String(denied.json.error)).toContain('同源证明')
    }
  })

  it('GET /elevate → 405（证明判据只管 POST，所以三条一律做成 POST）', async () => {
    const h = mount()
    const res = await h.call('', 'GET')
    expect(res.status).toBe(405)
  })

  it('未知能力名一律 400（白名单，别让请求方决定查哪个键）', async () => {
    const h = mount()
    const res = await h.call('', 'POST', { capability: 'DSH_SOMETHING_ELSE' })
    expect(res.status).toBe(400)
  })

  it('未知子路径 → 404（不是落进 begin 分支）', async () => {
    const h = mount()
    const res = await h.call('/nope', 'POST', { capability: ENV })
    expect(res.status).toBe(404)
  })
})

describe('/elevate：提权全流程', () => {
  it('begin → 命令 → 落地文件 → status 变 granted；快照三字段齐全；**策略当场重算**', async () => {
    const h = mount({ allowProxyCommand: true })
    // 未授权：策略必须是拒绝（配置写着 true 也不算授权）
    expect(proxyCommandGrantedNow()).toBe(false)
    expect(proxyCommandAllowedNow()).toBe(false)

    const begun = await h.call('', 'POST', { capability: ENV })
    expect(begun.status).toBe(200)
    expect(begun.json.status).toBe('pending')
    const command = String(begun.json.command)
    expect(command.startsWith('touch ')).toBe(true)
    const path = pathOf(command)
    expect((await h.call('/status', 'POST', { capability: ENV })).json.status).toBe('pending')

    writeFileSync(path, '')
    await until(async () => proxyCommandGrantedNow())

    // 策略由 onGrantChange 重算（少了它：界面说已授权、命令仍然被拒）
    expect(proxyCommandAllowedNow()).toBe(true)
    // 授权到达**不许**依赖客户端补一次 /config
    expect(h.writes).toEqual([])
    expect(h.logs.some((line) => line.includes('elevation: grant'))).toBe(true)

    const status = await h.call('/status', 'POST', { capability: ENV })
    expect(status.json.status).toBe('granted')
    expect(status.json.via).toBe('file')
  })

  it('status 只报状态，不回 nonce / 命令', async () => {
    const h = mount()
    await h.call('', 'POST', { capability: ENV })
    const status = await h.call('/status', 'POST', { capability: ENV })
    expect(status.json.command).toBeUndefined()
    expect(JSON.stringify(status.json)).not.toContain(confirmDir)
  })

  it('begin 幂等（pending 期间复用同一条命令），新建三次之后 429', async () => {
    const h = mount()
    const first = await h.call('', 'POST', { capability: ENV })
    const again = await h.call('', 'POST', { capability: ENV })
    expect(again.json.command).toBe(first.json.command)
    expect(again.json.reused).toBe(true)

    // 作废当前挑战，再新建两次（共三次）→ 第四次被限流
    await h.call('/revoke', 'POST', { capability: ENV })
    await h.call('', 'POST', { capability: ENV })
    await h.call('/revoke', 'POST', { capability: ENV })
    await h.call('', 'POST', { capability: ENV })
    await h.call('/revoke', 'POST', { capability: ENV })
    const limited = await h.call('', 'POST', { capability: ENV })
    expect(limited.status).toBe(429)
    expect(Number(limited.json.retryAfterMs)).toBeGreaterThan(0)
  })

  it('A5 负向性质：带同源证明、但**不碰文件系统**的任意 HTTP 序列都提不了权', async () => {
    const h = mount({ allowProxyCommand: true })
    const sequence: Array<[string, string, unknown]> = [
      ['', 'POST', { capability: ENV }],
      ['/status', 'POST', { capability: ENV }],
      ['/revoke', 'POST', { capability: ENV }],
      ['', 'POST', {}],
      ['', 'POST', { capability: ENV, nonce: 'x' }],
      ['/status', 'POST', {}],
    ]
    for (const [sub, method, body] of sequence) await h.call(sub, method, body)
    expect(proxyCommandGrantedNow()).toBe(false)
    expect(proxyCommandAllowedNow()).toBe(false)
    // 没授权就一个字节都不该落盘（授权文件不存在）
    expect(h.writes).toEqual([])
  })

  it('撤销：记录清掉、策略当场回落成拒绝、**配置一个字节都没改**', async () => {
    const h = mount({ allowProxyCommand: true })
    const begun = await h.call('', 'POST', { capability: ENV })
    writeFileSync(pathOf(String(begun.json.command)), '')
    await until(async () => proxyCommandGrantedNow())
    expect(proxyCommandAllowedNow()).toBe(true)

    const revoked = await h.call('/revoke', 'POST', { capability: ENV })
    expect(revoked.status).toBe(200)
    expect(revoked.json.revoked).toBe(true)
    // 撤销要**立刻**挡住四条建连路径（只改存储不重算 = 本机还在跑连接簿里那条命令）
    expect(proxyCommandGrantedNow()).toBe(false)
    expect(proxyCommandAllowedNow()).toBe(false)
    expect(h.writes).toEqual([])
    expect(h.logs.some((line) => line.includes('elevation: revoke'))).toBe(true)
  })

  it('运行期禁用插件后：/elevate 仍可用（授权是宿主级的），其它数据路由 403', async () => {
    const h = mount()
    const off = await h.callPath('/api/dsh-tty/config', 'POST', { enabled: false })
    expect(off.status).toBe(200)
    expect(off.json.config).toBeDefined()

    // 授权是宿主级的：插件禁用时也该能在卡片里提权 / 撤销（卡片是禁用后唯一的恢复入口）
    const begun = await h.call('', 'POST', { capability: ENV })
    expect(begun.status).toBe(200)
    expect(begun.json.status).toBe('pending')

    // 而数据路由照旧 403
    const data = await h.callPath('/api/dsh-tty/ssh-config', 'GET')
    expect(data.status).toBe(403)
  })
})

describe('/elevate：盘上已有的授权在启动期被审计', () => {
  it('重启后：打一行 load 审计（含时刻），快照带上授权时刻，策略在启动期就已授予', async () => {
    mkdirSync(dirname(grantFile), { recursive: true })
    writeFileSync(grantFile, JSON.stringify({ version: 1, grants: { [ENV]: { grantedAt: 1750000000, via: 'file' } } }))
    const h = mount({ allowProxyCommand: true })

    const load = h.logs.filter((line) => line.includes('elevation: load'))
    expect(load).toHaveLength(1)
    expect(load[0]).toContain('capability=' + ENV)
    expect(load[0]).toContain('via=file')
    expect(load[0]).toContain('grantedAt=2025-06-15')
    // 审计行不含 nonce 与路径（日志会落盘）
    expect(load[0]).not.toContain(grantFile)

    // 授权直接生效：策略在启动期就允许了（不需要再点一次开关）
    expect(proxyCommandGrantedNow()).toBe(true)
    expect(proxyCommandAllowedNow()).toBe(true)
  })
})
