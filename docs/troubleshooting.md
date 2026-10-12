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

**2026-10-11 实测（dsh 0.2.1-alpha.2 / Node v22.23.2）**：上面这句报错**只属于旧版宿主**。
旧版现场还留在本机 `~/.dsh/dsh-safe/last-failure-web-copy.log`（2026-09-06）：原文是
`Error: dsh: plugin tree failed to load: failed to apply loader entry include (cordis:include):
duplicate loader entry id: describe-image`，由 `EntryGroup.update` 抛出、**宿主启动失败**。
现在装的 `@deepseek-ai/cordis-plugin-loader@1.0.6-alpha.1` 全文 grep 不到这个字符串，
两个独立 bundle 各 insert 同一个 id 时宿主**照常启动**——只有**组合顺序里靠后的那行生效**。

所以「没报错」**不等于**「没撞名」：撞名现在是**静默的**，只能自己数。

| 四格 | 2026-10-11 实测结论 |
|---|---|
| **症状** | 宿主不报错、不退出；`--dump-config` 里同一 `id` 出现**两行**，运行期只有一行生效 |
| **谁赢** | **组合顺序里靠后的那个**：`dsh.profile.bundles` 越靠后越赢；home 层（`~/.dsh/cordis.patch.yml` 的手工行）叠在 bundle 层之后，所以 home 行会盖掉 bundle 行（实测：home 行即使 `name` 解析不到，被尝试挂载的仍是它 → 报 `failed to import`，**不回退**到 bundle 行） |
| **有没有日志** | **没有**。stdout/stderr 一个字都不提重名（对照：只有当**胜出那行**的 `name` 解析不到时，才会出现 `dsh: warning: 1 entry did not activate` + `<id> (<name>): failed to import`） |
| **能不能自愈** | 不能，也不会报——被覆盖的插件**永远不挂载**，界面上只像「这个插件没装」。修法是删掉/改掉重复行，重启没用 |

自查三步（可复制；`<entry-id>` 换成你的插件行 id）：

```sh
# ① 组合层：同一 id 出现两次就是撞名——这是唯一能看见它的地方
dsh --profile <profile> --dump-config | grep -n 'id: <entry-id>'
# ② 看赢家是谁：第 ① 步最后一行 id 下面那个 name 才是真正挂上去的
dsh --profile <profile> --dump-config | sed -n '/id: <entry-id>/,+1p'
# ③ 找第二个来源：profile 的 dsh.profile.bundles 顺序，以及 home 层的手工行
grep -n 'insert:' -A2 ~/.dsh/cordis.patch.yml
```

撞名重灾区是**通用词 id**（`logs`、`storage`、`search` 这类）：生态里 `dsh-logbook` 的 entry id
就是 `logs`，碰上另一个日志插件时**谁在组合顺序后面谁赢**，输的那个静默消失。改 id 是唯一根治。

