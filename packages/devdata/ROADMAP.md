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
21. ~~**把 `verify/<项目>.yaml` 接进工具面**~~ —— **已落地（2026-10-04，见记-20）**
    （从根 ROADMAP 第 14 项发现）：
    本包的清单（记-8 那套：加载 + 校验 + 求值 + 结构化差异）**在 `src/verify.ts` 之外没有任何消费者**
    ——当时真机启动日志里注册的四个工具（`devdata_list_targets` / `devdata_redis_command` /
    `devdata_doctor` / `devdata_capabilities`）没有一个是清单驱动的。后果很具体：一次发布的证据链里
    「数据对」那一环**只能由人 / 脚本接上，agent 走不通**（另两面各有 `env_status` / `site_verify`）。
    门槛：一个**只读**的清单执行动作（按 `verify/<项目>.yaml` 跑断言、逐条给 `pass` / `fail` / `unknown`
    ——「没验成」不许冒充「验出问题」、进审计）；要一起定的三件：**工具名**、**清单里 `statement` 的
    表达力**（当时是共用 SQL 那条判据，Redis 语句过不了加载，见 `classifyAssertionStatement`）、
    以及**不做发现**（跑什么完全由清单决定）。守卫见 `scripts/test/release-chain.test.ts` 的 tripwire。
    > **2026-10-04：第一层已落地（加载契约按目标引擎判）**。`StatementClassifier` 多收一个
    > `engine` 参数，`loadManifest` 的 `engineOf` 由调用方给目标表，三种取值各有一条判据：
    > Redis 语句**复用解析层的归类**（`parseRedisCommand` 的 `command.kind`，不另写一份「哪些命令是读」）、
    > SQL 引擎仍走 `classifySql`、**目标不在这个 profile 里 → `'unknown'` 只查形状**（一份清单的生命周期
    > 跨机器，不该因为在 B 机器没配那个目标就变成配置错误；这类断言将来在运行时判 `unknown`）。
    > 不给 `engineOf` 的老调用方行为不变。用例：`test/verify.test.ts` 的两条 ★（含反例——
    > 同一条 `DBSIZE` 在不给引擎时被 SQL 判据拒、给 `'unknown'` 时放行）。
    > ~~**仍缺**：执行入口本身~~（当天第二层也落了，见下与记-20）。
    > **2026-10-04 当天第二层落地（记-20）**：工具名定为 `devdata_verify`，执行入口、报告形状与
    > 四种处置都在；`scripts/test/release-chain.test.ts` 的 tripwire 按它自己的提示翻成了正向断言
    > （+ 反例），conventions.md 那张表的第三列同步成 `devdata_verify`。清单里的 `statement`
    > 表达力这一件只落了一半：**Redis 语句的清单口径定了**（回复整形成单列 `value`），SQL / MQ 的
    > 真求值仍等各自的执行器（今天逐条记「没验成」——**不假装跑过**）。
14. **环境编排**（归属 `devenv`，见 plan §16.1）：就绪判据的纯逻辑（记-9：`env-ready.ts` +
    `env-ready-eval.ts`、声明式清单 + 三态判定）**已于 2026-10-02 随建包**迁到 `packages/devenv`
    ——本包不再持有它，也不留转发。剩下的三件都在 `devenv` 那边：**观测层**（经复用通道取
    `ServiceObservation`：容器状态 / `StartedAt` / 退出码 / 健康 / 日志尾部 / HTTP 探针）、
    **只读工具面**（`env_status` / `env_wait`）——这两件也已落地（plan §16.1.2）；以及**默认不注册**的
    `env_up` / `env_down`，也已落地（plan §16.1.3）：四道门槛（作用域 → 清单 → 能力 → 确认）、
    **清单就是白名单**、**`env_up` 不创建容器**、每次调用都要 `confirmed: true`。
    **写路径没有真机验证**（真机上会启停 248 上的真容器，那台机器有同事在联调）。
    > **2026-10-04 追加更正**：这句话**已被 `devenv` 推翻**——它的写路径 2026-10-03 就真机验过了，
    > 但靶子不是 248，而是**本机一次性容器**（`docker create` 一个 `sleep` 镜像 + 唯一名字 + 标签，
    > `afterAll` 里 `docker rm -f` 并断言容器真的没了）：四道门槛与 `env_up` / `env_down` **4/4 PASS**
    > （Docker Desktop 28.3.2），连不上 daemon 时整档 SKIP 且理由写在套件名里。见
    > `packages/devenv/ROADMAP.md` 记-6。**仍然成立的那半**：248 那一档要人**指名**容器
    > （那台机器有同事在联调），所以它不会常态跑——常态跑的是本机那一档。原文保留。
15. **前端效果验证**：复用本仓既有的 Chrome CDP 夹具（tty / search 各一套），换目标为真站点；
    门槛：截图 + 收 console 错误；**工具面不含定时 / 爬虫 / 批量能力**（边界用例）。建 `devfront` 包。
16. ~~**面板（GUI）**~~ —— **已落地（2026-10-03，见记-18）**：`client.js`（手写，无构建步骤）+
    宿主那条 `GET/POST /api/dsh-devdata/config`，标量与目标可改、**两档能力只读**、改目标逐次确认、
    每次变更进审计。`check-i18n`（目录块）与 `client-lint`（宿主地址来源 / 语法族）都接管了它
    （`typecheck` 里带着跑），真机验收是 `scripts/verify-devdata-card.mjs`。

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
（2026-10-03 更正：**卡片建起来了**（记-18），但结论**不变**——那两档能力在写入路径上只读
（`CAPABILITY_FIELDS` 那条 400），本插件也不接 `GrantStore`，所以卡片上确实没有那个开关。）

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

### 记-18. 配置卡片（客户端半体）与 `/config` 那条数据面（2026-10-03，待办 16 收口）

**由来**：本包此前**没有客户端半体**，于是「`scopeDirs` 为空 = 处处拒绝」「引擎认不出」「连接信息
不完整」这类**配置问题**只在启动日志里报，用户没有 UI 可以去改；写类要的 `auditFile` 也只能手改
yaml。卡片补上这一半（同一个缺口 `devfront` / `devenv` 各记过一次）。形状照 `devfront`（唯一的
卡片模板），与同批的 `devenv` 记-11 对齐。

| 落点 | 内容 | 门槛（已验） |
|---|---|---|
| `src/plugin.ts` 的纯函数 | `CARD_FIELDS`（`enabled` / `announceToAgent` / `auditFile` / `timeoutMs` / `plan.maxRows` / `plan.maxCost`，计划护栏刻意用**扁平键**）、`normalizeCardPatch`、`normalizeTargets`（逐行逐字段报错、重名 id 拒、认不出的引擎整条拒、连接要么两个都给要么都不给）、`preserveCapabilities`、`mergeSection`、`configSnapshotFrom`、`capabilitySnapshot` | `test/config-route.test.ts` **40 条**（含反例）：类型与范围先判、非法值不许先落地（断言 `settings` 一次都没被写过）、校验过的行经 `normalizeConfig` 复核「一行不少 + 一条 problem 都不报」 |
| `src/plugin.ts` 的 `GET/POST /api/dsh-devdata/config` | 围栏与恢复入口口径与 `devfront` **逐条一致**：`isLoopbackRequestStrict` 不过 → 403；非 GET/POST → 405；JSON 坏了 → 400；`/config` 不因插件停用而失效；没有 settings 服务时 `persisted:false` 如实标注（不假装落盘） | 用例 ×6（403 两种、405、400 两种、停用后仍可用）+ 真机 ③⑦⑫⑬ |
| **两档能力只读**（本轮最要紧的判据） | POST 体里出现 `writeCapability` / `dangerousReadCapability` → 400 + `CAPABILITY_READONLY`（**藏在 `targets[i]` 里的那种写法同样拒**，报错还指到路径）；GET 只给只读档（声明的变量名 / **当前是否已授权** / 怎么授权） | 用例 ×4 + 真机 ⑭。**理由**：授权判据是「宿主**启动继承层**里那个变量的值 ∈ `{1,true,yes,on}`」（`kit` 的 `TRUTHY`），而变量名来自配置——把它指向**另一个已经在启动环境里、值恰好为真**的变量（如 `CI=true`），一条 POST 就等于**免重启提权**，违反根 ROADMAP §5.1「HTTP 只能关、不能开」。⚠️ 本格此前写的是「改成 `HOME`」，**那是错的**（`HOME` 的值不在白名单里、不会授权）——2026-10-03 更正，代码文案与 README 同轮一并改 |
| 改目标逐次确认 + 审计 | 不带 `confirmTargetEdit` → 400 + `CONFIRMATION_REQUIRED`；成功分 `config.scalars` / `config.targets`，失败带码；审计写不进去 = 抛（fail-closed，走本包**已有的** `auditSink`，没新造 sink） | 用例 ×3（含「审计文件是个目录 → 请求不返回成功」）+ 真机 ⑮⑱（JSONL 9 行，三种 action 与两个码都在） |
| **改目标不抹掉能力声明** | 同 `id` 目标的 `writeCapability` / `dangerousReadCapability` 原样带回来（客户端提交的行里没有它们——它们在卡片上只读）；新行没有声明（**不凭空授权**），改 `id` 等于换一个目标 | 用例 ×3 + 真机 ⑯⑰。**没有它的话**：改一个 `scopeDirs` 的错别字就把闸门静默抹掉——那是 `devfront`「保存一个标量把站点整批抹掉」的同一类缺陷 |
| `client.js`（手写、无构建步骤） | 卡片：四个标量 + 两个计划护栏可改；**目标编辑器**（id / 名字 / 引擎 / 环境档 / 作用域 / `maxScanCount` / 连接 host·port·db / 凭据引用，可增删行；引擎与环境档是**下拉框，选项由宿主快照给**）；**两档能力只读面板**；**四个槽全注册**（`settings.kit.item` / `plugins.bundle.config` / `plugins.row.config` / `settings.plugin.item`） | 2026-10-03 真机：详情页卡片渲染出 **36 个控件**、两个已有目标与环境档 / 作用域都回填；能力面板里 `DSH_DEVDATA_WRITE` 与「免重启提权」在**文本**里（只读说明），输入框里没有任何能力字段。静态：`check-i18n` **45 条键** zh/en 一致、**0 条残留中文字面量**、`client-lint` 过（宿主地址来源 0 处） |
| `package.json` | `dsh.client`（`platform: web`）+ `exports["./client"]` + `files` 里加 `client.js`——**少任何一个都是「bundle 404、卡片永不渲染」**（`devfront` 真机踩过） | 真机 ⑲⑳：宿主按**批量 URL** 发这个包、bundle 里含 `dsh-i18n` 与三个注册面 |
| `scripts/verify-devdata-card.mjs` + `card-smoke` 入口 | 隔离 `DSH_HOME`（`createLiveHarness({ prefix: 'dsh-devdata-card-' })`）+ 临时 profile 装本包 + 真宿主 + 真 Chrome：数据面 / 能力只读那条 400 / 逐次确认 / 能力声明跟回来 / 审计落盘 / bundle 真被加载 / 插件页那一行 / 详情页控件 / **卡片上真的点一次「保存」**（客户端拼的 payload 过得了服务端校验——`client.js` 不在 vitest 层，这一下是它唯一一次被执行）/ 自证真实补丁未变；`--dump` / `--keep` 同 `devfront` | 2026-10-03 首跑 **23 PASS / 0 FAIL**（连跑两次都全绿）；真实 `~/.dsh/cordis.patch.yml`（780 字节）逐字节未变。守卫见 `test/verify-script-safety.test.ts`（六条判据 + 五条反例，**判前先去注释**） |

