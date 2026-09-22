/* eslint-disable */
/**
 * @hyzyn/dsh-codegraph — 浏览器半体里**与 DOM / React 无关**的纯逻辑。
 *
 * 为什么单独成文件：这几段判定（CG11 索引可信度、CG15 重试退避、CG17 截断计数）
 * 原先都是 React 组件闭包里的私有实现，只能靠「真渲染到那条分支」才发现写错；
 * 而仓库的测试底座（vitest.config.ts）刻意只收宿主半体，浏览器半体一个测试都没有
 * （codegraph/DEFECTS.md「验收记录」里点名的最大覆盖空洞）。抽到这里之后它们是
 * 可直接 import 的纯函数，进 vitest（test/client-pure.test.ts）。
 *
 * **不进 package.json 的 files、也不是运行时依赖**：scripts/build-client.mjs 去掉本
 * 文件的 `export` 前缀后，把整段内联进 client-src/index.js 的 factory 体内（放 factory
 * 里而不是文件顶层，是为了页面重载 / HMR 再次执行同一份 client.js 时不重声明报错）。
 * 产物仍是单文件、无 import 的 client.js，CG28 的「产物 = 源码」artifact-diff 闸不变。
 */

/** 关系列表一次最多渲染多少条（CG17：超出时给截断计数，不再静默丢）。 */
export const REL_LIMIT = 30

/**
 * CG11：索引「可信吗」的判定。CLI 的 status --json 里躺着四个可用性字段
 * （本机 1.6.0 实测）：index.reindexRecommended、index.builtWithVersion（对
 * version）、builtWithExtractionVersion（对 currentExtractionVersion）、
 * worktreeMismatch。CLI 明说「建议重建」时，卡片只报「● 已索引」而 MCP 继续给
 * 旧提取器产出的图——这是最容易被当成「codegraph 结果不准」的那类状态。字段
 * 位置随 CLI 版本可能有顶层 / 嵌套差异，两处都读。
 */
export function staleReasons(status) {
  if (!status || typeof status !== 'object') return []
  const meta = status.index && typeof status.index === 'object' ? status.index : {}
  const reasons = []
  if (status.reindexRecommended === true || meta.reindexRecommended === true) {
    reasons.push('CLI 建议重建索引（reindexRecommended）')
  }
  const builtWith = meta.builtWithVersion ?? status.builtWithVersion
  if (typeof builtWith === 'string' && builtWith !== '' && typeof status.version === 'string' && builtWith !== status.version) {
    reasons.push('索引由 CLI ' + builtWith + ' 构建，当前 CLI 是 ' + status.version)
  }
  const builtExtraction = meta.builtWithExtractionVersion ?? status.builtWithExtractionVersion
  const currentExtraction = meta.currentExtractionVersion ?? status.currentExtractionVersion
  if (typeof builtExtraction === 'number' && typeof currentExtraction === 'number' && builtExtraction < currentExtraction) {
    reasons.push('索引的提取器版本 ' + builtExtraction + ' 已落后于当前的 ' + currentExtraction)
  }
  if (status.worktreeMismatch === true || meta.worktreeMismatch === true) {
    reasons.push('索引与当前 worktree 不匹配')
  }
  return reasons
}

/**
 * CG15：会话上报失败后**下一次**退避间隔（毫秒）。1s 起、每次翻倍、封顶 30s；
 * 传 0（上一次成功 / 首次失败）得到首档 1s。
 *
 * 抽出来的意义：这段是「退避」这条修复的全部判定，写错方向（比如忘了封顶或首档
 * 不是 1s）不会报错，只会让失败重试变成打爆宿主或永不重试。
 */
export function nextRetryDelayMs(current) {
  return current === 0 ? 1_000 : Math.min(current * 2, 30_000)
}

/**
 * CG17：关系列表的截断提示；未截断时返回 ''（调用方据此决定要不要渲染那一行）。
 * 以前是静默 slice(0, 30)——用户看到的是「就这么多」，真相是被截了。
 */
export function truncationNote(total, shown) {
  return total > shown ? '已显示前 ' + shown + ' 条，共 ' + total + ' 条' : ''
}

/**
 * P1 采纳率仪表：把 `/metrics` 的 summary 翻成一行卡片文案（无数据时返回 ''）。
 *
 * 三个刻意的取舍：
 *   - **主口径是「发现类」**（grep/glob/search/find/list）：`read` 占宽口径分母的
 *     绝大多数，而它多半是「打开已知道要改的文件」——codegraph 替代的是「找东西」。
 *     实测宽口径 2.2% / 窄口径 28.8%，只报宽口径会让读者得出「codegraph 没用」的
 *     错误结论。宽口径仍然报出来，但明确标注「含读取」。
 *   - **分母为 0 不显示 0%**，而是明说「还没有发现类调用」——「一次都没探索」与
 *     「探索了但全用 grep」是两回事。
 *   - **未索引项目的数字要标明**：那种项目里模型本来就不该用 codegraph，拿它的
 *     采纳率去评价提示词是错的。
 */
