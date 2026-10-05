/**
 * **Redis keyspace 树**的纯逻辑（P14 第二版：对象浏览器那一半）。
 *
 * ## 它解决什么问题
 *
 * 第一版的面板只能发一条命令原文——看得到 `SCAN` 的裸回复，看不到「有哪些 key、各自是什么类型、
 * 里面大概长什么样」。这一层把「扫一页 key」与「看一个 key」编成**固定几条只读命令**，并把回复
 * 整形给界面。它自己**不连任何东西**：命令交给（且只能交给）`invokeRedisCommand`——也就是 agent
 * 那条工具用的同一个函数，于是作用域、能力闸门与审计一件都不会少。
 *
 * ## 一条硬判据：**能被解析层表达的 key 才发得出去**
 *
 * 命令原文的切分是**按空白**的（`redis-command.ts` 的 `redisArgv`，全仓唯一那一处）。于是：
 *
 *   - 含空白的 key / 模式**根本表达不出来**——`GET my key` 会变成三段，键名被切成 `my`；
 *   - 更糟的是**注入**：一个叫 `x COUNT 1` 的「key」会让 `SCAN 0 MATCH x COUNT 1` 多出两个参数；
 *   - 而「界面按 A 判、执行时按 B 跑」正是这套东西最怕的那类错位。
 *
 * 所以这里**在读任何东西之前**就拒掉含空白 / 控制字符的输入（`UNADDRESSABLE`），并且如实说清
 * 「解析层今天只按空白切分，这种 key 还发不出去」——不是「你写错了」，是**能力边界**。
 *
 * ## 六种类型的预览都是**有界**的
 *
 * `string` 用 `GETRANGE 0 199`（不是 `GET`：一个 10MB 的值不该在界面上把面板拖死）、`list` 用
 * `LRANGE 0 99`、`hash` / `set` 用 `HSCAN` / `SSCAN 0 COUNT 50`、`zset` 用 `ZRANGE 0 99 WITHSCORES`。
 * 上限写死在这里，**不接受调用方传**（能提的上限等于没有上限）。没做预览的类型**如实说没做**，
 * 不猜内容。
 */
/** 可寻址性判据：空白（含全角空格以外的各种）与控制字符。 */
const UNADDRESSABLE = /[\s\u0000-\u001f\u007f]/;
/** key 与模式的长度上限。够长，但挡住「拿一条命令当 key 传」的形态。 */
export const KEY_MAX_LENGTH = 512;
export const PATTERN_MAX_LENGTH = 256;
/** 预览上限（**写死**，不给调用方提的余地）。 */
export const PREVIEW_LIMIT = 100;
export const STRING_PREVIEW_LIMIT = 200;
export const SCAN_PREVIEW_COUNT = 50;
/**
 * 库号的上限。
 *
 * **它不是 Redis 的 `databases`**：那个只有 `CONFIG GET databases` 答得出，而 `CONFIG` 在禁表里
 * （`redis-command.ts`），永远拿不到。所以这个数是**配置侧的防呆上限**，不是「这台上最多有几个库」——
 * 写一个这台机器没有的库号不会被这里拦住，它会走到 `SELECT`，由服务器**如实报错**（那才是真答案）。
 */
export const MAX_DB_INDEX = 255;
/** 一个值是不是一个能拿去 `SELECT` 的库号。 */
export function isDbIndex(value) {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_DB_INDEX;
}
/** 目标声明里的库列表：**去重、升序**；坏值原样交回给调用方（由它按自己那套文案报 problem）。 */
export function normalizeDbs(value) {
    const list = Array.isArray(value) ? value : [];
    const dbs = [];
    const bad = [];
    for (const item of list) {
        if (!isDbIndex(item)) {
            bad.push(item);
            continue;
        }
        if (!dbs.includes(item))
            dbs.push(item);
    }
    return { dbs: dbs.sort((left, right) => left - right), bad };
}
/** 声明的缺省浏览库：`db` 没写就是 0（Redis 连接默认就在 0 号库，不是我们补的）。 */
export function defaultDb(value) {
    return isDbIndex(value) ? value : 0;
}
/**
 * 表格「值」那一列的单行预览长度上限（**写死**，与 `PREVIEW_LIMIT` 同一条理由）。
 *
 * 它是**显示**的上限，不是取数的上限：取多少条由 `previewPlan` 定（也是写死的），这里只把
 * 已经整形好的那几行压成一行、超出就截断并**照实说截了**。
 */
