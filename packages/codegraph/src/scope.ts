/**
 * ROADMAP P0：per-agent scoped MCP 挂载。
 *
 * 现状（'managed'）是**一行托管**：本插件在 `~/.dsh/cordis.patch.yml` 里维护
 * `@deepseek-ai/dsh-mcp-client` 的 codegraph 行，一台 MCP 服务器同一时刻只服务一个
 * 项目（行里的 `cwd`），多项目靠 `projectPath` 入参 + `followSession` 重写 cwd 后
 * 热加载重建连接。代价：时分复用、每次会话切换都写盘、多实例并发写同一文件、
 * 且「工具名相同而语义随全局 cwd 漂移」。
 *
 * 本模块实现方案里的另一半：**把 dsh-mcp-client 挂进每个 agent 自己的 scope**。
 *
 * 机制（逐条读过运行时实现，不是推测）：
 *
 *   1. `agent.ctx` **本身就是**一个 scope——`dsh-agent-loop/lib/index.js:759-760`
 *      `this.scope = createScope(loopCtx, this); this.ctx = this.scope.ctx`。所以
 *      「per-agent 挂载」不需要自己 `createScope`，直接用 `agent.ctx` 即可。这也正是
 *      `dsh-tools` 那条报错信息的指引（「register through that agent's `agent.ctx`
 *      instead」）。
 *   2. `ToolRuntime.register()` 走 `this.layers.effect(this.ctx, …)`，而 `ScopedLayers.effect`
 *      按 `scopeOf(ctx)` 分桶（`dsh-scope`）。宿主服务被 `createTraceable` /
 *      `createShadowMethod` 包过，**方法调用时 `this` 会被重绑成调用方那个 context**
 *      （`cordis/lib/index.js:111-121`）——所以 `agentCtx.tools.register(...)` 落在
 *      **该 agent 的分层**里。
 *   3. `ToolRuntime.view(scope)`（`dsh-tools/lib/index.js:2957-2975`）先铺全局层、再按
 *      scope 链覆盖，scope 自己的层最后写入即最终生效。模型看到的工具表就是
 *      `schemas(exec.agent)` 算出来的（`:1402`）。
 *   4. `dsh-mcp-client` 的 serverName 占用按 `scopeOf(ctx) ?? ctx.root` 记
 *      （`lib/index.js:812-818`）：**不同 scope 的同名不冲突**，同一 scope 内才冲突。
 *   5. agent 销毁时 `machine.scope.dispose()`（`dsh-agent-loop:1659`）会连同 scope 里
 *      挂的子 fiber 一起释放（`Fiber` 构造里 `this.dispose = parent.fiber.effect(...)`），
 *      所以 per-agent 的 MCP 子进程**随 agent 回收**，不需要我们额外兜底。
 *
 * 因此本模块的**核心正确性判据**是：会话目录没有可用索引时**不挂载**，而不是回落到
 * 默认项目。回落正是「没有索引的 agent 却拿到别的项目的上下文」那个 bug 的成因。
 *
 * 本文件刻意**不 import 任何 dsh 运行时包**：纯决策函数能直接进 vitest（与
 * `foldToolCall` / `syncManagedMcpRow` 同样的理由），真机契约另由
 * `scripts/verify-codegraph-host-contract.mjs` 验证。
 */

/* ------------------------------------------------------------------ *
 * 模式解析
 * ------------------------------------------------------------------ */

/** MCP 挂载模式。'managed' = 现状（托管行 + per-project 热切换）；'per-agent' = 每 agent 一进程。 */
export type McpScopeMode = 'managed' | 'per-agent'

/** 两种模式的规范值（卡片与配置校验共用，避免两处字面量漂移）。 */
export const MCP_SCOPE_MODES: readonly McpScopeMode[] = ['managed', 'per-agent']

/** 默认模式：**保持现状**。per-agent 是行为变更，由用户显式开启（见 P0-PLAN 第五节）。 */
export const DEFAULT_MCP_SCOPE: McpScopeMode = 'managed'

/** 把任意输入规范化成模式；非法值回落 fallback（不抛：配置面永远不该让插件起不来）。 */
export function normalizeMcpScope(value: unknown, fallback: McpScopeMode = DEFAULT_MCP_SCOPE): McpScopeMode {
  return value === 'per-agent' || value === 'managed' ? value : fallback
}

