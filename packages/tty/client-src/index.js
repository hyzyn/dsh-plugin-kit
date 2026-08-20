/* eslint-disable */
/**
 * @hyzyn/dsh-tty — 浏览器半体：侧边栏「终端」入口 + 大弹窗 xterm 面板。
 * 由 scripts/build-client.mjs 用 esbuild 打包为单文件 IIFE（xterm 内核随
 * bundle 分发），经 window.__ModuleLoader__.load 注册。
 *
 * v0.2 能力：
 *   - 多会话标签页（每标签一个 sid 的 xterm 实例，可切换/关闭/新建）
 *   - 新标签默认在当前会话工作目录打开（注入 sessions 客户端服务）
 *   - 便利功能：终端内搜索（Ctrl+F）、可点击链接、清屏/复制/粘贴按钮
 * 帧协议与宿主半体（src/index.ts）对齐：spawn/input/resize/kill ↔ ready/data/exit/error。
 */
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import xtermCss from '@xterm/xterm/css/xterm.css'

/* ================================ CSS ================================ */

const CSS = [
  '.tt_sidebarEntry{width:100%;height:32px;color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap;background:0 0;border:none;border-radius:8px;align-items:center;gap:8px;padding:0 12px;font-size:13px;display:flex}',
  '.tt_sidebarEntry:hover{background:var(--dsw-specific-sidebar-nav-item-hover);color:var(--dsw-alias-label-primary)}',
  '.tt_sidebarEntry[data-active]{background:var(--dsw-specific-sidebar-nav-item-active);color:var(--dsw-alias-label-primary);font-weight:600}',
  '.tt_sidebarEntryIcon{flex:none;justify-content:center;align-items:center;display:inline-flex}',
  '.tt_sidebarEntryLabel{text-overflow:ellipsis;overflow:hidden}',
  '[data-dsh-frame][data-sidebar-collapsed] .tt_sidebarEntry{justify-content:center;width:100%;padding:0}',
  '[data-dsh-frame][data-sidebar-collapsed] .tt_sidebarEntryLabel{display:none}',
  '.tt_modalBackdrop{z-index:1300;background:var(--dsw-alias-bg-mask-1);justify-content:center;align-items:flex-start;display:flex;position:fixed;inset:0;padding-top:5vh}',
  '.tt_modal{background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);width:min(1180px,96vw);height:min(84vh,920px);box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary);border-radius:14px;flex-direction:column;gap:0;display:flex;overflow:hidden}',
  '.tt_header{flex:none;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);display:flex}',
  '.tt_title{flex:1;margin:0;font-size:14px;font-weight:600;white-space:nowrap;align-items:center;gap:8px;display:flex}',
  '.tt_status{font-size:11px;color:var(--dsw-alias-label-tertiary);align-items:center;gap:6px;display:flex;white-space:nowrap}',
  '.tt_statusDot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-label-tertiary);flex:none}',
  '.tt_statusDot[data-state=connected]{background:var(--dsw-alias-state-success-primary)}',
  '.tt_statusDot[data-state=error]{background:var(--dsw-alias-state-error-primary)}',
  '.tt_toolBtn{appearance:none;background:0 0;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);border-radius:8px;height:28px;padding:0 10px;cursor:pointer;font-size:12px;flex:none;white-space:nowrap}',
  '.tt_toolBtn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}',
  '.tt_searchInput{width:120px;height:28px;background:var(--dsw-specific-input-major);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;color:inherit;font:inherit;font-size:12px;padding:0 8px;flex:none}',
  '.tt_searchInput:focus{border-color:var(--dsw-alias-state-business-primary);outline:none}',
  '.tt_close{appearance:none;background:0 0;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);border-radius:8px;width:30px;height:30px;cursor:pointer;font-size:16px;line-height:1;flex:none}',
  '.tt_close:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}',
  '.tt_tabbar{flex:none;display:flex;align-items:center;gap:6px;padding:6px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);overflow-x:auto}',
  '.tt_tab{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 8px 0 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:12px;cursor:pointer;flex:none;white-space:nowrap}',
  '.tt_tab:hover{color:var(--dsw-alias-label-primary)}',
  '.tt_tab[data-active]{background:var(--dsw-specific-sidebar-nav-item-active);color:var(--dsw-alias-label-primary);font-weight:600}',
  '.tt_tabClose{appearance:none;background:0 0;border:none;color:inherit;cursor:pointer;font-size:13px;line-height:1;padding:0 2px}',
  '.tt_tabClose:hover{color:var(--dsw-alias-state-error-primary)}',
  '.tt_tabAdd{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:1px dashed var(--dsw-alias-border-l2);border-radius:8px;background:0 0;color:var(--dsw-alias-label-secondary);font-size:16px;cursor:pointer;flex:none}',
  '.tt_tabAdd:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-secondary)}',
  '.tt_body{flex:1;min-height:0;position:relative;background:#0d1117;overflow:hidden}',
  '.tt_term{position:absolute;inset:0;padding:8px 10px}',
  '.tt_term .xterm{height:100%}',
  '.tt_overlay{position:absolute;inset:0;align-items:center;justify-content:center;background:rgba(0,0,0,.55);color:#e6edf3;font-size:13px;cursor:pointer;display:flex;z-index:5}',
  '.tt_overlay:empty{display:none}',
].join('\n')

