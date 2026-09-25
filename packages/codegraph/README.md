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
- **可选的 per-agent MCP 隔离**（`mcpScope: 'per-agent'`，默认 `'managed'`）：默认模式下**一台** MCP 服务器按时分复用服务所有项目（靠 `projectPath` 与跟随会话）。开启 per-agent 后，每个 agent 在**自己的 Cordis scope** 里挂一份独立的 `dsh-mcp-client`，`cwd` 固定为它自己会话目录解析出的索引根——多项目并行时不再共享一个全局 cwd，也不再需要「写盘 → 热加载 → 重建连接」那条链；全局托管行会被**挂起**（`disabled: true`，切回 managed 自动恢复）。代价是每个 agent 一个子进程（实测空 Node 基线约 40MB）。**会话目录没有可用索引时该 agent 不挂**（而不是回落到默认项目）——否则它会拿到别的项目的上下文，这正是「宣称避免、实现却没做到」的那类错误。机制实测与取舍见 [P0-PLAN.md](./P0-PLAN.md)。
- **一键初始化**：未初始化的目录在卡片上直接点「初始化索引」跑 `codegraph init`（两步确认）——`index` / `sync` 都要求项目先 init 过，此前这是唯一还要把用户赶回终端的一步。
- **systemPrompt 分两段，开关与门禁各自独立**：`plugin:dsh-codegraph`（order 150）与 `plugin:dsh-codegraph:usage`（order 151）；两段均以 `<command> --version` 探测为前置，`announceToAgent` / `usageGuidance` 写 settings 命名空间后即时增删 section。

![Codegraph 控制台：目标项目、8 格索引状态（组头刷新）、索引维护按动作性质分层、搜索与查询（含结果区页签）、Agent 集成](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-codegraph.png)

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

## CLI 面

卡片此前只覆盖 `status`/`query`/`callers`/`callees`/`impact`/`node`/`sync`/`index`/`init`，其余子命令只能去终端。现在补齐了**旗舰与常用**的那几个：

- **`explore`**：与 MCP 的 `codegraph_explore` 同输出（相关符号源码 + 调用路径）。模型那条路走 MCP，人在卡片上此前够不着同一个能力——这有点荒谬，现在补上了。
- **`context`**：为一个**任务**组装上下文（与 explore 面向「区域」的区别）。
- **`files`**：索引里的文件结构（语言 / 符号数 / 大小）。
- **`affected`**：由改动文件反向查出**受影响的测试**（实测本仓库：改 `src/index.ts` → 5 个测试文件）。这条对「我改了这里，该跑哪些测试」特别实用。**插件刻意不替你猜改动列表**（不读 `git status`、不猜编辑器状态）：待测文件从哪来是上游流程的事，卡片只负责把你给的列表交给 CLI。
- **`uninit`**：删除 `.codegraph/`——与 `init` 反向，是本卡片第二个破坏性动作，同样两步确认。实测**必须带 `-f`**：不带时 CLI 问 `Continue? (y/N)`，而运行器没有 TTY、读到 EOF 就中止且不删除（安全但无效），所以确认由卡片负责。
- **`telemetry`**：只读转达上游匿名用量统计的状态。**刻意不给开关**——那是用户的全局偏好（`~/.codegraph/telemetry.json`，由 CLI 自己的 `telemetry on|off` 管），插件替他翻等于越权改别人的全局设置。
- **查询参数面板**：`query -k/--kind`（类型过滤）、`callers|callees -l/--limit`（CLI 默认 20，会把大符号截断而卡片此前无从知道）。

`kind` 用**自由文本**而不是下拉枚举：上游加新 kind 时插件不必跟着改，填错 CLI 自己回空结果。

## 项目列表（一键切换）

一台 codegraph MCP 服务器同一时刻只挂一个项目，所以「换项目」是高频动作，而卡片此前只能手敲绝对路径。`GET /projects` + 卡片上一排胶囊按钮解决它。

