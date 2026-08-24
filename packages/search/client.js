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
      '.gs_sidebarEntry{width:100%;height:32px;color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap;background:0 0;border:none;border-radius:8px;align-items:center;gap:8px;padding:0 12px;font-size:13px;display:flex}',
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
      '[data-dsh-frame][data-sidebar-collapsed] .gs_sidebarEntry{justify-content:center;width:100%;padding:0}',
      '[data-dsh-frame][data-sidebar-collapsed] .gs_sidebarEntryLabel{display:none}',
      '[data-dsh-frame][data-sidebar-collapsed] .gs_sidebarSearch{justify-content:center;width:100%;padding:0;border-color:transparent}',
      '[data-dsh-frame][data-sidebar-collapsed] .gs_sidebarSearchInput{display:none}',
      '.gs_modalBackdrop{z-index:1300;background:var(--dsw-alias-bg-mask-1);justify-content:center;align-items:flex-start;display:flex;position:fixed;inset:0;padding-top:10vh}',
      '.gs_modal{background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);width:min(680px,100vw - 48px);max-height:80vh;box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary);border-radius:14px;flex-direction:column;gap:12px;padding:16px;display:flex;overflow:hidden}',
      '.gs_modalHeader{flex:none;align-items:center;gap:10px;display:flex}',
      '.gs_modalTitle{flex:1;margin:0;font-size:16px;font-weight:700;white-space:nowrap}',
      '.gs_modalClose{appearance:none;background:0 0;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);border-radius:8px;width:30px;height:30px;cursor:pointer;font-size:16px;line-height:1}',
      '.gs_modalClose:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}',
      '.gs_searchInput{color:var(--dsw-alias-label-primary);background:var(--dsw-specific-input-major);border:1px solid var(--dsw-alias-border-l2);border-radius:10px;outline:none;padding:10px 14px;font-family:inherit;font-size:14px;box-sizing:border-box;width:100%}',
      '.gs_searchInput:focus{border-color:var(--dsw-alias-state-business-primary)}',
      '.gs_searchInput:focus-visible{outline:none}',
      '.gs_searchInput::placeholder{color:var(--dsw-alias-label-tertiary)}',
      '.gs_modalBody{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:14px}',
      '.gs_sectionTitle{font-size:12px;font-weight:700;color:var(--dsw-alias-label-tertiary);margin:2px 0 6px;text-transform:uppercase;letter-spacing:.03em}',
      '.gs_list{display:flex;flex-direction:column;gap:6px}',
      '.gs_item{background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:8px 12px;display:flex;flex-direction:column;gap:3px;cursor:pointer}',
      '.gs_item:hover{border-color:var(--dsw-alias-label-dimmed)}',
      '.gs_itemTitle{font-size:13px;font-weight:600;line-height:1.4;display:flex;align-items:center;gap:8px}',
      '.gs_itemMeta{color:var(--dsw-alias-label-tertiary);font-size:11px;font-weight:400}',
      '.gs_itemDesc{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.5;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
      '.gs_badge{display:inline-block;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:0 7px;font-size:10px;line-height:1.7;white-space:nowrap;flex:none}',
      '.gs_highlight{background:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-label-primary-foreground);border-radius:2px;padding:0 1px}',
      '.gs_empty,.gs_loading,.gs_error{text-align:center;color:var(--dsw-alias-label-tertiary);padding:24px 12px;font-size:12.5px}',
      '.gs_error{color:var(--dsw-alias-state-error-primary)}',
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
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESC_MAP[c])
    const fmtTime = (value) => {
      if (!value) return ''
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return ''
      return date.toLocaleString()
    }

    function highlightText(text, query) {
      const value = String(text ?? '')
      const q = String(query ?? '').trim()
      if (q === '') return esc(value)
      const lower = value.toLowerCase()
      const lowerQ = q.toLowerCase()
      const parts = []
      let index = 0
      for (;;) {
        const found = lower.indexOf(lowerQ, index)
        if (found === -1) {
          parts.push(esc(value.slice(index)))
          break
        }
        parts.push(esc(value.slice(index, found)))
        parts.push('<mark class="gs_highlight">' + esc(value.slice(found, found + q.length)) + '</mark>')
        index = found + q.length
      }
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

    const SEARCH_ICON = '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/></svg>'

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
        if (event.key === 'Escape') closeModal()
        if (event.key === 'Enter') {
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
    }

    function renderResults() {
      if (modalEl === null) return
      const body = modalEl.querySelector('.gs_modalBody')
      if (body === null) return

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

    function findTextContainer(query) {
      const q = String(query || '').trim().toLowerCase()
      if (q === '') return null
      const root = document.querySelector('[data-conversation-scroll]') || document.querySelector('[class*="conversation"]') || document.body
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      while (walker.nextNode()) {
        const node = walker.currentNode
        if (!(node.nodeValue || '').toLowerCase().includes(q)) continue
        let el = node.parentElement
        for (let i = 0; i < 8 && el; i += 1) {
          if (el.matches && el.matches('[class*="flowItem"], [class*="message"], [class*="node"], [class*="turn"], [class*="chat"], [class*="content"]')) return el
          el = el.parentElement
        }
        return node.parentElement
      }
      return null
    }

    async function jumpToSessionText(query) {
      const q = String(query || '').trim()
      if (q === '') return
      const target = await waitFor(() => findTextContainer(q), 6000)
      if (target === null) return
      try {
        target.scrollIntoView({ block: 'center', behavior: 'smooth' })
        target.style.outline = '2px solid var(--dsw-alias-state-warn-primary)'
        target.style.borderRadius = '8px'
        setTimeout(() => {
          target.style.outline = ''
          target.style.borderRadius = ''
        }, 3000)
      } catch {
        /* 滚动失败不阻塞 */
      }
    }

    /* ================================ 插件入口 ================================ */

    exports.inject = ['sessions']

    exports.apply = (ctx) => {
      activeCtx = ctx
      ctx.effect(() => {
        ensureStyle()
        const disposeSidebar = mountSidebarEntry()
        return () => {
          if (disposeSidebar) disposeSidebar()
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
