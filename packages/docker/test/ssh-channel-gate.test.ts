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
 *
 * ## 并发用例不赌墙钟（2026-10-25 改）
 *
 * 原来这几条用例靠 `channelMs = 40` 制造重叠：通道 40ms 后自动关，于是「峰值」取决于三次调用
 * 是否落在同一个窗口里。那是**赌墙钟**——`pnpm flake:check` 把机器压到 2× 超订时，一次 >40ms
 * 的调度停顿就能把峰值从 3 压成 2，实测出现过 3 跑 1 红。
 *
 * 现在改成**手动放行**（`state.manual` + `releaseHeld()`）+ **事件等待**（`waitOpen(n)`）：
 * 通道不关，闸门的名额就不会释放，「第 3 条被挡住」由 `open === 2` 这个事实断言，而不是由
 * 「等得够不够久」推断。等待点自带 5s 兜底，坏了会红在**具体那一步**（并报当前计数），
 * 而不是挂在 20s 的用例超时上只看到「超时」。
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
  /** 自动关闭模式下通道从打开到关闭的时长（只在 `manual === false` 时用）。 */
  channelMs: 30,
  open: 0,
  maxConcurrent: 0,
  /** 每条连接上的 exec 次数（断言「第二次用的是新连接」）。 */
  execCounts: [] as number[],
  /**
   * **手动放行**模式：`true` 时通道不按 {@link channelMs} 自动关，必须由 {@link releaseHeld} 放行。
   *
   * 为什么要有：并发用例要断言的是「峰值」，而峰值若靠「三次 exec 是否落在同一个 40ms 窗口
   * 里」来达成，就变成**赌墙钟**——`pnpm flake:check` 把机器压到 2× 超订时，一次 >40ms 的
   * 调度停顿就能把峰值从 3 压成 2（2026-10-25 实测过一次 3 跑 1 红）。手动模式让峰值只取决于
   * 闸门本身：没放行之前通道不会关，名额也就不会释放。
   */
  manual: false,
  /** 手动模式下「已打开、等测试放行」的通道关闭器（顺序 = 打开顺序）。 */
  held: [] as Array<() => void>,
  /** 「同时打开的通道数 ≥ N」的等待者（事件驱动，不轮询墙钟）。 */
  openWaiters: [] as Array<{ count: number; resolve: () => void }>,
  /**
   * 用例代次：每条用例 +1。通道关闭时只在**同代**里回退 {@link open} 计数。
   *
   * 为什么要有：上一条用例若因为断言失败提前退出，它那些 `setTimeout(finish)` 仍会在下一条
   * 用例里落地，把新用例的 `open` 减成负数（于是 `waitOpen(2)` 永远等不到）。跨用例的状态
   * 污染本身就难定位，不该再叠一层。
   */
  generation: 0,
}))

/**
 * 等到「同时打开的通道数 ≥ `count`」：已到则立刻 resolve。
 *
 * 用**事件**而不是 `setTimeout(40)` 等：正常路径上它只会等几百微秒，负载下也只是多等一会儿，
 * 不会因为「等得不够久」把一条错的断言判成对。真出问题（闸门不放行）时超时兜底 5s，
 * 报在**等待点**并带上当前计数——好过挂在 20s 的用例超时上、只看到「超时」。
 */
function waitOpen(count: number): Promise<void> {
  if (state.open >= count) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`等同时打开的通道数到 ${count} 超时（当前 ${String(state.open)}）`))
    }, 5_000)
    state.openWaiters.push({
      count,
      resolve: () => {
        clearTimeout(timer)
        resolve()
      },
    })
  })
}

/**
 * 放行手动模式下已打开的全部通道（幂等：已关过的不会被关第二次）。
 *
 * 同时把 `manual` 关掉：`held` 里只有「回调已经交给插件」的通道，而 `waitOpen` 在**计数自增**
 * 那一刻就 resolve（早于回调交付），所以紧接着的 `releaseHeld()` 可能一个都还没登记。
 * 关闭手动模式让那些还在路上的通道走自动关闭路径，否则它们的 `run` 永远不 settle（实测：4 条
 * 用例一起挂到 20s 超时）。放行之后本用例也不再需要「通道不关」这个性质了。
 */
