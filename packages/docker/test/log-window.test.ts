/**
 * @hyzyn/dsh-docker — 日志窗口化布局（log-window.js，D152）的回归测试。
 *
 * 这份纯逻辑决定「挂哪几十行」，四条规则错了都会在真机上表现为滚动错位，所以逐条钉住：
 *   1. 实测高度进缓存、没量过的行用估算值；
 *   2. `layout` 非贴底时按 scrollTop / 视口高度定位窗口，上下各留 overscan，垫高与总高自洽；
 *   3. `layout` 贴底（pinned）时窗口锚到列表尾部、bottomPad = 0（贴底判定精确的前提）；
 *   4. `reanchor`：锚点上方行高修正要产生等量的 scrollTop 补偿，锚点自身与下方行不产生。
 * 外加缓存 FIFO 淘汰与空表边界。
 */
import { describe, expect, it } from 'vitest'

import {
  LOG_HEIGHT_CACHE_LIMIT,
  LOG_ROW_ESTIMATE_PX,
  LOG_WINDOW_OVERSCAN,
  createLogWindow,
} from '../client-src/log-window.js'

/** 1..count 的行（id = 序号），与 follow 路径的单调 id 同形。 */
function rows(count: number): Array<{ id: number }> {
  return Array.from({ length: count }, (_, i) => ({ id: i + 1 }))
}

/** 窗口里挂的总高（用于断言「垫高 + 窗口 + 垫高 = 总高」）。 */
function windowHeight(logWindow: ReturnType<typeof createLogWindow>, list: Array<{ id: number }>, win: { start: number; end: number }): number {
  let acc = 0
  for (let i = win.start; i <= win.end; i += 1) acc += logWindow.heightOf(list[i].id)
  return acc
}

describe('createLogWindow 常量', () => {
  it('默认估算高度 20px、overscan ≥ 右键「问 Agent」要的前后 20 行上下文', () => {
    expect(LOG_ROW_ESTIMATE_PX).toBe(20)
    // ASK_CONTEXT_LINES = 20（client-src/index.js）：overscan 小于它，诊断包就会缺上下文
    expect(LOG_WINDOW_OVERSCAN).toBeGreaterThanOrEqual(20)
    expect(LOG_HEIGHT_CACHE_LIMIT).toBeGreaterThan(5000)
  })
})

describe('高度缓存', () => {
  it('没量过的行用估算值，量过之后用实测值', () => {
    const logWindow = createLogWindow({ estimate: 20, overscan: 2 })
    expect(logWindow.heightOf(1)).toBe(20)
    expect(logWindow.measure(1, 33)).toBe(true)
    expect(logWindow.heightOf(1)).toBe(33)
    expect(logWindow.heightOf(2)).toBe(20)
  })

  it('亚像素抖动与非法值不算变化（否则每帧都要重渲染）', () => {
    const logWindow = createLogWindow({ estimate: 20, overscan: 2 })
    expect(logWindow.measure(1, 30)).toBe(true)
    expect(logWindow.measure(1, 30.2)).toBe(false)
    expect(logWindow.measure(1, NaN)).toBe(false)
    expect(logWindow.measure(1, 0)).toBe(false)
    expect(logWindow.measure(1, -5)).toBe(false)
    expect(logWindow.heightOf(1)).toBe(30)
  })

  it('缓存按「最近测量」FIFO 淘汰，最老的掉回估算值', () => {
    const logWindow = createLogWindow({ estimate: 20, overscan: 2, maxEntries: 3 })
    for (const id of [1, 2, 3, 4]) logWindow.measure(id, 30)
    expect(logWindow.size()).toBe(3)
    expect(logWindow.heightOf(1)).toBe(20) // 被淘汰
    expect(logWindow.heightOf(4)).toBe(30)
    // 重测把条目挪到队尾：再量一次 2 → 3 变成最老的
    logWindow.measure(2, 31)
    logWindow.measure(5, 30)
    expect(logWindow.heightOf(3)).toBe(20)
    expect(logWindow.heightOf(2)).toBe(31)
  })

  it('clear() 清空（换流 / 重建缓冲时行 id 会被复用）', () => {
    const logWindow = createLogWindow({ estimate: 20, overscan: 2 })
    logWindow.measure(1, 30)
    logWindow.clear()
    expect(logWindow.size()).toBe(0)
    expect(logWindow.heightOf(1)).toBe(20)
  })
})

