/**
 * SQL 只读面测试。
 *
 * 这一组用例的价值在于**绕过面**：语句分类是「不认识的一律拒」的落点，它每漏一条就是一个真实的
 * 写操作通道。所以用例的重点不是「SELECT 能不能过」，而是「哪些写法能骗过分类器」。
 */

import { describe, expect, it } from 'vitest'

import {
  DIALECT_OF,
  classifySql,
  effectiveLimit,
  materializeLimit,
  shapeResult,
  sqlRejectionHint,
} from '../src/index.js'

/** 断言一条语句被判为放行，并返回其操作名。 */
function allowed(sql: string): string {
  const verdict = classifySql(sql)
  expect(verdict.ok, `期望放行但被拒：${sql}`).toBe(true)
  return verdict.ok ? verdict.operation : ''
}

/** 断言一条语句被拒，并返回原因。 */
function rejected(sql: string): string {
  const verdict = classifySql(sql)
  expect(verdict.ok, `期望被拒但放行了：${sql}`).toBe(false)
  return verdict.ok ? '' : verdict.reason
}

describe('白名单：只读语句放行', () => {
  it('接受 SELECT / WITH / SHOW / DESCRIBE / EXPLAIN / VALUES / TABLE', () => {
    expect(allowed('SELECT 1')).toBe('SELECT')
    expect(allowed('  select id from t  ')).toBe('SELECT')
    expect(allowed('WITH x AS (SELECT 1) SELECT * FROM x')).toBe('WITH')
    expect(allowed('SHOW TABLES')).toBe('SHOW')
    expect(allowed('DESCRIBE users')).toBe('DESCRIBE')
    expect(allowed('EXPLAIN SELECT 1')).toBe('EXPLAIN')
    expect(allowed('VALUES (1,2)')).toBe('VALUES')
    expect(allowed('TABLE users')).toBe('TABLE')
  })

  it('单个尾随分号是合法的（多语句判据只看分号之后还有没有内容）', () => {
    expect(allowed('SELECT 1;')).toBe('SELECT')
    expect(allowed('SELECT 1 ;  ')).toBe('SELECT')
  })
})

describe('写操作：拒绝，且理由说清楚', () => {
  it('拒写 / DDL / 权限 / 事务控制，并归类为 NOT_READ', () => {
    const writes = [
      'INSERT INTO t VALUES (1)',
      'UPDATE t SET a=1',
      'DELETE FROM t',
      'TRUNCATE TABLE t',
      'DROP TABLE t',
      'ALTER TABLE t ADD c int',
      'CREATE TABLE t (a int)',
      'GRANT ALL ON t TO u',
      'CALL do_something()',
      'SET autocommit = 0',
      'BEGIN',
      'COMMIT',
      'LOCK TABLES t WRITE',
      'ANALYZE TABLE t',
      'VACUUM t',
      'LOAD DATA INFILE "x" INTO TABLE t',
    ]
    for (const sql of writes) {
      expect(rejected(sql), sql).toBe('NOT_READ')
    }
  })

  it('不认识的语句类型一律拒（不是默认放行）', () => {
    // 失败意味着：任何没被审过的语句都能跑到数据库上。
    expect(rejected('FROBNICATE the database')).toBe('UNKNOWN_STATEMENT')
    expect(rejected('12345')).toBe('UNKNOWN_STATEMENT')
    expect(rejected('"just a string"')).toBe('UNKNOWN_STATEMENT')
  })

  it('空语句被拒', () => {
    expect(rejected('')).toBe('EMPTY')
    expect(rejected('   ')).toBe('EMPTY')
  })
})

