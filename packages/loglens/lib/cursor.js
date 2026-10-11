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
    if (typeof raw.endNs !== 'string' || raw.endNs === '')
        return { kind: 'invalid', reason: '游标缺 endNs' };
    if (typeof raw.streamIdx !== 'number' || !Number.isInteger(raw.streamIdx) || raw.streamIdx < 0) {
        return { kind: 'invalid', reason: '游标缺 streamIdx' };
    }
    if (typeof raw.ordinalAtTs !== 'number' || !Number.isInteger(raw.ordinalAtTs) || raw.ordinalAtTs < 0) {
        return { kind: 'invalid', reason: '游标缺 ordinalAtTs' };
    }
    return { kind: 'ok', cursor: { v: CURSOR_VERSION, endNs: raw.endNs, streamIdx: raw.streamIdx, ordinalAtTs: raw.ordinalAtTs } };
}
/**
 * 切页：喂「后端这次按序返回的全部行」+「上一页的游标」+ limit。
 *
 * 丢掉的规则刻意写成「同 ts、同流、前 ordinalAtTs 行」而不是「ts 小于等于某值」：
 * 后者会把同 ts 上**还没返回过**的行一起丢掉——那正是这套游标要避免的丢行。
 */
export function slicePage(rows, cursor, limit) {
    let offset = 0;
    if (cursor !== undefined) {
        while (offset < rows.length && offset < cursor.ordinalAtTs) {
            const row = rows[offset];
            if (row.tsNs !== cursor.endNs || row.streamIdx !== cursor.streamIdx)
                break;
            offset += 1;
        }
    }
    const available = rows.slice(offset);
    const page = available.slice(0, Math.max(0, limit));
    const result = { page, limited: page.length >= limit && limit > 0, skipped: offset };
    const last = page[page.length - 1];
    if (last !== undefined) {
        // 同一 ts 同一流的第几行：从这一页所属的 ts 组**在本次返回里的起点**数起，
        // 加上被丢掉的那几行——否则续页会把已经返回过的行再当新行发一次（重复而不是丢失）。
        const groupStart = rows.findIndex((row) => row.tsNs === last.tsNs && row.streamIdx === last.streamIdx);
        let ordinal = 0;
        if (groupStart >= 0) {
            for (let index = groupStart; index <= offset + page.length - 1; index += 1) {
                const row = rows[index];
                if (row !== undefined && row.tsNs === last.tsNs && row.streamIdx === last.streamIdx)
                    ordinal += 1;
            }
        }
        result.next = { v: CURSOR_VERSION, endNs: last.tsNs, streamIdx: last.streamIdx, ordinalAtTs: ordinal };
    }
    return result;
}
/** 把 Loki 返回的 `[tsNs, line]` 对转成 LogLine（`id` 稳定：同 ts 同流同序号只算一行）。 */
export function lineFromLoki(row, ordinalInGroup) {
    const labels = row.labels === undefined ? {} : row.labels;
    const ts = Number(BigInt(row.tsNs) / 1000000n);
    return {
        ts,
        message: row.line,
        source: String(row.streamIdx) + '@' + row.tsNs,
        labels,
        raw: row.line,
        id: String(row.streamIdx) + ':' + row.tsNs + ':' + String(ordinalInGroup),
    };
}
//# sourceMappingURL=cursor.js.map