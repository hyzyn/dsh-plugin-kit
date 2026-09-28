# 排障：跨包通用路径

> **本文是「跨包通用故障诊断路径」的唯一归宿。** 包内特有症状见各包 README；
> 术语见 [glossary.md](./glossary.md)；架构见 [architecture.md](./architecture.md)。

## 通用顺序

不确定从哪看起时，按这个顺序走（前一步能定位就不要跳到后面）：

1. **看进程是否活着**：`dsh web` 的终端窗口 / 日志。宿主整个退出与单个插件坏掉是两类问题。
2. **看插件行是否挂载**：`dsh --profile web --dump-config`。
3. **看卡片在不在**：插件配置页。**卡片不在 = 宿主半体没挂载**；卡片在但功能不动 = 宿主半体的问题。
4. **看路由是否注册**：未注册回 **404**，注册了但被围栏挡回 **401/403**。两者含义完全不同。
5. **看产物是否最新**：`pnpm -r build` 后 `git diff --exit-code -- 'packages/*/client.js' ':(glob)packages/*/lib/**'`。
   改了源码没重建 → 浏览器半体永远是旧的。（`:(glob)` 为什么必需 → [conventions.md § 真机脚本与 CI 接线](./conventions.md#真机脚本与-ci-接线)）
6. **真机 / 真浏览器**：见 [agent-real-test.md](./agent-real-test.md)。

## 安装与挂载

<details>
<summary><strong>装完重启了，插件配置页里还是没有条目？</strong></summary>

先确认插件装进了 `web` profile（命令里的 `--profile web`），再用
`dsh --profile web --dump-config` 确认插件配置层已挂载。**页面刷新不够，要重启 `dsh web` 进程。**

</details>

<details>
<summary><strong>装好的插件「整体消失」（卡片、插件行、工具全没了）？</strong></summary>

这种症状**多半不是插件坏了，是 profile 的依赖树没了位置**：插件在 `import` 阶段就
`Cannot find package`，根本没机会挂载——所以界面上连报错都看不到，只能看到「什么都没了」。
判定入口因此不是插件代码，而是「依赖树还在不在 profile 里」。

Windows 上的一种成因（真机现场）：profile 的 `node_modules` 被换成了一个指向**别处**的链接
（那次指向盘根 `C:\`），原来那份完好的目录被改名成 `.ignored_node_modules`。三步自查与恢复：

1. `cmd /c dir /AL "<profile 目录>"` —— 出现 `<JUNCTION> node_modules [C:\]` 之类的行就是它；
2. `Test-Path "<profile 目录>\.ignored_node_modules"` —— `True` 说明那份完好的安装还在，只是被改了名；
3. 恢复：**完全退出 DSH** → `cmd /c rmdir "<profile 目录>\node_modules"` 删掉那个链接 →
   把 `.ignored_node_modules` 改回 `node_modules` → 重启宿主。插件随原样恢复，不需要重装。

**必须用 `rmdir`**：`Remove-Item -Recurse`（以及任何会「展开链接」的复制 / 删除）会**顺着链接递归**，
动的是链接目标里的东西——那次的目标就是盘根。同理，「复制 profile」也不能用会展开链接的复制。

为什么这种损坏会波及整个目录：DSH 给 profile 选的 `nodeLinker: hoisted` 会把整棵依赖树**平铺**，
而 pnpm 按 `realpath(profile/node_modules)` 算落点——一旦这一层是链接，树就铺进链接目标里，
之后每次 `pnpm add` 都失败且只留下残骸。

出处：2026-09-27 的故障报告（DSH 插件管理器把一个畸形 spec `\` 交给 pnpm；`\` 在 Windows 上被
解析成盘根，链接随后落在 `node_modules` **自身**上）。那次的 bundle 声明 / entry 合成 / 版本兼容
三层全部通过——**别先去插件代码里找原因**。

</details>

<details>
<summary><strong>报 <code>duplicate loader entry id</code>？</strong></summary>

多半是手工往 `~/.dsh/cordis.patch.yml` 加了**插件行**。删掉重复行——
插件行只由 bundle 补丁挂载，托管区块只放服务器配置。

另一种来源：web profile 里已经装过 `@hyzyn/dsh-all`（或任一子包），又 add 了仓库根包
（或 `packages/all`），两处挂载同一批插件。

</details>

<details>
<summary><strong>卡片在，但点了没反应 / 接口报 401、403？</strong></summary>

按**回环围栏**排查（见 [architecture.md § 一条请求经过什么](./architecture.md#7-一条请求经过什么)）：

- **401/403** = 路由已注册，但来源没通过围栏。用 `127.0.0.1` / `::1` 访问，别用局域网 IP；
  变更端点还需要**同源证明**——反向代理改写了 `Origin` 或 `Host` 会被挡。
- **404** = 路由压根没注册 → 回到「看插件行是否挂载」。

</details>

<details>
<summary><strong><code>npm install</code> / <code>npm view</code> 报 EPERM？</strong></summary>

本机 `~/.npm` 缓存存在 root-owned 文件（历史 npm bug）：

```sh
sudo chown -R $(id -u):$(id -g) ~/.npm
```

pnpm 不受影响。

</details>

<details>
<summary><strong>想知道某个插件当前装的是哪个版本？</strong></summary>

`dsh plugin` 只是把参数**转发给 pnpm**（`dsh plugin --profile <name> <pnpm args>`），
所以 pnpm 的查询命令直接可用：

```sh
dsh plugin --profile web ls @hyzyn/dsh-tty --depth 0
# → dsh-profile-web … └── @hyzyn/dsh-tty@0.22.0
```

手工路径是 profile 的 `package.json`（`~/.dsh/profiles/web/package.json` 的 `dependencies`），
**但它可能写的是范围**（`^0.6.0` 这种）；范围与实装不一致时以实装为准——实装版本的权威值在
`~/.dsh/profiles/web/node_modules/<包名>/package.json` 的 `version`。

提 issue 填的就是这个版本：抄到的是范围就照抄范围，别自己换算。

</details>

<details>
<summary><strong>改了插件代码不生效？</strong></summary>

重新 `pnpm build` 后**重启** `dsh web`。改的是浏览器半体时，还要清缓存或硬刷新。
仓库安装（`link:`）下改源码后必须重建产物——产物随源码入库，不重建就是旧字节。

</details>

## 兼容性校验

**① 被拦下时长什么样** —— 两种，都在「装」或「启动」的那一刻，不是运行中：
安装时抛 `incompatible-version`；或已经装上的行在启动时**整行 `disabled`**。
（出处：`RELEASING.md`「发布门槛」第 5 条）

**② 先判是哪一条下限** —— 判定依据是 `peerDependencies` 里的 `@deepseek-ai/dsh` /
`@deepseek-ai/dsh-*`（预发布参与范围匹配）；`dsh.engines.dsh` 是**市场展示位**，
宿主不读它，只有插件市场 / 社区条目按它展示。所以分两种情形：

- 宿主版本真的低于 **peer 下限** → 升插件或升宿主；
- 只有 `engines.dsh` 对不上 → 那是**仓库自己的展示不一致**（两条下限必须一致），
  `node scripts/check-dsh-peers.mjs` 会拦，与你的安装环境无关。

（出处：`RELEASING.md`「发布门槛」第 5 条；旧版 `README.md` 的系统要求段）

**③ 怎么临时放行，以及为什么它只是临时的** —— 把豁免写进 **profile 自己的** `compatibility.json`：

```sh
dsh plugin --profile <p> allow-version <pkg@ver> --dsh-version <ver> --accept-risk
```

它是临时的，因为豁免**写在 profile 里、不写进包**：换一个 profile 就要重写；
而且它绕过的是「这个版本组合没有被验证过」这件事本身——命令里那句 `--accept-risk` 就是这个意思。
（出处：`RELEASING.md`「发布门槛」第 5 条；旧版 `README.md` 的系统要求段）

> **cohort（那一串 `0.1.7-rc.x`）升级时该动哪些文件、按什么顺序动**，是**发布动作**而不是排障动作——
> 权威在 [RELEASING.md § 发布门槛](../RELEASING.md#发布门槛每次-tag-前过一遍)，本文不复制。

## 各插件的高频症状

> 只列「看一眼就知道去哪」的入口。完整排查见各包 README。

| 症状 | 先看 |
|---|---|
| MCP 服务器保存后没有工具 | 等 1~2 秒 HMR；卡片里的状态徽章与冲突提示；保存前先点「连接测试」。仍不行就查服务器进程能否启动、地址是否可达 → [mcp](../packages/mcp/README.md) |
| 模型调用 `mcp__codegraph__*` 报 `No CodeGraph project is loaded` | 默认项目没设或没索引 → codegraph 卡片「设为默认项目」/ 先 `codegraph index` → [codegraph](../packages/codegraph/README.md) |
| 终端面板连不上（浏览器正常、桌面版永远「连接中…」） | 客户端半体从 `location` 拼了地址 → `tty D61`，跑 `node scripts/client-lint.mjs` 会拦 → [conventions.md § 客户端半体](./conventions.md#客户端半体两条硬规矩) |
| 会话的进程已经退出，`tty_list` 里却还留着它（`exited:true`），`tty_send` 还报「只读保留」 | **预期行为**（`tty D77`）：退出转只读保留（默认**保留到显式关闭**，最多 8 条、超出按最旧淘汰），期间 `tty_capture` / `tty_screen` 仍读得到退出前的输出；要释放用 `tty_close`（agent 自己开的会话）或让用户在面板里关那个标签 → [tty README § 进程退出后的「只读保留」](../packages/tty/README.md#进程退出后的只读保留d77) |
| 隧道一直显示「连接中」而底下挂着报错 | 致命错误被重试路径覆写 → `tty D58`；先看端口是否被另一个 profile 的宿主占用 → [tty](../packages/tty/README.md) |
| 日志级别过滤「看着没生效」 | 级别前缀是 `%5p` 右填充（`[INFO ]`）→ `docker D135` → [docker](../packages/docker/README.md) |
| 桌面版容器日志 / 统计 / 活动 / 拉取永远「连接中断，正在自动重连…」，浏览器（`dsh web`）正常 | 桌面壳转发会删掉 `Origin` / `Sec-Fetch-Site`，撞上 docker 的「同源证明」→ `docker D139`；宿主日志里现在会打 `拒绝无同源证明的…（origin=无 sec-fetch-site=无 cookie=有）` → [docker README § HTTP 路由](../packages/docker/README.md#http-路由apidsh-docker-前缀全部-loopback-围栏) |
| 桌面版点「启动 / 停止 / 删除容器」「exec」报 `缺少同源证明` | 同 `docker D139`（变更类八条子路由与四条流同一道闸） |
| docker 目标连不上，回 500 | 目标侧失败（SSH 不可达 / 私钥读不到 / docker 不在 PATH）→ `docker D138`，应为 200 + `ok:false` |
| 同一个端口在两个 profile 里冲突 | 端口是**机器级资源**，profile 复制会把端口一并拷走 → `tty D60`；错开 webserver 端口与隧道 `localPort` |
| 面板显示「已索引」但 CLI 说索引过期 | 卡片接的是 CLI 的 `reindexRecommended` / `builtWithVersion` 信号 → codegraph 卡片的警告行 |
| 桌面版看不到浏览器里存的标签 / 配置 | **预期行为**：两者 origin 不同 → localStorage / IndexedDB 是两套独立存储 |

## 已知限制（跨包）

> 这些是**设计边界**，不是待修缺陷。包内的限制见各包 README。

- **MCP 托管区块**只应放服务器配置；手工追加插件行会导致 `duplicate loader entry id` 启动失败。
- **Codegraph 的 MCP 托管**只对齐 codegraph 一个服务器的工作目录。DSH 的 MCP 客户端暂不声明
  roots，切换项目需在卡片「设为默认项目」或调用工具时传 `projectPath`。
- **一台 codegraph MCP 服务器同一时刻只挂一个默认项目**，多项目是时分复用。
- **一个宿主进程里只能解析出一份 `@hyzyn/dsh-kit`**：kit 的跨插件一致性（授权存储、能力绑定，
  见 `kit D11`）靠**模块级单例**，而 pnpm 的 hoisted 布局只把一个版本提升到顶层、另一个嵌进
  消费者自己的 `node_modules` → 两份 kit = 两套单例（一个卡片授了权、另一个仍报未授权）。
  本仓同批发布时钉版一致（`scripts/check-kit-pins.mjs` 兜底），但**跨两次发布逐个升级**的用户
  会撞上窗口期：升级请整组一起（`@hyzyn/dsh-all`）。
- **Profile 删除是递归删除**，面板内二次确认，一旦执行不可撤销；内置 `web` 受保护，`headless` 可删。
- **RSS 首次启动需要联网抓取**；某个源不可达不会阻塞其它源，但当天 digest 可能缺该源内容。
  AI 摘要依赖宿主已配置的模型，未配置或调用失败时条目回落原文截断。
- **浏览器半体依赖官方 `dsh-web-app` 的设置面板 slots 服务**，非官方 Web GUI 可能不显示管理卡片。
- **桌面版与 `dsh web` 的 localStorage / IndexedDB 是两套独立存储**。
  桌面版是 secure context（`dsh-app` 已注册为 secure scheme），`navigator.clipboard` / `crypto.subtle`
  可用；用 IP 访问远端 GUI 则不是——客户端半体两侧分支都要能跑。
- **`tty` 的 resize 透传**依赖 DSH 内部 terminal handle 结构；TERM 注入需经 `-c` 包装层
  （DSH 硬编码 `node-pty name:"dumb"`）。
- **`docker` 没有交互式 TTY**：exec 是一次性命令，交互排障请到终端面板跑 `docker exec -it`。
  流式能力只在浏览器面板里，agent 侧的 `docker_logs` / `docker_stats` 保持快照语义。
- **仓库安装需要 Node.js ≥ 22.19 与 pnpm 10**，仅供开发调试；npm 安装不受影响。
