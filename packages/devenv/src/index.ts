/**
 * @hyzyn/dsh-devenv — 开发/测试环境的**编排与观测面**（私有包，不发布）。
 *
 * ## 这个包判什么（边界已定，判据一条）
 *
 * **清单与求值跟着「它判的对象」走**（`docs/devdata-plan.md` § 16.1）：本包判容器 / 进程 /
 * 端口 / HTTP 探针的**状态**；数据服务的**内容**（SQL 结果、key、lag）归 `devdata`；
 * 浏览器**渲染**的结果（截图 / console / 文本）归 `devfront`。
 *
 * 三个面的清单长得像（项目内文本 + DSH 侧只读 + 缺省即无），形态区分不了它们；真正决定归属的是
 * **观测来源**——而观测来源决定了依赖方向与失败模式（连不上库 / 容器没起 / 页面白屏是三种完全
 * 不同的故障）。按来源分，包边界与依赖方向自然一致。
 *
 * ## 依赖方向
 *
 * `devenv` → **`kit`**（机制：连接簿读取、SSH 执行层、能力闸门），**不 import 任何插件的代码**。
 * 环境编排与容器面板要的是同一个机制（「拿一条连接规格，跑一条一次性命令」），所以那一层的实现
 * 只有一份、在 `kit`（`@hyzyn/dsh-kit/ssh-exec`，见 § 16.1 的 B1 与
 * `scripts/test/ssh-single-source.test.ts` 守卫）。
 *
 * ## 按前置清单走到哪了（§ 16.1）
 *
 * | 步 | 内容 | 状态 |
 * |---|---|---|
 * | 1 | 通道（B1 上收进 `kit`） | ✅ 2026-10-02 |
 * | 2 | 建包 + 迁移就绪判据（`env-ready*`） | ✅ 2026-10-02 |
 * | 3 | 观测层（经通道取容器状态 / 日志尾部 / HTTP 探针） | ✅ 2026-10-02（`observe.ts` / `probe.ts` / `channel.ts`） |
 * | 4 | 只读工具面（`env_status` / `env_wait`） | ✅ 2026-10-02（`plugin.ts`） |
 * | 5 | `env_up` / `env_down`（能力闸门 + 二次确认） | 未做 |
 *
 * ## 刻意还没有的东西
 *
 * - **没有任何写入口**：工具面只有两个只读工具（`docker inspect` / `docker logs` / HTTP 探针）。
 *   `env_down` 会打到正在联调的同事，它要先有闸门与逐次二次确认（第 5 步）——工具面里没有的东西，
 *   agent 不会去试；
 * - **没有客户端半体**：`client-src/` 一建就被 `check-i18n` 与 `client-lint` 纳入管辖；面板排在
 *   agent 工具面之后（§ 13 的次序），现在建只会提前背上 i18n 目录与两条客户端硬规矩；
 * - **没有第三份 SSH / 连接簿实现**：这一条是 § 16.1 的「不做什么」，由守卫钉住。
 *
 * ## 真机状态（照实写，别把「单测绿」当成「真机验过」）
 *
 * | 档 | 实测 |
 * |---|---|
 * | 单测（假宿主 + 真进程的假 docker + 真临时清单） | ✅ 覆盖工具注册 / 拒绝面 / 通道 / 轮询 / 报告全文 |
 * | 真 DSH 挂载（`scripts/verify-devenv-host-mount.mjs`） | ✅ 2026-10-02 **12/12**（连跑两次） |
 * | 真机观测链路（`test/real-machine.test.ts`，门控 `DEVENV_REAL=1`） | ✅ 2026-10-02 **4/4**（SSH → `docker inspect` / `docker logs` → 解析 → 判定） |
 *
 * 真机那一档抓到过一个单测抓不到的缺陷（`{{.State.RestartCount}}` —— `RestartCount` 其实是**顶层**
 * 字段）：假 docker 夹具照自己的想象回一行，所以模板写错它也不吭声。现在有
 * `test/inspect-template.test.ts` 拿真机的**结构样本**逐条解析模板里的字段路径守着。
 * 仍然**验不到**的（样本容器没有健康检查，所以 `Health` 那条路径只有「受 `{{if}}` 保护」这一条
 * 被验到）在 README 的「还没验到的」里逐条写着。
 *
 * ## 就绪判据为什么单独一层（迁来的那两块）
 *
 * `env-ready.ts` 只做**加载与校验**（清单形状、恰好一种判据、正则合法性），`env-ready-eval.ts`
 * 只做**求值**（纯函数：观测 + 要求 → `ready` / `unready` / `refuted`）。分开的理由是这一层最容易
 * 悄悄错掉的不是崩溃、而是**判错时机**：判早了跑在热启动中间（一串假阴性），判晚了容器崩了还等满
 * 超时（agent 拿到「超时」只会再等一次）。把观测与判定切开，判定才能在没有真机的情况下被完整测试。
 *
 * 依据：`docs/devdata-plan.md` § 13.2（就绪判据）、§ 16.1（边界与前置清单）、
 * `jenkins-release` 技能 § 3.1 / § 4（真机上的判据来源）。
 */

export * from './env-ready.js'
export * from './env-ready-eval.js'
export * from './rejection.js'
export * from './mutate.js'
export * from './observe.js'
export * from './probe.js'
export * from './plugin-config.js'
export * from './ready-loader.js'
export * from './channel.js'
export * from './plugin.js'
export * from './render.js'
