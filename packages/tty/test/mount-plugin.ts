/**
 * @hyzyn/dsh-tty — 单测用的**最小假宿主**：挂一次 `apply()`，拿回「这份配置下真的注册了哪些工具」。
 *
 * ## 为什么要抽成公共件
 *
 * 工具注册集现在随 `live.sshHosts` / `live.tunnels` 变化（`src/index.ts` 的两处条件注册）：
 * `tool-concurrency.test.ts` 要**全量**挂载（它逐条检查并发性声明），`test/tool-gating.test.ts`
 * 要按配置档位逐档比对注册集。两处各抄一份假 ctx 的结果是「哪次改接线只改了其中一份」——
 * 而假 ctx 与真宿主的接口一旦漂开，用例会**静默**变成在测一个不存在的宿主。
 *
 * ## 边界（别把它当宿主）
 *
 * tty 的 `apply` 会真的构造 `SessionManager` / `TtyServer`，但都不碰网络：没有 `webServer`
 * 就不注册路由、没有 `subprocess` 就不开终端。隧道只在 `applyPatch` 的 `tunnelManager.reconcile`
 * 里拨号，而本夹具给的隧道一律 `enabled: false`（`tunnel()` 的默认值），所以**不会有真连接**。
 *
 * ## 记账口径（与真宿主对齐的三处）
 *
 * 1. **工具注册**：走 `test/fake-tools.ts` 的假 `tools` 服务——`register` 返回的 disposer 真撤
 *    （`registerAll` 重注册时先撤后挂），`schemas()` / `restrict()` 的语义照宿主源码逐条复刻。
 * 2. **agent 作用域**：`createAgent()` 发一条 `agent/created`，给这个 agent 一个**绑定了自己
 *    scope 的** `tools` 句柄——`restrict` 只认 scoped 句柄，全局句柄上来就抛。
 *    `schemas(agent)` 读到的就是这个 agent 的视图，等同宿主 `registry.schemas(exec.agent)`。
 * 3. **档位服务**：`{ tier }` 省略 = 宿主没组合 `sandboxPolicy` / `approval` / `permissionPresets`
 *    （`ctx.inject` 的回调照样触发，但服务属性不在——与真宿主「缺服务不注入」同形），
 *    于是档位闸与工具裁剪都退化成现状。
 *
 * `unmount()` 跑的是 `ctx.effect` 收回的 cleaner（倒序，cordis 的释放顺序），用来钉
 * 「插件卸载后限制必须撤掉」——`apply()` 之外的第二次挂载面就是它。
 */
import './isolated-home.js'
import { apply } from '../src/index.js'
import { createFakeToolsHost } from './fake-tools.js'
import type { FakeToolDefinition, FakeToolsHost } from './fake-tools.js'

/** 假宿主捕获到的工具定义（只取用例会读的字段；与 `fake-tools` 的定义同形）。 */
export type FakeToolDef = FakeToolDefinition

/** 会话权限档位（`{ tier }` 省略 = 宿主没组合这组服务）。 */
export interface FakeTier {
  mode?: 'read-only' | 'workspace-write' | 'danger-full-access'
  policy?: 'ask' | 'never'
  /** auto review（实验档）：`permissionPresets.current()` 返回 `auto`。 */
  auto?: boolean
}

/** 一个假 agent（`agent/created` 的载荷形状：`{ agent }`）。 */
export interface FakeAgent {
  id: string
  session: { id: string; header: { cwd: string } }
  ctx: Record<string, unknown>
}

