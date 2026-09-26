/**
 * @hyzyn/dsh-docker — 代理命令（ProxyCommand）在**本包**这条链路上的回归。
 *
 * 本包与 tty 各持一份实现（两包不互相 import），所以口径要各自钉住。这里挑的是三件
 * 「错了不会报错、只会静默走错」的事：
 *
 *   1. **池键必须带上代理命令身份**：不同代理命令到同一目标是两条不同的连接，只按
 *      `user@host:port` 记会把命令发到错误的主机上。而且池键**不许回显命令原文**——
 *      原文可能含凭据（`-i /path/key`），池键会进日志与诊断路径。
 *   2. **闸门缺省关**：`RemoteExec` 不给 `proxyCommandAllowed` 时（老调用方 / 宿主半体）
 *      携带代理命令的目标必须**明确失败**，不能退回直连。
 *   3. **闸门按每次拨号求值**：用户关掉开关后，已经构造好的 RemoteExec 下一次拨号就要拒绝
 *      （缓存成布尔值 = 「关了还能用」，这一档最不能出的错）。
 */
import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { readTtyBooks, readTtyProxyCommandAllowed } from '../src/index.js'
import {
  dialProxyCommand,
  expandProxyCommand,
  poolKey,
  PROXY_COMMAND_DISABLED,
  proxyFailureSuffix,
  RemoteExec,
  sanitizeProxyCommand,
} from '../src/ssh-exec.js'

const state = vi.hoisted(() => ({ clients: [] as unknown[] }))

vi.mock('ssh2', () => ({
  Client: class extends EventEmitter {
    constructor() {
      super()
      state.clients.push(this)
    }

    connect(): void {
      setTimeout(() => this.emit('error', new Error('连接不会被建立：闸门关着时就该失败')), 0)
    }

    end(): void {
      this.emit('close')
    }

    destroy(): void {}
  },
}))

/** 常驻命令（60s 后自己退出）；用带引号的 execPath 保证 Windows 下也能跑。 */
const idleCommand = `"${process.execPath}" -e "setTimeout(() => {}, 60000)"`

const baseSpec = { host: 'h', port: 22, username: 'u', auth: 'agent' as const }

describe('sanitizeProxyCommand / expandProxyCommand（与 tty 逐字同口径）', () => {
  it('清洗：非字符串 / 空 / 多行 → undefined（没配）', () => {
    expect(sanitizeProxyCommand(undefined)).toBeUndefined()
    expect(sanitizeProxyCommand('  ')).toBeUndefined()
    expect(sanitizeProxyCommand('a\nb')).toBeUndefined()
    expect(sanitizeProxyCommand('  nc b 22 ')).toBe('nc b 22')
  })

  it('展开 %h %p %r，并把含 shell 特殊字符的代入值挡在门外', () => {
    expect(expandProxyCommand('nc %h %p', { ...baseSpec, host: 't.corp', port: 2222 })).toBe('nc t.corp 2222')
    expect(expandProxyCommand('nc %h 22 -l %r', baseSpec)).toBe('nc h 22 -l u')
    expect(() => expandProxyCommand('nc %h 22', { ...baseSpec, host: 'h; rm -rf /' })).toThrow(/无法代入/)
  })
})

describe('池键：代理命令身份并入，且不回显命令原文', () => {
  it('两条不同的代理命令是两个键（否则静默复用、命令发错主机）', () => {
    const a = poolKey({ ...baseSpec, proxyCommand: 'nc bastion-a 22' })
    const b = poolKey({ ...baseSpec, proxyCommand: 'nc bastion-b 22' })
    const direct = poolKey(baseSpec)
    expect(a).not.toBe(b)
    expect(a).not.toBe(direct)
    expect(a).toContain('|cmd:')
  })

  it('键里只有摘要：命令原文（可能含凭据）不出现在池键里', () => {
    const key = poolKey({ ...baseSpec, proxyCommand: 'nc bastion 22 -i /home/u/.ssh/id_ed25519_sekret' })
    expect(key).not.toContain('sekret')
    expect(key).not.toContain('bastion')
  })

  it('跳板机与代理命令同时配时，池键按跳板机那一档（与拨号的 ProxyJump 优先一致）', () => {
    const key = poolKey({ ...baseSpec, jump: { host: 'bastion' }, proxyCommand: 'nc other 22' })
    expect(key).toContain('|jump:u@bastion')
    expect(key).not.toContain('|cmd:')
  })
})

describe('闸门：缺省关，且**每次拨号**求值', () => {
  it('不给求值器（老调用方）时携带代理命令的连接明确失败，且不退化成直连', async () => {
    const exec = new RemoteExec({ info: () => {}, warn: () => {} }, { get: () => undefined, record: () => {} })
    await expect(exec.run({ ...baseSpec, proxyCommand: idleCommand }, ['docker', 'ps'])).rejects.toThrow(PROXY_COMMAND_DISABLED)
    exec.disposeAll()
  })

  it('求值器说关就关（关掉之后下一次拨号立刻拒绝）', async () => {
    let allowed = true
    const exec = new RemoteExec({ info: () => {}, warn: () => {} }, { get: () => undefined, record: () => {} }, { proxyCommandAllowed: () => allowed })
    // 先证明求值器被真的读到了：置 false 后必须拒绝
    allowed = false
    await expect(exec.run({ ...baseSpec, proxyCommand: idleCommand }, ['docker', 'ps'])).rejects.toThrow(PROXY_COMMAND_DISABLED)
    exec.disposeAll()
  })
})

