/**
 * `@hyzyn/dsh-kit/testing` —— 共享假宿主自己的用例。
 *
 * 它现在是**三个包**（`devdata` / `devenv` / `devfront`）的公共夹具：坏在这里，三包的用例会一起
 * 变得不可信。所以这一份钉的是**机制**本身，而不是任何插件的业务：
 *
 *   1. `inject` 立刻回调子上下文、`effect(fn)` 立刻执行、disposer 收在 `unmount()` 里；
 *   2. settings 的 `update()` **先落值再广播**（这是本仓几处 volatile 契约成立的前提）；
 *   3. `mount(config)` 的交接口径：`seed` 缺省写进 settings 层，`seed: false` 只交给 `apply`
 *      ——「bundle 层给的那份」与「settings 解析出来的那份」可以不同，这正是 devfront 那条
 *      「resolved 值才是权威」要造的场景；
 *   4. `notReady()` / `ready()`、`grant()`（启动环境那套能力判定源）、`webServer` 开关、
 *      `descriptionOf`、`call` / `callError` 的错误文案。
 */
import { HOST_SERVICES } from '../src/index.js'
import { makeFakeHost } from '../src/testing/fake-host.js'

import { describe, expect, it } from 'vitest'

interface ToyState {
  sections: number
  broadcasts: string[]
  launch: string
}

/** 一个玩具插件：用满夹具的每个面，好让机制被真的走一遍。 */
function toy() {
  const state: ToyState = { sections: 0, broadcasts: [], launch: '' }
  const parse = (raw: Record<string, unknown>) => ({
    enabled: raw.enabled !== false,
    targets: Array.isArray(raw.targets) ? raw.targets : [],
  })
  const plain = (parsed: unknown) => parsed as Record<string, unknown>
  const apply = (ctx: unknown, config: unknown): void => {
    const c = ctx as {
      get: (name: string) => unknown
      inject: (deps: string[], cb: (child: Record<string, unknown>) => void) => void
      effect: (fn: () => () => void) => void
    }
    const launchEnv = c.get(HOST_SERVICES.launchEnvironment) as
      | { getFrom: (env: string, layers: readonly string[]) => { value?: string } | undefined }
      | undefined
    state.launch = launchEnv?.getFrom('TOY_GRANT', ['process'])?.value ?? ''
    c.inject(['tools'], (child) => {
      const tools = child.tools as { register: (def: unknown) => () => void }
      c.effect(() => {
        const off = tools.register({
          name: 'toy',
          parameters: { properties: { a: { description: 'A 参数' } } },
          execute: async (args: unknown) => ({ got: args, config }),
          output: { render: (_args: unknown, value: unknown) => [{ type: 'text', text: JSON.stringify(value) }] },
        })
        state.sections += 1
        return () => {
          state.sections -= 1
          off()
        }
      })
    })
    c.inject(['webServer'], (child) => {
      const webServer = child.webServer as { register: (route: unknown) => () => void } | undefined
      if (webServer === undefined) return
      c.effect(() => webServer.register({ path: '/api/toy', handler: () => {} }))
    })
    c.inject(['settings'], (child) => {
      const settings = child.settings as { describe: () => Array<{ ns: string; value: unknown }> } | undefined
      if (settings === undefined) return
      const snapshot = (): void => {
        state.broadcasts.push(JSON.stringify(settings.describe()[0]?.value))
      }
      snapshot()
      // 订阅广播：`update()` 的语义是**先落值再广播**——所以监听者读到的必须是**新**值
      ;(ctx as { on: (name: string, listener: () => void) => void }).on('loader/volatile-update', snapshot)
    })
  }
  return { state, parse, plain, apply }
}

const mount = (options: Record<string, unknown> = {}) => {
  const t = toy()
  const host = makeFakeHost({
    ns: 'toy',
    parse: t.parse,
    plain: t.plain,
    apply: t.apply as unknown as (ctx: unknown, config: unknown) => void,
    ...options,
  })
  return { host, state: t.state }
}

