/**
 * 查询计划护栏：**在语句真正跑起来之前**拦掉全表扫描。
 *
 * ## 为什么这是 agent 场景里最值的一道护栏
 *
 * agent 的典型失败模式不是「写错」，而是**忘记加 `WHERE` 的 SELECT**——它不改变任何东西，
 * 所以只读护栏完全放行，代价却是把一个测试库扫穿（`161` 上是共享联调环境，同事也在用）。
 * 行数上限只限制**回来的**行数，不限制**扫描的**行数——两者不是一回事。
 *
 * ## 判据的诚实边界
 *
 * 这里做的是**按计划文本分类**，不是解析计划树。所以：
 *   - 不认识的行 → `unknown`。**NONE 计划一律拒**（「拿不到计划」等于「不知道代价」，
 *     而不知道代价就放行，等于没有护栏）；
 *   - 引擎不支持取计划（`explain` 不可用）→ **拒**，不是「跳过护栏」。理由同上；
 *   - 阈值是**上限**，不是目标：`rows` 与 `cost` 超阈值即拒，并把 plan 附在拒绝里
 *     （让 agent **一轮**就能修好，而不是靠它自己再猜一次）。
 *
 * 这一层与行数上限（`sql.ts` 的 `effectiveLimit`）是**两个不同的问题**：一个管扫描面，
 * 一个管返回面。缺任何一个都有真实的失败模式。
 */
/** 全表扫描的关键词。**按行匹配**，并排除 `using index` 那种「扫了索引但没回表」的行。 */
const FULL_SCAN_PATTERNS = [
    /\bfull\s+table\s+scan\b/i,
    /\bseq(?:uential)?\s+scan\b/i,
    /\btable\s+scan\b/i,
    /\ball\b.*\brows?\b/i, // MySQL: `type: ALL`
    /\btype\s*[:=]\s*ALL\b/i,
];
/** 索引 / 常量等「便宜」的信号。 */
const CHEAP_PATTERNS = [
    /\bindex\s+(?:seek|only\s+scan)\b/i,
    /\busing\s+index\b/i,
    /\bconst\b/i,
    /\beq_ref\b/i,
    /\bref\b/i,
    /\brange\b/i,
    /\bunique\s+scan\b/i,
    /\bclustered\s+index\s+seek\b/i,
];
/** 引擎专属的「便宜」信号——只有在该引擎的语义下才成立。 */
function cheapForEngine(line, engine) {
    // PostgreSQL：`Index Scan` 覆盖两件事（扫全表 / 定位一行），行结构相同，**按名字分不开**。
    // 所以这里按「通常是有界扫描」放行，把「有没有界」交给行数 / 代价阈值（那里有真实数字）。
    // 这条取向是刻意的：误拒正常查询的代价高于让阈值去管住它。
    if (engine === 'postgres' && /\bindex\s+scan\b/i.test(line) && !/\bseq\s+scan\b/i.test(line))
        return true;
    return false;
}
/**
 * 分类一份计划文本。`engine` 影响**少数几条**判据，见下。
 *
 * **逐行判**（而不是整份文本一次判）：计划里常常同时有「索引查一张小表」与「全扫一张大表」，
 * 整份一起判会把结论变得取决于哪一行先被匹配到。
 *
 * ## 顺序是契约：**先认全量，再认便宜**
 *
 * 反过来的话，一行里同时出现两种信号时结论会取决于哪张正则表先被查到——而 `Using index`
 * （MySQL 的覆盖索引）**既是「便宜」信号又是「不走全量」的排除条件**，顺序错了它就永远没机会生效。
 *
 * ## 为什么需要 `engine`：同一个词在不同引擎里代价相反
 *
 * `Index Scan` 在 **PostgreSQL** 里既用于「扫全表」也用于「走索引定位一行」——`EXPLAIN` 行结构相同，
 * **赢面不在操作名，在估算行数**。而 **SQL Server** 的 `Index Scan`（没有 seek）与 **MySQL** 的
 * `type: index`（没带 `Using index`）都是「扫全量」的可靠信号。
 *
 * 传 `undefined` 时只认那些在所有引擎里都成立的信号（`Seq Scan` / `Table Scan` / `type: ALL`）——
 * 按名字误判 PG 的正常查询，比漏放一条更接近「把工具用得不能要」。
 */
