# @hyzyn/dsh-docker · 验证面

> 从 [README § 开发与验收](../README.md#开发与验收) 搬入（2026-10-23）：README 只留「怎么跑」，
> 逐项的覆盖范围、性能门槛与手工验收步骤归这里。**这是活文档**——改了测试 / 门禁 / 手工步骤
> 就同步改这里，别把清单再写回 README（同一事实两处全文是债，见
> [docs/conventions.md § 文档分层](../../../docs/conventions.md#文档分层)）。

## 离线 smoke（不需要 docker daemon）

`scripts/smoke.mjs`（读取 `lib/` 构建产物，项数以脚本尾部自报为准）覆盖纯逻辑：ps 解析（字段映射 /
compose 标签 / 端口 / `State` 缺失推导 / 噪声行 / JSON 数组）、端口串解析与去重、
stats 解析（百分比 / 内存 / IO / PIDs）、size 与 percent 的异常输入、images 解析
（dangling）、**image inspect / history（JSON 与纯文本表格两条路径）解析**、
inspect 解析（状态 / 健康 / 退出码 / 挂载 / 网络 / 端口 / 缺字段不抛异常）、
`assertRef` / **`assertImageRef`（放行 registry/digest、拒绝 flag 与注入）** 注入
拒绝、`assertBin`、`formatBytes`、`shJoin` 转义、`DockerApi` 的 argv 构造
（ps / logs / action / exec / probe 成败 / **image inspect·rm·prune·pull·statsStream·pullStream**）、
`normalizeConfig` 默认值与夹紧、`sanitizeTargets` / `sanitizeHostKeys`、
`resolveTarget` 的四种路径、`mergeTargetSecrets` 的凭证保留语义。

`scripts/route-smoke.mjs` 用**假 cordis ctx + 假 docker CLI 脚本**跑端到端：
插件挂载（settings / 工具 / 路由 / 能力公告注册）、**27 条路由**的实际调用与返回
（含 `/logs/stream` 的 `id=` 单源与 `ids=` 多源两条路径、`/stats/stream`、`/events/stream`、
`/images/pull/stream` 四条 SSE 的事件序列与参数校验，事件流另断噪音被白名单丢掉）、`docker_events` 工具的快照
输出与 `since` 字符集校验、`/images/inspect` 的详情 + 构建历史、`/config` 凭证脱敏、未知配置键
400、默认只读时 `/action`、`/exec` 与镜像变更（remove / prune / pull 流）403 且
对应工具不注册、打开开关后（含 `settings/updated` 热更新路径）立即解锁、非
loopback 403（含三条流路由）、容器名 / 镜像引用注入尝试被白名单拒绝、省略
`target` 的回落与多目标报错、禁用后流路由 403。

`scripts/client-smoke.mjs` 在 Node 里用最小 DOM / React 桩执行构建产物
`client.js`：验证注册 id 与 factory 形状、只 require 平台 seed 提供的模块
（`react` / `react/jsx-runtime` / `react-dom/client`）、`apply` 注册的 settings
卡片 key 等于命名空间 `docker`、找不到宿主侧边栏时安静降级且卸载可重复调用，ttyConnbar 集成的四条路径（连接簿名命中 / host:port 命中 / 未配置主机不加按钮 / tty 未安装静默跳过），FOLLOW 的 SSE 订阅与「回到底部」交互（静态断言），**镜像详情 / 拉取流 / 删除 / prune 入口**、**统计 FOLLOW + sparkline 钩子**、**Compose 分组与聚合日志**、**「活动」条装配 + 事件环形缓冲 / 动作标签 / 防抖**（纯逻辑经 `__events` 测试缝），以及侧边栏折叠态（`data-sidebar-collapsed`）隐藏入口标签的样式规则，加上 D168 的两条纯判定
（`streamProtocol ≥ 3` 才走多源单连接、事件流只在列表可见时建）与源码级接线判据。
需要真 daemon 的验证走下面的手工清单。

## vitest 套件（`pnpm test` 里属于本包的）

`test/logs-stream.test.ts`（例数不写死，`vitest run` 的输出是唯一真相源）覆盖日志实时流的四层：
`logsStream` 的 argv 构造与 `assertRef` 白名单、SSE 帧的单行 JSON 封装（换行 /
多字节）、本地流生命周期（假 spawn：跨 chunk 多字节、SIGTERM→SIGKILL 阶梯、
close resolve、spawn error）与 SSH 长流的 busy 计数配对 / sweeper 跳过、以及
路由层的事件序列 / 心跳 / 客户端断开静默中止 / 插件禁用统一收尾，以及
**`ready` 只在 `spawn` 之后发**（响应头已 flush 也一帧不发，且排在第一条日志行前面）、
**`tail=0` 只跟随不补历史**（D133）、**背压不重写已写过的帧**与**积压时丢最旧 + `skip` 通知、
不掐流**（D153）、**skip 账目精确**（D156：skip 排队期间再丢弃，两段缺口都要报——
46 块逐块对账「每一帧要么送达、要么被 skip 记账」）、
**中止长流后 `busy` 必须归零**（D164：远端不确认关通道、累积 8 次都不会把目标钉死，
且收尾后的分片不再投递）、
以及**分片合帧**（D151：十个分片只出一个 `line` 帧；未到窗口就收尾时 `end` 仍排在
这些行之后）、**多源单连接**（D168：`ids=` 一条流装多个容器，帧带 `id`、每源一条
`source-end`、单源失败落 `source-error` 不关连接、`ids` 校验矩阵、客户端断开杀全部子进程）、**`ready` 帧只在管道起来后发**（统计 / 事件 / 拉取三条路由各一例：
`spawn` 之前一帧都没有——响应头已经 flush 了也不算；另两例钉住「`ready` 排在第一条
数据帧前面」与「起不来（`spawn` 失败）不发 `ready`」）。合帧器本身的规则（窗口合并 /
攒满即推 / flush 幂等 / dispose 停表）在 `test/sse-coalesce.test.ts`（6 例）。


`test/log-window.test.ts` 覆盖**窗口化挂载的纯逻辑**（D152，`client-src/log-window.js`）：
实测高度进缓存而没量过的行用估算、`layout` 非贴底时的窗口定位与上下垫高自洽、贴底时锚到
列表尾部且下垫为 0（贴底判定精确的前提）、`reanchor` 只在锚点上方行高变化时产生等量补偿、
`offsetOf` 与「淘汰头部后补偿量 = 被淘汰行总高」（D154 跨代锚点的数学）、
缓存 FIFO 淘汰与空表边界。真 DOM 那一层（量高、锚点修正、贴底钉住）由性能门禁在真 Chrome
里验证，离线侧另有 `scripts/client-smoke.mjs` 的 `__logWindow` 缝。


`test/streams.test.ts` 覆盖**统计流 / 事件流 / 拉取流 / 网络卷 / 通用 SSE 基建**：
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


## 浏览器侧性能门禁（`perf:logs`）

`pnpm --filter @hyzyn/dsh-docker perf:logs`（`scripts/log-perf.mjs`）是**日志页的浏览器侧
性能门禁**：用真 Chrome 量四个场景——「5000 行首屏耗时 / DOM 规模」、「FOLLOW 突发 20000 行
的处理耗时与事件循环最大延迟」、「事件洪泛」（同一 6.2k 行/秒下每事件 1 行 vs 每事件 50 行，
量的就是 D151 合掉的那笔每事件固定开销）、以及「**持续洪泛** 20k 行/秒 × 6s」的稳态
（缓冲满了之后每帧都在淘汰 + 插入，这才是用户报的「日志一快整页就卡」），并**校验两件容易被误解的事**：① 快照被「输出上限（KB）」字节闸截断时**必须有**「已截断」黄色横幅
（否则「LINES 选 1000 只回来 985 行」会被当成丢行——实测那 985 行是 docker 自己的记录粒度，不是丢行）；
② 「上滚暂停跟随」只认**真手势**（wheel / 触摸 / 滚动条 / 键盘）：真手势上滚必须出现
「回到底部」且点一下能恢复，没有手势的位置漂移（洪泛里的夹紧/抖动）**必须不停跟随**；
③ **洪泛中驻留历史**（D154）：跟随流没停、缓冲还在淘汰最旧的行时驻留 1.2s，可见区顶行
必须还是同一行（环形缓冲淘汰的位移没补偿的话，读历史会自动「倒带」）；**换代**
（D155）：快照先刷成一代会折行的高行并扫位量进缓存、再刷回普通行，垫高必须由**这一代**
的高度算出来（不作废缓存则滚动高虚高 35644px）；
④ **校验窗口算得对**：
快照内容是确定的，滚到顶第一行必须是 `seq=0`、滚到底最后一行必须是 `seq=4999`，洪泛结束后
最后一行必须是最新行（贴底跟随还生效）。超预算即非零退出。D152 之后的实测：
5000 行快照 179ms / **229 个正文节点**（此前 ~10000）、挂 53~57 行；突发 20k 行 933ms /
最大延迟 **2ms**（此前 52~97ms）；事件洪泛 10ms vs 7ms；持续洪泛 20k 行/秒 × 6s
最大延迟 **6ms**、>50ms 长帧 **0 个**（此前 70~97ms / 25~26 个）、213 节点。预算里另有一条
「挂载行数 ≤ 200」——虚拟滚动失效会立刻变红。它依赖 tty 的预览夹具
（`node packages/tty/scripts/preview.mjs` 生成），夹具或 Chrome 缺失时**跳过并 exit 0**
—— 它是 npm script，不是 vitest 必跑项。


## 手工验收清单


1. **本机目标**：加一条 `kind=local` 的 `本机`，`probe` 返回 server 版本；
   容器列表与 `docker ps -a` 一致（含已停止容器）。
2. **SSH 目标**：tty 连接簿里已有条目时，用 `book` 引用它 → 容器列表 / 详情 /
   日志正常；首次连接日志里出现「已记录 host key 指纹（TOFU）」，第二次不再
   提示；手动改掉 `hostKeys` 里的指纹后重连，应**被拒绝**并给出重置指引。
3. **一键连接本机**（两处入口都要试）：
   - **没有目标时**：把目标全部删空保存（或用一个全新 profile），打开面板 → 正文空态里
     有一个「连接本机」主按钮，**下拉里不该重复列**这一项 → 点一下应当出现一条
     `kind=local` 的 `local` 并立刻选中、容器列表出来；
   - **已有别的目标时**：留着几台 SSH，打开目标下拉 → 末一项是 `＋ 连接本机`，
     **工具条上不该有**任何常驻入口 → 选中该项，应当同样加上 `local` 并切过去，
     且该项随即从下拉里消失（已经有本机目标了）。
   两处都**不该**出现「同一个入口列了两次」；全程**不该**有任何 Docker 安装 / daemon 启动 /
   context 切换动作。宿主上没有 docker 时，应当看到一句点名的原因（CLI 缺失 / 探测超时 /
   daemon 未启动 / socket 无权访问），而不是一个空列表。
   - **只有 podman 的机器**（把 PATH 里的 docker 拿掉、只留 podman）：那句话应当
     **点名 podman** 并说明「把『docker CLI』填成 podman 就能用」，同时**不该**替你
     改 `dockerBin`（回头去设置卡片看，值仍是 `docker`）。
4. **只读拦截**：两个开关都关时，`/action`、`/exec`、`/images/remove`、
   `/images/prune`、`/images/pull/stream` 全部 403；agent 侧恒注册 13 个只读工具
   （`docker_targets` / `connect_local` / `ps` / `attention` / `inspect` / `logs` /
   `logs_grep` / `stats` / `events` / `images` / `image_inspect` / `networks` / `volumes`，数量以工具表为准），
   面板的启停删 / 镜像删除 / 清理 / 拉取按钮置灰。打开「允许变更操作」后这些
   路由与工具立即出现（无需重启）。
5. **日志 / 统计 / 镜像**：`tail` 与 `timestamps` / `since` 生效；统计显示
   CPU、内存、网络与块 IO；镜像列表含 dangling 条目标记。
6. **FOLLOW 实时日志流**：日志页打开 `FOLLOW` → 状态行先「正在连接」后
   「实时跟随中」，`docker logs -f` 的新行即时出现（`docker run --rm alpine sh
   -c 'i=0; while :; do echo line-$i; i=$((i+1)); sleep 1; done'` 可观察）；
   高吞吐护栏：换成长行快速打印（如 `head -c 2000 /dev/zero | tr "\\0" x; echo` 循环）
   页面应保持可交互、内存平稳，行数 / 字节超限时出现「已丢弃最早内容」提示；
   开 FOLLOW 时 `AUTO REFRESH` 置灰、轮询停止；向上滚动出现「回到底部」、
   点击回到底部并恢复自动贴底；关闭 FOLLOW 立即回到快照。停掉容器 → 流收到
   `end` 提示「容器已退出（退出码 N）」并自动补一次快照。杀掉 `dsh web` 再拉起
   （或热改插件配置）→ 状态行短暂「正在重连」后自愈，不弹错误横幅。SSH 目标
   同样跑一遍，确认流跑着时同一主机的 `docker ps` 面板操作不受影响（连接复用），
   且空闲回收（120s）不会掐断流。
7. **统计实时跟随**：统计页打开 `FOLLOW` →「正在连接统计流…」→「实时跟随中
   （docker stats）」，CPU / 内存 sparkline 每秒长一点（跑 `docker run --rm
   alpine sh -c 'while :; do :; done'` 观察 CPU 起来）；关 FOLLOW 立即回快照并
   恢复轮询。停掉被统计的容器 → 流收到 `end`（stats-exit）提示后自动回轮询。
   注意**这条流不会自然结束**：切页 / 关面板必须断掉 `EventSource`（宿主侧应
   看到 `docker stats` 被 SIGTERM）。
8. **镜像详情 / 删除 / 清理**：镜像页点某行「详情」→ 概览里的层数与
   `docker image inspect` 一致、构建历史与 `docker history` 一致（Docker ≥ 26
   走 `--format`，老版本走纯文本表格兜底）；dangling 行用镜像 ID 查。点「删除」→
   二次确认后执行 `docker image rm`；删除被容器引用的镜像应失败并给出提示。
   「清理 dangling」只删无标签镜像，输出末尾带 `Total reclaimed space`。
9. **拉取进度流**：镜像页工具条的拉取图标（悬停显示「拉取镜像」）→ 输入本地没有的小镜像（如 `alpine:3.20`）
   → 逐层状态行实时出现且按层原地更新；完成后提示「拉取完成」并自动刷新列表。
   拉取中点「停止」或离开视图 → `docker pull` 被 SIGTERM 结束，不残留进程。
   未开启「允许变更操作」时该按钮置灰、直接访问 `/images/pull/stream` 返回 403。
10. **Compose 项目视图**：用一份 compose 起两三个服务（`docker compose up -d`）→
   工具条切到「Compose」→ 服务归到一个项目卡片下，运行数 / 服务数 / 状态正确；
   点进项目看服务表，切「聚合日志」→ 各服务日志按 `[service]` 前缀混流出现
   （`docker compose logs -f` 的等价物），过滤框可按服务名与内容过滤；关「自动
   滚动」后新日志继续进缓冲但视图不跳。无 compose 标签的容器归入
   「（非 compose 容器）」。
11. **`allowMutations` 打开后**：stop / start / restart 成功；对运行中容器
    remove 报错并附「先停止再删除」提示，先 stop 再 remove 成功。
12. **`allowExec` 打开后**：`ls -la /app` 之类命令返回 stdout 与退出码；把命令
    换成 `sleep 60`（`timeoutSec` 调小）应被中断并报超时；`command` 超过 8000
    字符被拒绝。
13. **exec 抽屉与正文共存**（tty ≥ 0.15）：卡片「终端」开抽屉后切到日志 / 统计 /
   另一台容器的详情，抽屉与终端会话都必须活着；**折叠**（箭头或双击顶边）把抽屉
   压成一条标题栏、会话继续跑（展开即回原样）；**拖拽顶边**能调高度且不超过面板
   的 75%；此时点 backdrop 空白处或面板 ✕ 应弹「结束容器终端会话」确认，取消后
   会话仍在，确认才结束（tty 侧收到 kill）。
   离线回归：`node packages/tty/scripts/preview.mjs docker-exec-logs`
   （无头 Chrome 跑真实客户端：抽屉 + 日志页 + 折叠展开，断言会话未被结束）。
14. **从连接栏进容器面板（dock 模式，需 tty ≥ 0.16）**：tty 面板里开一个 SSH 标签 →
   连接栏「容器」→ 容器面板应挂在**终端右侧**（不是全屏弹窗），终端仍可输入；
   拖左边缘可调宽（上限面板宽 72%）、标题栏箭头折叠成窄条（终端拿回全部宽度、
   容器面板不卸载）、✕ 收起面板且 SSH 标签不受影响；此时点卡片「终端」应在同一
   终端面板**新开一个 `<容器> · exec` 标签**，而不是再嵌一个终端抽屉。
   离线回归：`node packages/tty/scripts/preview.mjs docker-dock`
   （断言 docked / 无 backdrop / 折叠后终端变宽 / 容器面板存活）。
15. **多选聚合日志**：容器列表点 `聚合选择` → 卡片左侧出现勾选框、卡片动作条收起；
   勾 2~3 个容器 → 操作条显示「已选 3 个容器」，点 `聚合日志` → 聚合视图标题为
   「聚合日志 · 3 个容器」，三条流按 `[service]` / 容器名前缀混流出现；只勾 1 个时
   按钮置灰并提示「至少选择 2 个容器」，勾到 9 个时置灰并提示最多 8 个；列表里
   停掉其中一个容器 → 该条流走原有 `end` 语义结束，其余流不受影响。
16. **Esc 退出选择态**：选择态下按 Esc → 回到普通列表、勾选清空、动作条消失；
   再点一次 `聚合选择`（此时标签是 `退出选择`）效果相同；切目标 / 切分段 / 关面板
   也都会把选择态和勾选一起清掉。
17. **事件活动条**：容器列表头部出现「活动」条，状态点先黄后绿、文案「实时接收中
   （docker events）」；执行 `docker restart <容器>` / `docker stop`+`start` → 1 秒内
   列表状态跟着变，活动条出现 `stop` / `start`（异常退出显示 `die(137)` 这种带码
   形式）；点标题可折叠（事件流不中断，展开后仍是累积的最新 8 条）；
   `docker exec` 连续几次**不产生任何事件**（`exec_*` 已被服务端白名单丢掉）；
   断网 / 重启 `dsh web` 后恢复时状态点短暂黄色并自动补一次全量列表刷新。
   **不得出现假绿**（2026-10-11 现场）：把某个目标的 SSH 地址改成黑洞地址（或在目标
   不可达时打开面板）→ 状态点必须是**黄色**的「正在连接事件流…」，只有宿主确认
   `docker events` 起来（`ready` 帧）才转绿；连不上时最终落到红色的「事件流已断开」+
   「重连」按钮。日志 / 统计 / 拉取三条流同理（建连期间各自停在「正在连接…」，不会
   先说「实时跟随中 / 实时接收中 / 正在拉取」）。
   另有一条**不许卡死**：宿主半体仍是旧代码（例如宿主进程还没重启、`/config` 里没有
   `streamProtocol`）而浏览器已加载新 `client.js` 时，活动条必须退回旧判据并点亮——
   不能永远停在「正在连接事件流…」。
18. **网络 / 卷**：工具条分段出现「网络」「卷」。网络列表应含 `bridge` / `host` / `none`
   与 compose 创建的项目网络；点某条进详情 → 概览里子网 / 网关与 `docker network
   inspect` 一致、`internal` 网络带徽标，「接入的容器」页签列出容器名与 IPv4。
   卷列表的挂载点与 `docker volume ls` 一致（超长路径省略、悬停看全量）。
   未开「允许变更操作」时两个 prune 图标与详情里的删除键都是灰的；打开后：
   删除一个没有容器接入的网络成功、删一个还在用的网络报错并给出提示；
   卷清理会弹带「数据会一起删除」的确认框。**注意**：卷清理在 docker < 23 上会连
   命名卷一起删，先在测试目标上确认为妙。

19. **多目标总览**：配两个以上目标（本机 + 一台 SSH）→ 目标选择器旁出现 `总览` pill，
   点进去一屏出现两张计数卡（各带「本机」/「SSH」徽标）与异常区；卡片数字与该目标
   容器列表的口径一致。把其中一个目标的 SSH 地址改错（或停掉远端 docker）再刷新 →
   只有那张卡描红、顶部出现「1 个目标不可达」，另一张卡照常显示结果，**页面不会**
   等 SSH 超时才出内容（渐进落地）。点异常行 → 落到那台主机上该容器的详情，返回后是
   **该目标**的容器列表而不是总览；点计数卡 → 该目标的容器列表。全部正常时异常区显示
   「一切正常」；还有目标没答完时显示「读取中…」。打开「自动刷新」→ 按
   `pollIntervalSec` 轮询全部目标（关掉即停）。
20. **切目标不串台（列表写入闸）**：让 目标1（不可达的 SSH）先失败出「操作失败」横幅，
   随即切到正常的目标2 → 横幅应**随切换立即消失**、列表是 目标2 的容器；再等 20s
   让 目标1 的超时响应**在其之后**才回来 → 横幅不得重新出现、列表也不得被换成
   目标1 的容器。从总览点 目标1 那张红色计数卡进去，同样不该看到上一个目标的失败。
   反向验证：切到目标2 后立刻切回目标1（它仍然连不上）→ 横幅应写的是目标1 自己的
   失败，而不是把目标2 的成功结果当成了目标1 的。
21. **`docker_logs_grep` 服务端检索**（2026-10-09 真机实测的口径）：起一个日志内容已知的容器
   （用本地已有镜像即可，不必联网）：
   `docker run -d --rm --name dsh-grep-probe <本地镜像> sh -c 'echo "[boot] starting"; for i in 1 2 3 4 5; do echo "tick $i ok"; done; echo "FATAL request-id=REQ-7788"; echo "WARN disk 91%" >&2; sleep 3600'`
   然后在会话里让 agent 用 `docker_logs_grep` 检索它，**逐项看原始返回值**（别接受转述）：
   - 找 `FATAL` → 命中 1 行、「扫描 8 行」、命中行标 `>` 且带 ±2 行上下文；
   - `tick [0-9]+` **不传** `regexp` → 0 命中；传 `regexp=true` → 5 命中（证明默认是**字面**匹配）；
   - `fatal` 不传 `ignoreCase` → 0；传 `ignoreCase=true` → 1；
   - `tick` + `limit=1` → 「命中 5 行」但只返回 1 组窗口，并出现「命中超过上限」提示（`limited`）；
   - `since=1h` 命中 / `until=1h` 与 `since=1s` 各 0 命中**且「扫描 0 行」**（证明 `--since`/`--until` 真透传）；
   - 找 `WARN` → 命中行的 stream 是 `[err]`；
   - 检索不存在的容器 → 报 docker 原文错误，**不是**空结果。
   `truncated` 只能用 **>8MB** 日志逼出来（扫描侧 8MB 硬下限，调小「输出上限（KB）」没用）：
   让容器打 ~30 万行、探针分别写在**最开头**与**最末尾** → 全量扫时前者 0 命中 + 「扫描输出超过
   字节上限」提示，后者命中 + 同一提示；加 `tail=5000` 后两者都不再出现该提示（证明它报的是
   扫描侧**真溢出**，不是「日志大就恒 true」）。另外**返回的每一行都必须是完整行**（带时间戳
   前缀）：字节闸的切口会切在行中间，`lineAlign` 负责丢掉那个半行（见 ROADMAP 的真机验收补正）
   —— 看到 `g line 174798` 这种没时间戳的碎片，就是这条回归了。

