/**
 * 会话档位 → **agent 作用域的全局工具裁剪**（宿主 `tools.restrict`，2026-10 试点）。
 *
 * ## 与 `attachTierGate` 的分工（两层，不是备胎）
 *
 * `attachTierGate` 管**这一次调用放不放行**：每次工具调用都按档位判 放行 / 询问 / 拒绝。
 * 本模块管**工具面本身**：受限档的会话根本看不到 write / exec 类工具——模型不会去试一个不存在的
 * 工具，也就不会把一整轮花在「被拒 → 换 bash → 再被拒」上，省的是**来回**而不是安全。
 *
 * 两条判据必须各自成立：裁剪只是把**按当前档位不可能成功**的工具摘掉；**执行期闸仍然是唯一的
 * 安全边界**——裁剪名单漏了谁、工具在会话建立之后才注册、档位切换的事件没收到，都只影响「模型
 * 看不看得见」，不构成越权（调用照样被 `attachTierGate` 按档位拦住）。这也是本模块敢把重算做成
 * 「尽力而为」的原因：它错了只会多一轮往返，不会多一次越权。
 *
 * ## 为什么只能从 `agent.ctx` 调 `restrict`
 *
 * 宿主 `ToolRuntime.restrict()` 的第一句是 `scopeOf(this.ctx)`，取不到 scope 直接抛；而
 * `ctx.get('tools')` 拿到的是**按插件 ctx 绑定**的服务实例（插件 ctx 没有 scope）。必须用
 * `agent.ctx.tools`——宿主服务被 traceable 包过，方法调用时 `this` 会重绑成**调用方那个
 * context**（codegraph `src/scope.ts` 的文件头把这条链路逐行记过），于是限制正好落在该 agent
 * 的分层里（`dsh-scope` 的 `ScopedLayers.effect` 按 `scopeOf(ctx)` 分桶）。
 *
 * ## 名单必须与 `schemas()` 求交
 *
 * `restrict()` 对**任何一个**不在当前全局工具集里的名字整体抛错（`unknown global tool ...`），
 * 而各插件的注册集都是**条件式**的（tty 没配连接簿就没有 `sftp_*`、没配隧道就没有 `tunnel_*`；
 * docker 的能力开关关闭时那 5 个写 / 执行工具根本没注册）。直接传分类表全量 = 在「只配了基础
 * 工具」的会话上把整次裁剪炸掉。所以 deny 一律由 `schemas()` 投影出的**真实名字**现算：
 * 注册了才裁，没注册不点名。
 *
 * ## 边界（刻意不做的事）
 *
 * 1. **服务缺失 = 不裁剪**：与 `attachTierGate` 同一口径（沙箱服务没组合时「档位」无从谈起，
 *    这时 `resolveSessionTier` 会返回最严的 read-only，照做会把所有工具都裁掉——那是把
 *    「没有档位概念」误判成「只读档」）。
 * 2. **完全权限 / auto review 档不按档位裁剪**：这两档在 `decideTierCall` 里是 allow 硬分支，
 *    工具本来就能用；把它们藏起来等于替用户改档。判据集中在 {@link shouldRestrictForTier}。
 * 3. **跟会话中途的档位切换**（2026-10-25 起）：订阅 `session/event` 里的三个旋钮事件
 *    （`sandbox/mode` / `approval/policy` / `permission/preset`），按会话 id 找回 agent 重算一次。
 * 4. **不碰非本插件的工具**：前缀 + 分类表双重过滤（`prefixes` 防同名跨插件误伤）。
 *
 * 第 3 条的来历与判据：档位是会话级旋钮，**两个方向都得跟**——升档（只读 → 完全权限）要把工具
 * **放回来**，否则用户刚授权、模型却还面对旧工具面（看着像「授权没生效」）；降档要把工具**摘掉**，
 * 否则模型反复去试按当前档位已不可能成功的工具，而省掉这一轮往返正是本层存在的理由。
 * 实现上有三处刻意的选择：
 *
 *   - **只按 `event.type` 过滤，不读载荷**。档位由 {@link resolveSessionTier} 从服务现读，那份
 *     fold 才是唯一真相；读 `event.data.mode` 等于给同一个事实造第二份来源，而且
 *     `session/event` 的信封是 `{ type, seq, time, data }`——codegraph `CG66` 正是顶层读
 *     `event.name` 让采集器静默归零了几个月。这里只碰顶层 `type`，载荷一个字不看。
 *   - **合并到 microtask**。一次 UI 切档最多写三条旋钮事件（preset 自己一条 + 它展开的两个旋钮），
 *     逐条重算等于一次切档下发三轮限制；而工具表是在**请求构建时**才投影给模型的，microtask
 *     一定跑在下一次模型调用之前，所以合并不改变「何时生效」。
 *   - **只重算这个会话**。档位是会话级旋钮，别的会话的工具面不该被这一次切换碰一下。
 *
 * **安全仍然不受影响**：裁剪只是把按当前档位不可能成功的工具摘掉；即使某次事件没到、错过了重算，
 * 调用照样被 `attachTierGate` 逐调用按实时档位拦住。
 */