export const PREVIEW_TEXT_MAX = 120;
/**
 * **表格一行**（P14 第四版「Navicat 那张表」的 Value 列）。
 *
 * 它是 `/key` 那套 `rows` 的**同一条数据**压成一行：哈希 / 有序集合是 `field:value`，列表 /
 * 集合是元素，字符串就是它自己。规则只有三条，都是「照实说」：
 *
 *   1. `rows === null`（这个类型没做预览，比如 `stream`）→ `null`：**界面画「—」，不猜内容**；
 *   2. 截断（`truncated` 或压完超长）→ 末尾 `…`：值那一列看着短，但**不能让人以为它就这么点**；
 *   3. 非字符串类型包一层 `[]`：一眼看得出「这是几个元素」，而不是「一个长字符串」。
 */
export function previewText(kind, rows, truncated) {
    if (rows === null)
        return null;
    const parts = rows.map((row) => (row.length >= 2 ? `${row[0] ?? ''}:${row[1] ?? ''}` : row[0] ?? ''));
    const joined = parts.join(', ');
    const clipped = joined.length > PREVIEW_TEXT_MAX ? joined.slice(0, PREVIEW_TEXT_MAX) : joined;
    const more = truncated || clipped.length < joined.length;
    if (kind === 'string')
        return clipped + (more ? '…' : '');
    if (clipped === '')
        return more ? '[…]' : '[]';
    return `[${clipped}${more ? ', …' : ''}]`;
}
/**
 * 面板**能不能去**这个库。
 *
 * 允许集是两半的并集，**两半都是宿主侧的事实**——一半来自配置（目标声明的 `dbs` / `db`），
 * 一半来自服务器的 `INFO keyspace`（它只说**有 key 的**库）。浏览器的作用只是**从这两个集合里挑一个
 * 编号**：它既不能发明一个编号，也不能自己拼 `SELECT`（那条命令由执行器按目标的连接发）。
 */
export function canBrowseDb(index, declared, reported) {
    return isDbIndex(index) && (declared.includes(index) || reported.includes(index));
}
function refuse(code, error) {
    return { ok: false, code, error };
}
/**
 * 一个「要拼进命令原文」的片段过不过得了判据。
 *
 * `what` 只影响文案（`key` / `匹配模式`）——判据是同一条：**解析层表达不出来的一律拒**。
 */
