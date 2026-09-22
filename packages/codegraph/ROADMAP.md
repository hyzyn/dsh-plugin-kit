# @hyzyn/dsh-codegraph 增强路线图

> 2026-09-22，基于 0.4.2 工作树的一次静态复核 + 本机实跑 + 与 per-agent 隔离模型
> （`dsh-simple-codegraph`：每个 Agent 各自一个 scope 内挂 `dsh-mcp-client`）的对照分析产出。
>
> 本文只放**前瞻规划**；缺陷仍按 `CGxx` 编号记在 [DEFECTS.md](./DEFECTS.md)。本文每一项在
> 动手前先转成可验收条目（做完回填「落点 + 门槛」），不要只停留在规划里。
>
> 已被排除的候选：**跨包 `dshHome()` 归一**（CG35）在 0.4.2 已修完——`packages/*` 全部改走
> `@hyzyn/dsh-kit`，走 `node scripts/check-dsh-home.mjs` 实测通过（「DSH_HOME 推导只存在于
> @hyzyn/dsh-kit」），不要再当作待办开工。

## 基线（本次实测）

| 项 | 结果 |
| --- | --- |
| 包版本 | 0.4.2；registry `dist-tags.latest` = **0.4.2**（2026-09-19 发布）——DEFECTS.md「验收记录」一节里「0.4.2 仅存在于工作树」那句已过期 |
| `npx vitest run packages/codegraph` | **202 passed / 10 files** |
| `npx vitest run`（全仓） | **779 passed / 48 files** |
| `npx tsc --noEmit -p packages/codegraph/tsconfig.json` | 干净 |
| 本包可用的运行时依赖 | `packages/codegraph/node_modules/@deepseek-ai/` 目前只有 `cordis` + `schemastery`（其余靠 `scripts/link-dsh-runtime.mjs` 链接） |
| 宿主事件面（本机 DSH 实测存在） | `agent/created`、`agent/disposed`、`agent/inbox/inserted`、`tool/call`、`tool/result`、`system-prompt/assemble` |

## 判断

这个插件**不缺功能**，缺的是三层上的东西：

1. **上限在架构**：一台 MCP 服务器同一时刻只挂一个项目，多项目是**时分复用**；`followSession`
   每次会话切换都要重写 `~/.dsh/cordis.patch.yml` 并触发 `watchUserPatches` 重建连接。
2. **体验在测量**：插件**不知道**模型有没有真的用上 CodeGraph —— 它 `inject: []`，一个工具/事件面
   都没接，「采纳率」目前只能靠感觉，也就无从判断提示词该收紧还是放松。
3. **成熟度在环境健壮性**：坏锁、常驻 daemon、PATH / HOME / 控制台编码——这类故障占了实际问题的
   绝大多数，而卡片对它们几乎没有入口。

功能面（CLI 子命令覆盖率）反而是最不缺的，且维护者已在 [DEFECTS.md](./DEFECTS.md) 的
「待办 / 路线图」一节列全；本文不重复那些条目，只做分档、补架构项与开工顺序。

## 优先级总表

代价口径：**S** < 半天｜**M** 1–2 天｜**L** > 3 天。

