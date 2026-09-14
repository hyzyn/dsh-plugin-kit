# @hyzyn/dsh-rss

DSH 的 RSS / 新闻聚合插件：订阅多个 RSS / Atom 源，每天自动汇总成一篇「今日值得读」。


### 刷新时的过渡层（0.3.1）

「今日值得读」弹窗与设置卡刷新时，会出现与 dsh-docker「切目标过渡」同一套语言的提示：

- 内容区顶部一条 **2px 不定长流光进度条**；
- 一行**蓝色胶囊**：`⟳ 正在刷新订阅源 · 当前数据生成于 14:29`（完整解释在 `title`）。
- **两个 token 别混**（实测教训）：进度条流光的插值色必须用**强调色**
  `--dsw-alias-state-business-primary`（实测 `#4176e6`）；我一开始写的是
  `--dsw-alias-brand-primary`，而它在这个皮肤里是 `#0f1115`（品牌墨色、**近黑**），
  于是「波纹」渲染成一条黑线。两者名字都像"主色"，但前者是品牌墨色、后者才是强调色。
- **观感与 dsh-docker 的 `dk_switchOverlay` 同一套**：蓝底（`color-mix(accent 12%, bg-base)`）、
  蓝描边（`accent 42%`）、文字与旋转图标走 `--dsw-alias-state-business-primary`，顶部同样一条
  2px 不定长流光进度条。实测两处胶囊的计算颜色完全一致（底色 `color(srgb .91 .94 .99)`、
  文字 `rgb(65,118,230)`）。
- **位置**：进度条落在**分类行下沿**（= 列表区顶部那条线），胶囊**骑在这条线上、水平居中**
  ——与 dsh-docker 的 `dk_switchOverlay` 同一形态。两者都绝对定位在 `.rss_modalFilter` 上：
  不占文档流（不推版），也不压到分类 chip。
  注意 `position:absolute` 必须显式写：漏掉它 `left/bottom/transform` 全部失效，胶囊会退化成
  流式元素把列表整块顶下去（踩过一次，实测 +38px）。
- 只在**慢刷新**时出现（沿用已有的 180ms 消抖），毫秒级请求不会闪；
- 两者都是**绝对定位**：实测刷新前后区块 / 标题 / 统计 / 首条 / 搜索框的位置完全不变，
  不会有「推下去又弹回来」的跳动；
- 数据落地时正文 **8px 上滑 + 淡入**，动效尊重 `prefers-reduced-motion`。

刷新期间正文仍按原行为压暗（`opacity:.55`），旧内容继续可读。

原有保护全部保留：stale-while-revalidate（刷新期间旧内容继续可读并压暗）、骨架屏消抖、
刷新后搜索框焦点/光标与列表滚动位置还原。注意弹窗的慢加载路径**刻意不重渲染整棵树**，
所以过渡层是「只插两个绝对定位节点」而不是靠重渲染——这条路径漏了注入，浮层就永远不出现。

回归：`pnpm --filter @hyzyn/dsh-rss smoke`（6 条静态断言，守「绝对定位不推版 / 消抖门 /
文案形态 / 落地标记 / 原有保护」）。

## 功能

