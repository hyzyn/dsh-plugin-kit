import type { HostKeyStore, SshHostEntry } from './ssh.js';
/** 隧道规格（settings 存储；bookName 引用连接簿条目提供主机与认证）。 */
export interface TunnelSpec {
    name: string;
    bookName: string;
    /** local = -L（本地监听 → 服务端侧拨号）；remote = -R（服务端监听 → 本地拨号） */
    direction: 'local' | 'remote';
    /** local：本地监听端口 */
    localPort?: number;
    /** local：服务端侧拨号目标主机；remote：服务端监听地址（缺省 127.0.0.1） */
    remoteHost?: string;
    /** local：服务端侧目标端口；remote：服务端监听端口 */
    remotePort?: number;
    /** remote：本地拨号目标主机（缺省 127.0.0.1） */
    localTargetHost?: string;
    /** remote：本地拨号目标端口 */
    localTargetPort?: number;
    enabled: boolean;
}
export type TunnelState = 'connecting' | 'active' | 'error' | 'stopped';
/**
 * 一条 local 隧道的本地端口占用问题（tty D60 的前半：保存时就地探测，不等 listen 那一跳）。
 *
 * `kind` 是**机器可读**的判据（调用方按它决定文案，不做字符串匹配）：
 *   - `duplicate`：**这一次提交的配置里**有另一条 local 隧道用同一个 `localPort`；
 *     它必然失败（先立起来的那条占住端口，后一条 EADDRINUSE），但在配置层就能判死，
 *     连试探都不必——而且这条**不区分 enabled**：停用的那条随时会被启用，两条都留着
 *     就是一颗定时炸弹；
 *   - `in-use`：端口被**本进程之外**的东西占着（另一个 profile 的宿主、别的程序）。
 *     这一条**不拒绝保存**（见下 `probeTunnelPorts` 的取舍）。
 */
export interface TunnelPortIssue {
    kind: 'duplicate' | 'in-use';
    /** 涉及的两条隧道名（duplicate 用得上；in-use 只有一个） */
    names: string[];
    port: number;
    message: string;
}
/** 本地端口占用的中文文案（`duplicate` / `in-use` 各一条，措辞与 tunnels.ts 的 EADDRINUSE 说明同源）。 */
export declare function tunnelPortIssueMessage(kind: TunnelPortIssue['kind'], names: string[], port: number): string;
/**
 * **纯函数**：在待保存的隧道列表里找「同一个 localPort 被两条 local 隧道用」。
 *
 * 只判 local 方向——remote 方向的 `remotePort` 在**服务端**监听，不在本机资源里，
 * 本机探测对它没有意义（而且它由 forwardIn 的结果定论，能自愈）。
 * 返回按端口升序、每端口一条（文本渲染与测试都按这个顺序断言）。
 */
export declare function findDuplicateLocalPorts(specs: readonly TunnelSpec[]): TunnelPortIssue[];
/**
 * 探测「这个本地端口现在能不能绑」。
 *
 * 语义是**独占探测**（`listen` 成功即立刻 `close`），不是「连一下看看」——后者对
 * 「端口空着但 DHCP/防火墙挡着」这类情形给不出结论，而我们要答的正是「bind 会不会
 * 失败」。探测窗口是微秒级，探完立即释放，不会与随后 reconcile 的真监听打架
 * （本机实测：同一 tick 内 `close()` 之后立刻 `listen` 同一端口可以成功）。
 *
 * `host` 固定 `127.0.0.1`——本地转发只绑回环（见 `startTunnel`），去探 `0.0.0.0`
 * 会把「别人绑在外部接口上」误报成冲突。
 */
export declare function probeLocalPort(port: number, timeoutMs?: number): Promise<boolean>;
/**
 * 保存隧道配置时的**保存前探测**（tty D60 前半）。
 *
 * ## 为什么只警告、不拒绝保存
 *
 * `duplicate` 能判死，但**不能**用它拒绝整个 POST：设置卡片的保存是**整表提交**
 * （`toPayload` 把所有字段一起发上来），一旦配置里已经躺着一条重名端口的隧道
 * （老配置 / 另一个窗口写的），硬拒就等于把用户锁死在「任何一项都存不下去」上——
 * 而修它恰恰需要先能保存。所以这里把它降成**响应里的 warnings**，由客户端点名通报。
 *
 * `in-use` 更进一步：端口可能属于**用户故意**在跑的东西，探测本身也有极小的误报面
 * （IPv6-only 的占用、探测期间的竞态），拿它拦保存是越权。它的价值在「不等那条
 * 红色 error 出现就先说一声」。
 *
 * 每条隧道最多一条 in-use 警告；duplicate 优先（它更确定、且不必探端口）。
 */
