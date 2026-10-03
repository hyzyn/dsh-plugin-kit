/**
 * Redis 命令解析：把「某一族动作」落到**具体哪条命令**上。
 *
 * ## 为什么这一档比 SQL 更需要解析层
 *
 * SQL 档有**库账号**兜底——代码写错也翻不了车。**Redis 没有只读账号这回事**：
 * 一条连接就是读写同权，「受限」只能靠命令白名单。所以这一层的漏判**没有第二层网**，
 * 它自己就是那道网。
 *
 * 矩阵（`operations.ts`）管的是「这一族允不允许」（`get` 允许、`keys` 要单独授权、`set` 要写授权），
 * 本模块管的是「这条具体命令属于哪一族、它动的是哪个 key」。
 *
 * ## 三条判据
 *
 * 1. **未登记的命令一律拒**（与 SQL 侧同一条口径）——不认识的命令被放行就是一条没被审过的路径；
 * 2. **`SCAN` 的 `COUNT` 只能收紧**：候选可以请求更小，请求更大被夹回策略上限。
 *    理由与行数上限相同——`SCAN` 是这一档唯一的遍历手段（`KEYS` 被单独授权），
 *    而一次 `COUNT 1000000` 等于把整个键空间拖进上下文；
 * 3. **写操作要说清「改的是哪个 key」**：`write-scoped` 必须解析出目标 key，
 *    解析不出来就拒——审计里写不出「改了什么」的写操作不该放行。
 *
 * ## 一处刻意的严格
 *
 * `INFO everything` / `INFO ALL` 归为**危险读**（它把全部节一次吐出，包含客户端与命令统计），
 * 而单个节（`INFO memory`）是普通读。同一个命令按参数分档，这在 Redis 侧是常态。
 */
/** 只读命令族。 */
const READ_COMMANDS = new Set([
    'GET', 'MGET', 'STRLEN', 'GETRANGE', 'SUBSTR',
    'HGET', 'HMGET', 'HGETALL', 'HKEYS', 'HVALS', 'HLEN', 'HEXISTS', 'HSTRLEN', 'HRANDFIELD',
    'LRANGE', 'LLEN', 'LINDEX', 'LPOS',
    'SMEMBERS', 'SCARD', 'SISMEMBER', 'SMISMEMBER', 'SRANDMEMBER',
    'ZRANGE', 'ZRANGEBYSCORE', 'ZREVRANGE', 'ZRANGEBYLEX', 'ZSCORE', 'ZCARD', 'ZRANK', 'ZREVRANK', 'ZCOUNT', 'ZMSCORE',
    'TYPE', 'TTL', 'PTTL', 'EXISTS', 'TOUCH', 'DUMP',
    'SCAN', 'HSCAN', 'SSCAN', 'ZSCAN',
    'INFO', 'DBSIZE', 'MEMORY', 'OBJECT', 'PING', 'ECHO', 'COMMAND', 'TIME', 'LASTSAVE', 'SLOWLOG',
]);
/** 受限写命令族。 */
const WRITE_COMMANDS = new Set([
    'SET', 'SETNX', 'SETEX', 'PSETEX', 'MSET', 'MSETNX', 'APPEND', 'SETRANGE', 'INCR', 'DECR', 'INCRBY', 'DECRBY', 'INCRBYFLOAT', 'GETSET', 'GETDEL', 'GETEX',
    'HSET', 'HMSET', 'HSETNX', 'HINCRBY', 'HINCRBYFLOAT', 'HDEL',
    'LPUSH', 'RPUSH', 'LPUSHX', 'RPUSHX', 'LPOP', 'RPOP', 'LSET', 'LREM', 'LTRIM', 'LINSERT', 'RPOPLPUSH', 'LMOVE',
    'SADD', 'SREM', 'SPOP', 'SMOVE', 'SINTERSTORE', 'SUNIONSTORE', 'SDIFFSTORE',
    'ZADD', 'ZREM', 'ZINCRBY', 'ZREMRANGEBYRANK', 'ZREMRANGEBYSCORE', 'ZREMRANGEBYLEX', 'ZPOPMIN', 'ZPOPMAX',
    'DEL', 'UNLINK', 'EXPIRE', 'PEXPIRE', 'EXPIREAT', 'PEXPIREAT', 'PERSIST', 'RENAME', 'RENAMENX',
]);
/**
 * **不提供入口**的命令（与矩阵的 `never` 对应）。
 *
 * 这里再列一份不是重复：矩阵的 `never` 是「动作名」层面的（`eval` / `flushall`），
 * 而本模块要在**命令名**层面拦住它们——包括那些没有独立动作名、只作为参数存在的形式
 * （`MULTI` / `EXEC` / `SUBSCRIBE` 之类）。
 */