import type { Context } from '@deepseek-ai/cordis'
import { resolveSessionTier } from './tier-gate.js'
import type { TierClass, TierContext, TierServicesSnapshot } from './tier-gate.js'

/** `schemas()` 投影里本模块只用到的字段（`name` 是唯一的键）。 */
interface ToolSchemaLike {
  name?: unknown
}

/**
 * `tools` 服务在本模块用到的两个方法（结构化声明——本包不依赖宿主包的类型）。
 *
 * `schemas` 是公开方法（`dsh-tools/lib/types/index.d.ts`），**不传 scope = 全局视图**：
 * 拿它取真实名字，再自己按前缀 / 分类表过滤，就是「前缀裁剪」的正确姿势（`restrict` 本身
 * 只认精确名字，没有通配）。
 */
export interface ToolsServiceLike {
  schemas(scope?: unknown): ReadonlyArray<ToolSchemaLike>
  restrict?(filter: { allow?: readonly string[]; deny?: readonly string[] }): () => void
}

/** agent 事件里用到的最小形状（与 codegraph `AgentLike` 同款：字段全可选，结构化不依赖 dsh-agent）。 */
export interface AgentLike {
  id?: unknown
  session?: unknown
  ctx?: unknown
}

/** `attachTierRestrict` 的选项。 */
export interface TierRestrictOptions {
  /** 插件 id，用于日志前缀 `[dsh-<pkg>]`。 */
  pkg: string
  /** 本插件 agent 工具的名字前缀（如 `['tty_', 'sftp_', 'tunnel_']` / `['docker_']`）；前缀外的工具一个都不裁。 */
  prefixes: readonly string[]
  /** 工具 → 风险类（与 `attachTierGate` 同一张表）。返回 `undefined` = 名单外，不裁。 */
  classify(tool: string): TierClass | undefined
  /** 日志出口（缺省 `console.log`，带 `[dsh-<pkg>]` 前缀）。 */
  log?(message: string): void
}

/**
 * 需要裁掉的名字：**注册集 ∩ 分类表里非 read 的那些**（纯函数，顺序跟随 `registered`）。
 *
 * 输入必须是 `schemas()` 拿到的**真实注册名**——分类表里那些「本会话没注册」的名字
 * （条件注册的 `sftp_*` / `tunnel_*`）一旦被点名，`restrict()` 会整体抛错，所以这里以
 * 「注册集」为外层循环、分类表只用来问类别。
 */
