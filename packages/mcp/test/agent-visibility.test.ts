/**
 * @hyzyn/dsh-mcp — MCP 工具接进「档位裁剪」（2026-10-25）。
 *
 * ## 为什么 MCP 需要本仓自己的一条闸
 *
 * 宿主侧 `dsh-mcp-client` 用裸 `ctx.tools.register()` 注册 MCP 工具，**没有任何档位 / 审批 /
 * sandbox 代码**；三个插件的档位闸又只认各自的前缀（`tty_` / `docker_` / `loglens_`）。于是
 * 只读档下模型仍能直接调 `mcp__jenkins__triggerBuild`——这是授权缺口，不只是 token 问题
 * （判据与运行期实测在 docs/permission-tier-plan.md 的「`mcp__*`」条）。
 *
 * 本插件是这些 server 的配置方，于是由它按 `mcp__` 前缀把这一族接进 kit 的 `attachTierRestrict`：
 *
 *   - **受限档**（`read-only` / `workspace-write`）下 deny 全部 `mcp__*`；
 *   - **完全权限档不裁**；宿主未组合 `sandboxPolicy` 时不裁（与 docker / tty 同口径）。
 *   - 读 / 写语义本仓判不了 ⇒ 一律按最坏的 `exec` 处理。
 *
 * ## 这里钉住的五件事
 *
 * 1. 受限档：agent 的 `schemas()` 里没有任何 `mcp__*`，原生工具一个不少；
 * 2. 完全权限档：全部 `mcp__*` 都在（档位这一层不裁）；
 * 3. 未组合档位服务：不裁（「没有档位概念」不等于「只读档」）；
 * 4. **deny 只点名已经注册的名字**：未连上的 server 不产生 deny（`restrict()` 对未知名字整体抛错，
 *    点名就会把整次裁剪炸掉）；
 * 5. 零配置（没有 server / 一个 `mcp__*` 都没注册）：一次 `restrict()` 都不发生、不打档位日志。
 *
 * ## 反例（改坏了必须红）
 *
 * 把「deny 与注册集求交」去掉（改成按看得到的 serverName 直接合成名字）→ 第 4 组（未连上的
 * server）必须红：假宿主按宿主语义对未知名字**整体抛错**，那一次裁剪会被吞成一行日志，于是
 * 「agent 仍看到别的 server 的工具」当场不成立。
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apply, spliceManagedBlock } from '../src/index.js'

/* ------------------------------------------------------------------ *
 * DSH_HOME 隔离：apply 直接读 home 补丁文件
 * ------------------------------------------------------------------ */

let home = ''
const previousHome = process.env.DSH_HOME

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'dsh-mcp-visibility-'))
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
 * 假宿主：tools 服务（宿主语义逐条复刻）
 * ------------------------------------------------------------------ */

interface FakeToolsHandle {
  schemas(viewing?: object): Array<{ name: string }>
  restrict(filter: { allow?: readonly string[]; deny?: readonly string[] }): () => void
}

interface FakeToolsHost {
  names(): string[]
  namesFor(scope?: object): string[]
  restrictionCount(scope?: object): number
  /** **成功下发**的 `restrict()`（被宿主拒掉的不算）。 */
  restrictCalls: Array<{ scope: object; deny: string[] }>
  readonly global: FakeToolsHandle
  handleFor(scope: object): FakeToolsHandle
}

