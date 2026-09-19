/**
 * @hyzyn/dsh-tty — agent forwarding 链路单测（DEFECTS D45 的 agentForward 面）。
 *
 * README 的承诺是「任意认证方式下都可开；本机未运行 ssh-agent 时连接会**明确报错**
 * 而非静默失效」。这条承诺在实现里分三处，本文件分别钉住：
 *   1. `spawnSsh` 入口预检：缺 SSH_AUTH_SOCK 直接抛人话，且**不建连接**；
 *   2. `buildConnectConfig` 接线：需要转发时把 SOCK 挂成 `agent`（key/password
 *      认证也一样），不需要转发时不挂（不凭白给 ssh2 一个 agent）；
 *   3. per-channel 请求：`conn.shell(..., { agentForward })` 必须如实带上标志
 *      —— 转发是 channel 级请求，配置里挂了 agent 不等于开了转发。
 *
 * ssh2 的 `Client` 被 vi.mock 成假件（connect 只登记、ready 由测试注入），
 * 不依赖真实 ssh-agent 与 sshd。
 */
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildConnectConfig, spawnSsh } from '../src/ssh.js'
import type { SshSpec } from '../src/ssh.js'

/** 测试注入点：被 mock 的 ssh2.Client 构造时回调这里产出假连接。 */
const h = vi.hoisted(() => ({ factory: null as null | (() => unknown) }))
vi.mock('ssh2', () => ({
  Client: class {
    constructor() {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return h.factory!()
    }
  },
}))

/** 假 channel：spawnSsh 只用到 on / stderr / pause / resume / end / close。 */
function makeChannel(): EventEmitter & { stderr: EventEmitter } {
  const ch = new EventEmitter() as EventEmitter & { stderr: EventEmitter }
  ch.stderr = new EventEmitter()
  Object.assign(ch, {
    pause: () => {},
    resume: () => {},
    end: () => {},
    close: () => {},
    write: () => {},
    setWindow: () => {},
  })
  return ch
}

/** 假 ssh2 Client：EventEmitter 打底，connect/shell 的入参可观察。 */
class FakeClient extends EventEmitter {
  connectConfig: unknown = null
  shellOptions: unknown = null
  execCalls = 0
  ended = false

  connect(config: unknown): void {
    this.connectConfig = config
  }

  end(): void {
    this.ended = true
  }

  shell(options: unknown, cb: (error: Error | null, channel?: unknown) => void): void {
    this.shellOptions = options
    cb(null, makeChannel())
  }

  exec(_command: string, ..._rest: unknown[]): void {
    this.execCalls += 1
  }

  trigger(event: string, ...args: unknown[]): void {
    this.emit(event, ...args)
  }
}

const SOCK = '/tmp/dsh-tty-fake-agent.sock'
let client: FakeClient
const savedSock = process.env.SSH_AUTH_SOCK

beforeEach(() => {
  client = new FakeClient()
  h.factory = () => client
})

afterEach(() => {
  if (savedSock === undefined) delete process.env.SSH_AUTH_SOCK
  else process.env.SSH_AUTH_SOCK = savedSock
})

const PASSWORD_SPEC: SshSpec = { host: 'example.test', username: 'deploy', auth: 'password', password: 'pw' }

describe('spawnSsh 的 agent forwarding 预检（README：明确报错而非静默失效）', () => {
  it('勾了转发但本机没有 SSH_AUTH_SOCK → 抛人话，且根本不建连接', async () => {
    delete process.env.SSH_AUTH_SOCK
    await expect(spawnSsh({ ...PASSWORD_SPEC, agentForward: true }, { term: 'xterm-256color', cols: 80, rows: 24 }))
      .rejects.toThrow('agent forwarding 需要 SSH_AUTH_SOCK')
    expect(client.ended).toBe(false)
    expect(client.connectConfig).toBeNull() // 预检在 new Client 之后、connect 之前短路
  })

  it('未勾转发时不因缺 SOCK 报错（password 认证照常走完配置）', async () => {
    delete process.env.SSH_AUTH_SOCK
    await expect(buildConnectConfig(PASSWORD_SPEC)).resolves.toMatchObject({ password: 'pw' })
  })
})

describe('buildConnectConfig 的 agent 接线', () => {
  it('勾了转发 + 有 SOCK → 把 SOCK 挂成 agent（forwarding 需要 agent 通道）', async () => {
    process.env.SSH_AUTH_SOCK = SOCK
    const config = await buildConnectConfig({ ...PASSWORD_SPEC, agentForward: true })
    expect(config.agent).toBe(SOCK)
    expect(config.password).toBe('pw') // 认证仍走 password，agent 只用于转发
  })

  it('没勾转发 → 不挂 agent（不凭白把本机 agent 暴露给这条连接）', async () => {
    process.env.SSH_AUTH_SOCK = SOCK
    const config = await buildConnectConfig({ ...PASSWORD_SPEC, agentForward: false })
    expect(config.agent).toBeUndefined()
  })

  it('auth=agent 且缺 SOCK → 认证预检先报（与转发的预检是两条独立文案）', async () => {
    delete process.env.SSH_AUTH_SOCK
    await expect(buildConnectConfig({ host: 'example.test', username: 'deploy', auth: 'agent' }))
      .rejects.toThrow('auth=agent 需要 SSH_AUTH_SOCK')
  })
})

describe('per-channel 转发请求（配置挂了 agent ≠ 开了转发）', () => {
  async function spawnAndReady(spec: SshSpec): Promise<void> {
    const pending = spawnSsh(spec, { term: 'xterm-256color', cols: 100, rows: 30 })
    // connect 是同步调用：等一个微任务让 promise 执行器跑到 conn.connect()
    await new Promise((r) => setTimeout(r, 0))
    client.trigger('ready')
    await pending
  }

  it('agentForward=true → shell channel 请求如实带 agentForward: true', async () => {
    process.env.SSH_AUTH_SOCK = SOCK
    await spawnAndReady({ ...PASSWORD_SPEC, agentForward: true })
    expect(client.shellOptions).toMatchObject({ term: 'xterm-256color', cols: 100, rows: 30, agentForward: true })
    expect(client.connectConfig).toMatchObject({ agent: SOCK, password: 'pw' })
  })

  it('未勾转发 → 请求里 agentForward: false（默认不开）', async () => {
    process.env.SSH_AUTH_SOCK = SOCK
    await spawnAndReady(PASSWORD_SPEC)
    expect(client.shellOptions).toMatchObject({ agentForward: false })
  })
})
