/**
 * @hyzyn/dsh-mcp — issue #5 回归：「外部实例清单」不得被当成「serverName 冲突」。
 *
 * 现场（用户机，0.1.15 与 0.2.0 都一样）：卡片顶部常驻一条**橙色警告条**，写着
 * 「以下 serverName 与本插件托管之外的 mcp-client 实例重复，可能导致对应实例加载失败：
 *   cherry-winapp、cherry-memory、…（7 条）」，而接口里两条托管行的 `conflict` 全是 `false`
 * ——7 个外部名字与本卡的 2 个名字毫无交集，一条真重名都没有。
 *
 * 根因：host 端 `conflicts` 塞的是 `externalMcpEntries()` 的**原样清单**（不与托管行求交集），
 * 浏览器的横幅又只看 `conflicts.length`，于是「别人的名字」被渲染成「你重名了、对面会加载失败」。
 *
 * 契约（本文件钉住）：
 * 1. `conflicts` = 清单 ∩ 托管行 = DTO 里 `servers[].conflict === true` 的那些行；无交集 ⇒ 空数组；
 * 2. 清单本身不丢，走 `externalServers`（信息条 + 保存护栏比对用）；
 * 3. 真重名时 `conflicts` 要点出**托管行自己的** id / serverName（不是外部条目的）。
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildServersDto, externalNameClashes, spliceManagedBlock } from '../src/index.js'

type ManagedRows = Parameters<typeof spliceManagedBlock>[1]

/** 本卡托管的一行（写进托管区块的那种形状）。 */
const row = (id: string, serverName: string) => ({ id, config: { serverName, transport: 'stdio' as const, command: 'node' } })

/** 别的插件 / profile 层手工托管的 mcp-client 条目（id 不在本卡托管块里）。 */
const externalEntry = (id: string, serverName: string) => ({
  options: { id, name: '@deepseek-ai/dsh-mcp-client', config: { serverName } },
})

/** buildServersDto 只需要 loader.entries()（状态与外部清单都从这棵树上读）。 */
const fakeCtx = (entries: unknown[]) =>
  ({ loader: { entries: () => entries } }) as unknown as Parameters<typeof buildServersDto>[0]

/** issue #5 的用户现场：7 条外部实例，名字与本卡 2 行毫无交集。 */
const CHERRY_EXTERNAL = [
  externalEntry('mcp-cherry-winapp', 'cherry-winapp'),
  externalEntry('mcp-cherry-memory', 'cherry-memory'),
  externalEntry('mcp-cherry-todo', 'cherry-todo'),
  externalEntry('mcp-cherry-fetch', 'cherry-fetch'),
  externalEntry('mcp-cherry-python', 'cherry-python'),
  externalEntry('mcp-cherry-context7', 'cherry-context7'),
  externalEntry('mcp-cherry-seqthink', 'cherry-seqthink'),
]

let home = ''
const previousHome = process.env.DSH_HOME

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'dsh-mcp-conflicts-'))
  process.env.DSH_HOME = home
})

afterEach(() => {
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
  rmSync(home, { recursive: true, force: true })
})

function writeManagedBlock(rows: ManagedRows): void {
  writeFileSync(join(home, 'cordis.patch.yml'), spliceManagedBlock('# dsh home patch layer\n', rows), 'utf8')
}

