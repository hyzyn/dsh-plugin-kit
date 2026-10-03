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

import type { Engine } from './operations.js'

/** 语种：决定分页语法（`LIMIT` / `TOP` / `FETCH FIRST`）。 */
export type SqlDialect = 'mysql' | 'postgres' | 'sqlserver' | 'dm'

/** 引擎 → 语种。 */
export const DIALECT_OF: Partial<Record<Engine, SqlDialect>> = {
  mysql: 'mysql',
  postgres: 'postgres',
  sqlserver: 'sqlserver',
  dm: 'dm',
}

/** 允许的语句类型。**这份清单就是白名单**——不在其中的一律拒。 */
export const READ_OPERATIONS = ['SELECT', 'WITH', 'SHOW', 'DESCRIBE', 'DESC', 'EXPLAIN', 'VALUES', 'TABLE'] as const

/** 语句分类结果。 */
export type StatementVerdict =
  | { ok: true; operation: string }
  | { ok: false; reason: StatementRejection; detail?: string }

/** 拒绝原因。 */
export type StatementRejection =
  /** 空语句。 */
  | 'EMPTY'
  /** 多语句（顶层分号后还有内容）。 */
  | 'MULTI_STATEMENT'
  /** 注释 / 字符串未闭合。 */
  | 'UNTERMINATED'
  /** 不是只读语句（写 / DDL / 权限…）。 */
  | 'NOT_READ'
  /** 没见过的语句类型（**不认识一律拒**）。 */
  | 'UNKNOWN_STATEMENT'

/** 写 / 危险语句的前缀——**只为给出更有用的拒绝文案**，判据仍然是白名单（白名单才是真判据）。 */
const WRITE_HEADS = [
  'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'REPLACE',
  'CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'RENAME',
  'GRANT', 'REVOKE', 'DENY',
  'CALL', 'EXEC', 'EXECUTE', 'DO', 'SET', 'USE',
  'BEGIN', 'START', 'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'RELEASE',
  'LOAD', 'COPY', 'IMPORT', 'EXPORT', 'BACKUP', 'RESTORE',
  'LOCK', 'UNLOCK', 'KILL', 'SHUTDOWN', 'ANALYZE', 'VACUUM', 'OPTIMIZE',
  'FLUSH', 'RESET', 'PURGE', 'HANDLER', 'PREPARE', 'DEALLOCATE',
] as const

/**
 * 扫描字符串，产出一份「每个字符是否处于代码态」的掩码。
 *
 * 处理：`--` 行注释、`#` 行注释（MySQL）、`/* *​/` 块注释（**不嵌套**——按主流实现的口径）、
 * `'…'` 与 `"…"` 字符串（各支持 `''` / `""` 转义与反斜杠转义）、MySQL 反引号与 SQL Server 方括号标识符。
 *
 * 为什么要掩码而不是「直接剥掉」：剥掉会**改变位置**，而「顶层分号」与「语句头」的判定都要看
 * 位置与状态。掩码让后续所有判定都在同一套坐标上做。
 */
function codeMask(sql: string): { mask: boolean[]; unterminated: boolean } {
  const mask: boolean[] = new Array<boolean>(sql.length).fill(true)
  let i = 0
  let unterminated = false
  while (i < sql.length) {
    const ch = sql[i] as string
    const next = sql[i + 1]
    if (ch === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') {
        mask[i] = false
        i += 1
      }
      continue
    }
    if (ch === '#') {
      while (i < sql.length && sql[i] !== '\n') {
        mask[i] = false
        i += 1
      }
      continue
    }
    if (ch === '/' && next === '*') {
      mask[i] = false
      mask[i + 1] = false
      i += 2
      let closed = false
      while (i < sql.length) {
        if (sql[i] === '*' && sql[i + 1] === '/') {
          mask[i] = false
          mask[i + 1] = false
          i += 2
          closed = true
          break
        }
        mask[i] = false
        i += 1
      }
      if (!closed) unterminated = true
      continue
    }
    if (ch === "'" || ch === '"') {
      const quote = ch
      mask[i] = false
      i += 1
      let closed = false
      while (i < sql.length) {
        if (sql[i] === '\\' && quote === "'") {
          // 反斜杠转义：连同被转义的字符一起标掉（位置必须守恒）。
          mask[i] = false
          if (i + 1 < sql.length) mask[i + 1] = false
          i += 2
          continue
        }
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) {
            mask[i] = false
            mask[i + 1] = false
            i += 2
            continue
          }
          mask[i] = false
          i += 1
          closed = true
          break
        }
        mask[i] = false
        i += 1
      }
      if (!closed) unterminated = true
      continue
    }
    if (ch === '`' || ch === '[') {
      const close = ch === '`' ? '`' : ']'
      mask[i] = false
      i += 1
      let closed = false
      while (i < sql.length) {
        if (sql[i] === close) {
          mask[i] = false
          i += 1
          closed = true
          break
        }
        mask[i] = false
        i += 1
      }
      if (!closed) unterminated = true
      continue
    }
    i += 1
  }
  return { mask, unterminated }
}