function createFakeToolsHost(initial: readonly string[]): FakeToolsHost {
  const definitions = new Set<string>(initial)
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

  const global = makeHandle(undefined) as FakeToolsHandle & { onchange(listener: () => void): () => void }
  global.onchange = (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  return {
    names: () => [...definitions],
    namesFor: (viewing?: object) => global.schemas(viewing).map((schema) => schema.name),
    restrictionCount: (viewing?: object) => (viewing === undefined ? 0 : (restrictions.get(viewing)?.length ?? 0)),
    restrictCalls,
    global,
    handleFor: (viewing: object) => makeHandle(viewing),
  }
}

/* ------------------------------------------------------------------ *
 * 挂一次插件（假 ctx：webServer / tools / 档位服务）
 * ------------------------------------------------------------------ */

type TierMode = 'read-only' | 'workspace-write' | 'danger-full-access'

interface FakeTier {
  mode?: TierMode
  bySession?: Record<string, TierMode>
  policy?: 'ask' | 'never'
  auto?: boolean
}

interface Mounted {
  host: FakeToolsHost
  createAgent(id: string): Record<string, unknown>
  emit(name: string, ...args: unknown[]): void
  logs(): string[]
  unmount(): void
}

const NATIVE_TOOLS = ['read_file', 'bash']
const JENKINS_TOOLS = ['mcp__jenkins__build', 'mcp__jenkins__triggerBuild']
const ALL_MCP_TOOLS = [...JENKINS_TOOLS]

function mount(options: {
  config?: Record<string, unknown>
  tier?: FakeTier
  toolNames?: readonly string[]
} = {}): Mounted {
  const host = createFakeToolsHost(options.toolNames ?? [...NATIVE_TOOLS, ...ALL_MCP_TOOLS])
  const logs: string[] = []
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logs.push(args.map((arg) => String(arg)).join(' '))
  })

  const listeners = new Map<string, Array<(...args: unknown[]) => void>>()
  const cleaners: Array<() => unknown> = []
  const routes = new Map<string, unknown>()
  const emit = (name: string, ...args: unknown[]): void => {
    for (const listener of [...(listeners.get(name) ?? [])]) listener(...args)
  }

  const tierServices: Record<string, unknown> = {}
  if (options.tier !== undefined) {
    tierServices.sandboxPolicy = {
      resolve: (request?: { session?: unknown }) => {
        const session = request?.session as { id?: string } | undefined
        const override = session?.id === undefined ? undefined : options.tier?.bySession?.[session.id]
        return { mode: override ?? options.tier?.mode ?? 'read-only', workspaceRoot: '/ws' }
      },
    }
    tierServices.approval = { overrideOf: () => undefined, config: { policy: options.tier.policy ?? 'ask' } }
    if (options.tier.auto !== undefined) tierServices.permissionPresets = { current: () => (options.tier?.auto === true ? 'auto' : 'manual') }
  }
  const webServer = { register: (route: { path: string; handler: unknown }) => {
    routes.set(route.path, route.handler)
    return () => routes.delete(route.path)
  } }

  const makeCtx = (own: Record<string, unknown> = {}): Record<string, unknown> => ({
    effect(callback: () => unknown) {
      const cleaner = callback()
      if (typeof cleaner === 'function') cleaners.push(cleaner as () => unknown)
      return () => {}
    },
    inject(names: readonly string[], callback: (ctx: unknown) => void) {
      const injected: Record<string, unknown> = {}
      for (const name of names) {
        if (name === 'tools') injected.tools = host.global
        else if (name === 'webServer') injected.webServer = webServer
        else if (tierServices[name] !== undefined) injected[name] = tierServices[name]
      }
      // 服务缺失 = 回调不触发（真宿主语义）
      if (Object.keys(injected).length > 0) callback(makeCtx(injected))
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
  ;(host.global as unknown as { onchange(listener: () => void): void }).onchange(() => emit('tools/change'))

  return {
    host,
    createAgent(id: string): Record<string, unknown> {
      const agent: Record<string, unknown> = { id, session: { id, header: { cwd: '/ws' } }, ctx: {} }
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

/* ------------------------------------------------------------------ *
 * A：档位
 * ------------------------------------------------------------------ */

describe('A 受限档：agent 的工具表里没有任何 mcp__*', () => {
  it('只读档：MCP 工具全消失，原生工具一个不少；全局注册集不受影响', () => {
    writeManagedRows([row('mcp-jenkins', 'jenkins')])
    const mounted = mount({ config: {}, tier: { mode: 'read-only', policy: 'ask' } })
    const agent = mounted.createAgent('agent-readonly')

    expect(mounted.host.namesFor(agent)).toEqual(NATIVE_TOOLS)
    // 裁的是影子不是注册：全局视图里都在。
    expect(mounted.host.names()).toHaveLength(NATIVE_TOOLS.length + ALL_MCP_TOOLS.length)
    mounted.unmount()
  })

  it('工作区内修改档同样裁（与 shouldRestrictForTier 的 true 分支一致）', () => {
    writeManagedRows([row('mcp-jenkins', 'jenkins')])
    const mounted = mount({ config: {}, tier: { mode: 'workspace-write', policy: 'ask' } })
    const agent = mounted.createAgent('agent-workspace')
    expect(mounted.host.namesFor(agent)).toEqual(NATIVE_TOOLS)
    mounted.unmount()
  })
})

describe('A 完全权限档：不裁（档位这一层不替用户改档）', () => {
  it('全部 MCP 工具都在', () => {
    writeManagedRows([row('mcp-jenkins', 'jenkins')])
    const mounted = mount({ config: {}, tier: { mode: 'danger-full-access', policy: 'never' } })
    const agent = mounted.createAgent('agent-full')
    expect(mounted.host.namesFor(agent)).toEqual([...NATIVE_TOOLS, ...ALL_MCP_TOOLS])
    mounted.unmount()
  })
})

describe('A 未组合档位服务：不裁（与 docker / tty 同口径）', () => {
  it('宿主没有 sandboxPolicy：工具面保持原样', () => {
    writeManagedRows([row('mcp-jenkins', 'jenkins')])
    const mounted = mount({ config: {} })
    const agent = mounted.createAgent('agent-no-tier')
    expect(mounted.host.namesFor(agent)).toHaveLength(NATIVE_TOOLS.length + ALL_MCP_TOOLS.length)
    mounted.unmount()
  })
})

/* ------------------------------------------------------------------ *
 * 零配置是纯 no-op
 * ------------------------------------------------------------------ */

describe('零配置：不注册任何限制、不打档位日志、不抛', () => {
  it('零服务器 + 只读档：一次 restrict 都不发生', () => {
    writeManagedRows([])
    const mounted = mount({ config: {}, toolNames: NATIVE_TOOLS, tier: { mode: 'read-only', policy: 'ask' } })
    const agent = mounted.createAgent('agent-empty')
    expect(mounted.host.restrictCalls).toHaveLength(0)
    expect(mounted.host.namesFor(agent)).toEqual(NATIVE_TOOLS)
    expect(mounted.logs().filter((line) => line.includes('tier-restrict:'))).toEqual([])
    mounted.unmount()
  })

  it('有 server 但一个 mcp__* 都没注册（全都没连上）：同样一次都不发生', () => {
    writeManagedRows([row('mcp-jenkins', 'jenkins')])
    const mounted = mount({ config: {}, toolNames: NATIVE_TOOLS, tier: { mode: 'read-only', policy: 'ask' } })
    mounted.createAgent('agent-unconnected')
    expect(mounted.host.restrictCalls).toHaveLength(0)
    mounted.unmount()
  })
})

/* ------------------------------------------------------------------ *
 * 反例落点：deny 必须与注册集求交
 * ------------------------------------------------------------------ */

describe('未注册的名字不许被点名（反例落点）', () => {
  it('只注册了 jenkins 的一个工具：deny 只点名它，没连上的 server 不产生名字', () => {
    writeManagedRows([row('mcp-jenkins', 'jenkins')])
    // 只注册了一个 jenkins 工具；若按「配置里的 serverNames 合成 mcp__jenkins__*」去点名，
    // 假宿主会整体抛错，这一次裁剪会被吞掉，别的 server 的工具就会留在 agent 视野里。
    const mounted = mount({
      config: {},
      toolNames: [...NATIVE_TOOLS, 'mcp__jenkins__build'],
      tier: { mode: 'read-only', policy: 'ask' },
    })
    const agent = mounted.createAgent('agent-partial')

    expect(mounted.host.namesFor(agent)).toEqual(NATIVE_TOOLS)
    const call = mounted.host.restrictCalls.at(-1)
    expect(call).toBeDefined()
    expect(call!.deny).toEqual(['mcp__jenkins__build'])
    mounted.unmount()
  })
})
