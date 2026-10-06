/**
 * SFTP 下载断点续传的决策规则（`client-src/download-resume.js`）。
 *
 * 为什么有这份测试：这条规则决定「从哪个字节接着下」——判错了拼出来的文件**悄悄是坏的**，
 * 比下载失败严重得多，而它在浏览器里只有真断一次网才看得出来。所以规则抽成纯函数在这里
 * 逐条钉边界（与 `ws-url` / `status-line` / `tunnel-edit` 同款）。
 *
 * 反向也钉住：**用户点 ✕ 之后不许自动续**——那是无视用户意图，比不续传更烦人。
 */
import { describe, expect, it } from 'vitest'
import { advanceReceived, MAX_RESUME_ATTEMPTS, planResume } from '../client-src/download-resume.js'

describe('planResume', () => {
  it('有进度、总量未知 → 从已收字节续（正常的断线现场）', () => {
    expect(planResume({ received: 4096, total: null, attempt: 1 })).toEqual({ resume: true, offset: 4096 })
  })

  it('有进度、总量已知且没收满 → 从已收字节续', () => {
    expect(planResume({ received: 1000, total: 5000, attempt: 1 })).toEqual({ resume: true, offset: 1000 })
    expect(planResume({ received: 4999, total: 5000, attempt: 2 })).toEqual({ resume: true, offset: 4999 })
  })

  it('**用户主动取消 → 一律不续**（✕ 的语义是「不要了」）', () => {
    expect(planResume({ received: 9999, total: 100000, attempt: 1, canceled: true })).toEqual({ resume: false, reason: 'canceled' })
    // 取消优先于其它一切判定（哪怕已经收满、哪怕还在重试预算内）
    expect(planResume({ received: 100000, total: 100000, attempt: 1, canceled: true }).reason).toBe('canceled')
  })

  it('零进度 → 不续（从 0 续等于重来，没有意义）', () => {
    expect(planResume({ received: 0, total: 5000, attempt: 1 })).toEqual({ resume: false, reason: 'noProgress' })
    expect(planResume({ received: -1, total: 5000, attempt: 1 }).reason).toBe('noProgress')
    expect(planResume({ received: NaN, total: 5000, attempt: 1 }).reason).toBe('noProgress')
  })

  it('重试预算用尽 → 不续（不许把一次故障变成一场拉锯）', () => {
    const maxAttempts = MAX_RESUME_ATTEMPTS
    expect(planResume({ received: 10, total: 100, attempt: maxAttempts }).resume).toBe(true)
    expect(planResume({ received: 10, total: 100, attempt: maxAttempts + 1 })).toEqual({ resume: false, reason: 'attemptsExhausted' })
    // 可覆盖：调用方传更小的预算时按它算
    expect(planResume({ received: 10, total: 100, attempt: 2, maxAttempts: 1 }).reason).toBe('attemptsExhausted')
  })

  it('已经收满 → 不续（那不是断线，是终态判错）', () => {
    expect(planResume({ received: 5000, total: 5000, attempt: 1 })).toEqual({ resume: false, reason: 'complete' })
    expect(planResume({ received: 6000, total: 5000, attempt: 1 }).reason).toBe('complete')
  })

  it('total 为 0 / 非有限值时按「未知」处理（空文件不是断线）', () => {
    expect(planResume({ received: 100, total: 0, attempt: 1 })).toEqual({ resume: true, offset: 100 })
    expect(planResume({ received: 100, total: NaN, attempt: 1 })).toEqual({ resume: true, offset: 100 })
    expect(planResume({ received: 100, total: undefined, attempt: 1 })).toEqual({ resume: true, offset: 100 })
  })

  it('attempt 不是正整数 → 不续（调用方算错了，别猜）', () => {
    expect(planResume({ received: 10, total: 100, attempt: 0 }).reason).toBe('badAttempt')
    expect(planResume({ received: 10, total: 100, attempt: undefined }).reason).toBe('badAttempt')
  })
})

describe('advanceReceived', () => {
  it('把本段长度累加到此前已收之上（续传的累加口径）', () => {
    expect(advanceReceived(1000, 500)).toBe(1500)
    // 首试：此前为 0
    expect(advanceReceived(0, 500)).toBe(500)
  })

  it('垃圾输入按 0 处理（不产生 NaN 偏移）', () => {
    expect(advanceReceived(undefined, 500)).toBe(500)
    expect(advanceReceived(1000, undefined)).toBe(1000)
    expect(advanceReceived(NaN, NaN)).toBe(0)
    expect(advanceReceived(-5, -5)).toBe(0)
  })
})