/**
 * 归类一个语句头：已知只读 / 已知危险 / 没见过。
 *
 * **必须在原始字符串上按掩码定位第一个代码态字符**，不能直接 `slice(cursor)`：
 * 前导注释（`/* c *​/ DELETE`）与字符串字面量在掩码里是「非代码态」，但它们在原始字符串里
 * **仍然占位**。早先的实现只跳空白，于是注释里的 `/` 被当成非空白、正则匹配失败，
 * `DELETE` 会被误判成「不认识的语句类型」——**拒绝的方向对了，但理由错了**，
 * 界面上给出的指引也会错（让人以为要换语句类型，其实是要去掉写操作）。
 *
 * 首字符为 `(`（如 `(SELECT 1)`）一律拒：保守方向，「不认识就不放行」。
 */
function classifyHead(sql: string, mask: readonly boolean[], start: number, end: number): StatementVerdict {
  let cursor = start
  while (cursor < end && (mask[cursor] === false || /\s/.test(sql[cursor] as string))) cursor += 1
  const headMatch = /^[A-Za-z_][A-Za-z0-9_]*/.exec(sql.slice(cursor))
  if (headMatch === null) {
    return { ok: false, reason: 'UNKNOWN_STATEMENT', detail: '语句不是以关键字开头' }
  }
  const head = headMatch[0].toUpperCase()
  if ((READ_OPERATIONS as readonly string[]).includes(head)) {
    return { ok: true, operation: head }
  }
  if ((WRITE_HEADS as readonly string[]).includes(head)) {
    return { ok: false, reason: 'NOT_READ', detail: head }
  }
  // 不认识的一律拒——**不是默认放行**。
  return { ok: false, reason: 'UNKNOWN_STATEMENT', detail: head }
}

/**
 * 分类一条 SQL。**这是 SQL 只读面的第一道门。**
 *
 * 判定顺序：空 → 未闭合 → 多语句 → 语句头白名单。
 * 「多语句」在语句头之前判，因为 `SELECT 1; DROP TABLE t` 的语句头是合法的 `SELECT`——
 * 只看头会放行它。
 */
export function classifySql(sql: string): StatementVerdict {
  if (typeof sql !== 'string' || sql.trim() === '') {
    return { ok: false, reason: 'EMPTY' }
  }
  const { mask, unterminated } = codeMask(sql)
  if (unterminated) {
    return { ok: false, reason: 'UNTERMINATED', detail: '注释或字符串未闭合' }
  }

  /*
   * 顶层分号：**最后一个**代码态分号的位置。它之后若还有代码态字符，就是多语句。
   *
   * 只认第一个分号是不够的：`SELECT 1;;` 里第一个分号后还有分号。反过来，
   * 单个尾随分号（`SELECT 1;`）是合法的——后面没有代码态内容。
   */
  let lastSemi = -1
  for (let i = 0; i < sql.length; i += 1) {
    if (mask[i] === true && sql[i] === ';') lastSemi = i
  }
  let end = sql.length
  if (lastSemi >= 0) {
    const rest = sql.slice(lastSemi + 1)
    const restMask = mask.slice(lastSemi + 1)
    const hasCode = rest.split('').some((ch, idx) => restMask[idx] === true && /\S/.test(ch))
    if (hasCode) {
      return { ok: false, reason: 'MULTI_STATEMENT', detail: '顶层分号之后仍有语句' }
    }
    end = lastSemi
  }

  return classifyHead(sql, mask, 0, end)
}

/** 对外的拒绝文案（含恢复路径——agent 的失败模式是循环重试）。 */
export function sqlRejectionHint(verdict: StatementVerdict): string {
  if (verdict.ok) return ''
  switch (verdict.reason) {
    case 'EMPTY':
      return '给一条只读语句（SELECT / SHOW / DESCRIBE / EXPLAIN）'
    case 'MULTI_STATEMENT':
      return '一次只发一条语句：顶层分号之后的内容被拒绝（分号拼接是典型绕过）'
    case 'UNTERMINATED':
      return '注释或字符串未闭合，请补全引号 / 注释结束符'
    case 'NOT_READ':
      return `本套件的 SQL 档永久只读，不接受 ${verdict.detail ?? '写'} 类语句；要改数据请走各自运维流程`
    default:
      return `不认识的语句类型${verdict.detail === undefined ? '' : `（${verdict.detail}）`}，一律拒绝；请改用 SELECT / SHOW / DESCRIBE / EXPLAIN`
  }
}

