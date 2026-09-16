# @hyzyn/dsh-docker

中文 | [English](README.en.md)

> DSH 侧边栏「容器」面板：本机与 SSH 主机的容器一屏巡检——读日志、看资源、进容器、启停删，**默认只读**。

## 特性

- **常驻会话右侧栏**：面板作为会话右侧栏标签（`sidebar.right.pane.tab`）与对话**同屏**——发完错误交给 Agent 后日志留在右边，不影响看它干活；折叠即退出视野、不占屏。面板级状态（目标 / 视图 / 过滤词 / 选中容器及它的页签）**跨会话保留**，而折叠会主动断流、把 SSH 通道还回去。拿不到右侧栏服务的老宿主自动退回原有的 dock / 模态，行为与旧版一致。
- **日志右键交给 Agent**：日志页拖选报错行 → 右键「直接发送到当前会话 / 填入输入框，我先改改」，把「选中的行 + 目标 / 容器 / 时间窗 + 前后各 20 行上下文」交给会话（内容会进模型上下文，菜单里明写了留意凭证）。投递成功有两处回执：**视口级 toast**（挂 `body`，盖过面板与终端弹窗），以及——终端面板正开着时——**自动折起终端**（`ttyPanel` 契约 v2 的 `minimize()`；会话继续跑，恢复靠侧边栏「终端」入口的徽标），让会话直接露出来。老版本 tty 没有这个能力时退化成 toast 里「会话在面板后面」的指引。需要改稿就先「填入输入框」——**编辑面只有会话输入框一个**（它多行、能看到完整上下文，Agent 收到的就是它），不再另开一张更弱的卡片编辑器。
- **多目标聚合取数**：总览页对全部 `targets[]` 并行请求，单个目标不可达只污染自己那一格；agent 侧同一口径由 `docker_ps target:"*"` / `docker_attention target:"*"` 暴露，跨目标不互相阻塞。
- **「需关注」读权威字段**：不健康 / 反复重启 / OOM 被杀 / 非零退出 / 僵死；OOM 与真实退出码由一次 `docker inspect` 补齐——`docker ps` 摘要里的 137 分不出 OOM 与手动 kill，只按摘要筛必然误报。
- **四条 SSE 长流共用一套基建**：日志 FOLLOW、`docker stats`、`docker events`、`docker pull` 走同一个 `openSseStream`（心跳 / 活跃流登记 / 断开清理），差异只在收尾语义——日志与拉取自然结束，统计与事件由前端主动断。多选聚合日志按 `--timestamps` 前缀还原跨容器真实时序，「暂停」只冻结渲染（流继续接收，恢复时一次性补齐）。
- **默认只读，能力开关分三级**：启停删 / exec / 镜像变更各自独立开关，未开启时 agent 工具**不注册**、HTTP 路由 403（能力不存在，而非调用后报错）；容器名与 ID 过白名单，命令一律 argv 构造 + 单引号转义，密码 / 口令以 `env:VAR` 引用且永不回传浏览器。
- **与 dsh-tty 数据级复用、代码级不耦合**：不 import 任何 tty 代码，tty 也无需改一行源码，两者可各自安装与升级；装了 tty 则消费三个可选扩展点——连接栏动作（`ttyConnbar`）、终端承载（`ttyTerminal`：标签 / dock 承载下经 `open` 新开标签，模态下经 `mount` 就地嵌入抽屉）、以及只在兜底路径用到的终端右侧 dock（`ttyPanel.mountPane`）；未装或版本不足逐项静默降级。

## 与 dsh-tty 的关系

本插件自成一体：不 import 任何 tty 代码，tty 也无需改一行源码，两者可各自单独安装、
各自升级；装了 tty 就在下面这些可选扩展点上协作，没装则安静降级。

| 维度 | 说明 |
| --- | --- |
| 插件形态 | 独立包 `@hyzyn/dsh-docker`，不 import 任何 tty 代码，tty 也无需改一行源码；两者可各自单独安装、各自升级 |
| 连接簿 | SSH 目标可**引用 tty 连接簿条目名**（只读 `ctx.settings.get('tty')` 的 `sshHosts`）；tty 未安装时退化为「内联 host/username」或本机目标 |
| 主机指纹 | 本插件自持一份 `hostKeys`（TOFU），并**优先以 tty 已记录的指纹作种子**——同一主机不必在两处各确认一次 |
| 执行通道 | 自持池化 SSH exec（`src/ssh-exec.ts`），与 tty 的 PTY 会话完全独立，互不占名额 |
| 上下文入口 | tty ≥ 0.13.0 时可选消费其客户端服务 `ttyConnbar`，在 SSH 连接栏（SFTP 旁）插入「容器」按钮（**注册即显示**），目标在点击时按当前会话解析；**本插件自己开的 exec 标签除外**——那种标签正是从容器面板点进来的，再给一个回去的入口等于绕回原地（判定走 `spawnSpec.command`，用户手敲的 `docker exec -it` 不算）；tty 未装 / 版本过旧则静默跳过 |
| 面板承载 | **默认走会话右侧栏标签**（`sidebar.right.pane.tab`）：面板与对话同屏，折叠即退出视野、不占屏；**框架侧边栏**的入口只负责打开或聚焦它，**页类型在同一栏内去重**，反复点不会开出第二个。**终端连接栏**的入口相反——它长在盖满视口的 tty 弹窗上，开标签会被挡住，所以那条走 `ttyPanel.mountPane` 停靠到终端右侧（**入口决定承载**）；投递日志给会话后经 `ttyPanel.minimize()`（契约 v2）折起终端，把舞台让给会话。拿不到右侧栏服务（老版本 DSH）、或把 `localStorage['dsh-docker:carrier']` 置成 `modal` 时，侧边栏入口也回退到 dock（tty 开着时）或自带 backdrop 的全屏模态。三种承载是**同一个组件**，只是外壳与几何不同 |
| 终端承载 | 交互式终端由 tty 承载（它才是 PTY 的所有者）。**右侧栏标签与 dock** 两种承载下，卡片「终端」按钮经 `ttyTerminal.open` **在终端面板新开标签**跑 `docker exec -it`——栏宽通常不够跑 shell，而且标签会随会话切换卸载、内嵌终端会被连带杀掉；**模态**承载下则经 `ttyTerminal.mount` **就地嵌入**面板底部的抽屉（看日志 → 进容器的上下文不断）。未装 tty 或版本不足时复制命令兜底。本插件不实现 PTY / xterm / 重连栈 |
| 分工 | **交互式排障**（`docker exec -it`、容器内 shell、TUI）由 tty 承载（抽屉内嵌或标签）；**只读巡检与 agent 自动化**用本插件自己的 exec 通道 |

数据级复用、代码级不耦合：连接簿与指纹种子是「读同一份 settings」，连接栏按钮是
「消费一个通用扩展点」，都不是「依赖 tty 的模块」，因此 tty 升级或卸载都不会连带
弄坏本插件。

## 安装

```bash
dsh plugin --profile web add @hyzyn/dsh-docker              # npm 安装（发布后）
dsh plugin --profile web add link:$(pwd)/packages/docker    # 仓库开发调试
```

聚合包 `@hyzyn/dsh-all`（或仓库根 bundle）已包含本插件，一次装齐时不必单独
add。装完重启 `dsh web`，侧边栏出现「容器」入口；设置 → 插件 →
「Docker 容器面板」卡片维护目标与开关，**保存即热生效**（`settings/updated`
触发重解析，无需重启）。

> 已在 web profile 里装过 `@hyzyn/dsh-all` 或根 bundle 时**不要**再 add 本包，
> 否则插件行重复挂载，启动报 `duplicate loader entry id`。

## 使用

两个入口，同一个面板。**默认承载是会话右侧栏标签**——入口只负责打开或聚焦它，
面板与对话同屏：发完错误交给 Agent 后，日志留在右边、不影响看它干活。

- **侧边栏「容器」**（总入口）：任何目标都能用，包括本机 docker 与多目标切换。
  已打开则聚焦（页类型在同一栏内去重），不会开出第二个「Docker 容器」标签。
- **投递后去哪儿看**：右侧栏标签承载下会话就在旁边；docked / 模态下发送成功后**终端会自动
  折起**（会话照旧跑着，点侧边栏「终端」入口的徽标恢复），于是你直接落在会话里——不必对着
  一个盖住会话的弹窗猜「点了没有反应」。
- **SSH 连接栏「容器」按钮**（上下文快捷方式，tty ≥ 0.13.0）：在 tty 终端面板的
  SSH 标签里，连接栏 SFTP 按钮旁会出现「容器」——**注册即显示**，点击直接用
  **当前会话那台主机**打开面板，不用再选目标。目标解析发生在点击时：会话来自
  连接簿时按条目名匹配，否则按 `host:port` 匹配已解析的目标；**没配到目标也不会
  藏按钮**——面板会带一条提示告诉你会话主机（含连接簿名）该去设置卡片怎么配。
  这条路径走**终端右侧的 dock**，不开右侧栏标签——按钮长在 tty 弹窗上，而弹窗盖满
  视口，开标签会被整个挡住、看着像「点了没反应」。目标照旧带进面板并重挂到那台主机。
  于是规则是「**入口决定承载**」：框架侧边栏点 → 右侧栏标签（与对话同屏）；
  终端弹窗里点 → 终端右侧 dock（与终端同屏）。

### 承载形态

| 承载 | 何时用 | 行为 |
| --- | --- | --- |
| **会话右侧栏标签**（默认） | 宿主提供 `sidebarRight` / `sidebarRightTabs` | 与会话同屏；折叠=退出视野但不丢状态（面板级状态按模块保留，见下）；支持右侧栏的 fullscreen 铺满 |
| **终端右侧 dock** | 从**终端连接栏**的「容器」按钮进来（按钮就在 tty 弹窗上，标签会被它挡住），或拿不到右侧栏服务 / `localStorage['dsh-docker:carrier'] = 'modal'` 且 tty ≥ 0.16 面板开着 | 挂在终端面板右侧（拖宽 / 折叠 / ✕ 由 tty 提供，终端继续可用）；同一时刻只挂一个，挂上去会收掉前一个（例如 tty 自己的 SFTP） |
| **全屏模态**（兜底） | 上面两条都不成立 | 自带 backdrop、点击外部关闭；面板 z-index 高于 tty 弹窗 |

