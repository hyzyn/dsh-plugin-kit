/** 每个容器保留的样本上限（更早的丢最旧）。 */
export const HISTORY_PER_CONTAINER = 50;
/** 整个历史文件的样本上限（超出时按「旧行优先丢」重写文件）。 */
export const HISTORY_MAX_LINES = 2000;
/**
 * 去重窗口：同一容器、距上一条 < 30s、且签名完全相同 → 不追加。
 *
 * 为什么需要：面板上「重新诊断」是可以连点的，而诊断结果在几十秒内通常一模一样。
 * 不设窗口的话，趋势里会凭空出现一串「同一状态」的样本，把「它在稳定」和「它刚变了」
 * 搅成同一根曲线；同时每次连点都要重写一次文件（IO 放大）。
 */
export const HISTORY_DEDUPE_MS = 30_000;
/** 命中 `new-serious-findings` 的判据 code（这几条一旦**新出现**就是恶化信号）。 */
const SERIOUS_FINDINGS = new Set(['oom-killed', 'crash-loop', 'unhealthy', 'exit-nonzero']);
/** 严重度排序（用于 `severity-creep` 的「非降」判定）。 */
const SEVERITY_RANK = {
    ok: 0,
    info: 1,
    warning: 2,
    critical: 3,
};
/**
 * 一次诊断 → 一条历史样本。
 *
 * `nowMs` 由调用方注入（理由见文件头）：样本的时间戳是**这次诊断发生的时刻**，不是容器状态的时刻。
 *
 * 刻意**不**从 `diagnosis.evidence` 里搬 `status` / `health` 这类自由文本——它们是给人看的，
 * 存进历史既占地方又可能带出主机细节；趋势只需要数字与 code。
 */
export function sampleFromDiagnosis(diagnosis, nowMs) {
    const evidence = diagnosis.evidence;
    return {
        at: new Date(nowMs).toISOString(),
        severity: diagnosis.verdict.severity,
        code: diagnosis.verdict.code,
        findings: [...new Set(diagnosis.findings.map((finding) => finding.code))].sort(),
        state: evidence.state,
        exitCode: evidence.exitCode,
        oomKilled: evidence.oomKilled,
        restartCount: evidence.restartCount,
        memPercent: evidence.memPercent,
        cpuPercent: evidence.cpuPercent,
        errorLines: evidence.errorLines,
        eventCount: evidence.eventCount,
        logLines: evidence.logLines,
    };
}
/** 去重签名：结论 + 判据 + 重启次数（重启次数是唯一「单调量」，必须进签名）。 */
function sampleSignature(sample) {
    return [sample.severity, sample.code, sample.findings.join(','), String(sample.restartCount)].join('|');
}
/**
 * 这一条要不要追加。
 *
 * 只有「距上一条 < 30s **且** 签名完全相同」才丢——签名不同说明真发生了变化（容器刚被重启、
 * 判据刚多了一条），哪怕只隔 1 秒也必须留下，否则趋势会把真正的拐点吃掉。
 */
