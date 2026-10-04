# @hyzyn/dsh-devdata

> **私有包，不发布。** `"private": true`。它是自用的开发/测试环境工具，不是插件市场的条目。
>
> **判定层不连任何东西；执行器今天只有 Redis**。内核（环境四态 / 操作矩阵 / 作用域门 / 裁决 /
> 计划护栏 / 只读自证）与 **Redis 通路 A 执行器**（本进程直连 + 自写 RESP，零依赖）都已落地，
> 后者已真机验证（[ROADMAP.md](./ROADMAP.md) 记-10 / 记-15，2026-10-02）；**SQL 与消息中间件的
> 引擎 / 通道未开始**——缺什么见本文末「还没做」。
>
> **三包中的第一个**（方案 §16）：本包 = 数据面 + 验活断言库；`devenv`（环境编排）与
> `devfront`（前端效果验证）**均已建**，状态各自见 `packages/devenv/README.md` /
> `packages/devfront/README.md`。

开发/测试环境的**数据面与编排工具**，面向 DSH 里的 coding agent（不是面向人的控制台）。
完整方案见 [docs/devdata-plan.md](../../docs/devdata-plan.md)。

## 现在有什么（P1–P3 部分）

### 内核（纯判定，不连任何东西）

| 模块 | 作用 |
|---|---|
| `env.ts` | **环境四态**：`dev` / `test-shared` / `test-isolated` / `unknown`。这是「本套件不用于生产」的**唯一技术手段** |
| `operations.ts` | **操作矩阵**：按 `引擎 × 动作` 声明可逆性、危险度、所需能力。**未登记的一律拒** |
| `scope.ts` | **作用域门**：目标只能从声明的目录访问，**空 = 处处拒绝** |
| `credential.ts` | **凭证保护强度**：环境变量 / 文件 / `op read` **不构成防护**，只有钥匙串一类算 |
| `adjudicate.ts` | **操作级裁决器**：把上面四件串成一次判定，返回「放行 / 拒绝（带恢复路径）」 |

### SQL 只读面（`sql.ts`）

**语句分类**（结构判据，不是关键字黑名单）：先扫出「每个字符是否处于代码态」的掩码
（行 / 块注释、单双引号、反引号、方括号标识符），再按第一个代码态字符取关键字判定。
`SELECT`/`WITH`/`SHOW`/`DESCRIBE`/`EXPLAIN`/`VALUES`/`TABLE` 放行，**其余一律拒**
（写操作 / 多语句 / 未闭合 / 不认识）。

外加**结果整形**（截断必须显式给出）与**上限收紧**（候选只能请求更小，策略值非法时收紧到 0）。

### 工具注册表（`tool.ts`）

工具面**从矩阵派生**，不是另写一份清单：

```
可见工具 = 注册表 ∩ 矩阵受管动作 ∩ (目标允许的档位) − 矩阵 never
```

于是「`FLUSHALL` / `EVAL` 这类没有入口」是**可执行断言**，不是纪律。
`invokeTool` 的顺序是 **先裁决、再执行**，且每次调用都写审计（**含被拒绝与不可见的尝试**）。

### 执行前的两道护栏

- **`plan-guard.ts`**：查询计划护栏——**在语句跑起来之前**拦掉全表扫描。判据按**引擎语义分派**
  （PostgreSQL 的 `Index Scan` 不按名字判、交给行数阈值；SQL Server 的无 seek `Index Scan` 与
  MySQL 无 `Using index` 的 `type: index` 按名字判）。**拿不到计划一律拒**、**不认识的计划也拒**。
- **`readonly-probe.ts`**：只读自证**判定**——SQL 档唯一的硬护栏。关键在于**它自己不去试写**
  （试写成功就是真写了），只读权限元数据；**缺证即拒**，**超级用户先于账号证据判**。

### Redis 命令解析（`redis-command.ts`）

把「某一族动作」（矩阵层）落到**具体哪条命令**上：命令名归一 + 归类（read / read-dangerous /
write-scoped）+ 取目标 key + 夹紧 `SCAN` 的 `COUNT`。

**这一档没有第二层网**：Redis 没有只读账号，一条连接读写同权，「受限」只能靠白名单。
所以**未登记的命令一律拒**；`FLUSHALL` / `EVAL` / `CONFIG` / `MULTI` 一类**没有入口**；
写命令**解析不出目标 key 就拒**（审计里写不出「改了什么」的写操作不该放行）。
`INFO ALL` 与 `INFO memory` 按参数分档——同一个命令判得不同，在 Redis 侧是常态。