回滚到旧形态只要在控制台执行 `localStorage.setItem('dsh-docker:carrier', 'modal')`
（`removeItem` 恢复默认）。这个开关是临时灰度用的，所以刻意没进 settings——不值得为
它连带改宿主配置结构、设置卡片与文档。

**状态保留**：面板看的是主机、不是工作区，所以 view / 过滤词 / 选中容器（含概览-
日志-统计页签）/ 目标都是**跨会话保留**的；容器详情内部的日志过滤与 LINES 开关跟具体
容器绑定，不保留。**折叠标签会断开全部实时流**（把 SSH 通道还回去），展开时重连——
单容器与聚合建流本来就带 `tail`，历史会自己补回来。

**跨会话粘性**：DSH 右侧栏的标签记录本身是**会话作用域**的（`sidebar.right.pane.tab` 与
`rightbar.session` 都声明 `scope: 'session'`），A 会话开的标签在 B 会话里并不存在。可
容器面板看的是主机，「切个会话它就没了」是纯损失，所以插件额外记了一个「用户希望它开着」
的意图：**切会话时自动在新会话里把标签重开**，只有你点了标签的 ✕ 才停止——也就是
「面板跟人走，而不是跟会话走」。

**dock 兜底形态**（终端右侧栏）：

![docker 面板挂进终端面板右侧 dock：终端保持可见可用](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-docker-dock.png)

这条路径打开的面板**不会盖住终端**：tty ≥ 0.16 时它挂在终端面板右侧的 dock 里
（可拖宽、可折叠成窄条、✕ 收起），终端照常敲命令。dock 模式下卡片「终端」按钮改为
**在同一终端面板新开标签**执行 `docker exec -it`（面板已经在一个终端里了，再嵌一层
没有意义）；同时**不再渲染面板自己的头部**——标题与 ✕ 由侧栏标题栏承担，刷新与只读
徽标并到工具条**末尾并靠右**（刷新中图标自己转，不再另挂 spinner）：左端留给目标 /
视图 / 搜索 / 筛选这些「过滤类」控件，刷新不会被当成第一个筛选项，位置也与非 dock
模式头部里一致；520px 窄栏里不会白留一条空行。

面板内：

![容器列表：目标选择 / 搜索与状态筛选 / 卡片动作条（查看 · 变更两组）](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-docker-panel.png)

- **切目标有过渡与保护**：选择器一变，下方仍是上一个目标的卡片（远端一次往返最长 20s）。
  过渡层的三条原则——**不推版、有方向感、少灰**：
  - 面板正文顶部一条 2px **不定长流光进度条**（绝对定位）给「正在取数」的全局信号；
  - 正文顶部**居中浮出一枚蓝色胶囊**（与 dsh-rss 的加载胶囊同一套位置与配色语言）：
    底色 `color-mix(accent 12%, surface)`、描边 `accent 42%`、文字与旋转图标走 `--dk-accent`；
    可见文案只两段 `⟳ 正在切换到 目标2 · 当前显示：目标1`（不写成一句话、不用引号裹目标名），
    完整的「为什么点不动」放 `title`，需要时 hover 就有；
  - 旧数据保持 **82% + 轻度去色**（不是压暗到看不清）并**锁住指针**：读起来是「另一批
    内容」而不是「坏了」，同时避免照着旧列表操作——那会拿新目标当目标、用旧列表的容器
    ID 发命令，真能停掉对端同名容器；
  - 新数据 **8px 上滑 + 淡入** 200ms 落地，让「换了一批内容」看得见；动效尊重
    `prefers-reduced-motion`。

  以上全部**绝对定位**：切换过程中首卡位置与滚动高度实测完全不变（横幅方案会把内容整块
  推下去）。**切换失败则清空旧列表**并归到新目标的错误态（不继续展示别的目标的数据），
  空态文案也会区分「读取失败」与「筛选过窄」。
- **目标选择**：面板先选目标（来自配置 `targets`，本机 / SSH）；只配置了一个
  目标时默认选中它，agent 工具也可以省略 `target` 参数。
  **会记住上次选的目标**（存浏览器 `localStorage` 的 `dsh-docker:last-target`，不落
  配置、不进 settings）：下次打开面板自动选中它。优先级是**连接栏指定 > 上次记住的
  （且仍存在）> 列表第一个**——记住的目标被删掉/改名后会自动退回第一个，不会停在
  「未知目标」上；从终端连接栏的「容器」按钮进来时，当前会话主机优先于记忆值。换目标是**整段上下文切换**：
  上一个目标还在飞的请求一律作废（列表写入闸），不会出现「选择器已经是目标2、卡片
  还是目标1 的容器」这种串台，也不会让旧目标的超时横幅停在新目标的页面上。
- **多目标总览（只读）**：目标选择器旁的 `总览` pill（配了 ≥2 个目标才出现）——不选
  目标，一屏看全部主机：上面一行**计数卡**（目标名 + 本机 / SSH 标识 + 运行中 /
  已停止 / 不健康），下面**异常容器置顶表**（容器名 / 目标 / 状态 / 镜像；不健康排在
  重启中之前，同级按目标在配置里的顺序，跨轮询不跳行）。取数是**并行 + 渐进落地**：
  每个目标独立发一次 `POST /containers`（`all:true`，裸 `docker ps` 不返回 exited，
  「已停止」会永远是 0），一个目标不可达只影响它自己那一格——卡片描红 + 顶部一条
  「N 个目标不可达」横幅，其余目标的结果照常显示（刻意**不用** `Promise.all` 汇总：
  SSH 不可达要等 readyTimeout 20s，汇总等于让整页静默 20s）。点计数卡回到该目标的
  常规容器列表，点异常行进该容器详情（返回落到**该目标**的容器列表）；**总览不做任何
  跨目标操作**，异常表的行上没有动作按钮。进总览时会清掉「当前这个目标」遗留的
  失败横幅：总览按目标归因（红卡 + 不可达横幅），不再叠一条单目标的「操作失败」——
  同一个 SSH 超时被讲两遍，看着像两台机器都挂了。轮询复用工具条的「自动刷新」开关（默认关）：
  这一页每轮是全 N 个目标各一次 `docker ps`，比任何单目标页都贵。没有异常显示
  「一切正常」；还有目标没答完时，异常区显示「读取中…」、**那张计数卡也进入读取态**
  （转圈 + 压暗，不出 0/0/0——「0 个容器」会被读成「这台机器没容器」，而它只是还没答）
  （「还不知道」不等于「没问题」）。
- **容器列表**：名称 / 状态 / 健康态 / 镜像 / 端口映射 / compose 项目与服务 /
  短 ID；支持按名称或镜像**搜索**、按状态**筛选**（运行中 / 已停止 / 全部），
  以及**自动刷新**（按 `pollIntervalSec` 轮询，切到镜像页会暂停且不显示该开关——
  镜像变化慢，没必要每 5s 跑一次 `docker images`；切回容器页原设置照旧生效）。
  工具条里「含已停止」与「自动刷新」是**成组**的两个开关，搜索框是其中唯一可伸缩的项：
  宽面板下整条工具条收成一行，窄栏（dock 520px）里才按组换行——不会出现一行只有
  一个复选框的孤行。
- **「活动」条（docker events 事件流）**：容器列表头部的可折叠窄栏（默认展开），
  跟着一条 SSE（`GET /api/dsh-docker/events/stream`，服务端跑
  `docker events --filter type=container`）显示最近 8 条事件（时间 + 容器名 + 动作，
  `die` 带退出码如 `die(137)`）。它是**事件驱动刷新**的入口：收到事件后 500ms
  **防抖**触发一次列表重取（不是每帧一次请求），与原有 `AUTO REFRESH` 叠加而不互斥——
  轮询负责兜底，事件负责「刚发生」。事件只留在内存（环形缓冲 50 条），切页即关流，
  换目标清空缓冲。白名单只留九类生命周期动作（start / die / stop / kill / oom /
  health_status / destroy / rename / update）：`exec_*`、`archive-path`（`docker cp`）
  这类噪音在服务端就丢掉了——实测一台跑批机器 24 小时 47 条事件全是 exec，白名单
  命中 0，所以只被 exec 的机器上活动条是空的，这是刻意的。
- **聚合选择（临时多选聚合日志）**：工具条的 `聚合选择` 进入选择态——每张卡片
  左侧出现勾选框，点卡片本体变成**勾选 / 取消**（不再进详情；动作条暂时收起，
  免得一边多选一边误点启停删），工具条与列表之间出现操作条：「已选 N 个容器」+
  `聚合日志` + `取消`。`聚合日志` 至少需要 2 个容器；选到 7~8 个时给一条软提示
  （浏览器同源并发长连接有限制），超过 **8 个**按钮置灰并提示上限。点 `聚合日志`
  进入聚合视图：直接复用 Compose 项目视图那套聚合日志（每容器一条 `/logs/stream`，
  按 `[service]` / 容器名前缀混流，带过滤与自动滚动），返回即退出选择态并清空。
  再点 `聚合选择` 或按 **Esc** 同样退出并清空。勾选是**临时的**：不持久化、不命名
  组合、不进 settings；切目标 / 切「容器 · 镜像 · Compose」分段 / 关面板即失效，
  列表刷新后已消失的容器按 id 自动剔除。
- **按条件一键选中**（多选态）：操作条第二行给出一排条件 chip（`全部可见 / 不健康 /
  需关注 / 已停止`，以及有勾选后的 `同镜像 / 同项目`），计数**按剩余名额截断**——
  chip 上写 8 就真的会选中 8 个；超出上限的数量在 title 与结果提示里如实说明。
  条件只在**当前筛选结果**里生效（先搜索/筛状态再一键选中）。