/* ================================ 基础工具 ================================ */

const WS_PATH = '/api/dsh-tty/ws'

function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return proto + '//' + location.host + WS_PATH
}

function newSid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

let styleEl
function ensureStyle() {
  if (document.getElementById('dsh-tty-style')) return
  styleEl = document.createElement('style')
  styleEl.id = 'dsh-tty-style'
  styleEl.textContent = CSS + '\n' + xtermCss
  document.head.appendChild(styleEl)
}

/* ================================ 终端面板 ================================ */

const TERMINAL_ICON =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5l3.5 3L3 11"/><path d="M8.5 11H13"/></svg>'

let sessionsService = null
let socket = null
let modalEl = null
let statusEl = null
let statusDotEl = null
let tabbarEl = null
let bodyEl = null
let searchInputEl = null
let bodyOverlayEl = null
let intentionalClose = false
let resizeObserver = null

/** sid → 标签页 */
const tabs = new Map()
let activeSid = null
let tabCounter = 0
let connecting = false

function setStatus(text, state) {
  if (statusEl === null) return
  statusEl.textContent = text
  statusDotEl.dataset.state = state
}

function sendFrame(msg) {
  if (socket !== null && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg))
  }
}

function activeTab() {
  return activeSid !== null ? tabs.get(activeSid) : undefined
}

/** 当前 DSH 会话的工作目录（sessions 客户端服务快照）。 */
function currentCwd() {
  try {
    const snapshot = sessionsService?.list?.getSnapshot?.()
    const cwd = snapshot?.byId?.[snapshot?.current]?.cwd
    return typeof cwd === 'string' && cwd !== '' ? cwd : undefined
  } catch {
    return undefined
  }
}

function sendResize(tab) {
  if (tab === undefined || tab.fit === undefined) return
  const dims = tab.fit.proposeDimensions()
  if (dims !== undefined) sendFrame({ t: 'resize', sid: tab.sid, cols: dims.cols, rows: dims.rows })
}

function showTabOverlay(tab, text) {
  if (tab.overlayEl === null || tab.overlayEl === undefined) return
  tab.overlayEl.textContent = text
}

