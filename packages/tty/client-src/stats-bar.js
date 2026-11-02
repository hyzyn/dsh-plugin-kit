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

/**
 * 告警阈值：越过它就转橙，**也是两条折线上那条虚线画的位置**。
 *
 * 2026-11-01 从 70 统一到 80：折线一旦带参考线，「线在哪、色从哪变」就必须是同一个数——
 * 否则 72% 的曲线已经变橙、却还在虚线下面，用户看到的是自相矛盾的两个信号。
 * 只留一个数（这个常量），进度条 / 每核柱 / 进程 CPU 列 / 折线都从这里取。
 */
export const STATS_WARN_LIMIT = 80

/** 进度条档位：<80 正常 / 80~90 橙 / >=90 红。 */
export function statsLevel(pct) {
  if (!Number.isFinite(pct)) return ''
  if (pct >= 90) return 'danger'
  if (pct >= STATS_WARN_LIMIT) return 'warn'
  return ''
}

/**
 * 速率条目用：<1KB/s 直接用 B/s（采集端给的就是 B/s），大值复用 formatRate 的 K/M/G。
 *
 * `t` 是**传进来的翻译函数**（不是 import 来的）：本文件是纯逻辑模块、要能进 vitest，
 * 而目录与 `t` 住在 `client-src/index.js`（浏览器 IIFE 入口，测试里 import 不动）。
 * 与 codegraph 的 pure.js 同一套做法——文案键由调用方注入，测试断言键而不是中文。
 */
export function statsRate(value, t) {
  if (!Number.isFinite(value) || value < 0) return t('list.none')
  if (value < 1024) return Math.round(value) + ' B/s'
  return formatRate(value) || t('list.none')
}

/**
 * uptime 秒 → FinalShell 风格（2w4d7h16m / 3h5m / 12m / 45s）。
 *
 * **尾部的零不写**（2026-10-31，对齐 FinalShell）：`9w3d5h0m` → `9w3d5h`、`2w0d0h0m` → `2w`。
 * 只去**尾部**的零——中间那些零是必要的（`3d0h5m` 去掉 0h 会读成 3 天 5 分）。
 */
export function formatUptime(sec, t) {
  if (!Number.isFinite(sec) || sec < 0) return t('list.none')
  const total = Math.floor(sec)
  const weeks = Math.floor(total / 604800)
  const days = Math.floor((total % 604800) / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  /** `[值, 单位]`；只要有任何更高位就保留这一位（哪怕它是 0），好让 `3d0h5m` 读得对。 */
  const parts = []
  if (weeks > 0) parts.push([weeks, 'w'])
  if (parts.length > 0 || days > 0) parts.push([days, 'd'])
  if (parts.length > 0 || hours > 0) parts.push([hours, 'h'])
  if (parts.length > 0 || minutes > 0) parts.push([minutes, 'm'])
  while (parts.length > 1 && parts[parts.length - 1][0] === 0) parts.pop()
  return parts.length > 0 ? parts.map(([value, unit]) => String(value) + unit).join('') : total + 's'
}

/**
 * 时钟文本（24 小时制、两位补零）：`09:05:03`。
 *
 * 不用 `toLocaleTimeString()`：它按宿主 locale 给 12 小时制或 `上午/AM` 这类前后缀，宽度随语言变
 * （`10:45:23 AM` 比 `10:45:23` 宽三分之一），而这一格是状态条右侧的**固定**宽度区，条宽不该被
 * 语言的时钟格式推着走。中文与英文界面都读得懂 24 小时制。
 *
 * @param {Date} date 取本地时间（用户看的是自己的时钟，不是 UTC）
 */
export function clockText(date) {
  const pad = (value) => (value < 10 ? '0' + value : String(value))
  return pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds())
}

