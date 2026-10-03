/**
 * 配置面：把宿主交下来的一份普通对象**解析成纯数据**（`docs/devdata-plan.md` §13）。
 *
 * ## 为什么解析不交给 schemastery 就完了
 *
 * `Config`（schemastery schema）负责「形状对不对」；本模块负责**「语义上算不算数」**——
 * 与 `devdata` 的 `plugin-config.ts` 同一套分工，理由也一样：形状对了但语义不成立时，
 * 症状是运行期一句看不懂的话，而这里能给出**指到字段**的问题清单。
 *
 * - **认不出的 `kind`** → 整个目标丢掉（不是「当成 ssh」）；
 * - **`ssh` 却没给 `book`** → 丢掉并报问题（它连不上，留着只会在下游报一个指不到配置的错）；
 * - **空的 `scopeDirs` 保持为空**（= 处处拒绝），**不替用户填默认目录**——那等于替他授权；
 * - **越界的数值夹回**而不是「按无上限处理」（时间上限坏了要更严，不是更松）；
 * - **`hostKeys` 只收得下的形状**（清洗在 `kit` 的 `sanitizeHostKeys`，与连接簿读取同源）。
 *
 * 全部是纯函数：不读文件、不连网络、不看 `process.env`。
 */
import type { CapabilitySpec } from '@hyzyn/dsh-kit';
import type { HostKeyRecord } from '@hyzyn/dsh-kit/ssh-exec';
/** 目标的两种来源。 */
export type TargetKind = 'local' | 'ssh';
/** 单次 docker 命令的默认超时（毫秒）。 */
export declare const DEFAULT_EXEC_TIMEOUT_MS = 10000;
/** 超时可配范围（探针与等待之外，这是「跑一条 docker 命令」的上限）。 */
export declare const MIN_EXEC_TIMEOUT_MS = 500;
export declare const MAX_EXEC_TIMEOUT_MS = 120000;
/** 缺省等待总超时（毫秒）——与 §13.2 的冷启动 150 秒对齐，留一点余量。 */
export declare const DEFAULT_WAIT_TIMEOUT_MS = 180000;
/** 等待超时可配范围。 */
export declare const MIN_WAIT_TIMEOUT_MS = 1000;
export declare const MAX_WAIT_TIMEOUT_MS = 900000;
/** 缺省轮询间隔（毫秒）。 */
export declare const DEFAULT_POLL_INTERVAL_MS = 3000;
/** 轮询间隔可配范围（下限刻意不低：每轮是一串 SSH 往返）。 */
export declare const MIN_POLL_INTERVAL_MS = 500;
export declare const MAX_POLL_INTERVAL_MS = 60000;
/** 日志尾部行数上限（判定只需要「启动完成行」，不该把整个日志拉回来）。 */
export declare const MAX_LOG_TAIL = 5000;
/** `docker stop --time` 的缺省与范围（给容器收尾的时间，不是「多久后强杀」）。 */
export declare const DEFAULT_STOP_TIMEOUT_SEC = 10;
export declare const MIN_STOP_TIMEOUT_SEC = 1;
export declare const MAX_STOP_TIMEOUT_SEC = 120;
/** 一个解析后的目标。 */
export interface LiveTarget {
    id: string;
    label: string;
    kind: TargetKind;
    /** `ssh` 目标引用的 tty 连接簿条目名；`local` 时为空串。 */
    book: string;
    /**
     * 作用域：这个目标只能**从这些目录**访问，缺省拒绝（与数据面同一条判据，实现在 kit 的 `scope.ts`）。
     *
     * 空数组不是「不限制」，是**处处拒绝**——它同时解决「并行 agent 的隔离」与「误连共享联调环境」
     * 两件事，理由与代价见 `packages/kit/src/scope.ts` 的文件头注。
     */
    scopeDirs: string[];
    /**
     * **写入口的能力闸门**（`env_up` / `env_down`）。没配 = 这台目标上不存在写入口（工具都不注册）。
     *
     * 配了也不等于能用：真正的授权是**宿主启动时的环境变量**（`kit` 的 `capabilityGranted`）。
     * 两道分开是刻意的——配置能热改，而「谁能改共享环境」这件事不该靠改一个 yaml 就成立。
     */
    writeCapability?: CapabilitySpec;
}
/** 解析后的整份配置。 */
export interface LiveConfig {
    enabled: boolean;
    announceToAgent: boolean;
    targets: LiveTarget[];
    /** 单条 docker 命令的超时。 */
    execTimeoutMs: number;
    /** 日志尾部行数。 */
    logTail: number;
    /** HTTP 探针超时。 */
    probeTimeoutMs: number;
    /** `env_wait` 的缺省总超时。 */
    waitTimeoutMs: number;
    /** 轮询间隔。 */
    pollIntervalMs: number;
    /** `docker stop --time` 的秒数（给容器体面收尾的时间；SIGKILL 不是默认）。 */
    stopTimeoutSec: number;
    /** 持久审计出口（JSON 行）；空串 = 只进宿主日志（写类会被 `AUDIT_NOT_DURABLE` 挡住）。 */
    auditFile: string;
    /** TOFU 指纹记录（消费者自持一份，种子来自 tty 的连接簿）。 */
    hostKeys: HostKeyRecord[];
    /** 配置问题（指到字段，原样交给宿主半体打日志与公告）。 */
    problems: string[];
}
/**
 * 解析整份配置。
 *
 * @param raw - 经 schema 解析后的纯数据（settings 层交回来的就是它）。
 */
export declare function normalizeConfig(raw: Record<string, unknown>): LiveConfig;
/**
 * 至少有一个目标配了写能力闸门吗。
 *
 * 注册面用它：**没有任何目标可写时不注册写工具**（未注册的 agent 不会去试一个注定被拒的工具，
 * 这与「只读工具面」那条纪律同源）。
 */
export declare function hasWritableTarget(targets: readonly LiveTarget[]): boolean;
/** 目标名单（错误文案里用：agent 的失败模式是原地重试，得给它一条出路）。 */
export declare function targetIds(targets: readonly LiveTarget[]): string;
/** 按 id 取目标。 */
export declare function pickTarget(targets: readonly LiveTarget[], id: string): LiveTarget | undefined;
