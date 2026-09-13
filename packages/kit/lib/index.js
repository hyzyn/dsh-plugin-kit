/**
 * 类型化身份函数：让插件对象获得 DshPlugin<C> 的精确类型与统一形状。
 * 不改变任何运行时行为。
 */
export function definePlugin(plugin) {
    return plugin;
}
export * from './services.js';
export * from './http.js';
export * from './js-expr.js';
export * from './managed-block.js';
//# sourceMappingURL=index.js.map