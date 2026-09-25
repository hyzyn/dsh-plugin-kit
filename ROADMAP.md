# 项目路线图（跨包）

> **本文只放「要同时改 ≥2 个包」的项。** 判据见
> [conventions.md § L0 / L1 的边界判据](./docs/conventions.md#l0--l1-的边界判据)：
> **改一个包就能做完 → 该包自己的 `ROADMAP.md`；要同时改 ≥2 个包，或要动 CI / 脚本 / 规范 → 本文。**
>
> 包内待办在 `packages/<pkg>/ROADMAP.md`（当前有：`docker` · `tty` · `codegraph`）。
> 缺陷按编号记在各包 `DEFECTS.md`，不在本文。
> 本文每一项在动手前先转成可验收条目（做完回填「落点 + 门槛」）。

## 待办

### 1. 统一安全围栏：把 docker 的加固口径同步到 tty / dsh-mcp

> 自 `packages/docker/ROADMAP.md` 迁入（2026-09-25），原文照录：

与 docker 同款的 loopback 围栏加固（**docker D31/D32**）尚未同步到这两个包。
这里只记**结论**，不在公开文档里展开具体手法；要做的话直接对齐 `src/index.ts` 里那两个函数。

**为什么是 L0**：要同时改 `tty` 与 `mcp` 两个包，且口径必须与 `docker` 一致——
三处各写一份必然漂。约定见 [architecture.md § 一条请求经过什么](./docs/architecture.md#7-一条请求经过什么)。

### 2. 跳板机（ProxyJump / ProxyCommand）

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

### 3. 面板端 i18n

> 自 `packages/docker/ROADMAP.md` 迁入，原文照录：

界面只有中文；`README.en.md` 与中文版手工同步（**docker D76** 那类「文档里写死计数」的漂移
已经去掉，但双份维护的风险仍在）。

**为什么是 L0**：全部 10 个插件的界面都只有中文，要改就得一次改完（或先定一套 i18n 落地方案）。
单包先做会造出两套互不兼容的写法。相关的文档语言策略见
[conventions.md § 文档分档](./docs/conventions.md#文档分档)（中英同结构 / 简单包免英文）。

### 4. `isConcurrencySafe` 未声明

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

### 6. CI 产物闸门的 `lib/` 半边失效（**本轮只登记，不改 CI**）

> 2026-09-25 复核发现。用户已明确决定**本轮不动 `.github/`**，这里只登记事实与开工前的前置检查。

`.github/workflows/ci.yml` 的产物闸门只覆盖 `client.js`：那条 step 用的是
`git diff --exit-code -- 'packages/*/client.js' 'packages/*/lib'`，而 `'packages/*/lib'`
在 git 默认 pathspec 下**命中 0 个文件**（`*` 不递归目录内容）→ 闸门对 `lib/` 恒绿。
正确写法是 `':(glob)packages/*/lib/**'`。命中数、命令与完整说明见
[docs/conventions.md § 真机脚本与 CI 接线](./docs/conventions.md#真机脚本与-ci-接线)。

**为什么是 L0**：要动的是 **CI 资产**（仓库自己的边界判据），不是某一个包的事——
单包改不了 workflow，也不该由某个包的 ROADMAP 认领。

**现状差异（风险面到底有多大）**：`.githooks/pre-commit` 用的**是**正确写法，
所以本地提交防得住。风险面限于**绕过钩子的提交**：浅克隆、`--no-verify`、
或直接在 CI 环境里重建产物的人。也就是说这不是「已经漏了很多」，而是「兜底那层是空的」。

**修法**：把那一行的 `'packages/*/lib'` 换成 `':(glob)packages/*/lib/**'`——**一个 token**。

> ⚠️ **动它之前必须先验的一件事**：这条 CI step **一旦修好就真会拦**。若 `main` 上存在
> **未重建的入库产物**，改完会立刻让整条 CI 判红。所以开工第一步是确认 `main` 是同步的
> （本地 `pnpm -r build` 后按上面的正确命令自查一遍，干净了再改 workflow）。

## 已由 L0 资产承接（不再是待办）

| 曾经的形态 | 现在的归属 |
|---|---|
| 「客户端半体不许从 `location` 拼地址」散在各包注释里 | 已固化为仓库级静态规则 `scripts/client-host-url.mjs`（覆盖全部客户端半体）+ [conventions.md § 客户端半体](./docs/conventions.md#客户端半体两条硬规矩) |
| 跨包 DSH_HOME 推导各自一份 | 全仓改走 `@hyzyn/dsh-kit` 的 `dshHome()`，`scripts/check-dsh-home.mjs` 守卫（**codegraph CG35**） |
| bundle 补丁重复挂载 | [troubleshooting.md](./docs/troubleshooting.md#安装与挂载) 记症状与成因 |
