# @hyzyn/dsh-codegraph

DSH Web GUI 的 **Codegraph 集成插件**：官方 设置 → 插件 里的「Codegraph」卡片，提供代码图谱的图形化操作，并给 agent 注入 Codegraph 能力提示。

## 功能

- **索引状态**：显示 Codegraph 是否已初始化、版本、文件/符号/边数量、最后索引时间、待同步变更。
- **符号搜索**：按名字搜索函数、类、常量、接口等符号。
- **符号详情**：点击搜索结果后自动加载源码、callers、callees、impact。
- **一键同步**：调用 `codegraph sync` 增量更新索引。
- **一键重建**：调用 `codegraph index` 全量重建索引。
- **Agent 提示**：向 systemPrompt 注入 Codegraph 使用提示，模型知道可以用 Codegraph 卡片或 MCP 工具查代码。
- **跟随当前项目**：控制台默认路径跟随当前活动会话的工作目录，切换项目会话自动切换；手动输入路径可临时覆盖。

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

所有路由均为 loopback-only，防止远程访问。

## 开发

```bash
pnpm --filter @hyzyn/dsh-codegraph build
pnpm --filter @hyzyn/dsh-codegraph typecheck
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
}
```

## 系统提示词

安装后自动向 systemPrompt 注入两段提示：

- `plugin:dsh-codegraph`（order 150）：插件能力公告（中文），让模型知道有 Codegraph 卡片和 MCP 工具可用。
- `plugin:dsh-codegraph:usage`（order 151）：CodeGraph 使用指引（CODEGRAPH_START 区块），指导模型在已索引的项目里优先用 `codegraph_explore` / `codegraph explore` 而不是 grep/read。

均可通过配置关闭（`announceToAgent: false` / `usageGuidance: false`）。
