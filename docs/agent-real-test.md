# 真机测试：约束与 Runbook

> **本文是「AI 真机测试约束」的唯一归宿。** 平台环境搭建见
> [../scripts/windows/README.md](../scripts/windows/README.md)（Windows 11）；
> 通用排障见 [troubleshooting.md](./troubleshooting.md)。

## 为什么单开一层

**真机脚本进不了 CI。** 它们要真实 PTY、真实 SSH、真实浏览器、真实宿主，CI runner 给不了。
后果是：**真机脚本的正确性只能靠跑一遍**——静态断言可以守住「脚本里有隔离」，守不住
「拷两次不会崩」。

实测教训（`codegraph CG48`）：给 indexForce 脚本加的 `cpSync` 隔离**从没被运行过**，
第二轮往已存在的目标上拷时崩掉，于是「indexForce 真机验证通过」对其中一半是**假的**，
而 `verify-scripts-safety.test.ts` 全程绿。

所以本层的目标是：**让下一次真机测试不重踩同样的坑，且能判断「通过」是不是真的。**

## 三条硬约束

### ① 不污染用户的真实配置

被测插件会按 `dshHome()` 往 `$DSH_HOME/cordis.patch.yml` 写托管行。脚本若继承真实
`DSH_HOME`，就会把**指向临时目录**的行写进用户真实配置，脚本结束一 `rmSync`，
用户配置里留下一条指向不存在路径的托管行。

**做法**：给被测宿主**隔离的 `DSH_HOME`**——整份拷入被测 profile，组装产物与托管行全部落在
临时目录，真实 `~/.dsh` 全程只读。

**必须自证**：收尾加一条断言「真实补丁逐字节未变」，把「不污染」从承诺变成会被执行的检查。
（范本：`packages/codegraph/scripts/verify-codegraph-host-contract.mjs`，`codegraph CG45`。）

### ② 不把「环境限制」当成「代码回归」

受限沙箱下 `posix_openpt` 会被拒，`tty` 的 `integration.mjs` 会在 `[1] 全链路` 直接崩——
那是**沙箱限制**，不是回归。同样地，假的 docker 是 `#!/bin/sh` 脚本，`docker` 的路由冒烟在
Windows 上按设计跑不了（CI 里也是 ubuntu-only）。

**判据**：先问「这条在受限环境下有没有可能过」，再决定是修代码还是记成覆盖缺口。

### ③ 隔离与审批

- 文件策略通常是 `workspace-write`（只允许改仓库内）。把文件写到仓库外、或执行
  `prlctl` / 装包这类命令，需要**一次性的更宽权限**，逐条申请。
- 不要为了图省事把整台机器的权限要下来。逐条申请、逐条说明。
- **长驻进程用终端面板会话跑**（dev server / watch / 交互式程序），不要在一次性命令里挂起等待。

## 通用验证闭环

真机验证的骨架（平台细节见 `scripts/windows/README.md`）：