describe('共享假宿主：机制', () => {
  it('`inject` 立刻回调、`call` 走 execute + output.render', async () => {
    const { host } = mount()
    host.mount({ targets: [{ id: 'a' }] })
    expect(host.names()).toEqual(['toy'])
    expect(await host.call('toy', { x: 1 })).toContain('"got":{"x":1}')
  })

  it('没注册的工具：`call` 抛错、`callError` 把文案交回来（拒绝路径是常态）', async () => {
    const { host } = mount()
    host.mount({})
    await expect(host.call('nope', {})).rejects.toThrow('没有注册')
    expect(await host.callError('nope', {})).toContain('已注册：toy')
  })

  it('settings 的 `update()` **先落值再广播**', async () => {
    const { host, state } = mount()
    host.mount({})
    expect(state.broadcasts).toEqual(['{"enabled":true,"targets":[]}'])
    await host.update({ targets: [{ id: 'b' }] })
    expect(state.broadcasts.at(-1)).toContain('"id":"b"')
  })

  it('`mount(config)` 缺省把配置也写进 settings 层；`seed: false` 只交给 `apply`', () => {
    const seeded = mount()
    seeded.host.mount({ targets: [{ id: 'from-config' }] })
    expect(seeded.host.stored.targets).toEqual([{ id: 'from-config' }])
    expect(seeded.host.settings.describe()[0]?.value).toEqual({ enabled: true, targets: [{ id: 'from-config' }] })

    const unseeded = mount()
    unseeded.host.stored.targets = [{ id: 'from-settings' }]
    unseeded.host.mount({ targets: [{ id: 'from-config' }] }, { seed: false })
    // apply 拿到的是 config 那份；settings 层还是原样 —— 「两层不同」这个场景就是靠它造的
    expect(unseeded.host.stored.targets).toEqual([{ id: 'from-settings' }])
  })

  it('`notReady()` → `describe()` 的 value 是 `undefined`；`ready()` 恢复', () => {
    const { host } = mount()
    host.mount({ targets: [{ id: 'a' }] })
    host.notReady()
    expect(host.settings.describe()[0]?.value).toBeUndefined()
    host.ready()
    expect(host.settings.describe()[0]?.value).toEqual({ enabled: true, targets: [{ id: 'a' }] })
  })

  it('`grant()` 只在**挂载前**给的环境里可见（能力判定只认启动层）', () => {
    const before = mount({ launchEnvironment: true })
    before.host.grant('TOY_GRANT')
    before.host.mount({})
    expect(before.state.launch).toBe('1')

    const after = mount({ launchEnvironment: true })
    after.host.mount({})
    after.host.grant('TOY_GRANT')
    expect(after.state.launch).toBe('')
  })

  it('`launchEnvironment` 缺省不给：插件读到的就是「没有这个服务」', () => {
    const { host, state } = mount()
    host.mount({})
    expect(state.launch).toBe('')
  })

  it('`webServer` 缺省不给（另两包不需要它）：子上下文里没有 `webServer`，路由自然一条都没登记', () => {
    const { host } = mount()
    host.mount({})
    expect([...host.routes.keys()]).toEqual([])

    const withServer = mount({ webServer: true })
    withServer.host.mount({})
    expect([...withServer.host.routes.keys()]).toEqual(['/api/toy'])
  })

  it('`descriptionOf` 读参数描述（工具描述是 agent 唯一的说明书）', () => {
    const { host } = mount()
    host.mount({})
    expect(host.descriptionOf('toy', 'a')).toBe('A 参数')
    expect(host.descriptionOf('toy', 'nope')).toBe('<未注册或无该参数>')
    expect(host.descriptionOf('nope', 'a')).toBe('<未注册或无该参数>')
  })

  it('`unmount()` 把挂载期登记的 disposer 都跑一遍（工具与路由都不留）', () => {
    const { host, state } = mount({ webServer: true })
    host.mount({})
    expect(state.sections).toBe(1)
    expect(host.counts.registrations).toBe(1)
    host.unmount()
    expect(host.names()).toEqual([])
    expect([...host.routes.keys()]).toEqual([])
    expect(state.sections).toBe(0)
    expect(host.counts.disposals).toBe(1)
  })

  it('`extraEntries` → `describe()` 里能看到别的插件的 entry', () => {
    const { host } = mount({ extraEntries: { 'other-plugin': { hello: 1 } } })
    host.mount({})
    expect(host.settings.describe()).toContainEqual({ ns: 'other-plugin', value: { hello: 1 } })
  })

  it('`settings: false` → 没有 settings 服务（config-only 兜底那条路）', () => {
    const { host } = mount({ settings: false })
    host.mount({})
    expect(host.names()).toEqual(['toy'])
  })

  it('未知 ns 的写入被拒（真宿主按包的 ns 派发，写错 entry 不该静默成功）', async () => {
    const { host } = mount()
    host.mount({})
    await expect(host.settings.update('other', {})).rejects.toThrow('未知的 entry')
  })
})
