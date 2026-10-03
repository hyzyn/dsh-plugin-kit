/**
 * 假宿主（**唯一的机制**）：`inject` 立刻回调子上下文、`effect(fn)` 立刻执行、settings 的
 * `update()` **先落值再广播** volatile 更新、工具/路由登记、`call` / `callError` 直接走
 * `execute` + `output.render`。
 *
 * ## 为什么它进了 `kit`（而不是继续各包一份）
 *
 * `devdata` / `devenv` 的两份夹具文件头都写着同一条判据：**夹具是测试脚手架、不是产物**，跨包
 * import 会让两个包的测试互相耦合；而「**若出现第三个消费者，判据就变了**——那时按 §16.1 的同一套
 * 判据上收进 `kit`（共享的是机制）」。2026-10-03 本包（`devfront`）成了第三个消费者，于是按那条
 * 判据上收：**机制只有这一份**，各包只留「自己的配置 schema + `apply` + 自己的服务开关」那几行适配。
 *
 * 代价是诚实的：`kit` 是发布包，这个模块会随 `lib/` 一起发布（多几十 KB 的测试脚手架）。
 * 换来的是三份拷贝不再各自漂——两包夹具的注释里记着漂移的实例（`indexforce` 那份抄漏了收尾比对，
 * 静态守卫却因为正则命中了它的一句注释而保持全绿）。
 *
 * ## 谁提供什么
 *
 * 调用方（各包）给：`ns`（settings 的 entry id）、`parse`（自己的 `Config` schema）、`plain`
 * （`plainConfig`）、`apply`（`definePlugin` 交出来的那个函数）。本模块给：**假 cordis 的全部行为**。
 *
 * ## 保真度：配置走**真实 schema**
 *
 * `mount()` 把配置过一遍调用方的 schema（真宿主交下来的就是它，插件自己会 `plainConfig` 拆开）。
 * 这一步是 `devdata` 用一次真机假问题换来的教训：绕过 schema 的假宿主会让「schema 给没写的字段
 * 造了个默认值」这类行为永远测不到。
 */
/** 注册进假宿主的一个工具（`defineTool` 交给宿主的是编译后的 JSON Schema）。 */
export interface RegisteredTool {
    name: string;
    description?: string;
    parameters?: {
        properties?: Record<string, {
            description?: string;
        } | undefined>;
    };
    output?: {
        render: (args: unknown, value: unknown) => Array<{
            type: string;
            text: string;
        }>;
    };
    execute?: (args: unknown) => Promise<unknown>;
}
/** 注册进假宿主的一条 HTTP 路由。 */
export interface RegisteredRoute {
    kind?: string;
    path: string;
    handler: (req: unknown, res: unknown) => Promise<void> | void;
}
/** 假宿主的构造参数（各包只填自己的那几项）。 */
export interface FakeHostOptions {
    /** settings 的 entry id（真宿主按包的 ns 派发）。 */
    ns: string;
    /** 把普通对象过一遍**本包真实的** schema。 */
    parse: (raw: Record<string, unknown>) => unknown;
    /** 取纯数据（settings 层交回去的就是它）。 */
    plain: (parsed: unknown) => Record<string, unknown>;
    /** 挂载插件（`definePlugin` 交出来的 `apply`）。 */
    apply: (ctx: unknown, config: unknown) => void;
    /** `settings` 服务可用？（默认 true） */
    settings?: boolean;
    /** `webServer` 服务可用？（默认 false——只有需要数据面的插件要它） */
    webServer?: boolean;
    /** `launchEnvironment` 服务可用？（默认 false——能力判定那种插件要它） */
    launchEnvironment?: boolean;
    /** 别的插件的 entry（`readSettingsEntry` 那种「读别人配了什么」）。 */
    extraEntries?: Record<string, unknown>;
}
/** 假宿主（对外形状是三包适配层的并集，谁都能只取自己用得到的那些）。 */
export declare function makeFakeHost(options: FakeHostOptions): {
    tools: Map<string, RegisteredTool>;
    routes: Map<string, RegisteredRoute>;
    counts: {
        registrations: number;
        disposals: number;
        sections: number;
    };
    stored: Record<string, unknown>;
    loggerLines: () => string[];
    /**
     * 挂载插件（`apply` 由调用方给：`definePlugin` 交出来的那个函数）。
     *
     * `seed`（缺省 true）= 把这份配置也写进 settings 层——真宿主上「bundle 层给的那份」与
     * 「settings 解析出来的那份」在没有用户改动时是同一份，多数用例要的就是这个。
     * `seed: false` 则**只把它交给 `apply`**，settings 层保持原样——用来造「两层不同」的场景
     * （`devfront` 的 volatile 用例就靠它证「resolved 值才是权威」）。
     */
    mount: (config: Record<string, unknown>, mountOptions?: {
        seed?: boolean;
    }) => void;
    /** 改一份配置（走真实的「先落值再广播」顺序）。 */
    update: (patch: Record<string, unknown>) => Promise<void>;
    /** 让 `describe()` 交回 `undefined`（entry 尚未就绪那条分支）。 */
    notReady: () => void;
    /** 恢复「entry 已就绪」（配合 `notReady()` 测「未就绪 → 就绪」的转换）。 */
    ready: () => void;
    /**
     * 给某条能力授权（模拟「宿主是带着这个环境变量启动的」）。
     *
     * **必须在 `mount()` 之前调**：`kit` 的 `bindCapabilitySources` 会在 `apply` 期清掉采样缓存并
     * 绑定判定源，所以挂载后的采样才有效；反过来（挂载后再 grant）不会生效——而这正是真实语义
     * （授权只认**启动时**继承到的环境）。
     */
    grant: (env: string) => Map<string, string>;
    names: () => string[];
    /** settings 服务本体（用例偶尔要绕过 `update()` 直接驱动它，如「entry 未就绪」那条）。 */
    settings: {
        describe: () => Array<{
            ns: string;
            value: unknown;
        }>;
        update: (ns: string, patch: Record<string, unknown>) => Promise<void>;
        configure: () => () => void;
    };
    /** 手动广播一个事件（`loader/volatile-update` 是全仓广播：别的插件改配置也会打到这里）。 */
    emit: (name: string) => void;
    call: (name: string, args: Record<string, unknown>) => Promise<string>;
    /** 调用并**捕获**抛出的错误文本（拒绝路径是这套东西的常态，不是异常）。 */
    callError: (name: string, args: Record<string, unknown>) => Promise<string>;
    /** 收尾（挂载期的 disposer）。 */
    unmount: () => void;
    /** 读某个工具某个参数的**描述**（工具描述是 agent 唯一的说明书，值得钉）。 */
    descriptionOf: (name: string, param: string) => string;
};
