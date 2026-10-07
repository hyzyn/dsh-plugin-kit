# 能力开关「就地提权」实施方案

> 执行对象：AI 代理。本文自包含，按 PR 顺序执行；每节末尾有可勾选验收项。
> **状态**：本方案各 PR 已全部落地——落点与门槛见 `ROADMAP.md` §5.1.1 与「§ 已完成」第 5 项，
> 编号见 kit D07–D12 / docker D141–D144 / tty D68–D72。**下文保留为设计依据与验收门槛，不是待执行
> 工单**（通篇的「可勾选验收项」是这份文档的体裁，不必再逐条勾）。
> 相对**已归档的 v1**（取回方式见 `docs/conventions.md` 的知识归属表）改了什么、为什么，见 **附录 A**（审阅先看那张表）。
>
> **一句话**：危险能力开关（`allowMutations` / `allowExec`）目前提权只认宿主启动环境变量 + 重启，
> 界面点不动。本方案加入**就地提权**：点开关 → 在宿主上执行一条 `touch` 命令 → 立即生效、免重启。
> 启动环境变量通道保留，并修好它的采样源与文案。

## 0. 威胁模型（先定对手，再谈方案）

| 对手 | 能力 | 现状（env 门） | v2 就地提权 |
|---|---|---|---|
| (a) 跨站页面 | 能发回环请求；浏览器不给它读响应 | 拦 | **拦** |
| (b) 页内脚本（第三方插件 `client.js` / XSS） | 同源：能读响应、能发任意请求，**不能写宿主文件** | 拦 | **拦** |
| (c) 本机同用户进程 | 能读自己发的响应、能读写本机文件、能读 tty | 拦（改不了已启动进程的环境变量） | **不拦（明确出模型）** |

三条结论，实现时不得违背：

1. **(c) 拦不住是"能点一下就开"这类方案的共同代价**——它本来就能直接跑 `docker`、读
   `~/.dsh/.credentials.yaml`。现状能拦它纯属"启动环境不可事后改写"这一个副作用，不是设计。
2. **必须把 (c) 写在明面上。** v1 的 §0 表格把文件通道写成能拦 (c)，这是错的：nonce 就在
   它**自己那次 `begin` 请求的响应**里，它 `touch` 一下即可完成授权——不需要任何带外行为。
   照 v1 实现，等于对外宣称了一个不成立的安全性质。
3. 想要"一键开 **且** 挡 (b)"，唯一出路是**OS 级同意**（宿主弹原生对话框，页内脚本点不到）：
   见 §9，本轮后置。**2026-10-07 立项复核**：这句话成立，但**必须是「宿主 spawn 对话框 + 答案
   从子进程读回」那个形态**——接到 `approval/request` 瀑布上会丢掉对 (b) 的防护。全文见
   [docs/os-consent-plan.md](./os-consent-plan.md)。

本方案新增通道要证明的就是：**HTTP 侧不能凭空把授权从 false 变成 true**——`begin` 之后，
必须有人在宿主文件系统上落一个带随机名的文件。

## 1. 不变量（任何 PR 不得破坏）

1. **提权凭据只在带外**：nonce 只出现在 `begin` 的 HTTP 响应里，消费它**必须**在宿主文件系统
   落地一个文件。nonce **不得**经 `ctx.logger` / `console` / 任何日志落盘（v1 的确认码通道就
   踩在这里，见附录 B）。
2. **grant 存储只有宿主进程写**：`<DSH home>/dsh-kit/capability-grants.json`，文件 0600、目录 0700、
   原子写（同目录 `<name>.<pid>.tmp` + `rename`）。
3. **一次性 + 时效**：nonce 单次消费（消费后立刻 `rm`）、TTL `300_000ms`；每个 capability
   同时最多 1 个 pending；`begin` 幂等——pending 期间重复调用返回**同一个** nonce 与命令、
   不消耗限流额度；每 capability 每小时最多 3 次新建。**不需要**确认码、`timingSafeEqual`、
   错误尝试计数（16 字节随机数不可猜）。
4. **只认精确路径**：探测与删除只针对**当前 pending 的那一个**路径；绝不扫目录、绝不删别的文件。
5. **降权零门槛**：`revoke` 与 `POST /config {allowX:false}` 不要求任何确认（紧急刹车不等重启）。
6. **授权变更由宿主重算生效（不依赖客户端补一刀）**：grant 成功与 revoke 成功后**都要**走
   `applySection({}, { forceRefreshTools: true })`——重算 `live` → `refreshTools()` → 必要时
   `closeAllStreams()`（与 D84 同一条路）。撤销侧不重算会留下"`*Granted=false` 但工具还开着"；
   **授权**侧不重算是它的对称坑——配置开关本来就是 `true`（用户早先打开、当时没授权，
   `live.allowMutations` 被折叠成 false），授权到了却没人重算，于是"开关亮着、工具不注册"。
   实现见 §3.3 的 `onGrantChange` 与 §4.2。
7. **环境变量通道只认启动快照的 `process` 层**：`launchEnvironmentOf(ctx).getFrom(name, ['process'])`，
   在插件 `apply()` 期绑定；`project-env` / `user-env`（`.env`）一律不算；配置里的 `true` 仍不算授权。
