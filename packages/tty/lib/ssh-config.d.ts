/**
 * @hyzyn/dsh-tty — ~/.ssh/config 迷你解析器（连接簿导入候选）。
 *
 * 宽容优先：目标是把常见配置安全搬进连接簿，而不是完整实现 OpenSSH 语法——
 *   - 键大小写不敏感，`key value` 与 `key=value` 都收；
 *   - `Host` 多模式时只收「全具体」块（任一模式含 * ? ! 或首字符为空格否定
 *     即整块跳过），块名取第一个模式；
 *   - 只映射 HostName / User / Port / IdentityFile；Include 不展开（跳过），
 *     其余选项（ProxyJump、ServerAliveInterval 等）原样忽略；
 *   - 没有 User 的块无法构成连接簿条目（username 必填），跳过；
 *   - IdentityFile 取第一个 → auth=key + keyPath，否则 auth=agent；
 *   - 单文件最多产出 100 条，超出丢弃（防异常巨型文件）。
 */
import type { SshHostEntry } from './ssh.js';
export declare function parseSshConfig(text: string): SshHostEntry[];
