# @hyzyn/dsh-codegraph 缺陷编号字典

> **这份文件是代码注释的编号字典，不是审计报告。**
>
> `src/` / `client-src/` / `test/` / `scripts/` 里带 `CGxx` 的注释，含义是「这段代码为什么
> 长这样」，编号的出处就是本文。拿到任意一个 `CGxx`，直接查 [§1 编号索引表](#1-编号索引表)。
>
> **本包不拆「索引 / 字典」两张表**：本包的索引行历来一行同时带症状与修法（`修复` 列），
> 没有 docker 那样的独立「修复记录摘要」节可拆；且原表没有「涉及文件」列（补一列就得靠猜，
> 会发明事实）。所以 **§1 的「修复 / 设计意图」列就是意图字典**。理由与时点见 §4。
>
> **编号是硬契约**：`CG01–CG73` 是 `packages/codegraph` 内部序列，与 docker / tty 的 `Dxx`
> **不共享**；跨包引用请写「codegraph CG02 / docker D03」。新缺陷接在 `CG73` 之后，
> **不得重号、不得回收空号**——源码里已有注释指向它们。

> **本文不含**：逐条 postmortem 的完整原文、独立验收复跑记录、原批次计划。
> 它们冻结在自己那一版提交里，见 [§4 冻结记录](#4-冻结记录被移出正文的内容在哪)。

## 维护规则

> **通用条目已上收到 L0，本块只留指针**（同一条规矩原先逐字抄在三份 `DEFECTS.md` 里，改一处
> 漏两处）。条目编号保持不变，各处「维护规则 N」的引用继续有效；**包特有的东西不在上收范围**
> ——本文件开头的「本包不拆索引 / 字典两张表」自述、下面的 ⚠️ 标注都留在原地。

1. **新缺陷只做两件事** → [conventions.md § 编号规范 硬规矩 7](../../docs/conventions.md#编号规范)。
2. **索引表的归档判据** → [同上，硬规矩 8](../../docs/conventions.md#编号规范)。
3. **索引表的写入纪律** → [同上，硬规矩 4](../../docs/conventions.md#编号规范)。
4. **阈值 / 口径 / 基线数字只增不改** → [conventions.md § 文档分档 三条纪律第 3 条](../../docs/conventions.md#文档分档)。

> ⚠️ **标注（本次未擅改）——本次改动涉及的四处口径问题：**
>
> 1. **原「第二轮（评审波）：CG30–CG38」的标题与自己的内容不符**：那张表实际收录到 `CG49`
>    （含 CG39–CG49，由后续几轮陆续追加），标题停留在最初那 9 条。本次按编号合并成一张表，
>    标题错误随之消失，**原章节标题照录于此**：`## 第二轮（评审波）：CG30–CG38`。
> 2. **`CG15 追记` 原本浮动在 blockquote 之后**（不紧贴任何表），看起来像正文里的一条游离表格行；
>    本次并入 §1 并按编号落位。它与 `CG15` 是**同一编号的补充记录**，不额外计入「已修」。
> 3. **基线数字多档并存，未合并**：本文 §3 记 `vitest 110 tests / 5 files`、全仓 `618 / 40`（0.4.2 时点）；
>    第三轮段落记 `317 tests / 14 files`；[ROADMAP.md](./ROADMAP.md) 的「基线」表记 `202 / 10`、全仓 `779 / 48`。
>    四组数字出自四个时点，**原样保留**。
> 4. **待办与 ROADMAP 的口径不一致**：本文原「待办 / 路线图」一节的 8 项已迁入
>    [ROADMAP.md](./ROADMAP.md)，而 ROADMAP 的「已完成」一节把其中多数标为 ✅。
>    **两边原文都保留**，不替任何一边下结论。

## 现状

**已修 70 / 已关闭 3 / 待修 0**，编号至 `CG73`。逐条见 §1；未做项见 [ROADMAP.md](./ROADMAP.md)。

**已修 70 / 已关闭 3 / 待修 0**（CG01–CG29 + CG30/31/35/36/37/38 修于 0.4.2；CG39–CG49 修于其后一轮；
CG50–CG62 修于上一轮；CG63（DSH 0.1.7-rc.1 的 settings 服务迁移）修于上一轮；CG64（客户端字面星号）修于上一轮；
CG65（探测超时被判死 + 启动争抢打穿单次超时，外部 issue）修于上一轮；CG66（采纳率监听器把工具名读在事件**顶层**，
真机零计数）修于本轮；CG67（`[]` 空根被当成可追加前缀，写出非法 cordis.patch.yml）修于本轮；
CG68（测试未隔离 `DSH_HOME`，`pnpm test` 改写用户真实补丁）修于上一轮；
CG69（apply 期一次抽样就把 per-agent 永久退回 managed，重载后新建会话全都没有 `mcp__codegraph__*`）修于本轮；
CG70（托管行写机器级共享层，同机多 profile 互改且静默）修于本轮；
CG71（挂起留下的 `- insert: []` 占位在恢复时不清，文件回不到原样）修于本轮；
CG72（CG67 在「除 `[]` 外没有条目」时把合法文件写成纯注释，首启即写坏）修于本轮；
CG73（验收脚本往全新 profile 的模板 `[]` 后面追加托管块，干净 profile 的契约验收起不来）修于本轮；
CG32–CG34 **因原文从未随附而关闭**，不再挂账）。索引表的「修复」列一句话记录改法与落点；行号已漂移，定位用
`grep -n` 找符号（`locateIndex` / `locateCwdEdits` / `readPostBody` / `runViaSpawn` /
`ensureStyle` / `installSessionReporter`）。代码里带 `CGxx` 注释的位置就是对应修复点，
改到相关代码时请先读那里的注释。

> **数字口径（原文照录）**：`已修 = 表内去重编号数 − 已关闭数`，实测复现过历史每一档
> （`dd3de493` 35、`1dc45292` 40、`7b24ce2b` 41、`79658a8f` 42）。当前 73 − 3 = **70**。
> 一处易错点：`CG15 追记` 是**同一编号的补充记录**（表格里多一行），不额外计入「已修」——
> 按行数算会多 1，按去重编号算才对。P0 那轮我按「加了 1 条却 +2」写成了 44，已更正。

> **CG46**（P0 实测时新发现并已修）：把上游 CLI 自己的**常驻 daemon** 误判成「我们没回收的
> 进程」。任何按 cwd 枚举 `codegraph serve --mcp` 的诊断都会看到**两个** pid——我们 spawn 的
> 那份会随 dispose 退出，而 CLI 自己 detach 的 daemon（注册在项目 `.codegraph/daemon.pid`）
> 刻意长活。第一版验证脚本因此假失败了一次。修法：按 `daemon.pid` 排除后再断言。

审计时点的「好消息」仍然成立：**没有远程可达面**。kit 的 `isLoopbackRequest`
（`packages/kit/src/http.ts:51-71`）覆盖全部 14 条路由（新增 `/cancel` 同样过这道门禁）。
> 0.4.2 之后新增第 15 条 `/diagnose`（只读，走同一个 `guard`），同样过这道门禁——本句的
> 「14 条」是审计时点的数字，保留原样不改。剩余权限边界是「本机任意进程可驱动」——CG07 把任意字符串挡住了，但本机进程仍可上报
一个真实存在的已索引目录；这是 loopback 模型的固有边界，不是缺陷。

## 1. 编号索引表

> 一行一条，按 `CGxx` 编号升序（原来分三张表、按发现波次排列；合并后不必先知道「第几轮」才能查）。
> 严重度（P0–P3）**已按维护规则 4 移出**：它只描述「当年多重」，不参与「这段代码为什么长这样」。
> 原始分档（P0×1、P1×12、P2×16、P3×31，另 CG32–CG34 为 `—`）可从 §4 的版本取回。

| CG | 症状（一句话：当年坏了什么） | 修复 / 设计意图（这段代码为什么长这样） |
|---|---|---|
| CG01 | POST body 畸形/超限时静默改用**默认项目**执行 sync/index/init | 六条 POST 路由统一走 `readPostBody`：`readJsonBody` 返 `undefined` 即 400（`/follow` 原有写法推广到全部） |
| CG02 | 索引判定只看本目录，与 CLI 的向上解析分叉 → monorepo 子目录 followSession 永久回落、default-path 回 400、卡片自相矛盾 | 新增 `locateIndex()`：向上走祖先（git 根止步），命中根作为 `projectPath`；`effectiveProjectPath` 与 `/default-path` 绑定**根**；子目录 `/init` 回 409 |
| CG03 | 重写 dsh-mcp 区块是有损往返：override 形状与注释被静默删除 | `locateCwdEdits()` 定点只改 codegraph 行的 `cwd:` 一行（含补插），区块内其余字节不动；flow style 定位不到才退回整块重写 |
| CG04 | 与 dsh-mcp 并发写同一个 cordis.patch.yml 无 CAS，交叠即丢行 | `syncMcpRowOnDisk` 盖章复核（mtime+size → 读 → 算 → 复核，≤3 次重读后强写），与 dsh-mcp 的写前复核对偶 |
| CG05 | 超时/取消在 POSIX 上没兜底：killProcessTree 是 no-op、无 /cancel、不监听断连 | 运行器统一成 spawn（POSIX `detached` 组长）；SIGTERM → 3s 清理窗 → SIGKILL；断连接线（CG30 修正为 res close）；新增 `POST /cancel` + 卡片「取消」按钮；kit 侧 killProcessTree 支持 POSIX（有真机进程组测试） |
| CG06 | 区块解析失败被当「没有区块」→ 追加第二个区块 → serverName 撞名整体加载失败 | `parseBlockRows` 返回 `{ rows, error }`；任何区块解析失败即拒绝写并报原因；空块/被清空时把行**插进现有区块**（行编辑，不再造第二个块） |
| CG07 | `/follow` 对上报路径零校验却立刻落盘改 MCP cwd | 非空 path 先过 `directoryError`（400）；索引有效性仍由 `locateIndex` 现算。loopback 内「本机进程可上报真实目录」是模型固有边界，记录在案 |
| CG08 | 卡片 CSS 模块级单例：任一实例卸载即 remove，另一张卡片全裸 | `ensureStyle`/`releaseStyle` 引用计数（卡片 useEffect 挂钩），减到 0 才摘节点；apply 里全局注入/摘除的旧 effect 移除 |
| CG09 | query/callers/callees/impact/node 位置参数无 `--` 终止符：`-h` → exit 0 + help → 卡片显示「没有结果」 | 五条路由位置参数前统一补 `--`（argv 快照测试钉住） |
| CG10 | `limit` 零校验：`-1`/超大值 exit 0 + `[]`（静默空结果）；路径不存在也静默空 | `positiveIntParam` 校验（`limit` 钳 10000；`depth` 只挡垃圾值，上限留给 CLI 自己夹）；全部 GET CLI 路由先过 `directoryError` |
| CG11 | 状态面板忽略 CLI 的过期信号（reindexRecommended / builtWithVersion / 提取器版本 / worktreeMismatch） | 卡片 `staleReasons()` 汇总四字段（顶层与 `index.*` 嵌套都读）→ 面板警告行 + 点名「重建索引」 |
| CG12 | 托管行不校验 cwd 还在；项目被删后坏行长期留着且不可见 | `McpSyncStatus.cwdExists`（每次快照现算）+ 卡片「⚠ cwd 目录已不存在」 |
| CG13 | `~/.dsh` 缺失时挂载期抛错整插件起不来；`DSH_HOME=~/x` 写的与 loader watch 的不是同一文件 | kit `dshHome()` 归一化（`~` 展开 + resolve，与 loader 同口径）；`syncMcpRowOnDisk` 包 try/catch，失败显式报错并把原因写进状态 note |
| CG14 | `enabled:false` 早退时不撤销托管行，而卡片（唯一撤销入口）已消失 | 早退分支先跑一次 `manageEnabled:false` 的同步再 return |
| CG15 | 会话上报失败永不重试（`lastSent` 写在 fetch 前） | `lastSent` 只在成功/4xx 后落位；网络错/5xx 指数退避重试（1s→30s） |
| CG15 追记 | 修复波把「4xx 一律视为明确拒绝、不再重试」定得过宽：宿主启动期路由未挂上时 `/follow` 得 404 → 永久放弃 | 404 与 5xx 同为瞬态，一并退避重试；其余 4xx（400 目录不存在等）保持记值不重试 |
| CG16 | `loadSymbol` 失败不清 `detail`：新符号标题配旧符号的 callers/callees | 进函数先 `setDetail(null)` |
| CG17 | 关系列表静默截断 30 条 | 截断时显示「已显示前 30 条，共 N 条」 |
| CG18 | 冲突判定要求 name 精确等于 `@deepseek-ai/dsh-mcp-client`，换包名检不出撞名 | `isCodegraphServerRow` 只按 `config.serverName` 判定 |
| CG19 | `findBlock` 宽泛 substring：开始标记被删时孤立结束标记被当块头 | 开始行必须含 startKey **且不含** endKey；配套测试（孤儿标记 → 新建分支 + 幂等） |
| CG20 | `INDEX_DB_SUFFIX` 注释与事实不符（`.db-wal`/`-shm` 不以 `.db` 结尾） | 注释纠偏；判据保持后缀匹配（上游改主库名仍兼容） |
| CG21 | reprobe 无并发去重；卡片两个动作共用一个忙态互相禁用 | 服务端 `probeInFlight` 复用同一 Promise；卡片 `reprobing` 独立忙态 |
| CG22 | 一切带 signal 的失败都报成「超时」，OOM 被引向调大超时 | 超时改用运行器置的 `timedOut` 标记判定；`cancelled` 单独文案 |
| CG23 | `positiveOr` 把 0 静默回落默认：`cliTimeoutMs: 0`（想表达不限时）得 60s | `timeoutOr`：0 = 不限时（运行器不设计时器），负数/NaN/Infinity 才回落 |
| CG24 | settings schema 声明了 `enabled`/`command` 但从不读取 | 从 schema 删除 |
| CG25 | 模块级 `runtimeSyncRef` 单例：同名不同 id 的两实例串台 | runtime 改为 apply 内实例私有 `runtimeRef`，路由/快照经访问口读取（测试：两实例设置互不可见） |
| CG26 | 工程闸门缺位：无 test script；verify-sync.mjs 与 vitest 重复；indexforce 脚本没接线 | 补 `test` script；删除 `scripts/verify-sync.mjs`（managed-mcp.test.ts 全覆盖）；`scripts/verify-codegraph-indexforce.mjs`（需真机 DSH，无法进 CI）写进 README 开发节与 tty 的 live 脚本同列 |
| CG27 | 5/13 路由零测试；`/node` 不能带 `--json` 的真实约束无测试钉住 | 补 query/callers/callees/impact/node 三态（缺参 400 / 200 argv 快照 / 非零退出 500）+ node 无 `--json` 断言 |
| CG28 | 手写 client.js（51KB）没有「产物 = 源码」闸门 | 拆 `client-src/index.js` + `scripts/build-client.mjs`（原样拷贝），`build` 产出 client.js，CI 既有 artifact-diff 覆盖 |
| CG29 | 文档漂移：README Config 少 `followSession`；兼容性只写 1.5.0；`files` 不含 README.en.md | Config 补 `followSession` + 超时 `0` 语义；兼容性改版本矩阵（1.5.0 macOS / 1.6.0 Windows+macOS）；`files` 加 `README.en.md`；英文 README 同步 |
| CG30 | 断连取消不成立：`req 'aborted'` 在 body 消费完之后**不触发**（真机 HTTP 实测：POST body 读完客户端断连，只有 `res:close` 且 `writableEnded=false` 会来）——CG05 的断连兜底是死代码 | `abortOnDisconnect` 改挂 `res.on('close')` + `writableEnded` 判定（写完才关 ≠ 断连）；三个索引类 POST 路由接的是它 |
| CG31 | `locateCwdEdits` 只向下扫：`cwd:` 写在 `serverName:` **之前**时找不到、在后面补出第二个 `cwd:` → js-yaml 抛 `duplicated mapping key`，**整份 cordis.patch.yml 拒载**（比 CG03 原伤更重，真机复现实锤） | 扫描改双向（行内上下都找同缩进的 `cwd:`；缩进变小即离开条目，不跨行）；复现形状进回归测试（单 cwd + `yaml.load` 不抛 + 幂等） |
| CG32 | **定义未获取**：评审原文未随附，仓库与 git 历史均无记录（2026-09-22 复查：`git log -S` 全历史零命中） | **关闭**：无法补齐定义。改为对该批判最可能涉及的面向做**可执行复核**——新增门禁矩阵用例（POST 路由的 body 门禁 + 全路由回环门禁，含变异验证） |
| CG33 | **定义未获取**：评审原文未随附，仓库与 git 历史均无记录（2026-09-22 复查：`git log -S` 全历史零命中） | **关闭**：无法补齐定义。改为对该批判最可能涉及的面向做**可执行复核**——新增门禁矩阵用例（POST 路由的 body 门禁 + 全路由回环门禁，含变异验证） |
| CG34 | **定义未获取**：评审原文未随附，仓库与 git 历史均无记录（2026-09-22 复查：`git log -S` 全历史零命中） | **关闭**：无法补齐定义。改为对该批判最可能涉及的面向做**可执行复核**——新增门禁矩阵用例（POST 路由的 body 门禁 + 全路由回环门禁，含变异验证） |
| CG35 | kit 归一化成了「半仓统一」：`dshHome()` 归 kit，全仓还有 8 处 raw 副本（env:68 / profile:44 / prompt:79 / search:39 / mcp:76 / tty:2000+2060 / shell-integration:48）——`DSH_HOME=~/x` 时 codegraph 与 dsh-mcp 写**两个不同**的 cordis.patch.yml（改动前至少写同一个错的） | 8 处副本全部改走 kit 的 `dshHome()`（env / prompt 补 `@hyzyn/dsh-kit` 依赖并 bump）；新增 `scripts/check-dsh-home.mjs` 防回归闸（只认 kit 一份推导）接进 CI；连带 bump env/prompt/profile/mcp/search/rss/tty |
| CG36 | kit `killProcessTree` POSIX 分支无条件先打 `-pid`，而 dsh-mcp 的连接测试子进程不是组长（mcp:646 无 detached）——正常 ESRCH 被吞，窄窗口是「子进程已退出且 pid 被复用为组长」；这是另一个包的行为改变 | kit 加 `{ group }` 选项且**默认关**：只有 codegraph 运行器（自己 detached 启动）显式 opt-in，dsh-mcp 经默认路径回到「只单杀」的原语义 |
| CG37 | CG08 的引用计数在闭包里、节点却文档级共享：同一份 client.js 被再次执行（HMR / 重载不换 document）时，新一代 `ensureStyle` 命中旧节点早退、`styleEl` 恒 undefined 摘不掉；反向旧代卸载摘掉新代在用的节点 | 计数改挂在**元素 dataset** 上（`cgRefs`）：ensure/release 都按 id 找节点、增减 dataset——跨代共享的节点配跨代共享的计数 |
| CG38 | `build-client.mjs` 用**字符串** replace 内联 pure.js：内容里一旦出现 `$&` / `$'` / `$1` 会被当替换模式吃掉，且确定性、CI 照绿（当前 pure.js 零 `$`，潜伏） | 改函数替换 `replace(markerPattern, () => inlined)`；用含 `$& $1` 的探针实测穿透，pure.js 已还原 |
| CG39 | **「init 只走 `init -- <path>`」偶发失败（两个独立成因，第二个才是主因）**：① 共享夹具 `emptyDir` 被 stub 写过 `.codegraph/`，复用即 409；② **断言本身写错**——`expect(argvToString).not.toContain('-y')` 会在整串输出上做子串匹配，而 `mkdtempSync` 的后缀是随机的，实测路径 `…/dsh-cg-route-yoKvfJ/…` 里就带 `-y`，于是「十次里红一次」且每次红在不同机器/运行上，看起来像产品 bug（全仓并行运行时更易命中） | ① 该用例与 409 用例各自 `mkdtempSync` 现造目录，删掉共享夹具；② 改为**解析 argv 后逐项比对**：`argv.filter(a => a.startsWith('-') && a !== '--')` 必须为空 + 完整 argv 相等（`--` 是位置参数终止符不是选项）。两个成因都已验证：前者同进程连续两次 init → 200 后 409；后者用含 `-y` 的路径直接复现旧断言判红、新断言通过 |
| CG40 | **采纳率分类器错收**：第一版只匹配「read / search」词根，于是 `read_image`（真实历史 248 次）、`read_pdf`、`web_search`（19 次）被算成「代码探索」——读截图、搜网页跟 codegraph 毫无关系，单这一个错误把分母灌了 11%（2344 → 2077 次），采纳率 2.2% 被压到 2.0%；反向问题是宽口径把 `read` 全算进分母，而 `read` 真实占 1956 次（grep 只有 100 次），导致「2.2%」这种会误导人的数字 | 加 `NON_EXPLORATORY_PATTERNS`（媒体 / 网络 / 文档类先判 other，先于文件探索匹配）；新增窄口径 `discovery`（grep/glob/search/find/list，排除 read），`/metrics` 与卡片同时报两个口径并标注主口径。实测数据与结论见 [docs/adoption-audit.md](./docs/adoption-audit.md) |
| CG41 | **自动重建与 CLI 探测的竞态**：门禁写成 `cliProbeState.available !== true` 时，探测（挂载后异步跑，实测 200–300ms）尚未落地的窗口里，会话的第一条 `user/message` 会被静默跳过——表现为「自动重建时好时坏」。这是写用例时才暴露的：同一份代码三次断言里有一次不查 status | 判据改为只在**已确认不可用**（`=== false`）时跳过；代价是 CLI 真缺失时每项目多起一次注定失败的子进程，可接受。用例「每项目每次运行最多一次」与「索引新鲜」正是钉这个竞态的 |
| CG42 | **文档里的宿主版本基线自相矛盾**：README 称「已在 `0.1.5-rc.2` 上实测全链路」，DEFECTS 记的审计基线却是 `0.1.0-rc.7`，而本机实际在跑的是 **`0.1.6-alpha.2`**（`dsh.engines.dsh` 声明的下限 `>=0.1.2-rc.1` 又是第四个数）。三个版本号并存，谁也没说清「哪一档是验证过的」；且 `0.1.5-rc.2` 那句「实测」没有任何可复跑的脚本，而单测的 fake req/res 覆盖不到浏览器半体的供给面 | README 兼容性一节改为**版本矩阵**：每一档注明**验证方式**，`0.1.6-alpha.2` 挂 `scripts/verify-codegraph-host-contract.mjs`（真宿主 25/25），`0.1.5-rc.2` 如实标注「当时无脚本、覆盖不到供给面」，`0.1.0-rc.7` 说明它是审计当时的包版本、与本机安装的不是同一个；`0.1.2-rc.1` 明确为**声明下限 ≠ 已实测下限**。新增的真机脚本同时补上了长期缺失的「宿主契约」端到端（此前只有 indexForce 那一条） |
| CG43 | **自动重建用例的固定 sleep 导致全仓偶发失败**：三条用例用 `await wait(300/400/500)` 等异步链（status → 判定 → index），而它跑在**真实子进程**上——单跑一个文件够，全仓并行（47 文件抢 CPU）时不够。实测表现为「索引新鲜」那条偶发断言到 `status 调用数 === 0`，且**只在全仓跑时出现、单跑必绿**（最容易被人当成「环境抖动」放过） | 加 `waitFor(check, timeout)` 条件轮询替代固定 sleep：正向断言一律等「事情真的发生过」；反向断言（默认关 / 未索引不该调用）没有条件可轮询，则给足时间并写明这是反向断言。连续 8 轮全仓全绿 |
| CG44 | **工具栏按钮溢出被裁**（用户截图实证）：`.cg_toolbarBtns` 是 `flex-wrap:nowrap` + `flex-shrink:0`——**整组不许断行**。早期 5 个按钮（约 300px）时这招是对的（要么整组留在标题右边、要么整组换行）；P2 加到 9 个（约 637px）后侧边栏只有 ~360px，整组不许断行就只能溢出，**「撤销索引」被裁掉、点不到**。同因还有两处：搜索行仍是固定 3 列 `grid-template-columns`（P2 把「探索/上下文」放进这一行后变成 5 项，会把两个输入框挤到不可用）；「探索/上下文」原本放在工具栏，但它们吃的是**搜索框的关键词**，语义错位又让工具栏更长 | ① `.cg_toolbarBtns` 改 `flex-wrap:wrap` + `justify-content:flex-end`（折成两行，实测 2 行 357/272px）；② `.cg_row` 从固定 grid 改 `flex-wrap:wrap`，输入框 `flex:1 1 160px` 可压缩；③ 把「探索/上下文」移到搜索行（与「搜索」同组，共用 query），「诊断包」从「撤销索引」之后移到只读组末尾（只读动作不该紧邻破坏性动作）；④ 新增**布局守卫用例**（读源码断言这两处必须 `flex-wrap:wrap`、输入框必须可伸缩、探索/上下文必须与搜索同区），并做变异验证：还原成 nowrap / 固定 grid 时用例立刻红 |
| CG45 | **两个真机验证脚本会污染用户真实配置**：脚本起被测宿主时继承真实 `DSH_HOME`，而插件按 `dshHome()` 把 codegraph 托管行写进 `$DSH_HOME/cordis.patch.yml`——**指向的却是脚本的临时项目目录**，脚本结束即 `rmSync` 那个目录，用户真实配置里就留下一行指向不存在路径的托管行。头注释当时写的是「不修改任何已有 profile / settings 文件」，只挡住了 profile 补丁，漏了插件自身的副作用。**实测复现**（去掉隔离后跑一次）：真实补丁 427B → 447B，`cwd` 被写成 `/var/folders/.../cg-host-contract-xxx/project` | ① 脚本给被测宿主**隔离的 DSH_HOME**：整份拷入被测 profile（几十 KB），组装产物与托管行全部落在临时目录，真实 `~/.dsh` 全程只读；② 收尾新增**自证断言**「真实补丁逐字节未变」，把「不污染用户配置」从承诺变成会被执行的检查（实测修复后跑一次：32/32 通过，且真实补丁哈希前后一致）；③ 新增 `test/verify-scripts-safety.test.ts`（6 条）静态守卫这两条性质——真机脚本进不了 CI，静态断言是这里唯一能常驻的防线；变异验证：去掉 `DSH_HOME: isolatedHome` 即红 |
| CG46 | **把上游 CLI 的常驻 daemon 误判成「未回收的进程」**（P0 开工实测时暴露）：同一 `cwd` 下 `pgrep -f 'serve.*--mcp'` 会看到**两个** pid——我们 spawn 的 MCP 子进程（dispose 后 ~3ms 内退出），与 codegraph CLI 自己 detach 的**常驻 daemon**（注册在项目 `.codegraph/daemon.pid`、socket `.codegraph/daemon.sock`，dispose 后存活 >24s，是上游跨会话复用索引的设计）。第一版 agent-scope 验证脚本按「cwd 下 pid 清空」断言，于是**假失败**：报告「A 残留 pid」并把上游的正常行为写成疑似泄漏。次生坑：`lsof` 报 realpath（`/private/var/...`）而临时目录是 `/var/folders/...`（macOS 符号链接），字符串直比会**永远不相等**，看起来像「进程压根没起来」 | ① 按 `daemon.pid` **排除** daemon 后只断言我们那一份（实测 dispose 后 3ms 消失）；② cwd 比较一律 `realpathSync` 归一；③ 断言改**条件轮询**（`waitFor`）而不是固定 sleep——CG43 的同一教训；④ 把这条写进脚本注释与 `verify-codegraph-agent-scope.mjs` 的头注释，避免下一个人重踩 |
| CG47 | **CG04 的写前复核漏了一个方向**（复核 CG04 时发现）：条件是 `before !== undefined && stamp(after) !== stamp(before)`，前半个守卫把「**补丁文件本来不存在、竞态期间被别的进程创建了**」这一向短路掉——首次运行时 `before` 恒为 undefined，于是**恰恰在最容易交叠的那一刻跳过复核、直接覆盖**，而这正是 CG04 要治的「交叠即丢行」。自相矛盾的证据：`stamp()` 特意把「不存在」编码成可比较的 `'absent'`，说明本意就是双向比较。真机难复现（要卡在文件从无到有的瞬间），所以此前没人发现 | 判据抽成纯函数 `shouldRecheckPatchWrite(before, after, attempt)`（可直接穷举四向），去掉 `before !== undefined` 守卫改为双向比较；补 5 条用例（不存在→被创建必须重做、仍不存在不重做、存在→被改/被删仍重做、上限 3 次强写）；变异验证：把守卫加回去，「不存在→被创建」一条立刻红 |
| CG48 | **indexForce 真机脚本第二轮必崩，F2（`--force` 真传下去那一半）从未跑过**（本轮全量验收时暴露）：CG45 给它加的 `cpSync` 隔离**从没被运行过**——脚本对 `indexForce` 两个取值各起一轮宿主、两轮共用同一个隔离 home，第二轮往已存在的目标上拷时，目标里上一轮留下的**符号链接**指回源树，`cpSync` 报 `Cannot copy …/pkce-challenge to a subdirectory of self …/pkce-challenge` 并中止。实测：只跑到 F1（2 PASS）就退出，退出码 1——所以「indexForce 真机验证通过」对 F2 是**假的** | ① 抽出幂等助手 `syncIsolatedProfile()`：**先 `rmSync` 目标再拷**；② 注释写明这个坑；③ 修复后 4/4 PASS（F1 + F2 都真的跑了）。教训：`verify-scripts-safety.test.ts` 只能断言「脚本里有 cpSync / isolatedHome / realPatchBefore」，断言不了「拷两次不会崩」——**真机脚本的正确性只能靠跑一遍** |
| CG49 | **真浏览器 UI 验证在受限环境里必然失败，且报错指不到真因**（本轮全量验收时暴露）：`scripts/chrome-cdp.mjs` 起 Chrome 时**不传 `--no-sandbox`**，而受限环境（DSH 文件沙箱、多数 CI 容器）里 Chrome **自己的** sandbox 起不来——表现为 `Runtime.enable` 挂到 30s 超时，报错只有「CDP Runtime.enable 超时」六个字，完全指不到「是 sandbox 起不来」。我为此先怀疑 `--headless=new`（Chrome 153 下它确实 SIGTRAP 崩溃），做对照才发现真因是缺 `--no-sandbox`（那次「复现」也是同一个原因，因为我的对照漏了这个参数） | ① `verify-client-ui.mjs` 新增 `--chrome-arg <arg>`（可重复）透传给 Chrome——**刻意不做成默认**，那会削弱所有调用方的浏览器隔离；② 新增 `scripts/verify-codegraph-client-ui.mjs` 把「自起隔离宿主 + 真 Chrome 驱动」串起来并显式传 `--no-sandbox`；③ 注释写明「报超时先想 sandbox」这个误导性失败模式 |
| CG50 | `agent/created` 按**用户想要的**模式挂载（`current.mcpScope`）而不是**生效的裁决**（`scopeDecision.mode`）：`mcpIntegration:false`（裁决「两种模式都不挂」）与「区块外手工行」（裁决「已退回 managed」）下都照挂 per-agent——实测日志同时出现「已退回」与「per-agent MCP 已挂载」 | 改用 `runtimeRef?.scopeDecision?.mode ?? DEFAULT_MCP_SCOPE`；新增 `test/agent-created-mode.test.ts`（真插件 + 真事件派发，三个分叉场景 + 对照组），变异验证：还原成 wanted 即 3 条红 |
| CG51 | 卡片 `qs()` 对数组做 `String(value)`：`affected` 的多文件被折成 `files=a.ts,b.ts` **一个值**，而宿主按 `getAll('files')` 收 → CLI 收到一个名叫 `a.ts,b.ts` 的不存在文件，多文件「影响面」静默空结果（单文件才碰巧对） | 抽 `buildQuery` 进 `client-src/pure.js`（数组逐个 `append`），`qs` 改为它的别名；`client-pure.test.ts` 补 3 条（含「不得出现 `%2C`」的反向断言） |
| CG52 | uninit 只把运行登记在**索引根**下，而卡片「取消」发的是输入框里的路径（monorepo 子目录）→ `cancelled=0`，界面却照样说「已发送取消请求」 | 两个键都登记（请求路径 + 索引根），`/cancel` 按 controller 去重（`cancelled` 报的是「取消了几个运行」）；补 2 条用例 |
| CG53 | `/cancel` 用裸 `readBody`，把「body 没读出来」当成「没指定 path」→ 一个被截断的 `{path:"x"}` **升级**成「取消全部」，把别的项目正在跑的索引一起杀掉（CG01 立的规矩在这里漏了一条） | 改走 `readPostBody`（畸形 / 空 / 超限一律 400），`{}` 仍 = 取消全部；补 2 条用例（400 且运行未停 / `{}` 仍取消全部） |
| CG54 | 注释与 README 都写「探测没落地时补一次探测」，实现只读缓存 → 慢 CLI 下诊断包报 `CLI 探测：尚未探测`（正是那句注释要避免的状态），实测 A/B 两态对照确认 | 路由里真的补：`available === undefined` 时 `await cliProbe.reprobe()`（幂等，最多一个子进程）；补用例（慢 stub 下报告必须是确定结论） |
| CG55 | `describeAdoption` 注释称「卡片与诊断包共用」，实际卡片用 `client-src/pure.js` 的 `adoptionText`——两份实现、各自测试、无一致性闸，措辞已分叉（同一输入两个文案） | 注释改为如实描述两处实现；`adoption.test.ts` 补一条**跨半体**用例钉住百分比口径一致（措辞允许不同） |
| CG56 | 登记表注释承诺「永不淘汰当前默认项目 / 会话项目」，而 `note(path, via)` 拿不到这两个值——结构上无法实现；该性质实际由 `/projects` 每次 list 前重新 note 维持 | 注释改为如实描述：容量 50 + 淘汰最久未见；「当前项目始终在列表里」标注为**调用方契约**，改 `/projects` 时别删那次重新 note |
| CG57 | 挂载器注释称重复 attach 会看到「已在处理」，实现只判 `mounted === true`（在途记录是 `false`）→ 窗口内重复派发再开一份：第二个实例被 dsh-mcp-client 拒（白跑一次 spawn+握手），其 fiber 覆盖第一个的引用 | 加 `pending` 在途标记 + **世代号**：重复 attach 复用同一记录；detach / detachAll / 换 cwd 都让迟到的续体作废；补 3 条用例（含「在途 detach 后一个进程都不许起」） |
| CG58 | `timeoutOr` 只判 `>= 0`：`cliTimeoutMs: 0.5` 被原样收下 → `setTimeout` 当 1ms → 每次调用立刻超时，报错只说「请调大 cliTimeoutMs」，用户看着自己写的 0.5 完全不明白 | 改判 `Number.isInteger`（0 仍 = 不限时）；`cli-config.test.ts` 补小数三档 |
| CG59 | `shortPath` 只按 `/` 切：Windows 路径整串算**一段** → `parts.length <= 2` 直接原样返回，这一列从不缩短（60+ 字符把胶囊撑满，正是它要解决的问题） | 按 `[\\/]` 切、显示统一用 `/`；补 Windows / UNC / 混合分隔符用例 |
| CG60 | `runViaSpawn` 的 maxBuffer 判定把字符串**字符**数与 Buffer **字节**数相加 → 上限最多偏松 4 倍（中文/emoji 场景），护栏本身带误差 | 单独记 `stdoutBytes` / `stderrBytes` 按字节判定；纯护栏修正，无行为变化 |
| CG61 | `renderOutputBody` 对 explore/context 输出**静默** `slice(0, 4000)`，与本包自己的 CG17 纪律（截断要报计数）不一致——explore 的 markdown 末尾正是调用链 | 超限时补一行计数说明（复用 `truncationNote`）；`raw` 本来就在响应里，文案里也点明 |
| CG62 | `/default-path`（项目胶囊 / 「设为默认项目」）把**部分对象** `{ defaultPath, followSession }` 喂给 `sync()`，而 `resolveStored` 对「对象里没有的键」回落插件配置默认值 → `mcpScope` / `mcpIntegration` / `announceToAgent` / `usageGuidance` 四个键**在内存里被静默重置**。settings.yaml 没丢（写的是合并）→ **重启又「好了」**，表现为「时好时坏」、卡片显示与文件里的用户选择长期不一致。实测：勾上 per-agent 后点一次项目胶囊，当场退回 managed、全局托管行被写回、per-agent 挂载被回收；关掉「公告能力」后同样被打回 true | 改成把**完整的** stored 传进 sync（`{ ...(rt.scope?.get() ?? {}), defaultPath, followSession: false }`）；补用例逐键断言（mcpScope / mcpIntegration / announceToAgent / usageGuidance），变异验证：还原成部分对象即红（实测报 `mcpScope 不该被 /default-path 重置: expected 'managed' to be 'per-agent'`） |
| CG63 | **DSH 0.1.7-rc.1 起 `ctx.settings.register(ns, schema)` / `settings.get(ns)` 已删除**（服务换成 `SettingsForms`：`describe/update/mutate/replace/configure`，设置存储改为「当前 profile 的插件 entry 配置」+ 导出带 `.volatile()` 的运行时 `Config`）。本包仍调旧 API：settings effect 抛错后静默走 config 兜底（`scope === undefined`），于是卡片开关 / 「设为默认项目」/ `per-agent` 切换全部回 500 `插件尚未完成挂载`。**单测与 tsc 都发现不了**——旧代码用 `as unknown as` 擦掉了服务类型。真机实测（rc.1 隔离装置）：`POST /api/dsh-codegraph/settings` 对合法 patch 回 500，`/default-path` 报 `effectiveMcpScope=managed` 且不落盘 | ① `@hyzyn/dsh-kit` 新增 settings 适配层：`settingsEntryScope`（读 `describe()` / 写 `update(entryId, patch)` / 订阅 `loader/volatile-update`）+ `plainConfig()`（还原 volatile 冻结引用）+ `readSettingsEntry` + `suppressAutoSettingsPage`；② 本包导出运行时 `Config` schema（卡片可改的 6 个字段标 `.volatile()`），settings effect 改用它，`apply()` 里先 `plainConfig()` 还原；③ 两处写入口改走适配层；④ 兼容性声明从 `dsh.engines.dsh` 换成 `peerDependencies["@deepseek-ai/dsh"] = ^0.1.7-rc.1`（rc.1 的安装前/启动时判定只认 peer；`engines.dsh` 已无读取方）。验收：真机宿主契约 **42/42**（含新增的两项 settings 写路径基线），`POST /settings` 在 per-agent / managed 间往返都是 200 |
| CG64 | 客户端文案里有 2 处字面 `**`（`panel.perAgentTitle` 的 zh / en）——浏览器半体没有 markdown 渲染器，用户看到的是两个星号 | 改成引号包裹（「有索引」/ “has an index”）；目录头注释里写明这条规矩 |
| CG65 | probe 的超时硬编码 `CLI_PROBE_TIMEOUT_MS=5000`，且**超时被当作「不可用」判死**：宿主启动争抢（外部 issue 实测 60–80 个并发 spawn）能把空闲 ~200ms 的命令拖过任何单次超时（同机 whoami 链 21.5s），于是公告与使用指引整个会话不注入、只能手动「重新探测」；且「命令不存在」与「超时」共用同一条警告文案，排障被引向 command 路径而非机器负载 | 失败**分类**：按运行器的 `timedOut` 显式标记（CG22）把超时标成 `inconclusive`——available 落回 undefined（未落地态，复用既有契约）并按重试梯子 `PROBE_RETRY_DELAYS_MS=[10s,30s]` 自动补探，成功即注入；确定性失败（ENOENT/非零退出）立即判死不重试；梯子穷尽才判死并换「连续超时」专属警告文案；显式重探作废待触发重试并归零梯子；卸载 effect 清理重试计时器。单次超时与梯子**刻意不进 Config**（不是用户档位，见常量注释），测试经 `apply` 第三参 `ProbeTuning` 注入；客户端对含「timeout after」的原因给专属指引 |
| CG66 | **采纳率仪表在真机上永远是 0**：`session/event` 的第二个参数是 `SessionEvent` **信封** `{ type, seq, time, data }`，而监听器直读顶层 `event.name`——那是不存在的字段，于是每一次真实 `tool/call` 都命中「畸形事件，宁可少记」的守卫被丢弃。`type` 恰好在顶层，所以既不报错、也没有可疑数字：卡片长期显示「本次宿主运行期间该项目还没有工具调用记录」（本机宿主已跑 3.8 小时、会话一直在调工具，而 `/metrics` 的 `summaries` 为空、连 `other` 都是 0）。真机复刻：真 `dsh-session` + 真 `SessionStore` + 真 agent scoped ctx 派发真 `tool/call` → 表为空；换成扁平 `{ type, name }` 即计数——差别只在这一个字段路径。此前本文件的接线用例全用假 ctx 手工派发**扁平事件**，契约核对也只核到「有两个参数」，于是这个错误一路绿灯 | 工具名改读 `event.data?.name`（顶层 `event.name` 留作兜底：宿主把载荷摊平时也要计上，别让同一个故障换个版本再静默一次）；测试新增 `toolCallEvent()` 按**真实信封**造事件、所有派发点改用它，并补畸形信封（`data: {}` / `data.name: ''` / `data.name: 42`）与回归用例「真实信封：工具名在 `event.data` 下，必须计数」；变异验证：还原成 `event.name` 即红 3 条（新用例 + 两条信封用例） |
| CG67 | **往空 flow 序列根 `[]` 后面追加托管块，会让 `~/.dsh/cordis.patch.yml` 变成非法 YAML，MCP 整行静默不挂**（外部 issue #11）：DSH 给每个 profile 生成的 `cordis.patch.yml` 模板与 home 补丁的惯例内容都是「几行注释 + `[]`」，而 `[]` 是**完整**的 YAML 文档（flow 序列根），其后不能再接块序列。`syncManagedMcpRow` 的「无标记则追加」分支只判断 `text.trim() === ''`，`[]` 落进普通追加路径，写出 `[]\n\n# --- dsh-codegraph mcp managed ...`。宿主用同一套 js-yaml 解析（`parsePatchList` → `yaml.load`），于是**下次启动直接 fatal**（`failed to parse patches ... expected '<document start>', but found '<block sequence start>'`，退出码 1）；而活着的时候热路径被 HMR 的 `watchConfig` catch 成一条 `logger.warn`，GUI 完全看不到。三处可观测面同时给出「一切正常」：`POST /default-path` 返回 `ok:true` + `已自动托管`、索引门禁照常注入使用指引（但 `mcp__codegraph__*` 从未注册）、`/agents` 的 `mounted:0/live:0` 在 managed 模式下本来就是 0。**且不自愈**：标记一旦存在，后续写入走「替换已有区块」分支把坏根原样留着。同一段 append 写法在 `mcp` / `kit` / `env` / `prompt` 四个包的托管块写入器里**逐字重复**，五处同时中招 | 抽出共用纯函数 `stripEmptyFlowSequenceRoot` / `stripEmptyFlowSequenceRootLines`（`packages/kit/src/managed-block.ts`）：识别「根位置（首条非注释行）是 `[]`」，追加前**摘掉这个根**而不是往后接，注释与其它内容逐字节保留；`codegraph` 的 `syncManagedMcpRow` 在入口处行数组版摘根、早退分支返回原数组（解析失败 / 区块外手工行绝不顺手改盘）、`dryRun` 返回原文（只读快照不谎报已修），并把「只摘了根、没有别的改动」也算成 `changed` 否则坏根永远等不到写盘；`mcp` / `env` / `prompt` 三个写入器同样先摘根再走原有分支。**自愈**：旧版本已经写出的 `[]` + 区块文件，下一次写入即修好（摘根 + 就地替换区块），不需要用户手工删行。回归用例：kit 6 条、mcp 4 条、env 2 条、prompt 2 条、codegraph 6 条，全部用**真 js-yaml 解析**断言（不是比对字符串）；另有「正常块序列文件不受影响」「dryRun 不改写」两条反例。变异验证：回退五个写入器的源码后新用例**红 12 条**，对照组（正常文件 / 空文件 / 纯注释）仍绿 |
| CG68 | **`pnpm test` 会改写用户真实的 `~/.dsh/cordis.patch.yml`**：`adoption.test.ts` **真的调用 `apply()`**，而 `apply()` 的兜底 effect 会按 `dshHome()` 读写 `$DSH_HOME/cordis.patch.yml`；该文件从未隔离 `DSH_HOME`（`grep -c DSH_HOME` = 0），于是没设该变量时就落到用户真实 home。用例里两处 `apply()` 分别把 `defaultPath` 指向 `cg-adopt-repo-*` / `cg-adopt-diag-*` 临时项目，插件随即把托管行的 `cwd` 写成那个路径，**跑完临时目录即被删**——真机上留下一条 `cwd` 指向不存在目录的 codegraph 行（本机实测：收尾对账时真实补丁 sha256 变了，`cwd` 成了 `/var/folders/.../cg-adopt-diag-*`）。发现路径也是间接的：先做 CG67 的真机验收，收尾「真实配置逐字节未变」自证报红才顺藤摸到。**危害分档**：宿主是 per-agent 模式时该全局行不生效（本机就是），所以多半不炸；切到 managed 模式后这条坏行会被 loader 载入、MCP 子进程以不存在的 cwd 启动。与 CG67 是同一类病（写用户真实配置）但不同根因：CG67 是写错内容，本条是**在不该写的路径上写** | 给 `adoption.test.ts`**以及同病的 `projects.test.ts` / `auto-reindex.test.ts`**（全面测试时用指纹比对扫出来的：跑完全仓套件真实补丁又多出 `cg-auto-off-*` / `cg-proj-follow-*` 的 cwd）加文件级隔离，写法与 `cli-route.test.ts` / `cli-surface.test.ts` 同一套：`beforeAll` 里 `process.env.DSH_HOME = mkdtempSync(...)`，`afterAll` 还原原值并删临时目录（`dshHome()` 每次调用现读 `process.env`，所以 hook 早于任何 `apply()` 即可生效）。**变异验证**（这次做对了）：把 `beforeAll` 的赋值去掉、外部 `DSH_HOME` 指到空目录 `/tmp/.../pB` 再跑，该目录被写出带 `cwd: …/cg-adopt-diag-*` 的托管行（复现污染）；恢复赋值后同样跑，外部目录**保持为空**（隔离生效）。单文件 19 条用例两态都绿——所以这条必须靠**文件系统副作用**验证，不能靠断言。**但「记得做收尾对账」不是闸门**：2026-10-17 在同一条上复犯一次——维护者机器上跑 `pnpm test` 把真实补丁的 codegraph 区块**整段**改写成测试垃圾行（`command` 与 `cwd` 各自指向已删除的临时目录），事后按 `~/.dsh/cordis.patch.yml.bak-*` 逐字节对账才修回；期间本机在跑的 `dsh web` 已在 10:37:17 自己把那条坏行摘掉、只剩空壳区块，也就是**危害会自愈，证据也跟着消失**。于是给 `scripts/check-dsh-home.mjs` 补**第二条判据**（CG35 那条继续管「推导只有一份」，新增这条管「测试不许写 home」）：把整轮 `vitest run` 跑在一个**空的哨兵 `DSH_HOME`** 上，跑完断言该目录里**一个文件都不许出现**，出现就点名文件并指回上面的写法。判据刻意是**行为式**而不是文本式：实测 36 个「从包 `src` import 了 `apply`」的测试文件里 21 个不含 `DSH_HOME` 字样，但逐个放进哨兵目录跑**全部写出 0 文件**（它们压根不碰 home）——「调 `apply()` 就必须出现 `DSH_HOME`」会一次造出 21 条必然腐烂的豁免；行为式反过来还白捡覆盖面：`writeManagedEntries`、kit 授权存储等**任何**入口写 home 都抓得到，落点不限于 `cordis.patch.yml`（`env.yml` / `prompts.yml` / `.credentials.yaml` / `tty/` / `rss-digest` 都在 home 下）。夹具反例 `scripts/test/check-dsh-home.test.ts`（9 条）钉住两个形状：**套件失败 + 哨兵目录为空 → 不许放行**（否则就是一道恒绿闸门）、**写出为空即通过，与文件里有没有 `DSH_HOME` 字样无关**。变异验证：临时用例往哨兵写出 `cordis.patch.yml` → 闸门红并点名，删掉即绿；整轮成本 25s（本机），挂在 CI 已有的 `dsh-home:check` 步骤上，不新增脚本名 |
| CG69 | **`apply()` 里一次抽样就把 per-agent 永久退回 managed，重载后同一进程里新建的会话全都没有 `mcp__codegraph__*`**：探测写成 `ctx.get('agents') !== undefined && typeof agents.list === 'function'` 并只算一次，而 cordis 4 的 `ctx.get` 是 **strict** 的——只认提供者 fiber 已 ACTIVE（`_getImpl`：`strict && impl.fiber.state !== 2` 就返回 undefined），偏偏 loader 用 `Promise.all` **并发**创建全部 entry、行序不构成加载顺序（`dsh-base/cordis.patch.yml` 自己写着 Row order carries no load semantics）。于是完全合法的一次启动就能让 agent 的 provider 仍是 LOADING，探测读到 `undefined` → `agentEventsAvailable=false` → `resolveScopeMode` 走「宿主没有 agent 事件面」分支退回 managed；而 managed 的托管行在没有已索引默认项目时是空的（`insert: []`）——**两条挂载路径同时不存在**。真机事故（2026-10-21，桌面端 0.2.1-rc.1）：插件重载后 `/agents` 台账 `mounted:0/live:0`，`~/.dsh/cordis.patch.yml` 里本插件区块停在 `insert: []`，用户新建的某个已索引项目的会话里工具表根本没有 `mcp__codegraph__codegraph_explore`；而几小时前同样 cwd 的会话是好的——差别只在**这一次进程启动时抽样落到了哪个窗口**，不是会话属性。三个阶段的可观测面全在骗人：`/default-path` 报 `mcpScope: per-agent / effectiveMcpScope: per-agent`（因为 `requested` 被当成了生效值读）、systemPrompt 照样注入「用 `mcp__codegraph__codegraph_explore`」那段使用指引（它只校验 CLI 探测 + 索引，不校验工具真挂了）、托管行快照报 `mode=none` 却不报「所以工具不存在」。**且不自愈**：`agentEventsAvailable` 此后只在事件订阅抛错时被再置一次 `false`，没有任何入口能重新探测，除了重启宿主再过一次运气 | `ctx.get` 的答案降级成「**此刻**能不能用」，由一节 `ctx.inject(['agents'])` 兜住服务迟到（cordis 官方可重入机制：依赖齐了才跑、`_refresh()` 会重跑；**顶层 `inject` 仍保持 `[]`**——在 agent 服务缺席的宿主里插件照样要能挂，写进顶层就变成「整插件不加载」，那正是当初选 `ctx.get` 的理由，不是要推翻它）：回调里置 `agentEventsAvailable=true` 并跑 `refreshAgentSurface()` —— 按**最近一次设置快照**（`lastStored`，两条 sync 实现入口都写）重跑一次 sync，由 `applyScopeMode` 的「模式变了才动手」判据收敛，所以 inject 回调先跑还是后跑都得到同一结果；重跑必须带 `lastStored` 而不是空跑，否则会退回安装级默认值、把用户在卡片里调过的 defaultPath / 开关一次性抹掉。探测本身收口成 `readAgentSurface()`（`get` + 形状校验 + 吞异常），三处读 `agents` 共用一份。回归用例 `test/agent-late-service.test.ts`（4 条；第 4 条钉「迟到重跑只变一次并稳定下来」——补丁是热重载面，切 per-agent 时删成 `insert: []` 那次是必须的，之后同值重算必须零改动，否则会有「写盘 → 热重载 → 再 sync」的自激回环）：先退回 managed 是**正确行为**（对照组）、服务到货后同一实例重新裁决成 per-agent 且之后新建的 agent 真挂上、重算沿用卡片设置不退回默认值。**真机**（2026-10-21，test profile @3082，`dsh 0.2.1-rc.2`）：切 per-agent 后新建真实会话，会话 JSONL 的**首轮** `request/header` 里 `nTools=167`、含 `mcp__codegraph__codegraph_explore`；模型**实际调用**该工具（`isError=false`，返回 `syncManagedMcpRow` 等 69 个符号）。另加 `scripts/verify-cg69-real-cordis.mjs`（真 cordis 契约层，3 条）：先不给 agents 服务 → 插件照样挂载、裁决退回 managed；装上真 `AgentRegistry` 后 inject 回调跑起来、裁决自己变回 per-agent、新建 agent 真拿到工具。**变异**：摘掉那节 `inject(['agents'])` → 第三条红、前两条绿。

**变异验证**（三个方向）：摘掉那节 `inject(['agents'])` → 后两条红；只把 `runtime.sync(lastStored)` 改成 `sync(undefined)` → 第三条红，前两条仍绿；短路 `syncMcpRowOnDisk` 的「无变化即返回」→ 第 4 条红（mtime 变了）——三个变异各自只打到它该打的那条，说明用例没有互相担保。第 4 条最初写成「任何情况都不该写」，被变异证明是空断言（第二次 `deliverAgents()` 撞上 `agentEventsAvailable` 早退、根本走不到 sync），后改为用同值设置写触发真正的重算 |
| CG70 | **托管行写机器级共享层，同机多 profile 互改且完全静默**：`homePatchPath()` 一直返回 `$DSH_HOME/cordis.patch.yml`，而那是 **home 层**——DSH 对**每个** profile 都加载它、且它**压过** profile 自己的层（`profile-boot`：home 层 "applies to every profile, so it outranks the per-profile layer"）。于是同一台机器同时开两个宿主（**web + desktop 是最常见的组合**，本机实测 58497 desktop / 3080 web 两个都在跑）时，两个插件实例抢同一份文件：desktop 是 per-agent → 写 `insert: []`（挂起），web 是 managed → 写启用行，**谁后写谁赢**，而三方可观测面全在骗人——`/default-path` 报的是**本实例内存里的** `mcpScope`（`managed`，与盘上无关）、托管行快照读的又是 home 层（`note: 本插件区块里还没有托管行（下次同步会写入）`，**这句是假的**：不是「下次写」，是「被另一个实例覆盖了，永远写不进去」）、启动日志只在写盘成功时打一行 `patch updated`。用户照着那句话等，等不到；换个 profile 又「好了」，于是归因成玄学。**且设定与效果不同层**是根因：`mcpScope` 是 profile 级设定（每人一份、答得清清楚楚），效果却写在机器级共享文件里 | 设定与效果**同层**：新增 `patchPath(ctx)`，优先用 `profileContext.patchPath`（宿主 `hostCtx.provide("profileContext", …)` 本来就给了 `dir`/`patchPath`），拿不到才回落 home 层（最小宿主 / 单测 / 老版本不能因为一个可选服务缺席就丢掉托管能力）。**迁移是前置条件而不是可选项**：实测（隔离 home、真 `dsh --dump-config` 与真启动）同 id 的 entry 出现在两层时，loader **不去重**、`--dump-config` 两条都在，实际只挂一条且**后加载者胜** = home 层（它排在 profile 层之后）——所以只改写入点不清旧块，结果是**旧值静默盖住新值**，比不改更糟。新增 `stripOwnBlockFromHomeLayer()`：只认本插件自己的标记、整段摘除、别人的块与用户注释一个字节不碰、**幂等**（没旧块时 `changed=false` 且不写盘）、沿用 `shouldRecheckPatchWrite` 的写前复核；三条 sync 路径（settings 分支 / 兜底 effect / 迟到的 agent 服务）都跑一次。顺带把三个读写函数的 `patchFile` 参数**去掉默认值**——现场踩到的正是「默认值静默回落到 home 层」：`/default-path` 的快照没传参，于是 MCP 明明挂上了、卡片却报「文件中还没有托管行」 |

| CG71 | **per-agent → managed 切回后，自有区块里残留 `- insert: []` 占位，文件回不到原样**：挂起分支（`suspendGlobal` + 自有区块）用 `renderBlockLines(ownRange, ownRows.filter(不是 codegraph 的行))` 重写区块体，rows 为空时 `renderBlockBody([])` 产出 `- insert: []`；而**恢复分支**（区块在、但里面没有 codegraph 行）只做「插入新行」的行编辑——`bodyEnd`/`insertAfter` 往后 splice 12 行，**区块原有的 `- insert: []`（真机上还跟着一个空行）原样留着**。即两条路径的「写什么」与「读什么」不对称。后果是**用户点一下卡片就产生的脏写**：功能不受影响（空 insert 是合法空操作、loader 照常挂真行，`mode=own`、新会话工具与调用全部正常），但不累积（再挂起时挂起分支整块重写会清掉），所以严重度低——可文件确实回不到挂起前的样子。**现有用例抓不到**：`agent-scope.test.ts` 那条只断言 `serverName: codegraph` 回来了，没断言占位被清；`verify-codegraph-host-contract.mjs` 预置的是 **dsh-mcp 区块**（走 `disabled: true`，可逆、无占位），所以 42/42 全绿也碰不到这条分支 | 恢复分支改成**先算出「清掉占位之后」的区块体真实内容，再整块重写**：只滤掉 `trim() === '- insert: []'` 的行，且**只在区块里没有别的内容时**才连带收掉紧随的空行（用户手写的注释 / override / 分段空行一律不做主，原样带回）。**为什么不用行编辑**（报告建议的方案 B 原形）：占位删除会让后续行号前移，而插入点算的是原文件位置，删 + 插混在一个 replacement 里必然错位；拆成两个 replacement 也不行——它们共享同一个 `range.start`，谁先应用由排序决定、结果不稳定。实测两版都把整块内容打乱并挪到了结束标记之外。整块重写没有这个问题。顺带给 `LineEdit` 加 `remove` 语义、给 `applyReplacements` 加**稳定排序**（组内按最大编辑行号降序），让「同 range 上的多条编辑」在任何组合下都可预测。回归：`agent-scope.test.ts` 那条补 `not.toContain('- insert: []')` + 二次 sync `changed=false`；`profile-layer-patch.test.ts` 新增「per-agent → managed 往返后 profile 层逐行回到挂起前」。**变异验证**：退回「只插入、不替换块体」→ **恰好这 2 条红**（报告要求只红这两条），其余 41 条绿。第一版变异打在 `.filter()` 上时用例**没红**，查出来是整块重写本身就清掉了占位、那段 filter 是冗余的——重打变异才命中，冗余逻辑已顺手简化。三种形状（只有占位 / 占位+空行 / 占位+用户注释）占位全清、注释保留、二次 sync 全部 `changed=false` |
| CG72 | **CG67 的空根修复在「除 `[]` 外没有条目」时把合法文件写成纯注释文件——首启即写坏，下次启动直接退出**：`syncManagedMcpRow` 末尾 `repaired = !dryRun && strippedRoot && !outcome.changed` 的本意是「只摘空根也要算变化，否则坏文件永远等不到写盘」，但它没区分「摘完还剩条目」与「摘完什么都不剩」。后者的产物是**纯注释**文件：宿主 `parsePatchList` 要求顶层是数组，而纯注释连 `yaml.load` 都只返回 `undefined`（**不抛**），于是整层补丁加载失败。`[]` 本身是合法文档（空列表根），这等于把合法文件改成非法文件。触发面是**每个全新 profile 的第一次**：宿主模板就是「三行注释 + `[]`」，首次同步若默认项目未索引（无可写区块）、或 `manageEnabled=false`、或 per-agent 且没有区块可挂，三条路径都只摘根不写别的 → 写盘 → 下次启动 `dsh: ... must be a top-level YAML array of loader patch entries`、退出码 1。0.6.9–0.6.14 全部携带（0.6.8 及以前是另一种坏法：把托管块追加在 `[]` 之后）；npm 上没有 0.6.12/0.6.13，所以 0.6.11 用户报的「仍有这个问题」与这条同源。**三处可观测面照旧全在骗人**：`POST /default-path` 返回 `ok:true`、systemPrompt 照常注入使用指引、`/agents` 在 managed 下 `mounted/live` 本来就是 0。**复测自身的教训**：从仓库目录起宿主时 `process.cwd()` 恰好已索引、当场写了托管块，于是绕开空路径——换成非索引目录才必现，说明「干净环境」之外还得控制**启动 cwd** | 只在自己**真有东西可写**时才声明变化：`strippedHasEntry` 判「摘根后还存在至少一条非空、非注释行」，`repaired` 追加该条件；无可写内容时**把原数组原样返回**（`changed=false`，`[]` 保持不动——它本来就合法），并且连「摘过根的行数组」都不外泄，免得被 `syncMcpRowOnDisk` 之外的下游当成修好后的内容写出去（`applyReplacements` 在无 replacement 时返回的是摘过根的 `lines`，与文档承诺的「无变化时返回原数组引用」不符，一并收口）。CG67 的自愈路径不受影响：那种输入有区块，`outcome.changed` 本来就 true。回归 `managed-mcp.test.ts` 新增 7 条：模板+未索引 / 只有 `[]` / per-agent 无区块 / `manageEnabled=false` 四种「不写盘」，索引对照（证明不是把功能关掉），CG67 自愈不退化，以及一条矩阵不变量「只要 `changed=true`，写回内容必须能被宿主当顶层数组读回」——断言用 `Array.isArray(yaml.load(...))` 而不是「不抛」，因为纯注释文件 `yaml.load` 不抛。**变异验证**：撤掉 `strippedHasEntry` → 恰好 5 条红、其余 48 条绿；还原后 53 条全绿。真机（发布级）：干净 `DSH_HOME` + `--from-default-profile` 官方模板 profile + `dsh plugin add @hyzyn/dsh-codegraph` 从 npm 装、从**非索引目录**启动 → 修复前补丁 217→214 字节只剩注释、重启 exit=1；修复后不写盘、补丁保持 217 字节、重启正常 |
| CG73 | **验收脚本自己重踩 CG67 的坑：往全新 profile 的模板 `[]` 后面追加托管块，宿主直接起不来，「干净 profile」这一档验收静默失效**：`scripts/verify-codegraph-host-contract.mjs` 的 `seedPreseededMcpRow()` 一直是 `existing + [区块]`，而它只在 `test` / `desktop` 这类**早已有真实条目**的 profile 上跑过；换成 `--profile <全新 profile>` 时，patch 模板末尾正是 `[]`（完整 YAML 文档），追加后整份文件非法，宿主在 `loadProfileDirectory → loadOverlayPatches → parsePatchList` 抛 `end of the stream or a document separator is expected`、exit=1。脚本只报「宿主没在 <port> 上就绪」，看不出根因——**与被验的 CG67 是同一类写法：验证工具复现了它要验的缺陷**。2026-10-22 用工作区构建做干净环境全面复测时撞到：不预先手工删 `[]` 的话，这条脚本对任何新 profile 都跑不起来，`--profile` 的「换模板」能力实际只剩「换一个已有条目的成熟 profile」 | 追加前**先摘根位置的 `[]`**：新增 `appendManagedBlock(existing, block)`（`scripts/lib/live-harness.mjs`），复用 kit 的 `stripEmptyFlowSequenceRoot`（与 CG67 同一份判据，不另造），注释 / 已有条目逐字节保留；`seedPreseededMcpRow()` 改用该函数。回归 `scripts/test/patch-seeding.test.ts` 4 条：全新模板 + 块 → 合法顶层数组且无裸 `[]`；已有条目 → 原有行一条不少；空文件 / 纯注释 / 无尾换行的 `[]` → 都合法；**反例**用旧写法（`existing + block`）造，断言它会写出 `document separator` 错误——先证明判据能红。判据用 `Array.isArray(yaml.load(...))`（与宿主 `parsePatchList` 同形），不是「不抛」。**变异**：把 `const base = stripEmptyFlowSequenceRoot(existing) ?? existing` 改回 `existing` → 恰好 2 条红（模板 / 空文件那两条），对照 2 条仍绿；还原后 4 条全绿。**真机**：全新 `DSH_HOME` + 官方模板 profile（patch 原样 `[]`，不预先摘根）+ 工作区构建，脚本 **42/42**；修前同场景 1/2（宿主 exit=1） |


## 2. 台账纪律与长期结论

> 这几条不是缺陷，是**为什么这份台账长成这样**，以及不随版本失效的结论。改台账格式前先读。

> **CG32–CG34 的关闭理由**：缺陷台账的价值在于「每条都能落到代码」，而三条没有定义的条目永远落不下来——挂着它们会让「待修 N」这个数字长期失真。关闭不等于「已修」，是**承认无法修复**，并用一条覆盖同类风险的用例顶上。

> **0.4.2 之后的增补**：前瞻项记在 `ROADMAP.md`，已落地三项（systemPrompt 注入加索引门禁、
> `GET /diagnose` 诊断包、采纳率仪表），详见其「已完成」一节。**只有已确认的缺陷进本文编号**
> （本轮新增 CG39–CG45），新发现的缺陷继续按编号往后续。

另有一条评审自报后自否的假阳性，留档防重查：「README 引用了不存在的
`scripts/verify-codegraph-indexforce.mjs`」——该文件在**仓库根**且被 git 跟踪，
README 开发节整块是仓库根相对路径，引用成立。

## 3. 复核方式

单测与静态检查（修复后全绿）：

```bash
npx tsc --noEmit -p packages/codegraph/tsconfig.json   # 干净
npx vitest run packages/codegraph                      # 110 tests / 5 files
npx vitest run                                         # 全仓 618 tests / 40 files（kit 的 POSIX 收杀测试在内）
node scripts/client-lint.mjs                           #（在包目录里跑）对 client-src/index.js 跑 tsc --checkJs
```

真机 CLI 实测（审计时点标 `实测` 的每条都可这样复跑；本机 `codegraph 1.6.0`）。
在**任意已索引仓库的根目录**执行：

```bash
codegraph --version                                             # 1.6.0
ls -a ~/.codegraph                                              # 无 .db → 支撑「家目录不是项目」
ls -a .codegraph                                                # codegraph.db / .db-wal / .db-shm / daemon.pid / daemon.sock
codegraph status --json -- packages/codegraph                    # projectPath 指回仓库根 → CG02 的口径依据
codegraph callers --json --path . -- -abc                       # exit 0 正常 JSON → `--` 是解法（CG09，路由已内置）
codegraph query --json --path . --limit -1 zzz                  # exit 0 + []（CG10，路由已在进 CLI 前拦下）
codegraph impact --json --path . --depth 99999 <symbol>         # CLI 自己夹到 depth:10 → 路由不做重复钳制
codegraph node --json --path . <symbol>                          # exit 1 unknown option → 路由刻意没带 --json（CG27 钉住）
d=$(mktemp -d); codegraph sync -- "$d"; echo $?                 # exit 1 + “CodeGraph not initialized”
```

**审计里当时没实测、现在的状态**：

- CG05 的「CLI 忽略 SIGTERM 会挂起 / 孙进程存活」：kit 侧新增了真机进程组测试
  （`packages/kit/test/windows-shim.test.ts`：detached 组长 + 组内孙进程一起收；
  非组长回落单杀）——不再只靠静态判定。CLI 自身忽略 SIGTERM 的行为仍未实测，
  但 SIGKILL 升级链（3s）保证它最终会被收掉。
- CG08 的「两个插槽在 0.1.6 上同屏渲染出两张卡片」：仍未起真宿主验证；引用计数让
  两种挂载顺序都安全，该场景的实测 still 待补。
- `codegraph init` 无 TTY 行为、对已被父目录索引的子目录是否拒绝：本轮未重复验证；
  升级 CLI 后请重跑（顺带更新 CG29 的版本矩阵）。
- CG13 的「挂载期抛错导致整个插件起不来」：kit 的 `dshHome()` 归一化有测试，
  `syncMcpRowOnDisk` 的兜底有日志与 note 路径；`DSH_HOME` 指向不存在目录的真机宿主
  实测仍待补。

## 4. 冻结记录：被移出正文的内容在哪

> 「信息只搬家、不丢失」的检索入口。以下内容全部**仍在原提交里**，
> 用 `git show <sha>:packages/codegraph/DEFECTS.md` 取回该时点的全文。

| 被移出的内容 | 在哪 |
|---|---|
| **附录：审计原文**（CG01 / CG02 / CG03+CG04+CG06 / CG09+CG10 / CG11 五段逐条证据与实测输出，描述的是 0.4.1 状态） | `git show e21dbc70:packages/codegraph/DEFECTS.md` |
| **验收记录**（2026-09-19 对 0.4.2 工作树的独立复跑：7 道门槛表 + 8 条真机 CLI 探针 + 路由面复核 + 「验收时点仍未闭环的项」） | 同上 |
| **补记：验收后补齐浏览器半体的纯逻辑测试**（`client-src/pure.js` 抽取、内联锚点为什么必须放 factory 内、15 条用例） | 同上 |
| **批次**（原计划 0.4.2 / 0.4.3 / 0.4.4 三批次并入一次发布 + kit 0.4.1 随发流程） | 同上 |
| **合并前的三张表与原章节标题**（`## 索引` / `## 第二轮（评审波）：CG30–CG38` / `## 第三轮（独立评审 + 实证复核）：CG50–CG62`） | 同上 |

> 本包**从未**有过 docker 那种「逐条 postmortem 详情节」（症状 / 现场复现 / 根因 / 修法 / 回归 /
> 反向验证六段式）——它的索引行本身就是结论，所以 §4 比其他包短。