**为什么脚本叫 `card-smoke` 而不是 `verify`**：本包的 `verify` 已经是
[`scripts/verify-devdata-all.mjs`](../../scripts/verify-devdata-all.mjs)（一键：类型检查 → 产物 →
单测 → 真机链路 → 真宿主挂载，登记在 `scripts/verify-list.mjs` 里）；重指它会把那条入口弄丢，
且会把 README / `docs/agent-real-test.md` 里「`run verify` = 一键」那句话变成假的。
新脚本另起一个名字（与 `host-mount-smoke` 同族，也与 `devenv` 的 `card-smoke` 对齐）。

**本轮验到的一条，只有真机才验得到**：写 `plan.maxRows` **没有**把 `plan.maxCost` 抹掉——
真宿主那条 `settings.update()` 是**深合并**（`dsh-settings` 的 `mergeLayers`），而假宿主的
`Object.assign` 是浅合并。所以这条断言分两处：兜底路径（没有 settings 服务）由 `mergeSection` 的
用例钉住，走真 settings 栈那一半由真机断言 ⑧ 钉住。

**这一轮没验到 / 已知的两处**：

1. **英文界面下「怎么授权」那一段仍是中文**：那段文案来自 `@hyzyn/dsh-kit` 的 `capabilityHowTo()`
   （宿主侧判据的一部分），不在本包的 i18n 目录里，所以 `check-i18n` 数不到它（数的是本文件里的
   字面量）。要么把那一档话术在 `kit` 里做双语，要么接受「授权说明只给中文」。本轮按「不动 `kit`」
   处理（`devenv` 记-11 记了同一条）。
2. **浏览器里只点了标量那一次「保存」**：改目标那一次要在页面上再点两个复选框（改动 + 确认），
   真实机脚本没点——它证明的是同一段提交代码的第二次。数据面那一半（含能力声明跟回来）已由
   ⑮⑯⑰ 覆盖，**客户端那一段的其余分支（增删行、勾确认框）没有自动化证据**。
   （另：`§5.1` 的「关」这一半本来就没有入口——两档能力不可写、`bindCapabilitySources` 不接
   `GrantStore`。那不是缺口，是刻意的边界。）
   > **2026-10-04 追加（原文保留）**：这一处缺口已补——`card-smoke` 多了 **㉕㉖**：真 Chrome 里
   > 点「+ 添加目标」→ 往新行的 **10 个字段**写值（**两个下拉框走 `change`、文本框走 `input`，
   > 且都要先过原生 setter**，否则 React 的 value tracker 不认，提交上去的还是旧值）→ 勾确认框
   > → 点保存 → 卡片回「目标已保存（进审计）」；再用 HTTP 复核 `engine` / `env` / `port` 都在位。
   > 实跑 **25 PASS / 0 FAIL**（原 23 + 这两条）。见下方记-19。

### 记-19. 目标编辑器的**客户端路径**补验：DOM 上真的加一行目标、点保存（2026-10-04，根 ROADMAP 第 13 项）

**由来**：记-18 自己记着「客户端那一段的其余分支（增删行、勾确认框）没有自动化证据」——㉓ 只点了
**标量**那一次保存（表单里就是刚 GET 到的那份值）。而目标那一行提交上去要过的是本包**最严的
一套**判据（`normalizeTargets`：逐行逐字段、引擎认不出整条拒、连接要么两个都给要么都不给）。
`client.js` 不在 vitest 层，`client-lint` 管语法与地址来源、`check-i18n` 管键集，**都不看 payload**。

| 落点 | 内容 | 门槛（已验） |
|---|---|---|
| `scripts/verify-devdata-card.mjs` ㉕ | 真 Chrome：找带目标编辑器的那张卡（确认框必须在**嵌套 `.dd_card`** 里找，否则先命中标量的复选框）→ 点「+ 添加目标」→ 往新行 10 个 `.dd_input` 写值（`setValue` 按 `tagName` 分派：select 走 `change`、input 走 `input`，两者都先过**原生 setter**）→ 引擎/环境档从**真实 options** 里挑第一个非空值 → 勾确认框 → 点保存 → 等 `.dd_msg` 变「目标已保存（进审计）」 | 真宿主 + 真 Chrome：行数 3→4、`fieldCount:10`、engine=`sqlserver`、env=`dev`、消息命中 |
| 同上 ㉖ | HTTP 复核：`dd-dom` 在位，且 `engine` / `env` / `port` 与刚填的一致（**服务端那套判据真的收下了这份 payload**） | `ids=[redis-248,redis-two,redis-three,dd-dom]`，三个字段都对得上 |

**这一轮没抓到缺陷**（如实记）：㉕㉖ 一次过。价值在把「客户端拼的 payload」这类**静态闸门看不见**
的东西纳入每次 `pnpm --filter @hyzyn/dsh-devdata run card-smoke`——脚本从 23 条变 25 条。

**顺带两件小的**：① 步骤号连号（`㉔` 已被「真实补丁未变」那句自证占用，所以新两步排 **㉕㉖**，
不是插在中间改号——那会让文档里已有的编号引用失效）；② `devfront` 同款的两步在
`scripts/verify-devfront-card.mjs` 的 **⑰⑱**（2026-10-04，见那条提交）。

### 记-20. `devdata_verify`：把清单接进工具面（2026-10-04，待办 21 收口 / 根 ROADMAP 第 14 项）

**由来**：待办 21 记着「一次发布的证据链里『数据对』那一环只能由人 / 脚本接上」——本包的清单加载 /
校验 / 求值在 `src/verify.ts` 之外没有任何消费者。这一轮把它接成 agent 工具（工具名 `devdata_verify`，
与 `devfront` 的 `site_verify` 对称）。四条判据是这一轮定死的：① 工具名 `devdata_verify`；
② 加载期的语句判据**按目标引擎**判（上一轮已落，见待办 21 的第一层）；③ **只接今天真能跑的引擎**
（Redis），SQL / RocketMQ 的断言逐条记「没验成」、不假装跑过；④ 只在**存在 redis 目标**时注册
（与「没有执行器就不露引擎入口」同一条纪律）。

