# @hyzyn/dsh-codegraph 缺陷审计与修复记录

> 2026-09-19 对 v0.4.1 做了一次系统性审计（宿主半体与浏览器半体逐行复读 + 3 路并行核对
> kit 契约 / dsh-mcp 与运行时 loader 的实际消费方 / CI 与测试面 + 真机 CLI 实测），
> 产出 **CG01–CG29 共 29 条**；同日在工作树上把 **29 条全部修复**，随 **0.4.2** 发布。
> 原计划的三批次（0.4.2 / 0.4.3 / 0.4.4）并入同一次发版，见「批次」一节。
>
> 审计基线：插件 0.4.1 / kit 0.4.0｜codegraph CLI **1.6.0**（两处安装，
> 仓库自身有 41MB 索引）。跨包核对读到的运行时是 npx 缓存里那份 `@deepseek-ai/*`
> （dsh 0.1.0-rc.7 / cordis 4.0.1），不是 README 声称实测过的 0.1.5-rc.2；本机当前装的
> 又是 0.1.6-alpha.2（README 的兼容性一节已改为「版本矩阵 + 验证方式」，见 CG42）——凡涉及
> 「loader / dsh-mcp-client 实际怎么消费」的结论换宿主版本后要重核。
>
> **本次连带改了 `@hyzyn/dsh-kit`（0.4.0 → 0.4.1）**：CG13 的 `dshHome()` 归一化与
> CG05 的 `killProcessTree()` POSIX 支持、`spawnPortable({ detached })`。全仓 7 个包
> 的 kit 精确 pin 已同步 bump 并过 `pnpm aggregate` + `pnpm install --lockfile-only`。
>
> **第二轮（评审波，同日）**：对修复后工作树的独立评审确认 CG01–CG29 里 28 条落地，
> 并新发现 **CG30–CG38**；其中 CG30/CG31/CG35/CG36/CG37/CG38 已修（CG15 的 4xx 判定
> 过宽一并收窄），**CG32–CG34 评审原文未随附、仓库亦无记录**（2026-09-22 复查 git 全历史，零命中）→ 见索引表，已关闭并改为可执行复核。评审里
> 「README 引用不存在的 verify-codegraph-indexforce.mjs」一条为假阳性（该文件在仓库
> 根且被 git 跟踪），已核实并记录在案。
>
> 修复后的回归门槛（全绿）：`tsc --noEmit -p packages/codegraph/tsconfig.json` 干净；
> `npx vitest run packages/codegraph` = **110 tests / 5 files**（审计时 65）；全仓
> `npx vitest run` = 618 tests / 40 files；`pnpm -r build` 后 artifact-diff 干净
> （client.js 现在有了「产物 = 源码」闸，CG28）；`node scripts/check-dsh-home.mjs` 通过。

## 现状

**已修 41 / 已关闭 3 / 待修 0**（CG01–CG29 + CG30/31/35/36/37/38 修于 0.4.2；CG39–CG43 修于本轮；
CG32–CG34 **因原文从未随附而关闭**，不再挂账）。索引表的「修复」列一句话记录改法与落点；行号已漂移，定位用
`grep -n` 找符号（`locateIndex` / `locateCwdEdits` / `readPostBody` / `runViaSpawn` /
`ensureStyle` / `installSessionReporter`）。代码里带 `CGxx` 注释的位置就是对应修复点，
改到相关代码时请先读那里的注释。

审计时点的「好消息」仍然成立：**没有远程可达面**。kit 的 `isLoopbackRequest`
（`packages/kit/src/http.ts:51-71`）覆盖全部 14 条路由（新增 `/cancel` 同样过这道门禁）。
> 0.4.2 之后新增第 15 条 `/diagnose`（只读，走同一个 `guard`），同样过这道门禁——本句的
> 「14 条」是审计时点的数字，保留原样不改。剩余权限边界是「本机任意进程可驱动」——CG07 把任意字符串挡住了，但本机进程仍可上报
一个真实存在的已索引目录；这是 loopback 模型的固有边界，不是缺陷。

## 索引

