/**
 * @hyzyn/dsh-docker — SSH 通道额度（`MaxSessions`）的两条硬约束回归（D150）。
 *
 * 现场（2026-09-29，248）：一个目标只维持一条连接，sshd 只给 10 个 session 槽；长流最多 8 条，
 * 余下两条**要装下全部短命令**。面板上一次点击会并发发出不止两条（概览 inspect + 日志快照 +
 * 统计快照），agent 侧也会并发调 `docker_logs` / `docker_inspect`，于是多出来的那条通道被
 * 远端直接拒绝（`error: no more sessions` → ssh2 `Channel open failure: open failed`），
 * 用户看到的是「面板读不出日志」。更糟的是这条连接**不会自己恢复**：客户端中止长流时发的
 * `signal('KILL')` 在部分 sshd 上被拒绝，而 sshd 在子进程活着时延迟释放 session 槽，
 * 于是「重试」永远打在一条满连接上。
 *
 * 所以这里钉两件事：
 *   1. **短命令要排队**（`ShortChannelGate`）——不能让第 3 条并发通道去撞 10 的硬上限；
 *   2. **额度满要重建连接并重试一次**（`RemoteExec.openChannel`）——把「重试没用」变成自愈，
 *      同时仍要 `end()` 掉旧连接（D07：只摘出池不关会泄漏一条被 keepalive 养着的连接）。
 *
 * 为什么用假 ssh2 真跑 `RemoteExec`（而不是只测纯函数）：这两条都是**时序**约束——闸门何时
 * 放行、重建后用的是哪条连接、重试几次。假 Client 能精确控制 `exec` 的成败与通道的关闭时机，
 * 真实 ssh2 的时序在单测里反而不可控（与 test/ssh-proxy-command.test.ts 同一套桩）。
 */
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RemoteExec, ShortChannelGate, isChannelExhaustedError } from '../src/ssh-exec.js'

/**
 * 假 ssh2 的共用状态。
 *
 * `plan` 是**每个 exec 一条剧本**的队列：`'full'` = 远端拒绝开通道（额度满），
 * `'ok'` = 正常开一条通道并返回给定输出。`maxConcurrent` 记录「同时打开的通道数」的峰值，
 * 闸门用例靠它断言（而不是靠时序猜）。
 */
const state = vi.hoisted(() => ({
  clients: [] as FakeClientLike[],
  plan: [] as ('ok' | 'full')[],
  output: '',
  /** 通道从打开到关闭的时长：让并发调用真的叠在一起，闸门才有东西可拦。 */
  channelMs: 30,
  open: 0,
  maxConcurrent: 0,
  /** 每条连接上的 exec 次数（断言「第二次用的是新连接」）。 */
  execCounts: [] as number[],
}))

interface FakeClientLike {
  execCalls: string[]
  ended: boolean
  destroyed: boolean
}

vi.mock('ssh2', () => ({
  Client: class extends EventEmitter {
    execCalls: string[] = []
    ended = false
    destroyed = false

    constructor() {
      super()
      state.clients.push(this as unknown as FakeClientLike)
      state.execCounts.push(0)
    }

    connect(): void {
      setTimeout(() => this.emit('ready'), 0)
    }

    end(): void {
      this.ended = true
      setTimeout(() => this.emit('close'), 0)
    }

    destroy(): void {
      this.destroyed = true
    }

    exec(command: string, callback: (error: Error | null | undefined, channel?: unknown) => void): void {
      this.execCalls.push(command)
      state.execCounts[state.clients.indexOf(this as unknown as FakeClientLike)] =
        (state.execCounts[state.clients.indexOf(this as unknown as FakeClientLike)] ?? 0) + 1
      const plan = state.plan.shift() ?? 'ok'
      if (plan === 'full') {
        setTimeout(() => callback(new Error('(SSH) Channel open failure: open failed')), 0)
        return
      }
      state.open += 1
      state.maxConcurrent = Math.max(state.maxConcurrent, state.open)
      const channel = new EventEmitter() as EventEmitter & {
        stderr: EventEmitter
        signal: () => void
        close: () => void
        end: () => void
      }
      channel.stderr = new EventEmitter()
      channel.signal = () => {}
      channel.close = () => {}
      channel.end = () => {}
      setTimeout(() => {
        callback(null, channel)
        setTimeout(() => {
          if (state.output !== '') channel.emit('data', Buffer.from(state.output))
          state.open -= 1
          channel.emit('close', 0)
        }, state.channelMs)
      }, 0)
    }
  },
}))

