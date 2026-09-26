/**
 * @hyzyn/dsh-tty — SSH 会话封装（方案 C：ssh2 原生集成）。
 *
 * 不经过本地 ssh 进程 / node-pty，直接用 ssh2 建立连接并开 shell channel，
 * 包装成与本地 PTY 完全一致的 TermHandle 形状，TtyServer 无差别调度：
 * input/resize/kill 上行，data/exit 下行，背压、环形缓冲、agent 工具全复用。
 *
 * 认证优先级由 spec.auth 决定：
 *   agent    —— ssh-agent（SSH_AUTH_SOCK），最推荐，凭证不落盘
 *   key      —— keyPath 私钥文件（~ 可省略 home），passphrase 可选
 *   password —— 密码认证，同时挂 keyboard-interactive（很多服务端只开这个）
 * password / passphrase 支持 `env:VAR` 前缀从进程环境变量取值（配合
 * dsh-env-manager 插件托管密钥，避免明文写入 settings 文件）。
 *
 * 主机密钥策略：known_hosts TOFU（trust-on-first-use）钉扎——hostVerifier 里
 * 首次连接记录 sha256 指纹（经 HostKeyStore 持久化），之后每次连接校验：
 * 指纹一致放行；指纹变更拒绝连接（防中间人冒充），用户确认安全后可在
 * 设置卡片删除该主机记录重连。未提供 hostKeyStore 时退化为 accept-and-log
 * （旧行为，测试路径用）。
 */
import { Client } from 'ssh2';
import type { ClientChannel, ConnectConfig } from 'ssh2';
import type { ChildProcess } from 'node:child_process';
import { Duplex, PassThrough } from 'node:stream';
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
    /** 经跳板机连接（ProxyJump 语义，**单跳**）；缺省 = 直连。 */
    jump?: SshJumpSpec;
    /**
     * 代理命令（ProxyCommand 语义）：本机执行的命令，它的 stdin/stdout 就是 SSH 传输。
     *
     * **单独一档信任级**：这是「设置字段驱动的本机任意命令执行」，与跳板机（只连一跳 TCP）
     * 完全不同。因此：
     *   - **默认关闭**（settings `allowProxyCommand`）：关着时携带它的连接一律**明确失败**，
     *     绝不静默退回直连——直连多半也连不上，还会把「配置没生效」伪装成网络问题；
     *   - **`~/.ssh/config` 导入永不自动带入**（`parseSshConfigDetailed` 只报数）；
     *   - `%h` / `%p` / `%r` / `%n` / `%%` 按 OpenSSH 同义展开（见 `expandProxyCommand`），
     *     展开值只允许 `[A-Za-z0-9._@:\[\]-]`，否则**拒绝执行**（防连接簿字段注入 shell）；
     *   - 与 `jump` 同时给时按 OpenSSH 语义 **ProxyJump 优先**，并记一条 warn。
     */
    proxyCommand?: string;
}
/**
 * 跳板机规格（ProxyJump 语义，**单跳**）。
 *
 * 与 `SshSpec` 同形但**不再嵌套**——不支持「跳板机的跳板机」；`username` / `auth` /
 * `keyPath` / `passphrase` / `password` 任一缺省都会**继承目标那一跳**（企业内网里两者
 * 通常共用同一把钥匙或同一个 agent），这也正是 v1 的界面只需要一个输入框的原因。
 *
 * 为什么不像 OpenSSH 那样只存 `user@host:port` 字符串：字符串装不下「与目标不同的凭据」，
 * 而本仓所有认证都要走 `resolveSecret`（`env:VAR` 引用 / 凭据存储层）。界面与导入可以把
 * 简写解析成这个结构。
 *
 * 凭据永不进日志与错误文案：展示串只由 `jumpTargetLabel()` 生成（`user@host:port`）。
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
/** 本文件与各连接点共用的最小日志面（结构上兼容宿主 logger）。 */
export interface SshLogger {
    info(msg: string): void;
    warn(msg: string): void;
}
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
/** 跳板机展示串（`user@host:port`）；没有跳板机时返回空串。**凭据不进这里**。 */
export declare function jumpTargetLabel(spec: SshSpec): string;
/**
 * 跳板机连接 + 借来的通道（目标那一跳把它当 `ConnectConfig.sock`）。
 *
 * 跳板机**自己的 TOFU 策略**在 `dialJump` 内部就接好了（指纹变更提示必须来自正确的那一跳，
 * 而握手期的错误也只有那一段能拿到），所以不往外传句柄。
 */
