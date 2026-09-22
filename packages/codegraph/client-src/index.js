/* eslint-disable */
/**
 * @hyzyn/dsh-codegraph — 浏览器半体（**源码**）。包根的 client.js 是它的构建产物：
 * `pnpm --filter @hyzyn/dsh-codegraph build` 经 scripts/build-client.mjs 产出
 * （去掉下面那行对 pure.js 的 import，再把 pure.js 的 `export` 前缀剥掉后内联进
 * factory），CI 的 artifact-diff 以逐字节一致为闸——以前是手写产物、与源码之间
 * 没有闸，漂移 CI 看不见（CG28）。
 *
 * 纯逻辑（无 DOM / React 依赖的判定）放 client-src/pure.js，因为那边能进 vitest；
 * 本文件里剩下的都是 React 组件与宿主交互，没有测试底座。新增纯判定请加到 pure.js，
 * 不要写回这里的闭包。
 * 同时注册 DSH ≤0.1.5 的 settings.plugin.item 与 ≥0.1.6-alpha.2 的 plugins.row.config，跨版本兼容。
 * 纯前端 React 卡片，宿主经 client-modules 的 combo 路由（/plugins/??<id>/client.js&rev=…）
 * 按 boot graph 下发的 URL 提供；单包直链 /plugins/@hyzyn/dsh-codegraph/client.js 在
 * 当前 DSH（0.1.5-rc.2）上不再直接可用。
 */
import { REL_LIMIT, adoptionText, nextRetryDelayMs, staleReasons, truncationNote } from './pure.js'