export interface ScopeModeInput {
  /** 安装级配置里的 mcpScope。 */
  config?: unknown
  /** settings 里存过的 mcpScope（用户级；存过则优先于安装级）。 */
  stored?: unknown
  /**
   * MCP 集成总开关（mcpIntegration / manage）。关掉它时**两种模式都不挂**：per-agent 也是
   * MCP 集成的一部分，绕过总开关去挂就是「关了还开着」。
   */
  manageEnabled: boolean
  /** 宿主是否提供 agent 事件面（`agents` 服务 + `agent/created`）。 */
  agentEvents: boolean
  /**
   * 是否检测到**区块外**手工写的 codegraph MCP 行。
   *
   * 那是用户显式配置的全局 MCP 服务器，插件无权顶掉它；而它与 per-agent 挂载会**同名**
   * （同一个 `serverName: codegraph`），全局那行会让没有索引的 agent 继承到「全局 cwd
   * 指向的项目」——正是本方案要消除的语义漂移。所以这种情况下退回 managed 并说明原因。
   * （区块内、即 dsh-mcp 卡片托管的那行不算「手工行」，那是本插件照常复用的对象。）
   */
  externalRow: boolean
}

export interface ScopeModeDecision {
  mode: McpScopeMode
  /** 最终落到该模式的原因（卡片展示 / 诊断包用）。 */
  reason: string
}

/**
 * 纯函数：解析**生效**的 MCP 挂载模式。
 *
 * 用户要 per-agent 但前提不成立时**不静默降级**：一律退回 managed 并给出具体原因，
 * 让卡片能说清「你以为开了、实际没开」。四条前提缺一不可（总开关开着 / 有 agent 事件面 /
 * 无区块外手工行 / 模式值合法），其中外部手工行那条见
 * {@link ScopeModeInput.externalRow} 的注释。
 */
export function resolveScopeMode(input: ScopeModeInput): ScopeModeDecision {
  const wanted = normalizeMcpScope(input.stored ?? input.config, DEFAULT_MCP_SCOPE)
  if (!input.manageEnabled) {
    return { mode: 'managed', reason: 'MCP 集成总开关已关闭，两种模式都不挂载' }
  }
  if (wanted === 'managed') {
    return {
      mode: 'managed',
      reason: input.stored ?? input.config
        ? 'managed（托管行 + 按会话热切换）'
        : 'managed（默认：托管行 + 按会话热切换）',
    }
  }
  if (!input.agentEvents) {
    return {
      mode: 'managed',
      reason: '要 per-agent 但宿主没有 agent 事件面（拿不到 agent/created），已退回 managed',
    }
  }
  if (input.externalRow) {
    return {
      mode: 'managed',
      reason: '要 per-agent 但检测到区块外手工配置的 codegraph MCP 行；插件无权顶掉用户的显式配置，已退回 managed',
    }
  }
  return { mode: 'per-agent', reason: 'per-agent（每个 agent 一个 scoped MCP 进程）' }
}

/* ------------------------------------------------------------------ *
 * 单个 agent 的挂载决策
 * ------------------------------------------------------------------ */

export interface AgentMountInput {
  /** agent 会话目录（`agent.session.header.cwd`）。形状可能随版本变，按 unknown 收。 */
  sessionCwd?: unknown
  /** 该会话目录解析出的索引根（`resolveIndexedRoot(sessionCwd)`）。 */
  root?: string
  /** 该会话目录是不是有效索引（`indexState(sessionCwd) === 'indexed'`）。 */
  indexed?: boolean
  /**
   * CLI 探测状态。**只在明确 false 时不挂**——探测是异步的，用 `!== true` 会把
   * 「探测还没落地」的那个窗口里创建的 agent 静默漏掉（CG41 的同一教训）。
   */
  cliAvailable?: boolean
}

export interface AgentMountDecision {
  mount: boolean
  /** 挂载时的 cwd（= 索引根，不是会话目录）。 */
  root?: string
  reason: string
}

/**
 * 纯函数：一个 agent 该不该挂 MCP，以及挂在哪个目录。
 *
 * **没有有效索引就不挂**（不是回落到默认项目）：一个在别处（比如家目录）开的会话，
 * 拿到「某个别的项目」的探索工具只会给出误导性答案；没有工具时模型会按指引退回
 * grep/read，那才是正确的降级。
 *
 * cwd 取 **locateIndex 找到的根**（与 `effectiveProjectPath` 同口径，CG02）：会话目录在
 * monorepo 子目录时索引在仓库根。
 */
export function agentMountDecision(input: AgentMountInput): AgentMountDecision {
  if (input.cliAvailable === false) {
    return { mount: false, reason: 'codegraph CLI 不可用（探测失败），未挂载' }
  }
  const cwd = typeof input.sessionCwd === 'string' ? input.sessionCwd.trim() : ''
  if (cwd === '') {
    return { mount: false, reason: '会话没有工作目录，未挂载' }
  }
  if (input.indexed !== true || typeof input.root !== 'string' || input.root === '') {
    return { mount: false, reason: '会话目录没有可用的 .codegraph/ 索引，未挂载（不回落，避免拿到别的项目上下文）' }
  }
  return { mount: true, root: input.root, reason: '已按会话索引根挂载' }
}

