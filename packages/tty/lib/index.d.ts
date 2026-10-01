/**
 * @hyzyn/dsh-tty — DSH Web GUI 的终端面板插件（宿主半体）。
 *
 * 机制：浏览器半体打开「终端」大弹窗后，经 WebSocket 连接
 * /api/dsh-tty/ws（webServer.registerUpgrade 注册的 upgrade 路由），
 * spawn 帧创建真实 PTY 会话（ctx.subprocess.spawnTerminal，node-pty），
 * 之后双向透传：input/resize/kill 上行，data/exit/error 下行。
 *
 * 帧协议 v3（JSON 文本帧；sid 维度支持单连接多会话/标签页 + 断线重连）：
 *   C→S  {t:'spawn', sid?, cols?, rows?, cwd?, persist?, persistName?}
 *                                              创建本地会话；sid 缺省时宿主生成；
 *                                              persist=true 且配置 persistence=tmux
 *                                              时以 tmux 持久会话托管（0.10.0）
 *   C→S  {t:'ssh', sid?, cols?, rows?, name? | host, username, ...,
 *         persist?, persistName?}              创建 SSH 会话（ssh2 原生，见 ssh.ts）；
 *                                              name 引用连接簿条目，内联字段可覆盖；
 *                                              persist 语义同 spawn（远程 tmux 托管）
 *   C→S  {t:'input', sid?, d}                  按键/粘贴数据
 *   C→S  {t:'resize', sid?, cols, rows}        xterm fit 触发
 *   C→S  {t:'refresh', sid?}                   请宿主 refresh-client 强制 tmux
 *                                              重画（tmux 会话；非 tmux no-op）
 *   C→S  {t:'kill', sid?}                      关闭会话（孤儿会话也可跨连接 kill；
 *                                              tmux 会话先 kill-session 再杀客户端）
 *   C→S  {t:'sessions'}                        列出全局会话（attachable 标记可重连者）
 *   C→S  {t:'attach', sid}                     重连孤儿会话（断线保活窗口内）：
 *                                              ready 后紧跟一帧 data 回放输出缓冲
 *   S→C  {t:'ready', sid, pid, kind, target?, persist?, reattached?}
 *                                              会话就绪（ssh 时 pid=null，target=user@host；
 *                                              persist=true 表示 tmux 持久会话）
 *   S→C  {t:'data', sid, d}                    终端输出（utf8 文本，StringDecoder 兜多字节分帧）
 *   S→C  {t:'exit', sid, code, signal}         PTY 退出事实（恰好一次）
 *   S→C  {t:'error', sid?, m}                  错误
 *   S→C  {t:'sessions', list}                  会话快照（attachable=true 表示前连接已断、可 attach）
 *   C→S  {t:'statsOn'|'statsOff', sid}        订阅/退订该会话的服务器状态条（0.17.0，
 *                                              按标签可见性驱动：首个 statsOn 才启动采集，
 *                                              退订清零即停表并关远端 exec channel）
 *   S→C  {t:'stats', sid, stats}               资源指标帧（0.17.0）：cpuPct/cores/memUsed/
 *                                              memTotal/memPct/diskUsed/diskTotal/diskPct/
 *                                              uptimeSec/tcpConns/rxRate/txRate/tempC；缺失
 *                                              即省略（best-effort），字节类为 bytes、速率为 B/s
 * 省略 sid 时按「该连接唯一会话」路由；连接上存在 0 或多个会话时省略 sid 报错。
 * 旧脚本（spawn 不带 sid）自动兼容：宿主生成 sid，响应帧多带 sid 字段。
 *
 * 断线保活：客户端正常关面板会先逐个 kill 再断开；因此「WS close 且仍有
 * 存活会话」判定为异常断开（刷新/网络抖动），会话转入孤儿状态保活
 * reconnectGraceSec（默认 120s，0 = 旧行为立即结束），等待新连接 attach
 * 并回放 256KB 环形缓冲；到点由回收器清理。
 *
 * shell 集成（src/shell-integration.ts，0.4.0）：spawn 时经 -c 包装层注入
 * OSC 133/7 钩子（zsh ZDOTDIR 桩 / bash --rcfile 桩），输出流解析出命令
 * 边界（tty_capture{last} / tty_expect 早停）与实时 cwd（tty_list）。
 * 辅助路由：/api/dsh-tty/ssh-config（~/.ssh/config 导入候选）、
 * /api/dsh-tty/credential-refs（凭据存储里已知的引用名，SSH 对话框选择器候选，只要名字）、
 * /api/dsh-tty/env-vars（env 插件托管变量名；SSH 对话框已改从连接簿 + 凭据存储取候选，此路由保留兼容）、
 * /api/dsh-tty/shells（设置卡片「Shell 路径」候选，仅路径）、
 * /api/dsh-tty/sftp/*（SFTP 文件传输 0.7.0：list/mkdir/rename/remove/
 * download/upload；0.8.0 起 mkdir 支持 parents 逐级补齐，spec 解析与
 * WS ssh 帧同款，见 src/sftp.ts）。
 *
 * M0 探针（scripts/probe.mjs）验证过的三个关键结论：
 *   1. TERM 必须用 `shell -c 'export TERM=...; exec "$shell"'` 包装层注入——
 *     DSH 的 spawnTerminal 硬编码 node-pty name:"dumb"，且 node-pty 里
 *     name 优先于 env.TERM，直接传 env 覆盖无效；
 *   2. resize 通过 (handle).terminal.resize(cols, rows) 透传 node-pty 原生
 *     API（DSH 的 terminal handle 未暴露 resize，属内部耦合，见 README）；
 *   3. terminate() 偶发「幸存者」竞态（SIGTERM→SIGKILL 升级后仍扫描到存活
 *     子进程），必须 best-effort：失败降级为对顶层 shell 直接 SIGKILL。
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { PassThrough } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import WebSocket from 'ws';
import xtermHeadless from '@xterm/headless';
declare const HeadlessTerminal: typeof xtermHeadless.Terminal;
type HeadlessTerminal = InstanceType<typeof HeadlessTerminal>;
import type { HostKeyRecord, SshHostEntry, TermHandle } from './ssh.js';
import type { TunnelSpec } from './tunnels.js';
import type { StatsFrame } from './stats.js';
export type { HostKeyRecord } from './ssh.js';
export interface Config {
    /** 关闭整个插件。默认开。 */
    enabled?: boolean;
    /** 是否向 agent 注入插件能力公告。默认开。 */
    announceToAgent?: boolean;
    /** 并发 PTY 会话上限（1~16）。默认 4。 */
    maxSessions?: number;
    /** shell 路径；缺省 $SHELL（macOS 上通常 /bin/zsh）。 */
    shell?: string;
    /** TERM 值（经 -c 包装层注入）。默认 xterm-256color。 */
    term?: string;
    /** COLORTERM 值。默认 truecolor。 */
    colorTerm?: string;
    /** 会话工作目录（客户端 spawn 带 cwd 时优先）；缺省为宿主进程启动目录。 */
    cwd?: string;
    /** SSH 连接簿（面板「+」菜单可选；密码/口令支持 env:VAR 引用）。 */
    sshHosts?: SshHostEntry[];
    /** 异常断开后会话保活秒数（0 = 立即结束；默认 120，最大 3600）。 */
    reconnectGraceSec?: number;
    /** 已记录的 SSH 主机密钥指纹（TOFU 钉扎，按 host:port 唯一）。 */
    hostKeys?: HostKeyRecord[];
    /** 是否注入 OSC 133/7 shell 集成（命令边界标记 + cwd 上报）。默认开。 */
    shellIntegration?: boolean;
    /** 端口转发隧道（引用连接簿条目；宿主自持连接与重连，见 src/tunnels.ts）。 */
    tunnels?: TunnelSpec[];
    /** SFTP 文件浏览界面风格：dialog = 单窗体（默认）/ dual = 本机+远程双栏。 */
    sftpStyle?: 'dialog' | 'dual';
    /** 会话持久化：off = 会话随宿主生死（默认）；tmux = 「持久终端」标签由 tmux server 托管，可跨宿主重启恢复。 */
    persistence?: 'off' | 'tmux';
    /** 页面（最后一个连接）断开且保活期结束时，是否连 tmux 持久会话一起结束（默认 false = 留存可恢复）。 */
    endOnPageClose?: boolean;
    /** SFTP 传输限制（0 = 不限）。 */
    sftpLimits?: Partial<SftpLimits>;
    /** 服务器状态条（0.17.0）：是否采集并推送会话资源指标（CPU/内存/磁盘/uptime/TCP/网速/温度）。默认开。 */
    statsEnabled?: boolean;
    /**
     * AI 辅助「失败即解释」（0.24.0）：**默认关**（见下方 assistProvider 的成对规则）。
     *
     * 打开后，命令以非零状态结束时宿主会把**那条命令的输出尾部**（经清洗、去重、截断
     * 与轻量遮盖）发给模型，换回一段「发生了什么 / 下一步」。所以这个开关不只是功能开关，
     * 它同时是一次**数据外发**的授权——默认关，卡片上必须把这件事写清楚。
     */
    assistEnabled?: boolean;
    /** AI 辅助的模型路由 provider；与 assistModel **成对**（都留空 = 跟随宿主默认模型，只填一个按未配置处理）。 */
    assistProvider?: string;
    /** AI 辅助的模型路由 model；与 assistProvider 成对。 */
    assistModel?: string;
    /**
     * 允许 ProxyCommand（本机命令执行）：**默认关**。
     *
     * 本插件唯一「由设置字段驱动本机任意命令执行」的开关，与跳板机（只连一跳 TCP）不同档：
     * 关着时携带 `proxyCommand` 的连接**明确失败**（不退回直连），`~/.ssh/config` 导入也
     * 永不自动带入该字段——要用的条目必须自己开开关再手填。
     */
    allowProxyCommand?: boolean;
    /** 内部状态：SSH 持久会话名（远程 tmux 托管，本机 socket 清单看不到，随 settings 留存供新窗口恢复确认）。 */
    persistSessions?: Array<{
        tmuxName: string;
    }>;
}
/** SFTP 传输限制（均为 0 = 不限；客户端浏览器侧执行，宿主不做总量闸）。 */
export interface SftpLimits {
    /** 单文件下载上限（MB）。默认 1024。 */
    maxDownloadMb: number;
    /** 单文件上传上限（MB）。默认 2048。 */
    maxUploadMb: number;
    /** 一次批量/拖拽上传的文件数上限。默认 1000。 */
    maxUploadFiles: number;
}
/**
 * 运行时 Config schema——DSH ≥0.1.7 起同时就是本插件的 settings 存储。
 *
 * 全部字段都标 `.volatile()`：它们都是「插件配置 → 终端面板」卡片可改项，而
 * `settings.update(entryId, patch)` 只接受 volatile 路径；loader 对 volatile-only
 * 变更原地更新引用并发 `loader/volatile-update`，不重挂插件——插件订阅后走
 * `applyPatch` 热应用（见 @hyzyn/dsh-kit 的 settingsEntryScope）。
 */
