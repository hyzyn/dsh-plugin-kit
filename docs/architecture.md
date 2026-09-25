# 架构：12 个包怎么组成一个 DSH 插件全家桶

> **本文是「12 个包关系与协作」的唯一归宿。** 包内功能见各包 README；规矩见
> [conventions.md](./conventions.md)；术语见 [glossary.md](./glossary.md)。
>
> 判据：**「改一个包就能说清」→ 写进包 README；「要跨 ≥2 个包才说得清」→ 写进本文。**
> 所以本文只讲**边界与依赖**，不重复任何单包功能。

## 1. 一句话构成

```
@hyzyn/dsh-kit            ← 共享库（唯一的非插件包，无 cordis.patch.yml）
    ↑ 被下面 9 个插件依赖（`kit-settings` 是唯一例外，见 §2）
@hyzyn/dsh-<插件> ×10     ← 功能插件（各有自己的托管区块 / 配置 / 客户端半体）
    ↑ 被聚合
@hyzyn/dsh-all            ← 聚合安装包（一条 bundle patch 挂载上面 10 个）
```

仓库根 `package.json` 本身也是一个 bundle，`dsh plugin add link:$(pwd)` 等价于装 `dsh-all`。

## 2. 包清单

| 包 | 类型 | 干什么（一句话） | 文档 |
|---|---|---|---|
| `@hyzyn/dsh-kit` | **库** | 宿主半体共享工具：HTTP 回环围栏、托管区块读写、`!!js` 表达式、服务读取、Windows shim、输出解码 | [README](../packages/kit/README.md) · [DEFECTS](../packages/kit/DEFECTS.md) |
| `@hyzyn/dsh-kit-settings` | 插件 | 在官方「设置」里补一行与「通用设置」平级的「插件配置」入口。**不依赖 kit** | [README](../packages/kit-settings/README.md) |
| `@hyzyn/dsh-mcp` | 插件 | MCP 服务器配置卡片，保存后热加载为 `mcp__<server>__<tool>` | [README](../packages/mcp/README.md) |
| `@hyzyn/dsh-env` | 插件 | 环境变量 / 密钥管理，保存即写 `process.env` | [README](../packages/env/README.md) |
| `@hyzyn/dsh-prompt` | 插件 | systemPrompt 可视化编辑 / 版本 / A/B | [README](../packages/prompt/README.md) |
| `@hyzyn/dsh-profile` | 插件 | `~/.dsh/profiles` 的图形化管理 | [README](../packages/profile/README.md) |
| `@hyzyn/dsh-rss` | 插件 | RSS 聚合 → 每日「今日值得读」→ 注入 systemPrompt | [README](../packages/rss/README.md) |
| `@hyzyn/dsh-search` | 插件 | 侧边栏全局搜索（会话 / Prompt / MCP 工具 / 设置） | [README](../packages/search/README.md) |
| `@hyzyn/dsh-codegraph` | 插件 | 代码图谱卡片 + MCP 托管 + 采纳率测量 | [README](../packages/codegraph/README.md) · [DEFECTS](../packages/codegraph/DEFECTS.md) · [ROADMAP](../packages/codegraph/ROADMAP.md) |
| `@hyzyn/dsh-tty` | 插件 | 终端面板（PTY / SSH / SFTP / 隧道）+ `tty_*` `sftp_*` 工具 | [README](../packages/tty/README.md) · [DEFECTS](../packages/tty/DEFECTS.md) · [ROADMAP](../packages/tty/ROADMAP.md) |
| `@hyzyn/dsh-docker` | 插件 | Docker 容器面板（本机 / SSH）+ `docker_*` 工具，默认只读 | [README](../packages/docker/README.md) · [DEFECTS](../packages/docker/DEFECTS.md) · [ROADMAP](../packages/docker/ROADMAP.md) |
| `@hyzyn/dsh-all` | 聚合 | 一条 bundle patch 挂载上面 10 个插件 | [README](../packages/all/README.md) |