| 级别 | 事项 | 影响 | 代价 | 落点 |
| --- | --- | --- | --- | --- |
| **P0** | ~~agent 侧改 **per-agent scoped MCP 挂载**~~ **✅ 已实现**（默认 `managed`，`mcpScope: 'per-agent'` 显式开启；托管行保留为回落） | 多项目真并行；删掉写盘 + 热加载 + 竞态整条链；跟随不再依赖 GUI 页面 | M–L | `src/scope.ts`（新）+ `apply()` 接线 + `/agents` + 卡片开关；见 [P0-PLAN.md](./P0-PLAN.md) |
| **P1** | ~~**注入加索引门禁**~~ **✅ 已完成**（见下） | 无索引仓库里省掉约 310 token/轮，也不再诱导模型调必然失败的工具 | S | `refreshGuidance()` + 5 条门禁用例 |
| **P1** | ~~**一键诊断包**~~ **✅ 已完成**（见下） | 环境性故障的排查路径固化成一个按钮 | S | `GET /diagnose` + 卡片按钮 + 6 条用例 |
| **P1** | ~~**采纳率仪表**~~ **✅ 已完成**（见下） | 把「提示词有没有用」从感觉变成数字；有数据才谈得上调提示词或做预注入 | S–M | `createMetricsCollector()` + `/api/dsh-codegraph/metrics` + 卡片一行 |
| **P1** | ~~**索引生命周期**：`unlock` + 自动重建~~ **✅ 已完成**（见下；daemon 日志尾与陈旧 pid 判定随 `/diagnose` 已可见） | 把「模型拿到陈旧结果 / 被坏锁挡住」在发生前化解 | M | `unlockArgs()` / `staleReasonsFromStatus()` / `maybeAutoReindex()` + 卡片「解锁」按钮 |
| **P2** | ~~CLI 面补全~~ **✅ 已完成**（`explore`/`context`/`files`/`affected`/`uninit`/`unlock`/`telemetry` + 查询参数面板；`daemon` 仍缺） | 功能完整度 | M | `makeRoutes` + 卡片 |
| **P2** | ~~已索引项目列表 + 一键切换 / 查询参数面板 / 遥测提示~~ **✅ 已完成**；其余（卡片 i18n）未做 | 体验与工程面 | M | `/projects` + 卡片胶囊按钮 |
| **P3** | ~~CG32–CG34 销号~~ **✅ 已关闭**（无原文，改为门禁矩阵复核）、~~宿主版本基线对齐~~ **✅ 已完成**（CG42）、~~browser 半体纯逻辑抽测~~ **✅ 已完成**（P3-b） | 可信度与工程债 | S–M | `DEFECTS.md` / `README.md` / CI |

## 已完成（0.4.2 之后的工作树）

### P1-a：systemPrompt 注入加索引门禁 ✅

**问题**：README 早就写着「触发条件与宿主 `indexState` 同口径」，但实现只判了「CLI 探测可用 + settings 开关」——在没有 `.codegraph/` 的仓库里也照样注入约 300 token 的 usage 指引，而那段话本身讲的正是「本仓库有索引时该怎么做」。

**做法**：`refreshGuidance()` 里补第三道判据 `indexState(effectiveProjectPath(runtimeRef)) === 'indexed'`，只作用于 usage 段（order 151）；公告段（order 150）讲的是「有这张卡片」，与索引无关，不设这道门禁。判据与 `effectiveProjectPath` 同源，所以跟随会话切换、「设为默认项目」、`init` 成功、项目被 `uninit` 都会立刻反映到注入与否上。

**用例（5 条）**：已索引时两段都在；未索引目录只有公告段；`init` 之后同一实例内门禁立刻打开；跟随会话切进/切出已索引项目时 usage 段跟着增删；安装级开关仍能关掉任一段。

### P1-b：一键诊断包 ✅

**问题**：这个插件的故障几乎全是**环境性**的——PATH 里没有 CLI、`~/.codegraph` 被当成项目索引、托管行 cwd 被删、一次被强杀的 index 留下坏锁、daemon 登记的是另一个版本。这些原文散在四五个地方，而排查者最需要的恰恰是它们。

**做法**：`GET /api/dsh-codegraph/diagnose`（只认 GET + 回环）返回 `{ path, report }`，`report` 是一段可直接复制的纯文本，含：版本/平台、CLI 探测实测原文、超时与 `indexForce`、目标路径的索引状态与 `.codegraph/` 条目、生效/上报/默认路径与两个开关、托管行状态、**脱敏后**的补丁区块原文、`~/.codegraph` 的 daemon 登记（pid / root / version / 存活）与日志尾 40 行、最近一次 CLI 失败。卡片工具栏加「诊断包」按钮（独立忙态），结果用 `<details>` 展开 + 「复制」（Clipboard API 不可用时如实说明并让用户手抄）。另外把 `failCli` / `failIndex` 接上「最近一次失败」的记录。

**脱敏纪律**（真机跑过一轮才定型）：`cordis.patch.yml` 是所有 MCP 服务器共用的文件，别家的行里可能有 `headers` / `env` 凭据。所以**只摘 codegraph 相关的两个区块**，且**按键名**处理——`id` / `name` / `serverName` / `transport` / `command` / `args` / `cwd` / `disabled` 留值（这些正是排查要看的东西），其余键 `<redacted>`，`headers:` / `env:` 这类敏感键污染整棵子树（值抹掉、键名保留）。新增字段默认脱敏（fail-closed）。第一版写的「值一律替换」真机跑出来把 `serverName` 也糊了，等于没法排障——这也是为什么这条要有用例 + 变异验证。

