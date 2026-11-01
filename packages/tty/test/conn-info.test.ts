/**
 * @hyzyn/dsh-tty — 连接栏「连接信息」（`client-src/conn-info.js`）。
 *
 * 为什么值得单测：这些字符串会被**原样复制到聊天窗口 / 工单 / 终端**，写错的表现是
 * 「粘过去连不上」或「把密码带进了命令行」，而界面上都看不出来。边界（22 端口省略、
 * IPv6 方括号、代理命令里有空格、只有认证方式没有地址）又恰好都是抄配置时真会遇到的。
 *
 * 纯模块不碰 DOM / i18n：`t` 由调用方传入，测试里传恒等函数并断言**键**。
 */
import { describe, expect, it } from 'vitest'
import { authLabelKey, connCopyText, connDetailRows, jumpLabelOf, quoteShellArg, resolveConnSpec, sshCommandOf, targetOf } from '../client-src/conn-info.js'

/** 测试用文案函数：恒等返回键（断言的是「用了哪个键」，不是某句中文）。 */
const t = (key: string): string => key

describe('targetOf', () => {
  it('user@host，22 端口不写出来', () => {
    expect(targetOf({ t: 'ssh', host: 'host-a', port: 22, username: 'ops' })).toBe('ops@host-a')
  })

  it('非 22 端口照写；没有用户名就只写主机', () => {
    expect(targetOf({ t: 'ssh', host: 'host-a', port: 2222, username: 'ops' })).toBe('ops@host-a:2222')
    expect(targetOf({ t: 'ssh', host: 'host-a', port: 22 })).toBe('host-a')
  })

  it('IPv6 补方括号（否则 `::1:22` 有歧义）', () => {
    expect(targetOf({ t: 'ssh', host: '::1', port: 2222 })).toBe('[::1]:2222')
    expect(targetOf({ t: 'ssh', host: '[::1]', port: 22 })).toBe('[::1]')
  })

  it('非 SSH 规格 / 没主机 / 空白输入 → 空串（函数本身要能安全接受任意输入）', () => {
    expect(targetOf({ t: 'spawn', cwd: '/tmp' })).toBe('')
    expect(targetOf({ t: 'ssh', host: '', port: 22 })).toBe('')
    expect(targetOf({ t: 'ssh', host: '   ', port: 22 })).toBe('')
    expect(targetOf(null)).toBe('')
    expect(targetOf(undefined)).toBe('')
    expect(targetOf({ t: 'ssh', host: '  host-a  ', port: 22 })).toBe('host-a')
  })
})

describe('jumpLabelOf', () => {
  it('host / user@host:port，22 端口不写出来', () => {
    expect(jumpLabelOf({ host: 'bastion', port: 22 })).toBe('bastion')
    expect(jumpLabelOf({ host: 'bastion', port: 2222, username: 'jump' })).toBe('jump@bastion:2222')
    expect(jumpLabelOf({ host: '[fe80::1]', port: 22 })).toBe('[fe80::1]')
  })

  it('没配 / 形状不对 / 空主机 → 空串', () => {
    expect(jumpLabelOf(undefined)).toBe('')
    expect(jumpLabelOf(null)).toBe('')
    expect(jumpLabelOf('bastion')).toBe('')
    expect(jumpLabelOf({ port: 22 })).toBe('')
  })
})

describe('authLabelKey', () => {
  it('三种认证方式各有文案键，未知不猜', () => {
    expect(authLabelKey('key')).toBe('connDetail.authKey')
    expect(authLabelKey('password')).toBe('connDetail.authPassword')
    expect(authLabelKey('agent')).toBe('connDetail.authAgent')
    expect(authLabelKey('x509')).toBe('')
    expect(authLabelKey(undefined)).toBe('')
  })
})

