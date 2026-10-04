/**
 * `packages/tty/scripts/lib/crash-trace.mjs` 的用例 —— 崩溃诊断留痕。
 *
 * ## 为什么有这份用例
 *
 * 起因（2026-10-04）：CI 的 Windows 腿上 `windows-smoke` 以 `0xC0000374`
 * （Windows 堆损坏）退出，**W1–W5 全 PASS 而日志里连 `[W6]` 都没有**。根因是
 * Node 官方规定的一个平台差异——**Windows 上 stdout 到管道是异步的**（Linux/macOS 同步）：
 * `console.log('[W6] …')` 只把字节交给 libuv 写队列，进程原生崩溃那一刻队列一起没了。
 *
 * 于是留痕改成 `fs.writeSync(1, …)`（同步落管道）。这组用例守三件事：
 *
 * 1. **同步写真的绕开缓冲**——注入一个假 `writeSync`，断言它被**逐行**调用（而不是攒着）；
 * 2. **阶段配对是「崩溃点」的判据**——`enter` 没配对 `leave` 的那个阶段就是崩溃最可能的位置。
 *    这条比「只记走到哪」强：它能区分「崩在该阶段内部」与「该阶段跑完了、崩在下个入口之前」，
 *    而 2026-10-04 那次正是后者（W5 的 leave 打没打出来，直接决定结论）。
 * 3. **写失败不许成为新的失败源**——留痕跑在「主流程可能已经出问题」的场景里，
 *    此时 fd 1 可能已不可写（管道对端没了）；吞掉异常、主流程照旧。
 *
 * 全部走注入，不真写 stdout、不依赖平台。
 */
import { describe, expect, it } from 'vitest'

import {
  TRACE_PREFIX,
  createPhaseTracer,
  describeCrashPoint,
  traceSync,
} from '../scripts/lib/crash-trace.mjs'

/** 假 writeSync：记录每次调用（fd + 内容），不真写。 */
function fakeWrite() {
  const calls = []
  return { calls, writeSyncImpl: (fd, text) => calls.push({ fd, text }) }
}

describe('traceSync：同步直写 fd 1，绕开 stream 缓冲', () => {
  it('写到 fd 1，带固定前缀与结尾换行', () => {
    const { calls, writeSyncImpl } = fakeWrite()
    expect(traceSync('W6 入口', { writeSyncImpl })).toBe(true)
    expect(calls).toEqual([{ fd: 1, text: `${TRACE_PREFIX} W6 入口\n` }])
  })

  it('**每次调用就写一次**（不是攒着——攒着正是 console.log 在 Windows 上丢字节的原因）', () => {
    const { calls, writeSyncImpl } = fakeWrite()
    traceSync('第一行', { writeSyncImpl })
    traceSync('第二行', { writeSyncImpl })
    expect(calls).toHaveLength(2)
    expect(calls[0].text).toContain('第一行')
    expect(calls[1].text).toContain('第二行')
  })

  it('**写失败吞掉、返回 false、不抛**（留痕不该成为新的失败源）', () => {
    const boom = () => {
      throw new Error('EPIPE: broken pipe')
    }
    expect(() => traceSync('x', { writeSyncImpl: boom })).not.toThrow()
    expect(traceSync('x', { writeSyncImpl: boom })).toBe(false)
  })

  it('非字符串入参也照写（诊断留痕不该因为类型挑剔而丢信息）', () => {
    const { calls, writeSyncImpl } = fakeWrite()
    traceSync(42, { writeSyncImpl })
    expect(calls[0].text).toContain('42')
  })
})