| CG | 严重度 | 症状（一句话） | 修复（0.4.2） |
|---|---|---|---|
| CG01 | P0 | POST body 畸形/超限时静默改用**默认项目**执行 sync/index/init | 六条 POST 路由统一走 `readPostBody`：`readJsonBody` 返 `undefined` 即 400（`/follow` 原有写法推广到全部） |
| CG02 | P1 | 索引判定只看本目录，与 CLI 的向上解析分叉 → monorepo 子目录 followSession 永久回落、default-path 回 400、卡片自相矛盾 | 新增 `locateIndex()`：向上走祖先（git 根止步），命中根作为 `projectPath`；`effectiveProjectPath` 与 `/default-path` 绑定**根**；子目录 `/init` 回 409 |
| CG03 | P1 | 重写 dsh-mcp 区块是有损往返：override 形状与注释被静默删除 | `locateCwdEdits()` 定点只改 codegraph 行的 `cwd:` 一行（含补插），区块内其余字节不动；flow style 定位不到才退回整块重写 |
| CG04 | P1 | 与 dsh-mcp 并发写同一个 cordis.patch.yml 无 CAS，交叠即丢行 | `syncMcpRowOnDisk` 盖章复核（mtime+size → 读 → 算 → 复核，≤3 次重读后强写），与 dsh-mcp 的写前复核对偶 |
| CG05 | P1 | 超时/取消在 POSIX 上没兜底：killProcessTree 是 no-op、无 /cancel、不监听断连 | 运行器统一成 spawn（POSIX `detached` 组长）；SIGTERM → 3s 清理窗 → SIGKILL；断连接线（CG30 修正为 res close）；新增 `POST /cancel` + 卡片「取消」按钮；kit 侧 killProcessTree 支持 POSIX（有真机进程组测试） |
| CG06 | P1 | 区块解析失败被当「没有区块」→ 追加第二个区块 → serverName 撞名整体加载失败 | `parseBlockRows` 返回 `{ rows, error }`；任何区块解析失败即拒绝写并报原因；空块/被清空时把行**插进现有区块**（行编辑，不再造第二个块） |
| CG07 | P1 | `/follow` 对上报路径零校验却立刻落盘改 MCP cwd | 非空 path 先过 `directoryError`（400）；索引有效性仍由 `locateIndex` 现算。loopback 内「本机进程可上报真实目录」是模型固有边界，记录在案 |
| CG08 | P1 | 卡片 CSS 模块级单例：任一实例卸载即 remove，另一张卡片全裸 | `ensureStyle`/`releaseStyle` 引用计数（卡片 useEffect 挂钩），减到 0 才摘节点；apply 里全局注入/摘除的旧 effect 移除 |
| CG09 | P2 | query/callers/callees/impact/node 位置参数无 `--` 终止符：`-h` → exit 0 + help → 卡片显示「没有结果」 | 五条路由位置参数前统一补 `--`（argv 快照测试钉住） |
| CG10 | P2 | `limit` 零校验：`-1`/超大值 exit 0 + `[]`（静默空结果）；路径不存在也静默空 | `positiveIntParam` 校验（`limit` 钳 10000；`depth` 只挡垃圾值，上限留给 CLI 自己夹）；全部 GET CLI 路由先过 `directoryError` |
| CG11 | P2 | 状态面板忽略 CLI 的过期信号（reindexRecommended / builtWithVersion / 提取器版本 / worktreeMismatch） | 卡片 `staleReasons()` 汇总四字段（顶层与 `index.*` 嵌套都读）→ 面板警告行 + 点名「重建索引」 |
| CG12 | P2 | 托管行不校验 cwd 还在；项目被删后坏行长期留着且不可见 | `McpSyncStatus.cwdExists`（每次快照现算）+ 卡片「⚠ cwd 目录已不存在」 |
| CG13 | P2 | `~/.dsh` 缺失时挂载期抛错整插件起不来；`DSH_HOME=~/x` 写的与 loader watch 的不是同一文件 | kit `dshHome()` 归一化（`~` 展开 + resolve，与 loader 同口径）；`syncMcpRowOnDisk` 包 try/catch，失败显式报错并把原因写进状态 note |
| CG14 | P2 | `enabled:false` 早退时不撤销托管行，而卡片（唯一撤销入口）已消失 | 早退分支先跑一次 `manageEnabled:false` 的同步再 return |
| CG15 | P2 | 会话上报失败永不重试（`lastSent` 写在 fetch 前） | `lastSent` 只在成功/4xx 后落位；网络错/5xx 指数退避重试（1s→30s） |
| CG16 | P2 | `loadSymbol` 失败不清 `detail`：新符号标题配旧符号的 callers/callees | 进函数先 `setDetail(null)` |
| CG17 | P2 | 关系列表静默截断 30 条 | 截断时显示「已显示前 30 条，共 N 条」 |
| CG18 | P3 | 冲突判定要求 name 精确等于 `@deepseek-ai/dsh-mcp-client`，换包名检不出撞名 | `isCodegraphServerRow` 只按 `config.serverName` 判定 |
| CG19 | P3 | `findBlock` 宽泛 substring：开始标记被删时孤立结束标记被当块头 | 开始行必须含 startKey **且不含** endKey；配套测试（孤儿标记 → 新建分支 + 幂等） |
| CG20 | P3 | `INDEX_DB_SUFFIX` 注释与事实不符（`.db-wal`/`-shm` 不以 `.db` 结尾） | 注释纠偏；判据保持后缀匹配（上游改主库名仍兼容） |
| CG21 | P3 | reprobe 无并发去重；卡片两个动作共用一个忙态互相禁用 | 服务端 `probeInFlight` 复用同一 Promise；卡片 `reprobing` 独立忙态 |
| CG22 | P3 | 一切带 signal 的失败都报成「超时」，OOM 被引向调大超时 | 超时改用运行器置的 `timedOut` 标记判定；`cancelled` 单独文案 |
| CG23 | P3 | `positiveOr` 把 0 静默回落默认：`cliTimeoutMs: 0`（想表达不限时）得 60s | `timeoutOr`：0 = 不限时（运行器不设计时器），负数/NaN/Infinity 才回落 |
| CG24 | P3 | settings schema 声明了 `enabled`/`command` 但从不读取 | 从 schema 删除 |
| CG25 | P3 | 模块级 `runtimeSyncRef` 单例：同名不同 id 的两实例串台 | runtime 改为 apply 内实例私有 `runtimeRef`，路由/快照经访问口读取（测试：两实例设置互不可见） |
| CG26 | P3 | 工程闸门缺位：无 test script；verify-sync.mjs 与 vitest 重复；indexforce 脚本没接线 | 补 `test` script；删除 `scripts/verify-sync.mjs`（managed-mcp.test.ts 全覆盖）；`scripts/verify-codegraph-indexforce.mjs`（需真机 DSH，无法进 CI）写进 README 开发节与 tty 的 live 脚本同列 |
| CG27 | P3 | 5/13 路由零测试；`/node` 不能带 `--json` 的真实约束无测试钉住 | 补 query/callers/callees/impact/node 三态（缺参 400 / 200 argv 快照 / 非零退出 500）+ node 无 `--json` 断言 |
| CG28 | P3 | 手写 client.js（51KB）没有「产物 = 源码」闸门 | 拆 `client-src/index.js` + `scripts/build-client.mjs`（原样拷贝），`build` 产出 client.js，CI 既有 artifact-diff 覆盖 |
| CG29 | P3 | 文档漂移：README Config 少 `followSession`；兼容性只写 1.5.0；`files` 不含 README.en.md | Config 补 `followSession` + 超时 `0` 语义；兼容性改版本矩阵（1.5.0 macOS / 1.6.0 Windows+macOS）；`files` 加 `README.en.md`；英文 README 同步 |