**用例（6 条）**：段落齐全；探测失败带出原文；最近失败被记录；脱敏（含变异验证：拿掉脱敏必须红）；daemon 段落（假家目录 + 5 万行日志，钉住「只读尾部」与陈旧 pid 判定）；只认 GET + 回环。

**真机实测**（本机 `codegraph 1.6.0`）立即抓到一个真实形态：`~/.codegraph/daemon.pid` 记着 pid 76609 / version **1.5.0**，而该进程早已 ESRCH、`current -> versions/v1.6.0`——diagnose 会把这行原文摆出来。

## P0：agent 侧改 per-agent scoped MCP 挂载 ✅

一次性能解决五个问题，是唯一改到「上限」的项：

1. 现在多项目是**时分复用**，靠工具入参 `projectPath` 补；
2. `followSession` 的每次切换 = 重写补丁文件 → 热加载 → 重建 MCP 连接（`apply()` 内 settings 分支与回落分支里的 `syncMcpRowOnDisk()`），重且有时序；
3. 两台 `dsh web` / 两个 profile 并发写同一个文件时，CAS 只保证「不丢行」，**不保证语义**（最后写者赢 `cwd`）；
4. 跟随由**浏览器半体**上报（`/follow` 上报），宿主侧没有 GUI 页面时不生效；
5. 每个 agent 只该看到一个 `mcp__codegraph__codegraph_explore` —— per-agent 挂载天然满足；反之
   「多服务器行各挂一个项目」会把工具名炸成 `mcp__codegraph-a__explore`，破坏单工具约定，**不走那条路**。

**已实现**（2026-09-22，完整方案与实测见 [P0-PLAN.md](./P0-PLAN.md)）：`agent/created` 时在
**`agent.ctx`**（它本身就是一个 scope，`dsh-agent-loop:759-760`）里 `plugin(McpClient, { cwd })`，
`agent/disposed` 与插件卸载时 dispose；托管行**保留**为无 `agents` 场景的回落，两者互斥——
per-agent 生效时全局行被**挂起**（`disabled: true`，loader 会跳过它，切回 managed 自动恢复）。

**开工前的实测（10/10，`scripts/verify-codegraph-agent-scope.mjs`）推翻了方案里三处推断**：

- **不需要 `dsh-scope`**：`agent.ctx` 已经是 scope，新建依赖从 3 个缩到 **1 个**（只 `dsh-mcp-client`，optional peer）；
- **scope 键是 agent 对象身份，不是 `agent.ctx`**：传错会**静默**解析成空层（工具莫名消失、零报错）；
- **`failOnStartupError` 拦不住「项目没有索引」**：服务器照常启动、工具可见，失败推迟到调用时且
  `isError: false` ——所以「没有有效索引就不挂」这条门禁是**必要的**，不能指望它兜底。

**代价与风险**：

- 每 agent 一进程（实测空 Node 基线 ~40MB），内存**线性**增长；并发峰值 4 项目时约 +120MB。
  性能实测（延迟、冷启动、内存）见 P0-PLAN.md「四之二」；
- ~~`dsh.engines` 下限需重新标定~~：机制依赖 `dsh-tools` 的 `view(scope)` 分层与 `agent.ctx`
  的 scope 语义，本机 `0.1.6-alpha.2` 已验证；三平台仍只有 CI 矩阵（无真机）；
- 收益只覆盖「多项目并发」这一窄场景（**实测时间占比 3.1%**，峰值 4 个项目），因此
  **默认值保持 `managed`**，由用户显式开启——属口味问题而非明显对错。

**退一步的最小版本**（不动架构时至少做这三条）：写入去抖 / 合帧；`followSession` 加跨进程
owner 判定；会话目录无有效索引时不写盘（现有行为，保持）。

## P1：先测得准，再谈环境健壮

