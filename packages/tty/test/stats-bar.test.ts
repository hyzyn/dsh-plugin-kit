/**
 * @hyzyn/dsh-tty — 服务器状态条「值 → 每条的文本与固定槽位」的回归测试。
 *
 * 实测踩过的 bug（用户报「状态条**定期闪动**」）：状态条每秒把整条 innerHTML 重建两次
 * （stats 帧一次 + 1s 陈旧检测定时器一次），而值文本宽度随位数变——CPU `5%` ↔ `12%`、
 * TCP `36` ↔ `1024`、内存 `9.2 GB` ↔ `17.8 GB`。只要有一个值多一位，它后面所有条目
 * 就被推着横移。headless 实测（scripts/preview 夹具 + 真实位数的帧序列，8 秒 / 每 100ms
 * 采样）：60 次位置变化、单次最大 26px——状态条看上去就是一格一格地跳。
 *
 * 修法两条（详见 client-src/stats-bar.js 的文件头）：值有**固定字符槽位**、渲染改增量更新。
 * 这里钉住第一半：**任何现实取值下，值文本的字符数都不超过它的槽位**——超了就会推挤后面
 * 的条目，闪动就回来了。第二条（增量更新）在 scripts/preview 里用真实 DOM 走查。
 *
 * 为什么写成「值 ≤ 槽位」而不是「槽位等于某个数」：槽位是可以调的（想让状态条更窄就
 * 调小），但**不能小于该字段的现实最大值**——这条性质比具体数字重要。
 */
import { describe, expect, it } from 'vitest'
import {
  STATS_STALE_MS,
  STATS_WARN_LIMIT,
  chartCeiling,
  coresLevel,
  formatBytes,
  formatRate,
  formatUptime,
  hasUsableStats,
  mergeOptionalStats,
  nextProcSort,
  normalizeProcSort,
  netScaleCeiling,
  nextStatsStyle,
  procDisplayName,
  procRows,
  truncateMiddle,
  sparklineArea,
  sparklinePath,
  statsFrameFresh,
  statsItemSpecs,
  statsItemValues,
  statsLevel,
  statsNum,
  statsPair,
  statsRate,
  statsRateCompact,
} from '../client-src/stats-bar.js'

/**
 * 目录住在 `client-src/index.js`（浏览器 IIFE 入口，这里 import 不动），所以翻译函数
 * 由测试注入。**断言键而不是中文文案**：文案可以改，键是契约（`t` 只回键名，参数忽略）。
 */
const t = (key: string) => key

/**
 * 「值 ≤ 槽位」那条不变量量的是**渲染出来的文案**长度，不是键名长度（`list.none` 有 9 个
 * 字符，拿它去量必然假红）。这里只把值兜底换成目录里那条英文文案（`N/A`，3 字符——与 zh 的
 * 单字兜底同量级），其余键照旧回键名。英文文案若被改成宽过槽位的写法，这条仍会红。
 */
const tValue = (key: string) => (key === 'list.none' ? 'N/A' : key)
const valuesOfLength = (stats: unknown) => statsItemValues(stats, tValue)

/** 一条「帧 → 值」的取值：槽位只认 order（与 statsItemSpecs(t) 同序），不认 key（内存/磁盘各有两条）。 */
const valuesOf = (stats) => statsItemValues(stats, t)

/** 现实的极端帧：每一格都顶到该字段的边界（100% / 4096 核 / 99.9% 容量 / 100 年开机 / 199.9°C）。 */
const EXTREME = {
  cpuPct: 100,
  memPct: 100,
  diskPct: 100,
  cores: 4096,
  memUsed: 999.9 * 2 ** 30, // “999.9 GB”，8 字符——容量一侧的最宽写法
  memTotal: 999.9 * 2 ** 30,
  diskUsed: 999.9 * 2 ** 30,
  diskTotal: 999.9 * 2 ** 30,
  uptimeSec: 100 * 365 * 24 * 3600, // 客户端 statsNum 的上限：100 年
  tcpConns: 999999,
  tempC: 199.9,
  rxRate: 1023.9 * 2 ** 30,
  txRate: 1023.9 * 2 ** 30,
}

/** 真机（macOS 本地会话）常见的一帧：CPU 一位数、网络与温度取不到 → 「无」。 */
const MACOS_LOCAL = {
  cpuPct: 5,
  cores: 10,
  memUsed: Math.round(17.8e9),
  memTotal: Math.round(32e9),
  memPct: 56,
  diskUsed: Math.round(13.6e9),
  diskTotal: Math.round(926e9),
  diskPct: 2,
  uptimeSec: 2405880, // 3w6d20h18m
  tcpConns: 36,
  // rxRate / txRate / tempC 缺席：渲染成「网络 无」「CPU温度 无」
}