export function adoptionText(summary) {
  if (!summary || typeof summary !== 'object') return ''
  const codegraph = Number(summary.codegraph ?? 0)
  const discovery = Number(summary.discovery ?? 0)
  const file = Number(summary.file ?? 0)
  const other = Number(summary.other ?? 0)
  const discoveryTotal = Number(summary.discoveryTotal ?? discovery + codegraph)
  const indexedNote = summary.indexed === false ? '（该项目未索引，这个数字不代表提示词效果）' : ''
  // 完全没有记录（连其它工具都没有）才说「没有工具调用记录」；否则要区分
  // 「只有 bash/edit 这类」与「有读取但没有发现类」——两者含义不同。
  if (discoveryTotal === 0 && file === 0) {
    return other === 0
      ? '采纳率：本次宿主运行期间该项目还没有工具调用记录'
      : `采纳率：还没有探索类调用（另 ${other} 次其它工具，如 bash / edit）`
  }
  if (discoveryTotal === 0) {
    return `采纳率：还没有发现类调用（codegraph ${codegraph} 次 / 读取 ${file} 次；另 ${other} 次其它工具）${indexedNote}`
  }
  const narrow = Math.round((codegraph / discoveryTotal) * 100)
  const broad = Math.round((codegraph / (codegraph + file)) * 100)
  const broadNote = file === 0 ? '' : `（宽口径含读取 ${broad}%）`
  const otherNote = other === 0 ? '' : `（另 ${other} 次其它工具）`
  return `采纳率：codegraph ${codegraph} 次 / 发现类 ${discovery} 次 → ${narrow}%${broadNote}${otherNote}${indexedNote}`
}

/**
 * P2 项目列表：把绝对路径缩短到「读者还能分辨」的程度。
 *
 * 为什么不全显示：项目路径动辄 60+ 字符，而卡片一行要放好几个按钮——全显示会挤成
 * 一坨省略号，反而谁也认不出。保留**最后两段**（通常是 `仓库/子目录` 或 `父/仓库`），
 * 这是实测最容易区分的粒度；完整路径仍在按钮的 title 里，鼠标一悬停就能确认。
 */
export function shortPath(path) {
  if (typeof path !== 'string' || path === '') return ''
  const parts = path.split('/').filter((p) => p !== '')
  if (parts.length <= 2) return path
  return '…/' + parts.slice(-2).join('/')
}

/** P2 项目列表：「多久之前见过」的人话（秒 / 分 / 小时 / 天）。 */
export function seenAgoText(ms) {
  const value = Number(ms)
  if (!Number.isFinite(value) || value < 0) return ''
  const seconds = Math.floor(value / 1000)
  if (seconds < 60) return '刚刚'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return minutes + ' 分钟前'
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return hours + ' 小时前'
  return Math.floor(hours / 24) + ' 天前'
}

/**
 * P3：把状态面板里三个**纯格式化**函数从组件闭包搬到此处——它们此前只能靠「真渲染到
 * 那条分支」才发现写错，而每个都有真实的边界：
 *
 *   - `fmtBytes` 的单位阈值（999 B → 1 kB 还是 999 B？）与小数位切换（`size >= 100`
 *     时不留小数）；
 *   - `fmtNum` 对 `NaN` / `Infinity` / 字符串的处理（状态里出现 `null` 是常态）；
 *   - `fmtTime` 对无法解析的时间串**原样返回**（CLI 换格式时不该显示 `Invalid Date`）。
 *
 * 抽出来之后这些边界进了 vitest（test/client-pure.test.ts）。留在闭包里的只有
 * 「怎么摆 DOM」，那部分由卡片预览夹具（scripts/preview-card.mjs）走真渲染。
 */

/** 本地化数字；非有限值回落占位符（状态里字段缺失是常态，不能显示 NaN）。 */
export function fmtNum(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString() : '—'
}

/**
 * 字节数 → B/kB/MB/GB/TB（十进制 1000 进制，与 CLI 的 dbSizeBytes 口径一致）。
 * 非法值（负数 / 非有限 / 非数字）→ 占位符。
 */
export function fmtBytes(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '—'
  const units = ['B', 'kB', 'MB', 'GB', 'TB']
  let size = value
  let unit = 0
  while (size >= 1000 && unit < units.length - 1) {
    size /= 1000
    unit += 1
  }
  // 字节数本身取整；带单位的量值在 >= 100 时不留小数（`451 MB` 比 `451.0 MB` 好读）
  return (unit === 0 ? String(Math.round(size)) : size.toFixed(size >= 100 ? 0 : 1)) + ' ' + units[unit]
}

/**
 * ISO 时间 → 本地时间；**解析不出来就原样返回**。
 *
 * 为什么不是统一显示「—」或「Invalid Date」：这一列的语义是「CLI 说它何时被索引」，
 * 原样透出才能让用户看出「CLI 换了格式」这件事；吞掉它会让人以为索引从未建立。
 */
export function fmtTime(value) {
  if (typeof value !== 'string' || value === '') return '—'
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : value
}