| 落点 | 内容 | 门槛 |
|---|---|---|
| `src/verify-run.ts`（新） | `runManifestVerify({project, cwd, assertions, targets, runner, ceiling?})`：四种处置**一种都不许混**——① 清单里的目标没配 → `unknown` 且**通道一次都不发**；② 引擎没接通 → `unknown`；③ 被作用域 / 闸门拒 → `unknown` + **原样**的码与原因（拒的是这次调用，不是数据）；④ 真跑了 → 交 `evaluateAssertion`。报告顺序 = 清单顺序；`problems` 是**去重后**的跑批级原因；`ran` 只数「真跑到通道且执行成功」的条数 | `test/verify-run.test.ts`（新）6 例：四种处置各一条 + 顺序 + 汇总，含两条**反例**（把没配的目标也发下去 → 那条会变 `pass`；把「引擎没接通」写成 `fail` → 整批变 `fail`） |
| `src/redis-executor.ts` | `shapeReplyAsResult`：**裸回复 → 断言库要的表格**（顶层元素一行、列名 `value`；`nil` = 空结果）。**这一跳是接的时候抓到的**：`ToolExecutor` 的注释写着「与 `ShapedResult` 结构兼容」，而 redis 执行器实际给的是 `shapeReply` 的裸值（`PING`→`'PONG'`，命令原文入口就靠它）；直接当 `ShapedResult` 用会在真机第一条断言上抛 `TypeError`（`result.rows` 不存在），**纯单测抓不到**（夹具给的是真表格） | `test/redis-executor.test.ts` 10 例（新增 2：标量 / 数组 / `nil` / 上限）+ `plugin.test.ts` 那条端到端（真发 `PING` 判 `eq: PONG`） |
| `src/plugin.ts` | `runManifestAssertion`（按断言自己声明的 `target` **逐条派发**；不在 `servedEngines()` 里的引擎**在碰执行器之前**短路，免得拿 SQL 语句去问 Redis 解析层得到一句无关的拒绝）+ `runVerify` + `renderVerify`（先「真的跑了 X/Y 条」、再逐条 `✓/✗/?`、再「没验成的原因」、最后汇总）；注册条件 `live.targets.some((t) => t.engine === 'redis')`。**不进 `TOOL_SPECS`**（它不是引擎入口），所以可见面里没有它——启动日志那一行显式追加，观测面才不漏报（**D04**）。拒绝的 `hint`（恢复路径）跟着 `code：message` 一起带出：省掉它等于把记-16 那条纸割（「作用域拒绝不说判了哪个目录」）在这条新入口上重新种一遍 | `test/plugin.test.ts` 36 例：注册面 5 条 + 6 条清单驱动（能跑的、混引擎的、目标没配的、作用域拒的、写语句在加载时被拒、没有清单） |
| 文档 | `conventions.md` 那张表的第三列 → `devdata_verify`，「不对称」那段改记**当天闭合**（保日期）；根 `ROADMAP.md` 第 14 项补一条；本包 README 的工具面枚举 / 纪律 / 清单示例 / 验证表 / 日志样例 | `check-doc-links` / `docs-index` / `doc-count-drift` 全绿 |
| 守卫翻正向 | `scripts/test/release-chain.test.ts` 的 tripwire 按它自己的提示翻成**正向断言**（devdata 的清单**确实有**工具面消费者）+ 一条反例（把 `loadManifest(` 从源码里删掉 → 判据报空，并先断言**替换真的生效**） | 该文件 8 例 |
| 真机脚本 | `scripts/verify-devdata-host-mount.mjs` 期望值 4 → 5（那个 profile 有 redis 目标 → `devdata_verify` 会注册） | 见下 |

**真机证据（本轮实跑）**：

| 档 | 命令 | 结果 |
|---|---|---|
| 真 Redis（248，4.0.14） | `DEVDATA_REDIS_248=1 DEVDATA_REDIS_HOST=…/npx vitest run packages/devdata/test/redis-real-machine.test.ts` | **12/12**：内核那组 6 + 插件层那组 6（新增 ⑥：清单里两条 redis 断言真跑出 `✓`、一条 SQL 断言记 `?`「执行通路还没接通」、`overall unknown`、**全文没有 `✗`**） |
| 真宿主挂载 | `node scripts/verify-devdata-host-mount.mjs` | **10/10**：真 ToolRuntime 接受了这条新工具定义，注册行**恰好**是五条，且真实 `~/.dsh/cordis.patch.yml` 逐字节未变 |
| 全仓闸门 | `pnpm typecheck && pnpm build && pnpm test && pnpm aggregate` | 全绿；`DEVENV_LOCAL_IMAGE=…openjdk8:v1 pnpm test` → **2803 passed / 30 skipped**（三个本机 docker 档真跑而非 SKIP） |
| 卡片 | `devdata run card-smoke` / `devfront run verify` | 25 PASS / 17 PASS（0 FAIL） |

**没抓到的（如实记）**：

1. **`exec.signal` / 协作式预算没接**：`execute` 没声明 `timeoutMs`、也没把信号传下去——按本轮定死的
   形状原样做的（`invokeRedisCommand` 也不收信号）。触发条件在这里：一次跑清单里**全部**断言，
   单条受目标 `timeoutMs`（默认 5s）约束，**6 条以上就可能超过 30 秒**，而 conventions 那条规矩
   的门槛正是「工具自己的等待上限达到 30 秒」。要不要补（取消自成一档 + 报告里单列）留给下一轮。
2. **「只有 SQL 目标时不注册」只在假宿主上验了**（`plugin.test.ts` 三条注册面用例）；host-mount 那条
   profile 是 redis 目标，真宿主上没造第二个 profile 去验它。
3. **Redis 清单的真实样本还没有**：口径（单列 `value`）与两条 `PING` / `DBSIZE` 断言是自造的；
   真实项目里那份 `verify/<项目>.yaml` 长什么样、要断言哪些业务键，得等第一条真清单进项目仓库。

### 记-21. 配置卡片的版式重做（2026-10-04，用户提「配置页面不太美观」）

**由来**：卡片自记-18 建起来后一直是**一列十行 + 全宽输入框**：每个字段的标签后面拖着一长串括号口径
（`id（工具按它选目标）`、`SCAN 上限（1~1000；留空 = 默认 200）`……），一行目标十行叠下来比屏幕还高；
`+ 添加目标` 与「保存」共用同一个「输入框样式」的按钮，`**重点**` 与 `**没有落盘**` 这类 markdown 星号
**原样显示在界面上**；能力档是一个虚线框，两档的名字与说明挤成一串。这一轮**只做版面**：数据面、
裁决、写入路径与审计一行没动。

| 落点 | 内容 | 门槛 |
|---|---|---|
| `client.js` CSS | 三层面板（`dd_panel`：插件配置 / 目标 / 能力档）+ 固定两列栅格（`@media (max-width:640px)` 回落单列）+ 行头环境胶囊（`dd_chip`，一个色一个点）+ 主色**只出现在「保存」**（`dd_btnPrimary`）；按钮分 `dd_btn` / `dd_btnGhost` / `dd_remove` 三档 | `typecheck` 里的 `client-lint` 检查 ③：**62 处**主题变量全部存在于宿主 403 个名字里（D10 那族错不再犯）；地址来源 0 处 |
| `client.js` DOM | 字段文案拆成「短标签 + `dd_hint` 小字」两组键（口径不丢，只是下沉），字面 `**` 全部清掉；能力档排成两列网格（第一列 180px 放得下 `dangerousReadCapability`，放不下就折行，不压到状态列上）；空态改虚线块、确认框改琥珀色提示块 | `check-i18n`：**61 条键** zh/en 一致、用法命中、0 条残留中文字面量；新键域只用了白名单里的 `panel.` / `badge.` |
| `src/plugin.ts` `configSnapshotFrom` | 新增只读元信息 `envFacts`（每档 `allowsWrite` / `requiresConfirm`）——胶囊的判据**不许卡片按环境名猜**：`test-shared` 与 `test-isolated` 光看名字都像「测试」，写权限正好相反 | `test/config-route.test.ts` 新增一例（五档逐条断言） |
| `client.js` 行高（用户截图指出的**没对齐**） | 标签是 inline `<span>`，行盒高度跟着**字体度量**走：同一行里拉丁标签 `id` 是 15px、中日韩标签 `名字` 是 17px——右列整列被压低 2px。标签 / 小字 / 能力档两列文本一律钉死 `line-height:16px`，行盒高度不再随文字脚本变 | 真机量 rect：5 对字段的 `inputTop` 两两相等（776/776 · 860/860 · 923/923 · 1007/1007 · 1091/1091），标签行盒统一 16px |
| 契约（刻意不动） | `.dd_card` 的嵌套（确认框靠它定位）、`.dd_input` 的**顺序**（10 个字段）、「目标行里第一个复选框就是确认框」 | 真机 ㉕㉖ 仍绿：行数 3→4、`fieldCount: 10`、payload 过服务端最严那套校验 |
| `scripts/test/client-theme-tokens.test.ts` | 一条反例断言里**写死了**「`--dsw-specific-input-major` 在 devdata 出现 2 次」（旧版 `.dd_save` 与 `.dd_input` 各一次），而这次改版把按钮那处换成了 `--dsw-alias-bg-layer-1` → 反例变红。改成**现算**：按原文实际出现次数生成期望数组，守的性质（每一处都报、顺序照原文）不变 | 该文件 34 例；`pnpm test` 全绿 |

**真机证据（本轮实跑）**：

| 档 | 命令 | 结果 |
|---|---|---|
| 卡片 | `pnpm --filter @hyzyn/dsh-devdata run card-smoke` | **25 PASS / 0 FAIL**（改版前后各跑、连跑多次全绿），真实 `~/.dsh/cordis.patch.yml`（1086 字节）逐字节未变 |
| 肉眼 | 真宿主 + CDP 截图（**临时**在验收脚本里加了一段「关掉首启引导弹窗 + 把目标行滚进视野」的截图代码，拍完 `git checkout` 还原；配置面 / 目标行 / 能力档各一张） | 版式、胶囊配色（`test-shared` 琥珀「写需确认」、`test-isolated` 绿「可写」）与两列栅格符合预期；第一版里自己造出来的一处叠字被截图抓住并修掉：能力档第一列 120px 放不下 `dangerousReadCapability`，它与右侧状态文字**叠在一起** |

