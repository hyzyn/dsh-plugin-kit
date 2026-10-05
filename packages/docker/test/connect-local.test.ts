/**
 * @hyzyn/dsh-docker — 一键连接本机（`POST /connect-local` + `docker_connect_local`）的宿主回归。
 *
 * 这个功能的设计目标是「**保守的显式一键**」，所以下面每一条用例都对应一条**不许退化**的性质：
 *
 *   1. 早已配好一堆 SSH 目标、就是没有本机目标 —— 点一下要能**追加**一条本机目标并选中它，
 *      其余目标（含顺序、凭据）原样保留；
 *   2. 已经有一条本机目标 —— 复用，**绝不**再建第二条（重复点 / 并发点都落在同一条上）；
 *   3. 设置存储不可用 / 保存失败 —— 明确报错（带原因），且**不改内存配置**（no-op，不留半个状态）；
 *   4. 保存成功但 daemon 连不上 —— 这是**成功**（目标真的加上了），但必须把成因说出来：
 *      「daemon 未启动」「CLI 缺失」「socket 无权」三种要分得开，而不是只报「没有容器」；
 *   5. 空 `targets` / `clearTargets` 的既有语义不变；不凭空产生隐式默认目标；
 *   6. 能力授权**不因此放宽**：这条路径不需要任何授权，但也没有顺手打开任何开关。
 *
 * 授权隔离与 `config-route.test.ts` 同款：`apply()` 会按 `dshHome()` 打开能力授权文件，
 * 整个文件把 `DSH_HOME` 指到临时目录，避免开发机上「真用过一次就地提权」导致用例假红。
 */
import { EventEmitter } from 'node:events'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const originalDshHome = process.env.DSH_HOME
const isolatedDshHome = mkdtempSync(join(tmpdir(), 'dsh-docker-connect-local-'))
process.env.DSH_HOME = isolatedDshHome
afterAll(() => {
  if (originalDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = originalDshHome
  rmSync(isolatedDshHome, { recursive: true, force: true })
})

/*
 * 假 docker CLI：只服务 `docker version --format {{.Server.Version}}`（probe 唯一会跑的命令）。
 * 三种形态覆盖三档成因：
 *   - ok：退出 0 + 版本号（daemon 可达）；
 *   - down：非零退出 + 真实 docker 的 stderr 文案（daemon 未启动 / 连不上）；
 *   - enoent：spawn 时抛 ENOENT（CLI 不在 PATH）——走 runLocal 的 `child.once('error')` 分支。
 */
type SpawnMode = 'ok' | 'down' | 'enoent'

const spawnState = vi.hoisted(() => ({ mode: 'ok' as 'ok' | 'down' | 'enoent' }))

const spawnMock = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({ spawn: spawnMock }))

import { apply } from '../src/index.js'
import { LOCAL_TARGET_NAME, describeLocalProbeFailure, findAlternativeLocalCli, findLocalTargetName, isLocalCliMissing, nextLocalTargetName } from '../src/index.js'
import type { DockerTarget } from '../src/index.js'

/* ------------------------------------------------------------------ *
 * 假 child_process（EventEmitter 形状，与 runLocal 用到的接口一致）
 * ------------------------------------------------------------------ */

function installSpawnStub(): void {
  spawnMock.mockImplementation(() => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter
      stderr: EventEmitter
      stdin: { end(): void }
      kill(): void
    }
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.stdin = { end() {} }
    child.kill = () => {}
    const mode = spawnState.mode
    setImmediate(() => {
      if (mode === 'enoent') {
        child.emit('error', new Error('spawn docker ENOENT'))
        return
      }
      if (mode === 'down') {
        child.stderr.emit('data', Buffer.from('Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?\n'))
        child.emit('close', 1)
        return
      }
      child.stdout.emit('data', Buffer.from('27.3.1\n'))
      child.emit('close', 0)
    })
    return child
  })
}

