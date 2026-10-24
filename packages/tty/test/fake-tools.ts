/**
 * @hyzyn/dsh-tty — 单测用的**宿主 `tools` 服务**最小忠实实现。
 *
 * ## 为什么需要它（而不是随便捏一个 `{ register }`）
 *
 * `tools.restrict()` 是宿主给 scoped context 的一张**限制层**，判据全在宿主那一侧：
 * 谁来调用（有没有 scope）、名单怎么校验（未知名字整体抛错）、限制落在哪一层
 * （只过滤继承来的全局工具）、撤销怎么生效（返回的 disposer）。这些都不是本插件的代码，
 * 所以把它们抄成一份夹具、再由用例逐条钉住，是**唯一**能在单测里覆盖这条接线的办法——
 * 真机契约另由真机验收跑（宿主换版本时夹具与宿主的偏差会以「用例仍绿、真机不裁」的形式暴露，
 * 所以夹具里的每条语义都标了宿主源码的行号，改宿主时先对这里）。
 *
 * 语义逐条取自 `dsh-tools@0.2.1-rc.3/lib/index.js`（本机链接的宿主版本）：
 *
 *   - `restrict()` 第一句 `scopeOf(this.ctx)`，取不到 scope 直接抛 —— `:2993`；
 *   - `allow` / `deny` 编译成 `Set`（**精确匹配，没有通配**）—— `:2997`；
 *   - 两样都不给 = 空过滤，抛（「almost always a materialized-empty-config bug」）—— `:2996`；
 *   - 不能点名保留的 `run_code` —— `:3001`；
 *   - 名单里任何一个名字不在**当前全局工具集**里 → 整体抛 `unknown global tool ...` —— `:3004`；
 *   - 返回 `layers.effect(ctx, …)` 的 disposer，撤销即恢复 —— `:3005`；
 *   - `view()` 里限制只过滤**继承来的**（全局 + 祖先）工具，scope 自己注册的不受限制 —— `:3083-3089`；
 *   - 任何一层变化都发 `tools/change`（`ToolRuntime.layers` 的 onChange）—— `:2784`。
 *
 * ## 故意不实现的
 *
 * scope 链（父子继承）、`allow` 之外的模式（auto / ptc）、工具定义的 output / render 投影、
 * scope 自己的注册表——tty 一个都不用。**别拿它当宿主**：它只回答「这条限制会让谁看不见什么」。
 */

/** 一条工具定义（只保留用例会读的字段；真宿主的定义另有 execute / output 等）。 */
export interface FakeToolDefinition {
  name: string
  description?: string
  parameters?: { required?: string[]; properties?: Record<string, { type?: string | string[] }> }
  isConcurrencySafe?: (args: unknown) => boolean
}

/** `tools.restrict()` 的入参形状（与宿主 `ToolRestriction` 同形）。 */
export interface FakeToolRestriction {
  allow?: readonly string[]
  deny?: readonly string[]
}

/** 一个 scoped context 看到的 `tools` 句柄（真实宿主里就是 `agent.ctx.tools`）。 */
export interface FakeToolsHandle {
  /** 注册一个**全局**工具；返回的 disposer 撤掉它（热重注册时先撤后挂）。 */
  register(definition: FakeToolDefinition): () => void
  /**
   * 可见工具名。**scope 由参数给、不由 `this` 给**（宿主 `schemas(scope?)` 的原样语义，
   * `:3119`）；不传 = 全局视图。模型看到的工具表就是 `schemas(agent)` 这一份。
   */
  schemas(scope?: object): Array<{ name: string; description: string }>
  /** 给 `scope` 加一层限制；**必须**从 scoped 句柄调（全局句柄调必抛，同宿主）。 */
  restrict(filter: FakeToolRestriction): () => void
}

export interface FakeToolsHost {
  /** 全局注册集（名字 → 定义，注册顺序）。 */
  readonly definitions: Map<string, FakeToolDefinition>
  /** 插件作用域（无 scope）的句柄：注册用它，`restrict` 用它必抛。 */
  readonly global: FakeToolsHandle
  /** 造一个绑定到 `scope` 的句柄（`scope` 就是 agent 本身——宿主 `createScope(loopCtx, this)` 的键）。 */
  handleFor(scope: object): FakeToolsHandle
  /** 全局注册集的名字（注册顺序）。 */
  names(): string[]
  /** 某个 scope 的可见名（= `schemas(scope)` 的 name 投影；不传 = 全局视图）。 */
  namesFor(scope?: object): string[]
  /** 某个 scope 上还挂着几层限制（0 = 全撤了；`agent/disposed` / `unmount` 要的观测面）。 */
  restrictionCount(scope?: object): number
  /** `tools/change` 累计次数（宿主每次层变化都会发一条）。 */
  changeCount(): number
  /** 订阅 `tools/change`；返回注销函数。 */
  onChange(listener: () => void): () => void
}

