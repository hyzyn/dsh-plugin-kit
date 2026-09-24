/**
 * 日志流订阅（D133）：把「EventSource 生命周期 + 断线重连」收在一处，两条日志视图
 * 共用（单容器 FOLLOW / Compose 聚合）。
 *
 * 为什么不用 EventSource 的自动重连：它**复用同一个 URL**，而 URL 里的 tail 是首连
 * 用来补历史的。重连时服务端会把最后 tail 行当成新行再推一遍，客户端又无脑 append
 * ——日志里就凭空多出一段重复，还会把真正的历史挤掉。这里改成手动重连：首连带 tail，
 * **重连一律 tail=0**（只补新行，不重复历史）。
 *
 * 另一个好处：宿主队列溢出（背压 8MB 上限）时会先发一条
 * `end{reason:'output-limit'}` 再关流，这里能把「为什么断了」交给调用方显示，
 * 而不是让浏览器把它当成正常结束、静默重连。
 */

/** 重连退避：1s 起、指数增长、15s 封顶（与 tty 隧道同一套手感）。 */
export const LOG_RECONNECT_BASE_MS = 1000
export const LOG_RECONNECT_MAX_MS = 15000

/** 首连要补的历史行数、重连一律 0（只补新行）。测试缝断言这两个值。 */
export function reconnectTail(initialTail, isReconnect) {
  return isReconnect ? 0 : initialTail
}

/**
 * @param {{
 *   buildUrl: (tail: number) => string,
 *   tail: number,
 *   onOpen?: () => void,
 *   onLine?: (text: string) => void,
 *   onEnd?: (payload: Record<string, unknown> | null, controls: { reconnect: () => void }) => void,
 *   onError?: (message: string, controls: { close: () => void, reconnect: () => void }) => void,
 *   onStatus?: (status: 'connecting' | 'open' | 'reconnecting' | 'closed') => void,
 * }} options
 * @returns {{ close: () => void, reconnect: () => void }}
 */
export function subscribeLogStream(options) {
  const { buildUrl, tail } = options
  let source = null
  let closed = false
  let attempt = 0
  let timer = null

  const dropSource = () => {
    if (source === null) return
    const stale = source
    source = null
    try {
      stale.close()
    } catch {
      /* 已关闭 */
    }
  }

  const cancelTimer = () => {
    if (timer === null) return
    clearTimeout(timer)
    timer = null
  }

  const settle = () => {
    closed = true
    cancelTimer()
    dropSource()
    options.onStatus?.('closed')
  }

  /** 手动重连：先关掉当前连接（掐断浏览器的自动重连），退避后再开，且不再补历史。 */
  const reconnect = () => {
    if (closed) return
    dropSource()
    cancelTimer()
    options.onStatus?.('reconnecting')
    const delay = Math.min(LOG_RECONNECT_BASE_MS * 2 ** attempt, LOG_RECONNECT_MAX_MS)
    attempt += 1
    timer = setTimeout(() => {
      timer = null
      // 重连一律不补历史（reconnectTail 是这条规则的唯一出处）
      if (!closed) open(reconnectTail(typeof tail === 'number' ? tail : 0, true))
    }, delay)
  }

  /** @param {number} tailNow 补的历史行数：首连用调用方给的 tail，重连一律 0。 */
  function open(tailNow) {
    if (closed) return
    options.onStatus?.('connecting')
    const next = new EventSource(buildUrl(tailNow))
    source = next
    next.addEventListener('line', (event) => {
      if (source !== next) return
      let payload = null
      try {
        payload = JSON.parse(event.data)
      } catch {
        return
      }
      if (payload === null || typeof payload !== 'object') return
      if (typeof payload.d === 'string') options.onLine?.(payload.d)
      else if (typeof payload.e === 'string') options.onLine?.(payload.e)
    })
    next.addEventListener('end', (event) => {
      if (source !== next) return
      let payload = null
      try {
        payload = JSON.parse(event.data)
      } catch {
        /* 畸形载荷按「服务端主动停流」处理 */
      }
      options.onEnd?.(payload !== null && typeof payload === 'object' ? payload : null, {
        reconnect: () => {
          if (source !== next) return
          reconnect()
        },
      })
    })
    next.addEventListener('error', (event) => {
      if (source !== next) return
      // 服务端 event:error 是带 data 的 MessageEvent；连接层错误是普通 Event
      if (typeof event.data === 'string' && event.data !== '') {
        let message = '日志流异常'
        try {
          const payload = JSON.parse(event.data)
          if (payload !== null && typeof payload.message === 'string') message = payload.message
        } catch {
          /* 用默认文案 */
        }
        // 关流还是重连由调用方决定（单容器视图报错即停；聚合视图只标记部分失败）
        options.onError?.(message, { close: settle, reconnect })
        return
      }
      // 连接层错误：不再交给浏览器自动重连（它会重放 tail），改走手动重连
      reconnect()
    })
    next.onopen = () => {
      if (source !== next) return
      attempt = 0
      options.onStatus?.('open')
      options.onOpen?.()
    }
  }

  open(reconnectTail(typeof tail === 'number' ? tail : 0, false))
  return { close: settle, reconnect }
}
