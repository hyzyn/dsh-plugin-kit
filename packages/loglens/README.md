# @hyzyn/dsh-loglens

中文 | [English](README.en.md)

> DSH 的日志查询面板：把 Elasticsearch / OpenSearch / Docker 归一化成**一个查询面**——同一张卡片里查、看趋势、按字段下钻；agent 侧是 `loglens_*` 只读工具。

可查后端：**Elasticsearch**、**OpenSearch**。Docker 不另做适配器，作为**采集来源**指向现成的
`docker_logs` / `docker_logs_grep`。**Loki 本版不从界面提供**（适配器与真机验收成果都在仓库里，
但它的能力闸没在真机上验过）——判据与恢复方式见 [§ 已知限制](#已知限制)。

![日志查询卡片：ES 来源上的一次查询——查询串与按方言给的可点例子、筛选芯片、时间分布（带时间刻度与峰值）、结果行（级别染色 + 身份标签）](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-loglens-query.png)

## 特性

- **薄适配器 + 单一执行层**：[src/backends/](./src/backends/) 含三个适配器（Loki / ES / OpenSearch；
  ES 与 OpenSearch 共用一份实现，按 `flavor` 分流），Docker 不是适配器而是采集来源。归一化与夹取只在
  [src/query.ts](./src/query.ts) 一处（时间戳单位、窗口上限、`limit`、方向、游标透传），适配器不得重复夹取；
  面板与 agent 工具共用 [src/execute.ts](./src/execute.ts)，行模型与截断信号同源。
- **能力自述驱动**：适配器实现 `capabilities(): BackendCaps`（`queryLanguage` / `pagination` /
  `aggregations` / `follow` / `maxPageSize` / `maxWindowMs` / `fields`），UI 渲染与参数夹取均以自述为准，
  面板不按类型推断图表能力。自述为 `true` 的位必须有实现，由 [test/capabilities.test.ts](./test/capabilities.test.ts)
  逐适配器对账（Loki 的 `follow` 因此为 `false`）。
- **计数与截断为契约字段**：`LogCounts.totalKnown` 仅在存在精确总数时为真（ES 侧须开启 `track_total_hits`，
  `relation === 'gte'` 时置假）；截断由 `Truncation.reasons` 枚举表达，其中 `hit_limit`（确定还有）与
  `hit_limit_maybe`（可能还有）是两个独立理由，`cursor_expired` 与二者分离（游标过期不蕴含「还有更多」）。
- **游标为后端私有编码**：Loki 以**完整 ts 组**为坐标（同纳秒多行不可切分，见 `loglens D03`）；ES / OS 用
  PIT + `search_after`（同一快照，过期回 `cursor_expired` 且不静默重开）。`decode` 校验版本与来源，解不开即报错。
- **归一化行模型**：时间统一为 epoch 毫秒；级别归一到 trace…fatal，并区分「文档标注的级别」与
  「由正文推断的级别」（`levelInferred`），两种可信度不合并；嵌套字段摊平为点分标签；正文高亮
  使用后端返回的**字符区间**（`line.highlights`），界面不对查询串做字面匹配。
- **默认只读、出站限于已配置来源**：五个 `loglens_*` 工具**全部**归 **read** 档；[src/net.ts](./src/net.ts)
  的围栏按**解析后的 IP** 判定（链路本地与云元数据地址拒绝），不跟随重定向，单次请求上限 8 MiB、
  超时默认 20s（`NET_MAX_RESPONSE_BYTES` / `NET_DEFAULT_TIMEOUT_MS`）。完整边界见「已知限制」。

## 安装

```bash
dsh plugin --profile web add @hyzyn/dsh-loglens              # npm 安装（发布后）
dsh plugin --profile web add link:$(pwd)/packages/loglens    # 仓库开发调试
```

聚合包 `@hyzyn/dsh-all`（或仓库根 bundle）已包含本插件，一次装齐时不必单独 add。装完重启 `dsh web`，
设置 → 插件配置 里出现「日志查询」卡片（**保存即热生效**，无需重启）。

> 已在 web profile 里装过 `@hyzyn/dsh-all` 或根 bundle 时**不要**再 add 本包，
> 否则插件行重复挂载，启动报 `duplicate loader entry id`。

## 使用

配置存在当前 profile 的 plugin entry 上（`settings.update('loglens', …)` 的 volatile 路径）。**来源配置**在插件
整页里默认收起成一行摘要（`2 个来源 · 当前 一` + 「编辑来源」），设置卡里默认展开；收起时**不渲染**那些行。

### 查询

- **来源**、**查询串**、**时间窗**（15m · 1h · 6h · 24h，外加点柱放大时的「自定义」一档）、
  **级别**、**条数**都在查询区；查询串独占整行剩余宽度，其余集中在第二行。
- **回车即查**：查询串与条数两个框里按回车等于点「查询」（按钮灰着时回车也发不出去——同一个条件）。
- **查询串支持字段名补全**：打字时候选浮层列出这个来源的字段（前缀命中排前面，最多 20 条，
  `FIELD_COMPLETION_MAX`），点一条原位补成 `字段:` 并把光标摆到冒号后。补全不自动查；字段清单按来源
  缓存（一次会话一次）。候选是**卡片自己画的浮层**，不是原生 `datalist`。
- **级别**有七项（`不限` / `trace+` … `fatal`），用的是宿主**既有**的 `level` 入参。`warn+` 就是
  「warn 及以上」——`+` 只是缩短标签，完整口径写在同行的边界说明里。注意它是**页内筛**：宿主在返回的
  这一页上过滤，计数与截断提示仍是**未筛的整页**，界面上写着这句。要按级别看全量得后端**真有级别字段**：
  ES 上 `log.level` 常常整列是空的（级别从正文**推断**，行上有 `levelInferred`），那种来源连分组榜也拿不到级别。
- ES / OpenSearch 的查询串**原样**交给 `query_string`，面板不改写：留空即全量（`match_all`）；
  `"短语"`、`a OR b`（**空格分隔的词默认是「或」**，要「与」得写大写 `AND`）、`name*` 都按 Lucene 走。
  `level:ERROR` 常回 0 条不是坏了——这套索引里 `log.level` 多半为空，按级别筛请用级别下拉。
- **三个最容易误判的写法**（写错了**不报错、只是数字不对**）：
  - **方括号是区间语法**，不是「一个字面量」：`[ERROR]` 会被 Lucene 当成区间表达式，行为与
    「含 ERROR 这个词」**不是一回事**。要精确匹配这个词，写 `"ERROR"`（短语）或 `message:ERROR`。
  - **`=` 没有特殊含义**：`level=error` 不是「字段等于值」，多半被当成两个普通词（默认 OR）。
    真字段筛选请用 `字段:值`（`log.level:ERROR`）或面板的筛选行。
  - **大写 `AND` / `OR` / `NOT` 才是运算符**，小写是普通词。
  三条合起来解释了同一个窗口里 `[ERROR]` 与 `level=error` 命中数差一倍：**不是分词拆错了**，是两者都
  不是「精确匹配 ERROR」；要可复现的口径就用 `"ERROR"`（短语）。
- **占位提示与可点的例子都按来源方言给**：Loki 是 LogQL、ES / OpenSearch 是 Lucene（`query_string`）。
  ES 的例子是 `error` / `"Failed to"` / `error AND failed` / `stream:stderr`，Loki 是 `{job="app"} |= "error"`
  这类——点一下**填进框里、不自动查**。例子本身不翻译（它是代码不是文案）。
  ⚠️ **Kibana 的 Discover 默认是 KQL，不是 Lucene**：本面板是 Lucene，「且」写**大写** `AND`。
- **查询串写错时能看到原因**：ES 对分片级错误回 `HTTP 200`，原因在 `_shards.failures[].reason` 里——会带成
  一行 `[分片] <ES 原话>` 摆在结果上方（`q=level:(ERROR` → `Failed to parse query [level:(ERROR]`）。
- **条件改过、结果还没重查时界面会说出来**：结果区顶上一句「下面这份还是上一次查询的」，同时收起
  「下一页」并禁用「分组」——ES / OpenSearch 的游标是 PIT + `search_after`，拿旧游标配新条件翻页
  **不报错、只静默少行**。先点「查询」把两边对齐。

### 结果区

- 结果列表是时间到毫秒 · 级别 · 正文；正文里命中的那几段高亮；有游标时给「下一页」（按 id 去重）。
- **无级别的行会标 `↳`**：采集侧没配 `multiline` 时，一次异常会被拆成多个文档，只有首条带级别，
  其余是 `\tat …` / `Caused by:` / `### Error querying` 这类**续行**。它们不该被算进任何级别，所以
  行首标 `↳`，且**按级别筛时会单独报出「其中 N 行是堆栈续行」**——否则它们静默消失，error 数看起来
  就偏小。判据只认堆栈语法，宁可漏标。
- **级别推断覆盖真机里出现过的形态**：`[ERROR]` 前缀、`level=ERROR` / `log.level":"info"`（logfmt 与
  JSON 两种）、logback 的 `18:31:54,850 |-INFO in …`、以及 logback 的 `14:00:00.123 ERROR 12345 ---`。
- **行上只有一个身份标签**（宿主顺序第一个，通常是容器名），只显示**值**，字段名在行悬停 / ＋N 浮层 /
  字段面板里。其余标签收在行尾「＋N」：点开列**全部**标签，点任意一条立刻筛（点背景 / × / Esc /
  一滚收起）。值本身不截断。
- **点整行**（或行首箭头）展开详情：完整消息 + 全部标签 + 原文；原文超过 2 万字符（`RAW_PREVIEW_MAX`）
  会截断并**报出原长**。
- **级别按严重度染色**：error/fatal 红、warn 橙、info 正常、debug/trace 灰，行间一条发丝分隔线。
  默认「完整」模式（正文全展开），「紧凑」开关则每条只留 3 行。
- 元信息行有四颗动作按钮：`☰ 字段` / `☰ 紧凑` / `⇅ 排序` / `🗑 清空结果`。**排序只作用于已返回的这一页**
  （宿主没有服务端排序，入口的悬停说明自己写着这句），三档循环：时间 / 级别 / 正文；默认「时间」就是
  **宿主原序**（唯一与翻页游标同源的顺序，不许按 ts 重排——同纳秒的多行是切不开的一组）。
- 「紧凑」与「排序」记在本机浏览器（`localStorage`：`loglens.density` / `loglens.sort`），换设备不跟；
  排序**不发请求**。结果区高度 `min(720px, 72vh)` + 300px 下限，窗口越高露得越多。

### 时间分布与分组榜

- 都在结果列表**上方**（先看趋势、再看行），且**只对有聚合能力的来源画**（当前是 ES / OpenSearch）。
  两份图都**来自后端聚合**，不数这一页——那一页被 `limit` 截断过，数它只会得到假的分布 / 排名。
- **时间分布**：柱下有时间刻度（首尾各一格 + 中间按窗口等分，最多 4 格；精度按窗口跨度选）。
  悬停哪一根，气泡就贴在那根正上方，写 `19:22 · 315 条 · 占 1%`；不悬停不画。
  **点一根有数据的柱子 = 放大到那一档**（窗口夹到那一段再重查，行、分布、榜一起收窄），那一档高亮着，
  下拉变成按**真实范围**现算的「自定义」；再点取消放大。**空桶不给点**；放大窗口有 **1 分钟下限**，
  被它夹过会明说一句。相邻桶之间的空档**补 0**。
- **数据挤成一条平带时改用基线裁剪**：最大 / 最小 ≥ 3 走线性，< 3 从 `min × 0.9` 起画并**明说**
  「柱高只表示相对高低，不是与条数成正比」；全一样时不裁剪也不写那句。判据在 [pure.js](./client-src/pure.js)
  的 `histogramScale` 头注释里。
- **分组字段由用户给**（面板**没有默认字段**——各家索引的字段名不一样，猜一个等于替用户伪造范围）。
  点开那一格看当前来源的字段名候选：宿主默认只列前 **200** 个（超出时 `truncated: true` + 那句
  「默认只列前 200 个（共 N 个）」的警告照抄在页脚；同来源不重复拉）。候选里只有能用的名字：
  `object` / `nested` 这类没有自己值的容器行不列；同名在不同索引里**类型不一致**的标「类型冲突」。
- **榜不写合计**：列出来的桶加起来不是命中总数，没列出来的由宿主警告原话回报（「还有 N 条落在没列出来的
  桶里」）；桶计数是近似值时同样照抄那条警告。空值键（文档缺这个字段）显示成「（空值）」，不是无名横条。

### 字段面板

- 元信息行的「字段」按钮点开一块 **340px 浮层**（`FIELD_PANEL_WIDTH`；高度跟结果区走，字段列表自己滚），
  结果表始终整行宽。点面板外或再点一次「字段」收起；**收起时不拉 `/fields`**，展开才拉一次（同来源缓存）。
- 面板里从当前页的 `labels` 数出**本页命中**的字段（带出现行数），**只画这一区**（列只能从本页命中加）。
- **过滤是「多词 AND」**：空格分词、每个词都要命中，所以 `cont name` 和 `container name` 都筛得到
  `container.name`。搜索时右上角报**命中几个**，并**自动展开全部分组**。
- **字段按父路径分组**：每组一个可折叠的组头（写父路径 + 计数），行里只写末段，完整名在行悬停的
  `title` 里。长末段断在 `_` / `-` / `.` 之后（不是词中间）。
- **每个字段是一个勾选框**：整行可点，最多 4 列（`RESULT_COLUMN_MAX`），满员后未选的行变灰禁用
  （已选仍可取消）。有额外列时按列宽排布：正文 198px 下限，窗口不够就**横向滚动**。
- 面板里还有一格**已选列**：列芯片画在结果表上方，而面板浮在它上面——这一格把同一个列集摆在面板里。

### 筛选与下钻

- **点榜上一行就是按它下钻**：加一条结构化筛选（宿主契约里的 `filters`）再查一次，行、时间分布与榜
  **一起收窄到同一个子集**；再点取消。行上的身份标签走同一条 `drillDown`，不必先填「分组字段」。
- 筛选是**一条两格输入框**，芯片排在更前面：

  ```
  筛选  [container.name ▾] = [prometheus ▾] [确定]
  ```

- 左侧字段选定后，右格自动张开并拉该字段 top 8 值（`FIELD_VALUES_SIZE`；每行一条**相对长短**的条，
  具体条数在悬停里——它与页面命中数是两个瞬间量出来的，并排摆会被读成算错了）。
- **换字段会清空右格**（值属于字段，不属于这一格：不清的话 `host.name` 打的 `node-1` 会被安到
  `container.name` 上，回车就静默筛错）。
- 一个字段**已经在筛**时打开它的值下拉，仍列得出别的值——请求会摘掉这个字段自己的那条筛选，下拉顶部有
  说明。选中一条就按「字段 = 值」立刻重查；筛选也能在芯片上用 `×` 去掉。**一个字段只有一条**；值
  **不做 trim**（键名里的空格是内容的一部分，裁掉就静默筛不到东西）。
- **空值那一桶不给点**：筛选表达不了「字段缺失」，给个点得动的入口只会筛出别的东西。
- **Loki 不支持结构化筛选**（宿主会原话报错）——用它时把条件写进 LogQL 查询串；界面上那一行也写着这句。

### Docker 来源

选中 Docker 来源，整张卡片换成**容器日志区**：**选中这条来源就自动拉容器**（换 Docker 目标会重拉，
同一目标不重复），选容器 / 时间窗 / 行数 → 看日志，走 Docker 面板插件自己的路由（相对路径）。

- 容器起停之后清单才会变，所以主行**不摆**刷新按钮——重拉入口与失败 / 空清单态的「重试」/「刷新」
  都收在容器候选浮层的页脚。拉清单失败**只落在那一格**（不动卡片顶部错误行；失败不留缓存，下次仍重试）。
- **换容器不会自动重拉日志**（那是一次 `docker logs`，重）：日志上方会明说「这是上一次的」。
- 这条路没有 `until`、`tail` 有上限、没有 grep；要精确检索请用 agent 侧的 `docker_logs_grep`。

![Docker 来源：整张卡片换成容器日志区——选容器 / 时间窗 / 行数 / 看日志，弱面（无 until、tail 有上限、无 grep）写在界面上](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-loglens-docker.png)

## 来源地址怎么写

| 类型 | 地址 | 说明 |
|---|---|---|
| `loki` | `http://127.0.0.1:3100` | 可以带网关前缀（如 `https://gw.example/loki`）；查询走 `/loki/api/v1/query_range` |
| `elasticsearch` / `opensearch` | `http://user:pass@127.0.0.1:9200/logs-*` | **索引表达式**：优先用那一行第 3 格下面填的「索引」；没填就用地址路径（兼容旧配置）；两者都没有则是 `*,-.*`（全部索引**但排除 `.kibana_1` / `.infini_*` 这类点号系统索引）。`loglens_sources` 会**回显解析结果**，probe 还会报「最近 15 分钟 N 条」；凭据换成 Basic 头、不进 URL；分页走 PIT + `search_after`；**ES 7.10 / 7.11 也已适配**（差异见 [ROADMAP](./ROADMAP.md)） |
| 公网地址 | 同上，直接填 | **连接面 = 你配置的来源**：回环 / 私网 / 公网一律放行；被无条件拒绝的只有链路本地 / 云元数据那一档 |
| `docker` | 第三格填 **Docker 面板里的目标名**（如 `local`），**不是** URL | 采集来源：agent 侧用现成的 `docker_logs` / `docker_logs_grep`；面板侧走 Docker 插件自己的 `/api/dsh-docker/config`（拉目标清单）+ `/containers` + `/logs`（相对路径），弱面：无 `until`、`tail` 有上限、无 grep |

## agent 工具

配好来源之后，agent 用这几个工具查（**名单以 [src/tools.ts](./src/tools.ts) 的注册处为准**）。它们**全部**归
**read** 档（分类表见 [docs/permission-tier-plan.md](../../docs/permission-tier-plan.md) §2.1）。注册面随配置收窄：
**零来源时只注册 `loglens_sources`**（其余四个此刻调用必然报错）；全配 Loki / Docker 来源时再少一个
`loglens_facets`。来源清单一变（面板增删、settings 热更新），注册面跟着重建。

| 工具 | 作用 |
|---|---|
| `loglens_sources` | 列来源（含**解析后的索引表达式**与探测条数）；其他 `loglens_*` 的 `target` 取自这里 |
| `loglens_search` | 查：支持 `filters` 结构化过滤与 `level`（**及以上**语义）、`from` / `to` / `limit` / `direction` / `cursor` |
| `loglens_fields` | 看有哪些字段。**默认只列前 200 个**（总数在 `total`，截断时 `truncated: true` + 警告给下一步；要更多分段传 `limit`）。ES / OpenSearch 侧**不列 `object` / `nested` 容器行**；同名在不同索引里**类型不一致**的标 `conflict: true` 并带 `esTypes` / `conflictDescriptions` |
| `loglens_facets` | 按字段分组 / 按时间分桶（「哪个服务在报错」）；目前只有 ES / OpenSearch 有——**配的全是 Loki / Docker 来源时这个工具根本不注册**。**0 桶时会说清是哪种成因**——按「这个窗口里有多少条日志」区分「这个字段是空壳」与「这段时间没有命中」，两种情形给的下一步相反 |
| `loglens_context` | 取某一行前后的上下文（**两侧分段取**，各按 `before`/`after` 取满，所以高密度窗口里也一定包含锚点本身）。锚点按**优先级**匹配：id 精确 → 剥一个前导 `#` → 正文严格相等 → 规范化空白后相等 → 规范化空白后单向包含 → 只按 `ts`（兜底档；高档位一律压过低档位，同档取离 `ts` 最近的、并列按 id 与正文的字典序定）。渲染文本里紧跟在正文之后的 `#id` 就是那个精确坐标；非 id 档命中时会在 warnings 里说明用的是哪一档 |

**渲染文本的形态**（`loglens_search` / `loglens_context` 两条路共用）：一行是「时间 · 级别 · 正文 ·
`#id` · 标签」。三处细节都为了读得顺：

- **时间带显式偏移**：`2026-10-18T22:01:43.123+08:00`，不是 `…Z`。带偏移后 `Date.parse` 仍能解回同一瞬间
  （机器可用），人看到的也与正文一致。时区取**宿主进程**的本地时区。
- **多行正文（堆栈）保留层次**：续行加 `    | ` 前缀（正文一个字不改），超过 20 行截断并**报出**总行数与
  未显示行数，且给下一步（「把 expand 传 true 重查一次」——`expand` 只影响渲染，返回值里的 message 一直是全文）。
- **翻页有指引**：适配器给了 `nextCursor` 时，返回值与渲染文本都会带一句「把 nextCursor 原样传回 cursor
  （同一时间窗、同一 direction）」。
- **标签只平铺身份键**（`src/line.ts` 的 `LABEL_PRIORITY` 前 3 条：容器 → 主机 → 流），其余折叠成 `+N labels`
  ——**折叠不是丢弃**：完整的 labels 在返回值的 `lines[].labels` 里。

**面向模型的公告**：挂载时向 systemPrompt 注入一段具名 section（`plugin:dsh-loglens`，order 151，≤300 字符），
只写推荐链路（sources → search → context → facets）、facets 的能力门与零来源时的去处；`announce` 开关同时
管它与启动日志（关掉 = 不向任何一面自报家门）。五个工具的 schema 描述每条 ≤120 字符，细节在返回值 warnings。

## HTTP 面（回环）

**反代 / 另一台机器访问下不可用**：非本机请求一律 403 `forbidden: loopback-only`——这是刻意的，
这些路由里包含变更与执行面（带凭据的来源配置），不开放给远程会话（评估与取舍见 [ROADMAP.md](../../ROADMAP.md)
第 5 项 § 5.4）。需要从另一台机器用这块面板时走 **SSH 隧道**：`ssh -L 3080:127.0.0.1:3080 <host>`，
浏览器打开 `http://localhost:3080`——宿主侧看到的来源是回环、Host 是 `localhost`，围栏直接放行，
会话 cookie 也按该 authority 铸造。

| 动作 | 请求 | 说明 |
|---|---|---|
| 读配置 | `GET /api/dsh-loglens/config` | 返回 `{ ok, config: { enabled, targets }, plugins: { docker: true\|false } }`——`plugins.docker` 是「docker 插件在不在」的现算判据（[src/plugins.ts](./src/plugins.ts)），面板靠它决定 Docker 那一格给不给入口 |
| 开关 | `POST {"action":"enabled","enabled":false}` | **免同源证明**（禁用后设置卡片是唯一的恢复入口） |
| 新增来源 | `POST {"action":"targets.add","target":{"kind":"elasticsearch","label":"本地 ES","url":"http://127.0.0.1:9200"}}` | `kind` 取 `elasticsearch` / `opensearch` / `docker`；`loki` **宿主仍收**（适配器在），但界面上不提供——见 [§ 已知限制](#已知限制) |
| 改来源 | `POST {"action":"targets.update","id":"<id>","patch":{"url":"…"}}` | id 不可改（它是浏览器侧唯一的引用方式） |
| 删来源 | `POST {"action":"targets.remove","id":"<id>"}` | |
| 查一次 | `POST /api/dsh-loglens/query` `{"target":"<id>","q":"…","from":…,"to":…,"limit":…}` | 面板用；返回行 + 计数 + 截断信号，**形状与 `loglens_search` 一致**（同一个执行层）。可带 `filters`——面板点榜下钻时就是这么带的，`/facets` 也会带上同一份 |
| 列字段 | `POST /api/dsh-loglens/fields` `{"target":"<id>"}`（可带 `"limit":80` 收窄） | 分组字段那一格点开时自动拉（面板**不传 `limit`** → 宿主按默认上限截到前 **200** 个）；真被截了就返回 `truncated: true` 与那句警告，界面照抄 |
| 聚合 | `POST /api/dsh-loglens/facets` `{"target":"<id>","by":"container.name","interval":"5m"}` | 按字段分组 / 按时间分桶（目前只有 ES / OpenSearch 有） |

围栏（[docs/design.md](./docs/design.md) §4）：整条路由走**加固档** `isLoopbackRequestStrict`；`/config` 按
**动作**豁免——只有 `enabled` 免同源证明，targets 的增 / 删 / 改要 `hasSameOriginProof`。**`/query` / `/fields` /
`/facets` 也要**：它们只读，却会**替请求方打到已配置的内网目标**并把结果带回来。插件禁用时只留 `/config`；
地址只收 http / https 的绝对地址。

```bash
# 读
curl -s http://127.0.0.1:3080/api/dsh-loglens/config
# 加一个本地 ES：命令行没有浏览器的同源证明，自己带 Origin 头
curl -s -X POST http://127.0.0.1:3080/api/dsh-loglens/config -H 'content-type: application/json' -H 'origin: http://127.0.0.1:3080' -d '{"action":"targets.add","target":{"kind":"elasticsearch","label":"本地 ES","url":"http://127.0.0.1:9200"}}'
```

## 解剖

| 文件 | 说明 |
|---|---|
| `package.json` | `dsh.bundle.patch` 指向 `cordis.patch.yml`；`main` / `exports["."]` 指向 `lib/index.js` |
| `cordis.patch.yml` | bundle 补丁：`insert: { id: loglens, name: '@hyzyn/dsh-loglens' }` |
| `src/index.ts` | 宿主半体：`/config` / `/query` / `/fields` / `/facets` 四条路由 + 设置持久化 |
| `src/config.ts` | 来源清单的**纯**判据（id 生成 / 地址校验 / 宽松读盘 / 增删改），不碰 cordis 与网络 |
| `src/net.ts` | **出站围栏**：解析后的 IP 判定 + 不跟随重定向 + 体积与超时上限；两个适配器的所有出站都过它 |
| `src/line.ts` | 行的**可观性**：嵌套字段摊成点分标签 + 级别归一化与正文推断（标 `levelInferred`） |
| `src/execute.ts` | 找来源 / 归一化 / 拼返回形状：**agent 工具与面板路由共用**的那一层 |
| `src/backends/registry.ts` | kind → 适配器（Loki / ES / OS；Docker 按设计不进这里） |
| `src/backends/types.ts` | 后端契约的**形状**（`LogBackend` / `BackendCaps` / `LogCounts` / `Truncation`…），没有实现 |
| `src/backends/loki.ts` | Loki 适配器：`query_range` / `labels` / `ready`，摊平、合并顺序与计数 |
| `src/backends/elastic.ts` | ES / OpenSearch 适配器（`flavor` 分流）：`_search` / PIT 分页 / `_field_caps` / health |
| `src/plugins.ts` | 「某个插件装没装」的宿主侧判据：读 cordis 的 plugin registry，用来决定 Docker 那一格给不给入口 |
| `src/tools.ts` | agent 工具 + 档位分类表 |
| `src/query.ts` | 归一化与夹取：时间戳单位、时间窗上限、limit 夹取、计数与截断归并 |
| `src/cursor.ts` | 两份游标共用版本号常量；拿错适配器的游标在 decode 时被拒，解不开就报错 |
| `client-src/index.js` → `client.js` | 构建型客户端半体：设置卡片，i18n 目录内联在源码里 |
| `client-src/pure.js` | 客户端的纯逻辑（草稿合法性 / 提交载荷 / 时间窗与「自定义」档 / 分布与榜的铺图 / 点柱放大的窗口夹取 / 横轴刻度 / 本页排序三档），进 vitest |
| `scripts/build-client.mjs` · `client-smoke.mjs` | 前者打包客户端（剥 import + 内联 pure.js，残留 import 直接 `exit(1)`）；后者是**无浏览器的渲染回归**（最小 DOM / React / fetch 桩） |
| `test/` | vitest 用例（仓库根 `pnpm test` 收集 `packages/<pkg>/test/`） |

## 开发

```bash
pnpm --filter @hyzyn/dsh-loglens build       # tsc → lib/，并重建 client.js
pnpm --filter @hyzyn/dsh-loglens typecheck   # tsc + client-lint（客户端半体六条硬规矩）
pnpm --filter @hyzyn/dsh-loglens lint:client
pnpm --filter @hyzyn/dsh-loglens smoke        # 客户端半体的装载 + 渲染回归（无浏览器）
```

改代码前先读这三份（它们各自是唯一归宿，本 README 不复述）：

| 想知道 | 读 |
|---|---|
| 设计与契约（归一化行模型 / 计数与截断 / 游标 / 安全与凭据） | [docs/design.md](./docs/design.md) |
| 分期、待办，以及**逐条真机验收结论** | [ROADMAP.md](./ROADMAP.md) |
| 缺陷编号（`Dxx` 为什么那段代码长这样） | [DEFECTS.md](./DEFECTS.md) |

## 已知限制

- **出站围栏：连接面 = 你配置的来源**（[src/net.ts](./src/net.ts)）：回环 / 私网 / 公网一律放行；**链路本地与云
  元数据地址**（`169.254.169.254` 这类）**一律拒且无豁免**；**不跟随重定向**（回 3xx 时报错并回显 `Location`）。
  一次请求 8 MiB / 20s 上限（`NET_MAX_RESPONSE_BYTES` / `NET_DEFAULT_TIMEOUT_MS`）；时间窗与条数由宿主夹取并如实提示。
- 围栏判的是**解析之后的 IP**，而解析与建连是两步：两步之间 DNS 翻脸（rebinding）仍有窗口。这一层挡的是
  事故与过期的名字，不是持域名的对手。
- **翻页的取舍**：同一纳秒的行是**切不开的一组**——末组会让这一页**略超 `limit`**；末组大到补不齐时
  **不给游标**，只报「命中可能不完整」。
- **`tail`（跟随）还没做**：Loki 的 `capabilities().follow` 因此声明为 **`false`**（`stream()` 未实现）；
  声明成 true 等于指一个不存在的入口。维护者决定**暂缓**（不是被卡住）：没有消费者，理由与「要做时怎么做」
  见 [ROADMAP.md](./ROADMAP.md)。守卫：[test/capabilities.test.ts](./test/capabilities.test.ts)。
- **两种聚合都只对有聚合能力的来源画**（当前是 ES / OpenSearch）：能力由宿主随 `/query` 下发，面板不按类型猜。
  宿主**没给**能力自述时（旧版宿主）**什么都不说**——「不知道」不等于「不支持」。
- **排序只作用于已返回的这一页**：宿主没有服务端排序（要动 `NormalizedQuery`，属 P8-丁）。
- **一次只查一个来源**（v1 不做跨后端 fan-out）。
- 面板里的查询区是**受控重复**（设计 §5 三选一的最终口径，选项 1）；理由见 [docs/design.md](./docs/design.md) §5。
- **真机验收进度**：Loki 分页已验（真 Loki 3.7.8，含 `loglens D02` / `D03`），能力闸没验（见下条）；
  ES / OpenSearch 跑过若干轮只读复核；**点柱放大**的覆盖是静态检查、单测与渲染回归三层，真机上
  还没点过。逐条结论见 [ROADMAP.md](./ROADMAP.md)。
- **Loki 本版不从界面提供**（维护者决定，判据见 [ROADMAP.md](./ROADMAP.md) § Loki）：缺的是**能力闸那段
  真机验收**，不是没做——适配器、游标、`D02`/`D03` 的修复与那轮真机验收都在仓库里，宿主也仍收 `kind: loki`，
  **已存在的 Loki 行照旧如实显示与查询**。恢复＝把 `'loki'` 加回 `client-src/pure.js` 的 `KIND_OPTIONS`
  （别把 `KNOWN_KINDS` 一起删）。守卫：[test/client-pure.test.ts](./test/client-pure.test.ts) 钉住两件事。