function releaseHeld(): void {
  state.manual = false
  for (const close of state.held.splice(0)) close()
}

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
      // 这条通道属于哪一代用例：跨代关闭不许动新用例的计数（见 state.generation）
      const generation = state.generation
      // 事件驱动地叫醒 waitOpen：计数器一到就 resolve，不等任何墙钟
      state.openWaiters = state.openWaiters.filter((waiter) => {
        if (state.open < waiter.count) return true
        waiter.resolve()
        return false
      })
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
        let closed = false
        const finish = (): void => {
          if (closed) return
          closed = true
          if (state.output !== '') channel.emit('data', Buffer.from(state.output))
          // 关闭事件照发（旧 promise 要能 settle），但计数只在同代里回退
          if (generation === state.generation) state.open -= 1
          channel.emit('close', 0)
        }
        if (state.manual) state.held.push(finish)
        else setTimeout(finish, state.channelMs)
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
  // 上一条用例若留了没放行的通道，先放掉再清账：否则它的 run 永远不 settle，会漏进下一条用例
  // （状态污染型的「红」最难定位，而这里本来就不该有残留）。
  releaseHeld()
  state.clients.length = 0
  state.plan.length = 0
  state.output = 'ok\n'
  state.channelMs = 30
  state.open = 0
  state.maxConcurrent = 0
  state.execCounts.length = 0
  state.manual = false
  state.openWaiters.length = 0
  state.generation += 1
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
    // 手动放行：通道只由测试关，于是「第 3 条有没有被挡住」不再取决于三次调用是否落在同一个窗口里
    state.manual = true

    const results = Promise.all([
      exec.run(SPEC, ['docker', 'ps']),
      exec.run(SPEC, ['docker', 'inspect', 'a']),
      exec.run(SPEC, ['docker', 'logs', '--tail', '200', 'a']),
    ])

    // 前两条真的占到名额——这是**事件**（open 计数到 2），不是「等 40ms 大概到了」
    await waitOpen(2)
    // 第三条此刻必须还挡在门外：真放进来了，open 就会是 3
    expect(state.open).toBe(2)

    releaseHeld()
    await waitOpen(1)
    releaseHeld()

    const settled = await results
    expect(settled.map((item) => item.stdout)).toEqual(['ok\n', 'ok\n', 'ok\n'])
    // 三条命令共用一个连接、但**同时**打开的通道不超过 2 条
    expect(state.clients).toHaveLength(1)
    expect(state.maxConcurrent).toBe(2)
    exec.disposeAll()
  })

  /**
   * 反向验证：闸门真的是那个「2」在起作用，而不是假 Client 的时序凑巧。
   * 把上限调大，同样三条命令就会真的叠成 3 条并发通道——**这正是没有闸门时的现场**，
   * 也是 8 条长流在场时第 3 条短命令被远端拒绝的原因（D150）。
   *
   * 断言「三条同时打开」靠的是 `waitOpen(3)`（事件），不是「三次调用都在 40ms 内发出」——
   * 后者在超订机器上会把一条正确的实现判成红。
   */
  it('上限可覆盖（排障口子），调大后并发随之上升——证明拦人的是闸门本身', async () => {
    vi.stubEnv('DSH_DOCKER_SHORT_CHANNELS', '10')
    const exec = new RemoteExec(collector(), { get: () => undefined, record: () => {} })
    state.plan.push('ok', 'ok', 'ok')
    state.manual = true

    const results = Promise.all([
      exec.run(SPEC, ['docker', 'ps']),
      exec.run(SPEC, ['docker', 'inspect', 'a']),
      exec.run(SPEC, ['docker', 'logs', '--tail', '200', 'a']),
    ])

    // 上限若真的还是 2，这里会等到 5s 超时并报「当前 2」——比一条时红时绿的断言更好定位
    await waitOpen(3)
    expect(state.maxConcurrent).toBe(3)

    releaseHeld()
    await results
    exec.disposeAll()
  })

  it('disposeAll 放行排队中的命令（卸载不能让它们永远挂在闸门上）', async () => {
    const exec = new RemoteExec(collector(), { get: () => undefined, record: () => {} })
    state.plan.push('ok', 'ok', 'ok')
    state.manual = true

    const calls = [
      exec.run(SPEC, ['docker', 'ps']),
      exec.run(SPEC, ['docker', 'inspect', 'a']),
      exec.run(SPEC, ['docker', 'logs', '--tail', '200', 'a']),
    ]
    // 前两条真的占住名额、第三条排进队列（事件等待，不是「睡 5ms 大概就够了」）
    await waitOpen(2)
    exec.disposeAll()

    // 被放行的第三条会新开一条连接与通道；再放行三条通道，三个 promise 才收尾
    await waitOpen(3)
    releaseHeld()

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
    expect(state.clients[0]?.ended, 'D07：被替换的旧连接必须真的 end()（只摘出池会泄漏一条被 keepalive 养着的连接）').toBe(true)
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
    state.manual = true

    const streamed = exec.stream(SPEC, ['docker', 'events'], { onStdout: () => {}, onStderr: () => {} })
    await waitOpen(1)
    const snapshot = exec.run(SPEC, ['docker', 'ps'])
    // 短命令**没有**排在长流后面：两条通道同时在开，且只建了一条连接（事件等待，不靠窗口）
    await waitOpen(2)

    releaseHeld()
    expect((await snapshot).stdout).toBe('ok\n')
    expect(await streamed).toEqual({ code: 0 })
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
