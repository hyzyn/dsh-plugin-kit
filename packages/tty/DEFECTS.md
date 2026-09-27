# @hyzyn/dsh-tty 缺陷编号字典

> **这份文件是代码注释的编号字典，不是审计报告。**
>
> `src/` / `client-src/` / `test/` / `scripts/` 里有带 `Dxx` 的注释，含义是「这段代码为什么
> 长这样」，编号的出处就是本文。拿到任意一个 `Dxx`：先查 [§1 编号索引表](#1-编号索引表)
> 知道**当年坏了什么**，再查 [§2 编号字典](#2-编号字典这段代码为什么长这样) 知道**所以代码
> 为什么写成这样**。
>
> **编号是硬契约**：`D01–D78` 是 `packages/tty` 内部序列，与 `packages/docker/DEFECTS.md` 的
> `D01–D149` **不共享**；跨包引用请写「tty D12 / docker D03」。新缺陷接在 `D78` 之后，
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

> 4. **⚠️ 2026-09-25 补记**：`D62` 是上一轮加进来的（Windows 冒烟吞掉失败原因），但当时**没同步更新本文的「现状」行**（仍写「已修 61 / 编号至 D61」）。本次既要让台账自洽（[conventions.md § 编号规范](../../docs/conventions.md#编号规范) 硬规矩 5），又要留住这段历史，于是把计数改成与表内一致（已修 63 / 编号至 D63），并在此记下漂移是怎么发生的。

## 现状

**已修 78 / 待修 0**，编号至 `D78`。逐条症状见 §1，设计意图见 §2，**还没做的见
[ROADMAP.md](./ROADMAP.md)**。

**沿革（原文照录，未改）**：2026-09-19 对 v0.18.3 做了一次系统性只读审计（5 路并行 + 人工复读
关键路径），共 **48 条缺陷，已 48/48 修复并随 0.19.0 发布**（CI 三平台绿）；此后由线上反馈
补的 **D49 / D50**（状态条闪动）已随 **0.19.3** 落地，2026-09-20 复核又补 **D51**（测试断言缺陷）。
**D57**（虚拟屏未捕获异常打死宿主）是 2026-09-23 由用户带着 `dsh-safe` 崩溃日志上门的线上事故，
已修在 `src/index.ts`（未发版）；它不在那次审计的范围内。审计基线：v0.18.3｜ 修复波 / 发布：
tag `v0.1.36` → tty **0.19.0**（docker 0.6.4 / all 0.1.36 / kit 0.1.30）——此后 `v0.1.37` →
0.19.1、`v0.1.38` → 0.19.2、`v0.1.39` → **0.19.3**（本仓库 `packages/tty/package.json` 现为 0.19.3）。

**已修 78 / 待修 0**（D01–D48 审计波 + D49/D50 线上反馈 + D51–D56 复核实测发现 + D57 线上崩溃 + D58–D62 后续用户上报/复核 + D63 本轮统一安全围栏时顺手发现 + D64/D65 做 ProxyCommand 时顺路挖出来的两处静默泄漏 + D66 做能力闸门时**真机验收**挖出来的探针结算缺陷 + D67 同一轮 Windows 真机挖出来的探针阶段顺序 + D68 本轮做就地提权时扫出来的客户端字面星号 + D69 同一轮接 tty 就地提权时发现的脆测试（用例读开发机真实授权）+ D70 同上轮挖出的启动期闸门未初始化 + D71 用户反馈的开关行没有手型 + D72 用户反馈的「命令瞬间完成时 tty_expect 白等满超时」+ D73 提权面板把复制按钮塞在命令框里 + D74/D75 同一份 **Windows 真机报告**（2026-09-27：`tty_send` 的 `\n` 在 conhost 上不提交命令 / `tty_expect` 拿命令回显当命中）+ D76 用户上报 `tty_open` 会话生命周期时挖出来的**终局尾巴丢失** + D77 同一份上报的正题（**进程退出即退役**，输出再也取不回来）+ D78 同一轮真机复测里挖出来的「`exec` 包装层截断复合命令」）。索引表**不写行号、也不保留修复提交
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
| D63 | `~/.ssh/config` 导入的**四种丢弃此前全是静默的**：通配 / 无 User 的块无声消失、依赖跳板机（ProxyJump / ProxyCommand）的块被原样忽略、超过 100 条的块被丢——用户只看到「没有可导入的具体主机」，不知道自己的生产机被跳过了（跳板机那半边同时是项目级 ROADMAP 第 2 项） | src/ssh-config.ts、src/index.ts、client-src/index.js、test/ssh-config.test.ts、test/ssh-config-route.test.ts | ✓ |
| D64 | 连接簿对话框的**「连接（并保存）」出口漏带跳板机**：填了跳板机却直连出去，勾了保存的那份条目里也没有跳板机——症状是「连不上」，且没有任何提示说跳板机被丢了（四个出口里只有三个改了，正是「配了等于没配」的教科书形态） | client-src/index.js、test/proxy-command.test.ts | ✓ |
| D65 | SFTP 池条目在 `conn.on('close')` 里**只摘出池、没关跳板机**：目标连接断一次就漏一条 keepalive 一直养着的跳板机连接（`close(rt)` 才成对，而当时只做了 `conns.delete`） | src/sftp.ts | ✓ |
| D66 | 探针（`probeSsh`）**结算后仍会被后到的事件覆写结果**：`settle()` 有幂等守卫，但四处 `result.auth = …` 赋值没有——而 `resolve(finish())` 交出的是**同一个对象**。于是 ssh2 连报两条错时（`Connection lost before handshake` 带着代理命令的 stderr、随后 `The operation was aborted` 什么都没带），用户看到的永远是**最后那句空话**（「连接已关闭（服务端主动断开）」）。**纯 mock 测不出来**（要真 ssh2 + 真子进程的时序），是「宿主侧授权」那一轮真机验收时点了一次「试连」才暴露 | src/probe.ts、test/probe.test.ts | ✓ |
| D67 | 探针里 **agent 预检排在代理命令闸门之前**：「配了代理命令 + 宿主没授权 + 本机没有 ssh-agent」三件事同时成立时，只报「agent 认证需要 SSH_AUTH_SOCK」——用户去把 agent 修好、再点一次，才看到真正挡路的那道门；`result.proxy` 干脆是 `undefined`，连「代理命令被拒」这件事都没说。**macOS 开发机看不出来**（本机有 agent），是 Windows 真机跑 `live-host-smoke` 时 A7 才暴露的 | src/probe.ts、test/probe.test.ts、scripts/live-host-smoke.mjs | ✓ |
| D68 | 客户端文案里有 2 处字面 `**`（`hint.shellIntegrationWindows` 的 zh / en）——浏览器半体没有 markdown 渲染器，用户看到的是两个星号 | client-src/index.js | ✓ |
| D69 | 挂载插件的用例会读**开发机上真实的** `<DSH home>/dsh-kit/capability-grants.json`（就地提权那条通道）：开发机用卡片授权过一次之后，那批「未授权 → 必须 400 / 必须拒绝」的断言就在他那儿红、在 CI 上绿（本机实测：`proxy-command.test.ts` 的「POST /config 想把 allowProxyCommand 打开 → 400」正是这么变红的）。这类脆测试最坏的地方是**别人复现不了**——他的机器上恰好没授权，于是看到一片绿 | test/isolated-home.ts（把 DSH_HOME 指到临时目录，挂载插件的 10 个文件各 import 一行；与 packages/docker/test 各文件自己那段同思路） | ✓ |
| D70 | ProxyCommand 闸门是**模块级策略**，而它的唯一写入方 `applyPatch` 在启动期**只在「settings 里存过东西」时才跑**（`if (Object.keys(startup).length > 0)`）：于是「配置里写着 `allowProxyCommand: true` + 已授权 + 重启宿主」这条最平常的路径停在模块级默认值 `{granted:false, enabled:false}` 上——fail-closed（不是安全问题），但症状正是本仓最忌讳的「配了没反应」：卡片显示已授权，代理命令却仍被拒。接入就地提权后更致命：授权是**持久**的，重启后「界面说已授权」与「闸门真的放行」必须一致 | src/index.ts 在挂载时先 `setProxyCommandPolicy({ granted: capabilityGranted(...), enabled: live.allowProxyCommand })` 一次 | ✓ |

| D71 | 开关行**没有手型**（用户反馈原话：「这个没做手型」）：tty 卡片的复选框行（`boolField` 的那一堆 + 本轮新加的 ProxyCommand 那块）此前只有文字有反应、鼠标停上去是箭头，而 docker 卡片的 `.dk_check` 一直有手型——同一个 GUI 里两种手感。更隐蔽的是**复选框本身**：`input[type=checkbox]` 的 `cursor` 被 UA 样式定死，**不随 label 继承**，所以只给 label 写一条仍然不对 | 新增 `.tt_cardToggle`（`cursor: pointer` + `user-select: none`），`boolField` 与 `proxyCommandField` 的 label 都带上，复选框单独写一条；真机实测（CDP）6 个开关行的 label 与 checkbox computed cursor 均为 `pointer` | ✓ |
| D72 | `tty_expect` **在「命令瞬间完成」时必然白等满超时、而且只交回一段空白**（用户反馈的痛点原话：AI 很难预测一条命令会执行多久，`tty_send` 与 `tty_expect` 之间隔着一次模型推理，命令若在这个窗口里跑完，要等的标记早已出现在终端输出里，却匹配不到）。旧实现只匹配**注册之后**到达的输出（`acc` 从空开始 + 只挂 data 监听），于是三件事一起发生：① 标记永远不会进入 `acc`；② 命令结束早停也失效（判定写在 `onData` 里，注册后没有新 chunk 就根本不执行）；③ 返回 `timedOut` + **空文本**，看起来像「命令没执行」。而插件推荐的流程正是 `tty_send → tty_expect → tty_capture{last}`——可信度最高的一条路径在快命令下 100% 出错 | src/index.ts 加两层回溯：注册时先拿「上一条命令」的 B..D 窗口输出试（无回显、无提示符、自带退出码 → `matchedFrom:'last'`），再扫「已读水位线之后的未读缓冲」且下界抬到最后一个 B 标记之后去回显（→ `matchedFrom:'buffered'`）；水位线用**单调字符计数**定位（裁剪只前移起点，公式恒成立），`tty_capture` 读到即算已读、超时不消耗未读区；test/expect-backlog.test.ts（9 条，含两处反向验证） | ✓ |
| D73 | 提权面板把**复制按钮塞在命令框里**：`.tt_elevCommand` 是 flex 行，命令一长就折行、按钮跟着文字尾巴跑，看起来像命令的一部分（与 docker 那份同一处观感问题，2026-09-27 真机报告） | `client-src/index.js` 让命令独占一行、复制/（过期时）重新生成/倒计时另起 `.tt_elevActions` 一行；`client-src/tty.css` 给 `.tt_elevPanel`/`.tt_elevSteps` 加 `minmax(0, 1fr)` + `min-width: 0`、`.tt_elevCommand` 加 `min-width: 0`，新增 `.tt_elevActions`。CDP 实测 360/420/520/700/900px：面板不溢出、复制按钮命中自身且不再与命令框重叠 | ✓ |
| D74 | Windows 本地 PTY 上 `tty_send` **不提交命令**：conhost 把 Enter 当 **CR**，裸 LF 只把光标下移一格——agent 按工具描述发 `echo X\n` 之后命令停在输入行，没有输出、没有新提示符，「发命令」这个动作在 Windows 上基本不可用（2026-09-27 真机报告，字节级 + 屏幕级判定：`\r` / `\r\n` 提交并执行、`\n` 不提交；补一个裸 `\r` 才把挂起的命令提交掉） | `src/index.ts` 新增导出 `normalizePtyInput(data, platform)`：win32 上把裸 LF 补成 CRLF（已经是 CRLF 的不重复补，否则凭空多提交一次空命令），非 win32 与 SSH 会话原样透传；`tty_send` 按 `session.kind === 'local'` 接上它，工具描述补一句「Windows 上插件会归一化」。test/send-normalize.test.ts（8 条：纯函数 5 + 真实写入路径 3；平台用 `Object.defineProperty` 临时切 win32，因为「忘了调用」这种回归只测纯函数拦不住） | ✓ |
| D75 | `tty_expect` **拿命令回显当命中**：没有 shell 集成（Windows 本地 / 集成被关 / 远端未装）时没有 B 标记可切边界，`tty_send` 写进去的那行文本先回到输出流里——于是命令**一次都没执行**，等待却立刻返回 `matched:true`（报告现场：LF 没提交，`tty_expect pattern="echo ECHO_DEMO_2"` 秒回，来源标注「回溯自此前已到达、还没读过的缓冲输出」；报告方自己的自动判定脚本也被这个陷阱骗过一次） | `src/index.ts` 加回显剔除：`noteSubmittedInput`（只记 `tty_send` 且带行尾的提交，单键按键与含控制字符的行不记）+ `stripEchoLines`（按**行尾**削——cmd 的回显与提示符同行，行内提示符前缀保留）+ `echoOnlyMatch`（原始流与清洗后文本各削一次，**削掉后仍命中才算真命中**）；live 与 buffered 两条路径都过一遍，`inCommand`（TUI 全屏重画里出现输入文本是真实输出）或文本里有 B 标记时不启用；超时结果带 `echoOnly:true`，render 文案改成「只匹配到回显、没有匹配到任何真正的输出——先复核命令到底跑没跑」。test/expect-backlog.test.ts 的 D75 用例 5 条（含「不误杀真输出」「命令在跑时不启用」两条反向验证） | ✓ |
| D76 | **进程退出前最后一批输出永远到不了终端面板**（用户上报原话：「结果明明就在那里但我看不到」——`tty_open` 跑一条记录结果的命令，程序打印完就退出，人跟 AI 都只能看到它前面那些输出）。根因是两行顺序：`finishSession` 先置 `session.closed = true`（为了让 `onData` 立刻停止成帧）**再**调 `flushPendingOutput`，而后者首行守卫正是 `if (session.closed \|\| …) return` ⇒ **12ms 合并窗口里还没发出的尾巴被它自己的守卫整批吞掉**，与方法自己的注释（「exit 前冲掉合并窗口里的尾巴，保序」）和「exit 帧永远在最后一帧 data 之后」的契约相反。判定用真实 `TtyServer` 路径的两个探针：写入后立刻退出 → 面板只收到 `ready` + `exit`（data 帧 0 个）；同一行若在退出前 ≥12ms 到达 → 正常 `ready` + `data` + `exit` | `src/index.ts` 给 `flushPendingOutput` 加 `force` 参数、`finishSession` 带 force 调用：`closed` 仍先置（终局后的字节照样不成帧），但这一步不再被自己的守卫挡下；test/host-frames.test.ts 两条（尾巴必须发出且 data 帧在 exit 帧之前 / 终局之后到达的输出仍不成帧） | ✓ |
| D77 | **进程退出即会话退役，输出还在却再也取不回来**（用户上报 issue #4 的原话：「结果明明就在那里但我看不到……我现在不得不强迫AI先打开 `/bin/sh` 再执行具体的命令」——`tty_open` 跑一条会结束的命令，跑完 `tty_capture` 只报「会话不存在或已退出」，连 `tty_close` 都报「会话不存在或已结束」）。`finishSession` 是唯一出口：`sessions.remove` + 释放虚拟屏 + 清空绑定；而数据其实还躺在 `session.buffer` 与 `shellState.lastCommand` 里，丢掉的只是**可达性**。同一份现场的另一半在面板侧：`exit` 帧后标签转「已退出」浮层，点「重新打开」是**新 sid**，旧内容再也取不回 | `src/index.ts` 把「进程退出」与「退役」拆成两件事：`finishSession` 只发 exit 帧 + 打 `exited:{code,signal,at}` 标记，**不出表、不释放屏**（`closed` 保持 false ⇒ 读侧守卫天然放行）；读侧 (`tty_list` / `tty_capture` / `tty_screen`) 照常可用并带 `exited`/`signal`/`retainMs`，`tty_expect` 借已兑现的 `done` 立刻结算（带 `exited:true`），写侧 `tty_send` 与 `tty_stats` 明确拒绝，`attach` 明确拒绝，`tty_close` 成为显式释放入口；退役只剩 `SessionManager.retire` 一处，触发者 = 显式关闭 / 面板关标签 / 条数上限（`capExited(16)` 按最旧淘汰，淘汰时 `logger.warn` 记下被挤掉的 sid——否则用户只有「刚才那份结果怎么没了」这一种观测）/ 宿主重启；保留**不按时间**淘汰（`EXITED_RETAIN_MS=∞`：时间上界对使用者是第二重惊喜，而内存与句柄本来就由 8 条上限兜；想要时间上界改这一个常量即可，`reapExited` 通路还在）；并发名额改数**活着的**会话（`liveCount`），保留态不占名额；`reapOrphans` 跳过保留态，同 sid 新建时 `retireStaleExited` 先摘掉旧尸体（否则 `add()` 顶出表 = 屏泄漏）；client-src 关标签/重开也发 `kill` 释放、采纳 agent 会话时跳过保留态；test/host-frames.test.ts（8 条：表内保留/attach 拒绝/关标签释放/不占名额/TTL/条数上限/孤儿回收跳过/同 sid 摘尸体）+ test/exited-retain.test.ts（8 条工具层：list/capture/screen/expect 可读 + send/stats 拒绝 + close 释放 + systemPrompt 不冒充活会话）；scripts/windows-smoke.mjs 新增 W7a-d（**真机** Windows 11 ARM64 + ConPTY：command 型会话退出后仍可读、写被拒、tty_close 释放） | ✓ |
| D78 | POSIX 本地 `tty_open command=` **只执行命令列表的第一条**：`echo A; echo B` 只输出 `A`、`cd /tmp && pwd` 输出为空、`echo X; exit 3` 的退出码是 0、`for i in 1 2 3; do …; done` 直接 `parse error`（2026-09-27 真机复测报告；落盘副作用证明后半段**根本没执行**，不是输出丢失）。根因在 `buildCommandSpawn`（`src/shell-integration.ts`）：包装层写成 `${pre} exec ${command}`，而 `exec` 只是**简单命令**前缀——zsh 把 `exec echo A; echo B` 解析成 `[exec echo A] ; [echo B]`，进程被第一条替换后 `echo B` 永不调度；`cd x && cmd` 的右支同理；`exec for …` 在解析阶段就报错；退出码也变成被 exec 那条的。更狠的是内建命令：`exec cd /tmp` 的语义是「跑完内建即结束当前 shell」，于是连第一条的输出都没有、`&&` 右支连同外层 shell 一起消失。而 agent 最惯用的写法正是 `cd dir && cmd` / `cmd; echo rc=$?`，静默少跑后半段比报错更难查；Windows 四分支（`buildWindowsCommandSpawn`）本来就不带 `exec`，同一份 agent 代码在 macOS/Linux 与 Windows 上行为不一致 | `src/shell-integration.ts` 的 POSIX 包装层改成 `exec <同一个 shell> -c <command>`：外层 `exec` 保留「进程即命令」（退出码取自命令列表最后一条、被信号打死仍如实报 signal——D77 的面板与工具文案正靠它区分崩溃与正常退出），内层 `-c` 把**整段命令当 shell 代码**执行；命令用既有的 `shSingleQuote` 包住（内嵌单引号 `'\''`、多行都能安全穿过外层解析），内层不加 `-l/-i`（非交互语义与旧路径一致）；test/shell-spawn.test.ts 三条（单条命令的新 argv 形状 / 复合命令整段进单引号且不再以 `exec <cmd>` 前缀 / Windows 四分支都不含 `exec`）；scripts/integration.mjs B35a-e（真 PTY：`a; b`、`cd && cmd`、`exit 3 → exitCode=3`、`for …`、命令内单引号）；**补**：`commandShellHint(shell, platform)`（POSIX / cmd / PowerShell / Git Bash / WSL 五分支）写进 systemPrompt 的终端行与 `tty_open` 结果——「`command` 按整段 shell 语法执行」这句话在 Windows 上不能无条件承诺 POSIX 语法（2026-09-27 复核报告：在 Windows 上按 POSIX 语法复测，9 条全红，根因是命令由 `cmd.exe` 执行），同时修掉工具描述里漏改的保留上限（8 → 16）；反向验证：用旧产物跑 B35 → 前四条红、单引号那条绿（旧形状本来就吃单引号）；**报告方真机复验**（2026-09-27 20:57，打运行中的宿主）：§4.2 全部复现用例转为通过，另加「命令内含引号」「`false; echo rc=$?` → rc=1」「`python3 … exit(9); echo rc=$?` → rc=9」「`kill -TERM $$` → `signal=SIGTERM`（没退化成 143）」三类边界；**第二轮按复测提示词再跑 9/9**（2026-09-27 21:0x：`echo A; echo B; echo C; echo D` / `cd /tmp && pwd` / `echo X; exit 3` → exitCode=3 / `for …; do …; done` / 内嵌引号 / `false; echo rc=$?` → rc=1 / `kill -TERM $$` → signal=SIGTERM，外加 D77 与 D76 各一条回归；全程不套 `sh -c`） | ✓ |

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

### 2.3 D49–D65 的刻意取舍 / 容易踩的坑

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
| D63 | 解析器改成 `parseSshConfigDetailed()`：不仅回候选，还回 **proxy 块名 + 三种丢弃的计数**（`parseSshConfig()` 保留为薄包装，老调用点形状不变）。**`ProxyJump none` / `ProxyCommand none` 算显式直连**（OpenSSH 用它抵消上层 `Host *` 的设置），照常导入；键名大小写不敏感。`proxy` 名单截到 50 个但 **`proxyCount` 仍是准的**——截断不许把数报小。**刻意不做**：不真的经跳板机连（完整实现的六个坑见 [项目级 ROADMAP](../../ROADMAP.md) 第 2 项），也不在导入时把 `ProxyCommand` 带进来（那是设置字段驱动的本地任意命令执行，信任级与回环围栏后的路由不同） |
| D64 | 「四个出口必须走同一个取值函数」写成注释钉在对话框里（连接 / 试连 / 文件浏览 / 保存修改）。**刻意不做**：不把 `jump` / `proxyCommand` 塞进 `collectProbeSpec` 之外的公共 builder —— 那四个出口的字段集合本来就不同（试连不带 name/persist），强行合并会把「这次到底提交了什么」藏进一层间接。回归靠 `test/proxy-command.test.ts` 的真插件往返（POST → GET 一字不差） |
| D65 | `conn.on('close')` 里改走现成的 `close(rt)`（而不是新写一段清理）：它本来就是「目标 + 跳板机 + 代理命令」成对收尾的唯一入口，**再抄一遍必然漂**。代理命令的传输（子进程 stdio）与跳板机（另一条 Client）都是「目标只是借用」，所以收尾点永远是同一批：`close(rt)` / `failTunnel` / 重连路径 / `disposeAll` |
| D66 | 四个回调（timer / ready / error / close）进来先 `if (settled) return`。**刻意不做**：不改成「后到的更详细就覆盖先到的」——那要看懂每条分支谁更权威，而「第一次结算即定稿」是一条更好讲、也更容易守住的规则（`spawnSsh` / `sftp` / `docker` 的同类路径本来就是这么写的，探针是漏网的那一处）。回归用**真进程**（桥脚本指向死端口，约 30ms）而不是 mock：这个缺陷的成因就是事件次序 |
| D67 | 顺序改成**闸门（阶段 0）在前、agent 预检在后**：策略挡路（要不要放行本机命令执行）优先于环境挡路（本机有没有 agent），也与 HTTP 路由「先过门、再干活」一致。**刻意不做**：不把 agent 预检整个删掉或并进阶段 2 —— 它便宜、且能避免白连一次；只是不许它抢在闸门前面发声。回归两条（`test/probe.test.ts`：一条钉顺序、一条钉 agent 预检没被搬丢）+ 真机侧把 `live-smoke` 的 A7 显式写成 `auth: 'password'`（别让断言偷偷变成「agent 预检」）、新增 A7b 并把宿主 A 用 `dropEnv: ['SSH_AUTH_SOCK']` 起——这样「本机没有 agent」在任何机器上都成立，macOS 上也能跑到这条分支 |

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