function createTerminal(tab) {
  const term = new Terminal({
    cursorBlink: true,
    fontSize: 13,
    fontFamily: '"SF Mono", Menlo, Consolas, "Courier New", monospace',
    scrollback: 5000,
    convertEol: false,
  })
  const fit = new FitAddon()
  const search = new SearchAddon()
  term.loadAddon(fit)
  term.loadAddon(search)
  term.loadAddon(new WebLinksAddon())

  const termEl = document.createElement('div')
  termEl.className = 'tt_term'
  const overlayEl = document.createElement('div')
  overlayEl.className = 'tt_overlay'
  overlayEl.addEventListener('click', () => {
    overlayEl.textContent = ''
    respawnTab(tab.sid)
  })
  termEl.appendChild(overlayEl)

  term.open(termEl)
  try {
    fit.fit()
  } catch {
    /* 容器尚未布局完成时忽略 */
  }

  term.onData((data) => {
    sendFrame({ t: 'input', sid: tab.sid, d: data })
  })
  term.attachCustomKeyEventHandler((event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault()
      toggleSearch()
      return false
    }
    return true
  })

  tab.term = term
  tab.fit = fit
  tab.search = search
  tab.termEl = termEl
  tab.overlayEl = overlayEl
}

/** 新建标签页并 spawn。 */
function addTab() {
  const sid = newSid()
  const tab = { sid, term: null, fit: null, search: null, termEl: null, overlayEl: null, exited: false }
  createTerminal(tab)
  tabs.set(sid, tab)
  tabCounter += 1
  renderTabbar()
  switchTab(sid)
  const dims = tab.fit.proposeDimensions()
  sendFrame({
    t: 'spawn',
    sid,
    cols: dims !== undefined ? dims.cols : 80,
    rows: dims !== undefined ? dims.rows : 24,
    cwd: currentCwd(),
  })
  return tab
}

/** 退出后重开：换新 sid 重新 spawn（保留标签位）。 */
function respawnTab(oldSid) {
  const old = tabs.get(oldSid)
  if (old === undefined) return
  if (!old.exited) sendFrame({ t: 'kill', sid: oldSid })
  tabs.delete(oldSid)
  const tab = { sid: newSid(), term: null, fit: null, search: null, termEl: null, overlayEl: null, exited: false }
  createTerminal(tab)
  tabs.set(tab.sid, tab)
  renderTabbar()
  switchTab(tab.sid)
  const dims = tab.fit.proposeDimensions()
  sendFrame({ t: 'spawn', sid: tab.sid, cols: dims !== undefined ? dims.cols : 80, rows: dims !== undefined ? dims.rows : 24, cwd: currentCwd() })
}

function closeTab(sid) {
  const tab = tabs.get(sid)
  if (tab === undefined) return
  if (!tab.exited) sendFrame({ t: 'kill', sid })
  tabs.delete(sid)
  if (activeSid === sid) {
    activeSid = null
    const next = [...tabs.keys()].pop() ?? null
    if (next !== null) switchTab(next)
  }
  renderTabbar()
  if (tabs.size === 0) closeModal()
}

function switchTab(sid) {
  const tab = tabs.get(sid)
  if (tab === undefined) return
  activeSid = sid
  for (const [otherSid, other] of tabs) {
    if (other.termEl !== null) other.termEl.style.display = otherSid === sid ? '' : 'none'
  }
  if (bodyEl !== null && tab.termEl !== null && tab.termEl.parentElement !== bodyEl) {
    bodyEl.appendChild(tab.termEl)
  }
  renderTabbar()
  try {
    tab.fit.fit()
  } catch {
    /* 忽略 */
  }
  if (!tab.exited) {
    sendResize(tab)
  }
  showTabOverlay(tab, tab.exited ? '会话已退出 — 点击重新打开' : '')
}

function renderTabbar() {
  if (tabbarEl === null) return
  tabbarEl.textContent = ''
  for (const [sid, tab] of tabs) {
    const btn = document.createElement('button')
    btn.className = 'tt_tab'
    if (sid === activeSid) btn.dataset.active = ''
    btn.innerHTML = '<span>终端 ' + tabCounterLabel(sid) + '</span><span class="tt_tabClose" title="关闭">✕</span>'
    btn.addEventListener('click', (event) => {
      if (event.target.closest('.tt_tabClose') !== null) {
        event.stopPropagation()
        closeTab(sid)
        return
      }
      switchTab(sid)
    })
    tabbarEl.appendChild(btn)
  }
  const add = document.createElement('button')
  add.className = 'tt_tabAdd'
  add.title = '新建终端'
  add.textContent = '+'
  add.addEventListener('click', () => {
    addTab()
  })
  tabbarEl.appendChild(add)
}

