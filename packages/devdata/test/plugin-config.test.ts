/**
 * 配置面测试（`docs/devdata-plan.md` §5）。
 *
 * 这一层的失败方式全是**静默的**，所以每条判据都要有反之亦然的用例：认不出的引擎被当成默认值、
 * 认不出的环境标签悄悄变成可写、空作用域被补上一个默认目录——这些都不会报错，只会让「我以为
 * 配好了」成立。用例对着**两个方向**各钉一条：合法的走通、非法的被纠正**且留下 problem**。
 */

import { describe, expect, it } from 'vitest'

import {
  DEFAULT_SCAN_COUNT,
  DEFAULT_TIMEOUT_MS,
  MAX_SCAN_COUNT,
  normalizeConfig,
  pickTarget,
  targetIds,
} from '../src/index.js'

const CWD = '/work/project-a'

/** 一份最小的、合法的 Redis 目标。 */
function redisTarget(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'redis-248',
    label: '248 Redis',
    engine: 'redis',
    env: 'test-shared',
    scopeDirs: [CWD],
    host: '192.168.80.248',
    port: 6379,
    ...overrides,
  }
}

describe('空 / 缺省', () => {
  it('空配置：启用、没有目标、没有问题（没有目标不是错误，只是没有入口）', () => {
    const live = normalizeConfig({})
    expect(live.enabled).toBe(true)
    expect(live.announceToAgent).toBe(true)
    expect(live.targets).toEqual([])
    expect(live.problems).toEqual([])
    expect(live.auditFile).toBe('')
    expect(live.timeoutMs).toBe(DEFAULT_TIMEOUT_MS)
  })

  it('enabled: false 关掉插件（其余字段照常解析）', () => {
    expect(normalizeConfig({ enabled: false }).enabled).toBe(false)
  })

  it('非布尔的开关：按默认值处理并留下 problem（不静默）', () => {
    const live = normalizeConfig({ enabled: 'no' })
    expect(live.enabled).toBe(true)
    expect(live.problems.join('\n')).toContain('enabled')
  })
})

describe('引擎：认不出的一律拒（丢掉整个目标，不是回落默认值）', () => {
  it('合法引擎解析出来', () => {
    const live = normalizeConfig({ targets: [redisTarget()] })
    expect(live.problems).toEqual([])
    expect(live.targets[0]?.engine).toBe('redis')
  })

  it('拼错的引擎 → 整个目标丢掉 + problem 里点出可用值', () => {
    const live = normalizeConfig({ targets: [redisTarget({ engine: 'redis7' })] })
    expect(live.targets).toEqual([])
    const problem = live.problems.join('\n')
    expect(problem).toContain('redis7')
    expect(problem).toContain('整个目标已忽略')
    expect(problem).toContain('rocketmq')
  })

  it('引擎大小写 / 空格归一（`Redis ` 认）', () => {
    const live = normalizeConfig({ targets: [redisTarget({ engine: ' Redis ' })] })
    expect(live.targets[0]?.engine).toBe('redis')
    expect(live.problems).toEqual([])
  })
})

describe('环境标签：认不出回落 unknown，**并且说出来**', () => {
  it('四个已知档位原样保留', () => {
    for (const env of ['dev', 'test-shared', 'test-isolated', 'production', 'unknown']) {
      const live = normalizeConfig({ targets: [redisTarget({ env })] })
      expect(live.targets[0]?.env).toBe(env)
      expect(live.problems).toEqual([])
    }
  })

  it('拼错的环境 → unknown（不可写）+ problem 里说清「已按 unknown 处理」', () => {
    const live = normalizeConfig({ targets: [redisTarget({ env: 'testing' })] })
    expect(live.targets[0]?.env).toBe('unknown')
    const problem = live.problems.join('\n')
    expect(problem).toContain('testing')
    expect(problem).toContain('不可写')
  })

  it('缺省环境 = unknown（**不是** test），且**不**报 problem（没标就是没标）', () => {
    const raw = redisTarget()
    delete raw.env
    const live = normalizeConfig({ targets: [raw] })
    expect(live.targets[0]?.env).toBe('unknown')
    expect(live.problems).toEqual([])
  })
})