describe('dialProxyCommand：起得来、收得掉、失败说人话', () => {
  it('开闸后返回传输；dispose() 幂等且子进程被杀', async () => {
    const dialed = await dialProxyCommand({ spec: { ...baseSpec, proxyCommand: idleCommand }, allowed: () => true })
    expect(dialed.failure()).toBeNull()
    expect(proxyFailureSuffix(dialed)).toBe('')
    dialed.dispose()
    dialed.dispose()
    const deadline = Date.now() + 3000
    while (Date.now() < deadline && dialed.child.exitCode === null && dialed.child.signalCode === null) {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    expect(dialed.child.exitCode !== null || dialed.child.signalCode !== null).toBe(true)
  })

  it('竞态兜底：失败事实还没到、stderr 已有内容 → proxyFailureSuffix 仍带上它', async () => {
    const command = `"${process.execPath}" -e "process.stderr.write('ECONNREFUSED 127.0.0.1:9');setTimeout(() => {}, 60000)"`
    const dialed = await dialProxyCommand({ spec: { ...baseSpec, proxyCommand: command }, allowed: () => true })
    const deadline = Date.now() + 3000
    while (Date.now() < deadline && !dialed.stderrHint().includes('ECONNREFUSED')) {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    // 严格语义不变：传输还活着 → 没有「失败事实」；但错误路径拿得到那句 stderr
    expect(dialed.failure()).toBeNull()
    expect(proxyFailureSuffix(dialed)).toContain('ECONNREFUSED 127.0.0.1:9')
    dialed.dispose()
    expect(dialed.stderrHint()).toBe('')
  })

  it('子进程提前退出 → failure() 带 stderr 摘要（文案要说人话）', async () => {
    const command = `"${process.execPath}" -e "process.stderr.write('boom');process.exit(3)"`
    const dialed = await dialProxyCommand({ spec: { ...baseSpec, proxyCommand: command }, allowed: () => true })
    // 等**最终形态**（stderr 摘要必须出现）：exit 与「传输关闭」谁先到不确定，
    // 但用户能据以排查的信息是 stderr 摘要本身
    const deadline = Date.now() + 3000
    while (Date.now() < deadline && !proxyFailureSuffix(dialed).includes('boom')) {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    expect(dialed.failure()?.message).toMatch(/代理命令已退出|代理命令传输已关闭/)
    expect(proxyFailureSuffix(dialed)).toContain('boom')
    dialed.dispose()
  })
})

/* ------------------------------------------------------------------ *
 * 连接簿 → 规格（本包只读 tty 的连接簿：这一跳漏带字段就是「tty 能连、docker 连不上」）
 * ------------------------------------------------------------------ */

describe('readTtyBooks / readTtyProxyCommandAllowed', () => {
  it('连接簿条目带的跳板机与代理命令都跟着进规格', () => {
    const books = readTtyBooks({
      get: () => ({
        sshHosts: [
          {
            name: 'via-proxy',
            host: '10.3.0.9',
            port: 22,
            username: 'deploy',
            proxyCommand: '  ssh -W %h:%p bastion.corp  ',
            jump: { host: 'bastion.corp', port: 2222, username: 'jumper' },
          },
          { name: '半成品', host: '', username: 'root', proxyCommand: 'nc b 22' },
        ],
      }),
    })
    expect([...books.keys()]).toEqual(['via-proxy'])
    expect(books.get('via-proxy')?.proxyCommand).toBe('ssh -W %h:%p bastion.corp')
    expect(books.get('via-proxy')?.jump).toEqual({ host: 'bastion.corp', port: 2222, username: 'jumper' })
  })

  it('连接簿里形状非法的代理命令（多行）当没配：不给下游一条注定跑错的命令', () => {
    const books = readTtyBooks({
      get: () => ({ sshHosts: [{ name: 'x', host: 'h', username: 'u', proxyCommand: 'nc b 22\nrm -rf /' }] }),
    })
    expect(books.get('x')?.proxyCommand).toBeUndefined()
  })

  it('闸门取值：只认布尔 true；settings 缺失 / 抛错 / 字符串 "true" 一律当**关**', () => {
    expect(readTtyProxyCommandAllowed(undefined)).toBe(false)
    expect(readTtyProxyCommandAllowed({ get: () => { throw new Error('settings 还没就绪') } })).toBe(false)
    expect(readTtyProxyCommandAllowed({ get: () => ({}) })).toBe(false)
    expect(readTtyProxyCommandAllowed({ get: () => ({ allowProxyCommand: 'true' }) })).toBe(false)
    expect(readTtyProxyCommandAllowed({ get: () => ({ allowProxyCommand: false }) })).toBe(false)
    expect(readTtyProxyCommandAllowed({ get: () => ({ allowProxyCommand: true }) })).toBe(true)
  })
})
