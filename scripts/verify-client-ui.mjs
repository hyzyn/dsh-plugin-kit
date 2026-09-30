/**
 * 客户端半体（浏览器 UI）验证：用**已装的 Chrome + CDP** 驱动，零新增依赖。
 *
 * > ✅ **2026-09-30 已按当前宿主形状修好**（当日「分诊 → 复跑 → 修复」，`--mode full` 实测
 * > **18 PASS / 1 WARN / 0 FAIL**）。断言链的四处旧口径换成了 DOM dump 出来的新形状：
 * >   ① 行按**短名或全包名**（`@hyzyn/dsh-<id>`）找——行文案现在是 `@hyzyn/dsh-codegraph`；
 * >   ② 配置卡片认**内联**的 `[data-plugin-config="true"]`（包详情页内），不再找早已消失的
 * >      `button[aria-label="配置 <行 id>"]` 与 `[data-plugin-row-detail]`；控件数 / 文本长度
 * >      两个下限**沿用原来的 `> 0` / `> 40`**（实测最小是 prompt：5 控件 / 64 字符）；
 * >   ③ 行注册改用 `[data-plugin-row="include:<行 id>"]` 核（8/8 命中）；
 * >   ④ 侧边栏项同时认 `<button>` 与 `[role=button]`（「终端」现在是后者）；
 * >   ⑤ UI12 不再假设设置面板是文档里第一个 `[role=dialog]`（引导弹窗会抢），并在开设置前
 * >      关掉「添加一个 API Key」引导弹窗。
 * > UI11 现在是 **WARN 而不是 FAIL**：沙箱里 `posix_openpt` 被拒（见
 * > [docs/agent-real-test.md § 三条硬约束 ②](../docs/agent-real-test.md)），而 xterm 本身已初始化
 * > ——环境限制不该记成代码回归，原文照抄进详情。
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
 *
 * 受限环境（文件沙箱 / CI 容器）加 `--chrome-arg --no-sandbox`，否则 Chrome 起不来、
 * `Runtime.enable` 只会报超时。
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
/**
 * 额外传给 Chrome 的参数（可重复）。
 *
 * 为什么需要：受限环境（DSH 文件沙箱、多数 CI 容器）里 Chrome **自己的** sandbox 起不来，
 * 必须 `--no-sandbox` 才连得上 CDP——否则 `Runtime.enable` 会一直挂到 30s 超时，
 * 而报错只说「超时」，完全指不到「是 sandbox 起不来」。
 * 刻意**不做成默认**：那会削弱所有调用方的浏览器隔离；需要的人显式传。
 */
const chromeArgs = []
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--chrome-arg' && argv[i + 1] !== undefined) chromeArgs.push(argv[i + 1])
}

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

