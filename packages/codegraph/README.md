# @hyzyn/dsh-codegraph

中文 | [English](README.en.md)

> DSH **设置 → 插件** 里的「Codegraph」卡片：把代码图谱的状态、符号搜索、调用链搬进 GUI，并替你把 codegraph MCP 服务器的项目目录对齐好。

## 特性

- **`status --json` 字段分区呈现**：`initialized` / `version` / `projectPath` / `fileCount` / `nodeCount` / `edgeCount` / `lastIndexed` / `pendingChanges` / `languages` / `dbSizeBytes` 分区铺开，原始 JSON 收进 `<details>`；符号下钻输出带行号的 verbatim 源码 + `callers` / `callees` / `impact` 三段关系。CLI 的过期信号（`reindexRecommended` / `builtWithVersion` / 提取器版本差 / `worktreeMismatch`）会在面板上给出一行警告并把「重建索引」标成建议动作。
- **索引两条路径、超时分两档**：`sync -- <path>` 增量、`index [--force] -- <path>` 全量重建走 `indexTimeoutMs`（默认 600s，`0` = 不限时）；`status` / `query` / `callers` / `callees` / `impact` / `node` 走 `cliTimeoutMs`（默认 60s，`0` = 不限时）。超时与取消都走「SIGTERM → 3s 清理窗口 → SIGKILL」的进程组升级链，POSIX 与 Windows 同一套语义；索引类操作进行中卡片有「取消」按钮，关闭页面也会中止 CLI。
- **托管 MCP 服务器行**：dsh-mcp-client 不声明 MCP roots，`codegraph serve --mcp` 只从 `process.cwd()` 向上解析 `.codegraph/`；插件在 `~/.dsh/cordis.patch.yml` 维护 `@deepseek-ai/dsh-mcp-client` 行并写 `config.cwd`，改写经 watchUserPatches 热加载重建 MCP 连接。同一台服务器同一时刻只挂一个项目，其余项目用 `projectPath` 查询。
- **索引判定取 `.codegraph/*.db` 且与 CLI 同口径向上解析**：从目标目录向上（到 git 根为止）找第一个带索引库的 `.codegraph/`，命中根即项目根——monorepo 子目录里的会话不再被误判「未索引」。只看目录存在会把 codegraph CLI 自身的安装目录 `~/.codegraph` 判成项目索引，托管行随之落在未索引 cwd 上——实测该状态下 `codegraph_explore` 的 required 由 `["query"]` 变为 `["query","projectPath"]`。非真索引时不改写现有 cwd，卡片给出 `indexState` 与原因。
- **写入纪律**：对 `~/.dsh/cordis.patch.yml` 的每次写都带 mtime+size 盖章复核（dsh-mcp 同款 CAS，≤3 次重读）；复用 dsh-mcp 区块时只定点改 codegraph 行自己的 `cwd:` 一行，区块里的注释、其它服务器行、loader 合法的 override 条目逐字节保留；区块损坏时拒绝追加第二个区块（serverName 撞名会让 codegraph MCP 整体加载失败），把原因报给卡片。
- **托管行 cwd 跟随活动会话**：`followSession`（默认开）在会话切到有效索引项目时对齐托管行，否则回落到绑定路径；绑定路径由「设为默认项目」写入 settings 命名空间 `codegraph` 并把 `followSession` 置 false（显式指定优先于会话跟随）。会话上报失败会退避重试，不再一次抖动就永久失效。
- **一键初始化**：未初始化的目录在卡片上直接点「初始化索引」跑 `codegraph init`（两步确认）——`index` / `sync` 都要求项目先 init 过，此前这是唯一还要把用户赶回终端的一步。
- **systemPrompt 分两段，开关与门禁各自独立**：`plugin:dsh-codegraph`（order 150）与 `plugin:dsh-codegraph:usage`（order 151）；两段均以 `<command> --version` 探测为前置，`announceToAgent` / `usageGuidance` 写 settings 命名空间后即时增删 section。