## 第二轮（评审波）：CG30–CG38

| CG | 严重度 | 症状（一句话） | 处置 |
|---|---|---|---|
| CG30 | P1 | 断连取消不成立：`req 'aborted'` 在 body 消费完之后**不触发**（真机 HTTP 实测：POST body 读完客户端断连，只有 `res:close` 且 `writableEnded=false` 会来）——CG05 的断连兜底是死代码 | `abortOnDisconnect` 改挂 `res.on('close')` + `writableEnded` 判定（写完才关 ≠ 断连）；三个索引类 POST 路由接的是它 |
| CG31 | P1 | `locateCwdEdits` 只向下扫：`cwd:` 写在 `serverName:` **之前**时找不到、在后面补出第二个 `cwd:` → js-yaml 抛 `duplicated mapping key`，**整份 cordis.patch.yml 拒载**（比 CG03 原伤更重，真机复现实锤） | 扫描改双向（行内上下都找同缩进的 `cwd:`；缩进变小即离开条目，不跨行）；复现形状进回归测试（单 cwd + `yaml.load` 不抛 + 幂等） |
| CG32 | — | **定义未获取**：评审原文未随附，仓库与 git 历史均无记录（2026-09-22 复查：`git log -S` 全历史零命中） | **关闭**：无法补齐定义。改为对该批判最可能涉及的面向做**可执行复核**——新增门禁矩阵用例（POST 路由的 body 门禁 + 全路由回环门禁，含变异验证） |
| CG33 | — | **定义未获取**：评审原文未随附，仓库与 git 历史均无记录（2026-09-22 复查：`git log -S` 全历史零命中） | **关闭**：无法补齐定义。改为对该批判最可能涉及的面向做**可执行复核**——新增门禁矩阵用例（POST 路由的 body 门禁 + 全路由回环门禁，含变异验证） |
| CG34 | — | **定义未获取**：评审原文未随附，仓库与 git 历史均无记录（2026-09-22 复查：`git log -S` 全历史零命中） | **关闭**：无法补齐定义。改为对该批判最可能涉及的面向做**可执行复核**——新增门禁矩阵用例（POST 路由的 body 门禁 + 全路由回环门禁，含变异验证） |
| CG35 | P2 | kit 归一化成了「半仓统一」：`dshHome()` 归 kit，全仓还有 8 处 raw 副本（env:68 / profile:44 / prompt:79 / search:39 / mcp:76 / tty:2000+2060 / shell-integration:48）——`DSH_HOME=~/x` 时 codegraph 与 dsh-mcp 写**两个不同**的 cordis.patch.yml（改动前至少写同一个错的） | 8 处副本全部改走 kit 的 `dshHome()`（env / prompt 补 `@hyzyn/dsh-kit` 依赖并 bump）；新增 `scripts/check-dsh-home.mjs` 防回归闸（只认 kit 一份推导）接进 CI；连带 bump env/prompt/profile/mcp/search/rss/tty |
| CG36 | P3 | kit `killProcessTree` POSIX 分支无条件先打 `-pid`，而 dsh-mcp 的连接测试子进程不是组长（mcp:646 无 detached）——正常 ESRCH 被吞，窄窗口是「子进程已退出且 pid 被复用为组长」；这是另一个包的行为改变 | kit 加 `{ group }` 选项且**默认关**：只有 codegraph 运行器（自己 detached 启动）显式 opt-in，dsh-mcp 经默认路径回到「只单杀」的原语义 |
| CG37 | P3 | CG08 的引用计数在闭包里、节点却文档级共享：同一份 client.js 被再次执行（HMR / 重载不换 document）时，新一代 `ensureStyle` 命中旧节点早退、`styleEl` 恒 undefined 摘不掉；反向旧代卸载摘掉新代在用的节点 | 计数改挂在**元素 dataset** 上（`cgRefs`）：ensure/release 都按 id 找节点、增减 dataset——跨代共享的节点配跨代共享的计数 |
| CG38 | P3 | `build-client.mjs` 用**字符串** replace 内联 pure.js：内容里一旦出现 `$&` / `$'` / `$1` 会被当替换模式吃掉，且确定性、CI 照绿（当前 pure.js 零 `$`，潜伏） | 改函数替换 `replace(markerPattern, () => inlined)`；用含 `$& $1` 的探针实测穿透，pure.js 已还原 |
| CG44 | P2 | **工具栏按钮溢出被裁**（用户截图实证）：`.cg_toolbarBtns` 是 `flex-wrap:nowrap` + `flex-shrink:0`——**整组不许断行**。早期 5 个按钮（约 300px）时这招是对的（要么整组留在标题右边、要么整组换行）；P2 加到 9 个（约 637px）后侧边栏只有 ~360px，整组不许断行就只能溢出，**「撤销索引」被裁掉、点不到**。同因还有两处：搜索行仍是固定 3 列 `grid-template-columns`（P2 把「探索/上下文」放进这一行后变成 5 项，会把两个输入框挤到不可用）；「探索/上下文」原本放在工具栏，但它们吃的是**搜索框的关键词**，语义错位又让工具栏更长 | ① `.cg_toolbarBtns` 改 `flex-wrap:wrap` + `justify-content:flex-end`（折成两行，实测 2 行 357/272px）；② `.cg_row` 从固定 grid 改 `flex-wrap:wrap`，输入框 `flex:1 1 160px` 可压缩；③ 把「探索/上下文」移到搜索行（与「搜索」同组，共用 query），「诊断包」从「撤销索引」之后移到只读组末尾（只读动作不该紧邻破坏性动作）；④ 新增**布局守卫用例**（读源码断言这两处必须 `flex-wrap:wrap`、输入框必须可伸缩、探索/上下文必须与搜索同区），并做变异验证：还原成 nowrap / 固定 grid 时用例立刻红 |
| CG43 | P3 | **自动重建用例的固定 sleep 导致全仓偶发失败**：三条用例用 `await wait(300/400/500)` 等异步链（status → 判定 → index），而它跑在**真实子进程**上——单跑一个文件够，全仓并行（47 文件抢 CPU）时不够。实测表现为「索引新鲜」那条偶发断言到 `status 调用数 === 0`，且**只在全仓跑时出现、单跑必绿**（最容易被人当成「环境抖动」放过） | 加 `waitFor(check, timeout)` 条件轮询替代固定 sleep：正向断言一律等「事情真的发生过」；反向断言（默认关 / 未索引不该调用）没有条件可轮询，则给足时间并写明这是反向断言。连续 8 轮全仓全绿 |
| CG42 | P3 | **文档里的宿主版本基线自相矛盾**：README 称「已在 `0.1.5-rc.2` 上实测全链路」，DEFECTS 记的审计基线却是 `0.1.0-rc.7`，而本机实际在跑的是 **`0.1.6-alpha.2`**（`dsh.engines.dsh` 声明的下限 `>=0.1.2-rc.1` 又是第四个数）。三个版本号并存，谁也没说清「哪一档是验证过的」；且 `0.1.5-rc.2` 那句「实测」没有任何可复跑的脚本，而单测的 fake req/res 覆盖不到浏览器半体的供给面 | README 兼容性一节改为**版本矩阵**：每一档注明**验证方式**，`0.1.6-alpha.2` 挂 `scripts/verify-codegraph-host-contract.mjs`（真宿主 25/25），`0.1.5-rc.2` 如实标注「当时无脚本、覆盖不到供给面」，`0.1.0-rc.7` 说明它是审计当时的包版本、与本机安装的不是同一个；`0.1.2-rc.1` 明确为**声明下限 ≠ 已实测下限**。新增的真机脚本同时补上了长期缺失的「宿主契约」端到端（此前只有 indexForce 那一条） |
| CG41 | P3 | **自动重建与 CLI 探测的竞态**：门禁写成 `cliProbeState.available !== true` 时，探测（挂载后异步跑，实测 200–300ms）尚未落地的窗口里，会话的第一条 `user/message` 会被静默跳过——表现为「自动重建时好时坏」。这是写用例时才暴露的：同一份代码三次断言里有一次不查 status | 判据改为只在**已确认不可用**（`=== false`）时跳过；代价是 CLI 真缺失时每项目多起一次注定失败的子进程，可接受。用例「每项目每次运行最多一次」与「索引新鲜」正是钉这个竞态的 |
| CG40 | P3 | **采纳率分类器错收**：第一版只匹配「read / search」词根，于是 `read_image`（真实历史 248 次）、`read_pdf`、`web_search`（19 次）被算成「代码探索」——读截图、搜网页跟 codegraph 毫无关系，单这一个错误把分母灌了 11%（2344 → 2077 次），采纳率 2.2% 被压到 2.0%；反向问题是宽口径把 `read` 全算进分母，而 `read` 真实占 1956 次（grep 只有 100 次），导致「2.2%」这种会误导人的数字 | 加 `NON_EXPLORATORY_PATTERNS`（媒体 / 网络 / 文档类先判 other，先于文件探索匹配）；新增窄口径 `discovery`（grep/glob/search/find/list，排除 read），`/metrics` 与卡片同时报两个口径并标注主口径。实测数据与结论见 [ADOPTION-AUDIT.md](./ADOPTION-AUDIT.md) |
| CG39 | P3 | **「init 只走 `init -- <path>`」偶发失败（两个独立成因，第二个才是主因）**：① 共享夹具 `emptyDir` 被 stub 写过 `.codegraph/`，复用即 409；② **断言本身写错**——`expect(argvToString).not.toContain('-y')` 会在整串输出上做子串匹配，而 `mkdtempSync` 的后缀是随机的，实测路径 `…/dsh-cg-route-yoKvfJ/…` 里就带 `-y`，于是「十次里红一次」且每次红在不同机器/运行上，看起来像产品 bug（全仓并行运行时更易命中） | ① 该用例与 409 用例各自 `mkdtempSync` 现造目录，删掉共享夹具；② 改为**解析 argv 后逐项比对**：`argv.filter(a => a.startsWith('-') && a !== '--')` 必须为空 + 完整 argv 相等（`--` 是位置参数终止符不是选项）。两个成因都已验证：前者同进程连续两次 init → 200 后 409；后者用含 `-y` 的路径直接复现旧断言判红、新断言通过 |