```sh
node -v ; pnpm -v ; dsh --version
# dsh 必须是**本仓 cohort**（= 各包 peer 下限），不是 npm 的 latest——低一档会让全部插件
# 被兼容性 preflight **静默**整行 disabled（宿主照常启动，日志里才有一行 disabling）

pnpm install
pnpm -r build
pnpm -r typecheck

# 关键一步：让插件与宿主共用同一份 @deepseek-ai/*
node scripts/link-dsh-runtime.mjs --dry-run
node scripts/link-dsh-runtime.mjs

# 测试 profile = 根 bundle + **Web 应用**
dsh plugin --profile <测试 profile> add link:$(pwd)
dsh plugin --profile <测试 profile> add "@deepseek-ai/dsh-web-app@<cohort>"
#   版本必须钉：裸包名解析到 npm 的 latest（0.0.1-rc.1），会被 preflight 正当地拒掉
dsh --profile <测试 profile> --dump-config

# 起宿主：用 patch 指定端口（`dsh --profile X web` 不是合法形式，见 scripts/windows/README.md）
dsh --profile <测试 profile> --patch <port.yml>
#   日志里出现 `dsh web: http://127.0.0.1:<port>/?token=…` 才算真起来了——「插件 mounted」不够
```

- **`link-dsh-runtime` 是必需的**：插件从本地路径加载时，Node 会解析到仓库 `.pnpm` 里那套
  `@deepseek-ai/*`，而不是宿主进程正在用的那套。升级 dsh 后会出两类**假象**——
  `instanceof` / schema 对不上报出与真实无关的错，或插件继续用旧 API 悄悄跑通、掩盖真实兼容性问题。
  详见 [link-dsh-runtime.md](./link-dsh-runtime.md)。
- ⚠️ **`pnpm install` 会重建 `node_modules`、冲掉这些链接**——装完依赖要重跑一次。
  pnpm 10 还会默认拦掉原生模块的构建脚本（esbuild / node-pty / ssh2 …），不补跑
  （`pnpm rebuild <pkgs>`）就打不出浏览器半体、真 PTY 也起不来。
- ⚠️ 别同时装 `@hyzyn/dsh-all`（或任一子包）与根 bundle，插件行重复挂载会报
  `duplicate loader entry id`。
- **用专门的测试 profile**（如 `compat` / `wintest`），不要用 `web`。
  **脚本里别写死 profile 名**——启动方式会变，写死会让断言在换 profile 时永久变红。
- **profile 里没有 `dsh-web-app` 时，宿主会「起来但没端口」**：进程活着、插件全 mounted、
  日志一切正常，`netstat` 里却什么都没有。阶段 B 的活体探针全部无从谈起——
  所以上面第 4 步那两条 `dsh plugin add` 缺一不可。

## 各包真机入口

| 包 | 脚本 | 需要什么 |
|---|---|---|
| `tty` | `scripts/integration.mjs`（真实 PTY 全链路）、`ssh-smoke.mjs`（内存 sshd）、`probe-smoke.mjs`、`probe-route-smoke.mjs`、`sftplimits-smoke.mjs`、`preview.mjs`（Chrome，界面场景）、`windows-smoke.mjs`（仅 Windows 有意义） | 真实 PTY / Chrome / Windows |
| `codegraph` | `scripts/verify-codegraph-host-contract.mjs`（真宿主路由与开关）、`verify-codegraph-agent-scope.mjs`（最小 Cordis 根）、`verify-codegraph-agent-integration.mjs`（真 `AgentRegistry` 驱动真 `agent/created`）、`verify-codegraph-indexforce.mjs`、`verify-codegraph-client-ui.mjs`（自起隔离宿主 + 真 Chrome） | 真 DSH 宿主 / 真 CLI / Chrome |
| `docker` | `scripts/smoke.mjs` / `route-smoke.mjs` / `client-smoke.mjs`（hermetic，能进 CI）；真机项需真 docker daemon | 真 docker |
| 全部 | `scripts/windows/setup-dsh-testenv.ps1 -WithRepo` | Windows 11 |

> **三层真机脚本的分工**（codegraph 的实践，可照搬）：
> **机制**（最小 Cordis 根 + 假 agent）→ **宿主契约**（真宿主，验路由 / 开关 / 托管行）→
> **集成**（真插件 + 真 `AgentRegistry` 驱动真事件）。
> 补第三层的理由：前两层全绿也**证明不了「用户开会话时功能真的生效」**——机制脚本用假 agent，
> 宿主脚本里没有 agent 被创建（每轮都是 `mounted=0`）。而全部价值就在那条路径上。

## Windows / Parallels 实测经验

> 2026-09-25 一轮 Windows 真机验证里实际踩到的坑，记下来省下一次重踩。

- **`prlctl exec` 以 SYSTEM 身份运行**，看不到某个用户的安装（SYSTEM 的 Node 装在
  `C:\Windows\System32\config\systemprofile\...`，普通用户 `Access denied`）。
- **无密码的 Windows 账户无法用 `prlctl exec -u <user> --password` 认证**。
  绕法：建**交互式计划任务**（`schtasks /create ... /ru <user> /it`），它会以该用户身份跑。
- **cmd 的解析期展开**：`%VAR%` 与 `%ERRORLEVEL%` 在**整行解析时**就展开完了——
  在 batch 里读它们会拿到过期值（我因此读到过一个假的 `CURL=0`）。用 `setlocal enabledelayedexpansion`
  配 `!VAR!`，或拆成多行。
- **在 batch 里调 `dsh.cmd` 必须写 `call dsh`**，否则控制权被它拿走、后续行不执行。
- **计划任务的 batch 要 `chcp 65001`**；读输出用 `Get-Content -Encoding UTF8`
  （cmd 重定向写的是系统代码页，直接读会乱码）。
- **`\\Mac\Home` 只暴露 Desktop / Documents / Downloads / Movies / Music / Pictures**，
  仓库目录不在其中 → 代码传输要另想办法（临时 HTTP 服务 / `git archive` 打包）。
- **别删了再忘**：`-WithRepo` 会往 VM 里落仓库副本、`node_modules`、profile 与 overlay 文件。
  收尾把计划任务、node 进程、日志、临时目录一并清掉。

## 什么算「真机验证通过」

**绿灯不算。** 至少要有：

1. **反向验证 / 变异验证**：把修复改回去（或把守卫去掉），确认新用例**立刻变红**，
   且报出的信息与现象一致。只加一条「修前修后都绿」的用例等于没测。
2. **判据要测对对象**：`tty D51` 的教训——断言数「重画次数」而非「是否回放缓冲」，
   次数无法归因，于是偶发假红；假红会训练人忽略红。
3. **数字要现算**：台账 / README 里的计数由脚本从事实推导，不写死期望值。
4. **说清「没验的部分」**：哪些项「已修但未现场压测」要显式写出来，不要混进「通过」。
