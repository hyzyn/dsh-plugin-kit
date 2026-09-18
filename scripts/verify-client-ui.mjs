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
 * 启动
 * ------------------------------------------------------------------ */

const chrome = await Chrome.launch({ path: chromePath, port: debugPort })
console.log(`# Chrome ${String(chrome.version.Browser)} / CDP :${String(chrome.port)}`)

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
    // 只把**插件自己**发起的失败请求算进门禁：宿主自身的接口（如 /api/changes.summary）在
    // 会话跨版本时会 404，那是环境噪音，不该让插件回归变红。
    const isPluginRequest = (url) => url.includes('/plugins/') || url.includes('/api/dsh-')
    const pluginFailures = failedRequests.filter((item) => isPluginRequest(item))
    const foreignFailures = failedRequests.filter((item) => !isPluginRequest(item))
    // 「Failed to load resource」这类控制台噪音不带 URL，只有在本轮确有插件请求失败时才算数
    const pluginConsoleErrors = consoleErrors.filter(
      (text) => !/Failed to load resource/.test(text) || pluginFailures.length > 0,
    )
    record(
      'UI5 加载期间控制台没有 error 级输出',
      pluginConsoleErrors.length === 0,
      pluginConsoleErrors.length === 0
        ? foreignFailures.length === 0
          ? '0 条'
          : `0 条插件相关（忽略宿主自身 ${String(foreignFailures.length)} 条失败请求）`
        : pluginConsoleErrors.slice(0, 5).join('\n      '),
    )
    if (pluginFailures.length > 0) {
      record('UI6 插件的子请求全部成功（无 4xx/5xx）', false, pluginFailures.slice(0, 6).join('\n      '))
    } else if (foreignFailures.length > 0) {
      warn('UI6 插件子请求全部成功；宿主自身有失败请求（与插件无关）', foreignFailures.slice(0, 6).join('\n      '))
    } else {
      record('UI6 所有子请求都成功（无 4xx/5xx）', true, '0 条失败请求')
    }

    if (mode === 'cards' || mode === 'full') {
      /* ---------------- 点击级：侧边栏「插件」→ 逐个配置页 ----------------
       * DSH ≥0.1.6-alpha.2 起，插件配置从「设置 → 插件 → 插件配置」搬到了侧边栏的「插件」页
       * （ui-plugin-manager）：每个插件是一条 bundle 行，该行注册了 plugins.row.config 之后
       * 才会出现「配置」入口（button[aria-label="配置 <行 id>"]）。断言链因此是：
       * 打开插件页 → 找到该插件 → 该行有配置入口 → 点进去 summary / page 两视图都渲染、
       * 有控件、不报错。缺任一环都说明注册 key 或两视图实现有问题。
       */

      // 页面里注入 DOM 助手：按精确文案点按钮 + 在插件页与插件详情之间来回。
      await chrome.evaluate(`(() => {
        const exact = (t) => [...document.querySelectorAll('*')].filter((el) => (el.innerText ?? '').trim() === t)
        const clickExact = (t) => { const el = exact(t).pop(); if (el === undefined) return false; el.click(); return true }
        const clickText = (t) => {
          const h = [...document.querySelectorAll('button')].filter((el) => (el.innerText ?? '').trim() === t)
          if (h.length === 0) return false
          h[h.length - 1].click()
          return true
        }
        const dialogText = () => {
          const dialog = document.querySelector('[role=dialog], [class*=settings]') ?? document.body
          return (dialog.innerText ?? '').replace(/\\s+/g, ' ')
        }
        const onList = () => (document.body.innerText ?? '').includes('添加插件')
        const back = () => {
          // 面包屑：列表页那层 aria-label 是「返回插件列表」，行详情那层是「返回 <包短名>」，
          // 唯一稳定的是 class 里的 crumb。两者都要认，否则会卡在行详情里出不去。
          const b = document.querySelector('button[class*="crumb"]')
            ?? [...document.querySelectorAll('button')].find((el) => (el.getAttribute('aria-label') ?? '').startsWith('返回'))
          if (b === undefined || b === null) return false
          b.click()
          return true
        }
        window.__dshUi = {
          exact, clickExact, clickText, dialogText, onList, back,
          /** 已安装列表里的插件行 = 文本恰好是该插件短名的按钮。 */
          openPlugin: async (id) => {
            // 行详情（data-plugin-row-detail）→ 包页（data-plugin-detail）→ 列表：面包屑每层都叫
            // 「返回插件列表」，所以要退到**两个详情标记都不在**为止，否则下一轮 clickText 找不到目标。
            for (let i = 0; i < 4; i += 1) {
              if (document.querySelector('[data-plugin-detail], [data-plugin-row-detail]') === null) break
              back()
              await new Promise((r) => setTimeout(r, 800))
            }
            if (!clickText(id)) return false
            await new Promise((r) => setTimeout(r, 2200))
            return true
          },
          /** 点开该 bundle 下第一个有配置入口的行；返回它的 aria-label。 */
          openRow: () => {
            const b = document.querySelector('[aria-label^="配置 "]')
            if (b === null) return null
            const label = b.getAttribute('aria-label')
            b.click()
            return label
          },
          rowDetailKey: () => document.querySelector('[data-plugin-row-detail]')?.getAttribute('data-plugin-row-detail') ?? null,
          pageStats: () => {
            const root = document.querySelector('[data-plugin-row-detail]') ?? document.body
            return { textLength: (root.innerText ?? '').length, controls: root.querySelectorAll('input, select, textarea, button').length }
          },
        }
        return true
      })()`)

      const onPlugins = await chrome.evaluate(`(async () => {
        for (let i = 0; i < 4; i += 1) {
          if (window.__dshUi.onList()) return true
          window.__dshUi.clickText('插件')
          await new Promise((r) => setTimeout(r, 2200))
        }
        return window.__dshUi.onList()
      })()`)
      record(
        'UI7 侧边栏「插件」页可打开（DSH ≥0.1.6 的新版插件管理页）',
        onPlugins === true,
        onPlugins === true ? '已进入插件页' : '打不开插件页',
      )

      // 插件短名 → 该 bundle 行的 plugins.row.config key（= `<bundle 包名>#<行 id>`）
      const PLUGIN_ROWS = [
        ['codegraph', '@hyzyn/dsh-codegraph#codegraph'],
        ['docker', '@hyzyn/dsh-docker#docker'],
        ['env', '@hyzyn/dsh-env#env-manager'],
        ['mcp', '@hyzyn/dsh-mcp#mcp-config'],
        ['profile', '@hyzyn/dsh-profile#profile-manager'],
        ['prompt', '@hyzyn/dsh-prompt#prompt-manager'],
        ['rss', '@hyzyn/dsh-rss#rss-digest'],
        ['tty', '@hyzyn/dsh-tty#tty'],
      ]
      const beforeErrors = consoleErrors.length + exceptions.length
      let configured = 0
      for (const [id, expectedKey] of PLUGIN_ROWS) {
        const before = consoleErrors.length + exceptions.length
        const opened = await chrome.evaluate(`window.__dshUi.openPlugin(${JSON.stringify(id)})`)
        if (opened !== true) {
          record(`UI8 插件「${id}」：配置页可达、两视图渲染且有控件、不报错`, false, '详情页打不开')
          continue
        }
        const label = await chrome.evaluate('window.__dshUi.openRow()')
        await new Promise((resolve) => setTimeout(resolve, 2200))
        const stats = await chrome.evaluate('window.__dshUi.pageStats()')
        const key = await chrome.evaluate('window.__dshUi.rowDetailKey()')
        const newErrors = consoleErrors.length + exceptions.length - before
        const ok = label !== null && key === expectedKey && stats.textLength > 40 && stats.controls > 0 && newErrors === 0
        if (ok) configured += 1
        record(
          `UI8 插件「${id}」：配置页可达、两视图渲染且有控件、不报错`,
          ok,
          `入口=${String(label)} 行 key=${String(key)}（期望 ${expectedKey}）控件 ${String(stats.controls)} 个 文本 ${String(stats.textLength)} 字符 本次新增错误 ${String(newErrors)}`,
        )
        if (shotDir !== undefined && ok) {
          mkdirSync(shotDir, { recursive: true })
          await chrome.screenshot(join(shotDir, `plugin-${id}.png`))
        }
      }
      record(
        'UI9 全部 8 个插件都拿到了配置入口（plugins.row.config 注册生效）',
        configured === PLUGIN_ROWS.length,
        `${String(configured)}/${String(PLUGIN_ROWS.length)} 个配置页可用；整轮新增错误 ${String(consoleErrors.length + exceptions.length - beforeErrors)} 条`,
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

      /* ---------------- 设置里的一行「插件配置」（@hyzyn/dsh-kit-settings） ---------------- */

      const kitRow = await chrome.evaluate(`(async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
        const dialog = () => document.querySelector('[role=dialog]')
        const readNav = () => [...(dialog() ?? document.body).querySelectorAll('[class*=navLabel]')]
          .map((el) => (el.innerText ?? '').trim())
          .filter(Boolean)
        const waitForSettings = async () => {
          for (let i = 0; i < 12; i += 1) {
            if (dialog() !== null && readNav().length > 0) return true
            await sleep(400)
          }
          return false
        }
        // ⚠️ 设置按钮是**开关式**的：只点一次再等，反复点会把自己点关（踩过）。
        window.__dshUi.clickText('设置')
        let ready = await waitForSettings()
        if (!ready) {
          window.__dshUi.clickText('设置')
          ready = await waitForSettings()
        }
        const panel = dialog()
        const nav = readNav()
        const clicked = window.__dshUi.clickText('插件配置')
        await sleep(1800)
        const heads = [...(dialog() ?? document.body).querySelectorAll('li button')]
          .map((el) => (el.innerText ?? '').replace(/\\s+/g, ' ').trim())
          .filter(Boolean)
        window.__dshUi.clickText('关闭')
        return { opened: panel !== null, nav, clicked, heads }
      })()`)
      record(
        'UI12 设置里有与「通用设置」平级的「插件配置」行，并列出 kit 插件卡片',
        kitRow.opened === true && kitRow.nav.includes('插件配置') && kitRow.clicked === true && kitRow.heads.length >= 8,
        `弹窗=${String(kitRow.opened)} 导航=${JSON.stringify(kitRow.nav)} 卡片 ${String(kitRow.heads.length)} 张：${kitRow.heads.map((h) => h.slice(0, 12)).join(' / ')}`,
      )
      if (shotDir !== undefined) await chrome.screenshot(join(shotDir, 'kit-settings-row.png'))
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
  process.exit(crashed === undefined && failed.length === 0 ? 0 : 1)
}