![Codegraph 设置卡片：8 格状态面板、符号下钻、跟随开关](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-codegraph.png)

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
- 跟随语义：托管行 cwd = 「跟随开启 + 会话目录是有效索引」时取会话目录，否则取绑定路径。有效索引按 `.codegraph/` 里**存在索引库**判定（不是目录存在），所以家目录那种 `~/.codegraph` 安装目录不会把 cwd 带偏；项目被 `uninit` 后也会自动回落，不留陈旧状态。
- 跟随由**浏览器半体**上报（页面加载即订阅活动会话，与设置面板是否展开无关）：宿主侧没有「当前会话」这个信号，因此跟随只在有 GUI 页面打开时生效，其余情况用绑定路径。
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
| `/api/dsh-codegraph/index` | POST | 全量重建 `{ path }`（要求项目**已经初始化过**，见下） |
| `/api/dsh-codegraph/init` | POST | 在**未初始化**的目录跑一次 `codegraph init`（建 `.codegraph/` + 首次索引），成功后重算 MCP 托管行；已索引目录回 409 |
| `/api/dsh-codegraph/default-path` | GET | 绑定路径 `defaultPath` + 生效路径 `effectivePath` + `sessionPath` + `followSession` + 提示词开关 + `cliAvailable` / `cliProbeError` / `cliProbeAt` + MCP 托管状态（`indexState` 针对**生效路径**） |
| `/api/dsh-codegraph/follow` | POST | 上报活动会话目录 `{ path }`（空 = 无活动会话）；宿主据此对齐托管行 cwd，非索引目录自动回落 |
| `/api/dsh-codegraph/settings` | POST | 写开关 `{ announceToAgent?, usageGuidance?, mcpIntegration?, followSession? }`（布尔），即时生效 |
| `/api/dsh-codegraph/default-path` | POST | 设为默认项目 `{ path }`（需 `.codegraph/` 里有索引库），同步热切换 MCP |
| `/api/dsh-codegraph/reprobe` | POST | 重跑一次 `<command> --version` 探测，回 `{ cliAvailable, cliProbeError, cliProbeAt }` 并同步 systemPrompt 门禁 |
| `/api/dsh-codegraph/unlock` | POST | 清挡住索引的陈旧锁 `{ path }`（`codegraph unlock`，幂等：没锁时 exit 0） |
| `/api/dsh-codegraph/cancel` | POST | 取消进行中的 CLI 调用 `{ path? }`（缺省 = 全部）；关标签页的断连也会自动中止对应调用 |
| `/api/dsh-codegraph/diagnose` | GET | 收集诊断包 `{ path?, report }`：`report` 是一段纯文本，含版本/平台、CLI 探测实测原文、索引状态、托管行与**脱敏后**的补丁区块原文、`~/.codegraph` 的 daemon 登记与日志尾、最近一次 CLI 失败、以及采纳率 |
| `/api/dsh-codegraph/metrics` | GET | 采纳率 `{ path? }`：不带 `path` 回全部项目 `{ summaries, since }`；带 `path` 回该项目 `{ project, summary, text, since }` |

所有路由均为 loopback-only，防止远程访问。`reprobe` 只认 POST：它会真的起一个子进程，不该由 GET 顺带触发。`diagnose` 只认 GET（只读），但它可能补跑一次探测，所以不会在写路径上被顺手调用。

诊断包的脱敏口径（`diagnose`）：`~/.dsh/cordis.patch.yml` 是所有 MCP 服务器共用的文件，别家的行里可能有 `headers` / `env` 这类凭据，所以**只摘 codegraph 相关的两个区块**（本插件区块 + dsh-mcp 卡片区块），并按**键名**处理——`id` / `name` / `serverName` / `transport` / `command` / `args` / `cwd` / `disabled` 留值（这些正是排查要看的东西），其余键一律 `<redacted>`，且 `headers:` / `env:` 这类敏感键会污染整棵子树（连 `authorization:` 的值一起抹掉，但键名保留）。新增字段默认脱敏（fail-closed）。

## 采纳率仪表

卡片上那行「采纳率」回答的是**配置之外**的问题：配好了之后，模型到底买不买账。