export declare const Config: z;
/**
 * 会话退出后的**只读保留策略**（D77）。
 *
 * 进程没了之后把会话留在 `sessions` 表里：`tty_list` / `tty_capture` / `tty_screen`
 * 照常能读到它最后那些输出（用户上报的痛点原话：「结果明明就在那里但我看不到」——
 * `tty_open` 跑一条命令，跑完会话就退役，AI 一个字符都取不回来，逼得人先开
 * `/bin/sh` 再往里发命令）。
 *
 * 取 **∞ = 保留到显式关闭**（`tty_close` / 面板关标签 / 宿主重启），不由时间淘汰：
 *
 * - 时间上界对用户是**第二重惊喜**——「命令跑完 → 下一轮读结果」之间隔着人离开、
 *   模型排队，多久都有可能；一个到期就消失的输出比「要主动关」更难理解；
 * - 内存与句柄本来也不由时间决定：条数由 [`MAX_EXITED_SESSIONS`](#) 兜（16 条，
 *   单条几百 KB~一两 MB），而「永久」还有一条天然上界——保留是**内存态**，
 *   宿主 / 插件重启即清空，不会跨天累积；
 * - 连续跑很多短命令时，淘汰节奏变成「超过 16 条按最旧淘汰」（`capExited`），
 *   正是想要的语义：近的才有人读。
 *
 * 需要时间上界的人把这里改成任意毫秒数即可——`reapExited` 那条通路还在
 * （回收器每轮都会调它）。导出仅供单测（test/host-frames.test.ts）：到点退役与
 * 条数上限的行为护栏。
 */
export declare const EXITED_RETAIN_MS: number;
/**
 * 只读保留的会话数上限（超出按最旧淘汰，见 SessionManager.capExited）。
 *
 * 与「并发会话上限」（maxSessions，默认 4）是两个口径：那个数**只数活着的会话**
 * （retained 的不占名额，否则跑几条短命令就把面板顶成「会话数已达上限」，
 * 比原缺陷更糟）。这里兜的是内存：每条 retained 约 = 256KB 环形缓冲 + 一块
 * xterm-headless 虚拟屏，16 条仍在 ~20MB 量级。
 *
 * 为什么从 8 抬到 16（D77 补，2026-09-27 真机验收反馈）：保留改成「留到显式关闭」
 * 之后，上限就是唯一会**自动**挤掉结果的东西，而 agent 一口气开二十几条一次性
 * 会话是常态——8 条意味着「几分钟前那份结果」被最旧淘汰挤掉，用户只看到「没了」。
 * 淘汰一律 `logger.warn` 留痕（见 finishSession），否则这件事在事后完全不可查。
 */
export declare const MAX_EXITED_SESSIONS = 16;
/** DSH spawnTerminal 返回 handle 的最小形状（含内部耦合的 terminal 字段）。 */
interface PtyHandle {
    pid: number;
    output: PassThrough;
    write(data: string): Promise<unknown>;
    terminate(): Promise<unknown>;
    done: Promise<{
        exitCode: number | null;
        signal: string | null;
    }>;
    /** 内部耦合：DSH 的 LocalTerminalHandle 未暴露 resize/kill，直接透传 node-pty。 */
    terminal?: {
        resize?(cols: number, rows: number): void;
        kill?(signal: string): void;
    };
}
/** 本地 PTY 包装成 TermHandle（resize/kill 仍是透传 node-pty 的内部耦合；防御性降级）。 */
export declare function wrapLocalPty(handle: PtyHandle): TermHandle;
/**
 * 本地 PTY 顶层 shell 的 best-effort 强杀（D48）。
 *
 * **Windows 绝不能带 signal**：node-pty 的 `WindowsTerminal.kill(signal)` 会同步
 * `throw new Error('Signals not supported on windows.')`，而且它内部 `_deferNoArgs`
 * 会把回调排进队列、稍后从 socket 回调里执行——调用方的 try/catch 拦不住，直接变成
 * **宿主进程崩溃**。CI 的 windows-latest 上实测：spawn → kill 跑完就崩在
 * `windowsTerminal.js:161`。不带 signal 时 node-pty 走 `_close()` + `agent.kill()`，
 * 正是 Windows 上正确的终止语义。
 *
 * 导出仅供单测（test/host-frames.test.ts）：平台参数注入，两个分支都能在 macOS/Linux 断言。
 */
export declare function killLocalShellTerminal(terminal: unknown, platform?: NodeJS.Platform): void;
/**
 * Windows 本地 PTY 的**输入归一化**（D74，2026-09-27 真机报告）：conhost 把 Enter 当
 * **CR**，裸 LF 只把光标下移一格、**不提交命令行**——于是 `tty_send` 按工具描述发
 * `echo X\n` 时，命令停在输入行上：没有输出、没有新提示符，看起来像「发出去了但没执行」。
 *
 * 修法取报告建议里改动最小的一条：win32 上把行尾补成 CRLF（已有 CR 的不重复补），
 * 让「照描述写 `\n`」这条主路径直接可用。非 win32 原样透传（POSIX 的 Enter 就是 LF），
 * SSH 会话也不归一化（远端是什么系统、什么 shell 插件不知道，乱改会破坏 `cat` 之类的原始输入）。
 *
 * 导出仅供单测：平台参数注入，两个分支都能在 macOS/Linux 断言。
 */
