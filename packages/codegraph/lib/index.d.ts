import type { Context } from '@deepseek-ai/cordis';
export interface Config {
    /** 关闭整个插件（不注册路由、不发布提示）。默认开。 */
    enabled?: boolean;
    /** 是否向 agent 注入插件能力公告。默认开。 */
    announceToAgent?: boolean;
    /** 是否向 systemPrompt 注入 CodeGraph 使用指引（CODEGRAPH_START 区块）。默认开。 */
    usageGuidance?: boolean;
    /** codegraph CLI 命令，默认 `codegraph`。 */
    command?: string;
    /** 默认项目路径，默认 `process.cwd()`。 */
    defaultPath?: string;
}
export declare const name: string, inject: string[] | undefined, apply: (ctx: Context, config?: Config | undefined) => void;
