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
    mkdir(spec: SshSpec, path: string): Promise<void>;
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
    private readdir;
    private removeEntry;
}