> **CG32–CG34 的关闭理由**：缺陷台账的价值在于「每条都能落到代码」，而三条没有定义的条目永远落不下来——挂着它们会让「待修 N」这个数字长期失真。关闭不等于「已修」，是**承认无法修复**，并用一条覆盖同类风险的用例顶上。
>
> **0.4.2 之后的增补**：前瞻项记在 `ROADMAP.md`，已落地三项（systemPrompt 注入加索引门禁、
> `GET /diagnose` 诊断包、采纳率仪表），详见其「已完成」一节。**只有已确认的缺陷进本文编号**
> （本轮新增 CG39–CG44），新发现的缺陷继续按编号往后续。
| CG15 追记 | P3 | 修复波把「4xx 一律视为明确拒绝、不再重试」定得过宽：宿主启动期路由未挂上时 `/follow` 得 404 → 永久放弃 | 404 与 5xx 同为瞬态，一并退避重试；其余 4xx（400 目录不存在等）保持记值不重试 |

另有一条评审自报后自否的假阳性，留档防重查：「README 引用了不存在的
`scripts/verify-codegraph-indexforce.mjs`」——该文件在**仓库根**且被 git 跟踪，
README 开发节整块是仓库根相对路径，引用成立。

## 批次

原计划三批次（0.4.2 静默错误类 / 0.4.3 写入纪律 / 0.4.4 超时取消与工程闸门）在同一天
全部修完，**并入 0.4.2 一次发布**。kit 0.4.1 随发（CG05 / CG13 的 kit 侧改动）；
7 个消费包的精确 pin 同步 bump（流程：bump → `pnpm aggregate` → `pnpm install
--lockfile-only`，见 RELEASING.md）。

