/**
 * 假宿主（**唯一的机制**）：`inject` 立刻回调子上下文、`effect(fn)` 立刻执行、settings 的
 * `update()` **先落值再广播** volatile 更新、工具/路由登记、`call` / `callError` 直接走
 * `execute` + `output.render`。
 *
 * ## 为什么它进了 `kit`（而不是继续各包一份）
 *
 * `devdata` / `devenv` 的两份夹具文件头都写着同一条判据：**夹具是测试脚手架、不是产物**，跨包
 * import 会让两个包的测试互相耦合；而「**若出现第三个消费者，判据就变了**——那时按 §16.1 的同一套
 * 判据上收进 `kit`（共享的是机制）」。2026-10-03 本包（`devfront`）成了第三个消费者，于是按那条
 * 判据上收：**机制只有这一份**，各包只留「自己的配置 schema + `apply` + 自己的服务开关」那几行适配。
 *
 * 代价是诚实的：`kit` 是发布包，这个模块会随 `lib/` 一起发布（多几十 KB 的测试脚手架）。
 * 换来的是三份拷贝不再各自漂——两包夹具的注释里记着漂移的实例（`indexforce` 那份抄漏了收尾比对，
 * 静态守卫却因为正则命中了它的一句注释而保持全绿）。
 *
 * ## 谁提供什么
 *
 * 调用方（各包）给：`ns`（settings 的 entry id）、`parse`（自己的 `Config` schema）、`plain`
 * （`plainConfig`）、`apply`（`definePlugin` 交出来的那个函数）。本模块给：**假 cordis 的全部行为**。
 *
 * ## 保真度：配置走**真实 schema**
 *
 * `mount()` 把配置过一遍调用方的 schema（真宿主交下来的就是它，插件自己会 `plainConfig` 拆开）。
 * 这一步是 `devdata` 用一次真机假问题换来的教训：绕过 schema 的假宿主会让「schema 给没写的字段
 * 造了个默认值」这类行为永远测不到。
 */

import { HOST_SERVICES } from '../index.js'

const noop = (): void => {}

/** 注册进假宿主的一个工具（`defineTool` 交给宿主的是编译后的 JSON Schema）。 */
export interface RegisteredTool {
  name: string
  description?: string
  parameters?: { properties?: Record<string, { description?: string } | undefined> }
  output?: { render: (args: unknown, value: unknown) => Array<{ type: string; text: string }> }
  execute?: (args: unknown) => Promise<unknown>
}

/** 注册进假宿主的一条 HTTP 路由。 */
export interface RegisteredRoute {
  kind?: string
  path: string
  handler: (req: unknown, res: unknown) => Promise<void> | void
}

/** 假宿主的构造参数（各包只填自己的那几项）。 */
export interface FakeHostOptions {
  /** settings 的 entry id（真宿主按包的 ns 派发）。 */
  ns: string
  /** 把普通对象过一遍**本包真实的** schema。 */
  parse: (raw: Record<string, unknown>) => unknown
  /** 取纯数据（settings 层交回去的就是它）。 */
  plain: (parsed: unknown) => Record<string, unknown>
  /** 挂载插件（`definePlugin` 交出来的 `apply`）。 */
  apply: (ctx: unknown, config: unknown) => void
  /** `settings` 服务可用？（默认 true） */
  settings?: boolean
  /** `webServer` 服务可用？（默认 false——只有需要数据面的插件要它） */
  webServer?: boolean
  /** `launchEnvironment` 服务可用？（默认 false——能力判定那种插件要它） */
  launchEnvironment?: boolean
  /** 别的插件的 entry（`readSettingsEntry` 那种「读别人配了什么」）。 */
  extraEntries?: Record<string, unknown>
}