/** 「已用/总量」对：任一侧缺失或总量为 0 都退化成「无」。 */
export function statsPair(used, total, t) {
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) return t('list.none')
  const usedText = formatBytes(used) || '0 B'
  const totalText = formatBytes(total) || '0 B'
  /*
   * 单位相同就只写一次（`52.3/62.3 GB`，FinalShell 的写法）：省 3 个字符，读起来也更像
   * 「已用/总量」而不是两个独立测量值。单位不同（`512 B/1.0 KB`）时两侧都保留——否则
   * `512/1.0 KB` 里的 512 就不知道是什么单位。
   */
  const usedUnit = / ([A-Z]+)$/.exec(usedText)
  const totalUnit = / ([A-Z]+)$/.exec(totalText)
  if (usedUnit !== null && totalUnit !== null && usedUnit[1] === totalUnit[1]) {
    return usedText.slice(0, -(usedUnit[1].length + 1)) + '/' + totalText
  }
  return usedText + '/' + totalText
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
  if (key === 'load1') return value >= 0 && value <= 100000 ? value : null // 与服务端 LIMITS 同口径
  if (key === 'pingMs') return value >= 0 && value <= 600000 ? value : null
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
 * **低频字段**：宿主不是每帧都带（每核 / Top 进程），缺席 ≠ 没数据。
 *
 * SSH 远端的常驻 awk 把 `ps` 压到 5 拍一次（`tick % 5 == 1`，秒级分辨率没有意义，
 * 还会给远端加负载），本地 `os.cpus()` 的差值窗口也是从第二帧才有。所以 1 秒一帧里
 * 有 4 帧**没有**这两个键——渲染层若把「帧里没有这个键」读成「采不到」，进程卡片就会
 * 在「5 行列表」与「暂无进程数据」之间每秒翻一次（用户报的「怎么一闪一闪的」，
 * 2026-10-31，SSH 会话）。
 */
export const OPTIONAL_STATS_KEYS = ['cpuCores', 'procs']

/** 该字段值能不能拿来画：只有非空数组才算「有」。 */
function statsListPresent(value) {
  return Array.isArray(value) && value.length > 0
}

/**
 * 把本帧里**缺席的低频字段**补成上一帧的值（帧级合并，纯函数）。
 *
 * - 本帧带了该字段（非空数组）→ 用本帧的，覆盖旧的；
 * - 本帧没带 / 空数组 → 沿用上一帧的（`ps` 每 5 秒才跑一次，中间的 4 帧不该变「暂无」）；
 * - 上一帧也没有 → 保持缺席，渲染层显示「暂无」（真的从没采到过才这么显示）；
 * - 只处理 `OPTIONAL_STATS_KEYS`，其它字段（CPU / 内存 / 网速…）**绝不沿用**——
 *   那些是每秒的实测量，沿用上一帧等于显示旧值却看不出旧；
 * - 不改入参（帧对象可能还被 WS 层别处引用），永远返回新对象。
 *
 * 代价：宿主真的不再上报该字段时，卡片会停在上一次的值上（最多 5 秒一次刷新）；
 * 这一点可接受——整条「无数据」由 `hasUsableStats` / `statsFrameFresh` 兜住。
 *
 * @param {object | null | undefined} prev 上一帧（合并后的）
 * @param {object} next 本帧
 * @returns {object} 合并结果
 */
