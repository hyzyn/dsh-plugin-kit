/* eslint-disable */
/**
 * @hyzyn/dsh-mcp — 浏览器半体：官方插件配置里的「MCP 服务器配置」卡片。
 * 通过核心 slots 服务注册到 settings.plugin.item 插槽（与官方终端 / Agent 循环 /
 * 网页搜索卡片同级），不再占用侧边栏、不做全屏面板接管。
 * 纯 DOM 渲染（React 只承担卡片外壳与展开状态），无构建步骤，
 * 宿主经 /plugins/@hyzyn/dsh-mcp/client.js 提供。
 */
window.__ModuleLoader__.load({
  id: '@hyzyn/dsh-mcp',
  factory: (require) => {
    const exports = {}

    const React = require('react')
    const { jsx, jsxs } = require('react/jsx-runtime')

    /* ================================ CSS ================================ */

    const CSS = [
      // 设置插件卡片外壳（与官方 PluginCard 一致的轮廓）
      '.mX_pageHost{display:block}',
      '.mX_pluginCard{list-style:none;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;transition:border-color .16s,background .16s}',
      '.mX_pluginCard:hover{border-color:var(--dsw-alias-label-dimmed)}',
      '.mX_pluginCardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}',
      '.mX_cardHeader{appearance:none;width:100%;color:inherit;font:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;display:flex;align-items:center;gap:12px;padding:14px 16px}',
      '.mX_cardHeader:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.mX_cardHeadText{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}',
      '.mX_cardName{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:600}',
      '.dshkit_badge{flex:none;margin-left:auto;padding:1px 8px;border-radius:999px;font-size:11px;font-weight:600;line-height:16px;letter-spacing:.02em;color:var(--dsw-alias-label-dimmed);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1)}',
      '.mX_cardDescription{color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.mX_chevron{flex:none;color:var(--dsw-alias-label-tertiary);transition:transform .16s}',
      '.mX_pluginCardOpen .mX_chevron{transform:rotate(180deg)}',
      '.mX_cardBody{padding:2px 16px 16px}',
      // 面板
      '.mX_panel{display:flex;flex-direction:column;gap:12px;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);box-sizing:border-box}',
      '.mX_panelHeader{display:flex;align-items:center;gap:10px;flex:none}',
      '.mX_panelTitle{margin:0;font-size:15px;font-weight:700;white-space:nowrap;flex:1}',
      '.mX_subtitle{color:var(--dsw-alias-label-tertiary);font-size:11.5px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:320px}',
      '.mX_toolbar{display:flex;align-items:center;gap:8px;flex:none}',
      '.mX_toolbarSpacer{flex:1}',
      '.mX_btn{color:var(--dsw-alias-label-primary-foreground);background:var(--dsw-alias-button-info-fill);border:none;border-radius:8px;padding:6px 14px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}',
      '.mX_btn:hover:not(:disabled){background:var(--dsw-alias-button-info-hover)}',
      '.mX_btn:disabled{opacity:.5;cursor:default}',
      '.mX_btnGhost{color:var(--dsw-alias-label-primary);background:0 0;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:5px 12px;font-size:12px;cursor:pointer;white-space:nowrap}',
      '.mX_btnGhost:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
      '.mX_btnGhost:disabled{opacity:.45;cursor:default}',
      '.mX_btnDanger{color:var(--dsw-alias-state-error-primary)}',
      '.mX_linkBtn{color:var(--dsw-alias-state-business-primary);background:0 0;border:none;padding:0;font-size:12px;cursor:pointer;white-space:nowrap}',
      '.mX_linkBtn:hover:not(:disabled){text-decoration:underline}',
      '.mX_linkBtn[data-danger]{color:var(--dsw-alias-state-error-primary)}',
      '.mX_list{display:flex;flex-direction:column;gap:8px;max-height:420px;overflow-y:auto}',
      '.mX_card{background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:6px}',
      '.mX_cardRow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.mX_cardName{font-weight:700;font-size:13.5px}',
      '.mX_cardSummary{color:var(--dsw-alias-label-secondary);font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}',
      '.mX_cardActions{display:flex;align-items:center;gap:6px;margin-left:auto}',
      '.mX_badge{display:inline-block;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:1px 8px;font-size:11px;line-height:1.6;white-space:nowrap}',
      '.mX_badge[data-kind=stdio]{color:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary)}',
      '.mX_badge[data-kind=http]{color:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary)}',
      '.mX_badge[data-status=ok]{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}',
      '.mX_badge[data-status=error]{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}',
      '.mX_badge[data-status=warn]{color:var(--dsw-alias-state-warn-primary);border-color:var(--dsw-alias-state-warn-primary)}',
      '.mX_banner{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);border-radius:8px;padding:8px 12px;font-size:12.5px;line-height:1.5;overflow-wrap:anywhere;flex:none}',
      '.mX_banner[data-kind=ok]{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}',
      '.mX_banner[data-kind=error]{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}',
      '.mX_banner[data-kind=info]{color:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary)}',
      '.mX_banner[data-kind=warn]{color:var(--dsw-alias-state-warn-primary);border-color:var(--dsw-alias-state-warn-primary)}',
      '.mX_empty,.mX_loading{text-align:center;color:var(--dsw-alias-label-tertiary);padding:24px 12px;font-size:12.5px}',
      '.mX_modalBackdrop{position:absolute;inset:0;z-index:70;background:var(--dsw-alias-bg-mask-1);display:flex;justify-content:center;align-items:flex-start;padding:24px 12px;overflow-y:auto}',
      '.mX_modal{background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);width:min(640px,100%);max-width:100%;box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary);border-radius:14px;display:flex;flex-direction:column;gap:12px;padding:18px;box-sizing:border-box}',
      '.mX_modalTitle{margin:0;font-size:15px;font-weight:700}',
      '.mX_modalBody{display:flex;flex-direction:column;gap:10px}',
      '.mX_modalFooter{display:flex;justify-content:flex-end;align-items:center;gap:10px;margin-top:4px}',
      '.mX_formRow{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px 12px}',
      '.mX_field{display:flex;flex-direction:column;gap:5px}',
      '.mX_fieldLabel{color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:600}',
      '.mX_input{color:var(--dsw-alias-label-primary);background:var(--dsw-specific-input-major);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;outline:none;padding:7px 10px;font-family:inherit;font-size:13px;box-sizing:border-box;width:100%}',
      '.mX_input:focus{border-color:var(--dsw-alias-state-business-primary)}',
      '.mX_input::placeholder{color:var(--dsw-alias-label-tertiary)}',
      '.mX_textarea{min-height:64px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}',
      '.mX_hint{color:var(--dsw-alias-label-tertiary);font-size:11.5px;line-height:1.5}',
      '.mX_radioRow{display:flex;align-items:center;gap:16px}',
      '.mX_radioLabel{display:inline-flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;color:var(--dsw-alias-label-primary)}',
      '.mX_checkRow{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--dsw-alias-label-primary);cursor:pointer}',
      '.mX_formError{color:var(--dsw-alias-state-error-primary);font-size:12px;margin:0;white-space:pre-wrap}',
      '.mX_toolWrap{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;flex:none;overflow:hidden}',
      '.mX_toolHeader{background:var(--dsw-alias-bg-layer-2);border-bottom:1px solid var(--dsw-alias-border-l1);padding:8px 10px;font-size:12px;color:var(--dsw-alias-label-secondary);display:flex;gap:12px;flex-wrap:wrap}',
      '.mX_toolList{max-height:220px;overflow-y:auto;padding:4px 0}',
      '.mX_toolItem{padding:5px 10px;font-size:12px;display:flex;flex-direction:column;gap:2px;border-bottom:1px solid var(--dsw-alias-separator-primary)}',
      '.mX_toolItem:last-child{border-bottom:none}',
      '.mX_toolName{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--dsw-alias-state-business-primary)}',
      '.mX_toolDesc{color:var(--dsw-alias-label-tertiary)}',
      '.mX_spinner{border:2px solid var(--dsw-alias-state-business-primary);border-top-color:transparent;border-radius:50%;width:11px;height:11px;display:inline-block;flex:none;vertical-align:-1px;animation:mXSpin .8s linear infinite}',
      '@keyframes mXSpin{to{transform:rotate(360deg)}}',
      '.mX_toast{position:fixed;left:50%;bottom:36px;transform:translateX(-50%);z-index:200;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);border-radius:10px;padding:9px 16px;font-size:13px;box-shadow:var(--dsw-shadow-lv3);max-width:70vw}',
      '.mX_toast[data-kind=ok]{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary)}',
      '.mX_toast[data-kind=error]{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}',
      '.mX_mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}',
    ].join('\n')

    let styleEl
    function ensureStyle() {
      if (document.getElementById('dsh-mcp-style')) return
      styleEl = document.createElement('style')
      styleEl.id = 'dsh-mcp-style'
      styleEl.textContent = CSS
      document.head.appendChild(styleEl)
    }

    /* ================================ 基础工具 ================================ */

    const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESC_MAP[c])

    /* ================================ API ================================ */

    const API = {
      list: '/api/dsh-mcp/servers',
      save: '/api/dsh-mcp/servers/save',
      test: '/api/dsh-mcp/test',
    }

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

    const apiList = () => apiRequest(API.list)
    // clearAll 只在「用户明确删光」时带上：宿主对「空列表且无该标记」的保存会返回 400，
    // 避免启动竞态 / 陈旧卡片拿到空列表时把已配置的服务器静默清空。
    const apiSave = (servers, options) => apiRequest(API.save, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ servers, ...(options !== undefined && options.clearAll === true ? { clearAll: true } : {}) }),
    })
    const apiTest = (config) => apiRequest(API.test, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ config }),
    })

    /* ================================ 面板状态 ================================ */

    const state = {
      servers: [],
      conflicts: [],
      fileError: '',
      patchFile: '',
      loading: false,
      busy: false,
      toast: '',
      toastKind: 'info',
      editor: null,
      test: null,
    }

    let toastTimer
    function toast(message, kind) {
      state.toast = message
      state.toastKind = kind || 'info'
      renderToast()
      clearTimeout(toastTimer)
      toastTimer = setTimeout(() => {
        state.toast = ''
        renderToast()
      }, 3200)
    }

    /* ================================ 渲染：主视图 ================================ */

    const STATUS_TEXT = { active: '运行中', disabled: '已停用', error: '错误', loading: '加载中', 'not-loaded': '未加载' }
    const STATUS_KIND = { active: 'ok', disabled: '', error: 'error', loading: 'warn', 'not-loaded': '' }

    let panelEl
    let toastEl

    function renderAll(container) {
      panelEl = container
      container.innerHTML = state.editor ? renderEditorHtml() : renderMainHtml()
      bindEditorEvents(container)
      renderToast()
    }

    function renderToast() {
      if (toastEl === undefined || !toastEl.isConnected) {
        toastEl = document.createElement('div')
        toastEl.className = 'mX_toast'
        document.body.appendChild(toastEl)
      }
      if (state.toast) {
        toastEl.textContent = state.toast
        toastEl.dataset.kind = state.toastKind
        toastEl.style.display = ''
      } else {
        toastEl.style.display = 'none'
      }
    }

    function badge(text, kind, cls) {
      return '<span class="mX_badge' + (cls ? ' ' + cls : '') + '"' + (kind ? ' data-status="' + kind + '"' : '') + '>' + esc(text) + '</span>'
    }

    function transportBadge(transport) {
      return badge(transport === 'stdio' ? 'stdio' : 'http', '', '')
    }

    function summaryOf(server) {
      const config = server.config || {}
      if (config.transport === 'stdio') {
        const command = (config.command || '') + (config.args && config.args.length ? ' ' + config.args.join(' ') : '')
        return config.cwd ? config.cwd + ' $ ' + command : command
      }
      return config.url || ''
    }

    function statusBadge(status) {
      return badge(STATUS_TEXT[status] || status, STATUS_KIND[status] || '')
    }

    function renderMainHtml() {
      const parts = []
      parts.push('<div class="mX_panel">')
      parts.push('<div class="mX_panelHeader"><h2 class="mX_panelTitle">MCP 服务器</h2>')
      parts.push('<span class="mX_subtitle" title="' + esc(state.patchFile) + '">' + esc(state.patchFile) + '</span>')
      parts.push('<span class="mX_toolbarSpacer"></span>')
      parts.push('<button class="mX_btnGhost" data-action="refresh"' + (state.loading ? ' disabled' : '') + '>刷新</button>')
      parts.push('<button class="mX_btn" data-action="add">+ 添加服务器</button>')
      parts.push('</div>')
      if (state.fileError) parts.push('<div class="mX_banner" data-kind="error">配置区块异常：' + esc(state.fileError) + '（保存一次即可修复）</div>')
      if (state.conflicts && state.conflicts.length) {
        parts.push('<div class="mX_banner" data-kind="warn">以下 serverName 与本插件托管之外的 mcp-client 实例重复，可能导致对应实例加载失败：' + esc(state.conflicts.map((c) => c.serverName).join('、')) + '</div>')
      }
      parts.push('<div class="mX_list">')
      if (state.loading) {
        parts.push('<div class="mX_loading">加载中…</div>')
      } else if (state.servers.length === 0) {
        parts.push('<div class="mX_empty">还没有配置 MCP 服务器。<br>点击右上角「+ 添加服务器」开始：stdio 本地进程或 streamable-http 远程服务都支持。<br><br>保存后 DSH 会热加载为 mcp__&lt;serverName&gt;__&lt;tool&gt; 工具，无需重启。</div>')
      } else {
        for (const server of state.servers) parts.push(renderCardHtml(server))
      }
      parts.push('</div>')
      if (state.test) parts.push(renderTestHtml())
      parts.push('<div class="mX_banner" data-kind="info">改动写入 ~/.dsh/cordis.patch.yml 的托管区块后经 HMR 热加载（约 1~2 秒生效）。env/headers 值以 js: 开头会被当作 !!js 表达式（如 js:process.env.GITHUB_TOKEN）。</div>')
      parts.push('</div>')
      return parts.join('')
    }

    function renderCardHtml(server) {
      const parts = []
      parts.push('<div class="mX_card">')
      parts.push('<div class="mX_cardRow">')
      parts.push(transportBadge(server.transport))
      parts.push('<span class="mX_cardName">' + esc(server.serverName) + '</span>')
      parts.push(statusBadge(server.status))
      if (server.conflict) parts.push(badge('serverName 冲突', 'warn', ''))
      parts.push('<span class="mX_cardActions">')
      parts.push('<button class="mX_linkBtn" data-action="test" data-id="' + esc(server.id) + '"' + (state.busy ? ' disabled' : '') + '>测试</button>')
      parts.push('<button class="mX_linkBtn" data-action="edit" data-id="' + esc(server.id) + '"' + (state.busy ? ' disabled' : '') + '>编辑</button>')
      parts.push('<button class="mX_linkBtn" data-action="toggle" data-id="' + esc(server.id) + '"' + (state.busy ? ' disabled' : '') + '>' + (server.disabled ? '启用' : '停用') + '</button>')
      parts.push('<button class="mX_linkBtn" data-action="remove" data-id="' + esc(server.id) + '" data-danger' + (state.busy ? ' disabled' : '') + '>删除</button>')
      parts.push('</span>')
      parts.push('</div>')
      parts.push('<div class="mX_cardSummary" title="' + esc(summaryOf(server)) + '">' + esc(summaryOf(server)) + '</div>')
      parts.push('</div>')
      return parts.join('')
    }

    function renderTestHtml() {
      const test = state.test
      const parts = []
      parts.push('<div class="mX_toolWrap">')
      if (test.running) {
        parts.push('<div class="mX_banner" data-kind="info"><span class="mX_spinner"></span> 正在连接并列出工具…（最长 25 秒）</div>')
      } else {
        const result = test.result || {}
        parts.push(result.ok ? '<div class="mX_banner" data-kind="ok">连接成功</div>' : '<div class="mX_banner" data-kind="error">连接失败：' + esc(result.error || '未知错误') + '</div>')
        const meta = []
        if (result.durationMs !== undefined) meta.push('耗时 ' + result.durationMs + 'ms')
        if (result.protocolVersion) meta.push('协议 ' + esc(result.protocolVersion))
        if (result.serverInfo && (result.serverInfo.name || result.serverInfo.version)) meta.push('服务器 ' + esc([result.serverInfo.name, result.serverInfo.version].filter(Boolean).join(' ')))
        meta.push('工具数 ' + (result.toolsCount || 0))
        parts.push('<div class="mX_toolHeader">' + esc(meta.join('　·　')) + '</div>')
        if (result.ok && result.tools && result.tools.length) {
          parts.push('<div class="mX_toolList">')
          for (const tool of result.tools) {
            parts.push('<div class="mX_toolItem"><span class="mX_toolName">mcp__' + esc(test.serverName) + '__' + esc(tool.name) + '</span>')
            if (tool.description) parts.push('<span class="mX_toolDesc">' + esc(String(tool.description).slice(0, 200)) + '</span>')
            parts.push('</div>')
          }
          parts.push('</div>')
        }
      }
      parts.push('</div>')
      return parts.join('')
    }

    /* ================================ 渲染：编辑表单 ================================ */

    function kvToText(map) {
      if (!map) return ''
      return Object.entries(map).map((pair) => pair[0] + '=' + pair[1]).join('\n')
    }

    function renderEditorHtml() {
      const editor = state.editor
      const server = editor.server
      const config = (server && server.config) || {}
      const title = editor.mode === 'create' ? '添加 MCP 服务器' : '编辑 MCP 服务器'
      const transport = config.transport || 'stdio'
      const reconnect = config.reconnect || {}
      const parts = []
      parts.push('<div class="mX_panel">')
      parts.push('<div class="mX_panelHeader"><h2 class="mX_panelTitle">' + esc(title) + '</h2></div>')
      parts.push('<div class="mX_modalBody">')
      parts.push('<div class="mX_formRow">')
      parts.push('<div class="mX_field"><label class="mX_fieldLabel" for="ed_name">serverName（模型侧命名空间，[A-Za-z0-9_-] 1~32 字符）</label><input class="mX_input" id="ed_name" placeholder="例如 github" value="' + esc(config.serverName || '') + '"></div>')
      parts.push('<div class="mX_field"><span class="mX_fieldLabel">传输方式</span><span class="mX_radioRow">')
      parts.push('<label class="mX_radioLabel"><input type="radio" name="ed_transport" value="stdio"' + (transport === 'stdio' ? ' checked' : '') + '> stdio（本地进程）</label>')
      parts.push('<label class="mX_radioLabel"><input type="radio" name="ed_transport" value="streamable-http"' + (transport === 'streamable-http' ? ' checked' : '') + '> streamable-http（远程）</label>')
      parts.push('</span></div>')
      parts.push('</div>')
      parts.push('<div id="ed_stdio" style="display:' + (transport === 'stdio' ? 'flex' : 'none') + ';flex-direction:column;gap:10px">')
      parts.push('<div class="mX_formRow">')
      parts.push('<div class="mX_field"><label class="mX_fieldLabel" for="ed_command">command（可执行文件）</label><input class="mX_input" id="ed_command" placeholder="npx" value="' + esc(config.command || '') + '"></div>')
      parts.push('<div class="mX_field"><label class="mX_fieldLabel" for="ed_cwd">cwd（工作目录，可选；目录需已存在）</label><input class="mX_input" id="ed_cwd" placeholder="/path/to/project" value="' + esc(config.cwd || '') + '"></div>')
      parts.push('</div>')
      parts.push('<div class="mX_field"><label class="mX_fieldLabel" for="ed_args">args（JSON 数组，或每行一个参数）</label><textarea class="mX_input mX_textarea" id="ed_args" placeholder="[-y, @modelcontextprotocol/server-filesystem]">' + esc(JSON.stringify(config.args || [])) + '</textarea></div>')
      parts.push('<div class="mX_field"><label class="mX_fieldLabel" for="ed_env">env（每行 KEY=VALUE；js: 开头为 JS 表达式）</label><textarea class="mX_input mX_textarea" id="ed_env" placeholder="GITHUB_TOKEN=js:process.env.GITHUB_TOKEN">' + esc(kvToText(config.env)) + '</textarea></div>')
      parts.push('</div>')
      parts.push('<div id="ed_http" style="display:' + (transport === 'streamable-http' ? 'flex' : 'none') + ';flex-direction:column;gap:10px">')
      parts.push('<div class="mX_field"><label class="mX_fieldLabel" for="ed_url">url（MCP 端点）</label><input class="mX_input" id="ed_url" placeholder="http://localhost:3000/mcp" value="' + esc(config.url || '') + '"></div>')
      parts.push('<div class="mX_field"><label class="mX_fieldLabel" for="ed_headers">headers（每行 KEY=VALUE；js: 开头为 JS 表达式，模板串可引用环境变量）</label><textarea class="mX_input mX_textarea" id="ed_headers" placeholder="Authorization=js:process.env.MCP_TOKEN">' + esc(kvToText(config.headers)) + '</textarea></div>')
      parts.push('</div>')
      parts.push('<div class="mX_formRow">')
      parts.push('<div class="mX_field"><label class="mX_fieldLabel" for="ed_timeout">toolCallTimeoutMs</label><input class="mX_input" id="ed_timeout" type="number" min="1" value="' + esc(String(config.toolCallTimeoutMs ?? 60000)) + '"></div>')
      parts.push('<label class="mX_checkRow" style="padding-top:18px"><input type="checkbox" id="ed_failStartup"' + (config.failOnStartupError ? ' checked' : '') + '> failOnStartupError（启动失败即拒绝加载）</label>')
      parts.push('<label class="mX_checkRow" style="padding-top:18px"><input type="checkbox" id="ed_enabled"' + (server && server.disabled ? '' : ' checked') + '> 启用</label>')
      parts.push('</div>')
      parts.push('<div class="mX_formRow" style="align-items:end">')
      parts.push('<label class="mX_checkRow" style="padding-top:18px"><input type="checkbox" id="ed_rcEnabled"' + (reconnect.enabled !== false ? ' checked' : '') + '> 断线自动重连</label>')
      parts.push('<div class="mX_field"><label class="mX_fieldLabel" for="ed_rcInitial">initialDelayMs</label><input class="mX_input" id="ed_rcInitial" type="number" min="1" value="' + esc(String(reconnect.initialDelayMs ?? 500)) + '"></div>')
      parts.push('<div class="mX_field"><label class="mX_fieldLabel" for="ed_rcMax">maxDelayMs</label><input class="mX_input" id="ed_rcMax" type="number" min="1" value="' + esc(String(reconnect.maxDelayMs ?? 30000)) + '"></div>')
      parts.push('<div class="mX_field"><label class="mX_fieldLabel" for="ed_rcAttempts">maxAttempts</label><input class="mX_input" id="ed_rcAttempts" type="number" min="1" value="' + esc(String(reconnect.maxAttempts ?? 10)) + '"></div>')
      parts.push('</div>')
      parts.push('<p class="mX_formError" id="ed_error"></p>')
      parts.push('<div class="mX_hint">env/headers 的 VALUE 以 js: 开头会原样写入 !!js 表达式（例如 js:process.env.GITHUB_TOKEN）。保存后服务器会热加载，工具名形如 mcp__&lt;serverName&gt;__&lt;tool&gt;。</div>')
      // 测试结果就地展示在编辑器里（容器固定，由 testEditor 直接改 innerHTML）：
      // 这样「测试连接 → 保存」是一条连续动作，表单与已填内容都留着
      parts.push('<div id="ed_testResult">' + (state.test ? renderTestHtml() : '') + '</div>')
      parts.push('</div>')
      parts.push('<div class="mX_modalFooter">')
      parts.push('<button class="mX_btnGhost" data-action="editor-cancel">取消</button>')
      parts.push('<button class="mX_btnGhost" data-action="editor-test"' + (state.busy ? ' disabled' : '') + '>测试连接</button>')
      parts.push('<button class="mX_btn" data-action="editor-save"' + (state.busy ? ' disabled' : '') + '>保存</button>')
      parts.push('</div>')
      parts.push('</div>')
      return parts.join('')
    }

    function bindEditorEvents(container) {
      if (!state.editor) return
      const toggleSections = () => {
        const stdio = container.querySelector('#ed_stdio')
        const http = container.querySelector('#ed_http')
        const checked = container.querySelector('input[name="ed_transport"]:checked')
        const transport = checked ? checked.value : 'stdio'
        if (stdio) stdio.style.display = transport === 'stdio' ? 'flex' : 'none'
        if (http) http.style.display = transport === 'streamable-http' ? 'flex' : 'none'
      }
      const radios = container.querySelectorAll('input[name="ed_transport"]')
      for (const radio of radios) radio.addEventListener('change', toggleSections)
      toggleSections()
    }

    function parseArgs(text) {
      const trimmed = (text || '').trim()
      if (trimmed === '') return []
      if (trimmed.startsWith('[')) {
        const parsed = JSON.parse(trimmed)
        if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) throw new Error('args 必须是 JSON 字符串数组')
        return parsed
      }
      return trimmed.split('\n').map((line) => line.trim()).filter(Boolean)
    }

    function parseKvText(text) {
      const out = {}
      for (const raw of String(text || '').split('\n')) {
        const line = raw.trim()
        if (line === '' || line.startsWith('#')) continue
        const match = line.match(/^([A-Za-z_][A-Za-z0-9_.-]*)\s*[:=]\s*(.*)$/)
        if (match === null) throw new Error('无法解析的行：' + line)
        out[match[1]] = match[2]
      }
      return out
    }

    function newId() {
      let id = 'mcp-'
      const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
      if (window.crypto && crypto.randomUUID) {
        id = 'mcp-' + crypto.randomUUID().replace(/-/g, '').slice(0, 10)
      } else {
        for (let i = 0; i < 10; i++) id += chars[Math.floor(Math.random() * chars.length)]
      }
      return id
    }

    function collectEditor() {
      const value = (id) => {
        const input = document.getElementById(id)
        return input ? String(input.value || '').trim() : ''
      }
      const checked = (id) => {
        const input = document.getElementById(id)
        return input ? input.checked : false
      }
      const config = { serverName: value('ed_name') }
      const transportInput = document.querySelector('input[name="ed_transport"]:checked')
      config.transport = transportInput ? transportInput.value : 'stdio'
      if (config.transport === 'stdio') {
        config.command = value('ed_command')
        config.args = parseArgs(document.getElementById('ed_args')?.value || '')
        config.env = parseKvText(document.getElementById('ed_env')?.value || '')
        const cwd = value('ed_cwd')
        if (cwd !== '') config.cwd = cwd
      } else {
        config.url = value('ed_url')
        config.headers = parseKvText(document.getElementById('ed_headers')?.value || '')
      }
      const timeoutText = value('ed_timeout')
      if (timeoutText !== '') config.toolCallTimeoutMs = Number(timeoutText)
      if (checked('ed_failStartup')) config.failOnStartupError = true
      if (checked('ed_rcEnabled')) {
        config.reconnect = {
          enabled: true,
          initialDelayMs: Number(value('ed_rcInitial') || 500),
          maxDelayMs: Number(value('ed_rcMax') || 30000),
          maxAttempts: Number(value('ed_rcAttempts') || 10),
        }
      } else {
        config.reconnect = { enabled: false }
      }
      const row = { id: (state.editor.server && state.editor.server.id) || newId(), config }
      if (!checked('ed_enabled')) row.disabled = true
      return row
    }

    function setEditorError(message) {
      const errorEl = document.getElementById('ed_error')
      if (errorEl) errorEl.textContent = message || ''
    }

    /* ================================ 动作 ================================ */

    function refresh() {
      if (panelEl) renderAll(panelEl)
    }

    async function load() {
      if (state.loading) return
      state.loading = true
      refresh()
      try {
        const body = await apiList()
        state.servers = Array.isArray(body.servers) ? body.servers : []
        state.conflicts = Array.isArray(body.conflicts) ? body.conflicts : []
        state.fileError = body.fileError || ''
        state.patchFile = body.patchFile || ''
      } catch (error) {
        state.fileError = error instanceof Error ? error.message : String(error)
      } finally {
        state.loading = false
        refresh()
      }
    }

    function openEditor(mode, server) {
      state.editor = { mode, server: server || null }
      state.test = null
      refresh()
    }

    function closeEditor() {
      state.editor = null
      refresh()
    }

    async function saveEditor() {
      let row
      try {
        row = collectEditor()
      } catch (error) {
        setEditorError(error instanceof Error ? error.message : String(error))
        return
      }
      const others = state.servers.filter((server) => server.id !== row.id)
      if (others.some((server) => server.serverName === row.config.serverName)) {
        setEditorError('serverName 与已有服务器重复：' + row.config.serverName)
        return
      }
      // 外部实例同名（别的插件托管的 mcp-client，如 codegraph 归 Codegraph 插件管）：本地先拦
      // 一道给即时反馈；宿主侧还会再拦一次（权威）。已经是这一行原本的名字（历史遗留）不拦，
      // 否则连它的其它字段都改不了 —— 宿主侧同样按「是否新引入」判定。
      const clash = (state.conflicts || []).find((item) => item.serverName === row.config.serverName)
      const original = state.editor !== null && state.editor.server !== null ? state.editor.server : null
      if (clash !== undefined && !(original !== null && original.serverName === row.config.serverName)) {
        setEditorError('serverName「' + row.config.serverName + '」已被本插件之外的 mcp-client 实例占用（' + clash.id + '）：两个实例会抢同一套工具名，其中一个必然加载失败。该行由别的插件托管，请到对应插件的设置里修改。')
        return
      }
      const servers = [...others, row]
      state.busy = true
      setEditorError('')
      try {
        await apiSave(servers)
        toast('已保存，正在热加载…', 'ok')
        state.editor = null
        setTimeout(() => load(), 800)
      } catch (error) {
        setEditorError(error instanceof Error ? error.message : String(error))
        toast('保存失败：' + (error instanceof Error ? error.message : String(error)), 'error')
      } finally {
        state.busy = false
        refresh()
      }
    }

    async function removeServer(id) {
      const server = state.servers.find((item) => item.id === id)
      if (server === undefined) return
      // 删掉最后一条＝清空托管区块，确认文案要说清这一点，保存时也要显式带 clearAll
      const last = state.servers.length === 1
      const question = last
        ? '确定删除最后一条 MCP 服务器「' + server.serverName + '」？删除后托管区块会清空，其注册的工具会立即被卸载。'
        : '确定删除 MCP 服务器「' + server.serverName + '」？其注册的工具会立即被卸载。'
      if (!window.confirm(question)) return
      const servers = state.servers.filter((item) => item.id !== id)
      state.busy = true
      refresh()
      try {
        await apiSave(servers, { clearAll: last })
        toast('已删除，正在热卸载…', 'ok')
        setTimeout(() => load(), 800)
      } catch (error) {
        toast('删除失败：' + (error instanceof Error ? error.message : String(error)), 'error')
      } finally {
        state.busy = false
        refresh()
      }
    }

    async function toggleServer(id) {
      const servers = state.servers.map((server) => (server.id === id ? { ...server, disabled: !server.disabled } : server))
      state.busy = true
      refresh()
      try {
        await apiSave(servers)
        toast('已更新，正在热加载…', 'ok')
        setTimeout(() => load(), 800)
      } catch (error) {
        toast('更新失败：' + (error instanceof Error ? error.message : String(error)), 'error')
      } finally {
        state.busy = false
        refresh()
      }
    }

    async function runTest(server) {
      state.test = { serverName: server.serverName, running: true, result: null }
      state.editor = null
      refresh()
      try {
        const body = await apiTest(server.config)
        state.test = { serverName: server.serverName, running: false, result: body.result || {} }
      } catch (error) {
        state.test = { serverName: server.serverName, running: false, result: { ok: false, error: error instanceof Error ? error.message : String(error), toolsCount: 0 } }
      }
      refresh()
    }

    /**
     * 编辑器里的「测试连接」。
     *
     * 两条硬约束（都是实测踩出来的）：
     *   1. **不关编辑器**——测试只是确认配置能不能连上，紧接着就要点「保存」。早先这里把
     *      `state.editor` 置空，而编辑器是整块替换渲染（`editor ? editorHtml : mainHtml`），
     *      于是表单连同「保存」按钮一起消失，用户看到的就是「一点测试连接，保存就没了」。
     *   2. **不整体重渲染**——用户的输入只活在 DOM 里（渲染始终以原始 config 为源），
     *      `refresh()` 一次就把填好的内容冲回原样。所以结果只就地写进 `#ed_testResult`，
     *      按钮的禁用/恢复也直接改 DOM。
     */
    async function testEditor() {
      let row
      try {
        row = collectEditor()
      } catch (error) {
        setEditorError(error instanceof Error ? error.message : String(error))
        return
      }
      setEditorError('')
      const setBusy = (busy) => {
        state.busy = busy
        for (const el of document.querySelectorAll('[data-action="editor-test"], [data-action="editor-save"]')) {
          if (el instanceof HTMLButtonElement) el.disabled = busy
        }
      }
      state.test = { serverName: row.config.serverName, running: true, result: null }
      const running = document.getElementById('ed_testResult')
      if (running !== null) running.innerHTML = renderTestHtml()
      setBusy(true)
      try {
        const body = await apiTest(row.config)
        state.test = { serverName: row.config.serverName, running: false, result: body.result || {} }
        toast(body.result && body.result.ok ? '连接成功（确认无误后点保存）' : '连接失败', body.result && body.result.ok ? 'ok' : 'error')
      } catch (error) {
        // 请求本身失败（路由/网络）：清掉「正在连接…」，把原因写进编辑器错误行
        state.test = null
        setEditorError(error instanceof Error ? error.message : String(error))
      } finally {
        setBusy(false)
        const host = document.getElementById('ed_testResult')
        if (host !== null) host.innerHTML = state.test === null ? '' : renderTestHtml()
      }
    }

    /* ================================ 事件委托 ================================ */

    function handleClick(event) {
      const target = event.target
      if (!(target instanceof Element)) return
      const actionEl = target.closest('[data-action]')
      if (actionEl === null || actionEl.disabled) return
      const action = actionEl.dataset.action
      const id = actionEl.dataset.id
      if (action === 'refresh') load()
      else if (action === 'add') openEditor('create')
      else if (action === 'edit') {
        const server = state.servers.find((item) => item.id === id)
        if (server) openEditor('edit', server)
      } else if (action === 'remove') removeServer(id)
      else if (action === 'toggle') toggleServer(id)
      else if (action === 'test') {
        const server = state.servers.find((item) => item.id === id)
        if (server) runTest(server)
      } else if (action === 'editor-cancel') closeEditor()
      else if (action === 'editor-save') saveEditor()
      else if (action === 'editor-test') testEditor()
    }

    /* ================================ 面板宿主挂载 ================================ */

    function mountDomPanel(host) {
      if (panelEl !== undefined && panelEl.isConnected && panelEl.parentElement === host) return
      if (panelEl !== undefined) panelEl.remove()
      panelEl = document.createElement('div')
      panelEl.className = 'mX_panelHost'
      host.appendChild(panelEl)
      renderAll(panelEl)
    }

    /* ================================ 设置卡片（React 外壳） ================================ */

    const CHEVRON_PATH = 'M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 9.13382 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z'

    function McpSettingsCard(props) {
      // DSH ≥0.1.6 的插件配置页把同一条目按 view 渲染两次：summary 一句话摘要、page 完整表单。
      // 旧版（≤0.1.5）的 settings.plugin.item 卡片不带 view，走原有可折叠卡片分支。
      const view = props && props.view
      const pageView = view === 'page'
      const [open, setOpen] = React.useState(pageView)
      const hostRef = React.useRef(null)
      React.useEffect(() => {
        if (!open) return
        const host = hostRef.current
        if (host === null) return
        mountDomPanel(host)
        load()
      }, [open])
      if (view === 'summary') {
        return '管理 MCP 服务器：stdio 本地进程或 streamable-http 远程服务；保存后热加载为 mcp__<server>__<tool> 工具。'
      }

      // page 视图：新页面自己画标题/图标/面包屑，这里只交表单本体，不渲染卡片头。
      return jsxs(pageView ? 'div' : 'li', {
        className: pageView ? 'mX_pageHost' : (open ? 'mX_pluginCard mX_pluginCardOpen' : 'mX_pluginCard'),
        children: [
          pageView ? null : jsxs('button', {
            type: 'button',
            className: 'mX_cardHeader',
            'aria-expanded': open,
            onClick: () => setOpen((current) => !current),
            children: [
              jsxs('span', {
                className: 'mX_cardHeadText',
                children: [
                  jsx('span', { className: 'mX_cardName', children: 'MCP 服务器配置' }),
                  jsx('span', { className: 'mX_cardDescription', children: '管理 MCP 服务器：stdio 本地进程或 streamable-http 远程服务；保存后热加载为 mcp__<server>__<tool> 工具，无需重启。' }),
                ],
              }),
              jsx('span', { className: 'dshkit_badge', children: 'Kit' }),
              jsx('svg', {
                width: '14',
                height: '14',
                viewBox: '0 0 14 14',
                fill: 'none',
                xmlns: 'http://www.w3.org/2000/svg',
                className: 'mX_chevron',
                children: jsx('path', { d: CHEVRON_PATH, fill: 'currentColor' }),
              }),
            ],
          }),
          (pageView || open) ? jsx('div', {
            className: 'mX_cardBody',
            children: jsx('div', { ref: hostRef, className: 'mX_cardHost' }),
          }) : null,
        ],
      })
    }

    /* ================================ 插件入口 ================================ */

    exports.inject = ['slots']

    /**
     * DSH ≥0.1.6-alpha.2 的行配置 key：`<bundle 包名>#<行 id>`，行 id 取自 bundle 的
     * cordis.patch.yml。独立安装时 bundle 是本包，装全家桶时是 @hyzyn/dsh-all —— 两个都注册，
     * 未命中的那个只是躺在 ledger 里，不会渲染。
     */
    const ROW_CONFIG_KEYS = [
      '@hyzyn/dsh-mcp#mcp-config',
      '@hyzyn/dsh-all#mcp-config',
    ]

    exports.apply = (ctx) => {
      ctx.effect(() => {
        ensureStyle()
        // 面板 DOM 点击委托：挂在 document 上，避免随重渲染丢失
        document.addEventListener('click', handleClick, true)
        return () => {
          document.removeEventListener('click', handleClick, true)
          styleEl?.remove()
          styleEl = undefined
          toastEl?.remove()
          toastEl = undefined
          panelEl?.remove()
          panelEl = undefined
        }
      })
      // 注册到官方插件配置 → 可配置 卡片列表（与终端 / Agent 循环 / 网页搜索同级）
      // DSH ≥0.1.6-alpha.2：侧边栏「插件」页里该行的配置页。插槽不存在时 inject 不会触发，
      // 因此在旧版上完全无副作用，一份代码同时兼容两代。
      for (const key of ROW_CONFIG_KEYS) {
        ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
          name: 'plugins.row.config',
          key,
        }, McpSettingsCard))
      }
      // DSH ≥0.1.6：设置里与「通用设置」平级的「插件配置」页（子 slot 由
      // @hyzyn/dsh-kit-settings 声明）。不传 view，卡片走各自原有的可折叠形态。
      ctx.slots.inject('settings.kit.item', () => ctx.slots.register({
        name: 'settings.kit.item',
        id: 'mcp-config',
        order: 20,
        label: () => "MCP 服务器配置",
      }, McpSettingsCard))
      // DSH ≤0.1.5：设置 → 插件 的「插件配置」标签页，keyed 插槽按 settings 命名空间派发。
      ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
        name: 'settings.plugin.item',
        // settings.plugin.item 是 keyed 插槽：key 必须是该卡片所编辑的 settings 命名空间
        key: 'mcp-config',
        order: 96,
      }, McpSettingsCard))
    }

    return exports
  },
})
