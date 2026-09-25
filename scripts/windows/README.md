# Windows 11 真机兼容性测试环境

在 Windows 11 上把 DSH 插件跑起来做真机验证，需要的东西不多：**Node（自带 npm / npx）+ pnpm**，
再可选装上 `dsh` CLI 和仓库。这个目录就干这一件事。

```
scripts/windows/
├── setup-dsh-testenv.ps1   主脚本（PowerShell 5.1 即可，Win11 自带）
├── bootstrap.cmd           一行包装，处理 ExecutionPolicy，参数原样透传
└── README.md               本文件
```

## 为什么需要它

`dsh-plugin-kit` 各包 `package.json` 里声明的硬性要求：

| 声明 | 值 | 出处 |
| --- | --- | --- |
| `engines.node` | `>= 22.19.0` | 所有 `packages/*/package.json` |
| `packageManager` | `pnpm@10.30.3` | 根 `package.json` |
| `dsh.engines.dsh` | `>= 0.1.7-rc.2` | 每个可安装插件的 `dsh` 字段 |

`engines.node` 是三个里唯一**本机 macOS 测不了**的东西（macOS 上跑的是同一份代码，但真实用户
装的是 Windows 版 Node）。而 `dsh.engines.dsh` 拼错了比不写更糟：写成 `^0.1.7-rc.2` /
`~0.1.7-rc.2` / 两段式区间会被 dsh-web 的解析器判成「无法验证」而 **fail-closed**，更新直接被拦下。

## 用法

```powershell
# 最省事：自动选安装方式（有 winget 走 winget）
.\bootstrap.cmd

# 免管理员：解压官方 zip 到 %LOCALAPPDATA%\dsh-nodes\vX.Y.Z，写用户 PATH
.\bootstrap.cmd -Method Zip

# 装完工具链直接拉仓库、构建、挂进 compat profile
.\bootstrap.cmd -WithRepo

# 先看会做什么，不落盘（-WhatIf 会传播到所有安装步骤）
.\bootstrap.cmd -WhatIf

# 完整帮助
.\bootstrap.cmd -h
```

直接跑 ps1 的话（绕过 cmd 包装）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\setup-dsh-testenv.ps1 -WithRepo
```

## 参数

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `-Method` | `Auto` | `Auto` / `Winget` / `Msi` / `Zip`。`Auto` = 有 winget → Winget；否则有管理员 → Msi；否则 Zip |
| `-NodeMajor` | `22` | 主版本线，即仓库下限 22.19.0 所在线 |
| `-WorkDir` | `%USERPROFILE%\dsh-compat` | 报告与仓库落地目录 |
| `-ProfileName` | `compat` | 挂载用 profile（刻意不用 `web`，避免污染） |
| `-WithRepo` | 关 | 拉仓库 + `pnpm install` + `pnpm -r build` + `pnpm -r typecheck` + 挂 profile |
| `-SkipGit` / `-SkipPnpm` / `-SkipDsh` | 关 | 跳过对应步骤（它们会降级成 WARN 而不是 FAIL） |
| `-NoPathChange` | 关 | 不写用户 PATH，只报告路径 |
| `-SkipExecutionPolicy` | 关 | 不改 ExecutionPolicy（默认修成 `CurrentUser=RemoteSigned`） |
| `-Reinstall` | 关 | 已满足下限也重装一次 |

退出码：`0` = 就绪（允许有 WARN），`1` = 存在硬性 FAIL。报告落在
`%USERPROFILE%\dsh-compat\dsh-compat-report.txt`（UTF-8 无 BOM）。

## 三种安装方式怎么选

- **Winget**（推荐，Win11 自带）：`winget install OpenJS.NodeJS.22`，失败回退 `OpenJS.NodeJS.LTS`。
  **注意 winget 是 zip 式落盘，不是 MSI**：真机实测装在
  `%LOCALAPPDATA%\Microsoft\WinGet\Packages\OpenJS.NodeJS.22_<hash>\node-v22.23.2-win-<arch>\`
  （ARM64 机器上就是 `win-arm64`）。npm 全局前缀仍是 `%APPDATA%\npm`（用户可写，无需管理员）。
- **Msi**：从 `https://nodejs.org/dist/index.json` 解析最新 `v22.x`，下载 `node-vX.Y.Z-x64.msi`
  用 `msiexec /qn` 静默装。**需要管理员**（脚本会先检查并给出明确报错）。
- **Zip**：同一版本取 `node-vX.Y.Z-win-x64.zip`，解压到 `%LOCALAPPDATA%\dsh-nodes\v22.x.y`，
  **完全免管理员**。想在真机上并排测多个 Node 版本时用这个——每个版本一个目录，python 式切换
  只要改 PATH 顺序。脚本只往用户 PATH 追加，不动系统 PATH。