/** 标签显示序号（按创建顺序，简化：Map 序 +1）。 */
function tabCounterLabel(sid) {
  let index = 1
  for (const key of tabs.keys()) {
    if (key === sid) return String(index)
    index += 1
  }
  return String(index)
}

function toggleSearch() {
  if (searchInputEl === null) return
  const hidden = searchInputEl.style.display === 'none' || searchInputEl.style.display === ''
  searchInputEl.style.display = hidden ? '' : 'none'
  if (hidden) searchInputEl.focus()
}

function doSearch(backwards) {
  const tab = activeTab()
  if (tab === undefined || tab.search === undefined) return
  const query = searchInputEl.value
  if (query === '') return
  if (backwards) tab.search.findPrevious(query)
  else tab.search.findNext(query)
}

function connect() {
  if (socket !== null) {
    try {
      socket.close()
    } catch {
      /* 忽略 */
    }
    socket = null
  }
  intentionalClose = false
  connecting = true
  setStatus('连接中…', '')
  try {
    socket = new WebSocket(wsUrl())
  } catch (error) {
    connecting = false
    setStatus('连接失败：' + error.message, 'error')
    showBodyOverlay('点击重试')
    return
  }

  socket.onopen = () => {
    connecting = false
    setStatus('已连接', 'connected')
    if (tabs.size === 0) addTab()
  }
  socket.onmessage = (event) => {
    let msg
    try {
      msg = JSON.parse(event.data)
    } catch {
      return
    }
    const sid = msg.sid
    if (msg.t === 'ready') {
      setStatus('已连接 pid=' + msg.pid, 'connected')
      const tab = tabs.get(sid)
      if (tab !== undefined) {
        tab.exited = false
        showTabOverlay(tab, '')
      }
    } else if (msg.t === 'data') {
      const tab = tabs.get(sid)
      if (tab !== undefined && tab.term !== null) tab.term.write(String(msg.d ?? ''))
    } else if (msg.t === 'exit') {
      const tab = tabs.get(sid)
      if (tab !== undefined) {
        tab.exited = true
        const code = msg.code !== null && msg.code !== undefined ? 'code=' + msg.code : ''
        const signal = msg.signal !== null && msg.signal !== undefined ? 'signal=' + msg.signal : ''
        setStatus('已退出 ' + [code, signal].filter(Boolean).join(' '), '')
        showTabOverlay(tab, '会话已退出 — 点击重新打开')
      }
    } else if (msg.t === 'error') {
      setStatus('错误：' + String(msg.m ?? ''), 'error')
      if (typeof sid === 'string') {
        const tab = tabs.get(sid)
        if (tab !== undefined) showTabOverlay(tab, '错误：' + String(msg.m ?? '') + ' — 点击重试')
      } else {
        showBodyOverlay('点击重试')
      }
    }
  }
  socket.onclose = () => {
    connecting = false
    if (intentionalClose) return
    setStatus('连接断开', 'error')
    for (const tab of tabs.values()) {
      tab.exited = true
      showTabOverlay(tab, '连接断开 — 点击重新连接')
    }
  }
  socket.onerror = () => {
    /* onclose 会跟随触发 */
  }
}

function showBodyOverlay(text) {
  if (bodyOverlayEl === null) return
  bodyOverlayEl.textContent = text
}

