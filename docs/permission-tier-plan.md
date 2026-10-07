# 插件工具接入会话权限档位（tier gate）实施方案

> 执行对象：AI 代理。本文自包含，按 PR 顺序执行；每节末尾有可勾选验收项。
> **状态**：**PR1–PR3 已落地、PR4 文档已同步（2026-10-07）**——kit `tier-gate.ts`、tty/docker
> 分类表与接线、守卫与单测、README 与 architecture §7 全部就位；**§7 的真机验收 V0–V8 还没跑**
>（需要真 DSH 宿主，见 `docs/agent-real-test.md`）。实施偏差与 R1–R4 的决议见 **附录 B**。
> **编号纪律**：本方案**不预设任何 `Dxx`**；实施中挖出的缺陷按各包台账序列接在当时的最大号之后
> （起点以动手时的台账末行为准），编号增改属 [AI 协作边界](./conventions.md#ai-协作边界什么改动要先问)
> 的「先问」项。
>
> **一句话**：会话权限档位菜单（仅可查看 / 工作区内修改 / 完全权限 / Auto review）目前只约束
> 宿主自带的 bash / fs 工具；插件工具（`tty_*` / `sftp_*` / `tunnel_*` / `docker_*`）完全不受档位
> 约束——`tty_run` 一条命令就能越过沙箱围栏做 bash 做不到的事。本方案把档位接进插件工具：
> 每次调用解析会话的有效档位，按「**分类表 × 档位**」决定 放行 / 询问（走宿主 approval 服务）/
> 拒绝。这也是 [capability-elevation-plan.md](./capability-elevation-plan.md) §9 当年明确后置的
> 「动作分级（remove/prune/exec 走维护窗口或**逐次确认**）」的落地。

## 0. 动机与威胁模型

两条**现状缺口**（2026-10-07 核对）：

1. **围栏可绕过**。宿主 bash / fs 受沙箱约束（workspace-write 只覆盖会话工作目录；越界要先
   `sandbox_permissions` 升级、经 approval 服务弹人工确认）。而插件的 `tty_run` / `tty_send` /
   `tty_open` 是**无沙箱**的任意命令执行面：注册只受插件总开关 `enabled` 门控
   （`packages/tty/src/index.ts` 的 `registerAll`，无任何逐调用判定），模型用它们跑同一条
   bash 拒绝的命令，直接生效。工具描述里「纯非交互命令用 bash 更直接」是软引导，不是闸门。
2. **静态授权是「一次授权、永久放开」**。docker 破坏档工具（`docker_action` / `docker_image_remove`
   / `docker_image_prune` / `docker_image_pull`）与 `docker_exec` 注册后，AI 调多少次人都看不到——
   授权（环境变量或就地 touch 文件）是持久的（kit D09）。elevation plan §0 的对手表里没有
   「被误导的 agent 自己」这一类；本方案把它补上。

对手表（沿用 elevation plan §0 的编号，新增 (d)）：

| 对手 | 能力 | 现状 | 本方案 |
|---|---|---|---|
| (a) 跨站页面 | 能发回环请求，读不到响应 | 拦（回环围栏） | 不变 |
| (b) 页内脚本（第三方 client 半体 / XSS） | 同源请求任意发 | 拦（加固档 + 同源证明） | 不变 |
| (c) 本机同用户进程 | 读文件、发请求、直接跑 docker | **不拦（明确出模型）** | 不变 |
| (d) 被误导 / 被注入的 agent | 模型判断被污染，亲手调高危工具 | docker：只有静态开关；tty：**什么都没有** | **档位拒绝或逐次人审** |

三条结论（实现不得违背）：

1. **(d) 是唯一新增对手**，它不是外部进程，而是「委托链上人与模型的信任缝隙」——防它靠的是
   **把关键动作拉回人的视野**（ask）或**按人给的档位收窄**（deny），不是更难的密码学。
2. **档位是人对本会话给的信任上界，插件必须跟**；但插件不能比宿主松（完全权限档零询问），
   也不能凭空发明宿主没有的语义（workspace-write 只管**本机文件效应**，管不到远程主机与容器——
   连宿主 bash `ssh` 到别台机器也不在沙箱内。远程效果永远靠 ask 拉人，不靠档位声称）。
3. **服务未组合（老宿主 / 最小部署）时不闸**——那是今天的现状行为；但必须留一行启动审计。
   「静默不闸」违反本仓信号文化；「缺服务即 fail-closed 全拒」会砖掉老宿主上的整个工具面，
   不做（README 的安全假设小节要写明这条边界）。

## 1. 档位的真身与读法（运行时实测，2026-10-07，runtime `0.2.1-alpha.1`）

四档菜单 = `@deepseek-ai/dsh-permission-presets` 的 preset = **两个会话级旋钮的打包**
（会话事件折叠，durable、重启可重放；`custom` = 旋钮值对不上任何已配置 preset 的派生态）：

- `sandbox/mode`：`'read-only' | 'workspace-write' | 'danger-full-access'`（`dsh-sandbox-policy/session-mode`）；
- `approval/policy`：`'ask' | 'never'`（`dsh-user-approval`，`never` = 无人值守 stance，ask 一律确定性拒绝）。

| 菜单项 | 预期折叠值 | 依据 |
|---|---|---|
| 仅可查看 | `read-only` + `ask` | 客户端 i18n `preset.readOnly`（`dsh-client-ui-permission-presets`） |
| 工作区内修改 | `workspace-write` + `ask` | 同上 + preset 服务的 Config 缺省文档 |
| 完全权限 | `danger-full-access` + `never` | 同上（Config 缺省明写 danger-full-access 组合是 `never`） |
| Auto review（EXP） | 「无沙箱运行」+ 预审拒绝转人工 | 客户端 `auto.description` 原文；live preset 由 `dsh-experimental-auto-review` 经 `registerAuto()` 挂载 |

**预期折叠值是推导，不是实测**——四档的旋钮组合属部署配置，**真机验收 V0 逐档实测确认**后
才允许把矩阵写成断言。

**读法**（每次调用解析；宿主 bash 的原样模式，见 `dsh-tool-bash` 的 `resolveSandboxPolicy`）：

```ts
const sandbox = ctx.get('sandboxPolicy')   // 可能 undefined（未组合）
const approval = ctx.get('approval')       // 可能 undefined
const mode   = sandbox?.resolve({ session: exec.agent.session }).mode   // 会话覆盖 > 部署默认
const policy = approval?.overrideOf(exec.agent.session) ?? 'ask'        // 服务 config 缺省即 'ask'
```

- `resolve()` 的 `SandboxPolicyRequest` 带可选 `session`（其不可变 cwd 即 workspace 边界）；
  返回 `{ mode, workspaceRoot, sessionId? }`。
- `ask` 决策的宿主解析在 `ToolRuntime.serviceAsk`：经 `ctx.get('approval')` 走
  `ApprovalService.request` → `approval/request` 瀑布 → UI answerer（运行时含
  `dsh-client-ui-approval`，即真机截图里那个「等待审批」弹窗）→ `allowed-once` 才放行；
  **无 approval 服务 / 无 agent / 无开会话一律 fail-closed 拒绝**；每次 ask/decided 成对落会话审计。
- **Auto review 已在管插件工具**：`dsh-experimental-auto-review` 的 `tools/pre-execute` 监听
  **不筛工具名**（实测其 `lib/index.js`），描述原文「每次原生工具调用和 PTC 内层调用前由同一模型
  进行实验性审查」。插件对 auto 不叠加自己的 ask（§2 矩阵由此成立）。

**版本下限**：`dsh-sandbox-policy` 与 `dsh-user-approval` 在 peer 下限 `0.1.7-rc.2` 的 pnpm store
里都已存在；`PreToolDecision`（含 `'ask'`）在钉住的 `dsh-tools` 两个版本（`0.1.2-rc.1` 与
`0.1.7-rc.2`）都有。类型面：`dsh-tools` 本就在两插件 peerDependencies 里，`tools/pre-execute`
的 Events 扩充对插件 typecheck 可见；`sandboxPolicy` / `approval` 两个**服务名**不在 peer 类型里，
按仓内先例（codegraph 的 `session/event`、tty 的 `ctx.get('tools')`）用结构化 cast。

**监听点可行性先例**：插件作用域 `ctx.on(<宿主事件>)` 已有在产先例（codegraph 采纳率收集器监听
`session/event`，注释写明核对过 `dsh-acp` / `dsh-agent-instructions` 同款用法）。`tools/pre-execute`
照抄该模式；**若真机上发现该事件对插件作用域不可达**（cordis 派发面问题），退化路径见 §6 开头。

## 2. 设计：分类表 × 决策矩阵

### 2.1 工具分类（谁负责声明）

分类是**逐工具的静态事实**，由各插件在自己包里声明（kit 不知道也不该知道工具名）；`exec`
类可以带**按参数细化**的钩子（pre-execute 的 `exec.args` 是已解析参数，如 `sftp_remove`
的 `recursive`）。名单与注册处现算对账（§3 不变量 4）。

**tty**（工具名单以 `registerAll` 注册处与启动日志那行为准）：

| 类 | 工具 | 判据 |
|---|---|---|
| `read` | `tty_list` `tty_capture` `tty_screen` `tty_expect` `tty_stats` `tunnel_list` `sftp_list` `sftp_read` `sftp_tree` | 纯读（含等待输出） |
| `read` | `tty_close` | 簿记：只能关 agent 自己开的会话（既有归属守卫），无新破坏面（**R2**） |
| `write` | `sftp_write` `sftp_mkdir` `sftp_rename` `sftp_remove` `tunnel_stop` | 有界变更：远程 ≤1MB 文本 / 目录 / 删隧道转发 |
| `exec` | `tty_open` `tty_run` `tty_send` `tunnel_start` | 无界命令面（本机或远程 shell——`tty_send` 能往活 shell 里敲任意命令）与宿主监听面（开隧道=在本机开监听端口）（**R3**：`tunnel_start` 归 `write` 的备选） |

**docker**（名单以注册处为准；后三组受静态开关门控注册）：

| 类 | 工具 | 判据 |
|---|---|---|
| `read` | `docker_targets` `docker_connect_local` `docker_ps` `docker_attention` `docker_inspect` `docker_logs` `docker_stats` `docker_events` `docker_images` `docker_image_inspect` `docker_networks` `docker_volumes` | 纯读 / 固定二进制探测（connect_local 不在能力开关里，见其注释） |
| `write` | `docker_action` `docker_image_remove` `docker_image_prune` `docker_image_pull` | 容器与镜像的变更（pull 是拉取非破坏，但改本地状态，且已在 `allowMutations` 组里） |
| `exec` | `docker_exec` | 容器内一次性命令 |

### 2.2 决策矩阵（唯一判定处，纯函数）

| 会话 mode | 会话 policy | `read` | `write` | `exec` |
|---|---|---|---|---|
| `danger-full-access`（含 auto，见 V5） | 任意 | allow | allow | allow |
| `read-only` | `ask` | allow | **ask** | **ask** |
| `read-only` | `never` | allow | deny | deny |
| `workspace-write` | `ask` | allow | **ask** | **ask** |
| `workspace-write` | `never` | allow | deny | deny |
| 服务未组合（`sandboxPolicy` 缺） | — | allow | allow（现状） | allow（现状）+ 启动审计 |

矩阵读法与理由：

- **`danger-full-access` → 全放行且零询问**：该档的 intent 就是「减少确认步骤」（客户端确认弹窗
  原文），且其 policy 是 `never`——**此时返回 ask 会被 approval 服务确定性拒绝，等于把工具问死**。
  这是「读档是正确性前提」的那条（§3 不变量 2）。
- **`read-only` + `ask` → ask 而非 deny**：宿主 bash 在同档位走「沙箱拒绝 → 模型带
  `sandbox_permissions` 重试 → 人工确认」，净效果也是「人点了才执行」，只是多烧一次往返；
  插件直接 ask，同一人力决策、更短的链路。`allowed-once` 语义保证只放行这一次调用。
- **`never`（无人值守）+ 受限档 → deny**：ask 无从问起，确定性拒绝才是诚实语义（与宿主
  「read-only 沙箱下无升级可用」同构）。deny 文案必须指路（§2.4）。
- **为什么 `read-only` 与 `workspace-write` 在矩阵里同格**：沙箱词汇管本机文件效应；插件工具
  的效果要么**不在文件词汇内**（远程、容器、网络），要么**无法被 workspace 边界约束**（`tty_run`
  整机命令）。所以插件侧这两档只能靠「问」来补边界，格值相同；差异留在文案里说清档位名。
  （**R1**：备选方案是 read-only 档对 `write`/`exec` 直接 deny——更严，但把「带授权的合理使用」
  也挡了；推荐 ask，理由是 ask 与宿主升级路径净效果等价。）
- **auto 不在矩阵里单列**：auto 预期折叠为 `danger-full-access` 组合（「无沙箱运行」），被第一行
  覆盖；若 V0 实测不符（例如折叠为 `workspace-write` + `ask`），加一条「
  `permissionPresets.current(session) === 'auto'` → 插件让位（等同 allow，预审已在管）」，
  服务可选解析、缺了按矩阵走。

### 2.3 ask 的形态

pre-execute 监听返回 `{ kind: 'ask', reason }` → 宿主 `serviceAsk` → UI 弹窗（挂在正在流式展示的
那次调用上，`exec` 的 callId 天然可用）→ `allowed-once` 放行、其余拒绝。`reason` 是**给人看的**
一句话：工具 + 目标 + 后果摘要（例：`docker_action：remove 容器 my-api（目标 prod-1）`）。
插件**不重复记审计**——`approval/asked` + `approval/decided` 成对落会话日志是宿主的职责。

### 2.4 deny 的文案规矩

模型要能分清三种拒绝，deny 文案（`reason`）必须点名是哪种并指路：

1. **档位拒绝**（本方案新增）：「当前会话权限档位为『仅可查看』，本工具被拒绝；要执行请让用户
   调整权限档位，或（纯非交互命令）改用 bash 工具——它会走沙箱与升级通道」；
2. **审批拒绝**（人拒了这个具体调用）：宿主 serviceAsk 的既有措辞，插件不复述；
3. **静态能力未授权**（400 那套）：不变，与本方案无关。

deny 一律打一行日志：`[dsh-<pkg>] tier-gate: deny tool=<名> mode=<mode> policy=<policy>`；
allow 不打（热路径）。ask 不由插件打（归宿主审计）。

## 3. 不变量

1. **插件不得比宿主松**：同一档位下，插件工具的放行面不得宽过宿主 bash。形式化最小式：
   `mode=read-only` 时，任何 `write` / `exec` 类调用不得**免审**执行。
2. **完全权限档零询问**：`mode === 'danger-full-access'` 时插件不得返回 `ask`（policy 是 `never`，
   ask 即确定性拒绝——这不是保守，是事故）。
3. **读档失败不改现状**：`sandboxPolicy` / `approval` 未组合 → 与今天一致（不闸）+ apply 期一行
   启动审计（`tier-gate: services absent (sandboxPolicy=… approval=…), per-call gate disabled`）。
   不 fail-closed。
4. **分类表全覆盖**：每个注册的 agent 工具名必须出现在分类表里。守卫测试从**注册处现算**名单
   （tty 的 `registerAll` 清单 / docker 的 `add()` 调用）与分类表对账，缺一个就红——新工具漏分类
   不许静默跳闸。
5. **静态能力开关不动**：`allowMutations` / `allowExec` / `allowProxyCommand` 继续管「注册不注册」
   （启动期、宿主级、持久授权）；档位闸只管「已注册的这一次调用放不放行」（逐调用、会话级）。
   双层并存，先注册后闸；合并是后话（§10）。
6. **监听器永不 claim `allow`**：插件在 `tools/pre-execute` 瀑布里要么 `next()` 透传，要么返回
   `deny` / `ask`。插件只是拦截人，不是放行人——auto-review 等同瀑布监听者不被插件短路。
7. **只听自己的名字**：监听器按工具名前缀过滤（`tty_` / `sftp_` / `tunnel_`、`docker_`），对
   bash / fs / 别的插件工具零介入（多一个旁听者既慢又越权）。
8. **不写死档位名**：插件逻辑只读旋钮（mode × policy），唯一的例外是 auto 的可选检测
   （§2.2）。preset 键名是部署配置（`readOnly` 之类是这台部署的命名），不是契约。

## 4. kit 侧（PR1）

新增 `packages/kit/src/tier-gate.ts`（kit 的职责清单本就含「服务读取」；**不新增任何 package
依赖**——全部结构化类型 + cast，不 import `@deepseek-ai/dsh-*`）：

```ts
export type TierClass = 'read' | 'write' | 'exec'
export type TierMode = 'read-only' | 'workspace-write' | 'danger-full-access'
export type TierPolicy = 'ask' | 'never'
export interface TierContext { mode: TierMode; policy: TierPolicy; auto: boolean; services: { sandboxPolicy: boolean; approval: boolean } }
export type TierDecision = { action: 'allow' } | { action: 'deny'; reason: string } | { action: 'ask'; reason: string }

/** 读一次会话档位。session 缺（agentless）→ services 照报、mode/policy 用部署缺省语义（never 侧倾斜，见用例）。 */
export function resolveSessionTier(ctx: unknown, session: unknown): TierContext
/** 矩阵本体（§2.2），纯函数；auto=true 直接 allow。 */
export function decideTierCall(tier: TierContext, cls: TierClass, tool: string): TierDecision
/** §2.4 的三段文案（模型面，单语中文，与工具描述同语言；不进客户端、无 i18n 面）。 */
export function tierDenialReason(input: { tool: string; mode: TierMode; policy: TierPolicy }): string
/** 造一个 tools/pre-execute 监听器：前缀过滤 → resolve → classify → decide；
 *  allow 一律 next() 透传（不变量 6）。classify 由插件给（可按 args 细化）。 */
export function createTierGateListener(options: {
  pkg: string                                    // 日志前缀 [dsh-<pkg>]
  prefixes: readonly string[]                    // 工具名前缀
  classify(tool: string, args: unknown): TierClass | undefined   // undefined = 名单外 → 不拦 + 记一次「未分类」告警
}): unknown                                      // 形状对齐宿主事件监听器（cast，kit 无宿主类型）
```

要点：

- `resolveSessionTier` 里对 `ctx.get(name)` 的两次读取都是 cast（kit 无宿主类型，仓内先例同款）；
  服务缺位在 `services` 里如实上报，**调用方不猜**。
- `decideTierCall` 是唯一矩阵（§2.2），表格逐格单测；`auto` 检测放 resolve（读
  `permissionPresets.current(session)`，服务缺 = `auto:false`，矩阵不受影响）。
- agentless 调用（`exec.agent` 缺）：本方案的插件工具全部经 agent 派发，但 `resolve` 的
  `session` 参数可选必须处理——取**更严**侧（policy 视作 `never`）并在用例里钉住。
- 启动审计一行由调用方（插件 apply 期）打，kit 提供 `tierGateStartupLine(services): string`。

**验收（PR1）**

- [ ] 矩阵逐格：3 mode × 2 policy × 3 class × auto 开关，全格断言
- [ ] 服务缺位：`services` 如实、行为 = 现状（allow）、auto 检测缺服务不炸
- [ ] agentless：取严侧（policy=never）有断言
- [ ] `createTierGateListener`：前缀过滤（bash 工具不拦）、`classify` 返回 undefined 走「未分类」告警、
      allow 走 next()（用假 next 记录调用顺序断言）
- [ ] 文案三段齐、不含具体宿主内部名（模型不需要知道 serviceAsk）

## 5. tty 侧（PR2）与 docker 侧（PR3）

两边同一形态（PR2 落完 PR3 照抄结构）：

- apply 期注册 `ctx.on('tools/pre-execute', createTierGateListener({ pkg: 'tty', prefixes: ['tty_', 'sftp_', 'tunnel_'], classify }))`；
  **注册与工具注册同生命周期**（tty 挂在 `registerAll` 的 enabled 判断内，docker 挂在
  `add()` 同一层），禁用热生效时一并撤下。
- 分类表按 §2.1 落成包内常量 + `classify` 函数（tty 的 `sftp_remove` 按 `args.recursive` 细化
  可后置——v1 不按参数分级，整工具一个类，避免第一次落地就有两套格子；**记入 §10 待办**）。
- **守卫**（不变量 4）：单测从注册处现算工具名清单（tty 读 `registerAll` 那份启动日志字符串 /
  docker 遍历 `add` 的注册容器）与分类表对账；新增工具漏分类 → 红。
- 单测：每类 × 代表档位的路由级用例（假 ctx 造 tier），deny 文案快照，前缀过滤，
  `enabled:false` 时监听器随工具一起撤下。
- README 的 agent 工具节每个工具补一句档位行为；安全假设小节补「服务未组合 = 不闸」。

**退化路径（真机 V0 前不许删）**：若 `tools/pre-execute` 对插件作用域不可达（§1 末的风险），
PR2 改为**工具体内闸**：`defineTool` 的 `execute` 第一行调同一套 `resolveSessionTier` +
`decideTierCall`，ask 用 `ctx.get('approval')` 直接 `request({ agent, toolName, callId, reason, signal })`
——这正是宿主 bash 沙箱升级的原样编舞（`dsh-sandbox/escalation` 的结构化闭包模式），可行性与
approval 服务面都已验证；代价是 ask 发生在调用已展示之后（仍在其副作用之前，语义可接受）。
**两条路径共用全部矩阵与文案**，切换只动接线层。

**验收（PR2 / PR3 各自）**

- [ ] 守卫红：人为从分类表删一个工具名 → 测试红；恢复 → 绿
- [ ] `enabled` 热切换：关插件 → 监听器撤下（tty 的 `registerAll` 语义不变）
- [ ] 矩阵行为：至少 read-only×ask、workspace-write×never、danger-full-access 各一条端到端
      （假 ctx 造服务）断言到 deny 文案 / ask 结构
- [ ] docker：`allowMutations=false`（未授权）时档位闸不改变「工具不注册」的现状——双层互不越位

## 6. 文档与台账（PR4）

- [architecture.md](./architecture.md) §7 第 2 条「能力开关」之后补一小段「档位闸」：两层各自
  管什么、矩阵一句话、服务缺失语义。**机制推演不进 L0**（归宿本文），只留跨包结论。
- 两包 README（zh/en 同步）：工具表的档位行为列 + 安全假设一条。
- [conventions.md](./conventions.md) 知识归属表登记本文（已完成——本文立项时同步加的）。
- 项目 ROADMAP 第 10 项回填「落点 + 门槛」；两包 ROADMAP 的指针行更新状态。
- 台账：实施中发现的真实缺陷按包序列入各 `DEFECTS.md`（编号先问）；§9 的 R1–R4 决议
  记回本文（原地改写，不留 v2 文件）。

## 7. 真机验收（`docs/agent-real-test.md` 约束；编号 V0–V8）

| # | 场景 | 通过判据 |
|---|---|---|
| V0 | 四档旋钮折叠值逐档实测（切档 → 读会话事件/快照） | §1 表格的「预期」变「实测」；不符则改矩阵出处并记录 |
| V1 | 矩阵逐格 × 代表工具：`tty_run` / `tty_send` / `sftp_write` / `tunnel_start` / `docker_action(remove)` / `docker_exec` / `docker_ps` | 每格行为 = §2.2；ask 弹窗内容含工具与目标 |
| V2 | 会话内切档，下一个调用立即按新档 | 无需重启；`read-only` → `danger-full-access` 切过去后同一条命令直接放行 |
| V3 | ask 的 UI 与词汇 | 弹窗挂在对应调用卡片上；允许一次后**同类再调仍问**（allowed-once）；拒绝 → 模型收到 §2.4-2 的措辞 |
| V4 | 完全权限档 + 无人值守（never） | 零弹窗；`workspace-write`+never 会话里 exec 类确定性拒绝且文案点名「无人值守」 |
| V5 | auto review 共存 | auto 档下插件不再叠加 ask（无双弹窗）；预审拒绝的调用不因插件闸而漏记 |
| V6 | 老宿主 / 最小部署 | 服务缺位时行为 = 现状 + 启动审计行可见（构造方式与维护者确认） |
| V7 | 双层并存 | 静态未授权 + 完全权限档 → 破坏档工具仍不注册；已授权 + 工作区内修改 → 注册但每次 ask |
| V8 | 「不比宿主松」实证 | 同档位下 bash 沙箱拒绝的越界写，`tty_run` 同命令被拦（ask 或 deny），截屏留档 |

### §7 实测记录（2026-10-07，test profile 真 DSH 宿主 + 真 agent 回合，浏览器驱动）

| # | 结果 | 证据要点 |
|---|---|---|
| V1（部分格） | **过** | workspace-write+ask × `tty_run`(exec) → 弹「等待审批」，卡片挂正确调用（`tty_run · pwd && echo ok`）、reason 为 `tierAskReason` 原文、命令原文可见、拒绝/允许一次两按钮 |
| V3 | **过** | 允许一次 → 命令真执行（退出码 0，输出回模型）；同会话同类再调 → **再次弹窗**（allowed-once 不保会话）；拒绝 → 模型收到 `the user rejected tool "tty_run"`，明说「按规则没有改用 bash 绕过」 |
| V2 | **过** | 会话内三连切（工作区内修改 → 完全权限 → 仅可查看 → Auto review → 回工作区内修改），每切一次下一个调用立即按新档走，零重启 |
| V4 | **过** | 完全权限（经客户端知情确认对话框）下 `tty_run` 零弹窗 3 秒执行完；模型侧自述「当前审批策略已是 never…我不会请求沙箱提权」——宿主把旋钮折叠进了模型 runtime context，与插件闸读到的同源 |
| 仅可查看（R1 决议的行为） | **过** | `tty_run`(exec) 弹窗且文案动态变为「仅可查看」；`tty_list`(read) 零弹窗 2 秒直接完成 |
| V5 | **过** | Auto review（经知情确认）下 `tty_run` 执行成功且**零插件弹窗**——插件让位宿主预审，无叠加 |
| V8 | **过** | 同一目标路径的越界写：bash → 沙箱拒绝（`Operation not permitted` + `[sandbox: file access denied under workspace-write mode]`）；`tty_run` 同命令 → **档位闸弹 ask**（而非静默执行）。两次都被拦，探针文件最终不存在 |
| docker 侧 | **过** | `docker_ps`(read) 无弹窗放行；`docker_exec`(exec) 弹「工作区内修改」档位审批 |
| V0（事件级） | **行为等价确认** | 未能直接读会话事件流；四档折叠值由行为差异反推一致（切档后 ask/deny/allow 变化全部符合 §2.2）。事件级核对留给维护者（一次 `dsh --dump-config` 或会话日志翻查） |
| V6 / V7 | **未跑** | V6 需构造服务缺位宿主（本地单机只有全量组合）；V7 的「撤销宿主授权」半边要动设置卡片 + 授权文件，留待维护者按需执行。两者的代码路径均有单测覆盖（kit 矩阵 + docker 组别交叉对账） |

## 8. PR 切分与顺序

| PR | 内容 | 依赖 |
|---|---|---|
| PR1 | kit：`tier-gate.ts` + 矩阵 / 退化 / 监听器单测 | — |
| PR2 | tty：分类表 + 监听（或退化路径的工具体内闸）+ 守卫 + 单测 + README | PR1 |
| PR3 | docker：同构落地 | PR1（结构对齐 PR2） |
| PR4 | 文档四处 + ROADMAP 回填 + V0–V8 执行记录 | PR2、PR3 |

## 9. 开放决策（实施前逐条过）

| # | 决策 | 推荐 | 备选 |
|---|---|---|---|
| R1 | `read-only` + `ask` 档对 `write`/`exec` 是 ask 还是 deny | **ask**（与宿主升级路径净效果等价，人看到每一次） | deny（更严，挡掉带授权的合理使用） |
| R2 | `tty_close` 归类 | **read**（簿记，既有归属守卫已限 agent 自己的会话） | write（毕竟结束进程） |
| R3 | `tunnel_start` 归类 | **exec**（在本机开监听端口 = 网络面变更） | write |
| R4 | `workspace-write`+`ask` 下 exec 类逐次询问的噪音 | **维持 ask**（`tty_send` 高频是真的，但它是无界命令面——这正是档位菜单存在的意义：信任任务就切完全权限） | `tty_send` 降为 write 级（会在 workspace-write 档重开围栏可绕的洞，不推荐） |

## 10. 明确不做（本方案范围外）

- **本地命令过真沙箱**（`ctx.sandbox.confine()` 包 PTY 命令，与 bash 同等隔离）：PTY 与
  sandbox runner 的兼容性未验证，单独立项；
- **取代静态能力开关**（双层合并要重定信任模型，等档位闸跑稳再说）；
- **「本会话不再问」记忆**：宿主 approval 词汇表只有 `allowed-once`；会话级记忆要动宿主语义，
  插件侧自建记忆会重新打开 (c) 对手的门；
- **按参数分级**（`sftp_remove recursive`、`docker_action remove` vs `start`）：v1 整工具一个类，
  参数级留待第一轮真机反馈；
- **插件工具 schema 加 escalation 参数**（`sandbox_permissions` 是 bash / fs 的编舞，插件不照搬）；
- **客户端半体改动**（档位菜单是宿主的 UI，插件不加第二个控制面）。

---

## 附录 A：运行时证据清单（2026-10-07 实测，runtime `0.2.1-alpha.1`）

结论的出处都在宿主运行时的 node_modules 里（不入库，记录包 / 文件 / 位置，随宿主升级可能漂移——
引用时先重新核对）：

- **pre-execute 瀑布与 `ask`**：`@deepseek-ai/dsh-tools` `lib/types/index.d.ts`——`tools/pre-execute`
  事件（"Allow, deny, or ask before dispatch. next() delegates to allow; **missing approval support
  turns `ask` into denial**"）、`PreToolDecision`（allow / deny / ask 三态，input rewriting 被排除）、
  `ToolRuntime.serviceAsk`（`ctx.get('approval')` 机会式消费；无服务 / 无 agent / 无开会话 →
  fail-closed；`allowed-once` 是唯一 grant）。
- **approval 服务**：`@deepseek-ai/dsh-user-approval`——`ApprovalService.request`（要求 open turn；
  审计成对落会话）、`ApprovalOutcome`（`allowed-once / rejected / cancelled / unavailable`）、
  `ApprovalPolicy`（`'ask' | 'never'`）、`overrideOf(session)`；`@deepseek-ai/dsh-session` 事件
  `approval/policy`。
- **沙箱档**：`@deepseek-ai/dsh-sandbox-policy`——`SandboxPolicyService.resolve({session})`
  （会话覆盖 > 部署默认；session cwd 即 workspace 边界）、`overrideOf`；会话事件 `sandbox/mode`
  （log-only、重启重放）。
- **四档菜单**：`@deepseek-ai/dsh-permission-presets`——`PresetSpec`（= sandbox + approval 打包）、
  `AUTO_PRESET` / `CUSTOM_PRESET`、`current(session)`、`Config` 缺省档文档；客户端标签与
  Auto review 文案在 `dsh-client-ui-permission-presets/lib/client.js`（`preset.readOnly` /
  `preset.workspaceWrite` / `preset.fullAccess` / `auto.description`）。
- **Auto review 覆盖面**：`@deepseek-ai/dsh-experimental-auto-review`——类型头注「Every native call
  and every started PTC inner call is reviewed once before its body」；`lib/index.js` 的
  `tools/pre-execute` 监听**无工具名过滤**（grep 无任何第一方前缀）。
- **宿主 bash 的逐调用读法**：`@deepseek-ai/dsh-tool-bash` `lib/index.js`——
  `resolveSandboxPolicy = (exec) => sandboxPolicy?.resolve(exec.agent === undefined ? {} : { session: exec.agent.session })`；
  其类型头注明写「TODO(permissions): deployment policy belongs in `tools/pre-execute`」。
- **升级编舞的插件侧范本**：`@deepseek-ai/dsh-sandbox` `escalation.d.ts`——工具层闭包
  `ctx.approval.request(...)` 下传、`allowed-once` 语义、fail-closed 顺序。
- **版本下限**：pnpm store 里 `dsh-sandbox-policy@0.1.7-rc.2` 与 `dsh-user-approval@0.1.7-rc.2`
  存在，且前者的 `resolve` / `overrideOf` 签名与上述一致；`dsh-tools` 的 `PreToolDecision` 在
  `0.1.2-rc.1` 与 `0.1.7-rc.2` 都有。
- **插件监听宿主事件的仓内先例**：`packages/codegraph/src/index.ts` 的采纳率收集器
  （`ctx.on('session/event', …)`，注释记明核对过 `dsh-acp` / `dsh-agent-instructions` 同款）。

---

## 附录 B：实施记录（2026-10-07，与本文的偏差）

**R1–R4 的决议**：维护者批准按方案实施，四条全部按 **§9 的推荐值**落——R1 `read-only`+`ask` 对
`write`/`exec` 是 **ask**；R2 `tty_close` 归 **read**；R3 `tunnel_start` 归 **exec**；R4
`workspace-write`+`ask` 下 exec 类**维持逐次询问**。分类表是包内导出常量（`TTY_TIER_CLASS` /
`DOCKER_TIER_CLASS`），改格子就是改表 + 守卫测试两向对账仍绿。

其余与正文的偏差：

1. **kit API 收敛成 `attachTierGate(ctx, options)`**（正文 §4 草图是 `createTierGateListener`）：
   注册、注销与日志前缀都收在 kit，插件不再自己对 `ctx.on` 做 cast——宿主接触面只有一份。
   `options` 相应多了 `pkg`（日志前缀）与 `log`（测试注入）。
2. **`tierDenialReason` 增加可选 `cls`**：`exec` 类的 deny 文案补一句 bash 指路（正文 §2.4 的
   文案规矩本来就要求指路，草图签名漏了这个入参）。
3. **attach 的启动采样也要兜错**：正文只写了「服务未组合不闸」与「调用期解析抛错放行」；
   写用例时实测发现 `attachTierGate` 自己的启动采样在同一坏服务上同样会抛——attach 现在整体
   不抛（采样失败按「服务未组合」处理 + 告警），插件 `apply` 不可能被闸门带下去。
4. **调用期解析抛错的语义**（正文 §0 结论 3 的推广）：`resolve` / `overrideOf` 抛错按现状放行 +
   每次告警。理由：错误时无从判断宿主的真实松紧，宁可退化成引入前行为并出声，也不砖工具面；
   `ask` 本身在宿主侧永远 fail-closed，放行给 ask 的部分仍有人审兜着。
5. **分类表落点**：从插件 `apply()` 闭包**上移到模块级并导出**——守卫测试要与注册处名单两向
   对账，闭包里的常量测试够不着；落点变化不改变可见性语义。
6. **docker 守卫多一条交叉对账**：`write` 类必须注册在 `if (live.allowMutations)` 块内、`exec`
   类在 `if (live.allowExec)` 块内（按源码行号现算块归属）——防的是「新工具加错了静态开关组」，
   这是 docker 特有的第二层，tty 侧没有对应物。
7. **真机第一课（test profile，runtime 0.2.1-alpha.1）：插件作用域 `ctx.get('sandboxPolicy')`
   直接抛** `cannot get property "sandboxPolicy" without inject`——cordis 对插件读**未声明
   inject 的已注册服务**有守卫，`getService` 的结构化读取对服务名不成立（服务明明存在，抛错
   不是缺席）。修复：`attachTierGate` 改走 **`ctx.inject(['sandboxPolicy'/'approval'/
   `permissionPresets`], cb)`**（'tools' / 'credentials' 的既有可选服务通道；缺失时回调不
   触发）把服务实例捕获进 `TierServicesSnapshot`，逐次调用只用捕获的引用；`resolveSessionTier`
   的入参随之从 ctx 改为快照。服务是延迟启动的——捕获完成前闸保持「不闸」，捕获后打
   `tier-gate: <服务> composed` 并升到 `active`。真机复验：tty 与 docker 都打出
   `tier-gate: active`。
