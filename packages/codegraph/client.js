/* eslint-disable */
/**
 * @hyzyn/dsh-codegraph — 浏览器半体：官方设置 → 插件 里的「Codegraph」卡片。
 * 通过核心 slots 服务注册到 settings.plugin.item 插槽。
 * 纯前端 React 卡片，宿主经 client-modules 的 combo 路由（/plugins/??<id>/client.js&rev=…）
 * 按 boot graph 下发的 URL 提供；单包直链 /plugins/@hyzyn/dsh-codegraph/client.js 在
 * 当前 DSH（0.1.5-rc.2）上不再直接可用。
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
      '.dshkit_badge{flex:none;margin-left:auto;padding:1px 8px;border-radius:999px;font-size:11px;font-weight:600;line-height:16px;letter-spacing:.02em;color:var(--dsw-alias-label-dimmed);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1)}',
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
      '.cg_grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px}',
      '.cg_cell{background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:8px 10px;min-width:0}',
      '.cg_k{color:var(--dsw-alias-label-tertiary);font-size:11px;letter-spacing:.02em}',
      '.cg_v{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600;margin-top:3px;overflow-wrap:anywhere}',
      '.cg_vMono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;font-weight:500}',
      '.cg_badgeOk{color:var(--dsw-alias-state-success-primary)}',
      '.cg_badgeWarn{color:var(--dsw-alias-state-warning-primary,var(--dsw-alias-state-error-primary))}',
      '.cg_details{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-2)}',
      '.cg_details>summary{cursor:pointer;padding:7px 10px;font-size:12px;color:var(--dsw-alias-label-secondary);list-style:none}',
      '.cg_details>summary::-webkit-details-marker{display:none}',
      '.cg_details>summary::before{content:"▸ ";color:var(--dsw-alias-label-tertiary)}',
      '.cg_details[open]>summary::before{content:"▾ "}',
      '.cg_details .cg_pre{border:0;border-top:1px solid var(--dsw-alias-border-l1);border-radius:0 0 9px 9px;max-height:260px;margin:0}',
      '.cg_rel{display:flex;flex-direction:column;gap:4px}',
      '.cg_relItem{display:flex;gap:8px;align-items:baseline;font-size:12px;min-width:0}',
      '.cg_relName{color:var(--dsw-alias-label-primary);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.cg_relMeta{color:var(--dsw-alias-label-tertiary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.cg_mcpRow{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
      '.cg_mcpMeta{color:var(--dsw-alias-label-tertiary);font-size:11.5px;line-height:1.5;min-width:0}',
      '.cg_warn{color:var(--dsw-alias-state-warning-primary,var(--dsw-alias-state-error-primary));font-size:12px;line-height:1.55;margin:0;white-space:pre-wrap}',
      '.cg_checks{display:flex;align-items:center;gap:16px;flex-wrap:wrap;font-size:12.5px;color:var(--dsw-alias-label-secondary)}',
      '.cg_check{display:inline-flex;align-items:center;gap:6px;cursor:pointer}',
      '.cg_check input{cursor:pointer}',
      '.cg_check[data-off="1"]{opacity:.55;cursor:default}',
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

    /** 本地化数字；非有限值回落到占位符。 */
    const fmtNum = (value) => (typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString() : '—')

    /** 字节数 → B/kB/MB/GB。 */
    const fmtBytes = (value) => {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '—'
      const units = ['B', 'kB', 'MB', 'GB', 'TB']
      let size = value
      let unit = 0
      while (size >= 1000 && unit < units.length - 1) {
        size /= 1000
        unit += 1
      }
      return (unit === 0 ? String(Math.round(size)) : size.toFixed(size >= 100 ? 0 : 1)) + ' ' + units[unit]
    }

    /** ISO 时间 → 本地时间；解析不出来就原样返回。 */
    const fmtTime = (value) => {
      if (typeof value !== 'string' || value === '') return '—'
      const parsed = Date.parse(value)
      return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : value
    }

    /** 一个「标签 + 值」的单元格。 */
    const cell = (key, value, options) => jsxs('div', {
      className: 'cg_cell',
      children: [
        jsx('div', { className: 'cg_k', children: key }),
        jsx('div', {
          className: (options && options.mono ? 'cg_v cg_vMono' : 'cg_v') + (options && options.tone ? ' ' + options.tone : ''),
          title: options && options.title ? options.title : undefined,
          children: value,
        }),
      ],
    }, 'cell-' + key)

    /**
     * 索引状态：按 CLI `status --json` 的字段铺成紧凑网格。
     * 形状不符（JSON 解析失败时的 `{raw}`、或 CLI 报错文本）才回落到原始文本。
     */
    const statusCells = (status) => {
      const pending = status.pendingChanges && typeof status.pendingChanges === 'object' ? status.pendingChanges : {}
      return [
        cell('状态', status.initialized ? '● 已索引' : '○ 未初始化', { tone: status.initialized ? 'cg_badgeOk' : 'cg_badgeWarn' }),
        cell('版本', String(status.version ?? '—'), { mono: true }),
        cell('项目', String(status.projectPath ?? '—'), { mono: true, title: status.projectPath }),
        cell('规模', fmtNum(status.fileCount) + ' 文件 · ' + fmtNum(status.nodeCount) + ' 符号 · ' + fmtNum(status.edgeCount) + ' 边'),
        cell('最后索引', fmtTime(status.lastIndexed)),
        cell('待同步', '+' + fmtNum(pending.added ?? 0) + ' ~' + fmtNum(pending.modified ?? 0) + ' -' + fmtNum(pending.removed ?? 0)),
        cell('语言', Array.isArray(status.languages) && status.languages.length > 0 ? status.languages.join(' / ') : '—'),
        cell('索引库', fmtBytes(status.dbSizeBytes), { mono: true }),
      ]
    }

    /** 关系列表（callers / callees / affected 共用）。 */
    const relList = (title, items, emptyText) => jsxs('div', {
      children: [
        jsx('p', { className: 'cg_sectionTitle', children: title }),
        items.length === 0
          ? jsx('div', { className: 'cg_itemMeta', children: emptyText })
          : jsx('div', {
            className: 'cg_rel',
            children: items.slice(0, 30).map((item, index) => jsxs('div', {
              className: 'cg_relItem',
              children: [
                jsx('span', { className: 'cg_relName', children: item.name || '(unnamed)' }),
                jsx('span', { className: 'cg_relMeta', children: (item.kind || '') + ' · ' + (item.filePath || '') + (item.startLine ? ':' + item.startLine : '') }),
              ],
            }, 'rel-' + title + '-' + index)),
          }),
      ],
    })

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
      // GET /default-path 的索引态：默认项目（= 托管 MCP 的 cwd）是否真是有效索引。
      // 只看 mcp.mode 会把「已对齐一个非项目目录」显示成一切正常。
      const [defaultInfo, setDefaultInfo] = React.useState(null)
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
          setDefaultInfo({
            defaultPath: typeof data.defaultPath === 'string' ? data.defaultPath : '',
            indexed: data.indexed === true,
            indexState: typeof data.indexState === 'string' ? data.indexState : '',
            // 提示词注入开关（settings 命名空间里的真值）+ CLI 探测结果
            // （undefined = 宿主还没探测完，此时不提示不可用）。
            announceToAgent: data.announceToAgent === true,
            usageGuidance: data.usageGuidance === true,
            cliAvailable: data.cliAvailable,
            command: typeof data.command === 'string' ? data.command : '',
            followSession: data.followSession === true,
            effectivePath: typeof data.effectivePath === 'string' ? data.effectivePath : '',
            sessionPath: typeof data.sessionPath === 'string' ? data.sessionPath : '',
          })
        } catch {
          setMcp(null)
          setDefaultInfo(null)
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
          setOk('已把默认项目切到 ' + (data.defaultPath || effectivePath) + (data.persisted === false ? '（本次会话内生效）' : '') + '，并关闭「跟随当前项目」；codegraph MCP 服务器将热切换。')
          await loadMcpStatus()
        } catch (err) {
          setError(err.message)
        } finally {
          setSettingDefault(false)
        }
      }

      // 提示词注入开关：写 settings 命名空间（宿主即时增删 systemPrompt section，
      // 不需要重启）；CLI 探测失败时禁用——那时候两段本来就不会注入。
      const toggleSetting = async (key, value) => {
        setError('')
        setOk('')
        try {
          await api('/api/dsh-codegraph/settings', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ [key]: value }),
          })
          await loadMcpStatus()
          setOk({
            announceToAgent: '能力公告已更新',
            usageGuidance: '使用指引已更新',
            followSession: value ? '已开启跟随当前项目' : '已关闭跟随，托管行使用默认项目',
          }[key] || '设置已更新')
        } catch (err) {
          setError(err.message)
          await loadMcpStatus()
        }
      }

      const mcpText = React.useMemo(() => {
        if (!mcp) return 'MCP：状态未知'
        // 所有模式都带上宿主给的 note：未索引 / 手工行 / 联动关闭这些「没有托管」的
        // 情况必须说出来，否则「已对齐 cwd」看起来像一切正常。
        const note = mcp.note ? ' · ' + mcp.note : ''
        const following = defaultInfo && defaultInfo.followSession && defaultInfo.sessionPath && defaultInfo.sessionPath !== defaultInfo.defaultPath
          ? ' · 跟随会话 ' + defaultInfo.sessionPath
          : ''
        if (mcp.mode === 'own') return 'MCP：已托管（本插件维护工作目录）· cwd ' + (mcp.cwd || '(未设置)') + (mcp.disabled ? ' · 已停用' : '') + following + note
        if (mcp.mode === 'dsh-mcp') return 'MCP：已对齐 MCP 卡片里的行 · cwd ' + (mcp.cwd || '(未设置)') + (mcp.disabled ? ' · 已停用' : '') + following + note
        if (mcp.mode === 'external') return 'MCP：检测到手工配置行，插件不接管'
        return 'MCP：' + (mcp.note || '未托管')
      }, [mcp, defaultInfo])

      // 托管行实际用的目录不是有效索引时必须点名：MCP 服务器以它为 cwd，未加载项目时
      // codegraph_* 工具会要求显式传 projectPath（家目录最常见——~/.codegraph 是
      // codegraph CLI 自己的安装目录，插件不认它之后这里就会报警）。
      const defaultWarning = React.useMemo(() => {
        if (!defaultInfo || defaultInfo.indexed) return ''
        const why = defaultInfo.indexState === 'not-a-project'
          ? '它的 .codegraph/ 里没有索引库，不是 codegraph 项目（家目录最常见：~/.codegraph 是 CLI 自身的安装目录）'
          : '它没有 .codegraph/ 索引'
        const shown = defaultInfo.effectivePath || defaultInfo.defaultPath || '(未设置)'
        const source = defaultInfo.followSession && defaultInfo.sessionPath === shown
          ? '（来自当前会话）'
          : '（来自默认项目）'
        const fix = status && status.initialized === true && effectivePath && effectivePath !== shown
          ? '当前路径 ' + effectivePath + ' 已是有效索引，点「设为默认项目」即可修复。'
          : '把默认项目切到已索引目录即可自动挂载。'
        return '⚠ 托管行用的目录 ' + shown + source + ' 不是有效索引：' + why + '。未加载项目的 codegraph_* 工具需要显式传 projectPath；' + fix
      }, [defaultInfo, status, effectivePath])

      const cliWarning = defaultInfo && defaultInfo.cliAvailable === false
        ? '⚠ 探测不到可执行的 CLI 命令 ' + (defaultInfo.command || 'codegraph') + '（`--version` 失败）：systemPrompt 的能力公告与使用指引都不会注入，卡片里的状态 / 搜索 / sync / 重建索引也会报错。'
          + '常见原因是宿主没有继承 shell 的 PATH（从 Dock / 开始菜单启动时）——把插件配置里的 command 写成该 CLI 的绝对路径即可；已装好 CLI 时刷新本卡片重试。'
        : ''

      // 状态区：能识别的 status 形状就铺成网格，否则回落到原始文本（CLI 报错时 status 可能是 {raw}）
      const statusIsStructured = status !== null && typeof status === 'object' && typeof status.initialized === 'boolean'
      const statusRawText = status
        ? JSON.stringify(status, null, 2)
        : ''

      /** callers / callees / impact 取列表（形状随 CLI 版本可能稍有差异，取不到就当空）。 */
      const relItems = (value, key) => {
        const list = value && value[key]
        return Array.isArray(list) ? list : []
      }

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
              jsx('span', { className: 'dshkit_badge', children: 'Kit' }),
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
                      title: '把当前路径持久化为默认项目（同时关闭「跟随当前项目」，避免被会话切换顶掉），codegraph MCP 服务器的工作目录随之热切换',
                      onClick: setDefaultProject,
                      children: '设为默认项目',
                    }),
                    jsx('span', { className: 'cg_mcpMeta', children: mcpText }),
                  ],
                }),
                jsxs('div', {
                  className: 'cg_checks',
                  children: [
                    jsx('label', {
                      className: 'cg_check',
                      title: '开启后：会话切到某个已索引项目时，MCP 托管行的 cwd 自动对齐它；会话目录没有索引时回落到默认项目。「设为默认项目」会关掉它（那是一次显式指定）',
                      children: [
                        jsx('input', {
                          type: 'checkbox',
                          checked: defaultInfo ? defaultInfo.followSession === true : false,
                          disabled: !defaultInfo,
                          onChange: (event) => toggleSetting('followSession', event.target.checked),
                        }),
                        '跟随当前项目',
                      ],
                    }),
                    jsx('label', {
                      className: 'cg_check',
                      'data-off': !defaultInfo || defaultInfo.cliAvailable !== true ? '1' : undefined,
                      title: defaultInfo && defaultInfo.cliAvailable === true
                        ? '向 agent 注入本插件的能力公告（一段中文提示，告诉模型有这张卡片）'
                        : 'codegraph CLI 不可用，公告不会注入',
                      children: [
                        jsx('input', {
                          type: 'checkbox',
                          checked: defaultInfo ? defaultInfo.announceToAgent === true : false,
                          disabled: !defaultInfo || defaultInfo.cliAvailable !== true,
                          onChange: (event) => toggleSetting('announceToAgent', event.target.checked),
                        }),
                        '向 agent 公告能力',
                      ],
                    }),
                    jsx('label', {
                      className: 'cg_check',
                      'data-off': !defaultInfo || defaultInfo.cliAvailable !== true ? '1' : undefined,
                      title: defaultInfo && defaultInfo.cliAvailable === true
                        ? '注入 CodeGraph 使用指引（CODEGRAPH_START 区块：何时优先用 codegraph、失败怎么兜底）'
                        : 'codegraph CLI 不可用，使用指引不会注入',
                      children: [
                        jsx('input', {
                          type: 'checkbox',
                          checked: defaultInfo ? defaultInfo.usageGuidance === true : false,
                          disabled: !defaultInfo || defaultInfo.cliAvailable !== true,
                          onChange: (event) => toggleSetting('usageGuidance', event.target.checked),
                        }),
                        '注入使用指引',
                      ],
                    }),
                  ],
                }),
                error ? jsx('p', { className: 'cg_error', children: error }) : null,
                cliWarning ? jsx('p', { className: 'cg_warn', children: cliWarning }) : null,
                defaultWarning ? jsx('p', { className: 'cg_warn', children: defaultWarning }) : null,
                ok ? jsx('p', { className: 'cg_ok', children: ok }) : null,
                status
                  ? statusIsStructured
                    ? jsxs('div', {
                      children: [
                        jsx('div', { className: 'cg_grid', children: statusCells(status) }),
                        status.initialized === false
                          ? jsx('p', { className: 'cg_mcpMeta', children: '该目录还没有索引：在项目根运行 `codegraph init` 之后回到本卡片刷新（插件不会替你初始化）。' })
                          : null,
                        statusRawText !== ''
                          ? jsxs('details', {
                            className: 'cg_details',
                            children: [
                              jsx('summary', { children: '原始 JSON（status --json）' }),
                              jsx('pre', { className: 'cg_pre', children: statusRawText }),
                            ],
                          })
                          : null,
                      ],
                    })
                    : jsx('pre', { className: 'cg_pre', children: statusRawText })
                  : null,
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
                selected
                  ? jsxs('div', {
                    className: 'cg_panel',
                    children: [
                      jsx('p', { className: 'cg_sectionTitle', children: '符号详情：' + selected }),
                      detail
                        ? jsxs('div', {
                          children: [
                            // node 侧返回的是带行号的 markdown 源码/调用轨迹（不是 JSON），直接按文本显示
                            typeof detail.node?.node === 'string' && detail.node.node.trim() !== ''
                              ? jsx('pre', { className: 'cg_pre', children: detail.node.node })
                              : null,
                            relList('调用者 (callers)', relItems(detail.callers?.callers, 'callers'), '没有调用者'),
                            relList('被调用 (callees)', relItems(detail.callees?.callees, 'callees'), '没有下游调用'),
                            jsxs('div', {
                              children: [
                                jsx('p', {
                                  className: 'cg_sectionTitle',
                                  children: '影响面 (impact) · ' + fmtNum(detail.impact?.impact?.nodeCount) + ' 个节点 / ' + fmtNum(detail.impact?.impact?.edgeCount) + ' 条边',
                                }),
                                relList('受影响符号', relItems(detail.impact?.impact?.affected, 'affected'), '没有受影响的符号'),
                              ],
                            }),
                            jsxs('details', {
                              className: 'cg_details',
                              children: [
                                jsx('summary', { children: '原始 JSON（node / callers / callees / impact）' }),
                                jsx('pre', { className: 'cg_pre', children: JSON.stringify(detail, null, 2) }),
                              ],
                            }),
                          ],
                        })
                        : null,
                    ],
                  })
                  : null,
              ],
            }),
          }) : null,
        ],
      })
    }

    /* ============================ 活动会话上报 ============================ */

    /**
     * 把当前活动会话的工作目录报给宿主，让宿主把 MCP 托管行的 cwd 对齐过去。
     *
     * 为什么放在 apply 而不是卡片里：卡片只在设置面板展开时挂载，而「跟着当前项目走」
     * 必须在这之前就成立。客户端半体在页面加载时就跑 apply，所以订阅会话列表放在这里。
     * 连续切换（打开会话 → 切项目）用 400ms 合并，只在取值变化时发一次请求。
     */
    function installSessionReporter(ctx) {
      let lastSent = null
      let timer = null
      let disposed = false

      const readCwd = () => {
        try {
          const snapshot = sessionsService?.list?.getSnapshot?.()
          const cwd = snapshot?.byId?.[snapshot?.current]?.cwd
          return typeof cwd === 'string' ? cwd : ''
        } catch {
          return ''
        }
      }

      const report = async () => {
        const cwd = readCwd()
        if (disposed || cwd === lastSent) return
        lastSent = cwd
        try {
          await fetch('/api/dsh-codegraph/follow', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ path: cwd }),
          })
        } catch (error) {
          console.warn('[dsh-codegraph] 上报活动会话目录失败：' + (error instanceof Error ? error.message : String(error)))
        }
      }

      const schedule = () => {
        if (disposed) return
        if (timer !== null) clearTimeout(timer)
        timer = setTimeout(() => {
          timer = null
          void report()
        }, 400)
      }

      ctx.effect(() => {
        const subscribe = sessionsService?.list?.subscribe
        // 首次进入先报一次：宿主重启后也能立刻对齐，不用等用户切会话
        schedule()
        const off = typeof subscribe === 'function' ? subscribe(schedule) : undefined
        return () => {
          disposed = true
          if (timer !== null) clearTimeout(timer)
          if (typeof off === 'function') off()
        }
      })
    }

    /* ================================ 插件入口 ================================ */

    exports.inject = ['slots', 'sessions']

    exports.apply = (ctx) => {
      sessionsService = ctx.sessions
      installSessionReporter(ctx)
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
        order: 104,
      }, CodegraphSettingsCard))
    }

    return exports
  },
})
