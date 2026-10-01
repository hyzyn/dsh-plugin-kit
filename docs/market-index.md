# 插件市场索引：分类标签从哪来 · 我们 8 条的现状 · 怎么改

> **起因（2026-10-01）**：用户在 dsh-market 里看到 `tty` 与 `docker` 都挂着「UI 增强」，
> 问「分类有问题，查一下什么情况」。答案的第一条就是：**分类既不在我们的包里，也不在市场前端**
> ——它写在上游条目文件的一行 `category:` 里。本文记下这条链、实测现状与改法，供下次复查/改分类。
>
> 读者是**本仓维护者**；不是给用户看的文档。投稿材料本身见
> [pr-body-dsh-market.md](./pr-body-dsh-market.md) 与 [community-submission.json](./community-submission.json)（§1 说明它们属于**另一条**轨道）。

## 1. 一条链，四跳

| 跳 | 谁 | 落在哪 |
|---|---|---|
| ① | **人工维护的条目文件**（唯一真源） | 仓库 `awesome-dsh-plugin/awesome-dsh-plugin`：`data/plugins/<owner>__<repo>--packages-<pkg>.yml`，每个文件一行 `category:` |
| ② | 生成目录 JSON | `https://awesome-dsh-plugin.com/plugins.json`（带 `categories` 映射：id → `{en, zh}`） |
| ③ | 插件市场拉取 | 市场插件 `dshmarket` 的 `src/registry.ts`（`loadRegistry`，每次打开都重新校验，没有小时级缓存） |
| ④ | 卡片上的标签 | `src/client/MarketSection.tsx`：`data.categories[category][lang]`，取不到才退回显示 id 本身 |

所以：**改 `package.json` 的 keywords、改 npm 包、在市场界面里点什么，都不会动这个标签。**
`ui` 显示成「UI 增强」，就是 `categories.ui.zh` 这一个字符串。

**两条投稿轨道，别混**——本仓那两份对外材料属于**第二条**：

| 轨道 | 索引真源 | 在市场里的位置 | 本仓材料 |
|---|---|---|---|
| **精选列表** | `awesome-dsh-plugin/awesome-dsh-plugin` 的 `data/plugins/*.yml` | 「发现」的分类筛选与卡片标签——**现场读的就是这一条** | 无（PR 正文当时直接写在 GitHub 上） |
| 「创意工坊」 | DSH Web GUI 插件仓 `zhu1090093659/dsh-web`：`packages/dsh-community-plugins/community.json` + `scripts/market-build` → `market/dist/manifest/plugins.json` | 设置 → 创意工坊 | [community-submission.json](./community-submission.json)（9 条）+ [pr-body-dsh-market.md](./pr-body-dsh-market.md) |

**2026-10-01 复查「创意工坊」轨道**：`zhu1090093659/dsh-web` 的全仓树里已经**没有**
`packages/dsh-community-plugins/`，也没有任何 `community*.json`（`market/dist/manifest/plugins.json`
仍在）——那条流程已经改过。所以 `community-submission.json` 是**历史提交载荷**，不是可照抄的活格式。

**`subcategory` 是死字段**：上游 4400 条里出现 **0 次**；schema 只有单值 `category`（JSON 侧的数组是
生成时归一的）。`community-submission.json` 里那 9 组 `"subcategory"` 不影响任何东西，**别再按它投稿**。

## 2. 我们 8 条的现状（实测 2026-10-01；目录 `updated: 2026-09-30`，共 4400 条）

| 条目 | `category` | 现场标签 | 加入 | 上游提交 |
|---|---|---|---|---|
| `dsh-plugin-kit#tty` | `ui` | UI 增强 | 2026-08-30 | #3785 |
| `dsh-plugin-kit#codegraph` | `tools` | 工具与能力 | 2026-08-30 | #3785 |
| `dsh-plugin-kit#profile` | `dev` | 开发与运行时 | 2026-08-30 | #3785 |
| `dsh-plugin-kit#search` | `session` | 会话与消息 | 2026-08-18 | #1585 |
| `dsh-plugin-kit#rss` | `tools` | 工具与能力 | 2026-08-18 | #1584 |
| `dsh-plugin-kit#mcp` | `tools` | 工具与能力 | 2026-09-13 | #4945 |
| `dsh-plugin-kit#docker` | **`ui`** | **UI 增强** | 2026-09-13 | #4945 |
| `dsh-plugin-kit#kit-settings` | `ui` | UI 增强 | 2026-09-25 | `cbc155af` |

**不在里面的**：`@hyzyn/dsh-env` 与 `@hyzyn/dsh-prompt`——四个波次（#1584/#1585/#3785/#4945…）
里都没提交过它们；`community-submission.json` 里那 9 条属于另一条轨道（§1）。

每条的 `category:` 是**我们自己提交时写的**，不是维护者改的。证据是上游 PR 的标题与正文：
#4945 标题即 `Add hyzyn/dsh-plugin-kit#mcp and #docker (tools / ui)`、正文写 docker `(ui)`；
#1585 写 `Category: session`；#1584 写 `Category: tools`。
（上游贡献指南第 82/95 行说明维护者**可以**直接改分类而不打回——我们这批没有发生，所以「现场值 ≠ 我们
当初的意图」只可能出在**我们自己的两份材料互相不一致**上，见下表。）

