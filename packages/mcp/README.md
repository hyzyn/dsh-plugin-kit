# @hyzyn/dsh-mcp

中文 | [English](README.en.md)

> DSH **设置 → 插件** 里的「MCP 服务器配置」卡片：图形化维护 MCP 服务器，**保存即热加载**，不用重启宿主。

## 特性

- **保存即热加载**：改写 `~/.dsh/cordis.patch.yml` 的托管区块，DSH 的 HMR 监听自动重载，工具以 `mcp__<server>__<tool>` 注册给模型。
- **stdio 与 streamable-http 双传输**：stdio（command / args / env / cwd）与 streamable-http（url / headers，含 SSE 与 session 头）；值可写 `js:` 表达式，密钥不落补丁文件。
- **连接测试不经 MCP SDK**：宿主直接说 JSON-RPC（initialize → tools/list），返回协议版本 / serverInfo / 工具清单 / 耗时。启动子进程走 `@hyzyn/dsh-kit` 的 `spawnPortable`——Windows 上 MCP 服务器常是 `.cmd` shim，裸 `spawn` 会 `EINVAL`（Node 对 `.cmd` 的加固），连接测试会永久报错并误导成「CLI 没装好」；探测进程的 stderr 也用同库的容错解码器（UTF-8 优先、遇非法字节回落控制台代码页）读，卡片上不会出现 `���`。注意这只影响本插件的探测：**真正的工具加载**走 DSH 核心的 `@deepseek-ai/dsh-mcp-client`（官方 SDK + cross-spawn），本来就没这个问题。探测对**错误**也有判据：POST / GET 收到 401/403 当场报 `认证失败(HTTP 401)`（带 `WWW-Authenticate`），其它 4xx/5xx 报状态码——认证失败不会再被兜底成「SSE 流已结束」；`js:` 头或 stdio `env` 的值求值出 `undefined` 时（含被 base64 藏进 `Basic …` 的形态）在发请求 / 起进程前点名缺哪几个环境变量。
- **存活状态与命名冲突可见**：从 loader fiber 读存活状态（运行中 / 已停用 / 错误 / 加载中）。命名冲突分两档、**不混为一谈**（issue #5）：`conflicts` 只放**真正重名**的托管行——同名两个实例抢同一套 `mcp__<serverName>__*` 工具名，横幅只在这种情况下出现；本卡之外的实例清单走 `externalServers`，以中性信息条表达「这些名字已被本卡之外的实例占用，在本卡内别重名」。服务器可启用 / 停用（`disabled: true`）/ 编辑 / 删除。**「已挂载」不等于「连上了」**：fiber 存活状态由 loader 给出，而连不上时 `mcp-client` 的 apply 照常 resolve（`failOnStartupError` 默认 `false`，不抛错）——于是不可达的地址会一直显示成绿色「运行中」。现在 DTO 的每个托管行多带一个 `toolCount`（工具注册表里 `mcp__<serverName>__*` 的条数）：`active` 且 `toolCount === 0` 时徽标改显**「未连接」**（顶掉绿色的「运行中」），行下另给一条说明点明代价（每次启动都要为它等一次连接尝试）并配一个手边的「停用」按钮。读不到工具注册表时 `toolCount` **字段缺失**（不是 0），界面据此**不下结论**——绝不能把「读不到」渲染成「未连接」。
- **能力公告注入 systemPrompt**：注入能力公告（systemPrompt section），提到「MCP 配置 / MCP 服务器」时模型知道指本插件。

![MCP 服务器配置卡片：添加 / 连接测试 / 热加载](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-mcp.png)

设置面在宿主里的位置随 DSH 版本变，但**始终是同一份表单**：`0.2.0-rc.1` 起挂
`plugins.bundle.config`——**插件详情页「说明」正下方内联**，不必再点「>」进二级页；旧宿主
（0.1.6 线）自动回退到侧边栏「插件」页里该行的「>」子页，`≤0.1.5` 用设置页卡片。

## 会话档位与 agent 可见性

可见性规则只有一条，作用在 **agent 的工具面**上：会话档位回答「这一档能不能看见」。

- **受限档裁掉全部 `mcp__*`**：本插件在 `apply` 里经 `ctx.inject(['tools'])` 把 `mcp__` 前缀接进
  与 `docker` / `tty` 同一套裁剪（kit 的 `attachTierRestrict`）。`read-only` / `workspace-write`
  （且非 Auto review、且宿主组合了档位服务）下，agent 的工具表里**一个 `mcp__*` 都没有**；
  `danger-full-access` 不裁；宿主未组合档位服务时也不裁（与 `docker` / `tty` 同口径）。