- **数据来源**：宿主既有的 `session/event` 事件流（只数 `tool/call`，与 `dsh-agent-instructions` / `dsh-acp` 同一个公开订阅面）。不数 `tool/result`——采纳率问的是「模型想不想用」，失败了也是想用（那是另一个问题，由诊断包回答）。
- **分子/分母（两个口径，窄口径是主口径）**：`codegraph` 命中 `mcp__codegraph__*`；**窄口径**分母是「发现类」调用（`grep` / `glob` / `search` / `find` / `list_dir`），**宽口径**分母还包含 `read` / `view` / `open`。之所以两个都报：真实历史里 `read` 占 1956 次而 `grep` 只有 100 次，而 `read` 多半是「打开已知道要改的文件」——codegraph 替代的是「找东西」，把 `read` 算进主口径会把数字永久压在个位数（实测宽口径 2.2% vs 窄口径 28.8%）。
- **`bash` / 媒体 / 网络类不计入分母**：模型用 bash 干的事大部分（跑测试、装依赖、git）与代码探索无关；`read_image` / `read_pdf` / `web_search` 同理（这一条是拿真实历史量过之后补的，见下）。
- **实测数字见 [ADOPTION-AUDIT.md](./ADOPTION-AUDIT.md)**：从 177 个真实历史会话回溯——会话级 23%、窄口径 28.8%、最近三天 47%，并给出 codegraph 调用 query 的质量抽样（34/47 带具体符号名）。
- **分母为 0 显示「还没有探索类调用」而不是 0%**：「一次都没探索」与「探索了但全用 grep」是两回事。
- **项目键 = 索引根**（`resolveIndexedRoot`），与托管行 cwd、注入门禁同一口径；所以同一个仓库的多个会话（换会话、子 agent、重启宿主）会归并成一条，而不是散成一堆没有统计意义的小样本。未索引项目也会记，但文案会标明「这个数字不代表提示词效果」，且 `/metrics` 额外给 `grouped.indexed` / `grouped.unindexed` 两组合计——未索引项目里模型本就不该用它，混进整体会得出没有意义的数字。
- **只在内存里，宿主重启即归零**，`since` 会如实给出起点。不落盘是有意的：它是「现在要不要调提示词」的观测值，不是审计日志，落盘会把工具名与项目路径长期留在磁盘上。
- 同一份数据也进诊断包（`/diagnose`），因为报告「codegraph 好像没效果」时，第一个要分清的就是「模型根本没用」还是「用了但结果不对」。

请求语义（v0.4.2 起）：

- **POST 路由对畸形 / 超限 / 非对象的 body 一律 400**——不会把「请求体没读出来」当成「没指定路径」而在默认项目上执行写操作。
- **路径必须真实存在且是目录**：`status` / `query` / `callers` / `callees` / `impact` / `node` 对不存在的路径回 400（CLI 对不存在的路径会 exit 0 + 空结果，静默得像「没有匹配」）；`--limit` / `--depth` 只收正整数（`limit` 上限 10000，`depth` 的上限由 CLI 自己钳到 10）。
- **祖先口径**：`/default-path` 的 POST 在 monorepo 子目录上会绑定**索引所在的仓库根**；对子目录调 `/init` 回 409（祖先已有索引，避免建出嵌套索引）；`/follow` 拒绝不存在目录的路径上报。

## 兼容性（DSH / codegraph CLI）

- **DSH**：已在 `0.1.5-rc.2` 上实测全链路——宿主路由（status/query/callers/callees/impact/node 全 200）、浏览器半体（client 模块进 boot graph 并被 combo 路由正常供给）、两段 systemPrompt 注入、MCP 托管行形状（`@deepseek-ai/dsh-mcp-client` 的 `stdio` 配置）。`package.json` 声明 `dsh.engines.dsh: ">=0.1.2-rc.1"`，插件市场据此给出兼容性结论。
  - 为什么下限写成 `>=0.1.2-rc.1` 而不是更短的 `^0.1.2`：dsh-web 的解析器只认 `>=X.Y.Z[-预发布]` 一种形式，`^` / `~` / 光秃秃的版本号一律被判成「无法验证」；而 `^` 本身也不包含**下限版本自身的预发布**，`0.1.2-rc.1` 这种已实测可用的宿主会被判成不兼容，市场的更新路径对确认不兼容是**直接拒绝安装**（需 `force` 绕过）；`^0.1.5` 更会连 `0.1.5-rc.2` 一起误杀。DSH 长期以 `-rc.N` 发布，档位必须显式带上 RC 下限。
  - 为什么不写上上限 `<0.2.0`：解析器只支持单个 `>=` 比较符，两段式范围（`>=0.1.2-rc.1 <0.2.0`）整体会被读成「无法验证」，而按该模块的契约，已声明却无法验证是 fail-closed——更新会被直接拦下，比不声明更糟。跨到 0.2 线时人工重新复验，再决定是否放宽下限。
