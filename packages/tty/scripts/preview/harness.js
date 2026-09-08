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
    throw new Error('预览夹具未提供模块：' + name)
  }
  const exports = mod.factory(requireShim)
  const cards = []
  const ctx = {
    sessions: {
      list: {
        getSnapshot: () => ({
          byId: { s1: { cwd: '/Users/czz/coding/webproject/deepseek-harness/dsh-plugin-kit' } },
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
  }
  exports.apply(ctx)

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
    /* SFTP 单窗体 */
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
    },
    /* SFTP 双栏 */
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