8. **`/elevate` 族的每一条路由都要求同源证明**：`MUTATION_SUBROUTES` 的判据是
   "**精确子路径** + `POST`"，所以三条子路径必须**逐条**列进去，且全部用 POST（含 `status`）。
9. **文案与注释不得再写"HTTP 侧只能关闭、不能打开"**（引入 `/elevate` 后为假）。正确表述：
   「HTTP 侧不能**凭空**打开——提权必须另有带外凭据」。
10. **客户端新增文案不含 `**` 字面量**（客户端没有 markdown 渲染器，见 PR3）。

## 2. 总体设计

```
用户点开关（未授权）
  → POST /elevate {capability}                       （要求同源证明；限流）
  → 宿主建 challenge：nonce = randomBytes(16).hex
      确保 <DSH home>/dsh-kit/grant-confirm/ 存在（0700）
      起一个 1s 定时器探测 <DSH home>/dsh-kit/grant-confirm/<nonce>（unref；插件卸载时清掉）
      → 200 {status:'pending', command:"touch '<path>'", expiresAt}
  → GUI 内联面板展示 command + 复制按钮 + 「执行后本开关自动解锁」
  → 用户去宿主终端粘贴执行
  → 宿主定时器发现文件 → rm 文件 → store.grant(env,'file') → 审计 → 清 challenge
  → GUI 轮询 POST /elevate/status（1.5s）拿到 granted
  → 自动 patch({allowX:true}) 完成用户原意图 → 开关生效（免重启）

有效值 = 配置值 && (启动快照授权 || grant 存储命中)
```

要点：
- 授权落在**宿主自有的 grant 存储**，不进 `cordis.patch.yml`（那里 HTTP 可写）；配置开关与宿主
  授权仍是两层，语义同现状。
- 探测**不依赖 GUI 轮询**（v1 把探测放在 `status()` 里，等于让免证明的 GET 承担状态变更）：
  定时器由 `begin` 起，面板关着也能解锁。

## 3. kit 侧（PR1）

### 3.1 新增 `packages/kit/src/grant-store.ts`

```ts
export interface CapabilityGrant { grantedAt: number; via: 'file' }
export class GrantStore {
  constructor(homeDir: string)          // 用 kit 的 dshHome()，不硬编码 ~/.dsh
  has(env: string): boolean             // 首次读盘并缓存；本进程写过的即时可见
  grant(env: string, via: 'file'): void // 更新缓存 + 原子写盘
  revoke(env: string): void             // 删记录 + 原子写盘
  source(env: string): CapabilityGrant | undefined
}
```

- 格式：`{"version":1,"grants":{"<ENV_NAME>":{"grantedAt":<unixSec>,"via":"file"}}}`
- 首次 `grant()` 前 `mkdir -p`，目录 0700；文件 0600；
- 读盘损坏（JSON 非法 / 非对象）→ 当空表 + `console.warn`，不抛错；
- 进程内缓存就是**实例字段**（不做 globalThis 钉扎）：两条来源要么不可变（启动环境快照），
  要么在写入那一刻同步落盘（grant 文件），所以 HMR 重新实例化只会读到同样的答案——钉扎解决
  不了任何真实问题，反而多一个全局状态。手工改文件不热生效（首查读盘后缓存），注释写明。

### 3.2 修改 `packages/kit/src/capability.ts`

- **新增** `bindCapabilitySources(ctx, grants?)`：在插件 `apply()` 期绑定两条通道的来源
  （`grants` 不传 = 本插件没有就地提权通道；docker 与 tty 都传了存储）。
  - 有 `ctx.get('launchEnvironment')`（即 `DSH_LAUNCH_ENVIRONMENT_KEY`，宿主在任何 config entry
    挂载前填入）→ 记下快照，查询时走 `slot.getFrom(env, ['process'])`——**只要启动继承层**；
  - 没有（老宿主 / 无宿主环境）→ 冻结一份 `process.env` 的**拷贝**（保持旧行为，不再现读）；
  - 解析出的原始值仍按 `TRUTHY`（`1/true/yes/on`）判定。
- `capabilityGranted(spec)` 语义改为：`grantStore.has(spec.env) || 启动快照授权`。
- **删掉** `const grants = new Map()` 与 `__resetCapabilityGrantsForTest()`：冻结状态现在由
  `captureCapabilityEnv` 建立，测试用**同一个公开 API**（传一个假 ctx）模拟，不再需要"生产代码
  不许调用"的注释式禁令。
- 文案：
  - `capabilityHowTo(spec)` → 「在**启动 dsh 的那个环境**里 `export <ENV>=1` 后重启宿主；
    也可以在本面板点开关就地确认（免重启）。注意写 `~/.dsh/env.yml` 或项目 `.env` **不算**授权。」
  - `capabilityDeniedMessage(spec)` → 保留"本机任意进程都能发回环请求"的论证，但结论改成
    「HTTP 侧不能**凭空**打开」，并同时给出两条路（就地确认 / 启动环境变量）。