**没抓到的（如实记）**：

1. **深色主题只有 token 层的理由，没有截图**：卡片只用宿主 `--dsw-*`（两档主题各自有值，`client-lint`
   检查 ③ 管着名字），但本机验收跑的是浅色；`--dsw-alias-bg-layer-*` 的分层要到深色下才真正显出来。
2. **窄窗口的单列回落没真机验**：`@media (max-width:640px)` 是 CSS 层的事实，验收窗口是 1440px。
3. **胶囊的 `title` 不翻**（环境名与档位词拼接）：环境名是标识符，按 conventions「语法示例不翻」同类处理；
   顺带记，`meta.capDeclared` 里的「受限写 / 危险读」来自配置（用户自己写的 label）。

### 记-22. 卡片里的**证据链总览**（2026-10-04，P13 第一版 / 根 ROADMAP 第 17 项）

**由来**：维护者问「查看数据库数据的 UI 在哪里」——答案是**没有**，于是当天拍板开工 P13（统一视图）与
P14（面板），并定了先后：**先 P13**。P13 的完整形态是「一屏关联 Jenkins 构建 / 容器 / 数据 / 页面」，
而它依赖 P3–P12（SQL 面还没接通、Jenkins 与本仓没有任何通路），所以第一版**只做证据链的形状**：
三份清单**在不在、项目名对不对、条目几条**——**不做领域校验，也不冒充结论**（结论要连目标、要跑一遍，
那归各面自己的工具）。

| 落点 | 内容 | 门槛 |
|---|---|---|
| `src/evidence.ts`（新，纯函数） | `readEvidence({root, project})`：按 `EVIDENCE_FACES` 读三面的清单，返回 `missing` / `unreadable` / `malformed` / `empty` / `multiple` / `parsed` 六态 + `projectInFile` / `projectMatches` / `count`；`BAD_ROOT`（不存在 / 不是目录 / 相对路径）与 `BAD_PROJECT`（`../`、含分隔符、点开头……）是**两种拒绝**，与「没有那份清单」分开 | `test/evidence.test.ts` **9 例**（含两条 ★ 与一条反例：把越界后的落点文件真的放出来，证明校验发生在读文件之前） |
| 三面路径（**不许自己再拼一份**） | `ready` = `.ready.yaml` / `verify` = `.yaml` / `web` = `.yaml` 三个后缀写在 `EVIDENCE_FACES` 里——跨包 import 走不通（三包互不 import），所以用一条**跨包对齐守卫**钉住 | `scripts/test/release-chain.test.ts` 新增一例：与 `devenv` 的 `readyManifestRelPath`、本包的 `manifestRelativePath`、`devfront` 的 `webManifestRelativePath` **逐一对齐**（后缀写错的表现是「这个项目没有清单」——假阴性） |
| `src/plugin.ts` | `POST /api/dsh-devdata/evidence`：与 `/config` 同一道回环围栏；**只读文件、不连目标、不写任何东西**，所以**没有**能力闸门（这条路上没有能改东西的代码）；读进审计（`evidence.read`，成功与拒绝都记） | `test/config-route.test.ts` 新增 **5 例**（200 三面 + `jenkins` 未接 / 403·405·400 / 两种拒绝码 / 审计两行 / 停用时照常可用） |
| `client.js` | 卡片里一区「项目证据链」：项目根 + 项目名（留空取目录名，读回后写回输入框）+「看证据」，三行分别给**面 / 清单路径 / 状态 / 条目数与项目名是否一致**，末尾两句如实的话（结论归各面的工具；Jenkins 未接） | `check-i18n`：**87 条键** zh/en 一致、0 条残留中文字面量（9 条状态键刻意写成显式分支，不走映射表——否则闸门只能报「可能是死键」）；`client-lint` 检查 ③ **72 处**主题变量全存在 |
| 契约（刻意不动） | 新面板**不进** `.dd_card` 那一层：验收脚本用 `.dd_targets` → `closest('.dd_card')` 定位目标编辑器，多一层会把它的判据挪位 | `pnpm test` 全绿（**2941 passed / 41 skipped**）；`pnpm typecheck` 全仓绿 |
| `scripts/verify-devdata-card.mjs` ㉗㉘（真机） | 夹具项目目录建在 `harness.workDir` 里（隔离前缀 + 收尾整体删除）：`ready` 项目名正确、`verify` **故意串了**、`web` 故意不写。真 Chrome 里填根与项目名 → 点「看证据」→ 读三行；再把根改成不存在的路径，看那句拒绝能不能与「没有清单」分开 | **27 PASS / 0 FAIL**（本轮实跑）；真实 `~/.dsh/cordis.patch.yml`（1086 字节）逐字节未变 |

**这一版的诚实清单**：

1. **它不报结论**——`parsed` 只说明「文件读到了、项目名对上了」；服务真的就绪没有、断言真的过了没有，
   仍要去敲 `env_wait` / `devdata_verify` / `site_verify`。文案里写死了这一点，因为把「读到了」看成
   「验过了」正是这套东西最怕的假绿；
2. **Jenkins 那一格是空的**（明写「未接」）：本仓没有任何一条从插件连 Jenkins 的通路，摆一个空壳
   比空着更坏；
3. ~~**真机 DOM 证据还没补**~~ —— **当天补上**（㉗㉘，27 PASS / 0 FAIL，见上表）。原文保留：这一版
   第一次收尾时只跑了单测与假宿主，而「卡片上点一次」按 conventions § 客户端卡片**必须**有真机证据。

### 记-24. 侧边栏「数据浏览器」：Redis keyspace 树（2026-10-04，P14 第二版）

**由来**：维护者贴了一张数据库客户端的对象浏览器截图问「规划的数据 UI 是这样的吗」。答案是**不是**——
第一版只是一个命令框，而方案里的 P14 也只有一句「面板（GUI）」。当天定下：**先做 Redis keyspace 树**
（今天唯一有真执行通路的引擎），形态是**目标 → key → 内容预览**。

| 落点 | 内容 | 门槛 |
|---|---|---|
| `src/keyspace.ts`（新，纯逻辑） | `scanCommand`（`SCAN <游标> [MATCH p] [COUNT n]`）、`parseScanReply`（`[游标,[key…]]`，认不出就拒）、`previewPlan`（五种类型各两条**有界**命令）、`shapeKeyView`（截断判据三处）、`checkAddressable`（**可寻址性**：含空白 / 控制字符的 key 与模式一律拒） | `test/keyspace.test.ts` **14 例**（每种类型的命令逐字对齐、注入反例、六态截断） |
| `src/plugin.ts` | `POST /api/dsh-devdata/keys` 与 `/key`：**命令宿主侧拼**（不是浏览器给的原文），交给 `invokeRedisCommand`（与 agent 同一个函数）；`/query` 的入参判据抽成 `panelTarget` / `panelCall` **一处**，三条路由共用；拒绝原样带 `code` + 正文 + 恢复路径 | `test/keyspace-route.test.ts` **12 例**（含 ★「拼出来的就是发出去的那条」逐字对齐假服务收到的 argv、★「拒在连之前」时假服务**零请求**、审计 `operationId` 串起一次浏览）；`test/fake-route.ts` 把 HTTP 夹具抽成一份（config-route 也改用它） |
| `client.js` | 侧边栏面板：`sidebar.panellist`（id `devdata`，图标是「数据库」）+ `main`（key `devdata`）**成对注册**；面板内：目标 / 项目根（记住上次）/ MATCH / COUNT + 「扫描」「继续扫描（游标 N）」+ 左列 key、右列类型 / TTL / 元素数 / 预览表 / 「还有更多」 | `check-i18n`：**133 条键** zh/en 一致、0 条残留中文字面量；`client-lint` 检查 ③ **96 处**主题变量全存在 |
| `scripts/verify-devdata-card.mjs` | 假 Redis 扩成会答 `SCAN` / `TYPE` / `TTL` / `STRLEN` / `GETRANGE`；新增 ㉛㉜：侧边栏入口真的出现、面板真的渲染、扫出两个 key、点开看到类型与值（**第五轮又加了 ㉝㉞**：三角是真开关、「高级」展开后同排） | **34 PASS / 0 FAIL**（真实 `~/.dsh/cordis.patch.yml` 逐字节未变） |

**第二轮：可用性（2026-10-04，用户反馈「怎么感觉这么难用」）**

| 问题 | 改法 |
|---|---|
| 要手敲一个「项目根」才能扫——而用户根本不知道填什么 | **自动带出**：选目标时取它的 `scopeDirs` 第一个（那正是这个目标允许访问的目录），并在下面列出全部候选。手敲列表外的路径只会撞 `OUT_OF_SCOPE`，白费一次往返 |
| 打开是一片空白，得先点「扫描」 | **自动扫一页**（ref 守卫，只跑一次）：只读、有界、同一本审计——与 docker 面板列表自动刷新同一取舍 |
| 空列表只有一句话，「还没扫」被说成「这个库是空的」 | 空状态**分两句**：还没扫 → 「点扫描开始」；扫了没有 → 「MATCH 可能太窄，或这个库是空的」 |
| `COUNT` 摆在主界面 | 收进**「高级」**：它是 `SCAN` 的提示值，不是显示上限，摆在主界面上会让人误会 |
| 目标没有 `scopeDirs`（处处拒绝）时按钮照点 | 如实说「处处拒绝（设计，不是坏了）」并**禁用**扫描；让人点一下才吃 `OUT_OF_SCOPE` 是把设计藏起来 |
| 真机断言 | ㉛ 加强为**断言自动带出的值等于目标声明的目录**（`scopeValue === '/Users/me/coding'`）+ `COUNT` 确实在折叠的「高级」里；㉜ 不变。**32 PASS / 0 FAIL** |