/** 会挤压后面条目的取值变化（正是用户看到的跳动的来源），逐一覆盖。 */
const JITTER_FRAMES = [
  { ...MACOS_LOCAL, cpuPct: 12, tcpConns: 1220, memUsed: Math.round(9.2e9), memPct: 8 },
  { ...MACOS_LOCAL, cpuPct: 5, tcpConns: 36 },
  { ...MACOS_LOCAL, cpuPct: 100, tcpConns: 999999 },
  { ...MACOS_LOCAL, memUsed: 999.9 * 2 ** 30, diskUsed: Math.round(1.2e12) },
]

describe('状态条的固定槽位（本 bug：值位数变化不该推挤后面的条目）', () => {
  it('【本 bug】现实极端取值下，值文本的字符数都装得进自己的槽位', () => {
    const values = valuesOfLength(EXTREME)
    for (const item of values) {
      if (item.slot === 0) continue // 0 = 不固定（网络：最后一条的活数据）
      expect(item.value.length, `${item.label}「${item.value}」超出槽位 ${String(item.slot)}ch`).toBeLessThanOrEqual(item.slot)
    }
  })

  it('【本 bug】位数在变、槽位不变：CPU 5% ↔ 12% ↔ 100% 都不改任何条目的几何', () => {
    // 这些帧都没有速率 → 网络不占槽位；其余条目的槽位必须逐帧一致
    const expectedSlots = statsItemSpecs(t).map((spec) => (spec.key === 'net' ? 0 : spec.slot))
    for (const frame of JITTER_FRAMES) expect(valuesOf(frame).map((item) => item.slot)).toEqual(expectedSlots)
    // 值本身确实在变（否则这个用例就是空的），但宽度来源只有槽位
    const cpuTexts = JITTER_FRAMES.map((frame) => valuesOf(frame)[0].value)
    expect(new Set(cpuTexts).size).toBeGreaterThan(1)
  })

  it('「网络」有速率才占槽位：活数据的宽度也不能每秒伸缩；没速率时不白留 20 多字符', () => {
    const specs = statsItemSpecs(t)
    const net = specs[specs.length - 1]
    expect(net.key).toBe('net')
    expect(valuesOf(MACOS_LOCAL)[7].slot).toBe(0) // macOS 本地：网络 无
    const withRates = valuesOf({ ...MACOS_LOCAL, rxRate: 112.5 * 1024 ** 2, txRate: 112.5 * 1024 ** 2 })[7]
    expect(withRates.slot).toBe(net.slot)
    expect(withRates.value.length).toBeLessThanOrEqual(withRates.slot)
    expect(valuesOf({ ...MACOS_LOCAL, rxRate: 2 ** 40, txRate: 2 ** 40 })[7].value.length).toBeLessThanOrEqual(net.slot)
  })

  it('值与 spec 一一对应（DOM 层按同序建节点，错位就会写错格子）', () => {
    const values = valuesOf(MACOS_LOCAL)
    expect(values.map((item) => item.key)).toEqual(statsItemSpecs(t).map((spec) => spec.key))
    expect(values.map((item) => item.label)).toEqual(statsItemSpecs(t).map((spec) => spec.label))
    // 网络是唯一「槽位可以由单条值覆盖」的字段（有速率 = 占位，无速率 = 不占）
    expect(values.map((item) => item.slot)).toEqual(statsItemSpecs(t).map((spec) => (spec.key === 'net' ? 0 : spec.slot)))
  })
})

describe('statsItemValues 的渲染口径', () => {
  it('macOS 本地帧：百分比取整、容量成对、采不到的项写「无」（2026-10-31 起内存/磁盘各只占一条）', () => {
    const values = valuesOf(MACOS_LOCAL)
    expect(values.map((item) => item.value)).toEqual([
      '5%', // CPU
      '10', // 核心
      '56% (16.6/29.8 GB)', // 内存：百分比 + 已用/总量（同组，单位只写一次）
      '2% (12.7/862 GB)', // 磁盘：同上
      '3w6d20h18m', // 在线
      '36', // TCP
      'list.none', // CPU温度（macOS 没有 sysfs）
      'list.none', // 网络（macOS 本地取不到速率时）
    ])
  })

  it('进度条的 pct 与值同源；「无」不给进度（pct=null，DOM 层画 0%）', () => {
    const values = valuesOf(MACOS_LOCAL)
    expect(values[0].pct).toBe(5)
    expect(values[2].pct).toBe(56)
    expect(values[3].pct).toBe(2)
    expect(values[6].value).toBe('list.none')
    expect(values[6].pct).toBeNull()
    expect(values[7].pct).toBeNull()
  })

  it('合并项只画缺的那一半（不拼「86% (无)」，也不把缺失的百分比画成 0%）', () => {
    expect(valuesOf({ memPct: 86 })[2]).toMatchObject({ value: '86%', pct: 86 })
    expect(valuesOf({ memUsed: 8 * 2 ** 30, memTotal: 16 * 2 ** 30 })[2]).toMatchObject({ value: '8.0/16.0 GB', pct: null })
    expect(valuesOf({})[2]).toMatchObject({ value: 'list.none', pct: null })
  })

  it('title 是「标签: 值」（窄窗口被裁时悬停可读全），不做 HTML 转义（DOM 层用 setAttribute）', () => {
    const values = valuesOf(MACOS_LOCAL)
    expect(values[0].title).toBe('CPU: 5%')
    expect(values[4].title).toBe('meta.uptime: 3w6d20h18m')
    expect(values[2].title).toBe('meta.mem: 56% (16.6/29.8 GB)')
  })

  it('有速率时网络条显示 ↓/↑（B/s 走整数量级，KB/s 起复用 formatRate）', () => {
    expect(valuesOf({ ...MACOS_LOCAL, rxRate: 92.3 * 1024, txRate: 93.1 * 1024 })[7].value).toBe('↓92.3 KB/s ↑93.1 KB/s')
    expect(valuesOf({ ...MACOS_LOCAL, rxRate: 0, txRate: 512 })[7].value).toBe('↓0 B/s ↑512 B/s')
  })

  it('温度保留一位小数（Linux 上才有）', () => {
    expect(valuesOf({ ...MACOS_LOCAL, tempC: 62.45 })[6].value).toBe('62.5°C')
  })
})

