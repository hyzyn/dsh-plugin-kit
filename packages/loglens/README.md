# @hyzyn/dsh-loglens

把**异构日志后端归一化成一个查询面**：Loki / Elasticsearch / OpenSearch / Docker 各走一层薄适配器，
对外只有一套「归一化行模型 + 诚实的计数与截断信号 + 交给 Agent 的工具」。

> **状态：设置面、查询地基（契约 / 归一化 / 游标）、Loki 与 ES / OpenSearch 适配器、出站围栏与 agent 工具都已就位
> （2026-10-11 ~ 10-12）；浏览器侧的结果视图、时间分布、**按字段分组榜**与**点桶下钻**也已就位
> （榜与下钻是 2026-10-13 补的），并在**真宿主 + 真 ES** 上点过一遍（2026-10-13：含下钻那一枪的请求体、
> 芯片、再点一次取消；逐条结论见 [ROADMAP.md](./ROADMAP.md) 的「真机验收」）。**
> **Loki 侧已完成真机验收**（真 Loki 3.7.8，隔离环境）：分页翻成 `cursor`，真机抓到并修掉两个缺陷
> （`loglens D02` / `D03`，逐条见 [DEFECTS.md](./DEFECTS.md)）；真机对账 12/12 组不丢不重。
> ES / OpenSearch 侧已在真集群上跑过若干轮只读复核。逐条结论都在 [ROADMAP.md](./ROADMAP.md)，**不在这里复述**。
> 设计与契约的唯一归宿是 [docs/design.md](./docs/design.md)；分期与待办见 [ROADMAP.md](./ROADMAP.md)。

## 现在能做什么

- 在 **设置 → 插件配置 → 日志查询** 卡片里增删改「日志来源」（类型 / 名称 / 地址 / ES 的**索引表达式**）与插件开关。
- 让 agent 用这几个工具查（配好来源之后，**名单以 [src/tools.ts](./src/tools.ts) 的注册处为准**）：
  `loglens_sources` 列来源（含**解析后的索引表达式**与探测条数）、
  `loglens_search` 查（支持 `filters` 结构化过滤与 `level` 及以上筛选）、`loglens_fields` 看有哪些字段、
  `loglens_facets` 按字段分组 / 按时间分桶（「哪个服务在报错」）、`loglens_context` 取某一行前后的上下文。
  可查后端：**Loki**、**Elasticsearch**、**OpenSearch**（Docker 走现成的 `docker_logs` / `docker_logs_grep`）。
  它们**全部**归 **read** 档（分类表见 [docs/permission-tier-plan.md](../../docs/permission-tier-plan.md) §2.1）。
- **在同一张卡片里直接查**：来源 / 查询串 / 时间窗（15m · 1h · 6h · 24h）/ 条数 → 结果列表（时间到毫秒 ·
  级别 · 正文）+ 诚实的计数与截断提示；有游标时给「下一页」（按 id 去重）。
- **两种聚合都在卡片里画**（都由宿主随 `/query` 响应下发的能力自述决定画不画，面板不按类型猜）：
  **时间分布**（按时间分桶的柱状图）与**按字段分组**（terms 榜——「哪个服务在报错」的那个答案）。
  榜要先填一个分组字段：手填，或**点开那一格**看当前来源的字段名候选（点开即拉，不传 `limit`，用宿主的默认值；
  同一个来源不重复拉，浮层页脚有「刷新」）。
  候选是**卡片自己画的浮层**（按宿主菜单的配方取值：圆角、发丝描边投影、行高、hover 底），
  不是浏览器那个原生 `datalist`——输入框里的字按子串过滤候选，方向键挪当前行、回车取它、Esc 收起、点一行即填；
  两个箭头（卡头折叠 / 字段框）都是**官方那颗描边 chevron**。
- **点榜上的一条就是按它下钻**：加一条结构化筛选（宿主契约里的 `filters`）再查一次，行、时间分布与榜
  **一起收窄到同一个子集**；再点一次取消，筛选也能在那一行芯片上用 `×` 一条条去掉。空值那一桶不给点
  （筛选表达不了「字段缺失」，见下「已知限制」）。
- **行上能看出「谁写的」**：filebeat 那类嵌套字段（`container.name` / `host.name` / `log.file.path`）摊成
  点分标签并排在前面；级别归一化成 trace→fatal 六档，文档里没有时从正文推断（此时 `levelInferred: true`，
  `loglens_search` 的 `level` 参数是**及以上**语义）。
- 面板与 agent 工具走**同一个执行层**（[src/execute.ts](./src/execute.ts)）：同一份归一化、同一份截断信号——
  不会出现「面板说的和工具说的不一样」。
