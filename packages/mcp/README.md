# @hyzyn/dsh-mcp

中文 | [English](README.en.md)

> DSH **设置 → 插件** 里的「MCP 服务器配置」卡片：图形化维护 MCP 服务器，**保存即热加载**，不用重启宿主。

## 特性

- **保存即热加载**：改写 `~/.dsh/cordis.patch.yml` 的托管区块，DSH 的 HMR 监听自动重载，工具以 `mcp__<server>__<tool>` 注册给模型。
- **stdio 与 streamable-http 双传输**：stdio（command / args / env / cwd）与 streamable-http（url / headers，含 SSE 与 session 头）；值可写 `js:` 表达式，密钥不落补丁文件。
- **连接测试不经 MCP SDK**：宿主直接说 JSON-RPC（initialize → tools/list），返回协议版本 / serverInfo / 工具清单 / 耗时。启动子进程走 `@hyzyn/dsh-kit` 的 `spawnPortable`——Windows 上 MCP 服务器常是 `.cmd` shim，裸 `spawn` 会 `EINVAL`（Node 对 `.cmd` 的加固），连接测试会永久报错并误导成「CLI 没装好」；探测进程的 stderr 也用同库的容错解码器（UTF-8 优先、遇非法字节回落控制台代码页）读，卡片上不会出现 `���`。注意这只影响本插件的探测：**真正的工具加载**走 DSH 核心的 `@deepseek-ai/dsh-mcp-client`（官方 SDK + cross-spawn），本来就没这个问题。
- **存活状态与命名冲突可见**：从 loader fiber 读存活状态（运行中 / 已停用 / 错误 / 加载中），并提示与外部 mcp-client 实例的 serverName 冲突；服务器可启用 / 停用（`disabled: true`）/ 编辑 / 删除。
- **能力公告注入 systemPrompt**：注入能力公告（systemPrompt section），提到「MCP 配置 / MCP 服务器」时模型知道指本插件。

![MCP 服务器配置卡片：添加 / 连接测试 / 热加载](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-mcp.png)

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
