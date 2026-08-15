# dsh-plugin-kit

通用 DSH 插件库 —— pnpm monorepo：一条命令生成插件模板，一条 patch 聚合全库安装。

> npm 包名与仓库目录名均为 `dsh-plugin-kit`。

## 目录结构

```
dsh-plugin-kit/
├── packages/
│   ├── hello/            # 最小 host 插件模板（create-plugin 的复制蓝本）
│   ├── env/              # 环境变量 / 密钥管理插件（Web GUI 设置卡片）
│   ├── mcp/              # MCP 服务器配置插件（Web GUI 设置卡片）
│   ├── prompt/           # Prompt 管理插件（Web GUI 设置卡片）
│   ├── all/              # 聚合安装包：一条 bundle patch 挂载全部插件
│   └── kit/              # 插件开发工具包（definePlugin 等类型助手）
├── scripts/
│   ├── create-plugin.mjs # 从 hello 模板生成新插件包
│   └── aggregate.mjs     # 重写 packages/all 的聚合清单
├── tsconfig.base.json    # 各包共享的 TS 配置
└── pnpm-workspace.yaml
```

## 已实现插件

| 包名 | 说明 |
| --- | --- |
| `@dsh-kit/hello` | 最小 host 插件模板 / 示例插件，也是 `pnpm create-plugin` 的复制蓝本 |
| `@dsh-kit/env` | 环境变量 / 密钥管理插件：在 Web GUI 设置 → 插件中提供「环境变量 / 密钥管理」卡片，管理 `~/.dsh/env.yml` 中的环境变量与密钥（支持普通值、`js:` 表达式、密钥标记、写入 `process.env`） |
| `@dsh-kit/mcp` | MCP 服务器配置插件：在 Web GUI 设置 → 插件中提供「MCP 服务器配置」卡片，管理 `~/.dsh/cordis.patch.yml` 中的 MCP 服务器（支持 stdio / streamable-http、连接测试、启用/停用） |
| `@dsh-kit/prompt` | Prompt 管理插件：在 Web GUI 设置 → 插件中提供「Prompt 管理」卡片，可视化编辑 systemPrompt、版本管理、A/B 测试、导出/分享（管理 `~/.dsh/prompts.yml`） |

> `@dsh-kit/all` 是聚合安装包，`@dsh-kit/kit` 是插件开发工具包，不属于业务插件。

## 插件界面

### MCP 服务器配置（@dsh-kit/mcp）

![MCP 服务器配置插件](/docs/dsh-plugin-kit-mcp.png)

### 环境变量 / 密钥管理（@dsh-kit/env）

![环境变量 / 密钥管理插件](/docs/dsh-plugin-kit-env.png)

### Prompt 管理（@dsh-kit/prompt）

可视化编辑 systemPrompt、版本管理、A/B 测试、导出/分享。

![Prompt 管理插件](/docs/dsh-plugin-kit-promat.png)

## 快速开始

```bash
pnpm install
pnpm build      # 构建全部包（tsc 产出 lib/）
pnpm typecheck  # 全仓类型检查
```

## 创建新插件

```bash
pnpm create-plugin <name> [id]
# 例：pnpm create-plugin timer          → packages/timer（@dsh-kit/timer，插件 id: timer）
# 例：pnpm create-plugin pet-tracker pt → packages/pet-tracker（@dsh-kit/pet-tracker，插件 id: pt）
```

脚本复制 `packages/hello` 并替换包名与插件 id，随后自动重跑聚合脚本。
生成后编辑 `packages/<name>/src/index.ts` 即可。

## 插件包解剖（DSH 约定）

以 `packages/hello` 为例：

| 文件 / 字段 | 作用 |
| --- | --- |
| `package.json#dsh.bundle.patch` | 指向 `cordis.patch.yml`，声明本包是一个 bundle 补丁层 |
| `package.json#dsh.client` | 可选。有浏览器半体时声明 `{ "platform": "web", "inject": [...] }`，`./client` 导出会被 Web GUI 以 `/plugins/<id>/client.js` 加载 |
| `cordis.patch.yml` | `- insert: - id: <id> / name: '<包名>'`，把插件行插入 profile 阵容 |
| `src/index.ts` | 宿主半体：导出 `{ name, inject, apply(ctx, config?) }` 形状的 Cordis 插件 |
| `exports["."]` | 宿主进程加载的入口；`./client` 为浏览器半体（可选） |

服务注入两种写法：`inject: ['tools', 'webServer']` 后直接 `ctx.tools`；或运行时 `ctx.get('tools')` 并判空。
配置可用 schemastery 导出同名 `Config` schema。

## 安装到 DSH

开发期（本地链接）：

```bash
# 单个插件
dsh plugin --profile web add link:$(pwd)/packages/hello
# 整个库（聚合包把全部插件行插入阵容）
dsh plugin --profile web add link:$(pwd)/packages/all
```

发布后按普通 npm 包安装（profile 的 `dsh.profile.bundles` 与 dependencies 指向你的包名）。

## 聚合包机制

`packages/all` 是「一键全家桶」：`pnpm aggregate` 扫描 `packages` 下各子目录中带
`dsh.bundle.patch` 的插件，把它们的行汇总进 `packages/all/cordis.patch.yml`，
并把 dependencies 同步为 `workspace:*`。新增/删除插件后重跑一次即可。

## 发布

1. 把聚合包与各插件的 `workspace:*` 依赖改成真实版本号；
2. 把 `@dsh-kit/*` scope 换成你拥有的 npm scope（如 `@yourname/dsh-*`，与生态命名习惯一致）；
3. `pnpm -r publish`（`files` 字段已包含 lib/、cordis.patch.yml、README）。

## 构建说明

- 纯 TS 宿主插件：`tsc` 直接产出 ESM（`rewriteRelativeImportExtensions` 把源码里的 `.ts` 相对导入重写为 `.js`），无需打包器；
- 带 JSX/CSS 的客户端插件：加 `tsdown`（`build: tsc -p tsconfig.build.json && tsdown`）做浏览器半体打包。

## 本机环境备注

- `~/.npm` 缓存存在 root-owned 文件（历史 npm bug），`npm view` / `npm install` 会 EPERM；修复：`sudo chown -R $(id -u):$(id -g) ~/.npm`。pnpm 不受影响。
- SDK 版本基线：`@deepseek-ai/dsh-*@0.1.0-rc.6`、`@deepseek-ai/cordis@^4.0.1`、`schemastery@^3.18`（官方 profile 里 alias 到 `@deepseek-ai/schemastery@3.18.1`）。

## 参考

- DSH 内置 skill `cordis-plugin-development`：动态 Cordis 插件（运行时 cordis_define）的开发规范