- **容器卡片**：与参考布局一致的「标签 + 值」行（镜像 / ID / 端口 / 创建 /
  compose，值等宽、可省略）+ 一排图标操作按钮，**按「查看 / 变更」两组用竖线分隔**：

  | 组 | 按钮 | 说明 |
  | --- | --- | --- |
  | 查看 / 进入 | 终端、日志、资源占用 | 不改容器状态，只读模式下也永远可用 |
  | 变更 | 启停、重启、删除 | 按破坏性递增排列；只在 `allowMutations` 开启后可用，未开启时整组置灰 |

  删除额外做了两点防护：破坏性配色 + 与「重启」之间留出间距，点击后仍需二次确认。
  **命令飞行期间整组锁住**：`stop` / `rm` 要等容器真的退出（最长十几秒），这段时间
  确认框保持打开并显示「执行中…」（两个按钮都禁用），卡片的其它变更按钮压暗置灰、
  正在跑的那个图标换成转圈，等列表刷新落地后才恢复——避免中途连点叠出
  stop + restart + remove 这类互相打断的命令。镜像的删除 / 清理走同一套确认框，
  同样有执行中态。点卡片本体进入概览。
- **容器详情（整栏视图）**：顶部为「返回 + 容器名 + 状态徽标 + 目标主机」，
  下方三个标签页——概览（`docker inspect` 权威数据 + 一次性 exec）、日志、
  统计。从卡片的日志 / 统计图标可直接落到对应标签页。
- **日志视图（紧凑两行）**：第一行 = 返回 + 容器名 + 状态 + 目标主机 +
  `LINES`（尾部行数）/ `TIMESTAMPS` / **`FOLLOW`（实时跟随，见下）** /
  `AUTO REFRESH`（开关 + 2/3/5/10s 间隔，仅日志页轮询）+ 刷新 / 下载 / 关闭；
  第二行 = 标签页 + **常驻**的「过滤日志」
  输入框（右侧固定槽显示「N 行」/「N / M 行匹配」；有内容时框内浮出 ✕ 清空，
  Esc 也能清空）。输入框宽度与位置恒定，输入 / 清空都不会挤动这一行。日志正文按级别着色（`[INFO]` 与 `|INFO` 两种常见前缀
  都能识别），时间戳压暗，过滤命中高亮；超过 2000 行只对尾部着色并提示。
  详情视图下不再叠加列表工具条与面板头，每屏只有一个刷新入口。
- **FOLLOW 实时日志流**：日志页 `FOLLOW` 开关打开后，界面从「定时拉快照」切换
  为 **SSE 推送**（`GET /api/dsh-docker/logs/stream`，服务端跑
  `docker logs --follow`）——新日志到达即追加，不再轮询；`FOLLOW` 与
  `AUTO REFRESH` 互斥（开流自动停轮询、开关置灰），关闭即回到快照并立即刷新。
  流式日志保留最近 **5000 行**（环形缓冲，超出丢最旧并提示一次）；过滤 / 级别
  着色与快照完全共用一套渲染。自动滚动到底部，用户向上滚动时暂停并浮出
  「回到底部」按钮；右上状态行显示连接状态，浏览器断线由 EventSource 自动
  重连（只更新状态、不弹错误横幅），容器退出导致流自然结束时自动切回快照刷新。
  连接 / 切页 / 关面板都会关闭 `EventSource`。
- **概览**：`docker inspect` 的权威数据——状态与健康、退出码、重启次数与策略、
  端口映射、挂载（含只读标记）、网络与 IP、entrypoint 与命令、最近一次健康
  检查输出；下方可执行一次性 `docker exec`（需 `allowExec`）。
- **日志**：`docker logs --tail` 的尾部快照（默认 `logTailDefault` 行），可切
  时间戳与 `--since`；输出超过 `maxOutputKb` 会截断并标记。要持续观察新日志就
  打开上面的 `FOLLOW`（同一份 argv 加 `--follow`，无总超时与输出上限，靠连接
  生命周期收尾）。

![日志页：级别着色 + 常驻过滤框 + 行数统计](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-docker-logs.png)
- **统计**：`docker stats --no-stream` 快照（CPU% / 内存用量与占比 / 网络 IO /
  块 IO / PIDs），面板按 `pollIntervalSec` 轮询刷新。统计页还有 **`FOLLOW` 实时
  跟随**：打开后切到 `GET /api/dsh-docker/stats/stream`（服务端跑**不带
  `--no-stream`** 的 `docker stats`，每秒一行），浏览器侧留 **60 个点的环形
  缓冲**画 CPU / 内存**迷你趋势图**（sparkline）。与日志流不同，这条流**不会
  自然结束**，关闭语义是前端主动断 `EventSource`；`docker stats` 自己退出时
  服务端发 `end`（reason=`stats-exit`），界面提示并自动切回快照轮询。
- **Compose 项目视图**：工具条第三段切换。把 `composeProject` / `composeService`
  标签聚合成「项目 → 服务 → 容器」，每个项目一行看全运行数 / 不健康数 / 服务数与
  各容器状态；点进项目可看服务表，或打开**项目级聚合日志**——对项目内每个容器各开
  一条 `/logs/stream`，客户端按 `[service]` 前缀混流（宿主侧 `logsStream` 本
  就支持任意容器，无需新接口），带自动滚动开关与过滤框。混流是到达序，不保证跨
  容器严格时序。
- **镜像**：`docker images` 列表（reference / 大小 / 创建时间 / 短 ID）；
  `<none>:<none>` 的 dangling 镜像带 `dangling` 标记。搜索框与「N / M 个镜像」
  计数**固定在工具条里**（不随列表滚走），表头列名在表体内吸顶。
  每行有「详情 / 删除」两个动作：**详情**打开整栏视图（概览：大小 / 含父层 /
  创建 / 平台 / 层数 / 入口与命令 / 暴露端口 / digest / 标签；构建历史：
  `docker history` 的逐层命令与大小）。**删除**（需 `allowMutations`）二次确认
  后执行 `docker image rm`（不带 `-f`，镜像被引用时会失败并给出「先删相关
  容器」的提示）。
- **网络 / 卷（第五、六段）**：工具条分段扩到「容器 / 镜像 / Compose / 网络 / 卷」
  （窄栏里放不下时分段容器自己横向滚动，不做二级菜单）。两页都是「表格 + 整栏详情」
  的同构布局：
  - **网络**：名称 / 驱动 / 范围 / internal 徽标 / ID，行点击进详情——概览（ID / 驱动 /
    范围 / 创建 / 子网 / 网关 / internal·attachable·ingress·ipv6 / 选项 / 标签）与
    「接入的容器」页签（容器 / IPv4 / IPv6 / MAC）。**容器数刻意不进列表行**：
    `docker network inspect` 才能拿到接入列表，列表逐行 inspect 就是 N 次 docker 调用，
    改成点进详情取一次。
  - **卷**：名称 / 驱动 / 范围 / 挂载点（超长路径限宽省略，title 给全量），详情为
    名称 / 驱动 / 范围 / 挂载点 / 创建 / 选项 / 标签（卷没有反向索引，只有概览一页）。
  - 详情页头部有**删除**按钮，两页工具条各有 **prune 图标**，都受 `allowMutations`
    门控（未开启时置灰 + title 说明），点击后二次确认；删除失败（网络还有容器接着 /
    卷还被占用 / 403）在详情页就地弹横幅，不会静默。
  - 自动刷新与镜像页一致：这两页**不轮询**（清单变化慢，5s 一次 docker CLI 是白烧），
    切页 / 切目标时才刷。
- **拉取镜像（SSE 进度流）**：镜像页工具条的拉取图标（需 `allowMutations`）
  打开拉取视图，输入引用后走 `GET /api/dsh-docker/images/pull/stream`
  （服务端跑 `docker pull`）——逐层进度（Pulling fs layer / Downloading /
  Extracting / Pull complete）实时出现；进度行按「层键」原地更新，TTY 下的 `\r`
  刷新也不会让缓冲区越滚越长。工具条上的「清理 dangling」执行
  `docker image prune -f`，**只删无标签镜像**（刻意不加 `--all`，避免误删未
  使用的普通镜像）。

![镜像页：搜索框固定在工具条，表头吸顶](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-docker-images.png)
- **一次性 exec**：`allowExec` 开启后可输入命令，等价
  `docker exec <容器> sh -c "<命令>"`，返回退出码与 stdout/stderr（无 TTY）。
- **交互式终端（卡片第一个图标）**：跑 `docker exec -it '<容器>' sh`。按 tty 能力
  三级降级——
  ![exec 终端抽屉 + 日志页共存：折叠只藏起来、会话保持运行](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-docker-exec.png)

  1. **就地嵌入（tty ≥ 0.15，推荐）**：在面板底部开一个**终端抽屉**，由 tty 的
     `ttyTerminal.mount` 把终端挂进来。面板不收起，看着容器日志直接进容器敲命令，
     上下文不断。抽屉会挤占正文高度，所以它可以让位而不结束会话：
     **折叠**（标题栏右侧的箭头，或双击顶边）只把抽屉压成一条标题栏，会话照旧跑着；
     **拖拽顶边**可调高度（上限为面板高度的 75%）。真正结束会话的动作只有两个——
     抽屉上的 ✕，以及关闭面板；有活动会话时关闭面板会先弹确认，避免点 backdrop
     空白处时误杀一个正在排障的容器 shell（全局终端面板也是「点空白 = 最小化」，同一取向）。
  2. **借 tty 弹窗开标签（tty ≥ 0.14）**：tty 新开一个标签执行同一命令，随后收起本
     面板（本面板 z-index 更高，不收起用户只会觉得「点了没反应」）。
  3. **复制命令**：未装 tty / 版本过旧 / 内联目标用了 key·password 认证（浏览器端
     没有凭证）时，退化为复制该命令并提示到终端面板粘贴。

  本地目标开本地会话，SSH 目标按连接簿条目名（或 agent 认证的内联字段）走 SSH，
  标签/抽屉标题为 `<容器> · exec`。能力判断走服务契约版本
  （`ttyTerminal.version >= 2` 才有 `mount`），不是猜函数存不存在。

### 目标（本机 / SSH）

| `kind` | 说明 |
| --- | --- |
| `local` | 宿主所在机器上的 docker CLI（`spawn` 直接执行，不经 shell） |
| `ssh` | 经 `ssh2` 连到远程主机，在远程执行 docker CLI（argv 经单引号转义） |

`kind=ssh` 有两种填法：

