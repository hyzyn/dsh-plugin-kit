/**
 * @hyzyn/dsh-tty — ~/.ssh/config 迷你解析器的回归测试。
 *
 * 解析器是「宽容优先」的导入候选提取器，这里的断言固定它的实际取舍：
 * 键大小写不敏感、`key=value` 与 `key = value` 都收、Host 通配/否定整块跳过、
 * 首个同名选项生效、无 User 的块跳过、端口非法回退 22、最多 100 条。
 */
import { describe, expect, it } from 'vitest'
import { MAX_PROXY_NAMES, parseSshConfig, parseSshConfigDetailed } from '../src/ssh-config.js'

describe('parseSshConfig', () => {
  it('解析典型块：HostName / User / Port / IdentityFile（引号剥除）', () => {
    const entries = parseSshConfig(`
# 生产机
Host prod
  HostName 10.0.0.1
  User deploy
  Port 2222
  IdentityFile "~/.ssh/id_ed25519"
`)
    expect(entries).toEqual([
      {
        name: 'prod',
        host: '10.0.0.1',
        port: 2222,
        username: 'deploy',
        auth: 'key',
        keyPath: '~/.ssh/id_ed25519',
        passphrase: '',
        password: '',
        agentForward: false,
      },
    ])
  })

  it('无 User 的块无法构成连接簿条目，整块跳过', () => {
    expect(parseSshConfig('Host a\n  HostName a.local\n')).toEqual([])
    expect(parseSshConfig('Host a\n  User    \n')).toEqual([])
  })

  it('Host 通配 / 否定 / 空模式整块跳过', () => {
    const text = ['Host *.example.com', '  User wildcard', 'Host web-?', '  User q', 'Host !bad', '  User neg', 'Host ok', '  User good'].join('\n')
    expect(parseSshConfig(text).map((entry) => entry.name)).toEqual(['ok'])
  })

  it('Host 多模式全具体时有效，名字取第一个模式', () => {
    const entries = parseSshConfig('Host prod backup\n  User deploy\n')
    expect(entries).toHaveLength(1)
    expect(entries[0].name).toBe('prod')
    expect(entries[0].host).toBe('prod') // 无 HostName 时回退块名
  })

  it('键名大小写不敏感，key=value / key = value / 缩进都收', () => {
    const entries = parseSshConfig(
      ['host lower', '  hostname=lower.local', '  USER = Deploy User', '    port = 2200', '  identityfile= /keys/id'].join('\n'),
    )
    expect(entries).toEqual([
      {
        name: 'lower',
        host: 'lower.local',
        port: 2200,
        username: 'Deploy User',
        auth: 'key',
        keyPath: '/keys/id',
        passphrase: '',
        password: '',
        agentForward: false,
      },
    ])
  })

  it('端口非法（越界 / 非整数 / 非数字）回退 22，合法值保留', () => {
    const cases: Array<[string, number]> = [
      ['0', 22],
      ['65536', 22],
      ['70000', 22],
      ['22.5', 22],
      ['abc', 22],
      ['', 22],
      ['1', 1],
      ['65535', 65535],
    ]
    for (const [raw, expected] of cases) {
      const entries = parseSshConfig(`Host h\n  User u\n  Port ${raw}\n`)
      expect(entries[0].port, `Port ${raw}`).toBe(expected)
    }
  })

  it('IdentityFile 缺失或空值 → auth=agent；同名选项首个生效', () => {
    const noKey = parseSshConfig('Host h\n  User u\n')
    expect(noKey[0].auth).toBe('agent')
    expect(noKey[0].keyPath).toBe('')
    const emptyKey = parseSshConfig('Host h\n  User u\n  IdentityFile   \n')
    expect(emptyKey[0].auth).toBe('agent')
    const firstWins = parseSshConfig('Host h\n  User u\n  Port 2200\n  Port 3300\n  IdentityFile /a\n  IdentityFile /b\n')
    expect(firstWins[0].port).toBe(2200)
    expect(firstWins[0].keyPath).toBe('/a')
  })

  it('HostKeyAlias 照原样导入（0.25.0）；大小写 / 空白 / 缺省都处理对', () => {
    const entries = parseSshConfig('Host h\n  HostName 10.0.0.5\n  User u\n  HostKeyAlias bastion-box\n')
    expect(entries[0].hostKeyAlias).toBe('bastion-box')
    // 键大小写不敏感、值两侧空白剥掉（从 ssh_config 抄过来常带空格）
    const lower = parseSshConfig('Host h\n  User u\n  hostkeyalias =  bastion-box  \n')
    expect(lower[0].hostKeyAlias).toBe('bastion-box')
    // 缺省 / 空值 → 不产出该字段（缺省即「按 host 定位」，与从前逐字一致）
    expect(parseSshConfig('Host h\n  User u\n')[0].hostKeyAlias).toBeUndefined()
    expect(parseSshConfig('Host h\n  User u\n  HostKeyAlias   \n')[0].hostKeyAlias).toBeUndefined()
  })

  it('整行注释与行内「 #」注释截断都生效', () => {    const entries = parseSshConfig(['# 整行注释', 'Host h', '  User u # 行内注释', '  HostName h.local # x'].join('\n'))
    expect(entries[0].username).toBe('u')
    expect(entries[0].host).toBe('h.local')
  })

  it('Include 不展开（跳过），Host 之前出现的选项丢弃', () => {
    const text = ['Include ~/.ssh/other', 'User orphan', 'Host h', '  User u'].join('\n')
    const entries = parseSshConfig(text)
    expect(entries).toHaveLength(1)
    expect(entries[0].username).toBe('u')
  })

  it('「Host = name」的孤立等号被宽容丢弃', () => {
    const entries = parseSshConfig('Host = weird\n  User u\n')
    expect(entries[0].name).toBe('weird')
    expect(entries[0].host).toBe('weird')
  })

  it('空文本 / 无有效行返回空数组', () => {
    expect(parseSshConfig('')).toEqual([])
    expect(parseSshConfig('\n\n# only comments\n')).toEqual([])
  })

  it('最多产出 100 条，超出丢弃', () => {
    const blocks = Array.from({ length: 120 }, (_, index) => `Host h${index}\n  User u${index}`)
    const entries = parseSshConfig(blocks.join('\n'))
    expect(entries).toHaveLength(100)
    expect(entries[0].name).toBe('h0')
    expect(entries[99].name).toBe('h99')
  })
})

