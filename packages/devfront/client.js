/* eslint-disable */
/**
 * @hyzyn/dsh-devfront — 浏览器半体：官方「插件配置」里的一张卡片。
 *
 * ## 为什么有这张卡片（它就是记-15 那个缺口的另一半）
 *
 * 2026-10-02 真机扫过三面之后确认：**这一版宿主没有任何客户端代码消费 `autoGenerate`**，
 * 所以「按 Config schema 生成表单」这条路走不通——各插件的卡片都得自己写（tty / docker 同款）。
 * 于是 devfront 此前**只能在 profile 补丁层手改配置**，而 `capabilities` 那一类工具报出来的
 * 「配置问题」用户没有 UI 可以去改。
 *
 * 这张卡片补上**标量那一半**：`enabled` / `announceToAgent` / `settleMs` / `noSandbox` /
 * `chromePath` / `shotDir` / `auditFile` 可改并落盘。
 *
 * ## 站点列表：**可编辑，但一个字段只读**
 *
 * `targets` 是「这个站点、这个范围、这个允许源」的**声明**，所以 2026-10-03 起它在卡片上是
 * 可编辑的（结构化表单 + 逐次确认，见本包 ROADMAP 记-24）——但**登录声明 `login` 不在其中**：
 * 它是一串步骤与选择器，不是几个输入框，评审面是那份配置文件。卡片对它做两件事：
 *
 * 1. **原样带回去**（`draftSites` / `sitesPayload`）：保存时 `targets` 整批重建，少带一个字段
 *    就等于「点一次保存 → 登录流程被悄悄删掉」（`devfront D01`）；
 * 2. **只读摆一行摘要**（`loginSummary` → `meta.loginSteps`）：几个动作、成功判据是什么。
 *    **只显示动作名与选择器，不显示 `fill` 里填的值**——那个值可能就是口令。
 *
 * 数据面是宿主那条 `GET/POST /api/dsh-devfront/config`（同源相对路径：宿主地址一律不硬编码，
 * 静态规则见 `scripts/client-lint.mjs`）。
 */
