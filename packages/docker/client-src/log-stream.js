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
 *   onLine?: (text: string, payload: Record<string, unknown>) => void,
 *   onSkip?: (payload: { frames?: number, bytes?: number } | null) => void,
 *   onSourceEnd?: (payload: Record<string, unknown>) => void,
 *   onSourceError?: (payload: Record<string, unknown>) => void,
 *   onEnd?: (payload: Record<string, unknown> | null, controls: { reconnect: () => void }) => void,
 *   onError?: (message: string, controls: { close: () => void, reconnect: () => void }) => void,
 *   onStatus?: (status: 'connecting' | 'open' | 'reconnecting' | 'closed') => void,
 *   t?: (key: string) => string,
 * }} options
 *
 * 多容器单连接（宿主 `streamProtocol ≥ 3`）：一条 `/logs/stream?ids=…` 里混着多个容器的
 * 分片，`line` 帧因此带 `id`。`onLine` 的第二个参数就是解析后的整帧（老宿主没有 `id`，
 * 调用方按「只有一个容器」处理即可）；`source-end` / `source-error` 是**单个容器**的
 * 收尾，与整条连接的 `end` / `error` 分开——一个容器停了，不代表其余容器没日志了。
 * @returns {{ close: () => void, reconnect: () => void }}
 */
export function subscribeLogStream(options) {
  const { buildUrl, tail } = options
  /*
   * 翻译函数由调用方**当参数传进来**（见 docs/i18n.md）：目录内联在 client-src/index.js，
   * 兄弟模块 import 它就会成环。没有传（离线冒烟）时退回「键名原样」，不抛错。
   */
  const t = typeof options.t === 'function' ? options.t : (key) => key
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
    /*
     * 「已就绪」只认两条证据（每次建流各自一份，见下）：
     *   1. 宿主的 `ready` 帧 —— 管道（远端通道 / 子进程）真的起来了；
     *   2. **第一行真实日志** —— 有数据就是更硬的证据，顺带兜住「宿主还是旧版本、
     *      从不发 ready」的开发档错位（否则界面会永远停在「正在连接日志流…」）。
     * `onopen` 一条都不算：它只证明 SSE 响应头到了。
     */
    let opened = false
    const markOpen = () => {
      if (opened) return
      opened = true
      attempt = 0
      options.onStatus?.('open')
      options.onOpen?.()
    }
    next.addEventListener('line', (event) => {
      if (source !== next) return
      let payload = null
      try {
        payload = JSON.parse(event.data)
      } catch {
        return
      }
      if (payload === null || typeof payload !== 'object') return
      markOpen()
      /*
       * 第二个参数是整帧：多容器单连接时调用方要按 `payload.id` 把分片派回对应容器
       * （单容器调用方忽略它，行为与旧版一致）。
       */
      if (typeof payload.d === 'string') options.onLine?.(payload.d, payload)
      else if (typeof payload.e === 'string') options.onLine?.(payload.e, payload)
    })
    /*
     * 单个容器的收尾（多容器单连接专有，`streamProtocol ≥ 3` 才有）。
     *
     * 与 `end` 的区别是**作用域**：`end` 是整条连接结束（所有容器都到头了），
     * 而这里只是某一个容器停了——其余容器的日志还得继续收。所以不 close、不
     * 改连接状态，只把「谁结束了」交给调用方计数。
     */
    next.addEventListener('source-end', (event) => {
      if (source !== next) return
      let payload = null
      try {
        payload = JSON.parse(event.data)
      } catch {
        return
      }
      if (payload === null || typeof payload !== 'object') return
      options.onSourceEnd?.(payload)
    })
    /*
     * 单个容器**这一条**失败（spawn 错 / 远端通道被拒）：同样不影响其余容器。
     * 注意它是独立的 SSE 事件名，不走 `error`——`error` 在 EventSource 里还兼着
     * 连接层错误的语义，混在一起会让「一个容器失败」被当成「整条流断了」。
     */
    next.addEventListener('source-error', (event) => {
      if (source !== next) return
      let payload = null
      try {
        payload = JSON.parse(event.data)
      } catch {
        return
      }
      if (payload === null || typeof payload !== 'object') return
      options.onSourceError?.(payload)
    })
    next.addEventListener('skip', (event) => {
      if (source !== next) return
      /*
       * 主机侧背压丢帧（D153）：`{frames,bytes}` = 被丢掉的帧数与字节数。流**没有断**，
       * 只是中间少了一截——交给调用方提示，别当成断线去重连（那会白丢一次历史）。
       */
      let payload = null
      try {
        payload = JSON.parse(event.data)
      } catch {
        /* 畸形载荷按「跳过了一截」提示，不带数字 */
      }
      options.onSkip?.(payload !== null && typeof payload === 'object' ? payload : null)
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
        let message = t('error.logStream')
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
    /*
     * 宿主的 `ready` 帧（见 open 里的两条证据）。
     *
     * 注意 `ready` 也要走 `source !== next` 守卫：一个被换掉的旧连接可能在关掉之前
     * 刚好把 ready 推过来，不挡就会把新连接的状态改成 open。
     */
    next.addEventListener('ready', () => {
      if (source !== next) return
      markOpen()
    })
    next.onopen = () => {
      /* 响应头到了 ≠ 管道起来了：状态留在 connecting / reconnecting，等 ready 或第一行 */
    }
  }

  open(reconnectTail(typeof tail === 'number' ? tail : 0, false))
  return { close: settle, reconnect }
}
