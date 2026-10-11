/**
 * @hyzyn/dsh-loglens — agent 工具（P3）。
 *
 * 四个工具，**全部归 read 档**（名单在 LOGLENS_TIER_CLASS，闸门接线在 src/index.ts；对账守卫在
 * test/tier-gate.test.ts，从本文件注册处的 add() 调用（字面量工具名）现算名单——漏分类会红；注释里别写那种字面量）。
 *
 * 三条贯穿全文件的规矩：
 *   1. **一次一个来源**：v1 不做跨后端 fan-out（设计 §1 非目标）。省略 target 只在「恰好一个来源」
 *      时回落，多个来源时把候选名列出来让人/模型自己选。
 *   2. **没有适配器就说清楚怎么绕**：docker 走现成的 docker_logs / docker_logs_grep（选项 0），
 *      ES / OpenSearch 还没有适配器（P4）——别回一句「不支持」把路堵死。
 *   3. **诚实的截断信号**：来源不支持游标时只报 `hit_limit` + 一句「命中可能不完整，请缩小时间窗」，
 *      不给会丢行的游标（判据在 src/backends/loki.ts 的 LOKI_PAGINATION 与设计 §3.3）。
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { createElasticBackend } from './backends/elastic.js';
import { createLokiBackend } from './backends/loki.js';
import { normalizeQuery } from './query.js';
/** 分类表：四个工具全是只读（查日志不改任何东西，也不在目标机上执行命令）。 */
export const LOGLENS_TIER_CLASS = {
    loglens_sources: 'read',
    loglens_search: 'read',
    loglens_fields: 'read',
    loglens_context: 'read',
};
/** 档位闸只认这些前缀（名单外一个都不碰）。 */
export const LOGLENS_TIER_PREFIXES = ['loglens_'];
const LOKI_BACKEND = createLokiBackend();
const ELASTIC_BACKEND = createElasticBackend({ flavor: 'es' });
const OPENSEARCH_BACKEND = createElasticBackend({ flavor: 'os' });
/**
 * 后端注册表：Loki · Elasticsearch · OpenSearch 三家。
 * **Docker 刻意不进这里**：它是采集来源，走选项 0（现成的 docker_logs / docker_logs_grep），
 * 包一层只会造出第二份口径（设计 §5）。
 */
