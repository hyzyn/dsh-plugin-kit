/* eslint-disable */
/**
 * @hyzyn/dsh-profile — 浏览器半体：官方设置 → 插件 里的「Profile 管理」卡片。
 * 通过核心 slots 服务注册到 settings.plugin.item 插槽。
 * 纯前端 DOM 面板，宿主经 /plugins/@hyzyn/dsh-profile/client.js 提供。
 */
window.__ModuleLoader__.load({
  id: '@hyzyn/dsh-profile',
  factory: (require) => {
    const exports = {}

    const React = require('react')
    const { jsx, jsxs } = require('react/jsx-runtime')

    /* ================================ CSS ================================ */

    const CSS = [
      '.pf_pluginCard{list-style:none;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;transition:border-color .16s,background .16s}',
      '.pf_pluginCard:hover{border-color:var(--dsw-alias-label-dimmed)}',
      '.pf_pluginCardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}',
      '.pf_cardHeader{appearance:none;width:100%;color:inherit;font:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;display:flex;align-items:center;gap:12px;padding:14px 16px}',
      '.pf_cardHeader:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.pf_cardHeadText{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}',
      '.pf_cardName{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:600}',
      '.pf_cardDescription{color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.pf_chevron{flex:none;color:var(--dsw-alias-label-tertiary);transition:transform .16s}',
      '.pf_pluginCardOpen .pf_chevron{transform:rotate(180deg)}',
      '.pf_cardBody{padding:2px 16px 16px}',
      '.pf_panel{display:flex;flex-direction:column;gap:12px;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);box-sizing:border-box}',
      '.pf_panelHeader{display:flex;align-items:center;gap:10px;flex:none}',
      '.pf_panelTitle{margin:0;font-size:15px;font-weight:700;white-space:nowrap;flex:1}',
      '.pf_subtitle{color:var(--dsw-alias-label-tertiary);font-size:11.5px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:360px}',
      '.pf_toolbar{display:flex;align-items:center;gap:8px;flex:none}',
      '.pf_btn{color:var(--dsw-alias-label-primary-foreground);background:var(--dsw-alias-button-info-fill);border:none;border-radius:8px;padding:6px 14px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}',
      '.pf_btn:hover:not(:disabled){background:var(--dsw-alias-button-info-hover)}',
      '.pf_btn:disabled{opacity:.5;cursor:default}',
      '.pf_btnGhost{color:var(--dsw-alias-label-primary);background:0 0;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:5px 12px;font-size:12px;cursor:pointer;white-space:nowrap}',
      '.pf_btnGhost:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
      '.pf_btnGhost:disabled{opacity:.45;cursor:default}',
      '.pf_btnDanger{color:var(--dsw-alias-state-error-primary)}',
      '.pf_list{display:flex;flex-direction:column;gap:8px;max-height:480px;overflow-y:auto}',
      '.pf_card{background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:6px}',
      '.pf_cardRow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.pf_cardName{font-weight:700;font-size:13.5px}',
      '.pf_cardSummary{color:var(--dsw-alias-label-secondary);font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}',
      '.pf_cardActions{display:flex;align-items:center;gap:6px;margin-left:auto;flex-wrap:wrap}',
      '.pf_badge{display:inline-block;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:1px 8px;font-size:11px;line-height:1.6;white-space:nowrap}',
      '.pf_badge[data-kind=ok]{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}',
      '.pf_badge[data-kind=warn]{color:var(--dsw-alias-state-warn-primary);border-color:var(--dsw-alias-state-warn-primary)}',
      '.pf_banner{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);border-radius:8px;padding:8px 12px;font-size:12.5px;line-height:1.5;overflow-wrap:anywhere;flex:none}',
      '.pf_banner[data-kind=error]{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}',
      '.pf_banner[data-kind=ok]{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}',
      '.pf_banner[data-kind=info]{color:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary)}',
      '.pf_busyOverlay{position:fixed;left:50%;bottom:80px;transform:translateX(-50%);z-index:2147483647;pointer-events:none;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);border-radius:10px;padding:10px 18px;font-size:13px;box-shadow:var(--dsw-shadow-lv3);max-width:80vw;text-align:center}',
      '.pf_empty,.pf_loading{text-align:center;color:var(--dsw-alias-label-tertiary);padding:24px 12px;font-size:12.5px}',
      '.pf_form{display:flex;flex-direction:column;gap:10px;border-top:1px solid var(--dsw-alias-border-l1);padding-top:12px}',
      '.pf_formTitle{font-weight:700;font-size:13px}',
      '.pf_formRow{display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
      '.pf_input{color:var(--dsw-alias-label-primary);background:var(--dsw-specific-input-major);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;outline:none;padding:6px 10px;font-family:inherit;font-size:13px;box-sizing:border-box;min-width:180px;flex:1}',
      '.pf_input:focus{border-color:var(--dsw-alias-state-business-primary)}',
      '.pf_input::placeholder{color:var(--dsw-alias-label-tertiary)}',
      '.pf_select{color:var(--dsw-alias-label-primary);background:var(--dsw-specific-input-major);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;outline:none;padding:5px 8px;font-family:inherit;font-size:12px}',
      '.pf_error{color:var(--dsw-alias-state-error-primary);font-size:12px;margin:0;white-space:pre-wrap}',
      '.pf_ok{color:var(--dsw-alias-state-success-primary);font-size:12px;margin:0}',
      '.pf_hint{color:var(--dsw-alias-label-tertiary);font-size:11.5px;line-height:1.5}',
    ].join('\n')

    let styleEl
    function ensureStyle() {
      if (document.getElementById('dsh-profile-style')) return
      styleEl = document.createElement('style')
      styleEl.id = 'dsh-profile-style'
      styleEl.textContent = CSS
      document.head.appendChild(styleEl)
    }

    /* ================================ API ================================ */

    const API = {
      list: '/api/dsh-profile/list',
      create: '/api/dsh-profile/create',
      duplicate: '/api/dsh-profile/duplicate',
      rename: '/api/dsh-profile/rename',
      port: '/api/dsh-profile/port',
      delete: '/api/dsh-profile/delete',
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
    const apiCreate = (name, template, port) => apiRequest(API.create, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, template, port }),
    })
    const apiDuplicate = (name, from) => apiRequest(API.duplicate, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, from }),
    })
    const apiRename = (name, newName) => apiRequest(API.rename, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, newName }),
    })
    const apiSetPort = (name, port) => apiRequest(API.port, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, port }),
    })


    const apiDelete = (name) => apiRequest(API.delete, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    })

    /* ================================ 面板状态 ================================ */

    const state = {
      profiles: [],
      home: '',
      profilesRoot: '',
      loading: false,
      busy: false,
      busyText: '',
      error: '',
      ok: '',
      newName: '',
      newTemplate: '',
      newPort: '',
      dupName: '',
      dupFrom: '',
    }

    let panelEl
    let toastEl
    let toastTimer
    let busyEl

    function toast(message, kind) {
      if (!toastEl) {
        toastEl = document.createElement('div')
        toastEl.className = 'pf_toast'
        document.body.appendChild(toastEl)
      }
      toastEl.textContent = message
      toastEl.dataset.kind = kind || 'info'
      toastEl.style.display = 'block'
      clearTimeout(toastTimer)
      toastTimer = setTimeout(() => {
        if (toastEl) toastEl.style.display = 'none'
      }, 2400)
    }


    function showBusy(message) {
      if (!busyEl) {
        busyEl = document.createElement('div')
        busyEl.className = 'pf_busyOverlay'
        document.body.appendChild(busyEl)
      }
      busyEl.textContent = message
      busyEl.style.display = 'block'
    }

    function hideBusy() {
      if (busyEl) {
        busyEl.style.display = 'none'
      }
    }

    async function load() {
      state.loading = true
      state.error = ''
      state.ok = ''
      renderAll(panelEl)
      try {
        const data = await apiList()
        state.profiles = data.profiles || []
        state.home = data.home || ''
        state.profilesRoot = data.profilesRoot || ''
      } catch (error) {
        state.error = error.message || String(error)
      } finally {
        state.loading = false
        renderAll(panelEl)
      }
    }

    async function run(action, successMessage, busyMessage) {
      if (state.busy) return
      state.busy = true
      state.busyText = busyMessage || '处理中…'
      state.error = ''
      state.ok = ''
      showBusy(state.busyText)
      renderAll(panelEl)
      try {
        await action()
        await load()
        state.ok = successMessage
      } catch (error) {
        state.error = error.message || String(error)
      } finally {
        state.busy = false
        state.busyText = ''
        hideBusy()
        renderAll(panelEl)
      }
    }

    /* ================================ 渲染 ================================ */

    const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESC_MAP[c])

    function renderProfiles() {
      if (state.loading) return '<div class="pf_loading">加载中…</div>'
      if (state.profiles.length === 0) return '<div class="pf_empty">还没有 profile，先创建一个吧。</div>'
      return '<div class="pf_list">' + state.profiles.map((profile) => {
        const status = profile.initialized
          ? '<span class="pf_badge" data-kind="ok">已初始化</span>'
          : '<span class="pf_badge" data-kind="warn">未初始化</span>'
        const bundles = Array.isArray(profile.bundles) && profile.bundles.length > 0
          ? esc(profile.bundles.join(', '))
          : '（无 bundle）'
        const deps = Object.keys(profile.dependencies || {}).length
        const portText = profile.port != null ? '端口 ' + profile.port : '未设端口'
        const launchCmd = 'dsh --profile ' + profile.name + (profile.port != null ? ' --port ' + profile.port : '')
        const protectedProfile = profile.name === 'web'
        const deleteButton = protectedProfile
          ? '<button class="pf_btnGhost pf_btnDanger" disabled title="默认 profile 不能删除">删除</button>'
          : '<button class="pf_btnGhost pf_btnDanger" data-action="delete" data-name="' + esc(profile.name) + '">删除</button>'
        return '<div class="pf_card">' +
          '<div class="pf_cardRow">' +
            '<span class="pf_cardName">' + esc(profile.name) + '</span>' +
            status +
            (protectedProfile ? '<span class="pf_badge" data-kind="warn">内置</span>' : '') +
            '<span class="pf_badge">' + esc(portText) + '</span>' +
            '<span class="pf_cardSummary">' + bundles + ' · ' + deps + ' 个依赖</span>' +
            '<span class="pf_cardActions">' +
              '<button class="pf_btnGhost" data-action="port" data-name="' + esc(profile.name) + '">端口</button>' +
              '<button class="pf_btnGhost" data-action="copy-command" data-name="' + esc(profile.name) + '">复制启动命令</button>' +
              '<button class="pf_btnGhost" data-action="rename" data-name="' + esc(profile.name) + '">重命名</button>' +
              '<button class="pf_btnGhost" data-action="dup" data-name="' + esc(profile.name) + '">复制</button>' +
              deleteButton +
            '</span>' +
          '</div>' +
          '<div class="pf_hint">' + esc(profile.dir) + (profile.patchExists ? '' : ' · 缺少 cordis.patch.yml') + '<br>启动: ' + esc(launchCmd) + '</div>' +
        '</div>'
      }).join('') + '</div>'
    }

    function renderPanel() {
      const options = state.profiles.map((profile) =>
        '<option value="' + esc(profile.name) + '">' + esc(profile.name) + '</option>',
      ).join('')
      return '<div class="pf_panel">' +
        '<div class="pf_panelHeader">' +
          '<h3 class="pf_panelTitle">Profile 管理</h3>' +
          '<span class="pf_subtitle">' + esc(state.profilesRoot || state.home + '/profiles') + '</span>' +
          '<span class="pf_toolbar"><button class="pf_btnGhost" id="pfRefresh">刷新</button></span>' +
        '</div>' +
        (state.error ? '<div class="pf_banner" data-kind="error">' + esc(state.error) + '</div>' : '') +
        (state.ok ? '<div class="pf_banner" data-kind="ok">' + esc(state.ok) + '</div>' : '') +
        (state.busy ? '<div class="pf_banner" data-kind="info">' + esc(state.busyText) + '</div>' : '') +
        renderProfiles() +
        '<div class="pf_form">' +
          '<div class="pf_formTitle">新建 profile</div>' +
          '<div class="pf_formRow">' +
            '<input class="pf_input" id="pfNewName" placeholder="名称，如 dev" value="' + esc(state.newName) + '">' +
            '<select class="pf_select" id="pfNewTemplate">' +
              '<option value="">基础模板（仅核心 / 自定义开发）</option>' +
              '<option value="web">web（base + web-app）</option>' +
              '<option value="headless">headless（base + headless）</option>' +
            '</select>' +
            '<input class="pf_input" id="pfNewPort" placeholder="端口（可选）" value="' + esc(state.newPort) + '">' +
            '<button class="pf_btn" id="pfCreate" ' + (state.busy ? 'disabled' : '') + '>创建</button>' +
          '</div>' +
        '</div>' +
        '<div class="pf_form">' +
          '<div class="pf_formTitle">复制 profile</div>' +
          '<div class="pf_formRow">' +
            '<select class="pf_select" id="pfDupFrom">' + (options || '<option value="">（先创建 profile）</option>') + '</select>' +
            '<input class="pf_input" id="pfDupName" placeholder="新名称，如 dev-copy" value="' + esc(state.dupName) + '">' +
            '<button class="pf_btn" id="pfDup" ' + (state.busy ? 'disabled' : '') + '>复制</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    }

    function renderAll(host) {
      if (!host) return
      host.innerHTML = renderPanel()
    }

    /* ================================ 事件 ================================ */

    function handleClick(event) {
      const target = event.target
      if (!target || !panelEl || !panelEl.contains(target)) return

      if (target.id === 'pfRefresh') {
        load()
        return
      }
      if (target.id === 'pfCreate') {
        const nameInput = document.getElementById('pfNewName')
        const templateSelect = document.getElementById('pfNewTemplate')
        const portInput = document.getElementById('pfNewPort')
        state.newName = nameInput ? nameInput.value.trim() : ''
        state.newTemplate = templateSelect ? templateSelect.value : ''
        state.newPort = portInput ? portInput.value.trim() : ''
        if (!state.newName) {
          state.error = '请输入 profile 名称'
          renderAll(panelEl)
          return
        }
        const name = state.newName
        const template = state.newTemplate
        const port = state.newPort === '' ? null : state.newPort
        run(() => apiCreate(name, template, port), '已创建 profile：' + name, '正在创建 profile…')
        return
      }
      if (target.id === 'pfDup') {
        const fromSelect = document.getElementById('pfDupFrom')
        const nameInput = document.getElementById('pfDupName')
        state.dupFrom = fromSelect ? fromSelect.value : ''
        state.dupName = nameInput ? nameInput.value.trim() : ''
        if (!state.dupFrom || !state.dupName) {
          state.error = '请选择源 profile 并填写新名称'
          renderAll(panelEl)
          return
        }
        const from = state.dupFrom
        const name = state.dupName
        run(() => apiDuplicate(name, from), '已复制 profile：' + name, '正在复制并安装依赖，请稍候…')
        return
      }
      const action = target.dataset && target.dataset.action
      const name = target.dataset && target.dataset.name
      if (action === 'dup') {
        state.dupFrom = name || ''
        state.dupName = (name || '') + '-copy'
        renderAll(panelEl)
        const fromSelect = document.getElementById('pfDupFrom')
        const nameInput = document.getElementById('pfDupName')
        if (fromSelect) fromSelect.value = state.dupFrom
        if (nameInput) nameInput.value = state.dupName
        return
      }
      if (action === 'port') {
        if (!name) return
        const profile = state.profiles.find((item) => item.name === name)
        const current = profile && profile.port != null ? String(profile.port) : ''
        const input = window.prompt('设置启动端口（留空清除，0 表示自动分配）：', current)
        if (input === null) return
        const port = input.trim() === '' ? null : input.trim()
        run(() => apiSetPort(name, port), '已更新端口：' + name, '正在设置端口…')
        return
      }
      if (action === 'copy-command') {
        if (!name) return
        const profile = state.profiles.find((item) => item.name === name)
        const port = profile && profile.port != null ? ' --port ' + profile.port : ''
        const cmd = 'dsh --profile ' + name + port
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(cmd).then(() => {
            toast('已复制：' + cmd, 'ok')
          }).catch(() => {
            window.prompt('复制启动命令', cmd)
          })
        } else {
          window.prompt('复制启动命令', cmd)
        }
        return
      }
      if (action === 'rename') {
        if (!name) return
        const newName = window.prompt('新的 profile 名称：', name)
        if (!newName || newName.trim() === '' || newName === name) return
        run(() => apiRename(name, newName.trim()), '已重命名 profile：' + newName.trim(), '正在重命名…')
        return
      }

      if (action === 'delete') {
        if (!name) return
        if (!window.confirm('确定删除 profile「' + name + '」？此操作不可撤销。')) return
        run(() => apiDelete(name), '已删除 profile：' + name, '正在删除…')
      }
    }

    function bindEvents() {
      document.addEventListener('click', handleClick, true)
    }

    /* ================================ 设置卡片（React 外壳） ================================ */

    const CHEVRON_PATH = 'M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 9.13382 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z'

    function ProfileSettingsCard() {
      const [open, setOpen] = React.useState(false)
      const hostRef = React.useRef(null)
      React.useEffect(() => {
        if (!open) return
        const host = hostRef.current
        if (host === null) return
        panelEl = host
        load()
      }, [open])
      return jsxs('li', {
        className: open ? 'pf_pluginCard pf_pluginCardOpen' : 'pf_pluginCard',
        children: [
          jsxs('button', {
            type: 'button',
            className: 'pf_cardHeader',
            'aria-expanded': open,
            onClick: () => setOpen((current) => !current),
            children: [
              jsxs('span', {
                className: 'pf_cardHeadText',
                children: [
                  jsx('span', { className: 'pf_cardName', children: 'Profile 管理' }),
                  jsx('span', { className: 'pf_cardDescription', children: '查看、创建、复制、重命名、删除、端口配置 DSH profile。' }),
                ],
              }),
              jsx('svg', {
                width: '14',
                height: '14',
                viewBox: '0 0 14 14',
                fill: 'none',
                xmlns: 'http://www.w3.org/2000/svg',
                className: 'pf_chevron',
                children: jsx('path', { d: CHEVRON_PATH, fill: 'currentColor' }),
              }),
            ],
          }),
          open ? jsx('div', {
            className: 'pf_cardBody',
            children: jsx('div', { ref: hostRef, className: 'pf_cardHost' }),
          }) : null,
        ],
      })
    }

    /* ================================ 插件入口 ================================ */

    exports.inject = ['slots']

    exports.apply = (ctx) => {
      ctx.effect(() => {
        ensureStyle()
        bindEvents()
        return () => {
          document.removeEventListener('click', handleClick, true)
          styleEl?.remove()
          styleEl = undefined
          toastEl?.remove()
          toastEl = undefined
          busyEl?.remove()
          busyEl = undefined
          panelEl = undefined
        }
      })
      ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
        name: 'settings.plugin.item',
        // settings.plugin.item 是 keyed 插槽：key 必须是该卡片所编辑的 settings 命名空间
        key: 'profile-manager',
        order: 95,
      }, ProfileSettingsCard))
    }

    return exports
  },
})
