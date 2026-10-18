# @hyzyn/dsh-loglens 设计方案

> **状态：P1 契约与纯模块、P2 的 Loki 适配器（**含真机验收**，见 ROADMAP 的 P2 一节）、P4 的 ES / OpenSearch 适配器与出站围栏（src/net.ts）、P3 的 agent 工具（名单以 `src/tools.ts` 注册处为准，含当天后补的 `loglens_facets`）都已落地（2026-10-11 ~ 10-12）；浏览器侧结果视图已落地；真机验收 ES / OpenSearch 侧已跑过若干轮只读复核，Loki 侧已跑完并翻成 `cursor`。** 本文件是**包特有的深层设计**（归属见 [conventions § 知识归属表](../../../docs/conventions.md#知识归属表唯一归宿)
> 的「包特有的深层设计 / API」一行 → L1 `packages/<pkg>/docs/`）。
> 待办与执行计划见 [../ROADMAP.md](../ROADMAP.md)；包落地后按档位补齐 `README.md` / `DEFECTS.md`。

## 1. 目标与定位

把异构日志后端归一化成**一个查询前端 + N 个薄后端适配器**。核心资产是
「归一化行模型 + 诚实的计数与截断信号 + 交给 Agent」，不是「支持了几个后端」。

`@hyzyn/dsh-loglens`（id `loglens`，路由 `/api/dsh-loglens/…`，缺陷前缀 `D`）。
**没有专属环境变量**：2026-10-18 复核 `grep -rn 'DSH_LOGLENS' packages/ docs/` 只命中本行——
这一句此前写的 `env \`DSH_LOGLENS_*\`` 是照 [conventions § 命名](../../../docs/conventions.md#命名) 的命名规矩
预留的，代码里从来没有读过它。要配的东西全在设置卡片的来源清单里。

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
  - **按时间分桶的三个约定**（2026-10-12 面板画「时间分布」时定死，落点在
    [client-src/pure.js](../client-src/pure.js) 的 `histogramBars`）：① 面板上的分布**只能来自后端的
    `date_histogram`**，**不许数这一页的行**——那一页是 `limit` 截断过的，数它量到的是「这一页的分布」
    （`limit=100` 打在「最近 1 小时」上会画出「后 10 分钟占 100%」这种假曲线）；② 适配器传
    `min_doc_count: 1`（没数据的桶不进响应，这是对的），所以**铺图的人必须把空档补 0**，
    否则「那段时间一条都没有」会被压成「一直在刷」；③ 窗口**取响应回显的那一份**，
    不是调用方请求的那一份（宿主可能兜底或收窄过）。
  - **柱高怎么归一化**（2026-10-17 第十六刀，落点 `pure.js` 的 `histogramScale`）：日志量通常很稳，
    线性归一化（`count / max`）会让整张图变成平带——真机 61 根里 50 根落在 60~70% 一档，
    **图的意义是看差异**，那样等于白画。判据按数据自己挑：`max / min ≥ 3` 走 `linear`；
    `< 3` 走 `clipped`（从 `min × 0.9` 起画把差异拉开）；全一样走 `flat`（不裁剪、不解释）。
    `clipped` 那一档**必须**在界面上说明「柱高只表示相对高低，不是与条数成正比」——柱高不再与
    条数成正比这件事不说出来，读者就会把高度差当成倍数差，而那正是这张图唯一的用处。
    空桶（`count = 0`）**永远**只是 2% 的底座，不参与裁剪：「零」是真实的值，抬到 floor 之上就是撒谎。
  - **读数与它所描述的那根柱必须在同一列**（2026-10-17 第十七刀，落点 `client-src/index.js` 的
    `.ll_histReadout`）：悬停一根柱，读数以气泡形式贴在那一根的**正上方**（`left` 由**柱序号**算：
    柱宽是 `flex:1` 等分，序号才是屏幕上的真实位置），不悬停时不画。判据是**距离**而不是位置本身——
    钉在容器左端的常驻一行（第十六刀的做法）被维护者点破为「柱子和信息隔得太远了」：内容全对，
    但它与所指的东西不在同一列，读者每移一格都要横跨整张图。气泡画在柱子容器**内部**（容器
    `padding-top` 让位），不浮到容器外——浮出去会盖住上面那行图例，而图例本身也是要读的。
  - **`filters` 必须先**到适配器手里（2026-10-17 真机）：`src/execute.ts` 抽出「工具与面板共用」
    那一层时漏了 `filters`（同文件的 `runFacets` 传了），于是结构化筛选只收窄榜与分布、**行**永远是全量
    （真机把 `container.name = prometheus` 发出去，回来的 100 行里躺着 6 个容器）。判据不难，难的是「串起来」——
    守卫加在 `test/query-route.test.ts`：走 `/query` 路由，断言桩适配器真收到 `filters`、Loki 带 `filters` 进来回 400。
  - **`filters`（字段 → 值）由适配器决定怎么打**：ES / OpenSearch 查一次 `_field_caps` 决定打原生字段、
    `.keyword` 子字段，还是退回 `match_phrase`（text 且无子字段时）——**不让调用方去记 `.keyword` 这条约定**。
    Loki 不支持它（过滤写进 LogQL），报错文案要说清这一点。
  **`fields` 返回 `{ fields, total, truncated }` 而不是裸数组**（2026-10-11 真机反馈第 4 条）：
  契约之所以带上 `total` / `truncated`，是因为 45KB 那份字段表**看不出被截断**等于没给（与行的
  `hit_limit` 同一口径）。**但默认并不截断**（2026-10-14 对齐 Kibana：`_field_caps` 从不 slice，
  长度交给界面/调用方消化）：不传 `limit` 就全列，只有调用方显式给了 `limit` 才可能出现
  `truncated: true` 与那句警告。优先键仍然排在前面（`preferred: true`）。
  **字段清单只说「能用的名字」**（2026-10-14 对齐 Kibana 的第二刀）：`object` / `nested` 这类**容器行**
  （`container` / `host` / `log` 这种没有自己值的父级）不列——真机实测 `_field_caps?fields=*` 在
  `*,-.*` 上回的 200 个名字里有 10 个是容器行，列出来只会让人选一个「点了没结果」的字段；
  同名在**不同索引**里落到不同**宽类型族**的字段标 `conflict: true` 并带上 `esTypes` /
  `conflictDescriptions`（Kibana 的 `type: 'conflict'`）——同族的多类型（`text` + `keyword`）不算冲突。
  形状是**可选**的：只有一个类型时不带 `esTypes`，不然每个字段都要为一条没有信息量的字段付载荷。
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
  > **⚠️ 这三条（形态 / 未验证前提 / 保守退路）已被真机整条推翻**——`{ tsNs, streamIdx, ordinalAtTs }`
  > 这个坐标**不在代码里**，现行形态是「完整 ts 组」。原文按纪律保留，推翻它的证据、根因与现行口径
  > 全在往下 6 行的 **REVISION（2026-10-12）** 一节；读到这里就直接跳过去，别拿这段当实现。
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
容器清单**不需要点按钮**（2026-10-14）：选中 Docker 来源即自动拉，缓存键 = 来源 id + Docker 目标名
（`containersKey`），换目标重拉、同键不重拉、失败不留缓存；「刷新」是手动出口（容器会变）。
「装了没装」的宿主侧判据是 cordis 的 plugin registry（见本文件 §5 末与 `src/plugins.ts`）。

**实测前提（2026-10-11 复核）**：宿主侧**没有**可用的「工具注册表列举」API——`@deepseek-ai/dsh-tools@0.1.2-rc.1`
的 `ctx.tools` 只有 `register` / `restrict` / `guard`，**没有 list / has**。所以「docker 插件装没装」这件事
在宿主侧**不要去猜**；上面那条判据本来就是**面板侧**的机制。

### 浏览器日志视图：三选一 → **已拍板选项 1（2026-10-12）**

1. **受控重复**（默认，合规）——**✅ 已拍板**；
2. `docker` 暴露视图挂载服务（本仓唯一被允许的浏览器侧共享形态，跨包改动）——**未采纳**；
3. 新增共享包（推翻已冻结结论，需明确批准）——**未采纳**。

**判据（2026-10-12 维护者拍板）**：

- **两份视图不是同一件事**。loglens 的日志视图是**每个来源一套自己的结果视图**（查询区 + 结果列表 +
  计数 + 截断提示），docker 那份是**容器日志工作台**（流式跟随、`until`、grep、缓冲）。选项 2 要把后者
  抽成可挂载服务，改的是一个 ~9200 行的客户端 bundle，换来的是**在两个地方看到同一份工作台**——
  看容器日志的正常去处本来就是 Docker 面板自己，收益与代价不成比例。
- **选项 2 不是「做不到」，是「不值得」**：跨包**浏览器侧**服务本仓已经有先例、而且已经在跑——
  `docker/client-src` 的 `ctx.inject(['ttyTerminal'])` / `['ttyPanel']` / `['ttyConnbar']` /
  `['sidebarRightTabs']` 就是这个形状（见 §8「已实测前提」）。将来真需要时按同一形状反过来做即可，
  不需要新机制。
- **loglens 的 docker 半格保留**：弱面（无 `until`、`tail` 有上限、无 grep）继续在界面上如实标注，
  精确检索指回 `docker_logs_grep`——与选项 0 的 agent 侧同一条态度：**说清做不到什么**，而不是
  给一个看着能干、实际被削弱了的入口。

## 6. 各后端要点

- **Loki（P2）**：`GET/POST /loki/api/v1/query_range`，`start` / `end` **纳秒**（适配器从 epoch ms 换算），
  `limit`、`direction=backward`；`streams[].values` 是 `[[tsNs, line]]`；`stats=true` 取扫描统计。
  字段 `/loki/api/v1/label` + `/label/<name>/values`。多租户 `X-Scope-OrgID`。
  跟随 `/loki/api/v1/tail`（**WebSocket**，不是 SSE），需 `ws`（`tty` 已有先例，按 architecture §3 在 README 写理由）。
  **落地状态（2026-10-12）**：`stream()` **还没实现**，所以 `capabilities().follow` 现在声明为 **`false`**。
  这一位原先是在 `stream()` 还没写的时候就写成 `true` 的——而它会被 `loglens_sources` **原样回给 agent**，
  等于指一个不存在的入口。判据与 `aggregations` ↔ `facets()` 是同一条（§3.1）；守卫见
  [test/capabilities.test.ts](../test/capabilities.test.ts)：**声明了 follow 就必须真的有 `stream()`**。
  **`tail` 已决定「暂缓」（2026-10-12，维护者）**：没有消费者，且手上真在用的来源是 ES（跟随走
  `_search` + 轮询）。**要做时按本节方案、连消费者一起落地，再把这一位改回来并补真机用例**——
  判据与理由的唯一归宿是 [ROADMAP.md](../ROADMAP.md) 的「P2 真机验收 → 还没做的」那一节，不在这里复述。
- **ES + OpenSearch（P4）**：`POST /<index>/_search`，`sort` 按 `@timestamp` 降序；深分页 PIT + `search_after`；
  **版本差异已实测并适配**（2026-10-11 在一台 7.10.2 上）：PIT 的响应键 7.10 是 `pit_id`（7.12+ 才是 `id`）、
  7.10 / 7.11 **没有 `_shard_doc`**（退到 `_id`，按目标记住探测结果），且这类失败在 7.10 上是
  **HTTP 200 + `_shards.failed` + 空 hits**；
  字段 `_field_caps` / `_cat/indices`。方言差异进 `capabilities()`（OS 的 PPL / SQL / tenant；
  ES 8.11+ 的 ES|QL）。认证统一 Basic / `Authorization: ApiKey`。
- **Docker（P5）**：按选项 0。**它没有适配器**——`src/backends/registry.ts` 里没有 Docker 这一项，
  `loglens_search` 见到 `kind: 'docker'` 时只回一句指路（见 `src/tools.ts`）。设计早期设想把它做成
  退化的 `LogBackend`（`queryLanguage:'none'` / `fields:'fixed'`，这两个值只是枚举里的合法取值），
  **那一版没有落地**，别照着它找代码。

## 7. 包结构

    packages/loglens/
      src/index.ts              # 宿主半体：四条路由 + 设置持久化 + 档位闸接线
      src/config.ts             # 来源清单的纯判据（id / 地址校验 / 宽松读盘 / 增删改）
      src/tools.ts              # agent 工具注册处 + 档位分类表（名单以这里为准）
      src/execute.ts            # 找来源 / 归一化 / 拼返回形状（工具与面板路由共用）
      src/query.ts              # 归一化 + 时间窗/limit 夹取 + 计数与截断归并
      src/cursor.ts             # 两份游标（Loki 的完整 ts 组 / ES 的 pitId + searchAfter）
      src/line.ts               # 行可观性：标签摊平、级别归一与正文推断
      src/net.ts                # 出站围栏（SSRF / 重定向 / IP 校验 / 超时 / 体积）
      src/plugins.ts            # 「某个插件装没装」的 registry 判据（Docker 那一格用）
      src/backends/{types,registry,loki,elastic}.ts   # 契约 / 注册表 / 两个适配器
      client-src/index.js       # loglens 是「构建型」包：i18n 内联于此
      client-src/pure.js        # 客户端的纯逻辑（进 vitest，不 import 目录）
      scripts/build-client.mjs  # 照 codegraph：遇任何残留 import 直接 exit(1)
      test/*.test.ts
      scripts/client-smoke.mjs  # 无浏览器的渲染回归（进不了 CI 的真机脚本另算）

> 这份清单在 2026-10-18 按磁盘**现算**过一遍：此前写的 `backends/{…,docker}.ts` 里
> `docker.ts` **不存在**，`registry.ts` / `config.ts` / `execute.ts` / `tools.ts` / `cursor.ts` /
> `line.ts` / `plugins.ts` 都没列。改文件就顺手改这里，别再让它变成一份三周前的目录树。
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
- **跨包浏览器侧服务的接线在运行期，不在 manifest（2026-10-12 复核）**：全仓每个包的
  `package.json` 里 `dsh.client.inject` 都是 **`[]`**——**包括已经在消费 tty 服务的 `docker`**。
  真正把服务接起来的是客户端半体里的 `ctx.inject(['ttyTerminal'], …)`。
  → 要新增/改这类消费，**改的是 `client-src`，不是 manifest 那一格**；
  判「某个客户端服务在不在」也不该读 manifest。（这条是拍板 §5 选项 2 时顺手核实的。）
- docker `LogGrepResult` 已是五计数 + 双信号位（`truncated` / `limited`）。
- docker 的 `/logs` 与 `/logs/stream` **都只转发 `since`、丢 `until`**（`DockerApi.logs()` 与 agent 工具
  都支持 `until`）；`/logs/grep` 路由**刻意不做**。
- 客户端半体现算 10 个：有 `client-src/` 的是 `codegraph` · `docker` · `tty`（3）；
  裸 `client.js` 的是 `env` · `kit-settings` · `mcp` · `profile` · `prompt` · `rss` · `search`（7）。
  → 现存 `client-lint.mjs` 的注释与该名单**不一致**（写「两个包」且漏掉 `kit-settings`），
  属已登记的漂移，按 conventions § 文档分档 纪律 3 **只加标注、不擅自修正**。
  **2026-10-18 补**：这是加本包之前的数。`node scripts/check-i18n.mjs` 现在的输出是
  「已接入 **11/11** 个客户端半体」，有 `client-src/` 的是 **4** 个（`codegraph` · `docker` · `tty` ·
  `loglens`——本包走的就是构建型）。
- **面板的侧边栏入口是「手搓 DOM」的，且 family 名单在 4 个包各有一份硬编码**（2026-10-15 复核）：
  侧边栏那几个入口用的都是 `data-dsh-*-entry` 属性选择器，**同一条 family 名单在 `docker` / `tty` /
  `rss` / `search` 四个包的产物里各出现一次**，且覆盖面并不一致——
  `search`（作为面板目录的读侧）认 `global-search` / `rss` / `taskboard` / `ssh` 四个，
  `docker` 多认一个 `docker`，`tty` 多认一个 `tty`，`rss` 只认 `rss` / `ssh` / `taskboard` 三个。
  → 再加第 5 个入口就得同步改那几份名单（且每份的覆盖面还不一样），
  这是 §9 决定「工作台入口走右侧栏标签 + 设置卡片按钮，不走手搓侧边栏入口」的直接理由之一。
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

## 9. 查询工作台（借 Kibana 的核心，不做 1:1 复刻）

**这一章的定位**：它是**设计交底**，不是待办清单。写完这一章，另一个工程师应当能**不做新的设计决定**
就直接开工——每一条都给出「借它的哪一点、落在哪个现成接口、契约动不动、诚实的边界在哪」。
分期判据、守卫、门槛与真机验收口径的**执行面**在 [ROADMAP.md](../ROADMAP.md#分期) 的 P8-甲…丁；
**本文不复述那里的门槛数字**（复制即第二真相源）。

> **⚠️ 读这一章之前先知道：§9 描述的「右侧栏工作台」一节都还没落地**（2026-10-18 复核：
> `client-src/index.js` 里 `sidebarRightTabs` / `sidebar.right.pane.tab` / 「打开查询台」**零命中**）。
> 已经落地的是 §9.3 里那些**做在卡片里**的条目——字段侧栏、列集与行展开、本页排序、
> 点值即筛、筛选两格、直方图放大等，逐条标着「已落地」并指向 ROADMAP 的那一刀。
> 本章其余部分是**将来照着做**的交底，不是现状描述；别把它当成「已经有了什么」。

**一句话**：把面板从「设置卡片里的一条查询区」变成**与对话同屏的日志查询工作台**，
功能骨架照 Kibana Discover 的核心（字段侧栏 / 查询栏 / 结果表 / 直方图 / 筛选芯片 / 时间与自动刷新），
**不复刻**它的数据视图、保存对象、Lens、告警、KQL / ES|QL 编辑器。

### 9.1 承载与入口

| 项 | 决定 | 理由与代价 |
|---|---|---|
| **承载** | 工作台 = **会话右侧栏标签**：客户端 apply 里 `ctx.inject(['sidebarRightTabs','sidebarRight'], …)`，`sidebarRightTabs.register({ id: <实现 id>, kind, priority: 'extension', title, guide })` + `slots.register({ name: 'sidebar.right.pane.tab', key: <实现 id> }, Body)` | 有现成先例（[docker/client-src/index.js](../../docker/client-src/index.js) 的容器面板标签就是这一形状）。**`key` 必须是实现 id、不是 kind**——写错的表现是「标签能开、body 空白」，而这条路**没有编译期守卫**（契约原文见 `dsh-client-ui-sidebar-right` 的 `tab-registry.d.ts` 与 `contract/slots.d.ts`：body 按 definition 的 `id` 派发） |
| **入口（主）** | 右侧栏 guide 里的一条 capsule（`guide: [{ order, title, description }]`） | 宿主自己把 guide 画成入口列表；我们只贡献一条，**不碰宿主的布局** |
| **入口（副）** | 设置卡片里一个「打开查询台」按钮，调 `sidebarRight.openTab(kind, {})` | 卡片仍是最容易找到的去处；按钮**拿不到服务时整块不画**（见下一行） |
| **为什么不用手搓侧边栏入口** | 不用 `data-dsh-*-entry` 那条路 | 那条路的 family 名单在 `docker` / `tty` / `rss` / `search` **四个包各有一份硬编码、覆盖面还不一致**（实测见 §8）——加第 5 个入口要同步改四份名单，换来的只是一个图标 |
| **老宿主 / 服务缺失 / 插件被禁用** | `ctx.inject(['sidebarRightTabs','sidebarRight'], …)` 的**回调不执行就是没有这两个服务**：卡片**保留今天的查询区**（行为一点不减，照 docker「拿不到右侧栏服务自动退回模态」的先例）；插件禁用时四条路由只留 `/config`（既有口径） | 退回去的是**功能完整的旧面**，不是「少一半的工作台」。客户端 apply 里**不许因为拿不到服务而抛错**——那会让整个插件起不来（卡片一起没） |
| **卡片与工作台的关系** | **两个组件**，共享 `client-src/pure.js` 的判据与**同一个执行层**（`/query` / `/fields` / `/facets`）；不做「同一组件两种外壳」 | 工作台落地后卡片**逐步退成来源清单 + 开关**（正是它今天的前两格）；两者重叠的只剩「来源下拉」一处。理由是判据全是纯函数、两处调用同一份，**不存在两份会漂的规则** |

### 9.2 三栏骨架（以及**不复刻**什么）

```
┌─ 左：字段侧栏 ─┬─ 上：查询栏（查询串 / 来源 / 时间 / 条数 / 自动刷新） ──────────┐
│ 这一页命中的   │  筛选芯片行（字段 = 值 + ×，可临时停用）                        │
│ 其余可用字段   ├───────────────────────────────────────────────────────────────┤
│ 有类型冲突的   │  时间分布（直方图，点柱放大——P6 第五刀已打底）                  │
│ （子串过滤）   ├───────────────────────────────────────────────────────────────┤
│                │  结果表（列可勾选、表头点排序「本页」、行可展开看 labels/raw）   │
└────────────────┴───────────────────────────────────────────────────────────────┘
```

**不复刻**：Data view 管理、Saved objects / 保存搜索 / 分享短链、Lens、告警、Dashboard、ML、
KQL / ES|QL 编辑器与自动补全、**字段 popularity 分区与虚拟滚动**、sample size / 采样档位设置。
逐条理由见 §9.4。

### 9.3 借什么（按优先级；每条带落点 / 契约影响 / 诚实边界）

| # | 借 Kibana 的 | 我们的做法（落点） | 契约影响 | 诚实边界 |
|---|---|---|---|---|
| 1 | **字段侧栏**（Available / Popular / 类型 / 点选） | 复用 `/fields`（已**不截断**、已剔容器行、已标 `conflict`）。分区：**「这一页命中的」**来自当前页 `lines[].labels` 的键 / **「其余可用字段」**来自 `/fields` / **「有类型冲突的」**来自 `conflict: true`。点字段 → **加一列** 或 **加一条筛选**（两个动作**分开**，不猜）。**已落地**（2026-10-17 面板第十刀 / 第十二刀）：结果区左侧一块 **340px 浮层**（元信息行「字段」开关点开，**不占布局宽度**——结果表始终整行、正文 577px；高度跟结果区走；点面板外或再点「字段」收起；收起时不拉 `/fields`），三分区 + 过滤；命中区「列 / 筛」，其余与冲突只有「筛」（它们没有逐行值，见右栏）。**行内排版是三列网格**（2026-10-17 第十九刀）：名字 / 计数（右对齐 + `tabular-nums`）/ 动作（常驻描边的 26px 胶囊），分区标题 `position:sticky`，过滤框带放大镜与「有内容才出现」的 ×。判据是**对齐**而不是好看：flex 时代计数列每换一个数字宽度就变（18~21px），一列字段读下去是锯齿，而两个 21px 的动作条与字段名连成一片、看不出能点。**职责剥离与收束**（2026-10-17 第二十五 / 第三十刀）：元信息行「字段」打开的是**选列**面板——只列本页命中
（列要有逐行值），每行一个勾选框，名字静态不可点。选列这边每个字段是**勾选框**（2026-10-17 第二十六刀）：
整行是 `<label>`，点名字 / 数字 / 勾选框都算选它，勾选框是真的 `<input type=checkbox>`
（键盘空格与读屏都不用另写），选中色走宿主中性 brand；满员时未选的行禁用、已选的仍可取消
（`columnPickState` 四个态：`ok` / `picked` / `limit` / `bad`）。判据是「面板只剩一个用途时，
它唯一那颗按钮该长得像选中，而不是一个叫『列』的命令」。**筛选不再有弹层**（2026-10-17 第三十刀）：
筛选行是一条**两格输入框**（左格字段、右格值），选定字段即自动张开右格并拉 top 8 值；
两格都能手打（`choiceMove` 允许 −1 = 没选中，回车取打的那串字），Backspace 在值格有字时删字、
空了退回字段格（`filterBoxBack`）。**值下拉摘掉本字段自己的那条筛选**（2026-10-18 第三十一刀）：
带着它的话聚合只在「字段 = 当前值」里算，候选永远只有它自己，换值只能先删芯片——
真机上打开正在筛的字段，候选从 1 条变成 8 条；摘掉之后那些数不再受本字段约束，下拉顶部写明口径。
**换字段（点候选或手打左格）清空右格**：值属于字段不属于那一格，不清的话 `host.name` 打的
`node-1` 会被安到 `container.name` 上、回车静默筛错（第三十刀那条「别吞掉用户打的字」是错的）。
值行右缘只画**相对长短的条**、条数进 `title`——那个数与原命中数是两个瞬间量出来的
（真机 15242 vs 15199），并排摆必然被读成算错了。撤掉了「＋ 筛选」那颗按钮与整块筛选弹层——它们与这一格做的是
同一件事，而条件的形状本来就只是「字段 = 值」两个词；`panelToggle` 与「两个入口换锚点」那套判据
随之删除。弹层里还成立的判据（top 值带计数、点值直接筛、手填长尾值、按父路径分组）一样进了这一格。
**tree 层次**（2026-10-17 第二十九刀）：组体左挂 `.5px` 竖向导轨、相对组头缩进（真机 145 → 162）。
第二十七刀那条「组体不许 padding-left」的守卫随之改成「左边距与左内边距等量 + 必须有导轨」。**缩进是同一个数字**（2026-10-17 第二十七刀）：组头箭头与行勾选框
同占 `16px` 前导槽、`gap:4px`，组体不自己缩进——真机上原来两处是 10px+4 与 16px+6，再叠一层
`padding-left:14px`，箭头与勾选框差 20px、名字与组名差 28px；现在两条竖线偏差全为 0。判据是「剥掉筛选之后另两个分区整个消失」——它们存在的唯一理由
就是给「筛」提供字段；真机 92 → 35 个字段、1470px → 1278px。
**点字段看值**（2026-10-17 第二十四刀）：字段名是开关，点开就地列出该字段的 top 8 值（计数 + 条），
点值即 `drillDown`（与榜 / 行标签 / 手填值同一条）。请求体与榜共用 `facetsEnvelope`（值必须是**这一屏**的子集）；
缓存键 = 字段 + 来源 + 窗口 + 查询串 + 筛选（同一条件只问一次，条件一变旧答案自动失效）；空值行不给点；
来源不支持聚合时**不发**请求。判据是「按字段筛只有手打值这一条路」——真机上没人记得住值的确切写法。**可读性**（2026-10-17 第二十三刀）：长末段（`com_docker_compose_project_environment_file`）在每个 `_` / `-` / `.` 之后
给 `<wbr>` 断点，断在「词」上而不是被 `overflow-wrap:anywhere` 从词中间切开（真机：`com_docker_compose_config-hash`
曾被切成 `conf` / `ig-hash`）；面板宽 340px（`FIELD_PANEL_WIDTH`，CSS 与右缘对齐共用一个常量），
折行的字段从 10 个降到 6 个；脚注收成一行短句（真机上 464px 的句子塞进 284px 的格子、被省略号切断），完整那段进 `title`。**过滤与分组**（2026-10-17 第二十一刀）：过滤是**多词 AND**（空白分词、每词都要命中，`cont name` 能筛到 `container.name`），搜索时报**命中几个**并自动展开全部组；字段按**父路径**分组（`container.labels.foo` → 组 `container.labels`）、组头带计数、**行内只写末段**。判据是两处真机读数：92 个字段里 **58 个是 `container.labels.*`**（一层平铺让 3 个有用字段与 58 个 Docker 标签混排，长名折 2~3 行），以及过滤框是**唯一**的导航方式却只认一整串子串（打 `container name` 得到 0 个）。默认展开规则：有过滤词全展开；无过滤词只展开**命中区**（那是真在用的字段），其余与冲突折叠——滚动高度 2878px → **1494px**。面板内另有**已选列**一格（列芯片画在结果表上方，而面板浮在它上面，从面板点「列」时芯片被挡住）。**面板跟着按钮走**（2026-10-17 第二十刀 / 第二十二刀）：`position:fixed` + **按下触发它的那一刻**那颗按钮的视口坐标；遮罩同步改全屏 `fixed`——判据与第十七刀的读数条同一条：能打开它的东西和它本身必须在同一处。**入口只剩一个**（第三十刀：筛选行那颗「＋ 筛选」退场，面板只属于元信息行的「字段」，横向仍右缘对齐）。定位判据提到纯函数 `panelPlacement`（有单测）：优先往下开，下面放不下**上翻**，两边都放不下（真机 816×782 上常态——面板想要 520 而上下各剩 300 多）则**收高度**、位置仍贴着那颗按钮；**不许**为了「整块留在屏幕里」把面板挪到屏幕中央，那会反过来盖住触发它的那颗按钮 | **无**（`/fields` 形状不变） | 「命中」只代表**这一页**（被 `limit` 截断过），界面上就写「本页」；**不做** Kibana 的 sampled popularity（那要额外聚合）。大字段表（历史上那台全集群通配来源 45KB / 上百字段）用**子串过滤 + 滚动 + 「共 N 个」**消化，不引虚拟滚动——与字段浮层同一条既有判据（§3.1 / ROADMAP 的「字段清单不再截断」）。**列只能加命中区的字段**（行模型只带 `labels`，每行至多 20 个标签）；其余字段能筛、不能加列 |
| 2 | **结果表 + 行详情** | 行渲染从「时间/级别/正文」扩成**列集**（列可勾选）；行**展开**看 `labels` 表与 `raw`（ES 侧是 `JSON.stringify(_source)`，Loki 是原文）。**已落地**（2026-10-17 面板第十刀）：列集最多 4 列（值取 `line.labels[field]`，缺值画 `—`，芯片上 × 去掉）；行展开看全部标签 + 原文；P6 第六刀的「1 个身份标签 + ＋N」保留在行上（标签只显示值，字段名在悬停里）。有额外列时行改成固定列宽模板（正文 198px 下限），窗口不够**横向滚动**——不让正文被挤成 0 宽。行上消息默认 3 行（完整体在展开的详情里），整行可点展开 | **无**——`raw` 与全字段 `labels` **已经随 `/query` 响应回来**（`SearchOutcome.lines` 直接透传），零宿主改动 | raw 可能含敏感字段（与 docker「投递给 Agent 时留意凭证」同一条态度），行详情里写一句；**超长截断并明说「已截断」**（`rawPreview`，2 万字符 + 报原长） |
| 3 | **筛选芯片行**（filter bar） | 已有「字段 = 值」芯片 + `×`（P6 第三刀）。补两格：**从行上的标签值直接加筛选**（点 `labels` 里的值）——**已提前落地**（2026-10-16，与点榜下钻复用同一个 `drillDown`）；**临时停用某条筛选**（界面侧 mute 列表，**不下发**）还没做 | **无**（mute 是纯客户端状态；`filters` 仍是 `Record<字段,值>`） | **停用不是删除**：芯片上要能看出「这条没生效」；**一个字段只有一条值的约束不变**（§3.1 那条「两条并存会静默盖掉一条」） |
| 4 | **时间选择器**（相对 + 绝对 + 快捷档） | 面板加**绝对时间输入**（ISO 8601 / `-30m` / `now`） | **无**——宿主**早就收了**：[src/query.ts](../src/query.ts) 的 `asTime` + [src/tools.ts](../src/tools.ts) 的 `from`/`to` schema（`oneOf` number\|string），面板只是没暴露 | **不带时区的写法按本机时区解释**（`asTime` 既有口径），界面上写明。`custom` 档已为「点柱放大」存在，两处**共用同一份**「说的=做的」判据（`pure.js` 的 `windowProblem` / `queryProblem`） |
| 4b | **级别筛选**（Kibana 把它放在查询栏里） | 下拉「不限 + 六档」，走宿主**既有**的 `level` 入参。**已提前落地**（2026-10-16） | **无**（`level` 早就在 `/query` 与 `loglens_search` 的入参里） | **它是页内筛**：宿主在返回的这一页上过滤，`counts` / `truncation` 仍是未筛的整页（`src/execute.ts` 的既有口径）——界面上**必须**说出来，否则「这一页里的 error」会被读成「窗口里一共多少 error」 |
| 5 | **Auto refresh** | 面板侧定时器**重跑同一次查询**：相对档每 tick 以**当前时刻重算窗口**（窗跟着走）；绝对档 / 放大档**重查同一段**（窗口不跟，界面上写着这句） | **无** | 在途跳过、标签不可见暂停、失败**不吞**（沿用既有错误行）；**不做** Kibana 的「刷新时保持时间窗比例」等花样；间隔档位**固定几档** |
| 6 | **直方图与结果联动** | P6 第五刀已打底（点柱放大到那一档 + 高亮 + 被夹提示）；**取消已落地**（2026-10-16 第七刀）：点高亮那根回到放大前那一档（`zoomFrom` 记住原档，连点之后也回到**最初**那档） | **无** | 空桶**不给点**；被下限夹过**必须说**（都已落地并有守卫）；取消时**不许**替用户挑一档——`from` 认不出就什么都不做 |
| 7 | **字段统计**（Field statistics 页签） | **只借能借的那半**：选中字段后复用 `/facets` 的 `by=<field>` 看 top values，**连 `otherCount` / `countErrorUpperBound` 的原话一起照抄** | **无** | `min` / `max` / `cardinality` / `percentiles` 要**新聚合** → 归 **P8-丁**（要先问） |
| 8 | **本页排序** | 元信息行一颗**三档循环**的入口（时间 / 级别 / 正文），按钮上写着当前档；悬停说明自己先写明「本页」。**已落地**（2026-10-17 面板第十三刀）：判据在 `pure.js` 的 `sortLines`——`time` 是**宿主原序**（唯一与翻页游标同源的顺序，不许按 ts 重排），`level` 从重到轻且无级别垫底、同档保持原序，`message` 按正文；选择记 `localStorage`（`loglens.sort`），排序**不发请求**、不进「条件改了」的判据 | **无** | **不是** Kibana 的服务端排序（那要动 `NormalizedQuery`，见 §9.5 的 P8-丁）。**排序一页**与「排序全部命中」是两件事，界面上不许混——入口的悬停说明就是那句话的落点（真机第一版漏了这层，拼出「排序：排序：时间」） |
| 9 | **最近查询 / 列集记忆** | `localStorage`（照 docker 存「上次目标」的先例）：列集、自动刷新间隔、最近若干条查询串 | **无**（**不写** profile 配置，**不动** settings schema） | **只在本机浏览器里有效，不跨设备同步**——写下来 |
| 10 | **导出**（可选，低优先） | 纯客户端把**当前页**导出为文本 / CSV | **无** | 只导这一页，标题与文件名里**写明** |
| 11 | **动作按钮的图标** | 元信息行四颗动作（字段 / 紧凑 / 排序 / 清空）用**宿主自己的图标**（路径逐字取自 `dsh-web-frontend` 产物）+ 短标签。**已落地**（2026-10-17 面板第十八刀） | **无** | 图标必须是宿主原件、不是自绘近似（同 2026-10-13 的 chevron 那条）；浏览器半体不许 import 宿主模块，所以是**内联 path** 而不是组件复用。排序按钮上只剩档位名——「这是排序」由图标说，完整口径仍在 `aria-label` / `title` |
| 12 | **版面分区与折叠** | 面板的竖向分配：来源配置**收起成一行摘要**（插件整页默认收起、设置卡默认展开），查询区**两行**（查询串独占剩余宽度；时间窗/级别/条数/分组字段同在第二行），元信息**两层**（计数+按钮 / 宿主 warning 长句），图表在结果**上方**。**已落地**（2026-10-17 面板第十五刀） | **无** | 判据是**比例**不是观感：改动前 816×782 上量到面板 1055px > 视口 782px，其中来源配置 ~300px（28%）。收起态**不渲染**那几行（不是 `display:none`——那会让读屏继续念一个看不见的表单）；`warnings` 只换住处、**一个字不删**（agent 工具看得到的东西面板也得看得到） |

### 9.4 明确不借（连同理由）

| 不借 | 理由 |
|---|---|
| **KQL / ES\|QL 编辑器与自动补全** | KQL 与我们的 `query_string` 是**两种方言**，写转换器就是「统一 DSL」——正是 §1 的**非目标**。ES\|QL 要 ES **8.11+** 与 `capabilities().queryLanguage` 的真实分档（现在是诚实的 `lucene`）→ 归 **P8-丁**，且**必须先真机验收** |
| **数据视图（Data view）管理** | 我们的等价物是「来源 + 索引表达式」，**已经在设置卡片里**；再来一层只会多一份**会漂的范围判据**（而「来源回显解析后的索引表达式」正是真机反馈第四批要解决的） |
| **保存搜索 / Saved objects / 分享短链 / 告警 / Dashboard / Lens / ML** | 另一条产品面，**无运行期反馈** |
| **字段 popularity 分区与虚拟滚动** | 要额外聚合 / 自造渲染件；先用「子串过滤 + 滚动 + 共 N 个」消化长度（与字段浮层同一条既有判据）。**若真机上千字段卡顿再单开一刀，且必须有实测数字** |
| **sample size / 采样档位设置** | 我们的「截断」信号已经诚实地报在 `counts` / `truncation` 里（§3.3），再给一个采样档等于把「知道」说成「不知道」 |

### 9.5 数据流与契约影响

**P8-甲 / 乙 / 丙：零宿主改动。** 全部走**既有四条路由**（`/config`、`/query`、`/fields`、`/facets`）
与既有形状；新增的只有**浏览器侧状态**（列集 / mute / 自动刷新 / 最近查询）与 `pure.js` 的纯函数。

**新增挂载点（P8-甲，唯一要问的一项）**：客户端 apply 里
`ctx.inject(['sidebarRightTabs','sidebarRight'], …)` 注册标签类型 + body；
**`dsh.client.inject` 保持 `[]`**——跨包浏览器侧服务的接线**在运行期、不在 manifest**（§8 已实测：
全仓 `dsh.client.inject` 都是 `[]`，包括已在消费 tty 服务的 docker）。
拿不到服务时**安静退回卡片**（不抛错，否则客户端 apply 崩 = 整个插件起不来）。

**P8-丁（要先问，独立一轮）**：
`NormalizedQuery` 加 `sort`、`FacetsSpec` 加 `min`/`max`/`cardinality`、
`capabilities().queryLanguage` 分档到 ES\|QL —— **每一处都要同步改 `capabilities()` ↔ 实现的对账守卫**
（[test/capabilities.test.ts](../test/capabilities.test.ts) 的判据：**声明了就必须真有那根接线**，
Loki 的 `follow` 说过没做，就是那条守卫抓的）。

**跨包一行**：[search/src/index.ts](../../search/src/index.ts) 的 `PANEL_DIRECTORY` 里 loglens 那条
**描述已经过期**（写着「面板侧只有来源清单与开关；查询走 agent 工具」）——工作台落地后要同步。
改它属**跨包改动，进先问清单**；守卫 [panel-registry-names.test.ts](../../search/test/panel-registry-names.test.ts)
只查 `registryName`，**描述不在它的判据里**（所以不改进先问清单就会静默过期）。

### 9.6 边界与失败模式（每条都要有归宿）

| 情形 | 归宿 |
|---|---|
| 老宿主 / 无 `sidebarRight` / 插件禁用 | 卡片保留今天的查询区；禁用时四条路由只留 `/config`（既有口径） |
| **标签是会话作用域**（切会话标签消失） | 照 docker 的既有做法：**粘性意图 + `sidebarRight.registerCloseHandler(kind, …)` 收「用户点了 ✕」**，不重造机制。这需要 `sessions` 服务，**拿不到就退化成「不粘」**（面板本身照常） |
| 大字段表 | 侧栏用**过滤 + 滚动 + 「共 N 个」**，不引虚拟滚动；`/fields` 全量拉的代价照旧写在文档里（45KB 那份读数） |
| **无聚合能力的来源**（Loki） | 字段侧栏**可用**（`fields: 'discovered'` 的标签清单）；直方图 / 统计**不画**，且沿用 `supportsAggregation` 的**三态**：`undefined` = **不知道 → 什么都不说**，**不许写成「不支持」**（§3.1 那条「不知道 ≠ 不支持」） |
| 自动刷新 | 在途跳过、标签不可见暂停、绝对窗口**不跟着走**（写明）、错误照旧落在既有错误行 |
| 行详情 | raw **超长截断 + 「已截断」**；提示可能含敏感字段 |
| 空值 / 近似性 | `filters` **表达不了「字段缺失」** → 空值桶**不给下钻**（既有判据）；`otherCount` / `countErrorUpperBound` 的**原话照抄** |
| 样式 | 新控件走**既有 token 与配方**：发丝线 `0.5px`、圆角取六档 token、按钮族几何一致、可点行照 `.ll_groupRowBtn`、胶囊配 `corner-shape: round`；**新类名避开 `*btn*` 命名**以免被几何一致性检查卷进来（[scripts/client-style-spec.mjs](../../../scripts/client-style-spec.mjs) 的 `BUTTON_CLASS = /btn/i`——P6 第五刀的柱子就是这么避开的） |

### 9.7 验收口径

| 面 | 怎么验 |
|---|---|
| **纯函数** | `pure.js` 新增判据**逐条单测**（分区 / 列集 / mute / 排序 / 相对窗口重算 / localStorage 形状），**每条配反例**（拆掉判据必须变红） |
| **渲染树与请求体** | `scripts/client-smoke.mjs`（**无浏览器**：断言渲染树与请求体）。这一层是 P8-甲…丙 的**主证据**——工作台每一期都要有「点一下 → 请求体恰好是什么」的断言，照 P6 各刀的既有写法 |
| **真机** | 临时 profile（**真 `DSH_HOME` 的副本**，跑前跑后**源 profile 指纹逐字一致**）、**真 ES**、**真 Chrome**，逐条给读数；产物含内网标识一律**移出仓库到 `/tmp/`**，文档里脱敏（照 [docs/agent-real-test.md](../../../docs/agent-real-test.md) 与本包既有真机记录） |
| **闸门** | 每期落地都要 `pnpm typecheck && pnpm build && pnpm test && pnpm aggregate` 全绿、`client-lint` 通过、`check-i18n` 键集一致；产物（`lib/`、`client.js`）**同批提交**（产物闸门 `scripts/check-artifacts.mjs` 比的是**工作树 vs 索引**，一批未提交改动上它必然报「落后」，那不是漂移的证据——提交时的比较才是真判据） |
