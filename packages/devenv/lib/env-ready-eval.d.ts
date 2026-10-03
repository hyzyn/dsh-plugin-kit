/**
 * 就绪判据的**求值**（`docs/devdata-plan.md` §13.2）。
 *
 * > **归属（2026-10-02）**：本文件从 `packages/devdata/src/env-ready-eval.ts` **原样迁来**
 * > （plan §16.1 的第 2 步，与建包同一步）。判据见 `env-ready.ts` 的归属说明；内容未改。
 *
 * ## 判定的顺序就是这份判据本身
 *
 * 对每个服务，按固定顺序收集证据；每一步都可能把结论钉死在 `refuted`：
 *
 * 1. **容器在跑**吗？不在（`exited` / `dead` / `restarting`）→ `refuted`。
 *    `restarting` 也算 `refuted`：它正在重启，等下去只会看到又一次重启。
 * 2. **健康检查**是 `unhealthy` 吗？是 → `refuted`。
 * 3. **`StartedAt`** 能解析吗？不能 → `unready`（缺证，不是「已否证」）。
 * 4. **启动完成行**出现了吗？没出现 → `unready`。
 * 5. 出现了，但它**早于本次 `StartedAt`** 吗？是 → `unready`。
 *    **这是最关键的一步**：容器重启后日志缓冲区里还留着上一个进程的启动完成行，
 *    只看「有没有这一行」会在重启那一瞬间判成就绪——而那正是最不该放行的一刻。
 * 6. 全过 → `ready`。
 *
 * ## 为什么 `refuted` 必须与 `unready` 分开
 *
 * 冷启动可配到 150 秒。容器已经崩了却让调用方等满超时，它拿到的结论是「超时」——
 * 而 agent 对「超时」的反应通常是**再等一次**。分开之后，`refuted` 能立刻停止等待并说清原因。
 */
import { type ReadyCheck, type ReadyProfile, type ServiceRequirement } from './env-ready.js';
/** 容器的运行状态（`docker inspect` 的 `State.Status` 取值里我们关心的那几个）。 */
export type ContainerStatus = 'running' | 'exited' | 'created' | 'paused' | 'restarting' | 'dead' | 'removing';
/** 健康检查状态（与 `docker inspect` 的 `State.Health.Status` 对齐）。 */
export type HealthStatus = 'starting' | 'healthy' | 'unhealthy';
/**
 * 一个服务的**观测**：从 docker 通道取到的原始事实。
 *
 * 刻意只放事实，不放任何结论——「就绪了没有」是 `evaluateService` 的事，两者分开才能单测。
 */
export interface ServiceObservation {
    name: string;
    /** 没观测到这个容器（不存在 / 不在清单里 / 通道没取到）。 */
    found: boolean;
    status?: ContainerStatus;
    /** `docker inspect` 的 `State.StartedAt`（RFC3339，带时区）。 */
    startedAt?: string;
    /** 容器的退出码（`exited` 时有意义；**143 = SIGTERM**，`jenkins-release` 技能里的常见噪声）。 */
    exitCode?: number;
    /** 重启次数（**> 0 说明这个容器不稳定**，即便现在 running 也要在报告里体现）。 */
    restartCount?: number;
    health?: HealthStatus;
    /** 近期日志（按时间正序；实现方负责只取尾部若干行）。 */
    logLines?: readonly string[];
    /**
     * 取这些日志的时刻（RFC3339，带时区）。
     *
     * 用途是**新鲜度**：日志是某个时刻的快照，报告里要说清「这是哪一刻看到的」，
     * 否则一份过期快照会让人以为现在还这样。
     */
    observedAt?: string;
    /**
     * HTTP 探针的结果（清单里声明 `httpProbe` 时必需）。
     *
     * **由执行层探完带回来**，判定层不发请求——这样判定层保持纯函数，而「探什么」仍由清单唯一决定。
     */
    probe?: {
        ok: boolean;
        /** HTTP 状态码（没连上时为 `undefined`）。 */
        status?: number;
        /** 失败原因（给报告用）。 */
        detail?: string;
    };
}
/** 一个服务的判定。 */
export type ServiceVerdict = 'ready' | 'unready' | 'refuted';
/** 一个服务的判定结果。 */
export interface ServiceResult {
    name: string;
    verdict: ServiceVerdict;
    /** 一句话结论。 */
    message: string;
    /** 判据满足到了哪一步（报告里的进度）。 */
    met: string[];
    /** 还缺什么证据（`unready` 时非空）。 */
    missing: string[];
    /** 明确的否证（`refuted` 时非空）。 */
    refuted?: string;
    /** 判据类型（没给 `ready` 时为 `container`）。 */
    dimension: ReadyCheck['kind'] | 'container';
    /** 已等 / 已耗时（调用方给，这里只做呈现）。 */
    elapsedMs?: number;
    /** 已知噪声说明（从清单里带过来）。 */
    note?: string;
}
/** 一份清单的整体判定。 */
export interface ReadyEvaluation {
    services: ServiceResult[];
    /**
     * 整体是否就绪：**每个服务都 `ready`**。
     *
     * 注意 `refuted` 与 `unready` 都让整体不就绪，但它们的**处置不同**——
     * 调用方应当用 `anyRefuted` 决定「还要不要等」。
     */
    ready: boolean;
    /** 至少一个服务被明确否证：**别等了**。 */
    anyRefuted: boolean;
    /** 人类可读的一句话（给 agent 看）。 */
    summary: string;
}
/**
 * 把 RFC3339 时间串解析成毫秒。
 *
 * **必须是带时区的完整时刻**：`2026-10-01T12:00:00` 这种没有时区的时间串是**歧义**的，
 * 而就绪判据恰恰在做时间先后比较——按本地时区猜会让判定随机器而变。所以拒掉它。
 *
 * 小数秒**截到毫秒**再交给 `Date.parse`：docker 给的是纳秒（9 位），而 `Date.parse` 对超过
 * 3 位小数的处理**各引擎不一致**（有的按毫秒解析、有的丢弃），实测会把 `.123456789` 读成
 * 123 毫秒的偏差。这类偏差在「日志行早于还是晚于 StartedAt」的比较里正好是致命的。
 */
export declare function parseInstant(value: string | undefined): number | undefined;
/** 判定一个服务。 */
export declare function evaluateService(requirement: ServiceRequirement, observation: ServiceObservation | undefined): ServiceResult;
/**
 * 从日志行取时刻。
 *
 * 支持两种常见形态：
 *   - `docker logs --timestamps` 的前缀：`2026-10-01T12:00:05.123456789Z 正文`；
 *   - 行内出现的、带时区的时刻：`… 2026-10-01 12:00:05.123 INFO … +08:00`。
 *
 * 取不到返回 `undefined`——**不猜**。猜错的方向是「把上一次启动的行当成这一次的」。
 */
export declare function lineInstant(line: string): number | undefined;
/** 评估一整份清单。 */
export declare function evaluateProfile(input: {
    profile: ReadyProfile;
    observations: readonly ServiceObservation[];
    /** 每个服务已等多久（调用方计时；缺省不显示）。 */
    elapsedMs?: Readonly<Record<string, number>>;
}): ReadyEvaluation;
