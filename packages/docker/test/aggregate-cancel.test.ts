/**
 * @hyzyn/dsh-docker — 跨目标聚合的**取消语义**回归（D161）。
 *
 * 现场：`aggregateAcrossTargets` 的单目标预算到点只 `Promise.race` 出一个 `ok:false`，
 * 底层命令**照旧跑完**——那条 SSH channel 继续占着 `MaxSessions` 的会话槽（sshd 在子进程
 * 活着时不释放，见 D150），于是这台慢机器上的后续短命令被远端直接拒绝。所以本文件的判据
 * **不能**是「返回了 ok:false」：那正是修复前的行为，那样的用例恒绿、拦不住任何东西。
 * 判据必须是「预算到点之后，底层**真的**收到了取消」——SSH 上是 channel 的
 * `signal('KILL')` + `close()`，本机上是子进程的 `kill('SIGKILL')`。
 *
 * 四层，各自用最合适的桩：
 *   1. `RemoteExec.run` 的 signal —— 与 `test/logs-stream.test.ts` / `test/ssh-channel-gate.test.ts`
 *      同一口径：假 channel + 直接替换 `acquire`，因为「通道关闭的时机」正是被判据本身，
 *      真 ssh2 的时序在单测里不可控；
 *   2. `runLocal` 的 signal —— 假 ChildProcess（与 `test/connect-local.test.ts` 同款），
 *      专门钉住「abort 复用 D159 的收敛期」：SIGKILL 之后孙进程还握着管道时，
 *      promise 也必须在 `KILL_GRACE_MS` 内落定，而不是等 'close'；
 *   3. `createRunner` 的**两个分支**都透传 —— ssh 分支用只记参数的假 RemoteExec，
 *      local 分支断言真 spawn 出来的子进程被杀（只改一边 = 「本机能取消、SSH 不能」）；
 *   4. 路由 / 工具面走**真实调用链**（最小假宿主 + 真 `apply`）：`target:'*'` 的聚合在
 *      预算到点后，取消要真的穿过 `aggregateAcrossTargets → createRunner → Runner`
 *      落到最底层的命令上，且**只影响超时的那一格**（其余目标照常返回）。
 *
 * 判别性（必须实测，记录见 commit message）：把 `aggregateAcrossTargets` 超时分支里的
 * `controller.abort()` 去掉，或把 `createRunner` 的 signal 透传摘掉，本文件多条用例必须红。
 */
import { EventEmitter } from 'node:events'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const spawnMock = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ spawn: spawnMock }))

import { createRunner } from '../src/docker.js'
import type { Runner } from '../src/docker.js'
import { RemoteExec, runLocal } from '../src/ssh-exec.js'
import type { ExecLogger, SshSpec } from '../src/ssh-exec.js'
import { apply } from '../src/index.js'

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))
const silentLogger: ExecLogger = { info: () => {}, warn: () => {} }

/*
 * spawn 的调用记录**每个用例都要清**：`spawnMock` 是模块级的，不清的话「这条命令没有
 * 再拉起进程」这类**反向**断言会数到上一个用例留下的调用而假红——反向判据本来就最怕
 * 脏状态（本仓的通用教训）。
 */
beforeEach(() => {
  spawnMock.mockReset()
})

/* ------------------------------------------------------------------ *
 * 假 ChildProcess（runLocal 用到的全部接口）
 * ------------------------------------------------------------------ */

interface FakeChild extends EventEmitter {
  stdout: EventEmitter & { destroy: ReturnType<typeof vi.fn> }
  stderr: EventEmitter & { destroy: ReturnType<typeof vi.fn> }
  stdin: { end: ReturnType<typeof vi.fn> }
  kill: ReturnType<typeof vi.fn>
  unref: ReturnType<typeof vi.fn>
  /** 这条假进程收到过的 SIGTERM / SIGKILL 序列。 */
  signals: string[]
}

/**
 * 造一条假进程。`mode`：
 *   - `'ok'`：下一拍吐一行输出并 `close(0)`；
 *   - `'hang'`：**什么都不发**——代表真机上那条「杀了还赖着不放管道」的包装脚本
 *     （D159 实测：3s 上限被拖成 60.3s），也代表超时后仍在跑的底层命令。
 */
