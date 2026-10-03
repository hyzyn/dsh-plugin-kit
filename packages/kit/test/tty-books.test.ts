/**
 * `@hyzyn/dsh-kit` — 连接簿 / 指纹读取的回归（`src/tty-books.ts`）。
 *
 * ## 为什么这些用例在 kit 而不是消费者那边
 *
 * 2026-10-02 这一跳（tty 的连接簿 → SSH 连接规格）上收进 kit，判据见
 * [docs/devdata-plan.md § 16.1](../../../docs/devdata-plan.md) 的 B1：它有两个（将来三个）
 * 消费者，而**两边必须逐字一致**——漏带 `jump` / `proxyCommand` 就是「终端连得上、面板连不上」
 * 那种半吊子状态。
 *
 * 同一层还有另一个角度的用例：`ssh-proxy-command.test.ts`（**2026-10-02 也随实现搬进了本包**，
 * 原在 `packages/docker/test/`）验的是「跳板机与代理命令这两样东西能原样穿过这一跳」。两边不重复：
 * 那边钉**带过去什么**，这里钉**读不到/读错时各档的失败方向**。
 *
 * ## 判据都不许「匹配不到就算过」
 *
 * 每个 `undefined` / `false` 的分支都要有一条用例点名（settings 缺失、`get` 抛错、
 * 该字段不是对象、字段类型不对），因为**失败方向安全**这件事只有逐条钉住才成立：
 * 这一层的输出直接决定「连不连、连哪里」。
 */
import { describe, expect, it } from 'vitest'
import {
  readTtyBooks,
  readTtyHostKeys,
  readTtyProxyCommandAllowed,
  sanitizeHostKeys,
  type SettingsLookup,
} from '../src/index.js'

/** 一份只读 settings 句柄：`get('tty')` 返回喂进去的东西。 */
function lookup(entry: unknown): SettingsLookup {
  return { get: (ns) => (ns === 'tty' ? entry : undefined) }
}

/* ------------------------------------------------------------------ *
 * readTtyBooks
 * ------------------------------------------------------------------ */

