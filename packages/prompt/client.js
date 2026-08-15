/* eslint-disable */
/**
 * @dsh-kit/prompt — 浏览器半体：官方设置 → 插件 里的「Prompt 管理」卡片。
 * 通过核心 slots 服务注册到 settings.plugin.item 插槽。
 * 纯前端 DOM 面板（React 只承担卡片外壳与展开状态），无构建步骤，
 * 宿主经 /plugins/@dsh-kit/prompt/client.js 提供。
 */
window.__ModuleLoader__.load({
  id: '@dsh-kit/prompt',
  factory: (require) => {
    const exports = {}

    const React = require('react')
    const { jsx, jsxs } = require('react/jsx-runtime')

    /* ================================ CSS ================================ */

    const CSS = [
      '.pM_pluginCard{list-style:none;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;transition:border-color .16s,background .16s}',
      '.pM_pluginCard:hover{border-color:var(--dsw-alias-label-dimmed)}',
      '.pM_pluginCardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}',
      '.pM_cardHeader{appearance:none;width:100%;color:inherit;font:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;display:flex;align-items:center;gap:12px;padding:14px 16px}',
      '.pM_cardHeader:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.pM_cardHeadText{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}',
      '.pM_cardName{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:600}',
      '.pM_cardDescription{color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.pM_chevron{flex:none;color:var(--dsw-alias-label-tertiary);transition:transform .16s}',
      '.pM_pluginCardOpen .pM_chevron{transform:rotate(180deg)}',
      '.pM_cardBody{padding:2px 16px 16px}',
      '.pM_panel{display:flex;flex-direction:column;gap:12px;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);box-sizing:border-box}',
      '.pM_panelHeader{display:flex;align-items:center;gap:8px 10px;flex:none;flex-wrap:wrap}',
      '.pM_panelTitle{margin:0;font-size:15px;font-weight:700;white-space:nowrap;flex:1;min-width:0}',
      '.pM_subtitle{color:var(--dsw-alias-label-tertiary);font-size:11.5px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:320px;min-width:0;flex:0 1 auto}',
      '.pM_toolbar{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex:1 1 100%;min-width:0;flex-wrap:wrap}',
      '.pM_btn{color:var(--dsw-alias-label-primary-foreground);background:var(--dsw-alias-button-info-fill);border:none;border-radius:8px;padding:6px 14px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}',
      '.pM_btn:hover:not(:disabled){background:var(--dsw-alias-button-info-hover)}',
      '.pM_btn:disabled{opacity:.5;cursor:default}',
      '.pM_btnGhost{color:var(--dsw-alias-label-primary);background:0 0;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:5px 12px;font-size:12px;cursor:pointer;white-space:nowrap}',
      '.pM_btnGhost:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
      '.pM_btnGhost:disabled{opacity:.45;cursor:default}',
      '.pM_btnDanger{color:var(--dsw-alias-state-error-primary)}',
      '.pM_linkBtn{color:var(--dsw-alias-state-business-primary);background:0 0;border:none;padding:0;font-size:12px;cursor:pointer;white-space:nowrap}',
      '.pM_linkBtn:hover:not(:disabled){text-decoration:underline}',
      '.pM_linkBtn[data-danger]{color:var(--dsw-alias-state-error-primary)}',
      '.pM_list{display:flex;flex-direction:column;gap:8px;max-height:480px;overflow-y:auto}',
      '.pM_card{background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:6px}',
      '.pM_cardRow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.pM_cardName{font-weight:700;font-size:13.5px}',
      '.pM_cardSummary{color:var(--dsw-alias-label-secondary);font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}',
      '.pM_cardActions{display:flex;align-items:center;gap:6px;margin-left:auto;flex-wrap:wrap}',
      '.pM_badge{display:inline-block;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:1px 8px;font-size:11px;line-height:1.6;white-space:nowrap}',
      '.pM_badge[data-kind=active]{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}',
      '.pM_badge[data-kind=ab]{color:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary)}',
      '.pM_banner{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);border-radius:8px;padding:8px 12px;font-size:12.5px;line-height:1.5;overflow-wrap:anywhere;flex:none}',
      '.pM_banner[data-kind=ok]{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}',
      '.pM_banner[data-kind=error]{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}',
      '.pM_banner[data-kind=info]{color:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary)}',
      '.pM_banner[data-kind=warn]{color:var(--dsw-alias-state-warn-primary);border-color:var(--dsw-alias-state-warn-primary)}',
      '.pM_empty,.pM_loading{text-align:center;color:var(--dsw-alias-label-tertiary);padding:24px 12px;font-size:12.5px}',
      '.pM_editor{display:grid;grid-template-columns:minmax(180px,240px) 1fr;gap:12px;align-items:start}',
      '.pM_editorMain{display:flex;flex-direction:column;gap:10px;min-width:0}',
      '.pM_editorSide{display:flex;flex-direction:column;gap:8px;max-height:420px;overflow-y:auto}',
      '.pM_versionItem{background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:8px 10px;display:flex;flex-direction:column;gap:4px;cursor:pointer}',
      '.pM_versionItem[data-selected]{border-color:var(--dsw-alias-state-business-primary)}',
      '.pM_versionTitle{font-weight:600;font-size:12.5px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
      '.pM_versionMeta{color:var(--dsw-alias-label-tertiary);font-size:11px}',
      '.pM_field{display:flex;flex-direction:column;gap:5px}',
      '.pM_fieldLabel{color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:600}',
      '.pM_input{color:var(--dsw-alias-label-primary);background:var(--dsw-specific-input-major);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;outline:none;padding:7px 10px;font-family:inherit;font-size:13px;box-sizing:border-box;width:100%}',
      '.pM_input:focus{border-color:var(--dsw-alias-state-business-primary)}',
      '.pM_input::placeholder{color:var(--dsw-alias-label-tertiary)}',
      '.pM_textarea{min-height:220px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:1.55;white-space:pre-wrap}',
      '.pM_hint{color:var(--dsw-alias-label-tertiary);font-size:11.5px;line-height:1.5}',
      '.pM_radioRow{display:flex;align-items:center;gap:16px}',
      '.pM_checkRow{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--dsw-alias-label-primary);cursor:pointer}',
      '.pM_formError{color:var(--dsw-alias-state-error-primary);font-size:12px;margin:0;white-space:pre-wrap}',
      '.pM_toast{position:fixed;left:50%;bottom:36px;transform:translateX(-50%);z-index:2147483647;pointer-events:none;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);border-radius:10px;padding:9px 16px;font-size:13px;box-shadow:var(--dsw-shadow-lv3);max-width:70vw}',
      '.pM_toast[data-kind=ok]{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary)}',
      '.pM_toast[data-kind=error]{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}',
      '.pM_mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}',
    ].join('\n')

    let styleEl
    function ensureStyle() {
      if (document.getElementById('dsh-prompt-style')) return
      styleEl = document.createElement('style')
      styleEl.id = 'dsh-prompt-style'
      styleEl.textContent = CSS
      document.head.appendChild(styleEl)
    }

    /* ================================ 基础工具 ================================ */

    const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESC_MAP[c])
    const clone = (value) => JSON.parse(JSON.stringify(value))
    const fmtTime = (value) => {
      if (!value) return ''
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return value
      return date.toLocaleString()
    }

    /* ================================ API ================================ */

    const API = {
      list: '/api/dsh-prompt/list',
      save: '/api/dsh-prompt/save',
      activate: '/api/dsh-prompt/activate',
      abtest: '/api/dsh-prompt/abtest',
      delete: '/api/dsh-prompt/delete',
      export: '/api/dsh-prompt/export',
      import: '/api/dsh-prompt/import',
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
    const apiSave = (prompt) => apiRequest(API.save, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt }),
    })
    const apiActivate = (promptId, versionId) => apiRequest(API.activate, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ promptId, versionId }),
    })
    const apiAb = (payload) => apiRequest(API.abtest, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const apiDelete = (promptId) => apiRequest(API.delete, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ promptId }),
    })
    const apiImport = (data) => apiRequest(API.import, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data }),
    })

    /* ================================ 面板状态 ================================ */

    const state = {
      prompts: [],
      activePromptId: null,
      file: '',
      fileError: '',
      loading: false,
      busy: false,
      view: 'list',
      editor: null,
      ab: null,
      toast: '',
      toastKind: 'info',
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

    let panelEl
    let toastEl

    function renderAll(container) {
      panelEl = container
      container.innerHTML = state.view === 'editor' ? renderEditorHtml() : state.view === 'ab' ? renderAbHtml() : renderMainHtml()
      bindEvents(container)
      renderToast()
    }

    function renderToast() {
      if (toastEl === undefined || !toastEl.isConnected) {
        toastEl = document.createElement('div')
        toastEl.className = 'pM_toast'
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

    function badge(text, kind) {
      return '<span class="pM_badge"' + (kind ? ' data-kind="' + kind + '"' : '') + '>' + esc(text) + '</span>'
    }

    function promptBadges(prompt, activePromptId) {
      const parts = []
      if (prompt.id === activePromptId) parts.push(badge('已启用', 'active'))
      if (prompt.ab && prompt.ab.enabled) parts.push(badge('A/B ' + prompt.ab.aWeight + '%', 'ab'))
      parts.push(badge(prompt.versions.length + ' 个版本'))
      return parts.join('')
    }

    function renderMainHtml() {
      const parts = []
      parts.push('<div class="pM_panel">')
      parts.push('<div class="pM_panelHeader">')
      parts.push('<div class="pM_toolbar">')
      parts.push('<button class="pM_btnGhost" data-action="refresh"' + (state.loading ? ' disabled' : '') + '>刷新</button>')
      parts.push('<button class="pM_btnGhost" data-action="import">导入</button>')
      parts.push('<button class="pM_btnGhost" data-action="export-json-all">导出全部 JSON</button>')
      parts.push('<button class="pM_btnGhost" data-action="export-md-all">导出全部 MD</button>')
      parts.push('<button class="pM_btn" data-action="create">+ 新建 Prompt</button>')
      parts.push('</div>')
      parts.push('</div>')
      if (state.fileError) parts.push('<div class="pM_banner" data-kind="error">' + esc(state.fileError) + '</div>')
      if (state.loading) {
        parts.push('<div class="pM_loading">加载中…</div>')
      } else if (state.prompts.length === 0) {
        parts.push('<div class="pM_empty">暂无 Prompt，点击“+ 新建 Prompt”开始。</div>')
      } else {
        parts.push('<div class="pM_list">')
        for (const prompt of state.prompts) {
          parts.push('<div class="pM_card">')
          parts.push('<div class="pM_cardRow">')
          parts.push('<span class="pM_cardName">' + esc(prompt.name) + '</span>')
          parts.push(promptBadges(prompt, state.activePromptId))
          parts.push('<span class="pM_cardSummary" title="' + esc(prompt.description || '') + '">' + esc(prompt.description || '') + '</span>')
          parts.push('</div>')
          parts.push('<div class="pM_cardActions">')
          parts.push('<button class="pM_linkBtn" data-action="edit" data-id="' + esc(prompt.id) + '">编辑</button>')
          if (prompt.id !== state.activePromptId) {
            parts.push('<button class="pM_linkBtn" data-action="activate" data-id="' + esc(prompt.id) + '">启用</button>')
          } else {
            parts.push('<button class="pM_linkBtn" data-action="deactivate" data-id="' + esc(prompt.id) + '">停用</button>')
          }
          parts.push('<button class="pM_linkBtn" data-action="ab" data-id="' + esc(prompt.id) + '">A/B 测试</button>')
          parts.push('<button class="pM_linkBtn" data-action="export-json" data-id="' + esc(prompt.id) + '">导出 JSON</button>')
          parts.push('<button class="pM_linkBtn" data-action="export-md" data-id="' + esc(prompt.id) + '">导出 MD</button>')
          parts.push('<button class="pM_linkBtn" data-action="share" data-id="' + esc(prompt.id) + '">分享</button>')
          parts.push('<button class="pM_linkBtn" data-danger="true" data-action="delete" data-id="' + esc(prompt.id) + '">删除</button>')
          parts.push('</div>')
          parts.push('</div>')
        }
        parts.push('</div>')
      }
      parts.push('</div>')
      return parts.join('')
    }

    /* ================================ 渲染：编辑器 ================================ */

    function renderEditorHtml() {
      const editor = state.editor
      if (editor === null) return ''
      const prompt = editor.prompt
      const selected = prompt.versions.find((version) => version.id === editor.selectedVersionId) || prompt.versions[0]
      const parts = []
      parts.push('<div class="pM_panel">')
      parts.push('<div class="pM_panelHeader"><h2 class="pM_panelTitle">编辑 Prompt</h2>')
      parts.push('<span class="pM_subtitle">' + esc(prompt.id || '新 Prompt') + '</span>')
      parts.push('<div class="pM_toolbar">')
      parts.push('<button class="pM_btnGhost" data-action="editor-back">返回</button>')
      parts.push('<button class="pM_btn" data-action="editor-save"' + (state.busy ? ' disabled' : '') + '>保存修改</button>')
      parts.push('</div>')
      parts.push('</div>')
      parts.push('<div class="pM_field"><span class="pM_fieldLabel">名称</span><input class="pM_input" data-field="name" value="' + esc(prompt.name) + '" placeholder="Prompt 名称" /></div>')
      parts.push('<div class="pM_field"><span class="pM_fieldLabel">描述</span><input class="pM_input" data-field="description" value="' + esc(prompt.description || '') + '" placeholder="可选描述" /></div>')
      parts.push('<div class="pM_editor">')
      parts.push('<div class="pM_editorSide">')
      for (const version of prompt.versions) {
        const active = version.id === prompt.activeVersionId
        const selectedAttr = version.id === selected.id ? ' data-selected="true"' : ''
        parts.push('<div class="pM_versionItem"' + selectedAttr + ' data-action="select-version" data-id="' + esc(version.id) + '">')
        parts.push('<span class="pM_versionTitle">' + esc(version.label || version.id) + (active ? ' ' + badge('激活', 'active') : '') + '</span>')
        parts.push('<span class="pM_versionMeta">' + fmtTime(version.createdAt) + (version.note ? ' · ' + esc(version.note) : '') + '</span>')
        parts.push('<span class="pM_hint">' + esc(version.content.slice(0, 60)) + (version.content.length > 60 ? '…' : '') + '</span>')
        parts.push('<span class="pM_cardActions">')
        parts.push('<button class="pM_linkBtn" data-action="set-active" data-id="' + esc(version.id) + '">设为激活</button>')
        if (prompt.versions.length > 1) {
          parts.push('<button class="pM_linkBtn" data-danger="true" data-action="remove-version" data-id="' + esc(version.id) + '">删除</button>')
        }
        parts.push('</span>')
        parts.push('</div>')
      }
      parts.push('</div>')
      parts.push('<div class="pM_editorMain">')
      parts.push('<div class="pM_field"><span class="pM_fieldLabel">版本标签</span><input class="pM_input" data-field="label" value="' + esc(editor.draftLabel || '') + '" placeholder="例如 v2 简洁版" /></div>')
      parts.push('<div class="pM_field"><span class="pM_fieldLabel">版本备注</span><input class="pM_input" data-field="note" value="' + esc(editor.draftNote || '') + '" placeholder="这次改了什么" /></div>')
      parts.push('<div class="pM_field"><span class="pM_fieldLabel">内容（systemPrompt）</span><textarea class="pM_input pM_textarea" data-field="content" placeholder="在这里编辑 system prompt…">' + esc(selected.content) + '</textarea></div>')
      parts.push('<div class="pM_hint">字符数：' + selected.content.length + '。点击“保存为新版本”会把当前内容存成新版本，原版本保留。</div>')
      parts.push('<div class="pM_toolbar">')
      parts.push('<button class="pM_btnGhost" data-action="editor-save-new"' + (state.busy ? ' disabled' : '') + '>保存为新版本</button>')
      parts.push('<button class="pM_btnGhost" data-action="editor-export-json" data-id="' + esc(prompt.id) + '">导出 JSON</button>')
      parts.push('<button class="pM_btnGhost" data-action="editor-export-md" data-id="' + esc(prompt.id) + '">导出 MD</button>')
      parts.push('<button class="pM_btnGhost" data-action="editor-share" data-id="' + esc(prompt.id) + '">复制分享</button>')
      parts.push('</div>')
      parts.push('</div>')
      parts.push('</div>')
      parts.push('</div>')
      return parts.join('')
    }

    /* ================================ 渲染：A/B 测试 ================================ */

    function renderAbHtml() {
      const ab = state.ab
      if (ab === null) return ''
      const prompt = state.prompts.find((item) => item.id === ab.promptId)
      if (prompt === undefined) return ''
      const parts = []
      parts.push('<div class="pM_panel">')
      parts.push('<div class="pM_panelHeader"><h2 class="pM_panelTitle">A/B 测试 · ' + esc(prompt.name) + '</h2>')
      parts.push('<div class="pM_toolbar">')
      parts.push('<button class="pM_btnGhost" data-action="ab-back">返回</button>')
      parts.push('<button class="pM_btn" data-action="ab-save"' + (state.busy ? ' disabled' : '') + '>保存 A/B</button>')
      parts.push('</div>')
      parts.push('</div>')
      parts.push('<div class="pM_banner" data-kind="info">启用后，宿主会按 A 权重随机选择一个版本注入 systemPrompt；当前命中可通过 /api/dsh-prompt/active 查看。</div>')
      parts.push('<label class="pM_checkRow"><input type="checkbox" data-field="ab-enabled"' + (ab.enabled ? ' checked' : '') + ' /> 启用 A/B 测试</label>')
      parts.push('<div class="pM_field"><span class="pM_fieldLabel">A 版本</span><select class="pM_input" data-field="ab-a">' + prompt.versions.map((version) => '<option value="' + esc(version.id) + '"' + (version.id === ab.aVersionId ? ' selected' : '') + '>' + esc(version.label || version.id) + '</option>').join('') + '</select></div>')
      parts.push('<div class="pM_field"><span class="pM_fieldLabel">B 版本</span><select class="pM_input" data-field="ab-b">' + prompt.versions.map((version) => '<option value="' + esc(version.id) + '"' + (version.id === ab.bVersionId ? ' selected' : '') + '>' + esc(version.label || version.id) + '</option>').join('') + '</select></div>')
      parts.push('<div class="pM_field"><span class="pM_fieldLabel">A 流量权重：<span class="pM_mono">' + ab.aWeight + '%</span></span><input class="pM_input" type="range" min="0" max="100" step="1" data-field="ab-weight" value="' + ab.aWeight + '" /></div>')
      parts.push('</div>')
      return parts.join('')
    }

    /* ================================ 数据操作 ================================ */

    async function load() {
      state.loading = true
      if (panelEl !== undefined) renderAll(panelEl)
      try {
        const data = await apiList()
        state.prompts = data.prompts || []
        state.activePromptId = data.activePromptId || null
        state.file = data.file || ''
        state.fileError = data.fileError || ''
        state.view = 'list'
        state.editor = null
        state.ab = null
      } catch (error) {
        toast(error.message, 'error')
      } finally {
        state.loading = false
        if (panelEl !== undefined) renderAll(panelEl)
      }
    }

    function openCreate() {
      const now = new Date().toISOString()
      state.editor = {
        prompt: {
          id: '',
          name: '',
          description: '',
          versions: [{ id: '', label: 'v1', note: '初始版本', content: '', createdAt: now }],
          activeVersionId: null,
          ab: { enabled: false, aVersionId: '', bVersionId: '', aWeight: 50 },
          updatedAt: now,
        },
        selectedVersionId: '',
        draftLabel: 'v1',
        draftNote: '初始版本',
      }
      state.view = 'editor'
      renderAll(panelEl)
    }

    function openEdit(promptId) {
      const prompt = state.prompts.find((item) => item.id === promptId)
      if (prompt === undefined) return
      const copy = clone(prompt)
      const selectedVersionId = copy.activeVersionId || copy.versions[0]?.id || ''
      const selected = copy.versions.find((version) => version.id === selectedVersionId) || copy.versions[0]
      state.editor = {
        prompt: copy,
        selectedVersionId,
        draftLabel: '',
        draftNote: '',
      }
      state.view = 'editor'
      renderAll(panelEl)
    }

    function openAb(promptId) {
      const prompt = state.prompts.find((item) => item.id === promptId)
      if (prompt === undefined) return
      const ab = prompt.ab || { enabled: false, aVersionId: prompt.versions[0]?.id || '', bVersionId: prompt.versions[prompt.versions.length - 1]?.id || '', aWeight: 50 }
      state.ab = { promptId, ...clone(ab) }
      state.view = 'ab'
      renderAll(panelEl)
    }

    async function saveEditor() {
      const editor = state.editor
      if (editor === null) return
      const prompt = editor.prompt
      if (!prompt.name.trim()) {
        toast('名称不能为空', 'error')
        return
      }
      if (prompt.ab?.enabled && prompt.ab.aVersionId && prompt.ab.aVersionId === prompt.ab.bVersionId) {
        toast('A/B 两个版本不能相同', 'error')
        return
      }
      state.busy = true
      try {
        const data = await apiSave(prompt)
        state.prompts = data.prompts || []
        state.activePromptId = data.activePromptId || null
        state.file = data.file || ''
        state.fileError = data.fileError || ''
        state.view = 'list'
        state.editor = null
        toast('已保存', 'ok')
      } catch (error) {
        toast(error.message, 'error')
      } finally {
        state.busy = false
        if (panelEl !== undefined) renderAll(panelEl)
      }
    }

    async function saveNewVersion() {
      const editor = state.editor
      if (editor === null) return
      const prompt = editor.prompt
      const selected = prompt.versions.find((version) => version.id === editor.selectedVersionId) || prompt.versions[0]
      if (selected === undefined || !selected.content.trim()) {
        toast('内容不能为空', 'error')
        return
      }
      if (prompt.ab?.enabled && prompt.ab.aVersionId && prompt.ab.aVersionId === prompt.ab.bVersionId) {
        toast('A/B 两个版本不能相同', 'error')
        return
      }
      prompt.versions = [...prompt.versions, {
        id: '',
        label: editor.draftLabel || ('v' + (prompt.versions.length + 1)),
        note: editor.draftNote || '',
        content: selected.content,
        createdAt: new Date().toISOString(),
      }]
      state.busy = true
      try {
        const data = await apiSave(prompt)
        state.prompts = data.prompts || []
        state.activePromptId = data.activePromptId || null
        state.file = data.file || ''
        state.fileError = data.fileError || ''
        const saved = data.prompts?.find((item) => item.id === prompt.id)
        const newVersion = saved?.versions[saved.versions.length - 1]
        if (saved !== undefined) {
          state.editor = {
            prompt: clone(saved),
            selectedVersionId: newVersion?.id || saved.activeVersionId || saved.versions[0]?.id || '',
            draftLabel: '',
            draftNote: '',
          }
        }
        toast('已保存为新版本', 'ok')
      } catch (error) {
        toast(error.message, 'error')
      } finally {
        state.busy = false
        if (panelEl !== undefined) renderAll(panelEl)
      }
    }

    async function activatePrompt(promptId) {
      try {
        await apiActivate(promptId, undefined)
        await load()
        toast('已启用', 'ok')
      } catch (error) {
        toast(error.message, 'error')
      }
    }

    async function deactivatePrompt() {
      try {
        await apiActivate('', undefined)
        await load()
        toast('已停用', 'ok')
      } catch (error) {
        toast(error.message, 'error')
      }
    }

    async function saveAb() {
      const ab = state.ab
      if (ab === null) return
      if (ab.enabled && ab.aVersionId === ab.bVersionId) {
        toast('A/B 两个版本不能相同', 'error')
        return
      }
      state.busy = true
      try {
        await apiAb({
          promptId: ab.promptId,
          enabled: ab.enabled,
          aVersionId: ab.aVersionId,
          bVersionId: ab.bVersionId,
          aWeight: ab.aWeight,
        })
        await load()
        toast('A/B 已保存', 'ok')
      } catch (error) {
        toast(error.message, 'error')
      } finally {
        state.busy = false
        if (panelEl !== undefined) renderAll(panelEl)
      }
    }

    async function deletePrompt(promptId) {
      const prompt = state.prompts.find((item) => item.id === promptId)
      if (!window.confirm('确认删除 Prompt“' + (prompt?.name || promptId) + '”？此操作不可恢复。')) return
      try {
        await apiDelete(promptId)
        await load()
        toast('已删除', 'ok')
      } catch (error) {
        toast(error.message, 'error')
      }
    }

    function download(filename, text, mime) {
      const blob = new Blob([text], { type: mime || 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      setTimeout(() => {
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }, 1000)
    }

    async function exportJson(promptId) {
      try {
        const res = await fetch(API.export + '?format=json' + (promptId ? '&promptId=' + encodeURIComponent(promptId) : ''))
        const body = await res.json()
        if (!res.ok || !body.data) throw new Error(body.error || '导出失败')
        download('dsh-prompt-' + (promptId || 'all') + '.json', JSON.stringify(body.data, null, 2), 'application/json')
        toast('已导出 JSON', 'ok')
      } catch (error) {
        toast(error.message, 'error')
      }
    }

    async function exportMarkdown(promptId) {
      try {
        const res = await fetch(API.export + '?format=markdown' + (promptId ? '&promptId=' + encodeURIComponent(promptId) : ''))
        const text = await res.text()
        if (!res.ok) throw new Error(text || '导出失败')
        download('dsh-prompt-' + (promptId || 'all') + '.md', text, 'text/markdown')
        toast('已导出 Markdown', 'ok')
      } catch (error) {
        toast(error.message, 'error')
      }
    }

    async function copyShare(promptId) {
      try {
        const res = await fetch(API.export + '?format=json' + (promptId ? '&promptId=' + encodeURIComponent(promptId) : ''))
        const body = await res.json()
        if (!res.ok || !body.data) throw new Error(body.error || '分享数据获取失败')
        const text = JSON.stringify(body.data, null, 2)
        await navigator.clipboard.writeText(text)
        toast('分享 JSON 已复制到剪贴板', 'ok')
      } catch (error) {
        toast(error.message, 'error')
      }
    }

    function importPrompt() {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.json,application/json'
      input.onchange = async () => {
        const file = input.files && input.files[0]
        if (!file) return
        try {
          const text = await file.text()
          const data = JSON.parse(text)
          await apiImport(data)
          await load()
          toast('导入成功', 'ok')
        } catch (error) {
          toast(error.message, 'error')
        }
      }
      input.click()
    }

    async function setActiveVersion(versionId) {
      const editor = state.editor
      if (editor === null) return
      if (!editor.prompt.id) {
        editor.prompt.activeVersionId = versionId
        editor.prompt.ab.enabled = false
        toast('已标记为激活，保存后生效', 'ok')
        renderAll(panelEl)
        return
      }
      try {
        await apiActivate(editor.prompt.id, versionId)
        await load()
        toast('已切换激活版本', 'ok')
      } catch (error) {
        toast(error.message, 'error')
      }
    }

    function removeVersion(versionId) {
      const editor = state.editor
      if (editor === null) return
      if (editor.prompt.versions.length <= 1) {
        toast('至少保留一个版本', 'error')
        return
      }
      if (!window.confirm('确认删除该版本？')) return
      editor.prompt.versions = editor.prompt.versions.filter((version) => version.id !== versionId)
      if (editor.selectedVersionId === versionId) {
        editor.selectedVersionId = editor.prompt.versions[0]?.id || ''
      }
      if (editor.prompt.activeVersionId === versionId) {
        editor.prompt.activeVersionId = editor.prompt.versions[0]?.id || null
      }
      toast('已删除版本，点击“保存修改”生效', 'ok')
      renderAll(panelEl)
    }



    /* ================================ 事件 ================================ */

    function handleClick(event) {
      const target = event.target
      if (!(target instanceof Element)) return
      const actionEl = target.closest('[data-action]')
      if (actionEl === null || actionEl.disabled) return
      const action = actionEl.dataset.action
      const id = actionEl.dataset.id
      if (action === 'refresh') load()
      else if (action === 'import') importPrompt()
      else if (action === 'create') openCreate()
      else if (action === 'edit') openEdit(id)
      else if (action === 'activate') activatePrompt(id)
      else if (action === 'deactivate') deactivatePrompt()
      else if (action === 'ab') openAb(id)
      else if (action === 'delete') deletePrompt(id)
      else if (action === 'export-json' || action === 'editor-export-json') exportJson(id)
      else if (action === 'export-md' || action === 'editor-export-md') exportMarkdown(id)
      else if (action === 'export-json-all') exportJson('')
      else if (action === 'export-md-all') exportMarkdown('')
      else if (action === 'share' || action === 'editor-share') copyShare(id)
      else if (action === 'editor-back' || action === 'ab-back') {
        state.view = 'list'
        state.editor = null
        state.ab = null
        renderAll(panelEl)
      } else if (action === 'editor-save') saveEditor()
      else if (action === 'editor-save-new') saveNewVersion()
      else if (action === 'ab-save') saveAb()
      else if (action === 'set-active') setActiveVersion(id)
      else if (action === 'remove-version') removeVersion(id)
      else if (action === 'select-version') {
        if (state.editor !== null) {
          state.editor.selectedVersionId = id
          renderAll(panelEl)
        }
      }
    }

    function bindInputs(container) {
      const editor = state.editor
      const ab = state.ab
      container.querySelectorAll('[data-field]').forEach((el) => {
        const field = el.dataset.field
        if (field === 'name' && editor) {
          el.addEventListener('input', () => { editor.prompt.name = el.value })
        } else if (field === 'description' && editor) {
          el.addEventListener('input', () => { editor.prompt.description = el.value })
        } else if (field === 'label' && editor) {
          el.addEventListener('input', () => { editor.draftLabel = el.value })
        } else if (field === 'note' && editor) {
          el.addEventListener('input', () => { editor.draftNote = el.value })
        } else if (field === 'content' && editor) {
          const selected = editor.prompt.versions.find((version) => version.id === editor.selectedVersionId) || editor.prompt.versions[0]
          el.addEventListener('input', () => {
            if (selected) selected.content = el.value
          })
        } else if (field === 'ab-enabled' && ab) {
          el.addEventListener('change', () => { ab.enabled = el.checked })
        } else if (field === 'ab-a' && ab) {
          el.addEventListener('change', () => { ab.aVersionId = el.value })
        } else if (field === 'ab-b' && ab) {
          el.addEventListener('change', () => { ab.bVersionId = el.value })
        } else if (field === 'ab-weight' && ab) {
          el.addEventListener('input', () => { ab.aWeight = Number(el.value) })
        }
      })
    }

    function bindEvents(container) {
      bindInputs(container)
    }

    /* ================================ 面板宿主挂载 ================================ */

    function mountDomPanel(host) {
      if (panelEl !== undefined && panelEl.isConnected && panelEl.parentElement === host) return
      if (panelEl !== undefined) panelEl.remove()
      panelEl = document.createElement('div')
      panelEl.className = 'pM_panelHost'
      host.appendChild(panelEl)
      renderAll(panelEl)
    }

    /* ================================ 设置卡片（React 外壳） ================================ */

    const CHEVRON_PATH = 'M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 9.13382 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z'

    function PromptSettingsCard() {
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
        className: open ? 'pM_pluginCard pM_pluginCardOpen' : 'pM_pluginCard',
        children: [
          jsxs('button', {
            type: 'button',
            className: 'pM_cardHeader',
            'aria-expanded': open,
            onClick: () => setOpen((current) => !current),
            children: [
              jsxs('span', {
                className: 'pM_cardHeadText',
                children: [
                  jsx('span', { className: 'pM_cardName', children: 'Prompt 管理' }),
                  jsx('span', { className: 'pM_cardDescription', children: '可视化编辑 systemPrompt、版本管理、A/B 测试、导出/分享。' }),
                ],
              }),
              jsx('svg', {
                width: '14',
                height: '14',
                viewBox: '0 0 14 14',
                fill: 'none',
                xmlns: 'http://www.w3.org/2000/svg',
                className: 'pM_chevron',
                children: jsx('path', { d: CHEVRON_PATH, fill: 'currentColor' }),
              }),
            ],
          }),
          open ? jsx('div', {
            className: 'pM_cardBody',
            children: jsx('div', { ref: hostRef, className: 'pM_cardHost' }),
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
      ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
        name: 'settings.plugin.item',
        id: 'prompt-manager',
        order: 90,
      }, PromptSettingsCard))
    }

    return exports
  },
})

