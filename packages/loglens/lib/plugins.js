/** 当前 profile 里已加载的插件名集合（枚举失败返回空集：宁可说「没装」，也不谎报「装了」）。 */
export function loadedPluginNames(ctx) {
    const names = new Set();
    try {
        const registry = ctx.registry;
        if (registry?.values !== undefined) {
            for (const runtime of registry.values()) {
                if (typeof runtime.name === 'string' && runtime.name !== '')
                    names.add(runtime.name);
            }
        }
    }
    catch {
        /* registry 枚举失败不阻塞 */
    }
    return names;
}
/** Docker 容器面板（本仓的 `@hyzyn/dsh-docker`）在不在。 */
export function dockerPluginLoaded(ctx) {
    return loadedPluginNames(ctx).has('docker');
}
//# sourceMappingURL=plugins.js.map