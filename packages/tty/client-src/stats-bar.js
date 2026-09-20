/**
 * @hyzyn/dsh-tty — 服务器状态条的「每条显示什么」与固定字符槽位（纯逻辑）。
 *
 * 为什么单独成文件：`client-src/index.js` 是浏览器 IIFE 入口、没有导出，渲染逻辑放在
 * 里面就只能靠真机点。这里把「宿主 stats 帧 → 每条的文本 / 进度」抽成纯函数，vitest
 * 直接钉住（esbuild 打包时按普通本地模块内联，产物形态不变）——与 `status-line.js`
 * 同一套做法。顺带把两个通用格式化（`formatBytes` / `formatRate`）搬进来：状态条要用
 * 它们算「已用/总量」与速率，而它们本来就只是纯字符串函数，独立出来后终于有测试覆盖。
 *
 * 实测踩过的 bug（用户报「状态条**定期闪动**」）：状态条原本每秒把整条 `innerHTML`
 * 重建**两次**（stats 帧一次 + 1s 陈旧检测定时器一次），而值文本的宽度随位数变
 * （CPU `5%` ↔ `12%`、TCP `36` ↔ `1024`、内存 `9.2 GB` ↔ `17.8 GB`）——只要有一个值
 * 多了一位，它**后面所有条目就被推着横移**。headless 实测（scripts/preview 夹具、
 * 8 秒、每 100ms 采样）：60 次位置变化，单次最大 26px，视觉上就是整条在一格一格地跳。
 * 修法两条：
 *   1. 每个值有**固定字符槽位**（`slot`，mono 字体下 1ch = 1 字符，值右对齐）：
 *      位数变化不再改宽度，后面的条目纹丝不动；
 *   2. 渲染改成增量更新（见 index.js 的 `applyStatsBarInner`）：条目只建一次，之后
 *      只写真的变了的文本，CSS 过渡也能真正跑起来（原来元素每秒被重建，过渡永远被重置）。
 *
 * `slot` 的口径是「**装得下该字段的现实最大值**」：装不下不是崩溃，只是那一条仍会推挤
 * 后面的条目，所以 `test/stats-bar.test.ts` 用一批边界帧把「值的字符数 ≤ slot」钉住。
 * 两个刻意的例外：
 *   - `在线` 给到 13 字符：`w/d/h/m` 四级全满（`5217w6d23h59m`）——100 年开机上限；
 *   - `网络` 的槽位**随有没有速率**给（`NET_SLOT` / 0）：速率是每秒都在变的活数据，
 *     不给槽位的话它自己的宽度就每秒伸缩；可没有速率时（macOS 本地、采集失败）那 20 多
 *     字符的空位又是白占，所以「有数据才占位」——切换只在速率出现/消失时发生一次。
 */

/**
 * 字节数 → 人类可读（`17.8 GB`）。非正数 / 非有限值返回空串，由调用方决定退化成什么
 * （「无」、`0 B`、`—`）。≥100 时不留小数，避免 `100.0 GB` 这种占宽却零信息的写法。
 */
export function formatBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n < 1024) return String(n) + ' B'
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = n
  let index = -1
  do {
    value /= 1024
    index += 1
  } while (value >= 1024 && index < units.length - 1)
  return (value >= 100 ? value.toFixed(0) : value.toFixed(1)) + ' ' + units[index]
}

/** 速率格式化（bytes/s）：整数化避免「512.3 B/s」这类小数值。 */
export function formatRate(bytesPerSec) {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return ''
  if (bytesPerSec < 1024) return '<1 KB/s'
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytesPerSec
  let index = -1
  do {
    value /= 1024
    index += 1
  } while (value >= 1024 && index < units.length - 1)
  return (value >= 100 ? value.toFixed(0) : value.toFixed(1)) + ' ' + units[index] + '/s'
}

/** 进度条档位：<70 正常 / 70~90 黄 / >=90 红。 */
export function statsLevel(pct) {
  if (!Number.isFinite(pct)) return ''
  if (pct >= 90) return 'danger'
  if (pct >= 70) return 'warn'
  return ''
}

/** 速率条目用：<1KB/s 直接用 B/s（采集端给的就是 B/s），大值复用 formatRate 的 K/M/G。 */
export function statsRate(value) {
  if (!Number.isFinite(value) || value < 0) return '无'
  if (value < 1024) return Math.round(value) + ' B/s'
  return formatRate(value) || '无'
}

