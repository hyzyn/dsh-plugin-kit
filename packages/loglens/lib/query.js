/** 默认返回条数（面板与 agent 工具的默认值都取它）。 */
export const DEFAULT_LIMIT = 100;
/** 不声明时间窗上限时的兜底（24 小时）。 */
export const DEFAULT_MAX_WINDOW_MS = 24 * 60 * 60 * 1000;
/** epoch 毫秒的下限判据：小于它就当成「按秒填的」（1e11 ms ≈ 1973-03）。 */
const MS_FLOOR = 100_000_000_000;
function asTimestamp(value, field) {
    if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
        return { ok: false, error: field + ' 必须是整数（epoch 毫秒）' };
    }
    if (value > 0 && value < MS_FLOOR) {
        return { ok: false, error: field + ' 看起来是**秒**：本插件统一用 epoch 毫秒（' + String(value) + '）' };
    }
    return { ok: true, value };
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
    const rawFrom = input.from === undefined || input.from === null ? undefined : asTimestamp(input.from, 'from');
    if (rawFrom !== undefined && !rawFrom.ok)
        return rawFrom;
    const rawTo = input.to === undefined || input.to === null ? undefined : asTimestamp(input.to, 'to');
    if (rawTo !== undefined && !rawTo.ok)
        return rawTo;
    const fromValue = rawFrom !== undefined && rawFrom.ok ? rawFrom.value : undefined;
    const toValue = rawTo !== undefined && rawTo.ok ? rawTo.value : undefined;
    const fallbackWindow = Math.min(DEFAULT_MAX_WINDOW_MS, caps.maxWindowMs);
    let from;
    let to;
    if (fromValue === undefined && toValue === undefined) {
        if (caps.requiresTimeRange)
            return { ok: false, error: '这个来源必须在时间窗内查询（from / to 缺一不可）' };
        to = now;
        from = now - fallbackWindow;
        warnings.push('未给时间窗，按最近 ' + String(Math.round(fallbackWindow / 60000)) + ' 分钟查');
    }
    else if (fromValue === undefined) {
        if (caps.requiresTimeRange)
            return { ok: false, error: '这个来源必须在时间窗内查询（缺 from）' };
        to = toValue === undefined ? now : toValue;
        from = to - fallbackWindow;
        warnings.push('未给 from，按 maxWindowMs 兜底');
    }
    else if (toValue === undefined) {
        from = fromValue;
        to = now;
        warnings.push('未给 to，按当前时刻兜底');
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