export function mergeOptionalStats(prev, next) {
  const merged = { ...next }
  const base = prev !== null && typeof prev === 'object' && !Array.isArray(prev) ? prev : null
  if (base === null) return merged
  for (const key of OPTIONAL_STATS_KEYS) {
    if (statsListPresent(merged[key])) continue
    const last = base[key]
    if (statsListPresent(last)) merged[key] = last
    else delete merged[key]
  }
  return merged
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
 *
 * **必须是函数而不是模块级常量**：标签走 `t(…)`，而模块级常量在加载时求值等于把当前
 * 语言冻住（`installI18n(ctx)` 要等 apply 才跑，语言切换也不会重算）——`STATUS_TEXT` /
 * `QUICK_ACTIONS` / `RESULT_TABS` 都踩过这个坑。`t` 由调用方传入（见 `statsRate` 的说明）。
 *
 * @param {(key: string, params?: Record<string, unknown>) => string} t 翻译函数
 */
export function statsItemSpecs(t) {
  return [
    { key: 'cpuPct', label: 'CPU', kind: 'pct', slot: 4 }, // 100% = 4
    { key: 'cores', label: t('meta.cores'), kind: 'count', slot: 4 }, // 4096 = 4
    /*
     * 2026-10-31（对齐 FinalShell 会话监控条）：**一项资源一条**——百分比、迷你条、已用/总量
     * 同组，`内存` 这个标签只出现一次。此前是 `内存 84%` 与 `内存 52.3 GB/62.3 GB` 两条并列，
     * 标签重复、视线要来回跳。
     */
    { key: 'mem', label: t('meta.mem'), kind: 'pctpair', pctKey: 'memPct', used: 'memUsed', total: 'memTotal', slot: 24 },
    { key: 'disk', label: t('meta.disk'), kind: 'pctpair', pctKey: 'diskPct', used: 'diskUsed', total: 'diskTotal', slot: 24 },
    { key: 'uptimeSec', label: t('meta.uptime'), kind: 'uptime', slot: 13 }, // 上限 100 年 = 5217w6d23h59m = 13
    { key: 'tcpConns', label: 'TCP', kind: 'count', slot: 6 }, // 999999 = 6（1000 万连接只存在于脏数据里）
    /*
     * Ping 与 Swap（2026-11-01，对齐 FinalShell 的状态栏）：两者都是**按机器能力**出现的格子——
     * 本地会话没有网络对端（没有 ping）、没配 swap 的机器没有交换分区。判据在渲染层
     * （「这个会话曾经报过这个字段」），没报过就整格不画，不是显示「无」。
     */
    { key: 'ping', label: 'Ping', kind: 'ping', slot: 6 }, // 常态 `24ms` = 4；9999ms 也装得下
    { key: 'swap', label: 'Swap', kind: 'pair', used: 'swapUsed', total: 'swapTotal', slot: 14 }, // `1.7/4.0 GB` = 10；`1023.0/1024.0 GB` = 17 属于脏数据，宁可让它撑一下也不常年白占 3 字符
    { key: 'tempC', label: t('meta.temp'), kind: 'temp', slot: 8 }, // 199.9°C = 7 字符，但「°」在部分字体里按全角渲染，留一位
    { key: 'net', label: t('meta.net'), kind: 'net', slot: NET_SLOT }, // 有速率时用固定槽位；「无」时不留（见 statsItemValues）
  ]
}

/**
 * 一帧 stats → 每条的显示值（与 `statsItemSpecs(t)` 同序、等长）。
 *
 * 值只来自宿主发来的数值帧，标签 / 槽位是本地常量；`pct` 只有带迷你进度条的条目有，
 * 其余为 `null`。`slot` 允许被单条覆盖（网络：有速率才占槽位）。
 *
 * `summary`（`标签: 值`）的归宿是条目的 **`aria-label`**，由调用方 `setAttribute` 写入，
 * 因此这里**不做** HTML 转义。2026-11-01 起它**不再**写进 `title`：悬停改由自绘的
 * 悬浮卡片（`stats-tip.js`）承担，原生 tooltip 会跟它叠成两层（一个慢、一个样式不可控）。
 *
 * @param stats 宿主 stats 帧；`null` / 非对象 / 脏数据一律渲染成「无」（不抛）。
 * @param t 翻译函数（标签与「无」走目录，见 `statsRate` 的说明）
 */
export function statsItemValues(stats, t) {
  const frame = stats !== null && typeof stats === 'object' && !Array.isArray(stats) ? stats : {}
  const num = (key) => statsNum(frame, key)
  /** 入口：值与槽位一起返回，DOM 层不必再回头查 spec。 */
  const make = (spec, value, pct, slot = spec.slot, tone = '') => ({
    key: spec.key,
    label: spec.label,
    kind: spec.kind,
    slot,
    pct: pct ?? null,
    value,
    // 颜色档位（目前只有 Ping 用：绿=跟手、橙=偏高、红=明显卡顿）；其余条目空串 = 中性
    tone,
    summary: spec.label + ': ' + value,
  })
  return statsItemSpecs(t).map((spec) => {
    if (spec.kind === 'pct') {
      const value = num(spec.key)
      return make(spec, value === null ? t('list.none') : Math.round(value) + '%', value)
    }
    /*
     * 百分比 + 已用/总量**同一条**（`86% (53.5/62.3 GB)`）：两者必须来自同一帧，缺哪一半就
     * 只画另一半——不拼 `86% (无)` 这种自相矛盾的读数，也不把缺失的百分比画成 0%。
     */
    if (spec.kind === 'pctpair') {
      const pct = num(spec.pctKey)
      const pair = statsPair(num(spec.used), num(spec.total), t)
      const hasPair = pair !== t('list.none')
      const value = pct !== null && hasPair
        ? Math.round(pct) + '% (' + pair + ')'
        : pct !== null
          ? Math.round(pct) + '%'
          : hasPair
            ? pair
            : t('list.none')
      return make(spec, value, pct)
    }
    if (spec.kind === 'pair') return make(spec, statsPair(num(spec.used), num(spec.total), t), null)
    /*
     * Ping：取整毫秒（`24ms`）。档位按**手感**分档而不是按百分比：<120 正常、120~300 偏高、
     * ≥300 明显卡顿——这三档对应的是「敲命令有没有延迟感」，不是资源占用率。
     */
    if (spec.kind === 'ping') {
      const ms = num('pingMs')
      if (ms === null) return make(spec, t('list.none'), null, spec.slot)
      // 手感分档（不是占用率）：<120 跟手（绿）、120~300 偏高（橙）、≥300 明显卡顿（红）
      const tone = ms < 120 ? 'ok' : ms < 300 ? 'warn' : 'danger'
      return make(spec, Math.round(ms) + 'ms', null, spec.slot, tone)
    }
    if (spec.kind === 'uptime') return make(spec, formatUptime(num(spec.key), t), null)
    if (spec.kind === 'temp') {
      const value = num(spec.key)
      return make(spec, value === null ? t('list.none') : value.toFixed(1) + '°C', null)
    }
    if (spec.kind === 'net') {
      const rx = num('rxRate')
      const tx = num('txRate')
      if (rx === null && tx === null) return make(spec, t('list.none'), null, 0) // 没有速率：不给槽位（省 20 多字符）
      return make(spec, '↓' + statsRate(rx, t) + ' ↑' + statsRate(tx, t), null, NET_SLOT)
    }
    const value = num(spec.key) // kind === 'count'：核心 / TCP
    return make(spec, value === null ? t('list.none') : String(value), null)
  })
}

/* ------------------------------------------------------------------ *
 * 极简模式（2026-10-31）：趋势线 / 网络量纲 / 紧凑速率
 *
 * 极简条只留 CPU / 内存 / 网络三项，每项是「小标签 + sparkline + 大数字」。
 * 趋势线比瞬时进度条多给一条信息：**在涨还是在抖**；这三项也正好是判断「这台
 * 机器现在累不累」最短的路径。磁盘 / 在线 / TCP / 温度留给完整模式。
 * ------------------------------------------------------------------ */

/** 趋势线的 x 轴宽度（viewBox 单位；`preserveAspectRatio="none"` 让 CSS 宽度自适应）。 */
export const SPARK_WIDTH = 100
/** 趋势线的 y 轴高度（viewBox 单位）。 */
export const SPARK_HEIGHT = 16

/**
 * 趋势线的坐标分段：`null` / 非有限值 = **采样缺口**（断线，不补值不插值）。
 *
 * 返回 `[[ [x, y], ... ], ...]`：每段连续采样一组点；没有任何点时返回空数组。
 * `sparklinePath`（折线）与 `sparklineArea`（折线 + 到底部的填充面）共用这一份映射，
 * 免得两条路径各算一套、在边界上悄悄分叉。
 */
function sparklineSegments(values, width, height, options = {}) {
  const list = Array.isArray(values) ? values : []
  if (list.length < 2 || width <= 0 || height <= 0) return []
  const min = Number.isFinite(options.min) ? options.min : 0
  const max = Number.isFinite(options.max) && options.max > min ? options.max : min + 1
  const span = max - min
  const logarithmic = options.logarithmic === true
  // 幂次刻度（1 = 线性；0.5 = 平方根）。见 `sparklinePath` 的 options 说明。
  const power = Number.isFinite(options.power) && options.power > 0 ? options.power : 1
  const yOf = (value) => {
    const clamped = Math.max(min, Math.min(max, value))
    const ratio = logarithmic
      ? Math.log1p(clamped - min) / Math.log1p(span)
      : Math.pow((clamped - min) / span, power)
    return Math.round((height - ratio * height) * 100) / 100
  }
  const xOf = (index) => Math.round((index / (list.length - 1)) * width * 100) / 100
  const segments = []
  let segment = []
  for (let index = 0; index < list.length; index += 1) {
    const value = list[index]
    if (!Number.isFinite(value)) {
      if (segment.length > 0) segments.push(segment)
      segment = []
      continue
    }
    segment.push([xOf(index), yOf(value)])
  }
  if (segment.length > 0) segments.push(segment)
  return segments
}

/**
 * 迷你趋势线的折线路径（SVG path 的 `d`）——纯函数，渲染层只负责塞进 `<path>`。
 *
 * - `values` 里的 `null` / 非有限值 = **采样缺口**：断线（重新 `M`），不补值、不插值；
 * - 少于两个点返回 `''`（一条线至少要两个点；一个点画出来是误导）；
 * - `options.min/max` 是**显示量程**，越界值夹紧；`max <= min` 时按 `min+1` 兜底；
 * - `options.logarithmic`：对数刻度。**当前没有调用方**——极简条 2026-11-01 从对数换成
 *   `power: 0.5`（16 单位高的缩略图上对数会把 `58K ↔ 163K` 压成不到 2 单位，看着像没数据）；
 *   保留这个变换是因为它是本函数的一种量纲映射，且下面那条用例用它记录「为什么不用它」；
 * - `options.power`：幂次刻度（1 线性 / 0.5 平方根）。**仪表盘的网络图用它**——理由见
 *   `updateNetCard`：线性会把「一次突发 + 一段常态」压成贴底直线，而纯对数在同一个
 *   数量级里几乎不动（58 KB/s 与 163 KB/s 只差 8% 高度），把日常波动一起抹平。
 *
 * @param {Array<number | null | undefined>} values 采样序列（左旧右新）
 * @param {number} width viewBox 宽度
 * @param {number} height viewBox 高度
 * @param {{ min?: number, max?: number, logarithmic?: boolean, power?: number }} [options]
 * @returns {string} 形如 `M0 8 L5 6 M10 4 …` 的路径；没有可画的段时为空串
 */
export function sparklinePath(values, width, height, options = {}) {
  const segments = sparklineSegments(values, width, height, options)
  return segments
    .map((segment) => segment.map(([x, y], i) => (i === 0 ? 'M' : 'L') + String(x) + ' ' + String(y)).join(' '))
    .join(' ')
}

/**
 * 折线下方的填充面（极简模式的视觉效果）：每段收口到画布底部再回到起点。
 *
 * 有缺口时**每段各自闭合**——中间那段空白保持干净，而不是用一块梯形把它连起来。
 * 路径样式（颜色 / 透明度 / 渐变遮罩）全在 CSS 里，这里只给几何。
 */
export function sparklineArea(values, width, height, options = {}) {
  const segments = sparklineSegments(values, width, height, options)
  return segments
    .map((segment) => {
      if (segment.length < 2) return ''
      const head = segment[0]
      const tail = segment[segment.length - 1]
      const body = segment.map(([x, y]) => 'L' + String(x) + ' ' + String(y)).join(' ')
      return 'M' + String(head[0]) + ' ' + String(height) + ' ' + body + ' L' + String(tail[0]) + ' ' + String(height) + ' Z'
    })
    .filter((part) => part !== '')
    .join(' ')
}

/** 网络趋势线的地板量程：64 KB/s 以下一律画平线（否则空闲时的几个字节会被放大成「剧烈」）。 */
export const NET_SPARK_FLOOR = 64 * 1024

/**
 * 网络趋势线的显示上限：从地板开始按 ×4 档往上取，取到装得下窗口内峰值为止。
 *
 * 为什么不直接用窗口最大值：**每帧都变**的上限会让整条线在纵轴上被反复拉伸/压缩，
 * 看起来像在抖（而数据没变）。按 ×4 档跳：只有峰值跨过一个数量级时量程才换一次。
 */
export function netScaleCeiling(maxBps) {
  if (!Number.isFinite(maxBps) || maxBps <= NET_SPARK_FLOOR) return NET_SPARK_FLOOR
  let ceiling = NET_SPARK_FLOOR
  while (ceiling < maxBps) ceiling *= 4
  return ceiling
}

/**
 * 极简条的紧凑速率（`512B` / `32K` / `1.2M` / `674K`）：完整模式用 `32.0 KB/s` 那种
 * 带单位的写法，极简条只有 3 组，大数字旁边再拖一个 `/s` 就挤了。
 *
 * 10 以上不留小数（`131K` 而不是 `130.7K`），10 以下留一位（`9.9K`）——与 formatRate 同口径。
 */
export function statsRateCompact(bytesPerSec) {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec < 0) return ''
  if (bytesPerSec < 1024) return Math.round(bytesPerSec) + 'B'
  const units = ['K', 'M', 'G', 'T']
  let value = bytesPerSec / 1024
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return (value >= 10 ? Math.round(value) : Math.round(value * 10) / 10) + units[index]
}

