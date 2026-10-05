# 项目路线图（跨包）

> **本文只放「要同时改 ≥2 个包」的项。** 判据见
> [conventions.md § L0 / L1 的边界判据](./docs/conventions.md#l0--l1-的边界判据)：
> **改一个包就能做完 → 该包自己的 `ROADMAP.md`；要同时改 ≥2 个包，或要动 CI / 脚本 / 规范 → 本文。**
>
> 包内待办在 `packages/<pkg>/ROADMAP.md`——**哪些包有这一节以文件为准，本文不列名单**：列过一次
> （写「当前有：`docker` · `tty` · `codegraph`」），三包入库之后就漂了（`devdata` / `devenv` /
> `devfront` 各有 `## 待办`，而 `codegraph` 那份恰恰没有这个节）。与下面那条口径同源：
> **不数条数、也不写死清单**。
> 缺陷按编号记在各包 `DEFECTS.md`，不在本文。
> 本文每一项在动手前先转成可验收条目（做完回填「落点 + 门槛」）。
>
> **怎么读 `## 待办` 这一节**：它是**历史与待办混排**——**带 ✅ 的条目 = 整项已落地**，原文留在
> 原位作历史（目标、取舍、当时的理由都在正文里，搬走就只剩一句结论），落点与门槛见
> [§ 已完成](#已完成落点--门槛)；**没带 ✅ 的才是活待办**。判据就这一个符号，**不数条数、也不写死
> 条数**（写了就会漂）。

## 待办

### 1. ✅ 统一安全围栏：把 docker 的加固口径同步到 tty / dsh-mcp

> 自 `packages/docker/ROADMAP.md` 迁入（2026-09-25），原文照录：

与 docker 同款的 loopback 围栏加固（**docker D31/D32**）尚未同步到这两个包。
这里只记**结论**，不在公开文档里展开具体手法；要做的话直接对齐 `src/index.ts` 里那两个函数。

**为什么是 L0**：要同时改 `tty` 与 `mcp` 两个包，且口径必须与 `docker` 一致——
三处各写一份必然漂。约定见 [architecture.md § 一条请求经过什么](./docs/architecture.md#7-一条请求经过什么)。

### 2. 跳板机（ProxyJump / ProxyCommand）✅

> **全部落地**（2026-09-25，见 [§ 已完成](#已完成落点--门槛)与
> [docs/landed/proxyjump-plan.md](./docs/landed/proxyjump-plan.md) 的进度表）：两包加 `jump` 规格并补齐四道
> 白名单、tty 四个连接点共用 `prepareSshConnect` / `attachSshTransport`、docker 池键并入
> 跳板机身份、导入解析 `ProxyJump`（含同文件别名）；连接簿对话框的跳板机字段与「试连」的
> 跳板机维度同日做完（`client-src/jump-field.js` 纯模块 + 预览 33/33 + 真机冒烟）。
>
> **`ProxyCommand` 随后补上（闸门版）**：tty settings 新增 `allowProxyCommand`（**默认关**），
> 关着时携带代理命令的连接**明确失败、不退回直连**，`~/.ssh/config` 导入**永不**自动带入；
> docker 用**同一个**开关（读 tty settings），池键并入代理命令摘要（不回显命令原文）；
> 真机冒烟 `proxycommand-smoke.mjs`（自写 `proxy-bridge.mjs` 当 `ssh -W %h:%p` 的原语）
> 与两包各一套单测（tty 16 例 / docker 12 例）都进了 CI。
>
> **仍未做**：只有多跳链（跳板机的跳板机）——明确不做，导入遇嵌套别名按「解析不出」处理。
> 边界与理由见 [docs/landed/proxyjump-plan.md](./docs/landed/proxyjump-plan.md) 第 6.1 节（闸门定案表）。

同一个根因，两个包各写了一遍，迁到这里合并（两段原文都保留）：

**docker 侧**（自 `packages/docker/ROADMAP.md` 迁入）：

> `buildConnectConfig` 从不设 ssh2 的 `sock`，tty 的连接簿也不支持跳板机条目；
> 企业内网主机几乎都要过 bastion。短期至少做到：配了跳板机的目标连不上时给出明确文案，
> 而不是 20s 后一句通用超时。

**tty 侧**（自 `packages/tty/ROADMAP.md` 迁入）：

> `ssh-config.ts` 明写忽略、`buildConnectConfig` 从不设 ssh2 的 `sock`；企业内网主机几乎都靠
> bastion。**短期至少做到**：导入时跳过依赖跳板机的块并提示，不要静默产出一条注定 20s 超时的
> 连接簿条目。*（复核：仍未做，`ssh-config.ts:9` 的行为没变）*

**为什么是 L0**：两包各有一套连接构造（docker 的 `src/ssh-exec.ts` 与 tty 的 `src/ssh.ts`），
跳板机要一起做，否则「docker 目标能过 bastion、终端不行」这种半吊子状态比不做更糟。

### 3. ✅ 面板端 i18n（方案 + 闸门 + 逐包搬运全部落地）

> 自 `packages/docker/ROADMAP.md` 迁入，原文照录：

界面只有中文；`README.en.md` 与中文版手工同步（**docker D76** 那类「文档里写死计数」的漂移
已经去掉，但双份维护的风险仍在）。

**为什么是 L0**：全部 10 个插件的界面都只有中文，要改就得一次改完（或先定一套 i18n 落地方案）。
单包先做会造出两套互不兼容的写法。相关的文档语言策略见
[conventions.md § 文档分档](./docs/conventions.md#文档分档)（中英同结构 / 简单包免英文）。

> **2026-09-25**：按原文允许的「或先定一套 i18n 落地方案」落地了方案本身——
> [docs/i18n.md](./docs/i18n.md) + 静态闸门 `scripts/check-i18n.mjs`（含自检与
> vitest 用例、CI 与 pre-commit 接线）+ 最小接入样本 `env` / `kit-settings`。
> **逐包搬运仍是待办**（8 个包，字符串量最大的 `codegraph` 约 240 条），
> 落点 / 门槛 / 搬运顺序与各包风险见下方[§ 已完成](#已完成落点--门槛) 第 3 项。

> **2026-10-04 追加更正**：这条注写于 2026-09-25（当时 2/10），现在**搬运已全部落地**——
> 题目上那个「10/10」也一并去掉了：**份数不写进标题**（它随包数长，已经漂过一次：10 → 13）。
> 现算值**以闸门那一行输出为准**（`check-i18n` 的 `已接入 N/N 个客户端半体`；写下这句时是 13/13）。

### 4. ✅ `isConcurrencySafe` 未声明

> 自 `packages/docker/ROADMAP.md` 迁入，原文照录：

所有 `docker_*` 工具都被宿主当作独占而串行化，只读工具本可并行。
这是本仓库各插件的共性（tty / codegraph 同样未声明），要改建议一起。

**为什么是 L0**：原文自己就写了「要改建议一起」——三个包的 `tools.register` 调用点要一起加。

### 5. 变更端点的信任模型：能力开关的宿主侧授权 ✅

> 自 `packages/docker/ROADMAP.md` 迁入，原文照录：

当前信任模型是 loopback + 同源证明（**docker D31/D32**）；本机任意进程仍可直接读写配置
（它能先 `POST /config {allowMutations:true}`）。docker socket 等价目标主机 root，值得再收紧。

**为什么是 L0**：这不是 docker 一家的性质——**任何**走回环围栏的插件都接受本机任意进程的请求。
要收紧就得定一套全仓通用的机制（如一次性 token 交换），单包先做会在插件之间留下不一致的安全假设。
与第 1 项同属「安全围栏」这条线，**建议合并规划**。

#### 5.1 落地的是「只能降不能升」，不是 token（2026-09-25）

**原文点名的攻击路径只有一条**：`POST /config {allowMutations:true}`。而一次性 token **打不到
它**——变更子路由名单（docker 的 8 条）里根本没有 `/config`，因为 `/config` 是插件被禁用后
**唯一**的恢复入口，token 化等于把用户锁在外面。所以本轮做的是能**真正堵住那条路径**、
且不破坏恢复入口的那一层：

- **提权只认宿主侧环境变量**（`DSH_DOCKER_ALLOW_MUTATIONS` / `DSH_DOCKER_ALLOW_EXEC` /
  `DSH_TTY_ALLOW_PROXY_COMMAND`），且**进程启动时采样一次**；
- **HTTP 只能关、不能开**：给 `true` → 400 + 文案说清「设哪个变量 + 重启宿主」；
- 配置里的 `true` **不算授权**（它与 HTTP 写进去的值存在同一个存储里，分不出来源）；
- 实现只有一份（[`packages/kit/src/capability.ts`](./packages/kit/src/capability.ts)），
  客户端按快照里的 `*Granted` 把开关渲染成「点不动 + 说明怎么开」；
- 约定与威胁模型边界写进 [architecture.md § 7](./docs/architecture.md#7-一条请求经过什么)。

> ⚠️ 上面那一条里「**提权只认宿主侧环境变量**」在 2026-09-26 被扩展成**两条通道**（并修好了
> 环境变量那条的采样源），见下 § 5.1.1；「进程启动时采样一次」这句仍成立，但它的理由变了
> （不再是「防运行期注入」这个权宜，而是「只认启动时继承的环境」这条规则）。

#### 5.1.1 就地提权：第二条带外通道（2026-09-26）

> 机制推演、API 取舍与威胁模型**不在本文**（本文只放「落点 + 门槛」）：全部在
> [docs/landed/capability-elevation-plan.md](./docs/landed/capability-elevation-plan.md)——§0 是对手表与
> 三条结论、§1 是不变量、§3 是 kit 侧落点、附录 B 说明为什么砍掉确认码通道、附录 C 是实施记录
> （含 API 改名与四处偏差）、附录 D 是 tty 接入、§9 是明确不做（OS 级同意仍后置）。

**做了什么**：补上**免重启**的第二条通道——页内点开关 → 面板给出一条「在宿主上落地一个随机名
文件」的命令 → 宿主发现该文件即授权；顺带修掉 5.1 遗留的采样源问题（`.env` / `~/.dsh/env.yml`
从此明确不算授权）。通道实现只有一份（kit），docker 与 tty 两个插件共用；未授权时开关可点 =
发起提权（不再是点不动的 `disabled`）。

**落点**：

- kit：[`capability.ts`](./packages/kit/src/capability.ts)（判定 + 文案：`bindCapabilitySources` /
  `capabilityGranted` / `capabilityGrantAt`）、[`grant-store.ts`](./packages/kit/src/grant-store.ts)
  （`capabilityPaths()` 只拼一次路径 / `GrantStore` / `sharedGrantStore`）、
  [`elevation.ts`](./packages/kit/src/elevation.ts)（`createElevationManager` / `auditLoadedGrants`）；
- docker：`/api/dsh-docker/elevate{,/status,/revoke}`，三条**全 POST**且**逐条**进
  `MUTATION_SUBROUTES`（那条判据是「精确子路径 + POST」，只写一条另外两条就是裸的）；授权到达与
  撤销都由宿主侧 `onGrantChange` 重算。客户端：逐能力状态行 + 「撤销宿主授权」入口。
- tty：`/api/dsh-tty/elevate{,/status,/revoke}` 同上（`allowProxyCommand` 也接上第二条通道）。
- 编号：kit **D07**（采样源）/ **D08**（落点带归属）/ **D09**（持久授权可见）/ **D11**（共享存储）/
  **D12**（验收的授权落点隔离）；docker **D141–D144**（重算、快照、字面 `**`、证明覆盖）；
  tty **D68**（字面 `**`）/ **D69**（脆测试隔离）/ **D70**（启动期闸门未初始化）；codegraph **CG64**。

**门槛**（本文件管「哪些用例 / 真机」）：`packages/kit/test/capability.test.ts`（8 条：白名单值、
**进程内只采样一次**、文案两步齐全）、`packages/kit/test/grant-store.test.ts`、
`packages/kit/test/elevation.test.ts`；`packages/docker/test/config-route.test.ts` 的 5 条
（400 且不落盘、降权免授权、配置里的 true 无效、授权后接受）、
`packages/docker/test/elevate-route.test.ts`（含「不碰文件系统的任意 HTTP 序列都提不了权」的负向
性质）；`packages/tty/test/proxy-command.test.ts` 的 21 条（含未授权 / 未启用**两条文案必须不同**、
路由 400、四道白名单往返）、`packages/tty/test/probe.test.ts`（探针按原因分开报）、
`packages/tty/test/elevate-route.test.ts`；docker route-smoke 62/62（含快照暴露授权）；真机：下面那张
真机验收表 + `pnpm live-smoke`（18 条，两个实例的授权目录各自隔离 → kit D12）。

**升级影响（刻意如此，已写进两包 README）**：升级前靠界面打开的开关**会变成关**——要恢复
就在宿主侧设环境变量并重启宿主。这正是「HTTP 不能提权」的代价：分不出来源的 `true` 一律不算。

**真机验收（2026-09-26，真 DSH 宿主 + 真 HTTP 路由，不是假 ctx）**：临时 profile（从 test
复制、links 到本仓）起两个实例——无授权与带授权各一，逐条验过：

| 场景 | 实测 |
|---|---|
| 未授权 + 配置里写着 `allowExec: true` | 快照 `allowExec=false`、`allowExecGranted=false`（**「配置里的 true 不算授权」在真宿主上成立**） |
| 未授权 + `POST /config {allowMutations:true}` | **400**，文案点名 `DSH_DOCKER_ALLOW_MUTATIONS` 与「重启宿主」；`allowExec` / `allowProxyCommand` 同 |
| 未授权 + 降权（给 `false`） | **200**（紧急刹车不依赖授权） |
| 未授权 + agent 工具 | docker 只注册 11 个只读工具（`docker_action` / `docker_exec` 等不出现） |
| 带授权实例 | 快照 `*Granted=true`、按配置生效；`POST …true` → **200**；工具清单多出 `docker_action`/`docker_image_*`/`docker_exec` |
| 试连三种文案 | 未授权 → 「未获宿主授权…DSH_TTY_ALLOW_PROXY_COMMAND…」；授权但开关关着 → 「未启用…」；真跑一条失败命令 → 带子进程 stderr |
| 浏览器真正加载的那份 client.js | 从真宿主拉下来核过：新键与新逻辑都在（`allowProxyCommandGranted` / `hint.proxyCommandNotGranted` / `allowMutationsGranted`） |

真机验收顺带挖出并修掉 **tty D66**（探针结算后仍被后到的事件覆写结果，导致「连接已关闭」
这种空话盖掉带 stderr 的那句）——它**纯 mock 测不出来**，已补真进程回归。

**这套验收已固化成脚本**：`pnpm live-smoke`（[scripts/live-host-smoke.mjs](./scripts/live-host-smoke.mjs)，
18 条断言：上面的表（含 A7b 那条顺序回归）+ agent 工具清单 + 绕开工具直打 `/action`、`/exec` 的门控 + 宿主正在服务的
`client.js` 含新键）。它复制两份一次性 profile 起两个真宿主（无授权 / 带授权），跑完删干净、
不碰任何既有 profile；**本地门槛不进 CI**（CI 里没有 DSH），是 [RELEASING.md](./RELEASING.md)
发布门槛 #3「真实装进 DSH 跑一遍」的自动化形态。

**两台 CI 腿对应的机器上都是 18/18（2026-09-26 实测）**：Windows 11（SYSTEM 上下文）与
Ubuntu 24.04 各自一条命令跑完（`--bootstrap --strict`），全程不需要事先手工建 profile。
这一轮 Windows 腿挖出 3 条真缺陷（`where dsh` 的 POSIX shim、`fs.cpSync` 把 junction 展开成
124MB 真副本、**tty D67** 探针阶段顺序），全部已修并补了回归。

**干净机器上也能跑（2026-09-26 补）**：加 `--bootstrap`
（[scripts/live-profile.mjs](./scripts/live-profile.mjs)）——机器上没有「link 到本仓」的 profile
时，它从 dsh **自带**的 `web` 模板现场造一个（link 本仓的 docker/tty、写一层让「配置里写着 true」
成立的 patch、再用 `--dump-config` 自证插件真进了阵容），跑完与两份拷贝一起删。这样**两台 CI 腿
对应的机器（Parallels 的 Windows / Ubuntu VM）也能连宿主一起验**，而不只是打印 SKIP。

#### 5.2 一次性 token 仍未做（按需）

它**仍然有独立价值**，但只针对「**能到回环、读不到文件**」的隔离进程（沙箱应用、被拿下的
renderer）：token 让盲发失效。若要做，先书面定三件事：① 威胁模型（谁被拦、谁不被拦——
同用户全权进程本来就能读 `~/.dsh/.credentials.yaml`、能直接跑 `docker`，任何进程内机制都拦不住）；
② `/config` 与恢复通道怎么办（token 化之后用户怎么把插件救回来）；③ 桌面壳的例外。
按「全仓安全线一项」规划，而不是 docker 的附加项。

#### 5.3 三条已知限制（刻意不修，别当缺陷重报）

**三条边界**（复核时确认，写在这里免得被当缺陷重报）：① 运行期改 / 删授权文件不生效
（要重启才读到）——删文件当撤销是**容易误以为生效**的一侧，界面上的「撤销宿主授权」才是正路；
② 授权记录的 key 是**裸环境变量名**，不含插件身份（同名 env 的两个插件会共享一条授权；今天的
名字都带前缀，现实风险低）；③ 没有「仅本次运行有效」档位（TTL / boot 计数），持久生效是刻意的。
三条都写进了 `grant-store.ts` 的「已知限制」。

### 6. ✅ CI 与 `package.json` 的脚本双真相源

诊断正文在 [conventions.md § 真机脚本与 CI 接线](./docs/conventions.md#真机脚本与-ci-接线)
（同一条 hermetic 脚本，CI 用写死路径、包内用 `smoke` 条目，改名只会红一处）。
**待批准**：收敛要动 `.github/`，按 [§ AI 协作边界](./docs/conventions.md#ai-协作边界什么改动要先问)
属于必须先问的动作。
**方案**：[docs/landed/ci-scripts-plan.md](./docs/landed/ci-scripts-plan.md)——现算 **14 处**写死路径（ci.yml 11 +
release.yml 3，docker 那三条两个 workflow 各写一遍）、方案 A（workflow 调用包内条目，14 行 → 10 行）
与方案 B（不动 workflow 的守卫）、rename 面、CI 影响、验收与回滚都列在那里；批准后照它执行
——**已批准并执行（2026-10-01）**，执行记录见该文 § 9；**已做**：见 § 已完成 第 6 项。

### 7. ✅ `architecture.md § 2` 包清单缺守卫

归属规矩写着「任何档位的新包都要在 [architecture.md § 包清单](./docs/architecture.md#2-包清单)
加一行」，现算 12/12 满足，但**没有任何守卫**：第 13 个包进来时不会有人红。
`docs-index.mjs` 管的是 `docs/*.md` 的登记与包内 `ROADMAP.md` 的记录节位置，管不到
「workspace 包 ↔ 清单行」这一层。

**为什么是 L0**：要同时动 `scripts/` 与 L0 文档。**修法**：在 `docs-index` 里加一条断言——
从 `pnpm-workspace.yaml` 现算包集合，与 `architecture.md § 2` 表格里的 README 链接逐一对账，
多一个少一个都报（配 fixture 反例：清单少一行必须红）。

**已做（2026-10-01）**：落点与门槛见 § 已完成 第 7 项（`docs-index` 判据 5：两边现算 +
三种漂法各一条反例）。

### 8. ✅ `docs/` 的活规矩与已落地档案混在同一层

现算（`wc -l docs/*.md`，2026-10-01 时点）：`docs/` 11 份 2558 行。其中三份**已落地方案的执行记录**
（就地提权 451 / 跳板机 270 / 面板端 i18n 252）合计 976 行 = **38%**；而每次改代码都要翻的活规矩
（`conventions` 419 / `agent-real-test` 290 / `architecture` 194 / `troubleshooting` 193）
合计 1096 行 = 43%。两组平铺在同一目录、同一张归属表里，新人打开的第一屏近四成是历史。

**为什么是 L0**：要动 `docs/` 结构与归属表。**这是可发现性问题，不是正确性问题**，不急；
真要动，方向是分层（例如 `docs/landed/`）而不是继续加规矩。

> **2026-10-04：按这个方向落地**（判据、落点与门槛见 [§ 已完成](#已完成落点--门槛) 第 8 项）。
> 结果与原文那句估值的差别值得记：这轮**只搬了两份是纯档案的**（就地提权 451 / 跳板机 270）加
> 一份同性质的 `ci-scripts-plan`（164，原估里没算它），共 885 行；**面板端 i18n 留在了顶层**
> ——它是「方案 + 规范片段 + 进度表」的混合体，`check-i18n` 的报错就指着它的 § 键名规范，
> 按「还约束不约束」这条判据它仍是活规矩。

### 9. ✅ 开发数据套件三包（`devdata` / `devenv` / `devfront`）：入库 + 状态真源收敛

现算（2026-10-03）：三包功能**都已落地并各有真机记录**（`devdata` 的 Redis 通路 A、`devenv` 的
观测链路与写路径、`devfront` 的 CDP 驱动 + 六个 `site_*` 工具），判据与落点在三包各自的
`ROADMAP.md`。本条要收的是「它们只存在于工作区」：三个包目录、L0 方案
[`docs/devdata-plan.md`](./docs/devdata-plan.md)、`kit` 里随它们新增的 5 个 `src`
（`chrome-cdp` / `scope` / `ssh-exec` / `tty-books` / `host-services`）与四个
`scripts/verify-{devdata,devenv}-*.mjs` 当时全是 **untracked**——一次误清理就没了，且 CI 看不到它们。

**为什么是 L0**：一次改动跨 `devdata` / `devenv` / `devfront` + `kit` + `scripts` + 根文档，
符合「要同时改 ≥2 个包，或要动 CI / 脚本 / 规范」。

**落点与门槛**见 § 已完成 第 9 项（含实际做法与两道钩子的实测）。**尾边一件另立第 10 项**：
同一台机器上两套容器写入口（`docker` 的 `allowMutations` 与 `devenv` 的 `DSH_DEVENV_WRITE`）——
它不属「入库」，是一条待定的部署/设计取舍。

### 10. ✅ 同一台机器上的两套容器写入口：定个口径

`docker` 的 `allowMutations` 能启停**任意**容器，`devenv` 的 `env_up` / `env_down` 则守着
「**清单就是白名单**」。同一台共享机器上两条路都在时，**后者那道白名单可以从旁边绕过去**——
原来只写了它与 docker「同档」，没有记「并存时怎么办」。

**为什么是 L0**：要么改 `docker` 的变更面判据（动另一个包 + 它的守卫），要么把它写成一条跨包的
部署纪律（动规范）——两条路都不是包内改动。

**结果**：选了「部署纪律」这一条并**写清了代价**；另一条（让 docker 也认清单）为什么不做、
什么时候该重审，都记在落点里。见 § 已完成 第 10 项。

### 11. ✅ 凭据解析只剩一份实现 + `devfront` 用上它（`devfront` B3 的凭据那一半）

现算（2026-10-04）：`resolveSecretVia` 全仓有**两份实现**——`kit` 的 `ssh-exec.ts` 一份、
`tty` 的 `ssh.ts` 一份（后者是当初把 `kit` 那份抄过去之后又各自演进：`tty` 那份多一条
「引用存在但值为空串」的分支，`kit` 那份没有）。`docker` 走 `kit` 那份（本地 `ssh-exec.ts` 是
纯再导出）。而 `devfront` 要把「填值可以用**凭据引用**」做出来时，只要还这么放着，它就只有两条路：
再抄一份（第三份），或者 import `@hyzyn/dsh-kit/ssh-exec` 把 `ssh2` 拉进一个浏览器工具包。

**为什么是 L0**：一次改动跨 `kit`（搬实现 + 加「值来自哪一层」与按 owner 绑定）、`tty`（改成再导出）、
`docker`（绑定带 owner）、`devfront`（新的消费者），并要动一条跨包守卫。符合「要同时改 ≥2 个包」。

**判据（动手前先定，免得做一半）**：

- 共享的是**机制**（解析顺序 / 报错语义 / 单例的绑定），不是策略。**保护强度**的词汇表留两处也
  刻意的：`devdata` 那张表说的是「**计划里打算用哪种方式取**」（process-env / file / command /
  keychain / remote），而 provider 给的是「**这次值实际来自哪一层**」（env / file / project-env /
  user-env）——两条轴，不是一份事实的两个副本。合并要等出现第三个消费者；
- `devfront` **不绑**那个进程级单例：它按 `apply` 持有自己的 provider（`ctx.inject(['credentials'])`），
  因为「谁卸载都不该把别人的凭据通道关掉」这件事在单例上已经露出来了——本项顺带把它收成按 owner 绑定。

**结果**：见 § 已完成 第 11 项（含一条**顺带修好的既有缺陷**：绑定的 owner）。

### 12. ✅ 长等待的工具要转发 `exec.signal`（2026-10-04：四条全收，并写进 conventions）

现算（2026-10-04）：`defineTool` 的 `execute(args, exec)` 第二个参数里带着 `exec.signal`——
SDK 的契约原文是「Async work must observe or forward `exec.signal` and settle only after its
owned work reaches quiescence」。**全仓没有任何一个工具接过这个参数**，于是「取消」对每一个
长等待都等于没取消。已经数得出的：

| 工具 | 最久等多久 | 现状 |
|---|---|---|
| `devenv` 的 `env_wait` | 900s（15 分钟） | ✅ 2026-10-04 已接（见 devenv 记-12）；顺带把等待过程做进报告 |
| `tty` 的 `tty_expect` | 600s（10 分钟） | ✅ 2026-10-04 已接：取消结算成 `cancelled`，**不消费未读区** |
| `tty` 的 `tty_run` | 600s（10 分钟） | ✅ 2026-10-04 已接：取消**不关会话**（取消的是这次调用，不是那条命令） |
| `devfront` 的 `site_verify` | 一批断言 × 每页（加载 + settle） | ✅ 2026-10-04 已接：每一页之前看一次信号，没跑到的断言判 `unknown`（不冒充 `fail`） |
| `docker` 的日志跟随类工具 | 取决于 --tail/--since 与流 | 不适用：它的长活在面板的 SSE 流上，不在工具调用里（工具本身是一次快照） |

**为什么是 L0**：一次改动跨 ≥2 个包（`tty` / `devfront` / 可能还有 `docker`），而且它其实是一条
**缺规矩**——「长等待的工具必须转发 `exec.signal`」应当写进 [conventions.md](./docs/conventions.md)，
并配一条守卫（静态扫「声明了 `timeoutMs` 或等待超过 N 秒的工具是否接了 exec」；纯静态判定不容易，
更可能是逐包补用例）。

**代价（说清才敢不做）**：不做的后果是「取消之后还在跑」——对共享目标（248 / 161）上的 SSH 与
浏览器动作，这是持续占用与噪声，而且是**静默的**（没有一条日志说「取消没生效」）。

**结果**：见 § 已完成 第 12 项；规矩落在 [conventions.md § 工具面](./docs/conventions.md#工具面长等待的工具必须转发-execsignal)。

### 13. ✅ 卡片「客户端拼的 payload」要有真机证据（三张卡片全部落地）

现算（2026-10-04）：三张私有包的配置卡片里，**站点/目标那一条编辑路**的真机 DOM 证据，
`devfront` 补在 `scripts/verify-devfront-card.mjs` 的 ⑰⑱（加行 → 填 7 个字段 → 勾只在 dirty 时
出现的确认框 → 点保存 → HTTP 复核），`devdata` 补在 ㉕㉖，`devenv` 补在 ㉓㉔㉕。

**为什么是 L0**：要动 `scripts/`（三个真机脚本）+ 三个包的文档，且它是一条**跨包口径**——
「卡片提交的形状必须有一次真机 DOM 证据」写进了
[conventions.md § 客户端卡片](./docs/conventions.md#客户端卡片改配置那条路要有真机-dom-证据)，
而不是三张卡片各记一遍。

**为什么值得**：`client.js` 不在 vitest 层；`client-lint` 管语法与地址来源、`check-i18n` 管键集，
**都不看 payload 长什么样**。devfront 的卡片前后被真机抓出过三条（`exports["./client"]` 缺失、
保存标量抹掉站点、详情页要注册 `bundle.config` 槽），三条静态闸门全绿。

**代价**：不做的后果是「卡片看着能改，保存后配置不对」这类问题只能靠人肉发现——而它恰好是
「本地全绿、真机必坏」那一类。

**结果**：三张卡片全部落地（见 § 已完成第 13 项）。口径的**在不在**由
`scripts/test/card-dom-path.test.ts` 守——那三个脚本进不了 CI，删掉那一段原本没有任何东西会红。

### 14. ✅ 一次发布的证据链：三面按同一个项目名读同一批清单（口径 + 守卫；抓出一处不对称）

`devenv` 待办 B6 / `devfront` 待办 D7：一次发布之后，「容器起来了 → 数据对 → 页面对」三件事各有一份
随项目走的文本清单，而它们靠**同一个项目名**对齐。本项要定这条链的**口径**（谁读哪份、只读、
不做发现、**不建聚合器**），并用守卫把「同一个项目名」钉住。

**为什么是 L0**：要动三个包的清单口径 + `scripts/`（守卫）+ conventions；而且「要不要一个聚合器」
本身就是跨包的方向决策——`devfront` 的 `D8` 把「一次调用跨多个项目」明确留着。

**结果**：见 § 已完成第 14 项。**顺带抓到一条硬的不对称**：三面里中间那一环今天**没有工具面入口**。

### 15. ✅ 发布清单：由人给出的「这次该验哪些项目」（`devfront` D8 的尾边）

`devfront` 待办 D8：7 个 CIFS job 分属 7 个项目，「一次调用跨多个项目」没做，而且**不该顺手做**
——「这次发布该验哪些项目」正是三包共同划掉的发现逻辑。本项把补法定成**由人写一份发布清单**
（`release/<发布名>.yaml`：逐条 `{ project, root, target }`），并在 `devfront` 接一个入口。

**为什么是 L0**：发布清单的形态跨三个面（每面读自己那一列），而且它是「不做发现」这条边界上
唯一被允许的补法——口径必须先落在 conventions，再由包去实现。

**结果**：见 § 已完成第 15 项。

### 16. ✅ 登录编排：`devfront` 的 `site_login`（B3 的编排那一半）

`devfront` 待办 B3 的尾边（凭据那一半是第 11 项）：`credentialRef` 通了之后，「登录后才有的页面」
仍然要人手串五个动作，而那串步骤**谁也复审不了、也攒不下来**。本项把流程**写进站点声明**
（`WebTarget.login`），入口是 `site_login`——它是一个**照单执行**的工具，不是浏览器自动化。

**为什么是 L0**：它直接压在 plan §15.3 那条边界上（「验证工具 vs 自动化工具」），所以「能做什么由
声明说了算、agent 只是照单走一遍」这条口径要写进 §15.3，再由包去实现。

**结果**：见 § 已完成第 16 项。

### 17. ✅ 统一视图 + 只读数据浏览面（P13 / P14 第一版，2026-10-04）

**由来**：维护者问「查看数据库数据的 UI 在哪里」——答案是**没有**。`devdata` 的定位是
「面向 agent，不是面向人的控制台」（[plan §0](./docs/devdata-plan.md)），统一视图与面板一直是
**后置**（plan §9 的 P13 / P14）。2026-10-04 决定**开工**，先后次序也定了：**先 P13（统一视图），再 P14**。

**第一版范围（定了才敢动）**：

- **P13**：一屏**证据链总览**——按项目名把 `ready/<项目>.ready.yaml` / `verify/<项目>.yaml` /
  `web/<项目>.yaml` 的**存在性 / 可否解析 / 项目名是否一致 / 条目数**摆出来，Jenkins 那一格**明写「未接」**。
  **只做通用读取**（`kit/manifest` 那份骨架），**不做领域校验、不冒充结论**——结论仍归各面自己的工具
  （`env_wait` / `devdata_verify` / `site_verify`）；
- **P14**：卡片里的**只读数据浏览面**，宿主路由**复用同一条判据链**（解析 → 可见性 → 裁决 → 作用域 →
  审计）——**面板不是特权路径**；作用域基准是**用户填的项目根**（不拿浏览器猜的路径）；写仍然只认
  启动环境的能力闸门。

**为什么是 L0**：要动 `packages/devdata`（宿主路由 + 客户端半体）、`docs/devdata-plan.md`（把 P13/P14
从后置提成可验收条目）与真机脚本（卡片 DOM 证据），而且「面板不是特权路径」是一条**跨包口径**
（与 `docker` 面板的「读永远可用、变更要靠闸门」同族）。

**代价（说清才敢做）**：多一条**浏览器 → 宿主**的读路径 = 多一处要守的入口。判据是
「它必须与工具面走**同一条链、同一档拒绝码、同一份审计**」，而不是「面板另开一条更宽的路」；
不这么做的后果是同一件事在 GUI 里被绕开——那正是根 ROADMAP 第 10 项那类「两套入口」的老问题。

**结果**：**第一版已落地**（当天，落点见 § 已完成第 17 项）。**剩下的部分另立第 18 项**——
本项只承诺「第一版」，把「还没做的」写清楚是它的一部分，不是把它算成做完了。

### 18. P13 / P14 的剩余部分（第一版之外，2026-10-04 明确留着）

第一版（第 17 项）只做了「证据链的形状」与「命令原文的一次往返」。**明确的缺口**：

- P13 的另外三格：**Jenkins 那一格还没有通路**（当前明写「未接」）；容器 / 页面两格今天只报
  **清单形状**（在不在、项目名对不对、条目几条），不是**活状态**——要把它们做成真结论，各自需要
  一个「跑一遍」的入口（`env_status` / `site_verify` 已经在工具面，**面板这一侧怎么调**是下一件
  要定的：走 HTTP 还是别的通道，是跨包决定，属 L0）；
- ~~P14 只做了命令原文，没有表格化浏览（列 key / 翻页 / 类型着色），也没有 key 浏览器~~
  —— **2026-10-04 当天补上第二版**：侧边栏「数据浏览器」= Redis **keyspace 树**（目标 → key →
  类型 / TTL / 元素数 / 有界预览 + 游标翻页），见 `packages/devdata/ROADMAP.md` 记-24。
  **第三轮（2026-10-04 当天）**：再按用户贴的对象浏览器截图**抄成树形**——连接 → **库**（`INFO keyspace`
  的真 keys 数）→ **类型分组**（按本页逐 key `TYPE`，用户点了才付，上限 50）→ key → 详情，见
  `packages/devdata/ROADMAP.md` 记-24 第三轮。
  **第四轮（2026-10-05 当天）**：库那一层从「只展示」变成**点着切**——允许集 = 目标声明的
  （`db` ∪ 新增的 `dbs`）∪ `INFO keyspace` 当场报的（宿主侧两个事实源），浏览器只挑编号、`SELECT`
  仍由执行器按目标声明发；同时修掉「INFO 读不上时把键数画成 `0 个 key`」那种自相矛盾（读不上就写
  「键数未知」），见 `packages/devdata/ROADMAP.md` 记-25。
  **第五轮（2026-10-05 当天）**：按维护者「还是没变化，给我美化一下」把这一屏的**信息层级与版式**重做
  ——树里的五行口径只留一句来源、长的两段（为什么有的库看不见 / 四条口径）各自折进 `<details>`，
  头部与工具条固定、两栏各自滚动、类型五色 + 详情条纹表；**判据一个字没动**，见记-26。
  **第六轮（2026-10-05 当天）**：照维护者贴的 Navicat 式对象浏览器图改成**一张表**——三栏
  （树选库 / 五列表 Key·类型·值·大小·TTL / 右详情）、`Keys Contain` 搜索框（没通配符补 `*…*`）、
  key 名按 `:` 折成前缀行；表格每一格**真读**（一行 3~4 条命令）但**代价写在按钮上、分批、点了才付**，
  没读过的格子画 `—` 而不是空，见记-27。
  **仍然没有的**：跨 key 搜索（`MATCH` 之外没有发现逻辑）、把「上次选的库」同步到服务端
  （类型着色已在第五轮补上：只是读数辅助，不改变任何判据）；
- ~~两项都住在 `devdata` 的卡片里~~ —— 数据浏览那半**已经搬到侧边栏独立面板**（`sidebar.panellist`
  + `main` 两个槽成对注册）；**证据链总览仍留在卡片里**（它是配置面旁边的一句话，不值得占一屏）；
- 「真实项目上一次跑完三面」仍然没有证据：三份清单住在**项目仓**里，本仓一份都没有。

## 已完成（落点 + 门槛）

### 1. ✅ 统一安全围栏：docker 的加固口径同步到 tty / dsh-mcp

**落点**：加固档从 `packages/docker/src/index.ts` 的局部实现**整体上提到**
[`packages/kit/src/http.ts`](./packages/kit/src/http.ts)，新增四个导出：
`isLoopbackAddress`（127/8 全段 + IPv6 映射）、`isLoopbackRequestStrict`（同步快路径 +
别名 DNS 确认、来源检查在 DNS 之前）、`hasSameOriginProof`（含桌面壳 Cookie 例外）、
`originProofHint`（403 成因摘要）。三个包改走同一份：`docker` 删掉自己那 150 行、`tty`
删掉 `isLoopbackHttp` 并收敛出**唯一**闸门 `gateRoute`（导出仅供单测）、`mcp` 换成
`routeGate`（导出仅供单测）。

变更端点的同源证明按**动作**而不是方法判定（读路由不要求证明，否则旧 Safari / 裸 curl
一起被挡）：docker 走 `MUTATION_SUBROUTES` + 四条流；tty 走 `gateRoute(..., {mutation})`
+ 两张前缀子路由表；mcp 两条 POST（`/servers/save`、`/test`）。`/config` 三处一致地
**不在**证明名单里——它是插件被禁用后唯一的恢复入口。

**门槛**：`packages/kit/test/http.test.ts`（加固档逐条语义 + 拒绝分支 + D80 的「DNS 之前」
时序 + fail closed，DNS 用假实现不依赖网络）；`packages/tty/test/route-gate.test.ts`、
`packages/mcp/test/route-gate.test.ts`（每包的拒绝分支负例）；`docker` 既有的 12 个路由/流
用例在**不动一行测试**的前提下继续绿——那就是「行为一字未改」的证据（232 passed）。

### 2. ✅ 跳板机（ProxyJump / ProxyCommand）：单跳全部落地，只剩多跳链明确不做

**落点**：`packages/tty/src/ssh-config.ts` 的 `parseSshConfigDetailed()`（新增）识别
`ProxyJump` / `ProxyCommand` 并**整块跳过 + 回报块名**（`ProxyNone` / `none` 视为显式直连，
照常导入），同时把另外三种丢弃（通配 / 无 User / 超上限）也变成计数——
后两个此前是静默的（见 **tty D62**）。路由 `GET /api/dsh-tty/ssh-config` 回这套结构，
浏览器半体把「N 条依赖跳板机未导入：名字」直接说给用户。文案侧：tty 的
`classifyError` / 探针 TCP 超时、docker 的 `SSH_TIMEOUT_HINT` / `describeExecError` /
连接簿条目缺失三处都点出「本版本尚不支持的正是这个成因」。

**门槛**：`packages/tty/test/ssh-config.test.ts`（7 条：跳过 + 点名、`none` 直连、大小写、
其余丢弃只计数、溢出报数、名单截断但计数准）、`packages/tty/test/ssh-config-route.test.ts`
（真 HOME 下走一遍路由，含围栏不放松）、`packages/tty/test/host-smoke.test.ts` 与
`packages/kit/test/ssh-stream-budget.test.ts` 的超时文案断言。

**单跳完整实现已落地**（同日）：`jump` 规格 + 四道白名单、tty 侧四个连接点共用
`prepareSshConnect`/`attachJumpSock`（终端 / SFTP / 隧道 / 探针一起过 bastion，不留半吊子）、
docker 侧 `poolKey` 并入跳板机身份并在 `disposeAll`/空闲回收/重连时成对关连接、导入把
`ProxyJump` 解析成结构化 `jump`（含同文件别名 / `user@host:port` / IPv6）。连接簿对话框新增
「跳板机」一段（一个 `[用户名@]主机[:端口]` 输入框，勾「使用独立凭据」才展开覆盖字段）。
原文里「两包同时可用」的口径至此两包都成立。

**`ProxyCommand` 也已补上（闸门版，同日）**：`spawn(command, {shell:true})` 的 stdio 经
`Duplex.from` 当 `ConnectConfig.sock`，`%h/%p/%r/%n/%%` 按 OpenSSH 同义展开且代入值走白名单
（含 shell 特殊字符就拒绝执行）。闸门 = tty settings `allowProxyCommand`（**默认关**）：
关着时携带代理命令的连接**明确失败、不退回直连**，探针在阶段 0 就返回并点名开关；
导入**永不**自动带入；与跳板机同时配时按 OpenSSH 语义 **ProxyJump 优先**并记 warn。
docker 侧读**同一个**开关、池键并入 `|cmd:<sha256 前 12 位>`（只并入摘要：命令原文可能含凭据）。
收尾点与跳板机同一批（目标只是借用 stdio），另有「AbortError 不当失败原因」「传输比 `exit`
先到时也要交出已攒到的 stderr」两处细节（见 plan 文档 §6.2）。

**验证**（全绿）：`packages/tty/scripts/jump-smoke.mjs`（真 bastion 的 `direct-tcpip` + 真目标
sshd；J1 正向 / J2 跳板机密码错点名跳板机 / J3 目标不可达同时点名两跳 / J4 收尾无残留连接；
已接进 CI）、`packages/kit/test/ssh-jump.test.ts`（假 ssh2：拨号顺序、通道当 `sock`、
池键区分、失败关连接）、`packages/tty/test/jump-spec.test.ts`（白名单往返 + 拒绝分支）、
`packages/tty/test/ssh-config.test.ts`（别名 / IPv6 / 嵌套别名 / ProxyCommand 分别报数）。

**界面（同日）**：连接簿对话框新增「跳板机」一段（一个 `[用户@]主机[:端口]` 输入框，
勾「使用独立凭据」才展开覆盖字段）、条目行显示「⇢ 经 X」、「试连」结果把跳板机那一跳单列
（`ProbeResult.jump`）；解析与回填是纯模块 `client-src/jump-field.js`（8 条单测），
预览夹具 33/33 场景正常，tty 五个冒烟 + integration 113 PASS 未受影响。

**`ProxyCommand` 的验证**：`packages/tty/scripts/proxycommand-smoke.mjs`（真机：自写的
`scripts/lib/proxy-bridge.mjs` 当 `ssh -W %h:%p` 的原语；P1 终端 / P2 SFTP / P3 闸门关着明确
失败且**没起进程** / P4 命令失败文案带 stderr 摘要 / P5 注入被拒且没落地 / P6 无残留子进程；
已接进 CI）、`packages/tty/test/proxy-command.test.ts`（16 例）、
`packages/kit/test/ssh-proxy-command.test.ts`（12 例）。

**仍未做**：只剩多跳链（跳板机的跳板机）——明确不做（导入遇嵌套别名按「解析不出」处理）。
方案与全部坑仍见 [docs/landed/proxyjump-plan.md](./docs/landed/proxyjump-plan.md)（第 6.1 节是闸门定案表）。

**顺路修掉的两处**（做 ProxyCommand 时挖出来的，编号 tty **D64 / D65**）：连接簿对话框的
「连接（并保存）」出口此前**漏带跳板机**（填了却直连、存下来的条目也没有它——四个出口只改了
三个）；SFTP 池条目在 `conn.on('close')` 里只摘出池、**没关跳板机**（目标断一次就漏一条
keepalive 养着的连接）。两处都已收口到公共收尾入口。

**刻意不做**：不做「只让 tty 能过 bastion、docker 不行」的半吊子（原文的判据：那比不做更糟）；
代理命令不做「按平台各写一套转义」（改白名单拒绝）、不在导入时自动带入；不做多跳链。

### 3. ✅ 面板端 i18n：方案 + 闸门 + 10 个包全部接入

**落点**：方案落在新文件 [docs/i18n.md](./docs/i18n.md)（规范片段 / 键名规范 / 目录放哪 /
范围纪律 / 进度表 / 六个已知陷阱），规矩的入口在
[conventions.md § 面板端 i18n](./docs/conventions.md#面板端-i18n)。实现只有一处：
**宿主自己的** `@deepseek-ai/dsh-client-locale`（`ctx.locale`）——插件侧不建共享模块、
不加构建步骤、不读 `navigator.language`（三条理由都是实测约束，写在方案里）。

闸门 `scripts/check-i18n.mjs` 查三件人一定会漏的事：zh/en **键集一致**、**占位符一致**、
代码里 `t('…')` 用到的键**必须有定义**（第三条是主要理由：写错一个字母只会让界面露出键名，
没有任何测试会红）。另查命名空间 = 包名、空值、**重复键**（JS 后写覆盖前写，求值后看不出来，
必须数字面量）与「安装片段五点是否照抄」。接线：CI 的 ubuntu step（先跑 `--self-test`）+
`.githooks/pre-commit`。

首批接入（证明方案在「没有构建步骤」那 7 个包的多数形态上成立）：`env`（14 条键）、
`kit-settings`（4 条键）——目录内联在 `client.js` 里，**刻意不建 `client-src/`**（一建就会让
仓库级「宿主地址来源」静态规则停止覆盖 `client.js`，方案里有实测依据）。

**门槛**：`node scripts/check-i18n.mjs`（全仓，已接入的必须全绿）+ `--self-test`（20 条判据）；
`scripts/test/i18n.test.ts` 25 条（每个判据都配反例：英文缺键 / 占位符只写一边 / 重复键 /
空值 / 注释里的 `t('…')` 不得误报 / `translate(` 与 `.translate(` 不得误命中 / 动态键只能告警 /
安装片段缺一处要点名），最后一组拿**真实语料**跑一遍并钉住「已接入的包不许退回未接入」。

**逐包搬运进度（2026-09-25）：10/10 全部接入。** 这里**不再留逐包的键数与剩余中文字面量**——现值一律跑
`node scripts/check-i18n.mjs` 现算，逐包「为什么这几条不该翻」的理由在
[docs/i18n.md § 进度表](./docs/i18n.md#进度表)。**收掉的理由**：本处与那份表各存了一份数
（11 行里 4 行已经过期），而两份都写着「数字由闸门算」——同一事实两处各写一份，两处一起收。

**当时每个包都跑过**：`node scripts/check-i18n.mjs`（键集 / 占位符 / 用法覆盖 / 域白名单 / 无死键）
+ `pnpm -r typecheck` + 该包 vitest（全仓 63 文件 1063 条）+ 有构建步骤的重建产物
（`pnpm -r build && git diff --exit-code` 的产物闸门）+ 有 CI 冒烟的跑冒烟
（docker 44/44 + 61/61 + 72/72，tty probe-route/ssh/sftplimits/probe/integration 全过）。

**量、剩余中文的逐条归类、三条写法经验（匹配数据不翻 / HTML 串要 `esc(t(…))` / 值在句子里用
占位符）、目录放哪、以及预览与 smoke 夹具要补什么，都在
[docs/i18n.md](./docs/i18n.md)（数字由闸门现算，不写死）。**

活越干越多不是意外：这一轮顺手修掉了两类**围栏加固（第 1 项）漏下的真实回归**——
CI 真在跑的 `packages/tty/scripts/probe-route-smoke.mjs` / `integration.mjs` 与真机脚本
`scripts/verify-mcp-*.mjs` 打变更端点时没有同源证明（403），按浏览器同源 fetch 的形状补了
`sec-fetch-site: same-origin`。

### 4. ✅ `isConcurrencySafe` 未声明

**落点**：`docker` 的 11 个只读工具（`docker_targets` … `docker_volumes`）与 `tty` 的 9 个
只读工具（`tty_list` / `tty_stats` / `tty_capture` / `tty_screen` / `tty_expect` /
`tunnel_list` / `sftp_list` / `sftp_read` / `sftp_tree`）声明 `isConcurrencySafe: () => true`；
五个 docker 变更工具与八个 tty 变更工具**刻意不声明**（宿主按独占处理，多声明一次就是
两个 `docker_action` 并发跑）。**2026-10-01 补**：`tty_run`（一次性命令）加入后 tty 的变更工具
是 8 个——新增工具必须来这两张表里归类（门槛那条「清单自洽」就是为此设的）。

**codegraph 那半边查下来不成立**：`packages/codegraph/src/**` 里一个 `tools.register` 都没有
（它只往 systemPrompt 注入两段 + 管 MCP 托管行）。模型看到的
`mcp__codegraph__codegraph_explore` 由宿主的 `@deepseek-ai/dsh-mcp-client` 注册，而那份
声明不在本仓，插件侧也够不到（没有改已注册工具的公开 API）。**要它并发安全只能改上游**，
本仓如实记录，不假装做了。

**门槛**：`packages/docker/test/tool-concurrency.test.ts`、
`packages/tty/test/tool-concurrency.test.ts`——三张表（只读 / 变更 / 清单自洽），
且断言走工具自己的参数校验（`defineTool` 参数不合法会直接返回 false，用 `{}` 调会把
「我们调错了」误读成「没声明」；测试按 JSON Schema 造合法最小实参）。清单自洽那条保证
**新增工具时必须来表里归类**。

### 5. ✅ 变更端点的信任模型：能力开关的宿主侧授权

**落点**：机制在 kit——[`capability.ts`](./packages/kit/src/capability.ts)（判定与文案）、
[`grant-store.ts`](./packages/kit/src/grant-store.ts)（`capabilityPaths()` 只拼一次路径 /
`GrantStore` / `sharedGrantStore`）、[`elevation.ts`](./packages/kit/src/elevation.ts)
（`createElevationManager` / `auditLoadedGrants`）；两个消费插件各接三条 `/elevate` 路由
（docker / tty）并在卡片上给出**逐能力**的状态行与撤销入口。方案、威胁模型与实施偏差见
[docs/landed/capability-elevation-plan.md](./docs/landed/capability-elevation-plan.md)（v1 已删除，冻结指针见下表）。

**门槛**：`packages/kit/test/{capability,grant-store,elevation}.test.ts`、
`packages/docker/test/elevate-route.test.ts`、`packages/tty/test/elevate-route.test.ts`；
真机 `pnpm live-smoke`（18 条，两个实例的授权目录各自隔离 → kit D12）+ 待办第 5 项下面那张
真机验收表。

### 6. ✅ CI 与 `package.json` 的脚本双真相源：workflow 调包内条目（14 → 10 行）

**落点**：`ci.yml` 三个 step 的 `run:` 与 `release.yml` 那一步改成 `pnpm --filter <包名> run <条目>`
（tty 7 条 + docker 3 条并成一条 `smoke` + windows 1 条；docker 那三条**在两个 workflow 里各写了一遍**，
一起收敛）；step 数、`if:`、矩阵一律未动。真相源收敛到 `package.json`。
方案、rename 面、CI 影响与验收见 [docs/landed/ci-scripts-plan.md](./docs/landed/ci-scripts-plan.md)。

**门槛**：两份 workflow YAML 仍可解析；`grep -c 'node packages/' .github/workflows/*.yml` = **0 / 0**；
**机械等价 14 条**（HEAD 里每条写死路径都有同名条目、且条目命令逐字指向同一个脚本文件）；
本地演练 8/9 个入口绿（`integration` 在本环境跑不起来——无法开 PTY，**旧写法同样失败**，属环境限制）；
**改名演练**：脚本改名 → 包内入口立刻红（`Cannot find module`），而同一时刻旧写法的写死路径照跑
——那正是被消灭的静默腐烂；还原后 sha256 一致。
**未验证**：windows 腿的 `pnpm run`、CI 真跑一轮。
**方案 B（守卫）同轮已做**：`scripts/ci-script-truth.mjs` + 10 条用例（写死路径回归 / 条目改名 /
包名打错 / 发布闸跑 CI 不认的入口 / 同一入口两侧命令不一致 / 恒绿警戒）；端到端反证——把写死路径
塞回 `ci.yml` → 守卫报 `ci.hardcodedPath`、4 条用例红，`cp` 还原后 sha256 一致并复绿。

### 7. ✅ `architecture.md § 2` 包清单缺守卫：两边现算 + 三种漂法各一条反例

**落点**：`scripts/docs-index.mjs` 新增**判据 5**（`checkPackageManifest` / `parseManifestPackages` /
`parseWorkspaceGlobs` / `resolveWorkspacePackages`）——**左右两边都现算**：左边从
`pnpm-workspace.yaml` 的通配解析出带 `package.json` 的目录，右边从 `## 2. 包清单` 那一节的
`../packages/<pkg>/README.md` 链接取包名。`readDocsInputs` 多带 `workspacePackages` 与
`architecture` 两份输入；CLI 多打一行「workspace 包 N 个 / § 2 包清单 M 行」（命中不是 0 要看得见）。
通配只支持本仓在用的 `dir` 与 `dir/*`，出现别的形态**抛错**——漏一批包就是恒绿，宁可炸。
`conventions.md § 插件包解剖` 那句「任何档位都要在 § 包清单加一行」补上了判据指针。

**三条口径**：workspace 有、清单没有 → `manifest.missing`（新包没登记）；清单有、workspace 没有
→ `manifest.stale`（删包没删行，清单成了历史）；`## 2. 包清单` 整节被改名/删掉 → **报缺失**，
不静默当成空清单。只认那一节里的链接——文档别处的 `../packages/...` 引用不算登记。

**门槛**：`scripts/test/docs-index.test.ts` 的反例 5 六条——删一行 / 加一行假包 / 节被改名 /
把整张表清空（仍必须按 12 行报，不许被别处链接喂饱）/ 合成 workspace（少一个包 → stale）/ CRLF 免疫；
外加一条正向断言把「命中不是 0」钉住（两边都 ≥12、集合相等）。真实仓库 12/12 现算一致。

### 8. ✅ `docs/` 分层：活规矩留顶层，已落地方案的档案进 `docs/landed/`（2026-10-04）

**判据**（一句话，落在 [conventions.md § L0 内部：活规矩与已落地档案](./docs/conventions.md#l0-内部活规矩与已落地档案)）：
**这份文档还约束「现在怎么写代码」吗？** 还约束 → 留 `docs/`；只解释「当时为什么这么做、怎么做
的、被什么推翻过」→ 进 `docs/landed/`。原第 8 项那句「方向是分层而不是继续加规矩」照办：**没有
新增任何判据类规矩**，只是给已有的东西一个位置。

**落点**：`git mv` 三份（`git` 认得出是重命名，历史不断）：

| 搬走的 | 行数 | 为什么它是档案 |
|---|---|---|
| `capability-elevation-plan.md` | 451 | 头部自述「各 PR 已全部落地…下文保留为设计依据与验收门槛，**不是待执行工单**」 |
| `proxyjump-plan.md` | 270 | 「本方案**全部落地**；只剩多跳链明确不做」 |
| `ci-scripts-plan.md` | 164 | 「**已执行**（方案 A + B）…本文是执行记录 + 设计依据」（原估里没算它，同性质） |

**没搬的，以及为什么**（这一半同样重要）：

- `i18n.md` 留在顶层——它是「方案 + **规范片段** + 进度表」的混合体，`check-i18n` 的报错就指着
  它的 § 键名规范；按判据它仍约束「今天怎么写 i18n」。**不为整齐去劈开一份混合文档**。
- `pr-body-dsh-market.md` / `community-submission.json` 留顶层——**对外投稿物**，归属表本来就要求
  保留原路径（市场可能按 `@main/docs/` 的 URL 取）。
- `devdata-plan.md` 留顶层——**活方案**（A/B 两组还开着），它的 §17 落地记录按上面的判据本该切出去，
  但切它要改一批 `#锚点` 引用，**本轮刻意没做**（记在下面「没做的」）。

**要动的机制（不是只搬文件）**：`scripts/docs-index.mjs` 原先只扫 `docs/` 顶层——搬完之后那三份会
**掉出「每一份都被归属表登记」的覆盖**，等于给新目录开一个盲区。所以：

- 新增 `collectDocs()`：递归收两层，清单项写成**相对 `docs/`** 的路径（`landed/xxx.md`）；
- `parseAttributedDocs` 的链接形状放宽到允许 `/`（登记项 `./landed/xxx.md`）；
- 归属表新增一行「**已落地方案的档案**」，并把三行登记项改成 `./landed/…`；
- `README.md` 的文档地图那一行改成「活规矩在 `docs/`、已落地的搬进了 `docs/landed/`」。

**门槛**：`scripts/test/docs-index.test.ts` 加两条——① 正向：`landed/` 里的档案**真的**被收进清单
（命中 0 = 分层悄悄退回去）；② 反例：一份合成的 `landed/nobody-registered-me.md` **必须和顶层文件
同权地报 `doc.unregistered`**（这就是「只扫顶层」那个盲区本身）。加上既有的反例 1 改成搬后路径
（`./landed/capability-elevation-plan.md`），以及一条「**历史 `git show` 路径不许被分层改写**」
（v1 那份在 `79ca434e` 时住在 `docs/` 顶层，改了就取不回来）。实测：`docs-index` 报
「docs/ 共 14 份 markdown；已登记 14 份」（11 顶层 + 3 档案），套件 37 → **39 条全绿**。

**另一件必做**：搬走的文件里外所有相对链接都要跟着改一层——`docs/landed/*` 内指向同级文档的
链接多一层 `../`、指向仓根的链接多一层（`check-doc-links` 会拦），外部约 15 处引用（本文件、
`conventions.md`、`ci-script-truth.mjs`、`tty`/`docker` 的 README 与 ROADMAP）同步成 `docs/landed/…`。

**刻意没做的**：劈开 `devdata-plan.md` 的 §17 落地记录（改锚点面太大，留给下一轮）；`i18n.md`
的逐包进度表同理——两者都记进各自文件，不在这里重述。

**没验到的**：这次改的是文档结构与守卫，**没有真机面**（`docs-index` / `check-doc-links` / 全量单测
都是静态的，已经全绿）。

### 9. ✅ 开发数据套件三包入库：一条提交 338 文件 + 状态真源收敛到三个包

**落点（2026-10-03，提交 `b25ccc5c`，本地未 push）**：三包（`devdata` / `devenv` / `devfront`）
+ L0 方案 + `kit` 的新增导出与全仓钉子同步（0.5.1 → 0.6.0：`ssh-exec` / `tty-books` / `scope` /
`chrome-cdp` / `host-services`）+ `docker` 转再导出壳 + `docker/test` 四个 ssh 用例迁进 `kit` +
`scripts/` 的守卫与 `verify-*` + 根文档，**一条提交**入库。

**为什么合成一条而不是拆三条**：拆出来的中间提交在**本机不可能绿**——workspace 现算包含那三个
包，而 `docs-index` 判据 5 要求 `architecture.md § 2` 行数与之相等：只提交文档会得到「清单 15 行 ↔
仓库 12 包」，只提交包又会得到反向漂移。中间态只能靠先移走未跟踪目录来伪造，而那本身是「删除/改名
文件」那一类要先问的动作。

**顺带收掉的三件**：① `devenv` 与 `devdata` 的缺陷台账都立起来了（`D01`–`D02` / `D01`–`D09`，
后者是**补立**的号，此前只以叙述形态住在 `devdata/ROADMAP.md` 的 记-12 / 记-14 / 记-16）；
② 收敛三包的旧陈述（11 处，含 plan §16.1.2 与 §16.1.3 自相矛盾一处）；③ 真实公网地址与业务域名
按闸门口径换成占位（RFC 5737 / `example.com`），真机用例的默认主机改为必填。

**门槛（已验）**：`pnpm -r build` → 产物闸门干净；`pnpm test` 154 文件 / 2484 用例绿；`pnpm -r
typecheck` 绿；`pnpm aggregate` 无差异；`docs-index` / `check-doc-links` / `defects-table` /
`ci-script-truth` / 公网 IP 闸门全过；`git ls-files packages/devdata packages/devenv packages/devfront`
非空。两道 git 钩子在**两次**提交上都真跑过（`commit-msg` 那次还拦下了我在提交信息里写的一个
IP 形状的四段式子节号——闸门确实有牙齿）。

### 10. ✅ 两套容器写入口的口径：只在一边开门（2026-10-03）

**落点**：[devdata-plan.md § 13.1](./docs/devdata-plan.md) —— 结论与代价成文（两边的门**逐项对照**：
粒度 / 授权来源 / 作用面 / 逐次确认 / 持久审计），并写清「为什么不选『让 docker 也认一份清单』」
与「什么时候该重审」。互相指认的三处：`packages/docker/README.md` 的 `allowMutations` 行、
`packages/devenv/README.md` 的写入口小节、`packages/devenv/ROADMAP.md` 记-8。

**门槛（已验）**：两边的门是**读代码读准**的，不是复述记忆——
`docker` 的有效值 = `section.allowMutations === true && capabilityGranted(CAP_MUTATIONS)`，且有
**两条**提权通道（启动环境 + 就地提权）；`devenv` 的 `writeCapability` **只认启动环境**
（无客户端半体 ⇒ 无就地提权），另有逐次 `confirmed` 与（今天起）写类要求持久审计。

**诚实的边界**：这条规矩**只有文档、没有守卫**——它约束的是**人的部署动作**，今天仓库里没有
「同一目标不许出现两条容器写入口」这种可判定的配置面。文档里写明了将来若合并，
合的方向是「一处声明、两处生效」（像 tty 连接簿那样），那才是可守卫化的形态。

### 11. ✅ 凭据解析一份实现 + `devfront` 用上它（2026-10-04）

**落点**：

| 落点 | 内容 | 门槛（已验） |
|---|---|---|
| `packages/kit/src/credentials.ts`（新） | 凭据引用解析的**唯一实现**：`CredentialResolver` 结构类型、`resolveCredentialVia`（返回值 **+ 来源层** + 走的路）、`resolveSecretVia` / `resolveSecret`（值那条老路径）、按 **owner** 绑定的 `setCredentialResolver` | `packages/kit/test/credentials.test.ts` **13 条**：provider 优先 / env 兜底 / 三种「拿不到」各说各的话 / provider 抛错不吞 / **owner 绑定（该 bug 的回归钉子）** |
| `packages/kit/src/index.ts` | 进**主入口**（零依赖）。理由写在那里：`devfront` 只要 30 行解析，不该为它 import 一条会把 `ssh2` 拉进来的子路径 | `pnpm typecheck` 全仓；`packages/kit/src/ssh-exec.ts` 改成再导出，子路径公开形状一字未改 |
| `packages/tty/src/ssh.ts` | 那份**第二实现**（比 `kit` 多一条「引用存在但值为空串」的分支）删除，改成再导出；两条分支合成一份时**以更细的那份为准** | `tty` 793 条用例全绿（含 `host-smoke.test.ts` 里那两条报错语义） |
| `packages/{tty,docker}/src/index.ts` | 绑定带上 owner（`'tty'` / `'docker'`） | 见下面「顺带修好的缺陷」 |
| `packages/devfront/src/credential.ts`（新） | 来源层 → **保护强度**（`none` / `weak` / `strong` / `unknown`）；`resolveTargetCredential`（失败**不抛**，给一句能行动的话） | `packages/devfront/test/credential.test.ts` **10 条** |
| `packages/devfront/src/page.ts` / `plugin.ts` | `site_fill` 的值二选一：明文 `value` 或 `credentialRef`（`env:NAME`）。判定层三条新码：`CREDENTIAL_AND_VALUE` / `CREDENTIAL_NOT_DECLARED` / `CREDENTIAL_UNRESOLVED`；**只认目标 `credentialRef` 声明过的那一个**；解析在执行那一步由宿主注入；回显与审计里只有**引用名 + 强度**，永远没有值 | `page.test.ts` +8、`tools.test.ts` +3（假宿主，不碰浏览器）、`tool-contract.test.ts` +2、真机冒烟 +2 |
| `scripts/test/credential-single-source.test.ts`（新守卫，L0） | ① 实现只有一份（别处只许再导出，附反例）② 每个绑定点都要带 owner（附反例；**判前先去注释**——`tty` 的说明注释里就写着旧写法） | 6 条全绿 |

**顺带修好的既有缺陷（`devfront` 不是唯一的受益者）**：绑定的载体从前是一个**进程级单例槽**，
而 `ctx.inject(['credentials'])` 的收尾是 `return () => setCredentialResolver(null)` ——
**`tty` 与 `docker` 谁先卸载，谁就把对方的凭据通道一起关掉**（此后静默退回 `process.env`，
症状是「刚才还能连，现在报凭据未设置」；而用户没改过任何配置）。今天改成 `owner → provider` 的映射：
卸载只摘自己那一份，`resolveSecret()` 取最近绑定的那一个。这一条**必须有守卫**——它错起来毫无症状。

**一条刻意的边界**：`devfront` **不绑**那个单例，它按 `apply` 持有自己的服务引用并交给每次调用。
新消费者没有理由再往一个共享槽里写。

**两处刻意没合**（写进 `devfront/src/credential.ts` 的头注，免得下次有人顺手合）：

- `devdata` 的 `credential.ts` 说的是「**计划里打算用哪种方式取**」（process-env / file / command /
  keychain / remote），而本项这份说的是「**这次值实际来自哪一层**」（provider 给的 `env` / `file` /
  `project-env` / `user-env`）——两条轴，不是一份事实的两个副本。合并要等第三个消费者；
- 「一次发布之后怎么验」那件事（`devfront` 待办 D8 的尾边）仍然不在本项里。

### 12. ✅ 四条长等待全部转发 `exec.signal`（2026-10-04）

**落点**：

| 落点 | 内容 | 门槛（已验） |
|---|---|---|
| `devenv` 的 `env_wait` | 见 devenv 记-12（抽成 `src/wait.ts`，顺带把等待过程做进报告） | `test/wait.test.ts` 12 条（假时钟）+ `plugin.test.ts` 真时钟取消一条；反例：去掉转发等满 20s 才失败 |
| `tty` 的 `tty_expect` | abort 监听 + 已取消的快路径；结果多一档 `cancelled`（**不是超时**，且不消费未读区——水位线不动，重发还能回溯同一段） | `test/expect-backlog.test.ts` 2 条：等待期间取消 → 立刻结算；已取消的信号 → 立刻结算（都在 600s 上限下跑，实测 < 2s） |
| `tty` 的 `tty_run` | `waitForSessionExit` 三态化（`exited`/`timeout`/`cancelled`）；取消**不关会话**——取消的是这次工具调用，不是那条命令 | `test/tty-run.test.ts` 2 条；**反例实测**：去掉转发两条都等满 20s 超时 |
| `devfront` 的 `site_verify` | 每一页之前看一次信号（一次跑批可能开好几个页面）；没跑到的断言判 `unknown` 并说明「不是超时、也不是页面有问题」 | `test/web-run.test.ts` 3 条（取消中途 / 已取消 / 未取消时 `cancelled:false`） |
| 规矩 | [conventions.md § 工具面：长等待的工具必须转发 `exec.signal`](./docs/conventions.md#工具面长等待的工具必须转发-execsignal)：判据（等待上限 ≥ 30s）、四条要求、执行点（runtime 用例而不是静态扫描，附理由） | 规矩正文 + 四组用例；`docs-index` / 文档链接闸门全过 |

**为什么执行点不是静态守卫**：判「这个 `execute` 有没有接第二个参数」要 AST 级提取（本仓的
文本守卫会被注释与同名参数骗到，`credential-single-source` 那条就因为注释假红过一次）。
而 runtime 用例直接验「取消之后多久返回」——没接线时它会一直等到自己的上限或测试超时，
两边的差距是数量级，**不会因为代码搬家而恒绿**。

**没验到的**：`docker` 的日志跟随**不在判据内**（它的长活在面板 SSE 流上，工具本身是一次快照）；
如果将来出现「等流结束」的工具，按这条规矩补。

### 13. ✅ 三张卡片的**客户端路径**都补上真机证据（2026-10-04）

**落点**：`scripts/verify-devdata-card.mjs` 新增 **㉕㉖**：

| 步 | 内容 | 门槛（已验） |
|---|---|---|
| ㉕ | 真 Chrome 里点「+ 添加目标」→ 往新行的 **10 个字段**写值 → 勾确认框 → 点保存 → 卡片回「目标已保存（进审计）」 | 行数 3→4、`fieldCount:10`、engine=`sqlserver` / env=`dev`（从**真实 options** 里挑的第一个非空值） |
| ㉖ | HTTP 复核：`dd-dom` 在位，`engine` / `env` / `port` 与刚填的一致 | `ids=[redis-248,redis-two,redis-three,dd-dom]` |

**两处技法**（`devenv` 那一半就是照抄这两条的）：

- **确认框要在嵌套的那层卡片里找**（`.dd_targets` → `closest('.dd_card')`）：卡片里还有标量的
  复选框，`card.querySelector('input[type=checkbox]')` 会先命中它，于是「勾了确认」是假的；
- **React 受控输入必须走原生 setter + 事件**：文本框 `input`、下拉框 `change`；只改 `.value`
  时 React 的 value tracker 不认，提交上去的还是旧值/空值——而这条在静态闸门里完全看不见。

**没抓到的**（如实记）：㉕㉖ 一次过，本轮没有新缺陷。价值是把「静态闸门看不见的那一类」纳入
每次 `card-smoke`（23 → 25 条）。

**另一半（`devenv`，同日）**：`scripts/verify-devenv-card.mjs` 新增 **㉓㉔㉕**——卡片上真的加一行 →
填 5 个控件（含 `kind` 下拉）→ 勾确认 → 点保存 → HTTP 复核 `dv-dom` 的 `kind` / `book` / 两个作用域，
外加「这条写入口也**没抹掉**写闸门」；当天复跑 **24 PASS / 0 FAIL**（21 → 24）。它的反例在那边
**实测过**：扣掉下拉框的 `change`，**㉓ 照样 PASS**、只有 ㉔ 红——所以「DOM 那条」与「HTTP 复核那条」
**必须成对**（前者管这条路走得通，后者管走出来的东西是对的）。

**口径上提 + 守卫**：规则落在
[conventions.md § 客户端卡片](./docs/conventions.md#客户端卡片改配置那条路要有真机-dom-证据)；
**在不在**由 `scripts/test/card-dom-path.test.ts` 守（三张卡片 × 五条判据 + 六条反例——
这三个脚本进不了 CI，删掉那一段原本没有任何东西会红）。

### 14. ✅ 一次发布的证据链：口径 + 跨包守卫 + 一处不对称（2026-10-04）

**落点**：

- [conventions.md § 一次发布的证据链](./docs/conventions.md#一次发布的证据链同一个项目名三份清单)
  ——三份清单并列（`ready/<项目>.ready.yaml` / `verify/<项目>.yaml` / `web/<项目>.yaml`）+ 三条约束
  （只读、不做发现、项目名只有一处）；
- `scripts/test/release-chain.test.ts`（新，7 条）：一个项目目录、三份清单、三个面各认自己那份
  （**互不读取**）；三份路径并列钉住；项目名串了三个面都当配置错误；外加一条 **tripwire**。

**实测出来的不对称**（本项最值钱的一条，用代码钉的）：`devenv`（`env_status` / `env_wait`）与
`devfront`（`site_verify`）各有一个 agent 工具在读自己的清单，而 **`devdata` 的
`verify/<项目>.yaml` 在 `packages/devdata/src/verify.ts` 之外没有任何消费者**——真机启动日志里它
注册的四个工具（`devdata_list_targets` / `devdata_redis_command` / `devdata_doctor` /
`devdata_capabilities`）没有一个是清单驱动的。所以「三面按同一个项目名跑同一批清单」这句
**对容器与页面成立、对数据面还差一个入口**；要不要补那个入口是**另一件**（名字、门槛、清单里
`statement` 的表达力都要先定），已记进 `packages/devdata/ROADMAP.md` 待办 21。
守卫里那条 tripwire 就是这件事的针：**接上之后它会红**（反例实测过：在 devdata 里临时加一个
`loadManifest(` 调用，它立刻报出「已经有工具面消费者了，改成正向断言」）。

**2026-10-04 当天补上**：「对数据面还差一个入口」已闭合——`devdata` 新增 agent 工具
`devdata_verify`（按 `verify/<项目>.yaml` 逐条跑只读断言：`pass` / `fail` / `unknown` 三态，
**「没验成」与「验出问题」分列**、逐条进审计；今天只接得住真能跑的 Redis，清单里 SQL / RocketMQ
的断言逐条报「没验成」而不是假装跑过）。守卫里那条 tripwire 已按它自己的提示翻成正向断言
（+ 反例，删掉消费者就报空）；落点与门槛见 `packages/devdata/ROADMAP.md` 记-20。

**没做的**（刻意）：**不建聚合器**。「这次发布该验哪些项目」是发现逻辑，而「不做发现」是三包共同的
边界；`devfront` 的 `D8` 已把「一次调用跨多个项目」明确留着（真要做，先得有一条由人给出的发布清单）。

### 15. ✅ 发布清单 + `site_verify_release`：一次调用跨多个项目（2026-10-04）

**落点**：

- [conventions.md § 发布清单](./docs/conventions.md#发布清单由人给出的这次该验哪些项目)——
  形态（路径 / 字段 / `root` 相对谁）、谁读（**各面读自己那一列，不是聚合器**）、不做发现、缺省即无、
  两种拒绝分开（配置错误 vs 「没验成」）；
- `packages/devfront/src/release.ts`（加载 + 校验，14 例）与 `release-run.ts`（跑批执行器，
  依赖全注入：8 例，含取消补账与两处反例）；
- `packages/devfront/src/plugin.ts` 的 `site_verify_release` + `releaseOutput` / `releaseRenderText`
  （每个项目复用 `verifyOutput`，同一份账不写两遍）；
- 守卫 `scripts/test/release-chain.test.ts`（13 例）：发布清单列的项目 ↔ 那个项目里三份清单的项目名
  逐一对齐 + **三条反例**（某一份清单项目名串了 / 项目里没有清单 / 发布清单里的名字与目录里的对不上）。

**真机证据**：`test/tool-smoke.test.ts` 的 ★ 新用例（**真 Chrome** + 本地站点 + 三个项目：
一个过、一个失败、一个没有清单）——两个项目各自读自己的清单跑出 `pass` / `fail`，第三个记
「没验成」并说清路径，整批 `fail`（`fail` > `unknown` > `pass`）。该文件 17/17；`devfront` 卡片脚本
18 PASS / 0 FAIL——它的第 ⑲ 步钉的就是「**真 ToolRuntime 恰好收下八个工具**」（手写 schema 那条路
只有真宿主回答得了：假宿主对 schema 照单全收）。

**没做的**（刻意）：**不跨面聚合**（发布清单里只有本面要用的 `target`，另外两面要接时各读自己那一列
——conventions 的「刻意没有聚合器」不变）；**B3 的登录编排**留待下一轮（声明形态已定
`WebTarget.login`，主体可写 `web/sites.yaml`）。
> **2026-10-04 追加**：那一轮做了，见本文件第 16 项与 `devfront` 记-32。原文照旧留着。

### 16. ✅ 登录编排：`devfront` 的 `site_login`（2026-10-04，B3 收口）

**落点**：

- [plan §15.3](./docs/devdata-plan.md) 的边界条补上「编排那一半也落地」：流程写进站点声明
  （`WebTarget.login`），`site_login` **不接受现编的步骤**、步数 ≤10、单步等待 ≤15s、
  **总预算 120s 不可声明**、`success` 只有 `selector` 一种（`url` 前缀判据可能恒真）；
- `packages/devfront/src/login.ts`（声明形态 + 判定，20 例，含 8 条反例）与 `login-run.ts`
  （执行器：三态 + 逐步的账 + 等待 + 预算 + 取消自成一档，13 例，依赖全注入不连浏览器）；
- `packages/devfront/src/plugin.ts` 的 `site_login` + `loginOutput` / `loginRenderText` /
  `loginOutputSchema`：整体性问题在**碰浏览器之前**抛，**条件注册**（有站点声明 `login`、或
  打开了 `projectSitesFile`），协作式预算 `timeoutMs: 180_000` 并转发 `exec.signal`；
- 配置层：`TARGET_SCHEMA.login = z.any()`（唯一判据在 `login.ts`）+ `normalizeConfig` 原样携带 +
  `normalizeTargets` 严格校验不丢行；客户端半体的站点编解码**透传** `login`。

**真机证据**：`test/tool-smoke.test.ts` 三条 ★（真 Chrome + 本地登录夹具）：`ok`（六步全过、值进页面
但不进报告——同一次调用后 `site_text` 从页面里读出了那个值）、`fail`（步骤都走完、判据 0 命中，
渲染明说「别把这次会话当作已登录」）、`unknown`（第一步 `OUT_OF_SCOPE` 被拒、判据没求值）。
该文件 17 → 20/20；卡片脚本新增第 ⑳ 步（站点编辑保存之后 `login` 还在——**这条只回答得了真机**）。

**补充第 12 项**（长等待的工具必须转发 `exec.signal`）：`site_login` 是**第五条**——它的等待上限
（总预算 120s + 一次导航兜底）远超 30s，所以按那条规矩做全了四条（接 `exec.signal`、睡眠可被 abort
唤醒、取消自成一档并交代「动作没回滚、页面还在」、声明协作式预算）：证据是
`login-run.test.ts` 里那条**真实睡眠**用例（abort 后 <1s 返回，而它的上限是 5s）。

### 17. ✅ 统一视图 + 只读数据浏览面：**两个第一版都落地了**（2026-10-04）

**落点**：

- [conventions.md § 一次发布的证据链](./docs/conventions.md#一次发布的证据链同一个项目名三份清单) 那份口径
  **第一次有了人看的界面**：卡片里一区「项目证据链」（`packages/devdata/src/evidence.ts` +
  `POST /api/dsh-devdata/evidence`）——三面清单的存在性 / 可否解析 / 项目名是否一致 / 条目数，
  **不报结论**（结论归 `env_wait` / `devdata_verify` / `site_verify`），Jenkins 那一格明写「未接」；
- 卡片里另一区「看数据」（`POST /api/dsh-devdata/query`）——**面板不是特权路径**：路由把请求交给
  `invokeRedisCommand`，与 agent 的 `devdata_redis_command` **同一个函数**，所以未授权的写命令在
  两边是**同一个拒绝码**、作用域按调用方给的 `cwd` 判、每次调用进**同一本审计**；
- 跨包对齐守卫：`scripts/test/release-chain.test.ts` 让 `EVIDENCE_FACES` 的三条路径与
  `devenv` / 本包 / `devfront` 各自的路径函数**逐一对齐**（后缀写错的表现是「这个项目没有清单」——
  假阴性，静态看不出来）；
- 两项的判据与代价先落在 [plan §9](./docs/devdata-plan.md) 那两行（从「后置」提成可验收条目）。

**门槛（真机实跑）**：

| 卡 | 命令 | 结果 |
|---|---|---|
| `devdata` | `pnpm --filter @hyzyn/dsh-devdata run card-smoke` | **30 PASS / 0 FAIL**（新增 ㉗㉘ 证据链客户端路径 + ㉙㉙a㉚ 看数据：假 Redis `PING` → `PONG` 真的渲染出来；`SET` → `CAPABILITY_NOT_DECLARED` + 恢复路径 + 审计 `allowed:false`） |
| `devenv` | `pnpm --filter @hyzyn/dsh-devenv run card-smoke` | **24 PASS / 0 FAIL**（没动它，复跑确认契约没被带坏） |
| `devfront` | `pnpm --filter @hyzyn/dsh-devfront run verify` | **20 PASS / 0 FAIL**（同） |
| 自证 | 三次真机各自收尾 | 真实 `~/.dsh/cordis.patch.yml`（1086 字节）**逐字节未变** |

**没做的**（本项只承诺「第一版」，完整的 P13/P14 仍在待办 17 下）：Jenkins 那一格没有通路；
容器 / 页面两格只报清单形状、不是活状态；看数据只做命令原文、没有表格化浏览；两项都住在
`devdata` 的卡片里，没有独立侧边栏面板。

## 已由 L0 资产承接（不再是待办）

| 曾经的形态 | 现在的归属 |
|---|---|
| 「客户端半体不许从 `location` 拼地址」散在各包注释里 | 已固化为仓库级静态规则 `scripts/client-host-url.mjs`（覆盖全部客户端半体）+ [conventions.md § 客户端半体](./docs/conventions.md#客户端半体三条硬规矩) |
| 「卡片引用了宿主主题里不存在的样式变量 → 框整条消失」只在真机上被肉眼发现 | 已固化为仓库级静态规则 `scripts/client-theme-tokens.mjs` + `client-lint` 检查 ③（宿主主题名字快照 403 条，覆盖全部客户端半体）+ [conventions.md § 客户端半体 ③](./docs/conventions.md#客户端半体三条硬规矩) |
| 跨包 DSH_HOME 推导各自一份 | 全仓改走 `@hyzyn/dsh-kit` 的 `dshHome()`，`scripts/check-dsh-home.mjs` 守卫（**codegraph CG35**） |
| bundle 补丁重复挂载 | [troubleshooting.md](./docs/troubleshooting.md#安装与挂载) 记症状与成因 |
| CI 产物闸门对 `lib/` 恒绿（pathspec `'packages/*/lib'` 命中 0 个文件） | **2026-09-25 已修**：`.github/workflows/ci.yml` 换成 `':(glob)packages/*/lib/**'`，并在该 step 注释里记下这个坑。闸门细节与实测命中数见 [docs/conventions.md § 真机脚本与 CI 接线](./docs/conventions.md#真机脚本与-ci-接线) |
| 文档链接闸门只能手动跑 | **2026-09-25 已接线**：`scripts/check-doc-links.mjs` 进 CI（ubuntu-only step），白名单 3 条跨仓相对链接 |
| `docs/capability-elevation-plan.md` 的 **v1**（它设计的「宿主终端确认码」通道在代码里不存在） | **2026-09-27 删除**（改名后的 v2 占了这个文件名）：内容在 `79ca434e` 已入库，`git show 79ca434e:docs/capability-elevation-plan.md` 取回（223 行；`grep -c terminal-code` = 9，即那份文档的特征段落还在）。**这份文档本体 2026-10-04 已搬进 [`docs/landed/`](./docs/landed/capability-elevation-plan.md)，但上面的 `git show` 路径不许跟着改**——v1 住在顶层时才有那个路径 |