describe('readTtyBooks：连接簿条目 → SSH 连接规格', () => {
  it('基本映射：字段缺省按安全值补（port 22 / auth agent / 空凭据）', () => {
    const books = readTtyBooks(lookup({ sshHosts: [{ name: 'nas', host: '10.0.0.9', username: 'root' }] }))
    expect([...books.keys()]).toEqual(['nas'])
    expect(books.get('nas')).toEqual({
      host: '10.0.0.9',
      port: 22,
      username: 'root',
      auth: 'agent',
      keyPath: '',
      password: '',
      passphrase: '',
      agentForward: false,
    })
  })

  it('跳板机与代理命令都跟着进规格（漏一个就是「tty 能连、面板连不上」）', () => {
    const books = readTtyBooks(lookup({
      sshHosts: [{
        name: 'via-bastion',
        host: '10.3.0.9',
        username: 'deploy',
        jump: { host: 'bastion.corp', port: 2222, username: 'jumper' },
        proxyCommand: '  ssh -W %h:%p bastion.corp  ',
      }],
    }))
    expect(books.get('via-bastion')?.jump).toEqual({ host: 'bastion.corp', port: 2222, username: 'jumper' })
    expect(books.get('via-bastion')?.proxyCommand).toBe('ssh -W %h:%p bastion.corp')
  })

  it('缺 name / host / username 任一项的条目**跳过**：留着只会在下游报一个指不到配置的错', () => {
    const books = readTtyBooks(lookup({
      sshHosts: [
        { name: '', host: 'h', username: 'u' },
        { name: 'a', host: '   ', username: 'u' },
        { name: 'b', host: 'h', username: '' },
        { name: 'ok', host: 'h', username: 'u' },
      ],
    }))
    expect([...books.keys()]).toEqual(['ok'])
  })

  it('形状非法的代理命令（多行）当没配：不给下游一条注定跑错的命令', () => {
    const books = readTtyBooks(lookup({ sshHosts: [{ name: 'x', host: 'h', username: 'u', proxyCommand: 'nc b 22\nrm -rf /' }] }))
    expect(books.get('x')?.proxyCommand).toBeUndefined()
  })

  it('跳板机缺 host 当没配（不给下游留一个 host: "" 的半个对象）', () => {
    const books = readTtyBooks(lookup({ sshHosts: [{ name: 'x', host: 'h', username: 'u', jump: { port: 22 } }] }))
    expect(books.get('x')?.jump).toBeUndefined()
  })

  it('auth 只认 key / password；其它值（含拼错的）落回 agent', () => {
    const books = readTtyBooks(lookup({
      sshHosts: [
        { name: 'a', host: 'h', username: 'u', auth: 'key' },
        { name: 'b', host: 'h', username: 'u', auth: 'password' },
        { name: 'c', host: 'h', username: 'u', auth: 'Key' },
        { name: 'd', host: 'h', username: 'u', auth: 'agent' },
      ],
    }))
    expect(books.get('a')?.auth).toBe('key')
    expect(books.get('b')?.auth).toBe('password')
    expect(books.get('c')?.auth).toBe('agent')
    expect(books.get('d')?.auth).toBe('agent')
  })

  it('port 只认整数；非整数落回 22（`port: 22.5` 这种不能让下游拿 NaN 去连）', () => {
    const books = readTtyBooks(lookup({
      sshHosts: [
        { name: 'a', host: 'h', username: 'u', port: 2222 },
        { name: 'b', host: 'h', username: 'u', port: 22.5 },
        { name: 'c', host: 'h', username: 'u', port: '22' },
      ],
    }))
    expect(books.get('a')?.port).toBe(2222)
    expect(books.get('b')?.port).toBe(22)
    expect(books.get('c')?.port).toBe(22)
  })

  it('agentForward 只认 `=== true`（"true" 不算：它是连接参数，不是"大概想开"）', () => {
    const books = readTtyBooks(lookup({
      sshHosts: [
        { name: 'a', host: 'h', username: 'u', agentForward: true },
        { name: 'b', host: 'h', username: 'u', agentForward: 'true' },
      ],
    }))
    expect(books.get('a')?.agentForward).toBe(true)
    expect(books.get('b')?.agentForward).toBe(false)
  })

  it('「没有连接簿」的四种形态都给空表（句柄缺失 / get 抛错 / 不是对象 / sshHosts 不是数组）', () => {
    expect(readTtyBooks(undefined).size).toBe(0)
    expect(readTtyBooks({ get: () => { throw new Error('settings 还没就绪') } }).size).toBe(0)
    expect(readTtyBooks(lookup(null)).size).toBe(0)
    expect(readTtyBooks(lookup('tty')).size).toBe(0)
    expect(readTtyBooks(lookup({ sshHosts: 'nope' })).size).toBe(0)
    expect(readTtyBooks(lookup({})).size).toBe(0)
  })

  it('条目本身不是对象时跳过（数组里混进 null / 字符串不能让整表崩掉）', () => {
    const books = readTtyBooks(lookup({ sshHosts: [null, 'x', 42, { name: 'ok', host: 'h', username: 'u' }] }))
    expect([...books.keys()]).toEqual(['ok'])
  })

  it('读的是 tty 这个 entry，别的 ns 不看', () => {
    let asked: string[] = []
    const settings: SettingsLookup = { get: (ns) => { asked = [...asked, ns]; return undefined } }
    readTtyBooks(settings)
    expect(asked).toEqual(['tty'])
  })
})

/* ------------------------------------------------------------------ *
 * readTtyProxyCommandAllowed
 * ------------------------------------------------------------------ */

describe('readTtyProxyCommandAllowed：闸门默认关', () => {
  it('只认布尔 true', () => {
    expect(readTtyProxyCommandAllowed(lookup({ allowProxyCommand: true }))).toBe(true)
    expect(readTtyProxyCommandAllowed(lookup({ allowProxyCommand: 'true' }))).toBe(false)
    expect(readTtyProxyCommandAllowed(lookup({ allowProxyCommand: 1 }))).toBe(false)
    expect(readTtyProxyCommandAllowed(lookup({}))).toBe(false)
  })

  it('句柄缺失 / get 抛错 / entry 不是对象 → 一律**关**（失败方向安全）', () => {
    expect(readTtyProxyCommandAllowed(undefined)).toBe(false)
    expect(readTtyProxyCommandAllowed({ get: () => { throw new Error('没就绪') } })).toBe(false)
    expect(readTtyProxyCommandAllowed(lookup(null))).toBe(false)
  })
})

