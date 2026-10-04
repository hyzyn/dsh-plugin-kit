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
/** 已绑定的 provider（owner → provider）。同一 owner 重复绑定覆盖，`null` 摘掉自己那一份。 */
const providers = new Map();
/**
 * 绑定当前插件的 provider（服务缺失时传 `null` 也能调用，等于不绑）。
 *
 * @param owner - 稳定标识（用插件名）。**必给**才不会互相解绑；缺省留给老调用点与单测。
 */
export function setCredentialResolver(resolver, owner = 'default') {
    if (resolver === null)
        providers.delete(owner);
    else
        providers.set(owner, resolver);
}
/** 当前生效的 provider：最近绑定的那一个（`Map` 保持插入序，所以是最后一个）。 */
export function currentCredentialResolver() {
    let last = null;
    for (const resolver of providers.values())
        last = resolver;
    return last;
}
/**
 * 解析一个凭据引用——**纯核心**，provider 由调用方给，便于离线断言与按调用方隔离。
 *
 * @param reference - `env:NAME` 形式的引用；**不给 `env:` 前缀就原样当值**（`via: 'literal'`）。
 */
export async function resolveCredentialVia(provider, reference) {
    if (reference === undefined)
        return undefined;
    if (!reference.startsWith('env:'))
        return { value: reference, via: 'literal' };
    const name = reference.slice(4);
    let providerError = null;
    /** provider 明确找到了该引用（哪怕值是空串）——与「引用不存在」分开报 */
    let providerFound = false;
    if (provider !== null && provider !== undefined && typeof provider.resolve === 'function') {
        try {
            const resolved = await provider.resolve(name);
            if (resolved !== null && resolved !== undefined) {
                providerFound = true;
                if (typeof resolved.value === 'string' && resolved.value !== '') {
                    return {
                        value: resolved.value,
                        ...(typeof resolved.source === 'string' && resolved.source !== '' ? { source: resolved.source } : {}),
                        via: 'provider',
                    };
                }
            }
        }
        catch (error) {
            providerError = error instanceof Error ? error.message : String(error);
        }
    }
    const fromEnv = process.env[name];
    if (fromEnv !== undefined && fromEnv !== '')
        return { value: fromEnv, source: 'env', via: 'env' };
    const detail = providerError === null ? '' : `（凭据服务报错：${providerError}）`;
    // 「存在但值为空」单独报：报成「未设置」会把用户引去新建同名引用——那只会再失败一次。
    if (providerFound || fromEnv === '') {
        throw new Error(`凭据 ${name} 的值是空串${detail}——请在凭据存储或环境变量里补上实际值，新建同名引用解决不了`);
    }
    const missing = provider === null ? '凭据服务不可用，' : '';
    throw new Error(`凭据未设置：${name}${detail} —— ${missing}环境变量里也没有`);
}
/** 只要值的那条老路径（`tty` / `docker` 的连接规格用它）。 */
export async function resolveSecretVia(provider, value) {
    return (await resolveCredentialVia(provider, value))?.value;
}
/** 生产路径：用当前绑定的 provider（没人绑就是 `null`，退回 `process.env`）。 */
export async function resolveSecret(value) {
    return resolveSecretVia(currentCredentialResolver(), value);
}
/** 生产路径的详细版（要来源层时用它）。 */
export async function resolveCredential(reference) {
    return resolveCredentialVia(currentCredentialResolver(), reference);
}
//# sourceMappingURL=credentials.js.map