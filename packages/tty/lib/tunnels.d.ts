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
    constructor(logger: TunnelLogger, store: HostKeyStore, 
    /** 按名字解析连接簿条目（实时读取，重连自动用最新凭证） */
    resolveBook: (bookName: string) => SshHostEntry | undefined);
    /** 按配置对齐运行态：新增/删除/规格变更重建，启停切换资源。幂等。 */
    reconcile(specs: TunnelSpec[]): void;
    list(): TunnelStatus[];
    disposeAll(): void;
    /** ------------------------------------------------------------------ */
    private startTunnel;
    private stopTunnel;
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