describe('绕过面：多语句与注释 / 字符串', () => {
  it('分号拼接被拒，即使语句头是合法的 SELECT', () => {
    // 失败意味着：`SELECT 1; DROP TABLE t` 这种最经典的绕过直接生效。
    expect(rejected('SELECT 1; DROP TABLE t')).toBe('MULTI_STATEMENT')
    expect(rejected('SELECT 1;DELETE FROM t')).toBe('MULTI_STATEMENT')
    expect(rejected('SELECT 1; -- comment\nDELETE FROM t')).toBe('MULTI_STATEMENT')
  })

  it('**空**语句（多余分号）不算多语句', () => {
    // 判据是「分号之后还有没有代码」，不是「分号出现了几次」。`SELECT 1;;` 是语句 + 两条空语句，
    // 空语句不构成写通道，判成多语句会把无害写法也拒掉（那是把护栏当噪声）。
    expect(allowed('SELECT 1;;')).toBe('SELECT')
    expect(allowed('SELECT 1;  ;')).toBe('SELECT')
  })

  it('字符串字面量里的分号**不算**多语句', () => {
    expect(allowed("SELECT '; DROP TABLE t' AS s")).toBe('SELECT')
    expect(allowed("SELECT 'a;b' , 'c;d'")).toBe('SELECT')
    // 转义写法：`''` 是两个单引号，不是字符串结束 + 新字符串。
    expect(allowed("SELECT 'it''s ; fine'")).toBe('SELECT')
  })

  it('反引号 / 方括号标识符里的内容被忽略（不干扰语句头判定）', () => {
    expect(allowed('SELECT `weird;name` FROM t')).toBe('SELECT')
    expect(allowed('SELECT [weird;name] FROM t')).toBe('SELECT')
  })

  it('注释不能用来藏写操作', () => {
    // 语句头被注释掉后，真正的语句头才暴露出来——所以它必须被判成写。
    // （这三条是**回归用例**：早先的实现只按空白跳过语句头，注释里的 `/` 会让正则在原始串上匹配
    // 失败，于是写操作被误判成「不认识的语句类型」——拒绝方向对了，理由与恢复指引都错了。）
    expect(rejected('/* SELECT */ DELETE FROM t')).toBe('NOT_READ')
    expect(rejected('-- SELECT\nDELETE FROM t')).toBe('NOT_READ')
    expect(rejected('/**/DELETE FROM t')).toBe('NOT_READ')
    // 前导注释 + 只读语句：掩码生效后应正常放行。
    expect(allowed('/* c */ SELECT 1')).toBe('SELECT')
    expect(allowed('-- c\nSELECT 1')).toBe('SELECT')
    expect(allowed('/**/SELECT 1')).toBe('SELECT')
  })

  it('括号开头的表达式一律拒（保守：不认识就不放行）', () => {
    expect(rejected('(SELECT 1)')).toBe('UNKNOWN_STATEMENT')
    expect(rejected('(1+2)')).toBe('UNKNOWN_STATEMENT')
  })

  it('表达式级 SELECT 不会被掩码糊住', () => {
    // 字符串字面量被掩掉后，若语句头在注释 / 字符串**之后**，定位必须仍然准确。
    expect(allowed("SELECT 'a' AS x FROM t")).toBe('SELECT')
    expect(rejected("SELECT 'a'; DROP TABLE t")).toBe('MULTI_STATEMENT')
  })

  it('注释与字符串未闭合被拒（不许猜）', () => {
    expect(rejected("SELECT 'unterminated")).toBe('UNTERMINATED')
    expect(rejected('SELECT 1 /* unterminated')).toBe('UNTERMINATED')
    expect(rejected('SELECT `unterminated')).toBe('UNTERMINATED')
  })

  it('拒绝文案带恢复路径（agent 的失败模式是循环重试）', () => {
    expect(sqlRejectionHint(classifySql('DELETE FROM t'))).toContain('永久只读')
    expect(sqlRejectionHint(classifySql('SELECT 1; DROP TABLE t'))).toContain('一次只发一条语句')
    expect(sqlRejectionHint(classifySql('FROBNICATE'))).toContain('不认识的语句类型')
  })
})

describe('上限不可提', () => {
  it('候选只能请求更小；请求更大被夹回策略值', () => {
    expect(effectiveLimit(100, 10)).toBe(10)
    expect(effectiveLimit(100, 1000)).toBe(100)
    expect(effectiveLimit(100, undefined)).toBe(100)
    expect(effectiveLimit(100, -5)).toBe(0)
  })

  it('策略值非法时收紧到 0（拿不到任何行），而不是「不限制」', () => {
    // 失败意味着：配置坏掉时方向反了——从「什么都拿不到」变成「什么都能拿」。
    expect(effectiveLimit(0, 10)).toBe(0)
    expect(effectiveLimit(-1, 10)).toBe(0)
    expect(effectiveLimit(Number.NaN, 10)).toBe(0)
    expect(effectiveLimit(Number.POSITIVE_INFINITY, 10)).toBe(0)
  })
})

