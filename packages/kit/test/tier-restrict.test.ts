/**
 * @hyzyn/dsh-kit — `attachTierRestrict` 的**挂载补算**（2026-10-25）。
 *
 * ## 这个能力解决的是什么
 *
 * 插件热重载 / 升级时，旧实例的 disposer 会把所有已下发的限制撤掉，而 `agent/created` 不会为
 * 已存在的会话再发一次。不补算，那些会话在升级后会一直看到全部工具（档位裁剪失效），直到会话
 * 重开。所以挂载时用 `ctx.inject(['agents'])` 的 `agents.list()` 把在活 agent 补进台账并应用
 * 一次；它们此后与 `agent/created` 进来的 agent 一样参与 `tools/change` 重算。
 *
 * ## 这里钉住四件事（每件都配了它要防的错法）
 *
 * 1. **挂载补算**：在活 agent 不靠 `agent/created` 也被裁到（只读档 → write / exec 消失）；
 * 2. **补算过的 agent 留在台账**：之后才注册的工具，也会在 `tools/change` 时按新注册集重算；
 * 3. **`agents` 服务缺失**：静默退化（只依赖 `agent/created`），不抛、不把插件带下去；
 * 4. **卸载**：补算下来的限制一并撤掉，重复调用安全。
 *
 * 夹具是宿主 `ToolRuntime` 的最小忠实实现（`restrict` 必须 scoped、未知名字整体抛、disposer
 * 幂等），与 `packages/docker/test/tier-restrict.test.ts` 同口径——但**不跨包 import 测试文件**。
 */
import { describe, expect, it } from 'vitest'
import { attachTierRestrict } from '../src/index.js'

/* ------------------------------------------------------------------ *
 * 假宿主：tools 服务（宿主语义逐条复刻）
 * ------------------------------------------------------------------ */

interface FakeToolsHandle {
  schemas(viewing?: object): Array<{ name: string }>
  restrict(filter: { allow?: readonly string[]; deny?: readonly string[] }): () => void
}

interface FakeToolsHost {
  /** 全局注册集（名字，注册顺序）。 */
  names(): string[]
  /** 某个 scope 的可见名（`schemas(scope)` 的投影；不传 = 全局视图）。 */
  namesFor(scope?: object): string[]
  /** 某个 scope 上还挂着几层限制（0 = 撤干净了）。 */
  restrictionCount(scope?: object): number
  /** **每一次**成功下发的 `restrict()`（断言去重 / 不重复下发用）。 */
  restrictCalls: Array<{ scope: object; deny: string[] }>
  /** 注册一个新工具（模拟「会话建立之后才条件注册」的真实形状）。 */
  register(name: string): () => void
  readonly global: FakeToolsHandle
  handleFor(scope: object): FakeToolsHandle
}

