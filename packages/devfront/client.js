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
     */
    const CSS = [
      '.df_card{display:flex;flex-direction:column;gap:10px;max-width:760px;color:var(--dsw-alias-label-primary)}',
      '.df_head{display:flex;flex-direction:column;gap:4px}',
      '.df_name{margin:0;font-size:15px;font-weight:600}',
      '.df_desc{margin:0;font-size:13px;color:var(--dsw-alias-label-tertiary)}',
      '.df_field{display:flex;flex-direction:column;gap:4px;margin:0}',
      '.df_row{display:flex;align-items:center;gap:8px}',
      '.df_label{font-size:13px;font-weight:500}',
      '.df_input{padding:4px 8px;border:1px solid var(--dsw-alias-border-l4);border-radius:6px;background:var(--dsw-specific-input-major);color:inherit;font-size:13px}',
      '.df_hint{margin:0;font-size:12px;color:var(--dsw-alias-label-tertiary)}',
      '.df_sites{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none}',
      '.df_site{padding:6px 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;font-size:12px}',
      '.df_siteName{font-weight:600}',
      '.df_actions{display:flex;align-items:center;gap:8px}',
      '.df_remove{padding:2px 8px;border:1px solid var(--dsw-alias-border-l4);border-radius:6px;background:transparent;color:inherit;cursor:pointer;font-size:12px}',
      '.df_save{padding:4px 12px;border:1px solid var(--dsw-alias-border-l4);border-radius:6px;background:var(--dsw-specific-input-major);color:inherit;cursor:pointer;font-size:13px}',
      '.df_msg{font-size:12px}',
      '.df_msgOk{color:var(--dsw-alias-label-tertiary)}',
      '.df_msgErr{color:var(--dsw-alias-state-error-primary, #d33)}',
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
      'field.siteId': 'id（工具按它选站点）',
      'field.siteLabel': '名字',
      'field.siteUrl': '入口 URL',
      'field.siteScope': '作用域目录（逗号分隔）',
      'field.siteOrigins': '允许动手的源（逗号分隔）',
      'field.siteViewport': '视口（如 390x844，留空 = 浏览器默认）',
      'field.siteCredential': '凭据引用（留空 = 不登录）',
      'meta.loginSteps': '登录流程：{count} 步（{steps}），成功判据 {selector}',
      'check.confirmSites': '我知道这会写进 profile 补丁层（~/.dsh/profiles/<profile>/cordis.patch.yml），并进审计',
      'msg.sitesNeedConfirm': '站点改动要先勾选下面那个确认框：它是「工具能在哪些站点、哪些范围、哪些源上动手」的变更。',
      'msg.sitesSaved': '站点已保存（进审计）',
      'check.enabled': '启用本插件',
      'check.announce': '向 agent 注入能力公告',
      'check.noSandbox': '关掉 Chrome 沙箱（只在受限环境开）',
      'field.settleMs': '渲染等待（毫秒）',
      'field.chromePath': 'Chrome 可执行文件路径（留空 = 自动探测）',
      'field.shotDir': '截图输出目录（留空 = 临时目录）',
      'field.auditFile': '持久审计文件（留空 = 只进宿主日志）',
      'btn.save': '保存',
      'btn.saving': '保存中…',
      'msg.saved': '已保存',
      'msg.savedNotPersisted': '已在本进程生效，但宿主没有 settings 服务，**没有落盘**',
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
      'field.siteId': 'id (tools pick the site by it)',
      'field.siteLabel': 'Name',
      'field.siteUrl': 'Entry URL',
      'field.siteScope': 'Scope dirs (comma separated)',
      'field.siteOrigins': 'Origins allowed to act on (comma separated)',
      'field.siteViewport': 'Viewport (e.g. 390x844; empty = browser default)',
      'field.siteCredential': 'Credential ref (empty = no login)',
      'meta.loginSteps': 'Login flow: {count} steps ({steps}); success check {selector}',
      'check.confirmSites': 'I understand this is written into the profile patch layer (~/.dsh/profiles/<profile>/cordis.patch.yml) and audited',
      'msg.sitesNeedConfirm': 'Tick the confirmation box first: this changes which sites, scopes and origins the tools may act on.',
      'msg.sitesSaved': 'Sites saved (audited)',
      'check.enabled': 'Enable this plugin',
      'check.announce': 'Inject the capability notice to the agent',
      'check.noSandbox': 'Disable the Chrome sandbox (restricted environments only)',
      'field.settleMs': 'Render settle time (ms)',
      'field.chromePath': 'Chrome executable path (empty = auto-detect)',
      'field.shotDir': 'Screenshot directory (empty = temp dir)',
      'field.auditFile': 'Durable audit file (empty = host log only)',
      'btn.save': 'Save',
      'btn.saving': 'Saving…',
      'msg.saved': 'Saved',
      'msg.savedNotPersisted': 'Applied in this process, but the host has no settings service — **nothing was persisted**',
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

      const toggle = (key, label) =>
        jsxs('label', {
          className: 'df_row',
          children: [
            jsx('input', {
              type: 'checkbox',
              checked: form !== null && form[key] === true,
              disabled: form === null,
              onChange: (event) => {
                setField(key, event.target.checked)
              },
            }),
            jsx('span', { className: 'df_label', children: label }),
          ],
        })

      const text = (key, label, hint) =>
        jsxs('label', {
          className: 'df_field',
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

      /** 一个站点草稿的某个字段（标签 + 输入框）。 */
      const siteField = (index, key, label) =>
        jsxs('label', {
          className: 'df_field',
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
          ],
        })

      /** 一行草稿的登录摘要（`login` 是 `draftSites` **原样带回**的裸声明）。 */
      const summaryOf = (row) => loginSummary(row.login)

      const siteEditor = jsxs('div', {
        className: 'df_card',
        children: [
          jsx('p', { className: 'df_hint', children: t('section.sites') }),
          sites.length === 0
            ? jsx('p', { className: 'df_hint', children: t('list.emptySites') })
            : jsx('ul', {
                className: 'df_sites',
                children: sites.map((row, index) =>
                  jsxs(
                    'li',
                    {
                      className: 'df_site',
                      children: [
                        jsxs('div', {
                          className: 'df_row',
                          children: [
                            jsx('span', { className: 'df_siteName', children: row.id.trim() === '' ? t('field.siteId') : row.id }),
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
                        siteField(index, 'id', t('field.siteId')),
                        siteField(index, 'label', t('field.siteLabel')),
                        siteField(index, 'url', t('field.siteUrl')),
                        siteField(index, 'scopeDirs', t('field.siteScope')),
                        siteField(index, 'allowedOrigins', t('field.siteOrigins')),
                        siteField(index, 'viewport', t('field.siteViewport')),
                        siteField(index, 'credentialRef', t('field.siteCredential')),
                        // 登录声明：**只读一行**（不编辑、不执行）。摘不出形状时不显示整行。
                        summaryOf(row) === null
                          ? null
                          : jsx('p', {
                              className: 'df_hint df_siteLogin',
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
            className: 'df_save',
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
            ? jsx('label', {
                className: 'df_row',
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
                  jsx('p', { className: 'df_hint', children: t('section.config') }),
                  toggle('enabled', t('check.enabled')),
                  toggle('announceToAgent', t('check.announce')),
                  toggle('noSandbox', t('check.noSandbox')),
                  text('settleMs', t('field.settleMs')),
                  text('chromePath', t('field.chromePath')),
                  text('shotDir', t('field.shotDir')),
                  text('auditFile', t('field.auditFile')),
                  siteEditor,
                  jsxs('div', {
                    className: 'df_actions',
                    children: [
                      jsx('button', {
                        type: 'button',
                        className: 'df_save',
                        disabled: busy,
                        onClick: save,
                        children: busy ? t('btn.saving') : t('btn.save'),
                      }),
                      message.text === '' ? null : jsx('span', { className: 'df_msg' + (message.kind === 'err' ? ' df_msgErr' : ' df_msgOk'), children: message.text }),
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
