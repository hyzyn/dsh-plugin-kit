/* eslint-disable */
/**
 * @hyzyn/dsh-docker — 日志正文的窗口化布局（虚拟滚动）纯逻辑（D152）。
 *
 * 背景（D151 之后的实测）：D151 把「一个 chunk 一帧 SSE」的固定开销合掉了，持续洪泛下
 * 剩下的唯一大账是**挂载 5000 行的 DOM churn**——20k 行/秒时每帧要淘汰上千行、插入上千行，
 * `scripts/log-perf.mjs` 量到 25~26 个 >50ms 长帧 / 6s（最大延迟 70~97ms），真机上就是
 * 「日志一快整页就卡」。同轮实测已排除两条更便宜的路（按 id 复用 element ±0；合帧间隔退避
 * 把最大延迟抬到 144ms，见 DEFECTS D151）。这里走 D63 一直留着的那条：**只挂可见的几十行**，
 * DOM 从 ~10000 节点掉到 ~500。
 *
 * 为什么不能直接 `content-visibility`（D91 的结论维持）：它给未渲染行兜一个**估算高度**，
 * scrollHeight 从此是估算值，而 FOLLOW 的贴底判定（scrollTop=scrollHeight、上滚 <24px、
 * 「回到底部」）全建立在精确高度上。本模块的做法正相反：
 *
 *   - 行高**实测**（渲染出来的行由 index.js 量 `offsetHeight`），实测值进缓存；
 *   - 从没渲染过的行用估算值（`estimate`）兜——但它们只在「用户还没滚到那里的历史」里，
 *     而**贴底时窗口锚在列表尾部**，尾部永远是实测的 → 贴底判定依旧精确（这是与 D91 的
 *     本质区别：估算只出现在视口之外，不再参与贴底）；
 *   - 测量落地后按**可见区顶行**做锚点修正（`reanchor`）：它上方任何一行的高度修正都会
 *     让滚动内容整体位移，把差值加回 scrollTop 就抵消了，往上滚历史不会跳。
 *
 * 缓存按「最近测量」FIFO 淘汰：环形缓冲本身就是 FIFO 淘汰，最老的那些行再也不会被渲染。
 *
 * 纯模块、零依赖：被 index.js 打包进 client.js，也被 test/log-window.test.ts 直接驱动
 * （与 log-buffer.js / log-stream.js 同一模式）。所有坐标都是 CSS 像素（px）。
 */

/** 从没量过的行的兜底高度：12px 字号 × 1.6 行高 ≈ 19px，取整。 */
export const LOG_ROW_ESTIMATE_PX = 20

/**
 * 视口上下各多挂多少行。**必须 ≥ index.js 的 ASK_CONTEXT_LINES（20）**：右键「问 Agent」
 * 的诊断包带的是选中行前后各 20 行，而它是从**已渲染的 DOM** 里取的（见 logRowElements /
 * buildAskPrompt）——多挂的这几十行正是那份上下文的来源。
 */
export const LOG_WINDOW_OVERSCAN = 24

/** 行高缓存上限：比缓冲行数（5000）留一点余量，FIFO 淘汰跟着环形缓冲的顺序走。 */
export const LOG_HEIGHT_CACHE_LIMIT = 6000

/** 实测高度与缓存值差多少才算「变了」：亚像素抖动不该触发重渲染。 */
const HEIGHT_EPSILON = 0.5

/** 最后一个 `offsets[i] <= top` 的下标（offsets 严格递增：每行高度恒 > 0）。 */
function firstVisibleIndex(offsets, count, top) {
  let lo = 0
  let hi = count - 1
  let found = count - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (offsets[mid] <= top) {
      found = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return found
}

/** 最后一个与 [top, top+viewportHeight) 相交的下标：第一个 `offsets[i+1] >= bottom`。 */
function lastVisibleIndex(offsets, count, bottom) {
  let lo = 0
  let hi = count - 1
  let found = count - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (offsets[mid + 1] >= bottom) {
      found = mid
      hi = mid - 1
    } else {
      lo = mid + 1
    }
  }
  return found
}

const positiveNumberOr = (value, fallback) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback

/**
 * 日志窗口布局器。一个视图（单容器日志页 / 聚合日志页）一个实例——行 id 只在**同一个
 * 缓冲实例**内唯一（两个视图的 id 都从 1 起，跨视图会撞）。
 */
