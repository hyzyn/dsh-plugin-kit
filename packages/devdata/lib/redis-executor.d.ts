/**
 * Redis 的**通路 A** 执行器：从 DSH 宿主直连 Redis，用自写 RESP（零依赖）。
 *
 * ## 它是什么、不是什么
 *
 * - 它是 `ToolExecutor` 的一个实现——**内核不认识它**（`tool.ts` 只依赖那个接口）；
 * - 它**不做裁决**：命令在进来之前已经被 `parseRedisCommand` + `adjudicate` + 能力闸门判过。
 *   所以这里**不再解析一遍命令文本**（那会造第二个解析器），只把已经裁决过的 `args.raw`
 *   切开发出去（切分复用 `redisArgv`，唯一实现）。
 * - 它**不写日志**：`AUTH` 的密码经这里的代码流过，任何 `console.log` 都会把它带到日志里。
 *
 * ## 为什么连接信息在这里而不在 `DevDataTarget` 上
 *
 * 内核**不认识连接**（`DevDataTarget` 只有 id / 引擎 / 环境 / 作用域 / 能力 / 凭据引用）——
 * 这正是「内核不依赖驱动」的体现。所以「target id → host:port」这张表由宿主在构造执行器时给。
 *
 * ## 已知边界（2026-10-02 真机确认）
 *
 * 目标 `248` 那台是 **Redis 4.0.14、无密码、且没有 ACL**——所以「只读账号」那层**不可能存在**，
 * 只读**只**由代码层（白名单 + 矩阵 + 能力闸门）保证。见 `docs/devdata-plan.md` §8。
 */
import type { ToolExecutor } from './tool.js';
import { type RespReply } from './resp.js';
import { type ShapedResult } from './sql.js';
/** 一个 Redis 连接（通路 A：从本进程直连）。 */
export interface RedisConnection {
    host: string;
    port: number;
    /**
     * `AUTH` 用的密码。**调用方负责解析**（如 `env:NAME` / 凭据存储），解析出来才放这儿；
     * 本模块只在 `AUTH` 那一帧用到它，不落日志、不进错误消息。
     */
    password?: string;
    /** `SELECT` 到哪个库（缺省不动，即 0）。 */
    db?: number;
}
export interface RedisExecutorOptions {
    /** `target id` → 连接信息。**没配的 target 会得到一句可执行的错**，而不是静默。 */
    connections: Readonly<Record<string, RedisConnection>>;
    /** 解析凭据引用（`env:` / 其它）。给了就用它换 `AUTH` 密码。 */
    resolveSecret?: (ref: string) => Promise<string | undefined>;
    /** 单次连接 + 命令的超时（毫秒）。缺省 5000——**共享环境里不能让一条命令把调用挂住**。 */
    timeoutMs?: number;
    /** 单次回复的字节上限（透传给 RESP 解析器）。 */
    maxReplyBytes?: number;
}
/** RESP 回复 → 普通 JS 值（这就是「引擎实现负责整形」的那一步）。 */
export declare function shapeReply(reply: RespReply): unknown;
/**
 * 把整形后的回复摊成断言库要的**表格**（`verify-run.ts` 的执行通道用它）。
 *
 * `shapeReply` 给的是**裸值**（`PING` → `'PONG'`、`DBSIZE` → number、`SCAN` → `[游标, [键]]`），
 * 命令原文入口照原样交付给 agent（那一层没有表格的概念）；而 `evaluateAssertion` 读的是
 * `ShapedResult` 的 `rows` / `rowCount` / `truncated`——两者之间这一跳没有别的现成实现，
 * 所以在这里补齐，口径只有一条：
 *
 * - **顶层元素一行、列名 `value`**：标量（`'PONG'` / 数字）→ 1 行；数组 → 每个元素一行
 *   （`LRANGE` 这类列表命令因此能逐行比，`rowCount` 也就是元素个数）；
 * - **`nil`（键不存在）→ 空结果**（0 行）：于是值类算子记 `unknown`「结果集是空的」，
 *   而 `rowCount: 0` 是有意义的——「有没有」请用 `EXISTS` / `rowCount` 表达，别拿 `eq` 去比一个
 *   不存在的值（那会得到「验不了」而不是「没验过」）。
 *
 * **上限今天就是「不截断」**：执行器没配 `maxReplyBytes`，回复已经整条读进来了，再在这里另造一个
 * 行数上限只会让 `truncated` 说一句执行层没做的事。将来执行器给回复加上限时，把那个值接到
 * `maxRows` 上（别另造一个数）。
 */
export declare function shapeReplyAsResult(value: unknown, options?: {
    maxRows?: number;
}): ShapedResult;
/**
 * 造一个 Redis 通路 A 执行器。
 *
 * 失败一律转成 `{ ok: false, message }`——**包含协议错与超时**：把「Redis 没回话」说成
 * 执行成功会让上层拿着空结果去做断言，那比报错坏得多。
 */
export declare function createRedisExecutor(options: RedisExecutorOptions): ToolExecutor;
