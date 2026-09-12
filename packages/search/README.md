# @hyzyn/dsh-search

DSH Web GUI 的 **全局搜索插件**：侧边栏注入全局搜索入口（⌘/Ctrl+K 同样唤出），打开的是一块命令面板式的搜索窗 —— 行 = 图标 + 标题（可带副标题）+ 右侧元信息 + 快捷键胶囊，分组呈现候选。

![全局搜索插件](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-search.png)

![全局搜索的检索结果（最近会话 / 历史会话 / Prompt / MCP 工具 / 设置分组）](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-search-query.png)

## 面板行为

**打开即出内容**（不发请求，零延迟）：

- **最近**：浏览器端 `ctx.sessions.list` 快照里的最近会话（过滤空会话与 subagent 会话），右侧是相对时间；
- **快捷操作**：新会话 / 打开文件夹 / 打开设置 —— 目标不存在（例如没装目录选择器插件）时该行不出现；
- **设置**：设置一级大类**实时**取自客户端 slots 注册表的 `settings.section` 槽 —— 皮肤 / 宠物 / 侧边卡片 / Web 插件 / 创意工坊 / 使用统计 / 会话归档管理这类第三方插件注册的大类也会出现，顺序与设置窗导航一致；行内关键词与描述由宿主 `/api/dsh-search/catalog` 目录补充。宿主没有这条路由（本体是旧版本）、或 slots 服务不可用时，依次退回目录、再退回客户端内置的四个官方大类兜底清单。

**输入关键词后**：本地候选（最近会话标题、快捷操作、设置目录）即时过滤重绘，同时异步请求 `/api/dsh-search/query` 补齐宿主全文命中：

- **历史会话**：走 DSH 自带的 `sessionQuery` 全文索引，点击打开会话并自动定位到匹配文字位置（会话视图是底部锚定的虚拟列表，定位会逐屏向上加载更早消息，找不到时恢复原位置）；
- **Prompt**：读取 `~/.dsh/prompts.yml` 托管区块，点击跳到「Prompt 管理」设置卡片（跳不过去时退回复制片段）；
- **MCP 工具**：`mcp__` 前缀工具，右侧显示所属 server；点击跳到「MCP 服务器配置」卡片；
- **设置**：按标题 / 关键词 / 描述本地匹配（含插件卡片）。

## 键盘

| 按键 | 行为 |
| --- | --- |
| ⌘/Ctrl+K | 唤出（已打开则聚焦输入框） |
| ↑ / ↓ | 在全部候选中移动高亮（默认选中首项） |
| ↵ | 打开高亮项 |
| esc | 关闭 |
| ⌥/Alt + 1…9 | 打开第 N 条「最近」会话 |
| ⌥/Alt + N / O / , | 新会话 / 打开文件夹 / 打开设置 |

鼠标移动会把高亮带到指针所在行，键盘与鼠标共用一套选中状态。

## 路由

仅限 loopback + 同源访问：

- `GET /api/dsh-search/query?q=<关键词>` —— 返回 `{ sessions, prompts, tools, panels }`：历史会话、Prompt、MCP 工具与设置面板搜索结果
- `GET /api/dsh-search/catalog` —— 返回 `{ panels }`：当前可用的设置面板目录（含 `titles` / `keywords` / `description`），供浏览器半体做「打开即有内容」与即时筛选

## 安装

```bash
pnpm --filter @hyzyn/dsh-search build
dsh plugin --profile web add link:$(pwd)/packages/search
```

插件自身行由 `cordis.patch.yml` 的 `insert: { id: global-search, name: '@hyzyn/dsh-search' }` 挂载；浏览器半体在侧边栏「新建会话」下方添加全局搜索入口。

## 配置

```ts
interface Config {
  /** 关闭整个插件（不注册路由、不注入 GUI）。默认开。 */
  enabled?: boolean
  /** 单类结果最大条数。默认 8。 */
  maxResults?: number
  /** 是否搜索历史会话。默认 true。 */
  includeSessions?: boolean
  /** 是否搜索 Prompt。默认 true。 */
  includePrompts?: boolean
  /** 是否搜索 MCP 工具。默认 true。 */
  includeMcpTools?: boolean
  /** 是否搜索设置面板（设置 → 插件 → 插件配置）。默认 true。 */
  includePanels?: boolean
  /** 是否向 agent 注入插件能力公告。默认开。 */
  announceToAgent?: boolean
  /** 会话回退扫描的最大会话数：宿主 FTS 不可用时按会话最近优先截断到此数，上限 500。默认 80。 */
  maxScanSessions?: number
}
```

## 视觉预览

`scripts/preview.mjs` 把 `client.js` 装进纯静态夹具页（`scripts/preview/harness.html`，内含假宿主：模块加载器 / fetch / sessions 服务），用 headless Chrome 逐场景渲染截图，改样式时用来走查：

```bash
pnpm --filter @hyzyn/dsh-search preview                          # 全场景（暗色）→ .preview/shots/
pnpm --filter @hyzyn/dsh-search preview -- --theme=light --out=shots-light
pnpm --filter @hyzyn/dsh-search preview -- --list                # 列场景
```

场景：`empty`（打开即出内容）、`query`（输入关键词后的混合结果）、`loading`（全文检索进行中）。`empty` 场景在截图之后还会跑一组键盘契约自检（默认选中 / ↑↓ / ↵ / ⌥数字 / esc），失败会以 `⚠` 打印出来。需要本机有 Chrome/Chromium（默认找 playwright 缓存的 Chrome for Testing，也可用 `CHROME_PATH` 指定）。

## 说明

- 浏览器半体依赖核心客户端 `sessions` 服务（读取最近会话、点击打开会话），并通过 DOM 注入侧边栏入口；
- 关闭面板时会还原焦点，但**跳过侧边栏入口内部**的元素（入口的 `focusin` 就是打开路径，还焦点会给「刚关掉又弹回来」），并在 250ms 内屏蔽入口 focusin 兜底；
- 「新会话」优先调用 GUI 自己的 `uiWorkspace.startSession()`（复用当前工作区的空会话 → 创建 → 选中，一步到位）；拿不到该服务时退回点侧边栏「新建会话」按钮，最后才自己 `sessions.create()` + `sessions.open()`——只 create 不 open 会表现为「点了没反应」；
- 「打开文件夹」按侧边栏「添加工作区」按钮的 aria-label 定位，目录选择器插件缺席时按钮不存在，该行自动隐藏；
- 设置目录内置在宿主半体：官方恒有的面板（通用设置、模型、插件、Agent 预设、插件市场、终端、Agent 循环、网页搜索）始终可搜；插件卡片按宿主当前已加载的插件过滤；
- 如果宿主未安装 `sessionQuery` 服务，会话搜索会返回空数组而不是报错；
- 如果 `session-query` 全文索引被配置为 `openAt: "never"`，历史会话会自动退化为逐会话扫描原始事件，不会让整个搜索失败；回退扫描按会话最近优先截断（`maxScanSessions`），命中结果按时间倒序返回；
- 会话文档 / 查询结果 / 可见会话集合 / Prompt 解析均有短 TTL 缓存，重复查询开销小；
- 会话结果会过滤为当前 DSH 可见 / 可跳转的会话，避免出现“能搜到但点不开”的情况。
