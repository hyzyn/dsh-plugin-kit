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
  burstMaxLagMs: 400,
  maxNodes: 60_000,
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
    const LINE = '2026-09-24T12:00:00.000Z [INFO] request handled in 12ms path=/api/v1/orders/{id} trace=abc'
    const BIG = Array.from({ length: 5000 }, (_, i) => LINE + ' seq=' + String(i)).join('\\n')
    const realFetch = window.fetch.bind(window)
    window.fetch = (url, init) => {
      const target = typeof url === 'string' ? url : String(url && url.url ? url.url : url)
      if (target.indexOf('/logs/stream') === -1 && target.indexOf('/logs') !== -1) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, logs: { id: 'app-web-1', text: BIG, truncated: false } }) })
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
    await waitFor(() => qa('.dk_logLine').length >= 4000)
    await sleep(150)
    out.snapshotMs = Math.round(performance.now() - t0)
    out.snapshotRows = qa('.dk_logLine').length
    out.snapshotNodes = q('.dk_logBody') ? q('.dk_logBody').querySelectorAll('*').length : -1

    let maxLag = 0
    let last = performance.now()
    const probe = setInterval(() => {
      const now = performance.now()
      maxLag = Math.max(maxLag, now - last - 16)
      last = now
    }, 16)

    let emit = null
    window.EventSource = class {
      constructor() {
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
    out.burstRows = qa('.dk_logLine').length
    out.burstMaxLagMs = Math.round(maxLag)
    out.burstNodes = q('.dk_logBody') ? q('.dk_logBody').querySelectorAll('*').length : -1
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

console.log('[log-perf] 5000 行快照：' + String(result.snapshotMs) + 'ms / ' + String(result.snapshotRows) + ' 行 / ' + String(result.snapshotNodes) + ' 个 DOM 节点')
console.log('[log-perf] FOLLOW 突发 20000 行：' + String(result.burstMs) + 'ms / 事件循环最大延迟 ' + String(result.burstMaxLagMs) + 'ms / 收敛后 ' + String(result.burstRows) + ' 行 / ' + String(result.burstNodes) + ' 节点')
console.log('[log-perf] 丢弃横幅 ' + String(result.droppedBanner) + ' / 仍可交互 ' + String(result.stillInteractive))

const failures = []
if (result.snapshotMs > BUDGET.snapshotMs) failures.push('快照渲染 ' + String(result.snapshotMs) + 'ms 超出预算 ' + String(BUDGET.snapshotMs) + 'ms')
if (result.snapshotRows < BUDGET.snapshotRows) failures.push('快照只渲染了 ' + String(result.snapshotRows) + ' 行（应 ≥ ' + String(BUDGET.snapshotRows) + '）')
if (result.burstMs > BUDGET.burstMs) failures.push('突发处理 ' + String(result.burstMs) + 'ms 超出预算 ' + String(BUDGET.burstMs) + 'ms')
if (result.burstMaxLagMs > BUDGET.burstMaxLagMs) failures.push('事件循环最大延迟 ' + String(result.burstMaxLagMs) + 'ms 超出预算 ' + String(BUDGET.burstMaxLagMs) + 'ms')
if (result.burstRows > BUDGET.snapshotRows) failures.push('突发后行数 ' + String(result.burstRows) + ' 超过缓冲上限 ' + String(BUDGET.snapshotRows))
if (result.snapshotNodes > BUDGET.maxNodes || result.burstNodes > BUDGET.maxNodes) failures.push('DOM 节点数超出预算 ' + String(BUDGET.maxNodes))
if (result.droppedBanner !== true) failures.push('突发撑爆缓冲后没有「已丢弃最早内容」横幅')
if (result.stillInteractive !== true) failures.push('突发后界面失去可交互性')

if (failures.length > 0) {
  console.error('[log-perf] 性能预算未通过：')
  for (const item of failures) console.error('  - ' + item)
  process.exit(1)
}
console.log('[log-perf] 性能预算通过')
