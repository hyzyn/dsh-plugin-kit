/**
 * @hyzyn/dsh-tty — 宿主半体最小冒烟（0.19.0，DEFECTS D38/D45 第一刀）。
 *
 * 此前 test/ 里没有任何用例 import src/index.ts——CI 对宿主侧的语法断裂、
 * 依赖缺失、导出面破坏静默通过（D38 的核心事实）。这里至少钉住：
 *   1. 宿主插件模块可加载、导出面完整；
 *   2. env: 引用「值为空」与「未设置」分开报错（D16① 回归）；
 *   3. auth=agent 缺 SSH_AUTH_SOCK 直接报人话（D16② 回归）；
 *   4. classifyError 分类（D16③ 回归）。
 * 帧协议 / 会话生命周期 / SFTP 路由 / 隧道的覆盖仍待补（见 DEFECTS.md D38/D45）。
 */
import { describe, expect, it } from 'vitest'
import * as ttyPlugin from '../src/index.js'
import { buildConnectConfig, classifyError, resolveSecretVia, setCredentialResolver } from '../src/ssh.js'

describe('宿主半体 import 冒烟', () => {
  it('插件模块可加载且导出面完整', () => {
    expect(ttyPlugin.name).toBe('tty')
    expect(Array.isArray(ttyPlugin.inject)).toBe(true)
    expect(typeof ttyPlugin.apply).toBe('function')
  })
})

describe('resolveSecretVia（env: 引用）', () => {
  it('provider 找到值时原样返回', async () => {
    const provider = { resolve: async () => ({ value: 's3cret' }) }
    await expect(resolveSecretVia(provider, 'env:DSH_TEST_KEY')).resolves.toBe('s3cret')
  })

  it('引用存在但值为空串 → 明确报「值是空串」，不再伪装成「未设置」', async () => {
    const provider = { resolve: async () => ({ value: '' }) }
    await expect(resolveSecretVia(provider, 'env:DSH_TEST_EMPTY')).rejects.toThrow('值是空串')
  })

  it('引用不存在（无 provider）→ 报「凭据未设置」', async () => {
    await expect(resolveSecretVia(null, 'env:DSH_TEST_MISSING_XYZ')).rejects.toThrow('凭据未设置')
  })

  it('非 env: 前缀的值原样返回', async () => {
    await expect(resolveSecretVia(null, 'plain-value')).resolves.toBe('plain-value')
    await expect(resolveSecretVia(null, undefined)).resolves.toBeUndefined()
  })
})

describe('buildConnectConfig（认证预检）', () => {
  const savedSock = process.env.SSH_AUTH_SOCK

  it('auth=agent 且缺 SSH_AUTH_SOCK → 直接报 SSH_AUTH_SOCK（不落到 ssh2 的笼统失败）', async () => {
    delete process.env.SSH_AUTH_SOCK
    await expect(buildConnectConfig({ host: 'h', username: 'u', auth: 'agent' })).rejects.toThrow('SSH_AUTH_SOCK')
  })

  it('auth=key 缺 keyPath → 明确报错', async () => {
    await expect(buildConnectConfig({ host: 'h', username: 'u', auth: 'key' })).rejects.toThrow('keyPath')
  })

  it('auth=password 引用为空串 → 报「值是空串」而非认证失败', async () => {
    setCredentialResolver({ resolve: async (name) => ({ value: name === 'DSH_TEST_EMPTY' ? '' : undefined }) })
    try {
      await expect(buildConnectConfig({ host: 'h', username: 'u', auth: 'password', password: 'env:DSH_TEST_EMPTY' })).rejects.toThrow('值是空串')
    } finally {
      setCredentialResolver(null)
    }
  })
})

describe('classifyError（ssh2 原始错误 → 人话）', () => {
  it('认证全失败', () => {
    expect(classifyError('All configured authentication methods failed')).toContain('认证被拒绝')
  })
  it('连接拒绝', () => {
    expect(classifyError('listen ECONNREFUSED 127.0.0.1:22')).toContain('ECONNREFUSED')
  })
  it('无法识别时原样返回', () => {
    expect(classifyError('some exotic failure')).toBe('some exotic failure')
  })
})
