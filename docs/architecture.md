# 架构：12 个包怎么组成一个 DSH 插件全家桶

> **本文是「12 个包关系与协作」的唯一归宿。** 包内功能见各包 README；规矩见
> [conventions.md](./conventions.md)；术语见 [glossary.md](./glossary.md)。
>
> 判据：**「改一个包就能说清」→ 写进包 README；「要跨 ≥2 个包才说得清」→ 写进本文。**
> 所以本文只讲**边界与依赖**，不重复任何单包功能。

## 1. 一句话构成

```
@hyzyn/dsh-kit            ← 共享库（唯一的非插件包，无 cordis.patch.yml）
    ↑ 被下面 9 个插件依赖（`kit-settings` 是唯一例外，见 §2）
@hyzyn/dsh-<插件> ×10     ← 功能插件（各有自己的托管区块 / 配置 / 客户端半体）
    ↑ 被聚合
@hyzyn/dsh-all            ← 聚合安装包（一条 bundle patch 挂载上面 10 个）
```

仓库根 `package.json` 本身也是一个 bundle，`dsh plugin add link:$(pwd)` 等价于装 `dsh-all`。

## 2. 包清单

| 包 | 类型 | 干什么（一句话） | 文档 |
|---|---|---|---|
| `@hyzyn/dsh-kit` | **库** | 宿主半体共享工具：HTTP 回环围栏、托管区块读写、`!!js` 表达式、服务读取、Windows shim、输出解码 | [README](../packages/kit/README.md) · [DEFECTS](../packages/kit/DEFECTS.md) |
| `@hyzyn/dsh-kit-settings` | 插件 | 在官方「设置」里补一行与「通用设置」平级的「插件配置」入口。**不依赖 kit** | [README](../packages/kit-settings/README.md) |
| `@hyzyn/dsh-mcp` | 插件 | MCP 服务器配置卡片，保存后热加载为 `mcp__<server>__<tool>` | [README](../packages/mcp/README.md) |
| `@hyzyn/dsh-env` | 插件 | 环境变量 / 密钥管理，保存即写 `process.env` | [README](../packages/env/README.md) |
| `@hyzyn/dsh-prompt` | 插件 | systemPrompt 可视化编辑 / 版本 / A/B | [README](../packages/prompt/README.md) |
| `@hyzyn/dsh-profile` | 插件 | `~/.dsh/profiles` 的图形化管理 | [README](../packages/profile/README.md) |
| `@hyzyn/dsh-rss` | 插件 | RSS 聚合 → 每日「今日值得读」→ 注入 systemPrompt | [README](../packages/rss/README.md) |
| `@hyzyn/dsh-search` | 插件 | 侧边栏全局搜索（会话 / Prompt / MCP 工具 / 设置） | [README](../packages/search/README.md) |
| `@hyzyn/dsh-codegraph` | 插件 | 代码图谱卡片 + MCP 托管 + 采纳率测量 | [README](../packages/codegraph/README.md) · [DEFECTS](../packages/codegraph/DEFECTS.md) · [ROADMAP](../packages/codegraph/ROADMAP.md) |
| `@hyzyn/dsh-tty` | 插件 | 终端面板（PTY / SSH / SFTP / 隧道）+ `tty_*` `sftp_*` 工具 | [README](../packages/tty/README.md) · [DEFECTS](../packages/tty/DEFECTS.md) · [ROADMAP](../packages/tty/ROADMAP.md) |
| `@hyzyn/dsh-docker` | 插件 | Docker 容器面板（本机 / SSH）+ `docker_*` 工具，默认只读 | [README](../packages/docker/README.md) · [DEFECTS](../packages/docker/DEFECTS.md) · [ROADMAP](../packages/docker/ROADMAP.md) |
| `@hyzyn/dsh-all` | 聚合 | 一条 bundle patch 挂载上面 10 个插件 | [README](../packages/all/README.md) |