export declare function normalizePtyInput(data: string, platform?: NodeJS.Platform): string;
/** 一次「会话 → 帧」采集器的句柄（本地 = 定时器，SSH = 远端长驻 exec channel）。 */
interface StatsCollector {
    stop(): void;
}
interface TtySession {
    id: string;
    handle: TermHandle;
    /**
     * 绑定的 WS 连接集合（0.19.0 起支持跨连接共享）：持久（tmux）会话可被多个
     * 窗口同时绑定——同 tmuxName 的 spawn 不再新建 PTY 而是重绑定到现有会话
     * （单 PTY 多客户端扇出，名额不翻倍）。
     *
     * 键 = `<连接 id>:<该连接侧标签 sid>`，值 = { ws, sid }（帧寻址用连接侧
     * sid）：只用 sid 做键时，「复制标签页」复制出的同 sid 第二连接会覆盖第一
     * 连接的绑定（前者收不到输出还自以为在线），且前者关闭时误删后者的绑定。
     * map 为空 = 孤儿状态。
     */
    clients: Map<string, {
        ws: WebSocket;
        sid: string;
    }>;
    closed: boolean;
    paused: boolean;
    /**
     * 会话归属（agent 侧 tty_open）：'user' = 面板标签开的、有客户端绑定；
     * 'agent' = agent 用 tty_open 开的，**可能长时间无客户端**。
     *
     * 为什么必须区分：孤儿回收器的判据是「无客户端绑定」（`orphanedAt !== null`），
     * 而 agent 开的会话从出生起就没有客户端——不豁免的话会被回收器当孤儿秒收，
     * 长驻任务（dev server / build）刚起来就没了。豁免之后关闭入口只有两个：
     * agent 的 `tty_close`，或用户在面板里接管后照常关标签。
     */
    owner: 'user' | 'agent';
    /**
     * **只读保留态**（D77）：进程已退出，但会话**还留在表里**——读侧工具照常可用，
     * 写侧明确拒写，用户与 agent 都能显式关掉它（`tty_close` / 面板关标签 / TTL 到点）。
     *
     * 与 `closed` 是两件事：`closed` = 真退役（出表 + 释放屏，见 SessionManager.retire），
     * 而「进程退出」**不再**等于退役——否则退出瞬间那些输出就再也取不回来了。
     */
    exited: {
        code: number | null;
        signal: string | null;
        at: number;
    } | null;
    /** exit 帧只发一次（kill 主动关闭与 shell 自然退出共用同一回调）。 */
    exitSent?: boolean;
    /** agent 工具展示用的元数据。 */
    cwd: string;
    kind: 'local' | 'ssh';
    /** SSH 会话的展示目标（user@host[:port]）；本地会话为空串。 */
    target: string;
    /**
     * 命令型会话（0.23.0）：`tty_open command=` / `tty_run` / SSH 的 exec 标签 ——
     * 进程本身就是那条命令，**活着就等于在跑**、退出就等于命令结束。
     * tty_list 的 `running` 对这类会话不依赖 shell 集成（它们不注入钩子）。
     */
    commandSession: boolean;
    startedAt: number;
    lastOutputAt: number;
    /** 最近一次 PTY 输入（input 帧 / tty_send）的时间戳：tty_capture{last} 的在途判据之一。 */
    lastInputAt: number;
    /** 累计写入环形缓冲的原始输出字符数（单调，D72）：buffer 起点 = `outputSeq - buffer.length`。 */
    outputSeq: number;
    /** agent 已读水位线（绝对字符计数，D72）；-1 = 还没被 agent 工具碰过（首次触达时落在当下）。 */
    readSeq: number;
    /** 水位线最近一次推进的时刻（D72）：`lastCommand.endedAt > readMarkAt` = 这条命令的输出还没被读过。 */
    readMarkAt: number;
    /** 已经就「失败」弹过徽标的那条命令的 `lastCommand.seq`（0.24.0）；-1 = 还没弹过。 */
    assistHintedSeq: number;
    /**
     * 最近若干条「agent 提交过的命令行」（D75，来自 `tty_send` 且带行尾的那些）：
     * 无 shell 集成时 PTY 会把它们**原样回显**进输出流，`tty_expect` 拿回显当命中
     * 就是假阳性（命令还没执行就报 matched）。用这份清单把回显行从匹配窗口里剔掉。
     * 只记 `tty_send` 的写入：面板逐键输入不做行编辑模拟（宁可少抑制，不可错抑制）。
     */
    recentInputs: string[];
    /** 输出环形缓冲（尾部 256KB，供 tty_capture 与断线重连回放）。 */
    buffer: string;
    /** utf8 分帧兜底：跨 chunk 的多字节序列由 StringDecoder 缓存补齐。 */
    decoder: StringDecoder;
    /** 虚拟屏（xterm-headless）：tty_screen 的数据源；创建失败为 null。 */
    screen: HeadlessTerminal | null;
    /** 虚拟屏心跳（D57 停摆检测）：在途批次 + 看门狗。 */
    screenHeartbeat: ScreenHeartbeat;
    /** 虚拟屏被退役的原因（停摆 / 写队列满）；null = 正常。tty_screen 据此如实报错。 */
    screenDownReason: string | null;
    /** 转入孤儿状态的时间戳；null 表示已连接（客户端在线）。 */
    orphanedAt: number | null;
    /** shell 集成状态（OSC 133/7 解析；本地与 SSH 会话都喂）。 */
    shellState: ShellIntegrationState;
    /** data 帧合并暂存区（flush 前不发）。 */
    pendingOutput: string;
    /** 合并冲刷定时器；null 表示无待冲刷窗口。 */
    flushTimer: NodeJS.Timeout | null;
    /** tmux 持久会话名（本地与 SSH 同语义）；null = 非持久会话。 */
    tmuxName: string | null;
    /**
     * 服务器状态条（0.17.0）：已订阅该会话 stats 的客户端 sid 集合（tab 可见性
     * 驱动）。空集合 = 该会话不需要采集，采集器必须停（防定时器/远程 channel 泄漏）。
     */
    statsSubs: Set<string>;
    /** 最近一帧服务器状态指标（tty_stats 的一条数据源；未采过为 null）。 */
    lastStats: StatsFrame | null;
    /** 采集器句柄；null = 未启动（懒启动：首个 statsOn 才起）。 */
    stats: StatsCollector | null;
    /** 采集已永久失败（远端无 /proc、exec 被拒、连接断开）：不再重启，前端隐藏状态条。 */
    statsFailed: boolean;
    /** 采集失败后的重挂时刻（0 = 没有待重挂）：失败位不再是粘性的（D83）。 */
    statsRetryAt: number;
    /** 连续失败次数：退避倍数按它递增，出过帧即归零。 */
    statsFailures: number;
}
interface ReqLike {
    method?: string;
    headers: Record<string, string | string[] | undefined>;
    socket: {
        remoteAddress?: string;
    };
    url?: string;
}
interface SocketLike {
    destroy(): void;
}
/** 可热更新的运行时配置（loader 的 volatile 更新事件动态应用）。 */
declare class LiveConfig {
    shell: string;
    term: string;
    colorTerm: string;
    cwd: string;
    /** 异常断开后会话保活毫秒数（0 = 立即结束）。 */
    reconnectGraceMs: number;
    sshHosts: SshHostEntry[];
    hostKeys: HostKeyRecord[];
    /** 是否注入 OSC 133/7 shell 集成。 */
    shellIntegration: boolean;
    /** 端口转发隧道规格。 */
    tunnels: TunnelSpec[];
    /** 会话持久化模式（off / tmux）。 */
    persistence: 'off' | 'tmux';
    /** 页面断开且保活期结束时是否结束 tmux 持久会话（默认 false = 留存）。 */
    endOnPageClose: boolean;
    /** 服务器状态条：是否采集并推送会话资源指标（默认 true）。 */
    statsEnabled: boolean;
    /** AI 辅助「失败即解释」：默认关（见 Config.assistEnabled）。 */
    assistEnabled: boolean;
    /** AI 辅助的模型路由（provider / model 成对；都空 = 跟随宿主默认模型）。 */
    assistProvider: string;
    assistModel: string;
    /** SSH 持久会话名（远程 tmux 托管；本机 socket 清单看不到，随 settings 留存）。 */
    persistSessions: string[];
    /** SFTP 传输限制（客户端浏览器侧执行）。 */
    sftpLimits: Required<SftpLimits>;
    /** 允许 ProxyCommand（本机命令执行）：默认关（见 Config.allowProxyCommand）。 */
    allowProxyCommand: boolean;
    constructor(init: {
        shell: string;
        term: string;
        colorTerm: string;
        cwd: string;
        reconnectGraceSec: number;
        sshHosts?: SshHostEntry[];
        hostKeys?: HostKeyRecord[];
        shellIntegration: boolean;
        tunnels?: TunnelSpec[];
        persistence?: 'off' | 'tmux';
        endOnPageClose?: boolean;
        statsEnabled?: boolean;
        sftpLimits?: Partial<SftpLimits>;
        allowProxyCommand?: boolean;
        persistSessions?: string[];
        assistEnabled?: boolean;
        assistProvider?: string;
        assistModel?: string;
    });
    /** 合并部分更新；空字符串/undefined 保持原值；sshHosts/hostKeys/tunnels 传数组即整体替换。 */
    apply(partial: Partial<{
        shell: string;
        term: string;
        colorTerm: string;
        cwd: string;
        reconnectGraceSec: number;
        sshHosts: SshHostEntry[];
        hostKeys: HostKeyRecord[];
        shellIntegration: boolean;
        tunnels: TunnelSpec[];
        persistence: 'off' | 'tmux';
        endOnPageClose: boolean;
        statsEnabled: boolean;
        sftpLimits?: Partial<SftpLimits>;
        allowProxyCommand: boolean;
        persistSessions: string[];
        assistEnabled: boolean;
        assistProvider: string;
        assistModel: string;
    }>): void;
    findSshHost(name: string): SshHostEntry | undefined;
}
/**
 * shell 集成状态：OSC 133/7 解析产物（每会话一份）。
 */
