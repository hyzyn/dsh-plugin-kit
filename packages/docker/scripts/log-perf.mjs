#!/usr/bin/env node
/**
 * 日志页性能门禁（D128 的浏览器侧护栏）。
 *
 * 为什么要有它：日志页当初「网页直接崩溃」是个**性能**缺陷——单测能钉住缓冲上限与
 * 合帧常量，但钉不住「5000 行首屏要多久 / 突发时事件循环卡多久」。这里用真 Chrome
 * 量这两个数并断言预算，回归就再也回不来了。
 *
 * 依赖 tty 的预览夹具（vendor React + mock-host + 面板外壳）：
 *   node ../tty/scripts/preview.mjs        # 首次/夹具缺失时先生成
 * 夹具或 Chrome 缺失时**跳过**（exit 0）——它是 npm script，不是 vitest 必跑项。
 *
 *   node scripts/log-perf.mjs              # 默认
 *   CHROME_PATH=/path/to/chrome node scripts/log-perf.mjs
 */
import http from 'node:http'
import { readFileSync, existsSync, copyFileSync, mkdirSync, statSync } from 'node:fs'
import { join, extname, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Chrome } from '../../../scripts/chrome-cdp.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const pkg = resolve(here, '..')
const repo = resolve(pkg, '../..')
const fixtureDir = join(repo, 'packages/tty/.preview')

/** 预算：宽松到不会因机器抖动误报，紧到能抓住「每 chunk 全量重渲染」那类回归。 */
const BUDGET = {
  snapshotMs: 2500,
  snapshotRows: 5000,
  burstMs: 8000,
  /* D152 实测：突发最大延迟 1~2ms（改前 52~97ms），留足余量给慢机器。 */
  burstMaxLagMs: 60,
  /* 正文节点数：窗口化后只剩「可见 + 上下 overscan」的几十行（实测 213~229 节点）。 */
  maxNodes: 800,
  /* 挂载行数上限：这是「虚拟滚动还生不生效」的直接护栏（实测 56~57 行，改前 5000）。 */
  mountedRows: 200,
  /*
   * 持续洪泛（D151 引入场景 / D152 达标）：缓冲已满后的**稳态**才是用户看到的
   * 「日志一快就卡」——每帧都在淘汰上千行、插入上千行，突发场景（缓冲还没满、
   * 只追加）测不到这一段。
   *
   * 改前基线（2026-09-29）：最大延迟 70~97ms、>50ms 长帧 25~26 个 / 6s。同轮验证过
   * 「行元素缓存」（±0）与「合帧间隔退避」（把最大延迟抬到 144ms）都压不动它——
   * 真解是把挂载行数从 5000 降到可见的几十行（D152 虚拟滚动），改后 5~7ms / 0 个。
   * 这里的预算按「改后实测 + 余量」设：虚拟滚动退化（比如窗口算错挂回几千行）会立刻红。
   */
  sustainedMs: 6000,
  /* D152 实测：持续洪泛最大延迟 5~7ms、长帧 >50ms = 0（改前 70~97ms / 25~26 个）。 */
  sustainedMaxLagMs: 50,
  sustainedLongFrames: 0,
  /*
   * 每事件 1 行的预算：同一行速率下把事件数放大 50 倍（= 逐 chunk 一帧 SSE 的极端），
   * 用它当「客户端每事件开销」的回归护栏。实测值由 createSseCoalescer（D151）在
   * 服务端消掉——合帧后真实客户端看到的正是「每事件 50 行」那一档。
   */
  perLineEventMaxLagMs: 100,
}

function skip(reason) {
  console.log('[log-perf] 跳过：' + reason)
  process.exit(0)
}

const chromePath = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
if (!existsSync(chromePath)) skip('没找到 Chrome（可用 CHROME_PATH 指定）')
for (const file of ['harness.html', 'mock-host.js', 'harness.js', 'vendor/react.js', 'vendor/react-dom.js']) {
  if (!existsSync(join(fixtureDir, file))) skip('预览夹具缺 ' + file + '（先跑 node packages/tty/scripts/preview.mjs）')
}
if (!existsSync(join(pkg, 'client.js'))) skip('client.js 还没构建（先跑 pnpm --filter @hyzyn/dsh-docker build）')

