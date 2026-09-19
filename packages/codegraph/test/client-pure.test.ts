import { describe, expect, it } from 'vitest'

import { REL_LIMIT, nextRetryDelayMs, staleReasons, truncationNote } from '../client-src/pure.js'

/*
 * 浏览器半体的纯逻辑测试（首次给 client-src 配上单测）。
 *
 * 为什么只有这几个函数：client-src/index.js 剩下的部分都要 React / DOM 才能跑，而仓库的
 * 测试底座（vitest.config.ts）刻意只收宿主半体、也没装 react / jsdom。纯判定抽到
 * client-src/pure.js 后可以在这里直接测——CG11 / CG15 / CG17 三条修复的判定核心从此有了
 * 自动化防线，不再只靠「人工点卡片」。
 *
 * 注意：本文件 import 的是**源码** pure.js，不是构建产物 client.js。产物那一侧由 CI 的
 * artifact-diff（构建前后 git diff）与 scripts/build-client.mjs 里的残留 import 检查兜住。
 */

describe('CG11：staleReasons 汇总 CLI 的过期信号', () => {
  it('四个信号全在顶层时报全四条', () => {
    expect(staleReasons({
      reindexRecommended: true,
      version: '1.6.0',
      builtWithVersion: '1.1.1',
      builtWithExtractionVersion: 24,
      currentExtractionVersion: 25,
      worktreeMismatch: true,
    })).toEqual([
      'CLI 建议重建索引（reindexRecommended）',
      '索引由 CLI 1.1.1 构建，当前 CLI 是 1.6.0',
      '索引的提取器版本 24 已落后于当前的 25',
      '索引与当前 worktree 不匹配',
    ])
  })

  it('嵌套在 index.* 下时同样读到（CLI 版本间字段位置有差异）', () => {
    const reasons = staleReasons({
      version: '1.6.0',
      index: {
        reindexRecommended: true,
        builtWithVersion: '1.1.1',
        builtWithExtractionVersion: 24,
        currentExtractionVersion: 25,
        worktreeMismatch: true,
      },
    })
    expect(reasons).toHaveLength(4)
  })

  it('CLI 版本一致时不报版本漂移（只比字符串，不做版本序比较）', () => {
    expect(staleReasons({ version: '1.6.0', builtWithVersion: '1.6.0' })).toEqual([])
  })

  it('提取器版本相等或更新时不报（只有严格落后才算）', () => {
    const base = { builtWithExtractionVersion: 25, currentExtractionVersion: 25 }
    expect(staleReasons(base)).toEqual([])
    expect(staleReasons({ builtWithExtractionVersion: 26, currentExtractionVersion: 25 })).toEqual([])
  })

  it('健康索引 / 非对象入参都返回空数组（面板据此不渲染警告行）', () => {
    expect(staleReasons({ version: '1.6.0', index: { reindexRecommended: false } })).toEqual([])
    expect(staleReasons(null)).toEqual([])
    expect(staleReasons(undefined)).toEqual([])
    expect(staleReasons('boom')).toEqual([])
  })

  it('真值不是布尔 true 时不算信号（CLI 给字符串 "true" 不该误报）', () => {
    expect(staleReasons({ reindexRecommended: 'true', worktreeMismatch: 1 })).toEqual([])
  })

  it('index 字段不是对象时退回顶层读，不抛错', () => {
    expect(staleReasons({ index: 'oops', reindexRecommended: true })).toEqual([
      'CLI 建议重建索引（reindexRecommended）',
    ])
  })
})

describe('CG15：nextRetryDelayMs 的退避阶梯', () => {
  it('从 1s 起步', () => {
    expect(nextRetryDelayMs(0)).toBe(1_000)
  })

  it('逐次翻倍', () => {
    expect(nextRetryDelayMs(1_000)).toBe(2_000)
    expect(nextRetryDelayMs(2_000)).toBe(4_000)
    expect(nextRetryDelayMs(8_000)).toBe(16_000)
  })

  it('封顶 30s，且到顶后稳定不再增长', () => {
    expect(nextRetryDelayMs(16_000)).toBe(30_000)
    expect(nextRetryDelayMs(30_000)).toBe(30_000)
    expect(nextRetryDelayMs(60_000)).toBe(30_000)
  })

  it('走满整条阶梯：0 → 1s → 2s → 4s → 8s → 16s → 30s → 30s', () => {
    const ladder = [0]
    // 起始 0（首次失败）之上要走 7 步才到「封顶后再一次」：1s→2s→4s→8s→16s→30s→30s
    for (let index = 0; index < 7; index++) ladder.push(nextRetryDelayMs(ladder[index]))
    expect(ladder).toEqual([0, 1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000])
  })
})

describe('CG17：truncationNote 不再静默截断', () => {
  it('超出上限时报出「已显示前 N 条，共 M 条」', () => {
    expect(truncationNote(31, REL_LIMIT)).toBe('已显示前 30 条，共 31 条')
    expect(truncationNote(500, REL_LIMIT)).toBe('已显示前 30 条，共 500 条')
  })

  it('恰好等于上限时不提示（全部都在，没有截断）', () => {
    expect(truncationNote(REL_LIMIT, REL_LIMIT)).toBe('')
  })

  it('未超上限（含空列表）时不提示', () => {
    expect(truncationNote(0, REL_LIMIT)).toBe('')
    expect(truncationNote(29, REL_LIMIT)).toBe('')
  })

  it('上限是 30（与 relList 的 slice(0, REL_LIMIT) 同源，改一处即两边同步）', () => {
    expect(REL_LIMIT).toBe(30)
  })
})
