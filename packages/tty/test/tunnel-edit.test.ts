/**
 * @hyzyn/dsh-tty — 端口转发「新增 / 编辑」纯逻辑的单元测试。
 *
 * 为什么有这份测试：这段判断（名字派生、必填校验、撞名、按原始名定位）此前只在
 * 组件闭包里、**没有单测**，于是长期存在两个问题——① 只能"删掉重建"来改一条隧道
 * （改端口 = 换名字）；② 撞名时静默加 `-2` 后缀，凭空多出一条同名不同尾的隧道。
 * 现在规则收在 `client-src/tunnel-edit.js`，这里把边界钉死。
 */
import { describe, expect, it } from 'vitest'
import {
  applyTunnelEdit,
  buildTunnelFromDraft,
  deriveTunnelName,
  parsePort,
  tunnelEditClash,
  tunnelNameClash,
} from '../client-src/tunnel-edit.js'

const draftOf = (over = {}) => ({
  direction: 'local',
  bookName: 'lab-a',
  localPort: '5432',
  remoteHost: 'db.internal',
  remotePort: '5432',
  localTargetPort: '',
  ...over,
})

describe('parsePort', () => {
  it('合法端口（1~65535）转数字；越界 / 非整数 / 空 → 0', () => {
    expect(parsePort('5432')).toBe(5432)
    expect(parsePort(22)).toBe(22)
    expect(parsePort(' 8080 ')).toBe(8080)
    expect(parsePort('65535')).toBe(65535)
    expect(parsePort('0')).toBe(0)
    expect(parsePort('65536')).toBe(0)
    expect(parsePort('')).toBe(0)
    expect(parsePort('abc')).toBe(0)
    expect(parsePort('80.5')).toBe(0)
    expect(parsePort(undefined)).toBe(0)
  })
})

describe('deriveTunnelName', () => {
  it('本地转发 -L<本地端口>；远程转发 -R<远程端口>', () => {
    expect(deriveTunnelName('lab-a', 'local', 5432)).toBe('lab-a-L5432')
    expect(deriveTunnelName('lab-a', 'remote', 8080)).toBe('lab-a-R8080')
  })
})

describe('buildTunnelFromDraft', () => {
  it('本地转发送：名字随「条目 + 端口」派生', () => {
    const r = buildTunnelFromDraft(draftOf())
    expect(r.ok).toBe(true)
    expect(r.tunnel).toMatchObject({
      name: 'lab-a-L5432',
      bookName: 'lab-a',
      direction: 'local',
      localPort: 5432,
      remoteHost: 'db.internal',
      remotePort: 5432,
      enabled: true,
    })
  })

  it('远程转发送：只认 remotePort / localTargetPort，名字用 -R', () => {
    const r = buildTunnelFromDraft(draftOf({ direction: 'remote', remotePort: '8080', localTargetPort: '3000' }))
    expect(r.ok).toBe(true)
    expect(r.tunnel).toMatchObject({ name: 'lab-a-R8080', direction: 'remote', remotePort: 8080, localTargetPort: 3000 })
  })

  it('缺必填 → 报错而不是拼出一条残规格', () => {
    expect(buildTunnelFromDraft(draftOf({ localPort: '' })).ok).toBe(false)
    expect(buildTunnelFromDraft(draftOf({ remoteHost: '  ' })).ok).toBe(false)
    expect(buildTunnelFromDraft(draftOf({ remotePort: '99999' })).ok).toBe(false)
    expect(buildTunnelFromDraft(draftOf({ direction: 'remote', localTargetPort: '' })).ok).toBe(false)
  })

  it('连接簿为空 → 明确提示（不是拼出一条 bookName="" 的隧道）', () => {
    const r = buildTunnelFromDraft(draftOf({ bookName: '' }), [])
    expect(r.ok).toBe(false)
    expect(r.error).toContain('连接簿')
  })

  it('draft 没选条目但有候选 → 回落第一个（与旧行为一致）', () => {
    const r = buildTunnelFromDraft(draftOf({ bookName: '' }), ['first', 'second'])
    expect(r.ok).toBe(true)
    expect(r.tunnel.bookName).toBe('first')
  })
})

