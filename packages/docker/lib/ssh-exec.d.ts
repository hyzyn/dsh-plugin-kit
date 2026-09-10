import type { ConnectConfig } from 'ssh2';
/** TOFU 主机指纹记录（与 tty 同形状，便于人工比对）。 */
export interface HostKeyRecord {
    host: string;
    port: number;
    /** hostVerifier 收到的原样 sha256 十六进制指纹。 */
    fingerprint: string;
}
/** 主机指纹钉扎存储（宿主半体实现为配置状态 + settings 持久化）。 */
export interface HostKeyStore {
    /** 已记录的指纹；未记录返回 undefined。 */
    get(host: string, port: number): string | undefined;
    /** 首次连接握手时记录指纹。 */
    record(host: string, port: number, fingerprint: string): void;
}
/** 内联 SSH 连接规格（连接簿条目共用同一形状）。 */
export interface SshSpec {
    host: string;
    port?: number;
    username: string;
    auth?: 'agent' | 'key' | 'password';
    keyPath?: string;
    passphrase?: string;
    password?: string;
    agentForward?: boolean;
}
/** 一条命令的执行结果。 */
export interface ExecResult {
    /** 退出码；进程被信号杀死或 channel 异常时为 null。 */
    code: number | null;
    stdout: string;
    stderr: string;
    /** 超时被强制中断。 */
    timedOut: boolean;
    /** 输出超过上限被截断。 */
    truncated: boolean;
    /** 实际耗时（毫秒）。 */
    durationMs: number;
}
export interface ExecOptions {
    /** 超时（毫秒），超时后中断 channel / 杀死进程。 */
    timeoutMs?: number;
    /** stdout + stderr 各自的字节上限（超出截断并标记 truncated）。 */
    maxBytes?: number;
    /** 追加到 stdin 的内容（如 `docker exec -i` 需要喂 stdin 时）。 */
    input?: string;
}
export interface ExecLogger {
    info(msg: string): void;
    warn(msg: string): void;
}
/** `env:VAR` 前缀从 process.env 取值；否则原样返回。 */
export declare function resolveSecret(value: string | undefined): string | undefined;
export declare function expandHome(path: string): string;
/** 展示用目标串：user@host（非默认端口时带 :port）。 */
export declare function sshTarget(spec: SshSpec): string;
/**
 * 把 argv 拼成远程 shell 可执行的单行命令（POSIX 单引号转义）。
 * exec channel 的 command 由远端 shell 解析，因此**必须**转义——本插件所有
 * 命令都以 argv 数组构造，禁止把用户输入拼进字符串。
 */
export declare function shJoin(argv: readonly string[]): string;
/** 远程一次性命令执行器：懒连接池 + TOFU 指纹 + 输出上限。 */
export declare class RemoteExec {
    private readonly logger;
    private readonly store;
    private readonly conns;
    private sweeper;
    constructor(logger: ExecLogger, store: HostKeyStore);
    /** 插件卸载：关定时器与全部连接（幂等）。 */
    disposeAll(): void;
    /** 在远程执行一条命令（argv 形式，内部做 shell 转义）。 */
    run(spec: SshSpec, argv: readonly string[], options?: ExecOptions): Promise<ExecResult>;
    private ensureSweeper;
    private acquire;
    private dropConn;
}
/** 构造连接配置（认证三态 + keepalive + hostHash）；与 tty 的 ssh.ts 同策略。 */
export declare function buildConnectConfig(spec: SshSpec): ConnectConfig;
/** TOFU 主机指纹策略（hostVerifier 接线）；mismatchMessage() 供错误路径取人类可读拒绝原因。 */
export declare function applyHostKeyPolicy(options: {
    connectConfig: ConnectConfig;
    spec: SshSpec;
    store?: HostKeyStore;
    logger?: ExecLogger;
    target: string;
}): {
    mismatchMessage(): string | null;
};
/**
 * 本机一次性命令执行器（argv 数组，不经 shell）。
 * 用于 kind=local 的目标：宿主所在机器的 docker CLI。
 */
export declare function runLocal(argv: readonly string[], options?: ExecOptions): Promise<ExecResult>;
