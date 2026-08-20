import type { Context } from '@deepseek-ai/cordis';
export declare const name = "env-manager";
export declare const inject: string[];
export interface Config {
    /** 关闭整个插件（不注册路由、不发布提示）。默认开。 */
    enabled?: boolean;
    /** 是否向 agent 注入插件能力公告。默认开。 */
    announceToAgent?: boolean;
    /** 保存/启动时是否把解析后的值写入 process.env。默认开。 */
    applyToProcessEnv?: boolean;
}
export declare function apply(ctx: Context, config?: Config): void;
