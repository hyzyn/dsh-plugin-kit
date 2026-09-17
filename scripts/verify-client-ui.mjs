/**
 * 客户端半体（浏览器 UI）验证：用**已装的 Chrome + CDP** 驱动，零新增依赖。
 *
 * 为什么不需要 Windows 真机：客户端半体是纯浏览器 JS，与宿主平台无关；它消费的
 * `/api/dsh-*` 契约已经在真 Windows 上验过（131 PASS）。所以这里对着本机 macOS 的
 * `test` profile（link 到仓库、端口 3082）驱动即可 —— 验的是同一份客户端代码。
 *
 * 驱动方式：Node 22 自带 `fetch` 与全局 `WebSocket`，直接讲 DevTools 协议，
 * 不引入 puppeteer / playwright。Chrome 用系统已装的那份。
 *
 * 模式：
 *   --mode boot   启动 → 带 token 导航 → 收控制台错误/异常 → 断言 9 个 client bundle
 *                 真的被加载 → 截图（默认）
 *   --mode eval   在页面里跑一段 JS 并打印结果（探索 UI 结构用）
 *   --mode shot   只截一张图
 *
 * 用法：
 *   node scripts/verify-client-ui.mjs --url http://127.0.0.1:3082 --token <t> \
 *        --report /tmp/ui.json --shot-dir /tmp/ui-shots
 *   node scripts/verify-client-ui.mjs --mode eval --expr "document.title"
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const argv = process.argv.slice(2)
const flag = (name) => {
  const index = argv.indexOf(name)
  return index === -1 ? undefined : argv[index + 1]
}
const baseUrl = flag('--url') ?? 'http://127.0.0.1:3082'
const token = flag('--token')
const mode = flag('--mode') ?? 'boot'
const expr = flag('--expr')
const reportPath = flag('--report')
const shotDir = flag('--shot-dir')
const chromePath = flag('--chrome') ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const debugPort = Number(flag('--debug-port') ?? 9222 + Math.floor(Math.random() * 500))

const results = []
const record = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '\n      ' + detail : ''}`)
}
const warn = (name, detail) => {
  results.push({ name, ok: true, detail, warned: true })
  console.log(`WARN  ${name}\n      ${detail}`)
}

/* ------------------------------------------------------------------ *
 * 最小 CDP 客户端
 * ------------------------------------------------------------------ */

class Chrome {
  static async launch({ path, port, userDataDir }) {
    const child = spawn(
      path,
      [
        '--headless=new',
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${userDataDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-gpu',
        '--disable-extensions',
        '--window-size=1440,900',
        'about:blank',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let stderr = ''
    child.stderr?.on('data', (chunk) => (stderr += String(chunk)))
    // 等 CDP 端点起来
    const deadline = Date.now() + 20_000
    let version
    while (Date.now() < deadline) {
      try {
        version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()
        break
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 250))
      }
    }
    if (version === undefined) {
      try {
        child.kill()
      } catch {
        /* 已退 */
      }
      throw new Error(`Chrome 的 CDP 端点没起来；stderr=${stderr.slice(0, 400)}`)
    }
    return new Chrome(child, port, version)
  }

  constructor(child, port, version) {
    this.child = child
    this.port = port
    this.version = version
    this.nextId = 1
    this.pending = new Map()
    this.listeners = new Map()
    this.socket = undefined
  }

  async attachToPage() {
    const list = await (await fetch(`http://127.0.0.1:${this.port}/json/list`)).json()
    const page = list.find((item) => item.type === 'page') ?? list[0]
    if (page === undefined) throw new Error('没有可附加的 target')
    await this.connect(page.webSocketDebuggerUrl)
    return page
  }

  connect(url) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url)
      this.socket = socket
      socket.addEventListener('open', () => resolve())
      socket.addEventListener('error', (event) => reject(new Error(`CDP WS error: ${String(event?.message ?? 'unknown')}`)))
      socket.addEventListener('message', (event) => {
        let message
        try {
          message = JSON.parse(String(event.data))
        } catch {
          return
        }
        if (message.id !== undefined) {
          const pending = this.pending.get(message.id)
          if (pending === undefined) return
          this.pending.delete(message.id)
          if (message.error !== undefined) pending.reject(new Error(JSON.stringify(message.error)))
          else pending.resolve(message.result)
          return
        }
        for (const listener of this.listeners.get(message.method) ?? []) listener(message.params)
      })
    })
  }

  send(method, params = {}) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.socket.send(JSON.stringify({ id, method, params }))
      setTimeout(() => {
        if (!this.pending.has(id)) return
        this.pending.delete(id)
        reject(new Error(`CDP ${method} 超时`))
      }, 30_000)
    })
  }

  on(method, listener) {
    const list = this.listeners.get(method) ?? []
    list.push(listener)
    this.listeners.set(method, list)
  }

  async evaluate(expression, { awaitPromise = true } = {}) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true })
    if (result.exceptionDetails !== undefined) {
      throw new Error(`页面里抛错：${result.exceptionDetails.exception?.description ?? JSON.stringify(result.exceptionDetails)}`)
    }
    return result.result?.value
  }

  async screenshot(file) {
    const shot = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    writeFileSync(file, Buffer.from(shot.data, 'base64'))
    return file
  }

  close() {
    try {
      this.socket?.close()
    } catch {
      /* 已关 */
    }
    try {
      this.child.kill()
    } catch {
      /* 已退 */
    }
  }
}

