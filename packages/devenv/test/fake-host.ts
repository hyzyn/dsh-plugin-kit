/**
 * 假宿主（测试夹具）：服务注入 + 事件广播 + settings 读写 + 工具登记。
 *
 * 与 `devdata/test/fake-host.ts` **同构**（同一套对 cordis 的理解：`inject` 立刻回调子上下文、
 * `effect(fn)` 立刻执行、settings 的 `update()` **先落值再广播** volatile 更新）。
 *
 * ## 为什么不复用 `devdata` 那一份
 *
 * 它是测试夹具，不是产物：跨包 import 会让两个包的**测试**互相耦合（改一个夹具要同时跑两个包的
 * 用例，而夹具的消费者只有各自的被测代码）。本仓已有的做法是夹具跟着包走（`fake-redis.ts` /
 * `fake-host.ts` 都在各自包内）。**若出现第三个消费者，判据就变了**——那时按 §16.1 的同一套
 * 判据上收进 `kit`（共享的是机制），而不是再抄一份。
 *
 * ## 保真度：配置走**真实 schema**
 *
 * `resolveConfig` 把配置过一遍本包真实的 `Config` schema（真宿主交下来的就是它，插件自己会
 * `plainConfig` 拆开）。这一步是 `devdata` 用一次真机假问题换来的教训：绕过 schema 的假宿主会让
 * 「schema 给没写的字段造了个默认值」这类行为永远测不到。
 */
import { HOST_SERVICES, plainConfig } from '@hyzyn/dsh-kit'

import { Config, apply } from '../src/index.js'

const noop = (): void => {}

/** 注册进假宿主的一个工具（`defineTool` 交给宿主的是编译后的 JSON Schema）。 */
export interface RegisteredTool {
  name: string
  description?: string
  parameters?: { properties?: Record<string, { description?: string } | undefined> }
  output?: { render: (args: unknown, value: unknown) => Array<{ type: string; text: string }> }
  execute?: (args: unknown) => Promise<unknown>
}

/** 把一份普通对象**经真实 schema 解析**。 */
export function resolveConfig(raw: Record<string, unknown>): Config {
  return Config(raw as never)
}

/** 同上一份，但取纯数据（settings 层交回去的是纯数据）。 */
export function resolvedPlain(raw: Record<string, unknown>): Record<string, unknown> {
  return plainConfig(resolveConfig(raw)) as unknown as Record<string, unknown>
}

/** 假宿主。 */
export function makeHost(options: { settings?: boolean; extraEntries?: Record<string, unknown> } = {}) {
  const settingsEnabled = options.settings !== false
  const listeners = new Map<string, Array<() => void>>()
  const cleanups: Array<() => void> = []
  const tools = new Map<string, RegisteredTool>()
  const stored: Record<string, unknown> = {}
  const logs: string[] = []
  /** 启动环境快照（`kit` 的能力判定源）：测试里就是这张可控的表。 */
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
     * `describe()` 交回去的是**解析后**的值，而且**按 ns**：本插件读别人的 entry（tty 的连接簿）
     * 也走这里（`kit` 的 `readSettingsEntry`）。所以 `extraEntries` 就是「另一个插件配了什么」。
     */
    describe: (): Array<{ ns: string; value: unknown }> => [
      { ns: 'devenv', value: entryReady ? resolvedPlain(stored) : undefined },
      ...Object.entries(options.extraEntries ?? {}).map(([ns, value]) => ({ ns, value })),
    ],
    update: async (ns: string, patch: Record<string, unknown>): Promise<void> => {
      if (ns !== 'devenv') throw new Error(`未知的 entry: ${ns}`)
      Object.assign(stored, patch)
      emit('loader/volatile-update')
    },
    configure: () => noop,
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
    logger: { info: (message: string) => logs.push(`info ${message}`), warn: (message: string) => logs.push(`warn ${message}`) },
    fiber: { entry: { options: { id: 'devenv' } } },
    get: (name: string) => {
      if (name === HOST_SERVICES.launchEnvironment) return launchEnv
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
      cb(child)
    },
  })

  /** 调用一个工具（`defineTool` 交出来的定义，宿主走的就是 `execute` + `output.render`）。 */
  const callTool = async (name: string, args: Record<string, unknown>): Promise<string> => {
    const tool = tools.get(name)
    if (tool === undefined) throw new Error(`工具 ${name} 没有注册`)
    const value = await (tool.execute as (a: unknown) => Promise<unknown>)(args)
    const blocks = tool.output?.render(args, value) ?? []
    return blocks.map((block) => block.text).join('\n')
  }

  return {
    tools,
    counts,
    stored,
    loggerLines: () => [...logs],
    /** 挂载插件（`apply` 就是 `definePlugin` 交出来的那个函数）。 */
    mount: (config: Record<string, unknown>) => {
      Object.assign(stored, config)
      ;(apply as unknown as (ctx: unknown, config: unknown) => void)(makeCtx(), resolveConfig(stored))
    },
    /** 改一份配置（走真实的「先落值再广播」顺序）。 */
    update: async (patch: Record<string, unknown>) => settingsApi.update('devenv', patch),
    notReady: () => {
      entryReady = false
    },
    /**
     * 给某条能力授权（模拟「宿主是带着这个环境变量启动的」）。
     *
     * **必须在 `mount()` 之前调**：`kit` 的 `bindCapabilitySources` 会在 `apply` 期清掉采样缓存并
     * 绑定判定源，所以挂载后的采样才有效；反过来（挂载后再 grant）不会生效，而这正是真实语义
     * ——授权只认**启动时**继承到的环境。
     */
    grant: (env: string) => envMap.set(env, '1'),
    names: () => [...tools.keys()].sort(),
    call: callTool,
    /** 调用并**捕获**抛出的错误文本（拒绝路径是这套东西的常态，不是异常）。 */
    callError: async (name: string, args: Record<string, unknown>): Promise<string> => {
      try {
        return await callTool(name, args)
      } catch (error) {
        return error instanceof Error ? error.message : String(error)
      }
    },
    unmount: () => {
      for (const dispose of cleanups.splice(0)) dispose()
    },
    descriptionOf: (name: string, param: string): string =>
      tools.get(name)?.parameters?.properties?.[param]?.description ?? '<未注册或无该参数>',
  }
}
