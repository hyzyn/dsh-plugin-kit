# @hyzyn/dsh-devdata 缺陷编号字典

> **这份文件是代码注释的编号字典，不是审计报告。**
>
> `src/` / `test/` 里有带 `Dxx` 的注释，含义是「这段代码为什么长这样」，编号的出处就是本文。
> 拿到任意一个 `Dxx`：先查 [§1 编号索引表](#1-编号索引表) 知道**当年坏了什么**。
>
> **编号是硬契约**：`D01–D09` 是 `packages/devdata` 内部序列，与其它包的 `Dxx` **不共享**；
> 跨包引用请写全名（`devdata D01` / `tty D95` / `devenv D01`）。新缺陷接在 `D09` 之后，
> **不得重号、不得回收空号**。
>
> 末列 `✓` 表示「**这段代码 / 测试里引用了该编号**」，由
> [`scripts/test/defects-table.test.ts`](../../scripts/test/defects-table.test.ts) 现算核对（标了就必须真的出现）。
>
> **立号时点与来源**：这 9 条是 **2026-10-03 补立的号**——它们此前只以叙述形态住在
> [ROADMAP.md](./ROADMAP.md) 的 记-12 / 记-14 / 记-16 里（那三节的现场、根因与实测原文照旧留在那里，
> 本文只做**编号字典**：一行一条症状 + 落点）。补立的理由见 conventions § 编号规范 硬规矩 7：
> 一次真跑暴露的缺陷不留编号，下次同样的坑就没人认得出。
>
> **为什么 `devdata/lib` 那次陈旧产物不在本文**（2026-10-03 的判断，留档免得后人再问）：
> 它的修复落在**仓根**（`scripts/test/lib-artifacts.test.ts` 守卫 + conventions § 提交 一条规矩），
> 本包的 `src/` / `test/` 里没有任何一行代码因为那次事故而长成现在这样——给一个没有 L2 指针的东西
> 编号，等于把「编号是代码注释的字典」这句话变成半句话。它记在 L0 那两处。

**已修 9 / 待修 0**，编号至 `D09`。症状见 §1。索引表**不写行号、也不保留修复提交 sha**
（[conventions.md § 编号规范](../../docs/conventions.md#编号规范) 硬规矩 4）：定位实现用
`git log -S'<症状关键词>'`，或读代码里带编号的注释。

## 1. 编号索引表

| 编号 | 症状（当年坏了什么） | 涉及文件 | ✓ |
|---|---|---|---|
| D01 | **`visibleTools` 的可见面漏了 RocketMQ 一整片**：`ENGINE_SPECIFIC` 是**手写清单**，矩阵后加的动作没跟着长 → `lag` / `list_topics` / `send` 这些受管动作在工具面上**永远不可见**；而当时的用例只有单向断言（「可见面里的都在矩阵里」，方向反了也照样绿）。修法：清单从矩阵**现算**（`allManagedActions`）+ 补反向断言「每个受管**读**动作都该可见」——补上之后它当场就红了 | src/tool.ts、test/tool.test.ts | ✓ |
| D02 | **`requiresConfirm` 只是一句回显**：裁决算出「这个操作要二次确认」，`invokeTool` 却照样执行，只把标记放进成功结果的载荷 → 给共享 Redis 授权写之后，**第一次 `DEL` 就打出去了**。修法：需要确认就**在 `preflight` 里拒**（`CONFIRMATION_REQUIRED`），带 `confirmed: true` 才执行——拒绝码与恢复路径早就写好了，这一改是让实现追上记录 | src/tool.ts、test/tool.test.ts | ✓ |
| D03 | **命令原文入口与结构化入口被混成一个名字**：`preflight` 原先把「可见性」与「裁决」都用同一个 `toolName`，而 Redis 入口名（`redis_command`）与解析层算出的动作名（`set`）**不是一回事** → 审计与矩阵档位对不上。修法：`preflight` 拆成 `entry`（可见性）与 `action`（裁决 / 执行器）两个参数 | src/tool.ts、test/tool.test.ts | ✓ |
| D04 | **注册清单走 `ctx.logger.info`，启动日志里看不到**：真宿主上插件挂上了、工具也注册了，而启动日志里**什么都没有**（logger 进的是另一个 sink）——验收脚本解析的正是那一行，于是它永远为空。修法：清单行与 `skipped` 行走 `console.log`（docker / tty / devfront 同款）。同一条教训 `devfront` 在 2026-10-01 已经记过一次，本包又踩了一遍 | src/plugin.ts、scripts/verify-devdata-host-mount.mjs | ✓ |
| D05 | **能力未授权的提示带「就地提权」**（`inPlace: true`）：本包**没有客户端半体**，设置卡片上根本没有那个开关——文案会把用户送去点一个不存在的东西。修法：`capabilityHowTo` 不传 `inPlace`（缺省 false）。等 P14 的面板落地、并真的接上 `GrantStore` 之后才该改回 true | src/adjudicate.ts | ✓ |
| D06 | **schema 把「没写」伪造成「写错了」**：`env: z.string().default('')` 在字段**缺席**时照样造出 `{env:''}`，而空 `env` 的语义是「给了规格却没给变量名」= 一条配置问题 → 接宿主后第一次真用，`devdata_capabilities` 对**每个**目标多报两条配置问题，文案还在指控配置者。修法：`.default(undefined as never)`——缺省**保持缺席**（`.required(false)` 实测一样会伪造） | src/plugin.ts、test/plugin-config.test.ts、test/fake-host.ts | ✓ |
| D07 | **`db: z.natural().default(0)` 让「没写」变成「写了 0」**：执行器于是**每次调用都先发一条 `SELECT 0`**——真机上它一直在发，只是没人看帧序，是 D06 同族埋着的第二颗雷。修法：`OPTIONAL_DB` 的缺省同样保持缺席（0 不是合法端口，安全） | src/plugin.ts、test/plugin-config.test.ts | ✓ |
| D08 | **配置问题走 `ctx.logger.warn`**：启动日志里看不到它，于是挂载脚本里那条「启动日志里没有『配置问题』」**变成空断言**——报告本来就不在它查的地方，所以它拦不住 D06 那条假问题。修法：改 `console.warn`，并把夹具改成**真实形状**（含能力声明），那条断言这才长出牙齿 | src/plugin.ts、test/fake-host.ts、scripts/verify-devdata-host-mount.mjs | ✓ |
| D09 | **作用域拒绝不说「判了哪个目录」**：真机首用第一步 `PING` 就被 `[OUT_OF_SCOPE]` 拒（工具 `cwd` 缺省取**宿主进程**的工作目录，而那台宿主从 `~` 启动），恢复路径只说「在允许目录内重试」——**没说你刚被判的是哪个目录**，agent 与人只能猜。写不出恢复路径的拒绝会让 agent 原地重试。修法：`rejectionHint` 多吃一个 `cwd`，点名被判目录与允许目录，并写明 `cwd` 缺省的取值来源；空作用域走另一支文案 | src/adjudicate.ts、test/adjudicate.test.ts | ✓ |