架构按 `PROCESSOR_ARCHITEW6432` → `PROCESSOR_ARCHITECTURE` 依次探测（前者在 32 位进程跑在
64 位系统时给出原生架构），ARM64 机器上取 `win-arm64` 发行版。

## Windows 特有的坑（脚本已处理或已提示）

1. **ExecutionPolicy 会拦掉 npm / npx / pnpm 的 `.ps1` shim**（命中率最高）。Node 与 corepack
   装出来的是三件套：`pnpm.cmd` + `pnpm.ps1`、`npm.cmd` + `npm.ps1`、`npx.cmd` + `npx.ps1`。
   **Git Bash 调 `.cmd`/shell 脚本，一切正常；PowerShell 优先命中 `.ps1`**，而 Win11 客户端默认
   策略是 `Restricted`，于是：

   ```
   pnpm : 无法加载文件 ...\node-v22.23.2-win-arm64\pnpm.ps1，因为在此系统上禁止运行脚本。
       + FullyQualifiedErrorId : UnauthorizedAccess
   ```

   看起来像「pnpm 没装好」，其实装得好好的。脚本在预检阶段把 `CurrentUser` 作用域设为
   `RemoteSigned`（不需要管理员，优先级高于 `LocalMachine` 的 `Restricted`），并把带
   mark-of-the-web 的 shim 一起 `Unblock-File`。手工修：

   ```powershell
   Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
   # 还原：Set-ExecutionPolicy -Scope CurrentUser Undefined
   ```

   临时绕过（不改策略）：显式调 `.cmd`，即 `pnpm.cmd -v`。
2. **native 命令的 stderr 会被 PS 5.1 当成终止错误**。`$ErrorActionPreference = 'Stop'` 下读
   `foo --version` 若该 CLI 往 stderr 写一行，就会把「装好了」误判成「没装」。脚本的
   `Get-ToolVersion` 在局部把 EAP 放回 `Continue`，只取 stdout 首行。
3. **PATH 刷新**。安装后当前进程的 `$env:Path` 不会自动更新；脚本用 `Sync-SessionPath`
   从 Machine + User 两级重建会话 PATH，并额外补上 zip 目录与 `%APPDATA%\npm`。
4. **长路径**。pnpm 的 `.pnpm` 目录嵌套很深，仓库路径再长一点就会超 260 字符。`-WithRepo`
   会顺手设 `git config core.longpaths true`。真出问题还要开系统的
   `LongPathsEnabled`（需要管理员改注册表）。
5. **Defender 拖慢 install**。`pnpm install` 在 Windows 上慢，多半是实时扫描 `node_modules`。
   真机测性能/超时问题时，给工作目录加个排除项。
6. **`%APPDATA%\npm` 必须在 PATH 里**，否则 `npm i -g` 装出来的 `dsh` / `pnpm` 找不到。
   Zip 模式脚本会显式加上。
7. **`.ps1` 必须带 UTF-8 BOM**（本文件已带）。Windows PowerShell 5.1 对**没有 BOM** 的脚本
   按系统 ANSI 代码页解释——在中文 Windows（cp936）上，UTF-8 的汉字字节会和后面的 ASCII
   引号重新配对，**直接把脚本读成语法错误**。用编辑器改这个文件后若提示保存编码，选
   「UTF-8 with BOM」（VS Code 右下角可切）。`bootstrap.cmd` 则相反：**必须纯 ASCII、且绝不能
   有 BOM**，cmd.exe 会把 BOM 当成第一行的一部分，`@echo off` 直接失效。

## 装完之后的验证闭环

> 下面这段是**在 Windows 上真机跑通过的版本**（2026-09-25，Windows 11 ARM64）。
> 早先这里写的 `dsh --profile compat web` 在 0.1.7 线上**不成立**，`dsh` 直接 `npm i -g`
> 也会装成 npm 的 `latest`（当时 0.1.5-rc.3）——比 cohort 低，装完**所有插件都会被静默禁用**。
> 两处都已改正，理由见文末「真机验证踩过的坑」。

