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
    // 锚点用动作键（busyOr('search'）而不是按钮文案——文案会随 UX 调整变，
    // 动作键是稳定标识（第一版锚在 "children: '搜索'" 上，加了忙碌态文案后立刻失效）。
    const anchor = "busyOr('search'"
    const searchBlock = src.slice(src.indexOf(anchor), src.indexOf(anchor) + 1400)
    expect(searchBlock).toContain("runQuery('explore'")
    expect(searchBlock).toContain("runQuery('context'")
  })
})

describe('UX 重构：面板信息架构（顺序 / 分层）守卫', () => {
  /*
   * 2026-09-22 的卡片重构：用户反馈「设置面板有点乱」。乱的具体形态是——
   *   1. 「索引状态」沉在最底部：打开卡片要先越过两行输入框和 9 个按钮，才知道
   *      这个目录索引健不健康。首屏应该回答「状态如何」，而不是先给一堆操作。
   *   2. 索引维护 9 个按钮零层级：每天点的 Sync、排障用的诊断包、罕见的解锁、
   *      破坏性的撤销索引完全同样式混在一行。
   *   3. 查询区混了两个工作流：符号查询（搜索/探索/上下文）和「改动文件 → 影响面」
   *      是两种不同心智，却共享一行参数。
   *   4. Agent 集成四个开关视觉同权：轻量开关（跟随/公告/指引）与改 MCP 拓扑的
   *      per-agent 隔离长得一样。
   *
   * 修法是**重排 + 分层**而不是删功能。下面钉的是这次重构的核心性质，
   * 免得下次「顺手调一下」又把状态塞回底部、把按钮拍平。
   */
  const src = readFileSync(new URL('../client-src/index.js', import.meta.url), 'utf8')

  /** 某个结构标记在源码里的位置（用源码文本顺序近似 DOM 顺序；所有标记都在同一个 children 数组里）。 */
  const pos = (needle: string): number => {
    const at = src.indexOf(needle)
    expect(at, `结构标记缺失：${needle}`).toBeGreaterThan(-1)
    return at
  }

  it('状态先于操作：索引状态 必须排在 索引维护 之前', () => {
    expect(pos("group('索引状态'")).toBeLessThan(pos("group('索引维护'"))
  })

  it('自上而下顺序：目标项目 → 索引状态 → 索引维护 → 搜索与查询 → Agent 集成', () => {
    const order = ["group('目标项目'", "group('索引状态'", "group('索引维护'", "group('搜索与查询'", "group('Agent 集成'"]
    for (let index = 1; index < order.length; index++) {
      expect(pos(order[index]), `${order[index - 1]} 应在 ${order[index]} 之前`).toBeGreaterThan(pos(order[index - 1]))
    }
  })

  it('索引维护按动作性质分层（生命周期 / 查看与诊断），删除类动作带独立标记', () => {
    expect(src).toContain("'生命周期'")
    expect(src).toContain("'查看与诊断'")
    expect(pos("'生命周期'")).toBeLessThan(pos("'查看与诊断'"))
    /*
     * 删除类动作（撤销索引）的落点变过一次，这里钉住**现在**的设计：
     *   - 它在「生命周期」行内（写索引的动作同档），不另起一行——独立成行会变成
     *     「一个按钮 + 右侧大片空白」，用户直接问「为什么单独换行」，看起来像换行 bug；
     *   - 但用竖向虚线槽（.cg_dangerSlot）与常规按钮隔开，排在它们之后。
     * 取 JSX 用法（className）而不是 CSS 定义——样式表里先出现该名字。
     */
    expect(src).toContain('cg_dangerSlot')
    const slotAt = pos("className: 'cg_dangerSlot'")
    expect(slotAt, '危险槽应在生命周期行内（查看与诊断之前）').toBeLessThan(pos("'查看与诊断'"))
    expect(slotAt, '危险槽应排在常规生命周期按钮之后').toBeGreaterThan(pos("busyOr('unlock'"))
  })

  it('Sync 是生命周期行的主按钮（cg_btn）：这张卡片最高频的安全操作要做视觉锚点', () => {
    // 生命周期子行内，Sync 用 cg_btn 而其它用 cg_btnGhost
    const lifecycle = src.slice(pos("'生命周期'"), pos("'查看与诊断'"))
    expect(lifecycle).toContain("busyOr('sync'")
    const syncAt = lifecycle.indexOf("busyOr('sync'")
    expect(lifecycle.lastIndexOf("className: 'cg_btn'", syncAt), 'Sync 应使用 cg_btn 主样式').toBeGreaterThan(lifecycle.lastIndexOf("className: 'cg_btnGhost'", syncAt))
  })

  it('查询区拆成两个工作流：符号查询（吃关键词）在上，「其他查询」单列子行', () => {
    expect(src).toContain("'其他查询'")
    // 改动文件输入必须在「其他查询」标记之后（原先与类型/上限混在一行）
    expect(pos("'其他查询'")).toBeLessThan(pos("'改动文件'"))
    // 「类型」「上限」贴着搜索按钮（它们是 query 的参数），不跟改动文件混
    expect(pos("busyOr('search'")).toBeLessThan(pos("'类型'"))
    expect(pos("'类型'")).toBeLessThan(pos("'其他查询'"))
  })

  it('「文件」按钮与它的结果同处一区（不再与结果区割裂）', () => {
    /*
     * 用户反馈：「上面的文件和下面的搜索是一个东西吗，现在太割裂了」。
     * 上一轮我只把**结果区**上移，忘了「文件」的**按钮**还在「查看与诊断」里——
     * 同一个东西的按钮与结果分居两处，中间还夹着一个展开的诊断包。
     *
     * 这条钉住：文件按钮在「搜索与查询」组内、且在结果区之前（= 与结果区同处一区）。
     */
    const fileButton = pos("busyOr('files'")
    expect(fileButton, '文件按钮应在「搜索与查询」组内').toBeGreaterThan(pos("group('搜索与查询'"))
    expect(fileButton, '文件按钮应在结果区之前（同处一区）').toBeLessThan(pos("group('结果'"))
    // 且不该再出现在「查看与诊断」里（那是卡片/CLI 自检动作，不产生查询结果）
    const diagnostics = src.slice(pos("'查看与诊断'"), pos("group('搜索与查询'"))
    expect(diagnostics, '「查看与诊断」里不该再有文件按钮').not.toContain("busyOr('files'")
  })

  it('「刷新」挂在「索引状态」组头（它刷的就是这一组，不该隔着一屏）', () => {
    /*
     * 用户反馈（截图）：「这个状态和刷新状态有关系吗」——箭头从「状态 ● 已索引」格
     * 指到「刷新状态」按钮。有关系：那个按钮重新读取的正是填充本组网格的数据
     * （`loadStatus` 只打 `/status`）。但它原先在「索引维护 → 查看与诊断」里，
     * 与它刷新的东西隔着一整屏，而且两边都叫「状态」。
     *
     * 修法：挪进「索引状态」的**组头右侧**——「这个按钮属于这一组」一眼可见。
     */
    const refresh = pos('onClick: loadStatus')
    expect(refresh, '刷新应在「索引状态」组内').toBeGreaterThan(pos("group('索引状态'"))
    expect(refresh, '刷新应在「索引维护」之前（即属于索引状态组）').toBeLessThan(pos("group('索引维护'"))
    // 组头里的辅助动作用**图标**而不是文字按钮（不抢组内主控件的视觉重量）
    const button = src.slice(refresh - 700, refresh + 700)
    expect(button, '刷新应是图标按钮').toContain('cg_iconBtn')
    expect(button, '图标按钮必须带 aria-label').toContain("'aria-label'")
    expect(button, '图标按钮必须带 title（悬停可读）').toContain('title:')
    expect(button, '应使用刷新图标路径').toContain('REFRESH_PATH')
    // 「查看与诊断」里不该再有它
    const diagnostics = src.slice(pos("'查看与诊断'"), pos("group('搜索与查询'"))
    expect(diagnostics, '「查看与诊断」里不该再有刷新').not.toContain('onClick: loadStatus')
  })

  it('「索引状态」组无条件渲染（否则读取失败时连重试入口都没了）', () => {
    // 刷新按钮挂在这个组的组头；整组若随 status 一起消失，status 读失败就无从重试
    expect(src, '缺少无数据占位').toContain('还没读取到索引状态')
    const groupAt = pos("group('索引状态'")
    // 组调用前不能是「status ? ...」那种整体守卫
    const before = src.slice(groupAt - 200, groupAt)
    expect(before, '「索引状态」组不该被 status 守卫包住').not.toMatch(/status\s*\n\s*\?\s*$/)
  })

  it('组头尾随动作靠显式细线元素右对齐（::after 会让按钮跑到细线左边）', () => {
    expect(src).toContain('cg_sectionRule')
    expect(src, '::after 已换成显式元素').not.toContain('.cg_sectionHead::after')
    // group 的第三个参数就是尾随动作槽
    expect(src).toMatch(/const group = \(label, children, action\)/)
  })

  it('诊断包默认折叠（展开的 260px 会把下方结果区推远）', () => {
    // report 的 details 不该带 open:true——它很长，自动展开会挡住结果
    const details = src.slice(pos('诊断包（可整段复制贴 issue）') - 400, pos('诊断包（可整段复制贴 issue）'))
    expect(details, '诊断包应默认折叠').not.toContain('open: true')
  })

  it('Agent 集成拆两行：「跟随与提示词」与「MCP 挂载」分开', () => {
    expect(src).toContain("'跟随与提示词'")
    expect(src).toContain("'MCP 挂载'")
    expect(pos("'跟随与提示词'")).toBeLessThan(pos("'MCP 挂载'"))
    // per-agent 开关必须在 MCP 挂载子行里（不能在提示词那行）
    expect(pos("'MCP 挂载'")).toBeLessThan(pos("'per-agent MCP 隔离'"))
    expect(pos("'注入使用指引'")).toBeLessThan(pos("'MCP 挂载'"))
  })
})

