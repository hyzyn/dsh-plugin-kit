/* eslint-disable */
/**
 * @hyzyn/dsh-search — 浏览器半体：在侧边栏注入「全局搜索」入口。
 * 点击后打开全局搜索弹窗，输入关键词同时搜索历史会话、Prompt、MCP 工具。
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
      '.gs_sidebarEntry{box-sizing:border-box;width:100%;height:32px;color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap;background:0 0;border:none;border-radius:8px;align-items:center;gap:8px;padding:0 12px;font-size:13px;display:flex}',
      '.gs_sidebarEntry:hover{background:var(--dsw-specific-sidebar-nav-item-hover);color:var(--dsw-alias-label-primary)}',
      '.gs_sidebarEntry[data-active]{background:var(--dsw-specific-sidebar-nav-item-active);color:var(--dsw-alias-label-primary);font-weight:600}',
      '.gs_sidebarEntryIcon{flex:none;justify-content:center;align-items:center;display:inline-flex}',
      '.gs_sidebarEntryLabel{text-overflow:ellipsis;overflow:hidden}',
      '.gs_sidebarSearch{width:100%;height:32px;color:var(--dsw-alias-label-secondary);cursor:text;white-space:nowrap;background:0 0;border:1px solid transparent;border-radius:8px;align-items:center;gap:8px;padding:0 10px;font-size:13px;display:flex;box-sizing:border-box}',
      '.gs_sidebarSearch:hover{background:var(--dsw-specific-sidebar-nav-item-hover);color:var(--dsw-alias-label-primary)}',
      '.gs_sidebarSearch:focus-within{border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-specific-sidebar-nav-item-active);color:var(--dsw-alias-label-primary)}',
      '.gs_sidebarSearchInput{flex:1;min-width:0;background:0 0;border:none;outline:none;color:inherit;font:inherit;padding:0}',
      '.gs_sidebarSearchInput:focus,.gs_sidebarSearchInput:focus-visible{outline:none}',
      '.gs_sidebarSearch:focus-within .gs_sidebarSearchInput{outline:none}',
      '.gs_sidebarSearchInput::placeholder{color:var(--dsw-alias-label-tertiary)}',
      '[data-sidebar-collapsed] .gs_sidebarEntry{justify-content:center;width:100%;padding:0}',
      '[data-sidebar-collapsed] .gs_sidebarEntryLabel{display:none}',
      '[data-sidebar-collapsed] .gs_sidebarSearch{justify-content:center;width:100%;padding:0;border-color:transparent}',
      '[data-sidebar-collapsed] .gs_sidebarSearchInput{display:none}',
      '.gs_modalBackdrop{z-index:1300;background:var(--dsw-alias-bg-mask-1);justify-content:center;align-items:flex-start;display:flex;position:fixed;inset:0;padding-top:10vh}',
      '.gs_modal{background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);width:min(680px,100vw - 48px);max-height:80vh;box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary);border-radius:14px;flex-direction:column;gap:12px;padding:16px;display:flex;overflow:hidden}',
      '.gs_modalHeader{flex:none;align-items:center;gap:10px;display:flex}',
      '.gs_modalTitle{flex:1;margin:0;font-size:16px;font-weight:700;white-space:nowrap}',
      '.gs_modalClose{appearance:none;background:0 0;border:none;color:var(--dsw-alias-label-tertiary);border-radius:8px;width:30px;height:30px;cursor:pointer;font-size:18px;line-height:1}',
      '.gs_modalClose:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}',
      '.gs_searchInput{color:var(--dsw-alias-label-primary);background:var(--dsw-specific-input-major);border:1px solid var(--dsw-alias-border-l2);border-radius:10px;outline:none;padding:10px 14px;font-family:inherit;font-size:14px;box-sizing:border-box;width:100%}',
      '.gs_searchInput:focus{border-color:var(--dsw-alias-state-business-primary)}',
      '.gs_searchInput:focus-visible{outline:none}',
      '.gs_searchInput::placeholder{color:var(--dsw-alias-label-tertiary)}',
      '.gs_modalBody{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:14px}',
      '.gs_sectionTitle{font-size:12px;font-weight:700;color:var(--dsw-alias-label-tertiary);margin:2px 0 6px;text-transform:uppercase;letter-spacing:.03em}',
      '.gs_list{display:flex;flex-direction:column;gap:6px}',
      // 注意：.gs_item 是 <button>，UA 默认 text-align:center，不显式归左会把标题/摘要/时间都居中
      '.gs_item{background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:8px 12px;display:flex;flex-direction:column;gap:3px;cursor:pointer;text-align:left}',
      '.gs_item:hover{border-color:var(--dsw-alias-label-dimmed)}',
      // 标题必须是普通行内流：写成 flex 会把「文本 + <mark> + 文本」拆成三个匿名 flex 项，
      // 各自被压窄换行（高亮词组被拦腰折断），还会多出 gap 并把行内高度撑歪
      '.gs_itemTitle{font-size:13px;font-weight:600;line-height:1.4;display:block}',
      '.gs_itemMeta{color:var(--dsw-alias-label-tertiary);font-size:11px;font-weight:400}',
      '.gs_itemDesc{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.5;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
      // 标题不再是 flex，原来的 gap:8px 没了，用 margin-left 补间距（inline-block 之间的间隔）
      '.gs_badge{display:inline-block;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:0 7px;font-size:10px;line-height:1.7;white-space:nowrap;margin-left:8px;vertical-align:middle}',
      // 高亮词是「一个整体」，不能被行尾折断（CJK 会逐字断行 → 词组被劈成两行）
      '.gs_highlight{background:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-label-primary-foreground);border-radius:2px;padding:0 1px;white-space:nowrap}',
      '.gs_empty,.gs_loading,.gs_error{text-align:center;color:var(--dsw-alias-label-tertiary);padding:24px 12px;font-size:12.5px}',
      '.gs_error{color:var(--dsw-alias-state-error-primary)}',
      '.gs_toast{position:fixed;left:50%;bottom:36px;transform:translateX(-50%);z-index:2147483647;pointer-events:none;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);border-radius:10px;padding:9px 16px;font-size:13px;box-shadow:var(--dsw-shadow-lv3);max-width:70vw}',
      '.gs_toast[data-kind=ok]{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary)}',
      '.gs_toast[data-kind=error]{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}',
      '.gs_item[data-active]{border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-bg-layer-3)}',
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
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESC_MAP[c])
    const fmtTime = (value) => {
      if (!value) return ''
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return ''
      return date.toLocaleString()
    }

    /**
     * 按空白拆词后逐词高亮（与服务端把空格编译成 \s+ 的弹性匹配对齐）。
     * 词组为空时原样转义返回；单词时与旧的整串匹配等价。
     */
    function highlightText(text, query) {
      const value = String(text ?? '')
      const words = String(query ?? '')
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

    /* ================================ 状态 ================================ */

    const state = {
      query: '',
      loading: false,
      error: '',
      results: { sessions: [], prompts: [], tools: [], panels: [] },
    }

    let modalEl = null
    let toastEl = null
    let toastTimer = null
    let searchTimer = null
    let searchSeq = 0
    let activeCtx = null
    let activeCtl = null
    let activeItemIndex = -1
    let globalHotkeyHandler = null
    let globalEscapeHandler = null

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

    const SEARCH_ICON = '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/></svg>'

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
      entry.dataset.dshGlobalSearchEntry = ''
      entry.className = 'gs_sidebarSearch'
      entry.setAttribute('role', 'search')
      entry.setAttribute('aria-label', '全局搜索')
      entry.innerHTML = '<span class="gs_sidebarEntryIcon">' + SEARCH_ICON + '</span><input class="gs_sidebarSearchInput" placeholder="全局搜索…" readOnly />'
      entry.addEventListener('click', (event) => {
        event.preventDefault()
        openModal()
      })
      entry.addEventListener('focusin', () => {
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

    /* ================================ 搜索弹窗 ================================ */

    async function runSearch() {
      const query = state.query.trim()
      const seq = ++searchSeq
      if (query === '') {
        state.results = { sessions: [], prompts: [], tools: [], panels: [] }
        state.error = ''
        renderResults()
        return
      }
      // 取消上一个仍在途的请求，避免服务器端堆积扫描
      activeCtl?.abort()
      const controller = new AbortController()
      activeCtl = controller
      // 最少 2 个字符才发起查询（按码点计，CJK 单字不触发全量扫描）
      if ([...query].length < 2) {
        state.results = { sessions: [], prompts: [], tools: [], panels: [] }
        state.error = ''
        state.loading = false
        renderResults()
        return
      }
      state.loading = true
      state.error = ''
      renderResults()
      try {
        const data = await api('/api/dsh-search/query?q=' + encodeURIComponent(query), controller.signal)
        if (seq !== searchSeq) return
        state.results = {
          sessions: data.sessions || [],
          prompts: data.prompts || [],
          tools: data.tools || [],
          panels: data.panels || [],
        }
      } catch (error) {
        if (seq !== searchSeq) return
        if (error && error.name === 'AbortError') return
        state.error = error.message || String(error)
        state.results = { sessions: [], prompts: [], tools: [], panels: [] }
      } finally {
        if (seq === searchSeq) {
          state.loading = false
          renderResults()
        }
      }
    }

    function openModal() {
      if (modalEl !== null && modalEl.isConnected) {
        const input = modalEl.querySelector('.gs_searchInput')
        if (input !== null) input.focus()
        return
      }
      state.query = ''
      state.results = { sessions: [], prompts: [], tools: [], panels: [] }
      state.error = ''

      const backdrop = document.createElement('div')
      backdrop.className = 'gs_modalBackdrop'
      backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop) closeModal()
      })

      const modal = document.createElement('div')
      modal.className = 'gs_modal'
      modal.innerHTML =
        '<div class="gs_modalHeader">' +
          '<h2 class="gs_modalTitle">全局搜索</h2>' +
          '<button type="button" class="gs_modalClose" aria-label="关闭">×</button>' +
        '</div>' +
        '<input class="gs_searchInput" type="search" placeholder="搜索历史会话、Prompt、MCP 工具、设置面板…" autocomplete="off" />' +
        '<div class="gs_modalBody"></div>'

      backdrop.appendChild(modal)
      document.body.appendChild(backdrop)
      modalEl = backdrop

      const closeBtn = modal.querySelector('.gs_modalClose')
      closeBtn.addEventListener('click', closeModal)

      const input = modal.querySelector('.gs_searchInput')
      input.addEventListener('input', () => {
        state.query = input.value
        clearTimeout(searchTimer)
        searchTimer = setTimeout(runSearch, 250)
      })
      input.addEventListener('keydown', (event) => {
        // ↑/↓ 在结果项之间移动高亮（无选中时分别到首项/末项）
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          moveActiveItem(event.key === 'ArrowDown' ? 1 : -1)
          return
        }
        if (event.key === 'Enter') {
          const items = resultItems()
          const active = activeItemIndex >= 0 ? items[activeItemIndex] : undefined
          // 有高亮项则直接触发该项，不再走「立即刷新搜索」
          if (active !== undefined) {
            event.preventDefault()
            handleResultClick(active)
            return
          }
          clearTimeout(searchTimer)
          runSearch()
        }
      })

      setTimeout(() => input.focus(), 0)
      renderResults()
    }

    function closeModal() {
      if (modalEl === null) return
      activeCtl?.abort()
      activeCtl = null
      modalEl.remove()
      modalEl = null
      clearTimeout(searchTimer)
      activeItemIndex = -1
    }

    /* ---------- 键盘：全局快捷键 + 结果导航 ---------- */

    /** 全局 hotkey：Cmd/Ctrl+K 打开搜索弹窗（已开则聚焦输入框）。 */
    function onGlobalHotkey(event) {
      if (event.isComposing) return
      if ((event.metaKey || event.ctrlKey) && String(event.key).toLowerCase() === 'k') {
        event.preventDefault()
        event.stopPropagation()
        if (modalEl !== null && modalEl.isConnected) {
          const input = modalEl.querySelector('.gs_searchInput')
          if (input !== null) input.focus()
        } else {
          openModal()
        }
      }
    }

    /** 全局 Escape：搜索弹窗打开时关闭（输入框不再单独处理，避免双路）。 */
    function onGlobalEscape(event) {
      if (event.isComposing) return
      if (event.key !== 'Escape') return
      if (modalEl === null || !modalEl.isConnected) return
      closeModal()
    }

    /** 当前渲染出的结果项，按文档顺序跨分组连续。 */
    function resultItems() {
      if (modalEl === null || !modalEl.isConnected) return []
      return Array.from(modalEl.querySelectorAll('.gs_item'))
    }

    /** 设置唯一高亮项并跟随滚动，index 为 -1 时清空全部高亮。 */
    function setActiveItem(items, index) {
      for (let i = 0; i < items.length; i += 1) {
        if (i === index) items[i].setAttribute('data-active', '')
        else items[i].removeAttribute('data-active')
      }
      activeItemIndex = index
      const item = items[index]
      if (item === undefined) return
      try {
        item.scrollIntoView({ block: 'nearest' })
      } catch {
        /* 滚动失败不阻塞 */
      }
    }

    /** ↓/↑ 移动高亮：无选中时 ↓ 到首项、↑ 到末项，到头不循环。 */
    function moveActiveItem(delta) {
      const items = resultItems()
      if (items.length === 0) return
      const next = activeItemIndex < 0
        ? (delta > 0 ? 0 : items.length - 1)
        : Math.min(items.length - 1, Math.max(0, activeItemIndex + delta))
      setActiveItem(items, next)
    }

    function renderResults() {
      if (modalEl === null) return
      const body = modalEl.querySelector('.gs_modalBody')
      if (body === null) return
      // 重渲染会替换 DOM，旧的高亮引用失效：选中索引清零
      activeItemIndex = -1

      if (state.loading) {
        body.innerHTML = '<div class="gs_loading">搜索中…</div>'
        return
      }
      if (state.error) {
        body.innerHTML = '<div class="gs_error">' + esc(state.error) + '</div>'
        return
      }

      const { sessions, prompts, tools, panels } = state.results
      const total = sessions.length + prompts.length + tools.length + panels.length
      if (state.query.trim() === '') {
        body.innerHTML = '<div class="gs_empty">输入关键词，搜索历史会话、Prompt、MCP 工具和设置面板。</div>'
        return
      }
      if (total === 0) {
        body.innerHTML = '<div class="gs_empty">没有找到匹配结果。</div>'
        return
      }

      const parts = []
      if (sessions.length > 0) {
        parts.push('<div class="gs_section">')
        parts.push('<div class="gs_sectionTitle">历史会话</div>')
        parts.push('<div class="gs_list">')
        for (const item of sessions) {
          parts.push(
            '<button type="button" class="gs_item" data-kind="session" data-id="' + esc(item.id) + '">' +
              '<span class="gs_itemTitle">' + highlightText(item.snippet || item.id, state.query) + '</span>' +
              (item.time ? '<span class="gs_itemMeta">' + esc(fmtTime(item.time)) + '</span>' : '') +
            '</button>',
          )
        }
        parts.push('</div></div>')
      }

      if (prompts.length > 0) {
        parts.push('<div class="gs_section">')
        parts.push('<div class="gs_sectionTitle">Prompt</div>')
        parts.push('<div class="gs_list">')
        for (const item of prompts) {
          parts.push(
            '<button type="button" class="gs_item" data-kind="prompt" data-id="' + esc(item.id) + '">' +
              '<span class="gs_itemTitle">' + highlightText(item.name, state.query) + (item.active ? '<span class="gs_badge">启用中</span>' : '') + '<span class="gs_badge">设置</span></span>' +
              (item.description ? '<span class="gs_itemDesc">' + highlightText(item.description, state.query) + '</span>' : '') +
              '<span class="gs_itemDesc">' + highlightText(item.snippet, state.query) + '</span>' +
            '</button>',
          )
        }
        parts.push('</div></div>')
      }

      if (tools.length > 0) {
        parts.push('<div class="gs_section">')
        parts.push('<div class="gs_sectionTitle">MCP 工具</div>')
        parts.push('<div class="gs_list">')
        for (const item of tools) {
          parts.push(
            '<button type="button" class="gs_item" data-kind="tool" data-name="' + esc(item.name) + '">' +
              '<span class="gs_itemTitle">' + highlightText(item.name, state.query) + '<span class="gs_badge">设置</span></span>' +
              (item.description ? '<span class="gs_itemDesc">' + highlightText(item.description, state.query) + '</span>' : '') +
            '</button>',
          )
        }
        parts.push('</div></div>')
      }

      if (panels.length > 0) {
        parts.push('<div class="gs_section">')
        parts.push('<div class="gs_sectionTitle">设置面板</div>')
        parts.push('<div class="gs_list">')
        for (const item of panels) {
          const kind = item.kind === 'section' ? 'section' : 'card'
          parts.push(
            '<button type="button" class="gs_item" data-kind="panel" data-panel-kind="' + kind + '" data-titles="' + esc(JSON.stringify(item.titles || [item.name])) + '">' +
              '<span class="gs_itemTitle">' + highlightText(item.name, state.query) + '<span class="gs_badge">设置</span></span>' +
              (item.description ? '<span class="gs_itemDesc">' + highlightText(item.description, state.query) + '</span>' : '') +
            '</button>',
          )
        }
        parts.push('</div></div>')
      }

      body.innerHTML = parts.join('')
      body.querySelectorAll('.gs_item').forEach((el) => {
        el.addEventListener('click', () => handleResultClick(el))
      })
    }

    async function handleResultClick(el) {
      const kind = el.dataset.kind
      if (kind === 'session') {
        const id = el.dataset.id
        const query = state.query
        const sessions = activeCtx && activeCtx.sessions
        if (sessions && typeof sessions.open === 'function') {
          try {
            sessions.open(id)
            closeModal()
            jumpToSessionText(query)
          } catch (error) {
            toast(error && error.message ? error.message : '打开会话失败', 'error')
          }
        } else {
          toast('当前环境无法直接打开会话', 'error')
        }
        return
      }
      if (kind === 'prompt') {
        const snippet = el.querySelector('.gs_itemDesc:last-of-type')?.textContent || ''
        closeModal()
        const jumped = await openSettingsCard(['Prompt 管理', 'Prompt Management'])
        if (jumped) {
          toast('已打开「Prompt 管理」设置卡片', 'ok')
        } else {
          copyText(snippet)
        }
        return
      }
      if (kind === 'tool') {
        const name = el.dataset.name || ''
        closeModal()
        const jumped = await openSettingsCard(['MCP 服务器配置', 'MCP Server Configuration'])
        if (jumped) {
          toast('已打开「MCP 服务器配置」设置卡片', 'ok')
        } else {
          copyText(name)
        }
        return
      }
      if (kind === 'panel') {
        let titles = [el.dataset.titles || '']
        try {
          const parsed = JSON.parse(el.dataset.titles || '')
          if (Array.isArray(parsed) && parsed.length > 0) titles = parsed
        } catch {
          /* 走默认 */
        }
        const label = titles[0] || '设置面板'
        const isSection = el.dataset.panelKind === 'section'
        closeModal()
        // section => 跳设置一级大类；card => 展开具体卡片
        const jumped = isSection ? await openSettingsSection(titles) : await openSettingsCard(titles)
        if (jumped) {
          toast('已打开「' + label + '」设置' + (isSection ? '分区' : '卡片'), 'ok')
        } else {
          copyText(label)
        }
        return
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

    /** 在设置窗口侧边栏找到匹配一级大类标题的导航按钮。 */
    function findNavSectionButton(titleTexts, scope) {
      const root = (scope && scope.tagName === 'NAV' ? scope : (scope?.querySelector('nav') || scope)) || document
      const buttons = root.querySelectorAll('button')
      for (const btn of buttons) {
        const text = (btn.textContent || '').replace(/\s+/g, ' ').trim()
        const looksLikeNav = /sidebar-nav|section|nav/i.test(btn.className) || btn.closest('nav') !== null || btn.hasAttribute('aria-current') || btn.getAttribute('role') === 'tab'
        if (looksLikeNav && titleTexts.some((item) => text.includes(item))) return btn
      }
      return null
    }

    /** 打开设置对话框并导航到指定一级大类（侧边栏 nav 按钮）。 */
    async function openSettingsSection(titleTexts) {
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
      let sectionButton = await waitFor(() => findNavSectionButton(titleTexts, panel))
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
        if (globalHotkeyHandler === null) {
          globalHotkeyHandler = onGlobalHotkey
          document.addEventListener('keydown', globalHotkeyHandler, true)
        }
        if (globalEscapeHandler === null) {
          globalEscapeHandler = onGlobalEscape
          document.addEventListener('keydown', globalEscapeHandler, true)
        }
        return () => {
          if (disposeSidebar) disposeSidebar()
          if (globalHotkeyHandler !== null) {
            document.removeEventListener('keydown', globalHotkeyHandler, true)
            globalHotkeyHandler = null
          }
          if (globalEscapeHandler !== null) {
            document.removeEventListener('keydown', globalEscapeHandler, true)
            globalEscapeHandler = null
          }
          closeModal()
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
