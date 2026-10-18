/** 定位 / 替换托管区块所需的标记（均按整行匹配，仅容忍行尾空白）。 */
export interface ManagedBlockMarkers {
    /** 起始标记行，如 `# --- dsh-env-manager managed (auto-generated; do not edit) ---`。 */
    beginMarker: string;
    /** 结束标记行，如 `# --- end dsh-env-manager managed ---`。 */
    endMarker: string;
}
/** spliceManagedBlock 的入参：标记 + 新区块正文（不含标记行）。 */
export interface SpliceManagedBlockOptions extends ManagedBlockMarkers {
    /** 新区块正文（不含标记行）；空串表示删除整个区块。 */
    body: string;
}
/**
 * 把「只有注释 + `[]`」的那个空根从文本里摘掉（摘掉后注释与其它内容逐字节保留）。
 *
 * 返回 `undefined` 表示**不该动**：文本里没有空根，或有空根但还夹着别的结构。
 * 调用方按「是否有返回值」决定要不要走替换路径——不要用返回空串来判断，
 * 因为「摘掉空根后只剩注释」是合法且必须替换的情形。
 *
 * 已经写出坏文件（`[]` + 托管区块）也能靠它自愈：先摘空根，再就地替换区块，
 * 于是下一次写入就把非法根修掉了，不需要用户手工删行。
 */
export declare function stripEmptyFlowSequenceRoot(text: string): string | undefined;
/**
 * 行数组版的 {@link stripEmptyFlowSequenceRoot}：返回摘掉空根后的新数组。
 *
 * 供「本来就在行数组上作业」的调用方（如 codegraph 的 syncManagedMcpRow）使用，
 * 单独给一个函数是因为那里的 `changed` 标志与行数组是同一份数据，直接改文本再切行
 * 会丢掉行尾 / 空行信息。
 */
export declare function stripEmptyFlowSequenceRootLines(lines: string[]): {
    lines: string[];
    changed: boolean;
};
/**
 * 纯函数：把托管区块（含首尾标记行）拼进文本，返回新文本。
 *
 * - 已有完整区块：整体替换为「标记 + body + 标记」，区块外内容不动；
 * - 无起始标记：追加到文件末尾（非空文件前留一个空行）；
 * - 起始标记存在但缺结束标记（文件损坏 / 手改）：只替换起始标记行，保留其后
 *   所有内容，避免误删用户数据；
 * - body 为空串：删除整个区块（含标记），同样只动标记之间的范围。
 */
export declare function spliceManagedBlock(text: string, options: SpliceManagedBlockOptions): string;
/**
 * 读取标记之间的区块正文（不含标记行本身）。
 * 无起始标记或缺少结束标记都返回 undefined——后者说明文件被手改坏 / 写坏了，
 * 调用方应报错而不是拿半截内容当合法结果（env / mcp 的 readManaged* 同此语义）。
 */
export declare function readManagedBlock(text: string, markers: ManagedBlockMarkers): {
    body: string;
} | undefined;
/**
 * 原子写入文件：先写同目录临时文件再 rename 覆盖。
 *
 * 为什么必须 rename：直接 writeFileSync 到目标路径时，「截断 → 写入」期间另一
 * 个读者（DSH 的配置 watch / 另一个插件实例）会看到半截内容甚至空文件；rename
 * 在 POSIX 上是原子的，读者要么看到旧全文、要么看到新全文。临时文件必须与目标
 * 同目录（跨文件系统的 rename 会退化成复制，失去原子性）。
 *
 * mode 默认 0600（配置文件常含密钥）。**写入后再显式 chmod 一次**：
 * `writeFileSync` 的 mode 会被进程 umask 进一步收紧（`mode & ~umask`），于是同一个调用在
 * umask 0 的机器上得到 0640、在 umask 077 的机器上得到 0600——权限本该是**确定的**（它管的
 * 就是配置/密钥文件的可见范围），不该随调用方的 umask 漂。
 * 这不是放宽：chmod 到调用方要的 mode，最宽不会超过它（`writeFileSync` 那一步仍先按 umask
 * 收紧创建，chmod 只补回被 umask 削掉的位）。
 *
 * 2026-09-26 在 Ubuntu 真机（root，umask 077）上被 `packages/kit/test/kit.test.ts` 的 0640
 * 断言抓到：本机 DSH 宿主的 umask 是 0，所以本地一直绿。
 */
export declare function writeFileAtomic(file: string, data: string, mode?: number): void;
