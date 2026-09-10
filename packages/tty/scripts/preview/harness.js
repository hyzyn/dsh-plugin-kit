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
        getSnapshot: () => ({
          byId: { s1: { cwd: window.__PREVIEW_CWD || '/home/user/project' } },
          current: 's1',
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
  const emit = (msg) => {
    const s = socket()
    if (s) s._deliver(msg)
  }

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
  const clickMenuItem = async (label) => {
    const item = await waitFor(() => qa('.tt_addMenuItem').find((el) => el.textContent.includes(label)))
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
    /* 单标签本地终端 */
    async local() {
      await openPanel()
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
      await clickMenuItem('本地终端')
      await waitFor(() => tabs().length === 4)
      tabs()[1].click()
      await sleep(250)
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
      await clickMenuItem('SSH 连接…')
      await waitFor(() => q('.tt_sshCard'))
      await sleep(150)
    },
    /* SSH 连接对话框：跑一次「试连」并展示结果（验证状态带不撑动布局） */
    async 'ssh-probe'() {
      await openPanel()
      await clickAdd()
      await clickMenuItem('SSH 连接…')
      await waitFor(() => q('.tt_sshCard'))
      const inputs = qa('.tt_sshCard input')
      inputs[0].value = '192.168.80.248'
      inputs[1].value = '22'
      inputs[2].value = 'root'
      const probeBtn = qa('.tt_sshActions .tt_toolBtn').find((b) => b.textContent.includes('试连'))
      probeBtn.click()
      const resultEl = () => q('.tt_sshProbeResult')
      await waitFor(() => resultEl() && resultEl().textContent !== '' && !resultEl().textContent.includes('测试中'))
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
      const editBtn = rows[1].querySelector('.tt_addMenuEdit[title="编辑连接"]')
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
    /* 会话退出遮罩 */
    async exited() {
      await openPanel()
      const el = activeTabEl()
      emit({ t: 'exit', sid: sidOf(el), code: 0 })
      await sleep(200)
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
      const btn = qa('.tt_connAct').find((b) => b.textContent.includes('隧道'))
      if (btn) btn.click()
      await waitFor(() => q('.tt_tunnelPop'))
      await sleep(300)
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
      await clickMenuItem('本地终端')
      await waitFor(() => q('.tt_toast'))
      await sleep(200)
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