// 把当前构建的 docker client 换进夹具（夹具读 .preview/docker-client.js）
mkdirSync(fixtureDir, { recursive: true })
copyFileSync(join(pkg, 'client.js'), join(fixtureDir, 'docker-client.js'))

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }
const server = http.createServer((req, res) => {
  const path = decodeURIComponent(String(req.url).split('?')[0])
  const file = join(fixtureDir, path === '/' ? 'harness.html' : path)
  if (!file.startsWith(fixtureDir) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404).end('not found')
    return
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const port = server.address().port

/*
 * 页面里的量测：5000 行快照的首屏耗时 / DOM 规模，然后灌 400×50 行的 FOLLOW 突发，
 * 记录事件循环最大延迟与收敛后的行数。整段与 .preview/log-perf.mjs 一致，只多出
 * 「返回结构化数字」以便这里断言。
 */
const MEASURE = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const q = (s) => document.querySelector(s)
  const qa = (s) => [...document.querySelectorAll(s)]
  const waitFor = async (fn, timeout = 15000) => {
    const t0 = performance.now()
    for (;;) {
      let v = null
      try { v = fn() } catch { v = null }
      if (v) return performance.now() - t0
      if (performance.now() - t0 > timeout) throw new Error('waitFor 超时')
      await sleep(25)
    }
  }
  const out = { steps: [] }
  try {
    await waitFor(() => q('.dk_panel'))
    await waitFor(() => qa('.dk_card').length > 0)
    // 行格式按宿主日志解析的**真实形状**造（12:00:00.000 [INFO] ...）：插件会给
    // 时间戳与级别各套一个 span，行里的元素数（→ DOM 节点数）才是真的
    const LINE = '12:00:00.000 [INFO] request handled in 12ms path=/api/v1/orders/{id} trace=abc'
    const BIG = Array.from({ length: 5000 }, (_, i) => LINE + ' seq=' + String(i)).join('\\n')
    /*
     * TALL：同样的 5000 行，但每行多出 320 个字符——面板会**折行**，行高从 ~20px 变成
     * 好几十像素。用来造「刷新换了一代、连行高都不一样」的现场（见下面的换代回归）。
     */
    const TALL = Array.from({ length: 5000 }, (_, i) => LINE + ' seq=' + String(i) + ' ' + 'x'.repeat(320)).join('\\n')
    const realFetch = window.fetch.bind(window)
    let truncateNext = false
    let tallNext = false
    window.fetch = (url, init) => {
      const target = typeof url === 'string' ? url : String(url && url.url ? url.url : url)
      if (target.indexOf('/logs/stream') === -1 && target.indexOf('/logs') !== -1) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, logs: { id: 'app-web-1', text: tallNext ? TALL : BIG, truncated: truncateNext } }) })
      }
      return realFetch(url, init)
    }
    const card = qa('.dk_card')[0]
    if (!card) throw new Error('没有容器卡片')
    card.click()
    await waitFor(() => q('.dk_tab'))
    const logsTab = qa('.dk_tab').find((el) => el.textContent.trim() === '日志')
    if (!logsTab) throw new Error('没有日志页签')
    const t0 = performance.now()
    logsTab.click()
    // 行数真值读 data-log-total（D152 窗口化之后 DOM 里只挂可见的几十行，
    // .dk_logLine 计数不再等于「视图里有多少行」；挂载行数另记 mountedDomRows）
    const totalRows = () => Number(q('.dk_logBody')?.getAttribute('data-log-total') ?? '0')
    const mountedRows = () => qa('.dk_logLine').length
    await waitFor(() => totalRows() >= 5000)
    await sleep(150)
    out.snapshotMs = Math.round(performance.now() - t0)
    out.snapshotRows = totalRows()
    out.snapshotDomRows = mountedRows()
    out.snapshotViewH = q('.dk_logBody') ? q('.dk_logBody').clientHeight : -1
    out.snapshotScrollH = q('.dk_logBody') ? q('.dk_logBody').scrollHeight : -1
    out.snapshotNodes = q('.dk_logBody') ? q('.dk_logBody').querySelectorAll('*').length : -1

    /*
     * 窗口化正确性（D152）：只挂几十行还必须是**对的那几十行**。快照内容是确定的
     * （BIG = seq=0..4999），所以滚到顶 = 第一行 seq=0、滚到底 = 最后一行 seq=4999。
     * 这一条比性能数字更重要：窗口算错会表现为「滚上去看到的不是历史」。
     */
    const textOf = (el) => (el ? el.textContent : '')
    const bodyEl = q('.dk_logBody')
    if (bodyEl) {
      bodyEl.scrollTop = 0
      await sleep(150)
      out.topFirstRow = textOf(qa('.dk_logLine')[0])
      bodyEl.scrollTop = bodyEl.scrollHeight
      await sleep(150)
      const mounted = qa('.dk_logLine')
      out.bottomLastRow = textOf(mounted[mounted.length - 1])
      bodyEl.scrollTop = 0
      await sleep(100)
    }
    const refreshBtn = qa('button').find((el) => String(el.title).indexOf('刷新日志') >= 0)

    /*
     * 换代的回归（D155）：快照刷新 = 换了一代行（id 是位置寻址 's'+index，刷新后同一个
     * id 已是另一行内容）。判据取**几何**、不取滚动位置：这一代的垫高必须由**这一代**的
     * 实测高度算出来。先刷一代会折行的高行（TALL，每行 ~150px）并扫几个位置把它们量进
     * 缓存，再刷回普通行（每行 ~20px）——若换代不作废缓存，上一代的 150px 会留在垫高里，
     * scrollHeight 虚高几万像素（滚动条、跳转、"滚到顶看到第几行"全靠它）。
     *
     * 为什么不判「scrollTop 不许动」：跨帧锚**本来就应该**补偿视口上方行高的真实变化，
     * 那是 D154 的正当职责——实测过，正确实现在这里会跟着上方 overscan 变高而位移
     * 1881px，那是它该做的；拿滚动位置当判据会把正确实现判成错的。
     */
    let refreshGeometryH = -1
    let refreshTotal = -1
    if (bodyEl && refreshBtn) {
      tallNext = true
      refreshBtn.click()
      await sleep(300)
      for (const frac of [0.15, 0.3, 0.45, 0.6, 0.75, 0.9]) {
        bodyEl.scrollTop = Math.floor(bodyEl.scrollHeight * frac)
        await sleep(120)
      }
      tallNext = false
      refreshBtn.click()
      await sleep(300)
      refreshGeometryH = bodyEl.scrollHeight
      refreshTotal = totalRows()
    }
    out.refreshGeometryH = refreshGeometryH
    out.refreshTotal = refreshTotal

    /*
     * 字节闸的可见性（用户实际踩过的坑）：LINES 是**行数**上限，而「输出上限（KB）」是
     * 另一个**字节**闸——它一生效，界面必须明说「已截断」，否则用户只会看到「选 1000 行
     * 却只回了 985 行」而不知道是哪一个闸。这里让快照响应带 truncated:true 并刷新一次。
     */
    truncateNext = true
    if (refreshBtn) {
      refreshBtn.click()
      await sleep(250)
      out.truncatedBanner = qa('.dk_banner').some((el) => el.textContent.indexOf('已截断') >= 0)
    } else {
      out.truncatedBanner = null
    }
    truncateNext = false

    let maxLag = 0
    let last = performance.now()
    const probe = setInterval(() => {
      const now = performance.now()
      maxLag = Math.max(maxLag, now - last - 16)
      last = now
    }, 16)

    let emit = null
    let sourceCount = 0
    const openedEventSources = () => sourceCount
    window.EventSource = class {
      constructor() {
        sourceCount += 1
        this.readyState = 0
        this.listeners = new Map()
        setTimeout(() => { this.readyState = 1; if (this.onopen) this.onopen() }, 0)
        emit = (event, data) => {
          for (const h of this.listeners.get(event) ?? []) h({ data: JSON.stringify(data) })
        }
      }
      addEventListener(name, fn) {
        const list = this.listeners.get(name) ?? []
        list.push(fn)
        this.listeners.set(name, list)
      }
      close() { this.readyState = 2 }
    }
    const follow = qa('.dk_pill').find((el) => el.className.indexOf('dk_pillFollow') >= 0)
    if (!follow) throw new Error('没有 FOLLOW 开关')
    const t1 = performance.now()
    follow.click()
    await waitFor(() => emit !== null, 5000)
    const CHUNK = Array.from({ length: 50 }, (_, i) => LINE + ' burst=' + String(i)).join('\\n') + '\\n'
    for (let i = 0; i < 400; i += 1) {
      emit('line', { d: CHUNK })
      if (i % 20 === 0) await sleep(0)
    }
    await sleep(800)
    clearInterval(probe)
    out.burstMs = Math.round(performance.now() - t1)
    out.burstRows = totalRows()
    out.burstDomRows = mountedRows()
    out.burstMaxLagMs = Math.round(maxLag)
    out.burstNodes = q('.dk_logBody') ? q('.dk_logBody').querySelectorAll('*').length : -1

    /*
     * 行按真实 JSON 日志的长度（~150 字符）造：折行（word-break）会把布局成本一并
     * 压进来。CHUNK_LONG = 50 行一块，给下面两个剖面共用。
     */
    const LONG = LINE + ' payload=' + 'x'.repeat(60) + '\\n'
    const CHUNK_LONG = Array.from({ length: 50 }, (_, i) => LONG.slice(0, -1) + ' seq=' + String(i)).join('\\n') + '\\n'

    /*
     * 事件洪泛剖面对照（D151）：**同一行速率**（≈6.2k 行/秒）下，每事件 1 行 vs
     * 每事件 50 行。服务端把逐 chunk 的帧合成一个窗口推下来（见 src/index.ts 的
     * createSseCoalescer）之后，客户端每秒要处理的 line 事件少 1~2 个数量级；
     * 这一段量的就是「每事件固定开销」（SSE 派发 + JSON.parse + pushChunk 的字符串
     * 拼接）在页面里值多少——它正是逐 chunk 一帧 SSE 的代价。
     */
    const profile = async (linesPerEvent, ms) => {
      const perTick = Math.max(1, Math.round(100 / linesPerEvent))
      const chunk = linesPerEvent === 1 ? LONG : CHUNK_LONG
      let pMax = 0
      let pLong50 = 0
      let pSamples = 0
      let pLast = performance.now()
      const probeP = setInterval(() => {
        const now = performance.now()
        const lag = now - pLast - 16
        pLast = now
        pSamples += 1
        if (lag > 50) pLong50 += 1
        pMax = Math.max(pMax, lag)
      }, 16)
      const t0 = performance.now()
      while (performance.now() - t0 < ms) {
        for (let i = 0; i < perTick; i += 1) emit('line', { d: chunk })
        await sleep(16)
      }
      clearInterval(probeP)
      return { maxLag: Math.round(pMax), long50: pLong50, samples: pSamples }
    }
    out.perLineEvent = await profile(1, 2000)
    out.perChunkEvent = await profile(50, 2000)

    /*
     * 持续洪泛（D151）：缓冲已满之后的稳态。每 50ms 推 20×50=1000 行 ≈ 20k 行/秒，
     * 持续 ${String(BUDGET.sustainedMs)} ms——每帧都在「淘汰最旧 + 插入最新」，这才是
     * 用户报的「日志一快页面就卡」。指标：事件循环延迟剖面 + 长帧数。
     */
    let sMaxLag = 0
    let sLong50 = 0
    let sLong100 = 0
    let sSamples = 0
    let lastS = performance.now()
    const probeS = setInterval(() => {
      const now = performance.now()
      const lag = now - lastS - 16
      lastS = now
      sSamples += 1
      if (lag > 50) sLong50 += 1
      if (lag > 100) sLong100 += 1
      sMaxLag = Math.max(sMaxLag, lag)
    }, 16)
    const t2 = performance.now()
    while (performance.now() - t2 < ${String(BUDGET.sustainedMs)}) {
      for (let i = 0; i < 20; i += 1) emit('line', { d: CHUNK_LONG })
      await sleep(50)
    }
    await sleep(600)
    clearInterval(probeS)
    out.sustainedMs = Math.round(performance.now() - t2)
    out.sustainedMaxLagMs = Math.round(sMaxLag)
    out.sustainedLongFrames = sLong100
    out.sustainedLong50Frames = sLong50
    out.sustainedSamples = sSamples
    out.sustainedRows = totalRows()
    out.sustainedDomRows = mountedRows()
    // 跟随还生不生效：贴底时最后挂出来的一行必须是**最新那一行**（seq=49 是本轮最后一块的末行）
    const tailRows = qa('.dk_logLine')
    out.sustainedLastRow = textOf(tailRows[tailRows.length - 1])
    out.sustainedNodes = q('.dk_logBody') ? q('.dk_logBody').querySelectorAll('*').length : -1
    /*
     * 回归（D152 修复 + 用户现场）：主机侧积压的 banner 一弹、流一断重连，两件事都不许发生——
     *   1. 跟随不能**悄悄停掉**（banner 改变面板高度会被误判成「用户上滚」）；
     *   2. 正文不能空白（窗口按状态里的旧滚动位置渲染，而浏览器的真实位置已经不匹配）。
     * 「有没有行真的落在视口里」是这两条的统一判据。
     */
    const visibleRowsNow = () => {
      const body = q('.dk_logBody')
      if (!body) return -1
      const rect = body.getBoundingClientRect()
      return qa('.dk_logLine').filter((el) => {
        const r = el.getBoundingClientRect()
        return r.bottom > rect.top && r.top < rect.bottom
      }).length
    }
    const lastRowTextNow = () => {
      const rows = qa('.dk_logLine')
      return rows.length === 0 ? '' : rows[rows.length - 1].textContent
    }
    emit('end', { reason: 'output-limit', code: null })
    await sleep(250)
    out.limitVisibleRows = visibleRowsNow()
    out.limitBackToBottom = q('.dk_backToBottom') !== null
    out.limitState = q('.dk_followState') ? q('.dk_followState').textContent.trim() : ''
    await sleep(1600)
    out.reconnectVisibleRows = visibleRowsNow()
    out.reconnectBackToBottom = q('.dk_backToBottom') !== null
    out.reconnectLastRow = lastRowTextNow()
    out.reconnectSources = openedEventSources()

    /*
     * 「上滚暂停跟随」的两个方向（D152 加固）：只有**真的有人滚**（1.5s 内有过手势）才算用户
     * 上滚——洪泛里位置被夹紧/抖动不该停掉跟随。此刻流是静止的（我们不再 emit），所以判定确定。
     */
    const backButtonShown = () => q('.dk_backToBottom') !== null
    const gestureBody = q('.dk_logBody')
    // 正例：真手势 + 位置上移 → 必须出现「回到底部」
    gestureBody.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true }))
    gestureBody.scrollTop = Math.max(0, gestureBody.scrollTop - 400)
    await sleep(250)
    out.gestureUnpinned = backButtonShown()
    const backBtn = q('.dk_backToBottom')
    if (backBtn !== null) backBtn.click()
    await sleep(250)
    out.gestureRepinned = backButtonShown() === false
    // 反例：没有手势、只把位置移上去（模拟夹紧/抖动）→ 不许停跟随。
    // 先等出手势窗口（1.5s）——否则上一步的 wheel 还「新鲜」，反例就不成立了
    await sleep(1700)
    gestureBody.scrollTop = Math.max(0, gestureBody.scrollTop - 400)
    await sleep(250)
    out.noGestureBackBtn = backButtonShown()
    // 再来一批日志：必须贴回最新行（说明跟随确实还在）
    for (let i = 0; i < 40; i += 1) emit('line', { d: CHUNK_LONG })
    await sleep(600)
    out.noGestureLastRow = lastRowTextNow()

    /*
     * 回归（D154）：洪泛中**驻留历史**。跟随流没停，环形缓冲还在淘汰最旧的行——
     * 可见区顶行**上方**的总高每帧都在变短，若不补偿，视口内容会持续上移，读历史
     * 成了自动「倒带」。旧实现的锚点补偿以「本次渲染自己的 anchorOffset」为基准，
     * 只补得到量高修正、补不到淘汰位移，恰恰漏掉这条最高频的路径。
     * 判据：慢速洪泛（每 120ms 一行，1.6s ≈ 13 行 ≈ 260px 位移）下驻留 1.2s，
     * 可见区顶行必须还是同一行、位置几乎不动。驻留点离底部 400px > 位移量，
     * 不会被「贴近底部」判定误拉回贴底。
     */
    gestureBody.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true }))
    gestureBody.scrollTop = Math.max(0, gestureBody.scrollTop - 400)
    let parkN = 0
    const parkFlood = setInterval(() => {
      parkN += 1
      emit('line', { d: 'park-' + String(parkN) + '\\n' })
    }, 120)
    await sleep(400)
    const topVisibleRow = () => {
      const body = q('.dk_logBody')
      if (!body) return null
      const rect = body.getBoundingClientRect()
      for (const el of qa('.dk_logLine')) {
        const r = el.getBoundingClientRect()
        if (r.bottom > rect.top + 4) return { id: el.getAttribute('data-log-row'), top: Math.round(r.top) }
      }
      return null
    }
    const parked = topVisibleRow()
    await sleep(1200)
    const reparked = topVisibleRow()
    clearInterval(parkFlood)
    out.parkedRowId = parked === null ? '' : String(parked.id)
    out.parkSameRow = parked !== null && reparked !== null && parked.id === reparked.id
    out.parkTopDelta = parked !== null && reparked !== null ? Math.abs(reparked.top - parked.top) : -1

    out.droppedBanner = qa('.dk_banner').some((el) => el.textContent.indexOf('丢弃最早') >= 0)
    out.stillInteractive = qa('.dk_tab').length >= 3 && q('.dk_logBody') !== null
    return JSON.stringify(out)
  } catch (error) {
    return JSON.stringify({ error: error instanceof Error ? error.message : String(error), steps: out.steps })
  }
})()`

const chrome = await Chrome.launch({ path: chromePath, extraArgs: ['--no-sandbox'] })
let raw = '{}'
try {
  await chrome.attachToPage()
  await chrome.send('Page.enable')
  await chrome.send('Runtime.enable')
  await chrome.send('Page.navigate', { url: `http://127.0.0.1:${String(port)}/harness.html?scenario=docker-panel&theme=light` })
  raw = await chrome.evaluate(MEASURE)
} finally {
  chrome.close()
  server.close()
}

