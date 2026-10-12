/* eslint-disable */
/**
 * @hyzyn/dsh-loglens — 浏览器半体：「日志查询」的来源清单设置卡片。
 *
 * 本包是**构建型**：源在 client-src/、产物是包根的 client.js（scripts/build-client.mjs 把
 * client-src/pure.js 内联进来，并在发现任何残留 import 时 exit(1)）。设置面的注册与样式
 * 取值逐条对齐宿主（见 docs/conventions.md 的客户端半体六条硬规矩）。
 *
 * 当前能力**只有来源清单与开关**：查询面（结果列表 / 时间窗 / 直方图 / 跟随）还没有，
 * 卡片上把这句话写在明面上——不留一个「看起来能用」的假界面。
 */
import {
  appendLines,
  countsParts,
  dockerFlagOf,
  dockerLogLines,
  dockerLogTextOf,
  dockerProblem,
  dockerSince,
  dockerTargetChoices,
  draftFromTarget,
  draftPayload,
  draftProblem,
  emptyDraft,
  emptyQuery,
  kindOptions,
  queryPayload,
  queryProblem,
  windowOptions,
} from './pure.js'

window.__ModuleLoader__.load({
  id: '@hyzyn/dsh-loglens',
  factory: (require) => {
    const exports = {}

    const React = require('react')
    const { jsx, jsxs } = require('react/jsx-runtime')

    /* ============ 纯逻辑（构建时由 scripts/build-client.mjs 内联） ============ */
    /* __LOGLENS_PURE_INLINE__ */

    /* ================================ CSS ================================ */

    const CSS = [
      '.ll_pageHost{display:block}',
      '.ll_pluginCard{list-style:none;border:.5px solid var(--dsw-alias-settings-card-stroke);background:var(--dsw-alias-settings-card-fill);border-radius:var(--dsw-radius-xl);transition:border-color .16s,background .16s}',
      '.ll_pluginCard:hover{border-color:var(--dsw-alias-label-dimmed)}',
      '.ll_pluginCardOpen{background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-label-dimmed)}',
      '.ll_cardHeader{appearance:none;width:100%;color:inherit;font:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:var(--dsw-radius-xl);display:flex;align-items:center;gap:12px;padding:14px 16px}',
      '.ll_cardHeader:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}',
      '.ll_cardHeadText{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}',
      '.ll_cardName{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:500;line-height:22px}',
      '.dshkit_badge{flex:none;margin-left:auto;padding:1px 8px;border-radius:999px;corner-shape:round;font-size:11px;font-weight:600;line-height:16px;letter-spacing:.02em;color:var(--dsw-alias-label-dimmed);background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l1)}',
      '.ll_cardDescription{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}',
      '.ll_chevron{flex:none;color:var(--dsw-alias-label-tertiary);transition:transform .16s}',
      '.ll_pluginCardOpen .ll_chevron{transform:rotate(180deg)}',
      '.ll_cardBody{padding:2px 16px 16px}',
      '.ll_panel{display:flex;flex-direction:column;gap:12px;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);box-sizing:border-box}',
      '.ll_panelHeader{display:flex;align-items:center;gap:10px;flex:none}',
      '.ll_panelTitle{margin:0;font-size:15px;font-weight:500;line-height:22px;white-space:nowrap;flex:1}',
      '.ll_switch{display:inline-flex;align-items:center;gap:6px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap}',
      '.ll_switch input[type=checkbox]{width:16px;height:16px;margin:0;flex:none;cursor:pointer;accent-color:var(--dsw-alias-brand-primary)}',
      '.ll_switch input[type=checkbox]:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}',
      '.ll_hint{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
      '.ll_toolbar{display:flex;align-items:center;gap:8px;flex:none}',
      '.ll_toolbarSpacer{flex:1}',
      '.ll_btn{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:4px;height:28px;padding:0 10px;border:none;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground);font-family:inherit;font-size:12px;line-height:18px;white-space:nowrap;cursor:pointer}',
      '.ll_btn:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}',
      '.ll_btn:disabled{opacity:.4;cursor:not-allowed}',
      '.ll_btn:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary))}',
      '.ll_btnGhost{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:4px;height:28px;padding:0 10px;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12px;line-height:18px;white-space:nowrap;cursor:pointer}',
      '.ll_btnGhost:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
      '.ll_btnGhost:active:not(:disabled){background:var(--dsw-alias-interactive-bg-active)}',
      '.ll_btnGhost:disabled{opacity:.4;cursor:not-allowed}',
      '.ll_btnGhost:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary))}',
      '.ll_btnDanger{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 30%,transparent)}',
      '.ll_btnDanger:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,transparent)}',
      '.ll_list{display:flex;flex-direction:column;gap:8px;max-height:420px;overflow-y:auto}',
      '.ll_head{display:grid;grid-template-columns:minmax(120px,140px) minmax(140px,1.4fr) minmax(180px,2fr) auto auto;gap:8px;align-items:center;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;padding:0 10px}',
      // 行内四列 + 两个动作位。输入档对齐宿主 settings-form 的 .input（H34 / R12 / border-l4 /
      // bg-layer-3 / 13px）：显式 height 是关键——同一个类套到 <select> 上时 Chrome 不看继承的
      // line-height，没有它就会比同排的 <input> 矮 2px；圆角取 token 而非 8px 字面量。
      '.ll_row{display:grid;grid-template-columns:minmax(120px,140px) minmax(140px,1.4fr) minmax(180px,2fr) auto auto;gap:8px;align-items:center;background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);padding:8px 10px}',
      // URL 与索引表达式竖着放一格：横着再加一列会把这一行挤到看不清
      '.ll_stack{display:flex;flex-direction:column;gap:6px;min-width:0}',
      '.ll_input{box-sizing:border-box;width:100%;height:34px;padding:0 12px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3);border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);outline:none;font-family:inherit;font-size:13px;line-height:1.5}',
      '.ll_input:focus{border-color:var(--dsw-alias-state-business-primary)}',
      '.ll_input::placeholder{color:var(--dsw-alias-label-tertiary)}',
      '.ll_input:disabled{opacity:.5;cursor:not-allowed}',
      '.ll_empty,.ll_loading{text-align:center;color:var(--dsw-alias-label-tertiary);padding:24px 12px;font-size:12.5px;line-height:18px}',
      '.ll_error{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;margin:0;white-space:pre-wrap}',
      '.ll_ok{color:var(--dsw-alias-state-success-primary);font-size:12px;line-height:18px;margin:0}',
      '.ll_query{display:flex;flex-direction:column;gap:10px;border-top:.5px solid var(--dsw-alias-border-l1);padding-top:12px}',
      '.ll_queryGrid{display:grid;grid-template-columns:minmax(110px,130px) minmax(160px,2fr) minmax(96px,120px) minmax(64px,84px) auto;gap:8px;align-items:center}',
      '.ll_queryMeta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
      '.ll_results{display:flex;flex-direction:column;gap:2px;max-height:420px;overflow-y:auto;font-family:var(--ds-font-family-code)}',
      '.ll_resultRow{display:grid;grid-template-columns:auto auto minmax(0,1fr);gap:8px;align-items:baseline;padding:3px 8px;border-radius:var(--dsw-radius-sm);font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary)}',
      '.ll_resultRow:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.ll_resultTime{color:var(--dsw-alias-label-tertiary);white-space:nowrap}',
      '.ll_resultLevel{color:var(--dsw-alias-state-warn-primary);white-space:nowrap}',
      '.ll_resultMsg{color:var(--dsw-alias-label-primary);white-space:pre-wrap;word-break:break-word}',
      '.ll_warn{color:var(--dsw-alias-state-warn-primary);font-size:12px;line-height:18px}',
    ].join('\n')

    let styleEl
    function ensureStyle() {
      if (document.getElementById('dsh-loglens-style')) return
      styleEl = document.createElement('style')
      styleEl.id = 'dsh-loglens-style'
      styleEl.textContent = CSS
      document.head.appendChild(styleEl)
    }

    /* ================================ 国际化 ================================ */

    /*
     * 界面文案走宿主 @deepseek-ai/dsh-client-locale 的目录（方案见 docs/i18n.md）。
     * 下面这一对目录由 scripts/check-i18n.mjs 静态校验：键集必须一一对应、{name} 占位符
     * 两边一致、代码里 t('…') 用到的键必须在这里有定义。本包是**构建型**，目录与样式一样
     * 内联在 client-src/index.js 里（client.js 是产物，别去改它）。
     */
    /* ==== dsh-i18n:begin ==== */
    const I18N_NS = 'loglens'
    const I18N_ZH = {
      'card.name': '日志查询',
      'card.desc': '把 Loki / Elasticsearch / OpenSearch 等日志后端归一化成一个查询面；当前只有来源清单与开关。',
      'panel.title': '日志来源',
      'hint.notImplemented': '下面可以直接查当前来源；字段清单与「某一行前后」的上下文由 agent 侧的两个工具做（loglens_fields / loglens_context）——面板暂不画它们。',
      'field.kind': '类型',
      'field.label': '名称',
      'field.url': '地址',
      'placeholder.index': '索引表达式（如 app-logs-*；留空 = 用地址路径，再留空则 *,-.*）',
      'hint.index': 'ES / OpenSearch 的索引表达式：留空时用地址里的路径，地址里也没有就是 *,-.*（全部索引但排除点号系统索引）。',
      'option.loki': 'Loki',
      'option.elasticsearch': 'Elasticsearch',
      'option.opensearch': 'OpenSearch',
      'option.docker': 'Docker（采集来源）',
      'check.enabled': '启用插件',
      'btn.add': '+ 新增来源',
      'btn.save': '保存',
      'btn.saving': '保存中…',
      'btn.remove': '删除',
      'list.loading': '加载中…',
      'list.empty': '还没有日志来源，点「+ 新增来源」加一个。',
      'status.enabled': '已启用',
      'status.disabled': '已停用',
      'placeholder.label': '例如：本地 Loki',
      'placeholder.url': 'http://127.0.0.1:3100',
      'msg.saved': '已保存',
      'msg.memoryOnly': '宿主没有 settings 服务，改动只在本次进程内有效',
      'error.needUrl': '这个类型必须填地址',
      'error.badUrl': '地址必须是 http:// 或 https:// 开头的绝对地址',
      'error.badKind': '类型不认识（支持 Loki / Elasticsearch / OpenSearch / Docker）',
      'section.query': '查询',
      'hint.query': '面板直查当前来源：走的是与 agent 工具同一套执行层（同一份归一化与截断信号）。',
      'placeholder.query': '查询串（Loki 是 LogQL；留空即全量）',
      'field.target': '来源',
      'field.window': '时间窗',
      'field.limit': '条数',
      'btn.query': '查询',
      'btn.querying': '查询中…',
      'btn.nextPage': '下一页',
      'btn.clear': '清空结果',
      'option.15m': '最近 15 分钟',
      'option.1h': '最近 1 小时',
      'option.6h': '最近 6 小时',
      'option.24h': '最近 24 小时',
      'list.noHit': '没有命中（换个时间窗，或放宽查询串）',
      'meta.returned': '返回 {count} 行',
      'meta.matched': '命中 {count}',
      'meta.matchedAtLeast': '至少命中 {count}',
      'meta.scannedRows': '扫描 {count} 行',
      'meta.scannedBytes': '扫描 {count} 字节',
      'meta.truncated': '已截断：{reasons}',
      'status.hit_limit': '达到条数上限',
      'status.max_result_window': '超出结果窗口上限',
      'status.partial_shards': '部分分片失败',
      'status.timed_out': '查询超时',
      'status.scan_cap': '扫描量到顶',
      'status.byte_cap': '字节量到顶',
      'status.cursor_expired': '游标已过期',
      'error.needTarget': '先选一个来源',
      'error.badLimit': '条数得是正整数',
      'field.dockerTarget': 'Docker 目标名',
      'field.container': '容器',
      'field.tail': '行数',
      'btn.containers': '拉取容器',
      'btn.logs': '看日志',
      'hint.docker': '容器日志走的是 Docker 面板插件自己的 /api/dsh-docker/logs：这条路没有 until、行数有上限、没有 grep——要精确检索请让 agent 用 docker_logs_grep。',
      'hint.dockerMissing': '这条路径要「Docker 容器面板」插件（当前没检测到它）：装上并启用后，这里可以直接看容器日志。',
      'error.needContainer': '先选一个容器',
      'option.dockerAuto': '（让 Docker 面板自己回落）',
      'btn.logsLoading': '加载中…',
      'list.noLogs': '没有日志（换个大点的时间窗或行数再试）',
      'hint.dockerTargetUnknown': '（不在 Docker 面板的目标里）',
    }
    const I18N_EN = {
      'card.name': 'Log query',
      'card.desc': 'Normalizes log backends such as Loki / Elasticsearch / OpenSearch into one query surface; for now only the source list and the switch.',
      'panel.title': 'Log sources',
      'hint.notImplemented': 'You can query the selected source right below; the field list and per-line context live in the agent tools (loglens_fields / loglens_context) — this panel does not draw them yet.',
      'field.kind': 'Kind',
      'field.label': 'Name',
      'field.url': 'URL',
      'placeholder.index': 'Index expression (e.g. app-logs-*; empty = the path in the URL, else *,-.*)',
      'hint.index': 'Index expression for ES / OpenSearch: empty means the path in the URL, and if that is empty too it becomes *,-.* (all indices except dot-prefixed system indices).',
      'option.loki': 'Loki',
      'option.elasticsearch': 'Elasticsearch',
      'option.opensearch': 'OpenSearch',
      'option.docker': 'Docker (collector)',
      'check.enabled': 'Enable plugin',
      'btn.add': '+ Add source',
      'btn.save': 'Save',
      'btn.saving': 'Saving…',
      'btn.remove': 'Remove',
      'list.loading': 'Loading…',
      'list.empty': 'No log source yet — click “+ Add source”.',
      'status.enabled': 'Enabled',
      'status.disabled': 'Disabled',
      'placeholder.label': 'e.g. local Loki',
      'placeholder.url': 'http://127.0.0.1:3100',
      'msg.saved': 'Saved',
      'msg.memoryOnly': 'The host has no settings service; changes last only in this process',
      'error.needUrl': 'This kind needs a URL',
      'error.badUrl': 'The URL must be an absolute http:// or https:// address',
      'error.badKind': 'Unknown kind (Loki / Elasticsearch / OpenSearch / Docker)',
      'section.query': 'Query',
      'hint.query': 'Queries the selected source through the same execution layer the agent tools use (identical normalization and truncation signals).',
      'placeholder.query': 'Query string (LogQL for Loki; empty means everything)',
      'field.target': 'Source',
      'field.window': 'Time window',
      'field.limit': 'Limit',
      'btn.query': 'Run',
      'btn.querying': 'Running…',
      'btn.nextPage': 'Next page',
      'btn.clear': 'Clear',
      'option.15m': 'Last 15 minutes',
      'option.1h': 'Last hour',
      'option.6h': 'Last 6 hours',
      'option.24h': 'Last 24 hours',
      'list.noHit': 'No hits (widen the window or loosen the query)',
      'meta.returned': '{count} rows',
      'meta.matched': '{count} matched',
      'meta.matchedAtLeast': 'at least {count} matched',
      'meta.scannedRows': 'scanned {count} rows',
      'meta.scannedBytes': 'scanned {count} bytes',
      'meta.truncated': 'Truncated: {reasons}',
      'status.hit_limit': 'hit the row limit',
      'status.max_result_window': 'beyond the result window',
      'status.partial_shards': 'partial shards failed',
      'status.timed_out': 'query timed out',
      'status.scan_cap': 'scan cap reached',
      'status.byte_cap': 'byte cap reached',
      'status.cursor_expired': 'cursor expired',
      'error.needTarget': 'Pick a source first',
      'error.badLimit': 'The limit must be a positive integer',
      'field.dockerTarget': 'Docker target name',
      'field.container': 'Container',
      'field.tail': 'Lines',
      'btn.containers': 'Load containers',
      'btn.logs': 'Show logs',
      'hint.docker': 'Container logs come from the Docker panel plugin own /api/dsh-docker/logs: no until, a capped tail, and no grep — ask the agent for docker_logs_grep when you need real search.',
      'hint.dockerMissing': 'This path needs the Docker container panel plugin (not detected): install and enable it to read container logs here.',
      'error.needContainer': 'Pick a container first',
      'option.dockerAuto': '(let the Docker panel pick)',
      'btn.logsLoading': 'Loading…',
      'list.noLogs': 'No logs (try a wider time window or a larger tail)',
      'hint.dockerTargetUnknown': ' (not a target in the Docker panel)',
    }
    /* ==== dsh-i18n:end ==== */

    /** 占位符替换：{name} 取 params.name（缺参留空，不抛错——文案不该打死界面）。 */
    function i18nFormat(text, params) {
      if (params === undefined) return text
      return String(text).replace(/\{(\w+)\}/g, (_match, name) => (params[name] === undefined ? '' : String(params[name])))
    }

    /** 中文兜底：老宿主（DSH ≤0.1.5）没有 locale 服务时，界面不能变成一串键名。 */
    function i18nFallback(key, params) {
      return i18nFormat(I18N_ZH[key] !== undefined ? I18N_ZH[key] : key, params)
    }

    let t = i18nFallback

    /**
     * 注册目录并绑定翻译函数。**动态 inject**：老宿主上回调永不触发、t 保持中文兜底；
     * 写成静态 inject: ['locale'] 会让整张卡片在老宿主上根本不挂。
     */
    function installI18n(ctx) {
      ctx.inject(['locale'], (i18nCtx) => {
        const disposeZh = i18nCtx.locale.register(I18N_NS, 'zh', I18N_ZH)
        const disposeEn = i18nCtx.locale.register(I18N_NS, 'en', I18N_EN)
        t = i18nCtx.locale.bind(I18N_NS)
        return () => {
          disposeEn()
          disposeZh()
          t = i18nFallback
        }
      })
    }

    /* ================================ API ================================ */

    /** 同源相对路径：本插件的路由就在宿主自己的 origin 上，不拼任何绝对地址。 */
    async function api(path, options) {
      const response = await fetch(path, options)
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || ('HTTP ' + String(response.status)))
      }
      return data
    }

    /** 类型下拉的文案：逐条列字面量，别用 'option.' + kind 拼（静态闸门扫不到动态键）。 */
    function kindLabel(kind) {
      if (kind === 'loki') return t('option.loki')
      if (kind === 'elasticsearch') return t('option.elasticsearch')
      if (kind === 'opensearch') return t('option.opensearch')
      if (kind === 'docker') return t('option.docker')
      return kind
    }

    /* ================================ 设置卡片 ================================ */

    const CHEVRON_PATH = 'M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 9.13382 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z'

    function LoglensSettingsCard(props) {
      // DSH ≥0.1.6 的插件配置页把同一条目按 view 渲染两次：summary 一句话摘要、page 完整表单。
      const view = props && props.view
      const pageView = view === 'page'
      const [open, setOpen] = React.useState(pageView)
      const [enabled, setEnabled] = React.useState(true)
      const [drafts, setDrafts] = React.useState([])
      const [error, setError] = React.useState('')
      const [ok, setOk] = React.useState('')
      const [loading, setLoading] = React.useState(false)
      const [saving, setSaving] = React.useState(false)
      const [query, setQuery] = React.useState(emptyQuery)
      const [outcome, setOutcome] = React.useState(undefined)
      const [lines, setLines] = React.useState([])
      const [cursor, setCursor] = React.useState(undefined)
      const [querying, setQuerying] = React.useState(false)
      const [docker, setDocker] = React.useState(false)
      const [containers, setContainers] = React.useState([])
      const [container, setContainer] = React.useState('')
      const [dockerLogs, setDockerLogs] = React.useState('')
      const [dockerOpened, setDockerOpened] = React.useState(false)
      const [dockerTail, setDockerTail] = React.useState(200)
      const [dockerBusy, setDockerBusy] = React.useState(false)
      const [dockerTargets, setDockerTargets] = React.useState([])

      /** 宿主回什么就照什么渲染：一切状态以服务端那份为准，不在本地做乐观合并。 */
      const applyConfig = React.useCallback((payload) => {
        const next = payload && payload.config ? payload.config : { enabled: true, targets: [] }
        setEnabled(next.enabled !== false)
        setDrafts((Array.isArray(next.targets) ? next.targets : []).map(draftFromTarget))
        loadDockerTargets()
        // 只有响应真的带 plugins 才覆盖：保存走的 POST /config 也可能不带（缺字段 = 不知道，不是没装）
        setDocker((current) => dockerFlagOf(current, payload))
      }, [])

      const load = React.useCallback(async () => {
        setLoading(true)
        setError('')
        setOk('')
        try {
          applyConfig(await api('/api/dsh-loglens/config'))
        } catch (err) {
          setError(err.message)
        } finally {
          setLoading(false)
        }
      }, [applyConfig])

      React.useEffect(() => {
        if (open || pageView) load()
      }, [open, pageView, load])

      /** 所有写操作走同一个入口：一次请求一个动作，失败把宿主的原话显示出来。 */
      const mutate = async (body) => {
        setSaving(true)
        setError('')
        setOk('')
        try {
          const data = await api('/api/dsh-loglens/config', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          })
          applyConfig(data)
          setOk(data && typeof data.warning === 'string' ? t('msg.memoryOnly') : t('msg.saved'))
        } catch (err) {
          setError(err.message)
        } finally {
          setSaving(false)
        }
      }

      function problemText(problem) {
        if (problem === 'needUrl') return t('error.needUrl')
        if (problem === 'badUrl') return t('error.badUrl')
        if (problem === 'badKind') return t('error.badKind')
        return ''
      }

      const updateDraft = (index, patch) => {
        setDrafts((current) => current.map((draft, at) => (at === index ? { ...draft, ...patch } : draft)))
      }

      const addDraft = () => {
        setDrafts((current) => [...current, emptyDraft()])
      }

      const saveDraft = async (index) => {
        const draft = drafts[index]
        const problem = draftProblem(draft)
        if (problem !== '') {
          setError(problemText(problem))
          return
        }
        const payload = draftPayload(draft)
        if (draft.id === '') await mutate({ action: 'targets.add', target: payload })
        else await mutate({ action: 'targets.update', id: draft.id, patch: payload })
      }

      const removeDraft = async (index) => {
        const draft = drafts[index]
        // 还没落盘的新行只从界面上撤掉，不必打一次服务端（也就不会留下 400 的回声）。
        if (draft.id === '') {
          setDrafts((current) => current.filter((_item, at) => at !== index))
          return
        }
        await mutate({ action: 'targets.remove', id: draft.id })
      }

      /* ---- 查询区（P6 面板侧）：走宿主那条 /query，与 agent 工具同一个执行层 ---- */

      /** 一次展示用的时间格式：本地时间到毫秒（日志排查里毫秒常常就是线索）。 */
      function formatTime(ms) {
        const date = new Date(ms)
        const pad = (value, width) => String(value).padStart(width, '0')
        return pad(date.getHours(), 2) + ':' + pad(date.getMinutes(), 2) + ':' + pad(date.getSeconds(), 2) + '.' + pad(date.getMilliseconds(), 3)
      }

      /** 时间窗预设的文案：逐条列字面量，别用 'option.' + key 拼（静态闸门扫不到动态键）。 */
      function windowLabel(key) {
        if (key === '15m') return t('option.15m')
        if (key === '1h') return t('option.1h')
        if (key === '6h') return t('option.6h')
        if (key === '24h') return t('option.24h')
        return key
      }

      /** 截断理由 → 文案（同样逐条列字面量）。 */
      function reasonText(reason) {
        if (reason === 'hit_limit') return t('status.hit_limit')
        if (reason === 'max_result_window') return t('status.max_result_window')
        if (reason === 'partial_shards') return t('status.partial_shards')
        if (reason === 'timed_out') return t('status.timed_out')
        if (reason === 'scan_cap') return t('status.scan_cap')
        if (reason === 'byte_cap') return t('status.byte_cap')
        if (reason === 'cursor_expired') return t('status.cursor_expired')
        return reason
      }

      /** 计数的一段 → 文案（matched 是下界时写「至少」，不把「不知道」说成「知道」）。 */
      function countText(part) {
        if (part.key === 'returned') return t('meta.returned', { count: part.value })
        if (part.key === 'matched') return t('meta.matched', { count: part.value })
        if (part.key === 'matchedAtLeast') return t('meta.matchedAtLeast', { count: part.value })
        if (part.key === 'scannedRows') return t('meta.scannedRows', { count: part.value })
        if (part.key === 'scannedBytes') return t('meta.scannedBytes', { count: part.value })
        return String(part.value)
      }

      const runQuery = async (append) => {
        const problem = queryProblem(query, drafts.length)
        if (problem !== '') {
          setError(problem === 'needTarget' ? t('error.needTarget') : t('error.badLimit'))
          return
        }
        setQuerying(true)
        setError('')
        setOk('')
        try {
          const payload = queryPayload(query, drafts, Date.now())
          if (append && cursor !== undefined) payload.cursor = cursor
          const data = await api('/api/dsh-loglens/query', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          })
          setOutcome(data)
          setLines((current) => (append ? appendLines(current, data.lines) : data.lines))
          setCursor(typeof data.nextCursor === 'string' ? data.nextCursor : undefined)
        } catch (err) {
          setError(err.message)
        } finally {
          setQuerying(false)
        }
      }

      /** 拉 Docker 面板自己的目标清单（拿不到就退回手填，不把整张卡片带下去）。 */
      const loadDockerTargets = async () => {
        try {
          const parsed = await api('/api/dsh-docker/config')
          const config = parsed.config === undefined || parsed.config === null ? {} : parsed.config
          setDockerTargets(Array.isArray(config.targets) ? config.targets : [])
        } catch {
          /* Docker 面板没装 / 未启用：保持手填 */
        }
      }

      const loadContainers = async () => {
        if (!docker || selectedDraft === undefined) return
        setDockerBusy(true)
        setError('')
        try {
          const parsed = await api('/api/dsh-docker/containers', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(selectedDraft.dockerTarget === '' ? { all: false } : { target: selectedDraft.dockerTarget, all: false }),
          })
          const list = Array.isArray(parsed.containers) ? parsed.containers : []
          setContainers(list)
          setContainer((current) => (current === '' && list.length > 0 ? list[0].id : current))
        } catch (err) {
          setError(err.message)
        } finally {
          setDockerBusy(false)
        }
      }

      const openDockerLogs = async () => {
        if (selectedDraft === undefined) return
        if (dockerProblem({ container }) !== '') {
          setError(t('error.needContainer'))
          return
        }
        setDockerBusy(true)
        setError('')
        try {
          const common = { id: container, tail: dockerTail, since: dockerSince(query.preset) }
          const parsed = await api('/api/dsh-docker/logs', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(selectedDraft.dockerTarget === '' ? common : { target: selectedDraft.dockerTarget, ...common }),
          })
          setDockerLogs(dockerLogTextOf(parsed))
          setDockerOpened(true)
        } catch (err) {
          setError(err.message)
        } finally {
          setDockerBusy(false)
        }
      }

      const clearResults = () => {
        setOutcome(undefined)
        setLines([])
        setCursor(undefined)
        setError('')
        setOk('')
      }

      if (view === 'summary') {
        return t('card.desc')
      }

      const selectedDraft = drafts.find((draft) => draft.id === query.target) === undefined
        ? (drafts.length === 1 ? drafts[0] : undefined)
        : drafts.find((draft) => draft.id === query.target)
      const isDocker = selectedDraft !== undefined && selectedDraft.kind === 'docker'

      const rows = drafts.map((draft, index) => jsxs('div', {
        className: 'll_row',
        key: 'loglens-row-' + String(index),
        children: [
          jsx('select', {
            className: 'll_input',
            value: draft.kind,
            disabled: saving,
            onChange: (event) => { updateDraft(index, { kind: event.target.value }) },
            children: kindOptions().map((kind) => jsx('option', { value: kind, children: kindLabel(kind) }, kind)),
          }),
          jsx('input', {
            className: 'll_input',
            placeholder: t('placeholder.label'),
            value: draft.label,
            disabled: saving,
            onChange: (event) => { updateDraft(index, { label: event.target.value }) },
          }),
          draft.kind === 'docker' ? jsx('select', {
            className: 'll_input',
            title: t('field.dockerTarget'),
            value: draft.dockerTarget,
            disabled: saving,
            onChange: (event) => { updateDraft(index, { dockerTarget: event.target.value }) },
            children: [
              jsx('option', { value: '', children: t('option.dockerAuto') }, 'll-docker-auto'),
              ...dockerTargetChoices(dockerTargets, draft.dockerTarget).map((choice) => jsx('option', {
                value: choice.value,
                children: choice.known
                  ? (choice.label === choice.value ? choice.value : choice.value + '（' + choice.label + '）')
                  : choice.value + t('hint.dockerTargetUnknown'),
              }, 'll-docker-' + choice.value)),
            ],
          }) : (draft.kind === 'elasticsearch' || draft.kind === 'opensearch') ? jsxs('div', {
            // ES / OpenSearch 多一行「索引表达式」：原先它是从地址路径悄悄推出来的（没写路径就成
            // 全集群通配），agent 与人都猜不到自己要打哪个范围——真机反馈第 3 条。
            className: 'll_stack',
            children: [
              jsx('input', {
                className: 'll_input',
                title: t('field.url'),
                placeholder: t('placeholder.url'),
                value: draft.url,
                disabled: saving,
                onChange: (event) => { updateDraft(index, { url: event.target.value }) },
              }),
              jsx('input', {
                className: 'll_input',
                title: t('hint.index'),
                placeholder: t('placeholder.index'),
                value: draft.index,
                disabled: saving,
                onChange: (event) => { updateDraft(index, { index: event.target.value }) },
              }),
            ],
          }) : jsx('input', {
            className: 'll_input',
            title: t('field.url'),
            placeholder: t('placeholder.url'),
            value: draft.url,
            disabled: saving,
            onChange: (event) => { updateDraft(index, { url: event.target.value }) },
          }),
          jsx('button', {
            type: 'button',
            className: 'll_btn',
            disabled: saving,
            onClick: () => { saveDraft(index) },
            children: saving ? t('btn.saving') : t('btn.save'),
          }),
          jsx('button', {
            type: 'button',
            className: 'll_btnGhost ll_btnDanger',
            disabled: saving,
            onClick: () => { removeDraft(index) },
            children: t('btn.remove'),
          }),
        ],
      }, 'loglens-row-' + String(index)))

      return jsxs(pageView ? 'div' : 'li', {
        className: pageView ? 'll_pageHost' : (open ? 'll_pluginCard ll_pluginCardOpen' : 'll_pluginCard'),
        children: [
          pageView ? null : jsxs('button', {
            type: 'button',
            className: 'll_cardHeader',
            'aria-expanded': open,
            onClick: () => setOpen((current) => !current),
            children: [
              jsxs('span', {
                className: 'll_cardHeadText',
                children: [
                  jsx('span', { className: 'll_cardName', children: t('card.name') }),
                  jsx('span', { className: 'll_cardDescription', children: t('card.desc') }),
                ],
              }),
              jsx('span', { className: 'dshkit_badge', children: enabled ? t('status.enabled') : t('status.disabled') }),
              jsx('svg', {
                width: '14',
                height: '14',
                viewBox: '0 0 14 14',
                fill: 'none',
                xmlns: 'http://www.w3.org/2000/svg',
                className: 'll_chevron',
                children: jsx('path', { d: CHEVRON_PATH, fill: 'currentColor' }),
              }),
            ],
          }),
          (pageView || open) ? jsx('div', {
            className: 'll_cardBody',
            children: jsxs('div', {
              className: 'll_panel',
              children: [
                jsxs('div', {
                  className: 'll_panelHeader',
                  children: [
                    jsx('span', { className: 'll_panelTitle', children: t('panel.title') }),
                    jsxs('label', {
                      className: 'll_switch',
                      children: [
                        jsx('input', {
                          type: 'checkbox',
                          checked: enabled,
                          disabled: saving,
                          onChange: (event) => { mutate({ action: 'enabled', enabled: event.target.checked }) },
                        }),
                        t('check.enabled'),
                      ],
                    }),
                  ],
                }),
                jsx('p', { className: 'll_hint', children: t('hint.notImplemented') }),
                jsxs('div', {
                  className: 'll_toolbar',
                  children: [
                    jsx('button', {
                      type: 'button',
                      className: 'll_btnGhost',
                      disabled: saving,
                      onClick: addDraft,
                      children: t('btn.add'),
                    }),
                    jsx('div', { className: 'll_toolbarSpacer' }),
                    error ? jsx('p', { className: 'll_error', children: error }) : (ok ? jsx('p', { className: 'll_ok', children: ok }) : null),
                  ],
                }),
                loading ? jsx('div', { className: 'll_loading', children: t('list.loading') }) : null,
                !loading && drafts.length === 0 ? jsx('div', { className: 'll_empty', children: t('list.empty') }) : null,
                drafts.length > 0 ? jsx('div', {
                  className: 'll_list',
                  children: [
                    jsxs('div', {
                      className: 'll_head',
                      children: [
                        jsx('span', { children: t('field.kind') }),
                        jsx('span', { children: t('field.label') }),
                        jsx('span', { children: t('field.url') }),
                        jsx('span', {}),
                        jsx('span', {}),
                      ],
                    }),
                    ...rows,
                  ],
                }) : null,
                drafts.length > 0 ? jsxs('div', {
                  className: 'll_query',
                  children: [
                    jsx('span', { className: 'll_panelTitle', children: t('section.query') }),
                    jsxs('div', {
                      className: 'll_queryGrid',
                      children: [
                        jsx('select', {
                          className: 'll_input',
                          title: t('field.target'),
                          value: query.target,
                          disabled: saving || querying || dockerBusy,
                          onChange: (event) => { setQuery((current) => ({ ...current, target: event.target.value })) },
                          children: drafts.map((draft) => jsx('option', { value: draft.id, children: draft.label === '' ? draft.id : draft.label }, draft.id)),
                        }),
                        isDocker ? null : jsx('input', {
                          className: 'll_input',
                          placeholder: t('placeholder.query'),
                          value: query.q,
                          disabled: saving || querying,
                          onChange: (event) => { setQuery((current) => ({ ...current, q: event.target.value })) },
                        }),
                        isDocker ? null : jsx('select', {
                          className: 'll_input',
                          title: t('field.window'),
                          value: query.preset,
                          disabled: saving || querying,
                          onChange: (event) => { setQuery((current) => ({ ...current, preset: event.target.value })) },
                          children: windowOptions().map((key) => jsx('option', { value: key, children: windowLabel(key) }, key)),
                        }),
                        isDocker ? null : jsx('input', {
                          className: 'll_input',
                          title: t('field.limit'),
                          type: 'number',
                          min: '1',
                          value: String(query.limit),
                          disabled: saving || querying,
                          onChange: (event) => { setQuery((current) => ({ ...current, limit: Number(event.target.value) })) },
                        }),
                        isDocker ? null : jsx('button', {
                          type: 'button',
                          className: 'll_btn',
                          disabled: saving || querying,
                          onClick: () => { runQuery(false) },
                          children: querying ? t('btn.querying') : t('btn.query'),
                        }),
                      ],
                    }),
                    isDocker ? jsxs('div', {
                      className: 'll_queryGrid',
                      children: [
                        jsx('button', {
                          type: 'button',
                          className: 'll_btnGhost',
                          disabled: dockerBusy || !docker,
                          onClick: () => { loadContainers() },
                          children: t('btn.containers'),
                        }),
                        jsx('select', {
                          className: 'll_input',
                          title: t('field.container'),
                          value: container,
                          disabled: dockerBusy || !docker,
                          onChange: (event) => { setContainer(event.target.value) },
                          children: [
                            jsx('option', { value: '', children: t('field.container') }, 'll-container-none'),
                            ...containers.map((item) => jsx('option', { value: item.id, children: item.name === undefined || item.name === '' ? item.id : item.name }, item.id)),
                          ],
                        }),
                        jsx('select', {
                          className: 'll_input',
                          title: t('field.window'),
                          value: query.preset,
                          disabled: dockerBusy || !docker,
                          onChange: (event) => { setQuery((current) => ({ ...current, preset: event.target.value })) },
                          children: windowOptions().map((key) => jsx('option', { value: key, children: windowLabel(key) }, 'll-dw-' + key)),
                        }),
                        jsx('select', {
                          className: 'll_input',
                          title: t('field.tail'),
                          value: String(dockerTail),
                          disabled: dockerBusy || !docker,
                          onChange: (event) => { setDockerTail(Number(event.target.value)) },
                          children: [50, 100, 200, 500].map((value) => jsx('option', { value: String(value), children: String(value) }, 'll-tail-' + String(value))),
                        }),
                        jsx('button', {
                          type: 'button',
                          className: 'll_btn',
                          disabled: dockerBusy || !docker,
                          onClick: () => { openDockerLogs() },
                          children: dockerBusy ? t('btn.logsLoading') : t('btn.logs'),
                        }),
                      ],
                    }) : null,
                    isDocker
                      ? jsx('p', { className: 'll_hint', children: docker ? t('hint.docker') : t('hint.dockerMissing') })
                      : jsx('p', { className: 'll_hint', children: t('hint.query') }),
                    isDocker && dockerOpened && dockerLogLines(dockerLogs).length > 0 ? jsx('div', {
                      className: 'll_results',
                      children: dockerLogLines(dockerLogs).map((text, at) => jsx('div', {
                        className: 'll_resultRow',
                        children: jsx('span', { className: 'll_resultMsg', children: text }),
                      }, 'll-docker-' + String(at))),
                    }) : null,
                    isDocker && dockerOpened && dockerLogLines(dockerLogs).length === 0 ? jsx('div', {
                      className: 'll_empty',
                      children: t('list.noLogs'),
                    }) : null,
                    outcome === undefined || isDocker ? null : jsxs('div', {
                      className: 'll_queryMeta',
                      children: [
                        countsParts(outcome.counts === undefined ? { returned: 0 } : outcome.counts).map((part) => jsx('span', { children: countText(part) }, 'll-count-' + part.key)),
                        outcome.truncation !== undefined && outcome.truncation.truncated === true
                          ? jsx('span', { className: 'll_warn', children: t('meta.truncated', { reasons: (outcome.truncation.reasons === undefined ? [] : outcome.truncation.reasons).map((reason) => reasonText(reason)).join(' / ') }) })
                          : null,
                        outcome.hint === undefined ? null : jsx('span', { className: 'll_warn', children: outcome.hint }),
                        // warnings 是宿主对这次查询做过什么调整（夹了 limit、兜了时间窗）——**不许吞掉**：
                        // agent 工具看得到的东西，面板也得看得到
                        ...(outcome.warnings === undefined ? [] : outcome.warnings.map((text, at) => jsx('span', { className: 'll_warn', children: text }, 'll-warn-' + String(at)))),
                        jsx('button', { type: 'button', className: 'll_btnGhost', disabled: querying, onClick: clearResults, children: t('btn.clear') }),
                      ],
                    }),
                    lines.length > 0 && !isDocker ? jsx('div', {
                      className: 'll_results',
                      children: lines.map((line) => jsxs('div', {
                        className: 'll_resultRow',
                        children: [
                          jsx('span', { className: 'll_resultTime', children: formatTime(line.ts) }),
                          jsx('span', { className: 'll_resultLevel', children: line.level === undefined ? '' : line.level }),
                          jsx('span', { className: 'll_resultMsg', children: line.message }),
                        ],
                      }, 'll-line-' + line.id)),
                    }) : null,
                    outcome !== undefined && lines.length === 0 && !isDocker ? jsx('div', { className: 'll_empty', children: t('list.noHit') }) : null,
                    cursor === undefined || isDocker ? null : jsx('button', {
                      type: 'button',
                      className: 'll_btnGhost',
                      disabled: querying,
                      onClick: () => { runQuery(true) },
                      children: t('btn.nextPage'),
                    }),
                  ],
                }) : null,
              ],
            }),
          }) : null,
        ],
      })
    }

    /* ================================ 插件入口 ================================ */

    exports.inject = ['slots']

    /**
     * DSH ≥0.1.6-alpha.2 的行配置 key：<bundle 包名>#<行 id>，行 id 取自 bundle 的
     * cordis.patch.yml。独立安装时 bundle 是本包，装全家桶时是 @hyzyn/dsh-all —— 两个都
     * 注册，未命中的那个只是躺在 ledger 里，不会渲染。
     */
    const ROW_CONFIG_KEYS = [
      '@hyzyn/dsh-loglens#loglens',
      '@hyzyn/dsh-all#loglens',
    ]

    exports.apply = (ctx) => {
      installI18n(ctx)
      ctx.effect(() => {
        ensureStyle()
        return () => {
          styleEl?.remove()
          styleEl = undefined
        }
      })
      /*
       * 设置面：0.2.0-rc.1 起挂 `plugins.bundle.config`——key 是 **bundle 包名**，管理器的插件
       * 详情页把它渲染在「说明」正下方；`plugins.row.config` 是 per-row 的「>」子页。
       *
       * 两条硬约束（第一条踩过坑，见下）：
       *   ① `plugins.bundle.config` 的 key 是**共享命名空间**：同一个 key 只能有一个注册者，
       *      重复注册**直接抛错**（`keyed slot ... already has an entry`），而客户端 `apply`
       *      抛错 = 整个插件起不来（实测：把 `@hyzyn/dsh-all` 也挂上时，八个插件抢同一个 key，
       *      启动页直接变「Failed to load plugins」）（D158）。聚合包 `@hyzyn/dsh-all` 是所有插件共用的
       *      bundle，**不能**挂 bundle.config —— 它没有内联位，设置面走它自己的 row 入口。
       *   ② 内联位可用时，**本包自己的** bundle 不再注册 row 槽（同一份表单两个入口会让人以为
       *      有两套设置）；聚合包那份 row 入口**保留**（那是它在聚合安装下的唯一入口）。旧宿主
       *      （bundle 槽不存在，0.1.6 线）回退注册全部 row 槽，功能一点不减。
       * 就绪顺序不敏感：任一侧先到都收敛到「内联优先」（后到的本包 row 注册会被撤掉）。
       */
      const AGGREGATE_BUNDLE = '@hyzyn/dsh-all'
      const BUNDLE_NAMES = [...new Set(ROW_CONFIG_KEYS.map((key) => key.split('#')[0]))]
      const OWN_BUNDLE = BUNDLE_NAMES.find((name) => name !== AGGREGATE_BUNDLE)
      let bundleConfigLive = false
      const disposeOwnRowConfigs = []
      if (OWN_BUNDLE !== undefined) {
        ctx.slots.inject('plugins.bundle.config', () => {
          bundleConfigLive = true
          while (disposeOwnRowConfigs.length > 0) {
            const disposeRow = disposeOwnRowConfigs.pop()
            if (typeof disposeRow === 'function') disposeRow()
          }
          return ctx.slots.register({
            name: 'plugins.bundle.config',
            key: OWN_BUNDLE,
          }, LoglensSettingsCard)
        })
      }
      for (const key of ROW_CONFIG_KEYS) {
        ctx.slots.inject('plugins.row.config', () => {
          const own = key.split('#')[0] === OWN_BUNDLE
          if (own && bundleConfigLive) return undefined
          const disposeRow = ctx.slots.register({
            name: 'plugins.row.config',
            key,
          }, LoglensSettingsCard)
          if (own) disposeOwnRowConfigs.push(disposeRow)
          return disposeRow
        })
      }
      // DSH ≥0.1.6：设置里与「通用设置」平级的「插件配置」页（子 slot 由
      // @hyzyn/dsh-kit-settings 声明）。不传 view，卡片走各自原有的可折叠形态。
      ctx.slots.inject('settings.kit.item', () => ctx.slots.register({
        name: 'settings.kit.item',
        id: 'loglens',
        order: 12,
        label: () => t('card.name'),
      }, LoglensSettingsCard))
      // DSH ≤0.1.5：设置 → 插件 的「插件配置」标签页，keyed 插槽按 settings 命名空间派发。
      ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
        name: 'settings.plugin.item',
        key: 'loglens',
        order: 99,
      }, LoglensSettingsCard))
    }

    return exports
  },
})
