/* eslint-disable */
/**
 * @hyzyn/dsh-devenv — 浏览器半体：官方「插件配置」里的一张卡片。
 *
 * ## 为什么有这张卡片
 *
 * 这一版宿主**没有**任何客户端代码消费 `autoGenerate`，所以「按 Config schema 生成表单」这条路
 * 走不通——各插件的卡片都得自己写（`tty` / `docker` / `devfront` 同款）。于是本插件此前**只能**
 * 在 `~/.dsh/profiles/<profile>/cordis.patch.yml` 里手改配置：目标名单、超时、审计出口全都没有 UI，
 * 而工具报出来的「配置问题」（`scopeDirs` 为空 = 处处拒绝、`kind` 认不出…）用户没有地方去改。
 *
 * ## 这张卡片**能改什么、不能改什么**（边界是判据，不是排版）
 *
 * | 面 | 能不能改 | 为什么 |
 * |---|---|---|
 * | 标量（`enabled` / `announceToAgent` / `auditFile` / `probeTimeoutMs` / `waitTimeoutMs` / `pollIntervalMs`） | ✅ 可改 | 它们只影响「怎么看 / 等多久」，不影响「谁能碰什么」 |
 * | 目标（`id` / `label` / `kind` / `book` / `scopeDirs`） | ✅ 可改，**逐次确认** | 它决定「agent 能用哪些目标、在哪些目录里动手」，与就绪清单同一类声明 → 每次保存都要勾确认框（`confirmTargetEdit`），且进审计 |
 * | `writeCapability` | ❌ **只读** | 它声明的环境变量名就是授权判据，而卡片能写配置——名字能改就等于**免重启提权**（宿主侧直接 400，码 `CAPABILITY_READONLY`） |
 * | `hostKeys`（TOFU 指纹） | ❌ 只读展示 | 改它等于放弃指纹校验；卡片只摆 host / 端口 / 指纹**条数** |
 *
 * 数据面是宿主那条 `GET/POST /api/dsh-devenv/config`（同源相对路径：宿主地址一律不硬编码，
 * 静态规则见 `scripts/client-lint.mjs`）。
 */