export function backendFor(kind) {
    if (kind === 'loki')
        return LOKI_BACKEND;
    if (kind === 'elasticsearch')
        return ELASTIC_BACKEND;
    if (kind === 'opensearch')
        return OPENSEARCH_BACKEND;
    return undefined;
}
/** 没有适配器时的指路文案：说清「怎么绕」，而不是一句「不支持」。 */
export function adapterHint(kind) {
    if (kind === 'docker') {
        return 'Docker 是采集来源（设计 §5 选项 0）：agent 侧请用现成的 docker_logs / docker_logs_grep——本插件刻意不包一层';
    }
    return '来源类型 ' + kind + ' 没有适配器（本插件支持 loki / elasticsearch / opensearch；Docker 走现成的 docker_logs）';
}
/** 按 id 或名称找来源；省略时只在「恰好一个来源」时回落。 */
export function resolveTarget(config, wanted) {
    const targets = config.targets;
    if (targets.length === 0) {
        return { ok: false, error: '还没有配置任何日志来源：请到「设置 → 插件配置 → 日志查询」加一个' };
    }
    if (wanted === undefined || wanted === null || wanted === '') {
        if (targets.length === 1)
            return { ok: true, target: targets[0] };
        return { ok: false, error: 'target 必填（有 ' + String(targets.length) + ' 个来源）：' + targets.map((target) => target.id).join(' / ') };
    }
    if (typeof wanted !== 'string')
        return { ok: false, error: 'target 必须是来源 id 或名称' };
    const key = wanted.trim().toLowerCase();
    const exact = targets.find((target) => target.id.toLowerCase() === key);
    if (exact !== undefined)
        return { ok: true, target: exact };
    const byLabel = targets.filter((target) => target.label.toLowerCase() === key);
    if (byLabel.length === 1)
        return { ok: true, target: byLabel[0] };
    if (byLabel.length > 1) {
        return { ok: false, error: '名称「' + wanted + '」对应多个来源，请改用 id：' + byLabel.map((target) => target.id).join(' / ') };
    }
    return { ok: false, error: '找不到来源「' + wanted + '」：现有 ' + targets.map((target) => target.id).join(' / ') };
}
/** 目标的自述（工具返回值里统一用这一形状）。 */
function describeTarget(target) {
    return { id: target.id, kind: target.kind, label: target.label };
}
/** 一行的可读形式：时间用 ISO（人看日志时以本地时间为准，ISO UTC 至少不含糊）。 */
export function formatLine(line) {
    const labels = Object.keys(line.labels).length === 0
        ? ''
        : '  ' + Object.entries(line.labels).map(([key, value]) => key + '=' + value).join(' ');
    return new Date(line.ts).toISOString() + '  ' + line.message + labels;
}
export function renderLines(lines, markId) {
    if (lines.length === 0)
        return '（没有命中）';
    return lines.map((line) => (line.id === markId ? '→ ' : '  ') + formatLine(line)).join('\n');
}
/** 一行的输出 schema：与契约的 LogLine 同形（工具返回值与 render 都按它）。 */
const LINE_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        ts: { type: 'number', required: true },
        message: { type: 'string', required: true },
        level: { type: 'string' },
        source: { type: 'string', required: true },
        id: { type: 'string', required: true },
        labels: { type: 'object', additionalProperties: true, properties: {} },
        raw: { type: 'string', required: true },
    },
};
/** 计数的输出 schema：五个字段各占一格，语义不同的量不许挤进同一个数（设计 §3.2）。 */
const COUNT_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        returned: { type: 'number', required: true },
        matched: { type: 'number' },
        scannedRows: { type: 'number' },
        scannedBytes: { type: 'number' },
        totalKnown: { type: 'boolean', required: true },
    },
};
/**
 * 一条来源的指路文案（P5 的 agent 侧交付物）。
 *
 * 三条都不是「说明文」，是**会在返回值里出现的判据**：
 *   - docker：选项 0 的替代路径（现成的 docker_logs / docker_logs_grep），本插件不包一层；
 *   - 声明了 pagination:'none' 的来源（当前是 Loki）：被 limit 截断时只会报 hit_limit，得缩小时间窗；
 *   - ES / OpenSearch：分页走 PIT，游标有寿命，过期后要重新发起带时间窗的查询。
 *
 * **刻意不做**「探测 docker 插件在不在」：设计 §5 的「装了没装」判据是给**面板**用的（浏览器侧 registry
 * 存在性 + health），而宿主侧的工具注册表**没有公开的列举 API**（实测 @deepseek-ai/dsh-tools 0.1.2-rc.1
 * 的 ctx.tools 只有 register / restrict / guard）——猜一个私有字段去读，比不读更糟。
 */