/* ------------------------------------------------------------------ *
 * 挂载 / 撤销（依赖注入，便于用假实现单测）
 * ------------------------------------------------------------------ */

/** 一个 agent 的最小形状（故意结构化：本包 peer 里没有 dsh-agent 的类型）。 */
export interface AgentLike {
  id?: unknown
  session?: { id?: unknown; header?: { cwd?: unknown } } | undefined
  ctx?: unknown
}

/** Cordis 的 `ctx.plugin()` 返回值：thenable（可 await 到「启动完成」）+ 继承自 fiber 的 dispose。 */
export interface PluginFiberLike {
  dispose?: () => unknown
}

/** 一条挂载记录（`/status` 与诊断包读它）。 */
export interface AgentMountRecord {
  id: string
  /** 会话目录。 */
  cwd?: string
  /** 实际挂载的 cwd（索引根）。 */
  root?: string
  mounted: boolean
  reason: string
  /** 挂载/启动失败原因（成功时缺省）。 */
  error?: string
  at: number
}

export interface AgentMounterDeps {
  /** 动态载入 `@deepseek-ai/dsh-mcp-client`；宿主没有时返回 undefined（可选依赖）。 */
  loadClient: () => Promise<unknown | undefined>
  /** MCP serverName（固定 codegraph，以保住单工具命名约定）。 */
  serverName: string
  /** codegraph CLI 命令。 */
  command: string
  /** CLI 探测状态访问口（闭包读，探测可能晚于 agent 创建）。 */
  cliAvailable: () => boolean | undefined
  /** 会话目录 → 索引根（生产环境传 `resolveIndexedRoot`）。 */
  resolveRoot: (cwd: string) => string | undefined
  /** 该目录是不是有效索引。 */
  isIndexed: (cwd: string) => boolean
  logger: { log(message: string): void; warn(message: string): void }
}

export interface AgentMounter {
  /** 按决策挂载/跳过（幂等：同一 agent 重复调用不再挂第二个进程）。 */
  attach(agent: AgentLike, mode: McpScopeMode): AgentMountRecord
  /** 撤销一个 agent 的挂载并清掉记录（agent 销毁时调用）。 */
  detach(agent: AgentLike): void
  /** 撤销全部挂载（切回 managed / 插件卸载时调用）。 */
  detachAll(): void
  /** 当前挂载记录快照（按 agent id）。 */
  records(): AgentMountRecord[]
  /** 已挂载 fiber 数（供状态行显示未回收到位的泄漏）。 */
  liveCount(): number
}

/** 取 agent id：`agent.id` 与 `session.id` 是同值（dsh-agent 的 enter() 会校验）。 */
function agentIdOf(agent: AgentLike): string | undefined {
  const id = agent.id ?? agent.session?.id
  return typeof id === 'string' && id !== '' ? id : undefined
}

/**
 * 创建 per-agent 挂载器。
 *
 * **失败模式是刻意的**：任何单个 agent 的挂载失败（模块缺失 / 连接失败 / scope 不可用）
 * 都只记日志 + 记进该 agent 的记录，**不抛给调用方**——agent/created 是 serial 派发，
 * 在那里抛出会让**会话创建失败**，而 codegraph 只是一个可选能力，它没有资格让会话起不来。
 */