### Redis 命令原文入口（`tool.ts` 的 `invokeRedisCommand`）

让 agent 直接发 `GET user:1` / `SCAN 0 MATCH a:* COUNT 50` / `SET k v`：
解析 → 动作名 → 与结构化入口**共用同一段判据链**（可见性 / 裁决 / 护栏 / 审计）。

**为什么必须有它**：结构化参数把「是哪条命令」交给了调用方，而解析层才是那道白名单——
只留结构化入口，等于让 agent 从白名单旁边绕进执行器。

**一处不能省的细节**：矩阵按**动作名**分档，解析层按**参数**分档，两者会在 `INFO ALL` 上差一档
（它映射到普通读的 `info`，而它一次吐出全部节）。所以档位**只能更严**（`stricterClass`），
执行器拿到的也必须是**命令原文**而不是重新拼装的命令（否则「审过的」与「跑了的」是两条字符串）。

### 验活断言库（`verify.ts` + `verify-eval.ts` + `verify-run.ts`）

把「核对发布后的业务数据」**断言化**，断言写在**项目仓库**里（`verify/<project>.yaml`），DSH 侧只读：

```yaml
version: 1
project: cdqas
assertions:
  - id: order-count
    appliesTo: backend
    target: t-mysql
    statement: SELECT COUNT(*) FROM orders
    expect: { gte: 1 }
    severity: fail
```

四条判据：

- **断言只读**：语句在**加载时**过判据（SQL 走 `sql.ts`，Redis 复用解析层的归类），
  写语句 / 多语句 / 未闭合一律拒——本层**不新增任何写能力**，它只是只读档的消费者；
  **按目标引擎判**：目标不在这份配置里 → 只查形状（一份清单的生命周期跨机器）；
- **缺省即无**：没有 `verify/<project>.yaml` = 这个项目**没有断言**，不回落默认断言；
  而「清单写错了」是 `config-error`（点名到字段）——两者是**两种结果**，不是一件事；
- **三态而非两态**：`pass` / `fail` / **`unknown`**（验不了：结果被截断、列不存在、类型不可比较）。
  把验不了的当 `pass` 就是**用没验过冒充验过**；
- **结构化差异**：逐算子的 got / expected 并排，agent 一轮就能定位（它的失败模式是循环重试）。

**跑起来是 agent 工具**：`devdata_verify`（`verify-run.ts` 是那一跳的装配层，见下一节）。
它逐条派发到断言自己声明的 `target`，并把 **「没验成」与「验出问题」分列**——没配目标 / 引擎没接通 /
被作用域或闸门拒都记 `unknown`，不会冒充成「数据不对」。今天只有 **Redis** 的断言真能跑。

**Redis 的清单怎么写**（回复 → 表格的口径，2026-10-04 定）：

```yaml
  - id: redis-alive
    appliesTo: backend
    target: redis-248
    statement: PING
    expect: { eq: PONG }
    severity: fail
```

Redis 回复整形成**单列表格**：**顶层元素一行、列名 `value`**（`GET k` → 1 行；`LRANGE` 这类列表
命令 → 每项一行，`rowCount` 就是项数）；**`nil`（键不存在）= 空结果** → 值类算子记「验不了」。
所以「有没有」请用 `EXISTS`（`eq: 1`）或 `rowCount: 0` 表达，别拿 `eq` 去比一个不存在的值。

### 环境就绪判据 → 已迁往 `@hyzyn/dsh-devenv`（2026-10-02）

就绪判据（原 `env-ready.ts` + `env-ready-eval.ts` + `test/env-ready.test.ts`，约 990 行）**已整体
迁出**，本包不再导出它们（也不留转发——两个包同时导出同一份 API 会让「谁是归宿」重新变模糊）。

判据只有一条：**清单与求值跟着「它判的对象」走**。就绪判的是容器 / 进程 / 端口 / 探针的
**状态**，不是数据的内容，所以它归环境面（`devenv`）；数据服务的**内容**留在本包。
正文、清单示例与三条纪律见 [devenv 的 README](../devenv/README.md)，边界与前置清单见
[docs/devdata-plan.md § 16.1](../../docs/devdata-plan.md)。

