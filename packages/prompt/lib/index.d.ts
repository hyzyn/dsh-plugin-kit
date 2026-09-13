import type { Context } from '@deepseek-ai/cordis';
export declare const name = "prompt-manager";
export declare const inject: string[];
export interface Config {
    /** 关闭整个插件（不注册路由、不发布提示）。默认开。 */
    enabled?: boolean;
    /** 是否向 agent 注入插件能力公告。默认开。 */
    announceToAgent?: boolean;
    /** 是否把启用的 Prompt 注入 systemPrompt。默认开。 */
    applyToSystemPrompt?: boolean;
}
interface PromptVersion {
    id: string;
    label?: string;
    note?: string;
    content: string;
    createdAt: string;
}
interface AbTest {
    enabled: boolean;
    aVersionId: string;
    bVersionId: string;
    aWeight: number;
}
interface Prompt {
    id: string;
    name: string;
    description?: string;
    versions: PromptVersion[];
    activeVersionId: string | null;
    ab: AbTest;
    updatedAt: string;
}
interface PromptStore {
    activePromptId: string | null;
    prompts: Prompt[];
}
interface ManagedRead {
    store: PromptStore;
    fileError?: string;
    file: string;
}
export declare function readManagedStore(): ManagedRead;
/** 生成托管区块文本（不含首尾标记行）。 */
export declare function renderManagedBlock(store: PromptStore): string;
/** 把托管区块写回 prompts 文件（原子替换，保留文件其它内容与权限）。 */
export declare function writeManagedStore(store: PromptStore): void;
export declare function apply(ctx: Context, config?: Config): void;
export {};
