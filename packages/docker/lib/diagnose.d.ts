/**
 * @hyzyn/dsh-docker — 容器「为什么不行」的判据（纯函数，零 IO）。
 *
 * 为什么单独一个文件：契约要求这里是**纯逻辑**——时钟、docker 命令、输出解析都由
 * 调用方（`DockerApi.diagnose()`）采好再传进来。所以本文件不 import 任何 IO、
 * 不读 `Date.now()`、不读 `process.env`：这些判据因此可以逐条「正例 + 反例」单测
 * （见 `test/diagnose.test.ts`），而不是「跑一次真容器看看输出像不像」。
 *
 * **三种「没有」必须可区分**（本仓一贯的信号位原则，同 `truncated` / `limited` /
 * `degraded` 那一套）：
 *   - `null` —— **本次没采到**（采集失败）。evidence 对应字段给 `null`，且 findings 里
 *     多一条 `*-unavailable`（info）说明原因；**绝不给 0**，否则「连不上」会被读成
 *     「日志是空的 + 没有事件」，排障方向当场被带偏；
 *   - `''` / `[]` / `0` —— 采到了，但确实是空的（容器没有日志 / 这个窗口没有事件）；
 *   - 可选字段缺席 —— 调用方没提供这项信息（内部胶水用，不对外承诺）。
 *
 * 文案是**给用户看的**：说「怎么了 + 怎么办」，不出现 `HostConfig` / `NanoCpus` /
 * `docker inspect` 字段名这类实现术语（判据 8 说「内存上限 512MiB」而不是
 * 「HostConfig.Memory=536870912」）。
 */
import type { ContainerDetail, ContainerEvent, ContainerStats } from './docker.js';
/** 结论 / 单条判据的严重度。`ok` 只出现在 verdict 上（findings 只列「有问题」的）。 */
export type DiagnosisSeverity = 'critical' | 'warning' | 'info' | 'ok';
/** 单条判据的严重度（`ok` 不是问题，不进 findings）。 */
export type FindingSeverity = 'critical' | 'warning' | 'info';
export interface DiagnosisFinding {
    code: string;
    severity: FindingSeverity;
    title: string;
    detail: string;
}
export interface DiagnosisVerdict {
    severity: DiagnosisSeverity;
    /** 取最高 severity 的那条 finding 的 code；无 finding 时是 `running-ok` / `ok`。 */
    code: string;
    /** 一句话结论（≤60 字）。 */
    summary: string;
}
/**
 * 结构化证据（客户端据此渲染 `—`）。**所有可缺字段用 null，不省略**：客户端据此
 * 区分「没有」与「没采到」。
 */
export interface DiagnosisEvidence {
    /** inspect 的 `State.Status`（`running` / `exited`）。 */
    state: string;
    /** ps 风格的 STATUS（`Up 4 hours (healthy)` / `Exited (137) 2 minutes ago`），见 `containerStatusText`。 */
    status: string;
    health: string | null;
    /** 健康检查最后一次输出（原文；findings 的 detail 里会截断到 200 字）。 */
    healthLastOutput: string | null;
    exitCode: number | null;
    oomKilled: boolean;
    restartCount: number | null;
    startedAt: string | null;
    finishedAt: string | null;
    /** 内存上限（字节）；`null` = 没有设上限（docker 的 0 已归一成 null）。 */
    memoryLimitBytes: number | null;
    /** CPU 上限（纳核，docker inspect 的 NanoCpus）；`null` = 没有设上限。 */
    cpuQuota: number | null;
    /** 本次抓到的日志行数；`null` = 日志采集失败。 */
    logLines: number | null;
    /** 本次抓到的日志里疑似报错的行数；`null` = 日志采集失败。 */
    errorLines: number | null;
    /** 事件窗口内的事件条数；`null` = 事件采集失败。 */
    eventCount: number | null;
    cpuPercent: number | null;
    memBytes: number | null;
    memPercent: number | null;
}
export interface DiagnosisTimelineEntry {
    /** Unix 秒转 ISO 8601（`null` = 该事件没有时间）。 */
    at: string | null;
    /** 原样的事件动作（`ContainerEvent.action`，可能是 `health_status: healthy`）。 */
    kind: string;
    /** 给人看的中文一句话。 */
    text: string;
}
export interface Diagnosis {
    id: string;
    name: string;
    verdict: DiagnosisVerdict;
    findings: DiagnosisFinding[];
    evidence: DiagnosisEvidence;
    /** 按时间**升序**（时间缺失的排最前）。 */
    timeline: DiagnosisTimelineEntry[];
    /** 最后 N 行原文（不带时间戳前缀）；日志采集失败时为空串（findings 里有原因）。 */
    logTail: string;
    suggestions: string[];
}
/**
 * 判据输入：**已采好的数据**，不是 api。
 *
 * 三路采集（logs / events / stats）的失败用 `null` 表示（见文件头「三种没有」），
 * `*Error` 是给 `*-unavailable` 判据用的原因文案（可选：调用方没传就只说「采集失败」）。
 */