/**
 * 状态条呈现的三档循环：**完整 → 极简 → 隐藏 → 完整**（面板头部那颗按钮）。
 *
 * 隐藏是**本地**的（只影响这个浏览器，不写 profile 配置）：它同时停掉该标签的 stats
 * 订阅，宿主那边的采集器与远端 exec channel 会一并关掉；再点回完整/极简时重新订阅。
 * 未知取值按「完整」处理（旧 localStorage 值 / 手改坏了都不能让按钮卡死）。
 */
export const STATS_STYLES = ['full', 'minimal', 'off']

/** 下一档（未知取值回落到完整）。 */
export function nextStatsStyle(style) {
  const index = STATS_STYLES.indexOf(style)
  return STATS_STYLES[(index + 1) % STATS_STYLES.length]
}

/* ---------------- 明细仪表盘（悬浮卡片）的纯逻辑 ---------------- */

/**
 * 每核明细的汇总档位：**取最差的那一核**（16 核里有一核 95%，这张卡片就该报警，
 * 平均值会把它摊平）。
 */
export function coresLevel(cores) {
  if (!Array.isArray(cores)) return ''
  let level = ''
  for (const value of cores) {
    const one = statsLevel(typeof value === 'number' && Number.isFinite(value) ? value : null)
    if (one === 'danger') return 'danger'
    if (one === 'warn') level = 'warn'
  }
  return level
}

