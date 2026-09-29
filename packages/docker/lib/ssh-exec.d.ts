import type { ChildProcess } from 'node:child_process';
import { Duplex } from 'node:stream';
import { Client } from 'ssh2';
import type { ClientChannel, ConnectConfig } from 'ssh2';
/**
 * TOFU 主机指纹记录（与 tty 0.19.0 同形状：同一 host:port 一组指纹）。
 *
 * 为什么要是一个集合：同一台主机往往同时有 rsa + ed25519 两把主机密钥，
 * ssh2 握手时用哪把取决于算法协商——单指纹记录会在算法切换时把健康连接
 * 误判成「指纹变更」（tty 修 D12 时引入多指纹，这里对齐）。
 */
export interface HostKeyRecord {
    host: string;
    port: number;
    /** hostVerifier 收到的原样 sha256 十六进制指纹集合。 */
    fingerprints: string[];
}
/** 主机指纹钉扎存储（宿主半体实现为配置状态 + settings 持久化）。 */
export interface HostKeyStore {
    /** 已记录的指纹集合（同一 host:port 的全部主机密钥）；未记录返回 undefined / 空数组。 */
    get(host: string, port: number): string[] | undefined;
    /** 首次连接握手时记录一条指纹；该主机已有其他算法的指纹时并入集合。 */
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
    /** 经跳板机连接（ProxyJump 语义，**单跳**）；缺省 = 直连。与 tty 的 `SshSpec.jump` 同形。 */
    jump?: SshJumpSpec;
    /**
     * 代理命令（ProxyCommand 语义，与 tty 的 `SshSpec.proxyCommand` 同形）：本机执行的命令，
     * stdin/stdout 当 SSH 传输。本包同样**只从 tty 连接簿读**（docker 侧不做界面）。
     *
     * **闸门只有一处**：tty settings 的 `allowProxyCommand`（本包通过 `readTtyBooks` 的 settings
     * 句柄同读）。关着时携带它的目标**明确失败**，不退回直连——理由见 tty `src/ssh.ts`。
     */
    proxyCommand?: string;
}
/**
 * 跳板机规格（与 tty `src/ssh.ts` 的 `SshJumpSpec` **逐字同形**，两包各持一份类型）。
 *
 * 本包只从 tty 的连接簿读它（`readTtyBooks`）——docker 侧**不做跳板机界面**：目标是
 * 「一处配置、两处生效」。`username` / `auth` / `keyPath` / `passphrase` / `password`
 * 缺省时**继承目标那一跳**（见 `jumpSpecOf`）。
 */
export interface SshJumpSpec {
    host: string;
    port?: number;
    username?: string;
    auth?: 'agent' | 'key' | 'password';
    keyPath?: string;
    passphrase?: string;
    password?: string;
}
/**
 * 清洗一份跳板机输入（`readTtyBooks` 用）。返回 `undefined` = 没配跳板机——不给下游留
 * `host: ''` 的半个对象（那会让拨号去连空主机名）。
 */
