/**
 * 能力开关的**宿主侧授权**（跨包约定）。
 *
 * ## 这一层要解决的问题
 *
 * 本仓插件的变更路由只有两层防护：**回环围栏 + 同源证明**。两层都拦不住**跨站页面**与
 * **页内脚本**（第三方插件的 client 半体与 XSS 都跑在同一个页面上）：它们能发 HTTP，也能自己
 * 填 `Sec-Fetch-Site: same-origin`（那是请求头，不是凭据）。于是「能力开关」本身成了攻击面：
 * 一次 `POST /config {allowMutations:true}` 就把危险能力打开（docker socket 等价目标主机 root）。
 *
 * 为什么不用一次性 token 覆盖它：危险的正是 `/config`——而它必须保持免证明，因为它是插件被禁用后
 * 唯一的恢复入口（token 化就等于把用户锁在外面）。详见项目级 ROADMAP 的「变更端点的信任模型」
 * 条目与 [docs/architecture.md § 能力开关](../../../docs/architecture.md)。
 *
 * ## 两条授权通道
 *
 * 1. **启动环境变量**（最严档）：`DSH_DOCKER_ALLOW_MUTATIONS=1` 这类。宿主进程的环境变量不是
 *    一次回环请求能改的东西——它连改都改不到。判定源是宿主的**启动环境快照**（见
 *    `bindCapabilitySources`），所以 `.env` / `~/.dsh/env.yml` 这类**运行期可写**的文件都不算授权。
 * 2. **就地提权**（免重启档）：页内点开关 → 一次带外确认（在宿主文件系统上落地一个随机名文件）
 *    → 授权写进 `GrantStore`（`grant-store.ts`，HTTP 写不到）。实现在 `elevation.ts`。
 *
 * ## 约定
 *
 * 1. **提权只认宿主侧来源**：启动环境快照，或带外确认写下的授权文件。
 * 2. **环境变量在插件 `apply()` 期绑定一次**（`bindCapabilitySources`），不是每次现读
 *    `process.env`。为什么：`process.env` 可以被别的插件在运行期改写（环境变量卡片就有 HTTP
 *    写入路径），现读等于把提权路径原样搬到那张卡片上。
 * 3. **HTTP 仍然可以关掉它**（降权随时可用）：紧急刹车不能依赖重启。
 * 4. 配置里的 `true` **不算授权**：它与 HTTP 写进去的值存在**同一个** settings 存储里，分不出
 *    来源；只认上面两条通道才是能说清的规则（升级影响见各包 README）。
 * 5. **文案不许写「HTTP 侧只能关闭、不能打开」**：有了就地提权，HTTP 侧确实能提权（要带着带外
 *    凭据）。正确表述是「不能凭空打开」——`capabilityDeniedMessage` 里就是这句。
 * 6. **只有启动环境通道算「最强」**：就地提权挡的是跨站页面与页内脚本，挡不住能在本机执行命令的
 *    同用户进程（见下面的威胁模型边界）。界面必须能区分两条通道（`capabilityGrantVia`）。
 *
 * ## 威胁模型边界（写清楚，免得把这一层当万能）
 *
 * 拦的是**凭空提权**：跨站页面、页内脚本（读不到带外凭据）、只会盲发 HTTP 的进程。能读写本机
 * 文件、能在本机执行命令的**同用户进程不在模型内**：它本来就能读 `~/.dsh/.credentials.yaml`、
 * 能直接跑 `docker`。任何进程内机制都拦不住它。
 */