function openModal() {
  if (modalEl !== null) return
  ensureStyle()

  modalEl = document.createElement('div')
  modalEl.className = 'tt_modalBackdrop'
  modalEl.innerHTML =
    '<div class="tt_modal">' +
    '<div class="tt_header">' +
    '<div class="tt_title">' + TERMINAL_ICON + '<span>终端</span></div>' +
    '<div class="tt_status"><span class="tt_statusDot"></span><span class="tt_statusText">初始化…</span></div>' +
    '<input class="tt_searchInput" style="display:none" placeholder="搜索 (Enter 下一个, Shift+Enter 上一个)" />' +
    '<button class="tt_toolBtn" data-act="search" title="搜索 (Ctrl+F)">搜索</button>' +
    '<button class="tt_toolBtn" data-act="clear" title="清屏">清屏</button>' +
    '<button class="tt_toolBtn" data-act="copy" title="复制选中内容">复制</button>' +
    '<button class="tt_toolBtn" data-act="paste" title="粘贴">粘贴</button>' +
    '<button class="tt_close" title="关闭终端">✕</button>' +
    '</div>' +
    '<div class="tt_tabbar"></div>' +
    '<div class="tt_body"><div class="tt_overlay"></div></div>' +
    '</div>'
  document.body.appendChild(modalEl)

  statusEl = modalEl.querySelector('.tt_statusText')
  statusDotEl = modalEl.querySelector('.tt_statusDot')
  tabbarEl = modalEl.querySelector('.tt_tabbar')
  bodyEl = modalEl.querySelector('.tt_body')
  bodyOverlayEl = modalEl.querySelector('.tt_body > .tt_overlay')
  searchInputEl = modalEl.querySelector('.tt_searchInput')

  bodyOverlayEl.addEventListener('click', () => {
    bodyOverlayEl.textContent = ''
    connect()
  })
  modalEl.querySelector('[data-act=search]').addEventListener('click', () => {
    toggleSearch()
    if (searchInputEl.style.display !== 'none') searchInputEl.focus()
  })
  searchInputEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      doSearch(event.shiftKey)
    } else if (event.key === 'Escape') {
      searchInputEl.style.display = 'none'
    }
  })
  modalEl.querySelector('[data-act=clear]').addEventListener('click', () => {
    const tab = activeTab()
    if (tab !== undefined && tab.term !== null) tab.term.clear()
  })
  modalEl.querySelector('[data-act=copy]').addEventListener('click', () => {
    const tab = activeTab()
    if (tab === undefined || tab.term === null) return
    const selection = tab.term.getSelection()
    if (selection !== '') navigator.clipboard.writeText(selection).catch(() => {})
  })
  modalEl.querySelector('[data-act=paste]').addEventListener('click', () => {
    const tab = activeTab()
    if (tab === undefined) return
    navigator.clipboard.readText().then((text) => {
      sendFrame({ t: 'input', sid: tab.sid, d: text })
    }).catch(() => {})
  })
  modalEl.querySelector('.tt_close').addEventListener('click', () => {
    closeModal()
  })
  modalEl.addEventListener('mousedown', (event) => {
    if (event.target === modalEl) closeModal()
  })
  document.addEventListener('keydown', onModalKeydown)

  resizeObserver = new ResizeObserver(() => {
    const tab = activeTab()
    if (tab !== undefined && tab.fit !== undefined) {
      try {
        tab.fit.fit()
      } catch {
        return
      }
      if (!tab.exited) sendResize(tab)
    }
  })
  resizeObserver.observe(bodyEl)

  connect()
}

function closeModal() {
  if (modalEl === null) return
  intentionalClose = true
  if (socket !== null) {
    for (const tab of tabs.values()) {
      if (!tab.exited) sendFrame({ t: 'kill', sid: tab.sid })
    }
    try {
      socket.close()
    } catch {
      /* 忽略 */
    }
    socket = null
  }
  if (resizeObserver !== null) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  for (const tab of tabs.values()) {
    if (tab.term !== null) {
      try {
        tab.term.dispose()
      } catch {
        /* 忽略 */
      }
    }
  }
  tabs.clear()
  activeSid = null
  document.removeEventListener('keydown', onModalKeydown)
  modalEl.remove()
  modalEl = null
  statusEl = null
  statusDotEl = null
  tabbarEl = null
  bodyEl = null
  bodyOverlayEl = null
  searchInputEl = null
  tabCounter = 0
}

