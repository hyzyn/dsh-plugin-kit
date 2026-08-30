import type { HostKeyRecord } from './ssh.js';
/**
 * 解析 known_hosts 文本。candidates 用于还原 hashed 条目（传连接簿里的
 * 主机名即可；无 hashed 条目时可省略）。返回按 host:port 去重后的记录。
 */
export declare function parseKnownHosts(text: string, candidates?: string[]): HostKeyRecord[];