- **Docker 目标**在卡片里换成「容器日志」区（拉容器 → 选容器 / 行数 → 看日志），走 Docker 面板插件自己的
  路由（相对路径）；这条路没有 `until`、`tail` 有上限、没有 grep，界面上写着这句，要精确检索请用 agent 侧的
  `docker_logs_grep`。

## HTTP 面（回环）

配置存在当前 profile 的 plugin entry 上（`settings.update('loglens', …)` 的 volatile 路径）。

| 动作 | 请求 | 说明 |
|---|---|---|
| 读配置 | `GET /api/dsh-loglens/config` | 返回 `{ ok, config: { enabled, targets } }` |
| 开关 | `POST {"action":"enabled","enabled":false}` | **免同源证明**（禁用后设置卡片是唯一的恢复入口） |
| 新增来源 | `POST {"action":"targets.add","target":{"kind":"loki","label":"本地 Loki","url":"http://127.0.0.1:3100"}}` | `kind` 取 `loki` / `elasticsearch` / `opensearch` / `docker` |
| 改来源 | `POST {"action":"targets.update","id":"<id>","patch":{"url":"…"}}` | id 不可改（它是浏览器侧唯一的引用方式） |
| 删来源 | `POST {"action":"targets.remove","id":"<id>"}` | |
| 查一次 | `POST /api/dsh-loglens/query` `{"target":"<id>","q":"…","from":…,"to":…,"limit":…}` | 面板用；返回行 + 计数 + 截断信号，**形状与 `loglens_search` 一致**（同一个执行层）。可带 `filters`（`{"字段":"值"}`）——面板点榜上下钻时就是这么带的，`/facets` 也会带上同一份 |
| 列字段 | `POST /api/dsh-loglens/fields` `{"target":"<id>","limit":80}` | 分组字段那一格点开时自动拉（面板**不传 `limit`**，用宿主的默认值）；被截断时返回 `total` / `truncated`，界面照抄那句警告 |
| 聚合 | `POST /api/dsh-loglens/facets` `{"target":"<id>","by":"container.name","interval":"5m"}` | 按字段分组 / 按时间分桶（目前只有 ES / OpenSearch 有；面板用 `interval` 画时间分布、用 `by` 画分组榜，工具面是 `loglens_facets`） |

围栏（[docs/design.md §4](./docs/design.md)）：整条路由走**加固档** `isLoopbackRequestStrict`；
`/config` 按**动作**豁免——只有 `enabled` 免同源证明，targets 的增 / 删 / 改要 `hasSameOriginProof`
（跨站页面能从配置侧加一个指向内网的来源，再用读面打它）。**`/query` / `/fields` / `/facets` 也都要同源证明**：
它们只读，却会**替请求方打到已配置的内网目标**并把结果带回来。插件禁用时四条路由里只留 `/config`。
地址只收 http / https 的绝对地址；回环 / 私网 / 公网都是允许面，**链路本地 / 云元数据地址拒**。

```bash
# 读
curl -s http://127.0.0.1:3080/api/dsh-loglens/config
# 加一个本地 Loki：命令行没有浏览器的同源证明，自己带 Origin 头
curl -s -X POST http://127.0.0.1:3080/api/dsh-loglens/config -H 'content-type: application/json' -H 'origin: http://127.0.0.1:3080' -d '{"action":"targets.add","target":{"kind":"loki","label":"本地 Loki","url":"http://127.0.0.1:3100"}}'
```

## 来源地址怎么写

| 类型 | 地址 | 说明 |
|---|---|---|
| `loki` | `http://127.0.0.1:3100` | 可以带网关前缀（如 `https://gw.example/loki`）；查询走 `/loki/api/v1/query_range` |
| `elasticsearch` / `opensearch` | `http://user:pass@127.0.0.1:9200/logs-*` | **索引表达式**：优先用那一行第 3 格下面填的「索引」；没填就用地址路径（兼容旧配置）；两者都没有则是 `*,-.*`（全部索引**但排除 `.kibana_1` / `.infini_*` 这类点号系统索引）。`loglens_sources` 会**回显解析结果**，probe 还会报「最近 15 分钟 N 条」；凭据换成 Basic 头、不进 URL；分页走 PIT + `search_after`；**ES 7.10 / 7.11 也已适配**（PIT 键名与 `_shard_doc` 的差异见 [ROADMAP](./ROADMAP.md)） |
| 公网地址 | 同上，直接填 | **连接面 = 你配置的来源**：回环 / 私网 / 公网一律放行（托管日志服务、内网用公网段都算正常用法）；被无条件拒绝的只有链路本地 / 云元数据那一档 |
| `docker` | 第三格填 **Docker 面板里的目标名**（如 `local`），**不是** URL | 采集来源（设计里的「选项 0」）：agent 侧用现成的 `docker_logs` / `docker_logs_grep`；面板侧走 Docker 插件自己的 `/api/dsh-docker/logs`（相对路径），弱面：无 `until`、`tail` 有上限、无 grep |

