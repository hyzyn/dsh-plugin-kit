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
import { connect } from 'node:net';
import { redisArgv } from './redis-command.js';
import { RespProtocolError, createReplyParser, encodeCommand } from './resp.js';
import { shapeResult } from './sql.js';
const DEFAULT_TIMEOUT_MS = 5000;
/** RESP 回复 → 普通 JS 值（这就是「引擎实现负责整形」的那一步）。 */
export function shapeReply(reply) {
    switch (reply.kind) {
        case 'simple':
            return reply.value;
        case 'integer':
            return reply.value;
        case 'bulk':
            return reply.value;
        case 'error':
            // 错误**不该**走到这里（`run` 会把它变成 ok:false），但整形函数要对自己完整。
            return `(错误) ${reply.value}`;
        case 'array':
            return reply.value === null ? null : reply.value.map(shapeReply);
    }
}
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
export function shapeReplyAsResult(value, options = {}) {
    const rows = value === null ? [] : Array.isArray(value) ? value : [value];
    return shapeResult(rows, { maxRows: options.maxRows ?? Number.MAX_SAFE_INTEGER, columns: ['value'] });
}
/** 一次请求：连上 → 发（前置命令 + 用户命令）→ 收最后一条回复。 */
async function roundtrip(input) {
    const { connection, argv, timeoutMs } = input;
    const parser = createReplyParser(input.maxReplyBytes === undefined ? {} : { maxBytes: input.maxReplyBytes });
    /*
     * 一条命令 = 一组参数。前置命令（AUTH / SELECT）与用户命令**一次全发**：
     * 少一次往返，也少一个「AUTH 成功但 SELECT 失败」的空窗。
     * 收满 `frames.length` 条回复时，**最后一条**才是用户要的。
     */
    const frames = [];
    if (connection.password !== undefined)
        frames.push(['AUTH', connection.password]);
    if (connection.db !== undefined)
        frames.push(['SELECT', String(connection.db)]);
    frames.push([...argv]);
    return await new Promise((resolve, reject) => {
        const replies = [];
        let settled = false;
        let timer;
        let socket;
        const done = (error, reply) => {
            if (settled)
                return;
            settled = true;
            if (timer !== undefined)
                clearTimeout(timer);
            socket?.removeAllListeners();
            socket?.destroy();
            if (error !== undefined)
                reject(error);
            else
                resolve(reply);
        };
        try {
            socket = connect({ host: connection.host, port: connection.port });
        }
        catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
            return;
        }
        timer = setTimeout(() => {
            done(new Error(`Redis 在 ${String(timeoutMs)}ms 内没有回复（${connection.host}:${String(connection.port)}）`));
        }, timeoutMs);
        socket.on('connect', () => {
            for (const frame of frames)
                socket.write(encodeCommand(frame));
        });
        socket.on('data', (chunk) => {
            try {
                replies.push(...parser.feed(chunk));
            }
            catch (error) {
                done(error instanceof Error ? error : new Error(String(error)));
                return;
            }
            if (replies.length >= frames.length)
                done(undefined, replies[frames.length - 1]);
        });
        socket.on('error', (error) => done(error));
        socket.on('close', () => {
            if (replies.length < frames.length) {
                done(new Error(`连接在收全回复前关闭（已收 ${String(replies.length)}/${String(frames.length)} 条）`));
            }
        });
    });
}
/**
 * 造一个 Redis 通路 A 执行器。
 *
 * 失败一律转成 `{ ok: false, message }`——**包含协议错与超时**：把「Redis 没回话」说成
 * 执行成功会让上层拿着空结果去做断言，那比报错坏得多。
 */
export function createRedisExecutor(options) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    return {
        async run(request) {
            const connection = options.connections[request.target.id];
            if (connection === undefined) {
                return {
                    ok: false,
                    message: `目标 ${request.target.id} 没有配 Redis 连接（执行器只认构造时给的那张表）。` +
                        `恢复路径：在配置里补 ${request.target.id} 的 host/port（通路 A 直连）。`,
                };
            }
            const raw = request.args.raw;
            if (typeof raw !== 'string' || raw.trim() === '') {
                return { ok: false, message: '执行器只接受已裁决的命令原文（args.raw）为空——这条不该走到执行层' };
            }
            // 凭据：target 上给的是**引用**；解析不出来就报清楚，别用空密码去试。
            let password = connection.password;
            if (password === undefined && request.target.credentialRef !== undefined) {
                if (options.resolveSecret === undefined) {
                    return {
                        ok: false,
                        message: `目标 ${request.target.id} 声明了凭据引用，但宿主没提供解析器（resolveSecret）——不知道该拿什么去 AUTH。`,
                    };
                }
                const resolved = await options.resolveSecret(request.target.credentialRef);
                if (resolved === undefined) {
                    return {
                        ok: false,
                        message: `凭据引用 ${request.target.credentialRef} 解析不出值（目标 ${request.target.id}）——不要用空密码重试。`,
                    };
                }
                password = resolved;
            }
            const conn = password === undefined ? connection : { ...connection, password };
            try {
                const reply = await roundtrip({ connection: conn, argv: redisArgv(raw), timeoutMs, ...(options.maxReplyBytes === undefined ? {} : { maxReplyBytes: options.maxReplyBytes }) });
                if (reply.kind === 'error') {
                    // Redis 自己的错误原样带出去：它是排障的第一手信息，包一层会丢字。
                    return { ok: false, message: `Redis 拒绝：${reply.value}` };
                }
                return { ok: true, result: shapeReply(reply) };
            }
            catch (error) {
                if (error instanceof RespProtocolError)
                    return { ok: false, message: `Redis 回复不是合法 RESP：${error.message}` };
                return { ok: false, message: error instanceof Error ? error.message : String(error) };
            }
        },
    };
}
//# sourceMappingURL=redis-executor.js.map