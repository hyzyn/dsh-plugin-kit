/* eslint-disable */
/**
 * @hyzyn/dsh-tty — 浏览器半体：侧边栏「终端」入口 + 大弹窗 xterm 面板。
 * 由 scripts/build-client.mjs 用 esbuild 打包为单文件 IIFE（xterm 内核随
 * bundle 分发），经 window.__ModuleLoader__.load 注册。
 *
 * v0.2 能力：
 * v0.3 能力：
 *   - 最小化/折叠：点空白处、Esc 或「—」按钮把弹窗收起，PTY 会话与输出
 *     缓冲保持存活；最小化状态合并进侧边栏「终端」入口（会话数徽标 +
 *     状态点，点击入口恢复），入口不在时才退回紧凑悬浮条；✕ 才真正关闭
 *   - 多会话标签页（每标签一个 sid 的 xterm 实例，可切换/关闭/新建）
 *   - 新标签默认在当前会话工作目录打开（注入 sessions 客户端服务）
 *   - 便利功能：终端内搜索（Ctrl+F）、可点击链接、清屏/复制/粘贴按钮
 * v0.4 能力：
 *   - 标签栏「+」改为菜单：本地终端 / SSH 连接簿（读 /api/dsh-tty/config 的
 *     sshHosts）/ SSH 连接…（host/port/username/auth 表单，可保存回连接簿）
 *   - SSH 会话：{t:'ssh'} 帧创建（name 引用连接簿或内联字段），ready 帧的
 *     target 回显到状态栏与标签标题；respawn 复用原 spawnSpec
 *   - 设置卡片维护 SSH 连接簿（列表 + 删除，随「保存」写入 tty settings）
 * v0.5 能力：
 *   - 断线保活与重连：异常断开（刷新页面/网络抖动）后会话在宿主保活
 *     reconnectGraceSec（默认 120s），客户端自动重连（指数退避封顶 5s），
 *     对存活标签发 {t:'attach'} 恢复并回放缓冲；页面刷新后从 sessionStorage
 *     恢复标签列表（未存活者自动丢弃）；✕ 关闭才真正结束全部会话
 *   - WebGL 渲染器（@xterm/addon-webgl，上下文丢失自动回退 DOM 渲染器）
 * v0.6 能力：
 *   - SSH 对话框：agent forwarding 勾选；密码/口令字段「从 env 插件变量填入」
 *     筛选选择器（宿主 /api/dsh-tty/env-vars，仅 env 插件托管变量名）
 *   - 「+」菜单连接簿条目带 ✎ 编辑：对话框编辑模式（预填全字段，可改名，
 *     「保存修改」按原名替换条目），连接照常可用
 *   - 设置卡片：从 ~/.ssh/config 导入连接簿（同名跳过）；从 known_hosts 导入
 *     主机指纹（TOFU 预填充）；shell 集成开关；连接簿行内编辑表单
 *   - 标签双击重命名（随标签持久化，断线恢复保留）
 * 帧协议与宿主半体（src/index.ts）对齐：spawn/ssh/input/resize/kill/
 * sessions/attach ↔ ready/data/exit/error/sessions。
 */
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { WebglAddon } from '@xterm/addon-webgl'
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
  '.tt_min{appearance:none;background:0 0;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);border-radius:8px;width:30px;height:30px;cursor:pointer;font-size:16px;line-height:1;flex:none}',
  '.tt_close{appearance:none;background:0 0;border:none;color:var(--dsw-alias-label-tertiary);border-radius:8px;width:30px;height:30px;cursor:pointer;font-size:18px;line-height:1;flex:none}',
  '.tt_min:hover,.tt_close:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}',
  // 最小化：弹窗仅隐藏（会话与输出缓冲保持存活），状态合并进侧边栏
  // 「终端」入口（会话数徽标 + 状态点，点击入口恢复）；入口不存在时才
  // 退回紧凑悬浮条
  '.tt_modalBackdrop[data-minimized]{display:none}',
  '.tt_sidebarEntryBadge{display:none;align-items:center;gap:5px;margin-left:auto;padding-left:8px;flex:none}',
  '.tt_sidebarEntry[data-minimized]{color:var(--dsw-alias-label-primary)}',
  '.tt_sidebarEntry[data-minimized] .tt_sidebarEntryBadge{display:inline-flex}',
  '[data-sidebar-collapsed] .tt_sidebarEntryBadge{margin-left:0;padding-left:0}',
  '[data-sidebar-collapsed] .tt_sidebarBadgeCount{display:none}',
  '.tt_sidebarBadgeDot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-label-tertiary);flex:none}',
  '.tt_sidebarBadgeDot[data-state=connected]{background:var(--dsw-alias-state-success-primary)}',
  '.tt_sidebarBadgeDot[data-state=error]{background:var(--dsw-alias-state-error-primary)}',
  '@keyframes ttPulse{from{box-shadow:0 0 0 5px rgba(63,185,80,.35)}to{box-shadow:0 0 0 0 rgba(63,185,80,0)}}',
  '.tt_sidebarBadgeDot[data-active],.tt_dockDot[data-active]{animation:ttPulse .9s ease-out}',
  '.tt_dockCompact .tt_dockStatus{display:none}',
  '.tt_dock{position:fixed;right:18px;bottom:18px;z-index:1300;display:inline-flex;align-items:center;gap:10px;height:38px;padding:0 8px 0 16px;border-radius:999px;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary);font-size:13px;cursor:pointer;user-select:none}',
  '.tt_dock:hover{border-color:var(--dsw-alias-label-dimmed)}',
  '.tt_dockTitle{display:flex;align-items:center;gap:8px;font-weight:600;white-space:nowrap}',
  '.tt_dockCount{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400}',
  '.tt_dockStatus{max-width:220px;color:var(--dsw-alias-label-tertiary);font-size:12px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}',
  '.tt_dockDot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-label-tertiary);flex:none}',
  '.tt_dockDot[data-state=connected]{background:var(--dsw-alias-state-success-primary)}',
  '.tt_dockDot[data-state=error]{background:var(--dsw-alias-state-error-primary)}',
  '.tt_dockClose{appearance:none;background:0 0;border:none;color:var(--dsw-alias-label-tertiary);border-radius:50%;width:26px;height:26px;cursor:pointer;font-size:14px;line-height:1;flex:none;display:inline-flex;align-items:center;justify-content:center}',
  '.tt_dockClose:hover{color:var(--dsw-alias-state-error-primary)}',
  '.tt_tabbar{flex:none;display:flex;align-items:center;gap:6px;padding:6px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);overflow-x:auto}',
  '.tt_tab{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 8px 0 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:12px;cursor:pointer;flex:none;white-space:nowrap}',
  '.tt_tab:hover{color:var(--dsw-alias-label-primary)}',
  '.tt_tab[data-active]{background:var(--dsw-specific-sidebar-nav-item-active);color:var(--dsw-alias-label-primary);font-weight:600}',
  '.tt_tabClose{appearance:none;background:0 0;border:none;color:inherit;cursor:pointer;font-size:13px;line-height:1;padding:0 2px}',
  '.tt_tabRename{width:96px;height:20px;font-size:12px;border:1px solid var(--dsw-alias-state-business-primary);border-radius:4px;background:var(--dsw-alias-bg-layer-3);color:inherit;padding:0 4px;box-sizing:border-box;font-family:inherit}',
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
  // 「+」新建菜单（本地终端 / SSH 连接簿 / SSH 连接…）
  '.tt_addMenu{position:fixed;z-index:1400;min-width:220px;max-width:320px;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:10px;box-shadow:var(--dsw-shadow-lv3);padding:6px;display:flex;flex-direction:column;gap:2px}',
  '.tt_addMenuItem{appearance:none;background:0 0;border:none;color:var(--dsw-alias-label-primary);text-align:left;font:inherit;font-size:13px;padding:7px 10px;border-radius:8px;cursor:pointer;display:flex;flex-direction:column;gap:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.tt_addMenuItem:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  '.tt_addMenuSub{font-size:11px;color:var(--dsw-alias-label-tertiary)}',
  '.tt_addMenuRow{display:flex;align-items:center;gap:4px}',
  '.tt_addMenuRow .tt_addMenuItem{flex:1;min-width:0}',
  '.tt_addMenuEdit{appearance:none;background:0 0;border:none;color:var(--dsw-alias-label-tertiary);cursor:pointer;font-size:14px;line-height:1;flex:none;padding:6px 8px;border-radius:8px}',
  '.tt_addMenuEdit:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}',
  '.tt_addMenuSep{height:1px;background:var(--dsw-alias-border-l1);margin:4px 2px}',
  '.tt_addMenuTitle{font-size:11px;color:var(--dsw-alias-label-tertiary);padding:4px 10px 2px}',
  // SSH 连接对话框
  '.tt_sshBackdrop{position:fixed;inset:0;z-index:1400;background:var(--dsw-alias-bg-mask-1);display:flex;align-items:center;justify-content:center}',
  '.tt_sshCard{width:min(430px,92vw);max-height:86vh;overflow-y:auto;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:14px;box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary);padding:18px;display:flex;flex-direction:column;gap:10px}',
  '.tt_sshTitle{margin:0;font-size:15px;font-weight:600}',
  '.tt_sshRow{display:flex;flex-direction:column;gap:5px}',
  '.tt_sshGrid{display:grid;grid-template-columns:1fr 110px;gap:10px}',
  '.tt_sshActions{display:flex;gap:10px;justify-content:flex-end;margin-top:4px}',
  '.tt_sshError{color:var(--dsw-alias-state-error-primary);font-size:12px;min-height:16px;line-height:1.4}',
  '.tt_sshHostRow{display:flex;align-items:center;gap:8px;padding:6px 0;border-top:1px solid var(--dsw-alias-border-l1)}',
  '.tt_sshHostMeta{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}',
  '.tt_sshHostName{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.tt_sshHostTarget{font-size:12px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  // 连接簿行内编辑表单
  '.tt_sshEdit{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-3);display:flex;flex-direction:column;gap:8px;padding:10px;margin:4px 0 8px}',
  // env:VAR 选择器（筛选框 + 限高滚动列表）
  '.tt_envList{max-height:132px;overflow-y:auto;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-3);display:flex;flex-direction:column;gap:2px;padding:4px}',
  '.tt_envItem{appearance:none;background:0 0;border:none;color:var(--dsw-alias-label-primary);text-align:left;font:12px "SF Mono",Menlo,Consolas,monospace;padding:5px 8px;border-radius:6px;cursor:pointer}',
  '.tt_envItem:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  '.tt_envMore{font-size:11px;color:var(--dsw-alias-label-tertiary);padding:4px 8px}',
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
/** 断线自动重连：指数退避（1s 起步、封顶 5s），面板开着就一直尝试。 */
let reconnectTimer = null
let reconnectDelay = 1000
/** 标签列表持久化（sessionStorage）：页面刷新后按 sid 重连宿主保活的会话。 */
const PERSIST_KEY = 'dsh-tty:tabs'