import type { CapabilityGrantSource, CapabilityGrantVia } from './grant-store.js';
/** 一条能力开关的宿主侧授权说明。 */
export interface CapabilitySpec {
    /** 宿主侧授权用的环境变量名（`1` / `true` / `yes` / `on` 视为授权）。 */
    env: string;
    /** 给用户看的名字，出现在提示与错误文案里（如「变更操作」）。 */
    label: string;
}
/** 「怎么授权」文案的选项。 */
export interface CapabilityHowToOptions {
    /**
     * 本插件是否提供了「就地提权」面板（缺省 `false`）。
     *
     * 为什么要插件自己声明：tty 的 `allowProxyCommand` 目前只有启动环境通道，文案里提「就地确认」
     * 会让用户去卡片上找一个不存在的入口——本仓最忌讳的「配了没反应」。
     */
    inPlace?: boolean;
}
/** 插件 `apply()` 里能拿到的最小上下文形状（只需要 `ctx.get`）。 */
export interface CapabilityContextLike {
    get?(name: string): unknown;
}
/**
 * 绑定本进程的授权来源：**各插件在自己的 `apply()` 第一行调用**（早于任何 `capabilityGranted`）。
 *
 * 为什么必须由插件显式绑定、而不是 kit 自己去读 `~/.dsh`：判定逻辑是跨包共享的纯函数，而「谁有权
 * 读哪个文件」是插件的事（它才知道 DSH 主目录，测试里也知道该指到哪个临时目录）。kit 自己去读
 * 用户真实主目录，会让任何一个用例都依赖开发机上 `capability-grants.json` 的内容。
 *
 * 重复调用 = 重新绑定（测试与脚本用它模拟「宿主这次是带着什么环境启动的」）。
 *
 * @param ctx - 插件上下文（只用到 `ctx.get('launchEnvironment')`）。
 * @param grants - 带外授权存储；不传表示本插件**没有**就地提权通道（当时只有启动环境那一条）。
 *   现在 docker 与 tty 都传了存储；不传这条分支留给还没接入的插件与纯环境变量用例。
 */
export declare function bindCapabilitySources(ctx: CapabilityContextLike | null | undefined, grants?: CapabilityGrantSource): void;
/** 宿主侧是否授予了这条能力（启动环境快照，或带外授权存储命中；缺省 = 未授权）。 */
export declare function capabilityGranted(spec: CapabilitySpec | string): boolean;
/**
 * 这条能力当前**由哪条通道**授权（都没命中 = `undefined`）。
 *
 * 给 `snapshot()` / 界面用：必须能区分「启动环境授权」与「就地确认授权」——后者可以在界面里撤销，
 * 前者只能去改启动环境，两者的提示语完全不同（写错会让用户点一个永远点不动的按钮）。
 *
 * 两条都命中时**报 `env`**：那时撤销存储里的授权并不能让能力真的关掉（环境变量还授权着），界面上
 * 给一个「撤销」按钮却什么都不改变，比不给更糟。报 `env` = 「这个开关由启动环境决定，界面撤不了」。
 */
export declare function capabilityGrantVia(spec: CapabilitySpec | string): 'env' | CapabilityGrantVia | undefined;
/**
 * 这条能力**何时**获授（Unix 秒；环境变量通道或未授权 = `undefined`）。
 *
 * 只对 `file` 通道有值：环境变量通道没有「授权时刻」（它就是启动环境的一部分），给它显示一个假
 * 时间比不显示更糟。这是界面侧的落点——授权是**持久**的，用户至少该看得到它是什么时候来的（kit D09）。
 */
export declare function capabilityGrantAt(spec: CapabilitySpec | string): number | undefined;
/**
 * 「怎么授权」的一句话（给界面与错误文案共用）。
 *
 * 刻意把**通道**说清楚：只说「去设置里打开」会让人在卡片上反复点一个点不动的开关。并且必须点明
 * `.env` / `env.yml` **不算**——那两个文件有 HTTP 写入路径，拿它们当授权等于没闸门。
 */
export declare function capabilityHowTo(spec: CapabilitySpec, options?: CapabilityHowToOptions): string;
/** HTTP 尝试把未授权的能力打开时的 400 文案（插件路由直接用）。 */
export declare function capabilityDeniedMessage(spec: CapabilitySpec, options?: CapabilityHowToOptions): string;
