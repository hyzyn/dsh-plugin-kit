/**
 * @hyzyn/dsh-docker — 诊断历史：把「一次诊断」压成可比较的样本，并把样本读成趋势（纯逻辑，零 IO）。
 *
 * ## 为什么样本里只有数字和 code
 *
 * 诊断结果里有两类东西**绝不能落盘**：容器日志原文（`Diagnosis.logTail`）与每条 finding 的
 * `detail`（里面会嵌日志行，可能带凭证 / token）。所以样本只留**结构化信号**——结论、判据 code
 * 列表、几个关键数字、时间。这与本包既有取向一致：审计行只记 `key=value` 摘要（exec 命令截断
 * 进日志）、密码永不回传浏览器。`sampleFromDiagnosis()` 是这条边界的**唯一执行点**，测试里有一条
 * 「序列化后不含日志片段」的断言盯着它。
 *
 * ## 为什么这个文件不读时钟
 *
 * 同 `diagnose.ts`：判据要被逐条「正例 + 反例」单测，时钟就必须从外面传进来（`nowMs`）。
 * 时间戳的格式化也只发生在调用方——见 `sampleFromDiagnosis(diagnosis, nowMs)` 的注释。
 *
 * ## 三种「没有」仍然可区分
 *
 * 样本里 `memPercent` / `errorLines` / `restartCount` 等可以是 `null`（本次没采到）。
 * 趋势判据遇到 `null` **不当作 0**：两端有一端是 `null` 就跳过这条判据（宁可不说，
 * 也不把「没采到」读成「没变化」）。
 */
import type { Diagnosis, DiagnosisSeverity } from './diagnose.js';
/** 每个容器保留的样本上限（更早的丢最旧）。 */
export declare const HISTORY_PER_CONTAINER = 50;
/** 整个历史文件的样本上限（超出时按「旧行优先丢」重写文件）。 */
export declare const HISTORY_MAX_LINES = 2000;
/**
 * 去重窗口：同一容器、距上一条 < 30s、且签名完全相同 → 不追加。
 *
 * 为什么需要：面板上「重新诊断」是可以连点的，而诊断结果在几十秒内通常一模一样。
 * 不设窗口的话，趋势里会凭空出现一串「同一状态」的样本，把「它在稳定」和「它刚变了」
 * 搅成同一根曲线；同时每次连点都要重写一次文件（IO 放大）。
 */
export declare const HISTORY_DEDUPE_MS = 30000;
/** 一次诊断压成的历史样本。**只存结论与数字**，见文件头「为什么样本里只有数字和 code」。 */
export interface DiagnosisSample {
    /** ISO 8601（毫秒精度）。 */
    at: string;
    severity: DiagnosisSeverity;
    /** verdict.code（`running-ok` / `oom-killed` / …）。 */
    code: string;
    /** 判据 code 列表（排序去重）；**不含** title / detail。 */
    findings: string[];
    state: string;
    exitCode: number | null;
    oomKilled: boolean;
    restartCount: number | null;
    memPercent: number | null;
    cpuPercent: number | null;
    /** 采集失败给 `null`（与「0 行」区分，同 diagnose.ts 的三种「没有」）。 */
    errorLines: number | null;
    eventCount: number | null;
    logLines: number | null;
}
export interface HistoryNumber {
    /** 稳定标识（客户端按它做 i18n 标签，**不要**在这里放中文）。 */
    key: string;
    from: number;
    to: number;
    delta: number;
}
export interface HistoryTrend {
    count: number;
    /** 窗口的首尾时间（样本 <2 时为 `null`）。 */
    window: {
        from: string;
        to: string;
    } | null;
    verdict: {
        severity: DiagnosisSeverity;
        code: string;
        summary: string;
    };
    /** 只含**首尾真的变了**的项（没变、或一端为 null 的都不列）。 */
    numbers: HistoryNumber[];
    /** 窗口内最早一次没有、最近一次有的判据 code。 */
    newFindings: string[];
    /** 最早有、最近没有的判据 code。 */
    resolvedFindings: string[];
    /** 任一恶化判据命中（客户端据此加重整块视觉）。 */
    aggravating: boolean;
}
/**
 * 一次诊断 → 一条历史样本。
 *
 * `nowMs` 由调用方注入（理由见文件头）：样本的时间戳是**这次诊断发生的时刻**，不是容器状态的时刻。
 *
 * 刻意**不**从 `diagnosis.evidence` 里搬 `status` / `health` 这类自由文本——它们是给人看的，
 * 存进历史既占地方又可能带出主机细节；趋势只需要数字与 code。
 */
export declare function sampleFromDiagnosis(diagnosis: Diagnosis, nowMs: number): DiagnosisSample;
/**
 * 这一条要不要追加。
 *
 * 只有「距上一条 < 30s **且** 签名完全相同」才丢——签名不同说明真发生了变化（容器刚被重启、
 * 判据刚多了一条），哪怕只隔 1 秒也必须留下，否则趋势会把真正的拐点吃掉。
 */
export declare function shouldAppend(last: DiagnosisSample | undefined, next: DiagnosisSample, nowMs: number): boolean;
/**
 * 样本序列 → 趋势。
 *
 * 判据按**优先级**取第一条命中的作为 verdict（`aggravating` 则是「任一命中」）：
 * 重启增长 > 反复 OOM > 内存爬升 > 报错增长 > 新出现严重判据 > 结论持续变严重 > 稳定。
 * 顺序即重要性：一个正在 crash-loop 的容器，哪怕内存也在爬，第一句话该说「它在反复重启」。
 *
 * 文案是**给用户看的**（同 diagnose.ts）：不说 `restartCount` / `memPercent` 这类字段名，
 * 说「重启次数」「内存占用」；每条 ≤60 字。
 */
export declare function historyTrend(samples: readonly DiagnosisSample[]): HistoryTrend;