export interface DiagnosisInput {
    detail: ContainerDetail;
    /** 内存上限（字节；0 = 不限制，调用方应已归一成 null）。 */
    memoryLimitBytes: number | null;
    /** CPU 上限（纳核；0 = 不限制，调用方应已归一成 null）。 */
    cpuQuota: number | null;
    /** 本次 `--tail` 采到的原文；`null` = 采集失败。 */
    logText: string | null;
    /** 采集到的日志行数；`null` = 采集失败（与「0 行」区分）。 */
    logLines: number | null;
    /** 窗口内、已按本容器服务端过滤的事件；`null` = 采集失败。 */
    events: ContainerEvent[] | null;
    /** 采集失败给 null（既有 ContainerStats）。 */
    stats: ContainerStats | null;
    logError?: string | null;
    eventError?: string | null;
    statsError?: string | null;
    /**
     * 「现在」的毫秒时间戳（只用于 `evidence.status` 里的相对时长，如 `Up 4 hours`）。
     *
     * 契约要求本模块**不读时钟**（时间由输入给），所以由调用方（`DockerApi.diagnose()`）
     * 注入。缺席时不编时长，退化成不带时长的简写（`Up` / `Exited (137)`）。
     */
    nowMs?: number;
}
/**
 * 相对时长的人类可读文案（`docker ps` 的 STATUS 列用）。
 *
 * 照着 docker 的 `units.HumanDuration` 分档复刻：**秒 → 分 → 时 → 天 → 周 → 月 → 年**，
 * 其中 1 分钟 / 1 小时给 "About a minute" / "About an hour"（docker 就是这么念的），
 * 「1 秒」单独成一档。刻意保留英文形态：用户从 `docker ps` 看到的是同一句话，
 * 两处长得一样才不用在脑子里换算。
 */
export declare function humanDuration(ms: number): string;
/**
 * ps 风格的 STATUS 文案（`evidence.status` 用）。
 *
 * **为什么不直接用 `ContainerDetail.status`**：它实测就是 inspect 的 `State.Status`
 * （`running` / `exited`），而 `docker ps` 的 STATUS 是另一列（`Up 4 hours (healthy)` /
 * `Exited (137) 2 minutes ago`）——契约 §1.2 的 evidence 例子要的是后者。为了这一行
 * 再跑一条 `docker ps` 不划算（诊断已经有 inspect 的权威字段），所以按 docker ps 的
 * 口径现算：判据用 inspect，展示文案顺手推出来（一条事实一个来源）。
 *
 * `nowMs` 缺席时不给相对时长（不编「多久以前」），退化成 `Up` / `Exited (137)`。
 */
export declare function containerStatusText(detail: ContainerDetail, nowMs?: number): string;
/**
 * 纯函数入口：把已采好的四路数据判成一份诊断。
 *
 * 顺序稳定：findings 按 severity 降序，同级按上表的编号顺序；verdict 取最高 severity
 * 的那条（同级取最靠前），一条都不命中且容器在运行时给 `running-ok`。
 */
export declare function diagnose(input: DiagnosisInput): Diagnosis;