## 解剖

| 文件 | 说明 |
|---|---|
| `package.json` | `dsh.bundle.patch` 指向 `cordis.patch.yml`；`main` / `exports["."]` 指向 `lib/index.js` |
| `cordis.patch.yml` | bundle 补丁：`insert: { id: loglens, name: '@hyzyn/dsh-loglens' }` |
| `src/index.ts` | 宿主半体：`/config` / `/query` / `/fields` / `/facets` 四条路由 + 设置持久化 |
| `src/config.ts` | 来源清单的**纯**判据（id 生成 / 地址校验 / 宽松读盘 / 增删改），不碰 cordis 与网络 |
| `src/net.ts` | **出站围栏**：解析后的 IP 判定（链路本地 / 云元数据拒，回环 / 私网 / 公网放行）+ 不跟随重定向 + 体积与超时上限；两个适配器的所有出站都过它 |
| `src/line.ts` | 行的**可观性**：嵌套字段摊成点分标签（优先键先占名额）+ 级别归一化与正文推断（标 `levelInferred`） |
| `src/execute.ts` | 找来源 / 归一化 / 拼返回形状：**agent 工具与面板路由共用**的那一层 |
| `src/backends/registry.ts` | kind → 适配器（Loki / ES / OS；Docker 按设计不进这里） |
| `src/backends/types.ts` | 后端契约的**形状**（`LogBackend` / `BackendCaps` / `LogCounts` / `Truncation`…），没有实现 |
| `src/backends/loki.ts` | Loki 适配器：`query_range` / `labels` / `ready`，摊平、合并顺序与计数（真机验收待跑） |
| `src/backends/elastic.ts` | ES / OpenSearch 适配器（`flavor` 分流）：`_search` / PIT 分页 / `_field_caps` / health |
| `src/tools.ts` | agent 工具（`loglens_sources` / `search` / `fields` / `facets` / `context`）+ 档位分类表 |
| `src/query.ts` | 归一化与夹取：时间戳单位、时间窗上限、limit 夹取、计数与截断归并 |
| `src/cursor.ts` | 两份游标共用版本号常量：Loki 那份（同 ts 多行不丢行）与 ES 那份（`pitId` + `searchAfter`）；拿错适配器的游标在 decode 时被拒，解不开就报错、不当作没有游标 |
| `client-src/index.js` → `client.js` | 构建型客户端半体：设置卡片，i18n 目录内联在源码里 |
| `client-src/pure.js` | 客户端的纯逻辑（草稿合法性 / 提交载荷 / 时间分布与分组榜的铺图与载荷），进 vitest |
| `scripts/build-client.mjs` | 客户端打包：剥 import + 内联 pure.js；发现残留 import 直接 `exit(1)` |
| `scripts/client-smoke.mjs` | **无浏览器的渲染回归**：最小 DOM / React（会真重渲染）/ fetch 桩把卡片渲染出来，断言来源行四格齐、ES 行多一个索引表达式、以及「填索引 → 保存 → 请求体带 index」 |
| `test/` | vitest 用例（仓库根 `pnpm test` 收集 `packages/<pkg>/test/`） |

## 开发

```bash
pnpm --filter @hyzyn/dsh-loglens build       # tsc → lib/，并重建 client.js
pnpm --filter @hyzyn/dsh-loglens typecheck   # tsc + client-lint（客户端半体六条硬规矩）
pnpm --filter @hyzyn/dsh-loglens lint:client
pnpm --filter @hyzyn/dsh-loglens smoke        # 客户端半体的装载 + 渲染回归（无浏览器）
```

## 安装到 DSH

```bash
dsh plugin --profile <profile> add link:$(pwd)/packages/loglens
```

## 已知限制

- **Loki 侧的真机验收已完成**（2026-10-12，真 Loki 3.7.8）：分页能力已翻成 `cursor`，同 ts 多行的
  翻页在真机上 **12/12 组不丢不重**（多种 limit × forward/backward）。过程中抓到并修掉两个缺陷
  （`loglens D02`：Loki 的 `end` 是开区间；`loglens D03`：「同 ts 第几行」不是稳定坐标）——
  根因与修法见 [DEFECTS.md](./DEFECTS.md)，真机证据见 [ROADMAP.md](./ROADMAP.md) 的 P2 一节。
  ES / OpenSearch 侧已在真集群上跑过若干轮只读复核，逐条结论同样在 ROADMAP 里，**不在这里复述**。
