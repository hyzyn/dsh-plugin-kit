# @hyzyn/dsh-tty

中文 | [English](README.en.md)

> DSH 侧边栏「终端」面板：xterm.js + **真实 PTY** 的完整终端，本地与 SSH 一视同仁，长任务可断线保活。

## 特性

- **真 PTY + WebGL 渲染**：node-pty 真实 PTY，vim / htop / dev server 等 TUI 均可运行；多标签页。
- **可选 tmux 会话持久化**：宿主重启 / 网络抖动后重开即恢复现场；docker exec 这类「命令标签」自动重开。
- **ssh2 原生连接**：agent forwarding + 主机指纹 TOFU 钉扎，连接簿统一管理；另有 **SFTP** 上传下载与 **端口转发**（-L / -R，断线自动重连）。
- **agent 侧按「命令」粒度取数**：shell 集成（OSC 133/7）让 `tty_capture{last}` / `tty_expect` 拿到「上一条命令」的输出与退出码，而不是抓屏猜；`tty_list` 直接报**有没有命令在跑**（`running` 三态），`tty_run` 一条命令一次调用拿回输出与退出码。
- **对其它插件开放客户端服务**：`ttyConnbar`（连接栏动作）、`ttyTerminal`（就地开终端）与 `ttyPanel`（面板内挂载位）；dsh-docker 的「容器 / 终端」按钮即走这些扩展点。
- **AI 辅助「失败即解释」（0.24.0，默认关）**：命令非零退出时右下角浮出徽标，点它才把**那条命令的输出尾部**（清洗 / 截断 / 密钥遮盖后）连同当前屏幕发给模型，换回「发生了什么 / 下一步」；模型给的命令只**填入**命令行、永不替你回车。见 [AI 辅助](#ai-辅助失败即解释0240默认关)。

![终端面板：xterm 弹窗 + 服务器状态条 + 资源明细。终端上方是完整模式的细监控条（CPU 百分比与迷你条 / 核心 / 内存（已用占总量）/ 磁盘（已用占总量）/ 在线 / TCP / CPU 温度 / 网络上下行），右下方是展开的资源明细浮层（每核柱 / 上下行双线 / Top 进程）](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-tty.png)

## 安装

```bash
dsh plugin --profile web add @hyzyn/dsh-tty    # npm 安装（发布后）
dsh plugin --profile web add link:$(pwd)/packages/tty   # 仓库开发调试
```

装完重启 `dsh web`，侧边栏出现「终端」入口，点击打开面板；
「终端面板」卡片可改配置（**保存即热生效**，无需重启）。

## 使用

- 打开面板自动创建第一个终端（默认 `$SHELL`，macOS 上通常是 zsh）；
- **多标签页**：标签栏「+」是菜单（本地终端 / SSH 连接簿（条目带 ✎ 编辑）/ SSH 连接…），
  标签 ✕ 关闭，**双击标签可重命名**（随标签持久化）；每个标签独立会话（本地 PTY 或 SSH channel）；
  标签栏放不下时**横向滚动**（两端渐隐），并在右缘出现**「⋯」标签列表**：只列被挤出视野的标签
  （状态点 + 目标名），点一行切换、行内 ✕ 关闭（列表不关，可连着关）；
- **批量关标签**：**右键**任一标签弹出菜单（关闭此标签 / 关闭其他 / 关闭左侧 / 关闭右侧 /
  清理已退出的标签；没有对象的行不出现），**中键**直接关闭指向的标签；「⋯」里挂着同一份批量行。
  标签 ≥ 2 个时「⋯」恒在。会**结束 ≥2 条活会话**的动作先弹确认（写明几条、其中几条是 AI 开的），
  只关一条活会话与点它自己的 ✕ 等价、不弹；
- **标签「对 AI 不可见」（默认关闭）**：右键菜单多一项——藏起来后 `tty_list` 与每轮 systemPrompt
  的会话块里都没有它（只报「另有 N 条被用户设为对 agent 不可见」），按 sid 的读写工具一律被拒；
  你自己的面板里照旧完全可用。**AI 自己开的标签不给这一项**；
- **工作目录跟随当前 DSH 会话**：新标签默认在当前会话工作目录打开（宿主配置 `cwd` 作兜底）；
- 支持 vim / htop / less 等 TUI（TERM 已注入为 `xterm-256color`）；
- 面板大小变化自动 resize（xterm fit → PTY 原生 resize）；**非活动标签不跟手**，保留自己最后一次
  有效尺寸（D79：容器不可见或探测结果退化时，尺寸帧一律不发）；
- **Ctrl+F 终端内搜索**（Enter 下一个 / Shift+Enter 上一个 / Esc 只关搜索框），输出中的链接可点击；
  复制 / 粘贴用终端自己的快捷键（有选中时 Cmd+C / Ctrl+Shift+C、Cmd+V / Ctrl+V）；
- **断线自动重连**：刷新页面、网络抖动等异常断开后，会话在宿主保活 `reconnectGraceSec`（默认 120 秒），
  客户端指数退避自动重连（封顶 5s），按 sid **attach 回原会话并回放断线期间的输出**；页面刷新后从
  sessionStorage 恢复标签列表（宿主侧已结束的会话自动丢弃）；
- **WebGL 渲染器**：高吞吐输出（build 日志）性能质变；上下文丢失（多标签超出浏览器配额等）时
  自动回退 DOM 渲染器；
- **最小化**：点弹窗外空白处、按 Esc 或标题栏「—」收起面板——会话与输出缓冲保持存活，侧边栏入口
  显示「运行中 / 总数」徽标与状态点；悬浮条 ✕ / 标题栏 ✕ 才真正关闭并结束全部会话；
- **关面板会先问一句**：还有活会话时，点 ✕ 先弹确认（写明结束几条、其中几条是 AI 开的），并把
  「最小化」放进同一行按钮；只剩已退出的标签或空面板时直接关（判据是「会损失什么」，不是「开了几个标签」）；
- **已退出的会话不再遮住输出**：退出态是终端区顶部一条提示条（「已退出 code=…」/「AI 已结束这个会话」
  + 最多一颗动作按钮），输出照常可读、可滚、可选中复制；错误态与「重连中」的遮罩保留（它们解释
  「为什么没有输出」）；
- **「⋯」里的「清理已退出的标签（N）」**：一键收掉所有已退出的标签，并让宿主立刻释放它们的只读保留；
- **AI 开的标签跟会话走**：AI 用 `tty_close`（或 `tty_run` 默认收尾）释放会话后，对应标签跟着关；
  你正看着的那一个先留一台阶（提示条 +「收起」）。仍在只读保留里的会话标签**留着**，由上面的一键清理收；
- 标题栏 ✕ 关闭面板并结束全部会话（PTY 树级清理；tmux 持久标签同时 kill-session）；会话退出后
  从顶部提示条重开（本地标签按原规格新开、持久标签接回 tmux、命令标签重跑一次）；
- 并发上限默认 4（`maxSessions`，1~16）。

![终端面板设置卡片：shell / TERM / 并发上限等保存即热生效](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-tty-setting.png)

## Windows 宿主（best-effort）

默认 shell 取 `%COMSPEC%`（系统保证存在）；要 PowerShell 就在设置卡片把「Shell 路径」填成
`powershell.exe` / `pwsh.exe` 的完整路径。**Windows 上不做 POSIX 包装层**：直接 `[shell]`；PowerShell
家族补 `-NoLogo`（去版权横幅）、**不补 `-NoProfile`**（用户的 profile 正是别名与函数的来源）；
TERM / COLORTERM 对 ConPTY 没有意义，也不再注入。

- **「跑一条命令」的标签**（docker exec、agent 起的命令标签）走 `cmd /c` 或 `PowerShell -Command`。
  **PowerShell 的 `-Command` 会把「末条命令非零」塌成进程退出码 1**（`cmd /c exit 5` → 1，两版一致），
  要拿到具体码值就让命令自己 `exit 5`（POSIX 侧 `sh -c` 不会这样）。
- **输入行尾归一化（D74）**：conhost 的 Enter 是 **CR**，裸 LF 只把光标下移一格、**不提交命令行**。
  win32 本地会话把裸 LF 补成 CRLF（已是 CRLF 的不重复补；非 Windows 与 SSH 会话原样透传）。
- **shell 集成（OSC 133/7）按家族分**：**PowerShell 家族支持**（`powershell.exe` / `pwsh.exe`，
  `-File` 稳定桩挂 `prompt` + `PSConsoleHostReadLine` 钩子）——拿到 `tty_list.cwd`、退出码、`running`
  三态与命令粒度的 `tty_expect`；**cmd 不支持**（没有命令边界钩子），设置卡片把开关置灰并指向
  「把 Shell 路径换成 PowerShell」。`&&` / `||` 只有 **PowerShell 7** 认，5.1 上是解析错误（一条命令都不跑）。
  - **退出码口径**：PowerShell 家族的**解析错误**命令一条都没跑，而 D 标记报 **0**——不能只看退出码判成功，
    报错文本在输出里。
  - **桩的边界**：靠 `-ExecutionPolicy Bypass`（进程级）载入，**组策略**锁死执行策略时装不进来、
    标签照开而集成静默失效（与「用户关了 PSReadLine」同一种降级）；该参数也会写进
    `$Env:PSExecutionPolicyPreference`，从该会话再起的 PowerShell 会继承它。包装 `prompt` 还会让用户
    原 prompt 读到的 `$?` 变成我们那几次写入的成败（恒真），依赖 `$?` 的失败提示会失效。
- **不支持的两项**（宿主侧自动关掉，设置卡片里写明原因）：**tmux 持久化**（Windows 上没有 tmux；
  SSH 到 Linux 主机仍可用）与**服务器状态条**（本地只有 CPU / 内存 / 在线时长，磁盘 / TCP / 网速 / 温度
  显示「无」；远端 Windows 主机走 PowerShell 那一跳）。

完整边界、0.18.1 的修复范围与 `windows-smoke` 的 W6–W8 覆盖见
[ROADMAP § 已完成](./ROADMAP.md#已完成落点--门槛)。

## agent 工具

插件向 agent 注入二十个工具（操作实时显示在用户终端里；**每次调用受会话权限档位约束**，见下节）：

> **零配置时只注册 10 个**（0.33.0 起按配置条件注册）：`sftp_*` 七个要有 SSH 连接簿条目、`tunnel_*`
> 三个要有隧道。下表是**配齐之后**的完整面；受限档位下还会进一步裁掉写 / exec 类（见下节）。

| 工具 | 作用 |
| --- | --- |
| `tty_list` | 列出终端会话（sid / kind（local\|ssh）/ target / pid / **cwd 实时跟随 cd** / 活动时间；tmux 持久会话带 `persist`；agent 自己开的带 `owner: 'agent'`）。**含已退出但仍在只读保留期的会话**（`exited:true` + 退出码/信号）；**`running` 三态 + 未知成因**（true = 在跑，别往里发命令；false = 命令已结束；**省略 = 无法判断**，**不是**「没在跑」——成因在 `runningUnknown` 里分开：`ssh`（远端 shell 不受本插件控制，**永久**未知）/ `tmux-attach`（tmux 接回时收到的是屏重绘、不带 OSC 标启，**跑完第一条命令即恢复**）/ `no-integration`（fish·csh·cmd 等不受支持的 shell，或「shell 集成」被关掉），三者下一步动作不同，别把它们当成一句话）；同源 `lastExitCode` / `lastExitAt` 是上一条已完成命令的退出码与结束时刻 |
| `tty_books` | 列出**连接簿条目**（`name` / `host` / `port` / `username` / 认证方式 / 是否 tmux 持久 / 是否经跳板机或有代理命令），**不含任何凭据**。`sftp_*` 的 `book`、隧道的 `bookName`、docker 目标的「连接簿」下拉都按 `name` 引用；**`book` 也接受 `host` 或 `user@host`（唯一匹配才解析，有歧义会列候选而不猜）**。名字记不准时先调它，不要去猜、更不要读配置文件 |
| `tty_open` | **自己开一个终端会话**：本地 shell，或 `command` 直接跑一条命令（dev server / watch；**按宿主 shell 的语法整段执行**，Windows 上按 cmd / PowerShell 自己的语法；不受「命令标签单行 ≤2000」约束，D78），`persistName` 可要 tmux 持久化；当前 shell 与语法每轮都写在 systemPrompt 的终端一行里。会话**出现在用户的终端面板里**（普通标签、可见可接管），不做隐形会话 |
| `tty_close` | 关掉由 `tty_open` 开的会话。**只允许关 agent 自己开的**（用户开的标签会被拒绝，agent 不越权结束用户正在用的终端）。对**已退出但仍只读保留着**的会话同样可用——那是它的释放入口 |
| `tty_run` | **一次性命令**：开会话跑 `command`，等它结束，直接返回尾部输出 + 退出码（把 open → 等 → capture → close 压成一次调用）。默认**跑完即关**，`keep:true` 留在只读保留态；到 `timeoutSec`（1~600，默认 120）未结束返回 `running:true` 且**不杀会话**；**调用方取消**（`exec.signal`）立刻返回 `cancelled:true`——取消的是这次调用，**不是那条命令**。需要用户**看得见**这条命令、或它必须跑在终端会话里时用它，纯非交互命令用 bash 更直接 |
| `tty_stats` | 读会话所在机器的实时指标：CPU / 内存 / 磁盘 / TCP / 网速 / 温度 / 在线时长 / 1 分钟负载 / 交换分区 / SSH 连接往返。本地会话取宿主机，SSH 会话取远程主机（另开非 PTY 通道，不影响终端） |
| `tty_capture` | 读近期输出（尾部 N 行，默认清洗 ANSI，`raw:true` 取原始流）；**`last:true` 只返回上一条已完成命令的输出 + 退出码**（shell 集成标记）；命令**在途**时返回 `inProgress:true` 且不带旧结果。**命令型会话没有「上一条命令」**，`last:true` 会明确报错并指向 lines（D87） |
| `tty_screen` | 读**当前可见屏幕**的渲染结果（xterm-headless 虚拟屏，纯文本）——能读懂 vim / htop / 菜单等 TUI。正文保尾最多 32KB，超出返回 `truncated:true` |
| `tty_expect` | 用正则等一个就绪信号。**先回溯**还没被读过的输出（含「上一条命令」的完整输出，命令瞬间跑完也不会白等），再等后续输出；命中返回 `matched:true` + `matchedFrom`（`live` / `last` / `buffered`）。超时不抛错（`matched:false` + 尾部输出，且**不消耗未读区**），命令提前结束也带退出码早停；**刚发进去的命令回显不算命中**（OSC 133 的 A..B 边界，无标记环境靠发送记录剔除；只命中回显时带 `echoOnly:true`）；同一会话在途调用最多 5 个，累积窗口只留尾部 64KB；调用方取消立刻结算为 `cancelled:true` |
| `tty_send` | 向会话发送文本与/或按键。**控制键与方向键用具名 `keys`**（`["C-c"]`、`["Down","Down","Enter"]`，白名单查表；名字不认得就报错，绝不静默当字面量发），**不要自己在 `data` 里拼转义序列**（`"\x1b[B"` 会被当普通字符打印）；`data` 与 `keys` 至少给一个，先 `data` 再按序 `keys`。命令以 `\n` 结尾即可（Windows 本地会话归一成 CRLF，D74）。对**已退出**的会话明确报错 |
| `sftp_list` | 列出 SSH 远程目录内容（名称/类型/大小/修改时间，目录在前）；`book` 为连接簿条目名，`path` 缺省为登录 home；默认最多 500 项（超限 `truncated:true`），`isSymlink` 区分软链 |
| `sftp_read` | 读取远程**文本**文件（默认 ≤256KB 可调至 1MB，超出截断）；`offset` 可从指定字节分页，非法 `maxBytes` 直接报错，二进制判定 = NUL + 非法 UTF-8 占比双判据 |
| `sftp_write` | 写远程文本文件（默认覆盖，`append:true` 追加；单次 ≤1MB） |
| `sftp_mkdir` | 创建远程目录；`parents:true` 逐级补齐缺失父目录（等效 `mkdir -p`，已存在目录幂等跳过） |
| `sftp_rename` | 重命名/移动远程文件或目录（`to` 与 `from` 不同目录即移动；不覆盖已存在的目标） |
| `sftp_remove` | 删除远程文件/目录；目录默认 rmdir（非空明确报错），`recursive:true` 整树删除（不可恢复）；拒绝 `/`、`~`、含 `.`/`..` 段的路径 |
| `sftp_tree` | 递归列举远程目录结构（深度优先、目录优先；`maxDepth` 1~8 / `maxEntries` 1~2000 限流，超限 `truncated:true`；symlink 不跟随防环） |
| `tunnel_list` | 列出端口转发隧道及实时状态（活跃/连接中/错误/停止、规则、连接数）；`fatal:true` = 人工介入级故障（本地监听失败 / 连接簿缺失），**不会自动重试** |
| `tunnel_start` / `tunnel_stop` | 启停一条隧道（`name` 来自 `tunnel_list`）。**会改写配置**——与在设置卡片里勾选/取消那个「启用」是同一件事（写回 settings → 热应用 → `reconcile`）。返回值通常是 `connecting`（拨号异步），最终结论稍后 `tunnel_list` |

### 会话权限档位闸（tier gate）

工具按风险分三类，**每次调用**按会话的权限档位（仅可查看 / 工作区内修改 / 完全权限 / Auto review）
决定放行、询问还是拒绝——档位是用户在会话里切的，切完下一个调用立即按新档走：

| 类 | 工具 | 受限档（仅可查看 / 工作区内修改）下的行为 |
| --- | --- | --- |
| 读 | `tty_list` `tty_books` `tty_capture` `tty_screen` `tty_expect` `tty_stats` `tunnel_list` `sftp_list` `sftp_read` `sftp_tree` `tty_close` | 全档放行 |
| 写（有界变更） | `sftp_write` `sftp_mkdir` `sftp_rename` `sftp_remove` `tunnel_stop` | 弹授权询问（人允许这一次才执行）；无人值守（审批策略 never）确定性拒绝 |
| 执行（无界命令面） | `tty_open` `tty_run` `tty_send` `tunnel_start` | 同上——这些工具能在本机或远程 shell 里跑任意命令、开监听端口 |

**完全权限档零询问**；**Auto review 档插件不叠加询问**（宿主的模型预审已在逐调用审查）。宿主未组合
`sandboxPolicy` / `approval` 服务时**不闸**，启动日志打一行
`tier-gate: services absent (…), per-call gate disabled`。机制（决策矩阵 / 与 `allowProxyCommand` 的
两层关系）见 [docs/permission-tier-plan.md](../../docs/permission-tier-plan.md)。

**只读档的会话连工具面也一并裁掉**（宿主的 `tools.restrict`）：档位是「仅可查看」时，
插件在该会话的 **agent 作用域**上把「写」「执行」两类从工具表里摘掉——agent 看到的 tty 工具从
20 个降到 11 个。**安全边界仍是上面那张逐调用的矩阵**：裁剪只是提前拿走按当前档位不可能成功的工具；
名单漏了谁、或工具在会话建立之后才注册，都只影响模型看不看得见，不构成越权。**完全权限 / Auto review /
工作区内修改三档都不裁**——工作区内修改档的写与执行是**逐次 ask**（人一点就能执行），工具能成功就不该
藏（2026-11-05 修正：旧判据把默认档整批藏掉，用户要自动化只能切零询问的完全权限档）。
**会话中途切档会重算**（升档放回、降到只读档摘掉，都在下一次模型请求之前生效）。

**提示词不点名可能被裁掉的工具**（D103）：每轮 systemPrompt 的终端块只说「按 sid 操作」+「**实际可用的
工具以你的工具表为准**」，并给出见不到时的出路（只读档请用户切「工作区内修改」档——那档可用但每次要
确认；或改用受沙箱约束的 bash）；它不再硬写「可用 `tty_send` 操作、用 `tty_open` 开关」——那句话与
工具表不同源，模型会照着去调一个不存在的工具。守卫：`test/tty-list-running.test.ts` 的两条反例用例。

典型 agent 流程：跑完就算完的命令用 `tty_run` 一次拿回输出 + 退出码；需要**长驻**的会话用 `tty_open`
→ `tty_send` 启动 → `tty_expect` 等就绪 → `tty_capture{last:true}` 拿单条命令结果 → `tty_close`。
`systemPrompt` 里另注册了动态 context，每轮自动携带活跃终端快照（sid / kind / cwd / owner，以及
`[运行中]` 标记），无需先调 `tty_list`。

**agent 开的会话边界**：`tty_open` 开出来的是**面板里的普通标签**（带「agent」标识），用户看得见、
接管得了、关得掉——刻意不做隐形会话。它从出生起没有客户端绑定，因此**不被孤儿回收器回收**；关闭
入口是 `tty_close` 或用户在面板里关标签。反过来说，agent 也**关不掉用户开的标签**。

### 进程退出后的「只读保留」（D77）

会话的进程退出**不再等于会话消失**——它转成**只读保留态**，**默认保留到显式关闭**
（`EXITED_RETAIN_MS = ∞`；宿主 / 插件重启即清空），期间：

- **读得到**：`tty_capture`、`tty_screen`、`tty_list`（带 `exited:true` + `exitCode`/`signal`）照常可用；
  `tty_expect` 不再空等，按现存输出立刻结算并带 `exited:true`；
- **写不进去**：`tty_send` 明确报错，`tty_stats` 不再作用于它（回 `available:false`），面板的 `resize` 也不再有意义；
- **不再接回终端**：`attach` 明确拒绝（没有活着的 PTY，面板也不会为它建标签）；
- **谁释放它**：agent 的 `tty_close`（仅限自己开的）、用户在面板里关那个标签、或宿主 / 插件重启。
  并发上限**只数活着的会话**（保留态不占名额，客户端「+」的上限预检同口径）；保留态最多
  `MAX_EXITED_SESSIONS`（16）条，超出按最旧淘汰（淘汰时记日志）。

保留**不按时间**淘汰：内存与句柄本来就不由时间决定，而时间上界对使用者是第二重惊喜（「命令跑完 →
下一轮读结果」之间隔多久都有可能）。想要时间上界就把 `EXITED_RETAIN_MS` 改成毫秒数 / 0，`reapExited`
通路还在。完整修法与回归见 [DEFECTS D77](./DEFECTS.md)。

### shell 集成（OSC 133/7，0.4.0）

POSIX 上经既有的 `-c` 包装层按 shell 类型注入钩子，Windows 上走 PowerShell 的 `-File` 稳定桩（都对
用户透明，不改 rc）：

- **zsh**：`ZDOTDIR` 指向临时桩目录（VS Code 同款方案），桩文件先 source 用户原 rc 再追加
  `precmd` / `preexec` 钩子；
- **bash**：`--rcfile` 桩（先 source `~/.bashrc`）；命令开始标记按版本二选一：bash ≥ 4.4 走 `PS0`，
  bash < 4.4（macOS 自带 3.2）用 **DEBUG trap 兜底**（按 `$BASH_COMMAND` 过滤 PROMPT_COMMAND 自身的
  fire）。副作用：循环体等复合命令的内部命令会多发 B 标记，只影响 `tty_capture{last}` 的截取起点；
- **PowerShell（Windows）**：`-File` 稳定桩（纯 ASCII，5.1 按 ANSI 代码页读 .ps1）包装 `prompt` 与
  `PSConsoleHostReadLine`，用户 profile 照常生效。退出码口径见「Windows 宿主」一节；
- 标记语义：`133;A` prompt 开始 / `133;B` 命令开始 / `133;D;<exit>` 命令结束带退出码 /
  `OSC 7 file://…` cwd 上报（`tty_list.cwd` 跟随 `cd`，SSH 会话上报远程路径）；
- 其他 shell（含 Windows 的 cmd）静默关闭；配置 `shellIntegration: false` 可整体关掉（逃生门）。

**回溯匹配与已读水位线（D72）**：`tty_expect` 先回看**还没被读过**的输出，回看起点抬到「未读区内
最后一个 `B` 标记之后」——回显落在 `A` 与 `B` 之间，所以回显里的字样不会被当成命中（刻意不做文本
比对：折行 / ANSI / 多行粘贴都会打碎它）。**没有 `B` 标记的环境**（未开集成 / Windows cmd / 远端
- **`ZDOTDIR` 的三层解析（0.38.0）**：包装层与 tmux 内层启动器共用同一段判据——父会话传下的
  `DSH_TTY_ORIG_ZDOTDIR` → 继承的 `ZDOTDIR`（**必须是「不是桩目录」的值**）→ `$HOME`。为什么要有
  第二层那个排除：在 dsh 终端面板里再起一个 dsh（嵌套）时，宿主进程环境里的 `ZDOTDIR` **就是**桩目录，
  直接用会让桩 `source` 自己 → zsh 递归（`job table full or recursion limit exceeded`）→ 整条本地
  会话没有 OSC 133 标记。桩文件里还有一道自愈兜底（ORIG 为空/等于桩目录就退回 `$HOME`）。
未装集成 / 用户关了 PSReadLine）改用另一条判据剔除回显（D75 / D101）：把最近 `tty_send` 提交过的
命令行从候选文本里削掉再试，只有「削掉后不再命中」才算纯回显；超时且只命中过回显时带 `echoOnly:true`。

**已读水位线**：`tty_capture` / `tty_expect` 返回的内容算「已读」，之后的 `tty_expect` 不再回扫；
`tty_screen` 刻意**不**推进，`tty_send` 只初始化不推进，**超时也不消耗未读区**（换个 pattern 还能
回溯到同一段）。要回看更早的内容用 `tty_capture`。

SSH 会话同表调度：`tty_list` 里 `kind: 'ssh'` 的条目按 `target`（user@host[:port]）识别，
`tty_capture` / `tty_expect` / `tty_send` 用法与本地会话完全一致。

### 凭据存储（连接密码不必只落明文）

连接对话框的「密码」下面有一行 **凭据存储**：勾上「保存时存入凭据存储」，密码就写进**官方凭据存储**，
字段里只留 `env:NAME` 引用（值在 `~/.dsh/.credentials.yaml`，不进环境、不回传浏览器）。**默认勾选**
（宿主提供了 `remote.credentials` 时）；宿主没有这个服务时置灰禁用，并说明只能明文保存。

- **跟着保存走，不额外点一次**：由「保存修改」/「连接（并保存）」执行写入，没有悬空引用；
  **没勾「保存到连接簿」时不会动存储**（否则只会留下孤儿）。设置卡片的行内编辑是同一行、同一个
  默认值，只是提交入口叫「应用」。
- **默认勾选的两个副作用**：① 编辑一条**明文密码**的老连接、只改别的字段再保存，密码也会被搬进
  存储（不想搬就取消勾选）；② 存储拒绝写入时**保存会被中止**并显示官方原文错误，而不是偷偷改成
  明文落盘。
- **名字规则**：`DSH_TTY_<用户名>_<主机>[_<端口>]_<字段>`，**端口留空或 22 时省略**；字段 =
  `PASSWORD` / `PASSPHRASE`。例 `operator@192.0.2.10:22` → `DSH_TTY_OPERATOR_192_0_2_10_PASSWORD`。
  **按资源身份派生、不带哈希**（host 与 username 本来就是 ASCII 标识符），连接名不参与键——改连接名
  不会换键。空主机或空用户名拒绝存入。
- **解析路径**：连接 / 试连 / SFTP / 端口转发都走同一个 `buildConnectConfig`，其中的 `env:NAME` 经
  **官方凭据 provider** 解析（每操作重解析，改完下一个操作即生效）；provider 没有该引用、或宿主
  没有该服务时才退回 `process.env`。**为什么必须走 provider**：凭据存储里的值**永远不会被
  materialize 进环境**，只读 `process.env` 等于「存进去的密码连接时读不到」。
- **可见性**：对话框的引用选择器会列出存储里已有的名字——宿主侧 `/api/dsh-tty/credential-refs`
  只读 `refs:` 的键名回来（只要名字，值永远不出宿主）。这是**有意偏离**官方「引用不可枚举」设计的
  一处（引用名会进浏览器，值不会）。
- **保守的边界**：`~/.credentials.yaml` 是 **0600 的普通文件，没有主密码、没有 OS keychain**——它挡的是
  **别的 OS 用户**，挡不住以你身份运行的进程与 agent；且它**机器本地**，换机器要重存。能用密钥 /
  agent 就别存密码（本插件两者都支持）。

## 端口转发（0.5.0）

「终端面板」卡片的「端口转发」区块维护隧道；每条隧道引用一条连接簿条目（主机与认证随之），两个方向：

- **本地转发（-L）**：本地 `127.0.0.1:localPort` 监听 → 经 SSH 在服务端侧连到 `remoteHost:remotePort`
  （最高频用法：`localPort=5432 → db.internal:5432`）；
- **远程转发（-R）**：服务端监听 `remoteHost:remotePort`（缺省 127.0.0.1）→ 入站连接拨回本地
  `localTargetHost:localTargetPort`；
- **宿主自持生命周期**：隧道与终端标签互相独立（各有各的 SSH 连接），面板关了隧道照跑；SSH 断线
  自动指数退避重连（1s→15s 封顶），remote 方向重连后自动重新 forwardIn。**例外**：本地监听失败 /
  连接簿条目缺失是人工介入级故障——状态停在 `error` 且 `fatal:true`、**不会自动重试**；
- **多 profile 同跑要错开 localPort**：端口转发是机器级资源，而配置按 profile 各存一份；两个 profile
  抢同一端口 → 后起的那个 `EADDRINUSE`，报错会点明「可能是另一个 DSH profile 的宿主进程」；
- **保存时探测端口（0.26.0）**：保存时宿主先探一遍本地端口（独占探测，成功即释放），把「两条隧道
  用同一 localPort」与「端口被本进程之外的东西占着」提前到保存那一拍说清楚。**探测只警告、不拦保存**
  （卡片以黄色警告档显示；整表提交时硬拒会把用户锁死在「任何一项都存不下去」）。本进程自己正占着的
  端口被豁免；停用的那条也算重名冲突；remote 方向的 `remotePort` 在服务端监听，不参与本机探测。
- **状态徽标**：卡片展开期间 2s 轮询实时状态（活跃绿/连接中蓝/错误红/停止灰 + 最近错误）；「+」菜单的
  连接簿条目显示 `⇄N` 徽标；agent 用 `tunnel_list` 查询；
- **连接栏入口**：该连接**有启用隧道**时常驻「隧道 N」按钮；没有隧道时收进「**⋯ 更多**」（补上发现
  路径、又不占常驻宽度）。隧道必须引用连接簿条目，所以只有条目式连接有这个入口；
- **表单布局**：方向用**分段控件**，两端按「**主机:端口**」成对呈现，中间用**箭头**示明数据流向
  （切到 -R 时箭头翻转）。每个方向**恰好有一端是固定的**（-L 左端固定 `127.0.0.1`，-R 右端固定
  `127.0.0.1`），固定端渲染成静态文本而不是输入框；
- **编辑**：每行「编辑」回填到下方表单，按钮切成「保存修改 / 取消」；保存按**原始名字**定位替换
  （隧道名由 `<连接簿条目>-L<本地端口>` 派生，「改端口」等于换名字），`enabled` 保留原值；撞名明确报错；
- **本地监听失败是粘性的**：状态稳定停在红色 `error` 并保留原因，不会被 SSH 侧的重试刷成「连接中」；
  恢复办法是改端口或腾出端口；
- TOFU 与终端会话共享同一份 `hostKeys` 钉扎；端口不占 `maxSessions` 名额。

## SFTP 文件传输（0.7.0，0.8.0/0.9.0 增强）

不动终端、不占会话名额，直接对 SSH 连接做远程文件操作（`ssh2` 的 sftp subsystem，宿主半体 `src/sftp.ts`）：

![SFTP 单窗体（0.16.0 起挂在终端下方抽屉）：远程目录浏览，行内 下载/重命名/删除](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-tty-sftp-dialog.png)

![SFTP 双栏（0.9.0；0.16.0 起挂在终端下方抽屉）：左本机 / 右远程，行内 ⇨/⇦ 服务端直传](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-tty-sftp-dual.png)

- **落点（0.16.0）**：终端面板开着且**本标签**的挂载位空着时，文件浏览**挂在终端下方**（路径栏 /
  列表 / 传输进度占满整宽），终端继续可见可用；高度可拖、可折叠成一条标题栏。挂载位已被别的面板
  占用、或面板没开时，退回原来的居中对话框（不挤掉别人的面板）；
- **跟着标签切（0.19.0）**：文件浏览归属**打开它的那个标签**（连的是那台主机）：切到别的标签时整块
  收起（在途传输照跑，切回来还在原地），标签关掉时一并收掉。所有入口用同一条规则；
- **入口**：① 标签栏「+」菜单的连接簿条目带 📂；② SSH 连接对话框填好主机/认证后点「文件浏览」；
  ③ SSH 标签的连接栏「SFTP」按钮（归属该标签）；
- **操作**：目录浏览（路径框回车跳转、`..（上级目录）`、单击文件即下载）、**上传**（多选文件，XHR
  流式 + 进度；0.8.0 起支持**拖拽**，文件夹经 `webkitGetAsEntry` 递归展开，目录用 mkdir parents
  逐级补齐）、**下载**（POST → Blob → `<a download>`）、**新建目录**、**重命名**（行内编辑器）、
  **删除**（🗑 二次确认，目录带 `recursive` 整目录删除）；
- **传输进度与取消**：底部状态行右侧是细进度条 + 百分比（下载按 `content-length` 实时算，无长度时
  降级为已传字节文本）；✕ 取消传输——上传中断在途 XHR、下载用 `AbortController`、双栏直传向宿主
  cancel，取消后**半截文件自动删除**，状态行走「已取消」；关闭文件浏览也会收掉在途传输；
- **连接管理**：懒连接池——首次操作才建 SSH 连接，空闲 120 秒回收，断开后下次操作自动重连；连接簿
  条目每次（重）连接时实时解析（改密码后自动用新凭证）；TOFU 与终端会话/隧道共用 `hostKeys`；
- **断点续传（0.25.0，面板下载）**：下载中途断线时**自动从已收字节接着下**——宿主侧 `/sftp/download`
  接上 `offset`（>0 回 206 + `content-range`，`content-length` 报**剩余**长度；`offset ≥ 文件大小`
  回 416）。判定规则在 `client-src/download-resume.js`（`planResume`）：**用户点 ✕ 一律不续**、零进度
  不续、重试封顶（默认 3 次），续传期间进度条不回零。目录级直传仍是整份重传；
- **双栏拖拽上传与隐藏文件（0.25.0）**：拖到**右侧远程栏**即上传到该栏当前目录，拖到**本机栏**明确
  提示「没有可执行的动作」（判定在 `client-src/sftp-view.js` 的 `planDrop`）。每栏工具行有「隐藏文件」
  开关（偏好记在 localStorage）；**过滤只在渲染层**——宿主 `list` 与 `sftp_list` 始终返回全部条目；
- **传输通道**：`POST /api/dsh-tty/sftp/list|mkdir|rename|remove|download|upload`（全部 loopback 围栏），
  `download` 另接受可选的 `offset`。连接规格经 JSON 体或 upload 的 `x-dsh-sftp-meta` 头（base64url）
  携带——**凭证不进 URL/查询串**；上传下载均为流式 pipe，不整文件进内存；
- **agent 工具**：`sftp_list` / `sftp_read` / `sftp_write` / `sftp_mkdir` / `sftp_rename` / `sftp_remove` /
  `sftp_tree`——只收 `book` 连接簿条目名，**不接受内联凭证**；
- **双栏风格（0.9.0 可选，配置 `sftpStyle`）**：左本机 / 右远程两栏，本机侧走 `/api/dsh-tty/local-fs`
  路由；行内 `⇨ / ⇦` 把条目对拷到对面栏的当前目录（`/api/dsh-tty/local-fs/transfer` 由宿主服务端
  流式直传，目录递归、同名覆盖，**字节不经过浏览器**）。设置卡片切换，重新打开 SFTP 生效。

## 会话持久化（tmux，0.10.0）

默认安全模型不变：会话随宿主生死（内核级 PTY 清理）。需要「活得比宿主久」的工作（dev server、build、
训练任务），开**持久终端**——会话委托给 tmux server（专用 socket，与用户自己的 tmux 完全隔离），
断线保活、甚至宿主重启后都能接回：

> **socket 按 profile 区分**（0.25.0 起）：`tmux -L dsh-tty-<profile>`，运行时资产
> （`<DSH_HOME>/tty/<profile>/`）同步分层——多 profile 同跑时各自的持久会话清单互不可见。**不带 profile
> 启动的宿主仍用历史名 `dsh-tty`**，单 profile 用户升级后行为与路径**一字不变**。

- **入口**：设置卡片「会话持久化」选 `tmux` 即唯一开关——开启后**所有新开的标签默认持久化**
  （「+」菜单的本地终端、连接簿条目、SSH 对话框（「持久会话」默认勾选，单次可取消））；
- **条目级取消（`sshHosts[].persist`）**：连接簿条目上的勾选框存的是**取消项**——`persist: false`
  的条目不再 tmux 托管，其余条目跟随全局开关（`~/.ssh/config` 导入的条目不受影响）；
- **机制**：spawn/ssh 帧带 `persist` + 客户端生成、随标签规格保存的稳定 `persistName`——本地把 `-c`
  包装层换成 `exec tmux -L <socket> -f <conf> new-session -A -s dsh-<名>`；SSH 则远程
  `exec tmux -L <socket> -f /dev/null new-session -A -s dsh-<名>` 开 pty channel。`-A` attach-or-create：
  宿主重启后重开标签按同名接回原会话；
- **恢复链路**：浏览器重连后查 `sessions`——持久标签 sid 已失效的，客户端自动按原 persistName 重新
  spawn；保活回收器超时只杀 PTY（tmux 客户端）、**不杀 tmux 会话**。同宿主内重连（attach）对 tmux
  会话不回放宿主缓冲，改为强制 `tmux refresh-client` 重画一次（回放会重影）。持久标签规格同时写入
  **localStorage**（sessionStorage 只对同一浏览器标签可见，新窗口原本读不到）；
- **关闭语义**：kill 帧（标签 ✕ / 关面板）对 tmux 背书会话先 `tmux kill-session` 再杀客户端——真正
  结束，而不是 detach 留活口；整个页面关闭时默认**留存**（保活期后可再恢复），配置 `endOnPageClose: true`
  则改为保活期结束时连 tmux 会话一起结束；
- **shell 集成兼容**：tmux 会吞掉不认识的转义序列——钩子检测 `$TMUX` 把 OSC 133/7 包进 DCS passthrough
  信封（payload 内 ESC 双写），tmux ≥3.3 + `allow-passthrough on`（宿主自动写入桩 conf）时解包转发。
  `tty_capture{last}` 另有一层修正：钩子在发 D 前先 `capture-pane` 经 `OSC 133;T` 随流直送（base64，
  最近 200 行），宿主优先采用该快照作为命令输出；
- **运行资产**：`<DSH_HOME|~/.dsh>/tty/` 下的稳定桩目录（tmux server 比宿主活得久，不能用临时目录）：
  `tmux.conf`（status off、真色 overrides、`default-command` 指向内层启动器）与 `inner.sh`（按当前配置
  exec 内层 shell）。配置热改对新开 pane 生效；`tmux.conf` 只在 tmux server 首启时读取；
- **降级**：本机/远程未安装 tmux 时，持久 spawn 自动落回普通会话，终端里回一行灰字提示。

## SSH 连接

标签栏「+」除本地终端外还能开 **SSH 标签页**：宿主半体用 `ssh2` 原生建立连接并打开 shell channel
（不经过本地 ssh 进程，也不占 node-pty），包装成与本地 PTY 完全一致的会话对象——输入、resize、关闭、
输出缓冲、背压与 agent 工具全部复用同一套调度。

- **「+」菜单三个入口**：本地终端 / **SSH 连接簿**（条目带 📂 文件浏览与 ✎ 编辑）/ SSH 连接…（表单
  手填，连接前可勾选保存，底部「文件浏览」可跳过终端直接开 SFTP）；
- **连接簿**：「SSH 连接」对话框勾选「保存到连接簿」即存为条目（同名覆盖，名称留空用主机名）；菜单
  条目的 ✎ 与设置卡片的**编辑**走**同一套表单**（连接 / 认证 / 选项三段 + 凭据存储 + 引用选择器 +
  试连 + 文件浏览），支持改名与同名冲突校验。「连接簿名称」一行**常显**：填了名字就自动勾上保存、
  清空就自动取消。对话框是**三段式外壳**（标题与底部动作行固定，只有中段滚动），低频项（跳板机 /
  代理命令 / 主机密钥别名）收在「**高级**」折叠区；
- **认证方式（auth）三选一**：
  - `agent`（默认）——走 ssh-agent（`SSH_AUTH_SOCK`），凭证不落盘，最推荐；
  - `key`——`keyPath` 私钥文件（`~` 开头可省略 home），`passphrase` 可选；
  - `password`——密码认证，同时挂 keyboard-interactive（不少服务端只开这个）；
- **密码 / 口令支持 `env:VAR`**：按**凭据层**解析——官方凭据 provider 优先，它没有才退回宿主进程
  环境变量（配合 dsh-env-manager 托管密钥，避免明文写进 settings）；解析不到时报错会同时点到引用名
  与「两处都没有」；
- **端口**：默认 22，非 22 端口在 target 里显示为 `user@host:port`；
- **名字可发现（D104）**：同一台机器常有三套名字——连接簿条目名（agent 侧 `book` / 隧道 `bookName`
  真正认的那个）、docker 目标名、以及面板里显示给人看的 `user@host`。所以 `book` 除了条目名，也接受
  `host` / `host:port` / `user@host`（**唯一匹配才解析**，同 host 多条目时报候选而不是猜一台），以及
  **docker 目标名**（读 docker 命名空间里的「目标 → 它引用的条目」，只取拓扑、不碰凭据；docker 没装
  时自动退化），于是卡片上写的 `kb-target` 可以直接当 `book` 传；记不准就用 `tty_books` 枚举（它把
  别名表也列出来），没命中时错误文案会**列出可用条目**（`name — user@host:port`，不含凭据）而不是
  只说「不存在」；
- **主机密钥别名（`hostKeyAlias`，0.25.0）**：TOFU 默认按**连接地址**定位，而同一台真实主机常经不同
  地址触达（跳板机后的内网 IP、端口转发落在 `127.0.0.1:2222`），那时「同一把钥匙、不同记录」会让
  每次切换地址都判成**指纹变更**（假 MITM 告警并拒绝连接）。填同一个别名即可共用一条记录；语义与
  OpenSSH 的 `HostKeyAlias` 对齐（**只决定指纹记在哪条记录里，不改连接地址**）；
- **标签与状态**：SSH 标签标题用连接名或 `user@host`（本地标签是「终端 N」）；状态栏描述**当前活动
  标签**——切标签 / 关标签立刻换成该标签自己的状态（失败原因、退出码都记在标签身上），后台标签自己的
  失败不会顶掉活动标签的显示；
- **`~/.ssh/config` 导入**：解析 `HostName/User/Port/IdentityFile` 生成候选条目（跳过通配符块与无
  User 条目，`Include` 不展开），同名跳过，随「保存」写入。**每一种跳过都会当场说明**；`ProxyJump`
  会解析成连接条目的跳板机（单跳）一起导入，`ProxyJump none` / `ProxyCommand none` 是显式直连照常
  导入；`ProxyCommand` **永不自动导入**（只在手动填写 + 打开开关之后才会跑）；
- **代理命令 / ProxyCommand（0.21.0，默认关）**：连接簿条目（或对话框）里可填一条**本机命令**，它的
  stdin/stdout 就是到目标的 SSH 传输（典型写法 `ssh -W %h:%p bastion`）。支持 `%h` `%p` `%r` `%n` `%%`；
  **代入值只允许字母数字与 `._@:[]-`，含 shell 特殊字符直接拒绝执行**。**闸门**：设置卡片开关**默认关**，
  提权有两条通道：① 启动环境变量 `DSH_TTY_ALLOW_PROXY_COMMAND=1`（只认继承来的 `process` 层，写项目
  `.env` 或 `~/.dsh/env.yml` **不算**授权）；② **就地提权**（免重启）：点开关 → 面板给出「在宿主终端执行」
  的命令 → 执行后十秒内解锁。HTTP / 界面**不能凭空打开**它（给 `true` 而无授权会被 400 拒绝），但
  **关掉**永远可用。授权是**持久**的（落在 `<DSH home>/dsh-kit/capability-grants.json`，0600），宿主
  重启后直接生效并在卡片上显示时刻与「撤销宿主授权」。关着时携带代理命令的连接**明确失败、不退回
  直连**。与跳板机同时填时按 OpenSSH 语义**跳板机优先**。闸门只有一处（本插件 settings）：docker 容器
  面板读同一个开关。与跳板机一样，**它是另一条独立传输，收尾必须成对**（四条路径共用 `dispose()`）；
- **凭据引用选择器**：SSH 对话框的密码/口令字段旁有筛选框 + 限高列表，候选 = **凭据存储里已有的
  引用名**（宿主读 `.credentials.yaml` 的 `refs:` 键，**只回名字、绝不含值**）∪ **连接簿里已在用的
  引用名**；点击即填 `env:NAME`，也可手输。候选一个都没有时这一行**整体退化成一行说明**。设置卡片的
  编辑表单里有同一行、同一份候选（卡片里是内联列表而非浮层）；
- **主机指纹 TOFU 钉扎**：首次连接成功后把该主机（host:port）的 sha256 指纹记录进 `hostKeys`（随
  settings 持久化）；之后每次连接校验，集合内任一指纹匹配即放行，**指纹变更直接拒绝连接**（防中间人
  冒充），错误信息带重置指引。同一主机的多把钥匙（如 rsa + ed25519）各记一条指纹、合并存于同一记录。
  主机重装/换钥匙后到「SSH 主机密钥记录」删除对应记录再重连即可。**「从 known_hosts 导入」**一键
  批量预填充（同主机的多条记录全部保留）；
- **连接测试**：设置卡片条目行内「测试」与对话框「试连」都只做**链路诊断**（不建会话、不占名额、
  不开 shell）：先 TCP 预检（DNS + 建连，失败分类为拒绝/超时/DNS/不可达），再 ssh2 握手做主机密钥
  TOFU 比对，最后完成认证。**条目「测试」**完整 TOFU（首测即记录新指纹）；**对话框「试连」**只比对
  不落盘；
- **计入 `maxSessions` 并发上限**；关断与本地会话一致：标签 ✕ / `kill` 帧关闭 ssh2 channel，`exit`
  帧照常带回退出码 / 信号。

## 服务器状态条（0.17.0）

![极简模式的服务器状态条 + 同一张资源明细浮层：CPU / 内存 / 网络 三项，每项一条近 60 秒趋势线加大数字](https://cdn.jsdelivr.net/gh/hyzyn/dsh-plugin-kit@main/docs/dsh-plugin-kit-tty-stats.png)

（完整模式的条见页首那张图；两种形态由面板头部右上角那颗**三档按钮**切换。两张图都是 SSH 会话，
本机会话用同一套字段。）

每个**可见**标签在终端上方挂一条细状态条，实时展示该会话所属主机的资源指标（观感对齐 FinalShell）：

    CPU ▮▮▯▯ 6% │ 核心 16 │ 内存 ▮▮▮▮ 78% (49.6/62.3 GB) │ 磁盘 ▮▮▮ 63% (40.8/68.8 GB) │
    在线 2w4d7h16m │ TCP 570 │ CPU温度 无 │ 网络 ↓92.3K/s ↑93.1K/s

- **一项资源一条**：百分比、迷你进度条、已用/总量同组（`内存 78% (49.6/62.3 GB)`），标签只出现一次。
- **按机器能力出现的格子**：`CPU温度` / `Ping` / `Swap` 只在**这个会话报过**该字段时才出现（Linux
  `/sys/class/thermal`、`/proc/meminfo`、SSH 往返；macOS 本地、多数云主机没有温度传感器）。判据是
  「曾经报过」而不是「这一帧有没有」——传感器偶发读失败不该让整格每秒闪一次。
- **极简模式**：面板头部右上角**三档循环按钮**（完整 → 极简 → 隐藏）；极简条只留 **CPU / 内存 / 网络**
  三项（外加有就显示的 Ping / Swap），每项是「小标签 + 最近 60 秒趋势线 + 大数字」。线色随档位换色：
  **<80 绿 / 80~90 橙 / ≥90 红**（`STATS_WARN_LIMIT`，与 80% 警戒虚线同源）；网络用平方根刻度 +
  64 KB/s 地板（线性会把一次突发以外的部分全压到底），掉帧画断线、不补值。
- **资源明细（悬浮仪表盘）**：状态条最右端的 **▾** 展开悬浮卡片，三格并排——**CPU**（每核一根柱，
  按 80/90 阈值变橙/红，标题报「最差那一核」的档位）、**网络 I/O**（近一分钟上下行双线，下行更粗更亮、
  上行细一档压暗；固定 60 秒横轴；Y 轴 1-2-5 量程 + 平方根刻度）、**进程**（Top 5，宿主每 5 秒采一次
  `ps`，上送 CPU 前 5 ∪ 内存前 5；列头可切换 CPU / 内存排序；进程名按可执行文件名首尾截断）。
- **条目悬停卡片**：指针在某格上停 140ms 弹出小卡片——第一行**当前**读数，第二行起**近 1 分钟峰值** +
  该格的上下文（CPU 给核心数、内存给已用/总量）。峰值来自客户端自己攒的 60 个采样，缺口不参与峰值、
  也不当 0；采不到的格子不弹卡。
- **右侧「负载 / 时间」**：`负载 0.15 │ 10:45:23`，负载取 `/proc/loadavg`（macOS 走 `os.loadavg()`，
  Windows 拿不到就整格隐藏）；时间走自己的 1s 定时器，不挂 stats 帧。
- **让位阶梯**：整根条按**一条**顺序逐级藏——**核心 → 在线 → 时钟 → 负载 + 时钟整组**，一不溢出就停。
  活指标（CPU / 内存 / 磁盘 / TCP / Ping / Swap / 网络 / 负载）一个都不让。判据是**真实溢出**
  （`scrollWidth > clientWidth`）而不是算宽度，每帧从「全显示」重算。
- **两条采集路径，同一帧形状**：SSH 会话在同一条 ssh2 连接上另开一条**非 PTY 的 exec channel**，远端
  跑常驻循环每秒吐一行 JSON；本地会话由宿主自己采（Linux 直读 `/proc`，macOS 走 os/netstat/vm_stat）。
  两条路径都不碰 PTY 数据流。远端平台覆盖 Linux / Windows（PS 脚本兜底），macOS/BSD 远端拿不到就整条隐藏。
- **订阅制、懒启动**：客户端按标签可见性发 `{t:'statsOn'}` / `{t:'statsOff'}`，宿主首个订阅才起采集；
  退订清零、会话退出、孤儿回收、插件禁用、配置关闭都会停表并关掉远端 channel。
- **best-effort**：某项拿不到就省略该字段（前端显示「无」）；采集失败静默停表、状态条整条隐藏
  （8s 收不到新帧即收起——不是 3s：采集子进程偶发变慢时窗口太紧会闪）。绝不写 PTY、绝不弹错误。
  进度条配色：<70 正常 / 70~90 黄 / ≥90 红。
- **慢命令不拖垮节奏**：走子进程的字段（df / netstat / vm_stat / ps）只在首次采样时等一次，之后一律
  「用上一次的值 + 到点后台刷新」（本地 `SLOW_TTL_MS = 5000` 槽位，远端 `REMOTE_SLOW_EVERY = 5` 拍
  的相位门）——某台机器某个命令卡住只会让那一格显示几秒前的旧值。
- **固定槽位 + 增量刷新**：每个值的字符槽位固定（右对齐），条目只建一次、之后只写真的变了的文本，
  所以数字跳变不会把后面的条目推着横移；窄窗口横滚到右侧时滚动位置也不会被下一秒的刷新弹回开头。
- **热生效**：关掉 `statsEnabled` 立刻停采集，重新打开后按仍存留的订阅自动恢复。

## AI 辅助「失败即解释」（0.24.0，默认关）

命令以**非零状态结束**时，终端右下角浮出一枚低调的徽标（写着退出码）；点它才把**那条命令的输出尾部**
发给模型，换回一段「发生了什么 / 下一步」。

- **零输入，但不自动外发**：徽标只提示「这条失败了，要看看吗」——把终端内容送出去的那一步永远是用户
  点的。`Ctrl-C`（130）与 `SIGPIPE`（141）不弹（它们天天出现），退出码拿不到时也不弹。
- **发什么**：那条命令的输出尾部（剥颜色与 `\r` 覆盖行、折掉连续重复行、截断到 40 行 / 6000 字符，
  密钥 / token / 连接串里的密码已遮盖）**加上当前屏幕**——**不发 scrollback**。输出回答「这条命令干了
  什么」，屏幕回答「敲的是哪条命令」。
- **答案怎么用**：浮层表头是「这条命令为什么失败」加一枚退出码药丸；模型给的命令单独渲染成「建议
  命令」一块，按钮是「**填入命令行**」——只把字节写进提示符（先发 `Ctrl-U` 清掉可能躺着的半截输入）、
  **绝不回车**；另给「复制答案」与「关闭」。答案只活在面板 UI 里，不回显进终端。
- **失败时也有出路**：宿主报错时浮层给一块可复制的「复制报错」，而不是一行没有按钮的死文案。
- **同一条失败只问一次**：答案按那条命令缓存，Esc 收掉再点徽标会**直接回放**；只有上一次**报错**时
  再点才会重试。宿主侧另有按会话的在途去重。
- **模型路由**：候选来自宿主已注册的模型目录（`provider` / `model` **成对**；留空跟随宿主默认模型）。
  卡片里是**一个只读的「模型路由」控件**（显示 `provider/model`），点开列出按渠道分组的候选，点一条
  同时把两个键写好。候选取不到时界面把「拿不到候选：宿主可能还没重启」与「宿主没有可用的模型」分开说。
- **隐私**：默认关。打开它等于授权一次**终端内容外发**——只发上面那一段，发送前做轻量遮盖（只按形态
  明确的规则，宁愿漏一个罕见格式也不错杀正常日志）。

## 配置（保存即热生效）

设置面在宿主里的位置随 DSH 版本变，但**始终是同一份表单**——各代际的落点与四条注册契约的唯一归宿在
[conventions.md § 客户端设置面](../../docs/conventions.md#客户端设置面内联优先)。

| 项 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | true | 关闭整个插件（需重启生效） |
| `announceToAgent` | true | 是否向 agent 公告终端面板能力（systemPrompt 注入） |
| `maxSessions` | 4 | 并发 PTY 会话上限（1~16） |
| `shell` | `$SHELL` | shell 路径；设置卡片可选可输入（下拉候选是浮层，来自 `/etc/shells` + `$SHELL` + 常见安装路径，仅列存在且可执行者），也可手输任意路径 |
| `term` | `xterm-256color` | TERM 值 |
| `colorTerm` | `truecolor` | COLORTERM 值 |
| `cwd` | 宿主启动目录 | 兜底工作目录（客户端当前会话 cwd 优先） |
| `reconnectGraceSec` | 120 | 异常断开后会话保活秒数（0~3600）：刷新页面/网络抖动后会话存活等待重连，超时由回收器结束；`0` = 断开立即结束 |
| `sshHosts` | `[]` | SSH 连接簿条目 `{name, host, port=22, username, auth=agent\|key\|password, keyPath, passphrase, password, agentForward, hostKeyAlias='', persist=false}`；保存时整体替换、同名覆盖；`password` / `passphrase` 支持 `env:VAR` 引用；`persist=false` 是**取消项**；`hostKeyAlias` 空串 = 按主机地址定位指纹 |
| `hostKeys` | `[]` | SSH 主机指纹记录（TOFU，自动维护）：`{host, port, fingerprints[]}`，按 host:port 唯一，一机多把钥匙共用一条记录；首次连接自动追加、任一指纹匹配放行、全部不匹配拒绝连接 |
| `shellIntegration` | true | 注入 OSC 133/7 shell 集成（命令边界标记 + cwd 上报；`tty_capture{last}` 依赖它）；zsh/bash/PowerShell 支持，其他 shell 自动跳过 |
| `tunnels` | `[]` | 端口转发隧道 `{name, bookName, direction=local\|remote, localPort?, remoteHost?, remotePort?, localTargetHost?, localTargetPort?, enabled}`；`bookName` 引用连接簿条目 |
| `sftpStyle` | `dialog` | SFTP 界面风格：`dialog` 单窗体 / `dual` 双栏（左本机 / 右远程，行内 `⇨/⇦` 服务端直传）；重新打开 SFTP 生效 |
| `persistence` | `off` | 会话持久化：`off` 会话随宿主生死；`tmux` 开启后**所有新开的标签默认由 tmux 托管**、可跨宿主重启恢复 |
| `endOnPageClose` | `false` | 页面断开且保活期结束时，是否连 tmux 持久会话一起结束。默认 `false` = 留存可恢复 |
| `sftpLimits` | `{maxDownloadMb: 1024, maxUploadMb: 2048, maxUploadFiles: 1000}` | SFTP 传输限制（浏览器侧保护，**0 = 不限**）；大文件请走双栏 `⇨/⇦` 服务端直传 |
| `allowProxyCommand` | `false` | 允许连接簿条目里的**代理命令在本机执行**。默认关：关着时携带代理命令的连接**明确失败**，`~/.ssh/config` 导入**永不**自动带入该字段。docker 容器面板读同一个开关。**两条提权通道**：① 启动环境变量 `DSH_TTY_ALLOW_PROXY_COMMAND=1`（只认宿主的启动环境快照）；② **就地提权**（免重启）。授权持久（`<DSH home>/dsh-kit/capability-grants.json`），重启后直接生效（见 [architecture.md § 7](../../docs/architecture.md#7-一条请求经过什么)） |
| `assistEnabled` | false | AI 辅助「失败即解释」。**默认关**：开启后命令非零退出时右下角出现徽标，点它才把该条命令的输出尾部（清洗、去重、截断、密钥遮盖后）连同当前屏幕发给模型；不发 scrollback。关着时宿主侧也拒绝 `/api/dsh-tty/assist` |
| `assistProvider` | `''` | AI 辅助的模型路由 provider；与 `assistModel` **成对**（都留空 = 跟随宿主默认模型）。只填一个既不生效、也**不会**静默回落到默认模型 |
| `assistModel` | `''` | AI 辅助的模型路由 model；与 `assistProvider` 成对 |
| `statsEnabled` | true | 服务器状态条：按标签可见性采集并推送资源指标；关闭即停表（远端 exec channel 一并关闭），保存即热生效 |
| `terminalFontFamily` | `''` | 终端字体栈：逗号分隔的 CSS 字体名，**排在内置等宽栈之前**。空串 = 只用内置栈。只影响渲染，不碰 PTY；值里的引号/反斜杠/尖括号会被清洗掉，每个名字会补上双引号（CSS 通用族除外）。改了即时重排已有终端 |
| `terminalFontSize` | 13 | 终端字号（px，8~32） |
| `terminalCursorStyle` | `bar` | 光标形态：`bar` / `block` / `underline`。终端里的程序也会写这个值（DECSCUSR），所以本插件在每批输出解析完后把被改掉的纠回；**全屏程序（vim / less / htop / fzf，备用屏幕）让位** |
| `terminalCursorBlink` | true | 光标是否闪烁。程序发的 `?12h` / `?12l` 会覆盖它，普通缓冲区里会被纠回，全屏程序让位 |
| `terminalLineHeight` | 1.35 | 行高倍数（1~2）。方块光标通常配 `1`：1.35 会把单元格撑高，光标比字形高出一截 |
| `sidebarHostAlign` | false | 侧栏「终端」入口与宿主 `.panelRow` 对齐：宽度 `calc(100% - 4px)`、`margin 0 2px`、14px 字号、16px 图标；**`min-height` 与 `padding` 在挂载时按宿主行现量**（宿主两档是 36/7 与 32/5，写死任何一档都会让另一档偏 4px），量不到时回落到 36/7。默认 false = 插件自带尺寸（纯增量样式） |

## 连接栏：连接身份与复制

SSH 标签的连接栏除了动作按钮，还把**这条连接的身份证**摆在同一行（全部只读，改连接仍走设置卡片）：

- **地址可点**：左侧 `user@host:port` 是一枚可点的胶囊，点开「连接详情」弹层：目标、连接簿条目、
  认证方式、跳板机、代理命令、持久化状态与最近一条状态。数据来自会话的 `spawnSpec` + 标签状态。
- **跳板机徽标**：配了跳板机时地址旁多一枚徽标，title 是完整的 `[user@]host[:port]`——走了 bastion
  的连接和直连在界面上本来长得一模一样，排障时最容易看错。
- **「⋯」里两个复制项**（**都不含任何凭据**）：**复制连接信息**（目标 / 条目 / 认证 / 跳板机 / 代理
  命令，每行 `标题: 值`）与**复制 SSH 命令**（可直接粘进终端，端口 / 跳板机 / 代理命令按 OpenSSH 写法
  带上）。密码、私钥路径、passphrase **一律不进剪贴板**。

## 客户端服务（给其他插件）

其他插件不需要 tty 认识自己，只通过下面三个客户端服务接入；**内置动作也走同一条注册通道**，
未注册任何扩展时行为与之前完全一致。服务名同样未声明在 tty 的 `Context` 类型面上，消费方用字符串
注入即可（可选依赖：tty 未安装或版本过低时注入不会触发）。

### 连接栏扩展点（客户端服务 `ttyConnbar`，0.13.0）

在 SSH 连接栏（SFTP / 隧道按钮那一行）追加自己的上下文按钮。显示顺序 = 注册顺序；「**⋯ 更多**」是
动作区的溢出入口，**恒排最后**（免得新插件把「更多」顶到中间）。

```js
// 消费方（如 dsh-docker）在自己的客户端半体里可选注入：tty 没装就不会触发
ctx.inject(['ttyConnbar'], (c) => {
  const dispose = c.ttyConnbar.addAction(({ tab, spec, bookName, addAction }) => {
    // 每次 renderConnbar 都会调用一次；自行决定这次要不要加按钮
    if (spec.t !== 'ssh') return
    addAction(iconSvg, '容器', '打开该主机的 Docker 容器面板', () => { /* 打开自己的面板 */ })
  })
  // 卸载时调用 dispose()
})
```

| 成员 | 说明 |
| --- | --- |
| `addAction(factory)` | 注册按钮工厂；返回注销函数。`factory` 收到 `{tab, spec, bookName, addAction}`：`spec` 是会话的 spawnSpec，`bookName` 是连接簿条目名（内联连接为 `''`），`addAction(icon, label, title, onClick)` 用 tty 的按钮样式追加一个按钮 |
| `requestRender()` | 请 tty 重新渲染连接栏（消费方异步拿到新数据后需要按钮立刻出现时用） |

- 只在 **SSH 标签**上触发；本地标签的连接栏本身是隐藏的。
- **命令标签不触发**（`spawnSpec.command` 非空，即经 `ttyTerminal.open` 跑一条命令的标签）——连接栏
  那几个扩展都作用于**连接本身**，挂在命令标签上会误导（SFTP 浏览的是宿主机，不是用户以为的容器内）。
- 工厂抛错只记 `console.warn`，不影响连接栏与内置按钮。

### 终端命令标签（客户端服务 `ttyTerminal`，0.14.0）

> **`open()` 默认复用**（契约 v3）：同一个「连接 + 命令」已有活标签时，聚焦它而**不再新开**。动机是
> 实测——容器卡片「终端」按钮连点几下就是三个一模一样的 `docker exec` 标签，而每个标签各占一个会话
> 名额。想要并列两个同样的会话，传 `reuse: false`。

比连接栏按钮更进一步：让其他插件**开一个标签直接跑一条命令**（典型是 dsh-docker 的卡片「终端」按钮
→ `docker exec -it <容器> sh`）。

```js
ctx.inject(['ttyTerminal'], (c) => {
  c.ttyTerminal.open({
    command: "docker exec -it 'demo-consumer' sh",  // 必填，单行，≤2000 字符
    book: 'lab-a',        // 二选一：连接簿条目名 → SSH 标签
    // spec: { host, port, username, auth, agentForward },  // 内联 SSH 字段
    // （都不传 = 本地标签，用 cwd 指定工作目录）
    label: 'demo-consumer · exec',
    cwd: '/optional/local/cwd',
  })
})
```

- 命令标签**不做 tmux 持久化**（命令短命，attach 无意义），也不走登录 shell；SSH 侧用
  `conn.exec(command, {pty})`，本地侧用 `sh -c 'export TERM=…; exec <同一个 shell> -c <command>'`——
  外层 `exec` 让进程就是命令本身（退出码与信号忠实），**内层 `-c` 才保证整段命令被当 shell 代码执行**
  （`cd x && cmd`、`a; b`、`for …; do …; done` 都完整跑，D78）。
- **命令标签会自动重开**：宿主重启 / 断线重连后 sid 已失效，客户端对 `spawnSpec.command` 的标签按原
  规格重新执行命令（普通非持久标签维持「点击重试」）。页面刷新后同样按原命令恢复。
- 命令来自**宿主侧插件**（不是远程用户输入），信任级与插件本身相同；tty 只校验形状：非空、单行、
  长度 ≤2000（换行会破坏本地 `-c` 包装层）。**「单行 ≤2000」是这条通道的约束，不是 `tty_open` 的**。
- **`ttyTerminal` / WS `spawn` 是「没有静态能力闸」的命令面**：本服务与 `{t:'spawn'}` 帧都直接接受
  任意 `command`，**不受任何 `DSH_*_ALLOW_*` 管辖**（本插件的那个静态闸只覆盖 ProxyCommand 这一档
  「配置字段驱动本机命令」）。这是刻意的——终端面板本身就是产品，**它的权限上界由用户的直接操作
  承担**：人点「+」开标签、人在里面敲命令。**务必看清 tier gate 管不到这里**：上面的 tier gate 挂在
  `tools/pre-execute` 瀑布上、只按 `tty_` / `sftp_` / `tunnel_` **前缀**过滤（`TTY_TIER_PREFIXES`），
  也就是只闸 **agent 工具调用**；浏览器发来的 `spawn` 帧与 `ttyTerminal.open` 是 **WS / 客户端服务**
  通道，**完全不经过它**。所以别把它当这条命令面的闸门——它一个字节都不拦（`tty_open` 那条 agent
  路径才受它管）。**代价**：任何消费方都不该把「配上 tty 之后本插件自己的 exec 开关」宣传成「进不了
  容器」的边界——装上 tty 后，页内脚本经 `ttyTerminal.open` 或 WS `spawn` 就能拿到比一次性 exec 更强的
  任意命令面。威胁模型边界见 [architecture.md § 7](../../docs/architecture.md#7-一条请求经过什么)。

> `open()` 与 `ttyPanel.mountPane()` 都会**让面板可见**：没开就开，**最小化中则恢复**——`minimize()`
> 是隐藏而不是关闭，这一条对调用方是硬保证。

### 就地嵌入终端（`ttyTerminal.mount`，0.15.0）

`open` 是「借 tty 的弹窗开一个标签」；如果消费方希望**在自己的面板里就地放一块终端**（典型是
dsh-docker 的终端抽屉），用 `mount`：

```js
ctx.inject(['ttyTerminal'], (c) => {
  if (Number(c.ttyTerminal.version ?? 0) < 2) { /* 老版本：退回 open */ }
  const dispose = c.ttyTerminal.mount(hostEl, {
    command: "docker exec -it 'demo-consumer' sh",  // 与 open 同一套 options
    book: 'lab-a',                                     // book > spec > 本地
    label: 'demo-consumer · exec',
  })
  // 收起自己的抽屉时：
  // dispose()
})
```

- `hostEl` 需是 `HTMLElement`：tty 往里塞一个绝对定位的 `.tt_term`，所以挂载点要 `position: relative`
  且有确定尺寸（尺寸变化会被 ResizeObserver 接住并同步给 PTY）。
- 嵌入终端与标签**共用同一条 WebSocket 与会话表**，但不进标签栏、不写 sessionStorage、不参与 tty 面板
  的显隐；**tty 面板关闭不会波及它**。
- 断线自动重连、宿主重启后按原命令重跑、退出后点击遮罩重开，全部沿用既有逻辑；`dispose()` 结束会话
  并卸载 DOM。挂载是**冷启动安全**的——tty 面板没开、连接还没建，`mount` 也会把连接拉起来。
- 嵌入终端没有 tty 面板头部的搜索/清屏工具栏，Ctrl+F 交还浏览器。

### 面板内挂载位（客户端服务 `ttyPanel`，0.16.0）

> tty 自己的 SFTP 文件浏览也走这条通道：挂载位空着时挂在下方，被同标签的别的面板占用时退回对话框。

`mount` 解决的是「消费方给宿主，tty 往里塞终端」；`ttyPanel` 是它的**镜像**——tty 在终端面板里给消费方
一块位置，让消费方把自己的界面挂进来（典型：dsh-docker 从连接栏点「容器」，容器面板挂在终端**右侧**，
终端继续可见、可点、可输入）。

```js
ctx.inject(['ttyPanel'], (c) => {
  // 面板没开（或 tty < 0.16）时走自己的弹窗
  if (Number(c.ttyPanel.version ?? 0) < 1 || c.ttyPanel.isOpen() !== true) { /* fallback */ }
  const pane = c.ttyPanel.mountPane({
    title: 'Docker 容器',  // 面板标题
    hint: 'prod-web-01',   // 标题右侧灰字（可选）
    side: 'right',         // 'right'（默认）| 'bottom'（横向宽表）
    size: 520,             // 初始尺寸 px：right = 宽度（默认 460）、bottom = 高度（默认 320）
    min: 360,              // 最小尺寸 px（可选，默认 280 / 160）
    ownerSid: tab.sid,     // 归属标签（可选）：省略 = 当前活动标签，null = 不隶属任何标签
    onClose: () => { /* tty 收掉面板时回调：在这里 unmount 自己的 React root */ },
  })
  createRoot(pane.element).render(<MyPanel />)
  // 自己收起时：pane.dispose()
})
```

| 成员 | 说明 |
| --- | --- |
| `isOpen()` | 终端面板是否正开着（最小化不算）。消费方据此决定「挂进来」还是「走自己的弹窗」 |
| `mountPane(options)` | 在面板右侧 / 下方挂一块位置并返回 handle；**同时只挂一个**，后来的会先收掉前一个（并回调它的 `onClose`）。`side:'bottom'` 时占满宽度、由高度定尺寸（拖上边缘），可折叠成一条标题栏。`ownerSid` 记归属标签（默认当前活动标签），切换标签时归属别的标签的 pane 会被**收起**（DOM 与 React 树保活，切回来恢复） |
| `handle.element` | 消费方 render 的宿主（flex 纵向、已 `overflow:hidden`，撑满正文区） |
| `handle.setTitle(text)` / `setHint(text)` | 改标题 / 灰字 |
| `handle.expand() / collapse() / toggle() / isCollapsed()` | 折叠成 32px 窄条（竖排标题 + 展开/关闭按钮），终端立刻拿回宽度 |
| `handle.dispose()` | 消费方主动收起（幂等，不会再触发 `onClose`） |

- **生命周期**：侧栏的 DOM 长在终端弹窗里——最小化 / 恢复跟着面板走；面板被关闭时 tty **先调
  `onClose`**（消费方在这里 unmount），随后才摘 DOM。
- **拖尺寸**：右侧 pane 拖左边缘、下方 pane 拖上边缘（上限 = 面板卡片长边的 72%），尺寸在同一次页面
  会话内按方向分别记住；终端区尺寸变化由既有 ResizeObserver 接住，自动 refit 并同步行列数给 PTY。
- **视口锚定**：pane 开合 / 拖尺寸会改变终端区高度，refit 时按用户当时的意图锚定——本来贴着底部就
  继续贴底，翻在历史里就锁住原来那几行，不会跳走。
- **方向怎么挑**：竖向列表 / 列表+详情用 `right`；横向宽表（文件列表、双栏）用 `bottom`。

**`minimize()`（契约 v2）** 把整个终端面板折进去：弹窗藏起来，但 DOM / WebSocket / xterm 缓冲全保留、
**会话继续跑**；恢复靠侧边栏「终端」入口上的徽标。消费方用它「把舞台让出去」。

```js
ctx.inject(['ttyPanel'], (c) => {
  if (Number(c.ttyPanel.version ?? 0) < 2 || typeof c.ttyPanel.minimize !== 'function') return false
  if (c.ttyPanel.isOpen() !== true) return false
  return c.ttyPanel.minimize()   // 折起终端，让会话露出来
})
```

> 契约版本：`ttyConnbar.version === 1`、`ttyTerminal.version === 3`（1 = 只有 `open`，2 = 增加 `mount`，
> 3 = `open` 默认复用同「连接 + 命令」的活标签）、`ttyPanel.version === 2`（1 = `mountPane` + `isOpen`，
> 2 = 增加 `minimize`）。消费方**按版本号判断能力**。老版本 tty 上 `inject` 依然会触发，但没有对应字段。

## 帧协议（/api/dsh-tty/ws，JSON 文本帧；v3 = 单连接多会话 + 断线重连）

| 方向 | 帧 | 说明 |
| --- | --- | --- |
| C→S | `{t:'spawn', sid?, cols?, rows?, cwd?, persist?, persistName?, command?}` | 创建会话；sid 缺省由宿主生成，cwd 缺省用配置兜底；`persist` + 稳定 `persistName` = tmux 持久会话（需 persistence=tmux）；`command` = 直接跑一条命令（不做持久化） |
| C→S | `{t:'ssh', sid?, cols?, rows?, name? \| host, username, …, persist?, persistName?}` | 创建 SSH 会话（ssh2 原生）；`name` 引用连接簿条目作基底，内联字段可逐项覆盖；`persist` 语义同 spawn |
| C→S | `{t:'input', sid?, d}` | 按键/粘贴数据 |
| C→S | `{t:'resize', sid?, cols, rows}` | 面板尺寸变化。**客户端只在容器可见且尺寸可信时发**（D79）；宿主的夹紧只做安全下限，非数值按非法值回落 80×24 |
| C→S | `{t:'refresh', sid?}` | 强制重画：宿主对 tmux 会话执行 `refresh-client`（非 tmux 会话 no-op） |
| C→S | `{t:'kill', sid?}` | 关闭会话（孤儿会话也允许跨连接 kill，防泄漏） |
| C→S | `{t:'sessions'}` | 列出全局会话快照（`attachable` 标记可重连者） |
| C→S | `{t:'attach', sid}` | 重连孤儿会话（保活窗口内）：`ready(reattached:true)` 后紧跟一帧 `data` 回放输出缓冲 |
| C→S | `{t:'statsOn' \| 'statsOff', sid}` | 订阅/退订该会话的服务器状态条：按标签可见性驱动，宿主只在有订阅时采集 |
| S→C | `{t:'ready', sid, pid, kind, target?, persist?, reattached?}` | 会话就绪；`kind:'local'` 带 pid，`kind:'ssh'` 时 pid=null、target=user@host[:port] |
| S→C | `{t:'data', sid, d}` | 终端输出（utf8 文本，StringDecoder 兜跨帧多字节序列）；**12ms 窗口/64KB 阈值合并成帧**，exit/kill 前强制冲刷保证帧序（D76） |
| S→C | `{t:'stats', sid, stats}` | 资源指标帧：`{cpuPct, cores, memUsed, memTotal, memPct, diskUsed, diskTotal, diskPct, uptimeSec, tcpConns, rxRate, txRate, tempC?, load1?, swapUsed?, swapTotal?, pingMs?}`；缺失字段即省略，字节类为 bytes、速率为 B/s |
| S→C | `{t:'exit', sid, code, signal}` | PTY 退出事实（恰好一次；attach 换连接后仍随当前连接送达） |
| S→C | `{t:'error', sid?, m}` | 错误 |
| S→C | `{t:'sessions', list, tmux?}` | 会话快照（`{sid, kind, target, pid?, cwd, startedAt, lastOutputAt, attachable, persist?}`）；`tmux` = 专用 socket 上现存的持久会话名 + SSH 持久会话留存名 |

断线保活语义：客户端正常关面板会先逐个发 `kill` 再断开；因此「WS close 且仍有存活会话」判定为异常
断开——会话转入孤儿状态（输出继续积累进环形缓冲），保活 `reconnectGraceSec` 后由回收器清理；期间
新连接可 `{t:'sessions'}` 查询 + `{t:'attach', sid}` 重连回放。

sid 省略时按「该连接唯一会话」路由；连接上存在 0 或多个会话时省略 sid 会报错。upgrade 路由带 loopback
信任围栏（remoteAddress + Host + Origin 校验），仅本机 Web GUI 可连。

## 开发

```bash
pnpm --filter @hyzyn/dsh-tty build        # tsc 宿主 + esbuild 浏览器半体（client.js）
pnpm --filter @hyzyn/dsh-tty typecheck
pnpm --filter @hyzyn/dsh-tty probe        # M0 探针：PTY 原语验证（需真实 PTY）
pnpm --filter @hyzyn/dsh-tty integration  # 集成测试：真实插件 × 真实 DSH 服务组合
pnpm --filter @hyzyn/dsh-tty live         # 存活冒烟：需先起 dsh web
pnpm --filter @hyzyn/dsh-tty tui          # TUI 冒烟：vim/htop 全屏渲染（需先起 dsh web）
pnpm --filter @hyzyn/dsh-tty ssh-smoke    # SSH 冒烟：内存 SSH server × 真实 spawnSsh 端到端
pnpm --filter @hyzyn/dsh-tty probe-smoke        # 试连分类与 TOFU
pnpm --filter @hyzyn/dsh-tty probe-route-smoke  # 试连 HTTP 路由 + 连接簿
pnpm --filter @hyzyn/dsh-tty sftplimits-smoke   # sftpLimits 配置归一化
pnpm --filter @hyzyn/dsh-tty windows-smoke      # Windows 端到端（其他平台打印原因后跳过）
pnpm --filter @hyzyn/dsh-tty preview      # 视觉预览：headless Chrome 逐场景截图（见下）
```

CI（`.github/workflows/ci.yml`）在 ubuntu 跑 `integration` + `ssh-smoke` + 三个 smoke，在 windows-latest
跑 `windows-smoke`，另有一道「构建产物与源码一致」闸门（`client.js` + `lib/`）。缺陷台账见
[`DEFECTS.md`](./DEFECTS.md)。

浏览器半体源码在 `client-src/index.js`，样式表独立成 `client-src/tty.css`（由 esbuild 的 text loader
内联进 `client.js`）。改客户端后需重新 `pnpm build` 并刷新页面（可能需硬刷新）。

### 视觉预览 / 截图回归（`scripts/preview.mjs`）

改样式不该靠「刷新页面看一眼」：脚本把 `client.js` 装进一个纯静态夹具页（`scripts/preview/harness.html`
+ `mock-host.js` 伪造的 DSH 宿主），用 headless Chrome 把**每一个**界面状态逐个渲染并截图到
`packages/tty/.preview/shots/`（场景清单与条数以 `node packages/tty/scripts/preview.mjs --list` 为准，
本文件不写死）：

```bash
node scripts/preview.mjs                 # 全场景
node scripts/preview.mjs local menu ssh  # 指定场景
node scripts/preview.mjs --list          # 列出场景
node scripts/preview.mjs --theme=light   # 浅色主题
```

覆盖：本地终端 / 多标签 + SSH 连接栏 / 「+」菜单 / SSH 对话框 / 设置卡片 / SFTP / 挂载位跟着标签切 /
最小化徽标 / 退出提示条与错误遮罩 / 批量关标签（含确认层）/ 隧道弹层 / 搜索框 / toast / 嵌入式终端 /
docker 面板与「容器 → 终端抽屉」。

场景可以把**函数形态**的断言挂到 `window.__previewAssert`（返回 `null` = 通过，返回字符串 / 数组 =
失败），脚本会跑掉它并把结果计入 `✓/✗`。夹具还会把 `--dsw-*` 皮肤变量与真实界面一并渲染，因此能验
「明暗主题切换后是否还有白色面板」。产物目录 `.preview/` 已 gitignore。

> 夹具里的 `ctx.inject` 与真实 cordis 同语义：**依赖里有一个服务不存在就不触发回调**，而不是把
> `undefined` 塞进 scope。夹具需要 Chrome/Chromium（默认找 playwright 缓存的 Chrome for Testing，也可用
> `CHROME_PATH` 指定）。

## 已知限制

- **反代 / 另一台机器访问下不可用**：非本机请求一律 403（含只读路由）——本插件的路由里是 PTY / SSH / SFTP 这类执行面，不开放给远程会话（评估与取舍见 [ROADMAP.md](../../ROADMAP.md) 第 5 项 § 5.4）。需要从另一台机器用时走 **SSH 隧道**：`ssh -L 3080:127.0.0.1:3080 <host>` 后访问 `http://localhost:3080`——宿主侧来源是回环、Host 是 `localhost`，围栏直接放行，会话 cookie 也按该 authority 铸造。
- **resize 为内部耦合**：DSH 的 `spawnTerminal` handle 未暴露 resize，插件直接透传
  `(handle).terminal.resize(cols, rows)`（node-pty 原生 API）。DSH 升级若改内部结构，0.3.0 起会警告一次
  并退化为固定尺寸，不再逐帧抛错（D79）。
- **TERM 注入用 `-c` 包装层（仅 POSIX）**：DSH 硬编码 node-pty `name:"dumb"`，而 node-pty 里 name
  优先于 env.TERM，因此 shell 以 `sh -c 'export TERM=...; exec "$shell"'` 方式启动（对用户透明；
  TERM / COLORTERM 值做白名单校验）。**Windows 上没有这一层**。
- **Windows 宿主**：本地终端可用，但 shell 集成 / tmux 持久化 / 磁盘·TCP·网速·温度不适用或拿不到
  ——完整边界见「Windows 宿主」一节。
- **terminate() 有「幸存者」竞态**：DSH 树级清理偶发报 `terminal cleanup failed; surviving pids`，
  插件按 best-effort 处理（失败降级对顶层 shell 直接 SIGKILL），退出码/信号可能为 null。
- **输出为 utf8 文本流**：非 UTF-8 字节会被替换字符吃掉（如 `cat` 二进制文件），属预期行为；跨 chunk
  的多字节 UTF-8 序列已由 StringDecoder 兜住，中文高速输出不再花。
- 浏览器半体依赖官方 `dsh-web-app` 的侧边栏结构（`[data-pane="sidebar"]`），非官方 Web GUI 可能不显示入口。
- **断线保活窗口有限**：异常断开后会话仅在 `reconnectGraceSec` 内保活可重连，宿主进程重启则所有会话
  结束；输出缓冲（尾部 256KB）之外的滚动历史无法恢复。
- **shell 集成仅 zsh / bash / PowerShell**：其他 shell 自动跳过（`tty_capture{last}` 会明确报错而非错报）。
  bash < 4.4 走 DEBUG trap 兜底：循环体等复合命令的内部命令会多发 B 标记，`tty_capture{last}` 对这类
  命令只截取最后一个内部命令之后的输出（退出码与 `tty_expect` 不受影响）。用户 rc 若覆盖
  `PROMPT_COMMAND`/钩子数组，集成可能失效。
- **端口转发边界**：本地监听固定 127.0.0.1（不暴露局域网）；remote 方向还受服务端 sshd `GatewayPorts`
  限制；隧道规格变更经「保存」热生效，热改连接簿凭证则在下次重连时生效。
- **会话持久化（tmux）边界**：持久标签由 tmux server（专用 socket，按 profile 区分）托管——宿主被硬杀 /
  保活回收 / 浏览器丢失标签规格时，tmux 会话会**留存**（这正是恢复能力的前提），直到机器重启或手动
  `tmux -L <socket> kill-server`；`tty_capture{last}` 依赖 tmux ≥3.3 的 DCS `allow-passthrough`，更低版本
  持久化可用但该能力降级；恢复接回重画的是当前可见屏，断线前的滚动历史在 tmux 自己的 history buffer
  里；持久标签的 `exit` 帧退出码是 tmux 客户端的（0），shell 退出码经 OSC 133;D 标记照常可用；
  `tmux.conf` 只在 tmux server 首启时读取；`grace=0` 对持久标签同样会 kill-session；持久 SSH 会话要求
  远程装有 tmux（未装自动降级）；**两个窗口同时接回同一持久会话**时共享同一个宿主 PTY，名额不翻倍。
- **SFTP 边界**：文件权限 = 对应 SSH 账号的终端权限（无额外沙箱/chroot）；下载经浏览器内存（超大文件
  建议终端 `scp`/`rsync`）；agent 工具 `sftp_read` ≤1MB 且拒绝二进制、`sftp_write` 单次 ≤1MB；覆盖写走
  同目录临时分片 `.dsh-part-<uuid>` + rename 原子落盘，崩溃时可能留下分片孤儿（下次覆盖上传会自动清理
  超过 24h 的残留）。
- **SSH host key 为 TOFU 钉扎**：首次连接若已遭遇 MITM 则记录的就是伪指纹；指纹变更需人工在设置卡片
  确认并删除记录。
- **浏览器标签持久化不含明文凭证**：SSH 标签写入 sessionStorage / localStorage 的规格副本会剥掉明文
  `password` / `passphrase`（`env:` 引用保留），并打 `credsStripped` 标记——恢复/重开时提示重新输入。
- **服务器状态条边界**：远端靠两跳兜底（POSIX → PowerShell），**macOS/BSD 远端**两跳都不成立、状态条
  整条隐藏；Linux 上 CPU 温度只在暴露 `/sys/class/thermal` 的机器上有；磁盘固定取 `/`（Windows 取系统盘）
  所在文件系统；本地会话的指标属于**宿主机器**（多个本地标签共享同一份采样），macOS 温度恒为「无」，
  内存按 vm_stat 的 active+wired+compressed 计；指标是**瞬时值**，没有历史接口（前端自己攒 60 个采样）。
- **SSH 会话没有本地 pid**：ssh2 shell channel 不是本机进程，`ready.pid` 为 `null`、`tty_list` 显示
  `target` 而非 pid，本机 `ps` / `kill` 对远程进程无效——关闭请用标签 ✕ 或 `kill` 帧。

## 工作原理

```
浏览器半体 (client.js, esbuild bundle)
  ├─ 侧边栏「终端」入口 → 大弹窗
  ├─ 标签栏：每标签一个 xterm.js 实例（独立 sid；WebGL 渲染器，丢失回退 DOM）
  ├─ 断线重连：指数退避自动重连 + sessions 查询 + attach 恢复；
  │  标签列表存 sessionStorage（刷新后按 sid 重连保活会话）
  ├─ sessions 客户端服务：新标签带当前会话 cwd
  └─ WebSocket ──→ /api/dsh-tty/ws (webServer.registerUpgrade)
                        │
宿主半体 (src/index.ts)
  ├─ 连接内会话表（sid → 本地 PTY / SSH channel，单连接多会话）
  ├─ SessionManager（maxSessions 上限，热调整；SSH 会话同表调度；
  │  孤儿回收器按 reconnectGraceSec 清理异常断开的会话）
  ├─ 每会话 256KB 环形缓冲（tty_capture / 断线回放）+ xterm-headless
  │  虚拟屏（tty_screen）+ StringDecoder（utf8 分帧兜底）
  ├─ shell 集成（src/shell-integration.ts）：zsh ZDOTDIR / bash --rcfile
  │  桩注入 OSC 133/7 钩子；输出流解析（feedShellIntegration，跨 chunk
  │  残包 carry）→ 命令边界捕获（tty_capture{last} / tty_expect 早停）
  │  与 cwd 跟随（tty_list）
  ├─ 本地路径：ctx.get('subprocess').spawnTerminal({ argv: shell -c 包装层, cwd })
  │  持久标签：包装层换 `exec tmux -L <socket> -f <conf> new -A -s dsh-<名>`
  │  （src/tmux.ts：探测/资产生成/spawn 计划/kill-session；稳定资产在
  │  <DSH_HOME|~/.dsh>/tty/；tmux 会吞不认识的序列，集成钩子在 $TMUX 下把
  │  OSC 133/7 包 DCS passthrough 信封，tmux ≥3.3 解包转发）
  ├─ 辅助路由：/api/dsh-tty/ssh-config（~/.ssh/config 导入候选）、
  │  /api/dsh-tty/credential-refs（凭据存储里已知的引用名）、
  │  /api/dsh-tty/env-vars、/api/dsh-tty/known-hosts、/api/dsh-tty/shells
  │  ——均 loopback 围栏（加固档：127/8 全段 + 主机名 DNS 确认 + 来源检查在
  │  DNS 之前，实现只有一份在 @hyzyn/dsh-kit）；**改状态的端点另需同源证明**，
  │  只读端点（含 sftp /list 与 /download）不要求证明。POST /config 刻意豁免
  │  ——它是插件被禁用后唯一的恢复入口
  ├─ SFTP（src/sftp.ts）：懒连接池（空闲 120s 回收、断开按需重连、TOFU 共用）
  │  → POST /api/dsh-tty/sftp/list|mkdir|rename|remove|download|upload
  │  + sftp_* 工具（只收连接簿名）
  ├─ 端口转发（src/tunnels.ts）：宿主自持隧道（-L/-R 双向），断线退避重连、
  │  TOFU 共用、连接计数；GET /api/dsh-tty/tunnels 实时状态 + tunnel_list
  └─ 帧协议：spawn|ssh / input / resize / kill / sessions / attach
     ↔ ready/data/exit/error/sessions + 背压

SSH 路径 (src/ssh.ts)
  └─ {t:'ssh'} → spawnSsh：ssh2 Client 原生连接（agent / key / password，
     password·passphrase 支持 env:VAR 取密；host key 经 HostKeyStore
     TOFU 钉扎），开 shell channel 包装成与 PTY 同形状的 TermHandle
     （pid=null，kind='ssh'，target=user@host[:port]），背压一并透传；
     persist 时先探测 tmux 再 `exec tmux -L <socket> -f /dev/null new -A -s dsh-<名>`
     开 pty channel（无 tmux 降级普通 shell channel + 灰字提示）
```

M0 探针、集成测试与真实实例冒烟（live / TUI）在真实 DSH 服务组合上验证过：TERM 注入、resize 透传、
sid 冲突、并发上限、loopback 围栏、多会话数据隔离、cwd 跟随与校验、配置热生效、kill→exit 全链路、
断线保活 + sessions/attach 重连回放、tty_screen 虚拟屏、ANSI 清洗、shell 集成、`tty_expect`、端口转发、
SFTP 与管理闭环、会话持久化；SSH 路径由 `ssh-smoke`（内存 SSH server × 真实 `spawnSsh`）覆盖。逐项
覆盖清单与各轮真机验收记录见 [ROADMAP § 已完成](./ROADMAP.md#已完成落点--门槛)。
