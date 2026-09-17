/**
 * `@hyzyn/dsh-rss-digest` 的 **OPML 导入 / 导出** 功能验证（借浏览器当入口）。
 *
 * 为什么单独做：这是卡片上三个按钮背后的整块功能（「导入 OPML」「导出 OPML」「粘贴 URL 列表」），
 * 而它的实现全在**客户端半体**（`packages/rss/client.js`：`parseOpmlText` / `buildOpml` /
 * `importSourcesFromText`）—— 路由测试、宿主单测都碰不到，之前一次都没跑过。
 *
 * 断言的是**真实结果**：
 *   O1 导出：点「导出 OPML」→ 走真实下载 → 解析下载到的文件，逐个核对宿主 `/config` 里的
 *      source 都在 OPML 里（`xmlUrl` 与分组 `category` 都对）；
 *   O2 导入：把一份 OPML 经 `DOM.setFileInputFiles` 喂给隐藏的 file input → 该路径会
 *      **自动保存**（`importSourcesFromText(..., 'OPML', true)`）→ 回读宿主 `/config`，
 *      两个新源必须真的落了盘，且已存在的源被跳过（不重复）；
 *   O3 回环：再导出一次，刚导入的源要出现在 OPML 里。
 *
 * 脚本会把宿主配置**恢复原状**（导入前先存基线，结束前写回），不会留下测试订阅源。
 *
 * 用法：
 *   node scripts/verify-rss-opml.mjs --url http://127.0.0.1:3082 --token <token> \
 *        [--report out.json] [--download-dir /tmp/x] [--keep]
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import http, { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Chrome } from './chrome-cdp.mjs'

const argv = process.argv.slice(2)
const flag = (name) => {
  const index = argv.indexOf(name)
  return index === -1 ? undefined : argv[index + 1]
}
const baseUrl = flag('--url') ?? 'http://127.0.0.1:3082'
const token = flag('--token')
const reportPath = flag('--report')
const keep = argv.includes('--keep')
const downloadDir = mkdtempSync(join(tmpdir(), 'dsh-opml-'))

const results = []
const record = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '\n      ' + detail : ''}`)
}

const url = new URL(baseUrl)
const api = (method, path, body) =>
  new Promise((resolve) => {
    const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body))
    const request = http.request(
      {
        host: url.hostname,
        port: Number(url.port || 80),
        path,
        method,
        headers: {
          host: `${url.hostname}:${String(url.port || 80)}`,
          ...(payload === undefined ? {} : { 'content-type': 'application/json', 'content-length': String(payload.length) }),
        },
      },
      (response) => {
        let text = ''
        response.setEncoding('utf8')
        response.on('data', (chunk) => (text += chunk))
        response.on('end', () => {
          try {
            resolve({ status: response.statusCode, body: JSON.parse(text) })
          } catch {
            resolve({ status: response.statusCode, body: undefined, text })
          }
        })
      },
    )
    request.on('error', (error) => resolve({ status: 0, error: String(error?.message ?? error) }))
    request.setTimeout(60_000, () => {
      request.destroy()
      resolve({ status: 0, error: 'timeout' })
    })
    if (payload !== undefined) request.write(payload)
    request.end()
  })

const readConfig = async () => {
  const got = await api('GET', '/api/dsh-rss/config')
  return got.body?.config ?? got.body
}
const writeConfig = (config) => api('POST', '/api/dsh-rss/config', { config })

console.log('# dsh-rss 的 OPML 导入 / 导出功能验证')
console.log(`# node ${process.version} / 宿主 ${baseUrl}\n`)

const baseline = await readConfig()
if (baseline?.sources === undefined) {
  console.error(`拿不到宿主 rss 配置：${JSON.stringify(baseline).slice(0, 200)}`)
  process.exit(1)
}
console.log(`# 基线：${String(baseline.sources.length)} 个订阅源\n`)

/* ---------------- 本地真 RSS 服务（导入的源必须**抓得到**） ---------------- *
 * 宿主在保存前会对**新增**的自定义源真的抓一次（`validateCustomSource`），抓不到就整批
 * 不落盘（400 且点名到源）。所以夹具不能用假域名 —— 早先那次失败正是这个原因，
 * 不是产品缺陷。这里起一个本地 HTTP 服务喂两个真 feed。 */