1. **引用 tty 连接簿条目**：`book` 填条目名（在 设置 → 插件 → 终端面板 的
   连接簿里维护），主机 / 端口 / 用户名 / 认证方式随之生效。设置卡片的下拉
   只列出 tty 已保存的连接簿条目；tty 未安装或条目不存在时，该目标解析失败，
   面板与 agent 工具都会给出明确错误。
2. **内联字段**：`host` + `username` 必填，其余按需（`port` / `auth` /
   `keyPath` / `password` / `passphrase` / `agentForward`）。

目标解析是**每次操作现算**的：在 tty 卡片里改了连接簿条目（换端口、改密码），
下一次操作立即用新值，无需重启。远端需要满足：装了 docker CLI，且当前账号
**免 sudo** 可用 docker（通常在 `docker` 组），否则 `probe` 会原样透出
`permission denied while trying to connect to the Docker daemon socket`
之类的错误。

### 聚合日志（多选 / Compose 项目）

多选容器或打开一个 Compose 项目，都能把多个容器的日志聚合成一条流（每个容器一条
`docker logs -f` SSE，客户端按到达顺序混流）。工具栏提供：

| 控件 | 语义 |
| --- | --- |
| **实时 / 已暂停** | 真暂停（见下） |
| **时间戳** | 显示每行时间戳。时间戳**始终随流接收**（`timestamps=1`），只影响显示 |
| **按到达 / 按时间** | `按到达`：零延迟跟随；`按时间`：用每行的容器时间戳合并成一条真时间线 |
| **级别过滤** | `全部级别 / WARN+ / ERROR+`。**无级别前缀的行（堆栈等续行）继承上一条日志的级别**，所以 ERROR+ 会连它的堆栈一起保留、INFO 的续行一起滤掉；窗口开头的孤儿续行（记录头在窗口外）无从判断，保留 |
| **⬇ .log / ⬇ .md** | 导出当前显示内容：`.log` 是纯行文本（`[服务] ISO时间 正文`），`.md` 带来源容器 / 行数 / 导出时间表头，可直接当工单附件 |

**按时间合并怎么做的**：SSE 各容器建连有先后，A 的首屏历史可能整批先到、B 随后才到，
只对单批排序修不了跨批逆序。实现是**回填最近 400 行**——每批新行到达时把「最近 400 行 +
新行」整体按时间戳重排（`docker logs --timestamps` 的 RFC3339 前缀为排序依据，解析后从
正文里剥掉）。这样既不为了让首屏正确而先憋一段时间（不会开页白屏 1 秒），又能事后纠正
历史错序；代价是「按时间」模式下已在屏上的最近若干行可能轻微重排（正在跟随实时输出时
建议用「按到达」）。

### 聚合日志的「暂停」（真暂停）

多选容器 / Compose 项目的聚合日志有一个 `实时 / 已暂停` 开关。**暂停是内容冻结**，不只是停止自动滚动：

- 暂停期间新到的日志进入客户端缓冲，**DOM 不再追加**——读屏不会被顶走；也不会因为显示上限
  （2000 行）裁掉前部而跳屏；
- 按钮上直接显示攒了多少行（`已暂停 +348`）；
- 恢复时把缓冲一次性并入（沿用 5000 行环形上限）并回到底部。

只停「自动滚动」是不够的：标签写着「已暂停」而内容还在长，用户会以为开关坏了；日志量大时
画面还会因裁前部而自己跳。

### 总览（跨目标）与「需关注」口径

「总览」页一屏铺开全部目标：每个目标一张计数卡（运行中 / 已停止 / 不健康 / **需关注**），
下方是跨目标的「需关注容器」表（容器名 / 目标 / 状态 / **原因** / 镜像，点行进详情、点卡切到
该目标的列表）。三条设计约束：

- **渐进落地 + 失败隔离**：每个目标独立请求、独立落格；一台 SSH 不可达不会让整页静默，
  不可达的目标单独出横幅，其余目标结果照常可用。
- **需关注口径以宿主为准**：容器列表与 `/attention` 并行请求；后者额外做一次 `docker inspect`，
  因此能识别 **OOM（OOMKilled）** 与**真实退出码**——ps 摘要里 `Exited (137)` 分不出是被 OOM
  杀还是手动 kill。拿不到 `/attention`（老版本宿主 / 该目标失败）时退回摘要口径，并在
  计数上标注「需关注（粗判）」。
- **排序**：OOM > 僵死 > 不健康 > 反复重启 > 非零退出；同权重按「最近一次结束时间」倒序，
  刚崩的排在最上面（行 hover 显示结束/启动时间、重启次数、退出码）。

## 配置（设置 → 插件 → Docker 容器面板，保存即热生效）

![设置卡片：目标 CRUD、能力开关与参数，保存即热生效](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-docker-setting.png)

配置落在 settings 命名空间 `docker`，即 `~/.dsh/settings.yaml` 的 `docker:`
段（`$DSH_HOME/settings.yaml`；DSH 的 settings 文件由宿主 `dsh-settings-file`
提供）。插件行里的 composition 配置作为 schema `base` 打底，settings 层覆盖
它；HTTP `POST /api/dsh-docker/config` 是卡片的写入通道，只接受下表这些键
（未知键返回 400）。

| 项 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | true | 关闭整个插件（**需重启 `dsh web` 生效**，与 tty 同语义） |
| `announceToAgent` | true | 是否向 agent 注入能力公告（systemPrompt section `plugin:dsh-docker`） |
| `dockerBin` | `docker` | docker CLI 可执行名或路径（podman 可填 `podman`）；只允许字母、数字与 `_ . / -` |
| `allowMutations` | false | 允许**变更操作**：容器 start / stop / restart / remove、镜像删除 / dangling 清理 / 拉取（面板按钮与 `docker_action`、`docker_image_remove`、`docker_image_prune`、`docker_image_pull` 工具；关闭时 `/action`、`/images/remove`、`/images/prune`、`/images/pull/stream` 返回 403，对应工具不注册） |
| `allowExec` | false | 允许一次性 `docker exec`（面板 exec 输入与 `docker_exec` 工具；关闭时 `/exec` 返回 403） |
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
| `password` | `''` | `auth=password` 的密码；**建议填 `env:VAR`** 引用环境变量 |
| `passphrase` | `''` | 私钥口令；**建议填 `env:VAR`** 引用环境变量 |
| `agentForward` | false | 是否转发本机 ssh-agent（`SSH_AUTH_SOCK` 存在时生效） |

`password` / `passphrase` 里的 `env:VAR` 在连接时才解析（`process.env[VAR]`），
变量缺失或为空会明确报 `环境变量未设置: VAR`。这两个值**永不回传浏览器**：
配置快照里只给 `passwordSet` / `passphraseSet` 两个布尔位。

### `hostKeys[]`（SSH 主机指纹，TOFU）

| 字段 | 说明 |
| --- | --- |
| `host` | 主机名或 IP（必填） |
| `port` | 端口，默认 22（按 host:port 唯一） |
| `fingerprint` | `hostHash: 'sha256'` 回调收到的原样十六进制指纹（必填） |

首次连接自动记录并落盘；之后每次连接必须匹配，**指纹变更直接拒绝连接**，
错误信息带「删除该主机记录再重连」的指引。记录列表在设置卡片里可删除重置。

## agent 工具

| 工具 | 注册条件 | 参数 | 作用 / 典型用法 |
| --- | --- | --- | --- |
| `docker_targets` | 恒注册 | `probe?: boolean` | 列出目标（name / kind / label）；`probe:true` 逐个探测 docker 版本与 daemon 可达性（SSH 目标会建连接，较慢）。其他工具的 `target` 取自这里 |
| `docker_ps` | 恒注册 | `target?`（**传 `*` = 全部目标**）、`all?: boolean` | 列容器（名称 / 状态 / 健康 / 镜像 / 端口 / compose 项目与服务 / 短 ID）；默认只列运行中，`all:true` 含已停止。`target:'*'` 时按目标分组返回，**单个目标不可达不影响其他目标**（该组带 `error`）。排障第一步 |
| `docker_attention` | 恒注册 | `target?`（支持 `*`）、`limit?: number` | **需关注汇总**：不健康 / 反复重启 / 被 OOM 杀 / 非零退出 / 僵死；每条带 `reasons`、`exitCode`、`oomKilled`、`restartCount`。OOM 与真实退出码来自一次 `docker inspect`（ps 摘要里 137 无法区分手动 kill）。排障入口：不确定从哪台/哪个容器看起时先调它 |
| `docker_inspect` | 恒注册 | `target?`、`id`（必填） | `docker inspect` 的权威详情：状态 / 健康检查 / 退出码 / 重启次数 / 端口 / 挂载 / 网络 / 启动命令 |
| `docker_logs` | 恒注册 | `target?`、`id`、`tail?`（1~5000，默认 `logTailDefault`）、`timestamps?`、`since?` | `docker logs --tail` 尾部；`since` 用 docker 语法（如 `10m`、`2026-09-09T10:00:00`）；超上限标记 `truncated` |
| `docker_stats` | 恒注册 | `target?`、`ids?`（逗号分隔的容器名/ID） | `docker stats --no-stream` 快照：CPU% / 内存用量与占比 / 网络 IO / 块 IO / PIDs；`ids` 省略 = 全部运行中容器。实时跟随是面板能力（SSE），工具保持单值快照语义 |
| `docker_images` | 恒注册 | `target?` | 镜像列表（仓库:标签 / 大小 / 创建时间 / 短 ID） |
| `docker_events` | 恒注册 | `target?`、`since?`（docker `--since` 语法，默认 `10m`） | 容器事件快照（`docker events --since <d> --until <now>`，同样过服务端白名单）：start / die / stop / kill / oom / health_status / destroy / rename / update 九类，`exec_*` 等噪音已在服务端丢掉。要持续观察请让用户看面板容器列表的「活动」条 |
| `docker_networks` | 恒注册 | `target?` | 网络列表（名称 / 驱动 / 范围 / 是否 internal / 短 ID）。接入的容器列表不进列表行——详情页会连坐 inspect，列表逐行 inspect 就是 N 次 docker 调用 |
| `docker_volumes` | 恒注册 | `target?` | 卷列表（名称 / 驱动 / 范围 / 挂载点） |
| `docker_image_inspect` | 恒注册 | `target?`、`ref`（必填） | `docker image inspect` + `docker history`：大小 / 含父层大小 / 创建时间 / 平台 / 层数与层列表 / 入口与命令 / 暴露端口 / digest / 构建历史（每步命令与大小） |
| `docker_action` | 仅 `allowMutations` | `target?`、`action`（`start` \| `stop` \| `restart` \| `remove`）、`id` | 容器生命周期操作。`remove` 是破坏性的：删除容器配置与可写层（数据卷不在其中），执行前必须向用户确认目标容器 |
| `docker_image_remove` | 仅 `allowMutations` | `target?`、`ref`（必填） | 删除镜像（`docker image rm`，不带 `-f`）。**破坏性**：被容器或子镜像引用时会失败；执行前须确认目标镜像并复述后果 |
| `docker_image_prune` | 仅 `allowMutations` | `target?` | 清理 dangling（无标签）镜像（`docker image prune -f`）。刻意不加 `--all`，只删无标签镜像 |
| `docker_image_pull` | 仅 `allowMutations` | `target?`、`ref`（必填）、`timeoutSec?`（10~1800，默认 600） | `docker pull` 快照形态（**可能耗时数分钟**）；交互式看逐层进度请让用户到面板镜像页的拉取图标看 SSE 进度流 |
| `docker_exec` | 仅 `allowExec` | `target?`、`id`、`command`（必填，经容器内 `sh -c` 执行）、`timeoutSec?`（1~120，默认 `execTimeoutSec`） | 一次性 `docker exec`，返回退出码 / stdout / stderr；无 TTY，交互式排障请让用户到 tty 面板跑 `docker exec -it <容器> sh` |