let result
try {
  result = JSON.parse(raw)
} catch {
  console.error('[log-perf] 量测返回不可解析：' + raw.slice(0, 400))
  process.exit(1)
}
if (result.error !== undefined) {
  console.error('[log-perf] 量测失败：' + result.error)
  process.exit(1)
}

console.log('[log-perf] 5000 行快照：' + String(result.snapshotMs) + 'ms / 共 ' + String(result.snapshotRows) + ' 行 / 挂 ' + String(result.snapshotDomRows) + ' 行 / ' + String(result.snapshotNodes) + ' 个 DOM 节点 / 视口 ' + String(result.snapshotViewH) + 'px / 滚动高 ' + String(result.snapshotScrollH) + 'px')
console.log('[log-perf] FOLLOW 突发 20000 行：' + String(result.burstMs) + 'ms / 事件循环最大延迟 ' + String(result.burstMaxLagMs) + 'ms / 收敛后 ' + String(result.burstRows) + ' 行 / 挂 ' + String(result.burstDomRows) + ' 行 / ' + String(result.burstNodes) + ' 节点')
console.log('[log-perf] 窗口化正确性：滚到顶第一行「' + String(result.topFirstRow).slice(0, 60) + '」/ 滚到底最后一行「' + String(result.bottomLastRow).slice(0, 60) + '」')
console.log('[log-perf] 事件洪泛 6.2k 行/秒：每事件 1 行 → 最大延迟 ' + String(result.perLineEvent.maxLag) + 'ms / 长帧 >50ms ' + String(result.perLineEvent.long50) + ' 个；每事件 50 行 → 最大延迟 ' + String(result.perChunkEvent.maxLag) + 'ms / 长帧 >50ms ' + String(result.perChunkEvent.long50) + ' 个')
console.log('[log-perf] 持续洪泛 20k 行/秒 × ' + String(BUDGET.sustainedMs) + 'ms：最大延迟 ' + String(result.sustainedMaxLagMs) + 'ms / 长帧 >50ms ' + String(result.sustainedLong50Frames) + ' 个 / >100ms ' + String(result.sustainedLongFrames) + ' 个 / ' + String(result.sustainedSamples) + ' 次采样 / ' + String(result.sustainedRows) + ' 行 / 挂 ' + String(result.sustainedDomRows) + ' 行 / ' + String(result.sustainedNodes) + ' 节点')
console.log('[log-perf] 字节闸可见性：快照 truncated=true 时出现「已截断」横幅 = ' + String(result.truncatedBanner))
console.log('[log-perf] 上滚判定：真手势上滚→出现回到底部 ' + String(result.gestureUnpinned) + ' / 点击后恢复贴底 ' + String(result.gestureRepinned) + ' / 无手势位移→回到底部 ' + String(result.noGestureBackBtn) + ' / 之后末行是最新 seq=49：' + String(String(result.noGestureLastRow).indexOf('seq=49') >= 0))
console.log('[log-perf] 积压/重连回归：积压后可见行 ' + String(result.limitVisibleRows) + ' / 回到底部按钮 ' + String(result.limitBackToBottom) + ' / 状态「' + String(result.limitState) + '」 → 重连后可见行 ' + String(result.reconnectVisibleRows) + ' / 回到底部按钮 ' + String(result.reconnectBackToBottom) + ' / 末行含最新 seq=49：' + String(String(result.reconnectLastRow).indexOf('seq=49') >= 0) + ' / 事件源 ' + String(result.reconnectSources) + ' 个')
console.log('[log-perf] 驻留历史回归：洪泛中驻留 1.2s → 同一行 ' + String(result.parkSameRow) + ' / 顶行位移 ' + String(result.parkTopDelta) + 'px（锚点 id=' + String(result.parkedRowId) + '）')
console.log('[log-perf] 换代回归（快照刷新）：刷新回普通行后滚动高 ' + String(result.refreshGeometryH) + 'px（上限 ' + String(BUDGET.snapshotRows * 23) + 'px = 5000 行 × 20px 估算 + 余量）/ 行数 ' + String(result.refreshTotal))
console.log('[log-perf] 丢弃横幅 ' + String(result.droppedBanner) + ' / 仍可交互 ' + String(result.stillInteractive))

