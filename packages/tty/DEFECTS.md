# @hyzyn/dsh-tty 缺陷清单

> 审计日期：2026-09-19 ｜ 基线：v0.18.3（HEAD `17657205`）
> 范围：**只列缺陷**（会毁数据、会挂死/泄漏、会误导用户或 agent、文档与实现不符）。
> 功能新增另见文末「功能缺口」，纯风格与可选优化不进本清单。
>
> **修复波（2026-09-19）**：D01–D37、D39–D44 已全部落地（D13 提前并入，D38/D45 部分——
> 最小宿主冒烟与凭据链路回归已加，系统性覆盖仍待补，见各自条目内的「部分完成」注记）。
> 修复统一以 **0.19.0** 为目标版本（三批合一次发布），代码注释与两份 README 的版本引用已对齐；
> 发版前置三件套已完成：bump（tty 0.19.0 / dsh-all 0.1.35 / dsh-plugin-kit 0.1.29）→
> `pnpm aggregate`（幂等无 diff）→ `pnpm install --lockfile-only`（specifier 已同步）。
> 复核补充项也已并入：单窗 SFTP 浏览器 renderRows 同样截断渲染（D29 的另一半）；
> remove 护栏下沉到 `SftpManager.remove`（D25 纵深防御，面板 HTTP 路由同样被拦）；
> CI 产物闸门扩展到 `packages/*/lib`；覆盖写分片孤儿（进程崩溃残留）由「下次同目录
> 上传清理 >24h 残留」+ README 边界说明收尾。
> 宿主侧回归：`tsc` / vitest 117 用例 / `probe-smoke` 7 / `probe-route-smoke` 9 /
> `sftplimits-smoke` 6 / `ssh-smoke` / `integration.mjs` 全绿；client.js 已重建。
> 原审计四个「待验证」项的处置：D13/D14（abort 监听器告警、1e9 OOM）随修复从结构上消除，
> 不再依赖实测；D17 两处（`$?` 污染方向、carry 上限）按修法前置 + 上限提到 512KB，
> 桩文件内容有单测钉住（`test/shell-spawn.test.ts`）。
>
> 方法：5 路并行只读审查（宿主核心 / SSH 层 / SFTP / 浏览器半体 / 工程面）＋人工复读关键路径。
> 标注 **✅ 复读** 的条目表示已在源码中人工核对过；标 **待验证** 的表示触发频率或具体表现
> 尚未实测。
>
> **行号锚点基于 HEAD `17657205`**；后续提交会让它漂移，届时以括号里的函数名 / 代码片段为准。

**严重度**：`P0` 会毁数据或静默给 agent 错数据 ｜ `P1` 会挂死 / 泄漏 / 误判 ｜
`P2` 行为与边界 ｜ `P3` 工程与文档

**状态**：`[x]` 已修 ｜ `[ ]` 待修

---

## 已修（`17657205` fix(tty): 状态胶囊归属跟着活动标签；补契约返回值与文档）

- 状态胶囊是一个全局槽位、`ready`/`exit`/`error` 三帧无条件写入，关标签 / 切标签不重算
  → 后台标签的失败顶掉活动标签状态，「窗口关了红字不消失」。已改为按标签归属
  （`client-src/status-line.js` + `setTabStatus`/`setPanelStatus`/`syncStatusToActiveTab`）。
- 产物 `client.js` 落后于 `client-src`（修复在浏览器侧完全无效）→ 已重建。
- `eventOwnsStatus` 零测试 → 补 3 条用例。
- `closeModal` 不清 `statusSid`、`respawnEmbedded` 让 `activeSid` 悬垂 → 已闭合不变式。
- `ttyTerminal.open` 新建路径漏 `return`（契约 v3 承诺返回被打开的标签）→ 已补。
- README 英文漏同步该语义、契约版本表停在 `ttyTerminal 2 / ttyPanel 1` → 已同步为 3 / 2。

---

## P0 · 会毁数据 / 静默给 agent 错数据

