/* eslint-disable */
/**
 * @hyzyn/dsh-docker — 日志环形缓冲(纯模块,浏览器半体与 vitest 共用)。
 *
 * 背景(D63 根治):「日志多 → 网页崩溃」有两个客户端根因——
 *   1) FOLLOW 逐 chunk 全量重渲染(渲染层问题,由 index.js 的 150ms 合帧解决);
 *   2) 缓冲只限行数不限字节 + 残行无上限(内存问题,本模块解决)。
 *
 * 这里把「缓冲」从组件里抽出来:
 *   - 行数 + 字节双上限,超限从头丢最旧(dropped 标志,不静默丢——沿用 D57 语义);
 *   - 每行一个**单调递增 id**:渲染层用它当 React key,窗口滑动时只挂载/卸载
 *     边界行,不再全量重绘;
 *   - 残行(没等到 \n 的尾段)超上限强制落为分片行——「永远不换行的输出」不再能
 *     把内存拖爆(单行再长,内存也有界)。
 *
 * 纯模块、零依赖:被 index.js 打包进 client.js,也被 test/log-buffer.test.ts
 * 直接 import(与 session-target.js / current-session.js 同一模式)。
 * 字节按 UTF-16 code unit 数(text.length)近似:是 UTF-8 字节数的宽松上界,
 * 限流够用,不为精度引入 TextEncoder。
 */

/** 行数上限兜底值(调用方应显式传入 index.js 的 FOLLOW_LINE_LIMIT)。 */
export const DEFAULT_MAX_LINES = 5000
/** 字节上限兜底值(UTF-16 unit 数)。 */
export const DEFAULT_MAX_BYTES = 4 * 1024 * 1024
/** 单条残行上限兜底值。 */
export const DEFAULT_MAX_PENDING = 1024 * 1024

/**
 * 一次性日志文本 → 行(快照路径,POST /logs 的 `logs.text`)。
 *
 * 语义必须与 pushChunk 的切分**逐字一致**:一行 = 一个 `\n` 之前的全部内容,
 * 结尾那个 `\n` 是**终止符**、不产生新行——pushChunk 把 `\n` 之后的尾巴留在
 * pending 里、从不落地空行,快照路径也得给出同一个结论。
 *
 * 旧实现直接 `text.split('\n')`:docker logs 每行都以 `\n` 结尾,于是
 * `--tail 201` 的 201 行(201 个 `\n`)被切成 **202** 段,最后一段是空串——
 * 计数多 1、末尾多一条空行、导出也多一行;同一份日志在快照视图与 FOLLOW 视图
 * 下因此行数不同。
 *
 * 只在结尾是 `\n` 时剥掉**一个**:真正以空行结尾的日志(`a\n\n` = 两行)要留住那个空行。
 */
export function splitLogLines(text) {
  if (typeof text !== 'string' || text === '') return []
  const body = text.endsWith('\n') ? text.slice(0, -1) : text
  return body.split('\n')
}

const positiveIntOr = (value, fallback) =>
  Number.isInteger(value) && value > 0 ? value : fallback

/**
 * 环形日志缓冲。两个使用方:
 *   - 单容器 FOLLOW:pushChunk 吃原始流分片,内部负责残行拼接与按行切分;
 *   - 聚合日志:push 侧自己组好行对象(带 service/ts),用 appendRows 入列、
 *     replaceAll 把「时间序重排」的整表结果写回。
 *
 * 淘汰策略:只推 head 指针(逻辑删除),snapshot 时按需物理压缩——突发灌入
 * 上万行的场景下,淘汰是 O(1)/行,不会出现逐行 shift 的 O(n²)。
 * 字节合计随写入/淘汰增量维护,淘汰循环本身也是 O(1)/行。
 */
