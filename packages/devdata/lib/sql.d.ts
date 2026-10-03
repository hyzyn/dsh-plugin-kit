/**
 * SQL 只读面：语句分类 + 结果整形 + 上限收紧。**纯逻辑，不连任何东西。**
 *
 * ## 为什么不能只做关键字黑名单
 *
 * 黑名单能绕的地方太多：多语句拼接（`SELECT 1; DROP TABLE t`）、注释里藏词、大小写与空白变形、
 * 字符串字面量里出现 `DELETE`。判据必须落在**结构**上：先剥掉注释与字符串、按引号与注释状态扫码，
 * 再取**第一个关键字**判定语句类型——**不认识的一律拒**（与 nyetdb 的做法一致）。
 *
 * ## 上限只能收紧，不能放宽
 *
 * 候选（agent）可以请求比策略更小的行数；请求更大的被夹回策略值。**不给 `--force`**：
 * 一个能被候选抬高的上限不叫上限。策略值也不接受变量插值（由调用方保证，见 plan §3.6）。
 */
import type { Engine } from './operations.js';
/** 语种：决定分页语法（`LIMIT` / `TOP` / `FETCH FIRST`）。 */
export type SqlDialect = 'mysql' | 'postgres' | 'sqlserver' | 'dm';
/** 引擎 → 语种。 */
export declare const DIALECT_OF: Partial<Record<Engine, SqlDialect>>;
/** 允许的语句类型。**这份清单就是白名单**——不在其中的一律拒。 */
export declare const READ_OPERATIONS: readonly ["SELECT", "WITH", "SHOW", "DESCRIBE", "DESC", "EXPLAIN", "VALUES", "TABLE"];
/** 语句分类结果。 */
export type StatementVerdict = {
    ok: true;
    operation: string;
} | {
    ok: false;
    reason: StatementRejection;
    detail?: string;
};
/** 拒绝原因。 */
export type StatementRejection = 
/** 空语句。 */
'EMPTY'
/** 多语句（顶层分号后还有内容）。 */
 | 'MULTI_STATEMENT'
/** 注释 / 字符串未闭合。 */
 | 'UNTERMINATED'
/** 不是只读语句（写 / DDL / 权限…）。 */
 | 'NOT_READ'
/** 没见过的语句类型（**不认识一律拒**）。 */
 | 'UNKNOWN_STATEMENT';
/**
 * 分类一条 SQL。**这是 SQL 只读面的第一道门。**
 *
 * 判定顺序：空 → 未闭合 → 多语句 → 语句头白名单。
 * 「多语句」在语句头之前判，因为 `SELECT 1; DROP TABLE t` 的语句头是合法的 `SELECT`——
 * 只看头会放行它。
 */
export declare function classifySql(sql: string): StatementVerdict;
/** 对外的拒绝文案（含恢复路径——agent 的失败模式是循环重试）。 */
export declare function sqlRejectionHint(verdict: StatementVerdict): string;
/** 结果集整形之后的形态。 */
export interface ShapedResult {
    columns: string[];
    rows: Array<Record<string, unknown>>;
    rowCount: number;
    /** 是否被上限截断。**必须显式给出**——静默截断会让 agent 得出错误结论。 */
    truncated: boolean;
    /** 实际生效的上限。 */
    limit: number;
}
/** 整形选项。 */
export interface ShapeOptions {
    /** 候选请求的行数上限（可选）。 */
    requestedLimit?: number;
    /** 源结果里的字段清单。 */
    columns?: readonly string[];
    /**
     * 上限**不可提**的落实点：候选只能请求更小。
     *
     * 策略值应为正有限数；非法策略值**收紧到 0**（不放行任何行），而不是「不限制」——
     * 配置坏掉时的安全方向是「什么都拿不到」。
     */
    maxRows: number;
}
/** 把候选请求的上限夹到策略值之内。 */
export declare function effectiveLimit(maxRows: number, requestedLimit?: number): number;
/**
 * 整形结果：**先收紧上限，再谈截断**。
 *
 * 顺序不能反：先按源结果判断「是否截断」会得到「截断了，但我又调小了上限」这种自相矛盾的报告。
 */
export declare function shapeResult(rows: readonly unknown[], options: ShapeOptions): ShapedResult;
/**
 * 给语句加上兜底上限（**只收紧，不覆盖已有分页**）。
 *
 * 已知局限（明确写出来，不假装完备）：只认**顶层**的 `LIMIT` / `FETCH` / `TOP` 关键字，
 * 不解析嵌套子查询里的分页，也不判断已有上限是否比策略更宽。
 * 真正的硬保证有两层：调用方按 `effectiveLimit` 限行，以及**计划护栏在语句真正跑起来之前**拦掉
 * 全表扫描。本函数只是那两层之外的**尸体兜底**，别把安全性寄托在它上面。
 */
export declare function materializeLimit(sql: string, dialect: SqlDialect, limit: number): string;
