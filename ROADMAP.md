# 项目路线图（跨包）

> **本文只放「要同时改 ≥2 个包」的项。** 判据见
> [conventions.md § L0 / L1 的边界判据](./docs/conventions.md#l0--l1-的边界判据)：
> **改一个包就能做完 → 该包自己的 `ROADMAP.md`；要同时改 ≥2 个包，或要动 CI / 脚本 / 规范 → 本文。**
>
> 包内待办在 `packages/<pkg>/ROADMAP.md`（当前有：`docker` · `tty` · `codegraph`）。
> 缺陷按编号记在各包 `DEFECTS.md`，不在本文。
> 本文每一项在动手前先转成可验收条目（做完回填「落点 + 门槛」）。
>
> **状态标记**：标题带 ✅ 的是已落地的条目（原文保留作历史，落点与门槛见
> [§ 已完成](#已完成落点--门槛)）；未标 ✅ 的才是待办。2026-09-25 一轮做掉 1 / 4，
> 以及 2 的「短期至少做到」那一半（2 的完整实现仍开着）。

## 待办

### 1. ✅ 统一安全围栏：把 docker 的加固口径同步到 tty / dsh-mcp

> 自 `packages/docker/ROADMAP.md` 迁入（2026-09-25），原文照录：

与 docker 同款的 loopback 围栏加固（**docker D31/D32**）尚未同步到这两个包。
这里只记**结论**，不在公开文档里展开具体手法；要做的话直接对齐 `src/index.ts` 里那两个函数。

**为什么是 L0**：要同时改 `tty` 与 `mcp` 两个包，且口径必须与 `docker` 一致——
三处各写一份必然漂。约定见 [architecture.md § 一条请求经过什么](./docs/architecture.md#7-一条请求经过什么)。

### 2. 跳板机（ProxyJump / ProxyCommand）

> **短期那一半已做**（2026-09-25，见 [§ 已完成](#已完成落点--门槛)）：导入跳过 + 明说、
> 超时/探测文案点出成因。**完整实现（真的经跳板机连）仍开着，方案已写进
> [docs/proxyjump-plan.md](./docs/proxyjump-plan.md)**——字段形状、`forwardOut → sock` 的构造序列、
> 生命周期与清理、连接池键、探针与 UI、约 20 处扁平白名单的清单、五步落地顺序与真机验收
> 都在那边（本文不重复）。**动手前先读那份方案**，它是这项的唯一作业面。

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

### 3. 面板端 i18n（**方案 + 闸门 + 首批接入已落地**，逐包搬运进行中）

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

### 5. 变更端点的信任模型：一次性 token

> 自 `packages/docker/ROADMAP.md` 迁入，原文照录：

当前信任模型是 loopback + 同源证明（**docker D31/D32**）；本机任意进程仍可直接读写配置
（它能先 `POST /config {allowMutations:true}`）。docker socket 等价目标主机 root，值得再收紧。

**为什么是 L0**：这不是 docker 一家的性质——**任何**走回环围栏的插件都接受本机任意进程的请求。
要收紧就得定一套全仓通用的机制（如一次性 token 交换），单包先做会在插件之间留下不一致的安全假设。
与第 1 项同属「安全围栏」这条线，**建议合并规划**。

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

### 2.（短期一半）✅ 跳板机：不再静默产出一条注定超时的条目

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
`packages/docker/test/ssh-stream-budget.test.ts` 的超时文案断言。

**完整实现仍开着**（真的经跳板机连）：方案、七个坑（超时归属 / `poolKey` / TOFU 键 /
bastion 生命周期 / `ProxyCommand` 信任级 / 约 20 处扁平白名单 / 导入的别名解析）、五步落地
顺序与真机验收**全部在 [docs/proxyjump-plan.md](./docs/proxyjump-plan.md)**——那份文档是这项的
唯一作业面，本文只留这句指针，避免两边各写一份（这一项立项的理由就是「三处各写一份必然漂」）。

**刻意不做**：不做「只让 tty 能过 bastion、docker 不行」的半吊子（原文的判据：那比不做更糟）；
本轮也不动 `ProxyCommand`（信任级不同，要单独定闸门）。

### 4. ✅ `isConcurrencySafe` 未声明

**落点**：`docker` 的 11 个只读工具（`docker_targets` … `docker_volumes`）与 `tty` 的 9 个
只读工具（`tty_list` / `tty_stats` / `tty_capture` / `tty_screen` / `tty_expect` /
`tunnel_list` / `sftp_list` / `sftp_read` / `sftp_tree`）声明 `isConcurrencySafe: () => true`；
五个 docker 变更工具与七个 tty 变更工具**刻意不声明**（宿主按独占处理，多声明一次就是
两个 `docker_action` 并发跑）。

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

### 3. 面板端 i18n：方案 + 闸门 + 首批接入 ✅（逐包搬运仍待办）

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

**仍待办（逐包，属各包自己的 L1 工作）**：8 个包按方案片段搬运，顺序与各包风险
（innerHTML 重构、中文断言、包体量）见 [docs/i18n.md § 进度表](./docs/i18n.md#进度表)。
总量最大的三个是 `codegraph`（约 240 条）、`tty`（212）、`docker`（186）——其中
`docker/scripts/client-smoke.mjs` 有 12 条「断言等于中文」+ 52 条中文正则，搬它之前先想清楚
断言改成什么口径。

## 已由 L0 资产承接（不再是待办）

| 曾经的形态 | 现在的归属 |
|---|---|
| 「客户端半体不许从 `location` 拼地址」散在各包注释里 | 已固化为仓库级静态规则 `scripts/client-host-url.mjs`（覆盖全部客户端半体）+ [conventions.md § 客户端半体](./docs/conventions.md#客户端半体两条硬规矩) |
| 跨包 DSH_HOME 推导各自一份 | 全仓改走 `@hyzyn/dsh-kit` 的 `dshHome()`，`scripts/check-dsh-home.mjs` 守卫（**codegraph CG35**） |
| bundle 补丁重复挂载 | [troubleshooting.md](./docs/troubleshooting.md#安装与挂载) 记症状与成因 |
| CI 产物闸门对 `lib/` 恒绿（pathspec `'packages/*/lib'` 命中 0 个文件） | **2026-09-25 已修**：`.github/workflows/ci.yml` 换成 `':(glob)packages/*/lib/**'`，并在该 step 注释里记下这个坑。闸门细节与实测命中数见 [docs/conventions.md § 真机脚本与 CI 接线](./docs/conventions.md#真机脚本与-ci-接线) |
| 文档链接闸门只能手动跑 | **2026-09-25 已接线**：`scripts/check-doc-links.mjs` 进 CI（ubuntu-only step），白名单 3 条跨仓相对链接 |