const chrome = await Chrome.launch({ path: chromePath, port: debugPort, extraArgs: chromeArgs })
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
      /* ---------------- 点击级：侧边栏「插件」→ 逐个插件卡片 ----------------
       * DSH ≥0.1.6-alpha.2 起，插件配置从「设置 → 插件 → 插件配置」搬到了侧边栏的「插件」页
       * （ui-plugin-manager）：每个插件是一条 bundle 行。
       *
       * ⚠️ 2026-09-30 起断言链按**当前**宿主形状（DSH 0.2.0-rc.2，DOM dump 实测 8/8）重写：
       *   · 行文案是**全包名**（`@hyzyn/dsh-codegraph`），不再是插件短名；
       *   · 配置卡片由 `plugins.bundle.config` **内联渲染在包详情页**（`[data-plugin-config="true"]`）——
       *     旧的 `button[aria-label="配置 <行 id>"]` 与 `[data-plugin-row-detail]` 两级入口**已不存在**；
       *   · 该 bundle 注册的每一行以 `[data-plugin-row="include:<行 id>"]` 标在详情页上。
       * 断言链因此是：打开插件页 → 按（短名或全包名）进包详情页 → 内联卡片有控件且有文本
       * → 期望的行标记在 → 本轮无新增错误。这是**跟着界面改判据**，不是放宽：控件数与文本长度
       * 两个下限沿用原来的 `> 0` / `> 40`（实测最小值 prompt 也有 5 控件 / 64 字符）。
       */

      // 页面里注入 DOM 助手：按精确文案点按钮 + 在插件列表 / 包详情之间来回。
      await chrome.evaluate(`(() => {
        const exact = (t) => [...document.querySelectorAll('*')].filter((el) => (el.innerText ?? '').trim() === t)
        const clickExact = (t) => { const el = exact(t).pop(); if (el === undefined) return false; el.click(); return true }
        /**
         * 按精确文案点一个**可点元素**。
         *
         * 候选同时收 <button> 与 [role=button]：这一版宿主的侧边栏项（例：「终端」）是
         * div[role=button]，只查 <button> 永远点不到它（2026-09-30 实测：exact-text 候选 =
         * DIV[role=button] + SPAN，button 元素数 0 —— UI11 就是这么恒红的）。
         */
        const clickText = (t) => {
          const h = [...document.querySelectorAll('button, [role=button]')].filter((el) => (el.innerText ?? '').trim() === t)
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
          // 面包屑：列表页那层 aria-label 是「返回插件列表」，详情页那层是「返回 <包短名>」，
          // 唯一稳定的是 class 里的 crumb。两者都要认，否则会卡在详情里出不去。
          const b = document.querySelector('button[class*="crumb"]')
            ?? [...document.querySelectorAll('button')].find((el) => (el.getAttribute('aria-label') ?? '').startsWith('返回'))
          if (b === undefined || b === null) return false
          b.click()
          return true
        }
        window.__dshUi = {
          exact, clickExact, clickText, dialogText, onList, back,
          /**
           * 从已安装列表打开某个插件的**包详情页**。
           *
           * 行文案是全包名，所以短名与 @hyzyn/dsh-&lt;短名&gt; 都试。
           * @returns { opened, by }：by 是实际点中的行文案（写进断言详情，便于排查）。
           */
          openPlugin: async (id) => {
            for (let i = 0; i < 4; i += 1) {
              if (document.querySelector('[data-plugin-detail]') === null) break
              back()
              await new Promise((r) => setTimeout(r, 900))
            }
            const names = [id, '@hyzyn/dsh-' + id]
            const hits = [...document.querySelectorAll('button, [role=button]')].filter((el) => names.includes((el.innerText ?? '').trim()))
            if (hits.length === 0) return { opened: false, by: null }
            const by = (hits[hits.length - 1].innerText ?? '').trim()
            hits[hits.length - 1].click()
            await new Promise((r) => setTimeout(r, 2500))
            return { opened: true, by }
          },
          /** 包详情页上的**内联配置卡片**与行标记（当前宿主形状，见上面的注释）。 */
          readBundleConfig: () => {
            const cfg = document.querySelector('[data-plugin-config="true"]')
            return {
              hasDetail: document.querySelector('[data-plugin-detail]') !== null,
              hasConfig: cfg !== null,
              controls: cfg === null ? 0 : cfg.querySelectorAll('input, select, textarea, button').length,
              textLength: cfg === null ? 0 : (cfg.innerText ?? '').length,
              rowMarks: [...document.querySelectorAll('[data-plugin-row]')].map((el) => el.getAttribute('data-plugin-row')),
            }
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
        if (opened?.opened !== true) {
          record(
            `UI8 插件「${id}」：包详情页可达、内联配置卡片渲染且有控件、本行注册生效、不报错`,
            false,
            '已安装列表里找不到该插件的行（短名与全包名都试过）',
          )
          continue
        }
        const view = await chrome.evaluate('window.__dshUi.readBundleConfig()')
        // 行 id 沿用既有映射（`<bundle>#<行 id>`），详情页上的 `[data-plugin-row="include:<行 id>"]` 是它的现算标记
        const rowId = expectedKey.split('#')[1]
        const wantMark = `include:${rowId}`
        const newErrors = consoleErrors.length + exceptions.length - before
        const ok =
          view.hasDetail === true &&
          view.hasConfig === true &&
          view.controls > 0 &&
          view.textLength > 40 &&
          view.rowMarks.includes(wantMark) &&
          newErrors === 0
        if (ok) configured += 1
        record(
          `UI8 插件「${id}」：包详情页可达、内联配置卡片渲染且有控件、本行注册生效、不报错`,
          ok,
          `入口=${String(opened.by)} 内联卡片=${String(view.hasConfig)} 控件 ${String(view.controls)} 个 文本 ${String(view.textLength)} 字符 行标记 ${wantMark}=${String(view.rowMarks.includes(wantMark))}（实际 ${JSON.stringify(view.rowMarks)}）本次新增错误 ${String(newErrors)}`,
        )
        if (shotDir !== undefined && ok) {
          mkdirSync(shotDir, { recursive: true })
          await chrome.screenshot(join(shotDir, `plugin-${id}.png`))
        }
      }
      record(
        'UI9 全部 8 个插件的内联配置卡片都渲染出来了（plugins.bundle.config 注册生效 + 行标记都在）',
        configured === PLUGIN_ROWS.length,
        `${String(configured)}/${String(PLUGIN_ROWS.length)} 个配置卡片可用；整轮新增错误 ${String(consoleErrors.length + exceptions.length - beforeErrors)} 条`,
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
        // 侧边栏项是 div[role=button]（不是 <button>），closest 必须认 role
        const row = hits[hits.length - 1].closest('button, [role=button], li, [class*=nav]') ?? hits[hits.length - 1]
        row.click()
        return true
      })()`)
      /*
       * 轮询等 xterm 挂上来，而不是固定 sleep：这一版宿主先建标签页、再连 PTY，慢机器上 4s 不够
       * （2026-09-30 实测：等 9s 时 `.xterm` / `.xterm-screen` / `.xterm-helper-textarea` 全部就位）。
       */
      let terminalState = {}
      for (let i = 0; i < 12; i += 1) {
        terminalState = await chrome.evaluate(`(() => {
          const xterm = document.querySelector('.xterm')
          const text = (document.querySelector('.xterm-rows')?.innerText ?? '').replace(/\\s+/g, ' ').trim()
          return {
            xterm: xterm !== null,
            screen: document.querySelector('.xterm-screen') !== null,
            textarea: document.querySelector('.xterm-helper-textarea') !== null,
            text: text.slice(0, 200),
            // 面板自己的正文（div.tt_term 就是终端区）：PTY 被拒时错误原文在这里，而不是在 xterm 里
            panelText: (document.querySelector('.tt_term')?.innerText ?? '').replace(/\\s+/g, ' ').trim().slice(0, 200),
          }
        })()`)
        if (terminalState.xterm === true && terminalState.textarea === true) break
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
      /*
       * 沙箱里 `posix_openpt` 会被拒（见 docs/agent-real-test.md「三条硬约束 ②」），此时**前端仍然
       * 正常**：xterm 挂上来了、面板把错误原文显示给用户。这种「环境限制」记 WARN 而不是 FAIL,
       * 也不假装通过——原文照抄进详情，免得下次有人以为终端功能坏了。
       */
      const ptyBlocked = /posix_openpt|Operation not permitted/.test(terminalState.panelText ?? '')
      if (terminalOpened === true && terminalState.xterm === true && terminalState.textarea === true && ptyBlocked) {
        warn(
          'UI11 侧边栏「终端」：xterm 已初始化；PTY 被环境拒绝（沙箱限制，不是回归）',
          `xterm=${String(terminalState.xterm)} textarea=${String(terminalState.textarea)} 面板原文=${JSON.stringify(terminalState.panelText)}`,
        )
      } else {
        record(
          'UI11 侧边栏「终端」：xterm 在真浏览器里初始化完成',
          terminalOpened === true && terminalState.xterm === true && terminalState.textarea === true,
          `xterm=${String(terminalState.xterm)} screen=${String(terminalState.screen)} textarea=${String(terminalState.textarea)} 屏幕文本=${JSON.stringify(String(terminalState.text).slice(0, 80))} 面板文本=${JSON.stringify(String(terminalState.panelText).slice(0, 80))}`,
        )
      }
      if (shotDir !== undefined) await chrome.screenshot(join(shotDir, 'terminal.png'))

      /* ---------------- 设置里的一行「插件配置」（@hyzyn/dsh-kit-settings） ---------------- */

      /*
       * 先把「添加一个 API Key」引导弹窗关掉。
       *
       * 为什么要这一步：全新 profile（没有凭据）会弹这个引导，它**自己就是** `[role=dialog]`；
       * 不关它时 `document.querySelector('[role=dialog]')` 拿到的是它、不是设置弹窗 → 导航读成
       * `[]`、卡片数 0（2026-09-30 实测：那时弹窗里的按钮只有「稍后配置 / 保存并继续」）。
       * 关掉之后实测导航 5 项（含「插件配置」）、`li button` 卡片 8 张——就是这条断言要的数字。
       */
      await chrome.evaluate("window.__dshUi.clickText('稍后配置') || window.__dshUi.clickText('关闭')")
      await new Promise((resolve) => setTimeout(resolve, 1500))

      const kitRow = await chrome.evaluate(`(async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
        /**
         * 设置面板的定位方式**不能**假设它是文档里第一个 [role=dialog]（引导弹窗、搜索结果浮层
         * 都可能是 dialog）。改为：导航标签（[class*=navLabel]，设置面板专有）→ 它所在的
         * panel / dialog 容器。实测该类名链是
         * SPAN.navLabel → BUTTON.navCell → DIV.navList → NAV.nav → DIV.panel。
         */
        const readNav = () => [...document.querySelectorAll('[class*=navLabel]')]
          .map((el) => (el.innerText ?? '').trim())
          .filter(Boolean)
        const settingsRoot = () => {
          const label = [...document.querySelectorAll('[class*=navLabel]')].find((el) => (el.innerText ?? '').trim() === '插件配置')
          return label?.closest('[class*=panel], [role=dialog], [class*=overlay]') ?? document.querySelector('[role=dialog]') ?? document.body
        }
        const waitForSettings = async () => {
          for (let i = 0; i < 12; i += 1) {
            if (readNav().length > 0) return true
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
        const nav = readNav()
        const clicked = window.__dshUi.clickText('插件配置')
        await sleep(1800)
        const heads = [...settingsRoot().querySelectorAll('li button')]
          .map((el) => (el.innerText ?? '').replace(/\\s+/g, ' ').trim())
          .filter(Boolean)
        window.__dshUi.clickText('关闭')
        return { opened: readNav().length > 0, nav, clicked, heads }
      })()`)
      record(
        'UI12 设置里有与「通用设置」平级的「插件配置」行，并列出 kit 插件卡片',
        kitRow.opened === true && kitRow.nav.includes('插件配置') && kitRow.clicked === true && kitRow.heads.length >= 8,
        `设置面板=${String(kitRow.opened)} 导航=${JSON.stringify(kitRow.nav)} 卡片 ${String(kitRow.heads.length)} 张：${kitRow.heads.map((h) => h.slice(0, 12)).join(' / ')}`,
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