- ~~**采纳率仪表**~~ ✅ 见「已完成」。
- ~~**注入加索引门禁**~~ ✅ 见「已完成」。
- ~~**一键诊断包**~~ ✅ 见「已完成」。
- ~~**索引生命周期**~~ ✅ 见「已完成」。
- **单飞与缓存**：现在只有 `probeInFlight` 做了幂等；`status` / `query` 每次都要
  起子进程，卡片打开即拉（卡片首次渲染时请求 `/status`）。建议按 `(path, command)` 单飞 + 短 TTL 缓存，
  索引类命令全局并发 = 1。

### P1-c：采纳率仪表 ✅

**问题**：在此之前插件 `inject: []`，一个事件都不接——「提示词该收紧还是放松」「要不要做前置注入」全靠感觉。

**做法**：订阅宿主既有的 `session/event`（只数 `tool/call`，与 `dsh-agent-instructions` / `dsh-acp` 同一公开订阅面），按键归并成 `codegraph` / `file` / `other` 三桶，暴露 `GET /api/dsh-codegraph/metrics`，卡片显示一行「采纳率」，同一份数据也进诊断包。纯判定（`bucketToolCall` / `foldToolCall` / `summarizeAdoption` / `describeAdoption`）全在宿主半体导出，直接进 vitest。

**三个刻意的取舍**（都是「写错了不会报错、只会给出一个看起来正常的错数字」的地方）：

1. **`bash` 不计入分母**。模型用 bash 干的事大部分与代码探索无关（跑测试、装依赖、git），算进去会把采纳率系统性压低，得出「codegraph 没人用」的错误结论——这种错误最难发现。
2. **分母为 0 时 `rate` 是 `undefined`，不是 0**。「一次都没探索」与「探索了但全用 grep」是两回事，前者显示 0% 会把「还没用上」误报成「用了没用」。
3. **项目键 = 索引根**（`resolveIndexedRoot`），与托管行 cwd、注入门禁同一口径。同一个仓库的多个会话归并成一条，而不是散成一堆没有统计意义的小样本；未索引项目照记但文案标明「不代表提示词效果」。

**只在内存、宿主重启归零**：它是「现在要不要调提示词」的观测值，不是审计日志；落盘会把工具名 + 项目路径长期留在磁盘上。`since` 如实给出起点。

**② 拿真实历史量过一遍（同一轮做的，见 [ADOPTION-AUDIT.md](./ADOPTION-AUDIT.md)）**：不等「跑一天」，直接解码
`~/.dsh/sessions/**/session.v3.jsonl.zstd`（177 个会话 / 12.1 万条事件）算真实采纳率。结论与两个连带修复：

- **会话级 23%**（已索引项目的 118 个会话里 27 个用过）、**窄口径 28.8%**（45 次 codegraph vs 111 次发现类调用）；
- **宽口径 2.2% 是误导数字**：`read` 真实占 1956 次（grep 仅 100 次），而它多半是「打开已知要改的文件」，
  codegraph 替代的是「找东西」不是读已知路径 → 加 `discovery` 窄口径，两个口径同时报并标注主口径；
- **CG40**：分类器第一版把 `read_image`（248 次）/ `read_pdf` / `web_search`（19 次）算成代码探索，
  单这一个错误灌了 11% 分母；
- **采纳率必须按「是否已索引」分组**：未索引项目里模型本就不该用它（59 个会话只有 2 个用过），
  混进来毫无意义 → `/metrics` 新增 `grouped.indexed` / `grouped.unindexed`；
- **对 P0 的影响**：同机 50 个项目目录 / 177 个会话，绝大多数会话是「一次一个项目」——per-agent 挂载的
  收益（多项目并行 + 去掉写盘链）仍成立，但**它不会提高采纳率**，别指望它解决这块。

**用例（17 条）**：归类（MCP 命名空间 / 各类文件工具命名 / bash 等不入分母 / 畸形输入不抛错 / 两边都沾时偏向 codegraph）；折叠与汇总（不修改入参、按项目分流、分母为 0 的 `rate` 语义、百分比与 `indexed` 标志）；事件接线（非 `tool/call`、缺 name、null / 字符串 / 缺事件对象一律不计数；子目录会话归并到仓库根、未索引项目单独一行、`bash` 不入分母、只认 GET + 回环）；诊断包里的采纳率小节；以及用**真 cordis Context** 跑一遍 `apply` 的形状检查。

