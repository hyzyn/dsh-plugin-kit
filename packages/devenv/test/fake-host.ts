/**
 * 假宿主（测试夹具）：**机制在 `@hyzyn/dsh-kit/testing`，这里只留本包自己的那几行**。
 *
 * 2026-10-03 上收：本文件与 `devdata` 那份同源（连注释都同构），两份的文件头都写着「若出现第三个
 * 消费者，判据就变了——那时按 §16.1 上收进 `kit`（共享的是机制）」。第三个消费者（`devfront`）
 * 出现后，机制搬进 [`kit/src/testing/fake-host.ts`](../../../packages/kit/src/testing/fake-host.ts)，这里只留：
 *
 *   - 本包**真实的** `Config` schema（保真度：`mount()` 把配置过一遍它——`devdata` 用一次真机假
 *     问题换来这条：绕过 schema 的假宿主会让「schema 造默认值」这类行为永远测不到）；
 *   - `apply`；
 *   - 本包用到的服务开关：`settings`、**`launchEnvironment`**（能力判定）与 `extraEntries`
 *     （本包读 `tty` 的连接簿：`kit` 的 `readSettingsEntry` 走 `describe()`）。
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
export function makeHost(options: { settings?: boolean; extraEntries?: Record<string, unknown> } = {}) {
  return makeFakeHost({
    ns: 'devenv',
    parse: (raw) => resolveConfig(raw),
    plain: (parsed) => plainConfig(parsed as Config) as unknown as Record<string, unknown>,
    apply: apply as unknown as (ctx: unknown, config: unknown) => void,
    settings: options.settings,
    launchEnvironment: true,
    ...(options.extraEntries === undefined ? {} : { extraEntries: options.extraEntries }),
  })
}
