/**
 * @hyzyn/dsh-mcp — MCP 工具面的**按需加载**（`agentToolLoading: 'on-demand'`，2026-10-25）。
 *
 * ## 这里钉住什么
 *
 * 1. `eager`（默认）：不注册 `mcp_servers` / `mcp_load`，一次 `restrict()` 都不额外发
 *    （默认档位的空行为必须与改动前逐字一致）；
 * 2. `on-demand` + `agent/created`：该 agent 视图里一个 `mcp__*` 都没有，两个自有工具在；
 * 3. `mcp_load(['jenkins'])`：只见 jenkins 的两个工具 + 两个自有工具，**另一个 agent 不受影响**；
 * 4. `mcp_load([])`：全部卸掉；
 * 5. `tools/change` 后：新注册的 `mcp__*` 默认仍不可见，已装载 server 的新工具可见；
 * 6. 未知 server：`unknown` 有值、不装、不抛；
 * 7. 卸载：限制撤掉、台账清空（之后再注册 `mcp__*` 也不会被重新限制）；
 * 8. **反例**：把 `planSurfaceDeny` 里「属于已装载 server」的判据去掉 → 用例 3 必须红
 *    （在用例里对纯函数跑一次变异实现，**不改真实源码**）。
 *
 * ## 假宿主
 *
 * 结构与 `agent-visibility.test.ts` 的假宿主同构（宿主语义逐条复刻：`schemas(scope)` 的投影是
 * 夹具自己算的、`restrict` 对未知名字整体抛错、`restrict` 会触发 `tools/change`），另加两点：
 *
 *   - `register(definition)` **捕获完整定义**（两个自有工具的 `execute` 要靠它拿到）；
 *   - `agent.ctx.tools` 是**按 agent 绑定**的 scoped handle，`tools.restrict()` 在全局 handle 上抛
 *     （与宿主/既有夹具同一语义）。
 *
 * 那两个文件互不 import：`.test.ts` 互相 import 会让彼此的 describe 各跑两遍。所以这里是**一份
 * 独立的夹具实现**（与既有夹具同构），既有测试文件一行未改。
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MCP_OWN_TOOL_NAMES, apply, spliceManagedBlock } from '../src/index.js'
import { planSurfaceDeny } from '../src/agent-surface.js'

/* ------------------------------------------------------------------ *
 * DSH_HOME 隔离：apply 直接读 home 补丁文件（DTO / 装载白名单都来自它）
 * ------------------------------------------------------------------ */

let home = ''
const previousHome = process.env.DSH_HOME

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'dsh-mcp-surface-'))
  process.env.DSH_HOME = home
})

afterEach(() => {
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
  rmSync(home, { recursive: true, force: true })
  vi.restoreAllMocks()
})

type ManagedRows = Parameters<typeof spliceManagedBlock>[1]

const row = (id: string, serverName: string) => ({ id, config: { serverName, transport: 'stdio' as const, command: 'node' } })

function writeManagedRows(rows: ManagedRows): void {
  writeFileSync(join(home, 'cordis.patch.yml'), spliceManagedBlock('# dsh home patch layer\n', rows), 'utf8')
}

/* ------------------------------------------------------------------ *
 * 假宿主：tools 服务（`schemas` / `restrict` / `register` 三件）
 * ------------------------------------------------------------------ */

/** `register()` 捕获到的工具定义（两个自有工具的 `execute` 从这里取）。 */
interface CapturedTool {
  name: string
  description?: string
  execute?(args: unknown, exec?: unknown): Promise<unknown>
}

interface FakeToolsHandle {
  schemas(viewing?: object): Array<{ name: string }>
  restrict(filter: { allow?: readonly string[]; deny?: readonly string[] }): () => void
  register(definition: unknown): () => void
}

interface FakeToolsHost {
  names(): string[]
  namesFor(scope?: object): string[]
  restrictionCount(scope?: object): number
  /** **成功下发**的 `restrict()`（被宿主拒掉的不算）。 */
  restrictCalls: Array<{ scope: object; deny: string[] }>
  definition(name: string): CapturedTool | undefined
  /** 工具集的每次变化（注册 / 注销 / 限制）都通知一次——宿主靠这条发 `tools/change`。 */
  onchange(listener: () => void): () => void
  readonly global: FakeToolsHandle
  handleFor(scope: object): FakeToolsHandle
}

