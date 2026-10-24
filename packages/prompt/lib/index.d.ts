import type { PromptSectionApi } from '@hyzyn/dsh-kit';
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
/**
 * 每轮注入 systemPrompt 的正文上限——**这是每轮请求成本的保护，不是保存限制**：
 * 保存防呆是上面的 MAX_CONTENT_LENGTH（超限拒存），这里超限只截断本轮注入的内容，
 * 文件里始终是完整正文。取 8000 而不是 kit 的 DEFAULT_SECTION_MAX_CHARS（4000），
 * 是因为用户 Prompt 正文通常比插件公告长，4000 会误伤正常用法；8000 仍远低于保存上限。
 */
export declare const PROMPT_BODY_MAX_CHARS = 8000;
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
/**
 * 把启用的 Prompt 正文变成要注册进 systemPrompt 的文本；超限就做**语义化截断**。
 *
 * 为什么不用 kit 的通用截断标记（`…（本段超过 N 字符上限，已截断）`）：这段是**用户内容**，
 * 模型需要知道的不止「以上不是全文」，还有「完整内容去哪提醒用户找」——通用标记只说得出前者。
 *
 * 截断说明计入预算**之内**：正文保留 `PROMPT_BODY_MAX_CHARS - 说明自身长度` 字符，最终文本
 * 总长恰好等于上限。调用点（registerActivePromptSection）给 kit 传的 `maxChars` 与这里是
 * **同一个常量**，kit 的长度安全网因此永远不会触发；两边一旦不相等（比如调用点传小了），
 * kit 就会二次截断、语义说明被顶掉——prompt-section.test.ts 的反例用例钉住了这个形状。
 */
export declare function buildSystemPromptText(store: PromptStore): string;
/**
 * 注册「启用的 Prompt 正文」段落；正文为空时返回 null（什么都不注册）。
 *
 * `maxChars` 必须与 `buildSystemPromptText` 的截断阈值是**同一个常量**：语义截断已经把总长
 * 压到上限以内，这里传别的值只可能让 kit 二次截断（两份截断标记）或把安全网架空。
 * 导出仅为测试：生产路径只有 refreshSystemPrompt 一个调用点。
 */
export declare function registerActivePromptSection(api: PromptSectionApi, store: PromptStore): (() => void) | null;
/**
 * 保存响应的正文预警：保存的 Prompt 里**会被注入**的版本若有超过每轮注入上限的，回一条
 * warning 让卡片提示「这份 Prompt 每轮只会注入前 8000 字符」。候选版本与 resolveActiveText
 * 的选择对齐——A/B 启用且两侧都存在时两侧都可能被注入；否则走「activeVersionId → 第一个
 * 版本」的回落链。不在注入链上的超限版本（比如存着备用的长稿）不触发，免得卡片误报。
 * 导出仅为测试。
 */
export declare function promptBodyWarning(prompt: Prompt): string | undefined;
interface ReqLike {
    method?: string;
    url?: string;
    headers: Record<string, string | string[] | undefined>;
    socket: {
        remoteAddress?: string;
    };
}
interface ResLike {
    writeHead(status: number, headers?: Record<string, string>): void;
    end(body?: string): void;
}
type RouteHandler = (req: ReqLike & AsyncIterable<Uint8Array>, res: ResLike) => Promise<void>;
/** 导出仅为测试：生产路径只有 apply 里这一处调用。 */
export declare function makeRoutes(ctx: Context, onChanged: () => void): Array<{
    kind: 'exact';
    path: string;
    handler: RouteHandler;
}>;
export declare function apply(ctx: Context, config?: Config): void;
export {};