describe('脏数据兜底（旧版宿主 / 第三方实现 / 假数据）', () => {
  const JUNK = [null, undefined, 'not-an-object', [1, 2, 3], 42, {}, { cpuPct: 'x', cores: -5, memUsed: 1e30, uptimeSec: Number.MAX_SAFE_INTEGER, tcpConns: -1, tempC: {} }]

  it('任何垃圾帧都不抛，且渲染不出 NaN / undefined / 负数 / 天文数字', () => {
    for (const junk of JUNK) {
      const values = valuesOfLength(junk)
      expect(values).toHaveLength(statsItemSpecs(t).length)
      for (const item of values) {
        expect(item.value).not.toMatch(/NaN|undefined|Infinity|-5|e\+30/)
        expect(item.value.length).toBeLessThanOrEqual(item.slot === 0 ? 64 : item.slot)
      }
    }
  })

  it('越界的 pct 拿不到进度（不会把进度条画出容器）', () => {
    expect(statsNum({ cpuPct: 120 }, 'cpuPct')).toBeNull()
    expect(statsNum({ cpuPct: -1 }, 'cpuPct')).toBeNull()
    expect(valuesOf({ cpuPct: 120, cores: 8 })[0]).toMatchObject({ value: 'list.none', pct: null })
  })

  it('hasUsableStats：一个可用字段算有数据，全脏则整条隐藏', () => {
    expect(hasUsableStats(MACOS_LOCAL)).toBe(true)
    expect(hasUsableStats({ cpuPct: 5 })).toBe(true)
    expect(hasUsableStats({})).toBe(false)
    expect(hasUsableStats(null)).toBe(false)
    expect(hasUsableStats('x')).toBe(false)
    expect(hasUsableStats([1, 2, 3])).toBe(false)
  })
})

/**
 * D50：用户真正的症状是「**整条状态条瞬间消失又出现**」——那不是布局，是状态条被收起了。
 * 原因在宿主侧：那台 macOS 上 `netstat -ib` 要 30s（缺 `-n` 会反查地址、DNS 不响应就一直
 * 等），被 3s 超时砍掉后每次采样卡满 3s、每秒 tick 被 busy 守卫跳过 → 帧间隔变成 **4s**；
 * 而前端原来的「3s 收不到新帧就整条收起」正好卡在中间，于是每 4 秒闪一次。
 *
 * 宿主侧已修（`netstat -ibn` + 慢子进程后台刷新，见 src/stats.ts），这里钉住客户端这半边：
 * 窗口必须容得下「连丢几拍」，同时又不能变成「采集死了也不收起」。
 */
describe('陈旧窗口（D50：整条消失又出现）', () => {
  it('宿主 4 秒一帧时不算陈旧（旧的 3s 窗口会把它判成陈旧 → 每 4 秒闪一次）', () => {
    const now = 1_000_000
    expect(statsFrameFresh(now - 4000, now)).toBe(true)
    expect(statsFrameFresh(now - 3000, now)).toBe(true)
    // 宿主 1s 一帧：连丢 7 拍（7s 无新帧）仍然显示上一帧的值，第 8 拍才收起
    expect(statsFrameFresh(now - 7000, now)).toBe(true)
    expect(statsFrameFresh(now - STATS_STALE_MS, now)).toBe(true)
    expect(statsFrameFresh(now - STATS_STALE_MS - 1, now)).toBe(false)
  })

  it('真停了（采集器退出 / 远端没有 /proc / 插件禁用）仍然会收起', () => {
    expect(statsFrameFresh(0, 1_000_000)).toBe(false)
    expect(statsFrameFresh(undefined, 1_000_000)).toBe(false)
    expect(statsFrameFresh(Number.NaN, 1_000_000)).toBe(false)
  })
})

