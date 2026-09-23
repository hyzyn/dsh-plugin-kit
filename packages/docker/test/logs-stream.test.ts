/**
 * @hyzyn/dsh-docker — 容器日志实时流（SSE）的回归测试。
 *
 * 覆盖四层：
 *   1. logsStream 的 argv 构造（--follow 位置、tail 夹紧、timestamps / since、
 *      容器 ID 白名单）与 signal 透传；
 *   2. SSE 帧封装（line 的 JSON 单行化：换行 / 多字节；end / error 帧格式）；
 *   3. 本地流生命周期（假 spawn：跨 chunk 多字节解码、abort 的 SIGTERM→SIGKILL
 *      阶梯、close resolve、spawn error）与 SSH 连接池 busy 计数配对 / sweeper
 *      跳过逻辑（channel 事件桩，不起真 SSH）；
 *   4. 路由 GET /logs/stream 的事件序列与清理（假 cordis ctx + 假 req/res，
 *      复刻 scripts/route-smoke.mjs 的桩思路）。
 *
 * spawn 用 vi.mock 注入假 ChildProcess —— 真实进程的 data/close 时序无法在
 * 单测里精确驱动；ssh 侧则直接替换 RemoteExec 的 acquire 与连接簿条目，
 * 既绕开真网络又能断言 busy 的增减配对。
 */
import { EventEmitter } from 'node:events'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const spawnMock = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ spawn: spawnMock }))

import { DockerApi, createRunner } from '../src/docker.js'
import type { Runner, StreamHandlers } from '../src/docker.js'
import { RemoteExec, runLocalStream, shouldRecycleConn } from '../src/ssh-exec.js'
import type { SshSpec } from '../src/ssh-exec.js'
import { apply, sseFrame } from '../src/index.js'

/* ------------------------------------------------------------------ *
 * 通用桩
 * ------------------------------------------------------------------ */

interface FakeChild extends EventEmitter {
  stdout: EventEmitter
  stderr: EventEmitter
  kill: ReturnType<typeof vi.fn>
}

/** 假 ChildProcess：只实现 runLocalStream 用到的 data / error / close / kill。 */
function makeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = vi.fn(() => true)
  return child
}

