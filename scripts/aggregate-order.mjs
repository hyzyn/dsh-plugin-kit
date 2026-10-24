/**
 * 聚合层的**挂载顺序**（纯函数；`scripts/aggregate.mjs` 与用例共用）。
 *
 * ## 为什么顺序需要一条显式规则
 *
 * 生成器原先是纯字母序（`readdirSync().sort()`），于是 `@hyzyn/dsh-env` 排在
 * `@hyzyn/dsh-codegraph` 之后。插件按 patch 的行序挂载，而 **env 的启动期同步预注入**
 * （`apply()` 里把 `$DSH_HOME/.credentials.yaml` 的 refs 写进 `process.env`）必须在任何
 * 依赖 `process.env` 的插件之前完成。最直接的一类是**在托管行里写 `!!js process.env.X`
 * 认证头**的 MCP 条目：env 晚到，头部就求值成 `Basic base64("undefined:undefined")`，
 * 服务器回 401，而界面上一片绿（症状正是「卡片说已配置、MCP 却 401」）。
 *
 * codegraph 的 per-agent 模式是**另一种**：它不写 headers（stdio），只是 spawn 出来的 MCP
 * 子进程要继承到 env 注入的普通变量。真机复核（2026-10-24）表明那条窗口实际很窄——挂载
 * 自身有 `loadClient()` 动态 import + spawn 的异步跨度，env 几乎总在这段里就装完了；它还
 * 另外用 `dshEnvReady` 服务表达先后（见 `packages/codegraph/src/env-gate.ts`），不靠这里的行序。
 *
 * 规则只有一句：**`MOUNT_PRIORITY` 里的包按清单顺序排最前，其余保持字母序**。
 * 清单里写了一个不存在的包名时，生成器会**报错停下**——否则顺序会悄悄退回字母序，
 * 而没有任何东西会红（本仓最忌讳的「恒绿闸门」）。
 *
 * ## 它保证什么、不保证什么（2026-10-23 复核）
 *
 * **保证**：`@hyzyn/dsh-all` / 仓库根 bundle 的配置里，env 是第一个插件行（用例钉住）。
 *
 * **不保证运行时 apply 顺序**：加载器对同一组条目是**并发创建**的——`EntryGroup.update()`
 * 先按配置顺序建 Map，再用 `Promise.all(ids.map(create))` 并发 `await entry.update()`，
 * 每个 `_init()` 里还要 `await import(插件模块)`（见 `@deepseek-ai/cordis-plugin-loader`
 * 的 `lib/index.js`）。cordis 只在注入依赖齐了之后才同步执行 apply（`Feature` 构造器里的
 * `_refresh()`），所以「谁先 apply」由**模块 import 完成顺序 + 依赖就绪**决定，配置行序
 * 只是让环境更有利，不是契约。
 *
 * 当前真正的防线是 env 自己：`inject: []` + `apply()` **开头**同步写 `process.env`，
 * 因此只要它的模块被 import 完，值就位；但在 apply 期同步读 `process.env.DSH_*` 的插件
 * （docker / tty / rss / prompt / search）与 codegraph 的 per-agent 挂载（走
 * `ctx.inject(['agents'])`，晚于 apply）并不都受这条顺序保护。要**硬保证**得改成服务门：
 * env 在 apply 里 `ctx.provide('envReady')`，消费者 `ctx.inject(['envReady'], …)` 后再求值。
 *
 * 只读纯函数：输入是 `{ dir, name }` 列表，输出新数组；不碰文件系统。
 */

/** 必须在其它插件之前挂载的包（按数组顺序）。目前只有 env：理由见文件头。 */
export const MOUNT_PRIORITY = ['@hyzyn/dsh-env']

/**
 * 按「优先级清单 → 其余字母序」重排插件。
 *
 * @param plugins - `{ dir: string, name: string, ... }[]`（`dir` 用于同优先级内的字母序）
 * @param priority - 包名数组（默认 `MOUNT_PRIORITY`）
 * @returns 新数组；清单外的包按 `dir` 的字母序排在清单之后
 */
export function orderPlugins(plugins, priority = MOUNT_PRIORITY) {
  const rank = new Map(priority.map((name, index) => [name, index]))
  return [...plugins].sort((left, right) => {
    const leftRank = rank.get(left.name) ?? priority.length
    const rightRank = rank.get(right.name) ?? priority.length
    if (leftRank !== rightRank) return leftRank - rightRank
    return left.dir.localeCompare(right.dir)
  })
}

/**
 * 校验优先级清单里的每一项都真的对应一个插件。
 *
 * @returns 缺失的包名（空数组 = 全部命中）。生成器看到非空就中止，不静默生成。
 */
export function missingPriority(plugins, priority = MOUNT_PRIORITY) {
  const names = new Set(plugins.map((plugin) => plugin.name))
  return priority.filter((name) => !names.has(name))
}