- `target` 省略时回落到**唯一**已配置目标；配置了多个目标则必填，错误信息会
  列出可用目标名。
- 两个开关变化会**立即重注册**工具：关掉 `allowMutations` / `allowExec` 后，
  对应工具（含三个镜像变更工具）从 agent 侧消失，无需重启。
- 推荐排障顺序：`docker_targets` → `docker_ps` → `docker_logs` →
  `docker_inspect` → `docker_stats`；镜像排查 `docker_images` →
  `docker_image_inspect`。
- `announceToAgent` 开启时，插件向 systemPrompt 注入一段能力公告（含「默认
  只读」「docker socket ≈ 目标主机 root」的约束提醒），让模型先列目标再动手。

## HTTP 路由（`/api/dsh-docker` 前缀，全部 loopback 围栏）

围栏校验 `remoteAddress`（127.0.0.1 / ::1 / ::ffff:127.0.0.1）、`Host`、
`Origin` 与 `sec-fetch-site`；非本机请求一律 403 `forbidden: loopback-only`。
请求体上限 1MB，响应统一 `application/json` + `referrer-policy: no-referrer`。

| 路由 | 方法 | 请求体 | 返回 |
| --- | --- | --- | --- |
| `/config` | GET | — | `{ok:true, config}`：配置快照（targets 只给 `passwordSet` / `passphraseSet`，另附只读的 `ttyBooks` / `ttyAvailable` / `toolsRegistered`） |
| `/config` | POST | 上表配置键的任意子集 | `{ok:true, config}`；未知键 400，非法 JSON 400 |
| `/targets` | GET / POST | — | `{ok:true, targets:[{name, kind, label?\|error?}]}` |
| `/probe` | POST | `{target?}` | `{ok:true, probe:{ok, bin, serverVersion, error, target}}` |
| `/containers` | POST | `{target?, all?}` | `{ok:true, containers: ContainerSummary[]}`；`target:'*'` 时返回 `{ok:true, groups:[{target,label,ok,error?,data?}]}`（跨目标并发聚合） |
| `/attention` | POST | `{target?}` | 单目标 `{ok:true, items: AttentionItem[]}`；`target:'*'` 时 `{ok:true, groups}` |
| `/inspect` | POST | `{target?, id}` | `{ok:true, details: ContainerDetail[]}` |
| `/stats` | POST | `{target?, ids?: string[]}` | `{ok:true, stats: ContainerStats[]}` |
| `/logs` | POST | `{target?, id, tail?, timestamps?, since?}` | `{ok:true, logs:{id, text, truncated}}` |
| `/logs/stream` | GET | query：`target?`、`id`（必填）、`tail?`（1~5000）、`timestamps?`（`1`/`true`）、`since?` | `200 text/event-stream` 长连接，事件协议见下；参数错误 / 未知目标 / 非 loopback 返回常规 JSON 错误 |
| `/stats/stream` | GET | query：`target?`、`ids?`（逗号分隔；省略 = 全部运行中） | `200 text/event-stream`：每秒一帧 `stats`（ContainerStats，形状与 /stats 快照一致）；不会自然结束，靠客户端断连收尾 |
| `/events/stream` | GET | query：`target?` | `200 text/event-stream`：一帧 `event` 一个容器事件（服务端已过白名单，值缺失的字段省略）；不会自然结束，靠客户端断连收尾 |
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
| `/action` | POST | `{target?, action, id}` | 需 `allowMutations`（否则 403）；`{ok:true, result:{id, action, message}}` |
| `/exec` | POST | `{target?, id, command, timeoutSec?}` | 需 `allowExec`（否则 403）；`{ok:true, result:{id, command, code, stdout, stderr, truncated, durationMs}}` |

其余子路径 404（`unknown route: ...`）；`/config`、`/targets`、上述三条
`*/stream` 之外的 GET 返回 405；执行失败（docker 报错、目标解析失败等）返回
500 或 400 加 `{error}` 文本。

### SSE 事件协议（`/logs/stream`、`/stats/stream`、`/events/stream`、`/images/pull/stream`）

四条长流共用同一份基建（`openSseStream`）：统一写头 + `flushHeaders()`、15s
一帧 `: ping` 心跳、活跃流登记（插件禁用 / 配置热更新 / 卸载时统一 `end` +
abort）、客户端断开静默中止。各自只差执行器与结束原因：

每帧一行 `event:` + 一行 JSON `data:`（JSON 单行封装：换行 / 引号被转义，
多字节字符不会被 SSE 行边界截断），随后空行：

