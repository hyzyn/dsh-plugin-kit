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

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

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

/** 假 agent：`ctx.plugin` 被调用 = 真的起了一份 per-agent MCP。 */
function makeAgent(id: string, cwd: string, calls: unknown[]): unknown {
  return {
    id,
    session: { id, header: { cwd } },
    ctx: { plugin: (_client: unknown, config: unknown) => { calls.push(config); return { dispose: () => {} } } },
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
    await wait(150) // 等 CLI 探测落地，避免挂载判定受「探测未落地」影响
    mounted.fire('agent/created', { agent: makeAgent('cg50-closed', dir, calls) })
    await wait(200)

    expect(calls, '联动关闭时不该起 per-agent 进程').toEqual([])
    const agents = await mounted.agents()
    expect(agents.mode).toBe('managed')
    expect(agents.requested).toBe('per-agent')  // 用户确实选了 per-agent
    expect(agents.fallback).toBe(true)          // 但实际退回了 managed（卡片据此显示「已退回」）
    expect(agents.mounted).toBe(0)
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
    await wait(150)
    mounted.fire('agent/created', { agent: makeAgent('cg50-external', dir, calls) })
    await wait(200)

    expect(calls, '检测到手工行时不该起 per-agent 进程').toEqual([])
    const agents = await mounted.agents()
    expect(agents.mode).toBe('managed')
    expect(agents.fallback).toBe(true)
    expect(agents.mounted).toBe(0)
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
    await wait(150)
    mounted.fire('agent/created', { agent: makeAgent('cg50-effective', dir, calls) })
    await wait(250)

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
    await wait(150)
    listeners.get('agent/created')?.({ agent: makeAgent('cg50-no-events', dir, calls) })
    await wait(200)
    expect(calls).toEqual([])
  })
})
