/**
 * @hyzyn/dsh-mcp — 「保存空列表」清空防护的回归测试。
 *
 * 背景（实测踩过）：`/servers/save` 是整表替换语义，请求体里的 servers 就是全部内容。
 * 卡片若因启动竞态 / 陈旧快照拿到空列表，一次保存就会把已配置的服务器全部抹掉，
 * 而 home 补丁文件里只留下一个 `- insert: []`，事后无法判断是谁清的。
 *
 * 契约：空列表必须显式带 `clearAll: true` 才允许写；区块本来就空时不算破坏，放行。
 */
import { describe, expect, it } from 'vitest'
import { emptyServersRejection, externalNameRejection } from '../src/index.js'

describe('空列表清空防护（emptyServersRejection）', () => {
  it('非空列表一律放行（哪怕区块里还有别的条目）', () => {
    expect(emptyServersRejection(1, 3, undefined)).toBeUndefined()
    expect(emptyServersRejection(3, 0, undefined)).toBeUndefined()
  })

  it('空列表 + 区块里本来就没有条目：放行（保存一张空卡片不该报错）', () => {
    expect(emptyServersRejection(0, 0, undefined)).toBeUndefined()
  })

  it('空列表 + 区块里有条目 + 没有 clearAll：拒绝，并在文案里说明会清掉几条', () => {
    const message = emptyServersRejection(0, 3, undefined)
    expect(message).toBeDefined()
    expect(message).toContain('3 条')
    expect(message).toContain('clearAll: true')
  })

  it('空列表 + 区块里有条目 + clearAll: true：放行（用户明确确认清空）', () => {
    expect(emptyServersRejection(0, 3, true)).toBeUndefined()
  })

  it('clearAll 只认严格 true：字符串 / 1 / 对象都不算确认', () => {
    for (const falsy of ['true', 1, {}, [], false, null]) {
      expect(emptyServersRejection(0, 2, falsy), `clearAll=${JSON.stringify(falsy)} 不应被当作确认`).toBeDefined()
    }
  })
})

describe('外部实例重名防护（externalNameRejection）', () => {
  /** 别的插件托管的 mcp-client（真实场景：Codegraph 插件自管的 codegraph 行）。 */
  const external = [{ id: 'mcp-codegraph-managed', serverName: 'codegraph' }]

  it('提交的名字没被外部实例占用：放行', () => {
    expect(externalNameRejection([{ id: 'mcp-a', serverName: 'github' }], [], external)).toBeUndefined()
    expect(externalNameRejection([{ id: 'mcp-a', serverName: 'github' }], [], [])).toBeUndefined()
  })

  it('【用户踩过的坑】新增一条与外部实例同名的服务器：拒绝，文案点名名字与条目标识', () => {
    const message = externalNameRejection([{ id: 'mcp-9dc17004f7', serverName: 'codegraph' }], [], external)
    expect(message).toBeDefined()
    expect(message).toContain('codegraph')
    expect(message).toContain('mcp-codegraph-managed')
    expect(message).toContain('mcp__codegraph__*')
    expect(message).toContain('别的插件托管')
  })

  it('历史遗留的同名行（同一 id 本来就带这个名字）：放行，别挡住其它字段的保存', () => {
    const existing = [{ id: 'mcp-9dc17004f7', serverName: 'codegraph' }]
    expect(externalNameRejection(existing, existing, external)).toBeUndefined()
  })

  it('把已有行改名成外部实例的名字：仍然拒绝（同一 id，但名字是新引入的）', () => {
    const existing = [{ id: 'mcp-a', serverName: 'github' }]
    const incoming = [{ id: 'mcp-a', serverName: 'codegraph' }]
    expect(externalNameRejection(incoming, existing, external)).toBeDefined()
  })

  it('同一次提交里多条撞名：报第一条', () => {
    const message = externalNameRejection(
      [
        { id: 'mcp-a', serverName: 'github' },
        { id: 'mcp-b', serverName: 'codegraph' },
      ],
      [],
      external,
    )
    expect(message).toContain('codegraph')
    expect(message).not.toContain('github')
  })
})
