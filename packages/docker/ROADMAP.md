# @hyzyn/dsh-docker 路线图（待办）

> **本文只放「还没做的事」；「已经发生的事」在 [DEFECTS.md](./DEFECTS.md)。**
> 已完成的待办就地打勾并回填「落点 + 门槛」（保留在列表里，便于追溯当初的验收口径）。
> 从 DEFECTS.md 的「待办 / 路线图」一节原样拆出（2026-09-25），**没有删减任何一条**。
> 缺陷仍按 `Dxx` 编号记在 DEFECTS.md 的索引表里；本文每一项在动手前先转成可验收条目
> （做完回填「落点 + 门槛」），不要只停留在规划里。

## 待办（3 项，其中 2 项已完成）

> 下面都是**规划**，不是缺陷：单人项目不另开 Issue，待办记在这里，做完打勾。
> 新发现的缺陷接着编号记进 [DEFECTS.md](./DEFECTS.md) 的索引表（加一行），不在本文展开。
>
> **2026-09-25 分档**：原有 8 项里 5 项**要同时改 ≥2 个包**（跳板机、统一安全围栏、变更端点的信任模型、
> `isConcurrencySafe`、面板端 i18n），已按 [docs/conventions.md 的边界判据](../../docs/conventions.md#l0--l1-的边界判据)
> 上提到项目级 [ROADMAP.md](../../ROADMAP.md)，**原文在那里逐字保留**。本文只留「改 docker 一个包就能做完」的 3 项。

- **agent 侧的网络 / 卷变更工具** —— 面板有 `networks/remove|prune`、`volumes/remove|prune` 的按钮，
  agent 侧一个都没有（当前是有意为之：这类删除最容易误伤）。若要做，必须与面板**同一把** `allowMutations`
  闸门 + 破坏性后果复述。
- [x] **日志真虚拟滚动** —— **2026-09-29 完成（D152）**。落点：`client-src/log-window.js`（实测行高
  缓存 + 前缀和 + 窗口定位 + 锚点修正的纯逻辑）、`client-src/index.js` 的 `useLogRows`（两个日志视图
  共用，量高 / 锚点修正 / 贴底钉住都在绘制前的 layout effect 里一次做完）、`.dk_logPad` 上下垫高。
  门槛（`scripts/log-perf.mjs`，改前 → 改后实测）：持续洪泛 20k 行/秒 × 6s 最大延迟 70~97ms →
  **6ms**、>50ms 长帧 25~26 → **0**、正文 DOM 节点 ~10000 → **213**；突发 20k 行最大延迟 52~97ms →
  **2ms**；新增两条**正确性**断言（滚到顶第一行必须是 `seq=0`、滚到底最后一行必须是 `seq=4999`、
  洪泛结束后最后一行必须是最新行）。约束（都守住了）：`content-visibility` 不开（D91）、虚拟化用
  **实测**行高缓存撑垫高、右键「问 Agent」的前后 20 行上下文由 `overscan ≥ 20` 保住（有断言）、
  导出走数据层不受影响。细节与取舍见 [DEFECTS.md](./DEFECTS.md) 的 D152。
- [x] **跨目标聚合的取消语义** —— **2026-10-06 完成（D161）**。原先 45s 超时只
  `Promise.race`、不取消底层命令：外层拿到 `ok:false` 时那条 SSH channel 还在跑，仍占着
  `MaxSessions` 的会话槽（sshd 在子进程活着时不释放，见 D150），于是这台慢机器上的后续
  短命令被远端拒绝。落点：`src/docker.ts` 的 `Runner.run` 新增**可选** `signal` +
  `createRunner()` 的 local / ssh **两个分支都透传**；`src/ssh-exec.ts` 的 `ExecOptions.signal`
  与 `RemoteExec.run` / `runLocal` 的 abort 收尾（各自**并入已有的那一条**收尾路径——SSH 是
  `signal('KILL')` + `close()` + `finish(null)`，本地是 `SIGKILL` + 复用 D159 的 `KILL_GRACE_MS`
  收敛期）；`src/index.ts` 的 `aggregateAcrossTargets`（AbortController 建在 `run()` 之前、
  超时先 `abort()` 再 `reject`、`finally` 兜底 `abort()`）。
  预算取舍：**内层每命令超时是唯一真相源，外层只做兜底**（`attention` 最坏 = 1 条 ps +
  最多 9 批 inspect，10 × 30s ≈ 300s，按「大于单目标最坏序列」设会把总览拖到五分钟），
  外层取 3 × 单条预算 = 90s，
  `DSH_DOCKER_AGG_TIMEOUT_MS` 可覆盖（仅测试 / 排障）。返回契约不变：超时只污染自己那一格。
  门槛：`test/aggregate-cancel.test.ts` **16 条**（假 channel / 假 ChildProcess / 假宿主三套桩）——
  **判据是「abort 后底层真的收到取消」而不是「返回了 ok:false」**：SSH 断言 `channel.signal('KILL')`
  与 `close()` 被调用、`inflight` 归零、闸门名额归还；本地断言子进程 `kill('SIGKILL')`、
  D159 收敛期仍在 500ms 内落定、已 abort 不再 spawn；端到端断言超时那一格被 SIGKILL 而
  正常那格不被杀。
  **判别性已实测**：去掉超时分支的 `controller.abort()` → 3 条红；摘掉 `createRunner` 的
  signal 透传 → 5 条红。
  > ⚠️ **与 `feat/dev-data-suite` 分支有重叠**：那份 `src/index.ts` 改的是同一片区域
  > （它那边 `AGG_TIMEOUT_MS` 在约 1010 行、`aggregateAcrossTargets` 在约 1037 行），且两边
  > 已双向分叉——将来合并大概率要在这里解冲突，别再把它当回归查。

**2026-09-25 追加**：能力开关的信任模型按项目级 ROADMAP 第 5.1 节落地——`allowMutations` /
`allowExec` 的**提权只认宿主侧环境变量**（启动时采样一次），HTTP 只能关不能开；未授权时卡片里
那两个开关点不动 + 附一行说明。落点：`normalizeConfig` 折叠出有效值（二十多处使用点一处都不用
改）、`/config` 写盘前 400、快照新增 `allowMutationsGranted` / `allowExecGranted`。

**2026-10-05 追加**（用户反馈「直接连接本机不方便」）——**一键连接本机**，已落地：
**只在「还没有配置 Docker 目标」的空态**里一个**连接本机**按钮，agent 侧同一条操作是
`docker_connect_local`。落点：宿主 `connectLocal()`（面板按钮 / `POST /connect-local` /
工具三条入口共用同一份实现）、纯函数 `nextLocalTargetName` / `findLocalTargetName` /
`describeLocalProbeFailure`、客户端 `api.connectLocal` + 空态按钮节点、宿主
`/connect-local` 路由（写路径，受同源证明）。
门槛：`test/connect-local.test.ts` 23 条（命名确定性 / 复用不重复创建 / SSH 与自定义目标原样保留 /
空 `targets` 无隐式默认目标 / 设置不可用 503、保存失败 500 且**不改内存配置** / 连点与并发幂等 /
daemon 未启动与 CLI 缺失的成因文案 / 工具-路由同一实现）、`scripts/route-smoke.mjs` 四个端到端用例、
`scripts/client-smoke.mjs` 三条（**已配目标时工具条不得出现**（反向判据）、HTTP 接线、空态里可点）。

**同日回修 ①（用户看着截图说「这个连接本机有点多余」）**：第一版把按钮**常驻在工具条**
（目标选择器右侧），并且在没有本机目标时用强调色渲染——已有 `目标2 · root@…` 这类可用目标时，
它既占掉选择器右边最值钱的位置，又一直喊人点，属于纯噪音。而且**当时的用例把它钉死了**
（`client-smoke` 断言「工具条里应恰有一个连接本机入口」）——错的不是漏测，是测了错的行为。
改法：工具条**不挂**该按钮，只在 `target === ''` 的空态渲染；随之删掉 `data-fresh` 强调样式、
i18n 死键 `btn.connectLocalCurrent` 与客户端那份 `localTargetName`（复用判定本就只属于宿主的写路径）。
断言方向反过来：**有目标时必须不出现**。

**同日回修 ②（用户接着问「现在我怎么看到本机的容器」）**：回修 ① **改过头了**——撤掉工具条入口后，
「手上几台 SSH、想再加一台本机」这种常见情况就只剩「开设置卡片手配」，正好退回这次改动原本要
消灭的那条路（用户最初的原话就是「直接连接本机还不是很方便」）。空态那个入口只覆盖「一个目标
都没有」，覆盖不到这一种。现在补**第二个非常驻入口**：目标下拉的**末一项** `+ 连接本机`——
入口放在「用户找机器」的地方，点开下拉才出现，不占任何常驻位置。两处**互斥**（没有目标时走
空态那个大按钮，下拉里不再重复列），**已有本机目标时两处都不出现**。

门槛（回修 ②）：`shouldOfferConnectLocal(targets)` 抽成**纯函数**再驱动——离线冒烟的 React 桩把
`useState` 冻在初值上（组件里 `targets` 恒为 `[]`），遍历渲染树根本走不到那一项；这也是这一版
先把判定抽出来的原因。哨兵值用 **NUL 前缀**（`'\0connect-local'`）：目标名是用户自由填的，
普通字符串哨兵可能与真实目标重名——那样点「连接本机」会切到**别的机器**。用例另有一条源码级
判据钉住「哨兵分支必须排在 `setTarget(event.target.value)` **之前**」，否则当前目标会被换成一个
不存在的名字。真机复验（隔离宿主 + 真 Chrome）：3 台 SSH 时下拉末项为 `+ 连接本机`，选中后
变成 `local · 本机` 且该项消失。
边界（刻意不做，已写进 README）：不改空 `targets` / `clearTargets` 的既有语义、不凭空造隐式默认
目标、不自动装 Docker / 起 daemon / 切 docker context / 改环境变量、**不放开任何能力授权**
（只写插件自己的配置 + 只读探测）。

**同日回修 ③（用户对着「docker CLI = docker」那张截图问「是否需要先检测本机是否有 docker
或者 pdman」）**：探测本来就有，但有两处把话说死/说空，记在 [DEFECTS.md](./DEFECTS.md) 的 D159：
① `probe()` 不认超时——`docker version` 挂住时 `code` 是 `null`，兜底文案「退出码 null」零信息量，
而超时（daemon 卡死 / `docker context` 指向连不上的远端）与「daemon 没起」的可修动作完全不同；
② 探测只认 `dockerBin` 一个二进制，只有 podman 的机器上收到的是「请先安装 Docker」。
改法：超时单独一档（`ProbeResult.timedOut` + 一句可执行的话）；`PATH` 里只读地找候选 CLI
（`docker` → `podman` → `nerdctl`）并**点名**它，但**绝不替用户改写 `dockerBin`**——静默改配置
违背本插件「不替用户决定」的一贯取向，且 podman 与本插件输出格式的兼容性未逐项验证。
超时还顺带修了实测出来的放大器：只杀直接子进程时，包装脚本的孙进程握着管道会把 15s 上限
拖成分钟级（真机 3s→60.3s）。

门槛（回修 ③）：`isLocalCliMissing` 当**单一来源**（文案分档与「要不要找候选」共用，两处各写
一遍正则会漂移）；候选比对按 **basename**——按原字符串比会在 `dockerBin=/usr/local/bin/docker`
时给出「把 docker 改成 docker」的废话（这条已被用例钉住，且实测判别性）；「只在 CLI 缺失那档
才 accessSync」（其余档位纯文本判断，不必白跑文件系统）。用例用临时目录造**隔离 PATH + 可执行
位**，不依赖跑测试的机器恰好装了什么。路由级用例断言 `dockerBin` **未被改写**。
**判别性已实测**：移除 `probe()` 的超时分支 → `streams.test.ts` 对应断言失败；把 basename 退回
原字符串比对 → `connect-local.test.ts` 那条失败；断开 `localProbeReason` 的候选接线 → 路由级
那条失败（旧代码报的是「找不到 docker CLI」而拿不到「装了 podman」）。

**同日回修 ④（用户看着「活动 · 事件流已断开」的截图问「刷新无法重连断开的事件流吗」）**：
答对了，⟳ **救不活**。事件流进 `closed` 是终止态（`docker events` 退出 / 服务端发 `end` 都会
`close()`），而 `refresh()` 只刷列表 + 自增 `refreshToken`——那个令牌根本没进事件流 effect 的依赖
（`[active, view, target]`），它只被详情抽屉的三个 effect 消费。所以当时只有刷新整个页面或切页 /
切目标能恢复。记在 [DEFECTS.md](./DEFECTS.md) 的 D160。改法：新增自增的重连令牌并进依赖；
活动条断开时给一个 **重连** 按钮（`closed` 才有；`unsupported` 不给——重连必然再失败）；⟳ 走
新的 `refreshManually()`（刷列表 + 重连），而 **AUTO REFRESH 轮询仍只调 `refresh()`**——塞进轮询
会让终止态被不断重开，既掩盖「它断了」又白建 SSE。

门槛（回修 ④）：`canReconnectEvents` 抽**纯函数**（离线冒烟的 React 桩把 `useState` 冻在初值，
组件里 `eventsStatus` 恒为 `''`，判定必须能直接驱动）；重连按钮必须是折叠头的**兄弟**——那层
已经是 `<button>`，按钮里嵌按钮既非法 HTML 也让读屏把「折叠」「重连」听成一个动作（用例同时
断言「不在折叠头的 children 里」）；补偿判据是 `opened || manualReconnect`，只按 `opened` 会漏掉
「daemon 全程没起、流从未 open 过」——那时重连成功却不刷列表，活动条绿了而列表还停在错误态。
**判别性已实测**：移除依赖里的令牌 / 把重连按钮挪进折叠头 / 退回只按 `opened` 判，三条用例分别红。

## 已完成（落点 + 门槛）

### ✅ 就地提权：两个能力一次粘贴全部解锁（2026-10-07 完成）

**现场**：就地提权是**逐能力**的（`allowMutations` / `allowExec` 各有自己的 challenge），而客户端的
`elevation` 是**单槽** state（`setElevation({ capability })`）——面板开着时再点另一个开关，前一个
能力的面板被**替换**、它的命令从界面消失（宿主侧 challenge 仍在 pending，`begin` 幂等、不耗额度）。
2026-09-26 的设置卡片截图实测：两次授权时刻差 14 秒，用户必须在宿主终端**粘贴两次**。纯客户端
可解的高频摩擦点。

**落点**：新增 `client-src/elevation.js`（纯逻辑：逐能力记录的增改 / 留痕 / 收尾，取哪几条命令、
按什么顺序、怎么连接）；`client-src/index.js` 的 `elevation` 单槽 → **逐能力数组**（按发起顺序），
`elevationPanelsView`（factory 级**纯渲染函数**，入参是纯数据 + 回调，与 `overviewBody` 同形）
渲染纵向堆叠的多块面板，组顶部在「≥2 个能力拿到过命令且有可复制命令」时出一个「复制全部（N 条）」；
轮询 effect 从单能力改为**轮询全部 pending 能力**（某个 granted → 走既有 `finishElevation(cap)`，
该块面板消失）；`copied` 反馈逐能力隔离（合并按钮用 `'__all__'` 哨兵键）；`docker.css` 加
`dk_elevPanels` / `dk_elevMerge` 两条最小间距规则；i18n 新增 `elev.copyAll` / `elev.copyAllHint` /
`elev.copyAllCopied`（zh + en 齐平）。

**合并命令的连接方式是换行符，刻意不用 `&&` / `;`**：bash / zsh / PowerShell / cmd 粘贴多行都
逐行执行，平台无关；`&&` 在 PowerShell 5.1 上不认、`;` 在 cmd 上不认。文案只说「执行后全部开关
自动解锁」，**不承诺同一时刻**——两个 challenge 的 TTL 与探测周期各自独立，倒计时仍逐面板显示。

**已授权的那条记录只「留痕」不立刻删**：合并按钮的存续跟着「这一组里点过几个能力」，不是跟着
「当前还有几条命令」——两个都点过、其中一个先解锁是常态，此时按钮要留着把**剩下那条**交给用户；
全都解锁后留痕由 `pruneElevationRecords` 收掉、按钮自然消失；只点过一个时压根不出按钮（那条命令
就在自己的面板里）。过期的命令从合并里剔掉（复制过去只会让宿主落一个过期后才出现的文件）。

**边界（明确不做）**：不改 kit、不改 `/elevate` 任何路由与响应形状、不碰 nonce / 日志 / 限流语义
（`begin` 幂等、`status` 不回 nonce、TTL 与每小时 3 次全原样）；不做跨插件合并（docker 与 tty 的
challenge 在不同插件进程）；「重新生成」仍逐能力。「kit 侧 `begin` 返回合并命令」这条备选**已否**：
`finishElevation` 只处理被轮询到的那个能力，另一个会停在「宿主已授权、配置开关没开」的半状态，
还要处理两条独立探测定时器的授权竞态——客户端合并零 API 变更、零新安全面。

**门槛**：`test/elevation.test.ts` 27 条（增改不替换 / 原地替换不重排 / 留痕与收尾 / 发起顺序不是
字典序 / 过期与边界 / 换行连接逐字节且不含 `&&` 与 `;` / 按钮出与不出的六种组合 / 参与计数口径）；
`scripts/client-smoke.mjs` 新增 7 条**渲染树级**用例（两个 pending → 驱动合并按钮的 onClick，
断言交下去的字符串逐字节等于两条命令的换行连接、顺序 = 发起顺序、反馈键与单条隔离；单个 pending
无按钮；一个 granted 后按钮只剩一条且已授权的面板消失、全部 granted 后整组清空；过期的不进合并；
✕ 只关一个；一条出错 / 在途不影响另一条；i18n 双份 + 产物钩子）。
**判别性已实测**（三条反证各自红）：把连接符换成 `&&` → 冒烟 1 条 + 单测 3 条红；把按钮门槛从
「≥2 个拿到过命令」放宽到 ≥1 → 冒烟 3 条红；让已授权的留痕不参与计数 → 冒烟 2 条红。

### ✅ 能力使用审计（capability-use）：把「授权了」和「用了」接成闭环（2026-10-07 完成）

**落点**：新增 `src/audit.ts`（行格式 + `sanitizeAuditValue` 的统一 200 截断与控制字符转义 +
`audited` 的计时包装；文件头写明**晋升条件**：当第二个插件（tty）也需要使用审计时才上提
`@hyzyn/dsh-kit`——按 conventions 的 L0/L1 边界判据，现在只有一个包需要，不提前抽象）。
`src/index.ts` 接线：八条变更 / exec 路由（`/action`、`/images/remove|prune`、
`/networks/remove|prune`、`/volumes/remove|prune`、`/exec`）在 403 判定之后包
`audited(logger, …, () => api.xxx(...))`（成功与失败都记、失败原样 rethrow，不改既有错误处理）；
`/images/pull/stream` 在 run 里记 `event=start` / `event=end` 两行（宿主中途挂掉时至少 start
还在；被中止时 runner 以 code=null 落定，end 省略 code）；agent 工具 `docker_action` /
`docker_image_remove` / `docker_image_prune` / `docker_image_pull` / `docker_exec` 在 api 调用处
包 `audited(..., source='tool')`——它们走 DockerApi 不经 HTTP 路由，两条入口不重复计数。
语义（单一）：**使用 = 过了闸**——403 与参数校验 400 不记、tier-gate 的 ask / deny 不记
（宿主 approval 日志已覆盖）、docker 报错也算一次使用（`ok=false` + `detail=` 截断后的错误
文案）。exec 的命令随行进日志（`detail=code=… cmd=…`），这是写进 README 已知限制的代价；
截断与转义只在 helper 一处发生，不靠调用点自觉。

**门槛**：`test/capability-audit.test.ts` 26 条——helper 单测（200 截断带 `…` 信号、控制字符
转义保证一行就是一次事件、缺 ref 字段省略、`audited` 成功/失败两路与原样 rethrow）；逐操作
断言（每条路由 / 工具**恰好一行**、`capability/source/action/target/ref/ok` 逐字段对上、pull 流
start+end 两行、只读路由与 `/connect-local` 零行、403 零行）；失败路径（`ok=false` + detail
截断、错误按原路径返回不吞）；`scripts/route-smoke.mjs` 新增 5 个端到端用例（八条路由逐字段、
pull 流两行、只读与 connect-local 零行、工具 `source=tool`、403 不记且开关恢复后照旧）。

**真机验收（2026-10-07，真宿主 + 真 Chrome + 真 docker）**：隔离一次性 profile 驱动设置卡片，
撤销 → 提权 → 真实 exec 走 `audited()` 路径全通；顺带挖出 **D162**（出口走了 `ctx.logger`，
真宿主上无处可查）——出口已改 `console.log`，测试与冒烟的断言面随之改为 console 捕获（捕到的
就是真宿主 stdout 上会出现的字节）。kit elevation 授权行的同一问题记在根 ROADMAP 待办 11。

### ✅ 长流被中止后 `busy` 账不平 + 拒绝原因被客户端丢掉（2026-10-08 完成）

**现场**：用户拿着面板截图问「点击重连没反应」——248 上的活动条停在「事件流已断开」，
点那个按钮页面毫无变化。探针复现：`GET /events/stream?target=248` 连续 12 次都回同一句
`已有 8 条实时流（上限 8）…`，跨 15 分钟一字不差；而同一时刻浏览器到宿主只握着 4~5 条
TCP（真有 8 条流在推的话不该是这个数）。对照组：切到没被面板占用的 目标2，同样的实验
一次连开 8 条成功、8 条退出后再连仍是 8 条成功——**配额逻辑本身会正常释放**。

**根因（两件事叠在一起，记在 [DEFECTS.md](./DEFECTS.md) 的 D164）**：
① `RemoteExec.stream()` 的 `onAbort` 只做 `signal('KILL') + channel.close()` 就**等远端回话**。
部分 sshd 会拒绝那个 KILL（D150 实测原文），通道也可能静默（既不 `emit('close')` 也不
`emit('error')`）——于是 Promise 永不落定、`finally` 里的 `release()` 永不执行、`busy` **永久
+1**。累积 8 次之后该目标的每条长流都被 `streamBudgetError` 拒绝，且没有任何自愈路径
（`openChannel` 的重建分支只在**开通道被远端拒绝**时触发，而这一层拒绝发生在开门之前）。
这是 D112（`run()` 超时）与 D161（`run()` 的 abort）**同一个坑的第三次出现**。
② 客户端把 `event: error` 的 `data` **整个丢掉**、只置 `closed`（统计流一直是读 message 的），
于是「被拒 → 回到原位」与「点了没反应」在界面上逐像素相同，用户只能反复点。

**落点**：`src/ssh-exec.ts`——`onAbort` 补 `finish(null)`（当场 settle，幂等靠已有的 `settled`
守卫），数据回调各加 `if (settled) return`（收尾后的分片不再投递）。`client-src/index.js`
——新增纯函数 `eventsErrorMessage()`，`onError` 把服务端那句话写进新的 `eventsRefused`
state，活动条据此显示「上次重连被拒绝：<原文>」（i18n `hint.eventsReconnectRefused`，zh/en
各一份），重连成功 / 重新建流时清空。

**门槛**：`test/logs-stream.test.ts` 新增 3 条（远端不确认时 `busy` 归零且 Promise 落定 /
累积 8 次后第 9 条仍被放行 / 收尾后的分片不投递），`scripts/client-smoke.mjs` 新增 2 条
（`errorMessage` 的六种输入语义 + 接线判据）。**判别性已实测**：退回 `onAbort`（去掉
`finish(null)`）→ 单测 3 条红，其中两条挂满 20s 超时正是「Promise 永不落定」的现场；
退回客户端（`setEventsRefused` 不接）→ 冒烟 1 条红（91/92）。
**顺带实测的负结论**（免得后人重做）：`StringDecoder.end()` 之后再 `write` 不抛、只返回空串，
所以那两个 `settled` 守卫是**防重复投递**，不是防崩溃。

**真机验收（2026-10-08，test profile 宿主 + 真 Chrome + 真实 SSH 目标）**：
`test` profile 本就以 `link:` 指向本仓（`dsh plugin --profile test add link:<仓>/packages/docker`），
产物与仓库逐字节一致，所以**无需另装**——起宿主即加载修复版：

- **宿主侧（配额真的会回收）**：对 248 连开 10 条 → 恰好 8 条被接受、2 条被拒（上限仍然生效）；
  被 `--max-time` 掐断（= 模拟远端不确认关通道）后**再开一轮仍是 8 条被接受**；连做 3 轮、
  累计 24 次 abort 之后**仍然稳定 8/8**。修前第二轮就会被自己的账钉死在 8/8。
  短命令（`POST /containers`）全程正常，配额不误伤。
- **浏览器侧（拒绝原因真的显示出来了）**：把 248 打满后，在真 Chrome 里打开面板并触发重连，
  活动条文案为「事件流断开后不会自己回来（EventSource 只在连接层抖动时自愈）——**上次重连
  被拒绝：root@hosths-test-248 上已有 8 条实时流（上限 8）…请关掉部分实时跟随、把聚合容器数
  减到 6 个以内，或稍后重试。**」并保留「重连」按钮。修前这里只有「事件流已断开」，点按钮
  在像素上毫无变化。
- 应用壳加载：`scripts/verify-client-ui.mjs --mode boot` **6 PASS / 0 FAIL**（10 个
  `@hyzyn` bundle 全加载、0 未捕获异常、0 控制台 error、0 失败请求）。
- 清理后复核：杀掉全部占位流 → 248 **立即恢复**（新流正常连上），确认没有残留账。

> 受限环境提示：本机沙箱下 headless Chrome 会因 GPU 进程崩溃而连不上 CDP
> （`Runtime.enable 超时`），按 `scripts/verify-client-ui.mjs` 文件头加
> `--chrome-arg --no-sandbox` 即可——那是**环境限制**，不是代码问题
> （见 [agent-real-test.md § 三条硬约束 ②](../../docs/agent-real-test.md)）。

## 已上提到项目级（不在本文展开）

跳板机（ProxyJump）· 统一安全围栏（对齐 tty / dsh-mcp）· 变更端点的信任模型（一次性 token）·
`isConcurrencySafe` 未声明 · 面板端 i18n —— 见 [项目级 ROADMAP.md](../../ROADMAP.md)。

**在项目级待办（代码已落地）**：**插件工具接入会话权限档位（tier gate）**——项目级
[ROADMAP.md § 待办](../../ROADMAP.md#待办) 第 10 项（2026-10-07 立项并实施）。本包的分工：全部
agent 工具的档位分类表（`docker_action` / `docker_image_*` 归 `write`、`docker_exec` 归 `exec`）
与 `tools/pre-execute` 接线，已落在 `src/index.ts`（`DOCKER_TIER_CLASS`）；与既有 `allowMutations` /
`allowExec` 静态开关是**双层并存**（静态管注册、档位管已注册调用的放行），不是取代。决策矩阵、
真机验收 V0–V8 与开放决策 R1–R4 的决议都在
[docs/permission-tier-plan.md](../../docs/permission-tier-plan.md)，本文不复述。

**2026-09-25 更新**（三项已落地，落点与门槛见项目级 ROADMAP 的 § 已完成）：

- **统一安全围栏**：本包那份加固档（D31 / D32 / D80 / D110 / D139 的实现）**整体上提到
  `@hyzyn/dsh-kit`**，docker 改走 kit 的导出——行为一字未改（12 个既有路由 / 流用例未动一行
  即全绿），三包共用一份；DEFECTS.md 的「安全围栏」节下有落点迁移标注；
- **`isConcurrencySafe`**：11 个只读工具声明、5 个变更工具**刻意不声明**；
- **跳板机（ProxyJump / ProxyCommand）**：**已全部落地**（2026-09-25）。先把「短期一半」
  （超时 / 通道错误 / 条目缺失三处文案点出成因）补上，随后做完整实现：`readTtyBooks` 把
  `jump` 带进规格、`poolKey` 并入 `|jump:<user@host:port>`（不同跳板机到同一目标不再并成一条
  连接）、`acquire` 先拨跳板机再把 `forwardOut` 通道当 `sock`、`disposeAll` / 空闲回收 /
  传输错误重连都成对收尾。
- **`ProxyCommand`**：同样落地，但**闸门只有一处**——读 tty settings 的 `allowProxyCommand`
  （**默认关**），且**每次拨号现读**（关掉立刻生效，不留缓存）；关着时携带代理命令的目标
  明确失败（不退回直连）。本包**不新建界面**：连接簿在 tty 配一次，两个面板一起生效；
  池键并入 `|cmd:<sha256 前 12 位>`——**只并入摘要**，因为命令原文可能含凭据而池键会进诊断路径。
  方案与全部已知坑见 [docs/proxyjump-plan.md](../../docs/proxyjump-plan.md)（§6.1 闸门定案表）。
