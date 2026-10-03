/**
 * 假宿主（测试夹具）：服务注入 + 事件广播 + settings 读写 + 工具登记。
 *
 * ## 为什么单独一个文件
 *
 * 两个消费者：宿主半体的端到端用例（`plugin.test.ts`）与**真机**用例
 * （`redis-real-machine.test.ts` 里那组「插件层真的打 248」）。两份复制会让「假宿主到底怎么理解
 * cordis 的注入/广播」出现两个版本——而被测代码正是照着这份理解写的。
 *
 * ## 它只做三件事的真
 *
 * 服务注入（`inject` 立刻回调子上下文）、事件广播（`on` + `effect` 立刻执行）、登记可撤销。
 * **顺序也是照真实层抄的**：settings 的 `update()` 先落值再广播 volatile 更新——插件在事件里重读
 * 才能拿到新值（`devfront` 记过这条：抄错顺序的用例验不到真正的那条链路）。
 */

import { HOST_SERVICES } from '@hyzyn/dsh-kit'

import { plainConfig } from '@hyzyn/dsh-kit'

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

/**
 * 把一份普通对象**经真实 schema 解析**（宿主交下来给 `apply` 的就是这个）。
 *
 * 这一步是**保真度**的关键，2026-10-02 补：先前假宿主直接把自己写的对象喂给 `apply`，于是
 * 「schema 会把没写的字段造出一个默认值」这类行为在用例里**永远测不到**——而真机上它当场
 * 报了两条假「配置问题」（维护者自己验出来的）。现在假宿主与真宿主走同一条路。
 */
export function resolveConfig(raw: Record<string, unknown>): Config {
  return Config(raw as never)
}

/** 同上一份，但**取纯数据**（settings 层交回去的是纯数据，见 `settingsEntryScope.get()`）。 */
export function resolvedPlain(raw: Record<string, unknown>): Record<string, unknown> {
  return plainConfig(resolveConfig(raw)) as unknown as Record<string, unknown>
}

/** 假宿主：服务注入 + 事件广播 + settings 读写（顺序照真实层：先落值再广播）。 */
export function makeHost(options: { settings?: boolean } = {}) {
  const settingsEnabled = options.settings !== false
  const listeners = new Map<string, Array<() => void>>()
  /** `effect(fn)` 必须**立刻调用** `fn`（真实 cordis 就是这样），否则订阅根本不会发生。 */
  const cleanups: Array<() => void> = []
  const tools = new Map<string, RegisteredTool>()
  const stored: Record<string, unknown> = {}
  const counts = { registrations: 0, disposals: 0, sections: 0 }
  const envMap = new Map<string, string>()
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
     * `describe()` 交回去的是**解析后**的值（真实 settings 层就是这样：schema 默认值 ← 组合 base
     * ← 用户层）。所以这里也要过 schema，否则「改配置 → 重算」那条路径测不到 schema 的行为。
     */
    describe: (): Array<{ ns: string; value: unknown }> => [
      { ns: 'devdata', value: entryReady ? resolvedPlain(stored) : undefined },
    ],
    update: async (ns: string, patch: Record<string, unknown>): Promise<void> => {
      if (ns !== 'devdata') throw new Error(`未知的 entry: ${ns}`)
      Object.assign(stored, patch)
      emit('loader/volatile-update')
    },
    configure: () => noop,
  }

  /** 启动环境快照（`kit` 的能力判定源）。测试里就是这张可控的表。 */
  const launchEnv = {
    getFrom(env: string, layers: readonly string[]): { value?: string } | undefined {
      if (!layers.includes('process')) return undefined
      const value = envMap.get(env)
      return value === undefined ? undefined : { value }
    },
  }

  const makeCtx = (): Record<string, unknown> => ({
    logger: { info: noop, warn: noop },
    fiber: { entry: { options: { id: 'devdata' } } },
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

  return {
    tools,
    counts,
    stored,
    settings: settingsApi,
    /**
     * 挂载插件（`apply` 就是 `definePlugin` 交出来的那个函数）。
     *
     * 初始配置同时**播种进假 settings**：真实 settings 层的 resolved 值是「schema 默认值 ←
     * 组合 base ← 用户层」，而组合 base 就是挂载时给的这份配置。不播种的话，「值没变的广播不该
     * 拆装工具」那条用例会因为假 store 里是空的而失真。
     */
    mount: (config: Record<string, unknown>) => {
      Object.assign(stored, config)
      /*
       * 交给 `apply` 的是**带 schema 包装**的那份（真宿主交下来的就是它，插件自己会
       * `plainConfig` 拆开）——这一步正是让「schema 的行为」进入用例的关键。
       */
      ;(apply as unknown as (ctx: unknown, config: unknown) => void)(makeCtx(), resolveConfig(stored))
    },
    /** 给某条能力授权（模拟「宿主是带着这个环境变量启动的」）。 */
    grant: (env: string) => envMap.set(env, '1'),
    /** 改一份配置（走真实的「先落值再广播」顺序）。 */
    update: async (patch: Record<string, unknown>) => settingsApi.update('devdata', patch),
    notReady: () => {
      entryReady = false
    },
    names: () => [...tools.keys()].sort(),
    call: async (name: string, args: Record<string, unknown>): Promise<string> => {
      const tool = tools.get(name)
      if (tool === undefined) throw new Error(`工具 ${name} 没有注册`)
      const value = await (tool.execute as (a: unknown) => Promise<unknown>)(args)
      const blocks = tool.output?.render(args, value) ?? []
      return blocks.map((block) => block.text).join('\n')
    },
    descriptionOf: (name: string, param: string): string =>
      tools.get(name)?.parameters?.properties?.[param]?.description ?? '<未注册或无该参数>',
  }
}

/** 用例统一用的「当前工作目录」（作用域判据的输入）。 */
export const CWD = '/w/project-a'

/** 一个合法的 Redis 目标配置（作用域是 `CWD`）。 */
export function redisTarget(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'redis-248',
    label: '248 Redis',
    engine: 'redis',
    env: 'test-shared',
    scopeDirs: [CWD],
    host: '127.0.0.1',
    port: 6379,
    ...overrides,
  }
}