/**
 * 明细图纵轴上限：取 ≥ peak × 1.15 的「好看数值」（1 / 2 / 5 × 10ⁿ）。
 *
 * 与极简条的 `netScaleCeiling` 不同：那里是 16px 高的缩略线，靠 ×4 档跳避免量程抖动；
 * 这里是带刻度的明细图，1-2-5 这种人类熟悉的刻度才读得出量级。
 */
export function chartCeiling(peak) {
  if (!Number.isFinite(peak) || peak <= 0) return 1
  const target = peak * 1.15
  const base = Math.pow(10, Math.floor(Math.log10(target)))
  for (const step of [1, 2, 5]) {
    if (base * step >= target) return base * step
  }
  return base * 10
}

/**
 * 进程名的展示形式：**只留可执行文件名**。
 *
 * macOS 的 `ps comm` 给的是完整路径（`/Applications/Google Chrome.app/Contents/MacOS/Google
 * Chrome`），十几列宽的卡片里只能看见 `/Applications/G…`——五条全变成同一个前缀，等于没有
 * 信息。取文件名后是 `Google Chrome`，一眼能认；完整路径与 pid 放 title（悬停可看）。
 *
 * Linux 的 comm 本来就不带路径，这里是恒等变换。
 */
export function procDisplayName(cmd) {
  const text = typeof cmd === 'string' ? cmd.trim() : ''
  if (text === '') return ''
  // 内核线程在 ps 里是 `[kworker/0:1]`：方括号内的斜杠不是路径分隔符
  if (text.startsWith('[') && text.endsWith(']')) return text
  const cut = text.lastIndexOf('/')
  const base = cut >= 0 ? text.slice(cut + 1) : text
  return base === '' ? text : base
}

