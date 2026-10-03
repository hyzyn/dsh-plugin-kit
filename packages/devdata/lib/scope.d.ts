/**
 * **实现已上收进 `@hyzyn/dsh-kit`**（`packages/kit/src/scope.ts`），这里只做转发。
 *
 * ## 为什么上收
 *
 * 这条判据有三个互不相干的消费者：数据面（本包）、前端验活（`devfront`）、以及将来的环境编排。
 * 而它同时是**运行时**判据——`devfront` 挂进 profile 后由宿主用**纯 Node** 加载，
 * 那时跨包 import 本包的 `src/scope.ts` 走不通（.ts + `rewriteRelativeImportExtensions`），
 * 而把 `@hyzyn/dsh-devdata` 做成 `devfront` 的运行时依赖又会因为 `workspace:*`
 * 在 profile 里无法解析而装不上。所以它属于 `kit`（唯一带构建产物的共享库）。
 *
 * 保留本文件是为了不动既有导入路径（本包内部与 `@hyzyn/dsh-devdata/scope.js` 子路径导出）。
 */
export { decideScope, expandHome, isWithin, normalizeDir, type ScopeDecision } from '@hyzyn/dsh-kit';
