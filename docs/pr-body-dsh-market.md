> 提 PR 前请阅读 [CONTRIBUTING.md](../CONTRIBUTING.md) 与 [AGENTS.md](../AGENTS.md)；
> 提交信息用 Conventional Commits（`type(scope): subject`），禁止 emoji。
> 本仓库只接受四类内容贡献：插件申请（社区插件索引登记）、皮肤增加（新皮肤收录）、宠物增加（新宠物收录）、预设增加（agent 预设收录）。其余改动不接受直接 PR，请先提 Issue 讨论。
## 摘要（Summary）

在社区插件索引中登记 `hyzyn/dsh-plugin-kit` 的 9 个插件，使其出现在设置 → 创意工坊 → 插件目录与 dsh-market.com 创意工坊站。`packages/dsh-community-plugins/community.json` 新增 9 条记录，`market/dist/manifest/plugins.json` 由 `node scripts/market-build` 生成对应条目（rank 顺延至提交时的下一个空闲位）。

9 个条目：`dsh-tty` / `dsh-docker` / `dsh-codegraph` / `dsh-env` / `dsh-mcp` / `dsh-profile` / `dsh-prompt` / `dsh-rss` / `dsh-search`，全部是已在 npm 发布的独立包（`@hyzyn/dsh-*`）。插件源码同属一个 pnpm monorepo，因此每条 `repo` 指向该仓库的子包目录（`/tree/main/packages/<name>`），安装仍走各自的 npm 包名；索引只收录链接，不搬代码。

## 涉及包（Affected Packages）

<!-- 勾选本次改动涉及的包；仅脚本改动（维护类）可全部不勾选并说明。 -->

- [ ] 任务看板 `packages/dsh-task-board`
- [ ] Git 图谱 `packages/dsh-git-graph`
- [ ] 右侧面板 `packages/dsh-aionui-panel`
- [ ] 远程 Web UI `packages/dsh-remote-web-ui`
- [ ] SSH 远程运维 `packages/dsh-ssh`
- [ ] 宠物 `packages/dsh-pet`
- [ ] 预设中心 `packages/dsh-preset-center`
- [ ] 皮肤 / 皮肤中心 `packages/dsh-skins` / `packages/skins`
- [ ] 聚合包 / 设置 `packages/dsh-web-all` / `packages/dsh-web-settings`
- [x] 其他（请说明）：`packages/dsh-community-plugins` 与 `market/dist/manifest/plugins.json`（数据登记，无代码逻辑变更）

## PR 类别（PR Category）

<!-- 必填。勾选本 PR 最贴近的类别（可多选）。 -->

- [ ] 壁纸 / 渲染器（Wallpaper Engine / WebGL / 背景场景）
- [ ] 皮肤 / 皮肤中心（新皮肤收录、皮肤样式）
- [ ] 插件功能（任务看板 / Git 图谱 / 右侧面板 / 远程 Web UI / SSH / 宠物 / 预设中心 / 设置 / 聚合包）
- [x] 社区插件索引
- [ ] 维护 / 其他

## PR 类型（PR Type）

<!-- 勾选所有适用的类别。 -->

- [x] 面向用户的功能或行为变更（社区插件索引数据登记，新增市场条目；无 UI 截图）
- [ ] Bug 修复
- [ ] 视觉修复（UI / 视觉类问题的修复）
- [ ] 增强 / 优化（现有功能的改进、性能 / 体验优化）
- [ ] 新皮肤收录（内容贡献，欢迎直接提交，无需先提 issue）
- [ ] 新宠物收录（内容贡献，欢迎直接提交，无需先提 issue）
- [ ] 新预设收录（内容贡献，欢迎直接提交，无需先提 issue）
- [ ] 维护 / 重构

## 最新代码确认（Latest Codebase Confirmation）

- [x] 我已基于最新 `dev` 分支开发，或在提交前已 rebase / 合并最新 `dev`。

同步命令：

```bash
git fetch origin && git rebase origin/dev
```

