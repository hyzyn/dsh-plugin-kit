# 能力开关「就地提权」实施方案（Elevation）

> 执行对象：AI 代理。本文自包含，按 PR 顺序执行；每节末尾有可勾选验收项。
> 背景见 `packages/kit/src/capability.ts` 文件头、`docs/architecture.md` §7、
> 外部评审文档《能力开关-设计问题》（2026-09-26）。
>
> **一句话**：危险能力开关（`allowMutations` / `allowExec` / `allowProxyCommand`）目前提权只认
> 宿主环境变量 + 重启，界面点不动。本方案加入**就地提权**：点开关 → 宿主终端确认码或
> touch 授权文件 → 立即生效、免重启；环境变量通道保留不动。

## 0. 威胁模型与设计原理（执行时不可违背）

拦截对象：**本机盲发进程**（能发回环 HTTP、读不到响应/文件）、**跨站页面**、**被拿下的 renderer（XSS）**。
同用户全权进程不在模型内。

核心原理：点击 = HTTP 请求，盲发进程也能发；XSS 能模拟任何页面操作。所以授权的
**最后一公里必须经过浏览器-HTTP 之外的通道**，本方案用两条：

| 通道 | 盲发进程 | XSS | 用法 |
|---|---|---|---|
| 宿主终端（确认码） | 读不到宿主 stdout | 读不到 | 宿主打印 8 位码，用户抄进 GUI |
| 文件系统（nonce 文件） | 写不了文件、读不到 nonce | 读得到 nonce 但造不了文件 | GUI 给出 `touch` 命令，用户执行 |

用户点「开启」只是**发起**授权；授权成立的凭据只能来自上述通道。HTTP 侧永远不能
凭空把授权从 false 变 true。

## 1. 不变量（任何 PR 不得破坏）

1. **提权凭据只在带外**：确认码只出现在宿主终端 stdout，绝不经任何 HTTP 响应返回；
   nonce 只出现在 HTTP 响应里，但消费它需要磁盘写。
2. **Grant 存储只有宿主进程写**：`~/.dsh/capability-grants.json`，mode 0600，原子写（tmp+rename）。
3. **一次性 + 时效**：确认码/nonce 单次消费，TTL 60s；每 capability 全局最多 1 个 pending；
   每 capability 每小时最多 3 次 begin；每次 challenge 最多 5 次 confirm 尝试，超则作废。
4. **降权零门槛**：`revoke` 与 `POST /config {allowX:false}` 不需要任何确认（紧急刹车不等重启）。
5. **env 采样语义不变**：进程内采样一次（新增 globalThis 钉扎，见 §3.3）；配置里的 `true` 仍不算授权。
6. **`/config` 恢复入口语义不变**：仍免同源证明、仍只能降不能升（400 文案更新为「就地确认或环境变量」两条路）。
7. **`/elevate` 必须要求同源证明**：加入 `MUTATION_SUBROUTES`（它不是恢复入口）。
8. **确认码比较用 `crypto.timingSafeEqual`**；nonce 用 `crypto.randomBytes(16).toString('hex')`。

## 2. 总体设计

```
用户点开关（未授权）
  → POST /elevate {capability}                    （要求同源证明；限流）
  → 宿主创建 challenge（默认 terminal-code，可选 file）
      terminal-code：logger.info 打印 8 位码到宿主终端
      file：返回 touch 命令（按 process.platform 生成），GUI 展示 + 复制按钮
  → GUI 轮询 GET /elevate/status（1.5s）
      terminal-code：用户抄码 → POST /elevate/confirm {code} → timingSafeEqual
      file：宿主 pending 期间每 500ms 探测文件 → 存在即消费（删文件）
  → 成功：写 capability-grants.json → 清 challenge → 审计日志
  → capabilityGranted(spec) = env采样(一次) || grantStore 命中
  → 下一次 status 轮询拿到 granted → GUI 自动 patch({allowX:true}) → 开关生效
```

