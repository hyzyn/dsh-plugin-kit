/**
 * MCP 工具面的**按需加载**（`agentToolLoading: 'on-demand'`，2026-10-25）。
 *
 * ## 为什么不是「不注册」
 *
 * 本机的 `mcp__*` 工具在真实会话里占工具表的**一半**（单次实测：149 个工具 130,439 B，
 * 其中 MCP 70 个 66,362 B ≈948 B/个，≈1.7 万 token/请求；取真实会话的 `request/header`
 * 快照，量级而非承诺值，README 的同名小节记了口径）。但 MCP 工具必须由宿主
 * `dsh-mcp-client` 注册（进程模型、patch 行格式都不该被本插件改），所以本层的做法是：
 * **注册照旧，用 `tools.restrict` 把它们从 agent 的模型视图里摘掉**——请求体里不再有那 66KB，
 * 与「不注册」等价；模型只看到 `mcp_servers` / `mcp_load` 两个索引工具，需要时自己装载。
 *
 * 判据：`tools.restrict` 的投影就是模型请求拿到的工具表（受限档 19→10 那条链已验证，
 * 见 `scripts/verify-tier-restrict.mjs`）。
 *
 * ## 与 `attachTierRestrict`（`@hyzyn/dsh-kit`）的分工
 *
 * 两层**互不干扰**、判据正交：
 *   - 档位那条（kit）：受限档下 write / exec 类工具**永远**不可见，`mcp_load` 也装载不回来；
 *   - 本层：按「已装载的 server」裁 `mcp__*`，与档位无关。
 * 两条限制在宿主的 scope 层里**取交集**（`restrict` 可叠加），所以「受限档 + 已装载 jenkins」
 * 的结果仍是零 `mcp__*`——安全边界没有被这条新路径放宽，模型只是多了一个「先声明要什么」的回合。
 *
 * ## 为什么名单必须现算（与 kit 同一个坑）
 *
 * `restrict()` 对**任何一个**不在全局注册集里的名字整体抛错（`unknown global tool …`），
 * 所以 deny 只能由 `schemas()` 投影出的真实名字现算：注册了才裁，没注册不点名。也正因为如此，
 * `tools/change`（server 后连上 / 插件热重载）必须按**新注册集**重算——否则新连上的 server
 * 会带着全套工具露在模型面前。
 *
 * ## 只裁「我们管的」（`managed`）
 *
 * `mcp__*` 不是本插件专属前缀：用户手写、或别的插件托管的 mcp-client 行，注册出来的工具长得
 * 一模一样。而 `mcp_load` 的白名单只来自本插件的托管行——把外部行一起裁掉，等于把它们**永久
 * 隐藏且装不回来**（模型连它们的存在都看不到）。所以 {@link planSurfaceDeny} 只点名
 * 「属于托管行且未装载」的那些，外部行与解析不出归属的名字一律不碰（与 `eager` 时一致）。
 * 这是本仓「不碰非本插件的工具」那条在按需加载这一层的落点。
 *
 * ## 生命周期
 *
 * `agent/created` 挂、`agent/disposed` 撤、`tools/change` 合并重算、插件卸载全撤（返回的
 * disposer）。**全程不抛**：`agent/created` 是 serial 派发，在这里抛会让会话起不来，而本层
 * 只影响「模型看得见什么」，没有资格让会话失败。
 */
import type { Context } from '@deepseek-ai/cordis'

/** 宿主给 MCP 工具的名字前缀（`mcp__<serverName>__<tool>`，由 `dsh-mcp-client` 决定）。 */
const MCP_TOOL_PREFIX = 'mcp__'

/** `schemas()` 投影里本模块只用到的字段（`name` 是唯一的键）。 */
interface ToolSchemaLike {
  name?: unknown
}