### 宿主半体（`plugin.ts`）

把上面几层接成 agent 能用的工具。挂上之后注册**五个**工具（名字带 `devdata_` 域前缀：工具名是
模型选工具时唯一看到的标识，仓库守卫要求 `<域>_<动作>`）：

| 工具 | 作用 |
|---|---|
| `devdata_list_targets` | 当前工作目录能用哪些目标（作用域按目录收敛；空 = 处处拒绝） |
| `devdata_capabilities` | 这个目标哪些档可用、哪些被闸门挡住、**怎么授权** |
| `devdata_doctor` | 逐层报告只读 / 闸门在哪几层真的在位（**验不到的一律 `!`，不报 `✓`**） |
| `devdata_redis_command` | Redis 命令原文入口（今天唯一有执行器的引擎） |
| `devdata_verify` | 按项目清单 `verify/<项目>.yaml` 跑一批只读断言：逐条派发到断言自己声明的 `target`，`pass` / `fail` / **没验成** 分列（「没验成」不许冒充「验出问题」） |

四条纪律（都有用例）：

1. **没启用 / 没配目标 / 这个引擎没有执行器 → 那个工具不注册**（未注册的 agent 根本看不到，
   不会去试、也不会撞墙）。今天只有 Redis 有执行器，所以 SQL / MQ 的目标只给前三个。
   清单入口（`devdata_verify`）的判据略有不同：**只要存在 redis 目标就注册**——它按清单里每条断言
   的 `target` 逐条派发，清单里跑不了的引擎在**运行时逐条**记「没验成」（整条入口消失会让同一份
   清单里能跑的那些也没法验）。
2. **写类操作要求持久审计**：没配 `auditFile` 时写类报 `AUDIT_NOT_DURABLE`（§5 把审计写成这一档的
   前提，那它就不能只在文档里成立）。只读不受影响。
3. **不可逆操作先拒、要逐次二次确认**：第一次报 `CONFIRMATION_REQUIRED`，把影响说清后带
   `confirmed: true` 重试；**拒的那次执行器一次都没被调用**（用例用假 Redis 服务证明）。
4. **拒绝一律抛错**，格式 `[CODE] 正文` + 下一行「恢复路径」——agent 的失败模式是循环重试，
   一句「未授权」不产生新信息。

### 面板（客户端半体，`client.js`）

2026-10-03 建（`devenv` / `devfront` 同一批）。它就是「配置面在 GUI 里不存在」那个缺口的另一半：
宿主那套「按 `Config` schema 生成表单」在这一版**没有渲染方**（`devfront` 真机三面扫过），所以每张
卡片都得自己写（tty / docker 同款）——在那之前本包只能在 profile 补丁层手改配置，而
`capabilities` / `doctor` 报出来的「配置问题」用户没有 UI 可改。

- **能改（标量）**：`enabled` / `announceToAgent` / `auditFile` / `timeoutMs` / 计划护栏
  `plan.maxRows` · `plan.maxCost`（扁平键；数值留空 = **不改**这一层，而 `plan.maxRows: 0` 是
  「一行都不许」——两个语义刻意不混）；
- **能改（目标）**：`targets` —— 结构化表单（每行 id / 名字 / 引擎 / 环境档 / 作用域目录 /
  `maxScanCount` / 连接 `host`·`port`·`db` / 凭据引用），可增删改。**改目标要逐次确认**
  （那个复选框 → `confirmTargetEdit: true`），与 `env_down` 同一档：它决定「工具能在哪个目标、
  哪个引擎、哪个环境、哪个范围上动手」。引擎与环境档的下拉框**选项由宿主快照给**
  （`config.engines` / `config.envs`）——枚举的真相在 `operations.ts` / `env.ts`，卡片再抄一份必然漂；