export interface JumpDial {
    /**
     * 跳板机连接：**它拥有通道**，目标 client 只是借用（ssh2 的 `end()`/`destroy()` 只关
     * 借来的通道，不关跳板机传输）——谁拨的号，谁就要在收尾时 `end()` 它。
     */
    bastion: Client;
    sock: ClientChannel;
}
/**
 * 拨跳板机并借一条 `forwardOut` 通道（ProxyJump 单跳）。
 *
 * 三件事刻意做在这里：
 *   1. **失败一律点名跳板机**（见 `targetWithJump` 的理由）；
 *   2. **指纹策略单独一份**：TOFU 的键是 `(host, port)`，跳板机与目标撞 host:port
 *      （NAT 后的 `127.0.0.1:22` 很常见）时不能共用句柄，否则会出现假「指纹变更」；
 *   3. **失败路径自己关连接**：抛出去之前 `end()` 掉，否则每次重试都会漏一条
 *      keepalive 一直养着的连接。
 */
export declare function dialJump(options: {
    spec: SshSpec;
    store?: HostKeyStore;
    logger?: SshLogger;
    /** 覆盖跳板机那一跳的握手超时（探针路径要短；缺省沿用 buildConnectConfig 的 20s）。 */
    readyTimeoutMs?: number;
}): Promise<JumpDial>;
/** 代理命令长度上限：与自定义命令标签同量级（它是一条命令行，不是脚本文件）。 */
export declare const PROXY_COMMAND_MAX = 2000;
/** 关着闸门时携带代理命令的连接报什么错（导出供单测与客户端文案对照）。 */
export declare const PROXY_COMMAND_DISABLED: string;
/**
 * 宿主**没有授权**这条能力时报什么错（与「授权了但开关关着」分开报）。
 *
 * 为什么要分开：两者的「下一步动作」完全不同——前者要去宿主侧设环境变量 + 重启（界面上那个
 * 开关是点不动的），后者只是把开关打开。合成一句话会让用户对着一个点不动的开关反复点。
 */
export declare const PROXY_COMMAND_NOT_GRANTED: string;
/** 设置 ProxyCommand 闸门（插件 settings 就绪与每次热更新时调用）。 */
export declare function setProxyCommandPolicy(next: {
    granted: boolean;
    enabled: boolean;
}): void;
/** 当前是否真的会用代理命令（探针用它把「配了但没开」与「连不上」分开报）。 */
export declare function proxyCommandAllowedNow(): boolean;
/** 宿主侧是否授权了这条能力（探针用它选文案：未授权 vs 未启用）。 */
export declare function proxyCommandGrantedNow(): boolean;
/**
 * 清洗一份代理命令输入（settings schema / 宽松清洗 / 内联融合共用）。
 *
 * 返回 `undefined` = 没配。**只做形状校验**（非空 / 单行 / 长度），命令内容本身不解释——
 * 「能不能执行」由闸门决定，不由这里猜（含 `;` `/` `|` 都是合法的 shell 写法）。
 */