## 待办 / 路线图（未做部分，仍是规划不是缺陷）

> 新发现的缺陷接着 `CG30` 往后编号记在本文，不要只留在对话里。
>
> **分档（P0–P3）、代价、架构项与开工顺序见 [ROADMAP.md](./ROADMAP.md)**——本节保留
> 缺陷审计时点列出的原始待办（CLI 面 / 查询参数 / 多项目列表 / 遥测 / daemon / i18n / E2E），
> 两者不重复：`ROADMAP.md` 只做分档与补充架构项。

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

## 复核方式

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

## 验收记录（2026-09-19，对 0.4.2 工作树的独立复跑）

结论：**29 条全部落地、7 道门槛全绿、CLI 实测 8/8 复现**，未发现虚报或已回归的条目。
下表是独立复跑的结果，不是上文的自述转抄：

| 门槛 | 独立实测 |
|---|---|
| `npx tsc --noEmit -p packages/codegraph/tsconfig.json` | exit 0，零诊断 |
| `npx vitest run packages/codegraph` | 93 passed / 4 files |
| `npx vitest run`（全仓） | 587 passed / 38 files |
| `pnpm -r build` 后产物比对 | 103 个 `client.js` / `lib` 产物构建前后**逐字节一致**（CG28 的「产物 = 源码」闸成立） |
| `node scripts/client-lint.mjs` | exit 0，仅 1 条已知 TS2339 噪音 |
| `pnpm aggregate` | 幂等，`package.json` 无变化 |
| `pnpm install --lockfile-only --frozen-lockfile` | exit 0，7 个消费包 pin `0.4.1` → `link:../kit` |

