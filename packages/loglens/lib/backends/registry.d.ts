/**
 * @hyzyn/dsh-loglens — 后端注册表（kind → 适配器）。
 *
 * **Docker 刻意不进这里**：它是**采集来源**，走设计 §5 的选项 0（现成的 `docker_logs` /
 * `docker_logs_grep`）——给它包一层只会造出第二份口径。注册表里没有 = 调用方拿到 undefined，
 * 由 src/execute.ts 的 `adapterHint` 说清「怎么绕」。
 */
import type { SourceKind } from '../config.js';
import type { LogBackend } from './types.js';
export declare function backendFor(kind: SourceKind): LogBackend | undefined;
/**
 * 注册表里的**全部**适配器。给对账守卫用（`capabilityGaps` 要逐个过一遍）——
 * 新增适配器时忘了加进这里，守卫就覆盖不到它，所以本表与 `backendFor` 的分支是**同一份事实**，
 * 用例会把两边对账（见 test/capabilities.test.ts）。
 */
export declare const ALL_BACKENDS: readonly LogBackend[];
/** 一处「声明了、但没实现」的不一致。空数组 = 自述与实现一致。 */
export interface CapabilityGap {
    backend: string;
    /** 自述里声明成 true 的那一位（`BackendCaps` 的键）。 */
    declared: string;
    /** 声明为真就必须存在、但实际不存在的方法。 */
    missing: string;
}
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
export declare function capabilityGaps(backend: LogBackend): CapabilityGap[];