- **翻页的取舍（明写）**：同一纳秒的行是**切不开的一组**——末组会让这一页**略超 `limit`**
  （宁可多给几行，也不给一个会丢行的游标）；末组大到补不齐时**不给游标**，只报「命中可能不完整」。
- **`tail`（跟随）还没做**：Loki 的 `capabilities().follow` 因此声明为 **`false`**（`stream()` 未实现）。
  这一位会经 `loglens_sources` 原样回给 agent，声明成 true 等于指一个不存在的入口——判据与
  `aggregations` ↔ `facets()` 是同一条。守卫：[test/capabilities.test.ts](./test/capabilities.test.ts)。
  **维护者 2026-10-12 决定「暂缓」**（不是被卡住）：没有消费者，且手上真在用的来源是 ES
  （跟随要走 `_search` + 轮询）——理由与「要做时怎么做」见 [ROADMAP.md](./ROADMAP.md)。
- **两种聚合（时间分布 / 按字段分组）**都画在结果列表**下方**，且**只对有聚合能力的来源画**（当前是
  ES / OpenSearch）——能力由宿主随 `/query` 响应下发，面板**不自己按类型猜**（那会是第二份会漂的判据）。
  两份图都**来自后端的聚合**，不是数这一页：那一页被 `limit` 截断过，数它只会得到一个假的分布 /
  假的排名。
  - **时间分布**：按窗口挑分桶档位；相邻桶之间的空档**补 0**——否则「那段时间一条都没有」看起来会像
    「一直在刷」。合计只在没被上限截断时才写。
  - **按字段分组（terms 榜）**：分组字段由用户给（面板**没有默认字段**——各家索引的字段名不一样，猜一个
    等于替用户伪造范围），点开那一格就是当前来源的字段名候选。**不写合计**：列出来的桶加起来不是命中总数，
    没列出来的由宿主的警告原话回报（「还有 N 条落在没列出来的桶里」）；桶计数是近似值时同样照抄那条警告。
    空值键（文档缺这个字段）显示成「（空值）」，而不是一条没有名字的横条。
  - **点桶下钻（结构化筛选）**：筛选按「字段 = 值」下发（宿主契约里的 `filters`），**一个字段只有一条**
    （走的是同一份 `Record`，两条并存会静默盖掉一条）；值**不做 trim**（键名里的空格是内容的一部分，
    裁掉就静默筛不到东西）。**空值那一桶不给点**：筛选表达不了「字段缺失」，给个点得动的入口只会筛出
    别的东西。**Loki 不支持结构化筛选**（宿主会原话报错）——用它时把条件写进 LogQL 查询串；
    界面上那一行也写着这句，因为「换了来源、筛选还留着」是可能的。
  - Loki 没有指标查询，所以它这里两种图都没有，界面上如实写着这一句。宿主**没给**能力自述时（旧版宿主）
    则**什么都不说**——「不知道」不等于「不支持」。
- 面板里的查询区是**受控重复**——设计 §5 三选一的**最终口径**（2026-10-12 拍板，选项 1）：
  日志视图建在本插件自己的卡片里，不与别的插件共享浏览器模块。理由（两份视图不是同一件事、
  选项 2 不是做不到而是不值得）见 [docs/design.md §5](./docs/design.md)。
- Docker 目标在面板里走的是**选项 0 的面板半格**（已接）：相对路径 fetch Docker 插件自己的
  `/api/dsh-docker/containers` 与 `/logs`，弱面（无 `until`、`tail` 有上限、无 grep）在界面上如实标注；
  agent 侧仍只做指路，不包一层。
- 一次只查一个来源（v1 不做跨后端 fan-out）。
- **出站围栏：连接面 = 你配置的来源**（设计 §4.1 / [src/net.ts](./src/net.ts)）：回环 / 私网 / 公网一律放行
  （托管日志服务、内网用非 RFC 1918 网段都算正常用法）；**链路本地与云元数据地址**（`169.254.169.254` 这类）
  **一律拒且无豁免**。**不跟随重定向**：来源回 3xx 时报错并回显 `Location`，改地址重来
  （一次 302 就能把请求带出白名单）。
- 一次请求的体积上限 8 MiB、超时默认 20s；时间窗与条数的上限由宿主夹取并在面板上如实提示。
- 围栏判的是**域名解析之后的 IP**，而解析与建连是两步：两步之间 DNS 翻脸（rebinding）仍有窗口。
  来源地址是操作者自己填的，这一层挡的是事故与过期的名字，不是持域名的对手。
- Docker 只作为**采集来源**（设计里的「选项 0」），不做适配器：agent 侧用现成的 `docker_logs` /
  `docker_logs_grep`，本插件不包一层。
