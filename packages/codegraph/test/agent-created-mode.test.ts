/**
 * CG50 的回归：`agent/created` 必须按**生效**的裁决（`scopeDecision.mode`）决定挂不挂
 * per-agent，而不是用户「想要」的那个模式（`current.mcpScope`）。
 *
 * 为什么单开一个文件、而且要挂**真插件**：这个 bug 不在 `scope.ts` 的纯函数里（那些
 * 判据都是对的），而在 `apply()` 里那条接线——把 wanted 传给了 `attach`。所以
 * `agent-scope.test.ts` 的挂载器用例（全部显式传 `'per-agent'`）**盖不住**它：
 * 必须让「裁决结果」与「用户想要的值」分叉，再看真插件怎么挂。
 *
 * 两个分叉场景（都来自 `resolveScopeMode` 的显式退回）：
 *   1. `mcpIntegration: false` → 裁决是「两种模式都不挂」；
 *   2. 区块外手工 codegraph 行 → 裁决是「插件无权顶掉用户的显式配置」。
 * 两者在旧实现下都会**照挂不误**（已实测复现：日志同时出现「已退回」与「per-agent
 * MCP 已挂载」）。
 *
 * 隔离：`apply()` 会写 `$DSH_HOME/cordis.patch.yml`，所以整个文件把 DSH_HOME 指到
 * 临时目录（CG45 的教训）。
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apply } from '../src/index.js'
import { rmStubDir, writeStubCli } from './stub-cli.js'

const sandbox = mkdtempSync(join(tmpdir(), 'dsh-cg-cg50-'))
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
const echoCli = writeStubCli(sandbox, 'cg50-echo', 'console.log(JSON.stringify(process.argv.slice(2)))')

/** 造一个已索引目录（`.codegraph/` 里有索引库）。 */
function indexedDir(name: string): string {
  const dir = mkdtempSync(join(sandbox, name))
  mkdirSync(join(dir, '.codegraph'), { recursive: true })
  writeFileSync(join(dir, '.codegraph', 'codegraph.db'), '')
  return dir
}

/**
 * 有界地等一个**事件**——不要睡固定毫秒。
 *
 * 这个文件原先用 `wait(150)` / `wait(250)` 等两件事：CLI 探测落地、per-agent 挂载完成。
 * 前者**根本不用等**（`agentMountDecision` 只在 `cliAvailable === false` 时不挂，见 CG41：
 * 用 `!== true` 会把「探测还没落地」窗口里创建的 agent 静默漏掉），后者本身是一个可观测
 * 事件（假 `ctx.plugin` 被调用）。
 *
 * 睡固定毫秒的代价实测过：2026-10-25 的 `pnpm flake:check`（3 份全量套件并发、2× 超订）里
 * 这条用例红了一次，`calls` 还是空数组——报 `expected [] to have a length of 1`。那台机器
 * load≈125，250ms 的预算被调度吃掉，而实现是对的。
 *
 * 超时仍然给（5s）：真挂不上要有界地红，且红在**等待的那件事**上，而不是含糊的用例超时。
 */
function withTimeout<T>(promise: Promise<T>, what: string, timeoutMs = 5_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`等「${what}」超时（${String(timeoutMs)}ms）`))
    }, timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      },
    )
  })
}

interface FakeResponse {
  readonly status: number | undefined
  readonly body: Record<string, unknown> | undefined
}

function fakeReq(): unknown {
  return {
    method: 'GET',
    url: '/api/dsh-codegraph/agents',
    headers: { host: '127.0.0.1:3082' },
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() {},
  }
}

function fakeRes(): FakeResponse & { res: unknown } {
  const state: { status?: number; body?: Record<string, unknown> } = {}
  return {
    get status() { return state.status },
    get body() { return state.body },
    res: {
      writeHead(status: number) { state.status = status },
      end(body?: string) { state.body = body === undefined ? undefined : (JSON.parse(body) as Record<string, unknown>) },
      on() {},
      get writableEnded() { return true },
    },
  }
}

interface Mounted {
  /** 手工派发一个宿主事件（`agent/created` 等）。 */
  fire(name: string, payload: unknown): void
  /** 读 `/agents` 台账（卡片看到的那份）。 */
  agents(): Promise<Record<string, unknown>>
}

/**
 * `/agents` 台账里的逐条记录。
 *
 * 用来把「没挂」这条断言从「此刻没挂」收紧成「裁决落过地，且它选了不挂」——否则
 * `mounted === 0` 在「异步链路还没跑到」时也成立，那是一条会假绿的断言。
 */
function records(ledger: Record<string, unknown>): Array<{ id?: unknown; mounted?: unknown; reason?: unknown }> {
  const list = ledger.agents
  return Array.isArray(list) ? (list as Array<{ id?: unknown; mounted?: unknown; reason?: unknown }>) : []
}