export function tierRestrictedNames(
  registered: readonly string[],
  classify: (tool: string) => TierClass | undefined,
  prefixes: readonly string[] = [],
): string[] {
  const denied: string[] = []
  for (const name of registered) {
    if (name === '') continue
    if (prefixes.length > 0 && !prefixes.some((prefix) => name.startsWith(prefix))) continue
    let cls: TierClass | undefined
    try {
      cls = classify(name)
    } catch {
      // 分类函数抛错 = 表坏了：按「不裁」处理（宁可多留一个工具，不拿一次抛错炸掉整次裁剪）。
      cls = undefined
    }
    if (cls === undefined || cls === 'read') continue
    denied.push(name)
  }
  return denied
}


/**
 * 这一档要不要裁剪。三条 `false` 与 `decideTierCall` 的 allow 硬分支**一一对应**
 * （服务未组合 / auto review / 完全权限）：那三支下工具本来就能用，藏起来是另一种行为。
 *
 */
export function shouldRestrictForTier(tier: TierContext): boolean {
  if (!tier.services.sandboxPolicy) return false
  if (tier.auto) return false
  return tier.mode !== 'danger-full-access'
}

/** 取一个 context 绑定的 `tools` 服务（取不到 = 环境不支持，调用方按「不裁剪」处理）。 */
function toolsOf(target: unknown): ToolsServiceLike | undefined {
  if (target === null || typeof target !== 'object') return undefined
  const usable = (candidate: unknown): candidate is ToolsServiceLike =>
    candidate !== null &&
    typeof candidate === 'object' &&
    typeof (candidate as ToolsServiceLike).schemas === 'function'
  // ① `agent.ctx.tools`：宿主按调用方 context 重绑 `this` 的那一份（scope 就藏在它里面）。
  try {
    const direct = (target as { tools?: unknown }).tools
    if (usable(direct)) return direct
  } catch {
    // cordis 的 inject 守卫：读不到就走 `get`（同样是按调用方绑定的路径）。
  }
  // ② `ctx.get('tools')`：插件**声明式** inject 过 tools 时的既有取法（tty 的 plugin 就是这么写的；
  //    没有声明式 inject 的插件（如 docker）只有 `ctx.inject(['tools'], cb)` 回调里那个 ctx 能读到）。
  try {
    const viaGet = (target as { get?(name: string): unknown }).get?.('tools')
    if (usable(viaGet)) return viaGet
  } catch {
    /* 同上 */
  }
  return undefined
}

/** 从宿主 `schemas()` 的全局视图里取真实注册名（投影异常一律按空集处理，不炸调用方）。 */
function globalToolNames(host: ToolsServiceLike): string[] {
  let schemas: ReadonlyArray<ToolSchemaLike>
  try {
    schemas = host.schemas()
  } catch {
    return []
  }
  const names: string[] = []
  for (const schema of schemas ?? []) {
    const name = schema?.name
    if (typeof name === 'string' && name !== '') names.push(name)
  }
  return names
}

/** 两个名字集合是否等价（顺序无关；裁剪名单重算后用来判断「要不要重下限制」）。 */
function sameNames(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false
  const sorted = [...left].sort()
  const other = [...right].sort()
  return sorted.every((name, index) => name === other[index])
}

/** agent 的展示名（`agent.id` 与 `session.id` 同值；两条都缺时给一个占位，不抛）。 */
function agentIdOf(agent: AgentLike): string {
  const session = agent.session as { id?: unknown } | undefined
  for (const candidate of [agent.id, session?.id]) {
    if (typeof candidate === 'string' && candidate !== '') return candidate
  }
  return '(unnamed)'
}

/**
 * agent 的**会话** id —— 与 {@link agentIdOf} 刻意分开。
 *
 * 比对的对象是 `session/event` 带来的那个 session，所以这里只认 `agent.session.id`，不拿
 * `agent.id` 顶替：两者今天同值，但同值是**宿主实现**的约定，不是本模块的判据。顶替的坏处是
 * 某天它们分叉时，重算会静默落到**错误的会话**上（既不报错、也不裁错人，只是裁了别人）。
 */
function sessionIdOf(agent: AgentLike): string | undefined {
  const session = agent.session as { id?: unknown } | undefined
  return typeof session?.id === 'string' && session.id !== '' ? session.id : undefined
}