数据流要点：授权落在宿主自有的 grant 存储（**不进 `cordis.patch.yml`**，那里 HTTP 可写）；
配置开关与宿主授权仍是两层，语义同现状（有效值 = 配置值 && 已授权）。

## 3. kit 侧（PR1）

### 3.1 新增 `packages/kit/src/grant-store.ts`

```ts
export interface CapabilityGrant { grantedAt: number; via: 'file' | 'terminal-code' }
export class GrantStore {
  // 文件：~/.dsh/capability-grants.json（homeDir 注入，便于测试）
  // {"version":1,"grants":{"<ENV_NAME>":{"grantedAt":<unixSec>,"via":"terminal-code"}}}
  constructor(homeDir: string)
  has(env: string): boolean          // 首查读盘并缓存；本进程写过的即时可见
  grant(env: string, via: 'file' | 'terminal-code'): void   // 更新缓存 + 原子写盘
  revoke(env: string): void          // 删记录 + 原子写盘
  source(env: string): CapabilityGrant | undefined
  __resetForTest(): void
}
```

- 首次 `grant()` 前 `mkdir -p ~/.dsh`（已有则忽略），文件 mode 0600，目录 0700；
- 原子写：同目录 `.<name>.<pid>.tmp` + `rename`；
- 读盘损坏（JSON 非法 / 非对象）→ 当空表并 `console.warn`，不抛错；
- 进程内缓存写在 `globalThis[Symbol.for('dsh.kit.capability.state')]`（与 §3.3 共用），
  防 HMR/双实例重采样——**这是安全不变量，不是优化**。手工改文件不热生效，注释写明。

### 3.2 新增 `packages/kit/src/elevation.ts`

```ts
export interface ElevationSpec { env: string; label: string }
export function createElevationManager(options: {
  homeDir: string
  store: GrantStore
  logger: { info(m: string): void; warn(m: string): void }
  platform?: NodeJS.Platform          // 测试注入，缺省 process.platform
  now?: () => number
}): {
  begin(cap: string, method?: 'terminal-code' | 'file'): BeginResult   // 见下
  confirm(cap: string, code: string): 'granted' | 'invalid' | 'expired' | 'locked'
  status(cap: string): { status: 'none' | 'pending' | 'granted'; method?; expiresAt?; source? }
  revoke(cap: string): void
}
```

行为细则：

- `begin`：已授权 → `{ status:'granted', source }`；有未过期 pending → `{ status:'pending', … }`（幂等，不新建）；
  否则新建 challenge：TTL 60_000ms，码 = 8 位 Crockford Base32（去掉易混字符），
  `logger.info('[dsh-docker] 授权确认码：XXXX-XXXX（60 秒内有效；如非本人操作请忽略）')`；
  file 方法生成 `~/.dsh/grant-confirm/<nonce>` 目标路径并确保目录存在（0700）；
  按 platform 预生成命令：darwin/linux → `touch '<path>'`；win32 → `powershell -NoProfile -Command "New-Item -ItemType File -Force '<path>' | Out-Null"`。
- file 方法的探测放在 `status()` 调用里（每 ≤500ms 一次即可，无需常驻 watcher）：
  文件存在 → `fs.rm` 该文件 → `store.grant(env,'file')` → 清 challenge → 审计。
- `confirm`：无效码计一次尝试，5 次后 challenge 作废；成功 → `store.grant(env,'terminal-code')` + 审计。
- 限流数据放内存（进程级），不持久化。
- 所有 grant / revoke / 过期 / 作废都产出一行结构化审计日志：
  `[dsh-docker] elevation: <grant|revoke|expire|reject> capability=<env> via=<...>`

### 3.3 修改 `packages/kit/src/capability.ts`

- `capabilityGranted(spec)` 语义改为：`envSampleOnce(spec) || grantStore.has(spec.env)`；
  两个缓存都挂到 §3.1 的 globalThis 符号上；
- `__resetCapabilityGrantsForTest` 同步清 grant store 缓存，并加运行期守卫：
  非 `process.env.NODE_ENV === 'test'`（或 `process.env.VITEST`）调用即 throw——把「生产不许调用」从注释变机制；