分支基于提交时的 `upstream/dev` 建立；已在上面的 rebase 之后重跑本 PR 的全部校验命令，结果见下。

## 测试证据与上游同步（Test Evidence & Upstream Sync）

<!-- 必填。缺少下列任一证据的 PR 不予接受；文本类改动可不附截图，但必须提供测试证据。 -->

- [x] 我提供了自己本地测试的证据（执行的命令 / 测试结果 / 运行截图）。
- [x] 我已同步上游最新 `dev` 分支（`git fetch origin && git rebase origin/dev`），并附上同步后重新测试通过的证据（视觉 / 用户可见变更附截图）。

## AI 编码披露（AI Coding Disclosure）

<!-- 必填。勾选一项，且模型 / 工具字段不得留空。 -->

- [x] 完全 AI 编码：全部编程改动由 AI 产出，并由贡献者接受 / 审查。
- [ ] 部分 AI 辅助：AI 帮助编写或修改了部分编程改动。
- [ ] 未使用 AI 编码辅助。

使用的 AI 模型：

DeepSeek-V4.1-Flash

使用的编码 Agent 工具：

DeepSeek Harness (dsh)

## 仓库规范检查（Repo Rules）

<!-- 本仓库硬性规范，请逐项确认。 -->

- [x] 未修改 DSH 官方源码，仅基于官方 NPM SDK（`@deepseek-ai/*`）开发。
- [x] 未新增指向 DSH 源码 checkout 的 tsconfig `extends` / `paths` / `references`。
- [x] 新增包目录以 `dsh-` 前缀命名（如 `packages/dsh-xxx`）——本 PR 未新增包目录。
- [x] 所有新增 / 修改文件不含任何 emoji 字符。
- [x] 改动包 README 时同步维护中英双语三件套（`README.md` / `README.zh.md` / `README.i18n.yaml`）并运行 `pnpm docs:check`——本 PR 未改动 README。

## 贡献者版权声明（Contributor Copyright）

索引只收录链接、不搬代码，9 个插件的版权归原作者（hyzyn）所有，无需追加声明。

## 社区插件索引登记（Community Plugin Index）

<!-- 仅当本 PR 新增接入一个社区插件时必填；其余改动可跳过本节。 -->

插件 GitHub 仓库链接：

https://github.com/hyzyn/dsh-plugin-kit

插件详细说明：

一个 pnpm monorepo，本次登记其中 9 个独立发布、可单独安装的插件（另有 1 个共享库 `@hyzyn/dsh-kit` 与 1 个聚合包 `@hyzyn/dsh-all`，本 PR 不登记）。全部遵循官方 cordis bundle 标准：`package.json` 声明 `dsh.bundle.patch` 指向 `cordis.patch.yml`，浏览器半区经 `dsh.client` 注入，类型仅基于官方 `@deepseek-ai/*` NPM SDK，未修改 DSH 源码；每个包都声明 `dsh.engines.dsh`（`>=0.1.2-rc.1`）供市场与插件管理器判定兼容性。实测基线 DSH `0.1.5-rc.2`。