describe('结果整形', () => {
  it('截断必须显式给出（静默截断会让 agent 得出错误结论）', () => {
    const shaped = shapeResult([{ a: 1 }, { a: 2 }, { a: 3 }], { maxRows: 2 })
    expect(shaped.rowCount).toBe(2)
    expect(shaped.truncated).toBe(true)
    expect(shaped.limit).toBe(2)
  })

  it('未超限时 truncated 为 false', () => {
    const shaped = shapeResult([{ a: 1 }], { maxRows: 5 })
    expect(shaped.truncated).toBe(false)
    expect(shaped.rowCount).toBe(1)
  })

  it('数组行按列名归一；列名缺失时从首行推断', () => {
    const shaped = shapeResult(
      [
        [1, 'x'],
        [2, 'y'],
      ],
      { maxRows: 10, columns: ['id', 'name'] },
    )
    expect(shaped.columns).toEqual(['id', 'name'])
    expect(shaped.rows).toEqual([
      { id: 1, name: 'x' },
      { id: 2, name: 'y' },
    ])
  })

  it('只保留声明的列（不把驱动附带的大字段一起带出去）', () => {
    const shaped = shapeResult([{ id: 1, blob: 'x'.repeat(10), hidden: true }], {
      maxRows: 10,
      columns: ['id', 'blob'],
    })
    expect(Object.keys(shaped.rows[0] as object)).toEqual(['id', 'blob'])
  })

  it('非数组输入按空结果处理（不抛错）', () => {
    const shaped = shapeResult(undefined as unknown as unknown[], { maxRows: 10 })
    expect(shaped.rowCount).toBe(0)
    expect(shaped.truncated).toBe(false)
  })
})

describe('兜底上限注入', () => {
  it('MySQL / PostgreSQL / 达梦 用 LIMIT', () => {
    expect(materializeLimit('SELECT * FROM t', 'mysql', 10)).toBe('SELECT * FROM t LIMIT 10')
    expect(materializeLimit('SELECT * FROM t;', 'postgres', 10)).toBe('SELECT * FROM t LIMIT 10;')
  })

  it('SQL Server 用 SELECT TOP (n)', () => {
    expect(materializeLimit('SELECT * FROM t', 'sqlserver', 10)).toBe('SELECT TOP (10) * FROM t')
  })

  it('已有分页时不覆盖（只收紧，不叠加）', () => {
    expect(materializeLimit('SELECT * FROM t LIMIT 5', 'mysql', 10)).toBe('SELECT * FROM t LIMIT 5')
    expect(materializeLimit('SELECT * FROM t FETCH FIRST 5 ROWS ONLY', 'postgres', 10)).toBe(
      'SELECT * FROM t FETCH FIRST 5 ROWS ONLY',
    )
    expect(materializeLimit('SELECT TOP (5) * FROM t', 'sqlserver', 10)).toBe('SELECT TOP (5) * FROM t')
  })

  it('上限为 0 时不注入（调用方已经什么都不给）', () => {
    expect(materializeLimit('SELECT * FROM t', 'mysql', 0)).toBe('SELECT * FROM t')
  })

  it('非 SELECT 语句不注入（SHOW / EXPLAIN 原样）', () => {
    expect(materializeLimit('SHOW TABLES', 'mysql', 10)).toBe('SHOW TABLES LIMIT 10')
    expect(materializeLimit('EXPLAIN SELECT 1', 'sqlserver', 10)).toBe('EXPLAIN SELECT 1')
  })
})

describe('语种映射', () => {
  it('SQL 引擎都有语种；非 SQL 引擎没有', () => {
    expect(DIALECT_OF.mysql).toBe('mysql')
    expect(DIALECT_OF.sqlserver).toBe('sqlserver')
    expect(DIALECT_OF.dm).toBe('dm')
    expect(DIALECT_OF.redis).toBeUndefined()
    expect(DIALECT_OF.rocketmq).toBeUndefined()
  })
})