export function createLogWindow(options = {}) {
  const estimate = positiveNumberOr(options.estimate, LOG_ROW_ESTIMATE_PX)
  const overscan = Number.isInteger(options.overscan) && options.overscan >= 0 ? options.overscan : LOG_WINDOW_OVERSCAN
  const maxEntries = positiveNumberOr(options.maxEntries, LOG_HEIGHT_CACHE_LIMIT)

  /** id(string) → 实测高度。插入序 = 最近测量序（重测会先删再插，挪到队尾）。 */
  const heights = new Map()

  const heightOf = (id) => {
    const hit = heights.get(String(id))
    return hit === undefined ? estimate : hit
  }

  const prune = () => {
    while (heights.size > maxEntries) {
      const oldest = heights.keys().next()
      if (oldest.done === true) break
      heights.delete(oldest.value)
    }
  }

  /** 前缀和：`offsets[i]` = 第 i 行之前的总高，`offsets[n]` = 整表总高。 */
  const offsets = (entries) => {
    const list = Array.isArray(entries) ? entries : []
    const out = new Float64Array(list.length + 1)
    let acc = 0
    for (let i = 0; i < list.length; i += 1) {
      out[i] = acc
      acc += heightOf(list[i].id)
    }
    out[list.length] = acc
    return out
  }

  return {
    estimate,
    overscan,

    /**
     * 记一行的实测高度。返回 true = 缓存值真的变了（调用方据此排一次重渲染）；
     * 非法值（0 / NaN / 负）与亚像素抖动都返回 false。
     */
    measure(id, px) {
      if (typeof px !== 'number' || !Number.isFinite(px) || px <= 0) return false
      const key = String(id)
      const prev = heights.get(key)
      if (prev !== undefined && Math.abs(prev - px) < HEIGHT_EPSILON) return false
      if (prev !== undefined) heights.delete(key) // 挪到队尾：FIFO 淘汰按「最近测量」算
      heights.set(key, px)
      prune()
      return true
    },

    heightOf,

    offsets,

    /**
     * 一次布局：定位该挂哪些行、上下垫多高。
     *
     * @param {Array<{id: unknown}>} entries 已经过滤好的行（`matched`）
     * @param {{ scrollTop?: number, viewportHeight?: number, pinned?: boolean }} view
     *   `pinned=true`（跟随中且用户贴底）：窗口直接锚到**列表尾部**——尾部永远是实测的，
     *   贴底判定（`scrollTop = scrollHeight`）因此精确，不受估算高度影响。
     * @returns {{ start: number, end: number, topPad: number, bottomPad: number, total: number,
     *   anchorId: unknown, anchorOffset: number }} `end < start` 表示没有行可挂（空表）。
     */
    layout(entries, view) {
      const list = Array.isArray(entries) ? entries : []
      const count = list.length
      const off = offsets(list)
      const total = off[count]
      const top = Math.max(0, typeof view?.scrollTop === 'number' ? view.scrollTop : 0)
      const vh = Math.max(0, typeof view?.viewportHeight === 'number' ? view.viewportHeight : 0)
      if (count === 0) {
        return { start: 0, end: -1, topPad: 0, bottomPad: 0, total: 0, anchorId: null, anchorOffset: 0 }
      }

      let firstVisible
      let end
      let pinnedWindow = false
      if (view?.pinned === true || vh === 0) {
        // 贴底（或视口还量不出来）：从尾部往前凑「视口 + overscan 行」的高度。这里的
        // overscan 已经算进 need，下面的 start **不再**往前多留一段（否则会多挂一屏）。
        let i = count - 1
        let acc = 0
        const need = vh + estimate * overscan
        while (i >= 0 && acc < need) {
          acc += off[i + 1] - off[i]
          i -= 1
        }
        // 退出时 i+1 就是「开始覆盖视口 + overscan」的那一行；i<0 说明整表都填不满
        firstVisible = Math.max(0, i + 1)
        end = count - 1
        pinnedWindow = true
      } else {
        firstVisible = firstVisibleIndex(off, count, top)
        end = lastVisibleIndex(off, count, top + vh)
      }

      const start = pinnedWindow ? firstVisible : Math.max(0, firstVisible - overscan)
      end = pinnedWindow ? end : Math.min(count - 1, end + overscan)
      return {
        start,
        end,
        topPad: off[start],
        bottomPad: total - off[end + 1],
        total,
        anchorId: list[firstVisible].id,
        anchorOffset: off[firstVisible],
      }
    },

    /**
     * 某一行在**当前缓存**下的偏移（它上方所有行的实测/估算总高）；行不在表里返回 null。
     * 与 `reanchor` 的区别：reanchor 算的是「相对某次旧布局的位移」，这里算的是绝对位置——
     * index.js 的跨代锚点（D154）每帧用它把「应该钉住的那一行」的当前位置记下来，下一帧
     * 再让 reanchor 相对这份记录补偿。
     */
    offsetOf(entries, id) {
      if (id === null || id === undefined) return null
      const key = String(id)
      const list = Array.isArray(entries) ? entries : []
      let acc = 0
      for (let i = 0; i < list.length; i += 1) {
        if (String(list[i].id) === key) return acc
        acc += heightOf(list[i].id)
      }
      return null
    },

    /**
     * 测量落地后的锚点修正：用**当前**高度重算「可见区顶行」的偏移，与上一帧布局时的
     * 偏移相减 —— 差值就是滚动内容整体位移的像素数，加回 scrollTop 即抵消。
     * 锚点行已不在表里（被淘汰 / 过滤掉了）时返回 0。
     */
    reanchor(entries, anchorId, anchorOffset) {
      if (anchorId === null || anchorId === undefined) return 0
      const key = String(anchorId)
      const list = Array.isArray(entries) ? entries : []
      let acc = 0
      for (let i = 0; i < list.length; i += 1) {
        if (String(list[i].id) === key) return acc - anchorOffset
        acc += heightOf(list[i].id)
      }
      return 0
    },

    /** 换流 / 重建缓冲时清空：行 id 会被复用（都从 1 起），高度必须整代作废。 */
    clear() {
      heights.clear()
    },

    /** 缓存条目数（测试 / 诊断用）。 */
    size() {
      return heights.size
    },
  }
}
