/**
 * @hyzyn/dsh-tty — 状态条条目的悬浮提示（「当前 / 峰值 / 上下文」两到三行）。
 *
 * 为什么要有它（2026-11-01，用户提议）：状态条每格只有一个瞬时读数，而「这台机器现在累不累」
 * 通常要跟**刚才**比——18% 是刚从 45% 掉下来，还是一直贴着 18%？完整模式此前只有原生
 * `title`（「CPU: 18%」），信息量不比条上多一个字，还慢（约 1s 才出）且样式不可控。
 *
 * 数据边界（**这是本模块的判据，不是实现细节**）：
 * - **当前值**只取本帧的 stats 帧（与状态条同一个来源，不额外请求）；
 * - **峰值**只能来自客户端自己攒的 `statsHistory`（宿主没有历史接口）——窗口是
 *   「最近 STATS_HISTORY_LEN 个采样 ≈ 近 1 分钟」，所以卡片脚注如实写「近 1 分钟」，
 *   不写「历史峰值」那种会让人以为是会话累计值的说法；
 * - 历史里的缺口（`null` / 非有限值）**不参与峰值**，也不当 0 用：一次采样失败不该
 *   把峰值压低，也不该冒出一个假峰值。
 *
 * 纯逻辑模块（与 stats-bar.js 同一条纪律）：DOM 与事件在 client-src/index.js，
 * 这里只做「一帧 + 一段历史 → 卡片的三行文本」，好让 vitest 直接钉住文案与边界。
 */

import { formatUptime, statsLevel, statsNum, statsPair, statsRateCompact } from './stats-bar.js'

/**
 * 历史窗口里某字段的峰值（缺口跳过）；窗口里一个可用样本都没有时返回 `null`。
 *
 * 刻意不把 `null` 当 0：状态条在采集失败时显示「无」，若峰值把缺口读成 0，一个刚
 * 掉线的采样就会把 45% 的峰值抹成 0——那是错的读数，不是保守的读数。
 */
export function seriesPeak(history, field) {
  if (!Array.isArray(history)) return null
  let peak = null
  for (const sample of history) {
    if (sample === null || typeof sample !== 'object') continue
    const value = sample[field]
    if (!Number.isFinite(value)) continue
    if (peak === null || value > peak) peak = value
  }
  return peak
}

/**
 * 第一行取值的**色档**：绿 / 橙 / 红三档，`statsLevel` 不告警时也要落到「绿」而不是留空。
 *
 * 为什么要它（2026-11-01，用户要求「这个文字颜色和折线的图统一一下」）：条上那枚迷你条、
 * 极简条的趋势线都是按档位着色的，而卡片的第一行原本用的是中性白——同一份数据，条上是绿的、
 * 点开是白的，看着像两回事。这里把「正常」也显式落成 `ok`，DOM 层据此给 `data-level`。
 * 只有**按档位着色**的那几格（CPU / 内存 / 磁盘）取这个值；在线 / 核心 / TCP / 温度在条上
 * 本来就是中性白，卡片保持一致。
 */
function toneOf(level) {
  return level === '' ? 'ok' : level
}

/** 百分比读数：取整（与状态条同口径，卡片上不出现 `17.6%` 这种占宽又无意义的小数）。 */
function pctText(value, t) {
  return value === null ? t('list.none') : Math.round(value) + '%'
}

/** 速率方向（`↓877K`）：卡片窄，用极简条的紧凑写法；缺数据时与状态条一样显示「无」。 */
function rateText(value, arrow, t) {
  return arrow + (value === null ? t('list.none') : statsRateCompact(value))
}

/**
 * 网络那一格的分段：`↓下行` 与 `↑上行` **分开着色**，与状态条 / 极简条同色
 * （下行走 `--tt-term-stats-rx`、上行走 `--tt-term-stats-tx`）。
 *
 * 为什么要分段（2026-11-01，用户截图：「这个文字颜色没对上」）：条上那两个箭头是蓝 / 青两色，
 * 卡片里原本是一整个中性白的字符串，同一屏上同一组数字出现两种观感。
 * 中间那段空格也放进分段里，是为了让 DOM 里的文本与 `value`（无障碍 / 测试用）逐字一致。
 */