function makeChild(mode: 'ok' | 'hang' = 'hang'): FakeChild {
  const child = new EventEmitter() as FakeChild
  const makePipe = (): EventEmitter & { destroy: ReturnType<typeof vi.fn> } => {
    const pipe = new EventEmitter() as EventEmitter & { destroy: ReturnType<typeof vi.fn> }
    pipe.destroy = vi.fn()
    return pipe
  }
  child.stdout = makePipe()
  child.stderr = makePipe()
  child.stdin = { end: vi.fn() }
  child.signals = []
  child.kill = vi.fn((signal?: string) => {
    child.signals.push(signal ?? 'SIGTERM')
    return true
  })
  child.unref = vi.fn()
  if (mode === 'ok') {
    setImmediate(() => {
      // 空输出 = 「这条命令正常跑完且没有任何输出」；给内容反而会解析出容器行，干扰断言
      child.emit('close', 0)
    })
  }
  return child
}

/* ------------------------------------------------------------------ *
 * RemoteExec.run 的 signal（假 channel，直接替换 acquire）
 * ------------------------------------------------------------------ */

interface FakeChannel extends EventEmitter {
  stderr: EventEmitter
  signal: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  end: ReturnType<typeof vi.fn>
}

interface ConnLike {
  client: unknown
  lastUsed: number
  ready: Promise<unknown>
  busy: number
  inflight: number
}

const SPEC: SshSpec = { host: '10.0.0.5', username: 'root' }
const KEY = 'root@10.0.0.5:22'

function makeRemoteHarness(): { remote: RemoteExec; channel: FakeChannel; conn: ConnLike; execCalls: string[] } {
  const remote = new RemoteExec(silentLogger, { get: () => undefined, record: () => {} })
  const channel = new EventEmitter() as FakeChannel
  channel.stderr = new EventEmitter()
  channel.signal = vi.fn()
  channel.close = vi.fn()
  channel.end = vi.fn()
  const execCalls: string[] = []
  const client = {
    exec: (command: string, callback: (error: undefined, ch: unknown) => void) => {
      execCalls.push(command)
      callback(undefined, channel)
    },
  }
  const conn: ConnLike = { client, lastUsed: 0, ready: Promise.resolve(client), busy: 0, inflight: 0 }
  const internals = remote as unknown as {
    conns: Map<string, ConnLike>
    gates: Map<string, { inUse: number }>
    acquire: (spec: SshSpec) => Promise<unknown>
  }
  internals.conns.set(KEY, conn)
  internals.acquire = async () => client
  return { remote, channel, conn, execCalls }
}

describe('RemoteExec.run 的外部取消（D161）', () => {
  it('abort → channel 收到 signal(KILL) + close()，promise 落定且 timedOut 不被误标', async () => {
    const { remote, channel, conn } = makeRemoteHarness()
    const controller = new AbortController()
    const pending = remote.run(SPEC, ['docker', 'ps'], { signal: controller.signal })
    await tick() // 让 acquire / exec 走完，通道已开

    expect(conn.inflight).toBe(1)
    controller.abort()

    const result = await pending
    expect(channel.signal).toHaveBeenCalledWith('KILL')
    expect(channel.close).toHaveBeenCalled()
    expect(result.code).toBeNull()
    // 被**外层预算**取消不是这条命令自己的超时：标记要诚实地留在 false
    expect(result.timedOut).toBe(false)
  })

  it('abort 直接 settle（D112 的教训）：通道静默不响应也不会让 promise 永不落定、inflight 归零', async () => {
    const { remote, channel, conn } = makeRemoteHarness()
    const controller = new AbortController()
    const pending = remote.run(SPEC, ['docker', 'inspect', 'a'], { signal: controller.signal })
    await tick()
    controller.abort()
    await expect(pending).resolves.toMatchObject({ code: null })

    // finally 里的配对递减必须已经发生，否则 shouldRecycleConn 认为这条连接永远在途
    expect(conn.inflight).toBe(0)
    // 迟到的 'close' 不许二次收尾（settled 幂等守卫）
    channel.emit('close', 0)
    await expect(pending).resolves.toMatchObject({ code: null, timedOut: false })
  })

  it('已 abort 的信号不再开门（排队期间被取消的命令一次都不该落到远端）', async () => {
    const { remote, conn, execCalls } = makeRemoteHarness()
    const controller = new AbortController()
    controller.abort()
    const result = await remote.run(SPEC, ['docker', 'ps'], { signal: controller.signal })
    expect(execCalls).toEqual([])
    expect(result.code).toBeNull()
    expect(conn.inflight).toBe(0)
  })

  it('收尾后闸门名额必须归还（漏放 = 该目标后续短命令永久排队）', async () => {
    const { remote } = makeRemoteHarness()
    const controller = new AbortController()
    const pending = remote.run(SPEC, ['docker', 'ps'], { signal: controller.signal })
    await tick()
    controller.abort()
    await pending
    const gates = (remote as unknown as { gates: Map<string, { inUse: number }> }).gates
    expect(gates.get(KEY)?.inUse).toBe(0)
  })

  it('不传 signal 时行为不变（老调用点一个都不受影响）', async () => {
    const { remote, channel, conn } = makeRemoteHarness()
    const pending = remote.run(SPEC, ['docker', 'ps'], { timeoutMs: 5_000 })
    await tick()
    channel.emit('close', 0)
    await expect(pending).resolves.toMatchObject({ code: 0 })
    expect(conn.inflight).toBe(0)
  })
})