候选**只用界内的数据源**：宿主 `sessions.list()` 的活跃会话 `header.cwd`，以及插件自己观察到的路径（`/follow` 上报、查过 `/status` 的目录、当前默认项目）。**刻意不读 `~/.dsh/sessions/`**——那里确实有历史项目路径，但那是 DSH 的内部存储格式（会话桶名是路径编码、日志是多帧 zstd），插件解析它会在 DSH 改格式时静默失效；实测按桶名解码 51 个目录，**一个都没解对**。宁可比用户记忆少几个项目，也不要一个「有时准有时不准」的列表。

每个候选现算 `locateIndex`：只有**真索引**才可作为切换目标；未索引的也列出但**禁用**（用户会想知道「这个项目还没索引」），点击无效。列表按「最近见过」排序，容量 50 条、淘汰最久未见者。切换复用「设为默认项目」那条链路（持久化 `defaultPath` → 关闭跟随 → 热切换 MCP）。

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
| `/api/dsh-codegraph/settings` | POST | 写开关 `{ announceToAgent?, usageGuidance?, mcpIntegration?, followSession? }`（布尔）与 `{ mcpScope? }`（`'managed'` / `'per-agent'`，非法值 400），即时生效 |
| `/api/dsh-codegraph/default-path` | POST | 设为默认项目 `{ path }`（需 `.codegraph/` 里有索引库），同步热切换 MCP |
| `/api/dsh-codegraph/reprobe` | POST | 重跑一次 `<command> --version` 探测，回 `{ cliAvailable, cliProbeError, cliProbeAt }` 并同步 systemPrompt 门禁 |
| `/api/dsh-codegraph/files` | GET | 文件结构 `{ path, files, raw }`（`codegraph files --json`）；旋钮 `filter` / `pattern` / `maxDepth` |
| `/api/dsh-codegraph/affected` | GET | 受影响测试 `{ path, affected, raw }`（`codegraph affected --json -- <files…>`）；`files` 可重复传 |
| `/api/dsh-codegraph/explore` | GET | 探索 `{ path, query, output }`（`codegraph explore`，与 MCP 的 `codegraph_explore` 同输出，markdown）；旋钮 `maxFiles` |
| `/api/dsh-codegraph/context` | GET | 任务上下文 `{ path, task, output }`（`codegraph context`，markdown）；旋钮 `maxNodes` |
| `/api/dsh-codegraph/uninit` | POST | **删除 `.codegraph/`** `{ path }`（`codegraph uninit -f`）；未索引目录回 409；撤销的是索引所在的**根** |
| `/api/dsh-codegraph/telemetry` | GET | 只读转达上游匿名用量统计状态 `{ enabled, output }` |
| `/api/dsh-codegraph/projects` | GET | 已见项目列表 `{ projects, indexedCount, effectivePath }`——候选来自活跃会话与插件观察到的 cwd（`/follow` 上报、查过 status 的路径、默认项目），每条现算索引态；monorepo 子目录归并到索引根 |
| `/api/dsh-codegraph/agents` | GET | per-agent MCP 挂载台账 `{ mode, requested, effective, reason, fallback, mounted, live, agents }`——每个 agent 挂没挂上、挂在哪个索引根、没挂的原因（只读） |
| `/api/dsh-codegraph/unlock` | POST | 清挡住索引的陈旧锁 `{ path }`（`codegraph unlock`，幂等：没锁时 exit 0） |
| `/api/dsh-codegraph/cancel` | POST | 取消进行中的 CLI 调用 `{ path? }`（合法 JSON body：`{}` = 全部；畸形 body 回 400，不会升级成「取消全部」）；关标签页的断连也会自动中止对应调用 |
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

- **POST 路由对畸形 / 超限 / 非对象的 body 一律 400**——不会把「请求体没读出来」当成「没指定路径」而在默认项目上执行写操作。`/cancel` 也在这道门禁内：`{}`（合法 JSON、未指定 path）才是「取消全部」，畸形 body 不会顺带把别的项目正在跑的索引杀掉。
- **路径必须真实存在且是目录**：`status` / `query` / `callers` / `callees` / `impact` / `node` 对不存在的路径回 400（CLI 对不存在的路径会 exit 0 + 空结果，静默得像「没有匹配」）；`--limit` / `--depth` 只收正整数（`limit` 上限 10000，`depth` 的上限由 CLI 自己钳到 10）。
- **祖先口径**：`/default-path` 的 POST 在 monorepo 子目录上会绑定**索引所在的仓库根**；对子目录调 `/init` 回 409（祖先已有索引，避免建出嵌套索引）；`/follow` 拒绝不存在目录的路径上报。