- **只读（两档能力）**：`writeCapability` / `dangerousReadCapability` 各显示「声明的变量名 +
  **当前是否已授权** + 怎么授权」。**它们是只读的，这不是省事而是不变量**：这两档的授权判据是
  「宿主**启动继承层**里那个变量的值 ∈ `1`/`true`/`yes`/`on`」（`kit` 的 `TRUTHY`；`project-env` /
  `user-env` 两层刻意排除），而变量名来自配置——**真正的口子不是「随手改成 `HOME`」**（它的值不在
  白名单里，指向它**不会**授权），而是把它指向**另一个已经在启动环境里、值恰好为真**的变量
  （例如 `CI=true`），那样页内脚本一条 `POST` 就等于**免重启提权**，直接违反根 `ROADMAP.md` §5.1 的
  「HTTP 只能关、不能开」。（2026-10-03 更正：这处此前用 `HOME` 当例子，是错的。）服务端对这两个字段在写入路径上**一律 400 `CAPABILITY_READONLY`**
  （含藏在 `targets[i]` 里的那种写法），`howTo` 刻意不提「就地提权」按钮——本包没有那条通道
  （`capabilityHowTo` 不传 `inPlace`），提一个不存在的入口正是本仓修过的缺陷类型；
- **数据面**：宿主那条 `GET/POST /api/dsh-devdata/config`。POST 走**官方持久化通道**
  `settings.update(entryId, patch)`（写 volatile 字段 → loader 广播 → 本插件 `applySection`
  热应用，不重启）；宿主没有 settings 服务时退化成「只在本进程生效」，响应里如实带
  `persisted: false`，卡片照实提示「**没有落盘**」；
- **围栏**：只放回环 + 强来源判据（`isLoopbackRequestStrict`，与 tty / docker / devenv / devfront
  的 `gateRoute` 同一套）。`POST /config` **刻意不额外要求同源证明**——卡片是插件被停用后唯一的
  恢复入口；`/config` 也不因插件停用而失效（停用时工具一个都不注册，卡片照样能把它开回来）；
- **校验在写之前**（`normalizeCardPatch` / `normalizeTargets`，纯函数、有用例）：不认识的字段
  **报错而不是静默丢弃**、目标逐行逐字段报错并**指到 `targets[i].字段`**（重名 id 拒、认不出的
  引擎整条拒、连接要么两个字段都给要么都不给）、类型与范围先判——非法值不许先落地再抛
  （docker 踩过：非法值写进 settings 之后整段配置在下次启动静默退回默认）。校验过的行还会经
  `normalizeConfig` **复核**「一行不少地被收下、且一条 problem 都不报」：两套规则分叉时保存就红；
- **改目标不许抹掉能力声明**：卡片提交的目标行里没有能力字段（那是 400 管的），所以服务端按 id
  把**原有的**声明原样带回来（`preserveCapabilities`）——不这么做，改一个 `scopeDirs` 的错别字
  就会把闸门静默抹掉。新行没有声明（= 未接入闸门，**不凭空授权**），改 `id` 等于新增一个目标；
- **每次变更进审计**：成功分 `config.targets` / `config.scalars` 两条，被拒的带码（`config.save`）；
  审计写不进去就让它抛（fail-closed——不许「改完了、没记下」）。卡片变更**没有引擎**，审计行里
  也就不编一个引擎；
- **界面文案走 i18n 目录**（`docs/i18n.md`）：`client.js` 是**源**（本包没有构建步骤），目录内联
  在文件里，`check-i18n` 与 `client-lint`（`typecheck` 里带着跑）都管着它。

**真机验收**（`pnpm --filter @hyzyn/dsh-devdata run card-smoke` → `scripts/verify-devdata-card.mjs`）：
起一个**隔离 home 里的一次性 profile**、装本包、起真宿主、开真 Chrome，跑一遍断言
（**条数以脚本末尾那行汇总为准**——它会随功能增长，不在这里写死）：数据面（快照字段 / 保存标量
**且目标不被抹掉** / 写 `plan.maxRows` **保住 `plan.maxCost`**（真 settings 的深合并，假宿主的浅合并
验不到这条）/ 非法值先判后写 / 405 / 坏 JSON）+ **两档能力只读那条 400**（顶层与 `targets[i]` 各一条）
+ 改目标逐次确认（能力声明按 id 跟回来）+ 审计落盘（两个码都在）+ bundle 真的被宿主按批量 URL
加载 + 插件页里那一行 + **详情页卡片渲染**（控件数、目标编辑器、能力只读说明）+ **在卡片上真的点
一次「保存」**（客户端拼的 payload 过得了服务端校验）+ 真实 `~/.dsh` 逐字节未变的自证。
`--dump` 只打插件页结构（迭代 DOM 断言用），`--keep` 失败时留现场。