/**
 * 项目级 ROADMAP 第 2 项的「短期至少做到」：**依赖跳板机的块跳过并明说**。
 * 此前 ProxyJump 被静默忽略——导入后得到一条直连条目，连不上时只有 20s 后一句通用超时，
 * 用户得自己反推是堡垒机的问题。
 */
describe('parseSshConfigDetailed：每一种丢弃都要有信号', () => {
  it('ProxyJump 解析成 jump 一起导入；ProxyCommand 仍跳过并点名', () => {
    const text = [
      'Host direct',
      '  User u',
      'Host via-jump',
      '  HostName 10.1.0.9',
      '  User deploy',
      '  ProxyJump bastion',
      'Host via-cmd',
      '  User deploy',
      '  ProxyCommand ssh -W %h:%p bastion',
    ].join('\n')
    const result = parseSshConfigDetailed(text)
    expect(result.entries.map((entry) => entry.name)).toEqual(['direct', 'via-jump'])
    // `bastion` 在这份 config 里不是别名 → 当主机名用（与 OpenSSH 一致：它就是一台可解析的主机）
    expect(result.entries[1].jump).toEqual({ host: 'bastion', port: 22 })
    expect(result.jumpImported).toBe(1)
    // ProxyCommand 是另一档（信任级不同）：仍整块跳过，且**单独报数**，不与「解析不出」混在一起
    expect(result.proxyCommand).toEqual(['via-cmd'])
    expect(result.proxyCommandCount).toBe(1)
    expect(result.proxy).toEqual([])
    expect(result.proxyCount).toBe(0)
    expect(result.skippedOther).toBe(0)
    expect(result.droppedOverflow).toBe(0)
  })

  it('ProxyJump 支持 user@host:port 与 IPv6 写法；也支持引用同一份 config 里的别名', () => {
    const text = [
      'Host alias-bastion',
      '  HostName bastion.internal',
      '  User jumpuser',
      '  Port 2222',
      'Host a',
      '  User u',
      '  ProxyJump jumpuser@10.0.0.5:2200',
      'Host b',
      '  User u',
      '  ProxyJump alias-bastion',
      'Host c',
      '  User u',
      '  ProxyJump [::1]:2223',
    ].join('\n')
    const result = parseSshConfigDetailed(text)
    // 跳板机那个块本身也是一条可直连的条目（它是个具体 Host），所以它在候选里——这是对的
    expect(result.entries.map((entry) => entry.name)).toEqual(['alias-bastion', 'a', 'b', 'c'])
    expect(result.entries[0].jump).toBeUndefined()
    expect(result.entries[1].jump).toEqual({ host: '10.0.0.5', port: 2200, username: 'jumpuser' })
    // 别名：拿它自己的 HostName / User / Port
    expect(result.entries[2].jump).toEqual({ host: 'bastion.internal', port: 2222, username: 'jumpuser' })
    expect(result.entries[3].jump).toEqual({ host: '::1', port: 2223 })
    expect(result.jumpImported).toBe(3)
  })

  it('别名块自己也依赖跳板机 → 不支持嵌套（单跳），整块跳过并报数', () => {
    const text = [
      'Host nested-bastion',
      '  HostName inner',
      '  User u',
      '  ProxyJump outer',
      'Host target',
      '  User u',
      '  ProxyJump nested-bastion',
    ].join('\n')
    const result = parseSshConfigDetailed(text)
    // nested-bastion 自己被 ProxyJump 了 → 它作为「跳板机」不可用；target 因此也导入不了
    expect(result.entries.map((entry) => entry.name)).toEqual(['nested-bastion'])
    expect(result.entries[0].jump).toEqual({ host: 'outer', port: 22 })
    expect(result.proxy).toEqual(['target'])
    expect(result.proxyCount).toBe(1)
  })

  it('ProxyJump none / ProxyCommand none 是显式的直连，照常导入', () => {
    const text = ['Host direct', '  User u', '  ProxyJump none', 'Host direct2', '  User u', '  ProxyCommand none'].join('\n')
    const result = parseSshConfigDetailed(text)
    expect(result.entries.map((entry) => entry.name)).toEqual(['direct', 'direct2'])
    expect(result.proxyCount).toBe(0)
  })

  it('键名大小写不敏感（PROXYJUMP 照解析 / proxycommand 照跳过）', () => {
    const text = ['Host a', '  User u', '  PROXYJUMP bastion', 'Host b', '  User u', '  proxycommand ssh -W %h:%p j'].join('\n')
    const result = parseSshConfigDetailed(text)
    expect(result.entries.map((entry) => entry.name)).toEqual(['a'])
    expect(result.entries[0].jump?.host).toBe('bastion')
    expect(result.proxyCommandCount).toBe(1)
    expect(result.jumpImported).toBe(1)
  })

  it('通配 / 无 User 的块只计数（名字对用户没有意义），不与跳板机混为一谈', () => {
    const text = ['Host *.corp', '  User u', 'Host wild-?', '  User u', 'Host no-user', '  HostName x', 'Host ok', '  User u'].join('\n')
    const result = parseSshConfigDetailed(text)
    expect(result.entries.map((entry) => entry.name)).toEqual(['ok'])
    expect(result.skippedOther).toBe(3)
    expect(result.proxy).toEqual([])
  })

  it('超过 100 条的部分报数（旧实现是静默丢弃——本仓「截断要有信号」那条硬规矩）', () => {
    const blocks = Array.from({ length: 105 }, (_, index) => `Host h${index}\n  User u${index}`)
    const result = parseSshConfigDetailed(blocks.join('\n'))
    expect(result.entries).toHaveLength(100)
    expect(result.droppedOverflow).toBe(5)
  })

  it('proxyCommand 名单有上限，但计数仍然是准的（不许因为截断就把数报小）', () => {
    const blocks = Array.from({ length: MAX_PROXY_NAMES + 7 }, (_, index) => `Host p${index}\n  User u\n  ProxyCommand ssh -W %h:%p bastion`)
    const result = parseSshConfigDetailed(blocks.join('\n'))
    expect(result.proxyCommand).toHaveLength(MAX_PROXY_NAMES)
    expect(result.proxyCommandCount).toBe(MAX_PROXY_NAMES + 7)
  })

  it('干净的配置：没有丢弃、没有跳过、没有跳板机', () => {
    const result = parseSshConfigDetailed('Host a\n  HostName a.local\n  User u\n')
    expect(result).toEqual({
      entries: [expect.objectContaining({ name: 'a', host: 'a.local' })],
      proxy: [],
      proxyCount: 0,
      proxyCommand: [],
      proxyCommandCount: 0,
      jumpImported: 0,
      skippedOther: 0,
      droppedOverflow: 0,
    })
  })
})
