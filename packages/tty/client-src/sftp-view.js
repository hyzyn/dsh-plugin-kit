/**
 * @hyzyn/dsh-tty — SFTP 双栏的**列表过滤与拖放落点**（纯逻辑）。
 *
 * 双栏浏览器里有两件「判错了不会报错、只会让人困惑」的事，所以抽出来单测：
 *
 *   1. **隐藏文件**（`.` 开头）：默认不显示（与单窗体、与绝大多数文件管理器一致），
 *      但必须**能开关**——`.env` / `.gitignore` 这类文件在配置工作里是主角，
 *      而 Linux/macOS 上 `SFTP list` 会照实返回它们。过滤放在**渲染层**而不是宿主：
 *      宿主侧 `list` 与 `sftp_list` 工具都要照实给出全部条目（agent 看不到隐藏文件
 *      会得出错误结论），「看不看得到」纯粹是界面的选择。
 *
 *   2. **拖放落点**：把一个本机文件拖到哪一栏才有意义？答案是**只有远端栏**——
 *      丢到本机栏等于「把文件放到它已经在的地方」，没有任何可执行语义。早年只有一个
 *      `drop` 处理器（单窗体）时这个问题不存在；双栏里两栏都在同一张卡片下，
 *      不判定落点就会把「拖到本机栏」也当成上传，用户会看到文件跑到了对面机器上。
 *
 * 两条规则都可以在 node 里直接跑（不依赖 DOM），所以这里跑单测、`client-src/index.js`
 * 只做 DOM 事件与渲染。
 */

/** 条目名是不是隐藏文件（`.` 开头，但不含 `.` / `..` 这两个特殊项）。 */
export function isHiddenName(name) {
  if (typeof name !== 'string' || name === '') return false
  if (name === '.' || name === '..') return false
  return name.startsWith('.')
}

/**
 * 按「是否显示隐藏文件」过滤一份列表。
 *
 * 顺手丢掉**没有合法名字的条目**（`null` / 缺 `name`）：渲染层本来就要跳过它们
 * （`renderRows` 有同款守卫），在这里一并筛掉可以让「条目数」与实际画出来的行一致
 * ——否则大目录里那些坏条目会让「N 项」与实际行数对不上。
 *
 * @param {Array<{name?: string}>} entries - 列表条目（`list` 路由 / `local-fs/list` 的返回）
 * @param {boolean} showHidden - 显示开关
 * @returns {Array<object>} 过滤后的新数组（不修改入参）
 */
export function filterEntries(entries, showHidden) {
  const rows = Array.isArray(entries) ? entries : []
  const usable = rows.filter((entry) => entry !== null && typeof entry === 'object' && typeof entry.name === 'string' && entry.name !== '')
  if (showHidden === true) return usable
  return usable.filter((entry) => !isHiddenName(entry.name))
}

/**
 * 一次拖放的落点判定。
 *
 * @param {string} paneKind - 事件挂在哪一栏（`'local'` | `'remote'`）
 * @param {{types?: string[], files?: {length?: number}}} dataTransfer - 拖放负载
 * @returns {{ accept: true } | { accept: false, reason: string }}
 */
export function planDrop(paneKind, dataTransfer) {
  if (paneKind !== 'remote') return { accept: false, reason: 'wrongPane' }
  const types = Array.isArray(dataTransfer?.types) ? dataTransfer.types : []
  // 有 Files 类型才算「从操作系统拖进来的文件」；栏内的 HTML5 拖动不带它，
  // 那种拖动不该触发上传（否则拖一行去对面会变成一次莫名其妙的传输）
  if (!types.includes('Files')) return { accept: false, reason: 'notFiles' }
  const count = Number(dataTransfer?.files?.length ?? 0)
  if (!(count > 0)) return { accept: false, reason: 'empty' }
  return { accept: true }
}

/**
 * 把一批拖进来的条目（`collectDroppedFiles` 的产物）按 relPath 归出要预建的目录。
 *
 * `uploadFiles` 与双栏上传都需要这一步：文件夹拖入时先补齐远程父目录，否则第一个
 * 文件就会因为父目录不存在而失败。返回**去重且按深度排序**的目录（父在子前，
 * 便于用 `parents: true` 逐个建、也让失败顺序可预期）。
 *
 * @param {Array<{relPath?: string}>} items
 * @returns {string[]} 目录相对路径（`a`、`a/b`；不含空串与重复项）
 */
export function dirsToCreate(items) {
  const dirs = new Set()
  for (const item of Array.isArray(items) ? items : []) {
    const relPath = typeof item?.relPath === 'string' ? item.relPath : ''
    const cut = relPath.lastIndexOf('/')
    if (cut <= 0) continue
    dirs.add(relPath.slice(0, cut))
  }
  return [...dirs].sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))
}