/* ------------------------------------------------------------------ *
 * runLocal 的 signal（假 ChildProcess）
 * ------------------------------------------------------------------ */

describe('runLocal 的外部取消（D161）', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('abort → 子进程 SIGKILL；正常 close 后带上真实退出码落定', async () => {
    const child = makeChild('hang')
    spawnMock.mockReturnValue(child)
    const controller = new AbortController()
    const pending = runLocal(['docker', 'ps'], { timeoutMs: 60_000, signal: controller.signal })
    controller.abort()
    expect(child.kill).toHaveBeenCalledWith('SIGKILL')

    child.emit('close', 0)
    await expect(pending).resolves.toMatchObject({ code: 0, timedOut: false })
  })

  it('abort 复用 D159 的收敛期：SIGKILL 后孙进程不放管道，也要在宽限内落定', async () => {
    vi.useFakeTimers()
    const child = makeChild('hang')
    spawnMock.mockReturnValue(child)
    const controller = new AbortController()
    const pending = runLocal(['docker', 'ps'], { timeoutMs: 60_000, signal: controller.signal })
    controller.abort()
    expect(child.kill).toHaveBeenCalledWith('SIGKILL')

    // 宽限期未到：还没收尾（这正是「等 close 而不是自settle」与「自杀完就返回」的分界）
    await vi.advanceTimersByTimeAsync(499)
    // 宽限期到：自行 destroy 管道并收尾，code 为 null（被信号杀死）
    await vi.advanceTimersByTimeAsync(2)
    await expect(pending).resolves.toMatchObject({ code: null, timedOut: false })
    expect(child.stdout.destroy).toHaveBeenCalled()
    expect(child.unref).toHaveBeenCalled()
  })

  it('已经 abort 的命令不再拉起进程（少一次 fork 就少一次赖着不放管道的机会）', async () => {
    const controller = new AbortController()
    controller.abort()
    const result = await runLocal(['docker', 'ps'], { timeoutMs: 60_000, signal: controller.signal })
    expect(spawnMock).not.toHaveBeenCalled()
    expect(result.code).toBeNull()
  })

  it('自己的超时仍照旧标记 timedOut（abort 通道不许把这一档吃掉）', async () => {
    vi.useFakeTimers()
    const child = makeChild('hang')
    spawnMock.mockReturnValue(child)
    const pending = runLocal(['docker', 'ps'], { timeoutMs: 1_000 })
    await vi.advanceTimersByTimeAsync(1_001)
    await vi.advanceTimersByTimeAsync(501)
    await expect(pending).resolves.toMatchObject({ code: null, timedOut: true })
  })
})

/* ------------------------------------------------------------------ *
 * createRunner：两个分支都要透传
 * ------------------------------------------------------------------ */