interface ShellIntegrationState {
    /** 跨 chunk 未闭合 OSC 序列的残包缓冲（≤512KB，超限丢弃；上限容纳 T 快照——200 行 tmux capture-pane 的 base64 可到数百 KB）。 */
    carry: string;
    /**
     * 这个会话**见过至少一个 OSC 133 标记**（0.23.0）。tty_list 的 `running` 能不能
     * 下结论全看它：没有标记 = 命令边界不可信（非持久 SSH / fish·csh / Windows 本地 /
     * 集成被关 / tmux <3.3 吞了 DCS 信封），此时**必须报「未知」而不是「没在跑」**。
     */
    sawMark: boolean;
    /** B..D 之间：命令输出捕获中。 */
    inCommand: boolean;
    cmdBuffer: string;
    /** T 标记带来的 pane 快照（tmux 持久标签；D 时优先于 cmdBuffer）。 */
    pendingT: string | null;
    /**
     * 上一条已完成命令。`seq` 是**单调序号**（每见到一个 D 自增）：AI 辅助的失败徽标按它
     * 去重——用 `endedAt`（Date.now()）的话，同一毫秒内连跑两条命令会撞成同一条，第二条
     * 就再也弹不出徽标。
     */
    lastCommand: {
        output: string;
        exitCode: number | null;
        endedAt: number;
        seq: number;
    } | null;
    /** 命令完成序号（单调自增，见 lastCommand.seq）。 */
    cmdSeq: number;
}
/**
 * 把一块输出喂进 shell 集成解析（cwd 跟随 + 命令边界捕获）。
 * 残包处理：尾部若有未闭合的 OSC 序列（lastIndexOf('\x1b]') 起无终结符），
 * 扣回 carry 等下一块拼齐；扣留部分不进命令捕获，避免半截序列混入。
 * 命令捕获按「标记之间的文本段」累积——B、输出、D 常在同一 chunk 到达，
 * 先处理段再翻转状态，才能把 B..D 之间的输出完整收进 lastCommand。
 */
/** 导出仅供单测（test/shell-capture.test.ts）：B/D 配对与未配对 D 的忽略语义。 */
export declare function feedShellIntegration(session: TtySession, text: string): void;
/**
 * 宿主 llm 服务的流式块（只声明本插件用到的字段，其余块忽略）。
 *
 * ⚠️ **finish 块的权威形状是 `{ type:'finish', reason: FinishReason }`**，而 FinishReason
 * 是**以 `kind` 为判别式**的联合——也就是 `kind` 与 `failure` 都在 `reason` **里面**，
 * 不在块的顶层。rss 曾经把这两个字段声明在顶层，于是**每一次成功**都被判成「终止原因
 * unknown」，AI 摘要 100% 失败而单测全绿（假 llm 照着同一个错形状造数据）。这里照抄它
 * 修好后的形状。
 */
interface LlmStreamChunk {
    type?: string;
    text?: string;
    reason?: {
        kind?: string;
        failure?: {
            message?: string;
            code?: string;
        };
    };
    [key: string]: unknown;
}
/**
 * 宿主 llm 服务的最小结构（cordis Context 上的 llm 服务）。
 *
 * ⚠️ `messages[].content` 必须是 **ContentBlock[]**（`[{ type:'text', text }]`），不是
 * 字符串：字符串会在下游 `contentHasImage(content)` 之类对 content 调 `.some(...)`
 * 的地方炸成 `content.some is not a function`（rss 踩过，表现是每条都失败）。
 */
interface LlmLike {
    stream(options: {
        provider: string;
        model: string;
        system?: string;
        messages: Array<{
            role: 'user';
            content: Array<{
                type: 'text';
                text: string;
            }>;
        }>;
        maxTokens?: number;
        temperature?: number;
        signal?: AbortSignal;
    }): AsyncIterable<LlmStreamChunk>;
    /**
     * 已注册的 provider 路由（设置卡片里 provider 栏的候选）。**可选**：宿主没装 llm 服务、
     * 或该版本没有这个方法时就是「没有候选」，卡片里的输入框照旧手输。
     */
    listProviders?: () => unknown;
    /**
     * 某个 provider 广告的模型（model 栏的候选）。**可选**，且**可能空**。
     *
     * 契约见 dsh-llm 的注释：目录只是**建议**——核心路由接受未列出的 model id，
     * 「基础空目录、不提供 GUI 选择」是合法状态。所以这里永远不许把空候选当成错误。
     */
    listModels?: (provider: string) => Promise<unknown>;
}
/**
 * 解析模型路由：显式配置对 > 宿主默认模型（服务 agentDefaultModel，兼容 currentSelection）
 * > settings 的 agent-default-model 命名空间；全拿不到返回 error（**不是** null —— 界面要
 * 一句能照做的原因，而不是一个「点了没反应」的徽标）。
 *
 * 与 rss 的 resolveAiRoute 同构，但多一条**成对规则**的显式报错：只填一个时既不生效、
 * 也不该静默回落到宿主默认（用户以为自己配了，实际走的是别的模型）。
 */
export declare function resolveAssistRoute(ctx: Context, provider: string, model: string): {
    route?: {
        provider: string;
        model: string;
    };
    error?: string;
};
/**
 * 一次性调用宿主 llm 服务：收集 text-delta 直到 finish（导出仅供单测，照 rss 的
 * callAiSummary 先例——只测假件的话，「忘了在路由里调用它」这种回归一条都拦不住，
 * 而 finish 块的形状错误又恰好是 rss 踩过的坑）。
 */
export declare function askModelOnce(llm: LlmLike, route: {
    provider: string;
    model: string;
}, prompt: {
    system: string;
    user: string;
}, timeoutMs?: number): Promise<string>;
/** 已注册的 provider 路由；服务没有这个方法、或抛错，都只当「没有候选」。导出仅供单测。 */
export declare function listProvidersOf(llm: unknown): Array<{
    id: string;
    name: string;
}>;
/**
 * 某个 provider 广告的模型。
 *
 * **必须有超时**：适配器是拿远端目录喂这个方法的（pi-ai 那一族会去问服务端点），网络一慢
 * 就会把设置卡片吊住——而候选只是「建议」，等不到就该立刻放弃、让用户直接手输。
 */
