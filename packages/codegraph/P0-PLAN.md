# P0 方案：agent 侧改 per-agent scoped MCP 挂载

> 2026-09-22。状态：**待你确认后动工**。本文只做方案，未改任何代码。
>
> 结论先说：**技术上可行，机制已逐条核实；但按你自己的使用数据，收益区间很窄，我建议降级为可选项而不是排期项**（依据见「值不值得做」一节，含一个我先算错、后修正的数字）。

## 一、要解决的问题

现状：插件在 `~/.dsh/cordis.patch.yml` 里维护**一行** `@deepseek-ai/dsh-mcp-client`（`config.cwd` = 默认项目），一台 MCP 服务器同一时刻只服务**一个项目**。多项目靠两件补丁：

1. 工具入参 `projectPath`（每次调用显式指定）；
2. `followSession`——把活动会话目录写进托管行的 `cwd`，触发 `watchUserPatches` 热加载重建连接。

架构代价（前几轮已记录，非新增）：

| # | 代价 | 现状缓解 |
| --- | --- | --- |
| 1 | 多项目是**时分复用** | `projectPath` 入参 |
| 2 | 每次会话切换 = 重写补丁文件 + 热加载重建 | 仅在会话目录**是有效索引**时才写；无变化不写 |
| 3 | 两个 DSH 实例并发写同一文件 | mtime+size 盖章 CAS，≤3 次重读 |
| 4 | 跟随依赖**浏览器半体**上报，无 GUI 页面时不生效 | 回落绑定路径 |
| 5 | 每 agent 看到的工具名相同（`mcp__codegraph__*`），多项目时**语义随全局 cwd 漂移** | 靠 `projectPath` 消歧 |

`dsh-simple-codegraph`（对比副本）选的是 per-agent 进程：每个 agent 一个 Cordis scope，各挂一份 `dsh-mcp-client`，`cwd` = 该 agent 会话目录。代价是每 agent 一进程。

## 二、机制核实（全部读运行时源码，非推测）

这是本方案与「照抄 scg」的区别——五条关键机制我都读了实现：

| 结论 | 依据 |
| --- | --- |
| **per-agent scope 可挂 mcp-client** | `dsh-scope` 导出 `createScope(ctx, key, options)`；`dsh-mcp-client` 是标准 cordis 插件（`apply(ctx, config)`，命名导出 `Config`/`apply`/`inject`/`name`） |
| **同一 serverName 跨 scope 不冲突** | `dsh-mcp-client/lib/index.js:812-818`：`const owner = scopeOf(ctx) ?? ctx.root` → `activeServerNames.get(owner)` → 同名则抛错。不同 scope 的 owner 不同，各自持有一份 `names` 集合 |
| **agent 自己那份会 shadow 全局同名工具，且不报错** | `dsh-tools/lib/index.js:2957` `view(scope)`：先铺 `inherited`（全局 + 祖先层），再用 `own.tools.entries()` **覆盖**（`:2973`）；而同 scope 内重复注册才抛错（`NamedEntries` 构造函数 `:2634`，错误信息本身就写着「for a per-agent variant, register through that agent's `agent.ctx` instead」） |
| **工具可见性按 agent 收敛** | `tools.schemas(scope)` / `tools.get(name, scope)` 都接受 agent 作为 viewing scope |
| **agent 生命周期事件与形状齐备** | `agent/created`（载荷 `{ agent, source, signal? }`）、`agent/disposed`；路径在 `agent.session.header.cwd`（多处以这个形式读取）；`agent.ctx.effect(...)` 在 dsh-api-terminal-controller 等包里有先例 |
| `agents` 服务存在 | `dsh-agent/lib/index.js:299` `super(ctx, "agents")`（`list()` 返回活跃会话数组，见 `dsh-session` 同款） |

**一个必须先解决的矛盾**（方案核心，不是细节）：

per-agent 挂载与现有的**托管行**会**同名**。虽然 `dsh-tools` 允许 scope 覆盖全局（不报错），但那条托管行会让**根 scope** 注册一个 `mcp__codegraph__codegraph_explore`，于是：

- 没有索引的 agent（比如在家目录里开的会话）会**继承**全局那份，把 MCP 服务器 cwd（某个别的项目）当成自己的上下文——这正是 scg 文档里宣称要避免、而它自己的实现并没做到的「错误仓库上下文」；
- 因此**两者必须互斥**，不能「都留着当保险」。

## 三、方案

### 3.1 总体策略：agent 路径走 scope，非 agent 路径留托管行