| 索引 id | npm 包 | 分类（category / subcategory） | 功能 |
| --- | --- | --- | --- |
| `dsh-tty` | `@hyzyn/dsh-tty` | `ui` / `terminal` | 终端面板：xterm.js + PTY 全交互终端、tmux 持久化、原生 SSH / SFTP / 端口转发，配套 `tty_*` / `sftp_*` / `tunnel_*` agent 工具 |
| `dsh-docker` | `@hyzyn/dsh-docker` | `tools` / `dev` | 容器面板：本机 / SSH 目标容器列表（Compose 视图）、日志与统计实时流、镜像与网络卷详情；默认只读 |
| `dsh-codegraph` | `@hyzyn/dsh-codegraph` | `tools` / `context` | Codegraph 集成：索引状态、符号搜索、callers/callees/impact、一键 sync；托管 codegraph MCP 行 |
| `dsh-env` | `@hyzyn/dsh-env` | `security` / `access` | 环境变量与密钥管理：托管 `~/.dsh/env.yml` 区块，密钥明文进官方凭据存储 |
| `dsh-mcp` | `@hyzyn/dsh-mcp` | `tools` / `dev` | MCP 服务器配置：托管 `~/.dsh/cordis.patch.yml` MCP 区块，保存经 HMR 热加载 |
| `dsh-profile` | `@hyzyn/dsh-profile` | `tools` / `dev` | Profile 管理：查看 / 创建 / 复制 / 重命名 / 删除与端口配置 |
| `dsh-prompt` | `@hyzyn/dsh-prompt` | `tools` / `model` | Prompt 管理：systemPrompt 编辑、版本管理、A/B 测试与导出 |
| `dsh-rss` | `@hyzyn/dsh-rss` | `knowledge` / `reading` | RSS / 新闻聚合：多源订阅，每日汇总成 Markdown 注入 systemPrompt |
| `dsh-search` | `@hyzyn/dsh-search` | `ui` / `panel` | 全局搜索：侧边栏入口与命令面板，全文检索历史会话 / Prompt / MCP 工具 / 设置 |

分类依据：与索引内同类插件的既有归属保持一致（`dsh-tty` 对齐 `dsh-tui` / `dsh-tianshu-tui` 的 `ui/terminal`，`dsh-codegraph` 对齐 `dsh-context` 的 `tools/context`，`dsh-rss` 对齐 `dsh-deepread` 的 `knowledge/reading`，`dsh-mcp` 对齐同功能的 `dsh-mcp-manager` 的 `tools/dev`）。如与评审意见不符，这三项以外的分类都容易调整。

已知限制：`dsh-tty` 的远端能力依赖目标机可用 ssh；`dsh-docker` 的变更操作与 `docker exec` 需在设置中显式开启（默认只读）；`dsh-codegraph` 查询目标项目需要先有 Codegraph 索引。运行环境要求 Node.js >= 22.19。

- [x] 已按 [docs/plugins.md](../docs/plugins.md) 的登记说明在 `packages/dsh-community-plugins/community.json` 追加条目，并运行 `node scripts/community-index` 校验；已运行 `node scripts/market-build` 重新生成并提交 `market/dist/manifest/plugins.json`，`node scripts/market-build --check` 通过。
- [x] 已确认插件与 dsh-web 插件体系兼容：遵循官方 cordis bundle 独立标准（package.json 声明 `dsh.bundle.patch` 指向 `cordis.patch.yml`、`dsh.client` 浏览器半区），类型仅基于官方 `@deepseek-ai/*` NPM SDK，未修改 DSH 源码；已作为 dsh 插件在真实 profile 上安装并运行（npm `@hyzyn/dsh-*` 当前发布版本，见上表）。
- [x] 承诺负责后续更新跟进：插件与 DSH / dsh-web 生态保持同步，生态升级导致不兼容时主动跟进修复；条目信息（description / npm 等）变动或插件停更时，及时更新索引登记或提交移除。

## 本地验证（Local Validation）

执行的命令：

```bash
node scripts/community-index
node scripts/market-build
node scripts/market-build --check
git diff --stat
```

结果摘要：

<!-- 提交前把下面三行替换成本机真实输出。 -->

`node scripts/community-index` → `community-index: OK (69 entries)`（登记前 60 条，本 PR +9）。
`node scripts/market-build` → `wrote <文件数> files (<皮肤数> skins, <宠物数> pets, 69 plugins)`。
`node scripts/market-build --check` → `dist up to date (<文件数> files)`。

`git diff --stat` 仅两个文件：`packages/dsh-community-plugins/community.json`（+9 条记录）与 `market/dist/manifest/plugins.json`（对应派生条目），未改动其他条目，也未产生日期类噪声改动。

## 用户可见变更证据（Local Feature Evidence）

证据：

N/A —— 本条为社区插件索引的数据登记，dsh-web 自身无 UI 或行为变更。9 个插件均为 npm 已发布包，可在 https://www.npmjs.com/package/@hyzyn/dsh-tty 等包页面核对版本与内容。
