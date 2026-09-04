import type { ShellSpawnPlan } from './shell-integration.js';
/** 专用 tmux socket 名：与用户自己的 tmux server 完全隔离。 */
export declare const TMUX_SOCKET = "dsh-tty";
/** 探测结果：available = tmux 存在；passthrough = 版本 ≥3.3（DCS 信封可转发）。 */
export interface TmuxProbe {
    available: boolean;
    passthrough: boolean;
}
/** 探测 tmux 可用性与版本（30s TTL；execFile 3s 超时）。 */
export declare function probeTmux(): Promise<TmuxProbe>;
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
/** 专用 socket 上现存的 tmux 会话名（sessions 帧的 tmux 字段，客户端恢复确认用）。 */
export declare function listTmuxSessions(): Promise<string[]>;
/**
 * attach 重画：tmux 背书会话重连时不回放宿主环形缓冲（tmux 的整屏重画会把
 * 同样内容再画一遍 → 重影 + 幽灵滚动条），改为让 tmux 强制重画客户端一次。
 * refresh-client 的 -t 收的是 client（tty）名，先经 list-clients -t <会话>
 * 拿到该会话当前 attached 的客户端再刷新；任何失败静默吞掉（极端情况下
 * 用户敲一次键 tmux 也会重画）。
 */
export declare function refreshTmuxClient(tmuxName: string): Promise<void>;
