/**
 * @hyzyn/dsh-docker — 就地提权路由（`/elevate` 族）的回归测试。
 *
 * 这一族的价值全在**边界**上，所以四条边界都要钉住：
 *   1. **同源证明逐条覆盖**：判据是「精确子路径 + POST」，只把 `'/elevate'` 写进
 *      `MUTATION_SUBROUTES` 的话，`/elevate/status` 与 `/elevate/revoke` 就是裸的——跨站页面能撤销
 *      授权、能反复对着确认码试错。三条都要各测一次。
 *   2. **不能凭空提权**：不碰文件系统的任意 HTTP 序列都不能让 `*Granted` 变 true。
 *   3. **授权到达由宿主自己重算**：配置开关可能**早就**是 true（用户先打开过、当时没授权，于是有效值
 *      被折叠成 false），授权到了却没人重算就是「开关亮着、工具不注册」。所以这里断言「没有发生任何
 *      `POST /config` 写入」——生效不许依赖客户端补一刀。
 *   4. **撤销不替用户改配置**：`/config` 与 `/elevate` 的边界就是「只有点开关才写配置」。
 *
 * 宿主用最小假 ctx（与 config-route.test.ts 同思路）；`DSH_HOME` 指到临时目录，所以授权文件与
 * 确认目录都落在沙箱里，不会碰到开发机上的真实授权。
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const spawnMock = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ spawn: spawnMock }))

import { apply } from '../src/index.js'
import { __resetSharedGrantStoresForTest, capabilityPaths } from '@hyzyn/dsh-kit'

const originalDshHome = process.env.DSH_HOME
const isolatedDshHome = mkdtempSync(join(tmpdir(), 'dsh-docker-elev-'))
process.env.DSH_HOME = isolatedDshHome
// 落点**不在这里重拼**：走 kit 的 capabilityPaths（`<DSH home>/dsh-kit/…`），否则改了目录名
// 测试会继续对着一个没人写的旧路径断言（那正是 D08 要防的「路径写两处就漂」）。
const { grantsFile: grantFile, confirmDir } = capabilityPaths(isolatedDshHome)

/** 本文件一律走**就地提权**那条通道：环境变量通道由 config-route.test.ts 覆盖。 */
beforeEach(() => {
  delete process.env.DSH_DOCKER_ALLOW_MUTATIONS
  delete process.env.DSH_DOCKER_ALLOW_EXEC
  rmSync(grantFile, { force: true })
  rmSync(confirmDir, { recursive: true, force: true })
  /*
   * 共享实例的记忆是**进程级**的（D11 要修的正是这个）：用例之间必须清掉，否则上一条的授权会
   * 漏给下一条（只删授权文件不够——内存里那份缓存还在）。
   */
  __resetSharedGrantStoresForTest()
})

afterAll(() => {
  if (originalDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = originalDshHome
  rmSync(isolatedDshHome, { recursive: true, force: true })
})

/* ------------------------------------------------------------------ *
 * 最小假宿主
 * ------------------------------------------------------------------ */

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
  call(url: string, method: string, body?: unknown, options?: { proof?: boolean }): Promise<{ status: number; json: Record<string, unknown> }>
  /** 宿主收到的 settings 写入（用来断言「没有发生任何 /config 写入」）。 */
  updates: Array<Record<string, unknown>>
  /** 宿主进程日志（审计行走这里）。 */
  logs: string[]
  /** 当前**注册着**的 agent 工具名（撤销后要真的消失，见下面的用例）。 */
  toolNames(): string[]
}

