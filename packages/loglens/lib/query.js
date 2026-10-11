/** 默认返回条数（面板与 agent 工具的默认值都取它）。 */
export const DEFAULT_LIMIT = 100;
/** 不声明时间窗上限时的兜底（24 小时）。 */
export const DEFAULT_MAX_WINDOW_MS = 24 * 60 * 60 * 1000;
/** epoch 毫秒的下限判据：小于它就当成「按秒填的」（1e11 ms ≈ 1973-03）。 */
const MS_FLOOR = 100_000_000_000;
/**
 * 「只给了一端」时的兜底窗口：15 分钟。
 *
 * 为什么是它而不是 maxWindowMs（24 小时）：最常见的问法是「给我看最新的日志」，而 24 小时的
 * 尾部在昂贵的集群上是几万行——兜底该给一个**能读完**的量，宽窗留给调用方自己说明。
 */
export const FALLBACK_WINDOW_MS = 15 * 60 * 1000;
/** 相对时间的写法：-30m / -2h / -1d / -90s。 */
const RELATIVE_TIME = /^-(\d+)(s|m|h|d)$/u;
/** 不带时区的日期 / 日期时间（按**本机时区**解释：人写「2026-10-11 14:00」指的就是本地那一下）。 */
const LOCAL_DATETIME = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.](\d{1,3}))?)?)?$/u;
/**
 * 时间参数的**入口**解析：epoch 毫秒 / ISO 8601 / 相对时间（-30m）三种写法都收，
 * 出了这一层就只剩 epoch 毫秒（契约不变：设计 §3.1 的 NormalizedQuery 仍是 ms）。
 *
 * 为什么非收不可（2026-10-11 真机反馈）：让模型手算绝对毫秒是**真的会错**——用户那次
 * 算错了 4 个月，白跑一轮。而 `isoOf()` 内部本来就在用 ISO；把便利留在入口、把契约留在
 * 里层，比逼调用方做算术便宜得多。
 *
 * 取舍写清楚：**不带时区的写法按本机时区解释**（人写「2026-10-11 14:00」指的是本地那一下），
 * 带 `Z` 或 ±HH:MM 的按它自己说的算。
 */
function asTime(value, field, now) {
    const shape = field + ' 收 epoch 毫秒整数（1760000000000）、ISO 8601（2026-10-11T14:00:00Z）或相对时间（-30m / -2h / -1d）';
    let ms;
    if (typeof value === 'number') {
        if (!Number.isFinite(value) || !Number.isInteger(value))
            return { ok: false, error: shape };
        ms = value;
    }
    else if (typeof value === 'string') {
        const text = value.trim();
        if (text === '')
            return { ok: false, error: shape };
        if (text === 'now')
            ms = now;
        else if (/^\d+$/u.test(text))
            ms = Number(text);
        else {
            const relative = RELATIVE_TIME.exec(text);
            if (relative !== null) {
                const amount = Number(relative[1]);
                const unit = relative[2];
                const unitMs = unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
                ms = now - amount * unitMs;
            }
            else {
                const local = LOCAL_DATETIME.exec(text);
                if (local !== null) {
                    ms = new Date(Number(local[1]), Number(local[2]) - 1, Number(local[3]), Number(local[4] === undefined ? '0' : local[4]), Number(local[5] === undefined ? '0' : local[5]), Number(local[6] === undefined ? '0' : local[6]), Number(local[7] === undefined ? '0' : local[7])).getTime();
                }
                else {
                    ms = Date.parse(text); // 带时区偏移的 ISO / RFC 3339
                }
            }
        }
        if (!Number.isFinite(ms))
            return { ok: false, error: field + ' 解析不了：' + text + '（' + shape + '）' };
    }
    else {
        return { ok: false, error: shape };
    }
    if (ms > 0 && ms < MS_FLOOR) {
        return { ok: false, error: field + ' 看起来是**秒**（' + String(ms) + '）：本插件统一用 epoch 毫秒，或直接写 ISO / 相对时间' };
    }
    return { ok: true, value: ms };
}
function asFilters(value) {
    if (value === undefined || value === null)
        return { ok: true };
    if (typeof value !== 'object' || Array.isArray(value)) {
        return { ok: false, error: 'filters 必须是「字段名 → 值」的对象' };
    }
    const filters = {};
    for (const [key, item] of Object.entries(value)) {
        if (typeof item !== 'string')
            return { ok: false, error: 'filters 的值必须是字符串：' + key };
        filters[key] = item;
    }
    return Object.keys(filters).length === 0 ? { ok: true } : { ok: true, filters };
}
/**
 * 归一化 + 夹取。**能夹的夹（limit），会改变语义的报错**（时间窗超上限、时间戳单位不对）——
 * 静默把时间窗截短会让「查到的就是全部」变成一句谎话。
 */
