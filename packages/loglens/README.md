# @hyzyn/dsh-loglens

把**异构日志后端归一化成一个查询面**：Loki / Elasticsearch / OpenSearch / Docker 各走一层薄适配器，
对外只有一套「归一化行模型 + 诚实的计数与截断信号 + 交给 Agent 的工具」。

> **状态：设置面、查询地基（契约 / 归一化 / 游标）、Loki 与 ES / OpenSearch 适配器、四个 agent 工具都已就位（2026-10-11）。**
> 三条后端目前只有 **wire 级用例**（假 Loki / 假 ES 的真 HTTP 服务），**真机验收还没跑**；浏览器侧的
> 结果视图没做（P6）——卡片上也写着这句。
> 设计与契约的唯一归宿是 [docs/design.md](./docs/design.md)；分期与待办见 [ROADMAP.md](./ROADMAP.md)。

## 现在能做什么

- 在 **设置 → 插件配置 → 日志查询** 卡片里增删改「日志来源」（类型 / 名称 / 地址）与插件开关。
- 让 agent 用四个工具查（配好来源之后）：`loglens_sources` 列来源与连通性、`loglens_search` 查、
  `loglens_fields` 看有哪些字段、`loglens_context` 取某一行前后的上下文。
  可查后端：**Loki**、**Elasticsearch**、**OpenSearch**（Docker 走现成的 `docker_logs` / `docker_logs_grep`）。
  四个工具都归 **read** 档（分类表见 [docs/permission-tier-plan.md](../../docs/permission-tier-plan.md) §2.1）。
- 卡片上明写「查询能力（搜索结果视图）还没实现」——浏览器侧不提供看起来能用的假界面。

## 配置面（HTTP，回环）

配置存在当前 profile 的 plugin entry 上（`settings.update('loglens', …)` 的 volatile 路径）。

| 动作 | 请求 | 说明 |
|---|---|---|
| 读配置 | `GET /api/dsh-loglens/config` | 返回 `{ ok, config: { enabled, targets } }` |
| 开关 | `POST {"action":"enabled","enabled":false}` | **免同源证明**（禁用后设置卡片是唯一的恢复入口） |
| 新增来源 | `POST {"action":"targets.add","target":{"kind":"loki","label":"本地 Loki","url":"http://127.0.0.1:3100"}}` | `kind` 取 `loki` / `elasticsearch` / `opensearch` / `docker` |
| 改来源 | `POST {"action":"targets.update","id":"<id>","patch":{"url":"…"}}` | id 不可改（它是浏览器侧唯一的引用方式） |
| 删来源 | `POST {"action":"targets.remove","id":"<id>"}` | |

围栏（[docs/design.md §4](./docs/design.md)）：整条路由走**加固档** `isLoopbackRequestStrict`；
`/config` 按**动作**豁免——只有 `enabled` 免同源证明，targets 的增 / 删 / 改要 `hasSameOriginProof`
（跨站页面能从配置侧加一个指向内网的来源，再用读面打它）。地址只收 http / https 的绝对地址；
**私网是允许面**，链路本地 / 云元数据地址拒。

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
| `elasticsearch` / `opensearch` | `http://user:pass@127.0.0.1:9200/logs-*` | **路径部分是索引表达式**（不写就用 `*`）；凭据换成 Basic 头、不进 URL；分页走 PIT + `search_after` |
| `docker` | 不需要地址 | 采集来源（设计里的「选项 0」）：agent 侧用现成的 `docker_logs` / `docker_logs_grep` |

## 解剖

| 文件 | 说明 |
|---|---|
| `package.json` | `dsh.bundle.patch` 指向 `cordis.patch.yml`；`main` / `exports["."]` 指向 `lib/index.js` |
| `cordis.patch.yml` | bundle 补丁：`insert: { id: loglens, name: '@hyzyn/dsh-loglens' }` |
| `src/index.ts` | 宿主半体：`/config` 路由 + 设置持久化（查询面还没有） |
| `src/config.ts` | 来源清单的**纯**判据（id 生成 / 地址校验 / 宽松读盘 / 增删改），不碰 cordis 与网络 |
| `src/backends/types.ts` | 后端契约的**形状**（`LogBackend` / `BackendCaps` / `LogCounts` / `Truncation`…），没有实现 |
| `src/backends/loki.ts` | Loki 适配器：`query_range` / `labels` / `ready`，摊平、合并顺序与计数（真机验收待跑） |
| `src/backends/elastic.ts` | ES / OpenSearch 适配器（`flavor` 分流）：`_search` / PIT 分页 / `_field_caps` / health |
| `src/tools.ts` | 四个 agent 工具（`loglens_sources` / `search` / `fields` / `context`）+ 档位分类表 |
| `src/query.ts` | 归一化与夹取：时间戳单位、时间窗上限、limit 夹取、计数与截断归并 |
| `src/cursor.ts` | Loki 游标（同 ts 多行不丢行）；解不开就报错，不当作没有游标 |
| `client-src/index.js` → `client.js` | 构建型客户端半体：设置卡片，i18n 目录内联在源码里 |
| `client-src/pure.js` | 客户端的纯逻辑（草稿合法性 / 提交载荷），进 vitest |
| `scripts/build-client.mjs` | 客户端打包：剥 import + 内联 pure.js；发现残留 import 直接 `exit(1)` |
| `test/` | vitest 用例（仓库根 `pnpm test` 收集 `packages/<pkg>/test/`） |

## 开发

```bash
pnpm --filter @hyzyn/dsh-loglens build       # tsc → lib/，并重建 client.js
pnpm --filter @hyzyn/dsh-loglens typecheck   # tsc + client-lint（客户端半体六条硬规矩）
pnpm --filter @hyzyn/dsh-loglens lint:client
```

## 安装到 DSH

```bash
dsh plugin --profile <profile> add link:$(pwd)/packages/loglens
```

## 已知限制

- **真机验收还没跑**：三条适配器都只有 wire 级用例（假服务器）；真 Loki / 真 ES 上的行为（尤其是 Loki
  同 ts 多行的顺序稳定性与 ES 的 PIT 寿命）要等有环境时补（见 [ROADMAP.md](./ROADMAP.md)）。
- **浏览器侧没有结果视图**：面板里只有来源清单与开关，查询走 agent 工具（P6 三选一还没拍板）。
- 一次只查一个来源（v1 不做跨后端 fan-out）；公网与链路本地地址默认禁。
- **Docker 目标只做指路**（选项 0）：查容器日志请用 `docker_logs` / `docker_logs_grep`，本插件不包一层；
  面板里那种「在 loglens 卡片里直接看容器日志」的视图没做（P6）。
- Docker 只作为**采集来源**（设计里的「选项 0」：用现成的 `docker_logs` / `docker_logs_grep`），不做适配器。