describe('buildServersDto：conflicts 只放真重名，外部清单走 externalServers（issue #5）', () => {
  it('【事故现场】外部 7 条与本卡 2 行毫无交集 → conflicts 为空（横幅不渲染），清单不丢', () => {
    writeManagedBlock([row('mcp-ee272eeb92', 'context7-mcp'), row('mcp-d082ca9f83', 'winapp-mcp')])

    const dto = buildServersDto(fakeCtx(CHERRY_EXTERNAL))

    // 修的就是这一条：曾经这里原样返回 7 条外部实例，横幅于是常驻橙色警告。
    expect(dto.conflicts).toEqual([])
    // 清单照旧可得（浏览器用它的中性信息条 + 保存护栏），只是不再冒充「冲突」。
    expect(dto.externalServers.map((entry) => entry.serverName)).toEqual(CHERRY_EXTERNAL.map((entry) => entry.options.config.serverName))
    // 逐行判定本来就是对的：没有一行被标成冲突。
    expect(dto.servers.map((server) => server.conflict)).toEqual([false, false])
  })

  it('外部清单里真有同名 → conflicts 点出**托管行自己**的 id / serverName，逐行 conflict 一致', () => {
    writeManagedBlock([row('mcp-ee272eeb92', 'context7-mcp'), row('mcp-d082ca9f83', 'winapp-mcp')])
    const external = [...CHERRY_EXTERNAL, externalEntry('mcp-codegraph-managed', 'winapp-mcp')]

    const dto = buildServersDto(fakeCtx(external))

    expect(dto.conflicts).toEqual([{ id: 'mcp-d082ca9f83', serverName: 'winapp-mcp' }])
    expect(dto.servers.map((server) => server.conflict)).toEqual([false, true])
    expect(dto.externalServers).toHaveLength(CHERRY_EXTERNAL.length + 1)
  })

  it('历史遗留的同名行：进 conflicts（横幅该提请用户改名），但仍留在外部清单里供保存护栏判定', () => {
    writeManagedBlock([row('mcp-9dc17004f7', 'codegraph')])
    const external = [externalEntry('mcp-codegraph-managed', 'codegraph')]

    const dto = buildServersDto(fakeCtx(external))

    expect(dto.conflicts).toEqual([{ id: 'mcp-9dc17004f7', serverName: 'codegraph' }])
    expect(dto.externalServers).toEqual([{ id: 'mcp-codegraph-managed', serverName: 'codegraph' }])
  })

  it('本卡托管块里的条目不算「外部」（自己的行不能出现在清单或冲突里）', () => {
    writeManagedBlock([row('mcp-ee272eeb92', 'context7-mcp')])
    // loader 树里同时有本卡的这一行（fiber 挂起来了）与一条外部实例。
    const loader = [
      { options: { id: 'mcp-ee272eeb92', name: '@deepseek-ai/dsh-mcp-client', config: { serverName: 'context7-mcp' } }, fiber: { state: 1 } },
      externalEntry('mcp-cherry-memory', 'cherry-memory'),
    ]

    const dto = buildServersDto(fakeCtx(loader))

    expect(dto.externalServers.map((entry) => entry.id)).toEqual(['mcp-cherry-memory'])
    expect(dto.conflicts).toEqual([])
    expect(dto.servers.map((server) => server.conflict)).toEqual([false])
  })

  it('没有外部实例时：清单与冲突都是空（不渲染任何横幅）', () => {
    writeManagedBlock([row('mcp-ee272eeb92', 'context7-mcp')])

    const dto = buildServersDto(fakeCtx([]))

    expect(dto.conflicts).toEqual([])
    expect(dto.externalServers).toEqual([])
  })
})

describe('externalNameClashes（纯函数：清单 ∩ 托管行）', () => {
  const external = [externalEntry('mcp-x', 'alpha'), externalEntry('mcp-y', 'beta')].map((entry) => ({ id: entry.options.id, serverName: entry.options.config.serverName }))

  it('无交集 → 空数组', () => {
    expect(externalNameClashes([{ id: 'mcp-1', serverName: 'gamma' }], external)).toEqual([])
  })

  it('只保留相交的行，顺序跟托管行，id 取托管行的', () => {
    expect(externalNameClashes([{ id: 'mcp-2', serverName: 'beta' }, { id: 'mcp-1', serverName: 'gamma' }, { id: 'mcp-3', serverName: 'alpha' }], external)).toEqual([
      { id: 'mcp-2', serverName: 'beta' },
      { id: 'mcp-3', serverName: 'alpha' },
    ])
  })

  it('名字要**完全相等**才算冲突（cherry-context7 ≠ context7-mcp 这类近似不算）', () => {
    expect(externalNameClashes([{ id: 'mcp-1', serverName: 'context7-mcp' }], [{ id: 'mcp-x', serverName: 'cherry-context7' }])).toEqual([])
  })

  it('外部清单为空 / 托管行为空 → 空数组', () => {
    expect(externalNameClashes([{ id: 'mcp-1', serverName: 'alpha' }], [])).toEqual([])
    expect(externalNameClashes([], external)).toEqual([])
  })
})
