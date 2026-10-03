/**
 * 计划护栏 + 只读自证测试。
 *
 * 两条都是「防止最贵的失败」的护栏，所以用例的重点同样是**反面**：
 * 护栏会不会放过全表扫描、自证会不会在没有证据时放行。
 */

import { describe, expect, it } from 'vitest'

import {
  READONLY_PROBE_ENGINES,
  classifyPlan,
  estimateFromPlan,
  guardPlan,
  invokeTool,
  readOnlySummary,
  verdictReadOnly,
  type DevDataTarget,
  type ReadOnlyFacts,
  type ToolExecutor,
} from '../src/index.js'

const CWD = '/work/project-a'

function target(overrides: Partial<DevDataTarget> = {}): DevDataTarget {
  return {
    id: 't-mysql',
    label: '测试 MySQL',
    engine: 'mysql',
    env: 'test-shared',
    scopeDirs: [CWD],
    ...overrides,
  }
}

describe('计划分类', () => {
  it('认出 MySQL 的全表扫描（type: ALL / rows）', () => {
    expect(classifyPlan('id: 1\nselect_type: SIMPLE\ntype: ALL\nrows: 1200', 'mysql').kind).toBe('full-scan')
  })

  it('认出 PostgreSQL 的 Seq Scan', () => {
    expect(classifyPlan('Seq Scan on orders  (cost=0.00..1834.00 rows=100000 width=8)', 'postgres').kind).toBe('full-scan')
  })

  it('认出 SQL Server 的 Clustered Index Scan / Table Scan', () => {
    expect(classifyPlan('|--Clustered Index Scan (Object:[dbo].[Orders])', 'sqlserver').kind).toBe('full-scan')
    expect(classifyPlan('|--Table Scan (Object:[dbo].[Orders])', 'sqlserver').kind).toBe('full-scan')
  })

  it('**同一个 `Index Scan` 在不同引擎里判得相反**（赢面在估算行数，不在操作名）', () => {
    // PostgreSQL：`Index Scan` 既用于扫全表也用于定位一行，行结构相同 → **不按名字判**，
    // 放行后交给行数阈值。按名字判会把 PG 的正常查询全部误拒。
    expect(classifyPlan('Index Scan using orders_pkey on orders  (rows=1)', 'postgres').kind).toBe('indexed')
    // SQL Server：没有 seek 的 `Index Scan` 是扫全量 → 按名字判。
    expect(classifyPlan('|--Index Scan (Object:[dbo].[Orders])', 'sqlserver').kind).toBe('full-scan')
    // PostgreSQL 的覆盖索引扫描是便宜的。
    expect(classifyPlan('Index Only Scan using orders_pkey on orders  (rows=1)', 'postgres').kind).toBe('indexed')
  })

  it('MySQL 的 `type: index` 是扫整个索引（全量），带 `Using index` 才是覆盖索引', () => {
    expect(classifyPlan('id: 1\ntype: index\nrows: 5000', 'mysql').kind).toBe('full-scan')
    // 覆盖索引：便宜（`Using index` 既是「便宜」信号，也是「不走全量」的排除条件）。
    expect(classifyPlan('id: 1\ntype: index\nExtra: Using index\nrows: 5000', 'mysql').kind).toBe('indexed')
  })

  it('不传引擎时只认所有引擎都成立的信号（`type: index` / `Index Scan` 都不按名字判）', () => {
    // 这是刻意的保守取向：不传引擎时误判 PG 的正常查询，比漏放一条更接近「工具不能要」。
    expect(classifyPlan('type: index\nrows: 5000').kind).toBe('unknown')
    expect(classifyPlan('Index Scan on t  (rows=5)').kind).toBe('unknown')
    expect(classifyPlan('Seq Scan on t  (rows=5)').kind).toBe('full-scan')
  })

  it('索引 / 常量访问不算全表扫描', () => {
    expect(classifyPlan('Index Scan using orders_pkey on orders  (cost=0.29..8.30 rows=1 width=8)', 'postgres').kind).toBe('indexed')
    expect(classifyPlan('id: 1\ntype: ref\nkey: idx_user\nrows: 3', 'mysql').kind).toBe('indexed')
  })

  it('`using index` 的行不算回表扫描（MySQL 的覆盖索引）', () => {
    expect(classifyPlan('type: index\nExtra: Using index\nrows: 100', 'mysql').kind).toBe('indexed')
  })

  it('逐行判：一行全表 + 一行索引 → 仍是全表（不取「先匹配到的那个」）', () => {
    const plan = 'Seq Scan on big_table  (rows=100000)\nIndex Scan using small_pkey on small  (rows=1)'
    expect(classifyPlan(plan).kind).toBe('full-scan')
  })

  it('空计划 / 无已知信号 → unknown（不假装认得）', () => {
    expect(classifyPlan('').kind).toBe('unknown')
    expect(classifyPlan('something entirely else').kind).toBe('unknown')
  })
})

