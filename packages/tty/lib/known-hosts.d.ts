import type { HostKeyRecord } from './ssh.js';
/**
 * 解析 known_hosts 文本。candidates 用于还原 hashed 条目（传连接簿里的
 * 主机名即可；无 hashed 条目时可省略）。返回按 host:port 聚合的记录
 * （同机的全部指纹进同一条记录的 fingerprints，保序去重）。
 */
export declare function parseKnownHosts(text: string, candidates?: string[]): HostKeyRecord[];
/** 同 parseKnownHosts，另带 truncated 标记（导入 >500 条时 UI 明确提示有遗漏，不再静默）。 */
export declare function parseKnownHostsDetailed(text: string, candidates?: string[]): {
    entries: HostKeyRecord[];
    truncated: boolean;
};