真机 CLI（`codegraph 1.6.0`）8 条探针全部复现上面的「复核方式」：`--version`=1.6.0；
`~/.codegraph` 无 `.db`；`status` 的 `projectPath` 指回仓库根；`callers -- -abc` exit 0 正常 JSON；
`query --limit -1` exit 0 + `[]`；`node --json` exit 1 + `unknown option '--json'`；
`impact --depth 99999` 自夹到 `depth: 10`；`sync -- <空目录>` exit 1 + `CodeGraph not initialized`。

路由面复核：14 条路由全部过回环门禁（13 处 `guard()`；`/default-path` 因同时接受 GET/POST，
内联 `isLoopbackRequest`），与「没有远程可达面」一致。

**验收时点仍未闭环的项**（与上文「审计里当时没实测」同源，非新增缺陷，列出以便下次接手）：

- **浏览器半体自动化测试从零到部分覆盖**（验收时点为零，见下面的补记）：CG08 / CG16 这类
  只在渲染期暴露的 bug 仍无覆盖，CG11 / CG15 / CG17 已补上。
- CG04 的 CAS 是竞态，静态阅读不能证明；CG14 / CG21 / CG22 同样无测试钉住，仅源码核验。
- CG05「CLI 忽略 SIGTERM」、CG13「`DSH_HOME` 指向不存在目录的真机宿主」、
  CG08「0.1.6 两插槽同屏渲染两张卡片」三项真机实测仍待补。
