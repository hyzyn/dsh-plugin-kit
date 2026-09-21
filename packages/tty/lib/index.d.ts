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
    /** exit 帧只发一次（kill 主动关闭与 shell 自然退出共用同一回调）。 */
    exitSent?: boolean;
    /** agent 工具展示用的元数据。 */
    cwd: string;
    kind: 'local' | 'ssh';
    /** SSH 会话的展示目标（user@host[:port]）；本地会话为空串。 */
    target: string;
    startedAt: number;
    lastOutputAt: number;
    /** 最近一次 PTY 输入（input 帧 / tty_send）的时间戳：tty_capture{last} 的在途判据之一。 */
    lastInputAt: number;
    /** 输出环形缓冲（尾部 256KB，供 tty_capture 与断线重连回放）。 */
    buffer: string;
    /** utf8 分帧兜底：跨 chunk 的多字节序列由 StringDecoder 缓存补齐。 */
    decoder: StringDecoder;
    /** 虚拟屏（xterm-headless）：tty_screen 的数据源；创建失败为 null。 */
    screen: HeadlessTerminal | null;
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
/** 可热更新的运行时配置（settings/updated 动态应用）。 */
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
    /** SSH 持久会话名（远程 tmux 托管；本机 socket 清单看不到，随 settings 留存）。 */
    persistSessions: string[];
    /** SFTP 传输限制（客户端浏览器侧执行）。 */
    sftpLimits: Required<SftpLimits>;
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
        persistSessions?: string[];
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
        persistSessions: string[];
    }>): void;
    findSshHost(name: string): SshHostEntry | undefined;
}
/**
 * shell 集成状态：OSC 133/7 解析产物（每会话一份）。
 */
interface ShellIntegrationState {
    /** 跨 chunk 未闭合 OSC 序列的残包缓冲（≤512KB，超限丢弃；上限容纳 T 快照——200 行 tmux capture-pane 的 base64 可到数百 KB）。 */
    carry: string;
    /** B..D 之间：命令输出捕获中。 */
    inCommand: boolean;
    cmdBuffer: string;
    /** T 标记带来的 pane 快照（tmux 持久标签；D 时优先于 cmdBuffer）。 */
    pendingT: string | null;
    lastCommand: {
        output: string;
        exitCode: number | null;
        endedAt: number;
    } | null;
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
    canSpawn(): boolean;
    add(session: TtySession): void;
    remove(id: string): void;
    get(id: string): TtySession | undefined;
    /** 会话的只读快照（SSH 会话无本地 pid，该字段省略；tmux 持久会话带 persist）。 */
    private snapshotOf;
    /** agent 工具用的只读快照。 */
    list(): Array<{
        sid: string;
        pid?: number;
        cwd: string;
        kind: 'local' | 'ssh';
        target: string;
        startedAt: number;
        lastOutputAt: number;
        persist?: true;
        owner: 'user' | 'agent';
    }>;
    /** sessions 帧用：额外带 attachable（孤儿且未关闭的会话可被新连接 attach）。 */
    listForAttach(): Array<{
        sid: string;
        pid?: number;
        cwd: string;
        kind: 'local' | 'ssh';
        target: string;
        startedAt: number;
        lastOutputAt: number;
        persist?: true;
        owner: 'user' | 'agent';
        attachable: boolean;
    }>;
    /** 遍历全部会话（状态条采集器的批量收尾等按会话维度的操作）。 */
    forEach(fn: (session: TtySession) => void): void;
    /** 按 tmux 持久会话名查找存活会话（跨窗口共享用）；不存在/已关闭返回 undefined。 */
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
     * 任何失败都静默停表并置 statsFailed（粘性，避免每秒重启）：前端靠「无数据」
     * 隐藏状态条，PTY 数据路径与终端体验完全不受影响。
     */
    private startStats;
    /** 停表（幂等）：订阅清零 / 会话结束 / 插件禁用 / 配置关闭都走它。 */
    private stopStats;
    private stopAllStats;
    /** 帧只发给订阅了该会话的客户端（绑定键寻址，回帧带各连接自己的 sid，跨窗口共享也成立）。 */
    private sendStats;
    /** registerUpgrade 的 handler（loopback 围栏 + ws 握手）。 */
    handleUpgrade(req: ReqLike, socket: SocketLike, head: Buffer): void;
    private onConnection;
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
    /** 每会话一块虚拟屏（xterm-headless）：tty_screen 的数据源；失败降级为 null。 */
    private createScreen;
    private handleMessage;
    /**
     * 服务器状态条订阅（0.17.0）：按「标签可见性」驱动——只有可见标签才发
     * statsOn。未知 sid（客户端竞态）静默忽略，不回错误帧。订阅键与客户端
     * 绑定键同构（connId:sid），跨连接共享同一 sid 时互不踩。
     */
    private handleStatsFrame;
    /** 会话退出事实 → exit 帧（恰好一次；本地 PTY 与 SSH 共用）。 */
    private watchDone;
    /** 输出下行 + 基于 ws.bufferedAmount 的背压（暂停/恢复 PassThrough）。 */
    private attachOutput;
    /** 立即冲刷待发的合并输出（exit/kill 前调用，保证 exit 帧永远在最后一帧 data 之后）。 */
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
interface ResLike {
    writeHead(status: number, headers?: Record<string, string>): void;
    /** 二进制响应（SFTP 下载）也走 end；Node 的 ServerResponse 原生接受 Uint8Array。 */
    end(body?: string | Uint8Array): void;
}
export declare const name: string, inject: string[] | undefined, apply: (ctx: Context, config?: Config | undefined) => void;