function makeHandlers(): StreamHandlers & { stdout: string[]; stderr: string[] } {
  const stdout: string[] = []
  const stderr: string[] = []
  return {
    stdout,
    stderr,
    onStdout: (chunk) => stdout.push(chunk),
    onStderr: (chunk) => stderr.push(chunk),
  }
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  spawnMock.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

/* ------------------------------------------------------------------ *
 * 1. SSE 帧封装
 * ------------------------------------------------------------------ */

describe('sseFrame', () => {
  it('line 帧把换行 / 引号转义成单行 JSON（不会在 SSE 行边界截断）', () => {
    const frame = sseFrame('line', { d: '第一行\n第二行 "quoted"\r\n' })
    expect(frame.startsWith('event: line\ndata: ')).toBe(true)
    expect(frame.endsWith('\n\n')).toBe(true)
    // data 行必须只有一行：帧体内除结尾的空行外不能再出现裸换行
    const body = frame.slice(0, -2)
    expect(body.split('\n')).toHaveLength(2)
    const dataLine = body.split('\n')[1] ?? ''
    expect(dataLine.includes('\\n')).toBe(true)
    expect(dataLine.includes('\\r')).toBe(true)
    const payload = JSON.parse(dataLine.slice('data: '.length)) as { d: string }
    expect(payload.d).toBe('第一行\n第二行 "quoted"\r\n')
  })

  it('多字节字符经 JSON 往返不丢失（UTF-8 中文 / emoji）', () => {
    const text = '日志 🐳 正常'
    const payload = JSON.parse(sseFrame('line', { e: text }).split('\n')[1].slice('data: '.length)) as { e: string }
    expect(payload.e).toBe(text)
  })

  it('end / error 帧格式固定', () => {
    expect(sseFrame('end', { reason: 'container-exit', code: 137 })).toBe(
      'event: end\ndata: {"reason":"container-exit","code":137}\n\n',
    )
    expect(sseFrame('error', { message: 'SSH exec 失败' })).toBe(
      'event: error\ndata: {"message":"SSH exec 失败"}\n\n',
    )
  })
})

/* ------------------------------------------------------------------ *
 * 2. DockerApi.logsStream 的 argv 与校验
 * ------------------------------------------------------------------ */

function fakeStreamRunner(): { runner: Runner; calls: Array<{ argv: string[]; signal?: AbortSignal }> } {
  const calls: Array<{ argv: string[]; signal?: AbortSignal }> = []
  const runner: Runner = {
    label: 'fake',
    async run() {
      throw new Error('run 不应在日志流路径被调用')
    },
    async stream(argv, _handlers, signal) {
      calls.push({ argv: [...argv], ...(signal === undefined ? {} : { signal }) })
      return { code: 0 }
    },
  }
  return { runner, calls }
}

describe('DockerApi.logsStream', () => {
  it('--follow 紧跟 logs，tail / timestamps / since 与快照同一构造', async () => {
    const { runner, calls } = fakeStreamRunner()
    const api = new DockerApi(runner, 'docker', { timeoutMs: 1000, maxBytes: 1024 })
    await api.logsStream('web', { tail: 10, timestamps: true, since: '10m' }, makeHandlers())
    expect(calls[0]?.argv).toEqual(['docker', 'logs', '--follow', '--tail', '10', '--timestamps', '--since', '10m', 'web'])
  })

  it('缺省 tail=200，越界夹紧到 1..5000', async () => {
    const { runner, calls } = fakeStreamRunner()
    const api = new DockerApi(runner, 'docker', { timeoutMs: 1000, maxBytes: 1024 })
    await api.logsStream('web', undefined, makeHandlers())
    expect(calls[0]?.argv).toEqual(['docker', 'logs', '--follow', '--tail', '200', 'web'])
    await api.logsStream('web', { tail: 999_999 }, makeHandlers())
    expect(calls[1]?.argv).toEqual(['docker', 'logs', '--follow', '--tail', '5000', 'web'])
    await api.logsStream('web', { tail: -5 }, makeHandlers())
    expect(calls[2]?.argv).toEqual(['docker', 'logs', '--follow', '--tail', '1', 'web'])
  })

  it('容器 ID 走 assertRef 白名单：注入尝试不触达执行器', async () => {
    const { runner, calls } = fakeStreamRunner()
    const api = new DockerApi(runner, 'docker', { timeoutMs: 1000, maxBytes: 1024 })
    await expect(api.logsStream('web; rm -rf /', undefined, makeHandlers())).rejects.toThrow(/含非法字符/)
    await expect(api.logsStream('', undefined, makeHandlers())).rejects.toThrow(/不能为空/)
    expect(calls).toHaveLength(0)
  })

  it('AbortSignal 原样透传给 Runner.stream', async () => {
    const { runner, calls } = fakeStreamRunner()
    const api = new DockerApi(runner, 'docker', { timeoutMs: 1000, maxBytes: 1024 })
    const controller = new AbortController()
    await api.logsStream('web', {}, makeHandlers(), controller.signal)
    expect(calls[0]?.signal).toBe(controller.signal)
  })

  it('createRunner：local 分派 runLocalStream（真 spawn 走假桩）', async () => {
    const child = makeChild()
    spawnMock.mockReturnValue(child)
    const runner = createRunner({
      target: { name: '本机', kind: 'local' },
      remote: new RemoteExec({ info: () => {}, warn: () => {} }, { get: () => undefined, record: () => {} }),
      logger: { info: () => {}, warn: () => {} },
    })
    const handlers = makeHandlers()
    const pending = runner.stream(['docker', 'logs', '--follow', 'web'], handlers)
    expect(spawnMock).toHaveBeenCalledTimes(1)
    const call = spawnMock.mock.calls[0] as [string, string[]]
    expect(call[0]).toBe('docker')
    expect(call[1]).toEqual(['logs', '--follow', 'web'])
    child.stdout.emit('data', Buffer.from('hi\n'))
    child.emit('close', 0)
    await expect(pending).resolves.toEqual({ code: 0 })
    expect(handlers.stdout.join('')).toBe('hi\n')
  })
})

/* ------------------------------------------------------------------ *
 * 3. runLocalStream 生命周期
 * ------------------------------------------------------------------ */

describe('runLocalStream', () => {
  it('正常 close：resolve 退出码，stdout / stderr 分片回调', async () => {
    const child = makeChild()
    spawnMock.mockReturnValue(child)
    const handlers = makeHandlers()
    const pending = runLocalStream(['docker', 'logs', '--follow', 'web'], handlers)
    child.stdout.emit('data', Buffer.from('out-1\n'))
    child.stderr.emit('data', Buffer.from('err-1\n'))
    child.emit('close', 0)
    await expect(pending).resolves.toEqual({ code: 0 })
    expect(handlers.stdout).toEqual(['out-1\n'])
    expect(handlers.stderr).toEqual(['err-1\n'])
  })

  it('跨 chunk 的多字节字符由 StringDecoder 补齐（不产生乱码）', async () => {
    const child = makeChild()
    spawnMock.mockReturnValue(child)
    const handlers = makeHandlers()
    const pending = runLocalStream(['docker', 'logs', '--follow', 'web'], handlers)
    const buf = Buffer.from('日志')
    child.stdout.emit('data', buf.subarray(0, 2))
    child.stdout.emit('data', buf.subarray(2))
    child.emit('close', 0)
    await pending
    expect(handlers.stdout).toEqual(['日志'])
  })

  it('close 时冲刷解码器残片（末尾不完整字符也不丢）', async () => {
    const child = makeChild()
    spawnMock.mockReturnValue(child)
    const handlers = makeHandlers()
    const pending = runLocalStream(['docker', 'logs', '--follow', 'web'], handlers)
    const buf = Buffer.from('日')
    child.stdout.emit('data', buf.subarray(0, 1))
    child.emit('close', 1)
    await expect(pending).resolves.toEqual({ code: 1 })
    // 残片用替换字符兜底（解码器 end() 会吐出已缓存的字节）
    expect(handlers.stdout.join('')).toContain('\uFFFD')
  })

  it('abort 阶梯：SIGTERM → 2s 未退出再 SIGKILL，close 时 resolve null', async () => {
    vi.useFakeTimers()
    const child = makeChild()
    spawnMock.mockReturnValue(child)
    const controller = new AbortController()
    const pending = runLocalStream(['docker', 'logs', '--follow', 'web'], makeHandlers(), controller.signal)
    controller.abort()
    expect(child.kill).toHaveBeenCalledTimes(1)
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    await vi.advanceTimersByTimeAsync(1999)
    expect(child.kill).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(child.kill).toHaveBeenCalledTimes(2)
    expect(child.kill).toHaveBeenLastCalledWith('SIGKILL')
    child.emit('close', null)
    await expect(pending).resolves.toEqual({ code: null })
  })

  it('SIGTERM 后及时退出：不再补 SIGKILL', async () => {
    vi.useFakeTimers()
    const child = makeChild()
    spawnMock.mockReturnValue(child)
    const controller = new AbortController()
    const pending = runLocalStream(['docker', 'logs', '--follow', 'web'], makeHandlers(), controller.signal)
    controller.abort()
    child.emit('close', null)
    await expect(pending).resolves.toEqual({ code: null })
    await vi.advanceTimersByTimeAsync(5000)
    expect(child.kill).toHaveBeenCalledTimes(1)
  })

  it('spawn error（如 ENOENT）reject 且带 bin 名', async () => {
    const child = makeChild()
    spawnMock.mockReturnValue(child)
    const pending = runLocalStream(['docker', 'logs', '--follow', 'web'], makeHandlers())
    child.emit('error', new Error('spawn docker ENOENT'))
    await expect(pending).rejects.toThrow(/无法执行 docker：spawn docker ENOENT/)
  })

  it('空 argv 抛错', () => {
    expect(() => runLocalStream([], makeHandlers())).toThrow(/至少一个 argv/)
  })
})

/* ------------------------------------------------------------------ *
 * 4. SSH 长流的 busy 计数与 sweeper 判定
 * ------------------------------------------------------------------ */

interface ConnLike {
  client: unknown
  lastUsed: number
  ready: Promise<unknown>
  busy: number
}

interface FakeChannel extends EventEmitter {
  stderr: EventEmitter
  signal: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
}

function makeRemoteHarness(): {
  remote: RemoteExec
  channel: FakeChannel
  conn: ConnLike
  execCalls: string[]
} {
  const remote = new RemoteExec({ info: () => {}, warn: () => {} }, { get: () => undefined, record: () => {} })
  const channel = new EventEmitter() as FakeChannel
  channel.stderr = new EventEmitter()
  channel.signal = vi.fn()
  channel.close = vi.fn()
  const execCalls: string[] = []
  const client = {
    exec: (command: string, callback: (error: undefined, channel: unknown) => void) => {
      execCalls.push(command)
      callback(undefined, channel)
    },
  }
  const conn: ConnLike = { client, lastUsed: 0, ready: Promise.resolve(client), busy: 0 }
  const internals = remote as unknown as {
    conns: Map<string, ConnLike>
    acquire: (spec: SshSpec) => Promise<unknown>
  }
  internals.conns.set('root@10.0.0.5:22', conn)
  internals.acquire = async () => client
  return { remote, channel, conn, execCalls }
}

const SPEC: SshSpec = { host: '10.0.0.5', username: 'root' }

describe('RemoteExec.stream', () => {
  it('流期间 busy=1，close 后配对归零并刷新 lastUsed', async () => {
    const { remote, channel, conn, execCalls } = makeRemoteHarness()
    const handlers = makeHandlers()
    const pending = remote.stream(SPEC, ['docker', 'logs', '--follow', 'web'], handlers)
    // stream() 是 async：acquire 的 await 会在微任务里继续，等一拍再断言
    await tick()
    expect(conn.busy).toBe(1)
    // argv 经 shJoin 单引号转义后交给远端 shell
    expect(execCalls[0]).toBe("'docker' 'logs' '--follow' 'web'")
    channel.emit('data', Buffer.from('hello\n'))
    channel.emit('close', 0)
    await expect(pending).resolves.toEqual({ code: 0 })
    expect(conn.busy).toBe(0)
    expect(conn.lastUsed).toBeGreaterThan(0)
    expect(handlers.stdout).toEqual(['hello\n'])
  })

  it('abort 走 channel.signal(KILL) + close（不 client.end），busy 同样归零', async () => {
    const { remote, channel, conn } = makeRemoteHarness()
    const controller = new AbortController()
    const pending = remote.stream(SPEC, ['docker', 'logs', '--follow', 'web'], makeHandlers(), controller.signal)
    await tick()
    expect(conn.busy).toBe(1)
    controller.abort()
    expect(channel.signal).toHaveBeenCalledWith('KILL')
    expect(channel.close).toHaveBeenCalledTimes(1)
    channel.emit('close', null)
    await expect(pending).resolves.toEqual({ code: null })
    expect(conn.busy).toBe(0)
  })

  it('channel error：reject 且 busy 不泄漏', async () => {
    const { remote, channel, conn } = makeRemoteHarness()
    const pending = remote.stream(SPEC, ['docker', 'logs', '--follow', 'web'], makeHandlers())
    await tick()
    expect(conn.busy).toBe(1)
    channel.emit('error', new Error('connection lost'))
    await expect(pending).rejects.toThrow(/SSH exec channel 异常：connection lost/)
    expect(conn.busy).toBe(0)
  })

  it('stderr 分片与 stdout 分开回调，跨 chunk 多字节不丢', async () => {
    const { remote, channel } = makeRemoteHarness()
    const handlers = makeHandlers()
    const pending = remote.stream(SPEC, ['docker', 'logs', '--follow', 'web'], handlers)
    await tick()
    const buf = Buffer.from('错误')
    channel.stderr.emit('data', buf.subarray(0, 2))
    channel.stderr.emit('data', buf.subarray(2))
    channel.emit('close', 0)
    await pending
    expect(handlers.stderr).toEqual(['错误'])
    expect(handlers.stdout).toEqual([])
  })
})

describe('shouldRecycleConn', () => {
  it('busy>0 的连接永不按空闲回收（长流期间 lastUsed 不刷新）', () => {
    expect(shouldRecycleConn({ lastUsed: 0, busy: 1 }, 10 * 60_000)).toBe(false)
    expect(shouldRecycleConn({ lastUsed: 0, busy: 3 }, 10 * 60_000, 1000)).toBe(false)
  })

  it('空闲阈值默认 120s：到点回收，未到不回收', () => {
    const conn = { lastUsed: 1000, busy: 0 }
    expect(shouldRecycleConn(conn, 1000 + 119_999)).toBe(false)
    expect(shouldRecycleConn(conn, 1000 + 120_000)).toBe(true)
    expect(shouldRecycleConn(conn, 1000 + 500, 500)).toBe(true)
  })
})

/* ------------------------------------------------------------------ *
 * 5. 路由 GET /logs/stream（假 ctx + 假 req/res）
 * ------------------------------------------------------------------ */

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
    headers: { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080', 'content-type': 'application/json' },
    socket: { remoteAddress },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  }
}