describe('估算抽取（尽力而为，抽不到不抛错）', () => {
  it('抽 rows / cost', () => {
    expect(estimateFromPlan('Seq Scan on t  (cost=0.00..1834.00 rows=100000 width=8)')).toEqual({
      cost: 0,
      rows: 100000,
    })
    expect(estimateFromPlan('rows=42')).toEqual({ rows: 42 })
  })

  it('抽不到就是空对象', () => {
    expect(estimateFromPlan('no numbers here')).toEqual({})
    expect(estimateFromPlan(undefined as unknown as string)).toEqual({})
  })
})

describe('护栏判定：拿不到计划一律拒', () => {
  it('计划为空 → PLAN_UNAVAILABLE（**不是跳过护栏**）', () => {
    // 失败意味着：引擎取不到计划时护栏被静默跳过——不知道代价就放行，等于没有护栏。
    const decision = guardPlan({ planText: undefined, thresholds: { maxRows: 1000 }, engine: 'mysql' })
    expect(decision.allowed).toBe(false)
    expect(decision.allowed === false && decision.code).toBe('PLAN_UNAVAILABLE')
    expect(decision.allowed === false && decision.hint).toContain('explain')
  })

  it('全表扫描 → FULL_SCAN，且 hint 指向怎么改', () => {
    const decision = guardPlan({
      planText: 'Seq Scan on orders  (cost=0.00..1834.00 rows=100000 width=8)',
      thresholds: { maxRows: 1000 },
      engine: 'postgres',
    })
    expect(decision.allowed).toBe(false)
    expect(decision.allowed === false && decision.code).toBe('FULL_SCAN')
    expect(decision.allowed === false && decision.hint).toContain('索引')
    expect(decision.allowed === false && decision.estimate?.rows).toBe(100000)
  })

  it('认不出的计划 → PLAN_UNRECOGNIZED（不是放行）', () => {
    const decision = guardPlan({ planText: 'whatever this is', thresholds: { maxRows: 1000 }, engine: 'mysql' })
    expect(decision.allowed).toBe(false)
    expect(decision.allowed === false && decision.code).toBe('PLAN_UNRECOGNIZED')
  })

  it('估算行数超上限 → COST_TOO_HIGH（即便走了索引）', () => {
    const decision = guardPlan({
      planText: 'Index Scan using idx on orders  (cost=0.29..900.00 rows=50000 width=8)',
      thresholds: { maxRows: 1000 },
      engine: 'postgres',
    })
    expect(decision.allowed).toBe(false)
    expect(decision.allowed === false && decision.code).toBe('COST_TOO_HIGH')
  })

  it('走索引且估算在上限内 → 放行', () => {
    const decision = guardPlan({
      planText: 'Index Scan using orders_pkey on orders  (cost=0.29..8.30 rows=1 width=8)',
      thresholds: { maxRows: 1000 },
      engine: 'postgres',
    })
    expect(decision.allowed).toBe(true)
    expect(decision.allowed === true && decision.verdict.kind).toBe('indexed')
  })

  it('未配 maxRows → 不做行数检查（未配置 ≠ 零容忍）', () => {
    const plan = 'Index Scan using idx on t  (rows=99999)'
    expect(guardPlan({ planText: plan, thresholds: {}, engine: 'postgres' }).allowed).toBe(true)
  })

  it('maxRows: 0 → 一行都不许（显式的零容忍）', () => {
    const plan = 'Index Scan using idx on t  (rows=1)'
    const decision = guardPlan({ planText: plan, thresholds: { maxRows: 0 }, engine: 'postgres' })
    expect(decision.allowed).toBe(false)
    expect(decision.allowed === false && decision.code).toBe('COST_TOO_HIGH')
  })

  it('全表扫描**不受阈值影响**：不配阈值也拒', () => {
    // 失败意味着：把阈值调成 undefined 就能绕开全表扫描护栏。
    const decision = guardPlan({ planText: 'Seq Scan on orders  (rows=1)', thresholds: {}, engine: 'postgres' })
    expect(decision.allowed).toBe(false)
    expect(decision.allowed === false && decision.code).toBe('FULL_SCAN')
  })

  it('maxCost 超限也拒', () => {
    const decision = guardPlan({
      planText: 'Index Scan using idx on t  (cost=5000.00..5001.00 rows=1 width=8)',
      thresholds: { maxRows: 1000, maxCost: 100 },
      engine: 'postgres',
    })
    expect(decision.allowed === false && decision.code).toBe('COST_TOO_HIGH')
  })
})