function createFakeToolsHost(initial: readonly string[]): FakeToolsHost {
  const definitions = new Set<string>(initial)
  const captured = new Map<string, CapturedTool>()
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
    register(definition: unknown): () => void {
      const tool = definition as CapturedTool
      if (typeof tool?.name !== 'string' || tool.name === '') throw new Error('tools.register() requires a named definition')
      if (definitions.has(tool.name)) throw new Error(`tool "${tool.name}" is already registered`)
      definitions.add(tool.name)
      captured.set(tool.name, tool)
      // 注册会触发 `tools/change`（宿主语义）：按需加载层要拿新注册集重算。
      notify()
      let live = true
      return () => {
        if (!live) return
        live = false
        definitions.delete(tool.name)
        captured.delete(tool.name)
        notify()
      }
    },
    restrict(filter: { allow?: readonly string[]; deny?: readonly string[] }): () => void {
      if (scope === undefined) throw new Error('tools.restrict() requires a scoped context (agent.ctx)')
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

  const global = makeHandle(undefined)

  return {
    names: () => [...definitions],
    namesFor: (viewing?: object) => global.schemas(viewing).map((schema) => schema.name),
    restrictionCount: (viewing?: object) => (viewing === undefined ? 0 : (restrictions.get(viewing)?.length ?? 0)),
    restrictCalls,
    definition: (name: string) => captured.get(name),
    onchange: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    global,
    handleFor: (viewing: object) => makeHandle(viewing),
  }
}

/* ------------------------------------------------------------------ *
 * 挂一次插件（假 ctx：tools + 事件 + effect）
 * ------------------------------------------------------------------ */

interface Mounted {
  host: FakeToolsHost
  createAgent(id: string): Record<string, unknown>
  emit(name: string, ...args: unknown[]): void
  logs(): string[]
  unmount(): void
}

const NATIVE_TOOLS = ['read_file', 'bash']
const JENKINS_TOOLS = ['mcp__jenkins__build', 'mcp__jenkins__triggerBuild']
const GITLAB_TOOLS = ['mcp__gitlab__mrList']
const ALL_MCP_TOOLS = [...JENKINS_TOOLS, ...GITLAB_TOOLS]

function mount(options: { config?: Record<string, unknown>; toolNames?: readonly string[] } = {}): Mounted {
  const host = createFakeToolsHost(options.toolNames ?? [...NATIVE_TOOLS, ...ALL_MCP_TOOLS])
  const logs: string[] = []
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logs.push(args.map((arg) => String(arg)).join(' '))
  })

  const listeners = new Map<string, Array<(...args: unknown[]) => void>>()
  const cleaners: Array<() => unknown> = []
  const emit = (name: string, ...args: unknown[]): void => {
    for (const listener of [...(listeners.get(name) ?? [])]) listener(...args)
  }

  const makeCtx = (own: Record<string, unknown> = {}): Record<string, unknown> => ({
    effect(callback: () => unknown) {
      const cleaner = callback()
      if (typeof cleaner === 'function') cleaners.push(cleaner as () => unknown)
      return () => {}
    },
    // 服务缺失 = 回调不触发（真宿主语义：deps 不齐就不启动）。
    inject(names: readonly string[], callback: (ctx: unknown) => void) {
      const injected: Record<string, unknown> = {}
      for (const name of names) {
        if (name === 'tools') injected.tools = host.global
        else if (name === 'agents') injected.agents = undefined
      }
      if (names.every((name) => injected[name] !== undefined)) callback(makeCtx(injected))
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
    // 真 cordis 的 `get()` 是反射层：取不到返回 undefined。
    get: () => undefined,
    logger: { info: () => {}, warn: () => {} },
    ...own,
  })

  apply(makeCtx() as never, options.config as never)
  // 工具集变化 → 宿主发 `tools/change`（按需加载层与档位层都靠它重算）。
  host.onchange(() => emit('tools/change'))

  return {
    host,
    createAgent(id: string): Record<string, unknown> {
      // `agent.ctx.tools` 是**按 agent 绑定**的 scoped handle：restrict 只在它上面成立。
      const agent: Record<string, unknown> = { id, session: { id }, ctx: {} }
      ;(agent.ctx as Record<string, unknown>).tools = host.handleFor(agent)
      emit('agent/created', { agent })
      return agent
    },
    emit,
    logs: () => logs,
    unmount(): void {
      for (const cleaner of cleaners.splice(0).reverse()) cleaner()
    },
  }
}

