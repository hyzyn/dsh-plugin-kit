# @hyzyn/dsh-loglens 设计方案

> **状态：P1 契约与纯模块、P2 的 Loki 适配器（**含真机验收**，见 ROADMAP 的 P2 一节）、P4 的 ES / OpenSearch 适配器与出站围栏（src/net.ts）、P3 的 agent 工具（名单以 `src/tools.ts` 注册处为准，含当天后补的 `loglens_facets`）都已落地（2026-10-11 ~ 10-12）；浏览器侧结果视图已落地；真机验收 ES / OpenSearch 侧已跑过若干轮只读复核，Loki 侧已跑完并翻成 `cursor`。** 本文件是**包特有的深层设计**（归属见 [conventions § 知识归属表](../../../docs/conventions.md#知识归属表唯一归宿)
> 的「包特有的深层设计 / API」一行 → L1 `packages/<pkg>/docs/`）。
> 待办与执行计划见 [../ROADMAP.md](../ROADMAP.md)；包落地后按档位补齐 `README.md` / `DEFECTS.md`。

## 1. 目标与定位

把异构日志后端归一化成**一个查询前端 + N 个薄后端适配器**。核心资产是
「归一化行模型 + 诚实的计数与截断信号 + 交给 Agent」，不是「支持了几个后端」。

`@hyzyn/dsh-loglens`（id `loglens`，路由 `/api/dsh-loglens/…`，env `DSH_LOGLENS_*`，缺陷前缀 `D`）。

### 非目标

- ❌ **统一查询 DSL**：LogQL 与 ES `query_string` 不可互译；`queryLanguage` 只用于**标注方言**。
- ❌ **跨后端 fan-out**：v1 一次一个来源，传多个显式报错（口径照 [docker/src/index.ts](../../docker/src/index.ts) 的 `*` 文案）。
- ❌ **采集器配置生成**（promtail / Alloy / fluent-bit / vector）：另一产品面，无运行期反馈。
- ❌ **浏览器侧共享包**（除非维护者推翻 [i18n.md § 为什么不建共享模块](../../../docs/i18n.md#为什么不建共享模块三条硬约束都实测过)）。
- ❌ 写操作；❌ **链路本地 / 云元数据地址**（`169.254.0.0/16`，RFC 3927）。

## 2. 后端分层

| 名字 | 身份 | 集成方式 |
|---|---|---|
| Loki | 存储后端（LogQL） | 适配器，**第一个做** |
| Elasticsearch + OpenSearch | 存储后端，同一个 `_search` | **一个**适配器，`flavor` 分流 `es` / `os` |
| Docker | 采集来源，非后端 | **选项 0**（见 §5），零新机制 |

## 3. 契约（P1 地基）

### 3.1 接口

- `LogBackend`：`id` / `capabilities()` / `scope?(target)` / `fields(target, options?)` / `query(req)` /
  `facets?(req, target, spec)` / `stream?()` / `health(target)`。
  - **`facets` 是可选方法**（2026-10-11 真机反馈第 2 条）：按字段分组（terms）/ 按时间分桶（date_histogram）。
    「哪个服务在报错」只有它能回答——拉一页行到本地数既慢又错。没有实现它的适配器**不要声明**
    （`capabilities().aggregations` 与它同真同假），调用方按能力给指路文案。
  - 聚合的**近似性也是信号**：terms 的 `sum_other_doc_count`（没列出来的桶还有多少条）与
    `doc_count_error_upper_bound`（误差上界）必须回传，理由与 `totalKnown` 一样。
  - **`filters`（字段 → 值）由适配器决定怎么打**：ES / OpenSearch 查一次 `_field_caps` 决定打原生字段、
    `.keyword` 子字段，还是退回 `match_phrase`（text 且无子字段时）——**不让调用方去记 `.keyword` 这条约定**。
    Loki 不支持它（过滤写进 LogQL），报错文案要说清这一点。
  **`fields` 返回 `{ fields, total, truncated }` 而不是裸数组**（2026-10-11 真机反馈第 4 条）：
  字段清单会被上限截断（默认 80、硬上限 200，优先键排在前面），而调用方必须能看出「还有多少没列出来」——
  一份看不出被截断的 45KB 字段表等于没给（与行的 `hit_limit` 同一口径）。
- `BackendCaps`：`queryLanguage`（`logql` / `lucene` / `ppl` / `none`）、`flavor?`、`follow`、
  `aggregations`、`requiresTimeRange`、`fields`（`indexed` / `discovered` / `fixed`）、
  **`pagination`（`cursor` / `offset` / `none`）、`maxPageSize`、`maxWindowMs`**。
- **来源的「范围」可见**（2026-10-11 真机反馈第 3 条）：ES / OpenSearch 的索引表达式原先**只从地址路径
  悄悄推出来**，没写路径就落 `*`——一条只写 `http://host:9200` 的来源其实是**全集群通配**，
  把 `.kibana_1` / `.infini_*` 也算进来（查询更慢、命中更噪、字段表被污染），而 `loglens_sources`
  只回 URL、agent 无从知道。现在三件事：target 有显式 `index` 字段（优先），
  默认从 `*` 改成 `*,-.*`（排除点号索引），`scope()` 把**解析结果回显**给工具面；
  `probe` 顺带回一句「最近 15 分钟 N 条」（只报存活等于没回答「这里有没有我要的数据」）。
- `NormalizedQuery`：`targetId`（**单数**，v1 一次一源）、`q`、`from` / `to`（**统一 epoch ms**）、
  `limit`、`direction?`、**`cursor?`**（后端私有编码）、`filters?`。
  **入参的写法比契约宽**（2026-10-11 起）：工具面收 epoch 毫秒 / ISO 8601 / 相对时间（`-30m`），
  解析只发生在 `query.ts` 这一层，出去就是 ms——契约本身没变，变的是**入口的便利度**；
  理由见 [../ROADMAP.md](../ROADMAP.md) 那批真机反馈（让模型手算绝对毫秒是真的会错）。
- `LogLine`：`{ ts, level?, levelInferred?, message, source, labels, raw, id }`。
  `source` + `ts` 必须**可重查**——三个后端都没有原生的「某行前后 N 行」，`loglens_context` 靠它重查。
  - **`labels` 是点分路径**（2026-10-11 真机反馈第 1 条）：filebeat 的 `container` / `host` / `log` 是嵌套对象，
    只收标量会让行上唯一的标签变成 `stream`——那就看不出是哪台机器、哪个容器。展平 + **优先键**
    （谁在写这行：container / pod / host / service / log.file.path …）在 `src/line.ts`，
    优先键先占 `LABEL_LIMIT` 名额，值超长截断（全文在 `raw` 里）。
  - **`level` 归一化成 trace/debug/info/warn/error/fatal**：文档 / 流标签里有就用它，
    没有**才从正文推断**，此时 `levelInferred: true`——「文档说它是 error」与「我看着像 error」
    是两种可信度，不许写成一样（与 `totalKnown` 同一口径）。推断只在「级别该出现的位置」找
    （行首断语、`level=ERROR`、logback 的 `14:00:00.123 ERROR …`），正文里恰好提到 ERROR 不算。

### 3.2 计数（不许把语义不同的量挤进一个 number）

    interface LogCounts {
      returned: number
      matched?: number        // 命中总数
      scannedRows?: number    // docker grep：宿主侧实际扫过的行
      scannedBytes?: number   // Loki stats：processedBytes 一类
      totalKnown: boolean     // false = matched 只是下界（ES relation === 'gte'）
    }

范本是 docker 的五计数（[docker/src/docker.ts](../../docker/src/docker.ts) 的 `LogGrepResult`：
`matched` / `scanned` / `returned` / `limited` / `truncated`）。

**ES 的 `totalKnown:false` 是常态**：不显式 `track_total_hits: true` 时 `hits.total.value` 恒定在
10000 封顶且 `relation === 'gte'`。契约必须写明**由适配器**在需要精确总数时显式打开它，并承担其代价。

**P1 定稿（2026-10-11；代码在 [../src/query.ts](../src/query.ts) 的 `countsOf`）**：归属就是上面那一句——
由**适配器**决定要不要打开 `track_total_hits`，本层只如实搬运（没打开 ⇒ `totalKnown: false`）。
`matched` 与 `scannedRows` / `scannedBytes` 各占一格，不许挤进同一个数。

### 3.3 截断与游标

    interface Truncation { truncated: boolean; reasons: TruncationReason[] }
    type TruncationReason =
      | 'hit_limit' | 'max_result_window' | 'partial_shards'
      | 'timed_out' | 'scan_cap' | 'byte_cap'
      | 'cursor_expired'   // PIT 有寿命；过期≠hit_limit，Agent 侧应重新发起一次带时间窗的查询

映射不许丢信息：docker 的 `truncated` → `byte_cap`、`limited` → `hit_limit`，两者都保留。

**游标**

- **ES**：`{ pitId, searchAfter[] }`，`_shard_doc` 做 tiebreaker；PIT 的 `keep_alive` 会过期 → `cursor_expired`。
  **不许**静默重开 PIT（那会悄悄改变快照语义）。
- **Loki**：**不能**用「end = 最旧 ts − 1ns」——同 stream 同 ns 多行合法，limit 切在同值批中间会
  **永久丢行**。形态是 `{ tsNs, streamIdx, ordinalAtTs }`：下一次 `end = tsNs`（含边界），丢弃该 ts
  上该 stream 的前 `ordinalAtTs` 行。
- **未验证前提**：这套玩法预设「同一 stream、同一 ts 内多行的返回顺序稳定」。重复日志行内容不可区分，
  去重只能按出现序号。→ P1 反例两条：**同 ts 三行 / limit=2 不丢第三行**；
  **同 ts 同内容两行 / limit=1 不吞第二行**。P2 真机单独测顺序稳定性。
- **保守退路**：测不出稳定序就把 Loki 标 `pagination:'none'`，只回「命中可能不完整，请缩小时间窗」。
  **诚实报不完整，好过给一个会丢行的游标。**

**P1 定稿（2026-10-11；代码在 [../src/cursor.ts](../src/cursor.ts) 与 [../src/query.ts](../src/query.ts)）**：

1. `cursor_expired` 与 `hit_limit` 是**两个**理由（`truncationOf` 的输入各占一个布尔位，理由顺序固定）；
   过期不等于「还有更多」，适配器不许静默重开 PIT。
2. `track_total_hits` 的归属见 §3.2（适配器自担代价）。
3. **顺序稳定性仍是 P2 的真机活**；在那之前 Loki 的 `pagination` 由适配器自己声明，本层不假设顺序。
   另把反面教材写成了用例：按「最旧 ts − 1ns」续页会把整个同值批丢掉（`test/cursor.test.ts`）。

**REVISION（2026-10-12，P2 真机验收后；上面两段是当时的原文，保留不删）**

真机（Loki 3.7.8，隔离环境）把上面那段 Loki 游标设计**整条推翻了**——两处根因、两条缺陷
（`loglens D02` / `D03`，见 [../DEFECTS.md](../DEFECTS.md)）：

| 上面写的 | 真机事实 | 现在的口径 |
|---|---|---|
| 「下一次 `end = tsNs`（**含**边界）」 | Loki 的 `end` 是**开区间**（逐纳秒实测：`end = ts` 命中 0 行） | 续页边界一律 `boundaryNs + 1ns` |
| 「丢弃该 ts 上该 stream 的前 `ordinalAtTs` 行」 | 流次序与组内次序**会随窗口/limit 变**，位置不是坐标 | 组内按**内容**定序；坐标换成「完整 ts 组」 |
| 「预设同 ts 多行返回顺序稳定」 | **不稳定**（重复查询 10 次一致，但换窗口就变） | 判据不再依赖顺序 |
| 「测不出稳定序就标 `pagination:'none'`」 | 顺序确实不稳，但换坐标后游标照样成立 | Loki 已翻成 **`'cursor'`** |

**新坐标（现行实现）**：每页若取满 limit，末组可能被切开 → **把该组整组补齐**再交付
（组是切不开的，页因此可略超 limit）；下一页 forward 从 `末组ts + 1ns` 起、backward 到 `末组ts` 止，
两个方向都天然跨过整组。真机对账 **12/12 组不丢不重**（limit 1/3/7/11/13/25 × forward/backward）。
`LogLine.id` 也随之去掉流序号（改成 `ts:内容序`）——否则同一组在续页时会算出不同 id。

**仍然成立的部分**：上面那条「不能用 `end = 最旧 ts − 1ns`」的判据一条没动——同 ts 多行不能切，
这条是真机反而**加强**了的（D03 就是它被违反时的现场）。

## 4. 安全与凭据

1. **出站围栏（`src/net.ts`，本仓第一个）**
   - 浏览器只传 target id、**永不传 URL**；target 由用户在设置卡片显式添加（添加动作即白名单）。
   - **禁重定向**：`fetch` 默认 `redirect:'follow'`，一次 302 就能绕过白名单打到链路本地地址。
     v1 用 `redirect:'manual'` 并写明；或逐跳重校验。
   - **校验对象是解析后的 IP**，不是 URL 字符串（挡 `localhost` 别名、内部 DNS 名、DNS rebinding）；
     判定在 `dns.lookup` 之后。
   - **产品语义明写（2026-10-11 按常规做法改判）**：**连接面 = 你配置的来源**——回环 / 私网 / 公网一律放行
     （托管日志服务是正常用法，内网用非 RFC 1918 网段更是常见）；**链路本地 / 云元数据一律拒且无豁免**。
     当天早些时候的「公网默认拒 + 按来源开 allowPublic」**已推翻**（理由见文末落地记录与
     [../ROADMAP.md](../ROADMAP.md) 的「公网档改判」一节）。
   - 体积上限 / 超时 / 时间窗上限 / 条数上限集中在 `net.ts` + `query.ts`。
   - 现况：`rss` 是裸 `fetch`、`kit` 里没有对偶物；**第二个消费者出现时这层上收到 kit**。

   **落地状态（2026-10-11，代码在 [../src/net.ts](../src/net.ts)；用例 `test/net.test.ts` 25 条）**：

   1. 判据落在**解析之后的 IP**上（`dns.lookup` 之后、建连之前），且**一个主机名解析出多个地址时每一条都要过**；
      `localhost` / `*.localhost` 按 RFC 6761 直接当回环、不打 DNS。
   2. **不跟随重定向**：`redirect:'manual'`，3xx 直接当失败并回显 `Location`。
      实测（Node 22 的 undici）：`redirect:'manual'` 回的是**真实响应**（status 302 + location 头），
      `redirect:'error'` 只给一句 `unexpected redirect`——要回显地址就得用前者。
   3. ~~**公网默认拒，按来源可开**~~ → **已改判（2026-10-11，常规做法）**：`public` 档**不拦**，
      **只有链路本地 / 云元数据 / 保留段被拒**（无豁免）。原文保留在下面，因为「为什么曾这么想」有价值：
      当初的理由是「本插件是查内网日志的」；**推翻它的是真机**——用户环境里的内网日志服务器落在
      `172.172/16`（**不在** RFC 1918 的 `172.16/12` 里），于是唯一可用的来源被拦下。
      内网不 NAT 直接用公网段很常见，而「地址分类」不等于「流量出网」；一刀切拒只会变成一次多余的点击。
      改判后 `allowPublic` 字段与卡片上那一格**一并拆掉**（留着就是个没有作用的开关）。
   4. 体积上限（默认 8 MiB，先看 `content-length`、再边读边数）与超时（默认 20s，Loki 15s / ES 20s 各自传）
      都在这一层；时间窗与 limit 的上限仍归 `query.ts`（`net.ts` 只做「一次请求」的量）。
   5. **分寸**：解析与建连是两步，DNS rebinding 的窗口关不掉（要关得把校验下沉到连接层）；错误文案里
      **去掉凭据**（`sanitizeUrl`）；非 2xx 由适配器解读（ES 的 `cursor_expired` 要读失败响应体），
      `net.ts` 只在「请求没打成 / 打成但形状不能要」时抛错。
2. **回环档位**：持有后端凭据 → **加固档** `isLoopbackRequestStrict` + `hasSameOriginProof`
   （[kit/src/http.ts](../../kit/src/http.ts)）。**改档要同步改** [architecture § 7.1 表](../../../docs/architecture.md#7-一条请求经过什么)。
3. **`/config` 豁免按动作，不按方法**——否则跨站页面能从配置侧加一个指向内网的 target，再用本插件的
   读面打它，围栏被绕穿。修法：**`enabled` 动作豁免**（保住「禁用后唯一恢复入口」），
   **`targets` 的增 / 删 / 改必须同源证明**。代价：§7.1 那格正文「/config 三处一致地豁免」变成
   「3 个包整体豁免 + 1 个包按动作部分豁免」，**改表时必须同时记这个不对称**。
4. **凭据**：官方凭据层 / `env:NAME` 引用，永不回传浏览器。
5. **body 围栏**：`readJsonBody` 返回 `undefined` 一律 **400**。
6. **档位闸**：`loglens_search` 等归 `read`，配 `LOGLENS_TIER_CLASS` + 从 `add()` 现算的对账守卫；
   并在 [permission-tier-plan §2.1](../../../docs/permission-tier-plan.md) **加一张 loglens 表**（分类表的唯一归宿），
   [architecture](../../../docs/architecture.md#7-一条请求经过什么) 的「docker 与 tty 各出一张」随之改为三个包。

## 5. 与现有包的边界

**通道的真相**：跨插件服务走 cordis 的 `ctx.provide` / `ctx.inject`；全仓现有唯一实例在
**客户端半体**（`ttyTerminal`，[tty/client-src/index.js](../../tty/client-src/index.js)）。宿主半体的
`inject([...])` 名单全是官方服务（`credentials` / `webServer` / `systemPrompt` / `settings` /
`tools` / `sessions` / `agents`），**零插件级**。→ 宿主半体插件间服务是本仓**第一条新机制**，
不是「照 §5 范本」。

### 选项 0（Docker 走这条，P5 零新机制）

| 面 | 做法 | 代价 |
|---|---|---|
| **Agent** | **不包一层**：`loglens_sources` 把 docker 目标标成「用现成的 `docker_logs` / `docker_logs_grep`」 | 零代码 |
| **面板** | 浏览器半体**相对路径** fetch `/api/dsh-docker/logs`（同源天然满足，无需端口发现） | 弱面：无 `until`、`tail` 有上限、无 grep（docker 明确「刻意不做 `/logs/grep` 路由」） |

**关键约束**：agent 工具跑在**宿主半体** → 「浏览器 fetch 路由」**只覆盖面板、覆盖不到 Agent**。
要 Agent 侧统一查询才需要宿主服务（P7 单独申请）。

**「装了没装」的判据**：走 registry 存在性（`ctx.registry.values()` 按 registryName 过滤，
现成机制见 [search/src/index.ts](../../search/src/index.ts) 的 `getLoadedRegistryNames`）+ `health()` 探测。
**不要写成包版本比较**——registry 里没有版本号；服务对象自带的 `version` 只有 `provide` 那条路才有。

**落地状态（2026-10-11）**：**两格都落地了**。Agent 那一格：`loglens_*` 里 docker 目标只做**指路**
（`hintFor` / `adapterHint`：用现成的 `docker_logs` / `docker_logs_grep`），**没有包一层**。面板那一格（P6）：
选中 docker 目标时，卡片里换成 Docker 日志区，**相对路径** fetch `/api/dsh-docker/containers` 与
`/api/dsh-docker/logs`（同源天然满足），弱面（无 until / tail 有上限 / 无 grep）在界面上如实标注。
「装了没装」的宿主侧判据是 cordis 的 plugin registry（见本文件 §5 末与 `src/plugins.ts`）。

**实测前提（2026-10-11 复核）**：宿主侧**没有**可用的「工具注册表列举」API——`@deepseek-ai/dsh-tools@0.1.2-rc.1`
的 `ctx.tools` 只有 `register` / `restrict` / `guard`，**没有 list / has**。所以「docker 插件装没装」这件事
在宿主侧**不要去猜**；上面那条判据本来就是**面板侧**的机制。

### 浏览器日志视图：三选一

1. **受控重复**（默认，合规）；
2. `docker` 暴露视图挂载服务（本仓唯一被允许的浏览器侧共享形态，跨包改动）；
3. 新增共享包（推翻已冻结结论，需明确批准）。

## 6. 各后端要点

- **Loki（P2）**：`GET/POST /loki/api/v1/query_range`，`start` / `end` **纳秒**（适配器从 epoch ms 换算），
  `limit`、`direction=backward`；`streams[].values` 是 `[[tsNs, line]]`；`stats=true` 取扫描统计。
  字段 `/loki/api/v1/label` + `/label/<name>/values`。多租户 `X-Scope-OrgID`。
  跟随 `/loki/api/v1/tail`（**WebSocket**，不是 SSE），需 `ws`（`tty` 已有先例，按 architecture §3 在 README 写理由）。
- **ES + OpenSearch（P4）**：`POST /<index>/_search`，`sort` 按 `@timestamp` 降序；深分页 PIT + `search_after`；
  **版本差异已实测并适配**（2026-10-11 在一台 7.10.2 上）：PIT 的响应键 7.10 是 `pit_id`（7.12+ 才是 `id`）、
  7.10 / 7.11 **没有 `_shard_doc`**（退到 `_id`，按目标记住探测结果），且这类失败在 7.10 上是
  **HTTP 200 + `_shards.failed` + 空 hits**；
  字段 `_field_caps` / `_cat/indices`。方言差异进 `capabilities()`（OS 的 PPL / SQL / tenant；
  ES 8.11+ 的 ES|QL）。认证统一 Basic / `Authorization: ApiKey`。
- **Docker（P5）**：按选项 0；契约上它是退化 `LogBackend`（`queryLanguage:'none'`、`fields:'fixed'`）。

## 7. 包结构

    packages/loglens/
      src/index.ts              # 宿主半体：路由 + agent 工具 + 能力/档位接线
      src/backends/{types,loki,elastic,docker}.ts
      src/net.ts                # 出站围栏（SSRF / 重定向 / IP 校验 / 超时 / 体积）
      src/query.ts              # 归一化 + 时间窗/limit 夹取 + 计数与截断归并
      client-src/index.js       # loglens 是「构建型」包：i18n 内联于此
      client-src/*.js           # 要判对错的纯逻辑（级别识别 / 行合并 / 缓冲区）
      scripts/build-client.mjs  # 照 codegraph：遇任何残留 import 直接 exit(1)
      test/*.test.ts
      scripts/*-smoke.mjs       # 真机脚本（进不了 CI）

**客户端半体还必须在 manifest 里声明（2026-10-11 真机验收补）**：`package.json` 要有
`dsh.client = { platform: 'web', inject: [] }` 与 `exports['./client'] = './client.js'`。宿主侧的
client-modules 按这份声明把包变成可加载的浏览器 bundle——**缺了它 `client.js` 一次都不会被加载**：
插件在宿主里 running、`files` 里也有 client.js、i18n 与 client-lint 全过，但**设置里永远没有卡片**。
守卫见 [scripts/test/client-manifest.test.ts](../../../scripts/test/client-manifest.test.ts)。
（这一条是建包时**模板没带、也没有守卫**的缺口，所以是「构建型要写死的三件事」之外的第四件。）

**为什么必须明示「构建型」**：选了 `client-src/` 就等于选了构建步骤，而
[client-host-url.mjs](../../../scripts/client-host-url.mjs) 在 `client-src/` 存在时**只扫 `client-src/**`、
不再覆盖 `client.js`**（[client-lint.mjs](../../../scripts/client-lint.mjs) 同款分流，
[i18n.md](../../../docs/i18n.md#为什么不建共享模块三条硬约束都实测过) 记了这条风险）。所以三件事要写死：
**i18n 内联 `client-src/index.js`**、**构建脚本 residual-import exit(1)**、
**「新包能不能选构建型」进先问清单**，**外加 manifest 的 `dsh.client` / `exports['./client']` 声明**（2026-10-11 补，见上）。

## 8. 已实测前提

- `templates/hello/package.json` 钉 `0.3.0`，kit 是 `0.5.2`，其余 **9** 个消费者全 `0.5.2`
  （2026-10-11 复核修正：这里原先写的「10 个」是错的——`kit-settings` 与 `all` 都不声明 kit，闸门实测 9 处）；
  `check-kit-pins.mjs` 只扫 `packages/*` → 该漂移当时**无人会红**（实测退出码 0）。
  **本行是当天上午的前提快照**：当天稍后 P0-甲 落地（模板改 `0.5.2` + 生成期改为现算），
  现状见 [ROADMAP § 已完成](../ROADMAP.md#已完成落点--门槛)；保留本行是为了让「为什么先做」有据可查。
- `pnpm-workspace.yaml` 只有 `packages/*`；`pnpm-lock.yaml` 对 `templates/hello` **零命中**
  → 模板的 kit 钉子不是运行期事实，是**种子值**。
- `ctx.provide` 全仓仅 3 处，全在 `tty/client-src`；宿主半体插件间服务**零先例**。
- docker `LogGrepResult` 已是五计数 + 双信号位（`truncated` / `limited`）。
- docker 的 `/logs` 与 `/logs/stream` **都只转发 `since`、丢 `until`**（`DockerApi.logs()` 与 agent 工具
  都支持 `until`）；`/logs/grep` 路由**刻意不做**。
- 客户端半体现算 10 个：有 `client-src/` 的是 `codegraph` · `docker` · `tty`（3）；
  裸 `client.js` 的是 `env` · `kit-settings` · `mcp` · `profile` · `prompt` · `rss` · `search`（7）。
  → 现存 `client-lint.mjs` 的注释与该名单**不一致**（写「两个包」且漏掉 `kit-settings`），
  属已登记的漂移，按 conventions § 文档分档 纪律 3 **只加标注、不擅自修正**。
- `coverage-ratchet.mjs` 的范围是 `packages/*/src/**`（glob）→ loglens 的 `src` 自动进面；
  只判 `lines`（基线 66.52），容差 0.3 个百分点；**只在 nightly 跑、不在 ci.yml**，
  文件头自述「不挡任何人」；`pnpm coverage:write` 是设计好的接受通道。
- **id 命名（2026-10-11 决定）**：`logs` 这个 loader id **已被第三方插件占用**——`dsh-logbook` 的
  `cordis.patch.yml` 就是 `- id: logs` / `name: dsh-logbook`（其 `src/index.js` 也 `export const name = 'logs'`，
  注册 `/logs` 命令）；npm 上 `dsh-logs` 也已被他人占位（"Structured log viewer for the dsh host"）。
  loader id 是 **profile 级全局命名空间**，生态占用情况本仓不可见 → 本包取刻意区分的 id **`loglens`**，
  包名 / 路由 / env / 配置命名空间 / panel 的 `registryName` / 工具前缀随之统一。候选取舍：`loglens` 与 `logquery` 在 npm 上都空，取 `loglens` 是因为工具名更短、
  且不出现 `logquery_search` 那种「query…search」重复；`logscope` 避开——本仓
  [glossary](../../../docs/glossary.md) 里 **scope 是 cordis 的隔离层**，术语会撞车。
  （功能**不冲突**：那些插件管的是 harness 自己的 `ctx.logger`，本插件查的是外部日志后端；撞的是**名字**。）