describe('quoteShellArg', () => {
  it('无空白 / 引号时原样返回', () => {
    expect(quoteShellArg('ssh')).toBe('ssh')
    expect(quoteShellArg('ssh -W %h:%p bastion')).toBe("'ssh -W %h:%p bastion'")
  })

  it('含单引号用 `\'\\\'\'` 转义；空串给一对空引号', () => {
    expect(quoteShellArg("it's")).toBe("'it'\\''s'")
    expect(quoteShellArg('')).toBe("''")
  })
})

describe('sshCommandOf', () => {
  it('基础形态：ssh [user@]host', () => {
    expect(sshCommandOf({ t: 'ssh', host: 'host-a', port: 22, username: 'ops' })).toBe('ssh ops@host-a')
    expect(sshCommandOf({ t: 'ssh', host: 'host-a', port: 22 })).toBe('ssh host-a')
  })

  it('端口 / 跳板机 / 代理命令按 OpenSSH 的写法带上', () => {
    expect(sshCommandOf({ t: 'ssh', host: 'host-a', port: 2222, username: 'ops' })).toBe('ssh -p 2222 ops@host-a')
    expect(sshCommandOf({
      t: 'ssh',
      host: 'host-a',
      port: 22,
      username: 'ops',
      jump: { host: 'bastion', port: 2200, username: 'jump' },
    })).toBe('ssh -J jump@bastion:2200 ops@host-a')
    expect(sshCommandOf({
      t: 'ssh',
      host: 'host-a',
      port: 22,
      username: 'ops',
      proxyCommand: 'ssh -W %h:%p bastion',
    })).toBe("ssh -o ProxyCommand='ssh -W %h:%p bastion' ops@host-a")
  })

  it('**不带凭据**：密码 / 私钥路径 / passphrase 都不进命令行', () => {
    const command = sshCommandOf({
      t: 'ssh',
      host: 'host-a',
      port: 22,
      username: 'ops',
      auth: 'key',
      keyPath: '/Users/you/.ssh/id_ed25519',
      passphrase: 'secret-passphrase',
      password: 'secret-password',
    })
    expect(command).toBe('ssh ops@host-a')
    expect(command).not.toContain('secret')
    expect(command).not.toContain('id_ed25519')
  })

  it('非 SSH / 没主机 → 空串', () => {
    expect(sshCommandOf({ t: 'spawn', cwd: '/tmp' })).toBe('')
    expect(sshCommandOf({ t: 'ssh', host: '' })).toBe('')
    expect(sshCommandOf(null)).toBe('')
  })
})

describe('connDetailRows', () => {
  it('连接参数按固定顺序，title 用 com 前缀键；持久化与最近状态来自标签状态', () => {
    const rows = connDetailRows({
      t: 'ssh',
      name: 'lab-a',
      host: 'host-a',
      port: 2222,
      username: 'ops',
      auth: 'password',
      jump: { host: 'bastion', port: 22 },
      proxyCommand: 'ssh -W %h:%p bastion',
    }, { persistTmux: true, statusText: '认证通过（120ms）' }, t)
    expect(rows).toEqual([
      { id: 'target', value: 'ops@host-a:2222' },
      { id: 'book', value: 'lab-a' },
      { id: 'auth', value: 'connDetail.authPassword' },
      { id: 'jump', value: 'bastion' },
      { id: 'proxy', value: 'ssh -W %h:%p bastion' },
      { id: 'persist', value: 'connDetail.persistTmux' },
      { id: 'status', value: '认证通过（120ms）' },
    ])
  })

  it('请求了持久但 tmux 不可用 → 单独一档文案（不是「未持久化」也不是空白）', () => {
    const rows = connDetailRows(
      { t: 'ssh', host: 'host-a' },
      { persistRequested: true },
      t,
    )
    expect(rows.find((row) => row.id === 'persist')).toEqual({ id: 'persist', value: 'connDetail.persistPlain' })
  })

  it('没配的项不画空行（条目 / 认证 / 跳板机 / 代理 / 状态）', () => {
    const rows = connDetailRows({ t: 'ssh', host: 'host-a' }, {}, t)
    expect(rows).toEqual([{ id: 'target', value: 'host-a' }])
  })
})

