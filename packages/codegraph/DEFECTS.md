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
> **编号是硬契约**：`CG01–CG63` 是 `packages/codegraph` 内部序列，与 docker / tty 的 `Dxx`
> **不共享**；跨包引用请写「codegraph CG02 / docker D03」。新缺陷接在 `CG63` 之后，
> **不得重号、不得回收空号**——源码里已有注释指向它们。

> **本文不含**：逐条 postmortem 的完整原文、独立验收复跑记录、原批次计划。
> 它们冻结在自己那一版提交里，见 [§4 冻结记录](#4-冻结记录被移出正文的内容在哪)。

## 维护规则

1. **新缺陷只做两件事**：索引表加一行 + 在代码注释里落编号。详细的现场 / 根因 / 修法 / 反向验证
   写进 **commit message**，正文不展开。
2. **索引表超过约 80 行时**，把最老的 20 条整体移到 `DEFECTS-archive.md`。
3. 索引表**不写行号**：修复后代码移了位、有的整段被删或重写，审计时点的行号只会误导。
   定位实现请用症状列的关键词 `git log -S'<关键词>'`，或读代码里带 `CGxx` 的注释。
4. 阈值 / 口径 / 基线数字**只增不改**：发现过期或自相矛盾，就在原处加一行 `> ⚠️ 标注`
   说明，**不擅自"修正"**。

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

**已修 60 / 已关闭 3 / 待修 0**，编号至 `CG63`。逐条见 §1；未做项见 [ROADMAP.md](./ROADMAP.md)。

**已修 60 / 已关闭 3 / 待修 0**（CG01–CG29 + CG30/31/35/36/37/38 修于 0.4.2；CG39–CG49 修于其后一轮；
CG50–CG62 修于上一轮；CG63（DSH 0.1.7-rc.1 的 settings 服务迁移）修于本轮；CG32–CG34 **因原文从未随附而关闭**，不再挂账）。索引表的「修复」列一句话记录改法与落点；行号已漂移，定位用
`grep -n` 找符号（`locateIndex` / `locateCwdEdits` / `readPostBody` / `runViaSpawn` /
`ensureStyle` / `installSessionReporter`）。代码里带 `CGxx` 注释的位置就是对应修复点，
改到相关代码时请先读那里的注释。

> **数字口径（原文照录）**：`已修 = 表内去重编号数 − 已关闭数`，实测复现过历史每一档
> （`dd3de493` 35、`1dc45292` 40、`7b24ce2b` 41、`79658a8f` 42）。当前 63 − 3 = **60**。
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
| CG40 | **采纳率分类器错收**：第一版只匹配「read / search」词根，于是 `read_image`（真实历史 248 次）、`read_pdf`、`web_search`（19 次）被算成「代码探索」——读截图、搜网页跟 codegraph 毫无关系，单这一个错误把分母灌了 11%（2344 → 2077 次），采纳率 2.2% 被压到 2.0%；反向问题是宽口径把 `read` 全算进分母，而 `read` 真实占 1956 次（grep 只有 100 次），导致「2.2%」这种会误导人的数字 | 加 `NON_EXPLORATORY_PATTERNS`（媒体 / 网络 / 文档类先判 other，先于文件探索匹配）；新增窄口径 `discovery`（grep/glob/search/find/list，排除 read），`/metrics` 与卡片同时报两个口径并标注主口径。实测数据与结论见 [ADOPTION-AUDIT.md](./ADOPTION-AUDIT.md) |
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