describe('UX 重构：忙碌态指示器（在标题行，不在正文中间）', () => {
  /*
   * 用户反馈（截图）：正文中间那句**居中大块**的「加载中…」不好——它夹在
   * 「匿名用量统计」与「搜索与查询」之间，三个毛病：
   *   ① 不说在加载**什么**（同步？重建？搜索？）；
   *   ② 插入/移除会把下面整组控件上下推（布局跳动，约 70px）；
   *   ③ 索引重建可能跑十分钟，而它会随滚动移出视野——最需要它的时候看不见。
   *
   * 改法：指示器提到**面板标题行**（常驻、零布局跳动），带动作文案，并把「取消」
   * 挪到它旁边（原先在危险行，与进度隔着用量统计，真要取消时找不到）。
   */
  const src = readFileSync(new URL('../client-src/index.js', import.meta.url), 'utf8')
  const pos = (needle: string): number => {
    const at = src.indexOf(needle)
    expect(at, `结构标记缺失：${needle}`).toBeGreaterThan(-1)
    return at
  }

  it('不再有笼统的居中大块「加载中…」', () => {
    expect(src, '旧的居中 loading 块应已删除').not.toContain("children: '加载中…'")
    // 只查**实际用法**（className），不查任何提及——注释里会说明「cg_loading 已退役」，
    // 直接断言源码不含该字样会把那条注释本身判红（第一版就是这么假失败的）。
    expect(src, '.cg_loading 的用法应已移除').not.toContain("className: 'cg_loading'")
  })

  it('忙碌指示器在面板标题行里（标题之后、目标项目之前 = 常驻且零布局跳动）', () => {
    expect(src).toContain('cg_panelHeader')
    expect(src).toContain('cg_busy')
    expect(pos('cg_panelHeader')).toBeLessThan(pos("group('目标项目'"))
    expect(pos("children: 'Codegraph 控制台'")).toBeLessThan(pos("className: 'cg_busy'"))
  })

  it('忙碌文案具体到动作（不用笼统的「加载中」）', () => {
    // 每个动作各给一句，用户才知道在等什么、该不该取消
    for (const label of ['同步中…', '重建索引中…', '搜索中…', '初始化索引中…', '撤销索引中…', '读取索引状态…']) {
      expect(src, `缺少动作文案：${label}`).toContain(label)
    }
  })

  it('「取消」紧挨着它要停的那件事（在 cg_busy 里，不在删除类动作那一格）', () => {
    const busyAt = pos("className: 'cg_busy'")
    const cancelAt = pos("children: '取消'")
    const slotAt = pos("className: 'cg_dangerSlot'")
    expect(cancelAt, '取消应在忙碌指示器之后').toBeGreaterThan(busyAt)
    expect(cancelAt, '取消不应与删除类动作同格（那是撤销索引的位置）').toBeLessThan(slotAt)
  })

  it('刷新图标只在**本动作**在跑时自转（不是任何动作都转）', () => {
    /*
     * `loading` 是全局忙态：搜索时它也是 true。若图标跟着 loading 转，搜个符号就会看到
     * 刷新图标在转——那不是「正在刷新」而是错误信息。所以自转由 busyAction === 'status'
     * 驱动（busyAction 正是为「哪个动作在跑」引入的）。
     */
    expect(src).toContain("'data-busy': busyAction === 'status' ? '1' : undefined")
    expect(src).toContain('.cg_iconBtn[data-busy="1"] svg')
    // 减少动态效果时不自转，靠 aria/title 表达
    expect(src).toMatch(/prefers-reduced-motion:reduce\)\{\.cg_spinner,\.cg_iconBtn\[data-busy="1"\] svg\{animation:none\}\}/)
  })

  it('结果区在「搜索与查询」下方、且在「Agent 集成」之前（不再沉到面板最底部）', () => {
    /*
     * 用户反馈：「点击文件看不到对应的列表」——结果区原先在 Agent 集成**之后**
     * （面板最底部），而触发按钮在索引维护 / 搜索与查询，点完要翻两屏。
     */
    expect(src).toContain("group('结果'")
    const resultAt = pos("group('结果'")
    expect(resultAt, '结果区应在搜索与查询之后').toBeGreaterThan(pos("group('搜索与查询'"))
    expect(resultAt, '结果区应在 Agent 集成之前（这是本次修复的核心）').toBeLessThan(pos("group('Agent 集成'"))
  })

  it('结果按路由分槽保存（页签切回去还在，不是单槽覆盖）', () => {
    // 单槽 output 会让「点文件 → 点探索 → 切回文件」变空白
    expect(src).toContain('setOutputs((previous) =>')
    expect(src).toContain('outputs[activeTab]')
    expect(src, '单槽 output 应已退役').not.toContain('const [output, setOutput]')
  })

  it('每个触发按钮都会切到自己的页签', () => {
    for (const key of ['search', 'files', 'affected', 'explore', 'context', 'detail']) {
      expect(src, `缺少页签 key：${key}`).toContain(`key: '${key}'`)
    }
    // 查询路由用同一个 key 既当动作键又当页签键（busyOr(route) 与 setActiveTab(route) 同源）
    expect(src).toContain('setActiveTab(route)')
    expect(src).toContain("setActiveTab('search')")
    expect(src).toContain("setActiveTab('detail')")
  })

  it('结果出来后滚到可见处，且对假 DOM 有守卫（block:nearest = 已在视野就不动）', () => {
    expect(src).toContain('scrollIntoView')
    expect(src).toContain("block: 'nearest'")
    // 预览的假 DOM 没有 scrollIntoView：不守卫的话预览会直接崩
    expect(src).toMatch(/typeof el\.scrollIntoView !== 'function'/)
  })

  it('索引被重建 / 撤销后清掉陈旧的结果（文件列表描述的是旧索引）', () => {
    expect(src).toContain('clearIndexResults')
    expect(src).toContain('INDEX_RESULT_TABS')
  })

  it('转圈是纯 CSS 且尊重「减少动态效果」', () => {
    expect(src).toContain('@keyframes cg_spin')
    expect(src).toContain('prefers-reduced-motion')
  })

  it('每个动作按钮自己也要显示忙碌态（不能只靠标题行）', () => {
    /*
     * 用户反馈（截图）：「在这里点，会看不到加载的 loading」。根因是我上一轮把指示器
     * 只放到了标题行——卡片很长，滚到下半部分时它已移出视野。修法是**两级反馈**：
     * 按钮自己（busyOr）+ 标题行全局。
     *
     * 这条守卫钉住「每个动作按钮都接了 busyOr」：漏掉任何一个，那个按钮点了就没反馈。
     */
    expect(src, '缺少 busyAction 状态').toContain('busyAction')
    expect(src, '缺少 busyOr 助手').toContain('const busyOr =')
    expect(src, '缺少按钮内忙碌样式').toContain('cg_btnBusy')
    // 10 个**文字**动作按钮走 busyOr：init / sync / index / unlock / files / uninit /
    // search / explore / context / affected。
    // 第 11 个（status = 索引状态组头的刷新）是**图标**按钮，文案换成 aria/title，
    // 忙碌态用图标自转（data-busy）——见下一条断言。
    const used = [...src.matchAll(/busyOr\('/g)].length
    expect(used, `接了 busyOr 的按钮数 = ${String(used)}，应为 10`).toBe(10)
    for (const action of ['init', 'sync', 'index', 'unlock', 'files', 'uninit', 'search', 'explore', 'context', 'affected']) {
      expect(src, `缺少动作键：${action}`).toContain(`busyOr('${action}'`)
    }
  })
})
