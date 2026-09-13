/**
 * @hyzyn/dsh-tty — ~/.ssh/config 迷你解析器的回归测试。
 *
 * 解析器是「宽容优先」的导入候选提取器，这里的断言固定它的实际取舍：
 * 键大小写不敏感、`key=value` 与 `key = value` 都收、Host 通配/否定整块跳过、
 * 首个同名选项生效、无 User 的块跳过、端口非法回退 22、最多 100 条。
 */
import { describe, expect, it } from 'vitest'
import { parseSshConfig } from '../src/ssh-config.js'

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

  it('整行注释与行内「 #」注释截断都生效', () => {
    const entries = parseSshConfig(['# 整行注释', 'Host h', '  User u # 行内注释', '  HostName h.local # x'].join('\n'))
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