/* ------------------------------------------------------------------ *
 * readTtyHostKeys / sanitizeHostKeys
 * ------------------------------------------------------------------ */

describe('readTtyHostKeys：把 tty 已确认的指纹当种子', () => {
  it('读到 tty 的 hostKeys（host 小写化、同 host:port 合并指纹）', () => {
    const keys = readTtyHostKeys(lookup({
      hostKeys: [
        { host: 'Nas.Example', port: 22, fingerprints: ['sha256:rsa'] },
        { host: 'nas.example', port: 22, fingerprints: ['sha256:ed'] },
      ],
    }))
    expect(keys).toEqual([{ host: 'nas.example', port: 22, fingerprints: ['sha256:rsa', 'sha256:ed'] }])
  })

  it('没有任何 hostKeys → 空数组（不是"读失败"，读失败也是空数组：这一层不区分两者）', () => {
    expect(readTtyHostKeys(undefined)).toEqual([])
    expect(readTtyHostKeys({ get: () => { throw new Error('没就绪') } })).toEqual([])
    expect(readTtyHostKeys(lookup({}))).toEqual([])
    expect(readTtyHostKeys(lookup({ hostKeys: 'nope' }))).toEqual([])
  })
})

describe('sanitizeHostKeys：两种落盘形状都收，非法项丢掉', () => {
  it('非数组 → undefined（"没这一项"），区别于空数组（"有一项但是空的"）', () => {
    expect(sanitizeHostKeys(undefined)).toBeUndefined()
    expect(sanitizeHostKeys('x')).toBeUndefined()
    expect(sanitizeHostKeys({})).toBeUndefined()
    expect(sanitizeHostKeys([])).toEqual([])
  })

  it('多指纹集合与旧版单指纹字段都收（迁移输入）', () => {
    expect(sanitizeHostKeys([{ host: 'h', port: 2222, fingerprint: 'sha256:old' }]))
      .toEqual([{ host: 'h', port: 2222, fingerprints: ['sha256:old'] }])
    expect(sanitizeHostKeys([{ host: 'h', port: 2222, fingerprints: ['sha256:a', 'sha256:b'] }]))
      .toEqual([{ host: 'h', port: 2222, fingerprints: ['sha256:a', 'sha256:b'] }])
  })

  it('同一 host:port 的多条记录合并去重（D03 的多算法指纹）', () => {
    expect(sanitizeHostKeys([
      { host: 'h', port: 22, fingerprints: ['sha256:a'] },
      { host: 'H', port: 22, fingerprints: ['sha256:a', 'sha256:b'] },
    ])).toEqual([{ host: 'h', port: 22, fingerprints: ['sha256:a', 'sha256:b'] }])
  })

  it('port 非法落回 22；host 或指纹为空的记录丢掉', () => {
    expect(sanitizeHostKeys([{ host: 'h', fingerprints: ['sha256:a'] }]))
      .toEqual([{ host: 'h', port: 22, fingerprints: ['sha256:a'] }])
    expect(sanitizeHostKeys([{ host: 'h', port: 70000, fingerprints: ['sha256:a'] }]))
      .toEqual([{ host: 'h', port: 22, fingerprints: ['sha256:a'] }])
    expect(sanitizeHostKeys([{ host: '', fingerprints: ['sha256:a'] }])).toEqual([])
    expect(sanitizeHostKeys([{ host: 'h', fingerprints: [] }])).toEqual([])
    expect(sanitizeHostKeys([{ host: 'h', fingerprints: ['   '] }])).toEqual([])
  })

  it('数组里的非法项跳过而不是整表报废', () => {
    expect(sanitizeHostKeys([null, 'x', 7, {}, { host: 'h', port: 22, fingerprints: ['sha256:a'] }]))
      .toEqual([{ host: 'h', port: 22, fingerprints: ['sha256:a'] }])
  })
})