describe('格式化函数（D49 修复时从 client-src/index.js 搬进来，顺带补上覆盖）', () => {  it('formatBytes：非正数/非有限值给空串（调用方决定退化成什么）', () => {
    expect(formatBytes(0)).toBe('')
    expect(formatBytes(-1)).toBe('')
    expect(formatBytes(Number.NaN)).toBe('')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(17.8e9)).toBe('16.6 GB')
    expect(formatBytes(100 * 2 ** 30)).toBe('100 GB') // ≥100 不留小数
  })

  it('formatRate：<1KB/s 收敛成「<1 KB/s」，避免「512.3 B/s」这种读数', () => {
    expect(formatRate(0)).toBe('')
    expect(formatRate(512)).toBe('<1 KB/s')
    expect(formatRate(1024)).toBe('1.0 KB/s')
    expect(formatRate(92.3 * 1024)).toBe('92.3 KB/s')
  })

  it('formatUptime：从秒到 w/d/h/m，全部为 0 时回落到秒', () => {
    expect(formatUptime(45)).toBe('45s')
    expect(formatUptime(12 * 60)).toBe('12m')
    expect(formatUptime(3 * 3600 + 5 * 60)).toBe('3h5m')
    expect(formatUptime(2405880)).toBe('3w6d20h18m')
    expect(formatUptime(Number.NaN, t)).toBe('list.none')
    // 尾部的零不写（对齐 FinalShell）：`9w3d5h0m` 写成 `9w3d5h`，整周写成 `2w`
    expect(formatUptime(9 * 604800 + 3 * 86400 + 5 * 3600)).toBe('9w3d5h')
    expect(formatUptime(2 * 604800)).toBe('2w')
    expect(formatUptime(3 * 3600)).toBe('3h')
    expect(formatUptime(3 * 86400 + 5 * 60)).toBe('3d0h5m') // 中间必要的零要留
  })

  it('statsPair：任一侧缺失或总量为 0 都退化「无」；同单位只写一次', () => {
    expect(statsPair(1024, 0, t)).toBe('list.none')
    expect(statsPair(Number.NaN, 1024, t)).toBe('list.none')
    expect(statsPair(0, 1024)).toBe('0 B/1.0 KB') // 单位不同：两侧都留
    expect(statsPair(1024, 2048)).toBe('1.0/2.0 KB') // 同单位：省掉一次
    expect(statsPair(52.3 * 2 ** 30, 62.3 * 2 ** 30)).toBe('52.3/62.3 GB')
  })

  it('statsRate：非有限/负数 → 「无」', () => {
    expect(statsRate(Number.NaN, t)).toBe('list.none')
    expect(statsRate(-1, t)).toBe('list.none')
    expect(statsRate(0)).toBe('0 B/s')
  })
})

