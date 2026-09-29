/**
 * @hyzyn/dsh-docker — SSE 分片合帧器（D151）的回归测试。
 *
 * 这个合帧器是「日志 / 拉取流逐 chunk 一帧」的唯一出口，规则少但每条都影响客户端
 * 看到的字节：
 *   1. 窗口内的多个分片**合并成一帧**（同一通道严格保序、stdout 先于 stderr）；
 *   2. 攒满 maxBytes 立刻推，不让大 chunk 在窗口里多等一拍；
 *   3. `flush()` 幂等、收尾前必须把残帧推出去（`end` 帧要排在它们之后）；
 *   4. `dispose()` 停表并丢残帧——流已经收了，再推只会写进关掉的响应。
 *
 * 时间用假定时器驱动：窗口是 50ms，真睡眠会让用例慢且抖。
 */
import { describe, expect, it, vi, afterEach } from 'vitest'

import { createSseCoalescer } from '../src/index.js'

afterEach(() => {
  vi.useRealTimers()
})

/** 收集帧的桩：每条 (channel, text) 一笔，顺序即推送顺序。 */
function collector(): { frames: Array<[string, string]>; emit: (channel: 'd' | 'e', text: string) => void } {
  const frames: Array<[string, string]> = []
  return { frames, emit: (channel, text) => frames.push([channel, text]) }
}

describe('createSseCoalescer', () => {
  it('窗口内的多个分片合并成一帧，且 stdout 先于 stderr', () => {
    vi.useFakeTimers()
    const { frames, emit } = collector()
    const coalescer = createSseCoalescer({ emit })
    coalescer.push('d', 'a')
    coalescer.push('d', 'b')
    coalescer.push('e', 'x')
    // 窗口没到点：一帧都不许推（这正是「逐 chunk 一帧」被消掉的地方）
    expect(frames).toEqual([])
    vi.advanceTimersByTime(50)
    expect(frames).toEqual([['d', 'ab'], ['e', 'x']])
    coalescer.dispose()
  })

  it('跨窗口分批：每个窗口各推一帧，通道内严格保序', () => {
    vi.useFakeTimers()
    const { frames, emit } = collector()
    const coalescer = createSseCoalescer({ emit })
    coalescer.push('d', '1')
    vi.advanceTimersByTime(50)
    coalescer.push('d', '2')
    coalescer.push('d', '3')
    vi.advanceTimersByTime(50)
    expect(frames).toEqual([['d', '1'], ['d', '23']])
    coalescer.dispose()
  })

  it('攒满 maxBytes 立刻推帧（不等窗口）', () => {
    vi.useFakeTimers()
    const { frames, emit } = collector()
    const coalescer = createSseCoalescer({ emit, maxBytes: 8 })
    coalescer.push('d', '12345')
    expect(frames).toEqual([])
    coalescer.push('d', '67890')
    // 第二个分片把通道攒到 10 字节 ≥ 8 → 当场推，且是合并后的整段
    expect(frames).toEqual([['d', '1234567890']])
    coalescer.push('e', 'err')
    expect(frames).toEqual([['d', '1234567890']])
    vi.advanceTimersByTime(50)
    expect(frames).toEqual([['d', '1234567890'], ['e', 'err']])
    coalescer.dispose()
  })

  it('flush() 幂等：空缓存不推帧，收尾残帧推一次之后不再重复', () => {
    vi.useFakeTimers()
    const { frames, emit } = collector()
    const coalescer = createSseCoalescer({ emit })
    coalescer.flush()
    expect(frames).toEqual([])
    coalescer.push('e', 'tail')
    coalescer.flush()
    coalescer.flush()
    expect(frames).toEqual([['e', 'tail']])
    // flush 之后定时器必须停掉：再前进时间不该冒出第二帧
    vi.advanceTimersByTime(500)
    expect(frames).toEqual([['e', 'tail']])
    coalescer.dispose()
  })

  it('dispose() 丢残帧并停表（客户端已走，残帧不该再写）', () => {
    vi.useFakeTimers()
    const { frames, emit } = collector()
    const coalescer = createSseCoalescer({ emit })
    coalescer.push('d', 'lost')
    coalescer.dispose()
    vi.advanceTimersByTime(500)
    expect(frames).toEqual([])
  })

  it('空分片与非字符串分片被忽略（不进缓存、不排帧）', () => {
    vi.useFakeTimers()
    const { frames, emit } = collector()
    const coalescer = createSseCoalescer({ emit })
    coalescer.push('d', '')
    coalescer.push('e', undefined as unknown as string)
    vi.advanceTimersByTime(500)
    expect(frames).toEqual([])
    coalescer.dispose()
  })
})
