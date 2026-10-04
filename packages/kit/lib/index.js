/**
 * 类型化身份函数：让插件对象获得 DshPlugin<C> 的精确类型与统一形状。
 * 不改变任何运行时行为。
 */
export function definePlugin(plugin) {
    return plugin;
}
export * from './services.js';
export * from './host-services.js';
export * from './settings.js';
export * from './http.js';
export * from './js-expr.js';
export * from './capability.js';
/*
 * `./credentials.js`：凭据引用（`env:NAME`）的解析。**主入口**——它零依赖，而且三个消费者里
 * 有一个（`devfront`）绝不该为了这 30 行去 `import` 一条会把 `ssh2` 拉进来的子路径。
 * 它此前嵌在 `./ssh-exec.js` 里，2026-10-04 搬进来，`ssh-exec` 改成再导出。
 */
export * from './credentials.js';
export * from './grant-store.js';
export * from './elevation.js';
export * from './managed-block.js';
export * from './decode.js';
export * from './windows-shim.js';
export * from './chrome-cdp.js';
export * from './scope.js';
/*
 * `./tty-books.js` 可以进主入口：它只有纯函数（读 settings entry + 清洗），**不依赖 ssh2**。
 * `./ssh-exec.js`（真正开 SSH 连接的那一层）刻意**不进**主入口，走子路径导出——理由两条：
 *   1. 它 `import { Client } from 'ssh2'`，进主入口等于让十个不需要 SSH 的插件都多加载一个
 *      传输库；
 *   2. 它与 `./scope.js` 各有一个 `expandHome`，**语义不同**（scope 的那个只展开 `~` / `~/`，
 *      ssh-exec 的那个对 `~user` 明确抛错）。同名不同义的两个导出不能同时出现在 `export *` 里。
 * 见 packages/kit/README.md § SSH 执行层。
 */
export * from './tty-books.js';
//# sourceMappingURL=index.js.map