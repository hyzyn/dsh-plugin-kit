/**
 * 凭据引用（`env:NAME`）的**解析**：官方凭据服务优先，`process.env` 兜底。
 *
 * ## 为什么这一份住在 `kit` 的主入口，而不是 `ssh-exec` 子路径里
 *
 * 它此前嵌在 `kit` 的 `ssh-exec.ts`（SSH 执行层）里，理由是「那里第一个用到」。2026-10-04 变了：
 * `devfront` 也要解析凭据引用（「填值可以填一个**引用**」），而 `ssh-exec` 子路径
 * `import { Client } from 'ssh2'` —— 让一个浏览器工具包为了 30 行解析逻辑拉进 SSH 传输库，
 * 正是 `kit` 把 `ssh-exec` 挡在主入口之外时给出的第一条理由。所以解析搬到主入口，
 * `ssh-exec` 改成再导出（它的公开形状一字不改）。
 *
 * ## 契约（照 `@deepseek-ai/dsh-credentials`，不引依赖、只用结构类型）
 *
 * 1. **provider 优先**：它叠 `file`（`$DSH_HOME/.credentials.yaml`）/ `env` / `project-env` /
 *    `user-env` 各层，而凭据存储里的值**永远不会 materialize 进环境**——只读 `process.env`
 *    等于「存进凭据存储的值根本读不到」；
 * 2. **每次操作重新解析**：provider 自己保证（它的 README 原话），所以改完凭据**下一个操作即生效**，
 *    不必重启宿主。调用方也**不许**把结果缓存起来跨操作用——这里不提供缓存，正是这个原因；
 * 3. **provider 抛错不吞**：记下来，若环境变量也没有就把两个来源一起写进错误里。否则「凭据服务
 *    坏了」会伪装成「你没配」，而那是最难查的一类。
 *
 * ## 绑定是**按 owner** 的（2026-10-04 改）
 *
 * 从前是一个进程级单例槽：谁后绑谁生效，而 `ctx.inject` 的收尾是
 * `return () => setCredentialResolver(null)` —— **一个插件卸载会把别人的凭据通道一起关掉**
 * （此后静默退回 `process.env`，症状是「刚才还能连，现在报凭据未设置」）。改成
 * `owner → provider` 的映射：卸载只摘掉自己那一份，`resolveSecret()` 取最近绑定的那一个。
 * 同一个宿主服务被多个插件绑定是常态（它们是同一个对象），所以「取最近」与「取任意」等价；
 * 区别只在于**没人能替别人解绑**。
 *
 * 需要完全隔离的调用方（例如只关心自己的注入生命周期）应当直接用 `resolveCredentialVia(provider, ...)`
 * 传入自己的 provider，别碰这个单例——`devfront` 就是这么做的。
 */
/** 官方凭据服务的**最小结构面**（结构类型，不把它变成 `kit` 的依赖）。 */
export interface CredentialResolver {
    /**
     * `ref` 是**引用名**（不是 `env:` 前缀那种整串——前缀由调用方剥掉，见 `resolveCredentialVia`）。
     * 返回 `{ value, source }`；`source` 是 provider 给的**来源层 id**（本地 provider 用
     * `env` / `file` / `project-env` / `user-env`），拿它去标「保护强度」。
     */
    resolve(ref: string): Promise<{
        value: string;
        source?: string;
    } | undefined>;
}
/** 一次解析的结果：**值**、值**来自哪一层**、以及走的哪条路。 */
export interface ResolvedCredential {
    value: string;
    /** provider 给的来源层 id；走 `process.env` 兜底时是 `'env'`。 */
    source?: string;
    /**
     * 走的哪条路：
     *   - `provider`：官方凭据服务给的（含它自己的 `file` / `env` / `project-env` / `user-env` 各层）；
     *   - `env`：服务不在、或它没有这个引用，退回本进程的环境变量；
     *   - `literal`：传进来的**不是引用**（不以 `env:` 开头），原样当值用——老配置里的明文口令走这条。
     *     「它是不是本该是个引用」是**调用方的判据**（例如 `devfront` 只收 `env:` 开头的）。
     */
    via: 'provider' | 'env' | 'literal';
}
/**
 * 绑定当前插件的 provider（服务缺失时传 `null` 也能调用，等于不绑）。
 *
 * @param owner - 稳定标识（用插件名）。**必给**才不会互相解绑；缺省留给老调用点与单测。
 */
export declare function setCredentialResolver(resolver: CredentialResolver | null, owner?: string): void;
/** 当前生效的 provider：最近绑定的那一个（`Map` 保持插入序，所以是最后一个）。 */
export declare function currentCredentialResolver(): CredentialResolver | null;
/**
 * 解析一个凭据引用——**纯核心**，provider 由调用方给，便于离线断言与按调用方隔离。
 *
 * @param reference - `env:NAME` 形式的引用；**不给 `env:` 前缀就原样当值**（`via: 'literal'`）。
 */
export declare function resolveCredentialVia(provider: CredentialResolver | null, reference: string | undefined): Promise<ResolvedCredential | undefined>;
/** 只要值的那条老路径（`tty` / `docker` 的连接规格用它）。 */
export declare function resolveSecretVia(provider: CredentialResolver | null, value: string | undefined): Promise<string | undefined>;
/** 生产路径：用当前绑定的 provider（没人绑就是 `null`，退回 `process.env`）。 */
export declare function resolveSecret(value: string | undefined): Promise<string | undefined>;
/** 生产路径的详细版（要来源层时用它）。 */
export declare function resolveCredential(reference: string | undefined): Promise<ResolvedCredential | undefined>;