export declare function sanitizeProxyCommand(input: unknown): string | undefined;
/** 严格校验一份代理命令输入（HTTP POST 路径）；返回错误信息或清洗结果。 */
export declare function validateProxyCommand(input: unknown): {
    proxyCommand?: string;
    error?: string;
};
/**
 * 展开 `%h` / `%p` / `%r` / `%n` / `%%`（与 OpenSSH 同义）。
 *
 * `%h` 目标主机、`%p` 目标端口、`%r` 目标用户名、`%n` 目标主机（如写法里给的名字——
 * 本包没有别名概念，与 `%h` 同值）、`%%` 字面 `%`。其余 `%X` **原样保留**（不报错）：
 * 用户可能是在命令里写 `printf '%s'`，替我们没实现的占位符而失败才是意外。
 *
 * 代入值必须过白名单，否则**抛错拒绝执行**（见 `PROXY_VALUE_SAFE`）。
 */
export declare function expandProxyCommand(command: string, spec: SshSpec): string;
/** 代理命令传输：子进程 + 它的 stdio（目标那条连接把 stdio 当 `ConnectConfig.sock`）。 */
export interface ProxyCommandDial {
    /**
     * 代理命令子进程：**它拥有传输**，目标 client 只是借用——ssh2 的 `end()`/`destroy()`
     * 只关借来的流，不会去杀子进程。
     */
    child: ChildProcess;
    /** 目标连接用的传输（stdin/stdout 合成的 Duplex）。 */
    sock: Duplex;
    /** 子进程提前退出 / 出错的事实；没有则 null（错误文案里点名它，别让用户去查目标主机）。 */
    failure(): Error | null;
    /**
     * 已经攒到的 stderr 摘要（`；代理命令 stderr: …` 或空串）——**错误路径的兜底**。
     *
     * 为什么需要它（真机验收才暴露的竞态）：ssh2 一看到流断了就报错，而「子进程退出 / 传输
     * 关闭」这两个事件比它晚 1~2ms，于是 `failure()` 那一刻还是 null，错误文案就只剩一句
     * 「连接已关闭」——最有用的一句（命令自己说了什么）被丢掉。调用方**已经在报错**时，
     * 手里有 stderr 就该交出去；没有 stderr 则返回空串（不制造噪音）。
     */
    stderrHint(): string;
    /** 收尾：关传输 + 杀子进程（**幂等**；所有 teardown 路径都要调，否则漏一个常驻进程）。 */
    dispose(): void;
}
/**
 * 启动代理命令并把它接到目标连接上。
 *
 * 这一跳与 `dialJump` 的差别，逐条都有理由：
 *   1. **先过闸门**：关着就直接抛 `PROXY_COMMAND_DISABLED`（不 spawn、不退回直连）；
 *   2. **没有「握手」可等**：传输就是子进程的 stdio，ssh2 会在它上面跑握手——所以这里
 *      spawn 成功即返回，剩下的失败由目标连接的 error/close 路径 + `failure()` 共同呈现；
 *   3. **子进程死了要拖垮传输**：提前退出时 destroy 掉 sock，逼 ssh2 立刻报错（否则
 *      「命令一开始就失败」会伪装成 20s 握手超时）；
 *   4. **stderr 必须排空**：不排空的话命令输出一多就把管道写满、子进程卡死（经典坑），
 *      同时留一小段尾巴进错误文案——它是排查代理命令失败最直接的信息；
 *   5. **命令原文不进日志与错误文案**：它可能含凭据（如 `-i /path/key`），日志只写
 *      「已启动代理命令」与退出码。
 */
export declare function dialProxyCommand(options: {
    spec: SshSpec;
    logger?: SshLogger;
}): Promise<ProxyCommandDial>;
/**
 * 清洗一份跳板机输入（settings schema / 宽松清洗 / 内联融合共用）。
 *
 * 返回 `undefined` = **没有可用的跳板机**（`host` 为空）——调用方据此把 `jump` 整个丢掉，
 * 而不是留下一个 `host: ''` 的半个对象（那会让 `dialJump` 去连空主机名）。
 * 缺省不填的字段**不写进结果**：它们要在拨号时「继承目标那一跳」（见 `jumpSpecOf`）。
 */