- `capabilityDeniedMessage` 文案更新，两条路并列：
  「…可在面板就地确认（点开关后按提示操作），或在宿主侧设置环境变量 <ENV>=1 并重启宿主。」
  `capabilityHowTo` 同步；保留「HTTP 侧只能关闭、不能打开」的表述（对 HTTP 仍然成立）；
- 文件头注释补一段「就地提权」小节，说明为什么两条带外通道满足 §0 威胁模型。

**验收（PR1）**：kit 单测覆盖——store 读写/原子性/mode/损坏容错；`granted = env || store` 两种来源；globalThis 钉扎（删除模块缓存后状态仍在）；elevation 的 TTL、单 pending、限流、5 次尝试锁定、码一次性、file 单次消费、审计行输出。

## 4. docker 插件侧（PR2）

### 4.1 路由（`packages/docker/src/index.ts`）

- `CAP_MUTATIONS` / `CAP_EXEC` 旁创建 elevation manager（复用插件的 logger）；
- `'/elevate'` 加入 `MUTATION_SUBROUTES`（同源证明要求）；
- 新子路由（挂在与 `/config` 同层，禁用态**仍可用**——授权是宿主级的；若现有禁用检查在子路由分发之前，为 `/elevate` 开例外）：

```
POST /api/dsh-docker/elevate         { capability, method? } → §3.2 begin 的结果
POST /api/dsh-docker/elevate/confirm { capability, code }    → confirm 结果（400 带 reason）
GET  /api/dsh-docker/elevate/status?capability=…             → status 结果
POST /api/dsh-docker/elevate/revoke  { capability }          → revoke（200，零确认）
```

- capability 白名单：`allowMutations` / `allowExec`，未知值 400；
- begin/confirm 限流命中 → 429。

### 4.2 快照（`snapshot()`）

新增两字段：`allowMutationsGrantSource` / `allowExecGrantSource`，取值 `'env' | 'file' | 'terminal-code' | null`
（env 采样为真 → `'env'`；store 命中 → 实际 via；否则 null）。`*Granted` 语义不变。

### 4.3 `POST /config` 的 400 文案

改用 §3.3 新文案（就地确认优先提及）。其余逻辑（校验在落盘前、降权直通）不动。

**验收（PR2）**：路由测试——无证明 403；begin 幂等/限流 429；confirm 正确码 granted 且快照 source 正确；
错码 5 次锁定；file 探测消费后文件删除；revoke 后 `*Granted=false` 且破坏档工具注销（`refreshTools` 触发）；
`/config {allowX:true}` 未授权仍 400（新文案）；插件禁用态 `/elevate` 可用。

## 5. docker 客户端（PR3，`packages/docker/client-src/index.js`）

1. **复选框不再 disabled**。未授权时点击 → 展开就地提权面板（内联，不用 `confirm()`）：
   - 默认「终端确认码」标签页：说明文案 + 8 位码输入框 + 确认按钮 + 60s 倒计时；
   - 「授权文件」标签页：展示 begin 返回的 `command` + 复制按钮 + 「执行后本开关自动解锁」；
   - 折叠的「环境变量 + 重启」路径（保留现有文案，服务 headless / 自动化部署）；
   - pending 期间每 1.5s 轮询 status；granted → 自动 `patch({allowX:true})` 完成用户意图 + 成功提示；
   - 过期/作废 → 面板显示原因 + 「重新开始」按钮。
2. **授权来源与撤销**：`*Granted === true` 且 `*GrantSource !== 'env'` 时，开关旁显示
   「撤销宿主授权」文字按钮 → `POST /elevate/revoke` → 本地状态刷新（配置开关不动）。
3. **「未生效」徽标**：`form.allowX === true && !granted` 时（配置开着但未授权），开关旁加显眼徽标
   「未生效：未获宿主授权」——这是最容易被当成 bug 的状态，必须有名字。