describe('极简模式：趋势线与网络量纲（2026-10-31）', () => {
  it('sparklinePath：三点线性映射成 M/L，越界值夹到量程内', () => {
    expect(sparklinePath([1, 2, 3], 100, 16, { min: 0, max: 4 })).toBe('M0 12 L50 8 L100 4')
    expect(sparklinePath([-5, 5], 100, 16, { min: 0, max: 4 })).toBe('M0 16 L100 0')
  })

  it('sparklinePath：缺口（null / NaN）断线，不补值不插值', () => {
    expect(sparklinePath([1, null, 3], 100, 16, { min: 0, max: 4 })).toBe('M0 12 M100 4')
    expect(sparklinePath([1, Number.NaN, 3, 4], 90, 16, { min: 0, max: 4 })).toBe('M0 12 M60 4 L90 0')
  })

  it('sparklineArea：每段折线各自闭合到底部，缺口不连成梯形', () => {
    expect(sparklineArea([1, 2, 3], 100, 16, { min: 0, max: 4 })).toBe('M0 16 L0 12 L50 8 L100 4 L100 16 Z')
    // 两段各只有 1 个点：画不出面，返回空串（与折线同一条「少于两个点不画」）
    expect(sparklineArea([1, null, 3], 100, 16, { min: 0, max: 4 })).toBe('')
    expect(sparklineArea([1, 2, null, 3, 4], 100, 20, { min: 0, max: 4 })).toBe(
      'M0 20 L0 15 L25 10 L25 20 Z M75 20 L75 5 L100 0 L100 20 Z',
    )
    expect(sparklineArea(null, 100, 16)).toBe('')
  })

  it('sparklinePath：少于两个点不画（一个点画出来是误导）', () => {
    expect(sparklinePath([1], 100, 16, { min: 0, max: 4 })).toBe('')
    expect(sparklinePath([], 100, 16)).toBe('')
    expect(sparklinePath(null, 100, 16)).toBe('')
  })

  it('sparklinePath：对数刻度下低值不再被压成贴底直线', () => {
    const linear = sparklinePath([1, 8, 64], 100, 16, { min: 0, max: 64 })
    const log = sparklinePath([1, 8, 64], 100, 16, { min: 0, max: 64, logarithmic: true })
    expect(linear).toBe('M0 15.75 L50 14 L100 0')
    // 对数刻度：1KB 也爬到 13.34、8KB 到 7.58；线性把前两点压到 15.75 / 14（几乎同高，看不出起伏）
    expect(log).toBe('M0 13.34 L50 7.58 L100 0')
  })

  /**
   * 幂次刻度（2026-10-31）：明细仪表盘的网络图用它，**不是**对数。
   *
   * 三个候选各自的毛病（同一组数据：常态 1.2 MB/s、突发 9.8 MB/s、量程 20 MB）：
   *   - 线性：突发占满，常态那一段被压到贴底（差距最大，但日常看不出起伏）；
   *   - 对数：上段被压得太狠（`58K ↔ 163K` 只差 8% 高度），日常波动全抹平；
   *   - 0.5 次幂：居中——同量级内的起伏还在，跨数量级的突发也不至于把常态压没。
   */
  it('sparklinePath：power=0.5 是线性与对数之间的折中（默认仍是线性）', () => {
    const ysOf = (options: { power?: number, logarithmic?: boolean }) => {
      const d = sparklinePath([1_200_000, 9_800_000], 100, 16, { min: 0, max: 20_000_000, ...options })
      return d.match(/-?\d+(?:\.\d+)?/g)!.map(Number).filter((_n, index) => index % 2 === 1)
    }
    const linear = ysOf({})
    const sqrt = ysOf({ power: 0.5 })
    const log = ysOf({ logarithmic: true })
    // 常态（1.2 MB）在轴上的高度占比：线性 6%（贴底）→ sqrt 24%（下半段偏中）→ 对数 83%（贴顶）
    const normalHeight = (ys: number[]) => 1 - ys[0] / 16
    expect(normalHeight(linear)).toBeLessThan(0.1)
    expect(normalHeight(sqrt)).toBeGreaterThan(0.2)
    expect(normalHeight(sqrt)).toBeLessThan(0.45)
    expect(normalHeight(log)).toBeGreaterThan(0.7)
    // 突发与常态之间的落差：对数把上段压得太狠（2px），sqrt 保留得比它多得多
    const spread = (ys: number[]) => Math.abs(ys[0] - ys[1])
    expect(spread(sqrt)).toBeGreaterThan(spread(log) * 2)
    // 三条轴在「峰值不贴顶」这一点上一致（量程由 chartCeiling 给，留了余量）
    for (const ys of [linear, sqrt, log]) expect(Math.min(...ys)).toBeGreaterThan(0)
    // 不传 power = 线性（老调用方行为不变）
    expect(ysOf({ power: 1 })).toEqual(linear)
  })

  it('netScaleCeiling：地板 64KB/s，按 ×4 档抬高；窗口峰值不改变常态量程', () => {
    expect(netScaleCeiling(0)).toBe(64 * 1024)
    expect(netScaleCeiling(64 * 1024)).toBe(64 * 1024)
    expect(netScaleCeiling(100 * 1024)).toBe(256 * 1024)
    expect(netScaleCeiling(300 * 1024)).toBe(1024 * 1024)
    expect(netScaleCeiling(Number.NaN)).toBe(64 * 1024)
  })

  it('statsRateCompact：极简条用的紧凑速率（10 以上不留小数）', () => {
    expect(statsRateCompact(512)).toBe('512B')
    expect(statsRateCompact(32 * 1024)).toBe('32K')
    expect(statsRateCompact(130.7 * 1024)).toBe('131K')
    expect(statsRateCompact(1.2 * 1024 ** 2)).toBe('1.2M')
    expect(statsRateCompact(9.9 * 1024)).toBe('9.9K')
    expect(statsRateCompact(Number.NaN)).toBe('')
  })
})

describe('状态条三档循环（完整 → 极简 → 隐藏 → 完整）', () => {
  it('按固定顺序循环，未知取值回落到完整', () => {
    expect(nextStatsStyle('full')).toBe('minimal')
    expect(nextStatsStyle('minimal')).toBe('off')
    expect(nextStatsStyle('off')).toBe('full')
    // 旧 localStorage 值 / 手改坏了：不能卡在未知档
    expect(nextStatsStyle('bogus')).toBe('full')
    expect(nextStatsStyle(undefined)).toBe('full')
  })
})