/** uptime 秒 → FinalShell 风格（2w4d7h16m / 3h5m / 12m / 45s）。 */
export function formatUptime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '无'
  const total = Math.floor(sec)
  const weeks = Math.floor(total / 604800)
  const days = Math.floor((total % 604800) / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const parts = []
  if (weeks > 0) parts.push(weeks + 'w')
  if (weeks > 0 || days > 0) parts.push(days + 'd')
  if (weeks > 0 || days > 0 || hours > 0) parts.push(hours + 'h')
  if (weeks > 0 || days > 0 || hours > 0 || minutes > 0) parts.push(minutes + 'm')
  return parts.length > 0 ? parts.join('') : total + 's'
}

/** 「已用/总量」对：任一侧缺失或总量为 0 都退化成「无」。 */
export function statsPair(used, total) {
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) return '无'
  return (formatBytes(used) || '0 B') + '/' + (formatBytes(total) || '0 B')
}

/**
 * 帧字段的客户端兜底校验：宿主已经清洗过一遍（服务端 `sanitizeStatsFrame`），但旧版宿主、
 * 第三方实现或调试用假数据都可能塞进任意值——不合法的一律当「无」，绝不让状态条渲染出
 * 负数、NaN 或天文数字（界面不能因为数据坏而变形）。
 */
export function statsNum(stats, key) {
  const value = stats[key]
  if (!Number.isFinite(value)) return null
  // 边界与服务端 stats.ts 的 LIMITS 同口径：两边都挡，脏数据进不来也渲染不出去
  if (key === 'tempC') return value > -100 && value < 200 ? value : null
  if (key === 'cores') return value >= 1 && value <= 4096 ? value : null
  if (key === 'cpuPct' || key === 'memPct' || key === 'diskPct') return value >= 0 && value <= 100 ? value : null
  if (key === 'uptimeSec') return value >= 0 && value <= 100 * 365 * 24 * 3600 ? value : null
  if (key === 'tcpConns') return value >= 0 && value <= 10000000 ? value : null
  if (key === 'rxRate' || key === 'txRate') return value >= 0 && value <= 2 ** 40 ? value : null
  return value >= 0 && value <= 2 ** 50 ? value : null // 字节类
}

/** stats 帧的字段全集（保持与服务端 STATS_KEYS 同序）。 */
export const STATS_FIELDS = ['cpuPct', 'cores', 'memUsed', 'memTotal', 'memPct', 'diskUsed', 'diskTotal', 'diskPct', 'uptimeSec', 'tcpConns', 'rxRate', 'txRate', 'tempC']

/** 至少一个字段能用于渲染——否则视为「无数据」整条隐藏，而不是显示一排「无」。 */
export function hasUsableStats(stats) {
  if (stats === null || typeof stats !== 'object' || Array.isArray(stats)) return false
  return STATS_FIELDS.some((key) => statsNum(stats, key) !== null)
}

/**
 * 「有数据」窗口：超过这么久没收到 stats 帧就整条隐藏（插件关闭、远端无 /proc、采集失败）。
 *
 * 为什么是 8 秒而不是 3 秒（D50，用户报「整条状态条瞬间消失又出现」）：宿主侧某个采集
 * 子进程一旦变慢，帧间隔就会从 1s 拉长（实测那台 macOS 上 `netstat -ib` 要 30s，被 3s
 * 超时砍掉 → 每帧 3s、tick 被 busy 守卫跳过 → **帧间隔 4s**）。3s 的窗口正好卡在中间：
 * 每 4 秒里有 1 秒整条被收起、下一帧又出现——就是「定期闪动」。窗口给到 8 秒，等于允许
 * 连丢几拍仍继续显示上一帧的值；真停了（插件禁用 / 远端死掉）也只是晚 8 秒收起。
 */
export const STATS_STALE_MS = 8000

/** 该标签的 stats 还算「新鲜」吗（宿主 1s 一帧；8s 没新帧才认为采集停了）。 */
export function statsFrameFresh(statsAt, now = Date.now()) {
  return now - (statsAt || 0) <= STATS_STALE_MS
}

