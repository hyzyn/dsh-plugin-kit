# @hyzyn/dsh-mcp

DSH Web GUI 的 **MCP 服务器配置插件**：官方 设置 → 插件 里的「MCP 服务器配置」卡片，提供图形化管理。浏览器半体通过核心 `settings.plugin.item` 插槽注册，与官方终端 / Agent 循环 / 网页搜索卡片同级。

MCP 服务器在 DSH 里是官方 `@deepseek-ai/dsh-mcp-client` 的插件实例。本插件在
`~/.dsh/cordis.patch.yml`（home 补丁层，对所有 profile 生效）里维护一段带标记的
托管区块，每条服务器是一行 `insert` patch；DSH 对该文件注册了 HMR 监听
（`watchUserPatches`），所以**保存后无需重启宿主进程**即可热加载，工具以
`mcp__<serverName>__<tool>` 注册给模型。

## 能力

- 设置 → 插件 里的「MCP 服务器配置」卡片（React 外壳 + 纯 DOM 面板，无构建步骤）
- 两种传输：
  - **stdio**：command / args / env / cwd（本地子进程服务器，如 `npx -y @modelcontextprotocol/server-filesystem`）
  - **streamable-http**：url / headers（远程 MCP 服务，支持 SSE 与 session 头）
- env / headers 值支持 `js:` 前缀的 `!!js` 表达式（如 `js:process.env.GITHUB_TOKEN`，
  模板串也可用），与 dsh 补丁文件方言一致
- 连接测试：宿主直说 JSON-RPC（initialize → tools/list），不依赖 MCP SDK，
  返回协议版本、serverInfo、工具清单与耗时
- 启用 / 停用（`disabled: true`）、编辑、删除
- 存活状态徽章（从 loader fiber 读取：运行中 / 已停用 / 错误 / 加载中）
- 与外部 mcp-client 实例的 serverName 冲突提示
- agent 能力公告（systemPrompt section，order 150），用户提到「MCP 配置 / MCP 服务器」
  即指本插件

## 结构

| 文件 | 说明 |
| --- | --- |
| `src/index.ts` | 宿主半体：托管区块读写、校验、状态读取、JSON-RPC 探测、`/api/dsh-mcp/*` 路由（loopback-only 围栏） |
| `client.js` | 浏览器半体：注册 `settings.plugin.item` 卡片（React 外壳 + 纯 DOM 管理面板，`window.__ModuleLoader__.load` 格式） |
| `cordis.patch.yml` | bundle 补丁：把插件行插入 profile 阵容 |

路由（仅限 loopback + 同源）：

- `GET /api/dsh-mcp/servers` —— 列表 + 状态 + 冲突
- `POST /api/dsh-mcp/servers/save` —— 整体保存（校验后写回托管区块）
- `POST /api/dsh-mcp/test` —— 用表单配置做一次连接测试

## 安装

```bash
pnpm --filter @hyzyn/dsh-mcp build
dsh plugin --profile web add link:$(pwd)/packages/mcp
```

`dsh plugin add` 会同时把本包装进 profile 依赖，并因其声明了 `dsh.bundle`
而把它加进 `dsh.profile.bundles` 补丁层——`cordis.patch.yml` 里的
`insert: { id: mcp-config, name: '@hyzyn/dsh-mcp' }` 插件行由此生效，
**只需挂载这一次**。插件代码更新后重启 `dsh web` 即可生效。

> ⚠️ 不要再把同一插件行手工追加到 `~/.dsh/cordis.patch.yml`：同一
> `id` 在两个补丁层各插一次会在启动时触发
> `duplicate loader entry id: mcp-config`，宿主进程直接退出。
> home 补丁层只保留插件自己维护的 `# --- dsh-mcp-config managed ...`
> 托管区块（服务器行，不是插件行）。

插件自身行无需 HMR：**MCP 服务器配置**（托管区块内的行）保存后由
DSH 对 home 补丁层的监听在 1~2 秒内热加载为 `mcp__<server>__<tool>`
工具。刷新页面后，在 Web GUI 的 设置 → 插件 里展开「MCP 服务器配置」
卡片即可管理服务器。注意：浏览器半体依赖核心 `slots` 服务，只有
`dsh-web-app` 的官方设置面板才提供该插槽。

## 卸载

```bash
dsh plugin --profile web remove @hyzyn/dsh-mcp
```

重启 `dsh web` 后插件行随之消失。托管区块可以留着（无插件时只是空行），
也可以在面板里先删空服务器列表，再手动删掉
`# --- dsh-mcp-config managed ...` 区块。

## 说明

- 托管区块以 `# --- dsh-mcp-config managed (auto-generated; do not edit) ---`
  标记，插件只改写该区块，其余内容原样保留；区块内配置与官方 mcp-client
  的 Config schema 对齐。空列表写为 `- insert: []`（对条目树是 no-op）——
  注意不要写成裸的 `[]`，那会破坏 home 补丁文件的顶层 YAML 文档，导致
  HMR 配置刷新解析失败、删除的服务器无法卸载
- 保存接口校验 serverName（`[A-Za-z0-9_-]{1,32}`）、传输必填项、reconnect 参数边界
- 连接测试的 `!!js` 表达式在宿主内评估（与 loader 相同的信任模型）
- 浏览器半体为手写 ESM（React 外壳经 `__ModuleLoader__` 的 `require` 解析，面板本身是纯 DOM），无需 tsdown；宿主半体 tsc 直出 ESM