window.__ModuleLoader__.load({
  id: '@hyzyn/dsh-codegraph',
  factory: (require) => {
    const exports = {}

    /* __CODEGRAPH_PURE_INLINE__ */

    const React = require('react')
    const { jsx, jsxs } = require('react/jsx-runtime')

    /* ================================ CSS ================================ */

    const CSS = [
      '.cg_pageHost{display:block}',
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
      // 工具按钮整组：组内 nowrap，所以「放不下」时整组一起换行，而不是把最后一个按钮
      // 单独甩到第二行。`flex-shrink:0` 保证按钮本身不被压扁（文字不换行）。
      '.cg_toolbarBtns{display:flex;align-items:center;gap:8px;flex-wrap:nowrap;flex-shrink:0;margin-left:auto}',
      '.cg_btn{color:var(--dsw-alias-label-primary-foreground);background:var(--dsw-alias-button-info-fill);border:none;border-radius:8px;padding:6px 14px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}',
      '.cg_btn:hover:not(:disabled){background:var(--dsw-alias-button-info-hover)}',
      '.cg_btn:disabled{opacity:.5;cursor:default}',
      '.cg_btnGhost{color:var(--dsw-alias-label-primary);background:0 0;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:5px 12px;font-size:12px;cursor:pointer;white-space:nowrap}',
      // 「初始化索引」的二次确认态：它会往用户项目里写 .codegraph/，用告警色区别于普通按钮
      '.cg_btnDanger{color:var(--dsw-alias-state-error-primary);background:0 0;border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary) 45%,transparent);border-radius:8px;padding:5px 12px;font-size:12px;cursor:pointer;white-space:nowrap}',
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
      // 探测失败的实测原文：用等宽 + 淡色和上面的指引分开，让「ENOENT / 非零退出 / 超时」
      // 一眼可辨，而不是混在说明文字里被当成人话略过去。
      '.cg_probeDetail{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-base,#00000010);border-radius:6px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;line-height:1.5;margin:0;padding:6px 8px;white-space:pre-wrap;word-break:break-all}',
      '.cg_checks{display:flex;align-items:center;gap:16px;flex-wrap:wrap;font-size:12.5px;color:var(--dsw-alias-label-secondary)}',
      '.cg_check{display:inline-flex;align-items:center;gap:6px;cursor:pointer}',
      '.cg_check input{cursor:pointer}',
      '.cg_check[data-off="1"]{opacity:.55;cursor:default}',
    ].join('\n')

    // CG08/CG37：样式引用计数。同一次挂载会把这张卡片注册进多个插槽（0.1.6 上
    // plugins.row.config 与 settings.kit.item 会同时命中），「任一实例卸载即 remove」
    // 会让另一张还在显示的卡片瞬间全裸。且**计数必须挂在元素上**（dataset）、不能
    // 挂在闭包里：同一份 client.js 可能被宿主再次执行（HMR / 重载不换 document 的
    // 场景），闭包计数是每一代各一份、节点却是文档共享的——闭包计数下旧一代卸载
    // 会摘掉新一代在用的节点，新一代也因 getElementById 早退而永远摘不掉。
    function ensureStyle() {
      let el = document.getElementById('dsh-codegraph-style')
      if (el === null) {
        el = document.createElement('style')
        el.id = 'dsh-codegraph-style'
        el.textContent = CSS
        document.head.appendChild(el)
      }
      el.dataset.cgRefs = String(Number(el.dataset.cgRefs ?? '0') + 1)
    }
    function releaseStyle() {
      const el = document.getElementById('dsh-codegraph-style')
      if (el === null) return
      const refs = Math.max(0, Number(el.dataset.cgRefs ?? '1') - 1)
      if (refs === 0) el.remove()
      else el.dataset.cgRefs = String(refs)
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

    /**
     * 当前活动会话的工作目录；没有活动会话（或它没有 cwd）时返回 ''。
     *
     * 会话列表快照（SessionListState）只有 ids / byId / phase / subagentsByParent /
     * jobsBySession —— **没有 current 字段**，所以旧实现读的 `snapshot.current` 恒为
     * undefined，`byId[undefined]` 取不到任何会话，cwd 永远是 ''：卡片不跟随会话，
     * 上报接口只会报到空路径，托管行 cwd 就永远停在默认项目上。
     *
     * 「主视图正在展示的那个会话」由 retainedBy.mainView > 0 标记，宿主自带的
     * layout / workspace / cordis / settings-general 等客户端插件都这么取。
     */
    const activeSessionCwd = () => {
      try {
        const snapshot = sessionsService?.list?.getSnapshot?.()
        const active = Object.values(snapshot?.byId ?? {}).find((row) => (row?.retainedBy?.mainView ?? 0) > 0)
        const cwd = active?.cwd
        return typeof cwd === 'string' && cwd !== '' ? cwd : ''
      } catch {
        return ''
      }
    }

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

    // CG11 的 staleReasons 已抽到 client-src/pure.js（可直接进 vitest），构建时内联进本
    // factory；此处只留调用点（面板警告行）。

    /** 关系列表（callers / callees / affected 共用）；超过 REL_LIMIT 条给出截断计数（CG17）。 */
    const relList = (title, items, emptyText) => {
      const truncated = truncationNote(items.length, REL_LIMIT)
      return jsxs('div', {
        children: [
          jsx('p', { className: 'cg_sectionTitle', children: title }),
          items.length === 0
            ? jsx('div', { className: 'cg_itemMeta', children: emptyText })
            : jsxs('div', {
              className: 'cg_rel',
              children: [
                ...items.slice(0, REL_LIMIT).map((item, index) => jsxs('div', {
                  className: 'cg_relItem',
                  children: [
                    jsx('span', { className: 'cg_relName', children: item.name || '(unnamed)' }),
                    jsx('span', { className: 'cg_relMeta', children: (item.kind || '') + ' · ' + (item.filePath || '') + (item.startLine ? ':' + item.startLine : '') }),
                  ],
                }, 'rel-' + title + '-' + index)),
                ...(truncated === ''
                  ? []
                  : [jsx('div', { className: 'cg_itemMeta', children: truncated }, 'rel-truncated-' + title)]),
              ],
            }),
        ],
      })
    }

    function CodegraphSettingsCard(props) {
      // DSH ≥0.1.6 的插件配置页把同一条目按 view 渲染两次：summary 一句话摘要、page 完整表单。
      // 旧版（≤0.1.5）的 settings.plugin.item 卡片不带 view，走原有可折叠卡片分支。
      const view = props && props.view
      const pageView = view === 'page'
      // CG08：样式跟着卡片实例走（引用计数，见 ensureStyle/releaseStyle）
      React.useEffect(() => {
        ensureStyle()
        return releaseStyle
      }, [])
      const [open, setOpen] = React.useState(pageView)
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
      // CG21：「重新探测」和「设为默认项目」是两个动作，各自有忙态——共用一个布尔
      // 会把对方一起禁掉（点一个灰另一个）。
      const [reprobing, setReprobing] = React.useState(false)
      // P1-b：诊断包（GET /diagnose 回一段纯文本）。与其它忙态分开：它会读 daemon 日志，
      // 不该把「刷新状态 / 重新探测」一起灰掉。
      const [diagnosing, setDiagnosing] = React.useState(false)
      const [report, setReport] = React.useState('')
      // P1「采纳率仪表」：本会话/本项目里模型用 codegraph 还是用 grep/read。
      const [adoption, setAdoption] = React.useState(null)
      // CG05：sync / index / init 是可能跑 10 分钟的索引类操作，进行中给出「取消」。
      const [cancelable, setCancelable] = React.useState(false)
      // 「初始化索引」是两步确认：它会**往用户的项目里写 `.codegraph/`**，是本卡片唯一
      // 的写操作。第一次点只改成确认文案，第二次才真的发请求（比 window.confirm 可控，
      // 也不用为一次动作引一套弹窗组件）。
      const [confirmInit, setConfirmInit] = React.useState(false)

      // 当前活动会话的工作目录（随会话切换实时更新；无活动会话时为 ''）。
      const currentCwd = React.useSyncExternalStore(
        (subscribe) => sessionsService.list.subscribe(subscribe),
        activeSessionCwd,
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
            // 探测失败的实测原因（ENOENT / 非零退出 / 超时原文）与探测时刻。
            // 有它才能把「常见原因是…」这种猜测换成用户一眼能判断的原文。
            cliProbeError: typeof data.cliProbeError === 'string' ? data.cliProbeError : '',
            cliProbeAt: typeof data.cliProbeAt === 'number' ? data.cliProbeAt : 0,
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

      /**
       * 取采纳率（P1）。刻意**不**并入 loadStatus：采纳率是宿主侧内存里的累计值，
       * 与目标路径的索引状态是两件事——某个项目未索引也可能有数字（模型在这个目录里
       * 用不用 codegraph），失败不该影响状态面板。
       */
      const loadAdoption = React.useCallback(async () => {
        try {
          const data = await api('/api/dsh-codegraph/metrics' + qs({ path: effectivePath }))
          setAdoption(data && data.summary ? data.summary : null)
        } catch {
          // 采纳率是观测功能：拿不到就不显示，不打扰用户（也不覆盖已有的错误提示）
          setAdoption(null)
        }
      }, [effectivePath])

      React.useEffect(() => {
        if (open) {
          loadStatus()
          loadMcpStatus()
          loadAdoption()
        }
      }, [open, loadStatus, loadMcpStatus, loadAdoption])

      // 跟随当前项目：打开卡片或切换会话时，若用户未手动编辑过路径，
      // 自动采用当前活动会话的工作目录；手动编辑后停止跟随。
      React.useEffect(() => {
        if (!open || manual) return
        setPath(currentCwd)
      }, [open, manual, currentCwd])

      // 目标路径一换，上一个目录的「确认初始化」就不该还挂着——否则很容易在 A 目录点上
      // 确认、切到 B 目录再点一次，把 B 给初始化了（那正是这个动作最该防的误伤）。
      React.useEffect(() => {
        setConfirmInit(false)
      }, [effectivePath, open])

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
        // CG16：先清掉上一个符号的详情——标题马上要换成新符号，面板还挂着旧的
        // callers/callees/impact，加载失败时就是张冠李戴（search() 清了，这里漏了）
        setDetail(null)
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
        // unlock 是秒级操作，不给取消按钮（给了一个点完就消失的「取消」只会让人困惑）
        setCancelable(action === 'sync' || action === 'index')
        // 文案按动作分派；`unlock` 的 CLI 输出在「本来就没锁」时是
        // "No stale lock files found"，原样带出来最诚实
        const successLabel = { sync: '已同步', index: '已重建', unlock: '解锁完成' }[action] || '已完成'
        try {
          const data = await api('/api/dsh-codegraph/' + action, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ path: effectivePath }),
          })
          setOk(successLabel + '：' + (data.output || '').slice(0, 200))
          await loadStatus()
        } catch (err) {
          setError(err.message)
        } finally {
          setLoading(false)
          setCancelable(false)
        }
      }

      /** 取消进行中的 sync / index / init（CG05：以前关标签页都止不住 10 分钟的 index）。 */
      const cancelRun = async () => {
        setError('')
        try {
          await api('/api/dsh-codegraph/cancel', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ path: effectivePath }),
          })
          setOk('已发送取消请求：CLI 进程正在被终止（SIGTERM，3s 后强制）。')
        } catch (err) {
          setError(err.message)
        }
      }

      /**
       * 在未初始化的项目里跑 `codegraph init`（建 `.codegraph/` + 首次索引）。
       *
       * 为什么需要它：`codegraph index` / `sync` 都要求项目**已经** init 过——对干净目录
       * 直接报 `CodeGraph not initialized in <path>` / `Run "codegraph init" first`
       * （`index --help` 那句「same result as a fresh init」说的是全量重建的结果，不是
       * 「index 会替你初始化」）。没有这个按钮，本卡片是唯一还要把用户赶回终端的一步；
       * 而 MCP 托管行也只在目标已是有效索引时才写，新项目等于整块功能不可用。
       */
      const runInit = async () => {
        if (!confirmInit) {
          setConfirmInit(true)
          setError('')
          setOk('')
          return
        }
        setConfirmInit(false)
        setLoading(true)
        setError('')
        setOk('')
        setCancelable(true)
        try {
          const data = await api('/api/dsh-codegraph/init', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ path: effectivePath }),
          })
          setOk('已初始化并建立索引：' + (data.output || '').slice(0, 200))
          await loadStatus()
          // 索引态变了 → MCP 托管行的决策也跟着变，必须重新取一次
          await loadMcpStatus()
        } catch (err) {
          setError(err.message)
        } finally {
          setLoading(false)
          setCancelable(false)
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

      /**
       * 重新探测 CLI。为什么必须是一个显式动作：探测结果原先是挂载时锁存的一个布尔，
       * 刷新卡片只是再读一次同一个缓存——那句「刷新本卡片重试」在服务端不可能生效。
       * 现在它真的会重跑 `<command> --version`，并把实测原因（含失败原文）取回来。
       * 忙态独立于「设为默认项目」（CG21：共用一个布尔会互相禁用）。
       */
      const reprobe = async () => {
        setReprobing(true)
        setError('')
        setOk('')
        try {
          const data = await api('/api/dsh-codegraph/reprobe', { method: 'POST' })
          await loadMcpStatus()
          setOk(data.cliAvailable === true
            ? '重新探测成功：CLI 可用，systemPrompt 两段已注入。'
            : '重新探测完成：CLI 仍不可用，原因见下方。')
        } catch (err) {
          setError(err.message)
          await loadMcpStatus()
        } finally {
          setReprobing(false)
        }
      }

      /**
       * 拉诊断包（P1-b）。为什么值得做成按钮：这个插件的故障几乎全是环境性的——
       * PATH 里没有 CLI、`~/.codegraph` 被当成项目索引、托管行 cwd 被删、一次被强杀的
       * index 留下坏锁、daemon 登记的是另一个版本。以前这些要用户从四五个地方凑原文，
       * 而排查者最需要的就是那几段原文。结果是一整段纯文本，直接复制即可。
       */
      const loadReport = async () => {
        setDiagnosing(true)
        setError('')
        setOk('')
        try {
          const data = await api('/api/dsh-codegraph/diagnose' + qs({ path: effectivePath }))
          setReport(typeof data.report === 'string' ? data.report : '')
        } catch (err) {
          setError(err.message)
        } finally {
          setDiagnosing(false)
        }
      }

      /** 复制诊断包到剪贴板：优先 Clipboard API，不可用（非安全上下文）时退回选中文本。 */
      const copyReport = async () => {
        setError('')
        try {
          const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined
          if (clipboard && typeof clipboard.writeText === 'function') {
            await clipboard.writeText(report)
            setOk('诊断包已复制到剪贴板。')
            return
          }
          throw new Error('当前环境没有 navigator.clipboard（非安全上下文？）')
        } catch (err) {
          // 退回「让用户自己按 Ctrl/Cmd+C」：把一个可展开的 pre 放在眼前，比一句
          // 「复制失败」有用——文本已经拿到了，差的只是一次系统级操作。
          setOk('自动复制不可用（' + err.message + '）：诊断包已展开在下方，手动全选复制即可。')
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
        // CG12：项目被删 / uninit 后坏行会一直留在 cordis.patch.yml 里（没有 fs.watch），
        // 卡片至少要把「cwd 目录已经不在了」说出来。
        const deadCwd = mcp.cwdExists === false ? ' · ⚠ cwd 目录已不存在' : ''
        if (mcp.mode === 'own') return 'MCP：已托管（本插件维护工作目录）· cwd ' + (mcp.cwd || '(未设置)') + (mcp.disabled ? ' · 已停用' : '') + deadCwd + following + note
        if (mcp.mode === 'dsh-mcp') return 'MCP：已对齐 MCP 卡片里的行 · cwd ' + (mcp.cwd || '(未设置)') + (mcp.disabled ? ' · 已停用' : '') + deadCwd + following + note
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
          // 注意这里谈的是**托管行用的那个目录**（shown），它未必等于下面你正在看的路径；
          // 所以只给不依赖「当前路径」的说法，别让人以为点卡片上的按钮就能修它。
          : '把默认项目切到已索引目录即可自动挂载（也可以直接在该目录里运行 `codegraph init` 建索引）。'
        return '⚠ 托管行用的目录 ' + shown + source + ' 不是有效索引：' + why + '。未加载项目的 codegraph_* 工具需要显式传 projectPath；' + fix
      }, [defaultInfo, status, effectivePath])

      const cliWarning = defaultInfo && defaultInfo.cliAvailable === false
        ? '⚠ 探测不到可执行的 CLI 命令 ' + (defaultInfo.command || 'codegraph') + '（`--version` 失败）：systemPrompt 的能力公告与使用指引都不会注入，卡片里的状态 / 搜索 / sync / 重建索引也会报错。'
          + '\n修法二选一：① 把插件配置里的 command 写成该 CLI 的绝对路径（改 profile 补丁会触发热重载并重新探测）；② 从新开的终端重启宿主，让新的环境块生效。'
          + '注意：宿主进程的 PATH 在它启动时就固定了，刷新页面 / 重开卡片都不会改变它——改完上面任一项后，点「重新探测」即可就地确认，不必重启宿主。'
        : ''

      /** 探测失败的实测原文：ENOENT / 非零退出 / 超时三种情况靠它区分。 */
      const cliProbeDetail = defaultInfo && defaultInfo.cliAvailable === false && defaultInfo.cliProbeError
        ? '实测原因：' + defaultInfo.cliProbeError
          + (defaultInfo.cliProbeAt ? '\n上次探测：' + new Date(defaultInfo.cliProbeAt).toLocaleTimeString() : '')
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

      if (view === 'summary') {
        return '代码图谱：索引状态、符号搜索、callers/callees/impact、一键 sync/index。'
      }

      // page 视图：新页面自己画标题/图标/面包屑，这里只交表单本体，不渲染卡片头。
      return jsxs(pageView ? 'div' : 'li', {
        className: pageView ? 'cg_pageHost' : (open ? 'cg_pluginCard cg_pluginCardOpen' : 'cg_pluginCard'),
        children: [
          pageView ? null : jsxs('button', {
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
          (pageView || open) ? jsx('div', {
            className: 'cg_cardBody',
            children: jsxs('div', {
              className: 'cg_panel',
              children: [
                jsxs('div', {
                  className: 'cg_panelHeader',
                  children: [
                    jsx('span', { className: 'cg_panelTitle', children: 'Codegraph 控制台' }),
                    // 按钮整组包一层：`cg_panelHeader` 是 flex-wrap，若把 5 个按钮直接铺在
                    // 里面，放不下时**最后一个会被单独挤到第二行**（一张卡片上孤零零一个按钮）。
                    // 包成一组、组内 nowrap，要么整组留在标题右边，要么整组换行。
                    jsxs('div', {
                      className: 'cg_toolbarBtns',
                      children: [
                        // 只有「用户正看着的这个目录还不是有效索引」时才出现。放在最前面：
                        // 那种情况下它就是这张卡片的主操作，也不该被挤到行尾。
                        //
                        // 判定必须用 `status.initialized === false`（= /status?path=<本卡片路径>），
                        // **不能**用 `defaultInfo.indexed`：那个来自 /default-path，走的是后端的
                        // effectiveProjectPath——「跟随当前项目」开着、而会话目录未索引时，它会回落到
                        // **默认项目**，于是回一个 `indexed: true`（默认项目往往正是某个已索引的仓库），
                        // 按钮就永远不出现。两个口径在这个场景下必然分叉，这里跟底部那句文案
                        // （同一个条件）保持一致。
                        status && status.initialized === false
                          ? jsx('button', {
                            type: 'button',
                            className: confirmInit ? 'cg_btnDanger' : 'cg_btnGhost',
                            disabled: loading,
                            title: confirmInit
                              ? '再点一次即在 ' + (effectivePath || '(默认项目)') + ' 里创建 .codegraph/ 并建立首次索引'
                              : 'codegraph index / sync 都要求项目先初始化过（干净目录会报 “CodeGraph not initialized”）。这个按钮在该目录跑一次 `codegraph init`。',
                            onClick: runInit,
                            children: confirmInit ? '确认初始化？' : '初始化索引',
                          })
                          : null,
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
                          disabled: reprobing,
                          title: '重跑一次 `<command> --version`：CLI 是后装的、或 command 改成了绝对路径时，无需重启宿主即可恢复',
                          onClick: reprobe,
                          children: '重新探测',
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
                        // 清陈旧锁：一次被强杀的 index 留下的 codegraph.lock 会挡住后续
                        // **所有**索引操作，而在此之前卡片没有任何入口（只能去终端）。
                        // CLI 侧幂等（没锁时 exit 0），所以不需要二次确认。
                        jsx('button', {
                          type: 'button',
                          className: 'cg_btnGhost',
                          disabled: loading,
                          title: 'codegraph unlock：清掉挡住索引的陈旧锁文件（索引被强杀后常见）。没锁时什么也不做',
                          onClick: () => runAction('unlock'),
                          children: '解锁',
                        }),
                        // 一键诊断包（P1-b）：把 PATH / 托管行 / 索引 / daemon / 最近失败
                        // 的原文一次收齐，供排障与贴 issue。
                        jsx('button', {
                          type: 'button',
                          className: 'cg_btnGhost',
                          disabled: diagnosing,
                          title: '收集一段可直接复制的诊断文本：CLI 探测实测原文、托管行与补丁区块（值已脱敏）、索引状态、codegraph daemon 与日志尾、最近一次 CLI 失败',
                          onClick: loadReport,
                          children: diagnosing ? '收集中…' : '诊断包',
                        }),
                        // CG05：索引类操作进行中给「取消」——以前连关标签页都止不住 10 分钟的全量重建
                        cancelable && loading
                          ? jsx('button', {
                            type: 'button',
                            className: 'cg_btnDanger',
                            title: '终止正在跑的 codegraph CLI（SIGTERM，3s 后整组 SIGKILL）',
                            onClick: cancelRun,
                            children: '取消',
                          })
                          : null,
                      ],
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
                // P1 采纳率：模型到底用不用 codegraph。放在 MCP 行下面、状态网格上面——
                // 它是「配置对不对」之后的第二个问题（「配好了，模型买账吗」）。
                adoptionText(adoption) !== ''
                  ? jsx('p', {
                    className: 'cg_subtitle',
                    title: '来自宿主的内存计数（session/event 的 tool/call），宿主重启即归零；项目按索引根归并。「文件探索」= grep/glob/read 这类本可交给 codegraph 的工具，bash 等不计入',
                    children: adoptionText(adoption),
                  })
                  : null,
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
                cliProbeDetail ? jsx('p', { className: 'cg_probeDetail', children: cliProbeDetail }) : null,
                defaultWarning ? jsx('p', { className: 'cg_warn', children: defaultWarning }) : null,
                ok ? jsx('p', { className: 'cg_ok', children: ok }) : null,
                // 诊断包（P1-b）：展开态 + 复制按钮。用 details 而不是直接铺开——它很长
                // （补丁区块 + daemon 日志尾），铺开会把下面的状态面板挤到屏幕外。
                report !== ''
                  ? jsxs('details', {
                    className: 'cg_details',
                    open: true,
                    children: [
                      jsxs('summary', {
                        children: [
                          '诊断包（可整段复制贴 issue）',
                          jsx('button', {
                            type: 'button',
                            className: 'cg_btnGhost',
                            style: { marginLeft: '8px' },
                            onClick: (event) => {
                              // details 的 summary 上放按钮：不拦住冒泡的话点「复制」
                              // 会顺带把这块折叠起来
                              event.preventDefault()
                              event.stopPropagation()
                              copyReport()
                            },
                            children: '复制',
                          }),
                        ],
                      }),
                      jsx('pre', { className: 'cg_pre', children: report }),
                    ],
                  })
                  : null,
                status
                  ? statusIsStructured
                    ? jsxs('div', {
                      children: [
                        jsx('div', { className: 'cg_grid', children: statusCells(status) }),
                        // CG11：CLI 明说「建议重建」时不能只报「● 已索引」——MCP 这时给的是旧图。
                        // 实测补一句「Sync 修不了它」：codegraph 1.6.0 的 `sync` 对「提取器版本
                        // 落后」这类过期返回 Already up to date 且不清除信号，只有「重建索引」能修。
                        // 以前文案只说「点重建索引可修复」，用户很可能先点 Sync 然后发现没用。
                        staleReasons(status).length > 0
                          ? jsx('p', {
                            className: 'cg_warn',
                            children: '⚠ 索引可能过期：' + staleReasons(status).join('；')
                              + '。MCP 工具此刻给的是旧提取器产出的图——点「重建索引」修复（实测此时 Sync 会报 Already up to date 且不解决问题）。',
                          })
                          : null,
                        status.initialized === false
                          ? jsx('p', { className: 'cg_mcpMeta', children: '该目录还没有索引：点上方「初始化索引」即可在本目录跑一次 `codegraph init`（只创建 .codegraph/，源文件不动；可用 `codegraph uninit` 撤销）。' })
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
     *
     * CG15：失败要能重试。旧实现把 lastSent 写在 fetch 之前、失败只 console.warn——
     * 一次网络抖动 / 宿主重启就把「跟随当前项目」永久关死，直到用户切换会话。现在
     * lastSent 只在成功（或服务端明确拒绝的 4xx）后落位；网络错误 / 5xx 走指数退避
     * 重试（1s 起、封顶 30s）；404（宿主启动期路由未挂上）与 5xx 同为瞬态，一并重试。
     */
    function installSessionReporter(ctx) {
      let lastSent = null
      let timer = null
      let retryTimer = null
      let retryDelayMs = 0
      let disposed = false

      const readCwd = () => activeSessionCwd()

      const report = async () => {
        const cwd = readCwd()
        if (disposed || cwd === lastSent) return
        try {
          const response = await fetch('/api/dsh-codegraph/follow', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ path: cwd }),
          })
          // 404 也要重试（评审追记）：宿主启动期路由还没挂上时 /follow 会 404，那是
          // 瞬态而不是拒绝；5xx 是服务端抖动。其余 4xx（400 目录不存在、403 越权）
          // 才是明确拒绝——记下这个值等下一次会话变化，不重试轰炸。
          if (!response.ok && (response.status === 404 || response.status >= 500)) {
            throw new Error('HTTP ' + response.status)
          }
          lastSent = cwd
          retryDelayMs = 0
        } catch (error) {
          console.warn('[dsh-codegraph] 上报活动会话目录失败，将重试：' + (error instanceof Error ? error.message : String(error)))
          if (disposed) return
          retryDelayMs = nextRetryDelayMs(retryDelayMs)
          if (retryTimer !== null) clearTimeout(retryTimer)
          retryTimer = setTimeout(() => {
            retryTimer = null
            void report()
          }, retryDelayMs)
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
          if (retryTimer !== null) clearTimeout(retryTimer)
          if (typeof off === 'function') off()
        }
      })
    }

    /* ================================ 插件入口 ================================ */

    exports.inject = ['slots', 'sessions']

    /**
     * DSH ≥0.1.6-alpha.2 的行配置 key：`<bundle 包名>#<行 id>`，行 id 取自 bundle 的
     * cordis.patch.yml。独立安装时 bundle 是本包，装全家桶时是 @hyzyn/dsh-all —— 两个都注册，
     * 未命中的那个只是躺在 ledger 里，不会渲染。
     */
    const ROW_CONFIG_KEYS = [
      '@hyzyn/dsh-codegraph#codegraph',
      '@hyzyn/dsh-all#codegraph',
    ]

    exports.apply = (ctx) => {
      sessionsService = ctx.sessions
      installSessionReporter(ctx)
      // 样式由卡片实例自管（ensureStyle/releaseStyle 引用计数，CG08）——这里不再全局
      // 注入一次又随插件卸载摘掉，那会让另一张还在显示的卡片全裸。
      // DSH ≥0.1.6-alpha.2：侧边栏「插件」页里该行的配置页。插槽不存在时 inject 不会触发，
      // 因此在旧版上完全无副作用，一份代码同时兼容两代。
      for (const key of ROW_CONFIG_KEYS) {
        ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
          name: 'plugins.row.config',
          key,
        }, CodegraphSettingsCard))
      }
      // DSH ≥0.1.6：设置里与「通用设置」平级的「插件配置」页（子 slot 由
      // @hyzyn/dsh-kit-settings 声明）。不传 view，卡片走各自原有的可折叠形态。
      ctx.slots.inject('settings.kit.item', () => ctx.slots.register({
        name: 'settings.kit.item',
        id: 'codegraph',
        order: 60,
        label: () => "Codegraph",
      }, CodegraphSettingsCard))
      // DSH ≤0.1.5：设置 → 插件 的「插件配置」标签页，keyed 插槽按 settings 命名空间派发。
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
