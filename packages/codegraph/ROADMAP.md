# @hyzyn/dsh-codegraph 增强路线图

> 2026-09-22，基于 0.4.2 工作树的一次静态复核 + 本机实跑 + 与 per-agent 隔离模型
> （`dsh-simple-codegraph`：每个 Agent 各自一个 scope 内挂 `dsh-mcp-client`）的对照分析产出。
>
> 本文放**前瞻规划 + 尚未开工的待办**；**缺陷**仍按 `CGxx` 编号记在 [DEFECTS.md](./DEFECTS.md)。
> 本文每一项在动手前先转成可验收条目（做完回填「落点 + 门槛」），不要只停留在规划里。
> 2026-09-25 起，DEFECTS.md 的「待办 / 路线图」一节已并入本文（见下方同名小节）。
>
> 已被排除的候选：**跨包 `dshHome()` 归一**（CG35）在 0.4.2 已修完——`packages/*` 全部改走
> `@hyzyn/dsh-kit`，走 `node scripts/check-dsh-home.mjs` 实测通过（「DSH_HOME 推导只存在于
> @hyzyn/dsh-kit」），不要再当作待办开工。

## 基线（本次实测）

| 项 | 结果 |
| --- | --- |
| 包版本 | 0.4.2；registry `dist-tags.latest` = **0.4.2**（2026-09-19 发布）——DEFECTS.md §4「冻结记录」里那份「验收记录」中「0.4.2 仅存在于工作树」那句已过期 |
| `npx vitest run packages/codegraph` | **202 passed / 10 files** |
| `npx vitest run`（全仓） | **779 passed / 48 files** |
| `npx tsc --noEmit -p packages/codegraph/tsconfig.json` | 干净 |
| 本包可用的运行时依赖 | `packages/codegraph/node_modules/@deepseek-ai/` 目前只有 `cordis` + `schemastery`（其余靠 `scripts/link-dsh-runtime.mjs` 链接） |
| 宿主事件面（本机 DSH 实测存在） | `agent/created`、`agent/disposed`、`agent/inbox/inserted`、`tool/call`、`tool/result`、`system-prompt/assemble` |

**2026-09-25 复测**（只列与上表**不同**的项；上表是 2026-09-22 的时点快照，**原值保留不改**）：

| 项 | 2026-09-22（上表） | 2026-09-25（复测） |
| --- | --- | --- |
| 包版本 | `0.4.2` | **`0.5.2`**（本机 `package.json`）。⚠️ **registry 的 `dist-tags.latest` 本次未能复核**——`npm view` 在本机因 `~/.npm` 缓存 EPERM 失败，上表那句「= 0.4.2」未经验证、也未改动 |
| `npx vitest run packages/codegraph` | 202 passed / 10 files | **14 files / 317 tests**（该时点输出）<br>`npx vitest run packages/codegraph --reporter=dot` |
| `npx vitest run`（全仓） | 779 passed / 48 files | **56 files / 965 tests**（该时点输出）<br>`pnpm test` |
| 本包可用的运行时依赖 | `cordis` + `schemastery` | **`cordis` + `dsh-mcp-client` + `schemastery`**（`dsh-mcp-client` 是 optional peer，pnpm 已装） |
| 宿主基线 | 本机 `0.1.6-alpha.2`；`engines` 下限 `0.1.2-rc.1` | 本机 **`0.1.7-rc.2` + `0.2.0-rc.1` + `0.2.0-rc.2` + `0.2.1-alpha.1` + `0.2.1-alpha.2`**；peer `^0.1.7-rc.2 \|\| ^0.2.0-rc.1 \|\| ^0.2.0-rc.2 \|\| ^0.2.1-alpha.1 \|\| ^0.2.1-alpha.2`；`dsh.engines.dsh` `>=0.1.7-rc.2`（最低档） |
| host-contract 真机 | P3-a 记 25/25、P2-b 记 31/31（均 `0.1.6-alpha.2`） | **42/42**（`0.1.7-rc.1`、`0.1.7-rc.2`、`0.2.0-rc.2` 与 `0.2.1-alpha.1` 各一次，见本文「host cohort 逐档实测证据」） |
| 路由条数 | P3-a 时点记 18 条 | **25**（该时点输出）<br>`grep -oE "/api/dsh-codegraph/[a-z-]+" packages/codegraph/src/index.ts \| sort -u \| wc -l` |

> 下文的 P2-b / P3-a 两节是**当时的落点记录**，其中的 31 / 25 / 18 是历史值，按维护规则**保留不改**。
>
> **本表只留「必须真机才有」的值**（`42/42`、包版本、本机宿主版本、依赖面）；可现算的项一律写成
> **命令 + 该时点输出**——写死成数字就一定会漂，而本文件已经有三份快照了（09-22 表、本表、
> P2-b / P3-a 正文）。**下次复测请重跑上面这些命令，不要再新增一张对照表。**

## 判断

这个插件**不缺功能**，缺的是三层上的东西：

1. **上限在架构**：一台 MCP 服务器同一时刻只挂一个项目，多项目是**时分复用**；`followSession`
   每次会话切换都要重写 `~/.dsh/cordis.patch.yml` 并触发 `watchUserPatches` 重建连接。
2. **体验在测量**：插件**不知道**模型有没有真的用上 CodeGraph —— 它 `inject: []`，一个工具/事件面
   都没接，「采纳率」目前只能靠感觉，也就无从判断提示词该收紧还是放松。
3. **成熟度在环境健壮性**：坏锁、常驻 daemon、PATH / HOME / 控制台编码——这类故障占了实际问题的
   绝大多数，而卡片对它们几乎没有入口。

功能面（CLI 子命令覆盖率）反而是最不缺的，且维护者已在审计时点列全——那批原始待办现由本文的
「缺陷审计时点列出的原始待办」一节承接（自 DEFECTS.md 迁入，见该节的 ⚠️ 标注）。

## 缺陷审计时点列出的原始待办（自 DEFECTS.md 迁入）

> 2026-09-25 从 `DEFECTS.md` 的「待办 / 路线图」一节**逐字迁入**，一条未删——原文在那里与
> 本文件的「已完成」一节并存、口径不一致，现在合并到一处，两边内容都保留。
> **缺陷**仍按 `CGxx` 编号记在 [DEFECTS.md](./DEFECTS.md)，本文只放「还没做的事」。

> ⚠️ **标注（本次未擅改）——下面 8 条与上文「已完成 / 优先级总表」存在口径冲突**：
> 上文已把 **CLI 面补全**（`explore`/`context`/`files`/`affected`/`uninit`/`unlock`/`telemetry`）、
> **查询参数面板**、**已索引项目列表 + 一键切换**、**遥测提示** 标为 ✅ 已完成（仅 `daemon` 仍缺），
> 而下面这几条是**审计时点**的原始措辞、没有跟着更新。按维护规则「只标注、不擅自改」，
> 原文照录，请以上文「已完成」一节的落点与用例为准。