- CG29 版本矩阵里 `1.5.0`（macOS）一档本机不可复现（只有 1.6.0）。
- **0.4.2 仅存在于工作树**：HEAD 仍是审计基线，「随 0.4.2 发布」目前是待办；
  且工作树里 codegraph 的改动与其他包的改动混在一起，尚未按「批次」一节的边界切分提交。

### 补记：验收后补齐浏览器半体的纯逻辑测试（同日）

上面点名的「浏览器半体零自动化测试」是验收时最大的空洞，随后按「抽纯函数 + 构建期内联」
补掉了一半——不引入任何 devDependency，产物仍是单文件：

- 新增 `client-src/pure.js`：把三段**无 DOM / React 依赖**的判定搬出组件闭包——
  `staleReasons`（CG11）、`nextRetryDelayMs`（CG15）、`truncationNote` + `REL_LIMIT`（CG17）。
  它们在闭包里时只能靠真渲染到那条分支才发现写错。
- `scripts/build-client.mjs` 从「原样拷贝」变成两步替换：删掉 index.js 顶部对 `./pure.js`
  的 import 行，剥掉 pure.js 的 `export` 前缀后内联到 factory 里的
  `__CODEGRAPH_PURE_INLINE__` 锚点。**内联点必须在 factory 内**：放文件顶层的话，页面重载 /
  HMR 再次执行同一份 client.js 会「Identifier has already been declared」。
  脚本带两道自检（找不到 import / 找不到锚点 / 产物残留 import 都直接 exit 1）。
- 新增 `test/client-pure.test.ts`，15 个用例覆盖上述三条判定（含嵌套 `index.*` 字段、
  字符串 `"true"` 不误报、退避阶梯到顶后稳定、恰好等于上限不提示等边界）。

实测（本轮）：

| 项 | 结果 |
|---|---|
| `npx vitest run packages/codegraph` | **108 passed / 5 files**（验收时点 93 / 4） |
| `npx tsc --noEmit -p packages/codegraph/tsconfig.json` | exit 0 |
| `node scripts/client-lint.mjs` | exit 0；**反向验证**：往 pure.js 塞一个未定义名字 → exit 1 且点名该行，证明新抽出的文件真在这道防线内 |
| `pnpm -r build` 后产物比对 | 逐字节一致（CG28 闸仍成立） |
| 产物可执行性 | 在 `node:vm` 沙箱里跑构建产物：`load()` 正常注册、`factory` **连续执行两次不报重声明**、exports 仍是 `{inject, apply}` |

仍未覆盖：`client-src/index.js` 里依赖 React / DOM 的部分（CG08 样式引用计数、CG16 清详情、
CG17 的渲染分支）——要覆盖它们得引入 react + jsdom 或 happy-dom，本次刻意没加。

> 注：本轮验收期间**另一个工作流正在同一工作树里改 docker 包**（D73/D74：19:20–19:32 间改了
> `packages/docker/*` 与 `scripts/client-lint.mjs`）。上面全仓 587/38 的数字是 19:19 时点的
> 快照；此后全仓变成 616/40，差额里含对方新增的 `docker/test/ssh-connect.test.ts`。本包自己的
> 数字（108/5）不受影响。`scripts/client-lint.mjs` 的「兄弟模块锚点」能力也是对方在 19:22
> 加的——本方案的静态检查正好依赖它。

## 附录：审计原文（时点快照，描述的是 0.4.1 的状态，已被上文修复）

### CG02 —— 索引判定的口径分叉，本仓库就能复现

`indexState()` 的注释把「为什么不能只看 `.codegraph/` 存在」讲得很透（家目录的
`~/.codegraph` 是 CLI 安装目录），这一条**实测成立**：`ls ~/.codegraph` 里只有
`bundles/`、`codegraph.lock`、`current -> versions/v1.6.0`、`daemon.*`、`daemons/`，
一个 `.db` 都没有 —— 插件把它判成 `not-a-project` 是对的。