export function hintFor(kind, caps) {
    if (kind === 'docker') {
        return 'Docker 是采集来源（选项 0）：agent 侧用现成的 docker_logs / docker_logs_grep，本插件不包一层';
    }
    if (caps === undefined)
        return undefined;
    if (caps.pagination === 'none') {
        return '这个来源目前不给游标：命中被 limit 截断时只报 hit_limit，请缩小时间窗分几次查';
    }
    if (caps.flavor === 'es' || caps.flavor === 'os') {
        return '分页走 PIT：游标有寿命，过期后要重新发起一次带时间窗的查询';
    }
    return undefined;
}
export function registerLoglensTools(deps) {
    const add = deps.add;
    add('loglens_sources', defineTool({
        name: 'loglens_sources',
        // 只读：与其他只读工具并发执行（宿主默认把未声明的工具当独占）
        isConcurrencySafe: () => true,
        description: '列出已配置的日志来源（类型 / 名称 / 地址 / 查询方言 / 分页能力），可选探测连通性。其他 loglens_* 工具的 target 参数取自这里。',
        parameters: {
            probe: { type: 'boolean', description: 'true 时逐个探测来源（Loki 是 /ready）；远端来源会建连接，慢一些' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    targets: {
                        type: 'array',
                        required: true,
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                id: { type: 'string', required: true },
                                kind: { type: 'string', required: true },
                                label: { type: 'string', required: true },
                                url: { type: 'string', required: true },
                                adapter: { type: 'string', required: true },
                                queryLanguage: { type: 'string' },
                                pagination: { type: 'string' },
                                follow: { type: 'boolean' },
                                ok: { type: 'boolean' },
                                error: { type: 'string' },
                                hint: { type: 'string' },
                            },
                        },
                    },
                },
            },
            render: (_args, value) => {
                const rows = value.targets ?? [];
                if (rows.length === 0)
                    return [{ type: 'text', text: '还没有配置任何日志来源（设置 → 插件配置 → 日志查询）。' }];
                const text = rows.map((row) => {
                    const head = String(row.id) + '（' + String(row.kind) + '）：' + String(row.label);
                    const health = row.ok === undefined ? '' : row.ok === true ? ' · 就绪' : ' · 不可用：' + String(row.error ?? '');
                    const tail = row.hint === undefined ? '' : '\n    → ' + String(row.hint);
                    return head + health + '\n    ' + String(row.url) + '\n    适配器：' + String(row.adapter) + (row.pagination === undefined ? '' : ' · 分页 ' + String(row.pagination)) + tail;
                }).join('\n');
                return [{ type: 'text', text }];
            },
        },
        async execute(args) {
            const input = (args ?? {});
            const config = deps.config();
            const rows = [];
            for (const target of config.targets) {
                const backend = deps.backendFor(target.kind);
                const caps = backend === undefined ? undefined : backend.capabilities();
                const row = {
                    id: target.id,
                    kind: target.kind,
                    label: target.label,
                    url: target.url,
                    adapter: backend === undefined ? adapterHint(target.kind) : backend.id,
                    ...(caps === undefined ? {} : { queryLanguage: caps.queryLanguage, pagination: caps.pagination, follow: caps.follow }),
                };
                if (input.probe === true && backend !== undefined) {
                    const health = await backend.health(target);
                    row.ok = health.ok;
                    if (!health.ok)
                        row.error = health.detail === undefined ? '未知错误' : health.detail;
                }
                const hint = hintFor(target.kind, caps);
                if (hint !== undefined)
                    row.hint = hint;
                rows.push(row);
            }
            return { targets: rows };
        },
    }));
    add('loglens_search', defineTool({
        name: 'loglens_search',
        isConcurrencySafe: () => true,
        description: '查一个日志来源：返回归一化后的行 + 诚实的计数与截断信号。一次只查一个来源（v1 不做跨后端 fan-out）。时间戳一律 epoch 毫秒。',
        parameters: {
            target: { type: 'string', description: '来源 id 或名称（loglens_sources 列出）；只有一个来源时可省略' },
            q: { type: 'string', description: '查询串（Loki 是 LogQL，ES / OpenSearch 是各自的方言）；留空即全量' },
            from: { type: 'number', description: '起始时间，epoch 毫秒（不是秒）' },
            to: { type: 'number', description: '结束时间，epoch 毫秒；缺省取当前时刻' },
            limit: { type: 'number', description: '返回条数上限（默认 100）；超过来源单页上限会被夹取，warnings 里会说明' },
            direction: { type: 'string', description: 'forward（旧的在前）或 backward（新的在前，默认）' },
            cursor: { type: 'string', description: '上一页返回的 nextCursor；来源声明 pagination=none 时不会有它' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    target: { type: 'object', required: true, additionalProperties: false, properties: { id: { type: 'string', required: true }, kind: { type: 'string', required: true }, label: { type: 'string', required: true } } },
                    window: { type: 'object', required: true, additionalProperties: false, properties: { from: { type: 'number', required: true }, to: { type: 'number', required: true } } },
                    returned: { type: 'number', required: true },
                    counts: { ...COUNT_SCHEMA, required: true },
                    truncation: { type: 'object', required: true, additionalProperties: false, properties: { truncated: { type: 'boolean', required: true }, reasons: { type: 'array', required: true, items: { type: 'string' } } } },
                    lines: { type: 'array', required: true, items: LINE_SCHEMA },
                    nextCursor: { type: 'string' },
                    warnings: { type: 'array', required: true, items: { type: 'string' } },
                    hint: { type: 'string' },
                },
            },
            render: (_args, value) => {
                const result = value;
                const lines = result.lines === undefined ? [] : result.lines;
                const head = '返回 ' + String(result.returned) + ' 行' + (result.counts?.scannedRows === undefined ? '' : '，扫描 ' + String(result.counts.scannedRows) + ' 行') + (result.truncation?.truncated === true ? '（截断：' + (result.truncation.reasons ?? []).join(' / ') + '）' : '');
                const tail = [result.hint === undefined ? '' : result.hint, ...(result.warnings ?? [])].filter((item) => item !== '');
                return [{ type: 'text', text: [head, renderLines(lines), ...tail].join('\n') }];
            },
        },
        async execute(args) {
            const input = (args ?? {});
            const picked = resolveTarget(deps.config(), input.target);
            if (!picked.ok)
                throw new Error(picked.error);
            const backend = deps.backendFor(picked.target.kind);
            if (backend === undefined)
                throw new Error(adapterHint(picked.target.kind));
            const caps = backend.capabilities();
            const normalized = normalizeQuery({
                targetId: picked.target.id,
                q: input.q,
                from: input.from,
                to: input.to,
                limit: input.limit,
                direction: input.direction,
                cursor: input.cursor,
            }, caps);
            if (!normalized.ok)
                throw new Error(normalized.error);
            const result = await backend.query(normalized.query, picked.target);
            const reasons = result.truncation.reasons;
            const limited = reasons.includes('hit_limit');
            const hint = reasons.includes('cursor_expired')
                ? '游标已过期（PIT 有寿命）：请重新发起一次带时间窗的查询，不要接着用这个游标'
                : limited && caps.pagination === 'none'
                    ? '这个来源不支持游标，命中可能不完整：请缩小时间窗（或把 limit 调小后分段查）'
                    : undefined;
            return {
                target: describeTarget(picked.target),
                window: { from: normalized.query.from, to: normalized.query.to },
                returned: result.counts.returned,
                counts: result.counts,
                truncation: result.truncation,
                lines: result.lines,
                ...(result.nextCursor === undefined ? {} : { nextCursor: result.nextCursor }),
                warnings: normalized.warnings,
                ...(hint === undefined ? {} : { hint }),
            };
        },
    }));
    add('loglens_fields', defineTool({
        name: 'loglens_fields',
        isConcurrencySafe: () => true,
        description: '列出一个日志来源可用的字段 / 标签（Loki 走 /loki/api/v1/labels）。做 loglens_search 之前先看一眼有哪些字段可筛。',
        parameters: {
            target: { type: 'string', description: '来源 id 或名称（loglens_sources 列出）；只有一个来源时可省略' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    target: { type: 'object', required: true, additionalProperties: false, properties: { id: { type: 'string', required: true }, kind: { type: 'string', required: true }, label: { type: 'string', required: true } } },
                    fields: {
                        type: 'array',
                        required: true,
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                name: { type: 'string', required: true },
                                kind: { type: 'string', required: true },
                                label: { type: 'string' },
                            },
                        },
                    },
                },
            },
            render: (_args, value) => {
                const fields = value.fields ?? [];
                if (fields.length === 0)
                    return [{ type: 'text', text: '这个来源没有报告任何字段。' }];
                return [{ type: 'text', text: fields.map((field) => field.name + '（' + field.kind + '）').join('\n') }];
            },
        },
        async execute(args) {
            const input = (args ?? {});
            const picked = resolveTarget(deps.config(), input.target);
            if (!picked.ok)
                throw new Error(picked.error);
            const backend = deps.backendFor(picked.target.kind);
            if (backend === undefined)
                throw new Error(adapterHint(picked.target.kind));
            return { target: describeTarget(picked.target), fields: await backend.fields(picked.target) };
        },
    }));
    add('loglens_context', defineTool({
        name: 'loglens_context',
        isConcurrencySafe: () => true,
        description: '取某一行的上下文：拿 loglens_search 返回的 ts（+ id 或 message）回到来源重查一遍，返回它前后各若干行（时间升序）。三个后端都没有原生的「某行前后 N 行」，所以这是重查，不是缓存。',
        parameters: {
            target: { type: 'string', description: '来源 id 或名称（loglens_sources 列出）；只有一个来源时可省略' },
            ts: { type: 'number', description: '锚点行的时间，epoch 毫秒（loglens_search 的 lines[].ts）' },
            id: { type: 'string', description: '锚点行的 id（loglens_search 的 lines[].id）；给了它就用它精确定位' },
            message: { type: 'string', description: '锚点行的正文（没有 id 时配合 ts 一起定位）' },
            before: { type: 'number', description: '要几行更早的（默认 5，上限 50）' },
            after: { type: 'number', description: '要几行更晚的（默认 5，上限 50）' },
            spanMs: { type: 'number', description: '重查的时间窗半径（默认 60000，即锚点前后各一分钟）' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    target: { type: 'object', required: true, additionalProperties: false, properties: { id: { type: 'string', required: true }, kind: { type: 'string', required: true }, label: { type: 'string', required: true } } },
                    anchor: { ...LINE_SCHEMA, required: true },
                    before: { type: 'array', required: true, items: LINE_SCHEMA },
                    after: { type: 'array', required: true, items: LINE_SCHEMA },
                    warnings: { type: 'array', required: true, items: { type: 'string' } },
                },
            },
            render: (_args, value) => {
                const result = value;
                const anchor = result.anchor;
                if (anchor === undefined)
                    return [{ type: 'text', text: '（没有锚点行）' }];
                return [{
                        type: 'text',
                        text: [
                            '…更早 ' + String((result.before ?? []).length) + ' 行',
                            renderLines(result.before ?? []),
                            '→ ' + formatLine(anchor),
                            renderLines(result.after ?? []),
                            '…更晚 ' + String((result.after ?? []).length) + ' 行',
                            ...(result.warnings ?? []),
                        ].join('\n'),
                    }];
            },
        },
        async execute(args) {
            const input = (args ?? {});
            const picked = resolveTarget(deps.config(), input.target);
            if (!picked.ok)
                throw new Error(picked.error);
            const backend = deps.backendFor(picked.target.kind);
            if (backend === undefined)
                throw new Error(adapterHint(picked.target.kind));
            if (typeof input.ts !== 'number' || !Number.isInteger(input.ts)) {
                throw new Error('ts 必填：锚点行的时间（epoch 毫秒，取自 loglens_search 的 lines[].ts）');
            }
            const anchorTs = input.ts;
            const before = clampCount(input.before, 5);
            const after = clampCount(input.after, 5);
            const spanMs = typeof input.spanMs === 'number' && Number.isInteger(input.spanMs) && input.spanMs > 0 ? input.spanMs : 60_000;
            const normalized = normalizeQuery({
                targetId: picked.target.id,
                from: anchorTs - spanMs,
                to: anchorTs + spanMs,
                limit: before + after + 1,
                direction: 'backward',
            }, backend.capabilities());
            if (!normalized.ok)
                throw new Error(normalized.error);
            const result = await backend.query(normalized.query, picked.target);
            const lines = result.lines;
            const wantedId = typeof input.id === 'string' && input.id !== '' ? input.id : undefined;
            const wantedMessage = typeof input.message === 'string' && input.message !== '' ? input.message : undefined;
            let index = -1;
            if (wantedId !== undefined)
                index = lines.findIndex((line) => line.id === wantedId);
            if (index === -1 && wantedMessage !== undefined)
                index = lines.findIndex((line) => line.ts === anchorTs && line.message === wantedMessage);
            if (index === -1)
                index = lines.findIndex((line) => line.ts === anchorTs);
            if (index === -1) {
                throw new Error('锚点行没在这次重查里返回：可能已被来源的保留期截掉，或时间窗太窄（把 spanMs 调大再试）');
            }
            const anchor = lines[index];
            // lines 是 backward（新的在前）：比锚点更早的在 index 之后，更晚的在 index 之前。两侧都按时间升序返回，读起来跟日志文件一样。
            const older = lines.slice(index + 1, index + 1 + before).reverse();
            const newer = lines.slice(Math.max(0, index - after), index).reverse();
            return { target: describeTarget(picked.target), anchor, before: older, after: newer, warnings: normalized.warnings };
        },
    }));
}
/** before / after 的夹取（0~50，缺省 5）：负数或非整数一律回落缺省值。 */
export function clampCount(value, fallback) {
    if (typeof value !== 'number' || !Number.isInteger(value))
        return fallback;
    if (value < 0)
        return 0;
    return value > 50 ? 50 : value;
}
//# sourceMappingURL=tools.js.map