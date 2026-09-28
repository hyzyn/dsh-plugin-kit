import type { ShellSpawnPlan } from './shell-integration.js';
/** 专用 tmux socket 名：与用户自己的 tmux server 完全隔离。 */
export declare const TMUX_SOCKET = "dsh-tty";
/** 探测结果：available = tmux 存在；passthrough = 版本 ≥3.3（DCS 信封可转发）。 */
export interface TmuxProbe {
    available: boolean;
    passthrough: boolean;
    /**
     * `true` = **没探明白**（探测超时 / 被信号收掉），而不是「tmux 不在」（D80）。
     * 调用方据此把提示写成「机器忙，重开标签再试」而不是「未安装」；这种结论**不进缓存**。
     */
    inconclusive?: boolean;
}
/**
 * 探测 tmux 可用性与版本（30s TTL；超时→补探一次）。
 *
 * 超时**不判死**（D80）：原先任何 error 都返回 `{available:false}` 且结果进 30s 缓存，
 * 于是启动争抢期一次慢探测就让这一窗口里开的每个持久标签静默降级成普通会话，提示还
 * 写成「未检测到 tmux」——把「机器忙」误报成「没装」。现在超时补探一次、结论不进缓存、
 * `inconclusive` 带出去让调用方如实提示。
 */
export declare function probeTmux(): Promise<TmuxProbe>;
/**
 * 单次 tmux 调用的结果：`error` 原样带出——「超时」与「没有 server / 没装」的区别
 * 全靠它（见 `isProbeTimeout`），所以这里不吞错、也不翻译。
 */
interface TmuxExecResult {
    error?: unknown;
    stdout: string;
}
type TmuxExec = (args: string[], timeoutMs: number) => Promise<TmuxExecResult>;
/**
 * 供测试注入 tmux 调用（真机上不必调用）；传 `undefined` 恢复真实调用并清探测缓存。
 *
 * 需要这个缝是因为真实 `tmux` 在 CI 上未必存在，"超时才补探、超时不进缓存"这几条
 * 又必须能确定性地造出来（否则这三条只会在有 tmux 的机器上被覆盖）。
 */
export declare function setTmuxExecForTest(exec?: TmuxExec): void;
/** spawn 帧里的持久名清洗：合法字符集加 `dsh-` 前缀；不合法退回 sid 派生名。 */
export declare function sanitizePersistName(raw: unknown, sid: string): string;
/**
 * 生成/刷新 tmux 运行资产（tmux.conf + inner.sh）：每个持久 spawn 前调用，
 * 内容随当前配置（shell / shellIntegration / passthrough）write-if-changed。
 * conf 只在 tmux server 首启时被读，后续 spawn 的重写不生效 —— 但 inner.sh
 * 内容每次开 pane 都会重新执行，配置热改对持久标签的新 pane 仍然生效。
 */
export declare function ensureTmuxAssets(options: {
    shell: string;
    colorTerm: string;
    shellIntegration: boolean;
    passthrough: boolean;
}): void;
/**
 * 持久本地会话的 `-c` 包装层：TERM/COLORTERM 注入（与普通会话同机制）后
 * `exec tmux -A` attach-or-create。持久名已过 sanitizePersistName（安全字符集），
 * 单引号包裹防注入；cwd 不进命令行 —— tmux 客户端继承 node-pty spawn 的 cwd，
 * 新 session 的 pane 以此为工作目录。
 */
export declare function buildTmuxSpawnPlan(options: {
    shell: string;
    term: string;
    colorTerm: string;
    tmuxName: string;
}): ShellSpawnPlan;
/** kill 帧的 tmux 侧收尾：kill-session（不存在/已死同样 resolve，错误吞掉）。 */
export declare function killTmuxSession(tmuxName: string): Promise<void>;
/**
 * 专用 socket 上现存的 tmux 会话名（sessions 帧的 tmux 字段）。
 *
 * 探不明白（超时 / 被信号收掉）返回 `undefined` 而不是 `[]`（D81）：空数组会被读成
 * 「确实没有任何持久会话」这个**确定答案**，而失败只是「不知道」——下游据此淘汰
 * 持久标签规格时，两者含义完全相反。所以只把**确定**的「没有 server / 没装」
 * （非零退出、ENOENT）落成 `[]`。
 */
export declare function listTmuxSessions(): Promise<string[] | undefined>;
/**
 * attach 重画：tmux 背书会话重连时不回放宿主环形缓冲（tmux 的整屏重画会把
 * 同样内容再画一遍 → 重影 + 幽灵滚动条），改为让 tmux 强制重画客户端一次。
 * 同一会话可能被多个窗口同时接回（每窗口一个 PTY 客户端），list-clients
 * 逐个 refresh——只刷第一个会把另一个窗口留在 reset 后的空白屏上；任何
 * 失败静默吞掉（极端情况下用户敲一次键 tmux 也会重画）。
 */
export declare function refreshTmuxClient(tmuxName: string): Promise<void>;
export {};
