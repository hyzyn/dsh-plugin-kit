/**
 * 假宿主（测试夹具）：**机制在 `@hyzyn/dsh-kit/testing`，这里只留本包自己的那几行 + 本包的数据**。
 *
 * 2026-10-03 上收：本文件与 `devenv` 那份同源，两份的文件头都写着「若出现第三个消费者，判据就变了
 * ——那时按 §16.1 上收进 `kit`（共享的是机制）」。第三个消费者（`devfront`）出现后，机制搬进
 * [`kit/src/testing/fake-host.ts`](../../../packages/kit/src/testing/fake-host.ts)，这里只留：
 *
 *   - 本包**真实的** `Config` schema（保真度：`mount()` 把配置过一遍它，假宿主才不会让
 *     「schema 给没写的字段造了个默认值」这类行为永远测不到——这条是当年一次真机假问题换来的）；
 *   - `apply`；
 *   - 本包用到的服务开关：`settings` 与 **`launchEnvironment`**（能力判定要它）。
 */

import { plainConfig } from '@hyzyn/dsh-kit'
import { makeFakeHost, type RegisteredTool } from '@hyzyn/dsh-kit/testing'

import { Config, apply } from '../src/index.js'

export type { RegisteredTool }

/** 把一份普通对象**经真实 schema 解析**。 */
export function resolveConfig(raw: Record<string, unknown>): Config {
  return Config(raw as never)
}

/** 同上一份，但取纯数据（settings 层交回去的是纯数据）。 */
export function resolvedPlain(raw: Record<string, unknown>): Record<string, unknown> {
  return plainConfig(resolveConfig(raw)) as unknown as Record<string, unknown>
}

/** 假宿主。 */
export function makeHost(options: { settings?: boolean } = {}) {
  return makeFakeHost({
    ns: 'devdata',
    parse: (raw) => resolveConfig(raw),
    plain: (parsed) => plainConfig(parsed as Config) as unknown as Record<string, unknown>,
    apply: apply as unknown as (ctx: unknown, config: unknown) => void,
    settings: options.settings,
    launchEnvironment: true,
  })
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