export declare function sanitizeJumpSpec(input: unknown): SshJumpSpec | undefined;
/** 严格校验一份跳板机输入（HTTP POST 路径）；返回错误信息或清洗结果。 */
export declare function validateJumpSpec(input: unknown): {
    jump?: SshJumpSpec;
    error?: string;
};
/** 目标连接的传输来源（两者互斥：`jump` 优先，见 `attachSshTransport`）。 */
export interface SshTransport {
    /** 需要跳板机时非 null；**调用方必须在收尾时 `end()` 它**（目标只是借用它的通道）。 */
    bastion: Client | null;
    /** 需要代理命令时非 null；**调用方必须在收尾时 `dispose()` 它**（目标只是借用它的 stdio）。 */
    proxy: ProxyCommandDial | null;
}
/** 建连前准备的结果：目标 config（可能挂了跳板机通道 / 代理命令传输）+ 目标那一跳的 TOFU 策略。 */
export interface PreparedSshConnect {
    connectConfig: ConnectConfig;
    policy: {
        mismatchMessage(): string | null;
    };
    /** 需要跳板机时非 null；**调用方必须在收尾时 `end()` 它**（目标只是借用它的通道）。 */
    bastion: Client | null;
    /** 需要代理命令时非 null；**调用方必须在收尾时 `dispose()` 它**（目标只是借用它的 stdio）。 */
    proxy: ProxyCommandDial | null;
    /** 展示串：带「经跳板机 X」后缀，错误文案直接用。 */
    target: string;
}
/**
 * 代理命令失败的事实 → 错误文案后缀（空串 = 没失败）。
 *
 * 为什么要它：代理命令死了之后 ssh2 只会报一句「握手前连接中断」，那会把用户支到目标主机上
 * 去查。调用方在错误分支拼上这句，用户才知道是该去看代理命令的 stderr。
 */
export declare function proxyFailureSuffix(proxy: ProxyCommandDial | null): string;
/**
 * 四个连接点（终端 / SFTP / 隧道 / 探针）**共用**的建连前准备。
 *
 * 为什么要有这个函数：跳板机不是「终端的特性」——SFTP、端口转发、探针各自都在建 SSH 连接
 * （`sftp.ts` / `tunnels.ts` / `probe.ts` 各有一处 `new Client()`）。把「构造 config →
 * 需要时拨跳板机 / 起代理命令 → 接上传输 → 装目标 TOFU 策略」收成一处，四条路才不会各写一份
 * （那正是这一项立项时点名的「三处各写一份必然漂」）。
 *
 * **调用方负责**：自己 `conn.connect(connectConfig)`、自己处理 ready/error/close，
 * 并在收尾（成功或失败）时对 `bastion` 调 `end()`、对 `proxy` 调 `dispose()`。
 */
export declare function prepareSshConnect(options: {
    spec: SshSpec;
    store?: HostKeyStore;
    logger?: SshLogger;
    /** 覆盖两跳的握手超时（探针路径要短） */
    readyTimeoutMs?: number;
}): Promise<PreparedSshConnect>;
/**
 * 只做「构造目标 config（需要时拨跳板机 / 起代理命令并把传输接上）」这一半。
 *
 * 拆出来的唯一理由：**探针自己装 hostVerifier**（`makeHostKeyVerifier` 要收集
 * hostkey 结论，不用 `applyHostKeyPolicy`），但它同样需要跳板机 / 代理命令。返回值里的
 * `transport` 由调用方负责收尾。
 */
export declare function attachSshTransport(options: {
    spec: SshSpec;
    store?: HostKeyStore;
    logger?: SshLogger;
    readyTimeoutMs?: number;
}): Promise<{
    connectConfig: ConnectConfig;
    transport: SshTransport;
}>;
/**
 * 建立 SSH 连接并打开交互 shell channel，返回 TermHandle。
 * 失败（连接超时/认证被拒/host 不可达）时 reject 带人类可读信息。
 */
export declare function spawnSsh(spec: SshSpec, options: SshSpawnOptions): Promise<TermHandle>;