describe('撞名检测', () => {
  const list = [
    { name: 'lab-a-L5432', bookName: 'lab-a', enabled: true },
    { name: 'lab-b-L6379', bookName: 'lab-b', enabled: false },
  ]

  it('新增：同名已存在 → 能查到那条（调用方据此报错，而不是静默加后缀）', () => {
    expect(tunnelNameClash(list, 'lab-a-L5432')?.name).toBe('lab-a-L5432')
    expect(tunnelNameClash(list, 'lab-a-L5433')).toBeUndefined()
  })

  it('编辑：改端口后新名字撞到**别人**才算冲突（撞自己不算）', () => {
    // 把 lab-a-L5432 改成 6379 → 名字变成 lab-a-L6379，与别人（lab-b-L6379）不同名，不冲突
    expect(tunnelEditClash(list, 'lab-a-L5432', 'lab-a-L6379')).toBeUndefined()
    // 两个条目同名（异常数据）时才算冲突
    expect(tunnelEditClash([...list, { name: 'dup', bookName: 'x' }], 'lab-a-L5432', 'dup')?.name).toBe('dup')
    // 新名字等于自己的原名：不算冲突
    expect(tunnelEditClash(list, 'lab-a-L5432', 'lab-a-L5432')).toBeUndefined()
  })
})

describe('applyTunnelEdit', () => {
  const list = [
    { name: 'lab-a-L5432', bookName: 'lab-a', direction: 'local', localPort: 5432, remoteHost: 'db', remotePort: 5432, enabled: false },
    { name: 'lab-b-L6379', bookName: 'lab-b', direction: 'local', localPort: 6379, remoteHost: 'redis', remotePort: 6379, enabled: true },
  ]

  it('改端口：按**原始名字**定位替换，名字跟着换（这就是编辑功能的意义）', () => {
    const next = { name: 'lab-a-L5433', bookName: 'lab-a', direction: 'local', localPort: 5433, remoteHost: 'db', remotePort: 5432, enabled: true }
    const r = applyTunnelEdit(list, 'lab-a-L5432', next)
    expect(r.ok).toBe(true)
    expect(r.tunnels).toHaveLength(2)
    expect(r.tunnels[0].name).toBe('lab-a-L5433') // 旧名已被替换掉
    expect(r.tunnels[1].name).toBe('lab-b-L6379') // 别人不动
  })

  it('编辑**不改变启用状态**：停用的隧道不会因为改规格而被顺手启用', () => {
    const next = { name: 'lab-a-L5433', bookName: 'lab-a', direction: 'local', localPort: 5433, remoteHost: 'db', remotePort: 5432, enabled: true }
    const r = applyTunnelEdit(list, 'lab-a-L5432', next)
    expect(r.ok).toBe(true)
    expect(r.tunnels[0].enabled).toBe(false) // 原值是 false，必须保持
  })

  it('条目已被别处删除 → 返回错误（调用方退出编辑态，而不是改错东西）', () => {
    const r = applyTunnelEdit(list, 'ghost-L1', { name: 'ghost-L2' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('已不存在')
  })

  it('新名字撞别人 → 返回错误，列表原样不动', () => {
    const r = applyTunnelEdit(list, 'lab-a-L5432', { name: 'lab-b-L6379', bookName: 'lab-a' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('已存在同名隧道')
  })

  it('只改 remoteHost（名字不变）也能保存', () => {
    const next = { name: 'lab-a-L5432', bookName: 'lab-a', direction: 'local', localPort: 5432, remoteHost: 'db2', remotePort: 5432, enabled: true }
    const r = applyTunnelEdit(list, 'lab-a-L5432', next)
    expect(r.ok).toBe(true)
    expect(r.tunnels[0].remoteHost).toBe('db2')
  })
})
