/**
 * 假宿主（测试夹具）：**四个注入面** + 事件广播 + settings 读写 + 工具登记 + 路由登记。
 *
 * 与 `devdata/test/fake-host.ts` / `devenv/test/fake-host.ts` **同构**（同一套对 cordis 的理解：
 * `inject` 立刻回调子上下文、`effect(fn)` 立刻执行、settings 的 `update()` **先落值再广播**
 * volatile 更新）。
 *
 * ## 为什么这份比那两份小得多（以及那笔债）
 *
 * 那两份要伺候能力判定（`launchEnvironment` / 启动环境快照 / grant）与「读别人 entry」，
 * 本包都不需要：它只用到 `tools` / `systemPrompt` / `settings` / `webServer` 四个注入面。
 * 所以这里是**按本包需要裁过的**，不是第二份全文拷贝。
 *
 * **但债是真的**：那两份夹具的文件头都写着「若出现第三个消费者，判据就变了——那时按 §16.1 的同一套
 * 判据上收进 `kit`（共享的是机制）」。本包正是第三个消费者。上收之所以**没在本轮做**：`devenv` 的
 * 测试夹具此刻正被另一份并发工作改着（2026-10-03），现在动它会撞车。这笔债记在 ROADMAP 待办 6b。
 *
 * ## 保真度：配置走**真实 schema**
 *
 * `mount()` 把配置过一遍本包真实的 `Config` schema（真宿主交下来的就是它），再交给 `apply`。
 * 绕过 schema 的假宿主会让「schema 给没写的字段造了个默认值」这类行为永远测不到
 * （`devdata` 用一次真机假问题换来的教训）。
 */

import { plainConfig } from '@hyzyn/dsh-kit'

import { Config, apply } from '../src/index.js'

const noop = (): void => {}

/** 注册进假宿主的一个工具（`defineTool` 交给宿主的是编译后的 JSON Schema）。 */
export interface RegisteredTool {
  name: string
  description?: string
  parameters?: { properties?: Record<string, unknown> }
  output?: { render: (args: unknown, value: unknown) => Array<{ type: string; text: string }> }
  execute?: (args: unknown) => Promise<unknown>
}

/** 注册进假宿主的一条路由。 */
export interface RegisteredRoute {
  kind?: string
  path: string
  handler: (req: unknown, res: unknown) => Promise<void> | void
}

/** 假宿主。 */
export function makeHost(options: { settings?: boolean; webServer?: boolean } = {}) {
  const settingsEnabled = options.settings !== false
  const webServerEnabled = options.webServer !== false
  const listeners = new Map<string, Array<() => void>>()
  const cleanups: Array<() => void> = []
  const tools = new Map<string, RegisteredTool>()
  const routes = new Map<string, RegisteredRoute>()
  const stored: Record<string, unknown> = {}
  const logs: string[] = []
  const counts = { registrations: 0, disposals: 0, sections: 0 }

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
    /** 交回去的是**解析后**的值（真宿主就是这么给的，插件自己会 `plainConfig` 拆开）。 */
    describe: (): Array<{ ns: string; value: unknown }> => [
      { ns: 'devfront', value: plainConfig(Config(stored as never)) },
    ],
    update: async (ns: string, patch: Record<string, unknown>): Promise<void> => {
      if (ns !== 'devfront') throw new Error(`未知的 entry: ${ns}`)
      Object.assign(stored, patch)
      emit('loader/volatile-update')
    },
  }

  const webServerApi = {
    register(route: RegisteredRoute): () => void {
      routes.set(route.path, route)
      return () => {
        routes.delete(route.path)
      }
    },
  }

  const makeCtx = (): Record<string, unknown> => ({
    logger: {
      info: (message: string) => logs.push(`info ${message}`),
      warn: (message: string) => logs.push(`warn ${message}`),
    },
    fiber: { entry: { options: { id: 'devfront' } } },
    get: (name: string) => (name === 'settings' && settingsEnabled ? settingsApi : undefined),
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
    stored,
    counts,
    loggerLines: () => [...logs],
    /** 挂载插件（`apply` 就是 `definePlugin` 交出来的那个函数）。 */
    mount: (config: Record<string, unknown>) => {
      Object.assign(stored, config)
      ;(apply as unknown as (ctx: unknown, config: unknown) => void)(makeCtx(), Config(stored as never))
    },
    update: (patch: Record<string, unknown>) => settingsApi.update('devfront', patch),
    names: () => [...tools.keys()].sort(),
    call: callTool,
    /** 调用并**捕获**抛出的错误文本（拒绝路径是这套东西的常态，不是异常）。 */
    callError: async (name: string, args: Record<string, unknown>): Promise<string> => {
      try {
        await callTool(name, args)
      } catch (error) {
        return error instanceof Error ? error.message : String(error)
      }
      throw new Error('预期会抛错，但没有：' + name)
    },
    /** 收尾（挂载期的 disposer，供「卸载不留东西」那类断言用）。 */
    unmount: () => {
      for (const dispose of cleanups.splice(0)) dispose()
    },
  }
}