> `kit` 是**唯一的库**：它没有 `cordis.patch.yml`，不挂载任何东西，也不出现在 `dsh-all` 的
> 依赖里（它是各插件的 `dependencies`）。写新插件时先看
> [conventions.md § 插件包解剖](./conventions.md#插件包解剖)。
>
> **`kit-settings` 为什么是唯一不依赖 kit 的插件**：它的宿主半体「只负责让这个包在 Loader 里成为
> 一行，**不注册路由、不占用 settings 命名空间、不向 systemPrompt 注入任何东西**」，
> 且 `inject: []`（不依赖任何宿主服务）；全部工作都在浏览器半体，靠 `settings.section` +
> `settings.kit.item` 两个 slot 渲染（出处：`packages/kit-settings/src/index.ts` 的文件头注释）。
> 而 kit 提供的是**宿主半体**工具（HTTP 围栏 / 托管区块 / `!!js` / 服务读取 / Windows shim / 输出解码）
> ——它一个都用不上，所以 `dependencies` 为空。

## 3. 依赖方向（不许反向）

```
插件 ──depends──▶ @hyzyn/dsh-kit ──depends──▶ js-yaml
插件 ──peerDep──▶ @deepseek-ai/dsh（宿主）· @deepseek-ai/dsh-tools · @deepseek-ai/dsh-mcp-client
```

**硬规矩**：

- **插件之间不得互相 `import`。** 需要协作时走**数据级复用**（见 §5），或走宿主公开服务。
- 插件**只**依赖 `@hyzyn/dsh-kit` 与宿主 `@deepseek-ai/*`；新增第三方运行时依赖要在包 README 里写明理由。
  **没有任何运行时依赖也是允许的**（`kit-settings` 就是：宿主半体只占一行，工作全在浏览器半体）。
- 全部插件的 `peerDependencies` 必须钉同一个 DSH 版本下限；`dsh.engines.dsh` 必须与 peer 下限**一致**
  （宿主不读 engines，但插件市场按它展示）。CI 的 `scripts/check-dsh-peers.mjs` 兜底校验三者。

## 4. 谁写哪个文件（跨包冲突的唯一来源）

`~/.dsh` 下的文件**多个包都会写**，这是本仓库最容易出事的地方。当前归属：

| 文件 | 写入者 | 保护机制 |
|---|---|---|
| `~/.dsh/cordis.patch.yml`（**托管区块**） | `mcp`（服务器行）、`codegraph`（MCP 服务器行 + 只改 cwd） | 两者都做**写前复核**（mtime+size 弱 CAS，≤3 次重读）；`codegraph` 用定点行编辑，不整块重写 |
| 当前 profile 的 `cordis.patch.yml`（**用户层**） | 各插件的 entry 配置（`docker` / `tty` / `codegraph` / `rss` …） | 由宿主 settings 服务管；插件不直接写 |
| `~/.dsh/env.yml`（托管区块） | `env` | 托管区块读写（`kit` 的 `managed-block`） |
| `~/.dsh/prompts.yml`（托管区块） | `prompt` | 同上；`search` **只读**它 |
| `~/.dsh/rss-digest/YYYY-MM-DD.md` | `rss` | 独占 |
| `~/.dsh/.credentials.yaml` | `env`（经官方凭据存储） | write-only：接口不回明文 |
| `~/.dsh/profiles/<name>/` | `profile` | 独占 |

**为什么 `cordis.patch.yml` 有两套写法**：`mcp` 与 `codegraph` 都往同一个文件里插服务器行。
`codegraph` 最初整块重写，结果是**有损往返**（别人的 override 形状与注释被静默删除）；
后来改成定点只改自己那行的 `cwd:`。**新增「写这个文件」的插件时，照 `codegraph` 的定点写法做**，
不要整块重写。

> ⚠️ 手工往 `~/.dsh/cordis.patch.yml` 追加**插件行**会导致启动报 `duplicate loader entry id`——
> 插件行只由 bundle 补丁挂载，托管区块只放服务器配置。

## 5. 跨插件协作（数据级复用，不是代码依赖）

这几条是「装了 A 才能用 B 的某个功能」，**版本门限是契约**：

| 提供方 | 消费方 | 门限 | 协作方式 |
|---|---|---|---|
| `tty` | `docker` | tty ≥ 0.15.0 | 容器卡片首个图标变「终端」→ 调 tty 的 `ttyTerminal.mount` **就地嵌入**面板底部抽屉 |
| `tty` | `docker` | tty ≥ 0.14.0 | 退化为「新开终端标签 + 收面板」 |
| `tty` | `docker` | tty ≥ 0.13.0 | SSH 标签连接栏出现「容器」按钮，用当前会话那台主机直接开面板 |
| `tty` | `docker` | 任意 | `kind=ssh` 目标可直接**引用 tty 连接簿条目名**；主机指纹 TOFU **以 tty 已有记录作种子** |
| `mcp` | `codegraph` | — | 同一份 `cordis.patch.yml` 托管区块；codegraph 只补自己那行的 `cwd`，已在 MCP 卡片配置过的行不动其它字段 |
| `prompt` | `search` | — | `search` **只读** `~/.dsh/prompts.yml` 托管区块 |
| `mcp` | `search` | — | `search` 按 `mcp__` 前缀枚举已挂载工具并标注所属 server |
| `kit-settings` | 全部插件 | — | 提供「设置 → 插件配置」这一行入口（0.1.5 时代卡片形态）；各插件同时注册三代插槽 |

**协作的硬约束**：消费方必须**在提供方未安装 / 版本过低时优雅退化**（上面每一行都有退化路径）。
`docker` 的「终端」按钮三级退化就是范本：**能嵌就嵌，不能嵌就开标签，再不行就复制命令**。

## 6. 客户端半体与供给链

每个插件可选声明浏览器半体（`package.json#dsh.client`）。宿主按
`/plugins/<id>/client.js`（或 combo 路由 `/plugins/??<id>/client.js&rev=<hash>`）供给，
`rev` 是**内容哈希**——猜 rev 必然 404。

- **产物入库**：`packages/*/client.js` 与 `packages/*/lib/**` 随源码提交，CI 有「产物 = 源码」闸门
  （`pnpm -r build` 后 `git diff --exit-code -- 'packages/*/client.js' ':(glob)packages/*/lib/**'`）。
  改源码**必须**重建产物；**`lib/` 那半边在 CI 里目前是失效的**，细节与实测见
  [conventions.md § 真机脚本与 CI 接线](./conventions.md#真机脚本与-ci-接线)。
- **纯逻辑抽模块**：要判对错的客户端逻辑抽成 `client-src/*.js` 纯模块 + vitest 用例，
  由构建脚本内联进单文件 `client.js`。理由与六条硬规矩见
  [conventions.md § 客户端半体](./conventions.md#客户端半体六条硬规矩)。
- **三代插槽**：客户端半体同时注册 `plugins.row.config`（官方新版行配置）、
  `settings.kit.item`、`settings.plugin.item`，一份产物在各代宿主上都能用。
- **界面文案的语言**：只认宿主提供的 `ctx.locale`（`@deepseek-ai/dsh-client-locale`），
  每个包自带 zh/en 目录、按同一段片段注册——方案与闸门见
  [i18n.md](./i18n.md)（本文不重复）。

## 7. 一条请求经过什么

```
浏览器 client.js
  └─ fetch('/api/dsh-<id>/…')          ← 相对路径，桌面版与浏览器都成立
       └─ 宿主插件路由
            ├─ kit.isLoopbackRequest()  ← 回环围栏（全部路由）
            ├─ kit.readJsonBody()       ← POST body 围栏（畸形/超限 → undefined → 400）
            └─ 业务：子进程 / SSH / 文件 / 宿主服务
```

四条**跨包一致**的约定，改任何插件都适用：

1. **回环围栏**：全部路由先过回环围栏；变更端点另需**同源证明**（`Origin` / `Sec-Fetch-Site`），
   且来源检查必须排在 DNS 等异步分支**之前**。围栏实现只有一份（`@hyzyn/dsh-kit`），
   但**分两档**：同步档 `isLoopbackRequest`（9 个插件的历史口径，语义未动）与加固档
   `isLoopbackRequestStrict` + `hasSameOriginProof`（127/8 全段、别名 DNS 确认、桌面壳
   Cookie 例外）。**哪些包在哪一档**是安全假设的一部分，别按「顺手升级」改：

   | 包 | 闸门 | 变更端点的同源证明 |
   |---|---|---|
   | `docker` · `tty` · `dsh-mcp` | `isLoopbackRequestStrict`（原子 `docker` 那份上提到 kit） | 有（按**动作**判定，不是按方法；`/config` 三处一致地豁免——它是禁用后唯一的恢复入口） |
   | 其余 7 个插件 | `isLoopbackRequest`（同步档） | 无 |

   为什么不一刀切：全仓收敛到加固档要连信任模型一起定（[ROADMAP.md](../ROADMAP.md) 第 5 项），
   单包先升级只会让插件之间的安全假设不一致。加固档的成因与桌面版例外写在
   `packages/kit/src/http.ts` 的注释里（那边是唯一归宿）。
2. **能力开关不能凭空升**（2026-09-26 起，docker 两个 + tty 一个）：**危险能力**
   （`allowMutations` / `allowExec` / `allowProxyCommand`）有**两条**提权通道：
   ① **启动环境变量**（最严）：`DSH_DOCKER_ALLOW_MUTATIONS=1` 这类，判定源是宿主的**启动
   环境快照**（只认继承来的 `process` 层，`project-env` / `user-env` 一律不算）；
   ② **就地提权**（免重启；docker 与 tty 都已接入）：页内点开关 → 面板给出一条在宿主上
   「落地一个随机名文件」的命令 → 宿主发现该文件即授权（`packages/kit/src/elevation.ts`）。
   授权落 `<DSH home>/dsh-kit/capability-grants.json`（0600）、确认目录
   `<DSH home>/dsh-kit/grant-confirm/`（0700）——**收在 kit 自己的一级子目录**里，而不是平铺在
   DSH 主目录：那一层是所有所有者共用的（官方 `sessions/` `storages/`，本仓 `tty/` `rss-digest/`），
   机制名不带归属就会与官方或别的插件撞名（kit D08）；路径只在 `capabilityPaths()` 里拼一次。
   授权是**持久**的（重启后直接生效、不再确认），所以载入也要审计（`auditLoadedGrants`，kit D09）。
   HTTP 侧**永远可以关掉**它们（紧急刹车不能依赖重启），但给 `true` 而无授权一律 400。

   为什么需要这一条：上面那条围栏 + 同源证明**都拦不住跨站页面与页内脚本**——它们能发
   HTTP，也能自己填 `Sec-Fetch-Site: same-origin`（那是请求头，不是凭据）。于是危险能力
   **曾经**可以被一次 `POST /config {allowMutations:true}` 打开，而 docker socket
   等价目标主机 root。为什么不是给 `/config` 加一次性 token：`/config` 是插件被禁用后
   **唯一**的恢复入口，token 化等于把用户锁在外面（细节与取舍见 ROADMAP 第 5 项）。

   授权存储**按目录共享一个实例**（`sharedGrantStore(dir)`）：能力判定是模块级单例，而存储是
   「首查读盘 + 进程内缓存」，各插件各 `new` 一个就会各自拿一份快照副本、后写的授权在别的插件眼里
   不存在（真机实测 → kit D11）。

   约定实现只有一份（`packages/kit/src/capability.ts`）：`bindCapabilitySources(ctx, grants)`
   在插件 `apply()` 第一行绑定两条通道的来源；`capabilityGranted(spec)` / `capabilityGrantVia(spec)`
   回答「有没有授权 / 由哪条通道授权」；`capabilityDeniedMessage(spec)` 给 400 文案；
   `capabilityHowTo(spec)` 给界面提示（**必须把通道说清**：哪条变量、要不要重启，并点明
   `.env` 与 `~/.dsh/env.yml` **不算**授权——它俩在启动快照里根本不算「启动环境」）。
   `/elevate` 三条子路由全部 POST、全部要求同源证明。客户端按快照里的
   `allowMutationsGranted` / `allowProxyCommandGranted`（docker 另有 `*Configured` /
   `*GrantSource`）渲染开关、未生效徽标与撤销入口。
   **威胁模型边界**：拦住的是**跨站页面**与**页内脚本**（第三方插件的 client 半体 / XSS）；
   能在本机执行命令的同用户进程**不在模型内**——它读得到自己那次 `begin` 的响应、写得了
   那个文件，本来也就能读 `~/.dsh/.credentials.yaml`、直接跑 `docker`。要拦它只有 OS 级同意
   （原生对话框 / polkit）——**但这句话只对「没那么顺手」成立，不是结构性屏障**：那个进程
   能自己 spawn 一个同名对话框、能合成点击，也能直接写那个 grant 文件。2026-10-07 立项的
   [os-consent-plan.md](./os-consent-plan.md) 把这条边界逐条实测了一遍。

   **同一条边界还适用于「能力面」**（2026-10-07 补）：上面那句「拦页内脚本」只对**被闸的那条
   通道**成立。一个部署里可能有不等价的第二条入口，它不在任何 `DSH_*_ALLOW_*` 的管辖内——
   实例就是 docker 的 `allowExec`：它管 `/exec` 与 `docker_exec`（本插件自持的一次性 exec），
   而容器卡片「终端」按钮跑 `docker exec -it`、经 tty 的 `ttyTerminal` / WS `spawn` 帧承载，
   那条通道**不检查 `allowExec`**，页内脚本由此拿到的命令面比一次性 exec 更强（tty 的 `spawn`
   帧收任意 `command`）。这是**刻意的取舍**（交互式进入容器是只读巡检的主路径，且它归 tty——
   PTY 的所有者），但**对外文案不许**把它说成「docker exec 一律需要授权」；评估一个部署的真实
   命令面要把它装的所有能力面一起看。落到具体包的那一半写在各包（docker README 的「已知限制」、
   `packages/kit/src/capability.ts` 的威胁模型边界）。

   **与之互补的第二层：会话权限档位闸（tier gate，2026-10-07 起）**。能力开关管**注册不注册**
   （宿主级、持久授权）；档位闸管**已注册的这一次调用放不放行**（逐调用、随会话档位即时变）——
   防的对手也不同：前者拦页面与脚本凭空提权，后者把「被误导的 agent」的关键动作拉回人的视野。
   插件在 `tools/pre-execute` 瀑布上挂监听（实现只有一份：kit 的 `tier-gate.ts`，docker 与 tty
   各出一张工具分类表），每次调用解析会话的有效档位（`sandboxPolicy.resolve` × 审批策略），
   按矩阵决定放行 / 走宿主 approval 服务逐次询问 / 拒绝；受限档下 `write` / `exec` 类必问或必拒，
   完全权限档零询问（该档审批策略是 `never`，ask 会被确定性拒绝），Auto review 档插件让位给
   宿主的模型预审。服务未组合（老宿主）时不闸 + 启动审计一行；监听器永不 claim `allow`
   （要么 `next()` 透传，要么 `deny` / `ask`）。机制推演、决策矩阵与运行时证据见
   [permission-tier-plan.md](./permission-tier-plan.md)；各包的分类表在其 `src/index.ts`
   （`TTY_TIER_CLASS` / `DOCKER_TIER_CLASS`，与注册处对账的守卫测试在各包 test）。
3. **body 围栏**：`readJsonBody` 对畸形 / 超限 / 空 body **返回 `undefined` 而不抛错**——
   调用方必须把 `undefined` 当 **400**，**不能**当「没传这个字段」。写操作尤其。
4. **截断要有信号**：任何截断（列表、日志、输出）都要显式报 `truncated` / 计数说明，
   **不许静默少列**。这是本仓库历史上出现最多的一类缺陷。

## 8. 文档在哪一层

见 [conventions.md § 文档分层](./conventions.md#文档分层)。一句话：
**L0 管跨包（本目录）· L1 管包内（`packages/<pkg>/`）· L2 是代码注释。**
每类知识只在**一个**层级展开，其他位置只引用不复制。
