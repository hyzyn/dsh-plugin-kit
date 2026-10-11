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
    /** Docker 容器面板装没装（判据见 src/execute.ts 的 hintFor 与 index.ts 的接线）。 */
    dockerLoaded?: () => boolean;
    /** 注册漏斗：与 docker 的 add 同款（单个工具注册失败不该把一整批带下去）。 */
    add: (name: string, definition: unknown) => void;
}
/**
 * 一行的可读形式：时间用 ISO（人看日志时以本地时间为准，ISO UTC 至少不含糊）+ 级别 + 正文 + 标签。
 *
 * 级别带个问号（`error?`）= 它是**从正文推断**的（文档里没有级别字段）：agent 据此决定
 * 「这条我能当级别用吗」。标签按 host / container 这类**谁写的**排在前面（src/line.ts 的优先键）。
 */
export declare function formatLine(line: LogLine): string;
export declare function renderLines(lines: readonly LogLine[], markId?: string): string;
export declare function registerLoglensTools(deps: ToolDeps): void;
/** before / after 的夹取（0~50，缺省 5）：负数或非整数一律回落缺省值。 */
export declare function clampCount(value: unknown, fallback: number): number;
