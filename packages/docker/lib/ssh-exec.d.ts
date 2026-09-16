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
/** 长流（docker logs --follow）的分片回调；chunk 已按 utf8 解码，跨包的
 *  多字节序列由 StringDecoder 兜住，调用方拿到的一定是完整文本。 */
export interface StreamHandlers {
    onStdout(chunk: string): void;
    onStderr(chunk: string): void;
}
/** 长流结束结果：自然退出给退出码，被中止（signal）时为 null。 */
export interface StreamResult {
    code: number | null;
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
 * 顺序：官方凭据 provider 优先（它自己会叠 `file` / `env` / `project-env` / `user-env` 各层，
 * 而且"每次操作重新解析"——改完下一个操作即生效，不必重启宿主）；服务不在、或它没有这个引用
 * 时，再退回 `process.env`。
 *
 * provider 抛错**不吞**：记下来，若环境变量也没有就把两个来源一起写进错误里。否则"凭据服务
 * 坏了"会伪装成"你没配"，而那是最难查的一类。
 */
export declare function resolveSecretVia(provider: CredentialResolver | null, value: string | undefined): Promise<string | undefined>;
/** 生产路径：用当前注入的 provider。 */
export declare function resolveSecret(value: string | undefined): Promise<string | undefined>;
export declare function expandHome(path: string): string;
/** 展示用目标串：user@host（非默认端口时带 :port）。 */
export declare function sshTarget(spec: SshSpec): string;
/**
 * 把 argv 拼成远程 shell 可执行的单行命令（POSIX 单引号转义）。
 * exec channel 的 command 由远端 shell 解析，因此**必须**转义——本插件所有
 * 命令都以 argv 数组构造，禁止把用户输入拼进字符串。
 */
export declare function shJoin(argv: readonly string[]): string;
/**
 * 长流配额判定（纯函数，便于回归）：`busy` 是连接上正在推送的长流数。
 * @param target - 目标标签，只用于文案。
 * @param busy - 当前长流数。
 * @param max - 上限，默认 {@link MAX_STREAMS_PER_TARGET}。
 * @returns null 表示可以开；否则返回拒绝原因（调用方直接拿它当错误文案）。
 */
export declare function streamBudgetError(target: string, busy: number, max?: number): string | null;
/**
 * 把 ssh2 的通道级错误翻成可操作的提示。
 *
 * `(SSH) Channel open failure: open failed` 实测出现过（成因见 {@link MAX_STREAMS_PER_TARGET}
 * 的注释），偏偏出现在「刷新列表」这种日常操作上，而原始文案对用户没有任何指向性。
 * @param message - ssh2 给出的原始错误文案。
 * @returns 补了指向性说明的文案；不认识的原样返回。
 */
export declare function describeExecError(message: string): string;
/**
 * 这条 ssh2 错误是不是**传输层 / 连接层**的（而不是命令自己失败）。
 *
 * 为什么要分类：池里的连接可能已经死了（远端 sshd 重启、网络抖动、sshd 踢掉空闲连接），
 * 而 `acquire()` 复用 memoized 的 `ready`、不会每次探活。这种时候唯一正确的动作是丢掉
 * 这条连接、重连一次再试；反过来，「命令返回非零」「镜像不存在」这类业务失败**绝不能**
 * 触发重连——那会把一次普通错误变成两条命令。
 */
export declare function isTransportError(message: string): boolean;
/**
 * 空闲回收判定：busy>0 的连接上挂着长流（docker logs --follow 可以几小时不结束），
 * 期间 lastUsed 不会刷新——若只看 idle 就会把正在推送的流掐断，必须先看 busy。
 * 抽成纯函数便于回归（sweeper 本体依赖定时器，难以直接驱动）。
 */
export declare function shouldRecycleConn(conn: {
    lastUsed: number;
    busy: number;
}, now: number, idleMs?: number): boolean;
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
    /**
     * 在远程开一条**长流**（docker logs --follow）：stdout/stderr 逐块回调，
     * channel 关闭时 resolve 退出码。
     *
     * 与 run() 的差别：无总超时、无输出上限；外部 AbortSignal 触发停止时
     * channel.signal('KILL') + channel.close()，**不 client.end()**——连接池里的
     * 连接要留给后续请求复用。流存续期间连接计 busy，sweeper 不得按空闲回收。
     */
    stream(spec: SshSpec, argv: readonly string[], handlers: StreamHandlers, signal?: AbortSignal): Promise<StreamResult>;
    private ensureSweeper;
    /**
     * 开一条 exec channel；**传输层**错误时丢掉连接、重连一次（见 `isTransportError`）。
     *
     * 只重试一次：重连之后还报同样的错，多半不是连接的问题（远端 MaxSessions 真满了、
     * 或目标本身不可达），再试只是把失败拖长、还会多压一条命令过去。
     */
    private openChannel;
    private acquire;
    private dropConn;
}
/** 构造连接配置（认证三态 + keepalive + hostHash）；与 tty 的 ssh.ts 同策略。 */
export declare function buildConnectConfig(spec: SshSpec): Promise<ConnectConfig>;
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
/**
 * 本机**长流**执行器（argv 数组，不经 shell）：stdout/stderr 逐块回调，
 * 用于 `docker logs --follow` 这类不设总超时、不设输出上限的命令。
 *
 * 停止由外部 AbortSignal 触发，走 SIGTERM → 2s 未退出再 SIGKILL 的阶梯；
 * child 'close' 时 resolve 退出码（被信号杀死时为 null）。
 */
export declare function runLocalStream(argv: readonly string[], handlers: StreamHandlers, signal?: AbortSignal): Promise<StreamResult>;
