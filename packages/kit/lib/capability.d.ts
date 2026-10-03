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
