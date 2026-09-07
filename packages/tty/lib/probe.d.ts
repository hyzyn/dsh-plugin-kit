import type { HostKeyStore, SshSpec } from './ssh.js';
/** TCP 预检超时（毫秒）：DNS 解析 + 建连。 */
export declare const PROBE_TCP_TIMEOUT_MS = 6000;
/** ssh2 握手/认证阶段超时（毫秒）；覆盖 buildConnectConfig 的 readyTimeout。 */
export declare const PROBE_AUTH_TIMEOUT_MS = 8000;
/** 分类结果载荷（HTTP 回传；字段全部可 JSON）。 */
export interface ProbeResult {
    /** tcp 阶段：DNS 解析 + TCP 建连。 */
    tcp: {
        ok: boolean;
        error?: string;
        ms?: number;
    };
    /** hostkey 阶段：TOFU 比对（未到握手时为 unknown）。 */
    hostkey: {
        state: 'unknown' | 'matched' | 'recorded' | 'mismatch';
        /** 服务端 host key 的 sha256 指纹（hostHash:'sha256' 下 hostVerifier 收到的原样值）。 */
        fingerprint: string;
        /** 已记录指纹（mismatch 时展示对照）。 */
        known?: string;
        /** mismatch 时的完整指引文案（与 spawnSsh 一致）。 */
        error?: string;
    };
    /** auth 阶段：认证是否通过（ready）。 */
    auth: {
        ok: boolean;
        error?: string;
        ms?: number;
    };
    /** 总耗时。 */
    totalMs: number;
}
/** 仅校验一份连接簿 / 对话框条目的形状（新增 / 编辑前先过一遍；不做网络请求）。 */
export declare function validateSshFields(input: Record<string, unknown>): {
    spec?: SshSpec;
    error?: string;
};
/**
 * 单次连接诊断。无论成败都会关闭连接、在超时内返回，绝不悬挂。
 * 分类见文件头；tcp 预检通过后才进入 ssh2 握手。
 */
export declare function probeSsh(spec: SshSpec, store?: HostKeyStore): Promise<ProbeResult>;