const SPEC = { host: 'h', port: 22, username: 'u', auth: 'agent' as const }

/** 收集 warn：额度满必须留下痕迹（否则事后无从判断「插件自己重建过一次」）。 */
function collector(): { info: (msg: string) => void; warn: (msg: string) => void; warns: string[] } {
  const warns: string[] = []
  return { warns, info: () => {}, warn: (msg) => warns.push(msg) }
}

beforeEach(() => {
  // auth=agent 缺 SSH_AUTH_SOCK 时 buildConnectConfig 会先抛（与 ssh-proxy-command.test.ts 同款）
  vi.stubEnv('SSH_AUTH_SOCK', '/tmp/dsh-test-agent.sock')
  state.clients.length = 0
  state.plan.length = 0
  state.output = 'ok\n'
  state.channelMs = 30
  state.open = 0
  state.maxConcurrent = 0
  state.execCounts.length = 0
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('ShortChannelGate：短命令并发不得越过余量', () => {
  it('上限内直接放行，超出的排队等名额', async () => {
    const gate = new ShortChannelGate(1)
    const first = await gate.acquire()
    expect(gate.inUse).toBe(1)

    let secondDone = false
    const second = gate.acquire().then((release) => {
      secondDone = true
      return release
    })
    await Promise.resolve()
    expect(secondDone).toBe(false)
    expect(gate.queued).toBe(1)

    first()
    const releaseSecond = await second
    expect(gate.inUse).toBe(1)
    expect(gate.queued).toBe(0)
    releaseSecond()
    expect(gate.inUse).toBe(0)
  })

  it('名额是转交而不是「先减后加」：新来的调用抢不走刚释放的名额', async () => {
    const gate = new ShortChannelGate(1)
    const first = await gate.acquire()
    const waiting = gate.acquire()
    await Promise.resolve()

    // 释放的同一 tick 里再来一个 acquire：它必须排队，不能和等待者同时拿到名额
    first()
    let freshDone = false
    void gate.acquire().then((release) => {
      freshDone = true
      return release
    })
    const releaseWaiting = await waiting
    expect(gate.inUse).toBe(1)
    await Promise.resolve()
    expect(freshDone).toBe(false)
    releaseWaiting()
  })

  it('dispose 放行全部等待者（卸载路径不能让命令永远挂着）', async () => {
    const gate = new ShortChannelGate(1)
    const first = await gate.acquire()
    const waiting = gate.acquire()
    await Promise.resolve()
    expect(gate.queued).toBe(1)
    gate.dispose()
    const release = await waiting
    expect(typeof release).toBe('function')
    first()
  })
})

describe('RemoteExec：额度满 → 重建连接 + 重试一次', () => {
  it('短命令并发被闸门收在 2 条（第 3 条排队，而不是去撞 MaxSessions）', async () => {
    const log = collector()
    const exec = new RemoteExec(log, { get: () => undefined, record: () => {} })
    state.plan.push('ok', 'ok', 'ok')
    state.channelMs = 40

    const results = await Promise.all([
      exec.run(SPEC, ['docker', 'ps']),
      exec.run(SPEC, ['docker', 'inspect', 'a']),
      exec.run(SPEC, ['docker', 'logs', '--tail', '200', 'a']),
    ])

    expect(results.map((item) => item.stdout)).toEqual(['ok\n', 'ok\n', 'ok\n'])
    // 三条命令共用一个连接、但**同时**打开的通道不超过 2 条
    expect(state.clients).toHaveLength(1)
    expect(state.maxConcurrent).toBe(2)
    exec.disposeAll()
  })

  /**
   * 反向验证：闸门真的是那个「2」在起作用，而不是假 Client 的时序凑巧。
   * 把上限调大，同样三条命令就会真的叠成 3 条并发通道——**这正是没有闸门时的现场**，
   * 也是 8 条长流在场时第 3 条短命令被远端拒绝的原因（D150）。
   */
  it('上限可覆盖（排障口子），调大后并发随之上升——证明拦人的是闸门本身', async () => {
    vi.stubEnv('DSH_DOCKER_SHORT_CHANNELS', '10')
    const exec = new RemoteExec(collector(), { get: () => undefined, record: () => {} })
    state.plan.push('ok', 'ok', 'ok')
    state.channelMs = 40

    await Promise.all([
      exec.run(SPEC, ['docker', 'ps']),
      exec.run(SPEC, ['docker', 'inspect', 'a']),
      exec.run(SPEC, ['docker', 'logs', '--tail', '200', 'a']),
    ])

    expect(state.maxConcurrent).toBe(3)
    exec.disposeAll()
  })

  it('disposeAll 放行排队中的命令（卸载不能让它们永远挂在闸门上）', async () => {
    const exec = new RemoteExec(collector(), { get: () => undefined, record: () => {} })
    state.plan.push('ok', 'ok', 'ok')
    state.channelMs = 40

    const calls = [
      exec.run(SPEC, ['docker', 'ps']),
      exec.run(SPEC, ['docker', 'inspect', 'a']),
      exec.run(SPEC, ['docker', 'logs', '--tail', '200', 'a']),
    ]
    // 让前两条真的占住名额、第三条排进队列
    await new Promise((resolve) => setTimeout(resolve, 5))
    exec.disposeAll()

    const results = await Promise.all(calls)
    expect(results.map((item) => item.stdout)).toEqual(['ok\n', 'ok\n', 'ok\n'])
  })

  it('通道被拒：丢掉并关闭旧连接、换新连接重试，命令照样成功', async () => {
    const log = collector()
    const exec = new RemoteExec(log, { get: () => undefined, record: () => {} })
    state.plan.push('full', 'ok')

    const result = await exec.run(SPEC, ['docker', 'logs', '--tail', '200', 'a'])

    expect(result.stdout).toBe('ok\n')
    expect(state.clients).toHaveLength(2)
    // D07 的教训：丢连接必须**真的关掉**，只摘出池会让 keepalive 一直养着它
    expect(state.clients[0]?.ended).toBe(true)
    expect(state.execCounts[0]).toBe(1)
    expect(state.execCounts[1]).toBe(1)
    expect(log.warns.join('\n')).toContain('通道额度已满')
    exec.disposeAll()
  })

  it('重连后仍被拒：只重试一次，且文案仍指向可操作步骤', async () => {
    const log = collector()
    const exec = new RemoteExec(log, { get: () => undefined, record: () => {} })
    // 第三条剧本故意留着 'ok'：它被消费掉就说明重试不止一次
    state.plan.push('full', 'full', 'ok')

    const error = await exec.run(SPEC, ['docker', 'ps']).then(
      () => null,
      (err: Error) => err,
    )

    expect(error).not.toBeNull()
    expect(error?.message).toContain('Channel open failure')
    // 文案已收短（2026-10-08 用户反馈）：不再堆 OpenSSH 术语，只留「怎么了 + 怎么办」
    expect(error?.message).toContain('通道已满')
    expect(error?.message).toContain('聚合容器数')
    expect(state.clients).toHaveLength(2)
    expect(state.plan).toEqual(['ok'])
    exec.disposeAll()
  })

  it('长流不占短命令闸门，但仍受自身配额约束（两条约束各自独立）', async () => {
    const log = collector()
    const exec = new RemoteExec(log, { get: () => undefined, record: () => {} })
    state.plan.push('ok', 'ok')
    state.channelMs = 40

    const streamed = exec.stream(SPEC, ['docker', 'events'], { onStdout: () => {}, onStderr: () => {} })
    const snapshot = await exec.run(SPEC, ['docker', 'ps'])

    expect(snapshot.stdout).toBe('ok\n')
    expect(await streamed).toEqual({ code: 0 })
    // 一条长流 + 一条短命令 = 两条不同的通道，且只建了一条连接
    expect(state.maxConcurrent).toBe(2)
    expect(state.clients).toHaveLength(1)
    exec.disposeAll()
  })
})

describe('额度满的判定口径', () => {
  it('认 sshd 原话与 ssh2 译文两种形态', () => {
    expect(isChannelExhaustedError('(SSH) Channel open failure: open failed')).toBe(true)
    expect(isChannelExhaustedError('error: no more sessions')).toBe(true)
    expect(isChannelExhaustedError('connect ECONNREFUSED')).toBe(false)
    expect(isChannelExhaustedError('')).toBe(false)
  })
})