describe('layout：非贴底', () => {
  it('窗口覆盖可见区并在上下各留 overscan，垫高与总高自洽', () => {
    const logWindow = createLogWindow({ estimate: 20, overscan: 2 })
    const list = rows(20) // 总高 400
    const win = logWindow.layout(list, { scrollTop: 100, viewportHeight: 60 })
    // 可见：offsets 100 处是第 6 行（index 5），视口底 160 落在第 9 行（index 8）
    expect(win.total).toBe(400)
    expect(win.start).toBe(3)
    expect(win.end).toBe(9)
    expect(win.topPad).toBe(60)
    expect(win.bottomPad).toBe(200)
    expect(win.topPad + windowHeight(logWindow, list, win) + win.bottomPad).toBe(win.total)
    // 锚点 = 可见区顶行（index 5），不是窗口首行
    expect(win.anchorId).toBe(6)
    expect(win.anchorOffset).toBe(100)
  })

  it('overscan=0 时只挂可见行；滚到顶部时上垫为 0', () => {
    const logWindow = createLogWindow({ estimate: 20, overscan: 0 })
    const list = rows(20)
    const win = logWindow.layout(list, { scrollTop: 100, viewportHeight: 60 })
    expect(win.start).toBe(5)
    expect(win.end).toBe(7)
    expect(win.topPad).toBe(100)
    const top = logWindow.layout(list, { scrollTop: 0, viewportHeight: 60 })
    expect(top.start).toBe(0)
    expect(top.topPad).toBe(0)
  })

  it('混用实测高度：垫高跟着实测值走', () => {
    const logWindow = createLogWindow({ estimate: 20, overscan: 1 })
    const list = rows(10)
    logWindow.measure(1, 100) // 第 1 行实测 100 → 后续偏移整体 +80
    const win = logWindow.layout(list, { scrollTop: 100, viewportHeight: 60 })
    // offsets: 0,100,120,140,160,180,200,... → 100 落在第 2 行（index 1）
    expect(win.total).toBe(100 + 9 * 20)
    expect(win.start).toBe(0)
    expect(win.topPad).toBe(0)
    expect(win.anchorId).toBe(2)
    expect(win.anchorOffset).toBe(100)
  })
})

describe('layout：贴底（pinned）', () => {
  it('窗口锚到列表尾部、bottomPad = 0，尾部行全部在窗口里', () => {
    const logWindow = createLogWindow({ estimate: 20, overscan: 2 })
    const list = rows(20)
    const win = logWindow.layout(list, { scrollTop: 999, viewportHeight: 60, pinned: true })
    expect(win.end).toBe(19)
    expect(win.bottomPad).toBe(0)
    // 视口 60 + overscan×estimate 40 = 100 → 尾部凑 5 行（index 15..19）就是整个窗口
    // （贴底时 overscan 已算进 need，不再额外往前多挂一屏）
    expect(win.start).toBe(15)
    expect(win.topPad + windowHeight(logWindow, list, win)).toBe(win.total)
  })

  it('视口还量不出来（height=0）也按贴底处理：挂尾部一小段，不挂 5000 行', () => {
    const logWindow = createLogWindow({ estimate: 20, overscan: 2 })
    const list = rows(5000)
    const win = logWindow.layout(list, { scrollTop: 0, viewportHeight: 0 })
    expect(win.end).toBe(4999)
    expect(win.bottomPad).toBe(0)
    expect(win.end - win.start + 1).toBeLessThan(10)
  })

  it('实测高度更大时，向前凑的行数相应减少', () => {
    const logWindow = createLogWindow({ estimate: 20, overscan: 0 })
    const list = rows(50)
    for (const row of list) logWindow.measure(row.id, 100)
    const win = logWindow.layout(list, { scrollTop: 0, viewportHeight: 250, pinned: true })
    // 视口 250 / 每行 100 → 需要 3 行覆盖（100,200,300）
    expect(win.start).toBe(47)
    expect(win.end).toBe(49)
  })
})