/** 一条已落地的限制（`token` 只用来让 disposer 精确摘掉自己那一层）。 */
interface CompiledRestriction {
  token: number
  allow?: Set<string>
  deny?: Set<string>
}

/**
 * 造一个假宿主。多个 agent 共用一个 host 实例——「只影响这个 agent」这条性质
 * 必须在**同一个注册集**上成立，各造一个 host 反而证明不了隔离。
 */
export function createFakeToolsHost(): FakeToolsHost {
  const definitions = new Map<string, FakeToolDefinition>()
  const restrictions = new Map<object, CompiledRestriction[]>()
  const listeners: Array<() => void> = []
  let tokenSeq = 0
  let changes = 0

  const notify = (): void => {
    changes += 1
    for (const listener of [...listeners]) {
      try {
        listener()
      } catch {
        /* 监听器自己的问题，不影响宿主记账 */
      }
    }
  }

  /** 一个 scope 上所有限制合起来的「藏起来」集合（逐条限制取并集）。 */
  const hiddenFor = (scope: object | undefined): Set<string> => {
    const hidden = new Set<string>()
    for (const restriction of scope === undefined ? [] : restrictions.get(scope) ?? []) {
      for (const name of definitions.keys()) {
        if (restriction.deny?.has(name) === true) hidden.add(name)
        else if (restriction.allow !== undefined && !restriction.allow.has(name)) hidden.add(name)
      }
    }
    return hidden
  }

  const makeHandle = (scope: object | undefined): FakeToolsHandle => ({
    register(definition: FakeToolDefinition): () => void {
      if (definitions.has(definition.name)) {
        throw new Error(`tool "${definition.name}" is already registered`)
      }
      definitions.set(definition.name, definition)
      notify()
      let active = true
      return () => {
        if (!active || definitions.get(definition.name) !== definition) return
        active = false
        definitions.delete(definition.name)
        notify()
      }
    },

    schemas(viewing?: object): Array<{ name: string; description: string }> {
      const hidden = hiddenFor(viewing)
      return [...definitions.values()]
        .filter((definition) => !hidden.has(definition.name))
        .map((definition) => ({ name: definition.name, description: definition.description ?? '' }))
    },

    restrict(filter: FakeToolRestriction): () => void {
      // 宿主 `:2993`：作用域是**调用方那个 context** 的，全局调用没有边界可言。
      if (scope === undefined) {
        throw new Error('tools.restrict() requires a scoped context (agent.ctx): a context-global restriction would mask every agent — deny the tool for the intended agent instead')
      }
      // 宿主 `:2996`：空过滤几乎总是「配置物化成空」的 bug，不许当 no-op。
      if (filter?.allow === undefined && filter?.deny === undefined) {
        throw new Error('tools.restrict({}) is a no-op: pass `allow` and/or `deny` (an empty filter is almost always a materialized-empty-config bug)')
      }
      const named = [...filter.allow ?? [], ...filter.deny ?? []]
      // 宿主 `:3001`：`run_code` 是保留的呈现载体，裁它等于裁掉整档的呈现方式。
      if (named.includes('run_code')) {
        throw new Error('tools.restrict() cannot name reserved PTC mode presentation transport "run_code"; restrict end-capability tools instead')
      }
      // 宿主 `:3004`：未知名字整体抛。这条是「deny 必须与 schemas() 求交」的直接原因。
      const unknown = named.filter((name) => !definitions.has(name))
      if (unknown.length > 0) {
        throw new Error(`tools.restrict() names unknown global tool${unknown.length > 1 ? 's' : ''} ${unknown.map((name) => `"${name}"`).join(', ')}; known global tools: ${[...definitions.keys()].sort().join(', ') || '(none)'}`)
      }
      const compiled: CompiledRestriction = {
        token: ++tokenSeq,
        ...filter.allow === undefined ? {} : { allow: new Set(filter.allow) },
        ...filter.deny === undefined ? {} : { deny: new Set(filter.deny) },
      }
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
    definitions,
    global,
    handleFor(scope: object): FakeToolsHandle {
      return makeHandle(scope)
    },
    names: () => [...definitions.keys()],
    namesFor: (scope?: object) => global.schemas(scope).map((schema) => schema.name),
    restrictionCount: (scope?: object) => (scope === undefined ? 0 : (restrictions.get(scope)?.length ?? 0)),
    changeCount: () => changes,
    onChange: (listener: () => void) => {
      listeners.push(listener)
      return () => {
        const index = listeners.indexOf(listener)
        if (index >= 0) listeners.splice(index, 1)
      }
    },
  }
}