- **codegraph CLI**：版本矩阵——`1.5.0`（macOS）与 `1.6.0`（Windows / macOS）实测过全链路；用到的子命令是 `status` / `query` / `callers` / `callees` / `impact` / `node` / `sync` / `index`，旗标逐个核对过。`codegraph serve --mcp` 仍可用（顶层 help 不列，`codegraph serve --help` 在），托管行无需改动。升级 CLI 后请重验：`-y` 这类旗标恰好是版本相关的（本插件刻意不带它，见下）。
- **浏览器半体的 URL 形态**：当前 DSH 走 client-modules 的 combo 路由，单包直链 `/plugins/@hyzyn/dsh-codegraph/client.js` 已不再直接可用；浏览器只用 boot graph（`window.__DSH_BOOT__`）下发的 `/plugins/??<id>/client.js&rev=…`，插件侧无需改动。
- **操作系统**：Windows / macOS / Linux 都按同一份代码走，CI 已是三平台矩阵（`pnpm -r build` + `typecheck` + `test`）。
  - **Windows**：CLI 走 `%COMSPEC% /d /s /c` + cmd 转义（npm / pnpm 全局安装只给 `.cmd` shim，`execFile` 直连会 `ENOENT`）；超时用 `taskkill /pid <pid> /T /F` **连 shim 里的孙进程一起收**（只杀 cmd.exe 的话大仓库 `index` 会继续跑完）；补丁文件重写沿用原文件行尾（CRLF 文件不会被写成混合行尾，重写也不改变行数）。
  - **`index` 不会替你初始化**：`codegraph index --help` 写着「same result as a fresh init」，但那说的是**全量重建的结果**等同于刚 init 完，不是「index 会初始化」。对没有 `.codegraph/` 的目录，`index` / `sync` 都会直接报 `CodeGraph not initialized in <path>` + `Run "codegraph init" first`。故卡片的「初始化索引」按钮走的是 `init`。
    - 参数固定为 `init -- <path>`：**不带 `-y`**——那是 CLI 1.6.0 才有的旗标，1.5.0 会 `error: unknown option '-y'`；而不带也不会挂起（运行器无 TTY，1.5.0 / 1.6.0 实测都自己取默认值跑完）。**也不带 `-f`**（CLI 用它兜住「家目录 / 文件系统根」这类误伤，不该由插件替用户绕过）。
    - 这是本插件**唯一往用户项目里写东西**的动作：它只在 `.codegraph/` 下建 `codegraph.db` 与一个自忽略的 `.gitignore`（内容 `*` + `!.gitignore`），**不碰任何源文件、也不改项目根的 `.gitignore`**；`codegraph uninit` 可整体撤销。卡片上是两步确认，且**绝不会自动触发**。
    - `init` / `index` 会触发 codegraph CLI 自己的匿名用量统计（上游会在输出里提示；`codegraph telemetry off` 或 `CODEGRAPH_TELEMETRY=0` 可关）。插件不改这个开关——那是用户的偏好。
  - **PATH**：探测与调用都用插件配置的 `command`（默认 `codegraph`，走 PATH）。从 Dock / 开始菜单这类**不继承 shell 环境**的入口启动宿主时，PATH 里可能没有 CLI——此时两段 systemPrompt 不注入、卡片点不出可用命令。
    - **PATH 是在宿主进程启动时读取的**，所以「刷新页面 / 重开卡片」改不了它，宿主自己也不会变。两条修法：① 把 `command` 写成 CLI 的绝对路径（改 profile 补丁会触发热重载并重新探测）；② 从新开的终端重启宿主，让新的环境块生效。
    - 改完之后点卡片上的**重新探测**（`POST /reprobe`）即可就地确认，不必重启宿主。卡片会把探测失败的**实测原文**（`spawn codegraph ENOENT`、非零退出的 stderr、超时）显示出来，用来区分「没装 / 装错 / 命令不在 PATH」。
    - 中文（及其它非 UTF-8 代码页）Windows 上，CLI 与 cmd.exe 的 stderr 按控制台代码页输出；插件用 `@hyzyn/dsh-kit` 的容错解码器（UTF-8 优先，遇非法字节整体回落代码页）解，卡片上的报错是中文原文而不是 `���`。
  - **MCP 行**：`dsh-mcp-client` 用官方 SDK 的 `StdioClientTransport`（SDK 依赖 `cross-spawn`），Windows 上 `.cmd` shim 由它自己解析，托管行无需平台分支。
  - 上游 CLI 本身三平台 × x64/arm64 官方支持（自带 Node 运行时）；本插件侧的索引判定只看 `.codegraph/` 下的 `*.db`，不写死库文件名，上游改名也不受影响。