## 配置（profile 里的形状）

```yaml
- id: devdata
  config:
    enabled: true
    auditFile: ~/.dsh/devdata-audit.jsonl   # 写类操作的**前提**（一条 JSON 行 / 调用，含被拒的尝试）
    timeoutMs: 5000
    plan: { maxRows: 100000 }               # 计划护栏；**不填 = 不做这一层检查**
    targets:
      - id: redis-248
        label: 248 Redis（共享联调）
        engine: redis
        env: test-shared                     # 不标 = unknown = 不可写
        scopeDirs: [~/coding]                # 空 = 处处拒绝
        host: 192.0.2.248                  # 占位（RFC 5737）；真实内网地址不入库
        port: 6379
        maxScanCount: 200                    # SCAN 族的策略上限（候选只能请求更小）
        writeCapability: { env: DSH_DEVDATA_WRITE, label: 受限写 }
        dangerousReadCapability: { env: DSH_DEVDATA_DANGEROUS_READ, label: 危险读（KEYS/MONITOR） }
```

配置解析是**纯函数**（`plugin-config.ts`），坏输入的行为都有用例：认不出的引擎**整条丢掉**、
认不出的环境标签回落 `unknown` **并报一条 problem**、空的 `scopeDirs` **保持为空**（不替用户
填默认目录）、越界上限**夹回**默认值。

**一个容易踩的语义（2026-10-02 真机首次使用实测）**：工具的 `cwd` 参数**缺省取宿主进程的工作目录**，
不是你 agent 会话所在的项目目录。本机宿主是从 `~` 启动的，所以当 `scopeDirs` 收敛到某个项目目录时，
**不传 `cwd` 会被 `[OUT_OF_SCOPE]` 拒**（fail-closed 是对的，但第一次撞上会以为是闸门坏了）。
工具的拒绝文案会**点名它判的是哪个目录**与目标的允许目录，照着传一个允许目录下的路径即可。

**「没写」与「写了空」是两件事**（这一条是 2026-10-02 真机上踩出来的）：能力字段**整段不写** =
不接入闸门（静默）；**写了 `{}`** = 给了规格却没给变量名（**报一条配置问题**）。`db` 同理——不写就
不发 `SELECT`。细节与代价见 `ROADMAP.md` 记-14。

授权只认宿主侧通道（`kit` 的 `capabilityGranted`）：在**启动 dsh 的那个环境**里
`export DSH_DEVDATA_WRITE=1` 后重启宿主。写进 `.env` / `env.yml` 不算——那两个文件有 HTTP 写入路径。

## 三条不变量（用例钉住的）

1. **判定在操作上，不在连接上**。同一目标、同一凭证，读放行而写不放行。
2. **未标注环境不放行写**。缺省是 `unknown`，不是 `test`；环境判据**排在能力判据之前**。
3. **写类未接入能力闸门 = 不放行**。防止「每新增一条写路径都是一次静默的安全降级」。

## 用法

```ts
import { adjudicate, normalizeEnv, snapshotTarget } from '@hyzyn/dsh-devdata'

const decision = adjudicate({
  target: {
    id: 'test-redis',
    label: '测试 Redis',
    engine: 'redis',
    env: 'test-shared',
    scopeDirs: ['~/work/my-project'],
    writeCapability: { env: 'DSH_DEVDATA_WRITE', label: '受限写' },
  },
  action: 'set',
  cwd: process.cwd(),
})

if (decision.allowed) {
  // decision.requiresConfirm: 共享环境里的写要逐次二次确认
} else {
  // decision.code + decision.message + decision.hint（给 agent 的恢复路径）
}
```

## 刻意没有的东西