**第三轮：抄成树形（2026-10-04，用户贴了数据库客户端的截图说「UI 可以抄现成的」）**

| 层 | 落点 | 判据 |
|---|---|---|
| 库层 | 新路由 `/api/dsh-devdata/keyspace` → `INFO keyspace`（一条允许的读）；`parseInfoKeyspace` 纯函数 | `CONFIG GET databases` **在禁表里**，所以库列表只能从 `INFO` 来；回复里 `current` 是**目标声明的那个 db**——`dbs` 是「这台机器上有什么」，`current` 才是「我们能去哪」。用例断言假服务收到的就是 `[SELECT 1, INFO keyspace]`（目标声明 db:1） |
| 类型层 | 新路由 `/api/dsh-devdata/types`：对本页 key 逐个 `TYPE`，上限 `TYPE_BATCH_MAX` = 50，超出直接拒（`TOO_MANY_KEYS`） | Redis 4 没有 `SCAN … TYPE`（6.0 起），全库按类型计数只能 O(N)——所以**用户点了才付**，界面上写明代价；`TEST`：**第二个** `TYPE` 一条命令、一行审计 |
| 视觉 | 缩进三级 + 折叠三角（**key 行不放三角**：key 不可展开）+ 图标（库 / key / 类型）+ 右侧计数 + 悬停与选中态 | 真机截图（`devdata-panel-*.png`）人肉复核；`.dd_treeBar` 允许换行——左列不宽，按钮**不许被压成竖排字**（第一版截图里「扫描」竖过来了） |
| 一处错诊断 | **切换目标时清掉上一条错误**：mount 时对第一个目标的自动扫失败（比如它配了凭据而宿主没有解析器），那条错误属于**上一个**目标，留着会让人以为当前目标也坏了 | 真机截图抓到 |

**第四轮：版式返工（2026-10-04，用户反馈「样式错乱」，附了一张 1200px 视口的截图）**

四处都在这张截图上量得出来（截图 2295px / 视口 ≈1200 CSS px，比例 ≈1.91）：

| 表现（截图上的数） | 根因 | 改法 |
|---|---|---|
| 「目标」的标签在 y142、「作用域基准（项目根）」在 y101——两个并排字段的**标签差 21px**，「高级」浮在右下 | `.dd_shellBar` 用了 `align-items:flex-end`：作用域那个字段比「目标」多一行提示（`这个目标允许的目录…`），底对齐把矮的那个整体推下去 | 改 `align-items:flex-start`：标签在同一行、控件也在同一行，多出来的那行提示只在下面延伸 |
| 「发了：SCAN 0 COUNT 200 · 本页 60 个 key」贴在面板**最左边**（x=0，面板贴窗边时第一个字被切），而头部 / 工具条的内边距是 18px | `metaLine()` 与 `listMsg` 是 `.dd_shell` 的**直接子元素**——不在任何一列里，而它们自己没有内边距 | 各挂 `dd_shellMeta` / `dd_shellNote`（`padding:7px 18px`）；通栏元素**自带**内边距，别指望父级 |
| 选中那一行的行首像多了一个黑色括号（截图里那道弧） | `box-shadow:inset 2px 0 0` 画在 `border-radius:8px` 的行上：圆角把这 2px 阴影削成一道弧（真机计算值 `rgb(15,17,21) 2px 0 0 inset` + `8px`） | 左两角改直角（`border-radius:0 var(--dsw-radius-sm) var(--dsw-radius-sm) 0`）+ 3px 直轨=一条干净的竖轨 |
| 长 key（`exam:checkin:code:…`、`ONLINE_DATASOURCE_RELATION:…`）折成两三行，左列很挤 | 三级缩进 54px 是照「连接 → 库 → key」叠出来的，而 key 那层是列表的主体 | `dd_treeL3` 54 → 44px（key 名多 10px，多数长 key 少折一行）；**层级与图标不动** |

判据：`scripts/verify-devdata-card.mjs` **32 PASS / 0 FAIL**（㉛㉜ 仍绿——`dd_shellBar` / `dd_treeKey` /
`.dd_treeName` / `.dd_metaRow` 这些被脚本定位的选择器一个没动）；1200 与 700 两种宽度真机截图人肉复核
（700 = 媒体查询回落到上下两栏那一档）。

**第五轮：两条**能点**的规矩（2026-10-04，用户反馈「高级的布局有问题；树怎么没法展开和折叠」）**

两条都不是审美问题，是**画了一个能点的东西却没接线**（第一版把三角与折叠态都省了）：

| 表现 | 根因 | 改法 |
|---|---|---|
| 树上的 `▾` / `▸` 点下去**一点反应都没有**（真机量到 `button.dd_treeToggle` = **0** 个，全是装饰用的 `span`） | `twisty()` 硬写 `open`：连接那一行永远画 `▾`、库那一行永远画 `▸`，而**折叠态根本不存在**——树是「一次性全展开」的静态列表 | 三角变成**真按钮**（`aria-expanded` + 键盘可达），整行也可点；折叠态是组件 state `closedNodes`（**默认全展开**，只有真有子节点的行进表：`conn` / `db<index>` / `type:<bucket>`）。**没有子节点的行（非当前那个库）不再是 `▸` 而是空白占位**——给它一个能点的三角才是骗人 |
| 「高级」展开后，「COUNT」比「目标」低了整整一个 `summary` 的高度；输入框被 `width:100%` 拉成 **391px** 宽（半个工具条） | `<details>` 是竖排（summary 压在字段上面），而字段是 `flex:0 1 auto` + `width:100%` 的输入框 → 撑到残余宽度 | `details[open]` 走**横排**（`summary` 与字段并排），字段定宽 260px。真机量到：三个字段顶边同为 y=59、COUNT 输入框（260）与作用域基准输入框（290）同一行、工具条只从 98 长到 114 |

判据（**新加两条真机断言，脚本总数 32 → 34**）：㉝ 点连接那一行的三角 → `[data-db]` 行数 2 → **0** →
再点 → 回到 2；㉞ 展开「高级」后 COUNT 的输入框与作用域基准的输入框**顶边相等**（±2px）。
`pnpm -r typecheck` / `pnpm test` 同轮全绿。

**第六轮：库那一层（2026-10-04，用户问「redis 不是有 16 个库吗」）**

问的是「为什么只看得见一两个」，查下去发现后半句更要紧：**看不见自己的库时，整个面板是废的**。

| 问题 | 根因 | 改法 |
|---|---|---|
| 16 个库里只列出一两个；更要紧的是——**目标声明的那个库恰好是空的**时，key 列表、MATCH、扫描按钮**统统不见**，左列只剩「要浏览这个库：加一个目标」的提示 | 库那一层**只取 `INFO keyspace`**，而它对**空库一行都不报**；`current`（目标声明的库）那一行如果不在 INFO 的列表里，就没人画它——而工具条与 key 列表**是挂在这一行下面的**（`dbRow` 只在 `isCurrent` 时渲染子节点） | 库那一层 = `INFO keyspace` 报的 ∪ **目标声明的那个库**（合成一行 `0 个 key`，并且就是当前那一行）→ 工具条与 key 列表回来了。排序按 `index`，不补 `0..15`、不假装知道总数（「一共配了几个库」只有 `CONFIG GET databases` 答得出，`CONFIG` 在禁表里） |
| 界面上没有任何地方说这件事——只能靠猜「是不是面板坏了」 | 树里只有逐库的「要浏览这个库…」提示，没有一句说**这一层的出处** | 连接那一行下面加一句如实的出处（「只列有 key 的库」，含「Redis 默认 16 个」这层意思）；面板底部口径从三条加到四条，把 CONFIG 那条判据写全 |

判据（㉛ 改写成**两个真源都要在**）：假 Redis 的 `INFO keyspace` 改成**只报 `db2`**（我们声明的 `db0`
一个 key 都没有）→ 断言列表里同时有 `db2 · 9 个 key`（这个数字只可能来自 INFO）与
`db0 · 0 个 key · 目标声明的库`（INFO 没报也画，且是当前那一行），并要求界面上写着那句出处。
**34 PASS / 0 FAIL**。这轮还踩了一个老坑：假服务的 RESP 字节数写成 `$33`（应为 `$42`）→
`INFO keyspace` 整段被截掉，表现成「这台机器上没有任何库」——**假服务也是代码，长度要数**。

**这一版踩到 / 定死的四条**：

1. **可寻址性**：命令原文按空白切分（全仓唯一那处 `redisArgv`），所以含空白的 key / 模式**发不出去**；
   更要紧的是注入（`x COUNT 1` 会给 `SCAN` 多塞两个参数）。判据放在**拼命令之前**，用例断言那一步
   假服务**零请求**——「界面按 A 判、执行按 B 跑」这类错位在这里被断掉；
2. **`[object Object]`**：详情第一版把 `<strong>` 元素与字符串 `join` 成一行，真机渲染出
   `[object Object] · TTL 3600 秒`（㉜ 第一次跑就红了）。元素与文本**不许 join**；