## 开发

```bash
pnpm --filter @hyzyn/dsh-codegraph build
pnpm --filter @hyzyn/dsh-codegraph typecheck
pnpm test                                   # 仓库级 vitest（也可 vitest run packages/codegraph）
pnpm --filter @hyzyn/dsh-codegraph test     # 只跑本包（托管行决策矩阵 + CLI 旋钮 + 路由回归）
node packages/codegraph/scripts/preview-card.mjs        # 渲染卡片预览 HTML 到 .preview/（--png 需在普通终端跑，Chrome 起不来于受限环境）
node scripts/verify-codegraph-indexforce.mjs --profile test --port 3086   # 真机端到端：indexForce 是否真的带 --force 起进程（需要本机装好 DSH）
```

浏览器半体的源码在 `client-src/index.js`；`build` 经 `scripts/build-client.mjs` 产出包根的 `client.js`——删掉 index.js 对 `client-src/pure.js` 的 import、把 pure.js（纯逻辑，可在 vitest 里直接测，见 `test/client-pure.test.ts`）剥掉 `export` 后内联进 factory，产物仍是单文件无 import。CI 的 artifact-diff 以逐字节一致为闸，改源码后忘了重新 build 会直接红。

升级本机 DSH 之后，先重链再 typecheck——否则 `packages/*/node_modules/@deepseek-ai/*` 还是仓库
`.pnpm` 里那份旧副本，插件与宿主各持一份不同版本的库，兼容性问题会被掩盖：

```bash
node scripts/link-dsh-runtime.mjs     # 把 packages/* 的 @deepseek-ai/* 与 @hyzyn/dsh-kit 链到 dsh 运行时 / 本仓库 workspace
```

规划与缺陷记录（都不随包分发，只在仓库里，因此用绝对链接）：