/** 让 `tools/change` 的 microtask 合并重算跑完（两次 tick 足够，且与实现无关）。 */
async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

/** 调一个自有工具（从 `register` 捕获的定义里取）。 */
async function callTool(
  host: FakeToolsHost,
  name: string,
  args: unknown,
  exec: Record<string, unknown> | undefined,
): Promise<Record<string, unknown>> {
  const definition = host.definition(name)
  expect(definition, `工具 ${name} 应当已注册`).toBeDefined()
  const execute = definition?.execute
  expect(typeof execute).toBe('function')
  const value = (await execute?.(args, exec)) as Record<string, unknown>
  /*
   * 宿主会对**返回值**按 `output.schema` 做一次校验（不通过就是 TOOL_OUTPUT 错误），而假宿主
   * 直接调 `execute`、绕过了那一层。所以这里用外层同样一份编译后的 schema 校一遍：否则
   * schema 与返回值对不上时，单测全绿、真宿主每次调用都失败。
   */
  const schema = (definition as unknown as { output?: { schema?: unknown } }).output?.schema
  expect(schema, `工具 ${name} 应当声明 output.schema`).toBeDefined()
  expect(validateJsonSchemaValue(schema, value, '')).toEqual([])
  return value
}

/* ------------------------------------------------------------------ *
 * 1：eager（默认）是纯 no-op
 * ------------------------------------------------------------------ */

describe('1 eager（默认）：不注册自有工具、一次 restrict 都不额外发', () => {
  it('缺省配置：两个自有工具不存在，agent 视图 = 宿主原样', () => {
    writeManagedRows([row('mcp-jenkins', 'jenkins')])
    const mounted = mount({ config: {} })
    expect(mounted.host.names()).not.toContain('mcp_servers')
    expect(mounted.host.names()).not.toContain('mcp_load')

    const agent = mounted.createAgent('agent-eager')
    expect(mounted.host.restrictCalls).toHaveLength(0)
    expect(mounted.host.namesFor(agent)).toEqual([...NATIVE_TOOLS, ...ALL_MCP_TOOLS])
    mounted.unmount()
  })

  it("显式 'eager' 同样一次都不发", () => {
    writeManagedRows([row('mcp-jenkins', 'jenkins')])
    const mounted = mount({ config: { agentToolLoading: 'eager' } })
    mounted.createAgent('agent-eager-explicit')
    expect(mounted.host.restrictCalls).toHaveLength(0)
    expect(mounted.host.names()).not.toContain('mcp_servers')
    mounted.unmount()
  })
})

/* ------------------------------------------------------------------ *
 * 2：on-demand + agent/created
 * ------------------------------------------------------------------ */

describe('2 on-demand：新建 agent 的工具表里没有任何 mcp__*', () => {
  it('只见原生工具 + 两个自有工具；全局注册集不受影响', async () => {
    writeManagedRows([row('mcp-jenkins', 'jenkins'), row('mcp-gitlab', 'gitlab')])
    const mounted = mount({ config: { agentToolLoading: 'on-demand' } })
    const agent = mounted.createAgent('agent-ondemand')

    expect(mounted.host.namesFor(agent)).toEqual([...NATIVE_TOOLS, ...MCP_OWN_TOOL_NAMES])
    // 裁的是影子不是注册：全局视图里都在。
    expect(mounted.host.names()).toEqual([...NATIVE_TOOLS, ...ALL_MCP_TOOLS, ...MCP_OWN_TOOL_NAMES])

    // `mcp_servers` 如实报「一个都没装载」，并给出下一步提示。
    const snapshot = await callTool(mounted.host, 'mcp_servers', {}, { agent })
    expect(snapshot.mode).toBe('on-demand')
    const servers = snapshot.servers as Array<{ server: string; loaded: boolean; state: string; tools: unknown }>
    expect(servers.map((entry) => entry.server)).toEqual(['jenkins', 'gitlab'])
    expect(servers.every((entry) => entry.loaded === false)).toBe(true)
    expect(String(snapshot.note)).toContain('mcp_load')
    mounted.unmount()
  })
})

/* ------------------------------------------------------------------ *
 * 3：装载一个 server 只影响这一个 agent
 * ------------------------------------------------------------------ */

