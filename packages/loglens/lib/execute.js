import { CANONICAL_LEVELS, canonicalLevel, levelHint, levelMatches } from './line.js';
import { normalizeQuery } from './query.js';
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
/** 目标的自述（工具返回值与路由响应里统一用这一形状）。 */
export function describeTarget(target) {
    return { id: target.id, kind: target.kind, label: target.label };
}
export function hintFor(kind, caps, options = {}) {
    if (kind === 'docker') {
        if (options.dockerLoaded === true) {
            return 'Docker 是采集来源（选项 0）：面板里可以直接看容器日志（走 Docker 面板插件自己的 /api/dsh-docker/logs）；'
                + 'agent 侧用现成的 docker_logs / docker_logs_grep——本插件不包一层';
        }
        return 'Docker 是采集来源（选项 0）：agent 侧用现成的 docker_logs / docker_logs_grep；'
            + '面板那条日志视图要「Docker 容器面板」插件（当前没检测到它）';
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
/**
 * level 参数：归一化成 CanonicalLevel；认不出来就报错（**不猜**）。
 *
 * 语义是「**及以上**」：level=warn 得到 warn + error + fatal（日志查看器的通行口径）。
 * 行上没有级别**不算命中**——不能把「不知道」当成「是 error」。
 */
export function readLevel(value) {
    if (value === undefined || value === null || value === '')
        return { ok: true };
    const level = canonicalLevel(value);
    if (level === undefined) {
        return { ok: false, error: 'level 只能是 ' + CANONICAL_LEVELS.join(' / ') + '（收到 ' + JSON.stringify(value) + '）' };
    }
    return { ok: true, level };
}
/** 查一次（抛错即失败，调用方把 message 回给对面：工具抛出去、路由回 400）。 */
export async function runSearch(deps, input) {
    const picked = resolveTarget(deps.config(), input.target);
    if (!picked.ok)
        throw new Error(picked.error);
    const backend = deps.backendFor(picked.target.kind);
    if (backend === undefined)
        throw new Error(adapterHint(picked.target.kind));
    const caps = backend.capabilities();
    /*
     * `filters` 必须**原样传下去**（2026-10-17 真机抓到的洞）：这一层被抽出来的时候漏了它，
     * 而下面的 `runFacets` 那份传了——于是结构化筛选只收窄了榜与分布，**行**照旧是全量：
     * 真机上 `filters: {container.name: prometheus}` 发出去，回来的 100 行里躺着 6 个容器，
     * matched 也是未筛的 26264（面板那句「行、时间分布与分组榜都跟着收窄」里，第一个是假的）。
     *
     * 一起漏掉的还有 Loki 那句**诚实的报错**：适配器见不得 filters 就抛「暂不支持结构化 filters」，
     * 传不到它那儿就变成「静默给了全量」——正是那段注释里说的最坏情况。守卫见
     * `test/query-route.test.ts`：走 /query 路由，断言桩后端真的收到了 filters、Loki 真的回了 400。
     */
    const normalized = normalizeQuery({
        targetId: picked.target.id,
        q: input.q,
        from: input.from,
        to: input.to,
        limit: input.limit,
        direction: input.direction,
        cursor: input.cursor,
        filters: input.filters,
    }, caps);
    if (!normalized.ok)
        throw new Error(normalized.error);
    const wanted = readLevel(input.level);
    if (!wanted.ok)
        throw new Error(wanted.error);
    const result = await backend.query(normalized.query, picked.target);
    const warnings = normalized.warnings.slice();
    /*
     * level 过滤在**这一页**上做（真机反馈第 7 条）。
     *
     * 为什么不推给后端：级别字段在各家索引里名字与存在性都不一样（这套集群里 log.level 是空桶，
     * 级别其实长在正文里），推下去就会变成「有时候筛了、有时候静默没筛」。所以本层如实做页内筛 +
     * 一条明说范围的 warning：counts 与 truncation 仍是**未筛的整页**。**不要**在这里指一条
     * 「用聚合看全量」的路——ES 上 log.level 常为空，按它分组也是空桶（真机实测）；后端没有
     * 级别字段时，面板与 agent 都只能页内筛 + 在查询串里搜关键字。
     */
    let lines = result.lines;
    if (wanted.level !== undefined) {
        const kept = lines.filter((line) => levelMatches(line.level, wanted.level));
        /*
         * 这句 warning 是**原话照抄**到面板上的（meta 行里那个 `.ll_warn`），所以不写 Markdown
         * 的 `**`——宿主不把文案当 Markdown 渲染，界面上会原样露出星号。另外，后半句要给一条
         * **走得通**的路：ES 上 `log.level` 常常整列是空的（级别从正文推断），那种来源连
         * `loglens_facets` 按它分组也是空桶（真机 2026-10-17 实测），只指聚合等于指一条死路。
         */
        warnings.push('level=' + wanted.level + '（' + levelHint(wanted.level) + '）是按「返回的这一页」筛的：'
            + String(lines.length - kept.length) + ' / ' + String(lines.length) + ' 行被筛掉，'
            + 'counts 与 truncation 仍是未筛的整页——按级别看全量要求后端真有级别字段'
            + '（ES 上 log.level 常为空、级别是从正文推断的），否则只能在查询串里搜级别关键字');
        lines = kept;
    }
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
        returned: lines.length,
        counts: result.counts,
        truncation: result.truncation,
        lines,
        ...(result.nextCursor === undefined ? {} : { nextCursor: result.nextCursor }),
        warnings,
        ...(hint === undefined ? {} : { hint }),
        ...(wanted.level === undefined ? {} : { level: wanted.level }),
    };
}
/* ============================ 聚合（facets） ============================ */
/** 桶数上限（工具面默认 10、硬上限 100）——与适配器那边各有一份默认值，硬上限取小的那个。 */
export const FACETS_DEFAULT_SIZE = 10;
export const FACETS_MAX_SIZE = 100;
/** 时间分桶的间隔形态：5m / 1h / 1d（不合形态的当场报错，别丢给后端回一句难懂的 400）。 */
const FACET_INTERVAL = /^\d+(s|m|h|d)$/u;
/** 没有聚合适配器时的指路文案（说清「怎么绕」，不是一句「不支持」）。 */
export function facetsHint(kind) {
    if (kind === 'docker') {
        return 'Docker 是采集来源（设计 §5 选项 0）：聚合请用现成的 docker 工具，本插件不包一层';
    }
    return '这个来源目前没有聚合适配器（当前只有 ES / OpenSearch 有）：Loki 的指标查询（LogQL）还没接——'
        + '先用 loglens_search 缩小时间窗看行，或把统计写进 LogQL';
}
export async function runFacets(deps, input) {
    const picked = resolveTarget(deps.config(), input.target);
    if (!picked.ok)
        throw new Error(picked.error);
    const backend = deps.backendFor(picked.target.kind);
    if (backend === undefined)
        throw new Error(adapterHint(picked.target.kind));
    if (backend.facets === undefined)
        throw new Error(facetsHint(picked.target.kind));
    const by = typeof input.by === 'string' ? input.by.trim() : '';
    const interval = typeof input.interval === 'string' ? input.interval.trim() : '';
    if (by === '' && interval === '') {
        throw new Error('至少要给 by（按字段分组，如 container.name）或 interval（按时间分桶，如 5m）之一');
    }
    if (interval !== '' && !FACET_INTERVAL.test(interval)) {
        throw new Error('interval 形态不对（要 5m / 1h / 1d 这种）：' + interval);
    }
    let size = FACETS_DEFAULT_SIZE;
    const warnings = [];
    if (input.size !== undefined && input.size !== null) {
        if (typeof input.size !== 'number' || !Number.isInteger(input.size) || input.size < 1) {
            throw new Error('size 必须是正整数（桶数上限）');
        }
        size = input.size;
        if (size > FACETS_MAX_SIZE) {
            warnings.push('size ' + String(size) + ' 超过硬上限，已夹到 ' + String(FACETS_MAX_SIZE));
            size = FACETS_MAX_SIZE;
        }
    }
    const caps = backend.capabilities();
    const normalized = normalizeQuery({
        targetId: picked.target.id,
        q: input.q,
        from: input.from,
        to: input.to,
        filters: input.filters,
    }, caps);
    if (!normalized.ok)
        throw new Error(normalized.error);
    warnings.unshift(...normalized.warnings);
    const result = await backend.facets(normalized.query, picked.target, { ...(by === '' ? {} : { by }), ...(interval === '' ? {} : { interval }), size });
    if (result.otherCount !== undefined) {
        warnings.push('还有 ' + String(result.otherCount) + ' 条落在没列出来的桶里：把 size 调大（上限 '
            + String(FACETS_MAX_SIZE) + '）或收窄时间窗 / 加 filters');
    }
    if (result.countErrorUpperBound !== undefined) {
        warnings.push('桶计数是**近似值**（误差上界 ' + String(result.countErrorUpperBound) + ' 条，terms 聚合在多分片上本来就是这个精度）');
    }
    return {
        target: describeTarget(picked.target),
        window: { from: normalized.query.from, to: normalized.query.to },
        ...(by === '' ? {} : { by }),
        ...(interval === '' ? {} : { interval }),
        ...(result.buckets === undefined ? {} : { buckets: result.buckets }),
        ...(result.overTime === undefined ? {} : { overTime: result.overTime }),
        ...(result.otherCount === undefined ? {} : { otherCount: result.otherCount }),
        ...(result.countErrorUpperBound === undefined ? {} : { countErrorUpperBound: result.countErrorUpperBound }),
        warnings,
    };
}
/**
 * 列字段的**长度处理**（2026-10-14，对齐 Kibana）：**不传 limit 就是不截断**，来源有多少字段列多少。
 *
 * 原来这里是「默认 80 + 硬上限 200」。真机反馈第 4 条要的是**看得出被截断**（45KB 那份清单被当成全部），
 * 不是「一律砍到 80」——Kibana 的 `_field_caps` 从来不 slice，长度交给界面（字段名搜索 + 分区 + 虚拟滚动）。
 * 所以这层同理：默认给全，要收窄是调用方**显式**说的事；只有真截了才带上 total / truncated 与那句警告
 * （形状不变，信号仍然跟着结果走）。工具面的成本提示写在工具描述里，不靠这里的默认值替调用方做决定。
 */
export async function runFields(deps, input) {
    const picked = resolveTarget(deps.config(), input.target);
    if (!picked.ok)
        throw new Error(picked.error);
    const backend = deps.backendFor(picked.target.kind);
    if (backend === undefined)
        throw new Error(adapterHint(picked.target.kind));
    // `limit` 是**可选的收窄手段**，没有默认值、也没有硬顶：调用方要前 N 个就明说，不说就是全部
    let limit;
    if (input.limit !== undefined && input.limit !== null) {
        if (typeof input.limit !== 'number' || !Number.isInteger(input.limit) || input.limit < 1) {
            throw new Error('limit 必须是正整数（列字段的条数上限）');
        }
        limit = input.limit;
    }
    const result = await backend.fields(picked.target, limit === undefined ? {} : { limit });
    const warnings = [];
    if (result.truncated) {
        warnings.push('只列了前 ' + String(result.fields.length) + ' 个（这个来源共有 ' + String(result.total) + ' 个字段）：'
            + '这正是「字段表看不出被截断」的坑——去掉 limit 就是全部，'
            + '或先用 loglens_facets 看哪些字段真有数据');
    }
    return {
        target: describeTarget(picked.target),
        fields: result.fields.map((field) => ({
            name: field.name,
            kind: field.kind,
            ...(field.label === undefined ? {} : { label: field.label }),
            ...(field.preferred === true ? { preferred: true } : {}),
            // 多类型才有（Kibana 的 esTypes / type: conflict / conflictDescriptions）：**必须原样搬过去**，
            // 在这一层丢掉的话，工具面就再也说不出「这个字段在不同索引里类型不一致」（渲染与面板都靠它）
            ...(field.esTypes === undefined ? {} : { esTypes: field.esTypes }),
            ...(field.conflict === true ? { conflict: true } : {}),
            ...(field.conflictDescriptions === undefined ? {} : { conflictDescriptions: field.conflictDescriptions }),
        })),
        total: result.total,
        truncated: result.truncated,
        warnings,
    };
}
//# sourceMappingURL=execute.js.map