describe('作用域：空就是处处拒绝，不替用户填默认值', () => {
  it('没写 scopeDirs → 保持空（= 处处拒绝）', () => {
    const raw = redisTarget()
    delete raw.scopeDirs
    const live = normalizeConfig({ targets: [raw] })
    expect(live.targets[0]?.scopeDirs).toEqual([])
  })

  it('`~` 展开（否则一个绝对 cwd 永远匹配不上它，用户会以为「配了作用域」）', () => {
    const live = normalizeConfig({ targets: [redisTarget({ scopeDirs: ['~/coding', ''] })] })
    const dirs = live.targets[0]?.scopeDirs ?? []
    expect(dirs).toHaveLength(1)
    expect(dirs[0]?.startsWith('~')).toBe(false)
    expect(dirs[0]?.endsWith('/coding')).toBe(true)
  })
})

describe('能力规格：空 env = 没接入闸门（比「接了但授不了权」更诚实）', () => {
  it('正常规格解析出来，label 缺省取 env', () => {
    const live = normalizeConfig({
      targets: [redisTarget({ writeCapability: { env: 'DSH_DEVDATA_WRITE' } })],
    })
    expect(live.targets[0]?.writeCapability).toEqual({ env: 'DSH_DEVDATA_WRITE', label: 'DSH_DEVDATA_WRITE' })
    expect(live.problems).toEqual([])
  })

  it('空 env → 当作没接入，并留下 problem（否则入口会露出去、却永远授不了权）', () => {
    const live = normalizeConfig({ targets: [redisTarget({ writeCapability: {} })] })
    expect(live.targets[0]?.writeCapability).toBeUndefined()
    expect(live.problems.join('\n')).toContain('writeCapability')
  })

  it('不是对象的能力规格 → 没接入 + problem', () => {
    const live = normalizeConfig({ targets: [redisTarget({ dangerousReadCapability: true })] })
    expect(live.targets[0]?.dangerousReadCapability).toBeUndefined()
    expect(live.problems.join('\n')).toContain('dangerousReadCapability')
  })
})

describe('id：缺了或重了就丢（否则 target 参数会指向不可预期的那个）', () => {
  it('缺 id → 丢掉 + problem', () => {
    const raw = redisTarget()
    delete raw.id
    const live = normalizeConfig({ targets: [raw] })
    expect(live.targets).toEqual([])
    expect(live.problems.join('\n')).toContain('缺少 id')
  })

  it('重复 id → 只留第一个 + problem', () => {
    const live = normalizeConfig({ targets: [redisTarget({ label: '第一个' }), redisTarget({ label: '第二个' })] })
    expect(live.targets).toHaveLength(1)
    expect(live.targets[0]?.label).toBe('第一个')
    expect(live.problems.join('\n')).toContain('重复')
  })

  it('label 缺省取 id', () => {
    const raw = redisTarget()
    delete raw.label
    const live = normalizeConfig({ targets: [raw] })
    expect(live.targets[0]?.label).toBe('redis-248')
  })
})

describe('连接：两个字段都齐才认（少一个不是「用默认端口」）', () => {
  it('齐了才有连接，含 db', () => {
    const live = normalizeConfig({ targets: [redisTarget({ db: 3 })] })
    expect(live.targets[0]?.connection).toEqual({ host: '192.168.80.248', port: 6379, db: 3 })
  })

  it('只有 host → 没有连接 + problem（不会拿默认端口去试）', () => {
    const raw = redisTarget({ port: undefined })
    delete raw.port
    const live = normalizeConfig({ targets: [raw] })
    expect(live.targets[0]?.connection).toBeUndefined()
    expect(live.problems.join('\n')).toContain('连接信息不完整')
  })

  it('端口越界 → 没有连接 + problem', () => {
    const live = normalizeConfig({ targets: [redisTarget({ port: 99999 })] })
    expect(live.targets[0]?.connection).toBeUndefined()
    expect(live.problems.join('\n')).toContain('连接信息不完整')
  })

  it('完全没写连接 → 不报 problem（有些目标只是登记着，还没有通路）', () => {
    const raw = redisTarget()
    delete raw.host
    delete raw.port
    const live = normalizeConfig({ targets: [raw] })
    expect(live.targets[0]?.connection).toBeUndefined()
    expect(live.problems).toEqual([])
  })
})

