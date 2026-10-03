/**
 * tty 连接簿 / 指纹记录的**只读读取与清洗**（机制层，2026-10-02 plan §16.1 B1）。
 *
 * ## 为什么它在 `kit` 里
 *
 * 「tty 的连接簿条目 → SSH 连接规格」这一跳有两个消费者（`@hyzyn/dsh-docker` 容器面板、
 * `@hyzyn/dsh-devenv` 环境编排），而两边**必须逐字一致**：漏带 `jump` / `proxyCommand`
 * 就是「终端连得上、面板连不上」那种半吊子状态。判据（plan §16.1）：共享的是**机制**
 * （怎么读连接簿、怎么清洗）→ 上收 `kit`；共享的是**数据/配置** → 读对方的 settings entry。
 * 连接簿本身仍归 tty——这里只**只读**它的 entry，不写、不缓存、不自建第二份界面。
 *
 * ## 这个模块**不依赖 ssh2**
 *
 * 它只有纯函数：没有 `ssh2`、没有网络、没有文件 IO。所以 `kit` 的主入口可以原样导出它，
 * 而十个不需要 SSH 的插件不会因此多加载一个传输库（传输在 `./ssh-exec`，见那个文件的头注）。
 */
import type { HostKeyRecord, SshSpec } from './ssh-exec.js';
/**
 * 只读其它插件 entry 的 settings（旧 `settings.get(ns)` 的替代）。
 *
 * 结构类型而不是 DSH 的内部类型：既不必把 DSH 的声明面写进 `kit`，也能在句柄缺失时
 * （启动早期、`ctx.inject` 未就绪）静态看出「没有它」——四个读取函数都按 **缺省即无** 处理。
 */
export interface SettingsLookup {
    get(ns: string): unknown;
}
/**
 * 清洗一份 hostKeys 输入（settings 存储 / 热更新 / 种子复制共用）。
 *
 * 同时接受两种形状：
 *   - tty 0.19.0+ 的 `{host, port, fingerprints: [...]}`（多指纹集合）；
 *   - 某个消费者旧版自己落盘的 `{host, port, fingerprint}`（迁移输入）。
 * host 统一 trim + 小写（与 tty 的落盘口径一致，否则种子命中与否取决于大小写），
 * 同一 host:port 的多条记录合并成一组指纹。
 *
 * 非数组输入返回 `undefined`（「没这一项」），空数组返回 `[]`（「有一项，但里面没内容」）——
 * 调用方对这两者的处置不同（前者用默认值，后者算用户显式清空）。
 */
export declare function sanitizeHostKeys(input: unknown): HostKeyRecord[] | undefined;
/**
 * 读 tty 连接簿 → 连接规格。**导出即公开 API**：连接簿 → 规格这一跳是「一处配置、两处生效」
 * 的落地处（漏带 jump / proxyCommand 就是「tty 能连、面板连不上」那种半吊子状态）。
 *
 * 缺任何一项必需字段（name / host / username）的条目**跳过**：它们连不上，留在表里只会让
 * 调用方在下游报一个指不到配置的错误。
 */
export declare function readTtyBooks(settings: SettingsLookup | undefined): Map<string, SshSpec>;
/**
 * 读 tty settings 里的 ProxyCommand 闸门（`allowProxyCommand`，默认关）。
 *
 * 为什么用 **tty 的**开关而不是每个消费者自己再加一个：连接簿只有一处（tty），代理命令也只有
 * 一处能填；两个开关会让「连接簿配了、这个面板不认」变成说不清的状态。代价是多依赖一个
 * 只读 settings 字段——settings 句柄缺失（启动早期）时恒 false，即**关**（失败方向安全）。
 */
export declare function readTtyProxyCommandAllowed(settings: SettingsLookup | undefined): boolean;
/**
 * 从 tty 的 hostKeys 读取已钉扎指纹，作为消费者自己那份 TOFU 记录的**种子**。
 *
 * 为什么要读它：tty 里已经确认过一次的主机，不该在新面板上被当成「首次连接」——
 * 那样用户就在不知情的情况下把指纹信任了两遍，而第二遍是静默的（TOFU 首次即放行）。
 */
export declare function readTtyHostKeys(settings: SettingsLookup | undefined): HostKeyRecord[];