## 兼容性（DSH / codegraph CLI）

- **DSH**：宿主版本矩阵（每一档都注明**验证方式**，别把回归测试说成兼容性声明）：
  - **`0.1.7-rc.1`（上一轮适配基线，2026-09-23 实测）**：`node scripts/verify-codegraph-host-contract.mjs --profile test --port 3087 --dsh-bin <独立安装的 rc.1 dsh> --runtime-store <该安装的 .pnpm/node_modules/@deepseek-ai>` **42/42 通过**——25 条路由全在（含 `/projects`、`/metrics`、`/diagnose`、`/unlock`、`/files`、`/affected`、`/explore`、`/context`、`/uninit`、`/telemetry`、`/agents`）、POST 门禁与 loopback 门禁成立、`/diagnose` 输出分段完整、浏览器半体产物可供给且含最新 UI、MCP 托管行按真索引写入 home 补丁、`mcpScope` 开关「切 per-agent → 全局行被挂起 → 切回 managed 恢复」全程可逆且真实 `~/.dsh/cordis.patch.yml` 逐字节未变。**新增的两项**专门验 0.1.7 的 settings 迁移：启动后经插件自己的写路径把 `mcpScope` 切回 managed 基线、并把默认项目切到临时项目，两项都要求 HTTP 200（旧 API 下这两步只会 500）。
    - 验证方式说明：本机全局 dsh 若不是 rc.1，可用 `--dsh-bin` 指向一份独立安装的 rc.1，并用 `--runtime-store` 把**复制出来**的临时 profile 的 `node_modules/@deepseek-ai/*` 重指到该安装的运行时——否则那些链接仍指向全局旧安装，新 cohort 的兼容性 preflight 会把整套旧运行时行判成 incompatible 而全部禁用（宿主根本起不来，与本插件无关）。
    - 另一条已跑过的真机证据：隔离 `DSH_HOME` 启动 test profile（同样做运行时重指）→ 10 个插件全部 mounted、0 行 `disabling profile plugin row`，`POST /api/dsh-codegraph/settings` 在 `per-agent` / `managed` 之间往返都是 200。
  - **`0.1.7-rc.2`（当前适配基线，2026-09-25 实测）**：cohort 从 rc.1 提到 rc.2，`peerDependencies` 与 `dsh.engines.dsh` 的下限同步提升。`node scripts/verify-codegraph-host-contract.mjs --profile test --port 3087`（本机全局就是 rc.2，无需 `--dsh-bin` / `--runtime-store`）**42/42 通过**——25 条路由、POST / loopback 门禁、`/diagnose` 分段、浏览器半体可供给、MCP 托管行写入隔离 home 补丁、`mcpScope` 在 `per-agent` / `managed` 间往返可逆且真实 `~/.dsh/cordis.patch.yml` 逐字节未变。另两项：真宿主加载 test profile 时 **10 个插件全部 mounted、0 行 `disabling profile plugin row`**；工作区 `pnpm -r typecheck` 全绿、`vitest` **960/960**、`pnpm -r build` 绿。本轮未改任何插件运行行为（只有兼容性声明、文档与 lockfile）。rc.1 → rc.2 的 lib 产物逐文件比对：`dsh-tools` 仅新增可选 `PreToolDecision.displayReason`（本仓不构造该决策）、`dsh-session-query` 仅 JSDoc、`dsh-client-ui-theme` 仅设计 token 增补，`dsh-mcp-client` / `dsh-host-webserver` / `dsh-subprocess-local` / `dsh-credentials` / `dsh-base` / `dsh-settings` / `dsh-web-app` / `dsh-headless` 逐字节相同；`dsh-app-boot` 删除了 `skippedProfileBundles` 并改了 `generateConfigSchema` 签名（去掉首参 `binName`），但那是 DSH 自己的 CLI 与 app-boot 之间的内部面，本仓无任何引用。
  - **`0.1.6-alpha.2` / `0.1.5-rc.2` / `0.1.0-rc.7`（历史基线，已不支持）**：这些档位的 `settings` 服务还是旧的 `register(ns, schema)` API，而 0.1.7 线已把它换成 `SettingsForms`（`describe/update` + 导出 volatile Config）；本包的 `peerDependencies` 下限 `^0.1.7-rc.2` 也会让新宿主在安装前/启动时拒绝加载到旧宿主上。旧档位当时的证据（`0.1.6-alpha.2` 40/40、`0.1.5-rc.2` 无脚本、`0.1.0-rc.7` 审计基线）保留在 git 历史里，仅作参考。
  - `package.json` 声明 `peerDependencies: { "@deepseek-ai/dsh": "^0.1.7-rc.2" }`（并在 `peerDependenciesMeta` 标 `optional`，只压 pnpm 的 unmet-peer 噪音）。DSH 0.1.7-rc.1 起**安装前**与**启动时**都据此判定兼容性：不兼容时安装抛 `incompatible-version`、启动时该行整行 `disabled`。同时保留 `dsh.engines.dsh: ">=0.1.7-rc.2"` 作为**市场展示位**（宿主不读它，见下条），两条下限由 `scripts/check-dsh-peers.mjs` 校验一致。
  - **为什么是 peer 而不是 `engines.dsh`**：`dsh-app-boot` 只遍历 `peerDependencies` 里名为 `@deepseek-ai/dsh` 或以 `@deepseek-ai/dsh-` 开头的项，用 `semver.satisfies(runtime, range, { includePrerelease: true })` 判定（**预发布参与范围匹配**）。**但 `engines.dsh` 仍然声明**——宿主不读它，插件市场 / 社区条目却按它展示兼容性，所以保留为标准形式 `>=0.1.7-rc.2`（市场解析器只认 `>=X.Y.Z[-预发布]`），且与 peer 下限一致。证据：`dsh-app-boot/lib/index.js` 的 `evaluatePluginCompatibility`，以及 app-boot README 原文「这些检查使用 peer 声明，而不是 `engines.dsh`」。
  - **为什么范围是 `^0.1.7-rc.2`**：预发布参与匹配，`^0.1.7-rc.2` = `>=0.1.7-rc.2 <0.2.0`，因此 `0.1.7` 正式版与后续 `0.1.7-rc.N` / `0.1.8` 都通过，而 `0.1.7-rc.1`、`0.1.7-alpha.2`、`0.1.6-*` 不通过——与「只适配 0.1.7-rc.2 及以后」的策略一致。要临时放行别的版本组合，把豁免写进 profile 自己的 `compatibility.json`（`dsh plugin --profile <p> allow-version <pkg@ver> --dsh-version <ver> --accept-risk`），而不是放宽这里的范围。
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
                                                        # 另有 --per-agent / --fallback：离线看 per-agent 的「生效中」与「已退回 managed」两态