- **一律按 `exec`（最坏类）处理**：某个 MCP 工具到底读还是写，本仓判不了（那是各 server 自己的
  语义），所以宁严勿松——只要这一档要裁，`mcp__*` 全部进裁剪名单。裁的是**工具面**（受限档的会话
  根本看不见它们，不是调用时才拒），本插件不接逐调用闸（`attachTierGate`）；工具面在**建会话 /
  工具集变化**时重算，不跟会话中途的档位切换。
- **成本看得见**：卡片每行显示这一行当前贡献了几个工具（DTO 的 `toolCount`；**字段缺失时显示
  「未知」——那是读不到注册表，不是 0**），已知工具数合计超过 80 个（`AGENT_TOOL_BUDGET`）时
  在列表上方给一行提示（停用行与读不到数的行不计入合计）——每加一行 server 都要付这份常驻工具面
  成本，用不上时停用（停用后不再注册工具）。
- **加 server 前先算总账**：根仓的 `pnpm mcp-budget`（[`scripts/mcp-tool-budget.mjs`](../../scripts/mcp-tool-budget.mjs)）
  对**正在跑的宿主**发一个只读 GET，按 server 报出各自注册的 `mcp__<server>__*` 工具数与合计；
  `--budget N` 超了退出码 1；`--json` 机器可读。它读的是**全局注册表**，与会话档位无关（受限档
  裁掉不代表没注册），per-agent 作用域挂载的 server（如 codegraph）**不计入**——报 `0` 是
  「不在全局层」不是「没工具」；完整语义见脚本文件头。
- **「按 prefix 裁」只裁继承层**：限制下在 agent 作用域上，覆盖的是从插件层继承下来的那一层。
  codegraph 的 per-agent 挂载挂在 agent 自己的层（不在全局 `schemas()` 视图里），因此**不受**本
  裁剪影响。

判据与运行期实测见 [docs/permission-tier-plan.md](../../docs/permission-tier-plan.md) 的「`mcp__*`」条。

## 结构

| 文件 | 说明 |
| --- | --- |
| `src/index.ts` | 宿主半体：托管区块读写、校验、状态读取、JSON-RPC 探测、`/api/dsh-mcp/*` 路由（loopback-only 围栏） |
| `client.js` | 浏览器半体：注册 `settings.plugin.item` 卡片（React 外壳 + 纯 DOM 管理面板，`window.__ModuleLoader__.load` 格式） |
| `cordis.patch.yml` | bundle 补丁：把插件行插入 profile 阵容 |

路由（仅限 loopback + 同源）：

- `GET /api/dsh-mcp/servers` —— 列表 + 状态（含每行的 `toolCount`，见下）+ **真重名**（`conflicts`）/ 本卡之外实例清单（`externalServers`）。**DTO 读取失败返回 500 + 原因原文**：宿主 webserver 对 handler 抛错只回空 400，界面上什么都看不到（围栏已过，回原文是安全的，也让下次出问题一眼可查）
- `POST /api/dsh-mcp/servers/save` —— 整体保存（校验后写回托管区块）
- `POST /api/dsh-mcp/test` —— 用表单配置做一次连接测试

**围栏**（2026-09-25 起与 `docker` / `tty` 同一档）：回环围栏走 `@hyzyn/dsh-kit` 的
`isLoopbackRequestStrict`（127/8 全段 + 别名主机名的 DNS 确认），上面两条写操作**另需同源证明**
（`Sec-Fetch-Site: same-origin` 或同源 `Origin`；两者都缺省时只放行带宿主会话 Cookie 的请求，
即桌面壳那条转发链——见 `docker D139`）。只读的 `GET /servers` 不要求证明，裸 curl 也能读。
成因与实现只有一份，在 `packages/kit/src/http.ts`。

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
- **空列表必须显式确认才能清空**：`/servers/save` 是整表替换语义，`servers: []`
  等于清空托管区块。为防止启动竞态 / 陈旧卡片拿到空列表后把已配置的服务器静默抹掉
  （实测踩过：文件里只留下 `- insert: []`，事后无法判断是谁清的），宿主对
  「空列表且未带 `clearAll: true`」的保存返回 400，并在文案里说明会清掉几条；
  卡片只在用户明确删除最后一条时才带上该标记（删除确认文案也会点明这一点）。
  区块本来就是空的（本来就没有条目）不构成破坏，放行——保存一张空卡片不会报错
