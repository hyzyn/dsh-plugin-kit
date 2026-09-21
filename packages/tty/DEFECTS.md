# @hyzyn/dsh-tty 缺陷审计与修复记录（v0.18.3 → 0.19.0，线上反馈补到 0.19.3）

> **这是一份时点记录。** 2026-09-19 对 v0.18.3 做了一次系统性只读审计（5 路并行 + 人工复读
> 关键路径），共 **48 条缺陷，已 48/48 修复并随 0.19.0 发布**（CI 三平台绿）；此后由线上反馈
> 补的 **D49 / D50**（状态条闪动）已随 **0.19.3** 落地，2026-09-20 复核又补 **D51**（测试断言缺陷）。
> 补的 **D49 / D50**（状态条闪动）已随 **0.19.3** 落地。
>
> **怎么读**：本文只保留「现状 / 索引 / 待办」（活的部分）。48 条的完整审计原文（逐条证据与
> 修法讨论）已移出正文 —— 想看它：`git show 262e8ab4:packages/tty/DEFECTS.md`
> （即 `18b4fc17^`，496 行，含「附录：审计原文」全 48 条 + 前置修复）。
> 条形目的 `✓` 表示「这段代码/测试里引用了该编号」，**不等于**「当前行为已验证」——想了解现在的
> 行为请读 README 与代码。
>
> 代码与测试里引用 `D01`–`D48` 的地方，出处就是本文（16 个编号、共 52 处），它们解释的是
> 「这段代码为什么长这样」。**新缺陷接着编号记在本文**。
>
> 审计基线：v0.18.3（审计时 HEAD `ea5fabda`，该 sha 已随历史重写失效、仅存记录）｜ 修复波 / 发布：tag `v0.1.36` → tty **0.19.0**
> （docker 0.6.4 / all 0.1.36 / kit 0.1.30）——此后 `v0.1.37` → 0.19.1、`v0.1.38` → 0.19.2、
> `v0.1.39` → **0.19.3**（本仓库 `packages/tty/package.json` 现为 0.19.3）。
> ⚠️ **本仓库的历史被重写过**，上面这些 sha 多数已不可解析 —— 索引表因此不再保留「修复提交」
> 列，定位实现的办法见「现状」一节。
>
> 回归门槛（0.19.0 时点）：`tsc` / vitest 193（15 文件）/ `integration.mjs` 103 / `ssh-smoke` 19 /
> `probe-smoke` 7 / `probe-route-smoke` 9 / `sftplimits-smoke` 6 / `windows-smoke` 5 全绿；
> `client.js` 与 `lib` 与源码逐字节一致。
>
> **2026-09-20 复核实测**（HEAD `a29d9f22`，放开沙箱后跑真实 PTY）：vitest **215（16 文件）** 全绿；
> `ssh-smoke` **38** / `probe-smoke` 7 / `probe-route-smoke` 9 / `sftplimits-smoke` **7** 全绿；
> `integration.mjs` 是 **102–103 / 103**——**B26d 偶发失败**（6 轮里 1 次，见 D51）。

## 现状

**已修 56 / 待修 0**（D01–D48 审计波 + D49/D50 线上反馈 + D51–D56 复核实测发现）。索引表**不写行号、也不保留修复提交
sha** —— 修复后代码移了位、有的整段被删或重写，审计时点的行号只会误导；而**本仓库的历史被重写
过**（当时记下的 sha 大多已不可解析，实测只有 D49/D50 的 `e51bfaec` 还在），所以回溯入口统一改成
按关键词检索：`git log -S'<症状列的关键词>'`，提交信息按条目写了为什么。被代码直接引用的编号在
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

## 索引