export function createLogBuffer(options = {}) {
  const maxLines = positiveIntOr(options.maxLines, DEFAULT_MAX_LINES)
  const maxBytes = positiveIntOr(options.maxBytes, DEFAULT_MAX_BYTES)
  const maxPending = positiveIntOr(options.maxPendingBytes, DEFAULT_MAX_PENDING)

  let seq = 0
  let entries = [] // { id, text, bytes, ...extra }
  let head = 0 // 逻辑起点
  let bytes = 0 // 存活行字节合计
  let pending = '' // 残行(只有 pushChunk 会碰)
  let droppedSince = false

  const count = () => entries.length - head

  /** 超行数/字节上限时从头丢最旧;至少保留一行(丢光会让视图闪空)。 */
  const evict = () => {
    let evicted = false
    while (count() > maxLines && count() > 1) {
      bytes -= entries[head].bytes
      head += 1
      evicted = true
    }
    while (bytes > maxBytes && count() > 1) {
      bytes -= entries[head].bytes
      head += 1
      evicted = true
    }
    if (evicted) droppedSince = true
  }

  /** head 过半时物理压缩,避免长期 FOLLOW 下底层数组无界增长。 */
  const compact = () => {
    if (head > 32 && head * 2 > entries.length) {
      entries = entries.slice(head)
      head = 0
    }
  }

  const makeLine = (text) => {
    const lineBytes = text.length
    seq += 1
    return { id: seq, text, bytes: lineBytes }
  }

  /** 读后清零的 dropped 标志:两次读取之间是否发生过淘汰。 */
  const takeDropped = () => {
    const dropped = droppedSince
    droppedSince = false
    return dropped
  }

  function appendLine(text) {
    const line = makeLine(text)
    entries.push(line)
    bytes += line.bytes
  }

  const buffer = {
    /** 单调行 id:两个视图各持一个实例,不跨视图比较。聚合视图组行时先取号。 */
    nextId: () => {
      seq += 1
      return seq
    },

    count,

    /**
     * 流式原始分片:残行拼接 → 按 \n 切行(与旧 split 版语义逐字等价);
     * 残行超 maxPending 强制落为分片行。返回 { appended: 新落地完整行数 }——
     * 渲染层只在 appended > 0 时排一次渲染,残行增长不打扰 React。
     */
    pushChunk(text) {
      if (typeof text !== 'string' || text === '') return { appended: 0 }
      let rest = pending + text
      let appended = 0
      let idx = rest.indexOf('\n')
      while (idx >= 0) {
        appendLine(rest.slice(0, idx))
        appended += 1
        rest = rest.slice(idx + 1)
        idx = rest.indexOf('\n')
      }
      while (rest.length > maxPending) {
        appendLine(rest.slice(0, maxPending))
        appended += 1
        rest = rest.slice(maxPending)
      }
      pending = rest
      evict()
      compact()
      return { appended }
    },

    /**
     * 行对象批量入列(rows 须自带 id 与 bytes:由 nextId() 取号、text.length
     * 计字节)。返回 { dropped }——本轮是否触发了淘汰。
     */
    appendRows(rows) {
      if (!Array.isArray(rows) || rows.length === 0) return { dropped: false }
      for (const row of rows) {
        entries.push(row)
        bytes += row.bytes
      }
      evict()
      compact()
      return { dropped: takeDropped() }
    },

    /**
     * 整表替换(聚合视图「按时间」重排后回写;行集合不变、只有顺序变,字节
     * 合计重建一次——调用频率 ≤ 合帧频率,O(n) 无所谓)。替换后照常裁剪。
     */
    replaceAll(rows) {
      entries = Array.isArray(rows) ? rows.slice() : []
      head = 0
      bytes = 0
      for (const row of entries) bytes += row.bytes
      evict()
      compact()
      return { dropped: takeDropped() }
    },

    /** 存活行的浅拷贝(新数组身份,供 setState 触发 memo 重算)。 */
    snapshot() {
      compact()
      return entries.slice(head)
    },

    takeDropped,

    /** 当前残行长度(诊断/测试用)。 */
    pendingLength: () => pending.length,

    reset() {
      entries = []
      head = 0
      bytes = 0
      pending = ''
      droppedSince = false
    },
  }

  return buffer
}
