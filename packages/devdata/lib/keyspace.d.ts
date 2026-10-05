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
/** key 与模式的长度上限。够长，但挡住「拿一条命令当 key 传」的形态。 */
export declare const KEY_MAX_LENGTH = 512;
export declare const PATTERN_MAX_LENGTH = 256;
/** 预览上限（**写死**，不给调用方提的余地）。 */
export declare const PREVIEW_LIMIT = 100;
export declare const STRING_PREVIEW_LIMIT = 200;
export declare const SCAN_PREVIEW_COUNT = 50;
/**
 * 库号的上限。
 *
 * **它不是 Redis 的 `databases`**：那个只有 `CONFIG GET databases` 答得出，而 `CONFIG` 在禁表里
 * （`redis-command.ts`），永远拿不到。所以这个数是**配置侧的防呆上限**，不是「这台上最多有几个库」——
 * 写一个这台机器没有的库号不会被这里拦住，它会走到 `SELECT`，由服务器**如实报错**（那才是真答案）。
 */
export declare const MAX_DB_INDEX = 255;
/** 一个值是不是一个能拿去 `SELECT` 的库号。 */
export declare function isDbIndex(value: unknown): value is number;
/** 目标声明里的库列表：**去重、升序**；坏值原样交回给调用方（由它按自己那套文案报 problem）。 */
export declare function normalizeDbs(value: unknown): {
    dbs: number[];
    bad: unknown[];
};
/** 声明的缺省浏览库：`db` 没写就是 0（Redis 连接默认就在 0 号库，不是我们补的）。 */
export declare function defaultDb(value: unknown): number;
/**
 * 表格「值」那一列的单行预览长度上限（**写死**，与 `PREVIEW_LIMIT` 同一条理由）。
 *
 * 它是**显示**的上限，不是取数的上限：取多少条由 `previewPlan` 定（也是写死的），这里只把
 * 已经整形好的那几行压成一行、超出就截断并**照实说截了**。
 */
export declare const PREVIEW_TEXT_MAX = 120;
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
export declare function previewText(kind: KeyKind, rows: readonly (readonly string[])[] | null, truncated: boolean): string | null;
/**
 * 面板**能不能去**这个库。
 *
 * 允许集是两半的并集，**两半都是宿主侧的事实**——一半来自配置（目标声明的 `dbs` / `db`），
 * 一半来自服务器的 `INFO keyspace`（它只说**有 key 的**库）。浏览器的作用只是**从这两个集合里挑一个
 * 编号**：它既不能发明一个编号，也不能自己拼 `SELECT`（那条命令由执行器按目标的连接发）。
 */
export declare function canBrowseDb(index: unknown, declared: readonly number[], reported: readonly number[]): boolean;
export interface KeyspaceRefusal {
    readonly ok: false;
    readonly code: 'BAD_CURSOR' | 'BAD_PATTERN' | 'BAD_COUNT' | 'BAD_KEY' | 'UNEXPECTED_REPLY';
    readonly error: string;
}
/**
 * 一个「要拼进命令原文」的片段过不过得了判据。
 *
 * `what` 只影响文案（`key` / `匹配模式`）——判据是同一条：**解析层表达不出来的一律拒**。
 */
export declare function checkAddressable(value: unknown, options: {
    what: string;
    maxLength: number;
}): {
    ok: true;
    value: string;
} | KeyspaceRefusal;
/** `SCAN <cursor> [MATCH p] [COUNT n]` 的命令原文。缺省游标是 `0`（从头扫）。 */
export declare function scanCommand(input: {
    cursor?: unknown;
    match?: unknown;
    count?: unknown;
}): {
    ok: true;
    command: string;
} | KeyspaceRefusal;
/** `SCAN` 的裸回复：`[游标, [key…]]`。认不出来就**拒**，不猜。 */
export declare function parseScanReply(reply: unknown): {
    ok: true;
    cursor: string;
    keys: readonly string[];
} | KeyspaceRefusal;
/**
 * `INFO keyspace` 的解析：**这台机器上有哪些库、各有多少 key**。
 *
 * 这是树里「库」那一层的真数字，而且**一条命令就够**（`INFO keyspace` 是允许的读；`CONFIG GET
 * databases` 被明确排除——`CONFIG` 在禁表里）。回复是文本：
 *
 * ```text
 * # Keyspace
 * db0:keys=105,expires=0,avg_ttl=0
 * db1:keys=3,expires=1,avg_ttl=0
 * ```
 *
 * 认不出的行**跳过**（不猜），一行都没认出来时返回空数组——「INFO 没给 keyspace 节」与
 * 「解析不了」是两件事，调用方按 `lines` / `parsed` 自己说清楚。
 */
