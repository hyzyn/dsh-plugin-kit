# @hyzyn/dsh-tty 缺陷编号字典

> **这份文件是代码注释的编号字典，不是审计报告。**
>
> `src/` / `client-src/` / `test/` / `scripts/` 里有带 `Dxx` 的注释，含义是「这段代码为什么
> 长这样」，编号的出处就是本文。拿到任意一个 `Dxx`：先查 [§1 编号索引表](#1-编号索引表)
> 知道**当年坏了什么**，再查 [§2 编号字典](#2-编号字典这段代码为什么长这样) 知道**所以代码
> 为什么写成这样**。
>
> **编号是硬契约**：`D01–D61` 是 `packages/tty` 内部序列，与 `packages/docker/DEFECTS.md` 的
> `D01–D138` **不共享**；跨包引用请写「tty D12 / docker D03」。新缺陷接在 `D61` 之后，
> **不得重号、不得回收空号**——源码、测试与根 `README.md` 里已有引用指向它们。

> **本文不含**：D49–D61 的逐条 postmortem（症状 / 现场复现 / 根因 / 修法 / 回归 / 反向验证），
> 以及 0.18.3 那 48 条的完整审计原文。它们冻结在自己那一版提交里，见
> [§4 冻结记录](#4-冻结记录被移出正文的内容在哪)。

## 维护规则

1. **新缺陷只做两件事**：索引表加一行 + 在代码注释里落编号。详细的现场 / 根因 / 修法 / 反向验证
   写进 **commit message**，正文不展开。
2. **索引表超过约 80 行时**，把最老的 20 条整体移到 `DEFECTS-archive.md`。
3. 索引表**不写行号、不保留修复提交 sha**：修复后代码移了位、有的整段被删或重写，审计时点的
   行号只会误导。定位实现请用症状列的关键词 `git log -S'<关键词>'`，或读代码里的 `Dxx` 注释。
4. 阈值 / 口径 / 基线数字**只增不改**：发现过期或自相矛盾，就在原处加一行 `> ⚠️ 标注`
   说明，**不擅自"修正"**。

> ⚠️ **标注（本次未擅改）——本次改动涉及的三处：**
>
> 1. **索引表原为 57 行（D01–D57），而本文自称「已修 61」**：`D58`–`D61` 只有详情节、**没有
>    索引行**；而 `D58` / `D59` 在 4 个源码/测试文件里被引用，根 `README.md` 引用了 `D61`。
>    本次**补齐这 4 行**（症状逐字取自各自详情节，未发明缺陷）。补齐前，一旦详情节按本次
>    重构移出，这 4 个编号就会失去解析处。
> 2. **开头「共 48 条缺陷，已 48/48 修复」是 0.19.0 时点的数字**，与「已修 61」并存；
>    同段里还有「补的 D49 / D50（状态条闪动）已随 0.19.3 落地」**同一句出现两次**（复制残留）。
>    前者照录不改；后者本次只保留一处（纯重复，无信息丢失）。
> 3. **基线数字三档并存，未合并**：§3 记 `vitest 261 / 19 文件`（2026-09-23）；
>    开头「回归门槛（0.19.0 时点）」记 `193 / 15`；「2026-09-20 复核实测」记 `215 / 16`。
>    三组数字出自三个时点，**原样保留**（见 §3 的「历史基线」）。

## 现状

**已修 61 / 待修 0**，编号至 `D61`。逐条症状见 §1，设计意图见 §2，**还没做的见
[ROADMAP.md](./ROADMAP.md)**。

**沿革（原文照录，未改）**：2026-09-19 对 v0.18.3 做了一次系统性只读审计（5 路并行 + 人工复读
关键路径），共 **48 条缺陷，已 48/48 修复并随 0.19.0 发布**（CI 三平台绿）；此后由线上反馈
补的 **D49 / D50**（状态条闪动）已随 **0.19.3** 落地，2026-09-20 复核又补 **D51**（测试断言缺陷）。
**D57**（虚拟屏未捕获异常打死宿主）是 2026-09-23 由用户带着 `dsh-safe` 崩溃日志上门的线上事故，
已修在 `src/index.ts`（未发版）；它不在那次审计的范围内。审计基线：v0.18.3｜ 修复波 / 发布：
tag `v0.1.36` → tty **0.19.0**（docker 0.6.4 / all 0.1.36 / kit 0.1.30）——此后 `v0.1.37` →
0.19.1、`v0.1.38` → 0.19.2、`v0.1.39` → **0.19.3**（本仓库 `packages/tty/package.json` 现为 0.19.3）。

**已修 61 / 待修 0**（D01–D48 审计波 + D49/D50 线上反馈 + D51–D56 复核实测发现 + D57 线上崩溃 + D58–D61 后续用户上报/复核）。索引表**不写行号、也不保留修复提交
sha** —— 修复后代码移了位、有的整段被删或重写，审计时点的行号只会误导；所以回溯入口统一改成
按关键词检索（D49/D50 修在 `bd407352`）：`git log -S'<症状列的关键词>'`，提交信息按条目写
为什么。被代码直接引用的编号在
最后一列标 ✓ —— 改这些行为前先读**代码里的对应注释**（「为什么」都写在那儿：
`writableEnded` 不是 `finish`、PS0 展开在子 shell、node-pty `_deferNoArgs` 的异步抛出、
`connId:sid` 绑定键、分片 24h 阈值、`SLOT` 固定槽位……）。

D49 / D50 是 0.19.2 之后由用户截图上门的**线上反馈**（不在那次审计的范围内），同一个症状
（「状态条定期闪动」）的两个独立成因：D49 是渲染——每秒整条重建 + 值没有固定槽位，任何一位数
变化都把后面所有条目推着横移；D50 是采集——宿主某个子进程一慢，帧间隔就从 1s 拉到 4s，而前端
「3s 没新帧就整条收起」的窗口正好卡在中间，于是**整条每秒闪一下**变成**每 4 秒消失又出现**。
D50 才是用户看到的那一下（他补的描述是「整条状态条瞬间消失又出现」）；先修 D49 时没复现出
这一层，是因为 preview 夹具的假宿主固定 1s 一帧 —— 为此新增了 `stats-slow` 场景专门钉住
「宿主慢」这一档。

## 1. 编号索引表

> 只回答「当年坏了什么」。**症状列的关键词就是检索锚点**——`git log -S'<关键词>'` 能直接落到
> 修复提交。严重度（P0–P3）**已按维护规则 4 移出**：它只描述「当年多重」，不参与「这段代码为什么
> 长这样」（原始分档：P0×6、P1×18、P2×24、P3×9，可从 §4 的版本取回）。
> 排序由「按严重度分档」改为**按编号升序**——去掉严重度列后，原顺序已不携带信息，而按编号排
> 才能满足「拿到一个 `Dxx` 十秒内查到」。
>
> **最后一列 `✓` 表示「这段代码/测试里引用了该编号」，不等于「当前行为已验证」**——想了解现在的
> 行为请读 README 与代码。改这些行为前先读**代码里的对应注释**（「为什么」都写在那儿）。

| D | 症状（一句话：当年坏了什么） | 涉及文件 | 被代码引用 |
|---|---|---|---|
| D01 | SFTP 覆盖上传非原子，失败即毁原文件 | src/sftp.ts、src/index.ts | ✓ |
| D02 | 目录直传跟随符号链接 → 目录环无限递归 | src/sftp.ts |  |
| D03 | SSH 明文口令落浏览器存储 | client-src/index.js |  |
| D04 | `tty_capture{last:true}` 无在途信号 → agent 拿到上一条命令的结果 | src/index.ts |  |
| D05 | 两处截断方向相反，恰好丢最近输出 | src/index.ts |  |
| D06 | 在途 spawn 不与 WS 连接绑定 → 僵尸会话 | src/index.ts | ✓ |
| D07 | `session.clients` 只用 clientSid 做键 → 跨连接互相踩 | src/index.ts | ✓ |
| D08 | `reconnectGraceSec` 热改为 0 后老孤儿永不回收 | src/index.ts | ✓ |
| D09 | `kill` 帧缺「孤儿」前提，可杀任意活跃会话 | src/index.ts | ✓ |
| D10 | `tty_expect` 的 acc 无界增长 + 并发无上限 | src/index.ts |  |
| D11 | `spawnSsh` 的 channel Promise 无超时兜底，可永久挂起且无取消入口 | src/ssh.ts |  |
| D12 | known_hosts 导入 → 假 MITM 告警并拒绝连接 | src/known-hosts.ts、src/ssh.ts |  |
| D13 | SFTP `pipeCounted` 每搬一个文件挂一个永不摘除的 abort 监听器 | src/sftp.ts |  |
| D14 | 帧输入零校验 | src/index.ts | ✓ |
| D15 | 隧道不会收敛 | src/tunnels.ts | ✓ |
| D16 | SSH 认证与错误文案误导 | src/ssh.ts | ✓ |
| D17 | shell 集成的两处静默错误 | src/shell-integration.ts |  |
| D18 | 关活动标签可能选中嵌入式会话 → 面板空白 | client-src/index.js |  |
| D19 | `afterSocketOpen` 无并发 / 代际守卫 + `restoreTab` 不去重 | client-src/index.js |  |
| D20 | `waitFrame` 把监听挂在全局 socket 上 | client-src/index.js |  |
| D21 | 最小化终端面板会取消在途 SFTP 传输 | client-src/index.js |  |
| D22 | 状态条最小化期间不停表、`refitActiveTab` 无 minimized 守卫 | client-src/index.js |  |
| D23 | 非 secure context 下剪贴板未判空 → 局域网访问点「粘贴」直接抛错 | client-src/index.js |  |
| D24 | 键盘可达性缺口 | client-src/index.js |  |
| D25 | `sftp_remove` 对根目录 / `..` 无任何护栏 | src/sftp.ts、src/index.ts | ✓ |
| D26 | 下载不存在的路径 / 把目录当文件下载 → 200 + 断流 | src/sftp.ts、src/index.ts | ✓ |
| D27 | 双栏直传在目标栏路径未解析时会写到宿主 cwd | client-src/index.js |  |
| D28 | Windows 本机栏「..（上级目录）」失效并跳到盘根 | client-src/index.js |  |
| D29 | 大目录不虚拟滚动，`sftp_list` 无条目上限 | client-src/index.js |  |
| D30 | `sftp_read` 的边界问题 | src/index.ts | ✓ |
| D31 | `sftp_list` 出参丢 `isSymlink`/`isFile` | src/index.ts、src/sftp.ts |  |
| D32 | 本机栏列表完全不排序 | src/index.ts、src/sftp.ts |  |
| D33 | 状态条在窄窗口静默裁掉右侧条目 | client-src/tty.css、client-src/index.js | ✓ |
| D34 | 标签持久化载荷无版本字段 + `ready` 帧打断行内重命名 | client-src/index.js |  |
| D35 | 三处弹窗用局部 `const setStatus` 遮蔽模块级同名函数 | client-src/index.js |  |
| D36 | `tunnel_list` 出参 schema 与实现不符 | src/index.ts、src/tunnels.ts |  |
| D37 | 零碎但确凿的四条 | src/shell-integration.ts |  |
| D38 | 宿主半体与浏览器半体在 CI 里零自动化 | test/*.ts、.github/workflows/ci.yml | ✓ |
| D39 | CI 不跑旗舰脚本，也没有「产物与源码一致」闸门 | scripts/client-lint.mjs |  |
| D40 | `integration.mjs` 的失败信息掩盖真因 | scripts/integration.mjs |  |
| D41 | 三个 smoke 脚本无 npm script、README 零提及 | package.json |  |
| D42 | 发布 `files` 不含 `scripts/`，但 package.json 仍 advertise 它们 | package.json |  |
| D43 | `preview.mjs` 默认重建 `client.js`（隐式写入库产物） | scripts/preview.mjs |  |
| D44 | 文档漂移 | README.md、README.en.md |  |
| D45 | 无测试的关键路径 | src/index.ts、test/probe.test.ts | ✓ |
| D46 | bash ≥4.4 的 shell 集成不发 D 标记 | src/shell-integration.ts、test/shell-capture.test.ts | ✓ |
| D47 | integration 的 tmux 列举竞态 | scripts/integration.mjs |  |
| D48 | Windows 上强杀本地 PTY 会把宿主进程搞崩 | src/index.ts、test/host-frames.test.ts | ✓ |
| D49 | 状态条每秒整条重建两次 + 值位数变化推挤后续条目（用户报「定期闪动」） | client-src/stats-bar.js、client-src/index.js、client-src/tty.css、test/stats-bar.test.ts | ✓ |
| D50 | 宿主采样一慢（macOS `netstat -ib` 挂 30s）→ 帧间隔 4s，被前端 3s 陈旧窗口判成「采集停了」→ **整条状态条每 4 秒消失又出现** | src/stats.ts、client-src/stats-bar.js、client-src/index.js、scripts/preview/harness.js | ✓ |
| D51 | `integration.mjs` 的 B26d 断言数「重画次数」而非「是否回放缓冲」→ 偶发假红（6 轮 1 次）；已改为「滚出屏的 marker 是否被回放」判据 | scripts/integration.mjs |  |
| D52 | **工具返回值不符合声明的 output.schema**：`tunnel_list` / `tty_capture{last}` / `tty_expect` 用 `?? undefined` 留下 `undefined` 键（非无损 JSON 值）→ 真实宿主判「must be a lossless JSON object」直接报工具错；`tty_list` 新增 `owner` 却漏改 schema → `additionalProperties:false` 判非法输出 | src/index.ts、scripts/integration.mjs |  |
| D53 | 本地监听失败的隧道**状态不粘**：`listen EADDRINUSE` 记下的 `error`/`fatal` 被 SSH 侧重试路径清掉，`connectTunnel` 又把状态刷成 `connecting` → 状态条长期显示「连接中」，而错误文字还挂着（自相矛盾）；SSH ready 时还会被误判 `active`。用户截图「绿点 + 报错」即此 | src/tunnels.ts、test/tunnels.test.ts |  |
| D54 | 隧道列表**乐观更新失败不回滚**：`removeTunnel` / `toggleTunnelEnabled` 丢掉 `pushTunnels` 的失败返回值，宿主拒绝后界面仍停在「已改」的样子 → 界面与真实配置不一致（唯一能看出的地方就是这一行） | client-src/index.js |  |
| D55 | 凭据引用名的**文档示例与真实派生规则对不上**（示例 IP 换成文档网段、派生名没跟着改；「撞名」举例把不同组的名字写成一组）——规则本身无测试，示例只能靠人眼比对 | client-src/credential-ref.js、README.md、README.en.md、test/credential-ref.test.ts |  |
| D56 | 端口转发**没有编辑功能**：改端口/条目只能删掉重建（而名字由规则派生、改端口即换名），且撞名时静默加 `-2` 后缀凭空多出一条；错误文案却让用户去「更正 bookName」——UI 上根本没这个动作 | client-src/index.js、client-src/tunnel-edit.js、scripts/preview/harness.js |  |
| D57 | 虚拟屏用 `scrollback: 0` 建 → xterm 缓冲区长度跟不上 `ybase`，输出与 resize（reflow）交错时 `lineFeed()` 写 `undefined.isWrapped` → **未捕获 TypeError 打死整个 dsh 宿主进程**（GUI 掉线 / 会话表清空 / agent 全丢）；插件侧 try/catch 与宿主都没有兜底 | src/index.ts、test/screen-crash.test.ts | ✓ |
| D58 | 隧道致命错误被「重试路径」覆写成 connecting，**永久卡死**：`tunnel_list` 回 `connecting` 却挂着一条永久性错误，面板与 agent 都以为「还在连」，而插件根本不会重试 | src/tunnels.ts、src/index.ts、client-src/index.js、test/tunnels.test.ts | ✓ |
| D59 | `sftp_*` 错误文案不带对象（只有 `<动作>: <原因>`，11 处）→ 批量调用时无法判断是哪一条失败，而 agent 常把它当「路径存不存在」的探测用 | src/sftp.ts、test/sftp.test.ts | ✓ |
| D60 | 机器级资源没有 profile 维度：复制 profile 把固定端口（webserver / 隧道 `localPort`）一并拷走，tmux socket（`-L dsh-tty`）全 profile 共用 → 后起的宿主 `EADDRINUSE`（本次只做「可诊断 + 文档」） | src/tunnels.ts、README.md、README.en.md |  |
| D61 | 桌面版终端**永远连不上**：WS 地址只用 `location` 拼，而桌面 origin 是 Electron 自定义协议 `dsh-app://app` → 拼出 `ws://app/…`；除 WS 外全是相对路径 fetch，所以只有终端这一条通道断 | client-src/ws-url.js（新增）、client-src/index.js、test/ws-url.test.ts、scripts/client-host-url.mjs |  |
| D62 | Windows 冒烟的**失败原因被自己吞掉**：收尾的 `process.exit(1)` 丢掉管道里未 flush 的写（CI 上缓冲 64 KB）→ 日志里五条断言全 PASS、没有 ✘ 行、也没有汇总行，只剩 `exit code 1`；连带把「W5 第二次 exit 帧」这条偶发失败掩盖成不可诊断 | scripts/windows-smoke.mjs（同款写法另有 docker 三套 smoke，见 §2.3） | ✓ |

## 2. 编号字典：这段代码为什么长这样

### 2.1 代码注释里那些「为什么」（关键词索引，原文照录）

「为什么」都写在代码的对应注释里，入口是这些关键词：

> `writableEnded` 不是 `finish`、PS0 展开在子 shell、node-pty `_deferNoArgs` 的异步抛出、
> `connId:sid` 绑定键、分片 24h 阈值、`SLOT` 固定槽位……

原表「被代码引用」列里的 16 个编号、共 52 处引用，出处就是本文。

### 2.2 设计决定：agent 自开终端（0.20.0：tty_open / tty_close / tty_stats）

> 这一节记的是**设计决定**（不是缺陷）：agent 能自己开终端之后，会话的归属语义变了，
> 后面改这块代码的人需要知道为什么长这样。

- **为什么必须区分 owner**：孤儿回收器的判据是「无客户端绑定」（`orphanedAt !== null`），
  而 agent 用 `tty_open` 开的会话**从出生起就没有客户端**——不豁免的话会被回收器当孤儿
  秒收，长驻任务（dev server / build）刚起来就没了。所以 `TtySession.owner: 'user' | 'agent'`，
  `reapOrphans` 对 `owner === 'agent'` 直接 continue。**回归门槛**：
  `test/host-frames.test.ts` 的「openAgentSession → 无客户端会话入表，且不被孤儿回收器收掉」
  与「用户会话的孤儿仍按 grace 回收」（豁免只给 agent，不是把回收器关了）。
- **为什么不直接复用 `spawn` 帧**：`spawn` 的整个处理器是 ws 耦合的（`send(ws, …)` 直连、
  在途断连要转孤儿）。抽出 `createLocalSession({ …, client: null })` 后两条路径共用同一套
  spawn / tmux / 并发收敛逻辑，差别只有「有没有客户端」与 `owner`。抽取时**行为必须逐字节
  等价**——落地时 215 个既有单测全绿是那次重构的安全网。
- **为什么开成可见标签而不是隐形会话**：D06（在途 spawn 不与连接绑定 → 僵尸会话）教训就是
  隐形会话的产物——用户不知道机器上跑着什么。agent 开的会话照常进 `sessions` 快照、宿主主动
  推 `sessions` 帧给面板、客户端建「agent」标签（`client-src` 的 `adoptAgentSessions`），
  用户可见、可接管、可关。**回归门槛**：`integration.mjs` B32c。
- **权限边界（重要）**：`tty_close` **只关 agent 自己开的**会话，用户开的会明确拒绝
  （`owner=user` 的错误信息里让 agent 请用户自己关）。理由与 D09 同源：agent 不该有能力
  结束用户正在用的终端。**回归门槛**：B32e。
- **`tty_stats` 的取数**：本地会话跑本地采样器；SSH 会话在同连接上开一次性 exec 通道取一帧
  （3s 超时、失败返回 `available:false` + 原因，不抛给 agent 的判断链）。`sendStats` 里顺手把
  每帧留档到 `session.lastStats`，因为 agent 开的会话没有面板订阅、否则永远拿不到指标。
  **回归门槛**：B32h。
- **验证（真实 PTY，3 轮）**：`integration.mjs` **111/111 全绿**（新增 B32a–B32h 八项）；
  单测 **222/222**（新增 7 条 agent 会话护栏）。

### 2.3 D49–D62 的刻意取舍 / 容易踩的坑

这 14 条的 postmortem 正文已冻结进 git（见 §4）。**唯独"刻意不做什么"与"排除了哪些假设"必须
留在正文**——不写下来，下一个人会把它们当成遗漏给"补上"。

| 编号 | 取舍 / 结论（刻意不做 / 为什么这样写） |
|---|---|
| D49 | 值必须有**固定字符槽位**（`STATS_ITEM_SPECS[].slot` → inline `min-width: Nch`），且条目**只建一次**、之后只写真变了的字段；「网络」的槽位随「有没有速率」给（有速率 23ch、没速率不留）。回归钉住的性质是「**任何现实取值下值的字符数 ≤ 槽位**」——槽位可调小，但绝不能小于该字段的现实最大值 |
| D50 | 子进程类字段（df / netstat / vm_stat）改走 `AsyncSlot`：**首次采样 await 一次**（首帧要完整），此后一律「用上一次的值 + 到点后台刷新」，拿不到再退避 30s——任何命令再慢也只能让自己那格变旧，**不能拖散「每秒一帧」的时间轴**。前端陈旧窗口 3s → 8s |
| D51 | **纯测试缺陷，产品行为正确**：`refreshTmuxClient()` 三个调用点各刷一遍是**对的**（多窗口各自重画本就该各刷一次）；曾考虑给同会话加在途合并，实测证明那是**改错方向**（会破坏多窗口重画），故**未采纳**。判据从「数次数」改为「测回放与否」（先让 marker 滚出可见屏再查），并留一个屏上 marker 作**正控**，避免把「什么都没收到」误判成通过 |
| D52 | `undefined` 不是合法 JSON 值：三处 `?? undefined` 改为**省略键**（`...(x === null ? {} : { x })`）。真正的防线是 `integration.mjs` **B33 输出契约看门狗**——在 `tools.register` 处包一层 `execute`，按**声明的 schema** 校验**每一次真实返回值**；旧的 `B12e` 只验 schema 形状本身，与「返回值是否符合 schema」是两个方向 |
| D53 | 本地监听失败 / 连接簿条目缺失是**人工介入级**故障：`scheduleRetry()` 开头 `if (rt.fatal) return`——重试一百次结果相同，只会把状态刷花。恢复路径是改配置（`signatureOf` 含 `enabled`，所以「取消勾选 → 重新勾选」同样有效）。**附带查清（不是缺陷）**：2222 冲突来自 `~/.dsh/settings.yaml` 被各 profile 共享，是一份配置跑两个宿主的必然结果 |
| D54 | 提交失败必须**回滚到提交前快照**（新增 `commitTunnels(next, before)`）。影响面值得记住：界面与真相不一致时，**唯一能看出来的地方就是那一行本身**，用户只能去翻配置文件 |
| D55 | **示例即规格**：三处示例（中/英 README + `client-src/index.js` 注释）统一成与规则字面对得上的形式，并把**规则抽成纯模块 `client-src/credential-ref.js`**——示例的「事实来源」变成可执行代码。**附带清理**：把真实内网 IP / 真实连接名换成中性取值（含 docker 包的历史遗留一处） |
| D56 | 编辑**按原始 name 定位替换**（改端口后名字会变，用新名找不到自己）；`enabled` **保留原值**（编辑规格不该顺手启用停用的隧道）。返回值用**判别式** `{ok:true,…} \| {ok:false,error}` 而非 `{tunnel}\|{error}`——后者在无类型标注的 JS 里 TS 收窄不了，实测多 14 条 TS2339 噪音（把 client-lint 已知噪音从 24 推到 38） |
| D57 | `SCREEN_SCROLLBACK = 1` 留 1 行余量即 `maxLength = rows + 1`，维持 push / `ybase++` 的成对关系；**不影响 `tty_screen` 读数**（它走 `buffer.getLine(row)`，即视口）。`scrollback 0 → 1` 是**行为微移**而非纯安全垫（`hasScrollback` getter 由 false 变 true），抽查（RI / HTS / 顶行）未见差异但**没有逐序列比对**，作为排障视图可接受。**排除掉的假设（重要）**：上门报告写的「dispose 与在途写入竞态」实测**不成立**，其建议的「方案 A/B」修的是**不存在的竞态**，本次未采纳；报告称「不涉及 resize 帧」也与实测不符（resize 是复现的必要条件） |
| D58 | 定时器回调加 `!rt.fatal`（卡死的关键路径）+ `connectTunnel` 入口加 `if (rt.dead \| rt.fatal) return`（纵深防御）；`TunnelStatus` 暴露 `fatal`，`tunnel_list` 对 fatal 单独措辞。反序用例**先断言**「重试定时器确实排在 fatal 之前」，否则用例会退化成正序那条、**失去意义** |
| D59 | 统一 `sftpFail(action, target, error, note?)` → `<动作> <对象>: <原因>`；ssh2 把 SFTP 状态码挂在 `err.code`，`NO_SUCH_FILE(2)` / `PERMISSION_DENIED(3)` 单独点明，省得从英文 errno 猜 |
| D60 | 把设置「集中共享」**不是**解法——端口是**机器级资源**，共享只会让两个 profile 永远抢同一个端口、且无法各自关闭；缺的是「机器级资源的 profile 维度处理」。本次只做「可诊断 + 文档」，未做项见 [ROADMAP.md](./ROADMAP.md) |
| D61 | 来源改用宿主注入的 `globalThis.__DSH_TRANSPORT__.streamBaseUrl`，缺省退回 `document.baseURI`——浏览器直连下与旧的 `location.host` **逐字等价**。它同时是**仓库级静态规则**的由来：`scripts/client-host-url.mjs`（TS AST，注释与字符串免疫）拦「读 `location` 的 protocol/host/hostname/origin/port」与「硬编码 `ws://`/`wss://` 字面量」，覆盖全部 10 个客户端半体；接线在 `scripts/client-lint.mjs`。**没做**：桌面 profile 的 `cordis.patch.yml` 里没有 `- id: tty` 配置块（不是本次故障原因，但桌面版终端目前跑纯默认配置） |
| D62 | 用**空串写入的回调**当 flush 屏障（实测：300 KB 输出直接 `exit` 只活 64 KB，加了屏障全活），**不用 `process.exitCode` 自然退出**——D121 的理由仍在：主体结束后可能有周期句柄漏着，看门狗又已经 clear，不显式退就会挂死。**刻意不做的**：① 不顺手改 docker 的 `smoke.mjs` / `route-smoke.mjs` / `client-smoke.mjs`（同款 `clearTimeout(watchdog)` + `process.exit(failed…)` 写法，同一类风险）——它们没loss过输出，本轮只修**证据覆盖到**的这一处，下轮要改就三处一起；② **没有**削弱 W5 的断言（「发过 kill 就必须收到 exit 帧」是 B1/B3 钉住的前端契约，socket 提前关掉**不算**通过）——本次只让失败可见，真正的偶发失败（W5 第二次 exit 帧）仍未复现、未定位 |

## 3. 复核方式

> 括号里的数字是 **2026-09-20 在本机实测**的值（HEAD `6a6bbfc8`）；脚本会随功能增长，别把数字
> 当契约，看的是「全绿」。

- 单测与静态检查：`pnpm --filter @hyzyn/dsh-tty test`（或根目录 `npx vitest run packages/tty`；
  2026-09-23 实测 **261 通过 / 19 文件**，含 D57 的 `test/screen-crash.test.ts` 与
  `test/host-frames.test.ts` 的接线用例）、
  `npx tsc --noEmit`、`node scripts/client-lint.mjs`。
- 端到端脚本（**0.19.0 起已挂 CI**，仍可本地跑）：`node scripts/integration.mjs`（本机 PTY 全链路；
  **本次未复核**——受限沙箱下 `posix_openpt` 被拒，见下条）、`node scripts/ssh-smoke.mjs`（内存 sshd，
  自包含，实测 38 个断言）、`node scripts/probe-smoke.mjs`（7）、`node scripts/probe-route-smoke.mjs`（9）、
  `node scripts/sftplimits-smoke.mjs`（7）、`node scripts/preview.mjs`（Chrome，**30 个界面场景**；
  默认不重建产物，落后会报错，`--build` 显式重建）。
- Windows：`node scripts/windows-smoke.mjs`（**只在 Windows 上有意义**，非 Windows 平台打印原因后
  跳过并退出 0；CI 的 windows-latest job 会执行它）。
- 环境前提：`integration.mjs` 需要真实 PTY、`preview.mjs` 需要 Chrome。受限沙箱（如
  workspace-write）下 `posix_openpt` 会被拒，integration 会在 `[1] 全链路` 直接崩——那是
  沙箱限制而非代码回归，放宽后重跑即可；CI（ubuntu-latest runner）不受影响。
- 原四处 **待验证** 项均随对应修复从结构上消除，不再需要实测：D13（监听器固定摘除）、
  D14（尺寸统一 clampInt）、D17（钩子前置 + carry 512KB，桩内容有单测）、D22（最小化不再对
  隐藏容器 fit）。

### 历史基线（照录，未合并）

- **0.19.0 时点**：`tsc` / vitest **193（15 文件）** / `integration.mjs` 103 / `ssh-smoke` 19 /
  `probe-smoke` 7 / `probe-route-smoke` 9 / `sftplimits-smoke` 6 / `windows-smoke` 5 全绿；
  `client.js` 与 `lib` 与源码逐字节一致。
- **2026-09-20 复核实测**（HEAD `6a6bbfc8`）：vitest **215（16 文件）** 全绿；
  `ssh-smoke` **38** / `probe-smoke` 7 / `probe-route-smoke` 9 / `sftplimits-smoke` **7** 全绿；
  `integration.mjs` 是 **102–103 / 103**——**B26d 偶发失败**（6 轮里 1 次，见 D51）。

## 4. 冻结记录：被移出正文的内容在哪

> 「信息只搬家、不丢失」的检索入口。以下内容全部**仍在原提交里**，
> 用 `git show <sha>:packages/tty/DEFECTS.md` 取回该时点的全文。

| 被移出的内容 | 在哪 |
|---|---|
| **0.18.3 那 48 条的完整审计原文**（逐条证据与修法讨论，496 行，含「附录：审计原文」+ 前置修复） | `git show 9e358db3:packages/tty/DEFECTS.md` |
| D49 / D50 详情节 | `git show bd407352:packages/tty/DEFECTS.md` |
| D51 / D52 / D53 / D54 / D55 详情节 | `git show c8f22520:packages/tty/DEFECTS.md` |
| D56 详情节 | `git show 00a4d2ea:packages/tty/DEFECTS.md` |
| D57 详情节（含复核后补的 `unhandledRejection` 入口与停摆退役） | `git show ddc66d26:packages/tty/DEFECTS.md`（跟进：`ef1f94f2`、`27efd618`） |
| D58 / D59 详情节 | `git show b8577970:packages/tty/DEFECTS.md` |
| D60 详情节 | `git show 0a152780:packages/tty/DEFECTS.md` |
| D61 详情节 | `git show ac17d269:packages/tty/DEFECTS.md` |
| **建议批次**（0.18.4 / 0.18.5 / 0.18.6 三批并入 0.19.0，表保留原计划供追溯） | `git show 9e358db3:packages/tty/DEFECTS.md` |
| **本次新增的 D58–D61 索引行**（补齐前它们只有详情节） | 症状取自各自的详情节，见上表对应 sha |

**发版流程**（原文照录）：README 的 8 处 `0.18.4` 先归位 → `pnpm -r build` → bump →
`pnpm aggregate` → `pnpm install --lockfile-only` → build / typecheck / test / check-publishable /
check-dsh-engines → publish → `dsh plugin --profile web add @hyzyn/dsh-tty@<version>`（见 `RELEASING.md`）。

## 5. 待办 / 路线图

**已拆分为独立文档：[ROADMAP.md](./ROADMAP.md)（8 项，一项未删）。**
本文只放「已经发生的事」；「还没做的事」一律去那里。