export function classifyPlan(planText, engine) {
    if (typeof planText !== 'string' || planText.trim() === '') {
        return { kind: 'unknown', detail: '计划文本为空' };
    }
    const lines = planText.split(/\r?\n/);
    /**
     * MySQL 覆盖索引信号：它在**另一行**（`Extra:` 行）。
     *
     * 逐行判天然拿不到跨行上下文——`type: index` 与 `Extra: Using index` 是两行，所以这个信号
     * 必须**先整份算一次**，否则「扫整个索引」与「覆盖索引扫描」会被判成同一件事。
     */
    const hasCoveringIndex = /\busing\s+index\b/i.test(planText);
    let sawCheap = false;
    for (const line of lines) {
        let cheap = engine !== undefined && cheapForEngine(line, engine);
        for (const pattern of CHEAP_PATTERNS) {
            if (pattern.test(line)) {
                cheap = true;
                break;
            }
        }
        if (cheap)
            sawCheap = true;
        for (const pattern of FULL_SCAN_PATTERNS) {
            if (!pattern.test(line))
                continue;
            // `Using index` 的行不是回表扫描：它扫的是索引本身。但 `full table scan` 明文出现时不算。
            if (cheap && !/\bfull\s+table\s+scan\b/i.test(line))
                continue;
            return { kind: 'full-scan', detail: line.trim() };
        }
        // MySQL：`type: index` 且**整份计划里没有** `Using index`（覆盖索引）就是扫整个索引。
        if (engine === 'mysql' && !cheap && !hasCoveringIndex && /\btype\s*[:=]\s*index\b/i.test(line)) {
            return { kind: 'full-scan', detail: line.trim() };
        }
        // SQL Server：没有 seek 的 `Index Scan` / `Clustered Index Scan` 都是扫全量。
        if (!cheap && engine === 'sqlserver' && /\b(?:clustered\s+)?index\s+scan\b/i.test(line)) {
            return { kind: 'full-scan', detail: line.trim() };
        }
    }
    if (sawCheap)
        return { kind: 'indexed' };
    return { kind: 'unknown', detail: '计划里没有任何已知的扫描 / 索引信号' };
}
/**
 * 从计划文本里抽估算行数与代价（尽力而为；抽不到就是 `undefined`）。
 *
 * 抽不到**不报错**——`classifyPlan` 的结论与阈值判定会各自处理缺失，
 * 而「抽不到就抛错」会让引擎输出格式的小差异变成整条路径不可用。
 */
export function estimateFromPlan(planText) {
    const out = {};
    if (typeof planText !== 'string')
        return out;
    // 形如 `rows=1234` / `rows: 1234` / `(cost=0.00..12.34 rows=5 ...)`（PostgreSQL）
    const rows = /rows\s*[:=]\s*(\d+)/i.exec(planText);
    if (rows !== null)
        out.rows = Number.parseInt(rows[1], 10);
    const cost = /cost\s*[:=]\s*([\d.]+)/i.exec(planText);
    if (cost !== null)
        out.cost = Number.parseFloat(cost[1]);
    return out;
}
/**
 * 判定一份计划是否放行。
 *
 * 顺序是契约：**先看有没有计划**（拿不到就拒，不看阈值），再看扫描分类，最后看阈值。
 * 反过来的话，「拿不到计划」会被阈值分支的默认值放过去。
 */
export function guardPlan(input) {
    const thresholds = input.thresholds;
    if (typeof input.planText !== 'string' || input.planText.trim() === '') {
        return {
            allowed: false,
            code: 'PLAN_UNAVAILABLE',
            message: input.engine === undefined ? '取不到查询计划' : `${input.engine} 上取不到查询计划`,
            hint: '本套件在拿不到计划时拒绝执行（不知道代价就放行等于没有护栏）：请改用带条件的查询，或先用 explain 看计划',
        };
    }
    const verdict = classifyPlan(input.planText, input.engine);
    const estimate = estimateFromPlan(input.planText);
    if (verdict.kind === 'unknown') {
        return {
            allowed: false,
            code: 'PLAN_UNRECOGNIZED',
            message: `不认识这条计划（${verdict.detail}），一律拒`,
            hint: '把查询改成能看出扫描方式的形式（如加上 WHERE / 明确的表名），或先看 explain 的输出',
            verdict,
            estimate,
        };
    }
    if (verdict.kind === 'full-scan') {
        return {
            allowed: false,
            code: 'FULL_SCAN',
            message: `计划里出现全表扫描：${verdict.detail}`,
            hint: '加上能走索引的条件（WHERE / 主键 / 有索引的列），或把范围收窄后重试。计划原文见 estimate',
            verdict,
            estimate,
        };
    }
    // 行数检查：**未配置就不做这一层**（`undefined` = 不检查；`0` = 一行都不许）。
    // 判据是 `> maxRows`，所以 `maxRows: 0` 时任何行数都过不去——那正是「零容忍」的表达方式。
    const maxRows = thresholds.maxRows;
    if (typeof maxRows === 'number' && Number.isFinite(maxRows) && estimate.rows !== undefined && estimate.rows > maxRows) {
        return {
            allowed: false,
            code: 'COST_TOO_HIGH',
            message: `估算扫描 ${String(estimate.rows)} 行，超过上限 ${String(maxRows)} 行`,
            hint: `缩小查询范围（加条件 / 缩小时间窗 / 限定主键区间）到 ${String(maxRows)} 行估算以内`,
            verdict,
            estimate,
        };
    }
    const maxCost = thresholds.maxCost;
    if (typeof maxCost === 'number' && Number.isFinite(maxCost) && maxCost > 0 && estimate.cost !== undefined && estimate.cost > maxCost) {
        return {
            allowed: false,
            code: 'COST_TOO_HIGH',
            message: `估算代价 ${String(estimate.cost)}，超过上限 ${String(maxCost)}`,
            hint: '缩小查询范围，或改用能走索引的写法',
            verdict,
            estimate,
        };
    }
    return { allowed: true, verdict, estimate };
}
//# sourceMappingURL=plan-guard.js.map