export declare function probeTunnelPorts(specs: readonly TunnelSpec[], probe?: (port: number) => Promise<boolean>, heldByUs?: ReadonlySet<number>): Promise<string[]>;
export interface TunnelStatus {
    name: string;
    bookName: string;
    direction: 'local' | 'remote';
    enabled: boolean;
    state: TunnelState;
    error: string | null;
    /** 人工介入级故障（本地监听失败 / 连接簿缺失）：不会自动重试，改配置后重建（D58）。 */
    fatal: boolean;
    /** 规则的人类可读形式：`本机:5432 → db:5432` / `远程:8080 → 本机:3000` */
    rule: string;
    /** 当前活跃连接数 */
    connections: number;
    totalConnections: number;
    /** 最近一次 forwardOut/转发失败原因（隧道本身 active 但目标拨号失败时可见） */
    lastForwardError: string | null;
}
export interface TunnelLogger {
    info(msg: string): void;
    warn(msg: string): void;
}
export declare class TunnelManager {
    private readonly logger;
    private readonly store;
    /** 按名字解析连接簿条目（实时读取，重连自动用最新凭证） */
    private readonly resolveBook;
    private readonly tunnels;
    /**
     * 配置回写回调（settings 就绪后由插件注入一次）。
     *
     * `setEnabled` 走「翻转 spec.enabled → 写回配置」这条路，所以必须能落盘；回调缺失
     * （settings 服务不可用的极早期 / 单测）时只改内存里的 spec 与运行态——行为退化成
     * 「本次进程内生效、重启丢失」，而不是静默什么都不做（返回的 status 一样会反映结果）。
     */
    private persist;
    constructor(logger: TunnelLogger, store: HostKeyStore, 
    /** 按名字解析连接簿条目（实时读取，重连自动用最新凭证） */
    resolveBook: (bookName: string) => SshHostEntry | undefined);
    /** 按配置对齐运行态：新增/删除/规格变更重建，启停切换资源。幂等。 */
    reconcile(specs: TunnelSpec[]): void;
    list(): TunnelStatus[];
    /** 一条隧道的当前状态（不存在返回 undefined）。 */
    status(name: string): TunnelStatus | undefined;
    /**
     * **本进程此刻真的持有**的本地监听端口集合（`probeTunnelPorts` 的豁免依据）。
     *
     * 为什么不是「配置里所有 localPort」：那条判据会把「A 已停用、B 想用同一个端口」
     * （完全合法）误报成冲突。只有 `server.listening === true` 才算**真的绑上了**——
     * `rt.server !== null` 不够：`startTunnel` 先建 server 再 `listen`，监听失败
     * （EADDRINUSE）时句柄仍在表里，按它判会把「其实没占住」说成「我占着」，
     * 于是端口被**别人**占着的那条真冲突反被豁免掉。
     */
    localPortsInUse(): Set<number>;
    /**
     * 启停一条隧道（agent 的 `tunnel_start` / `tunnel_stop`）——**改配置，不只改运行态**。
     *
     * 为什么不是「只改运行时开关」：`src/tunnels.ts` 的一等设计是「settings 即真相源，
     * `reconcile()` 按配置对齐运行态」（见文件头）。再加一层运行态覆盖，就同时存在两个
     * 真相源，而 `reconcile` 会在下一次 settings 热应用（哪怕只是改了个 Shell 路径）时
     * **静默把 agent 刚停掉的隧道重新拉起**——这种「停了又自己回来」正是最难查的一类。
     * 所以这里翻转的就是 `spec.enabled`，与用户在卡片上点那个勾**走同一条路**：
     * 写入 caller 给的持久化回调 → settings 热应用 → reconcile。结果一致、可预期。
     *
     * 返回值是写完配置后的状态快照。**注意 `state` 是异步收敛的**：回来时通常是
     * `connecting`（拨号还没完成），要拿最终结论就稍后 `tunnel_list`。
     */
    setEnabled(name: string, enabled: boolean): {
        ok: true;
        status: TunnelStatus;
    } | {
        ok: false;
        error: string;
    };
    /** 翻转一条隧道的 enabled 并就地收敛运行态（`setEnabled` 的落点）。 */
    private applyEnabled;
    /** 持久化回调注入（settings 就绪后一次；`setEnabled` 靠它把意图写回配置）。 */
    setPersist(persist: (specs: TunnelSpec[]) => void): void;
    disposeAll(): void;
    /** ------------------------------------------------------------------ */
    private startTunnel;
    private stopTunnel;
    /**
     * 建连（**async**：认证配置要走凭据 provider 解析 `env:NAME` 引用）。错误仍在本方法内
     * 收敛成 scheduleRetry / failTunnel，调用方不必关心返回的 Promise。
     */
    private connectTunnel;
    /** remote 方向：让服务端监听端口（重连后必须重新调用，断线即失效）。 */
    private bindRemoteListen;
    private onRemoteConnection;
    private onLocalConnection;
    /** 失败且不再自动重试（需要人工介入：如远程端口被占、本地监听端口非法/无权限）。 */
    private failTunnel;
    /** 失败后按指数退避重连（1s→15s 封顶）；重连期间保持 error 态供 UI 展示原因。 */
    private scheduleRetry;
}