- [ROADMAP.md](https://github.com/hyzyn/dsh-plugin-kit/blob/main/packages/codegraph/ROADMAP.md)：增强路线图——P0–P3 分档、代价、架构项（per-agent 挂载 / 采纳率仪表 / 诊断包）与开工顺序。
- [DEFECTS.md](https://github.com/hyzyn/dsh-plugin-kit/blob/main/packages/codegraph/DEFECTS.md)：缺陷审计与修复记录——`CG01`–`CG38`、验收记录与原始待办清单。
- [ADOPTION-AUDIT.md](https://github.com/hyzyn/dsh-plugin-kit/blob/main/packages/codegraph/ADOPTION-AUDIT.md)：采纳率实测——从 177 个真实历史会话算出的数字、两个口径的取舍、以及对路线图的影响。

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
  /**
   * 托管行 cwd 是否跟随活动会话。默认开；「设为默认项目」会把它关掉（那是一次显式指定）。
   */
  followSession?: boolean
  /** 查询类命令（status/query/callers/callees/impact/node）超时毫秒数，默认 60000；0 = 不限时。 */
  cliTimeoutMs?: number
  /** 索引类命令（sync/index）超时毫秒数，默认 600000；0 = 不限时。大仓库全量重建会超过查询档。 */
  indexTimeoutMs?: number
  /** 给 `codegraph index` 追加 `--force`（CLI 拒绝索引家目录/文件系统根时会用到）。默认关。 */
  indexForce?: boolean
  /**
   * 检测到索引过期时**自动重建**（`session/event` 首次 `user/message` 时检查，每项目每次
   * 宿主运行最多一次）。默认关——重建在大仓库上是分钟级操作。语义是重建而不是同步：
   * 实测 `codegraph sync` 对「提取器版本落后」会返回 `Already up to date` 且不清除信号。
   */
  autoReindex?: boolean
}
```

settings 命名空间 `codegraph` 里保存过的 `defaultPath` / `mcpIntegration` / `followSession` / `announceToAgent` / `usageGuidance` 优先于插件配置：「设为默认项目」写 `defaultPath` 并把 `followSession` 关掉，三个复选框写其余三个（`POST /api/dsh-codegraph/settings`）。

`command` / `cliTimeoutMs` / `indexTimeoutMs` / `indexForce` 是**安装级旋钮**，只读插件配置、不进 settings 命名空间。在 profile 的补丁里按 id 覆盖即可，例如：

```yaml
- id: codegraph
  config:
    indexTimeoutMs: 1800000
    indexForce: true
```

超时命中时卡片上的报错会直接点名对应配置项（`cliTimeoutMs` / `indexTimeoutMs`），不必去翻日志。

## 系统提示词

安装后自动向 systemPrompt 注入两段提示（合计最多约 310 token；usage 段只在生效路径已索引时出现）：

- `plugin:dsh-codegraph`（order 150）：插件能力公告（中文，约 130 字），只说「有这张卡片、能引导用户去开」；卡片内部有哪些按钮是 UI 细节，不占模型上下文。
- `plugin:dsh-codegraph:usage`（order 151）：CodeGraph 使用指引（CODEGRAPH_START 区块）。这块对应上游 `CODEGRAPH_INSTRUCTIONS_BLOCK` 的定位（上游把它定义为「给子 agent / 非 MCP harness 的短块」，长 playbook 走 MCP `initialize` 的 `instructions`）——**但 DSH 的 MCP 客户端不读 `instructions`**，上游那份「无根索引 → 按项目传 `projectPath`」的变体模型收不到，所以这块补的就是它，外加三条：**shell 兜底**（命令名按 `command` 配置渲染，不写死 `codegraph`，并给出 `--path`）、**`projectPath` 按项目查询**、**没索引就跳过且不要 `codegraph init`**。触发条件与宿主 `indexState` 同口径：`.codegraph/` 里要有索引库，只看目录存在会把家目录里 CLI 自己的 `~/.codegraph` 安装目录误判成已索引项目（上游原话就是后者，这块刻意收紧）。

两段都受两道门禁，usage 段另有第三道：

1. **CLI 探测**：挂载时跑一次 `<command> --version`，失败就整段不注入（并 `console.warn`，带上失败原文）——不向模型宣告跑不起来的能力。探测结果不是锁死的：卡片「重新探测」或 `POST /reprobe` 会重跑一次并即时刷新这两段 section（CLI 后装好、或 `command` 改成绝对路径之后不必重启宿主）。
2. **开关**：卡片上的两个复选框写 settings 命名空间（`POST /api/dsh-codegraph/settings`），改完即时增删 section；也可以用安装级配置关掉（`announceToAgent: false` / `usageGuidance: false`）。
3. **索引门禁（仅 usage 段）**：生效路径（`effectivePath`，即托管行实际用的那个目录）必须是**有效索引**才注入用法指引——判据与宿主 `indexState` 同口径，只是 `.codegraph/` 目录存在不算。所以在没有索引的仓库里不会白白占掉约 300 token 的用法指引（那段话本身讲的正是「本仓库有索引时该怎么做」），也不会诱导模型去调必然失败的工具。判据每次 `refreshGuidance` 现算，因此跟随会话切换、「设为默认项目」、`init` 成功、项目被 `uninit` 都会立刻反映到注入与否上。**公告段（order 150）不设这道门禁**：它讲的是「有这张卡片」，与索引无关。
