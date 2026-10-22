/**
 * CG69 的回归：**agent 服务迟到**时不能永久退回 managed。
 *
 * 为什么单开一个文件：缺陷不在 `scope.ts` 的纯函数里（那些判据都是对的），而在
 * `apply()` 里那次「一次性抽样」——`ctx.get('agents')` 只回答「此刻 ACTIVE 没有」，
 * 而 loader 用 `Promise.all` 并发创建 entry、行序不构成加载顺序（cordis 4 的
 * `_getImpl`：`strict && impl.fiber.state !== 2` 时返回 undefined）。抽样落到 LOADING
 * 窗口里就会得到 `agentEventsAvailable = false`，`resolveScopeMode` 据此把 per-agent
 * **永久**退回 managed；而 managed 的托管行在没有已索引默认项目时是空的（`insert: []`）
 * → `mcp__codegraph__*` 一个工具都不注册。
 *
 * 真机事故（2026-10-21，桌面端 0.2.1-rc.1）：插件重载后同一进程里**新建**的会话全都没有
 * 工具，`/agents` 台账 count=0，而几小时前同样的会话是好的——所以这不是环境噪声，是
 * 「一次抽样被当成稳定事实」。
 *
 * 修法：`ctx.inject(['agents'])` 兜住服务迟到，到货后按**最近一次设置**重跑一次 sync，
 * 由 `applyScopeMode` 的「模式变了才动手」判据收敛（幂等）。
 *
 * 隔离：`apply()` 会写 `$DSH_HOME/cordis.patch.yml`，整个文件把 DSH_HOME 指到临时目录
 * （CG68 的教训：`pnpm test` 不许碰用户真实补丁）。
 */
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apply } from '../src/index.js'
import { rmStubDir, writeStubCli } from './stub-cli.js'

const sandbox = mkdtempSync(join(tmpdir(), 'dsh-cg-cg69-'))
const dshHome = join(sandbox, 'dsh-home')
const patchFile = join(dshHome, 'cordis.patch.yml')
const originalDshHome = process.env.DSH_HOME

beforeAll(() => {
  mkdirSync(dshHome, { recursive: true })
  process.env.DSH_HOME = dshHome
})

