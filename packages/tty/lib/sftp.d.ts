import type { ReadStream, WriteStream } from 'ssh2';
import type { HostKeyStore, SshSpec } from './ssh.js';
export interface SftpEntryInfo {
    name: string;
    isDir: boolean;
    isFile: boolean;
    isSymlink: boolean;
    size: number;
    /** 毫秒时间戳（SFTP attrs 为秒，这里统一乘 1000）。 */
    mtime: number;
}
export interface SftpListResult {
    /** 实际列出的目录（入参为空时经 realpath 解析为登录 home）。 */
    path: string;
    entries: SftpEntryInfo[];
}
export interface SftpTreeEntry {
    /** 从 tree 根出发的绝对路径。 */
    path: string;
    name: string;
    /** 相对根的层级（根的直接子项为 1）。 */
    depth: number;
    isDir: boolean;
    size: number;
    mtime: number;
}
export interface SftpTreeResult {
    path: string;
    entries: SftpTreeEntry[];
    /** 因 maxDepth / maxEntries 截断（还有未列举的内容）。 */
    truncated: boolean;
    /** 读取失败的子目录（权限等），最多保留 10 条。 */
    errors: Array<{
        path: string;
        message: string;
    }>;
}
export interface SftpLogger {
    info(msg: string): void;
    warn(msg: string): void;
}
export interface SftpDownload {
    stream: ReadStream;
    /** 文件字节数（stat 失败时为 null，响应不带 content-length）。 */
    size: number | null;
}
export interface SftpUpload {
    stream: WriteStream;
    /** 写入完成（流 close）resolve，写入失败 reject——路由 await 它再回包。 */
    done: Promise<void>;
}
export declare class SftpManager {
    private readonly logger;
    private readonly store;
    private readonly conns;
    private sweeper;
    constructor(logger: SftpLogger, store: HostKeyStore);
    /** 插件卸载：关定时器与全部连接（幂等）。 */
    disposeAll(): void;
    /** 目录列表；path 为空时 realpath('.') 解析登录 home 并回传实际路径。 */
    list(spec: SshSpec, path: string): Promise<SftpListResult>;
    /**
     * 创建目录。parents:true 时等效 mkdir -p（自底向上）：先直接建目标，
     * 失败且目标确不存在时向最近的祖先逐级补齐——不从文件系统根逐级 stat
     * （往返少，也不要求对中间层级有探测权限）；「已存在且是目录」视为
     * 成功，同名非目录明确报错；补齐后重试仍失败再兜底 stat 防并发竞态。
     */
    mkdir(spec: SshSpec, path: string, parents?: boolean): Promise<void>;
    /**
     * 递归列举（agent sftp_tree 用）：深度优先、目录优先（与 list 同排序），
     * maxDepth（1~8，默认 3）限层、maxEntries（1~2000，默认 500）限条数，
     * 超限置 truncated；符号链接不跟随（防环），仅作条目呈现；读取失败的
     * 子目录记入 errors（权限等）并继续。
     */
    tree(spec: SshSpec, path: string, options?: {
        maxDepth?: number;
        maxEntries?: number;
    }): Promise<SftpTreeResult>;
    rename(spec: SshSpec, from: string, to: string): Promise<void>;
    /**
     * 删除文件 / 目录。目录不带 recursive 时走 rmdir（非空会明确报错）；
     * 带 recursive 时 readdir 深度优先逐个 unlink/rmdir。符号链接一律按
     * 文件 unlink（不跟随）。
     */
    remove(spec: SshSpec, path: string, recursive: boolean): Promise<void>;
    /** 下载：返回只读流（路由负责 pipe 到 HTTP 响应与销毁）。 */
    openDownload(spec: SshSpec, path: string): Promise<SftpDownload>;
    /** 上传：返回可写流与完成信号（路由 pipe 请求体，await done 后回包）。 */
    openUpload(spec: SshSpec, path: string, append?: boolean): Promise<SftpUpload>;
    /** 取（或建立）该 spec 的 SFTP 通道；连接断开的旧条目在此处自动重建。 */
    private acquire;
    private ensureSweeper;
    private close;
    private realpath;
    /** stat 的静默版：路径不存在等错误一律回 null（mkdir -p 的逐级探测用）。 */
    private statQuiet;
    private mkdirOne;
    private readdir;
    private removeEntry;
}
