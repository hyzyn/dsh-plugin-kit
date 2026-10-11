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