/**
 * 档位旋钮对应的**会话事件**类型（`permission/preset` 是 preset 自己，另外两个是它展开的旋钮）。
 *
 * 为什么三个都订：`shouldRestrictForTier` 同时看 `mode` 与 `auto`（`auto` 来自 preset），只订
 * `sandbox/mode` 会让「切到 / 切离 Auto review」不重算——而 Auto review 档是不裁的。
 */
const TIER_KNOB_EVENTS: ReadonlySet<string> = new Set(['sandbox/mode', 'approval/policy', 'permission/preset'])

/** 错误文案（日志用；`unknown` 收窄只做一次）。 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 在插件作用域上接管 `agent/created`：按会话档位给每个 agent 的 scope 下一层工具限制，
 * 返回撤销函数（撤掉所有已下发的限制 + 退订）。**全程不抛**——`agent/created` 是 serial
 * 派发，在这里抛会让会话创建失败，而工具裁剪只是省一轮往返，没有资格让会话起不来。
 *
 * 生命周期：与工具注册同一个 `ctx.effect`（插件禁用 / 卸载时一起撤）。**不要放进
 * `registerAll`**：热应用配置会重注册工具，而重注册不该把已有 agent 的裁剪一并撤掉
 * （`agent/created` 不会为老 agent 再发一次，撤了就再也裁不回来）。
 *
 * 挂载时还会用 `ctx.inject(['agents'])` 把**在活的** agent 补进台账（`agents.list()`），
 * 并立刻应用一次。原因：插件热重载 / 升级时，旧实例的 disposer 已经把所有限制撤掉了，而
 * `agent/created` 不会为已存在的会话再发一次——不补这一步，升级后那些会话会一直看到全部
 * 工具（A 的裁剪也一起失效），直到会话重开。服务缺失（老宿主）时退化成只依赖 `agent/created`。
 */
