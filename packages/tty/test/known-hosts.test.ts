/**
 * @hyzyn/dsh-tty — ~/.ssh/known_hosts 解析器的回归测试。
 *
 * 指纹算法与 ssh2 hostVerifier 一致（sha256(raw key blob) hex），测试里按同一
 * 算法现算期望值，保证解析结果可直接参与 TOFU 比对。覆盖：非 hashed 条目、
 * [host]:port、多 alias、通配/否定跳过、hashed 条目按候选主机名还原、去重与上限。
 */
import { createHash, createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { parseKnownHosts } from '../src/known-hosts.js'

/** 与实现一致的指纹算法。 */
function fingerprint(base64Key: string): string {
  return createHash('sha256').update(Buffer.from(base64Key, 'base64')).digest('hex')
}

const KEY = Buffer.from('test-key-blob').toString('base64')
const FP = fingerprint(KEY)

/** 造一条 hashed 条目：|1|salt|hmac，按 OpenSSH HMAC-SHA1 规则对主机名签名。 */
function hashedToken(host: string): string {
  const salt = Buffer.from([1, 2, 3, 4])
  const hmac = createHmac('sha1', salt).update(host).digest()
  return `|1|${salt.toString('base64')}|${hmac.toString('base64')}`
}

describe('parseKnownHosts', () => {
  it('解析裸主机 + keytype + base64，端口默认 22，主机名小写', () => {
    const entries = parseKnownHosts(`Example.COM ssh-ed25519 ${KEY}\n`)
    expect(entries).toEqual([{ host: 'example.com', port: 22, fingerprints: [FP] }])
  })

  it('[host]:port 形式解析非默认端口', () => {
    const entries = parseKnownHosts(`[a.example.com]:2222 ssh-rsa ${KEY}\n`)
    expect(entries).toEqual([{ host: 'a.example.com', port: 2222, fingerprints: [FP] }])
  })

  it('逗号分隔的多 alias 每个单独成条', () => {
    const entries = parseKnownHosts(`alias1,alias2 ssh-ed25519 ${KEY}\n`)
    expect(entries.map((entry) => entry.host)).toEqual(['alias1', 'alias2'])
  })

  it('通配 / 否定 pattern 跳过；@cert-authority / @revoked 行跳过', () => {
    const text = [
      `*.wild ssh-ed25519 ${KEY}`,
      `!neg ssh-ed25519 ${KEY}`,
      `@cert-authority ca.example.com ssh-ed25519 ${KEY}`,
      `@revoked revoked.example.com ssh-ed25519 ${KEY}`,
      `good.example.com ssh-ed25519 ${KEY}`,
    ].join('\n')
    expect(parseKnownHosts(text).map((entry) => entry.host)).toEqual(['good.example.com'])
  })

  it('注释、字段不足、未知 keytype、空 base64 跳过', () => {
    const text = [
      '# comment',
      `short.example.com ssh-ed25519`,
      `unknown.example.com magic-type ${KEY}`,
      `empty.example.com ssh-ed25519 ${Buffer.alloc(0).toString('base64')}`,
      `good.example.com ssh-ed25519 ${KEY}`,
    ].join('\n')
    expect(parseKnownHosts(text).map((entry) => entry.host)).toEqual(['good.example.com'])
  })

  it('同 host:port 多条（rsa + ed25519）并入同一条记录的多指纹集合', () => {
    const other = Buffer.from('another-key').toString('base64')
    const FP2 = fingerprint(other)
    const text = `h.example.com ssh-rsa ${KEY}\nh.example.com ssh-ed25519 ${other}\n`
    const entries = parseKnownHosts(text)
    expect(entries).toHaveLength(1)
    expect(entries[0].fingerprints).toEqual([FP, FP2])
  })

  it('hashed 条目无候选主机名时无法反解（返回空）', () => {
    expect(parseKnownHosts(`${hashedToken('secret.host')} ssh-ed25519 ${KEY}\n`)).toEqual([])
  })

  it('hashed 条目按候选主机名还原（含 [host]:port 变体）', () => {
    const entries = parseKnownHosts(`${hashedToken('secret.host')} ssh-ed25519 ${KEY}\n`, ['secret.host'])
    expect(entries).toEqual([{ host: 'secret.host', port: 22, fingerprints: [FP] }])

    const token = hashedToken('[secret.host]:2222')
    const bracketed = parseKnownHosts(`${token} ssh-ed25519 ${KEY}\n`, ['[secret.host]:2222'])
    expect(bracketed).toEqual([{ host: 'secret.host', port: 2222, fingerprints: [FP] }])
  })

  it('candidates 大小写不敏感匹配，错误候选不产出', () => {
    expect(parseKnownHosts(`${hashedToken('secret.host')} ssh-ed25519 ${KEY}\n`, ['SECRET.HOST'])).toHaveLength(1)
    expect(parseKnownHosts(`${hashedToken('secret.host')} ssh-ed25519 ${KEY}\n`, ['other.host'])).toEqual([])
  })

  it('最多 500 条，超出截断', () => {
    const lines = Array.from({ length: 600 }, (_, index) => `h${index}.example.com ssh-ed25519 ${KEY}`)
    expect(parseKnownHosts(lines.join('\n'))).toHaveLength(500)
  })
})
