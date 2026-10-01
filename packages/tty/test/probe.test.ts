/**
 * @hyzyn/dsh-tty — SSH 字段校验的回归测试。
 *
 * 只测纯函数 validateSshFields（不做任何网络请求）：连接簿 / 对话框新增与
 * 编辑前的形状校验，错误文案是设置卡片直接展示给用户的契约。
 */
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { PROXY_EVIDENCE_GRACE_MS, probeSsh, validateSshFields } from '../src/probe.js'
import { setProxyCommandPolicy } from '../src/ssh.js'

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

/**
 * 代理命令维度：**闸门关着时探针必须在阶段 0 就返回**，且要按原因分开报。
 *
 * 为什么单列：探针是用户遇到连不上时第一个点的按钮。若它照旧去 TCP 预检目标主机，
 * 用户会拿到「TCP 超时」并去查网络——而真相是「代理命令没开」。两种「没开」的下一步动作
 * 完全不同（去设环境变量 + 重启 / 去把开关打开），所以文案必须分开：
 *   - `proxy.active === false`，`auth.error` / `tcp.error` 带的是**那一条**原因；
 *   - 不做 TCP 预检（否则会读成「目标不可达」）；
 *   - 立即返回（目标地址是 TEST-NET-3 的不可达地址，真去连必然慢）。
 */
describe('probeSsh：代理命令闸门', () => {
  afterEach(() => {
    setProxyCommandPolicy({ granted: false, enabled: false })
  })

  it('未获宿主授权 → 阶段 0 返回「未授权」，并给出环境变量名', async () => {
    const started = Date.now()
    const result = await probeSsh({ host: '203.0.113.7', username: 'u', proxyCommand: 'ssh -W %h:%p bastion' })
    expect(Date.now() - started).toBeLessThan(1000)
    expect(result.proxy?.active).toBe(false)
    expect(result.proxy?.error).toContain('未获宿主授权')
    expect(result.proxy?.error).toContain('DSH_TTY_ALLOW_PROXY_COMMAND')
    expect(result.auth.ok).toBe(false)
    expect(result.auth.error).toContain('未获宿主授权')
    expect(result.tcp.ok).toBe(false)
    expect(result.tcp.error).toContain('未获宿主授权')
  })

  it('真机验收挖出的缺陷（tty D66）：代理命令失败时，文案必须带子进程的 stderr，而不是被后到的 close 盖成空话', async () => {
    setProxyCommandPolicy({ granted: true, enabled: true })
    const bridge = fileURLToPath(new URL('../scripts/lib/proxy-bridge.mjs', import.meta.url))
    // 桥指向没人监听的端口 → 子进程立刻失败并把 ECONNREFUSED 写进 stderr。
    // 这一步真的会 spawn 一个本机进程（约 30ms），但正是要验「两条 ssh2 错误 + close 的先后顺序」
    // 下最终交给用户的到底是哪一句——纯 mock 永远测不出这个次序问题。
    const result = await probeSsh({
      host: '127.0.0.1',
      port: 9,
      username: 'u',
      auth: 'password',
      password: 'x',
      proxyCommand: `"${process.execPath}" "${bridge}" %h %p`,
    })
    expect(result.proxy?.active).toBe(true)
    expect(result.tcp).toEqual({ ok: false, skipped: true, ms: 0 })
    expect(String(result.auth.error)).toContain('ECONNREFUSED')
    // 反过来也钉住：不许是那句「最后到的 close」文案（原先就是这个形态）
    expect(String(result.auth.error)).not.toBe('连接已关闭（服务端主动断开）')
  })

  it('负载下间歇红的缺陷（tty D95）：子进程已退出、stderr 后到时，文案必须**等**它（有界）', async () => {
    setProxyCommandPolicy({ granted: true, enabled: true })
    const late = fileURLToPath(new URL('../scripts/lib/proxy-late-evidence.mjs', import.meta.url))
    /*
     * 夹具把「已退出」与「stderr 到手」**必然**拆成两拍（见该文件）：主进程立刻 `exit(1)`，
     * stderr 交给 detached 的孙进程 120ms 后写。修复前实测每次都得到
     * 「代理命令传输已关闭（命令已结束）」——最有用的一句丢了；负载下这正是上面 D66 那条
     * 用例会间歇红的原因（CI 与两次全量并行跑各实测到过一次）。
     */
    const started = Date.now()
    const result = await probeSsh({
      host: '127.0.0.1',
      port: 9,
      username: 'u',
      auth: 'password',
      password: 'x',
      proxyCommand: `"${process.execPath}" "${late}"`,
    })
    expect(String(result.auth.error)).toContain('LATE-EVIDENCE-9')
    // 有界：等证据也不许把探针拖长（夹具 120ms + 握手开销；余量给足，免得在慢机上假红）
    expect(Date.now() - started).toBeLessThan(PROXY_EVIDENCE_GRACE_MS + 1000)
  })

  it('已授权但开关关着 → 报的是「未启用」（下一步只是去开开关）', async () => {
    setProxyCommandPolicy({ granted: true, enabled: false })
    const result = await probeSsh({ host: '203.0.113.7', username: 'u', proxyCommand: 'ssh -W %h:%p bastion' })
    expect(result.proxy?.active).toBe(false)
    expect(result.proxy?.error).toContain('未启用')
    expect(result.proxy?.error).not.toContain('未获宿主授权')
    expect(result.auth.error).toContain('未启用')
  })

  /*
   * 顺序：**闸门优先于 agent 预检**（Windows 真机挖出来的）。
   *
   * 为什么上面那些用例没发现：它们写了 `proxyCommand` 却都没写 `auth`，于是 `spec.auth` 是
   * `undefined`、agent 预检那一支（`spec.auth === 'agent'`）根本没进。而**路由**在缺省时会把
   * `auth` 填成 `'agent'`（`index.ts` 的探针分支：`body.auth === 'key' || 'password' ? … : 'agent'`），
   * 所以用户在对话框里不选认证方式 + 本机没有 ssh-agent 时，真实路径就是这里。
   * macOS 开发机本机有 agent，看不出来；Windows / 干净 CI 上没有。
   */
  it('auth=agent（路由缺省值）+ 本机没有 ssh-agent：报的仍是**闸门**，不是 agent 文案', async () => {
    const previous = process.env.SSH_AUTH_SOCK
    delete process.env.SSH_AUTH_SOCK
    try {
      setProxyCommandPolicy({ granted: false, enabled: false })
      const result = await probeSsh({ host: '203.0.113.7', port: 22, username: 'u', auth: 'agent', proxyCommand: 'ssh -W %h:%p bastion' })
      expect(result.proxy?.error).toContain('未获宿主授权')
      expect(result.auth.error).toContain('未获宿主授权')
      expect(String(result.auth.error)).not.toContain('SSH_AUTH_SOCK')
    } finally {
      if (previous === undefined) delete process.env.SSH_AUTH_SOCK
      else process.env.SSH_AUTH_SOCK = previous
    }
  })

  it('没有代理命令时，agent 预检照旧生效（顺序修的是先后，不是把这一档丢掉）', async () => {
    const previous = process.env.SSH_AUTH_SOCK
    delete process.env.SSH_AUTH_SOCK
    try {
      const result = await probeSsh({ host: '203.0.113.7', port: 22, username: 'u', auth: 'agent' })
      expect(result.proxy).toBeUndefined()
      expect(result.auth.error).toContain('SSH_AUTH_SOCK')
    } finally {
      if (previous === undefined) delete process.env.SSH_AUTH_SOCK
      else process.env.SSH_AUTH_SOCK = previous
    }
  })
})
