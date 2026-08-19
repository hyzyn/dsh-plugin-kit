# @hyzyn/dsh-rss

DSH 的 RSS / 新闻聚合插件：订阅多个 RSS / Atom 源，每天自动汇总成一篇「今日值得读」。

## 功能

- 内置渠道库（阮一峰、少数派、Solidot、Hacker News、掘金、IT之家、36氪），在设置里勾选要展示的渠道即可；36氪官方 feed 被反爬拦截，内置地址为第三方 RSSHub 镜像；
- 支持自定义渠道：填写自己的 RSS / Atom 地址，保存时真实抓取校验，抓不到内容的地址会提示且不保存；支持 **OPML 导入 / 导出**（从任意 RSS 阅读器或网站导入订阅）与**粘贴 URL 列表批量导入**（每行一个地址，或「名称, 地址」），自动跳过已订阅项，导入后可一键保存校验生效；
- **订阅源目录（多来源）**：目录可来自多个来源——内置 [awesome-rsshub-routes](https://jackyst0.github.io/awesome-rsshub-routes/) 精选列表（官方 RSS 与 RSSHub 路由，快照 + 每 12 小时静默刷新）+ 任意数量自定义 OPML 目录（在设置卡片「订阅源目录」里添加 OPML 地址，名称 / URL 均可配置）；所有来源的结果统一汇总、标注「来自 xxx」并按来源筛选，支持搜索 / 按分类筛选 / 勾选多选后批量添加（全选 / 清空 / 一键添加选中），实时显示「已订阅 / 已选」计数；单个目录源失败不影响整个目录读取；
- 零依赖解析 RSS 2.0 与 Atom，按链接 / id / 标题去重，并按时间倒序生成 Markdown；
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
| `src/index.ts` | 插件宿主半体：RSS/Atom 解析、抓取、digest 生成、定时调度、HTTP API、systemPrompt 注入 |
| `client.js` | 浏览器半体：设置 → 插件 →「RSS / 新闻聚合」卡片 |
| `tsconfig.json` | 继承根 tsconfig.base.json，tsc 产出 lib/ |
