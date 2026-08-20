/**
 * @hyzyn/dsh-hello — dsh-plugin-kit 的最小 host 插件模板。
 * 覆盖：dsh.bundle.patch manifest、cordis.patch.yml 行、{ name, inject, apply }
 * 导出形状与 tsc 构建配置。新插件以本目录为蓝本（pnpm create-plugin）。
 */
import type { Context } from '@deepseek-ai/cordis';
export interface Config {
    /** 挂载时打印一行日志（默认开）。 */
    announce?: boolean;
}
export declare const name: string, inject: string[] | undefined, apply: (ctx: Context, config?: Config | undefined) => void;
