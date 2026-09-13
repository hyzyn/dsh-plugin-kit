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
 * mode 默认 0600（配置文件常含密钥）；writeFileSync 的 mode 只会被 umask 进
 * 一步收紧、不会放宽，所以最终权限不会比 mode 更宽。
 */
export declare function writeFileAtomic(file: string, data: string, mode?: number): void;
