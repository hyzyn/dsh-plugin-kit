import { getService } from './services.js';
/** 判定一个值是不是 schemastery 的 volatile 引用（冻结 + `get()`）。 */
function isVolatileRef(value) {
    return (typeof value === 'object' &&
        value !== null &&
        Object.isFrozen(value) &&
        typeof value.get === 'function');
}
/**
 * 本插件在当前 profile 里的 entry id。
 *
 * loader 挂载时取自 `ctx.fiber.entry.options.id`（与 profile patch 里的 `id:` 一致，
 * 也等于旧 settings 命名空间名）；直接挂载 / 单测拿不到 entry 时回落 `fallbackNs`。
 */
export function settingsEntryId(ctx, fallbackNs) {
    const fiber = ctx.fiber;
    const id = fiber?.entry?.options?.id;
    return typeof id === 'string' && id !== '' ? id : fallbackNs;
}
function unwrap(value, seen) {
    if (isVolatileRef(value))
        return value.get();
    if (typeof value !== 'object' || value === null)
        return value;
    const cached = seen.get(value);
    if (cached !== undefined)
        return cached;
    if (Array.isArray(value)) {
        const out = [];
        seen.set(value, out);
        for (const item of value)
            out.push(unwrap(item, seen));
        return out;
    }
    // 只展开普通对象；类实例（Date / Map / 自定义类）原样保留。
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null)
        return value;
    const out = {};
    seen.set(value, out);
    for (const [key, item] of Object.entries(value))
        out[key] = unwrap(item, seen);
    return out;
}
/**
 * 把一份经 schema 解析的 config 还原成纯数据：volatile 引用取 `.get()`，其余原样
 * （数组/对象递归，保持结构；遇到环也不死循环）。
 *
 * 插件在 `apply` 里拿到 config 后应立刻 `config = plainConfig(config)`，之后所有读取
 * 都按普通值处理；订阅 `loader/volatile-update` 后再对本插件 config 重新跑一次即可。
 */
export function plainConfig(value) {
    return unwrap(value, new WeakMap());
}
function settingsService(ctx) {
    const service = getService(ctx, 'settings');
    if (typeof service !== 'object' || service === null)
        return undefined;
    const forms = service;
    return typeof forms.describe === 'function' && typeof forms.update === 'function'
        ? forms
        : undefined;
}
function describeEntry(settings, ns) {
    try {
        const value = settings.describe().find((entry) => entry.ns === ns)?.value;
        return typeof value === 'object' && value !== null && !Array.isArray(value)
            ? value
            : undefined;
    }
    catch {
        // describe 在配置树尚未就绪 / 已拆除时会抛：当作「没有这份 entry」，不把插件的
        // 设置面板拖崩。
        return undefined;
    }
}
/**
 * 打开本插件的 settings 读写口。宿主没有新版 settings 服务（缺 `describe`/`update`）
 * 时返回 `undefined`——调用方应保留 config-only 兜底，而不是把插件判成挂载失败。
 */
export function settingsEntryScope(ctx, fallbackNs) {
    const settings = settingsService(ctx);
    if (settings === undefined)
        return undefined;
    const ns = settingsEntryId(ctx, fallbackNs);
    const events = ctx;
    return {
        ns,
        get() {
            return describeEntry(settings, ns) ?? {};
        },
        update(patch) {
            return settings.update(ns, patch);
        },
        onChanged(listener) {
            return events.on('loader/volatile-update', () => listener());
        },
    };
}
/**
 * 只读另一插件 entry 的 resolved 值（如 docker 读 tty 的连接簿）。
 *
 * 旧实现是 `settings.get('tty')`——该方法在 0.1.7 线已不存在。目标 entry 未挂载时
 * 返回 `undefined`，由调用方当「空表」处理。
 */
export function readSettingsEntry(ctx, ns) {
    const settings = settingsService(ctx);
    return settings === undefined ? undefined : describeEntry(settings, ns);
}
/**
 * 关闭 DSH 为本插件 entry 自动生成的配置页。
 *
 * 插件自带 `plugins.row.config` 卡片时用：`describe()` 仍会返回该 entry（写入不受影响），
 * 只是不再自动生成页面。返回 `configure` 给的退订函数；服务或该方法缺失时返回空函数。
 */
export function suppressAutoSettingsPage(settingsCtx, owner) {
    const settings = settingsService(settingsCtx);
    if (settings?.configure === undefined)
        return () => { };
    const fiber = owner.fiber;
    return settings.configure({ auto: false }, fiber);
}
//# sourceMappingURL=settings.js.map