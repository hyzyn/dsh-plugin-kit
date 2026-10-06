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
