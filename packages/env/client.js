/* eslint-disable */
/**
 * @hyzyn/dsh-env — 浏览器半体：「环境变量 / 密钥管理」配置界面。
 * 同一份代码注册两个插槽以跨版本兼容：
 *   - DSH ≤0.1.5 的 settings.plugin.item（设置 → 插件 → 插件配置，可折叠卡片）；
 *   - DSH ≥0.1.6-alpha.2 的 plugins.row.config（侧边栏「插件」页里该行的配置页）。
 * 纯前端 React 卡片，宿主经 client-modules 的 combo 路由按 boot graph 下发。
 */
window.__ModuleLoader__.load({
  id: '@hyzyn/dsh-env',
  factory: (require) => {
    const exports = {}

    const React = require('react')
    const { jsx, jsxs } = require('react/jsx-runtime')

    /* ================================ CSS ================================ */

    const CSS = [
      '.env_pageHost{display:block}',
      '.env_pluginCard{list-style:none;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;transition:border-color .16s,background .16s}',
      '.env_pluginCard:hover{border-color:var(--dsw-alias-label-dimmed)}',
      '.env_pluginCardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}',
      '.env_cardHeader{appearance:none;width:100%;color:inherit;font:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;display:flex;align-items:center;gap:12px;padding:14px 16px}',
      '.env_cardHeader:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.env_cardHeadText{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}',
      '.env_cardName{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:600}',
      '.dshkit_badge{flex:none;margin-left:auto;padding:1px 8px;border-radius:999px;font-size:11px;font-weight:600;line-height:16px;letter-spacing:.02em;color:var(--dsw-alias-label-dimmed);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1)}',
      '.env_cardDescription{color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.env_chevron{flex:none;color:var(--dsw-alias-label-tertiary);transition:transform .16s}',
      '.env_pluginCardOpen .env_chevron{transform:rotate(180deg)}',
      '.env_cardBody{padding:2px 16px 16px}',
      '.env_panel{display:flex;flex-direction:column;gap:12px;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);box-sizing:border-box}',
      '.env_panelHeader{display:flex;align-items:center;gap:10px;flex:none}',
      '.env_panelTitle{margin:0;font-size:15px;font-weight:700;white-space:nowrap;flex:1}',
      '.env_subtitle{color:var(--dsw-alias-label-tertiary);font-size:11.5px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:360px}',
      '.env_toolbar{display:flex;align-items:center;gap:8px;flex:none}',
      '.env_toolbarSpacer{flex:1}',
      '.env_btn{color:var(--dsw-alias-label-primary-foreground);background:var(--dsw-alias-button-info-fill);border:none;border-radius:8px;padding:6px 14px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}',
      '.env_btn:hover:not(:disabled){background:var(--dsw-alias-button-info-hover)}',
      '.env_btn:disabled{opacity:.5;cursor:default}',
      '.env_btnGhost{color:var(--dsw-alias-label-primary);background:0 0;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:5px 12px;font-size:12px;cursor:pointer;white-space:nowrap}',
      '.env_btnGhost:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
      '.env_btnDanger{color:var(--dsw-alias-state-error-primary)}',
      '.env_list{display:flex;flex-direction:column;gap:8px;max-height:420px;overflow-y:auto}',
      '.env_row{display:grid;grid-template-columns:minmax(140px,1fr) minmax(180px,2fr) auto auto;gap:8px;align-items:center;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:8px 10px}',
      '.env_input{color:var(--dsw-alias-label-primary);background:var(--dsw-specific-input-major);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;outline:none;padding:6px 10px;font-family:inherit;font-size:13px;box-sizing:border-box;width:100%}',
      '.env_input:focus{border-color:var(--dsw-alias-state-business-primary)}',
      '.env_input::placeholder{color:var(--dsw-alias-label-tertiary)}',
      '.env_check{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap}',
      '.env_empty,.env_loading{text-align:center;color:var(--dsw-alias-label-tertiary);padding:24px 12px;font-size:12.5px}',
      '.env_error{color:var(--dsw-alias-state-error-primary);font-size:12px;margin:0;white-space:pre-wrap}',
      '.env_ok{color:var(--dsw-alias-state-success-primary);font-size:12px;margin:0}',
    ].join('\n')

    let styleEl
    function ensureStyle() {
      if (document.getElementById('dsh-env-style')) return
      styleEl = document.createElement('style')
      styleEl.id = 'dsh-env-style'
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

    /* ================================ 设置卡片 ================================ */

    const CHEVRON_PATH = 'M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 9.13382 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z'

    function EnvSettingsCard(props) {
      // DSH ≥0.1.6 的插件配置页把同一条目按 view 渲染两次：summary 一句话摘要、page 完整表单。
      // 旧版（≤0.1.5）的 settings.plugin.item 卡片不带 view，走原有可折叠卡片分支。
      const view = props && props.view
      const pageView = view === 'page'
      const [open, setOpen] = React.useState(pageView)
      const [entries, setEntries] = React.useState([])
      const [file, setFile] = React.useState('')
      const [error, setError] = React.useState('')
      const [ok, setOk] = React.useState('')
      const [loading, setLoading] = React.useState(false)
      const [saving, setSaving] = React.useState(false)

      const load = React.useCallback(async () => {
        setLoading(true)
        setError('')
        setOk('')
        try {
          const data = await api('/api/dsh-env/list')
          setEntries(data.entries || [])
          setFile(data.file || '')
        } catch (err) {
          setError(err.message)
        } finally {
          setLoading(false)
        }
      }, [])

      React.useEffect(() => {
        if (open) load()
      }, [open, load])

      const updateEntry = (index, patch) => {
        setEntries((current) => current.map((entry, i) => i === index ? { ...entry, ...patch } : entry))
      }

      const addEntry = () => {
        setEntries((current) => [...current, { key: '', value: '', secret: false }])
      }

      const removeEntry = (index) => {
        setEntries((current) => current.filter((_, i) => i !== index))
      }

      const save = async () => {
        setSaving(true)
        setError('')
        setOk('')
        try {
          const data = await api('/api/dsh-env/save', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ entries }),
          })
          setEntries(data.entries || entries)
          setFile(data.file || file)
          setOk('已保存' + (data.applied ? '，并已写入 process.env' : ''))
          if (Array.isArray(data.warnings) && data.warnings.length > 0) setError(data.warnings.join('\n'))
        } catch (err) {
          setError(err.message)
        } finally {
          setSaving(false)
        }
      }

      if (view === 'summary') {
        return '管理环境变量与密钥：普通值或 js: 表达式；密钥值存入官方凭据存储，保存后写入 process.env。'
      }

      return jsxs(pageView ? 'div' : 'li', {
        className: pageView ? 'env_pageHost' : (open ? 'env_pluginCard env_pluginCardOpen' : 'env_pluginCard'),
        children: [
          pageView ? null : jsxs('button', {
            type: 'button',
            className: 'env_cardHeader',
            'aria-expanded': open,
            onClick: () => setOpen((current) => !current),
            children: [
              jsxs('span', {
                className: 'env_cardHeadText',
                children: [
                  jsx('span', { className: 'env_cardName', children: '环境变量 / 密钥管理' }),
                  jsx('span', { className: 'env_cardDescription', children: '管理环境变量与密钥：普通值或 js: 表达式；密钥值存入官方凭据存储，保存后写入 process.env。' }),
                ],
              }),
              jsx('span', { className: 'dshkit_badge', children: 'Kit' }),
              jsx('svg', {
                width: '14',
                height: '14',
                viewBox: '0 0 14 14',
                fill: 'none',
                xmlns: 'http://www.w3.org/2000/svg',
                className: 'env_chevron',
                children: jsx('path', { d: CHEVRON_PATH, fill: 'currentColor' }),
              }),
            ],
          }),
          (pageView || open) ? jsx('div', {
            className: 'env_cardBody',
            children: jsxs('div', {
              className: 'env_panel',
              children: [
                jsxs('div', {
                  className: 'env_panelHeader',
                  children: [
                    jsx('span', { className: 'env_panelTitle', children: '环境变量列表' }),
                    jsx('span', { className: 'env_subtitle', children: file }),
                    jsx('div', { className: 'env_toolbarSpacer' }),
                    jsx('button', {
                      type: 'button',
                      className: 'env_btnGhost',
                      onClick: addEntry,
                      children: '+ 新增',
                    }),
                    jsx('button', {
                      type: 'button',
                      className: 'env_btn',
                      disabled: saving,
                      onClick: save,
                      children: saving ? '保存中…' : '保存',
                    }),
                  ],
                }),
                loading ? jsx('div', { className: 'env_loading', children: '加载中…' }) : null,
                error ? jsx('p', { className: 'env_error', children: error }) : null,
                ok ? jsx('p', { className: 'env_ok', children: ok }) : null,
                entries.length === 0 && !loading ? jsx('div', { className: 'env_empty', children: '暂无环境变量，点击“+ 新增”添加。' }) : null,
                entries.length > 0 ? jsx('div', {
                  className: 'env_list',
                  children: entries.map((entry, index) => jsxs('div', {
                    className: 'env_row',
                    key: 'env-row-' + index,
                    children: [
                      jsx('input', {
                        className: 'env_input',
                        placeholder: 'KEY',
                        value: entry.key,
                        onChange: (event) => updateEntry(index, { key: event.target.value }),
                      }),
                      jsx('input', {
                        className: 'env_input',
                        placeholder: entry.secret && entry.value == null
                          ? (entry.storage === 'refs' ? '已存入官方凭据存储，留空保持不变' : '已保存，留空保存＝保持不变')
                          : 'value 或 js:process.env.XXX',
                        type: entry.secret ? 'password' : 'text',
                        value: entry.value ?? '',
                        onChange: (event) => updateEntry(index, { value: event.target.value }),
                      }),
                      jsxs('label', {
                        className: 'env_check',
                        children: [
                          jsx('input', {
                            type: 'checkbox',
                            checked: entry.secret === true,
                            onChange: (event) => updateEntry(index, { secret: event.target.checked }),
                          }),
                          '密钥',
                        ],
                      }),
                      jsx('button', {
                        type: 'button',
                        className: 'env_btnGhost env_btnDanger',
                        onClick: () => removeEntry(index),
                        children: '删除',
                      }),
                    ],
                  }, 'env-row-' + index)),
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
     * DSH ≥0.1.6-alpha.2 的行配置 key：`<bundle 包名>#<行 id>`，行 id 取自 bundle 的
     * cordis.patch.yml。独立安装时 bundle 是本包，装全家桶时是 @hyzyn/dsh-all —— 两个都注册，
     * 未命中的那个只是躺在 ledger 里，不会渲染。
     */
    const ROW_CONFIG_KEYS = [
      '@hyzyn/dsh-env#env-manager',
      '@hyzyn/dsh-all#env-manager',
    ]

    exports.apply = (ctx) => {
      ctx.effect(() => {
        ensureStyle()
        return () => {
          styleEl?.remove()
          styleEl = undefined
        }
      })
      // DSH ≥0.1.6-alpha.2：侧边栏「插件」页里该行的配置页。插槽不存在时 inject 不会触发，
      // 因此在旧版上完全无副作用，一份代码同时兼容两代。
      for (const key of ROW_CONFIG_KEYS) {
        ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
          name: 'plugins.row.config',
          key,
        }, EnvSettingsCard))
      }
      // DSH ≥0.1.6：设置里与「通用设置」平级的「插件配置」页（子 slot 由
      // @hyzyn/dsh-kit-settings 声明）。不传 view，卡片走各自原有的可折叠形态。
      ctx.slots.inject('settings.kit.item', () => ctx.slots.register({
        name: 'settings.kit.item',
        id: 'env-manager',
        order: 10,
        label: () => "环境变量 / 密钥管理",
      }, EnvSettingsCard))
      // DSH ≤0.1.5：设置 → 插件 的「插件配置」标签页，keyed 插槽按 settings 命名空间派发。
      ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
        name: 'settings.plugin.item',
        key: 'env-manager',
        order: 98,
      }, EnvSettingsCard))
    }

    return exports
  },
})