describe('只读自证：缺证即拒', () => {
  const facts = (overrides: Partial<ReadOnlyFacts> = {}): ReadOnlyFacts => ({ engine: 'mysql', ...overrides })

  it('账号级只读证据齐 + 非超级用户 → 通过，并标出覆盖的层', () => {
    const verdict = verdictReadOnly(facts({ accountReadOnly: true, superuser: false, sessionReadOnly: true }))
    expect(verdict.enabled).toBe(true)
    expect(verdict.enabled === true && verdict.layers).toEqual(['not-superuser', 'account', 'session'])
  })

  it('**拿不到证据 → 拒绝启用**（不是警告后继续）', () => {
    // 失败意味着：查不动权限元数据时档位照样启用，那 SQL 档就只剩代码层护栏了。
    const verdict = verdictReadOnly(facts({}))
    expect(verdict.enabled).toBe(false)
    expect(verdict.enabled === false && verdict.reason).toBe('EVIDENCE_MISSING')
  })

  it('明确可写 → ACCOUNT_WRITABLE（不是「没证据」）', () => {
    const verdict = verdictReadOnly(facts({ accountReadOnly: false, superuser: false }))
    expect(verdict.enabled === false && verdict.reason).toBe('ACCOUNT_WRITABLE')
  })

  it('超级用户 → SUPERUSER，且**先于**账号证据判定', () => {
    // 超级用户绕过权限检查，即便报「只读」也不可信——所以这条必须排在账号证据之前。
    const verdict = verdictReadOnly(facts({ accountReadOnly: true, superuser: true }))
    expect(verdict.enabled === false && verdict.reason).toBe('SUPERUSER')
  })

  it('Redis / RocketMQ 没有账号级只读概念 → ENGINE_UNSUPPORTED', () => {
    for (const engine of ['redis', 'rocketmq'] as const) {
      const verdict = verdictReadOnly({ engine, accountReadOnly: true })
      expect(verdict.enabled === false && verdict.reason).toBe('ENGINE_UNSUPPORTED')
    }
  })

  it('会话级只读**不能**单独构成已自证（连接级 ≠ 账号级）', () => {
    const verdict = verdictReadOnly(facts({ sessionReadOnly: true }))
    expect(verdict.enabled).toBe(false)
    expect(verdict.enabled === false && verdict.reason).toBe('EVIDENCE_MISSING')
  })

  it('四个 SQL 引擎都支持自证；达梦在内', () => {
    expect([...READONLY_PROBE_ENGINES].sort()).toEqual(['dm', 'mysql', 'postgres', 'sqlserver'])
  })

  it('摘要便于 `doctor` 输出', () => {
    expect(readOnlySummary(verdictReadOnly(facts({ accountReadOnly: true, superuser: false })))).toContain('通过')
    expect(readOnlySummary(verdictReadOnly(facts({})))).toContain('未通过')
  })
})