describe('明细仪表盘（悬浮卡片）的纯逻辑', () => {
  it('statsLevel：80 是唯一的警戒阈值（折线上那条虚线画在同一处）', () => {
    expect(STATS_WARN_LIMIT).toBe(80)
    expect(statsLevel(0)).toBe('')
    // 79.9 还在虚线下面 → 不告警。70 这一档是 2026-11-01 统一掉的（否则 72% 的线
    // 已经变橙、却还在虚线下面，两个信号自相矛盾）
    expect(statsLevel(70)).toBe('')
    expect(statsLevel(79.9)).toBe('')
    expect(statsLevel(80)).toBe('warn')
    expect(statsLevel(89.9)).toBe('warn')
    expect(statsLevel(90)).toBe('danger')
    expect(statsLevel(100)).toBe('danger')
    // 没有数据（null / NaN）不是「正常」，也不是告警：什么都不写
    expect(statsLevel(null)).toBe('')
    expect(statsLevel(Number.NaN)).toBe('')
  })

  it('coresLevel：取最差的一核（平均值会把一核 95% 摊平）', () => {
    expect(coresLevel([10, 20, 30])).toBe('')
    expect(coresLevel([10, 82, 30])).toBe('warn')
    expect(coresLevel([10, 82, 95])).toBe('danger')
    expect(coresLevel([])).toBe('')
    expect(coresLevel(null)).toBe('')
  })

  it('chartCeiling：1-2-5 刻度的上限，且永远 > 峰值', () => {
    expect(chartCeiling(0)).toBe(1)
    expect(chartCeiling(90)).toBe(200) // 90*1.15=103.5 → 200
    expect(chartCeiling(1000)).toBe(2000)
    expect(chartCeiling(3000)).toBe(5000)
    expect(chartCeiling(950_000)).toBe(2_000_000)
    expect(chartCeiling(Number.NaN)).toBe(1)
  })

  it('procRows：过滤坏行、按 CPU 降序、只留前 limit 条', () => {
    const rows = procRows([
      { pid: 1, cmd: 'node', cpuPct: 12.4, memPct: 4.2 },
      { pid: 2, cmd: '', cpuPct: 99, memPct: 1 },
      null,
      { pid: 3, cmd: 'docker', cpuPct: 51.2, memPct: 9.9 },
      { pid: 4, cmd: 'nginx', cpuPct: 1.2, memPct: 0.8 },
      { pid: 5, cmd: 'a', cpuPct: 2 },
      { pid: 6, cmd: 'b', cpuPct: 3 },
      { pid: 7, cmd: 'c', cpuPct: 4 },
    ])
    expect(rows.map((row) => row.cmd)).toEqual(['docker', 'node', 'c', 'b', 'a'])
    expect(rows[0]).toEqual({ pid: 3, cmd: 'docker', name: 'docker', cpuPct: 51.2, memPct: 9.9, level: '' })
    // 缺 memPct 按 0 处理（旧版宿主 / 第三方实现的字段可能缺）
    expect(rows[4].memPct).toBe(0)
    expect(procRows(undefined)).toEqual([])
  })

  it('procDisplayName：macOS 的完整路径只显示可执行文件名（卡片那一列放不下路径）', () => {
    expect(procDisplayName('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')).toBe('Google Chrome')
    expect(procDisplayName('/opt/homebrew/opt/node/bin/node')).toBe('node')
    /*
     * 宿主送来的长路径是**保留尾部**的（`cleanProcName` 砍头留尾），于是长这样：
     * `…/Contents/MacOS/Google Chrome`。取 basename 后仍必须是完整的可执行文件名——
     * 否则卡片上就会出现 `Ecosystem.fra…` 那种路径碎片。
     */
    expect(procDisplayName('…/Contents/MacOS/Google Chrome')).toBe('Google Chrome')
    expect(procDisplayName('…/Frameworks/Ecosystem.framework/Versions/A/Resources/Ecosystem')).toBe('Ecosystem')
    expect(procDisplayName('node')).toBe('node')
    expect(procDisplayName('')).toBe('')
    // 只有裸名字（Linux comm）时原样返回，不会把名字切没
    expect(procDisplayName('[kworker/0:1]')).toBe('[kworker/0:1]')
  })

  it('procRows：行的 name 是文件名，cmd 保留完整路径（给 tooltip）', () => {
    const rows = procRows([{ pid: 9, cmd: '/usr/bin/dockerd', cpuPct: 3, memPct: 1 }])
    expect(rows[0].name).toBe('dockerd')
    expect(rows[0].cmd).toBe('/usr/bin/dockerd')
  })

  it('procRows：CPU 过 70 的进程带档位（卡片上变橙）', () => {
    const rows = procRows([{ pid: 1, cmd: 'hot', cpuPct: 82, memPct: 1 }])
    expect(rows[0].level).toBe('warn')
  })

  /* ---------------- 点表头切排序（2026-10-31） ---------------- */

  const SAMPLE = [
    { pid: 1, cmd: 'node', cpuPct: 12, memPct: 4 },
    { pid: 2, cmd: 'chrome', cpuPct: 3, memPct: 8 },
    { pid: 3, cmd: 'dockerd', cpuPct: 6, memPct: 3 },
  ]

  it('procRows：排序键可切到内存，方向可切升序（默认仍是 CPU 降序）', () => {
    expect(procRows(SAMPLE, 5).map((row) => row.cmd)).toEqual(['node', 'dockerd', 'chrome'])
    expect(procRows(SAMPLE, 5, { key: 'cpu', dir: 'desc' }).map((row) => row.cmd)).toEqual(['node', 'dockerd', 'chrome'])
    expect(procRows(SAMPLE, 5, { key: 'cpu', dir: 'asc' }).map((row) => row.cmd)).toEqual(['chrome', 'dockerd', 'node'])
    expect(procRows(SAMPLE, 5, { key: 'mem', dir: 'desc' }).map((row) => row.cmd)).toEqual(['chrome', 'node', 'dockerd'])
    expect(procRows(SAMPLE, 5, { key: 'mem', dir: 'asc' }).map((row) => row.cmd)).toEqual(['dockerd', 'node', 'chrome'])
    // 排序影响的是「取前 N 条」，不只是顺序
    expect(procRows(SAMPLE, 2, { key: 'mem', dir: 'desc' }).map((row) => row.cmd)).toEqual(['chrome', 'node'])
  })

  it('procRows：脏排序参数退回默认（不让 DOM 里拼错的值把卡片清空）', () => {
    expect(normalizeProcSort(null)).toEqual({ key: 'cpu', dir: 'desc' })
    expect(normalizeProcSort('mem')).toEqual({ key: 'cpu', dir: 'desc' })
    expect(normalizeProcSort({ key: 'gpu', dir: 'up' })).toEqual({ key: 'cpu', dir: 'desc' })
    expect(normalizeProcSort({ key: 'mem' })).toEqual({ key: 'mem', dir: 'desc' })
    expect(procRows(SAMPLE, 5, { key: 'gpu', dir: 'sideways' }).map((row) => row.cmd)).toEqual(['node', 'dockerd', 'chrome'])
  })

  it('nextProcSort：同列翻方向，换列回到降序', () => {
    const start = { key: 'cpu', dir: 'desc' }
    expect(nextProcSort(start, 'cpu')).toEqual({ key: 'cpu', dir: 'asc' })
    expect(nextProcSort({ key: 'cpu', dir: 'asc' }, 'cpu')).toEqual({ key: 'cpu', dir: 'desc' })
    // 换列：先看谁最高（降序），再点才看最低
    expect(nextProcSort(start, 'mem')).toEqual({ key: 'mem', dir: 'desc' })
    expect(nextProcSort({ key: 'mem', dir: 'asc' }, 'mem')).toEqual({ key: 'mem', dir: 'desc' })
    // 未知列：状态不变
    expect(nextProcSort(start, 'gpu')).toEqual(start)
  })

  /* ---------------- 进程名首尾截断（2026-10-31） ---------------- */

  /** 等宽字体：每个码点 7px（测试里就是「每字符 7」的确定性度量）。 */
  const mono = (text: string) => [...text].length * 7

  it('truncateMiddle：放得下就原样返回（不碰短名字）', () => {
    expect(truncateMiddle('node', 7 * 20, mono)).toBe('node')
    expect(truncateMiddle('', 100, mono)).toBe('')
    // 度量不可用时原样返回，交给 CSS 的 ellipsis 兜底
    expect(truncateMiddle('abcdefghij', 0, mono)).toBe('abcdefghij')
    expect(truncateMiddle('abcdefghij', 35, undefined as unknown as (text: string) => number)).toBe('abcdefghij')
  })

  it('truncateMiddle：头尾都留（不是纯尾部省略号）', () => {
    expect(truncateMiddle('abcdefghij', 7 * 5, mono)).toBe('ab…ij')
    const long = 'com.apple.WebKit.WebContent (Renderer)'
    const shown = truncateMiddle(long, 7 * 20, mono)
    expect(shown).toContain('…')
    expect(shown.startsWith('com.')).toBe(true)
    expect(shown.endsWith('(Renderer)')).toBe(true)
    expect(mono(shown)).toBeLessThanOrEqual(7 * 20)
    expect([...shown].length).toBe(20)
  })

  it('truncateMiddle：能区分的尾部优先保住（同前缀的 XPC 服务靠它认）', () => {
    const budget = 7 * 18
    const gpu = truncateMiddle('com.apple.WebKit.WebContent (GPU)', budget, mono)
    const renderer = truncateMiddle('com.apple.WebKit.WebContent (Renderer)', budget, mono)
    expect(gpu.endsWith('(GPU)')).toBe(true)
    expect(renderer.endsWith('(Renderer)')).toBe(true)
    // 两者截断后仍然不同——否则用户在卡片上看到的还是两个一样的字符串
    expect(gpu).not.toBe(renderer)
    expect(mono(gpu)).toBeLessThanOrEqual(budget)
    expect(mono(renderer)).toBeLessThanOrEqual(budget)
  })

  it('truncateMiddle：宽度按真实字宽算（中文按 2 倍宽时不会超预算）', () => {
    const cjk = (text: string) => [...text].reduce((sum, ch) => sum + ((ch.codePointAt(0) ?? 0) > 0x2e80 ? 14 : 7), 0)
    const shown = truncateMiddle('工具栏进程（渲染器）', 14 * 5, cjk)
    expect(cjk(shown)).toBeLessThanOrEqual(14 * 5)
    expect(shown).toContain('…')
    // 预算小到连一个字符都放不下时，只剩省略号
    expect(truncateMiddle('abcdefghij', 3, mono)).toBe('…')
  })
})

