/* eslint-disable */
/**
 * @hyzyn/dsh-codegraph — 浏览器半体：官方设置 → 插件 里的「Codegraph」卡片。
 * 通过核心 slots 服务注册到 settings.plugin.item 插槽。
 * 纯前端 React 卡片，宿主经 /plugins/@hyzyn/dsh-codegraph/client.js 提供。
 */
window.__ModuleLoader__.load({
  id: '@hyzyn/dsh-codegraph',
  factory: (require) => {
    const exports = {}

    const React = require('react')
    const { jsx, jsxs } = require('react/jsx-runtime')

    /* ================================ CSS ================================ */

    const CSS = [
      '.cg_pluginCard{list-style:none;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;transition:border-color .16s,background .16s}',
      '.cg_pluginCard:hover{border-color:var(--dsw-alias-label-dimmed)}',
      '.cg_pluginCardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}',
      '.cg_cardHeader{appearance:none;width:100%;color:inherit;font:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;display:flex;align-items:center;gap:12px;padding:14px 16px}',
      '.cg_cardHeader:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.cg_cardHeadText{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}',
      '.cg_cardName{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:600}',
      '.cg_cardDescription{color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.cg_chevron{flex:none;color:var(--dsw-alias-label-tertiary);transition:transform .16s}',
      '.cg_pluginCardOpen .cg_chevron{transform:rotate(180deg)}',
      '.cg_cardBody{padding:2px 16px 16px}',
      '.cg_panel{display:flex;flex-direction:column;gap:12px;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);box-sizing:border-box}',
      '.cg_panelHeader{display:flex;align-items:center;gap:10px;flex:none;flex-wrap:wrap}',
      '.cg_panelTitle{margin:0;font-size:15px;font-weight:700;white-space:nowrap;flex:1}',
      '.cg_subtitle{color:var(--dsw-alias-label-tertiary);font-size:11.5px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:360px}',
      '.cg_toolbar{display:flex;align-items:center;gap:8px;flex:none;flex-wrap:wrap}',
      '.cg_toolbarSpacer{flex:1}',
      '.cg_btn{color:var(--dsw-alias-label-primary-foreground);background:var(--dsw-alias-button-info-fill);border:none;border-radius:8px;padding:6px 14px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}',
      '.cg_btn:hover:not(:disabled){background:var(--dsw-alias-button-info-hover)}',
      '.cg_btn:disabled{opacity:.5;cursor:default}',
      '.cg_btnGhost{color:var(--dsw-alias-label-primary);background:0 0;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:5px 12px;font-size:12px;cursor:pointer;white-space:nowrap}',
      '.cg_btnGhost:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
      '.cg_input{color:var(--dsw-alias-label-primary);background:var(--dsw-specific-input-major);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;outline:none;padding:6px 10px;font-family:inherit;font-size:13px;box-sizing:border-box;width:100%}',
      '.cg_input:focus{border-color:var(--dsw-alias-state-business-primary)}',
      '.cg_input::placeholder{color:var(--dsw-alias-label-tertiary)}',
      '.cg_row{display:grid;grid-template-columns:minmax(120px,1fr) minmax(160px,2fr) auto;gap:8px;align-items:center}',
      '.cg_list{display:flex;flex-direction:column;gap:8px;max-height:360px;overflow-y:auto}',
      '.cg_item{background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:8px 10px;cursor:pointer;font-size:12.5px}',
      '.cg_item:hover{border-color:var(--dsw-alias-label-dimmed)}',
      '.cg_itemName{font-weight:600;color:var(--dsw-alias-label-primary)}',
      '.cg_itemMeta{color:var(--dsw-alias-label-tertiary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;margin-top:2px}',
      '.cg_pre{background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:10px;max-height:320px;overflow:auto;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;white-space:pre-wrap;word-break:break-all;color:var(--dsw-alias-label-primary)}',
      '.cg_empty,.cg_loading{text-align:center;color:var(--dsw-alias-label-tertiary);padding:24px 12px;font-size:12.5px}',
      '.cg_error{color:var(--dsw-alias-state-error-primary);font-size:12px;margin:0;white-space:pre-wrap}',
      '.cg_ok{color:var(--dsw-alias-state-success-primary);font-size:12px;margin:0}',
      '.cg_sectionTitle{margin:0;font-size:13px;font-weight:700;color:var(--dsw-alias-label-secondary)}',
      '.cg_mcpRow{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
      '.cg_mcpMeta{color:var(--dsw-alias-label-tertiary);font-size:11.5px;line-height:1.5;min-width:0}',
    ].join('\n')

    let styleEl
    function ensureStyle() {
      if (document.getElementById('dsh-codegraph-style')) return
      styleEl = document.createElement('style')
      styleEl.id = 'dsh-codegraph-style'
      styleEl.textContent = CSS
      document.head.appendChild(styleEl)
    }

    /* ================================ API ================================ */

    async function api(path, options) {
      const response = await fetch(path, options)
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || ('HTTP ' + response.status))
      }
      return data
    }

    const qs = (params) => {
      const search = new URLSearchParams()
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
      }
      const text = search.toString()
      return text ? ('?' + text) : ''
    }

    /* ======================== 运行时会话引用 ======================== */

    // apply 时注入的 sessions 服务（浏览器运行时全局 store，非 React 内部状态）。
    // 用于读取「当前活动会话的工作目录」，让 Codegraph 默认跟随当前项目，
    // 而不是钉死在宿主启动目录（process.cwd()）。
    let sessionsService = null

    /* ================================ 设置卡片 ================================ */

    const CHEVRON_PATH = 'M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 9.13382 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z'

    function CodegraphSettingsCard() {
      const [open, setOpen] = React.useState(false)
      const [path, setPath] = React.useState('')
      const [manual, setManual] = React.useState(false)
      const [status, setStatus] = React.useState(null)
      const [query, setQuery] = React.useState('')
      const [results, setResults] = React.useState([])
      const [selected, setSelected] = React.useState(null)
      const [detail, setDetail] = React.useState(null)
      const [error, setError] = React.useState('')
      const [ok, setOk] = React.useState('')
      const [loading, setLoading] = React.useState(false)
      const [mcp, setMcp] = React.useState(null)
      const [settingDefault, setSettingDefault] = React.useState(false)

      // 当前活动会话的工作目录（随会话切换实时更新；无活动会话时为 ''）。
      const currentCwd = React.useSyncExternalStore(
        (subscribe) => sessionsService.list.subscribe(subscribe),
        () => {
          const snapshot = sessionsService.list.getSnapshot()
          const cwd = snapshot.byId[snapshot.current]?.cwd
          return typeof cwd === 'string' && cwd !== '' ? cwd : ''
        },
      )

      // 有效路径：手动编辑过就用手动值（清空则回落后端默认）；
      // 未编辑过则跟随当前活动会话的工作目录。
      const effectivePath = path !== '' ? path : (manual ? '' : currentCwd)

      const loadMcpStatus = React.useCallback(async () => {
        try {
          const data = await api('/api/dsh-codegraph/default-path')
          setMcp(data.mcp || null)
        } catch {
          setMcp(null)
        }
      }, [])

      const loadStatus = React.useCallback(async () => {
        setLoading(true)
        setError('')
        setOk('')
        try {
          const data = await api('/api/dsh-codegraph/status' + qs({ path: effectivePath }))
          setStatus(data.status || data)
          if (!manual && !currentCwd) setPath(data.path || '')
        } catch (err) {
          setError(err.message)
        } finally {
          setLoading(false)
        }
      }, [effectivePath, manual, currentCwd])

      React.useEffect(() => {
        if (open) {
          loadStatus()
          loadMcpStatus()
        }
      }, [open, loadStatus, loadMcpStatus])

      // 跟随当前项目：打开卡片或切换会话时，若用户未手动编辑过路径，
      // 自动采用当前活动会话的工作目录；手动编辑后停止跟随。
      React.useEffect(() => {
        if (!open || manual) return
        setPath(currentCwd)
      }, [open, manual, currentCwd])

      const search = async () => {
        if (!query.trim()) return
        setLoading(true)
        setError('')
        setOk('')
        setSelected(null)
        setDetail(null)
        try {
          const data = await api('/api/dsh-codegraph/query' + qs({ q: query.trim(), path: effectivePath, limit: 20 }))
          setResults(Array.isArray(data.results) ? data.results : [])
        } catch (err) {
          setError(err.message)
        } finally {
          setLoading(false)
        }
      }

      const loadSymbol = async (name) => {
        setLoading(true)
        setError('')
        setOk('')
        setSelected(name)
        try {
          const [node, callers, callees, impact] = await Promise.all([
            api('/api/dsh-codegraph/node' + qs({ name, path: effectivePath })),
            api('/api/dsh-codegraph/callers' + qs({ symbol: name, path: effectivePath })),
            api('/api/dsh-codegraph/callees' + qs({ symbol: name, path: effectivePath })),
            api('/api/dsh-codegraph/impact' + qs({ symbol: name, path: effectivePath, depth: 2 })),
          ])
          setDetail({ node, callers, callees, impact })
        } catch (err) {
          setError(err.message)
        } finally {
          setLoading(false)
        }
      }

      const runAction = async (action) => {
        setLoading(true)
        setError('')
        setOk('')
        try {
          const data = await api('/api/dsh-codegraph/' + action, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ path: effectivePath }),
          })
          setOk((action === 'sync' ? '已同步' : '已重建') + '：' + (data.output || '').slice(0, 200))
          await loadStatus()
        } catch (err) {
          setError(err.message)
        } finally {
          setLoading(false)
        }
      }

      // 把当前有效路径设为默认项目：宿主会持久化并热切换 codegraph MCP 服务器
      const setDefaultProject = async () => {
        if (!effectivePath) return
        setSettingDefault(true)
        setError('')
        setOk('')
        try {
          const data = await api('/api/dsh-codegraph/default-path', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ path: effectivePath }),
          })
          setMcp(data.mcp || null)
          setOk('已把默认项目切到 ' + (data.defaultPath || effectivePath) + (data.persisted === false ? '（本次会话内生效）' : '') + '，codegraph MCP 服务器将热切换。')
        } catch (err) {
          setError(err.message)
        } finally {
          setSettingDefault(false)
        }
      }

      const mcpText = React.useMemo(() => {
        if (!mcp) return 'MCP：状态未知'
        if (mcp.mode === 'own') return 'MCP：已托管（本插件维护工作目录）· cwd ' + (mcp.cwd || '(未设置)') + (mcp.disabled ? ' · 已停用' : '')
        if (mcp.mode === 'dsh-mcp') return 'MCP：已对齐 MCP 卡片里的行 · cwd ' + (mcp.cwd || '(未设置)') + (mcp.disabled ? ' · 已停用' : '')
        if (mcp.mode === 'external') return 'MCP：检测到手工配置行，插件不接管'
        return 'MCP：' + (mcp.note || '未托管')
      }, [mcp])

      const statusText = status ? JSON.stringify(status, null, 2) : ''

      return jsxs('li', {
        className: open ? 'cg_pluginCard cg_pluginCardOpen' : 'cg_pluginCard',
        children: [
          jsxs('button', {
            type: 'button',
            className: 'cg_cardHeader',
            'aria-expanded': open,
            onClick: () => setOpen((current) => !current),
            children: [
              jsxs('span', {
                className: 'cg_cardHeadText',
                children: [
                  jsx('span', { className: 'cg_cardName', children: 'Codegraph' }),
                  jsx('span', { className: 'cg_cardDescription', children: '代码图谱：索引状态、符号搜索、callers/callees/impact、一键 sync/index。' }),
                ],
              }),
              jsx('svg', {
                width: '14',
                height: '14',
                viewBox: '0 0 14 14',
                fill: 'none',
                xmlns: 'http://www.w3.org/2000/svg',
                className: 'cg_chevron',
                children: jsx('path', { d: CHEVRON_PATH, fill: 'currentColor' }),
              }),
            ],
          }),
          open ? jsx('div', {
            className: 'cg_cardBody',
            children: jsxs('div', {
              className: 'cg_panel',
              children: [
                jsxs('div', {
                  className: 'cg_panelHeader',
                  children: [
                    jsx('span', { className: 'cg_panelTitle', children: 'Codegraph 控制台' }),
                    jsx('div', { className: 'cg_toolbarSpacer' }),
                    jsx('button', {
                      type: 'button',
                      className: 'cg_btnGhost',
                      disabled: loading,
                      onClick: loadStatus,
                      children: '刷新状态',
                    }),
                    jsx('button', {
                      type: 'button',
                      className: 'cg_btnGhost',
                      disabled: loading,
                      onClick: () => runAction('sync'),
                      children: 'Sync',
                    }),
                    jsx('button', {
                      type: 'button',
                      className: 'cg_btnGhost',
                      disabled: loading,
                      onClick: () => runAction('index'),
                      children: '重建索引',
                    }),
                  ],
                }),
                jsx('div', {
                  className: 'cg_row',
                  children: [
                    jsx('input', {
                      className: 'cg_input',
                      placeholder: '项目路径（留空使用默认）',
                      value: path,
                      onChange: (event) => {
                        const value = event.target.value
                        setManual(value !== '')
                        setPath(value)
                      },
                    }),
                    jsx('input', {
                      className: 'cg_input',
                      placeholder: '搜索符号，例如 definePlugin',
                      value: query,
                      onChange: (event) => setQuery(event.target.value),
                      onKeyDown: (event) => { if (event.key === 'Enter') search() },
                    }),
                    jsx('button', {
                      type: 'button',
                      className: 'cg_btn',
                      disabled: loading || !query.trim(),
                      onClick: search,
                      children: '搜索',
                    }),
                  ],
                }),
                loading ? jsx('div', { className: 'cg_loading', children: '加载中…' }) : null,
                jsxs('div', {
                  className: 'cg_mcpRow',
                  children: [
                    jsx('button', {
                      type: 'button',
                      className: 'cg_btnGhost',
                      disabled: settingDefault || loading || !effectivePath,
                      title: '把当前路径持久化为默认项目，codegraph MCP 服务器的工作目录随之热切换',
                      onClick: setDefaultProject,
                      children: '设为默认项目',
                    }),
                    jsx('span', { className: 'cg_mcpMeta', children: mcpText }),
                  ],
                }),
                error ? jsx('p', { className: 'cg_error', children: error }) : null,
                ok ? jsx('p', { className: 'cg_ok', children: ok }) : null,
                status ? jsx('pre', { className: 'cg_pre', children: statusText }) : null,
                results.length > 0 ? jsxs('div', {
                  className: 'cg_list',
                  children: [
                    jsx('p', { className: 'cg_sectionTitle', children: '搜索结果' }),
                    results.map((item, index) => {
                      const node = item && item.node ? item.node : item
                      return jsxs('div', {
                        className: 'cg_item',
                        key: 'cg-result-' + index,
                        onClick: () => loadSymbol(node.qualifiedName || node.name),
                        children: [
                          jsx('div', { className: 'cg_itemName', children: node.qualifiedName || node.name || '(unnamed)' }),
                          jsx('div', { className: 'cg_itemMeta', children: (node.kind || '') + ' · ' + (node.filePath || '') + ':' + (node.startLine || '') }),
                        ],
                      })
                    }),
                  ],
                }) : null,
                selected ? jsxs('div', {
                  className: 'cg_panel',
                  children: [
                    jsx('p', { className: 'cg_sectionTitle', children: '符号详情：' + selected }),
                    detail ? jsx('pre', { className: 'cg_pre', children: JSON.stringify(detail, null, 2) }) : null,
                  ],
                }) : null,
              ],
            }),
          }) : null,
        ],
      })
    }

    /* ================================ 插件入口 ================================ */

    exports.inject = ['slots', 'sessions']

    exports.apply = (ctx) => {
      sessionsService = ctx.sessions
      ctx.effect(() => {
        ensureStyle()
        return () => {
          styleEl?.remove()
          styleEl = undefined
        }
      })
      ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
        name: 'settings.plugin.item',
        // settings.plugin.item 是 keyed 插槽：key 必须是该卡片所编辑的 settings 命名空间
        key: 'codegraph',
        order: 120,
      }, CodegraphSettingsCard))
    }

    return exports
  },
})