describe('3 mcp_load([jenkins])：只这个 agent 看见，另一个不受影响', () => {
  it('jenkins 两个工具 + 两个自有工具；B 仍然只有原生 + 自有', async () => {
    writeManagedRows([row('mcp-jenkins', 'jenkins'), row('mcp-gitlab', 'gitlab')])
    const mounted = mount({ config: { agentToolLoading: 'on-demand' } })
    const agentA = mounted.createAgent('agent-a')
    const agentB = mounted.createAgent('agent-b')
    // 两个 agent 各下一层「全部不可见」的限制。
    expect(mounted.host.restrictCalls).toHaveLength(2)

    const result = await callTool(mounted.host, 'mcp_load', { servers: ['jenkins'] }, { agent: agentA })
    expect(result.loaded).toEqual(['jenkins'])
    expect(result.unknown).toEqual([])
    expect(result.tools).toEqual(JENKINS_TOOLS)

    expect(mounted.host.namesFor(agentA)).toEqual([...NATIVE_TOOLS, ...JENKINS_TOOLS, ...MCP_OWN_TOOL_NAMES])
    // 另一个 agent 一个 `mcp__*` 都看不见（装载是 per-agent 的）。
    expect(mounted.host.namesFor(agentB)).toEqual([...NATIVE_TOOLS, ...MCP_OWN_TOOL_NAMES])

    // `mcp_servers` 的 loaded 也跟上（台账是唯一真相）。
    const snapshot = await callTool(mounted.host, 'mcp_servers', {}, { agent: agentA })
    const loaded = (snapshot.servers as Array<{ server: string; loaded: boolean }>).filter((entry) => entry.loaded)
    expect(loaded.map((entry) => entry.server)).toEqual(['jenkins'])
    mounted.unmount()
  })
})

/* ------------------------------------------------------------------ *
 * 4：mcp_load([]) 全部卸掉
 * ------------------------------------------------------------------ */

describe("4 mcp_load([])：全部卸掉", () => {
  it('装载后清空：视图回到原生 + 自有', async () => {
    writeManagedRows([row('mcp-jenkins', 'jenkins'), row('mcp-gitlab', 'gitlab')])
    const mounted = mount({ config: { agentToolLoading: 'on-demand' } })
    const agent = mounted.createAgent('agent-unload')

    await callTool(mounted.host, 'mcp_load', { servers: ['jenkins', 'gitlab'] }, { agent })
    expect(mounted.host.namesFor(agent)).toContain('mcp__gitlab__mrList')

    const result = await callTool(mounted.host, 'mcp_load', { servers: [] }, { agent })
    expect(result.loaded).toEqual([])
    expect(result.tools).toEqual([])
    expect(mounted.host.namesFor(agent)).toEqual([...NATIVE_TOOLS, ...MCP_OWN_TOOL_NAMES])
    mounted.unmount()
  })
})

/* ------------------------------------------------------------------ *
 * 5：tools/change 按新注册集重算
 * ------------------------------------------------------------------ */

describe('5 tools/change：新注册的 mcp__* 默认不可见，已装载 server 的新工具可见', () => {
  it('后连上的 server 不自动暴露；已装载 server 的新工具自动跟上', async () => {
    writeManagedRows([row('mcp-jenkins', 'jenkins'), row('mcp-gitlab', 'gitlab')])
    const mounted = mount({ config: { agentToolLoading: 'on-demand' } })
    const agent = mounted.createAgent('agent-change')
    await callTool(mounted.host, 'mcp_load', { servers: ['jenkins'] }, { agent })

    // 两个 server 各自「后连上」注册了新工具。
    const disposeJenkinsTool = mounted.host.global.register({ name: 'mcp__jenkins__deploy' })
    const disposeGitlabTool = mounted.host.global.register({ name: 'mcp__gitlab__mrCreate' })
    await flush()

    const view = mounted.host.namesFor(agent)
    expect(view).toContain('mcp__jenkins__deploy')
    expect(view).not.toContain('mcp__gitlab__mrCreate')

    disposeJenkinsTool()
    disposeGitlabTool()
    mounted.unmount()
  })
})

/* ------------------------------------------------------------------ *
 * 6：未知 server 不装、不抛
 * ------------------------------------------------------------------ */