describe('护栏接进 invokeTool：拒跑发生在执行之前', () => {
  /** 假执行器：`explain` 返回给定计划，`run` 记录调用。 */
  function executorWith(plan: string | undefined): { executor: ToolExecutor; calls: string[] } {
    const calls: string[] = []
    return {
      calls,
      executor: {
        run: (request) => {
          calls.push(request.action)
          return Promise.resolve({ ok: true, result: { rows: [] } })
        },
        explain: () => Promise.resolve(plan),
      },
    }
  }

  it('全表扫描被拦，且**执行器零调用**', async () => {
    const { executor, calls } = executorWith('Seq Scan on orders  (rows=100000)')
    const outcome = await invokeTool({
      target: target({ engine: 'postgres' }),
      toolName: 'query',
      args: { sql: 'SELECT * FROM orders' },
      cwd: CWD,
      executor,
      thresholds: { maxRows: 1000 },
    })
    expect(outcome.ok).toBe(false)
    expect(outcome.ok === false && outcome.code).toBe('FULL_SCAN')
    expect(calls).toEqual([])
  })

  it('取不到计划 → PLAN_UNAVAILABLE，同样零调用', async () => {
    const { executor, calls } = executorWith(undefined)
    const outcome = await invokeTool({
      target: target({ engine: 'postgres' }),
      toolName: 'query',
      args: { sql: 'SELECT 1' },
      cwd: CWD,
      executor,
      thresholds: { maxRows: 1000 },
    })
    expect(outcome.ok === false && outcome.code).toBe('PLAN_UNAVAILABLE')
    expect(calls).toEqual([])
  })

  it('走索引 → 放行并执行', async () => {
    const { executor, calls } = executorWith('Index Scan using orders_pkey on orders  (rows=1)')
    const outcome = await invokeTool({
      target: target({ engine: 'postgres' }),
      toolName: 'query',
      args: { sql: 'SELECT * FROM orders WHERE id = 1' },
      cwd: CWD,
      executor,
      thresholds: { maxRows: 1000 },
    })
    expect(outcome.ok).toBe(true)
    expect(calls).toEqual(['query'])
  })

  it('不给阈值 → 不过护栏（缺省即无），但**仍是只读档**', async () => {
    const { executor, calls } = executorWith('Seq Scan on orders  (rows=100000)')
    const outcome = await invokeTool({
      target: target({ engine: 'postgres' }),
      toolName: 'query',
      args: { sql: 'SELECT * FROM orders' },
      cwd: CWD,
      executor,
    })
    expect(outcome.ok).toBe(true)
    expect(calls).toEqual(['query'])
  })

  it('非 SQL 引擎不过计划护栏（MQ 的 lag 不去要计划）', async () => {
    const explainCalls: string[] = []
    const executor: ToolExecutor = {
      run: () => Promise.resolve({ ok: true, result: {} }),
      explain: () => {
        explainCalls.push('explain')
        return Promise.resolve(undefined)
      },
    }
    const outcome = await invokeTool({
      // 用 RocketMQ 而不是 Redis：Redis 的工具面只有命令原文入口（`redis_command`），
      // 结构化动作名不是工具名（`tool.ts` 文件头「例外」一节）。而这条要验的是
      // 「非 SQL 引擎的**结构化**入口不去要计划」，所以得挑一个真的走结构化入口的引擎。
      target: target({ engine: 'rocketmq' }),
      toolName: 'lag',
      args: {},
      cwd: CWD,
      executor,
      thresholds: { maxRows: 1000 },
    })
    expect(outcome.ok).toBe(true)
    expect(explainCalls).toEqual([])
  })

  it('SQL 的 explain 工具自身不过护栏（否则会递归要计划）', async () => {
    const { executor, calls } = executorWith('Seq Scan on orders  (rows=100000)')
    const outcome = await invokeTool({
      target: target({ engine: 'postgres' }),
      toolName: 'explain',
      args: { sql: 'SELECT * FROM orders' },
      cwd: CWD,
      executor,
      thresholds: { maxRows: 1000 },
    })
    expect(outcome.ok).toBe(true)
    expect(calls).toEqual(['explain'])
  })
})