/**
 * `tools` 服务在本模块用到的两个方法（结构化声明——本包不依赖宿主包的类型）。
 *
 * `schemas` 是公开方法，**不传 scope = 全局视图**；`restrict` 只能从 **agent 自己的 ctx** 上取到
 * 带 scope 的那一份（见 {@link toolsOf}）。
 */
export interface ToolsServiceLike {
  schemas(scope?: unknown): ReadonlyArray<ToolSchemaLike>
  restrict?(filter: { allow?: readonly string[]; deny?: readonly string[] }): () => void
}

/** agent 事件里用到的最小形状（与 kit `attachTierRestrict` 同款：字段全可选，结构化不依赖 dsh-agent）。 */
export interface AgentLike {
  id?: unknown
  session?: unknown
  ctx?: unknown
}

/** `mcp_load` 的结果（`mcp_load` 工具的返回值就是它，外加可选的 `note`）。 */
export interface SurfaceLoadResult {
  /** 真正装载（去重、只留认识的）的 server 名。 */
  loaded: string[]
  /** 请求里不认识、**没有装载**的 server 名。 */
  unknown: string[]
  /** 装载后该 agent 视图里真实的 `mcp__*` 名字（现算，顺序跟随注册集）。 */
  tools: string[]
}

/** 台账的读 / 写入口（`mcp_servers` / `mcp_load` 两个工具通过它拿状态与下装载动作）。 */
export interface AgentSurfaceControl {
  /** 该 agent 已装载的 server 名（没登记过 = 空数组）。 */
  loadedServers(agent: unknown): string[]
  /** 装载（**替换**语义）：把这些 server 的工具放进该 agent 的视图，空数组 = 全部卸掉。 */
  load(agent: unknown, servers: readonly string[]): SurfaceLoadResult
  /** 该 agent 当前能看到的 `mcp__*` 名字（由注册集与台账现算，不依赖限制是否已落地）。 */
  visibleTools(agent: unknown): string[]
}

/**
 * `attachAgentSurface` 的选项。
 *
 * `onReady` 是**可选**的交接位：契约把返回值钉成纯 `() => void`（处理器只负责撤），而两个
 * 工具需要拿到台账才能下装载动作——加一个可选回调，既不破返回值也不破必填字段。
 */
export interface AgentSurfaceOptions {
  /** `false` = 完全 no-op（`eager` 模式：不订阅、不下发任何限制）。 */
  enabled: boolean
  /** 日志出口（调用方负责加 `[dsh-mcp-config]` 前缀）。 */
  log(message: string): void
  /** 可装载的 server 名（来自 `buildServersDto`，**不要**在这里另建一份读取逻辑）。 */
  listServers(): readonly string[]
  /** 挂载完成后交接台账入口（`mcp_servers` / `mcp_load` 用它）。 */
  onReady?(control: AgentSurfaceControl): void
}

/**
 * 从 `mcp__<server>__<tool>` 里解析出 server 名；解析不出的返 `undefined`（= **不是我们的**）。
 *
 * 解析不出有两种：没有第二段分隔符（`mcp__lonely`）与空 server 段（`mcp____tool`）。两者都
 * 归不了属，于是按「不在托管行里」处理（{@link planSurfaceDeny} 会**留着它**）——隐藏一个我们
 * 既不认识、也没有装载入口的工具，等于让用户静默丢功能。
 *
 * 已知边界：`SERVER_NAME_RE` 允许 serverName 里出现 `__`，那种名字（如 `a__b`）从工具名
 * **无法反解**（`mcp__a__b__tool` 会被解析成 server `a`），于是它落进「不是我们的」那一侧
 * （保持可见、装不装都不由我们决定）。真实配置里没出现过这种名字，且宿主侧的公开名本身就有
 * 歧义；不为此加一条前缀猜测（那会让 `a` 与 `a__b` 互相污染）。要支持就得在 DTO 里带工具名
 * 前缀，而不是在名字上做字符串体操。
 */
