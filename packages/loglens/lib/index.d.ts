/**
 * @hyzyn/dsh-loglens — 宿主半体（**骨架**）。
 *
 * P0-乙 只把包与它的形状立起来：现在的 `apply()` 只证明插件能在宿主里挂载。
 * 契约（归一化行模型 / `LogCounts` / `Truncation` / 出站围栏）见 packages/loglens/docs/design.md，
 * 分期见 packages/loglens/ROADMAP.md——**别在这里提前实现后端适配器**，那是 P1/P2/P4 的事。
 */
import type { Context } from '@deepseek-ai/cordis';
export interface Config {
    /** 挂载时打印一行日志（默认开）。 */
    announce?: boolean;
}
export declare const name: string, inject: string[] | undefined, apply: (ctx: Context, config?: Config | undefined) => void;
