/**
 * 跨进程 / 跨包的**字符串契约**常量。
 *
 * ## 为什么这些要提常量，而 `kind: 'write-scoped'` 那类不要
 *
 * 判据是「**编译器管不管得住**」：
 *
 * | 形态 | 谁保证不漂 | 要不要常量 |
 * |---|---|---|
 * | 类型联合的取值（`'read'` / `'write-scoped'` / `'full-scan'`） | **TypeScript**——写错编译就报 | ❌ 不要。提出去只是把类型系统做过的事再做一遍，还多一层间接 |
 * | 宿主服务名、环境变量名、文件 / 目录名、协议标记 | **没人**——它们是运行时字符串键，写错不报错，运行时**静默走另一条分支** | ✅ 要 |
 * | 错误码 | 同上，且它是对外契约（agent 按码决定怎么改） | ✅ 要 |
 *
 * 这条判据 2026-10-01 起写进 `docs/conventions.md`（§ 常量的判据）。
 *
 * ## 这些名字为什么是真的跨包契约
 *
 * 早期这些名字散在各插件里当字面量用过（`getService(ctx, 'settings')` 一类，全仓 12 处 /
 * 6 个包）。拼错一个字母的症状是 `getService` 返回 `undefined`，然后**静默降级**：
 * 卡片少一块、能力判定换一条路——**没有任何报错**。项目的 `tsconfig` 是白名单式装载
 * （`include`），所以这类名字**不会**变成类型错误。
 *
 * `launchEnvironment` 尤其值得单独说：`kit/capability.ts` 用它取「宿主启动环境快照」，
 * 取不到会**回落到冻结的 `process.env` 拷贝**。也就是说这个字符串错了，
 * **能力闸门的判定源会静默换掉**（安全相关，不是体验问题）。
 */

/**
 * 宿主服务的名字。
 *
 * 用法：`getService(ctx, HOST_SERVICES.settings)`。
 *
 * **这不是穷举**——宿主有几十个服务，这里只登记本仓实际用到的。新增一处时先看这里有没有，
 * 没有就补一行（补行不会破坏别处，因为值就是服务名字面量本身）。
 */
export const HOST_SERVICES = {
  /** 通用设置存储（`ctx.get('settings')`）。 */
  settings: 'settings',
  /** 启动环境快照：能力判定的**唯一**可信来源（`getFrom(name, ['process'])`）。 */
  launchEnvironment: 'launchEnvironment',
  /** 模型运行时（`ctx.get('llm')`）。 */
  llm: 'llm',
  /** 默认模型选择（`ctx.get('agentDefaultModel')`）。 */
  agentDefaultModel: 'agentDefaultModel',
  /** agent 工具注册面（`ctx.get('tools')`）。 */
  tools: 'tools',
  /** 会话列表（`ctx.get('sessions')`）。 */
  sessions: 'sessions',
  /** 会话查询（`ctx.get('sessionQuery')`）。 */
  sessionQuery: 'sessionQuery',
  /** 会话持久化（`ctx.get('sessionPersistence')`）。 */
  sessionPersistence: 'sessionPersistence',
} as const

/** 宿主服务名的取值类型。 */
export type HostServiceName = (typeof HOST_SERVICES)[keyof typeof HOST_SERVICES]

/** 全部已登记的服务名（守卫与用例用；新增服务时它会自动包含）。 */
export const HOST_SERVICE_NAMES: readonly HostServiceName[] = Object.values(HOST_SERVICES)

/**
 * 启动环境的**层名**。
 *
 * 为什么也要常量：`launchEnvironment.getFrom(name, [...])` 的第二参是层标识，它同样不在类型里。
 * 而 `'process'` 与 `'project-env'` / `'user-env'` 的**语义差别是安全性的**——
 * 后两层运行期可写（环境变量卡片），拿它们当授权等于把提权路径搬到那张卡片上。
 * 只问 `process` 这条判断是刻意的（见 `capability.ts` 的注释），写成裸字符串就很容易被「顺手加上一层」。
 */
export const LAUNCH_ENV_LAYERS = {
  /** 启动进程继承下来的环境（**唯一**可用于授权的层）。 */
  process: 'process',
  /** 项目级 `.env`（运行期可写，**不可**用于授权）。 */
  projectEnv: 'project-env',
  /** 用户级 `$DSH_HOME/.env`（运行期可写，**不可**用于授权）。 */
  userEnv: 'user-env',
} as const