/** 进程列表的排序键（与列头一一对应：CPU / 内存）。 */
export const PROC_SORT_KEYS = ['cpu', 'mem']
/** 排序方向：`desc` 降序（大在上）/ `asc` 升序。 */
export const PROC_SORT_DIRS = ['desc', 'asc']
/** 默认排序：CPU 降序（「谁在吃 CPU」是这张卡片的第一问题）。 */
export const PROC_SORT_DEFAULT = { key: 'cpu', dir: 'desc' }

/**
 * 排序状态 → 规范化（脏状态一律退回默认）：点表头传进来的东西来自 DOM，
 * 别让一个拼错的值把整张卡片清空。
 */
export function normalizeProcSort(sort) {
  const source = sort !== null && typeof sort === 'object' ? sort : {}
  const key = PROC_SORT_KEYS.includes(source.key) ? source.key : PROC_SORT_DEFAULT.key
  const dir = PROC_SORT_DIRS.includes(source.dir) ? source.dir : PROC_SORT_DEFAULT.dir
  return { key, dir }
}

/**
 * 点一下表头之后的新排序状态：**同一个键 → 翻方向；换键 → 回到该键的降序**
 * （先看谁最高是最常见的意图，再点才看最低）。
 */
export function nextProcSort(sort, key) {
  const current = normalizeProcSort(sort)
  if (!PROC_SORT_KEYS.includes(key) || current.key !== key) return { key: PROC_SORT_KEYS.includes(key) ? key : current.key, dir: 'desc' }
  return { key, dir: current.dir === 'desc' ? 'asc' : 'desc' }
}