const FORBIDDEN_COMMANDS = new Set([
    'FLUSHDB', 'FLUSHALL', 'EVAL', 'EVALSHA', 'SCRIPT', 'FCALL', 'FCALL_RO', 'FUNCTION',
    'CONFIG', 'REPLICAOF', 'SLAVEOF', 'SHUTDOWN', 'DEBUG', 'MIGRATE', 'RESTORE', 'SWAPDB',
    'MULTI', 'EXEC', 'DISCARD', 'WATCH', 'UNWATCH', 'SUBSCRIBE', 'PSUBSCRIBE', 'PUBLISH', 'SPUBLISH',
    'CLIENT', 'CLUSTER', 'ACL', 'MODULE', 'MONITOR-KILL', 'SAVE', 'BGSAVE', 'BGREWRITEAOF',
]);
/** 需要单独授权的危险读。 */
const DANGEROUS_READ_COMMANDS = new Set(['KEYS', 'MONITOR']);
/** `SCAN` 族命令（第 1 个参数是游标，`COUNT` 要给上限）。 */
const SCAN_COMMANDS = new Set(['SCAN', 'HSCAN', 'SSCAN', 'ZSCAN']);
/** 写命令里「第 n 个参数是 key」的偏移（多数是第 1 个）。 */
const KEY_POSITION = {
    // 默认第 1 个；多 key 命令取第一个作为「影响面代表」。
    MSET: 1, MSETNX: 1, DEL: 1, UNLINK: 1,
    RENAME: 1, RENAMENX: 1, SMOVE: 1, RPOPLPUSH: 1, LMOVE: 1,
};
/** `SCAN` 的 COUNT 下限 / 默认策略上限。 */
const SCAN_COUNT_MIN = 1;
/** 归一化命令名：去空白、大写、`COMMAND` 前缀形式（`COMMAND GETKEYS` → `COMMAND`）。 */
function normalizeName(token) {
    return token.trim().toUpperCase();
}
/**
 * 解析一条 Redis 命令（**纯字符串处理，不连任何东西**）。
 *
 * @param raw - 命令原文（如 `GET user:1`）
 * @param maxScanCount - `SCAN` 族 `COUNT` 的策略上限；候选只能请求更小
 */
/**
 * 命令原文 → argv（**唯一的切分实现**）。
 *
 * 执行器也要切同一份原文（内核把 `raw` 交给它，而不是把解析结果塞给它——那会改内核契约）。
 * 两处各写一个切分就是**两个解析器**，而它们迟早会漂：以后若支持引号包裹的参数
 * （`SET k "a b"`），只改一边就会出现「裁决时按 3 段、执行时按 4 段」这种最难查的错位。
 */