/** sid → 标签页 */
const tabs = new Map()
let activeSid = null
let tabCounter = 0
let connecting = false
/** 「+」新建菜单与 SSH 连接对话框（挂在 document.body 的浮层）。 */
let addMenuEl = null
let sshDialogEl = null
/** SSH 连接簿缓存：/api/dsh-tty/config 的 sshHosts（设置卡片保存后同步）。 */
let sshHostsCache = []

function setStatus(text, state) {
  if (statusEl === null) return
  statusEl.textContent = text
  statusDotEl.dataset.state = state
  // 最小化时用户只看得到侧边栏入口徽标 / 兜底悬浮条，状态同步到那里
  if (dockStatusEl !== null) dockStatusEl.textContent = text
  if (dockDotEl !== null) dockDotEl.dataset.state = state
  const badgeDot = document.querySelector('[data-dsh-tty-entry] .tt_sidebarBadgeDot')
  if (badgeDot !== null) badgeDot.dataset.state = state
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

/** 标签列表持久化（sessionStorage，随浏览器标签页生命周期）：只存未退出的标签。 */
function persistTabs() {
  try {
    const data = [...tabs.values()]
      .filter((tab) => !tab.exited)
      .map((tab) => ({ sid: tab.sid, spawnSpec: tab.spawnSpec, label: tab.label }))
    if (data.length === 0 || modalEl === null) sessionStorage.removeItem(PERSIST_KEY)
    else sessionStorage.setItem(PERSIST_KEY, JSON.stringify(data))
  } catch {
    /* 隐私模式等存储不可用：静默跳过 */
  }
}

/** 读取持久化标签（页面刷新后重开面板用）；结构不合法的条目直接丢弃。 */
function loadPersistedTabs() {
  try {
    const raw = sessionStorage.getItem(PERSIST_KEY)
    if (raw === null) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item) => item !== null && typeof item === 'object' && typeof item.sid === 'string' && item.sid !== '' && item.spawnSpec !== null && typeof item.spawnSpec === 'object')
  } catch {
    return []
  }
}

/**
 * 等待某一类型的第一帧（独立监听，主 onmessage 同时照常处理）；
 * 超时返回 null（宿主不支持该帧 / 网络异常）。
 */