/* ------------------------------------------------------------------ *
 * 启动
 * ------------------------------------------------------------------ */

const userDataDir = join(tmpdir(), `dsh-ui-${String(process.pid)}`)
rmSync(userDataDir, { recursive: true, force: true })
mkdirSync(userDataDir, { recursive: true })

const chrome = await Chrome.launch({ path: chromePath, port: debugPort, userDataDir })
console.log(`# Chrome ${String(chrome.version.Browser)} / CDP :${String(debugPort)}`)

const consoleErrors = []
const exceptions = []
const failedRequests = []
let crashed
try {
  await chrome.attachToPage()
  await chrome.send('Runtime.enable')
  await chrome.send('Log.enable')
  await chrome.send('Network.enable')
  await chrome.send('Page.enable')
  chrome.on('Runtime.consoleAPICalled', (params) => {
    if (params.type !== 'error' && params.type !== 'assert') return
    const text = (params.args ?? []).map((arg) => arg.description ?? arg.value ?? arg.type).join(' ')
    consoleErrors.push(text)
  })
  chrome.on('Runtime.exceptionThrown', (params) => {
    exceptions.push(params.exceptionDetails?.exception?.description ?? JSON.stringify(params.exceptionDetails))
  })
  chrome.on('Log.entryAdded', (params) => {
    if (params.entry?.level === 'error') consoleErrors.push(`[log] ${String(params.entry.text)}`)
  })
  chrome.on('Network.responseReceived', (params) => {
    if ((params.response?.status ?? 0) >= 400) failedRequests.push(`${String(params.response?.status)} ${String(params.response?.url)}`)
  })

  if (mode === 'eval') {
    if (expr === undefined) throw new Error('--mode eval 需要 --expr')
    await chrome.send('Page.navigate', { url: `${baseUrl}/?token=${String(token)}` })
    await new Promise((resolve) => setTimeout(resolve, 4000))
    const value = await chrome.evaluate(expr)
    console.log(JSON.stringify(value, null, 2))
  } else if (mode === 'shot') {
    await chrome.send('Page.navigate', { url: `${baseUrl}/?token=${String(token)}` })
    await new Promise((resolve) => setTimeout(resolve, 5000))
    const file = join(shotDir ?? tmpdir(), `shell-${String(Date.now())}.png`)
    mkdirSync(shotDir ?? tmpdir(), { recursive: true })
    console.log(`# 截图：${await chrome.screenshot(file)}`)
  } else {
    /* ---------------- mode = boot ---------------- */
    await chrome.send('Page.navigate', { url: `${baseUrl}/?token=${String(token)}` })

    // 等应用壳起来：DSH 的入口会挂一个根节点并预载 client 模块
    const deadline = Date.now() + 45_000
    let ready = false
    let bootState = {}
    while (Date.now() < deadline) {
      bootState = await chrome.evaluate(`(() => {
        const resources = performance.getEntriesByType('resource').map((entry) => entry.name)
        const plugins = resources.filter((name) => name.includes('/plugins/'))
        const body = document.body
        return {
          title: document.title,
          bodyChildren: body === null ? 0 : body.children.length,
          textLength: body === null ? 0 : (body.innerText ?? '').length,
          pluginRequests: plugins.length,
          hasBoot: typeof window.__DSH_BOOT__ !== 'undefined',
        }
      })()`)
      // 就绪 = **真的渲染出内容**（早先只看 bodyChildren>0，页面还没画出来就往下走，
      // 于是 UI1 报「可见文本 0 字符」、UI2 数出 0 个 bundle）
      if (bootState.bodyChildren > 0 && bootState.pluginRequests > 0 && bootState.textLength > 80) {
        ready = true
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    record(
      'UI1 应用壳加载：带 token 打开后页面真的渲染出内容',
      ready && bootState.textLength > 20,
      `title=${JSON.stringify(bootState.title)} bodyChildren=${String(bootState.bodyChildren)} 可见文本 ${String(bootState.textLength)} 字符 插件请求 ${String(bootState.pluginRequests)} 条`,
    )

    const bundleReport = await chrome.evaluate(`(() => {
      const names = performance.getEntriesByType('resource').map((entry) => entry.name)
      // client 模块是**一个合并请求**送来的：/plugins/??a/client.js,b/client.js&rev=…
      // 所以要从每条 URL 里把**所有** @hyzyn 段都抠出来（早先只 exec 第一个匹配，
      // 于是 9 个只数出 1 个）。
      const ours = new Set()
      for (const name of names) {
        for (const match of name.matchAll(/@hyzyn(?:%2F|\\/)([a-z-]+)/g)) ours.add(match[1])
      }
      const pluginUrls = names.filter((name) => name.includes('/plugins/'))
      return { ours: [...ours], pluginUrls, total: names.length }
    })()`)
    record(
      'UI2 九个插件的客户端 bundle 在真浏览器里被真的加载了',
      bundleReport.ours.length >= 9,
      `${bundleReport.ours.length} 个 @hyzyn bundle（${bundleReport.pluginUrls.length} 条 /plugins/ 请求）：${JSON.stringify(bundleReport.ours.sort())}`,
    )

    if (shotDir !== undefined) {
      mkdirSync(shotDir, { recursive: true })
      const file = join(shotDir, 'shell.png')
      record('UI3 截图留证', true, `已写出 ${await chrome.screenshot(file)}`)
    }

    record(
      'UI4 加载期间没有未捕获异常',
      exceptions.length === 0,
      exceptions.length === 0 ? '0 条' : exceptions.slice(0, 3).join('\n      '),
    )
    record(
      'UI5 加载期间控制台没有 error 级输出',
      consoleErrors.length === 0,
      consoleErrors.length === 0 ? '0 条' : consoleErrors.slice(0, 5).join('\n      '),
    )
    if (failedRequests.length > 0) {
      warn('UI6 有失败的网络请求（可能是预期外的 404/5xx）', failedRequests.slice(0, 6).join('\n      '))
    } else {
      record('UI6 所有子请求都成功（无 4xx/5xx）', true, '0 条失败请求')
    }

    if (mode === 'cards' || mode === 'full') {
      /* ---------------- 点击级：设置 → 插件 → 逐个卡片 ---------------- */

      // 页面里注入一组小助手（textContent 匹配 + 沿 DOM 找可点的行）
      await chrome.evaluate(`(() => {
        const exact = (t) => [...document.querySelectorAll('*')].filter((el) => (el.innerText ?? '').trim() === t)
        const clickExact = (t) => { const el = exact(t).pop(); if (el === undefined) return false; el.click(); return true }
        const findCard = (t) => {
          const hits = [...document.querySelectorAll('*')]
            .filter((el) => (el.innerText ?? '').trim().startsWith(t) && (el.innerText ?? '').trim().length < t.length + 120)
          if (hits.length === 0) return null
          // 取最深（innerText 最短）的那个，再往上找整张卡片（LI.dk_settingsCard 那一层）
          hits.sort((a, b) => (a.innerText ?? '').length - (b.innerText ?? '').length)
          return hits[0].closest('li, [class*=settingsCard], [class*=card]') ?? hits[0]
        }
        const clickStartsWith = (t) => {
          const leaf = (() => {
            const hits = [...document.querySelectorAll('*')]
              .filter((el) => (el.innerText ?? '').trim().startsWith(t) && (el.innerText ?? '').trim().length < t.length + 120)
            if (hits.length === 0) return null
            hits.sort((a, b) => (a.innerText ?? '').length - (b.innerText ?? '').length)
            return hits[0]
          })()
          if (leaf === null) return false
          // ⚠️ 选择器里**必须**有 button：卡片头是 BUTTON.dk_settingsHead，漏了它就会点到
          // 外层 LI（不触发折叠）——Docker 卡片就是这样被漏掉的。
          const row = leaf.closest('button, [role=button], [role=option], [role=tab], li, [class*=row], [class*=item], [class*=card]') ?? leaf
          row.click()
          return true
        }
        const openSettings = () => clickExact('设置')
        const openPluginConfig = () => {
          const nav = [...document.querySelectorAll('[class*=navLabel]')].find((el) => (el.innerText ?? '').trim() === '插件')
          if (nav === undefined) return false
          nav.click()
          return true
        }
        const dialogText = () => {
          const dialog = document.querySelector('[role=dialog], [class*=settings]') ?? document.body
          return (dialog.innerText ?? '').replace(/\s+/g, ' ')
        }
        window.__dshUi = { exact, clickExact, clickStartsWith, findCard, openSettings, openPluginConfig, dialogText }
        return true
      })()`)

      const openSettings = async () => {
        await chrome.evaluate('window.__dshUi.openSettings()')
        await new Promise((resolve) => setTimeout(resolve, 1500))
        return await chrome.evaluate('window.__dshUi.openPluginConfig()')
      }
      const entered = await openSettings()
      await new Promise((resolve) => setTimeout(resolve, 1500))
      await chrome.evaluate("window.__dshUi.clickExact('插件配置')")
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // 每张卡片配一个**只可能属于它**的文案当哨兵：这样断言的是「这张卡自己渲染了」，
      // 而不是「整页某处有内容」（后者对每张卡都成立，等于没验）。
      const CARDS = [
        ['环境变量 / 密钥管理', '环境变量列表'],
        ['Prompt 管理', '导出全部 JSON'],
        ['MCP 服务器配置', '添加服务器'],
        ['Profile 管理', '新建 profile'],
        ['RSS / 新闻聚合', '订阅渠道'],
        ['Docker 容器面板', '允许变更操作'],
        ['Codegraph', 'Codegraph 控制台'],
        ['终端面板', 'SSH 连接簿'],
      ]
      // 先确认列表页把这些卡片都列出来了（漏卡片 = 目录回归）
      const listed = await chrome.evaluate(`(() => {
        const text = window.__dshUi.dialogText()
        return Object.fromEntries(${JSON.stringify(CARDS.map(([title]) => title))}.map((title) => [title, text.includes(title)]))
      })()`)
      const missing = CARDS.map(([title]) => title).filter((title) => listed[title] !== true)
      record(
        'UI7 插件配置页列出了全部 8 张插件卡片',
        entered === true && missing.length === 0,
        missing.length === 0 ? CARDS.map(([title]) => title).join(' / ') : `缺：${missing.join(', ')}`,
      )

      const beforeErrors = consoleErrors.length + exceptions.length
      for (const [title, marker] of CARDS) {
        const before = consoleErrors.length + exceptions.length
        // 每次先回到卡片列表，再进这一张（DOM 里同时只有一张卡，必须先回列表）
        await chrome.evaluate("window.__dshUi.clickExact('插件配置')")
        await new Promise((resolve) => setTimeout(resolve, 800))
        const clicked = await chrome.evaluate(`window.__dshUi.clickStartsWith(${JSON.stringify(title)})`)
        await new Promise((resolve) => setTimeout(resolve, 1800))
        const info = await chrome.evaluate(`(() => {
          const text = window.__dshUi.dialogText()
          const dialog = document.querySelector('[role=dialog], [class*=settings]') ?? document.body
          return {
            marker: text.includes(${JSON.stringify(marker)}),
            controls: dialog.querySelectorAll('button, input, select, textarea').length,
            length: text.length,
            tail: text.slice(0, 200),
          }
        })()`)
        const newErrors = consoleErrors.length + exceptions.length - before
        record(
          `UI8 卡片「${title}」：点进去后这张卡自己的内容渲染出来了（哨兵「${marker}」）且不报错`,
          clicked === true && info.marker === true && info.controls > 0 && newErrors === 0,
          `哨兵命中=${String(info.marker)} 控件 ${info.controls} 个 文本 ${info.length} 字符 本次新增错误 ${newErrors}`,
        )
        if (shotDir !== undefined) {
          mkdirSync(shotDir, { recursive: true })
          await chrome.screenshot(join(shotDir, `card-${title.replace(/[^\w\u4e00-\u9fa5]+/g, '_')}.png`))
        }
      }

      record(
        'UI9 逐个点开 8 张卡片的过程中没有新增控制台错误/异常',
        consoleErrors.length + exceptions.length === beforeErrors,
        `点开前 ${beforeErrors} 条 → 点开后 ${consoleErrors.length + exceptions.length} 条`,
      )

      /* ---------------- 侧边栏：全局搜索（search 的客户端半体） ---------------- */

      await chrome.evaluate("window.__dshUi.clickExact('关闭')")
      await new Promise((resolve) => setTimeout(resolve, 800))
      // 侧边栏那个不是按钮，而是 placeholder 为「全局搜索…」的输入框；
      // React 受控输入要用原型上的原生 setter + input 事件才能触发 onChange。
      const searchResult = await chrome.evaluate(`(async () => {
        // 侧边栏那个「全局搜索…」输入框是**打开命令面板的触发器**（点它才会出现 gs_palette），
        // 不是就地搜索框 —— 早先直接往里打字，什么都不会发生。
        const trigger = [...document.querySelectorAll('input')].find((el) => (el.placeholder ?? '').includes('全局搜索') && el.offsetParent !== null)
        if (trigger === undefined) return { found: false, stage: 'trigger' }
        trigger.click()
        await new Promise((resolve) => setTimeout(resolve, 1800))
        const paletteInput = document.querySelector('input.gs_input') ?? [...document.querySelectorAll('input')].find((el) => (el.placeholder ?? '').includes('搜索会话、设置与工具'))
        if (paletteInput === undefined) return { found: false, stage: 'palette' }
        paletteInput.focus()
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(paletteInput, 'Docker')
        paletteInput.dispatchEvent(new Event('input', { bubbles: true }))
        await new Promise((resolve) => setTimeout(resolve, 2500))
        const palette = document.querySelector('.gs_palette')
        const text = (palette?.innerText ?? '').replace(/\s+/g, ' ')
        return { found: true, stage: 'typed', text: text.slice(0, 300), hitDocker: text.includes('Docker') }
      })()`)
      record(
        'UI10 侧边栏「全局搜索」→ 命令面板：输入 Docker 后真的出结果（search 客户端半体 + /query 往返）',
        searchResult.found === true && searchResult.hitDocker === true,
        searchResult.found === false ? `没走到「${String(searchResult.stage)}」这一步` : `面板结果片段=${JSON.stringify(String(searchResult.text).slice(0, 180))}`,
      )
      if (shotDir !== undefined) await chrome.screenshot(join(shotDir, 'search-open.png'))

      /* ---------------- 侧边栏：终端面板（tty 的客户端半体 + WS + xterm） ---------------- */

      // 关掉搜索浮层再开终端
      await chrome.evaluate("window.__dshUi.clickExact('关闭') ?? document.body.click()")
      await new Promise((resolve) => setTimeout(resolve, 600))
      const terminalOpened = await chrome.evaluate(`(() => {
        const hits = [...document.querySelectorAll('*')].filter((el) => (el.innerText ?? '').trim() === '终端')
        if (hits.length === 0) return false
        const row = hits[hits.length - 1].closest('button, [role=button], li, [class*=nav]') ?? hits[hits.length - 1]
        row.click()
        return true
      })()`)
      await new Promise((resolve) => setTimeout(resolve, 4000))
      const terminalState = await chrome.evaluate(`(() => {
        const xterm = document.querySelector('.xterm')
        const screen = document.querySelector('.xterm-screen')
        const text = (document.querySelector('.xterm-rows')?.innerText ?? '').replace(/\\s+/g, ' ').trim()
        const textarea = document.querySelector('.xterm-helper-textarea')
        return { xterm: xterm !== null, screen: screen !== null, textarea: textarea !== null, text: text.slice(0, 200) }
      })()`)
      record(
        'UI11 侧边栏「终端」：xterm 在真浏览器里初始化完成',
        terminalOpened === true && terminalState.xterm && terminalState.textarea,
        `xterm=${String(terminalState.xterm)} screen=${String(terminalState.screen)} textarea=${String(terminalState.textarea)} 屏幕文本=${JSON.stringify(terminalState.text.slice(0, 80))}`,
      )
      if (shotDir !== undefined) await chrome.screenshot(join(shotDir, 'terminal.png'))
    }
  }
} catch (error) {
  // 别把异常吞进 finally 的 process.exit(0) 里
  crashed = error
  console.error(`崩溃：${String(error?.stack ?? error?.message ?? error)}`)
} finally {
  const failed = results.filter((item) => item.ok !== true)
  if (results.length > 0) {
    console.log(`\n# 汇总：PASS ${results.filter((r) => r.ok === true && r.warned !== true).length} / WARN ${results.filter((r) => r.warned === true).length} / FAIL ${failed.length}`)
  }
  if (reportPath !== undefined) {
    writeFileSync(reportPath, `${JSON.stringify({ baseUrl, mode, consoleErrors, exceptions, failedRequests, results }, null, 2)}\n`)
    console.log(`# 报告：${reportPath}`)
  }
  chrome.close()
  // Chrome 可能还在收尾写 profile：清理失败不该影响退出码
  try {
    rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3 })
  } catch {
    /* 临时目录交给系统回收 */
  }
  process.exit(crashed === undefined && failed.length === 0 ? 0 : 1)
}
