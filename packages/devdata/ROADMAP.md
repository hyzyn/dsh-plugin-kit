# @hyzyn/dsh-devdata 路线图（待办）

> **本文只放「还没做的事」**；落点与门槛见下面的 [`## 已完成（落点 + 门槛）`](#已完成落点--门槛)。
> 每一项在动手前转成可验收条目，做完回填落点与门槛。
>
> **设计依据不在本文**：环境四态、能力档、三条数据通路、工具面清单、包结构等**为什么这么做**，
> 全在 L0 方案 [docs/devdata-plan.md](../../docs/devdata-plan.md)。本文只记**状态、落点与门槛**，
> 不复制那套论证（同一事实两处各写一份必然漂）。
>
> **什么该升到 L0**：判据是 [conventions.md § L0 / L1 的边界判据](../../docs/conventions.md#l0--l1-的边界判据)
> ——**要同时改 ≥2 个包，或要动 CI / 脚本 / 规范**。本文末尾列了当前已知的候选，
> 它们在动手前必须先从本文迁进根 `ROADMAP.md`。
>
> **私有包**：`"private": true`，不发 npm、**不带 `dsh.bundle.patch`**（带上就会被
> `scripts/aggregate.mjs` 卷进 `@hyzyn/dsh-all`，见 § 已完成里的实测）。
>
> **本包是三者中的第一个**：方案 §16 已定三包——`devdata`（数据面 + 验活断言库，**本包**）、
> `devenv`（环境编排，**已建**）、`devfront`（前端效果验证，**已建**）。三包**各有自己的状态真源**
> （各自的 `ROADMAP.md`，devenv 见 [../devenv/ROADMAP.md](../devenv/ROADMAP.md)），本文只管本包。
> 「不提前建空包」的理由见 plan §16（空骨架会让「这套东西现在能做什么」的答案变模糊）。

## 待办

### A. P3 余下：把 SQL 只读面接通真东西

> 纯逻辑部分已落地（见 § 已完成 A）。下面这些都要**真机 + 凭证**。

1. ~~**通路 A 执行器（Redis）**~~ —— **已落地并真机验证**（记-10）。用的是**本进程直连**
   （`248:6379` 从 DSH 宿主可达），没有走 `forwardOut`；自写 RESP，**零依赖**。
   剩：**MySQL / PostgreSQL**（目标在 `161`，防火墙只开 22 → 需要 `forwardOut` 通道，
   落点 `src/transports/forward-out.ts` + `src/engines/<engine>.ts`）。门槛同前：对着 `161` 上的
   `mysql:8.0.39` 真机跑通一次只读查询，且目标主机上**没有** `mysql` 客户端也能跑。
2. **接上只读自证与计划护栏的引擎侧**：判定逻辑已落地（见 § 已完成 D），还差**取元数据**与
   **取计划**这两个引擎调用——`ToolExecutor.explain` 的实现方（返回计划文本）尚未存在。
   门槛：对着只读账号 → 自证通过；对着可写账号 → **拒绝启用**；全表查询在执行前被拒且错误里带 plan。
3. **通路 B 解析器**（SQL Server / 达梦 / RocketMQ）：目标侧 `sqlcmd` / `disql` / `mqadmin`，
   输出解析按 fixture 建用例（版本差异 + 中英文输出）。
   **前置**：网络——`248` 是内网、**需先连 VPN**（不是永久下线，2026-10-02 更正）；
   没连上时 SQL Server 验不了。

### B. P0 调研余下（阻塞上面若干项）

5. **C1**：`161` 上到底有哪些客户端（`mysql` / `redis-cli` / `mqadmin` / `disql`），
   在主机上还是在容器里。决定通路 B 是否成立。**零写入可做**（`command -v` / `docker_exec which`）。
6. **C2**：是否已有现成只读账号，或要运维建。**决定 SQL 档能否成立**——排期不由本仓控制。
7. **C6**：能否按 worktree / 任务快速起一份**可丢弃副本**（决定 agent 能不能**写**，
   即 `test-isolated` 这一档能不能存在）。同时确认清理成本。
8. **网络前提**：`248` / `目标3` 当前都 SSH 超时，但**原因不同**——`248` 是**内网，需先连 VPN**
   （2026-10-02 更正：不是永久下线，也不必先配跳板机）；`目标3` 才需要连接簿的 `jump` 条目。
   不解决前者，SQL Server 的通路 B 与 `248` 上的容器都无法验证。

### C. P6–P8：Redis 受限档与 RocketMQ

9. ~~**Redis 解析层与工具层的接线**~~ —— **已落地**（见 § 已完成 记-6）。原文入口是
   `invokeRedisCommand`，走与结构化入口**同一条**判据链。接线时还抓到一个真漏洞
   （矩阵按动作名分档、解析层按参数分档，`INFO ALL` 从松的那一档放行），修法与论证见 plan §17.12。
   门槛（已验）：未登记命令 → `UNCLASSIFIED_OPERATION` 且**执行器零调用**；被排除的命令 →
   `OPERATION_FORBIDDEN`；审计按**解析出的动作名**记；`SCAN` 的 `COUNT` 被夹紧后进参数。
10. **RocketMQ 观察面**：topic / 消费组 / **lag / 堆积** / 死信统计 / 消息轨迹。
    门槛：真机取到 lag；**按 msgId 查轨迹要计时**（慢查询等于没有这个工具，见 C7）。
11. **RocketMQ 操作面**（发送 / 建删 topic）：独立能力 + 逐次二次确认；
    门槛：默认关；未授权时**工具不注册**。

### C2. 接宿主的余下（2026-10-02 起）

18. **把 devdata 挂进自己的 profile 用一次** —— **`web` 与 `test` 两个 profile 都已挂（2026-10-02）**，
    尾巴还没收：
    - 已做：两个 profile 各 `dsh plugin add link:<本包目录>`（`package.json` 的 link 行 + bundle 项），
      各在 `cordis.patch.yml` 追加 devdata 段（目标 `redis-248`、`env: test-shared`、
      `scopeDirs: [~/coding/webproject]`、**不声明任何能力** = 只读）；已核两处：
      `--dump-config` 组合结果里各有 `id: devdata` 一段，且 profile 的 node_modules 里都能
      **用纯 Node** 加载出 `apply` / `Config`（宿主就是这么加载的）。
    - **为什么两个都挂**：维护者日常 agent 会话在 `web`（`DSH_PROFILE=web`），而实验场是 `test`
      （`devfront` 也只在 `test` 里）。两处各自维护一份配置。
    - **已完成（2026-10-02 复验）**：宿主重启（PID 5873 → 22326）后，在会话里**真的调了**这四个工具
      打真 248。记-13 的「没有一条同时为真」缺口就此补上，见记-15。
19. **两个 profile 的审计文件原先指向同一个**（2026-10-02 发现并已改）：`web` 与 `test` 都写
    `~/.dsh/devdata-audit.jsonl`，而 `AuditEntry` 里**没有任何字段能告诉你是哪台宿主做的**
    （只有 target / action / 码）——于是「谁在什么时候动了什么」在有两个宿主时退化成半句话。
    已把 `test` 改成 `~/.dsh/devdata-audit-test.jsonl`。
    **更好的修法是代码层的**：审计行带一个 host / profile 字段（要动内核的 `AuditEntry` 与
    `auditLine`），那样一份文件也能分清来源；等有第三个宿主时再做。
20. ~~**两个验证脚本的落点**~~ —— **已落地（2026-10-02）**：搬到仓根 `scripts/`（`verify-devdata-all.mjs` /
    `verify-devdata-host-mount.mjs`），登记进 `scripts/verify-list.mjs`（`pnpm verify:list` 里能查到），
    守卫留在包内（`test/verify-all-script-safety.test.ts` / `test/host-mount-script-safety.test.ts`）
    ——**脚本在根、守卫在包内**，与 codegraph 那 5 个 `verify-codegraph-*.mjs` 同一分工。
    包内别名指向 `../../scripts/…`：**pnpm 跑包脚本时 cwd 是包目录**，所以路径要相对包
    （第一版写成仓库根相对，`pnpm --filter … run verify` 会直接找不到文件——**别名跑一次才发现**）。

### D. P9–P12：隔离、断言、编排、前端

12. **`test-isolated`**：按 worktree / 任务起副本 + 重置 + 清理（依赖 B7 的答案）。
13. ~~**验活断言库**~~ —— 纯逻辑**已落地**（记-8）：清单 + 加载校验 + 求值 + 结构化差异。
    剩**跑批执行器**（要引擎执行器先能跑语句，见 A 组）。
14. **环境编排**（归属 `devenv`，见 plan §16.1）：就绪判据的纯逻辑（记-9：`env-ready.ts` +
    `env-ready-eval.ts`、声明式清单 + 三态判定）**已于 2026-10-02 随建包**迁到 `packages/devenv`
    ——本包不再持有它，也不留转发。剩下的三件都在 `devenv` 那边：**观测层**（经复用通道取
    `ServiceObservation`：容器状态 / `StartedAt` / 退出码 / 健康 / 日志尾部 / HTTP 探针）、
    **只读工具面**（`env_status` / `env_wait`）——这两件也已落地（plan §16.1.2）；以及**默认不注册**的
    `env_up` / `env_down`，也已落地（plan §16.1.3）：四道门槛（作用域 → 清单 → 能力 → 确认）、
    **清单就是白名单**、**`env_up` 不创建容器**、每次调用都要 `confirmed: true`。
    **写路径没有真机验证**（真机上会启停 248 上的真容器，那台机器有同事在联调）。
15. **前端效果验证**：复用本仓既有的 Chrome CDP 夹具（tty / search 各一套），换目标为真站点；
    门槛：截图 + 收 console 错误；**工具面不含定时 / 爬虫 / 批量能力**（边界用例）。建 `devfront` 包。
16. **面板（GUI）**：明确排在 agent 工具面之后。一建 `client-src/` 就会被 `check-i18n` 与
    `client-lint` 纳入管辖，届时补 i18n 目录块与两条客户端硬规矩。

### E. 结构性决策

17. ~~**§16 包结构：单包还是三包**~~ —— **已定三包**（2026-10-01，见 plan §16 与记-7）；
    **`devenv` 的边界已定**（2026-10-02，见 plan §16.1）：判据是
    「**清单与求值跟着它判的对象走**」——数据内容 → 本包；容器/端口/探针状态 → `devenv`；
    浏览器渲染 → `devfront`。由此产生的**迁移待办已结**（2026-10-02）：本包原
    `src/env-ready.ts` + `src/env-ready-eval.ts` + `test/env-ready.test.ts`（约 990 行，
    **包内无任何其它消费者**）已随 `devenv` 建包**同一步**迁走；其前置第 1 步（L0）也已落地
    ——把连接簿读取与执行层上收进 `kit`（选 B1，落点见 plan §16.1.1）。
    `devdata`（数据面 + 验活断言库）/ `devenv`（环境编排）/ `devfront`（前端验证）。
    **另两个包不提前建**：`architecture.md §2` 的包清单与 workspace 双向一一对应（`docs-index` 判据 5），
    建了包就得加清单行，而空骨架会让「这套东西现在能做什么」的答案变模糊——各自开工时再建。

## 应先迁进 L0 的候选项（本文动手前要搬）

| 候选 | 为什么是 L0 |
|---|---|
| ~~**把 `readTtyBooks` 上收进 `kit`**~~ | **已做（2026-10-02，见 `devenv` 记-1）**：落在 `@hyzyn/dsh-kit/tty-books`（连接簿读取）与 `ssh-exec`（执行层），`docker` 那两份变成再导出壳，「读取与执行这一跳只有一份实现」由 `ssh-single-source` 守卫钉住 |
| ~~**让 `scripts/aggregate.mjs` 认 `private`**~~（plan §7 的 N1） | **已做（随三包入库 `b32324c4`，等价性由 `scripts/test/aggregate.test.ts` 钉住）**：`isAggregatable(pkg)` 里 `pkg.private === true` 直接不进聚合；**只认 `=== true`**（`private: false` 与「没写 private」一样算公开），且有一条用例拿仓里真实的「带 `dsh.bundle.patch` 的私有包」对账。**这一行曾漂过**（2026-10-03 更正）：plan §7 的 N1、§17.13 与 `aggregate.mjs` 的文件头注都已记「已落地」，只有本表还挂着 |
| ~~**包结构最终定为三包**~~ | **已定（2026-10-01）**：`devdata` / `devenv` / `devfront`。代价落在「三个包各要本身份 + N1 一次覆盖三个」上，见 plan §16 |

## 已完成（落点 + 门槛）

### 记-1. P1–P3 纯逻辑部分（2026-10-01）

| 落点 | 内容 | 门槛（已验） |
|---|---|---|
| `src/env.ts` | 环境四态 + 属性面；`unknown` 是缺省**不是 `test`** | `adjudicate.test.ts`：归一化不认识的值回落 `unknown`；`production` / `unknown` 一律不可写 |
| `src/operations.ts` | `引擎 × 动作` 矩阵（可逆性 / 危险度 / 所需能力）+ 每引擎 `never` 清单 | 未登记一律拒；`never` 与受管动作不相交；每个受管项的 `kind` 与能力声明自洽 |
| `src/scope.ts` | 作用域门：空 = 处处拒绝；用 `relative` 而非前缀比较 | 兄弟目录 `/work/project-a2` **不算**在 `/work/project-a` 内；作用域也管读类 |
| `src/credential.ts` | 凭证保护强度：`env` / `file` / `command` **不构成防护** | `credentialIsProtective` 只对 `keychain` 为真；`none` 档说明必须写出「不是防护」；快照不含明文 |
| `src/adjudicate.ts` | 操作级裁决器（纯判定）+ 目标快照 | 同一目标读放行写不放行；**环境判据排在能力判据之前**；写类未接闸门 = 不放行；每条拒绝都带恢复路径 |
| `src/sql.ts` | SQL 只读面：语句分类（掩码 + 首关键字）+ 结果整形 + 上限收紧 + 兜底分页 | 绕过面逐条拒：多语句、注释藏写操作、字符串里的分号、未闭合；**上限只收紧不放宽**，策略值非法时收紧到 0 |
| `src/tool.ts` | 工具注册表（从矩阵派生）+ `invokeTool`（先裁决再执行）+ 审计 | 每个引擎**可见面 ∩ never = ∅**；不可见工具**不进入执行路径**；四种调用（放行 / 拒 / 不可见 / 越界）**都进审计** |

**验收**：`packages/devdata` typecheck 干净；**285 条用例**通过；全仓 **2077** 测试（125 文件）通过；
`docs-index`（13/13 包与清单一致）/ `check-doc-links` / `check-publishable` / `check-kit-pins` 全绿。

**实施中抓到并修掉的两个真问题**（详见方案 §17.2 / §17.7 / §17.8）：

1. **裁决顺序**：初版把能力判定写在环境判定之前，导致 `unknown` 环境报的是「未接入闸门」——
   **不变量 2 退化成「只在目标恰好配了能力规格时才成立」**；
2. **语句头定位**：初版只按空白跳过，前导注释里的 `/` 让正则匹配失败，
   `/* SELECT */ DELETE FROM t` 被判成「不认识的语句类型」而非「这是写操作」——
   **拒绝方向对了，但理由与恢复指引都错了**；
3. （附）**注册表缺项**：初版漏登记 `get` / `info` / `keys` / `set` / `del` / `expire` / `monitor`，
   于是 Redis 档那些能力在工具面上根本没有入口。

### 记-2. P3 第三、四件：计划护栏与只读自证判定（2026-10-01）

| 落点 | 内容 | 门槛（已验） |
|---|---|---|
| `src/plan-guard.ts` | 查询计划护栏：按**引擎语义分派**分类计划 + 估算抽取 + 阈值判定 | **拿不到计划一律拒**（`PLAN_UNAVAILABLE`）、**不认识的计划也拒**（`PLAN_UNRECOGNIZED`）；全表扫描**不受阈值影响**（把阈值调成 `undefined` 绕不开）；`maxRows: 0` = 零容忍、未配 = 不检查 |
| 同上 | PostgreSQL 的 `Index Scan` **不按名字判**（交给阈值），SQL Server 的无 seek `Index Scan` 与 MySQL 无 `Using index` 的 `type: index` 按名字判 | 用例钉住「同一个词在不同引擎里判得相反」；不传引擎时只认所有引擎都成立的信号 |
| `src/tool.ts` | 护栏接进 `invokeTool`：**拒跑发生在执行之前**，只对 SQL 的 `query` 生效 | 用例断言：全表扫描 / 取不到计划时**执行器零调用**；`explain` 自身不过护栏（否则递归要计划）；非 SQL 引擎不去要计划 |
| `src/readonly-probe.ts` | 只读自证**判定**（读元数据的结论；引擎侧的元数据读取仍待做——见 A2） | **缺证即拒**（`EVIDENCE_MISSING`）；**超级用户先于账号证据判**（绕过权限检查）；会话级只读**不能**单独构成已自证；Redis / RocketMQ 报 `ENGINE_UNSUPPORTED` |

**实施中改掉的三处判据错误**（详见方案 §17.9）：

1. `Clustered Index Scan` 被当成便宜——按 PostgreSQL 的语义误判了 SQL Server（它的 index scan 是扫全量）；
2. `Using index` 既是「便宜」信号又是「不走全量」的排除条件，而便宜判定排在全量之后，**它永远没机会生效**；
3. `type: index` 与 `Extra: Using index` 是**两行**，逐行判拿不到跨行上下文——覆盖索引信号必须先整份算一次。

### 记-5. P6 一件：Redis 命令解析（2026-10-01）

| 落点 | 内容 | 门槛（已验） |
|---|---|---|
| `src/redis-command.ts` | 把「某一族动作」落到**具体哪条命令**上：命令名归一 + 归类（read / read-dangerous / write-scoped）+ 取目标 key + 夹紧 `SCAN` 的 `COUNT` | **未登记命令一律拒**；`FLUSHALL` / `EVAL` / `CONFIG` / `MULTI` 一类**没入口**；`INFO ALL` 与 `INFO memory` 判得不同；`SCAN` 的 `COUNT` 超过策略上限被夹回、非法策略值收紧到 1；写命令**解析不出 key 就拒** |

**这一档为什么比 SQL 更需要解析层**：SQL 有库账号兜底（代码写错也翻不了车），
**Redis 没有只读账号这回事**——一条连接读写同权，「受限」只能靠白名单，**漏判没有第二层网**。

**实施中抓到的一处真 bug**：`HSCAN` / `SSCAN` / `ZSCAN` 的**第 1 个参数是 key**（光标在第 2 个），
而 `SCAN` 是光标在第 1 个。初版按 `SCAN` 的布局统一处理，于是带 key 的三个变体全被拒。
用例把两种布局都钉住了。

**已知的一处粗糙**——**已在 记-6 修掉**：`MONITOR` 当时在矩阵里没有同名动作、被映射到 `info`。
现在矩阵里有 `monitor`（同样是 `read-dangerous` + 独立能力名），映射也改成了同名动作。

### 记-6. C9：Redis 命令原文入口（2026-10-01）

| 落点 | 内容 | 门槛（已验） |
|---|---|---|
| `src/tool.ts`｜`invokeRedisCommand` | 命令**原文**入口：解析 → 动作名 → 与结构化入口**同一条**判据链（可见性 / 裁决 / 护栏 / 审计） | 未登记 / 带壳 / 被排除的命令**执行器零调用**；审计按解析出的动作名记；`SCAN` `COUNT` 夹紧后进参数 |
| `src/tool.ts`｜`preflight`（抽出） | 把「可见性 → 裁决 → 计划护栏」抽成一处 | 两个入口走同一段代码——各写一遍必然漂，而漂的方向是「原文入口少一道闸门」 |
| `src/operations.ts`｜`stricterClass` + `CLASS_RANK` | 矩阵档位与解析层档位**取更严者** | **只能更严不能更松**：报一个更宽的档位换不来放行（用例钉住） |
| `src/adjudicate.ts`｜`operationClass` + 生效档位 | 裁决按生效档位分档；`capabilitySpecFor` 与 `hintFor` 也都吃它 | `INFO ALL` → `CAPABILITY_NOT_GRANTED`**且指引指向危险读能力**；`INFO memory` 仍是普通读；不传 `operationClass` 行为完全不变 |
| `src/tool.ts`｜`hiddenReason` | 不可见时按**实际原因**报码 | `never` → `OPERATION_FORBIDDEN`、环境不许写 → `ENV_NOT_WRITABLE`、没接闸门 → `CAPABILITY_NOT_DECLARED`、真未登记 → `UNCLASSIFIED_OPERATION` |
| `src/redis-command.ts`｜`commandArgs` + `RedisCommandArgs` | 结构化参数（**`raw` 原文 + audit 上下文**） | 执行器拿到的 `raw` 与解析层审过的**同一个字符串**（避免 TOCTOU 缝） |

**接线时抓到的真漏洞**：`INFO ALL` 与 `INFO memory` 都映射到动作 `info`，而矩阵里 `info` 是普通读——
解析层判出的 `read-dangerous` 在裁决层被抹平，**危险读能力闸门根本没走**。
这是 §3.6「从旁边那条路绕过去」的一种：同一动作名下按参数分档。修法三处（`operationClass`、
生效档位取能力、生效档位写指引），缺一漏洞就还在。详见 plan §17.12。

**顺带修掉的错诊断**：不可见一律报 `UNCLASSIFIED_OPERATION` + 「不在受管动作里」。写类在
`unknown` / `production` 下本来就被藏起来（矩阵里登记得好好的），报「未登记」会让 agent 去改动作名。
这条是**用一条断言抓出来的**：原文入口的用例期望 `ENV_NOT_WRITABLE`，实际拿到 `UNCLASSIFIED_OPERATION`。

### 记-7. E17 包结构定为三包（2026-10-01）

| 落点 | 内容 | 门槛（已验） |
|---|---|---|
| plan §16 | 「需要你拍板」→ **已定三包**，列出三个包的范围与状态 | 另两个包**不提前建**：`docs-index` 判据 5（清单 ↔ workspace 双向一一对应）不允许空骨架挂清单行 |
| `docs/architecture.md §2` | 只保留 `devdata` 一行（`devenv` / `devfront` 未建，不加行） | `docs-index` 仍是 13 包 ↔ 13 行 |

> ⚠️ **2026-10-03 状态更正（原文保留）**：上表是 **2026-10-01 当时的记录**。`devenv`（2026-10-02）
> 与 `devfront`（2026-10-01）**都已建**，`architecture.md §2` 也随之各加了一行——清单现在是
> **15 个包 ↔ 15 行**，`docs-index` 判据 5 现算核对（不是 13）。包的当前状态不看这张表，
> 看各包自己的 `ROADMAP.md` / `README.md`。

**为什么「不提前建空包」是条判据而不是懒**：清单行就是「这套东西现在能做什么」的声明面。
挂一个只有骨架的包在上面，读的人会以为环境编排能用——而它还不能。

### 记-8. D13 验活断言库（纯逻辑，2026-10-01）

| 落点 | 内容 | 门槛（已验） |
|---|---|---|
| `src/verify.ts` | 清单结构（`VerifyAssertion` / `VerifyManifest`）+ 加载 + 静态校验 | 见下 `verify.test.ts` 38 例 |
| `src/verify-eval.ts` | 求值（`eq` / `regex` / `gte` / `lte` / `rowCount`）+ **结构化差异** + 三态 | 见下 `verify-eval.test.ts` 30 例 |
| `src/js-yaml.d.ts` | js-yaml 的最小声明（照 `kit` / `mcp` / `env` 的同名写法） | 只声明 `load` + `JSON_SCHEMA` |

**四条设计约束的落点**（§3.9）：

1. **断言只读、不新增写能力** → 语句在**加载时**过 `classifySql`（写语句 / 多语句 / 未闭合一律拒）；
   `verify-capability.test.ts` 6 例把「断言走的动作 `query` 在所有 SQL 引擎上都是只读档」
   与「SQL 矩阵里没有写操作、也没有动作声明写能力」钉成断言；
2. **缺省即无（fail-closed）** → `loadManifest` 把「没有清单」与「清单写错了」分成**两种结果**：
   前者是 `no-manifest`（正常），后者是 `config-error`（要点名到字段）。**不回落默认断言**——
   回落等于拿别的项目的话核对这个项目，而且看起来是绿的；
3. **跑批一次拿全 + 结构化差异** → `evaluateAssertion` 产出逐算子的 got / expected 并排，
   每个 `unknown` 都带「为什么验不了」；
4. **与 Jenkins 是映射不是改动** → 本层不碰 Jenkins（不在本包范围）。

**实现中改掉的一处判据错误（本节的主要价值）**：截断（结果被上限截断）下的 `gte` / `lte`
我一开始统一处理成「先判截断 → 一律 `unknown`」。这是**两个方向都错**：

- 值**已经越界**时仍应判 `fail`——截断只会让真值**更大**，不会让越界的值回到界内。
  先判截断等于**用「不确定」盖住「已否证」**；
- 值看起来**通过**时，两个算子**相反**：`gte`（下界）真值更大只会更满足 → **仍判 `pass`**；
  `lte`（上界）真值更大可能就越界 → **只能 `unknown`**。

改为「先判 fail → 再看截断（仅 `lte` 与 `rowCount` 退化）→ 最后 pass」。用例把四种组合全钉住了
（越界/通过 × 截断/未截断）。**这一条只有写下来才不会复发**：它看起来像实现细节，
实际是「证据够不够下结论」的判据。

**同样由用例抓出来的两处测试自身的错**（记下来是因为它们都是「我以为的判据比实际的严」）：
`id` 判据只约束**首字符**（`9_ok`、`ends-` 都合法），以及 `lte` 那条本不该期望 `unknown`。

### 记-9. 环境就绪判据与求值（§13.2 的纯逻辑部分，2026-10-01）

| 落点 | 内容 | 门槛（已验） |
|---|---|---|
| `src/env-ready.ts` | 就绪清单（`ReadyProfile` / `ServiceRequirement` / `ReadyCheck`）+ 校验（三维度、路径、端口、正则、超时） | 未知字段一律拒；**就绪维度必须显式**，不推断 |
| `src/env-ready-eval.ts` | 求值：容器层 → 健康检查 → `StartedAt` → 就绪维度；三态 `ready` / `unready` / **`refuted`** | 见下 `env-ready.test.ts` 44 例 |

**一条硬判据：两个证据缺一不可**（plan §13.2 的「不是启发式」）：

1. **`StartedAt` 必须能解析**——且必须是**带时区**的完整时刻。没有时区的时间串是歧义的，
   而这里在做先后比较，按本地时区猜会让判定**随机器而变**；
2. **启动完成行必须出现，且必须晚于本次 `StartedAt`**。

第 2 条里「晚于本次」是关键，也是本组用例里最重要的那一条：容器重启后日志缓冲区里
**还留着上一个进程的启动完成行**，只看「有没有这一行」会在重启那一瞬间判成就绪——
而那正是最不该放行的一刻。用例把这个场景钉住了（`StartedAt` 晚于日志行 → `unready`）。

**`refuted` 为什么必须与 `unready` 分开**：冷启动可配到 150 秒。容器已经崩了却让调用方等满超时，
它拿到的结论是「超时」——而 agent 对「超时」的反应通常是**再等一次**。分开之后能立刻停止并说清原因。
否证面包括：容器不在跑（含 `restarting`）、`unhealthy`、HTTP 探针 **5xx**。
注意 5xx 与 4xx 不同：前者是「服务起来了但自己报错」（别等），后者可能只是路径还没注册（继续等）。

**实施中改掉的三处错**（都是我自己的假设错了，记下来防复发）：

1. **小数秒截断的期望值写错了**：`Date.parse` 对超过 3 位小数的处理各引擎不一致，
   实测 Node 会把 `.123456789` 读成 123 毫秒的偏差。所以解析时先把小数位截到 3 位——
   逻辑一开始就是对的，但我在用例里把期望值写成了「截断后的时刻」与「无小数秒的时刻」相等，
   而它们**本就差 123 毫秒**。这正是截断生效的证据，我却把它当成了 bug；
2. **截断的替换串把小数点吃掉了**：把 `'.$1'` 写成 `'$1'` 会拼出 `…:05123Z` → `NaN`。
   这一处**只有真的跑一遍才看得出来**（算术上少一个点很容易看漏）；
3. **行内时区不在时间后面紧挨着**：实测形态是 `… 12:00:05.123 INFO x +08:00`（中间隔着日志级别与正文），
   而我把偏移量写成了时间捕获组的一部分，于是永远匹配不到。改为在整行里单独找独立出现的偏移量。

时间解析这一层值得单独说一句：它看起来是「字符串处理」，实际是**就绪判据的时间基准**。
解析出差一个毫秒级偏差，后果是「日志行早于还是晚于 `StartedAt`」判反——而这一条判反，
就正好回到「以为起来了，其实还在热启动」。

### 记-3. 真机只读侦察（2026-10-01）

| 落点 | 内容 | 门槛（已验） |
|---|---|---|
| `docker_ps target=*` | `161` 可达、34 个容器全 `running`；`248` **需 VPN**（内网）、`目标3` 需跳板机——都**不是永久下线** | 结果已回填方案 §17.4 |
| 引擎现状 | `161` 上有 MySQL 8.0.39、Redis 6.2.18、RocketMQ 5.3.2（broker + namesrv + dashboard）、达梦 DM8 | 据此确定通路分配；**达梦纳入但排最后**（方案 §17.6） |

### 记-4. 包结构决策与私有性（2026-10-01）

| 落点 | 内容 | 门槛（已验） |
|---|---|---|
| `packages/devdata/package.json` | `"private": true`、**不带 `dsh.bundle.patch`** | `check-publishable` 跳过它；`aggregate` 扫不到它——实测 `packages/all/cordis.patch.yml` 与 `scripts/publish-targets.mjs` 里都**没有** `devdata` |
| `packages/devdata/package.json`｜**去掉 `build` script**（2026-10-01 补，由上一轮实测暴露） | 三条规则里**只有 `check-publishable` 认 `private`**：`.gitignore` 的 `!packages/**/lib/` 与 pre-commit 的 `git add` spec 都不认，于是 `pnpm -r build` 每次重建 `lib/`、提交时又被一起 `git add`（实测 `git ls-files --others --exclude-standard -- ':(glob)packages/*/lib/**'` 会列出 `packages/devdata/lib/*`）。去掉 `build` 后 `main`/`types`/`exports` 改指 `src/index.ts` | 门槛（三条都实测）：`pnpm -r build` **不再生成** `packages/devdata/lib`；`pnpm -r typecheck` **仍然覆盖**它（`tsc --noEmit` 照跑）；pre-commit 的 spec 对 devdata 命中 **0**。**不要为了「能单独构建」把 `build` 加回来** |
| `docs/architecture.md §2` | 清单加一行（标「私有，不发布」） | `docs-index` 判据 5：workspace 13 包 ↔ 清单 13 行 |

### 记-10. Redis 通路 A 执行器（`resp.ts` + `redis-executor.ts`，2026-10-02）

| 落点 | 内容 | 门槛（已验） |
|---|---|---|
| `src/resp.ts` | 自写 RESP 编解码 + **增量解析器**（分块、`$-1` ≠ `$0`、嵌套数组、缓冲上限）。**零依赖**——§2.4 的「驱动一律可选」在这一档直接变成「不需要驱动」 | `resp.test.ts` 16 例：真机抓下来的夹具（`+PONG` / `:59` / `-ERR unknown command \`ACL\`` / `*-1` / `$0`）、逐字节喂、上限报错 |
| `src/redis-executor.ts` | `ToolExecutor` 的 Redis 实现：连 →（`AUTH` / `SELECT`）→ 发 → 整形。**不再解析命令**（内核已裁决）、**不写日志**（密码从这里流过） | `redis-executor.test.ts` 8 例（假 RESP 服务）：帧顺序、超时、Redis 自己的错误原样带出、缺连接、凭据拒 |
| `test/redis-real-machine.test.ts` | 真机 **6/6**（`248`）：`PING`/`DBSIZE`/`INFO` 整形、`SCAN` 嵌套、危险读与写被拒、**被排除命令进不来**、`EXISTS devdata:probe === 0`（**那条写真的没发生**）、审计记下拒绝 | 门控 `DEVDATA_REDIS_248=1`，默认跳过（CI 不需要连得到 248） |

**为什么这一条的要害是 `EXISTS = 0`**：`248` 那台是 Redis 4.0.14、**无密码、没有 ACL**——「只读账号」
那层**技术上不可能存在**。所以「只读」这句话**只**由代码层兑现，而 `EXISTS = 0` 是对它的**实证**，
不是对设计的复述（方案 §8 已记这条风险）。

### 记-11. P3 落地：把 devdata 接成宿主插件（2026-10-02）

| 落点 | 内容 | 门槛（已验） |
|---|---|---|
| `src/entries.ts` | 入口面 = **可见性 ∩ 本机真的有执行器**。没有执行器的引擎只给引擎无关的三个工具（注册 `devdata_query` 那种会是「配了没反应」，比没有更坏） | `entries.test.ts` 8 例（含「过滤掉的是引擎入口，不是目标」） |
| `src/plugin-config.ts` | 配置面解析（**纯函数**）：认不出的引擎整条丢、认不出的环境回落 `unknown` **并报 problem**、空作用域保持为空、空 `env` 的能力按未接入、越界上限夹回 | `plugin-config.test.ts` 31 例，每条判据都有正反两侧 |
| `src/audit.ts` | 两个出口：JSONL（**持久，写不进去就抛** = fail-closed）与 logger（不持久，必须如实标注） | `audit.test.ts` 8 例（含「两条出口不可互换」） |
| `src/plugin.ts` | 宿主半体：注册 `devdata_list_targets` / `devdata_capabilities` / `devdata_doctor` / `devdata_redis_command`；能力闸门经 `bindCapabilitySources`；volatile 订阅重算；写类要求持久审计；拒绝转 `[CODE]` + 恢复路径 | `plugin.test.ts` 26 例（假宿主 + 假 RESP 服务，工具全跑一遍）；真机再加 5 例（插件层打 248） |
| `package.json` / `tsconfig.json` / `cordis.patch.yml` | 加 `build`（`lib/` 入库）、`dsh.bundle.patch`、`@deepseek-ai/schemastery` 依赖 | 见记-13 的挂载验收；`aggregate` 仍扫不到本包（N1） |
| `scripts/verify-devdata-host-mount.mjs` + `package.json` 的 `host-mount-smoke` | **真 DSH 宿主挂载验收**（隔离 `DSH_HOME` / 独立端口 / 跑完即删 / 自证真实配置未变） | **10/10 PASS**（记-13） |
| `test/host-mount-script-safety.test.ts` | 上面那个脚本的三条隔离性质（独立 home、前缀、收尾自证）+ 四条反例 | 5 例 |

### 记-12. 接宿主时抓到的**四个真缺陷**（2026-10-02）

> **编号**：本节四条与末尾那条顺手更正已补立为
> [`DEFECTS.md`](./DEFECTS.md) 的 `D01`–`D05`（2026-10-03）。本文保留现场与实测原文，
> 台账只做编号字典——两处不再是两份状态。

全是「写好之后才露出来」的那一类，逐个记下来防复发：

1. **`visibleTools` 的可见面漏了 RocketMQ 的一整片**（`ENGINE_SPECIFIC` 是手写清单，矩阵后加的动作
   没跟着长）——`lag` / `list_topics` / `send` 这些**受管动作在工具面上永远不可见**，而当时的用例只有
   单向断言（「可见面里的都在矩阵里」）。修法：清单从矩阵**现算**（`allManagedActions`），并把反向
   断言补上（「每个受管**读**动作都该可见」）——补上之后它**当场就红了**。
2. **`requiresConfirm` 只是一句回显**：裁决算出「这个操作要二次确认」，`invokeTool` 却**照样执行**，
   只把标记放进成功结果的载荷。后果是：给共享 Redis 授权写之后，第一次 `DEL` 就打出去了。
   修法：需要确认就**在 `preflight` 里拒**（`CONFIRMATION_REQUIRED`），带 `confirmed: true` 才执行
   ——`rejection.ts` 与 `hintFor` 早就写好了这条码与恢复路径，这一改是让实现追上记录。
3. **命令原文入口与结构化入口被混成一个名字**：`preflight` 原先把「可见性」与「裁决」都用同一个
   `toolName`——而 Redis 的入口名（`redis_command`）与解析层算出的动作名（`set`）**不是一回事**。
   修法：`preflight` 把 `entry`（可见性）与 `action`（裁决 / 执行器）分成两个参数。
4. **注册清单走 `ctx.logger.info`，启动日志里看不到**：真宿主验证时实测——插件挂上了、工具也注册了，
   而**启动日志里什么都没有**（logger 进的是另一个 sink）。仓库里这条教训已经记过一次
   （`devfront` 2026-10-01：挂载行必须走 `console.log`），本插件又踩了一遍。修法：清单行与
   `skipped` 行走 `console.log`（docker / tty / devfront 同款），验收脚本解析的也正是这一行。

另外一处**顺手更正**：能力未授权时的提示原先带 `inPlace: true`（「去设置卡片点这个开关」），
而本包**没有客户端半体**、根本没有那个开关——文案会把用户送去点一个不存在的东西。已改成只提
「启动环境 + 重启宿主」。

### 记-16. 真机**首次使用**抓到的纸割：作用域拒绝不说「判了哪个目录」（2026-10-02）

> **编号**：[`DEFECTS.md`](./DEFECTS.md) 的 `D09`（2026-10-03 补立）。

**怎么发现的**：维护者在 `test` profile 里按自证清单跑四步，第一步 `PING` 就被
`[OUT_OF_SCOPE]` 拒了——**不是**闸门坏了，是**工具的 `cwd` 缺省取宿主进程的工作目录**（那台宿主从
`~` 启动），而目标作用域收敛在 `~/coding/webproject` 下。带上 `cwd` 之后 `PING` 立刻正常。

**为什么算缺陷（而不仅是「用错了」）**：当时那条恢复路径只说「在目标声明的允许目录内重试；
作用域为空表示处处拒绝」——**没说你刚才被判的是哪个目录**。agent 与人都只能猜「哪个目录被判了」，
而这是本仓反复记过的那一类：**写不出恢复路径的拒绝会让 agent 原地重试**。

**修法**：`rejectionHint` 多吃一个 `cwd`，作用域拒绝的恢复路径改成点名
「当前目录 <被判的路径> 不在它的允许目录内——目标只允许：<目录清单>；注意 cwd 参数**缺省取宿主进程的
工作目录**（不是你会话所在的项目目录）」。空作用域那条走另一支文案（「处处拒绝，去配置里显式声明」）。
两条都有用例钉住（`adjudicate.test.ts`），工具层那条也加严到断言抛出的整句话里能看到被判目录与允许目录。

**顺带**：这一轮同时确认了 **`test` profile 也挂上了**（四步都跑到了：`PING` → `PONG`、
`SET` → `[CAPABILITY_NOT_GRANTED]`、`EXISTS devdata:probe` → `0`），记-15 的结论在第二个 profile 上复现。

### 记-15. 真宿主 + 真 Redis 的首次端到端复验（2026-10-02）

> 这一条补的是记-13 留下的缺口：先前三种验收各真一半（假宿主+真 Redis / 真宿主+假目标），
> **没有一条同时为真**。现在有了。

设备：`web` profile 的真宿主（重启后 PID 22326）+ 真 `248` Redis（4.0.14、无密码、无 ACL）。

| 层 | 判据（实测） |
|---|---|
| 配置 | `devdata_capabilities` 显示两个能力「**已接入**（`DSH_DEVDATA_WRITE` / `DSH_DEVDATA_DANGEROUS_READ`）/ **当前未获授权**」+ 怎么授权；**「配置问题」一节消失** |
| 代码 | `SELECT` 探针（见下）：`cmdstat_type` **+1**（探针有效）、`cmdstat_select` **+0**（新代码不发 `SELECT 0`；老代码每次调用发一条） |
| 拒写 | `SET devdata:verify-do-not-exist 1` → `[CAPABILITY_NOT_GRANTED]`；**前后 `EXISTS` 都是 0**（拒绝不是嘴上说说） |
| 拒危险读 | `KEYS *` → `[CAPABILITY_NOT_GRANTED]`，恢复路径指向的正是危险读那个变量 |
| 无入口 | `FLUSHALL` → `[OPERATION_FORBIDDEN]`（「被明确排除」，不是「不认识」） |
| 审计 | `devdata-audit.jsonl` 里 `set` / `keys` 两条 `allowed=false` 带码 |

**可复用的探针**（这次的主要手法，值得留着）：

```sh
INFO commandstats                      # ① 基线
TYPE devdata:verify-probe-<随机串>      # ② 标记：这个应用绝不会发 TYPE
INFO commandstats                      # ③ 再读
#   cmdstat_type   +1 → 探针确实到了那台 Redis（否则本次测量无效）
#   cmdstat_select +0 → 没发 SELECT（新代码）／ +1 → 老代码
```

它成立的前提是 `INFO commandstats` 的计数器**长期累积**：那台库 `eval` 已 51280 次、`ping` 130565 次，
而 `select` 只有 **2** 次——恰好等于维护者在旧代码下跑的两条命令。

**顺带看到的一件事**：那台 Redis 的业务流量里 **`eval` 有 5 万次**。也就是说「`EVAL` 等于把代码执行权
交出去」在那台机器上不是理论风险，而是**正在被大量使用**的能力——把它列进 `never`（没有入口）是对的：
一旦开了口子，那份命令白名单就纯属装饰。

### 记-14. 真机首用抓到的缺陷：schema 把「没写」伪造成「写错了」（2026-10-02）

> **编号**：本节的两颗 schema 雷与同轮补的那个洞已补立为
> [`DEFECTS.md`](./DEFECTS.md) 的 `D06`–`D08`（2026-10-03）。

**怎么发现的**：接宿主后第一次真用，维护者的会话里 `devdata_capabilities` 对**每个**目标多报两条
「配置问题」——`writeCapability` / `dangerousReadCapability` 没有给 env。而那份配置**压根没写**这两
个字段（并且报错文案还在指控配置者）。

**根因在 schema，不在配置**：`z.object({ env: z.string().default(''), label: z.string().default('') })`
在字段**缺席**时照样造出 `{env:'', label:''}`（`.required(false)` 实测也一样）。而空 `env` 的语义是
「给了规格但没给变量名」= 一条配置问题。于是「没写」被报成了「写错了」。

**修法**：`.default(undefined as never)` —— 缺省**保持缺席**。三种输入现在的行为：
未写 → 键不存在（静默「不接入闸门」）；写了 `{}` → 仍是 `{env:'', label:''}`（照报）；写了 `{env:'X'}` → 保留。

**同一个坑还埋着第二颗**（顺带挖出来）：`db: z.natural().default(0)` 让「没写」变成「写了 0」，
于是执行器**每次调用都先发一条 `SELECT 0`**——真机上它一直在发，只是没人看帧序。

**为什么先前一条用例都没拦住**：**假宿主测试的保真度不够**。假宿主直接把自己写的对象喂给 `apply`，
而真宿主**先过 schema**（`kit` 的 `DshPlugin.apply` 文档写明了「config 为经 schema 解析后的配置」）。
假宿主现在会走 `Config(...)`（`fake-host.ts` 的 `resolveConfig` / `resolvedPlain`），于是这一整类
「schema 自身的行为」进入用例——上面两颗雷各有一条回归用例。

**同一轮补的第二个洞：配置问题原先也走 `ctx.logger.warn`** —— 于是启动日志里看不到，
而 `verify-host-mount.mjs` 里那条「启动日志里没有『配置问题』」**变成空断言**（报告本来就不在它查的
地方，所以它没能拦住上面那条假问题）。改成 `console.warn`（启动日志能收到），夹具也同时改成**真实
形状**（含能力声明）。现在这条断言有牙齿——用一份 `writeCapability: {}` 的配置起隔离宿主实测：

```
[dsh-devdata] 配置问题：targets[0]（redis-x）.writeCapability：给了能力规格却没有 env……
[dsh-devdata] mounted (enabled=true, targets=1, audit=log-only, engines=redis)
```

**顺手实测出的一条宿主行为**（值得留档）：配置**过不了 schema** 时（如 `dangerousReadCapability: true`），
宿主照常启动、**插件整体不挂载**（`[dsh-devdata] mounted` 一行都没有 = fail closed），并报：

```
dsh: warning: 1 entry did not activate
devdata (@hyzyn/dsh-devdata): ValidationError: invalid config:
  - $.targets[0].dangerousReadCapability expected object but got true (at targets.0.dangerousReadCapability)
```

所以 schema 该严格就严格：错误带精确路径、且不会让人误以为「只是没权限」。

### 记-13. 真宿主挂载验收：**10/10 PASS**（2026-10-02）

`node scripts/verify-devdata-host-mount.mjs`（隔离 `DSH_HOME`，独立端口，跑完即删）：

```
✓ 初始化一次性 profile            ✓ 组合结果里有 `@hyzyn/dsh-devdata` 行
✓ `dsh plugin add link:` 装上本包  ✓ 配置真的交下来了（dump 里能看到 redis-local）
✓ 启动日志里有 `[dsh-devdata] mounted`  [enabled=true, targets=1, audit=jsonl, engines=redis]
✓ 工具注册行了  [devdata_list_targets, devdata_redis_command, devdata_doctor, devdata_capabilities]
✓ 注册的**恰好**是命令原文形态该有的四个
✓ 结构化动作名**没有**出现在工具面上
✓ 配置没有报问题                  ✓ 真实 `~/.dsh/cordis.patch.yml` 逐字节未变
```

**一处没查清的红**（记下来，别当没发生）：真机那 11 条在 15 次连跑里红过 **1 次**（组①，耗时 84ms）。
84ms 与 5s 的连接超时对不上，更像连接被拒（VPN / 路由抖一下），但**当次输出被后续命令截断、
没有留下原因**，此后 14 次连绿——所以这只是**推测，不是结论**。已经做的补法是把执行器给的那句话
带进失败信息（`expect(ok, message)`），下一次红会自带原因；**没有**做「失败自动重试」——那会把
真的判据问题一起藏掉。

**它证到了什么、没证到什么**（写清楚）：证到的是「真 DSH 宿主的真 ToolRuntime 接受了这四个工具定义、
真 profile 组合挂得上、配置真的交下来了」；**没**证到的是「agent 发起的一次工具调用走完宿主调度」——
那需要真模型与真会话，本脚本不跑。链路那一半由门控真机用例覆盖（插件层直调 248：11/11）。
两者合起来仍是「假宿主 + 真 Redis」与「真宿主 + 假目标」各一半，**没有一条同时为真**——
把 devdata 挂进你自己的 profile 之后才能补上那一段（`dsh plugin --profile web add link:<本包目录>`，
然后重启宿主；配置见 README）。

### 记-17. 清单骨架上收进 `kit`：本包从「一份实现」变成「一份映射」（2026-10-03）

`verify/<项目>.yaml` 的加载骨架（`readFileSync` + `JSON_SCHEMA` + 三种「读不到」）与
`devfront` 的 `web/`、`devenv` 的 `ready/` 同构，三份实现 → 上收进 `@hyzyn/dsh-kit/manifest`
（`kit` 0.8.0 子路径）。本包剩下的只有：**档位 → 本包结果与文案**的映射，以及领域校验
（`classifySql` / 断言形状 / 算子）。`manifestFileName` / `manifestRelativePath` /
`projectsWithManifest` 变成对 kit 纯函数的**薄包装**（导出名与调用方不变）。

**门槛（已验）**：本包 38 条 `verify` 用例**原样通过**——等价性由它们钉住（含那句「在多个根目录下
都找到了…两份清单是歧义」的文案、YAML 语法错、空文件、`ENOENT` 与 `ENOTDIR` 的分界）。
骨架本身的用例在 `packages/kit/test/manifest.test.ts`（12 条）。