describe('6 未知 server：unknown 有值、不装、不抛', () => {
  it('只装认识的，note 里列出未知与可用', async () => {
    // 两条托管行都要写：`gitlab` 的工具在注册集里，只有把它也纳入托管行，「未装载」才会被裁。
    writeManagedRows([row('mcp-jenkins', 'jenkins'), row('mcp-gitlab', 'gitlab')])
    const mounted = mount({ config: { agentToolLoading: 'on-demand' } })
    const agent = mounted.createAgent('agent-unknown')

    const result = await callTool(mounted.host, 'mcp_load', { servers: ['nope', 'jenkins'] }, { agent })
    expect(result.unknown).toEqual(['nope'])
    expect(result.loaded).toEqual(['jenkins'])
    expect(result.tools).toEqual(JENKINS_TOOLS)
    expect(String(result.note)).toContain('nope')
    expect(String(result.note)).toContain('jenkins')
    mounted.unmount()
  })
})

/* ------------------------------------------------------------------ *
 * 契约补充：两个工具自己的退化分支（无会话上下文 / 空配置）
 * ------------------------------------------------------------------ */

describe('契约补充：mcp_load 无会话上下文、mcp_servers 空配置', () => {
  it('exec.agent 缺省：不装载、给一句说明', async () => {
    writeManagedRows([row('mcp-jenkins', 'jenkins')])
    const mounted = mount({ config: { agentToolLoading: 'on-demand' } })
    const result = await callTool(mounted.host, 'mcp_load', { servers: ['jenkins'] }, undefined)
    expect(result.loaded).toEqual([])
    expect(result.tools).toEqual([])
    expect(result.note).toBe('这个工具需要会话上下文')
    mounted.unmount()
  })

  it('零配置：mcp_servers 空列表 + 引导卡片的 note', async () => {
    writeManagedRows([])
    const mounted = mount({ config: { agentToolLoading: 'on-demand' } })
    const agent = mounted.createAgent('agent-empty-config')
    const snapshot = await callTool(mounted.host, 'mcp_servers', {}, { agent })
    expect(snapshot.servers).toEqual([])
    expect(String(snapshot.note)).toContain('MCP 服务器配置')
    mounted.unmount()
  })
})

/* ------------------------------------------------------------------ *
 * 7：卸载撤限制、清台账
 * ------------------------------------------------------------------ */

describe('7 卸载：限制撤掉、台账清空', () => {
  it('unmount 后视图恢复原样，且之后再注册 mcp__* 也不会重新被限制', async () => {
    writeManagedRows([row('mcp-jenkins', 'jenkins')])
    const mounted = mount({ config: { agentToolLoading: 'on-demand' } })
    const agent = mounted.createAgent('agent-dispose')
    await callTool(mounted.host, 'mcp_load', { servers: ['jenkins'] }, { agent })

    mounted.unmount()
    expect(mounted.host.restrictionCount(agent)).toBe(0)
    expect(mounted.host.namesFor(agent)).toEqual([...NATIVE_TOOLS, ...ALL_MCP_TOOLS])

    // 台账已清：卸载后注册新工具、发 tools/change，不会再有新的限制下发。
    const dispose = mounted.host.global.register({ name: 'mcp__jenkins__late' })
    await flush()
    expect(mounted.host.restrictionCount(agent)).toBe(0)
    dispose()
  })

  it('agent/disposed 同样撤掉这一个 agent 的限制', async () => {
    writeManagedRows([row('mcp-jenkins', 'jenkins')])
    const mounted = mount({ config: { agentToolLoading: 'on-demand' } })
    const agent = mounted.createAgent('agent-gone')
    expect(mounted.host.restrictionCount(agent)).toBe(1)

    mounted.emit('agent/disposed', { agent })
    expect(mounted.host.restrictionCount(agent)).toBe(0)
    mounted.unmount()
  })
})

/* ------------------------------------------------------------------ *
 * 8：反例 —— 去掉「属于已装载 server」的判据，用例 3 必须红
 * ------------------------------------------------------------------ */

