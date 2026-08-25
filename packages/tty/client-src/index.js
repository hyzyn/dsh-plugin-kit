/* eslint-disable */
/**
 * @hyzyn/dsh-tty — 浏览器半体：侧边栏「终端」入口 + 大弹窗 xterm 面板。
 * 由 scripts/build-client.mjs 用 esbuild 打包为单文件 IIFE（xterm 内核随
 * bundle 分发），经 window.__ModuleLoader__.load 注册。
 *
 * v0.2 能力：
 * v0.3 能力：
 *   - 最小化/折叠：点空白处、Esc 或「—」按钮把弹窗收进右下角悬浮条，
 *     PTY 会话与输出缓冲保持存活；悬浮条点击恢复，✕ 才真正关闭（结束会话）
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
  '[data-sidebar-collapsed] .tt_sidebarEntry{justify-content:center;width:100%;padding:0}',
  '[data-sidebar-collapsed] .tt_sidebarEntryLabel{display:none}',
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
  '.tt_min,.tt_close{appearance:none;background:0 0;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);border-radius:8px;width:30px;height:30px;cursor:pointer;font-size:16px;line-height:1;flex:none}',
  '.tt_min:hover,.tt_close:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}',
  // 最小化：弹窗仅隐藏（会话与输出缓冲保持存活），右下角悬浮条负责恢复/关闭
  '.tt_modalBackdrop[data-minimized]{display:none}',
  '.tt_dock{position:fixed;right:18px;bottom:18px;z-index:1300;display:inline-flex;align-items:center;gap:10px;height:38px;padding:0 8px 0 16px;border-radius:999px;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary);font-size:13px;cursor:pointer;user-select:none}',
  '.tt_dock:hover{border-color:var(--dsw-alias-label-dimmed)}',
  '.tt_dockTitle{display:flex;align-items:center;gap:8px;font-weight:600;white-space:nowrap}',
  '.tt_dockCount{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400}',
  '.tt_dockStatus{max-width:220px;color:var(--dsw-alias-label-tertiary);font-size:12px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}',
  '.tt_dockDot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-label-tertiary);flex:none}',
  '.tt_dockDot[data-state=connected]{background:var(--dsw-alias-state-success-primary)}',
  '.tt_dockDot[data-state=error]{background:var(--dsw-alias-state-error-primary)}',
  '@keyframes ttDockPulse{from{box-shadow:0 0 0 6px rgba(63,185,80,.35)}to{box-shadow:0 0 0 0 rgba(63,185,80,0)}}',
  '.tt_dockDot[data-active]{animation:ttDockPulse .9s ease-out}',
  '.tt_dockClose{appearance:none;background:0 0;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);border-radius:50%;width:26px;height:26px;cursor:pointer;font-size:12px;line-height:1;flex:none;display:inline-flex;align-items:center;justify-content:center}',
  '.tt_dockClose:hover{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}',
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
  '.tt_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none;transition:border-color .16s,background .16s}',
  '.tt_card:hover{border-color:var(--dsw-alias-label-dimmed)}',
  '.tt_cardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}',
  '.tt_cardHeader{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}',
  '.tt_cardHeadText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}',
  '.tt_cardName{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}',
  '.tt_cardDescription{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}',
  '.tt_cardChevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}',
  '.tt_cardChevronOpen{transform:rotate(180deg)}',
  '.tt_cardBody{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}',
  '.tt_cardField{flex-direction:column;gap:6px;padding:12px 0;display:flex}',
  '.tt_cardField+.tt_cardField{border-top:1px solid var(--dsw-alias-border-l2)}',
  '.tt_cardLabel{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:13px;font-weight:500;line-height:1.5}',
  '.tt_cardInput{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);height:34px;font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font-size:13px;line-height:1.5;box-sizing:border-box}',
  '.tt_cardInput:focus-visible{border-color:var(--dsw-alias-state-business-primary);outline:none}',
  '.tt_cardCheckbox{width:16px;height:16px;accent-color:var(--dsw-alias-state-business-primary)}',
  '.tt_cardRow{align-items:center;gap:8px;display:flex;flex-direction:row}',
  '.tt_cardHint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5;margin-top:2px}',
  '.tt_cardSave{appearance:none;font:inherit;cursor:pointer;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3);border:1px solid transparent}',
  '.tt_cardSave:disabled{opacity:.4;cursor:default}',
  '.tt_cardMessage{margin:8px 0 0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}',
  '.tt_cardMessageOk{color:var(--dsw-alias-state-success-primary)}',
  '.tt_cardMessageError{color:var(--dsw-alias-state-error-primary)}',
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
  '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5l3.5 3L3 11"/><path d="M8.5 11H13"/></svg>'

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
/** 最小化状态：弹窗隐藏但会话保活，由右下角悬浮条（dock）恢复。 */
let minimized = false
let dockEl = null
let dockCountEl = null
let dockStatusEl = null
let dockDotEl = null
let dockActivityTimer = null