describe('上限：坏了要更严，不是更松', () => {
  it('合法值保留', () => {
    const live = normalizeConfig({ targets: [redisTarget({ maxScanCount: 50 })] })
    expect(live.targets[0]?.maxScanCount).toBe(50)
    expect(live.problems).toEqual([])
  })

  it('越界值夹回默认（**不是**当成「无上限」）+ problem', () => {
    for (const bad of [0, -1, 1.5, MAX_SCAN_COUNT + 1, 'many']) {
      const live = normalizeConfig({ targets: [redisTarget({ maxScanCount: bad })] })
      expect(live.targets[0]?.maxScanCount).toBe(DEFAULT_SCAN_COUNT)
      expect(live.problems.join('\n')).toContain('maxScanCount')
    }
  })

  it('刚好在上限上：保留', () => {
    const live = normalizeConfig({ targets: [redisTarget({ maxScanCount: MAX_SCAN_COUNT })] })
    expect(live.targets[0]?.maxScanCount).toBe(MAX_SCAN_COUNT)
  })
})

describe('计划护栏与超时', () => {
  it('合法的 plan 保留（0 也算合法：0 = 一行都不许）', () => {
    const live = normalizeConfig({ plan: { maxRows: 0, maxCost: 5000 } })
    expect(live.plan).toEqual({ maxRows: 0, maxCost: 5000 })
    expect(live.problems).toEqual([])
  })

  it('非法的 plan 项被忽略 + problem（忽略 = 不做这一层检查，比按 0 处理安全）', () => {
    const live = normalizeConfig({ plan: { maxRows: -5, maxCost: 'big' } })
    expect(live.plan).toEqual({})
    expect(live.problems.join('\n')).toContain('plan.maxRows')
    expect(live.problems.join('\n')).toContain('plan.maxCost')
  })

  it('超时越界夹回默认 + problem', () => {
    const live = normalizeConfig({ timeoutMs: 1 })
    expect(live.timeoutMs).toBe(DEFAULT_TIMEOUT_MS)
    expect(live.problems.join('\n')).toContain('timeoutMs')
  })

  it('targets 不是数组 → 按「没有目标」处理 + problem', () => {
    const live = normalizeConfig({ targets: { id: 'x' } })
    expect(live.targets).toEqual([])
    expect(live.problems.join('\n')).toContain('targets')
  })

  it('数组里混着非对象项 → 逐条丢掉，其余照常解析', () => {
    const live = normalizeConfig({ targets: ['nope', redisTarget()] })
    expect(live.targets).toHaveLength(1)
    expect(live.problems).toHaveLength(1)
  })
})

describe('按 id 取目标与名单', () => {
  const live = normalizeConfig({ targets: [redisTarget(), redisTarget({ id: 'b', label: 'B' })] })

  it('pickTarget 命中 / 未命中 / 空串', () => {
    expect(pickTarget(live.targets, 'b')?.id).toBe('b')
    expect(pickTarget(live.targets, '  b  ')?.id).toBe('b')
    expect(pickTarget(live.targets, 'nope')).toBeUndefined()
    expect(pickTarget(live.targets, '')).toBeUndefined()
    expect(pickTarget(live.targets, 42)).toBeUndefined()
  })

  it('targetIds 给可用名单；一个都没有时说明配置里还没有目标', () => {
    expect(targetIds(live.targets)).toBe('redis-248 / b')
    expect(targetIds([])).toContain('一个都没有')
  })
})