/** 挂载在途时记录上写的就是这一句（见 scope.ts 的 attach：记录先落，`loadClient()` 是异步的）。 */
const MOUNTING = '正在挂载…'

/**
 * 等到 `/agents` 台账里某个 agent 的记录满足条件（有界 5s，10ms 轮询）。
 *
 * 为什么必须等：`attach` 在「该挂」的分支上是**异步**的（`loadClient()` 是动态 import），
 * 记录先落成 `reason: MOUNTING`，挂完才翻成「已挂载」；而在「按裁决不挂」的分支上，记录
 * 是**同步**落地的终态。只断言「此刻 calls 是空的」，等于把「裁决说不挂」和「还没挂完」
 * 混为一谈——那是一条会假绿的断言。
 *
 * 这不是推测：变异验证里把 attach 改回按 wanted 挂（CG50 的原始 bug），没有这一步的写法
 * 三条「不该挂」的用例照样全绿。
 */
async function waitForRecord(
  ledger: () => Promise<Record<string, unknown>>,
  id: string,
  satisfied: (record: { mounted?: unknown; reason?: unknown }) => boolean,
  what: string,
  timeoutMs = 5_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const record = records(await ledger()).find((item) => item.id === id)
    if (record !== undefined && satisfied(record)) return
    if (Date.now() > deadline) {
      throw new Error(
        `等「${what}」超时（${String(timeoutMs)}ms）：台账里 ${id} 的记录是 ${JSON.stringify(record ?? null)}`,
      )
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

/** 挂真插件：只提供 webServer（路由）、on（事件）、get('agents')（事件面探测）。 */
function mount(config: Record<string, unknown>): Mounted {
  const routes = new Map<string, { handler: (req: unknown, res: unknown) => Promise<void> }>()
  const listeners = new Map<string, (payload: unknown) => void>()
  const ctx = {
    inject(names: string[], callback: (sub: unknown) => void) {
      if (!names.includes('webServer')) return
      callback({
        effect: (fn: () => unknown) => fn(),
        webServer: {
          register(route: { path: string; handler: (req: unknown, res: unknown) => Promise<void> }) {
            routes.set(route.path, route)
            return () => {}
          },
        },
      })
    },
    on(name: string, listener: (payload: unknown) => void) {
      listeners.set(name, listener)
      return () => {}
    },
    get(name: string) { return name === 'agents' ? { list: () => [] } : undefined },
    effect(fn: () => unknown) { fn() },
  }
  apply(ctx as never, config as never)
  return {
    fire(name, payload) { listeners.get(name)?.(payload) },
    async agents() {
      const route = routes.get('/api/dsh-codegraph/agents')
      expect(route, '未注册 /agents 路由').toBeDefined()
      const capture = fakeRes()
      await route?.handler(fakeReq(), capture.res)
      return capture.body ?? {}
    },
  }
}

/**
 * 假 agent：`ctx.plugin` 被调用 = 真的起了一份 per-agent MCP。
 *
 * `onMount` 是「挂载落地」这个**事件**的出口（等它，而不是睡一会儿再断言）——
 * `PluginFiberLike` 本身是 thenable，但这里要的是「调用发生过」这一刻。
 */
function makeAgent(id: string, cwd: string, calls: unknown[], onMount?: () => void): unknown {
  return {
    id,
    session: { id, header: { cwd } },
    ctx: {
      plugin: (_client: unknown, config: unknown) => {
        calls.push(config)
        onMount?.()
        return { dispose: () => {} }
      },
    },
  }
}

describe('CG50：agent/created 按「生效的裁决」挂载，而不是「想要的模式」', () => {
  it('MCP 联动关闭时：即使存了 per-agent 也不挂（裁决说两种模式都不挂）', async () => {
    const dir = indexedDir('closed-')
    const calls: unknown[] = []
    const mounted = mount({
      command: echoCli,
      defaultPath: dir,
      mcpScope: 'per-agent',
      mcpIntegration: false,
      announceToAgent: false,
      usageGuidance: false,
    })
    // 不用等：裁决在 apply() 里同步落地，`attach` 也在 `agent/created` 派发中同步写记录
    mounted.fire('agent/created', { agent: makeAgent('cg50-closed', dir, calls) })
    // 但要等它**离开「正在挂载…」**——那才区分得开「裁决说不挂」与「还没挂完」（见 waitForRecord）
    await waitForRecord(() => mounted.agents(), 'cg50-closed', (record) => record.reason !== MOUNTING, '裁决落地')

    expect(calls, '联动关闭时不该起 per-agent 进程').toEqual([])
    const agents = await mounted.agents()
    expect(agents.mode).toBe('managed')
    expect(agents.requested).toBe('per-agent')  // 用户确实选了 per-agent
    expect(agents.fallback).toBe(true)          // 但实际退回了 managed（卡片据此显示「已退回」）
    expect(agents.mounted).toBe(0)
    // 「没挂」必须是**裁决落过地之后**的结论，而不是「异步链路还没跑到」
    expect(records(agents).find((record) => record.id === 'cg50-closed')?.mounted).toBe(false)
  })

  it('区块外有手工 codegraph 行时：退回 managed，也不挂 per-agent', async () => {
    const dir = indexedDir('external-')
    // 区块外的手工行（用户的显式配置）——它与 per-agent 挂载同名，正是退回 managed 的理由
    writeFileSync(patchFile, [
      '- insert:',
      '    - id: hand-written-codegraph',
      "      name: '@deepseek-ai/dsh-mcp-client'",
      '      config:',
      '        serverName: codegraph',
      '        transport: stdio',
      '        command: codegraph',
      "        args: ['serve', '--mcp']",
      '        cwd: ' + dir,
      '',
    ].join('\n'))

    const calls: unknown[] = []
    const mounted = mount({
      command: echoCli,
      defaultPath: dir,
      mcpScope: 'per-agent',
      mcpIntegration: true,
      announceToAgent: false,
      usageGuidance: false,
    })
    // 同第一条用例：裁决与 `attach` 都是同步的，不需要「等一会儿」；但要等记录离开「正在挂载…」
    mounted.fire('agent/created', { agent: makeAgent('cg50-external', dir, calls) })
    await waitForRecord(() => mounted.agents(), 'cg50-external', (record) => record.reason !== MOUNTING, '裁决落地')

    expect(calls, '检测到手工行时不该起 per-agent 进程').toEqual([])
    const agents = await mounted.agents()
    expect(agents.mode).toBe('managed')
    expect(agents.fallback).toBe(true)
    expect(agents.mounted).toBe(0)
    expect(records(agents).find((record) => record.id === 'cg50-external')?.mounted).toBe(false)
  })

  it('对照组：前提齐备时 per-agent 真的挂上（证明上面两条不是「永远不挂」）', async () => {
    const dir = indexedDir('effective-')
    writeFileSync(patchFile, '') // 清掉上一条用例的手工行
    const calls: unknown[] = []
    const mounted = mount({
      command: echoCli,
      defaultPath: dir,
      mcpScope: 'per-agent',
      mcpIntegration: true,
      announceToAgent: false,
      usageGuidance: false,
    })
    // 等「插件实例被创建」这个事件，而不是睡一会儿再断言（见 withTimeout 的注释）
    let mountedOnce!: () => void
    const mountLanded = new Promise<void>((resolve) => { mountedOnce = resolve })
    mounted.fire('agent/created', { agent: makeAgent('cg50-effective', dir, calls, mountedOnce) })
    await withTimeout(mountLanded, 'per-agent 插件实例被创建（= 挂载落地）')
    await waitForRecord(() => mounted.agents(), 'cg50-effective', (record) => record.mounted === true, '台账翻成已挂载')

    expect(calls, '前提齐备时应当挂载').toHaveLength(1)
    const agents = await mounted.agents()
    expect(agents.mode).toBe('per-agent')
    expect(agents.fallback).toBe(false)
    expect(agents.mounted).toBe(1)
  })

  it('裁决还没落地时保守回落 managed（不挂），不按 wanted 抢跑', async () => {
    // 拿不到 agents 服务 → agentEventsAvailable=false → 裁决必然退回 managed
    const dir = indexedDir('no-events-')
    const calls: unknown[] = []
    const routes = new Map<string, { handler: (req: unknown, res: unknown) => Promise<void> }>()
    const listeners = new Map<string, (payload: unknown) => void>()
    const ctx = {
      inject(names: string[], callback: (sub: unknown) => void) {
        if (!names.includes('webServer')) return
        callback({ effect: (fn: () => unknown) => fn(), webServer: { register(route: { path: string; handler: (req: unknown, res: unknown) => Promise<void> }) { routes.set(route.path, route); return () => {} } } })
      },
      on(name: string, listener: (payload: unknown) => void) { listeners.set(name, listener); return () => {} },
      get() { return undefined }, // 没有 agents 服务
      effect(fn: () => unknown) { fn() },
    }
    apply(ctx as never, {
      command: echoCli,
      defaultPath: dir,
      mcpScope: 'per-agent',
      announceToAgent: false,
      usageGuidance: false,
    } as never)
    listeners.get('agent/created')?.({ agent: makeAgent('cg50-no-events', dir, calls) })

    // 同前三条：等记录离开「正在挂载…」，把「没挂」落在「裁决落过地」上
    const readLedger = async (): Promise<Record<string, unknown>> => {
      const route = routes.get('/api/dsh-codegraph/agents')
      expect(route, '未注册 /agents 路由').toBeDefined()
      const capture = fakeRes()
      await route?.handler(fakeReq(), capture.res)
      return capture.body ?? {}
    }
    await waitForRecord(readLedger, 'cg50-no-events', (record) => record.reason !== MOUNTING, '裁决落地')

    expect(calls).toEqual([])
    expect((await readLedger()).mounted).toBe(0)
  })
})
