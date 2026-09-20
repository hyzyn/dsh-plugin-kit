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
  STATS_ITEM_SPECS,
  STATS_STALE_MS,
  formatBytes,
  formatRate,
  formatUptime,
  hasUsableStats,
  statsFrameFresh,
  statsItemValues,
  statsNum,
  statsPair,
  statsRate,
} from '../client-src/stats-bar.js'

/** 一条「帧 → 值」的取值：槽位只认 order（与 STATS_ITEM_SPECS 同序），不认 key（内存/磁盘各有两条）。 */
const valuesOf = (stats) => statsItemValues(stats)

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
    const values = valuesOf(EXTREME)
    for (const item of values) {
      if (item.slot === 0) continue // 0 = 不固定（网络：最后一条的活数据）
      expect(item.value.length, `${item.label}「${item.value}」超出槽位 ${String(item.slot)}ch`).toBeLessThanOrEqual(item.slot)
    }
  })

  it('【本 bug】位数在变、槽位不变：CPU 5% ↔ 12% ↔ 100% 都不改任何条目的几何', () => {
    // 这些帧都没有速率 → 网络不占槽位；其余条目的槽位必须逐帧一致
    const expectedSlots = STATS_ITEM_SPECS.map((spec) => (spec.key === 'net' ? 0 : spec.slot))
    for (const frame of JITTER_FRAMES) expect(valuesOf(frame).map((item) => item.slot)).toEqual(expectedSlots)
    // 值本身确实在变（否则这个用例就是空的），但宽度来源只有槽位
    const cpuTexts = JITTER_FRAMES.map((frame) => valuesOf(frame)[0].value)
    expect(new Set(cpuTexts).size).toBeGreaterThan(1)
  })

  it('「网络」有速率才占槽位：活数据的宽度也不能每秒伸缩；没速率时不白留 20 多字符', () => {
    const net = STATS_ITEM_SPECS[STATS_ITEM_SPECS.length - 1]
    expect(net.key).toBe('net')
    expect(valuesOf(MACOS_LOCAL)[9].slot).toBe(0) // macOS 本地：网络 无
    const withRates = valuesOf({ ...MACOS_LOCAL, rxRate: 112.5 * 1024 ** 2, txRate: 112.5 * 1024 ** 2 })[9]
    expect(withRates.slot).toBe(net.slot)
    expect(withRates.value.length).toBeLessThanOrEqual(withRates.slot)
    expect(valuesOf({ ...MACOS_LOCAL, rxRate: 2 ** 40, txRate: 2 ** 40 })[9].value.length).toBeLessThanOrEqual(net.slot)
  })

  it('值与 spec 一一对应（DOM 层按同序建节点，错位就会写错格子）', () => {
    const values = valuesOf(MACOS_LOCAL)
    expect(values.map((item) => item.key)).toEqual(STATS_ITEM_SPECS.map((spec) => spec.key))
    expect(values.map((item) => item.label)).toEqual(STATS_ITEM_SPECS.map((spec) => spec.label))
    // 网络是唯一「槽位可以由单条值覆盖」的字段（有速率 = 占位，无速率 = 不占）
    expect(values.map((item) => item.slot)).toEqual(STATS_ITEM_SPECS.map((spec) => (spec.key === 'net' ? 0 : spec.slot)))
  })
})

describe('statsItemValues 的渲染口径', () => {
  it('macOS 本地帧：百分比取整、容量成对、采不到的项写「无」', () => {
    const values = valuesOf(MACOS_LOCAL)
    expect(values.map((item) => item.value)).toEqual([
      '5%', // CPU
      '56%', // 内存
      '2%', // 磁盘
      '10', // 核心
      '16.6 GB/29.8 GB', // 内存 已用/总量
      '3w6d20h18m', // 在线
      '36', // TCP
      '12.7 GB/862 GB', // 磁盘 已用/总量
      '无', // CPU温度（macOS 没有 sysfs）
      '无', // 网络（macOS 本地取不到速率时）
    ])
  })

  it('进度条的 pct 与值同源；「无」不给进度（pct=null，DOM 层画 0%）', () => {
    const values = valuesOf(MACOS_LOCAL)
    expect(values[0].pct).toBe(5)
    expect(values[8].value).toBe('无')
    expect(values[8].pct).toBeNull()
    expect(values[9].pct).toBeNull()
  })

  it('title 是「标签: 值」（窄窗口被裁时悬停可读全），不做 HTML 转义（DOM 层用 setAttribute）', () => {
    const values = valuesOf(MACOS_LOCAL)
    expect(values[0].title).toBe('CPU: 5%')
    expect(values[5].title).toBe('在线: 3w6d20h18m')
  })

  it('有速率时网络条显示 ↓/↑（B/s 走整数量级，KB/s 起复用 formatRate）', () => {
    expect(valuesOf({ ...MACOS_LOCAL, rxRate: 92.3 * 1024, txRate: 93.1 * 1024 })[9].value).toBe('↓92.3 KB/s ↑93.1 KB/s')
    expect(valuesOf({ ...MACOS_LOCAL, rxRate: 0, txRate: 512 })[9].value).toBe('↓0 B/s ↑512 B/s')
  })

  it('温度保留一位小数（Linux 上才有）', () => {
    expect(valuesOf({ ...MACOS_LOCAL, tempC: 62.45 })[8].value).toBe('62.5°C')
  })
})

describe('脏数据兜底（旧版宿主 / 第三方实现 / 假数据）', () => {
  const JUNK = [null, undefined, 'not-an-object', [1, 2, 3], 42, {}, { cpuPct: 'x', cores: -5, memUsed: 1e30, uptimeSec: Number.MAX_SAFE_INTEGER, tcpConns: -1, tempC: {} }]

  it('任何垃圾帧都不抛，且渲染不出 NaN / undefined / 负数 / 天文数字', () => {
    for (const junk of JUNK) {
      const values = valuesOf(junk)
      expect(values).toHaveLength(STATS_ITEM_SPECS.length)
      for (const item of values) {
        expect(item.value).not.toMatch(/NaN|undefined|Infinity|-5|e\+30/)
        expect(item.value.length).toBeLessThanOrEqual(item.slot === 0 ? 64 : item.slot)
      }
    }
  })

  it('越界的 pct 拿不到进度（不会把进度条画出容器）', () => {
    expect(statsNum({ cpuPct: 120 }, 'cpuPct')).toBeNull()
    expect(statsNum({ cpuPct: -1 }, 'cpuPct')).toBeNull()
    expect(valuesOf({ cpuPct: 120, cores: 8 })[0]).toMatchObject({ value: '无', pct: null })
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
    expect(formatUptime(Number.NaN)).toBe('无')
  })

  it('statsPair：任一侧缺失或总量为 0 都退化「无」', () => {
    expect(statsPair(1024, 0)).toBe('无')
    expect(statsPair(Number.NaN, 1024)).toBe('无')
    expect(statsPair(0, 1024)).toBe('0 B/1.0 KB')
  })

  it('statsRate：非有限/负数 → 「无」', () => {
    expect(statsRate(Number.NaN)).toBe('无')
    expect(statsRate(-1)).toBe('无')
    expect(statsRate(0)).toBe('0 B/s')
  })
})
