# @hyzyn/dsh-docker

中文 | [English](README.en.md)

> DSH 侧边栏「容器」面板：本机与 SSH 主机的容器一屏巡检——读日志、看资源、进容器、启停删，**默认只读**。

## 特性

- **常驻会话右侧栏**：面板作为右侧栏标签（`sidebar.right.pane.tab`）与对话**同屏**——发完错误交给 Agent
  后日志留在右边；折叠即退出视野并主动断流、把 SSH 通道还回去。面板级状态（目标 / 视图 / 过滤词 /
  选中容器及页签）**跨会话保留**；拿不到右侧栏服务的老宿主退回 dock / 模态。
- **日志右键交给 Agent**：日志页拖选报错行 → 右键「直接发送到当前会话 / 填入输入框，我先改改」，投递
  「选中的行 + 目标 / 容器 / 时间窗 + 前后各 20 行上下文」（会进模型上下文，菜单里明写留意凭证）；回执
  两处：视口级 toast，以及终端面板开着时**自动折起终端**（`ttyPanel` 契约 v2）。改稿走「填入输入框」
  ——**编辑面只有会话输入框一个**。
- **一键连接本机 / 多目标聚合取数**：两个**非常驻**入口（空态主按钮 / 目标下拉末项）一次点击就加上本机
  目标（agent 侧 `docker_connect_local`）；总览对全部 `targets[]` 并行取数，单个目标不可达只污染自己
  那一格（`docker_ps target:"*"` 同一口径）。