/**
 * Top 进程的行（明细卡片的纯数据层）：过滤坏行 → 按 `options` 排序 → 只留前 `limit` 条。
 *
 * 排序放在客户端做而不是信宿主：宿主已经按 ps 排过一遍，但那只是「采集那一刻」的顺序，
 * 且旧版宿主/第三方实现不保证有序。这里排一次，卡片顺序永远稳定。
 *
 * `options` 是 `{ key: 'cpu'|'mem', dir: 'desc'|'asc' }`（见 `nextProcSort`）；
 * 不传 = CPU 降序（老调用方的行为不变）。同值保持输入顺序（`Array#sort` 稳定），
 * 同一帧重画不会让两条同占用率的进程互相换位。
 */
export function procRows(procs, limit = 5, options = {}) {
  if (!Array.isArray(procs)) return []
  const rows = []
  for (const item of procs) {
    if (item === null || typeof item !== 'object') continue
    const cmd = typeof item.cmd === 'string' ? item.cmd.trim() : ''
    if (cmd === '') continue
    const cpuPct = typeof item.cpuPct === 'number' && Number.isFinite(item.cpuPct) ? item.cpuPct : 0
    const memPct = typeof item.memPct === 'number' && Number.isFinite(item.memPct) ? item.memPct : 0
    const pid = typeof item.pid === 'number' && Number.isFinite(item.pid) ? item.pid : 0
    rows.push({ pid, cmd, name: procDisplayName(cmd) || cmd, cpuPct, memPct, level: statsLevel(cpuPct) })
  }
  const sort = normalizeProcSort(options)
  const sign = sort.dir === 'asc' ? 1 : -1
  rows.sort((a, b) => sign * ((sort.key === 'mem' ? a.memPct : a.cpuPct) - (sort.key === 'mem' ? b.memPct : b.cpuPct)))
  return rows.slice(0, limit)
}

