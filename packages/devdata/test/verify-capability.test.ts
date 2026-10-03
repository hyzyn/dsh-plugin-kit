/**
 * 验活断言库与既有判据的**一致性**守卫（`docs/devdata-plan.md` §3.9 约束 1）。
 *
 * 这里只放**跨模块**的性质断言——单模块行为在 `verify.test.ts` / `verify-eval.test.ts`。
 * 存在的理由：约束 1（「断言库**不新增任何写能力**」）如果只写在文档里，它会在某次改动里漂掉，
 * 而且漂掉时**没有任何症状**——清单照跑、报告照绿。
 */

import { describe, expect, it } from 'vitest'

import {
  CAP_ENV,
  classifyAssertionStatement,
  classifySql,
  matrixFor,
  validateManifest,
  type Engine,
  type OperationClass,
  type VerifyAssertion,
} from '../src/index.js'

const SQL_ENGINES: readonly Engine[] = ['mysql', 'postgres', 'sqlserver', 'dm']

/**
 * 断言语句**只能**落在这两档上。
 *
 * `read`：普通只读，不需要任何能力。
 * `read-dangerous`：只读但要能力（目前 SQL 矩阵里没有这类动作，留出这一档是为了让判据诚实——
 * 万一将来 SQL 侧出现「读但危险」的动作，因为它不需要 `write` 能力，仍然不违反约束 1）。
 */
const ALLOWED_KINDS: readonly OperationClass[] = ['read', 'read-dangerous']

/** 造一份覆盖多类语句的清单。 */
function fixtureAssertions(): VerifyAssertion[] {
  const common = { project: 'cdqas', appliesTo: 'backend' as const, target: 't-mysql', severity: 'fail' as const }
  return [
    { ...common, id: 'count', statement: 'SELECT COUNT(*) FROM orders', expect: { gte: 1 } },
    { ...common, id: 'with', statement: 'WITH x AS (SELECT 1 AS n) SELECT n FROM x', expect: { eq: 1 } },
    { ...common, id: 'show', statement: 'SHOW TABLES', expect: { rowCount: 3 } },
    { ...common, id: 'regex', statement: "SELECT code FROM orders WHERE id = 1", expect: { regex: '^ORD-' } },
    { ...common, id: 'range', statement: 'SELECT total FROM orders', expect: { gte: 0, lte: 100, rowCount: 1 } },
  ]
}

/** 走这条语句的工具动作（断言库只经这条路：`query` 动作 + `sql` 参数）。 */
const STATEMENT_ACTION = 'query'

/** 该动作在某引擎矩阵里的档位。 */
function kindOfAction(engine: Engine, action: string): OperationClass {
  const spec = matrixFor(engine).operations[action]
  if (spec === undefined) throw new Error(`动作 ${action} 不在 ${engine} 的矩阵里`)
  return spec.kind
}

describe('约束 1：断言库不新增任何写能力', () => {
  it('断言走的动作（`query`）在所有 SQL 引擎上都是只读档', () => {
    // 失败意味着：验活断言库开出了一条写路径，而它本该只是只读档的消费者。
    //
    // 注意有两层，别把它们混起来：
    //   - `classifySql` 判的是**语句**（`SELECT` / `WITH` / `DELETE`…），它是 SQL 粒度；
    //   - 矩阵判的是**工具动作**（`query` / `schema` / `describe`…），它是工具粒度。
    // 断言库只经 `query` 这一个工具动作，SQL 粒度的判据在它内部再走一次。
    for (const engine of SQL_ENGINES) {
      const kind = kindOfAction(engine, STATEMENT_ACTION)
      expect(ALLOWED_KINDS, `${engine} 的 ${STATEMENT_ACTION} 档位是 ${kind}`).toContain(kind)
    }
  })

  it('整份 fixture 清单能通过校验，且每条语句都是只读（两层都对）', () => {
    const assertions = fixtureAssertions()
    const result = validateManifest('cdqas', { version: 1, project: 'cdqas', assertions })
    expect(result.ok, `fixture 本该通过：${JSON.stringify(result.ok ? [] : result.errors)}`).toBe(true)
    for (const item of assertions) {
      expect(classifySql(item.statement).ok, `${item.id} 的语句不是只读`).toBe(true)
    }
  })

  it('SQL 矩阵里**没有**任何写操作入口（断言库没有可乘之机）', () => {
    for (const engine of SQL_ENGINES) {
      const writes = Object.values(matrixFor(engine).operations).filter((spec) => spec.kind === 'write-scoped')
      expect(writes, `${engine} 的 SQL 矩阵里出现了写操作`).toEqual([])
    }
  })

  it('SQL 矩阵里没有任何动作声明 `write` 能力（连声明都没有）', () => {
    for (const engine of SQL_ENGINES) {
      const declaring = Object.values(matrixFor(engine).operations).filter(
        (spec) => spec.capabilityEnv === CAP_ENV.write,
      )
      expect(declaring, `${engine} 有动作声明了写能力`).toEqual([])
    }
  })

  it('写语句被校验拒掉——这是「不新增写能力」的第一道（也是最前面的一道）', () => {
    for (const statement of ['DELETE FROM orders', 'INSERT INTO orders VALUES (1)', 'UPDATE orders SET a = 1']) {
      expect(classifyAssertionStatement(statement), statement).toBeTypeOf('string')
    }
  })

  it('`SELECT` 这类语句在 SQL 判据里也是只读（两层判据不冲突）', () => {
    for (const statement of ['SELECT 1', 'WITH x AS (SELECT 1) SELECT * FROM x', 'SHOW TABLES']) {
      expect(classifySql(statement).ok, statement).toBe(true)
    }
  })
})
