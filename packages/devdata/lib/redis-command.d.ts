/**
 * Redis 命令解析：把「某一族动作」落到**具体哪条命令**上。
 *
 * ## 为什么这一档比 SQL 更需要解析层
 *
 * SQL 档有**库账号**兜底——代码写错也翻不了车。**Redis 没有只读账号这回事**：
 * 一条连接就是读写同权，「受限」只能靠命令白名单。所以这一层的漏判**没有第二层网**，
 * 它自己就是那道网。
 *
 * 矩阵（`operations.ts`）管的是「这一族允不允许」（`get` 允许、`keys` 要单独授权、`set` 要写授权），
 * 本模块管的是「这条具体命令属于哪一族、它动的是哪个 key」。
 *
 * ## 三条判据
 *
 * 1. **未登记的命令一律拒**（与 SQL 侧同一条口径）——不认识的命令被放行就是一条没被审过的路径；
 * 2. **`SCAN` 的 `COUNT` 只能收紧**：候选可以请求更小，请求更大被夹回策略上限。
 *    理由与行数上限相同——`SCAN` 是这一档唯一的遍历手段（`KEYS` 被单独授权），
 *    而一次 `COUNT 1000000` 等于把整个键空间拖进上下文；
 * 3. **写操作要说清「改的是哪个 key」**：`write-scoped` 必须解析出目标 key，
 *    解析不出来就拒——审计里写不出「改了什么」的写操作不该放行。
 *
 * ## 一处刻意的严格
 *
 * `INFO everything` / `INFO ALL` 归为**危险读**（它把全部节一次吐出，包含客户端与命令统计），
 * 而单个节（`INFO memory`）是普通读。同一个命令按参数分档，这在 Redis 侧是常态。
 */
import type { OperationClass } from './operations.js';
/** 命令解析结果。 */
export interface RedisCommand {
    /** 归一化后的命令名（大写，去掉 `COMMAND` 前缀形式）。 */
    name: string;
    /** 参数（`name` 之后的原样 token）。 */
    args: readonly string[];
    /** 归类。 */
    kind: OperationClass;
    /** 目标 key（能解析出来时）。写类**必须**有，否则拒绝。 */
    key?: string;
    /** 被夹紧过的 `SCAN` COUNT（`undefined` = 没给）。 */
    count?: number;
    /** 诊断用：这条命令为什么被这样归类。 */
    note?: string;
}
/** 解析结果：要么得到一条命令，要么被拒。 */
export type RedisParse = {
    ok: true;
    command: RedisCommand;
} | {
    ok: false;
    reason: RedisParseRejection;
    detail?: string;
    hint: string;
};
/** 拒绝原因。 */
export type RedisParseRejection = 
/** 空输入。 */
'EMPTY'
/** 未登记的命令（**不认识的命令不放行**）。 */
 | 'UNKNOWN_COMMAND'
/** 命令在 `never` 档（不提供入口）。 */
 | 'FORBIDDEN_COMMAND'
/** 危险读（需单独授权）——解析层如实归类，放行与否由裁决层定。 */
 | 'DANGEROUS_READ'
/** 写命令没解析出目标 key。 */
 | 'KEY_REQUIRED'
/** 命令里带壳（`EVAL` / `MULTI` 之类），一律拒。 */
 | 'CONTAINER_COMMAND';
/**
 * 解析一条 Redis 命令（**纯字符串处理，不连任何东西**）。
 *
 * @param raw - 命令原文（如 `GET user:1`）
 * @param maxScanCount - `SCAN` 族 `COUNT` 的策略上限；候选只能请求更小
 */
/**
 * 命令原文 → argv（**唯一的切分实现**）。
 *
 * 执行器也要切同一份原文（内核把 `raw` 交给它，而不是把解析结果塞给它——那会改内核契约）。
 * 两处各写一个切分就是**两个解析器**，而它们迟早会漂：以后若支持引号包裹的参数
 * （`SET k "a b"`），只改一边就会出现「裁决时按 3 段、执行时按 4 段」这种最难查的错位。
 */
export declare function redisArgv(raw: string): string[];
export declare function parseRedisCommand(raw: string, maxScanCount: number): RedisParse;
/**
 * 把解析结果映射到矩阵里的**动作名**（供裁决层用）。
 *
 * 三条映射口径：
 *   - `get` / `search` / `info` 是**族名**，一条命令落到哪一族由命令名定（`SCAN` 族 → `search`）；
 *   - 危险读落到矩阵里**同名**的动作（`KEYS` → `keys`、`MONITOR` → `monitor`），
 *     这样闸门按动作取能力规格，与用户在目标上配的东西对得上；
 *   - 写命令按可逆性分组（删除 → `del`、改 TTL → `expire`、其余 → `set`）。
 */
export declare function actionOf(command: RedisCommand): string;
/** 结构化工具参数（`ToolExecutor.run` 收的形状）。 */
export interface RedisCommandArgs extends Readonly<Record<string, unknown>> {
    /** 命令原文（**照原样传**：执行器直接拿它下发，不重新拼一条可能与审过的不同的命令）。 */
    raw: string;
    /** 目标 key（写类必有；读类能解析出来时也有）。 */
    key?: string;
    /** 被夹紧过的 `SCAN` `COUNT`；不给 = 没提，由策略默认决定。 */
    count?: number;
    /** 写命令的**第一个值参数**。只作为审计用的最小上下文——执行器必须用 `raw`。 */
    value?: string;
}
/**
 * 把一条解析通过的命令转成结构化工具参数。
 *
 * ## 为什么执行器必须照着 `raw` 下发，而不是照这些字段重新拼
 *
 * 因为**审计的是原文，下发的是拼装结果**就是一条 TOCTOU 缝：解析层看过的字符串与真正执行的
 * 字符串成了两份，任何一处转义 / 归一化差异都可能让「审过的」与「跑了的」不是同一条命令
 * （`SET k "a b"` 这类带空格的参数尤其明显）。所以这里给的字段是**给裁决与审计用的上下文**，
 * 不是重建命令的配方。
 */
export declare function commandArgs(command: RedisCommand, raw: string): RedisCommandArgs;
