# @hyzyn/dsh-codegraph

中文 | [English](README.en.md)

> DSH **设置 → 插件** 里的「Codegraph」卡片：把代码图谱的状态、符号搜索、调用链搬进 GUI，并替你把 codegraph MCP 服务器的项目目录对齐好。

## 特性

- **检索到索引全链路都在卡片里**：`status --json` 的 `initialized` / `version` / `fileCount` / `nodeCount` / `edgeCount` / `lastIndexed` / `pendingChanges` 原样呈现；符号结果可下钻 `node` / `callers` / `callees` / `impact`，不必离开 GUI。
- **增量与全量两条索引路径**：`sync -- <path>` 走增量，`index [--force] -- <path>` 全量重建；查询类命令走 `cliTimeoutMs`（默认 60s），`sync` / `index` 走 `indexTimeoutMs`（默认 600s）。
- **托管 MCP 服务器的工作目录**：dsh-mcp-client 不声明 MCP roots 能力，`codegraph serve --mcp` 只能从 `process.cwd()` 向上查找 `.codegraph/`。插件在 `~/.dsh/cordis.patch.yml` 托管该服务器行并把 `config.cwd` 对齐默认项目，改写经 watchUserPatches 热加载，无需重启宿主。
- **索引判定与 CLI 的 `initialized` 同口径**：要求 `.codegraph/` 下存在索引库（`*.db`）。仅判目录存在会把 codegraph CLI 自身的安装目录 `~/.codegraph` 当作已索引项目，MCP 服务器于是以未索引目录为 cwd——实测此时 `codegraph_explore` 的必填项从 `query` 变成 `query` + `projectPath`，模型每次查询都得显式传路径。非真索引时不改写现有 cwd，并在卡片上给出 `indexState` 与原因。
- **卡片查询路径随活动会话**：默认取当前会话的 cwd，会话切换即跟随；默认项目（= MCP 的 cwd）由「设为默认项目」显式持久化到 settings 命名空间 `codegraph`，路径输入框可临时覆盖。
- **两段 systemPrompt 注入，各自独立开关**：`plugin:dsh-codegraph`（order 150，能力公告）与 `plugin:dsh-codegraph:usage`（order 151，使用指引）；两段均以 `<command> --version` 探测为前置（失败即不注入），卡片复选框写 `announceToAgent` / `usageGuidance` 到 settings 命名空间后即时增删 section。

![Codegraph 设置卡片：索引状态 / 符号搜索 / 一键同步](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-codegraph.png)

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
- 目标路径必须有**真索引**才托管：`.codegraph/` 里得存在索引库（`.db`）。只看目录存在是不够的——codegraph CLI 把自己的安装数据放在 `~/.codegraph`（`current -> versions/<v>`、`bundles/`、`codegraph.lock`，没有任何索引库），于是**家目录**会被误判成「已索引项目」，插件把 MCP 的 cwd 钉在家目录上并报告一切正常，而 `codegraph status --json -- ~` 实际返回 `initialized:false`，工具照旧拿 "No CodeGraph project is loaded"。命中这种情况时插件不改写现有 cwd、不凭空建行，并在卡片上提示「默认项目 X 不是有效索引」+ 一键修复路径。
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
| `/api/dsh-codegraph/default-path` | GET | 默认项目路径 + `indexState`（`indexed` / `missing` / `not-a-project`）+ 提示词开关 + `cliAvailable` + MCP 托管状态 |
| `/api/dsh-codegraph/settings` | POST | 写提示词开关 `{ announceToAgent?, usageGuidance?, mcpIntegration? }`（布尔），即时生效 |
| `/api/dsh-codegraph/default-path` | POST | 设为默认项目 `{ path }`（需 `.codegraph/` 里有索引库），同步热切换 MCP |

所有路由均为 loopback-only，防止远程访问。

## 兼容性（DSH / codegraph CLI）

- **DSH**：已在 `0.1.5-rc.2` 上实测全链路——宿主路由（status/query/callers/callees/impact/node 全 200）、浏览器半体（client 模块进 boot graph 并被 combo 路由正常供给）、两段 systemPrompt 注入、MCP 托管行形状（`@deepseek-ai/dsh-mcp-client` 的 `stdio` 配置）。`package.json` 声明 `dsh.engines.dsh: ">=0.1.2-rc.1"`，插件市场据此给出兼容性结论。
  - 为什么下限写成 `>=0.1.2-rc.1` 而不是更短的 `^0.1.2`：dsh-web 的解析器只认 `>=X.Y.Z[-预发布]` 一种形式，`^` / `~` / 光秃秃的版本号一律被判成「无法验证」；而 `^` 本身也不包含**下限版本自身的预发布**，`0.1.2-rc.1` 这种已实测可用的宿主会被判成不兼容，市场的更新路径对确认不兼容是**直接拒绝安装**（需 `force` 绕过）；`^0.1.5` 更会连 `0.1.5-rc.2` 一起误杀。DSH 长期以 `-rc.N` 发布，档位必须显式带上 RC 下限。
  - 为什么不写上上限 `<0.2.0`：解析器只支持单个 `>=` 比较符，两段式范围（`>=0.1.2-rc.1 <0.2.0`）整体会被读成「无法验证」，而按该模块的契约，已声明却无法验证是 fail-closed——更新会被直接拦下，比不声明更糟。跨到 0.2 线时人工重新复验，再决定是否放宽下限。
