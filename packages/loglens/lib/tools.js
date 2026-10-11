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
import { backendFor } from './backends/registry.js';
import { adapterHint, describeTarget, hintFor, resolveTarget, runFields, runSearch } from './execute.js';
import { normalizeQuery } from './query.js';
/*
 * 找来源 / 夹取 / 拼返回形状都在 src/execute.ts——agent 工具与面板路由共用那一层，避免两份会漂的
 * 真相源；这里只负责**注册**与**渲染**。下面这几个再导出一次，方便用例与调用方从一处取。
 */
export { adapterHint, describeTarget, hintFor, resolveTarget } from './execute.js';
export { backendFor } from './backends/registry.js';
/** 分类表：四个工具全是只读（查日志不改任何东西，也不在目标机上执行命令）。 */
export const LOGLENS_TIER_CLASS = {
    loglens_sources: 'read',
    loglens_search: 'read',
    loglens_fields: 'read',
    loglens_context: 'read',
};
/** 档位闸只认这些前缀（名单外一个都不碰）。 */
export const LOGLENS_TIER_PREFIXES = ['loglens_'];
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
                const hint = hintFor(target.kind, caps, { dockerLoaded: deps.dockerLoaded === undefined ? undefined : deps.dockerLoaded() });
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
        description: '查一个日志来源：返回归一化后的行 + 诚实的计数与截断信号。一次只查一个来源（v1 不做跨后端 fan-out）。'
            + '返回值里的时间戳一律 epoch 毫秒；**入参**的 from / to 还能写 ISO 8601 或 -30m 这类相对时间（省得自己算毫秒）。',
        parameters: {
            target: { type: 'string', description: '来源 id 或名称（loglens_sources 列出）；只有一个来源时可省略' },
            q: { type: 'string', description: '查询串（Loki 是 LogQL，ES / OpenSearch 是各自的方言）；留空即全量' },
            from: {
                description: '起始时间：epoch 毫秒整数、ISO 8601（不带时区按本机时区）或相对时间；缺省 = to 前面 15 分钟',
                oneOf: [
                    { type: 'number', description: 'epoch 毫秒整数，如 1760000000000（填成秒会报错）' },
                    { type: 'string', description: 'ISO 8601（2026-10-11T14:00:00Z）或相对时间（-30m / -2h / -1d）' },
                ],
            },
            to: {
                description: '结束时间，写法同 from；缺省取当前时刻（只给 to，「看最新日志」就够）。实际生效的时间窗见返回值 window',
                oneOf: [
                    { type: 'number', description: 'epoch 毫秒整数' },
                    { type: 'string', description: 'ISO 8601 或相对时间（-30m / now 等）' },
                ],
            },
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
            return await runSearch(deps, (args ?? {}));
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
            return await runFields(deps, (args ?? {}));
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