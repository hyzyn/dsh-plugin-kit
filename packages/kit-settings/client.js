/* eslint-disable */
/**
 * @hyzyn/dsh-kit-settings — 浏览器半体：官方「设置」里与「通用设置」平级的「插件配置」页。
 *
 * 背景：DSH ≥0.1.6-alpha.2 把插件配置搬到了侧边栏「插件」页，设置里那一行只剩只读清单
 * （`settings.plugin.item` 已退役）。设置大类这个扩展点（`settings.section`）官方仍然支持
 * ——官方的「通用设置 / 模型 / 内置插件 / Agent 预设 / 已归档会话」五行都是这么注册的。
 *
 * 本包注册额外一行（id `kit`），并声明子 slot `settings.kit.item`；dsh-plugin-kit 各插件把
 * 自己的卡片注册进该子 slot，由本页渲染。因为不向卡片传 `view`，它们走的是各自原有的
 * 可折叠卡片分支——也就是 0.1.5 时代设置里那个熟悉的样子。
 */
window.__ModuleLoader__.load({
  id: '@hyzyn/dsh-kit-settings',
  factory: (require) => {
    const exports = {}

    const React = require('react')
    const { jsx, jsxs } = require('react/jsx-runtime')

    /* ================================ CSS ================================ */

    const CSS = [
      '.kit_section{display:flex;flex-direction:column;gap:12px;max-width:760px;color:var(--dsw-alias-label-primary)}',
      '.kit_head{display:flex;flex-direction:column;gap:4px}',
      '.kit_title{margin:0;font-size:18px;font-weight:600}',
      '.kit_intro{margin:0;font-size:13px;color:var(--dsw-alias-label-tertiary)}',
      '.kit_list{display:flex;flex-direction:column;gap:10px;margin:0;padding:0}',
      '.kit_note{color:var(--dsw-alias-label-tertiary);font-size:13px;margin:0}',
    ]

    let styleEl

    function ensureStyle() {
      if (styleEl !== undefined && styleEl.isConnected) return
      styleEl = document.createElement('style')
      styleEl.textContent = CSS.join('\n')
      document.head.appendChild(styleEl)
    }

    /* ============================ 设置大类页面 ============================ */

    /**
     * `settings.section` 的一行。子 slot 由本注册的 `children` 声明，框架据此把
     * `renderSlot` 注入本组件的 props。
     */
    function KitSettingsSection(props) {
      const renderSlot = props === undefined ? undefined : props.renderSlot
      let body = null
      if (typeof renderSlot === 'function') {
        try {
          body = renderSlot('settings.kit.item')
        } catch (error) {
          body = jsx('p', {
            className: 'kit_note',
            children: '配置项渲染失败：' + String((error && error.message) || error),
          })
        }
      }
      return jsxs('section', {
        className: 'kit_section',
        children: [
          jsxs('header', {
            className: 'kit_head',
            children: [
              jsx('h2', { className: 'kit_title', children: '插件配置' }),
              jsx('p', {
                className: 'kit_intro',
                children: 'dsh-plugin-kit 插件族的配置入口：环境变量、MCP、Prompt、Profile、RSS、Codegraph、Docker、终端面板。',
              }),
            ],
          }),
          jsx('ul', {
            className: 'kit_list',
            children: body === null
              ? jsx('li', { className: 'kit_note', children: '暂无可用配置项：请先安装至少一个 kit 插件。' })
              : body,
          }),
        ],
      })
    }

    /* ================================ 插件入口 ================================ */

    exports.inject = ['slots']

    exports.apply = (ctx) => {
      ctx.effect(() => {
        ensureStyle()
        return () => {
          styleEl?.remove()
          styleEl = undefined
        }
      })
      // 设置里的一行大类，与「通用设置」平级。
      // 官方契约：`settings.section` 是 list slot，注册项带 id / order / label；
      // 子 slot 通过本次注册的 children 声明，声明即拥有（只有本注册能渲染它）。
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'kit',
        // 15 = 官方「内置插件」，20 = 「Agent 预设」；16 让本行紧随内置插件之后。
        order: 16,
        label: () => '插件配置',
        children: {
          'settings.kit.item': { kind: 'list', scope: 'root' },
        },
      }, KitSettingsSection))
    }

    return exports
  },
})
