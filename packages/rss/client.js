/* eslint-disable */
/**
 * @hyzyn/dsh-rss — 浏览器半体：设置 → 插件 →「RSS / 新闻聚合」卡片。
 * 通过核心 slots 服务注册到 settings.plugin.item 插槽。
 * 支持在设置页顶部直接预览今日 digest（统计 / 失败告警 / 查看、刷新、复制），
 * 维护订阅渠道 / 新闻分类，浏览搜索 awesome-rsshub-routes 精选订阅源目录并一键添加订阅；
 * 侧边栏「今日值得读」弹窗支持搜索、按分类筛选、复制 Markdown。
 *
 * 渲染采用「分区块更新」：输入、目录搜索、增删渠道只重建受影响区块，
 * 不再整面板 innerHTML 替换，避免焦点 / 光标 / 滚动丢失。
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
      '.rss_panelHeader{display:flex;align-items:center;gap:8px 10px;flex:none;flex-wrap:wrap;position:sticky;top:0;z-index:20;background:var(--dsw-alias-bg-layer-3);padding:8px 0;margin:-2px 0 0}',
      '.rss_panelTitle{margin:0;font-size:15px;font-weight:700;white-space:nowrap;flex:1;min-width:0}',
      '.rss_toolbar{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex:1 1 100%;min-width:0;flex-wrap:wrap}',
      '.rss_btn{color:var(--dsw-alias-label-primary-foreground);background:var(--dsw-alias-button-info-fill);border:none;border-radius:8px;padding:6px 14px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}',
      '.rss_btn:hover:not(:disabled){background:var(--dsw-alias-button-info-hover)}',
      '.rss_btn:disabled{opacity:.5;cursor:default}',
      '.rss_btnGhost{color:var(--dsw-alias-label-primary);background:0 0;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:5px 12px;font-size:12px;cursor:pointer;white-space:nowrap}',
      '.rss_btnGhost:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
      '.rss_btnGhost:disabled{opacity:.45;cursor:default}',
      '.rss_dirtyChip{flex:none;display:inline-flex;align-items:center;gap:5px;border:1px solid var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-primary);border-radius:999px;padding:1px 9px;font-size:11px;line-height:1.6;white-space:nowrap}',
      '.rss_dirtyChip::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor;flex:none}',
      '.rss_meta{display:flex;flex-wrap:wrap;gap:6px 14px;color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.rss_file{color:var(--dsw-alias-label-tertiary);font-size:11.5px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}',
      '.rss_banner{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);border-radius:8px;padding:8px 12px;font-size:12.5px;line-height:1.5;overflow-wrap:anywhere;flex:none}',
      '.rss_banner[data-kind=error]{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}',
      '.rss_banner[data-kind=warn]{color:var(--dsw-alias-state-warn-primary);border-color:var(--dsw-alias-state-warn-primary)}',
      '.rss_banner[data-kind=ok]{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}',
      '.rss_loading,.rss_empty{text-align:center;color:var(--dsw-alias-label-tertiary);padding:24px 12px;font-size:12.5px}',
      '.rss_digestStats{color:var(--dsw-alias-label-secondary);font-size:12px;margin:2px 0 8px;line-height:1.5}',
      '.rss_digestActions{display:flex;gap:8px;flex-wrap:wrap}',
      '.rss_customCount{flex:none;color:var(--dsw-alias-label-tertiary);font-size:12px;white-space:nowrap}',
      '.rss_srcNameCell{display:flex;flex-direction:column;gap:4px;min-width:0}',
      '.rss_dupRow{border-left:2px solid var(--dsw-alias-state-warn-primary)}',
      '.rss_dupBadge{display:inline-block;align-self:flex-start;color:var(--dsw-alias-state-warn-primary);border:1px solid var(--dsw-alias-state-warn-primary);border-radius:999px;font-size:10px;line-height:1.4;padding:0 6px}',
      '.rss_catalogToolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}',
      '.rss_catalogStats{flex:1;min-width:0;color:var(--dsw-alias-label-tertiary);font-size:12px}',
      '.rss_customImport{display:flex;gap:8px;align-items:center;flex-wrap:wrap;flex:none}',
      '.rss_customImportHint{flex:1 1 100%;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:1.5}',
      '.rss_importPaste{display:flex;gap:8px;align-items:flex-end}',
      '.rss_importTextarea{min-height:76px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;line-height:1.5}',
      '.rss_itemTop input[type=checkbox]{accent-color:var(--dsw-alias-state-business-primary);width:15px;height:15px;margin:2px 0 0;flex:none;cursor:pointer}',
      '.rss_itemTop input[type=checkbox]:disabled{opacity:.5;cursor:default}',
      '.rss_catalogSources{display:flex;flex-direction:column;gap:6px;border:1px dashed var(--dsw-alias-border-l2);border-radius:8px;padding:10px}',
      '.rss_catalogSourceRow{display:flex;align-items:center;gap:10px;font-size:12px}',
      '.rss_catalogSourceName{flex:none;max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--dsw-alias-label-primary);font-weight:600}',
      '.rss_catalogSourceMeta{flex:1;min-width:0;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.rss_catalogSourceError{color:var(--dsw-alias-state-error-primary)}',
      '.rss_catalogSourcePending{color:var(--dsw-alias-state-warn-primary)}',
      '.rss_catalogSourceActions{flex:none}',
      '.rss_catalogOrigin{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary)}',
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
      '.rss_channelList{display:flex;flex-direction:column;gap:6px;min-width:0}',
      '.rss_channelRow{display:grid;grid-template-columns:20px 24px minmax(80px,1.2fr) minmax(100px,1.5fr) minmax(80px,0.8fr) 52px 52px;gap:6px;align-items:center;padding:6px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-2);min-width:0}',
      '.rss_channelRow .rss_input{min-width:0}',
      '.rss_channelRow > *{min-width:0}',
      '.rss_channelRow.rss_dragging{opacity:.45}',
      '.rss_dragHandle{cursor:grab;color:var(--dsw-alias-label-tertiary);text-align:center;user-select:none;font-size:14px;line-height:1}',
      '.rss_dragHandle:active{cursor:grabbing}',
      '.rss_channelName,.rss_channelUrl{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--dsw-alias-label-primary)}',
      '.rss_channelUrl{color:var(--dsw-alias-label-tertiary)}',
      '.rss_channelType{font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}',
      '.rss_disabledTitle{font-size:11.5px;font-weight:600;color:var(--dsw-alias-label-tertiary);margin:8px 0 2px}',
      '.rss_builtinList{display:flex;flex-direction:column;gap:2px}',
      '.rss_builtinRow{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--dsw-alias-label-primary);cursor:pointer;padding:3px 0}',
      '.rss_builtinRow input[type=checkbox]{accent-color:var(--dsw-alias-state-business-primary);width:14px;height:14px;margin:0;flex:none}',
      '.rss_builtinName{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.rss_builtinRow .rss_builtinCategory{flex:none;width:120px}',
      '.rss_builtinNote{font-size:11px;color:var(--dsw-alias-label-tertiary);padding:0 0 2px 24px;line-height:1.5}',
      '.rss_channelRow.rss_builtinRow{display:grid;padding:6px 8px;gap:6px}',
      '.rss_channelRow.rss_builtinRow .rss_builtinCategory{width:auto;flex:none}',
      '.rss_input{color:var(--dsw-alias-label-primary);background:var(--dsw-specific-input-major);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;outline:none;padding:6px 9px;font-family:inherit;font-size:12px;box-sizing:border-box;width:100%}',
      '.rss_input:focus{border-color:var(--dsw-alias-state-business-primary)}',
      '.rss_input::placeholder{color:var(--dsw-alias-label-tertiary)}',
      '.rss_addRow{display:flex;gap:6px;align-items:center}',
      '.rss_addRow > .rss_input:first-child{flex:1;min-width:0}',
      '.rss_addRow > .rss_input:last-child{flex:none;width:auto;max-width:55%}',
      '.rss_catalogAddRow{display:grid;grid-template-columns:minmax(140px,1fr) minmax(220px,2fr) auto;gap:6px;align-items:center}',
      '.rss_catalogAddRow .rss_input{min-width:0}',
      '.rss_catalogSearchRow{display:grid;grid-template-columns:minmax(220px,2fr) minmax(110px,1fr) minmax(110px,1fr);gap:6px;align-items:center}',
      '.rss_catalogSearchRow .rss_input{min-width:0}',
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
      '.rss_toast{position:fixed;left:50%;bottom:36px;transform:translateX(-50%);transform-origin:center;z-index:2147483647;pointer-events:none;display:flex;align-items:center;gap:8px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);border-radius:10px;padding:9px 16px;font-size:13px;box-shadow:var(--dsw-shadow-lv3);max-width:70vw;animation:rss_toastIn .18s ease-out}',
      '.rss_toast[data-kind=ok]{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary)}',
      '.rss_toast[data-kind=error]{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}',
      '.rss_toastIcon{flex:none;font-weight:700}',
      '@keyframes rss_toastIn{from{opacity:0;transform:translate(-50%,8px)}to{opacity:1;transform:translate(-50%,0)}}',
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
      '.rss_modalToolbar{display:flex;gap:8px;flex:none}',
      '.rss_modalChips{display:flex;flex-wrap:wrap;gap:6px;flex:none}',
      '.rss_modalChip{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0;border-radius:999px;padding:2px 10px;font-size:11.5px;line-height:1.6;cursor:pointer}',
      '.rss_modalChip:hover{border-color:var(--dsw-alias-label-dimmed);color:var(--dsw-alias-label-primary)}',
      '.rss_modalChipActive{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary)}',
      '.rss_modalFooter{flex:none;display:flex;justify-content:flex-end;gap:8px;align-items:center}',
      '.rss_modalCount{flex:1;color:var(--dsw-alias-label-tertiary);font-size:12px;align-self:center;min-width:0}',
    ].join('\n')

    let styleEl
    function ensureStyle() {
      // 复用页面上的 style 节点并强制刷新内容：HMR / 热重载时旧版 CSS 会残留，
      // 若不覆盖会导致新样式（弹窗 chips、digest 预览等）缺失、界面错乱。
      styleEl = document.getElementById('dsh-rss-style') || (() => {
        const el = document.createElement('style')
        el.id = 'dsh-rss-style'
        document.head.appendChild(el)
        return el
      })()
      styleEl.textContent = CSS
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
      catalog: '/api/dsh-rss/catalog',
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
      dirty: false,
      catalogQuery: '',
      catalogCategory: '',
      catalogEntries: [],
      catalogCategories: [],
      catalogLoading: false,
      catalogError: '',
      catalogDisabled: false,
      catalogSelected: new Set(),
      catalogSource: '',
      catalogSources: [],
      catalogBuiltin: null,
      catalogNewName: '',
      catalogNewUrl: '',
      catalogOpen: false,
      customQuery: '',
      modalQuery: '',
      modalCategory: '',
      modalOpener: null,
      importOpen: false,
      importText: '',
    }

    let panelEl
    let modalEl
    let catalogModalEl
    let toastEl
    let toastTimer
    let saveTimer
    let dragIndex = null

    /* ================================ Toast ================================ */

    const TOAST_ICONS = { ok: '✓', error: '✕', info: 'ⓘ' }

    function toast(message, kind) {
      if (toastEl !== undefined) toastEl.remove()
      toastEl = document.createElement('div')
      toastEl.className = 'rss_toast'
      toastEl.setAttribute('role', 'status')
      toastEl.dataset.kind = kind || 'info'
      const icon = TOAST_ICONS[kind || 'info'] || ''
      toastEl.innerHTML = (icon ? '<span class="rss_toastIcon">' + icon + '</span>' : '') + '<span>' + esc(message) + '</span>'
      document.body.appendChild(toastEl)
      clearTimeout(toastTimer)
      toastTimer = setTimeout(() => {
        toastEl.remove()
        toastEl = undefined
      }, 3200)
    }

    /* ================================ 区块渲染 ================================ */

    function categoryOptions(selected) {
      const options = new Set(state.config?.categories || [])
      if (selected) options.add(selected)
      let html = '<option value="">未分类</option>'
      for (const category of options) {
        html += '<option value="' + esc(category) + '"' + (category === selected ? ' selected' : '') + '>' + esc(category) + '</option>'
      }
      return html
    }

    function catalogCategoryOptions() {
      const selected = state.catalogCategory || ''
      let html = '<option value="">全部分类</option>'
      for (const cat of state.catalogCategories || []) {
        html += '<option value="' + esc(cat) + '"' + (cat === selected ? ' selected' : '') + '>' + esc(cat) + '</option>'
      }
      return html
    }

    function catalogSourceOptions() {
      const selected = state.catalogSource || ''
      let html = '<option value="">全部来源</option>'
      const builtin = state.catalogBuiltin
      if (builtin && builtin.enabled) {
        html += '<option value="' + esc(builtin.name || 'awesome-rsshub-routes') + '"' + (selected === builtin.name ? ' selected' : '') + '>' + esc(builtin.name || 'awesome-rsshub-routes') + '</option>'
      }
      for (const source of state.catalogSources || []) {
        const value = source.name
        html += '<option value="' + esc(value) + '"' + (selected === value ? ' selected' : '') + '>' + esc(value) + '</option>'
      }
      return html
    }

    function catalogRoot() {
      if (catalogModalEl !== undefined && catalogModalEl.isConnected) return catalogModalEl
      return panelEl
    }

    function updateCatalogSources() {
      const root = catalogRoot()
      const node = root !== undefined ? root.querySelector('#rss-catalog-sources') : null
      if (node === null) return
      node.outerHTML = '<div id="rss-catalog-sources">' + renderCatalogSourcesBlock() + '</div>'
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

    function channelListHtml() {
      const query = (state.customQuery || '').trim().toLowerCase()
      const sources = state.config?.sources || []
      const urlCount = new Map()
      for (const source of sources) {
        const key = (source.url || '').trim().toLowerCase()
        urlCount.set(key, (urlCount.get(key) || 0) + 1)
      }
      const enabled = []
      for (let i = 0; i < sources.length; i++) {
        const source = sources[i]
        const builtin = builtinOf(source)
        if (!query || (source.name || '').toLowerCase().includes(query) || (source.url || '').toLowerCase().includes(query)) {
          enabled.push({
            source,
            index: i,
            builtin,
            dup: urlCount.get((source.url || '').trim().toLowerCase()) > 1,
          })
        }
      }
      const disabledBuiltins = (state.builtins || [])
        .filter((builtin) => findBuiltinSource(builtin) === null)
        .filter((builtin) => !query || (builtin.name || '').toLowerCase().includes(query) || (builtin.url || '').toLowerCase().includes(query))
      if (enabled.length === 0 && disabledBuiltins.length === 0) {
        return '<div class="rss_empty">没有匹配的渠道。</div>'
      }
      const parts = []
      parts.push('<div class="rss_channelList" id="rss-channel-list">')
      for (const row of enabled) parts.push(renderChannelRow(row))
      if (disabledBuiltins.length > 0) {
        parts.push('<div class="rss_disabledTitle">未启用内置渠道</div>')
        for (const builtin of disabledBuiltins) parts.push(renderDisabledBuiltinRow(builtin))
      }
      parts.push('</div>')
      return parts.join('')
    }

    function renderChannelRow(row) {
      const { source, index, builtin, dup } = row
      if (builtin) {
        const category = source.category?.trim() || builtin.category
        return '<div class="rss_channelRow rss_builtinRow" data-channel-index="' + index + '">' +
          '<span class="rss_dragHandle" draggable="true" data-drag-index="' + index + '" title="拖拽排序">⋮⋮</span>' +
          '<input type="checkbox" data-action="builtin-toggle" data-key="' + esc(builtin.key) + '" checked />' +
          '<span class="rss_channelName" title="' + esc(builtin.name) + '">' + esc(builtin.name) + '</span>' +
          '<span class="rss_channelUrl" title="' + esc(builtin.url) + '">' + esc(builtin.url) + '</span>' +
          '<select class="rss_input rss_builtinCategory" data-field="rss-builtin-category" data-key="' + esc(builtin.key) + '">' + categoryOptions(category) + '</select>' +
          '<span class="rss_channelType">内置</span>' +
          '<span></span>' +
          '</div>'
      }
      return '<div class="rss_channelRow' + (dup ? ' rss_dupRow' : '') + '" data-channel-index="' + index + '">' +
        '<span class="rss_dragHandle" draggable="true" data-drag-index="' + index + '" title="拖拽排序">⋮⋮</span>' +
        '<span></span>' +
        '<input class="rss_input" data-field="rss-source-name" data-index="' + index + '" value="' + esc(source.name || '') + '" placeholder="名称" />' +
        '<input class="rss_input" data-field="rss-source-url" data-index="' + index + '" value="' + esc(source.url || '') + '" placeholder="RSS/Atom URL" spellcheck="false" />' +
        '<select class="rss_input" data-field="rss-source-category" data-index="' + index + '">' + categoryOptions(source.category) + '</select>' +
        '<span class="rss_channelType">自定义</span>' +
        '<button class="rss_linkBtn" data-danger="true" data-action="config-remove-source" data-index="' + index + '">删除</button>' +
        '</div>'
    }

    function renderDisabledBuiltinRow(builtin) {
      return '<div class="rss_channelRow rss_builtinRow" data-disabled="true">' +
        '<span class="rss_dragHandle" style="visibility:hidden">⋮⋮</span>' +
        '<input type="checkbox" data-action="builtin-toggle" data-key="' + esc(builtin.key) + '" />' +
        '<span class="rss_channelName" title="' + esc(builtin.name) + '">' + esc(builtin.name) + '</span>' +
        '<span class="rss_channelUrl" title="' + esc(builtin.url) + '">' + esc(builtin.url) + '</span>' +
        '<span class="rss_channelType">内置</span>' +
        '<span></span><span></span>' +
        '</div>'
    }

    function renderChannelsSection() {
      const all = state.config?.sources || []
      const parts = []
      parts.push('<div class="rss_settingSection" id="rss-sec-channels">')
      parts.push('<div class="rss_settingTitle">订阅渠道</div>')
      parts.push('<div class="rss_settingHint">内置渠道和自定义渠道统一管理；拖拽手柄可排序，常用修改会自动保存。</div>')
      parts.push('<div class="rss_addRow" id="rss-custom-tools">')
      parts.push('<input class="rss_input" data-field="rss-custom-query" value="' + esc(state.customQuery) + '" placeholder="筛选名称 / URL…" autocomplete="off" spellcheck="false" />')
      parts.push('<span class="rss_customCount">' + all.length + ' 个</span>')
      parts.push('<button class="rss_btnGhost" data-action="config-add-source">+ 添加源</button>')
      parts.push('</div>')
      parts.push('<div class="rss_customImport">')
      parts.push('<input type="file" id="rss-import-file" data-field="rss-import-file" accept=".opml,.xml,text/xml,application/xml" style="display:none" />')
      parts.push('<button class="rss_btnGhost" data-action="custom-import-opml">导入 OPML</button>')
      parts.push('<button class="rss_btnGhost" data-action="custom-import-paste">' + (state.importOpen ? '收起粘贴导入' : '粘贴 URL 列表') + '</button>')
      parts.push('<button class="rss_btnGhost" data-action="custom-export-opml">导出 OPML</button>')
      parts.push('<button class="rss_btnGhost" data-action="catalog-open">订阅源目录</button>')
      parts.push('<span class="rss_customImportHint">支持从任何 RSS 阅读器 / 网站导入订阅（OPML 文件或 URL 列表），也可导出给其他应用使用；导入后会自动校验并保存。</span>')
      parts.push('</div>')
      if (state.importOpen) {
        parts.push('<div class="rss_importPaste">')
        parts.push('<textarea class="rss_input rss_importTextarea" data-field="rss-import-text" placeholder="每行一个订阅地址；也可用「名称, 地址」格式：&#10;阮一峰的网络日志, https://www.ruanyifeng.com/blog/atom.xml&#10;https://example.com/feed">' + esc(state.importText) + '</textarea>')
        parts.push('<button class="rss_btn" data-action="custom-import-paste-go">导入</button>')
        parts.push('</div>')
      }
      parts.push('<div id="rss-channel-list">' + channelListHtml() + '</div>')
      parts.push('</div>')
      return parts.join('')
    }

    function updateChannels() {
      updateSection('rss-sec-channels', renderChannelsSection())
    }

    function updateChannelList() {
      const node = panelEl !== undefined ? panelEl.querySelector('#rss-channel-list') : null
      if (node === null) return
      node.innerHTML = channelListHtml()
    }

    function moveChannel(from, to) {
      const sources = state.config?.sources
      if (!sources || from === to || from < 0 || from >= sources.length || to < 0 || to >= sources.length) return
      const [moved] = sources.splice(from, 1)
      sources.splice(to, 0, moved)
      updateChannels()
      markDirty()
      scheduleSave()
    }

    function handleChannelDragStart(event) {
      if ((state.customQuery || '').trim()) return
      const handle = event.target.closest ? event.target.closest('[data-drag-index]') : null
      if (!handle) return
      dragIndex = Number(handle.dataset.dragIndex)
      const row = handle.closest('[data-channel-index]')
      if (row) row.classList.add('rss_dragging')
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move'
        try {
          event.dataTransfer.setData('text/plain', String(dragIndex))
        } catch {
          /* 某些环境不允许 setData */
        }
      }
    }

    function handleChannelDragOver(event) {
      if (dragIndex === null) return
      const row = event.target.closest ? event.target.closest('[data-channel-index]') : null
      if (!row) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    }

    function handleChannelDrop(event) {
      if (dragIndex === null) return
      const row = event.target.closest ? event.target.closest('[data-channel-index]') : null
      if (!row) return
      event.preventDefault()
      const toIndex = Number(row.dataset.channelIndex)
      moveChannel(dragIndex, toIndex)
      dragIndex = null
    }

    function handleChannelDragEnd() {
      dragIndex = null
      const dragging = panelEl !== undefined ? panelEl.querySelector('.rss_channelRow.rss_dragging') : null
      if (dragging) dragging.classList.remove('rss_dragging')
    }


    function renderHeader() {
      const parts = []
      parts.push('<div class="rss_panelHeader" id="rss-header">')
      parts.push('<h2 class="rss_panelTitle">RSS 设置</h2>')
      if (state.dirty) {
        parts.push('<span class="rss_dirtyChip" title="有未保存的修改">未保存修改</span>')
      }
      parts.push('<div class="rss_toolbar">')
      parts.push('<button class="rss_btnGhost" data-action="digest-refresh"' + (state.refreshing ? ' disabled' : '') + '>' + (state.refreshing ? '刷新中…' : '刷新') + '</button>')
      parts.push('<button class="rss_btnGhost" data-action="config-reset"' + (state.loading ? ' disabled' : '') + '>放弃修改</button>')
      parts.push('<button class="rss_btn" data-action="config-save" title="Ctrl / Cmd + S"' + (state.saving ? ' disabled' : '') + '>' + (state.saving ? '保存中…' : '保存') + '</button>')
      parts.push('</div>')
      parts.push('</div>')
      return parts.join('')
    }

    function renderErrorNode() {
      if (!state.error) return '<div id="rss-error"></div>'
      return '<div id="rss-error"><div class="rss_banner" data-kind="error">' + esc(state.error) + '</div></div>'
    }

    function renderDigestSection() {
      const digest = state.digest
      const parts = []
      parts.push('<div class="rss_settingSection" id="rss-sec-digest">')
      parts.push('<div class="rss_settingTitle">今日值得读</div>')
      if (!digest) {
        parts.push('<div class="rss_empty">还没有生成 digest，点击「刷新」抓取。</div>')
      } else {
        const items = digest.items || []
        const sources = digest.sources || []
        const errors = digest.errors || []
        const meta = []
        if (digest.date) meta.push(esc(digest.date))
        meta.push(items.length + ' 条')
        if (sources.length > 0) meta.push(sources.length + ' 个订阅源')
        if (digest.generatedAt) meta.push('生成于 ' + esc(fmtTime(digest.generatedAt)))
        if (state.config?.dailyTime) meta.push('每日 ' + esc(state.config.dailyTime) + ' 自动生成')
        parts.push('<div class="rss_digestStats">' + meta.join(' · ') + '</div>')
        if (errors.length > 0) {
          const preview = errors.slice(0, 2).map((e) => esc(e.source + ': ' + e.error)).join('；')
          parts.push('<div class="rss_banner" data-kind="warn">' + errors.length + ' 个订阅源抓取失败' + (preview ? '：' + preview : '') + (errors.length > 2 ? '…' : '') + '</div>')
        }
        if (items.length === 0) {
          parts.push('<div class="rss_empty">今日暂无可展示条目。</div>')
        }
        parts.push('<div class="rss_digestActions">')
        parts.push('<button class="rss_btnGhost" data-action="digest-view"' + (items.length === 0 ? ' disabled' : '') + '>查看列表</button>')
        parts.push('<button class="rss_btnGhost" data-action="digest-refresh"' + (state.refreshing ? ' disabled' : '') + '>' + (state.refreshing ? '刷新中…' : '刷新') + '</button>')
        parts.push('<button class="rss_btnGhost" data-action="digest-copy"' + (items.length === 0 ? ' disabled' : '') + '>复制 Markdown</button>')
        parts.push('</div>')
      }
      parts.push('</div>')
      return parts.join('')
    }

    function isSubscribed(url) {
      return (state.config?.sources || []).some((source) => source.url === url)
    }

    function catalogToolsHtml() {
      const entries = state.catalogEntries || []
      const subscribed = entries.filter((entry) => isSubscribed(entry.url)).length
      const selectedCount = entries.filter((entry) => state.catalogSelected.has(entry.url)).length
      let html = '<div class="rss_catalogToolbar" id="rss-catalog-tools">'
      html += '<span class="rss_catalogStats">共 ' + entries.length + ' 条 · 已订阅 ' + subscribed + ' · 已选 ' + selectedCount + '</span>'
      html += '<button class="rss_btnGhost" data-action="catalog-select-all">全选</button>'
      html += '<button class="rss_btnGhost" data-action="catalog-clear"' + (selectedCount === 0 ? ' disabled' : '') + '>清空</button>'
      html += '<button class="rss_btn" data-action="catalog-add-selected"' + (selectedCount === 0 ? ' disabled' : '') + '>添加选中并保存' + (selectedCount > 0 ? ' (' + selectedCount + ')' : '') + '</button>'
      html += '</div>'
      return html
    }

    function renderCatalogResults() {
      if (state.catalogError) {
        return '<div class="rss_banner" data-kind="error">' + esc(state.catalogError) + '</div>'
      }
      if (state.catalogLoading) {
        return '<div class="rss_loading">加载目录…</div>'
      }
      if (state.catalogDisabled) {
        return '<div class="rss_empty">目录已停用（配置 includeCatalog: false）。</div>'
      }
      const entries = state.catalogEntries || []
      if (entries.length === 0) {
        return state.catalogQuery || state.catalogCategory
          ? '<div class="rss_empty">没有匹配的订阅源。</div>'
          : '<div class="rss_empty">输入关键词搜索精选订阅源，或勾选后批量添加。</div>'
      }
      const parts = []
      parts.push(catalogToolsHtml())
      parts.push('<div class="rss_list" id="rss-catalog-list">')
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]
        const added = isSubscribed(entry.url)
        parts.push('<div class="rss_item">')
        parts.push('<div class="rss_itemTop">')
        parts.push('<input type="checkbox" data-action="catalog-toggle" data-url="' + esc(entry.url) + '" title="用于批量添加"' + (added ? ' disabled' : '') + (state.catalogSelected.has(entry.url) ? ' checked' : '') + ' />')
        parts.push('<div class="rss_itemMain">')
        parts.push('<div class="rss_itemTitle">' + esc(entry.name) + ' <span class="rss_sourceChip">' + esc(entry.category) + '</span><span class="rss_sourceChip rss_catalogOrigin" title="来自目录 ' + esc(entry.catalog || '') + '">来自 ' + esc(entry.catalog || '未知') + '</span></div>')
        parts.push('<div class="rss_itemMeta">' + esc(entry.url) + '</div>')
        parts.push('</div>')
        parts.push('<button class="rss_linkBtn" data-action="catalog-add" data-index="' + i + '"' + (added ? ' disabled' : '') + '>' + (added ? '已添加' : '添加') + '</button>')
        parts.push('</div>')
        parts.push('</div>')
      }
      parts.push('</div>')
      return parts.join('')
    }

    function renderCatalogSection() {
      const parts = []
      parts.push('<div class="rss_settingSection" id="rss-sec-catalog">')
      parts.push('<div class="rss_settingHint">目录可来自多个来源：内置 <a class="rss_linkBtn" href="https://jackyst0.github.io/awesome-rsshub-routes/" target="_blank" rel="noreferrer">awesome-rsshub-routes</a> 精选列表 + 你添加的其他 OPML 目录；搜索结果统一汇总并标注来源，可一键加入自定义渠道并保存。</div>')
      parts.push('<div id="rss-catalog-sources">' + renderCatalogSourcesBlock() + '</div>')
      parts.push('<div class="rss_addRow rss_catalogSearchRow">')
      parts.push('<input class="rss_input" data-field="rss-catalog-query" value="' + esc(state.catalogQuery) + '" placeholder="搜索目录，如 arxiv、Hacker News…" autocomplete="off" spellcheck="false" />')
      parts.push('<select class="rss_input" data-field="rss-catalog-category">' + catalogCategoryOptions() + '</select>')
      parts.push('<select class="rss_input" data-field="rss-catalog-source">' + catalogSourceOptions() + '</select>')
      parts.push('</div>')
      parts.push('<div id="rss-catalog-results">' + renderCatalogResults() + '</div>')
      parts.push('</div>')
      return parts.join('')
    }

    function renderCatalogSourcesBlock() {
      const parts = []
      parts.push('<div class="rss_catalogSources">')
      const builtin = state.catalogBuiltin
      parts.push('<div class="rss_catalogSourceRow">')
      parts.push('<span class="rss_catalogSourceName">内置 ' + (builtin ? esc(builtin.name) : 'awesome-rsshub-routes') + '</span>')
      parts.push('<span class="rss_catalogSourceMeta">' + (builtin ? builtin.entryCount + ' 条' : '…') + ' · 固定</span>')
      parts.push('<span class="rss_catalogSourceActions"></span>')
      parts.push('</div>')
      const catalogs = state.config?.catalogs || []
      const statusByUrl = new Map((state.catalogSources || []).map((source) => [source.url, source]))
      for (const catalog of catalogs) {
        const status = statusByUrl.get(catalog.url)
        let meta
        let stateText
        if (status !== undefined) {
          meta = 'title="' + esc(catalog.url) + (status.error ? '：' + esc(status.error) : '') + '"'
          stateText = status.ok
            ? status.entryCount + ' 条'
            : '<span class="rss_catalogSourceError">加载失败</span>' + (status.error ? ' · ' + esc(status.error) : '')
        } else {
          stateText = '<span class="rss_catalogSourcePending">待保存 · 保存后读取</span>'
        }
        parts.push('<div class="rss_catalogSourceRow">')
        parts.push('<span class="rss_catalogSourceName" title="' + esc(catalog.name) + '">' + esc(catalog.name) + '</span>')
        parts.push('<span class="rss_catalogSourceMeta" ' + (meta || 'title="' + esc(catalog.url) + '"') + '>' + stateText + '</span>')
        parts.push('<span class="rss_catalogSourceActions"><button class="rss_linkBtn" data-danger="true" data-action="catalog-remove-source" data-url="' + esc(catalog.url) + '">' + (status === undefined ? '取消' : '移除') + '</button></span>')
        parts.push('</div>')
      }
      parts.push('<div class="rss_addRow rss_catalogAddRow">')
      parts.push('<input class="rss_input" data-field="rss-catalog-new-name" value="' + esc(state.catalogNewName) + '" placeholder="目录名称，如：我的精选" />')
      parts.push('<input class="rss_input" data-field="rss-catalog-new-url" value="' + esc(state.catalogNewUrl) + '" placeholder="OPML 目录 URL（https://…/feeds.opml）" spellcheck="false" />')
      parts.push('<button class="rss_btnGhost" data-action="catalog-add-source">添加目录</button>')
      parts.push('</div>')
      parts.push('</div>')
      return parts.join('')
    }

    function renderCategoriesSection() {
      const parts = []
      parts.push('<div class="rss_settingSection" id="rss-sec-categories">')
      parts.push('<div class="rss_settingTitle">新闻分类</div>')
      parts.push('<div class="rss_settingHint">维护分类标签；上方渠道的「分类」从这里选择，digest 按分类分组展示。</div>')
      const categories = state.config?.categories || []
      if (categories.length > 0) {
        parts.push('<div class="rss_categories">')
        for (const category of categories) {
          parts.push('<span class="rss_categoryChip">' + esc(category) + '<button class="rss_categoryRemove" data-action="config-remove-category" data-value="' + esc(category) + '" aria-label="删除分类 ' + esc(category) + '">×</button></span>')
        }
        parts.push('</div>')
      } else {
        parts.push('<div class="rss_empty">暂无分类。</div>')
      }
      parts.push('<div class="rss_addRow">')
      parts.push('<input class="rss_input" data-field="rss-new-category" value="' + esc(state.newCategory) + '" placeholder="新分类，例如：AI" />')
      parts.push('<button class="rss_btnGhost" data-action="config-add-category">添加</button>')
      parts.push('</div>')
      parts.push('</div>')
      return parts.join('')
    }

    function renderAggregateSection() {
      const config = state.config
      const parts = []
      parts.push('<div class="rss_settingSection" id="rss-sec-aggregate">')
      parts.push('<div class="rss_settingTitle">聚合设置</div>')
      parts.push('<div class="rss_formGrid">')
      parts.push('<div class="rss_field"><span class="rss_fieldLabel">每源条数</span><input class="rss_input" data-field="rss-max-items" type="number" min="1" value="' + (config.maxItemsPerSource || 5) + '" /></div>')
      parts.push('<div class="rss_field"><span class="rss_fieldLabel">每日总条数</span><input class="rss_input" data-field="rss-max-total" type="number" min="1" value="' + (config.maxTotalItems || 30) + '" /></div>')
      parts.push('<div class="rss_field"><span class="rss_fieldLabel">每日生成时间</span><input class="rss_input" data-field="rss-daily-time" type="time" value="' + esc(config.dailyTime || '08:00') + '" /></div>')
      parts.push('</div>')
      parts.push('<div class="rss_settingHint">修改后点击顶部「保存」，保存成功会自动重新抓取当天 digest。</div>')
      parts.push('</div>')
      return parts.join('')
    }


    function renderAll(container) {
      panelEl = container
      const parts = []
      parts.push('<div class="rss_panel">')
      parts.push(renderHeader())
      parts.push(renderErrorNode())
      if (state.loading || !state.config) {
        parts.push('<div class="rss_loading">加载中…</div>')
      } else {
        parts.push(renderDigestSection())
        parts.push(renderChannelsSection())
        parts.push(renderCategoriesSection())
        parts.push(renderAggregateSection())
      }
      parts.push('</div>')
      container.innerHTML = parts.join('')
    }

    /* ================================ 区块更新 ================================ */

    function updateSection(id, html) {
      if (panelEl === undefined || !panelEl.isConnected) return
      const node = panelEl.querySelector('#' + id)
      if (node === null) return
      node.outerHTML = html
    }

    function updateHeader() {
      updateSection('rss-header', renderHeader())
    }


    function updateError() {
      updateSection('rss-error', renderErrorNode())
    }

    function updateCatalogResults() {
      const root = catalogRoot()
      const node = root !== undefined ? root.querySelector('#rss-catalog-results') : null
      if (node === null) return
      node.innerHTML = renderCatalogResults()
    }

    function updateCatalogTools() {
      const root = catalogRoot()
      const node = root !== undefined ? root.querySelector('#rss-catalog-tools') : null
      if (node === null) return
      node.outerHTML = catalogToolsHtml()
    }

    function updateCustomList() {
      updateChannelList()
    }

    function updateCatalogSelect() {
      const root = catalogRoot()
      const select = root !== undefined ? root.querySelector('[data-field="rss-catalog-category"]') : null
      if (select === null) return
      select.innerHTML = catalogCategoryOptions()
    }

    function markDirty() {
      if (state.dirty) return
      state.dirty = true
      updateHeader()
    }

    /* ================================ 弹窗 ================================ */

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

    function modalCategories() {
      const set = new Set()
      for (const item of state.digest?.items || []) {
        set.add(item.category || '未分类')
      }
      return Array.from(set)
    }

    function filteredModalItems() {
      const query = (state.modalQuery || '').trim().toLowerCase()
      const items = state.digest?.items || []
      if (!query && !state.modalCategory) return items
      return items.filter((item) => {
        if (state.modalCategory && (item.category || '未分类') !== state.modalCategory) return false
        if (!query) return true
        const hay = [item.title, item.summary, item.source, item.category].filter(Boolean).join(' ').toLowerCase()
        return hay.includes(query)
      })
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

    function renderModalBody() {
      const digest = state.digest
      const allItems = digest?.items || []
      const items = filteredModalItems()
      const cats = modalCategories()
      const parts = []
      if (digest?.errors && digest.errors.length) {
        parts.push('<div class="rss_banner" data-kind="warn">抓取失败：' + digest.errors.map((e) => esc(e.source + ': ' + e.error)).join('；') + '</div>')
      }
      parts.push('<div class="rss_modalToolbar">')
      parts.push('<input class="rss_input" data-field="rss-modal-search" value="' + esc(state.modalQuery) + '" placeholder="搜索标题 / 摘要 / 来源…" autocomplete="off" spellcheck="false" />')
      parts.push('</div>')
      if (cats.length > 1) {
        parts.push('<div class="rss_modalChips">')
        parts.push('<button class="rss_modalChip' + (state.modalCategory === '' ? ' rss_modalChipActive' : '') + '" data-action="modal-cat" data-value="">全部</button>')
        for (const cat of cats) {
          parts.push('<button class="rss_modalChip' + (state.modalCategory === cat ? ' rss_modalChipActive' : '') + '" data-action="modal-cat" data-value="' + esc(cat) + '">' + esc(cat) + '</button>')
        }
        parts.push('</div>')
      }
      if (items.length === 0) {
        parts.push('<div class="rss_empty">' + (allItems.length === 0 ? '今天暂无条目。' : '没有匹配的条目。') + '</div>')
      } else {
        parts.push(renderModalItems(items, sourceSiteMap(digest, state.config)))
      }
      return parts.join('')
    }

    function renderDigestModal() {
      if (modalEl === undefined) return
      const digest = state.digest
      let content
      if (state.modalLoading) {
        content = '<div class="rss_loading">加载中…</div>'
      } else if (!digest) {
        content = '<div class="rss_empty">还没有生成 digest，点击「刷新」抓取。</div>'
      } else {
        content = renderModalBody()
      }
      if (state.error) {
        content = '<div class="rss_banner" data-kind="error">' + esc(state.error) + '</div>' + content
      }
      const title = '今日值得读' + (digest && digest.date ? ' · ' + esc(digest.date) : '')
      const total = digest ? (digest.items || []).length : 0
      const visible = digest ? filteredModalItems().length : 0
      const empty = !digest || total === 0
      modalEl.innerHTML =
        '<div class="rss_modalBackdrop" data-action="modal-backdrop">' +
          '<div class="rss_modal" role="dialog" aria-modal="true" aria-label="' + title + '">' +
            '<div class="rss_modalHeader">' +
              '<h3 class="rss_modalTitle">' + title + '</h3>' +
              '<button class="rss_modalClose" data-action="modal-close" aria-label="关闭">×</button>' +
            '</div>' +
            '<div class="rss_modalBody">' + content + '</div>' +
            '<div class="rss_modalFooter">' +
              (digest ? '<span class="rss_modalCount">' + visible + ' / ' + total + ' 条</span>' : '<span class="rss_modalCount"></span>') +
              '<button class="rss_btnGhost" data-action="modal-copy"' + (empty ? ' disabled' : '') + '>复制 Markdown</button>' +
              '<button class="rss_btnGhost" data-action="modal-refresh"' + (state.modalLoading ? ' disabled' : '') + '>' + (state.modalLoading ? '刷新中…' : '刷新') + '</button>' +
            '</div>' +
          '</div>' +
        '</div>'
      const search = modalEl.querySelector('[data-field="rss-modal-search"]')
      if (search !== null) {
        search.addEventListener('input', () => {
          const caret = search.selectionStart
          state.modalQuery = search.value
          renderDigestModal()
          const next = modalEl.querySelector('[data-field="rss-modal-search"]')
          if (next !== null) {
            next.focus()
            try {
              next.setSelectionRange(caret, caret)
            } catch {
              /* 无 caret 的输入框忽略 */
            }
          }
        })
      }
    }

    function openDigestModal() {
      if (modalEl === undefined || !modalEl.isConnected) {
        modalEl = document.createElement('div')
        modalEl.className = 'rss_modalRoot'
        document.body.appendChild(modalEl)
      }
      state.modalOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null
      modalEl.style.display = ''
      state.modalLoading = true
      state.modalQuery = ''
      state.modalCategory = ''
      renderDigestModal()
      bindModalKeys()
      void loadDigestModal()
      const closeBtn = modalEl.querySelector('[data-action="modal-close"]')
      if (closeBtn !== null) closeBtn.focus()
    }

    function closeDigestModal() {
      if (modalEl !== undefined) modalEl.style.display = 'none'
      const opener = state.modalOpener
      if (opener !== null && opener.isConnected && typeof opener.focus === 'function') {
        opener.focus()
      }
    }

    function bindModalKeys() {
      if (modalEl === undefined || modalEl.dataset.keysBound === '1') return
      modalEl.dataset.keysBound = '1'
      modalEl.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          closeDigestModal()
          return
        }
        if (event.key !== 'Tab') return
        const focusables = Array.from(modalEl.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        const active = document.activeElement
        if (event.shiftKey) {
          if (active === first || active === modalEl || active === null) {
            event.preventDefault()
            last.focus()
          }
        } else if (active === last) {
          event.preventDefault()
          first.focus()
        }
      })
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

    const RSS_SIDEBAR_ICON = '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h.01M4 8a4 4 0 0 1 4 4M4 4a8 8 0 0 1 8 8"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/></svg>'

    /* ================================ 订阅源目录弹窗 ================================ */

    function renderCatalogModalHtml() {
      return '<div class="rss_modalBackdrop" data-action="catalog-backdrop">' +
        '<div class="rss_modal rss_catalogModal" role="dialog" aria-modal="true" aria-label="订阅源目录">' +
          '<div class="rss_modalHeader">' +
            '<h3 class="rss_modalTitle">订阅源目录</h3>' +
            '<button class="rss_modalClose" data-action="catalog-close" aria-label="关闭">×</button>' +
          '</div>' +
          '<div class="rss_modalBody">' + renderCatalogSection() + '</div>' +
          '<div class="rss_modalFooter">' +
            '<span class="rss_modalCount"></span>' +
            '<button class="rss_btnGhost" data-action="catalog-close">关闭</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    }

    function renderCatalogModal() {
      if (catalogModalEl === undefined) return
      catalogModalEl.innerHTML = renderCatalogModalHtml()
    }

    function openCatalogModal() {
      if (catalogModalEl === undefined || !catalogModalEl.isConnected) {
        catalogModalEl = document.createElement('div')
        catalogModalEl.className = 'rss_modalRoot'
        document.body.appendChild(catalogModalEl)
      }
      state.catalogOpen = true
      renderCatalogModal()
      catalogModalEl.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeCatalogModal()
      })
      loadCatalog()
      const search = catalogModalEl.querySelector('[data-field="rss-catalog-query"]')
      if (search !== null) search.focus()
    }

    function closeCatalogModal() {
      state.catalogOpen = false
      if (catalogModalEl !== undefined) {
        catalogModalEl.remove()
        catalogModalEl = undefined
      }
    }


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
      entry.title = '今日值得读'
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

    /* ================================ 输入委托（按需更新，不再整面板重建） ================================ */

    const FIELD_HANDLERS = {
      'rss-source-name': (el) => {
        if (!state.config || el.dataset.index === undefined) return
        const source = state.config.sources[Number(el.dataset.index)]
        if (source) {
          source.name = el.value
          markDirty()
        }
      },
      'rss-source-url': (el) => {
        if (!state.config || el.dataset.index === undefined) return
        const source = state.config.sources[Number(el.dataset.index)]
        if (source) {
          source.url = el.value
          markDirty()
        }
      },
      'rss-source-category': (el) => {
        if (!state.config || el.dataset.index === undefined) return
        const source = state.config.sources[Number(el.dataset.index)]
        if (source) {
          source.category = el.value || undefined
          markDirty()
        }
      },
      'rss-source-limit': (el) => {
        if (!state.config || el.dataset.index === undefined) return
        const source = state.config.sources[Number(el.dataset.index)]
        if (source) {
          const value = Number(el.value)
          source.limit = Number.isFinite(value) && value > 0 ? value : undefined
          markDirty()
        }
      },
      'rss-builtin-category': (el) => {
        if (!state.config) return
        const key = el.dataset.key
        const builtin = (state.builtins || []).find((item) => item.key === key)
        if (!builtin) return
        let entry = state.config.sources.find((source) => builtinOf(source)?.key === key)
        if (!entry) {
          entry = { name: builtin.name, url: builtin.url, builtin: builtin.key }
          state.config.sources.push(entry)
          const checkbox = panelEl !== undefined ? panelEl.querySelector('[data-action="builtin-toggle"][data-key="' + key + '"]') : null
          if (checkbox !== null) checkbox.checked = true
          updateChannels()
        }
        entry.category = el.value || undefined
        markDirty()
        scheduleSave()
      },
      'rss-new-category': (el) => {
        state.newCategory = el.value
      },
      'rss-catalog-query': (el) => {
        state.catalogQuery = el.value
        scheduleCatalogLoad()
      },
      'rss-custom-query': (el) => {
        state.customQuery = el.value
        updateCustomList()
      },
      'rss-import-text': (el) => {
        state.importText = el.value
      },
      'rss-import-file': (el) => {
        const file = el.files && el.files[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = () => importSourcesFromText(String(reader.result || ''), 'OPML', true)
        reader.readAsText(file)
        el.value = '' // 允许再次选择同一文件
      },
      'rss-catalog-category': (el) => {
        state.catalogCategory = el.value
        loadCatalog()
      },
      'rss-catalog-source': (el) => {
        state.catalogSource = el.value
        loadCatalog()
      },
      'rss-catalog-new-name': (el) => {
        state.catalogNewName = el.value
      },
      'rss-catalog-new-url': (el) => {
        state.catalogNewUrl = el.value
      },
      'rss-max-items': (el) => {
        if (!state.config) return
        const value = Number(el.value)
        state.config.maxItemsPerSource = Number.isFinite(value) && value > 0 ? value : undefined
        markDirty()
      },
      'rss-max-total': (el) => {
        if (!state.config) return
        const value = Number(el.value)
        state.config.maxTotalItems = Number.isFinite(value) && value > 0 ? value : undefined
        markDirty()
      },
      'rss-daily-time': (el) => {
        if (!state.config) return
        state.config.dailyTime = el.value
        markDirty()
      },
    }

    function handleFieldEvent(event) {
      const target = event.target
      const el = target !== null && target.closest ? target.closest('[data-field^="rss-"]') : null
      if (el === null) return
      const field = el.dataset.field
      if (field === 'rss-modal-search') return
      const handler = FIELD_HANDLERS[field]
      if (typeof handler !== 'function') return
      handler(el)
    }

    /* ================================ 数据操作 ================================ */

    let catalogTimer = null

    function scheduleCatalogLoad() {
      clearTimeout(catalogTimer)
      catalogTimer = setTimeout(loadCatalog, 250)
    }

    async function loadCatalog() {
      state.catalogLoading = true
      state.catalogError = ''
      updateCatalogResults()
      try {
        const params = new URLSearchParams()
        if (state.catalogQuery && state.catalogQuery.trim()) params.set('q', state.catalogQuery.trim())
        if (state.catalogCategory) params.set('category', state.catalogCategory)
        if (state.catalogSource) params.set('source', state.catalogSource)
        const suffix = params.toString() ? '?' + params.toString() : ''
        const data = await apiRequest(API.catalog + suffix)
        state.catalogEntries = data.entries || []
        state.catalogCategories = data.categories || state.catalogCategories
        state.catalogSourceNames = data.sources || state.catalogSourceNames
        state.catalogSources = data.catalogs || []
        state.catalogBuiltin = data.builtin || null
        state.catalogDisabled = data.disabled === true
        updateCatalogSelect()
        updateCatalogSources()
      } catch (error) {
        state.catalogError = error.message
        state.catalogEntries = []
      } finally {
        state.catalogLoading = false
        updateCatalogResults()
      }
    }

    async function load() {
      state.loading = true
      state.error = ''
      if (panelEl !== undefined) renderAll(panelEl)
      try {
        const [digestRes, configRes] = await Promise.all([
          apiRequest(API.digest),
          apiRequest(API.config),
        ])
        state.digest = digestRes
        state.config = configRes.config || { sources: [], categories: [], maxItemsPerSource: 5, maxTotalItems: 30, dailyTime: '08:00' }
        state.builtins = configRes.builtins || BUILTIN_CHANNELS
      } catch (error) {
        state.error = error.message
      } finally {
        state.loading = false
        if (panelEl !== undefined) {
          renderAll(panelEl)
          loadCatalog()
        }
      }
    }

    async function refresh() {
      state.refreshing = true
      state.error = ''
      updateHeader()
      updateError()
      try {
        const data = await apiRequest(API.refresh, { method: 'POST' })
        state.digest = data
        toast('已刷新', 'ok')
      } catch (error) {
        state.error = error.message
        toast(error.message, 'error')
      } finally {
        state.refreshing = false
        updateHeader()
        updateError()
        updateSection('rss-sec-digest', renderDigestSection())
      }
    }


    function scheduleSave(delay) {
      clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        saveTimer = undefined
        if (state.saving) {
          scheduleSave(200)
          return
        }
        saveConfig()
      }, delay || 500)
    }

    async function saveConfig() {
      if (!state.config) return
      clearTimeout(saveTimer)
      saveTimer = undefined
      state.saving = true
      state.error = ''
      updateHeader()
      updateError()
      try {
        const data = await apiRequest(API.config, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ config: state.config }),
        })
        state.config = data.config || state.config
        state.builtins = data.builtins || BUILTIN_CHANNELS
        state.newCategory = ''
        state.dirty = false
        toast('已保存', 'ok')
        await refresh()
        loadCatalog()
      } catch (error) {
        state.error = error.message
        toast(error.message, 'error')
      } finally {
        state.saving = false
        updateHeader()
        updateError()
      }
    }

    async function copyText(text) {
      const value = text || ''
      if (!value) {
        toast('没有可复制的内容', 'error')
        return
      }
      try {
        await navigator.clipboard.writeText(value)
        toast('已复制', 'ok')
      } catch {
        try {
          const textarea = document.createElement('textarea')
          textarea.value = value
          textarea.style.position = 'fixed'
          textarea.style.opacity = '0'
          document.body.appendChild(textarea)
          textarea.select()
          document.execCommand('copy')
          textarea.remove()
          toast('已复制', 'ok')
        } catch {
          toast('复制失败', 'error')
        }
      }
    }

    /* ================================ OPML / 批量导入导出 ================================ */

    function hostnameOf(url) {
      try {
        return new URL(url).hostname.replace(/^www\./, '')
      } catch {
        return url
      }
    }

    function escXml(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
    }

    function parseOpmlFallback(text) {
      const items = []
      const re = /<outline\b[^>]*>/gi
      let match
      while ((match = re.exec(text)) !== null) {
        const tag = match[0]
        const url = /xmlUrl\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]
        if (!url) continue
        const name = (/text\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] || /title\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] || '').trim()
        const category = (/category\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] || '').trim()
        if (!name) continue
        try {
          new URL(url)
        } catch {
          continue
        }
        items.push({ name, url, ...(category ? { category } : {}) })
      }
      return items
    }

    function parseOpmlText(text) {
      if (typeof DOMParser !== 'undefined') {
        try {
          const doc = new DOMParser().parseFromString(text, 'text/xml')
          const items = []
          const outlines = doc.getElementsByTagName('outline')
          for (const node of outlines) {
            const url = node.getAttribute('xmlUrl')
            if (!url) continue
            const name = (node.getAttribute('text') || node.getAttribute('title') || '').trim()
            const category = (node.getAttribute('category') || '').trim()
            if (!name) continue
            try {
              new URL(url)
            } catch {
              continue
            }
            items.push({ name, url, ...(category ? { category } : {}) })
          }
          if (items.length > 0) return items
        } catch {
          /* 解析失败则走正则兜底 */
        }
      }
      return parseOpmlFallback(text)
    }

    function parseUrlList(text) {
      const items = []
      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim()
        if (!line) continue
        let name = ''
        let url = line
        const m = /^(.*?)[,，\t ]+(https?:\/\/\S+)$/i.exec(line)
        if (m) {
          name = m[1].trim()
          url = m[2].trim()
        }
        try {
          new URL(url)
        } catch {
          continue
        }
        items.push({ name: name || hostnameOf(url), url, category: '' })
      }
      return items
    }

    function mergeSources(items) {
      const existing = new Set((state.config?.sources || []).map((source) => (source.url || '').trim().toLowerCase()))
      let added = 0
      let skipped = 0
      for (const item of items) {
        const key = (item.url || '').trim().toLowerCase()
        if (!key || existing.has(key)) {
          skipped += 1
          continue
        }
        existing.add(key)
        state.config.sources.push({
          name: item.name || hostnameOf(item.url),
          url: item.url.trim(),
          ...(item.category ? { category: item.category } : {}),
          limit: 5,
        })
        added += 1
      }
      return { added, skipped }
    }

    function importSourcesFromText(text, kind, autoSave) {
      if (!text || !text.trim()) {
        toast('没有可导入的内容', 'error')
        return
      }
      const items = kind === 'OPML' ? parseOpmlText(text) : parseUrlList(text)
      if (items.length === 0) {
        toast('未能从内容中解析出订阅源，请检查格式', 'error')
        return
      }
      const result = mergeSources(items)
      state.importOpen = false
      state.importText = ''
      updateChannels()
      if (result.added === 0) {
        toast('没有新增订阅源（' + result.skipped + ' 个已订阅或无效）', 'info')
        return
      }
      markDirty()
      if (autoSave) {
        toast('已导入 ' + result.added + ' 个订阅源' + (result.skipped > 0 ? '，跳过 ' + result.skipped + ' 个已存在' : '') + '，正在保存…', 'info')
        saveConfig()
      } else {
        toast('已导入 ' + result.added + ' 个订阅源' + (result.skipped > 0 ? '，跳过 ' + result.skipped + ' 个已存在' : '') + '，点击「保存」校验生效', 'ok')
      }
    }

    function buildOpml() {
      const lines = []
      lines.push('<?xml version="1.0" encoding="UTF-8"?>')
      lines.push('<opml version="2.0">')
      lines.push('<head><title>DSH RSS 订阅源</title></head>')
      lines.push('<body>')
      for (const source of state.config?.sources || []) {
        const name = source.name || hostnameOf(source.url)
        const cat = source.category || ''
        lines.push('  <outline type="rss" text="' + escXml(name) + '" title="' + escXml(name) + '"' + (cat ? ' category="' + escXml(cat) + '"' : '') + ' xmlUrl="' + escXml(source.url) + '"/>')
      }
      lines.push('</body>')
      lines.push('</opml>')
      return lines.join('\n')
    }

    function exportOpml() {
      const xml = buildOpml()
      const blob = new Blob([xml], { type: 'application/xml' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'dsh-rss-subscriptions.opml'
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      toast('已导出 ' + (state.config?.sources?.length || 0) + ' 个订阅源', 'ok')
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
      } else if (action === 'modal-copy') {
        copyText(state.digest ? state.digest.markdown : '')
      } else if (action === 'modal-cat') {
        state.modalCategory = value || ''
        renderDigestModal()
      } else if (action === 'catalog-open') {
        openCatalogModal()
      } else if (action === 'catalog-close') {
        closeCatalogModal()
      } else if (action === 'catalog-backdrop') {
        if (event.target === el) closeCatalogModal()
      } else if (action === 'digest-view') {
        openDigestModal()
      } else if (action === 'digest-refresh') {
        refresh()
      } else if (action === 'digest-copy') {
        copyText(state.digest ? state.digest.markdown : '')
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
          const indexOf = state.config.sources.findIndex((source) => builtinOf(source)?.key === key)
          if (indexOf !== -1) state.config.sources.splice(indexOf, 1)
        }
        markDirty()
        updateChannels()
        scheduleSave()
      } else if (action === 'config-add-source') {
        if (!state.config) return
        state.config.sources.push({ name: '', url: '', category: '', limit: 5 })
        updateChannels()
        markDirty()
        const rows = panelEl !== undefined ? panelEl.querySelectorAll('#rss-sec-channels [data-field="rss-source-name"]') : []
        const lastRow = rows.length > 0 ? rows[rows.length - 1] : null
        if (lastRow !== null) {
          lastRow.focus()
          lastRow.scrollIntoView({ block: 'center', behavior: 'smooth' })
        }
      } else if (action === 'config-remove-source') {
        if (!state.config || index === undefined) return
        state.config.sources.splice(Number(index), 1)
        updateChannels()
        markDirty()
      } else if (action === 'config-add-category') {
        if (!state.config) return
        const trimmed = (state.newCategory || '').trim()
        if (!trimmed) return
        if (!state.config.categories) state.config.categories = []
        if (!state.config.categories.includes(trimmed)) state.config.categories.push(trimmed)
        state.newCategory = ''
        updateSection('rss-sec-categories', renderCategoriesSection())
        markDirty()
        scheduleSave()
      } else if (action === 'config-remove-category') {
        if (!state.config) return
        state.config.categories = (state.config.categories || []).filter((item) => item !== value)
        updateSection('rss-sec-categories', renderCategoriesSection())
        markDirty()
        scheduleSave()
      } else if (action === 'catalog-add') {
        if (!state.config || index === undefined) return
        const entry = (state.catalogEntries || [])[Number(index)]
        if (!entry) return
        if (isSubscribed(entry.url)) return
        state.config.sources.push({ name: entry.name, url: entry.url, category: entry.category, limit: 5 })
        state.catalogSelected.delete(entry.url)
        updateChannels()
        updateCatalogResults()
        markDirty()
        scheduleSave()
      } else if (action === 'catalog-toggle') {
        if (!state.config) return
        const url = el.dataset.url
        if (!url) return
        if (state.catalogSelected.has(url)) {
          state.catalogSelected.delete(url)
        } else {
          state.catalogSelected.add(url)
        }
        updateCatalogTools()
      } else if (action === 'catalog-select-all') {
        if (!state.config) return
        for (const entry of state.catalogEntries || []) {
          if (!isSubscribed(entry.url)) state.catalogSelected.add(entry.url)
        }
        const checkboxes = panelEl !== undefined ? panelEl.querySelectorAll('#rss-catalog-list input[data-action="catalog-toggle"]') : []
        for (const box of checkboxes) {
          if (box.disabled) continue
          box.checked = true
        }
        updateCatalogTools()
      } else if (action === 'catalog-clear') {
        for (const entry of state.catalogEntries || []) {
          state.catalogSelected.delete(entry.url)
        }
        const checkboxes = panelEl !== undefined ? panelEl.querySelectorAll('#rss-catalog-list input[data-action="catalog-toggle"]') : []
        for (const box of checkboxes) {
          box.checked = false
        }
        updateCatalogTools()
      } else if (action === 'catalog-add-selected') {
        if (!state.config) return
        let added = 0
        let skipped = 0
        for (const entry of state.catalogEntries || []) {
          if (!state.catalogSelected.has(entry.url)) continue
          if (isSubscribed(entry.url)) {
            skipped += 1
          } else {
            state.config.sources.push({ name: entry.name, url: entry.url, category: entry.category, limit: 5 })
            added += 1
          }
          state.catalogSelected.delete(entry.url)
        }
        if (added === 0) {
          updateCatalogTools()
          toast(skipped > 0 ? '所选条目均已订阅' : '未选择条目', 'info')
          return
        }
        updateChannels()
        updateCatalogResults()
        markDirty()
        toast('已添加 ' + added + ' 个订阅源' + (skipped > 0 ? '，跳过 ' + skipped + ' 个已订阅' : '') + '，正在保存…', 'info')
        saveConfig()
      } else if (action === 'custom-import-opml') {
        const fileInput = panelEl !== undefined ? panelEl.querySelector('#rss-import-file') : null
        if (fileInput !== null) fileInput.click()
      } else if (action === 'custom-import-paste') {
        state.importOpen = !state.importOpen
        updateChannels()
        if (state.importOpen) {
          const textarea = panelEl !== undefined ? panelEl.querySelector('#rss-sec-channels [data-field="rss-import-text"]') : null
          if (textarea !== null) textarea.focus()
        }
      } else if (action === 'custom-import-paste-go') {
        importSourcesFromText(state.importText || '', 'URL', true)
      } else if (action === 'custom-export-opml') {
        exportOpml()
      } else if (action === 'catalog-add-source') {
        if (!state.config) return
        const name = (state.catalogNewName || '').trim()
        const url = (state.catalogNewUrl || '').trim()
        if (!name) {
          toast('请填写目录名称', 'error')
          return
        }
        if (!url) {
          toast('请填写 OPML 目录 URL', 'error')
          return
        }
        let valid = false
        try {
          new URL(url)
          valid = true
        } catch {
          valid = false
        }
        if (!valid) {
          toast('目录 URL 不合法', 'error')
          return
        }
        if (!state.config.catalogs) state.config.catalogs = []
        if (state.config.catalogs.some((item) => item.url === url)) {
          toast('该目录已存在', 'info')
          return
        }
        state.config.catalogs.push({ name, url })
        state.catalogNewName = ''
        state.catalogNewUrl = ''
        updateCatalogSources()
        markDirty()
        toast('目录已加入，正在保存…', 'info')
        saveConfig()
      } else if (action === 'catalog-remove-source') {
        if (!state.config) return
        const url = el.dataset.url
        if (!url) return
        state.config.catalogs = (state.config.catalogs || []).filter((item) => item.url !== url)
        updateCatalogSources()
        markDirty()
        toast('目录已移除，正在保存…', 'info')
        saveConfig()
      } else if (action === 'config-reset') {
        if (state.dirty && !window.confirm('放弃未保存的修改并重新加载？')) return
        state.dirty = false
        load()
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
        const onKeyDown = (event) => {
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
            if (panelEl !== undefined && panelEl.isConnected) {
              event.preventDefault()
              saveConfig()
            }
          }
        }
        document.addEventListener('click', handleClick, true)
        document.addEventListener('input', handleFieldEvent, true)
        document.addEventListener('change', handleFieldEvent, true)
        document.addEventListener('keydown', onKeyDown, true)
        document.addEventListener('dragstart', handleChannelDragStart, true)
        document.addEventListener('dragover', handleChannelDragOver, true)
        document.addEventListener('drop', handleChannelDrop, true)
        document.addEventListener('dragend', handleChannelDragEnd, true)
        const disposeSidebar = mountSidebarEntry()
        return () => {
          document.removeEventListener('click', handleClick, true)
          document.removeEventListener('input', handleFieldEvent, true)
          document.removeEventListener('change', handleFieldEvent, true)
          document.removeEventListener('keydown', onKeyDown, true)
          document.removeEventListener('dragstart', handleChannelDragStart, true)
          document.removeEventListener('dragover', handleChannelDragOver, true)
          document.removeEventListener('drop', handleChannelDrop, true)
          document.removeEventListener('dragend', handleChannelDragEnd, true)
          if (disposeSidebar) disposeSidebar()
          clearTimeout(toastTimer)
          clearTimeout(saveTimer)
          styleEl?.remove()
          styleEl = undefined
          toastEl?.remove()
          toastEl = undefined
          panelEl?.remove()
          panelEl = undefined
          modalEl?.remove()
          modalEl = undefined
          catalogModalEl?.remove()
          catalogModalEl = undefined
        }
      })
      ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
        name: 'settings.plugin.item',
        // settings.plugin.item 是 keyed 插槽：key 必须是该卡片所编辑的 settings 命名空间
        key: 'rss-digest',
        order: 100,
      }, RssSettingsCard))
    }

    return exports
  },
})