describe('8 反例：planSurfaceDeny 丢掉「已装载」判据时，用例 3 会红', () => {
  it('变异实现会连 jenkins 的工具一起裁掉（真实实现不会）', async () => {
    writeManagedRows([row('mcp-jenkins', 'jenkins'), row('mcp-gitlab', 'gitlab')])
    const mounted = mount({ config: { agentToolLoading: 'on-demand' } })
    const agent = mounted.createAgent('agent-mutation')
    await callTool(mounted.host, 'mcp_load', { servers: ['jenkins'] }, { agent })

    const registered = mounted.host.names()
    // 真实实现：已装载 server 的工具**不在** deny 里。
    const realDeny = planSurfaceDeny(registered, ['jenkins'], ['jenkins', 'gitlab'])
    expect(realDeny).toContain('mcp__gitlab__mrList')
    expect(realDeny).not.toContain('mcp__jenkins__build')
    expect(realDeny).not.toContain('mcp__jenkins__triggerBuild')

    /*
     * 变异实现：判据只剩「以 mcp__ 开头」——这正是「去掉属于已装载 server 那条」的形状。
     * 它算出来的 deny 若被真实代码采用，用例 3 的
     * `expect(namesFor(agentA)).toContain('mcp__jenkins__build')` 当场红。
     */
    const mutatedPlan = (names: readonly string[]): string[] => names.filter((name) => name.startsWith('mcp__'))
    const mutatedDeny = mutatedPlan(registered)
    expect(mutatedDeny).toContain('mcp__jenkins__build')
    const mutatedView = registered.filter((name) => !mutatedDeny.includes(name))
    expect(mutatedView).not.toContain('mcp__jenkins__build')

    // 而真实实现的视图里它在（用例 3 的同一条断言）。
    expect(mounted.host.namesFor(agent)).toContain('mcp__jenkins__build')
    mounted.unmount()
  })
})

/* ------------------------------------------------------------------ *
 * 9：外部行（非本插件托管）不碰 + 反例
 * ------------------------------------------------------------------ */

describe('9 外部 mcp-client 行：on-demand 下不裁、也不进 mcp_servers', () => {
  it('mcp__ext__ping 仍然可见；mcp_servers 只报托管行', async () => {
    writeManagedRows([row('mcp-jenkins', 'jenkins')])
    // `ext` 不在托管区块里（用户手写 / 别的插件托管的 mcp-client 行）：
    // 我们既不认识它的语义、也没有装载入口，隐藏它等于让用户静默丢功能。
    const mounted = mount({ config: { agentToolLoading: 'on-demand' }, toolNames: [...NATIVE_TOOLS, 'mcp__ext__ping', ...JENKINS_TOOLS] })
    const agent = mounted.createAgent('agent-external')

    const view = mounted.host.namesFor(agent)
    expect(view).toContain('mcp__ext__ping')
    // 托管行里的照旧被摘掉（收口只对「不是我们的」放宽）。
    expect(view).not.toContain('mcp__jenkins__build')
    expect(view).toEqual([...NATIVE_TOOLS, 'mcp__ext__ping', ...MCP_OWN_TOOL_NAMES])

    const snapshot = await callTool(mounted.host, 'mcp_servers', {}, { agent })
    const servers = (snapshot.servers as Array<{ server: string }>).map((entry) => entry.server)
    expect(servers).toEqual(['jenkins'])
    expect(servers).not.toContain('ext')
    mounted.unmount()
  })

  it('反例：去掉 managed 收口（deny 全部 mcp__*）→ 上一条必须红', () => {
    writeManagedRows([row('mcp-jenkins', 'jenkins')])
    const mounted = mount({ config: { agentToolLoading: 'on-demand' }, toolNames: [...NATIVE_TOOLS, 'mcp__ext__ping', ...JENKINS_TOOLS] })
    const agent = mounted.createAgent('agent-external-mutation')

    const registered = mounted.host.names()
    const realDeny = planSurfaceDeny(registered, [], ['jenkins'])
    expect(realDeny).toContain('mcp__jenkins__build')
    expect(realDeny).not.toContain('mcp__ext__ping')

    // 变异实现：判据只剩「以 mcp__ 开头」——外部行会被一起埋掉，用例 9 的第一条当场红。
    const mutatedDeny = registered.filter((name) => name.startsWith('mcp__'))
    expect(mutatedDeny).toContain('mcp__ext__ping')
    expect(registered.filter((name) => !mutatedDeny.includes(name))).not.toContain('mcp__ext__ping')
    expect(mounted.host.namesFor(agent)).toContain('mcp__ext__ping')
    mounted.unmount()
  })
})
