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
/** 一次导入对某个已有 Prompt 做了什么。 */
export interface ImportMergeEntry {
    /** Prompt id。 */
    id: string;
    /** 新增的版本 id（本地没有的）。 */
    addedVersions: string[];
    /** 本地已有、导入里也有（同 id）因而**跳过**的版本 id——不覆盖，本地内容原样保留。 */
    keptVersions: string[];
}
/** 导入合并的结果摘要（直接回给卡片，用户能看到「新增 N / 合并 M」而不是只有 imported）。 */
export interface ImportMergeSummary {
    /** 新建的 Prompt id。 */
    created: string[];
    /** 合并进已有 Prompt 的条目。 */
    merged: ImportMergeEntry[];
    /** 导入后是否改了启用中的 Prompt（只有调用方显式要求时才可能为 true）。 */
    activeChanged: boolean;
}
/**
 * 把导入的 store 合并进本地 store（纯函数，导出是为了直接测）。
 *
 * 三条语义，都是「**不丢用户数据**」这一条的展开（issue #14 第 2 条）：
 *
 * 1. **同 id 合并版本，不整条替换**：本地 p-x 有 [v1,v2]，导入的 p-x 有 [v1,v3]，
 *    结果是 [v1,v2,v3]。原先的 `byId.set(prompt.id, prompt)` 会把 v2 直接抹掉，
 *    而接口只回 `{ok:true, imported:1}`——用户看不到任何损失。
 * 2. **同 id 版本冲突时保留本地**：同 id 同内容的版本只算一次；同 id **不同内容**时
 *    以本地为准（本地是用户编辑过的），导入的那份不覆盖——要覆盖请用户自己删了再导。
 * 3. **默认不改 activePromptId**：导入是「把别人的东西拿进来」，不是「切换我当前的
 *    systemPrompt」。原先 `imported.activePromptId ?? local` 会让一次导入立刻改变
 *    每个会话注入的内容，而用户没有点过任何「启用」。
 *
 * @param local - 本地现有 store
 * @param imported - 校验过的导入 store
 * @param options.activate - 用户显式勾选「导入后启用这份 Prompt」时才为 true
 * @returns 合并后的 store 与摘要
 */
export declare function mergeImportedStore(local: PromptStore, imported: PromptStore, options?: {
    activate?: boolean;
}): {
    store: PromptStore;
    summary: ImportMergeSummary;
};
export declare function apply(ctx: Context, config?: Config): void;
export {};