export function checkAddressable(value, options) {
    const text = typeof value === 'string' ? value : '';
    const code = options.what === 'key' ? 'BAD_KEY' : options.what === '匹配模式' ? 'BAD_PATTERN' : 'BAD_KEY';
    if (text === '')
        return refuse(code, `${options.what}不能是空的`);
    if (text.length > options.maxLength)
        return refuse(code, `${options.what}太长（上限 ${String(options.maxLength)} 个字符）`);
    if (UNADDRESSABLE.test(text)) {
        return refuse(code, `${options.what}里有空白或控制字符，而命令原文的切分**只按空白**——这种 ${options.what} 今天发不出去（发出去会被切成别的参数）。` +
            `恢复路径：用不含空白的 ${options.what}；要按前缀找，用 MATCH 加通配符（如 \`user:*\`）`);
    }
    return { ok: true, value: text };
}
/** `SCAN <cursor> [MATCH p] [COUNT n]` 的命令原文。缺省游标是 `0`（从头扫）。 */
export function scanCommand(input) {
    const rawCursor = input.cursor === undefined || input.cursor === null || input.cursor === '' ? '0' : input.cursor;
    const cursor = typeof rawCursor === 'string' || typeof rawCursor === 'number' ? String(rawCursor) : '';
    if (!/^\d+$/.test(cursor))
        return refuse('BAD_CURSOR', `游标必须是非负整数，拿到 ${JSON.stringify(cursor)}`);
    let command = `SCAN ${cursor}`;
    if (input.match !== undefined && input.match !== null && input.match !== '') {
        const pattern = checkAddressable(input.match, { what: '匹配模式', maxLength: PATTERN_MAX_LENGTH });
        if (!pattern.ok)
            return pattern;
        command += ` MATCH ${pattern.value}`;
    }
    if (input.count !== undefined && input.count !== null && input.count !== '') {
        const count = typeof input.count === 'number' ? input.count : Number.parseInt(String(input.count), 10);
        if (!Number.isInteger(count) || count < 1)
            return refuse('BAD_COUNT', `COUNT 必须是正整数，拿到 ${JSON.stringify(input.count)}`);
        // 上限由解析层夹紧（`maxScanCount`），这里只挡明显不合法的值。
        command += ` COUNT ${String(count)}`;
    }
    return { ok: true, command };
}
/** `SCAN` 的裸回复：`[游标, [key…]]`。认不出来就**拒**，不猜。 */
export function parseScanReply(reply) {
    if (!Array.isArray(reply) || reply.length < 2) {
        return refuse('UNEXPECTED_REPLY', `SCAN 的回复不是 \`[游标, [key…]]\`：${JSON.stringify(reply)?.slice(0, 120) ?? 'undefined'}`);
    }
    const cursor = reply[0];
    const keys = reply[1];
    if (typeof cursor !== 'string' && typeof cursor !== 'number') {
        return refuse('UNEXPECTED_REPLY', `SCAN 的回复里游标不是字符串：${JSON.stringify(cursor)}`);
    }
    if (!Array.isArray(keys)) {
        return refuse('UNEXPECTED_REPLY', `SCAN 的回复里第二个元素不是数组：${JSON.stringify(keys)?.slice(0, 120) ?? 'undefined'}`);
    }
    return { ok: true, cursor: String(cursor), keys: keys.map((key) => (typeof key === 'string' ? key : JSON.stringify(key) ?? '')) };
}
export function parseInfoKeyspace(reply) {
    if (typeof reply !== 'string') {
        return refuse('UNEXPECTED_REPLY', `INFO keyspace 的回复不是字符串：${JSON.stringify(reply)?.slice(0, 120) ?? 'undefined'}`);
    }
    const dbs = [];
    for (const line of reply.split(/\r?\n/)) {
        const match = /^db(\d+):keys=(\d+)(?:,expires=(\d+))?(?:,avg_ttl=(\d+))?/.exec(line.trim());
        if (match === null)
            continue;
        dbs.push({
            index: Number.parseInt(match[1], 10),
            keys: Number.parseInt(match[2], 10),
            expires: match[3] === undefined ? null : Number.parseInt(match[3], 10),
            avgTtl: match[4] === undefined ? null : Number.parseInt(match[4], 10),
        });
    }
    return { ok: true, dbs: dbs.sort((left, right) => left.index - right.index) };
}
/** 一次「按本页统计类型」最多问几个 key（**写死**：它等于 N 次调用 + N 行审计）。 */
export const TYPE_BATCH_MAX = 50;
/**
 * 一次「读表格那一页的类型 / 大小 / 值 / TTL」最多问几个 key（**写死**）。
 *
 * 比 `TYPE_BATCH_MAX` 小得多，因为**每个 key 要 3~4 条命令**（`TYPE` + 元素数 / 字符串长度 +
 * 有界预览 + `TTL`）：20 个 key ≈ 80 次调用 / 80 行审计。界面按这个上限**分批**往下读，
 * 一边读一边把行填上——那正是这张表「像 Navicat」而**代价照样写在按钮上**的做法。
 */
export const ROW_BATCH_MAX = 20;
export function kindOf(type) {
    if (type === 'string' || type === 'list' || type === 'hash' || type === 'set' || type === 'zset')
        return type;
    if (type === 'none')
        return 'none';
    return 'other';
}
/**
 * 看一个 key 要发的命令（**除 `TYPE` / `TTL` 之外的那几条**）。
 *
 * `none`（key 不存在）与没做预览的类型都返回 `commands: []`——**不是错误**，界面上如实写一句。
 */
