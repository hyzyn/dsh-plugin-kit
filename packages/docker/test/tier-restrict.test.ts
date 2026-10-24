/**
 * @hyzyn/dsh-docker — 「按会话档位裁剪工具面」的接线回归（kit `attachTierRestrict`）。
 *
 * 2026-10 把 tty 的试点实现上收到 kit（`packages/kit/src/tier-restrict.ts`），docker 是第二个
 * 消费者。这一层与 `attachTierGate`（`test/tier-gate.test.ts`）**两层并存**，谁也不取代谁：
 *
 *   - `attachTierGate`：**每次调用**放不放行（执行期闸，安全边界）；
 *   - `attachTierRestrict`：**工具面本身**（受限档的会话根本看不到 write / exec 工具，省的是来回）。
 *
 * ## 这里钉住四件不许退化的事
 *
 * 1. **只读档只露出 13 个 read**：5 个写 / 执行工具从该 agent 的 `schemas()` 里消失，read 一个不少；
 * 2. **不裁的三档照旧不裁**：`danger-full-access` / auto review / 服务未组合（与
 *    `shouldRestrictForTier` 的三条 `false` 一一对应）；
 * 3. **能力开关关闭时不许抛**（本轮最重要的回归）：`allowMutations` / `allowExec` 为 false 时那
 *    5 个工具**根本没注册**，而 `restrict()` 对任何不在全局工具集里的名字**整体抛错**。这条用例
 *    钉的是 `tierRestrictedNames` 的「**注册集 ∩ 分类表**」求交——反例见文件末尾的说明；
 * 4. **接线位置**：订阅必须在 tools effect 体里（不在 `refreshTools` 里）、撤销必须在 effect 的
 *    清理函数里。理由见 `src/index.ts` 那段注释：能力开关变化会走 `refreshTools` 重注册工具，
 *    而 `agent/created` 不会为已存在的 agent 再发一次——订阅挂在 `refreshTools` 里，每次重注册
 *    都会撤掉老 agent 的裁剪且再也裁不回来。
 *
 * ## 夹具的可信度边界
 *
 * 假 `tools` 服务的语义照宿主逐条复刻（`restrict` 必须 scoped、未知名字整体抛、撤销即恢复、
 * 任何层变化发 `tools/change`），与 `packages/tty/test/fake-tools.ts` 同口径——但**不跨包 import
 * 测试文件**，docker 侧自带最小夹具（本文件）。真机契约另由真机验收跑兜底。
 *
 * 插件 ctx 上刻意**没有** `tools`（`get()` 也取不到）：本插件没有声明式 `inject: ['tools']`，
 * 真 cordis 在这里会抛 inject 守卫。所以「把 `toolsCtx` 换成插件 `ctx`」这个错误会当场把第 1 条
 * 用例打红（拿不到全局注册集 ⇒ 静默退化成不裁剪），而不是等到真机上「工具没被裁，且没人发现」。
 *
 * ## 反例（改坏了必须红）
 *
 * 把 kit 的 `tierRestrictedNames` 改成「按分类表直接返回非 read 全量」（不求交）→ 第 3 条
 * （能力关闭）必须红：此时 deny 会点名 5 个未注册工具，假宿主按宿主语义整体抛错，
 * 用例断言的「一次 `restrict` 都没发生」立刻不成立。
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'

/*
 * 授权隔离（与 config-route / tool-concurrency 同款）：`apply()` 会按 `dshHome()` 打开带外授权
 * 存储，不隔离的话开发机上真做过一次就地提权，这组用例会在他机器上红、在 CI 上绿。
 */