export function createAgentMounter(deps: AgentMounterDeps): AgentMounter {
  const mounted = new Map<string, AgentMountRecord>()
  const fibers = new Map<string, PluginFiberLike>()

  const attach = (agent: AgentLike, mode: McpScopeMode): AgentMountRecord => {
    const id = agentIdOf(agent) ?? '(anonymous)'
    const cwdRaw = agent.session?.header?.cwd
    const cwd = typeof cwdRaw === 'string' ? cwdRaw : undefined

    // 幂等：已经挂过就不再挂（重复的 agent/created 派发不该起第二个进程——同名同 scope
    // 的第二个实例会被 dsh-mcp-client 直接拒绝，白跑一次连接）。
    //
    // 但**会话目录变了**要重挂（实测：同一 scope 里再挂一个同名实例会被拒
    // 「serverName "codegraph" is already in use」，唯一的换项目路径是「释放旧 scope +
    // 建新 scope」，等价于 detach 后重新 attach）。不加这一条的话，resume / clear /
    // compaction 把 cwd 换掉之后，这个 agent 会一直用**上一个项目**的 MCP 服务器——
    // 正是本方案要消除的那种静默串台。
    const existing = mounted.get(id)
    if (existing?.mounted === true) {
      if (existing.cwd === cwd) return existing
      detachById(id)
    }
    // 未挂载的记录**不**复用：`codegraph init` 之后再开同一会话时，判定结果会变，而
    // 判定本身很便宜（locateIndex 只是几次 stat）。缓存它会把这个 agent 永久钉在
    // 「不挂」上，且没有任何重试入口（agent/created 只在会话开始/恢复/清理时触发）。

    if (mode !== 'per-agent') {
      const record: AgentMountRecord = { id, cwd, mounted: false, reason: '当前模式是 managed，不走 per-agent 挂载', at: Date.now() }
      mounted.set(id, record)
      return record
    }

    const decision = agentMountDecision({
      sessionCwd: cwdRaw,
      root: cwd === undefined ? undefined : deps.resolveRoot(cwd),
      indexed: cwd === undefined ? false : deps.isIndexed(cwd),
      cliAvailable: deps.cliAvailable(),
    })
    if (!decision.mount) {
      const record: AgentMountRecord = { id, cwd, mounted: false, reason: decision.reason, at: Date.now() }
      mounted.set(id, record)
      return record
    }

    const scope = agent.ctx as { plugin?: (plugin: unknown, config: unknown) => unknown } | undefined
    const mountPlugin = scope?.plugin
    if (typeof mountPlugin !== 'function') {
      const record: AgentMountRecord = { id, cwd, root: decision.root, mounted: false, reason: '该 agent 没有可用的 scoped context（agent.ctx.plugin 不可用）', at: Date.now() }
      mounted.set(id, record)
      return record
    }

    // 记录先落：loadClient 是异步的，期间重复的 attach 应当看到「已在处理」而不是再开一份
    const record: AgentMountRecord = { id, cwd, root: decision.root, mounted: false, reason: '正在挂载…', at: Date.now() }
    mounted.set(id, record)

    void deps.loadClient()
      .then((client) => {
        if (client === undefined) {
          record.reason = '宿主没有 @deepseek-ai/dsh-mcp-client（可选依赖未安装），未挂载'
          deps.logger.warn(`[dsh-codegraph] ${record.reason}`)
          return undefined
        }
        // 整包 namespace 对象直接可用：cordis 的 Context.resolve 认「有 apply 的对象」
        // （`cordis/lib/index.js:1532-1537` isApplicable），所以不必挑 .apply 传。
        const config = {
          serverName: deps.serverName,
          transport: 'stdio',
          command: deps.command,
          args: ['serve', '--mcp'],
          cwd: decision.root,
          // 起不来时报错交给下面的 catch（而不是静默变成「这个 agent 没工具」）
          failOnStartupError: true,
        }
        const fiber = mountPlugin(client, config) as PluginFiberLike
        fibers.set(id, fiber)
        record.mounted = true
        record.reason = '已挂载'
        record.at = Date.now()
        deps.logger.log(`[dsh-codegraph] per-agent MCP 已挂载：agent=${id} cwd=${decision.root}`)
        // 不 await：agent/created 是 serial 派发，等一次 spawn+握手（实测 ~75ms）会拖慢
        // 会话创建，而连接失败也没必要让会话起不来。启动失败经 catch 记进记录。
        return Promise.resolve(fiber as PromiseLike<unknown>).catch((error: unknown) => {
          record.mounted = false
          record.error = error instanceof Error ? error.message : String(error)
          record.reason = '启动失败：' + record.error
          deps.logger.warn(`[dsh-codegraph] per-agent MCP 启动失败：agent=${id} — ${record.error}`)
        })
      })
      .catch((error: unknown) => {
        record.mounted = false
        record.error = error instanceof Error ? error.message : String(error)
        record.reason = '挂载失败：' + record.error
        deps.logger.warn(`[dsh-codegraph] per-agent MCP 挂载失败：agent=${id} — ${record.error}`)
      })

    return record
  }

  /**
   * 回收一个 agent 的挂载（按 id）。换项目重挂与 agent 销毁共用这一条路径，
   * 避免「释放逻辑写两遍、只修好一处」。
   */
  const detachById = (id: string): void => {
    const fiber = fibers.get(id)
    fibers.delete(id)
    mounted.delete(id)
    if (fiber === undefined) return
    try {
      // 正常路径下 agent 销毁时 scope 会连子 fiber 一起释放（dsh-agent-loop:1659），
      // 所以这里是**幂等的显式兑现**：切回 managed / 插件卸载时需要立刻回收，
      // 不依赖 agent 自己的销毁时机。
      fiber.dispose?.()
    } catch (error) {
      deps.logger.warn(`[dsh-codegraph] per-agent MCP 释放失败：agent=${id} — ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const detach = (agent: AgentLike): void => {
    const id = agentIdOf(agent)
    if (id === undefined) return
    detachById(id)
  }

  return {
    attach,
    detach,
    detachAll() {
      for (const id of [...fibers.keys()]) detachById(id)
      // detachById 只在有 fiber 时才删记录；这里补上「没挂成的记录」也一并清掉。
      mounted.clear()
    },
    records: () => [...mounted.values()],
    liveCount: () => fibers.size,
  }
}