**宿主契约核对**（读运行时源码，不是猜）：`dsh-session/lib/index.js:1262` 的 `callbackArgs = [this, event]`——第一个参数是 Session 实例；`this.header` 是公开实例字段（`dsh-session/lib/index.js:1139`），`header.cwd` 可取。消费方形状与 `dsh-acp/lib/index.js:1102`、`dsh-agent-instructions/lib/index.js:1263` 一致。

### P1-d：索引生命周期（解锁 + 自动重建）✅

**问题**：`status` 早就在报过期信号（`reindexRecommended` / 提取器版本落后），卡片**只做了警告**：用户看到「⚠ 索引可能过期」，但要做的事得自己去终端。坏锁同理——一次被强杀的 index 留下的 `codegraph.lock` 会挡住后续**所有**索引操作，而卡片没有任何入口。

**实测先把机制问清楚**（这一步决定了实现方向，不是可选的）：

- `codegraph sync` 对「提取器版本落后」这类过期返回 **`Already up to date` 且不清除信号**（本机 1.6.0 实测，改元数据前后 `lastIndexed` 都不变）——**过期只能靠 `index` 重建修**。若照直觉把自动重建实现成「自动 sync」，它会变成一个每次都跑、每次都不改变任何东西的空转循环。
- `codegraph unlock` 幂等：没锁时 exit 0 + `No stale lock files found`；有锁时删除 `codegraph.lock`。
- 真的把本项目索引重建了一遍（241 文件 / 2.2 秒），确认重建后 `builtWithVersion` 1.1.1 → 1.6.0、`reindexRecommended` → false。

**做法**：
- `POST /api/dsh-codegraph/unlock` + 卡片「解锁」按钮（不需要二次确认：CLI 侧幂等）。
- `staleReasonsFromStatus()`：**宿主侧**的过期判定（卡片侧那份只负责显示，自动重建要在宿主里决策，两处同口径，测试钉住）。
- `maybeAutoReindex()`：订阅 `session/event` 的 `user/message`（不是定时器——只在真有人在这个项目里干活时才查），发现过期则跑 `index`（**不带 `--force`**：那面旗子绕开 CLI 对家目录的误伤保护，该由用户显式决定）。默认**关**（`autoReindex: true` 才开，重建是分钟级操作）。三道闸：每项目每次宿主运行最多一次、只在已索引项目上查、失败只记日志。
- 卡片过期警告补了一句「实测此时 Sync 会报 Already up to date 且不解决问题」——以前文案只说「点重建索引可修复」，用户很可能先点 Sync 然后发现没用。

**用例（12 条）**：unlock 的 argv / 目录校验 / 只认 POST+回环 / CLI 失败回报 / 无锁幂等；`staleReasonsFromStatus` 的四信号、新鲜索引零信号、畸形输入不抛错；自动重建的默认关、过期时走 `index` 而非 `sync` 且不带 `--force`、每项目只一次、新鲜不重建、未索引不检查、失败不抛。

**真机端到端**：造一个真过期索引（改 SQLite `project_metadata` 里的 `indexed_with_extraction_version`），派发 `user/message` → 自动重建触发 → 轮询第一次就变新鲜；另验证新鲜索引**不会**被误重建。

**顺带修掉 CG41**：门禁原写成 `cliProbeState.available !== true`，而探测是挂载后异步跑的（200–300ms 窗口），会话第一条消息若落在这个窗口里会被**静默跳过**——写用例时才暴露（三次断言里有一次不查 status）。改为只在已确认不可用（`=== false`）时跳过。

### P2-a：已索引项目列表 + 一键切换 ✅

**问题**：一台 codegraph MCP 服务器同一时刻只挂一个项目，所以「换项目」是高频动作——而卡片此前只知道当前默认项目，想切到上周那个仓库只能手敲绝对路径。

**做法**：`GET /projects` + 卡片一排胶囊按钮，切换复用「设为默认项目」那条链路（持久化 → 关跟随 → 热切换 MCP）。

**数据源只用界内的**（这是本项最重要的约束，写进注释与 README）：