node scripts/verify-codegraph-indexforce.mjs --profile test --port 3086   # 真机端到端：indexForce 是否真的带 --force 起进程（需要本机装好 DSH）
node scripts/verify-codegraph-host-contract.mjs --profile test --port 3087  # 真机端到端：宿主契约 42/42（25 路由 + 门禁 + 供给产物 + 托管行 + per-agent 模式开关 + settings 写路径）；需要本机装好 DSH
#   全局 dsh 不是 rc.1 时，加 --dsh-bin <独立安装的 rc.1 dsh> --runtime-store <该安装的 .pnpm/node_modules/@deepseek-ai>
#   —— 后者把复制出来的临时 profile 的运行时链接重指到该 cohort，否则会因兼容性 preflight 禁用整套旧运行时而起不来。
                                                                          # 注：DSH 要写 ~/.dsh/profiles/<profile>/cordis.yml，沙箱只读时会被 EPERM 拦住
```

### per-agent 的三层验收

三层各测一件事，**缺一层就有一个真问题测不到**——这不是凑数，是补缺口：

| 脚本 | 层次 | 测什么 |
| --- | --- | --- |
| `verify-codegraph-agent-scope.mjs` | 机制 | 最小 Cordis 根：scope 能挂 mcp-client、同名跨 scope 不冲突、全局层干净、释放只回收自己 |
| `verify-codegraph-host-contract.mjs` | 路由/开关 | 起真宿主：25 条路由、`mcpScope` 切换、全局托管行挂起/恢复、真实补丁逐字节未变 |
| `verify-codegraph-agent-integration.mjs` | **集成** | 挂**真插件**，用真 `AgentRegistry` 驱动一次真 `agent/created` → 断言工具落到**那个 agent**、无索引的 agent 不挂、`agent/disposed` 回收 |

第三层是补出来的：前两层全绿也**证明不了**「用户开会话时 MCP 真的挂上了」——机制脚本用假 agent，
宿主脚本那个宿主里**没有 agent 被创建**（每轮 `/agents` 都是 `mounted=0`）。而 per-agent 的全部价值就在那条路径上。

三个脚本都自造临时项目、自收子进程，并断言真实 `~/.dsh/cordis.patch.yml` 逐字节未变；后两个还给被测对象
隔离 `DSH_HOME`（前一版的教训：不隔离时插件当场去写用户真实配置，CG45）。

浏览器半体的源码在 `client-src/index.js`；`build` 经 `scripts/build-client.mjs` 产出包根的 `client.js`——删掉 index.js 对 `client-src/pure.js` 的 import、把 pure.js（纯逻辑，可在 vitest 里直接测，见 `test/client-pure.test.ts`）剥掉 `export` 后内联进 factory，产物仍是单文件无 import。CI 的 artifact-diff 以逐字节一致为闸，改源码后忘了重新 build 会直接红。

升级本机 DSH 之后，先重链再 typecheck——否则 `packages/*/node_modules/@deepseek-ai/*` 还是仓库
`.pnpm` 里那份旧副本，插件与宿主各持一份不同版本的库，兼容性问题会被掩盖：

```bash
node scripts/link-dsh-runtime.mjs     # 把 packages/* 的 @deepseek-ai/* 与 @hyzyn/dsh-kit 链到 dsh 运行时 / 本仓库 workspace
```

规划与缺陷记录（都不随包分发，只在仓库里，因此用绝对链接）：

- [ROADMAP.md](https://github.com/hyzyn/dsh-plugin-kit/blob/main/packages/codegraph/ROADMAP.md)：增强路线图——P0–P3 分档、代价、架构项（per-agent 挂载 / 采纳率仪表 / 诊断包）与开工顺序。
- [DEFECTS.md](https://github.com/hyzyn/dsh-plugin-kit/blob/main/packages/codegraph/DEFECTS.md)：缺陷编号字典——`CG01`–`CG63` 的索引（症状 + 修复/设计意图）；逐条原文、验收记录与原始待办冻结在 git 历史里（见其 §4）。
- [ROADMAP.md](https://github.com/hyzyn/dsh-plugin-kit/blob/main/packages/codegraph/ROADMAP.md)：前瞻规划与尚未开工的待办。
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
   * `mcpScope: 'per-agent'` 生效时本项无意义（每个 agent 直连自己的进程，没有「跟谁走」）。
   */
  followSession?: boolean
  /**
   * MCP 挂载模式，默认 `'managed'`。
   * - `'managed'`：一行托管 + 按会话热切换（时分复用，一台服务器服务所有项目）。
   * - `'per-agent'`：每个 agent 在自己的 scope 里挂一份 dsh-mcp-client，cwd = 它会话的索引根。
   *
   * 默认保持 managed：这是行为变更，且按实测只覆盖「多项目并发」这一窄场景（时间占比 3.1%）。
   * 前提不成立时会退回 managed 并在卡片上说明原因（宿主没有 agent 事件面 / 存在区块外手工
   * codegraph 行 / MCP 总开关关闭），不会静默退回。代价：每个 agent 一个子进程（约 40MB）。
   */
  mcpScope?: 'managed' | 'per-agent'
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

settings 命名空间 `codegraph` 里保存过的 `defaultPath` / `mcpIntegration` / `followSession` / `mcpScope` / `announceToAgent` / `usageGuidance` 优先于插件配置：「设为默认项目」写 `defaultPath` 并把 `followSession` 关掉，其余复选框与模式开关写其余项（`POST /api/dsh-codegraph/settings`）。

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
