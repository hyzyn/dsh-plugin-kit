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
    /**
     * 服务器状态条（0.17.0）：在同一条 SSH 连接上另开一条**非 PTY 的 exec
     * channel**（RFC 4254 §6.5）跑常驻采集脚本，按行回调 stdout。返回句柄的
     * stop() 关闭 channel（远端循环随之结束）。任何失败（对端拒绝 exec、
     * MaxSessions 超限、连接断开、采集进程自己退出）只回调 onError——采集是
     * 附加能力，调用方静默停表，绝不写 PTY、绝不弹错。
     * 只有 SSH 实现提供：本地会话由宿主自己采（见 stats.ts 的本地采样器）。
     */
    statsExec?(command: string, onLine: (line: string) => void, onError: () => void): {
        stop(): void;
    };
    /** spawn 后注入终端的灰字提示（如远程无 tmux 降级为普通会话）。 */
    startupNotice?: string;
}
/**
 * TOFU 主机指纹记录（0.19.0 起一机多指纹）：known_hosts 里同一 host:port 常
 * 同时有 ssh-rsa 与 ssh-ed25519 两行，而 ssh2 优先协商 ed25519——只留一条
 * 指纹时，RSA 行在前的老机器导入后必然「指纹不符 → 假 MITM 告警」。集合任一
 * 命中即放行；同机指纹总量有上限（防止无界增长），上限内不做算法识别。
 */
export interface HostKeyRecord {
    host: string;
    port: number;
    /** hostVerifier 收到的原样 sha256 十六进制指纹（多把钥匙 = 多个）。 */
    fingerprints: string[];
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
    /**
     * 自定义远程命令（0.14.0）：给「开一个标签直接跑某条命令」用（如
     * `docker exec -it <容器> sh`）。设置后走 `conn.exec(command, {pty})`，
     * 不建登录 shell、也不做 tmux 持久化（命令的生命周期本就短）。
     * 命令由宿主侧插件提供，单行（由帧解析保证）。
     */
    command?: string;
}
/**
 * 主机指纹钉扎存储（宿主半体实现为 LiveConfig + settings 持久化）。
 * get 返回 undefined 表示该 host:port 从未记录；返回数组（≥1 条）时任一命中放行。
 */
export interface HostKeyStore {
    /** 已记录的指纹集合（hostVerifier 收到的原样十六进制串）；未记录返回 undefined。 */
    get(host: string, port: number): string[] | undefined;
    /** 握手时记录指纹（已存在该 host:port 的记录则并入集合）。 */
    record(host: string, port: number, fingerprint: string): void;
}
/**
 * 官方凭据服务的**最小结构面**（结构类型，不把这个包加成本插件依赖）。
 *
 * 契约见 `@deepseek-ai/dsh-credentials`：`resolve(ref)` **每次操作重新解析、不得跨操作缓存**，
 * 返回 `{ value, source }` 或 undefined。这里只声明用到的那一个方法——既不必引依赖，也能在
 * 服务缺失时静态看出"没有它"。
 */
export interface CredentialResolver {
    resolve(ref: string): Promise<{
        value: string;
    } | undefined>;
}
/** 由 index.ts 在可选注入里挂上（服务缺失即为 null，退回 process.env）。 */
export declare function setCredentialResolver(resolver: CredentialResolver | null): void;
/**
 * 解析密钥引用（`env:NAME`）——**纯核心**，provider 由调用方给，便于离线断言。
 *
 * 顺序：官方凭据 provider **优先**（它自己叠 `file`（`$DSH_HOME/.credentials.yaml`）/ `env` /
 * `project-env` / `user-env` 各层，而且"每次操作重新解析"——改完下一个操作即生效，不必重启
 * 宿主）；服务不在、或它没有这个引用时，再退回 `process.env`。
 *
 * 为什么必须走 provider：凭据存储里的值**永远不会被 materialize 进环境**（provider README 原话：
 * "a store the harness owns and never materializes into the environment"），所以只读
 * `process.env` 等于"存进凭据存储的值连接时根本读不到" ✗ —— 这正是「存入凭据存储」这条链此前
 * 断掉的地方（客户端那半切好了、宿主这半没切）。
 *
 * provider 抛错**不吞**：记下来，若环境变量也没有就把两个来源一起写进错误里。否则"凭据服务
 * 坏了"会伪装成"你没配"，而那是最难查的一类。
 */
export declare function resolveSecretVia(provider: CredentialResolver | null, value: string | undefined): Promise<string | undefined>;
/** 生产路径：用当前注入的 provider（`index.ts` 注入；没注入就是 null）。 */
export declare function resolveSecret(value: string | undefined): Promise<string | undefined>;
declare function expandHome(path: string): string;
/** 供 ~/.ssh/config 导入路由使用（~ 与 ~/ 前缀展开 home）。 */
export { expandHome };
/** 展示用目标串：user@host（非默认端口时带 :port）。 */
export declare function sshTarget(spec: SshSpec): string;
/**
 * 把 ssh2 的底层错误消息分类为人类可读诊断（0.19.0 自 probe.ts 上移至此统一
 * 导出——终端 / 隧道 / 探测三条路径共用同一套文案，不再透传原始英文）。
 * 分类串本身已含关键字段；无法识别时原样返回。
 */
export declare function classifyError(message: string): string;
/**
 * 构造连接配置（认证三态 + keepalive + hostHash）；spawnSsh / probeSsh / SFTP / 隧道共用。
 *
 * **async**：`env:NAME` 引用要经官方凭据 provider 解析（每操作重解析，不可缓存），见
 * resolveSecretVia —— 这是"存入凭据存储"的值能被连接真正用到的唯一通路。
 */
export declare function buildConnectConfig(spec: SshSpec): Promise<ConnectConfig>;
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
