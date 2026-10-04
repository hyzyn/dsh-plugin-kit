/**
 * `devfront` 的凭据使用面（`src/credential.ts`）。
 *
 * 两条判据是这一层的存在理由，也各有用例：
 *   1. **来源层要翻成「保护强度」**，而且**不许把「方便」说成「防护」**（plan §3.7-1）——
 *      `env` / `file` 这些层全是 `none`，因为 agent 与用户同 uid，读得到；没登记的来源层必须
 *      落到 `unknown` 而不是「大概安全」；
 *   2. **失败不抛、给一句能行动的话**：凭据没配是这条路径上的常态，判定层要把它变成一条带码的
 *      拒绝，而不是一个异常栈。
 */
import { describe, expect, it } from 'vitest'

import { credentialProtection, resolveTargetCredential } from '../src/credential.js'
import type { CredentialResolver } from '@hyzyn/dsh-kit'

const REF = 'env:CDQAS_APP_PWD'

/** 假 provider：`resolve` 返回给定值（或抛错 / 返回 undefined）。 */
function providerOf(value: string | undefined | Error, source?: string): CredentialResolver {
  return {
    resolve: async () => {
      if (value instanceof Error) throw value
      if (value === undefined) return undefined
      return source === undefined ? { value } : { value, source }
    },
  }
}

describe('保护强度：不许把「方便」说成「防护」', () => {
  it('本机读得到的来源层一律是 none，且说明里写清「方便，不是防护」+ 为什么（同 uid）', () => {
    for (const source of ['env', 'file', 'project-env', 'user-env']) {
      const protection = credentialProtection(source)
      expect(protection.level, source).toBe('none')
      expect(protection.note, source).toContain('方便，不是防护')
      expect(protection.note, source).toContain('uid')
    }
  })

  it('keychain 一类才算 strong（会检查调用方身份）', () => {
    expect(credentialProtection('keychain').level).toBe('strong')
  })

  it('provider 没给来源层 → unknown（按不防护对待，别据此宣称安全性）', () => {
    expect(credentialProtection(undefined).level).toBe('unknown')
    expect(credentialProtection(undefined).note).toContain('不防护')
  })

  it('没登记过的来源层 → unknown，并点名是哪一个', () => {
    const protection = credentialProtection('some-new-vault')
    expect(protection.level).toBe('unknown')
    expect(protection.note).toContain('some-new-vault')
  })
})

describe('解析引用：成功给值 + 强度，失败给一句能行动的话', () => {
  it('provider 给值 + 来源层 → 值 + 对应强度', async () => {
    const outcome = await resolveTargetCredential({ provider: providerOf('s3cret', 'file'), ref: REF })
    expect(outcome.ok).toBe(true)
    expect(outcome.ok && outcome.value).toBe('s3cret')
    expect(outcome.ok && outcome.protection.level).toBe('none')
    expect(outcome.ok && outcome.protection.note).toContain('凭据存储文件')
  })

  it('provider 不给来源层 → 值照给，强度记 unknown（如实，不猜）', async () => {
    const outcome = await resolveTargetCredential({ provider: providerOf('s3cret'), ref: REF })
    expect(outcome.ok && outcome.protection.level).toBe('unknown')
  })

  it('provider 报错 → 失败结果里带它那句话（不抛栈：这是常态，不是异常）', async () => {
    const outcome = await resolveTargetCredential({ provider: providerOf(new Error('凭据未设置：CDQAS_APP_PWD')), ref: REF })
    expect(outcome.ok).toBe(false)
    expect(outcome.ok === false && outcome.message).toContain('凭据未设置')
    expect(outcome.ok === false && outcome.ref).toBe(REF)
  })

  it('没有 provider 时退回环境变量（老宿主那条路）', async () => {
    process.env.CDQAS_APP_PWD = 'from-env'
    const outcome = await resolveTargetCredential({ provider: null, ref: REF })
    delete process.env.CDQAS_APP_PWD
    expect(outcome.ok && outcome.value).toBe('from-env')
    expect(outcome.ok && outcome.protection.level).toBe('none')
  })

  it('环境变量里也没有 → 失败，且话里带「凭据服务不可用」这个前提', async () => {
    const outcome = await resolveTargetCredential({ provider: null, ref: 'env:DSH_DEVFRONT_NOT_SET_XYZ' })
    expect(outcome.ok).toBe(false)
    expect(outcome.ok === false && outcome.message).toContain('凭据服务不可用')
  })

  it('明文（不是引用）→ 失败：它连「不落配置文件」都没做到', async () => {
    const outcome = await resolveTargetCredential({ provider: providerOf('x'), ref: 'hunter2' })
    expect(outcome.ok).toBe(false)
    expect(outcome.ok === false && outcome.message).toContain('env:NAME')
  })
})
