/**
 * @hyzyn/dsh-docker — 跳板机（ProxyJump 单跳）的两处关键判定。
 *
 * 为什么单独测这两件事（而不是只跑一遍真机）：
 *   1. **池键必须带上跳板机身份**——只按 `user@host:port` 记的话，两个不同 bastion 到同一
 *      目标会并成同一条连接、静默走错跳板机；这种错**不会报任何错**，只会把命令发到错误的
 *      主机上，真机上也很难看出来（两个 bastion 都能连）。
 *   2. **拨号顺序与凭据继承**——必须先拨跳板机、再把 `forwardOut` 通道当 `sock` 交给目标
 *      连接；且跳板机缺省的凭据要继承目标那一跳（本包的跳板机只从 tty 连接簿读，不做界面）。
 *      这里用假 ssh2 把这两件事钉死，比真机脚本更能定位失败点。
 */
import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'

/** 假 ssh2：记录每条连接的 connect 配置与 forwardOut 调用。 */
interface FakeClient {
  configs: Array<Record<string, unknown>>
  forwards: Array<[string, number, string, number]>
  ended: number
  connect(config: Record<string, unknown>): void
  forwardOut(srcIP: string, srcPort: number, dstIP: string, dstPort: number, cb: (error: Error | null, channel: unknown) => void): void
}

const state = vi.hoisted(() => ({
  /** 每次 new Client() 推一条；行为由测试用例通过 behavior 控制。 */
  behavior: {
    ready: true,
    forwardError: null as Error | null,
  },
  clients: [] as unknown[],
}))

vi.mock('ssh2', () => ({
  Client: class extends EventEmitter {
    configs: Array<Record<string, unknown>> = []
    forwards: Array<[string, number, string, number]> = []
    ended = 0
    constructor() {
      super()
      state.clients.push(this)
    }

    connect(config: Record<string, unknown>): void {
      this.configs.push(config)
      // 异步发 ready，与真 ssh2 一致（调用方先挂监听器）
      setTimeout(() => {
        if (state.behavior.ready) this.emit('ready')
        else this.emit('error', new Error('All configured authentication methods failed'))
      }, 0)
    }

    forwardOut(srcIP: string, srcPort: number, dstIP: string, dstPort: number, cb: (error: Error | null, channel: unknown) => void): void {
      this.forwards.push([srcIP, srcPort, dstIP, dstPort])
      setTimeout(() => cb(state.behavior.forwardError, { fake: 'channel' }), 0)
    }

    end(): void {
      this.ended += 1
      this.emit('close')
    }

    destroy(): void {}
  },
}))

import { dialJump, poolKey } from '../src/ssh-exec.js'

/** 取第 n 条假 client（测试里连接数是确定的）。 */
function clientAt(index: number): FakeClient {
  return state.clients[index] as unknown as FakeClient
}

describe('poolKey：跳板机身份必须进键', () => {
  it('同目标 + 不同跳板机 → 不同键（否则静默走错 bastion，且不报错）', () => {
    const base = { host: 'target.internal', username: 'deploy', port: 22 }
    const viaA = { ...base, jump: { host: 'bastion-a', username: 'jump', port: 22 } }
    const viaB = { ...base, jump: { host: 'bastion-b', username: 'jump', port: 22 } }
    expect(poolKey(viaA)).not.toBe(poolKey(viaB))
    // 直连与经跳板机也不能共用
    expect(poolKey(base)).not.toBe(poolKey(viaA))
  })

  it('同目标 + 同跳板机 → 同键（该复用的还是要复用）', () => {
    const base = { host: 'target.internal', username: 'deploy', port: 22 }
    const jump = { host: 'bastion', username: 'jump', port: 2222 }
    expect(poolKey({ ...base, jump })).toBe(poolKey({ ...base, jump: { ...jump } }))
  })

  it('跳板机端口/用户名不同也算不同键', () => {
    const base = { host: 't', username: 'u' }
    expect(poolKey({ ...base, jump: { host: 'b', port: 22, username: 'x' } }))
      .not.toBe(poolKey({ ...base, jump: { host: 'b', port: 22, username: 'y' } }))
    expect(poolKey({ ...base, jump: { host: 'b', port: 22 } }))
      .not.toBe(poolKey({ ...base, jump: { host: 'b', port: 23 } }))
  })
})

describe('dialJump：先拨跳板机，再把 forwardOut 通道当 sock', () => {
  it('凭据缺省继承目标那一跳；通道指向目标 host:port', async () => {
    state.clients.length = 0
    state.behavior.ready = true
    state.behavior.forwardError = null
    const spec = {
      host: 'target.internal',
      port: 2200,
      username: 'deploy',
      auth: 'password' as const,
      // 字面量密码（不走凭据引用）：这条用例测的是**继承**，不是解析
      password: 'target-secret',
      jump: { host: 'bastion.internal', username: 'jumpuser' },
    }
    const dialed = await dialJump({ spec })
    const bastion = clientAt(0)
    expect(bastion.configs).toHaveLength(1)
    // 继承：目标那一跳的 auth/password 落到跳板机（跳板机只覆盖了 host/username）
    expect(bastion.configs[0].host).toBe('bastion.internal')
    expect(bastion.configs[0].username).toBe('jumpuser')
    expect(bastion.configs[0].password).toBe('target-secret')
    expect(bastion.configs[0].tryKeyboard).toBe(true)
    // forwardOut 指向**目标**（不是跳板机自己）
    expect(bastion.forwards).toEqual([['127.0.0.1', 0, 'target.internal', 2200]])
    expect(dialed.bastion).toBe(state.clients[0])
    expect(dialed.sock).toEqual({ fake: 'channel' })
  })

  it('跳板机认证失败 → 文案点名跳板机，并**关掉**这条连接（不留脱管连接）', async () => {
    state.clients.length = 0
    state.behavior.ready = false
    state.behavior.forwardError = null
    const spec = { host: 'target.internal', username: 'deploy', auth: 'agent' as const, jump: { host: 'bastion', username: 'u' } }
    await expect(dialJump({ spec })).rejects.toThrow(/跳板机连接失败（u@bastion）/)
    expect(clientAt(0).ended).toBeGreaterThan(0)
  })

  it('跳板机拒绝转发（forwardOut 报错）→ 点名跳板机与目标，并关连接', async () => {
    state.clients.length = 0
    state.behavior.ready = true
    state.behavior.forwardError = new Error('administratively prohibited')
    const spec = { host: 'target.internal', username: 'deploy', auth: 'agent' as const, jump: { host: 'bastion', username: 'u' } }
    // sshTarget 在 22 端口下不写端口：标签就是 u@bastion → deploy@target.internal
    await expect(dialJump({ spec })).rejects.toThrow(/跳板机通道打开失败（u@bastion → deploy@target\.internal）/)
    expect(clientAt(0).ended).toBeGreaterThan(0)
  })
})
