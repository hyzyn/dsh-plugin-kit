/**
 * @hyzyn/dsh-tty — 保存隧道时的端口探测（tty D60 前半）。
 *
 * 立项原文（`ROADMAP.md § 待办`）：*「复制 profile 时自动错开/停用隧道端口（或只提示）；
 * 保存隧道时探测端口占用」*。这条只做**后半**（另半要动 Profile 管理，是 L0）。
 *
 * 用户现场的形状：同一台机器上两个 profile 各跑一份宿主，配置被复制时 `localPort`
 * 一起拷走，于是第二条隧道起来就 `EADDRINUSE`——而那时用户已经在等「保存成功」，
 * 端口冲突是个**稍后才会出现的红色 error**。这一轮把它提前到保存那一拍。
 *
 * 判据分两层：
 *   1. **纯函数**（`findDuplicateLocalPorts`）：配置内部两条 local 隧道撞同一个
 *      `localPort` —— 配置层就能判死，不必探端口；
 *   2. **异步探针**（`probeTunnelPorts`）：端口被本进程之外的东西占着 —— 真实
 *      `net` 服务器占位，不用 mock（这层的价值全在真 listen 语义上）。
 */
import net from 'node:net'
import { describe, expect, it } from 'vitest'
import { findDuplicateLocalPorts, probeLocalPort, probeTunnelPorts, tunnelPortIssueMessage } from '../src/tunnels.js'
import type { TunnelSpec } from '../src/tunnels.js'

/** 造一条 local 隧道（只填与判据有关的字段）。 */
function local(name: string, localPort: number, enabled = true): TunnelSpec {
  return { name, bookName: 'book', direction: 'local', localPort, remoteHost: 'db', remotePort: 5432, enabled }
}

/** 真的占住一个随机空闲端口，返回端口号与释放函数。 */
function occupy(): Promise<{ port: number; release: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as net.AddressInfo).port
      resolve({
        port,
        release: () => new Promise((done) => { server.close(() => { done() }) }),
      })
    })
  })
}

describe('findDuplicateLocalPorts：配置内部的端口撞车（纯函数，不探端口）', () => {
  it('两条 local 隧道用同一个端口 → 点名两条、判 duplicate', () => {
    const issues = findDuplicateLocalPorts([local('a', 15432), local('b', 15432)])
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ kind: 'duplicate', port: 15432, names: ['a', 'b'] })
    // 文案必须点出**两条**名字与端口：只说「端口被占」用户得自己去列表里找
    expect(issues[0]?.message).toContain('a')
    expect(issues[0]?.message).toContain('b')
    expect(issues[0]?.message).toContain('15432')
  })

  it('**停用的那条也算**：它随时会被启用，留着就是一颗定时炸弹（与「本进程已占用」的豁免口径刻意不同）', () => {
    const issues = findDuplicateLocalPorts([local('a', 15432, false), local('b', 15432, true)])
    expect(issues).toHaveLength(1)
    expect(issues[0]?.kind).toBe('duplicate')
  })

  it('remote 方向的 remotePort 不在本机监听：撞了也不算本机冲突', () => {
    const remote: TunnelSpec = { name: 'r1', bookName: 'book', direction: 'remote', remotePort: 8080, localTargetPort: 3000, enabled: true }
    const remote2: TunnelSpec = { ...remote, name: 'r2' }
    expect(findDuplicateLocalPorts([remote, remote2])).toEqual([])
  })

  it('端口缺省 / 非法（0 / NaN / 越界）一律跳过：合法性由 validateTunnels 管，这里不重复报', () => {
    const broken: TunnelSpec[] = [
      { name: 'a', bookName: 'b', direction: 'local', localPort: 0, remoteHost: 'h', remotePort: 1, enabled: true },
      { name: 'b', bookName: 'b', direction: 'local', localPort: Number.NaN, remoteHost: 'h', remotePort: 1, enabled: true },
      { name: 'c', bookName: 'b', direction: 'local', remoteHost: 'h', remotePort: 1, enabled: true },
    ]
    expect(findDuplicateLocalPorts(broken)).toEqual([])
  })

  it('多个端口各撞各的：按端口升序、每端口一条（渲染顺序稳定）', () => {
    const issues = findDuplicateLocalPorts([local('a', 2222), local('b', 1111), local('c', 2222), local('d', 1111)])
    expect(issues.map((i) => i.port)).toEqual([1111, 2222])
    expect(issues[0]?.names).toEqual(['b', 'd'])
  })

  it('同名条目只算一次（同一条被重复塞进数组时不渲染成「自己和自己撞」）', () => {
    expect(findDuplicateLocalPorts([local('a', 1234), local('a', 1234)])).toEqual([])
  })
})