function createFakeToolsHost(): FakeToolsHost {
  const definitions = new Set<string>()
  const restrictions = new Map<object, Array<{ token: number; deny: Set<string> }>>()
  const listeners = new Set<() => void>()
  const restrictCalls: FakeToolsHost['restrictCalls'] = []
  let tokenSeq = 0

  const notify = (): void => {
    for (const listener of [...listeners]) listener()
  }

  const hiddenFor = (scope: object): Set<string> => {
    const hidden = new Set<string>()
    for (const restriction of restrictions.get(scope) ?? []) {
      for (const name of definitions) if (restriction.deny.has(name)) hidden.add(name)
    }
    return hidden
  }

  const makeHandle = (scope?: object): FakeToolsHandle => ({
    schemas(viewing?: object): Array<{ name: string }> {
      const hidden = viewing === undefined ? new Set<string>() : hiddenFor(viewing)
      return [...definitions].filter((name) => !hidden.has(name)).map((name) => ({ name }))
    },

    restrict(filter: { allow?: readonly string[]; deny?: readonly string[] }): () => void {
      if (scope === undefined) {
        throw new Error('tools.restrict() requires a scoped context (agent.ctx): a context-global restriction would mask every agent')
      }
      if (filter?.allow === undefined && filter?.deny === undefined) {
        throw new Error('tools.restrict({}) is a no-op: pass `allow` and/or `deny`')
      }
      // 宿主：名单里任何一个名字不在**当前全局工具集**里 → 整体抛（不是忽略那一条）。
      const named = [...(filter.allow ?? []), ...(filter.deny ?? [])]
      const unknown = named.filter((name) => !definitions.has(name))
      if (unknown.length > 0) {
        throw new Error(`tools.restrict() names unknown global tool${unknown.length > 1 ? 's' : ''} ${unknown.map((name) => `"${name}"`).join(', ')}`)
      }
      restrictCalls.push({ scope, deny: [...(filter.deny ?? [])] })
      const compiled = { token: ++tokenSeq, deny: new Set(filter.deny ?? []) }
      const list = restrictions.get(scope) ?? []
      list.push(compiled)
      restrictions.set(scope, list)
      notify()
      let live = true
      return () => {
        if (!live) return
        live = false
        const current = restrictions.get(scope)
        if (current === undefined) return
        const next = current.filter((entry) => entry.token !== compiled.token)
        if (next.length === 0) restrictions.delete(scope)
        else restrictions.set(scope, next)
        notify()
      }
    },
  })

  const global: FakeToolsHandle & { register(name: string): () => void; onchange(listener: () => void): () => void } = {
    ...makeHandle(undefined),
    register(name: string): () => void {
      definitions.add(name)
      notify()
      return () => {
        definitions.delete(name)
        notify()
      }
    },
    onchange(listener: () => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }

  return {
    names: () => [...definitions],
    namesFor: (viewing?: object) => global.schemas(viewing).map((schema) => schema.name),
    restrictionCount: (viewing?: object) => (viewing === undefined ? 0 : (restrictions.get(viewing)?.length ?? 0)),
    restrictCalls,
    register: (name: string) => global.register(name),
    global,
    handleFor: (viewing: object) => makeHandle(viewing),
  }
}

/* ------------------------------------------------------------------ *
 * 假 ctx + 档位服务
 * ------------------------------------------------------------------ */

type TierMode = 'read-only' | 'workspace-write' | 'danger-full-access'

interface FakeTier {
  mode?: TierMode
  policy?: 'ask' | 'never'
  auto?: boolean
}

interface Mounted {
  host: FakeToolsHost
  createAgent(id: string): Record<string, unknown>
  /** 挂载时已经存在的 agent（`agents.list()` 的成员）。 */
  agentFor(id: string): Record<string, unknown> | undefined
  emit(name: string, ...args: unknown[]): void
  logs(): string[]
  /** `attachTierRestrict` 的返回值（disposer）。 */
  dispose(): void
  unmount(): void
}

/** 一套注册集：`demo_read` 是 read，其余是 write / exec。 */
const TOOLS = ['demo_read', 'demo_write', 'demo_exec']
const CLASS: Record<string, 'read' | 'write' | 'exec'> = {
  demo_read: 'read',
  demo_write: 'write',
  demo_exec: 'exec',
}

function mount(options: {
  tier?: FakeTier
  prefixes?: readonly string[]
  log?: (message: string) => void
  /** 挂载**之前**就活着的 agent（模拟插件热重载：`agent/created` 不会为它们再发一次）。 */
  preexistingAgents?: readonly string[]
  /** false = 模拟老宿主：没有 `agents` 服务。 */
  withAgentsService?: boolean
} = {}): Mounted {
  const host = createFakeToolsHost()
  for (const name of TOOLS) host.register(name)

  const listeners = new Map<string, Array<(...args: unknown[]) => void>>()
  const cleaners: Array<() => unknown> = []
  const logs: string[] = []
  const emit = (name: string, ...args: unknown[]): void => {
    for (const listener of [...(listeners.get(name) ?? [])]) listener(...args)
  }

  /** agent 的形状与 `agent/created` 的载荷同口径（`ctx.tools` 才是 scoped 的那一份）。 */
  const makeAgent = (id: string): Record<string, unknown> => {
    const agent: Record<string, unknown> = { id, session: { id, header: { cwd: '/ws' } }, ctx: {} }
    ;(agent.ctx as Record<string, unknown>).tools = host.handleFor(agent)
    return agent
  }
  /** 宿主 `agents.list()` 的成员（插件挂载时用来补算在活 agent）。 */
  const liveAgents = (options.preexistingAgents ?? []).map(makeAgent)

  const tierServices: Record<string, unknown> = {}
  if (options.withAgentsService !== false) tierServices.agents = { list: () => [...liveAgents] }
  if (options.tier !== undefined) {
    tierServices.sandboxPolicy = {
      resolve: () => ({ mode: options.tier?.mode ?? 'read-only', workspaceRoot: '/ws' }),
    }
    tierServices.approval = { overrideOf: () => undefined, config: { policy: options.tier.policy ?? 'ask' } }
    if (options.tier.auto !== undefined) tierServices.permissionPresets = { current: () => (options.tier?.auto === true ? 'auto' : 'manual') }
  }

  const makeCtx = (own: Record<string, unknown> = {}): Record<string, unknown> => ({
    // 挂钩的 ctx 必须**能读到 tools**（宿主里那是 `toolsCtx`；kit 用它的 `schemas()` 现算名单）。
    tools: host.global,
    effect(callback: () => unknown) {
      const cleaner = callback()
      if (typeof cleaner === 'function') cleaners.push(cleaner as () => unknown)
      return () => {}
    },
    inject(names: readonly string[], callback: (ctx: unknown) => void) {
      const injected: Record<string, unknown> = {}
      for (const name of names) if (tierServices[name] !== undefined) injected[name] = tierServices[name]
      callback(makeCtx(injected))
      return () => {}
    },
    on(name: string, listener: (...args: unknown[]) => void) {
      const list = listeners.get(name) ?? []
      list.push(listener)
      listeners.set(name, list)
      return () => {
        const index = list.indexOf(listener)
        if (index >= 0) list.splice(index, 1)
      }
    },
    // 真 cordis 的 inject 守卫：插件 ctx 读未声明 inject 的服务会抛。退化成 undefined 是同一结论。
    get: () => undefined,
    ...own,
  })

  const dispose = attachTierRestrict(makeCtx() as never, {
    pkg: 'demo',
    prefixes: options.prefixes ?? ['demo_'],
    // 未列进 CLASS 的 `demo_*` 一律按 write：本用例要验证「之后才注册的工具」也参与重算。
    classify: (tool) => CLASS[tool] ?? (tool.startsWith('demo_') ? 'write' : undefined),
    log: (message) => {
      logs.push(message)
      options.log?.(message)
    },
  })
  // 假宿主自己广播 tools/change（模拟宿主的 restrict / register 副作用）。
  ;(host.global as unknown as { onchange(listener: () => void): void }).onchange(() => emit('tools/change'))

  return {
    host,
    dispose,
    agentFor: (id: string) => liveAgents.find((agent) => agent.id === id),
    createAgent(id: string): Record<string, unknown> {
      const agent = makeAgent(id)
      liveAgents.push(agent)
      emit('agent/created', { agent })
      return agent
    },
    emit,
    logs: () => logs,
    unmount(): void {
      // 宿主卸载插件时先跑 effect 清理；本模块的 disposer 由调用方自己接（这里一并撤干净）。
      dispose()
      for (const cleaner of cleaners.splice(0).reverse()) cleaner()
    },
  }
}

/** `tools/change` 触发的合并重算跑在 microtask 上。 */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

/* ------------------------------------------------------------------ *
 * 挂载补算
 * ------------------------------------------------------------------ */

describe('挂载时用 agents.list() 补算在活 agent', () => {
  it('只读档：不靠 agent/created，在活 agent 的工具面也被裁', () => {
    const mounted = mount({ tier: { mode: 'read-only', policy: 'ask' }, preexistingAgents: ['agent-before-reload'] })
    const agent = mounted.agentFor('agent-before-reload')
    expect(agent).toBeDefined()
    expect(mounted.host.namesFor(agent)).toEqual(['demo_read'])
    expect(mounted.logs().some((line) => line.includes('挂载时补算 1 个在活 agent'))).toBe(true)
    mounted.unmount()
  })

  it('完全权限档不裁（补算也守同一条判据）', () => {
    const mounted = mount({ tier: { mode: 'danger-full-access', policy: 'never' }, preexistingAgents: ['agent-full'] })
    const agent = mounted.agentFor('agent-full')
    expect(mounted.host.namesFor(agent)).toEqual(TOOLS)
    expect(mounted.host.restrictCalls).toHaveLength(0)
    mounted.unmount()
  })

  it('补算过的 agent 留在台账：之后才注册的工具，tools/change 时也会被裁', async () => {
    const mounted = mount({ tier: { mode: 'read-only', policy: 'ask' }, preexistingAgents: ['agent-late-tool'] })
    const agent = mounted.agentFor('agent-late-tool')
    expect(agent).toBeDefined()

    // 「会话建立之后才条件注册」的真实形状：挂载时它还不存在，补算台账必须让下一次重算覆盖它。
    mounted.host.register('demo_late_write')
    expect(mounted.host.namesFor(agent)).toContain('demo_late_write')
    mounted.emit('tools/change')
    await flush()
    expect(mounted.host.namesFor(agent)).not.toContain('demo_late_write')
    mounted.unmount()
  })
})

describe('agent/created 照旧是主路径（补算不是唯一入口）', () => {
  it('挂载之后创建的 agent 同样被裁', () => {
    const mounted = mount({ tier: { mode: 'read-only', policy: 'ask' } })
    const agent = mounted.createAgent('agent-after-mount')
    expect(mounted.host.namesFor(agent)).toEqual(['demo_read'])
    mounted.unmount()
  })
})

/* ------------------------------------------------------------------ *
 * 退化与生命周期
 * ------------------------------------------------------------------ */

describe('agents 服务缺失（老宿主）', () => {
  it('静默退化：不抛、只依赖 agent/created，补算那条日志说明原因', () => {
    const mounted = mount({ tier: { mode: 'read-only', policy: 'ask' }, withAgentsService: false })
    const agent = mounted.createAgent('agent-no-service')
    expect(mounted.host.namesFor(agent)).toEqual(['demo_read'])
    expect(mounted.logs().some((line) => line.includes('agents 服务没有 list()'))).toBe(true)
    mounted.unmount()
  })
})

describe('卸载', () => {
  it('补算下来的限制一并撤掉，重复 dispose 安全', () => {
    const mounted = mount({ tier: { mode: 'read-only', policy: 'ask' }, preexistingAgents: ['agent-dispose'] })
    const agent = mounted.agentFor('agent-dispose')
    expect(mounted.host.restrictionCount(agent)).toBe(1)

    mounted.dispose()
    expect(mounted.host.restrictionCount(agent)).toBe(0)
    expect(mounted.host.namesFor(agent)).toEqual(TOOLS)
    expect(() => mounted.dispose()).not.toThrow()
  })
})

describe('服务未组合', () => {
  it('没有档位服务时不裁（「没有档位概念」不等于「只读档」）', () => {
    const mounted = mount({ preexistingAgents: ['agent-no-tier'] })
    const agent = mounted.agentFor('agent-no-tier')
    expect(mounted.host.namesFor(agent)).toEqual(TOOLS)
    expect(mounted.host.restrictCalls).toHaveLength(0)
    mounted.unmount()
  })
})