- 文件头：**改掉**"约定 2"里"固定成启动快照之后，HTTP 侧无论怎么组合都拿不到授权"（引入
  `/elevate` 后为假），补一节「就地提权」说明 §0 的三个对手与各自的拦截情况。

### 3.3 新增 `packages/kit/src/elevation.ts`

```ts
export function createElevationManager(options: {
  confirmDir: string                    // capabilityPaths(dshHome()).confirmDir（<DSH home>/dsh-kit/grant-confirm）
  store: GrantStore
  logger: { info(m: string): void; warn(m: string): void }
  onGrantChange: (env: string, granted: boolean) => void   // 宿主重算回调（不变量 6）
  platform?: NodeJS.Platform            // 测试注入，缺省 process.platform
  now?: () => number
  ttlMs?: number                        // 缺省 300_000
}): {
  begin(cap: string): BeginResult       // {status:'granted',source} | {status:'pending',command,expiresAt,reused}
  status(cap: string): StatusResult     // {status:'none'|'pending'|'granted', expiresAt?, source?} —— 不回 nonce
  revoke(cap: string): void
  dispose(): void                       // 清所有定时器
}
```

- `begin`：已授权 → `{status:'granted'}`；有未过期 pending → 返回同一 nonce/命令（`reused:true`）；
  否则 `mkdir -p confirmDir`（0700）+ 新建 challenge + `setInterval(probe, 1000).unref()`。
- 命令按平台生成（路径用单引号包裹，路径来自 `<DSH home>`，不含用户输入）：
  - darwin / linux：`touch '<path>'`
  - win32：`powershell -NoProfile -Command "New-Item -ItemType File -Force '<path>' | Out-Null"`
- `probe`：`fs.access(path)` 成功 → `fs.rm(path)` → `store.grant(env,'file')` →
  `onGrantChange(env, true)` → 清 challenge → 审计 `grant`。过期 → 清 challenge + 清定时器 +
  审计 `expire`（若文件恰好存在则一并 `rm`）。
- `revoke`：`store.revoke(env)` → `onGrantChange(env, false)` → 审计 `revoke`。
- 审计行（**不含任何 secret**）：
  `[dsh-docker] elevation: <begin|grant|expire|revoke> capability=<env> via=file`
- 限流数据放内存（进程级）不持久化；命中 → 调用方回 429。
- 所有 `fs` 错误（目录建不出来 / 权限不足）→ `begin` 返回错误，由路由回 500 + 可读文案。

### 3.4 迁移现有调用方

`__resetCapabilityGrantsForTest` 有 6 处调用（`packages/kit/test/capability.test.ts`、
`packages/docker/test/{streams,tool-concurrency,config-route}.test.ts`、`packages/tty/test/proxy-command.test.ts`、
`packages/tty/scripts/proxycommand-smoke.mjs`）。全部改为 `bindCapabilitySources(fakeCtx)`：
`fakeCtx = { get: (name) => name === 'launchEnvironment' ? snapshotOf(values) : undefined }`。
**注意**：`proxycommand-smoke.mjs` 现在是 `process.env[X]='1'` + 清缓存；迁移后它也要用同一个 API
（它跑在 CI 且没有 `NODE_ENV`/`VITEST`），所以 v1 的"给 `__reset…` 加运行期 throw"不再需要——
直接没有这个函数了。

**验收（PR1）**
- [ ] store：读写 / 原子性 / mode 0600 与 0700 / 损坏容错 / 缓存与盘不一致时的取舍已注释说明
- [ ] `capabilityGranted`：快照命中、store 命中、都不命中三种来源；`TRUTHY` 白名单
- [ ] **快照来源正确性**：`user-env` / `project-env` 层有值但 `process` 层没有 → **不算授权**
- [ ] `captureCapabilityEnv` 未被调用时退回冻结的 `process.env` 拷贝（兼容路径）
- [ ] elevation：TTL 到期、幂等复用同一 nonce、每 capability 单 pending、每小时 3 次限流、
      file 单次消费（消费后文件消失）、只删自己那一个路径、`dispose()` 清定时器、审计行输出
- [ ] `packages/tty/scripts/proxycommand-smoke.mjs` 迁移后本地可跑通

## 4. docker 插件侧（PR2）

### 4.1 路由（`packages/docker/src/index.ts`）

- `apply()` 的**第一行**加 `captureCapabilityEnv(ctx)`（必须在 `normalizeConfig` 之前）；
- 三条新子路由（挂在与 `/config` 同层，**运行期禁用态仍可用**——授权是宿主级的）：

```
POST /api/dsh-docker/elevate         { capability } → begin 结果（限流命中 429）
POST /api/dsh-docker/elevate/status  { capability } → status 结果
POST /api/dsh-docker/elevate/revoke  { capability } → revoke（200，零确认）
```

- **三条全部**加入 `MUTATION_SUBROUTES`（`packages/docker/src/index.ts:289`）。该集合的判据是
  `req.method === 'POST' && MUTATION_SUBROUTES.has(sub)`（`:3054`）——精确子路径，不写进去就是裸的；
  `status` 用 POST 正是为了复用这一条判据（它虽然是读，但状态变更由定时器承担，不再需要"读接口
  顺手提权"）。