- **有客户端半体了（2026-10-03 起），但仍没有就地提权通道**：配置卡片见上面
  [面板（客户端半体）](#面板客户端半体clientjs)那一节。**卡片能改配置，但提权那条路仍然没有**——
  两档能力在写入路径上只读（400 `CAPABILITY_READONLY`），`bindCapabilitySources` 也不接
  `GrantStore`，所以能力文案只说「启动环境 + 重启宿主」（`adjudicate.ts` 里 `capabilityHowTo`
  刻意不传 `inPlace`——tty 的 `allowProxyCommand` 是同一处境，文案里提一个不存在的开关是本仓
  修过的缺陷类型）。
- **没有 SQL / 达梦 / RocketMQ 的执行器**：那几个引擎在本宿主上只给引擎无关的自证工具，数据入口
  一个都不注册。阻塞项是 C2（只读账号）与防火墙，不是代码。
- `lib/` **是入库产物**（本包现在有 `build` script）。2026-10-02 之前它刻意没有 `build`
  ——那时它只被仓内消费，`main` 指向 `src/index.ts`。接宿主之后这条不成立了：**profile 用纯 Node
  加载插件，`.ts` 加载不了**，所以必须有 `lib/`；产物闸门由 `.githooks/` 的 pre-commit 兜住
  （`pnpm -r build` 会重建，提交时一起进本次提交）。

### 关于 `dsh.bundle.patch`（曾经刻意没有，2026-10-02 起有）

本包**有** `cordis.patch.yml` 与 `dsh.bundle.patch`——否则 `dsh plugin add link:` 装不进 profile。
它**不会**被卷进 `@hyzyn/dsh-all`：`scripts/aggregate.mjs` 的 `isAggregatable` 跳过 `private`
（方案 §7 的 N1，2026-10-01 落地）。此前本包刻意不带补丁层，理由是「aggregate 不看 `private`」，
那条理由随 N1 一起失效——这类「理由消失了但结论还在」的注释必须一起改，否则下一个人会照着一条
不再成立的前提做决定。

## 在自己的 profile 里自证

把本包挂进某个 profile 之后，分三层验它。**前两层不需要会话**，第三层需要（工具只有 agent 能调）。

### ① 壳层 —— 不需要会话

配置真的进了组合结果吗（把 `test` 换成你的 profile 名）：

```sh
dsh --profile test --dump-config 2>/dev/null | grep -A20 "id: devdata"
```

包能被**纯 Node** 加载吗（宿主的加载方式是同一个）：

```sh
(cd ~/.dsh/profiles/test && node --input-type=module -e "const m = await import('@hyzyn/dsh-devdata'); console.log(m.name, typeof m.apply, typeof m.Config)")
```

用的是**子 shell**（外面那对括号）：`cd` 不会把当前目录留给下一条命令——否则下一条会在 profile 目录里跑。

链路与闸门（与 profile 无关，直连目标）——**必须在仓库根执行**：

```sh
pnpm --filter @hyzyn/dsh-devdata run verify
```

> 在别的目录跑 `pnpm --filter …` 会打印 `No projects matched the filters in "…"`，而**退出码仍是 0**
> ——静默空转、看着像成功。本包的一键脚本自己在仓根跑（`pnpm -r …`，不靠 `--filter`），不受这个影响；
> 但**你手打的那些**要留意这条。

### ② 挂载层 —— 看那个 profile 宿主自己的启动输出

重启该 profile 的宿主，输出里应当有这两行，且**没有**「配置问题」：

```
[dsh-devdata] mounted (enabled=true, targets=1, audit=jsonl, engines=redis)
[dsh-devdata] agent tools registered (devdata_list_targets, devdata_redis_command, devdata_doctor, devdata_capabilities, devdata_verify)
```

出现 `ValidationError: invalid config` 或 `1 entry did not activate` 就是被拒了，原因就在那几行里
（实测：配置过不了 schema 时插件**整体不挂载**，宿主照常启动——fail closed，且路径精确到字段）。

### ③ 会话层 —— 在那个 profile 的会话里让 agent 跑

`web` / `test` 都是 **web 应用**，没有「一次性提问」开关，所以这一层必须在会话里做。五条的期望值：

| 让 agent 跑 | 期望 |
|---|---|
| `devdata_list_targets` | 列出目标，并标注当前目录「在作用域内」 |
| `devdata_capabilities <目标>` | **没有**「配置问题」那一节；两闸门「已接入 … **当前未获授权**」+ 怎么授权 |
| `devdata_redis_command <目标> PING` | `PONG` |
| 先 `SET devdata:probe 1`，再 `EXISTS devdata:probe` | 前者 `[CAPABILITY_NOT_GRANTED]`，后者 **`0`** |
| 在项目目录里放一份 `verify/<项目>.yaml`（含一条 redis 断言）后 `devdata_verify` | 「共 N 条断言，真的跑了 X 条」+ 逐条 `✓/✗/?` + 汇总 `overall`；清单里 SQL 那类断言逐条 `?`「这个引擎的执行通路还没接通」——**不是** `✗` |

最后一条最值得看：它证明「被拒」不是嘴上说说。每个 profile 有自己的审计文件，被拒绝的尝试也在里面：

```sh
tail -3 ~/.dsh/devdata-audit-test.jsonl
```

### 可选：无头一次性自证（默认**没做**）

`headless` 是**另一个 profile**（`dsh headless "<任务>"` 答完一条任务就退出），它默认没挂本包。
想挂就两条（在**仓库根**执行第一条）：

```sh
dsh plugin --profile headless add link:$PWD/packages/devdata
```

然后把 web profile 里那段 `- id: devdata` 追加到 `~/.dsh/profiles/headless/cordis.patch.yml`，之后：

```sh
dsh --profile headless "用 devdata_redis_command 对 redis-248 执行 PING 与 DBSIZE，把原始输出贴出来"
```

**代价**：这会真的调一次模型（花 token）。价值在于**可脚本化**——不需要人开着 GUI 看一眼。

## 测试

**一条命令跑完全部验证**（产物 → 单测 → 真机链路 → 真宿主挂载）：

```sh
pnpm --filter @hyzyn/dsh-devdata run verify
```

（在**仓库根**执行。）它会**先重建产物**（第 ⑤ 步加载的是 `lib/`，不重建就可能验的是旧代码——今天踩过），并且在跑真机那步
**先探可达性**：目标连不上时报 `SKIP` 而**不是**红（要换目标：`DEVDATA_REDIS_HOST=… DEVDATA_REDIS_PORT=…`）。

> **代码块里只有真命令**：zsh 交互式**默认不把 `#` 当注释**（`interactive_comments` 关着），
> 粘带 `#` 的清单会得到一串 `zsh: command not found: #`。要粘带注释的内容，先执行
> `setopt interactive_comments`。解释一律写在代码块外面。
`test/verify-all-script-safety.test.ts` 钉住这三条（不碰真实 `~/.dsh` / 不把环境问题当代码问题 / 不吞失败），
每条都带反例。

单独跑某一层：

```sh
pnpm vitest run packages/devdata
DEVDATA_REDIS_248=1 pnpm vitest run packages/devdata/test/redis-real-machine.test.ts
node scripts/verify-devdata-host-mount.mjs
node scripts/verify-devdata-card.mjs
```

**达梦那条通路的第一段**（`ssh → docker exec dm8_test → 容器内命令`）也有一条门控用例——
它**不需要任何数据库账号**（C2 还没下来），验的是「进得去、引号没被吃掉、stdin 通、错误形状、`disql` 能起来」：

```sh
DEVDATA_DM_161=1 DEVDATA_SSH_PASSWORD=… pnpm vitest run packages/devdata/test/dm-path-real-machine.test.ts
```

凭据**只从环境变量取**（`DEVDATA_SSH_PASSWORD` / `DEVDATA_SSH_KEY_PATH`），用例自己绝不读凭据存储。
**门控变量是 `DEVDATA_DM_161`**：漏拼不会报错，只会**静默跳过 5 条**（屏幕上一行 `5 skipped`）——
跑完先确认输出里有 PASS/FAIL。也别把 `read -rs` 和后面的命令放进同一次粘贴（`read` 会把下一行当口令吃掉）。

`test/`（**条数以 `pnpm vitest run packages/devdata` 现算为准**——它每加一条用例就会漂，不在这里
写死；门控在真机上的那两档见上面）：`adjudicate.test.ts` 钉不变量与四条设计约束；`sql.test.ts` 钉**绕过面**
（多语句、注释藏写操作、字符串里的分号、未闭合）；`redis-command.test.ts` 钉命令白名单与
`SCAN` 两种参数布局；`redis-route.test.ts` 钉**档位只能更严**（`INFO ALL` 必须走危险读闸门，
不许被矩阵按动作名抹平）；`verify.test.ts` 钉清单的**缺省即无**与加载期校验；
`verify-eval.test.ts` 钉 `unknown` 档与**截断语义**（`gte` 与 `lte` 在截断下结论相反）；
`verify-run.test.ts` 钉**跑批的四种处置**（没配目标 / 引擎没接通 / 被拒一律 `unknown`，只有真跑了的
才进求值；两条反例证明「没验成」那几条不是恒绿的）；
`verify-capability.test.ts` 钉「断言库不新增任何写能力」；`tool.test.ts` 钉**可见面 ∩ never = ∅**
与「不可见的工具不进入执行路径」；`entries.test.ts` 钉**没有执行器就不注册**（只留引擎无关项）；
`plugin-config.test.ts` 钉配置解析的每一种坏输入都有确定行为；`audit.test.ts` 钉**写不进去就抛**
（fail-closed 而不是尽力而为）；`plugin.test.ts` 是**假宿主的端到端**（五个工具全跑一遍，含
清单驱动的四条处置、审计落成 JSON 行、写类缺审计被拒、不可复现的确认路径）；**`config-route.test.ts` 是配置卡片那条
数据面**（patch 校验先判后写 / 两档能力只读那条 400 / 目标逐次确认 / 能力声明按 id 跟回来 /
兜底路径的深合并 / 快照 / 围栏与失败审计）；**`verify-script-safety.test.ts`** 与
`verify-all-script-safety.test.ts` / `host-mount-script-safety.test.ts` 守仓根那三个真机脚本的
隔离与自证（**判前先去注释**，每条判据都带反例）；`fake-redis.ts` / `fake-host.ts` 是两个
共用夹具（**各只有一份**——两份复制会让「假服务怎么理解协议」出现两个版本，被测代码改了帧格式时
可能一起错着通过）。每条用例的注释写了「这条失败了意味着什么」——一个失败的断言若说不清后果，
迟早会被当成噪声改掉。

## 还没做（P3 余下与之后）

- **其余引擎的执行器**：Redis 已落地（通路 A 直连 + 自写 RESP）。真机两档都打 `248` 且全绿
  （**2026-10-04 复核**：内核那组 + 插件层那组，后者含清单跑批 `devdata_verify`），
  门控 `DEVDATA_REDIS_248=1` + `DEVDATA_REDIS_HOST`，默认跳过（CI 不连内网）。
  MySQL / PostgreSQL（`forwardOut`，目标在 `161`）、SQL Server（通路 A 直连 `247:1433`，驱动可选）、
  达梦 / RocketMQ（通路 B，目标侧 CLI）都还没写——**卡在 C2 与防火墙**（见文末）。
  内核只依赖 `ToolExecutor` 接口，所以每个引擎的实现是独立的、互不阻塞。
- **断言库的跑批**：清单加载 + 求值 + 差异 + **跑批装配层**（`verify-run.ts`）都已落地且可测，
  工具面入口 `devdata_verify` 也已接进宿主（2026-10-04）；**真能跑的只有 Redis**（`PING` / `GET` /
  `DBSIZE` 这类只读命令，回复按「顶层元素一行、单列 `value`」整形）。SQL / RocketMQ 的断言在
  运行时逐条记「没验成」，等各自的执行器落地（同上一项）之后自动带上——**不假装跑过**。
- **`doctor` 的引擎侧**：只读自证判定（`readonly-probe.ts`）已落地，`devdata_doctor` 也已接进宿主，
  但「连上去取事实」（`ReadOnlyFacts`）的读取层还没写——SQL 目标上那一层因此恒为 `!`（缺证即拒），
  这是**对的默认**，等执行器落地后才会变成 `✓`。
- **`devenv`（环境编排）**：**已建**（[packages/devenv](../devenv/README.md)，plan §16.1），边界已定
  ——**数据服务的「内容」归本包，容器 / 进程 / 端口 / 探针的「状态」归它**。本包不再持有就绪判据
  （原 `env-ready*` 已随建包迁走，不留转发）。它的待办与落点见
  [devenv/ROADMAP.md](../devenv/ROADMAP.md)。（`devfront` 同样已建，见 [packages/devfront](../devfront/README.md)。）
- **P0 调研项 C1–C6 仍未回答**（`161` 上有哪些客户端、是否有只读账号、能否起可丢弃副本…），
  网络前提也还没解完：**`248` 是内网、需先连 VPN**（**不是永久下线**，也不是「需跳板机」——
  2026-10-02 更正），**连上 VPN 即可达**（2026-10-03 本宿主直读 `248:6379` 成功）；`目标3` 才需
  连接簿的跳板机条目。SQL Server 的通路 B 卡在 C1 / C2，与网络是两回事。
