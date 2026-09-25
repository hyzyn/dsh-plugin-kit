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

```powershell
node -v ; npm -v ; npx -v ; pnpm -v ; dsh --version

git clone https://github.com/hyzyn/dsh-plugin-kit.git $env:USERPROFILE\dsh-compat\dsh-plugin-kit
cd $env:USERPROFILE\dsh-compat\dsh-plugin-kit
pnpm install
pnpm -r build

# 关键一步：让插件与宿主共用同一份 @deepseek-ai/*
node scripts/link-dsh-runtime.mjs --dry-run
node scripts/link-dsh-runtime.mjs

dsh plugin --profile compat add link:$PWD
dsh --profile compat --dump-config
dsh --profile compat web
```

**为什么 `link-dsh-runtime` 是必需的**：插件从本地路径加载时，Node 会解析到仓库
`.pnpm` 里那套 `@deepseek-ai/*`，而不是宿主 `dsh` 进程正在用的那套。升级 dsh 后会出两类假象——
`instanceof`/schema 对不上报出与真实无关的错，或者插件继续用旧 API 悄悄跑通、掩盖真实兼容性问题。
详见 `docs/link-dsh-runtime.md`。

> ⚠️ `pnpm install` 会重建 `node_modules`、冲掉这些链接，**装完依赖要重跑一次**。
>
> ⚠️ 别同时装 `@hyzyn/dsh-all` 或任一 `@hyzyn/dsh-<包名>` 与根 bundle，插件行重复挂载会在
> 启动时报 `duplicate loader entry id`。

最后推上去让 `.github/workflows/ci.yml` 的三平台矩阵跑一遍——真机上手工验过的东西，CI 才能守住。
`workflow_dispatch` 带 `test_filter`，可以只复跑某个用例（例如 Windows 上 shim spawn 那条路径）。