function onModalKeydown(event) {
  if (event.key === 'Escape' && modalEl !== null) {
    event.preventDefault()
    closeModal()
  }
}

/* ================================ 侧边栏入口 ================================ */

function sidebarRoot() {
  const column = document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]')
  if (column === null) return undefined
  return column.querySelector('[class*="logoRow"]')?.parentElement ?? column.firstElementChild
}

function newSessionButton(root) {
  const nested = root.querySelector('button[class*="newSession"]')
  if (nested !== null) return nested
  for (const child of root.children) {
    if (child.tagName === 'BUTTON') return child
  }
  return undefined
}

function createSidebarEntry() {
  const entry = document.createElement('div')
  entry.dataset.dshTtyEntry = ''
  entry.className = 'tt_sidebarEntry'
  entry.setAttribute('role', 'button')
  entry.setAttribute('aria-label', '终端')
  entry.innerHTML = '<span class="tt_sidebarEntryIcon">' + TERMINAL_ICON + '</span><span class="tt_sidebarEntryLabel">终端</span>'
  entry.addEventListener('click', (event) => {
    event.preventDefault()
    openModal()
  })
  return entry
}

function placeSidebarEntry(root, entry) {
  const button = newSessionButton(root)
  if (button === undefined) return false
  if (entry.parentElement !== root) {
    const row = button.closest('[class*="logoRow"]')
    const base = row !== null && row.parentElement === root ? row : button
    const family = Array.from(root.children).filter((el) => el instanceof HTMLElement && el.matches('[data-dsh-global-search-entry], [data-dsh-rss-entry], [data-dsh-taskboard-entry], [data-dsh-ssh-entry], [data-dsh-tty-entry]'))
    if (family.length > 0) {
      const last = family[family.length - 1]
      root.insertBefore(entry, last.nextSibling)
    } else {
      root.insertBefore(entry, base.nextElementSibling)
    }
  }
  return true
}

function mountSidebarEntry() {
  ensureStyle() // 入口必须先于任何交互注入样式（首屏即带内边距/悬停效果）
  if (typeof document !== 'undefined' && document.querySelector('[data-dsh-tty-entry]') !== null) return () => {}
  const entry = createSidebarEntry()
  let root
  let placed = false

  const tryPlace = () => {
    if (root !== undefined && !root.isConnected) {
      rootObserver.disconnect()
      root = undefined
      placed = false
    }
    if (placed) {
      if (document.body.contains(entry)) return
      rootObserver.disconnect()
      root = undefined
      placed = false
    }
    root ??= sidebarRoot()
    if (root === undefined) return
    placed = placeSidebarEntry(root, entry)
    if (placed) {
      rootObserver.observe(root, { childList: true, subtree: true })
    }
  }

  const waitObserver = new MutationObserver(() => {
    tryPlace()
  })
  waitObserver.observe(document.body, { childList: true, subtree: true })

  const rootObserver = new MutationObserver(() => {
    if (root === undefined || !root.isConnected) {
      placed = false
      tryPlace()
      return
    }
    if (!root.contains(entry)) placed = placeSidebarEntry(root, entry)
  })

  tryPlace()
  return () => {
    waitObserver.disconnect()
    rootObserver.disconnect()
    entry.remove()
  }
}

/* ================================ 注册 ================================ */

window.__ModuleLoader__.load({
  id: '@hyzyn/dsh-tty',
  factory: (require) => {
    const exports = {}
    exports.inject = ['sessions']
    exports.apply = (ctx) => {
      sessionsService = ctx.sessions
      mountSidebarEntry()
      return () => {
        closeModal()
      }
    }
    return exports
  },
})