/** 假宿主（对外形状是三包适配层的并集，谁都能只取自己用得到的那些）。 */
export function makeFakeHost(options: FakeHostOptions) {
  const settingsEnabled = options.settings !== false
  const webServerEnabled = options.webServer === true
  const launchEnvEnabled = options.launchEnvironment === true
  const listeners = new Map<string, Array<() => void>>()
  const cleanups: Array<() => void> = []
  const tools = new Map<string, RegisteredTool>()
  const routes = new Map<string, RegisteredRoute>()
  const stored: Record<string, unknown> = {}
  const logs: string[] = []
  /** 启动环境快照（能力判定源）：测试里就是这张可控的表。 */
  const envMap = new Map<string, string>()
  const counts = { registrations: 0, disposals: 0, sections: 0 }
  let entryReady = true

  const emit = (name: string): void => {
    for (const listener of listeners.get(name) ?? []) listener()
  }

  const toolsApi = {
    register(def: RegisteredTool): () => void {
      counts.registrations += 1
      tools.set(def.name, def)
      return () => {
        counts.disposals += 1
        if (tools.get(def.name) === def) tools.delete(def.name)
      }
    },
  }

  const systemPromptApi = {
    section(): () => void {
      counts.sections += 1
      return () => {
        counts.sections -= 1
      }
    },
  }

  const settingsApi = {
    /*
     * `describe()` 交回去的是**解析后**的值，而且**按 ns**：插件读别人的 entry 也走这里
     * （`kit` 的 `readSettingsEntry`）。所以 `extraEntries` 就是「另一个插件配了什么」。
     */
    describe: (): Array<{ ns: string; value: unknown }> => [
      { ns: options.ns, value: entryReady ? options.plain(options.parse(stored)) : undefined },
      ...Object.entries(options.extraEntries ?? {}).map(([ns, value]) => ({ ns, value })),
    ],
    update: async (ns: string, patch: Record<string, unknown>): Promise<void> => {
      if (ns !== options.ns) throw new Error(`未知的 entry: ${ns}`)
      Object.assign(stored, patch)
      emit('loader/volatile-update')
    },
    configure: () => noop,
  }

  const webServerApi = {
    register(route: RegisteredRoute): () => void {
      routes.set(route.path, route)
      return () => {
        routes.delete(route.path)
      }
    },
  }

  const launchEnv = {
    getFrom(env: string, layers: readonly string[]): { value?: string } | undefined {
      // `kit` 只在「启动层」里找；模拟里就是这张表。
      if (!layers.includes('process')) return undefined
      const value = envMap.get(env)
      return value === undefined ? undefined : { value }
    },
  }

  const makeCtx = (): Record<string, unknown> => ({
    logger: {
      info: (message: string) => logs.push(`info ${message}`),
      warn: (message: string) => logs.push(`warn ${message}`),
    },
    fiber: { entry: { options: { id: options.ns } } },
    get: (name: string) => {
      if (launchEnvEnabled && name === HOST_SERVICES.launchEnvironment) return launchEnv
      if (name === 'settings' && settingsEnabled) return settingsApi
      return undefined
    },
    on: (name: string, listener: () => void) => {
      const list = listeners.get(name) ?? []
      list.push(listener)
      listeners.set(name, list)
      return noop
    },
    effect: (fn: () => (() => void) | void) => {
      const dispose = fn()
      if (typeof dispose === 'function') cleanups.push(dispose)
    },
    inject: (deps: string[], cb: (child: unknown) => void) => {
      const child = makeCtx()
      if (deps.includes('tools')) child.tools = toolsApi
      if (deps.includes('systemPrompt')) child.systemPrompt = systemPromptApi
      if (deps.includes('settings') && settingsEnabled) child.settings = settingsApi
      if (deps.includes('webServer') && webServerEnabled) child.webServer = webServerApi
      cb(child)
    },
  })

  /** 调用一个工具（宿主走的就是 `execute` + `output.render`）。 */
  const callTool = async (name: string, args: Record<string, unknown>): Promise<string> => {
    const tool = tools.get(name)
    if (tool === undefined) throw new Error(`工具 ${name} 没有注册（已注册：${[...tools.keys()].join(' / ')}）`)
    const value = await (tool.execute as (a: unknown) => Promise<unknown>)(args)
    const blocks = tool.output?.render(args, value) ?? []
    return blocks.map((block) => block.text).join('\n')
  }

  return {
    tools,
    routes,
    counts,
    stored,
    loggerLines: () => [...logs],
    /**
     * 挂载插件（`apply` 由调用方给：`definePlugin` 交出来的那个函数）。
     *
     * `seed`（缺省 true）= 把这份配置也写进 settings 层——真宿主上「bundle 层给的那份」与
     * 「settings 解析出来的那份」在没有用户改动时是同一份，多数用例要的就是这个。
     * `seed: false` 则**只把它交给 `apply`**，settings 层保持原样——用来造「两层不同」的场景
     * （`devfront` 的 volatile 用例就靠它证「resolved 值才是权威」）。
     */
    mount: (config: Record<string, unknown>, mountOptions: { seed?: boolean } = {}) => {
      if (mountOptions.seed !== false) Object.assign(stored, config)
      options.apply(makeCtx(), options.parse(config))
    },
    /** 改一份配置（走真实的「先落值再广播」顺序）。 */
    update: (patch: Record<string, unknown>) => settingsApi.update(options.ns, patch),
    /** 让 `describe()` 交回 `undefined`（entry 尚未就绪那条分支）。 */
    notReady: () => {
      entryReady = false
    },
    /** 恢复「entry 已就绪」（配合 `notReady()` 测「未就绪 → 就绪」的转换）。 */
    ready: () => {
      entryReady = true
    },
    /**
     * 给某条能力授权（模拟「宿主是带着这个环境变量启动的」）。
     *
     * **必须在 `mount()` 之前调**：`kit` 的 `bindCapabilitySources` 会在 `apply` 期清掉采样缓存并
     * 绑定判定源，所以挂载后的采样才有效；反过来（挂载后再 grant）不会生效——而这正是真实语义
     * （授权只认**启动时**继承到的环境）。
     */
    grant: (env: string) => envMap.set(env, '1'),
    names: () => [...tools.keys()].sort(),
    /** settings 服务本体（用例偶尔要绕过 `update()` 直接驱动它，如「entry 未就绪」那条）。 */
    settings: settingsApi,
    /** 手动广播一个事件（`loader/volatile-update` 是全仓广播：别的插件改配置也会打到这里）。 */
    emit,
    call: callTool,
    /** 调用并**捕获**抛出的错误文本（拒绝路径是这套东西的常态，不是异常）。 */
    callError: async (name: string, args: Record<string, unknown>): Promise<string> => {
      try {
        return await callTool(name, args)
      } catch (error) {
        return error instanceof Error ? error.message : String(error)
      }
    },
    /** 收尾（挂载期的 disposer）。 */
    unmount: () => {
      for (const dispose of cleanups.splice(0)) dispose()
    },
    /** 读某个工具某个参数的**描述**（工具描述是 agent 唯一的说明书，值得钉）。 */
    descriptionOf: (name: string, param: string): string =>
      tools.get(name)?.parameters?.properties?.[param]?.description ?? '<未注册或无该参数>',
  }
}