但它漏了另一半：CLI 自己**向上**解析项目。`codegraph status --json -- packages/codegraph`
返回的 `projectPath` 是仓库根、`initialized:true`。于是同一个目录在两个口径下结论相反：

- 会话 cwd 是 `packages/*`（monorepo 的日常）→ `effectiveProjectPath` 判它「非有效索引」→
  托管行回落到默认项目，卡片附一句「会话目录没有可用的 .codegraph/ 索引」，而 CLI 用得好坏。
  **`followSession` 在这类仓库里等于永久失效**，且失效得像是「目录没索引」。
- `POST /default-path` 对同一目录回 400 并让用户「先在根目录 codegraph init」——
  那个索引已经存在（就是父目录那份），照做只会在子目录里再建一份嵌套索引。
- 卡片自己会前后矛盾：状态面板走 CLI 口径显示「● 已索引」，`defaultWarning` 走
  `indexState` 口径说「不是有效索引」，两者同屏出现。

### CG01 —— kit 的 `readJsonBody` 不抛错，所以「解析失败」长得像「没传 path」

6 个 POST 路由都写 `(typeof body?.path === 'string' && body.path.trim()) || currentDefaultPath()`。
kit 侧的契约（有测试）是：超过 `MAX_JSON_BODY_BYTES`、JSON 畸形、空 body、body 是数组/标量
—— **全部返回 `undefined`，不抛错**。于是围栏只到「必须是布尔」那一条（`/settings`），
写操作路由把「请求体没读出来」当成「用户没指定路径」，转而在默认项目上执行。

`/follow` 是唯一做对的（`body === undefined → 400`），这本身就说明其余几处是漏而不是设计。
注意超限那条还有个次要后果：kit 超限直接返回、不排空流（http.ts:93-94 自己写了），
客户端拿到的是连接被断而不是 4xx。

### CG03 / CG04 / CG06 —— 同一个文件的三个写者，只有 codegraph 不做保护

`~/.dsh/cordis.patch.yml` 上同时有 dsh-mcp（`spliceManagedBlock` + mtime+size 弱 CAS，≤3 次重试后
**仍然强写**）和 codegraph（裸 read→splice→rename）。codegraph 的写触发点比想象密：挂载、
`settings/updated`、卡片每次 `/follow`（切会话）、`/init` 成功后、`/settings`、`/default-path`。
一次「打开设置页 + 切会话 + MCP 卡片点保存」就是三次读改写，其中任意两次交叠就丢行。

而 CG03 是比丢行更安静的一类：`parseBlockRows` 只认 `- insert: [...]`，
`renderBlockBody` 用 `yaml.dump` 整块重写 —— 区块里一条 loader 合法的 override 行
（`- id: x` + `config:`）或任何注释，都会在一次「只是改了下 cwd」的同步里消失。
它改的还是**别人的**区块（复用 dsh-mcp 行时）。

### CG09 / CG10 —— 实测出来的「静默空结果」比报错更糟

`codegraph query --json --path . --limit 2 -h` 的实测结果是 **exit 0 + 一段 help 文本**。
路由 `runJson` 解析不出 JSON，回落 `{raw: output}`，客户端 `Array.isArray(data.results)` 为假 →
渲染成「没有结果」。用户看到的是「这个仓库里没有匹配的符号」，真相是「你把我当命令行玩了」。
同样 exit 0 + `[]` 的还有 `--limit -1` 和 `--limit 99999999999`。
反过来 `--depth 99999` 是安全的：CLI 自己夹到 10（实测），所以 depth 不构成 DoS。

### CG11 —— 卡片缺的不是字段，是「索引可信吗」这个判断

实测本仓库的 `status --json` 里躺着四个可用性字段，`statusCells` 一个都没用：
`index.reindexRecommended:true`、`index.builtWithVersion:"1.1.1"`（对 CLI `version:"1.6.0"`）、
`builtWithExtractionVersion:24 < currentExtractionVersion:25`、`worktreeMismatch`。
CLI 明说「建议重建」，卡片说「● 已索引」，MCP 工具继续给基于旧提取器的图 ——
这是最容易被当成「codegraph 结果不准」的那类状态，而它本可以在卡片上一句话讲清。