export declare function listModelsOf(llm: unknown, provider: string, timeoutMs?: number): Promise<Array<{
    id: string;
    name: string;
}>>;
/**
 * 每个 provider 的模型**并行**取回来，给「一个控件同时选渠道 + 模型」的候选表用。
 *
 * 判据同 listModelsOf：拿不到就是空数组——**一个 provider 坏掉不许把整张候选表清空**，
 * 用户至少还能从别的渠道里选。并行 + 每个自带软超时，所以总时长仍被一次超时界住。
 */
export declare function listGroupsOf(llm: unknown, providers: Array<{
    id: string;
    name: string;
}>): Promise<Array<{
    id: string;
    name: string;
    models: Array<{
        id: string;
        name: string;
    }>;
}>>;
/**
 * TOFU 主机指纹存储：get/record 面向 spawnSsh 的 hostVerifier；
 * record 时经 persist 回调写入 settings（宿主重启后钉扎仍在）。
 */
declare class HostKeyStore {
    private readonly live;
    private readonly persist;
    constructor(live: LiveConfig, persist: (records: HostKeyRecord[]) => void);
    private key;
    get(host: string, port: number): string[] | undefined;
    /** 记录指纹：同 host:port 已有记录则并入集合（一机多把钥匙），否则新建。 */
    record(host: string, port: number, fingerprint: string): void;
}
/**
 * 虚拟屏的 scrollback 余量（D57）。
 *
 * **不能是 0。** xterm 的 `Buffer` 在 `scrollback: 0` 时把 `lines.maxLength` 压成
 * `rows`，但 normal buffer 的 `_hasScrollback` 仍是 true（reflow 照常开启）：输出与
 * resize（列宽变化触发 reflow）交错时，`lines` 会短于 `ybase + y`，于是
 * `lineFeed()` 里 `lines.get(ybase + y).isWrapped = false` 命中 `undefined` →
 * 未捕获 `TypeError: Cannot set properties of undefined (setting 'isWrapped')`。
 *
 * 该异常抛在 `WriteBuffer._innerWrite` 的 `setTimeout` 回调里，写入路径的同步
 * try/catch 结构性拦不住，会直接打死整个宿主进程（线上 `last-failure-web.log`
 * 的堆栈即此）。
 *
 * 关键在 `lines.maxLength`（= rows + scrollback）：`BufferService.scroll` 只在「没满」时
 * 才 `lines.push` + `ybase++`（成对）。`scrollback: 0` 把 maxLength 钉死成 rows，
 * 一旦有别的路径把 `ybase` 顶上去（resize 收缩 / reflow），`lines` 长度就再也追不上，
 * `ybase + y + 1` 越界只是时间问题。留 1 行余量（maxLength = rows + 1）即维持住成对增长：
 * 同一最小序列 `scrollback: 0` 崩 5/5，`scrollback: 1` 崩 0/5；700 块随机屏压测里
 * `ybase` 涨到 16 也没再出现越界（见 test/screen-crash.test.ts）。
 *
 * 余量不影响 `tty_screen` 读数——它走 `buffer.getLine(row)`（内部 `ybase + row`，
 * 即视口），多出来的行只在回滚区，不进读数。
 */
export declare const SCREEN_SCROLLBACK = 1;
/**
 * 建一块虚拟屏（`tty_screen` 的数据源）；失败降级为 null。
 *
 * 导出仅供单测（test/screen-crash.test.ts）钉住构造参数——生产路径是
 * `SessionManager.createScreen`，它必须与这里同源（就一行委托）。
 */
export declare function createHeadlessScreen(cols: number, rows: number): HeadlessTerminal | null;
/** 读累计吞掉的虚拟屏异常数。 */
export declare function xtermScreenCrashCount(): number;
/** 判定未捕获异常是否来自虚拟屏（xterm-headless）。导出仅供单测。 */
export declare function isXtermScreenCrash(err: unknown): boolean;
/**
 * 记账并吞掉一个虚拟屏异常；返回 true 表示已吞（非虚拟屏异常返回 false，交回调用方）。
 * 导出仅供单测。
 */
export declare function swallowXtermScreenCrash(err: unknown): boolean;
/**
 * 注册进程级虚拟屏异常兜底（D57）：把来自 xterm-headless 的未捕获异常 / 未处理 rejection
 * 吞掉并记账，让插件自己的 bug 不再拖垮整个 harness。幂等 + 引用计数，返回解绑函数。
 *
 * 覆盖两个入口：
 *   - `uncaughtException`：同步路径（`_innerWrite` 的定时器回调里抛出，见上）；
 *   - `unhandledRejection`：xterm 的异步 handler（DCS/OSC）rejection 走这里，宿主实测
 *     **0 处**监听，Node 15+ 下未处理 rejection 直接杀进程。
 *
 * 三条边界（刻意如此，不是随手 `process.on`）：
 *   1. **只吞虚拟屏异常**——`isXtermScreenCrash` 按堆栈判定；其余异常照旧。
 *   2. **其余异常只在「我们是唯一的监听者」时抛回**：没有本兜底时未捕获异常会让宿主退出，
 *      抛回保住这个语义；已经有别的监听者（宿主/其它插件）时保持沉默，由它们决定——
 *      此时抛回反而会抢在别人前面把进程杀掉。
 *   3. `unhandledRejection` 的「抛回」还有一层必要性：**只要挂了监听器，Node 就不再走
 *      默认的致命处理**，所以非虚拟屏的 rejection 必须由我们抛出来还原默认行为
 *      （已实测：抛回后进程照旧 exit 1）。
 */
export declare function installXtermScreenCrashGuard(): () => void;
/**
 * 停摆判定窗口：写出去的数据超过这么久还没解析完，就认定那块屏的解析器已停摆。
 * 正常屏的解析是毫秒级（回调随 `_innerWrite` 逐批回来），5s 不会误伤。
 */
export declare const SCREEN_STALL_MS = 5000;
/** 退役原因①：写队列超限 / 尺寸非法导致的同步抛出。 */
export declare const SCREEN_DOWN_WRITE_REJECTED = "\u5199\u5165\u88AB\u62D2\uFF08\u5199\u961F\u5217\u8D85\u9650\u6216\u5C3A\u5BF8\u975E\u6CD5\uFF09";
/** 退役原因②：解析器停摆（超时窗口内没有任何一批数据被解析完）。 */
export declare const SCREEN_DOWN_STALLED = "\u89E3\u6790\u505C\u6446\uFF08xterm \u5728\u8D85\u65F6\u7A97\u53E3\u5185\u672A\u56DE\u8C03\uFF09";
/** 虚拟屏心跳：在途批次 + 看门狗（D57）。 */
export interface ScreenHeartbeat {
    /** 已写出、尚未被 xterm 解析完的批次（`write(data, cb)` 的回调未回来即 >0）。 */
    inflight: number;
    /** 看门狗；null = 当前没有挂着的窗口。 */
    watchdog: NodeJS.Timeout | null;
    /** 最近一次解析完成的时间戳（0 = 从未）。看门狗靠它区分「解析在途」与「真停摆」。 */
    lastParseAt: number;
}
/** 建一份空心跳。 */
export declare function newScreenHeartbeat(): ScreenHeartbeat;
/** 摘掉看门狗（会话结束 / 屏退役时调用，避免定时器在会话死后误报）。 */
export declare function clearScreenWatchdog(heartbeat: ScreenHeartbeat): void;
/**
 * 写一帧到虚拟屏，并维护停摆看门狗（D57）。
 *
 * **为什么需要心跳**：xterm 的解析在 `WriteBuffer._innerWrite` 的 setTimeout 回调里跑，
 * 异常被进程级兜底吞掉之后，那块屏的解析器**永久停摆**——出错的那批数据留在写队列里、
 * `_bufferOffset` 不前进，而 `write()` 只在队列**空**时才重新调度解析。后果：`tty_screen`
 * 一直返回**冻结的旧画面**（agent 会据此行事），写队列还会一路堆到 5e7 字符上限。
 * 心跳把这种屏识别出来退役，`tty_screen` 改为如实报「虚拟屏不可用」。
 *
 * 信号用 `write(data, cb)` 的回调（xterm 解析完这批数据才回调）：停摆时回调永远不来 →
 * `inflight` 不归零 → 看门狗判定。**不能用 `onWriteParsed` 事件**——它在 5.5.0 不是
 * 公开 API（`Terminal` 只暴露 onBell/onBinary/onCursorMove/onData/onLineFeed/onResize/
 * onScroll/onTitleChange）。
 */
