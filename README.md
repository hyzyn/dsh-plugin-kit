# dsh-plugin-kit

> DSH 插件全家桶：四款开箱即用的插件 + 一条命令生成新插件的开发脚手架。
> 插件已发布到 npm（`@hyzyn/dsh-all` 等），一行命令即可安装使用：`dsh plugin --profile web add @hyzyn/dsh-all`。
> npm 包名与仓库目录名均为 `dsh-plugin-kit`。

本仓库是一个 pnpm monorepo，主要解决两件事：

1. **用插件**：装好后，DSH Web GUI 的 设置 → 插件 里会出现四张管理卡片（环境变量 / MCP 服务器 / Prompt / Profile），全部图形化操作，保存即生效；
2. **写插件**：`pnpm create-plugin` 一条命令从模板生成新插件包，本地安装调试，构建发布。

## 目录结构

```
dsh-plugin-kit/
├── packages/
│   ├── env/      # 环境变量 / 密钥管理插件（Web GUI 设置卡片）
│   ├── mcp/      # MCP 服务器配置插件（Web GUI 设置卡片）
│   ├── prompt/   # Prompt 管理插件（Web GUI 设置卡片）
│   ├── profile/  # Profile 管理插件（Web GUI 设置卡片）
│   ├── all/      # 聚合安装包：一条命令装下全部插件
│   ├── hello/    # 最小插件模板（create-plugin 的复制蓝本）
│   └── kit/      # 插件开发工具包（definePlugin 类型助手）
├── scripts/
│   ├── create-plugin.mjs  # 从 hello 模板生成新插件
│   └── aggregate.mjs      # 重新生成 packages/all 聚合清单
└── tsconfig.base.json     # 各包共享的 TS 配置
```

## 快速开始（装插件）

### 直接安装（已发布到 npm，推荐）

插件已发布到 npm，**无需克隆仓库**，任何装了 DSH 的机器一条命令即可：

```bash
# 全家桶：一条命令装下全部插件
dsh plugin --profile web add @hyzyn/dsh-all
```

或按需单个安装：

```bash
dsh plugin --profile web add @hyzyn/dsh-env     # 环境变量 / 密钥管理
dsh plugin --profile web add @hyzyn/dsh-mcp     # MCP 服务器配置
dsh plugin --profile web add @hyzyn/dsh-prompt  # Prompt 管理
dsh plugin --profile web add @hyzyn/dsh-profile # Profile 管理
```

安装后**重启一次 `dsh web`**，打开 Web GUI 的 设置 → 插件，即可看到对应的管理卡片。
之后在卡片里的所有修改（保存环境变量 / MCP 服务器 / Prompt）都会**自动生效，无需再重启**。

> 卸载：`dsh plugin --profile web remove @hyzyn/dsh-<包名>`（如 `@hyzyn/dsh-mcp`），重启后插件行消失。

### 本地开发安装（从源码 link）

想改插件代码或调试时，从仓库源码安装：

**前置要求**：Node ≥ 22.19、pnpm 10、DSH（`dsh` 命令可用）。

```bash
cd dsh-plugin-kit
pnpm install
pnpm build        # 构建全部包，产出 lib/
```

```bash
# 全家桶
dsh plugin --profile web add link:$(pwd)/packages/all

# 或单个
dsh plugin --profile web add link:$(pwd)/packages/env
dsh plugin --profile web add link:$(pwd)/packages/mcp
dsh plugin --profile web add link:$(pwd)/packages/prompt
dsh plugin --profile web add link:$(pwd)/packages/profile
```

## 内置插件一览

| 插件 | 卡片位置 | 干什么用 |
| --- | --- | --- |
| `@hyzyn/dsh-env` | 设置 → 插件 →「环境变量 / 密钥管理」 | 图形化管理环境变量与密钥，保存后写入 `process.env` |
| `@hyzyn/dsh-mcp` | 设置 → 插件 →「MCP 服务器配置」 | 给 DSH 添加 MCP 服务器，模型即可使用 `mcp__<服务器>__<工具>` |
| `@hyzyn/dsh-prompt` | 设置 → 插件 →「Prompt 管理」 | 可视化编辑 systemPrompt，版本管理 / A/B 测试 / 导出分享 |
| `@hyzyn/dsh-profile` | 设置 → 插件 →「Profile 管理」 | 查看 / 创建 / 复制 / 重命名 / 删除 DSH profile |

### 环境变量 / 密钥管理（@hyzyn/dsh-env）

- **做什么**：在 Web GUI 里增删改环境变量和密钥，保存后立即写入当前进程的 `process.env`，宿主和之后启动的子进程都能读到，无需重启。
- **怎么用**：打开卡片 → 添加键值 →（敏感条目勾选「密钥」，以密码框显示）→ 保存。
- **支持**：普通字符串；`js:` 前缀表达式（如 `js:process.env.API_KEY`）；密钥标记。
- **存哪里**：`~/.dsh/env.yml` 的托管区块（自动生成，请勿手改）。
- **注意**：键名只允许字母/数字/下划线，且不能重复。

### MCP 服务器配置（@hyzyn/dsh-mcp）

- **做什么**：给 DSH 添加 MCP 服务器，保存后 1~2 秒内热加载为 `mcp__<服务器名>__<工具名>` 工具，模型即可直接调用，无需重启。
- **怎么用**：打开卡片 → 添加服务器（选传输方式）→（建议先点「连接测试」）→ 保存。
- **支持**：两种传输——stdio（本地子进程，如 `npx -y @modelcontextprotocol/server-filesystem`）与 streamable-http（远程服务）；`js:` 前缀表达式（如 `js:process.env.GITHUB_TOKEN`）；启用/停用、编辑、删除；状态徽章。
- **存哪里**：`~/.dsh/cordis.patch.yml` 的托管区块。
- **注意**：**不要**手工往该文件里追加插件行，否则启动时报 `duplicate loader entry id` 直接退出。