4. **文案瘦身（第零类）**：现有 `hint.capabilityNotGranted` 长黄字拆成一行状态 + 折叠「怎么做」；
   状态行给足语境（「安全闸门已锁定，这是刻意的」）。zh/en 两份都改（i18n key 同步加）。
5. **`**` 字面量清扫**：全仓 client 文案 grep `\*\*`（约 10 条，含 env/tty 等包），客户端无
   markdown 渲染器，一律去掉星号改纯文本。逐条列出改动的 key。

**验收（PR3）**：手动走查三条路径（码 / 文件 / env）各一次的截图或录屏；`**` 清扫后全仓 client 无残留
（`grep -rn '\*\*' packages/*/client-src` 仅剩注释）；未点击任何东西时设置卡片不再出现长黄字。

## 6. 文档（PR4）

- `docs/architecture.md` §7 第 2 条：补「就地提权」段——两条带外通道、/elevate 要求证明、
  grant 存储位置、`/config` 恢复入口语义不变；
- `packages/docker/README.md` / `README.en.md`、`packages/kit` 对应 README：开关的三种授权方式；
- `packages/tty`：只在 README 标注「`allowProxyCommand` 采纳同一机制，见 PR5（暂缓）」，本方案不改 tty 代码。

## 7. 验收扩展（并入 `scripts/test/live-profile.test.ts` 风格的宿主级测试）

- A1 未授权 → begin → 从宿主 stdout 解析确认码 → confirm → 快照 granted → `POST /config {allowMutations:true}` → 200 → 破坏档 agent 工具出现；
- A2 错码 ×5 → confirm 拒绝；重新 begin 正常；
- A3 file 方法：begin → touch → status 轮询 granted → nonce 文件已被宿主删除；
- A4 revoke → granted=false → 破坏档工具注销；`POST /config {false}` 依旧 200；
- A5 无同源证明的 `/elevate` → 403；1 小时内第 4 次 begin → 429；
- A6 env + 重启路径回归（既有 18 条断言全绿不回退）——**这条同时检验 env 插件先于 docker 插件
  apply 的顺序假设**；若在测试环境稳定失败，停下上报（已知风险：启动顺序竞态，见评审文档）。

## 8. PR 切分与顺序

| PR | 内容 | 依赖 |
|---|---|---|
| PR1 | kit：grant-store + elevation + capability 扩展 + globalThis 钉扎 + 单测 | — |
| PR2 | docker：/elevate 四条路由 + 快照字段 + 文案 + 路由测试 | PR1 |
| PR3 | docker client：就地提权 UI + 徽标 + 撤销 + 文案瘦身 + `**` 全仓清扫 | PR2 |
| PR4 | 文档四处 + 验收脚本扩展（A1–A6） | PR2 |

## 9. 明确不做（本方案范围外，另立任务）

- 会话门加到变更端点（把启动 token 会话作为 mutation 端点的额外要求）——需要 DSH 核心把会话
  信息暴露给插件路由，跨仓；
- 动作分级（remove/prune/exec 走维护窗口或逐次确认）；
- 授权有效期（当前 v1 为持久，直到撤销）；per-target 授权；
- env 卡片「插件能力开关」预置分组（packages/env client）；
- tty 的 `allowProxyCommand` 采纳同一 elevation 机制；
- `dockerBin` 校验收紧、`hostKeysRemove` 审计（评审发现的相邻风险）；
- WebAuthn / OS 级同意（Touch ID helper、polkit）。

## 10. 最终验收清单

- [ ] 未授权点开关 → 面板就地确认 → 十秒内免重启生效（码与文件两条路都通）
- [ ] 盲发进程模型自查：任何 HTTP 序列（无带外凭据）无法使 `*Granted` 变 true
- [ ] 降权随时可用；撤销不需要确认
- [ ] env + 重启旧路径不回退；headless（无 TTY 的守护态）退回文件/env 路径可用
- [ ] 全部审计事件落日志；`**` 字面量清零；zh/en 文案齐
- [ ] kit / docker 单测 + 宿主级验收 A1–A6 全绿
