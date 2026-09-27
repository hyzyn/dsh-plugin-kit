import type { CapabilityGrantSource, CapabilityGrantVia, GrantStore } from './grant-store.js';
/** 就地提权需要的日志形状（插件的 logger 子集）。 */
export interface ElevationLogger {
    info(message: string): void;
    warn(message: string): void;
}
/** `createElevationManager` 的选项。 */
export interface ElevationOptions {
    /** 等待确认文件的目录（调用方给 `capabilityPaths(dshHome()).confirmDir`）。 */
    confirmDir: string;
    /** 授权存储（`grant-store.ts`）。 */
    store: GrantStore;
    logger: ElevationLogger;
    /**
     * 授权状态变化时的回调（**宿主据此重算能力开关**）。
     *
     * 必需而不是可选：忘了接它，症状是「授权成功但工具没注册 / 撤销成功但工具还在」——两种都极难
     * 从界面看出原因。所以把它做成必填参数，逼调用方想一下。
     */
    onGrantChange: (env: string, granted: boolean) => void;
    /** 审计行前缀（如 `[dsh-docker]`）。 */
    logPrefix?: string;
    /** 平台（测试注入；缺省 `process.platform`）。 */
    platform?: NodeJS.Platform;
    /** 现在（测试注入；缺省 `Date.now`）。 */
    now?: () => number;
    /** 确认文件的有效期（缺省 5 分钟）。 */
    ttlMs?: number;
    /** 探测确认文件的间隔（缺省 1s；测试调小以免等待）。 */
    probeIntervalMs?: number;
    /** 每能力每小时最多新建几个挑战（缺省 3）。 */
    maxBeginsPerHour?: number;
}
/** `begin` 的结果。 */
export type ElevationBegin = {
    status: 'granted';
    via: CapabilityGrantVia;
} | {
    status: 'pending';
    command: string;
    expiresAt: number;
    reused: boolean;
} | {
    status: 'rate-limited';
    retryAfterMs: number;
} | {
    status: 'error';
    error: string;
};
/** `status` 的结果（**不回 nonce**：它只该从 `begin` 得到一次）。 */
export type ElevationStatus = {
    status: 'none';
} | {
    status: 'pending';
    expiresAt: number;
} | {
    status: 'granted';
    via: CapabilityGrantVia;
};
/** 就地提权管理器。 */
export interface ElevationManager {
    /** 发起/复用一次提权挑战（幂等；已授权时直接返回 granted）。 */
    begin(env: string): ElevationBegin;
    /** 查询状态（不产生副作用；探测由后台定时器负责）。 */
    status(env: string): ElevationStatus;
    /** 撤销授权（零确认）；返回是否真的撤销了。 */
    revoke(env: string): boolean;
    /** 清掉所有定时器（插件卸载时调用）。 */
    dispose(): void;
}
/** 建一个就地提权管理器（每个插件进程一个）。 */
export declare function createElevationManager(options: ElevationOptions): ElevationManager;
/**
 * 启动期审计：把**已经在盘上**的带外授权打出来（每个能力开关绑定之后立刻调一次）。
 *
 * 为什么必须有：带外授权是**持久**的——重启后直接生效、**不再有任何一次确认**。于是「三周前授权
 * 的能力，今天一开机就静默开着」在日志里与界面上都看不见（宿主原来的四条审计只覆盖
 * begin / grant / expire / revoke，**load 不在内**）。这一行就是为了让那次「静默继承」留下痕迹。
 *
 * 只报 `store` 里的记录（`file` 通道）：环境变量通道的授权由启动环境本身表达，界面另有说明。
 * 与其它审计行同样**不含 nonce 与路径**（日志会落盘）。
 *
 * @param store - 授权存储（或任何实现 `source?()` 的最小对象）。
 * @param capabilities - 本插件关心的能力环境变量名（没授权的不会输出）。
 * @param logger - 插件的 logger 子集。
 * @param logPrefix - 审计行前缀（如 `[dsh-docker]`）。
 */
export declare function auditLoadedGrants(store: CapabilityGrantSource, capabilities: readonly string[], logger: ElevationLogger, logPrefix?: string): void;
