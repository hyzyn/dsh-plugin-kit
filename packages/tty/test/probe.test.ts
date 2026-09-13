/**
 * @hyzyn/dsh-tty — SSH 字段校验的回归测试。
 *
 * 只测纯函数 validateSshFields（不做任何网络请求）：连接簿 / 对话框新增与
 * 编辑前的形状校验，错误文案是设置卡片直接展示给用户的契约。
 */
import { describe, expect, it } from 'vitest'
import { validateSshFields } from '../src/probe.js'

describe('validateSshFields', () => {
  it('host / username 必填（trim 后为空也算缺）', () => {
    expect(validateSshFields({})).toEqual({ error: '主机必填' })
    expect(validateSshFields({ host: '   ', username: 'u' })).toEqual({ error: '主机必填' })
    expect(validateSshFields({ host: 'h' })).toEqual({ error: '用户名必填' })
    expect(validateSshFields({ host: 'h', username: '  ' })).toEqual({ error: '用户名必填' })
  })

  it('port 缺省 / 空串默认 22，字符串数字收；非法值报错', () => {
    expect(validateSshFields({ host: 'h', username: 'u' }).spec).toEqual({ host: 'h', port: 22, username: 'u', auth: 'agent' })
    expect(validateSshFields({ host: 'h', username: 'u', port: '' }).spec?.port).toBe(22)
    expect(validateSshFields({ host: 'h', username: 'u', port: '2222' }).spec?.port).toBe(2222)
    for (const bad of [0, 65536, -1, 1.5, 'abc', '22.5', {}]) {
      expect(validateSshFields({ host: 'h', username: 'u', port: bad }), `port=${String(bad)}`).toEqual({
        error: '端口必须是 1~65535 的整数',
      })
    }
  })

  it('auth 缺省 / 非法值回退 agent', () => {
    expect(validateSshFields({ host: 'h', username: 'u' }).spec?.auth).toBe('agent')
    expect(validateSshFields({ host: 'h', username: 'u', auth: 'whatever' }).spec?.auth).toBe('agent')
  })

  it('auth=key 必须有私钥路径；passphrase 仅在非空时写入', () => {
    expect(validateSshFields({ host: 'h', username: 'u', auth: 'key' })).toEqual({ error: 'auth=key 需要私钥路径' })
    expect(validateSshFields({ host: 'h', username: 'u', auth: 'key', keyPath: '  ' })).toEqual({ error: 'auth=key 需要私钥路径' })
    expect(validateSshFields({ host: 'h', username: 'u', auth: 'key', keyPath: ' /k/id ', passphrase: '' }).spec).toEqual({
      host: 'h',
      port: 22,
      username: 'u',
      auth: 'key',
      keyPath: '/k/id',
    })
    expect(validateSshFields({ host: 'h', username: 'u', auth: 'key', keyPath: '/k/id', passphrase: 'pp' }).spec?.passphrase).toBe('pp')
  })

  it('auth=password 必须有非空密码', () => {
    expect(validateSshFields({ host: 'h', username: 'u', auth: 'password' })).toEqual({ error: 'auth=password 需要密码' })
    expect(validateSshFields({ host: 'h', username: 'u', auth: 'password', password: '' })).toEqual({ error: 'auth=password 需要密码' })
    expect(validateSshFields({ host: 'h', username: 'u', auth: 'password', password: 'pw' }).spec).toEqual({
      host: 'h',
      port: 22,
      username: 'u',
      auth: 'password',
      password: 'pw',
    })
  })

  it('agentForward 仅 true 时写入；host / username 去首尾空白', () => {
    const plain = validateSshFields({ host: ' h ', username: ' u ', agentForward: false }).spec
    expect(plain).toEqual({ host: 'h', port: 22, username: 'u', auth: 'agent' })
    expect(validateSshFields({ host: 'h', username: 'u', agentForward: true }).spec?.agentForward).toBe(true)
  })
})
