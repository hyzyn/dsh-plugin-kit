/**
 * 子进程输出的编码容错解码。
 *
 * 问题：Windows 上 cmd.exe **自己的**错误消息（`'foo' 不是内部或外部命令，也不是
 * 可运行的程序或批处理文件。`）按**控制台代码页**写进管道——中文系统是 CP936，
 * 而 `Buffer#toString()` / `TextDecoder` 默认按 UTF-8 解，于是卡片上那句报错变成
 * `'foo' �����ڲ����ⲿ���Ҳ���ǿ����еĳ�����������ļ���`，可诊断性归零。
 *
 * 解法：先按**严格** UTF-8 试解；一旦遇到真正非法的字节序列，就把**这一路流**整体
 * 回落到控制台代码页重解一次，之后固定用该编码。判定只在开头的一段回放窗口内进行
 * （见 `REPLAY_WINDOW_BYTES`），所以既是 O(n)、也不需要无限缓冲。
 *
 * 两个刻意的设计：
 *   - **UTF-8 仍是主路径**：Node 写的 CLI、SSH 输出、MCP 协议……绝大多数是 UTF-8，
 *     严格解码成功就直接产出，不做任何猜测。
 *   - **按流实例独立**：stdout 与 stderr 各持一个解码器。实测同一进程里 stdout 是
 *     UTF-8、stderr 是 CP936 完全正常（cmd.exe 的报错走 stderr，CLI 的 JSON 走
 *     stdout），共用一个解码器反而会把两边一起带偏。
 */
/**
 * 控制台代码页号 → 可用的 WHATWG 编码标签；无对应（或本机 Node 缺表）时返回 undefined，
 * 由调用方回落到 `windows-1252`。
 *
 * 单独导出是为了能断言「437 / 850 必须返回 undefined」这条刻意的决定（见表中注释）——
 * 它们没有 WHATWG 标签，硬指一个错的会把西欧文本解成西里尔。
 */
export declare function codePageEncoding(codePage: number): string | undefined;
/**
 * 当前进程所在控制台的输出代码页（非 Windows 恒为 UTF-8），结果进程内缓存。
 *
 * 用 `chcp` 而不是注册表：注册表给的是系统 ANSI 代码页，而 cmd.exe 写管道用的是
 * **控制台输出**代码页，两者在 `chcp` 改过之后会不一致。取不到时回落到
 * `windows-1252`——单字节表不依赖 ICU，永远可用，至少不会把字节丢掉。
 */
export declare function consoleEncoding(): string;
/** 供测试重置进程内缓存（真机上不必调用）。 */
export declare function resetConsoleEncodingCache(): void;
export interface OutputDecoderOptions {
    /**
     * 非 UTF-8 时使用的编码标签；缺省取 `consoleEncoding()`。
     * 显式传 `'utf-8'` 表示「只可能是 UTF-8，非法字节按替换字符处理」。
     */
    fallbackEncoding?: string;
}
export interface OutputDecoder {
    /** 吃一块输出，返回可以立即交付的文本（不完整的字节留在内部）。 */
    decode(chunk: Uint8Array | string): string;
    /** 流结束时调用：吐出内部残留字节对应的文本。 */
    flush(): string;
}
/**
 * 建一个容错解码器。用法与 `TextDecoder` 的流式模式一致，但**不会**因为
 * 「块边界切在多字节字符中间」而误判编码（严格解码器把不完整尾巴留在内部，
 * 不抛错），所以可以安全地按 `data` 事件逐块喂。
 */
export declare function createOutputDecoder(options?: OutputDecoderOptions): OutputDecoder;
/**
 * 一次性解码整段输出（用于已经把全部字节攒在手里的场景，如 `execFile` 的
 * `encoding: 'buffer'`）。等价于 `createOutputDecoder().decode(buf) + flush()`。
 */
export declare function decodeOutput(buf: Uint8Array, options?: OutputDecoderOptions): string;