- **「需关注」读权威字段**：不健康 / 反复重启 / OOM 被杀 / 非零退出 / 僵死；OOM 与真实退出码由一次
  `docker inspect` 补齐——`docker ps` 摘要里的 137 分不出 OOM 与手动 kill（口径见 [总览](#总览跨目标与需关注口径)）。
- **排障闭环**：诊断页签把四路采集变成「结论 + 判据 + 证据 + 时间线 + 建议」，诊断历史再答「是不是在
  变坏」；「进程」页签给 `docker top` 快照；「磁盘」视图摊开可回收账与「谁在用」；概览底部反推一条可复现
  的 `docker run`。见 [容器诊断](#容器诊断为什么不行) 与 [诊断历史](#诊断历史它是不是在慢慢变坏)。
- **四条 SSE 长流共用一套基建**：日志 FOLLOW、`docker stats`、`docker events`、`docker pull` 走同一个
  `openSseStream`（心跳 / 活跃流登记 / 断开清理 / 管道起来后先发一帧 `ready`），差异只在收尾语义；聚合
  日志把多个容器装进**一条** `/logs/stream?ids=…`。「连上了」与「在收数据」是两件事：客户端只认 `ready`。
  见 [SSE 事件协议](#sse-事件协议logsstreamstatsstreameventsstreamimagespullstream)。
- **默认只读，两个独立开关**：`allowMutations`（容器启停删 + 镜像删除 / 清理 / 拉取）与 `allowExec`
  （一次性 `docker exec`）；关闭时对应 agent 工具**不注册**、
  HTTP 路由 403（能力不存在，而非调用后报错）；提权走两条带外通道（启动环境变量 / 卡片里就地确认）。
  容器名与 ID 过白名单，命令一律 argv 构造 + 单引号转义，密码 / 口令以 `env:NAME` **凭据引用**且永不回传
  浏览器。
- **与 dsh-tty 数据级复用、代码级不耦合**：不 import 任何 tty 代码，两者可各自安装与升级；装了 tty 则消费
  三个可选扩展点（`ttyConnbar` / `ttyTerminal` / `ttyPanel`），未装或版本不足逐项静默降级。

## 与 dsh-tty 的关系

本插件自成一体：不 import 任何 tty 代码，tty 也无需改一行源码；装了 tty 就在下面这些可选扩展点上
协作，没装则安静降级。

| 维度 | 说明 |
| --- | --- |
| 插件形态 | 独立包 `@hyzyn/dsh-docker`，可各自单独安装、各自升级 |
| 连接簿 | SSH 目标可**引用 tty 连接簿条目名**（只读 `ctx.settings.get('tty')` 的 `sshHosts`）；tty 未安装时退化为「内联 host/username」或本机目标 |
| 主机指纹 | 本插件自持一份 `hostKeys`（TOFU），并**优先以 tty 已记录的指纹作种子**——同一主机不必在两处各确认一次 |
| 执行通道 | 自持池化 SSH exec（`src/ssh-exec.ts`），与 tty 的 PTY 会话完全独立，互不占名额 |
| 上下文入口 | tty ≥ 0.13.0 时可选消费 `ttyConnbar`，在 SSH 连接栏（SFTP 旁）插入「容器」按钮（**注册即显示**），目标在点击时按当前会话解析；**本插件自己开的 exec 标签除外**（判定走 `spawnSpec.command`）；tty 未装 / 版本过旧则静默跳过 |
| 面板承载 | **默认走会话右侧栏标签**（`sidebar.right.pane.tab`），框架侧边栏入口只负责打开或聚焦它、**页类型在同一栏内去重**；**终端连接栏**的入口相反——它长在盖满视口的 tty 弹窗上，开标签会被挡住，所以走 `ttyPanel.mountPane` 停靠到终端右侧（**入口决定承载**）。拿不到右侧栏服务（老宿主）或把 `localStorage['dsh-docker:carrier']` 置成 `modal` 时回退到 dock / 全屏模态。三种承载是**同一个组件**，只是外壳与几何不同 |
| 终端承载 | 交互式终端由 tty 承载（它才是 PTY 的所有者）。**右侧栏标签**：面板全屏（`sidebar.fullscreen`）时经 `ttyTerminal.mount` **就地嵌入**面板底部，否则经 `ttyTerminal.open` **开新标签**（同一容器重复点会**聚焦已有标签**——tty 契约 v3 的 `reuse`）；**dock** 承载一律开标签；**模态**承载就地嵌入。命令标签（`spawnSpec.command` 非空）在 tty 侧**不显示连接栏的扩展按钮区**（SFTP / 隧道都作用于连接本身，挂在 `docker exec` 标签上会误导）；本插件自己开的 exec 标签另不给「容器」入口。未装 tty 或版本不足时复制命令兜底。本插件不实现 PTY / xterm / 重连栈 |
| 分工 | **交互式排障**（`docker exec -it`、容器内 shell、TUI）由 tty 承载；**只读巡检与 agent 自动化**用本插件自己的 exec 通道 |

## 安装

```bash
dsh plugin --profile web add @hyzyn/dsh-docker              # npm 安装（发布后）
dsh plugin --profile web add link:$(pwd)/packages/docker    # 仓库开发调试
```

聚合包 `@hyzyn/dsh-all`（或仓库根 bundle）已包含本插件，一次装齐时不必单独 add。装完重启 `dsh web`，
侧边栏出现「容器」入口；「Docker 容器面板」卡片维护目标与开关，**保存即热生效**（`settings/updated`
触发重解析，无需重启）。

> 已在 web profile 里装过 `@hyzyn/dsh-all` 或根 bundle 时**不要**再 add 本包，否则插件行重复挂载，
> 启动报 `duplicate loader entry id`。

## 使用

两个入口，同一个面板。**默认承载是会话右侧栏标签**——入口只负责打开或聚焦它，面板与对话同屏。

![右侧栏标签承载：会话与容器面板同屏、面板全高；折叠即退出视野，不占屏](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-docker-tab.png)

- **侧边栏「容器」**（总入口）：任何目标都能用，包括本机 docker 与多目标切换。已打开则聚焦（页类型在
  同一栏内去重），不会开出第二个「Docker 容器」标签。
- **SSH 连接栏「容器」按钮**（上下文快捷方式，tty ≥ 0.13.0）：在 tty 面板的 SSH 标签里、SFTP 旁出现，
  **注册即显示**，点击直接用**当前会话那台主机**打开面板。目标在点击时解析：会话来自连接簿时按条目名
  匹配，否则按 `host:port`；**没配到目标也不藏按钮**——面板会带一条提示告诉你该怎么配。这条路径走
  **终端右侧的 dock**，不开右侧栏标签（按钮长在盖满视口的 tty 弹窗上，开标签会被挡住）。于是规则是
  「**入口决定承载**」：框架侧边栏点 → 右侧栏标签；终端弹窗里点 → 终端右侧 dock。

### 承载形态

| 承载 | 何时用 | 行为 |
| --- | --- | --- |
| **会话右侧栏标签**（默认） | 宿主提供 `sidebarRight` / `sidebarRightTabs` | 与会话同屏；折叠=退出视野但不丢状态；支持右侧栏的 fullscreen 铺满 |
| **终端右侧 dock** | 从**终端连接栏**的「容器」按钮进来，或拿不到右侧栏服务 / `localStorage['dsh-docker:carrier'] = 'modal'` 且 tty ≥ 0.16 面板开着 | 挂在终端面板右侧（拖宽 / 折叠 / ✕ 由 tty 提供，终端继续可用）；同一时刻只挂一个，挂上去会收掉前一个（例如 tty 自己的 SFTP）；tty ≥ 0.18.4 起**归属点它的那个标签**：切走收起、切回恢复、标签关掉一并收掉（收起期间 React 树与轮询保活） |
| **全屏模态**（兜底） | 上面两条都不成立 | 自带 backdrop、点击外部关闭；面板 z-index 高于 tty 弹窗 |

回滚到旧形态只要在控制台执行 `localStorage.setItem('dsh-docker:carrier', 'modal')`（`removeItem`
恢复默认）。这个开关是临时灰度用的，所以刻意没进 settings。

**状态保留**：面板看的是主机、不是工作区，所以 view / 过滤词 / 选中容器（含概览-日志-统计页签）/ 目标
都是**跨会话保留**的；容器详情内部的日志过滤与 LINES 开关跟具体容器绑定，不保留。**折叠标签会断开全部
实时流**（把 SSH 通道还回去），展开时重连——建流本来就带 `tail`，历史会自己补回来。

**跨会话粘性**：DSH 右侧栏的标签记录本身是**会话作用域**的，A 会话开的标签在 B 会话里并不存在；而面板
看的是主机，「切个会话它就没了」是纯损失。所以插件额外记一个「用户希望它开着」的意图：**切会话时自动
在新会话里把标签重开**，只有你点了标签的 ✕ 才停止。那个 ✕ 是**宿主**执行的，所以必须经
`registerCloseHandler` 登记才收得到——只靠面板自己的 `onClose` 会漏掉它。

**dock 兜底形态**（终端右侧栏）：

![docker 面板挂进终端面板右侧 dock：终端保持可见可用](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-docker-dock.png)

这条路径打开的面板**不会盖住终端**：tty ≥ 0.16 时它挂在终端面板右侧的 dock 里（可拖宽、可折叠成窄条、
✕ 收起），终端照常敲命令。dock 模式下卡片「终端」按钮改为**在同一终端面板新开标签**执行
`docker exec -it`；同时**不再渲染面板自己的头部**——标题与 ✕ 由侧栏标题栏承担，刷新与只读徽标并到
工具条**末尾并靠右**：左端留给目标 / 视图 / 搜索 / 筛选这些「过滤类」控件。

面板内：

![容器列表：目标选择 / 搜索与状态筛选 / 卡片动作条（查看 · 变更两组）](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-docker-panel.png)

- **切目标有过渡与保护**：选择器一变，下方仍是上一个目标的卡片（远端一次往返最长 20s）。过渡期间旧
  卡片去色并**锁住指针**（读起来是「另一批内容」而不是「坏了」，也避免照着旧列表操作——那会拿新目标
  当目标、用旧容器的 ID 发命令，真能停掉对端同名容器），新数据淡入落地；整块**绝对定位**，首卡位置与
  滚动高度不变。**切换失败则清空旧列表**并归到新目标的错误态，空态文案区分「读取失败」与「筛选过窄」。
- **目标选择**：面板先选目标（来自配置 `targets`，本机 / SSH）；只配了一个时默认选中它，agent 工具也
  可以省略 `target`。**会记住上次选的目标**（`localStorage` 的 `dsh-docker:last-target`，不落配置）：
  优先级是**连接栏指定 > 上次记住的（且仍存在）> 列表第一个**。换目标是**整段上下文切换**：上一个目标
  还在飞的请求一律作废（列表写入闸），不会出现「选择器已是目标2、卡片还是目标1 的容器」这种串台。
- **容器列表**：名称 / 状态 / 健康态 / 镜像 / 端口映射 / compose 项目与服务 / 短 ID；支持按名称或镜像
  **搜索**、按状态**筛选**、**自动刷新**（按 `pollIntervalSec` 轮询，切到镜像页会暂停且不显示该开关）。
  「含已停止」与「自动刷新」是**成组**的两个开关，搜索框是其中唯一可伸缩的项：宽面板下一行，窄栏
  （dock 520px）里才按组换行。
- **「活动」条（docker events 事件流）**：容器列表头部的可折叠窄栏（默认展开），跟着一条 SSE
  （`GET /api/dsh-docker/events/stream`，服务端跑 `docker events --filter type=container`）显示最近 8 条
  事件（时间 + 容器名 + 动作，`die` 带退出码）。它是**事件驱动刷新**的入口：收到事件后 500ms **防抖**
  触发一次列表重取，与 `AUTO REFRESH` 叠加而不互斥——轮询兜底，事件负责「刚发生」。事件只留在内存
  （环形缓冲 50 条），切页即关流，换目标清空。白名单只留九类生命周期动作（start / die / stop / kill /
  oom / health_status / destroy / rename / update）：`exec_*`、`archive-path` 这类噪音在服务端就丢掉。
  断开后**要手动重连**：进了 `closed` 就是终止态，活动条上出现**重连**按钮（`unsupported` 环境不给），
  工具条的 ⟳ 也一并重连；**AUTO REFRESH 刻意不重连**（塞进轮询会让已终止的流被不断重开），重连成功后
  补一次全量列表刷新。**重连被拒要说原因**（`D164`）：服务端主动拒绝时发一帧 `event: error` 带
  `message`，客户端把它**显示在活动条上**——只置 `closed` 会让「拒绝 → 回到原位」与「点了没反应」不
  可区分。**「在收事件」只认宿主那帧 `ready`**（响应头到达不算）。
- **聚合选择（临时多选聚合日志）**：工具条的 `聚合选择` 进入选择态——点卡片本体变成**勾选 / 取消**
  （动作条暂时收起，免得一边多选一边误点启停删），出现操作条：「已选 N 个容器」+ `聚合日志` + `取消`。
  `聚合日志` 至少需要 2 个容器、最多 **3 个**（超了按钮置灰并提示上限来由）。进入后复用 Compose 项目
  视图那套聚合日志，内容控制与单容器日志完全对齐，另有**按时间 / 按到达**排序与**暂停**。勾选是**临时
  的**：不持久化、不进 settings；切目标 / 切分段 / 关面板即失效，列表刷新后已消失的容器按 id 自动剔除。
- **按条件一键选中**（多选态）：操作条第二行给出条件 chip（`全部可见 / 不健康 / 需关注 / 已停止`，以及
  有勾选后的 `同镜像 / 同项目`），计数**按剩余名额截断**——chip 上写 3 就真的会选中 3 个。条件只在
  **当前筛选结果**里生效。
- **容器卡片**：与参考布局一致的「标签 + 值」行（镜像 / ID / 端口 / 创建 / compose）+ 一排图标按钮，
  **按「查看 / 变更」两组用竖线分隔**：

  | 组 | 按钮 | 说明 |
  | --- | --- | --- |
  | 查看 / 进入 | 终端、日志、资源占用 | 不改容器状态，只读模式下也永远可用。**终端按钮跑 `docker exec -it` 交互式 shell，不受 `allowExec` 门控**（那条开关只管本插件的一次性 exec 通道，见「已知限制」） |
  | 变更 | 启停、重启、删除 | 按破坏性递增排列；只在 `allowMutations` 开启后可用，未开启时整组置灰 |

  删除额外两点防护：破坏性配色 + 与「重启」之间留出间距，点击后仍需二次确认。**命令飞行期间整组
  锁住**：`stop` / `rm` 要等容器真的退出（最长十几秒），确认框保持打开并显示「执行中…」，其它变更按钮
  压暗置灰、正在跑的那个换成转圈，等列表刷新落地后才恢复。镜像的删除 / 清理走同一套确认框。点卡片本体
  进入概览。
- **容器详情（整栏视图）**：顶部为「返回 + 容器名 + 状态徽标 + 目标主机」，下方五个标签页——概览
  （`docker inspect` 权威数据 + 一次性 exec + 等价 `docker run`）、日志、统计、诊断、进程。从卡片的
  日志 / 统计图标可直接落到对应页签；诊断与进程**只在该页签被打开时才取数**（切走即不再请求）。
- **日志视图（紧凑两行）**：第一行 = 返回 + 容器名 + 状态 + 目标主机 + `LINES` / `TIMESTAMPS` /
  **`FOLLOW`** / `AUTO REFRESH`（开关 + 2/3/5/10s 间隔，仅日志页轮询）+ 刷新 / 关闭；第二行 = 标签页 +
  **常驻**的「过滤日志」输入框（有内容时浮出 ✕，Esc 也能清空）+ **级别门槛**（`全部级别 / INFO+ /
  WARN+ / ERROR+`）+ **导出**（`⬇ .log` / `⬇ .md`，导出**当前显示内容**）+ 右侧固定槽的行数统计。
  **两行的分工是刻意的**：第一行管传输与显示，第二行管内容——而第二行与聚合日志**完全同一套**（同一个
  级别内核、导出构建器、计数文案）。级别门槛的语义是「无级别前缀的行是上一条的续行，跟随其级别」，
  否则 `ERROR+` 会把堆栈拦腰截断。日志正文按级别着色，时间戳压暗，过滤命中高亮。
- **FOLLOW 实时日志流**：打开后从「定时拉快照」切为 **SSE 推送**（`GET /api/dsh-docker/logs/stream`，
  服务端跑 `docker logs --follow`），与 `AUTO REFRESH` 互斥（开流自动停轮询、开关置灰），关闭即回到
  快照并立即刷新。流式日志保留最近 **5000 行 / 4MB**（环形缓冲，超限丢最旧并提示一次；无换行的超长
  输出强制分片，内存恒有界），分片到达按 **150ms 合帧**渲染。**正文按窗口化挂载**（`D152`）：DOM 里只
  留「可见 + 上下各 24 行 overscan」，其余用上下垫高占位；行高是实测的、贴底时窗口锚在尾部，所以
  「自动贴底 / 上滚暂停 / 回到底部」的几何判定依旧精确；**换流 / 换容器 / 快照刷新会整代作废这批实测
  高度与锚点**（`D155`：快照行 id 是位置寻址，不换代就会拿另一代的高度算垫高）。显示层**不截断**：
  `LINES` 选多少就能滚到、能导出（真正的闸是缓冲与宿主的「输出上限（KB）」）。**断线重连由插件自己
  管**：首连带 tail 补历史，重连一律 `tail=0`——只补新行、**不重放历史**。**宿主侧背压**（`D153`）：
  单条流的暂存队列上限 8MB；日志与拉取这类**文本尾部流**溢出时丢最旧的帧、留最新，并推一条
  `skip{frames,bytes}` 让界面说明「中间断了一截，跟随继续」——**不再掐流**；skip 的账目是精确的（排队
  期间再次丢弃**原地更新**计数，`D156`；客户端把多批 skip 累加显示，重连成功即清零，`D157`）。统计 /
  事件这类结构化流仍走收尾重连。
- **概览**：`docker inspect` 的权威数据——状态与健康、退出码、重启次数与策略、端口映射、挂载（含只读
  标记）、网络与 IP、entrypoint 与命令、最近一次健康检查输出；下方可执行一次性 `docker exec`（需
  `allowExec`）。
- **日志**：`docker logs --tail` 的尾部快照（`LINES` 默认取设置卡片的「日志默认行数」），可切时间戳与
  `--since`。**两个闸要分清**：`LINES` 是**行数**上限，设置卡片的「输出上限（KB）」是**字节**上限——
  两者取小，字节先超就截断并给出横幅。要持续观察新日志就打开 `FOLLOW`（同一份 argv 加 `--follow`，
  无总超时、不受该字节上限约束，靠连接生命周期收尾）。

![日志页：级别着色 + 常驻过滤框 + 行数统计](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-docker-logs.png)

- **统计**：`docker stats --no-stream` 快照（CPU% / 内存用量与占比 / 网络 IO / 块 IO / PIDs），按
  `pollIntervalSec` 轮询刷新。统计页还有 **`FOLLOW` 实时跟随**：切到
  `GET /api/dsh-docker/stats/stream`（服务端跑**不带** `--no-stream` 的 `docker stats`，每秒一行），
  浏览器侧留 **60 个点**的环形缓冲画 CPU / 内存迷你趋势图。这条流**不会自然结束**，关闭语义是前端主动
  断；`docker stats` 自己退出时服务端发 `end`（reason=`stats-exit`）。
- **Compose 项目视图**：工具条第三段。把 `composeProject` / `composeService` 聚合成「项目 → 服务 →
  容器」，每个项目一行看全运行数 / 不健康数 / 服务数；点进项目可看服务表，或打开**项目级聚合日志**
  ——一条 `/logs/stream?ids=…` 装下项目内所有容器（帧里带 `id`），客户端按 `[service]` 前缀混流。某个
  容器的子流失败只标注「部分出错」，其余容器的日志照常收。
- **镜像**：`docker images` 列表（reference / 大小 / 创建时间 / 短 ID），`<none>:<none>` 的 dangling
  带标记；搜索框与计数**固定在工具条里**，表头列名在表体内吸顶。每行「详情 / 删除」：**详情**打开整栏
  视图（概览 + `docker history` 构建历史）；**删除**（需 `allowMutations`）二次确认后执行
  `docker image rm`（不带 `-f`，被引用时会失败并给出「先删相关容器」的提示）。
- **网络 / 卷**：工具条分段扩到「容器 / 镜像 / Compose / 网络 / 卷 / 磁盘」（窄栏里分段自己横向滚动，
  不做二级菜单）。两页都是「表格 + 整栏详情」的同构布局：
  - **网络**：名称 / 驱动 / 范围 / internal 徽标 / ID，行点击进详情——概览与「接入的容器」页签。
    **容器数刻意不进列表行**：只有 `docker network inspect` 才拿得到接入列表，列表逐行 inspect 就是
    N 次 docker 调用。
  - **卷**：名称 / 驱动 / 范围 / 挂载点（超长路径限宽省略，title 给全量），详情只有概览一页（卷没有
    反向索引）。
  - 详情页头部有**删除**按钮，两页工具条各有 **prune 图标**，都受 `allowMutations` 门控（未开启时置灰
    + title 说明）并二次确认；删除失败就地弹横幅，不会静默。这两页**不轮询**（清单变化慢）。
- **拉取镜像（SSE 进度流）**：镜像页工具条的拉取图标（需 `allowMutations`）打开拉取视图，输入引用后走
  `GET /api/dsh-docker/images/pull/stream`——逐层进度实时出现；进度行按「层键」原地更新，TTY 下的 `\r`
  刷新也不会让缓冲区越滚越长。工具条的「清理 dangling」执行 `docker image prune -f`，**只删无标签
  镜像**（刻意不加 `--all`）。

![镜像页：搜索框固定在工具条，表头吸顶](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-docker-images.png)

- **一次性 exec**：`allowExec` 开启后可输入命令，等价 `docker exec <容器> sh -c "<命令>"`，返回退出码
  与 stdout/stderr（无 TTY）。
- **交互式终端（卡片第一个图标）**：跑 `docker exec -it '<容器>' sh`，按 tty 能力三级降级——
  ![exec 终端抽屉 + 日志页共存：折叠只藏起来、会话保持运行](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-docker-exec.png)

  1. **就地嵌入（tty ≥ 0.15，推荐）**：面板底部开一个**终端抽屉**，由 `ttyTerminal.mount` 把终端挂
     进来，面板不收起；**折叠**（标题栏箭头或双击顶边）只把抽屉压成一条标题栏、会话照旧跑着，
     **拖拽顶边**可调高度（上限 75%）。真正结束会话的只有抽屉的 ✕ 与关闭面板——有活动会话时关面板
     会先弹确认，避免点 backdrop 误杀一个正在排障的容器 shell。
  2. **借 tty 弹窗开标签（tty ≥ 0.14）**：tty 新开一个标签执行同一命令，随后收起本面板（本面板
     z-index 更高，不收起用户只会觉得「点了没反应」）。
  3. **复制命令**：未装 tty / 版本过旧 / 内联目标用了 key·password 认证（浏览器端没有凭证）时，退化
     为复制该命令并提示到终端面板粘贴。

  本地目标开本地会话，SSH 目标按连接簿条目名（或内联字段）走 SSH，标题为 `<容器> · exec`。能力判断走
  服务契约版本（`ttyTerminal.version >= 2` 才有 `mount`），不是猜函数存不存在。

### 目标（本机 / SSH）

| `kind` | 说明 |
| --- | --- |
| `local` | 宿主所在机器上的 docker CLI（`spawn` 直接执行，不经 shell） |
| `ssh` | 经 `ssh2` 连到远程主机，在远程执行 docker CLI（argv 经单引号转义） |

`kind=ssh` 有两种填法：① **引用 tty 连接簿条目**——`book` 填条目名（在「终端面板」的连接簿里维护），
主机 / 端口 / 用户名 / 认证方式随之生效；设置卡片的下拉只列出 tty 已保存的条目，tty 未安装或条目不
存在时该目标解析失败，面板与 agent 工具都会给出明确错误。② **内联字段**——`host` + `username` 必填，
其余按需（`port` / `auth` / `keyPath` / `password` / `passphrase` / `agentForward`）。

目标解析是**每次操作现算**的：在 tty 卡片里改了连接簿条目，下一次操作立即用新值，无需重启。远端需要
装了 docker CLI，且当前账号**免 sudo** 可用 docker（通常在 `docker` 组），否则 `probe` 会原样透出
`permission denied while trying to connect to the Docker daemon socket` 之类的错误。

#### 连接本机（一键）

不想手填目标时，UI 里有两个入口，都**不做常驻**：

| 何时 | 入口在哪 |
| --- | --- |
| 一个目标都没有 | 面板正文的空态里一个 **连接本机** 主按钮（那时整块是空的，一键就是最短路径） |
| 已经有别的目标 | **目标下拉的末一项** `＋ 连接本机`——就在你找机器的地方，点开才出现 |

两处互斥（不会同一个入口出现两次），**已经有本机目标时两处都不出现**。做成常驻的工具条按钮不划算：
**已经有可用目标**时它既占位又招人点，是纯噪音；而只留空态那一个入口又会漏掉「手上有几台 SSH、想再加
一台本机」这种常见情况。agent 侧同一件事是 `docker_connect_local`，HTTP 侧是 `POST /connect-local`
——所有入口共用宿主里同一份实现。

| 情况 | 行为 |
| --- | --- |
| 已有一条 `kind=local` 目标（无论叫什么名字） | **复用它**（`created:false`），只切过去；不新建、不重写、不改名 |
| 没有本机目标 | 用稳定名 `local` 追加到列表末尾；`local` 已被占用时依次试 `local-2`、`local-3`… |
| 已有 SSH / 自定义目标 | **原样保留**（含顺序与凭据）；只在末尾追加本机那条 |
| 重复点 / 并发点 | 幂等：最终只有一条本机目标 |
| 设置存储不可用 / 保存失败 | 明确报错（503 / 500 + 原因），**不改内存配置**——不会出现「界面上加上了、刷新就没了」 |

写盘成功之后**顺带做一次只读探测**（`docker version`），结果放进响应的 `message`：daemon 可达时给出
服务端版本；不可达时说清成因——**docker CLI 缺失**（去装 Docker，或把「docker CLI」改成正确路径）/
**探测超时**（daemon 卡死，或 `docker context` 指向了连不上的远端）/ **daemon 未启动**（Linux
`systemctl start docker`，macOS / Windows 启动 Docker Desktop）/ **socket 无权访问**（账号加入 `docker`
组）。探测失败**不算这次操作失败**（目标确实加上了，`reachable:false` 单独表示）。

探测用的二进制**就是设置卡片里的「docker CLI」**（`dockerBin`，默认 `docker`）。CLI 缺失时会**只读地**
在 `PATH` 里找一下别的容器 CLI（`docker` → `podman` → `nerdctl`），找到就在那句话里点名——**只提示，
绝不替你改配置**（podman 与本插件输出格式的兼容性并未逐项验证，见「已知限制」）。比对候选时按**工具
名**（basename）而不是配置里的原字符串。超时是**独立一档**：回 `timedOut:true` + 一句可执行的话，并且
**真的按时返回**——到点先杀、再给 500ms 收敛期，仍不 `close` 就自行放掉管道收尾（SIGKILL 只作用于直接
子进程，`dockerBin` 指向包装脚本时孙进程会把手上的上限拖成分钟级）。

刻意**不做**的事：不自动安装 Docker、不启动 daemon、不切换 docker context、不改任何环境变量；空
`targets`（= 用户没配）的语义不变，不产生隐式默认目标；`clearTargets` 的防误清空逻辑一字未动。这条
路径也**与能力开关无关**——它只写插件自己的配置，不涉及任何需要授权的目标侧写操作。

### 聚合日志（多选 / Compose 项目）

多选容器或打开一个 Compose 项目，都能把多个容器的日志聚合成一条流：**一条** `/logs/stream?ids=…` 装下
全部容器（帧里带 `id`；宿主侧仍为每个容器各跑一条 `docker logs -f`），客户端按到达顺序混流。工具栏提供：

| 控件 | 语义 |
| --- | --- |
| **实时 / 已暂停** | 真暂停（见下） |
| **时间戳** | 显示每行时间戳。时间戳**始终随流接收**（`timestamps=1`），只影响显示 |
| **按到达 / 按时间** | `按到达`：零延迟跟随；`按时间`：用每行的容器时间戳合并成一条真时间线 |
| **级别过滤** | `全部级别 / WARN+ / ERROR+`。**无级别前缀的行（堆栈等续行）继承上一条日志的级别**，所以 ERROR+ 会连它的堆栈一起保留；窗口开头的孤儿续行（记录头在窗口外）保留 |
| **⬇ .log / ⬇ .md** | 导出当前显示内容：`.log` 是纯行文本（`[服务] ISO时间 正文`），`.md` 带来源容器 / 行数 / 导出时间表头 |

**按时间合并怎么做的**：SSE 各容器建连有先后，A 的首屏历史可能整批先到、B 随后才到，只对单批排序修
不了跨批逆序。实现是**回填最近 400 行**——每批新行到达时把「最近 400 行 + 新行」整体按时间戳重排
（RFC3339 前缀为排序依据，解析后从正文里剥掉）。代价是「按时间」模式下已在屏上的最近若干行可能轻微
重排（正在跟随实时输出时建议用「按到达」）。

### 聚合日志的「暂停」（真暂停）

多选容器 / Compose 项目的聚合日志有一个 `实时 / 已暂停` 开关。**暂停是内容冻结**，不只是停止自动滚动：
暂停期间新到的日志进入客户端缓冲、**DOM 不再追加**（读屏不会被顶走，也不会因显示上限 2000 行裁前部
而跳屏）；按钮上直接显示攒了多少行（`已暂停 +348`）；恢复时把缓冲一次性并入（沿用 5000 行环形上限）
并回到底部。只停「自动滚动」是不够的：标签写着「已暂停」而内容还在长，用户会以为开关坏了。

### 总览（跨目标）与「需关注」口径

目标选择器旁的 `总览` pill（配了 ≥2 个目标才出现）一屏铺开全部目标：每个目标一张计数卡（运行中 /
已停止 / 不健康 / **需关注**），下方是跨目标的「需关注容器」表（容器名 / 目标 / 状态 / **原因** /
镜像，点行进详情、点卡切到该目标的列表）。三条设计约束：

- **渐进落地 + 失败隔离**：每个目标独立请求、独立落格；一台 SSH 不可达不会让整页静默（刻意**不用**
  `Promise.all` 汇总：SSH 不可达要等 readyTimeout 20s，汇总等于让整页静默 20s）。
- **需关注口径以宿主为准**：容器列表与 `/attention` 并行请求；后者额外做一次 `docker inspect`，因此能
  识别 **OOM（OOMKilled）** 与**真实退出码**——ps 摘要里 `Exited (137)` 分不出是被 OOM 杀还是手动 kill。
  拿不到 `/attention`（老版本宿主 / 该目标失败）时退回摘要口径，并在计数上标注「需关注（粗判）」。
- **排序**：OOM > 僵死 > 不健康 > 反复重启 > 非零退出；同权重按「最近一次结束时间」倒序（行 hover 显示
  结束/启动时间、重启次数、退出码）。

总览的轮询复用工具条的「自动刷新」开关（默认关）：这一页每轮是全 N 个目标各一次 `docker ps`，比任何
单目标页都贵。没有异常显示「一切正常」；还有目标没答完时显示「读取中…」，**计数卡也进入读取态**（不出
0/0/0——「0 个容器」会被读成「这台机器没容器」，而它只是还没答）。进总览时会清掉单目标遗留的失败横幅：
总览按目标归因，不再叠一条单目标的「操作失败」——同一个 SSH 超时被讲两遍，看着像两台机器都挂了。

### 容器诊断（「为什么不行」）

容器详情多一个**诊断**页签，agent 侧是 `docker_diagnose`。它一次采集四路——`docker inspect`（权威状态 /
退出码 / OOM / 重启次数 / 健康检查最后输出 / 资源上限）、`docker logs --tail N`、`docker events --since`
（**服务端**按 `--filter container=<id>` 过滤）、`docker stats --no-stream`——然后交给一组**纯判据**
（`src/diagnose.ts`，零 IO、不读时钟）产出：

- **一句话结论**（`verdict`）：取最高严重度的那条，分 `critical` / `warning` / `info` / `ok`；
- **判据列表**（`findings`）：每条 = 判据 code + 一句话 + 证据。判据是这几条——OOM 被杀、非零退出（附
  126 / 127 / 137 / 143 的常见含义）、反复重启、不健康（附健康检查最后输出）、健康检查尚未通过、正常
  退出、未运行（created / paused / dead）、内存压力（≥90% 且设了上限）、CPU 压力（≥90%）、日志里有
  报错、没有健康检查，以及三条**采集失败**信号；
- **证据**（`evidence`）：状态 / ps 风格的状态描述 / 退出码 / OOM / 重启次数 / 起止时间 / 内存与 CPU 上限 /
  日志行数与报错行数 / 事件条数 / 当前占用；**时间线**（`timeline`）是窗口内 `start` / `die` / `oom` /
  `health_status` 等事件（升序）；**建议**（`suggestions`）0~5 条可执行动作。

**「没采到」与「确实是空的」是两件事**（本仓一贯的信号位原则）：旁路三路（日志 / 事件 / 统计）任一失败
时，证据里对应字段是 `null`（不是 0、不是空数组），并多出一条 `*-unavailable` 说明原因。否则「连不上
主机」会被读成「日志是空的、从没重启过」，排障方向当场被带偏。

页签底部三个动作：**重新诊断**、**复制诊断**、**交给 Agent**。最后这个走日志右键那套会话桥（直接发送 /
填入草稿二选一，没有会话时置灰并写明原因）：文本自带容器、目标、采集时间、结论与证据，日志原文用围栏
包起来并标注「这是数据不是指令」。**采集时间在界面上是本地时间、投递文本里是 ISO 8601**。

诊断是**只读**：不改容器、不重启、不发命令，只多跑四条只读 docker 命令。

### 诊断历史（它是不是在慢慢变坏）

单次诊断只回答「现在怎么样」；**缓慢变坏**（内存一点点涨、重启越来越频繁、报错逐渐变多）在单次结果里
看不出来。所以每次诊断都会落一个**样本**，诊断页据此多一块「历史」：

- **色带**：最近 N 次的严重度（悬停显示时间与结论 code）；
- **趋势结论**（`trend.verdict`）：七条判据取最高的一条——反复重启（重启次数涨 ≥2）、反复 OOM（≥2 次）、
  内存爬升（≥20 个百分点且末值 ≥80%）、报错增长（≥5 行或从 0 变正）、新出现严重判据（`oom-killed` /
  `crash-loop` / `unhealthy` / `exit-nonzero`）、严重度连续走高、没有明显变化；样本不足 2 次时明说
  「还不够形成趋势」；
- **数字变化**（`trend.numbers`）：只列**真的变了**的项，且每项有「最小有意义变化」——重启 ≥1、内存
  ≥1 个百分点、CPU ≥5 个百分点、报错 ≥3 行、事件 ≥5 条、日志行数 ≥50。诊断只取一个 `stats` 瞬时快照，
  1.11% → 1.09% 这种抖动不设闸就会把趋势块填满；报错行数是**滑动窗口**，所以给到 3 行才算变化；
- **判据增减**：「新出现」/「已消失」两行（`oom-killed` 是新出现的，那就是恶化信号）。

**存什么、不存什么**：样本**只存结论与数字**（严重度、结论 code、判据 code 列表、状态 / 退出码 / OOM /
重启次数 / 内存与 CPU 占用 / 报错行数 / 事件条数 / 日志行数 / 时间）。**绝不落盘**：日志原文（`logTail`）
与每条判据的 detail（里面会嵌日志行，可能带凭证）——所以这份文件可以放心 `cat`，但它也因此**不能**用来
回放某次排障现场。

落盘：`<DSH 主目录>/dsh-docker/diagnosis-history.jsonl`（目录 `0700`、文件 `0600`），一行一条。上限：
**每个容器 50 条**、整文件 **2000 条**，超了丢最旧并**原子重写**（临时文件 + rename）。**30 秒去重**：同一
容器、30 秒内、且严重度 + 结论 + 判据集合 + 重启次数完全相同时**不追加**。`DSH_DOCKER_HISTORY_DIR` 可
覆写目录（测试 / 排障专用），空串视为未设。三条边界：① **容器改名 = 开一段新历史**（索引键是「目标 +
容器名」）；② **并发追加没加锁**（可能丢一次更新）；③ **写盘失败只降级不报错**：诊断照常返回、
`recorded = false`、宿主 stdout 留一行。

### 磁盘与可回收（存储治理）

**磁盘**是工具条分段的最后一段（容器 / 镜像 / Compose / 网络 / 卷 / 磁盘），agent 侧是
`docker_disk_usage`。数据来自两条命令：`docker system df`（四类汇总）与 `docker system df -v`（逐项明细）。

- 四张汇总卡：镜像 / 容器 / 本地卷 / 构建缓存各自的**条目数、活跃数、占用、可回收**（分类名保留 docker
  原文，界面负责翻译）；
- **合计可回收**：四类 `reclaimable` 的字节和（任一行解析不出就给 `—`，宁可不说也不给错数）；
- **镜像明细**（按独占大小降序）：仓库:标签 / 大小 / 独占 / **容器数**——`containers === 0` 打「未使用」
  徽标，行尾删除图标（受 `allowMutations` 门、走既有确认框）；
- **卷明细**（按大小降序）：名称 / 驱动 / 大小 / **链接数**——`links === 0` 同样打「未使用」。

三条刻意的取舍：**先排序再截断**（真机实测 259 个卷里 258 个是 0B，先截断会把 100 个名额全给空卷）；
**明细上限 100 行**并在表头留痕（工具侧另按 20 行截，两个 `truncated` 取或）；**老 docker 只降级不报错**
（不支持 `-v --format '{{json .}}'` 或输出形状不对时 `degraded: true` + 人话原因，汇总卡照常显示、明细表
**不渲染**——渲染空表会让人以为「没有」）。

磁盘页**不轮询**（`system df -v` 比 `docker images` 贵），也**没有 prune 按钮**：逐行删除 + 确认框比
「一键清空一类」安全，而那类入口已经在镜像 / 卷页的工具条上各有一个。

### 等价 `docker run`（现场还原）

概览页底部有一块可折叠的**等价 docker run**，agent 侧是 `docker_run_command`。它从 `docker inspect` 的
**原始行**反推一条可复现命令——**不扩 `ContainerDetail`**，因为那会把 env 顺带灌进 `docker_inspect` 的
模型上下文。覆盖：名称、重启策略、端口映射（没绑 hostPort 的用 `--expose`）、bind / 命名卷 / tmpfs、
非默认网络、环境变量、用户 / 工作目录 / 主机名（等于默认值时省略）、内存与 CPU 上限、cap-add / cap-drop /
device，以及镜像与命令本身。**点开才请求**，一行一个参数、POSIX 单引号转义，可直接复制。

三条刻意的取舍：**环境变量原值保留**（改写过就不是等价命令），命中
`/(PASS|PWD|SECRET|TOKEN|KEY|CRED|AUTH|PRIVATE)/i` 的**键名**收进 `secretKeys`——界面在命令上方给一条
「含疑似凭证」的警告，**只点键名、不显示值**，命令本身不脱敏（脱敏后的命令跑不起来）；**故意没还原的
必须点名**（`omitted`：`--privileged`、`--link`、非默认日志驱动、`--pid/--ipc/--uts`、`--sysctl`、
`--add-host`、`--security-opt`、特殊挂载类型、匿名卷、ENTRYPOINT 覆盖、自定义健康检查——逐条给出「为什么
没写」与「怎么补」，**绝不静默丢**）；**compose 管理的容器只是近似**（网络别名 / labels / depends_on
不在命令里，界面直说）。

## 配置（保存即热生效）

未获宿主授权时，设置卡片里那两个开关**点它会就地发起一次授权**：面板给出一条「在宿主终端执行」的命令，
执行完十秒内自动解锁并替你打开开关（免重启）；面板里另有「另一种方式（最强）」说明启动环境变量的做法。
已授权时它们就是普通开关，**关掉**永远可用（宿主侧不拦降权）。「配置开着但没授权」会显示「未生效：未获
宿主授权」徽标——这个状态最容易被当成插件坏了，所以必须有个名字。**一个能力一行**：开关后面跟这个能力
自己的授权状态与**授权时刻**（`已授权 · 2026-09-26 22:31:08`），撤销按钮右对齐。

**两个能力的确认也能一次粘贴搞定**：再点另一个开关不会顶掉前一块面板，两块面板**纵向堆叠**，顶部多出
一个「复制全部（N 条）」。

为什么显示时刻：带外授权是**持久**的——宿主重启后它直接生效、不再有任何一次确认，所以宿主启动时会逐条
打一行 `[dsh-docker] elevation: load capability=… via=file grantedAt=…`（不含 nonce 与路径），卡片上
也显示出来。启动环境变量授权**没有**时刻，那一行写的是「由启动环境变量授权；要撤销需在启动环境里去掉它
并重启宿主」。

![设置卡片：目标 CRUD、能力开关与参数，保存即热生效](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-docker-setting.png)

设置面在宿主里的**位置**随 DSH 版本变，但**始终是同一份表单**（同一个 settings 命名空间、同一条写入
通道，配置数据与行为完全相同）——各代际的落点与四条注册契约的唯一归宿在
[conventions.md § 客户端设置面](../../docs/conventions.md#客户端设置面内联优先)。

配置落在 settings 命名空间 `docker`，即 `~/.dsh/settings.yaml` 的 `docker:` 段
（`$DSH_HOME/settings.yaml`）。插件行里的 composition 配置作为 schema `base` 打底，settings 层覆盖它；
HTTP `POST /api/dsh-docker/config` 是卡片的写入通道，只接受下表这些键（未知键返回 400）。

| 项 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | true | 关闭整个插件（**保存即热生效**：工具立即注销、公告撤下、除 `/config` 外的数据路由 403；`/config` 始终可读写——设置卡片就是重新启用的入口。与 tty 不同：tty 是重启生效） |
| `announceToAgent` | true | 是否向 agent 注入能力公告（systemPrompt section `plugin:dsh-docker`） |
| `dockerBin` | `docker` | docker CLI 可执行名或路径（podman 可填 `podman`）；只允许字母、数字与 `_ . / \ : -` 及内部空格，且不能以 `-` 开头（**Windows 盘符与 `\` 必须放行**）。**「连接本机」的探测用的就是它**；填错时那句话会点名 `PATH` 里找到的别的容器 CLI，但**不会**替你改这个值 |
| `allowMutations` | false | 允许**变更操作**：容器 start / stop / restart / remove、镜像删除 / dangling 清理 / 拉取（面板按钮与 `docker_action`、`docker_image_remove`、`docker_image_prune`、`docker_image_pull` 工具；关闭时 `/action`、`/images/remove`、`/images/prune`、`/images/pull/stream` 返回 403，对应工具不注册） |
| —（能力授权） | 未授权 | `allowMutations` / `allowExec` 有**两条提权通道**：① **启动环境变量**（`DSH_DOCKER_ALLOW_MUTATIONS` / `DSH_DOCKER_ALLOW_EXEC`，值为 `1` / `true` / `yes` / `on`）——判定源是宿主的**启动环境快照**，只认继承来的 `process` 层：写项目 `.env` 或 `~/.dsh/env.yml` **不算**授权；② **就地提权**（免重启）：在设置卡片点开关 → 面板给出一条「在宿主终端执行」的命令 → 执行后十秒内生效。HTTP 侧永远可以**关掉**它们（紧急刹车不能依赖重启），但给 `true` 而无授权会被 400 拒绝并说清两条路。配置里的 `true` **不算授权**（它与 HTTP 写进去的值存在同一个存储里，分不出来源）。**升级影响**：升级前靠界面打开的开关会变成关——设环境变量重启，或在卡片里就地确认。**为什么**：回环围栏与同源证明都拦不住跨站页面与页内脚本，而 docker socket 等价目标主机 root；细节（含拦不住谁）见 [architecture.md § 7](../../docs/architecture.md#7-一条请求经过什么) |
| `allowExec` | false | 允许**一次性** `docker exec`（**容器详情抽屉**「概览」页签里的一次性命令框，与 `docker_exec` 工具；关闭时 `/exec` 返回 403）。**不管**卡片「终端」按钮的 `docker exec -it` 交互式 shell——那条由 tty 承载（见「已知限制」） |
| `execTimeoutSec` | 30 | exec 默认超时秒数（1~120） |
| `pollIntervalSec` | 5 | 面板统计刷新间隔秒数（1~60） |
| `logTailDefault` | 200 | 日志默认尾部行数（1~5000） |
| `maxOutputKb` | 512 | 单次命令输出上限（KB，1~8192）；超出截断并标记 `truncated` |
| `targets` | `[]` | 目标列表，见下 |
| `hostKeys` | `[]` | SSH 主机指纹记录（TOFU，自动维护） |

数值越界会被夹到边界内，类型不符则回落到默认值。

### `targets[]` 字段

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `name` | —（必填） | 目标展示名，唯一；空名或重名条目在保存时被丢弃（≤64 字符） |
| `kind` | `local` | `local` 本机 / `ssh` 远程 |
| `book` | `''` | `kind=ssh` 时引用 tty 连接簿条目名（留空则用下面的内联字段） |
| `host` | `''` | 内联主机名或 IP（无 `book` 时必填） |
| `port` | 22 | SSH 端口（1~65535，越界回落 22） |
| `username` | `''` | 内联 SSH 用户名（无 `book` 时必填） |
| `auth` | `agent` | `agent`（走 `SSH_AUTH_SOCK`）/ `key`（用 `keyPath`）/ `password`（用 `password`，同时挂 keyboard-interactive） |
| `keyPath` | `''` | `auth=key` 的私钥路径（`~` 开头会展开为 home） |
| `password` | `''` | `auth=password` 的密码；**建议填 `env:NAME`** 凭据引用 |
| `passphrase` | `''` | 私钥口令；**建议填 `env:NAME`** 凭据引用 |
| `agentForward` | false | 是否转发本机 ssh-agent（`SSH_AUTH_SOCK` 存在时生效） |

`password` / `passphrase` 里的 `env:NAME` 是**凭据引用**（配置只持引用、值归 provider），**连接时才
解析**：① **官方凭据层**（`ctx.credentials`）——叠 `file`（`$DSH_HOME/.credentials.yaml`）/ `env` /
`project-env` / `user-env` 各层，且「每次操作重新解析」，所以**改完下一个操作即生效、不必重启宿主**；
② 服务不可用（老宿主 / 未装该 bundle）或它没有这个引用时，退回 `process.env[NAME]`。两边都没有会明确
报错并**点名两个来源**（服务报错也一并带上——否则"凭据服务坏了"会伪装成"你没配"）。这两个值**永不回传
浏览器**：配置快照里只给 `passwordSet` / `passphraseSet` 两个布尔位。

### `hostKeys[]`（SSH 主机指纹，TOFU）

| 字段 | 说明 |
| --- | --- |
| `host` | 主机名或 IP（必填） |
| `port` | 端口，默认 22（按 host:port 唯一） |
| `fingerprints` | **指纹集合**（必填，至少一条）：`hostHash: 'sha256'` 回调收到的原样十六进制指纹。同一 host:port 可含多把主机密钥（rsa / ed25519 …），命中任意一条即视为匹配 |
| `fingerprint` | 旧版单指纹字段（字符串）：只作迁移输入，清洗时并入 `fingerprints`，新配置不要再用 |

首次连接自动记录并落盘；之后每次连接必须匹配，**指纹变更直接拒绝连接**，错误信息带「删除该主机记录再
重连」的指引。记录列表在设置卡片里可删除重置（删除会以显式的 `hostKeysRemove: [{host, port}]` 提交，
不会被并集合并悄悄撤销）。

## agent 工具

| 工具 | 注册条件 | 参数 | 作用 / 典型用法 |
| --- | --- | --- | --- |
| `docker_targets` | 恒注册 | `probe?: boolean` | 列出目标（name / kind / label），**SSH 目标还会带出它引用的 tty 连接簿条目名 `book`**（内联 host/username 的目标没有这个字段；用它去终端面板 / `sftp_*` 的 `book`，名字对不上时只能靠它）；`probe:true` 逐个探测 docker 版本与 daemon 可达性（SSH 目标会建连接，较慢）。其他工具的 `target` 取自这里 |
| `docker_connect_local` | 恒注册 | —（无参数） | **连接本机**：确保存在一条 `kind=local` 目标并选中它（已存在则复用，不重复创建；SSH / 自定义目标原样保留），随后只读探测 daemon：返回 `{name, kind, created, saved, reachable, serverVersion?}`。没有任何目标时其余工具不注册（见下方「零目标」那条），用它一步补上。**不需要任何能力授权**；不会安装 Docker / 启动 daemon / 切 context / 改环境变量。daemon 不可达时说清成因（CLI 缺失 / 探测超时 / daemon 未启动 / socket 无权），不是只报空列表 |
| `docker_ps` | 有目标即注册 | `target?`（**传 `*` = 全部目标**）、`all?: boolean`、`name?`（容器名子串过滤）、`limit?`（1~500，默认 100）、`offset?`（默认 0） | 列容器（名称 / 状态 / 健康 / 镜像 / 端口 / compose 项目与服务 / 短 ID）；默认只列运行中，`all:true` 含已停止。`name` 是**服务端过滤**（`docker ps --filter name=`，子串匹配），过滤先于分页，翻页时总数不会漂。`target:'*'` 时按目标分组返回，**单个目标不可达不影响其他目标**（该组带 `error`）。端口是 IPv4/IPv6 双栈归并后的映射（D130）；`ports` 为空**不等于**没暴露端口——host 网络容器的端口即宿主机端口，这种情况会给 `net` 字段（D131）。排障第一步 |
| `docker_attention` | 有目标即注册 | `target?`（支持 `*`）、`limit?: number` | **需关注汇总**：不健康 / 反复重启 / 被 OOM 杀 / 非零退出 / 僵死；每条带 `reasons`、`exitCode`、`oomKilled`、`restartCount`。OOM 与真实退出码来自一次 `docker inspect`。排障入口：不确定从哪台/哪个容器看起时先调它 |
| `docker_diagnose` | 有目标即注册 | `target?`、`id`（必填）、`logTail?`（1~500，默认 80）、`since?`（docker 语法，默认 `1h`）、`history?`（0~50，默认 10，0 = 不要历史） | **容器「为什么不行」**：一次采集 inspect + 日志尾部 + 本容器事件（服务端 `--filter container`）+ `stats` 快照，产出 `verdict` / `findings`（每条带 code、severity、title、detail）/ `evidence` / `timeline` / `suggestions`。**只读**；「没采到」给 `null` 并附 `*-unavailable` 判据，绝不写成 0。要更多日志 / 找关键词用 `docker_logs_grep`。返回里还带 `history`（最近 N 个**只含结论与数字**的样本 + 趋势结论 `trend`）——`trend.verdict.summary` 就是「它是不是在慢慢变坏」那一句 |
| `docker_inspect` | 有目标即注册 | `target?`、`id`（必填） | `docker inspect` 的权威详情：状态 / 健康检查 / 退出码 / 重启次数 / 端口 / 挂载 / 网络 / 启动命令 |
| `docker_logs` | 有目标即注册 | `target?`、`id`、`tail?`（1~5000，默认 `logTailDefault`）、`timestamps?`、`since?`、`until?` | `docker logs --tail` 尾部；`since` / `until` 用 docker 语法圈时间窗；超上限标记 `truncated`；截断时结果里会说明可传更小的 `tail`、加 `since`/`until`，或改用 `docker_logs_grep` |
| `docker_logs_grep` | 有目标即注册 | `target?`、`id`、`pattern`（必填，≤512 字符）、`regexp?`、`ignoreCase?`、`since?`、`until?`、`context?`（0~20，默认 2）、`limit?`（1~500，默认 200）、`tail?`（缺省 = 扫全部历史）、`timestamps?`（默认开） | **日志服务端检索**：宿主侧逐行过滤（不碰远端 shell、不拼 `\| grep`），返回命中行 + 前后上下文，并如实报告 `matched`（全量命中数）/ `scanned` / `limited` / `truncated`——「只扫到这些」与「扫完了没更多」可区分；扫描窗口**对齐到行边界**（按字节截断处的半行不当作一行返回）；返回行数另有上限：最多 4000 行（`MAX_RESULT_LINES`），超了截到上限并给 `truncatedForSize` 与 `notes`，`matched` 仍报全量。与 `docker_logs` 的分工：报错就在最近尾部 → `docker_logs`（便宜）；埋在深处 / 特定时间窗 / 找关键词、异常码、请求 ID → 本工具。默认字面子串（grep -F 语义，零 ReDoS），`regexp: true` 才按 JS 正则 |
| `docker_stats` | 有目标即注册 | `target?`、`ids?`（逗号分隔的容器名/ID） | `docker stats --no-stream` 快照：CPU% / 内存用量与占比 / 网络 IO / 块 IO / PIDs；`ids` 省略 = 全部运行中容器。实时跟随是面板能力（SSE），工具保持单值快照语义 |
| `docker_images` | 有目标即注册 | `target?`、`limit?`（1~500，默认 100）、`offset?`（默认 0） | 镜像列表（仓库:标签 / 大小 / 创建时间 / 短 ID） |
| `docker_top` | 有目标即注册 | `target?`、`id`（必填） | 容器内进程快照（`docker top <id> -eo pid,ppid,user,stat,etime,pcpu,pmem,cmd`）：PID / PPID / 用户 / STAT / 已运行 / CPU / 内存 / 命令，字段全是 docker 打印的原文。容器「还在跑」与「进程还在」是两件事 |
| `docker_events` | 有目标即注册 | `target?`、`since?`（docker `--since` 语法，默认 `10m`） | 容器事件快照（过服务端白名单）：start / die / stop / kill / oom / health_status / destroy / rename / update 九类，`exec_*` 等噪音已在服务端丢掉。要持续观察请让用户看面板容器列表的「活动」条 |
| `docker_networks` | 有目标即注册 | `target?`、`limit?`（1~500，默认 100）、`offset?`（默认 0） | 网络列表（名称 / 驱动 / 范围 / 是否 internal / 短 ID）。接入的容器列表不进列表行——列表逐行 inspect 就是 N 次 docker 调用 |
| `docker_volumes` | 有目标即注册 | `target?`、`limit?`（1~500，默认 100）、`offset?`（默认 0） | 卷列表（名称 / 驱动 / 范围 / 挂载点） |
| `docker_disk_usage` | 有目标即注册 | `target?` | 磁盘占用与**「谁在用」**：`docker system df` 四类汇总 + `-v` 明细（镜像的 `containers`、卷的 `links`，各截 20 行）。删之前先看 `containers` 是不是 0；汇总与明细是两条命令，明细失败只降级（`degraded`） |
| `docker_run_command` | 有目标即注册 | `target?`、`id`（必填） | **只推导、不执行**：从 `docker inspect` 原始数据反推等价 `docker run` 命令文本 + `warnings` / `secretKeys`（只给键名，值不脱敏）/ `omitted`（故意没还原的，逐条给原因）。compose 容器只是近似 |
| `docker_image_inspect` | 有目标即注册 | `target?`、`ref`（必填） | `docker image inspect` + `docker history`：大小 / 含父层大小 / 创建时间 / 平台 / 层数与层列表 / 入口与命令 / 暴露端口 / digest / 构建历史 |
| `docker_action` | `allowMutations` + 有目标 | `target?`、`action`（`start` \| `stop` \| `restart` \| `remove`）、`id` | 容器生命周期操作。`remove` 是破坏性的：删除容器配置与可写层（数据卷不在其中），执行前必须向用户确认目标容器 |
| `docker_image_remove` | `allowMutations` + 有目标 | `target?`、`ref`（必填） | 删除镜像（`docker image rm`，不带 `-f`）。**破坏性**：被容器或子镜像引用时会失败；执行前须确认目标镜像并复述后果 |
| `docker_image_prune` | `allowMutations` + 有目标 | `target?` | 清理 dangling（无标签）镜像（`docker image prune -f`）。刻意不加 `--all`，只删无标签镜像 |
| `docker_image_pull` | `allowMutations` + 有目标 | `target?`、`ref`（必填）、`timeoutSec?`（10~1800，默认 600） | `docker pull` 快照形态（**可能耗时数分钟**）；交互式看逐层进度请让用户到面板镜像页的拉取图标看 SSE 进度流 |
| `docker_exec` | `allowExec` + 有目标 | `target?`、`id`、`command` / `argv`（**二选一**：`command` 经容器内 `sh -c` 执行；`argv` 是精确参数数组，宿主与容器都不做 shell 展开）、`timeoutSec?`（1~120，默认 `execTimeoutSec`） | 一次性 `docker exec`，返回退出码 / stdout / stderr。简单命令用 `command`；需要精确保留空格、引号、空参数时用 `argv`（如 `["printf","%s","a b"]`），需要管道 / 变量时显式写 `["sh","-c","…"]`。无 TTY，交互式排障请让用户到 tty 面板跑 `docker exec -it <容器> sh` |

- `target` 省略时回落到**唯一**已配置目标；配置了多个目标则必填，错误信息会列出可用目标名。
- **零目标时只有 `docker_targets` / `docker_connect_local` 注册**：其余工具没有可寻址对象，注册了只会让
  模型白试一次；配好目标后**立即补注册**，无需重启。
- **四条列表工具支持分页**：`docker_ps` / `docker_images` / `docker_networks` / `docker_volumes` 都接受
  `limit`（1~500，默认 100）与 `offset`（默认 0），结果带 `total` / `truncated`，截断时给出下一页的
  `offset`。分页只解决「结果长到读不下去」，不改变单条 docker 命令 512KB 的上限。
- 两个开关变化会**立即重注册**工具：关掉 `allowMutations` / `allowExec` 后，对应工具（含三个镜像变更
  工具）从 agent 侧消失，无需重启。
- **已注册的调用还受会话权限档位闸（tier gate）约束**：`read` 类（上表标「有目标即注册」的读工具）全档
  放行；`docker_action` / `docker_image_remove` / `docker_image_prune` / `docker_image_pull` 归 `write`
  类，`docker_exec` 归 `exec` 类，这两类在受限档（仅可查看 / 工作区内修改）下**每次调用弹授权询问**（人
  允许这一次才执行；无人值守即审批策略 `never` 时确定性拒绝），完全权限档零询问，Auto review 档不叠加。
  宿主未组合 `sandboxPolicy` / `approval` 服务时不闸，启动日志打一行
  `tier-gate: services absent (…), per-call gate disabled`。它与上面两个静态开关是**双层**：静态开关管
  注册（宿主级、持久授权），档位闸管已注册调用的放行（逐调用、随档位即时变）。机制见
  [docs/permission-tier-plan.md](../../docs/permission-tier-plan.md)。
- 推荐排障顺序：`docker_targets` → `docker_ps` → **`docker_diagnose`**（一次拿到结论 + 判据 + 证据，多数
  「它为什么挂了」到这里就有方向了）→ `docker_logs`（尾部看不到成因就 `docker_logs_grep` 带 `pattern` /
  `since` / `until` 检索深处）→ `docker_inspect`（原始字段）→ `docker_stats` / `docker_top`（活着但不对劲：
  先看资源，再看进程还在不在）；镜像排查 `docker_images` → `docker_image_inspect`；要清磁盘先
  `docker_disk_usage`（看 `containers` / `links` 谁在用），再决定删什么。
- `announceToAgent` 开启时，插件向 systemPrompt 注入一段精简公告：插件与面板位置、「默认只读」与
  「docker socket ≈ 目标主机 root」的约束、「`allowExec` 只管一次性 exec 通道」的边界（卡片「终端」按钮
  不受它门控）、`target` 的 `*` 适用范围，以及跨工具排障顺序；它不逐条复述工具用法。

## HTTP 路由（`/api/dsh-docker` 前缀，全部 loopback 围栏）

围栏校验 `remoteAddress`（整个 127/8 + `::1` + `::ffff:` 映射）、`Host`（字面量环回、`localhost`，或
**解析到本机的主机名 / `/etc/hosts` 别名**，解析带 500ms 超时与 60s 缓存）、`Origin` 与 `sec-fetch-site`；
非本机请求一律 403 `forbidden: loopback-only`。请求体上限 1MB，响应统一 `application/json` +
`referrer-policy: no-referrer`。

**反代 / 另一台机器访问下不可用**：非本机请求一律 403 `forbidden: loopback-only`——这是刻意的，
这些路由里包含变更与执行面（docker 的 stop / remove / exec），不开放给远程会话（评估与取舍见 [ROADMAP.md](../../ROADMAP.md)
第 5 项 § 5.4）。需要从另一台机器用这块面板时走 **SSH 隧道**：`ssh -L 3080:127.0.0.1:3080 <host>`，
浏览器打开 `http://localhost:3080`——宿主侧看到的来源是回环、Host 是 `localhost`，围栏直接放行，
会话 cookie 也按该 authority 铸造。


**除 loopback 之外还有一道「同源证明」**：四条 SSE（`/logs/stream`、`/stats/stream`、`/events/stream`、
`/images/pull/stream`）与全部写子路由（`/action`、`/images/remove|prune`、`/networks/remove|prune`、
`/volumes/remove|prune`、`/exec`、`/elevate`（含 `/elevate/status`、`/elevate/revoke`）、`/connect-local`）要求请求带 `Origin: <同源>` 或
`Sec-Fetch-Site: same-origin`，否则 403 `缺少同源证明`。这是为了挡住「恶意页面用
`<img src=.../images/pull/stream>` 触发一次真实拉取」这类跨站副作用；curl / 老 Safari / 部分 WebView 不带
这两个头时会撞上它（浏览器正常使用不受影响）。只读路由不要求同源证明。

**例外：桌面版靠宿主 Cookie 过闸（D139）**。桌面版把页面发往 `dsh-app://app/api/…` 的请求转给真实宿主时
会**删掉 `Origin` 与 `Sec-Fetch-Site`**、只重写 `Cookie`（`forwardWebRequest`），所以「两条证明都缺省」
在桌面版是**常态**。这类转发的判定条件是**带着宿主会话 Cookie**（缺它整条转发直接 503）：**没有
`Origin`、没有 `Sec-Fetch-Site`、但有 `Cookie` → 放行**；两条都没有且**无** Cookie（裸 curl / 老 Safari）
→ 仍 403。浏览器页面伪造不了 `Cookie` 头，而跨站请求一定带 `sec-fetch-site: cross-site`（loopback 围栏
先拒），所以拒绝分支没有被放松；症状与排查见 [docs/troubleshooting.md](../../docs/troubleshooting.md)。

| 路由 | 方法 | 请求体 | 返回 |
| --- | --- | --- | --- |
| `/config` | GET | — | `{ok:true, config}`：配置快照（targets 只给 `passwordSet` / `passphraseSet`，另附只读的 `ttyBooks` / `ttyAvailable` / `toolsRegistered` / `streamProtocol`——最后这个是 SSE 帧协议版本，客户端据此决定「怎样才算已就绪」） |
| `/config` | POST | 上表配置键的任意子集 | `{ok:true, config}`；未知键 400，非法 JSON 400 |
| `/targets` | GET / POST | — | `{ok:true, targets:[{name, kind, label?\|error?}]}` |
| `/connect-local` | POST | `{}`（请求体被忽略） | **一键连接本机**：复用或新建 `kind=local` 目标并返回 `{ok:true, result:{name, kind, created, saved, reachable, serverVersion?, message}, config}`；宿主没有 settings 服务时 503，保存失败时 500（都带原因且不改内存配置）。要求同源证明（它是写路径），但**不需要** `allowMutations` / `allowExec` |
| `/probe` | POST | `{target?}` | `{ok:true, probe:{ok, bin, serverVersion, error, target}}` |
| `/containers` | POST | `{target?, all?}` | `{ok:true, containers: ContainerSummary[]}`；`target:'*'` 时返回 `{ok:true, groups:[{target,label,ok,error?,data?}]}`（跨目标并发聚合） |
| `/attention` | POST | `{target?, limit?}` | 单目标 `{ok:true, items, total, truncated, degraded}`（`limit` 在过滤 + 严重度排序**之后**生效，默认 100、上限 500）；`target:'*'` 时按目标分组 |
| `/inspect` | POST | `{target?, id}` | `{ok:true, details: ContainerDetail[]}` |
| `/stats` | POST | `{target?, ids?: string[]}` | `{ok:true, stats: ContainerStats[]}` |
| `/logs` | POST | `{target?, id, tail?, timestamps?, since?}` | `{ok:true, logs:{id, text, truncated}}` |
| `/top` | POST | `{target?, id}`（必填） | `{ok:true, top:{id, name, rows:[{pid, ppid, user, stat, elapsed, cpu, mem, command}], truncated}}`——字段全是 `docker top` 打印的原文；未运行 / 不存在时走既有错误通道（不是 200 空列表） |
| `/diagnose` | POST | `{target?, id}`（必填）、`logTail?`（1~500，默认 80）、`since?`（默认 `1h`）、`history?`（0~50，默认 10） | `{ok:true, diagnosis:{verdict, findings, evidence, timeline, logTail, suggestions, history:{samples, trend, recorded}}}`。`history` 是本次记录**之后**的最近 N 条样本与趋势（`recorded` 说明本次有没有真的追加）。四路采集，旁路失败只降级（evidence 对应字段 `null` + `*-unavailable` 判据）；非法 `since` 在引用白名单段就 400 |
| `/logs/stream` | GET | query：`target?`、`id`（单容器，与 `ids` 二选一）或 `ids`（逗号分隔的多个容器，**一条连接装下全部**，最多 32 个）、`tail?`（**0**~5000；`0` = 不补历史只跟随，客户端重连用）、`timestamps?`（`1`/`true`）、`since?` | `200 text/event-stream` 长连接，事件协议见下；参数错误 / 未知目标 / 非 loopback 返回常规 JSON 错误 |
| `/stats/stream` | GET | query：`target?`、`ids?`（逗号分隔；省略 = 全部运行中） | `200 text/event-stream`：每秒一帧 `stats`（形状与 /stats 快照一致）；不会自然结束，靠客户端断连收尾 |
| `/events/stream` | GET | query：`target?` | `200 text/event-stream`：一帧 `event` 一个容器事件（服务端已过白名单）；不会自然结束 |
| `/images` | POST | `{target?}` | `{ok:true, images: ImageSummary[]}` |
| `/images/inspect` | POST | `{target?, ref}`（必填） | `{ok:true, image:{ref, detail: ImageDetail, history: ImageHistoryEntry[], historyError}}`；history 优先 `--format '{{json .}}'`，老版本退回纯文本表格 |
| `/images/remove` | POST | `{target?, ref}`（必填） | 需 `allowMutations`（否则 403）；`docker image rm`（不带 `-f`）；`{ok:true, result:{ref, message}}` |
| `/images/prune` | POST | `{target?}` | 需 `allowMutations`（否则 403）；`docker image prune -f`（只删 dangling）；`{ok:true, result:{message}}` |
| `/images/pull/stream` | GET | query：`target?`、`ref`（必填） | 需 `allowMutations`（否则 403 且不建流）；`200 text/event-stream`：`line` 逐层进度 + `end{reason:'pull-exit',code,ref}` |
| `/networks` | POST | `{target?}` | `{ok:true, networks: NetworkSummary[]}` |
| `/networks/inspect` | POST | `{target?, name}`（必填） | `{ok:true, network:{name, detail: NetworkDetail}}`（含子网 / 网关 / 选项 / 标签 / 接入的容器） |
| `/networks/remove` | POST | `{target?, name}`（必填） | 需 `allowMutations`（否则 403）；`docker network rm`；`{ok:true, result:{name, message}}` |
| `/networks/prune` | POST | `{target?}` | 需 `allowMutations`（否则 403）；`docker network prune -f`；`{ok:true, result:{message}}` |
| `/volumes` | POST | `{target?}` | `{ok:true, volumes: VolumeSummary[]}` |
| `/volumes/inspect` | POST | `{target?, name}`（必填） | `{ok:true, volume:{name, detail: VolumeDetail}}`（挂载点 / 选项 / 标签） |
| `/volumes/remove` | POST | `{target?, name}`（必填） | 需 `allowMutations`（否则 403）；`docker volume rm`（**数据随卷一起没**）；`{ok:true, result:{name, message}}` |
| `/volumes/prune` | POST | `{target?}` | 需 `allowMutations`（否则 403）；`docker volume prune -f`（**删数据**，见已知限制）；`{ok:true, result:{message}}` |
| `/system-df` | POST | `{target?}` | `{ok:true, disk:{summary, images, volumes, buildCache, truncated, degraded, degradedReason}}`：`summary` 四类汇总，明细各上限 100 行（**先排序再截断**）；老 docker 只降级不报错 |
| `/run-command` | POST | `{target?, id}`（必填） | `{ok:true, recreate:{id, name, command, warnings, secretKeys, omitted}}`——**只推导，不执行** |
| `/action` | POST | `{target?, action, id}` | 需 `allowMutations`（否则 403）；`{ok:true, result:{id, action, message}}` |
| `/exec` | POST | `{target?, id, command, timeoutSec?}` | 需 `allowExec`（否则 403）；`{ok:true, result:{id, command, code, stdout, stderr, truncated, durationMs}}` |

其余子路径 404（`unknown route: ...`）；`/config`、`/targets`、上述四条 `*/stream` 之外的 GET 返回 405；
执行失败（docker 报错、目标解析失败等）返回 500 或 400 加 `{error}` 文本。

### SSE 事件协议（`/logs/stream`、`/stats/stream`、`/events/stream`、`/images/pull/stream`）

四条长流共用同一份基建（`openSseStream`）：统一写头 + `flushHeaders()`、15s 一帧 `: ping` 心跳、活跃流
登记（插件禁用 / 配置热更新 / 卸载时统一 `end` + abort）、客户端断开静默中止，以及**管道起来后先发一帧
`ready`**。每帧一行 `event:` + 一行 JSON `data:`（单行封装：换行 / 引号被转义，多字节字符不会被 SSE 行
边界截断），随后空行：

| 事件 | data | 说明 |
| --- | --- | --- |
| `ready` | `{}` | **执行器真的起来了**才发一帧（本机子进程 `spawn` / 远端通道已开 = `StreamHandlers.onStart`）：客户端据此才认为「在收数据」。**响应头到达（`onopen`）不算**——响应头由 `flushHeaders()` 立刻写出去，而建连（SSH `acquire` / 远端开通道）可能卡十几秒。起不来就**没有** `ready` |
| `line` | `{"d":"..."}` / `{"e":"..."}`；多源时 `{"id":"<容器 id>","d"\|"e":"..."}` | stdout / stderr 分片（不保证按行切，客户端自行拼行）。日志流与拉取流用。**`ids=` 多源时每帧带 `id`**，客户端按它把分片派回对应容器 |
| `source-end` | `{"id":"<容器 id>","code":N\|null}` | **仅多源**：该容器的 `docker logs -f` 自然退出（容器停止）。整条连接**不关**——其余容器照常推；`end` 要等所有源都结束 |
| `source-error` | `{"id":"<容器 id>","message":"..."}` | **仅多源**：该容器这一条子流失败。整条连接也不关，其余容器继续；客户端标注「部分出错」 |
| `stats` | `ContainerStats` | 统计流专用：每秒每个容器一帧，字段与 `/stats` 快照完全一致。服务端按**扁平 `{...}` 抽取**（`docker stats` 即便 stdout 是管道也走 TTY 渲染器，帧里混着 `ESC[H/ESC[K/ESC[J`，按行解析会整行丢掉）并折叠同一采样的重复渲染 |
| `event` | `{action, name, image, composeProject?, time?, exitCode?}` | 事件流专用：一帧一个容器事件（白名单外的事件行在服务端就丢了；值为 null 的字段省略） |
| `end` | `{"reason":"container-exit"\|"stats-exit"\|"events-exit"\|"pull-exit","code":N, ...}` | 执行器自然退出。日志流附容器退出码（多源时取**按 `ids` 顺序最后一个非 null** 的退出码，各容器的真实退出码在各自的 `source-end` 里）、统计流 reason=`stats-exit`、事件流 reason=`events-exit`、拉取流附 `ref` |
| `error` | `{"message":"..."}` | 参数 / 执行失败，随后关闭；连接层断路不会发这个事件 |

**多容器单连接（`ids=`，D168）**：聚合日志把 N 个容器塞进**一条** SSE——宿主为每个容器各起一条
`docker logs -f`，帧里带 `id` 分流。这样聚合视图无论选几个容器都只占浏览器**一条**同源连接（旧实现是
每容器一条 `EventSource`，叠加活动条的事件流会吃满 D165 实测出来的 4 条常驻流）。单源 `id=` 的形状
**逐字节未变**：帧不带 `id`、不发 `source-end`/`source-error`。`/config` 的 `streamProtocol` 因此升到
**3**：客户端据此决定走单连接还是退回「每容器一条」。四条流的差异只有「执行器 + 结束原因」：

| 流 | 执行器 | 自然结束条件 | 关闭语义 |
| --- | --- | --- | --- |
| `/logs/stream` | `docker logs --follow`（`ids=` 时每个容器各一条） | 容器停止（`container-exit`；多源时全部容器的流都结束） | 前端关 FOLLOW / 切页 / 关面板 |
| `/stats/stream` | `docker stats`（**无** `--no-stream`） | 全部被统计容器退出（`stats-exit`） | **前端主动断**（这条流不会自己停） |
| `/events/stream` | `docker events`（`--filter type=container`） | daemon 侧流结束（`events-exit`） | 切页 / 切目标 / 关面板 |
| `/images/pull/stream` | `docker pull` | 拉取完成 / 失败（`pull-exit`） | 前端离开拉取视图 |

- 响应头：`content-type: text/event-stream; charset=utf-8`、`cache-control: no-cache`、
  `connection: keep-alive`，写头后立即 `flushHeaders()`（宿主 gzip 对 `text/event-stream` 显式跳过）。
- 心跳：每 15s 一帧 `: ping` 注释（SSE 规范里客户端忽略）。
- **背压与溢出（D153）**：客户端消费不过来时帧进内存队列（每条流 ≤ 8MB）；日志 / 拉取流溢出时丢最旧的
  整帧、只留最新，并推一条 `skip{frames,bytes}`（`skip` 帧自身永不丢）——**流不断**；skip 排队期间再发生
  丢弃时**原地更新**这条 skip 的账目（D156）。统计 / 事件流溢出时补 `end{reason:output-limit}` 收尾，由
  客户端重连。另外 `write()` 返回 false 只代表「越过高水位」，帧**不会被重写**。
- **分片合帧（D151）**：日志流与拉取流把上游分片按 50ms 窗口合并后再推（同一通道严格保序、stdout 先于
  stderr、攒满 256KB 立刻推），所以 `line` 帧的 `d` / `e` 里可能有**多行**——客户端本来就按「任意分片」
  切行。`end` 帧一定排在窗口里最后一批 `line` 之后。
- 清理：客户端断开 → 立即中止执行器（本机 `SIGTERM`，2s 未退再 `SIGKILL`；SSH 关闭该 exec channel、
  连接池连接保留复用），不写任何帧；插件禁用 / 配置热更新 / 卸载 → 服务端主动收尾（abort + `end`）。
- SSH 的长流会占用连接池里的连接（busy 计数），空闲回收（120s）不会误杀；流结束后恢复回收。
- **「已就绪」的判据（客户端侧）**：绿点 /「实时跟随中」只认宿主那帧 `ready`——响应头到了不算。此外每条
  流还有一条「更硬的证据」兜底：事件流的第一条真实事件、日志流的第一行、统计流的第一个采样、拉取流的
  第一帧进度。**开发档错位**（宿主进程还跑着旧代码、浏览器却读到新的 `client.js`）另有版本协商：
  `/config` 的 `streamProtocol < 2` 说明该宿主从不发 `ready`，客户端退回旧判据并只重开一次那条流。

## 安全模型

**docker socket ≈ 目标主机的 root 权限。** 能访问 daemon 就能挂载宿主目录、以特权模式起容器、读容器里的
密钥——因此本插件按「只读优先」设计：

1. **默认只读**。`allowMutations` 未开启时，`/action`、`/images/remove`、`/images/prune`、
   `/images/pull/stream` 一律返回 403，面板的启停删 / 镜像删除 / 清理 / 拉取不可用，`docker_action`、
   `docker_image_remove`、`docker_image_prune`、`docker_image_pull` 工具**根本不注册**；`allowExec` 未开启
   时，`/exec` 返回 403，`docker_exec` 工具同样不注册。两个开关互相独立，必须在设置卡片由用户显式打开。
   读取类路由（`/logs/stream`、`/stats/stream`、`/events/stream`、`/images/inspect`）不受这两个开关影响。
   **`allowExec` 只管本插件的「一次性」exec 通道**（`/exec` 路由、`docker_exec` 工具、容器详情抽屉
   「概览」页签的一次性命令框）——卡片上的**「终端」按钮跑的是 `docker exec -it` 交互式 shell，由 tty
   承载、不经过这两个开关**，只读模式下也可用（它不是漏了门，是刻意留的进入通道，见「已知限制」）。
2. **破坏性操作要复述后果**。`remove` 映射为 `docker rm`（**不带 `-f`**），agent 公告要求执行前向用户
   确认目标容器；运行中容器会报错并附「容器仍在运行：先停止再删除」的提示，不会静默强删。
3. **凭证不落明文（建议）**。`password` / `passphrase` 支持 `env:NAME` 凭据引用，值存在**官方凭据存储**
   （`$DSH_HOME/.credentials.yaml`）里，避免明文写进 `settings.yaml`；`agent` 认证（`SSH_AUTH_SOCK`）
   完全不落盘。配置快照只回「是否已设置」。
4. **主机指纹 TOFU 钉扎**。首次连接记录 sha256 指纹，之后必须一致，变更即拒绝连接（防中间人）；tty 已
   确认过的主机会被当作种子直接信任并复制进本插件的记录。TOFU 的固有边界是「首次若已遭遇 MITM，记下的
   就是伪指纹」，以及按 host:port 只存一条（同主机多密钥类型可能误报变更，删除记录重连即可重新校准）。
5. **命令一律 argv 构造，绝不做字符串拼接**。容器名 / ID 先过白名单 `assertRef`
   （`[A-Za-z0-9][A-Za-z0-9_.-]*`，≤128 字符，拒绝空格、`;`、`$()`、反引号等），镜像与容器引用同理；
   远程经 `shJoin` 逐参数单引号转义后交给远端 shell，本机 `spawn(bin, args)` 不经 shell。
6. **输出有上限**。`maxOutputKb` 限制单次命令的 stdout/stderr 字节数，超出截断并标记，避免大日志撑爆
   内存或 agent 上下文。
7. **HTTP 只对本机开放**。全部路由走 loopback 围栏，远程浏览器无法调用。
8. **日志实时流是只读能力**。`GET /logs/stream` 与 `/logs` 一致：不受 `allowMutations` / `allowExec` 门控
   （它不改容器状态），但同样只放行 loopback、`id` 过 `assertRef` 白名单、参数经同样的夹紧。与快照不同，
   长流没有 `maxOutputKb` 上限（跟随被截断就失去意义），内存防护由客户端的 5000 行环形缓冲承担。
9. **变更操作有逐条使用审计**。kit elevation 的审计行回答「授权了」，这里回答「用了」：每一次**过了
   能力闸**的变更 / exec 都落一行 `[dsh-docker] capability-use: …` 结构化审计行（出口是宿主 stdout），
   面板路由与 agent 工具两条入口都覆盖。行格式、不记什么（403 / tier-gate ask）与「exec 命令会随行
   出现」这条代价，见「已知限制」的使用审计条。

## 已知限制

- **没有交互式 TTY**：`exec` 是一次性命令（`docker exec <id> sh -c <cmd>`，不带 `-i` / `-t`），不能跑
  vim / top / 交互式 shell，也不能喂 stdin 做对话。交互排障请到 tty 面板执行 `docker exec -it <容器> sh`。
- **`allowExec` 不是「进不了容器」的闸**：卡片「终端」按钮（`docker exec -it
  '<容器>' sh`）经 tty 的 `ttyTerminal` 承载，**不检查 `allowExec`**，只读模式下
  也照常可用——exec 被关时面板给的提示原文就是这么说的（「打开『允许 exec』，或
  直接复制卡片上的 exec 命令到终端面板交互式进入容器」）。这是刻意的：只读巡检时
  进容器看现场是最常用的一条路径，闸门管的是**本插件自己**那条一次性通道
  （`/exec` 与 `docker_exec`：改本地状态、可被 agent 工具批量调用），交互式 shell
  归 tty（用户主动操作、它自己才是 PTY 的所有者）。**代价要说清**：装上 tty 之后，
  `allowExec` 对**页内脚本**（第三方插件的 client 半体 / XSS）本来就不是边界——它们
  走 `ttyTerminal.open` 或 WS `spawn` 帧就能跑任意命令，比本插件的一次性 exec 还强。
  这一层的威胁模型边界见 [architecture.md § 7](../../docs/architecture.md#7-一条请求经过什么)。
- **事件流有断线窗口**：`docker events` 是「从现在开始」的推流，断线重连期间发生的事件服务端已经推过、不会
  补发。客户端用「重连成功后先做一次全量列表刷新」来补偿（对齐状态，不是把事件补回来）；要精确的完整事件
  历史请用 `docker_events` 工具（带 `--since` 的快照）。
- **浏览器同源连接预算是硬约束，docker 面板最多只占 1 条常驻流（D165 实测 + D168）**：宿主是
  **HTTP/1.1**（没有 h2 多路复用），而**每条 `EventSource` 独占一条连接、且不会主动释放**。吃满之后，同一
  个页面里**所有**普通请求（列表刷新、`/api/*`、会话加载……）一起排队——用户看到的是**整个 DSH 页面
  卡住**，不只是 docker 面板。docker 面板的常驻流**在任何视图下都只有 1 条**：列表 = 活动条事件流；详情 =
  日志 / 统计 FOLLOW（同一时刻只有一个页签）；聚合 / Compose 日志 = **一条** `ids=` 多容器流；拉取 = 一条
  进度流（进入详情 / 聚合时事件流主动断开，回列表重连并补一次全量刷新）。超了不是「慢一点」，是同页面所有
  请求一起失效；完整实测数据见 [DEFECTS.md](./DEFECTS.md) 的 D165，复核方式是在 devtools 里连开
  `new EventSource('/api/dsh-docker/events/stream?target=<目标>')` 到第 5 条，再打一次普通请求。
  （WebSocket **不**占这份预算；流式日志 / 统计在浏览器侧的保留量见「使用」。）
- **多标签页与聚合上限**：那些连接是整个页面共享的（官方 `dsh-client-hmr`、其它插件的 SSE 都算）；治本要
  宿主换 WebSocket / h2，或各插件共用一条多路复用连接。聚合上限 3 现在是「可读性 + SSH 8 条通道额度」的
  上限，不再由浏览器预算推出（D168）：一屏混三份以上日志会看不清，且每个被选容器在宿主侧仍各跑一条
  `docker logs -f`（SSH 目标上就是一条 channel）。`PICK_MAX = 3` 即此值。
- **SSH 目标上的通道额度是共享的（`MaxSessions`）**：一个目标只维持**一条** TCP 连接，长流与短命令共用
  这条连接上的通道，而 OpenSSH 的 `MaxSessions` 默认只有 10。长流会一直占到用户关掉面板为止，聚合日志里
  每个被选容器仍各占**一条** channel——叠上刷新 / inspect 这类短命令就可能逼近额度，远端拒绝时看到的是
  `(SSH) Channel open failure: open failed`。插件对每个 SSH 目标限制**同时最多 8 条长流**（源码常量 `MAX_STREAMS_PER_TARGET`，即 10 − 2，留两
  条给短命令），聚合上限也定在 3；折叠右侧栏标签会主动断流、把通道还回去。（`D150`）两道补救：① **短命令
  按目标排队**（每条连接同时最多 2 条并发，`DSH_DOCKER_SHORT_CHANNELS` 可覆盖，仅测试 / 排障）；② **额度
  满会自愈**——远端回 `no more sessions` 这类拒绝时，插件丢掉并**关闭**那条连接、重建一条再重试一次，宿主
  日志留一行 `通道额度已满：已重建连接重试`（这条连接**不会自己恢复**）。（`D164`）③ **中止长流时插件自己
  的账当场结清**—— `AbortSignal` 触发时除了向远端 `KILL` + 关通道，还会**直接结束这条流**（原先只等远端
  `close`，远端不确认时那条流的 `busy` 计数**永远不会减**，累积到 8 之后该目标的每条长流都被拒绝且没有
  自愈路径）。**根治办法在 sshd 一侧**：把那台主机的 `MaxSessions` 调大——例如
  `/etc/ssh/sshd_config.d/10-dsh-maxsessions.conf` 写一行 `MaxSessions 50`，再 `sshd -t && systemctl
  reload ssh`（reload 只影响新连接）。当前上限是编译期常量，需要跟着改就提 issue。
- **docker CLI 版本差异**：解析走 `--format '{{json .}}'`，字段随版本增减，解析器一律降级而不抛异常
  （例如 `State` 缺失就从 `Status` 推导状态）；缺字段时对应列可能为空，权威数据请用 `docker inspect`。
- **`rm` 不带 `-f`**：容器 `remove` 映射 `docker rm`、镜像 `remove` 映射 `docker image rm`，都不加 `-f`
  ——运行中的容器、被引用的镜像会失败并给出提示；要强制删除得去 tty 面板手动执行。
- **SSH 目标需要免 sudo 的 docker**：账号不在 docker 组时权限错误原样透出，不做自动 sudo 提权。
  **远端未安装 docker** 时 `probe` 失败（退出码 127），PATH 不一致时可把 `dockerBin` 填成绝对路径。
- **`dockerBin` 的校验发生在落盘之前**：非法值直接 400 并带上原因，不会被写进 `settings.yaml`。
  **指向 `.cmd` / `.bat` 时本机通道起不来**：本机执行走裸 `spawn`，Windows 上 Node 会拒绝直接执行 `.cmd`
  （`EINVAL`）——手写包装脚本请改用 `.exe`，或等待本机通道也切到 kit 的 `spawnPortable`。
- **Compose 项目视图只认 `com.docker.compose.project`**：`docker stack deploy` 起的 swarm 服务带的是
  `com.docker.stack.namespace` / `com.docker.swarm.service.name`，于是这些容器显示为「未分组」。要支持得
  另立一套 stack 分组语义。
- **`volume prune` 的回收范围随版本变，且可能删数据**：Docker 29 上 `docker volume prune -f` **只回收匿名
  未用卷**（命名卷留着）；而 docker ≥ 23 有 `-a/--all`，docker < 23 没有这个开关、plain prune 会把未被
  使用的**命名卷**一起删掉。本插件就不带 `--all`，确认文案写明了版本差异；要删命名卷请用
  `/volumes/remove`。
- **podman 兼容靠 `dockerBin`**：填 `podman` 即可跑，但 `stats` 与 `--format '{{json .}}'` 的字段和输出
  格式与 docker 有差异，只能依赖解析器的降级路径，未逐项验证。
- **没有镜像构建 / Compose 编排变更**：镜像支持拉取 / 删除 / 清理 dangling，但没有 `docker build`、
  `docker save` / `load`、`docker push`；Compose 是**只读**项目视图。**网络 / 卷的变更只有面板按钮，
  没有 agent 工具**——刻意不扩大 agent 侧的变更面。
- **诊断是判据，不是专家**：这些判据覆盖的是「容器自报的客观证据」（退出码 / OOM / 重启次数 / 健康检查 /
  资源压力 / 日志里的报错行），**不理解业务**。「这个报错是否可忽略」那一步交给「交给 Agent」之后的人或
  模型。代价：诊断一次跑**四条**只读命令，在 SSH 目标上就是最多四条 channel（短命令闸把并发压到 2，所以是
  两批），慢机器上会感觉到等。
- **事件采集给的是独立预算（8MB + 留尾）**：单容器一小时的事件里 `exec_create` / `exec_start` /
  `exec_die` 这类三连占绝大多数，按通用的 512KB 档会让时间线**永远为空**。所以诊断的事件采集单独放宽到
  8MB 并保留尾部——窗口内事件特别多的容器，时间线只覆盖**最近的**一段。
- **等价 `docker run` 是近似，不是备份**：compose 管理的容器不带网络别名 / labels / depends_on；
  `--privileged` / `--link` / ENTRYPOINT 覆盖 / 自定义健康检查 / 匿名卷等**故意不还原**，逐条列在
  `omitted` 里。**它不能替代 `docker commit` / 卷备份**。
- **磁盘明细的两处截断各自独立**：宿主侧每类 100 行（`truncated`）、工具侧 20 行；真机上卷多到几千个时，
  `system df -v` 的输出本身也可能撞 8MB 预算（那时 `degraded: true`，汇总仍然可用）。「合计可回收」由
  字符串解析成字节再相加——**解析不出就整条显示 `—`**。
- **总览只汇总「容器概况」，且完全只读**：只做计数卡与异常置顶表，**没有任何跨目标操作**，也不聚合日志 /
  统计 / 事件流。另外「异常」只含 `unhealthy` 与 `restarting`：`ContainerSummary` 里没有 `exitCode`，
  无法区分「崩溃退出」与「人工停掉」——死掉的容器请在计数卡的「已停止」里看。
- **连接栏按钮需要一条匹配的目标才有数据**：按钮在 SSH 标签上一律显示，但若会话主机没有对应的 `kind=ssh`
  目标（连接簿名或 `host:port` 都匹配不上），点开只会看到「尚未配置为 Docker 目标」的提示；本地标签的
  连接栏本身隐藏。目标增删后最多 30 秒内刷新（设置卡片保存会立即刷新）。
- **`enabled: false` 是热生效**：保存后工具立即注销、公告撤下、除 `/config` 外的数据路由 403（进行中的长流
  也会被立即收尾）。路由对象本身不卸载、靠 403 拦截；`/config` 始终可读写，设置卡片就是重新启用的入口，
  无需重启 `dsh web`。
- **使用审计走宿主 stdout，exec 命令会随行出现**：每一次**过了能力闸**的变更 / exec（面板路由与 agent 的
  `docker_action` / `docker_image_remove` / `docker_image_prune` / `docker_image_pull` / `docker_exec`；
  403 与参数校验 400 不记，「使用 = 过了闸」）落一行 `[dsh-docker] capability-use:
  capability=allowMutations|allowExec source=http|tool action=… target=… ref=… ok=true|false
  durationMs=…`，key=value 风格与 kit elevation 的授权行一致；pull 进度流拆 start / end 两行。**出口是
  `console.log`**（`D162`：真机实测 `ctx.logger` 的行在 0.2.x 宿主上既不进 stdout 也不落盘）——跑
  `dsh web` 的那个终端里就能看到、可 grep。**代价**：exec 的命令会记进行尾 `detail`（连同退出码），整段
  截断 200 字符、控制字符转义成字面量——行是给人看的，就得接受它出现在终端可见的日志流里。docker 报错也
  算一次使用（`ok=false`）；tier-gate 的 ask / deny 不记。没有查询界面、没有独立审计文件。
- **跨目标聚合的边界**：并发上限 4；**单目标预算 90s（兜底）**，而每条命令自己的超时（30s）才是被遵守的
  那个——到点时**底层的子进程 / SSH 通道会被真的取消**，否则超时那条命令会继续占着远端会话槽（D161）。
  单个目标失败/超时只影响它自己那一格。目标很多时总览的请求量线性增长（每目标 2 个请求），自动刷新会放大
  这个量。

## 工作原理

```
浏览器半体 (client.js)
  ├─ 侧边栏「容器」入口 → 面板（目标选择 / 容器列表 / 卡片动作 / 五页签详情 / 多目标总览 /
  │   Compose · 镜像 · 网络 · 卷 · 磁盘各页）与终端抽屉（ttyTerminal.mount）
  ├─ 四条 SSE（/logs/stream 含 ids=、/stats/stream、/events/stream、/images/pull/stream）
  │   + 普通 fetch → /api/dsh-docker/*（loopback 围栏；写路由另需同源证明）
  └─ 可选消费 tty 的 ttyConnbar / ttyPanel / ttyTerminal（未装或版本不足逐项降级）

宿主半体 (src/index.ts)
  ├─ settings 命名空间 docker → normalizeConfig（夹紧 / 白名单键）
  ├─ 只读复用 tty settings 的 sshHosts（连接簿）与 hostKeys（指纹种子）
  ├─ resolveTarget → 每目标一个 DockerApi（src/docker.ts）+ RemoteExec（src/ssh-exec.ts）：
  │   argv 构造 + assertRef + 输出上限；懒连接池 / 非 PTY exec channel / shJoin / TOFU
  ├─ openSseStream：四条流共用一份基建（ready / 心跳 / 活跃流登记 / 背压 / 统一收尾）
  └─ 路由 + agent 工具（读类恒注册，写 / exec 类按开关注册）——清单见上面两张表
```

## 开发与验收

```bash
pnpm --filter @hyzyn/dsh-docker build       # tsc → lib/（宿主半体）+ esbuild → client.js（浏览器半体）
pnpm --filter @hyzyn/dsh-docker typecheck
pnpm --filter @hyzyn/dsh-docker smoke       # 三套离线回归，都不需要 docker daemon（项数以脚本尾部自报为准）
pnpm test                                    # 仓库级 vitest（本包 test/ 下的用例都在里面；项数以运行输出为准）
```

> **改了哪一半、怎么才生效**：`client-src/*`（浏览器半体）→ esbuild 出 `client.js`，宿主有 client HMR
> 轮询，**热更**、刷新页面即见；`src/*.ts`（宿主半体）→ tsc 出 `lib/`，**必须是新进程才生效**（运行中的
> `dsh web` 在启动时就把 `lib/` 载进内存），改完 `pnpm build` 记得重启。忘了重启的症状是**客户端是新的、
> 宿主是旧的**：宿主侧新增的提示语没出现，那就是旧进程。

验证面分三层：**三套离线 smoke**（不需要 docker daemon）、**本包的 vitest 套件**、以及**真 daemon 的
手工验收清单**。逐项的覆盖范围、浏览器侧性能门槛与手工步骤见
[docs/verification.md](./docs/verification.md)——README 只留「怎么跑」，清单不在这里重复。

## 版本 / 许可证

`@hyzyn/dsh-docker`（版本以 `package.json` 为准） · [Apache License 2.0](../../LICENSE)