function netSegments(rx, tx, t) {
  return [
    { text: rateText(rx, '↓', t), tone: 'rx' },
    { text: ' ', tone: '' },
    { text: rateText(tx, '↑', t), tone: 'tx' },
  ]
}

/**
 * 一帧 stats + 一段历史 → 悬浮卡片的模型。
 *
 * 返回的 `label/value` 是**第一行**（强调的当前读数），`rows` 是第二行起的次要信息
 * （峰值排第一，然后是上下文：核心数 / 已用 / 总量）。为什么峰值总在第一位：整张卡片
 * 的信息**只有一个对照轴**——「现在 vs 刚才」；把上下文夹在中间会让每次读它都要先分辨
 * 哪一格是对照值。
 *
 * @param {string} key 条目键（与 `statsItemSpecs(t)` 的 `key` 同集；极简条传 cpuPct / mem / net）
 * @param {object|null} stats 宿主 stats 帧（脏数据不抛，一律显示「无」）
 * @param {Array<object>|null} history 本地历史（`seriesPeak` 的样本源）
 * @param {(key: string, params?: Record<string, unknown>) => string} t 翻译函数
 * @returns {{ key: string, label: string, value: string, level: string, rows: Array<{label: string, value: string}>, foot: string, empty: boolean }}
 */