function waitFrame(type, timeoutMs) {
  return new Promise((resolve) => {
    const onMsg = (event) => {
      let msg
      try {
        msg = JSON.parse(event.data)
      } catch {
        return
      }
      if (msg.t === type) {
        clearTimeout(timer)
        socket.removeEventListener('message', onMsg)
        resolve(msg)
      }
    }
    const timer = setTimeout(() => {
      socket.removeEventListener('message', onMsg)
      resolve(null)
    }, timeoutMs)
    socket.addEventListener('message', onMsg)
  })
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
  // WebGL 渲染器：高吞吐输出（build 日志）性能质变；上下文丢失（多标签
  // 超出浏览器 WebGL 上下文配额等）时释放本 addon，xterm 自动回退 DOM 渲染器
  try {
    const webgl = new WebglAddon()
    webgl.onContextLoss(() => {
      try {
        webgl.dispose()
      } catch {
        /* 已释放 */
      }
    })
    term.loadAddon(webgl)
  } catch {
    /* WebGL 不可用：保持 DOM 渲染器 */
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

/**
 * 新建标签页。spawnSpec 为创建帧的可变部分（本地 {t:'spawn',cwd} / SSH
 * {t:'ssh',...}），随标签保存以便 respawn 复用；label 为标签标题（SSH 标签
 * 传连接名或 user@host，缺省显示「终端 N」）。
 */
function addTab(spawnSpec, label) {
  const sid = newSid()
  const tab = {
    sid,
    term: null,
    fit: null,
    search: null,
    termEl: null,
    overlayEl: null,
    exited: false,
    spawned: false,
    spawnSpec: spawnSpec ?? { t: 'spawn', cwd: currentCwd() },
    label,
  }
  createTerminal(tab)
  tabs.set(sid, tab)
  tabCounter += 1
  renderTabbar()
  switchTab(sid)
  spawnTab(tab)
  persistTabs()
  return tab
}

/**
 * 页面刷新后恢复标签：沿用持久化的 sid / spawnSpec / label，发 attach 重连
 * 宿主保活的会话（不再 spawnTab）；attach 失败会走 error 浮层（点击 respawn）。
 */
function restoreTab(saved) {
  const tab = {
    sid: saved.sid,
    term: null,
    fit: null,
    search: null,
    termEl: null,
    overlayEl: null,
    exited: false,
    spawned: false,
    spawnSpec: saved.spawnSpec,
    label: typeof saved.label === 'string' ? saved.label : undefined,
  }
  createTerminal(tab)
  tabs.set(tab.sid, tab)
  tabCounter += 1
  renderTabbar()
  switchTab(tab.sid)
  sendFrame({ t: 'attach', sid: tab.sid })
}

/** 按标签保存的 spawnSpec 发创建帧（sid/cols/rows 由本地补齐）。 */
function spawnTab(tab) {
  const dims = tab.fit !== null ? tab.fit.proposeDimensions() : undefined
  sendFrame({
    ...tab.spawnSpec,
    sid: tab.sid,
    cols: dims !== undefined ? dims.cols : 80,
    rows: dims !== undefined ? dims.rows : 24,
  })
}

/** 退出后重开：换新 sid 重新 spawn（保留标签位，复用原 spawnSpec/label）。 */
function respawnTab(oldSid) {
  const old = tabs.get(oldSid)
  if (old === undefined) return
  const spawnSpec = old.spawnSpec
  const label = old.label
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
  const tab = { sid: newSid(), term: null, fit: null, search: null, termEl: null, overlayEl: null, exited: false, spawned: false, spawnSpec, label }
  createTerminal(tab)
  tabs.set(tab.sid, tab)
  renderTabbar()
  switchTab(tab.sid)
  spawnTab(tab)
  persistTabs()
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
  else persistTabs()
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
    // 标签标题：SSH 标签用 label（连接名 / target），本地标签用「终端 N」
    const labelEl = document.createElement('span')
    labelEl.textContent = tab.label || '终端 ' + tabCounterLabel(sid)
    // 双击重命名：行内 input，Enter/失焦提交（空还原），Esc 取消
    labelEl.addEventListener('dblclick', (event) => {
      event.stopPropagation()
      startTabRename(sid, btn)
    })
    const closeEl = document.createElement('span')
    closeEl.className = 'tt_tabClose'
    closeEl.title = '关闭'
    closeEl.textContent = '✕'
    btn.title = labelEl.textContent
    btn.appendChild(labelEl)
    btn.appendChild(closeEl)
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
  add.title = '新建（本地 / SSH）'
  add.textContent = '+'
  add.addEventListener('click', () => {
    openAddMenu(add)
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

/** 行内重命名标签：Enter/失焦提交（空则还原默认），Esc 取消；写回持久化。 */
function startTabRename(sid, tabBtn) {
  const tab = tabs.get(sid)
  if (tab === undefined || tabBtn.querySelector('.tt_tabRename') !== null) return
  const labelEl = tabBtn.querySelector('span:not(.tt_tabClose)')
  if (labelEl === null) return
  const input = document.createElement('input')
  input.className = 'tt_tabRename'
  input.value = tab.label || '终端 ' + tabCounterLabel(sid)
  labelEl.replaceWith(input)
  input.focus()
  input.select()
  let done = false
  const commit = () => {
    if (done) return
    done = true
    const value = input.value.trim()
    tab.label = value !== '' ? value : undefined
    renderTabbar()
    persistTabs()
  }
  const cancel = () => {
    if (done) return
    done = true
    renderTabbar()
  }
  input.addEventListener('keydown', (event) => {
    event.stopPropagation()
    if (event.key === 'Enter') commit()
    else if (event.key === 'Escape') cancel()
  })
  input.addEventListener('blur', commit)
  input.addEventListener('click', (event) => event.stopPropagation())
}

/* ============================ 「+」菜单 / SSH 连接 ============================ */

/** 连接簿缓存同步：config 快照里带 sshHosts 时整体覆盖（设置卡片保存后也走这里）。 */
function syncSshHostsCache(config) {
  if (config !== null && typeof config === 'object' && Array.isArray(config.sshHosts)) {
    sshHostsCache = config.sshHosts
  }
}

/** 连接簿条目的展示副标题：user@host[:port] · auth[ · fwd]。 */
function sshHostTargetLabel(entry) {
  const port = Number(entry?.port)
  const suffix = Number.isInteger(port) && port !== 22 ? ':' + port : ''
  const auth = entry?.auth === 'key' ? 'key' : entry?.auth === 'password' ? 'password' : 'agent'
  const fwd = entry?.agentForward === true ? ' · fwd' : ''
  return String(entry?.username ?? '') + '@' + String(entry?.host ?? '') + suffix + ' · ' + auth + fwd
}

/** 拉取连接簿（失败静默保留旧缓存）；菜单开着时原位刷新条目。 */
async function refreshSshHosts() {
  try {
    const res = await fetch('/api/dsh-tty/config', { cache: 'no-store' })
    const data = await res.json()
    if (data.ok && typeof data.config === 'object' && data.config !== null) {
      const before = sshHostsCache
      syncSshHostsCache(data.config)
      if (addMenuEl !== null && sshHostsCache !== before) renderAddMenuItems(addMenuEl)
    }
  } catch {
    /* 网络失败：保留旧缓存 */
  }
}

function onDocAddMenuMouseDown(event) {
  if (addMenuEl === null) return
  // 点在菜单里或「+」上（由「+」自己 toggle）不收起，其余一律收起
  if (event.target instanceof Element && (addMenuEl.contains(event.target) || event.target.closest('.tt_tabAdd') !== null)) return
  closeAddMenu()
}

/** 标签栏「+」菜单：本地终端 / SSH 连接簿 / SSH 连接…（再点一次「+」收起）。 */
function openAddMenu(anchorBtn) {
  if (addMenuEl !== null) {
    closeAddMenu()
    return
  }
  void refreshSshHosts()
  const menu = document.createElement('div')
  menu.className = 'tt_addMenu'
  addMenuEl = menu
  renderAddMenuItems(menu)
  document.body.appendChild(menu)
  const rect = anchorBtn.getBoundingClientRect()
  menu.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 340)) + 'px'
  menu.style.top = rect.bottom + 4 + 'px'
  document.addEventListener('mousedown', onDocAddMenuMouseDown, true)
}

function closeAddMenu() {
  if (addMenuEl === null) return
  document.removeEventListener('mousedown', onDocAddMenuMouseDown, true)
  addMenuEl.remove()
  addMenuEl = null
}

function addMenuItem(menu, label, sub, onClick) {
  const item = document.createElement('button')
  item.type = 'button'
  item.className = 'tt_addMenuItem'
  const main = document.createElement('span')
  main.textContent = label
  item.appendChild(main)
  if (sub !== '') {
    const subEl = document.createElement('span')
    subEl.className = 'tt_addMenuSub'
    subEl.textContent = sub
    item.appendChild(subEl)
  }
  item.addEventListener('click', onClick)
  menu.appendChild(item)
}

function renderAddMenuItems(menu) {
  menu.textContent = ''
  addMenuItem(menu, '本地终端', '在当前会话工作目录打开', () => {
    closeAddMenu()
    addTab()
  })
  const sep1 = document.createElement('div')
  sep1.className = 'tt_addMenuSep'
  menu.appendChild(sep1)
  const bookTitle = document.createElement('div')
  bookTitle.className = 'tt_addMenuTitle'
  bookTitle.textContent = 'SSH 连接簿'
  menu.appendChild(bookTitle)
  for (const entry of sshHostsCache) {
    if (entry === null || typeof entry !== 'object' || typeof entry.name !== 'string' || entry.name === '') continue
    // 条目行 = 连接项（点击连接）+ ✎ 编辑（打开对话框编辑模式）
    const rowEl = document.createElement('div')
    rowEl.className = 'tt_addMenuRow'
    const item = document.createElement('button')
    item.type = 'button'
    item.className = 'tt_addMenuItem'
    const main = document.createElement('span')
    main.textContent = entry.name
    const sub = document.createElement('span')
    sub.className = 'tt_addMenuSub'
    sub.textContent = sshHostTargetLabel(entry)
    item.appendChild(main)
    item.appendChild(sub)
    item.addEventListener('click', () => {
      closeAddMenu()
      addTab({ t: 'ssh', name: entry.name }, entry.name)
    })
    const edit = document.createElement('button')
    edit.type = 'button'
    edit.className = 'tt_addMenuEdit'
    edit.title = '编辑连接'
    edit.textContent = '✎'
    edit.addEventListener('click', () => {
      closeAddMenu()
      openSshDialog(entry)
    })
    rowEl.appendChild(item)
    rowEl.appendChild(edit)
    menu.appendChild(rowEl)
  }
  if (sshHostsCache.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'tt_addMenuTitle'
    empty.textContent = '（空 — 在设置卡片或「SSH 连接…」里保存）'
    menu.appendChild(empty)
  }
  const sep2 = document.createElement('div')
  sep2.className = 'tt_addMenuSep'
  menu.appendChild(sep2)
  addMenuItem(menu, 'SSH 连接…', '手动填写主机 / 用户 / 认证方式', () => {
    closeAddMenu()
    openSshDialog()
  })
}

/**
 * SSH 连接对话框：host/port/username/auth（agent/key/password，key 附
 * keyPath/passphrase，password 附密码）+「保存到连接簿」与名称。传入 entry
 * 时为编辑模式（「+」菜单 ✎ 进入）：预填全字段，出现「保存修改」按钮
 * （按原始名称替换条目，支持改名），连接按钮照常可用。
 * 字段全部用 DOM API 创建与取值，用户输入不经过 innerHTML。
 */
function openSshDialog(entry) {
  if (sshDialogEl !== null) return
  const editing = entry !== null && typeof entry === 'object' ? entry : null
  const isEdit = editing !== null
  const backdrop = document.createElement('div')
  backdrop.className = 'tt_sshBackdrop'
  const card = document.createElement('div')
  card.className = 'tt_sshCard'

  const title = document.createElement('div')
  title.className = 'tt_sshTitle'
  title.textContent = isEdit ? '编辑连接 — ' + String(editing.name ?? '') : 'SSH 连接'
  card.appendChild(title)

  const fields = {}
  const fieldRow = (key, labelText, options) => {
    const row = document.createElement('label')
    row.className = 'tt_sshRow'
    const label = document.createElement('span')
    label.className = 'tt_cardLabel'
    label.textContent = labelText
    row.appendChild(label)
    let input
    if (options?.select !== undefined) {
      input = document.createElement('select')
      for (const option of options.select) {
        const optionEl = document.createElement('option')
        optionEl.value = option.value
        optionEl.textContent = option.label
        input.appendChild(optionEl)
      }
    } else {
      input = document.createElement('input')
      input.type = options?.type ?? 'text'
      input.placeholder = options?.placeholder ?? ''
    }
    input.className = 'tt_cardInput'
    input.autocomplete = 'off'
    input.spellcheck = false
    row.appendChild(input)
    fields[key] = input
    return row
  }

  const grid = document.createElement('div')
  grid.className = 'tt_sshGrid'
  grid.appendChild(fieldRow('host', '主机', { placeholder: 'example.com 或 IP' }))
  grid.appendChild(fieldRow('port', '端口', { placeholder: '22' }))
  card.appendChild(grid)
  card.appendChild(fieldRow('username', '用户名', { placeholder: 'root' }))
  card.appendChild(fieldRow('auth', '认证方式', {
    select: [
      { value: 'agent', label: 'agent — 使用本机 ssh-agent' },
      { value: 'key', label: 'key — 私钥文件' },
      { value: 'password', label: 'password — 密码' },
    ],
  }))
  const keyRow = fieldRow('keyPath', '私钥路径', { placeholder: '~/.ssh/id_ed25519' })
  const passphraseRow = fieldRow('passphrase', '私钥口令（可空）', { type: 'password' })
  const passwordRow = fieldRow('password', '密码', { type: 'password' })

  /**
   * env:VAR 选择器：筛选框 + 限高滚动列表（数据源为 env 插件托管的变量名，
   * 宿主 /api/dsh-tty/env-vars 只回名字）。点击项填入 env:NAME；列表空时给
   * 「去 env 插件托管」的提示。
   */
  const envSelectRow = (targetInput) => {
    const row = document.createElement('div')
    row.className = 'tt_sshRow'
    const filter = document.createElement('input')
    filter.type = 'text'
    filter.className = 'tt_cardInput'
    filter.placeholder = '筛选 env 托管变量后点击填入'
    filter.autocomplete = 'off'
    filter.spellcheck = false
    const list = document.createElement('div')
    list.className = 'tt_envList'
    let names = []
    const renderList = () => {
      list.textContent = ''
      if (names.length === 0) {
        const hint = document.createElement('span')
        hint.className = 'tt_cardHint'
        hint.textContent = 'env 插件还没有托管变量 — 在其设置卡片添加后这里可选，也可手输 env:NAME'
        list.appendChild(hint)
        return
      }
      const kw = filter.value.trim().toUpperCase()
      const hit = kw === '' ? names : names.filter((name) => name.toUpperCase().includes(kw))
      for (const name of hit.slice(0, 30)) {
        const item = document.createElement('button')
        item.type = 'button'
        item.className = 'tt_envItem'
        item.textContent = name
        item.addEventListener('click', () => {
          targetInput.value = 'env:' + name
        })
        list.appendChild(item)
      }
      if (hit.length > 30) {
        const more = document.createElement('span')
        more.className = 'tt_envMore'
        more.textContent = '还有 ' + (hit.length - 30) + ' 个 — 继续输入筛选'
        list.appendChild(more)
      } else if (hit.length === 0) {
        const none = document.createElement('span')
        none.className = 'tt_envMore'
        none.textContent = '没有匹配的变量'
        list.appendChild(none)
      }
    }
    filter.addEventListener('input', renderList)
    row.appendChild(filter)
    row.appendChild(list)
    return {
      row,
      setNames(next) {
        names = Array.isArray(next) ? next : []
        renderList()
      },
    }
  }
  const passphraseEnv = envSelectRow(fields.passphrase)
  const passwordEnv = envSelectRow(fields.password)
  let envNamesLoaded = false
  const loadEnvNames = async () => {
    if (envNamesLoaded) return
    envNamesLoaded = true
    try {
      const res = await fetch('/api/dsh-tty/env-vars', { cache: 'no-store' })
      const data = await res.json()
      if (data.ok && Array.isArray(data.names)) {
        passphraseEnv.setNames(data.names)
        passwordEnv.setNames(data.names)
      }
    } catch {
      /* 网络失败：列表保持空态提示 */
    }
  }
  void loadEnvNames()

  card.appendChild(keyRow)
  card.appendChild(passphraseRow)
  card.appendChild(passphraseEnv.row)
  card.appendChild(passwordRow)
  card.appendChild(passwordEnv.row)

  const fwdRow = document.createElement('label')
  fwdRow.className = 'tt_cardRow'
  const fwdCheck = document.createElement('input')
  fwdCheck.type = 'checkbox'
  fwdCheck.className = 'tt_cardCheckbox'
  const fwdLabel = document.createElement('span')
  fwdLabel.className = 'tt_cardLabel'
  fwdLabel.textContent = 'agent forwarding（远程可用本地 ssh-agent 钥匙，如远程 git clone）'
  fwdRow.appendChild(fwdCheck)
  fwdRow.appendChild(fwdLabel)
  card.appendChild(fwdRow)

  const saveRow = document.createElement('label')
  saveRow.className = 'tt_cardRow'
  const saveCheck = document.createElement('input')
  saveCheck.type = 'checkbox'
  saveCheck.className = 'tt_cardCheckbox'
  const saveLabel = document.createElement('span')
  saveLabel.className = 'tt_cardLabel'
  saveLabel.textContent = '保存到连接簿（同名覆盖）'
  saveRow.appendChild(saveCheck)
  saveRow.appendChild(saveLabel)
  card.appendChild(saveRow)
  const nameRow = fieldRow('name', '连接簿名称', { placeholder: '留空则用主机名' })
  nameRow.style.display = 'none'
  card.appendChild(nameRow)
  saveCheck.addEventListener('change', () => {
    nameRow.style.display = saveCheck.checked ? '' : 'none'
    if (saveCheck.checked && fields.name.value.trim() === '' && fields.host.value.trim() !== '') {
      fields.name.value = fields.host.value.trim()
    }
    if (saveCheck.checked) fields.name.focus()
  })
  // 编辑模式：不勾选保存，直接以「保存修改」写回连接簿（名称字段常驻可改名）
  if (isEdit) {
    saveRow.style.display = 'none'
    fields.name.value = String(editing.name ?? '')
    nameRow.style.display = ''
    fields.host.value = String(editing.host ?? '')
    fields.port.value = String(editing.port ?? 22)
    fields.username.value = String(editing.username ?? '')
    fields.auth.value = editing.auth === 'key' || editing.auth === 'password' ? String(editing.auth) : 'agent'
    fields.keyPath.value = String(editing.keyPath ?? '')
    fields.passphrase.value = String(editing.passphrase ?? '')
    fields.password.value = String(editing.password ?? '')
  }

  const errorEl = document.createElement('div')
  errorEl.className = 'tt_sshError'
  card.appendChild(errorEl)

  const actions = document.createElement('div')
  actions.className = 'tt_sshActions'
  const cancelBtn = document.createElement('button')
  cancelBtn.type = 'button'
  cancelBtn.className = 'tt_toolBtn'
  cancelBtn.textContent = '取消'
  const connectBtn = document.createElement('button')
  connectBtn.type = 'button'
  connectBtn.className = 'tt_cardSave'
  connectBtn.textContent = '连接'
  actions.appendChild(cancelBtn)
  let saveEditBtn = null
  if (isEdit) {
    saveEditBtn = document.createElement('button')
    saveEditBtn.type = 'button'
    saveEditBtn.className = 'tt_toolBtn'
    saveEditBtn.textContent = '保存修改'
    saveEditBtn.addEventListener('click', () => {
      errorEl.textContent = ''
      const host = fields.host.value.trim()
      const username = fields.username.value.trim()
      if (host === '' || username === '') {
        errorEl.textContent = '主机与用户名必填'
        return
      }
      let port = Number(fields.port.value)
      if (!Number.isInteger(port) || port < 1 || port > 65535) port = 22
      const auth = fields.auth.value
      const name = fields.name.value.trim() || host
      const next = {
        name,
        host,
        port,
        username,
        auth,
        keyPath: auth === 'key' ? fields.keyPath.value.trim() : '',
        passphrase: fields.passphrase.value,
        password: fields.password.value,
        agentForward: fwdCheck.checked,
      }
      if (auth === 'key' && next.keyPath === '') {
        errorEl.textContent = 'auth=key 需要私钥路径'
        return
      }
      if (saveEditBtn !== null) saveEditBtn.disabled = true
      void saveSshHostUpdate(String(editing.name ?? ''), next).then((error) => {
        if (saveEditBtn !== null) saveEditBtn.disabled = false
        if (error !== undefined) {
          errorEl.textContent = '保存失败：' + error
          return
        }
        closeSshDialog()
      })
    })
    actions.appendChild(saveEditBtn)
  }
  actions.appendChild(connectBtn)
  card.appendChild(actions)

  const syncAuthRows = () => {
    keyRow.style.display = fields.auth.value === 'key' ? '' : 'none'
    passphraseRow.style.display = fields.auth.value === 'key' ? '' : 'none'
    passphraseEnv.row.style.display = fields.auth.value === 'key' ? '' : 'none'
    passwordRow.style.display = fields.auth.value === 'password' ? '' : 'none'
    passwordEnv.row.style.display = fields.auth.value === 'password' ? '' : 'none'
  }
  fields.auth.addEventListener('change', syncAuthRows)
  syncAuthRows()

  cancelBtn.addEventListener('click', () => closeSshDialog())
  backdrop.addEventListener('mousedown', (event) => {
    if (event.target === backdrop) closeSshDialog()
  })

  connectBtn.addEventListener('click', () => {
    errorEl.textContent = ''
    const host = fields.host.value.trim()
    const username = fields.username.value.trim()
    let port = Number(fields.port.value)
    if (!Number.isInteger(port) || port < 1 || port > 65535) port = 22
    if (host === '' || username === '') {
      errorEl.textContent = '主机与用户名必填'
      return
    }
    const auth = fields.auth.value
    const spec = { t: 'ssh', host, port, username, auth }
    if (auth === 'key') {
      const keyPath = fields.keyPath.value.trim()
      if (keyPath !== '') spec.keyPath = keyPath
      const passphrase = fields.passphrase.value
      if (passphrase !== '') spec.passphrase = passphrase
    }
    if (auth === 'password') {
      const password = fields.password.value
      if (password !== '') spec.password = password
    }
    if (fwdCheck.checked) spec.agentForward = true
    const targetLabel = port !== 22 ? username + '@' + host + ':' + port : username + '@' + host
    const proceed = (bookName) => {
      closeSshDialog()
      if (modalEl === null) return // 对话框存续期间面板被关闭：不再开标签
      addTab(spec, bookName !== '' ? bookName : targetLabel)
    }
    if (!saveCheck.checked) {
      proceed('')
      return
    }
    const bookName = fields.name.value.trim() || host
    connectBtn.disabled = true
    void saveSshHostEntry({
      name: bookName,
      host,
      port,
      username,
      auth,
      keyPath: spec.keyPath ?? '',
      passphrase: spec.passphrase ?? '',
      password: spec.password ?? '',
      agentForward: fwdCheck.checked,
    }).then((error) => {
      connectBtn.disabled = false
      if (error !== undefined) {
        errorEl.textContent = '保存连接簿失败：' + error
        return
      }
      proceed(bookName)
    })
  })

  backdrop.appendChild(card)
  document.body.appendChild(backdrop)
  sshDialogEl = backdrop
  fields.host.focus()
}

function closeSshDialog() {
  if (sshDialogEl === null) return
  sshDialogEl.remove()
  sshDialogEl = null
}

/** 保存一条连接簿：sshHosts 整体替换（同名覆盖）；返回错误信息或 undefined。 */
async function saveSshHostEntry(entry) {
  const next = [...sshHostsCache.filter((host) => host?.name !== entry.name), entry]
  try {
    const res = await fetch('/api/dsh-tty/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sshHosts: next }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.ok) return String(data.error || 'HTTP ' + res.status)
    syncSshHostsCache(data.config)
    return undefined
  } catch (error) {
    return String(error && error.message ? error.message : error)
  }
}

/** 编辑保存：按原始名称替换连接簿条目（支持改名，冲突校验）；返回错误信息或 undefined。 */
async function saveSshHostUpdate(originalName, entry) {
  if (entry.name !== originalName && sshHostsCache.some((host) => host?.name === entry.name)) {
    return '连接簿里已有同名条目: ' + entry.name
  }
  const next = sshHostsCache.map((host) => (host?.name === originalName ? entry : host))
  try {
    const res = await fetch('/api/dsh-tty/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sshHosts: next }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.ok) return String(data.error || 'HTTP ' + res.status)
    syncSshHostsCache(data.config)
    return undefined
  } catch (error) {
    return String(error && error.message ? error.message : error)
  }
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

/** 断线自动重连：指数退避封顶 5s；面板开着就一直尝试，✕ 关闭时停止。 */
function scheduleReconnect() {
  if (intentionalClose || modalEl === null || reconnectTimer !== null) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, reconnectDelay)
  reconnectDelay = Math.min(reconnectDelay * 2, 5000)
}

/**
 * 连接建立后的恢复流程：
 *   - 面板内还有未退出标签（同页断线重连）→ 逐个 attach 回场；
 *   - 空面板但有 sessionStorage 持久化（页面刷新后重开）→ 查询宿主仍保活
 *     的会话，能 attach 的恢复标签，其余丢弃；都没有则新建首个标签。
 */
async function afterSocketOpen() {
  const restored = loadPersistedTabs()
  if (tabs.size === 0) {
    if (restored.length > 0) {
      sendFrame({ t: 'sessions' })
      const frame = await waitFrame('sessions', 4000)
      const alive = new Map()
      if (frame !== null && Array.isArray(frame.list)) {
        for (const entry of frame.list) {
          if (entry !== null && typeof entry === 'object' && entry.attachable === true) alive.set(entry.sid, entry)
        }
      }
      for (const saved of restored) {
        if (!alive.has(saved.sid)) continue
        restoreTab(saved)
      }
      persistTabs()
    }
    if (tabs.size === 0) addTab()
    return
  }
  for (const tab of [...tabs.values()]) {
    if (tab.exited) continue
    sendFrame({ t: 'attach', sid: tab.sid })
  }
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
  clearTimeout(reconnectTimer)
  reconnectTimer = null
  connecting = true
  setStatus('连接中…', '')
  try {
    socket = new WebSocket(wsUrl())
  } catch (error) {
    connecting = false
    setStatus('连接失败：' + error.message, 'error')
    scheduleReconnect()
    return
  }

  socket.onopen = () => {
    connecting = false
    reconnectDelay = 1000
    setStatus('已连接', 'connected')
    void afterSocketOpen()
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
      // SSH 会话 ready 带 target（user@host[:port]，pid 为 null）；本地带 pid。
      // attach 重连也复用 ready 帧（多带 reattached:true），后跟一帧 data 回放缓冲
      const target = typeof msg.target === 'string' ? msg.target : ''
      setStatus(msg.kind === 'ssh' ? 'SSH ' + (target !== '' ? target + ' ' : '') + '已连接' : '已连接 pid=' + msg.pid, 'connected')
      const tab = tabs.get(sid)
      if (tab !== undefined) {
        tab.exited = false
        tab.spawned = true
        if (msg.kind === 'ssh' && target !== '' && !tab.label) {
          tab.label = target // 标签缺标题时（如旧缓存条目）用宿主回显的 target
          renderTabbar()
        }
        showTabOverlay(tab, '')
        sendResize(tab) // spawn/attach 就绪后补一次精确尺寸
        syncEntryBadge() // 断线重连后徽标计数恢复
        persistTabs()
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
        syncEntryBadge() // 最小化时徽标计数同步减少
        persistTabs() // 已退出的标签不再持久化
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
    setStatus('连接断开 — 自动重连中', 'error')
    // 不再把未退出标签标记为 exited：会话在宿主保活，重连后 attach 恢复
    for (const tab of tabs.values()) {
      if (!tab.exited) showTabOverlay(tab, '连接断开 — 自动重连中…')
    }
    scheduleReconnect()
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

/** 最小化：隐藏弹窗但保留 DOM / WebSocket / xterm 缓冲；状态合并进侧边栏入口。 */
function minimizeModal() {
  if (modalEl === null || minimized) return
  closeAddMenu()
  closeSshDialog()
  minimized = true
  if (searchInputEl !== null) searchInputEl.style.display = 'none'
  modalEl.dataset.minimized = ''
  if (document.querySelector('[data-dsh-tty-entry]') !== null) {
    syncEntryBadge()
  } else {
    // 兜底：侧边栏入口不在（被宿主卸载等）才用紧凑悬浮条
    buildDock()
    dockEl.classList.add('tt_dockCompact')
  }
}

/**
 * 最小化状态的唯一可见载体是侧边栏「终端」入口本身：
 * 入口右侧追加「运行中/总数」徽标与状态点，点击入口即恢复（openModal 已处理）。
 */
function syncEntryBadge() {
  const entry = document.querySelector('[data-dsh-tty-entry]')
  if (entry === null) return
  let badge = entry.querySelector('.tt_sidebarEntryBadge')
  if (!minimized) {
    if (badge !== null) badge.remove()
    delete entry.dataset.minimized
    entry.removeAttribute('title')
    return
  }
  if (badge === null) {
    badge = document.createElement('span')
    badge.className = 'tt_sidebarEntryBadge'
    badge.innerHTML = '<span class="tt_sidebarBadgeDot"></span><span class="tt_sidebarBadgeCount"></span>'
    entry.appendChild(badge)
  }
  entry.title = '终端已最小化 — 点击恢复'
  const running = [...tabs.values()].filter((tab) => !tab.exited).length
  badge.querySelector('.tt_sidebarBadgeCount').textContent = running + '/' + tabs.size
  const dot = badge.querySelector('.tt_sidebarBadgeDot')
  if (dot !== null && statusDotEl !== null) dot.dataset.state = statusDotEl.dataset.state ?? ''
}

/** 最小化期间有输出到达：脉冲提示（入口徽标状态点，兜底时为悬浮条状态点）。 */
function flashDockActivity() {
  if (!minimized) return
  const dot = document.querySelector('[data-dsh-tty-entry] .tt_sidebarBadgeDot') ?? dockDotEl
  if (dot === null) return
  dot.dataset.active = ''
  clearTimeout(dockActivityTimer)
  dockActivityTimer = setTimeout(() => {
    delete dot.dataset.active
  }, 900)
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
  syncEntryBadge()
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
  closeAddMenu()
  closeSshDialog()
  clearTimeout(dockActivityTimer)
  clearTimeout(reconnectTimer)
  reconnectTimer = null
  reconnectDelay = 1000
  if (dockEl !== null) {
    dockEl.remove()
    dockEl = null
  }
  dockCountEl = null
  dockStatusEl = null
  dockDotEl = null
  syncEntryBadge()
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
  // 主动关闭 = 结束全部会话：清掉持久化，下次打开从全新面板开始
  try {
    sessionStorage.removeItem(PERSIST_KEY)
  } catch {
    /* 忽略 */
  }
}

function onModalKeydown(event) {
  if (event.key === 'Escape' && modalEl !== null) {
    event.preventDefault()
    // Esc 优先关浮层（SSH 对话框 /「+」菜单），再最小化（会话保活）；✕ 才真正关闭
    if (sshDialogEl !== null) {
      closeSshDialog()
      return
    }
    if (addMenuEl !== null) {
      closeAddMenu()
      return
    }
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

// 与官方 GUI / 其他插件设置卡片一致的「V」形展开箭头（14×14，展开时旋转 180°）
const CHEVRON_PATH = 'M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 9.13382 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z'

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
      if (data.ok && typeof data.config === 'object' && data.config !== null) {
        setForm(data.config)
        syncSshHostsCache(data.config) // 连接簿缓存与设置保持一致（「+」菜单共用）
      } else setMessage({ kind: 'error', text: String(data.error || '读取配置失败') })
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
  const [editing, setEditing] = React.useState(null)
  const [editForm, setEditForm] = React.useState(null)
  const [editError, setEditError] = React.useState('')
  /** 进入编辑：复制条目到表单（按原始 name 定位，改名也安全）。 */
  const startEditSshHost = (host) => {
    setEditing(host?.name ?? null)
    setEditError('')
    setEditForm({
      name: host?.name ?? '',
      host: host?.host ?? '',
      port: String(host?.port ?? 22),
      username: host?.username ?? '',
      auth: host?.auth === 'key' || host?.auth === 'password' ? host.auth : 'agent',
      keyPath: host?.keyPath ?? '',
      passphrase: host?.passphrase ?? '',
      password: host?.password ?? '',
      agentForward: host?.agentForward === true,
    })
  }
  const cancelEditSshHost = () => {
    setEditing(null)
    setEditForm(null)
    setEditError('')
  }
  /** 应用编辑：按原始 name 替换条目（支持改名）；只改本地表单，随「保存」写入。 */
  const applyEditSshHost = () => {
    if (editForm === null) return
    const name = editForm.name.trim()
    const hostAddr = editForm.host.trim()
    const username = editForm.username.trim()
    if (name === '' || hostAddr === '' || username === '') {
      setEditError('名称、主机、用户名必填')
      return
    }
    let port = Number(editForm.port)
    if (!Number.isInteger(port) || port < 1 || port > 65535) port = 22
    if ((form?.sshHosts ?? []).some((h) => h?.name === name && name !== editing)) {
      setEditError('连接簿里已有同名条目: ' + name)
      return
    }
    if (editForm.auth === 'key' && editForm.keyPath.trim() === '') {
      setEditError('auth=key 需要私钥路径')
      return
    }
    setForm((current) => ({
      ...(current || {}),
      sshHosts: (Array.isArray(current?.sshHosts) ? current.sshHosts : []).map((h) => h?.name === editing
        ? {
            name,
            host: hostAddr,
            port,
            username,
            auth: editForm.auth,
            keyPath: editForm.keyPath.trim(),
            passphrase: editForm.passphrase,
            password: editForm.password,
            agentForward: editForm.agentForward,
          }
        : h),
    }))
    setEditing(null)
    setEditForm(null)
    setEditError('')
    setMessage({ kind: 'ok', text: '已修改条目「' + name + '」— 随「保存」写入配置' })
  }
  /** 删除连接簿条目（随「保存」一并提交）。 */
  const removeSshHost = (name) => {
    if (editing === name) cancelEditSshHost()
    setForm((current) => ({
      ...(current || {}),
      sshHosts: (Array.isArray(current?.sshHosts) ? current.sshHosts : []).filter((host) => host?.name !== name),
    }))
  }
  /** 立即删除一条 TOFU 主机指纹记录（指纹变更且确认安全后，删掉即可重连）。 */
  const removeHostKey = async (record) => {
    const next = (Array.isArray(form?.hostKeys) ? form.hostKeys : []).filter(
      (hk) => !(hk?.host === record?.host && Number(hk?.port) === Number(record?.port)),
    )
    setForm((current) => ({ ...(current || {}), hostKeys: next }))
    try {
      const res = await fetch('/api/dsh-tty/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hostKeys: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) setMessage({ kind: 'error', text: String(data.error || '删除主机密钥记录失败') })
      else setMessage({ kind: 'ok', text: '已删除主机密钥记录（下次连接重新记录指纹）' })
    } catch (error) {
      setMessage({ kind: 'error', text: String(error && error.message ? error.message : error) })
    }
  }
  /** 从 ~/.ssh/config 导入连接簿候选：同名跳过，随「保存」写入（新增不落盘）。 */
  const importSshConfig = async () => {
    setMessage({ kind: '', text: '' })
    try {
      const res = await fetch('/api/dsh-tty/ssh-config', { cache: 'no-store' })
      const data = await res.json()
      if (!data.ok) {
        setMessage({ kind: 'error', text: String(data.error || '读取 ~/.ssh/config 失败') })
        return
      }
      const candidates = Array.isArray(data.entries) ? data.entries : []
      const merged = [...(Array.isArray(form?.sshHosts) ? form.sshHosts : [])]
      const existing = new Set(merged.map((host) => host?.name))
      let added = 0
      let skipped = 0
      for (const candidate of candidates) {
        if (candidate === null || typeof candidate !== 'object' || typeof candidate.name !== 'string') continue
        if (existing.has(candidate.name)) {
          skipped += 1
          continue
        }
        existing.add(candidate.name)
        merged.push({
          name: candidate.name,
          host: String(candidate.host ?? candidate.name),
          port: Number(candidate.port) || 22,
          username: String(candidate.username ?? ''),
          auth: candidate.auth === 'key' ? 'key' : 'agent',
          keyPath: String(candidate.keyPath ?? ''),
          passphrase: '',
          password: '',
          agentForward: false,
        })
        added += 1
      }
      setForm((current) => ({ ...(current || {}), sshHosts: merged }))
      if (added === 0) setMessage({ kind: 'ok', text: skipped > 0 ? `没有新条目（${skipped} 条同名跳过）` : '~/.ssh/config 里没有可导入的具体主机' })
      else setMessage({ kind: 'ok', text: `已导入 ${added} 条（同名跳过 ${skipped} 条），随「保存」写入配置` })
    } catch (error) {
      setMessage({ kind: 'error', text: String(error && error.message ? error.message : error) })
    }
  }
  /** 从 ~/.ssh/known_hosts 导入指纹（TOFU 预填充）：立即 POST，同名 host:port 跳过。 */
  const importKnownHosts = async () => {
    setMessage({ kind: '', text: '' })
    try {
      const res = await fetch('/api/dsh-tty/known-hosts', { cache: 'no-store' })
      const data = await res.json()
      if (!data.ok) {
        setMessage({ kind: 'error', text: String(data.error || '读取 ~/.ssh/known_hosts 失败') })
        return
      }
      const incoming = Array.isArray(data.entries) ? data.entries : []
      const merged = [...(Array.isArray(form?.hostKeys) ? form.hostKeys : [])]
      const existing = new Set(merged.map((hk) => String(hk?.host ?? '') + ':' + String(hk?.port ?? 22)))
      let added = 0
      let skipped = 0
      for (const record of incoming) {
        if (record === null || typeof record !== 'object' || typeof record.host !== 'string' || typeof record.fingerprint !== 'string') continue
        const key = record.host + ':' + String(record.port ?? 22)
        if (existing.has(key)) {
          skipped += 1
          continue
        }
        existing.add(key)
        merged.push({ host: record.host, port: Number(record.port) || 22, fingerprint: record.fingerprint })
        added += 1
      }
      if (added === 0) {
        setMessage({ kind: 'ok', text: skipped > 0 ? `没有新指纹（${skipped} 条已存在）` : 'known_hosts 里没有可导入的具体主机' })
        return
      }
      setForm((current) => ({ ...(current || {}), hostKeys: merged }))
      try {
        const saveRes = await fetch('/api/dsh-tty/config', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ hostKeys: merged }),
        })
        const saveData = await saveRes.json().catch(() => ({}))
        if (!saveRes.ok || !saveData.ok) {
          setMessage({ kind: 'error', text: String(saveData.error || '保存 hostKeys 失败') })
          return
        }
        setMessage({ kind: 'ok', text: `已导入 ${added} 条指纹（跳过 ${skipped} 条已存在）` })
      } catch (error) {
        setMessage({ kind: 'error', text: String(error && error.message ? error.message : error) })
      }
    } catch (error) {
      setMessage({ kind: 'error', text: String(error && error.message ? error.message : error) })
    }
  }
  const save = async () => {
    setSaving(true)
    setMessage({ kind: '', text: '' })
    // 只提交配置项：快照里的 toolsRegistered 等非配置键会被宿主 normalizePatch 拒绝
    const body = {}
    for (const key of ['enabled', 'announceToAgent', 'maxSessions', 'shell', 'term', 'colorTerm', 'cwd', 'reconnectGraceSec', 'shellIntegration']) {
      const value = (form || {})[key]
      if (value !== undefined && value !== '') body[key] = value
    }
    body.sshHosts = Array.isArray(form?.sshHosts) ? form.sshHosts : []
    try {
      const res = await fetch('/api/dsh-tty/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) setMessage({ kind: 'error', text: String(data.error || '保存失败') })
      else {
        setMessage({ kind: 'ok', text: '已保存并热生效' })
        if (data.config) {
          setForm(data.config)
          syncSshHostsCache(data.config)
        }
      }
    } catch (error) {
      setMessage({ kind: 'error', text: String(error && error.message ? error.message : error) })
    }
    setSaving(false)
  }

  /** 连接簿编辑表单（行内展开；只改本地表单，随卡片「保存」写入）。 */
  const renderSshHostEditor = () => {
    if (editForm === null) return null
    const editField = (label, key, placeholder, type) => jsxs('label', {
      className: 'tt_sshRow',
      children: [
        jsx('span', { className: 'tt_cardLabel', children: label }),
        jsx('input', {
          className: 'tt_cardInput',
          type: type ?? 'text',
          value: editForm[key] ?? '',
          placeholder: placeholder ?? '',
          autoComplete: 'off',
          spellCheck: false,
          onChange: (event) => setEditForm((current) => ({ ...(current || {}), [key]: event.target.value })),
        }),
      ],
    })
    return jsxs('div', {
      className: 'tt_sshEdit',
      children: [
        jsxs('div', { className: 'tt_sshGrid', children: [
          editField('名称', 'name', '同名冲突会被拒绝'),
          editField('端口', 'port', '22'),
        ] }),
        editField('主机', 'host', 'example.com 或 IP'),
        editField('用户名', 'username', 'root'),
        jsxs('label', { className: 'tt_sshRow', children: [
          jsx('span', { className: 'tt_cardLabel', children: '认证方式' }),
          jsxs('select', {
            className: 'tt_cardInput',
            value: editForm.auth,
            onChange: (event) => setEditForm((current) => ({ ...(current || {}), auth: event.target.value })),
            children: [
              jsx('option', { value: 'agent', children: 'agent — 使用本机 ssh-agent' }),
              jsx('option', { value: 'key', children: 'key — 私钥文件' }),
              jsx('option', { value: 'password', children: 'password — 密码' }),
            ],
          }),
        ] }),
        ...(editForm.auth === 'key' ? [editField('私钥路径', 'keyPath', '~/.ssh/id_ed25519'), editField('私钥口令（可空，支持 env:VAR）', 'passphrase', '', 'password')] : []),
        ...(editForm.auth === 'password' ? [editField('密码（支持 env:VAR）', 'password', '', 'password')] : []),
        jsxs('label', { className: 'tt_cardRow', children: [
          jsx('input', { type: 'checkbox', className: 'tt_cardCheckbox', checked: editForm.agentForward === true, onChange: (event) => setEditForm((current) => ({ ...(current || {}), agentForward: event.target.checked })) }),
          jsx('span', { className: 'tt_cardLabel', children: 'agent forwarding' }),
        ] }),
        editError !== '' ? jsx('span', { className: 'tt_cardMessage tt_cardMessageError', children: editError }) : null,
        jsxs('div', { className: 'tt_cardRow', children: [
          jsx('button', { type: 'button', className: 'tt_cardSave', onClick: applyEditSshHost, children: '应用' }),
          jsx('button', { type: 'button', className: 'tt_toolBtn', onClick: cancelEditSshHost, children: '取消' }),
        ] }),
      ],
    })
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
              jsx('span', { className: 'tt_cardDescription', children: 'xterm 终端面板：多标签页、断线自动重连、cwd 跟随会话、SSH 连接簿与主机指纹钉扎；shell / TERM / 并发上限等保存即热生效。' }),
            ],
          }),
          jsx('svg', {
            width: '14',
            height: '14',
            viewBox: '0 0 14 14',
            fill: 'none',
            xmlns: 'http://www.w3.org/2000/svg',
            className: open ? 'tt_cardChevron tt_cardChevronOpen' : 'tt_cardChevron',
            children: jsx('path', { d: CHEVRON_PATH, fill: 'currentColor' }),
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
                boolField('shell 集成（OSC 133/7 注入，tty_capture{last} 与 cwd 跟随依赖它）', 'shellIntegration'),
                textField('并发会话上限（1~16）', 'maxSessions', '4', '超过上限的新标签会被拒绝；保存即热生效'),
                textField('Shell 路径（默认 $SHELL）', 'shell', '', '留空使用 $SHELL'),
                textField('TERM', 'term', 'xterm-256color', 'TUI 程序依赖此值'),
                textField('COLORTERM', 'colorTerm', 'truecolor', ''),
                textField('兜底工作目录（客户端当前会话 cwd 优先）', 'cwd', '', '留空使用宿主进程启动目录'),
                textField('断线保活（秒，0 = 立即结束）', 'reconnectGraceSec', '120', '刷新页面/网络抖动后会话保活等待重连，超时后结束；保存即热生效'),
                jsxs('div', {
                  className: 'tt_cardField',
                  children: [
                    jsx('span', { className: 'tt_cardLabel', children: 'SSH 连接簿' }),
                    ...(Array.isArray(form.sshHosts) && form.sshHosts.length > 0
                      ? [jsx('div', {
                          children: form.sshHosts.map((host) => jsxs('div', {
                            children: [
                              jsxs('div', {
                                className: 'tt_sshHostRow',
                                children: [
                                  jsx('div', { className: 'tt_sshHostMeta', children: [
                                    jsx('span', { className: 'tt_sshHostName', children: host?.name ?? '' }),
                                    jsx('span', { className: 'tt_sshHostTarget', children: sshHostTargetLabel(host ?? {}) }),
                                  ] }),
                                  jsx('button', { type: 'button', className: 'tt_toolBtn', onClick: () => startEditSshHost(host), children: '编辑' }),
                                  jsx('button', { type: 'button', className: 'tt_toolBtn', onClick: () => removeSshHost(host?.name), children: '删除' }),
                                ],
                              }),
                              editing === host?.name ? renderSshHostEditor() : null,
                            ],
                          }, String(host?.name ?? ''))),
                        })]
                      : [jsx('span', { className: 'tt_cardHint', children: '暂无条目 — 终端面板「+」→ SSH 连接… 勾选「保存到连接簿」即可添加' })]),
                    jsxs('div', {
                      className: 'tt_cardRow',
                      children: [
                        jsx('button', { type: 'button', className: 'tt_toolBtn', onClick: () => void importSshConfig(), children: '从 ~/.ssh/config 导入' }),
                        jsx('span', { className: 'tt_cardHint', children: '同名跳过；随「保存」写入配置' }),
                      ],
                    }),
                    jsx('span', { className: 'tt_cardHint', children: '随「保存」一并写入配置；密码/口令支持 env:VAR 引用，避免明文入库' }),
                  ],
                }),
                jsxs('div', {
                  className: 'tt_cardField',
                  children: [
                    jsxs('div', {
                      className: 'tt_cardRow',
                      children: [
                        jsx('span', { className: 'tt_cardLabel', children: 'SSH 主机密钥记录（TOFU）' }),
                        jsx('button', { type: 'button', className: 'tt_toolBtn', onClick: () => void importKnownHosts(), children: '从 known_hosts 导入' }),
                      ],
                    }),
                    ...(Array.isArray(form.hostKeys) && form.hostKeys.length > 0
                      ? [jsx('div', {
                          children: form.hostKeys.map((hk) => jsxs('div', {
                            className: 'tt_sshHostRow',
                            children: [
                              jsx('div', { className: 'tt_sshHostMeta', children: [
                                jsx('span', { className: 'tt_sshHostName', children: String(hk?.host ?? '') + ':' + String(hk?.port ?? 22) }),
                                jsx('span', { className: 'tt_sshHostTarget', children: 'sha256:' + String(hk?.fingerprint ?? '') }),
                              ] }),
                              jsx('button', { type: 'button', className: 'tt_toolBtn', onClick: () => void removeHostKey(hk), children: '删除' }),
                            ],
                          }, String(hk?.host ?? '') + ':' + String(hk?.port ?? 22))),
                        })]
                      : [jsx('span', { className: 'tt_cardHint', children: '暂无记录 — 首次 SSH 连接成功后自动记录主机指纹' })]),
                    jsx('span', { className: 'tt_cardHint', children: '主机指纹变更时连接会被拒绝（防中间人）；确认安全后删除对应记录即可重连' }),
                  ],
                }),
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