/** 结果集整形之后的形态。 */
export interface ShapedResult {
  columns: string[]
  rows: Array<Record<string, unknown>>
  rowCount: number
  /** 是否被上限截断。**必须显式给出**——静默截断会让 agent 得出错误结论。 */
  truncated: boolean
  /** 实际生效的上限。 */
  limit: number
}

/** 整形选项。 */
export interface ShapeOptions {
  /** 候选请求的行数上限（可选）。 */
  requestedLimit?: number
  /** 源结果里的字段清单。 */
  columns?: readonly string[]
  /**
   * 上限**不可提**的落实点：候选只能请求更小。
   *
   * 策略值应为正有限数；非法策略值**收紧到 0**（不放行任何行），而不是「不限制」——
   * 配置坏掉时的安全方向是「什么都拿不到」。
   */
  maxRows: number
}

/** 把候选请求的上限夹到策略值之内。 */
export function effectiveLimit(maxRows: number, requestedLimit?: number): number {
  const policy = Number.isFinite(maxRows) && maxRows > 0 ? Math.floor(maxRows) : 0
  if (policy === 0) return 0
  if (requestedLimit === undefined) return policy
  if (!Number.isFinite(requestedLimit)) return policy
  return Math.max(0, Math.min(policy, Math.floor(requestedLimit)))
}

/**
 * 整形结果：**先收紧上限，再谈截断**。
 *
 * 顺序不能反：先按源结果判断「是否截断」会得到「截断了，但我又调小了上限」这种自相矛盾的报告。
 */
export function shapeResult(rows: readonly unknown[], options: ShapeOptions): ShapedResult {
  const limit = effectiveLimit(options.maxRows, options.requestedLimit)
  const list = Array.isArray(rows) ? rows : []
  const columns =
    options.columns !== undefined && options.columns.length > 0
      ? [...options.columns]
      : inferColumns(list[0])
  const kept = list.slice(0, limit)
  return {
    columns,
    rows: kept.map((row) => toRecord(row, columns)),
    rowCount: kept.length,
    truncated: list.length > kept.length,
    limit,
  }
}

/** 从首行推断列（驱动给出行对象时用）。 */
function inferColumns(row: unknown): string[] {
  if (typeof row !== 'object' || row === null) return []
  return Object.keys(row as Record<string, unknown>)
}

/** 把任意行形态（对象 / 数组）归一成对象，并**只保留声明的列**。 */
function toRecord(row: unknown, columns: readonly string[]): Record<string, unknown> {
  if (Array.isArray(row)) {
    const out: Record<string, unknown> = {}
    columns.forEach((name, index) => {
      out[name] = row[index]
    })
    return out
  }
  if (typeof row !== 'object' || row === null) return { value: row }
  const source = row as Record<string, unknown>
  if (columns.length === 0) return { ...source }
  const out: Record<string, unknown> = {}
  for (const name of columns) out[name] = source[name]
  return out
}

/**
 * 给语句加上兜底上限（**只收紧，不覆盖已有分页**）。
 *
 * 已知局限（明确写出来，不假装完备）：只认**顶层**的 `LIMIT` / `FETCH` / `TOP` 关键字，
 * 不解析嵌套子查询里的分页，也不判断已有上限是否比策略更宽。
 * 真正的硬保证有两层：调用方按 `effectiveLimit` 限行，以及**计划护栏在语句真正跑起来之前**拦掉
 * 全表扫描。本函数只是那两层之外的**尸体兜底**，别把安全性寄托在它上面。
 */
export function materializeLimit(sql: string, dialect: SqlDialect, limit: number): string {
  if (!Number.isFinite(limit) || limit <= 0) return sql
  const upper = sql.toUpperCase()
  if (dialect === 'sqlserver' && /\bTOP\b/.test(upper)) return sql
  if (/\bLIMIT\b/.test(upper) || /\bFETCH\s+(FIRST|NEXT)\b/.test(upper)) return sql
  const trimmed = sql.trimEnd()
  const trailingSemi = trimmed.endsWith(';')
  const body = trailingSemi ? trimmed.slice(0, -1) : trimmed
  let out: string
  if (dialect === 'sqlserver') {
    // SELECT → SELECT TOP (n)：只对 SELECT 前缀有效，其余（SHOW/DESCRIBE/EXPLAIN）原样返回。
    out = /^\s*SELECT\b/i.test(body) ? body.replace(/^(\s*)SELECT\b/i, `$1SELECT TOP (${String(limit)})`) : body
  } else {
    out = `${body} LIMIT ${String(limit)}`
  }
  return trailingSemi ? `${out};` : out
}