export declare function sanitizeJumpSpec(input: unknown): SshJumpSpec | undefined;
/** 跳板机展示串（`user@host:port`）；没配时返回空串。**凭据不进这里**。 */
export declare function jumpTargetLabel(spec: SshSpec): string;
/** 目标那一跳的展示串 + 跳板机 / 代理命令后缀（错误文案用；理由见 tty `src/ssh.ts` 的同名注释）。 */
export declare function targetWithJump(spec: SshSpec): string;
/** 一条命令的执行结果。 */
export interface ExecResult {
    /** 退出码；进程被信号杀死或 channel 异常时为 null。 */
    code: number | null;
    stdout: string;
    stderr: string;
    /** 超时被强制中断。 */
    timedOut: boolean;
    /** 输出超过上限被截断（keepTail=true 时保留尾部，否则保留头部）。 */
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
    /**
     * 截断时保留**尾部**（默认保留头部）。logs 的最新行、pull 的 digest、
     * prune 的总计都在输出末尾——这类命令超出上限时该丢的是头部（D14）。
     */
    keepTail?: boolean;
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
 * 连接池键：同一主机同一账号复用一条 SSH 连接。
 *
 * host 要 trim + 小写（D111）：否则 `NAS.example` 与 `nas.example` 各建一条连接，而
 * `MAX_STREAMS_PER_TARGET` 与 `shouldRecycleConn` 都是**按连接**计的 → 同一台主机的
 * 长流额度被悄悄翻倍（恰好掩盖 D07 想暴露的 MaxSessions 问题）。口径与 TOFU 的
 * hostVerifier（D03）保持一致：那里也用 `trim().toLowerCase()` 分组指纹。
 */
/**
 * 池键。**跳板机 / 代理命令身份必须并进来**：不同 bastion（或不同代理命令）到同一目标
 * 绝不是同一条连接——只按 `user@host:port` 记的话，第二个 bastion 会静默复用第一条连接、
 * 走错跳板机。这与 tty 的 SFTP 池不同（那边键是 `JSON.stringify(spec)`，天然带上 jump）。
 *
 * 代理命令**只并入它的哈希**，不并入原文：原文可能含凭据（`-i /path/key`、甚至嵌 token），
 * 而池键会进日志/错误文案附近的诊断路径——摘要足够区分且不泄露。
 */
export declare function poolKey(spec: SshSpec): string;
/**
 * 拨跳板机并借一条 forwardOut 通道（ProxyJump 单跳）。与 tty `src/ssh.ts` 的 dialJump 同序。
 * **导出仅供单测**（`test/ssh-jump.test.ts` 用假 ssh2 验「先拨跳板机、再把通道当 sock」）。
 */
export declare function dialJump(options: {
    spec: SshSpec;
    store?: HostKeyStore | undefined;
    logger?: ExecLogger | undefined;
}): Promise<{
    bastion: Client;
    sock: ClientChannel;
}>;
/** 代理命令长度上限（与 tty 同值：它是一条命令行）。 */
export declare const PROXY_COMMAND_MAX = 2000;
/**
 * 闸门关着时报什么错。**与 tty 是同一个开关**（tty settings 的 `allowProxyCommand`）——
 * 连接簿只有一处，开关也只能有一处，否则「连接簿配了、docker 不认」会很难解释。
 */
export declare const PROXY_COMMAND_DISABLED: string;
/**
 * 清洗一份代理命令输入（`readTtyBooks` 用）。返回 `undefined` = 没配。
 * 只做形状校验（非空 / 单行 / 长度）；命令内容不解释——「能不能执行」由闸门决定。
 */
export declare function sanitizeProxyCommand(input: unknown): string | undefined;
/**
 * 展开 `%h` / `%p` / `%r` / `%n` / `%%`（与 OpenSSH 同义，与 tty 逐字同口径：
 * 代入值必须过白名单，否则拒绝执行——理由见 tty `expandProxyCommand`）。
 */
export declare function expandProxyCommand(command: string, spec: SshSpec): string;
/** 代理命令传输（与 tty `ProxyCommandDial` 同形）。 */
export interface ProxyCommandDial {
    child: ChildProcess;
    sock: Duplex;
    failure(): Error | null;
    /**
     * 已经攒到的 stderr 摘要（`；代理命令 stderr: …` 或空串）——**错误路径的兜底**。
     *
     * 与 tty 同因（真机验收暴露的竞态）：ssh2 一看到流断了就报错，而「子进程退出 / 传输关闭」
     * 比它晚 1~2ms，那一刻 `failure()` 还是 null，最有用的那句就被丢掉。
     */
    stderrHint(): string;
    dispose(): void;
}
/**
 * 启动代理命令（ProxyCommand）并把它的 stdio 当作目标连接的传输。
 *
 * 与 tty `src/ssh.ts` 的 dialProxyCommand **逐句同序**（两包不互相 import，只能各写一份；
 * 语义口径由这份注释与单测钉住）：闸门 → 展开 → spawn → 提前退出拖垮传输 → stderr 常驻排空。
 * **导出仅供单测**。
 */
export declare function dialProxyCommand(options: {
    spec: SshSpec;
    /** 闸门求值（缺省 = 关）：本包从 tty settings 读，按**每次拨号**求值——开关一关立刻生效。 */
    allowed?: () => boolean;
    logger?: ExecLogger | undefined;
}): Promise<ProxyCommandDial>;
/** 代理命令失败的事实 → 错误文案后缀（空串 = 没失败），与 tty 同口径。 */
export declare function proxyFailureSuffix(proxy: ProxyCommandDial | null): string;
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
/**
 * SSH 超时文案里的**跳板机提示**（项目级 ROADMAP 第 2 项）。
 *
 * 为什么值得单独一句话：本插件经数据级复用读得到 tty 的连接簿，但**不读 `~/.ssh/config`**，
 * 所以「配了跳板机的目标连不上」在 docker 侧只能表现为一句通用超时。企业内网主机几乎都
 * 要过 bastion，用户需要的是「可能是什么原因、以及这个版本到底支不支持」——而不是 20 秒后
 * 一句放之四海皆准的「主机无响应」。
 */
export declare const SSH_TIMEOUT_HINT: string;
export declare function describeExecError(message: string): string;
/**
 * 这条错误是不是**通道额度被远端占满**（D150）。
 *
 * sshd 侧的原话是 `error: no more sessions`（`session_new()` 在
 * `sessions_nalloc >= options.max_sessions` 时返回 NULL），ssh2 把它翻译成
 * `(SSH) Channel open failure: open failed` —— 两个形态都要认。
 *
 * 与 {@link isTransportError} 分开判定的理由：它**曾经**被当成「连接健康、别重连」的一类
 * （D07），但线上实证（2026-09-29，248）表明被占满的连接会**一直是满的**：
 * ① 客户端中止长流时发的 `signal('KILL')` 在部分 sshd 上被直接拒绝
 *   （`error: session_signal_req: session signalling requires privilege separation`）；
 * ② sshd 在子进程仍活着时**延迟释放** session 槽（session.c：`delay detach of session`）。
 * 两条叠加后，插件侧 `busy` 归零而远端槽位仍未归还，于是「重试」永远打在一条满连接上。
 * 重建连接是唯一能让额度立刻归零的动作，所以这一类改判为「丢连接 + 重建一次」。
 */
export declare function isChannelExhaustedError(message: string): boolean;
/**
 * 这条 ssh2 错误是不是**传输层 / 连接层**的（而不是命令自己失败）。
 *
 * 为什么要分类：池里的连接可能已经死了（远端 sshd 重启、网络抖动、sshd 踢掉空闲连接），
 * 而 `acquire()` 复用 memoized 的 `ready`、不会每次探活。这种时候唯一正确的动作是丢掉
 * 这条连接、重连一次再试；反过来，「命令返回非零」「镜像不存在」这类业务失败**绝不能**
 * 触发重连——那会把一次普通错误变成两条命令。
 *
 * 「Channel open failure / open failed」**不在**这份名单里（D07 的取舍仍然成立：它是远端拒绝
 * 开新通道，连接本身未必是死的，而且把它当传输错误会让 `describeExecError` 补的可操作文案
 * 被一次成功的重连藏掉）。但 D150（2026-09-29 线上实证）补了一条**独立分支**：识别为
 * {@link isChannelExhaustedError} 时也丢连接重建，**并且**在日志里留一行 warn——
 * 因为被占满的连接不会自己恢复（见 {@link isChannelExhaustedError} 的注释），
 * 不重建就永远是那句「重试也没用」。
 */
export declare function isTransportError(message: string): boolean;
/**
 * 空闲回收判定：busy>0 的连接上挂着长流（docker logs --follow 可以几小时不结束），
 * inflight>0 的连接上有一次性命令在跑（docker pull 默认 600s，期间没有任何请求
 * 刷新 lastUsed）——两类都必须让空闲回收让路，否则在途命令会被 sweeper 掐断在半路
 * （D01）。抽成纯函数便于回归（sweeper 本体依赖定时器，难以直接驱动）。
 */
export declare function shouldRecycleConn(conn: {
    lastUsed: number;
    busy: number;
    inflight?: number;
}, now: number, idleMs?: number): boolean;
/**
 * 每条连接上的短命令闸门（FIFO，D150）。`acquire()` 返回释放函数；超出上限的调用排队。
 *
 * 名额是**转交**而不是「先减后加」：释放时若队列里有人，直接把名额交给它、`active` 不减，
 * 否则同一 tick 里新来的 `acquire()` 会看到一个空位、与刚被唤醒的等待者**同时**拿到名额
 * （并发数超限，而这正是闸门要防的事）。
 *
 * `dispose()` 放行全部等待者（插件卸载时不能让排队中的命令永远挂着）；此时 `active` 与真实
 * 占用的对应关系不再有意义，所以减法一律 `Math.max(0, …)`。
 */
export declare class ShortChannelGate {
    private readonly limit;
    private active;
    private readonly waiters;
    constructor(limit?: number);
    acquire(): Promise<() => void>;
    /** 占用中的并发数（测试缝）。 */
    get inUse(): number;
    /** 排队中的调用数（测试缝）。 */
    get queued(): number;
    /** 放行全部等待者（卸载路径；幂等）。 */
    dispose(): void;
    private releaseFn;
}
/** 远程一次性命令执行器：懒连接池 + TOFU 指纹 + 输出上限。 */
export declare class RemoteExec {
    private readonly logger;
    private readonly store;
    /**
     * ProxyCommand 闸门求值器（缺省 = 恒关）。
     *
     * 为什么是**回调**而不是构造时读一次的布尔值：开关归 tty settings，本包的 settings 句柄是
     * 运行时才就绪的，而且用户随时可能关掉它——关掉之后必须**立刻**对下一次拨号生效
     * （留着旧值意味着「关了还能用」，那正是这一档最不能出的错）。求值只读内存，无 IO。
     */
    private readonly options;
    private readonly conns;
    /** 每个池键一条短命令闸门（D150）；与连接同寿命，连接被重建也不重置配额。 */
    private readonly gates;
    private sweeper;
    constructor(logger: ExecLogger, store: HostKeyStore, 
    /**
     * ProxyCommand 闸门求值器（缺省 = 恒关）。
     *
     * 为什么是**回调**而不是构造时读一次的布尔值：开关归 tty settings，本包的 settings 句柄是
     * 运行时才就绪的，而且用户随时可能关掉它——关掉之后必须**立刻**对下一次拨号生效
     * （留着旧值意味着「关了还能用」，那正是这一档最不能出的错）。求值只读内存，无 IO。
     */
    options?: {
        proxyCommandAllowed?: () => boolean;
    });
    /** 插件卸载：关定时器与全部连接（幂等）。 */
    disposeAll(): void;
    /**
     * 取这个池键对应的短命令闸门（懒建）。键与连接池同口径（{@link poolKey}）——闸门防的是
     * 「同一条连接上的通道额度」，所以必须与「同一条连接」同键。
     */
    private gateFor;
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
     * 开一条 exec channel；**传输层**错误或**通道额度被占满**时丢掉连接、重连一次
     * （见 `isTransportError` / `isChannelExhaustedError`）。
     *
     * 只重试一次：重连之后还报同样的错，多半不是连接的问题（目标本身不可达 / 新连接也被
     * 别的东西占满），再试只是把失败拖长、还会多压一条命令过去。
     */
    private openChannel;
    private acquire;
    /** 从池里摘掉一条连接。带 client 时做身份校验：只摘自己这条（D06）。 */
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