3. **模板串里的 `\s`**：验收脚本用 `chrome.evaluate(\`…\`)` 传代码，`/\s+/g` 在模板串里被当成
   `/s+/g`——于是 `user:1` 渲染成 `u er:1`（丢掉字母 s）。真机上表现为「断言差一个字符」，实际是
   **转义**问题；这类代码字符串要用 `\s`；
4. **当时没有 db 切换器**（原话是「刻意的」）：一个目标 = `host` + 声明的 `db`（连接时 `SELECT`）。
   要让浏览器换库，就得让它决定 `SELECT` 什么——那会把「目标声明」从唯一真源降成建议（同类先例：
   `devenv` 的「清单就是白名单」）。**2026-10-05 改写成一条可检验的判据**（库号只能来自配置或服务器
   回复，且 `SELECT` 始终由执行器发）——见**记-25**；「要看另一个库，加一个目标」不再是唯一出路。
5. **一个 key = 3~4 次调用**：面板没有「一条命令取全部」的捷径（`MULTI` 是禁的，`HGETALL` 无界），
   所以一次点击就是 3~4 个连接与 3~4 行审计——用 `operationId`（`panel.keyspace`）把它们串起来。

### 记-25. 库那一层**能点着切**：把「没有 db 切换器」换成一条可检验的判据（2026-10-05，root ROADMAP 第 18 项）

**由来**：维护者贴了两张图——一张是**我们自己的面板**（树上写着 `db0 · 0 个 key`，下面却列着刚扫出来的
59 个 key），一张是 Navicat 的 Redis 对象浏览器（左树列出 `db0..db15`、各带 keys 数，点一下就切），
配一句「这库要做成可以选择的可以借鉴这个」。

第一张图里那个矛盾先查清楚了：**不是服务器的错**（对 248 直接发 `INFO keyspace` 得到
`db0:keys=59,expires=15,avg_ttl=...`，宿主那条 `/keyspace` 路由也如实返回 `keys: 59`），
是**面板自己的状态机**：`dbs = []` 同时表示「INFO 说没有库」与「这次读失败」两件事，而读失败时
它照样画「0 个 key」与「这台机器上还没有任何库」——恰好 `scan()` 的成功又把那条错误消息清掉了，
于是屏幕上只剩一句**与事实相反**的话。

| 落点 | 内容 | 门槛 |
|---|---|---|
| `src/keyspace.ts` | `MAX_DB_INDEX`（**配置侧防呆**，不是「这台机器有几个库」——那个只有 `CONFIG GET databases` 答得出，而它在禁表里）/ `isDbIndex` / `normalizeDbs`（去重升序，坏值原样交回）/ `defaultDb`（没写就是 0——连接本来的语义）/ `canBrowseDb`（声明的 ∪ 服务器当场报的） | `test/keyspace.test.ts` 新增 **4 例**：形状判据（小数 / 负数 / 超上限 / `'3'` 全不是）、`normalizeDbs` 把坏值交回、`defaultDb` 不猜、★ `canBrowseDb` 只放行两个事实源里的编号 |
| `src/plugin-config.ts` | 目标新增 `dbs?: number[]`；`declaredDbs(target)` = `db` ∪ `dbs`（去重升序）——**「没写」与「写了 `[0]`」行为完全一样**，加这个字段不会让已配好的目标换行为。坏值逐条进 `problems`（`不是数组` / `里有不是库号的值` / `没有连接` 三种话分开），**不静默丢** | `test/plugin-config.test.ts` 新增 **5 例**；原来那条「连接齐了才有连接，含 db」照旧 |
| `src/plugin.ts` | ① 路由新增 `panelDb()`：没写 `db` → 用声明的缺省库；命中**声明集** → 直接放行（**不多发一条命令**）；只在服务器那边有 → 先问一次 `INFO keyspace`；都不是 → `BAD_DB` + 恢复路径。② `executorAtDb()`：执行器是按 `target.id` 取连接的，所以「切库」必须**覆盖这一帧的连接**——而且只在选中的库与声明的那个**不同**时才覆盖（否则每次面板调用都会多一帧 `SELECT 0`，那正是 `OPTIONAL_DB` 当初要避免的 D07）。③ `/keyspace` 如实返回两个字段：`dbs`（INFO 报的）与 `declared`（声明集）+ `current`。④ `normalizeTargets` 按**同一批判据**校验 `dbs`，最后那段「解析层必须一条 problem 都不报」的复核因此也守着它 | `test/keyspace-route.test.ts` 新增 **8 例**（★ 声明的库：假服务收到 `[SELECT 1, SCAN 0]` 且**没有 INFO**；★ 服务器报的库：`[INFO, SELECT 3, SCAN 0]`；★ 两个来源都没有 → `BAD_DB` + 恢复路径，且只发出那一条判据用的 INFO；库号形状不合法 → **连 INFO 都不发**；没写 `db` 的两种回落；`/key` 与 `/types` 也认 `db`）；`test/config-route.test.ts` 新增 **2 例**（`normalizeTargets` 的四条拒绝话 + 带 `dbs` 的行过复核） |
| `client.js`（卡片） | 目标编辑器加第 11 个字段「可浏览的库」（逗号分隔，如 `0, 1`）；草稿 / payload / 新增行三处一起改。**客户端不静默过滤**端口味的值：写错的库号原样发给服务端，由它回「`dbs` 里有不是库号的值 "abc"」 | 验收脚本 ㉕ 改成 11 个字段、㉖ 断言 `0, 2` → `[0,2]` 真的落到 GET 快照里 |
| `client.js`（面板） | ① 库那一层换成**三态** `dbInfo`（`loading` / `ok` / `failed`）——**「INFO 说没有库」与「读不上」从此是两种渲染**：读失败时键数一律 `键数未知`、树上挂出那条错误、**绝不**画 `0 个 key` 或「还没有任何库」，而 key 列表照样能用（读不上的是「哪些库有 key」，不是「能不能扫」）。② 错误消息**另立一格** `dbError`（上一版它与 `listMsg` 共用，被成功的 `scan()` 清掉正是那个矛盾的成因之一）。③ 每一行库**都能点**：`点一下切过去`（切库 = 重新扫一页 + 清掉旧选中与详情）、`当前浏览`、来源胶囊（`目标声明` / `服务器上报`）。④ 读失败时行列表**回落到 `/config` 快照**的 `db` / `dbs`（面板本来就有那份快照），并写上「这一层没读上」那句。⑤ 上次选的库按目标记在 `localStorage`（`{目标 id: 库号}`，只是偏好，下次照样由宿主判） | `check-i18n`：**154 条键** zh/en 一致、0 条残留中文字面量；`client-lint` 主题变量 **111 处**全存在 |
| 文档 | README 的「树的三层真源」表 + 「没有 db 切换器」那条判据改写成「切库 ≠ 让浏览器决定 `SELECT` 什么」（库号只能来自配置或服务器回复，`SELECT` 始终由执行器发）；配置示例加 `dbs`；根 ROADMAP 第 18 项与记-24 的第 4 条各自指到本条 | `docs-index` / `check-doc-links` 全绿 |

**真机证据（`scripts/verify-devdata-card.mjs`，38 PASS / 0 FAIL；夹具 `redis-two` 声明 `dbs: [0,3]`，
假 Redis 逐帧回，`SCAN` 的回复**带上当前库名**）**：

| 断言 | 做法 | 结果 |
|---|---|---|
| ㉛（改写） | 树上必须是「声明 ∪ 上报」三行：`db0`（当前浏览 / 目标声明 / 0 个 key）、`db2`（服务器上报 / 9 个 key）、`db3`（目标声明 / 0 个 key） | 三行都在，来源胶囊与键数都对 |
| ㉟ | 点 `db3`（**声明里有、INFO 没报**） | key 列表变成 `db3:user:1`（`SELECT 3` 真的生效），且 `INFO` 计数**一次都没涨** |
| ㊱ | 点 `db2`（**只在服务器那边**） | key 列表变成 `db2:user:1`，`INFO` 计数**恰好 +1** |
| ㊲ | 把假服务的 `INFO` 打成错误，换目标再换回来 | 树上出现那条错误、键数全是「键数未知」、**不出现**「还没有任何库」与 `0 个 key`，而声明过的 `db0` 照样扫得出 key |
| ㊲a | 恢复后重读一次 | 树回到三行，切到 `db2` 无错误横幅（截图用） |

**这轮踩到的两件事**（都不是被测代码的错，但都会让人读错证据）：

1. **假 Redis 必须逐帧回**：执行器把 `SELECT n` 与命令**一次全发**（少一次往返）、然后按**帧数**收回复；
   而夹具原来「收到一段就回一条」——切库一上线，面板立刻报 `EXECUTION_FAILED Redis 在 1234ms 内
   没有回复`。教训与「假服务也是代码」同一条：**它的行为要跟着协议走，不是跟着以前够用走**；
2. **验收脚本自己的 payload 映射会漏字段**：脚本里两处「从快照重建 targets」的映射此前没带 `dbs`
   （与当年漏 `credentialRef` 同一类），于是夹具声明的 `[0,3]` 在第一轮 ㉛ 里只剩 `[0]`——
   **看起来像产品 bug，实际是脚本把我自己的夹具吃掉了**。卡片保存是整份替换，凡加字段就要在这两处补一行。

**刻意没做的**（写清才敢叫「能切」）：