- capability 白名单：`allowMutations` / `allowExec`；未知值 400。
- 运行期禁用（`enabled:false`）时 `/config` 的例外（`:2859`）扩到 `/elevate` 族（`sub === '/config'
  || sub.startsWith('/elevate')`）。**注意**：启动时 `enabled:false` 会让 `apply()` 直接 return
  （`:783`），整个插件不挂载、连 `/config` 都没有——所以验收项要写"**运行期**禁用态"，不要写成
  "插件禁用态"（那会写出一个永真的测试）。

### 4.2 授权变更的生效路径（不变量 6）

建 elevation manager 时传 `onGrantChange: () => applySection({}, { forceRefreshTools: true })`。
`applySection`（`:1252`）重算 `normalizeConfig` → `capabilityGranted` 取到新值 → `live.allowMutations`
跟着变 → `refreshTools()` 与 `closeAllStreams()`（`:1266-1279`）自然触发。**grant 与 revoke 两侧共用
这一个回调**；不要改 `/config` 的路径，也不要让"客户端再 patch 一次"成为生效的必要条件。

### 4.3 快照（`snapshot()`，`:1015` 附近）

新增 `allowMutationsGrantSource` / `allowExecGrantSource`（取值 `'env'` / `'file'` / `null`）**与**
`allowMutationsConfigured` / `allowExecConfigured`（配置里**写着的**值，未与授权折叠）。
为什么两个都要：`allowMutations` 是**有效值**（配置 && 授权），拿它当界面状态就画不出
「配置开着但没授权」这个最容易被当成 bug 的状态（徽标、以及「点它到底该开还是该关」都靠它）。

### 4.4 `POST /config` 的 400 文案

改用 §3.2 的新文案；其余逻辑（校验在落盘前、降权直通）不动。`:2888-2893` 的注释同步改成
「HTTP 侧不能凭空打开」（不变量 9）。

**验收（PR2）**
- [ ] 三条路由无同源证明 → 403（逐条测，`status` 也要测）
- [ ] `begin` 幂等（第二次返回同一 nonce/命令且不耗额度）；1 小时内第 4 次新建 → 429
- [ ] 执行命令（测试里直接建文件）→ 轮询 `status` 到 granted → 快照 `*GrantSource='file'`
- [ ] `POST /config {allowMutations:true}` 已授权 → 200；未授权 → 400（新文案）
- [ ] `revoke` → `*Granted=false`、`*GrantSource=null`、**破坏档 agent 工具注销**、配置里的 `true` 未被改动
- [ ] **配置已是 `true` 时授权到达 → 破坏档工具立即注册**（不依赖客户端再 patch）——与上一条互为反向
- [ ] 运行期禁用 → `/elevate` 与 `/config` 可用、其余 403
- [ ] `packages/tty` 侧 `allowProxyCommand`：只加 `captureCapabilityEnv(ctx)`，其余不动（采纳本机制另立任务）

## 5. docker 客户端（PR3，`packages/docker/client-src/index.js`）

1. **点开关的语义（先分清三种状态）**：

   | 配置开关 | 宿主授权 | 点它发生什么 |
   |---|---|---|
   | `false` | 无 | 展开就地提权面板（主流程） |
   | `true` | 无 | 展开面板（**不是**关掉它）——面板顶行说明"配置早开着，但没获宿主授权，所以它没生效"，另给「先关掉配置」 |
   | `true` | `env` / `file` | 普通关闭（降权零门槛，立即生效）；**不**弹面板 |

   已授权时 `begin` 直接短路返回 `granted`：不建目录、不发 nonce、不起定时器。
2. **提权面板**（内联展开，不用 `confirm()`）：
   - 状态行：「安全闸门已锁定（这是刻意的）」+ 一句为什么（本机任意进程都能发回环请求）；
   - 主路径：`begin` 返回的 `command` 原文 + 复制按钮 + 「在宿主的终端里执行它，本开关会自动解锁」；
   - 6 分钟倒计时 + 「重新生成」（过期或面板重开时用）；`reused` 时不重置倒计时；
   - 折叠区「另一种方式（最强）」：`export <ENV>=1` + 重启宿主，并明说 `.env` / `env.yml` 不算授权；
   - 1.5s 轮询 `POST /elevate/status`；granted → 把开关写进表单，并在**表单本来是干净的**时
     自动保存一次（整表提交，脏表单下自动保存会把用户没打算提交的编辑一起写进去）；脏表单
     只提示「点保存生效」。真正生效靠宿主侧重算（不变量 6），不依赖这次保存。
3. **授权来源与撤销**：`*Granted === true && *GrantSource !== 'env'` 时，开关旁给「撤销宿主授权」
   文字按钮 → `POST /elevate/revoke` → 刷新本地状态（**不动配置开关**；`env` 来源不显示该按钮，
   因为它只能靠改启动环境撤销）。
4. **「未生效」徽标**：`form.allowX === true && !granted` 时显示「未生效：未获宿主授权」——
   这是最容易被当成 bug 的状态，必须有名字。