```
apply(ctx, config)
├── mcpScope: 'auto' | 'per-agent' | 'managed'      ← 新增配置（默认 'auto'）
│
├── 常驻（与现状相同）
│   ├── 14+ 条 HTTP 路由（GUI/CLI 面）      ← 完全不动
│   ├── systemPrompt 两段（含索引门禁）      ← 完全不动
│   ├── 采纳率仪表 / 诊断包 / 项目列表       ← 完全不动
│   └── 索引生命周期（unlock / autoReindex）  ← 完全不动
│
└── MCP 挂载（二选一，由 mcpScope 决定）
    ├── 'managed'（现状）：托管一行到 cordis.patch.yml，cwd 跟随会话
    └── 'per-agent'：每个 agent 一个 scope
        ├── agent/created → createScope(ctx, agent) → scope.ctx.plugin(McpClient, { serverName:'codegraph', cwd })
        ├── agent/disposed → scope.dispose()（进程随 scope 回收）
        └── 同时**撤销**本插件的托管行（否则全局同名工具被没有索引的 agent 继承）
```

`auto` 的判定：**有 `agents` 服务且拿得到 agent 事件 → per-agent；否则 → managed**（例如纯 CLI/无 agent 的宿主，或宿主版本没有该服务）。这样默认行为会**变**（这是需要你拍板的点，见「风险」）。

### 3.2 关键实现点

1. **cwd 选取**：用现有 `resolveIndexedRoot(agent.session.header.cwd)`——与托管行 cwd、注入门禁、采纳率**同一口径**。拿不到有效索引时**不挂**（不是回落到默认项目），这正是 scg 文档承诺但代码没做的事（它的 `hasCodeGraphIndex` 只用于路由提示，`install()` 照样挂）。
2. **工具名**：`serverName` 固定 `codegraph`，于是每个 agent 看到的仍是 `mcp__codegraph__codegraph_explore`（单工具、名字稳定）——**不要**走「多行多 serverName」那条路，否则工具名会炸成 `mcp__codegraph-a__explore`，破坏单工具约定。
3. **互斥**：`per-agent` 生效时调 `syncMcpRowOnDisk({ manageEnabled: false })` 撤销本插件托管行；**不碰** dsh-mcp 区块里用户手写的行（沿用现有 `isCodegraphServerRow` 判定）。若检测到**区块外**的手工 codegraph 行 → 拒绝启用 per-agent 并把原因报到卡片（那是用户显式配置，插件无权顶掉）。
4. **失败模式**：单个 agent 挂载失败只记日志 + 该 agent 降级（没有 codegraph 工具），**不**让插件整体起不来；`failOnStartupError` 语义沿用现有探测门禁（CLI 不可用时不挂、不注入提示）。
5. **回滚**：`mcpScope` 改回 `'managed'` 即恢复现状（重新写入托管行、撤销所有 scope）；`enabled: false` 时两步都做（撤销 scope + 撤销托管行）。

### 3.3 依赖与工程面（这是主要工作量）

| 项 | 内容 |
| --- | --- |
| 新增 peer + dev 依赖 | `@deepseek-ai/dsh-agent`、`@deepseek-ai/dsh-scope`、`@deepseek-ai/dsh-mcp-client`（三者都列入 `peerDependenciesMeta.optional`，宿主不保证有） |
| `scripts/link-dsh-runtime.mjs` | 该脚本已把 `packages/*/node_modules/@deepseek-ai/*` 链到运行时；新依赖引入后需确认链接覆盖（它是按目录里**已存在**的包名遍历，所以要先 `pnpm install` 生成本地目录） |
| `dsh.engines.dsh` | 下限是否需抬？——机制依赖 `view(scope)` 的 shadow 语义与 `agent/ctx`。**待用真机矩阵确认**：至少要覆盖 `0.1.6-alpha.2`（本机） |
| 测试 | 单测：挂载/撤销的决策矩阵、无索引不挂、互斥时托管行被撤、失败降级。真机：扩充 `verify-codegraph-host-contract.mjs`——起两个不同 cwd 的会话，断言各自 `tools.schemas(agent)` 只看到自己项目的结果 |
| 三平台 | 我没有 Windows/Linux 真机，只能靠 CI 矩阵 + `cli-windows.test.ts` 同款的 stub 思路 |

### 3.4 工作量估计

| 阶段 | 估计 |
| --- | --- |
| 机制原型（scope 挂载 + 互斥 + 单测） | 1 天 |
| 卡片/配置/文档/回滚（`mcpScope` 三态 + 卡片徽标 + README） | 0.5 天 |
| 真机验证（两会话隔离断言 + 三平台 CI） | 0.5–1 天（依赖 CI 排队） |
| **合计** | **约 2–2.5 天** |

