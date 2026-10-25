/**
 * `scripts/mcp-tool-budget.mjs` 的用例 —— MCP 工具面成本报告的**纯判定函数**。
 *
 * ## 这份用例守三件事
 *
 * 1. **合计只数「已启用且有 toolCount」的行**：停用的行不注册工具、缺 `toolCount` 的行表示
 *    「读不到注册表 / 没连上」——两者都不能混进合计，否则报告会把「不知道」说成「0 个工具」，
 *    而那正是本仓反复踩过的「静默降级比报错更难发现」。
 * 2. **`unknown` 不触发超预算**：不知道数多少时，既不能判「通过」也不能判「超标」；
 *    宁可让 `--budget` 少拦一次，也不要用一个猜出来的 0 去下结论。
 * 3. **DTO 变形不抛**：`serverName` / `transport` 缺失、`servers` 不是数组、`toolCount` 是
 *    字符串——一律降级成占位值或 undefined，脚本不能因为宿主换个版本就崩。
 *
 * 反例（第 4 组）证明它不是恒绿：把「跳过停用行」的判据去掉，合计必然变。
 *
 * 不联网：本文件只 import 纯函数，CLI 段不执行（`import.meta.url` 判定不成立）。
 */
import { describe, expect, it } from 'vitest'

import { DEFAULT_BUDGET, isMcpToolName, overBudget, summarizeServers } from '../mcp-tool-budget.mjs'

const server = (overrides = {}) => ({
  id: 'mcp-x',
  serverName: 'x',
  transport: 'stdio',
  disabled: false,
  ...overrides,
})

describe('summarizeServers：合计口径', () => {
  it('已启用且有 toolCount 的行累加进合计', () => {
    const { rows, live, unknown, disabled } = summarizeServers([
      server({ serverName: 'jenkins', toolCount: 19 }),
      server({ serverName: 'dbx', toolCount: 25 }),
    ])
    expect(rows).toHaveLength(2)
    expect(live).toBe(44)
    expect(unknown).toBe(0)
    expect(disabled).toBe(0)
  })

  it('停用的行不计入合计（不注册工具），单独计数', () => {
    const { live, disabled } = summarizeServers([
      server({ serverName: 'jenkins', toolCount: 19 }),
      server({ serverName: 'off', toolCount: 30, disabled: true }),
    ])
    expect(live).toBe(19)
    expect(disabled).toBe(1)
  })

  it('缺 toolCount 的行单独计数，**不当作 0 混进合计**', () => {
    const { live, unknown, rows } = summarizeServers([
      server({ serverName: 'a', toolCount: 5 }),
      server({ serverName: 'b' }),
    ])
    expect(live).toBe(5)
    expect(unknown).toBe(1)
    expect(rows.find((row) => row.serverName === 'b')?.toolCount).toBeUndefined()
  })

  it('反例：去掉「跳过停用行」的判据 → 合计必然不同（证明用例有判别性）', () => {
    const input = [server({ serverName: 'on', toolCount: 3 }), server({ serverName: 'off', toolCount: 7, disabled: true })]
    const correct = summarizeServers(input).live
    const naive = input.reduce((sum, entry) => sum + (entry.toolCount ?? 0), 0)
    expect(correct).toBe(3)
    expect(naive).toBe(10)
    expect(correct).not.toBe(naive)
  })
})

describe('summarizeServers：DTO 变形不抛', () => {
  it('servers 不是数组 → 空表', () => {
    expect(summarizeServers(undefined).rows).toEqual([])
    expect(summarizeServers(null).live).toBe(0)
    expect(summarizeServers({}).live).toBe(0)
  })

  it('缺 serverName / transport → 占位值；toolCount 非数字 → undefined', () => {
    const { rows, unknown } = summarizeServers([{ toolCount: '19' }, { serverName: 'ok', transport: 'http', toolCount: 2 }])
    expect(rows[0].serverName).toBe('(unknown)')
    expect(rows[0].transport).toBe('(unknown)')
    expect(rows[0].toolCount).toBeUndefined()
    expect(rows[1].toolCount).toBe(2)
    expect(unknown).toBe(1)
  })
})

describe('overBudget：不知道的数不参与判定', () => {
  const cases = [
    { label: '未给预算 → 永不超', summary: { live: 999 }, budget: undefined, expected: false },
    { label: '等于预算 → 不超（预算是上限，不是阈值-1）', summary: { live: 10 }, budget: 10, expected: false },
    { label: '超出 1 个 → 超', summary: { live: 11 }, budget: 10, expected: true },
    { label: 'unknown 很多但 live 为 0 → 不超（不知道≠超标）', summary: { live: 0, unknown: 5 }, budget: 1, expected: false },
  ]
  for (const item of cases) {
    it(item.label, () => {
      expect(overBudget(item.summary, item.budget)).toBe(item.expected)
    })
  }

  it('默认预算是正数（脚本里那条 `--budget` 缺省不启用，但常量不能被写成 0）', () => {
    expect(DEFAULT_BUDGET).toBeGreaterThan(0)
  })
})

describe('isMcpToolName：前缀判定与 core 命名同源', () => {
  it('mcp__<server>__<tool> 命中', () => {
    expect(isMcpToolName('mcp__jenkins__triggerBuild')).toBe(true)
    expect(isMcpToolName('mcp__codegraph__codegraph_explore')).toBe(true)
  })

  it('原生插件工具与空值不命中', () => {
    expect(isMcpToolName('docker_ps')).toBe(false)
    expect(isMcpToolName('tty_run')).toBe(false)
    expect(isMcpToolName('')).toBe(false)
    expect(isMcpToolName(undefined)).toBe(false)
  })
})
