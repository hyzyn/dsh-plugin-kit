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
import { adapterHint, describeTarget, facetsHint, hintFor, resolveTarget, runFacets, runFields, runSearch } from './execute.js';
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
    loglens_facets: 'read',
    loglens_context: 'read',
};
/** 档位闸只认这些前缀（名单外一个都不碰）。 */
export const LOGLENS_TIER_PREFIXES = ['loglens_'];
/**
 * 一行的可读形式：时间用 ISO（人看日志时以本地时间为准，ISO UTC 至少不含糊）+ 级别 + 正文 + 标签。
 *
 * 级别带个问号（`error?`）= 它是**从正文推断**的（文档里没有级别字段）：agent 据此决定
 * 「这条我能当级别用吗」。标签按 host / container 这类**谁写的**排在前面（src/line.ts 的优先键）。
 */
export function formatLine(line) {
    const level = line.level === undefined ? '' : line.level + (line.levelInferred === true ? '? ' : ' ');
    const labels = Object.keys(line.labels).length === 0
        ? ''
        : '  ' + Object.entries(line.labels).map(([key, value]) => key + '=' + value).join(' ');
    return new Date(line.ts).toISOString() + '  ' + level + line.message + labels;
}
export function renderLines(lines, markId) {
    if (lines.length === 0)
        return '（没有命中）';
    return lines.map((line) => (line.id === markId ? '→ ' : '  ') + formatLine(line)).join('\n');
}
/**
 * `loglens_fields` 的渲染文本（导出是为了能直接测：冲突标记这种东西不该只靠人肉看）。
 *
 * 两件事必须出现在文本里：
 * ① 一共多少个 / 是不是被截断（截断只在显式 limit 时才会发生）；
 * ② **每个类型冲突的字段逐个标出来**——同名在不同索引里类型不一致，拿它分组只会覆盖一部分索引，
 *    而候选里它的名字跟别人长得一模一样，不标就等于没说。
 */