const feedServer = createServer((request, response) => {
  const which = request.url?.includes('feed-b') ? 'B' : 'A'
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0"><channel><title>Probe ' + which + '</title><link>http://127.0.0.1/</link>',
    '<item><title>探针条目 ' + which + '</title><link>http://127.0.0.1/item-' + which + '</link>',
    '<description>夹具条目</description><pubDate>Tue, 02 Jan 2024 00:00:00 GMT</pubDate></item>',
    '</channel></rss>',
  ].join('')
  response.writeHead(200, { 'content-type': 'application/rss+xml' })
  response.end(xml)
})
await new Promise((resolve) => feedServer.listen(0, '127.0.0.1', resolve))
const feedPort = feedServer.address().port
const PROBE_URLS = [`http://127.0.0.1:${String(feedPort)}/feed-a.xml`, `http://127.0.0.1:${String(feedPort)}/feed-b.xml`]
const fixturePath = join(downloadDir, 'probe-import.opml')
writeFileSync(
  fixturePath,
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    '<head><title>probe</title></head>',
    '<body>',
    `  <outline type="rss" text="Probe A" title="Probe A" category="探针" xmlUrl="${PROBE_URLS[0]}"/>`,
    `  <outline type="rss" text="Probe B" title="Probe B" category="探针" xmlUrl="${PROBE_URLS[1]}"/>`,
    // 已存在的一条：导入时必须被跳过（不重复）
    baseline.sources[0]?.url === undefined ? '' : `  <outline type="rss" text="Dup" title="Dup" xmlUrl="${String(baseline.sources[0].url)}"/>`,
    '</body>',
    '</opml>',
  ].join('\n'),
)

/** 导出文件名固定（`dsh-rss-subscriptions.opml`），第二次会**同名覆盖** —— 所以不能只看
 *  「有没有新文件名」，要看 size+mtime 变了没有。 */
const snapshotExports = () => {
  const out = {}
  for (const name of readdirSync(downloadDir)) {
    if (!name.endsWith('.opml') || name === 'probe-import.opml') continue
    try {
      const stat = statSync(join(downloadDir, name))
      out[name] = `${String(stat.size)}:${String(stat.mtimeMs)}`
    } catch {
      /* 正在写，下一轮再看 */
    }
  }
  return out
}
const waitForExport = async (before, timeoutMs = 20_000) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    for (const name of readdirSync(downloadDir)) {
      if (!name.endsWith('.opml') || name === 'probe-import.opml') continue
      const path = join(downloadDir, name)
      let stat
      try {
        stat = statSync(path)
      } catch {
        continue
      }
      if (before[name] === `${String(stat.size)}:${String(stat.mtimeMs)}`) continue
      const text = readFileSync(path, 'utf8')
      if (text.includes('</opml>')) return { path, text }
    }
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
  return undefined
}