function serverNameOf(name: string): string | undefined {
  if (!name.startsWith(MCP_TOOL_PREFIX)) return undefined
  const rest = name.slice(MCP_TOOL_PREFIX.length)
  const separator = rest.indexOf('__')
  if (separator <= 0) return undefined
  return rest.slice(0, separator)
}

/**
 * 需要裁掉的名字：**注册集里「属于托管行（`managed`）且未装载」的 `mcp__*`**（纯函数，顺序跟随
 * `registered`）。
 *
 * - `registered` 必须是 `schemas()` 拿到的**真实注册名**（`restrict()` 对未知名字整体抛错）；
 * - `managed` 是本插件托管区块里的 server 名（`listServers()` = `buildServersDto` 的同一份）；
 * - `loaded` 是 server 名（不是工具名），空数组 = 托管行全部卸掉；
 * - 解析不出 server 的名字（见 {@link serverNameOf}）**不裁**。
 *
 * ## 为什么必须按 `managed` 收口（只裁「我们的」）
 *
 * `mcp__*` 这个前缀**不是本插件专属的**：用户手写的 patch 行、别的插件托管的 mcp-client 实例，
 * 注册出来的工具长得一模一样。而 `mcp_load` 的装载白名单来自本插件的托管行——把不属于我们的
 * 工具也裁掉，等于把它们**永久隐藏且装不回来**（模型连「存在这么个 server」都看不到，`mcp_servers`
 * 也只报托管行）。那违反本仓「不碰非本插件的工具」那条（kit 的 `tier-restrict` 用 `prefixes`
 * 防的正是同一类误伤）。
 *
 * 代价是「外部行在 on-demand 下仍是常驻工具面」——这是**有意的**：我们既不认识它的语义，也没有
 * 装载入口，能做的只有不碰它。要收它，得先把它纳入托管（进 DTO 与 `listServers()`）。
 */
export function planSurfaceDeny(
  registered: readonly string[],
  loaded: readonly string[],
  managed: readonly string[],
): string[] {
  const managedServers = new Set(managed)
  const loadedServers = new Set(loaded)
  const deny: string[] = []
  for (const name of registered) {
    if (name === '' || !name.startsWith(MCP_TOOL_PREFIX)) continue
    const server = serverNameOf(name)
    // 解析不出 / 不在托管行 = **不是我们的**：不点名，保持可见（见上面的理由）。
    if (server === undefined || !managedServers.has(server)) continue
    if (loadedServers.has(server)) continue
    deny.push(name)
  }
  return deny
}

