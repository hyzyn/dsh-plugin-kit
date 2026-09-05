import type { ConnectConfig } from 'ssh2';
import { PassThrough } from 'node:stream';
export interface TermExit {
    exitCode: number | null;
    signal: string | null;
}
export interface TermHandle {
    readonly kind: 'local' | 'ssh';
    /** SSH 会话没有本地 pid，为 null。 */
    readonly pid: number | null;
    /** 输出流（flowing 模式消费；pause/resume 用于下行背压）。 */
    readonly output: PassThrough;
    /** 退出事实，恰好 resolve 一次。 */
    readonly done: Promise<TermExit>;
    write(data: string): Promise<unknown>;
    resize(cols: number, rows: number): void;
    terminate(): Promise<unknown>;
    /** terminate 失败后的最后手段（本地 PTY：对顶层 shell 直接 SIGKILL）。 */
    forceKill?(): void;
    /**
     * tmux 背书会话（0.10.0 持久化）的关闭收尾：kill-session 让 pane 真正结束，
     * 而不是只杀客户端把会话留在 tmux server 上。kill 帧路径在 forceKill 前调用。
     */
    tmuxTeardown?(): Promise<void>;
    /**
     * 强制 tmux 重画该会话的全部客户端（0.10.1 跨窗口共享：新绑定连接的
     * xterm 需要一份可见屏重画）。本地实现走本机 tmux CLI（src/tmux.ts），
     * SSH 实现在远程连接内 exec（本机 tmux 看不到远程会话）。
     */
    tmuxRefresh?(): Promise<void>;
    /** spawn 后注入终端的灰字提示（如远程无 tmux 降级为普通会话）。 */
    startupNotice?: string;
}
/** TOFU 主机指纹记录。 */
export interface HostKeyRecord {
    host: string;
    port: number;
    /** hostVerifier 收到的原样 sha256 十六进制指纹。 */
    fingerprint: string;
}
/** 内联 SSH 连接规格（ws 帧或连接簿条目共用）。 */
export interface SshSpec {
    host: string;
    port?: number;
    username: string;
    auth?: 'agent' | 'key' | 'password';
    keyPath?: string;
    passphrase?: string;
    password?: string;
    /** OpenSSH agent forwarding：远程可用本地 ssh-agent 的钥匙（git clone 等）。 */
    agentForward?: boolean;
}
/** 连接簿条目（带名字，存 settings）。 */
export interface SshHostEntry extends SshSpec {
    name: string;
    /** 该条目的 SSH 标签默认以 tmux 持久会话打开（仅宿主 persistence=tmux 时生效）。 */
    persist?: boolean;
}
export interface SshSpawnOptions {
    term: string;
    cols: number;
    rows: number;
    logger?: {
        info(msg: string): void;
        warn(msg: string): void;
    };
    /**
     * known_hosts TOFU 钉扎存储：首次连接 record() 记录指纹，之后 get() 校验。
     * 缺省时退化为 accept-and-log（仅记录指纹，无条件放行）。
     */
    hostKeyStore?: HostKeyStore;
    /**
     * tmux 会话持久化（0.10.0）：远程以 `exec tmux new-session -A -s <name>` 开
     * pty channel（专用 socket dsh-tty），会话托管在远程 tmux server 上，断线/
     * 宿主重启后按同名接回。远程无 tmux 时降级普通 shell channel，
     * startupNotice 带提示。name 须已过 sanitizePersistName（安全字符集）。
     */
    persist?: {
        name: string;
    };
}
/** 主机指纹钉扎存储（宿主半体实现为 LiveConfig + settings 持久化）。 */
export interface HostKeyStore {
    /** 已记录的指纹（hostVerifier 收到的原样十六进制串）；未记录返回 undefined。 */
    get(host: string, port: number): string | undefined;
    /** 首次连接握手时记录指纹。 */
    record(host: string, port: number, fingerprint: string): void;
}
declare function expandHome(path: string): string;
/** 供 ~/.ssh/config 导入路由使用（~ 与 ~/ 前缀展开 home）。 */
export { expandHome };
/** 展示用目标串：user@host（非默认端口时带 :port）。 */
export declare function sshTarget(spec: SshSpec): string;
/** 构造连接配置（认证三态 + keepalive + hostHash）；隧道管理器与 spawnSsh 共用。 */
export declare function buildConnectConfig(spec: SshSpec): ConnectConfig;
/** TOFU 主机指纹策略（hostVerifier 接线）；返回的 mismatchMessage() 供连接错误路径取人类可读拒绝原因。 */
export declare function applyHostKeyPolicy(options: {
    connectConfig: ConnectConfig;
    spec: SshSpec;
    store?: HostKeyStore;
    logger?: {
        info(msg: string): void;
        warn(msg: string): void;
    };
    target: string;
}): {
    mismatchMessage(): string | null;
};
/**
 * 建立 SSH 连接并打开交互 shell channel，返回 TermHandle。
 * 失败（连接超时/认证被拒/host 不可达）时 reject 带人类可读信息。
 */
export declare function spawnSsh(spec: SshSpec, options: SshSpawnOptions): Promise<TermHandle>;
