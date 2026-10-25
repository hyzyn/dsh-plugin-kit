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
 * ## 这里钉住五件事（每件都配了它要防的错法）
 *
 * 1. **挂载补算**：在活 agent 不靠 `agent/created` 也被裁到（只读档 → write / exec 消失）；
 * 2. **补算过的 agent 留在台账**：之后才注册的工具，也会在 `tools/change` 时按新注册集重算；
 * 3. **`agents` 服务缺失**：静默退化（只依赖 `agent/created`），不抛、不把插件带下去；
 * 4. **卸载**：补算下来的限制一并撤掉，重复调用安全；
 * 5. **会话中途切档**（2026-10-25）：订阅 `session/event` 的三个旋钮事件，按会话 id 重算——
 *    **升档放回、降档摘掉**，一次切档的多条事件合并成一次重算，别的会话不受影响。
 *
 * 第 5 条的事件一律按**真实信封** `(session, { type, seq, time, data })` 派发。这条不是形式：
 * codegraph `CG66` 就是顶层读 `event.name` 让采集器静默归零了几个月，而单测当时用的是**扁平假事件**，
 * 一路绿灯。所以这里另有两条防「信封读错」的用例：① 载荷缺失 / 畸形也必须照常重算（本模块只看
 * `type`）；② 非旋钮事件一个都不许触发重算。
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
  /** 造一个 agent 并派发 `agent/created`；`sessionId` 缺省与 id 同值（宿主今天的约定）。 */
  createAgent(id: string, sessionId?: string): Record<string, unknown>
  /** 挂载时已经存在的 agent（`agents.list()` 的成员）。 */
  agentFor(id: string): Record<string, unknown> | undefined
  emit(name: string, ...args: unknown[]): void
  /**
   * 改某会话的档位（**宿主那半边的**动作：旋钮写进会话日志、`resolve()` 下次读到的就是新值）。
   * 它与 `emit('session/event', …)` 是两件事，正是宿主的真实形状：先落盘、再派发。
   */
  setMode(mode: TierMode, sessionId?: string): void
  /** 派发一条**真实信封**的 `session/event`：`(session, { type, seq, time, data })`。 */
  sessionEvent(sessionId: string, type: string, data?: Record<string, unknown>): void
  /** 切到 / 切离 Auto review（`presets.current()` 的返回值）。 */
  setAuto(value: boolean): void
  /** `classify` 被调用了几次（合并重算的观测点：没有别的副作用可数）。 */
  classifyCalls(): number
  /** `sandboxPolicy.resolve()` 被调用了几次 = `applyTo` 跑了几趟（工作量的直接观测点）。 */
  resolveCalls(): number
  /** 每次 `resolve()` 带着的会话 id（按调用顺序）——「这一趟碰了谁」的直接观测点。 */
  resolvedSessions(): Array<string | undefined>
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
  const makeAgent = (id: string, sessionId = id): Record<string, unknown> => {
    const agent: Record<string, unknown> = { id, session: { id: sessionId, header: { cwd: '/ws' } }, ctx: {} }
    ;(agent.ctx as Record<string, unknown>).tools = host.handleFor(agent)
    return agent
  }
  /** 宿主 `agents.list()` 的成员（插件挂载时用来补算在活 agent）。 */
  const liveAgents = (options.preexistingAgents ?? []).map(makeAgent)

  const tierServices: Record<string, unknown> = {}
  if (options.withAgentsService !== false) tierServices.agents = { list: () => [...liveAgents] }
  /** 会话 → 档位：缺省沿用挂载时的档位，`setMode()` 只改点名的那一个（宿主同形：会话覆盖 > 部署默认）。 */
  const modes = new Map<string, TierMode>()
  const defaultMode: TierMode = options.tier?.mode ?? 'read-only'
  const modeFor = (sessionId?: string): TierMode => (sessionId === undefined ? undefined : modes.get(sessionId)) ?? defaultMode
  let auto = options.tier?.auto === true
  /** `classify` 的调用次数：合并重算没有其它可观测的副作用，用它数「重算跑了几个名字」。 */
  const classifyCalls = { count: 0 }
  /** `resolve()` 的调用次数：每趟 `applyTo` 恰好解析一次档位，用它数「重算跑了几趟」。 */
  const resolveCalls = { count: 0 }
  /** 每次 `resolve()` 带进来的会话 id（按调用顺序）。 */
  const resolvedSessions: Array<string | undefined> = []
  if (options.tier !== undefined) {
    tierServices.sandboxPolicy = {
      // 与宿主同形：`resolve({ session })` 按**这个会话**的覆盖解析，没覆盖才落部署默认。
      resolve: (request?: { session?: { id?: string } }) => {
        resolveCalls.count += 1
        resolvedSessions.push(request?.session?.id)
        return { mode: modeFor(request?.session?.id), workspaceRoot: '/ws' }
      },
    }
    tierServices.approval = { overrideOf: () => undefined, config: { policy: options.tier.policy ?? 'ask' } }
    tierServices.permissionPresets = { current: () => (auto ? 'auto' : 'manual') }
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
    classify: (tool) => {
      classifyCalls.count += 1
      return CLASS[tool] ?? (tool.startsWith('demo_') ? 'write' : undefined)
    },
    log: (message) => {
      logs.push(message)
      options.log?.(message)
    },
  })
  // 假宿主自己广播 tools/change（模拟宿主的 restrict / register 副作用）。
  ;(host.global as unknown as { onchange(listener: () => void): void }).onchange(() => emit('tools/change'))

  let seq = 0

  return {
    host,
    dispose,
    agentFor: (id: string) => liveAgents.find((agent) => agent.id === id),
    createAgent(id: string, sessionId?: string): Record<string, unknown> {
      const agent = makeAgent(id, sessionId)
      liveAgents.push(agent)
      emit('agent/created', { agent })
      return agent
    },
    emit,
    setAuto(value: boolean): void {
      auto = value
    },
    setMode(mode: TierMode, sessionId?: string): void {
      modes.set(sessionId ?? 'agent-main', mode)
    },
    sessionEvent(sessionId: string, type: string, data: Record<string, unknown> = {}): void {
      // 真实信封：第一个参数是 session，第二个是 `{ type, seq, time, data }`（CG66 的坑就在第二层）。
      seq += 1
      emit('session/event', { id: sessionId, header: { cwd: '/ws' } }, { type, seq, time: 1_700_000_000_000 + seq, data })
    },
    classifyCalls: () => classifyCalls.count,
    resolveCalls: () => resolveCalls.count,
    resolvedSessions: () => [...resolvedSessions],
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

/* ------------------------------------------------------------------ *
 * 会话中途切档：session/event 里的三个旋钮事件（2026-10-25）
 * ------------------------------------------------------------------ *
 *
 * 事件一律按**真实信封**派发：`(session, { type, seq, time, data })`。
 * 这一节要防的两类错法：
 *
 *   ① 只订了 `sandbox/mode`，于是「切到 / 切离 Auto review」不重算（`auto` 来自 preset）；
 *   ② 从载荷里读档位（`event.data.mode`）——那既给同一事实造了第二份来源，又正好踩中
 *      codegraph `CG66` 的信封坑。本模块只读顶层 `type`，下面有一条「载荷缺失也照常重算」钉它。
 */

describe('会话中途切档：升档把工具放回来', () => {
  it('只读的会话切到完全权限 → 限制被撤掉，工具面回到全局集', async () => {
    const mounted = mount({ tier: { mode: 'read-only', policy: 'ask' } })
    const agent = mounted.createAgent('agent-upgrade')
    // 先清掉创建时 `restrict()` 触发的那个 pending 重算：否则下面切档测的是它、不是事件。
    await flush()
    expect(mounted.host.namesFor(agent)).toEqual(['demo_read'])
    expect(mounted.host.restrictionCount(agent)).toBe(1)

    mounted.setMode('danger-full-access', 'agent-upgrade')
    mounted.sessionEvent('agent-upgrade', 'sandbox/mode', { mode: 'danger-full-access' })
    await flush()

    expect(mounted.host.namesFor(agent)).toEqual(TOOLS)
    expect(mounted.host.restrictionCount(agent)).toBe(0)
    mounted.unmount()
  })
})

describe('会话中途切档：降档把工具摘掉', () => {
  it('完全权限的会话切到只读 → 下一次请求前工具面被裁', async () => {
    const mounted = mount({ tier: { mode: 'danger-full-access', policy: 'never' } })
    const agent = mounted.createAgent('agent-downgrade')
    // 先清掉创建时 `restrict()` 触发的那个 pending 重算：否则下面切档测的是它、不是事件。
    await flush()
    expect(mounted.host.namesFor(agent)).toEqual(TOOLS)

    mounted.setMode('read-only', 'agent-downgrade')
    mounted.sessionEvent('agent-downgrade', 'sandbox/mode', { mode: 'read-only' })
    await flush()

    expect(mounted.host.namesFor(agent)).toEqual(['demo_read'])
    expect(mounted.logs().some((line) => line.includes('mode=read-only'))).toBe(true)
    mounted.unmount()
  })

  it('只读 ↔ 工作区内修改是同一档：来回切不重复下发', async () => {
    const mounted = mount({ tier: { mode: 'read-only', policy: 'ask' } })
    const agent = mounted.createAgent('agent-same-tier')
    // 先清掉创建时 `restrict()` 触发的那个 pending 重算：否则下面切档测的是它、不是事件。
    await flush()
    const before = mounted.host.restrictCalls.length

    mounted.setMode('workspace-write', 'agent-same-tier')
    mounted.sessionEvent('agent-same-tier', 'sandbox/mode', { mode: 'workspace-write' })
    await flush()

    expect(mounted.host.namesFor(agent)).toEqual(['demo_read'])
    // 名单没变 → 一次都不该重下发（`applyTo` 的 sameNames 早退）。
    expect(mounted.host.restrictCalls.length).toBe(before)
    mounted.unmount()
  })
})

describe('会话中途切档：事件的接法', () => {
  it('一次切档最多三条旋钮事件 → 合并成一次重算', async () => {
    const mounted = mount({ tier: { mode: 'danger-full-access', policy: 'never' } })
    const agent = mounted.createAgent('agent-coalesce')
    // 先清掉创建时 `restrict()` 触发的那个 pending 重算：否则下面切档测的是它、不是事件。
    await flush()
    const before = mounted.resolveCalls()

    mounted.setMode('read-only', 'agent-coalesce')
    // preset 自己一条 + 它展开的两个旋钮：宿主的真实形状。
    mounted.sessionEvent('agent-coalesce', 'permission/preset', { value: 'read-only' })
    mounted.sessionEvent('agent-coalesce', 'sandbox/mode', { mode: 'read-only' })
    mounted.sessionEvent('agent-coalesce', 'approval/policy', { policy: 'ask' })

    // 派发是同步的，重算不是：三条事件在途时一趟都还没跑（否则就是逐条重算）。
    expect(mounted.resolveCalls() - before, '事件派发时不该同步重算').toBe(0)
    await flush()

    /*
     * 两趟 = ① 会话事件触发的这一趟；② `restrict()` 自己发 `tools/change` 触发的那一趟
     * （既有的幂等路径，`applyTo` 在里面按 sameNames 早退）。
     * 合并失败会是 4 趟（3 条事件各一趟 + 上面那一趟）——这才是本用例要抓的。
     */
    expect(mounted.resolveCalls() - before).toBe(2)
    expect(mounted.host.namesFor(agent)).toEqual(['demo_read'])
    mounted.unmount()
  })

  it('permission/preset 单独变化（Auto review）也重算：auto 档不裁', async () => {
    const mounted = mount({ tier: { mode: 'read-only', auto: false } })
    const agent = mounted.createAgent('agent-auto')
    // 先清掉创建时 `restrict()` 触发的那个 pending 重算：否则下面切档测的是它、不是事件。
    await flush()
    expect(mounted.host.namesFor(agent)).toEqual(['demo_read'])

    mounted.setAuto(true)
    mounted.sessionEvent('agent-auto', 'permission/preset', { value: 'auto' })
    await flush()
    expect(mounted.host.namesFor(agent), 'Auto review 档与完全权限同判：不裁').toEqual(TOOLS)

    mounted.setAuto(false)
    mounted.sessionEvent('agent-auto', 'permission/preset', { value: 'read-only' })
    await flush()
    expect(mounted.host.namesFor(agent)).toEqual(['demo_read'])
    mounted.unmount()
  })

  it('别的会话切档不动这个会话的 agent', async () => {
    const mounted = mount({ tier: { mode: 'read-only', policy: 'ask' } })
    const agentA = mounted.createAgent('agent-a')
    // 先清掉创建时 `restrict()` 触发的那个 pending 重算：否则下面切档测的是它、不是事件。
    await flush()
    const agentB = mounted.createAgent('agent-b')
    await flush()
    expect(mounted.host.namesFor(agentB)).toEqual(['demo_read'])

    const before = mounted.resolveCalls()
    mounted.setMode('danger-full-access', 'agent-a')
    mounted.sessionEvent('agent-a', 'sandbox/mode', { mode: 'danger-full-access' })
    await flush()

    expect(mounted.host.namesFor(agentA)).toEqual(TOOLS)
    expect(mounted.host.namesFor(agentB)).toEqual(['demo_read'])
    expect(mounted.host.restrictionCount(agentB)).toBe(1)
    /*
     * B 的行为**看不出**这次重算有没有白碰它（名单没变 → `applyTo` 早退，结果一模一样），
     * 所以这条只能用工作量观测。两趟都算上：① 会话事件那趟只碰 A；② `restrict()` 触发的
     * `tools/change` 是**全局**的（工具集变了，与档位无关），两个 agent 都会被解析一次。
     * ⇒ A 两次、B **一次**。「不按会话过滤」时 B 会是两次——那只是白算钱不是错，但既然注释
     * 承诺了「别的会话不被碰」，就得有东西按住它。
     */
    const touched = mounted.resolvedSessions().slice(before)
    expect(touched.filter((id) => id === 'agent-a'), 'A：会话趟 + tools/change 趟').toHaveLength(2)
    expect(touched.filter((id) => id === 'agent-b'), 'B 只该被 tools/change 那趟碰到').toHaveLength(1)
    mounted.unmount()
  })

  it('按 session id 找回 agent（agent.id 与 session.id 分叉时也不找错人）', async () => {
    const mounted = mount({ tier: { mode: 'read-only', policy: 'ask' } })
    const agent = mounted.createAgent('agent-alias', 'session-real')
    // 先清掉创建时 `restrict()` 触发的那个 pending 重算：否则下面切档测的是它、不是事件。
    await flush()
    expect(mounted.host.namesFor(agent)).toEqual(['demo_read'])

    mounted.setMode('danger-full-access', 'session-real')
    mounted.sessionEvent('session-real', 'sandbox/mode', { mode: 'danger-full-access' })
    await flush()

    expect(mounted.host.namesFor(agent)).toEqual(TOOLS)
    mounted.unmount()
  })

  it('载荷缺失 / 畸形也照常重算（只读顶层 type，不读 data）——CG66 的反例', async () => {
    const mounted = mount({ tier: { mode: 'danger-full-access', policy: 'never' } })
    const agent = mounted.createAgent('agent-flat')
    // 先清掉创建时 `restrict()` 触发的那个 pending 重算：否则下面切档测的是它、不是事件。
    await flush()
    expect(mounted.host.namesFor(agent)).toEqual(TOOLS)

    mounted.setMode('read-only', 'agent-flat')
    // 只有 type：没有 data、没有 seq、没有 time。真实信封里这三个都在，但本模块不该依赖它们。
    mounted.emit('session/event', { id: 'agent-flat' }, { type: 'sandbox/mode' })
    await flush()

    expect(mounted.host.namesFor(agent)).toEqual(['demo_read'])
    mounted.unmount()
  })

  it('非旋钮事件一个都不许触发重算（tool/call 每轮都有，白算就是每个回合多几趟）', async () => {
    const mounted = mount({ tier: { mode: 'danger-full-access', policy: 'never' } })
    mounted.createAgent('agent-noisy')
    // 先清掉创建时 `restrict()` 触发的那个 pending 重算：否则下面切档测的是它、不是事件。
    await flush()
    const before = mounted.classifyCalls()
    const callsBefore = mounted.host.restrictCalls.length

    for (const type of ['tool/call', 'assistant/message', 'user/message', 'turn/start']) {
      mounted.sessionEvent('agent-noisy', type, { name: 'x' })
    }
    await flush()

    expect(mounted.classifyCalls()).toBe(before)
    expect(mounted.host.restrictCalls.length).toBe(callsBefore)
    mounted.unmount()
  })
})

describe('会话中途切档：卸载之后', () => {
  it('再来事件不抛、也不再下发限制', async () => {
    const mounted = mount({ tier: { mode: 'read-only', policy: 'ask' } })
    mounted.createAgent('agent-after-dispose')
    // 先清掉创建时 `restrict()` 触发的那个 pending 重算：否则下面切档测的是它、不是事件。
    await flush()
    mounted.dispose()
    const callsAfterDispose = mounted.host.restrictCalls.length

    mounted.setMode('read-only', 'agent-after-dispose')
    expect(() => mounted.sessionEvent('agent-after-dispose', 'sandbox/mode', { mode: 'read-only' })).not.toThrow()
    await flush()

    expect(mounted.host.restrictCalls.length).toBe(callsAfterDispose)
    mounted.unmount()
  })
})