| 包 | 精选列表（现场生效） | `community-submission.json`（另一条轨道） |
|---|---|---|
| docker | `ui` | `tools` / `dev` |
| search | `session` | `ui` / `panel` |
| rss | `tools` | `knowledge` / `reading`（上游**没有** `knowledge` 这一档） |
| profile | `dev` | `tools` / `dev` |

## 3. 复查：一条命令

```sh
curl -sS https://awesome-dsh-plugin.com/plugins.json | node -e '
let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
  const r = JSON.parse(s).registry;
  console.log(r.updated, r.plugins.length, "entries");
  for (const p of r.plugins) {
    if (!/hyzyn/.test(JSON.stringify(p))) continue;
    console.log(p.category.join("+"), p.npm, p.version, p.added, "->", r.categories[p.category[0]]?.zh);
  }
});'
```

## 4. 分类对照（判断「该不该改」的依据）

同一份目录、**排除我们自己的条目**：

| 同类 | 条数 | 取值分布（前几） |
|---|---|---|
| 终端 / TUI（名字或描述含 terminal / pty / tui） | 116 | **`ui`=48**、`remote`=13、`tools`=10、`dev`=10、`session`=5、`theme`=4 |
| Docker / 容器 / k8s | 21 | `dev`=7、`ui`=3、`wsl`=3、**`tools`=2**、`remote`=2、`memory`=1 |

逐条结论：

- **`tty` 的 `ui` 与同类一致**（48/116：`dsh-terminal`、`dsh-oh-my-terminal`、`@deepseek-harness-tui/dsh-tui`……），**保持**。
- **`docker` 的 `ui` 是异类**：最接近的两条容器工具 `dsh-docker` 与 `@stardustlc/dsh-docker` 都在
  `tools`；容器类里 `dev`（`dsh-testkit` / `dsh-worlds` 这类容器化开发）与 `wsl`（`dsh-wsl-docker`）
  也各有归属，但**没有一条「容器面板」挂在 `ui`**。→ 见 §5。
- `rss` 的 `tools`、`search` 的 `session`、`profile` 的 `dev` 都说得通，**保持**。

## 5. 改分类：一行 + 一个 PR

上游贡献指南第 223 行：修正描述、**调整分类**、移除失效项目的 PR 同样欢迎。改动只有一行：

```diff
--- a/data/plugins/hyzyn__dsh-plugin-kit--packages-docker.yml
+++ b/data/plugins/hyzyn__dsh-plugin-kit--packages-docker.yml
@@
-category: ui
+category: tools
```

**为什么不选 `dev`**：`tools`（工具与能力）是与本插件**功能几乎相同**的 `dsh-docker` /
`@stardustlc/dsh-docker` 的取值；`dev`（开发与运行时）那一档的实际成员是 `dsh-testkit` /
`dsh-worlds` 这类「在容器里跑开发环境」的东西，不是容器管理面板。落不准也没关系——指南明说维护者
会直接改，不打回。

**PR 正文**（可直接粘贴；模板项按上游 `data/plugins` 那条路走，无需重生成 README——它由 main 重新生成）：

```markdown
## What / 改什么

Move `hyzyn/dsh-plugin-kit#docker` from **UI Enhancements** to **Tools & Capabilities**.

单个文件的一行改动：`data/plugins/hyzyn__dsh-plugin-kit--packages-docker.yml` 的 `category: ui` → `category: tools`。

## Why / 为什么

这是一个 Docker 容器**管理面板**（容器列表 / inspect / 日志 / stats / 镜像，附带 `docker_*` agent 工具），
不是界面增强类插件。同类条目的归属也指向 `tools`：`dsh-docker` 与 `@stardustlc/dsh-docker` 都在
`tools`；容器相关的 `dev` 档成员是 `dsh-testkit` / `dsh-worlds`（容器化开发环境），`wsl` 档是
`dsh-wsl-docker`——没有一条容器面板挂在 `ui`。

## Scope / 范围

```
data/plugins/hyzyn__dsh-plugin-kit--packages-docker.yml   | 2 +-
```

只动这一行。README 由 main 重新生成，我没有手工编辑；没有新增/删除条目，没有改描述与其他条目的分类。
```

**本次 PR**：[awesome-dsh-plugin#6306](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/6306)（2026-10-01 提交，待审）。

**其余 7 条不动**（§4 逐条核过）。若要顺带申请 `env` / `prompt` 收录，需另开文件，并按贡献指南
第 152 行说明为什么不与已有的几十条同类重复——那是另一个 PR，不要混在这一个里。

## 6. 已知的坑

- **主题类必须放 `theme`**：该分类的条目会自动进市场的「主题」Tab，放 `ui` 就会漏（指南第 217 行）。
  我们目前没有主题类插件，以后有也别放错。
- **分类体系会拆**：`usage` / `vision` / `security` / `browser` / `git` / `docs` / `remote` / `voice`
  都是从 `tools` / `ui` / `dev` 长大了拆出来的（指南第 95 行）。标签被动过不等于我们做错了。
- **不收纯聚合包**（指南第 101 行）：`@hyzyn/dsh-all` 不登记；`#kit-settings` 自己提供设置面，所以登记了。
- `community-submission.json` **保留原路径不动**（可能被按 `@main/docs/` URL 取，见
  [conventions.md § 知识归属表](./conventions.md#知识归属表唯一归宿)）；本文只负责说明它与现场的关系。
