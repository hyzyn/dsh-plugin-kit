import type { TierClass } from '@hyzyn/dsh-kit';
import type { LogBackend, LogLine } from './backends/types.js';
import type { LoglensConfig, SourceKind } from './config.js';
export { adapterHint, describeTarget, hintFor, resolveTarget } from './execute.js';
export { backendFor } from './backends/registry.js';
/** 分类表：四个工具全是只读（查日志不改任何东西，也不在目标机上执行命令）。 */
export declare const LOGLENS_TIER_CLASS: Record<string, TierClass>;
/** 档位闸只认这些前缀（名单外一个都不碰）。 */
export declare const LOGLENS_TIER_PREFIXES: readonly string[];
export interface ToolDeps {
    /** 当前生效的配置（宿主侧那一份，volatile 更新后跟着变）。 */
    config: () => LoglensConfig;
    backendFor: (kind: SourceKind) => LogBackend | undefined;
    /** 注册漏斗：与 docker 的 add 同款（单个工具注册失败不该把一整批带下去）。 */
    add: (name: string, definition: unknown) => void;
}
/** 一行的可读形式：时间用 ISO（人看日志时以本地时间为准，ISO UTC 至少不含糊）。 */
export declare function formatLine(line: LogLine): string;
export declare function renderLines(lines: readonly LogLine[], markId?: string): string;
export declare function registerLoglensTools(deps: ToolDeps): void;
/** before / after 的夹取（0~50，缺省 5）：负数或非整数一律回落缺省值。 */
export declare function clampCount(value: unknown, fallback: number): number;
