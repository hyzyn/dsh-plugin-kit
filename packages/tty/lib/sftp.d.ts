import type { ReadStream, WriteStream } from 'ssh2';
import type { HostKeyStore, SshSpec } from './ssh.js';
/**
 * remove 的路径护栏（0.19.0，纵深防御）：递归删除按账号权限生效、无二次确认、
 * 无干跑——根目录 / home / 纯相对跳跃段一次调用就是整树删除。挂在 SftpManager
 * 层而非只在 agent 工具层，loopback 上的构造请求（面板路由透传原始 path）同样
 * 被拦；「必然是误操作」的形态才拒，具体某个子目录仍由调用方负责。
 */
export declare function assertRemovableRemotePath(raw: string): string;
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
    /** 写入完成（流 close，覆盖写含 rename 落盘）resolve，写入失败 reject——路由 await 它再回包。 */
    done: Promise<void>;
    /**
     * 实际写入的路径：覆盖写 = 同目录临时分片（`.dsh-part-<uuid>`，成功后 rename
     * 覆盖目标）；追加写 = 目标本身。取消 / 中断后的半截清理一律按它来——
     * 不能删目标（覆盖写的目标还是原文件，删了就是毁数据）。
     */
    writePath: string;
}
/**
 * 传输任务（0.12.0）：双栏 ⇨/⇦ 的服务端直传任务化——start 立刻返回 id，
 * 客户端轮询 /cancel 端点中止。无它时一个目录递归直传在 HTTP 请求里同步跑
 * 完，浏览器无法打断（只能关窗口，服务端还在写远端）。
 */
