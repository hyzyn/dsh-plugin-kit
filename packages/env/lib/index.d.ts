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
    /** 密钥值是否存入官方凭据存储（.credentials.yaml refs）。默认开；关闭则全部留在 env 文件。 */
    secretsInCredentials?: boolean;
}
interface JsExpr {
    __jsExpr: string;
}
interface EnvEntry {
    key: string;
    /** undefined = 密钥值已存入官方凭据存储，文件只留清单；'' 与表达式均为文件托管。 */
    value: string | JsExpr | undefined;
    secret: boolean;
}
interface ManagedRead {
    entries: EnvEntry[];
    fileError?: string;
    file: string;
}
export declare function readManagedEntries(): ManagedRead;
/** 生成托管区块文本（不含首尾标记行）；undefined 值的键整体省略（ref 托管清单形态）。 */
export declare function renderManagedBlock(entries: EnvEntry[]): string;
/** 把托管区块写回 env 文件（原子替换，保留文件其它内容；权限一律收紧为 0600）。 */
export declare function writeManagedEntries(entries: EnvEntry[]): void;
export declare function apply(ctx: Context, config?: Config): void;
export {};
