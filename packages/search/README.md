# @hyzyn/dsh-search

DSH Web GUI 的 **全局搜索插件**：在侧边栏注入全局搜索框，点击 / 聚焦后弹出搜索窗，输入关键词即可全文搜索历史会话与设置面板：

- **历史会话**：走 DSH 自带的 `sessionQuery` 全文索引，展示命中的会话片段，点击打开会话并尝试自动定位到匹配文字位置；
- **设置面板**：列出「设置 → 插件」中已安装插件的可配置面板（终端、Agent 循环、网页搜索以及各插件卡片），点击直接跳转到对应设置卡片；
- **关键词高亮**：命中的会话片段中的匹配词会高亮显示。

![全局搜索插件](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-search.png)

## 路由

仅限 loopback + 同源访问：

- `GET /api/dsh-search/query?q=<关键词>` —— 返回 `{ sessions, panels }` 会话与设置面板搜索结果

## 安装

```bash
pnpm --filter @hyzyn/dsh-search build
dsh plugin --profile web add link:$(pwd)/packages/search
```

插件自身行由 `cordis.patch.yml` 的 `insert: { id: global-search, name: '@hyzyn/dsh-search' }` 挂载；浏览器半体在侧边栏「新建会话」下方添加全局搜索框。

## 配置

```ts
interface Config {
  /** 关闭整个插件。默认 false。 */
  enabled?: boolean
  /** 单次搜索返回的最大结果条数。默认 8。 */
  maxResults?: number
  /** 是否搜索历史会话。默认 true。 */
  includeSessions?: boolean
  /** 是否搜索设置面板。默认 true。 */
  includePanels?: boolean
  /** 是否向 agent 注入插件能力公告。默认 true。 */
  announceToAgent?: boolean
}
```

## 说明

- 浏览器半体依赖核心客户端 `sessions` 服务（点击会话时打开），并通过 DOM 注入侧边栏搜索框；
- 设置面板清单内置在宿主半体：官方恒有的面板（终端、Agent 循环、网页搜索）始终可搜；插件面板按宿主当前已加载的插件过滤，未安装插件的面板不会出现在结果里；
- 如果宿主未安装 `sessionQuery` 服务，会话搜索会返回空数组而不是报错；
- 如果 `session-query` 全文索引被配置为 `openAt: "never"`，历史会话会自动退化为逐会话扫描原始事件，不会让整个搜索失败；
- 会话结果会过滤为当前 DSH 可见 / 可跳转的会话，避免出现“能搜到但点不开”的情况。