export function previewPlan(type, key) {
    const kind = kindOf(type);
    switch (kind) {
        case 'string':
            return { commands: [`STRLEN ${key}`, `GETRANGE ${key} 0 ${String(STRING_PREVIEW_LIMIT - 1)}`], kind };
        case 'list':
            return { commands: [`LLEN ${key}`, `LRANGE ${key} 0 ${String(PREVIEW_LIMIT - 1)}`], kind };
        case 'hash':
            return { commands: [`HLEN ${key}`, `HSCAN ${key} 0 COUNT ${String(SCAN_PREVIEW_COUNT)}`], kind };
        case 'set':
            return { commands: [`SCARD ${key}`, `SSCAN ${key} 0 COUNT ${String(SCAN_PREVIEW_COUNT)}`], kind };
        case 'zset':
            return { commands: [`ZCARD ${key}`, `ZRANGE ${key} 0 ${String(PREVIEW_LIMIT - 1)} WITHSCORES`], kind };
        default:
            return { commands: [], kind };
    }
}
function asNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    if (typeof value === 'string' && /^-?\d+$/.test(value))
        return Number.parseInt(value, 10);
    return null;
}
function asStrings(value) {
    if (!Array.isArray(value))
        return null;
    return value.map((item) => (typeof item === 'string' ? item : item === null ? '' : JSON.stringify(item) ?? ''));
}
function pairs(flat) {
    const rows = [];
    for (let i = 0; i + 1 < flat.length; i += 2)
        rows.push([flat[i], flat[i + 1]]);
    return rows;
}
/**
 * 把 `TYPE` / `TTL` / 元素数 / 预览四条回复整成一个 key 的视图。
 *
 * 预览的**截断判据**分两处：`list` / `zset` 是「元素数 > 取回的行数」，`hash` / `set` 是「`SCAN`
 * 的游标不是 `0`」（游标非 0 说明还有下一页），`string` 是「字节数 > 取回的字符数」。三处都写在这里，
 * 界面只管显示——**别让界面去猜有没有被截断**。
 */
export function shapeKeyView(input) {
    const type = typeof input.type === 'string' && input.type !== '' ? input.type : 'unknown';
    const kind = kindOf(type);
    const ttl = asNumber(input.ttl);
    const total = asNumber(input.total);
    const strings = asStrings(input.preview);
    let rows = null;
    let truncated = false;
    let totalKind = 'none';
    if (kind === 'string') {
        totalKind = 'bytes';
        /*
         * `GETRANGE` 回的是**裸字符串**（不是数组）——`null` 表示 key 在这一瞬间没了；
         * 空串是「值就是空的」，两者不能合并（与 `resp.ts` 的 `bulk` 同一条口径）。
         */
        const value = input.preview;
        rows = typeof value === 'string' ? [[value]] : null;
        truncated = total !== null && total > STRING_PREVIEW_LIMIT;
    }
    else if (kind === 'list') {
        totalKind = 'items';
        rows = strings === null ? null : strings.map((value, index) => [String(index), value]);
        truncated = total !== null && total > PREVIEW_LIMIT;
    }
    else if (kind === 'zset') {
        totalKind = 'members';
        rows = strings === null ? null : pairs(strings);
        truncated = total !== null && total > PREVIEW_LIMIT;
    }
    else if (kind === 'hash') {
        totalKind = 'fields';
        // `HSCAN` 的回复是 `[游标, [字段, 值, …]]`：游标不是 0 就还有下一页。
        const scan = Array.isArray(input.preview) ? input.preview : null;
        const cursor = scan === null ? null : scan[0];
        const flat = scan === null ? null : asStrings(scan[1]);
        rows = flat === null ? null : pairs(flat);
        truncated = cursor !== null && String(cursor) !== '0';
    }
    else if (kind === 'set') {
        totalKind = 'members';
        const scan = Array.isArray(input.preview) ? input.preview : null;
        const cursor = scan === null ? null : scan[0];
        const flat = scan === null ? null : asStrings(scan[1]);
        rows = flat === null ? null : flat.map((member) => [member]);
        truncated = cursor !== null && String(cursor) !== '0';
    }
    return { key: input.key, type, kind, ttl, total, totalKind, rows, truncated };
}
//# sourceMappingURL=keyspace.js.map