> `kit` 是**唯一的库**：它没有 `cordis.patch.yml`，不挂载任何东西，也不出现在 `dsh-all` 的
> 依赖里（它是各插件的 `dependencies`）。写新插件时先看
> [conventions.md § 插件包解剖](./conventions.md#插件包解剖)。
>
> **`kit-settings` 为什么是唯一不依赖 kit 的插件**：它的宿主半体「只负责让这个包在 Loader 里成为
> 一行，**不注册路由、不占用 settings 命名空间、不向 systemPrompt 注入任何东西**」，
> 且 `inject: []`（不依赖任何宿主服务）；全部工作都在浏览器半体，靠 `settings.section` +
> `settings.kit.item` 两个 slot 渲染（出处：`packages/kit-settings/src/index.ts` 的文件头注释）。
> 而 kit 提供的是**宿主半体**工具（HTTP 围栏 / 托管区块 / `!!js` / 服务读取 / Windows shim / 输出解码）
> ——它一个都用不上，所以 `dependencies` 为空。

## 3. 依赖方向（不许反向）

```
插件 ──depends──▶ @hyzyn/dsh-kit ──depends──▶ js-yaml
插件 ──peerDep──▶ @deepseek-ai/dsh（宿主）· @deepseek-ai/dsh-tools · @deepseek-ai/dsh-mcp-client
```

**硬规矩**：

- **插件之间不得互相 `import`。** 需要协作时走**数据级复用**（见 §5），或走宿主公开服务。
- 插件**只**依赖 `@hyzyn/dsh-kit` 与宿主 `@deepseek-ai/*`；新增第三方运行时依赖要在包 README 里写明理由。
  **没有任何运行时依赖也是允许的**（`kit-settings` 就是：宿主半体只占一行，工作全在浏览器半体）。
- 全部插件的 `peerDependencies` 必须钉同一个 DSH 版本下限；`dsh.engines.dsh` 必须与 peer 下限**一致**
  （宿主不读 engines，但插件市场按它展示）。CI 的 `scripts/check-dsh-peers.mjs` 兜底校验三者。

## 4. 谁写哪个文件（跨包冲突的唯一来源）

`~/.dsh` 下的文件**多个包都会写**，这是本仓库最容易出事的地方。当前归属：

| 文件 | 写入者 | 保护机制 |
|---|---|---|
| `~/.dsh/cordis.patch.yml`（**托管区块**） | `mcp`（服务器行）、`codegraph`（MCP 服务器行 + 只改 cwd） | 两者都做**写前复核**（mtime+size 弱 CAS，≤3 次重读）；`codegraph` 用定点行编辑，不整块重写 |
| 当前 profile 的 `cordis.patch.yml`（**用户层**） | 各插件的 entry 配置（`docker` / `tty` / `codegraph` / `rss` …） | 由宿主 settings 服务管；插件不直接写 |
| `~/.dsh/env.yml`（托管区块） | `env` | 托管区块读写（`kit` 的 `managed-block`） |
| `~/.dsh/prompts.yml`（托管区块） | `prompt` | 同上；`search` **只读**它 |
| `~/.dsh/rss-digest/YYYY-MM-DD.md` | `rss` | 独占 |
| `~/.dsh/.credentials.yaml` | `env`（经官方凭据存储） | write-only：接口不回明文 |
| `~/.dsh/profiles/<name>/` | `profile` | 独占 |

**为什么 `cordis.patch.yml` 有两套写法**：`mcp` 与 `codegraph` 都往同一个文件里插服务器行。
`codegraph` 最初整块重写，结果是**有损往返**（别人的 override 形状与注释被静默删除）；
后来改成定点只改自己那行的 `cwd:`。**新增「写这个文件」的插件时，照 `codegraph` 的定点写法做**，
不要整块重写。

> ⚠️ 手工往 `~/.dsh/cordis.patch.yml` 追加**插件行**会导致启动报 `duplicate loader entry id`——
> 插件行只由 bundle 补丁挂载，托管区块只放服务器配置。

## 5. 跨插件协作（数据级复用，不是代码依赖）

这几条是「装了 A 才能用 B 的某个功能」，**版本门限是契约**：

| 提供方 | 消费方 | 门限 | 协作方式 |
|---|---|---|---|
| `tty` | `docker` | tty ≥ 0.15.0 | 容器卡片首个图标变「终端」→ 调 tty 的 `ttyTerminal.mount` **就地嵌入**面板底部抽屉 |
| `tty` | `docker` | tty ≥ 0.14.0 | 退化为「新开终端标签 + 收面板」 |
| `tty` | `docker` | tty ≥ 0.13.0 | SSH 标签连接栏出现「容器」按钮，用当前会话那台主机直接开面板 |
| `tty` | `docker` | 任意 | `kind=ssh` 目标可直接**引用 tty 连接簿条目名**；主机指纹 TOFU **以 tty 已有记录作种子** |
| `mcp` | `codegraph` | — | 同一份 `cordis.patch.yml` 托管区块；codegraph 只补自己那行的 `cwd`，已在 MCP 卡片配置过的行不动其它字段 |
| `prompt` | `search` | — | `search` **只读** `~/.dsh/prompts.yml` 托管区块 |
| `mcp` | `search` | — | `search` 按 `mcp__` 前缀枚举已挂载工具并标注所属 server |
| `kit-settings` | 全部插件 | — | 提供「设置 → 插件配置」这一行入口（0.1.5 时代卡片形态）；各插件同时注册三代插槽 |

**协作的硬约束**：消费方必须**在提供方未安装 / 版本过低时优雅退化**（上面每一行都有退化路径）。
`docker` 的「终端」按钮三级退化就是范本：**能嵌就嵌，不能嵌就开标签，再不行就复制命令**。

## 6. 客户端半体与供给链

每个插件可选声明浏览器半体（`package.json#dsh.client`）。宿主按
`/plugins/<id>/client.js`（或 combo 路由 `/plugins/??<id>/client.js&rev=<hash>`）供给，
`rev` 是**内容哈希**——猜 rev 必然 404。

- **产物入库**：`packages/*/client.js` 与 `packages/*/lib/**` 随源码提交，CI 有「产物 = 源码」闸门
  （`pnpm -r build` 后 `git diff --exit-code -- 'packages/*/client.js' ':(glob)packages/*/lib/**'`）。
  改源码**必须**重建产物；**`lib/` 那半边在 CI 里目前是失效的**，细节与实测见
  [conventions.md § 真机脚本与 CI 接线](./conventions.md#真机脚本与-ci-接线)。
- **纯逻辑抽模块**：要判对错的客户端逻辑抽成 `client-src/*.js` 纯模块 + vitest 用例，
  由构建脚本内联进单文件 `client.js`。理由与两条硬规矩见
  [conventions.md § 客户端半体](./conventions.md#客户端半体两条硬规矩)。
- **三代插槽**：客户端半体同时注册 `plugins.row.config`（官方新版行配置）、
  `settings.kit.item`、`settings.plugin.item`，一份产物在各代宿主上都能用。

## 7. 一条请求经过什么

```
浏览器 client.js
  └─ fetch('/api/dsh-<id>/…')          ← 相对路径，桌面版与浏览器都成立
       └─ 宿主插件路由
            ├─ kit.isLoopbackRequest()  ← 回环围栏（全部路由）
            ├─ kit.readJsonBody()       ← POST body 围栏（畸形/超限 → undefined → 400）
            └─ 业务：子进程 / SSH / 文件 / 宿主服务
```

三条**跨包一致**的约定，改任何插件都适用：

1. **回环围栏**：全部路由先过 `isLoopbackRequest`；变更端点另需**同源证明**（`Origin` / `Sec-Fetch-Site`），
   且来源检查必须排在 DNS 等异步分支**之前**。
2. **body 围栏**：`readJsonBody` 对畸形 / 超限 / 空 body **返回 `undefined` 而不抛错**——
   调用方必须把 `undefined` 当 **400**，**不能**当「没传这个字段」。写操作尤其。
3. **截断要有信号**：任何截断（列表、日志、输出）都要显式报 `truncated` / 计数说明，
   **不许静默少列**。这是本仓库历史上出现最多的一类缺陷。

## 8. 文档在哪一层

见 [conventions.md § 文档分层](./conventions.md#文档分层)。一句话：
**L0 管跨包（本目录）· L1 管包内（`packages/<pkg>/`）· L2 是代码注释。**
每类知识只在**一个**层级展开，其他位置只引用不复制。
