import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  REL_LIMIT,
  adoptionText,
  fmtBytes,
  fmtNum,
  fmtTime,
  nextRetryDelayMs,
  seenAgoText,
  shortPath,
  staleReasons,
  truncationNote,
} from '../client-src/pure.js'

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

describe('P1 采纳率：adoptionText 的边界', () => {
  it('无 summary / 非对象 → 空串（不渲染那一行）', () => {
    expect(adoptionText(null)).toBe('')
    expect(adoptionText(undefined)).toBe('')
    expect(adoptionText('nope')).toBe('')
  })

  it('一次调用都没有：明说没有记录，而不是 0%', () => {
    const text = adoptionText({ codegraph: 0, discovery: 0, discoveryTotal: 0, file: 0, other: 0 })
    expect(text).toContain('还没有工具调用记录')
    expect(text).not.toContain('0%')
  })

  it('只有其它工具：说「还没有探索类调用」，不显示 0%', () => {
    const text = adoptionText({ codegraph: 0, discovery: 0, discoveryTotal: 0, file: 0, other: 5 })
    expect(text).toContain('还没有探索类调用')
    expect(text).toContain('5 次其它工具')
    expect(text).not.toContain('0%')
  })

  it('有读取但没有发现类：与「只有其它工具」区分开', () => {
    const onlyReads = adoptionText({ codegraph: 0, discovery: 0, discoveryTotal: 0, file: 4, other: 0 })
    expect(onlyReads).toContain('还没有发现类调用')
    expect(onlyReads).toContain('读取 4 次')
    const onlyOther = adoptionText({ codegraph: 0, discovery: 0, discoveryTotal: 0, file: 0, other: 4 })
    expect(onlyOther).toContain('还没有探索类调用')
  })

  it('有发现类调用：窄口径是主口径，宽口径仅在不同时带出', () => {
    // grep 进 discovery；read 只进 file —— 两个口径给出不同的百分比
    expect(adoptionText({ codegraph: 2, discovery: 1, discoveryTotal: 3, file: 1, other: 0, indexed: true }))
      .toBe('采纳率：codegraph 2 次 / 发现类 1 次 → 67%（宽口径含读取 67%）')
    // 只有读取时宽口径不同，必须标出来
    expect(adoptionText({ codegraph: 0, discovery: 0, discoveryTotal: 0, file: 4, other: 2, indexed: true }))
      .toBe('采纳率：还没有发现类调用（codegraph 0 次 / 读取 4 次；另 2 次其它工具）')
    expect(adoptionText({ codegraph: 3, discovery: 0, discoveryTotal: 3, file: 0, other: 0, indexed: true }))
      .toBe('采纳率：codegraph 3 次 / 发现类 0 次 → 100%')
  })

  it('两个口径确实是两个数（真实历史里差别巨大：2.2% vs 28.8%）', () => {
    const text = adoptionText({ codegraph: 1, discovery: 3, discoveryTotal: 4, file: 20, other: 0, indexed: true })
    expect(text).toContain('发现类 3 次 → 25%')
    expect(text).toContain('宽口径含读取 5%')
  })

  it('未索引项目要标明数字不代表提示词效果', () => {
    const text = adoptionText({ codegraph: 0, discovery: 2, discoveryTotal: 2, file: 2, other: 0, indexed: false })
    expect(text).toContain('该项目未索引')
  })
})

describe('P2 项目列表：shortPath / seenAgoText', () => {
  it('shortPath 保留最后两段（这是还能分辨的粒度），非字符串原样空串', () => {
    expect(shortPath('/Users/czz/coding/project/cdc-manage')).toBe('…/project/cdc-manage')
    expect(shortPath('/a/b')).toBe('/a/b')            // 两段以内不动
    expect(shortPath('/a')).toBe('/a')
    expect(shortPath('')).toBe('')
    expect(shortPath(null)).toBe('')
    expect(shortPath(undefined)).toBe('')
    // 尾斜杠不该产生空段
    expect(shortPath('/a/b/c/')).toBe('…/b/c')
  })

  it('seenAgoText 分档给人话，非法值返回空串', () => {
    expect(seenAgoText(0)).toBe('刚刚')
    expect(seenAgoText(30_000)).toBe('刚刚')
    expect(seenAgoText(90_000)).toBe('1 分钟前')
    expect(seenAgoText(3 * 3600_000)).toBe('3 小时前')
    expect(seenAgoText(2 * 86400_000)).toBe('2 天前')
    expect(seenAgoText(-1)).toBe('')
    expect(seenAgoText(NaN)).toBe('')
    expect(seenAgoText('nope')).toBe('')
  })
})