- **codegraph CLI**：已在 `1.5.0` 上实测；用到的子命令是 `status` / `query` / `callers` / `callees` / `impact` / `node` / `sync` / `index`，旗标逐个核对过。`codegraph serve --mcp` 仍可用（顶层 help 不列，`codegraph serve --help` 在），托管行无需改动。
- **浏览器半体的 URL 形态**：当前 DSH 走 client-modules 的 combo 路由，单包直链 `/plugins/@hyzyn/dsh-codegraph/client.js` 已不再直接可用；浏览器只用 boot graph（`window.__DSH_BOOT__`）下发的 `/plugins/??<id>/client.js&rev=…`，插件侧无需改动。
- **操作系统**：Windows / macOS / Linux 都按同一份代码走，CI 已是三平台矩阵（`pnpm -r build` + `typecheck` + `test`）。
  - **Windows**：CLI 走 `%COMSPEC% /d /s /c` + cmd 转义（npm / pnpm 全局安装只给 `.cmd` shim，`execFile` 直连会 `ENOENT`）；超时用 `taskkill /pid <pid> /T /F` **连 shim 里的孙进程一起收**（只杀 cmd.exe 的话大仓库 `index` 会继续跑完）；补丁文件重写沿用原文件行尾（CRLF 文件不会被写成混合行尾，重写也不改变行数）。
  - **PATH**：探测与调用都用插件配置的 `command`（默认 `codegraph`，走 PATH）。从 Dock / 开始菜单这类**不继承 shell 环境**的入口启动宿主时，PATH 里可能没有 CLI——此时两段 systemPrompt 不注入、卡片点不出可用命令，把 `command` 写成绝对路径即可（卡片会直接报出被探测的命令名）。
  - **MCP 行**：`dsh-mcp-client` 用官方 SDK 的 `StdioClientTransport`（SDK 依赖 `cross-spawn`），Windows 上 `.cmd` shim 由它自己解析，托管行无需平台分支。
  - 上游 CLI 本身三平台 × x64/arm64 官方支持（自带 Node 运行时）；本插件侧的索引判定只看 `.codegraph/` 下的 `*.db`，不写死库文件名，上游改名也不受影响。

## 开发

```bash
pnpm --filter @hyzyn/dsh-codegraph build
pnpm --filter @hyzyn/dsh-codegraph typecheck
pnpm vitest run packages/codegraph          # 托管行决策矩阵 + CLI 旋钮
node packages/codegraph/scripts/verify-sync.mjs   # 托管行同步逻辑验证（需先 build）
```

升级本机 DSH 之后，先重链再 typecheck——否则 `packages/*/node_modules/@deepseek-ai/*` 还是仓库
`.pnpm` 里那份旧副本，插件与宿主各持一份不同版本的库，兼容性问题会被掩盖：

```bash
node scripts/link-dsh-runtime.mjs     # 把 packages/* 的 @deepseek-ai/* 与 @hyzyn/dsh-kit 链到 dsh 运行时 / 本仓库 workspace
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
  /** 查询类命令（status/query/callers/callees/impact/node）超时毫秒数，默认 60000。 */
  cliTimeoutMs?: number
  /** 索引类命令（sync/index）超时毫秒数，默认 600000。大仓库全量重建会超过查询档。 */
  indexTimeoutMs?: number
  /** 给 `codegraph index` 追加 `--force`（CLI 拒绝索引家目录/文件系统根时会用到）。默认关。 */
  indexForce?: boolean
}
```

settings 命名空间 `codegraph` 里保存过的 `defaultPath` / `mcpIntegration` / `announceToAgent` / `usageGuidance` 优先于插件配置：卡片「设为默认项目」写第一个，两个提示词开关写后两个（`POST /api/dsh-codegraph/settings`）。

`command` / `cliTimeoutMs` / `indexTimeoutMs` / `indexForce` 是**安装级旋钮**，只读插件配置、不进 settings 命名空间。在 profile 的补丁里按 id 覆盖即可，例如：

```yaml
- id: codegraph
  config:
    indexTimeoutMs: 1800000
    indexForce: true
```

超时命中时卡片上的报错会直接点名对应配置项（`cliTimeoutMs` / `indexTimeoutMs`），不必去翻日志。

## 系统提示词

安装后自动向 systemPrompt 注入两段提示（合计约 310 token）：

- `plugin:dsh-codegraph`（order 150）：插件能力公告（中文，约 130 字），只说「有这张卡片、能引导用户去开」；卡片内部有哪些按钮是 UI 细节，不占模型上下文。
- `plugin:dsh-codegraph:usage`（order 151）：CodeGraph 使用指引（CODEGRAPH_START 区块）。这块对应上游 `CODEGRAPH_INSTRUCTIONS_BLOCK` 的定位（上游把它定义为「给子 agent / 非 MCP harness 的短块」，长 playbook 走 MCP `initialize` 的 `instructions`）——**但 DSH 的 MCP 客户端不读 `instructions`**，上游那份「无根索引 → 按项目传 `projectPath`」的变体模型收不到，所以这块补的就是它，外加三条：**shell 兜底**（命令名按 `command` 配置渲染，不写死 `codegraph`，并给出 `--path`）、**`projectPath` 按项目查询**、**没索引就跳过且不要 `codegraph init`**。触发条件与宿主 `indexState` 同口径：`.codegraph/` 里要有索引库，只看目录存在会把家目录里 CLI 自己的 `~/.codegraph` 安装目录误判成已索引项目（上游原话就是后者，这块刻意收紧）。

两段都受两道门禁：

1. **CLI 探测**：挂载时跑一次 `<command> --version`，失败就整段不注入（并 `console.warn`）——不向模型宣告跑不起来的能力。
2. **开关**：卡片上的两个复选框写 settings 命名空间（`POST /api/dsh-codegraph/settings`），改完即时增删 section；也可以用安装级配置关掉（`announceToAgent: false` / `usageGuidance: false`）。