window.__ModuleLoader__.load({
  id: '@hyzyn/dsh-devenv',
  factory: (require) => {
    const exports = {}

    const React = require('react')
    const { jsx, jsxs } = require('react/jsx-runtime')

    const CONFIG_PATH = '/api/dsh-devenv/config'

    /* ================================ CSS ================================ */

    /*
     * devenv D04：样式变量只许写宿主主题里**真实存在**的名字。
     *
     * 变量不存在时那条声明在**计算值阶段**整条作废（`border` 是 shorthand，它的所有 longhand
     * 一起回落 `unset`，而 `border-style` 的初始值就是 `none`）——框会**直接消失**，而布局类
     * 声明照常生效。名字表是生成物 `scripts/fixtures/dsh-theme-tokens.json`，判据在
     * `scripts/client-lint.mjs` 的检查 ③。
     *
     * 版式与 `devdata` 那张卡同一套：**面板 → 目标行 → 只读档**三层，字段走两列栅格
     * （窄窗口回落单列），主色只出现在「保存」。
     *
     * 三条**不能动**的约束（`scripts/verify-devenv-card.mjs` 的 ㉓ 按它们定位）：
     *   - 「+ 添加目标」按钮必须在编辑器那层 `.dv_card` 里（脚本用 `add.closest('.dv_card')` 找它，
     *     为的是**确认框不能在标量那一层**被先命中）；
     *   - 目标行的 5 个字段必须带 `dv_input` 且**顺序不变**（id / 文案 / kind / 连接簿条目 / 作用域）；
     *   - 编辑器那层里**不许出现别的复选框**（`editor.querySelector('input[type="checkbox"]')`）。
     */
    const CSS = [
      '.dv_card{display:flex;flex-direction:column;gap:14px;max-width:880px;color:var(--dsw-alias-label-primary);font-size:13px}',

      /* 头部 */
      '.dv_head{display:flex;flex-direction:column;gap:3px}',
      '.dv_name{margin:0;font-size:15px;font-weight:600;letter-spacing:.01em}',
      '.dv_desc{margin:0;font-size:12px;line-height:1.55;color:var(--dsw-alias-label-tertiary)}',

      /* 分组面板 */
      '.dv_panel{display:flex;flex-direction:column;gap:12px;padding:14px;border:1px solid var(--dsw-alias-settings-card-stroke);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-settings-card-fill)}',
      '.dv_panelHead{display:flex;align-items:center;gap:8px}',
      '.dv_panelTitle{margin:0;font-size:13px;font-weight:600}',
      '.dv_count{padding:0 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary)}',

      /* 表单栅格：固定两列；`dv_wide` 给长文本字段（URL / 目录清单）占满一行 */
      '.dv_grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 12px}',
      '@media (max-width:640px){.dv_grid{grid-template-columns:minmax(0,1fr)}}',
      '.dv_wide{grid-column:1/-1}',
      '.dv_field{display:flex;flex-direction:column;gap:5px;margin:0;min-width:0}',
      '.dv_label{font-size:12px;font-weight:500;line-height:16px;color:var(--dsw-alias-label-secondary)}',
      '.dv_hint{margin:0;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}',

      /* 输入控件 */
      '.dv_input{box-sizing:border-box;width:100%;padding:6px 9px;border:1px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-sm);background:var(--dsw-specific-input-major);color:inherit;font-size:13px;line-height:18px}',
      '.dv_input:hover:not(:disabled){border-color:var(--dsw-alias-label-dimmed)}',
      '.dv_input:focus,.dv_input:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}',
      '.dv_input:disabled{opacity:.55;cursor:not-allowed}',

      /* 开关 */
      '.dv_switch{display:flex;align-items:flex-start;gap:9px;cursor:pointer}',
      '.dv_switch input{width:14px;height:14px;margin:1px 0 0;flex:none;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}',
      '.dv_switchText{display:flex;flex-direction:column;gap:2px;min-width:0}',

      /* 列表（目标 / 写闸门 / 指纹三处共用同一套行样式） */
      '.dv_list{display:flex;flex-direction:column;gap:10px;margin:0;padding:0;list-style:none}',
      '.dv_item{display:flex;flex-direction:column;gap:10px;padding:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-3)}',
      '.dv_itemHead{display:flex;align-items:center;gap:8px;min-height:22px}',
      '.dv_ordinal{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;flex:none;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:var(--dsw-alias-bg-layer-2);font-size:11px;color:var(--dsw-alias-label-tertiary)}',
      '.dv_itemName{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',

      /* 状态胶囊：一个色 + 一个点 */
      '.dv_chip{display:inline-flex;align-items:center;gap:5px;flex:none;padding:1px 8px;border:1px solid currentColor;border-radius:999px;font-size:11px;line-height:16px}',
      '.dv_dot{width:5px;height:5px;flex:none;border-radius:50%;background:currentColor}',
      '.dv_chipOk{color:var(--dsw-alias-state-success-primary)}',
      '.dv_chipWarn{color:var(--dsw-alias-state-warn-label)}',
      '.dv_chipIdle{color:var(--dsw-alias-label-tertiary)}',

      /* 只读详情块：写闸门那一段的两列网格（名字一列、口径在右） */
      '.dv_gate{display:grid;grid-template-columns:minmax(0,180px) 1fr;gap:2px 10px;align-items:baseline;margin:0}',
      '.dv_gateName{font-family:var(--dsw-font-markdown-code-font-family);font-size:12px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere;line-height:16px}',
      '.dv_gateMeta{margin:0;grid-column:2;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}',
      '.dv_key{font-family:var(--dsw-font-markdown-code-font-family);font-size:12px;color:var(--dsw-alias-label-secondary)}',

      /* 空态与确认提示 */
      '.dv_empty{margin:0;padding:16px;border:1px dashed var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);font-size:12px;line-height:1.6;color:var(--dsw-alias-label-tertiary);text-align:center}',
      '.dv_confirm{display:flex;align-items:flex-start;gap:9px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-left:3px solid var(--dsw-alias-state-warn-primary);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-2);cursor:pointer}',
      '.dv_confirm input{width:14px;height:14px;margin:1px 0 0;flex:none;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}',

      /* 按钮 */
      '.dv_btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:6px 14px;border:1px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:13px;line-height:18px;cursor:pointer;transition:background .16s,border-color .16s}',
      '.dv_btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
      '.dv_btnGhost{border-style:dashed;background:transparent;color:var(--dsw-alias-label-secondary)}',
      '.dv_addBtn{align-self:flex-start}',
      '.dv_btnPrimary{border-color:transparent;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-inverted);font-weight:500}',
      '.dv_btnPrimary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}',
      '.dv_btnPrimary:disabled{border-color:transparent;background:var(--dsw-alias-button-primary-dimmed);color:var(--dsw-alias-label-tertiary);cursor:default}',
      '.dv_remove{margin-left:auto;flex:none;padding:3px 10px;border:1px solid transparent;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-tertiary);font-size:12px;cursor:pointer}',
      '.dv_remove:hover{background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary)}',

      /* 底部动作条 */
      '.dv_actions{display:flex;align-items:center;gap:12px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l1)}',
      '.dv_msg{margin:0;font-size:12px}',
      '.dv_msgOk{color:var(--dsw-alias-state-success-primary)}',
      '.dv_msgErr{color:var(--dsw-alias-state-error-primary)}',
      '.dv_spacer{flex:1}',
    ]

    let styleEl

    function ensureStyle() {
      if (styleEl !== undefined && styleEl.isConnected) return
      styleEl = document.createElement('style')
      styleEl.textContent = CSS.join('\n')
      document.head.appendChild(styleEl)
    }

    /* ================================ 国际化 ================================ */

    /*
     * 界面文案走宿主 `@deepseek-ai/dsh-client-locale` 的目录（方案见 docs/i18n.md，
     * 静态校验见 `scripts/check-i18n.mjs`）。目录内联在 client.js 里——本包没有构建步骤，
     * client.js 就是源。
     */
    /* ==== dsh-i18n:begin ==== */
    const I18N_NS = 'devenv'
    const I18N_ZH = {
      'card.name': '环境编排',
      'card.desc': '判容器 / 端口 / 探针的状态（环境就绪）：看一眼现在什么样，或等到就绪、等到明确没戏。',
      'section.config': '插件配置',
      'section.targets': '目标（可改）',
      'section.writeGate': '写闸门（只读）',
      'section.hostKeys': 'TOFU 指纹记录（只读）',
      'btn.addTarget': '+ 添加目标',
      'btn.removeTarget': '删除',
      'btn.save': '保存',
      'btn.saving': '保存中…',
      /* 字段文案拆成「短标签 + 灰色口径小字」两键：标签一眼扫得过，口径不丢（见 card.desc 上方说明） */
      'field.targetId': 'id',
      'field.targetId.hint': '工具按它选目标',
      'field.targetLabel': '名字',
      'field.targetKind': '来源',
      'field.targetBook': 'tty 连接簿条目名',
      'field.targetBook.hint': 'kind = ssh 时必填',
      'field.targetScope': '作用域目录',
      'field.targetScope.hint': '逗号分隔；空 = 处处拒绝（不是「不限制」）',
      'field.auditFile': '持久审计文件',
      'field.auditFile.hint': '留空 = 只进宿主日志',
      'field.probeTimeoutMs': 'HTTP 探针超时',
      'field.probeTimeoutMs.hint': '毫秒',
      'field.waitTimeoutMs': 'env_wait 缺省总超时',
      'field.waitTimeoutMs.hint': '毫秒',
      'field.pollIntervalMs': '轮询间隔',
      'field.pollIntervalMs.hint': '毫秒',
      'option.kindLocal': 'local（在宿主这台机器上跑 docker）',
      'option.kindSsh': 'ssh（经连接簿连过去）',
      'check.enabled': '启用本插件',
      'check.announce': '向 agent 注入能力公告',
      'check.confirmTargets': '我知道这会写进 profile 补丁层（~/.dsh/profiles/<profile>/cordis.patch.yml），并进审计',
      'hint.targets': '空的作用域目录不是「不限制」：它意味着处处拒绝——不填就不授权。改目标会影响「agent 能用哪些目标、在哪些目录里动手」。',
      'hint.writeGateReadonly': '这一档只读：声明的环境变量名就是授权判据（宿主启动环境里该变量值 ∈ 1/true/yes/on 才算授权），而这张卡片能写配置——把它指向另一个恰好为真的变量就等于免重启提权。要改请改 profile 补丁层。',
      'hint.writeGateUndeclared': '没声明 writeCapability 的目标 = env_up / env_down 根本不注册（工具面里没有的东西，agent 不会去试）。',
      'hint.hostKeys': '指纹由 TOFU 自己维护（种子来自 tty 的连接簿）；这里只摆出来，改它等于放弃指纹校验。',
      'list.emptyTargets': '还没有配置任何目标——卡片不编一个默认目标出来（来源与作用域都该由你声明）。',
      'list.emptyHostKeys': '还没有记录任何主机指纹。',
      'status.granted': '已授权',
      'status.notGranted': '未授权',
      'status.notDeclared': '未声明写闸门',
      'meta.envName': '声明的环境变量：{env}',
      'meta.howTo': '怎么授权：{howTo}',
      'meta.hostKey': '{host}:{port} · 指纹 {count} 条',
      'msg.saved': '已保存',
      'msg.targetsSaved': '目标已保存（进审计）',
      'msg.savedNotPersisted': '已在本进程生效，但宿主没有 settings 服务，没有落盘',
      'msg.targetsNeedConfirm': '改目标要先勾选下面那个确认框：它会影响「agent 能用哪些目标、在哪些目录里动手」。',
      'msg.loading': '正在读取配置…',
      'msg.loadFailed': '读取配置失败：',
      'msg.saveFailed': '保存失败：',
    }
    const I18N_EN = {
      'card.name': 'Environment orchestration',
      'card.desc': 'Judges the state of containers, ports and probes (environment readiness): take a look now, or wait until ready / until clearly refuted.',
      'section.config': 'Plugin configuration',
      'section.targets': 'Targets (editable)',
      'section.writeGate': 'Write gate (read-only)',
      'section.hostKeys': 'TOFU host keys (read-only)',
      'btn.addTarget': '+ Add a target',
      'btn.removeTarget': 'Remove',
      'btn.save': 'Save',
      'btn.saving': 'Saving…',
      'field.targetId': 'id',
      'field.targetId.hint': 'Tools pick the target by it',
      'field.targetLabel': 'Name',
      'field.targetKind': 'Source',
      'field.targetBook': 'tty connection book entry',
      'field.targetBook.hint': 'Required when kind = ssh',
      'field.targetScope': 'Scope dirs',
      'field.targetScope.hint': 'Comma separated; empty = deny everywhere (not "unrestricted")',
      'field.auditFile': 'Durable audit file',
      'field.auditFile.hint': 'Empty = host log only',
      'field.probeTimeoutMs': 'HTTP probe timeout',
      'field.probeTimeoutMs.hint': 'Milliseconds',
      'field.waitTimeoutMs': 'env_wait default total timeout',
      'field.waitTimeoutMs.hint': 'Milliseconds',
      'field.pollIntervalMs': 'Poll interval',
      'field.pollIntervalMs.hint': 'Milliseconds',
      'option.kindLocal': 'local (run docker on the host machine)',
      'option.kindSsh': 'ssh (connect through the connection book)',
      'check.enabled': 'Enable this plugin',
      'check.announce': 'Inject the capability notice to the agent',
      'check.confirmTargets': 'I understand this is written into the profile patch layer (~/.dsh/profiles/<profile>/cordis.patch.yml) and audited',
      'hint.targets': 'An empty scope dir list is not "unrestricted" — it means deny everywhere: no dirs, no authorization. Editing targets changes which targets, and which dirs, the agent may touch.',
      'hint.writeGateReadonly': 'Read-only: the declared env var name IS the authorization rule (granted only when that startup-env var is 1/true/yes/on), and this card can write configuration — pointing it at another already-truthy variable would be an escalation without a restart. Change it in the profile patch layer instead.',
      'hint.writeGateUndeclared': 'A target without writeCapability = env_up / env_down are not registered at all (an agent never tries what the tool surface does not show).',
      'hint.hostKeys': 'Host keys are maintained by TOFU (seeded from the tty connection books); shown here only — editing them means giving up fingerprint verification.',
      'list.emptyTargets': 'No targets configured yet — the card will not invent one (source and scope must be declared by you).',
      'list.emptyHostKeys': 'No host fingerprints recorded yet.',
      'status.granted': 'granted',
      'status.notGranted': 'not granted',
      'status.notDeclared': 'no write gate declared',
      'meta.envName': 'Declared env var: {env}',
      'meta.howTo': 'How to grant: {howTo}',
      'meta.hostKey': '{host}:{port} · {count} fingerprints',
      'msg.saved': 'Saved',
      'msg.targetsSaved': 'Targets saved (audited)',
      'msg.savedNotPersisted': 'Applied in this process, but the host has no settings service — nothing was persisted',
      'msg.targetsNeedConfirm': 'Tick the confirmation box first: this changes which targets, and which dirs, the agent may touch.',
      'msg.loading': 'Loading configuration…',
      'msg.loadFailed': 'Failed to load configuration: ',
      'msg.saveFailed': 'Failed to save: ',
    }
    /* ==== dsh-i18n:end ==== */

    /** 占位符替换：`{name}` → params.name（缺参留空，不抛错——文案不该打死界面）。 */
    function i18nFormat(text, params) {
      if (params === undefined) return text
      return String(text).replace(/\{(\w+)\}/g, (_match, name) => (params[name] === undefined ? '' : String(params[name])))
    }

    /** 中文兜底：老宿主（DSH ≤0.1.5）没有 locale 服务时，界面不能变成一串键名。 */
    function i18nFallback(key, params) {
      return i18nFormat(I18N_ZH[key] !== undefined ? I18N_ZH[key] : key, params)
    }

    let t = i18nFallback

    /** 注册目录并绑定翻译函数（动态 inject：老宿主上保持中文兜底，卡片照挂）。 */
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

    /* ================================= 卡片 ================================= */

    /** 只把**可改的标量**挑出来（快照里还有只读档，卡片不往表单里放）。 */
    function pickScalars(config) {
      return {
        enabled: config.enabled === true,
        announceToAgent: config.announceToAgent !== false,
        auditFile: typeof config.auditFile === 'string' ? config.auditFile : '',
        probeTimeoutMs: Number.isInteger(config.probeTimeoutMs) ? config.probeTimeoutMs : 3000,
        waitTimeoutMs: Number.isInteger(config.waitTimeoutMs) ? config.waitTimeoutMs : 180000,
        pollIntervalMs: Number.isInteger(config.pollIntervalMs) ? config.pollIntervalMs : 3000,
      }
    }

    /** 快照里的目标 → **可编辑草稿**（`scopeDirs` 用逗号拼起来，方便一个输入框改）。 */
    function draftTargets(config) {
      const rows = Array.isArray(config.targets) ? config.targets : []
      return rows.map((target) => ({
        id: typeof target.id === 'string' ? target.id : '',
        label: typeof target.label === 'string' ? target.label : '',
        kind: target.kind === 'ssh' ? 'ssh' : 'local',
        book: typeof target.book === 'string' ? target.book : '',
        scopeDirs: Array.isArray(target.scopeDirs) ? target.scopeDirs.join(', ') : '',
      }))
    }

    /** 逗号分隔 → 字符串数组（空项丢掉；**不去重、不排序**：顺序是用户的意图）。 */
    function splitList(value) {
      return String(value)
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item !== '')
    }

    /** 草稿 → 提交给宿主的 payload（空字段**不占位**，让「没写」保持没写）。 */
    function targetsPayload(rows) {
      return rows.map((row) => ({
        id: row.id.trim(),
        kind: row.kind === 'ssh' ? 'ssh' : 'local',
        ...(row.label.trim() === '' ? {} : { label: row.label.trim() }),
        ...(row.book.trim() === '' ? {} : { book: row.book.trim() }),
        scopeDirs: splitList(row.scopeDirs),
      }))
    }

    function DevenvCard() {
      const [config, setConfig] = React.useState(null)
      const [form, setForm] = React.useState(null)
      const [targets, setTargets] = React.useState([])
      const [targetsFromServer, setTargetsFromServer] = React.useState([])
      const [confirmTargets, setConfirmTargets] = React.useState(false)
      const [busy, setBusy] = React.useState(false)
      const [message, setMessage] = React.useState({ text: '', kind: '' })

      const load = React.useCallback(() => {
        fetch(CONFIG_PATH, { cache: 'no-store' })
          .then((res) => res.json())
          .then((data) => {
            if (data !== null && typeof data === 'object' && data.ok === true && typeof data.config === 'object') {
              setConfig(data.config)
              setForm(pickScalars(data.config))
              setTargets(draftTargets(data.config))
              setTargetsFromServer(draftTargets(data.config))
              return
            }
            setMessage({ text: t('msg.loadFailed') + String(data && data.error ? data.error : ''), kind: 'err' })
          })
          .catch((error) => {
            setMessage({ text: t('msg.loadFailed') + String(error && error.message ? error.message : error), kind: 'err' })
          })
      }, [])

      React.useEffect(() => {
        load()
      }, [load])

      const setField = (key, value) => {
        setForm((prev) => (prev === null ? prev : { ...prev, [key]: value }))
      }

      const setTargetField = (index, key, value) => {
        setTargets((rows) => rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)))
      }

      const targetsDirty = JSON.stringify(targets) !== JSON.stringify(targetsFromServer)

      const save = () => {
        if (form === null || busy) return
        if (targetsDirty && !confirmTargets) {
          setMessage({ text: t('msg.targetsNeedConfirm'), kind: 'err' })
          return
        }
        setBusy(true)
        setMessage({ text: '', kind: '' })
        const payload = { ...form }
        if (targetsDirty) {
          payload.targets = targetsPayload(targets)
          payload.confirmTargetEdit = true
        }
        fetch(CONFIG_PATH, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        })
          .then((res) => res.json())
          .then((data) => {
            setBusy(false)
            if (data === null || typeof data !== 'object' || data.ok !== true) {
              setMessage({ text: t('msg.saveFailed') + String(data && data.error ? data.error : ''), kind: 'err' })
              return
            }
            setConfig(data.config)
            setForm(pickScalars(data.config))
            setTargets(draftTargets(data.config))
            setTargetsFromServer(draftTargets(data.config))
            setConfirmTargets(false)
            const done = targetsDirty ? t('msg.targetsSaved') : t('msg.saved')
            setMessage({ text: data.persisted === false ? t('msg.savedNotPersisted') : done, kind: data.persisted === false ? 'err' : 'ok' })
          })
          .catch((error) => {
            setBusy(false)
            setMessage({ text: t('msg.saveFailed') + String(error && error.message ? error.message : error), kind: 'err' })
          })
      }

      const toggle = (key, label, hint) =>
        jsxs('label', {
          className: 'dv_switch',
          children: [
            jsx('input', {
              type: 'checkbox',
              checked: form !== null && form[key] === true,
              disabled: form === null,
              onChange: (event) => {
                setField(key, event.target.checked)
              },
            }),
            jsxs('span', {
              className: 'dv_switchText',
              children: [
                jsx('span', { className: 'dv_label', children: label }),
                hint === undefined ? null : jsx('span', { className: 'dv_hint', children: hint }),
              ],
            }),
          ],
        })

      /** 文本 / 数字字段（数字字段的界由宿主再判一遍：非法值一律 400，不先落地）。`wide` = 占满整行。 */
      const scalarField = (key, label, numeric, hint, wide) =>
        jsxs('label', {
          className: wide === true ? 'dv_field dv_wide' : 'dv_field',
          children: [
            jsx('span', { className: 'dv_label', children: label }),
            jsx('input', {
              className: 'dv_input',
              type: numeric === true ? 'number' : 'text',
              value: form === null ? '' : String(form[key]),
              disabled: form === null,
              onChange: (event) => {
                setField(key, numeric === true ? Number(event.target.value) : event.target.value)
              },
            }),
            hint === undefined ? null : jsx('span', { className: 'dv_hint', children: hint }),
          ],
        })

      /** 目标草稿的一个字段（短标签 + 输入框 + 可选小字）。 */
      const targetField = (index, key, label, hint, wide) =>
        jsxs('label', {
          className: wide === true ? 'dv_field dv_wide' : 'dv_field',
          children: [
            jsx('span', { className: 'dv_label', children: label }),
            jsx('input', {
              className: 'dv_input',
              type: 'text',
              value: targets[index] === undefined ? '' : String(targets[index][key]),
              onChange: (event) => {
                setTargetField(index, key, event.target.value)
              },
            }),
            hint === undefined ? null : jsx('span', { className: 'dv_hint', children: hint }),
          ],
        })

      /** 目标草稿的 `kind`（只给 local / ssh 两个选项——认不出的宿主会拒）。 */
      const targetKind = (index) =>
        jsxs('label', {
          className: 'dv_field',
          children: [
            jsx('span', { className: 'dv_label', children: t('field.targetKind') }),
            jsx('select', {
              className: 'dv_input',
              value: targets[index] !== undefined && targets[index].kind === 'ssh' ? 'ssh' : 'local',
              onChange: (event) => {
                setTargetField(index, 'kind', event.target.value)
              },
              children: [
                jsx('option', { value: 'local', children: t('option.kindLocal') }),
                jsx('option', { value: 'ssh', children: t('option.kindSsh') }),
              ],
            }),
          ],
        })

      /*
       * 写闸门快照按 targetId 索引：目标行头上那颗胶囊与下面那张只读表用的是**同一份事实**
       * （`config.writeGates`，宿主侧 `writeGateSnapshot`）。没有条目 = 没声明写闸门。
       */
      const gates = config !== null && Array.isArray(config.writeGates) ? config.writeGates : []
      const gateByTarget = {}
      for (const gate of gates) {
        if (gate !== null && typeof gate === 'object' && typeof gate.targetId === 'string') gateByTarget[gate.targetId] = gate
      }

      /** 一档写闸门的胶囊（判据只有一条：有没有声明、声明了有没有授权）。 */
      const gateChip = (gate) => {
        if (gate === undefined || gate.declared !== true) {
          return jsxs('span', {
            className: 'dv_chip dv_chipIdle',
            children: [jsx('span', { className: 'dv_dot' }), t('status.notDeclared')],
          })
        }
        const granted = gate.granted === true
        return jsxs('span', {
          className: 'dv_chip ' + (granted ? 'dv_chipOk' : 'dv_chipWarn'),
          title: String(gate.env),
          children: [jsx('span', { className: 'dv_dot' }), granted ? t('status.granted') : t('status.notGranted')],
        })
      }

      const targetEditor = jsxs('div', {
        // **这一层必须叫 `dv_card`**：验收脚本 ㉓ 用 `add.closest('.dv_card')` 定位编辑器
        className: 'dv_card dv_panel',
        children: [
          jsxs('div', {
            className: 'dv_panelHead',
            children: [
              jsx('span', { className: 'dv_panelTitle', children: t('section.targets') }),
              jsx('span', { className: 'dv_count', children: String(targets.length) }),
            ],
          }),
          jsx('p', { className: 'dv_hint', children: t('hint.targets') }),
          targets.length === 0
            ? jsx('p', { className: 'dv_empty', children: t('list.emptyTargets') })
            : jsx('ul', {
                className: 'dv_list',
                children: targets.map((row, index) =>
                  jsxs(
                    'li',
                    {
                      className: 'dv_item',
                      children: [
                        jsxs('div', {
                          className: 'dv_itemHead',
                          children: [
                            jsx('span', { className: 'dv_ordinal', children: String(index + 1) }),
                            jsx('span', { className: 'dv_itemName', children: row.id.trim() === '' ? t('field.targetId') : row.id }),
                            gateChip(gateByTarget[row.id.trim()]),
                            jsx('button', {
                              type: 'button',
                              className: 'dv_remove',
                              onClick: () => {
                                setTargets((rows) => rows.filter((_item, i) => i !== index))
                                setConfirmTargets(false)
                              },
                              children: t('btn.removeTarget'),
                            }),
                          ],
                        }),
                        /*
                         * 这 5 个字段的**顺序就是验收脚本按 `.dv_input` 取的顺序**
                         * （id / 文案 / kind / 连接簿条目 / 作用域）——栅格只改视觉，不改顺序。
                         * 作用域是长文本，占满整行（五行三排正好不留空洞）。
                         */
                        jsxs('div', {
                          className: 'dv_grid',
                          children: [
                            targetField(index, 'id', t('field.targetId'), t('field.targetId.hint')),
                            targetField(index, 'label', t('field.targetLabel')),
                            targetKind(index),
                            targetField(index, 'book', t('field.targetBook'), t('field.targetBook.hint')),
                            targetField(index, 'scopeDirs', t('field.targetScope'), t('field.targetScope.hint'), true),
                          ],
                        }),
                      ],
                    },
                    'target-' + String(index),
                  ),
                ),
              }),
          jsx('button', {
            type: 'button',
            className: 'dv_btn dv_btnGhost dv_addBtn',
            onClick: () => {
              setTargets((rows) => [...rows, { id: '', label: '', kind: 'local', book: '', scopeDirs: '' }])
              setConfirmTargets(false)
            },
            children: t('btn.addTarget'),
          }),
          targetsDirty
            ? jsxs('label', {
                className: 'dv_confirm',
                children: [
                  jsx('input', {
                    type: 'checkbox',
                    checked: confirmTargets,
                    onChange: (event) => {
                      setConfirmTargets(event.target.checked)
                    },
                  }),
                  jsx('span', { className: 'dv_hint', children: t('check.confirmTargets') }),
                ],
              })
            : null,
        ],
      })

      /*
       * 写闸门**只读**面板：把「声明的环境变量名 / 当前是否已授权 / 怎么授权」摆出来。
       *
       * 三个都不是卡片能写的东西——授权判据在宿主启动环境里，而卡片能写配置（见文件头那张表）。
       * 这一档存在的意义是：用户不用去翻 yaml 就知道**为什么 env_up / env_down 不出现**。
       */
      const writeGatePanel = jsxs('div', {
        className: 'dv_card dv_panel',
        children: [
          jsxs('div', {
            className: 'dv_panelHead',
            children: [
              jsx('span', { className: 'dv_panelTitle', children: t('section.writeGate') }),
              jsx('span', { className: 'dv_count', children: String(gates.length) }),
            ],
          }),
          jsx('p', { className: 'dv_hint', children: t('hint.writeGateReadonly') }),
          gates.length === 0
            ? jsx('p', { className: 'dv_empty', children: t('hint.writeGateUndeclared') })
            : jsx('ul', {
                className: 'dv_list',
                children: gates.map((gate, index) =>
                  jsxs(
                    'li',
                    {
                      className: 'dv_item',
                      children: [
                        jsxs('div', {
                          className: 'dv_itemHead',
                          children: [
                            jsx('span', {
                              className: 'dv_itemName',
                              children: typeof gate.label === 'string' && gate.label !== '' ? gate.label : String(gate.targetId),
                            }),
                            gateChip(gate),
                          ],
                        }),
                        gate.declared === true
                          ? jsxs('div', {
                              className: 'dv_gate',
                              children: [
                                jsx('span', { className: 'dv_gateName', children: 'writeCapability' }),
                                jsx('span', { className: 'dv_hint', children: t('meta.envName', { env: String(gate.env) }) }),
                                jsx('p', { className: 'dv_gateMeta', children: t('meta.howTo', { howTo: String(gate.howTo) }) }),
                              ],
                            })
                          : jsx('p', { className: 'dv_hint', children: t('hint.writeGateUndeclared') }),
                      ],
                    },
                    'gate-' + String(index),
                  ),
                ),
              }),
        ],
      })

      /* 指纹记录**只读**列表：host / 端口 / 指纹条数（不给指纹本身，也不给编辑）。 */
      const hostKeys = config !== null && Array.isArray(config.hostKeys) ? config.hostKeys : []
      const hostKeyPanel = jsxs('div', {
        className: 'dv_card dv_panel',
        children: [
          jsxs('div', {
            className: 'dv_panelHead',
            children: [
              jsx('span', { className: 'dv_panelTitle', children: t('section.hostKeys') }),
              jsx('span', { className: 'dv_count', children: String(hostKeys.length) }),
            ],
          }),
          jsx('p', { className: 'dv_hint', children: t('hint.hostKeys') }),
          hostKeys.length === 0
            ? jsx('p', { className: 'dv_empty', children: t('list.emptyHostKeys') })
            : jsx('ul', {
                className: 'dv_list',
                children: hostKeys.map((record, index) =>
                  jsx(
                    'li',
                    {
                      className: 'dv_item',
                      children: jsx('span', {
                        className: 'dv_key',
                        children: t('meta.hostKey', {
                          host: String(record.host),
                          port: String(record.port),
                          count: String(record.fingerprints),
                        }),
                      }),
                    },
                    'hostkey-' + String(index),
                  ),
                ),
              }),
        ],
      })

      return jsxs('div', {
        className: 'dv_card',
        children: [
          jsxs('header', {
            className: 'dv_head',
            children: [
              jsx('h3', { className: 'dv_name', children: t('card.name') }),
              jsx('p', { className: 'dv_desc', children: t('card.desc') }),
            ],
          }),
          form === null
            ? jsx('p', { className: 'dv_hint', children: message.text === '' ? t('msg.loading') : message.text })
            : jsxs('div', {
                className: 'dv_card',
                children: [
                  jsxs('section', {
                    className: 'dv_panel',
                    children: [
                      jsx('div', {
                        className: 'dv_panelHead',
                        children: jsx('span', { className: 'dv_panelTitle', children: t('section.config') }),
                      }),
                      toggle('enabled', t('check.enabled')),
                      toggle('announceToAgent', t('check.announce')),
                      jsxs('div', {
                        className: 'dv_grid',
                        children: [
                          // 四个标量正好两行两列——不给中间那一列留空洞（`wide` 只留给目标行的作用域目录）
                          scalarField('auditFile', t('field.auditFile'), false, t('field.auditFile.hint')),
                          scalarField('probeTimeoutMs', t('field.probeTimeoutMs'), true, t('field.probeTimeoutMs.hint')),
                          scalarField('waitTimeoutMs', t('field.waitTimeoutMs'), true, t('field.waitTimeoutMs.hint')),
                          scalarField('pollIntervalMs', t('field.pollIntervalMs'), true, t('field.pollIntervalMs.hint')),
                        ],
                      }),
                    ],
                  }),
                  targetEditor,
                  writeGatePanel,
                  hostKeyPanel,
                  jsxs('div', {
                    className: 'dv_actions',
                    children: [
                      message.text === '' ? null : jsx('span', {
                        className: 'dv_msg ' + (message.kind === 'err' ? 'dv_msgErr' : 'dv_msgOk'),
                        children: message.text,
                      }),
                      jsx('span', { className: 'dv_spacer' }),
                      jsx('button', {
                        type: 'button',
                        className: 'dv_btn dv_btnPrimary',
                        disabled: busy,
                        onClick: save,
                        children: busy ? t('btn.saving') : t('btn.save'),
                      }),
                    ],
                  }),
                ],
              }),
        ],
      })
    }

    /* ================================ 插件入口 ================================ */

    exports.inject = ['slots']

    exports.apply = (ctx) => {
      installI18n(ctx)
      ctx.effect(() => {
        ensureStyle()
        return () => {
          styleEl?.remove()
          styleEl = undefined
        }
      })

      // 设置 → 插件配置（`@hyzyn/dsh-kit-settings` 声明的那一页里的一张卡）。
      ctx.slots.inject('settings.kit.item', () =>
        ctx.slots.register({ name: 'settings.kit.item', id: 'devenv', order: 90, label: () => t('card.name') }, DevenvCard),
      )
      /*
       * 侧边栏「插件」页：**四个槽都要注册**（漏一个就会有一处空白，`devfront` 真机踩过）——
       * 列表行用 `plugins.row.config`（key 是 `<包名>#<行 id>`），而点「查看」进的那个**详情页**
       * 用 `plugins.bundle.config`（key 是**包名**）；`settings.plugin.item` 是 DSH ≤0.1.5 的旧入口。
       */
      ctx.slots.inject('plugins.bundle.config', () =>
        ctx.slots.register({ name: 'plugins.bundle.config', key: '@hyzyn/dsh-devenv' }, DevenvCard),
      )
      ctx.slots.inject('plugins.row.config', () =>
        ctx.slots.register({ name: 'plugins.row.config', key: '@hyzyn/dsh-devenv#devenv' }, DevenvCard),
      )
      ctx.slots.inject('settings.plugin.item', () =>
        ctx.slots.register({ name: 'settings.plugin.item', key: 'devenv', order: 90 }, DevenvCard),
      )
    }

    return exports
  },
})
