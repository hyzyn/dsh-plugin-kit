# dsh-plugin-kit · DSH 插件全家桶

中文 | [English](README.en.md)

<p align="center">
  <img src="https://img.shields.io/github/v/release/hyzyn/dsh-plugin-kit?style=flat-square" alt="Version">
  &nbsp;
  <img src="https://img.shields.io/github/stars/hyzyn/dsh-plugin-kit?style=flat-square" alt="Stars">
  &nbsp;
  <img src="https://img.shields.io/github/forks/hyzyn/dsh-plugin-kit?style=flat-square" alt="Forks">
  &nbsp;
  <img src="https://img.shields.io/npm/v/@hyzyn%2Fdsh-all?style=flat-square&label=npm" alt="npm">
  &nbsp;
  <img src="https://img.shields.io/npm/dt/@hyzyn%2Fdsh-all?style=flat-square&label=downloads" alt="Downloads">
  &nbsp;
  <img src="https://img.shields.io/badge/license-Apache--2.0-blue?style=flat-square" alt="License">
</p>

仓库门禁：`pnpm typecheck` / `pnpm build` / `pnpm test` / `pnpm aggregate`。

<p align="center">
  <strong>DeepSeek Harness（DSH）Web GUI 的插件全家桶</strong><br>
  <em>环境变量 · MCP 服务器 · Prompt · Profile · RSS · 全局搜索 · Codegraph 集成 · 终端面板 · 容器面板 · 插件脚手架</em>
</p>

<p align="center">