> 新发现的缺陷接着 `CG63` 往后编号记在 [DEFECTS.md](./DEFECTS.md) 的索引表，不要只留在对话里。
>
> **分档（P0–P3）、代价、架构项与开工顺序见本文的 [「优先级总表」](#优先级总表) 与
> [「建议开工顺序」](#建议开工顺序)**——本节保留缺陷审计时点列出的原始待办
> （CLI 面 / 查询参数 / 多项目列表 / 遥测 / daemon / i18n / E2E），与那两节不重复。

- **CLI 还有一多半没进 GUI**（实测 `codegraph --help`）：`explore`（旗舰，且 usage guidance
  正是让模型用它）、`context`、`files`、`affected`、`uninit`、`unlock`、`daemon`。
  README 把 `codegraph uninit` 写成「初始化按钮的撤销路径」，GUI 里却做不到 —— 要么补按钮，
  要么改 README。`unlock` 尤其值得做：实测项目里确实有 `codegraph.lock` 与常驻 daemon
  （`.codegraph/daemon.pid` + `daemon.sock` + `daemon.log`，`~/.codegraph/daemons/` 两个实例），
  一次被强杀的 index 留下的坏锁会挡住后续索引，而卡片没有任何入口。
- **查询参数面板**：`query -k/--kind`、`callers|callees -l/--limit`（CLI 默认 20）、
  `node --offset/--limit/--symbols-only`、`impact --depth`（卡片固定 2）都是透传就能用的旋钮。
- **多项目**：一台 codegraph MCP 服务器同一时刻只挂一个项目是既成事实，卡片却没有
  「已索引项目列表 + 一键切换」；`files`/`status` 配合 `.codegraph` 扫描能做出这个列表。
- **遥测**：`init`/`index` 会触发 CLI 自己的匿名用量统计，README 提了 `codegraph telemetry off`，
  卡片既不提示也不给开关。（上游 CLI 的 1.6.0 输出里也带这句提示。）
- **daemon 可见性**：`daemon.pid`/`daemon.log` 是排障第一现场，卡片可以显示「有没有常驻 daemon、
  日志尾 N 行」，把「MCP 拿不到结果」这类问题从猜变成看。
- **卡片 i18n**：全中文（含 `label: () => "Codegraph"` 旁边的所有文案），而包同时维护英文 README。
- **端到端脚本**：`packages/codegraph` 仍没有 tty 那类 `integration.mjs` / `*-smoke.mjs`
  （路由的 HTTP 层行为——并发、断连、body 超限——只有 vitest 里的 fake req/res）。
  `verify-codegraph-indexforce.mjs` 是唯一真机端到端，需要本机装 DSH，跑不了 CI。

## 优先级总表

代价口径：**S** < 半天｜**M** 1–2 天｜**L** > 3 天。

| 级别 | 事项 | 影响 | 代价 | 落点 |
| --- | --- | --- | --- | --- |
| **P0** | ~~agent 侧改 **per-agent scoped MCP 挂载**~~ **✅ 已实现**（**默认 `per-agent`**——2026-10-24 从 managed 翻过来，`mcpScope: 'managed'` 显式回滚；托管行保留为回落） | 多项目真并行；删掉写盘 + 热加载 + 竞态整条链；跟随不再依赖 GUI 页面；**默认就没有索引的会话拿不到工具**（披露面收口） | M–L | `src/scope.ts`（新）+ `apply()` 接线 + `/agents` + 卡片开关；见 [docs/p0-plan.md](./docs/p0-plan.md) |
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

### CG72：没有可写条目时不写盘，别把合法的 `[]` 摘成纯注释 ✅

**问题**：CG67 的「只摘空根也算变化」（`repaired = !dryRun && strippedRoot && !outcome.changed`）
没有区分「摘完还剩条目」与「摘完什么都不剩」。后者写出的是**纯注释**文件——宿主 `parsePatchList`
要求顶层是数组，而纯注释连 `yaml.load` 都只返回 `undefined`（**不抛**），于是整层补丁加载失败。
`[]` 本身就是合法的空数组根，这一步等于把合法文件改成非法文件。

**触发面是「每个全新 profile 的第一次」**：宿主模板就是「三行注释 + `[]`」。首次同步若默认项目
未索引（没有可写区块）、或 `manageEnabled=false`、或 per-agent 且没有区块可挂，三条路径都只摘根
不写别的 → 写盘 → 下次启动 `dsh: ... must be a top-level YAML array of loader patch entries`、
退出码 1。0.6.9–0.6.14 全部携带；0.6.8 及以前是另一种坏法（把托管块追加在 `[]` 之后）。

**复测自身的教训**：第一轮复测从仓库目录起宿主，`process.cwd()` 恰好已索引、当场写了托管块，
于是绕开了空路径。「干净环境」之外还得控制**启动 cwd**——换成非索引目录才必现。

**做法**：只在真有东西可写时才声明变化——`strippedHasEntry` 判「摘根后还存在至少一条非空、
非注释行」，`repaired` 追加该条件；无可写内容时把**原数组**原样返回（`changed=false`，`[]`
保持不动）。顺带收口 `applyReplacements` 在无 replacement 时返回「摘过根的行数组」的问题：
那与文档承诺的「无变化时返回原数组引用」不符，且会被下游当成修好后的内容写出去。

**用例（7 条）**：模板+未索引 / 只有 `[]` / per-agent 无区块 / `manageEnabled=false` 四种「不写盘」，
索引对照（证明不是把功能关掉），CG67 自愈不退化，以及一条矩阵不变量「只要 `changed=true`，
写回内容必须能被宿主当顶层数组读回」——断言用 `Array.isArray(yaml.load(...))` 而不是「不抛」，
因为纯注释文件 `yaml.load` 不抛。**变异**：撤掉 `strippedHasEntry` → **恰好 5 条红**、其余 48 条绿。

**真机（2026-10-22，发布级）**：干净 `DSH_HOME` + `--from-default-profile` 官方模板 profile +
`dsh plugin add @hyzyn/dsh-codegraph` 从 npm 装，从**非索引目录**启动——修复前补丁 217→214 字节
只剩注释、重启 exit=1；修复后不写盘、补丁保持 217 字节、重启正常。

### CG73：验收脚本预置托管块时重踩「追加到 `[]` 之后」✅

**问题**：`verify-codegraph-host-contract.mjs` 的 `seedPreseededMcpRow()` 是 `existing + [区块]`。
它只在 `test` / `desktop` 这类**早已有真实条目**的 profile 上跑过；换成全新 profile 时，
模板末尾正是 `[]`，追加后整份文件非法，宿主在 `loadProfileDirectory` 就抛、exit=1。
脚本只报「宿主没在端口上就绪」，看不出根因——**验证工具复现了它要验的 CG67**。

**影响**：`--profile` 的「换模板」能力实际只剩「换一个已有条目的成熟 profile」，
「干净 profile 验收」这一档静默缺失。

**做法**：`appendManagedBlock(existing, block)`（`scripts/lib/live-harness.mjs`）——
追加前复用 kit 的 `stripEmptyFlowSequenceRoot` 摘掉根位置的 `[]`，注释与已有条目逐字节保留；
预置改用它。

**用例（4 条）**：全新模板 + 块 / 已有条目 / 空文件与纯注释 / **反例**（旧写法必须写出
`document separator`）。**变异**：把先摘空根去掉 → 恰好 2 条红，还原后全绿。
**真机**：全新 `DSH_HOME` + 官方模板 profile（patch 原样 `[]`）+ 工作区构建，契约脚本 **42/42**；
修前同场景 1/2。


### CG71：挂起留下的空占位在恢复时被清掉，文件回到原样 ✅

**问题**：`per-agent → managed` 切回来之后，自有区块里残留一条 `- insert: []`（真机上还跟一个空行）。
挂起分支用 `renderBlockBody([])` 写出这个占位，而恢复分支只「插入新行」、从不清理区块体——两条路径的
「写什么」与「读什么」不对称。功能不受影响（空 insert 是合法空操作，`mode=own`、工具与调用都正常），
也不累积（再挂起时整块重写会清掉），但它是**用户点一下卡片就产生**的脏写，文件回不到挂起前的样子。

**为什么现有用例抓不到**：`agent-scope.test.ts` 那条只断言 `serverName: codegraph` 回来了；
`verify-codegraph-host-contract.mjs` 42/42 预置的是 **dsh-mcp 区块**（走 `disabled: true`，可逆、无占位），
根本走不到这条分支。

**做法**：恢复分支改成「先算清掉占位后的区块体真实内容，再整块重写」。**不用行编辑**是实测出来的：
删 + 插混在一个 replacement 里必然错位（删除让行号前移，插入点算的是原文件位置），拆成两个也不行
（共享同一个 `range.start`，排序不稳定）——两版都把整块内容打乱并挪到了结束标记之外。整块重写没有这个问题，
且能保留用户注释（只滤占位行；只有区块里没有别的内容时才连带收掉紧随的空行）。
顺带给 `LineEdit` 加 `remove`、给 `applyReplacements` 加稳定排序（组内按最大编辑行号降序）。

**用例**：`agent-scope.test.ts` 那条补「不留占位 + 二次 sync 零改动」；`profile-layer-patch.test.ts` 新增
「往返后 profile 层逐行回到挂起前」。**变异**：退回「只插入不替换块体」→ **恰好这 2 条红**、其余 41 条绿。
第一版变异打在 `.filter()` 上时用例没红 → 查出来整块重写本身就清掉了占位、那段 filter 冗余，已简化。

**真机（2026-10-22，test 3082 + test-logs 3085 同时起，只切 test）**：挂起后只剩占位 → 切回 managed 后
**sha 回到基线 `66b24ed75acf17ab`**；`test-logs` 与 home 层全程逐字节未变；新建真实会话首轮
`nTools=153` 含 `mcp__codegraph__codegraph_explore`，模型真调用成功（返回 69 个符号）。

### CG70：托管行写本 profile 的层，不再跨 profile 互改 ✅

**问题**：托管行一直写 `$DSH_HOME/cordis.patch.yml`（**机器级** home 层，DSH 对每个 profile 都加载、
且**压过** profile 自己的层）。同一台机器开两个宿主（web + desktop 是典型组合）时，两个插件实例抢同一份
文件：desktop 是 per-agent → 写 `insert: []`，web 是 managed → 写启用行，**谁后写谁赢**，而且三处可观测面
都在骗人——`/default-path` 报的是本实例内存里的 `mcpScope`、托管行快照读的是 home 层并报「本插件区块里还
没有托管行（下次同步会写入）」这句**假话**。用户只能归因成玄学。

**做法**：设定与效果**同层**。新增 `patchPath(ctx)` 优先用 `profileContext.patchPath`（宿主本来就
`provide` 了它），拿不到回落 home 层（最小宿主 / 单测 / 老版本不能丢托管能力）。**迁移是前置条件**：
实测同 id 出现在两层时 loader **不去重**、实际只挂一条且**后加载者胜 = home 层**，所以不清旧块会让旧值
静默盖住新值。新增 `stripOwnBlockFromHomeLayer()`：只认自己的标记、整段摘除、别人的内容一个字节不碰、幂等、
沿用写前复核；三条 sync 路径都跑一次。顺带把三个读写函数的 `patchFile` **去掉默认值**——现场踩到的正是
「默认值静默回落到 home 层」（快照没传参 → MCP 挂上了却报「还没有托管行」）。

**用例（5 条，`test/profile-layer-patch.test.ts`）**：写进 profileContext.patchPath 而不是 home 层；
home 层的旧块被整段清掉而**别人的块与用户注释原样保留**；迁移幂等（第二次内容与 mtime 都不变）；
拿不到 profileContext 时回落 home 层；per-agent 下两层都不存在启用中的托管行。
**变异验证**：禁用迁移 → 3 条红；把 `patchPath` 改回永远返回 home → 4 条红。

**真机（2026-10-21，隔离 home + 真宿主）**：造「home 层有旧块、profile 层没有」的升级形态 →
home 层本插件块 0、旧 cwd 0、**别人的块 2 条原样保留**；profile 层新块 1 条、cwd 为新值；
`/default-path` 报 `mode=own`（不再误报「还没有托管行」）；该宿主挂的 MCP 子进程 1 个；
启动日志 0 条 duplicate / fatal / did not activate。**不崩、不报错**——两条同 id 的后果是「后加载者胜」，
不是启动失败（这一点也实测确认过）。

### CG69：agent 服务迟到时不再永久退回 managed ✅

**问题**：`apply()` 里 `ctx.get('agents')` **只抽样一次**，而 cordis 4 的 `ctx.get` 是 strict 的（只认提供者
fiber 已 ACTIVE），loader 又用 `Promise.all` 并发创建 entry、行序不构成加载顺序。抽样落到 LOADING 窗口就得到
`agentEventsAvailable = false` → `resolveScopeMode` 把 per-agent 永久退回 managed；而 managed 的托管行在没有
已索引默认项目时是空的（`insert: []`），**两条挂载路径同时不存在**。真机事故（2026-10-21，桌面端 0.2.1-rc.1）：
插件重载后同一进程里新建的会话全都没有 `mcp__codegraph__codegraph_explore`，`/agents` 台账 `mounted:0/live:0`。
根因与修法见 [DEFECTS.md](./DEFECTS.md) 的 CG69 行。

**做法**：探测降级成「此刻能不能用」（`readAgentSurface()`，三处共用），服务迟到由一节
`ctx.inject(['agents'])` 兜住——到货置 `agentEventsAvailable = true` 并跑 `refreshAgentSurface()`，按最近一次
settings 快照（`lastStored`）重跑 sync，由 `applyScopeMode` 的「模式变了才动手」判据收敛。**顶层
`inject: []` 不变**：本包在 agent 服务缺席的宿主里照样要能挂。顺带把当年那段「为什么不用 inject」的注释
改写成「顶层为什么仍是 `[]` + 迟到为什么用 inject 兜」，避免下一个人照旧注释把兜底删掉。

**用例（4 条，`test/agent-late-service.test.ts`）**：apply 期读不到服务 → 退回 managed（这是正确行为，对照组）；
服务到货后同一实例重新裁决成 per-agent 且之后新建的 agent 真挂上；重算沿用卡片设置、不退回安装级默认值；
迟到重跑**只变一次并稳定下来**（补丁是热重载面：切 per-agent 时删成 `insert: []` 那一次是必须的，
之后同值重算必须零改动，否则会形成「写盘 → 热重载 → 再 sync」的自激回环）。
夹具与 `agent-created-mode.test.ts` 的关键差异：那份的 `get('agents')` **恒返回服务**，竞态窗口根本不存在——
这正是 CG69 长期没被盖住的原因。

**真机（2026-10-21，test profile @3082）**：per-agent 下新建真实会话，首轮 `request/header` 即含 `mcp__codegraph__codegraph_explore`（`nTools=167`），模型实际调用成功。另有 `scripts/verify-cg69-real-cordis.mjs` 在**真 cordis** 上把「服务迟到」真实演一遍（先不装 AgentRegistry → apply 期严格读不到 → 后装真服务 → inject 回调触发 → 裁决自己翻回 per-agent → 新建 agent 拿到工具），摘掉修复即红。

**变异验证**（三个方向，各自只打到它该打的那条）：摘掉那节 `inject(['agents'])` → 第 2、3 条红；
只把 `sync(lastStored)` 改成 `sync(undefined)` → 第 3 条红、前两条仍绿；把 `syncMcpRowOnDisk` 的
`if (!outcome.changed) return` 短路掉（无变化也落盘）→ 第 4 条红（mtime 变了）。
第四条最初写成「任何情况下都不该写」，被变异跑出来是**空断言**——`deliverAgents()` 第二次会撞上
`if (agentEventsAvailable) return`，根本走不到 sync；改成「先等它变一次、再用同值设置写触发真正的
重算、断言零改动」才有牙齿。

### per-agent 挂载等 env 的 `dshEnvReady` 门（2026-10-24 真机复核）

**为什么加**：env 在 `apply()` 开头**同步**把值写进 `process.env`，而插件按加载器并发 create 挂载
（`Promise.all` + 动态 `import()`），**配置行序不保证 apply 顺序**。per-agent 挂载会 spawn 一个 MCP
子进程，子进程的环境 = 宿主 `scrubbedParentEnv()` + `config.env`，理论上 env 晚到就会少掉它注入的变量。
于是让 env 在注入完成后 `ctx.provide('dshEnvReady', …)`，codegraph 用 `whenEnvReady()` 等它（已就绪 /
宿主没装 / 装了还没到，三条分支），实现在 [src/env-gate.ts](./src/env-gate.ts)。

**本次复核纠正了一条写错的因果**（原表述散在 `env-gate.ts`、两份 README、`architecture.md` §2/§5、
`packages/all/README.md` 与 `scripts/aggregate-order.mjs` 头部，**均已改**）：那些地方说 per-agent 会
「import `dsh-mcp-client` 并求值 `!!js` 认证头」。**实测与读代码都不成立**——

- per-agent 传给 mcp-client 的 config 只有 `serverName` / `transport: 'stdio'` / `command` / `args` /
  `cwd` / `failOnStartupError`（`scope.ts` 里那份），**没有 `headers`**，也就没有求值这回事；
- 它也**不传 `config.env`**，所以子进程拿到的就是「宿主环境 − 凭据形状名字 − `DSH_*`」；
- 最该防的**凭据形状变量本来就进不去子进程**：`scrubbedParentEnv()` 剔除命中
  `/KEY|PASSWORD|SECRET|TOKEN/i` 的名字，**门不开也漏不了**——那是宿主在兜底，与这道门无关。

真正受影响的是「子进程继承到的**普通**环境变量」。这仍是真实的时序面，只是射程比原表述小得多。

**真机验证（隔离 `DSH_HOME` + `dsh --from-default-profile headless` 新建 profile，`link:` 装本仓
env/codegraph，真 `agent/created` → 真 session → 真 MCP 子进程；真实 `~/.dsh/cordis.patch.yml` 与
`env.yml` 收尾哈希不变）**：

- **整条链路通**：`per-agent MCP 已挂载：agent=session-…`，子进程里能读到 env 注入的普通变量；
- **门的机制在真 cordis 上成立**（变异对照：只改 `ctx.get('loader').entries()` 里有没有 env 那一行，
  判据取**子进程自己写出的 env 快照**）：有 env 行 → 工具出现在 1942ms、env apply 于 1511ms、子进程
  **有**标记变量；没有 env 行（= 改动前）→ 工具出现在 256ms、env apply 于 1504ms、子进程**没有**。
  两条方向相反，所以不是恒真；
- **三条退化路径都对**：没装 env 直接挂（304ms）、env 被 loader 禁用也直接挂（304ms）、env 装了但
  `apply` 从不 provide 时**确实停等**（fail-visible，与文件头边界声明一致）；
- **但那个窗口在真宿主上没复现出来**：把 env 的**模块装载**人为推迟（`await` 在模块顶层——这是
  「fiber 晚 active」的真实成因，不是伪造 apply 期）700ms / 6s / 15s 三档，**带门与不带门两版都拿到了**
  注入值。时间戳给出原因：挂载自身有 `loadClient()` 动态 import + spawn 的异步跨度（实测 ~350ms），
  env 几乎总在这段里就装完了；真宿主里 `agent/created` 又发生在启动完成之后。
  **所以这道门目前是防御性时序保险，不是已证实的修复。**

**边界（别再写大）**：env 装了但它的模块 import/apply 抛错时服务不出现，per-agent 挂载会停在「等待
就绪」——刻意不设超时兜底，让 env 的错误在启动日志里可见，比静默降级更符合本仓口径。热重载同理：
已 spawn 的子进程不会重新同步一份环境，那次同步只在启动时发生一次。

**用例（`test/env-gate.test.ts` 8 条 + `packages/env/test/ready-service.test.ts` 2 条）**：就绪即跑、
缺席即跑、装了才等、重复触发只跑一次，以及禁用 / 无 `inject` / `inject` 抛错三条退化路径；env 侧钉
「正常配置 provide 且 `keys` 不含值」与「禁用时也 provide `{enabled:false}`」。这些是**机制钉守**，
不是回归复现——上面那条真机结论写在这里，就是为了将来有人问「这扇门为什么在」时有据可查。

**变异时踩到的两个坑**（下次照抄省一轮）：

- `ps eww -p <child>` 读别人进程的 environ 在这个沙箱里**被拒**（返回空串）。第一版拿它当判据，
  结果对照组那条「子进程没有标记变量」**假绿通过**——观测不到被当成结论，正是
  [docs/agent-real-test.md](../../docs/agent-real-test.md) 警告的那种。改成让被测子进程自己
  `env > dump` 再 exec 真 CLI，并且「dump 写不出来」算 FAIL 而不是 PASS。
- 真宿主里那个 `mcp-client(codegraph): initial connection or tool synchronization failed` **不是本改动
  引起的**（HEAD 版同样失败）：隔离宿主没有 API key → `MISSING_CREDENTIAL`（比失败早 15ms）→ agent 被
  回收，connection 在 pending 中途被 dispose。塞一个占位 `DEEPSEEK_API_KEY` 后挂载即成功。

### host cohort 逐档实测证据（DSH 0.1.7-rc.1 → 0.2.1-rc.4）

> 从 [README § 兼容性](./README.md#兼容性dsh--codegraph-cli) 搬入（2026-10-23）：README 只留「支持哪些档 + 为什么这么声明」，
> 逐轮实测的落点 / 门槛 / 「未跑」清单归这里。原文保留，只把「见上条」补成明确指向。

  - **`0.1.7-rc.1`（上一轮适配基线，2026-09-23 实测）**：`node scripts/verify-codegraph-host-contract.mjs --profile test --port 3087 --dsh-bin <独立安装的 rc.1 dsh> --runtime-store <该安装的 .pnpm/node_modules/@deepseek-ai>` **42/42 通过**——25 条路由全在（含 `/projects`、`/metrics`、`/diagnose`、`/unlock`、`/files`、`/affected`、`/explore`、`/context`、`/uninit`、`/telemetry`、`/agents`）、POST 门禁与 loopback 门禁成立、`/diagnose` 输出分段完整、浏览器半体产物可供给且含最新 UI、MCP 托管行按真索引写入 home 补丁、`mcpScope` 开关「切 per-agent → 全局行被挂起 → 切回 managed 恢复」全程可逆且真实 `~/.dsh/cordis.patch.yml` 逐字节未变。**新增的两项**专门验 0.1.7 的 settings 迁移：启动后经插件自己的写路径把 `mcpScope` 切回 managed 基线、并把默认项目切到临时项目，两项都要求 HTTP 200（旧 API 下这两步只会 500）。
    - 验证方式说明：本机全局 dsh 若不是 rc.1，可用 `--dsh-bin` 指向一份独立安装的 rc.1，并用 `--runtime-store` 把**复制出来**的临时 profile 的 `node_modules/@deepseek-ai/*` 重指到该安装的运行时——否则那些链接仍指向全局旧安装，新 cohort 的兼容性 preflight 会把整套旧运行时行判成 incompatible 而全部禁用（宿主根本起不来，与本插件无关）。
    - 另一条已跑过的真机证据：隔离 `DSH_HOME` 启动 test profile（同样做运行时重指）→ 10 个插件全部 mounted、0 行 `disabling profile plugin row`，`POST /api/dsh-codegraph/settings` 在 `per-agent` / `managed` 之间往返都是 200。
  - **`0.1.7-rc.2`（当前适配基线，2026-09-25 实测）**：cohort 从 rc.1 提到 rc.2，`peerDependencies` 与 `dsh.engines.dsh` 的下限同步提升。`node scripts/verify-codegraph-host-contract.mjs --profile test --port 3087`（本机全局就是 rc.2，无需 `--dsh-bin` / `--runtime-store`）**42/42 通过**——25 条路由、POST / loopback 门禁、`/diagnose` 分段、浏览器半体可供给、MCP 托管行写入隔离 home 补丁、`mcpScope` 在 `per-agent` / `managed` 间往返可逆且真实 `~/.dsh/cordis.patch.yml` 逐字节未变。另两项：真宿主加载 test profile 时 **10 个插件全部 mounted、0 行 `disabling profile plugin row`**；工作区 `pnpm -r typecheck` 全绿、`vitest` **960/960**、`pnpm -r build` 绿。本轮未改任何插件运行行为（只有兼容性声明、文档与 lockfile）。rc.1 → rc.2 的 lib 产物逐文件比对：`dsh-tools` 仅新增可选 `PreToolDecision.displayReason`（本仓不构造该决策）、`dsh-session-query` 仅 JSDoc、`dsh-client-ui-theme` 仅设计 token 增补，`dsh-mcp-client` / `dsh-host-webserver` / `dsh-subprocess-local` / `dsh-credentials` / `dsh-base` / `dsh-settings` / `dsh-web-app` / `dsh-headless` 逐字节相同；`dsh-app-boot` 删除了 `skippedProfileBundles` 并改了 `generateConfigSchema` 签名（去掉首参 `binName`），但那是 DSH 自己的 CLI 与 app-boot 之间的内部面，本仓无任何引用。

    > ⚠️ **标注（本次未擅改）——两个测试总数不是同一次运行的产物**：本条写的是 **rc.2 那一轮验证
    > 时点**的用例数（`960/960`）；本轮项目级文档改造之后，当前值为全仓 **56 files / 965 tests**
    > （`packages/codegraph` 本包 14 files / 317 tests）。**两个数都不改**——当前值以
    > [ROADMAP.md 的「2026-09-25 复测」表](./ROADMAP.md#基线本次实测)为准。
    >
    > 本条的「25 条路由」同理：**以命令现算为准**，别把它当契约（现算命令见 ROADMAP 复测表）。
  - **`0.2.0-rc.1`（同轮新增的第二档基线，2026-09-28 实测）**：不改任何运行代码，只把兼容范围写成两段（见下两条）。证据：① 用 0.2.0-rc.1 自己的判定器（`dsh-app-boot` 的 `evaluatePluginCompatibility`）对本仓 13 个可安装包逐一核对：单段 `^0.1.7-rc.2` 时 **12/12 全被拒**（`^0.1.7-rc.2` 展开是 `>=0.1.7-rc.2 <0.2.0-0`，`0.2.0-rc.1` 恰好卡在 `-0` 上，`includePrerelease: true` 也救不回来），改成两段后逐 cohort 全部放行。② 隔离 `DSH_HOME` 在真 0.2.0-rc.1 宿主上：`dsh plugin add` **不需要任何豁免**就装上 10 个插件，启动后 10 个全部 mounted、无 `skipping profile bundle`；`verify-client-ui` **5/5 PASS**、`verify-rss-opml` **9/9 PASS**（真实下载 + 回环）。③ 同一批包在 0.1.7-rc.2 宿主上回归同样全绿（client-ui 5/5、rss-opml 9/9）。④ 两档的插件 API 面逐文件比对：`dsh-tools` / `dsh-client-ui-slots` / `dsh-client-locale` / `dsh-host-webserver` / `dsh-subprocess-local` / `dsh-client-modules` / `dsh-package-manifest` 的 `.d.ts` **逐字节相同**，`plugins.row.config` 槽契约相同，`cordis` 4.0.4 与 `schemastery` 3.18.4 同版本。
  - **`0.2.0-rc.2`（同轮追加的第三档基线，2026-09-29 实测）**：不改任何运行代码，只把兼容范围追加第三段（见下两条）。注意这一段与前两档不同：`0.2.0-rc.2` **本来就被 `^0.2.0-rc.1` 覆盖**（`>=0.2.0-rc.1 <0.3.0-0`，`includePrerelease: true` 下 `semver.satisfies('0.2.0-rc.2', …)` 为真），所以它是**显式声明**而不是修边界——但照样走完「每加一档都必须实测」的全部动作。证据：① 三档各自的判定器（`dsh-app-boot` 的 `evaluatePluginCompatibility`，0.1.7-rc.2 与 0.2.0-rc.1 从 registry 装出带依赖的副本）对本仓 13 个可安装包逐包 × 逐 cohort 核对，**3 档判定器 × 3 个 cohort 全部放行**（`node scripts/check-dsh-peers.mjs --app-boot <该档的 dsh-app-boot 目录>`）。② 隔离 `DSH_HOME` 在真 0.2.0-rc.2 宿主上：`dsh plugin add` **不需要任何豁免**就装上 10 个插件；`--dump-config` 的 stderr **0 行**、10 条 `@hyzyn` bundle 全在组合结果里；启动后 **10/10 mounted、无 `skipping profile bundle`**。③ 同一宿主上的三层真机验收：`verify-client-ui` **6/6 PASS**（10 个 `@hyzyn` 客户端 bundle 真在 Chrome 里被加载、0 未捕获异常、0 error 级控制台输出、0 失败子请求）、`verify-rss-opml` **9/9 PASS**（真实下载 + 导入回环 + 收尾复原）、`verify-codegraph-host-contract` **42/42 PASS**（25 条路由、POST / loopback 门禁、`/diagnose` 分段、浏览器半体可供给、MCP 托管行写入隔离 home 补丁、`mcpScope` 在 `per-agent` / `managed` 间往返可逆，真实 home 的 `cordis.patch.yml` 逐字节未变）。④ rc.1 → rc.2 的插件 API 面逐文件比对：cli + web-app 的全部依赖包 **166 个里只有 40 个有真实改动**，本仓 import 的宿主包（`dsh-base` / `dsh-tools` / `dsh-client-ui-slots` / `dsh-web-app` / `dsh-plugin-manager` / `dsh-mcp-client` / `dsh-settings` / `dsh-system-prompt` / `dsh-credentials` / `dsh-scope` / `dsh-session-query` / `dsh-launch-environment` / `dsh-agent` / `dsh-hmr` 等）**零代码变化**；唯一与本仓相关的是 `dsh-cordis-client-runner` 的 slot 目录 **97 → 98 条、只增不减**（新增 `sidebar.right.tab.files.actions`），本仓注册的 4 个槽（`plugins.row.config` / `settings.kit.item` / `settings.plugin.item` / `sidebar.right.pane.tab`）逐字节相同。⑤ 工作区回归：`pnpm -r build` / `pnpm -r typecheck` 绿、`pnpm test` **92 files / 1484 tests** 全过；本轮只动兼容性声明与文档，未动任何插件运行行为。
  - **`0.2.1-alpha.1`（第四档基线，2026-10-03 实测）**：不改任何运行代码，只把兼容范围追加第四段（见下两条）。这一段与第三档同类，也是**显式声明**而不是修边界：`0.2.1-alpha.1` **本来就被 `^0.2.0-rc.2` 覆盖**（`>=0.2.0-rc.2 <0.3.0-0`，`includePrerelease: true` 下 `semver.satisfies('0.2.1-alpha.1', …)` 为真），但照样走完「每加一档都必须实测」的全部动作。证据：① 用 **0.2.1-alpha.1 自带的判定器**（本机全局安装里的 `dsh-app-boot`，同一次安装的 `getDshRuntimeVersion()` 报 `0.2.1-alpha.1`）对本仓 13 个条目（12 个可安装包 + `templates/hello`）逐一核对：**13/13 放行**；`node scripts/check-dsh-peers.mjs --app-boot <该安装的 @deepseek-ai/dsh-app-boot 目录>` **四档 × 13 条目全部放行**。② 隔离 `DSH_HOME` 起真宿主（复制本机 `test2` profile，`--patch` 固定端口）：**10/10 个 `@hyzyn` 插件 mounted、0 行 `disabling profile plugin row`、0 行 `skipping profile bundle`**；本机真实 `test2` profile 上再跑一遍安装期判定：`dsh plugin --profile test2 add link:<每个包>`（10 个）**全部返回 `Already up to date`、无 `incompatible-version`、不需要任何豁免**（安装前与启动时各过一次）。③ 同一宿主上的四层验收：`verify-client-ui --mode boot` **5 PASS / 0 WARN / 0 FAIL**、`--mode full` **17 PASS / 1 WARN / 0 FAIL**（10 个 `@hyzyn` 客户端 bundle 真在 Chrome 里被加载、0 未捕获异常、0 error 级控制台输出、0 失败子请求；`--mode full` 另证 **8/8 个插件的内联配置卡片都渲染出来**（`plugins.bundle.config` + 行标记 `plugins.row.config`）与设置里「插件配置」行的 8 张 kit 卡片，唯一 WARN 是沙箱里 PTY 被拒 `posix_openpt failed`，不是回归）、`verify-mcp-http` **7 PASS / 0 FAIL**（三种 streamable-http 响应模式 + 打不通时可读失败）、`verify-rss-opml` **9 PASS / 0 FAIL**（真实下载 + 导入回环 + 收尾复原）、`verify-codegraph-host-contract` **42/42 PASS**（25 条路由、POST / loopback 门禁、`/diagnose` 分段、浏览器半体可供给、MCP 托管行写入隔离 home 补丁、`mcpScope` 在 `per-agent` / `managed` 间往返可逆，且真实 `~/.dsh/cordis.patch.yml` 逐字节未变）。④ 0.2.0-rc.2 → 0.2.1-alpha.1 的插件 API 面逐文件比对：CLI 包 20 个文件里只有 `package.json` 变；本仓 import 的宿主包（`dsh-base` / `dsh-host-webserver` / `dsh-subprocess-local` / `dsh-client-locale` / `dsh-client-ui-slots` / `dsh-settings` / `dsh-session-query` / `dsh-mcp-client` / `dsh-system-prompt` / `dsh-launch-environment` / `dsh-client-ui-theme` / `dsh-headless` 等）**零代码变化**；`dsh-tools` 只改 `run_code` 的参数顺序与文案、并删掉 `./invariant` 子路径导出（本仓零引用，`index.d.ts` 逐字节相同），`evaluatePluginCompatibility` 语义等价；`dsh-cordis-client-runner` 的 slot 目录 **98 → 100 条、只增不减**（新增 `plugins.add.actions` / `shell.bottom`），本仓注册的槽全在。⑤ 运行时依赖版本漂移：这一档的宿主带 `cordis` 4.0.5-alpha.1 与 `schemastery` 3.18.5-alpha.1（前三档都是 4.0.4 / 3.18.4），但两份 tarball 除 `package.json` 外**逐字节相同**，且 app-boot 用 `Symbol.for('schemastery')` 判定原生 schema（不是 `instanceof`）；本仓的 `pnpm -r typecheck` 正是**重链到这两个新版本之后**跑的，绿。⑥ 工作区回归：`pnpm -r build` / `pnpm -r typecheck` 绿、`pnpm test` **106 files / 1644 tests** 全过、`pnpm aggregate` 无 diff；本轮只动兼容性声明、守卫与文档，未动任何插件运行行为。**未跑**：`pnpm live-smoke`（它把一次性 profile 复制到 `~/.dsh/profiles/live-smoke-*`，本轮执行环境只允许写工作区，`~/.dsh` 写入被拒；需要时在本机普通终端补跑）。
  - **`0.2.1-alpha.2`（第五档基线，2026-10-09 实测）**：不改任何运行代码，只把兼容范围追加第五段（见下两条）。这一段与第三、四档同类，也是**显式声明**而不是修边界：`0.2.1-alpha.2` **本来就被 `^0.2.1-alpha.1` 覆盖**（同一个 `0.2.1` 版本元组，预发布之间不比大小），但照样走完「每加一档都必须实测」的全部动作。证据：① 用 **0.2.1-alpha.2 自带的判定器**（本机全局安装里的 `dsh-app-boot`，同一次安装的 `getDshRuntimeVersion()` 报 `0.2.1-alpha.2`）对本仓 13 个条目（12 个可安装包 + `templates/hello`）逐一核对：**13/13 放行**；`node scripts/check-dsh-peers.mjs --with-app-boot`（自动定位到那份判定器）**五档 × 13 条目全部放行**。② 本机真实 `test` profile 上跑安装期判定：`dsh plugin --profile test add link:<每个包>`（10 个）**全部返回 `Already up to date`、无 `incompatible-version`、不需要任何豁免**；随后 `dsh --profile test --patch <端口层>` 起真宿主（runtime `0.2.1-alpha.2`）：**10/10 个 `@hyzyn` 插件 mounted、0 行 `disabling profile plugin row`、0 行 `skipping profile bundle`**。③ 同一宿主上的验收：`verify-client-ui --mode full` **18 PASS / 0 WARN / 0 FAIL**（10 个 `@hyzyn` 客户端 bundle 真在 Chrome 里被加载、**8/8 个插件的内联配置卡片都渲染出来**（`plugins.bundle.config` + 行标记 `plugins.row.config`）、设置里「插件配置」行的 8 张 kit 卡片、全局搜索命令面板往返真的有结果、终端面板 xterm 初始化完成、0 未捕获异常、0 error 级控制台输出、0 失败子请求；这一轮 PTY 没被拒，所以第四档那条 WARN 也不在）、`pnpm live-smoke`（= `live-host-smoke --bootstrap --strict`）**18/18 PASS**（两个宿主实例的授权阶梯、路由门控、工具清单、试连文案、宿主正服务的 `client.js`）——**第四档那条「未跑」在这里补上了**。④ 0.2.1-alpha.1 → 0.2.1-alpha.2 的插件 API 面逐文件比对：本仓 import 的宿主包里 `dsh-mcp-client`（MCP 托管行）/ `dsh-settings` / `dsh-credentials` / `dsh-launch-environment` / `dsh-sandbox` / `dsh-scope` / `dsh-user-approval` / `dsh-agent` / `dsh-client-locale` / `dsh-subprocess` **除 `package.json` 外逐字节相同**；`dsh-tools` 里本仓用的 `defineTool` 导出行逐字节相同，改动只有 `ToolPresentationMode` 去掉 `'both'`（本仓零使用）与 PTC 内部桥 `RunCodeBridgeOptions` 多一个必填的 `resolveWorkingDirectory`（本仓没有实现方）；客户端槽面**只增不减**（新增 `conversation.chat.flow` / `conversation.chat.reasoning.body`，零删除零改名，本仓注册的槽一个没被拿掉）；`dsh-host-webserver` 与 `dsh-web-app` 的改动都在**宿主配置面**（监听地址只收环回或具体网卡、新增 TLS 配置、`webRuntime` → `webStartup`），本仓对这些名字零引用。⑤ 运行时依赖：这一档的宿主带的仍是 `cordis` 4.0.5-alpha.1 与 `schemastery` 3.18.5-alpha.1（与第四档同一对）。⑥ 工作区回归：`pnpm -r build` / `pnpm -r typecheck` 绿——**且是在 `node scripts/link-dsh-runtime.mjs` 把本仓 `node_modules/@deepseek-ai/*` 指到 alpha.2 那套之后跑的**（即类型面就是 alpha.2 的 `dsh-tools`，不是仓里 devDeps 钉的旧档），`pnpm test` **139 files / 2420 tests** 全过、`pnpm aggregate` 无 diff。⑦ 同轮还按宿主的**升级绊线**复核了 `docs/os-consent-plan.md` §2.1 的三条事实与 picker 口径：宿主这一档**真的换了口径**（环回判定改用 `dsh-host-webserver` 的 `isLoopbackHost()`、新增 `allowsRemoteAuthorities` 一条），绊线按设计报红、复核记录写进该文 §2.1 末与 §4 第 2 条。
  - **`0.2.1-alpha.5`（第六档基线，2026-10-17 实测）**：**加档本身只改 `peerDependencies` 的范围串与文档**（本包运行代码未动）。与第三~五档同属**显式声明**：`0.2.1-alpha.5` **本来就被 `^0.2.1-alpha.2` 覆盖**（同一个 `0.2.1` 版本元组，预发布之间不比大小）。⚠️ **但它与前面几档不同——这一档带着真实的宿主行为变化进来**，「对宿主行为零差异」那句话在这里**不成立**，所以证据里多了「本仓引用面」这一项（`RELEASING.md` 的加档规则也据此补了警告）。证据：① 用 **0.2.1-alpha.5 自带的判定器**（本机全局安装里的 `dsh-app-boot`，`getDshRuntimeVersion()` 报 `0.2.1-alpha.5`）对本仓 13 个条目（12 个可安装包 + `templates/hello`）逐一核对：**13/13 放行**；`node scripts/check-dsh-peers.mjs --app-boot <该安装的 @deepseek-ai/dsh-app-boot 目录>` **六档 × 13 条目全部放行**。② 真宿主组合：`dsh --profile test --dump-config` 里 10 个 `@hyzyn` bundle 全在，**0 行 `disabling profile plugin row`、0 行 `skipping profile bundle`**（stderr 另有 2 行是该 profile 自己 `cordis.patch.yml` 里两个不存在的 entry——`devfront` / `devenv`，与本轮无关、也不是禁用行）。③ **真宿主加载**（本轮动了 preflight 会读的范围串，所以这条最要紧）：`pnpm live-smoke`（= `live-host-smoke --strict`）**18/18 PASS**——两个一次性宿主实例都跑在 `0.2.1-alpha.5` 上，授权阶梯、路由门控、agent 工具清单、宿主正服务的 `client.js` 全过。④ 本仓引用面（`0.2.1-alpha.2` → `0.2.1-alpha.5`：18 个内联包的 130 个 d.ts 里 115 个逐字节相同）：`dsh-mcp-client` / `dsh-base` / `dsh-settings` / `dsh-client-locale` / `dsh-session-query` / `dsh-sandbox` / `dsh-launch-environment` / `dsh-headless` / `dsh-user-approval` / `dsh-subprocess` 的 `lib/` **逐字节相同**；`dsh-tools` 里本仓用的 `defineTool` 未变；被删除或改签名的 `HARNESS_SOURCE_SECTION` / `addHarnessSourceSection` / `createRunCodeTool` 新增必填参 / `probeLinuxScope` 一族 / `dsh-host-webserver` 的 `get port(): number | undefined` / `dsh-credentials-local` 的 `ignoredKeys`——本仓**全部零引用或零影响**。⑤ **四条行为变化都已落进本仓**（这才是这一档真正的内容）：判定器字段名 `peers` → `requirements`（alpha.4）、顶层 `engines.dsh` 开始短路 peer（alpha.4）、凭据层级翻面（**alpha.3**）、macOS 原生 picker 换 JXA + 取消改由空 stdout 表达（alpha.5）——对应改动见 `scripts/check-dsh-peers.mjs` 头部、`packages/env` 的启动期预注入、`docs/os-consent-plan.md` §2.1。⑥ 工作区回归：`pnpm typecheck` / `pnpm build` / `pnpm aggregate` 绿、`pnpm test` **149 files / 2554 tests** 全过（该数字**含同轮另一条并行工作线**的用例；本包自己此刻是 **14 files / 328 tests**）。
    - **未跑**：本轮的 `verify-codegraph-host-contract` / `verify-client-ui` / `verify-rss-opml`——第六档的 host-contract 仍以第五档那次 **42/42** 为准，**未在 alpha.5 上重跑**。
  - **`0.2.1-rc.2`（第八档基线，2026-10-19 实测）**：**纯显式声明，本包运行代码未动**（`lib/` 产物零 diff）。`0.2.1-rc.2` **本来就被 `^0.2.1-rc.1` 覆盖**（同一 `0.2.1` 版本元组，预发布之间不比大小），官方判定器实测放行。逐文件比对（rc.1 装临时树 + rc.2，304 个宿主包逐个 `lib/`）：**有差异的只有 9 个文件**，且逐个查清后**没有一处影响本仓**——纯版本串 4 处（`dsh-client-modules` 的 commit hash、`settings-account` / `settings-general` / `sidebar` 的 `0.2.1-rc.1` → `rc.2`）；`dsh-web` 把 `searchProvider` / `fetchProvider` 改成 `.volatile()`（设置页可热改，本仓零引用这两个字段）；`dsh-web-search-deepseek` 请求多带 `thinking: {type:'disabled'}` 且报错文案改指向新设置页；`client-ui-settings-web-search` 新增「Use the new Web Search API」开关（本仓不碰 `dsh-client-store`）；`dsh-cordis-client-runner` 的 slot 占用表新增官方 `deepseek-model-label` 一条（本仓注册的槽未被动）。`cordis` / `schemastery` 仍是 4.0.5 / 3.18.5（与第六、七档同一对）；包集合只多两个宿主自带包（`dsh-client-ui-deepseek-model-label-1017` / `dsh-web-deepseek-api`），不改变本仓 import 的任何包。证据：① `node scripts/check-dsh-peers.mjs --app-boot <宿主 dsh-app-boot>` —— **八档 × 13 条目全部放行**（判定器自报运行时 `0.2.1-rc.2`）；② 真机：`live-smoke` 18/18、`verify-issue-13-14`（logs-test）16/16，均无回归。
  - **`0.2.1-rc.1`（第七档基线，2026-10-17 实测）**：**纯显式声明，本包运行代码未动**（`pnpm build` 之后 `lib/` 产物零 diff）。`0.2.1-rc.1` **本来就被 `^0.2.1-alpha.5` 覆盖**（同一个 `0.2.1` 版本元组，预发布之间不比大小），官方判定器实测放行。它与第六档**性质相反**：不是「有变化但没影响」，而是逐文件比对下来**根本没有变化**——两档各装一份完整依赖树（各 304 个包）逐 `lib/` 比对，本仓 import 的 14 个宿主包（`dsh-tools` / `dsh-mcp-client` / `dsh-credentials` / `dsh-credentials-local` / `dsh-client-locale` / `dsh-base` / `dsh-web-app` / `dsh-user-approval` / `dsh-settings` / `dsh-session-query` / `dsh-sandbox` / `dsh-launch-environment` / `dsh-headless` / `dsh`）**逐字节相同**，判定器 `dsh-app-boot` 的 `lib/` 同样逐字节相同；整套里只有 5 个客户端产物不同，且**差异只有版本字符串**（`settings-general` / `sidebar` / `settings-account` 里的 `0.2.1-alpha.5` → `0.2.1-rc.1`、`dsh-client-modules` 里的 commit 哈希、`dsh-web-frontend` 只有 `.map`）。`cordis` / `schemastery` 仍是 4.0.5 / 3.18.5（与第六档同一对）。证据：① 用 **0.2.1-rc.1 自带的判定器**（`dsh-app-boot`，`getDshRuntimeVersion()` 报 `0.2.1-rc.1`）对本仓 13 个条目逐一核对：**13/13 放行**；`node scripts/check-dsh-peers.mjs --app-boot <该判定器目录>` **七档 × 13 条目全部放行**。② **真宿主加载**（本轮改了 preflight 会读的范围串，所以这条最要紧）：在**隔离的 `DSH_HOME`**（临时目录，真实 `~/.dsh` 全程只读）上从自带 `web` 模板新建 profile、`dsh plugin --profile probe add link:<10 个包>` 全部装上且**无需任何豁免、无 `incompatible-version`**，随后 `dsh --profile probe --no-open --port <空闲口>` 起真宿主（runtime `0.2.1-rc.1`）：**10/10 插件 mounted、0 行 `disabling profile plugin row`、0 行 `skipping profile bundle`**（`dsh-tty` 的挂载证据是 `agent tools registered` 一行，19 个工具）。③ 主题令牌快照按纪律用 rc.1 宿主重新生成：`--check` 与宿主**逐字一致（403 个 token）**，重新生成后快照里只有 `dshVersion` / `generatedAt` 两个字段变化。④ 工作区回归：`pnpm typecheck`（在把本仓 `node_modules/@deepseek-ai/*` 指到 rc.1 那套之后跑的）、`pnpm build`、`pnpm aggregate` 绿，`pnpm test` **152 files / 2580 tests** 全过（含 os-consent 的升级绊线与两条 picker 反例——它们现在跑在真 rc.1 宿主上）。
    - **未跑**：本轮的 `verify-client-ui` / `verify-rss-opml` / `verify-codegraph-host-contract` 与 `pnpm live-smoke`——host-contract 仍以第五档那次 **42/42** 为准。

  - **`0.2.1-rc.3`（第九档基线，2026-10-24 实测）**：**纯显式声明，本包运行代码未动**（`lib/` 零 diff）。`^0.2.1-rc.2` 展开是 `>=0.2.1-rc.2 <0.3.0-0`，官方判定器实测放行。逐文件比对（rc.2 装一份完整依赖树，306 个宿主包逐个 `lib/`）：**本仓 import 的 22 个宿主包 `lib/` 全部逐字节相同**，17 个有差异的包全部落在本仓零引用面内；`cordis` / `schemastery` 仍是 4.0.5 / 3.18.5；包集合 306 → 306（只多一个宿主自带包 `dsh-client-ui-entry-customization`，少掉的 `dsh` 是打包形状差异，不是删除）。⇒ 对宿主行为零影响，加档只是把「适配到哪一档就写到哪一档」落全。逐条证据另见 `scripts/check-dsh-peers.mjs` 头部 cohort 说明（本条此前只落在那里，而 README 指向本文件——2026-10-27 补入）。
  - **`0.2.1-rc.4`（第十档基线，2026-10-27 实测）**：**纯显式声明，本包运行代码未动**（`pnpm -r build` 之后 `lib/` 与 `client.js` 产物零 diff）。`^0.2.1-rc.3` 展开是 `>=0.2.1-rc.3 <0.3.0-0`，官方判定器实测放行；把**九段**范围直接喂给 rc.4 的判定器也判 compatible——**新段没有移动任何接受/拒绝边界**。逐文件比对（rc.3 装完整依赖树 + 本机 rc.4，307 个宿主包逐个 `lib/`）：本仓引用的 27 个宿主包里 **26 个 `lib/` 逐字节相同**；唯一有改动的 `dsh-mcp-client`（`lib/index.js` +148 B）是 MCP **resources** 处理器新增 `getServerCapabilities()?.resources !== undefined` 守卫，而本仓只用 `mcp__*` 的 tools、对 `resources/*` 全仓零引用。客户端槽目录 **103 → 103**、顺序一致、0 增 0 删 0 改名（本仓注册的槽全在）。`cordis` / `schemastery` 仍是 4.0.5 / 3.18.5，且两个包**整个目录逐字节相同**；包集合 307 → 307。⇒ 对宿主行为零影响。真机：本机 `test` profile / 端口 3082 起宿主，**10/10 个 `@hyzyn` 插件 mounted、0 行 `skipping profile bundle`、0 行 `disabling profile plugin row`**；主题令牌快照重新生成后 403 个令牌与 rc.4 逐字一致（只有 `dshVersion` / `generatedAt` 两个元数据位变化）。另有 `pnpm live-smoke`（模板 profile 就是本机 `test`）**18/18 全部 PASS**——两实例（无授权 / 带授权）各起在一次性端口上，授权阶梯、路由门控、agent 工具清单与宿主正在服务的 `client.js` 全打了一遍。**未跑**：`verify-client-ui` / `verify-rss-opml` / `verify-codegraph-host-contract`（本轮无任何代码改动，沿用既有记录）。
## P0：agent 侧改 per-agent scoped MCP 挂载 ✅

一次性能解决五个问题，是唯一改到「上限」的项：

1. 现在多项目是**时分复用**，靠工具入参 `projectPath` 补；
2. `followSession` 的每次切换 = 重写补丁文件 → 热加载 → 重建 MCP 连接（`apply()` 内 settings 分支与回落分支里的 `syncMcpRowOnDisk()`），重且有时序；
3. 两台 `dsh web` / 两个 profile 并发写同一个文件时，CAS 只保证「不丢行」，**不保证语义**（最后写者赢 `cwd`）；
4. 跟随由**浏览器半体**上报（`/follow` 上报），宿主侧没有 GUI 页面时不生效；
5. 每个 agent 只该看到一个 `mcp__codegraph__codegraph_explore` —— per-agent 挂载天然满足；反之
   「多服务器行各挂一个项目」会把工具名炸成 `mcp__codegraph-a__explore`，破坏单工具约定，**不走那条路**。

**已实现**（2026-09-22，完整方案与实测见 [docs/p0-plan.md](./docs/p0-plan.md)）：`agent/created` 时在
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
  性能实测（延迟、冷启动、内存）见 [docs/p0-plan.md](./docs/p0-plan.md)「四之二」；
- ~~`dsh.engines` 下限需重新标定~~：机制依赖 `dsh-tools` 的 `view(scope)` 分层与 `agent.ctx`
  的 scope 语义，本机 `0.1.6-alpha.2` 已验证；三平台仍只有 CI 矩阵（无真机）；
- 收益只覆盖「多项目并发」这一窄场景（**实测时间占比 3.1%**，峰值 4 个项目），因此
  当时**默认值保持 `managed`**，由用户显式开启——属口味问题而非明显对错。
  **这条判断 2026-10-24 被推翻**：默认值改成 `'per-agent'`。推翻它的不是那 3.1%，而是
  **披露面**——managed 那行建在根 scope 上，于是家目录 / 无索引仓库里开的会话同样继承
  `mcp__codegraph__*`，工具在、语义却随全局 cwd 漂移；而 per-agent 的「没有索引就不挂」
  正好是「没有索引的会话不该看见这个工具」这条要求的实现。性能代价没变（仍是每会话一个
  ~40MB 子进程），回滚 = 显式写 `'managed'`。

**退一步的最小版本**（不动架构时至少做这三条）：写入去抖 / 合帧；`followSession` 加跨进程
owner 判定；会话目录无有效索引时不写盘（现有行为，保持）。

**明确不做（2026-10-24 审计结论）**：per-agent 挂载**不顺带** `tools.restrict` / `presentAs`。
本包只挂 1 个工具（实测 codegraph 1.6.0 的 `tools/list` 只有 `codegraph_explore`），
restrict 没有任何收敛收益；而「前缀 / 通配」的 restrict 语义本仓从未验证过，往判据里
引一个未验证的用法比不做更危险。`src/scope.ts` 保持「只决策 + 挂载 + 回收」三件事，
不持有工具面。

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

**② 拿真实历史量过一遍（同一轮做的，见 [docs/adoption-audit.md](./docs/adoption-audit.md)）**：不等「跑一天」，直接解码
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

> ⚠️ **更正（CG66，2026-10-10）**：上面这次核对只核到「回调有**两个参数**」，**漏了事件自身的字段层级**——
> 第二个参数是 `SessionEvent` **信封** `{ type, seq, time, data }`，`tool/call` 的工具名在 `event.data.name`。
> 监听器当时读的是顶层 `event.name`（**不存在的字段**），于是每一次真实调用都命中「畸形事件，宁可少记」的
> 守卫被丢掉：仪表在真机上恒为 0，而 `type` **恰好在顶层**，所以既不报错、也没有可疑数字——静默归零。
> 本机实测：宿主跑满 3.8 小时、会话一直在调工具，`/metrics` 的 `summaries` 仍为空、连 `other` 都是 0。
> 修法（读 `event.data?.name`，顶层留兜底）与回归用例（派发改用真实信封 `toolCallEvent()`）见
> [DEFECTS.md CG66](./DEFECTS.md)。**教训**：核对订阅面时要连**载荷层级**一起核，并让测试用真实信封而不是
> 手工造的扁平对象——否则守卫与被守卫的代码共享同一个错误假设。

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



### 仍剩的项（P2 / P3）

- **P2 照本文「缺陷审计时点列出的原始待办」一节走**（那批条目比我列得全）：CLI 面补全、查询参数面板、
  **已索引项目列表 + 一键切换**（单服务器既成事实下最实用的补偿）、遥测提示、卡片 i18n、
  真机 `integration.mjs` / `*-smoke.mjs`。
- **P3 债**：~~CG32–CG34~~ ✅ 已关闭（见「已完成」）；~~宿主版本基线~~ ✅ 见「已完成」（CG42）；
  ~~browser 半体纯逻辑~~ ✅ 见「已完成」（P3-b）。**仍剩**：依赖 DOM 的那部分（CG08 样式引用计数、
  CG16 清详情、CG17 渲染分支）要覆盖必须引入 react + jsdom，或走 `scripts/preview-card.mjs` 的真渲染
  夹具——DEFECTS.md §4「冻结记录」里那份「补记」已明说刻意没加 devDependency。

### 测试稳定性：CG65 那条回归在重负载下的间歇红（2026-10-03，**产品源码零改动**）

**现象**：`test/cli-route.test.ts` 的「CG65：探测超时不再判死——按重试梯子自动补探」在重负载下红，
历史失败均 **15s 超时**（栈指向第 708 行的 `waitFor(…, 15_000)`），实测本机 6 份并发全量套件里 3 份红。

**根因（墙钟）**：用例要求「第 3 次尝试**成功**」，却把单次探测超时卡在 `probeTimeoutMs = 600`。
实测第 3 次（本该「立刻成功」）的耗时 **54ms（空载）→ 559ms（重负载）**，已贴到 600ms 判定线；
一旦它超时，梯子按「连续 3 次超时」收敛成 `available = false`，公告**永远不注入**，`waitFor` 必然耗尽
预算。与 tty D95 同型：**测试在赌「一个真子进程能在 600ms 内起来」这个墙钟性质**。

**改法**：那条用例的 `probeTimeoutMs` 600 → 3000（成功那一次留 5 倍余量），
**被验语义一字未变**——前两次仍挂满 9s 必然超时（`flakyCli` 里 `setTimeout(()=>{},9000)`），
梯子照样要补探两次，第 710 行的 `attempts === '3'` 断言照旧成立。
**同族另一条（梯子穷尽 → 收敛成 false）刻意保持 600 不动**：它要三次都超时，且第 736 行断言
`timeout after 600ms` 文案正是在验那个数字。
**为什么不动产品**：`probeTimeoutMs` 本来就是 `tuning` 接缝（`mountFull(cli, {}, { … })`），
放宽它只影响测试里这一次探测允许多慢，不改「超时了该怎么走」这条被验的语义。

**门槛**：重负载（6 份并发全量套件 + 2 忙循环，即让它红过的那个负载）**6/6 份全绿**；
全量 109 文件 / 1698 用例绿。

### 测试稳定性：`cli-route.test.ts` 在 Windows 上的**负载敏感**（2026-10-13，**产品源码零改动**）

**现象（CI）**：`main` 的 run `38328345671`（windows-latest）红过一次——
`P1 索引生命周期：unlock 与过期信号 > unlock：也接受不存在的锁（CLI 幂等，exit 0）` 报
`AssertionError: expected 500 to be 200`（`test/cli-route.test.ts:1384`），同一次运行的其余腿与其余
用例全绿，**rerun 即绿**（4/4 腿 success）。

**这条用例为什么可能 500**：`unlock` 路由把 `run()` 的任何失败都映射成 500，而 `settleCliRun`
只在 `timedOut` 或**子进程退出码非零**时判失败（spawn 的 `error` 事件同样落到 500）。用例自己的
stub 只 `console.log` 一行、必然 exit 0，所以那个 500 只能是「`cmd.exe` → `node` 这条 shim 没跑成」。
**它不是超时**：该用例在日志里只花了 **148ms**（紧邻两条 unlock 用例是 211ms / 138ms），
而 `DEFAULT_CLI_TIMEOUT_MS` 是 60s、整个文件也只跑了 16.7s。

**真机复现（Win11 ARM64，2026-10-13）**：同一份文件 **6 份并发**跑 5 轮 → 30 次子进程里
**10 次失败**，但失败形状与 CI 那条**不同**：全部是 vitest 的 `Test timed out in 20000ms`
（或「探测尚未落地」类断言），分布在约 8 条互不相关的用例上（`unlock` 三条、`CG54 /diagnose`、
query 族的 argv 校验、`CG27`、`CG65` 各若干）。**共同点**：每条断言都建立在「一个真子进程
（`cmd.exe` → `node`）能在某个**墙钟**预算内起来并跑完」之上（20s 用例超时 / 15s `waitFor` /
3s 探测档），而这些启动在负载下会慢一个数量级——与 CG65 同型，只是预算落在**用例超时**那一层。
（同一次复跑里 CG65 自己也在 3s 档上红了一次：说明「5 倍余量」在 4 核 ARM64 + 6 并发这个负载下
仍不够，见上一条的门槛只覆盖了它当年红过的那个负载。）

**已排除**：「刚写出来的 `.cmd` 立刻执行会失败」（全新 stub + 立刻 spawn，**400 次 / 4 并发 → 0 失败**），
所以不是「新文件还没落稳 / 杀软还没扫完」这一类。

**未定性**：CI 那一次 148ms 的 500 是 spawn 的 `error` 事件，还是子进程非零退出——两者在测试里
**形状不可区分**（都只表现为 500）。**已加的最小诊断**（2026-10-13）：该用例断言前会打印
`capture.body`（`failCli` 已经把原因写进响应体，只是此前没人打印），下次再红就直接读得到子进程
说了什么；**判据未变**（仍然断言 200），只在失败时多一行 stderr。

**边界**：这是**测试 / CI 稳定性**问题，不是产品缺陷——「CLI 调用失败 → 500」正是设计意图，
所以它**不进 `CGxx` 产品缺陷台账**，留在本节。

**可选修法**（**①②③ 与诊断均已于 2026-10-17 落地**，①仍不适用见下）：

- ① 给本文件里 spawn 密集的用例放宽**用例超时**（`it(…, 60_000)` 或文件级 `testTimeout`）——
  「真子进程要起来」不是被验的语义。**只对超时形状有效**：CI 上那两次红拿到的都是 500 形状
  （约 148ms，**不是超时**），所以它收不了 CI 这条。
- ② 让这个文件与全量套件分开跑 → **2026-10-17 也落地了**：CI 的 Windows 腿**先单独跑一遍**这个
  文件（那一轮它独占机器），常规那轮再用 `env: DSH_SKIP_CLI_ROUTE=1` 把它排掉（`vitest.config.ts`
  的 `laneExclude`）。两个实现细节都是被守卫逼出来的：**排掉它用的是 vitest 自己导出的
  `configDefaults.exclude`**（`--exclude` 是**覆盖**不是追加，手抄一份默认列表会随版本静默腐烂、
  漏一项就可能去收依赖树里的测试）；**开关只能走 `env:`、不能写成行内前缀**（判据 3 比的是
  `run:` 的**整行**，`pnpm test` 必须与 release.yml 逐字一致）。手动指定 `test_filter` 的那条道
  保持原样（那一步带 `inputs.test_filter == ''`）。
- ③ 给 windows 腿更多预算 → **2026-10-17 落成「CI Windows 腿降并发」**：`vitest.config.ts` 的
  `workerCap`（`maxWorkers: 2`，只在 `CI && win32` 生效，本机与另两条腿一字不变；两支由
  `scripts/test/vitest-config.test.ts` 钉住）。**为什么落在 vitest 配置而不是 `ci.yml`**：两条
  workflow 里同一个入口的命令必须**逐字一致**（`scripts/ci-script-truth.mjs` 判据 3 防的正是
  「某一侧被偷偷加参数」），给 `pnpm test` 挂个 flag 会当场判成 `ci.crossWorkflow.mismatch`
  （release.yml 那边是裸的）；worker 数本来也是运行器的事。**这是降低概率，不是治本。**
- **同轮补的诊断（2026-10-17）**：`test/cli-route.test.ts` 的 `call()` 现在把**每一个 500 的
  响应体**打出来——500 的两种成因（spawn 的 `error` 事件 / 子进程非零退出）**区别只写在响应体
  里**（`settleCliRun` 会把 stderr 原文拼进 error），而此前只有 `unlock` 那一条用例带这行诊断，
  所以 CG27 那次再红时日志里什么都没有、又一次定不了性。**判据一字未变**，只是失败时多一行
  stderr。
  **至此 ①②③ 都已落地**；若仍红，**先读那行响应体**（它把 spawn error 与子进程非零退出分开
  了），再按证据定下一步——不再有「猜一个修法」的余地。

## 项目级 ROADMAP 第 4 项（`isConcurrencySafe`）与本包的关系：**不成立**

2026-09-25 复核：`packages/codegraph/src/**` 里**一个 `tools.register` 都没有**——本包只做
两件事（往 systemPrompt 注入公告 / usage 段、维护 `~/.dsh/cordis.patch.yml` 里的 MCP 托管行），
工具面全在别人那儿。

模型看到的 `mcp__codegraph__codegraph_explore` 由宿主的 `@deepseek-ai/dsh-mcp-client` 注册
（per-agent 挂载时也是它自己往 agent scope 里注册），而那份声明**不在本仓**；插件侧也够不到
已注册的工具（没有改已注册条目的公开 API）。**结论：要它并发安全只能改上游**，本仓如实记录，
不假装做了——见[项目级 ROADMAP](../../ROADMAP.md) 第 4 项。

## 建议开工顺序

1. **S 级两件先做**（注入索引门禁 → 诊断包）：✅ 已完成（见「已完成」一节）。
2. **再做采纳率仪表**：✅ 已完成（见「已完成」一节），拿到自己项目里的真实数字。
3. **拿着数字决定要不要动 P0 架构**：若 explore 采纳率本就很高，per-agent 挂载的收益只剩「多项目并行」
   与「去掉写盘链」；若使用场景本就是一项目一会话，P0 可降级。
4. **P0 与 P1 的索引生命周期不要同时开工**：两者都要动 `apply()` 里的 effect 顺序，容易互相踩。

## 复核门槛

改完任一项后，本包的最低门槛（当前全绿，见上方「基线」表的 **2026-09-25 复测**行）：

```bash
npx tsc --noEmit -p packages/codegraph/tsconfig.json
npx vitest run packages/codegraph
npx vitest run                                   # 全仓，防跨包回归
pnpm -r build && git diff --exit-code -- 'packages/*/client.js' ':(glob)packages/*/lib/**'   # 产物 = 源码闸（CG28）
node scripts/check-dsh-home.mjs                  # 两条判据：① DSH_HOME 推导只允许一份（CG35，秒级）；② 整轮测试跑在**空的哨兵 home** 上、跑完该目录必须还是空的（CG68 补记，会重跑一整轮 vitest，本机 25s）
```

> ⚠️ **`lib/` 那半边必须带 `:(glob)`**——pathspec 的坑、实测命中数与「pre-commit 已正确、CI 未正确」
> 的现状差异，见 [conventions.md § 真机脚本与 CI 接线](../../docs/conventions.md#真机脚本与-ci-接线)。本次**不改 CI**。

涉及宿主事件面（P0 / P1 仪表）的改动，除单测外需要一次真机复跑：起 `dsh web`，在一个已索引仓库
里开两个会话，确认两个 agent 各自拿到自己仓库的结果、`tool/call` 计数正确、退出后无残留
`codegraph serve --mcp` 进程。

**P0 已把这条「手工复跑」尽量固化成脚本**（2026-09-22 补齐）。原先只有前两层，第三层是真缺口：

| 脚本 | 覆盖 |
| --- | --- |
| `scripts/verify-codegraph-agent-scope.mjs` | 机制（最小 Cordis 根，假 agent） |
| `scripts/verify-codegraph-host-contract.mjs` | 路由 / 开关 / 托管行挂起恢复（真宿主） |
| `scripts/verify-codegraph-agent-integration.mjs` | **集成**：真插件 + 真 `AgentRegistry` 驱动的真 `agent/created` |

补第三层的理由：当时两个脚本全绿，却都**证明不了「用户开会话时 MCP 真的挂上了」**——机制脚本用假
agent，宿主脚本那个宿主里没有 agent 被创建（每轮 `/agents` 都是 `mounted=0`）。而 P0 的全部价值就
在那条路径上。仍然**不能**被脚本替代、只能手工确认的：GUI 里点开卡片看开关与「生效中」文案、
以及两个真实会话各自给出自己仓库的结果（可以用 `preview-card.mjs --per-agent/--fallback` 离线看前者）。