describe('reanchor：测量落地后的滚动补偿', () => {
  it('锚点上方的行变高 → 返回等量补偿；锚点自身与下方行不补偿', () => {
    const logWindow = createLogWindow({ estimate: 20, overscan: 2 })
    const list = rows(20)
    const win = logWindow.layout(list, { scrollTop: 100, viewportHeight: 60 })
    expect(win.anchorId).toBe(6)
    expect(win.anchorOffset).toBe(100)

    // 锚点上方（第 2 行）实测 50：从 20 → +30
    expect(logWindow.measure(2, 50)).toBe(true)
    expect(logWindow.reanchor(list, win.anchorId, win.anchorOffset)).toBe(30)

    // 锚点自己变高：偏移不变 → 不补偿
    const before = logWindow.reanchor(list, win.anchorId, win.anchorOffset)
    logWindow.measure(6, 80)
    expect(logWindow.reanchor(list, win.anchorId, win.anchorOffset)).toBe(before)

    // 锚点下方（第 10 行）变高：不补偿
    const stable = logWindow.reanchor(list, win.anchorId, win.anchorOffset)
    logWindow.measure(10, 90)
    expect(logWindow.reanchor(list, win.anchorId, win.anchorOffset)).toBe(stable)
  })

  it('锚点已被淘汰 / 不在表里 → 0（不猜）', () => {
    const logWindow = createLogWindow({ estimate: 20, overscan: 2 })
    const list = rows(5)
    expect(logWindow.reanchor(list, 99, 0)).toBe(0)
    expect(logWindow.reanchor([], 1, 0)).toBe(0)
  })
})

describe('offsetOf：跨代锚点（D154）用的绝对偏移', () => {
  it('返回该行上方的总高；行不在表里返回 null', () => {
    const logWindow = createLogWindow({ estimate: 20, overscan: 2 })
    const list = rows(10)
    logWindow.measure(1, 50)
    // 第 4 行上方 = 50 + 20 + 20 = 90
    expect(logWindow.offsetOf(list, 4)).toBe(90)
    expect(logWindow.offsetOf(list, 99)).toBe(null)
    expect(logWindow.offsetOf(list, null)).toBe(null)
  })

  it('淘汰头部后，相对旧记录的补偿 = 被淘汰行的总高（洪泛中读历史的位移来源）', () => {
    const logWindow = createLogWindow({ estimate: 20, overscan: 2 })
    const list = rows(10)
    logWindow.measure(1, 50)
    logWindow.measure(2, 30)
    // useLogRows 每帧做的事：把锚的绝对位置记下来（offsetOf）
    const anchorOffset = logWindow.offsetOf(list, 6) // 50+30+20×3 = 140
    expect(anchorOffset).toBe(140)
    // 环形缓冲淘汰最前 3 行：锚点上方少了 50+30+20 = 100px——旧实现（以本次渲染的
    // anchorOffset 为基准）对这个位移补到 0，洪泛中读历史就持续上飘（D154）
    const evicted = list.slice(3)
    expect(logWindow.reanchor(evicted, 6, anchorOffset)).toBe(-100)
    // 补偿后用 offsetOf 重新记录：绝对偏移跟着变，下一帧以此为准（不漂移）
    expect(logWindow.offsetOf(evicted, 6)).toBe(40)
    expect(logWindow.reanchor(evicted, 6, 40)).toBe(0)
  })
})

describe('空表与自洽性', () => {
  it('空表：end < start，总高 0', () => {
    const logWindow = createLogWindow()
    const win = logWindow.layout([], { scrollTop: 0, viewportHeight: 100 })
    expect(win.end).toBe(-1)
    expect(win.start).toBe(0)
    expect(win.total).toBe(0)
    expect(win.anchorId).toBe(null)
  })

  it('任意 scrollTop 下垫高与总高自洽（含滚过头的情况）', () => {
    const logWindow = createLogWindow({ estimate: 20, overscan: 3 })
    const list = rows(37)
    logWindow.measure(3, 55)
    logWindow.measure(20, 7)
    for (const top of [0, 1, 50, 321, 9999]) {
      const win = logWindow.layout(list, { scrollTop: top, viewportHeight: 120 })
      expect(win.start).toBeGreaterThanOrEqual(0)
      expect(win.end).toBeLessThan(list.length)
      expect(win.topPad + windowHeight(logWindow, list, win) + win.bottomPad).toBeCloseTo(win.total, 6)
    }
  })
})
