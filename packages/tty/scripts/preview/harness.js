/* eslint-disable */
/**
 * dsh-tty 预览夹具：加载 client.js → 以假 ctx 挂载 → 按 ?scenario= 驱动界面到
 * 指定状态，供 scripts/preview.mjs 截图。仅供开发走查，不随 npm 包发布。
 */
(function () {
  'use strict'

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const waitFor = async (fn, timeout = 3000) => {
    const start = Date.now()
    for (;;) {
      let value
      try {
        value = fn()
      } catch {
        value = null
      }
      if (value) return value
      if (Date.now() - start > timeout) throw new Error('waitFor timeout')
      await sleep(25)
    }
  }
  const q = (sel) => document.querySelector(sel)
  const qa = (sel) => [...document.querySelectorAll(sel)]

  /*
   * 预览语言：`?locale=en`（或 CDP 注入 `window.__previewLocale = 'en'`）预览英文界面，
   * 默认 zh。与 search 的 mock-host / codegraph 的 preview-card 同一个开关形状
   * （见 docs/i18n.md § 预览与 smoke 夹具）。夹具**提供**了 locale 服务，就必须能选语言，
   * 否则它验的是一条不存在的路（「老宿主没有 locale 服务」那条路由中文兜底覆盖）。
   */
  try {
    const wanted = new URLSearchParams(location.search).get('locale')
    if (wanted === 'en' || wanted === 'zh') window.__previewLocale = wanted
  } catch {
    /* file:// 下 location.search 可能不可用 */
  }

  /*
   * 按**界面文案**找元素：文案已经进目录（i18n），所以定位串必须**双语共存**——只认中文
   * 会把英文界面下的走查挡在门外（同 search 的 `titles: ['通用设置', 'General']`）。
   * 三个谓词都收「任一语言」，断言的失败信息仍是中文（开发者看的）。
   */
  const says = (el, ...names) => names.some((name) => (el.textContent || '').includes(name))
  const saysExact = (el, ...names) => names.some((name) => (el.textContent || '').trim() === name)
  const attributeSays = (el, attr, ...names) => names.some((name) => (el.getAttribute(attr) || '') === name)
  const findByAria = (root, ...names) => [...root.querySelectorAll('[aria-label]')].find((el) => attributeSays(el, 'aria-label', ...names))

  /* ---------- 挂载插件 ---------- */
  // 场景之间共用同一个页面 target，必须先清掉上一个场景的标签持久化
  try {
    sessionStorage.clear()
    localStorage.clear()
  } catch {
    /* file:// 下存储可能不可用 */
  }
  const mod = window.__ttyModule
  if (!mod) throw new Error('client.js 未注册到 __ModuleLoader__')
  const requireShim = (name) => {
    if (name === 'react') return window.React
    if (name === 'react/jsx-runtime') return window.__jsxRuntime
    // dsh-docker 的客户端用 createRoot 挂面板（React 18 的 react-dom/client 入口）
    if (name === 'react-dom') return window.ReactDOM
    if (name === 'react-dom/client') return { createRoot: window.ReactDOM.createRoot, hydrateRoot: window.ReactDOM.hydrateRoot }
    throw new Error('预览夹具未提供模块：' + name)
  }
  const exports = mod.factory(requireShim)
  const cards = []
  /** 客户端服务表：tty 提供 ttyConnbar，夹具里也允许注册消费方（见 connbarActions）。 */
  const services = new Map()
  const ctx = {
    sessions: {
      list: {
        // 按**真实宿主**的形状桩（DSH 0.1.6）：会话列表快照没有 current，选中项靠
        // retainedBy.mainView 表达——夹具要是照旧塞个 current，就又把新读法的 bug 遮住了
        getSnapshot: () => ({
          ids: ['s1'],
          byId: { s1: { id: 's1', cwd: window.__PREVIEW_CWD || '/home/user/project', retainedBy: { mainView: 1 } } },
          phase: 'ready',
          subagentsByParent: {},
          jobsBySession: {},
        }),
      },
    },
    slots: {
      inject: (_name, cb) => cb(),
      register: (spec, Component) => {
        cards.push({ spec, Component })
        return () => {}
      },
    },
    // cordis 服务面（tty 客户端 0.13.0 起用 ctx.provide 暴露连接栏注册点）
    provide: (name, value) => {
      services.set(name, value)
      return () => services.delete(name)
    },
    get: (name) => services.get(name),
    inject: (names, cb) => {
      // 与真实 cordis 一致：依赖里有任何一个服务不存在时**不触发**回调，而不是塞一堆
      // undefined 进去。塞 undefined 的后果是消费方（如 dsh-docker 的 sidebarRight 那一支）
      // 在回调里直接 `scope.foo.register` 炸掉——一个可选依赖就能让整个预览场景全挂。
      if (names.some((name) => !services.has(name))) return () => {}
      const scope = {}
      for (const name of names) scope[name] = services.get(name)
      cb(scope)
      return () => {}
    },
    effect: (cb) => {
      const dispose = cb()
      return () => {
        if (typeof dispose === 'function') dispose()
      }
    },
    reflect: {
      provide: (name, value) => {
        services.set(name, value)
        return () => services.delete(name)
      },
    },
  }
  // 宿主会话服务也进服务表：docker 那一半是经 ctx.inject(['sessions']) 取的（夹具里
  // ctx.sessions 是直接属性、不走服务表，这里补一份，免得那条 inject 永远等不到依赖）
  services.set('sessions', ctx.sessions)

  /*
   * 假 locale 服务（`@deepseek-ai/dsh-client-locale`）：插件经 `ctx.inject(['locale'], cb)`
   * **动态**取它，所以服务表里没有它时 callback 不触发、`t` 保持中文兜底（= 老宿主那条路）。
   * 桩的形状与 search 的 mock-host 一致：`register(ns, locale, dict)` + `bind(ns)`，
   * 词条按 `window.__previewLocale` 选语言。
   */
  const localeDicts = new Map()
  const localeStub = {
    register: (ns, locale, dict) => {
      const entry = localeDicts.get(ns) || {}
      entry[locale] = dict
      localeDicts.set(ns, entry)
      return () => {}
    },
    bind: (ns) => (key, params) => {
      const active = window.__previewLocale === 'en' ? 'en' : 'zh'
      const dict = localeDicts.get(ns) || {}
      const text = (dict[active] || {})[key] || key
      if (params === undefined) return text
      return String(text).replace(/\{(\w+)\}/g, (_match, name) => (params[name] === undefined ? '' : String(params[name])))
    },
  }
  services.set('locale', localeStub)
  exports.apply(ctx)

  /**
   * docker 插件（可选）：与 tty 共用同一个 ctx——tty 已经 ctx.provide 了 ttyConnbar /
   * ttyTerminal，所以 docker 的 ctx.inject 能拿到真实服务。这就是「ttyTerminal.mount
   * 就地嵌入」的端到端联调场景（不是靠 mock 服务自欺）。
   */
  const dockerModule = window.__modules.get('@hyzyn/dsh-docker')
  if (dockerModule) {
    const dockerExports = dockerModule.factory(requireShim)
    dockerExports.apply(ctx)
  }

  /* ---------- 交互助手 ---------- */
  const entry = () => q('[data-dsh-tty-entry]')
  const modal = () => q('.tt_modal')
  const tabs = () => qa('.tt_tab')
  const activeTabEl = () => q('.tt_tab[data-active]')
  const sidOf = (el) => el && el.dataset ? el.dataset.sid : undefined
  const socket = () => window.__mockSockets[window.__mockSockets.length - 1]
  /*
   * 「面板被最小化了」的判据。
   *
   * ⚠️ 不能看 `.tt_modal`：`data-minimized` 是设在 **`.tt_modalBackdrop`** 上的（CSS 规则
   * `.tt_modalBackdrop[data-minimized]` 也是那一条），`.tt_modal` 只是它的子元素。
   * 早先两个场景（tab-list / tty-assist）都写的 `q('.tt_modal') === null`——最小化**不移除**
   * DOM，于是那两条「Esc 不许把面板最小化」的断言**永远不会触发**：空断言。
   * 这条是被「反证第 E 条一直不红」当场抓出来的，别再退回去。
   */
  const isMinimized = () => {
    const backdrop = q('.tt_modalBackdrop')
    return backdrop === null || backdrop.hasAttribute('data-minimized')
  }
  const emit = (msg) => {
    const s = socket()
    if (s) s._deliver(msg)
  }
  /**
   * 造一帧 `sessions`（宿主视角的会话表）——给需要**逐帧改变**清单的场景用（#7④：先有这条
   * agent 会话、下一帧它出表）。基准表来自 mock 宿主自己的会话表（`__mockSessionList`），
   * 不要在场景里拿客户端标签推算：那等于用被测对象造夹具。
   */
  const sessionList = (extra = []) => window.__mockSessionList().concat(extra)

  const openPanel = async () => {
    await waitFor(() => entry())
    entry().click()
    await waitFor(() => modal())
    await waitFor(() => tabs().length > 0, 4000)
    await sleep(120)
  }
  const clickAdd = async () => {
    q('.tt_tabAdd').click()
    await waitFor(() => q('.tt_addMenu'))
    await sleep(80)
  }
  // 菜单项按**双语**匹配（文案已进目录，见上面的 says）
  const clickMenuItem = async (...labels) => {
    const item = await waitFor(() => qa('.tt_addMenuItem').find((el) => says(el, ...labels)))
    item.click()
    await sleep(200)
    return item
  }
  /** SFTP 落点断言：卡片在挂载位里（docked）还是退回了居中对话框（modal）。 */
  const sftpSurfaceAssert = () => ({
    docked: q('.tt_dockPaneBody > .tt_sftpCard') !== null || q('.tt_dockPaneBody > .tt_sftpDualCard') !== null,
    modal: q('.tt_sshBackdrop > .tt_sftpCard') !== null || q('.tt_sshBackdrop > .tt_sftpDualCard') !== null,
    cardTitleRowHidden: (() => {
      const row = q('.tt_dockPaneBody .tt_sftpTitleRow')
      return row === null ? null : getComputedStyle(row).display
    })(),
    rows: qa('.tt_sftpRow').length,
    termWidth: Math.round((q('.tt_body') || { getBoundingClientRect: () => ({ width: 0 }) }).getBoundingClientRect().width),
    // 卡片必须完整落在挂载位里（border-box 回归）：右边/底边不溢出，工具栏最右按钮不被裁
    fitsDock: (() => {
      const body = q('.tt_dockPaneBody')
      if (body === null) return null
      const card = q('.tt_dockPaneBody > .tt_sftpCard, .tt_dockPaneBody > .tt_sftpDualCard')
      if (card === null) return null
      const b = body.getBoundingClientRect()
      const c = card.getBoundingClientRect()
      const bar = q('.tt_dockPaneBody .tt_sftpBar')
      return {
        overflowRight: Math.round(c.right - b.right),
        overflowBottom: Math.round(c.bottom - b.bottom),
        actionsFit: bar === null ? null : Math.round(bar.getBoundingClientRect().right) <= Math.round(b.right),
      }
    })(),
  })

  /** 终端里最后一行非空文本（xterm 会把光标所在行渲染成空 div）。 */
  const lastTermRowText = () => {
    const rows = qa('.tt_term .xterm-rows > div')
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      const text = rows[i].textContent.trim()
      if (text !== '') return text
    }
    return null
  }

  /** 终端里第一行非空文本（判断视口有没有跳）。 */
  const firstTermRowText = () => {
    const rows = qa('.tt_term .xterm-rows > div')
    for (let i = 0; i < rows.length; i += 1) {
      const text = rows[i].textContent.trim()
      if (text !== '') return text
    }
    return null
  }

  const feed = (text) => {
    const el = activeTabEl()
    if (el) emit({ t: 'data', sid: sidOf(el), d: text })
  }

  const SCENARIOS = {
    /* 单标签本地终端（含服务器状态条：订阅链路必须真的建立起来） */
    async local() {
      await openPanel()
      await waitFor(() => q('.tt_statsBar') !== null)
      // 状态条要等 1s 内的 stats 帧才显示；这里等到它带着内容出现
      await waitFor(() => {
        const bar = q('.tt_statsBar')
        return bar !== null && bar.hidden !== true && /CPU/.test(bar.textContent)
      }, 4000)
      await sleep(200)
      window.__previewAssert = async () => {
        const bar = q('.tt_statsBar')
        if (bar === null) return '状态条 DOM 缺失'
        if (bar.hidden === true) return '状态条未显示（stats 订阅链路可能断开）'
        const text = bar.textContent
        if (!/CPU/.test(text) || !/(内存|Memory)/.test(text) || !/(网络|Network)/.test(text)) return '状态条内容不完整：' + text
        /*
         * 订阅时序：客户端**故意**在 spawn 之前就发一次 statsOn（switchTab 早于 spawnTab），
         * 宿主此时还没登记这个 sid，会按「未知 sid」忽略——这是设计里的正常现象，所以
         * 断言不能要求「从没发过未知订阅」。要钉的是 ready 之后**重新对齐**过：最后一次
         * 订阅必须被接受（否则状态条该出不来），且早期那次不该被重复轰炸。
         */
        const logged = window.__mockLog || []
        const subscriptions = logged.filter((entry) => entry === 'in:statsOn' || entry === 'in:statsOn(unknown)')
        if (subscriptions[subscriptions.length - 1] === 'in:statsOn(unknown)') return '最后一次 statsOn 仍被宿主按未知 sid 忽略（ready 后没有重新对齐）'
        const ignored = logged.filter((entry) => entry === 'in:statsOn(unknown)').length
        if (ignored > 1) return 'spawn 前的 statsOn 重复发送（' + String(ignored) + ' 次未对齐订阅）'
        return null
      }
    },
    /* 服务器状态条关闭（statsEnabled=false）：整条收起，WS 也不该收到订阅 */
    async 'stats-off'() {
      // 必须在开面板（拉配置）之前改：客户端按 config 决定订阅与显隐
      window.__PREVIEW_CONFIG.statsEnabled = false
      await openPanel()
      await waitFor(() => tabs().length === 1)
      await sleep(400)
      window.__previewAssert = async () => {
        const bar = q('.tt_statsBar')
        if (bar === null) return '服务器状态条 DOM 缺失'
        if (bar.hidden !== true) return 'statsEnabled=false 时状态条仍然可见'
        // 隐藏必须是「真的不占位」：author 的 display:flex 会压过 UA 的
        // [hidden]{display:none}，一旦仍占 24px 就会盖住终端第一行（界面变形）
        const height = bar.getBoundingClientRect().height
        if (height > 0) return '隐藏状态下状态条仍占位（height=' + String(height) + '）'
        if (document.querySelector('.tt_body[data-stats]') !== null) return '隐藏状态下仍给终端加了状态条偏移'
        const logged = window.__mockLog || []
        if (logged.some((entry) => entry === 'in:statsOn')) return '关闭状态下仍发送了 statsOn'
        return null
      }
    },
    /* 宿主采样慢（D50）：stats 帧 4 秒才来一次——旧代码的 3s 陈旧窗口会让状态条
       每秒整条收起再出现（用户报的「瞬间消失又出现」）。这里连续采样 9 秒（跨两个
       帧间隔），要求状态条**一次都没有**隐藏过。 */
    async 'stats-slow'() {
      window.__PREVIEW_STATS_INTERVAL_MS = 4000
      await openPanel()
      await waitFor(() => tabs().length === 1)
      // 首帧立即推 → 状态条先出来
      await waitFor(() => {
        const bar = q('.tt_statsBar')
        return bar !== null && bar.hidden !== true && /CPU/.test(bar.textContent)
      }, 4000)
      const visible = []
      const timer = setInterval(() => {
        const bar = q('.tt_statsBar')
        visible.push(bar !== null && bar.hidden !== true)
      }, 100)
      await sleep(9000)
      clearInterval(timer)
      window.__previewAssert = async () => {
        const hidden = visible.filter((value) => value !== true).length
        if (hidden > 0) {
          return '4s 一帧时状态条有 ' + String(hidden) + '/' + String(visible.length) + ' 次采样是隐藏的（整条消失又出现）'
        }
        return null
      }
    },
    /* 坏数据兜底：宿主发来的 stats 帧是垃圾（字符串/数组/null/越界值/缺字段），
       面板必须既不抛异常也不出现非法渲染——最多整条隐藏 */
    async 'stats-broken'() {
      window.__PREVIEW_STATS_PAYLOAD = [
        'not-an-object',
        [1, 2, 3],
        null,
        { cpuPct: 'x', cores: -5, memUsed: 1e30, memTotal: 1e30, uptimeSec: Number.MAX_SAFE_INTEGER, tcpConns: -1, tempC: {} },
        {},
        { cpuPct: 12.5, cores: 8, memTotal: 17179869184, memUsed: 9663676416, memPct: 56, uptimeSec: 3600, tcpConns: 12 },
      ]
      await openPanel()
      await waitFor(() => tabs().length === 1)
      await sleep(1800) // 至少走两轮坏帧
      window.__previewAssert = async () => {
        const bar = q('.tt_statsBar')
        if (bar === null) return '状态条 DOM 缺失'
        const text = bar.textContent || ''
        if (/-5|NaN|undefined|Infinity|e\+30|x%/.test(text)) return '坏数据被渲染出来了：' + text
        const height = bar.getBoundingClientRect().height
        if (bar.hidden === true && height > 0) return '隐藏态仍占位（height=' + String(height) + '）'
        if (bar.hidden !== true && height <= 0) return '显示态却没有高度'
        return null
      }
    },
    /* 多标签（含 SSH 标签 → 连接栏；开启 tmux 持久化以展示持久徽标） */
    async multi() {
      window.__PREVIEW_CONFIG.persistence = 'tmux'
      await openPanel()
      await clickAdd()
      await clickMenuItem('prod-web-01')
      await waitFor(() => tabs().length === 2)
      await clickAdd()
      await clickMenuItem('staging-db')
      await waitFor(() => tabs().length === 3)
      await clickAdd()
      await clickMenuItem('本地终端', 'Local terminal')
      await waitFor(() => tabs().length === 4)
      tabs()[1].click()
      await sleep(250)
      // 切到另一个标签后状态条要跟着走：显示新标签的数据，且偏移与显隐一致
      // （跨标签/跨平台混用时，这里出问题就会表现为终端被顶歪）
      await waitFor(() => {
        const bar = q('.tt_statsBar')
        return bar !== null && bar.hidden !== true && /CPU/.test(bar.textContent)
      }, 4000)
      window.__previewAssert = async () => {
        const bar = q('.tt_statsBar')
        const body = q('.tt_body')
        if (bar === null || body === null) return '状态条/终端容器缺失'
        const shifted = body.dataset.stats !== undefined
        const visible = bar.hidden !== true && bar.getBoundingClientRect().height > 0
        if (visible !== shifted) return '显隐与终端偏移不一致（visible=' + String(visible) + ' shifted=' + String(shifted) + '）'
        return null
      }
    },
    /* 「+」菜单 */
    async menu() {
      await openPanel()
      await clickAdd()
    },
    /* SSH 连接对话框（新建） */
    async ssh() {
      await openPanel()
      await clickAdd()
      await clickMenuItem('SSH 连接…', 'SSH connection…')
      await waitFor(() => q('.tt_sshCard'))
      await sleep(150)
    },
    /* SSH 连接对话框：跑一次「试连」并展示结果（验证状态带不撑动布局） */
    async 'ssh-probe'() {
      await openPanel()
      await clickAdd()
      await clickMenuItem('SSH 连接…', 'SSH connection…')
      await waitFor(() => q('.tt_sshCard'))
      const inputs = qa('.tt_sshCard input')
      inputs[0].value = '192.0.2.10'
      inputs[1].value = '22'
      inputs[2].value = 'root'
      const probeBtn = qa('.tt_sshActions .tt_toolBtn').find((b) => says(b, '试连', 'Test'))
      probeBtn.click()
      const resultEl = () => q('.tt_sshProbeResult')
      await waitFor(() => resultEl() && resultEl().textContent !== '' && !says(resultEl(), '测试中', 'Testing'))
      await sleep(250)
    },
    /* SSH 连接对话框（编辑连接簿条目，含 env 选择器） */
    async 'ssh-edit'() {
      await openPanel()
      await clickAdd()
      const rows = await waitFor(() => {
        const r = qa('.tt_addMenuRow')
        return r.length > 0 ? r : null
      })
      const editBtn = [...rows[1].querySelectorAll('.tt_addMenuEdit')].find((b) => attributeSays(b, 'title', '编辑连接', 'Edit connection'))
      editBtn.click()
      await waitFor(() => q('.tt_sshCard'))
      await sleep(200)
    },
    /* 设置卡片（展开） */
    async settings() {
      const host = document.createElement('div')
      host.id = 'preview-settings'
      host.style.cssText = 'position:fixed;inset:24px 24px 24px 260px;overflow:auto;z-index:2000;background:var(--dsw-alias-bg-base);padding:8px;border-radius:16px'
      document.body.appendChild(host)
      const card = cards[0]
      const root = window.ReactDOM.createRoot(host)
      root.render(window.React.createElement(card.Component))
      await waitFor(() => q('#preview-settings .tt_card'))
      await sleep(80)
      q('#preview-settings .tt_cardHeader').click()
      await waitFor(() => q('#preview-settings .tt_cardBody'))
      await sleep(400)
    },
    /* 端口转发：编辑一条隧道（此前隧道区块零界面回归，D53/D54/D56 就是这么潜伏的） */
    async 'tunnel-edit'() {
      const host = document.createElement('div')
      host.id = 'preview-settings'
      host.style.cssText = 'position:fixed;inset:24px 24px 24px 260px;overflow:auto;z-index:2000;background:var(--dsw-alias-bg-base);padding:8px;border-radius:16px'
      document.body.appendChild(host)
      const root = window.ReactDOM.createRoot(host)
      root.render(window.React.createElement(cards[0].Component))
      await waitFor(() => q('#preview-settings .tt_card'))
      await sleep(80)
      q('#preview-settings .tt_cardHeader').click()
      await waitFor(() => q('#preview-settings .tt_cardBody'))
      await sleep(400)

      const rowOf = (name) => [...document.querySelectorAll('#preview-settings .tt_sshHostRow')]
        .find((r) => (r.querySelector('.tt_sshHostName')?.textContent ?? '').startsWith(name))
      const buttonsIn = (el) => [...el.querySelectorAll('button')]

      // 「编辑」按钮是本次新增的能力：先在第一条隧道行上找到它
      const firstRow = rowOf('staging-pg')
      if (firstRow === undefined) throw new Error('找不到 staging-pg 行（fixture 应有该隧道）')
      const editBtn = buttonsIn(firstRow).find((b) => saysExact(b, '编辑', 'Edit'))
      if (editBtn === undefined) throw new Error('隧道行没有「编辑」按钮')
      editBtn.click()
      await sleep(150)

      // 把隧道区块滚进视口：截图要能拍到表单本身（设置卡片很长，隧道在下方）
      const scrollTunnelIntoView = () => {
        const anchor = document.querySelector('#preview-settings .tt_segmented') ?? document.querySelector('#preview-settings .tt_tunnelEndpoints')
        if (anchor !== null) anchor.scrollIntoView({ block: 'center' })
      }
      scrollTunnelIntoView()
      await sleep(120)

      // 回填：本地转发那边「127.0.0.1:<端口>」成对呈现，端口输入带 aria-label 标识
      const localPortInput = findByAria(document.querySelector('#preview-settings') || document, '本机监听端口', 'Local listen port')
      if (localPortInput === null) throw new Error('本地转发表单没渲染（找不到本机监听端口输入）')
      if (localPortInput.value !== '15432') throw new Error('编辑未回填本地端口：' + String(localPortInput.value))

      // 固定端必须是**静态文本**而不是输入框（宿主硬编码了 127.0.0.1，给个能改的框是骗人）
      const staticEnd = document.querySelector('#preview-settings .tt_tunnelEndpointStatic')
      if (staticEnd === null) throw new Error('固定端没有渲染成静态文本')
      if (staticEnd.textContent !== '127.0.0.1') throw new Error('固定端文本不对：' + String(staticEnd.textContent))
      if (staticEnd.tagName === 'INPUT') throw new Error('固定端是输入框（应为静态文本）')

      // 端点必须是成对呈现（host+port 同组），且中间有方向箭头
      const endpointCount = document.querySelectorAll('#preview-settings .tt_tunnelEndpoint').length
      if (endpointCount !== 2) throw new Error('端点组数不为 2：' + String(endpointCount))
      if (document.querySelector('#preview-settings .tt_tunnelArrow') === null) throw new Error('缺少方向箭头')

      // 分段控件：本地/远程可切换，当前项高亮
      const segBtns = [...document.querySelectorAll('#preview-settings .tt_segmentedBtn')]
      if (segBtns.length !== 2) throw new Error('分段控件按钮数不为 2：' + String(segBtns.length))
      const activeSeg = segBtns.filter((b) => b.hasAttribute('data-active'))
      if (activeSeg.length !== 1) throw new Error('分段控件没有唯一高亮项：' + String(activeSeg.length))

      // 切到「远程 -R」：固定端应换到**右侧**（本机拨号），左侧变成可填的服务器侧监听地址
      // ——两个方向的固定端不同，这正是不能照搬单一形状的原因
      segBtns.find((b) => says(b, '远程 -R', 'Remote -R')).click()
      await sleep(200)
      scrollTunnelIntoView()
      const remoteEndpoints = [...document.querySelectorAll('#preview-settings .tt_tunnelEndpoint')]
      if (remoteEndpoints.length !== 2) throw new Error('远程方向端点组数不为 2：' + String(remoteEndpoints.length))
      const hasStaticInFirst = remoteEndpoints[0].querySelector('.tt_tunnelEndpointStatic') !== null
      const hasStaticInSecond = remoteEndpoints[1].querySelector('.tt_tunnelEndpointStatic') !== null
      if (hasStaticInFirst || !hasStaticInSecond) {
        throw new Error('远程方向的固定端没有换到右侧（左静态=' + String(hasStaticInFirst) + ' 右静态=' + String(hasStaticInSecond) + '）')
      }
      // 箭头在远程方向应翻转（CSS 旋转 180°，data-direction 决定）
      const arrow = document.querySelector('#preview-settings .tt_tunnelArrow')
      if (arrow === null || arrow.getAttribute('data-direction') !== 'remote') {
        throw new Error('远程方向的箭头没有翻转标记')
      }
      // 切回本地 -L，后续断言按本地方向的期望继续
      segBtns.find((b) => says(b, '本地 -L', 'Local -L')).click()
      await sleep(200)
      scrollTunnelIntoView()
      await sleep(80)

      /*
       * 窄容器下的排布：端点用 flex-wrap，最怕的是"挤不下也不换行 → 内容溢出到卡片外"。
       * 设置卡片在真实界面里可能只有一栏宽度，所以这里把容器压到 420px 验证：
       * ① 端点该换行（不是硬挤一行）；② 没有任何子元素横向溢出容器。
       */
      {
        const settingsHost = document.querySelector('#preview-settings')
        const originalWidth = settingsHost.style.width
        settingsHost.style.width = '420px'
        await sleep(200)
        const endpointsRow = document.querySelector('#preview-settings .tt_tunnelEndpoints')
        const card = document.querySelector('#preview-settings .tt_card')
        if (endpointsRow !== null && card !== null) {
          const rowRect = endpointsRow.getBoundingClientRect()
          const cardRect = card.getBoundingClientRect()
          if (rowRect.right > cardRect.right + 1) {
            throw new Error('窄容器下端点半点溢出卡片（右边界 ' + rowRect.right.toFixed(0) + ' > 卡片 ' + cardRect.right.toFixed(0) + '）')
          }
          // 两个端点必须真的换行（上下排布），而不是压成一行把内容挤扁
          const groups = [...document.querySelectorAll('#preview-settings .tt_tunnelEndpoint')]
          if (groups.length === 2) {
            const a = groups[0].getBoundingClientRect()
            const b = groups[1].getBoundingClientRect()
            if (Math.abs(a.top - b.top) < 4) {
              throw new Error('窄容器下两个端点没有换行（仍在同一行，会被挤扁）')
            }
          }
        }
        settingsHost.style.width = originalWidth
        await sleep(200)
        scrollTunnelIntoView()
      }

      // 方向切换会重渲表单：DOM 节点可能被替换，重新取一次（别用切换前的引用）
      const localPortInput2 = findByAria(document.querySelector('#preview-settings') || document, '本机监听端口', 'Local listen port')
      if (localPortInput2 === null) throw new Error('切回本地后表单没渲染')

      const body = q('#preview-settings .tt_cardBody')
      if (buttonsIn(body).find((b) => saysExact(b, '保存修改', 'Save changes')) === undefined) throw new Error('编辑态没有「保存修改」')
      if (buttonsIn(body).find((b) => saysExact(b, '取消', 'Cancel')) === undefined) throw new Error('编辑态没有「取消」')
      if (buttonsIn(body).find((b) => saysExact(b, '添加隧道', 'Add tunnel')) !== undefined) {
        throw new Error('编辑态仍显示「添加隧道」（会误加一条而不是改这条）')
      }
      if (document.querySelectorAll('#preview-settings .tt_sshHostRow[data-editing]').length !== 1) {
        throw new Error('正在编辑的行没有唯一标记（data-editing）')
      }

      // 改端口 → 保存：名字必须按规则**重新派生**（`<bookName>-L<localPort>`）。
      //
      // 注意 fixture 里那条叫 `staging-pg`（手写的假名字，不符合派生规则），
      // bookName 是 `staging-db`——所以编辑后新名字是 `staging-db-L15433`。
      // 真实数据里隧道名一律由规则派生（UI 没有"自定义名字"入口），编辑不会改名；
      // 这里恰好顺带钉住了"名字按规则重算"这个语义。
      //
      // 直接 `input.value = x` 对 React 无效：React 在 input 上装了 value 的原生
      // setter，直接赋值后它读到的还是旧值（受控组件状态不更新）。必须先取 prototype
      // 上的原生 setter 赋值、再派发冒泡的 input 事件。harness 里此前没有"往输入框
      // 打字"的场景，这是第一个（`setReactInput` 供后续场景复用）。
      const setReactInput = (el, value) => {
        const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
        desc.set.call(el, value)
        el.dispatchEvent(new window.Event('input', { bubbles: true }))
      }
      setReactInput(localPortInput2, '15433')
      await sleep(150)
      buttonsIn(body).find((b) => saysExact(b, '保存修改', 'Save changes')).click()
      await sleep(400)

      window.__previewAssert = async () => {
        const problems = []
        const names = [...document.querySelectorAll('#preview-settings .tt_sshHostName')].map((el) => el.textContent ?? '')
        if (!names.some((n) => n.startsWith('staging-db-L15433'))) {
          problems.push('改端口后名字没按规则重新派生：' + names.join(' | '))
        }
        if (names.some((n) => n.startsWith('staging-pg'))) {
          problems.push('旧名字仍在（按原始名定位替换失败）')
        }
        // 另一条隧道不能受影响（编辑只动被编辑的那条）
        if (!names.some((n) => n.startsWith('prod-redis'))) {
          problems.push('编辑波及了别的隧道')
        }
        if (buttonsIn(document.querySelector('#preview-settings .tt_cardBody')).find((b) => saysExact(b, '添加隧道', 'Add tunnel')) === undefined) {
          problems.push('保存后没有退出编辑态')
        }
        return problems.length > 0 ? problems.join('；') : null
      }
    },
    /*
     * 设置卡片：保存隧道时宿主报了**端口问题**（tty D60 前半）。
     *
     * 这一条是纯客户端的一半：宿主在 200 里带回 `warnings`，卡片必须
     *   ① **说**出来（不能说「已生效」就完事——那条隧道会停在红色 error 且不重试）；
     *   ② 说成**警告**而不是成功（绿色）也不是失败（红色）——保存**真的成功了**，
     *      配置落盘了，只是端口有问题。颜色就是这三态唯一的区别。
     */
    async 'port-warn'() {
      window.__PREVIEW_PORT_WARNINGS = [
        '本地端口 15432（隧道「staging-db-L15432」）已被占用：端口转发是机器级资源，最常见的原因是另一个 DSH profile 的宿主进程还在跑同一条隧道。这条隧道会停在 error 且不重试；换一个没被占用的 localPort，或在那个 profile 里关掉它。',
      ]
      const host = document.createElement('div')
      host.id = 'preview-settings'
      host.style.cssText = 'position:fixed;inset:24px 24px 24px 260px;overflow:auto;z-index:2000;background:var(--dsw-alias-bg-base);padding:8px;border-radius:16px'
      document.body.appendChild(host)
      const root = window.ReactDOM.createRoot(host)
      root.render(window.React.createElement(cards[0].Component))
      await waitFor(() => q('#preview-settings .tt_card'))
      await sleep(80)
      q('#preview-settings .tt_cardHeader').click()
      await waitFor(() => q('#preview-settings .tt_cardBody'))
      await sleep(400)

      const buttonsIn = (el) => [...el.querySelectorAll('button')]
      const body = q('#preview-settings .tt_cardBody')
      // 勾掉一条既有隧道的启停 → 走 commitTunnels 那条路（保存隧道 → 宿主报端口问题）
      const row = [...document.querySelectorAll('#preview-settings .tt_sshHostRow')]
        .find((r) => (r.querySelector('.tt_sshHostName')?.textContent ?? '').startsWith('staging-pg'))
      if (row === undefined) throw new Error('找不到 staging-pg 隧道行（fixture 应有该隧道）')
      const box = row.querySelector('input[type=checkbox]')
      if (box === null) throw new Error('隧道行没有启停勾选（夹具失效）')
      box.click()
      await sleep(700)

      // 消息落在卡片最下方（保存按钮那一行）：截图要能拍到它，否则这条走查图是废的
      const msgEl = q('#preview-settings .tt_cardMessage')
      if (msgEl !== null) msgEl.scrollIntoView({ block: 'center' })
      await sleep(200)

      window.__previewAssert = async () => {
        const msg = q('#preview-settings .tt_cardMessage')
        if (msg === null) return '夹具失效：卡片里没有消息节点'
        const text = msg.textContent ?? ''
        if (!text.includes('15432')) return '端口问题的警告没有显示出来（消息为「' + text + '」）'
        if (msg.classList.contains('tt_cardMessageOk')) return '端口有问题却报成了成功（绿色）——那条隧道会停在 error'
        if (msg.classList.contains('tt_cardMessageError')) return '端口问题报成了保存失败（红色）——配置其实已经存下了'
        if (!msg.classList.contains('tt_cardMessageWarn')) return '端口警告的样式类不对：' + msg.className
        // 警告必须真的顶掉成功文案：两条同时出现用户只会挑好听的那条看
        if (text.includes('已生效') || text.includes('is active')) return '成功文案与警告同时出现：' + text
        return null
      }
    },
    /*
     * 设置卡片：AI 辅助小节（0.24.0）。
     *
     * 新小节排在卡片**最下面**，默认视口看不到——这个场景负责把它滚进来，并核对四个控件
     * 都在、且**默认是关**（这个开关会外发终端内容，默认值错了就是隐私事故，不能只靠肉眼）。
     */
    async 'settings-assist'() {
      const host = document.createElement('div')
      host.id = 'preview-settings'
      host.style.cssText = 'position:fixed;inset:24px 24px 24px 260px;overflow:auto;z-index:2000;background:var(--dsw-alias-bg-base);padding:8px;border-radius:16px'
      document.body.appendChild(host)
      const list = document.createElement('ul')
      list.style.cssText = 'display:flex;flex-direction:column;gap:12px;margin:0;padding:0'
      host.appendChild(list)
      const tty = cards.find((c) => c.spec.key === 'tty')
      if (tty === undefined) throw new Error('未注册 tty 设置卡片')
      const root = window.ReactDOM.createRoot(list)
      // 先让模型目录**取不到**（= 宿主没这条路由）：卡片必须说「拿不到」，不能笼统说「没有候选」
      window.__PREVIEW_CATALOG = { fail: true }
      root.render(window.React.createElement(tty.Component))
      await waitFor(() => q('.tt_card'), 3000)
      q('.tt_cardHeader').click()
      await waitFor(() => q('.tt_cardBody'), 4000)
      await sleep(400)
      const assistTitle = qa('.tt_cardSection').find((el) => says(el, 'AI 辅助', 'AI assist'))
      if (assistTitle !== undefined) assistTitle.scrollIntoView({ block: 'start' })
      await sleep(300)
      /*
       * D91：**勾上 → 保存 → 必须还是勾着的**。
       *
       * 用户现场就是这条（勾完点保存、勾自己弹回去）。客户端保存成功后拿**响应里的 config**
       * 重置整张表单，所以「到底存下去了没有」的观测点就在这里；夹具的 /config POST 已改成
       * 照真实宿主的样子应用补丁——它要是只原样回一份旧配置，这条断言就永远绿（测不出东西）。
       */
      /*
       * 模型路由是**一个**控件（渠道 + 模型一张候选表）。盯四件事：
       *   ① 目录**取不到**时要说「拿不到」（宿主没重启就会这样），不能笼统说「没有候选」——
       *      用户实测就是被这句话引到「我是不是配错了」上去的；
       *   ② 取到之后：按渠道分组、点一条**同时**把两个键写好；
       *   ③ 手输仍然可用，写法 provider/model（目录只是建议，纯下拉会把人锁死）；
       *   ④ 这两条路都得真的进保存 payload。
       */
      const setReactInput = (el, value) => {
        // React 在 input 上装了 value 的原生 setter：直接赋值它读到的是旧值，必须先取 prototype 的
        const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
        desc.set.call(el, value)
        el.dispatchEvent(new window.Event('input', { bubbles: true }))
      }
      const routeField = qa('.tt_cardField').find((el) => {
        const label = el.querySelector('.tt_cardLabel')
        return label !== null && (label.textContent.indexOf('模型路由') >= 0 || label.textContent.indexOf('Model route') >= 0)
      })
      const routeInput = routeField === undefined ? null : routeField.querySelector('input.tt_cardInput')
      const routeList = () => (routeField === undefined ? null : routeField.querySelector('.tt_routeList'))
      const routeItems = () => {
        const list = routeList()
        return list === null ? [] : Array.from(list.querySelectorAll('.tt_envItem')).map((el) => el.textContent)
      }
      const routeGroups = () => {
        const list = routeList()
        return list === null ? [] : Array.from(list.querySelectorAll('.tt_envMore')).map((el) => el.textContent)
      }
      const catalogCalls = () => (window.__mockLog || []).filter((line) => line.indexOf('fetch:model-catalog') === 0)
      let unavailableText = ''
      let candidateGroups = []
      let candidateItems = []
      let pickedPair = ''
      let routeReadOnly = null
      let listPosition = ''
      let layoutShift = null
      let defaultLabel = ''
      let defaultCleared = ''
      let labelsRepeatId = false
      if (routeInput !== null) {
        // ① 挂载时目录取不到（夹具预先置了 __PREVIEW_CATALOG.fail）
        routeInput.click()
        await sleep(300)
        unavailableText = routeField.textContent
        // ② 目录恢复：再聚焦一次会重取（失败时 groups 仍为空，守卫放行）
        delete window.__PREVIEW_CATALOG
        const saveBtn = qa('.tt_cardSave').find((el) => saysExact(el, '保存', 'Save'))
        const saveTopBefore = saveBtn === undefined ? null : saveBtn.getBoundingClientRect().top
        routeInput.click()
        await sleep(400)
        candidateGroups = routeGroups()
        candidateItems = routeItems()
        // 下拉选不许顶动卡片（用户实测：「下拉选会破坏布局」）——浮层是 fixed，进不了布局
        const saveTopOpen = saveBtn === undefined ? null : saveBtn.getBoundingClientRect().top
        layoutShift = saveTopBefore === null || saveTopOpen === null ? null : saveTopOpen - saveTopBefore
        listPosition = routeList() === null ? '' : window.getComputedStyle(routeList()).position
        // 名字与 id 并排写两遍太吵（用户实测：「label 有点太长了」）
        labelsRepeatId = candidateItems.some((label) => label.indexOf(' · ') >= 0)
        // ③ 第一行必须是「跟随宿主默认模型」，点它 = 两个键都清空
        const defaultItem = routeList() === null ? null : routeList().querySelector('.tt_envItem')
        defaultLabel = defaultItem === null ? '' : defaultItem.textContent
        if (defaultItem !== null) {
          defaultItem.click()
          await sleep(250)
        }
        defaultCleared = routeInput.value
        // ④ 再点一条模型：渠道 + 模型一起写好
        routeInput.click()
        await sleep(300)
        const modelItem = routeList() === null ? null : routeList().querySelectorAll('.tt_envItem')[1]
        if (modelItem !== null && modelItem !== undefined) {
          modelItem.click()
          await sleep(250)
        }
        pickedPair = routeInput.value
        // ⑤ 只能选，不能打字：控件是只读的（用户定的——目录空的话 DSH 自己的对话也选不出模型）
        routeReadOnly = routeInput.readOnly
      }

      const toggleBefore = qa('.tt_cardLabel').find((el) => says(el, '失败即解释', 'Explain failures'))
      const boxBefore = toggleBefore === undefined ? null : toggleBefore.parentElement.querySelector('input[type=checkbox]')
      const checkedByDefault = boxBefore === null ? null : boxBefore.checked
      let checkedAfterSave = null
      let postedPayload = null
      let saveBtnLabels = null
      if (boxBefore !== null) {
        boxBefore.click()
        await sleep(120)
        const saveBtns = qa('.tt_cardSave')
        saveBtnLabels = saveBtns.map((el) => el.textContent)
        /*
         * 卡片里不止一个 .tt_cardSave（隧道那一组的「添加隧道」也用这个类），
         * 必须**按文案**挑出真正的保存按钮——按「第一个非空」挑会点到「添加隧道」上，
         * 于是保存根本没发生，而断言只会说「没发出请求」（真机调试时就是这么被骗了一轮）。
         */
        const saveBtn = saveBtns.find((el) => saysExact(el, '保存', 'Save')) ?? saveBtns[saveBtns.length - 1]
        if (saveBtn !== undefined) saveBtn.click()
        await sleep(900)
        const posts = window.__mockConfigPosts || []
        postedPayload = posts.length > 0 ? posts[posts.length - 1] : null
        const afterLabel = qa('.tt_cardLabel').find((el) => says(el, '失败即解释', 'Explain failures'))
        const afterBox = afterLabel === undefined ? null : afterLabel.parentElement.querySelector('input[type=checkbox]')
        checkedAfterSave = afterBox === null ? null : afterBox.checked
      }
      window.__previewAssert = async () => {
        if (assistTitle === undefined) return '设置卡片里没有「AI 辅助」小节'
        if (checkedByDefault !== false) return 'AI 辅助默认必须是**关**（它会外发终端内容），实测默认 checked=' + String(checkedByDefault)
        if (checkedAfterSave === null) return '夹具失效：找不到「失败即解释」复选框'
        if (postedPayload === null) {
          return '夹具失效：保存没有发出 /config 请求（.tt_cardSave 共 ' + String((saveBtnLabels || []).length) + ' 个：' + JSON.stringify(saveBtnLabels) + '）'
        }
        if (postedPayload.assistEnabled !== true) return '保存的 payload 里没有 assistEnabled（D91 客户端那一半）'
        if (checkedAfterSave !== true) return '保存成功后勾又弹回去了（D91 现场）'
        const toggleLabel = qa('.tt_cardLabel').find((el) => says(el, '失败即解释', 'Explain failures'))
        const box = toggleLabel.parentElement.querySelector('input[type=checkbox]')
        if (!box.closest('.tt_cardBody').contains(assistTitle)) return '开关不在设置卡片里（夹具失效）'
        if (routeInput === null) return '设置卡片里没有「模型路由」控件'
        // 这一栏的说明只该有一行短句：控件本身已经把「能选什么」摆在列表里了
        const routeHints = routeField === undefined ? [] : Array.from(routeField.querySelectorAll('.tt_cardHint'))
        if (routeHints.length > 1) {
          return '模型路由一栏堆了 ' + String(routeHints.length) + ' 行说明（其它字段都只有一行）：' + JSON.stringify(routeHints.map((el) => el.textContent))
        }
        // 占位符里不许出现具体路由（曾经写死过开发机上的那一对）；空态的含义由候选表解释
        if (routeInput.placeholder !== '') {
          return '模型路由控件带了占位符（会把某一对具体路由写给所有人看）：' + JSON.stringify(routeInput.placeholder)
        }
        if (unavailableText.indexOf('拿不到候选') < 0 && unavailableText.indexOf('Candidates unavailable') < 0) {
          return '目录取不到时没说「拿不到」（宿主没重启就长这样）：' + unavailableText.slice(0, 120)
        }
        if (catalogCalls().length === 0) return '夹具失效：控件没有去取候选目录'
        if (candidateGroups.length < 2) return '候选表没有按渠道分组：' + JSON.stringify(candidateGroups)
        if (candidateItems.length === 0) return '候选表里一个模型都没有'
        if (layoutShift === null) return '夹具失效：量不到保存按钮的位置'
        if (Math.abs(layoutShift) > 0.5) {
          return '打开候选表把卡片布局顶动了 ' + String(Math.round(layoutShift)) + 'px（用户实测现场）'
        }
        if (listPosition !== 'fixed') {
          return '候选表不是浮层（会顶动卡片布局）：position=' + listPosition
        }
        if (labelsRepeatId) {
          return '候选行的标签把名字与 id 并排写了两遍（太长）：' + JSON.stringify(candidateItems)
        }
        if (defaultLabel.indexOf('跟随宿主默认模型') < 0 && defaultLabel.indexOf('Follow the host default model') < 0) {
          return '候选表第一行不是「跟随宿主默认模型」：' + JSON.stringify(defaultLabel)
        }
        if (defaultCleared !== '') {
          return '点「跟随宿主默认模型」没有把路由清空：' + JSON.stringify(defaultCleared)
        }
        // routeText 只有在**两个键都写好了**时才显示 p/m —— 所以这条同时证明「一次点选写全了对」
        if (pickedPair !== 'mock-provider/mock-fast') {
          return '点候选没有把渠道 + 模型一起写进去：' + JSON.stringify(pickedPair)
        }
        if (routeReadOnly !== true) {
          return '模型路由控件不是只读的（只该能选，不该能打字）'
        }
        if (postedPayload.assistProvider !== 'mock-provider' || postedPayload.assistModel !== 'mock-fast') {
          return '选中的那一对没进保存 payload：' + JSON.stringify([postedPayload.assistProvider, postedPayload.assistModel])
        }
        // 路由是**一个**控件（渠道 + 模型一对）：两栏并列的旧形态不许回来
        const labels = qa('.tt_cardLabel').map((el) => el.textContent)
        const routeLabels = labels.filter((text) => text.indexOf('模型路由') >= 0 || text.indexOf('Model route') >= 0)
        if (routeLabels.length !== 1) return '模型路由应当是**一个**控件，实测 ' + String(routeLabels.length) + ' 个：' + JSON.stringify(routeLabels)
        const hint = qa('.tt_cardHint').map((el) => el.textContent).join('\n')
        if (hint.indexOf('默认关') < 0 && hint.indexOf('Off by default') < 0) return 'AI 辅助的说明里没有写明「默认关」'
        return null
      }
    },
    /* 设置卡片：docker 与 tty 并排（同一张 ul 里），核对两家的观感是否一致 */
    async 'settings-docker'() {
      const host = document.createElement('div')
      host.id = 'preview-settings'
      host.style.cssText = 'position:fixed;inset:24px 24px 24px 260px;overflow:auto;z-index:2000;background:var(--dsw-alias-bg-base);padding:8px;border-radius:16px'
      document.body.appendChild(host)
      const list = document.createElement('ul')
      list.style.cssText = 'display:flex;flex-direction:column;gap:12px;margin:0;padding:0'
      host.appendChild(list)
      const docker = cards.find((c) => c.spec.key === 'docker')
      const tty = cards.find((c) => c.spec.key === 'tty')
      if (docker === undefined) throw new Error('未注册 docker 设置卡片')
      const root = window.ReactDOM.createRoot(list)
      root.render(window.React.createElement(window.React.Fragment, null,
        window.React.createElement(tty.Component),
        window.React.createElement(docker.Component),
      ))
      await waitFor(() => q('.dk_settingsCard'), 3000)
      q('.tt_cardHeader').click()
      await sleep(300)
      q('.dk_settingsHead').click()
      await waitFor(() => q('.dk_settingsBody'), 4000)
      await sleep(600)
      const box = (sel) => {
        const el = q(sel)
        if (el === null) return null
        const cs = getComputedStyle(el)
        return { radius: cs.borderRadius, border: cs.borderColor, bg: cs.backgroundColor, pad: cs.padding, w: Math.round(el.getBoundingClientRect().width) }
      }
      window.__previewAssert = {
        dockerCard: box('.dk_settingsCard'),
        ttyCard: box('.tt_card'),
        dockerName: getComputedStyle(q('.dk_settingsName')).fontSize + '/' + getComputedStyle(q('.dk_settingsName')).fontWeight,
        ttyName: getComputedStyle(q('.tt_cardName')).fontSize + '/' + getComputedStyle(q('.tt_cardName')).fontWeight,
        dockerDesc: getComputedStyle(q('.dk_settingsDesc')).fontSize,
        ttyDesc: getComputedStyle(q('.tt_cardDescription')).fontSize,
      }
    },
    /*
     * docker 设置卡片：失效的连接簿引用要**看得出来**。
     *
     * 背景：`book` 下拉的候选项来自 ttyBooks，引用的名字若不在其中，下拉会渲染成**空白**
     * （没有匹配的 option）——界面上完全看不出错，直到真去连才报「引用的连接簿条目不存在」。
     * 实测踩过：目标引用 HS-248，而连接簿里只有 HS_248_ADMIN（改名后残留的旧引用）。
     * 这里钉住：失效行有 data-stale 标记 + 下拉里补了显式 option + 给出了提示文案。
     */
    async 'docker-stale-book'() {
      const host = document.createElement('div')
      host.id = 'preview-docker-settings'
      host.style.cssText = 'position:fixed;inset:24px 24px 24px 260px;overflow:auto;z-index:2000;background:var(--dsw-alias-bg-base);padding:8px;border-radius:16px'
      document.body.appendChild(host)
      const docker = cards.find((c) => c.spec.key === 'docker')
      if (docker === undefined) throw new Error('未注册 docker 设置卡片')
      const root = window.ReactDOM.createRoot(host)
      root.render(window.React.createElement(docker.Component))
      await waitFor(() => q('#preview-docker-settings .dk_settingsCard'), 4000)
      q('#preview-docker-settings .dk_settingsHead').click()
      await waitFor(() => q('#preview-docker-settings .dk_settingsBody'), 4000)
      await sleep(500)

      /*
       * 「目标名」输入框必须能连续打字。
       *
       * 实测 bug：那一行的 React key 写成 `String(index) + item.name`——key 里含 item.name，
       * 于是每敲一个字符 key 就变一次，React 判定为"新元素"、卸载重建整行 DOM，输入框当场
       * 失焦（表现就是"这个输入框无法聚焦"，只能输进去一个字）。修法是 key 只留 index
       * （行是**按位置**编辑的，顺序变化由数组本身负责，名字不该参与身份）。
       *
       * 这里模拟真实输入：聚焦 → 逐个字符派发 input 事件 → 检查焦点是否还在同一个节点上、
       * 且累积的文本完整（重建会让 value 回退/焦点丢失）。
       */
      const nameInput = document.querySelector('#preview-docker-settings .dk_targetRow .dk_input')
      if (nameInput === null) throw new Error('找不到目标名输入框')
      nameInput.focus()
      if (document.activeElement !== nameInput) throw new Error('目标名输入框无法聚焦')
      const setNative = (el, value) => {
        const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
        desc.set.call(el, value)
        el.dispatchEvent(new window.Event('input', { bubbles: true }))
      }
      // 逐字符敲 "abc"：若 key 含 name，每次都会重建节点 → 焦点丢失
      const typed = 'Xy9'
      let accumulated = ''
      for (const ch of typed) {
        accumulated += ch
        setNative(nameInput, accumulated)
        await sleep(60)
        if (document.activeElement !== nameInput) {
          throw new Error('敲入第 ' + String(accumulated.length) + ' 个字符后输入框失焦（key 含可变字段导致 DOM 重建）')
        }
      }
      if (nameInput.value !== typed) {
        throw new Error('输入未累积完整（期望 ' + typed + '，实得 ' + String(nameInput.value) + '）')
      }

      window.__previewAssert = async () => {
        const problems = []
        const rows = [...document.querySelectorAll('#preview-docker-settings .dk_targetRow')]
        if (rows.length === 0) return '目标行没渲染出来'
        const staleRows = rows.filter((r) => r.hasAttribute('data-stale'))
        if (staleRows.length !== 1) {
          problems.push('应恰好有 1 行被标为失效引用，实得 ' + String(staleRows.length))
        }
        // 失效那一行的下拉必须**显示得出那个失效的名字**（否则是空白，看不出问题）。
        // 注意一行里有**两个** select：第 1 个是「本机 / SSH 主机」的 kind，第 2 个才是
        // 连接簿下拉——按 title 定位它（staleBookRef 命中时会给它加提示 title）。
        const staleSelect = staleRows[0]?.querySelector('select[title]')
        if (staleSelect === undefined || staleSelect === null) {
          problems.push('失效引用那行的连接簿下拉没有提示 title')
        } else {
          const text = staleSelect.options[staleSelect.selectedIndex]?.textContent ?? ''
          if (!text.includes('已改名的条目')) problems.push('失效引用的名字没在下拉里显式显示：' + text)
          if (!text.includes('不存在')) problems.push('失效引用没有标注「不存在」：' + text)
        }
        // 提示文案要给出可执行的下一步
        const warn = staleRows[0]?.querySelector('.dk_hintWarn')
        if (warn === null || warn === undefined) problems.push('失效引用那行没有警示文案')
        // 正常引用（prod-web-01）不能被误标
        const healthy = rows.find((r) => {
          const sel = r.querySelector('select[title], select')
          return sel !== null && [...sel.options].some((o) => o.value === 'prod-web-01' && o.selected)
        })
        if (healthy !== undefined && healthy.hasAttribute('data-stale')) problems.push('正常引用被误标为失效')
        return problems.length > 0 ? problems.join('；') : null
      }
    },
    /* SFTP 单窗体（0.16.0 起挂进右侧挂载位，终端保持可见） */
    async sftp() {
      await openPanel()
      await clickAdd()
      await clickMenuItem('prod-web-01')
      await waitFor(() => tabs().length === 2)
      await sleep(200)
      const sftpBtn = qa('.tt_connAct').find((b) => b.textContent.includes('SFTP'))
      sftpBtn.click()
      await waitFor(() => q('.tt_sftpCard'))
      await waitFor(() => qa('.tt_sftpRow').length > 1)
      await sleep(250)
      window.__previewAssert = sftpSurfaceAssert()
    },
    /* SFTP 双栏（同样挂进挂载位，初始给到面板宽度的 62%） */
    async 'sftp-dual'() {
      // 双栏风格由 config.sftpStyle 决定，必须在开面板（拉配置）之前改
      window.__PREVIEW_CONFIG.sftpStyle = 'dual'
      await openPanel()
      await clickAdd()
      await clickMenuItem('prod-web-01')
      await waitFor(() => tabs().length === 2)
      await sleep(200)
      const sftpBtn = qa('.tt_connAct').find((b) => b.textContent.includes('SFTP'))
      sftpBtn.click()
      await waitFor(() => q('.tt_sftpDualCard'))
      await waitFor(() => qa('.tt_sftpRow').length > 2)
      await sleep(250)
      window.__previewAssert = sftpSurfaceAssert()
    },
    /* 挂载位跟着标签切（0.18.4）
       复现：标签 A（prod-web-01）开 SFTP 文件浏览 → 切到标签 B（staging-db）→ 面板
       此前**没跟着切**：标题仍是 A、底下文件列表是 A 那台主机的，而活动标签是 B。
       同一 bug 也砸中 dsh-docker 挂进来的容器面板。修复=挂载位记归属标签，切换时收起
       不属于当前标签的那块（收起 ≠ 关掉：DOM / 在途传输保活）；连带修掉「A 收起的面板
       把 B 的『SFTP』按钮堵成哑按钮」。 */
    async 'dock-pane-tab'() {
      const dockState = () => {
        const el = q('.tt_dockPane')
        const body = q('.tt_body')
        if (el === null) return { present: false, hidden: null, display: null, width: 0, height: 0, rows: 0, title: '', termWidth: 0, termHeight: 0 }
        return {
          present: true,
          hidden: el.dataset.dockHidden === '1',
          display: getComputedStyle(el).display,
          width: Math.round(el.getBoundingClientRect().width),
          height: Math.round(el.getBoundingClientRect().height),
          rows: qa('.tt_dockPaneBody .tt_sftpRow').length,
          title: q('.tt_dockPaneTitle') === null ? '' : q('.tt_dockPaneTitle').textContent,
          // 挂载位在下方占高度、在右侧占宽度：收起后终端该拿回对应的那一轴
          termWidth: body === null ? 0 : Math.round(body.getBoundingClientRect().width),
          termHeight: body === null ? 0 : Math.round(body.getBoundingClientRect().height),
        }
      }
      const sftpButton = () => {
        const btn = qa('.tt_connAct').find((b) => b.textContent.includes('SFTP'))
        if (btn === undefined) throw new Error('连接栏没有「SFTP」按钮')
        return btn
      }

      await openPanel()
      await clickAdd()
      await clickMenuItem('prod-web-01')
      await waitFor(() => tabs().length === 2)
      await clickAdd()
      await clickMenuItem('staging-db')
      await waitFor(() => tabs().length === 3)
      await sleep(250)

      // A = prod-web-01（第二个标签）：在它上面开文件浏览
      const tabA = tabs()[1]
      const tabB = tabs()[2]
      tabA.click()
      await sleep(250)
      const sidA = sidOf(tabA)
      sftpButton().click()
      await waitFor(() => q('.tt_dockPaneBody .tt_sftpRow'), 5000)
      await sleep(300)
      const onA = dockState()
      const cardOnA = q('.tt_dockPaneBody > .tt_sftpCard')
      if (cardOnA === null) throw new Error('SFTP 卡片没有挂进挂载位')

      // 切到 B：必须收起（且只是收起——DOM 还在，在途传输不会被掐断）
      tabB.click()
      await sleep(450)
      const onB = dockState()
      const cardAliveAfterSwitch = cardOnA.isConnected === true
      const sidB = sidOf(tabB)

      // 在 B 点「SFTP」：A 收起的面板不该把 B 的入口堵死（旧实现这里是哑按钮）
      sftpButton().click()
      await waitFor(() => {
        const el = q('.tt_dockPane')
        return el !== null && el.dataset.dockHidden !== '1'
      }, 5000)
      await waitFor(() => qa('.tt_dockPaneBody .tt_sftpRow').length > 1, 5000)
      await sleep(300)
      const onBOpened = dockState()
      // 被顶掉的那块（A 的）应当真的收掉了，不留僵尸
      const oldCardGone = cardOnA.isConnected !== true

      window.__previewAssert = () => {
        const problems = []
        if (onA.hidden === true || onA.rows < 1) problems.push('在归属标签上 SFTP 没挂进挂载位：' + JSON.stringify(onA))
        if (onB.hidden !== true) problems.push('切到另一个标签后挂载位没跟着收起：' + JSON.stringify(onB))
        if (onB.display !== 'none') problems.push('收起态不是 display:none（' + String(onB.display) + '）')
        if (onB.height !== 0 || onB.width !== 0) problems.push('收起态仍占位（width=' + String(onB.width) + ' height=' + String(onB.height) + '）')
        if (onB.termHeight <= onA.termHeight && onB.termWidth <= onA.termWidth) {
          problems.push('挂载位收起后终端没有拿回空间（宽 ' + String(onA.termWidth) + '→' + String(onB.termWidth)
            + ' 高 ' + String(onA.termHeight) + '→' + String(onB.termHeight) + '）')
        }
        if (cardAliveAfterSwitch !== true) problems.push('收起时把面板 DOM 摘掉了（在途传输会被打断）')
        if (onBOpened.hidden === true || onBOpened.rows < 1) problems.push('另一个标签上「SFTP」是哑的：' + JSON.stringify(onBOpened))
        if (oldCardGone !== true) problems.push('新面板没把上一块收起（同时挂了两块）')
        return problems.length === 0 ? null : problems.join('；')
      }
      window.__previewAssert.data = { sidA, sidB, onA, onB, onBOpened, cardAliveAfterSwitch, oldCardGone }
    },
    /* SFTP 落点断言：挂载位（dock）还是退回了对话框 */
    async 'sftp-fallback'() {
      // 抽屉已被 dsh-docker 的容器面板占用 → SFTP 应退回居中对话框，不能挤掉它
      await SCENARIOS['docker-dock']()
      const before = { dockerPanel: q('.tt_dockPaneBody .dk_panel') !== null }
      const sftpBtn = qa('.tt_connAct').find((b) => b.textContent.includes('SFTP'))
      sftpBtn.click()
      await waitFor(() => q('.tt_sshBackdrop .tt_sftpCard'), 4000)
      await sleep(250)
      window.__previewAssert = {
        ...sftpSurfaceAssert(),
        dockerPanelBefore: before.dockerPanel,
        dockerPanelAfter: q('.tt_dockPaneBody .dk_panel') !== null,
      }
    },
    /* 最小化（状态并入侧边栏入口） */
    async minimized() {
      await openPanel()
      q('.tt_min').click()
      await waitFor(() => q('[data-dsh-tty-entry][data-minimized]'))
      await sleep(150)
    },
    /*
     * 会话退出：**不画遮罩** + 顶部提示条（issue #7①②）。
     *
     * 现场（用户截图）：agent 跑的每条命令都会落一个标签，退出后被一层铺满终端区的遮罩
     * （inset:0 + 半透明底 + 模糊 + 整块可点）盖住——结果看不清、连选中复制都做不到，
     * 用户的绕过手段是 F12 里把 `.tt_overlay` 藏掉。
     *
     * 断言四条（缺一条都是静默回归）：① 面板标签的退出遮罩是空的；② 顶部提示条出现且文案
     * 是「已退出」；③ 条子真的把终端往下推了（`.tt_term` 的 top 偏移 ≥ 条高，否则第一行被盖）；
     * ④ 条上有「重新打开」这颗按钮（原来那个入口是「点遮罩」，撤了遮罩就必须补上它）。
     */
    async exited() {
      await openPanel()
      const el = activeTabEl()
      emit({ t: 'exit', sid: sidOf(el), code: 0 })
      await sleep(250)
      window.__previewAssert = async () => {
        const term = qa('.tt_term').find((node) => node.style.display !== 'none')
        if (term === undefined) return '夹具失效：没有可见的终端容器'
        const overlay = term.querySelector('.tt_overlay')
        if (overlay !== null && (overlay.textContent || '') !== '') {
          return '退出态又画上了遮罩（输出会被挡住）：' + String(overlay.textContent)
        }
        const bar = q('.tt_exitBar')
        if (bar === null || bar.hidden === true) return '退出提示条没出现（撤了遮罩就没人告诉用户会话已退出）'
        if (!says(bar, '已退出', 'Exited')) return '提示条文案不对：' + String(bar.textContent)
        const body = q('.tt_body')
        const offset = Math.round(term.getBoundingClientRect().top - body.getBoundingClientRect().top)
        if (offset < 24) return '提示条没让位：终端 top 偏移只有 ' + String(offset) + 'px'
        if (bar.querySelector('.tt_exitBarBtn') === null) return '提示条上没有「重新打开」这颗按钮'
        return null
      }
    },
    /*
     * #7③：「⋯」标签列表里的「清理已退出的标签」——**长什么样**。
     *
     * 现场：用户攒了 47 个已退出的标签，只能一个一个点标签上的 ✕。入口在「⋯」里，而那个
     * 按钮此前**只在标签栏溢出时**才出现。这条钉「没溢出但有死标签时它也在」以及菜单里那
     * 一行（截图要看清的就是它）；「点一下真的收走」在 `clean-exited-apply` 里做——
     * 断言在截图**之前**跑，凡是会改界面的检查都不该放在断言里（截图会变成点完的样子）。
     */
    async 'clean-exited'() {
      await openPanel()
      // 造三个标签，退掉其中两个：留一条活会话，面板不会因为清理把自己关掉
      for (let i = 0; i < 2; i += 1) {
        await clickAdd()
        await clickMenuItem('本地终端', 'Local terminal')
        await waitFor(() => tabs().length === i + 2, 4000)
      }
      const all = tabs()
      emit({ t: 'exit', sid: sidOf(all[1]), code: 0 })
      emit({ t: 'exit', sid: sidOf(all[2]), code: 0 })
      await sleep(250)
      const more = q('.tt_tabMore')
      if (more !== null && more.hidden !== true) {
        more.click()
        await waitFor(() => q('.tt_tabMenu'))
        await sleep(120)
      }
      window.__previewAssert = async () => {
        if (tabs().length !== 3) return '夹具失效：期望 3 个标签，实际 ' + String(tabs().length)
        if (more === null || more.hidden === true) return '有已退出的标签时「⋯」没出现（清理入口够不着）'
        const menu = q('.tt_tabMenu')
        if (menu === null) return '「⋯」菜单没打开'
        const row = qa('.tt_addMenuItem').find((el) => says(el, '清理已退出', 'Clean up exited'))
        if (row === undefined) return '菜单里没有「清理已退出的标签」这一行'
        if (!row.textContent.includes('2')) return '清理行没写明条数：' + String(row.textContent)
        return null
      }
    },
    /*
     * #7③ 的功能面：点那一下真的把死标签收走，且「⋯」自己藏回去（没有死标签、也没溢出）。
     * 断言只读（收集结果），界面动作全在场景体里——同 `clean-exited` 的理由。
     */
    async 'clean-exited-apply'() {
      await openPanel()
      for (let i = 0; i < 2; i += 1) {
        await clickAdd()
        await clickMenuItem('本地终端', 'Local terminal')
        await waitFor(() => tabs().length === i + 2, 4000)
      }
      const all = tabs()
      emit({ t: 'exit', sid: sidOf(all[1]), code: 0 })
      emit({ t: 'exit', sid: sidOf(all[2]), code: 0 })
      await sleep(250)
      const more = q('.tt_tabMore')
      if (more !== null) more.click()
      await waitFor(() => q('.tt_tabMenu'))
      await sleep(120)
      const row = await waitFor(() => qa('.tt_addMenuItem').find((el) => says(el, '清理已退出', 'Clean up exited')))
      row.click()
      await sleep(300)
      const state = { tabs: tabs().length, moreHidden: more === null ? null : more.hidden === true, menu: q('.tt_tabMenu') !== null }
      window.__previewAssert = async () => {
        if (state.tabs !== 1) return '清理没生效：还剩 ' + String(state.tabs) + ' 个标签'
        if (state.menu) return '清理后菜单还挂着'
        if (state.moreHidden === false) return '死标签清完了，「⋯」没藏回去'
        return null
      }
    },
    /*
     * #7④：AI 显式释放会话 → 标签跟着走。
     *
     * 判据是「宿主表里还有没有这一条」（agent 的 tty_close / tty_run 收尾会让它出表），
     * 而不是「进程退没退出」——只读保留（exited: true）的那种要**留着可读**。
     *
     * 两条路一起钉：后台的 agent 标签当场收走；**正在看的**那一条先留一台阶（提示条写
     * 「AI 已结束这个会话」），切走时再收。反向验证：把 `holdReleasedTab` 摘掉 → 第一条红；
     * 把「出表」也当只读保留 → 第二条红（标签不会消失）。
     */
    async 'agent-release'() {
      await openPanel()
      await waitFor(() => tabs().length === 1, 4000)
      const agentOf = (sid) => ({ sid, owner: 'agent', kind: 'local', cwd: window.__PREVIEW_CWD, attachable: true })
      // ① 后台的 agent 标签：宿主推的会话清单里多一条 owner:'agent'
      emit({ t: 'sessions', list: sessionList([agentOf('agent-bg')]) })
      await waitFor(() => tabs().length === 2, 4000)
      await sleep(200)
      // AI 释放它（宿主表里撤掉）→ 后台标签应当当场消失
      emit({ t: 'sessions', list: sessionList() })
      await sleep(300)
      const bgClosed = qa('.tt_tab').every((el) => sidOf(el) !== 'agent-bg')
      // ② 正在看的那一条：再开一条 agent 会话，切到它，然后释放
      emit({ t: 'sessions', list: sessionList([agentOf('agent-watch')]) })
      await waitFor(() => qa('.tt_tab').some((el) => sidOf(el) === 'agent-watch'), 4000)
      qa('.tt_tab').find((el) => sidOf(el) === 'agent-watch').click()
      await sleep(200)
      emit({ t: 'sessions', list: sessionList() })
      await sleep(300)
      const held = {
        count: tabs().length,
        stillThere: qa('.tt_tab').some((el) => sidOf(el) === 'agent-watch'),
        text: q('.tt_exitBar') === null ? '' : String(q('.tt_exitBar').textContent),
      }
      // ③ 切走 → 台阶结束，标签被收走
      const other = qa('.tt_tab').find((el) => sidOf(el) !== 'agent-watch')
      if (other !== undefined) other.click()
      await sleep(300)
      const closedOnSwitch = !qa('.tt_tab').some((el) => sidOf(el) === 'agent-watch')
      /*
       * ④ 再走一遍，把「AI 已结束这个会话 + 收起」的样子留给截图（截图在断言之后拍，
       * 断言又必须只读——所以要在场景体里把界面弄成要拍的样子，不能等断言去点）。
       */
      emit({ t: 'sessions', list: sessionList([agentOf('agent-shot')]) })
      await waitFor(() => qa('.tt_tab').some((el) => sidOf(el) === 'agent-shot'), 4000)
      qa('.tt_tab').find((el) => sidOf(el) === 'agent-shot').click()
      await sleep(200)
      emit({ t: 'sessions', list: sessionList() })
      await sleep(300)
      const shotState = {
        tabs: tabs().length,
        text: q('.tt_exitBar') === null ? '' : String(q('.tt_exitBar').textContent),
        dismiss: q('.tt_exitBarBtn') === null ? '' : String(q('.tt_exitBarBtn').textContent),
      }
      window.__previewAssert = async () => {
        if (!bgClosed) return '后台的 agent 标签没被收走（AI 释放后还留着）'
        if (!held.stillThere || held.count !== 2) return '正在看的 agent 标签被当场收走了（少了那一步台阶）'
        if (!held.text.includes('AI 已结束') && !held.text.includes('The AI finished')) {
          return '提示条没说明「AI 已结束这个会话」：' + held.text
        }
        if (!closedOnSwitch) return '切走之后台阶没结束：标签还在'
        if (!shotState.text.includes('AI 已结束') && !shotState.text.includes('The AI finished')) {
          return '台阶态的提示条文案不对：' + shotState.text
        }
        if (!/收起|Dismiss/.test(shotState.dismiss)) return '台阶态没有「收起」这颗按钮：' + shotState.dismiss
        return null
      }
    },
    /*
     * 4b 现场回归（2026-10-10 真机验收）：**客户端自己顶上去的活动标签不算「正在看」**。
     *
     * 现场：AI 在后台开了一条 `sleep 300`，随即 `tty_close`；工具侧确实没有这条会话了，
     * 可标签栏里还留着它——「标签退出了，但是还在」。根因不在删除逻辑，而在台阶的判据：
     * 那一刻它的 `sid === activeSid` 成立（客户端自己把它顶成了活动标签：关掉一个标签时
     * `closeTab` 会选一个邻居、`adoptAgentSessions` 在没有活动标签时也会切过去），于是走
     * 了「AI 已结束这个会话 + 收起」那条保留分支。
     *
     * 修法：台阶只认**用户自己切过**的标签（`switchTab(sid, { user: true })` 打的
     * `watched` 标记）。本场景正是那条路：先让关标签的「邻居选择」把 agent 标签顶成活动
     * 标签（没有用户点击），再释放它——**必须直接收走**。
     * 反向验证：把 `holdReleasedTab` 里的 `tab.watched !== true` 去掉 → 本场景红。
     */
    async 'agent-release-neighbor'() {
      await openPanel()
      // 再开一个用户标签（两个用户标签 + 一个后台 agent 标签，面板不会因为清空而关掉）
      await clickAdd()
      await clickMenuItem('本地终端', 'Local terminal')
      await waitFor(() => tabs().length === 2, 4000)
      const agentOf = (sid) => ({ sid, owner: 'agent', kind: 'local', cwd: window.__PREVIEW_CWD, attachable: true })
      emit({ t: 'sessions', list: sessionList([agentOf('agent-nb')]) })
      await waitFor(() => qa('.tt_tab').some((el) => sidOf(el) === 'agent-nb'), 4000)
      await sleep(200)
      const adopted = {
        tabs: tabs().length,
        agentIsActive: sidOf(activeTabEl()) === 'agent-nb',
      }
      // 关掉当前活动标签：closeTab 会选「最后一个标签」当邻居 = 刚采纳的 agent 标签
      const activeClose = activeTabEl().querySelector('.tt_tabClose')
      activeClose.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await sleep(250)
      const promoted = {
        active: sidOf(activeTabEl()),
        tabs: tabs().length,
      }
      // AI 释放它（宿主表里撤掉）→ 必须直接收走，不能留台阶
      emit({ t: 'sessions', list: sessionList() })
      await sleep(350)
      window.__previewAssert = async () => {
        if (adopted.tabs !== 3) return '夹具失效：期望 3 个标签，实际 ' + String(adopted.tabs)
        if (adopted.agentIsActive) return '夹具失效：agent 标签一开始就该在后台'
        if (promoted.active !== 'agent-nb') return '夹具失效：关标签的邻居选择没把 agent 标签顶成活动标签（' + String(promoted.active) + '）'
        if (qa('.tt_tab').some((el) => sidOf(el) === 'agent-nb')) {
          return 'AI 释放的是**客户端自己顶上去**的活动标签，标签却留下了（4b 现场：标签退出了但还在）'
        }
        const bar = q('.tt_exitBar')
        if (bar !== null && bar.hidden !== true && says(bar, 'AI 已结束', 'The AI finished')) {
          return '错误地走了「AI 已结束 + 收起」的保留分支'
        }
        if (tabs().length !== 1) return '收走之后标签数不对：' + String(tabs().length)
        return null
      }
    },
    /*
     * issue #8：点 ✕ 关面板时，有活会话就先问一句。
     *
     * 判据是「这一下会结束几条**活会话**」，不是「开了几个标签」：本场景只有一条活会话
     * 也必须问；而「只剩已退出的标签」时不该问（那条由 `close-confirm-empty` 钉）。
     * 「取消不关面板 / 不结束会话」这一段在场景体里做（断言必须只读：它跑在截图之前，
     * 在断言里点掉确认会让截图变成点完的样子）。
     */
    async 'close-confirm'() {
      await openPanel()
      await sleep(120)
      q('.tt_close').click()
      await waitFor(() => q('.tt_confirmLayer'))
      await sleep(150)
      // 先验证「取消」这条路，再重新打开确认层留给截图
      const before = tabs().length
      q('.tt_confirmCancel').click()
      await sleep(150)
      const afterCancel = { layer: q('.tt_confirmLayer') !== null, panel: modal() !== null, tabs: tabs().length, before }
      q('.tt_close').click()
      await waitFor(() => q('.tt_confirmLayer'))
      await sleep(150)
      // 再验证「点层内空白 = 取消」（下面留给截图的那一份重新打开）
      q('.tt_confirmLayer').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      await sleep(150)
      const afterBlank = { layer: q('.tt_confirmLayer') !== null, panel: modal() !== null }
      q('.tt_close').click()
      await waitFor(() => q('.tt_confirmLayer'))
      await sleep(150)
      /*
       * 第三颗按钮「最小化」（2026-10-10，用户看过截图后加的）：这次的错点往往不是「结束」，
       * 而是「想收起来」——而确认层盖住整个视口，hint 里那句「点「—」」在这时候根本点不到。
       * 所以把它放到手边，并在这里钉死**它只能收起、绝不能结束会话**：接成 `closeModal` 的话
       * 这条断言会当场红（这是本仓最该拦住的一类事故：把安全出路做成破坏按钮）。
       * 走完这一步把面板恢复出来，最后再开一次确认层留给截图。
       */
      const minBtnExists = q('.tt_confirmMin') !== null
      const minLabel = minBtnExists ? String(q('.tt_confirmMin').textContent) : ''
      const beforeMin = tabs().length
      if (minBtnExists) q('.tt_confirmMin').click()
      await sleep(200)
      const afterMin = {
        layer: q('.tt_confirmLayer') !== null,
        minimized: isMinimized(),
        panelAlive: modal() !== null,
        tabs: tabs().length,
        before: beforeMin,
      }
      // 恢复面板：点侧边栏入口（收起态下它就是「恢复」那条路）
      entry().click()
      await waitFor(() => !isMinimized())
      await sleep(150)
      q('.tt_close').click()
      await waitFor(() => q('.tt_confirmLayer'))
      await sleep(150)
      window.__previewAssert = async () => {
        if (afterCancel.layer) return '点「取消」没关掉确认层'
        if (!afterCancel.panel) return '点「取消」把面板关掉了'
        if (afterCancel.tabs !== afterCancel.before) return '点「取消」把会话结束了'
        if (afterBlank.layer) return '点确认层里的空白没关掉它（对话框的常规手感）'
        if (!afterBlank.panel) return '点空白把面板也关掉了'
        if (!minBtnExists) return '确认框里没有「最小化」这颗按钮（用户看过截图后要求加的那颗）'
        if (!/最小化|Minimize/.test(minLabel)) return '第三颗按钮不是「最小化」：' + minLabel
        if (afterMin.layer) return '点「最小化」没关掉确认层'
        if (!afterMin.minimized) return '点「最小化」没把面板收起来'
        if (!afterMin.panelAlive) return '点「最小化」把面板 DOM 也拆了（那等于关了面板）'
        if (afterMin.tabs !== afterMin.before) return '点「最小化」把会话结束了：' + String(afterMin.before) + ' → ' + String(afterMin.tabs)
        const layer = q('.tt_confirmLayer')
        if (layer === null) return '有活会话时点 ✕ 没弹确认'
        const okText = (q('.tt_confirmOk') || {}).textContent || ''
        if (!okText.includes('1')) return '主按钮没写明会结束几条会话：' + okText
        if (!says(layer, '最小化', 'Minimize')) return '确认里没给出「最小化」这条出路（hint 与按钮都算）'
        /*
         * issue #8 的口径守卫（2026-10-10 核对挖出来的那处出入）：判据是「活会话」= **还没退出**
         * （`close-guard.js` 只看 `exited !== true`），**判不出命令在不在跑**——面板上挂着一个停在
         * 提示符的空 shell，与跑着 `pnpm build` 的那条，在判据眼里一模一样。所以文案不许把这批会话
         * 说成「正在运行 / running sessions」：那是替实现吹一个它做不到的牛，报告者照回帖原文验收时
         * 就会发现对不上。要改这条断言，先把「在跑」这个态真的接上线（宿主已有 `runningOf`，见
         * `src/index.ts` 与 ROADMAP 的 0.28.0 那节），别直接改字。
         */
        const layerText = String(layer.textContent || '')
        if (/正在运行|running sessions|are running/.test(layerText)) {
          return '确认文案把这批会话说成「正在运行」了，而判据只是「还没退出」（#8 口径）：' + layerText
        }
        if (!says(layer, '还没退出', 'have not exited')) return '确认文案没说清这批会话是「还没退出」的：' + layerText
        // ✕ 的 tooltip 是同一句话的另一个出口（`btn.closePanelTitle`），一并钉
        const closeTitle = (q('.tt_close') || {}).title || ''
        if (/在跑|正在运行|running sessions/.test(closeTitle)) {
          return '✕ 的 tooltip 说成「在跑 / 正在运行」了（#8 口径同样只到「还没退出」）：' + closeTitle
        }
        return null
      }
    },
    /*
     * 关面板确认的反面：只剩已退出的标签时**不问**，直接关。
     *
     * 为什么要有这一条：判据若写成「有标签就问」，用户关掉一个跑完的终端也会被拦一次，
     * 确认会被点成习惯（那时真正的拦阻就失效了）。反向验证：把判据换成 `tabs.size > 0`
     * → 本场景红。
     */
    async 'close-confirm-empty'() {
      await openPanel()
      const el = activeTabEl()
      emit({ t: 'exit', sid: sidOf(el), code: 0 })
      await sleep(200)
      q('.tt_close').click()
      await sleep(250)
      window.__previewAssert = async () => {
        if (q('.tt_confirmLayer') !== null) return '只剩已退出的标签也弹了确认（纯噪音）'
        if (modal() !== null) return '没有活会话时点 ✕ 没关掉面板'
        return null
      }
    },
    /* 连接错误遮罩 */
    async error() {
      await openPanel()
      const el = activeTabEl()
      emit({ t: 'error', sid: sidOf(el), m: 'SSH 认证失败：Permission denied (publickey)' })
      await sleep(200)
    },
    /* 隧道状态弹层 */
    async tunnel() {
      await openPanel()
      await clickAdd()
      await clickMenuItem('staging-db')
      await waitFor(() => tabs().length === 2)
      await sleep(200)
      const btn = qa('.tt_connAct').find((b) => says(b, '隧道', 'Tunnel'))
      if (btn) btn.click()
      await waitFor(() => q('.tt_tunnelPop'))
      await sleep(300)
    },
    /*
     * 连接栏「⋯」更多（没有启用隧道的连接）。
     *
     * 这条路径此前**完全不可见**：隧道入口只在 `count > 0` 时出现，没配隧道的连接在界面上
     * 没有任何线索能发现"这里可以配端口转发"。现在没隧道时收进「⋯」——既有发现路径、
     * 又不占常驻宽度（连接栏宽度优先给标签条）。
     */
    async 'connbar-more'() {
      await openPanel()
      // bare-host 在 fixture 里刻意没有任何隧道
      await clickAdd()
      await clickMenuItem('bare-host')
      await waitFor(() => tabs().length === 2)
      await sleep(300)

      const acts = qa('.tt_connAct')
      // 没有隧道 ⇒ 不该出现常驻「隧道 N」按钮
      if (acts.some((b) => says(b, '隧道', 'Tunnel'))) {
        throw new Error('没有隧道的连接却出现了常驻「隧道」按钮')
      }
      const more = acts.find((b) => says(b, '更多', 'More'))
      if (more === undefined) throw new Error('没有隧道的连接缺少「⋯ 更多」入口')
      more.click()
      await waitFor(() => q('.tt_connMore'))
      await sleep(250)

      // 闭环：菜单项必须真的可点、并给出可执行的信息（该连接没有启用隧道 + 去哪配）
      const item = qa('.tt_connMore .tt_addMenuItem').find((el) => says(el, '端口转发', 'Port forwarding'))
      if (item === undefined) throw new Error('「⋯」菜单里没有端口转发项')
      item.click()
      await waitFor(() => q('.tt_tunnelPop'))
      await sleep(300)
      window.__previewAssert = async () => {
        const pop = q('.tt_tunnelPop')
        if (pop === null) return '点击菜单项后没有打开隧道弹层'
        const text = pop.textContent ?? ''
        if (!text.includes('暂无启用') && !text.includes('No enabled tunnels')) return '弹层没有说明「该连接暂无启用的隧道」：' + text
        if (!/插件配置|设置|Settings/.test(text)) return '弹层没有告诉用户去哪配置'
        return null
      }
    },
    /* 搜索框展开 */
    async search() {
      await openPanel()
      q('[data-act=search]').click()
      await sleep(120)
      q('.tt_searchInput').value = 'client.js'
      await sleep(80)
    },
    /* 嵌入终端：ttyTerminal.mount 挂到一块普通 div（面板不开，冷启动连接） */
    async embed() {
      const host = document.createElement('div')
      host.id = 'preview-embed'
      host.style.cssText = 'position:fixed;left:120px;top:120px;width:840px;height:420px;z-index:3000;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;overflow:hidden;background:#0b0e14'
      document.body.appendChild(host)
      const terminal = services.get('ttyTerminal')
      if (terminal === undefined) throw new Error('ttyTerminal 服务不存在')
      window.__embedDispose = terminal.mount(host, { command: 'docker exec -it app-web-1 sh', label: 'app-web-1 · exec' })
      await waitFor(() => q('#preview-embed .xterm'), 4000)
      await sleep(700)
    },
    /* 共存：先挂嵌入终端，再开/关 tty 面板 —— 嵌入会话必须活着 */
    async 'embed-panel'() {
      await SCENARIOS.embed()
      await openPanel()
      await sleep(400)
      q('.tt_close').click()
      await sleep(500)
      const frames = (window.__mockLog || []).join(' ')
      window.__previewAssert = {
        embedAlive: q('#preview-embed .xterm') !== null,
        killFrames: (frames.match(/in:kill/g) || []).length,
        socketOpen: window.__mockSockets.some((s) => s.readyState === 1),
      }
    },
    /* docker 面板（列表视图）：看容器卡片与动作条分组 */
    async 'docker-panel'() {
      const entry = await waitFor(() => q('[data-dsh-docker-entry]'), 4000)
      entry.click()
      await waitFor(() => q('.dk_panel'), 5000)
      await waitFor(() => qa('.dk_card').length >= 4, 5000)
      await sleep(350)
    },
    /* docker 面板（允许变更）：动作条右组可用的样子 */
    async 'docker-panel-rw'() {
      window.__PREVIEW_DOCKER_CONFIG.allowMutations = true
      await SCENARIOS['docker-panel']()
    },
    /* docker 面板 → 卡片「终端」→ 抽屉里的嵌入式终端 */
    async 'docker-exec'() {
      const entry = await waitFor(() => q('[data-dsh-docker-entry]'), 4000)
      entry.click()
      await waitFor(() => q('.dk_panel'), 5000)
      const card = await waitFor(() => qa('.dk_card')[0], 5000)
      // 卡片动作条第一个图标按钮就是「终端」（docker exec -it）
      card.querySelector('.dk_iconBtn').click()
      await waitFor(() => q('.dk_drawer'), 4000)
      await waitFor(() => q('.dk_drawerBody .xterm'), 4000)
      await sleep(700)
    },
    /* docker：终端抽屉 + 日志页共存，折叠只隐藏不结束会话（0.2.0 回归） */
    async 'docker-exec-logs'() {
      await SCENARIOS['docker-exec']()
      // 抽屉开着的同时进日志页：两边都得活着
      qa('.dk_card')[0].querySelectorAll('.dk_iconBtn')[1].click()
      await waitFor(() => q('.dk_logs'), 4000)
      await waitFor(() => q('.dk_drawerBody .xterm'), 4000)
      await sleep(300)
      const fold = await waitFor(() => q('.dk_drawerFold'), 3000)
      fold.click()
      await waitFor(() => q('.dk_drawer[data-collapsed="1"]'), 3000)
      await sleep(250)
      const termAliveWhenCollapsed = q('.dk_drawerBody .xterm') !== null
      const collapsedHeight = Math.round(q('.dk_drawer').getBoundingClientRect().height)
      fold.click()
      await waitFor(() => !q('.dk_drawer[data-collapsed="1"]'), 3000)
      await sleep(300)
      window.__previewAssert = {
        termAliveWhenCollapsed,
        collapsedHeight,
        expandedHeight: Math.round(q('.dk_drawer').getBoundingClientRect().height),
        logLines: document.querySelectorAll('.dk_logLine').length,
        sockets: window.__mockSockets.length,
      }
    },
    /* 右侧挂载位（ttyPanel.mountPane）：骨架 + 终端共存 */
    async 'dock-pane'() {
      await openPanel()
      const service = services.get('ttyPanel')
      if (service === undefined) throw new Error('ttyPanel 服务不存在')
      const pane = service.mountPane({ title: '演示侧栏', hint: 'ttyPanel v1', size: 420 })
      pane.element.innerHTML = '<div style="padding:16px;color:var(--tt-label-2);font-size:13px;line-height:1.8">'
        + '这块由消费插件自己 render（dsh-docker 的容器面板就走这里）。<br>'
        + '拖左边缘可调宽，标题栏右侧箭头可折叠，终端始终可见可用。</div>'
      await waitFor(() => q('.tt_dockPane'), 3000)
      await sleep(300)
      window.__previewAssert = {
        width: Math.round(q('.tt_dockPane').getBoundingClientRect().width),
        collapsed: pane.isCollapsed(),
        termVisible: q('.tt_term') !== null,
      }
    },
    /* 底部挂载位 + 终端重排：缩高度后视口必须钉在底部（输出不被顶上去） */
    async 'dock-pane-bottom'() {
      await openPanel()
      const el = tabs()[0]
      const sid = sidOf(el)
      let text = ''
      for (let i = 1; i <= 200; i += 1) text += 'line-' + i + '\r\n'
      text += 'END-OF-OUTPUT\r\n'
      emit({ t: 'data', sid, d: text })
      await sleep(400)
      const before = lastTermRowText()
      const rowsBefore = qa('.tt_term .xterm-rows > div').length
      const pane = services.get('ttyPanel').mountPane({ title: '演示底部面板', hint: 'side=bottom', side: 'bottom', size: 320 })
      pane.element.innerHTML = '<div style="padding:12px;color:var(--tt-label-2);font-size:13px">底部面板（等同 SFTP 落点）</div>'
      await waitFor(() => q('.tt_dockPane[data-side="bottom"]'), 3000)
      await sleep(600)
      const phaseA = {
        rowsAfter: qa('.tt_term .xterm-rows > div').length,
        after: lastTermRowText(),
        pinnedToBottom: lastTermRowText() === 'END-OF-OUTPUT',
        viewportAtBottom: (() => {
          const el2 = q('.tt_term .xterm-viewport')
          return el2 === null ? null : el2.scrollTop + el2.clientHeight >= el2.scrollHeight - 2
        })(),
      }
      // B) 翻在历史里时再改一次高度（折叠再展开）：视口停在原处，不该跳到别处
      const vp = q('.tt_term .xterm-viewport')
      vp.scrollTop = 0
      await sleep(250)
      const historyBefore = firstTermRowText()
      q('.tt_dockPaneFold').click()
      await sleep(350)
      q('.tt_dockPaneFold').click()
      await sleep(550)
      const historyAfter = firstTermRowText()
      window.__previewAssert = {
        before,
        rowsBefore,
        // A) 贴着底部开面板：最新一行必须还在视口里
        ...phaseA,
        // B) 翻在历史里改高度：视口锁在同几行
        historyBefore,
        historyAfter,
        historyStable: historyBefore === historyAfter,
        bodyH: Math.round(q('.tt_body').getBoundingClientRect().height),
        screenH: Math.round(q('.tt_term .xterm-screen').getBoundingClientRect().height),
        termH: Math.round(q('.tt_term').getBoundingClientRect().height),
      }
    },
    /* docker 面板挂进 tty 右侧 dock（连接栏「容器」→ 不盖住终端，0.16.0 端到端） */
    async 'docker-dock'() {
      await openPanel()
      await clickAdd()
      await clickMenuItem('prod-web-01')
      await waitFor(() => tabs().length === 2)
      await sleep(250)
      const btn = qa('.tt_connAct').find((b) => b.textContent.includes('容器'))
      if (btn === undefined) throw new Error('连接栏没有「容器」按钮')
      btn.click()
      await waitFor(() => q('.tt_dockPane'), 5000)
      await waitFor(() => qa('.tt_dockPaneBody .dk_card').length >= 3, 5000)
      await sleep(400)
      const before = {
        modalWidth: Math.round(q('.tt_modal').getBoundingClientRect().width),
        bodyWidth: Math.round(q('.tt_body').getBoundingClientRect().width),
        paneWidth: Math.round(q('.tt_dockPane').getBoundingClientRect().width),
      }
      // 折叠 → 终端拿回宽度；展开 → 恢复
      q('.tt_dockPaneFold').click()
      await sleep(300)
      const collapsed = {
        paneWidth: Math.round(q('.tt_dockPane').getBoundingClientRect().width),
        bodyWidth: Math.round(q('.tt_body').getBoundingClientRect().width),
        // 折叠只是 display:none，DOM（和消费插件的 React 树）必须还在
        bodyDisplay: getComputedStyle(q('.tt_dockPaneBody')).display,
      }
      q('.tt_dockPaneFold').click()
      await sleep(300)
      const expanded = { paneWidth: Math.round(q('.tt_dockPane').getBoundingClientRect().width) }
      window.__previewAssert = {
        docked: q('.tt_dockPaneBody .dk_panel[data-dock="1"]') !== null,
        modalBackdrop: q('.dk_backdrop') !== null,
        cards: qa('.tt_dockPaneBody .dk_card').length,
        before,
        collapsed,
        expanded,
        ttTerms: document.querySelectorAll('.tt_term').length,
      }
    },
    /* toast 提醒（并发上限） */
    async toast() {
      // 先开面板拿到首个标签，再进入「已达上限」状态（否则开面板本身就被拦下）
      await openPanel()
      window.__PREVIEW_AT_LIMIT = true
      await clickAdd()
      await clickMenuItem('本地终端', 'Local terminal')
      await waitFor(() => q('.tt_toast'))
      await sleep(200)
    },

    /*
     * D79：后台标签的 PTY 不得被压成 2×2。
     *
     * 现场（用户截图）：非活动标签的 scrollback 按 2 列折行（webpack 进度条竖排成一个
     * 字符一列），同一标签里较新的行却正常。根因是发帧侧只看 `proposeDimensions()`
     * 有没有返回 undefined，而三种不可见状态都能给出「有值但荒谬」的尺寸：
     *   - 别的标签正亮着（display:none）⇒ 容器 0 宽 0 高 ⇒ FitAddon 夹成 2×1；
     *   - agent 开的标签刻意不 switchTab ⇒ termEl 没进 DOM，但 `term.open(termEl)` 让
     *     `element.parentElement` 是游离的 termEl（truthy，骗过守卫）⇒ NaN；
     *   - 面板最小化。
     * NaN 被 JSON.stringify 写成 `null`，宿主 `Number(null)` = 0 是有限数 ⇒ 夹到下限 ⇒ 2×2。
     *
     * 夹具：面板里先有一个**用户自己的**活动标签，再由宿主**主动推**一帧 sessions
     * （`{t:'sessions', list:[{owner:'agent',…}]}`，真实宿主在 agent 开关会话后会推）。客户端
     * 采纳它成标签，但因为已有活动标签而**不切换**（`adoptAgentSessions` 刻意不抢焦点）
     * ⇒ 它的 `.tt_term` 一直没进 DOM；随后 mock 回 ready ⇒ 走的正是真实事故那条路径。
     * 断言：**没有任何**退化尺寸的 resize 帧；且点开该标签后必须补发一次合法尺寸
     * （证明门槛没把正常路径一起拦死）。
     */
    async 'resize-hidden'() {
      await openPanel() // 面板打开时会自带一个本地标签（用户那个活动标签）
      await waitFor(() => tabs().length === 1)
      // 宿主主动推 agent 会话（这个帧本来就是**推**的，不必等下一次 sessions 请求）
      const agentSession = { sid: 'agent-background', owner: 'agent', kind: 'local', cwd: window.__PREVIEW_CWD }
      window.__PREVIEW_AGENT_SESSIONS = [agentSession] // 后续 sessions 响应也带上它，别被当成已结束
      emit({ t: 'sessions', list: [agentSession] })
      await waitFor(() => tabs().length === 2)
      const agentTab = tabs().find((el) => sidOf(el) === 'agent-background')
      // 事故前提：两个标签，但文档里只有一个终端元素（agent 那个还没进 DOM）——
      // 夹具哪天不再复现这条路径，场景必须自己报错，而不是退化成永远绿的空断言。
      const hiddenWhileBackground = document.querySelectorAll('.tt_term').length === 1 && q('.tt_term').clientWidth > 0
      await sleep(300) // attach → ready → sendResize 跑完
      if (agentTab !== undefined) agentTab.click() // 切到它：变可见，PTY 必须拿到真实尺寸
      await sleep(300)
      window.__previewAssert = async () => {
        if (agentTab === undefined) return '没有采纳出 agent 标签（夹具失效）'
        if (!hiddenWhileBackground) return '夹具前提不成立：采纳时 agent 的终端元素已经可见（本场景失去意义）'
        if (document.querySelectorAll('.tt_term').length !== 2) return '切到该标签后终端元素仍不在文档里'
        const frames = () => window.__mockFrames || []
        const degenerate = frames().filter((f) => f.t === 'resize' && (!Number.isFinite(f.cols) || !Number.isFinite(f.rows) || f.cols < 20 || f.rows < 3))
        if (degenerate.length > 0) return '发出了退化尺寸的 resize 帧（后台标签被压扁）：' + JSON.stringify(degenerate)
        const spawns = frames().filter((f) => f.t === 'spawn' || f.t === 'ssh')
        const badSpawn = spawns.filter((f) => !Number.isFinite(f.cols) || f.cols < 20 || f.rows < 3)
        if (badSpawn.length > 0) return '以退化尺寸建会话：' + JSON.stringify(badSpawn)
        // 正面对照：切到该标签后必须有一次合法尺寸的 resize（否则 PTY 会停在旧尺寸）
        const sane = frames().filter((f) => f.t === 'resize' && f.sid === 'agent-background' && Number.isFinite(f.cols) && f.cols >= 20 && f.rows >= 3)
        if (sane.length === 0) return '切到该标签后没有补发合法尺寸（PTY 会停在旧尺寸）'
        return null
      }
    },

    /*
     * D85：只读保留（已退出）的会话不得被算进并发名额。
     *
     * 现场（用户截图）：面板里**一条标签都没有**（agent 开的会话都跑完/关掉了），点「+」
     * 却报「会话数已达上限（共 6 个 / 上限 4：本窗口 0 个 + 其他窗口 6 个）——关闭不用的
     * 窗口/标签」——而面板里根本没有标签可关，终端从此开不出来（只能等宿主重启）。
     * 那 6 条是 agent 跑完的一次性会话留下的**只读保留态**（D77：进程退出但输出还留着
     * 可读，宿主 `sessions` 帧里一直带着 `exited: true`，最多 16 条）。
     *
     * 夹具：`window.__PREVIEW_EXITED_SESSIONS` = 6 条 exited 会话（宿主 sessions 帧照原样回）。
     * 断言：点「+」→「本地终端」既不弹上限 toast，也必须**真的开出第二个标签**——
     * 后者是关键：光断言「没弹 toast」在夹具失效（列表压根没被查过）时也会绿。
     */
    async 'limit-retained'() {
      await openPanel()
      await waitFor(() => tabs().length === 1)
      window.__PREVIEW_EXITED_SESSIONS = Array.from({ length: 6 }, (_, i) => ({
        sid: 'retained-' + String(i + 1),
        owner: 'agent',
        kind: 'local',
        cwd: window.__PREVIEW_CWD,
        exited: true,
        exitCode: 0,
      }))
      await clickAdd()
      await clickMenuItem('本地终端', 'Local terminal')
      await sleep(600) // 上限预检（sessions 往返）→ addTab → spawn → ready
      window.__previewAssert = async () => {
        const list = window.__PREVIEW_EXITED_SESSIONS
        if (!Array.isArray(list) || list.length !== 6) return '夹具失效：没有 6 条只读保留态会话'
        if (!(window.__mockLog || []).includes('in:sessions')) return '夹具失效：客户端没查过 sessions 帧（走的不是上限预检这条路径）'
        const toast = q('.tt_toast')
        if (toast !== null) return '把只读保留的会话算成了并发名额：' + String(toast.textContent)
        if (tabs().length !== 2) return '新标签没开出来（被上限预检拦下）：共 ' + String(tabs().length) + ' 个标签'
        return null
      }
    },
    /*
     * 「+」新建按钮的位置（D89）——两半都要钉住：
     *   ① 标签不多时**紧贴最后一个标签**（用户明确不要「钉在头部最右端」那种）；
     *   ② 标签栏排满溢出时，它既不能被当成滚动内容滚走、也不能滚出可视区。
     * 夹具先量 ①（此时只有 1 个标签），再把面板压到 560px（真实宿主里这张卡片常挂在
     * 侧栏 / 插件页这种窄容器里）× 5 个标签强制溢出，量 ②。
     */
    async 'tab-add'() {
      window.__PREVIEW_CONFIG.maxSessions = 12
      await openPanel()
      await sleep(200)
      // ① 未溢出时的贴附间距（「+」左缘 - 最后一个标签右缘）应当就是容器自己的 gap
      const hug = (() => {
        const bar = q('.tt_tabs')
        const add = q('.tt_tabAdd')
        const last = qa('.tt_tab').pop()
        if (bar === null || add === null || last === undefined) return null
        return {
          overflow: bar.scrollWidth > bar.clientWidth + 1,
          gap: Math.round(add.getBoundingClientRect().left - last.getBoundingClientRect().right),
          edge: bar.dataset.edge ?? '',
        }
      })()
      modal().style.width = '560px'
      for (let i = 0; i < 4; i += 1) {
        await clickAdd()
        await clickMenuItem('本地终端', 'Local terminal')
        await waitFor(() => tabs().length === i + 2, 4000)
      }
      await sleep(250)
      const strip = q('.tt_tabs')
      // 先滚到底：用户截图里「+」正是被推到了这一头
      if (strip !== null) strip.scrollLeft = strip.scrollWidth
      await sleep(150)
      window.__previewAssert = async () => {
        if (hug === null) return '夹具失效：单标签时读不到标签栏 / 「+」/ 标签'
        if (hug.overflow) return '夹具失效：单标签时标签栏就溢出了，量不到「贴不贴」'
        if (hug.gap > 8) {
          return '「+」没有贴着页签：与最后一个标签相距 ' + String(hug.gap)
            + 'px（应等于容器自己的 gap；钉在头部最右端会长出几十上百 px）'
        }
        const bar = q('.tt_tabs')
        const add = q('.tt_tabAdd')
        if (bar === null || add === null) return '标签栏或「+」缺失'
        if (bar.contains(add)) return '「+」是滚动容器 .tt_tabs 的子元素（会被当成滚动内容一起滚走）'
        if (tabs().length < 5) return '夹具失效：只开出 ' + String(tabs().length) + ' 个标签'
        if (bar.scrollWidth <= bar.clientWidth + 1) {
          return '夹具失效：标签栏没有溢出（scrollWidth=' + String(bar.scrollWidth) + ' clientWidth=' + String(bar.clientWidth) + '）'
        }
        const head = q('.tt_header').getBoundingClientRect()
        const sample = (left) => {
          bar.scrollLeft = left
          const r = add.getBoundingClientRect()
          return { left: r.left, right: r.right }
        }
        const start = sample(0)
        const end = sample(bar.scrollWidth)
        if (Math.abs(end.left - start.left) > 0.5) {
          return '「+」跟着横向滚动走了：scrollLeft 0→' + String(Math.round(bar.scrollWidth))
            + ' 时从 x=' + String(Math.round(start.left)) + ' 挪到 x=' + String(Math.round(end.left))
        }
        if (end.right > head.right + 0.5 || end.left < head.left - 0.5) {
          return '「+」落在头部可视区外：x=' + String(Math.round(end.left))
            + '，头部 ' + String(Math.round(head.left)) + '–' + String(Math.round(head.right))
        }
        // ③ 原生滚动条必须已隐藏：不许再占一条高度（0.23.0 用户反馈的那根灰亮条）
        const chromeH = bar.offsetHeight - bar.clientHeight
        if (chromeH > 0) return '标签栏仍占着 ' + String(chromeH) + 'px 的原生滚动条高度（应隐藏）'
        // ④ 两侧渐隐：哪边还有内容哪边 fade；不溢出时**一个遮罩都不该有**
        if (hug.edge !== '') return '不溢出时不该有 data-edge（会白遮一条），实测 ' + hug.edge
        const maxLeft = bar.scrollWidth - bar.clientWidth
        const edgeAt = (left) => {
          bar.scrollLeft = left
          bar.dispatchEvent(new Event('scroll'))
          return bar.dataset.edge ?? ''
        }
        const atStart = edgeAt(0)
        const atMid = edgeAt(Math.round(maxLeft / 2))
        const atEnd = edgeAt(maxLeft)
        if (atStart !== 'end' || atMid !== 'both' || atEnd !== 'start') {
          return '溢出渐隐标记不对：scrollLeft 首/中/尾 → ' + atStart + '/' + atMid + '/' + atEnd + '（应为 end/both/start）'
        }
        // ⑤ 滚轮换轴：鼠标用户的纵向滚轮得能推着标签栏走，滚到头则不吞事件
        bar.scrollLeft = 0
        const wheelTo = (deltaY) => {
          const ev = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true })
          bar.dispatchEvent(ev)
          return { left: bar.scrollLeft, prevented: ev.defaultPrevented }
        }
        const moved = wheelTo(40)
        if (moved.left < 39 || moved.left > 41) return '滚轮没有换轴：deltaY=40 只滚到 ' + String(moved.left) + 'px'
        if (moved.prevented !== true) return '滚轮换轴时没有 preventDefault（页面会跟着一起滚）'
        bar.scrollLeft = maxLeft
        const stuck = wheelTo(40)
        if (stuck.left !== maxLeft || stuck.prevented !== false) {
          return '滚到尾部后仍在吞滚轮事件：scrollLeft=' + String(stuck.left) + ' prevented=' + String(stuck.prevented)
        }
        return null
      }
    },
    /*
     * 标签栏溢出时的「⋯」标签列表（0.23.0）——用户评审的三条结论都要钉住：
     *   ① 入口只在溢出时出现，且排在「+」**前面**（紧挨标签区右缘，被裁掉的标签就在那一侧）；
     *   ② 只列**看不见**的标签（看得见的就在标签栏上，再列一遍是噪音）——判据是「露出的宽度
     *      不足 TAB_VISIBLE_MIN_PX」，不是「整颗在窗口外」：后者会把只露一线的标签漏掉，
     *      于是它两边都不出现、凭空消失（**D90**，用户实测「有个隐藏的 tab 终端 3 看不到」）；
     *   ③ 点行即切、行内 ✕ 关掉标签后菜单保持打开（连着关几个）、Esc 关闭且不把面板最小化掉。
     * 夹具：先 1 个标签量「不该出现」，再压到 560px × 8 个标签造出「确实有标签被挤出视野」，
     * 最后把第 3 个标签精确挤成「只剩 3px」——D90 的现场。
     */
    async 'tab-list'() {
      window.__PREVIEW_CONFIG.maxSessions = 12
      await openPanel()
      await sleep(200)
      const moreAtOneTab = q('.tt_tabMore')
      // 量**渲染结果**而不是 `hidden` 属性：作者样式里的 display 会盖掉 UA 表那条
      // display:none（.tt_statsBar[hidden] 踩过同一个坑），只读属性是量不出来的
      const visibleAtOneTab = moreAtOneTab === null ? null : moreAtOneTab.getBoundingClientRect().width > 0
      // 「算看得见」的门槛：与 client-src 的 TAB_VISIBLE_MIN_PX 同一契约（两端渐隐带
      // 22px + 余量）。这里独立算一遍，好验出「实现漏掉了某一类标签」——
      // D90 就是这么漏的：只露几像素的标签躺在渐隐带里，两边都不认它。
      const MIN_VISIBLE = 40
      const visibleWidthOf = (el) => {
        const v = q('.tt_tabs').getBoundingClientRect()
        const r = el.getBoundingClientRect()
        return Math.max(0, Math.min(r.right, v.right) - Math.max(r.left, v.left))
      }
      const hiddenSids = () => qa('.tt_tab').filter((el) => visibleWidthOf(el) < MIN_VISIBLE).map((el) => el.dataset.sid)
      const openMenu = async () => {
        q('.tt_tabMore').click()
        await waitFor(() => q('.tt_tabMenu'))
        await sleep(120)
      }
      modal().style.width = '560px'
      for (let i = 0; i < 7; i += 1) {
        await clickAdd()
        await clickMenuItem('本地终端', 'Local terminal')
        await waitFor(() => tabs().length === i + 2, 4000)
      }
      await sleep(250)
      await openMenu()
      window.__previewAssert = async () => {
        const more = q('.tt_tabMore')
        const add = q('.tt_tabAdd')
        if (more === null || add === null) return '「⋯」或「+」入口缺失'
        if (visibleAtOneTab !== false) return '标签栏不溢出时「⋯」不该可见（实测可见=' + String(visibleAtOneTab) + '）'
        if (more.getBoundingClientRect().width <= 0) return '标签栏已溢出，但「⋯」没有渲染出来'
        // ① 位置：紧挨标签区的应该是「⋯」，「+」排在它右边（跟工具按钮一排）
        if (more.getBoundingClientRect().left > add.getBoundingClientRect().left) return '「⋯」应该排在「+」前面'
        const menu = q('.tt_tabMenu')
        if (menu === null) return '标签列表没打开'
        // ② 摆出 D90 的现场：把第 3 个标签只推出「露出 3px」（不是全隐、也不是全显）。
        // 它躺在左端的渐隐带里，肉眼看不见 —— 这时它必须在列表里。
        const bar = q('.tt_tabs')
        const slim = qa('.tt_tab')[2]
        if (slim === undefined) return '夹具失效：标签不足 3 个'
        const slimName = slim.querySelector('.tt_tabLabel').textContent
        bar.scrollLeft += (slim.getBoundingClientRect().right - bar.getBoundingClientRect().left) - 3
        bar.dispatchEvent(new Event('scroll')) // 让实现按新的滚动位置重算
        await sleep(80)
        const slimWidth = Math.round(visibleWidthOf(slim))
        if (slimWidth > 8) return '夹具失效：没把「' + slimName + '」挤到只剩一线（实测露出 ' + String(slimWidth) + 'px）'
        if (hiddenSids().indexOf(slim.dataset.sid) < 0) return '夹具失效：连判据都不认它隐藏'
        if (qa('.tt_tabMenuRow').map((row) => row.dataset.sid).indexOf(slim.dataset.sid) < 0) {
          return '只露出 ' + String(slimWidth) + 'px 的「' + slimName + '」既看不见、也不在列表里（D90 原样复现）'
        }
        // ③ 内容：恰好是「看不见的」那些标签，顺序与标签栏一致
        const want = hiddenSids()
        if (want.length === 0) return '夹具失效：没有看不见的标签，本场景验不了「只列隐藏的」'
        const rows = qa('.tt_tabMenuRow')
        if (rows.map((row) => row.dataset.sid).join('|') !== want.join('|')) {
          return '列表内容 ≠ 看不见的标签：列表 [' + rows.map((row) => row.dataset.sid).join(', ')
            + ']，实际隐藏 [' + want.join(', ') + ']'
        }
        // ④ 一个都不能丢、也不能多：每个标签要么在栏上真的看得见、要么在列表里
        for (const el of qa('.tt_tab')) {
          const sid = el.dataset.sid
          const name = el.querySelector('.tt_tabLabel').textContent
          const shown = visibleWidthOf(el) >= MIN_VISIBLE
          const listed = rows.some((row) => row.dataset.sid === sid)
          if (!shown && !listed) return '「' + name + '」既看不见也不在列表里（凭空消失）'
          if (shown && listed) return '「' + name + '」看得见却被列进了列表'
        }
        for (let i = 0; i < rows.length; i += 1) {
          const bar = q('.tt_tab[data-sid="' + rows[i].dataset.sid + '"]')
          if (bar === null) return '第 ' + String(i + 1) + ' 行指向一个不存在的标签'
          const rowState = rows[i].querySelector('.tt_tabDot').dataset.state
          const barState = bar.querySelector('.tt_tabDot').dataset.state
          if (rowState !== barState) return '第 ' + String(i + 1) + ' 行状态点与标签栏不一致：' + rowState + ' vs ' + barState
        }
        // 当前标签**隐藏时**才高亮；它看得见时列表里不该有任何高亮行
        const activeBar = q('.tt_tab[data-active]')
        if (activeBar === null) return '夹具失效：标签栏里没有活动标签'
        const activeRow = menu.querySelector('.tt_tabMenuItem[data-active]')
        const activeHidden = want.indexOf(activeBar.dataset.sid) >= 0
        if (activeHidden && activeRow === null) return '当前标签是隐藏的，列表里却没高亮'
        if (!activeHidden && activeRow !== null) return '当前标签看得见，列表里不该有高亮行'
        // 行内 ✕：关掉一个标签，菜单原地保留、内容按新的可见情况重算
        const before = tabs().length
        rows[0].querySelector('.tt_addMenuEdit').click()
        await sleep(250)
        if (q('.tt_tabMenu') === null) return '行内 ✕ 关掉标签后菜单也关了（应保持打开，方便连着关几个）'
        if (tabs().length !== before - 1) return '行内 ✕ 没关掉标签：' + String(before) + ' → ' + String(tabs().length)
        if (qa('.tt_tabMenuRow').map((row) => row.dataset.sid).join('|') !== hiddenSids().join('|')) {
          return '关完没有按新的可见情况重渲染列表'
        }
        // 点一行 → 切过去（标签栏会把它滚进视野）+ 菜单关闭
        const firstRow = qa('.tt_tabMenuRow')[0]
        if (firstRow === undefined) return '夹具失效：列表空了'
        const wantSid = firstRow.dataset.sid
        firstRow.querySelector('.tt_tabMenuItem').click()
        await sleep(250)
        if (q('.tt_tabMenu') !== null) return '选了一个标签后菜单没关'
        const afterActive = q('.tt_tab[data-active]')
        if (afterActive === null) return '切换之后标签栏没有活动标签'
        if (afterActive.dataset.sid !== wantSid) {
          return '没切到选中的标签：当前 ' + afterActive.dataset.sid + '，选的是 ' + wantSid
        }
        // Esc 关闭，且不许把面板最小化掉（浮层要先吃掉这个 Esc）
        await openMenu()
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await sleep(200)
        if (q('.tt_tabMenu') !== null) return 'Esc 没关掉标签列表'
        if (isMinimized()) return 'Esc 把面板最小化了（浮层该先把它吃掉）'
        await openMenu() // 截图留一个「列表开着」的样子
        return null
      }
    },

    /*
     * AI 辅助「失败即解释」（0.24.0）——「零输入入口」这条链路的完整走查。
     *
     * 钉五件事，其中三条带**反向对照**：
     *   ① 开关**默认关**时，同样一帧 hint 什么都不点亮（默认关 = 界面上根本没这个功能）；
     *   ② 打开后徽标才出现，且**点它才发请求**——那一步会把终端内容送出本机，不许自动发；
     *   ③ 答案原样显示：模型输出是**不可信文本**，`<b>` 必须当字面量（走 textContent）；
     *   ④ 「填入」写进 PTY 的字节 = Ctrl-U + 命令，**结尾不带 \r/\n**（填进去 ≠ 跑起来）；
     *   ⑤ Esc 只收浮层，不许把整个面板最小化。
     */
    async 'tty-assist'() {
      await openPanel()
      await waitFor(() => tabs().length === 1)
      const sid = sidOf(activeTabEl())
      const badge = () => q('.tt_assistBadge')
      const badgeShown = () => {
        const el = badge()
        return el !== null && el.hidden !== true && el.getBoundingClientRect().width > 0
      }
      const asked = () => (window.__mockLog || []).filter((line) => line === 'fetch:assist').length
      const fail = (why) => why

      // ① 默认关：同样一帧 hint 什么都不该点亮
      emit({ t: 'hint', sid, kind: 'failure', exitCode: 2, at: Date.now() })
      await sleep(250)
      const shownWhileOff = badgeShown()
      // 打开开关走**真实路径**（点「+」会顺手刷 /api/dsh-tty/config），不是直接塞缓存
      window.__PREVIEW_CONFIG.assistEnabled = true
      await clickAdd()
      q('.tt_tabAdd').click()
      await sleep(250)

      // ② 徽标出现，且此刻**还没有**任何 assist 请求
      emit({ t: 'hint', sid, kind: 'failure', exitCode: 2, at: Date.now() })
      await sleep(250)
      const shownWhileOn = badgeShown()
      const askedBeforeClick = asked()
      const badgeText = badge() === null ? '' : badge().textContent

      if (badge() !== null) badge().click()
      await waitFor(() => q('.tt_assistMenu') !== null, 3000)
      await sleep(300)
      const answerEl = q('.tt_assistAnswer')
      const answerText = answerEl === null ? '' : answerEl.textContent
      const answerHasMarkup = answerEl !== null && answerEl.querySelector('b') !== null
      const cmdText = q('.tt_assistCmd') === null ? '' : q('.tt_assistCmd').textContent
      /*
       * 美化这一轮（2026-10-01）：徽标与命令块都拆成了「外层容器 + 内层节点」。徽标多了一枚
       * 状态圆点，而 syncAssistBadge 原来是直接写按钮的 textContent —— 那样会把圆点整个抹掉，
       * 所以这里按**节点存在性**盯着，而不是只看文字对不对。
       */
      const badgeDot = badge() === null ? null : badge().querySelector('.tt_assistDot')
      const badgeTextEl = badge() === null ? null : badge().querySelector('.tt_assistBadgeText')
      const exitChip = q('.tt_assistCode')
      const cmdLabel = q('.tt_assistCmdLabel')

      // ④ 「填入」的字节（先清帧，只留这一次点击的）
      window.__mockFrames.length = 0
      const fillBtn = q('.tt_assistFill')
      if (fillBtn !== null) fillBtn.click()
      await sleep(200)
      const inputs = (window.__mockFrames || []).filter((frame) => frame.t === 'input')

      // ⑤ 再来一轮：Esc 只收浮层
      emit({ t: 'hint', sid, kind: 'failure', exitCode: 1, at: Date.now() })
      await sleep(200)
      if (badge() !== null) badge().click()
      await waitFor(() => q('.tt_assistMenu') !== null, 3000)
      await sleep(250)
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await sleep(250)
      const menuAfterEsc = q('.tt_assistMenu')
      const minimized = isMinimized()

      // 宿主说「没有可用的模型路由」时：浮层里要有一句能照做的原因，不许静默什么都不发生
      window.__PREVIEW_ASSIST = { error: '没有可用的模型路由：在卡片里填 provider / model，或先给宿主配一个默认模型' }
      emit({ t: 'hint', sid, kind: 'failure', exitCode: 2, at: Date.now() })
      await sleep(200)
      if (badge() !== null) badge().click()
      await waitFor(() => q('.tt_assistMenu') !== null, 3000)
      await sleep(300)
      const errorText = q('.tt_assistError') === null ? '' : q('.tt_assistError').textContent
      // 失败态也要有出路（tty D92）：底部那排按钮（复制报错 / 关闭）——只有一行红字、没有按钮的浮层是死路
      const errorFoot = q('.tt_assistFoot')
      const errorButtons = errorFoot === null ? 0 : errorFoot.querySelectorAll('button').length
      const errorCloses = errorFoot === null ? null : errorFoot.querySelector('.tt_assistClose')
      /*
       * **长答案**：浮层会在内容到达后长高。只按「转圈时的高度」定位一次的话，底部那排
       * 按钮会被推出视口（用户看得到答案、点不到「填入」）——真机截图暴露过。
       * 短答案区分不出来（两种做法都放得下），所以这一段刻意用长正文把差异逼出来。
       */
      window.__PREVIEW_ASSIST = {
        answer: '发生了什么：' + '这是一段很长的说明，用来把浮层撑高。'.repeat(5)
          + '\n\n下一步：\n' + Array.from({ length: 14 }, (_v, i) => '第 ' + String(i + 1) + ' 行：继续补充上下文，直到正文超过自己的高度上限。').join('\n'),
        command: 'npm install',
      }
      emit({ t: 'hint', sid, kind: 'failure', exitCode: 2, at: Date.now() })
      await sleep(200)
      if (badge() !== null) badge().click()
      await waitFor(() => q('.tt_assistAnswer') !== null, 3000)
      await sleep(300)
      const longMenu = q('.tt_assistMenu')
      const longBox = longMenu === null ? null : longMenu.getBoundingClientRect()
      const longBody = q('.tt_assistBody')
      const longScrolled = longBody !== null && longBody.scrollHeight > longBody.clientHeight + 1
      // 恢复默认答案，让截图里留一个「有答案」的样子
      delete window.__PREVIEW_ASSIST
      emit({ t: 'hint', sid, kind: 'failure', exitCode: 2, at: Date.now() })
      await sleep(200)
      if (badge() !== null) badge().click()
      await waitFor(() => q('.tt_assistAnswer') !== null, 3000)
      await sleep(200)

      /*
       * ⑥ 同一条失败**只问一次**（tty D94）：Esc 收掉浮层后再点徽标，应该直接显示缓存答案，
       * 而不是又发一次请求（POST 早已送达宿主，abort 只停客户端这头，宿主照跑模型）。
       */
      const askedBeforeReopen = asked()
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await sleep(150)
      if (badge() !== null) badge().click()
      await waitFor(() => q('.tt_assistAnswer') !== null, 3000)
      await sleep(200)
      const askedAfterReopen = asked()
      const reopenedAnswer = q('.tt_assistAnswer') === null ? '' : q('.tt_assistAnswer').textContent

      window.__previewAssert = async () => {
        if (sid === undefined || sid === null) return fail('夹具失效：读不到活动标签的 sid')
        if (shownWhileOff) return fail('开关默认关着，hint 帧却点亮了徽标（默认关 = 界面上不该有它）')
        if (!shownWhileOn) return fail('开关打开后徽标没出现（功能等于不存在）')
        if (badgeText.indexOf('2') < 0) return fail('徽标没写出退出码：' + badgeText)
        if (askedBeforeClick !== 0) return fail('点徽标之前就发了 ' + String(askedBeforeClick) + ' 次 assist 请求（终端内容被自动外发）')
        if (asked() === 0) return fail('点了徽标却没发请求')
        if (answerHasMarkup) return fail('答案里的 <b> 被当成 HTML 解析了（模型输出是不可信文本）')
        // 宿主给什么就显示什么（一个字都不许被客户端顺手改掉/解释掉）
        const expectedAnswer = '发生了什么：<b>这不是加粗</b>，是输出里的原文；依赖装漏了一个。\n\n下一步：\n装完再跑一次。'
        if (answerText !== expectedAnswer) {
          return fail('正文与宿主给的文本不一致：' + JSON.stringify(answerText))
        }
        // 命令块里**只许有命令**（小标题在外层）：混进标题，「填入」就会把标题一起敲进终端
        if (cmdText !== 'npm install') return fail('命令块里不止有命令：' + JSON.stringify(cmdText))
        if (cmdLabel === null || cmdLabel.textContent === '') return fail('建议命令块没有小标题')
        if (badgeDot === null) return fail('徽标里没有状态圆点（多半是被 syncAssistBadge 的 textContent 抹掉了）')
        if (badgeTextEl === null) return fail('徽标文案没落在内层 span 上')
        if (exitChip === null || exitChip.textContent.indexOf('2') < 0) {
          return fail('退出码药丸没渲染出来：' + (exitChip === null ? 'null' : exitChip.textContent))
        }
        if (inputs.length !== 1) return fail('「填入」发出的 input 帧数不对：' + String(inputs.length))
        if (inputs[0].d !== '\u0015npm install') return fail('「填入」的字节不对：' + JSON.stringify(inputs[0].d))
        if (menuAfterEsc !== null) return fail('Esc 没关掉答案浮层')
        if (minimized) return fail('Esc 把整个面板最小化了（浮层该先把它吃掉）')
        if (errorText.indexOf('没有可用的模型路由') < 0) return fail('宿主报错时浮层没说明原因：' + errorText.slice(0, 80))
        if (errorCloses === null || errorButtons !== 2) {
          return fail('失败态浮层没有可用的按钮（只剩 Esc / 点外面）：按钮数=' + String(errorButtons))
        }
        const shot = q('.tt_assistMenu')
        if (shot === null) return fail('截图态没有浮层')
        const box = shot.getBoundingClientRect()
        if (box.bottom > window.innerHeight - 4 || box.top < 4) {
          return fail('答案浮层超出视口（底部按钮点不到）：top=' + String(Math.round(box.top))
            + ' bottom=' + String(Math.round(box.bottom)) + ' 视口高=' + String(window.innerHeight))
        }
        if (longScrolled !== true) return fail('夹具失效：长答案没有被正文高度上限约束（区分不出定位问题）')
        if (longBox === null) return fail('长答案那一轮没有浮层')
        if (longBox.bottom > window.innerHeight - 4 || longBox.top < 4) {
          return fail('长答案把浮层顶出视口（底部按钮点不到）：top=' + String(Math.round(longBox.top))
            + ' bottom=' + String(Math.round(longBox.bottom)) + ' 视口高=' + String(window.innerHeight))
        }
        if (askedAfterReopen !== askedBeforeReopen) {
          return fail('重开浮层又发了 ' + String(askedAfterReopen - askedBeforeReopen) + ' 次请求（同一条失败只该问一次）')
        }
        if (reopenedAnswer.indexOf('发生了什么') < 0) return fail('重开浮层没显示缓存答案：' + reopenedAnswer.slice(0, 60))
        if (q('.tt_assistFill') === null) return fail('浮层里没有「填入」按钮')
        if (q('.tt_assistAnswer') === null) return fail('截图态没停在「有答案」上（夹具失效）')
        return null
      }
    },

  }

  const name = new URLSearchParams(location.search).get('scenario') || 'local'
  const run = SCENARIOS[name]
  window.__previewState = { name, done: false, error: null }
  const promise = (run ? run() : Promise.reject(new Error('未知场景：' + name)))
    .then(() => {
      window.__previewState.done = true
      return name
    })
    .catch((error) => {
      window.__previewState.error = String((error && error.message) || error)
      window.__previewState.done = true
      throw error
    })
  window.__previewDiag = () => {
    const rect = (sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) }
    }
    return {
      scenario: name,
      modal: rect('.tt_modal'),
      sftp: rect('.tt_sftpCard') || rect('.tt_sftpDualCard'),
      ssh: rect('.tt_sshCard'),
      // 分组标签与状态带：核对「选项」不再重复、试连结果落在定高状态带里
      sshSections: [...document.querySelectorAll('.tt_sshSection')].map((el) => el.textContent),
      sshStatus: (() => {
        const band = document.querySelector('.tt_sshStatus')
        if (!band) return null
        return {
          h: Math.round(band.getBoundingClientRect().height),
          error: band.querySelector('.tt_sshError')?.textContent || '',
          probe: band.querySelector('.tt_sshProbeResult')?.textContent || '',
        }
      })(),
      addMenu: rect('.tt_addMenu'),
      toast: rect('.tt_toast'),
      dock: rect('.tt_dock'),
      tabs: document.querySelectorAll('.tt_tab').length,
      rows: document.querySelectorAll('.tt_sftpRow').length,
      // 终端渲染自检：xterm 是否真的画出了字符
      term: {
        sockets: window.__mockSockets.length,
        frames: (window.__mockLog || []).slice(-10).join(' '),
        xtermEls: document.querySelectorAll('.tt_term .xterm').length,
        canvases: document.querySelectorAll('.tt_term canvas').length,
        rowCount: document.querySelectorAll('.tt_term .xterm-rows > div').length,
        text: (document.querySelector('.tt_term .xterm-rows')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
        screenText: (() => {
          const el = document.querySelector('.tt_term .xterm-screen')
          return el ? el.getBoundingClientRect().width + 'x' + Math.round(el.getBoundingClientRect().height) : null
        })(),
      },
      docker: {
        panel: document.querySelector('.dk_panel') !== null,
        cards: document.querySelectorAll('.dk_card').length,
        // 卡片动作条：分组、间距、配色（用来核对「查看 / 变更」两组的划分）
        actionBar: (() => {
          const bar = document.querySelector('.dk_actionBar')
          if (!bar) return null
          return [...bar.children].map((el) => {
            const box = el.getBoundingClientRect()
            const style = getComputedStyle(el)
            return {
              cls: el.classList.contains('dk_actionBarSep') ? 'SEP' : el.className.replace('dk_iconBtn', 'btn').trim(),
              x: Math.round(box.x),
              w: Math.round(box.width),
              gapBefore: el.previousElementSibling === null ? null : Math.round(box.x - el.previousElementSibling.getBoundingClientRect().right),
              color: style.color,
              disabled: el.disabled === true,
            }
          })
        })(),
        drawer: !!rect('.dk_drawer'),
        drawerTerm: document.querySelector('.dk_drawerBody .xterm') !== null,
        drawerText: (document.querySelector('.dk_drawerBody .xterm-rows')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
      },
      embed: {
        host: document.querySelector('#preview-embed .xterm') !== null,
        text: (document.querySelector('#preview-embed .xterm-rows')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
      },
      assert: window.__previewAssert ?? null,
      bodyChildren: [...document.body.children].map((el) => el.className || el.tagName).slice(0, 12),
      // 样式自检：浏览器实际解析出的规则数（与 tty.css 的规则数比对，能发现
      // 语法错误导致的静默丢弃——esbuild 的 text loader 不解析 CSS）
      cssRules: (() => {
        const sheet = document.getElementById('dsh-tty-style')?.sheet
        if (!sheet) return null
        const count = (rules) => [...rules].reduce((n, r) => n + 1 + (r.cssRules ? count(r.cssRules) : 0), 0)
        try {
          return count(sheet.cssRules)
        } catch {
          return 'blocked'
        }
      })(),
      // 主题自检：确认暗色 token 真的生效（截图颜色异常时先看这里）
      theme: {
        darkAttr: document.body.hasAttribute('data-ds-dark-theme'),
        bgBase: getComputedStyle(document.body).getPropertyValue('--dsw-alias-bg-base').trim(),
        layer2: getComputedStyle(document.body).getPropertyValue('--dsw-alias-bg-layer-2').trim(),
        headerBg: getComputedStyle(document.querySelector('.tt_header') || document.body).backgroundImage.slice(0, 80),
      },
    }
  }
  window.__previewReady = promise
  window.__preview = { sleep, waitFor, openPanel, clickAdd, clickMenuItem, feed, emit, tabs, modal, cards, scenarios: Object.keys(SCENARIOS) }
})()
