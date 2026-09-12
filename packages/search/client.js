/* eslint-disable */
/**
 * @hyzyn/dsh-search — 浏览器半体：侧边栏「全局搜索」入口 + 命令面板式搜索窗。
 *
 * 面板结构（对齐主流命令面板 / 桌面端搜索窗的观感）：
 *   无边框输入行 → 分组行（最近会话 / 历史会话 / Prompt / MCP 工具 / 快捷操作 / 设置）
 *   → 底部按键提示条。行 = 图标 + 标题（可带副标题）+ 右侧元信息 + 快捷键胶囊。
 *
 * 打开即出内容：最近会话取自浏览器端 sessions 列表快照，快捷操作与设置目录即时渲染；
 * 输入后本地先过滤一遍（零延迟），宿主全文命中再由 /api/dsh-search/query 异步补齐。
 * 纯 DOM 渲染，无构建步骤；宿主经 /plugins/@hyzyn/dsh-search/client.js 提供。
 */
window.__ModuleLoader__.load({
  id: '@hyzyn/dsh-search',
  factory: (require) => {
    const exports = {}

    /* ================================ CSS ================================ */

    const CSS = [
      // 侧边栏不在宿主 box-sizing reset 的作用域内：width:100% + 左右 padding 会按
      // content-box 撑出 24px，右侧被侧边栏裁掉（hover 底色右边缺角）。必须显式声明。
      '.gs_sidebarSearch{box-sizing:border-box;width:100%;height:32px;color:var(--dsw-alias-label-secondary);cursor:text;white-space:nowrap;background:0 0;border:1px solid transparent;border-radius:8px;align-items:center;gap:8px;padding:0 10px;font-size:13px;display:flex}',
      '.gs_sidebarSearch:hover{background:var(--dsw-specific-sidebar-nav-item-hover);color:var(--dsw-alias-label-primary)}',
      '.gs_sidebarSearch:focus-within{border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-specific-sidebar-nav-item-active);color:var(--dsw-alias-label-primary)}',
      '.gs_sidebarSearchInput{flex:1;min-width:0;background:0 0;border:none;outline:none;color:inherit;font:inherit;padding:0}',
      '.gs_sidebarSearchInput:focus,.gs_sidebarSearchInput:focus-visible{outline:none}',
      '.gs_sidebarSearch:focus-within .gs_sidebarSearchInput{outline:none}',
      '.gs_sidebarSearchInput::placeholder{color:var(--dsw-alias-label-tertiary)}',
      '[data-sidebar-collapsed] .gs_sidebarSearch{justify-content:center;width:100%;padding:0;border-color:transparent}',
      '[data-sidebar-collapsed] .gs_sidebarSearchInput{display:none}',

      /* ---------- 面板骨架 ---------- */
      '.gs_backdrop{z-index:1300;background:var(--dsw-alias-bg-mask-1);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);justify-content:center;align-items:flex-start;display:flex;position:fixed;inset:0;padding:12vh 16px 24px}',
      '.gs_palette{background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:16px;width:min(640px,100%);max-height:min(600px,76vh);box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary);flex-direction:column;display:flex;overflow:hidden}',
      '.gs_inputRow{flex:none;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary);display:flex}',
      '.gs_inputRow:focus-within{color:var(--dsw-alias-label-secondary)}',
      '.gs_inputIcon{flex:none;justify-content:center;align-items:center;display:inline-flex}',
      '.gs_input{flex:1;min-width:0;background:0 0;border:none;outline:none;color:var(--dsw-alias-label-primary);font:inherit;font-size:15px;line-height:1.4;padding:0}',
      '.gs_input:focus,.gs_input:focus-visible{outline:none}',
      '.gs_input::placeholder{color:var(--dsw-alias-label-tertiary)}',
      '.gs_list{flex:1;min-height:0;overflow-y:auto;padding:6px 8px 10px;scrollbar-width:thin}',
      '.gs_list::-webkit-scrollbar{width:10px}',
      '.gs_list::-webkit-scrollbar-track{background:transparent}',
      '.gs_list::-webkit-scrollbar-thumb{background:var(--dsw-alias-scrollbar-bg-l2,var(--dsw-alias-border-l2));border:3px solid transparent;border-radius:999px;background-clip:content-box}',
      '.gs_footer{flex:none;align-items:center;gap:14px;padding:8px 14px;border-top:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary);font-size:11px;display:flex}',
      '.gs_footerItem{align-items:center;display:inline-flex}',
      '.gs_key{min-width:18px;height:18px;border:1px solid var(--dsw-alias-border-l2);border-radius:5px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:10px;line-height:1;justify-content:center;align-items:center;margin-right:5px;padding:0 4px;display:inline-flex}',

      /* ---------- 分组与行 ---------- */
      '.gs_group{flex-direction:column;gap:1px;display:flex;padding-top:8px}',
      '.gs_group:first-child{padding-top:2px}',
      '.gs_groupLabel{color:var(--dsw-alias-label-tertiary);font-size:11px;font-weight:600;letter-spacing:.04em;padding:0 10px 5px}',
      // 统一行：图标 + 主列（标题/副标题）+ 右侧元信息 + 快捷键胶囊
      '.gs_row{align-items:center;gap:10px;width:100%;min-height:38px;box-sizing:border-box;background:0 0;border:none;border-radius:9px;padding:6px 10px;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;text-align:left;cursor:pointer;display:flex}',
      '.gs_row:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.gs_row[data-active]{background:var(--dsw-alias-interactive-bg-active)}',
      '.gs_rowIcon{flex:none;color:var(--dsw-alias-label-tertiary);justify-content:center;align-items:center;display:inline-flex}',
      '.gs_row[data-active] .gs_rowIcon{color:var(--dsw-alias-label-secondary)}',
      '.gs_rowMain{flex:1;min-width:0;flex-direction:column;gap:1px;display:flex}',
      // 标题/副标题都是普通行内流：写成 flex 会把「文本 + <mark> + 文本」拆成匿名 flex 项，
      // 高亮词组被拦腰折断
      '.gs_rowTitle{font-weight:500;line-height:1.45;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.gs_rowSub{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.4;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.gs_rowMeta{flex:none;color:var(--dsw-alias-label-tertiary);font-size:11.5px;white-space:nowrap}',
      '.gs_rowChip{flex:none;min-width:22px;height:20px;border-radius:6px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-tertiary);font-size:10.5px;font-weight:600;justify-content:center;align-items:center;padding:0 5px;display:inline-flex}',
      '.gs_rowGhost{color:var(--dsw-alias-label-tertiary);cursor:default}',
      '.gs_rowGhost:hover{background:0 0}',
      '.gs_badge{display:inline-block;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:0 7px;font-size:10px;line-height:1.7;white-space:nowrap;margin-left:8px;vertical-align:middle}',
      // 高亮词是「一个整体」，不能被行尾折断（CJK 会逐字断行 → 词组被劈成两行）
      '.gs_highlight{background:var(--dsw-alias-state-warn-tertiary);color:inherit;border-radius:3px;padding:0 1px;white-space:nowrap}',
      '.gs_hint{text-align:center;color:var(--dsw-alias-label-tertiary);padding:26px 12px;font-size:12.5px;line-height:1.7}',
      '.gs_error{text-align:center;color:var(--dsw-alias-state-error-primary);padding:22px 12px;font-size:12.5px}',
      '.gs_spinner{width:12px;height:12px;border:1.6px solid var(--dsw-alias-border-l3);border-top-color:var(--dsw-alias-label-tertiary);border-radius:50%;animation:gs_spin .8s linear infinite;display:inline-block}',
      '@keyframes gs_spin{to{transform:rotate(360deg)}}',

      /* ---------- toast ---------- */
      '.gs_toast{position:fixed;left:50%;bottom:36px;transform:translateX(-50%);z-index:2147483647;pointer-events:none;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);border-radius:10px;padding:9px 16px;font-size:13px;box-shadow:var(--dsw-shadow-lv3);max-width:70vw}',
      '.gs_toast[data-kind=ok]{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary)}',
      '.gs_toast[data-kind=error]{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}',
    ].join('\n')

    let styleEl
    function ensureStyle() {
      if (document.getElementById('dsh-search-style')) return
      styleEl = document.createElement('style')
      styleEl.id = 'dsh-search-style'
      styleEl.textContent = CSS
      document.head.appendChild(styleEl)
    }

    /* ================================ 基础工具 ================================ */

    const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
    const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ESC_MAP[c])

    const IS_MAC = /mac|iphone|ipad|ipod/i.test((navigator.platform || '') + ' ' + (navigator.userAgent || ''))
    /** 快捷键胶囊前缀：macOS 用 ⌥，其余平台用 Alt+ */
    const ALT_LABEL = IS_MAC ? '⌥' : 'Alt+'

    function relativeTime(value) {
      if (!value) return ''
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return ''
      const diff = Date.now() - date.getTime()
      if (diff < 60 * 1000) return '刚刚'
      const minutes = Math.floor(diff / (60 * 1000))
      if (minutes < 60) return minutes + ' 分钟前'
      const hours = Math.floor(minutes / 60)
      if (hours < 24) return hours + ' 小时前'
      const days = Math.floor(hours / 24)
      if (days < 30) return days + ' 天前'
      return date.toLocaleDateString()
    }

    /**
     * 按空白拆词后逐词高亮（与服务端把空格编译成 \s+ 的弹性匹配对齐）。
     * 词组为空时原样转义返回；单词时与旧的整串匹配等价。
     */
    function highlightText(text, query) {
      const value = String(text == null ? '' : text)
      const words = String(query == null ? '' : query)
        .trim()
        .split(/\s+/)
        .filter((word) => word !== '')
      if (words.length === 0) return esc(value)
      // 正则元字符转义后用 | 连接，一次全局扫描逐段拼接
      const pattern = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
      let regex
      try {
        regex = new RegExp(pattern, 'giu')
      } catch {
        return esc(value)
      }
      const parts = []
      let lastIndex = 0
      let match = regex.exec(value)
      while (match !== null) {
        if (match[0] === '') {
          // 空匹配兜底：只推进扫描位置，避免死循环
          regex.lastIndex = match.index + 1
          match = regex.exec(value)
          continue
        }
        parts.push(esc(value.slice(lastIndex, match.index)))
        parts.push('<mark class="gs_highlight">' + esc(match[0]) + '</mark>')
        lastIndex = match.index + match[0].length
        regex.lastIndex = lastIndex
        match = regex.exec(value)
      }
      parts.push(esc(value.slice(lastIndex)))
      return parts.join('')
    }

    async function api(path, signal) {
      const res = await fetch(path, { cache: 'no-store', signal })
      let body = {}
      try {
        body = await res.json()
      } catch {
        /* 非 JSON 响应 */
      }
      if (!res.ok) {
        throw new Error((body && body.error) || ('HTTP ' + res.status))
      }
      return body
    }

    /* ================================ 图标（24 栅格线性图标，随字号取 16px） ================================ */

    const SVG_OPEN = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    const icon = (paths) => SVG_OPEN + paths + '</svg>'

    const ICONS = {
      search: icon('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>'),
      chat: icon('<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z"/>'),
      file: icon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8M16 17H8M10 9H8"/>'),
      plug: icon('<path d="M12 22v-4"/><path d="M9 8V2M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8z"/>'),
      sliders: icon('<path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3"/><path d="M14 2v4M8 10v4M16 18v4"/>'),
      gear: icon('<path d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.3a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.7l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.3a2 2 0 0 1 1 1.7V20a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.3a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.7v-.5a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.3a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>'),
      newChat: icon('<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.4 2.6a2 2 0 0 0 2.9 2.9L12 14.8l-4 1 1-4z"/>'),
      folder: icon('<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/>'),
    }

    /* ================================ 状态 ================================ */

    const state = {
      query: '',
      loading: false,
      error: '',
      /** 宿主 /query 的三类异步命中 */
      server: { sessions: [], prompts: [], tools: [], panels: [] },
      /** 设置目录（打开即用；加载失败时退回服务端 panels） */
      catalog: { ready: false, panels: [] },
    }

    let paletteEl = null
    let listEl = null
    let inputEl = null
    let toastEl = null
    let toastTimer = null
    let searchTimer = null
    let searchSeq = 0
    let activeCtx = null
    let activeCtl = null
    let activeItemIndex = -1
    let currentEntries = []
    let lastFocused = null
    let globalKeyHandler = null
    let sessionUnsubscribe = null
    let sessionRenderTimer = null

    function toast(message, kind) {
      if (toastEl === null || !toastEl.isConnected) {
        toastEl = document.createElement('div')
        toastEl.className = 'gs_toast'
        document.body.appendChild(toastEl)
      }
      toastEl.textContent = message
      toastEl.dataset.kind = kind || 'info'
      toastEl.style.display = ''
      clearTimeout(toastTimer)
      toastTimer = setTimeout(() => {
        toastEl.style.display = 'none'
      }, 2600)
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

    /**
     * 关闭后的极短窗口内忽略入口的 focusin：焦点在入口内部来回移动时
     * （入口 focusin 就是打开路径）不至于把关掉的面板又弹回来。
     */
    let entryFocusMutedUntil = 0

    /** 元素是否在侧边栏搜索入口内部（含入口自身）。 */
    function insideSearchEntry(element) {
      if (!element) return false
      const entry = document.querySelector('[data-dsh-global-search-entry]')
      if (entry === null) return false
      return entry === element || (typeof entry.contains === 'function' && entry.contains(element))
    }

    function createSidebarEntry() {
      const entry = document.createElement('div')
      entry.dataset.dshGlobalSearchEntry = ''
      entry.className = 'gs_sidebarSearch'
      entry.setAttribute('role', 'search')
      entry.setAttribute('aria-label', '全局搜索')
      entry.innerHTML = '<span class="gs_sidebarEntryIcon">' + ICONS.search + '</span><input class="gs_sidebarSearchInput" placeholder="全局搜索…" readOnly />'
      entry.addEventListener('click', (event) => {
        event.preventDefault()
        openPalette()
      })
      entry.addEventListener('focusin', () => {
        if (Date.now() < entryFocusMutedUntil) return
        openPalette()
      })
      return entry
    }

    function placeSidebarEntry(root, entry) {
      const button = newSessionButton(root)
      if (button === undefined) return false
      if (entry.parentElement !== root) {
        const row = button.closest('[class*="logoRow"]')
        const base = row !== null && row.parentElement === root ? row : button
        const family = Array.from(root.children).filter((el) => el instanceof HTMLElement && el.matches('[data-dsh-global-search-entry], [data-dsh-rss-entry], [data-dsh-taskboard-entry], [data-dsh-ssh-entry]'))
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
      if (typeof document !== 'undefined' && document.querySelector('[data-dsh-global-search-entry]') !== null) return () => {}
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

    /* ================================ 本地数据源 ================================ */

    /**
     * 浏览器端会话列表快照（ctx.sessions.list）。
     * 形状不稳定时不抛错，只是「没有最近会话」——面板其余部分照常可用。
     */
    function readSessionSummaries() {
      const sessions = activeCtx && activeCtx.sessions
      const store = sessions && sessions.list
      if (!store) return []
      let snapshot
      try {
        snapshot = typeof store.getSnapshot === 'function'
          ? store.getSnapshot()
          : (typeof store.get === 'function' ? store.get() : undefined)
      } catch {
        return []
      }
      if (!snapshot || typeof snapshot.byId !== 'object' || snapshot.byId === null || !Array.isArray(snapshot.ids)) return []
      const rows = []
      for (const id of snapshot.ids) {
        const row = snapshot.byId[id]
        if (!row) continue
        if (row.origin === 'subagent') continue
        // 空会话（新建后没说过话）不算「最近会话」
        if (row.blank) continue
        rows.push({
          id,
          title: row.displayTitle || row.title || id,
          time: typeof row.updatedAt === 'number' ? row.updatedAt : 0,
        })
      }
      rows.sort((a, b) => b.time - a.time)
      return rows
    }

    /** 侧边栏「添加工作区」按钮：目录选择器插件缺席时按钮不存在，动作随之隐藏。 */
    function findWorkspaceAddButton() {
      const scope = document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]') || document
      const buttons = scope.querySelectorAll('button[aria-label]')
      for (const button of buttons) {
        const label = button.getAttribute('aria-label') || ''
        if (/工作区|workspace/i.test(label)) return button
      }
      return null
    }

    /**
     * GUI 自己的「新会话」服务（dsh-client-ui-workspace 注册的 cordis Service）。
     * 它才会复用当前工作区的空会话、创建后选中并在主区切过去；只调 sessions.create()
     * 是「建了但不选」，用户看到的就是点击没反应。
     */
    function uiWorkspaceService() {
      try {
        const ctx = activeCtx
        if (!ctx) return undefined
        let service = typeof ctx.get === 'function' ? ctx.get('uiWorkspace') : undefined
        if (service === undefined) service = ctx.uiWorkspace
        return service !== undefined && service !== null && typeof service.startSession === 'function' ? service : undefined
      } catch {
        return undefined
      }
    }

    function canCreateSession() {
      if (uiWorkspaceService() !== undefined) return true
      const sessions = activeCtx && activeCtx.sessions
      if (sessions && typeof sessions.create === 'function') return true
      const root = sidebarRoot()
      return root !== undefined && newSessionButton(root) !== undefined
    }

    /** 新会话：优先走 GUI 服务，其次点侧边栏按钮，最后才自己建并选中。 */
    async function runNewSession() {
      const uiWorkspace = uiWorkspaceService()
      if (uiWorkspace !== undefined) {
        try {
          await uiWorkspace.startSession()
          return
        } catch (error) {
          console.warn('[dsh-global-search] uiWorkspace.startSession failed:', error)
        }
      }
      const root = sidebarRoot()
      const button = root === undefined ? undefined : newSessionButton(root)
      if (button !== undefined) {
        button.click()
        return
      }
      const sessions = activeCtx && activeCtx.sessions
      if (sessions && typeof sessions.create === 'function') {
        try {
          const id = await sessions.create()
          // create 只建不选：必须再 open，否则界面停在原会话上
          if (id !== undefined && id !== null && typeof sessions.open === 'function') sessions.open(id)
          return
        } catch (error) {
          toast(error && error.message ? error.message : '新建会话失败', 'error')
          return
        }
      }
      toast('当前环境无法新建会话', 'error')
    }

    function runOpenFolder() {
      const button = findWorkspaceAddButton()
      if (button === null) {
        toast('当前环境无法打开文件夹', 'error')
        return
      }
      button.click()
    }

    function runOpenSettings() {
      const trigger = findSettingsTrigger()
      if (trigger === null) {
        toast('当前环境无法打开设置', 'error')
        return
      }
      if (trigger.getAttribute('aria-expanded') !== 'true') trigger.click()
    }

    /** 快捷操作：可用性在渲染时判定，不可用的行不出现（宁缺毋滥）。 */
    const QUICK_ACTIONS = [
      {
        id: 'new-session',
        title: '新会话',
        icon: 'newChat',
        code: 'KeyN',
        chip: 'N',
        keywords: ['new', 'chat', 'session', '新建', '新会话', '聊天', '对话'],
        available: () => canCreateSession(),
        run: () => runNewSession(),
      },
      {
        id: 'open-folder',
        title: '打开文件夹',
        icon: 'folder',
        code: 'KeyO',
        chip: 'O',
        keywords: ['folder', 'workspace', 'open', '文件夹', '目录', '工作区', '打开'],
        available: () => findWorkspaceAddButton() !== null,
        run: () => runOpenFolder(),
      },
      {
        id: 'open-settings',
        title: '打开设置',
        icon: 'sliders',
        code: 'Comma',
        chip: ',',
        keywords: ['settings', 'preference', 'config', '设置', '偏好', '配置'],
        available: () => findSettingsTrigger() !== null,
        run: () => runOpenSettings(),
      },
    ]

    let catalogAttemptAt = 0

    /**
     * 设置目录：进面板时拉一次，成功后常驻内存。
     * 失败不锁死——宿主还是旧版本（没有 /catalog 路由）时，下次打开面板再试一次；
     * 期间退回服务端 /query 的 panels（旧行为），面板其余部分照常可用。
     */
    async function loadCatalog() {
      if (state.catalog.ready) return
      const now = Date.now()
      if (now - catalogAttemptAt < 3000) return
      catalogAttemptAt = now
      try {
        const data = await api('/api/dsh-search/catalog')
        state.catalog = { ready: true, panels: Array.isArray(data.panels) ? data.panels : [] }
      } catch {
        return
      }
      if (paletteEl !== null) render()
    }

    /* ================================ 条目构建 ================================ */

    function toolServerName(name) {
      const parts = String(name == null ? '' : name).split('__')
      return parts.length >= 3 ? parts[1] : ''
    }

/**
     * showSubtitle=false 用于空查询下的一级大类（对齐参考图的单行设置行）。
     * sectionIndex = 该大类在注册表里的序号，与设置窗导航按钮顺序一致（文本匹配失败时的兜底）。
     */
    function entryFromPanel(panel, showSubtitle, sectionIndex) {
      const titles = Array.isArray(panel.titles) && panel.titles.length > 0 ? panel.titles : [panel.name]
      return {
        kind: 'panel',
        icon: panel.kind === 'section' ? 'sliders' : 'gear',
        title: highlightText(panel.name, state.query),
        subtitle: showSubtitle && panel.description ? highlightText(panel.description, state.query) : '',
        payload: {
          titles,
          section: panel.kind === 'section',
          name: panel.name,
          index: typeof sectionIndex === 'number' ? sectionIndex : -1,
        },
      }
    }

    /**
     * 官方设置大类的兜底清单：只在宿主没提供 /api/dsh-search/catalog 时用
     * （宿主本体是旧版本、路由尚未注册，或目录请求失败）。五个大类都是 DSH 内置的，
     * 有它「设置」分组才不会空着；插件卡片仍由 /query 的 panels 补齐。
     */
    const FALLBACK_SECTIONS = [
      { id: 's-general', kind: 'section', name: '通用设置', titles: ['通用设置', 'General'], keywords: ['general', '通用', '设置', '常规', '基础'], description: '界面与工具的通用选项' },
      { id: 's-models', kind: 'section', name: '模型', titles: ['模型', 'Models'], keywords: ['model', 'models', '模型', '提供商', 'provider', '推理'], description: '模型提供商与模型列表管理' },
      { id: 's-plugins', kind: 'section', name: '插件', titles: ['插件', 'Plugins'], keywords: ['plugin', 'plugins', '插件', '扩展'], description: '插件配置与插件清单' },
      { id: 's-agent-presets', kind: 'section', name: 'Agent 预设', titles: ['Agent 预设', 'Agent presets'], keywords: ['agent', 'preset', '预设', 'agent preset', 'agentpresets'], description: '预设方案与角色模板' },
    ]

    /* ---------- 设置目录：实时 slots 注册表 + 宿主目录 + 兜底清单 ---------- */

    /** 客户端 slots 服务（SlotRegistry）：设置大类是它的 settings.section 列表槽。 */
    function slotsService() {
      try {
        const ctx = activeCtx
        if (!ctx) return undefined
        let service = typeof ctx.get === 'function' ? ctx.get('slots') : undefined
        if (service === undefined) service = ctx.slots
        return service !== undefined && service !== null && typeof service.entries === 'function' ? service : undefined
      } catch {
        return undefined
      }
    }

    /** slot 的 label 可能是字符串，也可能是 thunk（注册方随语言环境重新注册）。 */
    function slotLabel(value) {
      if (typeof value === 'string') return value
      if (typeof value === 'function') {
        try {
          const out = value()
          return typeof out === 'string' ? out : ''
        } catch {
          return ''
        }
      }
      return ''
    }

    /**
     * 实时枚举设置一级大类（settings.section 槽）。
     * 这是拿到第三方大类的唯一来源——皮肤 / 宠物 / 侧边卡片 / Web 插件 这些
     * 插件注册的大类在宿主静态目录里根本不存在。顺序与设置窗导航一致（按 order 排序），
     * 因此第 N 条对应导航第 N 个按钮。
     */
    function liveSections() {
      const slots = slotsService()
      if (slots === undefined) return []
      let entries
      try {
        entries = slots.entries('settings.section')
      } catch {
        return []
      }
      if (!Array.isArray(entries)) return []
      const rows = []
      for (const entry of entries) {
        const options = entry && typeof entry.options === 'object' && entry.options !== null ? entry.options : {}
        const label = slotLabel(options.label)
        const id = typeof options.id === 'string' ? options.id : ''
        if (label === '' && id === '') continue
        rows.push({
          id: id || label,
          order: typeof options.order === 'number' ? options.order : 0,
          label: label || id,
        })
      }
      rows.sort((a, b) => a.order - b.order)
      return rows
    }

    /** 宿主目录；拿不到（宿主没有 /catalog 路由）就退回内置兜底清单。 */
    function catalogPanels() {
      if (state.catalog.panels.length > 0) return state.catalog.panels
      if (state.catalog.ready) return []
      return FALLBACK_SECTIONS
    }

    /**
     * 分组来源：
     * - sections：实时 slots 大类（含第三方插件注册的），用目录里的关键词 / 描述做补充；
     *   slots 拿不到时退回目录里的官方大类。
     * - cards：目录里的插件卡片（只在搜索时列）。
     */
    function panelSource() {
      const catalog = catalogPanels()
      const meta = new Map()
      for (const panel of catalog) {
        for (const title of [panel.name].concat(panel.titles || [])) {
          if (!meta.has(title)) meta.set(title, panel)
        }
      }
      const live = liveSections()
      const sections = live.length > 0
        ? live.map((row) => {
            const known = meta.get(row.label) || meta.get(row.id)
            return {
              id: row.id,
              kind: 'section',
              name: row.label,
              titles: known ? (known.titles || [known.name]) : [row.label],
              keywords: (known && known.keywords ? known.keywords : []).concat(row.id === row.label ? [] : [row.id]),
              description: known ? known.description : '',
            }
          })
        : catalog.filter((panel) => panel.kind === 'section')
      return {
        sections,
        cards: catalog.filter((panel) => panel.kind !== 'section'),
      }
    }

    function matchesPanel(panel, query) {
      return [panel.name].concat(panel.titles || [], panel.keywords || [], [panel.description]).join(' ').toLowerCase().includes(query)
    }

    /**
     * 设置分组：本地过滤（零延迟）+ 服务端 panels 按 id / 标题去重补齐。
     * 空查询只列设置一级大类（对齐桌面端搜索窗的「设置」组）。
     */
    function panelEntries(searching) {
      const query = state.query.trim().toLowerCase()
      const source = panelSource()
      const pool = searching ? source.sections.concat(source.cards) : source.sections
      const out = []
      const seenIds = new Set()
      const seenNames = new Set()
      for (const panel of pool) {
        if (searching && !matchesPanel(panel, query)) continue
        const sectionIndex = panel.kind === 'section' ? source.sections.indexOf(panel) : -1
        out.push(entryFromPanel(panel, searching, sectionIndex))
        seenIds.add(panel.id)
        seenNames.add(String(panel.name).toLowerCase())
      }
      if (searching) {
        for (const panel of state.server.panels) {
          if (seenIds.has(panel.id) || seenNames.has(String(panel.name).toLowerCase())) continue
          out.push(entryFromPanel(panel, true, panel.kind === 'section' ? 0 : -1))
        }
      }
      // 设置大类一条都不能少（第三方插件注册的也在里面），列表本来就可滚动
      return out.slice(0, 14)
    }

    function matchesAction(action, query) {
      if (query === '') return true
      return [action.title].concat(action.keywords).some((text) => String(text).toLowerCase().includes(query))
    }

    /**
     * 组装分组。空查询 = 「打开即有内容」的落地页（最近会话 + 快捷操作 + 设置）；
     * 有查询 = 本地即时候选在前，宿主全文命中在后。
     */
    function buildGroups() {
      const searching = state.query.trim() !== ''
      const query = state.query.trim().toLowerCase()
      const groups = []

      const serverSessionIds = new Set(state.server.sessions.map((item) => item.id))
      const recents = readSessionSummaries()
        .filter((row) => !serverSessionIds.has(row.id))
        .filter((row) => !searching || String(row.title).toLowerCase().includes(query))
        // 空查询下少放几条：设置大类要能在首屏看到（列表本来也能滚）
        .slice(0, searching ? 5 : 4)

      if (recents.length > 0) {
        groups.push({
          label: searching ? '最近会话' : '最近',
          entries: recents.map((row, index) => ({
            kind: 'session',
            icon: 'chat',
            title: highlightText(row.title, state.query),
            meta: relativeTime(row.time),
            chip: index < 9 ? ALT_LABEL + String(index + 1) : '',
            payload: { id: row.id },
          })),
        })
      }

      if (searching && state.server.sessions.length > 0) {
        groups.push({
          label: '历史会话',
          entries: state.server.sessions.map((item) => ({
            kind: 'session',
            icon: 'chat',
            title: highlightText(item.snippet || item.id, state.query),
            meta: relativeTime(item.time),
            payload: { id: item.id },
          })),
        })
      }

      if (searching && state.server.prompts.length > 0) {
        groups.push({
          label: 'Prompt',
          entries: state.server.prompts.map((item) => ({
            kind: 'prompt',
            icon: 'file',
            title: highlightText(item.name, state.query) + (item.active ? '<span class="gs_badge">启用中</span>' : ''),
            subtitle: highlightText(item.snippet || item.description || '', state.query),
            payload: { copy: item.snippet || item.description || '' },
          })),
        })
      }

      if (searching && state.server.tools.length > 0) {
        groups.push({
          label: 'MCP 工具',
          entries: state.server.tools.map((item) => ({
            kind: 'tool',
            icon: 'plug',
            title: highlightText(item.name, state.query),
            subtitle: item.description ? highlightText(item.description, state.query) : '',
            meta: toolServerName(item.name),
            payload: { name: item.name },
          })),
        })
      }

      const actions = QUICK_ACTIONS.filter((action) => {
        try {
          return action.available() && matchesAction(action, query)
        } catch {
          return false
        }
      })
      if (actions.length > 0) {
        groups.push({
          label: '快捷操作',
          entries: actions.map((action) => ({
            kind: 'action',
            icon: action.icon,
            title: action.title,
            chip: ALT_LABEL + action.chip,
            payload: { actionId: action.id },
          })),
        })
      }

      const panels = panelEntries(searching)
      if (panels.length > 0) groups.push({ label: '设置', entries: panels })

      return groups
    }

    /* ================================ 渲染 ================================ */

    function rowHtml(entry, index) {
      const iconHtml = entry.icon ? '<span class="gs_rowIcon">' + (ICONS[entry.icon] || '') + '</span>' : ''
      const metaHtml = entry.meta ? '<span class="gs_rowMeta">' + esc(entry.meta) + '</span>' : ''
      const chipHtml = entry.chip ? '<span class="gs_rowChip">' + esc(entry.chip) + '</span>' : ''
      const subHtml = entry.subtitle ? '<span class="gs_rowSub">' + entry.subtitle + '</span>' : ''
      return '<div class="gs_row" role="option" id="gs_opt_' + index + '" data-index="' + index + '" aria-selected="false">' +
        iconHtml +
        '<span class="gs_rowMain"><span class="gs_rowTitle">' + entry.title + '</span>' + subHtml + '</span>' +
        metaHtml + chipHtml +
        '</div>'
    }

    function render() {
      if (paletteEl === null) return
      const list = listEl
      if (list === null) return
      const renderQuery = state.query.trim()
      const groups = buildGroups()
      currentEntries = []

      // 重渲染会替换 DOM，旧的高亮引用失效：先清掉选中索引
      activeItemIndex = -1

      if (state.error !== '') {
        list.innerHTML = '<div class="gs_error">' + esc(state.error) + '</div>'
        return
      }

      const parts = []
      let index = 0
      for (const group of groups) {
        parts.push('<div class="gs_group">')
        if (group.label) parts.push('<div class="gs_groupLabel">' + esc(group.label) + '</div>')
        for (const entry of group.entries) {
          currentEntries.push(entry)
          parts.push(rowHtml(entry, index))
          index += 1
        }
        parts.push('</div>')
      }

      if (state.loading) {
        parts.push('<div class="gs_group"><div class="gs_row gs_rowGhost"><span class="gs_rowIcon"><span class="gs_spinner"></span></span><span class="gs_rowMain"><span class="gs_rowTitle">搜索会话全文…</span></span></div></div>')
      }

      if (currentEntries.length === 0 && !state.loading) {
        list.innerHTML = '<div class="gs_hint">' + (renderQuery === ''
          ? '输入关键词，搜索历史会话、Prompt、MCP 工具和设置面板。<br />↑↓ 选择，↵ 打开，esc 关闭。'
          : '没有找到匹配结果。') + '</div>'
        return
      }

      list.innerHTML = parts.join('')
      list.querySelectorAll('.gs_row[data-index]').forEach((el) => {
        const itemIndex = Number(el.dataset.index)
        el.addEventListener('click', () => activateEntry(currentEntries[itemIndex]))
        el.addEventListener('mousemove', () => {
          if (activeItemIndex !== itemIndex) setActiveItem(itemIndex)
        })
      })
      // 默认选中首项：回车即打开（命令面板的通用手感）
      if (currentEntries.length > 0) setActiveItem(0)
    }

    function setActiveItem(index) {
      if (listEl === null) return
      const rows = listEl.querySelectorAll('.gs_row[data-index]')
      rows.forEach((row) => {
        const rowIndex = Number(row.dataset.index)
        if (rowIndex === index) {
          row.setAttribute('data-active', '')
          row.setAttribute('aria-selected', 'true')
        } else {
          row.removeAttribute('data-active')
          row.setAttribute('aria-selected', 'false')
        }
      })
      activeItemIndex = index
      const active = rows[index]
      if (active === undefined) return
      if (inputEl !== null) inputEl.setAttribute('aria-activedescendant', 'gs_opt_' + String(index))
      try {
        active.scrollIntoView({ block: 'nearest' })
      } catch {
        /* 滚动失败不阻塞 */
      }
    }

    function moveActiveItem(delta) {
      if (currentEntries.length === 0) return
      const next = activeItemIndex < 0
        ? (delta > 0 ? 0 : currentEntries.length - 1)
        : Math.min(currentEntries.length - 1, Math.max(0, activeItemIndex + delta))
      setActiveItem(next)
    }

    /* ================================ 打开条目 ================================ */

    function openSession(id) {
      const sessions = activeCtx && activeCtx.sessions
      if (!sessions || typeof sessions.open !== 'function') {
        toast('当前环境无法直接打开会话', 'error')
        return
      }
      const query = state.query
      try {
        sessions.open(id)
        closePalette()
        jumpToSessionText(query)
      } catch (error) {
        toast(error && error.message ? error.message : '打开会话失败', 'error')
      }
    }

    async function activateEntry(entry) {
      if (!entry) return
      if (entry.kind === 'session') {
        openSession(entry.payload.id)
        return
      }
      if (entry.kind === 'action') {
        const action = QUICK_ACTIONS.find((item) => item.id === entry.payload.actionId)
        closePalette()
        if (action) await action.run()
        return
      }
      if (entry.kind === 'prompt') {
        const copy = entry.payload.copy
        closePalette()
        const jumped = await openSettingsCard(['Prompt 管理', 'Prompt Management'])
        if (jumped) {
          toast('已打开「Prompt 管理」设置卡片', 'ok')
        } else {
          copyText(copy)
        }
        return
      }
      if (entry.kind === 'tool') {
        const name = entry.payload.name
        closePalette()
        const jumped = await openSettingsCard(['MCP 服务器配置', 'MCP Server Configuration'])
        if (jumped) {
          toast('已打开「MCP 服务器配置」设置卡片', 'ok')
        } else {
          copyText(name)
        }
        return
      }
      if (entry.kind === 'panel') {
        const isSection = entry.payload.section === true
        const titles = entry.payload.titles
        const label = titles[0] || '设置面板'
        closePalette()
        const jumped = isSection ? await openSettingsSection(titles, entry.payload.index) : await openSettingsCard(titles)
        if (jumped) {
          toast('已打开「' + label + '」设置' + (isSection ? '分区' : '卡片'), 'ok')
        } else {
          copyText(label)
        }
      }
    }

    function copyText(text) {
      if (!text) return
      const done = () => toast('已复制', 'ok')
      const fail = () => toast('复制失败', 'error')
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(text).then(done, fail)
      } else {
        try {
          const textarea = document.createElement('textarea')
          textarea.value = text
          document.body.appendChild(textarea)
          textarea.select()
          document.execCommand('copy')
          textarea.remove()
          done()
        } catch {
          fail()
        }
      }
    }

    /* ================================ 查询 ================================ */

    async function runSearch() {
      const query = state.query.trim()
      const seq = ++searchSeq
      if (query === '') {
        state.server = { sessions: [], prompts: [], tools: [], panels: [] }
        state.error = ''
        state.loading = false
        render()
        return
      }
      // 取消上一个仍在途的请求，避免服务器端堆积扫描
      activeCtl?.abort()
      const controller = new AbortController()
      activeCtl = controller
      // 最少 2 个字符才发起查询（按码点计，CJK 单字不触发全量扫描）
      if ([...query].length < 2) {
        state.server = { sessions: [], prompts: [], tools: [], panels: [] }
        state.error = ''
        state.loading = false
        render()
        return
      }
      state.loading = true
      state.error = ''
      render()
      try {
        const data = await api('/api/dsh-search/query?q=' + encodeURIComponent(query), controller.signal)
        if (seq !== searchSeq) return
        state.server = {
          sessions: data.sessions || [],
          prompts: data.prompts || [],
          tools: data.tools || [],
          panels: data.panels || [],
        }
      } catch (error) {
        if (seq !== searchSeq) return
        if (error && error.name === 'AbortError') return
        state.error = error.message || String(error)
        state.server = { sessions: [], prompts: [], tools: [], panels: [] }
      } finally {
        if (seq === searchSeq) {
          state.loading = false
          render()
        }
      }
    }

    /* ================================ 面板开关 ================================ */

    function subscribeSessionStore() {
      if (sessionUnsubscribe !== null) return
      const sessions = activeCtx && activeCtx.sessions
      const store = sessions && sessions.list
      if (!store || typeof store.subscribe !== 'function') return
      try {
        sessionUnsubscribe = store.subscribe(() => {
          // 回调可能在渲染中途触发：下一次任务再重绘
          if (sessionRenderTimer !== null) return
          sessionRenderTimer = setTimeout(() => {
            sessionRenderTimer = null
            if (paletteEl !== null) render()
          }, 0)
        })
      } catch {
        sessionUnsubscribe = null
      }
    }

    function unsubscribeSessionStore() {
      if (sessionUnsubscribe !== null) {
        try {
          sessionUnsubscribe()
        } catch {
          /* 释放失败不阻塞 */
        }
        sessionUnsubscribe = null
      }
      if (sessionRenderTimer !== null) {
        clearTimeout(sessionRenderTimer)
        sessionRenderTimer = null
      }
    }

    function focusInput() {
      if (inputEl === null) return
      try {
        inputEl.focus()
      } catch {
        /* 聚焦失败不阻塞 */
      }
    }

    function openPalette() {
      if (paletteEl !== null && paletteEl.isConnected) {
        focusInput()
        return
      }
      state.query = ''
      state.server = { sessions: [], prompts: [], tools: [], panels: [] }
      state.error = ''
      state.loading = false
      activeItemIndex = -1

      const backdrop = document.createElement('div')
      backdrop.className = 'gs_backdrop'
      backdrop.addEventListener('mousedown', (event) => {
        if (event.target === backdrop) closePalette()
      })

      const panel = document.createElement('div')
      panel.className = 'gs_palette'
      panel.setAttribute('role', 'dialog')
      panel.setAttribute('aria-modal', 'true')
      panel.setAttribute('aria-label', '全局搜索')
      panel.innerHTML =
        '<div class="gs_inputRow">' +
          '<span class="gs_inputIcon">' + ICONS.search + '</span>' +
          '<input class="gs_input" type="text" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="gs_list" placeholder="搜索会话、设置与工具…" autocomplete="off" spellcheck="false" />' +
        '</div>' +
        '<div class="gs_list" id="gs_list" role="listbox" aria-label="搜索结果"></div>' +
        '<div class="gs_footer">' +
          '<span class="gs_footerItem"><kbd class="gs_key">↑</kbd><kbd class="gs_key">↓</kbd>选择</span>' +
          '<span class="gs_footerItem"><kbd class="gs_key">↵</kbd>打开</span>' +
          '<span class="gs_footerItem"><kbd class="gs_key">esc</kbd>关闭</span>' +
        '</div>'

      backdrop.appendChild(panel)
      document.body.appendChild(backdrop)
      paletteEl = backdrop
      listEl = panel.querySelector('.gs_list')
      inputEl = panel.querySelector('.gs_input')
      lastFocused = document.activeElement

      inputEl.addEventListener('input', () => {
        state.query = inputEl.value
        // 本地候选零延迟重绘；宿主全文命中防抖后补齐
        render()
        clearTimeout(searchTimer)
        searchTimer = setTimeout(runSearch, 220)
      })
      inputEl.addEventListener('keydown', (event) => {
        if (event.isComposing) return
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          moveActiveItem(event.key === 'ArrowDown' ? 1 : -1)
          return
        }
        if (event.key === 'Enter') {
          event.preventDefault()
          const entry = activeItemIndex >= 0 ? currentEntries[activeItemIndex] : undefined
          if (entry !== undefined) {
            activateEntry(entry)
            return
          }
          clearTimeout(searchTimer)
          runSearch()
        }
      })
      // 点空白处不丢焦点：保持键盘可用
      panel.addEventListener('mousedown', (event) => {
        if (event.target === panel) event.preventDefault()
      })

      setTimeout(focusInput, 0)
      render()
      loadCatalog()
      subscribeSessionStore()
    }

    function closePalette() {
      if (paletteEl === null) return
      activeCtl?.abort()
      activeCtl = null
      clearTimeout(searchTimer)
      unsubscribeSessionStore()
      paletteEl.remove()
      paletteEl = null
      listEl = null
      inputEl = null
      activeItemIndex = -1
      currentEntries = []
      // 还原焦点，但绝不还给侧边栏入口：入口的 focusin 会立刻把面板重新打开，
      // 表现为「点不掉」。顺手在极短窗口内屏蔽入口的 focusin。
      const restoreTarget = lastFocused
      lastFocused = null
      entryFocusMutedUntil = Date.now() + 250
      if (restoreTarget && typeof restoreTarget.focus === 'function' && document.contains(restoreTarget) && !insideSearchEntry(restoreTarget)) {
        try {
          restoreTarget.focus()
        } catch {
          /* 还原焦点失败不阻塞 */
        }
      }
    }

    /* ---------- 键盘：全局快捷键 ---------- */

    /**
     * 全局（capture 阶段）按键：
     *   ⌘/Ctrl+K 开关面板；esc 关闭；
     *   ⌥/Alt+数字 打开第 N 条「最近会话」；⌥/Alt+N / O / , 触发对应快捷操作。
     * 用 event.code 判定（macOS 上 ⌥+数字/字母会变成特殊字符，key 不可靠）。
     */
    function onGlobalKeydown(event) {
      if (event.isComposing) return
      if ((event.metaKey || event.ctrlKey) && !event.altKey && String(event.key).toLowerCase() === 'k') {
        event.preventDefault()
        event.stopPropagation()
        if (paletteEl !== null && paletteEl.isConnected) focusInput()
        else openPalette()
        return
      }
      if (paletteEl === null || !paletteEl.isConnected) return
      if (event.key === 'Escape') {
        event.preventDefault()
        closePalette()
        return
      }
      if (!event.altKey || event.metaKey || event.ctrlKey) return
      const digit = /^Digit([1-9])$/.exec(event.code || '')
      if (digit !== null) {
        const entry = currentEntries[Number(digit[1]) - 1]
        if (entry !== undefined) {
          event.preventDefault()
          activateEntry(entry)
        }
        return
      }
      const code = String(event.code || '')
      const hit = code === 'Comma'
        ? QUICK_ACTIONS.find((action) => action.chip === ',')
        : QUICK_ACTIONS.find((action) => action.code === code)
      if (hit !== undefined && hit.available()) {
        event.preventDefault()
        closePalette()
        hit.run()
      }
    }

    /* ================================ 跳转到设置 ================================ */

    function waitFor(predicate, timeout = 4000) {
      return new Promise((resolve) => {
        const startedAt = Date.now()
        const timer = setInterval(() => {
          let value
          try {
            value = predicate()
          } catch {
            value = null
          }
          if (value) {
            clearInterval(timer)
            resolve(value)
            return
          }
          if (Date.now() - startedAt > timeout) {
            clearInterval(timer)
            resolve(null)
          }
        }, 60)
      })
    }

    function findSettingsTrigger() {
      const sidebar = document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]')
      const scope = sidebar || document
      return scope.querySelector('button[aria-haspopup="dialog"]') || document.querySelector('button[aria-haspopup="dialog"]')
    }

    function findButtonByText(selector, texts, scope) {
      const root = scope || document
      const candidates = root.querySelectorAll(selector)
      for (const el of candidates) {
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim()
        if (texts.some((item) => text.includes(item))) return el
      }
      return null
    }

    function findSettingsSectionButton(scope) {
      return findNavSectionButton(['插件', 'Plugins'], scope)
    }

    /**
     * 在设置窗口侧边栏找到目标一级大类的导航按钮。
     * 先按标题文本打分（精确 > 前缀 > 包含），全不命中时退回「注册顺序第 index 个」——
     * 第三方大类的本地化标题与注册 label 万一不一致，靠顺序也能定位。
     */
    function findNavSectionButton(titleTexts, scope, index) {
      const root = (scope && scope.tagName === 'NAV' ? scope : (scope?.querySelector('nav') || scope)) || document
      const wanted = (titleTexts || []).filter((item) => item)
      const buttons = []
      for (const btn of root.querySelectorAll('button')) {
        const text = (btn.textContent || '').replace(/\s+/g, ' ').trim()
        const looksLikeNav = /sidebar-nav|section|nav/i.test(btn.className) || btn.closest('nav') !== null || btn.hasAttribute('aria-current') || btn.getAttribute('role') === 'tab'
        if (!looksLikeNav || text === '') continue
        buttons.push({ btn, text })
      }
      let best = null
      let bestScore = 0
      for (const candidate of buttons) {
        for (const item of wanted) {
          const score = candidate.text === item
            ? 4
            : (candidate.text.startsWith(item) || item.startsWith(candidate.text) ? 3 : (candidate.text.includes(item) ? 2 : (item.includes(candidate.text) ? 1 : 0)))
          if (score > bestScore) {
            bestScore = score
            best = candidate.btn
          }
        }
      }
      if (best !== null && bestScore >= 2) return best
      if (typeof index === 'number' && index >= 0 && index < buttons.length) return buttons[index].btn
      return best
    }

    /** 打开设置对话框并导航到指定一级大类（侧边栏 nav 按钮）。 */
    async function openSettingsSection(titleTexts, index) {
      const trigger = findSettingsTrigger()
      if (trigger === null) {
        console.warn('[dsh-global-search] openSettingsSection: settings trigger not found')
        return false
      }
      if (trigger.getAttribute('aria-expanded') !== 'true') {
        trigger.click()
      }
      const panel = await waitFor(() => document.querySelector('[role="dialog"]'))
      if (panel === null) {
        console.warn('[dsh-global-search] openSettingsSection: settings dialog not found')
        return false
      }
      let sectionButton = await waitFor(() => findNavSectionButton(titleTexts, panel, index))
      if (sectionButton === null) {
        sectionButton = await waitFor(() => findButtonByText('button', titleTexts, panel.querySelector('nav') || panel))
      }
      if (sectionButton === null) {
        console.warn('[dsh-global-search] openSettingsSection: nav section not found: ' + titleTexts.join(' / '))
        return false
      }
      sectionButton.click()
      try {
        sectionButton.scrollIntoView({ block: 'center', behavior: 'smooth' })
      } catch {
        /* 滚动失败不阻塞 */
      }
      return true
    }

    function findCardHeader(titleTexts, scope) {
      const root = scope || document
      const buttons = root.querySelectorAll('button')
      for (const btn of buttons) {
        const text = (btn.textContent || '').replace(/\s+/g, ' ').trim()
        const looksLikeCardHeader = btn.hasAttribute('aria-expanded') || /cardHeader|header/i.test(btn.className)
        if (looksLikeCardHeader && titleTexts.some((item) => text.includes(item))) return btn
      }
      return null
    }

    async function openSettingsCard(titleTexts) {
      const trigger = findSettingsTrigger()
      if (trigger === null) {
        console.warn('[dsh-global-search] openSettingsCard: settings trigger not found')
        return false
      }
      if (trigger.getAttribute('aria-expanded') !== 'true') {
        trigger.click()
      }
      const panel = await waitFor(() => document.querySelector('[role="dialog"]'))
      if (panel === null) {
        console.warn('[dsh-global-search] openSettingsCard: settings dialog not found')
        return false
      }

      let sectionButton = await waitFor(() => findSettingsSectionButton(panel))
      if (sectionButton === null) {
        sectionButton = await waitFor(() => findButtonByText('button', ['插件', 'Plugins'], panel.querySelector('nav') || panel))
      }
      if (sectionButton === null) {
        console.warn('[dsh-global-search] openSettingsCard: plugins section not found')
        return false
      }
      sectionButton.click()

      let tab = await waitFor(() => findButtonByText('button[role="tab"]', ['插件配置', 'Plugin configuration'], panel))
      if (tab === null) {
        tab = await waitFor(() => findButtonByText('button', ['插件配置', 'Plugin configuration'], panel))
      }
      if (tab === null) {
        console.warn('[dsh-global-search] openSettingsCard: configurable tab not found')
        return false
      }
      tab.click()

      let card = await waitFor(() => findCardHeader(titleTexts, panel))
      if (card === null) {
        card = await waitFor(() => findButtonByText('button', titleTexts, panel))
      }
      if (card === null) {
        console.warn('[dsh-global-search] openSettingsCard: card not found: ' + titleTexts.join(' / '))
        return false
      }
      if (card.getAttribute('aria-expanded') !== 'true') {
        card.click()
      }
      try {
        card.scrollIntoView({ block: 'center', behavior: 'smooth' })
      } catch {
        /* 滚动失败不阻塞 */
      }
      return true
    }

    /* ================================ 跳转到会话内文字 ================================ */

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

    /**
     * 在会话滚动容器内查找包含关键词的消息块。
     * 严格以 scroller 为根：绝不在 body / 侧边栏范围里找——侧边栏会话标题
     * 常含相同关键词，宽泛匹配会把用户带离会话内容。
     */
    function findTextInScroller(scroller, lowerQuery) {
      const walker = document.createTreeWalker(scroller, NodeFilter.SHOW_TEXT)
      while (walker.nextNode()) {
        const node = walker.currentNode
        if (!(node.nodeValue || '').toLowerCase().includes(lowerQuery)) continue
        let el = node.parentElement
        for (let i = 0; i < 8 && el; i += 1) {
          if (el.matches && el.matches('[class*="flowItem"], [class*="message"], [class*="node"], [class*="turn"], [class*="chat"], [class*="content"]')) return el
          el = el.parentElement
        }
        return node.parentElement
      }
      return null
    }

    /**
     * 打开会话后定位到匹配文本。
     * 会话视图是底部锚定的虚拟列表，初始只渲染末尾一屏，较早的匹配消息不在
     * DOM 里：逐屏向上滚动触发加载更早消息，直到命中、到顶不再增长或总超时。
     * 没找到时恢复原滚动位置，不打扰用户当前视图。
     */
    async function jumpToSessionText(query) {
      const q = String(query || '').trim()
      if (q === '') return
      const lowerQuery = q.toLowerCase()
      const startedAt = Date.now()
      // 注意：sessions.open 会触发会话视图重挂载，滚动容器节点会被替换——
      // 每一轮都必须重新 query，绝不能缓存节点引用（detached 节点上写 scrollTop 无效）。
      const getScroller = () => document.querySelector('[data-conversation-scroll]')
      let scroller = null
      while (Date.now() - startedAt < 8000) {
        scroller = getScroller()
        if (scroller !== null) break
        await sleep(200)
      }
      if (scroller === null) return
      // 切换会话时旧内容可能还挂在容器里：等一次内容签名变化再开始找
      //（同会话跳转时内容不变，很快放行）
      const signatureOf = (el) => el.innerHTML.length + ':' + el.scrollHeight
      const signature = signatureOf(scroller)
      for (let i = 0; i < 6; i += 1) {
        await sleep(200)
        const current = getScroller()
        if (current !== null && signatureOf(current) !== signature) break
      }
      const initialScroll = getScroller()?.scrollTop ?? null
      let lastHeight = scroller.scrollHeight
      while (Date.now() - startedAt < 15000) {
        const box = getScroller()
        if (box === null) {
          await sleep(250)
          continue
        }
        const target = findTextInScroller(box, lowerQuery)
        if (target !== null) {
          try {
            // behavior 用 auto（瞬时）：smooth 的动画过程会被会话视图的
            // 吸底滚动逻辑逐帧弹回底部，导致定位无效。
            target.scrollIntoView({ block: 'center', behavior: 'auto' })
            target.style.outline = '2px solid var(--dsw-alias-state-warn-primary)'
            target.style.borderRadius = '8px'
            setTimeout(() => {
              target.style.outline = ''
              target.style.borderRadius = ''
            }, 3000)
          } catch {
            /* 滚动失败不阻塞 */
          }
          return
        }
        const atTop = box.scrollTop <= 4
        const grew = box.scrollHeight !== lastHeight
        lastHeight = box.scrollHeight
        // 到顶且内容不再增长才判定穷尽；冷打开的会话内容是逐步渲染的，
        // 空容器 / 短容器上「到顶且未增长」只是还没加载完，必须继续等。
        const rendered = box.scrollHeight > box.clientHeight * 1.2
        if (atTop && !grew && rendered) break
        if (!atTop) {
          box.scrollTop = Math.max(0, box.scrollTop - Math.max(240, box.clientHeight * 0.85))
        }
        await sleep(320)
      }
      const endBox = getScroller()
      if (endBox !== null && initialScroll !== null) {
        try {
          endBox.scrollTop = initialScroll
        } catch {
          /* 恢复失败不阻塞 */
        }
      }
    }

    /* ================================ 插件入口 ================================ */

    exports.inject = ['sessions']

    exports.apply = (ctx) => {
      activeCtx = ctx
      ctx.effect(() => {
        ensureStyle()
        const disposeSidebar = mountSidebarEntry()
        // 全局快捷键只挂一次（capture 阶段，先于宿主/输入框处理）
        if (globalKeyHandler === null) {
          globalKeyHandler = onGlobalKeydown
          document.addEventListener('keydown', globalKeyHandler, true)
        }
        return () => {
          if (disposeSidebar) disposeSidebar()
          if (globalKeyHandler !== null) {
            document.removeEventListener('keydown', globalKeyHandler, true)
            globalKeyHandler = null
          }
          closePalette()
          styleEl?.remove()
          styleEl = undefined
          toastEl?.remove()
          toastEl = undefined
          activeCtx = null
        }
      })
    }

    return exports
  },
})
