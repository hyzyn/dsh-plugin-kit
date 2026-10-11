/**
 * 优先键（点分路径）：**谁在写这行**。按这个顺序先占标签名额，剩下的才轮到文档里的其它字段。
 *
 * 顺序就是「排查时先问什么」：哪个容器 / 哪个 Pod → 哪台机器 → 哪个服务 → 哪个文件 → 什么流。
 * 名单刻意短：它在 LABEL_LIMIT 之内抢位置，多一个就挤掉一个真字段。
 */
export const LABEL_PRIORITY = [
    'container.name',
    'kubernetes.container.name',
    'kubernetes.pod.name',
    'host.name',
    'host.hostname',
    'service.name',
    'log.file.path',
    'log.logger',
    'stream',
    'kubernetes.namespace',
    'container.image.name',
    'kubernetes.node.name',
    // 采集器（filebeat 之类）**故意排在后面**：它整个集群都一样，是背景不是身份
    'agent.name',
    'cloud.instance.id',
];
/** 已经搬到显式字段上的键，不再进 labels（与后端里那份口径一致）。 */
export const CONSUMED_KEYS = ['@timestamp', 'timestamp', 'message', 'level', 'log.level'];
/** 单个标签值的长度上限：日志里一个字段可能是整段堆栈，labels 不是放它的地方（raw 里有全文）。 */
export const LABEL_VALUE_MAX = 160;
/** 展平时最多下钻几层：够覆盖 filebeat / k8s / ECS 的常规嵌套，不至于把整棵树摊开。 */
const MAX_DEPTH = 3;
function shortValue(value) {
    return value.length > LABEL_VALUE_MAX ? value.slice(0, LABEL_VALUE_MAX) + '…' : value;
}
/** 标量或「标量数组」→ 字符串；对象留给递归，其它（null / 嵌套数组）丢掉。 */
function scalarText(value) {
    if (typeof value === 'string')
        return value === '' ? undefined : shortValue(value);
    if (typeof value === 'number' || typeof value === 'boolean')
        return String(value);
    if (Array.isArray(value)) {
        const parts = [];
        for (const item of value) {
            if (typeof item !== 'string' && typeof item !== 'number' && typeof item !== 'boolean')
                continue;
            parts.push(String(item));
        }
        return parts.length === 0 ? undefined : shortValue(parts.join(','));
    }
    return undefined;
}
/**
 * 把一棵文档树摊成「点分路径 → 字符串」。**优先键先占位**，其余按文档顺序补到上限。
 *
 * 传进来的 source 不被改（返回的是新对象）。limit 是标签条数上限；优先键也超过上限时按名单顺序
 * 截断——宁可缺一个次要字段，也不让一行把整页撑爆。
 */
export function flattenLabels(source, options = {}) {
    const limit = options.limit === undefined ? 20 : options.limit;
    const priority = options.priority === undefined ? LABEL_PRIORITY : options.priority;
    const flat = {};
    const consumed = new Set(CONSUMED_KEYS);
    const walk = (node, prefix, depth) => {
        for (const [key, value] of Object.entries(node)) {
            const path = prefix === '' ? key : prefix + '.' + key;
            if (consumed.has(path))
                continue;
            const text = scalarText(value);
            if (text !== undefined) {
                flat[path] = text;
                continue;
            }
            if (depth < MAX_DEPTH && typeof value === 'object' && value !== null && !Array.isArray(value)) {
                walk(value, path, depth + 1);
            }
        }
    };
    walk(source, '', 0);
    const labels = {};
    for (const key of priority) {
        if (Object.keys(labels).length >= limit)
            break;
        const value = flat[key];
        if (value !== undefined)
            labels[key] = value;
    }
    for (const [key, value] of Object.entries(flat)) {
        if (Object.keys(labels).length >= limit)
            break;
        if (labels[key] !== undefined)
            continue;
        labels[key] = value;
    }
    return labels;
}
/** 严重度排序：level=warn 是「warn 及以上」，这是日志查看器的通行语义。 */
const SEVERITY = { trace: 0, debug: 1, info: 2, warn: 3, error: 4, fatal: 5 };
/** 级别参数的合法取值（工具 schema 与文案都取它）。 */
export const CANONICAL_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
/** 各家写法 → 归一化级别（logback / python / syslog / ECS 都在里面）。 */
const LEVEL_ALIASES = {
    trace: 'trace', verbose: 'trace',
    debug: 'debug', dbg: 'debug', fine: 'debug',
    info: 'info', information: 'info', notice: 'info',
    warn: 'warn', warning: 'warn',
    error: 'error', err: 'error', severe: 'error',
    fatal: 'fatal', critical: 'fatal', crit: 'fatal', alert: 'fatal', emergency: 'fatal', panic: 'fatal',
};
/** 任意写法 → 归一化级别；认不出就是 undefined（**不猜**）。 */
export function canonicalLevel(raw) {
    if (typeof raw !== 'string')
        return undefined;
    const key = raw.trim().toLowerCase();
    return LEVEL_ALIASES[key];
}
/**
 * 这个级别算不算「够严重」。undefined（行上没有级别）**不算命中**：不能把「不知道」当成「是 error」。
 *
 * 语义是**及以上**：问 level=warn 得到 warn + error + fatal——这是日志查看器的通行口径，
 * 也是排查时真正的意思（「把值得看的都给我」）。
 */