1. **不猜「这台机器有几个库」**：不补 `0..15`，也不假装知道总数（`CONFIG GET databases` 在禁表里）。
   Navicat 那种「16 个库全列出来」在本仓的做法是**在目标里声明** `dbs: [0, 1, …]`——声明过的空库
   会被列出来并画 `0 个 key`（INFO 真回了的前提下）；
2. **库号写错了要由服务器判**：`SELECT 999` 这种不会被配置上限拦住（上限 255 只是防呆），
   它会走到 `SELECT` 并由服务器如实报错——那才是真答案；
3. **仍然没有**：跨 key 搜索（`MATCH` 之外没有发现逻辑）、类型着色、把「上次选的库」同步到服务端
   （它只是 `localStorage` 里的偏好）。

### 记-26. 数据浏览器那一屏的**版式第三版**（2026-10-05，维护者「还是没变化，给我美化一下」）

**由来**：记-25 那一轮改的全是**判据**（切库、三态 `dbInfo`），视觉上这一屏一个像素都没动，于是维护者
贴回来的还是同一张截图＋一句「还是没变化」。把那张图当证据读，最刺眼的是两处：**树里五行灰字**
（「库这一层是两个真源拼的…」常驻在 key 列表上方，把列表挤出视野）与**底部常驻的四条口径**。
顺带记一条操作事实：客户端半体是按 `/plugins/??…` 的批量 URL 发的、**没有 cache-busting**，
改完要看效果得**硬刷新**（⌘⇧R）——否则「没变化」里有一部分是浏览器缓存，不是代码。

| 落点 | 内容 | 门槛 |
|---|---|---|
| `client.js`（CSS） | 第三版写成**只加规则的覆盖层**（`P14 第三版` 段），不动前两版那 80 行——那些注释各对应一个实测坑（对比度、粘顶、弹层宽度、圆角把选中轨削成弧形）。新增/改写：头部 52px 固定 + 圆角字形标识、工具条 `flex:none`、两栏各自滚动 + 栏头 `position:sticky`、细滚动条、下拉框 `appearance:none` 自绘 `▾`、选中行（库 / key）直角 + 3px 品牌色左轨、类型五色 `dd_kt_*`、类型胶囊、空态虚线卡 `.dd_blank`、详情条纹表 + hover + `.dd_kvWrap` 圆角容器、底部 `.dd_foot` | `client-lint`：主题变量 **167 处**全部存在于宿主快照（新增的 12 个名字都在那 403 个 token 里） |
| `client.js`（信息层级） | ① 树里那五行口径只留一句**来源**（`hint.keyspaceDbSource`），长的那段折进树末尾的 `<details>`（新键 `btn.keyspaceWhy` + `hint.keyspaceDbSourceMore`），只在 `INFO` 真回了时挂；② 底部四条口径（`hint.keyspaceRules`）折成 `<details>`（新键 `btn.keyspaceRules`）；③ key 行加类型点 + 类型胶囊——**类型未知就不画**（那要等用户点「按类型分组」付 N 次 `TYPE`）；④ 详情头 = key 名（等宽）+ 复制按钮（`navigator.clipboard`，纯本地、不过路由、不进审计；拿不到剪贴板就**不亮**那枚 ✓）+ 类型 / TTL / 元素数三枚页签；⑤ 栏头挂「本页 N 个」（**不是**「库里有几个」） | `check-i18n`：**159 条键** zh/en 一致、用法命中、0 条残留中文字面量 |
| `scripts/verify-devdata-card.mjs` | ㉙ 超时时**带上现场**：按钮是否 `disabled`、面板上那句话。原话只有「结果块空着」，而空着有三种成因（上一次请求还在途 / 目标或作用域基准是空的 / 请求真的没回来），2026-10-05 一次超时把 ㉙㉚ 一起拖红，只能靠猜 | 真机 **38 PASS / 0 FAIL**（㉛–㊲a 全部照旧：三行库、切声明库不多花 `INFO`、切上报库恰好 +1、读失败不谎报） |

**真机证据**：`pnpm --filter @hyzyn/dsh-devdata run card-smoke` → **38 PASS / 0 FAIL**
（那一次的 ㉙ 首跑曾超时、重跑全绿——所以顺手把现场信息补进了脚本；`--keep` 可留现场）。

**刻意没做的**：不引 CSS 框架 / 不加图表依赖 / 类型色**只是读数辅助**（判据、命令、允许集一个字没动，
`SELECT` 依然由执行器按目标声明发）/ 不动卡片那三区（配置卡片、证据链总览、看数据）。

### 记-27. 数据浏览器改成**一张表**（2026-10-05，维护者贴 Navicat 式对象浏览器的图：「请严格按照这个图来做」）

**由来**：第三版刚把版式收拾干净，维护者贴来一张 Navicat 的图，要三件东西：**三栏**
（连接树 / 一张表 / 详情）、**五列**（`Key` / `Type` / `Value` / `Size` / `TTL`）、**顶部 `Keys Contain`
搜索框**，外加 key 名按 `:` 折出来的前缀行（`actor (986)` → `movie (1183)` → `action (2)`）。

这一版是**结构**改动（不是配色）：原来「树里展开 key 列表 + 右侧详情」变成「左树选库 + 中间一张表 +
右侧详情」。表里每一格的值**都是真读出来的**，而 Redis 没有批量取类型 / 大小 / 值 / TTL 的命令——
一行就是 3~4 条。于是这一版真正要守住的东西从「怎么画」变成了「**每一格的值从哪来、什么时候付钱**」。

| 落点 | 内容 | 门槛 |
|---|---|---|
| `src/keyspace.ts` | `ROW_BATCH_MAX = 20`（比 `TYPE_BATCH_MAX` 小一档：一批 = 3~4 × 20 条命令）+ `PREVIEW_TEXT_MAX = 120` + `previewText(kind, rows, truncated)`：「值」那一列的**单行**形态（哈希 / 有序集合 `field:value`、非字符串包 `[]`、`rows === null` → `null` = 界面画「—」不猜、截断留 `…`） | `test/keyspace.test.ts` 新增 **4 例**（含「没做预览 → null」与两条截断） |
| `src/plugin.ts` | 新路由 `POST /api/dsh-devdata/rows`：逐个 key `TYPE` → `previewPlan`（元素数 / 字符串长度 + 有界预览）→ `TTL`，**逐行标错**（一页 20 行里第 7 行读不动，不该把另外 19 行一起关掉；但也**不许**把那一行画成空值）；上限 / 空数组 / 发不出去的 key 三种拒绝各说各的。`/key` 顺手多给一个 `preview`（同一个 `previewText`）——界面点一行时那一格**不用再发一条命令** | `test/keyspace-route.test.ts` 新增 **6 例**：★一行 = 四条命令逐字对齐、★超上限**一个请求都不发**、★逐行标错（第 2 行坏、第 1 行照给）、含空白那行**零 I/O**、库参数同 `/keys` 判据、`BAD_KEYS` |
| `client.js` | 三栏布局；表头与行**共用同一套列宽**（两处各写一份必然漂）；key 名按 `:` 折成前缀行，计数是**本页的**（`title` 写明「本页 N 个」）；`Keys Contain` 搜索框（没有通配符时补成 `*…*`，**补星号这件事印在那行「发了：…」里**）；「读取这一页」分批读（每批 20，读到一批填一批，进度在按钮上）；**没读过的格子画 `—`、真读出来是空的才写「空」**；点一行 → `/key` + 顺手填那一行 | `check-i18n`：**164 条键** zh/en 一致、用法命中；`client-lint`：主题变量 **190 处**全存在 |
| `scripts/verify-devdata-card.mjs` | ㊳：五列表头逐字、前缀行 `db2 (2)` / `user (2)`、`MATCH *user*` 真的印在 meta 行、点「读取这一页」后那一行变成 `string / hello / 5 字节 / TTL 3600 秒`（读之前是 `—`） | 真机 **39 PASS / 0 FAIL**（㉛–㊲a 全部照旧——这一版没动任何判据） |

**第二轮反馈（同一天）**：「列表的展开应该用 `>` 符号；列表的列应该严格按照图中来」。于是把两处照图对齐：
① 折叠 / 展开换成图里那两个字符（`>` / `⌄`）；② 列宽按图量（Key ≈ 22% / Type ≈ 12% / **Value 最宽 ≈ 47%** /
Size ≈ 9% / TTL ≈ 8%，其中 TTL 写死 96px——图里 8% 放得下是因为它写 `(No TTL)`，我们要放 `(TTL 3600 秒)`），
类型那颗点从 Key 列挪进 **Type 列**（`• hash`），`Size` 右对齐、表头加列间细竖线、TTL 一格改成带括号的短形态。
验收脚本 ㊳ 也跟着钉住这两个字符（**两个状态都读**：先记展开态、点一下记折叠态、再点回来——
「把已经展开的那个字当折叠态」是这道断言最容易犯的错，第一次就这么红过）。

**第三轮反馈（同一天）**：「怎么点击行才能加载值，优化一下吧；点击行出现的右边的详情去掉吧」。
两件事都做了：① **点一行 = 读一行的值**——那一行的五格当场填上（值那一格先显示「正在读…」，点下去就有
反馈；`/key` 本来就带 `preview`，填表不多花一条命令），**详情同时贴在那一行下面**展开（通栏 + 3px
品牌色左轨指明是哪一行，再点一下收起，同一时刻只开一行，`aria` 上它就在那一个 `button` 后面）；
② **右栏撤掉**：面板从三栏回到**两栏**（库树 / 表格），表格因此宽出一整栏。验收脚本跟着改了两处：
㉜ 现在从 `.dd_rowDetail` 取详情、并要求**这一行的类型 / 值 / TTL 真的填上了**；㊳ 多钉一条
`columns === 2`（少写这条，哪天有人把右栏加回来都没人拦得住），并在截图前点开一行——**拍的就是
「点一行之后」的样子**。