- 内置渠道库（阮一峰、少数派、Solidot、Hacker News、掘金、IT之家、36氪），在设置里勾选要展示的渠道即可；36氪官方 feed 被反爬拦截，内置地址为第三方 RSSHub 镜像；
- 支持自定义渠道：填写自己的 RSS / Atom 地址，保存时真实抓取校验，抓不到内容的地址会提示且不保存；支持 **OPML 导入 / 导出**（从任意 RSS 阅读器或网站导入订阅）与**粘贴 URL 列表批量导入**（每行一个地址，或「名称, 地址」），自动跳过已订阅项，导入后可一键保存校验生效；
- **订阅源目录（多来源）**：目录可来自多个来源——内置 [awesome-rsshub-routes](https://jackyst0.github.io/awesome-rsshub-routes/) 精选列表（官方 RSS 与 RSSHub 路由，快照 + 每 12 小时静默刷新）+ 任意数量自定义 OPML 目录（在设置卡片「订阅源目录」里添加 OPML 地址，名称 / URL 均可配置）；所有来源的结果统一汇总、标注「来自 xxx」并按来源筛选，支持搜索 / 按分类筛选 / 勾选多选后批量添加（全选 / 清空 / 一键添加选中），实时显示「已订阅 / 已选」计数；单个目录源失败不影响整个目录读取；
- 零依赖解析 RSS 2.0 与 Atom，按链接 / id / 标题去重，并按时间倒序生成 Markdown；
- **可选 AI 摘要**：启用后调用宿主 LLM 为每条资讯生成一句话中文摘要，显示在 digest / 弹窗里并追加进 systemPrompt；摘要按条目缓存 30 天（最多 500 条，`ai-cache.json`），重复条目不会重复请求；单条失败（超时 / 非 stop 终止 / 空输出）只回落原文摘要，不影响其它条目，路由缺失时本次生成整体跳过并在 digest 中记录原因；
- 默认每天 `08:00` 自动生成当天 digest；插件启动时若当天 digest 不存在也会自动补生成；
- 把当天 digest 注入 `systemPrompt`，模型在用户问“今日值得读”时可以直接引用；
- 提供 Web GUI 卡片：设置 → 插件 →「RSS / 新闻聚合」，维护内置渠道开关 / 自定义渠道 / 新闻分类 / 聚合设置，保存后自动刷新当天 digest；自定义渠道支持按名称 / URL 筛选与计数，并对重复 URL 给出内联警告；卡片顶部直接预览今日 digest（条数 / 源数 / 生成时间 / 失败告警），可一键查看列表、刷新、复制 Markdown；
- 界面采用「分区块更新」渲染：输入、目录搜索、增删渠道只重建受影响区块，焦点 / 光标 / 滚动不丢失；未保存修改有角标提示；
- 在侧边栏「新建会话」下方（任务看板 / SSH 附近）提供「今日值得读」快捷入口，点击弹窗直接查看新闻；弹窗支持按标题 / 摘要 / 来源搜索、按分类筛选、显示「可见 / 总数」计数、复制 Markdown，支持 Esc 关闭与焦点圈定；
- digest 按「分类」分组展示（无分类归入「未分类」），条目标注来源与日期；每个来源的「查看更多」直达其官网；
- 在 UI 的「设置」页维护内置渠道开关、自定义渠道（RSS/Atom 地址、分类、条数限制）和新闻分类；渠道的分类从「新闻分类」列表里选择，保存时自动把使用中的分类合并进列表；
- 生成的 Markdown 保存在 `~/.dsh/rss-digest/YYYY-MM-DD.md`，同时写入 `latest.json` 便于外部读取。

## 界面截图

设置 → 插件 →「RSS / 新闻聚合」卡片（内置渠道勾选 + 自定义渠道 + 新闻分类）：

![RSS 设置卡片](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-rss-setting.png)

侧边栏「今日值得读」弹窗（按分类分组、来源带「查看更多」直达官网、底部可手动刷新）：

![今日值得读弹窗](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-rss-view.png)

向模型询问当天新闻时，直接引用当天 digest（无需打开弹窗）：

![查询今日新闻](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-rss-query-news.png)

## 配置示例

在 DSH 的插件配置中传入 `Config`：

```ts
{
  sources: [
    { name: '阮一峰的网络日志', url: 'https://www.ruanyifeng.com/blog/atom.xml', category: '技术' },
    { name: '少数派', url: 'https://sspai.com/feed', category: '效率' },
  ],
  maxItemsPerSource: 5,
  maxTotalItems: 30,
  dailyTime: '08:00',
  digestDir: '~/.dsh/rss-digest',
}
```

> 不传 `sources` 时默认启用全部内置渠道；传入 `sources` 则以内置渠道全部关闭、只使用该列表。

常用配置项：

| 字段 | 说明 | 默认 |
| --- | --- | --- |
| `enabled` | 是否启用插件 | `true` |
| `announceToAgent` | 是否把 digest 注入 systemPrompt | `true` |
| `includeCatalog` | 是否提供订阅源目录（/api/dsh-rss/catalog） | `true` |
| `sources` | 自定义订阅源列表；传入后替代全部内置渠道 | 内置 7 个渠道 |
| `maxItemsPerSource` | 每个源最多取多少条 | `5` |
| `maxTotalItems` | 每天最多汇总多少条 | `30` |
| `dailyTime` | 每天自动生成时间（HH:mm） | `08:00` |
| `autoGenerateOnMount` | 启动时若当天 digest 不存在是否自动生成 | `true` |
| `digestDir` | 输出目录 | `~/.dsh/rss-digest` |
| `requestTimeoutMs` | 单次请求超时 | `10000` |

## AI 摘要（可选）

AI 摘要默认关闭，配置只走可编辑 store `~/.dsh/rss.json` 的 `ai` 字段（设置卡片「AI 摘要」区块可改，不新增 Config 字段）：

```json
{
  "ai": {
    "enabled": true,
    "provider": "deepseek",
    "model": "deepseek-chat",
    "maxItems": 20,
    "concurrency": 3,
    "timeoutMs": 20000
  }
}
```

| 字段 | 说明 | 默认 |
| --- | --- | --- |
| `enabled` | 是否启用 AI 摘要 | `false` |
| `provider` / `model` | 模型路由，**必须成对填写**；都留空则跟随宿主默认模型（`agentDefaultModel` / settings 的 `agent-default-model`；都取不到则本次生成跳过 AI 摘要） | 留空 |
| `maxItems` | 单次 digest 最多摘要条数（列表前 N 条），夹紧 1..50 | `20` |
| `concurrency` | 并发请求数，夹紧 1..6 | `3` |
| `timeoutMs` | 单条请求超时毫秒数，夹紧 5000..60000 | `20000` |

只填 `provider` / `model` 之一时整段 `ai` 配置会被忽略并在保存响应里给出告警。摘要结果写入 digest 目录的 `ai-cache.json`（`{ version: 1, entries: { <sha1(link|id|title)>: { text, model, at } } }`），命中且未过期（30 天）直接复用；超出 500 条按写入时间淘汰最旧。

## 开发

```bash
pnpm --filter @hyzyn/dsh-rss build
pnpm --filter @hyzyn/dsh-rss typecheck
```

## 安装到 DSH

```bash
dsh plugin --profile web add link:$(pwd)
```

或从仓库根目录：

```bash
dsh plugin --profile web add link:$(pwd)/packages/rss
```

## 文件

| 文件 | 说明 |
| --- | --- |
| `package.json` | `dsh.bundle.patch` 指向 cordis.patch.yml；`main` / `exports["."]` 指向 lib/index.js |
| `cordis.patch.yml` | bundle 补丁：`insert: { id: rss-digest, name: '@hyzyn/dsh-rss' }` 把本插件行插入 profile 阵容 |
| `src/index.ts` | 插件宿主半体：RSS/Atom 解析、抓取、digest 生成、AI 摘要、定时调度、HTTP API、systemPrompt 注入 |
| `client.js` | 浏览器半体：设置 → 插件 →「RSS / 新闻聚合」卡片 |
| `test/ai-summary.test.ts` | AI 摘要的回归测试（消息构造 / 清洗、缓存 TTL·LRU、路由解析、store 白名单、渲染、LLM 终止分支、生成降级路径） |
| `tsconfig.json` | 继承根 tsconfig.base.json，tsc 产出 lib/ |