5. **文案瘦身**：现有 `hint.capabilityNotGranted` 长黄字拆成一行状态 + 折叠「怎么做」；zh/en 两份
   都改（新增 key 必须同步，`scripts/check-i18n.mjs` 要绿）。
6. **`**` 字面量清扫**（约 10 条，含 docker 6 / tty 2 / codegraph 2）：客户端无 markdown 渲染器，
   一律改纯文本；新增文案同样不含 `**`（不变量 10）。

### 5.1 「配置开着」时的流程（三种状态逐一走一遍）

**B. 配置 `true` + 未授权**（最容易被人当成 bug 的状态）

1. 打开卡片：开关视觉是**开**，旁边挂「未生效：未获宿主授权」徽标，状态行说明"宿主未授权，
   配置开着也不会执行"；若用户曾用环境变量授权，附一句"检查启动环境里
   `DSH_DOCKER_ALLOW_MUTATIONS` 是否还在"。
2. 用户点这个开关 → **不把它关掉**，展开提权面板；面板顶行解释来龙去脉：
   「这个开关是开着的，但宿主没有授权，所以它现在是关的；授权一次就会生效。」
   （用户点它想说的正是"我要它真的生效"，不是"帮我关掉"。）
3. 主路径同 §5 第 2 条：复制命令 → 宿主终端执行 → 1.5s 轮询。
4. 宿主侧一发现文件就重算（不变量 6）→ 破坏档工具**立即**注册；前端**不发** `patch`
   （配置已经是 `true`），只收起面板、去掉徽标、提示「已生效」。
5. 面板内次要按钮「先关掉配置」= 把配置置 `false`——给"我只是想让它别再显示未生效"的用户。

**C. 配置 `true` + 已授权（`env` / `file`）**

1. 卡片：开关开、无徽标；来源是 `file` 时给一行小字「授权来源：本机确认」+「撤销宿主授权」。
2. 点开关 = 普通关闭：`POST /config {allowMutations:false}` → 200（降权零门槛，不需要确认）→
   破坏档工具注销、在途流收束。**授权不动**——下次打开立即生效，不必再 touch 一遍
   （否则每次开关都要提权，等于把闸门变成噪音）。
3. 点「撤销宿主授权」= `POST /elevate/revoke` → **配置不动**，于是回到状态 B（开着的开关 + 徽标）；
   提示语写明"配置开关保持开着，重新授权后会立刻生效"。**撤销永不替用户改配置**——这就是
   `/config` 与 `/elevate` 的边界：只有用户点开关才写配置，只有带外动作才写授权。
4. 来源为 `env` 时不给撤销按钮，改为提示"由启动环境变量授权；撤销需在启动环境里去掉它并重启宿主"。
5. 重启宿主后 `file` 授权仍在（持久），开关自动有效，无需再次提权。

**验收（PR3）**
- [ ] 三种「开关状态」的点击行为各走查一次——尤其"配置开着但未授权"时点它**是展开面板、不是关掉**
- [ ] 手动走查两条路径（就地确认 / 环境变量）各一次，留截图或录屏
- [ ] 目录串（`': '` 后面那段）里 `\*\*` 清零：`grep -rnE "': '[^']*\*\*" packages/*/client-src/*.js` 无输出；
      并重建产物后确认**剩余 `**` 只落在注释里**（CSS 注释也会被打进 `client.js` 的字符串，所以
      「产物里 grep 不到 `**`」是做不到的标准，别照抄）
- [ ] 未授权且未点击时，设置卡片不再出现长黄字
- [ ] `node scripts/check-i18n.mjs` 通过

## 6. 文档与台账（PR4）

- `docs/architecture.md` §7：补「就地提权」段（一条带外通道、`/elevate` 要求证明、grant 存储位置、
  撤销语义、`/config` 恢复入口不变），并把"HTTP 侧只能关闭不能打开"改成"不能凭空打开"；
- `packages/docker/README.md` / `README.en.md`、`packages/kit/README.md`：开关的两种授权方式；
- `packages/tty/README.md`：只标注"`allowProxyCommand` 沿用同一宿主授权机制（就地提权暂未接入）"；
- **台账（本仓硬规矩，v1 漏了）**：每个修复都要在对应 `DEFECTS.md` 索引表**追加一行**（不重排、
  不改历史编号）：
  - `packages/docker/DEFECTS.md`：从 **D141** 开始；
  - `packages/kit/DEFECTS.md`：从 **D07** 开始（D01–D05 是转入镜像、D06 起是本包自研）；
  - 同步 `docs/conventions.md` 的编号范围表（`D01`–`D140` → `D01`–`D141` 等）——
    `scripts/defects-table.mjs` 会红，这正是它的用途；
  - 修复点按维护规则在**代码注释里落编号**。
- `ROADMAP.md`：把原「终端票据」条目标为已落地（本方案即其实现，形态从"一次性票据"收敛为
  "nonce 文件"）。
- 本方案文档是**执行用文档**：实施完成后删除或归档，不要留在 `docs/` 里当长期文档。