function mount(config: Record<string, unknown> = {}, options: { requireRoutes?: boolean } = {}): Harness {
  const state = {
    routes: [] as FakeRoute[],
    listeners: new Map<string, Array<(...args: unknown[]) => void>>(),
    settingsStored: {} as Record<string, unknown>,
    updates: [] as Array<Record<string, unknown>>,
    logs: [] as string[],
    registered: [] as Array<{ name?: string }>,
  }
  const emitVolatile = (): void => {
    for (const listener of state.listeners.get('loader/volatile-update') ?? []) listener()
  }
  const settingsService = {
    describe: () => [{ ns: 'docker', value: { ...state.settingsStored } }],
    update: async (ns: string, patch: Record<string, unknown>) => {
      if (ns !== 'docker') throw new Error('未知的 entry: ' + ns)
      state.updates.push(patch)
      Object.assign(state.settingsStored, patch)
      emitVolatile()
    },
    configure: () => () => {},
  }
  const makeChild = (names: string[]): Record<string, unknown> => {
    const on = (name: string, listener: (...args: unknown[]) => void): (() => void) => {
      const list = state.listeners.get(name) ?? []
      list.push(listener)
      state.listeners.set(name, list)
      return () => {}
    }
    const child: Record<string, unknown> = {
      logger: { info: (message: string) => state.logs.push(message), warn: (message: string) => state.logs.push(`WARN ${message}`) },
      effect: (callback: () => unknown) => {
        callback()
        return () => {}
      },
      inject: (childNames: string[], cb: (ctx: unknown) => void) => {
        cb(makeChild(childNames))
        return () => {}
      },
      on,
      events: { on },
    }
    if (names.includes('webServer')) {
      child.webServer = {
        register: (route: FakeRoute) => {
          state.routes.push(route)
          return () => {}
        },
      }
    }
    if (names.includes('settings')) child.settings = settingsService
    if (names.includes('tools')) {
      // 注销也要真的生效：插件调用 disposer 时把定义移出去（否则「撤销后工具注销」测不出来）
      child.tools = {
        register: (definition: { name?: string }) => {
          state.registered.push(definition)
          return () => {
            const index = state.registered.indexOf(definition)
            if (index >= 0) state.registered.splice(index, 1)
          }
        },
      }
    }
    return child
  }
  const root = makeChild([])
  root.inject = (names: string[], cb: (ctx: unknown) => void) => {
    cb(makeChild(names))
    return () => {}
  }
  ;(apply as unknown as (ctx: unknown, config: unknown) => void)(root, { dockerBin: 'docker', targets: [], ...config })
  const route = state.routes.find((item) => item.path === '/api/dsh-docker')
  /*
   * 禁用态挂载（`enabled: false`）会**提前返回**、一条路由都不注册——那种用例只看启动日志
   * （`requireRoutes: false`），不该被这里拦住。
   */
  if (route === undefined && options.requireRoutes !== false) throw new Error('未注册 /api/dsh-docker 路由')
  return {
    updates: state.updates,
    logs: state.logs,
    toolNames: () => state.registered.map((definition) => definition.name ?? '(未命名)'),
    async call(url, method, body, options) {
      const res = makeRes()
      if (route === undefined) throw new Error('未注册 /api/dsh-docker 路由')
      await route.handler(makeReq(url, method, body, options), res)
      return { status: res.status, json: res.endBody === undefined ? {} : (JSON.parse(res.endBody) as Record<string, unknown>) }
    },
  }
}

