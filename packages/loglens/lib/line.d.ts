/**
 * @hyzyn/dsh-loglens — 行的「可观性」：标签展平 + 级别推断（2026-10-11，真机反馈第 1、7 条）。
 *
 * 为什么单独一层：这两件事**与后端无关**（ES 的 _source、Loki 的流标签、日后的别的后端都要），
 * 而且面板行视图、loglens_context、agent 工具吃的是同一个 LogLine 模型——判据只能有一份。
 *
 * 现场（agent 在真集群上给的批评，代价最大的那条）：filebeat 的文档里 container / host / agent / log
 * **全是嵌套对象**，而第一版只把标量收进 labels，于是 60 行输出里唯一的标签是 stream=stdout——
 * **看不出是哪台机器、哪个容器**。它只能绕出插件用 curl 自己摸，而一绕出去，
 * 出站围栏 / 认证 / 归一化就全没了。
 */
import type { LogLine } from './backends/types.js';
/**
 * 优先键（点分路径）：**谁在写这行**。按这个顺序先占标签名额，剩下的才轮到文档里的其它字段。
 *
 * 顺序就是「排查时先问什么」：哪个容器 / 哪个 Pod → 哪台机器 → 哪个服务 → 哪个文件 → 什么流。
 * 名单刻意短：它在 LABEL_LIMIT 之内抢位置，多一个就挤掉一个真字段。
 */
export declare const LABEL_PRIORITY: readonly string[];
/** 已经搬到显式字段上的键，不再进 labels（与后端里那份口径一致）。 */
export declare const CONSUMED_KEYS: readonly string[];
/** 单个标签值的长度上限：日志里一个字段可能是整段堆栈，labels 不是放它的地方（raw 里有全文）。 */
export declare const LABEL_VALUE_MAX = 160;
/**
 * 把一棵文档树摊成「点分路径 → 字符串」。**优先键先占位**，其余按文档顺序补到上限。
 *
 * 传进来的 source 不被改（返回的是新对象）。limit 是标签条数上限；优先键也超过上限时按名单顺序
 * 截断——宁可缺一个次要字段，也不让一行把整页撑爆。
 */
export declare function flattenLabels(source: Record<string, unknown>, options?: {
    limit?: number;
    priority?: readonly string[];
}): Record<string, string>;
/** 归一化后的级别（严重度从低到高）。 */
export type CanonicalLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
/** 级别参数的合法取值（工具 schema 与文案都取它）。 */
export declare const CANONICAL_LEVELS: readonly CanonicalLevel[];
/** 任意写法 → 归一化级别；认不出就是 undefined（**不猜**）。 */
export declare function canonicalLevel(raw: unknown): CanonicalLevel | undefined;
/**
 * 这个级别算不算「够严重」。undefined（行上没有级别）**不算命中**：不能把「不知道」当成「是 error」。
 *
 * 语义是**及以上**：问 level=warn 得到 warn + error + fatal——这是日志查看器的通行口径，
 * 也是排查时真正的意思（「把值得看的都给我」）。
 */
export declare function levelMatches(actual: string | undefined, wanted: CanonicalLevel): boolean;
/** 级别文案（工具与 README 共用）：warn 的意思是 warn 及以上。 */
export declare function levelHint(wanted: CanonicalLevel): string;
/**
 * 从正文推断级别。测的形态都是真机里出现过的：方括号包着的断语、level=ERROR、
 * ERROR 开头的行、以及 logback 的 14:00:00.123 ERROR 12345 --- [main] 这种。
 */
export declare function inferLevel(message: string): CanonicalLevel | undefined;
/**
 * 这一行是不是**上一条日志的续行**（堆栈后半截 / MyBatis 诊断块），而不是一条独立的日志。
 *
 * 只对「正文里没有级别」的行有意义——有级别就是一条独立日志，不必问。所以调用方是
 * {@link withLevel}：推断不出级别时再问这一句，避免把 `[ERROR] \tat …` 这种（首行带级别的）
 * 误标成续行。
 */
export declare function isContinuation(message: string): boolean;
/**
 * 给一行补级别：**文档 / 流标签里有就用它，没有才从正文推断**，并标出级别是推断来的。
 *
 * 为什么要标：level 是筛选项，而「文档说它是 error」与「我从正文看着像 error」是两种可信度——
 * 契约里不许把后者写成前者（与 totalKnown 同一口径）。
 */
export declare function withLevel(line: LogLine, candidates: Array<unknown>): LogLine;