afterAll(() => {
  if (originalDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = originalDshHome
  rmStubDir(sandbox)
})

/** 回显 argv 的假 CLI：探测（`--version`）与调用都能跑通。 */
const echoCli = writeStubCli(sandbox, 'cg69-echo', 'console.log(JSON.stringify(process.argv.slice(2)))')

/** 造一个已索引目录（`.codegraph/` 里有索引库）。 */
function indexedDir(name: string): string {
  const dir = mkdtempSync(join(sandbox, name))
  mkdirSync(join(dir, '.codegraph'), { recursive: true })
  writeFileSync(join(dir, '.codegraph', 'codegraph.db'), '')
  return dir
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

interface Mounted {
  /** 让 `ctx.inject(['agents'], …)` 的回调真正跑一次（模拟提供者 fiber 转为 ACTIVE）。 */
  deliverAgents(): void
  /** 已注册的 HTTP 路由（用例直接打，与卡片同一入口）。 */
  routes: Map<string, { handler: (req: unknown, res: unknown) => Promise<void> }>
  fire(name: string, payload: unknown): void
  agents(): Promise<Record<string, unknown>>
}

interface MountOptions {
  /**
   * `agents` 在 apply 期是否已经可用。
   *
   * `false` 复现事故形状：apply 抽样时服务还没 ACTIVE（`get('agents')` → undefined），
   * 但插件**注册过** `inject(['agents'])`，之后依赖就绪时回调会被调用。
   */
  agentsAtApply: boolean
}

/**
 * 挂真插件。
 *
 * 与 `agent-created-mode.test.ts` 的 `mount()` 关键差异：那份 fixture 的
 * `get('agents')` **恒返回服务**，竞态窗口在测试里根本不存在——这正是 CG69 长期没被
 * 盖住的原因。这里把「apply 期能否读到服务」做成旋钮，并单独保留 inject 回调，
 * 让用例能精确重现「先没有、后到货」。
 */
function mount(config: Record<string, unknown>, options: MountOptions): Mounted {
  const routes = new Map<string, { handler: (req: unknown, res: unknown) => Promise<void> }>()
  const listeners = new Map<string, (payload: unknown) => void>()
  const pendingInject = new Map<string, (sub: unknown) => void>()
  let agentsLive = options.agentsAtApply
  const agentsService = { list: (): unknown[] => [] }

  /** 假的 settings 存储（只有本 entry 一份 resolved 值；update 合并进用户层）。 */
  const stored: Record<string, unknown> = {}
  const settingsChanges = new Set<() => void>()
  const settingsService = {
    describe: () => [{ ns: 'codegraph', value: { ...stored } }],
    async update(_ns: string, patch: object) {
      Object.assign(stored, patch as Record<string, unknown>)
      for (const listener of settingsChanges) listener()
    },
    configure: () => () => {},
  }

  const webSub = {
    effect: (fn: () => unknown) => fn(),
    webServer: {
      register(route: { path: string; handler: (req: unknown, res: unknown) => Promise<void> }) {
        routes.set(route.path, route)
        return () => {}
      },
    },
  }
  /** 宿主服务的读取口：`agents` 由 options 决定「此刻 ACTIVE 没有」，`settings` 恒在。 */
  const read = (name: string): unknown => {
    if (name === 'agents') return agentsLive ? agentsService : undefined
    if (name === 'settings') return settingsService
    return undefined
  }
  /** 事件订阅（也是给 inject 子 ctx 用的同一个实现：kit 的 settings 口要调它）。 */
  const on = (name: string, listener: (payload: unknown) => void): (() => void) => {
    listeners.set(name, listener)
    // settings 的变更订阅走 loader/volatile-update（kit 适配层的口径）
    if (name === 'loader/volatile-update') {
      const fire = () => listener()
      settingsChanges.add(fire)
      return () => { settingsChanges.delete(fire) }
    }
    return () => { listeners.delete(name) }
  }
  const ctx = {
    inject(names: string[], callback: (sub: unknown) => void) {
      if (names.includes('webServer')) {
        callback(webSub)
        return
      }
      if (names.includes('settings')) {
        // settings 分支拿到的子 ctx 还要能订阅（kit 的 onChanged 走 ctx.on）
        callback({ ...webSub, get: read, on })
        return
      }
      if (names.includes('agents')) {
        // 记下回调：服务还没 ACTIVE 时 cordis 也不会立刻跑它，这里同口径
        pendingInject.set('agents', callback)
        if (agentsLive) callback({ get: read, on, effect: (fn: () => unknown) => fn() })
      }
    },
    on,
    get: read,
    effect(fn: () => unknown) { fn() },
  }
  apply(ctx as never, config as never)
  return {
    routes,
    deliverAgents() {
      agentsLive = true
      pendingInject.get('agents')?.({ get: read, on, effect: (fn: () => unknown) => fn() })
    },
    fire(name, payload) { listeners.get(name)?.(payload) },
    async agents() {
      const route = routes.get('/api/dsh-codegraph/agents')
      expect(route, '未注册 /agents 路由').toBeDefined()
      let body: Record<string, unknown> | undefined
      const capture = {
        writeHead() {},
        end(text?: string) { body = text === undefined ? undefined : (JSON.parse(text) as Record<string, unknown>) },
        on() {},
        get writableEnded() { return true },
      }
      await route?.handler({
        method: 'GET',
        url: '/api/dsh-codegraph/agents',
        headers: { host: '127.0.0.1:3082' },
        socket: { remoteAddress: '127.0.0.1' },
        async *[Symbol.asyncIterator]() {},
      }, capture)
      return body ?? {}
    },
  }
}

/** 假 agent：`ctx.plugin` 被调用 = 真的起了一份 per-agent MCP。 */
function makeAgent(id: string, cwd: string, calls: unknown[]): unknown {
  return {
    id,
    session: { id, header: { cwd } },
    ctx: { plugin: (_client: unknown, config: unknown) => { calls.push(config); return { dispose: () => {} } } },
  }
}

describe('CG69：agent 服务迟到时不能永久退回 managed', () => {
  it('apply 期读不到 agents（LOADING 窗口）→ 先退回 managed', async () => {
    const dir = indexedDir('cg69-before-')
    const mounted = mount({
      command: echoCli,
      defaultPath: dir,
      mcpScope: 'per-agent',
      announceToAgent: false,
      usageGuidance: false,
    }, { agentsAtApply: false })
    await wait(150)

    // 事故形状：没有事件面就退回 managed（这是 resolveScopeMode 的正确行为，不是 bug）
    const agents = await mounted.agents()
    expect(agents.mode).toBe('managed')
    expect(agents.requested).toBe('per-agent')
    expect(agents.fallback).toBe(true)
  })

  it('服务到货后同一个实例自动重算 → per-agent 生效，且已活着的 agent 被补挂', async () => {
    const dir = indexedDir('cg69-after-')
    const calls: unknown[] = []
    const mounted = mount({
      command: echoCli,
      defaultPath: dir,
      mcpScope: 'per-agent',
      announceToAgent: false,
      usageGuidance: false,
    }, { agentsAtApply: false })
    await wait(150)

    expect((await mounted.agents()).mode, '到货前应当是 managed').toBe('managed')

    // 提供者 fiber 转 ACTIVE：cordis 会在这个时点跑 inject 回调
    mounted.deliverAgents()
    await wait(150)

    const agents = await mounted.agents()
    expect(agents.mode, '服务到货后必须重新裁决成 per-agent').toBe('per-agent')
    expect(agents.fallback).toBe(false)
    expect(agents.reason).toContain('per-agent')

    // 之后新建的 agent 必须真的挂上（事故里断的就是这一步）
    mounted.fire('agent/created', { agent: makeAgent('cg69-late', dir, calls) })
    await wait(200)
    expect(calls, '服务到货之后新建的 agent 应当挂载').toHaveLength(1)
    expect((await mounted.agents()).mounted).toBe(1)
  })

  it('重算沿用卡片里的设置，不退回安装级默认值', async () => {
    /*
     * 这条防的是修法的**次生伤害**：补挂时若无脑重跑 sync（不传 settings 快照），
     * 解析值会退回 plugin config 的 defaultPath 等安装级默认值——用户在卡片里调过的
     * 东西被一次迟到事件悄悄抹掉。判据用「重算后默认路径还是卡片里那个」。
     */
    const bound = indexedDir('cg69-bound-')
    const other = indexedDir('cg69-other-')
    const mounted = mount({
      // 安装级默认路径指向 other；卡片里（settings）绑定的是 bound
      command: echoCli,
      defaultPath: other,
      mcpScope: 'per-agent',
      announceToAgent: false,
      usageGuidance: false,
    }, { agentsAtApply: false })
    await wait(150)

    // 用户在卡片里点「设为默认项目」（写入走 settings.update，与 GUI 同一入口）
    const boundRoute = mounted.routes.get('/api/dsh-codegraph/default-path')
    expect(boundRoute, '未注册 /default-path 路由').toBeDefined()
    const saved = await postJson(boundRoute!, { path: bound }, '/api/dsh-codegraph/default-path')
    expect(saved.ok, '「设为默认项目」应当成功：' + JSON.stringify(saved)).toBe(true)
    await wait(100)

    mounted.deliverAgents()
    await wait(150)

    const info = await getDefaultPath(mounted)
    expect(info.defaultPath, '重算后不能退回安装级 defaultPath').toBe(bound)
    // 字段名与 /default-path 的 GET 契约一致：effectiveMcpScope 才是「实际生效」的那个
    expect(info.effectiveMcpScope).toBe('per-agent')
  })

  it('迟到重跑只变一次并稳定下来：不会形成 写盘→热重载→再 sync 的自激回环', async () => {
    /*
     * 这条钉的是修法的**次生风险**：`refreshAgentSurface()` 会再走一次
     * `syncMcpRowOnDisk`，而这个文件是**热重载面**（loader watch 它）。真正的危险不是
     * 「迟到时写了一次」——切到 per-agent 本来就要把托管行删成 `insert: []`（互斥），
     * 那一次写入是**必须**的；危险的是**写完还在变**：只要「内容没变」时真的不落盘，
     * 就不会出现「sync → 写盘 → 热重载 → 再 sync」的自激回环。
     *
     * 所以判据是**稳定性**，不是「一次都不写」：触发迟到补挂 → 记下状态 → 再触发一次
     * 同等的重算 → 第二次必须零改动（内容与 mtime 都不变）。
     *
     * 为什么不能只靠 managed-mcp.test.ts 的幂等用例：那些断言的是**纯函数**
     * `syncManagedMcpRow(...).changed === false`；而回环的条件是**磁盘写入**——纯函数
     * 说「没变化」与「文件真的没被碰」之间还隔着 syncMcpRowOnDisk 那层读改写。
     */
    const dir = indexedDir('cg69-nochurn-')
    const mounted = mount({
      command: echoCli,
      defaultPath: dir,
      mcpScope: 'per-agent',
      announceToAgent: false,
      usageGuidance: false,
    }, { agentsAtApply: false })
    // 等首次 sync 落地（它会真的写一次托管行：从无到有是**该**写的）
    await wait(200)
    expect(mounted.routes.get('/api/dsh-codegraph/agents')).toBeDefined()

    // 触发迟到补挂：这里会重跑一次 sync，并按互斥把托管行删成 `insert: []`
    mounted.deliverAgents()
    await wait(200)

    expect((await mounted.agents()).mode, '前提：迟到后确实切到了 per-agent').toBe('per-agent')
    expect(readFileSync(patchFile, 'utf8'), '切到 per-agent 后全局托管行应被挂起（互斥）').toContain('- insert: []')

    // 稳定点：再触发一次**真正会重跑 sync** 的操作（写入同值设置 → volatile 变更 → sync），
    // 文件必须一个字节都不动，否则热重载会再触发 sync 形成回环。
    // 注意不能用 deliverAgents() 来触发：那会撞上 `if (agentEventsAvailable) return`，
    // 根本走不到 sync——这正是本条最早写成空断言的原因。
    const settled = readFileSync(patchFile, 'utf8')
    const settledMtime = statSync(patchFile).mtimeMs
    const settingsRoute = mounted.routes.get('/api/dsh-codegraph/settings')
    expect(settingsRoute, '未注册 /settings 路由').toBeDefined()
    const again = await postJson(settingsRoute!, { mcpScope: 'per-agent' }, '/api/dsh-codegraph/settings')
    expect(again.ok, '同值写设置应当成功：' + JSON.stringify(again)).toBe(true)
    await wait(250)

    expect((await mounted.agents()).mode, '同值重算后仍是 per-agent').toBe('per-agent')
    expect(readFileSync(patchFile, 'utf8'), '内容未变时不该重写补丁（否则热重载会再触发 sync）').toBe(settled)
    expect(statSync(patchFile).mtimeMs, 'mtime 变了说明又落了一次盘').toBe(settledMtime)
  })
})

/* ---- 小工具：直接走路由（与卡片同一入口） ---- */

async function postJson(
  route: { handler: (req: unknown, res: unknown) => Promise<void> },
  payload: unknown,
  url: string,
): Promise<Record<string, unknown>> {
  const body = JSON.stringify(payload)
  const req = {
    method: 'POST',
    url,
    headers: { host: '127.0.0.1:3082', 'content-type': 'application/json', 'content-length': String(body.length) },
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() { yield Buffer.from(body) },
  }
  let parsed: Record<string, unknown> | undefined
  const res = {
    writeHead() {},
    end(text?: string) { parsed = text === undefined ? undefined : (JSON.parse(text) as Record<string, unknown>) },
    on() {},
    get writableEnded() { return true },
  }
  await route.handler(req, res)
  return parsed ?? {}
}

async function getDefaultPath(mounted: Mounted): Promise<Record<string, unknown>> {
  const route = mounted.routes.get('/api/dsh-codegraph/default-path')
  expect(route, '未注册 /default-path 路由').toBeDefined()
  let parsed: Record<string, unknown> | undefined
  const res = {
    writeHead() {},
    end(text?: string) { parsed = text === undefined ? undefined : (JSON.parse(text) as Record<string, unknown>) },
    on() {},
    get writableEnded() { return true },
  }
  await route!.handler({
    method: 'GET',
    url: '/api/dsh-codegraph/default-path',
    headers: { host: '127.0.0.1:3082' },
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() {},
  }, res)
  return parsed ?? {}
}
