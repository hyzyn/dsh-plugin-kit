/* eslint-disable */
/**
 * @hyzyn/dsh-rss — 浏览器半体：设置 → 插件 →「RSS / 新闻聚合」卡片。
 * 通过核心 slots 服务注册到 settings.plugin.item 插槽。
 * 支持查看今日 digest、直接点击打开原文，以及维护订阅渠道 / 新闻分类。
 */
window.__ModuleLoader__.load({
  id: '@hyzyn/dsh-rss',
  factory: (require) => {
    const exports = {}

    const React = require('react')
    const { jsx, jsxs } = require('react/jsx-runtime')

    /* ================================ CSS ================================ */

    const CSS = [
      '.rss_pluginCard{list-style:none;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;transition:border-color .16s,background .16s}',
      '.rss_pluginCard:hover{border-color:var(--dsw-alias-label-dimmed)}',
      '.rss_pluginCardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}',
      '.rss_cardHeader{appearance:none;width:100%;color:inherit;font:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;display:flex;align-items:center;gap:12px;padding:14px 16px}',
      '.rss_cardHeader:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.rss_cardHeadText{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}',
      '.rss_cardName{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:600}',
      '.rss_cardDescription{color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.rss_chevron{flex:none;color:var(--dsw-alias-label-tertiary);transition:transform .16s}',
      '.rss_pluginCardOpen .rss_chevron{transform:rotate(180deg)}',
      '.rss_cardBody{padding:2px 16px 16px}',
      '.rss_panel{display:flex;flex-direction:column;gap:12px;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);box-sizing:border-box}',
      '.rss_panelHeader{display:flex;align-items:center;gap:8px 10px;flex:none;flex-wrap:wrap}',
      '.rss_panelTitle{margin:0;font-size:15px;font-weight:700;white-space:nowrap;flex:1;min-width:0}',
      '.rss_toolbar{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex:1 1 100%;min-width:0;flex-wrap:wrap}',
      '.rss_btn{color:var(--dsw-alias-label-primary-foreground);background:var(--dsw-alias-button-info-fill);border:none;border-radius:8px;padding:6px 14px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}',
      '.rss_btn:hover:not(:disabled){background:var(--dsw-alias-button-info-hover)}',
      '.rss_btn:disabled{opacity:.5;cursor:default}',
      '.rss_btnGhost{color:var(--dsw-alias-label-primary);background:0 0;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:5px 12px;font-size:12px;cursor:pointer;white-space:nowrap}',
      '.rss_btnGhost:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
      '.rss_btnGhost:disabled{opacity:.45;cursor:default}',
      '.rss_meta{display:flex;flex-wrap:wrap;gap:6px 14px;color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.rss_file{color:var(--dsw-alias-label-tertiary);font-size:11.5px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}',
      '.rss_banner{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);border-radius:8px;padding:8px 12px;font-size:12.5px;line-height:1.5;overflow-wrap:anywhere;flex:none}',
      '.rss_banner[data-kind=error]{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}',
      '.rss_banner[data-kind=warn]{color:var(--dsw-alias-state-warn-primary);border-color:var(--dsw-alias-state-warn-primary)}',
      '.rss_banner[data-kind=ok]{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}',
      '.rss_loading,.rss_empty{text-align:center;color:var(--dsw-alias-label-tertiary);padding:24px 12px;font-size:12.5px}',
      '.rss_source{margin-top:4px}',
      '.rss_sourceName{font-size:13px;font-weight:700;margin:8px 0 6px}',
      '.rss_subSource{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-secondary);margin:2px 0 4px}',
      '.rss_list{display:flex;flex-direction:column;gap:8px;max-height:420px;overflow-y:auto}',
      '.rss_item{background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:8px 12px;display:flex;flex-direction:column;gap:4px}',
      '.rss_itemTop{display:flex;align-items:flex-start;gap:8px}',
      '.rss_itemMain{flex:1;min-width:0}',
      '.rss_itemTitle{font-size:13px;line-height:1.45}',
      '.rss_itemTitle a{color:var(--dsw-alias-state-business-primary);text-decoration:none}',
      '.rss_itemTitle a:hover{text-decoration:underline}',
      '.rss_itemMeta{color:var(--dsw-alias-label-tertiary);font-size:11.5px;font-weight:400}',
      '.rss_itemSummary{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.5}',
      '.rss_sourcesTitle{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary);margin-top:4px}',
      '.rss_sources{display:flex;flex-wrap:wrap;gap:6px}',
      '.rss_sourceChip{display:inline-block;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:1px 8px;font-size:11px;line-height:1.6;white-space:nowrap}',
      '.rss_settingSection{display:flex;flex-direction:column;gap:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);border-radius:10px;padding:12px}',
      '.rss_settingTitle{font-size:13px;font-weight:700}',
      '.rss_settingHint{color:var(--dsw-alias-label-tertiary);font-size:11.5px;line-height:1.5}',
      '.rss_sourceEditorList{display:flex;flex-direction:column;gap:8px}',
      '.rss_sourceEditor{display:grid;grid-template-columns:1fr 2fr 1fr 70px auto;gap:6px;align-items:center}',
      '.rss_sourceEditor .rss_input{min-width:0}',
      '.rss_builtinList{display:flex;flex-direction:column;gap:2px}',
      '.rss_builtinRow{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--dsw-alias-label-primary);cursor:pointer;padding:3px 0}',
      '.rss_builtinRow input[type=checkbox]{accent-color:var(--dsw-alias-state-business-primary);width:14px;height:14px;margin:0;flex:none}',
      '.rss_builtinName{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.rss_builtinRow .rss_builtinCategory{flex:none;width:120px}',
      '.rss_builtinNote{font-size:11px;color:var(--dsw-alias-label-tertiary);padding:0 0 2px 24px;line-height:1.5}',
      '.rss_input{color:var(--dsw-alias-label-primary);background:var(--dsw-specific-input-major);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;outline:none;padding:6px 9px;font-family:inherit;font-size:12px;box-sizing:border-box;width:100%}',
      '.rss_input:focus{border-color:var(--dsw-alias-state-business-primary)}',
      '.rss_input::placeholder{color:var(--dsw-alias-label-tertiary)}',
      '.rss_addRow{display:flex;gap:6px;align-items:center}',
      '.rss_categories{display:flex;flex-wrap:wrap;gap:6px}',
      '.rss_categoryChip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:2px 6px 2px 10px;font-size:11px;line-height:1.6;white-space:nowrap}',
      '.rss_categoryRemove{appearance:none;background:0 0;border:0;color:var(--dsw-alias-label-tertiary);cursor:pointer;font-size:13px;line-height:1;padding:2px}',
      '.rss_categoryRemove:hover{color:var(--dsw-alias-state-error-primary)}',
      '.rss_linkBtn{color:var(--dsw-alias-state-business-primary);background:0 0;border:none;padding:0;font-size:12px;cursor:pointer;white-space:nowrap}',
      '.rss_linkBtn:hover:not(:disabled){text-decoration:underline}',
      '.rss_linkBtn[data-danger]{color:var(--dsw-alias-state-error-primary)}',
      '.rss_formGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}',
      '.rss_field{display:flex;flex-direction:column;gap:5px}',
      '.rss_fieldLabel{color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:600}',
      '.rss_toast{position:fixed;left:50%;bottom:36px;transform:translateX(-50%);z-index:2147483647;pointer-events:none;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);border-radius:10px;padding:9px 16px;font-size:13px;box-shadow:var(--dsw-shadow-lv3);max-width:70vw}',
      '.rss_toast[data-kind=ok]{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary)}',
      '.rss_toast[data-kind=error]{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}',
      '.rss_sidebarEntry{width:100%;height:32px;color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap;background:0 0;border:none;border-radius:8px;align-items:center;gap:8px;padding:0 12px;font-size:13px;display:flex}',
      '.rss_sidebarEntry:hover{background:var(--dsw-specific-sidebar-nav-item-hover);color:var(--dsw-alias-label-primary)}',
      '.rss_sidebarEntry[data-active]{background:var(--dsw-specific-sidebar-nav-item-active);color:var(--dsw-alias-label-primary);font-weight:600}',
      '.rss_sidebarEntryIcon{flex:none;justify-content:center;align-items:center;display:inline-flex}',
      '.rss_sidebarEntryLabel{text-overflow:ellipsis;overflow:hidden}',
      '[data-dsh-frame][data-sidebar-collapsed] .rss_sidebarEntry{justify-content:center;width:100%;padding:0}',
      '[data-dsh-frame][data-sidebar-collapsed] .rss_sidebarEntryLabel{display:none}',
      '.rss_modalBackdrop{z-index:1300;background:var(--dsw-alias-bg-mask-1);justify-content:center;align-items:center;display:flex;position:fixed;inset:0}',
      '.rss_modal{background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);width:min(720px,100vw - 48px);max-height:calc(100vh - 96px);box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary);border-radius:14px;flex-direction:column;gap:12px;padding:16px;display:flex;overflow:hidden}',
      '.rss_modalHeader{flex:none;align-items:center;gap:10px;display:flex}',
      '.rss_modalTitle{flex:1;margin:0;font-size:16px;font-weight:700}',
      '.rss_modalClose{appearance:none;background:0 0;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);border-radius:8px;width:30px;height:30px;cursor:pointer;font-size:16px;line-height:1}',
      '.rss_modalClose:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}',
      '.rss_modalBody{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:10px}',
      '.rss_modalFooter{flex:none;display:flex;justify-content:flex-end;gap:8px}',
    ].join('\n')

    let styleEl
    function ensureStyle() {
      if (document.getElementById('dsh-rss-style')) return
      styleEl = document.createElement('style')
      styleEl.id = 'dsh-rss-style'
      styleEl.textContent = CSS
      document.head.appendChild(styleEl)
    }

    /* ================================ 基础工具 ================================ */

    const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESC_MAP[c])
    const fmtTime = (value) => {
      if (!value) return ''
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return value
      return date.toLocaleString()
    }

    /* ================================ API ================================ */

    const API = {
      digest: '/api/dsh-rss/digest',
      refresh: '/api/dsh-rss/refresh',
      config: '/api/dsh-rss/config',
      sources: '/api/dsh-rss/sources',
    }

    /* 内置渠道库（与宿主端保持一致；服务端返回时以服务端为准，这里是兜底） */
    const BUILTIN_CHANNELS = [
      { key: 'ruanyifeng', name: '阮一峰的网络日志', url: 'https://www.ruanyifeng.com/blog/atom.xml', category: '技术', site: 'http://www.ruanyifeng.com/blog/' },
      { key: 'sspai', name: '少数派', url: 'https://sspai.com/feed', category: '效率', site: 'https://sspai.com/' },
      { key: 'solidot', name: 'Solidot', url: 'https://www.solidot.org/index.rss', category: '科技', site: 'https://www.solidot.org/' },
      { key: 'hackernews', name: 'Hacker News', url: 'https://news.ycombinator.com/rss', category: '科技', site: 'https://news.ycombinator.com/' },
      { key: 'juejin', name: '掘金', url: 'https://juejin.cn/rss', category: '技术', site: 'https://juejin.cn/' },
      { key: 'ithome', name: 'IT之家', url: 'https://www.ithome.com/rss/', category: '科技', site: 'https://www.ithome.com/' },
      { key: '36kr', name: '36氪', url: 'https://rsshub.rssforever.com/36kr/newsflashes', category: '商业', site: 'https://36kr.com/', note: '官方 feed 被反爬拦截，此处为第三方 RSSHub 镜像，可能不稳定' },
    ]

    async function apiRequest(path, options) {
      const res = await fetch(path, options)
      let body = {}
      try {
        body = await res.json()
      } catch {
        /* 非 JSON 响应 */
      }
      if (!res.ok) {
        const err = new Error((body && body.error) || ('HTTP ' + res.status))
        err.code = res.status
        throw err
      }
      return body
    }

    /* ================================ 面板状态 ================================ */

    const state = {
      digest: null,
      config: null,
      builtins: BUILTIN_CHANNELS,
      newCategory: '',
      loading: false,
      refreshing: false,
      saving: false,
      modalLoading: false,
      error: '',
    }

    let panelEl
    let modalEl
    let toastEl
    let toastTimer

    function toast(message, kind) {
      if (toastEl === undefined || !toastEl.isConnected) {
        toastEl = document.createElement('div')
        toastEl.className = 'rss_toast'
        document.body.appendChild(toastEl)
      }
      toastEl.textContent = message
      toastEl.dataset.kind = kind || 'info'
      toastEl.style.display = ''
      clearTimeout(toastTimer)
      toastTimer = setTimeout(() => {
        toastEl.style.display = 'none'
      }, 3200)
    }

    /* ================================ 渲染 ================================ */

    function renderAll(container) {
      panelEl = container
      container.innerHTML = renderSettingsHtml()
      bindInputs(container)
      renderToast()
    }

    function renderToast() {
      if (toastEl === undefined || !toastEl.isConnected) return
      if (!toastEl.textContent) toastEl.style.display = 'none'
    }

    /* ================================ 侧边栏快捷入口 / 弹窗 ================================ */

    function siteFromFeedUrl(url) {
      try {
        return new URL(url).origin + '/'
      } catch {
        return ''
      }
    }

    function sourceSiteMap(digest, config) {
      const map = {}
      for (const source of config?.sources || []) {
        if (source && source.name && source.url) map[source.name] = siteFromFeedUrl(source.url)
      }
      for (const source of digest?.sources || []) {
        if (source && source.name) map[source.name] = source.site || map[source.name] || ''
      }
      return map
    }

    function renderModalItems(items, sourceSites) {
      if (!items || items.length === 0) return '<div class="rss_empty">今天暂无条目。</div>'
      const sites = sourceSites || {}
      const byCategory = {}
      for (const item of items) {
        const key = item.category || '未分类'
        if (!byCategory[key]) byCategory[key] = []
        byCategory[key].push(item)
      }
      const parts = []
      for (const category of Object.keys(byCategory)) {
        const bySource = {}
        for (const item of byCategory[category]) {
          const key = item.source || '未分类'
          if (!bySource[key]) bySource[key] = []
          bySource[key].push(item)
        }
        parts.push('<div class="rss_source">')
        parts.push('<div class="rss_sourceName">' + esc(category) + '</div>')
        for (const source of Object.keys(bySource)) {
          const site = sites[source]
          const siteLink = site
            ? ' <a class="rss_linkBtn" href="' + esc(site) + '" target="_blank" rel="noreferrer">查看更多</a>'
            : ''
          parts.push('<div class="rss_subSource">')
          parts.push('<span>' + esc(source) + '</span>' + siteLink)
          parts.push('</div>')
          parts.push('<div class="rss_list">')
          for (const item of bySource[source]) {
            const title = item.title || '(无标题)'
            const meta = []
            if (item.date) meta.push(esc(String(item.date).slice(0, 10)))
            parts.push('<div class="rss_item">')
            parts.push('<div class="rss_itemTop">')
            parts.push('<div class="rss_itemMain">')
            parts.push('<div class="rss_itemTitle">' + (item.link
              ? '<a href="' + esc(item.link) + '" target="_blank" rel="noreferrer">' + esc(title) + '</a>'
              : esc(title)) + (meta.length ? ' <span class="rss_itemMeta">' + meta.join(' / ') + '</span>' : '') + '</div>')
            if (item.summary) {
              const summary = item.summary.length > 120 ? item.summary.slice(0, 120) + '…' : item.summary
              parts.push('<div class="rss_itemSummary">' + esc(summary) + '</div>')
            }
            parts.push('</div>')
            parts.push('</div>')
            parts.push('</div>')
          }
          parts.push('</div>')
        }
        parts.push('</div>')
      }
      return parts.join('')
    }

    function renderDigestModal() {
      if (modalEl === undefined) return
      let content
      if (state.modalLoading) {
        content = '<div class="rss_loading">加载中…</div>'
      } else if (!state.digest) {
        content = '<div class="rss_empty">还没有生成 digest，点击“刷新”抓取。</div>'
      } else {
        content = renderModalItems(state.digest.items || [], sourceSiteMap(state.digest, state.config))
        if (state.digest.errors && state.digest.errors.length) {
          content = '<div class="rss_banner" data-kind="warn">抓取失败：' + state.digest.errors.map((e) => esc(e.source + ': ' + e.error)).join('；') + '</div>' + content
        }
      }
      if (state.error) {
        content = '<div class="rss_banner" data-kind="error">' + esc(state.error) + '</div>' + content
      }
      const title = '今日值得读' + (state.digest && state.digest.date ? ' · ' + esc(state.digest.date) : '')
      modalEl.innerHTML = '<div class="rss_modalBackdrop" data-action="modal-backdrop">' +
        '<div class="rss_modal">' +
          '<div class="rss_modalHeader">' +
            '<h3 class="rss_modalTitle">' + title + '</h3>' +
            '<button class="rss_modalClose" data-action="modal-close" aria-label="关闭">×</button>' +
          '</div>' +
          '<div class="rss_modalBody">' + content + '</div>' +
          '<div class="rss_modalFooter">' +
            '<button class="rss_btnGhost" data-action="modal-refresh"' + (state.modalLoading ? ' disabled' : '') + '>刷新</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    }

    function openDigestModal() {
      if (modalEl === undefined || !modalEl.isConnected) {
        modalEl = document.createElement('div')
        modalEl.className = 'rss_modalRoot'
        document.body.appendChild(modalEl)
      }
      modalEl.style.display = ''
      state.modalLoading = true
      renderDigestModal()
      loadDigestModal()
    }

    function closeDigestModal() {
      if (modalEl !== undefined) modalEl.style.display = 'none'
    }

    async function loadDigestModal() {
      state.modalLoading = true
      renderDigestModal()
      try {
        const [digestRes, configRes] = await Promise.all([
          apiRequest(API.digest),
          apiRequest(API.config),
        ])
        state.digest = digestRes
        state.config = configRes.config || { sources: [], categories: [], maxItemsPerSource: 5, maxTotalItems: 30, dailyTime: '08:00' }
        state.error = ''
      } catch (error) {
        state.error = error.message
      } finally {
        state.modalLoading = false
        renderDigestModal()
      }
    }

    async function refreshDigestModal() {
      state.modalLoading = true
      renderDigestModal()
      try {
        const data = await apiRequest(API.refresh, { method: 'POST' })
        state.digest = data
        toast('已刷新', 'ok')
      } catch (error) {
        toast(error.message, 'error')
      } finally {
        state.modalLoading = false
        renderDigestModal()
      }
    }

    /* ================================ 侧边栏入口 ================================ */

    const RSS_SIDEBAR_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h.01M4 8a4 4 0 0 1 4 4M4 4a8 8 0 0 1 8 8"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/></svg>'

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
      const entry = document.createElement('button')
      entry.type = 'button'
      entry.dataset.dshRssEntry = ''
      entry.className = 'rss_sidebarEntry'
      entry.setAttribute('aria-label', '今日值得读')
      entry.innerHTML = '<span class="rss_sidebarEntryIcon">' + RSS_SIDEBAR_ICON + '</span><span class="rss_sidebarEntryLabel">今日值得读</span>'
      entry.addEventListener('click', () => {
        openDigestModal()
      })
      return entry
    }

    function placeSidebarEntry(root, entry) {
      const button = newSessionButton(root)
      if (button === undefined) return false
      if (entry.parentElement !== root) {
        const row = button.closest('[class*="logoRow"]')
        const base = row !== null && row.parentElement === root ? row : button
        const family = Array.from(root.children).filter((el) => el instanceof HTMLElement && el.matches('[data-dsh-rss-entry], [data-dsh-taskboard-entry], [data-dsh-ssh-entry]'))
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
      if (typeof document !== 'undefined' && document.querySelector('[data-dsh-rss-entry]') !== null) return () => {}
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

    function categoryOptions(selected) {
      const options = new Set(state.config?.categories || [])
      if (selected) options.add(selected)
      let html = '<option value="">未分类</option>'
      for (const category of options) {
        html += '<option value="' + esc(category) + '"' + (category === selected ? ' selected' : '') + '>' + esc(category) + '</option>'
      }
      return html
    }

    function builtinOf(source) {
      if (!source) return null
      for (const builtin of state.builtins || []) {
        if ((source.builtin && source.builtin === builtin.key) || source.url === builtin.url || source.name === builtin.name) return builtin
      }
      return null
    }

    function findBuiltinSource(builtin) {
      return (state.config?.sources || []).find((source) => builtinOf(source)?.key === builtin.key) || null
    }

    function customSourceList() {
      return (state.config?.sources || []).filter((source) => builtinOf(source) === null)
    }

    function renderSettingsHtml() {
      const config = state.config
      const parts = []
      parts.push('<div class="rss_panel">')
      parts.push('<div class="rss_panelHeader">')
      parts.push('<h2 class="rss_panelTitle">RSS 设置</h2>')
      parts.push('<div class="rss_toolbar">')
      parts.push('<button class="rss_btn" data-action="config-save"' + (state.saving ? ' disabled' : '') + '>保存</button>')
      parts.push('</div>')
      parts.push('</div>')

      if (state.error) {
        parts.push('<div class="rss_banner" data-kind="error">' + esc(state.error) + '</div>')
      }

      if (state.loading || !config) {
        parts.push('<div class="rss_loading">加载中…</div>')
        parts.push('</div>')
        return parts.join('')
      }

      // 内置渠道
      parts.push('<div class="rss_settingSection">')
      parts.push('<div class="rss_settingTitle">内置渠道</div>')
      parts.push('<div class="rss_settingHint">勾选要展示的渠道，取消勾选即不再抓取；分类决定「今日值得读」里的分组。</div>')
      parts.push('<div class="rss_builtinList">')
      for (const builtin of state.builtins || []) {
        const entry = findBuiltinSource(builtin)
        const category = entry?.category || builtin.category
        parts.push('<label class="rss_builtinRow">')
        parts.push('<input type="checkbox" data-action="builtin-toggle" data-key="' + esc(builtin.key) + '"' + (entry !== null ? ' checked' : '') + ' />')
        parts.push('<span class="rss_builtinName">' + esc(builtin.name) + '</span>')
        parts.push('<select class="rss_input rss_builtinCategory" data-field="builtin-category" data-key="' + esc(builtin.key) + '">' + categoryOptions(category) + '</select>')
        parts.push('</label>')
        if (builtin.note) {
          parts.push('<div class="rss_builtinNote">' + esc(builtin.note) + '</div>')
        }
      }
      parts.push('</div>')
      parts.push('</div>')

      // 自定义渠道
      parts.push('<div class="rss_settingSection">')
      parts.push('<div class="rss_settingTitle">自定义渠道</div>')
      parts.push('<div class="rss_settingHint">添加你自己的 RSS / Atom 地址。保存时会真实抓取校验，抓不到内容的地址会提示且不保存。</div>')
      parts.push('<div class="rss_sourceEditorList">')
      const customList = customSourceList()
      for (let i = 0; i < customList.length; i++) {
        const source = customList[i]
        const fullIndex = config.sources.indexOf(source)
        parts.push('<div class="rss_sourceEditor">')
        parts.push('<input class="rss_input" data-field="source-name" data-index="' + fullIndex + '" value="' + esc(source.name || '') + '" placeholder="名称" />')
        parts.push('<input class="rss_input" data-field="source-url" data-index="' + fullIndex + '" value="' + esc(source.url || '') + '" placeholder="RSS/Atom URL" />')
        parts.push('<select class="rss_input" data-field="source-category" data-index="' + fullIndex + '">' + categoryOptions(source.category) + '</select>')
        parts.push('<input class="rss_input" data-field="source-limit" data-index="' + fullIndex + '" type="number" min="1" value="' + (source.limit || 5) + '" />')
        parts.push('<button class="rss_linkBtn" data-danger="true" data-action="config-remove-source" data-index="' + fullIndex + '">删除</button>')
        parts.push('</div>')
      }
      parts.push('</div>')
      parts.push('<button class="rss_btnGhost" data-action="config-add-source">+ 添加订阅源</button>')
      parts.push('</div>')

      // 新闻分类
      parts.push('<div class="rss_settingSection">')
      parts.push('<div class="rss_settingTitle">新闻分类</div>')
      parts.push('<div class="rss_settingHint">维护分类标签；上方渠道的「分类」从这里选择，digest 按分类分组展示。</div>')
      parts.push('<div class="rss_categories">')
      for (const category of config.categories || []) {
        parts.push('<span class="rss_categoryChip">' + esc(category) + '<button class="rss_categoryRemove" data-action="config-remove-category" data-value="' + esc(category) + '">×</button></span>')
      }
      parts.push('</div>')
      parts.push('<div class="rss_addRow">')
      parts.push('<input class="rss_input" data-field="new-category" value="' + esc(state.newCategory) + '" placeholder="新分类，例如：AI" />')
      parts.push('<button class="rss_btnGhost" data-action="config-add-category">添加</button>')
      parts.push('</div>')
      parts.push('</div>')

      // 通用设置
      parts.push('<div class="rss_settingSection">')
      parts.push('<div class="rss_settingTitle">聚合设置</div>')
      parts.push('<div class="rss_formGrid">')
      parts.push('<div class="rss_field"><span class="rss_fieldLabel">每源条数</span><input class="rss_input" data-field="max-items" type="number" min="1" value="' + (config.maxItemsPerSource || 5) + '" /></div>')
      parts.push('<div class="rss_field"><span class="rss_fieldLabel">每日总条数</span><input class="rss_input" data-field="max-total" type="number" min="1" value="' + (config.maxTotalItems || 30) + '" /></div>')
      parts.push('<div class="rss_field"><span class="rss_fieldLabel">每日生成时间</span><input class="rss_input" data-field="daily-time" value="' + esc(config.dailyTime || '08:00') + '" placeholder="08:00" /></div>')
      parts.push('</div>')
      parts.push('</div>')

      parts.push('</div>')
      return parts.join('')
    }

    /* ================================ 输入绑定 ================================ */

    function bindInputs(container) {
      container.querySelectorAll('[data-field]').forEach((el) => {
        const handler = () => {
          const field = el.dataset.field
          const index = el.dataset.index
          if (!state.config) return
          if (field === 'source-name' && index !== undefined) {
            state.config.sources[index].name = el.value
          } else if (field === 'source-url' && index !== undefined) {
            state.config.sources[index].url = el.value
          } else if (field === 'source-category' && index !== undefined) {
            state.config.sources[index].category = el.value || undefined
          } else if (field === 'source-limit' && index !== undefined) {
            state.config.sources[index].limit = Number(el.value)
          } else if (field === 'builtin-category') {
            const key = el.dataset.key
            const builtin = (state.builtins || []).find((item) => item.key === key)
            if (!builtin) return
            let entry = state.config.sources.find((source) => builtinOf(source)?.key === key)
            if (!entry) {
              entry = { name: builtin.name, url: builtin.url, builtin: builtin.key }
              state.config.sources.push(entry)
              if (panelEl !== undefined) renderAll(panelEl)
            }
            entry.category = el.value || undefined
          } else if (field === 'new-category') {
            state.newCategory = el.value
          } else if (field === 'max-items') {
            state.config.maxItemsPerSource = Number(el.value)
          } else if (field === 'max-total') {
            state.config.maxTotalItems = Number(el.value)
          } else if (field === 'daily-time') {
            state.config.dailyTime = el.value
          }
        }
        el.addEventListener('input', handler)
        el.addEventListener('change', handler)
      })
    }

    /* ================================ 数据操作 ================================ */

    async function load() {
      state.loading = true
      if (panelEl !== undefined) renderAll(panelEl)
      try {
        const [digestRes, configRes] = await Promise.all([
          apiRequest(API.digest),
          apiRequest(API.config),
        ])
        state.digest = digestRes
        state.config = configRes.config || { sources: [], categories: [], maxItemsPerSource: 5, maxTotalItems: 30, dailyTime: '08:00' }
        state.builtins = configRes.builtins || BUILTIN_CHANNELS
        state.error = ''
      } catch (error) {
        state.error = error.message
      } finally {
        state.loading = false
        if (panelEl !== undefined) renderAll(panelEl)
      }
    }

    async function refresh() {
      state.refreshing = true
      state.error = ''
      if (panelEl !== undefined) renderAll(panelEl)
      try {
        const data = await apiRequest(API.refresh, { method: 'POST' })
        state.digest = data
        toast('已刷新', 'ok')
      } catch (error) {
        state.error = error.message
        toast(error.message, 'error')
      } finally {
        state.refreshing = false
        if (panelEl !== undefined) renderAll(panelEl)
      }
    }

    async function saveConfig() {
      if (!state.config) return
      state.saving = true
      state.error = ''
      if (panelEl !== undefined) renderAll(panelEl)
      try {
        const data = await apiRequest(API.config, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ config: state.config }),
        })
        state.config = data.config || state.config
        state.builtins = data.builtins || BUILTIN_CHANNELS
        state.newCategory = ''
        toast('已保存', 'ok')
        await refresh()
      } catch (error) {
        state.error = error.message
        toast(error.message, 'error')
      } finally {
        state.saving = false
        if (panelEl !== undefined) renderAll(panelEl)
      }
    }

    /* ================================ 事件 ================================ */

    function handleClick(event) {
      const target = event.target
      const el = target && target.closest ? target.closest('[data-action]') : null
      if (!el) return
      const action = el.dataset.action
      const index = el.dataset.index
      const value = el.dataset.value

      if (action === 'modal-close') {
        closeDigestModal()
      } else if (action === 'modal-refresh') {
        refreshDigestModal()
      } else if (action === 'modal-backdrop') {
        if (event.target === el) closeDigestModal()
      } else if (action === 'builtin-toggle') {
        if (!state.config) return
        const key = el.dataset.key
        const builtin = (state.builtins || []).find((item) => item.key === key)
        if (!builtin) return
        if (el.checked) {
          if (findBuiltinSource(builtin) === null) {
            state.config.sources.push({ name: builtin.name, url: builtin.url, category: builtin.category, builtin: builtin.key })
          }
        } else {
          state.config.sources = state.config.sources.filter((source) => builtinOf(source)?.key !== key)
        }
      } else if (action === 'config-add-source') {
        if (!state.config) return
        state.config.sources.push({ name: '', url: '', category: '', limit: 5 })
        if (panelEl !== undefined) renderAll(panelEl)
      } else if (action === 'config-remove-source') {
        if (!state.config || index === undefined) return
        state.config.sources.splice(Number(index), 1)
        if (panelEl !== undefined) renderAll(panelEl)
      } else if (action === 'config-add-category') {
        if (!state.config) return
        const value = (state.newCategory || '').trim()
        if (!value) return
        if (!state.config.categories) state.config.categories = []
        if (!state.config.categories.includes(value)) state.config.categories.push(value)
        state.newCategory = ''
        if (panelEl !== undefined) renderAll(panelEl)
      } else if (action === 'config-remove-category') {
        if (!state.config) return
        state.config.categories = (state.config.categories || []).filter((item) => item !== value)
        if (panelEl !== undefined) renderAll(panelEl)
      } else if (action === 'config-save') {
        saveConfig()
      }
    }

    /* ================================ 面板宿主挂载 ================================ */

    function mountDomPanel(host) {
      if (panelEl !== undefined && panelEl.isConnected && panelEl.parentElement === host) {
        renderAll(panelEl)
        return
      }
      if (panelEl !== undefined) panelEl.remove()
      panelEl = document.createElement('div')
      panelEl.className = 'rss_panelHost'
      host.appendChild(panelEl)
      renderAll(panelEl)
    }

    /* ================================ 设置卡片（React 外壳） ================================ */

    const CHEVRON_PATH = 'M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 9.13382 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z'

    function RssSettingsCard() {
      const [open, setOpen] = React.useState(false)
      const hostRef = React.useRef(null)
      React.useEffect(() => {
        if (!open) return
        const host = hostRef.current
        if (host === null) return
        mountDomPanel(host)
        load()
      }, [open])
      return jsxs('li', {
        className: open ? 'rss_pluginCard rss_pluginCardOpen' : 'rss_pluginCard',
        children: [
          jsxs('button', {
            type: 'button',
            className: 'rss_cardHeader',
            'aria-expanded': open,
            onClick: () => setOpen((current) => !current),
            children: [
              jsxs('span', {
                className: 'rss_cardHeadText',
                children: [
                  jsx('span', { className: 'rss_cardName', children: 'RSS / 新闻聚合' }),
                  jsx('span', { className: 'rss_cardDescription', children: '订阅 RSS/Atom，管理渠道与分类，每天自动汇总「今日值得读」。' }),
                ],
              }),
              jsx('svg', {
                width: '14',
                height: '14',
                viewBox: '0 0 14 14',
                fill: 'none',
                xmlns: 'http://www.w3.org/2000/svg',
                className: 'rss_chevron',
                children: jsx('path', { d: CHEVRON_PATH, fill: 'currentColor' }),
              }),
            ],
          }),
          open ? jsx('div', {
            className: 'rss_cardBody',
            children: jsx('div', { ref: hostRef, className: 'rss_cardHost' }),
          }) : null,
        ],
      })
    }

    /* ================================ 插件入口 ================================ */

    exports.inject = ['slots']

    exports.apply = (ctx) => {
      ctx.effect(() => {
        ensureStyle()
        document.addEventListener('click', handleClick, true)
        const disposeSidebar = mountSidebarEntry()
        return () => {
          document.removeEventListener('click', handleClick, true)
          if (disposeSidebar) disposeSidebar()
          styleEl?.remove()
          styleEl = undefined
          toastEl?.remove()
          toastEl = undefined
          panelEl?.remove()
          panelEl = undefined
          modalEl?.remove()
          modalEl = undefined
        }
      })
      ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
        name: 'settings.plugin.item',
        id: 'rss-digest',
        order: 100,
      }, RssSettingsCard))
    }

    return exports
  },
})