export function normalizeQuery(input, caps, options = {}) {
    const warnings = [];
    if (typeof input.targetId !== 'string' || input.targetId.trim() === '') {
        return { ok: false, error: 'targetId 必填（v1 一次只查一个来源）' };
    }
    const targetId = input.targetId.trim();
    const q = typeof input.q === 'string' ? input.q.trim() : '';
    const now = typeof options.now === 'number' ? options.now : Date.now();
    const rawFrom = input.from === undefined || input.from === null ? undefined : asTime(input.from, 'from', now);
    if (rawFrom !== undefined && !rawFrom.ok)
        return rawFrom;
    const rawTo = input.to === undefined || input.to === null ? undefined : asTime(input.to, 'to', now);
    if (rawTo !== undefined && !rawTo.ok)
        return rawTo;
    const fromValue = rawFrom !== undefined && rawFrom.ok ? rawFrom.value : undefined;
    const toValue = rawTo !== undefined && rawTo.ok ? rawTo.value : undefined;
    /*
     * 兜底口径（2026-10-11 修，来自真机反馈）：**只给一端时一律兜底 + 一条 warning**，
     * 不再因为 requiresTimeRange 把「只给 to」打回去——工具的文案一直写着「to 缺省取当前时刻」，
     * 而实现却在报「缺 from」：照着 schema 办事的 agent 会被自己的插件打回，而
     * 「给我看最新的日志」恰恰是最常见的问法。语义没被悄悄改：兜底窗口会随 window 一起回显，
     * 并且 warning 里写明它是兜底来的。
     *
     * 两端都不给时仍按来源的要求报错（requiresTimeRange 的来源不会凭空造一个时间窗），
     * 但文案点明「给 to 就够」。
     */
    const fallbackWindow = Math.max(1, Math.min(FALLBACK_WINDOW_MS, caps.maxWindowMs > 0 ? caps.maxWindowMs : FALLBACK_WINDOW_MS));
    let from;
    let to;
    if (fromValue === undefined && toValue === undefined) {
        if (caps.requiresTimeRange) {
            return {
                ok: false,
                error: '这个来源必须在时间窗内查询：至少给 to（只给 to 时按它前面 '
                    + String(Math.round(fallbackWindow / 60000)) + ' 分钟兜底），或者直接给 from 与 to',
            };
        }
        to = now;
        from = now - fallbackWindow;
        warnings.push('未给时间窗，按最近 ' + String(Math.round(fallbackWindow / 60000)) + ' 分钟查');
    }
    else if (fromValue === undefined) {
        to = toValue === undefined ? now : toValue;
        from = to - fallbackWindow;
        warnings.push('未给 from，按 to 前面 ' + String(Math.round(fallbackWindow / 60000)) + ' 分钟兜底（window 里是实际生效的时间窗）');
    }
    else if (toValue === undefined) {
        from = fromValue;
        to = now;
        warnings.push('未给 to，按当前时刻兜底（window 里是实际生效的时间窗）');
    }
    else {
        from = fromValue;
        to = toValue;
    }
    if (to <= from)
        return { ok: false, error: '时间窗是空的：to 必须晚于 from' };
    const maxWindowMs = caps.maxWindowMs > 0 ? caps.maxWindowMs : DEFAULT_MAX_WINDOW_MS;
    if (to - from > maxWindowMs) {
        return {
            ok: false,
            error: '时间窗超过这个来源的上限（' + String(Math.round(maxWindowMs / 60000)) + ' 分钟）：请缩小时间窗或分段查',
        };
    }
    let limit = options.defaultLimit === undefined ? DEFAULT_LIMIT : options.defaultLimit;
    if (input.limit !== undefined && input.limit !== null) {
        if (typeof input.limit !== 'number' || !Number.isInteger(input.limit) || input.limit < 1) {
            return { ok: false, error: 'limit 必须是正整数' };
        }
        limit = input.limit;
    }
    if (caps.maxPageSize > 0 && limit > caps.maxPageSize) {
        warnings.push('limit ' + String(limit) + ' 超过这个来源的单页上限，已夹到 ' + String(caps.maxPageSize));
        limit = caps.maxPageSize;
    }
    let direction = 'backward';
    if (input.direction !== undefined && input.direction !== null) {
        if (input.direction !== 'forward' && input.direction !== 'backward') {
            return { ok: false, error: "direction 只能是 'forward' 或 'backward'" };
        }
        direction = input.direction;
    }
    const filters = asFilters(input.filters);
    if (!filters.ok)
        return filters;
    const cursorRaw = typeof input.cursor === 'string' ? input.cursor.trim() : '';
    const query = { targetId, q, from, to, limit, direction };
    if (cursorRaw !== '')
        query.cursor = cursorRaw;
    if (filters.filters !== undefined)
        query.filters = filters.filters;
    return { ok: true, query, warnings };
}
/**
 * 归并计数。**totalKnown 只在真有精确总数时为真**：没有 matched、或 relation 是 'gte' 都算
 * 「matched 只是下界」。别把「不知道」写成「知道」——Agent 侧会拿它当分页与终止判据。
 */
export function countsOf(input) {
    const counts = { returned: input.returned, totalKnown: false };
    if (input.matched !== undefined)
        counts.matched = input.matched;
    if (input.scannedRows !== undefined)
        counts.scannedRows = input.scannedRows;
    if (input.scannedBytes !== undefined)
        counts.scannedBytes = input.scannedBytes;
    counts.totalKnown = input.matched !== undefined && input.totalRelation !== 'gte';
    return counts;
}
/** 截断理由的**固定顺序**（同一个输入必须得到同一个数组，用例才好逐字断言）。 */
export const TRUNCATION_ORDER = [
    'hit_limit',
    'max_result_window',
    'partial_shards',
    'timed_out',
    'scan_cap',
    'byte_cap',
    'cursor_expired',
];
/** 归并截断信号：`truncated` 恒等于「至少有一条理由」，不给「有理由但 truncated=false」的态。 */
export function truncationOf(input) {
    const flags = {
        hit_limit: input.limited,
        max_result_window: input.maxResultWindow,
        partial_shards: input.partialShards,
        timed_out: input.timedOut,
        scan_cap: input.scanCap,
        byte_cap: input.byteCap,
        cursor_expired: input.cursorExpired,
    };
    const reasons = TRUNCATION_ORDER.filter((reason) => flags[reason] === true);
    return { truncated: reasons.length > 0, reasons };
}
//# sourceMappingURL=query.js.map