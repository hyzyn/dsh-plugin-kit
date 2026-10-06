# @hyzyn/dsh-docker 路线图（待办）

> **本文只放「还没做的事」；「已经发生的事」在 [DEFECTS.md](./DEFECTS.md)。**
> 已完成的待办就地打勾并回填「落点 + 门槛」（保留在列表里，便于追溯当初的验收口径）。
> 从 DEFECTS.md 的「待办 / 路线图」一节原样拆出（2026-09-25），**没有删减任何一条**。
> 缺陷仍按 `Dxx` 编号记在 DEFECTS.md 的索引表里；本文每一项在动手前先转成可验收条目
> （做完回填「落点 + 门槛」），不要只停留在规划里。

## 待办（3 项，其中 1 项已完成）

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
- **跨目标聚合的取消语义** —— 45s 超时只 `race`，不 abort 底层命令（超时的目标仍在后台跑完）。
  要么把 AbortSignal 串下去，要么在文案里说明。

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

## 已上提到项目级（不在本文展开）

跳板机（ProxyJump）· 统一安全围栏（对齐 tty / dsh-mcp）· 变更端点的信任模型（一次性 token）·
`isConcurrencySafe` 未声明 · 面板端 i18n —— 见 [项目级 ROADMAP.md](../../ROADMAP.md)。

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