## 7. 宿主级验收（并入 `scripts/test/live-profile.test.ts` 风格）

- **A1** 未授权 → `begin` → 执行命令（测试里直接 `writeFileSync`）→ 轮询 `status` → granted →
  `POST /config {allowMutations:true}` → 200 → 破坏档 agent 工具出现；
- **A2** 幂等与限流：pending 期间重复 `begin` 返回同一 nonce；1 小时内第 4 次 → 429；
- **A3** nonce 单次消费：文件被 `rm`；再次 `status` 不复活；过期后文件被清理；
- **A4** `revoke` → `*Granted=false` → 破坏档工具注销；`POST /config {false}` 依旧 200；
- **A5** **负向性质测试**（本方案的核心断言）：不带同源证明 → 403；带证明但**不碰文件系统**的
  任意 HTTP 序列（含 `begin`/`status`/`revoke` 的各种顺序与重复）都无法让 `*Granted` 变 true；
- **A6** 启动环境变量路径回归：`captureCapabilityEnv` 走真宿主快照时 `*GrantSource='env'`；
  既有断言全绿不回退。**刻意不测** env 插件写 `env.yml` 后生效——那正是被修掉的行为（不变量 7）。

## 8. PR 切分与顺序

| PR | 内容 | 依赖 |
|---|---|---|
| PR1 | kit：grant-store + capability 改造（快照源）+ elevation + 6 处调用方迁移 + 单测 | — |
| PR2 | docker：三条 `/elevate` 路由 + 撤销生效路径 + 快照字段 + 文案 + 路由测试；tty 只加一行绑定 | PR1 |
| PR3 | docker client：就地提权面板 + 徽标 + 撤销 + 文案瘦身 + `**` 清扫（含产物） | PR2 |
| PR4 | 文档四处 + 台账行 + 编号表同步 + 验收脚本 A1–A6 | PR2 |

## 9. 明确不做（本方案范围外）

- **确认码通道**（宿主终端打印 8 位码）——见附录 B：它带来的覆盖是边角，带来的是日志落盘风险；
- **OS 级同意**（macOS `osascript` / Windows PowerShell / Linux polkit）：这是"一键开且挡 (b)"的
  唯一正解，值得单独立项；
  > **2026-10-07 立项，结论见 [docs/os-consent-plan.md](./os-consent-plan.md)**（§9 已转成那一份）。
  > 上面那句判断**成立**，但**只在一个形态下成立**，而这里必须把那条约束一起写下来——否则做的人
  > 会走到一个看着最自然、却把 (b) 的防护**静默丢掉**的形态上：
  >
  > - **成立的形态**：对话框由**宿主进程自己 spawn**，用户的选择从**子进程的退出码 / stdout**
  >   读回。宿主自带的 directory-picker 就是这个形态
  >   （`dsh-host-directory-picker-native` 把答案从 `.stdout` 与 `code === 1` 读出，**不经过页面**）。
  > - **危险的那个形态**：把对话框接到宿主现成的 `approval/request` 瀑布上。它会丢掉防护——
  >   那条瀑布**今天的答案由页面给出**（`dsh-client-ui-approval` 的 `ctx.remote.$on('approval/request', …)`），
  >   而第三方插件的 client 半体与宿主 UI **同处一个 JS realm**（同源 classic script，无 iframe），
  >   于是页内脚本能先于官方面板回答、或直接向 `$events/result` POST 一个伪结果。
  > - 三个平台的差异、超时与降级路径、以及「(b) 今天**已经被挡住**，本项买的是 UX 不是安全等级」
  >   这条定位，都在那一份里（含它 §2.1 的逐条实测与 §3 的守卫清单）。
  >
  > 简言之：**§9 没写错，但它少了一句实现约束**，而缺了那句就会做成形态 A。
- 会话门加到变更端点（把启动 token 会话作为 mutation 端点的额外要求）——需要 DSH 核心把会话信息
  暴露给插件路由，跨仓；
- 动作分级（remove/prune/exec 走维护窗口或逐次确认）；
- 授权有效期（v1 为持久，直到撤销）；per-target 授权；
- env 卡片「插件能力开关」预置分组（`packages/env` client）；
- tty 的 `allowProxyCommand` 接入就地提权；**（2026-09-26 已做，见附录 D）**
- `dockerBin` 校验收紧、`hostKeysRemove` 审计（相邻风险）。

## 10. 最终验收清单

- [ ] 未授权点开关 → 面板给出命令 → 在宿主执行 → **十秒内免重启生效**
- [ ] 不变量 1 自查：任何 HTTP 序列（不碰文件系统）都无法使 `*Granted` 变 true（A5）
- [ ] 降权随时可用；撤销不需要确认，且**立即**注销工具、收掉在途流
- [ ] 启动环境变量旧路径不回退；文案不再推荐 `env.yml`，且明说 `.env` 不算
- [ ] 授权来源（`env` / `file`）在快照里可查，界面对"未生效"有明确徽标
- [ ] 全部审计事件落日志（不含 secret）；`**` 字面量在源码与产物中清零；zh/en 文案齐
- [ ] kit / docker 单测 + 宿主级验收 A1–A6 全绿；`node scripts/defects-table.mjs` 与
      `node scripts/check-doc-links.mjs` 绿；台账与编号表同步