/* ------------------------------------------------------------------ *
 * 最小假宿主（只搭 webServer + settings + tools；能力授权保持未授权）
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

function makeReq(url: string, method: string, body?: unknown, headers: Record<string, string> = {}): unknown {
  const payload = body === undefined ? '' : JSON.stringify(body)
  const chunks = payload === '' ? [] : [Buffer.from(payload)]
  const requestHeaders: Record<string, string> = { host: '127.0.0.1:3092', 'content-type': 'application/json', origin: 'http://127.0.0.1:3092', ...headers }
  if (requestHeaders.origin === '') delete requestHeaders.origin
  return {
    method,
    url,
    headers: requestHeaders,
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  }
}

interface ToolDefinition {
  name: string
  parameters?: unknown
  execute(args: unknown): Promise<unknown>
}

interface Harness {
  route: FakeRoute
  tools: ToolDefinition[]
  settingsStored: Record<string, unknown>
  updates: Array<Record<string, unknown>>
  /** 模拟「保存失败」（settings.update 抛错）。 */
  failUpdate(error: Error): void
}

function mountPlugin(options: { targets?: DockerTarget[]; noSettings?: boolean; enabled?: boolean } = {}): Harness {
  const state = {
    routes: [] as FakeRoute[],
    tools: [] as ToolDefinition[],
    listeners: new Map<string, Array<(...args: unknown[]) => void>>(),
    settingsStored: {} as Record<string, unknown>,
    updates: [] as Array<Record<string, unknown>>,
    failure: null as Error | null,
  }
  const emitVolatile = (): void => {
    for (const listener of state.listeners.get('loader/volatile-update') ?? []) listener()
  }
  const settingsService = {
    describe: () => [{ ns: 'docker', value: { ...state.settingsStored } }],
    update: async (ns: string, patch: Record<string, unknown>) => {
      if (ns !== 'docker') throw new Error('未知的 entry: ' + ns)
      if (state.failure !== null) throw state.failure
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
    if (names.includes('webServer')) {
      child.webServer = {
        register: (route: FakeRoute) => {
          state.routes.push(route)
          return () => {}
        },
      }
    }
    if (names.includes('settings') && options.noSettings !== true) child.settings = settingsService
    if (names.includes('tools')) {
      child.tools = {
        register: (definition: ToolDefinition) => {
          state.tools.push(definition)
          return () => {
            const index = state.tools.indexOf(definition)
            if (index >= 0) state.tools.splice(index, 1)
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
  ;(apply as unknown as (ctx: unknown, config: unknown) => void)(root, {
    dockerBin: 'docker',
    targets: options.targets ?? [],
    ...(options.enabled === undefined ? {} : { enabled: options.enabled }),
  })
  const route = state.routes.find((item) => item.path === '/api/dsh-docker')
  if (route === undefined) throw new Error('未注册 /api/dsh-docker 路由')
  return {
    route,
    tools: state.tools,
    settingsStored: state.settingsStored,
    updates: state.updates,
    failUpdate(error: Error) {
      state.failure = error
    },
  }
}

async function callConnectLocal(harness: Harness, method = 'POST'): Promise<{
  status: number
  json: {
    ok?: boolean
    error?: string
    result?: { name?: string; created?: boolean; saved?: boolean; reachable?: boolean; serverVersion?: string; message?: string }
    config?: { targets?: Array<Record<string, unknown>>; allowMutations?: boolean; allowExec?: boolean }
  } | undefined
}> {
  const res = makeRes()
  await harness.route.handler(makeReq('/api/dsh-docker/connect-local', method, method === 'POST' ? {} : undefined), res)
  return { status: res.status, json: res.endBody === undefined ? undefined : JSON.parse(res.endBody) }
}

function storedTargets(harness: Harness): Array<Record<string, unknown>> {
  const value = harness.settingsStored.targets
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : []
}

const SSH_TARGET: DockerTarget = { name: '远程', kind: 'ssh', book: 'prod-a' }
const CUSTOM_LOCAL: DockerTarget = { name: '本机-自定义', kind: 'local' }

beforeEach(() => {
  spawnState.mode = 'ok'
  installSpawnStub()
})

afterEach(() => {
  spawnMock.mockReset()
})

/* ------------------------------------------------------------------ *
 * 1. 纯判定：命名与失败成因
 * ------------------------------------------------------------------ */

describe('本机目标命名（确定性、无冲突）', () => {
  it('空列表 → 稳定的 `local`', () => {
    expect(nextLocalTargetName([])).toBe(LOCAL_TARGET_NAME)
    expect(LOCAL_TARGET_NAME).toBe('local')
  })

  it('`local` 被占 → 顺着 local-2、local-3 找第一个空位（不被顺序 / 缺口影响）', () => {
    expect(nextLocalTargetName(['local'])).toBe('local-2')
    expect(nextLocalTargetName(['local', 'local-2'])).toBe('local-3')
    expect(nextLocalTargetName(['local', 'local-3'])).toBe('local-2')
    expect(nextLocalTargetName(['远程', 'local-2'])).toBe('local')
  })

  it('findLocalTargetName 只认 kind=local 的第一条', () => {
    expect(findLocalTargetName([])).toBeUndefined()
    expect(findLocalTargetName([SSH_TARGET])).toBeUndefined()
    expect(findLocalTargetName([SSH_TARGET, CUSTOM_LOCAL])).toBe('本机-自定义')
  })
})

describe('本地探测失败 → 可执行的一句话（按成因分档）', () => {
  it('CLI 缺失（runLocal 的 ENOENT 抛错形态）', () => {
    const text = describeLocalProbeFailure('无法执行 docker：spawn docker ENOENT')
    expect(text).toContain('找不到 docker CLI')
    expect(text).toContain('安装 Docker')
  })

  it('daemon 未启动（docker CLI 自己非零退出）', () => {
    const text = describeLocalProbeFailure('Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?')
    expect(text).toContain('连不上 docker daemon')
    expect(text).toContain('Docker Desktop')
  })

  it('socket 无权访问', () => {
    const text = describeLocalProbeFailure('permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock')
    expect(text).toContain('无权访问 docker socket')
    expect(text).toContain('docker 组')
  })

  it('其它原因原样透出（不硬套前面的档位）', () => {
    expect(describeLocalProbeFailure('context "foo" does not exist')).toContain('context "foo" does not exist')
    expect(describeLocalProbeFailure('')).toContain('没有返回任何信息')
  })

  it('超时单独一档：不落进「退出码 null」那种零信息量的兜底', () => {
    const text = describeLocalProbeFailure('docker version 超时（15 秒未返回）', 'docker', { timedOut: true })
    expect(text).toContain('15 秒没返回')
    expect(text).toContain('context') // 指向可查的 docker context
    expect(text).not.toContain('退出码 null')
  })

  it('CLI 缺失且 PATH 里有别的容器 CLI：点出候选，并写明面板不替你改', () => {
    const text = describeLocalProbeFailure('无法执行 docker：spawn docker ENOENT', 'docker', { alternativeCli: 'podman' })
    expect(text).toContain('找不到 docker CLI')
    expect(text).toContain('装了 podman')
    expect(text).toContain('面板不会替你改')
  })

  it('CLI 缺失但没有候选：不提候选（不说一句空话）', () => {
    const text = describeLocalProbeFailure('无法执行 docker：spawn docker ENOENT', 'docker', {})
    expect(text).toContain('安装 Docker')
    expect(text).not.toContain('面板不会替你改')
  })

  it('文案里的 bin 用配置值原样回显（不是硬编码 docker）', () => {
    expect(describeLocalProbeFailure('无法执行 podman：spawn podman ENOENT', 'podman')).toContain('（podman）')
  })
})

describe('isLocalCliMissing：文案分档与「要不要找候选」共用同一判据', () => {
  it('ENOENT 三种形态都认', () => {
    expect(isLocalCliMissing('无法执行 docker：spawn docker ENOENT')).toBe(true)
    expect(isLocalCliMissing("'docker' is not recognized as an internal or external command")).toBe(true)
    expect(isLocalCliMissing('docker: command not found')).toBe(true)
  })

  it('daemon / 权限类失败**不**算 CLI 缺失（否则会去 PATH 乱找候选）', () => {
    expect(isLocalCliMissing('Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?')).toBe(false)
    expect(isLocalCliMissing('permission denied while trying to connect to the Docker daemon socket')).toBe(false)
  })
})

describe('findAlternativeLocalCli：只读找候选，绝不改配置', () => {
  /**
   * 造一个隔离的 PATH 目录（不放真机路径——那会让这几条用例依赖跑测试的机器上
   * 恰好装了/没装什么，CI 上必飘）。空文件 + 可执行位就够 accessSync(X_OK) 认。
   */
  let cliDir = ''
  let emptyDir = ''
  beforeEach(() => {
    cliDir = mkdtempSync(join(tmpdir(), 'dsh-docker-cli-'))
    emptyDir = mkdtempSync(join(tmpdir(), 'dsh-docker-empty-'))
  })
  afterEach(() => {
    rmSync(cliDir, { recursive: true, force: true })
    rmSync(emptyDir, { recursive: true, force: true })
  })
  const install = (name: string): void => {
    writeFileSync(join(cliDir, name), '#!/bin/sh\n')
    chmodSync(join(cliDir, name), 0o755)
  }

  it('PATH 里没有候选时返回空', () => {
    expect(findAlternativeLocalCli('docker', { PATH: emptyDir })).toEqual([])
  })

  it('PATH 为空返回空（不抛错）', () => {
    expect(findAlternativeLocalCli('docker', { PATH: '' })).toEqual([])
  })

  it('PATH 里有 podman 时返回它（dockerBin=docker）', () => {
    install('podman')
    expect(findAlternativeLocalCli('docker', { PATH: cliDir })).toEqual(['podman'])
  })

  it('按 basename 比对：dockerBin 写成绝对路径时不会把同一个 docker 当候选', () => {
    // PATH 里只有 docker 一个 —— 若按原字符串比对（'/x/docker' !== 'docker'），
    // 就会给出「把 docker CLI 改成 docker」这种废话
    install('docker')
    expect(findAlternativeLocalCli(join(cliDir, 'docker'), { PATH: cliDir })).toEqual([])
  })

  it('dockerBin 已经是 podman 时，docker 成为候选', () => {
    install('docker')
    install('podman')
    const found = findAlternativeLocalCli('podman', { PATH: cliDir })
    expect(found).toEqual(['docker'])
  })

  it('多个候选按 docker → podman → nerdctl 的固定顺序返回', () => {
    install('nerdctl')
    install('podman')
    expect(findAlternativeLocalCli('docker', { PATH: cliDir })).toEqual(['podman', 'nerdctl'])
  })

  it('不可执行的文件不算（X_OK，不是「存在即可」）', () => {
    writeFileSync(join(cliDir, 'podman'), '#!/bin/sh\n')
    chmodSync(join(cliDir, 'podman'), 0o644)
    expect(findAlternativeLocalCli('docker', { PATH: cliDir })).toEqual([])
  })
})

/* ------------------------------------------------------------------ *
 * 2. POST /connect-local：添加 / 复用 / 保留别人
 * ------------------------------------------------------------------ */

describe('POST /connect-local', () => {
  it('全是 SSH 目标时：追加一条本机目标并选中，SSH 目标原样保留', async () => {
    const harness = mountPlugin({ targets: [SSH_TARGET] })
    const { status, json } = await callConnectLocal(harness)
    expect(status).toBe(200)
    expect(json?.ok).toBe(true)
    expect(json?.result?.name).toBe('local')
    expect(json?.result?.created).toBe(true)
    expect(json?.result?.saved).toBe(true)
    expect(json?.result?.reachable).toBe(true)
    expect(json?.result?.serverVersion).toBe('27.3.1')
    expect(json?.result?.message).toContain('已添加并选中本机目标「local」')
    /*
     * 写盘内容：老目标原样在最前（顺序不动），新目标只带 name / kind——其余字段由
     * normalizeConfig / sanitizeTargets 统一补默认值。断言**逐字段**而不是整对象 deepEqual：
     * 老目标在存储里是归一化后的完整形状（含 `auth` / `port` 等空默认值），而我要钉的是
     * 「它没被改动、也没被重写」这件事。
     */
    const stored = storedTargets(harness)
    expect(stored.map((item) => item.name)).toEqual(['远程', 'local'])
    expect(stored[0]).toMatchObject({ name: '远程', kind: 'ssh', book: 'prod-a' })
    expect(stored[1]).toEqual({ name: 'local', kind: 'local' })
    expect(harness.updates).toHaveLength(1)
    // 快照里能立刻看到这条目标（客户端按钮与下拉据此更新）
    expect(json?.config?.targets?.map((item) => item.name)).toEqual(['远程', 'local'])
    // 这条路径与能力开关无关：不顺手打开任何开关
    expect(json?.config?.allowMutations).toBe(false)
    expect(json?.config?.allowExec).toBe(false)
  })

  it('已有本机目标：复用它（created:false、不再写盘），名称不是 `local` 也算复用', async () => {
    const harness = mountPlugin({ targets: [SSH_TARGET, CUSTOM_LOCAL] })
    const { status, json } = await callConnectLocal(harness)
    expect(status).toBe(200)
    expect(json?.result?.name).toBe('本机-自定义')
    expect(json?.result?.created).toBe(false)
    expect(json?.result?.message).toContain('已选中本机目标')
    // 幂等：一次都没写（没有重复创建，也没有重写已有的那条）
    expect(harness.updates).toHaveLength(0)
    expect(storedTargets(harness)).toEqual([])
  })

  it('`local` 名字已被占用：另起确定性的 `local-2`，不覆盖也不改名', async () => {
    const harness = mountPlugin({ targets: [{ name: 'local', kind: 'ssh', host: '192.0.2.9', username: 'root' }] })
    const { json } = await callConnectLocal(harness)
    expect(json?.result?.name).toBe('local-2')
    const stored = storedTargets(harness)
    expect(stored.map((item) => item.name)).toEqual(['local', 'local-2'])
    // 名字撞上已有的 SSH 目标时不覆盖也不改名：那条 SSH 目标的地址/主机一字不动
    expect(stored[0]).toMatchObject({ name: 'local', kind: 'ssh', host: '192.0.2.9', username: 'root' })
    expect(stored[1]).toEqual({ name: 'local-2', kind: 'local' })
  })

  it('连点两次（第二次已有本机目标）：仍然只有一条本机目标', async () => {
    const harness = mountPlugin({ targets: [SSH_TARGET] })
    const first = await callConnectLocal(harness)
    const second = await callConnectLocal(harness)
    expect(first.json?.result?.created).toBe(true)
    expect(second.json?.result?.created).toBe(false)
    expect(second.json?.result?.name).toBe('local')
    expect(harness.updates).toHaveLength(1)
    expect(json(storedTargets(harness)).filter((item) => item.kind === 'local')).toHaveLength(1)
  })

  it('并发两次：串行化后同样只有一条（先到者建、后到者复用）', async () => {
    const harness = mountPlugin({ targets: [] })
    const [left, right] = await Promise.all([callConnectLocal(harness), callConnectLocal(harness)])
    expect(left.status).toBe(200)
    expect(right.status).toBe(200)
    expect([left.json?.result?.created, right.json?.result?.created].sort()).toEqual([false, true])
    expect(storedTargets(harness)).toHaveLength(1)
    expect(harness.updates).toHaveLength(1)
  })

  it('空 targets 不产生隐式默认目标：只有显式调用才写', async () => {
    const harness = mountPlugin({ targets: [] })
    expect(storedTargets(harness)).toEqual([])
    await callConnectLocal(harness)
    expect(storedTargets(harness)).toEqual([{ name: 'local', kind: 'local' }])
  })

  it('GET 一律 405（它是一条写路径）', async () => {
    const harness = mountPlugin({ targets: [] })
    const { status } = await callConnectLocal(harness, 'GET')
    expect(status).toBe(405)
    expect(harness.updates).toHaveLength(0)
  })

  it('跨站 POST 被同源证明拦截，不触发 settings 写入', async () => {
    const harness = mountPlugin({ targets: [] })
    const res = makeRes()
    await harness.route.handler(makeReq('/api/dsh-docker/connect-local', 'POST', {}, { origin: '' }), res)
    expect(res.status).toBe(403)
    expect(String(res.endBody)).toContain('origin=无')
    expect(harness.updates).toHaveLength(0)
  })

  it('插件被禁用时不放开这条写路径', async () => {
    /*
     * 实测形态比「403」更彻底：`enabled:false` 时 `apply()` 在注册路由之前就返回了
     * （`if (!live.enabled) return`），所以整条 `/api/dsh-docker` 前缀路由**根本不存在**——
     * 而设置卡片重新启用插件走的是宿主自己的 plugins 配置面，不依赖这条路由。
     * 这里钉的就是「禁用 = 这条一键写路径完全不存在」，无论它是 403 还是不注册。
     */
    let route: FakeRoute | undefined
    let message = ''
    try {
      route = mountPlugin({ targets: [], enabled: false }).route
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    expect(message).toMatch(/未注册 \/api\/dsh-docker 路由/)
    expect(route).toBeUndefined()
  })
})

/* ------------------------------------------------------------------ *
 * 3. 失败路径：设置不可用 / 保存失败
 * ------------------------------------------------------------------ */

describe('POST /connect-local：失败要说清原因且不留半个状态', () => {
  it('宿主没有 settings 服务 → 503，配置一个字节都没写', async () => {
    const harness = mountPlugin({ targets: [SSH_TARGET], noSettings: true })
    const { status, json } = await callConnectLocal(harness)
    expect(status).toBe(503)
    expect(String(json?.error)).toContain('设置存储不可用')
    expect(harness.updates).toHaveLength(0)
  })

  it('保存失败（settings.update 抛错）→ 500 带原原因，且不写盘、不改内存目标', async () => {
    const harness = mountPlugin({ targets: [SSH_TARGET] })
    harness.failUpdate(new Error('EACCES: settings.yaml 只读'))
    const { status, json } = await callConnectLocal(harness)
    expect(status).toBe(500)
    expect(String(json?.error)).toContain('保存本机目标失败')
    expect(String(json?.error)).toContain('EACCES')
    expect(harness.updates).toHaveLength(0)
    expect(storedTargets(harness)).toEqual([])
    // 内存里的 targets 也不该多出一条（再读一次 /config 验证）
    const res = makeRes()
    await harness.route.handler(makeReq('/api/dsh-docker/config', 'GET', undefined), res)
    expect(JSON.parse(res.endBody ?? '{}').config.targets.map((item: { name: string }) => item.name)).toEqual(['远程'])
  })
})

/* ------------------------------------------------------------------ *
 * 4. 保存成功但 daemon 不可达：是成功，但必须说出成因
 * ------------------------------------------------------------------ */

describe('POST /connect-local：本机 docker 不可用时的口径', () => {
  it('daemon 未启动：HTTP 200（目标真的加上了）+ reachable:false + 成因', async () => {
    spawnState.mode = 'down'
    const harness = mountPlugin({ targets: [] })
    const { status, json } = await callConnectLocal(harness)
    expect(status).toBe(200)
    expect(json?.result?.saved).toBe(true)
    expect(json?.result?.reachable).toBe(false)
    expect(json?.result?.serverVersion).toBeUndefined()
    expect(json?.result?.message).toContain('本机 docker 不可用')
    expect(json?.result?.message).toContain('连不上 docker daemon')
    expect(storedTargets(harness)).toHaveLength(1)
  })

  it('docker CLI 缺失：同样 200 + reachable:false，并指出去装 CLI / 改 dockerBin', async () => {
    spawnState.mode = 'enoent'
    const harness = mountPlugin({ targets: [] })
    const { status, json } = await callConnectLocal(harness)
    expect(status).toBe(200)
    expect(json?.result?.reachable).toBe(false)
    expect(json?.result?.message).toContain('找不到 docker CLI')
  })

  it('CLI 缺失但 PATH 里有 podman：路由原样把候选带进 message（只提示，不改配置）', async () => {
    /*
     * 这条走的是**真** accessSync：本文件只 mock 了 child_process，fs 是真的。
     * 把 PATH 指向一个自造的目录（里面只有一个可执行的 podman），就能确定性地
     * 驱动 localProbeReason → findAlternativeLocalCli 这条链，而不依赖跑测试的
     * 机器上装了什么。
     */
    const dir = mkdtempSync(join(tmpdir(), 'dsh-docker-alt-'))
    const originalPath = process.env.PATH
    try {
      writeFileSync(join(dir, 'podman'), '#!/bin/sh\n')
      chmodSync(join(dir, 'podman'), 0o755)
      process.env.PATH = dir
      spawnState.mode = 'enoent'
      const harness = mountPlugin({ targets: [] })
      const { status, json } = await callConnectLocal(harness)
      expect(status).toBe(200)
      expect(json?.result?.saved).toBe(true)
      expect(json?.result?.message).toContain('装了 podman')
      expect(json?.result?.message).toContain('面板不会替你改')
      // 关键不变式：只提示，绝不静默改写用户的 dockerBin
      expect(harness.updates.some((patch) => 'dockerBin' in patch)).toBe(false)
    } finally {
      if (originalPath === undefined) delete process.env.PATH
      else process.env.PATH = originalPath
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

/* ------------------------------------------------------------------ *
 * 5. agent 工具：同一份实现，参数与语义一致
 * ------------------------------------------------------------------ */

describe('docker_connect_local 工具', () => {
  it('恒注册（与能力开关无关），且没有必填参数', () => {
    const harness = mountPlugin({ targets: [] })
    const tool = harness.tools.find((item) => item.name === 'docker_connect_local')
    expect(tool).toBeDefined()
    // 与只读工具同一档：不因 allowMutations / allowExec 未授权而消失
    expect(harness.tools.map((item) => item.name)).toContain('docker_ps')
  })

  it('execute 走的是同一条 connectLocal：结果形状与路由一致', async () => {
    const harness = mountPlugin({ targets: [SSH_TARGET] })
    const tool = harness.tools.find((item) => item.name === 'docker_connect_local')
    const value = await tool?.execute({})
    expect(value).toMatchObject({ name: 'local', kind: 'local', created: true, saved: true, reachable: true, serverVersion: '27.3.1' })
    expect(storedTargets(harness)).toHaveLength(2)
  })

  it('设置不可用时抛错（工具结果里带上原因，而不是静默成功）', async () => {
    const harness = mountPlugin({ targets: [], noSettings: true })
    const tool = harness.tools.find((item) => item.name === 'docker_connect_local')
    await expect(tool?.execute({})).rejects.toThrow(/设置存储不可用/)
  })
})

const json = (value: unknown): Array<Record<string, unknown>> => (Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [])