| D | 严重度 | 症状（一句话） | 涉及文件 | 被代码引用 |
|---|---|---|---|---|
| D01 | P0 | SFTP 覆盖上传非原子，失败即毁原文件 | src/sftp.ts、src/index.ts | ✓ |
| D02 | P0 | 目录直传跟随符号链接 → 目录环无限递归 | src/sftp.ts |  |
| D03 | P0 | SSH 明文口令落浏览器存储 | client-src/index.js |  |
| D04 | P0 | `tty_capture{last:true}` 无在途信号 → agent 拿到上一条命令的结果 | src/index.ts |  |
| D05 | P0 | 两处截断方向相反，恰好丢最近输出 | src/index.ts |  |
| D06 | P1 | 在途 spawn 不与 WS 连接绑定 → 僵尸会话 | src/index.ts | ✓ |
| D07 | P1 | `session.clients` 只用 clientSid 做键 → 跨连接互相踩 | src/index.ts | ✓ |
| D08 | P1 | `reconnectGraceSec` 热改为 0 后老孤儿永不回收 | src/index.ts | ✓ |
| D09 | P1 | `kill` 帧缺「孤儿」前提，可杀任意活跃会话 | src/index.ts | ✓ |
| D10 | P1 | `tty_expect` 的 acc 无界增长 + 并发无上限 | src/index.ts |  |
| D11 | P1 | `spawnSsh` 的 channel Promise 无超时兜底，可永久挂起且无取消入口 | src/ssh.ts |  |
| D12 | P1 | known_hosts 导入 → 假 MITM 告警并拒绝连接 | src/known-hosts.ts、src/ssh.ts |  |
| D13 | P1 | SFTP `pipeCounted` 每搬一个文件挂一个永不摘除的 abort 监听器 | src/sftp.ts |  |
| D14 | P1 | 帧输入零校验 | src/index.ts | ✓ |
| D15 | P1 | 隧道不会收敛 | src/tunnels.ts | ✓ |
| D16 | P1 | SSH 认证与错误文案误导 | src/ssh.ts | ✓ |
| D17 | P1 | shell 集成的两处静默错误 | src/shell-integration.ts |  |
| D46 | P1 | bash ≥4.4 的 shell 集成不发 D 标记 | src/shell-integration.ts、test/shell-capture.test.ts | ✓ |
| D47 | P1 | integration 的 tmux 列举竞态 | scripts/integration.mjs |  |
| D48 | P1 | Windows 上强杀本地 PTY 会把宿主进程搞崩 | src/index.ts、test/host-frames.test.ts | ✓ |
| D18 | P2 | 关活动标签可能选中嵌入式会话 → 面板空白 | client-src/index.js |  |
| D19 | P2 | `afterSocketOpen` 无并发 / 代际守卫 + `restoreTab` 不去重 | client-src/index.js |  |
| D20 | P2 | `waitFrame` 把监听挂在全局 socket 上 | client-src/index.js |  |
| D21 | P2 | 最小化终端面板会取消在途 SFTP 传输 | client-src/index.js |  |
| D22 | P2 | 状态条最小化期间不停表、`refitActiveTab` 无 minimized 守卫 | client-src/index.js |  |
| D23 | P2 | 非 secure context 下剪贴板未判空 → 局域网访问点「粘贴」直接抛错 | client-src/index.js |  |
| D24 | P2 | 键盘可达性缺口 | client-src/index.js |  |
| D25 | P2 | `sftp_remove` 对根目录 / `..` 无任何护栏 | src/sftp.ts、src/index.ts | ✓ |
| D26 | P2 | 下载不存在的路径 / 把目录当文件下载 → 200 + 断流 | src/sftp.ts、src/index.ts | ✓ |
| D27 | P2 | 双栏直传在目标栏路径未解析时会写到宿主 cwd | client-src/index.js |  |
| D28 | P2 | Windows 本机栏「..（上级目录）」失效并跳到盘根 | client-src/index.js |  |
| D29 | P2 | 大目录不虚拟滚动，`sftp_list` 无条目上限 | client-src/index.js |  |
| D30 | P2 | `sftp_read` 的边界问题 | src/index.ts | ✓ |
| D31 | P2 | `sftp_list` 出参丢 `isSymlink`/`isFile` | src/index.ts、src/sftp.ts |  |
| D32 | P2 | 本机栏列表完全不排序 | src/index.ts、src/sftp.ts |  |
| D33 | P2 | 状态条在窄窗口静默裁掉右侧条目 | client-src/tty.css、client-src/index.js | ✓ |
| D34 | P2 | 标签持久化载荷无版本字段 + `ready` 帧打断行内重命名 | client-src/index.js |  |
| D35 | P2 | 三处弹窗用局部 `const setStatus` 遮蔽模块级同名函数 | client-src/index.js |  |
| D36 | P2 | `tunnel_list` 出参 schema 与实现不符 | src/index.ts、src/tunnels.ts |  |
| D37 | P2 | 零碎但确凿的四条 | src/shell-integration.ts |  |
| D38 | P3 | 宿主半体与浏览器半体在 CI 里零自动化 | test/*.ts、.github/workflows/ci.yml | ✓ |
| D39 | P3 | CI 不跑旗舰脚本，也没有「产物与源码一致」闸门 | scripts/client-lint.mjs |  |
| D40 | P3 | `integration.mjs` 的失败信息掩盖真因 | scripts/integration.mjs |  |
| D41 | P3 | 三个 smoke 脚本无 npm script、README 零提及 | package.json |  |
| D42 | P3 | 发布 `files` 不含 `scripts/`，但 package.json 仍 advertise 它们 | package.json |  |
| D43 | P3 | `preview.mjs` 默认重建 `client.js`（隐式写入库产物） | scripts/preview.mjs |  |
| D44 | P3 | 文档漂移 | README.md、README.en.md |  |
| D45 | P3 | 无测试的关键路径 | src/index.ts、test/probe.test.ts | ✓ |
| D49 | P2 | 状态条每秒整条重建两次 + 值位数变化推挤后续条目（用户报「定期闪动」） | client-src/stats-bar.js、client-src/index.js、client-src/tty.css、test/stats-bar.test.ts | ✓ |
| D50 | P1 | 宿主采样一慢（macOS `netstat -ib` 挂 30s）→ 帧间隔 4s，被前端 3s 陈旧窗口判成「采集停了」→ **整条状态条每 4 秒消失又出现** | src/stats.ts、client-src/stats-bar.js、client-src/index.js、scripts/preview/harness.js | ✓ |
| D51 | P2 | `integration.mjs` 的 B26d 断言数「重画次数」而非「是否回放缓冲」→ 偶发假红（6 轮 1 次）；已改为「滚出屏的 marker 是否被回放」判据 | scripts/integration.mjs | |
| D52 | P1 | **工具返回值不符合声明的 output.schema**：`tunnel_list` / `tty_capture{last}` / `tty_expect` 用 `?? undefined` 留下 `undefined` 键（非无损 JSON 值）→ 真实宿主判「must be a lossless JSON object」直接报工具错；`tty_list` 新增 `owner` 却漏改 schema → `additionalProperties:false` 判非法输出 | src/index.ts、scripts/integration.mjs | |
| D53 | P1 | 本地监听失败的隧道**状态不粘**：`listen EADDRINUSE` 记下的 `error`/`fatal` 被 SSH 侧重试路径清掉，`connectTunnel` 又把状态刷成 `connecting` → 状态条长期显示「连接中」，而错误文字还挂着（自相矛盾）；SSH ready 时还会被误判 `active`。用户截图「绿点 + 报错」即此 | src/tunnels.ts、test/tunnels.test.ts | |
| D54 | P2 | 隧道列表**乐观更新失败不回滚**：`removeTunnel` / `toggleTunnelEnabled` 丢掉 `pushTunnels` 的失败返回值，宿主拒绝后界面仍停在「已改」的样子 → 界面与真实配置不一致（唯一能看出的地方就是这一行） | client-src/index.js | |
| D55 | P3 | 凭据引用名的**文档示例与真实派生规则对不上**（示例 IP 换成文档网段、派生名没跟着改；「撞名」举例把不同组的名字写成一组）——规则本身无测试，示例只能靠人眼比对 | client-src/credential-ref.js、README.md、README.en.md、test/credential-ref.test.ts | |
| D56 | P2 | 端口转发**没有编辑功能**：改端口/条目只能删掉重建（而名字由规则派生、改端口即换名），且撞名时静默加 `-2` 后缀凭空多出一条；错误文案却让用户去「更正 bookName」——UI 上根本没这个动作 | client-src/index.js、client-src/tunnel-edit.js、scripts/preview/harness.js | |

## 线上反馈条目（0.19.2 之后新编号的，已随 0.19.3 发布）

> 这两条不是那次审计的产物：0.19.2 之后由用户截图上门，修在 `e51bfaec`，随后由 `v0.1.39` 发版
> 提交 `22f55278` 带出 **tty 0.19.3**（`e51bfaec` 是本文里唯一还能在本仓库解析的 sha）。

### D49：状态条的「定期闪动」（0.19.2 之后上门，已随 0.19.3 发布）

- **症状**：终端面板上方的服务器状态条每秒抖一下——看上去像整条在跳/闪（用户截图指出）。
  值本身也在变是预期的，抖的是**布局**。
- **根因**（headless 夹具实测，scripts/preview 的 `local` 场景 + 真实位数的帧序列，8 秒 / 每
  100ms 采样）：
  1. 旧渲染每次刷新都 `statsBarEl.innerHTML = renderStatsBarHtml(...)`，而调用方有两个各自
     每秒跑一次的源头（stats 帧 + 1s 陈旧检测定时器）→ **每秒整条重建两次**；
  2. 值文本宽度随位数变（`5%`↔`12%`、`36`↔`1024`、`9.2 GB`↔`17.8 GB`），重建时没有固定
     槽位 → **任何一位数变化都把后面所有条目推着横移**：实测 60 次位置变化 / 8 秒，单次最大
     26px；
  3. 重建还会重置 `.tt_statsMeterFill` 的宽度过渡（元素每秒被换掉，过渡永远跑不完）与
     `overflow-x: auto` 的滚动位置（D33 刚加的窄窗口横滚被弹回 0）。
- **修法**：① 值有固定字符槽位（`STATS_ITEM_SPECS[].slot` → inline `min-width: Nch`，mono 字体下
  1ch = 1 字符，值右对齐；`网络` 的槽位随「有没有速率」给——有速率 23ch、没速率不留，速率出现/
  消失才切一次）；② 条目只建一次，之后只写真的变了的文本/槽位/宽度/档位/title，并且同一条
  数据（`sid + statsAt`）不重复渲染。值计算与槽位抽进 `client-src/stats-bar.js`（与 `status-line.js`
  同款的可单测纯逻辑；`formatBytes` / `formatRate` 顺带搬过去，终于有覆盖）。
- **回归门槛**：`test/stats-bar.test.ts`（17 条，钉住「任何现实取值下值的字符数 ≤ 槽位」这条性质
  ——槽位可以调小，但绝不能小于该字段的现实最大值）；`scripts/preview.mjs local stats-off
  stats-broken multi` 四场景（含断言）全绿；实测位置变化从 60 次/8s 降到 0（仅 `@3x` 局部位图
  舍入差 <0.02px），滚动位置设定后可保持。

### D50：状态条「整条瞬间消失又出现」（宿主采样慢 → 陈旧窗口误判）

- **症状**：终端面板上方的状态条**整条**一闪一闪——不是数字在动，是整条没了又回来（用户补的描述）。
- **根因**（本机实测）：
  1. macOS 分支的网速采集用 `netstat -ib`，**不带 `-n`** 时 netstat 会对每个接口地址做反查
     （mDNS/DNS 不响应就一直等）——本机实测 **30 秒**不返回（同一条命令加 `-n`：**8ms**）。
  2. 它被 `EXEC_TIMEOUT_MS`（3s）砍掉，但 `collect()` 是 `await` 的：**每次采样都卡满 3s**，
     而 `setInterval(tick, 1000)` 有 busy 守卫 → 每秒的 tick 被跳过两拍 → **帧间隔变成 4s**。
     （副作用：`rxRate/txRate` 恒缺席 → 状态条「网络 无」，用户截图里正是这样。）
  3. 前端 `STATS_STALE_MS = 3000`：3 秒收不到新帧就把整条隐藏（还会重跑 fit 把终端顶一下），
     下一帧又显示 → **每 4 秒消失又出现**。
- **修法**：宿主两条 + 前端一条：
  1. `netstat -ibn`（补 `-n`，8ms）——顺带把 macOS 的网速修回来了；
  2. 子进程类字段（df / netstat / vm_stat）改走 `AsyncSlot`：**首次采样 await 一次**（首帧要完整），
     此后一律「用上一次的值 + 到点后台刷新」，拿不到再退避 30s；任何命令再慢也只能让自己那格
     变旧，不能拖散「每秒一帧」的时间轴（`createLocalSampler` 支持注入 `exec` / `platform`，可测）；
  3. 前端陈旧窗口 3s → 8s：允许连丢几拍仍显示上一帧的值，真停了也只是晚 8 秒收起。
- **回归门槛**：`test/stats.test.ts` 新增两条（macOS 走 `-ibn`、慢命令不被 await，用注入的假 exec，
  不依赖真实平台）；`test/stats-bar.test.ts` 新增「4s 一帧不算陈旧」两条；`scripts/preview.mjs stats-slow`
  （假宿主 4s 一帧、连续 9 秒采样）——旧产物实测 **2/75 次采样是隐藏的**（闪），新产物 0 次。
  真实采样器实测：每次 `sample()` 从 3000ms 降到 **3~12ms**，帧恢复 1s 节奏，网速重新有值。

### D51：B26d 断言测错了对象 → 偶发假红（2026-09-20 复核发现，已修）

- **症状**：`integration.mjs` 偶发 `102/103`——`B26d attach 跳过缓冲回放 — marker 出现 2 次`。
  放开沙箱跑真实 PTY 后 4 轮里命中 1 次；除该项外**其余 102 项全绿**。
- **根因**（本机实测，macOS + tmux **3.7b**）：
  1. **断言测的是「次数」，而次数区分不了两种成因**。B26d 想锁「attach 不回放宿主环形缓冲」，
     却用「屏幕上 marker 恰好出现 1 次」表达。但 attach 天然有**两个重画来源**（tmux `-A`
     自身重画 + 宿主 `refresh-client`），两者偶尔都落帧就是 2 次 —— 那是观感、不是本用例
     要防的回归。实测：attach 稳定后计数为 1，再发一个显式 `refresh` 帧必然 `1 → 2`
     （`refresh` 帧的**设计语义就是重画一次**），证明「次数」这个量无法归因。
  2. **计数时机还在重画落定之前**：`waitFor` 一见到 marker 就立刻 `match().length`，落在
     两次重画之间就偶发读到 2。
  3. **不是产品缺陷**：`refreshTmuxClient()` 每次走 `list-clients` → `refresh-client`，
     三个调用点（attach [index.ts:1853](packages/tty/src/index.ts#L1853)、rebind
     [index.ts:1433](packages/tty/src/index.ts#L1433)、`refresh` 帧
     [index.ts:1785](packages/tty/src/index.ts#L1785)）各刷一遍是**正确**的——多窗口各自
     重画本就该各刷一次。曾考虑给同会话加在途合并，实测证明那是**改错方向**（会破坏
     多窗口重画），故**未采纳**。
- **影响面**：**纯测试缺陷**。产品行为正确，不丢数据、不影响 `capture{last}` / 退出码 /
  会话生命周期。真正的害处是 CI 偶发假红——假红会训练人忽略红。
- **修法（本次，只动 `scripts/integration.mjs`）**：把判据从「数次数」换成**直接测「回放与否」**：
  先让 marker（`B26REFRESH-ok`）**滚出可见屏**，再在 attach 后检查它是否出现——
  - 回放宿主 256KB 环形缓冲 → 历史被送到 → marker 出现（回归，红）；
  - 跳过回放、只由 tmux 重画可见屏 → 历史不在屏上 → marker 不出现（正确，绿）。
  尾部另打一个留在屏上的 `B26TAIL-ok` 作为「确实重画过」的正控，避免把「什么都没收到」
  误判成通过；B26e 同步改用该可见 marker 作判据。
- **验证**（真实 PTY）：
  - 新断言 **6/6 轮全绿**（旧断言同期还会偶发红）；
  - **反向验证会红**：临时把 attach 恢复成「先回放缓冲再重画」，**3/3 轮稳定变红**且失败
    信息准确（`attach 后收到了已滚出屏的历史（宿主环形缓冲被回放）`）——说明放宽的是
    判据形状、不是判据强度。
- **回归门槛**：`integration.mjs`（真实 PTY，需 `[24] 跨窗口共享` 之前的 tmux 段）；本机
  跑法见「复核方式」，受限沙箱下需放开设备权限。

### D52：工具返回值与声明的 output.schema 不符（2026-09-20，用户实测上报）

- **症状**：用户实测 `tty_open` 后紧接着调 `tty_list`，工具**直接返回 Error**：
  `tool "tty_list" returned invalid output: "value.sessions[0].owner" is not a declared property
  (additionalProperties: false)`（三行，对应三个会话）。agent 侧只看到一个工具报错。
- **根因**：DSH 对工具**输出**做真实校验（`dsh-tools` 用 schema 判返回值），两类违约各有一条：
  1. **加了字段没同步 schema**：`SessionManager.list()` 为支持 `tty_open` 新增了 `owner`
     字段，但 `tty_list` 的 `output.schema.items.properties` 没跟着加 → 违反
     `additionalProperties: false`。这类错误在**真实宿主里才现形**，单测全绿也照样漏。
  2. **`undefined` 泄漏进返回值**：`tunnel_list`、`tty_capture{last:true}`、`tty_expect`
     用 `error: t.error ?? undefined` / `exitCode: x ?? undefined`，**键仍存在**、值为
     `undefined`。`undefined` 不是合法 JSON 值，校验器报
     `must be a lossless JSON object` → 同样是工具级 Error。
     `tunnel_list` 那条**只要隧道没错误就必炸**（0.19.0 注释里"显式挑字段"防的是多字段，
     没防住 undefined）；`tty_capture{last}` 则在"命令无退出码"时炸。
- **为什么此前没发现**：老的 `B12e` 只跑 `assertSupportedJsonSchema`——它校验的是
  **schema 形状本身是否受支持**，与「返回值是否符合 schema」是两个方向。加上 B12 恰好
  只用 `lines` 路径调 `capture`（没碰 `last`），`exitCode` 分支就一次都没被真实调用过。
- **修法**：① `tty_list` schema 补 `owner: { type: 'string', required: true }`（渲染也补上
  「agent 开的」标识）；② 三处 `?? undefined` 改为**省略键**（`...(x === null ? {} : { x })`）。
- **回归门槛（这次的关键产出）**：`integration.mjs` 新增 **B33 输出契约看门狗** —— 在
  `tools.register` 处包一层 `execute`，用 `validateJsonSchemaValue` 按**声明的 schema**
  校验**每一次真实返回值**，违约记入 `outputViolations` 并在末尾断言。它一次性扫全 16 个
  工具的所有调用路径，把这类「schema 形状合法、返回值非法」的错误挡在集成测试里。
  另补 **B12f** 覆盖 `capture{last:true}`（此前被绕过的分支）。
- **验证（真实 PTY）**：`integration.mjs` **113/113 全绿**（新增 B33 + B12f）；
  **反向验证有效**：临时撤掉 schema 里的 `owner` → B33 **稳定变红**并报出与用户截图
 一致的原文，而旧断言 `B12a` 依然通过 —— 证明看门狗能抓住该类回归、旧测试不能。

### D53：本地监听失败的隧道状态不粘（2026-09-20，用户截图「亮着点 + 报错」暴露）

- **症状**：端口转发列表里一条隧道**已勾选、状态点发亮**，底下却挂着
  `本地监听 127.0.0.1:2222 失败: listen EADDRINUSE: address already in use`。看起来像通了、
  实际没通，而且状态点会长期停在「连接中」。
- **根因**（本机实测：`settings.yaml` 里一条隧道启用、其本地端口被另一 profile 的宿主占用）：
  1. `startTunnel()` 里 `server.listen()` 的失败是**异步**回调，而 `connectTunnel(rt)` 紧接着
     执行、**无条件**把 `rt.state` 置为 `'connecting'`——覆盖刚设好的 `'error'`；
  2. SSH 侧随后失败 → `scheduleRetry()`，它又**无条件把 `rt.fatal` 清回 `false`**；重试定时器
     到点再调 `connectTunnel` → 状态被反复刷成 `connecting`。于是几乎永远显示「连接中」，
     而 `error` 字段是粘性的、一直挂着，两者自相矛盾；
  3. 若 SSH 恰好连上，`conn.on('ready')` 的 `if (!rt.fatal)` 守卫**本意**是「SSH 通了也不掩盖
     本地监听失败」，但 `fatal` 已被 `scheduleRetry` 清掉 → 守卫失效 → 报 `active` + 亮绿点。
- **为什么此前没发现**：既有测试覆盖了「连接簿缺失 → fatal」，但没覆盖「**本地监听失败** +
  SSH 侧同时失败」的组合时序；单看任一侧都正常。
- **附带查清（不是缺陷）**：2222 冲突本身来自配置——`~/.dsh/settings.yaml` 为各 profile
  **共享**，web(3080) 与 test(3082) 两个宿主按同一份配置各自启了同一条隧道，抢同一个本地端口。
  同一机器上同一端口只能有一个监听者，这是一份配置跑两个宿主时的必然结果，非插件 bug。
- **修法**：`scheduleRetry()` 开头加 `if (rt.fatal) return`——本地监听失败 / 连接簿条目缺失这类
  **人工介入级**故障不进重试循环（重试一百次结果相同，只会把状态刷花）。保持 `error` 态与原因
  文案；恢复路径是改配置（`reconcile` 收新规格会重建，`signatureOf` 含 `enabled`，所以
  「取消勾选 → 重新勾选」同样有效）。
- **回归门槛**：`test/tunnels.test.ts` 新增两条——①端口被占后即使 SSH `ready` 也不得变
  `active`；②**复现生产时序**（listen 失败 → SSH 失败 → 越过重试窗口）状态必须仍是 `error`。
  第二条在修复前**实测失败**（`expected 'connecting' to be 'error'`），修复后转绿。
- **验证**：`vitest` **224/224**（隧道文件 9/9）；`integration.mjs` **113/113**（含 B20 隧道
  五条用例，无回归）。


### D54：隧道列表乐观更新失败不回滚（2026-09-20 复核发现，已修）

- **症状**：删除隧道 / 取消勾选「启用」时，宿主若拒绝（重名、连接簿条目不存在、端口非法），
  卡片上弹了一条错误，但**列表仍停在改过的样子**——用户以为已生效，而真实配置没变。
- **根因**：`pushTunnels` 一直有返回值（成功 `true` / 失败 `false` + 错误提示），但
  `removeTunnel` / `toggleTunnelEnabled` 用 `void pushTunnels(next)` **丢掉了它**，没有把
  表单回滚到提交前。连接簿条目编辑那条路径不受影响（它走的是另一套提交）。
- **影响面**：界面与真相不一致，且**唯一能看出来的地方就是这一行本身**——用户无法从界面上
  判断"到底生效没有"，只能去翻配置文件。功能可用（重开卡片会从宿主拉到真相）。
- **修法**：新增 `commitTunnels(next, before)`：先乐观更新、失败即 `setForm` 回滚到 `before`
  快照；`removeTunnel` / `toggleTunnelEnabled` 改走它。
- **回归门槛**：`preview.mjs` 无隧道交互场景（客户端逻辑无单测），故本次以**代码路径复核 +
  client-lint** 为准；后续若把隧道提交逻辑外抽成纯模块（`status-line` / `stats-bar` 同款），
  可补单测。


### D55：凭据引用名的示例与规则脱节（2026-09-20 复核发现，已修）

- **症状**：文档里的派生示例**输入与输出对不上**——示例输入已被换成文档网段
  （`hsadmin@192.0.2.10:22`），派生名却是**换之前的旧值**，于是照文档核对会以为自己配错了。
- **根因**：示例 IP 统一成文档网段时，
  **派生名却没同步改**，于是示例自相矛盾。同一段里还有第二处错：「撞名」举例把三个名字
  写成「折出来完全一样」，实际只有其中两个同组，第三个归一后是另一组。
- **为什么此前没发现**：这条规则**没有任何测试**——它只以注释和 README 示例的形式存在，改规则
  或改示例都不会有东西报错，只能靠人眼逐字比对。
- **影响面**：纯文档/可读性问题，**不影响功能**（派生逻辑本身是对的）。但它会让人怀疑自己的
  配置，也让「示例即规格」这层信任失效。
- **修法**：① 三处示例（`README.md` / `README.en.md` / `client-src/index.js` 注释）统一改成与
  规则字面对得上的形式，并注明「点分 IP 的 `.` 折成 `_`」；② 「撞名」举例改成真正同组的
  `web 01` / `web_01`；③ **规则抽成纯模块 `client-src/credential-ref.js`**（与 `status-line.js` /
  `stats-bar.js` 同款），`client-src/index.js` 改为 import——示例的"事实来源"变成可执行代码。
- **附带清理**：复核中发现**我自己**在前两项修复（D53）里把真实内网 IP 与真实连接名写进了
  `test/tunnels.test.ts` / `DEFECTS.md`；`packages/docker/test/session-target.test.ts` 里也有一处
  历史遗留的真实连接名。全部换成中性/文档网段取值。
- **回归门槛**：`test/credential-ref.test.ts`（10 条）——**文档示例本身就是断言**
  （`192.0.2.10:22` → `DSH_TTY_HSADMIN_192_0_2_10_PASSWORD` 逐字），另钉住默认端口三种写法同键、
  非默认端口进键、字段参与名字、空主机/空用户名拒绝、大小写归一。
- **验证**：`vitest` **234/234**（17 文件）；**反向验证有效**：故意把「默认端口不进键」改成旧行为
  → 3 条断言立刻变红，恢复后转绿。


### D56：端口转发缺编辑功能（2026-09-20 用户要求补，已做）

- **症状**：端口转发列表每行只有「勾选启用 / 删除」。想改一条（把本地端口 2323 改成 2325、
  换连接簿条目）只能**删掉重建**；而隧道名由规则派生（`<bookName>-L<localPort>`），
  改端口必然换名字——重建后还可能因重名拿到 `-2` 后缀，凭空多出一条同名不同尾的隧道。
- **它不只是"体验差点"**：`src/tunnels.ts` 的错误文案明确让用户
  「在 设置 → 插件 → 终端面板 → 端口转发 里**更正 bookName**」，而那段 UI **没有更正这个动作**
  ——代码在指挥用户做一件做不到的事。用户只能去手改 `settings.yaml`。
- **附带**：撞名时**静默加 `-2` 后缀**。用户以为在改/加同一条，实际得到两条，排查时极难看出
  （列表里两行只差一个尾号）。改为**明确报错**并说明「改端口会得到新名字，或先删掉旧的」。
- **修法**：① 每行加「编辑」→ 回填到下方表单，按钮切成「保存修改 / 取消」（编辑态不再显示
  「添加隧道」，避免误加）；② 保存**按原始 name 定位替换**（改端口后名字会变，用新名找不到自己）；
  ③ `enabled` **保留原值**——编辑规格不该顺手把停用的隧道启用；④ 正在编辑的行加左侧色条标记
  （名字会变，得看得出编辑的是哪条）；⑤ 删掉正在编辑的那条时一并退出编辑态。
- **为什么抽成纯模块**：这段判断（命名、必填、撞名、按原名定位）原先只在组件闭包里、
  **没有单测**，而它恰好是最容易漂的一类（新增/编辑各写一份校验必然走偏）。规则收进
  `client-src/tunnel-edit.js`，配 `test/tunnel-edit.test.ts`（14 条）钉边界。
  返回值用**判别式**（`{ok:true,...} | {ok:false,error}`）而非 `{tunnel}|{error}`：后者在无
  类型标注的 JS 里 TS 收窄不了，实测会多 14 条 TS2339 噪音（把 client-lint 已知噪音从 24 推到 38）。
- **回归门槛**：`preview.mjs` 新增 **tunnel-edit 场景**（此前隧道区块**零界面回归**，D53/D54/D56
  能潜伏到现在的部分原因）：断言回填正确、按钮态正确、编辑行有标记、改端口后名字按规则重算、
  旧名字消失、**别的隧道不受影响**、保存后退出编辑态。
- **验证**：`vitest` **248/248**（18 文件，+14）；`preview.mjs` tunnel-edit + settings 两场景通过；
  **反向验证有效**：把"本地转发按规则派生名字"改成硬编码旧名 → 场景**立即变红**并准确报出
  「名字没按规则重新派生；旧名字仍在」，恢复后转绿。另：场景里驱动 React 受控输入必须走
  **prototype 上的原生 value setter**（直接赋值 React 读不到），harness 里此前没有这类场景。


## agent 会话（0.20.0：tty_open / tty_close / tty_stats）

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

## 待办 / 路线图（本文唯一「还没做」的部分）

> 下面 7 条是**规划**，不是缺陷——单人项目不另开 Issue，待办就记在这里，做完打勾。
> 新发现的缺陷也接着编号记在本文，不要只留在对话里。
> **2026-09-20 复核**：7 条中 2 条已被部分做掉（SFTP 双栏、状态条与图元边界，已在原地逐项标注
> 「已经做掉的 / 仍缺的」），1 条已整条做掉（agent 侧 `tty_open` / `tty_close`，见下方标注），
> 其余 4 条与代码现状一致。

- **跳板机（ProxyJump / ProxyCommand）** —— `ssh-config.ts` 明写忽略、`buildConnectConfig` 从不设
  ssh2 的 `sock`；企业内网主机几乎都靠 bastion。**短期至少做到**：导入时跳过依赖跳板机的块并提示，
  不要静默产出一条注定 20s 超时的连接簿条目。*（复核：仍未做，`ssh-config.ts:9` 的行为没变）*
- **agent 侧没有 `tty_open` / `tty_close`** —— ✅ **已做（0.20.0）**：`tty_open` 开本地会话
  （可带 `command` / `persistName`），`tty_close` 关自己开的；agent 开的会话是**面板里的普通
  标签**（用户可见可接管），并豁免孤儿回收（理由见 D51 之后的「agent 会话」一节）。同时补了
  `tty_stats`（CPU/内存/磁盘/网络/温度）。README「与 bash 工具同权」已订正为「16 个工具 +
  开/关能力，但关不掉用户的标签」。
- **隧道没有 agent 侧 start/stop** —— 只有 `tunnel_list`，启停全在设置卡片。*（复核：仍未做）*
- **SFTP 双栏交互** —— **已经做掉的**：本机栏排序（D32，与远程栏同一套「目录优先 +
  `localeCompare`」）。**仍缺的**：双栏内的拖拽上传（拖拽只在**单窗体**里有——0.8.0 起，
  全仓只有一处 `drop` 处理器）、隐藏文件开关、断点续传 / 增量（跳过两侧 size+mtime 相同的文件）。
  大目录**已有截断渲染兜底**（`RENDER_CAP = 500` + 「其余 N 项未渲染」提示；`sftp_list` 亦有
  默认 500 的 `maxEntries`），真正的虚拟滚动仍未做。
- **状态条与图元边界** —— **已经做掉的**：状态条窄屏布局（D33，改为横向滚动看右侧条目）。
  **仍缺的**：WebGL 上下文丢失后的重试恢复（xterm 自身只回退 DOM，无 `contextlost` 处理）；
  磁盘多挂载点（仍固定取 `/`，Windows 取系统盘）。
- **`HostKeyAlias` / 别名参与 TOFU 定位**（可搭 D12 的多指纹 schema 一起做）。*（复核：仍未做，
  全仓无 `HostKeyAlias`）*
- **客户端接线进 CI**（D38 遗留，单独立项）—— `preview.mjs` 的 30 个界面场景需要 Chrome：要么加一个
  带浏览器的 CI job，要么继续把 UI 纯逻辑外抽成可单测模块。*（复核：CI 仍未跑 `preview.mjs`；
  「外抽」这条路已多一个——D49 落地的 `client-src/stats-bar.js` 带 17 条单测，现在这类模块共
  4 个：`stats-bar` / `status-line` / `dock-owner` / `current-session`，各有同名测试文件）*

## 建议批次

> 2026-09-19 修复波已按下方内容一次性落地（三批合一，目标版本 0.19.0）；表保留原计划供追溯。

| 批次 | 内容 | 目标 |
|---|---|---|
| 0.18.4 | D01 D02 D03 D04 D05 + D06 D07 D08 D09 D12 | 消掉「静默毁数据 / 僵尸会话 / 假 MITM」三类 |
| 0.18.5 | D10 D11 D13 D14 D15 D16 D17 + D18 D19 D20 D21 | 挂死 / 泄漏 / 误判 / 面板行为 |
| 0.18.6 | D22–D37 + D38–D45 | 边界、可用性、工程闸门与文档 |

发版流程（见 `RELEASING.md`）：README 的 8 处 `0.18.4` 先归位 → `pnpm -r build` → bump →
`pnpm aggregate` → `pnpm install --lockfile-only` → build / typecheck / test / check-publishable /
check-dsh-engines → publish → `dsh plugin --profile web add @hyzyn/dsh-tty@<version>`。


## 复核方式

> 括号里的数字是 **2026-09-20 在本机实测**的值（HEAD `a29d9f22`）；脚本会随功能增长，别把数字
> 当契约，看的是「全绿」。

- 单测与静态检查：`pnpm --filter @hyzyn/dsh-tty test`（或根目录 `npx vitest run packages/tty`；
  实测 **215 通过 / 16 文件**）、`npx tsc --noEmit`、`node scripts/client-lint.mjs`。
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
