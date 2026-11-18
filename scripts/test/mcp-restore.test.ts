/**
 * `scripts/lib/mcp-restore.mjs` 的用例 —— 真机脚本「借宿主配置验链路」后的**写回**判据。
 *
 * ## 这份用例守的是什么
 *
 * 2026-11-18 真机验收（DSH 0.2.2-rc.4）踩到的真实缺陷：`verify-mcp-tools.mjs` 收尾把
 * 宿主的 MCP 配置写回时只取 `{ id, config }`，而 `disabled` 在 DTO 里挂在**行上**、
 * 不在 `config` 里 —— 于是宿主上那行「已停用」的服务器被**静默重新启用**。
 *
 * 症状极隐蔽，三处都没报：
 *
 * - 写回请求 200、条数分毫不差（当轮的 M4 只断言「条数相同」）；
 * - 宿主照常启动，日志只有正常的 `mounted`；
 * - 抓它的是**另一条**自证 —— 「真实配置逐字节未变」：`~/.dsh/cordis.patch.yml` 少了
 *   正好 21 字节，就是一行 `      disabled: true`。
 *
 * 所以这里钉三件事：
 * 1. `restoreRowsFromDto` **带上 `disabled`**（只带 `true`，不写 `disabled: false`——
 *    写回的形状要与宿主自己写出来的一致）；
 * 2. 运行时状态（status / conflict / toolCount / loaded）**不进写回体**（会被接口拒）；
 * 3. `sameRowShape` 的判据是**逐条同形**，条数相同但 `disabled` 丢了必须判不同。
 *
 * 反例（第 4 组）证明它不是恒绿：把 `disabled` 从写回体里去掉，`sameRowShape` 必然报不同。
 */
import { describe, expect, it } from 'vitest'

import { restoreRowsFromDto, rowShape, sameRowShape } from '../lib/mcp-restore.mjs'

/** `/api/dsh-mcp/servers` 的 DTO 行（含运行时状态字段，模拟真实返回）。 */
const dto = (overrides = {}) => ({
  id: 'mcp-x',
  serverName: 'x',
  transport: 'stdio',
  disabled: false,
  status: 'connected',
  conflict: false,
  toolCount: 3,
  loaded: true,
  config: { serverName: 'x', transport: 'stdio', command: 'node', args: ['a.mjs'] },
  ...overrides,
})

describe('restoreRowsFromDto：写回体只带接口要的东西', () => {
  it('带上行状态 disabled（只带 true）', () => {
    const rows = restoreRowsFromDto([dto({ id: 'mcp-a', disabled: true }), dto({ id: 'mcp-b', disabled: false })])
    expect(rows[0]).toEqual({
      id: 'mcp-a',
      config: { serverName: 'x', transport: 'stdio', command: 'node', args: ['a.mjs'] },
      disabled: true,
    })
    // 未停用的行不写 disabled: false —— 写回形状要与宿主自己写出来的一致
    expect(rows[1]).toEqual({
      id: 'mcp-b',
      config: { serverName: 'x', transport: 'stdio', command: 'node', args: ['a.mjs'] },
    })
    expect('disabled' in rows[1]).toBe(false)
  })

  it('运行时状态不进写回体（status / conflict / toolCount / loaded 都是只读字段）', () => {
    const [row] = restoreRowsFromDto([dto()])
    for (const key of ['status', 'conflict', 'toolCount', 'loaded', 'serverName', 'transport']) {
      expect(row, `${key} 不该出现在写回体里`).not.toHaveProperty(key)
    }
  })

  it('形状不对的 DTO 行被跳过，而不是抛出（宿主换版本不能让收尾崩掉）', () => {
    expect(restoreRowsFromDto(undefined)).toEqual([])
    expect(restoreRowsFromDto({ servers: [] })).toEqual([])
    expect(restoreRowsFromDto([null, 42, { id: 'x' }, { config: {} }, dto()])).toHaveLength(1)
  })
})

describe('sameRowShape：逐条同形，不是数条数', () => {
  it('条数相同、顺序不同 → 判同（载入次序不是语义）', () => {
    const snapshot = restoreRowsFromDto([dto({ id: 'mcp-a' }), dto({ id: 'mcp-b' })])
    const current = [dto({ id: 'mcp-b' }), dto({ id: 'mcp-a' })]
    expect(sameRowShape(snapshot, current)).toBe(true)
  })

  it('**丢了 disabled 的那一行 → 判不同**（这条就是 2026-11-18 的真实形状）', () => {
    const disabledRow = dto({ id: 'mcp-chat2db', serverName: 'chat2db', disabled: true })
    const snapshot = restoreRowsFromDto([disabledRow])
    // 写回后宿主报的是「已启用」——正是旧脚本丢掉 disabled 造成的状态
    const current = [{ ...disabledRow, disabled: false }]
    expect(sameRowShape(snapshot, current)).toBe(false)
    expect(sameRowShape(snapshot, [disabledRow])).toBe(true)
  })

  it('多一条 / 少一条 / 改了 serverName → 判不同', () => {
    const snapshot = restoreRowsFromDto([dto({ id: 'mcp-a', serverName: 'a' })])
    expect(sameRowShape(snapshot, [dto({ id: 'mcp-a', serverName: 'a' }), dto({ id: 'mcp-b', serverName: 'b' })])).toBe(false)
    expect(sameRowShape(snapshot, [])).toBe(false)
    // 注意：判据读的是 `config.serverName`（写回体里只有 config），所以夹具要改到 config 上
    expect(sameRowShape(snapshot, [dto({ id: 'mcp-a', serverName: 'renamed', config: { serverName: 'renamed', transport: 'stdio' } })])).toBe(false)
  })

  it('rowShape 的三段可读（排错时肉眼能比）', () => {
    expect(rowShape({ id: 'mcp-a', config: { serverName: 'a' }, disabled: true })).toBe('mcp-a|a|true')
    expect(rowShape({ id: 'mcp-b', config: { serverName: 'b' } })).toBe('mcp-b|b|false')
  })
})

describe('反例层：把缺陷改回去必须变红', () => {
  it('写回体丢掉 disabled → sameRowShape 立刻判不同', () => {
    const broken = (rows) => rows.map(({ id, config }) => ({ id, config })) // 旧版形状
    const snapshot = broken(restoreRowsFromDto([dto({ id: 'mcp-a', disabled: true })]))
    const current = [dto({ id: 'mcp-a', disabled: true })]
    expect(sameRowShape(snapshot, current)).toBe(false)
  })

  it('判据退回「只比条数」→ 丢 disabled 的情况会漏判（证明旧判据不够）', () => {
    const snapshot = restoreRowsFromDto([dto({ id: 'mcp-a', disabled: true })])
    const current = [{ ...dto({ id: 'mcp-a', disabled: true }), disabled: false }]
    // 旧判据（条数相同）会放行：
    expect(snapshot.length === current.length).toBe(true)
    // 新判据不放行：
    expect(sameRowShape(snapshot, current)).toBe(false)
  })
})