- 连接测试的 `!!js` 表达式在宿主内评估（与 loader 相同的信任模型）
- **「已挂载但没连上」的判据是工具数，不是 fiber 状态**：工具是「连接成功 + `tools/list`」
  之后唯一会留下的产物，所以数它就等于拿到真实连接态，而且零成本（只遍历内存里的工具注册表，
  不做任何网络探测）。归因按 `mcp__<serverName>__` 前缀，字符规则与核心
  `@deepseek-ai/dsh-mcp-client` 的 `publicName()` 一致；serverName 上限 32 字符，前缀永远落在
  核心 51 字符的截断线之内，所以前缀归因可靠——万一出现会被截断的超长前缀，那一行**跳过不猜**。
  `disabled` 的行本来就不该有工具，不计入「未连接」。注意它**不改变启动耗时**：地址不可达时
  启动仍要为那行等一次连接尝试（约 10s；能连上但不回应最长 60s），想省掉就把那行停用
- 浏览器半体为手写 ESM（React 外壳经 `__ModuleLoader__` 的 `require` 解析，面板本身是纯 DOM），无需 tsdown；宿主半体 tsc 直出 ESM

## 排障：`server is disconnected` 怎么分诊

**症状几乎一样，成因分四档，修法完全不同。** 别从凭据开始猜——先按下表定位到一档，
再动手（2026-10-24 一次真机事故里，**三档同时存在**：缺注入 + 没连 VPN + 重连预算耗尽，
每层单独看都像「认证失败」，这是它难查的原因）。

| 判据（一条可粘贴命令 / 一处证据） | 结论 | 修法 |
|---|---|---|
| `nc -z <host> <port>` 不通（内网地址还要先看 `ping` 是否 100% 丢包） | **网络不可达**——与插件、凭据都无关 | 连 VPN / 换到能到那台机器的网络 |
| 端口通，但宿主日志尾部有 `giving up after N consecutive failed reconnect attempts` | **重连预算已耗尽**：`reconnect.maxAttempts` 默认 10 次（`RECONNECT_DEFAULT_MAX_ATTEMPTS`）用完后就放弃并注销该服务器的工具，之后网络恢复它**也不会再试** | **重启宿主**（或对该插件做一次 HMR 重载） |
| 端口通、日志里没有放弃记录，但仍未连接 | 连接还在建立中或刚失败待重试（首次连接约 10s，能连上但不回应最长 60s） | 等一个重连周期；持续失败就按上一档处理 |
| 401 / 工具数是 0 | **凭据未注入**：`!!js process.env.X` 求值成 `undefined`，拼出 `Basic base64("undefined:undefined")` 这种**合法但错误**的串，服务器只会回 401 | 装并启用 `@hyzyn/dsh-env`，确认这些键**真的写进了宿主进程**（`env` 在同步预注入后才 `provide` `dshEnvReady`） |

重连的另外两个默认值同上，退避是**从初始值指数翻倍、封顶**：

- `reconnect.initialDelayMs` 默认 500 ms（`RECONNECT_DEFAULT_INITIAL_DELAY_MS`）；
- `reconnect.maxDelayMs` 默认 30000 ms（`RECONNECT_DEFAULT_MAX_DELAY_MS`），也是退避的上限。
- 上面那三个数都写成了具名常量：改它们**构建期不会有任何东西报红**，但本节的数字由
  `scripts/check-readme-facts.mjs` 现算校验——**改了就要回来改这一节**。
- `maxAttempts` 是**连续失败**的预算：一次成功连接存活超过 `maxDelayMs` 后预算会重置，
  所以「断过一次」不等于「下次一定放弃」。

三条配套判据：

- **认证头是否已经算对**：`!!js` 由 loader 在激活 `mcp-client` 那条 entry 时求值（`process` 是宿主进程的），
  不是本插件求值的——本插件的 `evalValue()` 只服务于「连接测试」按钮。所以「卡片看起来正常、
  agent 侧却连不上」通常不是本插件的问题，往上面那张表查。
- **连接测试能给出凭据那一档的判词**：它会把「引用的环境变量 X 在当前宿主进程里没有值（未注入）」
  直接写进结果，而不是含糊的 401。**但这条检查只在点「连接测试」时才跑**，不覆盖启动时的连接。
- **重启是重连预算耗尽后的唯一出路**：`enabled: true` 只表示「失败后会重试」，不表示「会永远重试」。
