/**
 * @hyzyn/dsh-devdata — 开发/测试环境的数据面（**私有包，不发布**）。
 *
 * ## 这个包现在有什么
 *
 * - **判据层**（P1–P2）：环境模型、操作矩阵、作用域门、凭证保护强度、操作级裁决器、查询计划护栏、
 *   只读自证、验活断言库。它们**不连接任何东西**——不发连接、不跑语句、不碰 docker，因此可以在
 *   没有真机、没有凭证的情况下被完整测试；而「判定对了没有」正是这套东西最容易悄悄错掉的地方。
 * - **入口层**（`entries.ts`）：把「可见面」收成「**这台机器上真的有执行器**的那些入口」。
 * - **引擎层**：今天只有 Redis 的通路 A（`redis-executor.ts` + 自写 RESP，**零依赖**），已真机验证；
 *   SQL / RocketMQ 的驱动按 §2.4 **一律可选**，装了驱动也不等于有执行器。
 * - **宿主半体**（`plugin.ts`）：读配置、注册四个 agent 工具、写审计、把拒绝转成带码与恢复路径的话；
 *   外加配置卡片的**数据面**（`GET/POST /api/dsh-devdata/config`）。
 * - **客户端半体**（`client.js`，2026-10-03 建）：官方「插件配置」里的一张卡片（同 `devenv` /
 *   `devfront`）——标量与目标可改，**两档能力只读**（写入路径上出现即 400，见 `plugin.ts` 的
 *   `CAPABILITY_FIELDS`）。
 *
 * 工具名带 `devdata_` 域前缀（仓库守卫要求 `<域>_<动作>`）；今天注册的是
 * `devdata_list_targets` / `devdata_capabilities` / `devdata_doctor` / `devdata_redis_command`。
 *
 * ## 刻意没有的东西
 *
 * - **没有就地提权通道**：卡片能改配置，但两档能力在写入路径上**只读**（那条 400 是根 ROADMAP
 *   §5.1 不变量在卡片层的落点），`bindCapabilitySources` 也不接 `GrantStore`——所以能力文案只说
 *   「启动环境 + 重启宿主」（`adjudicate.ts` 里 `capabilityHowTo` 刻意不传 `inPlace`，提一个不存在
 *   的开关正是本仓修过的缺陷类型）。
 * - **没有 SQL / RocketMQ 的执行器**：那几个引擎只给引擎无关的自证工具，数据入口一个都不注册
 *   （注册了就是「配了没反应」，见 `entries.ts`）。阻塞项是 C2 账号与防火墙，不是代码。
 *
 * 关于 `dsh.bundle.patch`：本包**有**它（否则装不进 profile），而它不会被卷进 `@hyzyn/dsh-all`
 * ——判据是 `scripts/aggregate.mjs` 的 `isAggregatable`（跳过 `private`），2026-10-01 落的方案 §7 N1。
 *
 * 依据：`docs/devdata-plan.md`（§3.1 不变量、§3.6 失败模式、§3.6.1 工具面、§3.8 环境四态、§17.14）。
 */
export * from './env.js';
export * from './operations.js';
export * from './sql.js';
export * from './redis-command.js';
export * from './plan-guard.js';
export * from './readonly-probe.js';
export * from './tool.js';
export * from './entries.js';
export * from './plugin-config.js';
export * from './audit.js';
export * from './plugin.js';
export * from './engine-driver.js';
export * from './resp.js';
export * from './redis-executor.js';
export * from './rejection.js';
export * from './scope.js';
export * from './credential.js';
export * from './adjudicate.js';
export * from './verify.js';
export * from './verify-eval.js';
/**
 * 复用 `kit` 的能力规格类型，而不是自造一个。
 *
 * 这不是洁癖：能力判定的**唯一实现**在 `kit`（`capabilityGranted` / `capabilityHowTo`），
 * 自造一个同形接口会让「两条闸门口径漂开」变成只是时间问题——而 docker / tty 已经用这个
 * 类型接进去了，本包是第三个消费者。
 */
export type { CapabilitySpec } from '@hyzyn/dsh-kit';