const chrome = await Chrome.launch({})
let crashed
try {
  await chrome.attachToPage()
  await chrome.send('Runtime.enable')
  await chrome.send('Page.enable')
  await chrome.send('DOM.enable')
  await chrome.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir })
  /** 等应用壳渲染出内容（只看 bodyChildren>0 会太早，UI 脚本那边踩过）。 */
  const waitForShell = async () => {
    const deadline = Date.now() + 45_000
    while (Date.now() < deadline) {
      const state = await chrome.evaluate(`(() => ({
        text: (document.body.innerText ?? '').length,
        plugins: performance.getEntriesByType('resource').filter((e) => e.name.includes('/plugins/')).length,
      }))()`)
      if (state.text > 80 && state.plugins >= 1) return true
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    return false
  }

  /** 注入点击助手（页面刷新后要重新注入）。 */
  const injectHelpers = () =>
    chrome.evaluate(`(() => {
      const exact = (t) => [...document.querySelectorAll('*')].filter((el) => (el.innerText ?? '').trim() === t)
      const clickExact = (t) => { const el = exact(t).pop(); if (el === undefined) return false; el.click(); return true }
      window.__ui = {
        clickExact,
        dialogText: () => ((document.querySelector('[role=dialog], [class*=settings]') ?? document.body).innerText ?? '').replace(/\\s+/g, ' '),
      }
      return true
    })()`)

  /** 打开 RSS 设置卡片（从当前页面状态出发）。 */
  const clickRssRow = () =>
    chrome.evaluate(`(() => {
      const hits = [...document.querySelectorAll('*')].filter((el) => (el.innerText ?? '').trim().startsWith('RSS / 新闻聚合') && (el.innerText ?? '').trim().length < 60)
      if (hits.length === 0) return false
      hits.sort((a, b) => (a.innerText ?? '').length - (b.innerText ?? '').length)
      const row = hits[0].closest('button, li, [class*=settingsCard]') ?? hits[0]
      row.click()
      return true
    })()`)

  /**
   * 从零走到「RSS 卡片已打开」—— 刷新页面后也能用。
   *
   * O3 会再调一次它：导入触发重渲染之后，**同一页面里的第二次自动下载会被 Chrome 拦掉**
   * （浏览器策略，不是产品问题）。重新加载既绕开该策略，又顺带把 O3 证得更硬 ——
   * 导出读的是**落盘的配置**，而不是内存里的旧快照。
   */
  const openRssCardFresh = async () => {
    await chrome.send('Page.navigate', { url: `${baseUrl}/?token=${String(token)}` })
    await waitForShell()
    await injectHelpers()
    await chrome.evaluate("window.__ui.clickExact('设置')")
    await new Promise((resolve) => setTimeout(resolve, 1500))
    await chrome.evaluate(
      "(() => { const nav = [...document.querySelectorAll('[class*=navLabel]')].find((el) => (el.innerText ?? '').trim() === '插件'); if (nav) nav.click(); return nav !== undefined })()",
    )
    await new Promise((resolve) => setTimeout(resolve, 1500))
    await chrome.evaluate("window.__ui.clickExact('插件配置')")
    await new Promise((resolve) => setTimeout(resolve, 1800))
    await clickRssRow()
    await new Promise((resolve) => setTimeout(resolve, 2000))
    return chrome.evaluate("document.querySelector('[data-action=\"custom-export-opml\"]') !== null")
  }

  const opened = await openRssCardFresh()
  record('O0 打开 RSS 设置卡片（后续断言的前提）', opened === true, `点开=${String(opened)}; 卡片文本长度=${String((await chrome.evaluate('window.__ui.dialogText().length')))}`)

  /* ---------------- O1 导出 ---------------- */
  const beforeFiles = snapshotExports()
  await chrome.evaluate(`(() => {
    const button = document.querySelector('[data-action="custom-export-opml"]')
    if (button === null) return false
    button.click()
    return true
  })()`)
  const first = await waitForExport(beforeFiles)
  const exported = first?.path
  const opml = first?.text ?? ''
  const missing = baseline.sources.filter((source) => !opml.includes(String(source.url)))
  record(
    'O1 点「导出 OPML」→ 真实下载→ 每个宿主订阅源都在 OPML 里（xmlUrl 逐个核对）',
    exported !== undefined && baseline.sources.length > 0 && missing.length === 0,
    exported === undefined
      ? '没等到下载文件'
      : `文件=${exported.split('/').pop()} 大小=${String(opml.length)} 字节 源数=${String(baseline.sources.length)} 缺失=${JSON.stringify(missing.map((s) => s.url))}`,
  )
  if (baseline.sources[0]?.category !== undefined && baseline.sources[0].category !== '') {
    record(
      'O1 导出保留了分组（category 属性）',
      opml.includes(`category="${String(baseline.sources[0].category)}"`),
      `期望包含 category="${String(baseline.sources[0].category)}"`,
    )
  }

  /* ---------------- O2 导入（喂文件给隐藏 input） ---------------- */
  const rootNode = await chrome.send('DOM.getDocument', { depth: -1 })
  const query = await chrome.send('DOM.querySelector', { nodeId: rootNode.root.nodeId, selector: '#rss-import-file' })
  if (query.nodeId === 0) {
    record('O2 找到隐藏的 OPML file input', false, '页面里没有 #rss-import-file')
  } else {
    await chrome.send('DOM.setFileInputFiles', { files: [fixturePath], nodeId: query.nodeId })
    await new Promise((resolve) => setTimeout(resolve, 4000))
    const after = await readConfig()
    const urls = (after?.sources ?? []).map((source) => String(source.url))
    const gotA = urls.includes(PROBE_URLS[0])
    const gotB = urls.includes(PROBE_URLS[1])
    const duplicates = urls.filter((item, index) => urls.indexOf(item) !== index)
    record(
      'O2 导入 OPML：两个新源真的落了盘（该路径是自动保存）',
      gotA && gotB,
      `导入前 ${String(baseline.sources.length)} 条 → 导入后 ${String(urls.length)} 条；A=${String(gotA)} B=${String(gotB)}`,
    )
    record('O2 导入不会造成重复源', duplicates.length === 0, `重复项=${JSON.stringify(duplicates)}`)
    const imported = (after?.sources ?? []).filter((source) => PROBE_URLS.includes(String(source.url)))
    record(
      'O2 导入保留了名称与分组',
      imported.length === 2 && imported.every((source) => source.name !== undefined && source.category === '探针'),
      `导入的两条=${JSON.stringify(imported.map((s) => ({ name: s.name, category: s.category ?? null })))}`,
    )

    /* ---------------- O3 回环：再导出应包含刚导入的源 ---------------- */
    // 重新加载页面后再导出：绕开「同一页面第二次自动下载被拦」，并证明读的是落盘配置
    const ready = await openRssCardFresh()
    console.log(`      O3 前置：刷新后重新打开卡片，导出按钮就绪=${String(ready)}`)
    const beforeFiles2 = snapshotExports()
    const clickedAgain = await chrome.evaluate(`(() => {
      const b = document.querySelector('[data-action="custom-export-opml"]')
      if (b === null) return false
      b.click()
      return true
    })()`)
    if (clickedAgain !== true) console.log('      （提示：O3 时没找到「导出 OPML」按钮）')
    const second = await waitForExport(beforeFiles2)
    const exported2 = second?.path
    const opml2 = second?.text ?? ''
    record(
      'O3 回环：再导出时刚导入的两个源出现了（导出读的是宿主配置，不是旧内存）',
      exported2 !== undefined && opml2.includes(PROBE_URLS[0]) && opml2.includes(PROBE_URLS[1]),
      exported2 === undefined ? '没等到第二次下载' : `文件=${exported2.split('/').pop()}`,
    )
  }
} catch (error) {
  crashed = error
  console.error(`崩溃：${String(error?.stack ?? error?.message ?? error)}`)
} finally {
  if (!keep) {
    const restored = await writeConfig(baseline)
    const verify = await readConfig()
    const leaked = (verify?.sources ?? []).filter((source) => PROBE_URLS.includes(String(source.url)) && !baseline.sources.some((s) => s.url === source.url))
    record('C1 收尾：宿主配置恢复原状（测试源已清掉）', restored.status === 200 && leaked.length === 0, `写回 status=${String(restored.status)} 残留=${JSON.stringify(leaked.map((s) => s.url))}`)
  }
  const failed = results.filter((item) => item.ok !== true)
  console.log(`\n# 汇总：PASS ${results.filter((r) => r.ok === true).length} / FAIL ${failed.length}`)
  if (failed.length > 0) {
    console.log('# 失败项：')
    for (const item of failed) console.log(`  - ${item.name}`)
  }
  if (reportPath !== undefined) {
    writeFileSync(reportPath, `${JSON.stringify({ baseUrl, probeUrls: PROBE_URLS, results }, null, 2)}\n`)
    console.log(`# 报告：${reportPath}`)
  }
  chrome.close()
  try {
    feedServer.close()
  } catch {
    /* 已关 */
  }
  process.exit(crashed === undefined && failed.length === 0 ? 0 : 1)
}
