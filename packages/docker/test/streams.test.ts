/**
 * @hyzyn/dsh-docker — 统计流 / 拉取流 + 通用 SSE 长连接基建的回归测试。
 *
 * 覆盖三层：
 *   1. DockerApi 的 statsStream / pullStream argv（与快照只差 --no-stream）；
 *   2. 通用 openSseStream 的接线：统计流把 docker stats 的逐行 JSON 归一成
 *      `stats` 事件（与 /stats 快照同形）、心跳、客户端断开静默中止；
 *   3. 拉取流的 allowMutations 门禁（未开启 403 且不建流）与 pull-exit 收尾、
 *      以及插件禁用时「三条流一起收尾」的共用清理路径。
 *
 * spawn 用 vi.mock 注入假 ChildProcess —— 真实进程的 data/close 时序无法在
 * 单测里精确驱动；路由层用与 test/logs-stream.test.ts 同思路的最小假 ctx/req/res。
 */
import { EventEmitter } from 'node:events'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const spawnMock = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ spawn: spawnMock }))

import {
  DockerApi,
  assertImageRef,
  assertName,
  parseContainerEvent,
  parseEventsJson,
  parseNetworkInspectJson,
  parseNetworksJson,
  parseVolumeInspectJson,
  parseVolumesJson,
} from '../src/docker.js'
import { apply, formatBytes, sseFrame } from '../src/index.js'

/* ------------------------------------------------------------------ *
 * 通用桩
 * ------------------------------------------------------------------ */

interface FakeChild extends EventEmitter {
  stdout: EventEmitter
  stderr: EventEmitter
  kill: ReturnType<typeof vi.fn>
}

function makeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = vi.fn(() => true)
  return child
}

interface FakeRoute {
  kind: string
  path: string
  handler: (req: unknown, res: unknown) => Promise<void>
}

interface FakeRes {
  status: number
  headers: Record<string, string>
  frames: string[]
  endBody: string | undefined
  flushed: boolean
  ended: boolean
  closeListeners: Array<() => void>
  writeHead(status: number, headers?: Record<string, string>): void
  write(chunk: string): void
  flushHeaders(): void
  end(body?: string): void
  on(event: string, listener: () => void): void
  emitClose(): void
}

function makeRes(): FakeRes {
  const res: FakeRes = {
    status: 0,
    headers: {},
    frames: [],
    endBody: undefined,
    flushed: false,
    ended: false,
    closeListeners: [],
    writeHead(status, headers) {
      res.status = status
      res.headers = headers ?? {}
    },
    write(chunk) {
      res.frames.push(chunk)
    },
    flushHeaders() {
      res.flushed = true
    },
    end(body) {
      res.ended = true
      if (body !== undefined) res.endBody = body
    },
    on(event, listener) {
      if (event === 'close') res.closeListeners.push(listener)
    },
    emitClose() {
      for (const listener of [...res.closeListeners]) listener()
    },
  }
  return res
}

function makeReq(url: string, method = 'GET', remoteAddress = '127.0.0.1', body?: unknown): unknown {
  const payload = body === undefined ? '' : JSON.stringify(body)
  const chunks = payload === '' ? [] : [Buffer.from(payload)]
  return {
    method,
    url,
    headers: { host: '127.0.0.1:3080', 'content-type': 'application/json' },
    socket: { remoteAddress },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  }
}