export declare function writeToScreen(screen: {
    write(data: string, callback?: () => void): void;
}, heartbeat: ScreenHeartbeat, text: string, onStall: (reason: string) => void, stallMs?: number): void;
/** 会话的只读快照形状（tty_list 与 sessions 帧共用；D77 起含只读保留态字段）。 */
export interface SessionSnapshot {
    sid: string;
    pid?: number;
    cwd: string;
    kind: 'local' | 'ssh';
    target: string;
    startedAt: number;
    lastOutputAt: number;
    persist?: true;
    owner: 'user' | 'agent';
    /** 进程已退出、会话仍在只读保留期内（D77）。 */
    exited?: true;
    /** 退出码（拿不到时省略）。 */
    exitCode?: number;
    /** 退出信号（正常退出时省略）。 */
    signal?: string;
    /** 只读保留的剩余毫秒；**省略 = 不按时间释放**（策略为 ∞，关闭或宿主重启才清）。 */
    retainMs?: number;
    /**
     * 有命令正在执行（0.23.0）：true = 在跑；false = 命令已结束（或进程已退出）；
     * **省略 = 无法判断**——这个会话没有 shell 集成标记（非持久 SSH / fish·csh /
     * Windows 本地 / 集成被关 / tmux <3.3 吞了信封），或命令型会话尚未收到终局。
     * 拿它当「现在可以往里发命令」的许可时要按三态处理：省略 ≠ 没在跑。
     */
    running?: boolean;
    /** 上一条已完成命令的退出码（0.23.0；来自 OSC 133;D，拿不到时省略）。 */
    lastExitCode?: number;
    /** 上一条已完成命令的结束时刻（epoch ms，0.23.0；与 running/lastExitCode 同源）。 */
    lastExitAt?: number;
}
/** 导出仅供单测（test/host-frames.test.ts）：上限 / 孤儿回收 / grace 热改的行为护栏。 */
export declare class SessionManager {
    private readonly sessions;
    private limit;
    /** 回收器销毁孤儿时是否连 tmux 持久会话一起结束（endOnPageClose 策略）。 */
    private endTmuxOnReap;
    constructor(maxSessions: number, endTmuxOnReap?: () => boolean);
    get limitValue(): number;
    /** 配置热生效时调整上限（1~16）。 */
    setLimit(maxSessions: number): void;
    get count(): number;
    /** 活着的会话数（**不含**只读保留的，见 canSpawn）。 */
    get liveCount(): number;
    /** 只读保留的会话数（D77）。 */
    get exitedCount(): number;
    /**
     * 名额判据**只数活着的会话**（D77）：只读保留的不占名额。不这样分的话，
     * 「跑几条短命令」就能把面板顶成「会话数已达上限」——用户一条会话都没开，
     * 比原来那个「AI 取不到结果」的缺陷更糟。
     */
    canSpawn(): boolean;
    add(session: TtySession): void;
    remove(id: string): void;
    get(id: string): TtySession | undefined;
    /** 会话的只读快照（SSH 会话无本地 pid，该字段省略；tmux 持久会话带 persist；
     *  只读保留态（D77）额外带 exited/exitCode|signal/retainMs）。 */
    private snapshotOf;
    /** agent 工具用的只读快照。 */
    list(): SessionSnapshot[];
    /** sessions 帧用：额外带 attachable（孤儿且未关闭的会话可被新连接 attach）。 */
    listForAttach(): Array<SessionSnapshot & {
        attachable: boolean;
    }>;
    /** 遍历全部会话（状态条采集器的批量收尾等按会话维度的操作）。 */
    forEach(fn: (session: TtySession) => void): void;
    /** 按 tmux 持久会话名查找**活着**的会话（跨窗口共享用）；不存在/已关闭/只读保留态返回 undefined。
     *  D77：保留态必须排除——否则「同名 persistName 的新标签」会 rebind 到一具尸体上，
     *  拿到 ready 却永远没有输出。 */
    findByTmuxName(tmuxName: string): TtySession | undefined;
    /** 同步退役：移出全局表 + 释放虚拟屏（幂等，不杀进程）。 */
    retire(session: TtySession): void;
    /** 释放并销毁会话：退役 + 树级终止（等待 terminate 完成，最慢 ~20s）。
     *  endOnPageClose 策略下，回收器销毁孤儿时连 tmux 持久会话一起结束。 */
    destroy(session: TtySession): Promise<void>;
    /**
     * 回收孤儿会话（回收器定时调用）：超过保活期的回收。graceMs<=0 时立即回收
     * 全部孤儿——孤儿只在「断开瞬间 grace>0」时产生，热改 grace 为 0 不能只管
     * 以后：已存在的孤儿会永久占 PTY 与名额，满额后新标签一直报「会话数已达上限」。
     *
     * agent 开的会话（owner:'agent'）不走这条：它从出生起就没有客户端，判据
     * 「orphanedAt !== null」对它要么永不成立（不回收）要么被误当孤儿（一开就收）。
     * 它的关闭入口是 agent 的 tty_close 或用户在面板里接管后关标签。
     */
    reapOrphans(graceMs: number): Promise<void>;
    /**
     * 只读保留到点退役（D77；回收器每轮调用）：超过保留期的会话出表 + 释放屏。
     *
     * 默认策略是 ∞（保留到显式关闭）⇒ 本方法是 no-op，条数由 `capExited` 兜；
     * 把 `EXITED_RETAIN_MS` 改成有限值它就照常工作（策略可调，通路留着）。
     *
     * **不 kill 进程**：这里收的全是已经退出的会话（进程早没了），`retire()` 就够；
     * 真退役（显式 `tty_close` / 面板关标签）走 `killSessionNow`，那条路要处理
     * tmux teardown 与 forceKill 的兜底。
     */
    reapExited(retainMs: number): void;
    /**
     * 只读保留的数量上限（超出按最旧淘汰，D77）：返回被淘汰的会话，便于单测断言。
     *
     * 为什么必须有：`owner:'agent'` 的会话不会走孤儿回收，agent 若不显式 `tty_close`
     * （它常常不会），保留态就是**永久泄漏**——屏与 256KB 缓冲一直挂着。
     */
    capExited(max: number): TtySession[];
    disposeAll(): Promise<void>;
}
/** 导出仅供单测（test/host-frames.test.ts）：帧校验 / 绑定 / 孤儿语义的行为护栏。 */
export declare class TtyServer {
    private readonly ctx;
    private readonly sessions;
    private readonly options;
    private readonly hostKeyStore;
    /** SSH 持久会话名留存回调（apply 闭包实现，settings 落盘）。 */
    private readonly trackPersist;
    private readonly wss;
    /** 在途的持久会话创建（tmuxName → 创建 promise）：dsh 重启后多页面并发恢复时收敛竞态。 */
    private readonly pendingTmux;
    /** 已接线的面板连接（sessions 帧广播用；比 wss.clients 更贴合「面板」语义，单测也可驱动）。 */
    private readonly panels;
    /** 会话 → 它所属连接的 sid 映射（kill 兜底结案时要从本地表里摘除）。 */
    private readonly sessionLocals;
    /** WS 闸门（插件禁用时关闭）：拒绝新升级 + 断开存量连接。 */
    private wsGateOpen;
    /** 服务器状态条总开关（配置热生效；关闭时停掉全部采集，重开按订阅恢复）。 */
    private statsOn;
    constructor(ctx: Context, sessions: SessionManager, options: LiveConfig, hostKeyStore: HostKeyStore, 
    /** SSH 持久会话名留存回调（apply 闭包实现，settings 落盘）。 */
    trackPersist: (tmuxName: string, present: boolean) => void);
    /**
     * 按启用状态对齐 WS 闸门（幂等）。关闭时对存量连接发正常关闭帧：客户端走
     * 既有重连循环，禁用期间升级被拒，重新启用后自动重连并 attach 孤儿会话。
     * PTY 进程不受影响（转孤儿保活），不因禁用杀用户进程。
     */
    setWsGate(open: boolean): void;
    /**
     * 配置热生效：关闭时停掉全部采集（本地定时器 + 远端 exec channel）；重新打开
     * 时对**仍有订阅**的会话懒启动。订阅集合刻意不清——客户端只在标签可见性变化
     * 时发 statsOn/statsOff，开关来回切不该要求它重发。
     */
    setStatsEnabled(enabled: boolean): void;
    /** 订阅/退订（tab 可见性驱动）：退到 0 即停表，任何路径都不会让采集器空转。键 = 绑定键（connId:sid）。 */
    private setStatsSub;
    /** 清掉指向已解绑客户端（WS 关闭 / 标签换 sid 重绑）的订阅，防采集器永不收尾。 */
    private pruneStatsSubs;
    /**
     * 懒启动采集（首个 statsOn 才起）。两条路径产出同形状的帧：
     *   - 本地：宿主进程就是那台机器，1s 定时器 + 进程级共享采样器（多个本地标签
     *     共享一次 df/netstat）；
     *   - SSH：远端 sh + awk 常驻循环，每秒一行 JSON 走**非 PTY** exec channel；
     *     速率类由远端算好，宿主只解析 + 清洗。
     * 失败时静默停表并置 statsFailed：前端靠「无数据」隐藏状态条，PTY 数据路径与
     * 终端体验完全不受影响。
     *
     * 但失败位**不再粘死整个会话**（D83）：原先置位后永不复位，一次瞬态故障
     * （sshd MaxSessions 拒绝并发 channel、单通道 ECONNRESET）就让状态条与 agent
     * tty_stats 在会话余生里彻底没有数据，而主 PTY 通道其实是健康的。现在按指数
     * 退避自动重挂（出过帧即计数归零），既保住「别每秒重启」的本意，又能自愈。
     */
    private startStats;
    /**
     * 采集失败后的退避重挂（D83）。
     *
     * 退避而不是立刻重试，是为了保住原先「粘性失败位」想解决的问题——远端平台压根
     * 没有采集源（macOS/BSD：既无 /proc 也无 PowerShell）时不能每秒重启一个必然失败
     * 的 channel。指数退避 + 上限把这种「稳态失败」压到几分钟一次，同时让瞬态故障
     * 在恢复后自动回到有数据状态（出过帧就归零）。
     */
    private scheduleStatsRetry;
    /** 停表（幂等）：订阅清零 / 会话结束 / 插件禁用 / 配置关闭都走它。 */
    private stopStats;
    private stopAllStats;
    /** 帧只发给订阅了该会话的客户端（绑定键寻址，回帧带各连接自己的 sid，跨窗口共享也成立）。 */
    private sendStats;
    /** registerUpgrade 的 handler（loopback 围栏 + ws 握手）。 */
    handleUpgrade(req: ReqLike, socket: SocketLike, head: Buffer): void;
    /** 围栏放行之后的实际握手（与上面的异步分支共用）。 */
    private finishUpgrade;
    private onConnection;
    /**
     * 摘掉同 sid 上残留的**只读保留**会话（D77）：spawn / ssh 新建同名会话前调用。
     *
     * 不摘会真泄漏：`sessions.add()` 用同一个键把旧对象顶出表，而旧对象的虚拟屏与
     * 256KB 环形缓冲再没有任何引用能释放它们（`retire` 是唯一的释放口）。只处理
     * 保留态——活着的同 sid 会话属于「跨连接同名」的既有语义，不在这里动。
     */
    private retireStaleExited;
    /**
     * 解析帧里的 sid。返回：
     *   { sid }        目标会话；
     *   { unknown }    显式 sid 但本连接无此会话（客户端竞态，如 resize 先于
     *                  spawn 就绪到达；调用方应静默忽略，而不是报错）；
     *   undefined      已发送错误帧（非法 sid / sid 缺省但无法唯一路由）。
     */
    private resolveSid;
    /** 把一个客户端连接重绑定到既有会话（跨窗口共享 / 并发恢复收敛共用）。 */
    private rebindClient;
    /**
     * agent 开一个本地终端（tty_open 的实现）。
     *
     * 设计前提（与用户确认过）：**开成面板里的普通会话，不做隐形会话** ——
     * 会话照常进 `sessions` 快照、面板能看见并接管、用户随时可以关。理由是
     * D06 那类「僵尸会话」正是隐形会话的产物：用户不知道机器上跑着什么。
     *
     * 与 `spawn` 帧的差别只有两处：没有 ws（clients 空表）、owner:'agent'
     * （逃过孤儿回收，见 reapOrphans）。
     */
    openAgentSession(input: {
        cwd?: string;
        command?: string | null;
        persistName?: string | null;
        cols?: unknown;
        rows?: unknown;
    }): Promise<{
        sid: string;
        persist: boolean;
    }>;
    /** agent 关掉一个会话（tty_close 的实现）：只允许关 agent 自己开的，用户标签不越权。 */
    closeAgentSession(sid: string): Promise<{
        ok: true;
    }>;
    /**
     * 把当前会话清单推给所有已连接面板（agent 开关会话后让面板即时反映）。
     *
     * 用自己登记的连接集合而不是 `this.wss.clients`：后者只在真实 WS 服务器
     * 接线时才有值（单测直接调 onConnection 时为空），且语义上我们要的是
     * 「已接线的面板连接」。
     */
    private broadcastSessions;
    /**
     * 取一次会话所在机器的指标（tty_stats 的实现）。
     *
     * 按需采样、不依赖面板是否订阅状态条：本地会话直接跑本地采样器；SSH 会话在
     * 同一连接上开一次性 exec channel 跑一帧脚本（statsExec 的常驻循环不适合
     * 一次性取数，故用 handle.statsExec 的单帧变体——没有的话返回最近留档）。
     * 失败不抛给 agent 的判断链：返回 available:false + 原因。
     */
    sampleStats(session: TtySession): Promise<{
        available: boolean;
        reason?: string;
        frame?: StatsFrame;
    }>;
    /** 等待同 tmuxName 的在途创建完成；返回可重绑定的会话（null = 无在途/已失败）。 */
    private waitPendingTmux;
    /**
     * 创建本地会话（0.20.0 抽出，供 WS `spawn` 帧与 agent `tty_open` 共用）。
     *
     * 与连接无关是这次抽出的全部意义：`spawn` 帧带一个 ws（用户开的标签要立刻
     * ready + 收输出），`tty_open` 没有 ws（agent 开的会话从出生起就没有客户端，
     * 靠 owner:'agent' 逃过孤儿回收）。两条路径共用同一套：
     *   - tmux 持久化探测与资源准备（同 persistName 复用既有会话，名额不翻倍）；
     *   - cwd 校验、spawnPlan 组装、并发在途收敛（pendingTmux）；
     *   - 会话对象装配 + 输出下行挂载 + 退出收尾。
     *
     * 调用方负责：上限检查（canSpawn）、错误帧、ready/notice 的呈现。
     * `client` 为 null 时创建无客户端的会话（agent 路径）。
     */
    private createLocalSession;
    /**
     * 立即终止会话：同步退役 + 顶层 shell 直接 SIGKILL，让 done/exit 帧立刻可发；
     * 树级子进程清理（SIGTERM→grace→SIGKILL，交互式 zsh 忽略 SIGTERM 时最慢
     * 可拖 ~20s）由 terminate 在后台继续收尾，不阻塞 kill 帧处理。
     * tmux 背书会话先向 tmux server 发 kill-session（杀客户端只会 detach，
     * 会话会留在 tmux server 上）；2.5s 兜底 forceKill 防收尾悬挂。
     */
    private killSessionNow;
    /** 每会话一块虚拟屏（xterm-headless）：tty_screen 的数据源；失败降级为 null。
     *  构造参数在 createHeadlessScreen（D57：scrollback 不能是 0），这里只做委托。 */
    private createScreen;
    /**
     * 退役一块**不可用**的虚拟屏（D57）：解析停摆或写队列满时调用。
     *
     * 只摘虚拟屏，**不动会话**——PTY 还活着、浏览器面板照常收发（虚拟屏只是 `tty_screen`
     * 的数据源）。退役后 `tty_screen` 会如实报「虚拟屏不可用（原因）」，而不是返回冻结的
     * 旧画面让 agent 据此行事。
     */
    private dropScreen;
    private handleMessage;
    /**
     * 服务器状态条订阅（0.17.0）：按「标签可见性」驱动——只有可见标签才发
     * statsOn。未知 sid（客户端竞态）静默忽略，不回错误帧。订阅键与客户端
     * 绑定键同构（connId:sid），跨连接共享同一 sid 时互不踩。
     */
    private handleStatsFrame;
    /** 会话退出事实 → exit 帧（恰好一次；本地 PTY 与 SSH 共用）。 */
    private watchDone;
    /**
     * 会话终局的**唯一出口**：给所有绑定连接发 exit 帧（恰好一次）+ 转只读保留（D77）。
     *
     * `outcome` 正常来自 PTY 句柄的 done；显式 kill 的兜底（KILL_EXIT_FALLBACK_MS）
     * 也走这里，带 code=null / signal=SIGKILL。exit 广播到所有绑定连接（跨窗口共享），
     * 各客户端按自己的 sid 收址。
     *
     * **D77 起「进程退出」不再等于「退役」**：会话留在 `sessions` 表里转只读保留态，
     * 读侧工具（tty_list / tty_capture / tty_screen / tty_expect）照常可用，写侧拒写，
     * 直到显式关闭（tty_close / 面板关标签）或保留期到点（reapExited）。退役只剩
     * `SessionManager.retire` 那一处（出表 + 释放屏）。
     */
    private finishSession;
    /**
     * 「上一条命令失败了」的徽标帧（0.24.0）。
     *
     * 只能在**输出下行路径**里判：shell 集成的 `D` 标记可能落在任意一块数据里，没有
     * 「命令结束」的独立事件可挂。判据全在 assist.ts 的 `shouldExplainExit`（0 不弹、
     * 130 / 141 豁免）。
     *
     * `assistHintedSeq` 按 `lastCommand.seq`（单调序号）去重：同一条命令只弹一次——否则用户
     * 关掉徽标之后，只要终端再吐一个字节（比如敲了下一个字符的回显）它就会重新冒出来。
     *
     * 没有连接时直接返回：徽标是**实时提示**，不是待办队列；等重连时补发会让一个刚打开
     * 的标签莫名其妙地顶着一个旧徽标。
     */
    private maybeEmitAssistHint;
    /** 输出下行 + 基于 ws.bufferedAmount 的背压（暂停/恢复 PassThrough）。 */
    private attachOutput;
    /** 立即冲刷待发的合并输出（exit/kill 前调用，保证 exit 帧永远在最后一帧 data 之后）。
     *
     *  D76：`force` 是**终局路径专用**的开关。`finishSession` 必须先置 `closed`（否则终局
     *  之后到达的字节会继续往合并窗口里塞），可它同时又要交出**已经攒在 `pendingOutput`
     *  里的**那批输出——两者共用同一个 `closed` 判据时，尾巴会被下面这行自己的守卫整批
     *  吞掉：进程「打印完就退出」时那正是崩溃堆栈的最后一行 / 命令的结论行。传 `force`
     *  即「我知道它已 closed，这一批仍然要发」。
     */
    private flushPendingOutput;
    close(): void;
}
/**
 * 凭据存储里**已知的引用名**（~/.dsh/.credentials.yaml 的 `refs:` 块键），只读给
 * SSH 对话框的引用选择器当候选。
 *
 * 为什么必须读文件：官方把「引用半边」设计成**不可枚举**——
 * `CredentialProvider.listRecords` 的注释原话是 "Unlike the reference half, which has no
 * enumeration because configuration surfaces learn which references exist from settings
 * schemas"，而浏览器侧 `ctx.remote.credentials`（dsh-api-settings-controller）只开
 * `describe` / `set` / `unset`，连 `listRecords` 都没开。所以要让用户在下拉里看见
 * "这本存储里已经有什么名字"，宿主侧读文件是唯一出路；**只要键名、不取值**（值只在本函数
 * 的局部 `lines` 里路过，不进任何返回值，也不写日志）。
 *
 * 解析刻意最小（与上面 readManagedEnvKeys 同款，不为它引 YAML 依赖）：只认 `refs:` 顶层
 * 区块内「恰好两个空格 + POSIX 标识符 + 冒号」的行。本地 provider 写入时用 `yaml` 严格
 * 校验过（version: 1 / 值必须非空字符串 / 键必须是标识符），所以这个格式是稳的；真被手改
 * 坏了也只是候选少几个 —— 引用最终仍由连接时的凭据层校验存在性。
 *
 * 路径解析与本地 provider 的默认一致（$DSH_HOME 优先，空串视为未设，再退 ~/.dsh）。边界：
 * 若有人给 provider 配了自定义 `path` / `dshHome`，这里看不到那些引用（字段仍可手输名字）。
 */