export interface SftpTransferJob {
    id: string;
    direction: 'up' | 'down';
    /** 起始路径对（进度行展示用）。 */
    localPath: string;
    remotePath: string;
    /** 已完成字节 / 总字节（总字节在开传前递归统计，统计中可为 0）。 */
    bytes: number;
    total: number;
    /** 当前正在搬运的文件相对名（展示用）。 */
    current: string;
    state: 'running' | 'done' | 'error' | 'canceled';
    error?: string;
}
/** 取消感知的传输选项（直传任务内部用；HTTP 上传/下载路由不传 signal）。 */
export interface SftpTransferOptions {
    signal?: AbortSignal;
    /** 每搬运一个文件前回调（进度行显示当前文件名）。 */
    onFile?: (name: string) => void;
    /** 字节累加（进度条分子）。 */
    onBytes?: (delta: number) => void;
}
export declare class SftpManager {
    private readonly logger;
    private readonly store;
    private readonly conns;
    private sweeper;
    private readonly jobs;
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
     * 文件 unlink（不跟随）。入口过 assertRemovableRemotePath 护栏（根目录 /
     * home / 相对跳跃段直接拒绝——agent 工具与面板 HTTP 路由共用本方法）。
     */
    remove(spec: SshSpec, path: string, recursive: boolean): Promise<void>;
    /**
     * 下载：返回只读流（路由负责 pipe 到 HTTP 响应与销毁）。
     * 先 stat 探测（0.19.0）：「路径不存在 / 是目录」在这里变成明确报错——
     * 此前 stat 失败被吞、路由已 writeHead(200)，客户端见 res.ok===true 后以
     * TypeError 断流收场，状态行只剩「Failed to fetch」这类无信息文案。
     */
    openDownload(spec: SshSpec, path: string, options?: {
        offset?: number;
    }): Promise<SftpDownload>;
    /**
     * 上传：返回可写流与完成信号（路由 pipe 请求体，await done 后回包）。
     *
     * 覆盖写原子化（0.19.0）：`flags:'w'` 直接写目标会先截断原文件，途中任何
     * 失败（磁盘满 / 权限变化 / 通道断 / 客户端断连）都留下「原文件被毁 + 半截
     * 新文件」。改为写同目录临时分片 `.dsh-part-<uuid>`，流正常收尾后 posix-rename
     * （不支持该扩展的 server 退 unlink+rename）覆盖目标；失败 / 取消统一清理
     * 分片，原文件全程不受影响。done 只在分片真正落盘（rename 成功）后 resolve。
     */
    openUpload(spec: SshSpec, path: string, append?: boolean): Promise<SftpUpload>;
    /**
     * 同目录崩溃残留分片回收：`<basename>.dsh-part-*` 且 mtime 超过阈值才删
     * （并发上传的新分片 mtime 很新，不会被误删）；一切失败静默。
     */
    private reapStaleParts;
    /** WriteStream 的 done Promise（close 即 resolve，error reject）；onClose 钩子供覆盖写路径塞落盘逻辑。 */
    private streamDone;
    /**
     * 覆盖落盘：优先 posix-rename@openssh.com（原子覆盖，OpenSSH 系全支持）；
     * server 不支持该扩展时退 unlink+rename——窗口极小（新内容已在分片里完整
     * 落盘），不会出现「截断后写一半」的旧问题。
     */
    private renameOverwrite;
    /**
     * 本机文件 / 目录 → 远程（双栏「→ 传输」）。目录递归建目录后逐个上传；
     * 同名文件直接覆盖（openUpload 走临时分片 + rename，见其注释）。不经过
     * 浏览器，字节不出宿主进程。signal 中止时销毁读写流并清理半截的远程
     * 分片（删除失败只记日志）。
     *
     * 符号链接：根路径按用户显式选择跟随（fsStat）；子项一律跳过（含指到
     * 文件的链接）——`current -> .` 这类环会让递归永不收敛，直到 ENAMETOOLONG
     * 或磁盘灌满；depth 兜底只为防未来的回归，不是主防线。
     */
    uploadFromLocal(spec: SshSpec, localPath: string, remotePath: string, options?: SftpTransferOptions, depth?: number): Promise<void>;
    /**
     * 远程文件 / 目录 → 本机（双栏「← 传输」）。目录递归建本地目录后逐个下载；
     * 同名文件直接覆盖（'w' 写流）。符号链接不作为目录下钻（readdir attrs 的
     * isDirectory 跟随 isSymbolicLink 才算目录）——防 `current -> .` 环；根路径
     * 是链接时按文件下载（读取跟随目标，指向目录则传输报错）。
     * signal 中止时销毁读写流并删除半截的本机文件（删除失败只记日志）。
     */
    downloadToLocal(spec: SshSpec, remotePath: string, localPath: string, options?: SftpTransferOptions, depth?: number): Promise<void>;
    /**
     * 带字节计数与取消感知的 pipe：source→sink 之间插一个 PassThrough 只做
     * 「数了就转发」；取消时 destroy 它——pipeline 随即结束并销毁两端流，
     * 不留悬挂的 SFTP 句柄，也不会误报成「传输失败」。
     * abort 监听器在管道收尾时摘除：signal 是整个任务共用的（每个文件都挂
     * 一个），不摘的话 N 文件 = N 个常驻监听器，取消时 N 个已结束的 meter
     * 齐刷刷被 destroy（Node 会报 MaxListenersExceededWarning）。
     */
    private pipeCounted;
    /** 删远端文件（取消后的半截清理）：失败只记日志，不影响取消本身。 */
    deleteRemoteQuiet(spec: SshSpec, path: string): Promise<void>;
    /**
     * 预扫描总字节数（直传进度分母）：目录递归累加文件大小，只数「源头一侧」
     * ——up 数本机、down 数远程（对侧尚未创建，数不到也不该数）。目的是让
     * 进度条有真实百分比：纯统计（不搬运），单项失败按 0 计、不阻断传输。
     * 与传输本体同一套符号链接规则（子项跳过）+ 取消检查——统计也会走环。
     */
    private estimateBytes;
    /** 开一个可取消的直传任务（路由 /transfer 的 start 分支）。 */
    startTransfer(spec: SshSpec, direction: 'up' | 'down', localPath: string, remotePath: string): SftpTransferJob;
    /** 任务快照（路由 /transfer?job=<id> 轮询）。 */
    getTransfer(id: string): SftpTransferJob | undefined;
    /** 中止任务（路由 /transfer 的 cancel 分支）；已终态的任务返回 undefined。 */
    cancelTransfer(id: string): SftpTransferJob | undefined;
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
