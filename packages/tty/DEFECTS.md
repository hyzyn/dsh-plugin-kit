# @hyzyn/dsh-tty 缺陷审计与修复记录（v0.18.3 → 0.19.0）

> **这是一份时点记录。** 2026-09-19 对 v0.18.3 做了一次系统性只读审计（5 路并行 + 人工复读
> 关键路径），共 **48 条缺陷，已 48/48 修复并随 0.19.0 发布**（CI 三平台绿）。
>
> **怎么读**：本文只保留「现状 / 索引 / 待办」（活的部分）。48 条的完整审计原文（逐条证据与
> 修法讨论）已移出正文 —— 想看它：`git show 68936961:packages/tty/DEFECTS.md`。
> 条目里的 `[x]` 表示「已修并入库」，**不等于**「当前行为已验证」——想了解现在的行为请读
> README 与代码。
>
> 代码与测试里引用 `D01`–`D48` 的地方，出处就是本文（15 个编号、共 51 处），它们解释的是
> 「这段代码为什么长这样」。**新缺陷接着编号记在本文**。
>
> 审计基线：v0.18.3（HEAD `17657205`）｜ 修复波：`be28ae6e` … `77612dda`（含 CI 首跑补的
> D46/D47/D48）｜ 发布：tag `v0.1.36` → tty **0.19.0** / docker **0.6.4** / all 0.1.36 / kit 0.1.30。
>
> 回归门槛（0.19.0 时点）：`tsc` / vitest 193（15 文件）/ `integration.mjs` 103 / `ssh-smoke` 19 /
> `probe-smoke` 7 / `probe-route-smoke` 9 / `sftplimits-smoke` 6 / `windows-smoke` 5 全绿；
> `client.js` 与 `lib` 与源码逐字节一致。

## 现状

**已修 50 / 待修 0**（D01–D48 审计波 + D49/D50 线上反馈）。索引表**不写行号** —— 修复后代码移了位、
有的整段被删或重写，审计时点的行号只会误导；要定位实现请用：① 症状列的关键词
`git log -S'<关键词>'`；② 修复提交列（`git show <sha>`，提交信息按条目写了为什么）。被代码
直接引用的编号在最后一列标 ✓ —— 改这些行为前先读**代码里的对应注释**（「为什么」都写在那儿：
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

