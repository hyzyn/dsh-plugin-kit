import { createElasticBackend } from './elastic.js';
import { createLokiBackend } from './loki.js';
const LOKI_BACKEND = createLokiBackend();
const ELASTIC_BACKEND = createElasticBackend({ flavor: 'es' });
const OPENSEARCH_BACKEND = createElasticBackend({ flavor: 'os' });
export function backendFor(kind) {
    if (kind === 'loki')
        return LOKI_BACKEND;
    if (kind === 'elasticsearch')
        return ELASTIC_BACKEND;
    if (kind === 'opensearch')
        return OPENSEARCH_BACKEND;
    return undefined;
}
/**
 * 注册表里的**全部**适配器。给对账守卫用（`capabilityGaps` 要逐个过一遍）——
 * 新增适配器时忘了加进这里，守卫就覆盖不到它，所以本表与 `backendFor` 的分支是**同一份事实**，
 * 用例会把两边对账（见 test/capabilities.test.ts）。
 */
export const ALL_BACKENDS = [LOKI_BACKEND, ELASTIC_BACKEND, OPENSEARCH_BACKEND];
/**
 * 对账「自述的能力」与「真的实现了的方法」。
 *
 * **为什么必须有它**：`capabilities()` 不是内部注释，它是**给调用方看的自述**，而且会被
 * `loglens_sources` 原样回给 agent。声明成 true 而方法不存在 = 让调用方去试一个永远报错的入口
 * ——Loki 的 `follow` 就这样撒过一次谎（`stream()` 还没写的时候声明了 true，直到 2026-10-12 才改正）。
 * 这条判据对 `aggregations` ↔ `facets()` 是同一个道理，所以两张表在一个函数里一起算。
 *
 * 判据只认「方法存在」，**不认「方法能跑」**——能不能跑由各自的用例管（Loki 的 tail 要真 WebSocket
 * 服务器才验得了），这里拦的是最便宜、也最容易漏的那种不一致：声明了却没有那根接线。
 */
export function capabilityGaps(backend) {
    const caps = backend.capabilities();
    const gaps = [];
    if (caps.follow && typeof backend.stream !== 'function') {
        gaps.push({ backend: backend.id, declared: 'follow', missing: 'stream()' });
    }
    if (caps.aggregations && typeof backend.facets !== 'function') {
        gaps.push({ backend: backend.id, declared: 'aggregations', missing: 'facets()' });
    }
    return gaps;
}
//# sourceMappingURL=registry.js.map