describe('createPhaseTracer：enter 没配对 leave 的阶段 = 崩溃点', () => {
  /** 注入时钟，让时间戳可预测。 */
  function tracer() {
    const { calls, writeSyncImpl } = fakeWrite()
    let clock = 1000
    const t = createPhaseTracer({
      trace: (m) => traceSync(m, { writeSyncImpl }),
      now: () => clock,
    })
    return { t, calls, tick: (ms) => { clock += ms } }
  }

  it('enter / leave 各写一行，并带自启动毫秒数', () => {
    const { t, calls, tick } = tracer()
    t.enter('W5')
    tick(120)
    t.leave('W5')
    expect(calls[0].text).toContain('+0ms enter｜栈：W5')
    expect(calls[1].text).toContain('+120ms leave W5（用了 120ms）')
  })

  it('**每行自带完整栈**（原生崩溃时 exit 钩子不触发，最后一行必须自带诊断）', () => {
    const { t, calls } = tracer()
    t.enter('W5')
    t.enter('W6')
    // 崩在这里——不会再有 leave，也不会有收尾钩子
    expect(calls[1].text, 'enter 行要写出整个栈').toContain('栈：W5 → W6')
    expect(calls[0].text).toContain('栈：W5')
  })

  it('栈清空后渲染成「（空）」——空栈本身是信息（崩在所有阶段之外）', () => {
    const { t, calls } = tracer()
    t.enter('W5')
    t.leave('W5')
    expect(calls[1].text).toContain('栈：（空）')
  })

  it('**enter 后没 leave → snapshot 里还在**（这正是崩溃点的判据）', () => {
    const { t } = tracer()
    t.enter('W5')
    t.leave('W5')
    t.enter('W6')
    expect(t.snapshot()).toEqual(['W6'])
  })

  it('嵌套阶段按后进先出记栈', () => {
    const { t, calls } = tracer()
    t.enter('外层')
    t.enter('内层')
    t.leave('内层')
    t.leave('外层')
    expect(calls[0].text).toContain('栈：外层')
    expect(calls[1].text).toContain('栈：外层 → 内层')
    expect(calls[2].text).toContain('栈：外层')
    expect(calls[3].text).toContain('栈：（空）')
    expect(t.snapshot()).toEqual([])
  })

  it('leave 一个没 enter 过的阶段：照记（配对错了本身就是信息），不抛', () => {
    const { t, calls } = tracer()
    expect(() => t.leave('从没进入过')).not.toThrow()
    expect(calls[0].text).toContain('leave 从没进入过')
    expect(calls[0].text).toContain('用了 ?ms')
  })

  it('同名阶段重复 enter 时，leave 摘最后一个（栈语义）', () => {
    const { t } = tracer()
    t.enter('同名')
    t.enter('同名')
    t.leave('同名')
    expect(t.snapshot()).toEqual(['同名'])
  })

  it('正常跑完全部阶段后 snapshot 为空', () => {
    const { t } = tracer()
    for (const label of ['W1', 'W2', 'W3']) {
      t.enter(label)
      t.leave(label)
    }
    expect(t.snapshot()).toEqual([])
  })
})

describe('describeCrashPoint：把崩溃点说成人话', () => {
  it('有未配对阶段 → 点名它，并解释 enter/leave 两种含义', () => {
    const text = describeCrashPoint({ openPhases: ['W6 tty_send'], exitCode: 1 })
    expect(text).toContain('W6 tty_send')
    expect(text).toContain('未配对离开')
    expect(text, '要能区分「内部」与「下一个入口之前」').toContain('内部')
    expect(text).toContain('下一个阶段入口之前')
  })

  it('全部配对离开 → 明说崩溃在最后一个阶段**之后**（2026-10-04 那次的形态）', () => {
    const text = describeCrashPoint({ openPhases: [], exitCode: 3221226356 })
    expect(text).toContain('最后一个阶段结束之后')
  })

  it('**认得 0xC0000374**（本仓实际遇到的堆损坏），带十六进制与解释', () => {
    const text = describeCrashPoint({ openPhases: ['x'], exitCode: 3221226356 })
    expect(text).toContain('3221226356')
    expect(text).toContain('0xC0000374')
    expect(text).toContain('STATUS_HEAP_CORRUPTION')
  })

  it('也认得 0xC0000005（访问越界）——同类原生崩溃的另一半', () => {
    const text = describeCrashPoint({ openPhases: [], exitCode: 3221225477 })
    expect(text).toContain('0xC0000005')
    expect(text).toContain('STATUS_ACCESS_VIOLATION')
  })

  it('不认识的退出码只报数，不硬解释', () => {
    const text = describeCrashPoint({ openPhases: [], exitCode: 3 })
    expect(text).toContain('退出码：3（0x3）')
    expect(text).not.toContain('STATUS_')
  })

  it('不给退出码也照常渲染（看门狗路径可能拿不到）', () => {
    const text = describeCrashPoint({ openPhases: ['W3'] })
    expect(text).toContain('W3')
    expect(text).not.toContain('退出码')
  })
})