export interface KeyspaceDbInfo {
    readonly index: number;
    readonly keys: number;
    readonly expires: number | null;
    readonly avgTtl: number | null;
}
export declare function parseInfoKeyspace(reply: unknown): {
    ok: true;
    dbs: readonly KeyspaceDbInfo[];
} | KeyspaceRefusal;
/** 一次「按本页统计类型」最多问几个 key（**写死**：它等于 N 次调用 + N 行审计）。 */
export declare const TYPE_BATCH_MAX = 50;
/**
 * 一次「读表格那一页的类型 / 大小 / 值 / TTL」最多问几个 key（**写死**）。
 *
 * 比 `TYPE_BATCH_MAX` 小得多，因为**每个 key 要 3~4 条命令**（`TYPE` + 元素数 / 字符串长度 +
 * 有界预览 + `TTL`）：20 个 key ≈ 80 次调用 / 80 行审计。界面按这个上限**分批**往下读，
 * 一边读一边把行填上——那正是这张表「像 Navicat」而**代价照样写在按钮上**的做法。
 */
export declare const ROW_BATCH_MAX = 20;
/** 一个 key 的预览形态（按 `TYPE` 的原话分派）。 */
export type KeyKind = 'string' | 'list' | 'hash' | 'set' | 'zset' | 'none' | 'other';
export declare function kindOf(type: string): KeyKind;
/**
 * 看一个 key 要发的命令（**除 `TYPE` / `TTL` 之外的那几条**）。
 *
 * `none`（key 不存在）与没做预览的类型都返回 `commands: []`——**不是错误**，界面上如实写一句。
 */
export declare function previewPlan(type: string, key: string): {
    readonly commands: readonly string[];
    readonly kind: KeyKind;
};
/** 元素数的单位——**给客户端的 token**，文案在 i18n 目录里（宿主不写界面话）。 */
export type TotalKind = 'bytes' | 'items' | 'fields' | 'members' | 'none';
export interface KeyspaceKeyView {
    readonly key: string;
    /** `TYPE` 的原话（`string` / `list` / … / `none` / 模块类型）。 */
    readonly type: string;
    readonly kind: KeyKind;
    /** `TTL` 的原话：秒数 / `-1`（无过期）/ `-2`（不存在）。**不加工**，语义是 Redis 的。 */
    readonly ttl: number | null;
    readonly total: number | null;
    readonly totalKind: TotalKind;
    /** 预览行；`null` = 这个类型没有做预览（不是「空」）。 */
    readonly rows: readonly (readonly string[])[] | null;
    readonly truncated: boolean;
}
/**
 * 把 `TYPE` / `TTL` / 元素数 / 预览四条回复整成一个 key 的视图。
 *
 * 预览的**截断判据**分两处：`list` / `zset` 是「元素数 > 取回的行数」，`hash` / `set` 是「`SCAN`
 * 的游标不是 `0`」（游标非 0 说明还有下一页），`string` 是「字节数 > 取回的字符数」。三处都写在这里，
 * 界面只管显示——**别让界面去猜有没有被截断**。
 */
export declare function shapeKeyView(input: {
    key: string;
    type: unknown;
    ttl: unknown;
    total: unknown;
    preview: unknown;
}): KeyspaceKeyView;