## 四、值不值得做（含一个我先算错的数字）

我先算了一版「跨项目重叠会话对 = 1315」，看着像是强需求。**但那版是错的**：会话的「结束时间」取最后事件时间，而 DSH 会恢复旧会话，于是半年前的会话看起来一直「活着」。按分钟重采样（上限 2 小时截断续接）后：

| 指标 | 实测 |
| --- | --- |
| 同时有 ≥2 个**不同项目**活跃的时间占比 | **3.1%**（1675 / 53264 分钟） |
| 同时活跃的不同项目峰值 | **4** |

也就是说：**约 3% 的时间里，per-agent 隔离才真正解决一个现状解决不了的问题**（那 4 个项目并行的时刻）。其余 97%，`projectPath` 入参与 `followSession` 已经够用。

P0 的其余收益是**非并发**的，且仍然成立：

- **去掉写盘链**（代价 #2/#3/#4）：这是稳定性和复杂度收益，与并发频率无关——`followSession` 的「重写补丁 → 热加载 → 重建连接」在**单项目**切换时也在发生。
- **语义不再漂移**（代价 #5）：每个 agent 固定绑定自己的项目，不再依赖全局 cwd 此刻指向哪。

所以我的建议是：

1. **不要把 P0 当作「必须做」**——它解决的并发场景只占 3%，而代价是新增 3 个可选 peer 依赖 + 三平台验证 + 一套需要长期维护的双路径。
2. 若你要做，**先做「去掉写盘链」那一半**（代价 #2/#3/#4）：把 `followSession` 从「写文件 + 等热加载」改成**不写盘的按会话绑定**，保留托管行作为无 agent 场景的回落。收益确定、且与并发频率无关（单项目切换也走这条链）。

   **但我核查后发现这半不能省依赖**（原先我写成「不引入新依赖」，是错的，已更正）：`dsh-mcp-client` 的 `cwd` 是 `apply(ctx, config)` 时定下的（`lib/index.js:44` 把它交给 transport；`:786` 只是 schema 默认值），**没有运行时改 cwd 的 API**（只有 `restart` 语义的重连策略）。所以任何「按会话换 cwd」都必须**重新挂一个插件实例**——而重新挂就得有 scope（`createScope`）或等价的隔离上下文。结论：**这个半也依赖 `dsh-scope` 等新依赖**，只是可以先用它只做「按会话挂载」，不动 per-agent 语义。
3. 或者：**保持现状**，把 `projectPath` 的使用指引写得更显眼（usage 段已提到），并把这次调研结论并入 `ADOPTION-AUDIT.md`。

## 四之二、性能影响（实测，不是估算）

你问「改造后性能影响大吗」。我把相关的量都测了（本机 macOS / codegraph 1.6.0 / 本仓库 39.5MB 索引 / 6662 符号）：

| 测什么 | 实测值 | 说明 |
| --- | --- | --- |
| **MCP 进程冷启动 → 握手就绪** | **75ms**（5 次：68/76/78/77/77） | spawn + initialize。per-agent 模式下**每个 agent 一次** |
| 握手后首次 `explore` 返回 | **784ms** | 首次查询要读索引页，之后 70–140ms |
| 稳态查询（页面缓存热后） | **70–140ms**，且**不随索引大小变化** | 换个仓库（另一个 40MB 索引）冷查也是 75ms |
| **空 Node 进程基线 RSS** | **~40MB** | codegraph 自带 node 的运行时开销（不含索引） |
| 每次「重建 MCP 连接」（现方案切项目时发生） | **~75ms**（同一量级） | 与新方案的 per-agent 启动成本**相同** |
| 插件写盘决策纯函数（含 `locateIndex` 向上查找） | **0.06ms/次** | 计算本身可忽略；代价在写盘 + loader 热加载 |

### 怎么读这些数

**内存：主要成本是「每个 Node 进程 ~40MB」，不是索引大小。**

关键证据：`status --json` 报 `backend: node-sqlite`、`journalMode: wal`，而重复查询同一索引与查另一个 40MB 索引**耗时相同（70–140ms，与库大小无关）**——说明索引是**按需读页**、经 OS 页面缓存共享，**不是每个进程把 40MB 图加载进堆**。所以：

- **per-agent**：N 个活跃 agent ≈ **N × 40MB** + 各自的查询页（共享）；
- **managed（现状）**：1 个进程 ≈ 40MB，与 agent 数无关。