export function renderFields(result) {
    const fields = result.fields ?? [];
    if (fields.length === 0)
        return '这个来源没有报告任何字段。';
    const head = '字段 ' + String(fields.length) + (result.total === undefined ? '' : ' / 共 ' + String(result.total)) + ' 个'
        + (result.truncated === true ? '（已截断）' : '');
    const body = fields.map((field) => (field.preferred === true ? '* ' : '  ') + field.name + '（' + field.kind
        + (field.conflict === true ? '，**类型冲突**：' + (field.esTypes ?? []).join(' / ') : '') + '）').join('\n');
    const conflictCount = fields.filter((field) => field.conflict === true).length;
    const tail = conflictCount === 0 ? [] : ['有 ' + String(conflictCount) + ' 个字段**类型冲突**（同名在不同索引里类型不一致）：'
            + '拿它分组或筛值可能只覆盖一部分索引，先按上面标出来的类型确认你要的是哪一种。'];
    return [head, body, ...tail, ...(result.warnings ?? [])].join('\n');
}
/** 一行的输出 schema：与契约的 LogLine 同形（工具返回值与 render 都按它）。 */
const LINE_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        ts: { type: 'number', required: true },
        message: { type: 'string', required: true },
        level: { type: 'string', description: '归一化级别（trace / debug / info / warn / error / fatal）' },
        levelInferred: { type: 'boolean', description: 'true = 级别是从正文推断的（文档里没有级别字段），不是来源自己标的' },
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
                                scope: { type: 'string', description: '这条来源覆盖的范围（ES / OpenSearch 是解析后的索引表达式；默认 *,-.* 表示全局且排除点号索引）' },
                                recent: {
                                    type: 'object',
                                    additionalProperties: false,
                                    description: 'probe 时数出来的「探测窗口内有多少条」',
                                    properties: { windowMs: { type: 'number', required: true }, count: { type: 'number', required: true } },
                                },
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
                    const recent = row.recent === undefined || typeof row.recent !== 'object'
                        ? ''
                        : '，最近 ' + String(Math.round(row.recent.windowMs / 60000)) + ' 分钟 ' + String(row.recent.count) + ' 条';
                    const scope = row.scope === undefined ? '' : '\n    范围：' + String(row.scope);
                    const tail = row.hint === undefined ? '' : '\n    → ' + String(row.hint);
                    return head + health + recent + '\n    ' + String(row.url) + scope + '\n    适配器：' + String(row.adapter) + (row.pagination === undefined ? '' : ' · 分页 ' + String(row.pagination)) + tail;
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
                    // 范围要回显：ES 的索引表达式可能来自配置、地址路径或默认通配，agent 猜不出来（真机反馈第 3 条）
                    ...(backend === undefined || backend.scope === undefined ? {} : { scope: backend.scope(target) }),
                };
                if (input.probe === true && backend !== undefined) {
                    const health = await backend.health(target);
                    row.ok = health.ok;
                    if (!health.ok)
                        row.error = health.detail === undefined ? '未知错误' : health.detail;
                    if (health.recent !== undefined)
                        row.recent = health.recent;
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
            filters: {
                type: 'object',
                additionalProperties: true,
                description: '结构化过滤：字段 → 值（如 {"container.name":"ems-service","log.level":"error"}）。'
                    + '**字段该不该带 .keyword 由适配器查 _field_caps 决定**，你不用管；是 text 且没有子字段时自动退回 match_phrase（近似匹配）。'
                    + 'Loki 不支持它（过滤写进 LogQL 的 {} 或过滤表达式）',
            },
            level: {
                type: 'string',
                description: '只要这个级别**及以上**的行（trace / debug / info / warn / error / fatal）。'
                    + '注意：级别可能是从正文推断的（lines[].levelInferred），且来源侧没有统一的级别字段——'
                    + '所以这是在**返回的这一页**上筛的，counts 仍是整页；要按级别看全量用 loglens_facets',
            },
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
                    level: { type: 'string', description: '生效的 level 过滤（回显）' },
                },
            },
            render: (_args, value) => {
                const result = value;
                const lines = result.lines === undefined ? [] : result.lines;
                const head = '返回 ' + String(result.returned) + ' 行' + (result.level === undefined ? '' : '（level ≥ ' + result.level + '）') + (result.counts?.scannedRows === undefined ? '' : '，扫描 ' + String(result.counts.scannedRows) + ' 行') + (result.truncation?.truncated === true ? '（截断：' + (result.truncation.reasons ?? []).join(' / ') + '）' : '');
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
        description: '列出一个日志来源可用的字段 / 标签（Loki 走 /loki/api/v1/labels；ES / OpenSearch 走 _field_caps）。'
            + '常用筛选项（container.name / host.name / log.level 这类）排在最前面，**默认不截断、列全部**'
            + '（与 Kibana 的 _field_caps 同口径：长度在那边交给界面，在这边交给调用方自己权衡）——'
            + '一台通配全集群的来源可能有上千个字段、响应几十 KB，只想确认某几个字段在不在就先传 limit 收窄，'
            + '或用 loglens_facets 看哪些字段真有数据。'
            + '传了 limit 才可能截断，那时返回值里的 total / truncated 与 warnings 会说明。'
            + '容器行（`object` / `nested`，如 `container` / `host` 这类没有自己值的父级）不列；'
            + '同名在不同索引里落到不同宽类型族的标 `conflict: true`（带 esTypes 与 conflictDescriptions）——'
            + '那种字段拿去分组或筛值可能只覆盖一部分索引。'
            + '字段名**不用带 .keyword**（子字段行也不列）：适配器会自己按 _field_caps 决定怎么打。',
        parameters: {
            target: { type: 'string', description: '来源 id 或名称（loglens_sources 列出）；只有一个来源时可省略' },
            limit: { type: 'number', description: '最多列几个字段（不传 = 全部；传了就只列前这么多，正整数，无硬上限）' },
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
                                preferred: { type: 'boolean', description: 'true = 常用筛选项（排在前面）' },
                                esTypes: { type: 'array', items: { type: 'string' }, description: '同名在不同索引里出现过的原生 ES 类型（只有多类型时才返回）' },
                                conflict: { type: 'boolean', description: 'true = 同名在不同索引里落到了不同的**宽类型族**（Kibana 的 type: conflict）；拿它分组 / 筛值可能只覆盖一部分索引' },
                                conflictDescriptions: { type: 'object', additionalProperties: true, properties: {}, description: '冲突时：每个原生类型各出现在哪些索引里' },
                            },
                        },
                    },
                    total: { type: 'number', required: true, description: '这个来源一共有多少字段（截断前；已去掉内部字段、.keyword 子行与 object/nested 容器行）' },
                    truncated: { type: 'boolean', required: true },
                    warnings: { type: 'array', required: true, items: { type: 'string' } },
                },
            },
            render: (_args, value) => [{ type: 'text', text: renderFields(value) }],
        },
        async execute(args) {
            return await runFields(deps, (args ?? {}));
        },
    }));
    add('loglens_facets', defineTool({
        name: 'loglens_facets',
        isConcurrencySafe: () => true,
        description: '聚合：按字段分组（terms）看「谁在报错」/  按时间分桶（date_histogram）看趋势。'
            + '这是回答「某个服务健不健康」的正确工具——拉一页行到本地数既慢又错。'
            + '返回里的 otherCount（没列出来的桶还有多少条）与 countErrorUpperBound（计数误差上界）是**截断与近似信号**，别当成精确值。'
            + '当前只有 ES / OpenSearch 有它。',
        parameters: {
            target: { type: 'string', description: '来源 id 或名称（loglens_sources 列出）；只有一个来源时可省略' },
            by: { type: 'string', description: '按这个字段分组（terms），如 container.name / host.name / log.level' },
            interval: { type: 'string', description: '按时间分桶（如 5m / 1h / 1d）；与 by 可以同时要' },
            q: { type: 'string', description: '查询串（先筛出要统计的那部分日志；留空即全量）' },
            filters: {
                type: 'object',
                additionalProperties: true,
                description: '结构化过滤：字段 → 值（与 loglens_search 同一口径）',
            },
            from: {
                description: '起始时间：epoch 毫秒整数 / ISO 8601 / 相对时间；缺省 = to 前面 15 分钟',
                oneOf: [
                    { type: 'number', description: 'epoch 毫秒整数' },
                    { type: 'string', description: 'ISO 8601 或相对时间（-30m / -2h）' },
                ],
            },
            to: {
                description: '结束时间，写法同 from；缺省取当前时刻',
                oneOf: [
                    { type: 'number', description: 'epoch 毫秒整数' },
                    { type: 'string', description: 'ISO 8601 或相对时间' },
                ],
            },
            size: { type: 'number', description: '桶数上限（默认 10，硬上限 100）' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    target: { type: 'object', required: true, additionalProperties: false, properties: { id: { type: 'string', required: true }, kind: { type: 'string', required: true }, label: { type: 'string', required: true } } },
                    window: { type: 'object', required: true, additionalProperties: false, properties: { from: { type: 'number', required: true }, to: { type: 'number', required: true } } },
                    by: { type: 'string' },
                    interval: { type: 'string' },
                    buckets: {
                        type: 'array',
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            properties: { key: { type: 'string', required: true }, count: { type: 'number', required: true } },
                        },
                    },
                    overTime: {
                        type: 'array',
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            properties: { ts: { type: 'number', required: true }, count: { type: 'number', required: true } },
                        },
                    },
                    otherCount: { type: 'number', description: '没列出来的桶里还有多少条（截断信号）' },
                    countErrorUpperBound: { type: 'number', description: '桶计数的误差上界（>0 = 近似值）' },
                    warnings: { type: 'array', required: true, items: { type: 'string' } },
                    hint: { type: 'string' },
                },
            },
            render: (_args, value) => {
                const result = value;
                const parts = [];
                if (result.buckets !== undefined) {
                    const total = result.buckets.reduce((sum, bucket) => sum + bucket.count, 0);
                    parts.push('按 ' + String(result.by) + ' 分组（' + String(result.buckets.length) + ' 个桶，共 ' + String(total) + ' 条）：');
                    for (const bucket of result.buckets)
                        parts.push('  ' + String(bucket.count) + '  ' + bucket.key);
                    if (result.otherCount !== undefined)
                        parts.push('  （另有 ' + String(result.otherCount) + ' 条在没列出来的桶里）');
                }
                if (result.overTime !== undefined) {
                    parts.push('按 ' + String(result.interval) + ' 分桶（' + String(result.overTime.length) + ' 个时间点）：');
                    for (const point of result.overTime)
                        parts.push('  ' + new Date(point.ts).toISOString() + '  ' + String(point.count));
                }
                for (const warning of result.warnings ?? [])
                    parts.push(warning);
                return [{ type: 'text', text: parts.length === 0 ? '（没有结果）' : parts.join('\n') }];
            },
        },
        async execute(args) {
            return await runFacets(deps, (args ?? {}));
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