- 宿主 `sessions.list()` 的活跃会话 `header.cwd`（公开服务）；
- 插件自己观察到的路径：`/follow` 上报、查过 `/status` 的目录、当前默认项目。

**刻意不读 `~/.dsh/sessions/`**：那里有历史项目路径，但它是 DSH 的内部存储格式（会话桶名是路径编码、日志是多帧 zstd）。我先试了按桶名解码——**51 个目录一个都没解对**，于是没把列表建在它上面。宁可比用户记忆少几个项目，也不要一个「有时准有时不准」的列表。

**其余设计**：每条现算 `locateIndex`（与托管行 cwd、注入门禁、采纳率同一口径）；monorepo 子目录归并到索引根；未索引的也列出但禁用（用户会想知道「这个项目还没索引」）；按最近见过排序、容量 50 条淘汰最久未见者。

**用例（11 条）**：只认 GET + 回环；活跃会话 seed 且子目录归并到根；未索引标记 `indexed=false`；当前默认项目始终在列；`/follow` 上报进列表；查过 status 的路径进列表；无 `sessions` 服务时仍可用；最近见过的排前面；`indexedCount` 与列表一致；`shortPath` / `seenAgoText` 的边界。

**过程中修掉的两个真实问题**：
1. **`via` 被覆盖**：`/projects` 每次都会补登记默认项目与生效路径，于是 `/follow` 上报的项目来源被改写成「生效路径」——一个没有信息量的值。改成 `via` **只记第一次**（`at` 仍每次刷新）。
2. **TDZ**：`loadProjects` 声明在 effect 之后，被仓库自己的 `client-lint`（TS2448）拦下——这正是那道闸门存在的理由（编译不报、只有真渲染到那条分支才炸）。

### P2-c：修工具栏溢出（CG44）✅

用户截图实证：「撤销索引」被裁掉。根因不在按钮数量，而在 CSS 选错了语义——`.cg_toolbarBtns` 当时是 `nowrap`（整组不许断行），5 个按钮时正确、9 个时必然溢出。

修法（详见 DEFECTS.md 的 CG44）：允许换行 + 搜索行改 flex + 把「探索/上下文」按语义移回搜索行 + 「诊断包」挪出破坏性动作邻位；并新增**布局守卫用例**（含变异验证），把这个仓库里没有 jsdom / 无头 Chrome 起不来的缺口用「读源码断言性质」补上。

顺带修了 `scripts/preview-card.mjs` 的假 DOM 缺 `dataset`（CG37 把引用计数挪到元素 dataset 后该脚本一直崩，导致这个预览夹具长期不可用——正是它本该发现这次布局问题）。

### P3-b：收尾——CG32–CG34 关闭 + browser 半体纯逻辑抽测 ✅

**CG32–CG34：关闭，而不是「补齐」。** 三条的评审原文从未随附，仓库与 git 全历史零命中（`git log -S` 复查），**无法补齐定义**。挂着它们会让「待修 N」长期失真——缺陷台账的价值在于每条都能落到代码，落不下来的条目不该永远占着待办位。

关闭的同时不空手：新增**门禁矩阵用例**，覆盖那批判最可能涉及的一类（CG01 那一类：不可读的 body 静默回落到默认项目去执行**写操作**）——依赖 body 的 8 条 POST 路由逐一断言畸形体回 400；`reprobe` 因完全不依赖输入而不读 body（这是对的，读它反而引入「读失败 → 当成没给」的风险）；全路由回环门禁 403。**变异验证**：把 body 门禁改成「静默当空对象」，用例立刻红（`sync: expected 500 to be 400`——正好复现 CG01 的失败模式）。

**browser 半体：继续沿仓库既有做法抽纯逻辑，不引入 devDependency。** 各包都没有 jsdom，而 `tty` 的先例是「纯判定抽成 `client-src/*.js` 进 vitest + 真渲染走 preview 夹具」。本轮把状态面板里三个**有真实边界**的格式化函数从组件闭包搬进 `pure.js`：

- `fmtBytes`：1000 进制进位（999 B vs 1.0 kB）、`>= 100` 不留小数、TB 封顶、非法值占位符；
- `fmtNum`：`NaN` / `Infinity` / 字符串 / `null` 一律占位符（状态字段缺失是常态）；
- `fmtTime`：**解析不出来原样返回**（不是 `Invalid Date`、也不是 `—`）——这一列的语义是「CLI 说它何时被索引」，吞掉原串会让人以为索引从未建立。