describe('createRunner 的 signal 透传（D161）', () => {
  it('ssh 分支：构造期绑定的 signal 会随每次 run 传给 remote.run', async () => {
    const seen: Array<{ signal?: AbortSignal }> = []
    const remote = {
      run: async (_spec: SshSpec, _argv: readonly string[], options?: { signal?: AbortSignal }) => {
        seen.push(options ?? {})
        return { code: 0, stdout: 'ok\n', stderr: '', timedOut: false, truncated: false, durationMs: 1 }
      },
    }
    const controller = new AbortController()
    const runner: Runner = createRunner({
      target: { name: '远程', kind: 'ssh', spec: SPEC },
      remote: remote as never,
      logger: silentLogger,
      signal: controller.signal,
    })
    await runner.run(['docker', 'ps'])
    expect(seen[0]?.signal).toBe(controller.signal)
  })

  it('local 分支：构造期绑定的 signal 一路到达子进程（只改一边 = 本机能取消、SSH 不能）', async () => {
    const child = makeChild('hang')
    spawnMock.mockReturnValue(child)
    const controller = new AbortController()
    const runner = createRunner({
      target: { name: '本机', kind: 'local' },
      remote: { run: async () => ({ code: 0, stdout: '', stderr: '', timedOut: false, truncated: false, durationMs: 0 }) } as never,
      logger: silentLogger,
      signal: controller.signal,
    })
    const pending = runner.run(['docker', 'ps'], { timeoutMs: 60_000 })
    controller.abort()
    expect(child.kill).toHaveBeenCalledWith('SIGKILL')
    child.emit('close', null)
    await expect(pending).resolves.toMatchObject({ code: null })
  })

  it('调用方单次给的 signal 覆盖构造期绑定（将来单命令级取消的口子）', async () => {
    const seen: Array<{ signal?: AbortSignal }> = []
    const remote = {
      run: async (_spec: SshSpec, _argv: readonly string[], options?: { signal?: AbortSignal }) => {
        seen.push(options ?? {})
        return { code: 0, stdout: '', stderr: '', timedOut: false, truncated: false, durationMs: 0 }
      },
    }
    const bound = new AbortController()
    const single = new AbortController()
    const runner = createRunner({
      target: { name: '远程', kind: 'ssh', spec: SPEC },
      remote: remote as never,
      logger: silentLogger,
      signal: bound.signal,
    })
    await runner.run(['docker', 'ps'], { signal: single.signal })
    expect(seen[0]?.signal).toBe(single.signal)
  })
})

/* ------------------------------------------------------------------ *
 * 端到端：路由 / 工具面的聚合预算到点必须取消底层
 * ------------------------------------------------------------------ */

interface FakeRoute {
  kind: string
  path: string
  handler: (req: unknown, res: unknown) => Promise<void>
}

interface FakeRes {
  status: number
  headers: Record<string, string>
  endBody: string | undefined
  writeHead(status: number, headers?: Record<string, string>): void
  end(body?: string): void
}

function makeRes(): FakeRes {
  const res: FakeRes = {
    status: 0,
    headers: {},
    endBody: undefined,
    writeHead(status, headers) {
      res.status = status
      res.headers = headers ?? {}
    },
    end(body) {
      if (body !== undefined) res.endBody = body
    },
  }
  return res
}