/** 最小假 cordis ctx（与 test/logs-stream.test.ts 同思路）。 */
function makeCtx(): { ctx: Record<string, unknown>; state: { routes: FakeRoute[]; tools: Array<Record<string, unknown>>; prompts: Array<Record<string, unknown>>; listeners: Map<string, Array<(...args: unknown[]) => void>>; settingsStored: Record<string, unknown> } } {
  const state = {
    routes: [] as FakeRoute[],
    tools: [] as Array<Record<string, unknown>>,
    prompts: [] as Array<Record<string, unknown>>,
    listeners: new Map<string, Array<(...args: unknown[]) => void>>(),
    settingsStored: {} as Record<string, unknown>,
  }
  const scopeFor = (base: Record<string, unknown>) => ({
    get: () => ({ ...base, ...state.settingsStored }),
    update: async (patch: Record<string, unknown>) => {
      Object.assign(state.settingsStored, patch)
      for (const listener of state.listeners.get('settings/updated') ?? []) {
        listener('docker', { ...base, ...state.settingsStored }, undefined, 'update')
      }
    },
  })
  const makeChild = (names: string[]): Record<string, unknown> => {
    const child: Record<string, unknown> = {
      logger: { info: () => {}, warn: () => {} },
      effect: (callback: () => unknown) => {
        callback()
        return () => {}
      },
      inject: (childNames: string[], cb: (ctx: unknown) => void) => {
        cb(makeChild(childNames))
        return () => {}
      },
      events: {
        on: (name: string, listener: (...args: unknown[]) => void) => {
          const list = state.listeners.get(name) ?? []
          list.push(listener)
          state.listeners.set(name, list)
          return () => {}
        },
      },
    }
    if (names.includes('tools')) {
      child.tools = {
        register: (definition: Record<string, unknown>) => {
          state.tools.push(definition)
          return () => {}
        },
      }
    }
    if (names.includes('webServer')) {
      child.webServer = {
        register: (route: FakeRoute) => {
          state.routes.push(route)
          return () => {}
        },
      }
    }
    if (names.includes('settings')) {
      child.settings = {
        register: (_ns: string, _schema: unknown, options_: { base?: Record<string, unknown> } | undefined) => scopeFor(options_?.base ?? {}),
        get: () => undefined,
      }
    }
    if (names.includes('systemPrompt')) {
      child.systemPrompt = {
        section: (options_: Record<string, unknown>) => {
          state.prompts.push(options_)
          return () => {}
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
  return { ctx: root, state }
}

function mountPlugin(options: { allowMutations?: boolean } = {}): { route: FakeRoute; state: ReturnType<typeof makeCtx>['state'] } {
  const { ctx, state } = makeCtx()
  const config = {
    dockerBin: 'docker',
    allowMutations: options.allowMutations === true,
    targets: [{ name: '本机', kind: 'local' }],
  }
  ;(apply as unknown as (ctx: unknown, config: unknown) => void)({ ...ctx }, config)
  const route = state.routes.find((item) => item.path === '/api/dsh-docker')
  if (route === undefined) throw new Error('未注册 /api/dsh-docker 路由')
  return { route, state }
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  spawnMock.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

/* ------------------------------------------------------------------ *
 * 1. DockerApi：statsStream / pullStream 的 argv
 * ------------------------------------------------------------------ */

function fakeStreamRunner(): { api: DockerApi; calls: Array<{ argv: string[]; signal?: AbortSignal }> } {
  const calls: Array<{ argv: string[]; signal?: AbortSignal }> = []
  const runner = {
    label: 'fake',
    async run() {
      throw new Error('run 不应在流式路径被调用')
    },
    async stream(argv: readonly string[], _handlers: unknown, signal?: AbortSignal) {
      calls.push({ argv: [...argv], ...(signal === undefined ? {} : { signal }) })
      return { code: 0 }
    },
  }
  return { api: new DockerApi(runner as never, 'docker', { timeoutMs: 1000, maxBytes: 1024 }), calls }
}

describe('DockerApi.stream（统计 / 拉取）', () => {
  it('statsStream 不带 --no-stream，快照仍有 --no-stream（同一构造点）', async () => {
    const { api, calls } = fakeStreamRunner()
    await api.statsStream(['web'], { onStdout: () => {}, onStderr: () => {} })
    expect(calls[0]?.argv).toEqual(['docker', 'stats', '--format', '{{json .}}', 'web'])
    await api.statsStream([], { onStdout: () => {}, onStderr: () => {} })
    expect(calls[1]?.argv).toEqual(['docker', 'stats', '--format', '{{json .}}'])
  })

  it('statsStream 的容器 ID 走 assertRef 白名单', async () => {
    const { api, calls } = fakeStreamRunner()
    await expect(api.statsStream(['web; rm -rf /'], { onStdout: () => {}, onStderr: () => {} })).rejects.toThrow(/含非法字符/)
    expect(calls).toHaveLength(0)
  })

  it('pullStream 用 assertImageRef：放行 registry:tag，拒绝 flag', async () => {
    const { api, calls } = fakeStreamRunner()
    await api.pullStream('ghcr.io/org/app:1.2', { onStdout: () => {}, onStderr: () => {} })
    expect(calls[0]?.argv).toEqual(['docker', 'pull', 'ghcr.io/org/app:1.2'])
    await expect(api.pullStream('-f', { onStdout: () => {}, onStderr: () => {} })).rejects.toThrow(/含非法字符/)
    expect(calls).toHaveLength(1)
  })
})

/* ------------------------------------------------------------------ *
 * 2. GET /stats/stream（SSE 路由）
 * ------------------------------------------------------------------ */

const STATS_JSON = JSON.stringify({ ID: 'abc123', Name: 'web', CPUPerc: '3.50%', MemUsage: '128MiB / 1GiB', MemPerc: '12.50%', NetIO: '0B / 0B', BlockIO: '0B / 0B', PIDs: '4' })

describe('GET /stats/stream（SSE 路由）', () => {
  it('只读能力：未开启 allowMutations 也能建流', async () => {
    const { route } = mountPlugin({ allowMutations: false })
    const child = makeChild()
    spawnMock.mockReturnValue(child)
    const res = makeRes()
    const pending = route.handler(makeReq('/api/dsh-docker/stats/stream?target=本机&ids=web'), res)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('text/event-stream; charset=utf-8')
    expect(res.flushed).toBe(true)
    const [bin, args] = spawnMock.mock.calls[0] as [string, string[]]
    expect(bin).toBe('docker')
    expect(args).toEqual(['stats', '--format', '{{json .}}', 'web'])
    child.emit('close', 0)
    await pending
  })

  it('docker stats 的逐行 JSON 归一成 stats 事件（形状与 /stats 快照一致）', async () => {
    const { route } = mountPlugin()
    const child = makeChild()
    spawnMock.mockReturnValue(child)
    const res = makeRes()
    const pending = route.handler(makeReq('/api/dsh-docker/stats/stream?target=本机&ids=web'), res)
    // 两个**不同值**的采样同处一个 chunk（且末尾半个 JSON 要在下一 chunk 补齐）——
    // 刻意让第二条与第一条不同：完全相同的相邻采样会被服务端按「docker stats 重复渲染」折叠
    const second = STATS_JSON.replace('3.50%', '4.50%')
    child.stdout.emit('data', Buffer.from(STATS_JSON + '\n' + second.slice(0, 40)))
    child.stdout.emit('data', Buffer.from(second.slice(40) + '\n'))
    child.emit('close', 0)
    await pending
    const statsFrames = res.frames.filter((frame) => frame.startsWith('event: stats'))
    expect(statsFrames).toHaveLength(2)
    const payload = JSON.parse(statsFrames[0]!.split('\n')[1]!.slice('data: '.length)) as { id: string; cpuPercent: number; memPercent: number; pids: number }
    expect(payload.id).toBe('abc123')
    expect(payload.cpuPercent).toBe(3.5)
    expect(payload.memPercent).toBe(12.5)
    expect(payload.pids).toBe(4)
    expect(res.frames.at(-1)).toBe(sseFrame('end', { reason: 'stats-exit', code: 0 }))
    expect(res.ended).toBe(true)
  })

  it('docker stats 的 TTY 渲染帧（ESC[H/ESC[K/ESC[J + 重复渲染）也能出 stats 事件', async () => {
    // 真实抓包（远端 docker stats --format '{{json .}}'，stdout 是管道）：docker stats
    // 不看 stdout 是不是 TTY，一律走 TTY 渲染器——行首是 ESC 而不是 `{`，同一个采样
    // 还被渲染两次。按行解析会把整行丢掉 → 「连上了但一个采样都不来」。
    const { route } = mountPlugin()
    const child = makeChild()
    spawnMock.mockReturnValue(child)
    const res = makeRes()
    const pending = route.handler(makeReq('/api/dsh-docker/stats/stream?target=本机&ids=web'), res)
    const frame = (cpu: string): string => {
      const json = STATS_JSON.replace('3.50%', cpu)
      return '\u001b[H' + json + '\n\u001b[H' + json + ' \u001b[K\n \u001b[K\n\u001b[J'
    }
    child.stdout.emit('data', Buffer.from(frame('0.04%')))
    child.stdout.emit('data', Buffer.from(frame('0.15%')))
    // 第三帧从中间劈开，验证「半截对象留到下一 chunk」仍然成立
    const third = frame('1.25%')
    child.stdout.emit('data', Buffer.from(third.slice(0, 20)))
    child.stdout.emit('data', Buffer.from(third.slice(20)))
    child.emit('close', 0)
    await pending
    const frames = res.frames.filter((one) => one.startsWith('event: stats'))
    // 重复采样（跨 chunk 也一样）被折叠：两帧 + 劈开的一帧 = 3 个事件
    expect(frames).toHaveLength(3)
    const cpus = frames.map((one) => (JSON.parse(one.split('\n')[1]!.slice('data: '.length)) as { cpuPercent: number }).cpuPercent)
    expect(cpus).toEqual([0.04, 0.15, 1.25])
  })

  it('心跳：每 15s 一帧 ping；收尾后不再产生帧', async () => {
    vi.useFakeTimers()
    const { route } = mountPlugin()
    const child = makeChild()
    spawnMock.mockReturnValue(child)
    const res = makeRes()
    const pending = route.handler(makeReq('/api/dsh-docker/stats/stream?target=本机&ids=web'), res)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(res.frames).toContain(': ping\n\n')
    child.emit('close', 0)
    await pending
    const before = res.frames.length
    await vi.advanceTimersByTimeAsync(60_000)
    expect(res.frames.length).toBe(before)
  })

  it('客户端断开：静默中止（SIGTERM 阶梯），不写任何帧', async () => {
    const { route } = mountPlugin()
    const child = makeChild()
    spawnMock.mockReturnValue(child)
    const res = makeRes()
    const pending = route.handler(makeReq('/api/dsh-docker/stats/stream?target=本机&ids=web'), res)
    res.emitClose()
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    child.emit('close', null)
    await pending
    expect(res.frames).toEqual([])
    expect(res.ended).toBe(false)
  })

  it('非法 ids 400 / 非 GET 405 / 非 loopback 403 都不建流', async () => {
    const { route } = mountPlugin()
    const cases = [
      { url: '/api/dsh-docker/stats/stream?target=本机&ids=' + encodeURIComponent('web; rm -rf /'), status: 400, pattern: /含非法字符/ },
      { url: '/api/dsh-docker/stats/stream?target=本机&ids=web', method: 'POST', status: 405, pattern: /method not allowed/ },
      { url: '/api/dsh-docker/stats/stream?target=本机&ids=web', remote: '10.0.0.9', status: 403, pattern: /loopback-only/ },
    ]
    for (const item of cases) {
      const res = makeRes()
      await route.handler(makeReq(item.url, item.method ?? 'GET', item.remote ?? '127.0.0.1'), res)
      expect(res.status, item.url).toBe(item.status)
      expect(String(res.endBody), item.url).toMatch(item.pattern)
      expect(res.flushed).toBe(false)
    }
    expect(spawnMock).not.toHaveBeenCalled()
  })
})

/* ------------------------------------------------------------------ *
 * 3. GET /images/pull/stream（SSE 路由 + allowMutations 门禁）
 * ------------------------------------------------------------------ */

describe('GET /images/pull/stream（SSE 路由）', () => {
  it('未开启 allowMutations：403 且不建流', async () => {
    const { route } = mountPlugin({ allowMutations: false })
    const res = makeRes()
    await route.handler(makeReq('/api/dsh-docker/images/pull/stream?target=本机&ref=nginx:1.27'), res)
    expect(res.status).toBe(403)
    expect(String(res.endBody)).toMatch(/变更操作未启用/)
    expect(res.flushed).toBe(false)
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('开启后：line 分片 → end{pull-exit,code,ref}', async () => {
    const { route } = mountPlugin({ allowMutations: true })
    const child = makeChild()
    spawnMock.mockReturnValue(child)
    const res = makeRes()
    const pending = route.handler(makeReq('/api/dsh-docker/images/pull/stream?target=本机&ref=nginx:1.27'), res)
    const [bin, args] = spawnMock.mock.calls[0] as [string, string[]]
    expect(bin).toBe('docker')
    expect(args).toEqual(['pull', 'nginx:1.27'])
    child.stdout.emit('data', Buffer.from('Pulling from library/nginx\n'))
    child.stderr.emit('data', Buffer.from('Warning: legacy\n'))
    child.emit('close', 0)
    await pending
    expect(res.frames).toEqual([
      sseFrame('line', { d: 'Pulling from library/nginx\n' }),
      sseFrame('line', { e: 'Warning: legacy\n' }),
      sseFrame('end', { reason: 'pull-exit', code: 0, ref: 'nginx:1.27' }),
    ])
    expect(res.ended).toBe(true)
  })

  it('非法 ref 400 / 未知目标 400 / 非 loopback 403（都不建流）', async () => {
    const { route } = mountPlugin({ allowMutations: true })
    const cases = [
      { url: '/api/dsh-docker/images/pull/stream?target=本机&ref=' + encodeURIComponent('-f'), status: 400, pattern: /含非法字符/ },
      { url: '/api/dsh-docker/images/pull/stream?target=nope&ref=nginx', status: 400, pattern: /未知目标/ },
      { url: '/api/dsh-docker/images/pull/stream?target=本机&ref=nginx', remote: '10.0.0.9', status: 403, pattern: /loopback-only/ },
    ]
    for (const item of cases) {
      const res = makeRes()
      await route.handler(makeReq(item.url, 'GET', item.remote ?? '127.0.0.1'), res)
      expect(res.status, item.url).toBe(item.status)
      expect(String(res.endBody), item.url).toMatch(item.pattern)
      expect(res.flushed).toBe(false)
    }
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('插件禁用（applySection）统一收尾：进行中的拉取流被 end + abort', async () => {
    const { route } = mountPlugin({ allowMutations: true })
    const child = makeChild()
    spawnMock.mockReturnValue(child)
    const res = makeRes()
    const pending = route.handler(makeReq('/api/dsh-docker/images/pull/stream?target=本机&ref=nginx:1.27'), res)
    expect(res.status).toBe(200)

    const configRes = makeRes()
    await route.handler(makeReq('/api/dsh-docker/config', 'POST', '127.0.0.1', { enabled: false }), configRes)
    expect(configRes.status).toBe(200)
    expect(res.ended).toBe(true)
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')

    child.emit('close', null)
    await pending
    expect(res.frames).toEqual([])
  })
})

/* ------------------------------------------------------------------ *
 * 4. formatBytes（host 侧渲染镜像大小用）
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * 6. 网络 / 卷（argv、名称校验、解析容错、gated 路由）
 * ------------------------------------------------------------------ */

const NET_LS = JSON.stringify({ ID: '8d5028a7e8b1', Name: 'dizuo_default', Driver: 'bridge', Scope: 'local', IPv4: 'false', IPv6: 'false', Internal: 'false', Labels: 'a=b', CreatedAt: '2026-04-06 13:38:54 +0800 CST' })
const NET_LS_INTERNAL = JSON.stringify({ ID: 'abc123456789', Name: 'net-int', Driver: 'bridge', Scope: 'local', IPv4: 'true', IPv6: 'true', Internal: 'true' })
const NET_INSPECT = JSON.stringify([{
  Id: 'abc123456789',
  Name: 'shop_default',
  Driver: 'bridge',
  Scope: 'local',
  Created: '2026-09-01T02:00:00Z',
  Internal: false,
  Attachable: true,
  Ingress: false,
  EnableIPv6: false,
  IPAM: { Driver: 'default', Config: [{ Subnet: '172.20.0.0/16', Gateway: '172.20.0.1' }] },
  Options: { 'com.docker.network.bridge.name': 'br-1' },
  Labels: { 'com.docker.compose.project': 'shop' },
  Containers: { '9f2c1d4e5a6b7c8d': { Name: 'web', IPv4Address: '172.20.0.3/16', IPv6Address: '', MacAddress: '02:42:ac:14:00:03' } },
}])
const VOL_LS = JSON.stringify({ Name: 'pgdata', Driver: 'local', Scope: 'local', Mountpoint: '/var/lib/docker/volumes/pgdata/_data' })
const VOL_LS_OLD = JSON.stringify({ Name: 'pgdata', Driver: 'local', Scope: 'local' })
const VOL_INSPECT = JSON.stringify([{ Name: 'pgdata', Driver: 'local', Scope: 'local', Mountpoint: '/var/lib/docker/volumes/pgdata/_data', CreatedAt: '2026-09-01T02:00:00Z', Options: { type: 'none' }, Labels: { keep: 'true' } }])

describe('assertName（网络 / 卷名）', () => {
  it('放行合法名，trim 后返回', () => {
    expect(assertName('bridge', 'network')).toBe('bridge')
    expect(assertName('  my-net_1.2  ', 'network')).toBe('my-net_1.2')
    expect(assertName('a'.repeat(128), 'volume')).toHaveLength(128)
  })

  it('拒绝 / 与 :（这两条正是 assertImageRef 会放行的），以及 flag 与注入', () => {
    for (const bad of ['a/b', 'a:b', '-f', '--force', 'a b', 'a;b', 'a$(id)', 'a`id`', '', '   ', 'a'.repeat(129)]) {
      expect(() => assertName(bad, 'network'), '应拒绝 ' + JSON.stringify(bad)).toThrow()
    }
    // 镜像那套白名单确实放行 / 与 :——所以这里不能复用它
    expect(() => assertImageRef('a/b:c', 'image')).not.toThrow()
    expect(() => assertName('a/b:c', 'network')).toThrow()
  })
})

describe('parseNetworksJson / parseNetworkInspectJson / parseVolumesJson / parseVolumeInspectJson', () => {
  it('network ls：字符串布尔归一 + 噪音行/空输出降级', () => {
    const rows = parseNetworksJson(NET_LS + '\n' + NET_LS_INTERNAL)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ name: 'dizuo_default', driver: 'bridge', scope: 'local', internal: false, ipv6: false, shortId: '8d5028a7e8b1' })
    expect(rows[1]).toMatchObject({ name: 'net-int', internal: true, ipv6: true })
    expect(parseNetworksJson('')).toEqual([])
    expect(parseNetworksJson('WARNING: something\nnot json')).toEqual([])
    expect(parseNetworksJson('{"Name":"x"')).toEqual([])
  })

  it('network inspect：子网 / 网关 / 选项 / 标签 / 接入的容器', () => {
    const detail = parseNetworkInspectJson(NET_INSPECT)[0]
    expect(detail).toMatchObject({ name: 'shop_default', driver: 'bridge', scope: 'local', internal: false, attachable: true, ingress: false, enableIpv6: false })
    expect(detail?.subnets).toEqual([{ subnet: '172.20.0.0/16', gateway: '172.20.0.1' }])
    expect(detail?.options['com.docker.network.bridge.name']).toBe('br-1')
    expect(detail?.labels['com.docker.compose.project']).toBe('shop')
    expect(detail?.containers).toHaveLength(1)
    expect(detail?.containers[0]).toMatchObject({ shortId: '9f2c1d4e5a6b', name: 'web', ipv4: '172.20.0.3/16', ipv6: '', mac: '02:42:ac:14:00:03' })
    // 缺字段降级：老 daemon 没有 IPAM / Containers 时不能抛
    const bare = parseNetworkInspectJson(JSON.stringify([{ Id: 'x', Name: 'n' }]))[0]
    expect(bare?.subnets).toEqual([])
    expect(bare?.containers).toEqual([])
    expect(bare?.options).toEqual({})
  })

  it('volume ls / inspect：缺 Mountpoint 的老版本降级为空串', () => {
    expect(parseVolumesJson(VOL_LS)[0]).toEqual({ name: 'pgdata', driver: 'local', scope: 'local', mountpoint: '/var/lib/docker/volumes/pgdata/_data' })
    expect(parseVolumesJson(VOL_LS_OLD)[0]?.mountpoint).toBe('')
    expect(parseVolumesJson('   ')).toEqual([])
    const detail = parseVolumeInspectJson(VOL_INSPECT)[0]
    expect(detail).toMatchObject({ name: 'pgdata', driver: 'local', scope: 'local', created: '2026-09-01T02:00:00Z' })
    expect(detail?.options).toEqual({ type: 'none' })
    expect(detail?.labels).toEqual({ keep: 'true' })
    expect(parseVolumeInspectJson('[]')).toEqual([])
  })
})

describe('DockerApi 网络 / 卷（argv）', () => {
  it('ls / inspect / rm / prune 的 argv：数组构造，prune 必带 -f', async () => {
    const calls: string[][] = []
    const runner = {
      label: 'fake',
      async run(argv: readonly string[]) {
        calls.push([...argv])
        return { code: 0, stdout: 'ok', stderr: '', timedOut: false, truncated: false, durationMs: 1 }
      },
      async stream() { throw new Error('网络 / 卷不应走长流') },
    }
    const api = new DockerApi(runner as never, 'docker', { timeoutMs: 1000, maxBytes: 1024 })
    await api.networks()
    await api.volumes()
    await api.networkPrune()
    await api.volumePrune()
    await api.networkRemove('my-net').catch(() => {})
    await api.volumeRemove('pgdata').catch(() => {})
    expect(calls[0]).toEqual(['docker', 'network', 'ls', '--format', '{{json .}}'])
    expect(calls[1]).toEqual(['docker', 'volume', 'ls', '--format', '{{json .}}'])
    expect(calls[2]).toEqual(['docker', 'network', 'prune', '-f'])
    expect(calls[3]).toEqual(['docker', 'volume', 'prune', '-f'])
    expect(calls[4]).toEqual(['docker', 'network', 'rm', 'my-net'])
    expect(calls[5]).toEqual(['docker', 'volume', 'rm', 'pgdata'])
  })

  it('inspect 的 argv，以及非法名在触达执行器之前就被拒', async () => {
    const calls: string[][] = []
    const runner = {
      label: 'fake',
      async run(argv: readonly string[]) {
        calls.push([...argv])
        return { code: 0, stdout: NET_INSPECT, stderr: '', timedOut: false, truncated: false, durationMs: 1 }
      },
      async stream() { throw new Error('不应走长流') },
    }
    const api = new DockerApi(runner as never, 'docker', { timeoutMs: 1000, maxBytes: 1024 })
    await api.networkInspect('shop_default')
    expect(calls[0]).toEqual(['docker', 'network', 'inspect', 'shop_default'])
    await expect(api.networkInspect('a/b')).rejects.toThrow(/含非法字符/)
    await expect(api.volumeRemove('a:b')).rejects.toThrow(/含非法字符/)
    expect(calls).toHaveLength(1)
  })
})

describe('POST /networks 与 /volumes（门控与校验）', () => {
  /** 假 spawn：下一拍自动吐 payload 并退出（runLocal 的一次性命令路径要 stdin）。 */
  function stubRun(payload: string, code = 0): void {
    spawnMock.mockImplementation(() => {
      const child = makeChild() as FakeChild & { stdin: { end: () => void } }
      child.stdin = { end: () => {} }
      setImmediate(() => {
        if (payload !== '') child.stdout.emit('data', Buffer.from(payload))
        child.emit('close', code)
      })
      return child
    })
  }

  it('未开启变更操作：remove / prune 403，列表与详情仍可用', async () => {
    const { route } = mountPlugin({ allowMutations: false })
    for (const sub of ['/networks/remove', '/networks/prune', '/volumes/remove', '/volumes/prune']) {
      const res = makeRes()
      await route.handler(makeReq('/api/dsh-docker' + sub, 'POST', '127.0.0.1', { target: '本机', name: 'x' }), res)
      expect(res.status, sub).toBe(403)
      expect(String(res.endBody), sub).toMatch(/变更操作未启用/)
    }
    stubRun(NET_LS)
    const list = makeRes()
    await route.handler(makeReq('/api/dsh-docker/networks', 'POST', '127.0.0.1', { target: '本机' }), list)
    expect(list.status).toBe(200)
    expect((JSON.parse(String(list.endBody)) as { networks: Array<{ name: string }> }).networks[0]?.name).toBe('dizuo_default')
    stubRun(VOL_LS)
    const vols = makeRes()
    await route.handler(makeReq('/api/dsh-docker/volumes', 'POST', '127.0.0.1', { target: '本机' }), vols)
    expect(vols.status).toBe(200)
    expect((JSON.parse(String(vols.endBody)) as { volumes: Array<{ name: string }> }).volumes[0]?.name).toBe('pgdata')
  })

  it('开启后：remove / prune 放行；缺 name 400；非法名 500（白名单在 DockerApi 里）', async () => {
    const { route } = mountPlugin({ allowMutations: true })
    stubRun('Deleted network: x')
    const ok = makeRes()
    await route.handler(makeReq('/api/dsh-docker/networks/remove', 'POST', '127.0.0.1', { target: '本机', name: 'my-net' }), ok)
    expect(ok.status).toBe(200)
    expect((JSON.parse(String(ok.endBody)) as { result: { name: string } }).result.name).toBe('my-net')

    stubRun('')
    const pruned = makeRes()
    await route.handler(makeReq('/api/dsh-docker/volumes/prune', 'POST', '127.0.0.1', { target: '本机' }), pruned)
    expect(pruned.status).toBe(200)

    for (const sub of ['/networks/inspect', '/networks/remove', '/volumes/inspect', '/volumes/remove']) {
      const missing = makeRes()
      await route.handler(makeReq('/api/dsh-docker' + sub, 'POST', '127.0.0.1', { target: '本机' }), missing)
      expect(missing.status, sub).toBe(400)
      expect(String(missing.endBody), sub).toMatch(/name 必填/)
    }

    const bad = makeRes()
    await route.handler(makeReq('/api/dsh-docker/networks/inspect', 'POST', '127.0.0.1', { target: '本机', name: 'a/b' }), bad)
    expect(bad.status).toBe(500)
    expect(String(bad.endBody)).toMatch(/含非法字符/)
  })

  it('inspect 命中时返回详情（子网 / 接入容器）', async () => {
    const { route } = mountPlugin()
    stubRun(NET_INSPECT)
    const res = makeRes()
    await route.handler(makeReq('/api/dsh-docker/networks/inspect', 'POST', '127.0.0.1', { target: '本机', name: 'shop_default' }), res)
    expect(res.status).toBe(200)
    const payload = JSON.parse(String(res.endBody)) as { network: { detail: { name: string; subnets: Array<{ gateway: string }>; containers: Array<{ name: string }> } } }
    expect(payload.network.detail.name).toBe('shop_default')
    expect(payload.network.detail.subnets[0]?.gateway).toBe('172.20.0.1')
    expect(payload.network.detail.containers[0]?.name).toBe('web')
  })
})

describe('formatBytes', () => {
  it('十进制单位（与 docker images 的 SIZE 一致）', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(999)).toBe('999 B')
    expect(formatBytes(142000000)).toBe('142 MB')
    expect(formatBytes(1500000000)).toBe('1.5 GB')
    expect(formatBytes(Number.NaN)).toBe('—')
  })
})

/* ------------------------------------------------------------------ *
 * 5. 事件流（docker events）
 * ------------------------------------------------------------------ */

const EV_START = JSON.stringify({ status: 'start', id: 'abc', Type: 'container', Action: 'start', Actor: { ID: 'aaaaaaaaaaaaaaaa', Attributes: { name: 'web', image: 'nginx:1.27', 'com.docker.compose.project': 'shop' } }, time: 1700000000 })
const EV_DIE = JSON.stringify({ Action: 'die', Actor: { ID: 'bbbb', Attributes: { name: 'api', image: 'app:1', exitCode: '137' } }, time: 1700000005 })
const EV_EXEC = JSON.stringify({ Action: 'exec_start', Actor: { ID: 'cccc', Attributes: { name: 'web' } }, time: 1700000006 })
const EV_HEALTH = JSON.stringify({ Action: 'health_status: unhealthy', Actor: { ID: 'dddd', Attributes: { name: 'db', image: 'pg:16' } }, time: 1700000010 })

describe('parseContainerEvent / parseEventsJson', () => {
  it('白名单：八类动作放行，exec_* / attach / resize 等噪音丢弃', () => {
    expect(parseContainerEvent(EV_START)?.action).toBe('start')
    expect(parseContainerEvent(EV_EXEC)).toBeNull()
    expect(parseContainerEvent(JSON.stringify({ Action: 'attach', Actor: { ID: 'x' } }))).toBeNull()
    expect(parseContainerEvent(JSON.stringify({ Action: 'resize', Actor: { ID: 'x' } }))).toBeNull()
    for (const action of ['start', 'die', 'stop', 'kill', 'oom', 'destroy', 'rename', 'update']) {
      expect(parseContainerEvent(JSON.stringify({ Action: action, Actor: { ID: 'x', Attributes: { name: 'n' } } }))?.action).toBe(action)
    }
  })

  it('health_status 的 status 后缀照吃（基础动作过白名单，完整串留给 UI）', () => {
    expect(parseContainerEvent(EV_HEALTH)?.action).toBe('health_status: unhealthy')
    expect(parseContainerEvent(JSON.stringify({ Action: 'health_status', Actor: { ID: 'x', Attributes: { name: 'n' } } }))?.action).toBe('health_status')
    // 后缀里的状态不该被当成独立动作
    expect(parseContainerEvent(JSON.stringify({ Action: 'health_status: healthy', Actor: { ID: 'x' } }))?.action).toBe('health_status: healthy')
  })

  it('字段抽取：name / image / compose 项目 / time / die 的退出码', () => {
    expect(parseContainerEvent(EV_START)).toMatchObject({
      action: 'start', name: 'web', image: 'nginx:1.27', composeProject: 'shop', time: 1700000000, exitCode: null,
    })
    const die = parseContainerEvent(EV_DIE)
    expect(die).toMatchObject({ action: 'die', name: 'api', exitCode: 137 })
    expect(die?.composeProject).toBeNull()
  })

  it('坏行 / 半截 JSON / 缺 name / 老格式 status 都不 fatal', () => {
    expect(parseContainerEvent('')).toBeNull()
    expect(parseContainerEvent('not json')).toBeNull()
    expect(parseContainerEvent('{"Action":"start"')).toBeNull()
    // 容器已被删的 destroy 事件可能没有 name：回落到 Actor.ID 前 12 位
    expect(parseContainerEvent(JSON.stringify({ Action: 'start', Actor: { ID: 'abcdef0123456789' } }))?.name).toBe('abcdef012345')
    // 老版本用 status 字段而不是 Action
    expect(parseContainerEvent(JSON.stringify({ status: 'stop', Actor: { ID: 'x', Attributes: { name: 'n' } } }))?.action).toBe('stop')
    expect(parseEventsJson(EV_START + '\nnot json\n' + EV_EXEC + '\n').map((event) => event.action)).toEqual(['start'])
  })
})

describe('DockerApi.eventsStream / events（argv）', () => {
  it('流式：不带 --since / --until（只从「现在」开始推），带 filter type=container', async () => {
    const { api, calls } = fakeStreamRunner()
    await api.eventsStream({ onStdout: () => {}, onStderr: () => {} })
    expect(calls[0]?.argv).toEqual(['docker', 'events', '--format', '{{json .}}', '--filter', 'type=container'])
  })

  it('快照：--since 透传 + --until 取请求时刻（否则 docker events 永不退出）', async () => {
    const calls: string[][] = []
    const runner = {
      label: 'fake',
      async run(argv: readonly string[]) {
        calls.push([...argv])
        return { code: 0, stdout: EV_START + '\n' + EV_EXEC, stderr: '', timedOut: false, truncated: false, durationMs: 1 }
      },
      async stream() { throw new Error('stream 不应在快照路径被调用') },
    }
    const api = new DockerApi(runner as never, 'docker', { timeoutMs: 1000, maxBytes: 1024 })
    const rows = await api.events('10m')
    expect(calls[0]?.slice(0, 4)).toEqual(['docker', 'events', '--since', '10m'])
    expect(calls[0]?.slice(4, 6)).toEqual(['--until', expect.any(String)])
    expect(String(calls[0]?.[5])).toMatch(/^[0-9]{4}-[0-9]{2}-[0-9]{2}T/)
    expect(calls[0]?.slice(6)).toEqual(['--format', '{{json .}}', '--filter', 'type=container'])
    // 快照同样过白名单：exec_start 被丢掉
    expect(rows.map((row) => row.action)).toEqual(['start'])
  })
})

describe('GET /events/stream（SSE 路由）', () => {
  it('事件序列：白名单过滤 + 坏行丢弃 + end{events-exit}', async () => {
    const { route } = mountPlugin()
    const child = makeChild()
    spawnMock.mockReturnValue(child)
    const res = makeRes()
    const pending = route.handler(makeReq('/api/dsh-docker/events/stream?target=本机'), res)
    const [bin, args] = spawnMock.mock.calls[0] as [string, string[]]
    expect(bin).toBe('docker')
    expect(args).toEqual(['events', '--format', '{{json .}}', '--filter', 'type=container'])
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('text/event-stream; charset=utf-8')
    expect(res.flushed).toBe(true)
    child.stdout.emit('data', Buffer.from(EV_START + '\nnot json\n' + EV_EXEC + '\n' + EV_DIE + '\n' + EV_HEALTH + '\n'))
    child.emit('close', 0)
    await pending
    const frames = res.frames.filter((one) => one.startsWith('event: event'))
    expect(frames).toHaveLength(3)
    const payloads = frames.map((one) => JSON.parse(one.split('\n')[1]!.slice('data: '.length)) as Record<string, unknown>)
    // 值为 null 的字段在帧里省略
    expect(payloads[0]).toEqual({ action: 'start', name: 'web', image: 'nginx:1.27', composeProject: 'shop', time: 1700000000 })
    expect(payloads[1]).toEqual({ action: 'die', name: 'api', image: 'app:1', time: 1700000005, exitCode: 137 })
    expect(payloads[2]).toEqual({ action: 'health_status: unhealthy', name: 'db', image: 'pg:16', time: 1700000010 })
    expect(res.frames.at(-1)).toBe(sseFrame('end', { reason: 'events-exit', code: 0 }))
    expect(res.ended).toBe(true)
  })

  it('跨 chunk 的半行能拼回来；非 GET 405 / 未知目标 400 / 非 loopback 403 都不建流', async () => {
    const { route } = mountPlugin()
    const child = makeChild()
    spawnMock.mockReturnValue(child)
    const res = makeRes()
    const pending = route.handler(makeReq('/api/dsh-docker/events/stream?target=本机'), res)
    const half = Math.floor(EV_START.length / 2)
    child.stdout.emit('data', Buffer.from(EV_START.slice(0, half)))
    child.stdout.emit('data', Buffer.from(EV_START.slice(half) + '\n'))
    child.emit('close', 0)
    await pending
    expect(res.frames.filter((one) => one.startsWith('event: event'))).toHaveLength(1)

    const cases = [
      { url: '/api/dsh-docker/events/stream?target=本机', method: 'POST', status: 405 },
      { url: '/api/dsh-docker/events/stream?target=nope', status: 400 },
      { url: '/api/dsh-docker/events/stream?target=本机', remote: '10.0.0.9', status: 403 },
    ]
    for (const item of cases) {
      const bad = makeRes()
      await route.handler(makeReq(item.url, item.method ?? 'GET', item.remote ?? '127.0.0.1'), bad)
      expect(bad.status, item.url).toBe(item.status)
      expect(bad.flushed).toBe(false)
    }
  })

  it('插件禁用（applySection）统一收尾：进行中的事件流被 end + abort', async () => {
    const { route } = mountPlugin()
    const child = makeChild()
    spawnMock.mockReturnValue(child)
    const res = makeRes()
    const pending = route.handler(makeReq('/api/dsh-docker/events/stream?target=本机'), res)
    expect(res.status).toBe(200)
    const configRes = makeRes()
    await route.handler(makeReq('/api/dsh-docker/config', 'POST', '127.0.0.1', { enabled: false }), configRes)
    expect(configRes.status).toBe(200)
    expect(res.ended).toBe(true)
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    child.emit('close', null)
    await pending
    expect(res.frames).toEqual([])
  })
})

