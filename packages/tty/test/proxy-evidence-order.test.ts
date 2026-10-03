/**
 * tty D95 的**确定性**回归：证据晚到时，文案必须带上它。
 *
 * ## 为什么不接着用真进程测（这条为什么独立成文件）
 *
 * 原先这条语义由 `probe.test.ts` 里一个**真 spawn** 的用例守着（夹具
 * [`proxy-late-evidence.mjs`](../scripts/lib/proxy-late-evidence.mjs)）。那个用例断言的是
 * **墙钟**性质——「stderr 必须在 `PROXY_EVIDENCE_GRACE_MS = 200` 内到达」——而它不成立：
 * 实测（2026-10-03，本机，6 份全量套件并发 + 2 个忙循环，各 24 次）含证据率只有 **54%**
 * （含「已退出」100%、出现空话 0%）。54% 正解释了历次「D95 偶尔红」：**不是代码回归，
 * 是断言在赌调度器**。
 *
 * 根因是结构与量纲的双重错配：
 *   - 产品侧那 200ms 窗口是**刻意有界**的（等不到就照手里的写，绝不为等证据把探针拖长），
 *     所以「证据必然到齐」本就不是产品承诺；
 *   - 而夹具要把「孙进程整个 Node 启动」（重负载下 92~136ms）叠在固定 sleep 上，
 *     总延迟会顶到窗口边缘（实测 212~256ms）。
 *
 * ## 这里怎么做到零墙钟依赖
 *
 * `dialProxyCommand` 与 `ProxyCommandDial`（`failure()` / `awaitEvidence()`）**本来就导出**
 * （`src/ssh.ts`），所以**不必改任何产品源码**——用 `vi.mock('node:child_process')` 把顶层导入的
 * `spawn` 换成**受测试完全控制的假 child**，然后由测试**主动**按顺序触发事件：
 *
 *   1. `emit('spawn')` → dial 就绪；
 *   2. `emit('exit', 1)` → 此刻**还没有** stderr（正是 D95 的场景）；
 *   3. `stderr.write(...)` → 证据才到；
 *   4. `awaitEvidence(200)` → 窗口结束，`failure()` 必须已经带上证据。
 *
 * 每一步都在同一 tick 内由测试推进，**不存在「等多久」**，所以负载再高也不会红
 * （同负载下实测 20/20 绿）。同时它比原用例**更强**：断言了「第 2 步那一刻**确实没有**证据」
 * ——那是原用例无法保证的前提（真进程下它可能碰巧已经在窗口内到达，于是断言退化成空的）。
 *
 * ## 分工（两层，互不替代）
 *
 * | 层 | 文件 | 验什么 |
 * |---|---|---|
 * | 全链路（真 spawn） | `probe.test.ts` | 真进程路径不退化、不退回那句空话、有界返回 |
 * | 确定性（假 child） | 本文件 | **顺序**性质：晚到的证据必须被带进文案 |
 */
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dialProxyCommand, setProxyCommandPolicy } from '../src/ssh.js'

/**
 * 一个受测试完全控制的假 child。
 *
 * 形态要与 `dialProxyCommand` 用到的成员对齐：三个 stdio 流、`pid`、`kill`，
 * 以及会被监听的 `spawn` / `exit` / `close` / `error` 事件（来自 EventEmitter）。
 */
function makeFakeChild() {
  const child = new EventEmitter() as EventEmitter & Record<string, unknown>
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.stdin = new PassThrough()
  child.pid = 4242
  child.exitCode = null
  child.signalCode = null
  child.kill = vi.fn(() => true)
  return child
}

let fake: ReturnType<typeof makeFakeChild>

/*
 * 把 `node:child_process` 的 `spawn` 换掉——`src/ssh.ts` 是**顶层具名导入**它，
 * 而 `vi.mock` 能拦截这种情况（2026-10-03 实测确认）。
 *
 * 其余成员保留原样（`spawnSync` 等别处可能用到），只动 `spawn`。
 */
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, spawn: vi.fn(() => fake) }
})

/** 让已排队的微任务 / setImmediate 跑完（不引入任何毫秒级等待）。 */
const tick = () => new Promise((resolve) => setImmediate(resolve))

describe('D95（确定性）：证据晚到时，文案必须带上它', () => {
  afterEach(() => {
    setProxyCommandPolicy({ granted: false, enabled: false })
  })

  it('exit 先到、stderr 后到：awaitEvidence 之前无证据、之后必须带上', async () => {
    setProxyCommandPolicy({ granted: true, enabled: true })
    fake = makeFakeChild()

    const pending = dialProxyCommand({ spec: { host: 'h', username: 'u', proxyCommand: 'echo hi' } })
    fake.emit('spawn')
    const dial = await pending
    // Duplex.from 在销毁时会把 AbortError 抛给底层流，没人接就是进程级未捕获异常
    dial.sock.on('error', () => {})

    // ① 子进程退出——此刻 stderr 还没到（正是 D95 要复现的时序）
    fake.exitCode = 1
    fake.emit('exit', 1, null)
    await tick()

    /*
     * 关键前提断言：这一刻文案里**必须还没有**证据。
     *
     * 这条是原「真进程」用例做不到的——它无法保证证据在那一刻还没到（负载恰好轻时证据就先到了，
     * 于是「等证据」的断言变成空的）。这里由测试自己控制顺序，前提因此是**确定的**。
     */
    expect(dial.failure()?.message).toBe('代理命令已退出（退出码 1）')
    expect(dial.failure()?.message).not.toContain('LATE-EVIDENCE-9')

    // ② 证据现在才到
    fake.stderr.write('LATE-EVIDENCE-9\n')
    await tick()

    // ③ 窗口走完，同一个 failure() 必须已经把晚到的证据带上（D95 的修复点）
    await dial.awaitEvidence(200)
    expect(dial.failure()?.message).toContain('LATE-EVIDENCE-9')
    expect(dial.failure()?.message).toContain('退出码 1')

    dial.dispose()
  })

  it('反向：上传的证据**不需要**——没有 stderr 时不许编出证据来', async () => {
    /*
     * 防「为了过上面那条而让 failure() 无中生有」。同一时序、但全程不写 stderr：
     * 文案必须仍然只有「已退出」+ 退出码，不带任何 stderr 段。
     */
    setProxyCommandPolicy({ granted: true, enabled: true })
    fake = makeFakeChild()

    const pending = dialProxyCommand({ spec: { host: 'h', username: 'u', proxyCommand: 'echo hi' } })
    fake.emit('spawn')
    const dial = await pending
    dial.sock.on('error', () => {})

    fake.exitCode = 3
    fake.emit('exit', 3, null)
    await tick()
    await dial.awaitEvidence(200)

    expect(dial.failure()?.message).toBe('代理命令已退出（退出码 3）')
    expect(dial.failure()?.message).not.toContain('stderr')

    dial.dispose()
  })
})