| D | 严重度 | 症状（一句话） | 涉及文件 | 修复提交 | 被代码引用 |
|---|---|---|---|---|---|
|---|---|---|---|---|
| D01 | P0 | SFTP 覆盖上传非原子，失败即毁原文件 | src/sftp.ts、src/index.ts | be28ae6e | ✓ |
| D02 | P0 | 目录直传跟随符号链接 → 目录环无限递归 | src/sftp.ts | be28ae6e |  |
| D03 | P0 | SSH 明文口令落浏览器存储 | client-src/index.js | be28ae6e |  |
| D04 | P0 | `tty_capture{last:true}` 无在途信号 → agent 拿到上一条命令的结果 | src/index.ts | be28ae6e |  |
| D05 | P0 | 两处截断方向相反，恰好丢最近输出 | src/index.ts | be28ae6e |  |
| D06 | P1 | 在途 spawn 不与 WS 连接绑定 → 僵尸会话 | src/index.ts | be28ae6e | ✓ |
| D07 | P1 | `session.clients` 只用 clientSid 做键 → 跨连接互相踩 | src/index.ts | be28ae6e | ✓ |
| D08 | P1 | `reconnectGraceSec` 热改为 0 后老孤儿永不回收 | src/index.ts | be28ae6e | ✓ |
| D09 | P1 | `kill` 帧缺「孤儿」前提，可杀任意活跃会话 | src/index.ts | be28ae6e | ✓ |
| D10 | P1 | `tty_expect` 的 acc 无界增长 + 并发无上限 | src/index.ts | be28ae6e |  |
| D11 | P1 | `spawnSsh` 的 channel Promise 无超时兜底，可永久挂起且无取消入口 | src/ssh.ts | be28ae6e |  |
| D12 | P1 | known_hosts 导入 → 假 MITM 告警并拒绝连接 | src/known-hosts.ts、src/ssh.ts | be28ae6e |  |
| D13 | P1 | SFTP `pipeCounted` 每搬一个文件挂一个永不摘除的 abort 监听器 | src/sftp.ts | be28ae6e |  |
| D14 | P1 | 帧输入零校验 | src/index.ts | be28ae6e | ✓ |
| D15 | P1 | 隧道不会收敛 | src/tunnels.ts | be28ae6e | ✓ |
| D16 | P1 | SSH 认证与错误文案误导 | src/ssh.ts | be28ae6e | ✓ |
| D17 | P1 | shell 集成的两处静默错误 | src/shell-integration.ts | be28ae6e |  |
| D46 | P1 | bash ≥4.4 的 shell 集成不发 D 标记 | src/shell-integration.ts、test/shell-capture.test.ts | 2335a485 | ✓ |
| D47 | P1 | integration 的 tmux 列举竞态 | scripts/integration.mjs | 2335a485 |  |
| D48 | P1 | Windows 上强杀本地 PTY 会把宿主进程搞崩 | src/index.ts、test/host-frames.test.ts | 77612dda | ✓ |
| D18 | P2 | 关活动标签可能选中嵌入式会话 → 面板空白 | client-src/index.js | be28ae6e |  |
| D19 | P2 | `afterSocketOpen` 无并发 / 代际守卫 + `restoreTab` 不去重 | client-src/index.js | be28ae6e |  |
| D20 | P2 | `waitFrame` 把监听挂在全局 socket 上 | client-src/index.js | be28ae6e |  |
| D21 | P2 | 最小化终端面板会取消在途 SFTP 传输 | client-src/index.js | be28ae6e |  |
| D22 | P2 | 状态条最小化期间不停表、`refitActiveTab` 无 minimized 守卫 | client-src/index.js | be28ae6e |  |
| D23 | P2 | 非 secure context 下剪贴板未判空 → 局域网访问点「粘贴」直接抛错 | client-src/index.js | be28ae6e |  |
| D24 | P2 | 键盘可达性缺口 | client-src/index.js | be28ae6e |  |
| D25 | P2 | `sftp_remove` 对根目录 / `..` 无任何护栏 | src/sftp.ts、src/index.ts | be28ae6e | ✓ |
| D26 | P2 | 下载不存在的路径 / 把目录当文件下载 → 200 + 断流 | src/sftp.ts、src/index.ts | be28ae6e | ✓ |
| D27 | P2 | 双栏直传在目标栏路径未解析时会写到宿主 cwd | client-src/index.js | be28ae6e |  |
| D28 | P2 | Windows 本机栏「..（上级目录）」失效并跳到盘根 | client-src/index.js | be28ae6e |  |
| D29 | P2 | 大目录不虚拟滚动，`sftp_list` 无条目上限 | client-src/index.js | be28ae6e |  |
| D30 | P2 | `sftp_read` 的边界问题 | src/index.ts | be28ae6e | ✓ |
| D31 | P2 | `sftp_list` 出参丢 `isSymlink`/`isFile` | src/index.ts、src/sftp.ts | be28ae6e |  |
| D32 | P2 | 本机栏列表完全不排序 | src/index.ts、src/sftp.ts | be28ae6e |  |
| D33 | P2 | 状态条在窄窗口静默裁掉右侧条目 | client-src/tty.css、client-src/index.js | be28ae6e |  |
| D34 | P2 | 标签持久化载荷无版本字段 + `ready` 帧打断行内重命名 | client-src/index.js | be28ae6e |  |
| D35 | P2 | 三处弹窗用局部 `const setStatus` 遮蔽模块级同名函数 | client-src/index.js | be28ae6e |  |
| D36 | P2 | `tunnel_list` 出参 schema 与实现不符 | src/index.ts、src/tunnels.ts | be28ae6e |  |
| D37 | P2 | 零碎但确凿的四条 | src/shell-integration.ts | be28ae6e |  |
| D38 | P3 | 宿主半体与浏览器半体在 CI 里零自动化 | test/*.ts、.github/workflows/ci.yml | 5576e205 | ✓ |
| D39 | P3 | CI 不跑旗舰脚本，也没有「产物与源码一致」闸门 | scripts/client-lint.mjs | be28ae6e |  |
| D40 | P3 | `integration.mjs` 的失败信息掩盖真因 | scripts/integration.mjs | be28ae6e |  |
| D41 | P3 | 三个 smoke 脚本无 npm script、README 零提及 | package.json | be28ae6e |  |
| D42 | P3 | 发布 `files` 不含 `scripts/`，但 package.json 仍 advertise 它们 | package.json | be28ae6e |  |
| D43 | P3 | `preview.mjs` 默认重建 `client.js`（隐式写入库产物） | scripts/preview.mjs | be28ae6e |  |
| D44 | P3 | 文档漂移 | README.md、README.en.md | be28ae6e |  |
| D45 | P3 | 无测试的关键路径 | src/index.ts、test/probe.test.ts | acbeaed3+b26f8dfe | ✓ |
| D49 | P2 | 状态条每秒整条重建两次 + 值位数变化推挤后续条目（用户报「定期闪动」） | client-src/stats-bar.js、client-src/index.js、client-src/tty.css、test/stats-bar.test.ts | c46909b6 | ✓ |
| D50 | P1 | 宿主采样一慢（macOS `netstat -ib` 挂 30s）→ 帧间隔 4s，被前端 3s 陈旧窗口判成「采集停了」→ **整条状态条每 4 秒消失又出现** | src/stats.ts、client-src/stats-bar.js、client-src/index.js、scripts/preview/harness.js | c46909b6 | ✓ |

## 线上反馈条目（0.19.2 之后新编号的）

### D49：状态条的「定期闪动」（0.19.2 之后，未随版本发布）

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

## 待办 / 路线图（本文唯一「还没做」的部分）

> 下面 7 条是**规划**，不是缺陷——单人项目不另开 Issue，待办就记在这里，做完打勾。
> 新发现的缺陷也接着编号记在本文，不要只留在对话里。

- **跳板机（ProxyJump / ProxyCommand）** —— `ssh-config.ts` 明写忽略、`buildConnectConfig` 从不设
  ssh2 的 `sock`；企业内网主机几乎都靠 bastion。**短期至少做到**：导入时跳过依赖跳板机的块并提示，
  不要静默产出一条注定 20s 超时的连接簿条目。
- **agent 侧没有 `tty_open` / `tty_close`** —— 现在只能 list/capture/screen/expect/send，开与关都得
  用户在面板里点；README「与 bash 工具同权」这句话需要订正。
- **隧道没有 agent 侧 start/stop** —— 只有 `tunnel_list`，启停全在设置卡片。
- **SFTP 双栏交互** —— 拖拽上传、排序 / 隐藏文件开关、大目录虚拟滚动、断点续传 / 增量（跳过两侧
  size+mtime 相同的文件）。
- **状态条与图元边界** —— 状态条窄屏布局；WebGL 上下文丢失后的重试恢复；磁盘多挂载点。
- **`HostKeyAlias` / 别名参与 TOFU 定位**（可搭 D12 的多指纹 schema 一起做）。
- **客户端接线进 CI**（D38 遗留，单独立项）—— `preview.mjs` 的 29 个界面场景需要 Chrome：要么加一个
  带浏览器的 CI job，要么继续把 UI 纯逻辑外抽成可单测模块（`status-line` / `dock-owner` /
  `current-session` 同款）。

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

- 单测与静态检查：`pnpm --filter @hyzyn/dsh-tty test`（或根目录 `npx vitest run packages/tty`）、
  `npx tsc --noEmit`、`node scripts/client-lint.mjs`。
- 端到端脚本（**0.19.0 起已挂 CI**，仍可本地跑）：`node scripts/integration.mjs`（本机 PTY 全链路）、
  `node scripts/ssh-smoke.mjs`（内存 sshd，自包含）、`node scripts/preview.mjs`（Chrome，29 个界面场景；
  默认不重建产物，落后会报错，`--build` 显式重建）。
- Windows：`node scripts/windows-smoke.mjs`（**只在 Windows 上有意义**，非 Windows 平台打印原因后
  跳过并退出 0；CI 的 windows-latest job 会执行它）。
- 环境前提：`integration.mjs` 需要真实 PTY、`preview.mjs` 需要 Chrome。受限沙箱（如
  workspace-write）下 `posix_openpt` 会被拒，integration 会在 `[1] 全链路` 直接崩——那是
  沙箱限制而非代码回归，放宽后重跑即可；CI（ubuntu-latest runner）不受影响。
- 原四处 **待验证** 项均随对应修复从结构上消除，不再需要实测：D13（监听器固定摘除）、
  D14（尺寸统一 clampInt）、D17（钩子前置 + carry 512KB，桩内容有单测）、D22（最小化不再对
  隐藏容器 fit）。