| 事件 | data | 说明 |
| --- | --- | --- |
| `line` | `{"d":"..."}` / `{"e":"..."}` | stdout / stderr 分片（不保证按行切，客户端自行拼行）。日志流与拉取流用 |
| `stats` | `ContainerStats` | 统计流专用：每秒每个容器一帧，字段与 `/`stats` 快照完全一致。服务端按**扁平 `{...}` 抽取**（`docker stats` 即便 stdout 是管道也走 TTY 渲染器，帧里混着 `ESC[H/ESC[K/ESC[J`，按行解析会整行丢掉）并折叠同一采样的重复渲染，客户端不必再解析 docker 的 PascalCase 字符串 |
| `event` | `{action, name, image, composeProject?, time?, exitCode?}` | 事件流专用：一帧一个容器事件（白名单外的事件行在服务端就丢了；值为 null 的字段省略） |
| `end` | `{"reason":"container-exit"\|"stats-exit"\|"events-exit"\|"pull-exit","code":N, ...}` | 执行器自然退出。日志流附容器退出码、统计流 reason=`stats-exit`、事件流 reason=`events-exit`、拉取流附 `ref` |
| `error` | `{"message":"..."}` | 参数 / 执行失败，随后关闭；连接层断路不会发这个事件 |

四条流的差异只有「执行器 + 结束原因」：

| 流 | 执行器 | 自然结束条件 | 关闭语义 |
| --- | --- | --- | --- |
| `/logs/stream` | `docker logs --follow` | 容器停止（`container-exit`） | 前端关 FOLLOW / 切页 / 关面板 |
| `/stats/stream` | `docker stats`（**无** `--no-stream`） | 全部被统计容器退出（`stats-exit`） | **前端主动断**（这条流不会自己停） |
| `/events/stream` | `docker events`（`--filter type=container`） | daemon 侧流结束（`events-exit`） | 切页 / 切目标 / 关面板 |
| `/images/pull/stream` | `docker pull` | 拉取完成 / 失败（`pull-exit`） | 前端离开拉取视图 |

- 响应头：`content-type: text/event-stream; charset=utf-8`、`cache-control:
  no-cache`、`connection: keep-alive`，写头后立即 `flushHeaders()`（宿主 gzip
  对 `text/event-stream` 显式跳过，不会缓冲）。
- 心跳：每 15s 一帧 `: ping` 注释（SSE 规范里客户端忽略）。
- 清理：客户端断开 → 立即中止执行器（本机 `SIGTERM`，2s 未退再 `SIGKILL`；
  SSH 关闭该 exec channel、连接池连接保留复用），不写任何帧；插件禁用 / 配置
  热更新 / 卸载 → 服务端主动收尾（abort + `end`）。
- SSH 的长流会占用连接池里的连接（busy 计数），空闲回收（120s）不会误杀；
  流结束后恢复回收。

## 安全模型

**docker socket ≈ 目标主机的 root 权限。** 能访问 daemon 就能挂载宿主目录、
以特权模式起容器、读容器里的密钥——因此本插件按「只读优先」设计：

1. **默认只读**。`allowMutations` 未开启时，`/action`、`/images/remove`、
   `/images/prune`、`/images/pull/stream` 一律返回 403，面板的启停删 / 镜像
   删除 / 清理 / 拉取不可用，`docker_action`、`docker_image_remove`、
   `docker_image_prune`、`docker_image_pull` 工具**根本不注册**；`allowExec`
   未开启时，`/exec` 返回 403，`docker_exec` 工具同样不注册。两个开关互相
   独立，必须在设置卡片由用户显式打开。读取类路由（`/logs/stream`、
   `/stats/stream`、`/events/stream`、`/images/inspect`）不受这两个开关影响。
2. **破坏性操作要复述后果**。`remove` 映射为 `docker rm`（**不带 `-f`**），
   agent 公告要求执行前向用户确认目标容器；运行中容器会报错并附
   「容器仍在运行：先停止再删除」的提示，不会静默强删。
3. **凭证不落明文（建议）**。`password` / `passphrase` 支持 `env:VAR` 引用，
   配合 dsh-env-manager 托管密钥可避免明文写进 `settings.yaml`；`agent`
   认证（`SSH_AUTH_SOCK`）则完全不落盘。配置快照只回「是否已设置」。
4. **主机指纹 TOFU 钉扎**。首次连接记录 sha256 指纹，之后必须一致，变更即
   拒绝连接（防中间人）；tty 已确认过的主机会被当作种子直接信任并复制进
   本插件的记录。TOFU 的固有边界是「首次若已遭遇 MITM，记下的就是伪指纹」，
   以及按 host:port 只存一条（同主机多密钥类型可能误报变更，删除记录重连
   即可重新校准）。
5. **命令一律 argv 构造，绝不做字符串拼接**。容器名 / ID 先过白名单
   `assertRef`（`[A-Za-z0-9][A-Za-z0-9_.-]*`，≤128 字符，拒绝空格、`;`、
   `$()`、反引号等），镜像与容器引用同理；远程经 `shJoin` 逐参数单引号
   转义后交给远端 shell，本机 `spawn(bin, args)` 不经 shell。
6. **输出有上限**。`maxOutputKb` 限制单次命令的 stdout/stderr 字节数，超出
   截断并标记，避免大日志撑爆内存或 agent 上下文。
7. **HTTP 只对本机开放**。全部路由走 loopback 围栏，远程浏览器无法调用。
8. **日志实时流是只读能力**。`GET /logs/stream` 与 `/logs` 一致：不受
   `allowMutations` / `allowExec` 门控（它不改容器状态），但同样只放行 loopback、
   `id` 过 `assertRef` 白名单、参数经同样的夹紧。与快照不同，长流没有
   `maxOutputKb` 上限（跟随被截断就失去意义），内存防护由客户端的 5000 行
   环形缓冲与 2000 行着色上限承担。

## 已知限制

- **没有交互式 TTY**：`exec` 是一次性命令（`docker exec <id> sh -c <cmd>`，
  不带 `-i` / `-t`），不能跑 vim / top / 交互式 shell，也不能喂 stdin 做
  对话。交互排障请到 tty 面板执行 `docker exec -it <容器> sh`（本机与 SSH
  目标都可以）。
- **事件流有断线窗口**：`docker events` 是「从现在开始」的推流，浏览器断线重连期间
  发生的事件服务端已经推过、不会补发。客户端用「重连成功后先做一次全量列表刷新」
  来补偿（状态对齐，不是把事件补回来）；活动条里缺的那几条只能靠刷新后的最终状态
  推断。要精确的完整事件历史请用 `docker_events` 工具（带 `--since` 的快照）。
- **流式能力的四条边界**：日志页 `FOLLOW`（SSE + `docker logs -f`）、统计页
  `FOLLOW`（SSE + `docker stats` + 60 点 sparkline）、容器列表的事件流
  （SSE + `docker events`，驱动活动条与列表防抖刷新）、镜像页拉取进度流
  （SSE + `docker pull`）；但 agent 工具 `docker_logs` / `docker_stats` /
  `docker_image_pull` 一律保持**快照语义**（单值返回模型不适合无界流）。流式
  日志在浏览器侧只保留最近 5000 行（丢最旧并提示），统计只保留 60 个采样点。
  SSH 长流会占住连接池中的该连接（busy），同一主机上的其它命令复用同一条连接——
  但**不是互不影响**：通道额度是共享的，见下一条。**统计流不会自然结束**，关闭必须
  由前端主动断 `EventSource`。
- **SSH 目标上的通道额度是共享的（`MaxSessions`）**：一个目标只维持**一条** TCP 连接，
  所有长流与短命令共用这条连接上的通道，而 OpenSSH 的 `MaxSessions` 默认只有 10。
  长流（日志 / 统计 / 事件）会一直占到用户关掉面板为止，聚合日志还能一次占 8 条——
  正好把额度用光，于是紧接着一次「刷新列表」（短命令）就被远端拒绝，报的是
  `(SSH) Channel open failure: open failed`。所以插件对每个 SSH 目标限制**同时最多
  8 条长流**（= 10 − 2，留两条给刷新 / inspect 这类短命令），聚合日志在 **SSH 目标**
  上的可选上限也从 8 收到 6（本地目标走子进程，不受影响）。超限与远端拒通道时给出的
  都是带指向性的提示，而不是 ssh2 的原始文案。若你的 sshd 调过 `MaxSessions`
  （`sshd -T | grep maxsessions`），当前上限是编译期常量，需要跟着改就提 issue。
  折叠右侧栏标签会主动断流、把通道还回去。
- **docker CLI 版本差异**：解析走 `--format '{{json .}}'`，字段随版本增减，
  解析器一律降级而不抛异常（例如 `State` 缺失就从 `Status` 推导状态，健康态
  从 `(healthy)` / `(unhealthy)` 提取）；缺字段时对应列可能为空，需要权威
  数据请用详情（`docker inspect`）。
- **`rm` 不带 `-f`**：容器 `remove` 映射 `docker rm`、镜像 `remove` 映射
  `docker image rm`，都不加 `-f`——运行中的容器、被容器或子镜像引用的镜像会
  失败并给出提示；要强制删除得去 tty 面板手动执行。
- **SSH 目标需要免 sudo 的 docker**：账号不在 docker 组时 docker 报权限错误，
  面板与工具原样透出，不做自动 sudo 提权。
- **远端未安装 docker**：`probe` 失败（`command not found` / 退出码 127），
  面板显示错误；PATH 不一致时可把 `dockerBin` 填成绝对路径。
- **podman 兼容靠 `dockerBin`**：填 `podman` 即可跑，但 `stats` 与
  `--format '{{json .}}'` 的字段和输出格式与 docker 有差异，只能依赖解析器
  的降级路径，未逐项验证。
- **没有镜像构建 / Compose 编排变更**：镜像支持拉取 / 删除 / 清理 dangling，
  但没有 `docker build`、`docker save` / `load`、`docker push`；Compose 是**只读**
  项目视图（按项目分组 + 项目级聚合日志），不提供 `compose up` / `down` / `restart`。
- **`volume prune` 会删数据，且行为随版本变**：docker ≥ 23 的 `docker volume prune`
  有 `-a/--all`，**不带时只删匿名卷**（本插件就不带）；但 docker < 23 没有这个开关，
  plain prune 会把未被使用的**命名卷**一起删掉。所以卷清理的确认文案把版本差异写明了，
  执行前请确认没有要保留的数据卷。
- **网络 / 卷的变更只有面板按钮，没有 agent 工具**：镜像的 remove / prune 有对应工具，
  网络 / 卷这轮只补了 HTTP 端点（`/networks/remove` 等）与面板按钮——刻意不扩大 agent
  侧的变更面。要让 agent 也能删，需要另外加工具（含确认约定）。
- **总览只汇总「容器概况」，且完全只读**：目标选择器旁的 `总览` 只做计数卡与异常
  置顶表，**没有任何跨目标操作**（启停删仍在单目标列表里逐个做），也不聚合日志 /
  统计 / 事件流（那些仍是单目标、单容器页面的事）。另外「异常」只含 `unhealthy` 与
  `restarting`：`ContainerSummary` 里没有 `exitCode`，无法区分「崩溃退出」与「人工
  停掉」，把全部 `exited` 都算异常等于让停过一次的容器永久刷屏——死掉的容器请在
  计数卡的「已停止」里看。
- **连接栏按钮需要一条匹配的目标才有数据**：按钮在 SSH 标签上一律显示，但若会话
  主机没有对应的 `kind=ssh` 目标（连接簿名或 `host:port` 都匹配不上），点开只会看到
  「尚未配置为 Docker 目标」的提示而不是容器列表；本地标签的连接栏本身隐藏。
  目标增删后最多 30 秒内刷新（设置卡片保存会立即刷新）。
- **`enabled: false` 需重启**：关闭插件不会卸载已注册的路由与工具（进行中的
  长流——日志 / 统计 / 拉取——会被立即收尾，但路由本身仍在），重启 `dsh web`
  才彻底停用。
- **变更操作无独立审计日志**：只有 docker 自身的记录与宿主 `ctx.logger` 的
  常规输出。

- **跨目标聚合的边界**：并发上限 4、单目标超时 45s；单个目标失败/超时只影响它自己那一格
  （组里带 `error`）。目标很多时总览的请求量随目标数线性增长（每目标 2 个请求），自动刷新
  会放大这个量——目标多时建议关掉自动刷新。

## 工作原理

```
浏览器半体 (client.js)
  ├─ 侧边栏「容器」入口 → 面板：目标选择 / 容器列表（搜索 + 状态筛选）/
  │   容器卡片（动作条分两组：查看=终端/日志/统计 ｜ 变更=启停/重启/删除）/
  │   容器列表「活动」条（事件驱动刷新）+「聚合选择」多选 → 临时聚合日志/
  │   多目标总览（全部目标并行取数 + 渐进落地；计数卡 / 异常置顶表；只读）/
  │   Compose 项目视图（项目分组 / 服务表 / 项目级聚合日志）/
  │   镜像列表（行内详情 · 删除）+ 镜像详情（层 / 构建历史）+ 拉取进度 /
  │   网络列表 + 网络详情（子网 / 接入的容器）+ 卷列表 + 卷详情 / 一次性 exec
  │     └─ 终端抽屉：tty ≥ 0.15 时经 ttyTerminal.mount 就地嵌入 tty 的终端
  │        （面板不收起；折叠/拖拽只改尺寸，会话不中断；✕ 或关面板才 dispose，
  │        有活动会话时关面板先确认 → tty 那边结束会话并拆 DOM）
  │     ├─ fetch → /api/dsh-docker/*（loopback 围栏）
  │     ├─ FOLLOW → EventSource /logs/stream（SSE：5000 行环形缓冲 / 自动贴底 /
  │     │   回到底部 / 断线自动重连 / 容器退出自动回快照）
  │     ├─ 统计 FOLLOW → EventSource /stats/stream（SSE：60 点环形缓冲画
  │     │   CPU / 内存 sparkline；**前端主动断**，docker stats 自己退出才收流）
  │     ├─ 事件 → EventSource /events/stream（SSE：活动条环形缓冲 50 条 +
  │     │   500ms 防抖触发列表重取；重连成功后补一次全量刷新）
  │     ├─ 拉取 → EventSource /images/pull/stream（SSE：逐层进度按层键 upsert）
  │     └─ 聚合日志 → 项目内每容器一条 /logs/stream，客户端按 [service] 混流
  ├─ 可选消费 tty 的 ttyConnbar 服务 → SSH 连接栏「容器」按钮
  │   （按 book 名 / host:port 匹配已配置目标，命中才出现）
  ├─ 可选消费 tty 的 ttyPanel 服务（0.16.0）→ 终端面板开着时挂右侧 dock
  └─ 可选消费 tty 的 ttyTerminal 服务 → 卡片「终端」按钮直接开 docker exec 标签
      （tty 不可用 / 凭证不在浏览器时退回复制命令）

宿主半体 (src/index.ts)
  ├─ settings 命名空间 docker（~/.dsh/settings.yaml）
  │   DOCKER_SETTINGS_SCHEMA → normalizeConfig（夹紧 / 白名单键）
  ├─ 只读复用 tty settings 的 sshHosts（连接簿）与 hostKeys（指纹种子）
  ├─ resolveTarget：local → runLocal；ssh → book 查连接簿或内联字段
  ├─ 每目标一个 DockerApi（src/docker.ts）
  │   ├─ argv 构造 + assertRef 白名单 + 输出上限（maxOutputKb）
  │   └─ 解析容错：{{json .}} 逐行/数组、字段名大小写兼容、缺字段降级
  ├─ RemoteExec（src/ssh-exec.ts）
  │   ├─ 懒连接池：同 user@host:port 复用一条连接，空闲 120s 回收
  │   │   （每 30s 扫一次，连接超时 20s，keepalive 10s；busy>0 的长流跳过回收）
  │   ├─ 非 PTY exec channel：一命令一 channel，收完 stdout/stderr 即关；
  │   │   长流（run()/stream()）不设总超时与输出上限，靠 AbortSignal 停止
  │   ├─ shJoin 单引号转义（远端 shell 解析）；env:VAR 取密
  │   └─ hostVerifier TOFU 钉扎（首次记录、变更拒绝）
  ├─ runLocal / runLocalStream：spawn(dockerBin, args)（不经 shell，本机目标）
  │   停止阶梯：SIGTERM → 2s 未退出 SIGKILL
  ├─ 通用 SSE 长连接 openSseStream（src/index.ts，四条流共用一份基建）
  │   ├─ loopback 围栏 + assertRef / assertImageRef + tail 夹紧（与快照路由一致）
  │   ├─ 写头 + flushHeaders / 15s ping 心跳 / 活跃流登记 / 前端断开静默 abort
  │   ├─ /logs/stream：docker logs -f → line{"d"|"e"} + end{container-exit,code}
  │   ├─ /stats/stream（只读）：docker stats 逐行归一 → stats{ContainerStats}；
  │   │   不会自然结束，前端断连即 abort，docker stats 自退则 end{stats-exit}
  │   ├─ /events/stream（只读）：docker events --filter type=container →
  │   │   event{action,name,image,...}（白名单过滤）；daemon 侧结束则 end{events-exit}
  │   ├─ /images/pull/stream（allowMutations）：docker pull → line{d|e} +
  │   │   end{pull-exit,code,ref}；未开启变更时 403 且不建流
  │   └─ 插件禁用 / 配置热更新 / 卸载 → 四条流统一 end + abort
  ├─ 镜像路由：/images/inspect（只读）· /images/remove · /images/prune（allowMutations）
  ├─ 网络 / 卷路由：/networks · /volumes 与各自的 inspect（只读）、remove / prune（allowMutations）
  └─ agent 工具：docker_targets / docker_ps / docker_inspect /
     docker_logs（快照语义不变）/ docker_stats / docker_events / docker_images /
     docker_image_inspect / docker_networks / docker_volumes（恒注册）
     + docker_action / docker_image_remove / docker_image_prune / docker_image_pull
       （allowMutations）/ docker_exec（allowExec）
```

## 开发与验收

```bash
pnpm --filter @hyzyn/dsh-docker build       # tsc → lib/（宿主半体）+ esbuild → client.js（浏览器半体）
pnpm --filter @hyzyn/dsh-docker typecheck
pnpm --filter @hyzyn/dsh-docker smoke       # 三套离线回归，都不需要 docker daemon
pnpm test                                    # 仓库级 vitest（含本包 logs-stream / streams / ssh-stream-budget 三套）
```

> **改了哪一半、怎么才生效**（踩过两次的坑）：
>
> - `client-src/*`（浏览器半体）→ esbuild 出 `client.js`。宿主有 client HMR 轮询各插件的
>   client bundle，**热更**，刷新页面即见；
> - `src/*.ts`（宿主半体）→ tsc 出 `lib/`。**必须是新进程才生效**：运行中的 `dsh web`
>   在启动时就把 `lib/` 载进内存，之后 `lib/` 再变它也不会重载。改完 `pnpm build` 记得
>   重启：`dsh web --profile <name>`。
>
> 忘了重启的症状很迷惑：**客户端是对的、宿主是旧的**，于是错误文案、重试、配额这类宿主侧
> 逻辑全都不生效，看起来像「改了没用」。判断依据是**文案**——宿主侧新增的提示语如果没出现，
> 那就是旧进程。

`scripts/smoke.mjs`（35 项，读取 `lib/` 构建产物）覆盖纯逻辑：ps 解析（字段映射 /
compose 标签 / 端口 / `State` 缺失推导 / 噪声行 / JSON 数组）、端口串解析与去重、
stats 解析（百分比 / 内存 / IO / PIDs）、size 与 percent 的异常输入、images 解析
（dangling）、**image inspect / history（JSON 与纯文本表格两条路径）解析**、
inspect 解析（状态 / 健康 / 退出码 / 挂载 / 网络 / 端口 / 缺字段不抛异常）、
`assertRef` / **`assertImageRef`（放行 registry/digest、拒绝 flag 与注入）** 注入
拒绝、`assertBin`、`formatBytes`、`shJoin` 转义、`DockerApi` 的 argv 构造
（ps / logs / action / exec / probe 成败 / **image inspect·rm·prune·pull·statsStream·pullStream**）、
`normalizeConfig` 默认值与夹紧、`sanitizeTargets` / `sanitizeHostKeys`、
`resolveTarget` 的四种路径、`mergeTargetSecrets` 的凭证保留语义。

`scripts/route-smoke.mjs`（54 项）用**假 cordis ctx + 假 docker CLI 脚本**跑端到端：
插件挂载（settings / 工具 / 路由 / 能力公告注册）、**26 条路由**的实际调用与返回
（含 `/logs/stream`、`/stats/stream`、`/events/stream`、`/images/pull/stream` 四条 SSE
的事件序列与参数校验，事件流另断噪音被白名单丢掉）、`docker_events` 工具的快照
输出与 `since` 字符集校验、`/images/inspect` 的详情 + 构建历史、`/config` 凭证脱敏、未知配置键
400、默认只读时 `/action`、`/exec` 与镜像变更（remove / prune / pull 流）403 且
对应工具不注册、打开开关后（含 `settings/updated` 热更新路径）立即解锁、非
loopback 403（含三条流路由）、容器名 / 镜像引用注入尝试被白名单拒绝、省略
`target` 的回落与多目标报错、禁用后流路由 403。

`scripts/client-smoke.mjs`（27 项）在 Node 里用最小 DOM / React 桩执行构建产物
`client.js`：验证注册 id 与 factory 形状、只 require 平台 seed 提供的模块
（`react` / `react/jsx-runtime` / `react-dom/client`）、`apply` 注册的 settings
卡片 key 等于命名空间 `docker`、找不到宿主侧边栏时安静降级且卸载可重复调用，ttyConnbar 集成的四条路径（连接簿名命中 / host:port 命中 / 未配置主机不加按钮 / tty 未安装静默跳过），FOLLOW 的 SSE 订阅与「回到底部」交互（静态断言），**镜像详情 / 拉取流 / 删除 / prune 入口**、**统计 FOLLOW + sparkline 钩子**、**Compose 分组与聚合日志**、**「活动」条装配 + 事件环形缓冲 / 动作标签 / 防抖**（纯逻辑经 `__events` 测试缝），以及侧边栏折叠态（`data-sidebar-collapsed`）隐藏入口标签的样式规则。
需要真 daemon 的验证走下面的手工清单。

`test/logs-stream.test.ts`（27 例，随根 `pnpm test` 跑）覆盖日志实时流的四层：
`logsStream` 的 argv 构造与 `assertRef` 白名单、SSE 帧的单行 JSON 封装（换行 /
多字节）、本地流生命周期（假 spawn：跨 chunk 多字节、SIGTERM→SIGKILL 阶梯、
close resolve、spawn error）与 SSH 长流的 busy 计数配对 / sweeper 跳过、以及
路由层的事件序列 / 心跳 / 客户端断开静默中止 / 插件禁用统一收尾。

`test/streams.test.ts`（33 例）覆盖**统计流 / 事件流 / 拉取流 / 网络卷 / 通用 SSE 基建**：
`statsStream` 不带 `--no-stream`（与快照同一构造点）、`pullStream` 的
`assertImageRef` 白名单、`/stats/stream` 把逐行 JSON（含跨 chunk 的半行）归一成
`stats` 事件且形状与 `/stats` 快照一致、心跳、客户端断开静默中止、
`eventsStream` 的 argv（无 `--since` / `--until`，带 `type=container` 过滤）与
`events()` 快照的 `--since` + `--until`（不传 until 会永不退出）、
`parseContainerEvent` 的白名单 / 坏行丢弃 / health_status 后缀 / 字段抽取 /
`status` 老字段兼容、`/events/stream` 的事件序列与跨 chunk 半行、
`/images/pull/stream` 的 allowMutations 门禁（403 不建流）/ `pull-exit` 收尾 /
禁用时统一收尾、**`assertName` 的校验矩阵（`/` 与 `:` 必须被拒——这两条正是
`assertImageRef` 会放行的）、网络 / 卷的 ls·inspect·rm·prune argv（prune 必带 `-f`）、
network / volume 的 ls·inspect 解析容错（字符串布尔、缺 `Mountpoint` 的老版本、
空输出 / 坏行）、`/networks` 与 `/volumes` 八条端点的门控（未开门 remove/prune 403、
缺 name 400、非法名 500）**，以及 `formatBytes`。

### 手工验收清单

1. **本机目标**：加一条 `kind=local` 的 `本机`，`probe` 返回 server 版本；
   容器列表与 `docker ps -a` 一致（含已停止容器）。
2. **SSH 目标**：tty 连接簿里已有条目时，用 `book` 引用它 → 容器列表 / 详情 /
   日志正常；首次连接日志里出现「已记录 host key 指纹（TOFU）」，第二次不再
   提示；手动改掉 `hostKeys` 里的指纹后重连，应**被拒绝**并给出重置指引。
3. **只读拦截**：两个开关都关时，`/action`、`/exec`、`/images/remove`、
   `/images/prune`、`/images/pull/stream` 全部 403；agent 侧只有 7 个只读工具，
   面板的启停删 / 镜像删除 / 清理 / 拉取按钮置灰。打开「允许变更操作」后这些
   路由与工具立即出现（无需重启）。
4. **日志 / 统计 / 镜像**：`tail` 与 `timestamps` / `since` 生效；统计显示
   CPU、内存、网络与块 IO；镜像列表含 dangling 条目标记。
5. **FOLLOW 实时日志流**：日志页打开 `FOLLOW` → 状态行先「正在连接」后
   「实时跟随中」，`docker logs -f` 的新行即时出现（`docker run --rm alpine sh
   -c 'i=0; while :; do echo line-$i; i=$((i+1)); sleep 1; done'` 可观察）；
   开 FOLLOW 时 `AUTO REFRESH` 置灰、轮询停止；向上滚动出现「回到底部」、
   点击回到底部并恢复自动贴底；关闭 FOLLOW 立即回到快照。停掉容器 → 流收到
   `end` 提示「容器已退出（退出码 N）」并自动补一次快照。杀掉 `dsh web` 再拉起
   （或热改插件配置）→ 状态行短暂「正在重连」后自愈，不弹错误横幅。SSH 目标
   同样跑一遍，确认流跑着时同一主机的 `docker ps` 面板操作不受影响（连接复用），
   且空闲回收（120s）不会掐断流。
6. **统计实时跟随**：统计页打开 `FOLLOW` →「正在连接统计流…」→「实时跟随中
   （docker stats）」，CPU / 内存 sparkline 每秒长一点（跑 `docker run --rm
   alpine sh -c 'while :; do :; done'` 观察 CPU 起来）；关 FOLLOW 立即回快照并
   恢复轮询。停掉被统计的容器 → 流收到 `end`（stats-exit）提示后自动回轮询。
   注意**这条流不会自然结束**：切页 / 关面板必须断掉 `EventSource`（宿主侧应
   看到 `docker stats` 被 SIGTERM）。
7. **镜像详情 / 删除 / 清理**：镜像页点某行「详情」→ 概览里的层数与
   `docker image inspect` 一致、构建历史与 `docker history` 一致（Docker ≥ 26
   走 `--format`，老版本走纯文本表格兜底）；dangling 行用镜像 ID 查。点「删除」→
   二次确认后执行 `docker image rm`；删除被容器引用的镜像应失败并给出提示。
   「清理 dangling」只删无标签镜像，输出末尾带 `Total reclaimed space`。
8. **拉取进度流**：镜像页工具条的拉取图标（悬停显示「拉取镜像」）→ 输入本地没有的小镜像（如 `alpine:3.20`）
   → 逐层状态行实时出现且按层原地更新；完成后提示「拉取完成」并自动刷新列表。
   拉取中点「停止」或离开视图 → `docker pull` 被 SIGTERM 结束，不残留进程。
   未开启「允许变更操作」时该按钮置灰、直接访问 `/images/pull/stream` 返回 403。
9. **Compose 项目视图**：用一份 compose 起两三个服务（`docker compose up -d`）→
   工具条切到「Compose」→ 服务归到一个项目卡片下，运行数 / 服务数 / 状态正确；
   点进项目看服务表，切「聚合日志」→ 各服务日志按 `[service]` 前缀混流出现
   （`docker compose logs -f` 的等价物），过滤框可按服务名与内容过滤；关「自动
   滚动」后新日志继续进缓冲但视图不跳。无 compose 标签的容器归入
   「（非 compose 容器）」。
10. **`allowMutations` 打开后**：stop / start / restart 成功；对运行中容器
    remove 报错并附「先停止再删除」提示，先 stop 再 remove 成功。
11. **`allowExec` 打开后**：`ls -la /app` 之类命令返回 stdout 与退出码；把命令
    换成 `sleep 60`（`timeoutSec` 调小）应被中断并报超时；`command` 超过 8000
    字符被拒绝。
12. **exec 抽屉与正文共存**（tty ≥ 0.15）：卡片「终端」开抽屉后切到日志 / 统计 /
   另一台容器的详情，抽屉与终端会话都必须活着；**折叠**（箭头或双击顶边）把抽屉
   压成一条标题栏、会话继续跑（展开即回原样）；**拖拽顶边**能调高度且不超过面板
   的 75%；此时点 backdrop 空白处或面板 ✕ 应弹「结束容器终端会话」确认，取消后
   会话仍在，确认才结束（tty 侧收到 kill）。
   离线回归：`node packages/tty/scripts/preview.mjs docker-exec-logs`
   （无头 Chrome 跑真实客户端：抽屉 + 日志页 + 折叠展开，断言会话未被结束）。
13. **从连接栏进容器面板（dock 模式，需 tty ≥ 0.16）**：tty 面板里开一个 SSH 标签 →
   连接栏「容器」→ 容器面板应挂在**终端右侧**（不是全屏弹窗），终端仍可输入；
   拖左边缘可调宽（上限面板宽 72%）、标题栏箭头折叠成窄条（终端拿回全部宽度、
   容器面板不卸载）、✕ 收起面板且 SSH 标签不受影响；此时点卡片「终端」应在同一
   终端面板**新开一个 `<容器> · exec` 标签**，而不是再嵌一个终端抽屉。
   离线回归：`node packages/tty/scripts/preview.mjs docker-dock`
   （断言 docked / 无 backdrop / 折叠后终端变宽 / 容器面板存活）。
14. **多选聚合日志**：容器列表点 `聚合选择` → 卡片左侧出现勾选框、卡片动作条收起；
   勾 2~3 个容器 → 操作条显示「已选 3 个容器」，点 `聚合日志` → 聚合视图标题为
   「聚合日志 · 3 个容器」，三条流按 `[service]` / 容器名前缀混流出现；只勾 1 个时
   按钮置灰并提示「至少选择 2 个容器」，勾到 9 个时置灰并提示最多 8 个；列表里
   停掉其中一个容器 → 该条流走原有 `end` 语义结束，其余流不受影响。
15. **Esc 退出选择态**：选择态下按 Esc → 回到普通列表、勾选清空、动作条消失；
   再点一次 `聚合选择`（此时标签是 `退出选择`）效果相同；切目标 / 切分段 / 关面板
   也都会把选择态和勾选一起清掉。
16. **事件活动条**：容器列表头部出现「活动」条，状态点先黄后绿、文案「实时接收中
   （docker events）」；执行 `docker restart <容器>` / `docker stop`+`start` → 1 秒内
   列表状态跟着变，活动条出现 `stop` / `start`（异常退出显示 `die(137)` 这种带码
   形式）；点标题可折叠（事件流不中断，展开后仍是累积的最新 8 条）；
   `docker exec` 连续几次**不产生任何事件**（`exec_*` 已被服务端白名单丢掉）；
   断网 / 重启 `dsh web` 后恢复时状态点短暂黄色并自动补一次全量列表刷新。
17. **网络 / 卷**：工具条分段出现「网络」「卷」。网络列表应含 `bridge` / `host` / `none`
   与 compose 创建的项目网络；点某条进详情 → 概览里子网 / 网关与 `docker network
   inspect` 一致、`internal` 网络带徽标，「接入的容器」页签列出容器名与 IPv4。
   卷列表的挂载点与 `docker volume ls` 一致（超长路径省略、悬停看全量）。
   未开「允许变更操作」时两个 prune 图标与详情里的删除键都是灰的；打开后：
   删除一个没有容器接入的网络成功、删一个还在用的网络报错并给出提示；
   卷清理会弹带「数据会一起删除」的确认框。**注意**：卷清理在 docker < 23 上会连
   命名卷一起删，先在测试目标上确认为妙。

18. **多目标总览**：配两个以上目标（本机 + 一台 SSH）→ 目标选择器旁出现 `总览` pill，
   点进去一屏出现两张计数卡（各带「本机」/「SSH」徽标）与异常区；卡片数字与该目标
   容器列表的口径一致。把其中一个目标的 SSH 地址改错（或停掉远端 docker）再刷新 →
   只有那张卡描红、顶部出现「1 个目标不可达」，另一张卡照常显示结果，**页面不会**
   等 SSH 超时才出内容（渐进落地）。点异常行 → 落到那台主机上该容器的详情，返回后是
   **该目标**的容器列表而不是总览；点计数卡 → 该目标的容器列表。全部正常时异常区显示
   「一切正常」；还有目标没答完时显示「读取中…」。打开「自动刷新」→ 按
   `pollIntervalSec` 轮询全部目标（关掉即停）。
19. **切目标不串台（列表写入闸）**：让 目标1（不可达的 SSH）先失败出「操作失败」横幅，
   随即切到正常的目标2 → 横幅应**随切换立即消失**、列表是 目标2 的容器；再等 20s
   让 目标1 的超时响应**在其之后**才回来 → 横幅不得重新出现、列表也不得被换成
   目标1 的容器。从总览点 目标1 那张红色计数卡进去，同样不该看到上一个目标的失败。
   反向验证：切到目标2 后立刻切回目标1（它仍然连不上）→ 横幅应写的是目标1 自己的
   失败，而不是把目标2 的成功结果当成了目标1 的。

## 版本 / 许可证

`@hyzyn/dsh-docker` 0.3.1 · [Apache License 2.0](../../LICENSE)