/** 最小假 cordis ctx：与 scripts/route-smoke.mjs 同思路（这里只服务 SSE 用例）。 */
function makeCtx(): { ctx: Record<string, unknown>; state: { routes: FakeRoute[]; tools: Array<Record<string, unknown>>; prompts: Array<Record<string, unknown>>; listeners: Map<string, Array<(...args: unknown[]) => void>>; settingsStored: Record<string, unknown>; baseConfig: Record<string, unknown> } } {
  const state = {
    routes: [] as FakeRoute[],
    tools: [] as Array<Record<string, unknown>>,
    prompts: [] as Array<Record<string, unknown>>,
    listeners: new Map<string, Array<(...args: unknown[]) => void>>(),
    settingsStored: {} as Record<string, unknown>,
    /** 本插件 entry 的安装级配置（= apply 的 config），由 mountPlugin 回填。 */
    baseConfig: {} as Record<string, unknown>,
  }
  /** loader 检出 volatile-only 变更后发的事件（测试里同步发，验证热更新路径）。 */
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
      logger: { info: () => {}, warn: () => {} },
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
      // DSH ≥0.1.7 的 settings 服务（SettingsForms）：describe / update / configure。
      child.settings = {
        describe: () => [{ ns: 'docker', value: { ...state.baseConfig, ...state.settingsStored } }],
        update: async (ns: string, patch: Record<string, unknown>) => {
          if (ns !== 'docker') throw new Error('未知的 entry: ' + ns)
          Object.assign(state.settingsStored, patch)
          emitVolatile()
        },
        configure: () => () => {},
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

const STREAM_PATH = '/api/dsh-docker/logs/stream?target=本机&id=web&tail=50&timestamps=1'

function mountPlugin(): { route: FakeRoute; state: ReturnType<typeof makeCtx>['state'] } {
  const { ctx, state } = makeCtx()
  const config = { dockerBin: 'docker', targets: [{ name: '本机', kind: 'local' }] }
  state.baseConfig = config as Record<string, unknown>
  ;(apply as unknown as (ctx: unknown, config: unknown) => void)({ ...ctx }, config)
  const route = state.routes.find((item) => item.path === '/api/dsh-docker')
  if (route === undefined) throw new Error('未注册 /api/dsh-docker 路由')
  return { route, state }
}

describe('GET /logs/stream（SSE 路由）', () => {
  it('响应头 / flushHeaders / 事件序列：line(stdout) → line(stderr) → end', async () => {
    const { route } = mountPlugin()
    const child = makeChild()
    spawnMock.mockReturnValue(child)
    const res = makeRes()
    const pending = route.handler(makeReq(STREAM_PATH), res)
    expect(spawnMock).toHaveBeenCalledTimes(1)
    const [bin, args] = spawnMock.mock.calls[0] as [string, string[]]
    expect(bin).toBe('docker')
    expect(args).toEqual(['logs', '--follow', '--tail', '50', '--timestamps', 'web'])
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('text/event-stream; charset=utf-8')
    expect(res.headers['cache-control']).toBe('no-cache')
    expect(res.headers.connection).toBe('keep-alive')
    expect(res.flushed).toBe(true)

    child.stdout.emit('data', Buffer.from('out\n'))
    child.stderr.emit('data', Buffer.from('err\n'))
    child.emit('close', 3)
    await pending
    expect(res.frames).toEqual([
      sseFrame('line', { d: 'out\n' }),
      sseFrame('line', { e: 'err\n' }),
      sseFrame('end', { reason: 'container-exit', code: 3 }),
    ])
    expect(res.ended).toBe(true)
  })

  it('心跳：每 15s 一帧注释 ping', async () => {
    vi.useFakeTimers()
    const { route } = mountPlugin()
    const child = makeChild()
    spawnMock.mockReturnValue(child)
    const res = makeRes()
    const pending = route.handler(makeReq(STREAM_PATH), res)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(res.frames).toContain(': ping\n\n')
    child.emit('close', 0)
    await pending
    // 收尾后心跳必须停：再推进时间不再产生帧
    const before = res.frames.length
    await vi.advanceTimersByTimeAsync(60_000)
    expect(res.frames.length).toBe(before)
  })

  it('客户端断开：静默中止（SIGTERM 阶梯），不写 end / error 帧', async () => {
    const { route } = mountPlugin()
    const child = makeChild()
    spawnMock.mockReturnValue(child)
    const res = makeRes()
    const pending = route.handler(makeReq(STREAM_PATH), res)
    res.emitClose()
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    child.emit('close', null)
    await pending
    expect(res.frames).toEqual([])
    expect(res.ended).toBe(false)
  })

  it('docker 启动失败：error 帧后关闭（先收头再报错）', async () => {
    const { route } = mountPlugin()
    const child = makeChild()
    spawnMock.mockReturnValue(child)
    const res = makeRes()
    const pending = route.handler(makeReq(STREAM_PATH), res)
    child.emit('error', new Error('spawn docker ENOENT'))
    await pending
    expect(res.frames).toEqual([sseFrame('error', { message: '无法执行 docker：spawn docker ENOENT' })])
    expect(res.ended).toBe(true)
  })

  it('插件禁用（applySection）会统一 end + abort 活跃流', async () => {
    const { route } = mountPlugin()
    const child = makeChild()
    spawnMock.mockReturnValue(child)
    const res = makeRes()
    const pending = route.handler(makeReq(STREAM_PATH), res)
    expect(res.status).toBe(200)

    // POST /config {enabled:false} → applySection → closeAllLogStreams
    const configRes = makeRes()
    await route.handler(makeReq('/api/dsh-docker/config', 'POST', '127.0.0.1', { enabled: false }), configRes)
    expect(configRes.status).toBe(200)
    expect(res.ended).toBe(true)
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')

    child.emit('close', null)
    await pending
    expect(res.frames).toEqual([])
  })

  it('参数校验：缺 id / 非法 id / 未知目标 / 非 GET / 非 loopback 都不开流', async () => {
    const { route } = mountPlugin()
    const cases: Array<{ url: string; method?: string; remote?: string; status: number; pattern: RegExp }> = [
      { url: '/api/dsh-docker/logs/stream?target=本机', status: 400, pattern: /id 必填/ },
      { url: '/api/dsh-docker/logs/stream?target=本机&id=web%3B%20rm%20-rf%20%2F', status: 400, pattern: /含非法字符/ },
      { url: '/api/dsh-docker/logs/stream?target=nope&id=web', status: 400, pattern: /未知目标/ },
      { url: STREAM_PATH, method: 'POST', status: 405, pattern: /method not allowed/ },
      { url: STREAM_PATH, remote: '10.0.0.9', status: 403, pattern: /loopback-only/ },
    ]
    for (const item of cases) {
      const res = makeRes()
      await route.handler(makeReq(item.url, item.method ?? 'GET', item.remote ?? '127.0.0.1'), res)
      expect(res.status, item.url).toBe(item.status)
      expect(String(res.endBody), item.url).toMatch(item.pattern)
      expect(spawnMock).not.toHaveBeenCalled()
    }
  })
})
