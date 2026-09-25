/**
 * @hyzyn/dsh-tty — ~/.ssh/config 迷你解析器（连接簿导入候选）。
 *
 * 宽容优先：目标是把常见配置安全搬进连接簿，而不是完整实现 OpenSSH 语法——
 *   - 键大小写不敏感，`key value` 与 `key=value` 都收；
 *   - `Host` 多模式时只收「全具体」块（任一模式含 * ? ! 或首字符为空格否定
 *     即整块跳过），块名取第一个模式；
 *   - 只映射 HostName / User / Port / IdentityFile；Include 不展开（跳过），
 *     其余选项（ServerAliveInterval 等）原样忽略；
 *   - **依赖跳板机的块（`ProxyJump` / `ProxyCommand`）整块跳过，并把块名报回去**
 *     （项目级 ROADMAP 第 2 项）。理由：本版本不支持跳板机，导进来只会得到一条
 *     「20s 后一句通用超时」的条目——用户还得自己反推是堡垒机的问题。跳过 + 明说
 *     是两者里唯一诚实的那个；`ProxyJump none` 是显式直连，照常导入；
 *   - 没有 User 的块无法构成连接簿条目（username 必填），跳过；
 *   - IdentityFile 取第一个 → auth=key + keyPath，否则 auth=agent；
 *   - 单文件最多产出 100 条，**超出部分报数**（`droppedOverflow`）：静默少列是本仓
 *     反复出现的一类缺陷（见 docs/architecture.md § 7 的「截断要有信号」）。
 */
import type { SshHostEntry } from './ssh.js';
/** 单文件最多产出多少条连接簿候选（防异常巨型文件）。 */
export declare const MAX_IMPORT_ENTRIES = 100;
/** `proxy` 名单最多回报多少个块名（超出的只计数）：导入提示不该被一份巨型配置撑爆。 */
export declare const MAX_PROXY_NAMES = 50;
/** `parseSshConfigDetailed` 的结果：候选 + **每一种丢弃都要有信号**。 */
export interface ParseSshConfigResult {
    entries: SshHostEntry[];
    /** 依赖跳板机（ProxyJump / ProxyCommand）被跳过的块名（最多 MAX_PROXY_NAMES 个）。 */
    proxy: string[];
    /** 依赖跳板机的块总数（即使名单被截断，这个数也是准的）。 */
    proxyCount: number;
    /** 其余跳过（通配 / 否定 Host 模式、没有 User）的块数。 */
    skippedOther: number;
    /** 超过 MAX_IMPORT_ENTRIES 被丢弃的块数。 */
    droppedOverflow: number;
}
export declare function parseSshConfigDetailed(text: string): ParseSshConfigResult;
/** 只要导入候选（老调用点与既有用例的形状）；需要「跳过了什么」时用 detailed 版。 */
export declare function parseSshConfig(text: string): SshHostEntry[];
