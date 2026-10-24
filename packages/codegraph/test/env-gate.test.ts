/**
 * `src/env-gate.ts` 的用例 —— 「等 env 的同步预注入就绪」。
 *
 * ## 为什么要这组用例
 *
 * 这道门守的是一条**时序不变式**：codegraph 的 per-agent 挂载要在 env 把值写进
 * `process.env` 之后才 spawn MCP 子进程（子进程继承宿主 `scrubbedParentEnv()`，per-agent
 * 不传 `config.env`）。它有两种失效方向，都必须钉住：
 *
 *   - **等太死**：宿主没装 env（`desktop` 这类 profile）时也去 `ctx.inject` 等一个永远不出现的
 *     服务 → per-agent 挂载永久挂起（功能静默消失）；
 *   - **等太松**：装了 env 却不等 → 子进程少掉它注入的普通环境变量（**不是**认证头：
 *     per-agent 走 stdio、config 里没有 `headers`；凭据形状的变量由宿主 scrub 挡住）。
 *
 * 反例全部用 fake ctx 造（不碰真实宿主）；`run` 用调用计数与执行顺序断言。
 * 真机实测（2026-10-24）在真宿主上**没复现出**这条窗口，所以这里是机制钉守而非回归复现
 * ——边界写在 `src/env-gate.ts` 文件头。
 */
import { describe, expect, it } from 'vitest'

import {
  ENV_ENTRY_ID,
  ENV_PLUGIN_NAME,
  ENV_READY_SERVICE,
  envPluginMounted,
  whenEnvReady,
} from '../src/env-gate.js'

interface FakeOptions {
  /** `ctx.get(name)` 的返回值。 */
  services?: Record<string, unknown>
  /** 让 `ctx.get` 抛错。 */
  getThrows?: boolean
  /** 省略 `inject` 方法（模拟非 cordis 宿主 / 已被释放的 fiber）。 */
  noInject?: boolean
  /** 让 `ctx.inject` 抛错。 */
  injectThrows?: boolean
}

/** 造一个只实现 get / inject 的 ctx；返回注入回调的句柄，供用例手动触发。 */
function fakeCtx(options: FakeOptions = {}) {
  const subscriptions: Array<() => void> = []
  const ctx: Record<string, unknown> = {
    get(name: string) {
      if (options.getThrows === true) throw new Error('boom')
      return options.services?.[name]
    },
  }
  if (options.noInject !== true) {
    ctx.inject = (names: string[], callback: () => void) => {
      if (options.injectThrows === true) throw new Error('inject boom')
      expect(names).toEqual([ENV_READY_SERVICE])
      subscriptions.push(callback)
      return {}
    }
  }
  return { ctx, subscriptions }
}

/** 一个「装了 env」的 loader 形状。 */
function loaderWith(entry: { options: Record<string, unknown> }) {
  return { entries: () => [entry] }
}

describe('envPluginMounted：只回答「宿主装没装 env」', () => {
  it('按包名或条目 id 命中都算装了', () => {
    expect(envPluginMounted(fakeCtx({ services: { loader: loaderWith({ options: { name: ENV_PLUGIN_NAME } }) } }).ctx)).toBe(true)
    expect(envPluginMounted(fakeCtx({ services: { loader: loaderWith({ options: { id: ENV_ENTRY_ID } }) } }).ctx)).toBe(true)
  })

  it('loader 层显式禁用的行不算（它永远不会 apply，等它等于挂死）', () => {
    const ctx = fakeCtx({ services: { loader: loaderWith({ options: { name: ENV_PLUGIN_NAME, disabled: true } }) } }).ctx
    expect(envPluginMounted(ctx)).toBe(false)
  })

  it('取不到 loader / 形状不符 / 读取抛错 → 一律按「没装」处理（退化为改动前行为）', () => {
    expect(envPluginMounted(fakeCtx().ctx)).toBe(false)
    expect(envPluginMounted(fakeCtx({ services: { loader: {} } }).ctx)).toBe(false)
    expect(envPluginMounted(fakeCtx({ services: { loader: { entries: () => [] } } }).ctx)).toBe(false)
    expect(envPluginMounted(fakeCtx({ getThrows: true }).ctx)).toBe(false)
  })
})

describe('whenEnvReady：就绪即跑、缺席即跑、装了才等', () => {
  it('服务已就绪 → 同步立即执行', () => {
    const { ctx } = fakeCtx({ services: { [ENV_READY_SERVICE]: { enabled: true, keys: [], at: 1 } } })
    let runs = 0
    whenEnvReady(ctx as never, () => { runs += 1 })
    expect(runs).toBe(1)
  })

  it('宿主没装 env → 同步立即执行（不能等一个永不出现的服务）', () => {
    const { ctx, subscriptions } = fakeCtx({ services: { loader: { entries: () => [] } } })
    let runs = 0
    whenEnvReady(ctx as never, () => { runs += 1 })
    expect(runs).toBe(1)
    expect(subscriptions, '不该订阅').toHaveLength(0)
  })

  it('装了但未就绪 → 订阅，服务出现时执行一次（重复触发不重复跑）', () => {
    const { ctx, subscriptions } = fakeCtx({
      services: { loader: loaderWith({ options: { name: ENV_PLUGIN_NAME } }) },
    })
    let runs = 0
    whenEnvReady(ctx as never, () => { runs += 1 })
    expect(runs).toBe(0)
    expect(subscriptions).toHaveLength(1)
    subscriptions[0]()
    expect(runs).toBe(1)
    subscriptions[0]()
    expect(runs, '服务 epoch 变化可能重入，run 必须幂等').toBe(1)
  })

  it('env 被 loader 禁用 → 不订阅，立即执行', () => {
    const { ctx, subscriptions } = fakeCtx({
      services: { loader: loaderWith({ options: { name: ENV_PLUGIN_NAME, disabled: true } }) },
    })
    let runs = 0
    whenEnvReady(ctx as never, () => { runs += 1 })
    expect(runs).toBe(1)
    expect(subscriptions).toHaveLength(0)
  })

  it('读服务抛错 / 没有 inject / inject 抛错 → 都退化为立即执行，不把功能挂死', () => {
    let runs = 0
    whenEnvReady(fakeCtx({ getThrows: true }).ctx as never, () => { runs += 1 })

    const noInject = fakeCtx({ noInject: true, services: { loader: loaderWith({ options: { name: ENV_PLUGIN_NAME } }) } })
    whenEnvReady(noInject.ctx as never, () => { runs += 1 })

    const injectThrows = fakeCtx({ injectThrows: true, services: { loader: loaderWith({ options: { name: ENV_PLUGIN_NAME } }) } })
    whenEnvReady(injectThrows.ctx as never, () => { runs += 1 })

    expect(runs).toBe(3)
  })
})