export function shouldAppend(last, next, nowMs) {
    if (last === undefined)
        return true;
    if (sampleSignature(last) !== sampleSignature(next))
        return true;
    const lastMs = Date.parse(last.at);
    // 时间戳坏了（理论上不会：它由 sampleFromDiagnosis 生成）时按「可以追加」处理：
    // 宁可多一条样本，也不要因为一条坏时间戳让整个历史从此停止记录
    if (Number.isNaN(lastMs))
        return true;
    // 负数（时钟回拨）也算「窗口内」：那种情况下签名相同本来就没有新信息
    return nowMs - lastMs >= HISTORY_DEDUPE_MS;
}
/** 取某个数值字段的首尾**非 null** 值；不足两个值返回 `null`（见文件头「三种没有」）。 */
function endsOf(samples, key) {
    const values = [];
    for (const sample of samples) {
        const value = sample[key];
        if (typeof value === 'number' && Number.isFinite(value))
            values.push(value);
    }
    if (values.length < 2)
        return null;
    return [values[0], values[values.length - 1]];
}
/**
 * 每个数值项的**最小有意义变化**（低于它的抖动不进 `numbers`）。真机数据逼出来的：
 * 第三次诊断的 `cpuPercent` 从 1.11 变到 1.09，`numbers` 里就多了一行
 * 「CPU 1.11% → 1.09%（-0.02）」——那是瞬时快照的采样噪声，不是负载变化。
 *
 * 为什么是这些数：
 *   - `cpuPercent` **5 个百分点**：诊断只取一个 `docker stats --no-stream` 瞬时值，
 *     1~2 个百分点的抖动是常态（真机实测 1.11 → 1.09 这种）；5 个百分点以上才说明负载换了档。
 *   - `memPercent` **1 个百分点**：内存是慢变量，而且它直接对应 OOM 风险，小变化也要报。
 *   - `restartCount` **1**：这一项本来就不该动——重启多 1 次就是信号。
 *   - `errorLines` **3**：它数的是「最近 N 行里命中报错的行数」，而窗口是滑动的——
 *     一条老报错滑出去、一条新的滑进来，计数就会 ±1~2。**真机实测**这台容器三连测是
 *     22 → 21 → 21：差 1 行纯属窗口漂移，天天报出来会把真信号淹掉。3 行以上才算变化；
 *     「从 0 变正」这种更重的信号由趋势判据 `error-growth` 单独负责，不靠这一行。
 *   - `eventCount` **5** / `logLines` **50**：这两项由采样窗口决定（日志尾行数、事件窗口），
 *     抖动本来就大，太小的变化说出来只会淹掉真正的信号。
 */
const MIN_DELTA = {
    restartCount: 1,
    memPercent: 1,
    cpuPercent: 5,
    errorLines: 3,
    eventCount: 5,
    logLines: 50,
};
/**
 * 归一：百分比类保留 1 位小数、计数类取整。
 *
 * 为什么必须做：`to - from` 在二进制浮点下会拖尾巴（`1.09 - 1.11 = -0.020000000000000018`、
 * `88.1 - 52 = 36.099999999999994`），原样进 JSON 就是给客户端甩锅——无论它在哪一层四舍五入，
 * 都要先跟这串数字搏斗一次。归一只在**出门前**做一次，样本里存的仍是原值（趋势判据要用真值）。
 */
function normalizeNumber(key, value) {
    const factor = key === 'memPercent' || key === 'cpuPercent' ? 10 : 1;
    return Math.round(value * factor) / factor;
}
/**
 * 首尾真的变了的数值项。
 *
 * 两道闸：**归一后为 0**（没变）与**低于该 key 的最小有意义变化**（抖动）都不列。
 * `delta` 由归一后的值相减、再归一一次——否则 `88.1 - 52` 这类减法仍会漏出 `36.099999999999994`。
 */
