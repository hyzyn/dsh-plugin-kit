/**
 * 假宿主（测试夹具）：**机制在 `@hyzyn/dsh-kit/testing`，这里只留本包自己的那几行**。
 *
 * 2026-10-03 上收：`devdata` / `devenv` 两份夹具的文件头都写着同一条判据——「夹具是测试脚手架，
 * 跨包 import 会让两个包的测试互相耦合；**若出现第三个消费者，判据就变了**，那时按 §16.1 上收进
 * `kit`（共享的是机制）」。本包（`devfront`）正是第三个消费者，于是机制搬进
 * [`kit/src/testing/fake-host.ts`](../../../packages/kit/src/testing/fake-host.ts)，这里只留：
 *
 *   - 本包**真实的** `Config` schema（保真度：`mount()` 把配置过一遍它，假宿主才不会让
 *     「schema 给没写的字段造了个默认值」这类行为永远测不到）；
 *   - `apply`（`definePlugin` 交出来的那个函数）；
 *   - 本包用到的服务开关：`settings` 与 **`webServer`**（数据面那条路由要它；另两包不需要）。
 */

import { makeFakeHost, type RegisteredRoute, type RegisteredTool } from '@hyzyn/dsh-kit/testing'
import { plainConfig } from '@hyzyn/dsh-kit'

import { Config, apply } from '../src/index.js'

export type { RegisteredRoute, RegisteredTool }

/** 把一份普通对象**经真实 schema 解析**。 */
export function resolveConfig(raw: Record<string, unknown>): Config {
  return Config(raw as never)
}

/** 假宿主。 */
export function makeHost(options: { settings?: boolean; webServer?: boolean } = {}) {
  return makeFakeHost({
    ns: 'devfront',
    parse: (raw) => resolveConfig(raw),
    plain: (parsed) => plainConfig(parsed as Config) as unknown as Record<string, unknown>,
    apply: apply as unknown as (ctx: unknown, config: unknown) => void,
    settings: options.settings,
    webServer: options.webServer !== false,
  })
}
