/**
 * tmux 探测/列举的两条纪律（D80 / D81）：
 *
 *   - **超时 = 没探明白**，不是「没装」：补探一次、结论不进 30s 缓存、原因如实带出去；
 *   - **探不明白 ≠ 空清单**：会话清单拿不到时返回 `undefined`，不伪装成权威的「没有」。
 *
 * 用注入缝造这些情形：CI 上未必装了 tmux，而这两条恰恰只有在「能造出超时」时才被覆盖
 * ——修复前它们在真机上表现为「启动争抢期一次慢探测 → 一批持久标签静默降级」。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { listTmuxSessions, probeTmux, setTmuxExecForTest } from '../src/tmux.js'

/** `execFile` 因 timeout 收掉子进程时给的错误形状（killed + signal）。 */
const timeoutError = () => Object.assign(new Error('Command failed: tmux -V'), { killed: true, signal: 'SIGTERM' })

afterEach(() => {
  setTmuxExecForTest()
})

describe('probeTmux：超时不判死（D80）', () => {
  it('两档都超时 → inconclusive，且**不进缓存**（下次调用仍会真的重探）', async () => {
    let calls = 0
    setTmuxExecForTest(async () => {
      calls += 1
      return { error: timeoutError(), stdout: '' }
    })
    const first = await probeTmux()
    expect(first.available).toBe(false)
    expect(first.inconclusive).toBe(true)
    // 超时序列两档都跑过（一次没探明白就补探一次更宽的）
    expect(calls).toBe(2)
    // 不缓存：再探一次仍会真的去探，而不是吃 30s 缓存把「一次机器忙」放大成一批降级
    await probeTmux()
    expect(calls).toBe(4)
  })

  it('首次超时、补探成功 → 报可用并进缓存（机器忙过去即自愈）', async () => {
    let calls = 0
    setTmuxExecForTest(async () => {
      calls += 1
      return calls === 1 ? { error: timeoutError(), stdout: '' } : { stdout: 'tmux 3.4' }
    })
    const probe = await probeTmux()
    expect(probe).toMatchObject({ available: true, passthrough: true })
    expect(probe.inconclusive).toBeUndefined()
    expect(calls).toBe(2)
    // 确定结论照旧进缓存：30s 内不再探
    await probeTmux()
    expect(calls).toBe(2)
  })

  it('确定不可用（ENOENT）→ 不补探，且 30s 内命中缓存', async () => {
    let calls = 0
    setTmuxExecForTest(async () => {
      calls += 1
      return { error: Object.assign(new Error('spawn tmux ENOENT'), { code: 'ENOENT' }), stdout: '' }
    })
    const probe = await probeTmux()
    expect(probe.available).toBe(false)
    expect(probe.inconclusive).toBeUndefined()
    expect(calls).toBe(1) // 确定的结论不浪费补探
    await probeTmux()
    expect(calls).toBe(1) // 命中缓存
  })

  it('版本解析：3.3 起 passthrough（边界两侧）', async () => {
    setTmuxExecForTest(async () => ({ stdout: 'tmux 3.3a' }))
    expect(await probeTmux()).toMatchObject({ available: true, passthrough: true })
    setTmuxExecForTest(async () => ({ stdout: 'tmux 3.2a' }))
    expect(await probeTmux()).toMatchObject({ available: true, passthrough: false })
  })
})

describe('listTmuxSessions：探不明白 ≠ 空清单（D81）', () => {
  it('超时 → undefined（不知道），不伪装成「没有持久会话」', async () => {
    setTmuxExecForTest(async () => ({ error: timeoutError(), stdout: '' }))
    expect(await listTmuxSessions()).toBeUndefined()
  })

  it('确定的「没有 server」（非零退出）→ 空数组（确实没有）', async () => {
    setTmuxExecForTest(async () => ({
      error: Object.assign(new Error('no server running on /tmp/tmux-501/dsh-tty'), { code: 1 }),
      stdout: '',
    }))
    expect(await listTmuxSessions()).toEqual([])
  })

  it('正常输出按行拆分并去掉空行', async () => {
    setTmuxExecForTest(async () => ({ stdout: 'dsh-a\ndsh-b\n\n' }))
    expect(await listTmuxSessions()).toEqual(['dsh-a', 'dsh-b'])
  })
})