**与图刻意不一样的四件事**（照抄会变成撒谎）：

1. 图里左树有 `Data` / `Queries` / `Backups`，上面还有 `My Connections` / `Head Office 305`——那是
   Navicat 自己的 SQL 编辑器、备份与多连接管理器。本插件**没有**这些功能，**不画假节点**；
2. 图里 `db0..db15` 全列出来、各带 keys 数——「这台机器有几个库」只有 `CONFIG GET databases` 答得出，
   而 `CONFIG` 在禁表里。我们只列**目标声明的 ∪ `INFO keyspace` 当场报的**（要连空库一起列，就在目标的
   「可浏览的库」里声明，见记-25）；
3. 图里每一格的值都是**全读回来的**（Navicat 就是逐 key 读元数据，所以它在几十万 key 上很慢）。我们同样
   逐行真读，但**代价写在按钮上、由人点、分批**——`—` 的意思是「**还没问过**」，不是「空的」；
4. 图里 key 名只显示最后一段（`3` / `6`），我们显示**完整 key**（`db2:user:1`）：树里已经给了前缀上下文，
   而完整的那串才是能直接拿去用的。

**这一轮踩到的一个坑**（不是产品 bug，但值一笔）：`/rows` 是新路由，而**宿主是从入库产物 `lib/` 起的**
——改完 `src/` 忘了 `pnpm build`，第一次跑 ㊳ 时 `/key` 也不返回 `preview`，表里「值」那一列全是 `—`
（看着像客户端没填，其实是宿主还是旧的那份）。「`lib/` 是入库产物、改源码必须重建」这条规矩又一次现身。

**刻意没做的**：列排序 / 筛选 / 就地编辑（只读是设计，不是没做）；跨 key 搜索（`MATCH` 之外没有发现
逻辑）；把整库都读一遍（那正是 Navicat 慢的原因——这张表只读**你点的那一页**）。

### 记-28. 数据浏览器的**交互第五版**（2026-10-05，维护者贴了截图：「重构一下 ui 交互和美化一下」）

**由来**：第四版把表做出来了，但维护者贴来的截图里还剩四处毛病：满屏黑破折号把「还没读」喊得比数据还响
（最重的一列是类型——它继承正文色）；两条灰提示（怎么读 + 代价）在「还有未读」期间一直叠着；readHint
左侧那道 3px 品牌色竖轨紧贴文字，被读成一个两行高的大括号；每个非当前库行都挂「点一下切过去」胶囊，
「本页 N 个 key」还在 meta 行与表格栏头各印一遍。

| 落点 | 内容 | 门槛 |
|---|---|---|
| `client.js`（CSS） | 第五版覆盖层（照旧**只加规则不改前几版**）：`×`（`.dd_searchClear`）与 searchInput 右侧让位、readHint 改**虚线便签**（去掉竖轨）、`—` 占位降档（`.dd_cellDash`：三级灰 + 半透明） | `client-lint`：主题变量 **210 处**全部存在于宿主快照 |
| `client.js`（交互） | ① 搜索框**一键清掉**：`matchPattern` 抽成 `patternFrom(raw)`、`scanWith` 加显式 `patternText` 覆盖参数——清掉的重扫**不许读 state**（`setMatch('')` 之后同一闭包里 `match` 还是旧值，会把旧模式再发一遍）；② readHint 显隐从「还有未读」改成「**本页一行都没读过**」，读过任意一行就收；③ meta 行删「本页 N 个 key」（与栏头重复，栏头贴着表才是数字的位置）；④ 库行砍「点一下切过去」胶囊（行可点、悬停提示里有），当前行保留「当前浏览」、每行保留来源 | `check-i18n`：**165 条键** zh/en 一致（删 `meta.keyspaceScanned` / `meta.keyspaceDbSwitch`，增 `btn.keyspaceClear`） |
| `scripts/verify-devdata-card.mjs` | **不动**——㉛ 按行文断言的四个词（`当前浏览` / `目标声明` / `服务器上报` / `0 个 key`）一个没少；㊳ 的按钮序契约（`.dd_searchBar button` 第一个 = 搜索按钮）就是「`×` 必须是 `<span>` 不是 `<button>`」的由来 | 真机 **39 PASS / 0 FAIL**（另外用一次性夹具截了「还没读」初始态与「点 × 重扫后 meta 无 `MATCH`」两张功能截图复核） |

**刻意没做的**：表格键盘上下键导航、列排序——交互面这轮只收「重复 / 喊得过分」的债，不添新面。

### 记-23. 卡片里的**看数据**（2026-10-04，P14 第一版 / 根 ROADMAP 第 17 项）

**由来**：同一天的同一个问题（「查看数据库数据的 UI 在哪里」）。P14 是「面板（GUI）」，第一版只做
**只读数据浏览面**：选目标 → 写命令原文（或点预设）→ 看结果。**这一条的全部要点是一句话**——
面板不是特权路径：它不许有一条自己的判据，否则「同一件事在 GUI 里被绕开」就只是时间问题
（根 ROADMAP 第 10 项那类老问题）。

| 落点 | 内容 | 门槛 |
|---|---|---|
| `src/plugin.ts` | `POST /api/dsh-devdata/query`：同一道回环围栏 → 三个入参校验（`BAD_TARGET` / `BAD_COMMAND` / `BAD_CWD`，与判据层的拒绝**分开**）→ 交给 `invokeRedisCommand`（与 agent 的 `devdata_redis_command` **同一个函数**）；拒绝原样带回 `code` + 正文 + `hint`（恢复路径）；执行器按 id 每轮从 `live` 现取连接 | `test/config-route.test.ts` 新增 **6 例**：403/405/400；三个入参的码；`UNKNOWN_TARGET` / `ENGINE_NOT_SERVED`；★ 与工具面**同一档拒绝码**（同一个 `SET`，面板的 `code` 必须等于 `host.callError('devdata_redis_command', …)` 里那个码）；★ 作用域按调用方给的 `cwd` 判（`/tmp` → `OUT_OF_SCOPE`）；被拒进审计（`['set', false]`） |
| `client.js` | 卡片里一区「看数据」：目标下拉（**只列服务端快照里的 redis 目标**——草稿行在宿主侧不存在，列出来只会得到 `UNKNOWN_TARGET`）+ 作用域基准（留空用上面那个项目根）+ 命令原文 + 四个预设（`PING` / `DBSIZE` / `INFO memory` / `SCAN …`）+ 结果块。**拒绝也当结果显示**：码、正文、恢复路径三条都摊出来（缩成一句「失败」就没法判断该开闸门、改作用域还是改命令） | `check-i18n`：**101 条键** zh/en 一致、0 条残留中文字面量；`client-lint` 检查 ③ **79 处**主题变量全存在 |

**真机证据（本轮实跑，`pnpm --filter @hyzyn/dsh-devdata run card-smoke`）**：

| 断言 | 做法 | 结果 |
|---|---|---|
| ㉙a | 起一个**只答 `PING` 的极简假 Redis**（本地 TCP，端口现取），把卡片里已有的 `redis-two` 经 `/config` **改指**过去（刻意不新增目标：卡片不会因为别处改了配置就重取快照） | 200，目标落到 `127.0.0.1:<port>`——顺带证明了「宿主按 id 现取连接，改完立刻生效」 |
| ㉙ | 真 Chrome：选 `redis-two`、作用域填 `/Users/me/coding`、命令 `PING`、点「跑一次」 | 结果块 `data-kind="ok"`，正文 `PONG`——**浏览器 → 宿主路由 → 判据链 → 执行器 → TCP → 界面**整条路都通 |
| ㉚ | 同一目标上发 `SET panel-probe 1` | 界面摊出 `CAPABILITY_NOT_DECLARED` + 正文 + 恢复路径；审计里落下 `{action:"set", allowed:false, code:"CAPABILITY_NOT_DECLARED"}`——**与 agent 那条工具同一本账** |
| 汇总 | 本包卡片脚本 | **30 PASS / 0 FAIL**（㉗㉘㉙㉙a㉚ 五条新断言全绿）；真实 `~/.dsh/cordis.patch.yml`（1086 字节）逐字节未变 |

**没做的（这一版的边界，写清才敢叫「第一版」）**：

1. **只做命令原文，不做表格式浏览**：没有「列 key / 翻页 / 看 value 的类型着色」，也没有 key 浏览器。
   今天的结果就是 agent 看到的那份文本（同一个 `renderResult`）——口径统一优先于好看；
2. **只有 Redis**：目标下拉只列 redis（今天只有它有执行通路），SQL / RocketMQ 的目标连选都选不到；
3. **不能写**：面板不接受 `confirmed`，写命令在没闸门 / 没授权时一律被拒。要开写入口仍然是
   **启动环境 + 重启宿主**（本包没有就地提权，见 `index.ts` 的「刻意没有的东西」）；
4. **Jenkins 那一格仍空着**（P13 第一版的范围），容器 / 页面两格也还只是清单形状，不是活状态。



