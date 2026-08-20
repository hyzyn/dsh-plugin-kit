/* eslint-disable */
/**
 * @hyzyn/dsh-tty — 浏览器半体：侧边栏「终端」入口 + 大弹窗 xterm 面板。
 * 由 scripts/build-client.mjs 用 esbuild 打包为单文件 IIFE（xterm 内核随
 * bundle 分发），经 window.__ModuleLoader__.load 注册，格式与 search 插件
 * 的手写 client 一致（宿主以 /plugins/@hyzyn/dsh-tty/client.js 提供）。
 *
 * 帧协议与宿主半体（src/index.ts）对齐：
 *   C→S spawn/input/resize/kill；S→C ready/data/exit/error。
 */
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
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
  '.tt_modalBackdrop{z-index:1300;background:var(--dsw-alias-bg-mask-1);justify-content:center;align-items:flex-start;display:flex;position:fixed;inset:0;padding-top:6vh}',
  '.tt_modal{background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);width:min(1180px,96vw);height:min(82vh,920px);box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary);border-radius:14px;flex-direction:column;gap:0;display:flex;overflow:hidden}',
  '.tt_header{flex:none;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l1);display:flex}',
  '.tt_title{flex:1;margin:0;font-size:14px;font-weight:600;white-space:nowrap;align-items:center;gap:8px;display:flex}',
  '.tt_status{font-size:11px;color:var(--dsw-alias-label-tertiary);align-items:center;gap:6px;display:flex;white-space:nowrap}',
  '.tt_statusDot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-label-tertiary);flex:none}',
  '.tt_statusDot[data-state=connected]{background:var(--dsw-alias-state-success-primary)}',
  '.tt_statusDot[data-state=error]{background:var(--dsw-alias-state-error-primary)}',
  '.tt_close{appearance:none;background:0 0;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);border-radius:8px;width:30px;height:30px;cursor:pointer;font-size:16px;line-height:1;flex:none}',
  '.tt_close:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}',
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

let socket = null
let term = null
let fit = null
let modalEl = null
let statusEl = null
let statusDotEl = null
let overlayEl = null
let sessionActive = false
let intentionalClose = false
let resizeObserver = null

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

function sendResize() {
  if (fit === null) return
  const dims = fit.proposeDimensions()
  if (dims !== undefined) sendFrame({ t: 'resize', cols: dims.cols, rows: dims.rows })
}

function showOverlay(text) {
  if (overlayEl === null) return
  overlayEl.textContent = text
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
  sessionActive = false
  setStatus('连接中…', '')
  try {
    socket = new WebSocket(wsUrl())
  } catch (error) {
    setStatus('连接失败：' + error.message, 'error')
    showOverlay('点击重试')
    return
  }

  socket.onopen = () => {
    const dims = fit !== null ? fit.proposeDimensions() : undefined
    sendFrame({ t: 'spawn', cols: dims !== undefined ? dims.cols : 80, rows: dims !== undefined ? dims.rows : 24 })
  }
  socket.onmessage = (event) => {
    let msg
    try {
      msg = JSON.parse(event.data)
    } catch {
      return
    }
    if (msg.t === 'ready') {
      sessionActive = true
      setStatus('已连接 pid=' + msg.pid, 'connected')
      if (term !== null && term.hasSelection()) term.clearSelection()
    } else if (msg.t === 'data' && term !== null) {
      term.write(String(msg.d ?? ''))
    } else if (msg.t === 'exit') {
      sessionActive = false
      const code = msg.code !== null && msg.code !== undefined ? 'code=' + msg.code : ''
      const signal = msg.signal !== null && msg.signal !== undefined ? 'signal=' + msg.signal : ''
      setStatus('已退出 ' + [code, signal].filter(Boolean).join(' '), '')
      showOverlay('会话已退出 — 点击重新打开')
    } else if (msg.t === 'error') {
      setStatus('错误：' + String(msg.m ?? ''), 'error')
      showOverlay('点击重试')
    }
  }
  socket.onclose = () => {
    if (intentionalClose) return
    setStatus('连接断开', 'error')
    showOverlay('点击重新连接')
  }
  socket.onerror = () => {
    /* onclose 会跟随触发 */
  }
}

function initTerminal(bodyEl) {
  const termEl = document.createElement('div')
  termEl.className = 'tt_term'
  bodyEl.appendChild(termEl)

  term = new Terminal({
    cursorBlink: true,
    fontSize: 13,
    fontFamily: '"SF Mono", Menlo, Consolas, "Courier New", monospace',
    scrollback: 5000,
    convertEol: false,
  })
  fit = new FitAddon()
  term.loadAddon(fit)
  term.open(termEl)
  try {
    fit.fit()
  } catch {
    /* 容器尚未布局完成时忽略 */
  }

  term.onData((data) => {
    sendFrame({ t: 'input', d: data })
  })

  resizeObserver = new ResizeObserver(() => {
    if (fit !== null) {
      try {
        fit.fit()
      } catch {
        return
      }
      sendResize()
    }
  })
  resizeObserver.observe(bodyEl)
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
    '<button class="tt_close" title="关闭终端">✕</button>' +
    '</div>' +
    '<div class="tt_body"><div class="tt_overlay"></div></div>' +
    '</div>'
  document.body.appendChild(modalEl)

  const bodyEl = modalEl.querySelector('.tt_body')
  const closeBtn = modalEl.querySelector('.tt_close')
  statusEl = modalEl.querySelector('.tt_statusText')
  statusDotEl = modalEl.querySelector('.tt_statusDot')
  overlayEl = modalEl.querySelector('.tt_overlay')
  overlayEl.addEventListener('click', () => {
    if (term !== null) term.reset()
    connect()
  })

  closeBtn.addEventListener('click', () => {
    closeModal()
  })
  modalEl.addEventListener('mousedown', (event) => {
    if (event.target === modalEl) closeModal()
  })
  document.addEventListener('keydown', onModalKeydown)

  initTerminal(bodyEl)
  connect()
}

function closeModal() {
  if (modalEl === null) return
  intentionalClose = true
  if (socket !== null) {
    if (sessionActive) sendFrame({ t: 'kill' })
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
  if (term !== null) {
    try {
      term.dispose()
    } catch {
      /* 忽略 */
    }
    term = null
    fit = null
  }
  document.removeEventListener('keydown', onModalKeydown)
  modalEl.remove()
  modalEl = null
  statusEl = null
  statusDotEl = null
  overlayEl = null
  sessionActive = false
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
  factory: () => {
    mountSidebarEntry()
    return () => {
      closeModal()
    }
  },
})