/**
 * 低频字段合并（2026-10-31，用户报「怎么一闪一闪的」）。
 *
 * 症状：SSH 会话的明细仪表盘里，进程卡片每秒在「5 行列表」与「暂无进程数据」之间翻。
 * 根因在宿主节奏与客户端判据的错位：远端 awk 把 `ps` 压到 **5 拍一次**（`tick % 5 == 1`），
 * 于是 1 秒一帧里只有 1 帧带 `procs`；客户端把「帧里没有这个键」读成「采不到」→ 卡片掉回
 * 空态，下一秒又出现。
 *
 * 这里钉纯函数那一半（`mergeOptionalStats`）：缺席沿用上一帧、带了就覆盖、**非可选字段
 * 绝不沿用**（沿用等于把旧值当新值显示）。渲染那一半在 preview 场景 `stats-sparse` 里用
 * 真 DOM 逐 100ms 采样验「一次都没掉回空态」。
 */
describe('低频字段合并（可选字段缺席 ≠ 没数据）', () => {
  const procs = [{ pid: 7, cmd: '/usr/bin/node', cpuPct: 12, memPct: 4 }]
  const cores = [10, 20, 30, 40]

  it('本帧缺席 → 沿用上一帧（进程卡片不该掉回「暂无」）', () => {
    const prev = { cpuPct: 12, cores: 4, cpuCores: cores, procs }
    const next = { cpuPct: 18, cores: 4 }
    const merged = mergeOptionalStats(prev, next)
    expect(merged.procs).toBe(procs)
    expect(merged.cpuCores).toBe(cores)
    expect(merged.cpuPct).toBe(18) // 本帧的实测值优先
  })

  it('本帧带了 → 用本帧的（5 秒一次的新数据要盖掉旧的）', () => {
    const fresh = [{ pid: 8, cmd: '/usr/bin/dockerd', cpuPct: 3, memPct: 1 }]
    const merged = mergeOptionalStats({ cpuPct: 5, procs, cpuCores: cores }, { cpuPct: 6, procs: fresh })
    expect(merged.procs).toBe(fresh)
  })

  it('空数组按「缺席」处理（sanitize 后可能是空壳，不能把列表清空）', () => {
    const merged = mergeOptionalStats({ procs, cpuCores: cores }, { procs: [], cpuCores: [] })
    expect(merged.procs).toBe(procs)
    expect(merged.cpuCores).toBe(cores)
  })

  it('上一帧也没有 → 保持缺席（真的从没采到过才显示「暂无」）', () => {
    const merged = mergeOptionalStats({ cpuPct: 5 }, { cpuPct: 6 })
    expect('procs' in merged).toBe(false)
    expect('cpuCores' in merged).toBe(false)
    // 上一帧带的是空壳也不许把空数组塞进来
    const merged2 = mergeOptionalStats({ procs: [], cpuCores: [] }, { cpuPct: 6 })
    expect('procs' in merged2).toBe(false)
  })

  it('非可选字段绝不沿用（内存/网速是每帧实测，沿用等于显示旧值却看不出旧）', () => {
    const merged = mergeOptionalStats(
      { cpuPct: 99, memPct: 42, rxRate: 1024, tempC: 55 },
      { cpuPct: 5 },
    )
    expect(merged.memPct).toBeUndefined()
    expect(merged.rxRate).toBeUndefined()
    expect(merged.tempC).toBeUndefined()
  })

  it('不改入参、first frame / 脏 prev 都不炸', () => {
    const next = { cpuPct: 5, procs }
    const copy = { ...next }
    expect(mergeOptionalStats(null, next)).toEqual(copy)
    expect(mergeOptionalStats(undefined, next)).toEqual(copy)
    // 脏 prev（字符串 / 数组 / null 混进来）按「没有上一帧」处理
    expect(mergeOptionalStats('junk', { cpuPct: 5 })).toEqual({ cpuPct: 5 })
    expect(mergeOptionalStats([1, 2], { cpuPct: 5 })).toEqual({ cpuPct: 5 })
    // 入参没被改：next 不带 procs 时，合并结果里有，next 里仍然没有
    const bare = { cpuPct: 5 }
    const merged = mergeOptionalStats({ procs }, bare)
    expect('procs' in bare).toBe(false)
    expect(merged.procs).toBe(procs)
  })
})