/**
 * **首尾截断**：`Framew…(Renderer)`。中间的省略号保留了「同类进程靠尾部区分」的信息
 * （macOS 上一串 `Framework Helper (Renderer) / (GPU) / (Plugin)` 前缀完全相同，只留尾部
 * 才认得出是哪一个），而纯尾部截断（CSS `text-overflow`）会把它们全变成同一个前缀。
 *
 * `widthOf(chunk)` 由渲染层注入：浏览器里是 Canvas `measureText`（同一份 mono 字体），
 * 单测里可以给「每个字符 7px」这种确定值。放不进 `budget` 时**先保尾部**，再用剩余
 * 空间从头部补字符。
 *
 * - 放得下 → 原样返回（不碰）；
 * - 连一个字符都放不下 → `…`；
 * - `budget` 不可用（0 / NaN / 没给 widthOf）→ 原样返回，交给 CSS 的省略号兜底。
 *
 * @param {string} text 完整进程名
 * @param {number} budget 可用宽度（与 `widthOf` 同一单位）
 * @param {(chunk: string) => number} widthOf 量宽函数
 * @returns {string} 放得下的展示文本（含 `…`）
 */
export function truncateMiddle(text, budget, widthOf) {
  const value = typeof text === 'string' ? text : ''
  if (value === '') return ''
  if (typeof widthOf !== 'function' || !(budget > 0)) return value
  if (widthOf(value) <= budget) return value
  const ellipsis = '…'
  // 按码点切，别把 emoji / 代理对劈成两半
  const chars = [...value]
  const tailOf = (count) => chars.slice(chars.length - count).join('')
  const headOf = (count) => chars.slice(0, count).join('')
  /*
   * 尾部最多吃掉 70% 的宽度：比例是**刻意**的，两头各有一条硬约束——
   *   - 不封顶（纯尾部优先）会贪心地把整个预算花在尾部，变成 `…Kit.WebContent (Renderer)`，
   *     开头一点都认不出，等于没有首尾截断；
   *   - 压到 60% 又会在窄列里把 `(Renderer)` 前方的空格挤掉，尾部从 `(R` 开始切，
   *     能区分进程的那半截正好被切坏（单测里 18 字符预算就是这个边界）。
   * 70% 让「括号后缀」整体活下来，剩 30% 给头部认 app。
   */
  const tailCap = budget * 0.7
  let tail = 0
  while (tail < chars.length - 1 && widthOf(ellipsis + tailOf(tail + 1)) <= tailCap) tail += 1
  let head = 0
  while (head + tail < chars.length && widthOf(headOf(head + 1) + ellipsis + tailOf(tail)) <= budget) head += 1
  if (head === 0 && tail === 0) return ellipsis
  return headOf(head) + ellipsis + tailOf(tail)
}