### Prompt 管理（@hyzyn/dsh-prompt）

- **做什么**：可视化编辑 systemPrompt，启用后其内容作为 systemPrompt section 注入，保存即生效。
- **怎么用**：打开卡片 → 新建/编辑 Prompt（可保存多个版本）→ 启用。
- **支持**：版本切换/回滚；A/B 测试（为同一 Prompt 选 A/B 两版并按权重随机命中）；导出 JSON/Markdown、一键复制分享、从 JSON 导入。
- **存哪里**：`~/.dsh/prompts.yml` 的托管区块。
- **注意**：每个 Prompt 至少一个版本，单版本内容 ≤ 500KB。

### Profile 管理（@hyzyn/dsh-profile）

- **做什么**：可视化查看 `~/.dsh/profiles` 下的全部 DSH profile，支持创建、复制、删除，方便维护多套 DSH 环境。
- **怎么用**：打开卡片 → 查看 profile 列表 → 新建 / 复制 / 删除。
- **支持**：初始化状态、bundle 层与依赖展示；默认 / `web` / `headless` 模板新建；复制排除 `node_modules` 与锁文件；重命名。
- **存哪里**：直接管理 `~/.dsh/profiles/<name>` 目录。
- **注意**：删除为递归删除，操作前请二次确认；新建后首次使用 `dsh plugin --profile <name> add ...` 时按需安装依赖。

## 界面预览

### MCP 服务器配置（@hyzyn/dsh-mcp）

![MCP 服务器配置插件](/docs/dsh-plugin-kit-mcp.png)

### 环境变量 / 密钥管理（@hyzyn/dsh-env）

![环境变量 / 密钥管理插件](/docs/dsh-plugin-kit-env.png)

### Prompt 管理（@hyzyn/dsh-prompt）

![Prompt 管理插件](/docs/dsh-plugin-kit-promat.png)

### Profile 管理（@hyzyn/dsh-profile）

![Profile 管理配置界面](/docs/dsh-plugin-kit-profile.png)

![命令行启动 headless profile 示例](/docs/dsh-plugin-kit-profile-example-headless1.png)

## 开发新插件

```bash
pnpm create-plugin <name> [id]
# 例：pnpm create-plugin timer          → packages/timer（@hyzyn/dsh-timer，插件 id: timer）
# 例：pnpm create-plugin pet-tracker pt → packages/pet-tracker（插件 id: pt）
```

脚本会复制 `packages/hello` 模板、替换包名与插件 id，并自动更新聚合包。然后：

1. 编辑 `packages/<name>/src/index.ts` 写插件逻辑；
2. 构建并本地安装调试：

```bash
pnpm --filter @hyzyn/dsh-<name> build
dsh plugin --profile web add link:$(pwd)/packages/<name>
```

### 插件包长什么样（以 hello 为例）

| 文件 / 字段 | 作用 |
| --- | --- |
| `package.json#dsh.bundle.patch` | 指向 `cordis.patch.yml`，声明本包是 bundle 补丁层 |
| `cordis.patch.yml` | `insert` 一行，把插件挂进 profile 阵容 |
| `src/index.ts` | 宿主半体：导出 `{ name, inject, apply }` 形状的 Cordis 插件 |
| `package.json#dsh.client` | 可选：声明浏览器半体，Web GUI 以 `/plugins/<id>/client.js` 加载 |

服务注入两种写法：`inject: ['tools', 'webServer']` 后直接 `ctx.tools`；或运行时 `ctx.get('tools')` 判空。配置用 schemastery 导出同名 `Config` schema。

## 常用命令速查

| 命令 | 作用 |
| --- | --- |
| `pnpm install` | 安装依赖 |
| `pnpm build` | 构建全部包（tsc 产出 lib/） |
| `pnpm typecheck` | 全仓类型检查 |
| `pnpm create-plugin <name> [id]` | 从模板生成新插件 |
| `pnpm aggregate` | 重新生成 `packages/all` 聚合清单（增删插件后跑一次） |

## 常见问题

**卡片没出现？**
重启 `dsh web`；确认用的是官方 `dsh-web-app` 设置面板（浏览器半体依赖核心 slots 服务）。

**改了插件代码不生效？**
重新 `pnpm build` 后重启 `dsh web`。

**MCP 服务器保存后没有工具？**
等 1~2 秒 HMR；在卡片里看状态徽章与冲突提示；保存前先点「连接测试」。

**报 `duplicate loader entry id`？**
多半是手工往 `~/.dsh/cordis.patch.yml` 加了插件行。删掉重复行——插件行只由 bundle 补丁挂载，托管区块只放服务器配置。

**`npm install` / `npm view` 报 EPERM？**
本机 `~/.npm` 缓存存在 root-owned 文件（历史 npm bug），执行 `sudo chown -R $(id -u):$(id -g) ~/.npm` 修复。pnpm 不受影响。

## 环境备注

- SDK 版本基线：`@deepseek-ai/dsh-*@0.1.0-rc.6`、`@deepseek-ai/cordis@^4.0.1`、`schemastery@^3.18`（官方 profile 里 alias 到 `@deepseek-ai/schemastery@3.18.1`）。

## 参考

- DSH 内置 skill `cordis-plugin-development`：动态 Cordis 插件（运行时 cordis_define）的开发规范
- 各插件包内 README（`packages/<name>/README.md`）：更详细的实现说明