describe('P3 状态面板格式化：fmtNum / fmtBytes / fmtTime 的边界', () => {
  it('fmtNum：非有限值与非数字一律占位符（状态里字段缺失是常态）', () => {
    expect(fmtNum(6542)).toBe((6542).toLocaleString())
    expect(fmtNum(0)).toBe('0')
    for (const bad of [NaN, Infinity, -Infinity, '6542', null, undefined, {}]) {
      expect(fmtNum(bad), String(bad)).toBe('—')
    }
  })

  it('fmtBytes：1000 进制进位、>=100 不留小数、非法值占位符', () => {
    expect(fmtBytes(0)).toBe('0 B')
    expect(fmtBytes(999)).toBe('999 B')
    // 1000 整就进位（十进制口径，与 CLI 的 dbSizeBytes 一致）
    expect(fmtBytes(1000)).toBe('1.0 kB')
    expect(fmtBytes(1500)).toBe('1.5 kB')
    // >= 100 的带单位量值不留小数
    expect(fmtBytes(99900)).toBe('99.9 kB')
    expect(fmtBytes(100000)).toBe('100 kB')
    expect(fmtBytes(45105152)).toBe('45.1 MB')
    // 上限封在 TB，不越界
    expect(fmtBytes(1e15)).toBe('1000 TB')
    for (const bad of [-1, NaN, Infinity, '100', null, undefined]) {
      expect(fmtBytes(bad), String(bad)).toBe('—')
    }
  })

  it('fmtTime：解析不出来【原样返回】，不是 Invalid Date、也不是 —', () => {
    // 这条是刻意的：吞掉原串会让人以为索引从未建立，而真相是 CLI 换了格式
    expect(fmtTime('not-a-date')).toBe('not-a-date')
    expect(fmtTime('2026-09-22T05:28:00.708Z')).not.toBe('—')
    expect(fmtTime('2026-09-22T05:28:00.708Z')).not.toContain('Invalid')
    for (const bad of ['', null, undefined, 42, {}]) {
      expect(fmtTime(bad), String(bad)).toBe('—')
    }
  })
})

describe('工具栏布局守卫：按钮组不许「整组不可断行」', () => {
  /*
   * 实测过的 bug（用户截图）：P2 把按钮从 5 个加到 12 个之后，「撤销索引」被裁掉。
   *
   * 根因不是按钮太多，而是 CSS 的选择错了：`.cg_toolbarBtns` 当时是
   * `flex-wrap:nowrap` + `flex-shrink:0`——**整组不许断行**。5 个按钮（约 300px）时
   * 这招是对的（要么整组留在标题右边、要么整组换行）；12 个按钮约 900px，而侧边栏
   * 只有 ~360px，整组不许断行就只能溢出被裁。
   *
   * 这条守卫钉的是**性质**而不是像素：只要按钮数超出一行能放下的量，容器就必须允许
   * 换行。它跑在源码文本上（不需要 DOM），所以在这个没有 jsdom / 无头 Chrome 的仓库里
   * 也能挡住回归。
   */
  const src = readFileSync(new URL('../client-src/index.js', import.meta.url), 'utf8')
  const cssOf = (cls: string): string => {
    const m = src.match(new RegExp(`'\\.${cls}\\{([^}]*)\\}'`))
    expect(m, `找不到 .${cls} 的样式定义`).not.toBeNull()
    return m?.[1] ?? ''
  }

  it('.cg_toolbarBtns 必须允许换行（nowrap 是那条被裁的根因）', () => {
    const css = cssOf('cg_toolbarBtns')
    expect(css).toContain('flex-wrap:wrap')
    expect(css).not.toContain('nowrap')
  })

  it('.cg_row 必须允许换行（P2 把探索/上下文放进这一行后列数变多）', () => {
    const css = cssOf('cg_row')
    expect(css).toContain('flex-wrap:wrap')
    // 不能再是固定列数的 grid：4-5 列会把两个输入框挤到不可用
    expect(css).not.toContain('grid-template-columns')
  })

  it('输入框在 flex 行里可伸缩（否则窄栏下会撑破容器）', () => {
    expect(cssOf('cg_row .cg_input')).toContain('flex:1 1')
  })

  it('探索 / 上下文 与搜索按钮同处搜索行（它们吃搜索框的关键词）', () => {
    // 结构断言的近似：这三个按钮的 onClick 都读 query，应当出现在同一区块里。
    const searchBlock = src.slice(src.indexOf("children: '搜索'"), src.indexOf("children: '搜索'") + 1200)
    expect(searchBlock).toContain("runQuery('explore'")
    expect(searchBlock).toContain("runQuery('context'")
  })
})