export function attachTierRestrict(ctx: Context, options: TierRestrictOptions): () => void {
  const log = options.log ?? ((message: string) => {
    console.log(`[dsh-${options.pkg}] ${message}`)
  })
  /** 捕获的宿主服务（与 kit `attachTierGate` 同三条 inject；kit 的快照是私有的，这里自建一份）。 */
  const snapshot: TierServicesSnapshot = {}
  const disposers: Array<() => void> = []
  /** agent（对象身份 = 宿主 scope 键）→ 已落地的裁剪。 */
  const applied = new Map<object, { id: string; deny: string[]; dispose: () => void }>()
  /** 见过面的 agent（含当前没被裁的那些）：工具集一变就要拿新注册集重算。 */
  const seen = new Map<object, AgentLike>()
  let resyncing = false
  let pendingResync = false
  /** 等着重算的**会话** id（一次切档最多三条旋钮事件，合并成一次重算）。 */
  const pendingSessions = new Set<string>()
  let sessionResyncQueued = false
  let closed = false
  let serviceMissingLogged = false
  let toolsMissingLogged = false

  const injectable = ctx as unknown as { inject?(names: readonly string[], callback: (serviceCtx: unknown) => void): unknown }
  if (typeof injectable.inject !== 'function') {
    log('tier-restrict: ctx.inject 不可用，档位服务无法捕获，裁剪关闭')
    return () => {}
  }
  const bindService = (service: string, key: 'sandbox' | 'approval' | 'presets'): void => {
    try {
      const dispose = injectable.inject!([service], (serviceCtx: unknown) => {
        const composed = (serviceCtx as Record<string, unknown> | undefined)?.[service]
        if (composed === undefined || composed === null) return
        snapshot[key] = composed as never
      })
      if (typeof dispose === 'function') disposers.push(dispose as () => void)
    } catch (error) {
      log(`tier-restrict: inject ${service} 失败（${messageOf(error)}），按服务未组合处理`)
    }
  }
  bindService('sandboxPolicy', 'sandbox')
  bindService('approval', 'approval')
  bindService('permissionPresets', 'presets')

  /** 撤销某个 agent 的裁剪（重复调用安全：agent scope 回收后的 disposer 也要能跑）。 */
  const lift = (agent: object): void => {
    const entry = applied.get(agent)
    if (entry === undefined) return
    applied.delete(agent)
    try {
      entry.dispose()
    } catch {
      /* 已随 agent scope 回收 */
    }
  }

  const applyTo = (agent: AgentLike): void => {
    if (agent === null || typeof agent !== 'object') return
    // 记下来：工具集热变更（配置加了连接簿 / 隧道）时要拿新注册集给这批 agent 重算。
    seen.set(agent, agent)
    // 全局视图（`schemas()` 不传参）：名单口径必须是「宿主全局工具集」，不是这个 agent 的视图。
    const host = toolsOf(ctx)
    if (host === undefined) {
      if (!toolsMissingLogged) {
        toolsMissingLogged = true
        log('tier-restrict: tools 服务不可用，跳过工具裁剪')
      }
      return
    }
    let tier: TierContext
    try {
      tier = resolveSessionTier(snapshot, agent.session)
    } catch (error) {
      log(`tier-restrict: 档位解析失败（${messageOf(error)}），跳过工具裁剪`)
      return
    }
    const restrictedByTier = shouldRestrictForTier(tier)
    if (!restrictedByTier && !tier.services.sandboxPolicy && !serviceMissingLogged) {
      serviceMissingLogged = true
      log('tier-restrict: sandboxPolicy 未组合，按现状不裁剪')
    }
    const id = agentIdOf(agent)
    const names = globalToolNames(host)
    const relevant = options.prefixes.length === 0 ? names : names.filter((name) => options.prefixes.some((prefix) => name.startsWith(prefix)))
    const deny = restrictedByTier ? tierRestrictedNames(names, options.classify, options.prefixes) : []
    // 名单为空才 `lift`：这一支承担「档位放开了，把之前那层撤掉」的语义——`lift` 撤的是上一次
    // 下发的限制，为空时正好回到宿主全局集。
    if (deny.length === 0) {
      lift(agent)
      return
    }
    // **必须**从 agent 自己的 ctx 调（见文件头）：插件 ctx 上没有 scope，restrict 会直接抛。
    const target = toolsOf(agent.ctx)
    if (target === undefined || typeof target.restrict !== 'function') {
      log(`tier-restrict: agent ${id} 没有可用的 scoped tools（宿主太旧或缺 restrict），跳过工具裁剪`)
      return
    }
    const current = applied.get(agent)
    if (current !== undefined && sameNames(current.deny, deny)) return
    lift(agent)
    // 先登记再下发：restrict 会同步触发 `tools/change`，重入的路径看到「已落地」才不会重复下发。
    const record = { id, deny, dispose: () => {} }
    applied.set(agent, record)
    try {
      record.dispose = target.restrict({ deny })
      // 数字口径：`kept` 只数**本插件前缀内**被留下的工具，别拿 `relevant.length - deny.length`
      // ——deny 名单只由注册集投影，两者本应一致；用 includes 再数一遍是防分类表与注册集漂移。
      const deniedInPrefixes = relevant.filter((name) => deny.includes(name)).length
      log(
        `tier-restrict: agent ${id} mode=${tier.mode} → ${options.pkg} 工具 ${String(relevant.length)} → ` +
        `${String(relevant.length - deniedInPrefixes)}（裁掉 ${String(deny.length)} 个 write/exec：${deny.join(', ')}）`,
      )
    } catch (error) {
      applied.delete(agent)
      log(`tier-restrict: agent ${id} 下发工具限制失败（${messageOf(error)}），保持原工具表`)
    }
  }

  const owner = ctx as unknown as { on?(name: string, listener: (...args: unknown[]) => unknown): unknown }
  if (typeof owner.on !== 'function') {
    log('tier-restrict: ctx.on 不可用，agent 事件订阅失败，裁剪关闭')
    return () => {
      for (const dispose of disposers.splice(0)) {
        try {
          dispose()
        } catch {
          /* 已注销 */
        }
      }
    }
  }
  const subscribe = (name: string, listener: (...args: unknown[]) => void): void => {
    try {
      const dispose = owner.on!.call(ctx, name, listener)
      if (typeof dispose === 'function') disposers.push(dispose as () => void)
    } catch (error) {
      log(`tier-restrict: 订阅 ${name} 失败（${messageOf(error)}）`)
    }
  }
  subscribe('agent/created', (...args: unknown[]) => {
    const agent = (args[0] as { agent?: AgentLike } | undefined)?.agent
    if (agent === undefined) return
    try {
      applyTo(agent)
    } catch (error) {
      // 兜底：宁可这个 agent 不裁剪，也不许把会话创建带下去。
      log(`tier-restrict: 裁剪 agent 失败（${messageOf(error)}），保持原工具表`)
    }
  })
  subscribe('agent/disposed', (...args: unknown[]) => {
    const agent = (args[0] as { agent?: AgentLike } | undefined)?.agent
    if (agent === undefined) return
    seen.delete(agent)
    lift(agent)
  })
  /*
   * 把**已经在活的** agent 补进台账并应用一次。
   *
   * 这是「插件重载 / 升级」那条路径的唯一兜底：旧实例卸载时 disposer 已经把限制全撤了，而
   * `agent/created` 不会为已存在的会话再发一次——不补的话，升级后那些会话一直看到全部工具
   * （A 的裁剪同样失效），直到会话重开。`agents` 服务缺失（老宿主）时静默退化，只依赖事件。
   */
  try {
    const dispose = injectable.inject!(['agents'], (serviceCtx: unknown) => {
      const agents = (serviceCtx as Record<string, unknown> | undefined)?.agents
      const list = (agents as { list?: () => unknown } | undefined)?.list
      if (typeof list !== 'function') {
        log('tier-restrict: agents 服务没有 list()，跳过在活 agent 的补算（只依赖 agent/created）')
        return
      }
      let live: unknown
      try {
        live = list.call(agents)
      } catch (error) {
        log(`tier-restrict: agents.list() 失败（${messageOf(error)}），只依赖 agent/created`)
        return
      }
      if (!Array.isArray(live)) return
      let hydrated = 0
      for (const agent of live) {
        try {
          // 先记进 seen：这批 agent 之后没有 `agent/created`，工具集再变也还要重算。
          applyTo(agent as AgentLike)
          hydrated += 1
        } catch (error) {
          log(`tier-restrict: 补算在活 agent 失败（${messageOf(error)}），保持原工具表`)
        }
      }
      if (hydrated > 0) log(`tier-restrict: 挂载时补算 ${String(hydrated)} 个在活 agent 的工具面`)
    })
    if (typeof dispose === 'function') disposers.push(dispose as () => void)
  } catch (error) {
    log(`tier-restrict: inject agents 失败（${messageOf(error)}），只依赖 agent/created`)
  }
  /**
   * 按**当前注册集**重算：各插件的工具都是条件注册的（tty 配置加了连接簿 → `sftp_*` 才出现；
   * docker 能力开关打开后 5 个写 / 执行工具才出现），而 `restrict` 是静态名字集合——不重算的话
   * 「会话建立后才注册的 write 工具」会一直露着。
   *
   * 重入是必然的：`restrict()` 自己也会发 `tools/change`。互斥标志挡住那一层嵌套（名单没变时
   * `applyTo` 本来就只做一次集合比较），而「先登记再下发」保证嵌套进来时看到的是新名单。
   */
  const resyncNow = (): void => {
    if (resyncing) return
    resyncing = true
    try {
      for (const agent of [...seen.values()]) applyTo(agent)
    } catch (error) {
      log(`tier-restrict: 工具集变更后重算失败（${messageOf(error)}），保持当前限制`)
    } finally {
      resyncing = false
    }
  }
  /**
   * 把一串同步的 `tools/change` 合并成**一次**重算：`registerAll` 先撤后挂，19 件工具会产生
   * 三十来条事件，逐条重算等于每次保存设置都重下发几轮限制（还会打一串日志）。
   *
   * 合并到 microtask 不影响正确性：工具是在**请求构建时**才被投影给模型的，而 microtask 一定
   * 跑在下一次模型调用之前。
   */
  const scheduleResync = (): void => {
    if (pendingResync || closed) return
    pendingResync = true
    queueMicrotask(() => {
      pendingResync = false
      if (closed) return
      try {
        resyncNow()
      } catch (error) {
        log(`tier-restrict: tools/change 处理失败（${messageOf(error)}）`)
      }
    })
  }
  subscribe('tools/change', () => {
    scheduleResync()
  })
  /**
   * 只重算**一个会话**的 agent：档位是会话级旋钮，别的会话的工具面不该被这一次切换碰一下。
   *
   * 名单仍然走 `applyTo` 里的 `schemas()` 现算（与 `agent/created` / `tools/change` 同一条路径、
   * 同一份判据），所以「切档之后才条件注册的工具」也一并落进这次重算，不另立一套。
   */
  const resyncSessions = (ids: readonly string[]): void => {
    const wanted = new Set(ids)
    for (const agent of [...seen.values()]) {
      const id = sessionIdOf(agent)
      if (id === undefined || !wanted.has(id)) continue
      applyTo(agent)
    }
  }
  /**
   * 把一串旋钮事件合并成**一次**重算（理由与 {@link scheduleResync} 同源：工具表在请求构建时
   * 才投影给模型，microtask 一定跑在下一次请求之前）。
   *
   * 为什么按会话 id 而不是直接重算全部：一次切档只影响一个会话，而每个 agent 的重算都要读一次
   * 全局 `schemas()` 并可能下发一次 `restrict()`；多会话宿主里那是白花的钱。
   */
  const scheduleSessionResync = (sessionId: string): void => {
    if (closed) return
    pendingSessions.add(sessionId)
    if (sessionResyncQueued) return
    sessionResyncQueued = true
    queueMicrotask(() => {
      sessionResyncQueued = false
      const ids = [...pendingSessions]
      pendingSessions.clear()
      if (closed) return
      try {
        resyncSessions(ids)
      } catch (error) {
        log(`tier-restrict: 档位切换后重算失败（${messageOf(error)}），保持当前限制`)
      }
    })
  }
  /*
   * 会话中途的档位切换：宿主把旋钮写成**会话事件**，派发时第一个参数就是 session（签名
   * `(session, event)`，见 `dsh-session` 的 `session/event`），所以「按 session 找回 agent」
   * 只是拿 `agent.session.id` 比一下，不需要反查机制。
   *
   * 两个方向都收：升档时 `deny` 变空 → `lift()` 把工具放回来；降档时重新算出一份非空名单 →
   * 重新下发。不订阅的话，升档会话的模型会一直面对旧工具面（看着像「授权没生效」），降档会话
   * 则会反复去试已经不可能成功的工具。
   */
  subscribe('session/event', (...args: unknown[]) => {
    /* 信封是 `{ type, seq, time, data }`——只看顶层 `type`，载荷一个字不读（见文件头第 3 条）。 */
    const event = args[1] as { type?: unknown } | undefined
    if (typeof event?.type !== 'string' || !TIER_KNOB_EVENTS.has(event.type)) return
    const session = args[0] as { id?: unknown } | undefined
    const id = typeof session?.id === 'string' ? session.id : undefined
    if (id === undefined || id === '') return
    scheduleSessionResync(id)
  })

  return () => {
    closed = true
    pendingSessions.clear()
    for (const agent of [...applied.keys()]) lift(agent)
    seen.clear()
    for (const dispose of disposers.splice(0)) {
      try {
        dispose()
      } catch {
        /* 已注销 */
      }
    }
  }
}