/** 取一个 context 绑定的 `tools` 服务（取不到 = 环境不支持，调用方按「不裁剪」处理）。 */
function toolsOf(target: unknown): ToolsServiceLike | undefined {
  if (target === null || typeof target !== 'object') return undefined
  const usable = (candidate: unknown): candidate is ToolsServiceLike =>
    candidate !== null &&
    typeof candidate === 'object' &&
    typeof (candidate as ToolsServiceLike).schemas === 'function'
  /*
   * ① `agent.ctx.tools`：宿主按调用方 context 重绑 `this` 的那一份（scope 就藏在它里面）。
   *    cordis 的 inject 守卫可能抛，所以整段包在 try 里；真宿主上这条路径是被
   *    `scripts/verify-tier-restrict.mjs` 实测过的取法（`attachTierRestrict` 用的就是它）。
   */
  try {
    const direct = (target as { tools?: unknown }).tools
    if (usable(direct)) return direct
  } catch {
    /* inject 守卫：读不到就走 `get`（同样是按调用方绑定的路径）。 */
  }
  // ② `ctx.get('tools')`：反射层的非严格取值（reflection 不要求 inject 声明）。
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

/** 两个名字集合是否等价（顺序无关；重算后用来判断「要不要重下限制」）。 */
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

/** 错误文案（日志用；`unknown` 收窄只做一次）。 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 在插件作用域上接管 `agent/created`：给每个 agent 的 scope 下一层「`mcp__*` 默认不可见」的
 * 限制，返回撤销函数（撤掉所有已下发的限制 + 退订）。**全程不抛**。
 *
 * 位置：与工具注册同一个 `ctx.effect`（插件禁用 / 卸载时一起撤）。**不要放进工具重注册那条
 * 路径**：热应用配置会重注册工具，而重注册不该把已有 agent 的限制一并撤掉（`agent/created`
 * 不会为老 agent 再发一次，撤了就再也装不回来）。
 *
 * `enabled: false`（`eager` 模式）时**直接返回空 disposer**：不订阅、不打日志、一次 `restrict()`
 * 都不额外发——默认档位的空行为就是「与今天完全一致」。
 */
export function attachAgentSurface(toolsCtx: Context, options: AgentSurfaceOptions): () => void {
  if (!options.enabled) return () => {}
  const log = options.log
  /** agent（对象身份 = 宿主 scope 键）→ 已落地的限制。 */
  const applied = new Map<object, { deny: string[]; dispose: () => void }>()
  /** 台账：agent → 已装载的 server 名（**唯一真相**；`mcp_servers` / `mcp_load` 都读它）。 */
  const loadedBy = new Map<object, string[]>()
  /** 见过面的 agent（含当前没有限制的那些）：工具集一变就要拿新注册集重算。 */
  const seen = new Map<object, AgentLike>()
  const disposers: Array<() => void> = []
  let resyncing = false
  let pendingResync = false
  let closed = false
  let toolsMissingLogged = false
  let listMissingLogged = false

  /** 撤销某个 agent 的限制（重复调用安全：agent scope 回收后的 disposer 也要能跑）。 */
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

  const loadedOf = (agent: object): readonly string[] => loadedBy.get(agent) ?? []

  /**
   * 托管行里的 server 名（= 「我们管的」那一半，`planSurfaceDeny` 只对它收口）。
   *
   * 读不到时返回**空集**：连「谁是我们管的」都不知道时不裁任何东西（fail-open）。反向的选择
   * （读不到就全裁）会把外部 mcp-client 行的工具一起埋掉，正是本函数要防的那个洞。
   */
  const managedServers = (): readonly string[] => {
    try {
      return options.listServers()
    } catch (error) {
      if (!listMissingLogged) {
        listMissingLogged = true
        log(`agent-surface: 读 server 清单失败（${messageOf(error)}），本轮不裁任何 mcp__*`)
      }
      return []
    }
  }

  /**
   * 该 agent 现在**应当**看不见的 `mcp__*` 名字（按真实注册集、托管行与台账现算）。
   *
   * 三个入参都是「现读」：注册集随 server 连上/掉线变、托管行随保存设置变、台账随 `mcp_load` 变。
   */
  const planFor = (agent: object, names: readonly string[]): string[] =>
    planSurfaceDeny(names, loadedOf(agent), managedServers())

  const visibleTools = (agent: unknown): string[] => {
    if (agent === null || typeof agent !== 'object') return []
    const host = toolsOf(toolsCtx)
    if (host === undefined) return []
    const names = globalToolNames(host)
    const deny = new Set(planFor(agent, names))
    return names.filter((name) => name.startsWith(MCP_TOOL_PREFIX) && !deny.has(name))
  }

  /**
   * 按**当前**注册集与台账给一个 agent 重算并下发。
   *
   * 「先登记再下发」是硬要求：`restrict()` 会同步触发 `tools/change`，重入的路径看到「已落地」
   * 才不会重复下发（名单没变时这一层只做一次集合比较）。
   */
  const applyTo = (agent: AgentLike): void => {
    if (agent === null || typeof agent !== 'object') return
    // 记下来：工具集热变更（新 server 连上 / 旧 server 掉线）时要给这批 agent 重算。
    seen.set(agent, agent)
    const host = toolsOf(toolsCtx)
    if (host === undefined) {
      if (!toolsMissingLogged) {
        toolsMissingLogged = true
        log('agent-surface: tools 服务不可用，按需加载关闭（工具面保持宿主原样）')
      }
      return
    }
    const id = agentIdOf(agent)
    const names = globalToolNames(host)
    const deny = planFor(agent, names)
    const current = applied.get(agent)
    if (current !== undefined && sameNames(current.deny, deny)) return
    // 名单为空才 `lift`：这一支承担「全部装载 → 把限制撤掉」的语义。
    if (deny.length === 0) {
      lift(agent)
      return
    }
    // **必须**从 agent 自己的 ctx 取（见文件头与 `toolsOf`）：插件 ctx 上没有 scope，restrict 会直接抛。
    const target = toolsOf(agent.ctx)
    if (target === undefined || typeof target.restrict !== 'function') {
      log(`agent-surface: agent ${id} 没有可用的 scoped tools（宿主太旧或缺 restrict），跳过按需加载`)
      return
    }
    lift(agent)
    const record = { deny, dispose: () => {} }
    // 先登记再下发（restrict 会同步触发 tools/change）。
    applied.set(agent, record)
    try {
      record.dispose = target.restrict({ deny })
      log(
        `agent-surface: agent ${id} → 隐藏 ${String(deny.length)} 个 mcp__* 工具` +
        `（已装载：${loadedOf(agent).join(', ') || '无'}）`,
      )
    } catch (error) {
      applied.delete(agent)
      log(`agent-surface: agent ${id} 下发按需加载限制失败（${messageOf(error)}），保持原工具表`)
    }
  }

  /**
   * 装载（**替换**语义）：`servers: []` = 全部卸掉。只装认识的，未知名字进 `unknown` 不抛。
   *
   * 台账**先**写、再下发：即使下发失败（宿主太旧），`mcp_servers` 报的装载状态与
   * `mcp_load` 的返回也仍然自洽（模型不会看到一个「装了一半」的状态）。
   */
  const load = (agentLike: unknown, servers: readonly string[]): SurfaceLoadResult => {
    // 白名单与裁名单**同一份**来源：只装托管行里的 server（外部行没有装载入口，见 planSurfaceDeny）。
    const known = new Set<string>(managedServers())
    const unknown: string[] = []
    const loaded: string[] = []
    for (const raw of servers) {
      const name = typeof raw === 'string' ? raw.trim() : ''
      if (name === '') continue
      if (!known.has(name)) {
        if (!unknown.includes(name)) unknown.push(name)
        continue
      }
      if (!loaded.includes(name)) loaded.push(name)
    }
    const agent = agentLike !== null && typeof agentLike === 'object' ? agentLike : undefined
    if (agent === undefined) return { loaded: [], unknown, tools: [] }
    loadedBy.set(agent, loaded)
    try {
      applyTo(agent as AgentLike)
    } catch (error) {
      log(`agent-surface: 装载后下发失败（${messageOf(error)}），台账已更新、限制保持原样`)
    }
    return { loaded, unknown, tools: visibleTools(agent) }
  }

  const control: AgentSurfaceControl = {
    loadedServers: (agent: unknown) => (agent !== null && typeof agent === 'object' ? [...loadedOf(agent)] : []),
    load,
    visibleTools,
  }

  const owner = toolsCtx as unknown as { on?(name: string, listener: (...args: unknown[]) => unknown): unknown }
  if (typeof owner.on !== 'function') {
    log('agent-surface: ctx.on 不可用，agent 事件订阅失败，按需加载关闭')
    try {
      options.onReady?.(control)
    } catch (error) {
      log(`agent-surface: onReady 回调抛错（${messageOf(error)}）`)
    }
    return () => {}
  }
  const subscribe = (name: string, listener: (...args: unknown[]) => void): void => {
    try {
      const dispose = owner.on!.call(toolsCtx, name, listener)
      if (typeof dispose === 'function') disposers.push(dispose as () => void)
    } catch (error) {
      log(`agent-surface: 订阅 ${name} 失败（${messageOf(error)}）`)
    }
  }

  subscribe('agent/created', (...args: unknown[]) => {
    const agent = (args[0] as { agent?: AgentLike } | undefined)?.agent
    if (agent === undefined) return
    try {
      applyTo(agent)
    } catch (error) {
      // 兜底：宁可这个 agent 不按需加载，也不许把会话创建带下去。
      log(`agent-surface: 给 agent 下发按需加载失败（${messageOf(error)}），保持原工具表`)
    }
  })
  subscribe('agent/disposed', (...args: unknown[]) => {
    const agent = (args[0] as { agent?: AgentLike } | undefined)?.agent
    if (agent === undefined) return
    seen.delete(agent)
    loadedBy.delete(agent)
    lift(agent)
  })

  /**
   * 按**新注册集**重算：MCP server 是后连上的（`tools/change` 由 mcp-client 在 `tools/list`
   * 之后触发），不重算的话新 server 的全套工具会一直露着（模型不需要 `mcp_load` 就能用）。
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
      log(`agent-surface: 工具集变更后重算失败（${messageOf(error)}），保持当前限制`)
    } finally {
      resyncing = false
    }
  }
  /**
   * 把一串同步的 `tools/change` 合并成**一次**重算（一个 server 连上会逐条注册几十个工具，
   * 逐条重算等于几十轮 restrict）。合并到 microtask 不影响正确性：工具表是在**请求构建时**
   * 才投影给模型的，microtask 一定跑在下一次模型调用之前。
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
        log(`agent-surface: tools/change 处理失败（${messageOf(error)}）`)
      }
    })
  }
  subscribe('tools/change', () => {
    scheduleResync()
  })

  /*
   * 把**已经在活的** agent 补进台账并应用一次。
   *
   * 这是「插件热重载 / 升级」那条路径的唯一兜底：旧实例卸载时 disposer 已经把限制撤了，而
   * `agent/created` 不会为已存在的会话再发一次——不补的话，切到 on-demand 之后的那些会话会
   * 一直看到全部 `mcp__*`，直到会话重开。`agents` 服务缺失时静默退化，只依赖 `agent/created`。
   */
  const injectable = toolsCtx as unknown as {
    inject?(names: readonly string[], callback: (serviceCtx: unknown) => void): unknown
  }
  try {
    const dispose = injectable.inject?.(['agents'], (serviceCtx: unknown) => {
      const agents = (serviceCtx as Record<string, unknown> | undefined)?.agents
      const list = (agents as { list?: () => unknown } | undefined)?.list
      if (typeof list !== 'function') return
      let live: unknown
      try {
        live = list.call(agents)
      } catch (error) {
        log(`agent-surface: agents.list() 失败（${messageOf(error)}），只依赖 agent/created`)
        return
      }
      if (!Array.isArray(live)) return
      let hydrated = 0
      for (const agent of live) {
        try {
          applyTo(agent as AgentLike)
          hydrated += 1
        } catch (error) {
          log(`agent-surface: 补算在活 agent 失败（${messageOf(error)}），保持原工具表`)
        }
      }
      if (hydrated > 0) log(`agent-surface: 挂载时补算 ${String(hydrated)} 个在活 agent 的工具面`)
    })
    if (typeof dispose === 'function') disposers.push(dispose as () => void)
  } catch (error) {
    log(`agent-surface: inject agents 失败（${messageOf(error)}），只依赖 agent/created`)
  }

  try {
    options.onReady?.(control)
  } catch (error) {
    log(`agent-surface: onReady 回调抛错（${messageOf(error)}）`)
  }

  return () => {
    closed = true
    for (const agent of [...applied.keys()]) lift(agent)
    applied.clear()
    loadedBy.clear()
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