window.__ModuleLoader__.load({
  id: '@hyzyn/dsh-devfront',
  factory: (require) => {
    const exports = {}

    const React = require('react')
    const { jsx, jsxs } = require('react/jsx-runtime')

    const CONFIG_PATH = '/api/dsh-devfront/config'

    /* ================================ CSS ================================ */

    /*
     * devfront D02：样式变量只许写宿主主题里**真实存在**的名字。
     *
     * 变量不存在时那条声明在**计算值阶段**整条作废（`border` 是 shorthand，它的所有 longhand
     * 一起回落 `unset`，而 `border-style` 的初始值就是 `none`）——框会**直接消失**，而布局类
     * 声明照常生效。它与 D01 是同一条共性：**卡片自己看不见的坏法**，不专门去量就发现不了。
     * 名字表是生成物 `scripts/fixtures/dsh-theme-tokens.json`，判据在 `scripts/client-lint.mjs`
     * 的检查 ③。
     *
     * 版式与 `devdata` / `devenv` 两张卡同一套：**面板 → 站点行**两层，字段走两列栅格
     * （窄窗口回落单列），主色只出现在「保存」。
     *
     * 三条**不能动**的约束（`scripts/verify-devfront-card.mjs` 的 ⑰㉑ 按它们定位）：
     *   - 站点列表那一层必须带 `df_card`，`.df_sites` 是它的子元素（脚本用
     *     `card.querySelector('.df_sites').closest('.df_card')` 找编辑器，确认框才不会先命中标量那层）；
     *   - 站点行的 7 个字段必须带 `df_input` 且**顺序不变**（id / 名字 / URL / 作用域 / 允许源 / 视口 / 凭据）；
     *   - `.df_siteName` 里**只有名字**（脚本拿它的 innerText 当键），`.df_siteLogin` **只在有声明时存在**
     *     （没声明的站点那行是 `null`，反例钉在 ㉑）。
     */
    const CSS = [
      '.df_card{display:flex;flex-direction:column;gap:14px;max-width:880px;color:var(--dsw-alias-label-primary);font-size:13px}',

      /* 头部 */
      '.df_head{display:flex;flex-direction:column;gap:3px}',
      '.df_name{margin:0;font-size:15px;font-weight:600;letter-spacing:.01em}',
      '.df_desc{margin:0;font-size:12px;line-height:1.55;color:var(--dsw-alias-label-tertiary)}',

      /* 分组面板 */
      '.df_panel{display:flex;flex-direction:column;gap:12px;padding:14px;border:1px solid var(--dsw-alias-settings-card-stroke);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-settings-card-fill)}',
      '.df_panelHead{display:flex;align-items:center;gap:8px}',
      '.df_panelTitle{margin:0;font-size:13px;font-weight:600}',
      '.df_count{padding:0 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary)}',

      /* 表单栅格：固定两列；`df_wide` 给入口 URL 这类长文本占满一行 */
      '.df_grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 12px}',
      '@media (max-width:640px){.df_grid{grid-template-columns:minmax(0,1fr)}}',
      '.df_wide{grid-column:1/-1}',
      '.df_field{display:flex;flex-direction:column;gap:5px;margin:0;min-width:0}',
      '.df_label{font-size:12px;font-weight:500;line-height:16px;color:var(--dsw-alias-label-secondary)}',
      '.df_hint{margin:0;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}',

      /* 输入控件 */
      '.df_input{box-sizing:border-box;width:100%;padding:6px 9px;border:1px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-sm);background:var(--dsw-specific-input-major);color:inherit;font-size:13px;line-height:18px}',
      '.df_input:hover:not(:disabled){border-color:var(--dsw-alias-label-dimmed)}',
      '.df_input:focus,.df_input:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}',
      '.df_input:disabled{opacity:.55;cursor:not-allowed}',

      /* 开关 */
      '.df_switch{display:flex;align-items:flex-start;gap:9px;cursor:pointer}',
      '.df_switch input{width:14px;height:14px;margin:1px 0 0;flex:none;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}',
      '.df_switchText{display:flex;flex-direction:column;gap:2px;min-width:0}',

      /* 站点行 */
      '.df_sites{display:flex;flex-direction:column;gap:10px;margin:0;padding:0;list-style:none}',
      '.df_site{display:flex;flex-direction:column;gap:12px;padding:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-3)}',
      '.df_siteHead{display:flex;align-items:center;gap:8px;min-height:22px}',
      '.df_ordinal{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;flex:none;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:var(--dsw-alias-bg-layer-2);font-size:11px;color:var(--dsw-alias-label-tertiary)}',
      '.df_siteName{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.df_chip{display:inline-flex;align-items:center;gap:5px;flex:none;padding:1px 8px;border:1px solid currentColor;border-radius:999px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}',
      '.df_dot{width:5px;height:5px;flex:none;border-radius:50%;background:currentColor}',

      /* 登录声明：**只读一段**（脚本按 `.df_siteLogin` 读它的文字） */
      '.df_login{margin:0;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-2);font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}',

      /* 空态与确认提示 */
      '.df_empty{margin:0;padding:16px;border:1px dashed var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);font-size:12px;line-height:1.6;color:var(--dsw-alias-label-tertiary);text-align:center}',
      '.df_confirm{display:flex;align-items:flex-start;gap:9px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-left:3px solid var(--dsw-alias-state-warn-primary);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-2);cursor:pointer}',
      '.df_confirm input{width:14px;height:14px;margin:1px 0 0;flex:none;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}',

      /* 按钮 */
      '.df_btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:6px 14px;border:1px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:13px;line-height:18px;cursor:pointer;transition:background .16s,border-color .16s}',
      '.df_btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
      '.df_btnGhost{border-style:dashed;background:transparent;color:var(--dsw-alias-label-secondary)}',
      '.df_addBtn{align-self:flex-start}',
      '.df_btnPrimary{border-color:transparent;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-inverted);font-weight:500}',
      '.df_btnPrimary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}',
      '.df_btnPrimary:disabled{border-color:transparent;background:var(--dsw-alias-button-primary-dimmed);color:var(--dsw-alias-label-tertiary);cursor:default}',
      '.df_remove{margin-left:auto;flex:none;padding:3px 10px;border:1px solid transparent;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-tertiary);font-size:12px;cursor:pointer}',
      '.df_remove:hover{background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary)}',

      /* 底部动作条 */
      '.df_actions{display:flex;align-items:center;gap:12px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l1)}',
      '.df_msg{margin:0;font-size:12px}',
      '.df_msgOk{color:var(--dsw-alias-state-success-primary)}',
      '.df_msgErr{color:var(--dsw-alias-state-error-primary)}',
      '.df_spacer{flex:1}',
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
    const I18N_NS = 'devfront'
    const I18N_ZH = {
      'card.name': '前端效果验证',
      'card.desc': '面向「发布之后页面到底对不对」：打开站点、截图、收 console、跑验活断言。',
      'section.config': '插件配置',
      'section.sites': '站点（可改）',
      'btn.addSite': '+ 添加站点',
      'btn.removeSite': '删除',
      /* 字段文案拆成「短标签 + 灰色口径小字」两键：标签一眼扫得过，口径不丢 */
      'field.siteId': 'id',
      'field.siteId.hint': '工具按它选站点',
      'field.siteLabel': '名字',
      'field.siteUrl': '入口 URL',
      'field.siteScope': '作用域目录',
      'field.siteScope.hint': '逗号分隔',
      'field.siteOrigins': '允许动手的源',
      'field.siteOrigins.hint': '逗号分隔；空 = 一个源都不许动手',
      'field.siteViewport': '视口',
      'field.siteViewport.hint': '如 390x844；留空 = 浏览器默认',
      'field.siteCredential': '凭据引用',
      'field.siteCredential.hint': '留空 = 不登录',
      'meta.loginSteps': '登录流程：{count} 步（{steps}），成功判据 {selector}',
      'check.confirmSites': '我知道这会写进 profile 补丁层（~/.dsh/profiles/<profile>/cordis.patch.yml），并进审计',
      'msg.sitesNeedConfirm': '站点改动要先勾选下面那个确认框：它是「工具能在哪些站点、哪些范围、哪些源上动手」的变更。',
      'msg.sitesSaved': '站点已保存（进审计）',
      'check.enabled': '启用本插件',
      'check.announce': '向 agent 注入能力公告',
      'check.noSandbox': '关掉 Chrome 沙箱（只在受限环境开）',
      'field.settleMs': '渲染等待',
      'field.settleMs.hint': '毫秒',
      'field.chromePath': 'Chrome 可执行文件路径',
      'field.chromePath.hint': '留空 = 自动探测',
      'field.shotDir': '截图输出目录',
      'field.shotDir.hint': '留空 = 临时目录',
      'field.auditFile': '持久审计文件',
      'field.auditFile.hint': '留空 = 只进宿主日志',
      'badge.viewport': '视口 {viewport}',
      'btn.save': '保存',
      'btn.saving': '保存中…',
      'msg.saved': '已保存',
      'msg.savedNotPersisted': '已在本进程生效，但宿主没有 settings 服务，没有落盘',
      'msg.loading': '正在读取配置…',
      'msg.loadFailed': '读取配置失败：',
      'msg.saveFailed': '保存失败：',
      'list.emptySites': '还没有配置任何站点——卡片不编一个默认站点出来（作用域与允许源都该由你声明）。',
    }
    const I18N_EN = {
      'card.name': 'Front-end verification',
      'card.desc': 'Answers "is the page actually right after a release": open a site, screenshot, collect console, run assertions.',
      'section.config': 'Plugin configuration',
      'section.sites': 'Sites (editable)',
      'btn.addSite': '+ Add a site',
      'btn.removeSite': 'Remove',
      'field.siteId': 'id',
      'field.siteId.hint': 'Tools pick the site by it',
      'field.siteLabel': 'Name',
      'field.siteUrl': 'Entry URL',
      'field.siteScope': 'Scope dirs',
      'field.siteScope.hint': 'Comma separated',
      'field.siteOrigins': 'Origins allowed to act on',
      'field.siteOrigins.hint': 'Comma separated; empty = no origin may be acted on',
      'field.siteViewport': 'Viewport',
      'field.siteViewport.hint': 'e.g. 390x844; empty = browser default',
      'field.siteCredential': 'Credential ref',
      'field.siteCredential.hint': 'Empty = no login',
      'meta.loginSteps': 'Login flow: {count} steps ({steps}); success check {selector}',
      'check.confirmSites': 'I understand this is written into the profile patch layer (~/.dsh/profiles/<profile>/cordis.patch.yml) and audited',
      'msg.sitesNeedConfirm': 'Tick the confirmation box first: this changes which sites, scopes and origins the tools may act on.',
      'msg.sitesSaved': 'Sites saved (audited)',
      'check.enabled': 'Enable this plugin',
      'check.announce': 'Inject the capability notice to the agent',
      'check.noSandbox': 'Disable the Chrome sandbox (restricted environments only)',
      'field.settleMs': 'Render settle time',
      'field.settleMs.hint': 'Milliseconds',
      'field.chromePath': 'Chrome executable path',
      'field.chromePath.hint': 'Empty = auto-detect',
      'field.shotDir': 'Screenshot directory',
      'field.shotDir.hint': 'Empty = temp dir',
      'field.auditFile': 'Durable audit file',
      'field.auditFile.hint': 'Empty = host log only',
      'badge.viewport': 'Viewport {viewport}',
      'btn.save': 'Save',
      'btn.saving': 'Saving…',
      'msg.saved': 'Saved',
      'msg.savedNotPersisted': 'Applied in this process, but the host has no settings service — nothing was persisted',
      'msg.loading': 'Loading configuration…',
      'msg.loadFailed': 'Failed to load configuration: ',
      'msg.saveFailed': 'Failed to save: ',
      'list.emptySites': 'No sites configured yet — the card will not invent one (scope and allowed origins must be declared by you).',
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

    /** 只把要显示的键挑出来（宿主快照里还有别的字段，卡片不关心）。 */
    function pickScalars(config) {
      return {
        enabled: config.enabled === true,
        announceToAgent: config.announceToAgent !== false,
        noSandbox: config.noSandbox === true,
        settleMs: Number.isInteger(config.settleMs) ? config.settleMs : 800,
        chromePath: typeof config.chromePath === 'string' ? config.chromePath : '',
        shotDir: typeof config.shotDir === 'string' ? config.shotDir : '',
        auditFile: typeof config.auditFile === 'string' ? config.auditFile : '',
      }
    }

    /** 快照里的站点 → **可编辑草稿**（列表字段用逗号拼起来，方便一个输入框改）。 */
    function draftSites(config) {
      const rows = Array.isArray(config.targets) ? config.targets : []
      return rows.map((site) => ({
        id: typeof site.id === 'string' ? site.id : '',
        label: typeof site.label === 'string' ? site.label : '',
        url: typeof site.url === 'string' ? site.url : '',
        scopeDirs: Array.isArray(site.scopeDirs) ? site.scopeDirs.join(', ') : '',
        allowedOrigins: Array.isArray(site.allowedOrigins) ? site.allowedOrigins.join(', ') : '',
        viewport: typeof site.viewport === 'string' ? site.viewport : '',
        credentialRef: typeof site.credentialRef === 'string' ? site.credentialRef : '',
        // 登录声明（`login`）这张卡片**不编辑**（它是一串步骤与选择器，不是三个输入框），但必须
        // **原样带回去**：保存时 `targets` 是整批重建的，少带一个字段 = 「点一次保存 → 登录流程
        // 被悄悄删掉」（`devfront D01`）。卡片脚本的第 ⑳ 步钉着这件事。
        login: site.login,
      }))
    }

    /**
     * 登录声明的**只读摘要**（卡片不执行、不校验、也不编辑它——唯一判据是宿主的 `parseLogin`）。
     *
     * 读不出形状时返回 `null`，此时**整行不显示**：宿主在**加载期**就会拒掉不合规的声明
     * （`normalizeTargets` → `parseLogin`），所以那个分支到不了这里；真到了也**不编一句话**
     * ——这一行是「让声明可见」，不是「猜它成立」。宽容读法与上面 `draftSites` 里那些
     * `typeof x === 'string' ? … : ''` 同源。
     *
     * **只取动作名与成功判据**：`fill` 的 `value` / `credentialRef` 一律不进摘要——那个值可能
     * 就是口令，而「卡片把口令显示在屏幕上」没有任何理由（真机脚本第 ㉑ 步钉着这一条）。
     */
    function loginSummary(login) {
      if (login === null || typeof login !== 'object') return null
      const { steps, success } = login
      if (!Array.isArray(steps) || success === null || typeof success !== 'object') return null
      if (typeof success.selector !== 'string') return null
      const actions = steps.map((step) =>
        step !== null && typeof step === 'object' && typeof step.action === 'string' ? step.action : null,
      )
      if (actions.includes(null)) return null
      return { count: actions.length, steps: actions.join(' → '), selector: success.selector }
    }

    /** 逗号分隔 → 字符串数组（空项丢掉；**不去重、不排序**：顺序是用户的意图）。 */
    function splitList(value) {
      return String(value)
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item !== '')
    }

    /** 草稿 → 提交给宿主的 payload 形状（空字段**不占位**，让「没写」保持没写）。 */
    function sitesPayload(rows) {
      return rows.map((row) => ({
        id: row.id.trim(),
        url: row.url.trim(),
        ...(row.label.trim() === '' ? {} : { label: row.label.trim() }),
        scopeDirs: splitList(row.scopeDirs),
        allowedOrigins: splitList(row.allowedOrigins),
        ...(row.viewport.trim() === '' ? {} : { viewport: row.viewport.trim() }),
        ...(row.credentialRef.trim() === '' ? {} : { credentialRef: row.credentialRef.trim() }),
        // 透传：卡片不认识它的内容，但**不许**把它删掉（见 `draftSites` 那段注释）。
        ...(row.login === undefined ? {} : { login: row.login }),
      }))
    }

    function DevfrontCard() {
      const [config, setConfig] = React.useState(null)
      const [form, setForm] = React.useState(null)
      const [sites, setSites] = React.useState([])
      const [sitesFromServer, setSitesFromServer] = React.useState([])
      const [confirmSites, setConfirmSites] = React.useState(false)
      const [busy, setBusy] = React.useState(false)
      const [message, setMessage] = React.useState({ text: '', kind: '' })

      const load = React.useCallback(() => {
        fetch(CONFIG_PATH, { cache: 'no-store' })
          .then((res) => res.json())
          .then((data) => {
            if (data !== null && typeof data === 'object' && data.ok === true && typeof data.config === 'object') {
              setConfig(data.config)
              setForm(pickScalars(data.config))
              setSites(draftSites(data.config))
              setSitesFromServer(draftSites(data.config))
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

      const setSiteField = (index, key, value) => {
        setSites((rows) => rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)))
      }

      const sitesDirty = JSON.stringify(sites) !== JSON.stringify(sitesFromServer)

      const save = () => {
        if (form === null || busy) return
        if (sitesDirty && !confirmSites) {
          setMessage({ text: t('msg.sitesNeedConfirm'), kind: 'err' })
          return
        }
        setBusy(true)
        setMessage({ text: '', kind: '' })
        const payload = { ...form }
        if (sitesDirty) {
          payload.targets = sitesPayload(sites)
          payload.confirmSiteEdit = true
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
            setSites(draftSites(data.config))
            setSitesFromServer(draftSites(data.config))
            setConfirmSites(false)
            const done = sitesDirty ? t('msg.sitesSaved') : t('msg.saved')
            setMessage({ text: data.persisted === false ? t('msg.savedNotPersisted') : done, kind: data.persisted === false ? 'err' : 'ok' })
          })
          .catch((error) => {
            setBusy(false)
            setMessage({ text: t('msg.saveFailed') + String(error && error.message ? error.message : error), kind: 'err' })
          })
      }

      const toggle = (key, label, hint) =>
        jsxs('label', {
          className: 'df_switch',
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
              className: 'df_switchText',
              children: [
                jsx('span', { className: 'df_label', children: label }),
                hint === undefined ? null : jsx('span', { className: 'df_hint', children: hint }),
              ],
            }),
          ],
        })

      const text = (key, label, hint, wide) =>
        jsxs('label', {
          className: wide === true ? 'df_field df_wide' : 'df_field',
          children: [
            jsx('span', { className: 'df_label', children: label }),
            jsx('input', {
              className: 'df_input',
              type: key === 'settleMs' ? 'number' : 'text',
              value: form === null ? '' : String(form[key]),
              disabled: form === null,
              onChange: (event) => {
                setField(key, key === 'settleMs' ? Number(event.target.value) : event.target.value)
              },
            }),
            hint === undefined ? null : jsx('span', { className: 'df_hint', children: hint }),
          ],
        })

      /** 一个站点草稿的某个字段（短标签 + 输入框 + 可选小字）。`wide` = 占满整行。 */
      const siteField = (index, key, label, hint, wide) =>
        jsxs('label', {
          className: wide === true ? 'df_field df_wide' : 'df_field',
          children: [
            jsx('span', { className: 'df_label', children: label }),
            jsx('input', {
              className: 'df_input',
              type: 'text',
              value: sites[index] === undefined ? '' : String(sites[index][key]),
              onChange: (event) => {
                setSiteField(index, key, event.target.value)
              },
            }),
            hint === undefined ? null : jsx('span', { className: 'df_hint', children: hint }),
          ],
        })

      /** 一行草稿的登录摘要（`login` 是 `draftSites` **原样带回**的裸声明）。 */
      const summaryOf = (row) => loginSummary(row.login)

      /*
       * 站点编辑器：**这一层必须带 `df_card`**（验收脚本 ⑰ 用 `.df_sites` → `closest('.df_card')`
       * 定位它，为的是让确认框与标量里那几个复选框区分开）。`df_panel` 只是视觉上的分组面板。
       */
      const siteEditor = jsxs('div', {
        className: 'df_card df_panel',
        children: [
          jsxs('div', {
            className: 'df_panelHead',
            children: [
              jsx('span', { className: 'df_panelTitle', children: t('section.sites') }),
              jsx('span', { className: 'df_count', children: String(sites.length) }),
            ],
          }),
          sites.length === 0
            ? jsx('p', { className: 'df_empty', children: t('list.emptySites') })
            : jsx('ul', {
                className: 'df_sites',
                children: sites.map((row, index) =>
                  jsxs(
                    'li',
                    {
                      className: 'df_site',
                      children: [
                        jsxs('div', {
                          className: 'df_siteHead',
                          children: [
                            jsx('span', { className: 'df_ordinal', children: String(index + 1) }),
                            // `.df_siteName` 里**只有名字**：验收脚本 ㉑ 拿它的 innerText 当键
                            jsx('span', { className: 'df_siteName', children: row.id.trim() === '' ? t('field.siteId') : row.id }),
                            row.viewport.trim() === ''
                              ? null
                              : jsxs('span', {
                                  className: 'df_chip',
                                  children: [
                                    jsx('span', { className: 'df_dot' }),
                                    t('badge.viewport', { viewport: row.viewport.trim() }),
                                  ],
                                }),
                            jsx('button', {
                              type: 'button',
                              className: 'df_remove',
                              onClick: () => {
                                setSites((rows) => rows.filter((_item, i) => i !== index))
                                setConfirmSites(false)
                              },
                              children: t('btn.removeSite'),
                            }),
                          ],
                        }),
                        /*
                         * 这 7 个字段的**顺序就是验收脚本按 `input.df_input` 取的顺序**
                         * （它按下标写前四个：id / 名字 / URL / 作用域）——栅格只改视觉，不改顺序。
                         */
                        jsxs('div', {
                          className: 'df_grid',
                          children: [
                            siteField(index, 'id', t('field.siteId'), t('field.siteId.hint')),
                            siteField(index, 'label', t('field.siteLabel')),
                            siteField(index, 'url', t('field.siteUrl'), undefined, true),
                            siteField(index, 'scopeDirs', t('field.siteScope'), t('field.siteScope.hint')),
                            siteField(index, 'allowedOrigins', t('field.siteOrigins'), t('field.siteOrigins.hint')),
                            siteField(index, 'viewport', t('field.siteViewport'), t('field.siteViewport.hint')),
                            siteField(index, 'credentialRef', t('field.siteCredential'), t('field.siteCredential.hint')),
                          ],
                        }),
                        // 登录声明：**只读一行**（不编辑、不执行）。摘不出形状时整行不渲染（㉑ 的反例钉着这条）。
                        summaryOf(row) === null
                          ? null
                          : jsx('p', {
                              className: 'df_login df_siteLogin',
                              children: t('meta.loginSteps', summaryOf(row)),
                            }),
                      ],
                    },
                    'site-' + String(index),
                  ),
                ),
              }),
          jsx('button', {
            type: 'button',
            className: 'df_btn df_btnGhost df_addBtn',
            onClick: () => {
              setSites((rows) => [
                ...rows,
                { id: '', label: '', url: '', scopeDirs: '', allowedOrigins: '', viewport: '', credentialRef: '' },
              ])
              setConfirmSites(false)
            },
            children: t('btn.addSite'),
          }),
          sitesDirty
            ? jsxs('label', {
                className: 'df_confirm',
                children: [
                  jsx('input', {
                    type: 'checkbox',
                    checked: confirmSites,
                    onChange: (event) => {
                      setConfirmSites(event.target.checked)
                    },
                  }),
                  jsx('span', { className: 'df_hint', children: t('check.confirmSites') }),
                ],
              })
            : null,
        ],
      })

      return jsxs('div', {
        className: 'df_card',
        children: [
          jsxs('header', {
            className: 'df_head',
            children: [
              jsx('h3', { className: 'df_name', children: t('card.name') }),
              jsx('p', { className: 'df_desc', children: t('card.desc') }),
            ],
          }),
          form === null
            ? jsx('p', { className: 'df_hint', children: message.text === '' ? t('msg.loading') : message.text })
            : jsxs('div', {
                className: 'df_card',
                children: [
                  jsxs('section', {
                    className: 'df_panel',
                    children: [
                      jsx('div', {
                        className: 'df_panelHead',
                        children: jsx('span', { className: 'df_panelTitle', children: t('section.config') }),
                      }),
                      toggle('enabled', t('check.enabled')),
                      toggle('announceToAgent', t('check.announce')),
                      toggle('noSandbox', t('check.noSandbox')),
                      jsxs('div', {
                        className: 'df_grid',
                        children: [
                          text('settleMs', t('field.settleMs'), t('field.settleMs.hint')),
                          text('chromePath', t('field.chromePath'), t('field.chromePath.hint')),
                          text('shotDir', t('field.shotDir'), t('field.shotDir.hint')),
                          text('auditFile', t('field.auditFile'), t('field.auditFile.hint')),
                        ],
                      }),
                    ],
                  }),
                  siteEditor,
                  jsxs('div', {
                    className: 'df_actions',
                    children: [
                      message.text === '' ? null : jsx('span', {
                        className: 'df_msg ' + (message.kind === 'err' ? 'df_msgErr' : 'df_msgOk'),
                        children: message.text,
                      }),
                      jsx('span', { className: 'df_spacer' }),
                      jsx('button', {
                        type: 'button',
                        className: 'df_btn df_btnPrimary',
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
        ctx.slots.register({ name: 'settings.kit.item', id: 'devfront', order: 90, label: () => t('card.name') }, DevfrontCard),
      )
      /*
       * 侧边栏「插件」页：**两个槽都要注册**（tty / docker 同款，2026-10-03 真机验收抓到的）——
       * 列表行用 `plugins.row.config`（key 是 `<包名>#<行 id>`），而点「查看」进的那个**详情页**
       * 用 `plugins.bundle.config`（key 是**包名**）。只注册前者时详情页里的卡片是空的。
       */
      ctx.slots.inject('plugins.bundle.config', () =>
        ctx.slots.register({ name: 'plugins.bundle.config', key: '@hyzyn/dsh-devfront' }, DevfrontCard),
      )
      ctx.slots.inject('plugins.row.config', () =>
        ctx.slots.register({ name: 'plugins.row.config', key: '@hyzyn/dsh-devfront#devfront' }, DevfrontCard),
      )
      // DSH ≤0.1.5：设置 → 插件 的「插件配置」标签页（keyed 插槽按 settings 命名空间派发）。
      ctx.slots.inject('settings.plugin.item', () =>
        ctx.slots.register({ name: 'settings.plugin.item', key: 'devfront', order: 90 }, DevfrontCard),
      )
    }

    return exports
  },
})