**2026-10-12 隔离 profile 实测：两个各自独立的 bundle 各 insert 同一个 id**（上表四格的实测证据；与
[architecture.md §4](./architecture.md#4-谁写哪个文件跨包冲突的唯一来源) 登记的那一侧——**手工往同一个 patch 文件追加**——是两回事）。

装置（一次性、跑完即删；**全程独立 `DSH_HOME`**，真实 `~/.dsh` 只读）：

```sh
# ① 隔离 home + 一次性 profile（用 dsh 自带的 web 模板，不含任何用户插件）
WORK=$(mktemp -d /tmp/dsh-loaderid-XXXXXX); export DSH_HOME="$WORK/dsh-home"; mkdir -p "$DSH_HOME"
dsh --profile loaderid --from-default-profile web --dump-config

# ② 两个各自独立的 bundle 包（各有自己的 dsh.bundle.patch，各自 insert 同一个 id）
#    bundle-<x>/cordis.patch.yml：  - insert: [- id: clash-probe, name: '@probe/stub-<x>']
#    外加两个最小 stub 插件包（挂载时打 [probe-<x>] mounted、写 marker、注册一条 /api/probe-<x>/ping）
dsh plugin --profile loaderid add link:$WORK/pkgs/bundle-a link:$WORK/pkgs/bundle-b
(cd "$DSH_HOME/profiles/loaderid" && pnpm add link:$WORK/pkgs/stub-a link:$WORK/pkgs/stub-b)
#    stub 也必须是 profile 的依赖，否则 insert 行的 name: 解析不到——那是另一类症状（failed to import）

# ③ 组合层：同一个 id 两行，上方 `# ==` 标明各自来自哪个 bundle
dsh --profile loaderid --dump-config | grep -n -B1 'id: clash-probe'

# ④ 起真宿主（判据：日志里出现带 token 的 URL）
dsh --profile loaderid --no-open --port 32142
```

两个 stub 各走**三条互相独立**的通道（stdout 一行、marker 文件、HTTP 路由），免得「日志被吞掉」被误判成「没挂载」。

| 四格 | 2026-10-12 实测结论（dsh 0.2.1-alpha.2 / Node v22.23.2；两个独立 bundle，同 id `clash-probe`） |
|---|---|
| **症状** | 宿主**照常启动、照常服务**（带 token 的 URL 与平常一模一样）；输的那个插件**整块消失**——它的 `apply()` 从未被调用（marker 不生成、挂载日志不打），所以它注册的路由 / 卡片 / 工具在运行期根本不存在：实测 `GET /api/probe-a/ping` → **`404 not found`**，而赢家同一条 → `200 {"probe":"b"}`。全程没有任何报错或提示。 |
| **谁赢** | **组合顺序里靠后的那个 bundle**（`dsh.profile.bundles` 数组越靠后越赢），两个方向都实测：顺序 a,b → 只有 `[probe-b] mounted`；顺序 b,a → 只有 `[probe-a] mounted`。机制在已装的 `@deepseek-ai/cordis-plugin-loader@1.0.6-alpha.1` 的 `lib/index.js:78-93`：`newMap = Object.fromEntries(config.map((o) => [o.id ?? Symbol('anonymous'), o]))` 按 id 建 Map，**同 id 后写覆盖先写**，先写那条在 `create()` 之前就被丢掉（该文件全文 `grep duplicate` **0 命中**）。 |
| **有没有日志** | **一条都没有。** 宿主 stdout/stderr 全文就两行（逐字）：`[probe-b] mounted` 与 `dsh web: http://127.0.0.1:32142/?token=…`——没有 `duplicate loader entry id`、没有 `warning`、没有 `failed to import`、没有 `N entry did not activate`。loader 源码里 `duplicate` 这个串也 `grep` 不到：**不是「打了没看见」，是这条日志路径不存在**。对照组（两个 bundle 用不同 id）同样干净，区别只是两行挂载日志都在。**唯一看得见撞名的地方是组合层**：`--dump-config` 里同一个 id 出现两行。 |
| **能不能自愈** | **不能。** ① **重启**——同顺序复跑两次，赢家逐次一致；② **换顺序**——赢家会翻（这是「变脸」不是修好：输的那个换人，症状还在）；③ **从 `dsh.profile.bundles` 去掉其中一个 bundle**——另一个立刻正常挂载（实测 `[probe-a] mounted`）；④ **用户层 patch 写 `- id: clash-probe` + `disabled: true`**——**两个都不挂**（该 id 上只剩生效的那一条，禁掉它不会把被压住的另一条放出来），日志依旧一条没有；⑤ **手工往 home 层 `$DSH_HOME/cordis.patch.yml` insert 同一个 id**——**home 行赢**（实测 `[probe-a] mounted`；组合层里同一 id 出现**三**行）。**唯一根治：改 id。** |

对照组（同一套装置，每次只改一个变量；每一行都是真宿主跑出来的）：

| 变量 | 谁挂载了 | `GET /api/probe-a/ping` / `probe-b` |
|---|---|---|
| 两个 bundle 用**不同** id（`probe-alpha` / `probe-beta`） | 两个都挂 | `200` / `200` |
| 同 id，bundle 顺序 **a,b** | 只有 `probe-b` | `404` / `200` |
| 同 id，bundle 顺序 **b,a** | 只有 `probe-a` | `200` / `404` |
| 同 id，顺序 b,a，**再跑一次** | 只有 `probe-a`（与上次逐字相同） | — |
| 同 id，但把 bundle-b 从 `bundles` 里移除 | 只有 `probe-a` | — |
| 同 id，profile patch 里 `disabled: true` | **两个都不挂** | — |
| 同 id + home 层手工 insert（指向 `probe-a`） | 只有 `probe-a`（home 赢） | — |

**用户侧排查顺序**（症状是「某个插件明明装了、却像没装：卡片不见 / 路由 404 / 工具不在」，而同一个 profile 里还有另一个插件在跑）：

1. **先分诊「撞名」还是「真没装」**：拿该插件包**自己** `cordis.patch.yml` 里的 `id:`（别猜）去数组合层——用上面「自查三步」的第 ① 步。同一 id 出现两行（或更多）就是撞名；上一行的 `# == <bundle 或 patch 文件>` 告诉你是谁写的。
2. **判赢家**：该 id **最后**一条的 `name:` 才是真正挂上的那个（**顺序即胜负**，与插件新旧、装载耗时无关）。
3. **找第二个来源**：`<profile>/package.json` 的 `dsh.profile.bundles`（越靠后越赢）与 `$DSH_HOME/cordis.patch.yml` 的手工行（叠在 bundle 之后，实测能盖掉两个 bundle）。
4. **别去翻插件代码，也别等日志**：这一类的宿主日志是干干净净的两行，全部线索都在第 1 步的组合层里。
5. **处置**：给其中一个**换 id**（唯一根治，改完重启宿主）；只想先把另一个救活，就把它从 `dsh.profile.bundles` 里去掉。**别拿用户层 patch 的 `disabled: true` 当解法**——实测那样两个都不挂。

**这一次没测到的**（别当成结论）：① 两个 bundle 争同一个 id 且**其中一个 `name` 解析不到**时的表现（2026-10-11 那行记的是 home 行 name 解析不到会报 `failed to import`，本次两个 name 都能解析）；② 三个以上 bundle 争同一个 id；③ bundle 层里 `insert` **之外**的 id 目标 patch（`config` 等）在同名下的落点——只测了 `disabled`；④ 浏览器面板里的具体呈现（本格用的是宿主侧三条通道 + HTTP 状态码）；⑤ 本次隔离 setup 的隔离 home 下没有生成 `logs/` 目录（真机安装里 `ctx.logger` 的落点是 `<DSH_HOME>/logs/startup-*.log`），所以「有没有日志」这一格的证据面是 **stdout/stderr 全文 + loader 源码**，不是「翻遍了每一个可能的文件」。

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
`@deepseek-ai/dsh-*`（预发布参与范围匹配；范围是**逐 cohort 用 `||` 写全**的，
例如 `^0.1.7-rc.2 || ^0.2.0-rc.1 || ^0.2.0-rc.2 || ^0.2.1-alpha.1 || ^0.2.1-alpha.2`，命中任一段即放行）；`dsh.engines.dsh` 是**市场展示位**，
宿主不读它，只有插件市场 / 社区条目按它展示。所以分两种情形：

- 宿主版本落在**所有 cohort 段之外** → 升插件或升宿主；
- 只有 `engines.dsh`（最低档）对不上 → 那是**仓库自己的展示不一致**（它必须与 peer 覆盖的最低档一致），
  `node scripts/check-dsh-peers.mjs` 会拦，与你的安装环境无关。

（出处：`RELEASING.md`「发布门槛」第 5 条；旧版 `README.md` 的系统要求段）

**③ 怎么临时放行，以及为什么它只是临时的** —— 把豁免写进 **profile 自己的** `compatibility.json`：

```sh
dsh plugin --profile <p> allow-version <pkg@ver> --dsh-version <ver> --accept-risk
```

它是临时的，因为豁免**写在 profile 里、不写进包**：换一个 profile 就要重写；
而且它绕过的是「这个版本组合没有被验证过」这件事本身——命令里那句 `--accept-risk` 就是这个意思。
（出处：`RELEASING.md`「发布门槛」第 5 条；旧版 `README.md` 的系统要求段）

> **cohort 列表（当前是 `0.1.7-rc.2` + `0.2.0-rc.1` + `0.2.0-rc.2` + `0.2.1-alpha.1` + `0.2.1-alpha.2`）变更时该动哪些文件、按什么顺序动**，是**发布动作**而不是排障动作——
> 权威在 [RELEASING.md § 发布门槛](../RELEASING.md#发布门槛每次-tag-前过一遍)，本文不复制。

## 各插件的高频症状

> 只列「看一眼就知道去哪」的入口。完整排查见各包 README。

| 症状 | 先看 |
|---|---|
| MCP 服务器保存后没有工具 | 等 1~2 秒 HMR；卡片里的状态徽章与冲突提示；保存前先点「连接测试」。仍不行就查服务器进程能否启动、地址是否可达 → [mcp](../packages/mcp/README.md) |
| 模型调用 `mcp__codegraph__*` 报 `No CodeGraph project is loaded` | 默认项目没设或没索引 → codegraph 卡片「设为默认项目」/ 先 `codegraph index` → [codegraph](../packages/codegraph/README.md) |
| 终端面板连不上（浏览器正常、桌面版永远「连接中…」） | 客户端半体从 `location` 拼了地址 → `tty D61`，跑 `node scripts/client-lint.mjs` 会拦 → [conventions.md § 客户端半体](./conventions.md#客户端半体六条硬规矩) |
| 会话的进程已经退出，`tty_list` 里却还留着它（`exited:true`），`tty_send` 还报「只读保留」 | **预期行为**（`tty D77`）：退出转只读保留（默认**保留到显式关闭**，最多 16 条、超出按最旧淘汰），期间 `tty_capture` / `tty_screen` 仍读得到退出前的输出；要释放用 `tty_close`（agent 自己开的会话）或让用户在面板里关那个标签 → [tty README § 进程退出后的「只读保留」](../packages/tty/README.md#进程退出后的只读保留d77) |
| 重启宿主后，本来就停在提示符上的 tmux / SSH 会话在 tty_list 里显示「命令状态未知」 | **预期行为**（tty D88）：running 的三态里，「未知」= **宿主本次启动之后没见过该会话的 OSC 133 标记**（tmux 会话的提示符是很久以前画的，重连 / 重画都不会重发标记），**不是**「没在跑」，更不是坏了。对它发一个回车（tty_send 的 keys 用 ["Enter"]）或跑一条命令，标记补上即变 `[空闲]`；非持久 SSH / fish·csh / Windows 本地永远没有标记 → [tty README § agent 工具](../packages/tty/README.md#agent-工具) |
| 终端面板的标签**整体**消失、过一会儿又自己回来（PID 变了） | 先读生命周期留痕：`grep '\[dsh-tty\]' ~/.dsh/logs/startup-*.log`（`ctx.logger` 的输出去那里，`console.log` 不去）。`插件挂载（本进程第 N 次…）`**出现两次** = 插件被**重挂**过（会话表随实例一起换掉）；`面板连接断开（…N 个会话 → 转孤儿，Xs 内没重连就回收）` + `断线保活已过（Xs）：回收 N 个孤儿会话…` = 面板断线超过保活期、被回收器收掉。tmux 持久标签靠 `tmux -A` 按名接回（会话是新建的，PID 自然变），**非 tmux 会话的内容不可恢复**；仍未定性，见 [tty ROADMAP § 待办](../packages/tty/ROADMAP.md#待办8-项--2-条待定性缺陷) → [tty README § 会话持久化（tmux）](../packages/tty/README.md#会话持久化tmux0100) |
| 隧道一直显示「连接中」而底下挂着报错 | 致命错误被重试路径覆写 → `tty D58`；先看端口是否被另一个 profile 的宿主占用 → [tty](../packages/tty/README.md) |
| 日志级别过滤「看着没生效」 | 级别前缀是 `%5p` 右填充（`[INFO ]`）→ `docker D135` → [docker](../packages/docker/README.md) |
| 桌面版容器日志 / 统计 / 活动 / 拉取永远「连接中断，正在自动重连…」，浏览器（`dsh web`）正常 | 桌面壳转发会删掉 `Origin` / `Sec-Fetch-Site`，撞上 docker 的「同源证明」→ `docker D139`；宿主日志里现在会打 `拒绝无同源证明的…（origin=无 sec-fetch-site=无 cookie=有）` → [docker README § HTTP 路由](../packages/docker/README.md#http-路由apidsh-docker-前缀全部-loopback-围栏) |
| 桌面版点「启动 / 停止 / 删除容器」「exec」报 `缺少同源证明` | 同 `docker D139`（变更类八条子路由与四条流同一道闸） |
| docker 目标连不上，回 500 | 目标侧失败（SSH 不可达 / 私钥读不到 / docker 不在 PATH）→ `docker D138`，应为 200 + `ok:false` |
| 容器日志 / 刷新列表偶发失败，报 `SSH exec 失败：(SSH) Channel open failure: open failed`（远端 sshd 侧原文 `error: no more sessions`） | 到该目标的**那条** SSH 连接被 `MaxSessions`（默认 10）打满：长流（聚合日志 ≤6 + 事件 + 统计）最多 8 条，余下两条要装下全部短命令（列表 / inspect / 日志快照 / agent 工具）→ `docker D150`。**先别只顾点「重试」**：关掉其它面板与标签页的实时跟随（尤其聚合日志）再试；要根治就在那台主机上 `printf 'MaxSessions 50\n' > /etc/ssh/sshd_config.d/10-dsh-maxsessions.conf && sshd -t && systemctl reload ssh`（reload 只影响新连接）→ [docker](../packages/docker/README.md) |
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
