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
 * ## 站点列表**只读**（刻意）
 *
 * `targets` 是「这个站点、这个范围、这个允许源」的**声明**——与就绪清单、验活断言同一类东西：
 * 随项目评审、DSH 侧只读。把它塞进一个自由编辑的表单等于把评审面抹掉，所以卡片只**摆出来**
 * （含 `scopeDirs` / `allowedOrigins` / 视口 / 凭据引用），编辑仍走
 * `~/.dsh/profiles/<profile>/cordis.patch.yml`。这条边界写在卡片上（`hint.sitesReadonly`），
 * 不靠用户猜。
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

    const CSS = [
      '.df_card{display:flex;flex-direction:column;gap:10px;max-width:760px;color:var(--dsw-alias-label-primary)}',
      '.df_head{display:flex;flex-direction:column;gap:4px}',
      '.df_name{margin:0;font-size:15px;font-weight:600}',
      '.df_desc{margin:0;font-size:13px;color:var(--dsw-alias-label-tertiary)}',
      '.df_field{display:flex;flex-direction:column;gap:4px;margin:0}',
      '.df_row{display:flex;align-items:center;gap:8px}',
      '.df_label{font-size:13px;font-weight:500}',
      '.df_input{padding:4px 8px;border:1px solid var(--dsw-alias-border-secondary);border-radius:6px;background:var(--dsw-alias-bg-primary);color:inherit;font-size:13px}',
      '.df_hint{margin:0;font-size:12px;color:var(--dsw-alias-label-tertiary)}',
      '.df_sites{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none}',
      '.df_site{padding:6px 8px;border:1px solid var(--dsw-alias-border-secondary);border-radius:6px;font-size:12px}',
      '.df_siteName{font-weight:600}',
      '.df_actions{display:flex;align-items:center;gap:8px}',
      '.df_save{padding:4px 12px;border:1px solid var(--dsw-alias-border-secondary);border-radius:6px;background:var(--dsw-alias-bg-primary);color:inherit;cursor:pointer;font-size:13px}',
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
      'section.sites': '站点（只读）',
      'hint.sitesReadonly': '站点列表在 profile 补丁层维护（~/.dsh/profiles/<profile>/cordis.patch.yml）：它随项目评审，卡片只展示。',
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
      'meta.scope': '作用域',
      'meta.origins': '允许动手的源',
      'meta.viewport': '视口',
      'meta.credential': '凭据引用',
    }
    const I18N_EN = {
      'card.name': 'Front-end verification',
      'card.desc': 'Answers "is the page actually right after a release": open a site, screenshot, collect console, run assertions.',
      'section.config': 'Plugin configuration',
      'section.sites': 'Sites (read-only)',
      'hint.sitesReadonly': 'Sites live in the profile patch layer (~/.dsh/profiles/<profile>/cordis.patch.yml): they are reviewed with the project, so the card only displays them.',
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
      'meta.scope': 'Scope',
      'meta.origins': 'Origins allowed to act on',
      'meta.viewport': 'Viewport',
      'meta.credential': 'Credential ref',
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

    function sitesOf(config) {
      return Array.isArray(config.targets) ? config.targets : []
    }

    function DevfrontCard() {
      const [config, setConfig] = React.useState(null)
      const [form, setForm] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [message, setMessage] = React.useState({ text: '', kind: '' })

      const load = React.useCallback(() => {
        fetch(CONFIG_PATH, { cache: 'no-store' })
          .then((res) => res.json())
          .then((data) => {
            if (data !== null && typeof data === 'object' && data.ok === true && typeof data.config === 'object') {
              setConfig(data.config)
              setForm(pickScalars(data.config))
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

      const save = () => {
        if (form === null || busy) return
        setBusy(true)
        setMessage({ text: '', kind: '' })
        fetch(CONFIG_PATH, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(form),
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
            setMessage({ text: data.persisted === false ? t('msg.savedNotPersisted') : t('msg.saved'), kind: data.persisted === false ? 'err' : 'ok' })
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

      const sites = sitesOf(config === null ? {} : config)
      const siteList =
        sites.length === 0
          ? [jsx('li', { className: 'df_hint', children: t('list.emptySites') }, 'empty')]
          : sites.map((site, index) => {
              const meta = []
              if (Array.isArray(site.scopeDirs) && site.scopeDirs.length > 0) meta.push(`${t('meta.scope')}: ${site.scopeDirs.join(' / ')}`)
              if (Array.isArray(site.allowedOrigins) && site.allowedOrigins.length > 0) meta.push(`${t('meta.origins')}: ${site.allowedOrigins.join(' / ')}`)
              if (typeof site.viewport === 'string' && site.viewport !== '') meta.push(`${t('meta.viewport')}: ${site.viewport}`)
              if (typeof site.credentialRef === 'string' && site.credentialRef !== '') meta.push(`${t('meta.credential')}: ${site.credentialRef}`)
              return jsxs(
                'li',
                {
                  className: 'df_site',
                  children: [
                    jsxs('div', {
                      children: [
                        jsx('span', { className: 'df_siteName', children: String(site.id) + ' · ' + String(site.label === undefined ? '' : site.label) }),
                        jsx('span', { children: ' ' + String(site.url === undefined ? '' : site.url) }),
                      ],
                    }),
                    meta.length === 0 ? null : jsx('div', { className: 'df_hint', children: meta.join(' · ') }),
                  ],
                },
                String(site.id) + '#' + String(index),
              )
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
                  jsx('p', { className: 'df_hint', children: t('section.sites') }),
                  jsx('ul', { className: 'df_sites', children: siteList }),
                  jsx('p', { className: 'df_hint', children: t('hint.sitesReadonly') }),
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