抽完复验产物：无残留 import、三个函数各只定义一次（内联没造成重复）、`node:vm` 里加载后 factory 连跑两次无重声明（HMR 场景）。

**用例**：`test/cli-surface.test.ts` 3 条门禁矩阵 + `test/client-pure.test.ts` 3 条格式化边界。

## P2 / P3

### P2-b：CLI 面补全 + 查询参数面板 + 遥测提示 ✅

**问题**：卡片只覆盖 9 个子命令，其余只能去终端。其中 `explore` 尤其讽刺——它正是 usage 指引让**模型**去用的那个能力（走 MCP），人在卡片上反而够不着。

**先读真机 help 对齐契约**（五个子命令的参数与输出形态，全部实测）：

| 子命令 | 关键契约（实测） |
| --- | --- |
| `files` | `--json` 回数组（path/language/nodeCount/size）；`--filter` / `--pattern` / `--max-depth` / `--no-metadata` 可选 |
| `affected` | `--json` 回 `{ changedFiles, affectedTests, totalDependentsTraversed }`；**空列表时回 `No files provided` 且 exit 0**（不是错误） |
| `explore` | **输出是 markdown 不是 JSON**，所以走 `run` 而非 `runJson` |
| `context` | 默认 markdown；`--max-nodes` / `--no-code` / `--format` |
| `uninit` | **不带 `-f` 时问 `Continue? (y/N)`，非 TTY 下读到 EOF 即中止且不删除**（安全但无效）→ 插件一律带 `-f`，确认交给卡片 |

**做法**：新增 5 条路由 + 卡片 5 个按钮 + 查询参数面板。几个刻意的取舍：

- **`uninit` 与 `init` 同级纪律**：loopback + POST + 目标真是目录 + **目标真有索引**（未索引回 409），且撤销的是**索引所在的根**（monorepo 子目录上点撤销，删的必须是仓库根那份）。成功后再 `rt.sync()` 重算托管行——否则卡片会继续显示「已托管」，而 MCP 指着一个不存在的索引。
- **`affected` 不让插件猜改动列表**：不读 `git status`、不猜编辑器状态；待测文件从哪来是上游流程的事，卡片只把给定列表交给 CLI。
- **遥测只读转达、不给开关**：那是用户的全局偏好（`~/.codegraph/telemetry.json`，CLI 自己的 `telemetry on|off` 管），插件替他翻等于越权改别人的全局设置。解析不出状态行时 `enabled` 为 `undefined`，**不猜**。
- **`kind` 用自由文本而非下拉枚举**：上游加新 kind 时插件不必跟着改。

**用例（20 条）**：五个 argv 纯函数契约（含 `--` 终止符位置、`uninit` 必带 `-f`）；files 的旋钮透传与 `maxDepth` 校验；affected 的重复 files / 空列表 / `-` 开头拒收；explore/context 缺 q 400 与 markdown 输出；uninit 的未索引 409 / 真删除 / 子目录归到根 / 只认 POST；telemetry 的 enabled/disabled 解析、无法识别不猜、老版本 500 带原文；query 的 `kind`+`limit` 与 callers/callees 的 `limit`。

**真机验证**：`scripts/verify-codegraph-host-contract.mjs` 扩充到 **31 项、31/31 通过**（0.1.6-alpha.2）。



### P3-a：宿主版本基线对齐 + 宿主契约端到端 ✅

**问题**：同一个文档集里并存三个宿主版本号——README 说「已在 `0.1.5-rc.2` 上实测全链路」，DEFECTS 记审计基线 `0.1.0-rc.7`，本机实际跑的是 `0.1.6-alpha.2`，而 `engines` 声明下限又是 `0.1.2-rc.1`。谁也没说清「哪一档是验证过的」，而兼容性声明就建立在这个含混上。

**做法**：