function changedNumbers(samples) {
    const numbers = [];
    // 键序即 `numbers` 的输出顺序（重启 > 内存 > CPU > 报错 > 事件 > 日志），保持稳定便于断言
    for (const key of Object.keys(MIN_DELTA)) {
        const ends = endsOf(samples, key);
        if (ends === null)
            continue;
        const from = normalizeNumber(key, ends[0]);
        const to = normalizeNumber(key, ends[1]);
        const delta = normalizeNumber(key, to - from);
        if (delta === 0)
            continue;
        if (Math.abs(delta) < MIN_DELTA[key])
            continue;
        numbers.push({ key, from, to, delta });
    }
    return numbers;
}
/** 固定格式的一位数百分比 / 计数（summary 里不要出现 `91.66667%` 这种）。 */
function fmt(value) {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
/** 判据 code 列表 → 给人看的一句话（只取前三条，超出用「等」收尾）。 */
function joinFindings(codes) {
    const head = codes.slice(0, 3).join('、');
    return codes.length > 3 ? `${head} 等 ${String(codes.length)} 条` : head;
}
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
export function historyTrend(samples) {
    const count = samples.length;
    if (count < 2) {
        return {
            count,
            window: null,
            verdict: { severity: 'info', code: 'insufficient', summary: '诊断历史还不够形成趋势（至少 2 次）' },
            numbers: [],
            newFindings: [],
            resolvedFindings: [],
            aggravating: false,
        };
    }
    const first = samples[0];
    const last = samples[count - 1];
    const firstFindings = new Set(first.findings);
    const lastFindings = new Set(last.findings);
    const newFindings = [...lastFindings].filter((code) => !firstFindings.has(code)).sort();
    const resolvedFindings = [...firstFindings].filter((code) => !lastFindings.has(code)).sort();
    const numbers = changedNumbers(samples);
    const restartEnds = endsOf(samples, 'restartCount');
    const restartGrowth = restartEnds === null ? null : restartEnds[1] - restartEnds[0];
    const oomCount = samples.filter((sample) => sample.oomKilled).length;
    const memEnds = endsOf(samples, 'memPercent');
    const memGrowth = memEnds === null ? null : memEnds[1] - memEnds[0];
    const errorEnds = endsOf(samples, 'errorLines');
    const seriousNew = newFindings.filter((code) => SERIOUS_FINDINGS.has(code));
    let verdict = null;
    let aggravating = false;
    // 1) 重启增长：±2 次说明这不是「偶发重启」，是 crash loop 的形状
    if (restartGrowth !== null && restartGrowth >= 2) {
        const from = restartEnds[0];
        const to = restartEnds[1];
        verdict = {
            severity: restartGrowth >= 5 ? 'critical' : 'warning',
            code: 'restart-growth',
            summary: `重启次数在 ${String(count)} 次诊断里从 ${fmt(from)} 涨到 ${fmt(to)} —— 它在反复重启，不是偶发`,
        };
        aggravating = true;
    }
    // 2) 反复 OOM：出现两次以上，内存就是真的不够（不是抖动）
    if (verdict === null && oomCount >= 2) {
        verdict = {
            severity: 'critical',
            code: 'oom-recurring',
            summary: `${String(count)} 次诊断里有 ${String(oomCount)} 次被 OOM 杀掉 —— 内存是真的不够`,
        };
        aggravating = true;
    }
    // 3) 内存爬升：涨了 20 个百分点**且**末值已经在 80 以上，才叫「爬升」（只要涨不看基线会误报）
    if (verdict === null && count >= 3 && memGrowth !== null && memGrowth >= 20 && memEnds[1] >= 80) {
        verdict = {
            severity: 'warning',
            code: 'memory-creep',
            summary: `内存占用从 ${fmt(memEnds[0])}% 涨到 ${fmt(memEnds[1])}%（${String(count)} 次诊断）—— 有泄漏或流量在涨`,
        };
        aggravating = true;
    }
    // 4) 报错增长：涨了 5 行，或从 0 变正（「本来一条没有」到「开始报错」本身就是信号）
    if (verdict === null && count >= 3 && errorEnds !== null) {
        const [from, to] = errorEnds;
        const grew = to - from >= 5 || (from === 0 && to > 0);
        if (grew) {
            verdict = {
                severity: 'warning',
                code: 'error-growth',
                summary: `日志里的报错行从 ${fmt(from)} 涨到 ${fmt(to)}（${String(count)} 次诊断）—— 错误在变多`,
            };
            aggravating = true;
        }
    }
    // 5) 新出现的严重判据：OOM / crash loop / 不健康 / 非零退出，**新出现**就已经是恶化
    if (verdict === null && seriousNew.length > 0) {
        verdict = {
            severity: 'warning',
            code: 'new-serious-findings',
            summary: `新出现严重判据：${joinFindings(seriousNew)}`,
        };
        aggravating = true;
    }
    // 6) 结论持续变严重：最近 3 条非降且末条 ≥ warning（一次 warning 之后回到 ok 不算）
    if (verdict === null && count >= 3) {
        const tail = samples.slice(-3);
        const monotone = tail.every((sample, index) => index === 0 || SEVERITY_RANK[sample.severity] >= SEVERITY_RANK[tail[index - 1].severity]);
        const lastRisky = SEVERITY_RANK[tail[tail.length - 1].severity] >= SEVERITY_RANK.warning;
        if (monotone && lastRisky) {
            verdict = {
                severity: 'warning',
                code: 'severity-creep',
                summary: `连续 ${String(tail.length)} 次诊断的结论在变严重（最近一次：${last.severity}）`,
            };
            aggravating = true;
        }
    }
    return {
        count,
        window: { from: first.at, to: last.at },
        verdict: verdict ?? { severity: 'ok', code: 'stable', summary: '容器状态没有明显变化' },
        numbers,
        newFindings,
        resolvedFindings,
        aggravating,
    };
}
//# sourceMappingURL=history.js.map