本仓库实测的并发峰值是 **4 个项目**（见上一节）。所以最坏情形大约是 **4 × 40MB ≈ 160MB**，对比现状 40MB——**增量约 120MB**。对一台当代开发机，这不算高，但它确实是**线性增长**的：agent 越多（子 agent、Agent Teams 会放大）占用越高，且每个进程都带一份 Node 堆。

**延迟：per-agent 在「首次查询」上更快，而不是更慢。**

- 现状：每次**会话切到别的项目**都要走「写补丁 → 热加载 → 重建连接」，其中重建那一段实测 **~75ms**，但**热加载本身还要等 loader 处理**（不在本进程内，我没能量到端到端）；而且链路上任何一步抖动都体现为**用户的首次工具调用变慢**。
- per-agent：agent 创建时**一次性**付 75ms（可与会话初始化重叠），此后该 agent 的每次调用都直连自己的常驻进程，**没有切换成本**。
- 稳态查询两者**相同**（都是同一个 codegraph 进程在处理）。

所以**单次切换**看是同一量级（75ms vs 75ms + 热加载等待），但 per-agent 的收益在于**这笔钱只在 agent 创建时付一次**，而不是每次切项目、每个 agent 各付一遍。

**CPU：基本没差别。** 空闲的 MCP 进程不轮询（实测握手后静置 1.2s 无输出、进程存活），查询是同一个 SQLite 引擎。

### 结论

| 维度 | 影响 |
| --- | --- |
| 稳态查询延迟 | **无变化**（同一个 codegraph 进程） |
| 切换/启动延迟 | **同量级**（75ms），但 per-agent 从「每次切换付」变成「每 agent 付一次」，且省掉热加载等待 |
| 内存 | **线性增长**：最坏 ~4×40MB ≈ 160MB（现状 40MB），增量约 120MB |
| CPU | 无实质差别 |

**权衡很清楚**：拿 ~120MB 内存（峰值并发 4 项目时）换掉写盘链与语义漂移。对 8GB 内存以下的机器、或会起很多子 agent 的用法，这个增量值得警惕；对 16GB+ 的开发机可以忽略。

这也是我建议「可选」而非「必做」的第三个理由：**收益（3% 时间占比）与成本（线性内存 + 3 个依赖 + 双路径维护）都不小，属于口味问题而非明显的对错。**

## 五、待确认（动工前必须回答）

1. **默认值**：`auto` 会让默认行为从「托管行」变成「per-agent」（有 agents 服务时）。这属于**行为变更**，我倾向默认保持 `'managed'`、由用户显式开 `'per-agent'`——但这会让收益只落在愿意改配置的人身上。你的取舍？
2. **依赖策略**：加 3 个 optional peer 依赖会改变插件的安装面（宿主没有它们时走 managed）。可接受吗？
3. **三平台**：Windows/Linux 只能靠 CI（我没有那些真机）。你接受「CI 绿 + macOS 真机验证」作为验收标准吗？
4. **回滚预期**：若 per-agent 上线后发现问题，你希望回滚粒度是「配置开关切回 managed」（我方案里的做法）还是「回退整个提交」？
5. **依赖是硬门槛吗**：上面第 2 点已核查——**连「只做按会话绑定」也需要新依赖**（`cwd` 无运行时 setter）。所以「要不要引这 3 个依赖」是 P0 的**前置决定**，不是实现细节。

## 六、若确认动工，执行顺序

1. 加依赖 + `link-dsh-runtime` 覆盖确认 → 跑通 `tsc`（这一步会先暴露依赖/类型问题）。
2. 写 `src/scope.ts`：`mountAgentScope(agent)` / `disposeAgentScope(agent)` + 决策纯函数（可单测）。
3. `apply` 里接 `agent/created` / `agent/disposed`，实现与托管行的互斥。
4. 配置 `mcpScope` + 卡片徽标（显示当前模式）+ 回滚路径。
5. 单测（决策矩阵 + 互斥 + 降级）→ 扩充真机脚本（两会话隔离）→ CI 三平台。
6. 文档：README 兼容性矩阵补「per-agent 模式」、ROADMAP 回填、DEFECTS 若发现新缺陷按编号记。

---

**一句话**：机制上我能做，也验证了关键前提（scope 能挂、同名不冲突、shadow 不报错）；但按实测数据，它换来的并发收益只覆盖 3% 的时间，所以我把它摆在「可选」而不是「下一步」——建议先做其中**不写盘**的那一半，或维持现状。