function makeReq(url: string, method: string, body?: unknown): unknown {
  const payload = body === undefined ? '' : JSON.stringify(body)
  const chunks = payload === '' ? [] : [Buffer.from(payload)]
  return {
    method,
    url,
    headers: { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080', 'content-type': 'application/json' },
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  }
}

interface ToolDefinition {
  name: string
  execute(args: unknown): Promise<unknown>
}

/** 最小假宿主（与 test/streams.test.ts 同思路）；settings 里带上要聚合的目标。 */
function mountPlugin(targets: Array<Record<string, unknown>>): { route: FakeRoute; tools: ToolDefinition[] } {
  const state = { routes: [] as FakeRoute[], tools: [] as ToolDefinition[], listeners: new Map<string, Array<(...args: unknown[]) => void>>() }
  const emitVolatile = (): void => {
    for (const listener of state.listeners.get('loader/volatile-update') ?? []) listener()
  }
  const makeChild = (names: string[]): Record<string, unknown> => {
    const on = (name: string, listener: (...args: unknown[]) => void): (() => void) => {
      const list = state.listeners.get(name) ?? []
      list.push(listener)
      state.listeners.set(name, list)
      return () => {}
    }
    const child: Record<string, unknown> = {
      logger: silentLogger,
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
    if (names.includes('tools')) {
      child.tools = {
        register: (definition: ToolDefinition) => {
          state.tools.push(definition)
          return () => {}
        },
      }
    }
    if (names.includes('settings')) {
      child.settings = {
        describe: () => [{ ns: 'docker', value: { dockerBin: 'docker', targets } }],
        update: async () => {
          emitVolatile()
        },
        configure: () => () => {},
      }
    }
    return child
  }
  const root = makeChild([])
  root.inject = (names: string[], cb: (ctx: unknown) => void) => {
    cb(makeChild(names))
    return () => {}
  }
  ;(apply as unknown as (ctx: unknown, config: unknown) => void)(root, { dockerBin: 'docker', targets })
  const route = state.routes.find((item) => item.path === '/api/dsh-docker')
  if (route === undefined) throw new Error('未注册 /api/dsh-docker 路由')
  return { route, tools: state.tools }
}

const LOCAL_TARGETS = [
  { name: '本机', kind: 'local' },
  { name: '备用', kind: 'local' },
]

describe('跨目标聚合：预算到点必须取消底层命令（D161）', () => {
  beforeEach(() => {
    // 90s 那条路径没法在单测里等；这个口子只为测试与排障（同 DSH_DOCKER_SHORT_CHANNELS 的口径）
    vi.stubEnv('DSH_DOCKER_AGG_TIMEOUT_MS', '40')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    spawnMock.mockReset()
  })

  it('POST /containers target=* ：超时那一格的底层子进程真的被 SIGKILL', async () => {
    const { route } = mountPlugin([{ name: '卡住', kind: 'local' }])
    const child = makeChild('hang')
    spawnMock.mockReturnValue(child)
    const res = makeRes()
    await route.handler(makeReq('/api/dsh-docker/containers', 'POST', { target: '*' }), res)

    expect(res.status).toBe(200)
    const payload = JSON.parse(String(res.endBody)) as { ok: boolean; groups: Array<{ ok: boolean; error?: string }> }
    expect(payload.ok).toBe(true)
    expect(payload.groups).toHaveLength(1)
    expect(payload.groups[0]?.ok).toBe(false)
    expect(payload.groups[0]?.error).toContain('聚合超时')
    // 这条才是判据：光有 ok:false 是修复前的行为
    expect(spawnMock).toHaveBeenCalledTimes(1)
    expect(child.kill).toHaveBeenCalledWith('SIGKILL')
  })

  it('单个目标超时只污染自己那一格，其余目标的结果照常可用', async () => {
    const { route } = mountPlugin(LOCAL_TARGETS)
    const mods: Array<'hang' | 'ok'> = ['hang', 'ok']
    const children: FakeChild[] = []
    spawnMock.mockImplementation(() => {
      const child = makeChild(mods.shift() ?? 'ok')
      children.push(child)
      return child
    })
    const res = makeRes()
    await route.handler(makeReq('/api/dsh-docker/containers', 'POST', { target: '*' }), res)

    const payload = JSON.parse(String(res.endBody)) as {
      groups: Array<{ target: string; ok: boolean; error?: string; data?: unknown[] }>
    }
    expect(payload.groups).toHaveLength(2)
    // 一格失败（带 error）、一格成功（带数据）：错误隔离的契约不变
    const failed = payload.groups.filter((group) => !group.ok)
    const passed = payload.groups.filter((group) => group.ok)
    expect(failed).toHaveLength(1)
    expect(failed[0]?.error).toContain('聚合超时')
    expect(passed).toHaveLength(1)
    expect(passed[0]?.data).toEqual([])
    // 被杀的只能是卡住那条：正常那条已经自己 close 了，不需要也不该被 SIGKILL
    expect(children.filter((child) => child.signals.includes('SIGKILL'))).toHaveLength(1)
  })

  it('docker_ps target=* ：工具面走同一条取消路径', async () => {
    const { tools } = mountPlugin([{ name: '卡住', kind: 'local' }])
    const child = makeChild('hang')
    spawnMock.mockReturnValue(child)
    const tool = tools.find((item) => item.name === 'docker_ps')
    expect(tool).toBeDefined()
    const value = (await tool?.execute({ target: '*' })) as { groups?: Array<{ ok: boolean; error?: string }> }
    expect(value.groups?.[0]?.ok).toBe(false)
    expect(value.groups?.[0]?.error).toContain('聚合超时')
    expect(child.kill).toHaveBeenCalledWith('SIGKILL')
  })

  it('命令正常跑完时兜底 abort 无害（不会把已 settle 的命令再收尾一次）', async () => {
    const { route } = mountPlugin([{ name: '正常', kind: 'local' }])
    const child = makeChild('ok')
    spawnMock.mockReturnValue(child)
    const res = makeRes()
    await route.handler(makeReq('/api/dsh-docker/containers', 'POST', { target: '*' }), res)

    const payload = JSON.parse(String(res.endBody)) as { groups: Array<{ ok: boolean; error?: string }> }
    expect(payload.groups[0]?.ok).toBe(true)
    expect(child.signals).not.toContain('SIGKILL')
  })
})