```powershell
# 1) 工具链。dsh 必须钉在本仓 cohort：各包 peerDependencies 的下限就是它
node -v ; pnpm -v
npm i -g "@deepseek-ai/dsh@next"        # 或写死 @0.1.7-rc.2；@latest 会装到 0.1.5-rc.3
dsh --version                            # 必须等于上面表格里 dsh.engines.dsh 的下限

# 2) 仓库
git clone https://github.com/hyzyn/dsh-plugin-kit.git $env:USERPROFILE\dsh-compat\dsh-plugin-kit
cd $env:USERPROFILE\dsh-compat\dsh-plugin-kit
pnpm install
# pnpm 10 默认拦构建脚本：esbuild（打浏览器半体）/ node-pty（真 PTY）/ ssh2 都要补跑
pnpm rebuild esbuild node-pty ssh2 cpu-features koffi
pnpm -r build ; pnpm -r typecheck

# 3) 关键一步：让插件与宿主共用同一份 @deepseek-ai/*
node scripts/link-dsh-runtime.mjs --dry-run
node scripts/link-dsh-runtime.mjs

# 4) profile：根 bundle + **Web 应用**
#    只 add 根 bundle 的话 bundles 里没有 dsh-web-app —— 宿主能起、插件全 mounted，
#    但**没有任何监听端口**，阶段 B 的活体探针无从谈起。
dsh plugin --profile compat add "link:$PWD"
dsh plugin --profile compat add "@deepseek-ai/dsh-web-app@0.1.7-rc.2"   # 版本必须钉！裸包名会解析到 latest=0.0.1-rc.1 而被 preflight 拒
dsh --profile compat --dump-config

# 5) 起宿主。用 --patch 指定端口（`dsh --profile compat web` 在 0.1.7 上报 too many arguments）
@'
- id: webserver
  config:
    host: '127.0.0.1'
    port: 3092
'@ | Set-Content -Encoding utf8 .\compat-port.yml
dsh --profile compat --patch .\compat-port.yml
# 日志里出现 `dsh web: http://127.0.0.1:3092/?token=…` 才算真起来了——「插件 mounted」不够
```

**为什么 `link-dsh-runtime` 是必需的**：插件从本地路径加载时，Node 会解析到仓库
`.pnpm` 里那套 `@deepseek-ai/*`，而不是宿主 `dsh` 进程正在用的那套。升级 dsh 后会出两类假象——
`instanceof`/schema 对不上报出与真实无关的错，或者插件继续用旧 API 悄悄跑通、掩盖真实兼容性问题。
详见 `docs/link-dsh-runtime.md`。

> ⚠️ `pnpm install` 会重建 `node_modules`、冲掉这些链接，**装完依赖要重跑一次**。
>
> ⚠️ 别同时装 `@hyzyn/dsh-all` 或任一 `@hyzyn/dsh-<包名>` 与根 bundle，插件行重复挂载会在
> 启动时报 `duplicate loader entry id`。

### 跑真机验证脚本

`verify-plugins.mjs` 分两阶段。**阶段 A 不需要宿主**，先跑它（纯 import 已构建的 `lib/`，
验代码页解码、`.cmd` shim 转义、Windows 特有分支）：

```powershell
node scripts\windows\verify-plugins.mjs --repo .
```

阶段 B 打活宿主的每一条插件路由，必须带上**宿主真正在用的 home** 与那份 docker 夹具私钥：

```powershell
node scripts\windows\verify-plugins.mjs --repo . `
     --host http://127.0.0.1:3092 `
     --dsh-home $env:USERPROFILE\.dsh `
     --docker-ssh-key C:\cg-verify\ssh\id_ed25519 `
     --report .\win-report.json
```

- `--dsh-home` 要指向**宿主进程实际用的** home：B9 的落盘断言读的是它下面各 profile 的
  `cordis.patch.yml`，指错了会得到一串「没落盘」的假红。
- `--docker-ssh-key` 指向的**文件必须存在**。它不存在时 docker 数据路由会以 `EPERM: open …`
  失败——那是夹具缺件，不是产品缺陷。
- 不给 `--host` 就只跑阶段 A（仍是有意义的 Windows 验证，退出码照旧）。

最后推上去让 `.github/workflows/ci.yml` 的三平台矩阵跑一遍——真机上手工验过的东西，CI 才能守住。
`workflow_dispatch` 带 `test_filter`，可以只复跑某个用例（例如 Windows 上 shim spawn 那条路径）。

## 真机验证踩过的坑（2026-09-25，Windows 11 ARM64）

安装工具链那几条见上面「Windows 特有的坑」；这一节记的是**把宿主跑起来、把验证跑完**才暴露的。

1. **`npm i -g @deepseek-ai/dsh` 装到的是 `latest`，比 cohort 低。**
   症状不是报错而是**静默**：宿主起来了，每一行插件却被兼容性 preflight 判成 `incompatible`
   整行 `disabled`。装完先 `dsh --version` 对一遍表格里的下限。
2. **只 add 根 bundle 的 profile 没有 Web 应用**（见上面第 4 步）。症状同样很安静：进程活着、
   10 个插件全 mounted、日志一切正常，就是 `netstat` 里没有任何监听端口。
   补的时候**必须钉版本**：裸 `@deepseek-ai/dsh-web-app` 解析到 `latest = 0.0.1-rc.1`，
   会被 preflight 正当地拒掉。`dsh plugin` 这时会提示 `allow-version … --accept-risk`——
   **别照着放行**，那是在绕过兼容性检查；该做的是把版本钉对。
3. **`dsh --profile <p> web` 不成立**（0.1.7 上报 `too many arguments. Expected 0 arguments
   but got 1: web.`）；`dsh web --profile <p>` 也不成立（`web` 是「启动名为 web 的 profile」
   的快捷方式，报 `select a profile only once`）。用 `dsh --profile <p> --patch <port.yml>`。
4. **`pnpm` 10 默认拦截原生模块的构建脚本**（esbuild / node-pty / ssh2 / koffi / cpu-features）。
   不补跑时 `pnpm -r build` 打不出浏览器半体、真 PTY 也起不来，而报错点离根因很远。
5. **`dsh-docker route-smoke` 在 Windows 上只有 29/60 —— 这不是缺陷。** 它的假 docker 是
   `#!/bin/sh` 脚本，Windows 上跑不了；CI 里这套本来就只在 ubuntu 跑
   （`ci.yml` 的 `if: matrix.os == 'ubuntu-latest'`）。Windows 侧要看的是
   `packages/tty/scripts/windows-smoke.mjs`（`windows-latest` 那步）。

### 从宿主机驱动虚拟机时（Parallels / `prlctl`）

真机也可以由 macOS 宿主机驱动，本轮就是这么跑的：

1. **`prlctl exec` 以 SYSTEM 身份执行**：`%USERPROFILE%` 是
   `C:\Windows\System32\config\systemprofile`，而交互用户装的那套 Node / dsh 对它
   **Access denied**。于是「虚拟机里明明装了 node」和「`prlctl exec` 里 `node` 找不到」会同时成立。
2. **切交互用户要么给密码，要么用计划任务**：`prlctl exec -u <user> --password …` 需要一个
   **密码**；账户是 `Password required: No` 时这条路根本走不通（认证失败与密码对不对无关）。
   账户已交互登录时，`schtasks /create /tn X /tr … /ru <user> /it /f` + `schtasks /run /tn X`
   可以**不需要密码**地以该用户身份执行。
3. **批处理里调 `.cmd` 必须写 `call`**：直接调 `dsh`（或任何 npm shim）会夺走控制权，
   后面的行不再执行——症状是「脚本跑到一半就没了」，且没有任何报错。
4. **cmd 的 `%VAR%` 与 `%ERRORLEVEL%` 在解析期展开**：`echo EXIT=%ERRORLEVEL%` 打的是
   **上一条**命令的退出码；`schtasks /tr "...%USERPROFILE%..."` 里的变量会被外层 shell 先
   展开再写进任务。两者都会让你把「失败」读成「成功」。
5. **中文输出要看代码页**：`chcp 65001` 之后按 UTF-8 读文件，否则全是乱码——而乱码会让你
   误判断言为什么失败（阶段 A 的 A1 用例就是为这件事存在的）。
6. **仓库不在 Parallels 共享目录里**：`\\Mac\Home` 只暴露 Desktop / Documents / Downloads /
   Movies / Music / Pictures 六个标准目录，`~/coding/…` 读不到。本轮是把仓库打成 tar，
   从宿主起一个临时 HTTP 服务传进去的。

### 让验证脚本别腐烂

本轮修掉了 5 处**红了但不指向任何真问题**的断言：A5 写死的依赖数、B7 缺 `clearAll`、
B9 钉在已不存在的 `settings.yaml`、B6 假定宿主 profile 叫 `wintest`、B13 缺同源证明头。
共同形状是**把「环境事实」写死进断言**。写新用例时避开这几类：

- **数量**：`deps.length === 9` → 改成「都解析得到」。数量会变，契约不会。
- **名字 / 路径**：宿主跑在哪个 profile、设置落在哪个文件，由启动方式和 dsh 版本决定。
  B9 改成扫 `<dsh-home>/profiles/*/cordis.patch.yml`，B6 改成「新建的那个在列表里、
  且列表不止它一个」。
- **门禁顺序**：变更端点先过**同源门禁**（`MUTATION_SUBROUTES` + `hasSameOriginProof`，
  在 switch 之前）再走 `allowMutations`。所以**不带 `Origin` / `Sec-Fetch-Site` 的请求
  永远测不到开关那一道**——测门禁必须带同源证明，同时留一条负例钉住「无证明要被拦」。
- **别让脚本自己先死**：`JSON.stringify(undefined)` 返回 `undefined` 而非字符串，后面接
  `.slice()` 就抛。宿主中途没了的时候这会把整个脚本打挂、连 `# 汇总` 都不打印——而那正是
  最需要汇总的时候。脚本里已提供 `brief()` 做安全序列化。