describe('connCopyText', () => {
  it('每行「标题: 值」，只含连接参数——瞬时状态（持久化 / 最近状态）不进剪贴板', () => {
    const text = connCopyText({
      t: 'ssh',
      name: 'lab-a',
      host: 'host-a',
      port: 22,
      username: 'ops',
      auth: 'key',
      jump: { host: 'bastion', port: 22 },
    }, t)
    expect(text.split('\n')).toEqual([
      'connDetail.target: ops@host-a',
      'connDetail.book: lab-a',
      'connDetail.auth: connDetail.authKey',
      'connDetail.jump: bastion',
    ])
  })

  it('非 SSH / 空规格 → 空串（调用方据此不写剪贴板）', () => {
    expect(connCopyText({ t: 'spawn', cwd: '/tmp' }, t)).toBe('')
    expect(connCopyText(null, t)).toBe('')
  })
})

describe('resolveConnSpec：连接簿式标签的 spawnSpec 只有名字', () => {
  const books = [
    {
      name: 'cdc-test-161',
      host: 'host-a',
      port: 2222,
      username: 'ops',
      auth: 'password',
      password: 'secret-password',
      passphrase: 'secret-passphrase',
      jump: { host: 'bastion', port: 22 },
      proxyCommand: 'ssh -W %h:%p bastion',
    },
  ]

  it('按名字回填条目字段（真实回归：之前复制出来只有「连接簿条目」一行）', () => {
    const resolved = resolveConnSpec({ t: 'ssh', name: 'cdc-test-161' }, books)
    expect(targetOf(resolved)).toBe('ops@host-a:2222')
    expect(jumpLabelOf(resolved.jump)).toBe('bastion')
    expect(sshCommandOf(resolved)).toBe("ssh -p 2222 -J bastion -o ProxyCommand='ssh -W %h:%p bastion' ops@host-a")
  })

  it('**剥掉明文凭据**：回填结果里不许有 password / passphrase', () => {
    const resolved = resolveConnSpec({ t: 'ssh', name: 'cdc-test-161' }, books)
    expect(resolved).not.toHaveProperty('password')
    expect(resolved).not.toHaveProperty('passphrase')
  })

  it('本次会话的持久化选择不被条目默认值改回去', () => {
    expect(resolveConnSpec({ t: 'ssh', name: 'cdc-test-161', persist: true }, books).persist).toBe(true)
    expect(resolveConnSpec({ t: 'ssh', name: 'cdc-test-161' }, books).persist).toBeUndefined()
  })

  it('内联连接 / 找不到条目 / 非 SSH / 缓存没到 → 原样返回（不猜）', () => {
    const inline = { t: 'ssh', host: 'host-b', port: 22, username: 'ops' }
    expect(resolveConnSpec(inline, books)).toBe(inline)
    const orphan = { t: 'ssh', name: 'gone' }
    expect(resolveConnSpec(orphan, books)).toBe(orphan)
    expect(resolveConnSpec({ t: 'spawn', cwd: '/tmp' }, books)).toEqual({ t: 'spawn', cwd: '/tmp' })
    expect(resolveConnSpec({ t: 'ssh', name: 'cdc-test-161' }, undefined)).toEqual({ t: 'ssh', name: 'cdc-test-161' })
  })
})

describe('live targetText：宿主 ready 帧的实时地址优先于推算值', () => {
  it('详情行与复制文本都用实时地址（连接簿事后被改过时以实际连接为准）', () => {
    const spec = { t: 'ssh', name: 'lab-a', host: 'host-old', port: 22, username: 'ops' }
    const rows = connDetailRows(spec, { targetText: 'ops@host-new:2200' }, t)
    expect(rows.find((row) => row.id === 'target')).toEqual({ id: 'target', value: 'ops@host-new:2200' })
    expect(connCopyText(spec, t, { targetText: 'ops@host-new:2200' }).split('\n')[0]).toBe('connDetail.target: ops@host-new:2200')
  })
})