---

## 附录 A：v1 九处问题 → v2 处置

| # | v1 的问题 | v2 处置 |
|---|---|---|
| F1 | 文件通道对"能读自己响应的本机进程"无效；§0 表格断言错误 | §0 重写：把 (c) 明确列为不拦（不变量 1 也写清 nonce 的去向）。**不删通道**——它挡 (a)(b) 成立，只是不许再宣称挡 (c) |
| F2 | "HTTP 侧只能关闭、不能打开"引入 `/elevate` 后为假；`capabilityHowTo` 推荐 `env.yml`（不在启动快照里） | 不变量 9 + §3.2：改文案、改 `capability.ts` 文件头与 docker `:2888` 注释，删掉 `env.yml` 推荐 |
| F3 | revoke 无生效路径，验收却断言工具注销 | 不变量 6 + §4.2：显式 `applySection({}, { forceRefreshTools: true })` |
| F4 | `/elevate` 四个子路径只有第一个受同源证明覆盖；`status` 是 GET 还承担探测 | 不变量 8 + §4.1：三条**全 POST**、**逐条**进 `MUTATION_SUBROUTES`；探测改由 `begin` 的定时器承担（§2、§3.3） |
| F5 | 确认码用 `logger.info` 发 → 会进宿主消息缓冲、随启动失败报告落盘 | 附录 B：**砍掉确认码通道**，风险整类消失。不变量 1 同时禁止 nonce 经日志 |
| F6 | "插件禁用态 `/elevate` 可用"只在运行期禁用时成立 | §4.1 明确"**运行期**禁用态"，并说明启动时禁用插件根本不挂载 |
| F7 | 漏了台账行与编号表同步、`**` 清扫未覆盖构建产物 | §6 列出 docker **D141** / kit **D07** 起的新行与 `docs/conventions.md` 同步；PR3 验收加产物 grep |
| F8 | 体量：两条通道 + 轮询 + 持久 grant，为一个 UX 目标 | §3.3/§4/§5 收敛为**一条**通道、**三条**路由；UX 侧的"一键开"诉求改为标出正解（§9 OS 级同意） |
| F9 | `__resetCapabilityGrantsForTest` 加 throw 会打断 `proxycommand-smoke.mjs` | §3.2/§3.4：删掉该函数，测试与脚本改用公开的 `bindCapabilitySources(fakeCtx)` |

## 附录 B：为什么砍掉确认码通道

v1 打算同时提供"宿主终端打印 8 位码"与"touch 文件"两条路。v2 只留后者：

1. **覆盖是边角的**：码路能用的场景是"用户看得见宿主 stdout **但**不能执行 shell"；
   文件路能用的场景是"用户能执行 shell"——后者在所有真实场景里都成立（本机终端、SSH、
   终端面板），且宿主被 launcher / 桌面壳 / systemd 启动（stdout 不可见）时**只有**文件路能用。
2. **风险是整类的**：在 DSH 里 `ctx.logger` 不是 tty——插件日志进宿主消息缓冲，而这份缓冲会随
   启动失败报告写进 `<DSH home>/logs/startup-*.log`（0600，同用户可读；写作代码见 dsh 的
   `lib/bin.js` → `reportStartupFailure`）。要发码就必须走 stdout/日志，于是必须额外规定
   "码不得经 logger"并常年守护这条规定；砍掉通道，这一整类问题消失。
3. **机制少一半**：码路带 8 位码生成、`timingSafeEqual`、5 次错误锁定、倒计时 UI；文件路带
   nonce 目录、探测、单次消费。只留一条，比两条各写一遍更不容易出错。

---

## 附录 C：实施记录（与本文的偏差）

执行时按代码实际情况调整了四处，其余照做：

1. **API 名**：`captureCapabilityEnv(ctx)` → `bindCapabilitySources(ctx, grants?)`。绑定要一起交出
   「带外授权存储」，只叫 capture 会把两件事说成一件。
2. **不做 globalThis 钉扎**（见 §3.1）：两条来源要么不可变、要么同步落盘，钉扎没有真实收益。
3. **环境变量那条通道顺手修了采样源**（kit D07）：从 `process.env` 现读改成宿主启动快照的
   `process` 层。这是 §1 不变量 7 的落地，但它同时**改变了一条既有行为**——`.env` / `env.yml`
   从此明确不算授权（旧文案推荐的那条路本来就不可靠）。
4. **客户端是「保存制」卡片**：原来的 `patch({allowX:true})` 只是改本地表单，真正的写入在
   `save()`。所以授权成功后按「表单干不干净」决定自动保存还是提示用户点保存——整表提交下，
   脏表单里自动保存会静默写入用户没打算提交的编辑。
5. **另记四条缺陷编号**（本仓规矩）：docker `D141`（折叠值当重算输入 → 半个状态）、
   `D142`（快照缺配置值与授权来源）、`D143`（客户端 6 处字面 `**`）、`D144`（`/elevate` 族的
   同源证明要逐条覆盖，且分发必须在证明检查之后）；tty `D68`、codegraph `CG64`（同「字面 `**`」）、
   kit `D07`（采样源与 env.yml 文案）。