/**
 * `网络` 有速率时的固定槽位：`↓112.5 MB/s ↑112.5 MB/s` = 23 字符（千兆口满速的读数）。
 * 速率本来就是每秒都在变的活数据——不给槽位的话，虽然它是最后一条、不会推动别人，
 * 但**它自己**的宽度每秒都在伸缩，看上去仍是「状态条在跳」。速率缺席（macOS 本地、
 * 采集失败）时反而**不留**槽位：那 20 多字符的空位只在有数据时才值得占。
 */
const NET_SLOT = 23

/**
 * 条目形状：顺序固定（对齐 FinalShell 的会话监控条），渲染器与 DOM 复用都读它。
 *
 * `kind` 决定值怎么算，`slot` 是**值槽位的固定字符宽**（0 = 不固定，见文件头）。
 * DOM 层（index.js 的 `buildStatsBarDom`）按这份描述建一次节点，之后只改文本。
 */
export const STATS_ITEM_SPECS = [
  { key: 'cpuPct', label: 'CPU', kind: 'pct', slot: 4 }, // 100% = 4
  { key: 'memPct', label: '内存', kind: 'pct', slot: 4 },
  { key: 'diskPct', label: '磁盘', kind: 'pct', slot: 4 },
  { key: 'cores', label: '核心', kind: 'count', slot: 4 }, // 4096 = 4
  { key: 'mem', label: '内存', kind: 'pair', slot: 17, used: 'memUsed', total: 'memTotal' }, // 999.9 GB/999.9 GB = 17
  { key: 'uptimeSec', label: '在线', kind: 'uptime', slot: 13 }, // 上限 100 年 = 5217w6d23h59m = 13
  { key: 'tcpConns', label: 'TCP', kind: 'count', slot: 6 }, // 999999 = 6（1000 万连接只存在于脏数据里）
  { key: 'disk', label: '磁盘', kind: 'pair', slot: 17, used: 'diskUsed', total: 'diskTotal' },
  { key: 'tempC', label: 'CPU温度', kind: 'temp', slot: 8 }, // 199.9°C = 7 字符，但「°」在部分字体里按全角渲染，留一位
  { key: 'net', label: '网络', kind: 'net', slot: NET_SLOT }, // 有速率时用固定槽位；「无」时不留（见 statsItemValues）
]

/**
 * 一帧 stats → 每条的显示值（与 `STATS_ITEM_SPECS` 同序、等长）。
 *
 * 值只来自宿主发来的数值帧，标签 / 槽位是本地常量；`pct` 只有带迷你进度条的条目有，
 * 其余为 `null`。`slot` 允许被单条覆盖（网络：有速率才占槽位）。`title` 是悬停提示
 * （窄窗口溢出被裁时仍能看到完整值），由调用方用 `setAttribute` 写进去，因此这里
 * **不做** HTML 转义。
 *
 * @param stats 宿主 stats 帧；`null` / 非对象 / 脏数据一律渲染成「无」（不抛）。
 */
export function statsItemValues(stats) {
  const frame = stats !== null && typeof stats === 'object' && !Array.isArray(stats) ? stats : {}
  const num = (key) => statsNum(frame, key)
  /** 入口：值与槽位一起返回，DOM 层不必再回头查 spec。 */
  const make = (spec, value, pct, slot = spec.slot) => ({
    key: spec.key,
    label: spec.label,
    kind: spec.kind,
    slot,
    pct: pct ?? null,
    value,
    title: spec.label + ': ' + value,
  })
  return STATS_ITEM_SPECS.map((spec) => {
    if (spec.kind === 'pct') {
      const value = num(spec.key)
      return make(spec, value === null ? '无' : Math.round(value) + '%', value)
    }
    if (spec.kind === 'pair') return make(spec, statsPair(num(spec.used), num(spec.total)), null)
    if (spec.kind === 'uptime') return make(spec, formatUptime(num(spec.key)), null)
    if (spec.kind === 'temp') {
      const value = num(spec.key)
      return make(spec, value === null ? '无' : value.toFixed(1) + '°C', null)
    }
    if (spec.kind === 'net') {
      const rx = num('rxRate')
      const tx = num('txRate')
      if (rx === null && tx === null) return make(spec, '无', null, 0) // 没有速率：不给槽位（省 20 多字符）
      return make(spec, '↓' + statsRate(rx) + ' ↑' + statsRate(tx), null, NET_SLOT)
    }
    const value = num(spec.key) // kind === 'count'：核心 / TCP
    return make(spec, value === null ? '无' : String(value), null)
  })
}