/** 轮询等条件成立（探测是 1s 定时器驱动的，只能等）。 */
async function until(check: () => Promise<boolean>, timeoutMs = 6_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (await check()) return
    if (Date.now() > deadline) throw new Error('等待超时')
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

/** `GET /config` 里的有效值 / 来源 / 配置值三件套。 */
async function configOf(h: Harness): Promise<Record<string, unknown>> {
  const { json } = await h.call('/api/dsh-docker/config', 'GET')
  return json.config as Record<string, unknown>
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

describe('/elevate：同源证明与白名单', () => {
  it('三条子路由**逐条**都要求同源证明（只列 /elevate 的话另外两条就是裸的）', async () => {
    const h = mount()
    for (const sub of ['/elevate', '/elevate/status', '/elevate/revoke']) {
      const { status, json } = await h.call(`/api/dsh-docker${sub}`, 'POST', { capability: 'allowMutations' }, { proof: false })
      expect(status, sub).toBe(403)
      // 断言是**同源证明**那一条拒绝的（不是回环围栏顺手拦下的）
      expect(String(json.error), sub).toContain('同源证明')
    }
  })

  it('GET /elevate → 405（证明判据只管 POST，所以这三条一律做成 POST）', async () => {
    const h = mount()
    const { status } = await h.call('/api/dsh-docker/elevate', 'GET')
    expect(status).toBe(405)
  })

  it('未知能力名一律 400（白名单，别让请求方决定查哪个键）', async () => {
    const h = mount()
    for (const capability of ['', 'allowEverything', 'env']) {
      const { status, json } = await h.call('/api/dsh-docker/elevate', 'POST', { capability })
      expect(status, capability).toBe(400)
      expect(String(json.error)).toContain('未知能力开关')
    }
    // 白名单外的名字不该在授权存储里留下任何痕迹
    expect(existsSync(grantFile)).toBe(false)
  })
})

describe('/elevate：提权全流程', () => {
  it('begin → 命令 → 落地文件 → status 变 granted；快照来源是 file、有效值变 true', async () => {
    const h = mount()
    expect((await configOf(h)).allowMutationsGranted).toBe(false)

    const begun = await h.call('/api/dsh-docker/elevate', 'POST', { capability: 'allowMutations' })
    expect(begun.status).toBe(200)
    expect(begun.json.status).toBe('pending')
    const command = String(begun.json.command)
    expect(command.startsWith('touch ')).toBe(true)
    const path = command.slice(command.indexOf("'") + 1, command.lastIndexOf("'"))
    expect(
      (await h.call('/api/dsh-docker/elevate/status', 'POST', { capability: 'allowMutations' })).json.status,
    ).toBe('pending')

    writeFileSync(path, '')
    await until(async () => (await configOf(h)).allowMutationsGranted === true)
    const config = await configOf(h)
    expect(config.allowMutationsGrantSource).toBe('file')
    // 授权时刻随快照出去（kit D09）：持久授权必须看得见，否则重启后是「静默开着」
    expect(typeof config.allowMutationsGrantedAt).toBe('number')
    expect(Number(config.allowMutationsGrantedAt)).toBeGreaterThan(0)
    // 授权到了，但配置开关本身没被谁打开过 → 有效值仍是 false（两层语义）
    expect(config.allowMutations).toBe(false)
    expect(h.updates).toEqual([])
    expect(h.logs.some((line) => line.includes('elevation: grant'))).toBe(true)
  })

  it('配置**早就**是 true：授权到达后由宿主重算成有效，不依赖客户端再 patch 一次', async () => {
    // 这正是 config-route 里那条「配置写着 true 但没授权 → 有效值 false」的另一半
    const h = mount({ allowMutations: true })
    const before = await configOf(h)
    expect(before.allowMutationsConfigured).toBe(true)
    expect(before.allowMutations).toBe(false)
    expect(before.allowMutationsGrantSource).toBeNull()
    expect(before.allowMutationsGrantedAt).toBeNull()
    // 没授权时破坏档工具连注册都不该有
    expect(h.toolNames()).not.toContain('docker_action')

    const begun = await h.call('/api/dsh-docker/elevate', 'POST', { capability: 'allowMutations' })
    const command = String(begun.json.command)
    writeFileSync(command.slice(command.indexOf("'") + 1, command.lastIndexOf("'")), '')
    await until(async () => (await configOf(h)).allowMutations === true)

    expect((await configOf(h)).allowMutationsGrantSource).toBe('file')
    // 关键断言：没有任何 /config 写入。生效若需要客户端补一次 patch，这条会红
    expect(h.updates).toEqual([])
    // 而且工具**已经**注册好了（重算顺带 refreshTools）
    expect(h.toolNames()).toContain('docker_action')
  })

  it('A5 负向性质：带同源证明、但**不碰文件系统**的任意 HTTP 序列都提不了权', async () => {
    const h = mount()
    const step = async (url: string, method: string, body?: unknown): Promise<number> => (await h.call(url, method, body)).status
    // 各种顺序与重复：begin/status/revoke 交错、再拿 /config 试一次凭空打开
    for (let round = 0; round < 2; round += 1) {
      await step('/api/dsh-docker/elevate', 'POST', { capability: 'allowMutations' })
      await step('/api/dsh-docker/elevate/status', 'POST', { capability: 'allowMutations' })
      await step('/api/dsh-docker/elevate', 'POST', { capability: 'allowExec' })
      await step('/api/dsh-docker/elevate/revoke', 'POST', { capability: 'allowMutations' })
      await step('/api/dsh-docker/elevate/status', 'POST', { capability: 'allowExec' })
      expect(await step('/api/dsh-docker/config', 'POST', { allowMutations: true, allowExec: true })).toBe(400)
    }
    const config = await configOf(h)
    expect(config.allowMutationsGranted).toBe(false)
    expect(config.allowExecGranted).toBe(false)
    expect(config.allowMutationsGrantSource).toBeNull()
    expect(config.allowExecGrantSource).toBeNull()
    // 授权文件根本不该被创建（没有任何一步能凭空写它）
    expect(existsSync(grantFile)).toBe(false)
  })

  it('status 只报状态，不回 nonce / 命令', async () => {
    const h = mount()
    const begun = await h.call('/api/dsh-docker/elevate', 'POST', { capability: 'allowExec' })
    expect(begun.json.command).toBeTypeOf('string')
    const status = await h.call('/api/dsh-docker/elevate/status', 'POST', { capability: 'allowExec' })
    expect(status.json).toEqual({ status: 'pending', expiresAt: expect.any(Number) })
    expect(JSON.stringify(status.json)).not.toContain('touch')
  })

  it('限流：新建三次之后 429（幂等复用不算额度）', async () => {
    const h = mount()
    const begin = async (): Promise<Record<string, unknown>> => (await h.call('/api/dsh-docker/elevate', 'POST', { capability: 'allowExec' })).json
    await begin()
    expect((await begin()).reused).toBe(true)
    for (let round = 0; round < 2; round += 1) {
      await h.call('/api/dsh-docker/elevate/revoke', 'POST', { capability: 'allowExec' })
      expect((await begin()).status).toBe('pending')
    }
    await h.call('/api/dsh-docker/elevate/revoke', 'POST', { capability: 'allowExec' })
    const limited = await h.call('/api/dsh-docker/elevate', 'POST', { capability: 'allowExec' })
    expect(limited.status).toBe(429)
    expect(limited.json.status).toBe('rate-limited')
  })
})

describe('/elevate：撤销与禁用态', () => {
  it('撤销：记录清掉、有效值回落、破坏档工具注销、**配置一个字节都没改**', async () => {
    const h = mount({ allowMutations: true })
    const begun = await h.call('/api/dsh-docker/elevate', 'POST', { capability: 'allowMutations' })
    const command = String(begun.json.command)
    writeFileSync(command.slice(command.indexOf("'") + 1, command.lastIndexOf("'")), '')
    await until(async () => (await configOf(h)).allowMutations === true)
    expect(h.toolNames()).toContain('docker_action')

    const revoked = await h.call('/api/dsh-docker/elevate/revoke', 'POST', { capability: 'allowMutations' })
    expect(revoked.status).toBe(200)
    expect(revoked.json.revoked).toBe(true)
    const after = await configOf(h)
    expect(after.allowMutations).toBe(false)
    expect(after.allowMutationsGranted).toBe(false)
    expect(after.allowMutationsGrantSource).toBeNull()
    // 撤销后时刻也归零：留着一个旧时刻会让人以为授权还在
    expect(after.allowMutationsGrantedAt).toBeNull()
    // 撤销永远不动配置：开关还是「开着」的那个状态，只是没生效（界面靠 *Configured + 徽标解释）
    expect(after.allowMutationsConfigured).toBe(true)
    expect(h.updates).toEqual([])
    // 撤销要立刻生效：破坏档工具当场注销（只改授权存储不重算就会留下「记录没了、工具还开着」）
    expect(h.toolNames()).not.toContain('docker_action')
    expect(h.logs.some((line) => line.includes('elevation: revoke'))).toBe(true)
  })

  it('运行期禁用后 /elevate 仍然可用（授权是宿主级的），其它数据路由 403', async () => {
    const h = mount()
    const disabled = await h.call('/api/dsh-docker/config', 'POST', { enabled: false })
    expect(disabled.status).toBe(200)

    const begun = await h.call('/api/dsh-docker/elevate', 'POST', { capability: 'allowMutations' })
    expect(begun.status).toBe(200)
    expect(begun.json.status).toBe('pending')

    const containers = await h.call('/api/dsh-docker/containers', 'POST', { target: 'local' })
    expect(containers.status).toBe(403)
    const config = await h.call('/api/dsh-docker/config', 'GET')
    expect(config.status).toBe(200)
  })
})

/**
 * 启动期载入（kit D09）。
 *
 * 这一条测的是「宿主重启」那一刻：授权文件先落在盘上，插件再 `apply()`。带外授权是**持久**的，
 * 所以这时能力会**直接生效、不再有任何确认**——那么启动日志里必须有一行说明它，否则一次提权就
 * 等于没发生过（「上个月授权的能力今天一开机就开着」，无处可查）。
 */
describe('/elevate：盘上已有的授权在启动期被审计', () => {
  it('重启后：打一行 load 审计（含时刻），快照也带上授权时刻', async () => {
    mkdirSync(dirname(grantFile), { recursive: true })
    writeFileSync(
      grantFile,
      JSON.stringify({ version: 1, grants: { DSH_DOCKER_ALLOW_MUTATIONS: { grantedAt: 1750000000, via: 'file' } } }),
    )
    const h = mount({ allowMutations: true })

    // 审计行**不含 nonce 与路径**（日志会落盘），只说明「哪条能力、哪条通道、什么时候」
    const load = h.logs.filter((line) => line.includes('elevation: load'))
    expect(load).toHaveLength(1)
    expect(load[0]).toContain('capability=DSH_DOCKER_ALLOW_MUTATIONS')
    expect(load[0]).toContain('via=file')
    expect(load[0]).toContain('grantedAt=2025-06-15')
    expect(load[0]).not.toContain(grantFile)

    const config = await configOf(h)
    expect(config.allowMutationsGranted).toBe(true)
    expect(config.allowMutationsGrantedAt).toBe(1750000000)
    // 授权直接生效：破坏档工具在启动期就注册好了（不需要再点一次开关）
    expect(h.toolNames()).toContain('docker_action')
  })

  it('插件这次是禁用态：更要说一句（「盘上有授权、但插件没开」≠「点了没反应」）', () => {
    mkdirSync(dirname(grantFile), { recursive: true })
    writeFileSync(
      grantFile,
      JSON.stringify({ version: 1, grants: { DSH_DOCKER_ALLOW_EXEC: { grantedAt: 1750000000, via: 'file' } } }),
    )
    const h = mount({ enabled: false }, { requireRoutes: false })
    // 审计在 enabled 判定**之前**：禁用的插件挂载时也把「盘上有授权」说出来
    expect(h.logs.some((line) => line.includes('elevation: load capability=DSH_DOCKER_ALLOW_EXEC'))).toBe(true)
  })
})