### 复核追加（2026-09-26，评审后）

6. **落点收到 kit 自己的一级子目录**（kit `D08`）：`<DSH home>/capability-grants.json` 与
   `<DSH home>/grant-confirm/` → `<DSH home>/dsh-kit/capability-grants.json` 与
   `<DSH home>/dsh-kit/grant-confirm/`。DSH 主目录是所有所有者共用的平铺目录（官方 `sessions/`
   `storages/`，本仓 `tty/` `rss-digest/`），而这两个名字描述的是**机制**、不带所有者，等于替
   「集中式能力同意存储」预设占用者。路径收进 kit 的 `capabilityPaths()` **只拼一次**（原先存储
   自己拼文件名、插件自己 `join(dshHome(),'grant-confirm')`）。同时改：授权文件权限归 kit 目录
   自己（不再去动 DSH 主目录的权限）。**对外无需迁移**（该路径从未发布过）；本机开发期已积下一份授权
   （改动前的构建写下的），就地 `mv` 到新目录即可——已办（2026-09-26）。
7. **持久授权的可见性**（kit `D09`）：补 `auditLoadedGrants()`（启动期逐条打
   `elevation: load capability=… via=file grantedAt=…`）、`capabilityGrantAt()`、快照
   `*GrantedAt`、卡片上每个能力自己那行的「已授权 · YYYY-MM-DD HH:mm:ss」。原因是带外授权**持久生效且重启后不再确认**，而原有的四条
   审计只覆盖 `begin/grant/expire/revoke`——**载入不在内**，于是「上个月授权的能力今天一开机就
   开着」在日志和界面上都查不到。
8. **三条边界刻意不修**（决策留档）：① 运行期改 / 删授权文件不生效（要重启才读到）——删文件当
   撤销是容易误以为生效的一侧，界面上的「撤销宿主授权」才是正路；② 授权记录的 key 是裸环境变量名、
   不含插件身份；③ 没有「仅本次运行有效」档位（TTL / boot 计数）。三条都写进了
   `packages/kit/src/grant-store.ts` 的「已知限制」与 ROADMAP §5.1.1。

### 还没做的（需真机 / 需你确认）

- **§7 的宿主级 A1–A6**：本轮把它们实现成了 vitest 路由级用例（`packages/docker/test/elevate-route.test.ts`，
  A1–A5 逐条对上；A6「启动环境变量路径不回退」由既有 `config-route.test.ts` / `streams.test.ts` 覆盖）。
  **真机版**（起真宿主、走真 GUI、断言真工具注册）还没加进 `scripts/live-host-smoke.mjs`——
  写一条我在这里验证不了的脚本步骤，风险大于收益。
- **§5 的手动走查（截图 / 录屏）**：需要有人在浏览器里点一遍（开关 → 命令 → 解锁 → 撤销 → 徽标）。
  本机没有可驱动的宿主 + GUI（`scripts/verify-client-ui.mjs` 要一个 link 到仓库的 profile 与 token）。
- **OS 级同意**（原生对话框 / polkit）：这才是"一键开且挡住页内脚本"的正解，见 §9
  ——**2026-10-07 已立项**，[docs/os-consent-plan.md](./os-consent-plan.md) 给出了成立的形态
  （宿主 spawn + 答案从子进程读回）与危险的形态（接到 `approval/request` 上）。

## 附录 D：tty 接入第二条通道（2026-09-27 自 ROADMAP §5.1.1 逐字搬入）

搬运说明：ROADMAP 的职责是「落点 + 门槛」，机制推演与取舍归本文件。下面这段原先在
`ROADMAP.md` §5.1.1 里，按这次的分工口径**逐字**搬到这里（ROADMAP 侧只留落点与编号）。

- **tty 也接上了第二条通道**（2026-09-26，同一属性补齐）：`allowProxyCommand`（唯一「配置里写一行
  就在本机跑命令」的开关）此前只有环境变量通道，同一个 GUI 里两套规则没人记得住。宿主侧几乎白送
  （kit 已备齐 `capabilityPaths` / `GrantStore` / `createElevationManager` / `auditLoadedGrants` /
  `capabilityGrantAt`），三条 `/elevate` 路由逐条进 `MUTATION_SUBROUTES`（docker D144 的教训）；
  卡片面板**在 tty 客户端另写一份**——仓规硬规矩 1 明令插件之间不许互相 import（`kit` 是宿主半体
  库），能在浏览器侧共享的通道只有宿主服务本身。顺带挖出两个真缺陷：**tty D69**（挂载插件的用例
  会读开发机上真实的授权文件 → 开发机红、CI 绿的脆测试，已抽 `test/isolated-home.ts` 隔离）、
  **tty D70**（闸门只在 `applyPatch` 里初始化，而启动期 `applyPatch` 只在「settings 存过东西」时
  才跑 → 「配置写着 true + 已授权 + 重启」停在默认拒绝上，正是本仓最忌讳的「配了没反应」）。
