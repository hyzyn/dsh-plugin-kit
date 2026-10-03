/**
 * 入口面测试（`docs/devdata-plan.md` §3.6.1 / §2.4）。
 *
 * 这一层只加**一个**条件：这个引擎有没有执行器。它值得单独测，因为它的失败方式是本仓最忌讳的
 * 那一种——**注册一个跑起来必失败的工具**（agent 会先试、读一句执行错误、再改，而正确的下一步
 * 根本不在那儿）。所以用例的两端都要钉：
 *   - 有执行器的引擎：工具照可见面给全；
 *   - 没有执行器的引擎：**只给引擎无关项**，而且目标本身不被抹掉（agent 要能知道它存在）。
 */

import { describe, expect, it } from 'vitest'

import {
  AGNOSTIC_TOOL_NAMES,
  RAW_COMMAND_TOOL_NAME,
  entryToolNames,
  entryTools,
  toolNameFor,
  unionEntryTools,
  type DevDataTarget,
} from '../src/index.js'

const CWD = '/work/project-a'

function target(overrides: Partial<DevDataTarget> = {}): DevDataTarget {
  return {
    id: 't-redis',
    label: '测试 Redis',
    engine: 'redis',
    env: 'test-isolated',
    scopeDirs: [CWD],
    ...overrides,
  }
}

describe('有执行器：入口面就是可见面', () => {
  it('Redis（唯一有执行器的引擎）给出命令原文入口 + 引擎无关项', () => {
    const names = entryToolNames(target(), { engines: ['redis'] })
    expect([...names].sort()).toEqual([...AGNOSTIC_TOOL_NAMES, RAW_COMMAND_TOOL_NAME].sort())
  })

  it('SQL 目标有执行器时给出结构化动作（今天还没执行器，这里只验这一层的算法）', () => {
    const names = entryToolNames(target({ id: 't-sql', engine: 'mysql' }), { engines: ['mysql'] })
    expect(names).toContain(toolNameFor('query'))
    expect(names).toContain(toolNameFor('schema'))
    expect(names).toContain(toolNameFor('list_targets'))
  })
})

describe('没有执行器：只给引擎无关项，但**目标本身不被抹掉**', () => {
  it('引擎不在服务清单里 → 只剩 list_targets / doctor / capabilities', () => {
    const tools = entryTools(target({ id: 't-sql', engine: 'mysql' }), { engines: ['redis'] })
    expect([...tools.map((tool) => tool.name)].sort()).toEqual([...AGNOSTIC_TOOL_NAMES].sort())
  })

  it('一个执行器都没有时，任何引擎都只剩引擎无关项（包括 Redis）', () => {
    for (const engine of ['redis', 'mysql', 'sqlserver', 'postgres', 'dm', 'rocketmq'] as const) {
      const names = entryToolNames(target({ engine }), { engines: [] })
      expect([...names].sort()).toEqual([...AGNOSTIC_TOOL_NAMES].sort())
    }
  })

  it('过滤掉的是**引擎入口**，不是目标：list_targets 仍然是 agent 发现这些目标的途径', () => {
    const names = entryToolNames(target({ engine: 'mysql' }), { engines: [] })
    expect(names).toContain(toolNameFor('list_targets'))
  })
})

describe('并集：按名字注册一次，描述里嵌目标名单', () => {
  it('同一入口在多个目标上可见时只注册一次，且列出全部目标', () => {
    const tools = unionEntryTools(
      [
        target({ id: 'redis-a', label: 'A' }),
        target({ id: 'redis-b', label: 'B' }),
        target({ id: 'sql-x', engine: 'mysql' }),
      ],
      { engines: ['redis'] },
    )
    const raw = tools.find((tool) => tool.name === RAW_COMMAND_TOOL_NAME)
    expect(raw?.targets).toEqual(['redis-a', 'redis-b'])
    // 只出现一次（不是每个目标一条）。
    expect(tools.filter((tool) => tool.name === RAW_COMMAND_TOOL_NAME)).toHaveLength(1)
    // 没有执行器的那个引擎的专属项不进并集。
    expect(tools.map((tool) => tool.name)).not.toContain(toolNameFor('query'))
  })

  it('顺序稳定（同一份输入两次结果一致）：注册是幂等的，顺序变了会白拆装一轮', () => {
    const targets = [target({ id: 'a' }), target({ id: 'b', engine: 'rocketmq' })]
    const options = { engines: ['redis', 'rocketmq'] } as const
    const first = unionEntryTools(targets, options).map((tool) => tool.name)
    const second = unionEntryTools(targets, options).map((tool) => tool.name)
    expect(first).toEqual(second)
    // 同一个入口只带一份 why。
    expect(unionEntryTools(targets, options).every((tool) => tool.why.trim() !== '')).toBe(true)
  })

  it('空目标 → 空入口面（不报错、也不给默认工具）', () => {
    expect(unionEntryTools([], { engines: ['redis'] })).toEqual([])
  })
})
