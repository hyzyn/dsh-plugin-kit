/**
 * @hyzyn/dsh-tty — 「这次算出来的尺寸能不能发给 PTY」的判据（D79）。
 *
 * 事故（0.22.0，用户报告的截图）：终端面板里非活动标签的 PTY 被压成 **2×2**，长任务
 * 输出按 2 列折行、xterm 不重排历史行 ⇒ 那段 scrollback 永久花屏（`tty_capture` 读出来
 * 也是竖排）。最小复现：agent 开一个会话、**让它不是当前活动标签**，约 2 秒后
 * `stty size` 从 `50 200` 变成 `2 2`。
 *
 * 根因链（本文件的每条用例各钉一环）：
 * 1. agent 开的标签刻意不 `switchTab` ⇒ `termEl` 没进 DOM，但 `term.open(termEl)` 让
 *    `element.parentElement` = 游离的 termEl（truthy），骗过 FitAddon 的守卫 ⇒
 *    `parseInt('auto')` = NaN ⇒ `{cols: NaN, rows: NaN}`；
 * 2. 别的标签正亮着时 `display:none` ⇒ 容器 0 宽 0 高 ⇒ 夹成 `{cols: 2, rows: 1}`；
 * 3. 发帧侧只看 `dims !== undefined`，NaN 也算「有值」⇒ `JSON.stringify` 写成 `null`
 *    ⇒ 宿主 `Number(null)` = 0 是有限数 ⇒ 夹到下限 ⇒ **2×2**。
 *
 * 契约：`usableFitSize()` 在「探测结果不是有限数」「尺寸退化到阈值以下」「宿主元素没有
 * 真实盒子」三种情况下都返回 `undefined`（= 别发），并把这三种混在一起的原因收敛成
 * 一条判据，避免以后再有一处漏判。
 */
import { describe, expect, it } from 'vitest'
import { FALLBACK_COLS, FALLBACK_ROWS, MAX_FIT_COLS, MAX_FIT_ROWS, MIN_FIT_COLS, MIN_FIT_ROWS, boxUsable, usableFitSize } from '../client-src/fit-size.js'

/** 可见容器（终端区真实尺寸）。 */
const VISIBLE = { width: 1200, height: 700 }
/** 隐藏标签：`display:none` 下 clientWidth/clientHeight 都是 0。 */
const HIDDEN = { width: 0, height: 0 }
/** 元素没进 DOM（detached）：同样是 0。 */
const DETACHED = { width: 0, height: 0 }

describe('usableFitSize：可信尺寸才发，其余一律别发（D79）', () => {
  it('可见容器 + 正常尺寸 → 原样放行', () => {
    expect(usableFitSize({ cols: 165, rows: 40 }, VISIBLE)).toEqual({ cols: 165, rows: 40 })
  })

  it('【事故第 1 环】游离元素给 NaN → 不发（曾序列化成 null，被宿主夹成 2×2）', () => {
    expect(usableFitSize({ cols: NaN, rows: NaN }, DETACHED)).toBeUndefined()
  })

  it('【事故第 2 环】隐藏标签给 2×1（FitAddon 的下限）→ 不发', () => {
    expect(usableFitSize({ cols: 2, rows: 1 }, HIDDEN)).toBeUndefined()
  })

  it('尺寸看着正常但容器不可见（别的标签正亮着 / 面板最小化）→ 不发', () => {
    expect(usableFitSize({ cols: 120, rows: 30 }, HIDDEN)).toBeUndefined()
    expect(usableFitSize({ cols: 120, rows: 30 }, null)).toBeUndefined()
    expect(usableFitSize({ cols: 120, rows: 30 }, undefined)).toBeUndefined()
  })

  it('探测结果缺失 / 非有限（Infinity、字符串垃圾）→ 不发', () => {
    expect(usableFitSize(undefined, VISIBLE)).toBeUndefined()
    expect(usableFitSize(null, VISIBLE)).toBeUndefined()
    expect(usableFitSize({ cols: Infinity, rows: 40 }, VISIBLE)).toBeUndefined()
    expect(usableFitSize({ cols: 'abc', rows: 40 }, VISIBLE)).toBeUndefined()
    expect(usableFitSize({}, VISIBLE)).toBeUndefined()
  })

  it('退化阈值：刚好到线放行，差一点不发', () => {
    expect(usableFitSize({ cols: MIN_FIT_COLS, rows: MIN_FIT_ROWS }, VISIBLE)).toEqual({ cols: MIN_FIT_COLS, rows: MIN_FIT_ROWS })
    expect(usableFitSize({ cols: MIN_FIT_COLS - 1, rows: MIN_FIT_ROWS }, VISIBLE)).toBeUndefined()
    expect(usableFitSize({ cols: MIN_FIT_COLS, rows: MIN_FIT_ROWS - 1 }, VISIBLE)).toBeUndefined()
  })

  it('小数向下取整、超上限夹到宿主协议范围（与 clampInt 的 500×200 一致）', () => {
    expect(usableFitSize({ cols: 120.9, rows: 40.7 }, VISIBLE)).toEqual({ cols: 120, rows: 40 })
    expect(usableFitSize({ cols: 1e9, rows: 2e9 }, VISIBLE)).toEqual({ cols: MAX_FIT_COLS, rows: MAX_FIT_ROWS })
  })

  it('只有一维退化的那种也要拦（真实面板不会 300 列 × 1 行）', () => {
    expect(usableFitSize({ cols: 300, rows: 1 }, VISIBLE)).toBeUndefined()
    expect(usableFitSize({ cols: 2, rows: 40 }, VISIBLE)).toBeUndefined()
  })
})

describe('boxUsable：宿主元素有没有真实盒子', () => {
  it('正数才算可用', () => {
    expect(boxUsable(1200, 700)).toBe(true)
    expect(boxUsable(1, 1)).toBe(true)
  })

  it('0 / 负数 / 非有限 / 缺失都不可用（display:none 与未挂载都是 0）', () => {
    for (const bad of [
      [0, 700],
      [1200, 0],
      [0, 0],
      [-1, 700],
      [1200, -1],
      [NaN, 700],
      [1200, NaN],
      [Infinity, 700],
      [undefined, 700],
      [1200, undefined],
    ]) {
      expect(boxUsable(bad[0], bad[1]), `boxUsable(${String(bad[0])}, ${String(bad[1])}) 应为 false`).toBe(false)
    }
  })
})

describe('spawn 回落常量（与宿主 clampInt 缺省值一致）', () => {
  it('80×24：容器不可用且没有历史尺寸时用这一对，而不是退化的 2×N', () => {
    expect([FALLBACK_COLS, FALLBACK_ROWS]).toEqual([80, 24])
  })
})
