# @hyzyn/dsh-codegraph

DSH Web GUI 的 **Codegraph 集成插件**：官方 设置 → 插件 里的「Codegraph」卡片，提供代码图谱的图形化操作，并托管 codegraph MCP 服务器的项目目录。

## 功能

- **索引状态**：显示 Codegraph 是否已初始化、版本、文件/符号/边数量、最后索引时间、待同步变更。
- **符号搜索**：按名字搜索函数、类、常量、接口等符号。
- **符号详情**：点击搜索结果后自动加载源码、callers、callees、impact。
- **一键同步**：调用 `codegraph sync` 增量更新索引。
- **一键重建**：调用 `codegraph index` 全量重建索引。
- **Agent 提示**：向 systemPrompt 注入 Codegraph 使用提示，模型知道可以用 Codegraph 卡片或 MCP 工具查代码。
- **跟随当前项目**：控制台默认路径跟随当前活动会话的工作目录，切换项目会话自动切换；手动输入路径可临时覆盖。
- **MCP 托管**：自动管理 codegraph MCP 服务器行，把 `codegraph serve --mcp` 的工作目录与默认项目路径对齐；卡片「设为默认项目」一键切换，保存即热重启 MCP 服务器（无需重启宿主）。

## 为什么要托管 MCP 的工作目录

DSH 的 MCP 客户端不声明 MCP roots 能力，`codegraph serve --mcp` 启动后只能从**进程工作目录**向上查找 `.codegraph/`。而 `dsh web` 经常从家目录启动——这时模型调用 `mcp__codegraph__*` 一律拿到：

```
No CodeGraph project is loaded for this session.
Searched for a .codegraph/ directory starting from: /Users/you
```

本插件解决这个问题：在 `~/.dsh/cordis.patch.yml` 托管一行 codegraph MCP 服务器（`codegraph serve --mcp`，cwd = 默认项目路径）。默认项目路径变化（卡片「设为默认项目」或配置修改）即重写该行，DSH 的 watchUserPatches 热加载后自动把 MCP 服务器挂载到新项目。

行为细则：

- 优先复用 `@hyzyn/dsh-mcp` 托管区块里已有的 codegraph 行（只补 cwd，其余字段含禁用状态不动），没有才写本插件自己的区块，避免 serverName 撞名。
- 区块外的手工行只检测不碰（避免冲突）。
- 目标路径没有 `.codegraph/` 时绝不改写现有 cwd、也不凭空建行——不会把好配置改坏。
- 多项目使用：一台 codegraph MCP 服务器同一时刻挂载一个默认项目；其它已索引项目可在工具调用里传 `projectPath` 查询，或回卡片一键切换。
- 关闭方式：插件配置 `mcpIntegration: false`（会撤销本插件写入的托管行）。

## API

| 路由 | 方法 | 说明 |
| --- | --- | --- |
| `/api/dsh-codegraph/status?path=` | GET | 索引状态（JSON） |
| `/api/dsh-codegraph/query?q=&path=&limit=` | GET | 搜索符号 |
| `/api/dsh-codegraph/callers?symbol=&path=` | GET | 查调用者 |
| `/api/dsh-codegraph/callees?symbol=&path=` | GET | 查被调用者 |
| `/api/dsh-codegraph/impact?symbol=&path=&depth=` | GET | 查影响面 |
| `/api/dsh-codegraph/node?name=&path=` | GET | 查符号/文件详情 |
| `/api/dsh-codegraph/sync` | POST | 增量同步 `{ path }` |
| `/api/dsh-codegraph/index` | POST | 全量重建 `{ path }` |
| `/api/dsh-codegraph/default-path` | GET | 默认项目路径 + MCP 托管状态 |
| `/api/dsh-codegraph/default-path` | POST | 设为默认项目 `{ path }`（需已有 `.codegraph/`），同步热切换 MCP |

所有路由均为 loopback-only，防止远程访问。

## 开发

```bash
pnpm --filter @hyzyn/dsh-codegraph build
pnpm --filter @hyzyn/dsh-codegraph typecheck
node packages/codegraph/scripts/verify-sync.mjs   # 托管行同步逻辑验证（需先 build）
```

## 安装到 DSH

```bash
dsh plugin --profile web add link:$(pwd)
```

## 配置

```ts
export interface Config {
  /** 关闭整个插件。默认开。 */
  enabled?: boolean
  /** 是否向 agent 注入插件能力公告。默认开。 */
  announceToAgent?: boolean
  /** 是否向 systemPrompt 注入 CodeGraph 使用指引（CODEGRAPH_START 区块）。默认开。 */
  usageGuidance?: boolean
  /** codegraph CLI 命令，默认 `codegraph`。 */
  command?: string
  /** 默认项目路径，默认 `process.cwd()`。 */
  defaultPath?: string
  /** 是否托管 codegraph MCP 服务器行。默认开；关闭时撤销本插件写入的托管行。 */
  mcpIntegration?: boolean
}
```

settings 命名空间 `codegraph` 里保存过的 `defaultPath` / `mcpIntegration` 优先于插件配置；卡片「设为默认项目」写入的就是它。

## 系统提示词

安装后自动向 systemPrompt 注入两段提示：

- `plugin:dsh-codegraph`（order 150）：插件能力公告（中文），让模型知道有 Codegraph 卡片和 MCP 工具可用。
- `plugin:dsh-codegraph:usage`（order 151）：CodeGraph 使用指引（CODEGRAPH_START 区块），指导模型在已索引的项目里优先用 `codegraph_explore` / `codegraph explore` 而不是 grep/read；并给出 "No CodeGraph project" 报错时传 `projectPath` 重试的自愈路径。

均可通过配置关闭（`announceToAgent: false` / `usageGuidance: false`）。