/** sid → 标签页 */
const tabs = new Map()
let activeSid = null
let tabCounter = 0
let connecting = false

function setStatus(text, state) {
  if (statusEl === null) return
  statusEl.textContent = text
  statusDotEl.dataset.state = state
  // 悬浮条与弹窗头部状态保持一致（最小化时用户只看得到悬浮条）
  if (dockStatusEl !== null) dockStatusEl.textContent = text
  if (dockDotEl !== null) dockDotEl.dataset.state = state
}

/** 最小化期间有输出到达：脉冲提示悬浮条，说明会话仍在活动。 */
function flashDockActivity() {
  if (!minimized || dockDotEl === null) return
  dockDotEl.dataset.active = ''
  clearTimeout(dockActivityTimer)
  dockActivityTimer = setTimeout(() => {
    if (dockDotEl !== null) delete dockDotEl.dataset.active
  }, 900)
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
    // 搜索高亮装饰（SearchAddon decorations）依赖提案 API
    allowProposedApi: true,
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
  const tab = { sid, term: null, fit: null, search: null, termEl: null, overlayEl: null, exited: false, spawned: false }
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
  if (old.term !== null) {
    try {
      old.term.dispose()
    } catch {
      /* 忽略 */
    }
  }
  if (old.termEl !== null) old.termEl.remove()
  tabs.delete(oldSid)
  const tab = { sid: newSid(), term: null, fit: null, search: null, termEl: null, overlayEl: null, exited: false, spawned: false }
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
  // 彻底移除：dispose xterm 实例并把 termEl（含错误/退出浮层）从面板拿走，
  // 否则被关闭标签的幽灵 DOM 会叠在其它标签上
  if (tab.term !== null) {
    try {
      tab.term.dispose()
    } catch {
      /* 忽略 */
    }
  }
  if (tab.termEl !== null) tab.termEl.remove()
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
  if (tab.spawned && !tab.exited) {
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

/** 搜索高亮装饰：深色终端背景（#0d1117）下的高对比配色。 */
const SEARCH_DECORATIONS = {
  matchBackground: '#3d2b00',
  matchBorder: '#8a5a00',
  activeMatchBackground: '#b06a00',
  activeMatchBorder: '#ffb84d',
  matchOverviewRuler: '#8a5a00',
  activeMatchColorOverviewRuler: '#ffb84d',
}

function doSearch(backwards) {
  const tab = activeTab()
  if (tab === undefined || tab.search === undefined) return
  const query = searchInputEl.value
  if (query === '') return
  const options = { decorations: SEARCH_DECORATIONS }
  if (backwards) tab.search.findPrevious(query, options)
  else tab.search.findNext(query, options)
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
        tab.spawned = true
        showTabOverlay(tab, '')
        sendResize(tab) // spawn 就绪后补一次精确尺寸
      }
    } else if (msg.t === 'data') {
      const tab = tabs.get(sid)
      if (tab !== undefined && tab.term !== null) {
        tab.term.write(String(msg.d ?? ''))
        flashDockActivity()
      }
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
  if (modalEl !== null) {
    // 已在运行：最小化中则从悬浮条恢复，否则保持现状
    if (minimized) restoreModal()
    return
  }
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
    '<button class="tt_min" title="最小化到悬浮条（会话保持运行）">—</button>' +
    '<button class="tt_close" title="关闭终端（结束所有会话）">✕</button>' +
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
      // 只收起搜索框：阻断冒泡，避免文档级 Esc 处理器把整个面板最小化
      event.stopPropagation()
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
  modalEl.querySelector('.tt_min').addEventListener('click', () => {
    minimizeModal()
  })
  modalEl.querySelector('.tt_close').addEventListener('click', () => {
    closeModal()
  })
  // 点空白处 = 最小化而不是关闭：会话保活，随时从悬浮条恢复
  modalEl.addEventListener('mousedown', (event) => {
    if (event.target === modalEl) minimizeModal()
  })
  document.addEventListener('keydown', onModalKeydown)

  resizeObserver = new ResizeObserver(() => {
    if (minimized) return // display:none 下 fit 尺寸无意义，恢复时统一重算
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

/** 右下角悬浮条：展示会话数 / 连接状态，点击恢复窗口。 */
function buildDock() {
  dockEl = document.createElement('div')
  dockEl.className = 'tt_dock'
  dockEl.title = '点击恢复终端窗口'
  dockEl.innerHTML =
    '<span class="tt_dockTitle">' + TERMINAL_ICON + '<span>终端</span><span class="tt_dockCount"></span></span>' +
    '<span class="tt_dockStatus"></span>' +
    '<span class="tt_dockDot"></span>' +
    '<button class="tt_dockClose" title="关闭终端（结束所有会话）">✕</button>'
  dockCountEl = dockEl.querySelector('.tt_dockCount')
  dockStatusEl = dockEl.querySelector('.tt_dockStatus')
  dockDotEl = dockEl.querySelector('.tt_dockDot')
  const running = [...tabs.values()].filter((tab) => !tab.exited).length
  dockCountEl.textContent = tabs.size > 0 ? '· ' + running + '/' + tabs.size : ''
  // 快照当前状态（此后 setStatus 会持续同步）
  if (statusEl !== null) dockStatusEl.textContent = statusEl.textContent
  if (statusDotEl !== null) dockDotEl.dataset.state = statusDotEl.dataset.state ?? ''
  dockEl.addEventListener('click', (event) => {
    if (event.target.closest('.tt_dockClose') !== null) {
      event.stopPropagation()
      closeModal()
      return
    }
    restoreModal()
  })
  document.body.appendChild(dockEl)
}

/** 最小化：隐藏弹窗但保留 DOM / WebSocket / xterm 缓冲，收进右下角悬浮条。 */
function minimizeModal() {
  if (modalEl === null || minimized) return
  minimized = true
  if (searchInputEl !== null) searchInputEl.style.display = 'none'
  modalEl.dataset.minimized = ''
  buildDock()
}

/** 从悬浮条恢复弹窗：重新 fit 并把精确尺寸同步给 PTY。 */
function restoreModal() {
  if (modalEl === null || !minimized) return
  minimized = false
  delete modalEl.dataset.minimized
  clearTimeout(dockActivityTimer)
  if (dockEl !== null) {
    dockEl.remove()
    dockEl = null
  }
  dockCountEl = null
  dockStatusEl = null
  dockDotEl = null
  const tab = activeTab()
  if (tab !== undefined && tab.fit !== undefined) {
    try {
      tab.fit.fit()
    } catch {
      /* 忽略 */
    }
    if (tab.spawned && !tab.exited) sendResize(tab)
  }
  if (tab !== undefined && tab.term !== null) tab.term.focus()
}

function closeModal() {
  if (modalEl === null) return
  intentionalClose = true
  minimized = false
  clearTimeout(dockActivityTimer)
  if (dockEl !== null) {
    dockEl.remove()
    dockEl = null
  }
  dockCountEl = null
  dockStatusEl = null
  dockDotEl = null
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
    // Esc = 最小化（会话保活）；真正关闭请用 ✕ 按钮
    minimizeModal()
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
    // React 必须取自宿主（与 module loader 共享同一实例）；require 是加载器传入的
    // 参数（作用域内遮蔽全局），esbuild 不会把它打包进 bundle。
    const React = require('react')
    const { jsx, jsxs } = require('react/jsx-runtime')

const CHEVRON_PATH = 'M6 9.5L9.5 7L6 4.5V9.5Z'

/**
 * 设置 → 插件 →「终端面板」卡片：读取/编辑 tty settings 命名空间。
 * 注意：React 必须取自 module loader 的 require（宿主 GUI 同一个 React 实例），
 * 不能把独立副本打进 bundle（hooks 依赖渲染器的 dispatcher）。
 */
function TtySettingsCard() {
  const [open, setOpen] = React.useState(false)
  const [form, setForm] = React.useState(null)
  const [loaded, setLoaded] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [message, setMessage] = React.useState({ kind: '', text: '' })

  const load = async () => {
    try {
      const res = await fetch('/api/dsh-tty/config', { cache: 'no-store' })
      const data = await res.json()
      if (data.ok && typeof data.config === 'object' && data.config !== null) setForm(data.config)
      else setMessage({ kind: 'error', text: String(data.error || '读取配置失败') })
    } catch (error) {
      setMessage({ kind: 'error', text: String(error && error.message ? error.message : error) })
    }
  }
  React.useEffect(() => {
    if (open && !loaded) {
      setLoaded(true)
      void load()
    }
  }, [open])

  const set = (key, value) => setForm((current) => ({ ...(current || {}), [key]: value }))
  const save = async () => {
    setSaving(true)
    setMessage({ kind: '', text: '' })
    try {
      const res = await fetch('/api/dsh-tty/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form || {}),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) setMessage({ kind: 'error', text: String(data.error || '保存失败') })
      else {
        setMessage({ kind: 'ok', text: '已保存并热生效' })
        if (data.config) setForm(data.config)
      }
    } catch (error) {
      setMessage({ kind: 'error', text: String(error && error.message ? error.message : error) })
    }
    setSaving(false)
  }

  const textField = (label, key, placeholder, hint) => jsxs('label', {
    className: 'tt_cardField',
    children: [
      jsx('span', { className: 'tt_cardLabel', children: label }),
      jsx('input', { className: 'tt_cardInput', value: form[key] ?? '', placeholder: placeholder ?? '', onChange: (event) => set(key, event.target.value) }),
      hint ? jsx('span', { className: 'tt_cardHint', children: hint }) : null,
    ],
  })
  const boolField = (label, key) => jsxs('label', {
    className: 'tt_cardField tt_cardRow',
    children: [
      jsx('input', { type: 'checkbox', className: 'tt_cardCheckbox', checked: form[key] === true, onChange: (event) => set(key, event.target.checked) }),
      jsx('span', { className: 'tt_cardLabel', children: label }),
    ],
  })

  return jsxs('li', {
    className: open ? 'tt_card tt_cardOpen' : 'tt_card',
    children: [
      jsxs('button', {
        type: 'button',
        className: 'tt_cardHeader',
        'aria-expanded': open,
        onClick: () => setOpen((current) => !current),
        children: [
          jsxs('span', {
            className: 'tt_cardHeadText',
            children: [
              jsx('span', { className: 'tt_cardName', children: '终端面板' }),
              jsx('span', { className: 'tt_cardDescription', children: 'xterm 终端面板：多标签页、cwd 跟随会话；shell / TERM / 并发上限等保存即热生效。' }),
            ],
          }),
          jsxs('svg', {
            className: open ? 'tt_cardChevron tt_cardChevronOpen' : 'tt_cardChevron',
            width: '14', height: '14', viewBox: '0 0 12 14', fill: 'none', xmlns: 'http://www.w3.org/2000/svg',
            children: jsx('path', { d: 'M6 9.5L9.5 7L6 4.5V9.5Z', fill: 'currentColor' }),
          }),
        ],
      }),
      open ? jsxs('div', {
        className: 'tt_cardBody',
        children: [
          form === null
            ? jsx('div', { className: 'tt_cardMessage', children: '加载配置中…' })
            : jsxs('div', { children: [
                boolField('启用插件（需重启生效）', 'enabled'),
                boolField('向 agent 公告终端面板能力', 'announceToAgent'),
                textField('并发会话上限（1~16）', 'maxSessions', '4', '超过上限的新标签会被拒绝；保存即热生效'),
                textField('Shell 路径（默认 $SHELL）', 'shell', '', '留空使用 $SHELL'),
                textField('TERM', 'term', 'xterm-256color', 'TUI 程序依赖此值'),
                textField('COLORTERM', 'colorTerm', 'truecolor', ''),
                textField('兜底工作目录（客户端当前会话 cwd 优先）', 'cwd', '', '留空使用宿主进程启动目录'),
                jsxs('div', {
                  className: 'tt_cardField tt_cardRow',
                  children: [
                    jsx('button', { className: 'tt_cardSave', disabled: saving, onClick: () => void save(), children: saving ? '保存中…' : '保存' }),
                    jsx('span', { className: 'tt_cardMessage' + (message.kind === 'ok' ? ' tt_cardMessageOk' : message.kind === 'error' ? ' tt_cardMessageError' : ''), children: message.text }),
                  ],
                }),
              ] }),
        ],
      }) : null,
    ],
  })
}


    exports.inject = ['slots', 'sessions']
    exports.apply = (ctx) => {
      sessionsService = ctx.sessions
      mountSidebarEntry()
      ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
        name: 'settings.plugin.item',
        // settings.plugin.item 是 keyed 插槽：key 必须是该卡片所编辑的 settings 命名空间
        key: 'tty',
        order: 110,
      }, TtySettingsCard))
      return () => {
        closeModal()
      }
    }
    return exports
  },
})