export interface MountedPlugin {
  /** 名字 → 当前注册的工具定义（`fake-tools` 的全局注册表本体）。 */
  tools: Map<string, FakeToolDef>
  /** 假宿主本身（要直接断言 `schemas()` / 变更计数时用）。 */
  host: FakeToolsHost
  /** 当前有效注册集（注册顺序）。 */
  names(): string[]
  /** `apply()` 与后续热应用里打到 `console.log` 的行（启动日志）。 */
  logs: string[]
  /**
   * 模拟宿主写 settings 并广播 `loader/volatile-update`：
   * `settingsEntryScope.update()` → 宿主落盘 → 事件 → `applyPatch(scope.get())` → `refreshToolsHook()`。
   */
  applySettings(patch: Record<string, unknown>): void
  /** 当前 settings 槽里的值（断言夹具 sanitation 后还在用）。 */
  settings(): Record<string, unknown>
  /** 造一个 agent 并发 `agent/created`（`spec.id` 缺省时按序编号）。 */
  createAgent(spec?: { id?: string }): FakeAgent
  /** 发 `agent/disposed`（宿主在 agent 回收时发这一条）。 */
  disposeAgent(agent: FakeAgent): void
  /** 某个 agent 眼里的工具名（= `schemas(agent)`；不传 = 全局视图）。 */
  schemas(agent?: FakeAgent): string[]
  /** 触发一次「插件卸载」：跑 `ctx.effect` 收回的 cleaner（倒序，cordis 的顺序）。 */
  unmount(): void
}

/** 一条**过得了 `sanitizeSshHosts`** 的连接簿条目（宿主要求 name / host / username 都非空）。 */
export function sshHostEntry(name = 'demo'): Record<string, unknown> {
  return { name, host: '127.0.0.1', username: 'demo', port: 22, auth: 'agent' }
}

/**
 * 一条**过得了 `sanitizeTunnels`** 的隧道规格。
 *
 * `enabled` 必须显式给 `false`：`sanitizeTunnels` 的默认值是 `raw.enabled !== false`（缺省即启用），
 * 而启用的隧道会在 `reconcile` 里真的拨号——夹具里绝不这么干。
 */
export function tunnelSpec(name = 'demo-L18080', bookName = 'demo'): Record<string, unknown> {
  return { name, bookName, direction: 'local', localPort: 18080, remoteHost: '127.0.0.1', remotePort: 80, enabled: false }
}

/** 在 `fn` 执行期间捕获 `console.log` 的行（apply / 热应用 / agent 事件都是同步的）。 */
function withCapturedLogs(sink: string[], fn: () => void): void {
  const original = console.log
  console.log = (...args: unknown[]) => {
    sink.push(args.map((arg) => String(arg)).join(' '))
  }
  try {
    fn()
  } finally {
    console.log = original
  }
}

/** 把 disposer 包成幂等的（cordis 的 effect disposer 重复调用是安全的；夹具照这个语义）。 */
function once(fn: () => void): () => void {
  let live = true
  return () => {
    if (!live) return
    live = false
    fn()
  }
}