export function redisArgv(raw) {
    return raw.trim().split(/\s+/);
}
export function parseRedisCommand(raw, maxScanCount) {
    if (typeof raw !== 'string' || raw.trim() === '') {
        return { ok: false, reason: 'EMPTY', hint: '给一条 Redis 命令，如 `GET key` 或 `SCAN 0 MATCH user:* COUNT 50`' };
    }
    const tokens = redisArgv(raw);
    const name = normalizeName(tokens[0]);
    const args = tokens.slice(1);
    if (FORBIDDEN_COMMANDS.has(name)) {
        return {
            ok: false,
            reason: 'FORBIDDEN_COMMAND',
            detail: name,
            hint: `${name} 被明确排除在设计之外（不可逆 / 影响他人 / 等于交出代码执行权），本套件不提供入口`,
        };
    }
    if (SCAN_COMMANDS.has(name)) {
        return parseScan(name, args, maxScanCount);
    }
    if (DANGEROUS_READ_COMMANDS.has(name)) {
        return {
            ok: true,
            command: { name, args, kind: 'read-dangerous', note: `${name} 阻塞或范围无界，需单独授权` },
        };
    }
    if (READ_COMMANDS.has(name)) {
        // `INFO ALL` / `INFO everything` 把全部节一次吐出（含客户端与命令统计），按危险读对待；
        // 单个节（`INFO memory`）是普通读。**同一个命令按参数分档**在 Redis 侧是常态。
        if (name === 'INFO') {
            const section = (args[0] ?? '').toUpperCase();
            if (section === 'ALL' || section === 'EVERYTHING') {
                return {
                    ok: true,
                    command: { name, args, kind: 'read-dangerous', note: 'INFO ALL 一次吐出全部节，需单独授权' },
                };
            }
        }
        const key = keyOf(name, args);
        return {
            ok: true,
            command: key === undefined ? { name, args, kind: 'read' } : { name, args, kind: 'read', key },
        };
    }
    if (WRITE_COMMANDS.has(name)) {
        const key = keyOf(name, args);
        if (key === undefined) {
            return {
                ok: false,
                reason: 'KEY_REQUIRED',
                detail: name,
                hint: `${name} 是写命令但解析不出目标 key：审计里写不出「改了什么」的写操作不放行`,
            };
        }
        return { ok: true, command: { name, args, kind: 'write-scoped', key } };
    }
    // **不认识的命令一律拒**——不认识的命令被放行就是一条没被审过的路径。
    return {
        ok: false,
        reason: 'UNKNOWN_COMMAND',
        detail: name,
        hint: `${name} 未登记在 Redis 命令白名单里，一律拒绝；请改用已支持的读命令（GET / HGETALL / SCAN …）`,
    };
}
/** 取写命令的目标 key：多数命令 key 在第 1 个参数；多 key 命令取第一个作为影响面代表。 */
function keyOf(name, args) {
    const position = KEY_POSITION[name] ?? 1;
    const key = args[position - 1];
    if (typeof key !== 'string' || key === '')
        return undefined;
    return key;
}
/**
 * 解析 `SCAN` 族：归一化游标 + 夹紧 `COUNT`。
 *
 * 参数布局**两种**（容易写错，用例钉住了）：
 *   - `SCAN cursor [MATCH p] [COUNT n]` —— 光标在第 1 个参数，**没有 key**；
 *   - `HSCAN key cursor …` / `SSCAN` / `ZSCAN` —— **key 在第 1 个参数**，光标在第 2 个。
 */
