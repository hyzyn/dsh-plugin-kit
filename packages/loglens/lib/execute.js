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
     * 一条明说范围的 warning：counts 与 truncation 仍是**未筛的整页**，要按级别统计该用聚合。
     */
    let lines = result.lines;
    if (wanted.level !== undefined) {
        const kept = lines.filter((line) => levelMatches(line.level, wanted.level));
        warnings.push('level=' + wanted.level + '（' + levelHint(wanted.level) + '）是按**返回的这一页**筛的：'
            + String(lines.length - kept.length) + ' / ' + String(lines.length) + ' 行被筛掉，'
            + 'counts 与 truncation 仍是未筛的整页——要按级别看全量请用聚合（loglens_facets）');
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
export async function runFields(deps, input) {
    const picked = resolveTarget(deps.config(), input.target);
    if (!picked.ok)
        throw new Error(picked.error);
    const backend = deps.backendFor(picked.target.kind);
    if (backend === undefined)
        throw new Error(adapterHint(picked.target.kind));
    const fields = await backend.fields(picked.target);
    return {
        target: describeTarget(picked.target),
        fields: fields.map((field) => (field.label === undefined
            ? { name: field.name, kind: field.kind }
            : { name: field.name, kind: field.kind, label: field.label })),
    };
}
//# sourceMappingURL=execute.js.map