/** 挂一次插件；`config` 就是 `apply(ctx, config)` 的那份启动配置，`options.tier` 决定档位服务是否组合。 */
export function mountPlugin(config: Record<string, unknown> = {}, options: { tier?: FakeTier } = {}): MountedPlugin {
  const logs: string[] = []
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>()
  const cleanups: Array<() => void> = []
  let settingsValue: Record<string, unknown> = {}
  let agentSeq = 0
  const tier = options.tier

  const emit = (event: string, ...args: unknown[]): void => {
    for (const listener of [...listeners.get(event) ?? []]) listener(...args)
  }

  const host = createFakeToolsHost()
  const tools = host.definitions
  // 宿主的 `tools/change`：`ToolRuntime.layers` 的 onChange 每次层变化都发一条（注册 / 注销 / 限制）。
  host.onChange(() => {
    emit('tools/change')
  })

  const on = (name: string, listener: (...args: unknown[]) => void): (() => void) => {
    const list = listeners.get(name) ?? []
    list.push(listener)
    listeners.set(name, list)
    return () => {
      const next = (listeners.get(name) ?? []).filter((item) => item !== listener)
      listeners.set(name, next)
    }
  }

  const makeChild = (names: string[]): Record<string, unknown> => {
    const child: Record<string, unknown> = {
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
      effect: (callback: () => unknown) => {
        const result = callback()
        if (typeof result !== 'function') return () => {}
        const dispose = once(result as () => void)
        cleanups.push(dispose)
        return dispose
      },
      inject: (childNames: string[], cb: (ctx: unknown) => void) => {
        cb(makeChild(childNames))
        return () => {}
      },
      on,
      events: { on },
      get: (name: string) => {
        if (name === 'tools') return host.global
        return undefined
      },
    }
    if (names.includes('webServer')) {
      child.webServer = { register: () => () => {}, registerUpgrade: () => () => {} }
    }
    if (names.includes('settings')) {
      child.settings = {
        // 宿主形态：describe() 返回各 entry 的 resolved 值；这里只有 tty 一档，值由用例写
        describe: () => [{ ns: 'tty', value: settingsValue }],
        update: async (_ns: string, patch: Record<string, unknown>) => {
          settingsValue = { ...settingsValue, ...patch }
        },
        configure: () => () => {},
      }
    }
    if (names.includes('systemPrompt')) {
      child.systemPrompt = { section: () => () => {}, context: () => () => {} }
    }
    if (names.includes('credentials')) child.credentials = { resolve: async () => ({ value: undefined }) }
    // 档位服务：只在 `{ tier }` 给了时才「组合」——省略时 `inject` 回调照样触发，
    // 但服务属性不在（attachTierGate / attachTierRestrict 的注入检查因此都退化成现状）。
    if (tier !== undefined && names.includes('sandboxPolicy')) {
      child.sandboxPolicy = { resolve: () => ({ mode: tier.mode ?? 'read-only' }) }
    }
    if (tier !== undefined && names.includes('approval')) {
      child.approval = { overrideOf: () => undefined, config: { policy: tier.policy ?? 'ask' } }
    }
    if (tier !== undefined && names.includes('permissionPresets')) {
      child.permissionPresets = { current: () => (tier.auto === true ? 'auto' : 'default') }
    }
    return child
  }

  const root = makeChild([])
  root.inject = (names: string[], cb: (ctx: unknown) => void) => {
    cb(makeChild(names))
    return () => {}
  }
  withCapturedLogs(logs, () => {
    ;(apply as unknown as (ctx: unknown, config: unknown) => void)(root, config)
  })

  const createAgent = (spec: { id?: string } = {}): FakeAgent => {
    agentSeq += 1
    const id = spec.id ?? `agent-${String(agentSeq)}`
    // agent 的 ctx 就是它自己的 scope（宿主 `createScope(loopCtx, this)`，键是 agent 本身）：
    // `tools` 按这个 scope 绑定，所以 `agent.ctx.tools.restrict()` 落在它的分层里
    // （真宿主的语义见 src/tier-restrict.ts 文件头）。scope 键与 `schemas(agent)` 一致，
    // 否则「裁了却读不到裁剪」——夹具会静默变成在测别的东西。
    const ctx = makeChild([])
    const agent: FakeAgent = { id, session: { id, header: { cwd: '/tmp' } }, ctx }
    ctx.tools = host.handleFor(agent)
    ctx.get = (name: string) => (name === 'tools' ? ctx.tools : undefined)
    withCapturedLogs(logs, () => {
      emit('agent/created', { agent })
    })
    return agent
  }

  return {
    tools,
    host,
    names: () => host.names(),
    logs,
    applySettings: (patch: Record<string, unknown>) => {
      settingsValue = { ...settingsValue, ...patch }
      withCapturedLogs(logs, () => {
        // 宿主顺序：落盘 → loader 广播 volatile 更新 → 插件 applyPatch(scope.get())
        emit('loader/volatile-update')
      })
    },
    settings: () => settingsValue,
    createAgent,
    disposeAgent: (agent: FakeAgent) => {
      emit('agent/disposed', { agent })
    },
    schemas: (agent?: FakeAgent) => host.namesFor(agent),
    unmount: () => {
      withCapturedLogs(logs, () => {
        for (const dispose of [...cleanups].reverse()) dispose()
        cleanups.length = 0
      })
    },
  }
}