export function statsTipModel(key, stats, history, t) {
  const frame = stats !== null && typeof stats === 'object' && !Array.isArray(stats) ? stats : {}
  const num = (field) => statsNum(frame, field)
  const rows = []
  let sawPeak = false
  /** 峰值行（有样本才加）；`format` 决定它怎么念（百分比 / 速率 / 次数）。 */
  const pushPeak = (field, format) => {
    const peak = seriesPeak(history, field)
    if (peak === null) return
    sawPeak = true
    rows.push({ label: t('statsTip.peak'), value: format(peak) })
  }
  let label = t('statsTip.current')
  let value = t('list.none')
  /** 第一行的分段着色（目前只有网络那一格用得上；其余格为空数组 = 整段一个颜色）。 */
  let segments = []
  let level = ''
  /** 本格至少有一个**当前**读数（峰值 / 上下文行不算：它们补不出「现在是多少」）。 */
  let sawValue = false

  if (key === 'cpuPct') {
    const pct = num('cpuPct')
    value = pctText(pct, t)
    level = pct === null ? '' : toneOf(statsLevel(pct))
    sawValue = pct !== null
    pushPeak('cpuPct', (peak) => pctText(peak, t))
    const cores = num('cores')
    if (cores !== null) rows.push({ label: t('meta.cores'), value: String(cores) })
  } else if (key === 'mem') {
    const pct = num('memPct')
    value = pctText(pct, t)
    level = pct === null ? '' : toneOf(statsLevel(pct))
    sawValue = pct !== null
    pushPeak('memPct', (peak) => pctText(peak, t))
    const pair = statsPair(num('memUsed'), num('memTotal'), t)
    if (pair !== t('list.none')) rows.push({ label: t('statsTip.used'), value: pair })
  } else if (key === 'disk') {
    const pct = num('diskPct')
    const pair = statsPair(num('diskUsed'), num('diskTotal'), t)
    const hasPair = pair !== t('list.none')
    /*
     * 磁盘是**单调量**：它在「一分钟窗口」里几乎不动，给峰值只会变成一句噪声，所以这一格
     * 没有峰值行。百分比与已用/总量各占一行（合在一行反而比状态条上还挤）。
     */
    if (pct !== null) {
      label = t('statsTip.occupied')
      value = pctText(pct, t)
      level = toneOf(statsLevel(pct))
      sawValue = true
      if (hasPair) rows.push({ label: t('statsTip.used'), value: pair })
    } else if (hasPair) {
      label = t('statsTip.used')
      value = pair
      sawValue = true
    }
  } else if (key === 'uptimeSec') {
    label = t('meta.uptime')
    const uptime = num('uptimeSec')
    value = formatUptime(uptime, t)
    sawValue = uptime !== null
  } else if (key === 'tcpConns') {
    const conns = num('tcpConns')
    sawValue = conns !== null
    value = conns === null ? t('list.none') : String(conns)
    pushPeak('tcpConns', (peak) => String(Math.round(peak)))
  } else if (key === 'tempC') {
    const temp = num('tempC')
    sawValue = temp !== null
    value = temp === null ? t('list.none') : temp.toFixed(1) + '°C'
    pushPeak('tempC', (peak) => peak.toFixed(1) + '°C')
  } else if (key === 'cores') {
    label = t('meta.cores')
    const cores = num('cores')
    sawValue = cores !== null
    value = cores === null ? t('list.none') : String(cores)
  } else if (key === 'ping') {
    /*
     * 连接往返（仅 SSH 会话）：当前值给手感档位（与条上同色），峰值行给**最差**的那次——
     * 「现在 24ms、这一分钟最差 410ms」比只看当前值有用得多，抖动才是终端最难用的状态。
     */
    const ms = num('pingMs')
    sawValue = ms !== null
    value = ms === null ? t('list.none') : Math.round(ms) + 'ms'
    level = ms === null ? '' : toneOf(ms < 120 ? '' : ms < 300 ? 'warn' : 'danger')
    pushPeak('pingMs', (peak) => Math.round(peak) + 'ms')
  } else if (key === 'swap') {
    /*
     * 交换分区：**单调量**，与磁盘同一个处理（没有峰值行）——「已用/总量」本身就是读数。
     * 百分比不进第一行：这一格的可操作信息是「用掉多少」，不是「用了百分之几」。
     */
    const used = num('swapUsed')
    const total = num('swapTotal')
    const pair = statsPair(used, total, t)
    const hasPair = pair !== t('list.none')
    label = t('statsTip.used')
    value = hasPair ? pair : t('list.none')
    sawValue = hasPair
    if (hasPair && used !== null && total !== null && total > 0) {
      level = toneOf(statsLevel(Math.round((used * 100) / total)))
    }
  } else if (key === 'net') {
    const rx = num('rxRate')
    const tx = num('txRate')
    sawValue = rx !== null || tx !== null
    segments = netSegments(rx, tx, t)
    value = segments.map((part) => part.text).join('')
    /*
     * 两个方向各算各的峰值：上行与下行的量级常常不是一个数量级（下行 1.2M / 上行 8K），
     * 取 max 会把下行峰值重复写在两个箭头上。峰值行同样分段着色——它就在当前值正下方，
     * 同一组 ↓/↑ 一半有颜色一半没有，看着就是没对上。
     */
    const rxPeak = seriesPeak(history, 'rxRate')
    const txPeak = seriesPeak(history, 'txRate')
    if (rxPeak !== null || txPeak !== null) {
      sawPeak = true
      const peakSegments = netSegments(rxPeak, txPeak, t)
      rows.push({
        label: t('statsTip.peak'),
        value: peakSegments.map((part) => part.text).join(''),
        segments: peakSegments,
      })
    }
  }

  return {
    key,
    label,
    value,
    segments,
    level,
    rows,
    /*
     * 脚注只在**真的显示了峰值**时出现：没有峰值行的卡片（磁盘 / 在线 / 核心）写一个时间窗口
     * 没有任何修饰对象。文案复用仪表盘那条「近 1 分钟」——两处读的是同一份 statsHistory，
     * 窗口口径必须由同一个键说，不能一边叫「近 1 分钟」一边叫「近期」。
     */
    foot: sawPeak ? t('statsDash.lastMin') : '',
    empty: !sawValue && rows.length === 0,
  }
}