[是什么](#是什么) · [包索引](#包索引) · [快速开始](#快速开始) · [开发新插件](#开发新插件) · [文档地图](#文档地图) · [参与贡献](#参与贡献)

</p>

## 是什么

dsh-plugin-kit 是给 DeepSeek Harness（DSH）Web GUI 用的通用插件集合。所有插件都走官方 profile
机制挂载到 `dsh web`，**不改 DSH 源码**；可以逐个安装，也可以用聚合包一次装齐。

![SFTP 双栏：左本机 / 右远程，行内直传](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-tty-sftp-dual.png)

![Docker 容器面板：会话右侧栏标签，与对话同屏](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-docker-dock.png)

| 能力 | 原生 dsh web | dsh-plugin-kit 全家桶 |
| --- | --- | --- |
| MCP 服务器 | 手改 patch / 命令行 | 可视化卡片 + 连接测试 + 保存后热加载 |
| Profile 管理 | 命令行 | 可视化创建 / 复制 / 重命名 / 删除 |
| RSS 聚合 | 无 | 多源订阅 + 每日「今日值得读」+ 可选 AI 摘要（跟随宿主默认模型，零配置） |
| 全局搜索 | 仅会话标题/内容 | 侧边栏统一全文搜索历史会话、Prompt、MCP 工具与设置面板 |
| Codegraph 集成 | 无 | 代码图谱卡片：索引状态 / 符号搜索 / 调用链 / 影响面 / 一键 sync-index |
| 终端面板 | 无 | xterm.js 多标签真实 PTY（vim/htop/dev server）；SSH 直连（连接簿、指纹钉扎、断线重连）；SFTP 单窗体 / 双栏直传；`tty_*` / `sftp_*` 工具 |
| Docker 容器面板 | 无 | 容器 / 镜像 / Compose / 实时日志与统计 / 多目标总览；**默认只读**，变更与 exec 需显式开关；`docker_*` 工具 |
| 环境变量管理 | 命令行 / 手改配置 | Web GUI 卡片，保存即写入 `process.env` |
| Prompt 管理 | 手改配置 | 可视化编辑 + 版本管理 / A/B 测试 / 导出分享 |
| 插件开发 | 手写样板 | `pnpm create-plugin` 脚手架 + `@hyzyn/dsh-kit` 共享工具库 |

> **每个插件的完整功能、截图与注意事项在它自己的 README 里**（见下表）。本文件只讲「是什么 + 装哪个」。

## 包索引

**1 个共享库 + 10 个功能插件 + 1 个聚合包**；包之间的关系、依赖方向与跨插件协作见
[docs/architecture.md](docs/architecture.md)。

| 包 | 干什么 | 文档 |
|---|---|---|
| `@hyzyn/dsh-kit` | **库**（非插件）：宿主半体共享工具——HTTP 回环围栏、托管区块、`!!js` 表达式、服务读取 | [README](packages/kit/README.md) · [DEFECTS](packages/kit/DEFECTS.md) |
| `@hyzyn/dsh-mcp` | MCP 服务器配置卡片，保存后热加载 | [README](packages/mcp/README.md) |
| `@hyzyn/dsh-env` | 环境变量 / 密钥管理 | [README](packages/env/README.md) |
| `@hyzyn/dsh-prompt` | systemPrompt 编辑 / 版本 / A/B | [README](packages/prompt/README.md) |
| `@hyzyn/dsh-profile` | `~/.dsh/profiles` 图形化管理 | [README](packages/profile/README.md) |
| `@hyzyn/dsh-rss` | RSS 聚合 → 每日「今日值得读」 | [README](packages/rss/README.md) |
| `@hyzyn/dsh-search` | 侧边栏全局搜索 | [README](packages/search/README.md) |
| `@hyzyn/dsh-codegraph` | 代码图谱卡片 + MCP 托管 + 采纳率测量 | [README](packages/codegraph/README.md) · [DEFECTS](packages/codegraph/DEFECTS.md) · [ROADMAP](packages/codegraph/ROADMAP.md) |
| `@hyzyn/dsh-tty` | 终端面板（PTY / SSH / SFTP / 隧道） | [README](packages/tty/README.md) · [DEFECTS](packages/tty/DEFECTS.md) · [ROADMAP](packages/tty/ROADMAP.md) |
| `@hyzyn/dsh-docker` | Docker 容器面板（本机 / SSH），默认只读 | [README](packages/docker/README.md) · [DEFECTS](packages/docker/DEFECTS.md) · [ROADMAP](packages/docker/ROADMAP.md) |
| `@hyzyn/dsh-kit-settings` | 在官方「设置」里补一行「插件配置」入口 | [README](packages/kit-settings/README.md) |
| `@hyzyn/dsh-all` | 聚合安装包：一条 bundle patch 挂载上面 10 个插件 | [README](packages/all/README.md) |

## 快速开始

### 系统要求

- 已安装 DeepSeek Harness，`dsh web` 可正常启动。**当前适配基线为 DSH `0.1.7-rc.2`**：
  settings 存储改为「当前 profile 的插件 entry 配置」，兼容性改由 `peerDependencies`
  在安装前与启动时强制校验；`0.1.6-alpha.2` 及更早不再支持。
- 每个可安装插件都在 `peerDependencies` 声明 `@deepseek-ai/dsh: ^0.1.7-rc.2`，DSH 在**安装前**与
  **启动时**都用它判定兼容性；同时保留 `dsh.engines.dsh` 作**市场展示位**（值必须与 peer 下限一致）。
  机制细节、被拦下怎么办、怎么临时放行 → [docs/troubleshooting.md § 兼容性校验](docs/troubleshooting.md#兼容性校验)。
- npm 安装方式无额外要求；从仓库安装需要 Node.js >= 22.19 与 pnpm 10。

### 从 npm 安装（推荐）

```sh
dsh plugin --profile web add @hyzyn/dsh-all              # 聚合安装包
dsh plugin --profile web add @hyzyn/dsh-plugin-kit       # 仓库根 bundle（同样挂载全家桶）
```

装完**重启** `dsh web`，插件配置页里出现全部条目即生效。只想用某一个插件，见下方「单独安装某个插件」。
条目没出现多半是没重启；也可以用 `dsh --profile web --dump-config` 确认插件配置层已挂载。
卸载：`dsh plugin --profile web remove @hyzyn/dsh-all`（或对应子包名），再重启。

> **配置入口在哪一版**：DSH ≥ `0.1.6-alpha.2` 有**两个**入口，指向同一份配置——侧边栏
> **「插件」**→ 选插件 → 该行的「配置」（官方新版两视图页面），以及**设置 →「插件配置」**
> （与「通用设置」平级的一行，由 `@hyzyn/dsh-kit-settings` 提供）。
> DSH ≤ `0.1.5` 是**设置 → 插件 →「插件配置」**标签页里的卡片。
> 客户端半体同时注册三代插槽（`plugins.row.config`、`settings.kit.item`、`settings.plugin.item`），
> 一份产物在各代上都能用。

### 从 GitHub 仓库安装（开发调试）

需要 Node.js >= 22.19 与 pnpm 10。仓库根目录本身也是一个 DSH bundle
（`package.json#dsh.bundle.patch`，由 `pnpm aggregate` 生成）：

```sh
git clone https://github.com/hyzyn/dsh-plugin-kit.git
cd dsh-plugin-kit
pnpm install
pnpm build

dsh plugin --profile web add link:$(pwd)   # 根包即 bundle，等价于安装 @hyzyn/dsh-all
dsh web
```

> ⚠️ 如果 web profile 里已经装过 `@hyzyn/dsh-all` 或任一 `@hyzyn/dsh-<包名>`，
> 不要再 add 根包（或 `packages/all`），否则插件行重复挂载会在启动时报
> `duplicate loader entry id`。

> 只想用某个子包：第 3 步改为 `dsh plugin --profile web add link:$(pwd)/packages/<name>`。

> 根包声明了 `dsh` 字段后，GitHub 的 DSH 插件市场会把本仓库识别为 DSH 插件（cordis-plugin）。

### 单独安装某个插件

不想装全家桶时，把包名换成上表里的任意一个即可（`@hyzyn/dsh-all` → `@hyzyn/dsh-<包名>`）：

```sh
dsh plugin --profile web add @hyzyn/dsh-env       # 环境变量 / 密钥管理
dsh plugin --profile web add @hyzyn/dsh-tty       # 终端面板
dsh plugin --profile web add @hyzyn/dsh-docker    # Docker 容器面板
```

装不上 / 卡片不出现 / 接口报 401、403 → [docs/troubleshooting.md](docs/troubleshooting.md)。

## 开发新插件

```sh
pnpm create-plugin <name> [id]
# 例：pnpm create-plugin timer          → packages/timer（@hyzyn/dsh-timer，插件 id: timer）
# 例：pnpm create-plugin pet-tracker pt → packages/pet-tracker（插件 id: pt）
```

脚本会复制 `templates/hello` 模板、替换包名与插件 id，并自动更新聚合包。然后编辑
`packages/<name>/src/index.ts`，构建后本地调试：

```sh
pnpm --filter @hyzyn/dsh-<name> build
dsh plugin --profile web add link:$(pwd)/packages/<name>
```

**新包要建哪些文档、多长、编号怎么起**，**插件包的解剖**（`dsh.bundle.patch` / `cordis.patch.yml` /
`src/index.ts` / `dsh.client`），以及**两条容易踩的硬规矩**（客户端半体的地址来源、纯逻辑抽模块）
→ [docs/conventions.md](docs/conventions.md)。

## 文档地图

| 想知道 | 看 |
|---|---|
| 项目是什么、装哪个 | 本文件 |
| 12 个包怎么协作、依赖方向、谁写哪个配置文件 | [docs/architecture.md](docs/architecture.md) |
| 命名 / 提交 / 文档分层 / 编号规范 / 插件解剖 | [docs/conventions.md](docs/conventions.md) |
| 术语（宿主半体、托管区块、TOFU、三代插槽…） | [docs/glossary.md](docs/glossary.md) |
| 装不上、卡片不出现、接口 401/403、已知限制 | [docs/troubleshooting.md](docs/troubleshooting.md) |
| 真机测试怎么跑、什么算通过 | [docs/agent-real-test.md](docs/agent-real-test.md) |
| Windows 11 真机环境搭建 | [scripts/windows/README.md](scripts/windows/README.md) |
| 跨包待办 | [ROADMAP.md](ROADMAP.md) |
| 发版流程 | [RELEASING.md](RELEASING.md) |
| 开发环境里插件与宿主的 runtime 链接 | [docs/link-dsh-runtime.md](docs/link-dsh-runtime.md) |
| 某个包怎么用 | `packages/<pkg>/README.md` |
| 某个编号是什么意思 | `packages/<pkg>/DEFECTS.md` |

## 参与贡献

- 新插件用脚手架生成：`pnpm create-plugin <name> [id]`，避免手写样板。
- 提交信息遵循 Conventional Commits（如 `fix(mcp): 修复连接测试超时`），
  用户可见变更请附截图或验证证据。
- 提交前过门禁：`pnpm typecheck && pnpm build && pnpm test && pnpm aggregate`；
  增删插件后必须跑 `pnpm aggregate` 重新生成 `packages/all` 聚合清单。
- 命名 / 编号 / 文档分层等完整规范见 [docs/conventions.md](docs/conventions.md)。

## 许可证

本仓库以 [Apache License 2.0](LICENSE) 授权。

## 贡献者

<div align="center">

**喜欢这个项目？点个 Star。**

[报告 Bug](https://github.com/hyzyn/dsh-plugin-kit/issues) · [请求功能](https://github.com/hyzyn/dsh-plugin-kit/issues) · [查看 Releases](https://github.com/hyzyn/dsh-plugin-kit/releases)

</div>