/**
 * `/api/dsh-tty/credential-refs` 的路由逻辑（导出仅供单测
 * test/credential-refs.test.ts）：loopback 闸门 + 方法闸门 + 只回引用名的载荷。
 * 值在任何分支都不进响应——SSH 对话框的选择器只需要「我存过哪些名字」。
 */
export declare function handleCredentialRefsRoute(req: ReqLike, res: ResLike): Promise<void>;
/** 导出仅供单测（test/credential-refs.test.ts）：只验键名解析，不取值。 */
export declare function readCredentialRefNames(): string[];
/**
 * 数据路由的统一闸门（**导出仅供单测**）：回环围栏（加固档）+ 变更端点的同源证明。
 * 十二处路由此前各抄一遍 403 样板，`mutation` 这条判据一加就会各写各的——收敛成一处后
 * 「拒绝分支」只有一份，负例也只测这一份。
 *
 * 哪些是变更端点（`mutation: true`）——**判据是「这次请求会不会改状态」**：
 *   - `POST /probe`：真的拨号，且连接簿条目测试会当场 TOFU 记录主机指纹；
 *   - `POST /sftp/{mkdir,rename,remove,upload}`、`POST /local-fs/{mkdir,rename,remove,transfer}`：
 *     写远端 / 写本机 / 起传输任务；
 *   - `POST /config`**刻意不在其列**（与 docker 同口径）：它是插件被禁用后唯一的恢复入口
 *     ——卡片靠它渲染、也是重新启用的唯一 UI 入口；跨站 POST 已由上面那条围栏的
 *     `sec-fetch-site: cross-site` 与 Origin 比对拦住。
 * 只读端点（GET 全家 + `sftp /list` `/download`、`local-fs /list`）维持 loopback-only：
 * 它们读的是用户自己主动要的东西，读路由加证明只会把旧 Safari / 裸 curl 一起挡在门外。
 *
 * **WS upgrade 不走这里**（那是 socket 握手，不是 req/res 路由）：见 `handleUpgrade`
 * 用的 `isLoopbackRequestStrict`——它自带「Origin 有则必须同源」这条判据，等价于给
 * 升级请求也上了证明，但**刻意不放开 Cookie 例外**：长连的生命周期比一次 POST 长得多。
 */
export declare function gateRoute(req: ReqLike, res: ResLike, options?: {
    mutation?: boolean;
}): Promise<boolean>;
/**
 * 这个前缀路由的子路径是否**会改状态**（导出仅供单测）。
 *
 * 为什么单独抽出来：`/list` 与 `/download` 也是 POST（凭证走 body、不进 URL），但它们只是
 * 读——如果把「POST 就要求证明」一刀切下去，读路由会连带把旧 Safari / 裸 curl 挡在门外，
 * 而它们本来就没有可被跨站利用的副作用。判据是**动作**不是**方法**，所以名单必须显式。
 * 没见过的子路径一律 false（几步之后就是 404，不给它额外的信息量）。
 */
export declare function isMutationSubroute(prefix: string, sub: string): boolean;
interface ResLike {
    writeHead(status: number, headers?: Record<string, string>): void;
    /** 二进制响应（SFTP 下载）也走 end；Node 的 ServerResponse 原生接受 Uint8Array。 */
    end(body?: string | Uint8Array): void;
}
export declare const name: string, inject: string[] | undefined, apply: (ctx: Context, config?: Config | undefined) => void;
