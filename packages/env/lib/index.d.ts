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
    /**
     * 区块边界不可判定（起始标记在、结束标记丢）：此时**不能写**——写侧无法知道标记之后
     * 哪一段还属于托管区块，任何「重写」都是在赌。保存路由据此拒绝，让用户先修文件
     * （2026-10-19 外部测评 issue #13 第 5 条）。
     */
    needsRepair?: boolean;
    file: string;
}
export declare function readManagedEntries(): ManagedRead;
/** 生成托管区块文本（不含首尾标记行）；undefined 值的键整体省略（ref 托管清单形态）。 */
export declare function renderManagedBlock(entries: EnvEntry[]): string;
/** 把托管区块写回 env 文件（原子替换，保留文件其它内容；权限一律收紧为 0600）。 */
export declare function writeManagedEntries(entries: EnvEntry[]): void;
export declare function validateEntries(rawEntries: unknown, previous: EnvEntry[]): {
    entries?: EnvEntry[];
    inherited?: Set<string>;
    error?: string;
};
/**
 * 同步读出凭据文档的 refs 段（`{ <KEY>: <value> }`）。
 *
 * 存在的理由只有一个：**时序**。凭据 seam 的 resolve() 是 Promise（要先等 seam 注入、
 * 再读文件），而别的插件条目在同一次组装里**同步**求值 `!!js process.env.X`
 * （mcp 的认证头就是它）——异步那条路必然输掉竞态，见 applyStoreRefsToProcessEnv。
 * 这个函数直接读文档本身，因此可以在 apply() 里同步走完。
 *
 * 容错是刻意的：文件不存在 / 读不动 / 解析失败 / 形状不对，一律返回 `{}`——
 * 读不到凭据只是「这次不预注入」，绝不能让插件启动失败（异步那条路仍会兜底）。
 * 只认 version 1 的 `refs:` 段（`records:` 与其它顶层键一概不看）；上游会把
 * 未带 version 的旧扁平布局在加载时迁成这个形状，本函数不重复那份迁移逻辑。
 * 值的形状照上游 parseRefs() 的口径——非字符串或空串都不是凭据文档里的合法值，
 * 跳过（上游对同样的输入是直接拒绝整个文档）。
 */
export declare function readStoreRefs(): Record<string, string>;
/**
 * 就绪服务名（**跨包契约**）：env 在 apply() 里 provide 它，消费者用
 * `ctx.inject([ENV_READY_SERVICE], …)` 等到它出现再读 env 注入进 `process.env` 的值。
 *
 * 为什么需要它：插件按加载器的并发 create 挂载（`Promise.all` + 动态 import），
 * **配置行序不保证 apply 顺序**；而本插件的同步预注入与消费者的动作之间只能靠
 * 「服务就绪」表达先后（cordis 的服务在提供者 fiber active 之后才对依赖者可见）。
 * 形状与语义见 `docs/architecture.md` 的跨插件协作一节（**写成行内代码**：本注释会被
 * `tsc` 搬进 `lib/index.d.ts` 随包发布，那儿的 markdown 相对链接在用户侧必然落空）。
 */
export declare const ENV_READY_SERVICE = "dshEnvReady";
/** `dshEnvReady` 的值：只描述「注入做完了没有」，不携带任何密钥值。 */
export interface EnvReadyInfo {
    /** false = 插件被配置禁用，没有做注入（消费者据此直接放行）。 */
    enabled: boolean;
    /** 本次同步注入的键名（**不含值**，仅用于诊断）。 */
    keys: string[];
    /** 提供时刻（毫秒时间戳）。 */
    at: number;
}
export declare function apply(ctx: Context, config?: Config): void;
export {};