- [x] **D01 SFTP 覆盖上传非原子，失败即毁原文件** —— `flags:'w'` 先截断同名文件，全程无临时文件
      + rename；清理只在已废弃的 `req.on('aborted')` 时发生 → 远端磁盘满 / 权限中途丢失 /
      通道断 / 客户端非 abort 断连 = 原文件被截断且半截新文件无人清理（静默数据丢失）。
      证据：[src/sftp.ts:343](src/sftp.ts#L343)、[src/index.ts:2712-2720](src/index.ts#L2712-L2720)；
      `sftp_write` 同型 [src/index.ts:3329-3332](src/index.ts#L3329-L3332)。✅ 复读
      修法：写 `path + '.dsh-part-' + randomUUID()`，`await done` 后 rename 覆盖；失败 / 取消统一
      unlink；清理判据改 `req.destroyed === true || !req.complete || controller.signal.aborted`。
- [x] **D02 目录直传跟随符号链接 → 目录环无限递归** —— `sftp.stat`（跟随软链，lstat 才不跟随）判
      目录后递归，`estimateBytes` 同样无条件递归且不检查取消；本机侧 `fsStat` 也跟随 → 远端
      `current -> .` 这类环（构建产物 / 部署目录常见）会让 job 永远 `running` 并逐层建目录，
      直到 ENAMETOOLONG 或磁盘被灌满。证据：[src/sftp.ts:408-419](src/sftp.ts#L408-L419)、
      [src/sftp.ts:493-505](src/sftp.ts#L493-L505)、[src/sftp.ts:369](src/sftp.ts#L369)。✅ 复读
      修法：改 `lstat` / 复用 `readdir` 的 attrs，按 `isDirectory() && !isSymbolicLink()` 下钻；
      `(dev,ino)` 已访问集合或最大深度兜底；`estimateBytes` 传入并检查 signal。
      附：`src/sftp.ts:402` 的注释「远程符号链接按文件下载（跟随目标）」与实现不符，需一并订正。
- [x] **D03 SSH 明文口令落浏览器存储** —— `password`/`passphrase` 随 `spawnSpec` 进
      `sessionStorage['dsh-tty:tabs']`；勾了 tmux 持久化（默认跟随全局开关）再进
      `localStorage['dsh-tty:persist-specs']` → 与 README「凭证不落盘、值归凭据存储」相悖，
      同源脚本可读。
      证据：[client-src/index.js:3009-3013](client-src/index.js#L3009-L3013)、
      [client-src/index.js:820-824](client-src/index.js#L820-L824)、
      [client-src/index.js:842-848](client-src/index.js#L842-L848)、
      [client-src/index.js:2737](client-src/index.js#L2737)。
      修法：持久化前按白名单剥离敏感字段（只留 `env:` 引用 / 连接簿名）；恢复时要求重新输入。
- [x] **D04 `tty_capture{last:true}` 无在途信号 → agent 拿到上一条命令的结果** —— 只读
      `shellState.lastCommand`、不看已存在的 `shellState.inCommand`；`tty_send` 后立刻 capture
      时返回形状正常的旧结果，agent 无从察觉。证据：[src/index.ts:2991-2997](src/index.ts#L2991-L2997)、
      [src/index.ts:498-510](src/index.ts#L498-L510)。
      修法：返回值带 `inProgress`（或 D 未到时报 `stale:true`）。
- [x] **D05 两处截断方向相反，恰好丢最近输出** —— `lastCommand.output` 在
      [src/index.ts:576](src/index.ts#L576) 保尾，随后 [src/index.ts:2996](src/index.ts#L2996)
      又 `slice(0, 128K)` 保头；`tty_screen` 同病 [src/index.ts:3038](src/index.ts#L3038)
      （宽屏时丢屏底，而 `:3037` 刚 pop 掉尾部空行说明末尾才是有效区）。
      修法：统一改为尾部截断 `slice(-N)`。

## P1 · 会挂死 / 会泄漏 / 会误判

- [x] **D06 在途 spawn 不与 WS 连接绑定 → 僵尸会话** —— 会话在 `await spawnTerminal/spawnSsh`
      **之后**才进本连接 `local` 表，而 `cleanupAll` 只遍历该表 → 断线发生在 spawn 在途时
      （刷新 / HMR / 抖动，SSH 建链窗口很大），会话被注册成「绑死已关闭的 ws + `orphanedAt`
      永为 null」：回收器永不扫到（PTY + xterm-headless + maxSessions 名额永久泄漏），重连后
      attach 被拒并谎报「会话已连接到其它窗口」。证据：
      [src/index.ts:1395-1442](src/index.ts#L1395-L1442)、[src/index.ts:1497-1548](src/index.ts#L1497-L1548)、
      [src/index.ts:1181-1204](src/index.ts#L1181-L1204)、[src/index.ts:1411](src/index.ts#L1411)、
      [src/index.ts:1628-1631](src/index.ts#L1628-L1631)、[src/index.ts:947](src/index.ts#L947)。✅ 复读
      修法：create 闭包 await 后判 `ws.readyState !== OPEN` → 立即 destroy 或转孤儿；给非 tmux
      会话补 `pendingSpawn` 在途登记（现在只有 tmux 维度）。
- [x] **D07 `session.clients` 只用 clientSid 做键 → 跨连接互相踩** —— 浏览器「复制标签页」/ 会话
      恢复会复制 sessionStorage（含同一 sid）：后到者覆盖前者绑定（前一个窗口收不到输出但还能
      输入，看起来「卡死」），且前者关闭时删掉的是后者的绑定，两窗口一起断流。
      证据：[src/index.ts:1247](src/index.ts#L1247)、[src/index.ts:1633](src/index.ts#L1633)、
      [src/index.ts:1187](src/index.ts#L1187)、[client-src/index.js:1138](client-src/index.js#L1138)。
      修法：键改 `${connId}:${sid}`（或值存 `{ws, connId}`）。
- [x] **D08 `reconnectGraceSec` 热改为 0 后老孤儿永不回收** —— `reapOrphans` 在 `graceMs <= 0`
      时直接 return，而孤儿只在「断开瞬间 grace > 0」时产生 → 已存在的孤儿永久占 PTY 与名额，
      满额后新标签一直报「会话数已达上限」直到重启 dsh。
      证据：[src/index.ts:943-944](src/index.ts#L943-L944)、[src/index.ts:1194-1199](src/index.ts#L1194-L1199)、
      [src/index.ts:861-863](src/index.ts#L861-L863)。
      修法：grace 变 0 时立即回收现有孤儿；`reapOrphans` 改为 `graceMs<=0 → 立刻回收全部`。
- [x] **D09 `kill` 帧缺「孤儿」前提，可杀任意活跃会话** —— 注释写的是「前连接已断的孤儿也允许
      kill」，代码只查全局表、不看 `clients.size` → 任意 loopback 连接（含失效旧 sid、本地脚本）
      凭 sid 就能 SIGKILL 别的窗口正在跑的构建 / 长任务。证据：[src/index.ts:1591-1602](src/index.ts#L1591-L1602)。
      修法：加 `orphan.clients.size === 0` 前提，否则回 error 帧。
- [x] **D10 `tty_expect` 的 acc 无界增长 + 并发无上限** —— `acc += decoder.write(chunk)` 从不裁剪
      （只对 `hay` 做 16KB 截断），600s 上限内对刷屏会话可涨到数百 MB；每次调用新增一个
      StringDecoder + 常驻 `data` 监听，≥10 并发触发 MaxListenersExceededWarning。
      证据：[src/index.ts:3095-3101](src/index.ts#L3095-L3101)、[src/index.ts:3086-3112](src/index.ts#L3086-L3112)、
      [src/index.ts:3079-3080](src/index.ts#L3079-L3080)。
      修法：acc 改尾部窗口（如 64KB）；对同一会话在途 expect 数 / 监听器总数设上限。
- [x] **D11 `spawnSsh` 的 channel Promise 无超时兜底，可永久挂起且无取消入口** ——
      `readyTimeout` 只覆盖到认证成功；对端不响应 channel-open（堡垒机 / 连接数受限 sshd）时
      `await` 永不 settle，连接活着、keepalive 正常，用户端「Connecting …」常驻且拿不到 handle
      去取消。证据：[src/ssh.ts:348-462](src/ssh.ts#L348-L462)、[src/ssh.ts:237](src/ssh.ts#L237)。
      修法：给 channel 打开加 10~15s 计时（与 `:427` tmux 探测一致），超时 `conn.end()` + 明确报错。
- [x] **D12 known_hosts 导入 → 假 MITM 告警并拒绝连接** —— 每 `host:port` 只留文件中第一条指纹
      （`known-hosts.ts`），存储侧同样只按 host:port 存一条；而 ssh2 默认表优先协商 ed25519 →
      老机器 known_hosts 里 RSA 行在前时，导入后连接必然指纹不符，报「可能是中间人（MITM）冒充」
      并直接拒绝，把用户引导去**删除钉扎记录**（反而把安全基线降回 TOFU）。
      证据：[src/known-hosts.ts:108-114](src/known-hosts.ts#L108-L114)、[src/ssh.ts:290-298](src/ssh.ts#L290-L298)、
      [src/ssh.ts:440-442](src/ssh.ts#L440-L442)。
      修法：`HostKeyRecord` 改多指纹集合，任一命中即放行（同算法项替换）；README 已知限制同步改写。
- [x] **D13 SFTP `pipeCounted` 每搬一个文件挂一个永不摘除的 abort 监听器** —— 整个任务共用一个
      `AbortController`，`options` 递归传给每个文件 → N 文件 = N 个常驻监听器（取消时 N 个同时
      `destroy()` 已结束的 PassThrough）。证据：[src/sftp.ts:455-460](src/sftp.ts#L455-L460)、
      [src/sftp.ts:524-534](src/sftp.ts#L524-L534)。（Node 的告警文案 待验证）
      修法：`try { await pipeline(...) } finally { signal.removeEventListener('abort', abort) }`。
- [x] **D14 帧输入零校验** —— `resize` / spawn 尺寸用 `Number(msg.cols) || 80`，`-5`、`1.5`、`1e9`
      都当有效值透传给 node-pty ioctl 与 xterm-headless（`handle.resize` 还在 try 之外）；
      `input` 帧无长度上限（对照 `sanitizeCommand` 的 2000）；`WebSocketServer` 未传 `maxPayload`
      → 吃 ws 默认 100 MiB，`JSON.parse` 再复制一份。
      证据：[src/index.ts:1571-1579](src/index.ts#L1571-L1579)、[src/index.ts:1566](src/index.ts#L1566)、
      [src/index.ts:973](src/index.ts#L973)、[src/index.ts:1398-1403](src/index.ts#L1398-L1403)。
      （`1e9×1e9` 是否真能 OOM 待验证）修法：`clampInt` + input 上限 + `maxPayload: 1 << 22`。
- [x] **D15 隧道不会收敛** —— ①连接簿条目被删 / 改名后 `resolveBook` 返回 undefined 只走
      `scheduleRetry`（无最大次数），进入「每 ≤15s 建一次」的永久失败循环；
      ②`stopTunnel` 不持有活跃 socket/channel，只 `conn.end()` 并手写 `connections = 0`，停用 / 改规格
      时的在途转发不可见、不可控；③`onLocalConnection` 的 `forwardOut` 出错分支 `socket.destroy()`
      后没有对应减计数（计数虚高，被 stop 归零掩盖）。
      证据：[src/tunnels.ts:214-218](src/tunnels.ts#L214-L218)、[src/tunnels.ts:374-391](src/tunnels.ts#L374-L391)、
      [src/tunnels.ts:68-86](src/tunnels.ts#L68-L86)、[src/tunnels.ts:182-206](src/tunnels.ts#L182-L206)、
      [src/tunnels.ts:333-340](src/tunnels.ts#L333-L340)。
      修法：条目缺失判配置级 fatal（`orphan` 文案，不再重试）；runtime 增 `live: Set<socket|channel>`，
      `connections` 由集合大小派生。
- [x] **D16 SSH 认证与错误文案误导** —— ①`env:VAR` 解析到**空串**时被当成「未设置」，报错指向
      错误原因（用户去新建同名引用仍失败）；②`agent` 认证缺 `SSH_AUTH_SOCK` 预检（`probe.ts` 有
      现成判断却不导出），只落到 ssh2 的 `All configured authentication methods failed`；
      ③终端路径与隧道路径都直接透传 ssh2 原始英文，而同仓库 `probe.ts` 已有 `classifyError`。
      证据：[src/ssh.ts:182-199](src/ssh.ts#L182-L199)、[src/ssh.ts:244-245](src/ssh.ts#L244-L245)、
      [src/probe.ts:170-174](src/probe.ts#L170-L174)、[src/probe.ts:55](src/probe.ts#L55)、
      [src/ssh.ts:442](src/ssh.ts#L442)、[src/tunnels.ts:263](src/tunnels.ts#L263)。
      修法：拆分「值为空」与「不存在」两种文案；`assertAgentAvailable` 复用到 `buildConnectConfig`；
      `classifyError` 提取导出并统一过一遍。
- [x] **D17 shell 集成的两处静默错误** —— ①bash ≥5.1 数组形态 `PROMPT_COMMAND+=("__dsh_tty_precmd")`
      追加在**末尾**（字符串分支却是前置），前序条目的返回码会污染 `$?` → `tty_capture{last}` /
      `tty_expect` 报出的 exitCode 可能不是用户命令的（zsh `precmd_functions+=(...)` 同理）；
      ②64KB carry 上限装不下 200 行 tmux `capture-pane` 的 base64 快照，超限时整块照常处理，
      残余 base64 片段会混进命令缓冲 → `tty_capture{last}` 返回垃圾。
      证据：[src/shell-integration.ts:216-227](src/shell-integration.ts#L216-L227)、
      [src/shell-integration.ts:120-121](src/shell-integration.ts#L120-L121)、
      [src/index.ts:546-552](src/index.ts#L546-L552)、[src/index.ts:560-571](src/index.ts#L560-L571)。
      （退出码污染程度、行宽阈值 待验证）修法：两处都改前置；carry 上限提到快照量级或识别 `133;T;`
      后按「丢弃到终结符」处理。

## P2 · 客户端行为与边界

- [x] **D18 关活动标签可能选中嵌入式会话 → 面板空白** —— `[...tabs.keys()].pop()` 取最后插入的 key，
      而 `tabs` 里同时装着 dsh-docker 挂进来的嵌入会话 → `activeSid` 变成嵌入 sid：标签栏无
      `data-active`、普通终端全 `display:none`（看起来是空面板）、连接栏与胶囊描述一个不在标签栏里的
      会话。证据：[client-src/index.js:1250-1254](client-src/index.js#L1250-L1254)、
      [client-src/index.js:1311-1317](client-src/index.js#L1311-L1317)、
      [client-src/index.js:1656-1660](client-src/index.js#L1656-L1660)。✅ 复读
      修法：只在 `embedded !== true` 的标签里选邻居；`switchTab` 拒收 embedded sid。
- [x] **D19 `afterSocketOpen` 无并发 / 代际守卫 + `restoreTab` 不去重** —— 两个触发点
      （`socket.onopen` 与 `openModal` 发现 socket 已 OPEN）可在重连窗口内并发跑：轻则同一
      `persistName` 被 `restoreTabAsNew` 双开（两个标签 attach 同一 tmux 会话），重则两次
      `restoreTab(saved)` 用同一 sid 覆盖 → 前一个 xterm/termEl 永不 dispose（幽灵 DOM 叠在终端上）。
      证据：[client-src/index.js:4754](client-src/index.js#L4754)、[client-src/index.js:4892](client-src/index.js#L4892)、
      [client-src/index.js:5140](client-src/index.js#L5140)、[client-src/index.js:1135-1154](client-src/index.js#L1135-L1154)。
      修法：加 `recovering` 守卫或 socket 代际号；`restoreTab` 加 `if (tabs.has(saved.sid)) return`。
- [x] **D20 `waitFrame` 把监听挂在全局 socket 上** —— `onMsg` 挂到当次 socket，但清理分支
      `socket.removeEventListener(...)` 读模块级变量 → 等待期间发生 `connect()`（先 close + 置 null
      再新建）则解绑落空、旧监听留下且必然 `resolve(null)`，恢复流程误判「宿主一个会话都没有」，
      对可重跑标签走 `restoreTabAsNew` 双开（与 D19 叠加）。
      证据：[client-src/index.js:884-905](client-src/index.js#L884-L905)、[client-src/index.js:4859-4865](client-src/index.js#L4859-L4865)。
      修法：`const ws = socket` 捕获局部引用，resolve 前判 `ws === socket`。
- [x] **D21 最小化终端面板会取消在途 SFTP 传输** —— `minimizeModal()` 调 `closeSftpDialog()` →
      `cancelActiveTransfer()` + `pane.dispose()`，与挂载位契约注释「面板最小化 / 恢复跟着走，
      消费者不需要做任何事」冲突 → 用户只是想看别的窗口，上传被中断、远端留半截文件（服务端按
      取消处理）。证据：[client-src/index.js:5175-5180](client-src/index.js#L5175-L5180)、
      [client-src/index.js:4662-4674](client-src/index.js#L4662-L4674)、
      [client-src/index.js:1413-1415](client-src/index.js#L1413-L1415)。
      修法：最小化只收浮层，SFTP 交给 dock 显隐；确需关闭时在文档里写清。
- [x] **D22 状态条最小化期间不停表、`refitActiveTab` 无 minimized 守卫** —— 1s 定时器在
      `openModal` 启动、只在 `closeModal` 停止；`refitActiveTab` 不判 `minimized`，而
      `statsBarVisible()` 在最小化返回 false → 最小化瞬间对隐藏容器跑一次 `fit.fit()` 并可能
      `sendResize`（是否算出退化尺寸 待验证）。
      证据：[client-src/index.js:725-728](client-src/index.js#L725-L728)、[client-src/index.js:5074](client-src/index.js#L5074)、
      [client-src/index.js:5334](client-src/index.js#L5334)、[client-src/index.js:667-681](client-src/index.js#L667-L681)。
      修法：minimize/restore 成对开关定时器；`refitActiveTab` 开头 `if (minimized) return`。
- [x] **D23 非 secure context 下剪贴板未判空 → 局域网访问点「粘贴」直接抛错** ——
      `navigator.clipboard.writeText(...)` / `readText()` 都没判空，粘贴处还是**同步取属性**
      （`undefined.readText` 兜不住）→ 用 `http://<局域网IP>:3080` 打开时整条复制 / 粘贴不可用，
      而 localhost 自测发现不了。证据：[client-src/index.js:5107](client-src/index.js#L5107)、
      [client-src/index.js:5112](client-src/index.js#L5112)。
      修法：回退隐藏 textarea + `document.execCommand('copy'/'paste')`，按钮 title 说明降级。
- [x] **D24 键盘可达性缺口** —— 侧栏入口设了 `role="button"`/`aria-label` 却无 `tabindex`、无
      Enter/Space；标签关闭是 `<span class="tt_tabClose">`（无 role/aria/tabindex）；退出浮层是
      `div` + click → 纯键盘用户进不了面板、关不掉标签、重开不了会话（WCAG 2.1.1）。
      证据：[client-src/index.js:5387-5393](client-src/index.js#L5387-L5393)、
      [client-src/index.js:1722-1725](client-src/index.js#L1722-L1725)、[client-src/index.js:1020-1025](client-src/index.js#L1020-L1025)。
      修法：入口补 `tabindex` + keydown；关闭改 `<button>` + `aria-label`；浮层加 `role`/`tabindex`。
- [x] **D25 `sftp_remove` 对根目录 / `..` 无任何护栏**（0.19.0 落地：护栏在
      `SftpManager.remove`——agent 工具与面板 HTTP 路由共用同一道，纵深防御）——
      只做 `trim()`，工具侧只校验非空 →
      `{path:"/", recursive:true}` 或 `"/home/deploy/.."`、`"."` 一次调用即按账号权限整树删除，
      无二次确认、无干跑。证据：[src/sftp.ts:690-715](src/sftp.ts#L690-L715)、
      [src/index.ts:3428-3430](src/index.ts#L3428-L3430)。
      修法：拒绝 `/`、`~`、纯 `.`/`..` 及含 `..` 段的路径（或要求显式 `allowRoot` 二次开关）。
- [x] **D26 下载不存在的路径 / 把目录当文件下载 → 200 + 断流** —— stat 失败被吞（注释「不阻塞下载」），
      ssh2 的 open 错误只落到 `res.destroy()`，而路由已 `writeHead(200)` → 客户端见 `res.ok === true`
      后以 TypeError 结束，状态行显示「Failed to fetch」这类无信息文案；agent 侧拿到裸 ssh2 报错。
      证据：[src/sftp.ts:328-337](src/sftp.ts#L328-L337)、[src/index.ts:2644-2658](src/index.ts#L2644-L2658)。
      附：`src/sftp.ts:702` 把权限拒绝也归因为「非空目录需 recursive」。修法：stat 失败即抛并映射
      404/500 人话；先 `lstat` 判类型，目录直接提示。
- [x] **D27 双栏直传在目标栏路径未解析时会写到宿主 cwd** —— pane 初始 `path: ''`，两栏并发
      `loadDir('')`，而 `pane.path` 只在 list 回包后赋值 → 列表还没回来（或本机 list 失败、path 永久
      留空）时点 ⇨/⇦，`downloadToLocal` 收到相对路径，按宿主进程 cwd 解析（整棵目录树落到 DSH
      安装目录之类的位置），反方向则落到 SFTP 相对目录，且无任何提示。
      证据：[client-src/index.js:3192](client-src/index.js#L3192)、[client-src/index.js:3294-3295](client-src/index.js#L3294-L3295)、
      [client-src/index.js:3619-3620](client-src/index.js#L3619-L3620)、[client-src/index.js:3372](client-src/index.js#L3372)、
      [src/sftp.ts:422-427](src/sftp.ts#L422-L427)。
      修法：路径未就绪前禁用 ⇨/⇦；服务端对空路径兜底 `homedir()` / `realpath('.')`；`joinChild` 空 base 直接报错。
- [x] **D28 Windows 本机栏「..（上级目录）」失效并跳到盘根** —— 只挡住裸盘根，而
      `parentRemotePath` 只按 `/` 切、`index <= 0` 就返回 `/` → 在 `C:\Users\me` 点「..」请求
      `listLocalDir('/')`，从家目录直接跳盘根且再点出不去。
      证据：[client-src/index.js:3347](client-src/index.js#L3347)、[client-src/index.js:3745-3750](client-src/index.js#L3745-L3750)。
      修法：本机栏用独立的本地父级函数（认 `\`、盘根、UNC），别复用 `parentRemotePath`。
- [x] **D29 大目录不虚拟滚动，`sftp_list` 无条目上限** —— `renderRows` 对每条目 `appendChild`
      （每行 3-5 个按钮 + 独立监听器），宿主 `list` 返回全量、`sftp_list` 整体塞进输出（`sftp_tree`
      有 1~2000 限制而它没有）→ 万级条目面板卡死 / 假死，agent 一次调用把几 MB JSON 灌进上下文。
      证据：[client-src/index.js:3345-3366](client-src/index.js#L3345-L3366)、
      [client-src/index.js:4349-4407](client-src/index.js#L4349-L4407)、[src/index.ts:3240-3245](src/index.ts#L3240-L3245)。
      修法：窗口化渲染或截断 +「显示全部」；`sftp_list` 加 `maxEntries`（默认 ~500）与 `truncated`。
- [x] **D30 `sftp_read` 的边界问题** —— 二进制嗅探只看**已读前缀**（>256KB 的二进制前段无 NUL 就
      当文本返回乱码）；UTF-16/32 文本被误判二进制；无 `offset` / 分页（>1MB 永远读不到尾部）；
      `maxBytes` 非法值（0 / >1MB / 非整数）静默回落 256KB；截断处切断多字节 UTF-8 变 U+FFFD。
      证据：[src/index.ts:3275](src/index.ts#L3275)、[src/index.ts:3290-3293](src/index.ts#L3290-L3293)。
      修法：采样 + 非法 UTF-8 比例双重判定；加 `offset`；非法 `maxBytes` 报错；用 StringDecoder 收敛残包。
- [x] **D31 `sftp_list` 出参丢 `isSymlink`/`isFile`** —— `list()` 已算出这两个字段，输出 schema 只留
      `name/isDir/size/mtime` → agent 无法区分「目录」与「指向目录的符号链接」，也预判不了要不要加 `/`。
      证据：[src/index.ts:3216-3230](src/index.ts#L3216-L3230)、[src/sftp.ts:184-190](src/sftp.ts#L184-L190)。
      修法：至少补 `isSymlink`。
- [x] **D32 本机栏列表完全不排序**（远端是「目录优先 + localeCompare」）→ 同一面板左右两栏规则不一致，
      定位文件靠肉眼扫。证据：[src/index.ts:2034-2055](src/index.ts#L2034-L2055)、[src/sftp.ts:191-195](src/sftp.ts#L191-L195)。
      修法：复用同一套排序。
- [x] **D33 状态条在窄窗口静默裁掉右侧条目** —— `display:flex` + `overflow:hidden` +
      `white-space:nowrap`、条目 `flex:0 0 auto` → 溢出直接裁掉，10 个条目都没有 `title`，全文件只有一处
      `prefers-reduced-motion` 媒体查询。证据：[client-src/tty.css:1007-1035](client-src/tty.css#L1007-L1035)、
      [client-src/index.js:636-651](client-src/index.js#L636-L651)。
      修法：`flex-wrap` / 横向滚动 / 聚合 `title`，条目补 `title`。
- [x] **D34 标签持久化载荷无版本字段 + `ready` 帧打断行内重命名** —— `loadPersistedTabs()` 只校验
      `sid`/`spawnSpec` 是对象，没有 schema 版本（结构升级后旧载荷按新语义恢复）；`persistTabs()` 整个包在
      空 `catch` 里（配额溢出静默丢标签）；`ready` 帧里 `renderTabbar()` 全量重建会移除正在输入的
      `.tt_tabRename`，未提交文本丢失。
      证据：[client-src/index.js:868-878](client-src/index.js#L868-L878)、[client-src/index.js:818-832](client-src/index.js#L818-L832)、
      [client-src/index.js:4915-4918](client-src/index.js#L4915-L4918)、[client-src/index.js:1940-1972](client-src/index.js#L1940-L1972)。
      修法：载荷加 `v` 并按版本迁移 / 丢弃；重命名期间延后 `renderTabbar`。
- [x] **D35 三处弹窗用局部 `const setStatus` 遮蔽模块级同名函数** —— `openSshDialog` /
      `openSftpDual` / `openSftpBrowser` 内各有一个同名局部函数，因此
      `2592-2624`、`3153-3593`、`4262-4576` 这些「看似写胶囊」的调用其实写的是弹窗自己的状态行。
      现在没有 bug（声明点之前无调用），但日后在 `4107-4236` 之间插一句 `setStatus(...)` 会命中 **TDZ**
      让整块弹窗崩掉，也让状态归属无法静态判断。
      证据：[client-src/index.js:2582](client-src/index.js#L2582)、[client-src/index.js:3149](client-src/index.js#L3149)、
      [client-src/index.js:4244](client-src/index.js#L4244)。修法：重命名 `setDialogStatus` / `setPaneStatus`。
- [x] **D36 `tunnel_list` 出参 schema 与实现不符** —— schema 声明 `additionalProperties:false` 且只列
      8 个字段，`execute` 却展开整个对象，而 `tunnels.list()` 还带 `enabled` 与 `lastForwardError`；
      `defineTool` 只校验入参 → 运行时不炸，但 PTC(`run_code`) 生成的 TS 类型会漏字段。
      证据：[src/index.ts:3156-3191](src/index.ts#L3156-L3191)、[src/tunnels.ts:144-157](src/tunnels.ts#L144-L157)。
      修法：`execute` 显式挑字段，或把两字段补进 schema。
- [x] **D37 零碎但确凿的四条** —— ①zsh 桩目录缺 `.zlogout`（ZDOTDIR 指过去后用户的退出钩子被静默吞掉）；
      ②Windows 命令标签对非 cmd / 非 PowerShell 的 shell（Git Bash、WSL）一律用 `/c` 而非 `-c`，静默失败；
      ③环形缓冲按**字符**切，可能从 ANSI 序列或 UTF-16 代理对中间开始回放，且 CJK 场景实际可留 ~768KB
      与文档「尾部 256KB」不符；④known_hosts 导入超 500 条静默截断，用户不知道有遗漏。
      证据：[src/shell-integration.ts:177-183](src/shell-integration.ts#L177-L183)、
      [src/shell-integration.ts:322-326](src/shell-integration.ts#L322-L326)、[src/index.ts:1732](src/index.ts#L1732)、
      [src/known-hosts.ts:113](src/known-hosts.ts#L113)。

## P3 · 工程与文档

- [ ] **D38 宿主半体与浏览器半体在 CI 里零自动化**（**部分完成**：`test/host-smoke.test.ts` 已让
      CI 至少 import 宿主插件模块 + 回归 D16 的凭据/预检文案，CI 也已挂产物闸门与端到端脚本，见 D39；
      但 tunnels、SFTP 路由、credential-refs 路由、agent forwarding、帧协议、会话生命周期、客户端接线
      仍无系统性覆盖）——
      （`test/` 1057 行 vs `src` 7357 行 + `client-src` 7011 行）→ 帧协议、会话生命周期、tmux、SFTP 路由、
      隧道、状态条采集、整块 UI 的回归静默通过。证据：[test/](test/)、[.github/workflows/ci.yml](../../.github/workflows/ci.yml)。
- [x] **D39 CI 不跑旗舰脚本，也没有「产物与源码一致」闸门** —— `integration.mjs`、
      `ssh-smoke.mjs`、三个 smoke 都不在 CI（它们自包含，不依赖真实 sshd / 外部主机，本地实测全绿）；
      `client.js` 落后于 `client-src` 这种情况没有任何检查能发现（`ci.yml` 的 `git diff --exit-code`
      只覆盖 4 个聚合文件）。
      证据：[.github/workflows/ci.yml:56](../../.github/workflows/ci.yml#L56)、[scripts/client-lint.mjs:45](../../scripts/client-lint.mjs#L45)。
      修法：CI 加「重建后对 `packages/*/client.js` 做 diff 检查」+ 挂 integration / ssh-smoke / 三个 smoke。
- [x] **D40 `integration.mjs` 的失败信息掩盖真因** —— 受限环境里 PTY spawn 被拒时（`posix_openpt
      failed: Operation not permitted`），用例只显示「等待ready超时；已收文本: ""」，排查者会误判成插件 bug。
      证据：[scripts/integration.mjs:104](scripts/integration.mjs#L104)。
      修法：ready 超时分支一并打印 `error` 帧 / spawn rejection。
- [x] **D41 三个 smoke 脚本无 npm script、README 零提及** —— `probe-smoke`(7/7)、
      `probe-route-smoke`(9/9)、`sftplimits-smoke`(6/6) 手工可跑且全绿，但没人跑。
      证据：[package.json](package.json) 的 `scripts` 段。
- [x] **D42 发布 `files` 不含 `scripts/`，但 package.json 仍 advertise 它们** —— 装了包的人
      `pnpm --filter @hyzyn/dsh-tty integration` 必 ENOENT（`integration`/`probe`/`preview`/`ssh-smoke`/`tui`/`live`）。
      证据：[package.json](package.json) 的 `files` 与 `scripts`。
      修法：随包发 `scripts/`，或从发布清单里移除 dev-only 条目。
- [x] **D43 `preview.mjs` 默认重建 `client.js`（隐式写入库产物）** —— 默认走 build（`--no-build` 才跳过），
      且夹具还读 `packages/docker/client.js`（当前也处于未提交状态）→ 跑一次 `pnpm preview` 就可能悄悄
      改掉必须入库的文件。证据：[scripts/preview.mjs:209](scripts/preview.mjs#L209)、
      [scripts/preview.mjs:211-212](scripts/preview.mjs#L211-L212)、[scripts/preview.mjs:446](scripts/preview.mjs#L446)。
      修法：默认 `--no-build`，发现产物落后就报错；README 写明隐含行为。
- [x] **D44 文档漂移** —— ①两个 README 共 8 处写「0.18.4」，而实际发布与 `package.json` 是 0.18.3
      （`README.md:231,571,702,707`、`README.en.md:255,619,742,749`）→ 下次发 0.18.4 会撞号；
      ②`README.md:677` / `README.en.md:716` 写 tui 冒烟验的是 vim/nano，实际是 vim/htop，且未写
      「需先起 dsh web」与默认端口 3090（`live.mjs` 是 3080）；③`README.md:86` / `README.en.md:91`
      硬编码产物 12 312 246 字节，仓库里无此尺寸文件且每次重建都变。
- [ ] **D45 无测试的关键路径**（**部分完成**：`env:` 引用的空值/缺失区分、凭据 provider 链路、
      auth=agent 预检已有回归用例，见 `test/host-smoke.test.ts`；`endOnPageClose`、Windows 端到端、
      agent forwarding 转发链路、credential-refs HTTP 路由仍零覆盖）——
      `endOnPageClose` 无任何覆盖；Windows 端到端只在单测里验证启动计划
      字符串（README 自述为人工在 Win11 ARM 上验过）；`agent forwarding` 的转发链路只测了字段校验；
      凭据存储 / `env:` 引用 / `/api/dsh-tty/credential-refs` 路由零测试。
      证据：[src/index.ts:2453](src/index.ts#L2453)、[test/probe.test.ts:59](test/probe.test.ts#L59)。

---

## 功能缺口（不是缺陷，另立计划）

- 跳板机（ProxyJump / ProxyCommand）：`ssh-config.ts` 明写忽略、`buildConnectConfig` 从不设 ssh2 的
  `sock`；企业内网主机几乎都靠 bastion。**短期至少做到**：导入时跳过依赖跳板机的块并提示，
  不要静默产出一条注定 20s 超时的连接簿条目。
- agent 侧没有 `tty_open` / `tty_close`：现在只能 list/capture/screen/expect/send，开与关都得用户
  在面板里点；README「与 bash 工具同权」这句话需要订正。
- 隧道没有 agent 侧 start/stop（只有 `tunnel_list`，启停全在设置卡片）。
- SFTP 双栏：拖拽上传、排序 / 隐藏文件开关、大目录虚拟滚动、断点续传 / 增量（跳过两侧 size+mtime 相同的文件）。
- 状态条窄屏布局；WebGL 上下文丢失后的重试恢复；磁盘多挂载点。
- `HostKeyAlias` / 别名参与 TOFU 定位（可搭 D12 的 schema 改动一起做）。

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
- 原四处 **待验证** 项的处置（见头部注记）：D13 / D14（abort 监听器告警、`1e9` OOM）随修复从结构上
  消除（监听器固定摘除、尺寸统一 clampInt）；D17 两处按修法落地——钩子改为前置挂载、carry 上限
  提到 512KB，桩内容有 `test/shell-spawn.test.ts` 单测钉住，不再依赖实测阈值。
