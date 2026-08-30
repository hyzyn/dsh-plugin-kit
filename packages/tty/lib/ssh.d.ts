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
/**
 * 建立 SSH 连接并打开交互 shell channel，返回 TermHandle。
 * 失败（连接超时/认证被拒/host 不可达）时 reject 带人类可读信息。
 */
export declare function spawnSsh(spec: SshSpec, options: SshSpawnOptions): Promise<TermHandle>;
