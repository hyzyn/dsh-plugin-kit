# 项目路线图（跨包）

> **本文只放「要同时改 ≥2 个包」的项。** 判据见
> [conventions.md § L0 / L1 的边界判据](./docs/conventions.md#l0--l1-的边界判据)：
> **改一个包就能做完 → 该包自己的 `ROADMAP.md`；要同时改 ≥2 个包，或要动 CI / 脚本 / 规范 → 本文。**
>
> 包内待办在 `packages/<pkg>/ROADMAP.md`（当前有：`docker` · `tty` · `codegraph`）。
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
> [docs/proxyjump-plan.md](./docs/proxyjump-plan.md) 的进度表）：两包加 `jump` 规格并补齐四道
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
> 边界与理由见 [docs/proxyjump-plan.md](./docs/proxyjump-plan.md) 第 6.1 节（闸门定案表）。

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

### 3. ✅ 面板端 i18n（方案 + 闸门 + 逐包搬运 10/10）

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
> [docs/capability-elevation-plan.md](./docs/capability-elevation-plan.md)——§0 是对手表与
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
**方案**：[docs/ci-scripts-plan.md](./docs/ci-scripts-plan.md)——现算 **14 处**写死路径（ci.yml 11 +
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

### 8. `docs/` 的活规矩与已落地档案混在同一层

现算（`wc -l docs/*.md`，2026-10-01 时点）：`docs/` 11 份 2558 行。其中三份**已落地方案的执行记录**
（就地提权 451 / 跳板机 270 / 面板端 i18n 252）合计 976 行 = **38%**；而每次改代码都要翻的活规矩
（`conventions` 419 / `agent-real-test` 290 / `architecture` 194 / `troubleshooting` 193）
合计 1096 行 = 43%。两组平铺在同一目录、同一张归属表里，新人打开的第一屏近四成是历史。

**为什么是 L0**：要动 `docs/` 结构与归属表。**这是可发现性问题，不是正确性问题**，不急；
真要动，方向是分层（例如 `docs/landed/`）而不是继续加规矩。

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

### 13. ✅（一半）卡片「客户端拼的 payload」要有真机证据（devdata 已做 / devenv 未完）

现算（2026-10-04）：三张私有包的配置卡片里，**站点/目标那一条编辑路**的真机 DOM 证据，
`devfront` 已在 2026-10-04 补上（`scripts/verify-devfront-card.mjs` 的 ⑰⑱：加行 → 填 7 个字段 →
勾只在 dirty 时出现的确认框 → 点保存 → HTTP 复核）；而 `devdata`（自己记着「客户端那一段的其余
分支（增删行、勾确认框）没有自动化证据」，见记-18）与 `devenv`（记-11 同理）**只点过标量那一次保存**。

**为什么是 L0**：要动 `scripts/`（两个真机脚本）+ 两个包的文档，且它是一条**跨包口径**——
「卡片提交的形状必须有一次真机 DOM 证据」应当写进 [conventions.md](./docs/conventions.md)
的客户端那几节，而不是三张卡片各记一遍。

**为什么值得**：`client.js` 不在 vitest 层；`client-lint` 管语法与地址来源、`check-i18n` 管键集，
**都不看 payload 长什么样**。devfront 的卡片前后被真机抓出过三条（`exports["./client"]` 缺失、
保存标量抹掉站点、详情页要注册 `bundle.config` 槽），三条静态闸门全绿。

**代价**：不做的后果是「卡片看着能改，保存后配置不对」这类问题只能靠人肉发现——而它恰好是
「本地全绿、真机必坏」那一类。

**结果**：devdata 的一半在本轮做掉（见 § 已完成第 13 项）；devenv 的一半仍未做（同款手法）。

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
方案与全部坑仍见 [docs/proxyjump-plan.md](./docs/proxyjump-plan.md)（第 6.1 节是闸门定案表）。

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
[docs/capability-elevation-plan.md](./docs/capability-elevation-plan.md)（v1 已删除，冻结指针见下表）。

**门槛**：`packages/kit/test/{capability,grant-store,elevation}.test.ts`、
`packages/docker/test/elevate-route.test.ts`、`packages/tty/test/elevate-route.test.ts`；
真机 `pnpm live-smoke`（18 条，两个实例的授权目录各自隔离 → kit D12）+ 待办第 5 项下面那张
真机验收表。

### 6. ✅ CI 与 `package.json` 的脚本双真相源：workflow 调包内条目（14 → 10 行）

**落点**：`ci.yml` 三个 step 的 `run:` 与 `release.yml` 那一步改成 `pnpm --filter <包名> run <条目>`
（tty 7 条 + docker 3 条并成一条 `smoke` + windows 1 条；docker 那三条**在两个 workflow 里各写了一遍**，
一起收敛）；step 数、`if:`、矩阵一律未动。真相源收敛到 `package.json`。
方案、rename 面、CI 影响与验收见 [docs/ci-scripts-plan.md](./docs/ci-scripts-plan.md)。

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

### 13. ✅ devdata 卡片的**客户端路径**补上真机证据（2026-10-04；`devenv` 那一半仍缺）

**落点**：`scripts/verify-devdata-card.mjs` 新增 **㉕㉖**：

| 步 | 内容 | 门槛（已验） |
|---|---|---|
| ㉕ | 真 Chrome 里点「+ 添加目标」→ 往新行的 **10 个字段**写值 → 勾确认框 → 点保存 → 卡片回「目标已保存（进审计）」 | 行数 3→4、`fieldCount:10`、engine=`sqlserver` / env=`dev`（从**真实 options** 里挑的第一个非空值） |
| ㉖ | HTTP 复核：`dd-dom` 在位，`engine` / `env` / `port` 与刚填的一致 | `ids=[redis-248,redis-two,redis-three,dd-dom]` |

**两处技法**（下一次补 `devenv` 时照抄）：

- **确认框要在嵌套的那层卡片里找**（`.dd_targets` → `closest('.dd_card')`）：卡片里还有标量的
  复选框，`card.querySelector('input[type=checkbox]')` 会先命中它，于是「勾了确认」是假的；
- **React 受控输入必须走原生 setter + 事件**：文本框 `input`、下拉框 `change`；只改 `.value`
  时 React 的 value tracker 不认，提交上去的还是旧值/空值——而这条在静态闸门里完全看不见。

**没抓到的**（如实记）：㉕㉖ 一次过，本轮没有新缺陷。价值是把「静态闸门看不见的那一类」纳入
每次 `card-smoke`（23 → 25 条）。

**仍缺的一半**：`devenv` 的卡片（目标名单那段）同为「只点过标量保存」。同款手法，落点与判据
已在它 README 的验证表里记着；本轮不做（一次改两个包的真机脚本会让「哪一条红了」变难定位）。

## 已由 L0 资产承接（不再是待办）

| 曾经的形态 | 现在的归属 |
|---|---|
| 「客户端半体不许从 `location` 拼地址」散在各包注释里 | 已固化为仓库级静态规则 `scripts/client-host-url.mjs`（覆盖全部客户端半体）+ [conventions.md § 客户端半体](./docs/conventions.md#客户端半体两条硬规矩) |
| 跨包 DSH_HOME 推导各自一份 | 全仓改走 `@hyzyn/dsh-kit` 的 `dshHome()`，`scripts/check-dsh-home.mjs` 守卫（**codegraph CG35**） |
| bundle 补丁重复挂载 | [troubleshooting.md](./docs/troubleshooting.md#安装与挂载) 记症状与成因 |
| CI 产物闸门对 `lib/` 恒绿（pathspec `'packages/*/lib'` 命中 0 个文件） | **2026-09-25 已修**：`.github/workflows/ci.yml` 换成 `':(glob)packages/*/lib/**'`，并在该 step 注释里记下这个坑。闸门细节与实测命中数见 [docs/conventions.md § 真机脚本与 CI 接线](./docs/conventions.md#真机脚本与-ci-接线) |
| 文档链接闸门只能手动跑 | **2026-09-25 已接线**：`scripts/check-doc-links.mjs` 进 CI（ubuntu-only step），白名单 3 条跨仓相对链接 |
| `docs/capability-elevation-plan.md` 的 **v1**（它设计的「宿主终端确认码」通道在代码里不存在） | **2026-09-27 删除**（改名后的 v2 占了这个文件名）：内容在 `79ca434e` 已入库，`git show 79ca434e:docs/capability-elevation-plan.md` 取回（223 行；`grep -c terminal-code` = 9，即那份文档的特征段落还在） |