export function levelMatches(actual, wanted) {
    const mine = canonicalLevel(actual);
    if (mine === undefined)
        return false;
    return SEVERITY[mine] >= SEVERITY[wanted];
}
/** 级别文案（工具与 README 共用）：warn 的意思是 warn 及以上。 */
export function levelHint(wanted) {
    return wanted === 'fatal' ? 'fatal' : wanted + ' 及以上';
}
/*
 * 推断的正则（按顺序试，第一条命中就停）。**刻意只在「级别该出现的位置」找**：
 * 正文里恰好有 ERROR 这个词（如 logback 的 Propagating ERROR level on Logger[...]）不算——
 * 那类噪声正是用户点名不要的。
 */
const LEVEL_PATTERNS = [
    /^\[(TRACE|DEBUG|INFO|NOTICE|WARN|WARNING|ERROR|ERR|FATAL|CRITICAL|SEVERE)\s*\]/iu,
    /(?:^|[\s,{"'])(?:level|severity|lvl)["']?\s*[=:]\s*["']?([A-Za-z]+)/iu,
    /^(TRACE|DEBUG|INFO|NOTICE|WARN|WARNING|ERROR|ERR|FATAL|CRITICAL|SEVERE)\b/u,
    /\d{2}:\d{2}:\d{2}[.,]\d{3}\s+(TRACE|DEBUG|INFO|WARN|ERROR)\s/u,
    /^(TRACE|DEBUG|INFO|WARN|ERROR)\s+\d{4}-\d{2}-\d{2}/u,
];
/**
 * 从正文推断级别。测的形态都是真机里出现过的：方括号包着的断语、level=ERROR、
 * ERROR 开头的行、以及 logback 的 14:00:00.123 ERROR 12345 --- [main] 这种。
 */
export function inferLevel(message) {
    const text = message.length > 400 ? message.slice(0, 400) : message;
    for (const pattern of LEVEL_PATTERNS) {
        const matched = pattern.exec(text);
        if (matched === null)
            continue;
        const level = canonicalLevel(matched[1]);
        if (level !== undefined)
            return level;
    }
    return undefined;
}
/**
 * 给一行补级别：**文档 / 流标签里有就用它，没有才从正文推断**，并标出级别是推断来的。
 *
 * 为什么要标：level 是筛选项，而「文档说它是 error」与「我从正文看着像 error」是两种可信度——
 * 契约里不许把后者写成前者（与 totalKnown 同一口径）。
 */
export function withLevel(line, candidates) {
    for (const candidate of candidates) {
        const level = canonicalLevel(candidate);
        if (level !== undefined)
            return { ...line, level };
    }
    const guessed = inferLevel(line.message);
    if (guessed === undefined)
        return line;
    return { ...line, level: guessed, levelInferred: true };
}
//# sourceMappingURL=line.js.map