const originalDshHome = process.env.DSH_HOME
const isolatedDshHome = mkdtempSync(join(tmpdir(), 'dsh-docker-tier-restrict-'))
process.env.DSH_HOME = isolatedDshHome
afterAll(() => {
  if (originalDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = originalDshHome
  rmSync(isolatedDshHome, { recursive: true, force: true })
})

import { attachTierRestrict } from '@hyzyn/dsh-kit'
import { DOCKER_TIER_CLASS, DOCKER_TIER_PREFIXES, apply } from '../src/index.js'

/**
 * 每个用例把能力开关的**宿主授权**环境变量清干净：vitest 复用 worker 进程，变量会漏给后面的
 * 测试文件（那会让「未授权 → 403」的用例在别的文件里静默变成已授权）。
 */
afterEach(() => {
  delete process.env.DSH_DOCKER_ALLOW_MUTATIONS
  delete process.env.DSH_DOCKER_ALLOW_EXEC
  vi.restoreAllMocks()
})

/** 只读工具（13 个）：任何档位下都该留在工具表里。 */
const READ_TOOLS = [
  'docker_targets',
  'docker_connect_local',
  'docker_ps',
  'docker_attention',
  'docker_inspect',
  'docker_logs',
  'docker_logs_grep',
  'docker_stats',
  'docker_events',
  'docker_images',
  'docker_image_inspect',
  'docker_networks',
  'docker_volumes',
]

/** 写 / 执行工具（5 个）：只读 / 工作区内修改档下必须看不见；能力开关关闭时压根没注册。 */
const WRITE_EXEC_TOOLS = ['docker_action', 'docker_image_remove', 'docker_image_prune', 'docker_image_pull', 'docker_exec']

/* ------------------------------------------------------------------ *
 * 假宿主：tools 服务（宿主语义逐条复刻）
 * ------------------------------------------------------------------ */

interface FakeToolDefinition {
  name: string
}

interface FakeToolsHandle {
  register(definition: FakeToolDefinition): () => void
  schemas(scope?: object): Array<{ name: string }>
  restrict(filter: { allow?: readonly string[]; deny?: readonly string[] }): () => void
}

interface FakeGlobalHandle extends FakeToolsHandle {
  /** 假宿主自己订阅 `tools/change`（驱动插件侧的合并重算）。 */
  onchange(listener: () => void): () => void
}

interface FakeToolsHost {
  /** 全局注册集（名字，注册顺序）。 */
  names(): string[]
  /** 某个 scope 的可见名（`schemas(scope)` 的投影；不传 = 全局视图）。 */
  namesFor(scope?: object): string[]
  /** 某个 scope 上还挂着几层限制（0 = 撤干净了）。 */
  restrictionCount(scope?: object): number
  /**
   * **每一次** `restrict()` 调用（含被拒绝的那些）——「能力关闭时不该有 deny」这条
   * 只能从这里看：`attachTierRestrict` 会把宿主抛的错吞成一行日志（它不许炸掉会话创建），
   * 所以抛错本身在外部是不可见的，必须记下发动作。
   */
  restrictAttempts: Array<{ scope: object; allow?: readonly string[]; deny?: readonly string[] }>
  readonly global: FakeGlobalHandle
  handleFor(scope: object): FakeToolsHandle
}

function createFakeToolsHost(): FakeToolsHost {
  const definitions = new Map<string, FakeToolDefinition>()
  const restrictions = new Map<object, Array<{ token: number; deny?: Set<string> }>>()
  const changeListeners = new Set<() => void>()
  const restrictAttempts: FakeToolsHost['restrictAttempts'] = []
  let tokenSeq = 0

  const notify = (): void => {
    for (const listener of [...changeListeners]) listener()
  }

  const hiddenFor = (scope: object): Set<string> => {
    const hidden = new Set<string>()
    for (const restriction of restrictions.get(scope) ?? []) {
      for (const name of definitions.keys()) {
        if (restriction.deny?.has(name) === true) hidden.add(name)
      }
    }
    return hidden
  }

  const makeHandle = (scope?: object): FakeToolsHandle => ({
    register(definition: FakeToolDefinition): () => void {
      definitions.set(definition.name, definition)
      notify()
      return () => {
        definitions.delete(definition.name)
        notify()
      }
    },

    schemas(viewing?: object): Array<{ name: string }> {
      const hidden = viewing === undefined ? new Set<string>() : hiddenFor(viewing)
      return [...definitions.keys()].filter((name) => !hidden.has(name)).map((name) => ({ name }))
    },

    restrict(filter: { allow?: readonly string[]; deny?: readonly string[] }): () => void {
      // 宿主：作用域是**调用方那个 context** 的，全局调用没有边界可言（所以必须从 agent.ctx 调）。
      if (scope === undefined) {
        throw new Error('tools.restrict() requires a scoped context (agent.ctx): a context-global restriction would mask every agent — deny the tool for the intended agent instead')
      }
      // 先记账再校验：被拒绝的**下发动作**本身就是要观测的东西（见 restrictAttempts 的注释）。
      restrictAttempts.push({ scope, ...filter })
      if (filter?.allow === undefined && filter?.deny === undefined) {
        throw new Error('tools.restrict({}) is a no-op: pass `allow` and/or `deny`')
      }
      const named = [...filter.allow ?? [], ...filter.deny ?? []]
      // 宿主：名单里任何一个名字不在**当前全局工具集**里 → 整体抛（不是忽略那一条）。
      // 这条就是「deny 必须与 schemas() 求交」的直接原因，也是第 3 条用例的反例落点。
      const unknown = named.filter((name) => !definitions.has(name))
      if (unknown.length > 0) {
        throw new Error(`tools.restrict() names unknown global tool${unknown.length > 1 ? 's' : ''} ${unknown.map((name) => `"${name}"`).join(', ')}`)
      }
      const compiled = { token: ++tokenSeq, ...filter.deny === undefined ? {} : { deny: new Set(filter.deny) } }
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

  const global: FakeGlobalHandle = {
    ...makeHandle(undefined),
    /** 假宿主自己订阅 `tools/change`（驱动插件侧的合并重算）。 */
    onchange(listener: () => void): () => void {
      changeListeners.add(listener)
      return () => changeListeners.delete(listener)
    },
  }

  return {
    names: () => [...definitions.keys()],
    namesFor: (scope?: object) => global.schemas(scope).map((schema) => schema.name),
    restrictionCount: (scope?: object) => (scope === undefined ? 0 : (restrictions.get(scope)?.length ?? 0)),
    restrictAttempts,
    global,
    handleFor: (scope: object) => makeHandle(scope),
  }
}

/* ------------------------------------------------------------------ *
 * 假宿主：cordis ctx + 会话档位服务
 * ------------------------------------------------------------------ */

/** 会话权限档位（省略 = 宿主没组合这组服务）。 */
interface FakeTier {
  mode?: 'read-only' | 'workspace-write' | 'danger-full-access'
  /** 按 session id 覆盖档位（验证「限制只落在自己那个 scope 上」用）。 */
  bySession?: Record<string, 'read-only' | 'workspace-write' | 'danger-full-access'>
  policy?: 'ask' | 'never'
  /** auto review（实验档）：`permissionPresets.current()` 返回 `auto`。 */
  auto?: boolean
}

interface FakeAgent {
  id: string
  session: { id: string; header: { cwd: string } }
  ctx: Record<string, unknown>
}

interface Mounted {
  host: FakeToolsHost
  /** 造一个 agent 并发 `agent/created`（宿主的载荷形状：`{ agent }`）。 */
  createAgent(id: string): FakeAgent
  /** 跑 effect 收回的 cleaner（倒序，cordis 的释放顺序）。 */
  unmount(): void
  /** `apply()` 与后续打到 `console.log` 的行。 */
  logs(): string[]
}

/**
 * 挂一次 `apply()`。
 *
 * `allowMutations` / `allowExec` 决定**注册集**（能力开关 + 宿主授权两层，见 capability.ts）：
 * 这里用 DSH_DOCKER_ALLOW_* 环境变量模拟「宿主已授权」，每个 `apply()` 会重新绑定授权源
 * （绑定即重采样），所以每个用例自己决定开不开。
 */
function mountPlugin(options: { allowMutations: boolean; allowExec: boolean; tier?: FakeTier }): Mounted {
  const host = createFakeToolsHost()
  const logs: string[] = []
  const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logs.push(args.map((arg) => String(arg)).join(' '))
  })

  const listeners = new Map<string, Array<(...args: unknown[]) => void>>()
  const cleaners: Array<() => unknown> = []
  const emit = (name: string, ...args: unknown[]): void => {
    for (const listener of [...listeners.get(name) ?? []]) listener(...args)
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
    if (options.tier.auto !== undefined) {
      tierServices.permissionPresets = { current: () => (options.tier?.auto === true ? 'auto' : 'manual') }
    }
  }

  const makeCtx = (own: Record<string, unknown> = {}): Record<string, unknown> => ({
    logger: { info: () => {}, warn: () => {} },
    effect(callback: () => unknown) {
      const cleaner = callback()
      if (typeof cleaner === 'function') cleaners.push(cleaner as () => unknown)
      return () => {}
    },
    inject(names: readonly string[], callback: (ctx: unknown) => void) {
      const injected: Record<string, unknown> = {}
      for (const name of names) {
        if (name === 'tools') injected.tools = host.global
        else if (tierServices[name] !== undefined) injected[name] = tierServices[name]
      }
      /*
       * 服务缺失 = 回调**不触发**（真宿主的语义；也是 tty 的 mount-plugin 的口径）。差异只在
       * 这里：kit 的 inject 回调若带着空属性照旧触发，docker 的 settings / webServer /
       * systemPrompt 三条回调会拿到 undefined 服务并当场炸掉——那测的就不是档位裁剪了。
       */
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
    /*
     * 真 cordis 的 inject 守卫：插件作用域读**未声明 inject** 的服务会抛
     * `cannot get property "tools" without inject`（本插件没有声明式 inject: ['tools']）。
     * 这里退化成 undefined —— 对 `toolsOf()` 是同一个结论（拿不到），而不会误伤 apply 的其它路径。
     */
    get: () => undefined,
    ...own,
  })

  // 能力开关的宿主授权：环境变量在 apply 时被采样（见 capability.ts 的 bindCapabilitySources）。
  const setEnv = (name: string, on: boolean): void => {
    if (on) process.env[name] = '1'
    else delete process.env[name]
  }
  setEnv('DSH_DOCKER_ALLOW_MUTATIONS', options.allowMutations)
  setEnv('DSH_DOCKER_ALLOW_EXEC', options.allowExec)

  const root = makeCtx()
  // tools/change → 插件侧的重算（假宿主是 tools 服务本身，这里模拟它的 onChange 广播）。
  host.global.onchange(() => emit('tools/change'))

  ;(apply as unknown as (ctx: unknown, config: unknown) => void)(root, {
    dockerBin: 'docker',
    allowMutations: options.allowMutations,
    allowExec: options.allowExec,
    targets: [{ name: '本机', kind: 'local' }],
  })

  return {
    host,
    createAgent(id: string): FakeAgent {
      const agent: FakeAgent = { id, session: { id, header: { cwd: '/ws' } }, ctx: {} }
      // 宿主给每个 agent 一个**绑定自己 scope 的** tools 句柄（restrict 只认 scoped 句柄）。
      agent.ctx.tools = host.handleFor(agent)
      emit('agent/created', { agent })
      return agent
    },
    unmount(): void {
      for (const cleaner of cleaners.splice(0).reverse()) cleaner()
      logSpy.mockRestore()
    },
    logs: () => logs,
  }
}

/** 让 `tools/change` 触发的合并重算（microtask）跑完，断言才看得到它的副作用。 */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

/* ------------------------------------------------------------------ *
 * 行为用例
 * ------------------------------------------------------------------ */

describe('只读档：写 / 执行工具从该 agent 的工具表里消失，read 一个不少', () => {
  it('13 个 read 全在、5 个 write/exec 全不在；全局注册集与别的 agent 都不受影响', async () => {
    const mounted = mountPlugin({
      allowMutations: true,
      allowExec: true,
      // 第二个 agent 的会话是「完全权限」档：限制必须只落在自己那个 scope 上。
      tier: { mode: 'read-only', policy: 'ask', bySession: { 'agent-full-access': 'danger-full-access' } },
    })
    const restricted = mounted.createAgent('agent-readonly')
    const untouched = mounted.createAgent('agent-full-access')
    await flush()

    expect(mounted.host.namesFor(restricted).sort()).toEqual([...READ_TOOLS].sort())
    for (const name of WRITE_EXEC_TOOLS) {
      expect(mounted.host.namesFor(restricted), `${name} 应被裁掉`).not.toContain(name)
    }
    // 口径必须是「宿主全局工具集」：18 个都还注册着（裁的是影子，不是注册）
    expect(mounted.host.names().sort()).toEqual([...READ_TOOLS, ...WRITE_EXEC_TOOLS].sort())
    // 只影响这个 agent：另一个 agent（同一份全局注册集）看到全部 18 个
    expect(mounted.host.namesFor(untouched)).toHaveLength(18)
    expect(mounted.logs().some((line) => line.includes('mode=read-only → docker 工具 18 → 13'))).toBe(true)
    mounted.unmount()
  })

  it('工作区内修改档同样裁（与 shouldRestrictForTier 的 true 分支一致）', async () => {
    const mounted = mountPlugin({ allowMutations: true, allowExec: true, tier: { mode: 'workspace-write', policy: 'ask' } })
    const agent = mounted.createAgent('agent-workspace')
    await flush()
    expect(mounted.host.namesFor(agent)).toHaveLength(13)
    mounted.unmount()
  })
})

describe('不裁的三档（与 shouldRestrictForTier 的三条 false 一一对应）', () => {
  it('完全权限：18 个全在（含 5 个写 / 执行）', async () => {
    const mounted = mountPlugin({ allowMutations: true, allowExec: true, tier: { mode: 'danger-full-access', policy: 'never' } })
    const agent = mounted.createAgent('agent-full')
    await flush()
    expect(mounted.host.namesFor(agent).sort()).toEqual([...READ_TOOLS, ...WRITE_EXEC_TOOLS].sort())
    expect(mounted.host.restrictionCount(agent)).toBe(0)
    mounted.unmount()
  })

  it('auto review：不裁（宿主预审接管，工具本来就能用）', async () => {
    const mounted = mountPlugin({ allowMutations: true, allowExec: true, tier: { mode: 'read-only', policy: 'ask', auto: true } })
    const agent = mounted.createAgent('agent-auto')
    await flush()
    expect(mounted.host.namesFor(agent)).toHaveLength(18)
    expect(mounted.host.restrictionCount(agent)).toBe(0)
    mounted.unmount()
  })

  it('服务未组合：不裁（没有档位概念，照做会把所有工具裁光）', async () => {
    const mounted = mountPlugin({ allowMutations: true, allowExec: true })
    const agent = mounted.createAgent('agent-no-services')
    await flush()
    expect(mounted.host.namesFor(agent)).toHaveLength(18)
    expect(mounted.host.restrictionCount(agent)).toBe(0)
    expect(mounted.logs().some((line) => line.includes('sandboxPolicy 未组合'))).toBe(true)
    mounted.unmount()
  })
})

describe('能力开关关闭：5 个工具没注册，裁剪必须闭嘴（本轮最重要的回归）', () => {
  it('allowMutations / allowExec 为 false → 不抛错、一次 deny 都不下发（钉住「注册集求交」）', async () => {
    const mounted = mountPlugin({ allowMutations: false, allowExec: false, tier: { mode: 'read-only', policy: 'ask' } })
    // 前提：这 5 个工具真的没注册（分类表里有、全局工具集里没有）
    for (const name of WRITE_EXEC_TOOLS) expect(mounted.host.names()).not.toContain(name)
    expect(mounted.host.names().sort()).toEqual([...READ_TOOLS].sort())

    let agent: FakeAgent | undefined
    // 这条是 `agent/created` 是 serial 派发：裁剪里抛一次就会让**会话创建失败**。
    expect(() => {
      agent = mounted.createAgent('agent-capabilities-off')
    }).not.toThrow()
    await flush()

    // 反例落点：把 tierRestrictedNames 改成「按分类表直接返回非 read 全量」→ 这里立刻不成立
    // （假宿主按宿主语义对未注册名字整体抛错，`attachTierRestrict` 吞掉错误后仍会留下一条下发记录）。
    expect(mounted.host.restrictAttempts).toHaveLength(0)
    expect(mounted.host.restrictionCount(agent)).toBe(0)
    expect(mounted.host.namesFor(agent).sort()).toEqual([...READ_TOOLS].sort())
    // 日志里不许出现「下发失败」：那说明还在点名没注册的工具
    const failures = mounted.logs().filter((line) => line.includes('下发工具限制失败') || line.includes('unknown global tool'))
    expect(failures, `不该有点名未注册工具的下发：${failures.join(' / ')}`).toEqual([])
    mounted.unmount()
  })
})

describe('撤销：effect 的清理函数把限制撤干净', () => {
  it('unmount() → agent 上的限制层归零（不是随工具一起被丢下的孤儿层）', async () => {
    const mounted = mountPlugin({ allowMutations: true, allowExec: true, tier: { mode: 'read-only', policy: 'ask' } })
    const agent = mounted.createAgent('agent-unmount')
    await flush()
    expect(mounted.host.restrictionCount(agent)).toBe(1)
    expect(mounted.host.namesFor(agent)).toHaveLength(13)

    mounted.unmount()

    // 工具随 unmount 一起注销（注册集归零），但**限制层必须是主动撤销的**：
    // 若清理函数漏了 disposeTierRestrict()，这一层会留在 scope 上（restrictionCount 仍为 1）。
    expect(mounted.host.restrictionCount(agent)).toBe(0)
    expect(mounted.host.names()).toEqual([])
  })

  it('直接调 attachTierRestrict 返回的撤销函数：工具还在，可见面恢复原样', async () => {
    const host = createFakeToolsHost()
    const names = ['docker_ps', 'docker_logs', 'docker_action', 'docker_exec']
    for (const name of names) host.global.register({ name })

    const listeners = new Map<string, Array<(...args: unknown[]) => void>>()
    const tierServices: Record<string, unknown> = {
      sandboxPolicy: { resolve: () => ({ mode: 'read-only' }) },
      approval: { overrideOf: () => undefined, config: { policy: 'ask' } },
    }
    const makeCtx = (own: Record<string, unknown> = {}): Record<string, unknown> => ({
      effect: (callback: () => unknown) => {
        callback()
        return () => {}
      },
      inject: (serviceNames: readonly string[], callback: (ctx: unknown) => void) => {
        const injected: Record<string, unknown> = {}
        for (const name of serviceNames) {
          if (name === 'tools') injected.tools = host.global
          else if (tierServices[name] !== undefined) injected[name] = tierServices[name]
        }
        callback(makeCtx(injected))
        return () => {}
      },
      on: (name: string, listener: (...args: unknown[]) => void) => {
        const list = listeners.get(name) ?? []
        list.push(listener)
        listeners.set(name, list)
        return () => {
          const index = list.indexOf(listener)
          if (index >= 0) list.splice(index, 1)
        }
      },
      get: () => undefined,
      ...own,
    })

    const dispose = attachTierRestrict(makeCtx({ tools: host.global }) as never, {
      pkg: 'docker',
      prefixes: DOCKER_TIER_PREFIXES,
      classify: (tool) => DOCKER_TIER_CLASS[tool],
      log: () => {},
    })
    const agent: Record<string, unknown> = { id: 'agent-direct', session: { id: 'agent-direct' }, ctx: {} }
    agent.ctx = { tools: host.handleFor(agent) }
    for (const listener of [...listeners.get('agent/created') ?? []]) listener({ agent })

    expect(host.namesFor(agent)).toEqual(['docker_ps', 'docker_logs'])
    dispose()
    expect(host.namesFor(agent)).toEqual(names)
    expect(host.restrictionCount(agent)).toBe(0)
  })
})

/* ------------------------------------------------------------------ *
 * 接线位置守卫（源码级）：光有用例绿不够，位置错了会以「老 agent 的裁剪被撤掉」的形式漂
 * ------------------------------------------------------------------ */

const SOURCE = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')

/** 找到第 n 个匹配的行号（-1 = 没有）。 */
function lineOf(predicate: (line: string) => boolean, from = 0): number {
  const lines = SOURCE.split('\n')
  for (let index = from; index < lines.length; index++) if (predicate(lines[index])) return index
  return -1
}

describe('接线位置守卫：订阅在 effect 体、撤销在清理函数里', () => {
  it('attachTierRestrict 只调一次，且在 refreshTools() 之后、effect 收尾之前', () => {
    const lines = SOURCE.split('\n')
    const callLines = lines
      .map((line, index) => [line, index] as const)
      .filter(([line]) => line.includes('attachTierRestrict('))
    expect(callLines).toHaveLength(1)
    const callLine = callLines[0][1]

    const effectStart = lineOf((line) => line.includes("ctx.inject(['tools'], (toolsCtx: Context) => {"))
    const refreshCall = lineOf((line) => line.trim() === 'refreshTools()', effectStart)
    const effectEnd = lineOf((line) => line.includes("'dsh-docker: agent tools'"), effectStart)
    expect(effectStart, 'tools effect 不见了？').toBeGreaterThan(-1)
    expect(refreshCall, 'effect 体里没有 refreshTools()？').toBeGreaterThan(-1)
    expect(effectEnd, 'effect 的标签行不见了？').toBeGreaterThan(-1)

    // 在 effect 体里、refreshTools() 之后（工具先注册，裁剪才有名单可算）
    expect(callLine).toBeGreaterThan(refreshCall)
    expect(callLine).toBeLessThan(effectEnd)
    // 传的是 toolsCtx：插件 ctx 上没有 tools（本插件无声明式 inject），传错会静默退化成不裁剪
    expect(lines[callLine]).toContain('attachTierRestrict(toolsCtx')
  })

  it('撤在 effect 的清理函数里、且先于工具注销（lift 需要 agent scope 还活着）', () => {
    const lines = SOURCE.split('\n')
    const callLine = lineOf((line) => line.includes('attachTierRestrict('))
    const disposeLine = lineOf((line) => line.trim() === 'disposeTierRestrict()', callLine)
    const toolsCleanup = lineOf((line) => line.includes('for (const dispose of toolDisposers)'), callLine)
    expect(disposeLine).toBeGreaterThan(callLine)
    expect(toolsCleanup).toBeGreaterThan(disposeLine)
  })

  it('不在 refreshTools 里：调用行落在 refreshTools 定义之后、但不在它的函数体区间内', () => {
    const lines = SOURCE.split('\n')
    const refreshDef = lineOf((line) => line.includes('const refreshTools = (): void => {'))
    const effectStart = lineOf((line) => line.includes("ctx.inject(['tools'], (toolsCtx: Context) => {"))
    const callLine = lineOf((line) => line.includes('attachTierRestrict('))
    expect(refreshDef).toBeGreaterThan(-1)
    // refreshTools 定义在 effect 之前；调用行在 effect 之后 ⇒ 不在 refreshTools 体内
    expect(effectStart).toBeGreaterThan(refreshDef)
    expect(callLine).toBeGreaterThan(effectStart)
    // 反向钉一次：refreshTools 体（定义行之后）里没有订阅
    const inRefreshBody = lines.slice(refreshDef, effectStart).some((line) => line.includes('attachTierRestrict'))
    expect(inRefreshBody).toBe(false)
  })
})