1. **先把事实查清**（不猜）：本机 `dsh` = `0.1.6-alpha.2`；配套 `cordis` `4.0.2`、`dsh-tools`/`dsh-system-prompt`/`dsh-mcp-client`/`dsh-session`/`dsh-agent` 全为 `0.1.6-alpha.2`。运行中的 `web` profile 装的是**已发布的 0.4.2**（所以它只有 `/default-path`，没有本轮新增路由——那不是 bug，是没重新构建）；仓库工作树则通过 `~/.dsh/profiles/test/node_modules/@hyzyn/dsh-codegraph` 的 **symlink** 直连，正好可以当真机试验台。
2. **补上长期缺失的宿主契约端到端**：新增 `scripts/verify-codegraph-host-contract.mjs`（沿用 `verify-codegraph-indexforce.mjs` 的 `--patch` 临时层 + 独立端口模式，**不修改任何 profile / settings 文件**），在真宿主上一次验：18 条路由是否都在、POST/loopback 门禁是否成立、`/diagnose` 分段是否完整、浏览器半体产物是否可供给且含最新 UI、MCP 托管行是否按真索引写入 home 补丁。**在本机 `0.1.6-alpha.2` 上 25/25 通过。**
3. **README 改为版本矩阵**：每档注明验证方式；`0.1.5-rc.2` 那档如实标注「当时无脚本、覆盖不到供给面」；`0.1.0-rc.7` 说明它是审计当时的包版本、与本机安装的不是同一个；并写明**声明下限 ≠ 已实测下限**。

**过程中两次「测法错而非产品错」**（都改了脚本而不是改产品）：

- 首页 `/` 本机返回 **401**（宿主鉴权）——照它的 HTML 找 boot graph 必然失败。
- combo 路由 `/plugins/??<id>/client.js&rev=<hash>` 的 rev 是**内容哈希**，且宿主明说「revision 不匹配就拒绝，不返回更新的字节」，所以**猜 rev 必然 404**（实测确认）。改为验它的前置条件（产物存在、含 `__ModuleLoader__`、含新增 UI），真供给链路留人工开页面——这个边界写进了脚本注释。



- **P2 照 DEFECTS.md 的「待办 / 路线图」一节走**（那节比我列得全）：CLI 面补全、查询参数面板、
  **已索引项目列表 + 一键切换**（单服务器既成事实下最实用的补偿）、遥测提示、卡片 i18n、
  真机 `integration.mjs` / `*-smoke.mjs`。
- **P3 债**：~~CG32–CG34~~ ✅ 已关闭（见「已完成」）；~~宿主版本基线~~ ✅ 见「已完成」（CG42）；
  ~~browser 半体纯逻辑~~ ✅ 见「已完成」（P3-b）。**仍剩**：依赖 DOM 的那部分（CG08 样式引用计数、
  CG16 清详情、CG17 渲染分支）要覆盖必须引入 react + jsdom，或走 `scripts/preview-card.mjs` 的真渲染
  夹具——DEFECTS.md「补记」一节已明说刻意没加 devDependency。

## 建议开工顺序

1. **S 级两件先做**（注入索引门禁 → 诊断包）：✅ 已完成（见「已完成」一节）。
2. **再做采纳率仪表**：✅ 已完成（见「已完成」一节），拿到自己项目里的真实数字。
3. **拿着数字决定要不要动 P0 架构**：若 explore 采纳率本就很高，per-agent 挂载的收益只剩「多项目并行」
   与「去掉写盘链」；若使用场景本就是一项目一会话，P0 可降级。
4. **P0 与 P1 的索引生命周期不要同时开工**：两者都要动 `apply()` 里的 effect 顺序，容易互相踩。

## 复核门槛

改完任一项后，本包的最低门槛（当前全绿，见「基线」表）：

```bash
npx tsc --noEmit -p packages/codegraph/tsconfig.json
npx vitest run packages/codegraph
npx vitest run                                   # 全仓，防跨包回归
pnpm -r build && git diff --stat                 # 产物 = 源码闸（CG28）
node scripts/check-dsh-home.mjs                  # 跨包 DSH_HOME 推导的防回归闸（CG35 已修，保持绿）
```

涉及宿主事件面（P0 / P1 仪表）的改动，除单测外需要一次真机复跑：起 `dsh web`，在一个已索引仓库
里开两个会话，确认两个 agent 各自拿到自己仓库的结果、`tool/call` 计数正确、退出后无残留
`codegraph serve --mcp` 进程。