const failures = []
if (result.snapshotMs > BUDGET.snapshotMs) failures.push('快照渲染 ' + String(result.snapshotMs) + 'ms 超出预算 ' + String(BUDGET.snapshotMs) + 'ms')
if (result.snapshotRows < BUDGET.snapshotRows) failures.push('快照只渲染了 ' + String(result.snapshotRows) + ' 行（应 ≥ ' + String(BUDGET.snapshotRows) + '）')
if (result.burstMs > BUDGET.burstMs) failures.push('突发处理 ' + String(result.burstMs) + 'ms 超出预算 ' + String(BUDGET.burstMs) + 'ms')
if (result.burstMaxLagMs > BUDGET.burstMaxLagMs) failures.push('事件循环最大延迟 ' + String(result.burstMaxLagMs) + 'ms 超出预算 ' + String(BUDGET.burstMaxLagMs) + 'ms')
if (result.sustainedMaxLagMs > BUDGET.sustainedMaxLagMs) failures.push('持续洪泛最大延迟 ' + String(result.sustainedMaxLagMs) + 'ms 超出预算 ' + String(BUDGET.sustainedMaxLagMs) + 'ms')
if (result.sustainedLongFrames > BUDGET.sustainedLongFrames) failures.push('持续洪泛出现了 ' + String(result.sustainedLongFrames) + ' 个 >100ms 的长帧（上限 ' + String(BUDGET.sustainedLongFrames) + '）')
if (result.sustainedRows > BUDGET.snapshotRows) failures.push('洪泛后行数 ' + String(result.sustainedRows) + ' 超过缓冲上限 ' + String(BUDGET.snapshotRows))
if (result.perLineEvent.maxLag > BUDGET.perLineEventMaxLagMs) failures.push('每事件 1 行的最大延迟 ' + String(result.perLineEvent.maxLag) + 'ms 超出预算 ' + String(BUDGET.perLineEventMaxLagMs) + 'ms')
// 窗口化（D152）：挂载行数有上限（虚拟滚动还生不生效）＋ 窗口算错会立刻体现在内容上
for (const [name, value] of [['快照', result.snapshotDomRows], ['突发', result.burstDomRows], ['洪泛', result.sustainedDomRows]]) {
  if (value > BUDGET.mountedRows) failures.push(name + '阶段挂载了 ' + String(value) + ' 行，超出窗口上限 ' + String(BUDGET.mountedRows) + '（虚拟滚动没生效？）')
}
if (String(result.topFirstRow).indexOf('seq=0') === -1) failures.push('滚到顶部第一行不是 seq=0：窗口算错了（拿到「' + String(result.topFirstRow).slice(0, 80) + '」）')
if (String(result.bottomLastRow).indexOf('seq=4999') === -1) failures.push('滚到底部最后一行不是 seq=4999：窗口算错了（拿到「' + String(result.bottomLastRow).slice(0, 80) + '」）')
// 贴底跟随：洪泛结束后最后挂出来的一行必须是最新行（否则「跟随」只剩状态行在说）
if (String(result.sustainedLastRow).indexOf('seq=49') === -1) failures.push('洪泛结束后最后一行不是最新行：贴底跟随失效（拿到「' + String(result.sustainedLastRow).slice(0, 80) + '」）')
// —— D152 修复的回归（用户现场：积压 banner 一弹就「跟随停掉 + 正文空白」）——
if (result.limitVisibleRows <= 0) failures.push('主机侧积压之后正文空白：视口里一行都没有（窗口与真实滚动位置失配）')
if (result.limitBackToBottom !== false) failures.push('主机侧积压之后跟随被悄悄停掉（出现了「回到底部」按钮）——banner 改高度不该被当成用户上滚')
if (result.reconnectVisibleRows <= 0) failures.push('重连之后正文空白：视口里一行都没有')
if (String(result.reconnectLastRow).indexOf('seq=49') === -1) failures.push('重连之后没有贴回最新行：跟随没恢复（拿到「' + String(result.reconnectLastRow).slice(0, 80) + '」）')
if (result.reconnectSources < 2) failures.push('积压之后没有自动重连（事件源只有 ' + String(result.reconnectSources) + ' 个）')
// 字节闸一生效就必须有黄色横幅（否则「选 1000 行只回来 985 行」会被误解成丢行）
if (result.truncatedBanner !== true) failures.push('快照被「输出上限（KB）」截断时没有给出「已截断」横幅（拿到 ' + String(result.truncatedBanner) + '）')
// 上滚判定只在真手势下成立：真手势必须停跟随，无手势的位移绝不许停（D152 加固）
if (result.gestureUnpinned !== true) failures.push('真手势上滚之后没有暂停跟随（D61 的语义被改坏了）')
if (result.gestureRepinned !== true) failures.push('点「回到底部」之后没有恢复贴底')
if (result.noGestureBackBtn !== false) failures.push('没有手势时位置上移被误判成「用户上滚」→ 跟随停掉、冒出「回到底部」')
if (String(result.noGestureLastRow).indexOf('seq=49') === -1) failures.push('无手势位移之后没有贴回最新行（跟随没恢复）：拿到「' + String(result.noGestureLastRow).slice(0, 80) + '」')
// —— D154 修复的回归：洪泛中驻留历史，缓冲持续淘汰不许把内容「倒带」——
if (result.parkSameRow !== true) failures.push('洪泛中驻留历史 1.2s 后可见区顶行变了（环形缓冲淘汰的位移没补偿，读历史在自动上飘）：锚点 id=' + String(result.parkedRowId) + ' / 位移 ' + String(result.parkTopDelta) + 'px')
if (result.parkTopDelta < 0 || result.parkTopDelta > 24) failures.push('洪泛中驻留历史时顶行位移 ' + String(result.parkTopDelta) + 'px 超出容差 24px')
// —— D155 修复的回归：快照刷新换代，不许把滚动位置推走 ——
if (result.refreshTotal !== BUDGET.snapshotRows) failures.push('换代回归：刷新后行数 ' + String(result.refreshTotal) + ' ≠ ' + String(BUDGET.snapshotRows))
if (result.refreshGeometryH < 0 || result.refreshGeometryH > BUDGET.snapshotRows * 23) failures.push('换代后滚动高 ' + String(result.refreshGeometryH) + 'px 虚高（上限 ' + String(BUDGET.snapshotRows * 23) + 'px）：上一代的实测高度还留在垫高里——快照 id 是位置寻址，刷新后 id 已是另一行（D155）')
if (result.burstRows > BUDGET.snapshotRows) failures.push('突发后行数 ' + String(result.burstRows) + ' 超过缓冲上限 ' + String(BUDGET.snapshotRows))
if (result.snapshotNodes > BUDGET.maxNodes || result.burstNodes > BUDGET.maxNodes || result.sustainedNodes > BUDGET.maxNodes) failures.push('DOM 节点数超出预算 ' + String(BUDGET.maxNodes))
if (result.droppedBanner !== true) failures.push('突发撑爆缓冲后没有「已丢弃最早内容」横幅')
if (result.stillInteractive !== true) failures.push('突发后界面失去可交互性')

if (failures.length > 0) {
  console.error('[log-perf] 性能预算未通过：')
  for (const item of failures) console.error('  - ' + item)
  process.exit(1)
}
console.log('[log-perf] 性能预算通过')