function parseScan(name, args, maxScanCount) {
    const isScoped = name !== 'SCAN';
    const cursorIndex = isScoped ? 1 : 0;
    if (args.length <= cursorIndex) {
        return {
            ok: false,
            reason: 'KEY_REQUIRED',
            detail: name,
            hint: isScoped ? `${name} 需要 key 与游标（如 \`${name} mykey 0\`）` : `${name} 需要游标（如 \`${name} 0\`）`,
        };
    }
    const cursor = args[cursorIndex];
    if (!/^\d+$/.test(cursor)) {
        return {
            ok: false,
            reason: 'KEY_REQUIRED',
            detail: name,
            hint: isScoped
                ? `${name} 的第 2 个参数必须是数字游标（第 1 个是 key）`
                : `${name} 的游标必须是数字（如 \`${name} 0\`）`,
        };
    }
    const explicit = readCount(args);
    const policy = policyCap(maxScanCount);
    const count = explicit === undefined ? undefined : Math.max(SCAN_COUNT_MIN, Math.min(policy, explicit));
    const key = isScoped ? args[0] : undefined;
    return {
        ok: true,
        command: {
            name,
            args,
            kind: 'read',
            ...(key === undefined || key === '' ? {} : { key }),
            ...(count === undefined ? {} : { count }),
            ...(explicit !== undefined && explicit > policy
                ? { note: `COUNT 从 ${String(explicit)} 夹到策略上限 ${String(policy)}（候选只能请求更小）` }
                : {}),
        },
    };
}
/** 从参数里读 `COUNT n`（大小写不敏感）。 */
function readCount(args) {
    for (let i = 0; i < args.length - 1; i += 1) {
        if (/^count$/i.test(args[i])) {
            const value = Number.parseInt(args[i + 1], 10);
            return Number.isFinite(value) ? value : undefined;
        }
    }
    return undefined;
}
/** 策略上限归一：非法值收紧到 1（最小可用），不让「配置坏了」变成「无上限」。 */
function policyCap(maxScanCount) {
    if (!Number.isFinite(maxScanCount) || maxScanCount < SCAN_COUNT_MIN)
        return SCAN_COUNT_MIN;
    return Math.floor(maxScanCount);
}
/**
 * 把解析结果映射到矩阵里的**动作名**（供裁决层用）。
 *
 * 三条映射口径：
 *   - `get` / `search` / `info` 是**族名**，一条命令落到哪一族由命令名定（`SCAN` 族 → `search`）；
 *   - 危险读落到矩阵里**同名**的动作（`KEYS` → `keys`、`MONITOR` → `monitor`），
 *     这样闸门按动作取能力规格，与用户在目标上配的东西对得上；
 *   - 写命令按可逆性分组（删除 → `del`、改 TTL → `expire`、其余 → `set`）。
 */
export function actionOf(command) {
    if (command.kind === 'read') {
        if (command.name === 'SCAN' || command.name === 'HSCAN' || command.name === 'SSCAN' || command.name === 'ZSCAN')
            return 'search';
        if (command.name === 'INFO' || command.name === 'DBSIZE' || command.name === 'MEMORY' || command.name === 'SLOWLOG')
            return 'info';
        return 'get';
    }
    if (command.kind === 'read-dangerous') {
        if (command.name === 'KEYS')
            return 'keys';
        if (command.name === 'MONITOR')
            return 'monitor';
        return 'info';
    }
    if (command.kind === 'write-scoped') {
        if (command.name === 'DEL' || command.name === 'UNLINK')
            return 'del';
        if (command.name === 'EXPIRE' ||
            command.name === 'PEXPIRE' ||
            command.name === 'EXPIREAT' ||
            command.name === 'PEXPIREAT' ||
            command.name === 'PERSIST') {
            return 'expire';
        }
        return 'set';
    }
    return command.name.toLowerCase();
}
/**
 * 把一条解析通过的命令转成结构化工具参数。
 *
 * ## 为什么执行器必须照着 `raw` 下发，而不是照这些字段重新拼
 *
 * 因为**审计的是原文，下发的是拼装结果**就是一条 TOCTOU 缝：解析层看过的字符串与真正执行的
 * 字符串成了两份，任何一处转义 / 归一化差异都可能让「审过的」与「跑了的」不是同一条命令
 * （`SET k "a b"` 这类带空格的参数尤其明显）。所以这里给的字段是**给裁决与审计用的上下文**，
 * 不是重建命令的配方。
 */
export function commandArgs(command, raw) {
    return {
        raw,
        ...(command.key === undefined ? {} : { key: command.key }),
        ...(command.count === undefined ? {} : { count: command.count }),
        ...(command.kind === 'write-scoped' && command.args.length > 1 ? { value: command.args[1] } : {}),
    };
}
//# sourceMappingURL=redis-command.js.map