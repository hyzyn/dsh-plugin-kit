# @hyzyn/dsh-tty 路线图（待办）

> **待办在 § 待办；「已经发生的事」分两处** —— 缺陷编号与逐条症状在 [DEFECTS.md](./DEFECTS.md)，
> 功能的落点 / 门槛 / 逐轮实测在本文 [`## 已完成（落点 + 门槛）`](#已完成落点--门槛)。
> 从 DEFECTS.md 的「待办 / 路线图」一节原样拆出（2026-09-25），**没有删减任何一条**——
> 包括原文里 2026-09-20 复核时逐项标注的「已经做掉的 / 仍缺的」。
> 缺陷仍按 `Dxx` 编号记在 DEFECTS.md 的索引表里；本文每一项在动手前先转成可验收条目
> （做完回填「落点 + 门槛」），不要只停留在规划里。
>
> **2026-09-25 分档**：跳板机一项**要同时改 tty 与 docker 两套连接构造**，已按
> [docs/conventions.md 的边界判据](../../docs/conventions.md#l0--l1-的边界判据)上提到项目级
> [ROADMAP.md](../../ROADMAP.md)（两包原文都在那里逐字保留）。本文只留「改 tty 一个包就能做完」的项。

## 待办（8 项 + 2 条待定性缺陷）

> 下面 8 条是**规划**，不是缺陷——单人项目不另开 Issue，待办就记在这里，做完打勾。
> 新发现的缺陷也接着编号记在本文，不要只留在对话里。
> **2026-09-20 复核**：7 条中 2 条已被部分做掉（SFTP 双栏、状态条与图元边界，已在原地逐项标注
> 「已经做掉的 / 仍缺的」），1 条已整条做掉（agent 侧 `tty_open` / `tty_close`，见下方标注），
> 其余 4 条**截至 2026-09-20**与代码现状一致；其后（D62–D94）未再逐项复核，动手前请自己核一遍。
> **2026-10-06 复核 + 收口**：又整条做掉 2 项（隧道 agent 侧 start/stop、`HostKeyAlias`）与
> D60 的第二半（tmux socket / 运行时目录的 profile 维度），SFTP 双栏又补上拖拽上传、隐藏
> 文件开关与面板下载续传；逐项的「已做 / 仍缺」都在原地标注，落点与门槛见
> [§ 已完成](#已完成落点--门槛) 的 2026-10-06 一节。
> **2026-10-06（当日晚些）**：D60 的**前半**「保存隧道时探测端口占用」做完（0.26.0），
> 见 § 已完成 的 0.26.0 一节；该条待办只剩「复制 profile 时错开端口」（那半要动 profile 包）。
>
> **2026-10-04 追加的那条不属于上面 7 项**：它是**已观测到的缺陷**（`windows-smoke` 原生崩溃），
> 但因为**只观测到 1 次、未定性**，按本仓「先记账、复现够了再动手」的纪律暂不进
> [DEFECTS.md](./DEFECTS.md) 的索引表（那张表要求 `待修 == 0`，进表就意味着已修）。

- **机器级资源的 profile 维度（D60）** —— 复制 profile 会把固定端口（webserver / 隧道
  `localPort`）一并拷走，且 tmux socket（`-L dsh-tty`）全 profile 共用。**2026-10-06 部分落地**：
  tmux socket 与运行时资产目录已按 profile 隔离（见 [§ 已完成](#已完成落点--门槛)）。
  **2026-10-06 再落地一半**：保存隧道时探测端口占用已做（见同节的 0.26.0 小节）——
  **仍待做**：复制 profile 时自动错开/停用隧道端口（或只提示）。**这一半要动
  `packages/profile` 的 `copyProfile`**，按 [边界判据](../../docs/conventions.md#l0--l1-的边界判据)
  其实够格上提项目级，只是原文一直留在本包——动手前先定归属。
  *（2026-09-24 新增）*
- **agent 侧没有 `tty_open` / `tty_close`** —— ✅ **已做（0.20.0）**：`tty_open` 开本地会话
  （可带 `command` / `persistName`），`tty_close` 关自己开的；agent 开的会话是**面板里的普通
  标签**（用户可见可接管），并豁免孤儿回收（理由见 [DEFECTS.md](./DEFECTS.md) §2.2「设计决定：agent 自开终端」）。同时补了
  `tty_stats`（CPU/内存/磁盘/网络/温度）。README「与 bash 工具同权」已订正为「16 个工具 +
  开/关能力，但关不掉用户的标签」。**（2026-10-01：`tty_run` 加入后为 17 个，见本文末尾
  「agent 单会话闭环」一节。）**
- **隧道没有 agent 侧 start/stop** —— ✅ **已做（0.25.0）**：补 `tunnel_start` / `tunnel_stop`
  两个工具（共 19 个）。两者**改配置**而不是只改运行态——与卡片上那个勾走同一条路
  （settings 热应用 → `reconcile`），所以「配置是唯一真相源」这条不变量仍然成立，不会出现
  「agent 停了、下次改配置又自己回来」。落点与门槛见 [§ 已完成](#已完成落点--门槛)。
- **SFTP 双栏交互** —— **已经做掉的**：本机栏排序（D32，与远程栏同一套「目录优先 +
  `localeCompare`」）。**2026-10-06 又做掉两项**：双栏内拖拽上传（此前全仓只有**一处**
  `drop` 处理器，属于单窗体）、隐藏文件开关；面板下载的**断点续传**也接上了（宿主侧
  `openDownload` 的 `offset` 从 0.19.0 就有，只是路由没接）。**仍缺的**：双栏直传的
  「跳过两侧 size+mtime 相同的文件」增量（服务端直传那条路仍然整份重传）。大目录**已有截断
  渲染兜底**（`RENDER_CAP = 500` + 「其余 N 项未渲染」提示；`sftp_list` 亦有默认 500 的
  `maxEntries`），真正的虚拟滚动仍未做。
- **状态条与图元边界** —— **已经做掉的**：状态条窄屏布局（D33，改为横向滚动看右侧条目）。
  **仍缺的**：WebGL 上下文丢失后的重试恢复（xterm 自身只回退 DOM，无 `contextlost` 处理）；
  磁盘多挂载点（仍固定取 `/`，Windows 取系统盘）。
- **`HostKeyAlias` / 别名参与 TOFU 定位** —— ✅ **已做（0.25.0）**：`SshSpec.hostKeyAlias`
  只改主机密钥**记在哪条记录里**，不改连接地址；`~/.ssh/config` 的 `HostKeyAlias` 照原样
  导入。四个连接点（终端 / SFTP / 隧道 / 探针）共用 `hostKeyIdentity()` 一个键推导。
  落点与门槛见 [§ 已完成](#已完成落点--门槛)。
- **客户端接线进 CI**（D38 遗留，单独立项）—— `preview.mjs` 的 45 个界面场景需要 Chrome：要么加一个
  带浏览器的 CI job，要么继续把 UI 纯逻辑外抽成可单测模块。*（复核：CI 仍未跑 `preview.mjs`；
  「外抽」这条路又多了三个——0.25.0 落地的 `download-resume` / `sftp-view` 带 25 条单测，
  这类模块现共 8 个：`stats-bar` / `status-line` / `dock-owner` / `current-session` /
  `fit-size`（D79 新增）/ `download-resume` / `sftp-view` / `tunnel-edit`，各有同名测试文件）*
- **快命令的标签性价比（`tty_run` 默认 `keep:false`）** —— 每条 `tty_run` 都会在面板里建一个标签
  （可见＝本仓对 agent 会话的既有承诺，D06 的教训就是隐形会话），而每个标签都会 `createTerminal`
  实例化一个 xterm + WebglAddon：浏览器 WebGL 上下文有配额，标签一多就走 context loss 回退 DOM
  （本包已兜住，但不是零成本）。候选做法是「**活过 ~500ms 才建标签**」——本地定时器 + `exit` 帧
  即可判定，不需要新帧；难点是 `keep:true` 的快命令（跑完就退、但要留给用户回看），那要求把
  `keep` 这个信号从宿主传到客户端。**本轮先不上**：生命周期已由 D97 接死（不攒尸体），
  「闪一下标签」到底烦不烦等真机反馈再定。*（2026-10-10 记，来自 issue #7 的追问）*

**2026-09-25 追加**：`allowProxyCommand` 的提权按项目级 ROADMAP 第 5.1 节收口——只认宿主侧
环境变量 `DSH_TTY_ALLOW_PROXY_COMMAND`（启动时采样一次），HTTP 只能关不能开；未授权时设置卡片
里那个开关点不动 + 附一行说明，「试连」与拨号按**原因**分两条文案（未授权 vs 未启用）。

### `windows-smoke` 在 CI 上原生崩溃（`0xC0000374`，2026-10-04 首次观测，**未定性**）

**症状**：CI 的 Windows 腿上 `pnpm --filter @hyzyn/dsh-tty run windows-smoke` 以
**`Exit status 3221226356`（= `0xC0000374`，Windows 堆损坏 / `STATUS_HEAP_CORRUPTION`）**
退出，**W1–W5 五条断言全部 PASS**，日志里**没有任何 `[W6]` 字样**——即崩在
「W5 结束（`s2.client.close()`）」到「W6 开新 agent 会话（`tty_open`）」之间。

**关键特征（决定了它不是普通断言失败）**：

- **没有 JS 层错误**：没有 `uncaughtException` / `unhandledRejection` / `AssertionError`，
  退出码是**原生**的，说明崩在 ConPTY / node-pty 那一层，不是被测逻辑；
- **不是超时**：脚本有 90s 看门狗（`watchdog`），超时会打 `[watchdog] 90s 看门狗触发`，
  日志里没有；
- **重跑即绿**：同一提交（`f92b6212`）只重跑失败的 job，`dsh-tty Windows smoke` **success**。

**观测记录**：

| 项 | 值 |
|---|---|
| 首次观测 | 2026-10-04，CI run `37170601433`，sha `f92b6212`，job `build (windows-latest)` |
| 之前 5 轮同 job | **全绿**（跑到 W7d，`10/10 PASS`）——最近三轮是 `37166549464` / `37166217406` / `37165747057` |
| 重跑同提交 | **绿** |
| 样本数 | **1 次 / 约 10 轮**（不足以下结论） |

**为什么这次只记账、不改代码**：

1. **样本只有 1 次**。凭一次原生崩溃去改 ConPTY 生命周期就是猜——而本轮已经因为
   「在 macOS 上推演 Windows 行为」错了两次（见项目级 ROADMAP 9.5 / 9.6 那两条修复），
   教训还热着。本仓对 D95 的处理也是同一条纪律：**先记账，复现到足够次数再动手**。
2. **崩点落在原生层**，改 JS 侧大概率打不中。

**一个结构性事实（比这次崩溃本身更值得记）**：nightly 的 **flake 车道跑的是
`ubuntu-latest`**（`.github/workflows/nightly.yml`），而这个 flake 出现在 **Windows 的
ConPTY** 上——**我们建的 flake 车道覆盖不到这个平台的 flake**。要覆盖得让 flake 车道也上
Windows runner（更慢更贵），或把 ConPTY 相关路径单独做一个 Windows 的重复跑车道。

**下次复现时先拿这些证据**（现在崩了只剩一个退出码，连「崩在哪一行」都没有）：

- 崩点两侧的会话状态：W5 的 `s2` 是否真的 `close()` 干净（`try { s2.client.close() } catch {}`
  吞掉了异常，失败时无声）；
- 同时存活的原生句柄数（W1–W5 开了若干 PTY，是否都 `kill` 掉了）；
- 用 `node --stack-trace-limit` / 让 node 打印原生崩溃栈。

**2026-10-04 当天已补上「原生崩溃诊断留痕」**（这一半是**可观测性**，不需要先定性就能做）：

- 新增 [`scripts/lib/crash-trace.mjs`](./scripts/lib/crash-trace.mjs)：`traceSync`（`fs.writeSync`
  直写 fd 1）、`createPhaseTracer`（阶段配对）、`describeCrashPoint`（把人话说清）；
- `windows-smoke.mjs` 在 W1–W7 每个阶段边界插了 `tracer.enter` / `tracer.leave`，
  共 27 处留痕点。

**为什么不能用 `console.log`**（这是本次查出的**根因级**发现）：Node 官方规定
**Windows 上 stdout 到管道是异步的**（Linux / macOS 同步；见 Node 文档 `process.stdout`
的 "A note on process I/O"）。CI 上 stdout 正是管道，于是 `console.log('[W6] …')` 只把字节
交给 libuv 写队列——**进程原生崩溃那一刻队列一起没了**，日志里连 `[W6]` 都看不到。
这与本文件头 D62 记的是**同一件事的另一半**：D62 修的是**正常退出**路径（末尾空串写入做
flush 屏障），而**原生崩溃没有「末尾」**，屏障来不及跑，只能靠**同步写**。

**实测确认的一条硬约束**：**原生崩溃时 `process.on('exit')` 不触发**
（`node -e "process.on('exit',…); process.abort()"` 里钩子从未跑到）。所以第一版
「靠收尾钩子打完整诊断」的设计**在最需要它的场景里失效**——改成**每行 `enter` 自带完整栈**，
最后一行就是完整诊断，不依赖任何收尾代码。`describeCrashPoint` 退居辅助（看门狗、
`uncaughtException`、人肉排查时用）。

**崩溃时 CI 日志长这样**（夹具模拟 2026-10-04 那次的形态，实测）：

```
[trace] +…ms enter｜栈：W5 s2.client.close()
[trace] +…ms leave W5 s2.client.close()（用了 …ms）｜栈：（空）
   ← 最后一行是这个 ⇒ 崩在 W5 之后、W6 入口之前
```

**门槛**：`packages/tty/test/crash-trace.test.ts` 18 条用例（同步写绕开缓冲、
每行自带栈、写失败不成新失败源、阶段配对、`0xC0000374` / `0xC0000005` 认得出来）。

**仍然未做的**（真要做才动）：崩点两侧的会话状态与原生句柄数——那要改被测路径本身，
属于「先定性再动手」，本轮不做。

**若将来确认是 flake 而非真 bug**：按项目级 ROADMAP 9.4 的口径处理（那条讲的是「争用强度
不随机器漂」）；若确认是真 bug，另开 `Dxx` 编号进 [DEFECTS.md](./DEFECTS.md) 索引表
（**注意**：索引表要求 `待修 == 0`，所以只有修好之后才进表，见 `scripts/defects-table.mjs`）。

- **「面板标签整体消失、又自己回来」仍未定性（2026-10-10，观测到 3 轮；只记账，未动手）** —— 现场：
  面板上 4 个标签（3 个 tmux 持久 + 1 个 SSH）在用户**没刷新、没手动关**的情况下整体消失，随后又
  自己回来，**每次回来 PID 都是新的**；同一时刻 agent 侧 `tty_list` 也为空（= 宿主侧注册表真的空了，
  不是渲染问题）；**非 tmux 的标签消失后不回来**。**已排除**：应用 / 宿主重启（宿主 pid 不变）、
  tmux server 崩溃（同一个 server 里还挂着 9/28 起的会话）、会话数超限（`maxSessions=16`，当时
  4–5 条）、**插件自己的配置回写**（volatile-only 变更不重挂插件，见 § 已完成 0.30.0 那节）、
  「tmux 只是 re-attach、内容还在」（`tmux ls` 的 **session created** 显示那三个 attach 的会话就是
  回归那一刻创建的——是**新建**）。**仍缺的恰恰是「谁换了实例」**：重挂插件 / 孤儿宽限回收 /
  客户端侧重建，三种解释都还活着。**下一步**：0.30.0 的生命周期留痕复现一次就能一刀切开——
  `grep '\[dsh-tty\]' ~/.dsh/logs/startup-*.log`。
  *（同日顺带核到一条环境事实，**待定归属**：`dsh --profile test --port 3082` 起的那个宿主里
  `DSH_PROFILE` 是**空的**，于是 tmux socket 是**裸 `dsh-tty`**、与桌面应用共用同一个 tmux server
  与 `~/.dsh/tty/` 资产——D60 的 profile 隔离在这条启动路径上没生效。）*

## 已上提到项目级（不在本文展开）

跳板机（ProxyJump / ProxyCommand）、统一安全围栏、`isConcurrencySafe` 三项都是「要同时改 ≥2 个包」，
按 [边界判据](../../docs/conventions.md#l0--l1-的边界判据)上提到项目级：**落点 / 门槛的原文在那里逐字保留，
本包不复述**——见 [项目级 ROADMAP.md § 已完成](../../ROADMAP.md#已完成落点--门槛) 的**第 2 / 1 / 4 项**。
tty 侧只留三条：

- **D63 / D64 / D65**（做这一轮时挖出来的：导入的四种静默丢弃 / 「连接（并保存）」出口漏带跳板机 /
  SFTP 池条目断线时只摘出池、没关跳板机）；
- 落点一句：`isLoopbackHttp` 删除、收敛成**唯一**闸门 `gateRoute`（kit 的加固档 + 变更端点的同源证明），
  9 个只读工具声明并发安全；
- **仍未做：只有多跳链（明确不做）**——方案与全部坑见
  [docs/proxyjump-plan.md](../../docs/proxyjump-plan.md)（第 6.1 节是 `ProxyCommand` 的闸门定案表）。

**在项目级待办（代码已落地）**：**插件工具接入会话权限档位（tier gate）**——项目级
[ROADMAP.md § 待办](../../ROADMAP.md#待办) 第 10 项（2026-10-07 立项并实施）。本包的分工：全部
agent 工具的档位分类表（`tty_run` / `tty_send` / `tty_open` / `tunnel_start` 归 `exec` 是其中的
关键格子）与 `tools/pre-execute` 接线，已落在 `src/index.ts`（`TTY_TIER_CLASS`）；
决策矩阵、真机验收 V0–V8 与开放决策 R1–R4 的决议都在
[docs/permission-tier-plan.md](../../docs/permission-tier-plan.md)，本文不复述。

## 已完成（落点 + 门槛）

> 已落地的批次按**主题**记在这里：结论 → 为什么（用户原话照录）→ 落点 / 门槛 → 刻意不做的边界。
> 缺陷的症状 / 根因 / 修法仍在 [DEFECTS.md](./DEFECTS.md) 的索引表；逐轮往返的**过程原文**（2026-10-01
> 按主题重排前那一份）冻结在 git 历史：`git show 2f7dd4f1:packages/tty/ROADMAP.md`。
> **版本口径（2026-10-10）**：本页 10-10 那三节曾标的 `0.28.0` / `0.29.0` **没有单独发布**——
> 它们与「会话生命周期留痕」一起作为 **`0.30.0`** 发出去，所以三节标题与 README 里的「从 X 起」
> 标记都统一到 `0.30.0`（`0.28` / `0.29` 在 npm 上不存在，留着会指向没发生过的版本）。
> **已发 0.24.0（2026-10-01）**：`lib/`（`tsc -p tsconfig.json`）与 `client.js` 随包入库（预构建产物）。

### 2026-10-10（续六）：端口转发的「主机:端口」端点组——贴合内容 + 聚焦整组亮（纯客户端半体）

**为什么是这一轮**：用户贴了端口转发编辑表单里那一行 `127.0.0.1 : 本机端口 → 服务器侧主机 : 端口` 的
两张截图（一张宽卡片整行、一张窄处放大），一句话：「**输入框的样式优化一下**」。

**两个症状，同一族规则上的两处成因**（`.tt_tunnelEndpoint` 这一组）：

- **组被行宽抻开**（`flex: 1 1 190px`）：左组三个孩子（静态 `127.0.0.1` / 冒号 / 端口框）**都不增长**，
  于是端口框后面留一片**组内死区**——夹具实测 **463px**；右组的 `.tt_tunnelHost` 是 `flex: 1 1 auto`、
  自己吃掉全部余量，于是冒号 + 端口被顶到卡片右缘、离「服务器侧主机」占位符几百像素。两种症状是同一个
  原因的两面：**组的宽度由行宽决定，而不是由内容决定**。
- **聚焦环被自己的 `overflow: hidden` 裁掉**：本包输入框的聚焦态是 `border-color` + `box-shadow:
  --tt-ring`（2px 外扩），而这一组是 `overflow: hidden` ⇒ 环只剩输入框两侧各一条竖线。用户那两张截图里
  「冒号左边 / 右边多出来的一道线」就是它（两张各拍到一处：一张聚焦在端口框、一张聚焦在 host 框；旁边
  那条细线才是真的光标）——读起来像多了一道分隔线，不像聚焦提示。

**修法**：组 `flex: 0 1 auto` **贴合内容**，host 给确定的宽度基准（`flex: 0 1 220px` + `min-width: 96px`，
窄容器里能缩、不塌），`「跳」`（端点 + 箭头）也改成贴合内容，箭头紧跟在源端点右侧；聚焦环改成**内层
不画、整组亮**（`.tt_tunnelEndpoint:focus-within` 上一条 `--tt-ring`，环画在组自己身上，不会被自己的
overflow 裁）。

**一条实测教训：这半判据不能放在 preview 里。** 第一版把「聚焦时内层不许有环」写成 preview 断言，反向
验证时才发现它**恒绿**：headless 夹具里 `document.hasFocus()` 是 false，此时 `:focus` **压根不匹配**
（实测 `el.matches(':focus') === false`，而祖先的 `:focus-within` 照常匹配）——旧写法下内层输入的环也
量成 `none`。于是这条判据挪到 **CSS 源**上按成对关系钉（`test/tunnel-endpoint.test.ts`），preview 只留
**能真的红**的那半：几何。

**门槛**：`scripts/preview/harness.js` 的 `tunnel-edit` 场景加「**端点组贴合内容**」判据（组宽 − 孩子宽
之和 > 2.5px 即红；数字在采集处冻结，方向切换会重渲表单、DOM 引用会失效）；新增
`test/tunnel-endpoint.test.ts`（5 条：解析自证、组不增长、host 有确定 basis + min-width、**聚焦环成对**
（内层两条 `:focus` / `:focus-visible` 均为 `box-shadow: none`，组 `:focus-within` 为 `var(--tt-ring)`）、
以及一条反例自证——旧写法 `flex: 1 1 190px` 会被同一条判据判为「在增长」）。
**反向验证**（先红后还原、源文件哈希比对）：把 `.tt_tunnelEndpoint` 打回 `flex: 1 1 190px`（其余不动）
→ preview 红「端点组没有贴合内容（组内死区 **463px**）」；同时把内层的 `box-shadow` 打回 `var(--tt-ring)`
→ CSS 单测红「没有把内层输入的环压掉」；还原后 `tty.css` 与改动后逐字节一致（`25a2a319…`），两处都绿。

**刻意不做的边界**：主机格的宽度基准取了 `220px`（够放 `db.staging.internal` 这类名字），端口格仍是
`78px`；**组的高度没动**——组比同排的单个输入框高 1px（外层 0.5px 描边 ×2），但端点行自己独占一行、
没有并排控件可比，那 1px 看不出来，不值得为它引入 `height: 100%` 这类耦合。

**落点**：`client-src/tty.css`（`.tt_tunnelHop` / `.tt_tunnelEndpoint` / `:focus-within` / host 基准）、
`scripts/preview/harness.js`、`test/tunnel-endpoint.test.ts`、README 中英（端口转发的「表单布局」一节）。

### 2026-10-10（续五）：Shell 路径候选表改浮层——下拉不许顶动卡片布局（纯客户端半体）

**为什么是这一轮**：用户截了设置卡片里「Shell 路径」那一栏的图（输入框里是 `/bin/zsh`，正下方多出
一整块候选行），一句话：「**这个选择会挤占空间破坏布局，修复一下**」。

**根因不是新问题，是同一张卡片里的第二张候选表漏改**：模型路由那一轮（见下面
「模型路由——从两栏到一个只读控件」）把 `.tt_routeList` 改成了 `position: fixed` + `placePopover`
的浮层，并在注释里点名 `.tt_shellList` 是**内联**的旧做法；但那一轮只动了模型路由这一处，
`shell` 这一栏的 `.tt_shellList` 还留着 `margin-top: 6px`——它是文档流里的 flex 子项，候选多高就
把下面的 TERM / COLORTERM / 工作目录整段推多远。用户看到的正是这一处（截图里值已是完整路径，
候选被它自己过滤成同一行，于是「就一行」也照样把下面推走）。

**修法（两处，都是「把那张表接进已有的浮层机制」，不发明新机制）**：

- `client-src/tty.css`：`.tt_shellList` 与 `.tt_routeList` 合并成同一条浮层规则（`position: fixed`
  + `z-index` + `max-width` + `--tt-shadow`），只把 `max-height` 留给模型路由单独一档（候选按渠道分组、
  行数多）；`.tt_shellList` 的 `margin-top: 6px` 删掉（偏移由 `placePopover` 的 6px 负责）。
- `client-src/index.js`：定位从「只服务模型路由」的那个 `useLayoutEffect` 扩成**两张表共用**的
  `anchorCardList`（宽度对齐输入框 → `placePopover`），并把 `shellInputRef` / `shellListOpen`
  一起纳进来；deps 里补 `shellOptions` 与 `form?.shell`（候选数据与过滤词都会改变列表高度，
  不重定位就会飘）。

**实测踩到的一个坑（夹具当场抓到，记下来免得下一个人重踩）**：deps 最初写的是 `form.shell`——
`form` 在 `/api/dsh-tty/config` 回来之前是 `null`，卡片挂载那一刻整个组件**崩成空白**（preview 立刻红
`TypeError: Cannot read properties of null (reading 'shell')`）。改成 `form?.shell`。**依赖数组也要按
「这个值可能还不存在」来写**，它不在渲染分支的保护范围里。

**门槛**：`scripts/preview/harness.js` 的 `settings-assist` 场景加一组 Shell 判据——**两种形态都量
「保存」按钮的位移**（值已是完整路径的「同值一行」，与打 `/bin/` 过滤后的 3 行；后者才是内联版推得最狠
的形态）+ `getComputedStyle(候选表).position === 'fixed'` + 点一条候选真的写进输入框（且值确实变了）
+ 进保存 payload + 选中后候选表收起。新增 `settings-shell` 场景**只为出图**（滚到这一栏、打 `/bin/`、
留着列表打开截图——顺带把「滚动后浮层跟着锚点重新定位」那条路也走一遍），场景清单里登记。
**反向验证**（先红后还原、源文件哈希比对）：把 `.tt_shellList` 打回 `position: static`（类名与其余
断言全不动）→ 红「打开 Shell 候选表把卡片布局顶动了 **50px**（同值一行）/ **140px**（过滤后 3 行）」；
还原后 `client-src/tty.css` 哈希与改前逐字节一致。

**刻意不做的边界**：候选的**过滤行为**一点没动——值已经是完整路径时，列表仍然只剩与它同值的那一行
（要换别的 shell 得先改输入框）。这是「浮动之后仍然只有一行」的观感问题，与布局缺陷是两件事；
真要改就该先定「聚焦时给全量候选（当选择器用）还是继续按输入过滤（当自动补全用）」，不在这一轮顺手动。

**落点**：`client-src/tty.css`、`client-src/index.js`（`anchorCardList` / 两张表的 ref）、
`scripts/preview/harness.js`、`scripts/preview.mjs`（场景清单）。

### 2026-10-10（续四）：对标官方「持久终端」的两条借鉴——指引决策化 + 标签「对 AI 不可见」

**为什么是这一轮**：用户截了官方插件页那张「持久终端（实验性）」的图，先问「这个官方插件，和
本仓库的 tty 有啥区别」，接着是「**你看看有什么可以借鉴的，但是不能破坏现有的功能**」。

对照读下来（官方侧是 `dsh-experimental-terminal-bundle` = `dsh-terminal` + `dsh-terminal-bash` +
`dsh-tool-terminal`，6 个 `terminal_*` 工具，页面默认关），**结论是两者不是同一件事的两种实现**：
官方那个是「给 agent 的状态容器」（无界面、用户看不见、进程本地、逐行约定、全屏 TUI 明确排除、
按 agent 隔离），本仓是「用户侧边栏的真终端面板 + agent 共享同一批会话」。所以能借鉴的只有
**做法**，不能借鉴**形态**——下面四条是明确**不抄**的：

- **不拆成两套注册表**：本仓的承诺是「agent 开的会话就是面板里的普通标签，用户可见可接管」
  （[DEFECTS.md](./DEFECTS.md) §2.2 的设计决定，D06 的教训）。官方那种隔离换来的是「用户看不见
  agent 在跑什么」，与本仓的取舍相反。
- **不把会话改成进程本地即丢**：agent 会话豁免孤儿回收是刻意的（否则 dev server 刚起就被秒收）。
- **不照抄「有活跃会话就拒绝改沙箱档」**：用户常年开着好几个标签，那条围栏会直接把「切权限档」
  这个功能废掉。
- **不把 PTY 塞进 `sandbox.confine`**：TUI / tmux / ssh 都走这条 spawn 路径，套进去会碎。

**借鉴一：常驻指引决策化 + 去重（纯文本，零行为变更）。** 官方的指引只有 **308 字符**，而且第一句
就是「只在需要持久终端状态或交互式 stdin 时才用终端；有界的一次性操作优先 shell/read/write/edit」。
本仓这段（`TTY_GUIDANCE`）此前是 **1424 字符**、以「本机已安装 dsh-tty 插件…」开头的**描述性目录**，
且把 `running` 三态、`last:true`、具名 `keys` 这些**已经在各自工具描述里写过一遍**的用法又复述了
一次（同一件事两份真相，改动时必然漂）。改法：决策句提到最前 → 只留工具描述里**没有**的东西
（面板侧能力、SSH/SFTP/隧道/tmux 在哪配、引导话术）→ 补一句官方那句「用完记得关掉不再需要的会话」
（本仓 agent 会话不走孤儿回收，模型不主动关就只能靠 `capExited` 按 16 条兜，正好压在下面那条
「快命令的标签性价比」上）。**1424 → 579 字符（−59%）**，每轮上下文都省在正地方。

**借鉴二：标签「对 AI 不可见」（新增能力，默认不变）。** 官方那条边界是「用户终端输出**永不进**
模型历史」。本仓此前没有对应的选择权：`tty_capture` / `tty_screen` / `tty_send` 能读任意标签，
每轮 prompt 还会把**每个标签的 cwd 与「运行中/空闲」**列给模型——用户想留一条自己的终端（密钥、
私事、与本轮无关的活）没有办法。做法是**加法**：

- **开关**：标签右键菜单新增一项（睁眼/划掉的眼两个图标），走新增的 `hidden` 帧；标签标题加一个
  🙈 字形（标签栏宽度稀缺，整句留给 `title` 与菜单），「⋯」列表共用同一份显示文本。
- **拦截在宿主**（安全边界，客户端过滤只是显示层）：会话记录加 `hiddenFromAgent`，`spawn` / `ssh`
  帧带 `hidden`，运行期由 `hidden` 帧切换；**唯一写入口 `setHiddenFromAgent`** 同时管住
  spawn / ssh / 重绑定三条路。
- **看得见的那一半与看不见的那一半分开**：`listForAgent()` 把这类会话**整条**排除（连在不在、
  cwd、有没有命令在跑都不给——要藏的正是这些），面板用的 `listForAttach()` 照旧全给；
  五个按 sid 取内容的工具（`tty_stats` / `tty_capture` / `tty_screen` / `tty_expect` / `tty_send`）
  一律走 `agentView()`，命中即拒（**明说「被用户设为不可见」而不是伪装成不存在**：伪装会让模型
  换个 sid 重试或以为会话崩了）。
- **只报条数**：每轮 prompt 的会话块在一条都不列时补一句「另有 N 条被用户设为对 agent 不可见」。
  没有这一句，模型会把「列不出来」读成「用户没开终端」，回一句「当前没有终端面板会话」——而用户
  正盯着自己的标签。只给条数、不给 cwd 与活动。
- **两条防退化**：`hidden` 参与 `specReuseKey`（否则点「新建本地终端」会复用那条藏起来的标签）；
  重连后在 `ready` 帧**只重报 true**（`hidden` 帧在断线时会被静默丢掉，而宿主会话在保活期内
  还活着；从不上报 false 是因为隐藏宁可多留一会儿，也不能被另一次重连悄悄解掉）。
- **不给 agent 自己开的会话隐藏**：隐藏是用户对「我的标签」的处置，agent 若能把它的会话藏起来，
  等于把它的行为从用户眼前抹掉（D06 的反面）。判据在 `setHiddenFromAgent`，客户端菜单也不显示。

**没采纳的三条**（记在这里，别当成漏了）：**跨 agent 归属标识**（`owner` 只有 `user|agent`，队友之间
目前能互相操作——但本仓的多 agent 场景里那常常是**有意**的协作，先不动）；**沙箱档变更围栏/审计**
（本仓的 PTY 本就**不受 OS 级沙箱约束**——`subprocess-local` 的 `spawnTerminal` 里 `sandbox` 出现 0 次，
唯一闸门是逐调用档位闸；官方那条围栏是给「会话级沙箱约束」配的，本仓没有那个前提，值得做的只是
把这条边界写进文档）；**前台进程组真信号**（`C-c` 按键已覆盖主路径，且 Windows 上 node-pty 不吃
signal）。

**落点 / 门槛**：`src/index.ts`（`TTY_GUIDANCE`、`TtySession.hiddenFromAgent`、`snapshotOf`、
`listForAgent` / `hiddenCount` / `agentView`、`setHiddenFromAgent`、`hidden` 帧、prompt 块与
`tty_list` 的共用提示文案 `hiddenSessionsNote`）、新增 `client-src/tab-hidden.js`（纯判据）与
`client-src/index.js`（菜单 / 标记 / 回帧 / 重报）、`test/hidden-from-agent.test.ts`（11 条：快照与
两条列表的可见性、帧切换双向、幂等不重复留痕、未绑定会话不可切、`agentView` 拒绝与「取消隐藏
即恢复」、共用提示文案、**工具接线守卫**——`sessions.get(input.sid)` 必须为 0 处、
`agentView(input.sid)` 5 处、`listForAgent()` 2 处）、`test/tab-hidden.test.ts`（8 条，反向验证见
文件头）。`packages/tty` 全套 **58 文件 / 716 用例全绿**；`pnpm -r typecheck`（含 client-lint）与
`build`（`lib/` + `client.js`）绿。

### 2026-10-10（续三）：终端面板头部工具栏收口——去冗余按钮 + 搜索框放得下（纯客户端半体）


**为什么是这一轮**：用户把面板头部截了图，两条诉求的原话是「有些功能多余了」「搜索框宽度不够，
导致 placeholder 显示不全」。

**去掉 复制 / 粘贴 两颗按钮**（用户选定「多余」的就是它们）：终端自己的浏览器原生通路已经覆盖
这两件事——有选中时 `Cmd+C` / `Ctrl+Shift+C` 复制、`Cmd+V` / `Ctrl+V` 粘贴（xterm 把 `copy` 监听挂在
终端元素、`paste` 挂在它的 textarea 上）；而按钮走的是 `navigator.clipboard`，非 secure context
（`http://<局域网IP>:3080`）下反而**更弱**——失败提示里那句「或使用终端自己的快捷键」本来就是在指路。
**清屏保留**：它没有等价的键盘入口（`Ctrl+L` 只清 shell 屏、不清 xterm 回滚缓冲）。死代码一并清掉：
`ICON_COPY` / `ICON_PASTE`、`pasteTerminalText()`、`.tt_iconPasteHole`（粘贴图标那块镂空）与三条
i18n 死键；`copyTerminalText()` 仍在（「AI 辅助」浮层的「复制答案」用它）。

**搜索框放得下**：宽度 190px → `flex: 0 1 240px` + `min-width: 120px`（标签栏才是头部的主弹性项，
这里不抢宽；窄窗口先收缩、不把头部顶溢出——实测 340px 视口仍无横向溢出），placeholder 缩成
`搜索 (Enter ↓ / Shift+Enter ↑)`，完整说法（含 `Ctrl+F`）搬进放大镜的 tooltip。实测（headless
Chrome + `.preview` 夹具）：文案 166px、内容宽 240px、余量 74px；1680 / 560px 视口都不溢出。

**顺带修掉两处「同一件事两个真相源」（已立号 `D99`，索引行 + 三处代码注释都落了号）**（都有截图
证据）：① **点开之后再也点不关**——「开」写的是
空串（撤掉 inline 声明、回落到样式表），读取判据却把空串一并当「关」，于是第二次点击仍判「关着」
→ 又「开」一次；② **亮着的放大镜在骗人**——`data-on` 在面板初始化时被无条件点亮，而 Esc 与最小化
只藏框不摘按钮，README 截图（旧的那张）拍到的正是「框关着、放大镜亮着」那一帧。现在开合态只有一个写入口
（`setSearchOpen`），值本身收在 `client-src/search-state.js`：开态是**可读回**的 `block`（不是空串），
判「开」只认这一个值。

**门槛（本轮新增）**：`test/search-state.test.ts`（7 条）——写入读出往返、空串不再算「开」（就是那次
「点开关不掉」的反例）、「开着 → 关」是真取反、连点两下回到原状态、历史遗留的空串态自愈。
`client-lint` 覆盖新增的 `client-src/search-state.js`。

**边界**：`Ctrl+F`（终端聚焦时唤起）与 Esc 的既有行为不变；清屏语义不变；头部的最小化 / 关闭不动。
README 那张面板截图**已按新形态重拍**（搜索框展开、头部只剩 🔍 / 🗑，见
[docs/dsh-plugin-kit-tty.png](../../docs/dsh-plugin-kit-tty.png)），alt 文案同轮改过。

**同日追加：滚动条贴边**（用户第二轮反馈原话「滚动条可以优化靠边一点吗」，附面板右缘的截图）：
终端滚动条画在 `.xterm-viewport` 自己的右缘，而视口止步于 `.tt_term` 的内容盒——于是它离面板
边缘整整一个水平内边距。截图按 DPR 反算实测：滑块右缘距面板边缘 **15px**（crop 里滑块 8 device
px = 4 CSS px，正是 `::-webkit-scrollbar` 那套皮肤）。修法：把水平内边距提成 `--tt-term-pad-x`，
**只把视口的右边界往外拉**（`right: calc(2px - var(--tt-term-pad-x))`，留 2px 贴边余量），文字
内缩不动——`.xterm-screen` 与视口是兄弟节点，宽度由 `.tt_term` 的内容盒（cols）决定。改后实测：
视口右缘距面板 2px、滑块右缘 5px（was 15px），`.xterm-screen` 仍是 1239×800、`scrollWidth ==
clientWidth`（不长横向滚动条）。**踩到的坑**：外扩那条必须比 xterm.css 的
`.xterm .xterm-viewport { right: 0 }` 更具体——两者同为 (0,2,0)，而注入顺序是
`ttyCss + '\n' + xtermCss`（ensureStyle），同权重下 xterm.css 后写者胜，第一版就被它的 0 顶掉
（实测 computed right 仍是 `0px`），多带一层 `.xterm` 即 (0,3,0)。守卫：`test/scrollbar-skin.test.ts`
新增一条「内缩与外扩同源、余量介于 0 与内边距之间、外扩选择器比 xterm.css 更具体」。

### 2026-10-10（续二）：会话生命周期留痕——「标签自己消失」这类现象先能查（0.30.0）

**为什么是这一轮**：一份外部排查报告（2026-10-10，针对桌面应用与 `dsh --profile test --port 3082`
那个宿主）记录了 § 待办里那条现象。核对下来**观察成立、根因不成立**：报告把「插件把运行态回写
profile patch」当成了重挂的因，而 `hostKeys` / `persistSessions` / `tunnels` 全是 `.volatile()`
字段——`settings.update` **只收 volatile 路径**，loader 对 volatile-only 变更**原地更新引用、不重挂
插件**（`cordis-plugin-loader` 的 `volatileOnly` 分支 + `_commitVolatile`）。真正卡住排查的是**没有
日志**：`console.log('mounted')` 不进任何文件，会话的开 / 关 / 回收**一条都不留**——于是「插件到底
被重挂过没有」这个问题当时无从回答。所以这一轮只做一件事：把生命周期打进 `ctx.logger`（实测落
`~/.dsh/logs/startup-*.log`，`console.log` 不会）。

**落点**：

- **挂载序号放 `globalThis`**（`nextMountSerial`）：HMR 重挂会**重新求值模块**，模块态计数器从 1
  重来，那个号就再也答不了「同一个 pid 里这是第几次挂载」——而那正是它唯一要回答的问题。
- 挂载一行（`插件挂载（本进程第 N 次，pid=…）：持久化=… 断线保活=…s 并发上限=… tmux socket=…`，
  替掉原来那条 `console.log('mounted')`；顺手把 socket 名字打出来——profile 隔离没生效这种事只有
  打出来才看得见）；卸载一行（`插件卸载（本进程第 N 次挂载的实例）：清点 X 个在线会话、Y 个只读
  保留`，**必须打在 `disposeAll()` 之前**——之后表就空了，要清点的是「还剩几条」）。
- 面板**连接 / 断开**各一行；断开那行带「本连接几个会话 → 转孤儿」与**宽限秒数**（读日志的人
  不必回配置里查）。
- 会话**创建**（kind / owner / persistName）与**结束**（code 或 signal）各一行。
- **孤儿回收一条 warn**：`reapOrphans` 改为**返回被回收的会话**，文案与报数同源
  （`reapedOrphansMessage`，导出仅供单测）——不在调用方另数一遍。

**门槛（本轮新增）**：

- `test/lifecycle-log.test.ts`（5 条）：挂载序号在同进程内递增、且**跨 `vi.resetModules()` 重新求值
  仍递增**（真模拟一次 HMR 重挂，而不是靠「两次 `apply`」自证）；卸载清点带实例序号且报「还剩 1 条」；
  会话创建 / 结束带 sid 与 owner / code；回收文案同源。
- `test/host-frames.test.ts`：面板连接 / 断开两行（含保活秒数）；`reapOrphans` 的返回值 = 被回收的
  会话（它是那条 warn 的**唯一数据源**，空了日志只会说「回收 0 个」）。

**反向验证（真做过）**：① 序号改回模块态 → 「跨模块重新求值」那条**红**（`expected 1 to be 4`）；
② 卸载清点挪到 `disposeAll()` 之后 → 「卸载清点」那条**红**（`清点 0 个在线会话`）。两次都改回后复跑绿。

**边界**：**只加日志，行为零改动**（`reapOrphans` 的返回值是新增信息，回收时机与判据一字未动）；
刻意不用 `logger.debug`——它不保证进文件，而这件事的价值全在「事后能查」。**这一步不解决那个现象**，
它只让下次发生时能定性；「谁换了实例」仍记在 § 待办 里。

### 2026-10-10（续）：批量关标签——标签右键菜单 / 「⋯」批量行 / 中键关（0.30.0）

**为什么是这一轮**：用户原话「现在一个个关闭体验不是特别好」，并给了两个候选方案（右键菜单，
或在「+」后面再加一个菜单按钮）。**选了右键、否掉了「+」后面那颗按钮**，三条理由都落在已有代码上：

1. 「关闭其他 / 关闭左侧 / 关闭右侧」必须**以某个标签为参照**（两个方向尤其只有参照物才说得
   通），而「+」是面板级动作（D89 的排版注释原话就是这句），它没有参照物——点开还得再问一次
   「以哪个为准」；
2. 「+」**自己就是一个菜单触发器**（`openAddMenu`）：两个紧挨着、长得一样、内容不同的菜单按钮
   是明确的歧义源；
3. 「⋯」已经承担了可见入口那一半（#7③ 就是为「47 个死标签只能一个一个点 ✕」加的），缺的只是
   它的**出现条件太严**——不溢出、又没有死标签时它整个消失（用户截图那 4 个活标签正是这个状态）。

**同日追加（用户看到菜单后的两条反馈）**：① 第一行改叫「关闭此标签」——原来的「关闭这个标签」容易
被读成「当前标签」，而右键的参照**可以不是活动标签**（用户截图里右键的是「终端 2」、活动标签却是
「终端 3」）；「此」明确指被右键的那一个，英文那句本来就叫 `Close this tab`，一直是对的。
② 补上「关闭左侧标签」，「关闭其他 / 左侧 / 右侧」三行同源。

**落点**：

- 判据抽进纯模块 `client-src/tab-bulk.js`：`bulkClosePlan(list, refSid)` 给出四组目标
  （`others` / `left` / `right` / `exited`）与每组的 `live` / `agentLive` / `confirm`。**嵌入终端与
  无 sid 的条目在模块内滤掉**——不靠「调用方记得先滤」，漏滤就等于替 dsh-docker 关掉它挂进来的
  终端；`left` / `right` 都是**同一处切片**（`slice(0, at)` / `slice(at + 1)`），所以三条批量行必然
  自洽（`others` = `left` ∪ `right`），且**都不含参照自己**；参照不在列表里（活动标签刚被关掉）→
  两侧都空、`others` 为全部。`panelTabCount` 顺带把「标签栏上到底有几个标签」也算在一处
  （`tabs.size` 会把别的插件挂进来的嵌入会话算进去，显隐判据与「⋯」的 title 都改用它）。
- **入口两处、判据一份**：`appendTabActionRows(menu, refSid)` 同时挂在**标签右键菜单**
  （参照 = 被右键的那个）与**「⋯」列表**（参照 = 当前活动标签）；**目标为空的行不出现**
  （参照在头上就没有「关闭左侧」、在末尾没有「关闭右侧」），顺序是「其他 → 左 → 右」，副文案
  写清「其中 N 个还开着」（选词换过一轮，见本节末的「同日再换一次措辞」）。菜单皮肤、
  行构造器（`addMenuItem`）、Esc 捕获、点外收起全部复用既有那套，**零新增 CSS**。
- 右键按**光标**定位（`placePopover` 拆出 `placePopoverAt(menu, rect)`）；键盘触发的
  contextmenu（Shift+F10 / 菜单键）`clientX/Y` 都是 0，那种情况回退到标签自己的矩形，别把菜单
  夹到左上角。**该处刻意不引 dsh-docker 的缺陷号**：编号按包各排一套，在 tty 的代码里写别包的
  `Dxx` 会把两套台账搅在一起——这条是 `scripts/test/defects-table.test.ts` 当场抓出来的
  （写 `docker D64` 之后，那条「把 D63/D64/D65 还原成历史状态」的反例不再变红）。
- 「⋯」的显隐判据再放宽一格：「溢出 **或** 有已退出标签 **或** 标签 ≥ 2 个」。门槛正好停在 2
  ——只剩一个标签时没有可管理的对象（那才是噪音），也因此 D89 的「单标签时『+』紧贴页签」与
  `tab-list` 场景里那条「不溢出时不该可见」**原样成立**（两者量的都是单标签态）。
- 中键 = 关指向的那个标签（`auxclick` + `button === 1`），走同一条 `closeTab`。
- 批量关闭**逐个走 `closeTab`**：D77 的 kill 帧、挂载位归属、入口徽标、标签持久化、空面板收尾
  全在里面，绕过去就是僵尸面板。
- **确认只在「一下要结束 ≥2 条活会话」时弹**：只关一条活会话与点它自己的 ✕ 等价（✕ 不问），
  问一句是噪音；已退出（只读保留）的标签不算活会话。与 D98 同一口径（按「会损失什么」判，
  不按「开了几个标签」判），文案也照它那套写（几条、其中几条 AI 开的、已退出的不算）。
  D98 那一层顺手拆成通用件：`openCloseConfirm` 现在是 `openConfirmCard(spec)` 的一个调用方，
  两条破坏性路径共用一份手感（markup / 焦点落「取消」/ 点层内空白取消都不变）。

**同日再换一次措辞（2026-10-10，用户看过这张菜单的截图后问「什么叫『还没退出』」）**：**判据一字未动**
（仍是 `exited !== true`，`close-guard.js`），换的是**说给用户听的那几个字**——「还没退出」是判据的
语言，不是用户的语言。四处出口、中英各一份：`list.subLive`（菜单副文案 →「其中 {n} 个还开着」）、
`confirm.tabsText`（批量确认正文）、`confirm.closeText`（关面板确认正文）、`btn.closePanelTitle`
（✕ 与停靠条的 tooltip →「有会话还开着时会先确认」）。选「**还开着**」的理由：它与菜单里已有的
「**已退出**」成对（同一套词汇量的是同一件事：标签背后那个会话还在不在），而「正在运行」照旧不许写
——停在提示符的空 shell 与跑着构建的那条，在判据眼里一样「还开着」（理由见上面引的 #8 口径）。
守卫钉的还是**那条规则**（文案不许超出判据），只换被钉的字：正向断言 `还没退出` / `have not exited`
→ `还开着` / `still open`，反向断言（`正在运行` / `running sessions` / `are running`）**原样保留**。

**门槛（本轮新增）**：

- `test/tab-bulk.test.ts`（8 条）：两侧都不含参照自己且 `others = left ∪ right` / 参照在头上 →
  左侧空、在末尾 → 右侧空 / 参照不在列表里 → 两侧都空、其他为全部 / 嵌入终端不进任何一组（左侧
  也跳过它）/ 已退出的标签照样可关但不计活会话 / 确认口径（≥2 条活会话才问，方向性关闭同一把
  尺子）/ AI 开的单独数出来（已退出的 AI 标签不算「正在跑」）。
- preview 场景 4 条（真产物 + 真 DOM）：`tab-bulk-menu`（单标签时入口不可见、3 个标签**不溢出**
  时也在、有「关闭其他（2）」与「关闭左侧（2）」、活动标签是最后一个 → 「关闭右侧」那行不出现、
  没有死标签 → 没有清理行）、`tab-context-menu`（右键**中间**那个：四行齐全（此 / 其他 2 / 左 1 /
  右 1）、条数分别对、菜单落在光标附近、不叠别的浮层）、`tab-context-close-others`（点下去先弹确认、确认文案与按钮都写清条数、确认后只剩
  参照标签且它成为活动标签、菜单跟着收）、`tab-mid-click`（中键关一个、不弹确认、连关两次）。

**反向验证（真做过，不是「应该会红」）**：

| 变异 | 结果 |
|---|---|
| `right` 把参照自己也算进去 | 单测 **4 条红** |
| `left` 把参照自己也算进去（同一天补「关闭左侧」时重跑） | 单测 **5 条红**（含方向性关闭那条确认口径） |
| 把「关闭左侧」这一行从菜单里摘掉 | preview `tab-bulk-menu` + `tab-context-menu` **各红**（「关闭左侧标签」该出现） |
| 嵌入终端也算进来 | 单测 **1 条红**（「嵌入终端不算」那条） |
| 确认口径退回「标签条数 > 1」 | 单测 **2 条红**（确认口径 + AI 计数那条） |
| 「⋯」显隐退回旧规则（丢掉「标签 ≥ 2」） | preview `tab-bulk-menu` **红**（「标签 ≥ 2 个时「⋯」没出现」） |
| 拆掉标签栏上的右键委托 | preview `tab-context-menu` **红**（`waitFor timeout`） |

**回归**：既有 preview 场景重跑 9 条全绿——`tab-list`（「⋯」显隐与列表内容）、`tab-add`（单标签时
「+」贴附间距）、`clean-exited` / `clean-exited-apply`（清理行与关完自己藏回去）、
`close-confirm` / `close-confirm-empty`（确认层拆通用件之后两条路都要照旧）、`multi`、`exited`、
`agent-release`。全仓 `pnpm test` 2449 条、`pnpm -r typecheck` / `pnpm -r build` 绿。

**真机验收（2026-10-10，本机）**：`pnpm live-smoke --bootstrap --strict --render --chrome-arg
--no-sandbox` **23 条断言全 PASS**——它把本 checkout 的插件真的挂进一个真 DSH（一次性 profile）并
用无头 Chrome 打开真实界面，其中 C3「加载期间没有未捕获异常」与 C5「控制台没有插件相关的 error」
是这一轮最该看的两条（新代码有引用错误就会在那里现形）。**人工走查：维护者随后从自己的 GUI 贴回
两次现场截图**（那会儿还是改文案 / 加「关闭左侧」之前，但这个形态本身就覆盖了 ① ② ⑤）——
① 4 个标签、**不溢出**时「⋯」在 ✅；② 右键菜单的行与条数（「关闭其他（3）」「关闭右侧（2）」）✅；
⑤ 关到只剩 1 个标签后「⋯」藏回去 ✅。**改文案与加「关闭左侧」之后这三步没再在真机上点过**；
③（确认层）与 ④（中键）从头到尾都只有 preview 场景覆盖，没在真机上点过——如实记下，别当成走查完了。

**刻意不做的边界**：

- **不在「+」后面加菜单按钮**（理由见上）。
- **不做「关闭全部标签」**：那与标题栏 ✕（结束全部会话并关面板）是同一条破坏性路径，再开一个
  入口只会多一个误点面，而它已经有二次确认在管。
- **不给单条活会话的批量关闭加确认**：与它自己的 ✕ 等价。
- **不给右键菜单加键盘导航**（方向键 / 回车在菜单内移动）：每个标签的 ✕ 本来就有 `tabIndex`
  这条键盘出路（0.19.0 加的），右键菜单是加速器、不是唯一入口；但 Esc 与「键盘触发时的定位」
  都按既有口径处理了。
- **右键只挂在标签上**：标签栏空白处与终端区不弹菜单（终端区的复制 / 粘贴走终端自己的快捷键，
  而宿主右键自带菜单另有其含义，别搅在一起）。
- **「关闭左侧」原本不做，同日补上了**：我先按「与右侧不对称、补集还得减去右侧」把它划到边界外，
  用户看到菜单后要求补——补的成本确实很低（同一处切片取另一个方向），于是改成 `left` 一组，
  并把「目标为空的行不出现」这条既有规则直接覆盖它（参照在头上就没有「关闭左侧」）。
  教训记在这里：**方向的对称性由「参照物」保证，不由「词义」保证**——有参照物时左右一样清楚。

### 2026-10-10：面板生命周期一轮——退出不遮输出 / 标签跟会话走 / 关面板先问一句（0.30.0，D96–D98，issue #7 #8）

**为什么是这一轮**：同一位用户（`SwimmingTiger`）在 5 分钟里报了两条，共同点是他一直在**看着 AI 跑的
终端**。issue #7 的原话是「我想看这个 AI 打开的终端的命令执行结果，但有遮罩阻挡根本看不清……我得给
这 47 个终端一个一个点 X（好像在终端退出之后，就算后续 AI 调用了 tty_close，已退出终端的标签页也不会
消失）」；issue #8 的原话是「我已经多次不小心在 AI 正在运行任务时点了右上角 X，因为我忘记点右上角 X
会关闭所有标签页」。两条其实是同一件事的两面：**面板的生命周期与会话的生命周期对不上**——退出遮罩
盖住了「还能读」的输出，而 AI 释放掉的会话又把标签留在面板里；至于 ✕，它写着的提示（「标签保留，
重开即恢复列表」）和它实际做的事（结束全部会话 + 清掉标签列表）是反的。

**这一轮落地的四件事**（缺陷条目见 [DEFECTS.md](./DEFECTS.md) 的 D96 / D97 / D98）：

1. **退出态不再铺满遮罩**（D96）：改由 `.tt_body` 顶部的退出提示条表达，输出可读、可滚、可复制；
   `showTabOverlay` 里加了结构性守卫（面板标签的 `exited` 态只会清空遮罩），错误态与「重连中」的
   遮罩保留。嵌入终端（dsh-docker 抽屉）维持原样——它没有面板顶部条。
2. **「重新打开」从遮罩挪到提示条**（D96）：AI 开的标签上那颗按钮如实写成「新开本地终端」
   （它接不回 AI 那条会话，点了只是新开一个 shell）。
3. **agent 标签的生命周期 = 会话的生命周期**（D97）：判据抽进纯模块 `client-src/session-live.js`
   （`sessionFrameIndex` 把 present / retained / live 三张表分开，`agentTabDisposition` 给出
   keep / mark-exited / remove）；「⋯」菜单加「清理已退出的标签（N）」，并把它的出现条件放宽到
   「溢出**或**有已退出标签」。唯一的台阶：**正被看着**的那条标签先提示（「AI 已结束这个会话」+
   「收起」），切走或点它再收——后台的当场收走。
4. **关面板先问一句**（D98）：判据抽进纯模块 `client-src/close-guard.js`（`closePanelSummary`），
   ✕ 的提示文案同时改成如实描述。

**门槛（本轮新增）**：

- `test/exit-overlay.test.ts`（5 条，D96）：守卫在 / 错误与信息态还在 / 骨架里有那条条 /
  `.tt_term` 的让位与「状态条 + 退出条」叠加规则 / exit 帧两件事一起做。**反向验证实测**：
  删掉叠加规则或骨架节点 → 对应两条当场红。
- `test/session-live.test.ts` 的 `sessionFrameIndex` / `agentTabDisposition` 两组（D97）：
  三张表分开、退役后三张表都没有、保留态 → `mark-exited`、出表 → `remove`、用户的标签与嵌入
  终端一律 `keep`。
- `test/close-guard.test.ts`（7 条，D98）：一条活会话也要问 / 多条数得准并分辨 AI 开的 /
  只剩保留态或空面板不问 / 嵌入终端不算 / `exited` 缺席按活会话算 / 垃圾输入不抛 /
  传 `Map.values()` 可用。
- preview 场景 7 条（真产物 + 真 DOM）：`exited`（遮罩为空、条出现、终端 top 偏移 ≥ 条高、
  条上有「重新打开」）、`clean-exited` / `clean-exited-apply`（没溢出时「⋯」也在 + 点下去真的
  收走）、`agent-release`（后台当场收、正在看的留一台阶、切走再收）、`agent-release-neighbor`
  （见下）、`close-confirm` / `close-confirm-empty`（有活会话先问、只剩保留态不问）。夹具新增
  `mock-host.js` 的 `__mockSessionList()`——场景要**逐帧改变**宿主会话表时，基准表必须来自宿主，
  而不是「拿客户端标签推算」（那等于用被测对象造夹具）。

**反向验证（真做过，不是「应该会红」）**：把 `showTabOverlay` 的守卫条件改成恒真、或删掉
`[data-stats][data-exited]` 的叠加规则、或删掉面板骨架里的 `.tt_exitBar` 节点 → `test/exit-overlay.test.ts`
对应条目当场红（实测 2 条红）；把 `agentTabDisposition` 的「出表 → remove」改回 `keep`、
把 `closePanelSummary` 的「保留态不计入」去掉 → `session-live` / `close-guard` 两组共 3 条红。

**真机验收（2026-10-10，test profile / 3082，5 步人工走查）**：4 步通过、1 步抓到真问题。
通过的：① 退出态不再遮罩（40 行可读可拖选 + 顶部「已退出 code=0 + 重新打开」）、② 不溢出也有
「⋯」且「清理已退出的标签（3）」一次收干净、③ 关面板弹确认且取消三条退路都在、⑤ 只剩死标签
时点 ✕ 直接关。**抓到的 4b**：AI 在后台开一条、随即 `tty_close`，标签「退出了但还在」——根因是
台阶判据取「`sid === activeSid`」，而把它顶成活动标签的是**客户端自己**（关标签选邻居 /
`adoptAgentSessions` 在无活动标签时切过去）。已修：台阶只认用户自己切过去的标签（`watched`），
回归场景 `agent-release-neighbor`（反向验证：去掉判据即报出与现场同一句话）。

**4b 复验（2026-10-10，真宿主 + 真浏览器）**：方法（token 只有自起宿主才有 / 复制 profile 起真宿主 /
Playwright 驱动 / 模态背后的输入 / 审批会拦工具调用）已上收到 L0 ——
[agent-real-test.md § 驱动真宿主的面板](../../docs/agent-real-test.md#驱动真宿主的面板浏览器半体的真机验证)，
本文只记结论。用它重跑：

1. **4b**：`tty_open command="sleep 600"` → 面板里出现 `agent` 标签且 `active:false`（后台）→
   `tty_close` 那一条 → **标签当场消失、没有任何台阶提示条** ✅
2. **4a 对照**：再来一条 → **真点**那个 agent 标签（`active:true`）→ `tty_close` → 标签**留着**，
   提示条正是「AI 已结束这个会话」+「收起」→ 点回 `终端 1` → 标签消失、提示条清空 ✅

**确认框文案逐条核对（2026-10-10，最后一条没验的也结了）**：第 3 步那几句照字面过了一遍，原文在
`client-src/index.js` 的 zh/en 双份目录里：**写明几条** = `confirm.closeTitle`（「结束 {n} 个会话并
关闭面板？」）+ `confirm.closeText`；**「其中几条是 AI 开的」** = `confirm.closeTextAgent` 的
`{agent}`；**替代出路** = `confirm.closeHint`（「只是想给别的窗口腾地方？点「—」最小化 —— 会话与输出
都保持运行」）；**主按钮直说后果** = `confirm.closeOk`（「结束 {n} 个会话并关闭」，没有「确定」）；**
只剩只读保留时不问** = 场景 `close-confirm-empty`。preview 钉的是「主按钮的条数」与「最小化那句」，
其余靠这一遍人念——**都念到了，没有对不上的**（除了下面这条）。

**同一遍核对里挖出的一处口径出入（如实记下，别在下一次改动里顺手抹平）**：issue #8 的回帖里写的是
「其中有**正在跑命令**的、或 AI 用 `tty_open` 开的，单独点出来」，而实现只点得出**后一半**。
「命令在跑」这个态其实**已经在线上**了——`sessions` 帧的每个条目都带 `running`（`snapshotOf` 由
`runningOf` 算出，三态：`true` / `false` / **省略 = 没有可信的命令边界，不是「没在跑」**，见
`src/index.ts`）——但**两处都没接上**：① 客户端 `syncAgentTabs` 只取 sid / owner 那几个字段，从不读
`running`；② 宿主只在会话清单变化时推（`broadcastSessions` 就 3 个调用点：agent 开关会话 ×2、面板
接入），而命令起止（OSC 133 B/D，在 `feedShellIntegration` 里翻转）**不推**——所以就算读了，拿到的
也是「上一次清单帧那一刻」的旧值。于是判据只能用「活会话」这个**保守超集**，文案把这 N 条统一叫
「这 {n} 个正在运行的会话」（`confirm.closeText`）：停在提示符的空 shell 也会被这么叫。
**不是漏拦（拦得比承诺更多），是描述比判据宽。** 两条出路：① 把措辞收成
「还没退出的会话」（改文案，零风险）；② 在 `feedShellIntegration` 的 B/D 两个翻转点推一帧
`{ t: 'command', sid, running }`、客户端存进 `tab.running`、`closePanelSummary` 加 `runningLive`，
确认框就能写「其中 K 个正在跑命令」（兑现承诺原话）。**2026-10-10 定了 ①：只收措辞，行为零改动**——`confirm.closeText`（「这 {n} 个正在运行的会话」→
「这 {n} 个还没退出的会话」）、`confirm.tabsText`（同）、`btn.closePanelTitle`（「有会话在跑时」→
「还有会话没退出时」）、批量行的副文案 `list.subLive`（「其中 {n} 个正在运行」→「其中 {n} 个还没退出」），
中英各一份。**（同日晚些这四处出口又换过一次词：「还没退出」→「还开着」——判据与守卫的正反两面
都没动，见「批量关标签」那节的「同日再换一次措辞」。）顺手给这条口径配了守卫**（同一个规则、三处出口）：场景 `close-confirm` 钉确认层正文与
✕ 的 tooltip、`tab-bulk-menu` 钉批量行副文案——正文命中「正在运行 / running sessions / are running」
即红，报错里写明「要改这条断言，先把『在跑』这个态真接上线」，免得下一个人顺手把字改回去。
**反向验证**：把这三处措辞改回原样 → 两个场景各红一次（实测报错就是「说成『正在运行』了，而判据
只是『还没退出』」）。**② 仍没排期**：落点（`feedShellIntegration` 在 B/D 推 `{ t: 'command', … }`、
客户端读 `running`、`closePanelSummary` 加 `runningLive`）就在上面这段，真要兑现承诺原话时照它开工。

**同日再补一颗「最小化」（2026-10-10，用户看过确认框截图后提的）**：那颗确认框当时给出的出路是**一句
指路**——「只是想给别的窗口腾地方？点「—」最小化」——而它指的控件**此刻点不到**：确认层盖住整个视口、
代码注释里就写着「（标签栏、✕、「—」、终端）都不该被点到」，于是真实操作是「先按「取消」，再去找
「—」」；偏偏这一层存在的理由就是「用户分不清 ✕ 与「—」」（issue #8 原话是「忘记点 ✕ 会关闭所有标签
页」）——他要的是**收起**，不是结束。**把人想要的那个动作放到手边，误点就直接变成正解。**

- 落点：`openConfirmCard(spec)` 多一颗**可选**的第三按钮（`spec.minimize === true`，目前只有「关面板」
  那条开）；它**只能接 `minimizeModal`**——接成 `closeModal` 就是把安全出路做成破坏按钮，而那正是本仓
  最该拦住的一类事故。按钮用普通 `tt_toolBtn`（不给 danger 配方：三颗里只有「结束」是红的），焦点仍落
  「取消」（回车不该顺手结束会话）。`confirm.closeHint` 随之从「点「—」」改成「点「最小化」」。
- **批量关标签那条确认刻意不开**第三颗：它的替代动作就是「取消」（那批标签不是「面板挡路」的问题，
  收起整个面板与「关掉几个标签」不是同一个粒度）。
- **守卫**：场景 `close-confirm` 加断言——第三颗按钮存在且文案是「最小化」；点它之后**确认层已收、
  面板进收起态（`data-minimized`）、面板 DOM 还在、会话数不变**，随后经侧边栏入口恢复、再开一次留给
  截图。**反向验证**：把那颗的落点改成 `closeModal` → 当场红（实测报错「点「最小化」把面板 DOM 也
  拆了（那等于关了面板）」）。

**刻意不做的边界**：
- **嵌入终端的退出遮罩不动**：它挂在消费方（dsh-docker 抽屉）的容器里、没有面板顶部条，退出态
  只有遮罩能承载「点击重新执行」；要让那块也改，得先给它安排一条提示条的位置（属于挂载契约的改动）。
- **不给单个标签的 ✕ 加确认**：那是明确指向对象的动作、误点概率低得多；真有反馈再加。
- **不用 `window.confirm`**：宿主页面里阻塞、样式不可控，本仓客户端半体没有先例。
- **不给「AI 释放掉的、正被看着的那条标签」设时间宽限**（考虑过「10 秒后自动收」）：时间一到就收
  等于把「我还在看」和「我没在看」判成同一件事，而这个台阶本来就是为了不打断阅读——所以判据取
  「切走或点「收起」」。
- **`tty_run` 默认（`keep:false`）仍然会建标签**：可见＝本仓对 agent 会话的既有承诺（D06 的教训就是
  隐形会话），它生命周期短、由本轮的 D97 收走；「快命令闪一下标签」的性价比问题（每个标签都会实例化
  一个 xterm + WebGL 上下文）留在 § 待办里，等真机反馈再定。

### 2026-10-06：保存隧道时探测端口占用（0.26.0，D60 前半）

**动机**：待办里 D60 只剩两条，其中「保存隧道时探测端口占用」是**只改 tty 一个包**的那条（另半条
「复制 profile 时错开端口」要动 `packages/profile`，够 L0，仍在 § 待办里）。它要解决的用户现场
在 README 里已经写着：同一个 `localPort` 被两个 profile 各启动一次，**后起的那个 `EADDRINUSE`**，
状态停在红色 `error` 且 `fatal:true`——而这个错误**发生在保存成功之后**，用户是先看到「已生效」、
过一会儿才发现隧道根本没起来。

**落点**（全部在 `packages/tty` 内，L1）：

- **`src/tunnels.ts` 新增三个纯/半纯单元**：`findDuplicateLocalPorts`（配置内部撞端口，纯函数）、
  `probeLocalPort`（独占探测：`listen` 成功即立刻 `close`）、`probeTunnelPorts`（汇总，
  可注入探针与「本进程已持有」豁免集）、`tunnelPortIssueMessage`（两种 kind 各一条文案）；
  `TunnelManager.localPortsInUse()` 供路由取豁免集。
- **`src/index.ts` 的 `/config` POST**：**在 `applyPatch` 之前**探一遍，结果进 **200 的 `warnings`
  数组**（只在这次真的提交了 `tunnels` 时探）。**时机是这条落点唯一容易写错的地方**：applyPatch
  会立刻 reconcile，本进程自己刚起来的隧道随即占住端口——探测若放在它之后，就会把「自己占的」报成
  冲突。实测形状：往一个空闲端口新增隧道，回一句「已被占用」。这个顺序由
  `config-roundtrip.test.ts` 的「空闲端口不得报 in-use」一条钉住（反向验证可复现）。
- **`client-src/index.js` + `tty.css`**：`pushTunnels` 从「回布尔」改成「回 `{ok, warnings}`」，
  新增 `reportTunnelResult` 统一收尾；消息新增 **warn 档**（`.tt_cardMessageWarn` 用 `--tt-warn`）。

**三个关键取舍**（都写进了代码注释与 README）：

1. **只警告、不拒绝**——这条路由是**整表提交**（`toPayload` 把全部配置一起发上来）。配置里已经
   躺着一条冲突隧道时（老配置 / 另一个窗口写的），硬拒等于把用户锁死在「任何一项都存不下去」上，
   而修它恰恰要先能保存。所以探测结果走 warnings，**400 的拒绝面一个字没动**（反向验证专门钉了这条）。
2. **本进程已持有的端口豁免**——编辑一条在跑的隧道（比如只换 `remoteHost`）时端口当然是自己占着的。
   判据是 `server.listening === true`（不是 `server !== null`：监听失败时句柄仍在表里，按它判会把
   「其实没占住」说成「我占着」，于是端口被**别人**占着的那条真冲突反被豁免掉）。本机实测：
   同 tick 内 `close()` 之后立刻 `listen` 同一端口可以成功，所以豁免不会放过真问题。
3. **停用的那条也算重名冲突**（与取舍 2 的口径刻意相反）——停用的隧道随时会被启用，两条都留着
   就是一颗定时炸弹；而「在跑的端口」是**下一刻就会消失**的临时占用。

**门槛**（`pnpm vitest run packages/tty`：50 文件 / 645 条，本轮新增 1 个测试文件
+ 4 条路由用例 + 4 条 `localPortsInUse` 用例）：

| 判据 | 用例 |
|---|---|
| 配置内部撞端口点名两条（含停用的那条、按端口升序、同名不自我相撞、remote 方向不参与、非法端口跳过） | `test/tunnel-port-probe.test.ts` 6 条纯函数 |
| 真实 listen 语义（空着 → true 且探完真释放；被占 → false） | 同文件 2 条（**不 mock**，价值全在真 listen 上） |
| 汇总：duplicate 优先且不被重复探、in-use 只报真被占的、**豁免自己**、豁免不越界、探针抛错按「没探到」、探针说忙就报 | 同文件 6 条 |
| 文案：duplicate 点名两条并给改法；in-use 说清「机器级资源」+ 两条出路 | 同文件 2 条 |
| 路由：撞端口回 **200**（不是 400）+ 响应点名两条；不提交 `tunnels` 时**不带** warnings 字段；remote 方向不探；**新增一条空闲端口的隧道不得报 in-use**（探测早于 `applyPatch`） | `test/config-roundtrip.test.ts` 4 条（**真跑路由**） |
| 豁免依据 `localPortsInUse()`：只有**真的 listen 成功**的端口才算本进程持有（**listen 失败**的隧道不算——判据是 `listening` 而不是「句柄非 null」，否则端口被**别人**占着的那条真冲突反被豁免）、停用后消失、remote 方向不进集合 | `test/tunnels.test.ts` 4 条 |
| 客户端：宿主报端口问题时卡片显示警告（**不是**成功绿、**不是**失败红）、且成功文案被顶掉 | preview 场景 `port-warn`（真 Chrome，全量 39/39 → **40/40**） |

**反向验证 5 条**（全部先红、再逐字还原并以 sha256 比对）：拆掉 duplicate 判定 → 纯函数 4 条 + 路由 1 条红；把探测搬回 `applyPatch` **之后**（原缺陷
形态）→ 「空闲端口不得报 in-use」那条红（**这条是实测抓出来的真缺陷**，不是推演：applyPatch
会立刻 reconcile，本进程刚起来的隧道就占住了端口，于是把「自己占的」报成冲突）；
拆掉「本进程已持有」豁免 → 2 条红（编辑在跑的隧道会得到假警告）；把 `localPortsInUse` 的判据从
`listening === true` 放宽成「句柄非 null」→ `tunnels.test.ts` 那条红（端口被别人占着时会被假豁免）；
把警告改成 400 拒绝 → 路由那条红
（**这正是本项最要紧的不变量**）；客户端不再读 `data.warnings` → preview `port-warn` 红
（「端口问题的警告没有显示出来（消息为「」）」）；还原后 sha256 与基线逐字一致。

**刻意不做的**：

- **不做「自动挑一个空闲端口」**：端口是用户按用途选的（把远程库映射到本地 5432 有意义，映射到
  49321 没有），替他改端口等于替他做决定；警告里给的是「改哪一项」，不是「我帮你改了」。
- **`in-use` 不区分是哪个进程占的**：真去查要 `lsof`/`netstat`，跨平台各有各的格式，而用户要做的
  动作与占者身份无关（换端口，或去那个 profile 关掉它）。
- **不动 `git` 层面的别的包**：`localPortsInUse` 只服务这条路由；profile 复制那半条仍是 L0。
- **没有加 `Dxx` 编号**：这是待办落地，不是缺陷（缺陷台账的契约见 DEFECTS.md 头）。

### 2026-10-06：待办里剩余三条 L1 缺口一次收口（0.25.0）

**动机**：复核 `## 待办` 时确认三条「只差接线 / 能力已有」的缺口仍未做，且都属于
「改 tty 一个包就能完成」（L1）：
1. **agent 侧隧道只有 `tunnel_list`**，启停全在设置卡片——诊断闭环「停掉 → 重开 → 看状态」
   在 agent 侧断了；
2. **SFTP 双栏**缺拖拽上传与隐藏文件开关，且**面板下载没有断点续传**（宿主 `openDownload`
   的 `offset` 参数从 0.19.0 就在、agent 的 `sftp_read` 一直在用，只有面板那条路没接）；
3. **`HostKeyAlias` 全仓无引用**——同一台主机经不同地址触达时每次切换都报「指纹变更」并拒连。

同时把 **D60 的第二半**（tmux socket 全 profile 共用）做掉：它不是新缺陷，是本项复核时
唯一还能只改 tty 就落地的半条（另半条「复制 profile 时错开隧道端口」要动 Profile 管理，
仍留在待办里）。

**落点**（全部在 `packages/tty` 内，L1）：

- **agent 隧道启停**：`src/tunnels.ts` 新增 `TunnelManager.setEnabled(name, enabled)` +
  `setPersist()`；`src/index.ts` 注册 `tunnel_start` / `tunnel_stop`（工具总数 17 → 19）。
  **关键取舍**：它**改配置**（写回 `settings.tunnels[].enabled`）而不是只改运行态——`tunnels.ts`
  的一等设计是「settings 即真相源，`reconcile()` 按配置对齐运行态」，再加一层运行态覆盖就会
  出现「agent 停了、下次随便改个配置又自己回来」。写回走的是与卡片**同一个** settings 通道，
  所以两条入口结果一致。
- **SFTP**：`src/index.ts` 的 `/sftp/download` 路由接上 `offset`（>0 → 206 + `content-range`，
  `content-length` 报**剩余**长度；≥ 文件大小 → 416 并把已开的读流 `destroy()`；非法值 → 400）；
  `client-src/download-resume.js`（纯模块：`planResume` / `advanceReceived`）承载
  「要不要续、从哪续」的判定，`client-src/index.js` 的 `downloadWithResume` 用它做自动续传；
  `client-src/sftp-view.js`（纯模块：`isHiddenName` / `filterEntries` / `planDrop` /
  `dirsToCreate`）承载双栏的过滤与落点判定，双栏接上拖拽上传（**只有远端栏接**：丢到本机栏
  等于把文件放到它已经在的地方，明确提示而不是静默）与隐藏文件开关（localStorage 记偏好，
  不进宿主配置——它是「这次看不看得到」，不是插件行为）。
- **HostKeyAlias**：`SshSpec.hostKeyAlias` + `hostKeyIdentity()` 单点推导；
  `applyHostKeyPolicy`（终端 / SFTP / 隧道）与探针的 `makeHostKeyVerifier` **共用同一个键**
  （否则「试连说匹配、真连说变更」）；`~/.ssh/config` 的 `HostKeyAlias` 照原样导入；
  settings schema / 两条清洗路径 / 面板融合 / SSH 对话框与设置卡片都补了这一列。
- **D60 第二半**：`dshProfileSegment()`（`src/shell-integration.ts`）与 `tmuxSocketName()`
  ——无 `DSH_PROFILE` 时仍是历史的 `dsh-tty`（单 profile 升级零迁移），有 profile 时是
  `dsh-tty-<profile>`；运行时资产目录同步分层（`<DSH_HOME>/tty/<profile>/`）。**shell 桩里的
  `tmux capture-pane` 也换成同一个 socket**——它是 pane 内跑的脚本，写死旧 socket 会让
  `tty_capture{last}` 去连**另一个 profile** 的 server 而永远拿不到快照（假升级成「命令没输出」）。

**门槛**（`pnpm vitest run packages/tty`：49 文件 / 621 条，本轮新增 5 个测试文件、净增 84 条）：

| 判据 | 用例 |
|---|---|
| 停真的写回 `enabled:false` + 连接 end + 端口可被重新占用；启动真的新开连接；已在跑时不重复拨号（不打断在途）；**error 态不算「已在跑」**（fatal 的隧道 `tunnel_start` 真的重试）；已在目标状态不重复写配置；无 persist 回调也不崩 | `test/tunnels.test.ts` 的「setEnabled：agent 启停改配置」7 条 |
| `offset` 透传到 `createReadStream({start})`、200/206、`content-length` 报剩余、`content-range`、越界 416（且读流被 destroy）、非法值 400 | `test/sftp-download-offset.test.ts` 7 条（**真跑路由**） |
| 续传决策边界：取消一律不续（优先于一切）、零进度不续、预算用尽不续、已收满不续、`total` 为 0/NaN 按未知处理 | `test/sftp-resume.test.ts` 10 条 |
| 隐藏文件：默认过滤、开关全显、`.`/`..` 不算隐藏、返回新数组、垃圾输入不抛；拖放：只有远端栏 + 真带 `Files` 才接；`dirsToCreate` 父在子前且去重 | `test/sftp-view.test.ts` 15 条 |
| 别名：只改指纹定位键、缺省逐字不变、**不串味**（不读写未别名那条记录）、文案点明别名、探针与真连共用同一个键推导；配置往返 + 含空白/冒号/非字符串各自 400 | `test/host-key-alias.test.ts` 19 条 |
| socket / 目录的 profile 维度：无 profile 退历史名、两个 profile 永不撞（含字符集外名字）、`-L` 实参真的带上（spawn / list / kill 三处）、conf 里的 `kill-server` 提示用本 profile 的 socket、shell 桩的 `capture-pane` 也用它 | `test/tmux-profile.test.ts` 11 条 |
| 新字段穿白名单往返（`hostKeyAlias` 加进既有的 jump / proxyCommand 往返用例） | `test/jump-spec.test.ts` · `test/proxy-command.test.ts` 各 1 条已并入 |

**顺手修掉一条自己写出来的缺陷**：`stubDirs`（shell 桩路径缓存）原先只用 `'zsh'` / `'bash'`
做 key（D60 之前够用，因为桩路径与 socket 名都不随环境变）。按 profile 分层后**必须同时带
`DSH_HOME`**——只带 profile 的话，「同一个宿主进程里先按无 profile 落盘、再切到 profile」
会命中陈旧缓存（桩写到旧目录、spawn 却按新目录找）。这是写测试时当场撞出来的（测试把
`DSH_HOME` 指来指去），已改 key 为 `<shell>:<DSH_HOME>:<profile 段>`。

**刻意不做的**：
- **双栏直传的「跳过 size+mtime 相同的文件」增量**（待办原文里有）：那要改服务端直传任务
  的遍历逻辑（`SftpManager.uploadFromLocal` / `downloadToLocal`），而「跳过什么」需要两侧
  stat 对账、还要定义 mtime 精度容差（SFTP attrs 是秒）——单独立项，不与本轮续传混在一起；
- **`git` 层面不动其它包**：`HostKeyAlias` 只落在 tty。docker 的 `SshSpec` 不引用它（docker
  的目标规格由 `readTtyBooks` 从 tty 连接簿读，本轮没带这一列），若将来要让 docker 也认它，
  那是 L0（同时改两包）；
- **别的 profile 的旧 tmux 会话不迁移**：升级后新 socket 是空的，老的（历史 `dsh-tty` 上）
  会话仍在原 socket 上活着、可用 `tmux -L dsh-tty attach` 手动接回，但插件不再自动接管——
  自动迁移需要在启动时枚举并 rename，风险大于收益。

### 2026-10-03：D95 那条回归用例的间歇红——把墙钟断言换成确定性接缝（**产品源码零改动**）

**动机**：`probe.test.ts` 里守 D95 的用例在重负载下会红（CI 与两次全量并行跑各实测到过一次），
是典型的「平时无声、偶尔红」——那道门槛比没有更坏。本轮把它**根治**，而且**没碰任何 `src/`**。

**根因（两层量纲错配，实测数据）**：产品侧 D95 的修复（`exitHow` 现拼 + `awaitEvidence` 有界等待）
**是对的**——重负载下直调 `probeSsh` 实测证据 5/5 到达（总耗时涨到 785ms 也不丢）。坏的是**测试断言**：

| 候选断言（全链路，6 份并发套件 + 2 忙循环，各 24 次） | 出现率 |
|---|---|
| 含 `LATE-EVIDENCE-9`（stderr 在 200ms 窗口内到达） | **54%** ← 就是它在红 |
| 含「代理命令已退出」（exit 事实） | **100%** |
| 出现那句空话「连接已关闭（服务端主动断开）」 | **0%**（D95 修复有效） |

54% 正解释了历次「偶尔红」：不是代码回归，是断言在赌调度器。而产品那 200ms 窗口是**刻意有界**的
（等不到就照手里的写、绝不拖长探针）——**产品只保证「尽力等」，不保证「等到」**，所以
「证据必然到齐」本就不是它能承诺的性质。夹具侧还把「孙进程整个 Node 启动」（重负载 92–136ms）
叠在固定 sleep 上，总延迟会顶到窗口边缘（实测 212–256ms）。

**落点**（全部在 `packages/tty` 内，L1）：
- **新增** `test/proxy-evidence-order.test.ts`：用 `vi.mock('node:child_process')` 把 `spawn` 换成
  **受测试完全控制的假 child**（`dialProxyCommand` / `ProxyCommandDial` 本来就导出，2026-10-03
  实测确认 `vi.mock` 能拦住 `src/ssh.ts` 顶层具名导入的 `spawn`），由测试**主动**按序
  `emit('spawn')` → `emit('exit',1)` → `stderr.write(...)` → `awaitEvidence(200)`。
  **零墙钟依赖**，并且比原用例**更强**：它断言了「第 2 步那一刻文案里**确实还没有**证据」
  ——那个前提在原真进程用例里无法保证（负载轻时证据可能先到，断言就退化成空的）。
- **降级** `test/probe.test.ts` 里那条：去掉 `toContain('LATE-EVIDENCE-9')`（墙钟性质），
  保留「含『代理命令已退出』」（100%）+「不许退回那句空话」（0%）+「有界返回」。
- 夹具 `scripts/lib/proxy-late-evidence.mjs` **保留原样**——它服务降级后那条真进程用例
  （验真 spawn 路径不退化），只是不再承担「证据必须在窗口内到达」的举证责任。

**门槛**：
- 新用例两端反证：把产品侧改回旧行为（`failure()` 不再现拼 stderr）→ 它**立刻红**
  （`expected '代理命令已退出（退出码 1）' to contain 'LATE-EVIDENCE-9'`）；恢复后复绿。
  同时那条降级后的全链路用例**也会红**——两层各自有效，不是一条在撑。
- 反向用例：全程不写 stderr 时，文案必须是 `代理命令已退出（退出码 3）`、**不带任何 stderr 段**
  （防「为了过正向断言而让 failure() 无中生有」）。
- **重负载实测（6 份并发全量套件 + 2 忙循环，就是让原用例红过的那个负载）**：新用例单独 20/20 绿；
  两个文件一起 15/15 绿；全量 108 文件 / 1698 用例绿。

**刻意不做的**：
- **不加大 `PROXY_EVIDENCE_GRACE_MS`**：那等于牺牲「不许把探针拖长」这条被验证的性质。
- **不继续调夹具时序**：两次修法（sleep 120→40ms；改握手 + 有界延迟）都试过并回退——第二次
  还引入新失败模式（兜底 guard 1000ms 顶破 `200+1000` 上界，实测 `expected 1238 to be less than 1200`），
  **修好 A 面、恶化 B 面，而 B 面正是被测性质本身**。这类「墙钟上界」断言在任意负载下都无法保证，
  调参数只是移动悬崖。
- **不在 `src/` 加可注入接缝**：不需要——产品早就把 `dialProxyCommand` 与 dial 接口导出了，
  测试侧足以构造确定性时序（`src/` 与 `lib/` 本轮 `git diff` 为空）。

**同轮撞出的另外两条负载敏感红**（与 D95 同形，不是功能回归）：`D57 虚拟屏停摆`
5035ms 超时、`CG65` 15026ms 超时。**两条已于同日根治**——见下节。

### 2026-10-03（续）：D57 / CG65 两条负载敏感红同样根治，顺带补上一个恒绿的假闸门

**D57（虚拟屏停摆心跳，`test/screen-crash.test.ts`）**：历史失败均 5s 超时（`until` 默认预算耗尽，
栈指向第 224 行）。根因是**测试把「崩溃」与「报停摆」当成了同一件事**，而看门狗是**双条件**：
`inflight > 0 && lastParseAt < armedAt`（第二个条件是刻意的——只看 `inflight` 会误杀连续输出的
健康屏）。`lastParseAt` 是**整块屏共享**的，所以「崩溃发生」**不蕴含**「会报停摆」：崩溃之后若
别的批次在窗口内解析成功，按产品定义**那就不是停摆**（屏还在动）。
实测（6 份并发 + 2 忙循环，同一份 CRASH_OPS 各 3 轮）：`崩溃=true stalls=1` / **`崩溃=true stalls=0`** /
`崩溃=true stalls=1`——中间那轮正是原用例红的形状。
**改法**：那条集成用例的断言改成「报了就必须只报一次、没报不是缺陷」（新增 `waitUntil`（超时返回
false）替代会抛错的 `until`，因为 `until` 会把「按定义不发生」拖成 5s 超时再抛错——那正是 5035ms
假红的形状）。**覆盖没有丢**：崩溃本身由两条负控制用例钉死，「真停摆照样判出（回调永不来）」由
第 325 行那条确定性用例钉死，「不误杀」由下面那条钉死。

**顺带补上一个恒绿的假闸门（值得单记）**：「连续输出不误报」那条用的参数是
`窗口 100ms / 每 30ms 一帧 / 解析 20ms`（解析**远快于**窗口）——那个组合下窗口到期时 `inflight`
恰好是 **0**，于是**把产品改成单条件（去掉 `lastParseAt` 判断）它照样 12/12 全绿**（实测：
改 `src/` + `pnpm --filter @hyzyn/dsh-tty build` 重建后确认）。也就是说，**它抓不住自己要防的那个
回归**。参数扫描（双条件实测）后改成 `窗口 100ms / 每 30ms 一帧 / 解析 60ms`：窗口到期时
`inflight = 2`（能撞上在途批次）、且每个窗口内都有解析完成 ⇒ 双条件恒 0 次，而单条件下报 3 次。
两端反证均通过（双条件 12/12 绿 / 单条件 `expected 3 to be +0` 红 / 恢复后复绿）。

**CG65（`test/cli-route.test.ts`）**：历史失败 15s 超时（栈指向第 708 行的 `waitFor(…, 15_000)`），
实测 6 份里 3 份红。根因也是墙钟：那条用例要求「第 3 次尝试**成功**」，却把单次探测超时卡在
`probeTimeoutMs = 600`——实测第 3 次（本该「立刻成功」）的耗时 **54ms（空载）→ 559ms（重负载）**，
已贴到 600ms 判定线；一旦超时，梯子就按「连续 3 次超时」收敛成 `available = false`，公告**永远
不注入**，`waitFor` 必然耗尽预算。**改法**：把那条用例的 `probeTimeoutMs` 从 600 提到 3000
（成功那一次有 5 倍余量），**被验语义一字未变**——前两次仍会挂满 9s 必然超时、梯子照样要补探两次。
**同族另一条（梯子穷尽 → 收敛成 false）保持 600 不动**：它刻意要三次都超时，且第 736 行断言
`timeout after 600ms` 文案正是要验那个数字。

**门槛**：重负载（6 份并发全量套件 + 2 忙循环，即让三条都红过的那个负载）**6/6 份全绿**；
全量 109 文件 / 1698 用例绿；台账守卫与 354 条文档链接通过。**产品源码与 `lib/` 全程零改动**。

### 2026-10-01：agent 单会话闭环——`running` 三态 / 具名 `keys` / `tty_run`（0.23.0）

**动机**：让 agent 少猜一次、少一次往返。三项都只动 tty 一个包（L1，不上提项目级 ROADMAP），不占 `Dxx`。

**① `tty_list` 的 `running` / `lastExitCode` / `lastExitAt`**
- 为什么：`tty_capture{last}` 早就在用 `shellState.inCommand` 判在途，而 `tty_list` 只报进程死没死——
  agent 发完命令只能靠 `tty_expect` 超时猜：猜错一次就是白等满超时，或者往正在跑的 vim / apt / less 里
  塞输入（那些字节被当输入吃掉，要等下一次 expect 超时才发现的静默事故）。
- 落点：`src/index.ts` 的 `ShellIntegrationState.sawMark`（见过 OSC 133 标记才敢下结论）+ `SessionSnapshot` 三个可选字段 +
  `runningOf()` 三态判据 + `tty_list` 的 schema/render + 每轮 systemPrompt 快照的 `[运行中]` 标记。
- 门槛：`test/tty-list-running.test.ts` 6 条——命令型会话活着 = 在跑（不看标记）、退出 = 不在跑、
  **没标记时 `running` 键必须不出现**（未知 ≠ 没在跑）、B..D 之间 true 且 D 之后带 `exitCode`/`lastExitAt`、
  快照带「运行中」。
- 不做：不把「未知」糊成 false（那是往正在跑的程序里打字的入场券）；不为 Windows / fish·csh / 非持久 SSH
  猜命令边界——没有标记就是没有。

**② `tty_send` 的具名按键 `keys`**
- 为什么：`data` 是原样写进 PTY 的字节，驱动 TUI 时 agent 得自己拼转义序列——`"\u001b[B"` 是下箭头，
  而 `"\\x1b[B"` / `"^[[B"` 会被当成普通字符**打印进终端**，且 `sent` 计数一样、没有任何报错（静默错输入）。
- 落点：新增 `src/keys.ts`（白名单表 + `resolveKeySpec` / `resolveKeys`）；`src/index.ts` 里 `tty_send` 的 `data` 由必填改为
  「与 `keys` 至少给一个」，拼好的字节仍过 `normalizePtyInput`（Windows 本地会话的 Enter 要 CRLF，D74）。
- 门槛：`test/send-keys.test.ts` 7 条——方向键 / 控制键 / 功能键的字节、`c-` `ctrl-` `control-` 前缀与
  大小写、单字符按字面、未知名字报错**并列出词表**、**未知名字一个字节都不写**、`data` 在前 `keys` 在后、
  裸 `data` 原样语义不变（钉住「拼错就被打印」这个要消灭的形态）。
- 不做：不给 `data` 加转义解释层（会砸掉现有调用方）；不做行编辑模拟（那属于终端 app 的事）。

**③ `tty_run`：一条命令一次调用**
- 为什么：同样的行为此前要四次调用（`tty_open` → `tty_expect` 等 → `tty_capture{last}` → `tty_close`），
  中间还要处理已读水位线与「上一条命令」的在途判定。
- 落点：`src/index.ts` 的新工具 `tty_run` + `waitForSessionExit()`——用 `handle.done` 而不是轮询（`watchDone` 在同一
  promise 上先注册、回调按注册顺序跑，所以回来时缓冲已 force 冲刷、`session.exited` 已就位，D76/D77 的
  既有保证直接复用）。
- 门槛：`test/tty-run.test.ts` 7 条——结束回尾部输出 + 退出码且默认关会话、非零退出码不抛错、`keep:true`
  留在只读保留态且还能 `tty_capture`、**超时回 `running:true` 且不杀会话**、信号照实回传、`command`
  缺失时不建会话。
- 不做：不加 `sid` 参数（不往既有会话里塞命令——那是 `tty_send` 的活）；不做无界等待（D10/D11 那类
  「永久挂起且无取消入口」的教训）；不自动杀掉超时的命令。

**集成门槛（真 PTY，2026-10-01 实测）**：`scripts/integration.mjs` 新增 B36a–k 十一项——B36a–c 用**真 shell
集成**的 A/B/D 标记钉 `running` 三态与 `lastExitCode`/`lastExitAt`，B36d 钉命令型会话（不依赖标记），
B36e–g 钉 `keys`（Enter 真的提交命令行 / C-c 真的打断正在跑的命令 / 未知名报错），B36h–j 钉 `tty_run`
（输出+退出码+默认关会话 / 超时回 `running:true` 且不杀 / `keep:true` 保留可读），B36k 钉 D87 的报错文案。
**结果 135/135 PASS（0 FAIL）**——含 B33 输出契约看门狗（新工具的返回值都过各自声明的 `output.schema`，
D52 那类事故在这里就会被拦）。同轮把 `B29i` 的工具数断言 16 → 17。

**同轮真机验收（test profile，12 项检查）**：功能全过，抓出两条台账缺陷并就地修掉——
- **D87 报错指向不存在的开关**：按提示词用 `tty_capture{last:true}` 读 `tty_run keep:true` 的现场，撞上
  「shell 集成未生效——shell 不受支持或被配置关闭」，而这类会话**根本不注入 shell 集成钩子**；旧文案会让人
  去翻设置卡片找一个不存在的开关，而 `tty_run` 自己的渲染正好把人往 `tty_capture` 上引。改成 last 路径先判
  `commandSession`，报「整条输出就是那条命令的输出……用不带 last 的尾部读取（lines）或 `tty_screen`」。
- **D88 三态在渲染文本里糊成两种**：`running` 的省略态与 `false` 在 `tty_list` 的文本里**都是「没有标记」**，
  而 agent 只看得到 `render` 的散文（验收员原话：自己那条空闲会话与既有的 tmux / SSH 两条「无法从文本
  区分」）。改成显式三态 `[空闲]` / `[运行中——现在别往里发命令]` / `[命令状态未知——…]`，每轮快照只给
  **非空闲**两种打标；`tty_list` 与快照两处措辞统一成**逐字一致**（原先差一个「现在」，而那正是要 agent
  照做的部分）。
  **边界**（免得下一轮再被当成缺陷）：「未知」还包括**宿主本次启动之后没见过该会话的标记**——tmux 持久会话
  在宿主重启前就停在提示符上时正是它（提示符是很久以前画的，重连 / 重画都不会重发 OSC 133 标记）；对它发
  一个回车或跑一条命令，标记补上即变 `[空闲]`；非持久 SSH / fish·csh / Windows 本地则是常态。已同步
  README（zh/en）与 `docs/troubleshooting.md`。

### 2026-10-01：标签栏溢出——「+」脱出滚动容器 + 「⋯」标签列表（D89 / D90，纯客户端半体）

**D89「+」跟着横向滚动一起走**（用户截图原话「这个新增按钮为什么跟着滚动条一起滚动了」）：根因是「+」
正是滚动容器 `.tt_tabs` 的最后一个子元素——挂载点来自 0.2.0 的多标签页，而 `overflow-x: auto` 来自 0.12.0
的视觉大改，两处设计错位。修法**含一次返工**：先把「+」钉在标签区右端，用户当场否掉（「固定在右边不太好，
放在页签旁边好一点」）；最终给标签区加一层外壳 `.tt_tabbar`——**外壳**才是头部里吃掉剩余宽度的弹性项
（`flex: 1 1 0`），`.tt_tabs` 退成 `flex: 0 1 auto`，于是标签不多时「+」紧贴最后一个标签、排满才被顶到
右端，两种情形都在滚动容器之外（头部其余部分一点没动）。落点：`client-src/index.js` 的模板与 `renderTabbar`
接线 + `client-src/tty.css` 的新外壳。

**同轮外观细化**（不是缺陷，不占 `Dxx`）：滚动条本身也不好看（用户截图「页签一多，标签行下面横着一条
灰亮条，还占高度」）。① **隐藏滚动条**（`scrollbar-width: none` + `::-webkit-scrollbar{display:none}`；
它是**继承属性**，必须显式覆盖 `.tt_modal *` 设的 `thin`，否则又是 D86 那种主题色细条）；② 提示改走
**两侧渐隐**（`data-edge` 表示哪边还有内容，`syncTabEdges()` 在 renderTabbar / scroll / ResizeObserver
三处维护；**不溢出时删掉属性** = 零遮罩）；③ 补**滚轮换轴**（纵向 delta 映射成 scrollLeft，到头不吞事件）
——滚动条一没，鼠标用户否则根本滚不动这条。

**「⋯」标签列表**：滚动条藏起来之后，渐隐只说得清「那边还有」、说不清「还有哪几个」——10 个以上标签时
找会话就是盲找。定形：**只列完全看不见的**（看得见再列一遍是噪音——第一版「列全部、当前高亮」被用户评审
改回）、**每行带状态点 + 名称 + 目标**（状态点与标签栏共用 `tabDotState()`，SSH 显示宿主回显的 `user@host`
——两个同名标签在这里必须分得开）、**只在溢出时出现**、排在「+」**左边**（紧挨标签区右缘的是「⋯」，被裁掉
的标签就在那一侧）；点行 → 切标签并关菜单，行内 ✕ → 关掉那个标签且**菜单保持打开**，Esc 只收菜单且
**不把面板最小化**。落点：`client-src/index.js`（`openTabListMenu` / `renderTabListItems` / `closeTabListMenu`，显隐由
`syncTabOverflow` 维护；`placePopover()` 从 `openAddMenu` 里抽出共用，顺带补「下面放不下就翻到上面」）、
`client-src/tty.css`（`.tt_tabMore` 复用 `.tt_tabAdd` 的盒子；`.tt_tabMenu` 复用 `.tt_addMenu` 皮肤，
只补宽度 / 行数上限 / 单行行内布局）。

**D90 只露一线的标签两边都不出现**：13 个标签现场，栏上是 4–13、列表里只有 1、2，**终端 3 凭空消失**
（用户原话「有个隐藏的 tab 终端 3 看不到」）。根因是可见性判据用了「整颗落在窗口外」，而那一线正好躺在两端
的 22px 渐隐带里：判据说「看得见」，眼睛说「看不见」。改成按**露出的宽度**判（`< TAB_VISIBLE_MIN_PX`，
40 = 渐隐带 22 + 余量）；渐隐带宽同时从写死的 22px 提成 `--tt-tabfade` 变量，client-src 那个常量与它
**互相在注释里点名**（改一个要回头看另一个）。

**门槛**：`preview.mjs` 新增 `tab-add` 与 `tab-list` 两个场景（`tab-list` 用 560px × 8 个标签，夹具会先
自检「确实有标签被挤出视野」；后面又加两步：把第 3 个标签**精确挤成只露 3px** 复现 D90、并加一条总的
「每个标签要么在栏上真的看得见、要么在列表里——一个都不能丢、也不能多」）。两处细节判据：**不溢出时「⋯」
渲染上不可见**要量 `getBoundingClientRect()`、**不是** `hidden` 属性（作者样式的 `display` 会盖掉 UA 的
`display:none`，`.tt_statsBar[hidden]` 踩过同一个坑）；`data-edge` 首/中/尾 = `end` / `both` / `start`。**反证都真的红过**：原写法 →
「「+」仍是滚动容器 `.tt_tabs` 的子元素」；把 `.tt_tabs` 改回 `flex: 1 1 0` → 「与最后一个标签相距 919px」；
拆掉隐藏滚动条的两道保险 → 「标签栏仍占着 11px 的原生滚动条高度」；拆掉滚轮监听 → 「滚轮没有换轴：
deltaY=40 只滚到 0px」；拆掉 `.tt_tabMore[hidden]` 兜底 → 「不溢出时「⋯」不该可见」；`hiddenTabs()` 换回
「列全部」→ 「列表 [8 个 sid] ≠ 实际隐藏 [5 个 sid]」；可见性判据换回 `< 1` → 「只露出 3px 的「终端 3」
既看不见、也不在列表里」。改回后 **36/36 → 37/37 场景绿**。

**没做**：「标签先缩到最小宽度再滚」——按当前标签宽算，11 个标签只从「看得见 8 个」提升到 9 个，却要付出
label 普遍省略号的代价（记在这里，免得下一轮重复推演）。

**这是客户端半体的改动**：重建 `client.js` 即可；`link:` 安装的 profile **刷新页面**就生效，**不需要重启
宿主**（与 D87 / D88 那两条宿主侧的不同）。

### 2026-10-01：AI 辅助「失败即解释」（0.24.0，默认关）

**范围判据**：只有**需要终端现场**的功能才做在终端里——脱离现场也成立的能力主线 agent 做得更好，命令补全
之类甚至不该挂 AI 的名。据此这一轮只做价值排序里的前两项：**上下文包**与**失败即解释**。

**上下文包（`src/assist.ts` + `src/ansi.ts`）——真正的工程主体是「喂什么进去」**：调模型那条路（`ctx.llm.stream`）rss 已经
走通（连 finish 块的形状、推理模型的 max-tokens 拐点都有注释留档），难的是终端输出里全是 ANSI、`\r`
覆盖行、进度条刷屏与重复日志，直接丢给模型就是垃圾进垃圾出。所以逻辑尽量收进**纯函数**：
- **`src/ansi.ts`（新）**：清洗原语（`stripAnsi` / `collapseCarriageReturns` / `cleanAnsi`）——与
  `tty_capture` 的尾部清洗建立在**同一套正则**上（各留一份必然漂移：一边补了新的转义形态、另一边不知道，
  表现就是「工具输出里干干净净、发给模型的是满屏 `\x1b[32m`」）。`cleanAnsiTail` 保留名字变成两行包装，
  **调用点一个没改**。
- **`shouldExplainExit`**：0 / `null` / `undefined` 不弹；**130（Ctrl-C）与 141（SIGPIPE）豁免**——这两个
  天天出现，为它们弹徽标会让用户干脆把整个功能关掉。
- **`maskSecrets`**：7 条**形态明确**的规则（PEM 私钥 / `sk-` / `AKIA` / `gh*` / JWT / URL 里的密码 /
  键值对），每条一个用例，外加一条**反向用例**：普通日志一个字都不许改——错杀比漏掉一个罕见格式更伤信任。
- **`compressTerminalText`**：剥转义 → `\r` 覆盖收敛 → 折连续空行（**留一个**当段落分隔，全删反而更难读）
  与连续重复行 → 取尾部（40 行 / 6000 字符）；超上限时从**整行**开始切（半截命令会让模型编出后半段），
  头部被丢弃时**显式注明行数**（否则模型会把「输出第一行就是报错」当成事实）。
- **`buildFailurePrompt`**：**输出为主、屏幕补它缺的东西**。判据是尾段三行的包含关系——tmux 持久会话里
  `lastCommand.output` 本来就是 capture-pane 快照（OSC 133;T），与屏幕是同一份，再发一遍纯属浪费 token；
  而普通会话里两者**互补**：实测 `tty_capture{last}` 的正文只有 `ls: … No such file or directory`——
  **命令行只存在于屏幕上**（zsh 的 preexec 发出的 B 标记在用户输入回显之后，命令文本不在 B..D 捕获窗口里）。
- **`extractCommandFromAnswer`** 只认**围栏代码块**（没围栏返回空串，客户端据此禁用「填入」）——刻意不去
  散文里猜哪一行像命令，猜错的下场是往用户 PTY 里写进一句解释文字；**`plainAnswerText`** 只「去掉标记」
  （围栏 + `**`），**不做** Markdown 渲染。

**宿主与客户端接线**：Config 增 `assistEnabled`（**默认关**）/ `assistProvider` / `assistModel`——provider
与 model **成对**，只填一个既不生效、也**不许**静默回落到宿主默认模型（`resolveAssistRoute` 显式报错）；
这两个字段的 `apply` 刻意偏离本方法「空串保持原值」的惯例（空串是「清空路由」这个真实意图，按惯例处理
等于路由一旦填上就再也删不掉）。`POST /api/dsh-tty/assist` 过回环围栏、**不进** MUTATION_SUBROUTES（它不改
宿主状态，真正的闸是那个开关），且**宿主侧再判一次开关**（「关掉必须立刻生效」是这类外发开关的底线）。
`hint` 帧只能在**输出下行路径**里判（shell 集成的 D 标记可能落在任意一块数据里，没有独立的「命令结束」事件
可挂），按 `lastCommand.seq`（**单调序号**）去重——用 `endedAt`（`Date.now()`）的话，同一毫秒内连跑两条
命令会撞成同一条，第二条再也弹不出徽标。`askModelOnce`（导出供单测，照 rss 的 `callAiSummary` 先例）：
maxTokens 4096、30s 超时、`finish.kind` 读 **`reason` 里面**（rss 踩过的坑：读顶层会把每一次成功都判成
「终止原因 unknown」）。客户端：徽标在 `.tt_body` 右下角**绝对定位**——面板里任何高度变化都会经既有的
ResizeObserver 触发一次 PTY refit（SIGWINCH → 全屏程序重绘），绝对定位的浮层进出行都不动终端；答案浮层
复用 `.tt_addMenu` 皮肤、内容**一律 textContent**；「填入」= `Ctrl-U` + 命令、**结尾不带换行**（提示符上
可能已经躺着半截输入，直接追加会拼成谁也不认识的命令；而徽标只会在命令边界完整出现过之后才弹，也就是
**一定在 shell 提示符下**）。

**门槛**：三个单测文件（`assist-context` 23 条 + `assist-model` 14 条 + `host-frames` 的失败徽标 4 条）与
preview 场景 `tty-assist` / `settings-assist`（全量 **39/39**）。场景钉的是**时机与边界**，不是「渲染出来了」：
① 开关**默认关**时收到 hint 什么都不点亮；② 点徽标**之前不许有任何 assist 请求**（零输入入口 ≠ 自动外发）；
③ 答案与宿主给的文本**逐字相等**，且 `<b>` 不许被当 HTML 解析；④「填入」发出的 input 帧字节**恰好**是
`\u0015npm install`（带 Ctrl-U、不带回车）；⑤ Esc 只收浮层，不许把面板最小化；⑥ 宿主报「没有可用的模型
路由」时浮层里要有一句能照做的原因；⑦ 长答案下浮层不得越出视口。`settings-assist` 另外钉设置卡片这一小节：
小节标题在、开关**默认必须是关**（这个开关会外发终端内容，默认值错了就是隐私事故，不能只靠肉眼）、
provider / model 两个输入框在、说明里写明了默认关。
**反向验证 7 条**（全部先红、再逐字还原并以 sha256 比对）：拆掉「默认关」的**两道**闸一起拆 → 红「开关
默认关着，hint 帧却点亮了徽标」；收到 hint 就自动发问 → 红「点徽标之前就发了 1 次 assist 请求」；答案改走
innerHTML → 红「答案里的 `<b>` 被当成 HTML 解析了」；填入带上回车 → 红「「填入」的字节不对」；Esc 交给面板
（assist 与 tab-list 各一条）→ 红「Esc 把整个面板最小化了」；浮层不再重新定位 → 红「长答案把浮层顶出视口」
top=798 bottom=1212 视口高=1050。

**过程中抓到并修掉的四件事**（共同教训：测试自己也会骗人）：① **单测当场抓到一个真 bug**——取命令时先剥
`$` / `#` / `>` 提示符、再判注释，而 `#` **既是注释符又是 root 提示符**，于是注释行 `# 先看看包名` 会被当成
一条命令填进终端（改成注释先判）；② **两条空断言**——「Esc 不许把面板最小化」写的是 `q('.tt_modal')`，而
`data-minimized` 设在 **`.tt_modalBackdrop`** 上、最小化又**不移除** DOM ⇒ 那条断言**永远不会触发**（其中
一条是上一轮 D90 就埋下的）；③ **浮层变高后没重新定位**——答案到达后菜单从「转圈」长到几百 px，只在打开时
定位一次会把底部那排按钮推出视口（真机截图暴露：看得到答案、点不到「填入」）；④ **反证要拆到不变量的真实
下界**——「关着不摆徽标」有**两道**闸（hint 摄入处 + 渲染处），只拆一道另一道还兜着，第一版反证因此得出过
「仍绿」的假结论。

**明确的边界（这一轮刻意不做）**：不做流式（本插件没有任何 SSE 基建，为一段几百 token 的回答新开一条流
不划算，模型的思考过程对用户也没有价值）；**不自动执行**（填入不带回车、答案永不 echo 进 PTY）；
**不渲染 Markdown**（不可信文本，只做删减）；**命令文本仍未采集**（shell 集成桩只发 A/B/D/T、不带命令行，
`AssistPromptInput.command` 留了字段但**没有调用方会填**——要它得让桩改成发 `133;C;<cmd>` 并处理 payload
转义，单独立项）；未做追问多轮 / 选中即解释 / 底部「问一句」，以及非 AI 的那几条（危险命令确认 / 跨会话
历史搜索 / 赋能别的插件往终端里挂辅助面板）。

### 2026-10-01：答案浮层的形态与失败态（D92）

用户看过真机截图后问「可以美化一下吗」——原版能用，但**层级是平的**（退出码是一行右对齐灰色小字、建议
命令是一块没有标题的黑框、三个按钮长得一模一样、脚注是 11.5px 的三级灰），而**失败态连一个按钮都没有**。
改动以 `client-src/tty.css` 为主（`client-src/index.js` 配合拆节点）：徽标加一枚**状态圆点**（不靠文字也能
一眼认出「这里出事了」；hover 抬 1px 且只走 `transform`，不进布局）；表头红点与徽标呼应、退出码做成**药丸**
（`color-mix` 淡红底 + 等宽 + `tabular-nums`）；建议命令整块沿用终端底色并加一行小标题——小标题在**外层
容器**里，`.tt_assistCmd` 的 textContent 必须**只剩命令**（预览断言按它精确比对，且「填入」发出去的就是它）；
「填入」是唯一的**实心**按钮（三个里只有它会动你的终端）、「关闭」去边框推到最右、脚注从三级灰升到二级灰；
等待态是**纯 CSS 的转圈圆环**（不带任何图片资源——面板是注入进宿主页面的）。

**D92 失败态浮层一个按钮都没有**：错误分支直接早退，底部那排按钮整块被跳过——宿主给的那句原因
（「没有可用的模型路由：…」）正是用户要拿去排查或贴给别人的原文，却只剩 Esc 与点浮层外面两条看不见的路。
改成**告警块**（左侧 2px 红条 + 淡红底）+ 「复制报错 / 关闭」，且「复制报错」复制的就是**屏幕上那句话本身**。

**门槛**：`tty-assist` 场景加 5 条断言（圆点节点存在、文案落在**内层 span**、退出码药丸、命令块小标题、
命令块内容**只等于命令**），再加失败态「底部按钮数 == 2 且存在 `.tt_assistClose`」。**反向验证两条**
（先红后还原、sha256 比对）：徽标退回直接写 `textContent` → 红「徽标里没有状态圆点（多半是被
`syncAssistBadge` 的 `textContent` 抹掉了）」；失败态退回早退 → 红「失败态浮层没有可用的按钮（只剩 Esc /
点外面）：按钮数=0」。明暗两个主题各截了一张走查图。

### 2026-10-01：新字段「配了没反应」的三处实例（D91 / D93）

**D91 现场**：设置卡片里勾上「AI 辅助 → 失败即解释」，点保存提示「已保存」，而那个勾**自己缩回去了**
（用户原话「为什么点击保存后又取消勾选了」）。根因是**同一个根因的两处实例**——「新加一个 volatile 字段
要记得回来补一行」的**显式清单**：① **客户端** `toPayload` 的肯定清单没带它 ⇒ POST 的 body 里压根没有
这个键；② **宿主** `applyPatch` 的字段清单也没带它 ⇒ 就算带到了，`live` 也不会变，`snapshot()` 回给卡片的
还是旧值——而客户端保存成功后**正是拿这份响应重置整张表单**（`save()` 里 `setForm(data.config)`）。两处都
**静默**：HTTP 200 + 「已保存」，字段却退回原样。**既有测试一条都抓不住**：单测覆盖的是纯函数与帧、没有
覆盖配置往返；preview 夹具自己扮演宿主，根本没有 `applyPatch`/`live` 这一层，而且它的 `/config` POST 当时
**不管 body 是什么都回同一份配置**——等于把「到底存下去了没有」从夹具里抠掉了。
**D93 同一个根因的第三个实例**：追这条链路时发现 `new LiveConfig({…})` 的**显式清单**漏了同一批三个字段
——`applyPatch` 是**热更新**路径，这里是**启动**路径：配置文件里写着 `assistEnabled: true` 而 `live` 仍是
false，只有「settings 里存过东西」那条路能把它救回来；症状仍是本仓最忌讳的「配了没反应」（`/assist` 一律
403）。

**修法不是补几行，而是把两处清单的极性翻过来**：客户端肯定清单 → **否定清单**（只排除快照里那几个**派生**
键，其余默认提交）——漏一个的后果从「静默丢掉一个字段」变成宿主**响亮地**报「未知配置项: X」；宿主逐字段
清单 → **先把补丁铺开**（`live.apply` 对每个字段都有类型守卫，多余的键自然被忽略），只留需要清洗的
`sshHosts` / `hostKeys` / `tunnels` / `persistSessions` / `sftpLimits`；`new LiveConfig` 的构造清单补齐。

**门槛**：新增 `test/config-roundtrip.test.ts`（6 条）：**POST 的字段必须反映在响应快照里**（含 AI 辅助
三件套、来回开关、「清空路由」的空串语义、以及对照组——其它 volatile 字段同样往返，说明这不是特判），另有
一条**拒绝面**：快照里的 5 个派生键提交上去必须被点名拒绝——那是客户端否定清单成立的前提。`settings-assist`
扩成**勾上 → 保存 → 仍勾着**，并断言 POST 的 body 里**确实带上了** `assistEnabled`；夹具的 `/config` POST
同时改成**照真实宿主的样子应用补丁再回快照**，否则这条断言永远绿（测不出东西）。**反向验证两条**：宿主退回
显式清单 → `config-roundtrip` 4 条红，其中一条正是用户现场（`expected { …(25) } to match object
{ assistEnabled: true, …(2) }`）；客户端退回旧肯定清单 → `settings-assist` 红「保存的 payload 里没有
`assistEnabled`」。还原以 sha256 比对。
**顺带修掉一个「夹具骗人」**：卡片里不止一个 `.tt_cardSave`（隧道那一组的「添加隧道」也用这个类），按
「第一个非空文案」挑会点到「添加隧道」上——症状只是「没发出请求」，真机调试时被骗了一轮；选择器改成
**按文案挑**（双语匹配 `保存` / `Save`）。

### 2026-10-01：模型路由——从两栏到一个**只读**控件（六轮收敛）

**结论**：卡片里只有**一个**「模型路由」控件（**只读**，点开是候选表，点一条**同时**写 `provider` + `model`
——不存在「只填一个」的中间态）。**最终形态的唯一归宿在
[README § AI 辅助「失败即解释」](./README.md#ai-辅助失败即解释0240默认关)**（控件写法、候选表分组与默认行、
两种空态、说明文案都在那里）；本节只记它**怎么定下来的**。
**为什么不是两栏**：`provider` 与 `model` 是一对，单独任何一个都不成立（宿主会明确报「只填一个不生效」）；
拆成两栏等于让用户先选一个**本身不成立**的东西，还要自己把两个框对上。

**关键一轮：不要手输（第六轮）**（用户重启宿主后贴出的候选表：DeepSeek 官方直连 / StepFun / BigModel /
Command Code 四组）。我一度保留手填，理由是 dsh-llm 明写「目录只是建议——核心路由接受未列出的 model id，
基础空目录也是合法状态」，纯选择会在空目录时把人锁死；用户驳回：**「就选择就行了，应该不存在没有模型可选的
情况的，不然工作区的对话都无法进行的」**——候选表读的就是 DSH 自己选模型用的那份目录，**目录空则工作区对话
本身也选不出模型**，所以那不是我该兼容的输入，是宿主已经坏了。于是输入框 `readOnly`（光标也藏掉，
`caret-color: transparent`）、`applyRouteText`（`provider/model` 解析）整段删掉；候选表去掉过滤词与两档
「手输相关」的说法（`list.noModelMatch` / `list.noSuchProvider` 连同 i18n 一起删，不留死键）。
**第五轮那条被推翻的路记在这里免得重推**：曾给手输补过「拼错渠道会点名」的三档空态，理由是手输错了要等到
点徽标才以 409/502 的形式暴露、中间隔着好几分钟，那时看到的还是模型接口的报错而不是「你把渠道名写错了」；
纯选择之后那条路连同两个词条一起删掉，第五轮的两条断言也随之作废（**这是对的**：它们守的那条路已经不存在，
留着就是测一个死路径）。

**其余各轮只留下结论**（往返过程见开头的冻结指针）：
- **先查「没有候选」是哪一层**（在 3082 那台上真机实测，不是猜）：`/api/dsh-tty/config|shells|tunnels` = **200**，而
  `/api/dsh-tty/model-catalog` 与**不存在的路径** `nope-xyz` 都是 **401** ⇒ **新路由与不存在的路径表现完全
  一样**，说明宿主半体**还没重启**（客户端刷新只换了 `client.js`）。而界面当时说的是「没有候选（可直接
  手输）」——把「宿主里压根没这条路由」说成了「目录是空的」，用户自然以为是自己配错了。**失败与空必须
  分开说**。
- **宿主路由** `GET /api/dsh-tty/model-catalog[?provider=]`（落点：`ctx.llm.listProviders(): LlmProviderInfo[]`
  与 `listModels(provider): Promise<LlmModelInfo[]>`，各带 `id` / `name`）：与 `/shells` 同档（回环围栏、纯只读、不进
  MUTATION_SUBROUTES），且**不看 `assistEnabled`**——卡片要在功能关着时也能把路由配好；**一次往返**拿回
  整张表（不传 `provider` 时宿主**并行**问每个渠道，逐个再发一轮会把一个控件变成 N 次往返）；**每条失败
  路径都收敛成空候选**（方法缺失 / 抛错 / 形状不对 / 挂住不返回），且**一个渠道坏掉不许把整张候选表清空**；
  `listModels` 背后是远端目录（pi-ai 那一族会去问服务端点）→ **6s 软超时**（打开设置像卡死比「没有候选」
  糟得多）；候选请求带**序号守卫**（迟到的响应不许覆盖新结果）。
- **候选表形态**（第二轮三条反馈）：① 改**浮层**——`position: fixed` + 复用 `placePopover` 逐次定位
  （内联版原来复用 `.tt_shellList`，会把卡片顶高、把下面整段字段推走，实测**顶动 134px**），定位在 `useLayoutEffect` 里做、依赖带上
  loading/failed/groups；② 「**跟随宿主默认模型**」进候选表**第一行**（那是这个控件的默认态，不给出来用户
  只能靠清空输入框去猜怎么回到默认），当前生效的一条带 `data-active`；③ **标签去重**——不再写
  「名字 · id」（`DeepSeek-V4-Flash · deepseek-v4-flash` 是同一件事写两遍），只显示名字、写进配置的 id 放
  `title`。顺带修掉自己造的坑：加了默认行之后 `rows.length` 永不为 0，「过滤没命中」永远不会显示——判据
  改成**实际匹配到的模型数**，「目录是空的」与「没有匹配」分开说。
- **占位符直接删掉**（第三轮，用户「这个 placeholder 没必要吧，就算有用通用的不是更好吗」）：原文
  `如 tokenrhythm/deepseek-flash` 里的 `tokenrhythm` 是**我这台机器上真实注册的 provider**，等于把调试时
  看到的环境抄进了给所有人看的文案（同轮扫过 `client-src`，本机串只有这一处）；**不换成通用示范**——控件
  上方是标签、下面是候选表、再下面是说明，「怎么填」已经讲完了，而**空态本身也有含义**（空 = 跟随宿主
  默认模型）；i18n 里那条 `placeholder.assistRoute` 一并删掉，不留死键。
- **说明砍到一行**（第七轮，用户「提示可以优化一下，没必要这么刻意」）：「点一条即同时填好渠道与模型」是
  **控件自己就在说的事**；「只填一半不生效」在只读控件下**已经不可能发生**（只有老配置可能是半截值），为
  一个几乎到不了的态写负向说明是纯噪声。现在只剩 **「留空跟随宿主默认模型」**（规格与卡片里其它字段一致，
  对照「兜底工作目录」的「留空使用宿主进程启动目录」），`hint.modelCandidates` 连同中英词条一起删掉。

**门槛**：新增 `test/model-catalog.test.ts`（15 条：10 条纯 helper 的降级契约 + 5 条路由，含「一次把每个
渠道都问到」「一个渠道坏掉不许把整张候选表清空」「坏适配器不清空 providers」「非 GET 405」）；
`settings-assist` 场景按轮次扩到断：目录取不到时必须说「拿不到」（夹具预先置 `__PREVIEW_CATALOG.fail`）、
恢复后按渠道分组、点一条把**两个键一起**写好、打开候选表**不许顶动布局**（量保存按钮位置，移动 > 0.5px
即红——`getComputedStyle(候选表).position === 'fixed'`）、模型路由控件**必须是只读的**且保存 payload 是
**选中的那一对**（`mock-provider/mock-fast`，证明这个值只能从列表里来）、placeholder 必须是空串、说明
**不超过一行**（量那一栏的 `.tt_cardHint`）、以及「模型路由标签只能有一个」（两栏的旧形态不许回来）。
**反向验证**（先红后还原、src / 客户端 sha256 比对）：目录取不到时不说「拿不到」→ 红「宿主没重启就长这样」；
点候选只写渠道不写模型 → 红「点候选没有把渠道 + 模型一起写进去："mock-provider"」；拆掉软超时 → 「到点
放弃」吊死成 20s 超时；`.tt_routeList` 的 `position: fixed` 改 `static`（类名不动、其余断言照过）→ 红
「打开候选表把卡片布局顶动了 134px（用户实测现场）」；删掉 `readOnly: true` → 红「模型路由控件不是只读的
（只该能选，不该能打字）」；placeholder 加回来 → 红「带了占位符（会把某一对具体路由写给所有人看）」；
再堆一行说明 → 红「堆了 2 行说明（其它字段都只有一行）」。

### 2026-10-01：同一条失败只问一次（D94）

用户问「怎么避免重复调用询问」——**问得对**：这条链路上有两处会**重复花钱**，而当时一处都没拦。Esc 收掉
浮层再点徽标、或在途时连点徽标，都会**再发一次** `POST /api/dsh-tty/assist`；`closeAssistMenu` 里确实
`abort` 了在途请求，但 **abort 只停客户端这一头**——POST 早已送达宿主，宿主照把模型跑完，那次调用的 tokens
已经花掉了。修法分两层：**客户端**按「这条失败」缓存（在途不重问、已有答案直接**回放**（关掉再点、切走再
回来都是零成本）、只有上一次**报错**才真的重试——这是用户唯一需要的「重试」路径）；**宿主**按 sid 记在途
（`assistInFlight`，重复的直接 409 挡回且**不占用**一次模型调用——兜的是两个标签页 / 客户端竞态；
`finally` 里必清，否则一次异常就把会话锁死）。
**必须一起修**：`hint.busy` 原先只在「成功 / 失败」两条路上归位，**中途关掉浮层（abort）那条路不清**——
加上「在问就不重问」的闸之后，它会把徽标**永久**锁在转圈上，所以 busy 挪进了 `finally`。

**门槛**：新增 `test/assist-route.test.ts`（6 条）——这个路由此前**一条直接测试都没有**（只有纯函数层面的
`assist-context` / `assist-model`），「重复调用」与「启动路径漏字段」都拦不住；做法同 `tty-run.test.ts`
（假 PTY 开真会话、假 `llm` 卡在闸门上，把路由当普通函数调）。preview 的 `tty-assist` 再加一条「Esc 收掉
浮层后重开 → 请求数不变」。**反向验证三条**（先红后还原、src / 客户端 sha256 比对）：拆掉在途去重 → 红
「重复请求不许再花一次模型调用: expected 2 to be 1」；拆掉构造清单里的 assist 三件套 → 红「配置文件写着
开着，路由就不该 403」；拆掉客户端那两道闸 → 红「重开浮层又发了 1 次请求（同一条失败只该问一次）」。
