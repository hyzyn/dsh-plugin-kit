/**
 * 配置面：把宿主交下来的一份普通对象**解析成纯数据**（`docs/devdata-plan.md` §5 的数据模型）。
 *
 * ## 为什么解析不交给 schemastery 就完了
 *
 * `Config`（schemastery schema）负责「形状对不对」；本模块负责**「语义上算不算数」**，而后者
 * 恰好是本套件的安全前提：
 *
 * - **认不出的引擎** → 整个目标丢掉（不是「当成某个默认引擎」）——未登记的一律拒；
 * - **认不出的环境标签** → 回落 `unknown`（= 不可写），并**报一条 problem**：静默回落会让用户
 *   以为自己标的是 `test-shared`（可写）；
 * - **空的 `scopeDirs` 保持为空**（= 处处拒绝），**不替用户填默认目录**——那等于替他授权；
 * - **能力规格的 `env` 为空串** → 当作**没接入闸门**（而不是「接了但永远授不了权」）；
 * - 越界的上限**夹回**而不是「按无上限处理」（`sync` 与 `ceilings` 同一个方向：坏了要更严）。
 *
 * 这些判断全部是纯函数：不读文件、不连网络、不看 `process.env`。`problems` 原样交给宿主半体去打
 * 日志与公告——**配置问题不该只在启动日志里一闪而过**，agent 撞墙时 `doctor` 也要能看到。
 */
import type { DevDataTarget } from './adjudicate.js';
import { type DevEnv } from './env.js';
import type { PlanThresholds } from './plan-guard.js';
/** SCAN 族 `COUNT` 的策略上限（候选只能请求更小）。 */
export declare const MAX_SCAN_COUNT = 1000;
/** 不给时的策略默认值。 */
export declare const DEFAULT_SCAN_COUNT = 200;
/** 单次连接 + 命令的默认超时（毫秒）。 */
export declare const DEFAULT_TIMEOUT_MS = 5000;
/** 超时可配范围。 */
export declare const MIN_TIMEOUT_MS = 100;
export declare const MAX_TIMEOUT_MS = 60000;
/** 通路 A 直连用的连接信息（**内核不认识连接**，所以它挂在这一层，见 `redis-executor.ts`）。 */
export interface LiveConnection {
    host: string;
    port: number;
    /** `SELECT` 到哪个库。 */
    db?: number;
}
/** 一个解析后的目标。 */
export interface LiveTarget extends DevDataTarget {
    env: DevEnv;
    scopeDirs: string[];
    /** 有连接信息才有（缺了执行器会给出「没有配连接」的可执行错误）。 */
    connection?: LiveConnection;
    /**
     * 这个目标**允许浏览**的库号（面板上那棵树上能点着切的那些）。
     *
     * 缺省（没写）时允许集只有 `connection.db`（没写就是 0）——也就是「这台机器上只有声明的那一个库
     * 能看」，与加这个字段之前的行为**逐字一致**。写了 `dbs` 之后，允许集是它 ∪ `db`——**仍然全部来自
     * 配置**：面板只是在这个集合里挑，浏览器永远不会自己拼一条 `SELECT`（见 `keyspace.ts`
     * 的 `canBrowseDb`，INFO keyspace 当场报的库也算允许——那也是宿主侧的事实）。
     */
    dbs?: number[];
    /** `SCAN` 族 `COUNT` 的策略上限。 */
    maxScanCount: number;
}
/** 解析后的整份配置。 */ export interface LiveConfig {
    enabled: boolean;
    announceToAgent: boolean;
    /** 审计落点（**空 = 只有宿主日志，没有持久记录**；写类操作因此被拒，见 `plugin.ts`）。 */
    auditFile: string;
    plan: PlanThresholds;
    timeoutMs: number;
    targets: LiveTarget[];
    /** 被丢掉 / 被纠正的配置项，原样保留给宿主打日志与 `doctor`。**空数组 = 没有问题**。 */
    problems: string[];
}
/**
 * 这个目标**声明允许浏览**的库号集合（升序、去重）。
 *
 * 它是面板与路由那两处「能不能去这个库」的唯一判据来源：`db`（缺省 0）**永远**在里面——
 * 所以「没写 `dbs`」与「写了 `dbs: [0]`」在行为上完全一样，加这个字段不会让已配好的目标换行为。
 */
export declare function declaredDbs(target: LiveTarget): number[];
/**
 * 把一份普通对象解析成生效配置。
 *
 * 入参刻意收 `Record<string, unknown>` 而不是 `Config`：**setting 存储交下来的投影未必经过 schema
 * 默认值**（`devfront` 记过同类教训），所以这一层必须自己对每种坏输入有确定行为。
 */
export declare function normalizeConfig(raw: Record<string, unknown>): LiveConfig;
/** 按 id 找目标（找不到时报出可用名单——agent 的失败模式是原地重试，得给它出路）。 */
export declare function pickTarget(targets: readonly LiveTarget[], id: unknown): LiveTarget | undefined;
/** 可用目标名单（拒绝文案里用）。 */
export declare function targetIds(targets: readonly LiveTarget[]): string;
