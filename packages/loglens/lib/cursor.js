import { withLevel } from './line.js';
/** 游标版本：形态变了就升版本，解不开的老游标按 invalid 处理（不猜）。 */
export const CURSOR_VERSION = 1;
export function encodeCursor(cursor) {
    return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}
/**
 * 解析游标。**解不开就说解不开**（invalid 带原因），不回落成「当作没有游标」——
 * 那会让「续页」悄悄变成「重头再来」，用户看到的是重复行而不是一条错误。
 */
export function decodeCursor(text) {
    if (text === undefined || text === null || text === '')
        return { kind: 'none' };
    if (typeof text !== 'string')
        return { kind: 'invalid', reason: '游标必须是字符串' };
    let parsed;
    try {
        parsed = JSON.parse(Buffer.from(text, 'base64url').toString('utf8'));
    }
    catch {
        return { kind: 'invalid', reason: '游标不是合法的 base64url + JSON' };
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return { kind: 'invalid', reason: '游标不是对象' };
    }
    const raw = parsed;
    if (raw.v !== CURSOR_VERSION)
        return { kind: 'invalid', reason: '游标版本不认识：' + JSON.stringify(raw.v) };
    if (typeof raw.boundaryNs !== 'string' || raw.boundaryNs === '')
        return { kind: 'invalid', reason: '游标缺 boundaryNs' };
    if (raw.direction !== 'forward' && raw.direction !== 'backward') {
        return { kind: 'invalid', reason: '游标缺 direction（或值不认识）' };
    }
    return {
        kind: 'ok',
        cursor: { v: CURSOR_VERSION, boundaryNs: raw.boundaryNs, direction: raw.direction },
    };
}
/**
 * 一个 ts 组的**内容指纹**：`ts` + 组内每行的内容键（排序后拼起来）。
 *
 * 用途是**用例与排查**：证明「同一个组无论组内次序怎么变，指纹都一样」。
 * 分页本身靠 `boundaryNs + 1ns` 前进，不再依赖指纹去重（那版设计在真机上原地踏步）。
 */
export function groupFingerprint(tsNs, groupKeys) {
    return tsNs + '|' + [...groupKeys].sort().join('\u0000');
}
/**
 * 按「完整 ts 组」切页（loglens D03 之后的新坐标）。
 *
 * 输入是后端这次返回的行（已按 ts + 内容键定序）。规则：
 *   - 取一页；
 *   - **末组补全**：组是切不开的——半组交付会让续页丢行，所以末组整组一起交付
 *     （页因此可以略超 limit，这是刻意取舍）；
 *   - 末组在本次返回里完整时才产出游标；边界是末组的 ts，
 *     由调用方按方向解释（forward → `ts + 1ns` 当 start；backward → `ts` 当 end）。
 */
export function slicePage(rows, cursor, limit, direction) {
    // 取一页，然后**把末组补全**：组是切不开的——半组交付会让续页丢行（D03）。
    // 适配器在调用前已经把末组整组取回，所以这里补全不会再打请求。
    const page = rows.slice(0, Math.max(0, limit));
    const lastKept = page[page.length - 1];
    if (lastKept !== undefined) {
        const groupTail = rows.filter((row) => row.tsNs === lastKept.tsNs);
        const alreadyIn = page.filter((row) => row.tsNs === lastKept.tsNs).length;
        if (groupTail.length > alreadyIn)
            page.push(...groupTail.slice(alreadyIn));
    }
    const result = { page, limited: page.length >= limit && limit > 0, skipped: 0 };
    const last = page[page.length - 1];
    if (last !== undefined) {
        // 末组在**本次返回**里是否完整？完整才给游标——否则续页会把半组当整组，那正是丢行的老路。
        const group = rows.filter((row) => row.tsNs === last.tsNs);
        const delivered = page.filter((row) => row.tsNs === last.tsNs);
        if (delivered.length === group.length) {
            result.next = { v: CURSOR_VERSION, boundaryNs: last.tsNs, direction };
        }
    }
    return result;
}
/**
 * 把 Loki 返回的 `[tsNs, line]` 对转成 LogLine。
 *
 * **`id` 与 `source` 不再含流序号**（loglens D03）：流序号来自响应次序，而那个次序跨查询会变，
 * 拿它拼 id 会让同一个 ts 组在续页时算出不同的 id（去重失效、重复行）。现在用
 * 「ts + 组内内容序」——内容序由 `rowsFromRange` 按内容定，跨页稳定。
 *
 * 级别：Loki 3.x 会带 `detected_level` 标签，有的部署把 `level` 放在流标签里——**有就用它**；
 * 都没有才从正文推断，并标出 levelInferred（真机反馈第 7 条）。
 */
export function lineFromLoki(row, ordinalInGroup) {
    const labels = row.labels === undefined ? {} : row.labels;
    const ts = Number(BigInt(row.tsNs) / 1000000n);
    return withLevel({
        ts,
        message: row.line,
        source: row.tsNs,
        labels,
        raw: row.line,
        id: row.tsNs + ':' + String(ordinalInGroup),
    }, [labels.level, labels.detected_level, labels.severity]);
}
export function encodeSearchAfterCursor(cursor) {
    return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}
/**
 * 解析 ES / OpenSearch 的游标。与 Loki 那份同款判据：**解不开就说解不开**，不回落成「当作没有游标」
 * ——那会把「续页」悄悄变成「重头再来」，用户看到的是重复行而不是一条错误。
 */
export function decodeSearchAfterCursor(text) {
    if (text === undefined || text === null || text === '')
        return { kind: 'none' };
    if (typeof text !== 'string')
        return { kind: 'invalid', reason: '游标必须是字符串' };
    let parsed;
    try {
        parsed = JSON.parse(Buffer.from(text, 'base64url').toString('utf8'));
    }
    catch {
        return { kind: 'invalid', reason: '游标不是合法的 base64url + JSON' };
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return { kind: 'invalid', reason: '游标不是对象' };
    }
    const raw = parsed;
    if (raw.v !== CURSOR_VERSION)
        return { kind: 'invalid', reason: '游标版本不认识：' + JSON.stringify(raw.v) };
    if (raw.kind !== 'es')
        return { kind: 'invalid', reason: '这不是 ES / OpenSearch 的游标（kind=' + JSON.stringify(raw.kind) + '）' };
    if (typeof raw.pitId !== 'string' || raw.pitId === '')
        return { kind: 'invalid', reason: '游标缺 pitId' };
    if (!Array.isArray(raw.searchAfter))
        return { kind: 'invalid', reason: '游标缺 searchAfter' };
    return { kind: 'ok', cursor: { v: CURSOR_VERSION, kind: 'es', pitId: raw.pitId, searchAfter: raw.searchAfter } };
}
/**
 * ES 游标与 Loki 游标共用一个版本号常量：两份形态各带 `kind`，拿错适配器的游标会在 decode 时被拒。
 * （放在这里而不是各写一个常量——版本号是「形态变更」的信号，两边各写一份迟早漂。）
 */
//# sourceMappingURL=cursor.js.map