describe('probeLocalPort：真实 listen 语义（不 mock）', () => {
  it('空着的端口 → true（探完就释放，不能被探测本身占住）', async () => {
    const { port, release } = await occupy()
    await release()
    expect(await probeLocalPort(port)).toBe(true)
    // 再探一次仍要是 true：证明上一次探测真的释放了（否则第二次会 false）
    expect(await probeLocalPort(port)).toBe(true)
  })

  it('被占的端口 → false', async () => {
    const held = await occupy()
    try {
      expect(await probeLocalPort(held.port)).toBe(false)
    } finally {
      await held.release()
    }
  })
})

describe('probeTunnelPorts：保存前的汇总（duplicate 优先 + in-use 探针 + 豁免自己）', () => {
  it('空配置 / 没有 local 隧道 → 一条警告都没有', async () => {
    expect(await probeTunnelPorts([])).toEqual([])
    expect(await probeTunnelPorts([{ name: 'r', bookName: 'b', direction: 'remote', remotePort: 1, localTargetPort: 2, enabled: true }])).toEqual([])
  })

  it('duplicate 与 in-use 同时存在时两条都报，且 duplicate 不被端口探测重复算一遍', async () => {
    const held = await occupy()
    try {
      const warnings = await probeTunnelPorts([local('a', 15432), local('b', 15432), local('c', held.port)])
      expect(warnings).toHaveLength(2)
      expect(warnings[0]).toContain('a')
      expect(warnings[1]).toContain('c')
      expect(warnings[1]).toContain(String(held.port))
    } finally {
      await held.release()
    }
  })

  it('端口空着时不报 in-use（只报真的被占的那条）', async () => {
    const held = await occupy()
    const free = await occupy()
    const freePort = free.port
    await free.release()
    try {
      const warnings = await probeTunnelPorts([local('busy', held.port), local('idle', freePort)])
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain('busy')
    } finally {
      await held.release()
    }
  })

  /*
   * 这一条是本模块**最容易写错**的地方（第一版就错了）：编辑一条正在跑的隧道（只换
   * remoteHost）时，端口当然被**自己**占着——那不是冲突。没有这层豁免，每次编辑都
   * 得到一条假警告，警告立刻退化成没人看的东西。
   */
  it('本进程已持有的端口被豁免：编辑在跑的隧道不会得到假警告', async () => {
    const held = await occupy()
    try {
      const specs = [local('running', held.port)]
      expect(await probeTunnelPorts(specs, undefined, new Set([held.port]))).toEqual([])
      // 反向：不传豁免集时同一条必须报——否则上面那条断言可能是「探针根本没跑」
      const reported = await probeTunnelPorts(specs)
      expect(reported).toHaveLength(1)
      expect(reported[0]).toContain(String(held.port))
    } finally {
      await held.release()
    }
  })

  it('豁免只作用于该端口：别的端口该报还得报', async () => {
    const held = await occupy()
    try {
      const warnings = await probeTunnelPorts([local('mine', 1), local('other', held.port)], undefined, new Set([1]))
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain('other')
    } finally {
      await held.release()
    }
  })

  it('探针抛错不该把保存打挂——按「没探到」处理（提示性的东西不能反过来打死主流程）', async () => {
    const warnings = await probeTunnelPorts([local('a', 15432)], async () => { throw new Error('boom') })
    expect(warnings).toEqual([])
  })

  it('探针可注入（路由 / 夹具用假探针）：说忙就报，说空就不报', async () => {
    const busy = await probeTunnelPorts([local('a', 15432)], async () => false)
    expect(busy).toHaveLength(1)
    expect(busy[0]).toContain('a')
    expect(await probeTunnelPorts([local('a', 15432)], async () => true)).toEqual([])
  })
})

describe('tunnelPortIssueMessage：两种 kind 的文案各说清出路', () => {
  it('duplicate 点名两条并给出改法；in-use 说清「机器级资源」并给出两条出路', () => {
    const dup = tunnelPortIssueMessage('duplicate', ['a', 'b'], 15432)
    expect(dup).toContain('localPort')
    const used = tunnelPortIssueMessage('in-use', ['a'], 15432)
    expect(used).toContain('另一个 DSH profile')
    expect(used).toContain('localPort')
  })
})
