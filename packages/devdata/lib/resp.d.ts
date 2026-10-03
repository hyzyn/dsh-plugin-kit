/**
 * 极简 RESP 客户端编解码（零依赖）。
 *
 * ## 为什么自写而不是装 `ioredis`
 *
 * ① 规矩：**引擎驱动一律可选、本包 `dependencies` 里一个驱动都没有**（见 `docs/devdata-plan.md`
 *   §2.4）；② RESP 本身很小（本文件就是全部），值不上一个依赖；
 * ③ 这套件要的不是一个完整客户端，而是「**发一条已裁决过的命令、把回复解析出来**」。
 *
 * ## 这里真正难的地方（也是本文件为什么值得单测）
 *
 * - **回复必须按字节解析**：bulk 的长度是**字节数**，而多字节字符可能跨 TCP 分块——先 `toString('utf8')`
 *   再切会把字符切坏；
 * - **一次 read 不等于一条回复**：可能半条，也可能两条；
 * - **`null` 与空串不是一回事**：`$-1\r\n`（键不存在）与 `$0\r\n\r\n`（空值）语义不同，
 *   合成一个会让上层没法区分「没有这个键」和「值就是空」；
 * - **错误是回复不是异常**：`-ERR ...` 要原样交回上层（它决定怎么报给 agent），不要在这里抛。
 *
 * 本文件**不连任何东西**（纯函数 + 一个增量解析器），所以能在没有 Redis 的情况下被完整测试。
 */
/** 一条 RESP 回复。 */
export type RespReply = {
    kind: 'simple';
    value: string;
}
/** Redis 返回的错误（**是回复，不是异常**）。 */
 | {
    kind: 'error';
    value: string;
} | {
    kind: 'integer';
    value: number;
}
/** `null` = 键不存在（`$-1`）；空串 = 值就是空（`$0`）。**两者不能合并**。 */
 | {
    kind: 'bulk';
    value: string | null;
} | {
    kind: 'array';
    value: RespReply[] | null;
};
/** 把一条命令编成 RESP 数组（客户端发命令的标准形态，不用 inline 以免转义问题）。 */
export declare function encodeCommand(parts: readonly string[]): Buffer;
/** 解析中的异常（**只用于「这个缓冲区不是合法 RESP」**，不用 Redis 自己的错误回复）。 */
export declare class RespProtocolError extends Error {
}
export interface ReplyParser {
    /** 喂一块数据，返回这次能凑齐的完整回复（可能是 0 条、也可能多条）。 */
    feed(chunk: Buffer): RespReply[];
    /** 缓冲区里还没解析完的字节数（用来报「回复不完整」与做上限判断）。 */
    readonly pendingBytes: number;
    /** 缓冲区内容（排障用；**不要**拿去当数据）。 */
    readonly pending: Buffer;
}
export interface ReplyParserOptions {
    /**
     * 缓冲区上限（字节）。**必须有**：对面可以是共享环境里的任何东西，
     * 一条不回头的巨型回复会把内存吃光——那不是「慢」，是打挂自己。
     */
    maxBytes?: number;
}
/**
 * 增量解析器：`feed()` 多少给多少，凑齐一条才吐一条。
 *
 * 用法：`feed(socket chunk)`；`pendingBytes > 0` 说明还有半条挂着。
 */
export declare function createReplyParser(options?: ReplyParserOptions): ReplyParser;
