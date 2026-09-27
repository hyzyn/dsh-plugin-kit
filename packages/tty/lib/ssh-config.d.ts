/**
 * @hyzyn/dsh-tty — ~/.ssh/config 迷你解析器（连接簿导入候选）。
 *
 * 宽容优先：目标是把常见配置安全搬进连接簿，而不是完整实现 OpenSSH 语法——
 *   - 键大小写不敏感，`key value` 与 `key=value` 都收；
 *   - `Host` 多模式时只收「全具体」块（任一模式含 * ? ! 或首字符为空格否定
 *     即整块跳过），块名取第一个模式；
 *   - 只映射 HostName / User / Port / IdentityFile；Include 不展开（跳过），
 *     其余选项（ServerAliveInterval 等）原样忽略；
 *   - **`ProxyJump` 解析成结构化的 `jump` 一起导入**（单跳）：值是 `[user@]host[:port]`，
 *     也可以引用**同一份 config 里的另一个具体 Host**（按块名解析，块序任意）；
 *     解析不出来（别名缺失 / 别名自己还依赖跳板机）就整块跳过并把块名报回去；
 *   - **`ProxyCommand` 仍整块跳过并报数**：它是「设置字段驱动的本地任意命令执行」，
 *     信任级与回环围栏之后的其它字段不同，要单独定闸门（见 ROADMAP 第 2 项）；
 *   - `ProxyJump none` / `ProxyCommand none` 是显式直连，照常导入（OpenSSH 用它抵消
 *     上层 `Host *` 的设置）；
 *   - 没有 User 的块无法构成连接簿条目（username 必填），跳过；
 *   - IdentityFile 取第一个 → auth=key + keyPath，否则 auth=agent；
 *   - 单文件最多产出 100 条，**超出部分报数**（`droppedOverflow`）：静默少列是本仓
 *     反复出现的一类缺陷（**D63**；见 docs/architecture.md § 7 的「截断要有信号」）。
 */
import type { SshHostEntry } from './ssh.js';
/** 单文件最多产出多少条连接簿候选（防异常巨型文件）。 */
export declare const MAX_IMPORT_ENTRIES = 100;
/** `proxy` 名单最多回报多少个块名（超出的只计数）：导入提示不该被一份巨型配置撑爆。 */
export declare const MAX_PROXY_NAMES = 50;
/** `parseSshConfigDetailed` 的结果：候选 + **每一种丢弃都要有信号**。 */
export interface ParseSshConfigResult {
    entries: SshHostEntry[];
    /** 用了 `ProxyJump` 但**解析不出跳板机**（别名缺失 / 别名自己也依赖跳板机）的块名。 */
    proxy: string[];
    /** 上一类块的总数（即使名单被截断，这个数也是准的）。 */
    proxyCount: number;
    /** 用了 `ProxyCommand` 而跳过的块名（本版本不支持，信任级需单独定闸门）。 */
    proxyCommand: string[];
    /** 上一类块的总数。 */
    proxyCommandCount: number;
    /** **成功带上跳板机**的条目数（对照组：让用户看得出导入到底生效了没有）。 */
    jumpImported: number;
    /** 其余跳过（通配 / 否定 Host 模式、没有 User）的块数。 */
    skippedOther: number;
    /** 超过 MAX_IMPORT_ENTRIES 被丢弃的块数。 */
    droppedOverflow: number;
}
export declare function parseSshConfigDetailed(text: string): ParseSshConfigResult;
/** 只要导入候选（老调用点与既有用例的形状）；需要「跳过了什么」时用 detailed 版。 */
export declare function parseSshConfig(text: string): SshHostEntry[];
